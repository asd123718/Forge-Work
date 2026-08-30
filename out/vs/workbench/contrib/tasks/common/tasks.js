import * as nls from "../../../../nls.js";
import * as Types from "../../../../base/common/types.js";
import * as resources from "../../../../base/common/resources.js";
import * as Objects from "../../../../base/common/objects.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { TaskDefinitionRegistry } from "./taskDefinitionRegistry.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
const USER_TASKS_GROUP_KEY = "settings";
const TASK_RUNNING_STATE = new RawContextKey("taskRunning", false, nls.localize("tasks.taskRunningContext", "Whether a task is currently running."));
const TASK_TERMINAL_ACTIVE = new RawContextKey("taskTerminalActive", false, nls.localize("taskTerminalActive", "Whether the active terminal is a task terminal."));
const TASKS_CATEGORY = nls.localize2("tasksCategory", "Tasks");
var ShellQuoting = /* @__PURE__ */ ((ShellQuoting2) => {
  ShellQuoting2[ShellQuoting2["Escape"] = 1] = "Escape";
  ShellQuoting2[ShellQuoting2["Strong"] = 2] = "Strong";
  ShellQuoting2[ShellQuoting2["Weak"] = 3] = "Weak";
  return ShellQuoting2;
})(ShellQuoting || {});
const CUSTOMIZED_TASK_TYPE = "$customized";
((ShellQuoting2) => {
  function from(value) {
    if (!value) {
      return 2 /* Strong */;
    }
    switch (value.toLowerCase()) {
      case "escape":
        return 1 /* Escape */;
      case "strong":
        return 2 /* Strong */;
      case "weak":
        return 3 /* Weak */;
      default:
        return 2 /* Strong */;
    }
  }
  ShellQuoting2.from = from;
})(ShellQuoting || (ShellQuoting = {}));
var CommandOptions;
((CommandOptions2) => {
  CommandOptions2.defaults = { cwd: "${workspaceFolder}" };
})(CommandOptions || (CommandOptions = {}));
var RevealKind = /* @__PURE__ */ ((RevealKind2) => {
  RevealKind2[RevealKind2["Always"] = 1] = "Always";
  RevealKind2[RevealKind2["Silent"] = 2] = "Silent";
  RevealKind2[RevealKind2["Never"] = 3] = "Never";
  return RevealKind2;
})(RevealKind || {});
((RevealKind2) => {
  function fromString(value) {
    switch (value.toLowerCase()) {
      case "always":
        return 1 /* Always */;
      case "silent":
        return 2 /* Silent */;
      case "never":
        return 3 /* Never */;
      default:
        return 1 /* Always */;
    }
  }
  RevealKind2.fromString = fromString;
})(RevealKind || (RevealKind = {}));
var RevealProblemKind = /* @__PURE__ */ ((RevealProblemKind2) => {
  RevealProblemKind2[RevealProblemKind2["Never"] = 1] = "Never";
  RevealProblemKind2[RevealProblemKind2["OnProblem"] = 2] = "OnProblem";
  RevealProblemKind2[RevealProblemKind2["Always"] = 3] = "Always";
  return RevealProblemKind2;
})(RevealProblemKind || {});
((RevealProblemKind2) => {
  function fromString(value) {
    switch (value.toLowerCase()) {
      case "always":
        return 3 /* Always */;
      case "never":
        return 1 /* Never */;
      case "onproblem":
        return 2 /* OnProblem */;
      default:
        return 2 /* OnProblem */;
    }
  }
  RevealProblemKind2.fromString = fromString;
})(RevealProblemKind || (RevealProblemKind = {}));
var PanelKind = /* @__PURE__ */ ((PanelKind2) => {
  PanelKind2[PanelKind2["Shared"] = 1] = "Shared";
  PanelKind2[PanelKind2["Dedicated"] = 2] = "Dedicated";
  PanelKind2[PanelKind2["New"] = 3] = "New";
  return PanelKind2;
})(PanelKind || {});
((PanelKind2) => {
  function fromString(value) {
    switch (value.toLowerCase()) {
      case "shared":
        return 1 /* Shared */;
      case "dedicated":
        return 2 /* Dedicated */;
      case "new":
        return 3 /* New */;
      default:
        return 1 /* Shared */;
    }
  }
  PanelKind2.fromString = fromString;
})(PanelKind || (PanelKind = {}));
var PresentationOptions;
((PresentationOptions2) => {
  PresentationOptions2.defaults = {
    echo: true,
    reveal: 1 /* Always */,
    revealProblems: 1 /* Never */,
    focus: false,
    panel: 1 /* Shared */,
    showReuseMessage: true,
    clear: false,
    preserveTerminalName: false
  };
})(PresentationOptions || (PresentationOptions = {}));
var RuntimeType = /* @__PURE__ */ ((RuntimeType2) => {
  RuntimeType2[RuntimeType2["Shell"] = 1] = "Shell";
  RuntimeType2[RuntimeType2["Process"] = 2] = "Process";
  RuntimeType2[RuntimeType2["CustomExecution"] = 3] = "CustomExecution";
  return RuntimeType2;
})(RuntimeType || {});
((RuntimeType2) => {
  function fromString(value) {
    switch (value.toLowerCase()) {
      case "shell":
        return 1 /* Shell */;
      case "process":
        return 2 /* Process */;
      case "customExecution":
        return 3 /* CustomExecution */;
      default:
        return 2 /* Process */;
    }
  }
  RuntimeType2.fromString = fromString;
  function toString(value) {
    switch (value) {
      case 1 /* Shell */:
        return "shell";
      case 2 /* Process */:
        return "process";
      case 3 /* CustomExecution */:
        return "customExecution";
      default:
        return "process";
    }
  }
  RuntimeType2.toString = toString;
})(RuntimeType || (RuntimeType = {}));
var CommandString;
((CommandString2) => {
  function value(value2) {
    if (Types.isString(value2)) {
      return value2;
    } else {
      return value2.value;
    }
  }
  CommandString2.value = value;
})(CommandString || (CommandString = {}));
var TaskGroup;
((TaskGroup2) => {
  TaskGroup2.Clean = { _id: "clean", isDefault: false };
  TaskGroup2.Build = { _id: "build", isDefault: false };
  TaskGroup2.Rebuild = { _id: "rebuild", isDefault: false };
  TaskGroup2.Test = { _id: "test", isDefault: false };
  function is(value) {
    return value === TaskGroup2.Clean._id || value === TaskGroup2.Build._id || value === TaskGroup2.Rebuild._id || value === TaskGroup2.Test._id;
  }
  TaskGroup2.is = is;
  function from(value) {
    if (value === void 0) {
      return void 0;
    } else if (Types.isString(value)) {
      if (is(value)) {
        return { _id: value, isDefault: false };
      }
      return void 0;
    } else {
      return value;
    }
  }
  TaskGroup2.from = from;
})(TaskGroup || (TaskGroup = {}));
var TaskScope = /* @__PURE__ */ ((TaskScope2) => {
  TaskScope2[TaskScope2["Global"] = 1] = "Global";
  TaskScope2[TaskScope2["Workspace"] = 2] = "Workspace";
  TaskScope2[TaskScope2["Folder"] = 3] = "Folder";
  return TaskScope2;
})(TaskScope || {});
var TaskSourceKind;
((TaskSourceKind2) => {
  TaskSourceKind2.Workspace = "workspace";
  TaskSourceKind2.Extension = "extension";
  TaskSourceKind2.InMemory = "inMemory";
  TaskSourceKind2.WorkspaceFile = "workspaceFile";
  TaskSourceKind2.User = "user";
  function toConfigurationTarget(kind) {
    switch (kind) {
      case TaskSourceKind2.User:
        return ConfigurationTarget.USER;
      case TaskSourceKind2.WorkspaceFile:
        return ConfigurationTarget.WORKSPACE;
      default:
        return ConfigurationTarget.WORKSPACE_FOLDER;
    }
  }
  TaskSourceKind2.toConfigurationTarget = toConfigurationTarget;
})(TaskSourceKind || (TaskSourceKind = {}));
var DependsOrder = /* @__PURE__ */ ((DependsOrder2) => {
  DependsOrder2["parallel"] = "parallel";
  DependsOrder2["sequence"] = "sequence";
  return DependsOrder2;
})(DependsOrder || {});
var RunOnOptions = /* @__PURE__ */ ((RunOnOptions2) => {
  RunOnOptions2[RunOnOptions2["default"] = 1] = "default";
  RunOnOptions2[RunOnOptions2["folderOpen"] = 2] = "folderOpen";
  RunOnOptions2[RunOnOptions2["worktreeCreated"] = 3] = "worktreeCreated";
  return RunOnOptions2;
})(RunOnOptions || {});
var InstancePolicy = /* @__PURE__ */ ((InstancePolicy2) => {
  InstancePolicy2["terminateNewest"] = "terminateNewest";
  InstancePolicy2["terminateOldest"] = "terminateOldest";
  InstancePolicy2["prompt"] = "prompt";
  InstancePolicy2["warn"] = "warn";
  InstancePolicy2["silent"] = "silent";
  return InstancePolicy2;
})(InstancePolicy || {});
var RunOptions;
((RunOptions2) => {
  RunOptions2.defaults = { reevaluateOnRerun: true, runOn: 1 /* default */, instanceLimit: 1, instancePolicy: "prompt" /* prompt */ };
})(RunOptions || (RunOptions = {}));
class CommonTask {
  constructor(id, label, type, runOptions, configurationProperties, source) {
    /**
     * The cached label.
     */
    this._label = "";
    this._id = id;
    if (label) {
      this._label = label;
    }
    if (type) {
      this.type = type;
    }
    this.runOptions = runOptions;
    this.configurationProperties = configurationProperties;
    this._source = source;
  }
  getDefinition(useSource) {
    return void 0;
  }
  getMapKey() {
    return this._id;
  }
  getKey() {
    return void 0;
  }
  getCommonTaskId() {
    const key = { folder: this.getFolderId(), id: this._id };
    return JSON.stringify(key);
  }
  clone() {
    return this.fromObject(Object.assign({}, this));
  }
  getWorkspaceFolder() {
    return void 0;
  }
  getWorkspaceFileName() {
    return void 0;
  }
  getTelemetryKind() {
    return "unknown";
  }
  matches(key, compareId = false) {
    if (key === void 0) {
      return false;
    }
    if (Types.isString(key)) {
      return key === this._label || key === this.configurationProperties.identifier || compareId && key === this._id;
    }
    const identifier = this.getDefinition(true);
    return identifier !== void 0 && identifier._key === key._key;
  }
  getQualifiedLabel() {
    const workspaceFolder = this.getWorkspaceFolder();
    if (workspaceFolder) {
      return `${this._label} (${workspaceFolder.name})`;
    } else {
      return this._label;
    }
  }
  getTaskExecution() {
    const result = {
      id: this._id,
      task: this
    };
    return result;
  }
  addTaskLoadMessages(messages) {
    if (this._taskLoadMessages === void 0) {
      this._taskLoadMessages = [];
    }
    if (messages) {
      this._taskLoadMessages = this._taskLoadMessages.concat(messages);
    }
  }
  get taskLoadMessages() {
    return this._taskLoadMessages;
  }
}
class CustomTask extends CommonTask {
  constructor(id, source, label, type, command, hasDefinedMatchers, runOptions, configurationProperties) {
    super(id, label, void 0, runOptions, configurationProperties, source);
    /**
     * The command configuration
     */
    this.command = {};
    this._source = source;
    this.hasDefinedMatchers = hasDefinedMatchers;
    if (command) {
      this.command = command;
    }
  }
  clone() {
    return new CustomTask(this._id, this._source, this._label, this.type, this.command, this.hasDefinedMatchers, this.runOptions, this.configurationProperties);
  }
  customizes() {
    if (this._source && this._source.customizes) {
      return this._source.customizes;
    }
    return void 0;
  }
  getDefinition(useSource = false) {
    if (useSource && this._source.customizes !== void 0) {
      return this._source.customizes;
    } else {
      let type;
      const commandRuntime = this.command ? this.command.runtime : void 0;
      switch (commandRuntime) {
        case 1 /* Shell */:
          type = "shell";
          break;
        case 2 /* Process */:
          type = "process";
          break;
        case 3 /* CustomExecution */:
          type = "customExecution";
          break;
        case void 0:
          type = "$composite";
          break;
        default:
          throw new Error("Unexpected task runtime");
      }
      const result = {
        type,
        _key: this._id,
        id: this._id
      };
      return result;
    }
  }
  static is(value) {
    return value instanceof CustomTask;
  }
  getMapKey() {
    const workspaceFolder = this._source.config.workspaceFolder;
    return workspaceFolder ? `${workspaceFolder.uri.toString()}|${this._id}|${this.instance}` : `${this._id}|${this.instance}`;
  }
  getFolderId() {
    return this._source.kind === TaskSourceKind.User ? USER_TASKS_GROUP_KEY : this._source.config.workspaceFolder?.uri.toString();
  }
  getCommonTaskId() {
    return this._source.customizes ? super.getCommonTaskId() : this.getKey() ?? super.getCommonTaskId();
  }
  /**
   * @returns A key representing the task
   */
  getKey() {
    const workspaceFolder = this.getFolderId();
    if (!workspaceFolder) {
      return void 0;
    }
    let id = this.configurationProperties.identifier;
    if (this._source.kind !== TaskSourceKind.Workspace) {
      id += this._source.kind;
    }
    const key = { type: CUSTOMIZED_TASK_TYPE, folder: workspaceFolder, id };
    return JSON.stringify(key);
  }
  getWorkspaceFolder() {
    return this._source.config.workspaceFolder;
  }
  getWorkspaceFileName() {
    return this._source.config.workspace && this._source.config.workspace.configuration ? resources.basename(this._source.config.workspace.configuration) : void 0;
  }
  getTelemetryKind() {
    if (this._source.customizes) {
      return "workspace>extension";
    } else {
      return "workspace";
    }
  }
  fromObject(object) {
    const obj = object;
    return new CustomTask(obj._id, obj._source, obj._label, obj.type, obj.command, obj.hasDefinedMatchers, obj.runOptions, obj.configurationProperties);
  }
}
class ConfiguringTask extends CommonTask {
  constructor(id, source, label, type, configures, runOptions, configurationProperties) {
    super(id, label, type, runOptions, configurationProperties, source);
    this._source = source;
    this.configures = configures;
  }
  static is(value) {
    return value instanceof ConfiguringTask;
  }
  fromObject(object) {
    return object;
  }
  getDefinition() {
    return this.configures;
  }
  getWorkspaceFileName() {
    return this._source.config.workspace && this._source.config.workspace.configuration ? resources.basename(this._source.config.workspace.configuration) : void 0;
  }
  getWorkspaceFolder() {
    return this._source.config.workspaceFolder;
  }
  getFolderId() {
    return this._source.kind === TaskSourceKind.User ? USER_TASKS_GROUP_KEY : this._source.config.workspaceFolder?.uri.toString();
  }
  getKey() {
    const workspaceFolder = this.getFolderId();
    if (!workspaceFolder) {
      return void 0;
    }
    let id = this.configurationProperties.identifier;
    if (this._source.kind !== TaskSourceKind.Workspace) {
      id += this._source.kind;
    }
    const key = { type: CUSTOMIZED_TASK_TYPE, folder: workspaceFolder, id };
    return JSON.stringify(key);
  }
}
class ContributedTask extends CommonTask {
  constructor(id, source, label, type, defines, command, hasDefinedMatchers, runOptions, configurationProperties) {
    super(id, label, type, runOptions, configurationProperties, source);
    this.defines = defines;
    this.hasDefinedMatchers = hasDefinedMatchers;
    this.command = command;
    this.icon = configurationProperties.icon;
    this.hide = configurationProperties.hide;
  }
  clone() {
    return new ContributedTask(this._id, this._source, this._label, this.type, this.defines, this.command, this.hasDefinedMatchers, this.runOptions, this.configurationProperties);
  }
  getDefinition() {
    return this.defines;
  }
  static is(value) {
    return value instanceof ContributedTask;
  }
  getMapKey() {
    const workspaceFolder = this._source.workspaceFolder;
    return workspaceFolder ? `${this._source.scope.toString()}|${workspaceFolder.uri.toString()}|${this._id}|${this.instance}` : `${this._source.scope.toString()}|${this._id}|${this.instance}`;
  }
  getFolderId() {
    if (this._source.scope === 3 /* Folder */ && this._source.workspaceFolder) {
      return this._source.workspaceFolder.uri.toString();
    }
    return void 0;
  }
  getKey() {
    const key = { type: "contributed", scope: this._source.scope, id: this._id };
    key.folder = this.getFolderId();
    return JSON.stringify(key);
  }
  getWorkspaceFolder() {
    return this._source.workspaceFolder;
  }
  getTelemetryKind() {
    return "extension";
  }
  fromObject(object) {
    const obj = object;
    return new ContributedTask(obj._id, obj._source, obj._label, obj.type, obj.defines, obj.command, obj.hasDefinedMatchers, obj.runOptions, obj.configurationProperties);
  }
}
class InMemoryTask extends CommonTask {
  constructor(id, source, label, type, runOptions, configurationProperties) {
    super(id, label, type, runOptions, configurationProperties, source);
    this._source = source;
  }
  clone() {
    return new InMemoryTask(this._id, this._source, this._label, this.type, this.runOptions, this.configurationProperties);
  }
  static is(value) {
    return value instanceof InMemoryTask;
  }
  getTelemetryKind() {
    return "composite";
  }
  getMapKey() {
    return `${this._id}|${this.instance}`;
  }
  getFolderId() {
    return void 0;
  }
  fromObject(object) {
    const obj = object;
    return new InMemoryTask(obj._id, obj._source, obj._label, obj.type, obj.runOptions, obj.configurationProperties);
  }
}
var ExecutionEngine = /* @__PURE__ */ ((ExecutionEngine2) => {
  ExecutionEngine2[ExecutionEngine2["Process"] = 1] = "Process";
  ExecutionEngine2[ExecutionEngine2["Terminal"] = 2] = "Terminal";
  return ExecutionEngine2;
})(ExecutionEngine || {});
((ExecutionEngine2) => {
  ExecutionEngine2._default = 2 /* Terminal */;
})(ExecutionEngine || (ExecutionEngine = {}));
var JsonSchemaVersion = /* @__PURE__ */ ((JsonSchemaVersion2) => {
  JsonSchemaVersion2[JsonSchemaVersion2["V0_1_0"] = 1] = "V0_1_0";
  JsonSchemaVersion2[JsonSchemaVersion2["V2_0_0"] = 2] = "V2_0_0";
  return JsonSchemaVersion2;
})(JsonSchemaVersion || {});
class TaskSorter {
  constructor(workspaceFolders) {
    this._order = /* @__PURE__ */ new Map();
    for (let i = 0; i < workspaceFolders.length; i++) {
      this._order.set(workspaceFolders[i].uri.toString(), i);
    }
  }
  compare(a, b) {
    const aw = a.getWorkspaceFolder();
    const bw = b.getWorkspaceFolder();
    if (aw && bw) {
      let ai = this._order.get(aw.uri.toString());
      ai = ai === void 0 ? 0 : ai + 1;
      let bi = this._order.get(bw.uri.toString());
      bi = bi === void 0 ? 0 : bi + 1;
      if (ai === bi) {
        return a._label.localeCompare(b._label);
      } else {
        return ai - bi;
      }
    } else if (!aw && bw) {
      return -1;
    } else if (aw && !bw) {
      return 1;
    } else {
      return 0;
    }
  }
}
var TaskRunType = /* @__PURE__ */ ((TaskRunType2) => {
  TaskRunType2["SingleRun"] = "singleRun";
  TaskRunType2["Background"] = "background";
  return TaskRunType2;
})(TaskRunType || {});
var TaskEventKind = /* @__PURE__ */ ((TaskEventKind2) => {
  TaskEventKind2["Changed"] = "changed";
  TaskEventKind2["ProcessStarted"] = "processStarted";
  TaskEventKind2["ProcessEnded"] = "processEnded";
  TaskEventKind2["Terminated"] = "terminated";
  TaskEventKind2["Start"] = "start";
  TaskEventKind2["AcquiredInput"] = "acquiredInput";
  TaskEventKind2["DependsOnStarted"] = "dependsOnStarted";
  TaskEventKind2["Active"] = "active";
  TaskEventKind2["Inactive"] = "inactive";
  TaskEventKind2["End"] = "end";
  TaskEventKind2["ProblemMatcherStarted"] = "problemMatcherStarted";
  TaskEventKind2["ProblemMatcherEnded"] = "problemMatcherEnded";
  TaskEventKind2["ProblemMatcherFoundErrors"] = "problemMatcherFoundErrors";
  return TaskEventKind2;
})(TaskEventKind || {});
var TaskRunSource = /* @__PURE__ */ ((TaskRunSource2) => {
  TaskRunSource2[TaskRunSource2["System"] = 0] = "System";
  TaskRunSource2[TaskRunSource2["User"] = 1] = "User";
  TaskRunSource2[TaskRunSource2["FolderOpen"] = 2] = "FolderOpen";
  TaskRunSource2[TaskRunSource2["ConfigurationChange"] = 3] = "ConfigurationChange";
  TaskRunSource2[TaskRunSource2["Reconnect"] = 4] = "Reconnect";
  TaskRunSource2[TaskRunSource2["ChatAgent"] = 5] = "ChatAgent";
  return TaskRunSource2;
})(TaskRunSource || {});
var TaskEvent;
((TaskEvent2) => {
  function common(task) {
    return {
      taskId: task._id,
      taskName: task.configurationProperties.name,
      runType: task.configurationProperties.isBackground ? "background" /* Background */ : "singleRun" /* SingleRun */,
      group: task.configurationProperties.group,
      __task: task
    };
  }
  function start(task, terminalId, resolvedVariables) {
    return {
      ...common(task),
      kind: "start" /* Start */,
      terminalId,
      resolvedVariables
    };
  }
  TaskEvent2.start = start;
  function processStarted(task, terminalId, processId) {
    return {
      ...common(task),
      kind: "processStarted" /* ProcessStarted */,
      terminalId,
      processId
    };
  }
  TaskEvent2.processStarted = processStarted;
  function processEnded(task, terminalId, exitCode, durationMs) {
    return {
      ...common(task),
      kind: "processEnded" /* ProcessEnded */,
      terminalId,
      exitCode,
      durationMs
    };
  }
  TaskEvent2.processEnded = processEnded;
  function inactive(task, terminalId, durationMs) {
    return {
      ...common(task),
      kind: "inactive" /* Inactive */,
      terminalId,
      durationMs
    };
  }
  TaskEvent2.inactive = inactive;
  function terminated(task, terminalId, exitReason) {
    return {
      ...common(task),
      kind: "terminated" /* Terminated */,
      exitReason,
      terminalId
    };
  }
  TaskEvent2.terminated = terminated;
  function general(kind, task, terminalId) {
    return {
      ...common(task),
      kind,
      terminalId
    };
  }
  TaskEvent2.general = general;
  function problemMatcherEnded(task, hasErrors, terminalId) {
    return {
      ...common(task),
      kind: "problemMatcherEnded" /* ProblemMatcherEnded */,
      hasErrors
    };
  }
  TaskEvent2.problemMatcherEnded = problemMatcherEnded;
  function changed() {
    return { kind: "changed" /* Changed */ };
  }
  TaskEvent2.changed = changed;
})(TaskEvent || (TaskEvent = {}));
var KeyedTaskIdentifier;
((KeyedTaskIdentifier2) => {
  function sortedStringify(literal) {
    const keys = Object.keys(literal).sort();
    let result = "";
    for (const key of keys) {
      let stringified = literal[key];
      if (stringified instanceof Object) {
        stringified = sortedStringify(stringified);
      } else if (typeof stringified === "string") {
        stringified = stringified.replace(/,/g, ",,");
      }
      result += key + "," + stringified + ",";
    }
    return result;
  }
  function create(value) {
    const resultKey = sortedStringify(value);
    const result = { _key: resultKey, type: value.taskType };
    Object.assign(result, value);
    return result;
  }
  KeyedTaskIdentifier2.create = create;
})(KeyedTaskIdentifier || (KeyedTaskIdentifier = {}));
var TaskSettingId = /* @__PURE__ */ ((TaskSettingId2) => {
  TaskSettingId2["AutoDetect"] = "task.autoDetect";
  TaskSettingId2["SaveBeforeRun"] = "task.saveBeforeRun";
  TaskSettingId2["ShowDecorations"] = "task.showDecorations";
  TaskSettingId2["ProblemMatchersNeverPrompt"] = "task.problemMatchers.neverPrompt";
  TaskSettingId2["SlowProviderWarning"] = "task.slowProviderWarning";
  TaskSettingId2["QuickOpenHistory"] = "task.quickOpen.history";
  TaskSettingId2["QuickOpenDetail"] = "task.quickOpen.detail";
  TaskSettingId2["QuickOpenSkip"] = "task.quickOpen.skip";
  TaskSettingId2["QuickOpenShowAll"] = "task.quickOpen.showAll";
  TaskSettingId2["AllowAutomaticTasks"] = "task.allowAutomaticTasks";
  TaskSettingId2["Reconnection"] = "task.reconnection";
  TaskSettingId2["VerboseLogging"] = "task.verboseLogging";
  TaskSettingId2["NotifyWindowOnTaskCompletion"] = "task.notifyWindowOnTaskCompletion";
  return TaskSettingId2;
})(TaskSettingId || {});
var TasksSchemaProperties = /* @__PURE__ */ ((TasksSchemaProperties2) => {
  TasksSchemaProperties2["Tasks"] = "tasks";
  TasksSchemaProperties2["SuppressTaskName"] = "tasks.suppressTaskName";
  TasksSchemaProperties2["Windows"] = "tasks.windows";
  TasksSchemaProperties2["Osx"] = "tasks.osx";
  TasksSchemaProperties2["Linux"] = "tasks.linux";
  TasksSchemaProperties2["ShowOutput"] = "tasks.showOutput";
  TasksSchemaProperties2["IsShellCommand"] = "tasks.isShellCommand";
  TasksSchemaProperties2["ServiceTestSetting"] = "tasks.service.testSetting";
  return TasksSchemaProperties2;
})(TasksSchemaProperties || {});
var TaskDefinition;
((TaskDefinition2) => {
  function createTaskIdentifier(external, reporter) {
    const definition = TaskDefinitionRegistry.get(external.type);
    if (definition === void 0) {
      const copy = Objects.deepClone(external);
      delete copy._key;
      return KeyedTaskIdentifier.create(copy);
    }
    const literal = /* @__PURE__ */ Object.create(null);
    literal.type = definition.taskType;
    const required = /* @__PURE__ */ new Set();
    definition.required.forEach((element) => required.add(element));
    const properties = definition.properties;
    for (const property of Object.keys(properties)) {
      const value = external[property];
      if (value !== void 0 && value !== null) {
        literal[property] = value;
      } else if (required.has(property)) {
        const schema = properties[property];
        if (schema.default !== void 0) {
          literal[property] = Objects.deepClone(schema.default);
        } else {
          switch (schema.type) {
            case "boolean":
              literal[property] = false;
              break;
            case "number":
            case "integer":
              literal[property] = 0;
              break;
            case "string":
              literal[property] = "";
              break;
            default:
              reporter.error(nls.localize(
                "TaskDefinition.missingRequiredProperty",
                "Error: the task identifier '{0}' is missing the required property '{1}'. The task identifier will be ignored.",
                JSON.stringify(external, void 0, 0),
                property
              ));
              return void 0;
          }
        }
      }
    }
    return KeyedTaskIdentifier.create(literal);
  }
  TaskDefinition2.createTaskIdentifier = createTaskIdentifier;
})(TaskDefinition || (TaskDefinition = {}));
const rerunTaskIcon = registerIcon("rerun-task", Codicon.refresh, nls.localize("rerunTaskIcon", "View icon of the rerun task."));
const RerunForActiveTerminalCommandId = "workbench.action.tasks.rerunForActiveTerminal";
const RerunAllRunningTasksCommandId = "workbench.action.tasks.rerunAllRunningTasks";
export {
  CUSTOMIZED_TASK_TYPE,
  CommandOptions,
  CommandString,
  CommonTask,
  ConfiguringTask,
  ContributedTask,
  CustomTask,
  DependsOrder,
  ExecutionEngine,
  InMemoryTask,
  InstancePolicy,
  JsonSchemaVersion,
  KeyedTaskIdentifier,
  PanelKind,
  PresentationOptions,
  RerunAllRunningTasksCommandId,
  RerunForActiveTerminalCommandId,
  RevealKind,
  RevealProblemKind,
  RunOnOptions,
  RunOptions,
  RuntimeType,
  ShellQuoting,
  TASKS_CATEGORY,
  TASK_RUNNING_STATE,
  TASK_TERMINAL_ACTIVE,
  TaskDefinition,
  TaskEvent,
  TaskEventKind,
  TaskGroup,
  TaskRunSource,
  TaskRunType,
  TaskScope,
  TaskSettingId,
  TaskSorter,
  TaskSourceKind,
  TasksSchemaProperties,
  USER_TASKS_GROUP_KEY,
  rerunTaskIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxjb21tb25cXHRhc2tzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBUeXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgKiBhcyBPYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgVXJpQ29tcG9uZW50cywgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuaW1wb3J0IHsgUHJvYmxlbU1hdGNoZXIgfSBmcm9tICcuL3Byb2JsZW1NYXRjaGVyLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBSYXdDb250ZXh0S2V5LCBDb250ZXh0S2V5RXhwcmVzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgVGFza0RlZmluaXRpb25SZWdpc3RyeSB9IGZyb20gJy4vdGFza0RlZmluaXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsRXhpdFJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5cblxuXG5leHBvcnQgY29uc3QgVVNFUl9UQVNLU19HUk9VUF9LRVkgPSAnc2V0dGluZ3MnO1xuXG5leHBvcnQgY29uc3QgVEFTS19SVU5OSU5HX1NUQVRFID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Rhc2tSdW5uaW5nJywgZmFsc2UsIG5scy5sb2NhbGl6ZSgndGFza3MudGFza1J1bm5pbmdDb250ZXh0JywgXCJXaGV0aGVyIGEgdGFzayBpcyBjdXJyZW50bHkgcnVubmluZy5cIikpO1xuLyoqIFdoZXRoZXIgdGhlIGFjdGl2ZSB0ZXJtaW5hbCBpcyBhIHRhc2sgdGVybWluYWwuICovXG5leHBvcnQgY29uc3QgVEFTS19URVJNSU5BTF9BQ1RJVkUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndGFza1Rlcm1pbmFsQWN0aXZlJywgZmFsc2UsIG5scy5sb2NhbGl6ZSgndGFza1Rlcm1pbmFsQWN0aXZlJywgXCJXaGV0aGVyIHRoZSBhY3RpdmUgdGVybWluYWwgaXMgYSB0YXNrIHRlcm1pbmFsLlwiKSk7XG5leHBvcnQgY29uc3QgVEFTS1NfQ0FURUdPUlkgPSBubHMubG9jYWxpemUyKCd0YXNrc0NhdGVnb3J5JywgXCJUYXNrc1wiKTtcblxuZXhwb3J0IGVudW0gU2hlbGxRdW90aW5nIHtcblx0LyoqXG5cdCAqIFVzZSBjaGFyYWN0ZXIgZXNjYXBpbmcuXG5cdCAqL1xuXHRFc2NhcGUgPSAxLFxuXG5cdC8qKlxuXHQgKiBVc2Ugc3Ryb25nIHF1b3Rpbmdcblx0ICovXG5cdFN0cm9uZyA9IDIsXG5cblx0LyoqXG5cdCAqIFVzZSB3ZWFrIHF1b3RpbmcuXG5cdCAqL1xuXHRXZWFrID0gMyxcbn1cblxuZXhwb3J0IGNvbnN0IENVU1RPTUlaRURfVEFTS19UWVBFID0gJyRjdXN0b21pemVkJztcblxuZXhwb3J0IG5hbWVzcGFjZSBTaGVsbFF1b3Rpbmcge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0aGlzOiB2b2lkLCB2YWx1ZTogc3RyaW5nKTogU2hlbGxRdW90aW5nIHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gU2hlbGxRdW90aW5nLlN0cm9uZztcblx0XHR9XG5cdFx0c3dpdGNoICh2YWx1ZS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0XHRjYXNlICdlc2NhcGUnOlxuXHRcdFx0XHRyZXR1cm4gU2hlbGxRdW90aW5nLkVzY2FwZTtcblx0XHRcdGNhc2UgJ3N0cm9uZyc6XG5cdFx0XHRcdHJldHVybiBTaGVsbFF1b3RpbmcuU3Ryb25nO1xuXHRcdFx0Y2FzZSAnd2Vhayc6XG5cdFx0XHRcdHJldHVybiBTaGVsbFF1b3RpbmcuV2Vhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBTaGVsbFF1b3RpbmcuU3Ryb25nO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTaGVsbFF1b3RpbmdPcHRpb25zIHtcblx0LyoqXG5cdCAqIFRoZSBjaGFyYWN0ZXIgdXNlZCB0byBkbyBjaGFyYWN0ZXIgZXNjYXBpbmcuXG5cdCAqL1xuXHRlc2NhcGU/OiBzdHJpbmcgfCB7XG5cdFx0ZXNjYXBlQ2hhcjogc3RyaW5nO1xuXHRcdGNoYXJzVG9Fc2NhcGU6IHN0cmluZztcblx0fTtcblxuXHQvKipcblx0ICogVGhlIGNoYXJhY3RlciB1c2VkIGZvciBzdHJpbmcgcXVvdGluZy5cblx0ICovXG5cdHN0cm9uZz86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIGNoYXJhY3RlciB1c2VkIGZvciB3ZWFrIHF1b3RpbmcuXG5cdCAqL1xuXHR3ZWFrPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTaGVsbENvbmZpZ3VyYXRpb24ge1xuXHQvKipcblx0ICogVGhlIHNoZWxsIGV4ZWN1dGFibGUuXG5cdCAqL1xuXHRleGVjdXRhYmxlPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgYXJndW1lbnRzIHRvIGJlIHBhc3NlZCB0byB0aGUgc2hlbGwgZXhlY3V0YWJsZS5cblx0ICovXG5cdGFyZ3M/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogV2hpY2gga2luZCBvZiBxdW90ZXMgdGhlIHNoZWxsIHN1cHBvcnRzLlxuXHQgKi9cblx0cXVvdGluZz86IElTaGVsbFF1b3RpbmdPcHRpb25zO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbW1hbmRPcHRpb25zIHtcblxuXHQvKipcblx0ICogVGhlIHNoZWxsIHRvIHVzZSBpZiB0aGUgdGFzayBpcyBhIHNoZWxsIGNvbW1hbmQuXG5cdCAqL1xuXHRzaGVsbD86IElTaGVsbENvbmZpZ3VyYXRpb247XG5cblx0LyoqXG5cdCAqIFRoZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IG9mIHRoZSBleGVjdXRlZCBwcm9ncmFtIG9yIHNoZWxsLlxuXHQgKiBJZiBvbWl0dGVkIFZTQ29kZSdzIGN1cnJlbnQgd29ya3NwYWNlIHJvb3QgaXMgdXNlZC5cblx0ICovXG5cdGN3ZD86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIGVudmlyb25tZW50IG9mIHRoZSBleGVjdXRlZCBwcm9ncmFtIG9yIHNoZWxsLiBJZiBvbWl0dGVkXG5cdCAqIHRoZSBwYXJlbnQgcHJvY2VzcycgZW52aXJvbm1lbnQgaXMgdXNlZC5cblx0ICovXG5cdGVudj86IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29tbWFuZE9wdGlvbnMge1xuXHRleHBvcnQgY29uc3QgZGVmYXVsdHM6IENvbW1hbmRPcHRpb25zID0geyBjd2Q6ICcke3dvcmtzcGFjZUZvbGRlcn0nIH07XG59XG5cbmV4cG9ydCBlbnVtIFJldmVhbEtpbmQge1xuXHQvKipcblx0ICogQWx3YXlzIGJyaW5ncyB0aGUgdGVybWluYWwgdG8gZnJvbnQgaWYgdGhlIHRhc2sgaXMgZXhlY3V0ZWQuXG5cdCAqL1xuXHRBbHdheXMgPSAxLFxuXG5cdC8qKlxuXHQgKiBPbmx5IGJyaW5ncyB0aGUgdGVybWluYWwgdG8gZnJvbnQgaWYgYSBwcm9ibGVtIGlzIGRldGVjdGVkIGV4ZWN1dGluZyB0aGUgdGFza1xuXHQgKiBlLmcuIHRoZSB0YXNrIGNvdWxkbid0IGJlIHN0YXJ0ZWQsXG5cdCAqIHRoZSB0YXNrIGVuZGVkIHdpdGggYW4gZXhpdCBjb2RlIG90aGVyIHRoYW4gemVybyxcblx0ICogb3IgdGhlIHByb2JsZW0gbWF0Y2hlciBmb3VuZCBhbiBlcnJvci5cblx0ICovXG5cdFNpbGVudCA9IDIsXG5cblx0LyoqXG5cdCAqIFRoZSB0ZXJtaW5hbCBuZXZlciBjb21lcyB0byBmcm9udCB3aGVuIHRoZSB0YXNrIGlzIGV4ZWN1dGVkLlxuXHQgKi9cblx0TmV2ZXIgPSAzXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUmV2ZWFsS2luZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU3RyaW5nKHRoaXM6IHZvaWQsIHZhbHVlOiBzdHJpbmcpOiBSZXZlYWxLaW5kIHtcblx0XHRzd2l0Y2ggKHZhbHVlLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdGNhc2UgJ2Fsd2F5cyc6XG5cdFx0XHRcdHJldHVybiBSZXZlYWxLaW5kLkFsd2F5cztcblx0XHRcdGNhc2UgJ3NpbGVudCc6XG5cdFx0XHRcdHJldHVybiBSZXZlYWxLaW5kLlNpbGVudDtcblx0XHRcdGNhc2UgJ25ldmVyJzpcblx0XHRcdFx0cmV0dXJuIFJldmVhbEtpbmQuTmV2ZXI7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gUmV2ZWFsS2luZC5BbHdheXM7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFJldmVhbFByb2JsZW1LaW5kIHtcblx0LyoqXG5cdCAqIE5ldmVyIHJldmVhbHMgdGhlIHByb2JsZW1zIHBhbmVsIHdoZW4gdGhpcyB0YXNrIGlzIGV4ZWN1dGVkLlxuXHQgKi9cblx0TmV2ZXIgPSAxLFxuXG5cblx0LyoqXG5cdCAqIE9ubHkgcmV2ZWFscyB0aGUgcHJvYmxlbXMgcGFuZWwgaWYgYSBwcm9ibGVtIGlzIGZvdW5kLlxuXHQgKi9cblx0T25Qcm9ibGVtID0gMixcblxuXHQvKipcblx0ICogTmV2ZXIgcmV2ZWFscyB0aGUgcHJvYmxlbXMgcGFuZWwgd2hlbiB0aGlzIHRhc2sgaXMgZXhlY3V0ZWQuXG5cdCAqL1xuXHRBbHdheXMgPSAzXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUmV2ZWFsUHJvYmxlbUtpbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVN0cmluZyh0aGlzOiB2b2lkLCB2YWx1ZTogc3RyaW5nKTogUmV2ZWFsUHJvYmxlbUtpbmQge1xuXHRcdHN3aXRjaCAodmFsdWUudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0Y2FzZSAnYWx3YXlzJzpcblx0XHRcdFx0cmV0dXJuIFJldmVhbFByb2JsZW1LaW5kLkFsd2F5cztcblx0XHRcdGNhc2UgJ25ldmVyJzpcblx0XHRcdFx0cmV0dXJuIFJldmVhbFByb2JsZW1LaW5kLk5ldmVyO1xuXHRcdFx0Y2FzZSAnb25wcm9ibGVtJzpcblx0XHRcdFx0cmV0dXJuIFJldmVhbFByb2JsZW1LaW5kLk9uUHJvYmxlbTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBSZXZlYWxQcm9ibGVtS2luZC5PblByb2JsZW07XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFBhbmVsS2luZCB7XG5cblx0LyoqXG5cdCAqIFNoYXJlcyBhIHBhbmVsIHdpdGggb3RoZXIgdGFza3MuIFRoaXMgaXMgdGhlIGRlZmF1bHQuXG5cdCAqL1xuXHRTaGFyZWQgPSAxLFxuXG5cdC8qKlxuXHQgKiBVc2VzIGEgZGVkaWNhdGVkIHBhbmVsIGZvciB0aGlzIHRhc2tzLiBUaGUgcGFuZWwgaXMgbm90XG5cdCAqIHNoYXJlZCB3aXRoIG90aGVyIHRhc2tzLlxuXHQgKi9cblx0RGVkaWNhdGVkID0gMixcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBwYW5lbCB3aGVuZXZlciB0aGlzIHRhc2sgaXMgZXhlY3V0ZWQuXG5cdCAqL1xuXHROZXcgPSAzXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUGFuZWxLaW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TdHJpbmcodmFsdWU6IHN0cmluZyk6IFBhbmVsS2luZCB7XG5cdFx0c3dpdGNoICh2YWx1ZS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0XHRjYXNlICdzaGFyZWQnOlxuXHRcdFx0XHRyZXR1cm4gUGFuZWxLaW5kLlNoYXJlZDtcblx0XHRcdGNhc2UgJ2RlZGljYXRlZCc6XG5cdFx0XHRcdHJldHVybiBQYW5lbEtpbmQuRGVkaWNhdGVkO1xuXHRcdFx0Y2FzZSAnbmV3Jzpcblx0XHRcdFx0cmV0dXJuIFBhbmVsS2luZC5OZXc7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gUGFuZWxLaW5kLlNoYXJlZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJlc2VudGF0aW9uT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSB0YXNrIG91dHB1dCBpcyByZXZlYWwgaW4gdGhlIHVzZXIgaW50ZXJmYWNlLlxuXHQgKiBEZWZhdWx0cyB0byBgUmV2ZWFsS2luZC5BbHdheXNgLlxuXHQgKi9cblx0cmV2ZWFsOiBSZXZlYWxLaW5kO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBwcm9ibGVtcyBwYW5lIGlzIHJldmVhbGVkIHdoZW4gcnVubmluZyB0aGlzIHRhc2sgb3Igbm90LlxuXHQgKiBEZWZhdWx0cyB0byBgUmV2ZWFsUHJvYmxlbUtpbmQuTmV2ZXJgLlxuXHQgKi9cblx0cmV2ZWFsUHJvYmxlbXM6IFJldmVhbFByb2JsZW1LaW5kO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBjb21tYW5kIGFzc29jaWF0ZWQgd2l0aCB0aGUgdGFzayBpcyBlY2hvZWRcblx0ICogaW4gdGhlIHVzZXIgaW50ZXJmYWNlLlxuXHQgKi9cblx0ZWNobzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgcGFuZWwgc2hvd2luZyB0aGUgdGFzayBvdXRwdXQgaXMgdGFraW5nIGZvY3VzLlxuXHQgKi9cblx0Zm9jdXM6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIGlmIHRoZSB0YXNrIHBhbmVsIGlzIHVzZWQgZm9yIHRoaXMgdGFzayBvbmx5IChkZWRpY2F0ZWQpLFxuXHQgKiBzaGFyZWQgYmV0d2VlbiB0YXNrcyAoc2hhcmVkKSBvciBpZiBhIG5ldyBwYW5lbCBpcyBjcmVhdGVkIG9uXG5cdCAqIGV2ZXJ5IHRhc2sgZXhlY3V0aW9uIChuZXcpLiBEZWZhdWx0cyB0byBgVGFza0luc3RhbmNlS2luZC5TaGFyZWRgXG5cdCAqL1xuXHRwYW5lbDogUGFuZWxLaW5kO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRvIHNob3cgdGhlIFwiVGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MsIHByZXNzIGFueSBrZXkgdG8gY2xvc2UgaXRcIiBtZXNzYWdlLlxuXHQgKi9cblx0c2hvd1JldXNlTWVzc2FnZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0byBjbGVhciB0aGUgdGVybWluYWwgYmVmb3JlIGV4ZWN1dGluZyB0aGUgdGFzay5cblx0ICovXG5cdGNsZWFyOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSB0YXNrIGlzIGV4ZWN1dGVkIGluIGEgc3BlY2lmaWMgdGVybWluYWwgZ3JvdXAgdXNpbmcgc3BsaXQgcGFuZXMuXG5cdCAqL1xuXHRncm91cD86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwgdGhhdCB0aGUgdGFzayBydW5zIGluIGlzIGNsb3NlZCB3aGVuIHRoZSB0YXNrIGNvbXBsZXRlcy5cblx0ICovXG5cdGNsb3NlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0byBwcmVzZXJ2ZSB0aGUgdGFzayBuYW1lIGluIHRoZSB0ZXJtaW5hbCBhZnRlciB0YXNrIGNvbXBsZXRpb24uXG5cdCAqL1xuXHRwcmVzZXJ2ZVRlcm1pbmFsTmFtZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUHJlc2VudGF0aW9uT3B0aW9ucyB7XG5cdGV4cG9ydCBjb25zdCBkZWZhdWx0czogSVByZXNlbnRhdGlvbk9wdGlvbnMgPSB7XG5cdFx0ZWNobzogdHJ1ZSwgcmV2ZWFsOiBSZXZlYWxLaW5kLkFsd2F5cywgcmV2ZWFsUHJvYmxlbXM6IFJldmVhbFByb2JsZW1LaW5kLk5ldmVyLCBmb2N1czogZmFsc2UsIHBhbmVsOiBQYW5lbEtpbmQuU2hhcmVkLCBzaG93UmV1c2VNZXNzYWdlOiB0cnVlLCBjbGVhcjogZmFsc2UsIHByZXNlcnZlVGVybWluYWxOYW1lOiBmYWxzZVxuXHR9O1xufVxuXG5leHBvcnQgZW51bSBSdW50aW1lVHlwZSB7XG5cdFNoZWxsID0gMSxcblx0UHJvY2VzcyA9IDIsXG5cdEN1c3RvbUV4ZWN1dGlvbiA9IDNcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBSdW50aW1lVHlwZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU3RyaW5nKHZhbHVlOiBzdHJpbmcpOiBSdW50aW1lVHlwZSB7XG5cdFx0c3dpdGNoICh2YWx1ZS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0XHRjYXNlICdzaGVsbCc6XG5cdFx0XHRcdHJldHVybiBSdW50aW1lVHlwZS5TaGVsbDtcblx0XHRcdGNhc2UgJ3Byb2Nlc3MnOlxuXHRcdFx0XHRyZXR1cm4gUnVudGltZVR5cGUuUHJvY2Vzcztcblx0XHRcdGNhc2UgJ2N1c3RvbUV4ZWN1dGlvbic6XG5cdFx0XHRcdHJldHVybiBSdW50aW1lVHlwZS5DdXN0b21FeGVjdXRpb247XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gUnVudGltZVR5cGUuUHJvY2Vzcztcblx0XHR9XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvU3RyaW5nKHZhbHVlOiBSdW50aW1lVHlwZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSBSdW50aW1lVHlwZS5TaGVsbDogcmV0dXJuICdzaGVsbCc7XG5cdFx0XHRjYXNlIFJ1bnRpbWVUeXBlLlByb2Nlc3M6IHJldHVybiAncHJvY2Vzcyc7XG5cdFx0XHRjYXNlIFJ1bnRpbWVUeXBlLkN1c3RvbUV4ZWN1dGlvbjogcmV0dXJuICdjdXN0b21FeGVjdXRpb24nO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuICdwcm9jZXNzJztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUXVvdGVkU3RyaW5nIHtcblx0dmFsdWU6IHN0cmluZztcblx0cXVvdGluZzogU2hlbGxRdW90aW5nO1xufVxuXG5leHBvcnQgdHlwZSBDb21tYW5kU3RyaW5nID0gc3RyaW5nIHwgSVF1b3RlZFN0cmluZztcblxuZXhwb3J0IG5hbWVzcGFjZSBDb21tYW5kU3RyaW5nIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHZhbHVlKHZhbHVlOiBDb21tYW5kU3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB2YWx1ZS52YWx1ZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tbWFuZENvbmZpZ3VyYXRpb24ge1xuXG5cdC8qKlxuXHQgKiBUaGUgdGFzayB0eXBlXG5cdCAqL1xuXHRydW50aW1lPzogUnVudGltZVR5cGU7XG5cblx0LyoqXG5cdCAqIFRoZSBjb21tYW5kIHRvIGV4ZWN1dGVcblx0ICovXG5cdG5hbWU/OiBDb21tYW5kU3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBBZGRpdGlvbmFsIGNvbW1hbmQgb3B0aW9ucy5cblx0ICovXG5cdG9wdGlvbnM/OiBDb21tYW5kT3B0aW9ucztcblxuXHQvKipcblx0ICogQ29tbWFuZCBhcmd1bWVudHMuXG5cdCAqL1xuXHRhcmdzPzogQ29tbWFuZFN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBUaGUgdGFzayBzZWxlY3RvciBpZiBuZWVkZWQuXG5cdCAqL1xuXHR0YXNrU2VsZWN0b3I/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdG8gc3VwcHJlc3MgdGhlIHRhc2sgbmFtZSB3aGVuIG1lcmdpbmcgZ2xvYmFsIGFyZ3Ncblx0ICpcblx0ICovXG5cdHN1cHByZXNzVGFza05hbWU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBEZXNjcmliZXMgaG93IHRoZSB0YXNrIGlzIHByZXNlbnRlZCBpbiB0aGUgVUkuXG5cdCAqL1xuXHRwcmVzZW50YXRpb24/OiBJUHJlc2VudGF0aW9uT3B0aW9ucztcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUYXNrR3JvdXAge1xuXHRleHBvcnQgY29uc3QgQ2xlYW46IFRhc2tHcm91cCA9IHsgX2lkOiAnY2xlYW4nLCBpc0RlZmF1bHQ6IGZhbHNlIH07XG5cblx0ZXhwb3J0IGNvbnN0IEJ1aWxkOiBUYXNrR3JvdXAgPSB7IF9pZDogJ2J1aWxkJywgaXNEZWZhdWx0OiBmYWxzZSB9O1xuXG5cdGV4cG9ydCBjb25zdCBSZWJ1aWxkOiBUYXNrR3JvdXAgPSB7IF9pZDogJ3JlYnVpbGQnLCBpc0RlZmF1bHQ6IGZhbHNlIH07XG5cblx0ZXhwb3J0IGNvbnN0IFRlc3Q6IFRhc2tHcm91cCA9IHsgX2lkOiAndGVzdCcsIGlzRGVmYXVsdDogZmFsc2UgfTtcblxuXHRleHBvcnQgZnVuY3Rpb24gaXModmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBzdHJpbmcge1xuXHRcdHJldHVybiB2YWx1ZSA9PT0gQ2xlYW4uX2lkIHx8IHZhbHVlID09PSBCdWlsZC5faWQgfHwgdmFsdWUgPT09IFJlYnVpbGQuX2lkIHx8IHZhbHVlID09PSBUZXN0Ll9pZDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBzdHJpbmcgfCBUYXNrR3JvdXAgfCB1bmRlZmluZWQpOiBUYXNrR3JvdXAgfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoVHlwZXMuaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRpZiAoaXModmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiB7IF9pZDogdmFsdWUsIGlzRGVmYXVsdDogZmFsc2UgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBUYXNrR3JvdXAge1xuXHRfaWQ6IHN0cmluZztcblx0aXNEZWZhdWx0PzogYm9vbGVhbiB8IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGFza1Njb3BlIHtcblx0R2xvYmFsID0gMSxcblx0V29ya3NwYWNlID0gMixcblx0Rm9sZGVyID0gM1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRhc2tTb3VyY2VLaW5kIHtcblx0ZXhwb3J0IGNvbnN0IFdvcmtzcGFjZTogJ3dvcmtzcGFjZScgPSAnd29ya3NwYWNlJztcblx0ZXhwb3J0IGNvbnN0IEV4dGVuc2lvbjogJ2V4dGVuc2lvbicgPSAnZXh0ZW5zaW9uJztcblx0ZXhwb3J0IGNvbnN0IEluTWVtb3J5OiAnaW5NZW1vcnknID0gJ2luTWVtb3J5Jztcblx0ZXhwb3J0IGNvbnN0IFdvcmtzcGFjZUZpbGU6ICd3b3Jrc3BhY2VGaWxlJyA9ICd3b3Jrc3BhY2VGaWxlJztcblx0ZXhwb3J0IGNvbnN0IFVzZXI6ICd1c2VyJyA9ICd1c2VyJztcblxuXHRleHBvcnQgZnVuY3Rpb24gdG9Db25maWd1cmF0aW9uVGFyZ2V0KGtpbmQ6IHN0cmluZyk6IENvbmZpZ3VyYXRpb25UYXJnZXQge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSBUYXNrU291cmNlS2luZC5Vc2VyOiByZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHRcdFx0Y2FzZSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlOiByZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrU291cmNlQ29uZmlnRWxlbWVudCB7XG5cdHdvcmtzcGFjZUZvbGRlcj86IElXb3Jrc3BhY2VGb2xkZXI7XG5cdHdvcmtzcGFjZT86IElXb3Jrc3BhY2U7XG5cdGZpbGU6IHN0cmluZztcblx0aW5kZXg6IG51bWJlcjtcblx0ZWxlbWVudDogdW5rbm93bjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFza0NvbmZpZyB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHRhc2s/OiBDb21tYW5kU3RyaW5nO1xuXHR0eXBlPzogc3RyaW5nO1xuXHRjb21tYW5kPzogc3RyaW5nIHwgQ29tbWFuZFN0cmluZztcblx0YXJncz86IHN0cmluZ1tdIHwgQ29tbWFuZFN0cmluZ1tdO1xuXHRwcmVzZW50YXRpb24/OiBJUHJlc2VudGF0aW9uT3B0aW9ucztcblx0aXNCYWNrZ3JvdW5kPzogYm9vbGVhbjtcblx0cHJvYmxlbU1hdGNoZXI/OiBUeXBlcy5TaW5nbGVPck1hbnk8c3RyaW5nPjtcblx0Z3JvdXA/OiBzdHJpbmcgfCBUYXNrR3JvdXA7XG59XG5cbmludGVyZmFjZSBJQmFzZVRhc2tTb3VyY2Uge1xuXHRyZWFkb25seSBraW5kOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtzcGFjZVRhc2tTb3VyY2UgZXh0ZW5kcyBJQmFzZVRhc2tTb3VyY2Uge1xuXHRyZWFkb25seSBraW5kOiAnd29ya3NwYWNlJztcblx0cmVhZG9ubHkgY29uZmlnOiBJVGFza1NvdXJjZUNvbmZpZ0VsZW1lbnQ7XG5cdHJlYWRvbmx5IGN1c3RvbWl6ZXM/OiBLZXllZFRhc2tJZGVudGlmaWVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25UYXNrU291cmNlIGV4dGVuZHMgSUJhc2VUYXNrU291cmNlIHtcblx0cmVhZG9ubHkga2luZDogJ2V4dGVuc2lvbic7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbj86IHN0cmluZztcblx0cmVhZG9ubHkgc2NvcGU6IFRhc2tTY29wZTtcblx0cmVhZG9ubHkgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25UYXNrU291cmNlVHJhbnNmZXIge1xuXHRfX3dvcmtzcGFjZUZvbGRlcjogVXJpQ29tcG9uZW50cztcblx0X19kZWZpbml0aW9uOiB7IHR5cGU6IHN0cmluZztbbmFtZTogc3RyaW5nXTogdW5rbm93biB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElJbk1lbW9yeVRhc2tTb3VyY2UgZXh0ZW5kcyBJQmFzZVRhc2tTb3VyY2Uge1xuXHRyZWFkb25seSBraW5kOiAnaW5NZW1vcnknO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElVc2VyVGFza1NvdXJjZSBleHRlbmRzIElCYXNlVGFza1NvdXJjZSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICd1c2VyJztcblx0cmVhZG9ubHkgY29uZmlnOiBJVGFza1NvdXJjZUNvbmZpZ0VsZW1lbnQ7XG5cdHJlYWRvbmx5IGN1c3RvbWl6ZXM/OiBLZXllZFRhc2tJZGVudGlmaWVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtzcGFjZUZpbGVUYXNrU291cmNlIGV4dGVuZHMgSUJhc2VUYXNrU291cmNlIHtcblx0cmVhZG9ubHkga2luZDogJ3dvcmtzcGFjZUZpbGUnO1xuXHRyZWFkb25seSBjb25maWc6IElUYXNrU291cmNlQ29uZmlnRWxlbWVudDtcblx0cmVhZG9ubHkgY3VzdG9taXplcz86IEtleWVkVGFza0lkZW50aWZpZXI7XG59XG5cbmV4cG9ydCB0eXBlIFRhc2tTb3VyY2UgPSBJV29ya3NwYWNlVGFza1NvdXJjZSB8IElFeHRlbnNpb25UYXNrU291cmNlIHwgSUluTWVtb3J5VGFza1NvdXJjZSB8IElVc2VyVGFza1NvdXJjZSB8IFdvcmtzcGFjZUZpbGVUYXNrU291cmNlO1xuZXhwb3J0IHR5cGUgRmlsZUJhc2VkVGFza1NvdXJjZSA9IElXb3Jrc3BhY2VUYXNrU291cmNlIHwgSVVzZXJUYXNrU291cmNlIHwgV29ya3NwYWNlRmlsZVRhc2tTb3VyY2U7XG5leHBvcnQgaW50ZXJmYWNlIElUYXNrSWRlbnRpZmllciB7XG5cdHR5cGU6IHN0cmluZztcblx0W25hbWU6IHN0cmluZ106IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgS2V5ZWRUYXNrSWRlbnRpZmllciBleHRlbmRzIElUYXNrSWRlbnRpZmllciB7XG5cdF9rZXk6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFza0RlcGVuZGVuY3kge1xuXHR1cmk6IFVSSSB8IHN0cmluZztcblx0dGFzazogc3RyaW5nIHwgS2V5ZWRUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRGVwZW5kc09yZGVyIHtcblx0cGFyYWxsZWwgPSAncGFyYWxsZWwnLFxuXHRzZXF1ZW5jZSA9ICdzZXF1ZW5jZSdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMge1xuXG5cdC8qKlxuXHQgKiBUaGUgdGFzaydzIG5hbWVcblx0ICovXG5cdG5hbWU/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSB0YXNrJ3MgbmFtZVxuXHQgKi9cblx0aWRlbnRpZmllcj86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIHRhc2sncyBncm91cDtcblx0ICovXG5cdGdyb3VwPzogc3RyaW5nIHwgVGFza0dyb3VwO1xuXG5cdC8qKlxuXHQgKiBUaGUgcHJlc2VudGF0aW9uIG9wdGlvbnNcblx0ICovXG5cdHByZXNlbnRhdGlvbj86IElQcmVzZW50YXRpb25PcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBUaGUgY29tbWFuZCBvcHRpb25zO1xuXHQgKi9cblx0b3B0aW9ucz86IENvbW1hbmRPcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSB0YXNrIGlzIGEgYmFja2dyb3VuZCB0YXNrIG9yIG5vdC5cblx0ICovXG5cdGlzQmFja2dyb3VuZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHRhc2sgc2hvdWxkIHByb21wdCBvbiBjbG9zZSBmb3IgY29uZmlybWF0aW9uIGlmIHJ1bm5pbmcuXG5cdCAqL1xuXHRwcm9tcHRPbkNsb3NlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIG90aGVyIHRhc2tzIHRoaXMgdGFzayBkZXBlbmRzIG9uLlxuXHQgKi9cblx0ZGVwZW5kc09uPzogSVRhc2tEZXBlbmRlbmN5W107XG5cblx0LyoqXG5cdCAqIFRoZSBvcmRlciB0aGUgZGVwZW5kc09uIHRhc2tzIHNob3VsZCBiZSBleGVjdXRlZCBpbi5cblx0ICovXG5cdGRlcGVuZHNPcmRlcj86IERlcGVuZHNPcmRlcjtcblxuXHQvKipcblx0ICogQSBkZXNjcmlwdGlvbiBvZiB0aGUgdGFzay5cblx0ICovXG5cdGRldGFpbD86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIHByb2JsZW0gd2F0Y2hlcnMgdG8gdXNlIGZvciB0aGlzIHRhc2tcblx0ICovXG5cdHByb2JsZW1NYXRjaGVycz86IEFycmF5PHN0cmluZyB8IFByb2JsZW1NYXRjaGVyPjtcblxuXHQvKipcblx0ICogVGhlIGljb24gZm9yIHRoaXMgdGFzayBpbiB0aGUgdGVybWluYWwgdGFicyBsaXN0XG5cdCAqL1xuXHRpY29uPzogeyBpZD86IHN0cmluZzsgY29sb3I/OiBzdHJpbmcgfTtcblxuXHQvKipcblx0ICogRG8gbm90IHNob3cgdGhpcyB0YXNrIGluIHRoZSBydW4gdGFzayBxdWlja3BpY2tcblx0ICovXG5cdGhpZGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTaG93IHRoaXMgdGFzayBpbiB0aGUgQWdlbnRzIHJ1biBhY3Rpb24gZHJvcGRvd25cblx0ICovXG5cdGluQWdlbnRzPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGVudW0gUnVuT25PcHRpb25zIHtcblx0ZGVmYXVsdCA9IDEsXG5cdGZvbGRlck9wZW4gPSAyLFxuXHR3b3JrdHJlZUNyZWF0ZWQgPSAzXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEluc3RhbmNlUG9saWN5IHtcblx0dGVybWluYXRlTmV3ZXN0ID0gJ3Rlcm1pbmF0ZU5ld2VzdCcsXG5cdHRlcm1pbmF0ZU9sZGVzdCA9ICd0ZXJtaW5hdGVPbGRlc3QnLFxuXHRwcm9tcHQgPSAncHJvbXB0Jyxcblx0d2FybiA9ICd3YXJuJyxcblx0c2lsZW50ID0gJ3NpbGVudCdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUnVuT3B0aW9ucyB7XG5cdHJlZXZhbHVhdGVPblJlcnVuPzogYm9vbGVhbjtcblx0cnVuT24/OiBSdW5Pbk9wdGlvbnM7XG5cdGluc3RhbmNlTGltaXQ/OiBudW1iZXI7XG5cdGluc3RhbmNlUG9saWN5PzogSW5zdGFuY2VQb2xpY3k7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUnVuT3B0aW9ucyB7XG5cdGV4cG9ydCBjb25zdCBkZWZhdWx0czogSVJ1bk9wdGlvbnMgPSB7IHJlZXZhbHVhdGVPblJlcnVuOiB0cnVlLCBydW5PbjogUnVuT25PcHRpb25zLmRlZmF1bHQsIGluc3RhbmNlTGltaXQ6IDEsIGluc3RhbmNlUG9saWN5OiBJbnN0YW5jZVBvbGljeS5wcm9tcHQgfTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIENvbW1vblRhc2sge1xuXG5cdC8qKlxuXHQgKiBUaGUgdGFzaydzIGludGVybmFsIGlkXG5cdCAqL1xuXHRyZWFkb25seSBfaWQ6IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIGNhY2hlZCBsYWJlbC5cblx0ICovXG5cdF9sYWJlbDogc3RyaW5nID0gJyc7XG5cblx0dHlwZT86IHN0cmluZztcblxuXHRydW5PcHRpb25zOiBJUnVuT3B0aW9ucztcblxuXHRjb25maWd1cmF0aW9uUHJvcGVydGllczogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzO1xuXG5cdF9zb3VyY2U6IElCYXNlVGFza1NvdXJjZTtcblxuXHRwcml2YXRlIF90YXNrTG9hZE1lc3NhZ2VzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgY29uc3RydWN0b3IoaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgdHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBydW5PcHRpb25zOiBJUnVuT3B0aW9ucyxcblx0XHRjb25maWd1cmF0aW9uUHJvcGVydGllczogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCBzb3VyY2U6IElCYXNlVGFza1NvdXJjZSkge1xuXHRcdHRoaXMuX2lkID0gaWQ7XG5cdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHR0aGlzLl9sYWJlbCA9IGxhYmVsO1xuXHRcdH1cblx0XHRpZiAodHlwZSkge1xuXHRcdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHR9XG5cdFx0dGhpcy5ydW5PcHRpb25zID0gcnVuT3B0aW9ucztcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gY29uZmlndXJhdGlvblByb3BlcnRpZXM7XG5cdFx0dGhpcy5fc291cmNlID0gc291cmNlO1xuXHR9XG5cblx0cHVibGljIGdldERlZmluaXRpb24odXNlU291cmNlPzogYm9vbGVhbik6IEtleWVkVGFza0lkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TWFwS2V5KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHR9XG5cblx0cHVibGljIGdldEtleSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0Rm9sZGVySWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBnZXRDb21tb25UYXNrSWQoKTogc3RyaW5nIHtcblx0XHRpbnRlcmZhY2UgSVJlY2VudFRhc2tLZXkge1xuXHRcdFx0Zm9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZDogc3RyaW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleTogSVJlY2VudFRhc2tLZXkgPSB7IGZvbGRlcjogdGhpcy5nZXRGb2xkZXJJZCgpLCBpZDogdGhpcy5faWQgfTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoa2V5KTtcblx0fVxuXG5cdHB1YmxpYyBjbG9uZSgpOiBUYXNrIHtcblx0XHRyZXR1cm4gdGhpcy5mcm9tT2JqZWN0KE9iamVjdC5hc3NpZ24oe30sIHRoaXMgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGZyb21PYmplY3Qob2JqZWN0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFRhc2s7XG5cblx0cHVibGljIGdldFdvcmtzcGFjZUZvbGRlcigpOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldFdvcmtzcGFjZUZpbGVOYW1lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRUZWxlbWV0cnlLaW5kKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICd1bmtub3duJztcblx0fVxuXG5cdHB1YmxpYyBtYXRjaGVzKGtleTogc3RyaW5nIHwgS2V5ZWRUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZCwgY29tcGFyZUlkOiBib29sZWFuID0gZmFsc2UpOiBib29sZWFuIHtcblx0XHRpZiAoa2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGtleSkpIHtcblx0XHRcdHJldHVybiBrZXkgPT09IHRoaXMuX2xhYmVsIHx8IGtleSA9PT0gdGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyIHx8IChjb21wYXJlSWQgJiYga2V5ID09PSB0aGlzLl9pZCk7XG5cdFx0fVxuXHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0aGlzLmdldERlZmluaXRpb24odHJ1ZSk7XG5cdFx0cmV0dXJuIGlkZW50aWZpZXIgIT09IHVuZGVmaW5lZCAmJiBpZGVudGlmaWVyLl9rZXkgPT09IGtleS5fa2V5O1xuXHR9XG5cblx0cHVibGljIGdldFF1YWxpZmllZExhYmVsKCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHRpZiAod29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRyZXR1cm4gYCR7dGhpcy5fbGFiZWx9ICgke3dvcmtzcGFjZUZvbGRlci5uYW1lfSlgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGFiZWw7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFRhc2tFeGVjdXRpb24oKTogSVRhc2tFeGVjdXRpb24ge1xuXHRcdGNvbnN0IHJlc3VsdDogSVRhc2tFeGVjdXRpb24gPSB7XG5cdFx0XHRpZDogdGhpcy5faWQsXG5cdFx0XHR0YXNrOiB0aGlzIGFzIHVua25vd24gYXMgVGFza1xuXHRcdH07XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhZGRUYXNrTG9hZE1lc3NhZ2VzKG1lc3NhZ2VzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl90YXNrTG9hZE1lc3NhZ2VzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3Rhc2tMb2FkTWVzc2FnZXMgPSBbXTtcblx0XHR9XG5cdFx0aWYgKG1lc3NhZ2VzKSB7XG5cdFx0XHR0aGlzLl90YXNrTG9hZE1lc3NhZ2VzID0gdGhpcy5fdGFza0xvYWRNZXNzYWdlcy5jb25jYXQobWVzc2FnZXMpO1xuXHRcdH1cblx0fVxuXG5cdGdldCB0YXNrTG9hZE1lc3NhZ2VzKCk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdGFza0xvYWRNZXNzYWdlcztcblx0fVxufVxuXG4vKipcbiAqIEZvciB0YXNrcyBvZiB0eXBlIHNoZWxsIG9yIHByb2Nlc3MsIHRoaXMgaXMgY3JlYXRlZCB1cG9uIHBhcnNlXG4gKiBvZiB0aGUgdGFza3MuanNvbiBvciB3b3Jrc3BhY2UgZmlsZS5cbiAqIEZvciBDb250cmlidXRlZFRhc2tzIG9mIGFsbCBvdGhlciB0eXBlcywgdGhpcyBpcyB0aGUgcmVzdWx0IG9mXG4gKiByZXNvbHZpbmcgYSBDb25maWd1cmluZ1Rhc2suXG4gKi9cbmV4cG9ydCBjbGFzcyBDdXN0b21UYXNrIGV4dGVuZHMgQ29tbW9uVGFzayB7XG5cblx0ZGVjbGFyZSB0eXBlOiAnJGN1c3RvbWl6ZWQnOyAvLyBDVVNUT01JWkVEX1RBU0tfVFlQRVxuXG5cdGluc3RhbmNlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEluZGljYXRlZCB0aGUgc291cmNlIG9mIHRoZSB0YXNrIChlLmcuIHRhc2tzLmpzb24gb3IgZXh0ZW5zaW9uKVxuXHQgKi9cblx0b3ZlcnJpZGUgX3NvdXJjZTogRmlsZUJhc2VkVGFza1NvdXJjZTtcblxuXHRoYXNEZWZpbmVkTWF0Y2hlcnM6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBjb21tYW5kIGNvbmZpZ3VyYXRpb25cblx0ICovXG5cdGNvbW1hbmQ6IElDb21tYW5kQ29uZmlndXJhdGlvbiA9IHt9O1xuXG5cdHB1YmxpYyBjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBzb3VyY2U6IEZpbGVCYXNlZFRhc2tTb3VyY2UsIGxhYmVsOiBzdHJpbmcsIHR5cGU6IHN0cmluZywgY29tbWFuZDogSUNvbW1hbmRDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdGhhc0RlZmluZWRNYXRjaGVyczogYm9vbGVhbiwgcnVuT3B0aW9uczogSVJ1bk9wdGlvbnMsIGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzOiBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMpIHtcblx0XHRzdXBlcihpZCwgbGFiZWwsIHVuZGVmaW5lZCwgcnVuT3B0aW9ucywgY29uZmlndXJhdGlvblByb3BlcnRpZXMsIHNvdXJjZSk7XG5cdFx0dGhpcy5fc291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuaGFzRGVmaW5lZE1hdGNoZXJzID0gaGFzRGVmaW5lZE1hdGNoZXJzO1xuXHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHR0aGlzLmNvbW1hbmQgPSBjb21tYW5kO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjbG9uZSgpOiBDdXN0b21UYXNrIHtcblx0XHRyZXR1cm4gbmV3IEN1c3RvbVRhc2sodGhpcy5faWQsIHRoaXMuX3NvdXJjZSwgdGhpcy5fbGFiZWwsIHRoaXMudHlwZSwgdGhpcy5jb21tYW5kLCB0aGlzLmhhc0RlZmluZWRNYXRjaGVycywgdGhpcy5ydW5PcHRpb25zLCB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKTtcblx0fVxuXG5cdHB1YmxpYyBjdXN0b21pemVzKCk6IEtleWVkVGFza0lkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9zb3VyY2UgJiYgdGhpcy5fc291cmNlLmN1c3RvbWl6ZXMpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zb3VyY2UuY3VzdG9taXplcztcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXREZWZpbml0aW9uKHVzZVNvdXJjZTogYm9vbGVhbiA9IGZhbHNlKTogS2V5ZWRUYXNrSWRlbnRpZmllciB7XG5cdFx0aWYgKHVzZVNvdXJjZSAmJiB0aGlzLl9zb3VyY2UuY3VzdG9taXplcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc291cmNlLmN1c3RvbWl6ZXM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCB0eXBlOiBzdHJpbmc7XG5cdFx0XHRjb25zdCBjb21tYW5kUnVudGltZSA9IHRoaXMuY29tbWFuZCA/IHRoaXMuY29tbWFuZC5ydW50aW1lIDogdW5kZWZpbmVkO1xuXHRcdFx0c3dpdGNoIChjb21tYW5kUnVudGltZSkge1xuXHRcdFx0XHRjYXNlIFJ1bnRpbWVUeXBlLlNoZWxsOlxuXHRcdFx0XHRcdHR5cGUgPSAnc2hlbGwnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgUnVudGltZVR5cGUuUHJvY2Vzczpcblx0XHRcdFx0XHR0eXBlID0gJ3Byb2Nlc3MnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgUnVudGltZVR5cGUuQ3VzdG9tRXhlY3V0aW9uOlxuXHRcdFx0XHRcdHR5cGUgPSAnY3VzdG9tRXhlY3V0aW9uJztcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIHVuZGVmaW5lZDpcblx0XHRcdFx0XHR0eXBlID0gJyRjb21wb3NpdGUnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHRhc2sgcnVudGltZScpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQ6IEtleWVkVGFza0lkZW50aWZpZXIgPSB7XG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdF9rZXk6IHRoaXMuX2lkLFxuXHRcdFx0XHRpZDogdGhpcy5faWRcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaXModmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBDdXN0b21UYXNrIHtcblx0XHRyZXR1cm4gdmFsdWUgaW5zdGFuY2VvZiBDdXN0b21UYXNrO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldE1hcEtleSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuX3NvdXJjZS5jb25maWcud29ya3NwYWNlRm9sZGVyO1xuXHRcdHJldHVybiB3b3Jrc3BhY2VGb2xkZXIgPyBgJHt3b3Jrc3BhY2VGb2xkZXIudXJpLnRvU3RyaW5nKCl9fCR7dGhpcy5faWR9fCR7dGhpcy5pbnN0YW5jZX1gIDogYCR7dGhpcy5faWR9fCR7dGhpcy5pbnN0YW5jZX1gO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEZvbGRlcklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5raW5kID09PSBUYXNrU291cmNlS2luZC5Vc2VyID8gVVNFUl9UQVNLU19HUk9VUF9LRVkgOiB0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZUZvbGRlcj8udXJpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0Q29tbW9uVGFza0lkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5jdXN0b21pemVzID8gc3VwZXIuZ2V0Q29tbW9uVGFza0lkKCkgOiAodGhpcy5nZXRLZXkoKSA/PyBzdXBlci5nZXRDb21tb25UYXNrSWQoKSk7XG5cdH1cblxuXHQvKipcblx0ICogQHJldHVybnMgQSBrZXkgcmVwcmVzZW50aW5nIHRoZSB0YXNrXG5cdCAqL1xuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0S2V5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aW50ZXJmYWNlIElDdXN0b21LZXkge1xuXHRcdFx0dHlwZTogc3RyaW5nO1xuXHRcdFx0Zm9sZGVyOiBzdHJpbmc7XG5cdFx0XHRpZDogc3RyaW5nO1xuXHRcdH1cblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0aGlzLmdldEZvbGRlcklkKCk7XG5cdFx0aWYgKCF3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBpZDogc3RyaW5nID0gdGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyITtcblx0XHRpZiAodGhpcy5fc291cmNlLmtpbmQgIT09IFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZSkge1xuXHRcdFx0aWQgKz0gdGhpcy5fc291cmNlLmtpbmQ7XG5cdFx0fVxuXHRcdGNvbnN0IGtleTogSUN1c3RvbUtleSA9IHsgdHlwZTogQ1VTVE9NSVpFRF9UQVNLX1RZUEUsIGZvbGRlcjogd29ya3NwYWNlRm9sZGVyLCBpZCB9O1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShrZXkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldFdvcmtzcGFjZUZvbGRlcigpOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc291cmNlLmNvbmZpZy53b3Jrc3BhY2VGb2xkZXI7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0V29ya3NwYWNlRmlsZU5hbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gKHRoaXMuX3NvdXJjZS5jb25maWcud29ya3NwYWNlICYmIHRoaXMuX3NvdXJjZS5jb25maWcud29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pID8gcmVzb3VyY2VzLmJhc2VuYW1lKHRoaXMuX3NvdXJjZS5jb25maWcud29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldFRlbGVtZXRyeUtpbmQoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fc291cmNlLmN1c3RvbWl6ZXMpIHtcblx0XHRcdHJldHVybiAnd29ya3NwYWNlPmV4dGVuc2lvbic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAnd29ya3NwYWNlJztcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZnJvbU9iamVjdChvYmplY3Q6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogQ3VzdG9tVGFzayB7XG5cdFx0Y29uc3Qgb2JqID0gb2JqZWN0IGFzIHVua25vd24gYXMgQ3VzdG9tVGFzaztcblx0XHRyZXR1cm4gbmV3IEN1c3RvbVRhc2sob2JqLl9pZCwgb2JqLl9zb3VyY2UsIG9iai5fbGFiZWwsIG9iai50eXBlLCBvYmouY29tbWFuZCwgb2JqLmhhc0RlZmluZWRNYXRjaGVycywgb2JqLnJ1bk9wdGlvbnMsIG9iai5jb25maWd1cmF0aW9uUHJvcGVydGllcyk7XG5cdH1cbn1cblxuLyoqXG4gKiBBZnRlciBhIGNvbnRyaWJ1dGVkIHRhc2sgaGFzIGJlZW4gcGFyc2VkLCBidXQgYmVmb3JlXG4gKiB0aGUgdGFzayBoYXMgYmVlbiByZXNvbHZlZCB2aWEgdGhlIGV4dGVuc2lvbiwgaXRzIHByb3BlcnRpZXNcbiAqIGFyZSBzdG9yZWQgaW4gdGhpc1xuICovXG5leHBvcnQgY2xhc3MgQ29uZmlndXJpbmdUYXNrIGV4dGVuZHMgQ29tbW9uVGFzayB7XG5cblx0LyoqXG5cdCAqIEluZGljYXRlZCB0aGUgc291cmNlIG9mIHRoZSB0YXNrIChlLmcuIHRhc2tzLmpzb24gb3IgZXh0ZW5zaW9uKVxuXHQgKi9cblx0b3ZlcnJpZGUgX3NvdXJjZTogRmlsZUJhc2VkVGFza1NvdXJjZTtcblxuXHRjb25maWd1cmVzOiBLZXllZFRhc2tJZGVudGlmaWVyO1xuXG5cdHB1YmxpYyBjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBzb3VyY2U6IEZpbGVCYXNlZFRhc2tTb3VyY2UsIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRjb25maWd1cmVzOiBLZXllZFRhc2tJZGVudGlmaWVyLCBydW5PcHRpb25zOiBJUnVuT3B0aW9ucywgY29uZmlndXJhdGlvblByb3BlcnRpZXM6IElDb25maWd1cmF0aW9uUHJvcGVydGllcykge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCwgdHlwZSwgcnVuT3B0aW9ucywgY29uZmlndXJhdGlvblByb3BlcnRpZXMsIHNvdXJjZSk7XG5cdFx0dGhpcy5fc291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuY29uZmlndXJlcyA9IGNvbmZpZ3VyZXM7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgQ29uZmlndXJpbmdUYXNrIHtcblx0XHRyZXR1cm4gdmFsdWUgaW5zdGFuY2VvZiBDb25maWd1cmluZ1Rhc2s7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZnJvbU9iamVjdChvYmplY3Q6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogVGFzayB7XG5cdFx0cmV0dXJuIG9iamVjdCBhcyB1bmtub3duIGFzIFRhc2s7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0RGVmaW5pdGlvbigpOiBLZXllZFRhc2tJZGVudGlmaWVyIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmVzO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldFdvcmtzcGFjZUZpbGVOYW1lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuICh0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZSAmJiB0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZS5jb25maWd1cmF0aW9uKSA/IHJlc291cmNlcy5iYXNlbmFtZSh0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZS5jb25maWd1cmF0aW9uKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRXb3Jrc3BhY2VGb2xkZXIoKTogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5jb25maWcud29ya3NwYWNlRm9sZGVyO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEZvbGRlcklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5raW5kID09PSBUYXNrU291cmNlS2luZC5Vc2VyID8gVVNFUl9UQVNLU19HUk9VUF9LRVkgOiB0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZUZvbGRlcj8udXJpLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0S2V5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aW50ZXJmYWNlIElDdXN0b21LZXkge1xuXHRcdFx0dHlwZTogc3RyaW5nO1xuXHRcdFx0Zm9sZGVyOiBzdHJpbmc7XG5cdFx0XHRpZDogc3RyaW5nO1xuXHRcdH1cblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0aGlzLmdldEZvbGRlcklkKCk7XG5cdFx0aWYgKCF3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBpZDogc3RyaW5nID0gdGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyITtcblx0XHRpZiAodGhpcy5fc291cmNlLmtpbmQgIT09IFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZSkge1xuXHRcdFx0aWQgKz0gdGhpcy5fc291cmNlLmtpbmQ7XG5cdFx0fVxuXHRcdGNvbnN0IGtleTogSUN1c3RvbUtleSA9IHsgdHlwZTogQ1VTVE9NSVpFRF9UQVNLX1RZUEUsIGZvbGRlcjogd29ya3NwYWNlRm9sZGVyLCBpZCB9O1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShrZXkpO1xuXHR9XG59XG5cbi8qKlxuICogQSB0YXNrIGZyb20gYW4gZXh0ZW5zaW9uIGNyZWF0ZWQgdmlhIHJlc29sdmVUYXNrIG9yIHByb3ZpZGVUYXNrXG4gKi9cbmV4cG9ydCBjbGFzcyBDb250cmlidXRlZFRhc2sgZXh0ZW5kcyBDb21tb25UYXNrIHtcblxuXHQvKipcblx0ICogSW5kaWNhdGVkIHRoZSBzb3VyY2Ugb2YgdGhlIHRhc2sgKGUuZy4gdGFza3MuanNvbiBvciBleHRlbnNpb24pXG5cdCAqIFNldCBpbiB0aGUgc3VwZXIgY29uc3RydWN0b3Jcblx0ICovXG5cdGRlY2xhcmUgX3NvdXJjZTogSUV4dGVuc2lvblRhc2tTb3VyY2U7XG5cblx0aW5zdGFuY2U6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRkZWZpbmVzOiBLZXllZFRhc2tJZGVudGlmaWVyO1xuXG5cdGhhc0RlZmluZWRNYXRjaGVyczogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIGNvbW1hbmQgY29uZmlndXJhdGlvblxuXHQgKi9cblx0Y29tbWFuZDogSUNvbW1hbmRDb25maWd1cmF0aW9uO1xuXG5cdC8qKlxuXHQgKiBUaGUgaWNvbiBmb3IgdGhlIHRhc2tcblx0ICovXG5cdGljb246IHsgaWQ/OiBzdHJpbmc7IGNvbG9yPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIERvbid0IHNob3cgdGhlIHRhc2sgaW4gdGhlIHJ1biB0YXNrIHF1aWNrcGlja1xuXHQgKi9cblx0aGlkZT86IGJvb2xlYW47XG5cblx0cHVibGljIGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHNvdXJjZTogSUV4dGVuc2lvblRhc2tTb3VyY2UsIGxhYmVsOiBzdHJpbmcsIHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGVmaW5lczogS2V5ZWRUYXNrSWRlbnRpZmllcixcblx0XHRjb21tYW5kOiBJQ29tbWFuZENvbmZpZ3VyYXRpb24sIGhhc0RlZmluZWRNYXRjaGVyczogYm9vbGVhbiwgcnVuT3B0aW9uczogSVJ1bk9wdGlvbnMsXG5cdFx0Y29uZmlndXJhdGlvblByb3BlcnRpZXM6IElDb25maWd1cmF0aW9uUHJvcGVydGllcykge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCwgdHlwZSwgcnVuT3B0aW9ucywgY29uZmlndXJhdGlvblByb3BlcnRpZXMsIHNvdXJjZSk7XG5cdFx0dGhpcy5kZWZpbmVzID0gZGVmaW5lcztcblx0XHR0aGlzLmhhc0RlZmluZWRNYXRjaGVycyA9IGhhc0RlZmluZWRNYXRjaGVycztcblx0XHR0aGlzLmNvbW1hbmQgPSBjb21tYW5kO1xuXHRcdHRoaXMuaWNvbiA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb247XG5cdFx0dGhpcy5oaWRlID0gY29uZmlndXJhdGlvblByb3BlcnRpZXMuaGlkZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjbG9uZSgpOiBDb250cmlidXRlZFRhc2sge1xuXHRcdHJldHVybiBuZXcgQ29udHJpYnV0ZWRUYXNrKHRoaXMuX2lkLCB0aGlzLl9zb3VyY2UsIHRoaXMuX2xhYmVsLCB0aGlzLnR5cGUsIHRoaXMuZGVmaW5lcywgdGhpcy5jb21tYW5kLCB0aGlzLmhhc0RlZmluZWRNYXRjaGVycywgdGhpcy5ydW5PcHRpb25zLCB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXREZWZpbml0aW9uKCk6IEtleWVkVGFza0lkZW50aWZpZXIge1xuXHRcdHJldHVybiB0aGlzLmRlZmluZXM7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgQ29udHJpYnV0ZWRUYXNrIHtcblx0XHRyZXR1cm4gdmFsdWUgaW5zdGFuY2VvZiBDb250cmlidXRlZFRhc2s7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0TWFwS2V5KCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5fc291cmNlLndvcmtzcGFjZUZvbGRlcjtcblx0XHRyZXR1cm4gd29ya3NwYWNlRm9sZGVyXG5cdFx0XHQ/IGAke3RoaXMuX3NvdXJjZS5zY29wZS50b1N0cmluZygpfXwke3dvcmtzcGFjZUZvbGRlci51cmkudG9TdHJpbmcoKX18JHt0aGlzLl9pZH18JHt0aGlzLmluc3RhbmNlfWBcblx0XHRcdDogYCR7dGhpcy5fc291cmNlLnNjb3BlLnRvU3RyaW5nKCl9fCR7dGhpcy5faWR9fCR7dGhpcy5pbnN0YW5jZX1gO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEZvbGRlcklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3NvdXJjZS5zY29wZSA9PT0gVGFza1Njb3BlLkZvbGRlciAmJiB0aGlzLl9zb3VyY2Uud29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc291cmNlLndvcmtzcGFjZUZvbGRlci51cmkudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRLZXkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpbnRlcmZhY2UgSUNvbnRyaWJ1dGVkS2V5IHtcblx0XHRcdHR5cGU6IHN0cmluZztcblx0XHRcdHNjb3BlOiBudW1iZXI7XG5cdFx0XHRmb2xkZXI/OiBzdHJpbmc7XG5cdFx0XHRpZDogc3RyaW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleTogSUNvbnRyaWJ1dGVkS2V5ID0geyB0eXBlOiAnY29udHJpYnV0ZWQnLCBzY29wZTogdGhpcy5fc291cmNlLnNjb3BlLCBpZDogdGhpcy5faWQgfTtcblx0XHRrZXkuZm9sZGVyID0gdGhpcy5nZXRGb2xkZXJJZCgpO1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShrZXkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldFdvcmtzcGFjZUZvbGRlcigpOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc291cmNlLndvcmtzcGFjZUZvbGRlcjtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRUZWxlbWV0cnlLaW5kKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdleHRlbnNpb24nO1xuXHR9XG5cblx0cHJvdGVjdGVkIGZyb21PYmplY3Qob2JqZWN0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IENvbnRyaWJ1dGVkVGFzayB7XG5cdFx0Y29uc3Qgb2JqID0gb2JqZWN0IGFzIHVua25vd24gYXMgQ29udHJpYnV0ZWRUYXNrO1xuXHRcdHJldHVybiBuZXcgQ29udHJpYnV0ZWRUYXNrKG9iai5faWQsIG9iai5fc291cmNlLCBvYmouX2xhYmVsLCBvYmoudHlwZSwgb2JqLmRlZmluZXMsIG9iai5jb21tYW5kLCBvYmouaGFzRGVmaW5lZE1hdGNoZXJzLCBvYmoucnVuT3B0aW9ucywgb2JqLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5NZW1vcnlUYXNrIGV4dGVuZHMgQ29tbW9uVGFzayB7XG5cdC8qKlxuXHQgKiBJbmRpY2F0ZWQgdGhlIHNvdXJjZSBvZiB0aGUgdGFzayAoZS5nLiB0YXNrcy5qc29uIG9yIGV4dGVuc2lvbilcblx0ICovXG5cdG92ZXJyaWRlIF9zb3VyY2U6IElJbk1lbW9yeVRhc2tTb3VyY2U7XG5cblx0aW5zdGFuY2U6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRkZWNsYXJlIHR5cGU6ICdpbk1lbW9yeSc7XG5cblx0cHVibGljIGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHNvdXJjZTogSUluTWVtb3J5VGFza1NvdXJjZSwgbGFiZWw6IHN0cmluZywgdHlwZTogc3RyaW5nLFxuXHRcdHJ1bk9wdGlvbnM6IElSdW5PcHRpb25zLCBjb25maWd1cmF0aW9uUHJvcGVydGllczogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKSB7XG5cdFx0c3VwZXIoaWQsIGxhYmVsLCB0eXBlLCBydW5PcHRpb25zLCBjb25maWd1cmF0aW9uUHJvcGVydGllcywgc291cmNlKTtcblx0XHR0aGlzLl9zb3VyY2UgPSBzb3VyY2U7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY2xvbmUoKTogSW5NZW1vcnlUYXNrIHtcblx0XHRyZXR1cm4gbmV3IEluTWVtb3J5VGFzayh0aGlzLl9pZCwgdGhpcy5fc291cmNlLCB0aGlzLl9sYWJlbCwgdGhpcy50eXBlLCB0aGlzLnJ1bk9wdGlvbnMsIHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXMpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIEluTWVtb3J5VGFzayB7XG5cdFx0cmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgSW5NZW1vcnlUYXNrO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldFRlbGVtZXRyeUtpbmQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ2NvbXBvc2l0ZSc7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0TWFwS2V5KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuX2lkfXwke3RoaXMuaW5zdGFuY2V9YDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRGb2xkZXJJZCgpOiB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZnJvbU9iamVjdChvYmplY3Q6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogSW5NZW1vcnlUYXNrIHtcblx0XHRjb25zdCBvYmogPSBvYmplY3QgYXMgdW5rbm93biBhcyBJbk1lbW9yeVRhc2s7XG5cdFx0cmV0dXJuIG5ldyBJbk1lbW9yeVRhc2sob2JqLl9pZCwgb2JqLl9zb3VyY2UsIG9iai5fbGFiZWwsIG9iai50eXBlLCBvYmoucnVuT3B0aW9ucywgb2JqLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBUYXNrID0gQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzayB8IEluTWVtb3J5VGFzaztcblxuZXhwb3J0IGludGVyZmFjZSBJVGFza0V4ZWN1dGlvbiB7XG5cdGlkOiBzdHJpbmc7XG5cdHRhc2s6IFRhc2s7XG59XG5cbmV4cG9ydCBlbnVtIEV4ZWN1dGlvbkVuZ2luZSB7XG5cdFByb2Nlc3MgPSAxLFxuXHRUZXJtaW5hbCA9IDJcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBFeGVjdXRpb25FbmdpbmUge1xuXHRleHBvcnQgY29uc3QgX2RlZmF1bHQ6IEV4ZWN1dGlvbkVuZ2luZSA9IEV4ZWN1dGlvbkVuZ2luZS5UZXJtaW5hbDtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gSnNvblNjaGVtYVZlcnNpb24ge1xuXHRWMF8xXzAgPSAxLFxuXHRWMl8wXzAgPSAyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tTZXQge1xuXHR0YXNrczogVGFza1tdO1xuXHRleHRlbnNpb24/OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tEZWZpbml0aW9uIHtcblx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0dGFza1R5cGU6IHN0cmluZztcblx0cmVxdWlyZWQ6IHN0cmluZ1tdO1xuXHRwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcDtcblx0d2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uO1xufVxuXG5leHBvcnQgY2xhc3MgVGFza1NvcnRlciB7XG5cblx0cHJpdmF0ZSBfb3JkZXI6IE1hcDxzdHJpbmcsIG51bWJlcj4gPSBuZXcgTWFwKCk7XG5cblx0Y29uc3RydWN0b3Iod29ya3NwYWNlRm9sZGVyczogSVdvcmtzcGFjZUZvbGRlcltdKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB3b3Jrc3BhY2VGb2xkZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9vcmRlci5zZXQod29ya3NwYWNlRm9sZGVyc1tpXS51cmkudG9TdHJpbmcoKSwgaSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNvbXBhcmUoYTogVGFzayB8IENvbmZpZ3VyaW5nVGFzaywgYjogVGFzayB8IENvbmZpZ3VyaW5nVGFzayk6IG51bWJlciB7XG5cdFx0Y29uc3QgYXcgPSBhLmdldFdvcmtzcGFjZUZvbGRlcigpO1xuXHRcdGNvbnN0IGJ3ID0gYi5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHRpZiAoYXcgJiYgYncpIHtcblx0XHRcdGxldCBhaSA9IHRoaXMuX29yZGVyLmdldChhdy51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhaSA9IGFpID09PSB1bmRlZmluZWQgPyAwIDogYWkgKyAxO1xuXHRcdFx0bGV0IGJpID0gdGhpcy5fb3JkZXIuZ2V0KGJ3LnVyaS50b1N0cmluZygpKTtcblx0XHRcdGJpID0gYmkgPT09IHVuZGVmaW5lZCA/IDAgOiBiaSArIDE7XG5cdFx0XHRpZiAoYWkgPT09IGJpKSB7XG5cdFx0XHRcdHJldHVybiBhLl9sYWJlbC5sb2NhbGVDb21wYXJlKGIuX2xhYmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBhaSAtIGJpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIWF3ICYmIGJ3KSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChhdyAmJiAhYncpIHtcblx0XHRcdHJldHVybiArMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHR9XG59XG5cblxuXG5leHBvcnQgY29uc3QgZW51bSBUYXNrUnVuVHlwZSB7XG5cdFNpbmdsZVJ1biA9ICdzaW5nbGVSdW4nLFxuXHRCYWNrZ3JvdW5kID0gJ2JhY2tncm91bmQnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tDaGFuZ2VkRXZlbnQge1xuXHRraW5kOiBUYXNrRXZlbnRLaW5kLkNoYW5nZWQ7XG59XG5cblxuXG5leHBvcnQgZW51bSBUYXNrRXZlbnRLaW5kIHtcblx0LyoqIEluZGljYXRlcyB0aGF0IGEgdGFzaydzIHByb3BlcnRpZXMgb3IgY29uZmlndXJhdGlvbiBoYXZlIGNoYW5nZWQgKi9cblx0Q2hhbmdlZCA9ICdjaGFuZ2VkJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoYXQgYSB0YXNrIGhhcyBiZWd1biBleGVjdXRpbmcgKi9cblx0UHJvY2Vzc1N0YXJ0ZWQgPSAncHJvY2Vzc1N0YXJ0ZWQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgdGhhdCBhIHRhc2sgcHJvY2VzcyBoYXMgY29tcGxldGVkICovXG5cdFByb2Nlc3NFbmRlZCA9ICdwcm9jZXNzRW5kZWQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgdGhhdCBhIHRhc2sgd2FzIHRlcm1pbmF0ZWQsIGVpdGhlciBieSB1c2VyIGFjdGlvbiBvciBieSB0aGUgc3lzdGVtICovXG5cdFRlcm1pbmF0ZWQgPSAndGVybWluYXRlZCcsXG5cblx0LyoqIEluZGljYXRlcyB0aGF0IGEgdGFzayBoYXMgc3RhcnRlZCBydW5uaW5nICovXG5cdFN0YXJ0ID0gJ3N0YXJ0JyxcblxuXHQvKiogSW5kaWNhdGVzIHRoYXQgYSB0YXNrIGhhcyBhY3F1aXJlZCBhbGwgbmVlZGVkIGlucHV0L3ZhcmlhYmxlcyB0byBleGVjdXRlICovXG5cdEFjcXVpcmVkSW5wdXQgPSAnYWNxdWlyZWRJbnB1dCcsXG5cblx0LyoqIEluZGljYXRlcyB0aGF0IGEgZGVwZW5kZW50IHRhc2sgaGFzIHN0YXJ0ZWQgKi9cblx0RGVwZW5kc09uU3RhcnRlZCA9ICdkZXBlbmRzT25TdGFydGVkJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoYXQgYSB0YXNrIGlzIGFjdGl2ZWx5IHJ1bm5pbmcvcHJvY2Vzc2luZyAqL1xuXHRBY3RpdmUgPSAnYWN0aXZlJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoYXQgYSB0YXNrIGlzIHBhdXNlZC93YWl0aW5nIGJ1dCBub3QgY29tcGxldGUgKi9cblx0SW5hY3RpdmUgPSAnaW5hY3RpdmUnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgdGhhdCBhIHRhc2sgaGFzIGNvbXBsZXRlZCBmdWxseSAqL1xuXHRFbmQgPSAnZW5kJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoYXQgYSB0YXNrJ3MgcHJvYmxlbSBtYXRjaGVyIGhhcyBzdGFydGVkICovXG5cdFByb2JsZW1NYXRjaGVyU3RhcnRlZCA9ICdwcm9ibGVtTWF0Y2hlclN0YXJ0ZWQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgdGhhdCBhIHRhc2sncyBwcm9ibGVtIG1hdGNoZXIgaGFzIGVuZGVkICovXG5cdFByb2JsZW1NYXRjaGVyRW5kZWQgPSAncHJvYmxlbU1hdGNoZXJFbmRlZCcsXG5cblx0LyoqIEluZGljYXRlcyB0aGF0IGEgdGFzaydzIHByb2JsZW0gbWF0Y2hlciBoYXMgZm91bmQgZXJyb3JzICovXG5cdFByb2JsZW1NYXRjaGVyRm91bmRFcnJvcnMgPSAncHJvYmxlbU1hdGNoZXJGb3VuZEVycm9ycydcbn1cblxuaW50ZXJmYWNlIElUYXNrQ29tbW9uIHtcblx0dGFza0lkOiBzdHJpbmc7XG5cdHJ1blR5cGU6IFRhc2tSdW5UeXBlO1xuXHR0YXNrTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRncm91cDogc3RyaW5nIHwgVGFza0dyb3VwIHwgdW5kZWZpbmVkO1xuXHRfX3Rhc2s6IFRhc2s7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tQcm9jZXNzU3RhcnRlZEV2ZW50IGV4dGVuZHMgSVRhc2tDb21tb24ge1xuXHRraW5kOiBUYXNrRXZlbnRLaW5kLlByb2Nlc3NTdGFydGVkO1xuXHR0ZXJtaW5hbElkOiBudW1iZXI7XG5cdHByb2Nlc3NJZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrUHJvY2Vzc0VuZGVkRXZlbnQgZXh0ZW5kcyBJVGFza0NvbW1vbiB7XG5cdGtpbmQ6IFRhc2tFdmVudEtpbmQuUHJvY2Vzc0VuZGVkO1xuXHR0ZXJtaW5hbElkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGV4aXRDb2RlPzogbnVtYmVyO1xuXHRkdXJhdGlvbk1zPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrSW5hY3RpdmVFdmVudCBleHRlbmRzIElUYXNrQ29tbW9uIHtcblx0a2luZDogVGFza0V2ZW50S2luZC5JbmFjdGl2ZTtcblx0dGVybWluYWxJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRkdXJhdGlvbk1zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tUZXJtaW5hdGVkRXZlbnQgZXh0ZW5kcyBJVGFza0NvbW1vbiB7XG5cdGtpbmQ6IFRhc2tFdmVudEtpbmQuVGVybWluYXRlZDtcblx0dGVybWluYWxJZDogbnVtYmVyO1xuXHRleGl0UmVhc29uOiBUZXJtaW5hbEV4aXRSZWFzb24gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tTdGFydGVkRXZlbnQgZXh0ZW5kcyBJVGFza0NvbW1vbiB7XG5cdGtpbmQ6IFRhc2tFdmVudEtpbmQuU3RhcnQ7XG5cdHRlcm1pbmFsSWQ6IG51bWJlcjtcblx0cmVzb2x2ZWRWYXJpYWJsZXM6IE1hcDxzdHJpbmcsIHN0cmluZz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRXZlbnQgZXh0ZW5kcyBJVGFza0NvbW1vbiB7XG5cdGtpbmQ6IFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJFbmRlZDtcblx0aGFzRXJyb3JzOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrR2VuZXJhbEV2ZW50IGV4dGVuZHMgSVRhc2tDb21tb24ge1xuXHRraW5kOiBUYXNrRXZlbnRLaW5kLkFjcXVpcmVkSW5wdXQgfCBUYXNrRXZlbnRLaW5kLkRlcGVuZHNPblN0YXJ0ZWQgfCBUYXNrRXZlbnRLaW5kLkFjdGl2ZSB8IFRhc2tFdmVudEtpbmQuSW5hY3RpdmUgfCBUYXNrRXZlbnRLaW5kLkVuZCB8IFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJTdGFydGVkIHwgVGFza0V2ZW50S2luZC5Qcm9ibGVtTWF0Y2hlckZvdW5kRXJyb3JzO1xuXHR0ZXJtaW5hbElkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCB0eXBlIElUYXNrRXZlbnQgPVxuXHR8IElUYXNrQ2hhbmdlZEV2ZW50XG5cdHwgSVRhc2tQcm9jZXNzU3RhcnRlZEV2ZW50XG5cdHwgSVRhc2tQcm9jZXNzRW5kZWRFdmVudFxuXHR8IElUYXNrVGVybWluYXRlZEV2ZW50XG5cdHwgSVRhc2tTdGFydGVkRXZlbnRcblx0fCBJVGFza0dlbmVyYWxFdmVudFxuXHR8IElUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZEV2ZW50O1xuXG5leHBvcnQgY29uc3QgZW51bSBUYXNrUnVuU291cmNlIHtcblx0U3lzdGVtLFxuXHRVc2VyLFxuXHRGb2xkZXJPcGVuLFxuXHRDb25maWd1cmF0aW9uQ2hhbmdlLFxuXHRSZWNvbm5lY3QsXG5cdENoYXRBZ2VudFxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRhc2tFdmVudCB7XG5cdGZ1bmN0aW9uIGNvbW1vbih0YXNrOiBUYXNrKTogSVRhc2tDb21tb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0YXNrSWQ6IHRhc2suX2lkLFxuXHRcdFx0dGFza05hbWU6IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSxcblx0XHRcdHJ1blR5cGU6IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kID8gVGFza1J1blR5cGUuQmFja2dyb3VuZCA6IFRhc2tSdW5UeXBlLlNpbmdsZVJ1bixcblx0XHRcdGdyb3VwOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwLFxuXHRcdFx0X190YXNrOiB0YXNrLFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gc3RhcnQodGFzazogVGFzaywgdGVybWluYWxJZDogbnVtYmVyLCByZXNvbHZlZFZhcmlhYmxlczogTWFwPHN0cmluZywgc3RyaW5nPik6IElUYXNrU3RhcnRlZEV2ZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY29tbW9uKHRhc2spLFxuXHRcdFx0a2luZDogVGFza0V2ZW50S2luZC5TdGFydCxcblx0XHRcdHRlcm1pbmFsSWQsXG5cdFx0XHRyZXNvbHZlZFZhcmlhYmxlcyxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHByb2Nlc3NTdGFydGVkKHRhc2s6IFRhc2ssIHRlcm1pbmFsSWQ6IG51bWJlciwgcHJvY2Vzc0lkOiBudW1iZXIpOiBJVGFza1Byb2Nlc3NTdGFydGVkRXZlbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tb24odGFzayksXG5cdFx0XHRraW5kOiBUYXNrRXZlbnRLaW5kLlByb2Nlc3NTdGFydGVkLFxuXHRcdFx0dGVybWluYWxJZCxcblx0XHRcdHByb2Nlc3NJZCxcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBwcm9jZXNzRW5kZWQodGFzazogVGFzaywgdGVybWluYWxJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkLCBkdXJhdGlvbk1zPzogbnVtYmVyKTogSVRhc2tQcm9jZXNzRW5kZWRFdmVudCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1vbih0YXNrKSxcblx0XHRcdGtpbmQ6IFRhc2tFdmVudEtpbmQuUHJvY2Vzc0VuZGVkLFxuXHRcdFx0dGVybWluYWxJZCxcblx0XHRcdGV4aXRDb2RlLFxuXHRcdFx0ZHVyYXRpb25Ncyxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGluYWN0aXZlKHRhc2s6IFRhc2ssIHRlcm1pbmFsSWQ/OiBudW1iZXIsIGR1cmF0aW9uTXM/OiBudW1iZXIpOiBJVGFza0luYWN0aXZlRXZlbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tb24odGFzayksXG5cdFx0XHRraW5kOiBUYXNrRXZlbnRLaW5kLkluYWN0aXZlLFxuXHRcdFx0dGVybWluYWxJZCxcblx0XHRcdGR1cmF0aW9uTXMsXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0ZXJtaW5hdGVkKHRhc2s6IFRhc2ssIHRlcm1pbmFsSWQ6IG51bWJlciwgZXhpdFJlYXNvbjogVGVybWluYWxFeGl0UmVhc29uIHwgdW5kZWZpbmVkKTogSVRhc2tUZXJtaW5hdGVkRXZlbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tb24odGFzayksXG5cdFx0XHRraW5kOiBUYXNrRXZlbnRLaW5kLlRlcm1pbmF0ZWQsXG5cdFx0XHRleGl0UmVhc29uLFxuXHRcdFx0dGVybWluYWxJZCxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYWwoa2luZDogVGFza0V2ZW50S2luZC5BY3F1aXJlZElucHV0IHwgVGFza0V2ZW50S2luZC5EZXBlbmRzT25TdGFydGVkIHwgVGFza0V2ZW50S2luZC5BY3RpdmUgfCBUYXNrRXZlbnRLaW5kLkluYWN0aXZlIHwgVGFza0V2ZW50S2luZC5FbmQgfCBUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyU3RhcnRlZCB8IFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJGb3VuZEVycm9ycywgdGFzazogVGFzaywgdGVybWluYWxJZD86IG51bWJlcik6IElUYXNrR2VuZXJhbEV2ZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY29tbW9uKHRhc2spLFxuXHRcdFx0a2luZCxcblx0XHRcdHRlcm1pbmFsSWQsXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBwcm9ibGVtTWF0Y2hlckVuZGVkKHRhc2s6IFRhc2ssIGhhc0Vycm9yczogYm9vbGVhbiwgdGVybWluYWxJZD86IG51bWJlcik6IElUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZEV2ZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY29tbW9uKHRhc2spLFxuXHRcdFx0a2luZDogVGFza0V2ZW50S2luZC5Qcm9ibGVtTWF0Y2hlckVuZGVkLFxuXHRcdFx0aGFzRXJyb3JzLFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gY2hhbmdlZCgpOiBJVGFza0NoYW5nZWRFdmVudCB7XG5cdFx0cmV0dXJuIHsga2luZDogVGFza0V2ZW50S2luZC5DaGFuZ2VkIH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBLZXllZFRhc2tJZGVudGlmaWVyIHtcblx0ZnVuY3Rpb24gc29ydGVkU3RyaW5naWZ5KGxpdGVyYWw6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogc3RyaW5nIHtcblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXMobGl0ZXJhbCkuc29ydCgpO1xuXHRcdGxldCByZXN1bHQ6IHN0cmluZyA9ICcnO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdGxldCBzdHJpbmdpZmllZCA9IGxpdGVyYWxba2V5XTtcblx0XHRcdGlmIChzdHJpbmdpZmllZCBpbnN0YW5jZW9mIE9iamVjdCkge1xuXHRcdFx0XHRzdHJpbmdpZmllZCA9IHNvcnRlZFN0cmluZ2lmeShzdHJpbmdpZmllZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBzdHJpbmdpZmllZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0c3RyaW5naWZpZWQgPSBzdHJpbmdpZmllZC5yZXBsYWNlKC8sL2csICcsLCcpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0ICs9IGtleSArICcsJyArIHN0cmluZ2lmaWVkICsgJywnO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBjcmVhdGUodmFsdWU6IElUYXNrSWRlbnRpZmllcik6IEtleWVkVGFza0lkZW50aWZpZXIge1xuXHRcdGNvbnN0IHJlc3VsdEtleSA9IHNvcnRlZFN0cmluZ2lmeSh2YWx1ZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0geyBfa2V5OiByZXN1bHRLZXksIHR5cGU6IHZhbHVlLnRhc2tUeXBlIGFzIHN0cmluZyB9O1xuXHRcdE9iamVjdC5hc3NpZ24ocmVzdWx0LCB2YWx1ZSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBUYXNrU2V0dGluZ0lkIHtcblx0QXV0b0RldGVjdCA9ICd0YXNrLmF1dG9EZXRlY3QnLFxuXHRTYXZlQmVmb3JlUnVuID0gJ3Rhc2suc2F2ZUJlZm9yZVJ1bicsXG5cdFNob3dEZWNvcmF0aW9ucyA9ICd0YXNrLnNob3dEZWNvcmF0aW9ucycsXG5cdFByb2JsZW1NYXRjaGVyc05ldmVyUHJvbXB0ID0gJ3Rhc2sucHJvYmxlbU1hdGNoZXJzLm5ldmVyUHJvbXB0Jyxcblx0U2xvd1Byb3ZpZGVyV2FybmluZyA9ICd0YXNrLnNsb3dQcm92aWRlcldhcm5pbmcnLFxuXHRRdWlja09wZW5IaXN0b3J5ID0gJ3Rhc2sucXVpY2tPcGVuLmhpc3RvcnknLFxuXHRRdWlja09wZW5EZXRhaWwgPSAndGFzay5xdWlja09wZW4uZGV0YWlsJyxcblx0UXVpY2tPcGVuU2tpcCA9ICd0YXNrLnF1aWNrT3Blbi5za2lwJyxcblx0UXVpY2tPcGVuU2hvd0FsbCA9ICd0YXNrLnF1aWNrT3Blbi5zaG93QWxsJyxcblx0QWxsb3dBdXRvbWF0aWNUYXNrcyA9ICd0YXNrLmFsbG93QXV0b21hdGljVGFza3MnLFxuXHRSZWNvbm5lY3Rpb24gPSAndGFzay5yZWNvbm5lY3Rpb24nLFxuXHRWZXJib3NlTG9nZ2luZyA9ICd0YXNrLnZlcmJvc2VMb2dnaW5nJyxcblx0Tm90aWZ5V2luZG93T25UYXNrQ29tcGxldGlvbiA9ICd0YXNrLm5vdGlmeVdpbmRvd09uVGFza0NvbXBsZXRpb24nXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRhc2tzU2NoZW1hUHJvcGVydGllcyB7XG5cdFRhc2tzID0gJ3Rhc2tzJyxcblx0U3VwcHJlc3NUYXNrTmFtZSA9ICd0YXNrcy5zdXBwcmVzc1Rhc2tOYW1lJyxcblx0V2luZG93cyA9ICd0YXNrcy53aW5kb3dzJyxcblx0T3N4ID0gJ3Rhc2tzLm9zeCcsXG5cdExpbnV4ID0gJ3Rhc2tzLmxpbnV4Jyxcblx0U2hvd091dHB1dCA9ICd0YXNrcy5zaG93T3V0cHV0Jyxcblx0SXNTaGVsbENvbW1hbmQgPSAndGFza3MuaXNTaGVsbENvbW1hbmQnLFxuXHRTZXJ2aWNlVGVzdFNldHRpbmcgPSAndGFza3Muc2VydmljZS50ZXN0U2V0dGluZycsXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGFza0RlZmluaXRpb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gY3JlYXRlVGFza0lkZW50aWZpZXIoZXh0ZXJuYWw6IElUYXNrSWRlbnRpZmllciwgcmVwb3J0ZXI6IHsgZXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB9KTogS2V5ZWRUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGVmaW5pdGlvbiA9IFRhc2tEZWZpbml0aW9uUmVnaXN0cnkuZ2V0KGV4dGVybmFsLnR5cGUpO1xuXHRcdGlmIChkZWZpbml0aW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFdlIGhhdmUgbm8gdGFzayBkZWZpbml0aW9uIHNvIHdlIGNhbid0IHNhbml0aXplIHRoZSBsaXRlcmFsLiBUYWtlIGl0IGFzIGlzXG5cdFx0XHRjb25zdCBjb3B5ID0gT2JqZWN0cy5kZWVwQ2xvbmUoZXh0ZXJuYWwpO1xuXHRcdFx0ZGVsZXRlIGNvcHkuX2tleTtcblx0XHRcdHJldHVybiBLZXllZFRhc2tJZGVudGlmaWVyLmNyZWF0ZShjb3B5KTtcblx0XHR9XG5cblx0XHRjb25zdCBsaXRlcmFsOiB7IHR5cGU6IHN0cmluZztbbmFtZTogc3RyaW5nXTogdW5rbm93biB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRsaXRlcmFsLnR5cGUgPSBkZWZpbml0aW9uLnRhc2tUeXBlO1xuXHRcdGNvbnN0IHJlcXVpcmVkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblx0XHRkZWZpbml0aW9uLnJlcXVpcmVkLmZvckVhY2goZWxlbWVudCA9PiByZXF1aXJlZC5hZGQoZWxlbWVudCkpO1xuXG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IGRlZmluaXRpb24ucHJvcGVydGllcztcblx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIE9iamVjdC5rZXlzKHByb3BlcnRpZXMpKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGV4dGVybmFsW3Byb3BlcnR5XTtcblx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsKSB7XG5cdFx0XHRcdGxpdGVyYWxbcHJvcGVydHldID0gdmFsdWU7XG5cdFx0XHR9IGVsc2UgaWYgKHJlcXVpcmVkLmhhcyhwcm9wZXJ0eSkpIHtcblx0XHRcdFx0Y29uc3Qgc2NoZW1hID0gcHJvcGVydGllc1twcm9wZXJ0eV07XG5cdFx0XHRcdGlmIChzY2hlbWEuZGVmYXVsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0bGl0ZXJhbFtwcm9wZXJ0eV0gPSBPYmplY3RzLmRlZXBDbG9uZShzY2hlbWEuZGVmYXVsdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3dpdGNoIChzY2hlbWEudHlwZSkge1xuXHRcdFx0XHRcdFx0Y2FzZSAnYm9vbGVhbic6XG5cdFx0XHRcdFx0XHRcdGxpdGVyYWxbcHJvcGVydHldID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAnbnVtYmVyJzpcblx0XHRcdFx0XHRcdGNhc2UgJ2ludGVnZXInOlxuXHRcdFx0XHRcdFx0XHRsaXRlcmFsW3Byb3BlcnR5XSA9IDA7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdFx0XHRcdFx0bGl0ZXJhbFtwcm9wZXJ0eV0gPSAnJztcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0XHRyZXBvcnRlci5lcnJvcihubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0J1Rhc2tEZWZpbml0aW9uLm1pc3NpbmdSZXF1aXJlZFByb3BlcnR5Jyxcblx0XHRcdFx0XHRcdFx0XHQnRXJyb3I6IHRoZSB0YXNrIGlkZW50aWZpZXIgXFwnezB9XFwnIGlzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIHByb3BlcnR5IFxcJ3sxfVxcJy4gVGhlIHRhc2sgaWRlbnRpZmllciB3aWxsIGJlIGlnbm9yZWQuJywgSlNPTi5zdHJpbmdpZnkoZXh0ZXJuYWwsIHVuZGVmaW5lZCwgMCksIHByb3BlcnR5XG5cdFx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gS2V5ZWRUYXNrSWRlbnRpZmllci5jcmVhdGUobGl0ZXJhbCk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IHJlcnVuVGFza0ljb24gPSByZWdpc3Rlckljb24oJ3JlcnVuLXRhc2snLCBDb2RpY29uLnJlZnJlc2gsIG5scy5sb2NhbGl6ZSgncmVydW5UYXNrSWNvbicsICdWaWV3IGljb24gb2YgdGhlIHJlcnVuIHRhc2suJykpO1xuZXhwb3J0IGNvbnN0IFJlcnVuRm9yQWN0aXZlVGVybWluYWxDb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5yZXJ1bkZvckFjdGl2ZVRlcm1pbmFsJztcbmV4cG9ydCBjb25zdCBSZXJ1bkFsbFJ1bm5pbmdUYXNrc0NvbW1hbmRJZCA9ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJlcnVuQWxsUnVubmluZ1Rhc2tzJztcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFdBQVc7QUFDdkIsWUFBWSxlQUFlO0FBRTNCLFlBQVks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O0FBQ0QscUJBQU87QUFBQSxVQUNUO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTyxvQkFBb0IsT0FBTyxPQUFPO0FBQUEsRUFDMUM7QUE5Q08sRUFBQUEsZ0JBQVM7QUFBQSxHQURBO0FBa0RWLE1BQU0sZ0JBQWdCLGFBQWEsY0FBYyxRQUFRLFNBQVMsSUFBSSxTQUFTLGlCQUFpQiw4QkFBOEIsQ0FBQztBQUMvSCxNQUFNLGtDQUFrQztBQUN4QyxNQUFNLGdDQUFnQzsiLAogICJuYW1lcyI6IFsiU2hlbGxRdW90aW5nIiwgIkNvbW1hbmRPcHRpb25zIiwgIlJldmVhbEtpbmQiLCAiUmV2ZWFsUHJvYmxlbUtpbmQiLCAiUGFuZWxLaW5kIiwgIlByZXNlbnRhdGlvbk9wdGlvbnMiLCAiUnVudGltZVR5cGUiLCAiQ29tbWFuZFN0cmluZyIsICJ2YWx1ZSIsICJUYXNrR3JvdXAiLCAiVGFza1Njb3BlIiwgIlRhc2tTb3VyY2VLaW5kIiwgIkRlcGVuZHNPcmRlciIsICJSdW5Pbk9wdGlvbnMiLCAiSW5zdGFuY2VQb2xpY3kiLCAiUnVuT3B0aW9ucyIsICJFeGVjdXRpb25FbmdpbmUiLCAiSnNvblNjaGVtYVZlcnNpb24iLCAiVGFza1J1blR5cGUiLCAiVGFza0V2ZW50S2luZCIsICJUYXNrUnVuU291cmNlIiwgIlRhc2tFdmVudCIsICJLZXllZFRhc2tJZGVudGlmaWVyIiwgIlRhc2tTZXR0aW5nSWQiLCAiVGFza3NTY2hlbWFQcm9wZXJ0aWVzIiwgIlRhc2tEZWZpbml0aW9uIl0KfQo=
