import * as nls from "../../../../nls.js";
import * as Objects from "../../../../base/common/objects.js";
import { Platform } from "../../../../base/common/platform.js";
import * as Types from "../../../../base/common/types.js";
import * as UUID from "../../../../base/common/uuid.js";
import {
  ProblemMatcherParser,
  isNamedProblemMatcher,
  ProblemMatcherRegistry
} from "./problemMatcher.js";
import * as Tasks from "./tasks.js";
import { TaskDefinitionRegistry } from "./taskDefinitionRegistry.js";
import { ShellExecutionSupportedContext, ProcessExecutionSupportedContext } from "./taskService.js";
var ShellQuoting = /* @__PURE__ */ ((ShellQuoting2) => {
  ShellQuoting2[ShellQuoting2["escape"] = 1] = "escape";
  ShellQuoting2[ShellQuoting2["strong"] = 2] = "strong";
  ShellQuoting2[ShellQuoting2["weak"] = 3] = "weak";
  return ShellQuoting2;
})(ShellQuoting || {});
var ITaskIdentifier;
((ITaskIdentifier2) => {
  function is(value) {
    const candidate = value;
    return candidate !== void 0 && Types.isString(value.type);
  }
  ITaskIdentifier2.is = is;
})(ITaskIdentifier || (ITaskIdentifier = {}));
var CommandString;
((CommandString2) => {
  function value(value2) {
    if (Types.isString(value2)) {
      return value2;
    } else if (Types.isStringArray(value2)) {
      return value2.join(" ");
    } else {
      if (Types.isString(value2.value)) {
        return value2.value;
      } else {
        return value2.value.join(" ");
      }
    }
  }
  CommandString2.value = value;
})(CommandString || (CommandString = {}));
var ProblemMatcherKind = /* @__PURE__ */ ((ProblemMatcherKind2) => {
  ProblemMatcherKind2[ProblemMatcherKind2["Unknown"] = 0] = "Unknown";
  ProblemMatcherKind2[ProblemMatcherKind2["String"] = 1] = "String";
  ProblemMatcherKind2[ProblemMatcherKind2["ProblemMatcher"] = 2] = "ProblemMatcher";
  ProblemMatcherKind2[ProblemMatcherKind2["Array"] = 3] = "Array";
  return ProblemMatcherKind2;
})(ProblemMatcherKind || {});
const EMPTY_ARRAY = [];
Object.freeze(EMPTY_ARRAY);
function assignProperty(target, source, key) {
  const sourceAtKey = source[key];
  if (sourceAtKey !== void 0) {
    target[key] = sourceAtKey;
  }
}
function fillProperty(target, source, key) {
  const sourceAtKey = source[key];
  if (target[key] === void 0 && sourceAtKey !== void 0) {
    target[key] = sourceAtKey;
  }
}
function _isEmpty(value, properties, allowEmptyArray = false) {
  if (value === void 0 || value === null || properties === void 0) {
    return true;
  }
  for (const meta of properties) {
    const property = value[meta.property];
    if (property !== void 0 && property !== null) {
      if (meta.type !== void 0 && !meta.type.isEmpty(property)) {
        return false;
      } else if (!Array.isArray(property) || property.length > 0 || allowEmptyArray) {
        return false;
      }
    }
  }
  return true;
}
function _assignProperties(target, source, properties) {
  if (!source || _isEmpty(source, properties)) {
    return target;
  }
  if (!target || _isEmpty(target, properties)) {
    return source;
  }
  for (const meta of properties) {
    const property = meta.property;
    let value;
    if (meta.type !== void 0) {
      value = meta.type.assignProperties(target[property], source[property]);
    } else {
      value = source[property];
    }
    if (value !== void 0 && value !== null) {
      target[property] = value;
    }
  }
  return target;
}
function _fillProperties(target, source, properties, allowEmptyArray = false) {
  if (!source || _isEmpty(source, properties)) {
    return target;
  }
  if (!target || _isEmpty(target, properties, allowEmptyArray)) {
    return source;
  }
  for (const meta of properties) {
    const property = meta.property;
    let value;
    if (meta.type) {
      value = meta.type.fillProperties(target[property], source[property]);
    } else if (target[property] === void 0) {
      value = source[property];
    }
    if (value !== void 0 && value !== null) {
      target[property] = value;
    }
  }
  return target;
}
function _fillDefaults(target, defaults, properties, context) {
  if (target && Object.isFrozen(target)) {
    return target;
  }
  if (target === void 0 || target === null || defaults === void 0 || defaults === null) {
    if (defaults !== void 0 && defaults !== null) {
      return Objects.deepClone(defaults);
    } else {
      return void 0;
    }
  }
  for (const meta of properties) {
    const property = meta.property;
    if (target[property] !== void 0) {
      continue;
    }
    let value;
    if (meta.type) {
      value = meta.type.fillDefaults(target[property], context);
    } else {
      value = defaults[property];
    }
    if (value !== void 0 && value !== null) {
      target[property] = value;
    }
  }
  return target;
}
function _freeze(target, properties) {
  if (target === void 0 || target === null) {
    return void 0;
  }
  if (Object.isFrozen(target)) {
    return target;
  }
  for (const meta of properties) {
    if (meta.type) {
      const value = target[meta.property];
      if (value) {
        meta.type.freeze(value);
      }
    }
  }
  Object.freeze(target);
  return target;
}
var RunOnOptions;
((RunOnOptions2) => {
  function fromString(value) {
    if (!value) {
      return Tasks.RunOnOptions.default;
    }
    switch (value.toLowerCase()) {
      case "folderopen":
        return Tasks.RunOnOptions.folderOpen;
      case "worktreecreated":
        return Tasks.RunOnOptions.worktreeCreated;
      case "default":
      default:
        return Tasks.RunOnOptions.default;
    }
  }
  RunOnOptions2.fromString = fromString;
})(RunOnOptions || (RunOnOptions = {}));
var RunOptions;
((RunOptions2) => {
  const properties = [{ property: "reevaluateOnRerun" }, { property: "runOn" }, { property: "instanceLimit" }, { property: "instancePolicy" }];
  function fromConfiguration(value) {
    return {
      reevaluateOnRerun: value ? value.reevaluateOnRerun : true,
      runOn: value ? RunOnOptions.fromString(value.runOn) : Tasks.RunOnOptions.default,
      instanceLimit: value?.instanceLimit ? Math.max(value.instanceLimit, 1) : 1,
      instancePolicy: value ? InstancePolicy.fromString(value.instancePolicy) : Tasks.InstancePolicy.prompt
    };
  }
  RunOptions2.fromConfiguration = fromConfiguration;
  function assignProperties(target, source) {
    return _assignProperties(target, source, properties);
  }
  RunOptions2.assignProperties = assignProperties;
  function fillProperties(target, source) {
    return _fillProperties(target, source, properties);
  }
  RunOptions2.fillProperties = fillProperties;
})(RunOptions || (RunOptions = {}));
var InstancePolicy;
((InstancePolicy2) => {
  function fromString(value) {
    if (!value) {
      return Tasks.InstancePolicy.prompt;
    }
    switch (value.toLowerCase()) {
      case "terminatenewest":
        return Tasks.InstancePolicy.terminateNewest;
      case "terminateoldest":
        return Tasks.InstancePolicy.terminateOldest;
      case "warn":
        return Tasks.InstancePolicy.warn;
      case "silent":
        return Tasks.InstancePolicy.silent;
      case "prompt":
      default:
        return Tasks.InstancePolicy.prompt;
    }
  }
  InstancePolicy2.fromString = fromString;
})(InstancePolicy || (InstancePolicy = {}));
var ShellConfiguration;
((ShellConfiguration2) => {
  const properties = [{ property: "executable" }, { property: "args" }, { property: "quoting" }];
  function is(value) {
    const candidate = value;
    return candidate && (Types.isString(candidate.executable) || Types.isStringArray(candidate.args));
  }
  ShellConfiguration2.is = is;
  function from(config, context) {
    if (!is(config)) {
      return void 0;
    }
    const result = {};
    if (config.executable !== void 0) {
      result.executable = config.executable;
    }
    if (config.args !== void 0) {
      result.args = config.args.slice();
    }
    if (config.quoting !== void 0) {
      result.quoting = Objects.deepClone(config.quoting);
    }
    return result;
  }
  ShellConfiguration2.from = from;
  function isEmpty(value) {
    return _isEmpty(value, properties, true);
  }
  ShellConfiguration2.isEmpty = isEmpty;
  function assignProperties(target, source) {
    return _assignProperties(target, source, properties);
  }
  ShellConfiguration2.assignProperties = assignProperties;
  function fillProperties(target, source) {
    return _fillProperties(target, source, properties, true);
  }
  ShellConfiguration2.fillProperties = fillProperties;
  function fillDefaults(value, context) {
    return value;
  }
  ShellConfiguration2.fillDefaults = fillDefaults;
  function freeze(value) {
    if (!value) {
      return void 0;
    }
    return Object.freeze(value);
  }
  ShellConfiguration2.freeze = freeze;
})(ShellConfiguration || (ShellConfiguration = {}));
var CommandOptions;
((CommandOptions2) => {
  const properties = [{ property: "cwd" }, { property: "env" }, { property: "shell", type: ShellConfiguration }];
  const defaults = { cwd: "${workspaceFolder}" };
  function from(options, context) {
    const result = {};
    if (options.cwd !== void 0) {
      if (Types.isString(options.cwd)) {
        result.cwd = options.cwd;
      } else {
        context.taskLoadIssues.push(nls.localize("ConfigurationParser.invalidCWD", "Warning: options.cwd must be of type string. Ignoring value {0}\n", options.cwd));
      }
    }
    if (options.env !== void 0) {
      result.env = Objects.deepClone(options.env);
    }
    result.shell = ShellConfiguration.from(options.shell, context);
    return isEmpty(result) ? void 0 : result;
  }
  CommandOptions2.from = from;
  function isEmpty(value) {
    return _isEmpty(value, properties);
  }
  CommandOptions2.isEmpty = isEmpty;
  function assignProperties(target, source) {
    if (source === void 0 || isEmpty(source)) {
      return target;
    }
    if (target === void 0 || isEmpty(target)) {
      return source;
    }
    assignProperty(target, source, "cwd");
    if (target.env === void 0) {
      target.env = source.env;
    } else if (source.env !== void 0) {
      const env = /* @__PURE__ */ Object.create(null);
      if (target.env !== void 0) {
        Object.keys(target.env).forEach((key) => env[key] = target.env[key]);
      }
      if (source.env !== void 0) {
        Object.keys(source.env).forEach((key) => env[key] = source.env[key]);
      }
      target.env = env;
    }
    target.shell = ShellConfiguration.assignProperties(target.shell, source.shell);
    return target;
  }
  CommandOptions2.assignProperties = assignProperties;
  function fillProperties(target, source) {
    return _fillProperties(target, source, properties);
  }
  CommandOptions2.fillProperties = fillProperties;
  function fillDefaults(value, context) {
    return _fillDefaults(value, defaults, properties, context);
  }
  CommandOptions2.fillDefaults = fillDefaults;
  function freeze(value) {
    return _freeze(value, properties);
  }
  CommandOptions2.freeze = freeze;
})(CommandOptions || (CommandOptions = {}));
var CommandConfiguration;
((CommandConfiguration2) => {
  let PresentationOptions;
  ((PresentationOptions2) => {
    const properties2 = [{ property: "echo" }, { property: "reveal" }, { property: "revealProblems" }, { property: "focus" }, { property: "panel" }, { property: "showReuseMessage" }, { property: "clear" }, { property: "group" }, { property: "close" }, { property: "preserveTerminalName" }];
    function from2(config, context) {
      let echo;
      let reveal;
      let revealProblems;
      let focus;
      let panel;
      let showReuseMessage;
      let clear;
      let group;
      let close;
      let preserveTerminalName;
      let hasProps = false;
      if (Types.isBoolean(config.echoCommand)) {
        echo = config.echoCommand;
        hasProps = true;
      }
      if (Types.isString(config.showOutput)) {
        reveal = Tasks.RevealKind.fromString(config.showOutput);
        hasProps = true;
      }
      const presentation = config.presentation || config.terminal;
      if (presentation) {
        if (Types.isBoolean(presentation.echo)) {
          echo = presentation.echo;
        }
        if (Types.isString(presentation.reveal)) {
          reveal = Tasks.RevealKind.fromString(presentation.reveal);
        }
        if (Types.isString(presentation.revealProblems)) {
          revealProblems = Tasks.RevealProblemKind.fromString(presentation.revealProblems);
        }
        if (Types.isBoolean(presentation.focus)) {
          focus = presentation.focus;
        }
        if (Types.isString(presentation.panel)) {
          panel = Tasks.PanelKind.fromString(presentation.panel);
        }
        if (Types.isBoolean(presentation.showReuseMessage)) {
          showReuseMessage = presentation.showReuseMessage;
        }
        if (Types.isBoolean(presentation.clear)) {
          clear = presentation.clear;
        }
        if (Types.isString(presentation.group)) {
          group = presentation.group;
        }
        if (Types.isBoolean(presentation.close)) {
          close = presentation.close;
        }
        if (Types.isBoolean(presentation.preserveTerminalName)) {
          preserveTerminalName = presentation.preserveTerminalName;
        }
        hasProps = true;
      }
      if (!hasProps) {
        return void 0;
      }
      return { echo, reveal, revealProblems, focus, panel, showReuseMessage, clear, group, close, preserveTerminalName };
    }
    PresentationOptions2.from = from2;
    function assignProperties2(target, source) {
      return _assignProperties(target, source, properties2);
    }
    PresentationOptions2.assignProperties = assignProperties2;
    function fillProperties2(target, source) {
      return _fillProperties(target, source, properties2);
    }
    PresentationOptions2.fillProperties = fillProperties2;
    function fillDefaults2(value, context) {
      const defaultEcho = context.engine === Tasks.ExecutionEngine.Terminal ? true : false;
      return _fillDefaults(value, { echo: defaultEcho, reveal: Tasks.RevealKind.Always, revealProblems: Tasks.RevealProblemKind.Never, focus: false, panel: Tasks.PanelKind.Shared, showReuseMessage: true, clear: false, preserveTerminalName: false }, properties2, context);
    }
    PresentationOptions2.fillDefaults = fillDefaults2;
    function freeze2(value) {
      return _freeze(value, properties2);
    }
    PresentationOptions2.freeze = freeze2;
    function isEmpty2(value) {
      return _isEmpty(value, properties2);
    }
    PresentationOptions2.isEmpty = isEmpty2;
  })(PresentationOptions = CommandConfiguration2.PresentationOptions || (CommandConfiguration2.PresentationOptions = {}));
  let ShellString;
  ((ShellString2) => {
    function from2(value) {
      if (value === void 0 || value === null) {
        return void 0;
      }
      if (Types.isString(value)) {
        return value;
      } else if (Types.isStringArray(value)) {
        return value.join(" ");
      } else {
        const quoting = Tasks.ShellQuoting.from(value.quoting);
        const result = Types.isString(value.value) ? value.value : Types.isStringArray(value.value) ? value.value.join(" ") : void 0;
        if (result) {
          return {
            value: result,
            quoting
          };
        } else {
          return void 0;
        }
      }
    }
    ShellString2.from = from2;
  })(ShellString || (ShellString = {}));
  const properties = [
    { property: "runtime" },
    { property: "name" },
    { property: "options", type: CommandOptions },
    { property: "args" },
    { property: "taskSelector" },
    { property: "suppressTaskName" },
    { property: "presentation", type: PresentationOptions }
  ];
  function from(config, context) {
    let result = fromBase(config, context);
    let osConfig = void 0;
    if (config.windows && context.platform === Platform.Windows) {
      osConfig = fromBase(config.windows, context);
    } else if (config.osx && context.platform === Platform.Mac) {
      osConfig = fromBase(config.osx, context);
    } else if (config.linux && context.platform === Platform.Linux) {
      osConfig = fromBase(config.linux, context);
    }
    if (osConfig) {
      result = assignProperties(result, osConfig, context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0);
    }
    return isEmpty(result) ? void 0 : result;
  }
  CommandConfiguration2.from = from;
  function fromBase(config, context) {
    const name = ShellString.from(config.command);
    let runtime;
    if (Types.isString(config.type)) {
      if (config.type === "shell" || config.type === "process") {
        runtime = Tasks.RuntimeType.fromString(config.type);
      }
    }
    if (Types.isBoolean(config.isShellCommand) || ShellConfiguration.is(config.isShellCommand)) {
      runtime = Tasks.RuntimeType.Shell;
    } else if (config.isShellCommand !== void 0) {
      runtime = !!config.isShellCommand ? Tasks.RuntimeType.Shell : Tasks.RuntimeType.Process;
    }
    const result = {
      name,
      runtime,
      presentation: PresentationOptions.from(config, context)
    };
    if (config.args !== void 0) {
      result.args = [];
      for (const arg of config.args) {
        const converted = ShellString.from(arg);
        if (converted !== void 0) {
          result.args.push(converted);
        } else {
          context.taskLoadIssues.push(
            nls.localize(
              "ConfigurationParser.inValidArg",
              "Error: command argument must either be a string or a quoted string. Provided value is:\n{0}",
              arg ? JSON.stringify(arg, void 0, 4) : "undefined"
            )
          );
        }
      }
    }
    if (config.options !== void 0) {
      result.options = CommandOptions.from(config.options, context);
      if (result.options && result.options.shell === void 0 && ShellConfiguration.is(config.isShellCommand)) {
        result.options.shell = ShellConfiguration.from(config.isShellCommand, context);
        if (context.engine !== Tasks.ExecutionEngine.Terminal) {
          context.taskLoadIssues.push(nls.localize("ConfigurationParser.noShell", "Warning: shell configuration is only supported when executing tasks in the terminal."));
        }
      }
    }
    if (Types.isString(config.taskSelector)) {
      result.taskSelector = config.taskSelector;
    }
    if (Types.isBoolean(config.suppressTaskName)) {
      result.suppressTaskName = config.suppressTaskName;
    }
    return isEmpty(result) ? void 0 : result;
  }
  function hasCommand(value) {
    return value && !!value.name;
  }
  CommandConfiguration2.hasCommand = hasCommand;
  function isEmpty(value) {
    return _isEmpty(value, properties);
  }
  CommandConfiguration2.isEmpty = isEmpty;
  function assignProperties(target, source, overwriteArgs) {
    if (isEmpty(source)) {
      return target;
    }
    if (isEmpty(target)) {
      return source;
    }
    assignProperty(target, source, "name");
    assignProperty(target, source, "runtime");
    assignProperty(target, source, "taskSelector");
    assignProperty(target, source, "suppressTaskName");
    if (source.args !== void 0) {
      if (target.args === void 0 || overwriteArgs) {
        target.args = source.args;
      } else {
        target.args = target.args.concat(source.args);
      }
    }
    target.presentation = PresentationOptions.assignProperties(target.presentation, source.presentation);
    target.options = CommandOptions.assignProperties(target.options, source.options);
    return target;
  }
  CommandConfiguration2.assignProperties = assignProperties;
  function fillProperties(target, source) {
    return _fillProperties(target, source, properties);
  }
  CommandConfiguration2.fillProperties = fillProperties;
  function fillGlobals(target, source, taskName) {
    if (source === void 0 || isEmpty(source)) {
      return target;
    }
    target = target || {
      name: void 0,
      runtime: void 0,
      presentation: void 0
    };
    if (target.name === void 0) {
      fillProperty(target, source, "name");
      fillProperty(target, source, "taskSelector");
      fillProperty(target, source, "suppressTaskName");
      let args = source.args ? source.args.slice() : [];
      if (!target.suppressTaskName && taskName) {
        if (target.taskSelector !== void 0) {
          args.push(target.taskSelector + taskName);
        } else {
          args.push(taskName);
        }
      }
      if (target.args) {
        args = args.concat(target.args);
      }
      target.args = args;
    }
    fillProperty(target, source, "runtime");
    target.presentation = PresentationOptions.fillProperties(target.presentation, source.presentation);
    target.options = CommandOptions.fillProperties(target.options, source.options);
    return target;
  }
  CommandConfiguration2.fillGlobals = fillGlobals;
  function fillDefaults(value, context) {
    if (!value || Object.isFrozen(value)) {
      return;
    }
    if (value.name !== void 0 && value.runtime === void 0) {
      value.runtime = Tasks.RuntimeType.Process;
    }
    value.presentation = PresentationOptions.fillDefaults(value.presentation, context);
    if (!isEmpty(value)) {
      value.options = CommandOptions.fillDefaults(value.options, context);
    }
    if (value.args === void 0) {
      value.args = EMPTY_ARRAY;
    }
    if (value.suppressTaskName === void 0) {
      value.suppressTaskName = context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
    }
  }
  CommandConfiguration2.fillDefaults = fillDefaults;
  function freeze(value) {
    return _freeze(value, properties);
  }
  CommandConfiguration2.freeze = freeze;
})(CommandConfiguration || (CommandConfiguration = {}));
var ProblemMatcherConverter;
((ProblemMatcherConverter2) => {
  function namedFrom(declares, context) {
    const result = /* @__PURE__ */ Object.create(null);
    if (!Array.isArray(declares)) {
      return result;
    }
    declares.forEach((value) => {
      const namedProblemMatcher = new ProblemMatcherParser(context.problemReporter).parse(value);
      if (isNamedProblemMatcher(namedProblemMatcher)) {
        result[namedProblemMatcher.name] = namedProblemMatcher;
      } else {
        context.problemReporter.error(nls.localize("ConfigurationParser.noName", "Error: Problem Matcher in declare scope must have a name:\n{0}\n", JSON.stringify(value, void 0, 4)));
      }
    });
    return result;
  }
  ProblemMatcherConverter2.namedFrom = namedFrom;
  function fromWithOsConfig(external, context) {
    let result = {};
    const osExternal = external;
    if (osExternal.windows?.problemMatcher && context.platform === Platform.Windows) {
      result = from(osExternal.windows.problemMatcher, context);
    } else if (osExternal.osx?.problemMatcher && context.platform === Platform.Mac) {
      result = from(osExternal.osx.problemMatcher, context);
    } else if (osExternal.linux?.problemMatcher && context.platform === Platform.Linux) {
      result = from(osExternal.linux.problemMatcher, context);
    } else if (external.problemMatcher) {
      result = from(external.problemMatcher, context);
    }
    return result;
  }
  ProblemMatcherConverter2.fromWithOsConfig = fromWithOsConfig;
  function from(config, context) {
    const result = [];
    if (config === void 0) {
      return { value: result };
    }
    const errors = [];
    function addResult(matcher) {
      if (matcher.value) {
        result.push(matcher.value);
      }
      if (matcher.errors) {
        errors.push(...matcher.errors);
      }
    }
    const kind = getProblemMatcherKind(config);
    if (kind === 0 /* Unknown */) {
      const error = nls.localize(
        "ConfigurationParser.unknownMatcherKind",
        "Warning: the defined problem matcher is unknown. Supported types are string | ProblemMatcher | Array<string | ProblemMatcher>.\n{0}\n",
        JSON.stringify(config, null, 4)
      );
      context.problemReporter.warn(error);
    } else if (kind === 1 /* String */ || kind === 2 /* ProblemMatcher */) {
      addResult(resolveProblemMatcher(config, context));
    } else if (kind === 3 /* Array */) {
      const problemMatchers = config;
      problemMatchers.forEach((problemMatcher) => {
        addResult(resolveProblemMatcher(problemMatcher, context));
      });
    }
    return { value: result, errors };
  }
  ProblemMatcherConverter2.from = from;
  function getProblemMatcherKind(value) {
    if (Types.isString(value)) {
      return 1 /* String */;
    } else if (Array.isArray(value)) {
      return 3 /* Array */;
    } else if (!Types.isUndefined(value)) {
      return 2 /* ProblemMatcher */;
    } else {
      return 0 /* Unknown */;
    }
  }
  function resolveProblemMatcher(value, context) {
    if (Types.isString(value)) {
      let variableName = value;
      if (variableName.length > 1 && variableName[0] === "$") {
        variableName = variableName.substring(1);
        const global = ProblemMatcherRegistry.get(variableName);
        if (global) {
          return { value: Objects.deepClone(global) };
        }
        let localProblemMatcher = context.namedProblemMatchers[variableName];
        if (localProblemMatcher) {
          localProblemMatcher = Objects.deepClone(localProblemMatcher);
          delete localProblemMatcher.name;
          return { value: localProblemMatcher };
        }
      }
      return { errors: [nls.localize("ConfigurationParser.invalidVariableReference", "Error: Invalid problemMatcher reference: {0}\n", value)] };
    } else {
      const json = value;
      return { value: new ProblemMatcherParser(context.problemReporter).parse(json) };
    }
  }
})(ProblemMatcherConverter || (ProblemMatcherConverter = {}));
var GroupKind;
((GroupKind2) => {
  function from(external) {
    if (external === void 0) {
      return void 0;
    } else if (Types.isString(external) && Tasks.TaskGroup.is(external)) {
      return { _id: external, isDefault: false };
    } else if (Types.isString(external.kind) && Tasks.TaskGroup.is(external.kind)) {
      const group = external.kind;
      const isDefault = Types.isUndefined(external.isDefault) ? false : external.isDefault;
      return { _id: group, isDefault };
    }
    return void 0;
  }
  GroupKind2.from = from;
  function to(group) {
    if (Types.isString(group)) {
      return group;
    } else if (!group.isDefault) {
      return group._id;
    }
    return {
      kind: group._id,
      isDefault: group.isDefault
    };
  }
  GroupKind2.to = to;
})(GroupKind || (GroupKind = {}));
var TaskDependency;
((TaskDependency2) => {
  function uriFromSource(context, source) {
    switch (source) {
      case 2 /* User */:
        return Tasks.USER_TASKS_GROUP_KEY;
      case 0 /* TasksJson */:
        return context.workspaceFolder.uri;
      default:
        return context.workspace && context.workspace.configuration ? context.workspace.configuration : context.workspaceFolder.uri;
    }
  }
  function from(external, context, source) {
    if (Types.isString(external)) {
      return { uri: uriFromSource(context, source), task: external };
    } else if (ITaskIdentifier.is(external)) {
      return {
        uri: uriFromSource(context, source),
        task: Tasks.TaskDefinition.createTaskIdentifier(external, context.problemReporter)
      };
    } else {
      return void 0;
    }
  }
  TaskDependency2.from = from;
})(TaskDependency || (TaskDependency = {}));
var DependsOrder;
((DependsOrder2) => {
  function from(order) {
    switch (order) {
      case Tasks.DependsOrder.sequence:
        return Tasks.DependsOrder.sequence;
      case Tasks.DependsOrder.parallel:
      default:
        return Tasks.DependsOrder.parallel;
    }
  }
  DependsOrder2.from = from;
})(DependsOrder || (DependsOrder = {}));
var ConfigurationProperties;
((ConfigurationProperties2) => {
  const properties = [
    { property: "name" },
    { property: "identifier" },
    { property: "group" },
    { property: "isBackground" },
    { property: "promptOnClose" },
    { property: "dependsOn" },
    { property: "presentation", type: CommandConfiguration.PresentationOptions },
    { property: "problemMatchers" },
    { property: "options" },
    { property: "icon" },
    { property: "hide" },
    { property: "inAgents" }
  ];
  function from(external, context, includeCommandOptions, source, properties2) {
    if (!external) {
      return {};
    }
    const result = {};
    if (properties2) {
      for (const propertyName of Object.keys(properties2)) {
        if (external[propertyName] !== void 0) {
          result[propertyName] = Objects.deepClone(external[propertyName]);
        }
      }
    }
    if (Types.isString(external.taskName)) {
      result.name = external.taskName;
    }
    if (Types.isString(external.label) && context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0) {
      result.name = external.label;
    }
    if (Types.isString(external.identifier)) {
      result.identifier = external.identifier;
    }
    result.icon = external.icon;
    result.hide = external.hide;
    result.inAgents = external.inAgents;
    if (external.isBackground !== void 0) {
      result.isBackground = !!external.isBackground;
    }
    if (external.promptOnClose !== void 0) {
      result.promptOnClose = !!external.promptOnClose;
    }
    result.group = GroupKind.from(external.group);
    if (external.dependsOn !== void 0) {
      if (Array.isArray(external.dependsOn)) {
        result.dependsOn = external.dependsOn.reduce((dependencies, item) => {
          const dependency = TaskDependency.from(item, context, source);
          if (dependency) {
            dependencies.push(dependency);
          }
          return dependencies;
        }, []);
      } else {
        const dependsOnValue = TaskDependency.from(external.dependsOn, context, source);
        result.dependsOn = dependsOnValue ? [dependsOnValue] : void 0;
      }
    }
    result.dependsOrder = DependsOrder.from(external.dependsOrder);
    if (includeCommandOptions && (external.presentation !== void 0 || external.terminal !== void 0)) {
      result.presentation = CommandConfiguration.PresentationOptions.from(external, context);
    }
    if (includeCommandOptions && external.options !== void 0) {
      result.options = CommandOptions.from(external.options, context);
    }
    const configProblemMatcher = ProblemMatcherConverter.fromWithOsConfig(external, context);
    if (configProblemMatcher.value !== void 0) {
      result.problemMatchers = configProblemMatcher.value;
    }
    if (external.detail) {
      result.detail = external.detail;
    }
    return isEmpty(result) ? {} : { value: result, errors: configProblemMatcher.errors };
  }
  ConfigurationProperties2.from = from;
  function isEmpty(value) {
    return _isEmpty(value, properties);
  }
  ConfigurationProperties2.isEmpty = isEmpty;
})(ConfigurationProperties || (ConfigurationProperties = {}));
const label = "Workspace";
var ConfiguringTask;
((ConfiguringTask2) => {
  const grunt = "grunt.";
  const jake = "jake.";
  const gulp = "gulp.";
  const npm = "vscode.npm.";
  const typescript = "vscode.typescript.";
  function from(external, context, index, source, registry) {
    if (!external) {
      return void 0;
    }
    const type = external.type;
    const customize = external.customize;
    if (!type && !customize) {
      context.problemReporter.error(nls.localize("ConfigurationParser.noTaskType", "Error: tasks configuration must have a type property. The configuration will be ignored.\n{0}\n", JSON.stringify(external, null, 4)));
      return void 0;
    }
    const typeDeclaration = type ? registry?.get?.(type) || TaskDefinitionRegistry.get(type) : void 0;
    if (!typeDeclaration) {
      const message = nls.localize("ConfigurationParser.noTypeDefinition", "Error: there is no registered task type '{0}'. Did you miss installing an extension that provides a corresponding task provider?", type);
      context.problemReporter.error(message);
      return void 0;
    }
    let identifier;
    if (Types.isString(customize)) {
      if (customize.indexOf(grunt) === 0) {
        identifier = { type: "grunt", task: customize.substring(grunt.length) };
      } else if (customize.indexOf(jake) === 0) {
        identifier = { type: "jake", task: customize.substring(jake.length) };
      } else if (customize.indexOf(gulp) === 0) {
        identifier = { type: "gulp", task: customize.substring(gulp.length) };
      } else if (customize.indexOf(npm) === 0) {
        identifier = { type: "npm", script: customize.substring(npm.length + 4) };
      } else if (customize.indexOf(typescript) === 0) {
        identifier = { type: "typescript", tsconfig: customize.substring(typescript.length + 6) };
      }
    } else {
      if (Types.isString(external.type)) {
        identifier = external;
      }
    }
    if (identifier === void 0) {
      context.problemReporter.error(nls.localize(
        "ConfigurationParser.missingType",
        "Error: the task configuration '{0}' is missing the required property 'type'. The task configuration will be ignored.",
        JSON.stringify(external, void 0, 0)
      ));
      return void 0;
    }
    const taskIdentifier = Tasks.TaskDefinition.createTaskIdentifier(identifier, context.problemReporter);
    if (taskIdentifier === void 0) {
      context.problemReporter.error(nls.localize(
        "ConfigurationParser.incorrectType",
        "Error: the task configuration '{0}' is using an unknown type. The task configuration will be ignored.",
        JSON.stringify(external, void 0, 0)
      ));
      return void 0;
    }
    const configElement = {
      workspaceFolder: context.workspaceFolder,
      file: ".vscode/tasks.json",
      index,
      element: external
    };
    let taskSource;
    switch (source) {
      case 2 /* User */: {
        taskSource = { kind: Tasks.TaskSourceKind.User, config: configElement, label };
        break;
      }
      case 1 /* WorkspaceFile */: {
        taskSource = { kind: Tasks.TaskSourceKind.WorkspaceFile, config: configElement, label };
        break;
      }
      default: {
        taskSource = { kind: Tasks.TaskSourceKind.Workspace, config: configElement, label };
        break;
      }
    }
    const result = new Tasks.ConfiguringTask(
      `${typeDeclaration.extensionId}.${taskIdentifier._key}`,
      taskSource,
      void 0,
      type,
      taskIdentifier,
      RunOptions.fromConfiguration(external.runOptions),
      { hide: external.hide, inAgents: external.inAgents }
    );
    const configuration = ConfigurationProperties.from(external, context, true, source, typeDeclaration.properties);
    result.addTaskLoadMessages(configuration.errors);
    if (configuration.value) {
      result.configurationProperties = Object.assign(result.configurationProperties, configuration.value);
      if (result.configurationProperties.name) {
        result._label = result.configurationProperties.name;
      } else {
        let label2 = result.configures.type;
        if (typeDeclaration.required && typeDeclaration.required.length > 0) {
          for (const required of typeDeclaration.required) {
            const value = result.configures[required];
            if (value) {
              label2 = label2 + ": " + value;
              break;
            }
          }
        }
        result._label = label2;
      }
      if (!result.configurationProperties.identifier) {
        result.configurationProperties.identifier = taskIdentifier._key;
      }
    }
    return result;
  }
  ConfiguringTask2.from = from;
})(ConfiguringTask || (ConfiguringTask = {}));
var CustomTask;
((CustomTask2) => {
  function from(external, context, index, source) {
    if (!external) {
      return void 0;
    }
    let type = external.type;
    if (type === void 0 || type === null) {
      type = Tasks.CUSTOMIZED_TASK_TYPE;
    }
    if (type !== Tasks.CUSTOMIZED_TASK_TYPE && type !== "shell" && type !== "process") {
      context.problemReporter.error(nls.localize("ConfigurationParser.notCustom", "Error: tasks is not declared as a custom task. The configuration will be ignored.\n{0}\n", JSON.stringify(external, null, 4)));
      return void 0;
    }
    let taskName = external.taskName;
    if (Types.isString(external.label) && context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0) {
      taskName = external.label;
    }
    if (!taskName) {
      context.problemReporter.error(nls.localize("ConfigurationParser.noTaskName", "Error: a task must provide a label property. The task will be ignored.\n{0}\n", JSON.stringify(external, null, 4)));
      return void 0;
    }
    let taskSource;
    switch (source) {
      case 2 /* User */: {
        taskSource = { kind: Tasks.TaskSourceKind.User, config: { index, element: external, file: ".vscode/tasks.json", workspaceFolder: context.workspaceFolder }, label };
        break;
      }
      case 1 /* WorkspaceFile */: {
        taskSource = { kind: Tasks.TaskSourceKind.WorkspaceFile, config: { index, element: external, file: ".vscode/tasks.json", workspaceFolder: context.workspaceFolder, workspace: context.workspace }, label };
        break;
      }
      default: {
        taskSource = { kind: Tasks.TaskSourceKind.Workspace, config: { index, element: external, file: ".vscode/tasks.json", workspaceFolder: context.workspaceFolder }, label };
        break;
      }
    }
    const result = new Tasks.CustomTask(
      context.uuidMap.getUUID(taskName),
      taskSource,
      taskName,
      Tasks.CUSTOMIZED_TASK_TYPE,
      void 0,
      false,
      RunOptions.fromConfiguration(external.runOptions),
      {
        name: taskName,
        identifier: taskName
      }
    );
    const configuration = ConfigurationProperties.from(external, context, false, source);
    result.addTaskLoadMessages(configuration.errors);
    if (configuration.value) {
      result.configurationProperties = Object.assign(result.configurationProperties, configuration.value);
    }
    const supportLegacy = true;
    if (supportLegacy) {
      const legacy = external;
      if (result.configurationProperties.isBackground === void 0 && legacy.isWatching !== void 0) {
        result.configurationProperties.isBackground = !!legacy.isWatching;
      }
      if (result.configurationProperties.group === void 0) {
        if (legacy.isBuildCommand === true) {
          result.configurationProperties.group = Tasks.TaskGroup.Build;
        } else if (legacy.isTestCommand === true) {
          result.configurationProperties.group = Tasks.TaskGroup.Test;
        }
      }
    }
    const command = CommandConfiguration.from(external, context);
    if (command) {
      result.command = command;
    }
    if (external.command !== void 0) {
      command.suppressTaskName = true;
    }
    return result;
  }
  CustomTask2.from = from;
  function fillGlobals(task, globals) {
    if (CommandConfiguration.hasCommand(task.command) || task.configurationProperties.dependsOn === void 0) {
      task.command = CommandConfiguration.fillGlobals(task.command, globals.command, task.configurationProperties.name);
    }
    if (task.configurationProperties.problemMatchers === void 0 && globals.problemMatcher !== void 0) {
      task.configurationProperties.problemMatchers = Objects.deepClone(globals.problemMatcher);
      task.hasDefinedMatchers = true;
    }
    if (task.configurationProperties.promptOnClose === void 0 && task.configurationProperties.isBackground === void 0 && globals.promptOnClose !== void 0) {
      task.configurationProperties.promptOnClose = globals.promptOnClose;
    }
  }
  CustomTask2.fillGlobals = fillGlobals;
  function fillDefaults(task, context) {
    CommandConfiguration.fillDefaults(task.command, context);
    if (task.configurationProperties.promptOnClose === void 0) {
      task.configurationProperties.promptOnClose = task.configurationProperties.isBackground !== void 0 ? !task.configurationProperties.isBackground : true;
    }
    if (task.configurationProperties.isBackground === void 0) {
      task.configurationProperties.isBackground = false;
    }
    if (task.configurationProperties.problemMatchers === void 0) {
      task.configurationProperties.problemMatchers = EMPTY_ARRAY;
    }
  }
  CustomTask2.fillDefaults = fillDefaults;
  function createCustomTask2(contributedTask, configuredProps) {
    const result = new Tasks.CustomTask(
      configuredProps._id,
      Object.assign({}, configuredProps._source, { customizes: contributedTask.defines }),
      configuredProps.configurationProperties.name || contributedTask._label,
      Tasks.CUSTOMIZED_TASK_TYPE,
      contributedTask.command,
      false,
      contributedTask.runOptions,
      {
        name: configuredProps.configurationProperties.name || contributedTask.configurationProperties.name,
        identifier: configuredProps.configurationProperties.identifier || contributedTask.configurationProperties.identifier,
        icon: configuredProps.configurationProperties.icon,
        hide: configuredProps.configurationProperties.hide,
        inAgents: configuredProps.configurationProperties.inAgents
      }
    );
    result.addTaskLoadMessages(configuredProps.taskLoadMessages);
    const resultConfigProps = result.configurationProperties;
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "group");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "isBackground");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "dependsOn");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "problemMatchers");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "promptOnClose");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "detail");
    result.command.presentation = CommandConfiguration.PresentationOptions.assignProperties(
      result.command.presentation,
      configuredProps.configurationProperties.presentation
    );
    result.command.options = CommandOptions.assignProperties(result.command.options, configuredProps.configurationProperties.options);
    result.runOptions = RunOptions.assignProperties(result.runOptions, configuredProps.runOptions);
    const contributedConfigProps = contributedTask.configurationProperties;
    fillProperty(resultConfigProps, contributedConfigProps, "group");
    fillProperty(resultConfigProps, contributedConfigProps, "isBackground");
    fillProperty(resultConfigProps, contributedConfigProps, "dependsOn");
    fillProperty(resultConfigProps, contributedConfigProps, "problemMatchers");
    fillProperty(resultConfigProps, contributedConfigProps, "promptOnClose");
    fillProperty(resultConfigProps, contributedConfigProps, "detail");
    result.command.presentation = CommandConfiguration.PresentationOptions.fillProperties(
      result.command.presentation,
      contributedConfigProps.presentation
    );
    result.command.options = CommandOptions.fillProperties(result.command.options, contributedConfigProps.options);
    result.runOptions = RunOptions.fillProperties(result.runOptions, contributedTask.runOptions);
    if (contributedTask.hasDefinedMatchers === true) {
      result.hasDefinedMatchers = true;
    }
    return result;
  }
  CustomTask2.createCustomTask = createCustomTask2;
})(CustomTask || (CustomTask = {}));
var TaskParser;
((TaskParser2) => {
  function isCustomTask(value) {
    const type = value.type;
    const customize = value.customize;
    return customize === void 0 && (type === void 0 || type === null || type === Tasks.CUSTOMIZED_TASK_TYPE || type === "shell" || type === "process");
  }
  const builtinTypeContextMap = {
    shell: ShellExecutionSupportedContext,
    process: ProcessExecutionSupportedContext
  };
  function from(externals, globals, context, source, registry) {
    const result = { custom: [], configured: [] };
    if (!externals) {
      return result;
    }
    const defaultBuildTask = { task: void 0, rank: -1 };
    const defaultTestTask = { task: void 0, rank: -1 };
    const schema2_0_0 = context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
    const baseLoadIssues = Objects.deepClone(context.taskLoadIssues);
    for (let index = 0; index < externals.length; index++) {
      const external = externals[index];
      const definition = external.type ? registry?.get?.(external.type) || TaskDefinitionRegistry.get(external.type) : void 0;
      let typeNotSupported = false;
      if (definition && definition.when && !context.contextKeyService.contextMatchesRules(definition.when)) {
        typeNotSupported = true;
      } else if (!definition && external.type) {
        for (const key of Object.keys(builtinTypeContextMap)) {
          if (external.type === key) {
            typeNotSupported = !ShellExecutionSupportedContext.evaluate(context.contextKeyService.getContext(null));
            break;
          }
        }
      }
      if (typeNotSupported) {
        context.problemReporter.info(nls.localize(
          "taskConfiguration.providerUnavailable",
          "Warning: {0} tasks are unavailable in the current environment.\n",
          external.type
        ));
        continue;
      }
      if (isCustomTask(external)) {
        const customTask = CustomTask.from(external, context, index, source);
        if (customTask) {
          CustomTask.fillGlobals(customTask, globals);
          CustomTask.fillDefaults(customTask, context);
          if (schema2_0_0) {
            if ((customTask.command === void 0 || customTask.command.name === void 0) && (customTask.configurationProperties.dependsOn === void 0 || customTask.configurationProperties.dependsOn.length === 0)) {
              context.problemReporter.error(nls.localize(
                "taskConfiguration.noCommandOrDependsOn",
                "Error: the task '{0}' neither specifies a command nor a dependsOn property. The task will be ignored. Its definition is:\n{1}",
                customTask.configurationProperties.name,
                JSON.stringify(external, void 0, 4)
              ));
              continue;
            }
          } else {
            if (customTask.command === void 0 || customTask.command.name === void 0) {
              context.problemReporter.warn(nls.localize(
                "taskConfiguration.noCommand",
                "Error: the task '{0}' doesn't define a command. The task will be ignored. Its definition is:\n{1}",
                customTask.configurationProperties.name,
                JSON.stringify(external, void 0, 4)
              ));
              continue;
            }
          }
          if (customTask.configurationProperties.group === Tasks.TaskGroup.Build && defaultBuildTask.rank < 2) {
            defaultBuildTask.task = customTask;
            defaultBuildTask.rank = 2;
          } else if (customTask.configurationProperties.group === Tasks.TaskGroup.Test && defaultTestTask.rank < 2) {
            defaultTestTask.task = customTask;
            defaultTestTask.rank = 2;
          } else if (customTask.configurationProperties.name === "build" && defaultBuildTask.rank < 1) {
            defaultBuildTask.task = customTask;
            defaultBuildTask.rank = 1;
          } else if (customTask.configurationProperties.name === "test" && defaultTestTask.rank < 1) {
            defaultTestTask.task = customTask;
            defaultTestTask.rank = 1;
          }
          customTask.addTaskLoadMessages(context.taskLoadIssues);
          result.custom.push(customTask);
        }
      } else {
        const configuredTask = ConfiguringTask.from(external, context, index, source, registry);
        if (configuredTask) {
          configuredTask.addTaskLoadMessages(context.taskLoadIssues);
          result.configured.push(configuredTask);
        }
      }
      context.taskLoadIssues = Objects.deepClone(baseLoadIssues);
    }
    const defaultBuildGroupName = Types.isString(defaultBuildTask.task?.configurationProperties.group) ? defaultBuildTask.task?.configurationProperties.group : defaultBuildTask.task?.configurationProperties.group?._id;
    const defaultTestTaskGroupName = Types.isString(defaultTestTask.task?.configurationProperties.group) ? defaultTestTask.task?.configurationProperties.group : defaultTestTask.task?.configurationProperties.group?._id;
    if (defaultBuildGroupName !== Tasks.TaskGroup.Build._id && defaultBuildTask.rank > -1 && defaultBuildTask.rank < 2 && defaultBuildTask.task) {
      defaultBuildTask.task.configurationProperties.group = Tasks.TaskGroup.Build;
    } else if (defaultTestTaskGroupName !== Tasks.TaskGroup.Test._id && defaultTestTask.rank > -1 && defaultTestTask.rank < 2 && defaultTestTask.task) {
      defaultTestTask.task.configurationProperties.group = Tasks.TaskGroup.Test;
    }
    return result;
  }
  TaskParser2.from = from;
  function assignTasks(target, source) {
    if (source === void 0 || source.length === 0) {
      return target;
    }
    if (target === void 0 || target.length === 0) {
      return source;
    }
    if (source) {
      const map = /* @__PURE__ */ Object.create(null);
      target.forEach((task) => {
        map[task.configurationProperties.name] = task;
      });
      source.forEach((task) => {
        map[task.configurationProperties.name] = task;
      });
      const newTarget = [];
      target.forEach((task) => {
        newTarget.push(map[task.configurationProperties.name]);
        delete map[task.configurationProperties.name];
      });
      Object.keys(map).forEach((key) => newTarget.push(map[key]));
      target = newTarget;
    }
    return target;
  }
  TaskParser2.assignTasks = assignTasks;
})(TaskParser || (TaskParser = {}));
var Globals;
((Globals2) => {
  function from(config, context) {
    let result = fromBase(config, context);
    let osGlobals = void 0;
    if (config.windows && context.platform === Platform.Windows) {
      osGlobals = fromBase(config.windows, context);
    } else if (config.osx && context.platform === Platform.Mac) {
      osGlobals = fromBase(config.osx, context);
    } else if (config.linux && context.platform === Platform.Linux) {
      osGlobals = fromBase(config.linux, context);
    }
    if (osGlobals) {
      result = Globals2.assignProperties(result, osGlobals);
    }
    const command = CommandConfiguration.from(config, context);
    if (command) {
      result.command = command;
    }
    Globals2.fillDefaults(result, context);
    Globals2.freeze(result);
    return result;
  }
  Globals2.from = from;
  function fromBase(config, context) {
    const result = {};
    if (config.suppressTaskName !== void 0) {
      result.suppressTaskName = !!config.suppressTaskName;
    }
    if (config.promptOnClose !== void 0) {
      result.promptOnClose = !!config.promptOnClose;
    }
    if (config.problemMatcher) {
      result.problemMatcher = ProblemMatcherConverter.from(config.problemMatcher, context).value;
    }
    return result;
  }
  Globals2.fromBase = fromBase;
  function isEmpty(value) {
    return !value || value.command === void 0 && value.promptOnClose === void 0 && value.suppressTaskName === void 0;
  }
  Globals2.isEmpty = isEmpty;
  function assignProperties(target, source) {
    if (isEmpty(source)) {
      return target;
    }
    if (isEmpty(target)) {
      return source;
    }
    assignProperty(target, source, "promptOnClose");
    assignProperty(target, source, "suppressTaskName");
    return target;
  }
  Globals2.assignProperties = assignProperties;
  function fillDefaults(value, context) {
    if (!value) {
      return;
    }
    CommandConfiguration.fillDefaults(value.command, context);
    if (value.suppressTaskName === void 0) {
      value.suppressTaskName = context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
    }
    if (value.promptOnClose === void 0) {
      value.promptOnClose = true;
    }
  }
  Globals2.fillDefaults = fillDefaults;
  function freeze(value) {
    Object.freeze(value);
    if (value.command) {
      CommandConfiguration.freeze(value.command);
    }
  }
  Globals2.freeze = freeze;
})(Globals || (Globals = {}));
var ExecutionEngine;
((ExecutionEngine2) => {
  function from(config) {
    const runner = config.runner || config._runner;
    let result;
    if (runner) {
      switch (runner) {
        case "terminal":
          result = Tasks.ExecutionEngine.Terminal;
          break;
        case "process":
          result = Tasks.ExecutionEngine.Process;
          break;
      }
    }
    const schemaVersion = JsonSchemaVersion.from(config);
    if (schemaVersion === Tasks.JsonSchemaVersion.V0_1_0) {
      return result || Tasks.ExecutionEngine.Process;
    } else if (schemaVersion === Tasks.JsonSchemaVersion.V2_0_0) {
      return Tasks.ExecutionEngine.Terminal;
    } else {
      throw new Error("Shouldn't happen.");
    }
  }
  ExecutionEngine2.from = from;
})(ExecutionEngine || (ExecutionEngine = {}));
var JsonSchemaVersion;
((JsonSchemaVersion2) => {
  const _default = Tasks.JsonSchemaVersion.V2_0_0;
  function from(config) {
    const version = config.version;
    if (!version) {
      return _default;
    }
    switch (version) {
      case "0.1.0":
        return Tasks.JsonSchemaVersion.V0_1_0;
      case "2.0.0":
        return Tasks.JsonSchemaVersion.V2_0_0;
      default:
        return _default;
    }
  }
  JsonSchemaVersion2.from = from;
})(JsonSchemaVersion || (JsonSchemaVersion = {}));
class UUIDMap {
  constructor(other) {
    this.current = /* @__PURE__ */ Object.create(null);
    if (other) {
      for (const key of Object.keys(other.current)) {
        const value = other.current[key];
        if (Array.isArray(value)) {
          this.current[key] = value.slice();
        } else {
          this.current[key] = value;
        }
      }
    }
  }
  start() {
    this.last = this.current;
    this.current = /* @__PURE__ */ Object.create(null);
  }
  getUUID(identifier) {
    const lastValue = this.last ? this.last[identifier] : void 0;
    let result = void 0;
    if (lastValue !== void 0) {
      if (Array.isArray(lastValue)) {
        result = lastValue.shift();
        if (lastValue.length === 0) {
          delete this.last[identifier];
        }
      } else {
        result = lastValue;
        delete this.last[identifier];
      }
    }
    if (result === void 0) {
      result = UUID.generateUuid();
    }
    const currentValue = this.current[identifier];
    if (currentValue === void 0) {
      this.current[identifier] = result;
    } else {
      if (Array.isArray(currentValue)) {
        currentValue.push(result);
      } else {
        const arrayValue = [currentValue];
        arrayValue.push(result);
        this.current[identifier] = arrayValue;
      }
    }
    return result;
  }
  finish() {
    this.last = void 0;
  }
}
var TaskConfigSource = /* @__PURE__ */ ((TaskConfigSource2) => {
  TaskConfigSource2[TaskConfigSource2["TasksJson"] = 0] = "TasksJson";
  TaskConfigSource2[TaskConfigSource2["WorkspaceFile"] = 1] = "WorkspaceFile";
  TaskConfigSource2[TaskConfigSource2["User"] = 2] = "User";
  return TaskConfigSource2;
})(TaskConfigSource || {});
class ConfigurationParser {
  constructor(workspaceFolder, workspace, platform, problemReporter, uuidMap) {
    this.workspaceFolder = workspaceFolder;
    this.workspace = workspace;
    this.platform = platform;
    this.problemReporter = problemReporter;
    this.uuidMap = uuidMap;
  }
  run(fileConfig, source, contextKeyService) {
    const engine = ExecutionEngine.from(fileConfig);
    const schemaVersion = JsonSchemaVersion.from(fileConfig);
    const context = {
      workspaceFolder: this.workspaceFolder,
      workspace: this.workspace,
      problemReporter: this.problemReporter,
      uuidMap: this.uuidMap,
      namedProblemMatchers: {},
      engine,
      schemaVersion,
      platform: this.platform,
      taskLoadIssues: [],
      contextKeyService
    };
    const taskParseResult = this.createTaskRunnerConfiguration(fileConfig, context, source);
    return {
      validationStatus: this.problemReporter.status,
      custom: taskParseResult.custom,
      configured: taskParseResult.configured,
      engine
    };
  }
  createTaskRunnerConfiguration(fileConfig, context, source) {
    const globals = Globals.from(fileConfig, context);
    if (this.problemReporter.status.isFatal()) {
      return { custom: [], configured: [] };
    }
    context.namedProblemMatchers = ProblemMatcherConverter.namedFrom(fileConfig.declares, context);
    let globalTasks = void 0;
    let externalGlobalTasks = void 0;
    if (fileConfig.windows && context.platform === Platform.Windows) {
      globalTasks = TaskParser.from(fileConfig.windows.tasks, globals, context, source).custom;
      externalGlobalTasks = fileConfig.windows.tasks;
    } else if (fileConfig.osx && context.platform === Platform.Mac) {
      globalTasks = TaskParser.from(fileConfig.osx.tasks, globals, context, source).custom;
      externalGlobalTasks = fileConfig.osx.tasks;
    } else if (fileConfig.linux && context.platform === Platform.Linux) {
      globalTasks = TaskParser.from(fileConfig.linux.tasks, globals, context, source).custom;
      externalGlobalTasks = fileConfig.linux.tasks;
    }
    if (context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0 && globalTasks && globalTasks.length > 0 && externalGlobalTasks && externalGlobalTasks.length > 0) {
      const taskContent = [];
      for (const task of externalGlobalTasks) {
        taskContent.push(JSON.stringify(task, null, 4));
      }
      context.problemReporter.error(
        nls.localize(
          { key: "TaskParse.noOsSpecificGlobalTasks", comment: ['"Task version 2.0.0" refers to the 2.0.0 version of the task system. The "version 2.0.0" is not localizable as it is a json key and value.'] },
          "Task version 2.0.0 doesn't support global OS specific tasks. Convert them to a task with a OS specific command. Affected tasks are:\n{0}",
          taskContent.join("\n")
        )
      );
    }
    let result = { custom: [], configured: [] };
    if (fileConfig.tasks) {
      result = TaskParser.from(fileConfig.tasks, globals, context, source);
    }
    if (globalTasks) {
      result.custom = TaskParser.assignTasks(result.custom, globalTasks);
    }
    if ((!result.custom || result.custom.length === 0) && (globals.command && globals.command.name)) {
      const matchers = ProblemMatcherConverter.from(fileConfig.problemMatcher, context).value ?? [];
      const isBackground = fileConfig.isBackground ? !!fileConfig.isBackground : fileConfig.isWatching ? !!fileConfig.isWatching : void 0;
      const name = Tasks.CommandString.value(globals.command.name);
      const task = new Tasks.CustomTask(
        context.uuidMap.getUUID(name),
        Object.assign({}, source, "workspace", { config: { index: -1, element: fileConfig, workspaceFolder: context.workspaceFolder } }),
        name,
        Tasks.CUSTOMIZED_TASK_TYPE,
        {
          name: void 0,
          runtime: void 0,
          presentation: void 0,
          suppressTaskName: true
        },
        false,
        { reevaluateOnRerun: true },
        {
          name,
          identifier: name,
          group: Tasks.TaskGroup.Build,
          isBackground,
          problemMatchers: matchers
        }
      );
      const taskGroupKind = GroupKind.from(fileConfig.group);
      if (taskGroupKind !== void 0) {
        task.configurationProperties.group = taskGroupKind;
      } else if (fileConfig.group === "none") {
        task.configurationProperties.group = void 0;
      }
      CustomTask.fillGlobals(task, globals);
      CustomTask.fillDefaults(task, context);
      result.custom = [task];
    }
    result.custom = result.custom || [];
    result.configured = result.configured || [];
    return result;
  }
}
const uuidMaps = /* @__PURE__ */ new Map();
const recentUuidMaps = /* @__PURE__ */ new Map();
function parse(workspaceFolder, workspace, platform, configuration, logger, source, contextKeyService, isRecents = false) {
  const recentOrOtherMaps = isRecents ? recentUuidMaps : uuidMaps;
  let selectedUuidMaps = recentOrOtherMaps.get(source);
  if (!selectedUuidMaps) {
    recentOrOtherMaps.set(source, /* @__PURE__ */ new Map());
    selectedUuidMaps = recentOrOtherMaps.get(source);
  }
  let uuidMap = selectedUuidMaps.get(workspaceFolder.uri.toString());
  if (!uuidMap) {
    uuidMap = new UUIDMap();
    selectedUuidMaps.set(workspaceFolder.uri.toString(), uuidMap);
  }
  try {
    uuidMap.start();
    return new ConfigurationParser(workspaceFolder, workspace, platform, logger, uuidMap).run(configuration, source, contextKeyService);
  } finally {
    uuidMap.finish();
  }
}
function createCustomTask(contributedTask, configuredProps) {
  return CustomTask.createCustomTask(contributedTask, configuredProps);
}
export {
  CommandString,
  ExecutionEngine,
  GroupKind,
  ITaskIdentifier,
  InstancePolicy,
  JsonSchemaVersion,
  ProblemMatcherConverter,
  RunOnOptions,
  RunOptions,
  ShellQuoting,
  TaskConfigSource,
  TaskParser,
  UUIDMap,
  createCustomTask,
  parse
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxjb21tb25cXHRhc2tDb25maWd1cmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmltcG9ydCAqIGFzIE9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBQbGF0Zm9ybSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIFR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAqIGFzIFVVSUQgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5cbmltcG9ydCB7IFZhbGlkYXRpb25TdGF0dXMsIElQcm9ibGVtUmVwb3J0ZXIgYXMgSVByb2JsZW1SZXBvcnRlckJhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXJzZXJzLmpzJztcbmltcG9ydCB7XG5cdElOYW1lZFByb2JsZW1NYXRjaGVyLCBQcm9ibGVtTWF0Y2hlclBhcnNlciwgQ29uZmlnIGFzIFByb2JsZW1NYXRjaGVyQ29uZmlnLFxuXHRpc05hbWVkUHJvYmxlbU1hdGNoZXIsIFByb2JsZW1NYXRjaGVyUmVnaXN0cnksIFByb2JsZW1NYXRjaGVyXG59IGZyb20gJy4vcHJvYmxlbU1hdGNoZXIuanMnO1xuXG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0ICogYXMgVGFza3MgZnJvbSAnLi90YXNrcy5qcyc7XG5pbXBvcnQgeyBJVGFza0RlZmluaXRpb25SZWdpc3RyeSwgVGFza0RlZmluaXRpb25SZWdpc3RyeSB9IGZyb20gJy4vdGFza0RlZmluaXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVkSW5wdXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU2hlbGxFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0LCBQcm9jZXNzRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dCB9IGZyb20gJy4vdGFza1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNoZWxsUXVvdGluZyB7XG5cdC8qKlxuXHQgKiBEZWZhdWx0IGlzIGNoYXJhY3RlciBlc2NhcGluZy5cblx0ICovXG5cdGVzY2FwZSA9IDEsXG5cblx0LyoqXG5cdCAqIERlZmF1bHQgaXMgc3Ryb25nIHF1b3Rpbmdcblx0ICovXG5cdHN0cm9uZyA9IDIsXG5cblx0LyoqXG5cdCAqIERlZmF1bHQgaXMgd2VhayBxdW90aW5nLlxuXHQgKi9cblx0d2VhayA9IDNcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2hlbGxRdW90aW5nT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBUaGUgY2hhcmFjdGVyIHVzZWQgdG8gZG8gY2hhcmFjdGVyIGVzY2FwaW5nLlxuXHQgKi9cblx0ZXNjYXBlPzogc3RyaW5nIHwge1xuXHRcdGVzY2FwZUNoYXI6IHN0cmluZztcblx0XHRjaGFyc1RvRXNjYXBlOiBzdHJpbmc7XG5cdH07XG5cblx0LyoqXG5cdCAqIFRoZSBjaGFyYWN0ZXIgdXNlZCBmb3Igc3RyaW5nIHF1b3RpbmcuXG5cdCAqL1xuXHRzdHJvbmc/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBjaGFyYWN0ZXIgdXNlZCBmb3Igd2VhayBxdW90aW5nLlxuXHQgKi9cblx0d2Vhaz86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2hlbGxDb25maWd1cmF0aW9uIHtcblx0ZXhlY3V0YWJsZT86IHN0cmluZztcblx0YXJncz86IHN0cmluZ1tdO1xuXHRxdW90aW5nPzogSVNoZWxsUXVvdGluZ09wdGlvbnM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRPcHRpb25zQ29uZmlnIHtcblx0LyoqXG5cdCAqIFRoZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IG9mIHRoZSBleGVjdXRlZCBwcm9ncmFtIG9yIHNoZWxsLlxuXHQgKiBJZiBvbWl0dGVkIFZTQ29kZSdzIGN1cnJlbnQgd29ya3NwYWNlIHJvb3QgaXMgdXNlZC5cblx0ICovXG5cdGN3ZD86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIGFkZGl0aW9uYWwgZW52aXJvbm1lbnQgb2YgdGhlIGV4ZWN1dGVkIHByb2dyYW0gb3Igc2hlbGwuIElmIG9taXR0ZWRcblx0ICogdGhlIHBhcmVudCBwcm9jZXNzJyBlbnZpcm9ubWVudCBpcyB1c2VkLlxuXHQgKi9cblx0ZW52PzogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPjtcblxuXHQvKipcblx0ICogVGhlIHNoZWxsIGNvbmZpZ3VyYXRpb247XG5cdCAqL1xuXHRzaGVsbD86IElTaGVsbENvbmZpZ3VyYXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByZXNlbnRhdGlvbk9wdGlvbnNDb25maWcge1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwgZXhlY3V0aW5nIGEgdGFzayBpcyBicm91Z2h0IHRvIGZyb250IG9yIG5vdC5cblx0ICogRGVmYXVsdHMgdG8gYFJldmVhbEtpbmQuQWx3YXlzYC5cblx0ICovXG5cdHJldmVhbD86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgcHJvYmxlbXMgcGFuZWwgaXMgcmV2ZWFsZWQgd2hlbiBydW5uaW5nIHRoaXMgdGFzayBvciBub3QuXG5cdCAqIERlZmF1bHRzIHRvIGBSZXZlYWxLaW5kLk5ldmVyYC5cblx0ICovXG5cdHJldmVhbFByb2JsZW1zPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBleGVjdXRlZCBjb21tYW5kIGlzIHByaW50ZWQgdG8gdGhlIG91dHB1dCB3aW5kb3cgb3IgdGVybWluYWwgYXMgd2VsbC5cblx0ICovXG5cdGVjaG8/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSB0ZXJtaW5hbCBpcyBmb2N1cyB3aGVuIHRoaXMgdGFzayBpcyBleGVjdXRlZFxuXHQgKi9cblx0Zm9jdXM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSB0YXNrIHJ1bnMgaW4gYSBuZXcgdGVybWluYWxcblx0ICovXG5cdHBhbmVsPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRvIHNob3cgdGhlIFwiVGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MsIHByZXNzIGFueSBrZXkgdG8gY2xvc2UgaXRcIiBtZXNzYWdlLlxuXHQgKi9cblx0c2hvd1JldXNlTWVzc2FnZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIHNob3VsZCBiZSBjbGVhcmVkIGJlZm9yZSBydW5uaW5nIHRoZSB0YXNrLlxuXHQgKi9cblx0Y2xlYXI/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSB0YXNrIGlzIGV4ZWN1dGVkIGluIGEgc3BlY2lmaWMgdGVybWluYWwgZ3JvdXAgdXNpbmcgc3BsaXQgcGFuZXMuXG5cdCAqL1xuXHRncm91cD86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwgdGhhdCB0aGUgdGFzayBydW5zIGluIGlzIGNsb3NlZCB3aGVuIHRoZSB0YXNrIGNvbXBsZXRlcy5cblx0ICogTm90ZSB0aGF0IGlmIHRoZSB0ZXJtaW5hbCBwcm9jZXNzIGV4aXRzIHdpdGggYSBub24temVybyBleGl0IGNvZGUsIGl0IHdpbGwgbm90IGNsb3NlLlxuXHQgKi9cblx0Y2xvc2U/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRvIHByZXNlcnZlIHRoZSB0YXNrIG5hbWUgaW4gdGhlIHRlcm1pbmFsIGFmdGVyIHRhc2sgY29tcGxldGlvbi5cblx0ICovXG5cdHByZXNlcnZlVGVybWluYWxOYW1lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUnVuT3B0aW9uc0NvbmZpZyB7XG5cdHJlZXZhbHVhdGVPblJlcnVuPzogYm9vbGVhbjtcblx0cnVuT24/OiBzdHJpbmc7XG5cdGluc3RhbmNlTGltaXQ/OiBudW1iZXI7XG5cdGluc3RhbmNlUG9saWN5PzogVGFza3MuSW5zdGFuY2VQb2xpY3k7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tJZGVudGlmaWVyIHtcblx0dHlwZT86IHN0cmluZztcblx0W25hbWU6IHN0cmluZ106IHVua25vd247XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSVRhc2tJZGVudGlmaWVyIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSVRhc2tJZGVudGlmaWVyIHtcblx0XHRjb25zdCBjYW5kaWRhdGU6IElUYXNrSWRlbnRpZmllciA9IHZhbHVlIGFzIElUYXNrSWRlbnRpZmllcjtcblx0XHRyZXR1cm4gY2FuZGlkYXRlICE9PSB1bmRlZmluZWQgJiYgVHlwZXMuaXNTdHJpbmcoKHZhbHVlIGFzIElUYXNrSWRlbnRpZmllcikudHlwZSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGVnYWN5VGFza1Byb3BlcnRpZXMge1xuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgVXNlIGBpc0JhY2tncm91bmRgIGluc3RlYWQuXG5cdCAqIFdoZXRoZXIgdGhlIGV4ZWN1dGVkIGNvbW1hbmQgaXMga2VwdCBhbGl2ZSBhbmQgaXMgd2F0Y2hpbmcgdGhlIGZpbGUgc3lzdGVtLlxuXHQgKi9cblx0aXNXYXRjaGluZz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBgZ3JvdXBgIGluc3RlYWQuXG5cdCAqIFdoZXRoZXIgdGhpcyB0YXNrIG1hcHMgdG8gdGhlIGRlZmF1bHQgYnVpbGQgY29tbWFuZC5cblx0ICovXG5cdGlzQnVpbGRDb21tYW5kPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgVXNlIGBncm91cGAgaW5zdGVhZC5cblx0ICogV2hldGhlciB0aGlzIHRhc2sgbWFwcyB0byB0aGUgZGVmYXVsdCB0ZXN0IGNvbW1hbmQuXG5cdCAqL1xuXHRpc1Rlc3RDb21tYW5kPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGVnYWN5Q29tbWFuZFByb3BlcnRpZXMge1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgaXMgYSBzaGVsbCBvciBwcm9jZXNzXG5cdCAqL1xuXHR0eXBlPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBVc2UgcHJlc2VudGF0aW9uIG9wdGlvbnNcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgb3V0cHV0IHZpZXcgb2YgdGhlIHJ1bm5pbmcgdGFza3MgaXMgYnJvdWdodCB0byBmcm9udCBvciBub3QuXG5cdCAqIFNlZSBCYXNlVGFza1J1bm5lckNvbmZpZ3VyYXRpb24jc2hvd091dHB1dCBmb3IgZGV0YWlscy5cblx0ICovXG5cdHNob3dPdXRwdXQ/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBwcmVzZW50YXRpb24gb3B0aW9uc1xuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBleGVjdXRlZCBjb21tYW5kIGlzIHByaW50ZWQgdG8gdGhlIG91dHB1dCB3aW5kb3dzIGFzIHdlbGwuXG5cdCAqL1xuXHRlY2hvQ29tbWFuZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBwcmVzZW50YXRpb24gaW5zdGVhZFxuXHQgKi9cblx0dGVybWluYWw/OiBJUHJlc2VudGF0aW9uT3B0aW9uc0NvbmZpZztcblxuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgVXNlIGlubGluZSBjb21tYW5kcy5cblx0ICogU2VlIEJhc2VUYXNrUnVubmVyQ29uZmlndXJhdGlvbiNzdXBwcmVzc1Rhc2tOYW1lIGZvciBkZXRhaWxzLlxuXHQgKi9cblx0c3VwcHJlc3NUYXNrTmFtZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNvbWUgY29tbWFuZHMgcmVxdWlyZSB0aGF0IHRoZSB0YXNrIGFyZ3VtZW50IGlzIGhpZ2hsaWdodGVkIHdpdGggYSBzcGVjaWFsXG5cdCAqIHByZWZpeCAoZS5nLiAvdDogZm9yIG1zYnVpbGQpLiBUaGlzIHByb3BlcnR5IGNhbiBiZSB1c2VkIHRvIGNvbnRyb2wgc3VjaFxuXHQgKiBhIHByZWZpeC5cblx0ICovXG5cdHRhc2tTZWxlY3Rvcj86IHN0cmluZztcblxuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgdXNlIHRoZSB0YXNrIHR5cGUgaW5zdGVhZC5cblx0ICogU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGNvbW1hbmQgaXMgYSBzaGVsbCBjb21tYW5kIGFuZCB0aGVyZWZvcmUgbXVzdFxuXHQgKiBiZSBleGVjdXRlZCBpbiBhIHNoZWxsIGludGVycHJldGVyIChlLmcuIGNtZC5leGUsIGJhc2gsIC4uLikuXG5cdCAqXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlIGlmIG9taXR0ZWQuXG5cdCAqL1xuXHRpc1NoZWxsQ29tbWFuZD86IGJvb2xlYW4gfCBJU2hlbGxDb25maWd1cmF0aW9uO1xufVxuXG5leHBvcnQgdHlwZSBDb21tYW5kU3RyaW5nID0gVHlwZXMuU2luZ2xlT3JNYW55PHN0cmluZz4gfCB7IHZhbHVlOiBUeXBlcy5TaW5nbGVPck1hbnk8c3RyaW5nPjsgcXVvdGluZzogJ2VzY2FwZScgfCAnc3Ryb25nJyB8ICd3ZWFrJyB9O1xuXG5leHBvcnQgbmFtZXNwYWNlIENvbW1hbmRTdHJpbmcge1xuXHRleHBvcnQgZnVuY3Rpb24gdmFsdWUodmFsdWU6IENvbW1hbmRTdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9IGVsc2UgaWYgKFR5cGVzLmlzU3RyaW5nQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUuam9pbignICcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcodmFsdWUudmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZS52YWx1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZS52YWx1ZS5qb2luKCcgJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJhc2VDb21tYW5kUHJvcGVydGllcyB7XG5cblx0LyoqXG5cdCAqIFRoZSBjb21tYW5kIHRvIGJlIGV4ZWN1dGVkLiBDYW4gYmUgYW4gZXh0ZXJuYWwgcHJvZ3JhbSBvciBhIHNoZWxsXG5cdCAqIGNvbW1hbmQuXG5cdCAqL1xuXHRjb21tYW5kPzogQ29tbWFuZFN0cmluZztcblxuXHQvKipcblx0ICogVGhlIGNvbW1hbmQgb3B0aW9ucyB1c2VkIHdoZW4gdGhlIGNvbW1hbmQgaXMgZXhlY3V0ZWQuIENhbiBiZSBvbWl0dGVkLlxuXHQgKi9cblx0b3B0aW9ucz86IElDb21tYW5kT3B0aW9uc0NvbmZpZztcblxuXHQvKipcblx0ICogVGhlIGFyZ3VtZW50cyBwYXNzZWQgdG8gdGhlIGNvbW1hbmQgb3IgYWRkaXRpb25hbCBhcmd1bWVudHMgcGFzc2VkIHRvIHRoZVxuXHQgKiBjb21tYW5kIHdoZW4gdXNpbmcgYSBnbG9iYWwgY29tbWFuZC5cblx0ICovXG5cdGFyZ3M/OiBDb21tYW5kU3RyaW5nW107XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tbWFuZFByb3BlcnRpZXMgZXh0ZW5kcyBJQmFzZUNvbW1hbmRQcm9wZXJ0aWVzIHtcblxuXHQvKipcblx0ICogV2luZG93cyBzcGVjaWZpYyBjb21tYW5kIHByb3BlcnRpZXNcblx0ICovXG5cdHdpbmRvd3M/OiBJQmFzZUNvbW1hbmRQcm9wZXJ0aWVzO1xuXG5cdC8qKlxuXHQgKiBPU1ggc3BlY2lmaWMgY29tbWFuZCBwcm9wZXJ0aWVzXG5cdCAqL1xuXHRvc3g/OiBJQmFzZUNvbW1hbmRQcm9wZXJ0aWVzO1xuXG5cdC8qKlxuXHQgKiBsaW51eCBzcGVjaWZpYyBjb21tYW5kIHByb3BlcnRpZXNcblx0ICovXG5cdGxpbnV4PzogSUJhc2VDb21tYW5kUHJvcGVydGllcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR3JvdXBLaW5kIHtcblx0a2luZD86IHN0cmluZztcblx0aXNEZWZhdWx0PzogYm9vbGVhbiB8IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMge1xuXHQvKipcblx0ICogVGhlIHRhc2sncyBuYW1lXG5cdCAqL1xuXHR0YXNrTmFtZT86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIFVJIGxhYmVsIHVzZWQgZm9yIHRoZSB0YXNrLlxuXHQgKi9cblx0bGFiZWw/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEFuIG9wdGlvbmFsIGlkZW50aWZpZXIgd2hpY2ggY2FuIGJlIHVzZWQgdG8gcmVmZXJlbmNlIGEgdGFza1xuXHQgKiBpbiBhIGRlcGVuZHNPbiBvciBvdGhlciBhdHRyaWJ1dGVzLlxuXHQgKi9cblx0aWRlbnRpZmllcj86IHN0cmluZztcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgZXhlY3V0ZWQgY29tbWFuZCBpcyBrZXB0IGFsaXZlIGFuZCBydW5zIGluIHRoZSBiYWNrZ3JvdW5kLlxuXHQgKi9cblx0aXNCYWNrZ3JvdW5kPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgdGFzayBzaG91bGQgcHJvbXB0IG9uIGNsb3NlIGZvciBjb25maXJtYXRpb24gaWYgcnVubmluZy5cblx0ICovXG5cdHByb21wdE9uQ2xvc2U/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBEZWZpbmVzIHRoZSBncm91cCB0aGUgdGFzayBiZWxvbmdzIHRvby5cblx0ICovXG5cdGdyb3VwPzogc3RyaW5nIHwgSUdyb3VwS2luZDtcblxuXHQvKipcblx0ICogQSBkZXNjcmlwdGlvbiBvZiB0aGUgdGFzay5cblx0ICovXG5cdGRldGFpbD86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIG90aGVyIHRhc2tzIHRoZSB0YXNrIGRlcGVuZCBvblxuXHQgKi9cblx0ZGVwZW5kc09uPzogc3RyaW5nIHwgSVRhc2tJZGVudGlmaWVyIHwgQXJyYXk8c3RyaW5nIHwgSVRhc2tJZGVudGlmaWVyPjtcblxuXHQvKipcblx0ICogVGhlIG9yZGVyIHRoZSBkZXBlbmRzT24gdGFza3Mgc2hvdWxkIGJlIGV4ZWN1dGVkIGluLlxuXHQgKi9cblx0ZGVwZW5kc09yZGVyPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB0aGUgYmVoYXZpb3Igb2YgdGhlIHVzZWQgdGVybWluYWxcblx0ICovXG5cdHByZXNlbnRhdGlvbj86IElQcmVzZW50YXRpb25PcHRpb25zQ29uZmlnO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyBzaGVsbCBvcHRpb25zLlxuXHQgKi9cblx0b3B0aW9ucz86IElDb21tYW5kT3B0aW9uc0NvbmZpZztcblxuXHQvKipcblx0ICogVGhlIHByb2JsZW0gbWF0Y2hlcihzKSB0byB1c2UgdG8gY2FwdHVyZSBwcm9ibGVtcyBpbiB0aGUgdGFza3Ncblx0ICogb3V0cHV0LlxuXHQgKi9cblx0cHJvYmxlbU1hdGNoZXI/OiBQcm9ibGVtTWF0Y2hlckNvbmZpZy5Qcm9ibGVtTWF0Y2hlclR5cGU7XG5cblx0LyoqXG5cdCAqIFRhc2sgcnVuIG9wdGlvbnMuIENvbnRyb2wgcnVuIHJlbGF0ZWQgcHJvcGVydGllcy5cblx0ICovXG5cdHJ1bk9wdGlvbnM/OiBJUnVuT3B0aW9uc0NvbmZpZztcblxuXHQvKipcblx0ICogVGhlIGljb24gZm9yIHRoaXMgdGFzayBpbiB0aGUgdGVybWluYWwgdGFicyBsaXN0XG5cdCAqL1xuXHRpY29uPzogeyBpZDogc3RyaW5nOyBjb2xvcj86IHN0cmluZyB9O1xuXG5cdC8qKlxuXHQgKiBUaGUgaWNvbidzIGNvbG9yIGluIHRoZSB0ZXJtaW5hbCB0YWJzIGxpc3Rcblx0ICovXG5cdGNvbG9yPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBEbyBub3Qgc2hvdyB0aGlzIHRhc2sgaW4gdGhlIHJ1biB0YXNrIHF1aWNrcGlja1xuXHQgKi9cblx0aGlkZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNob3cgdGhpcyB0YXNrIGluIHRoZSBBZ2VudHMgcnVuIGFjdGlvbiBkcm9wZG93blxuXHQgKi9cblx0aW5BZ2VudHM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDdXN0b21UYXNrIGV4dGVuZHMgSUNvbW1hbmRQcm9wZXJ0aWVzLCBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMge1xuXHQvKipcblx0ICogQ3VzdG9tIHRhc2tzIGhhdmUgdGhlIHR5cGUgQ1VTVE9NSVpFRF9UQVNLX1RZUEVcblx0ICovXG5cdHR5cGU/OiBzdHJpbmc7XG5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJpbmdUYXNrIGV4dGVuZHMgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIHtcblx0LyoqXG5cdCAqIFRoZSBjb250cmlidXRlZCB0eXBlIG9mIHRoZSB0YXNrXG5cdCAqL1xuXHR0eXBlPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRoZSBiYXNlIHRhc2sgcnVubmVyIGNvbmZpZ3VyYXRpb25cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQmFzZVRhc2tSdW5uZXJDb25maWd1cmF0aW9uIHtcblxuXHQvKipcblx0ICogVGhlIGNvbW1hbmQgdG8gYmUgZXhlY3V0ZWQuIENhbiBiZSBhbiBleHRlcm5hbCBwcm9ncmFtIG9yIGEgc2hlbGxcblx0ICogY29tbWFuZC5cblx0ICovXG5cdGNvbW1hbmQ/OiBDb21tYW5kU3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBVc2UgdHlwZSBpbnN0ZWFkXG5cdCAqXG5cdCAqIFNwZWNpZmllcyB3aGV0aGVyIHRoZSBjb21tYW5kIGlzIGEgc2hlbGwgY29tbWFuZCBhbmQgdGhlcmVmb3JlIG11c3Rcblx0ICogYmUgZXhlY3V0ZWQgaW4gYSBzaGVsbCBpbnRlcnByZXRlciAoZS5nLiBjbWQuZXhlLCBiYXNoLCAuLi4pLlxuXHQgKlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZSBpZiBvbWl0dGVkLlxuXHQgKi9cblx0aXNTaGVsbENvbW1hbmQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgdGFzayB0eXBlXG5cdCAqL1xuXHR0eXBlPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgY29tbWFuZCBvcHRpb25zIHVzZWQgd2hlbiB0aGUgY29tbWFuZCBpcyBleGVjdXRlZC4gQ2FuIGJlIG9taXR0ZWQuXG5cdCAqL1xuXHRvcHRpb25zPzogSUNvbW1hbmRPcHRpb25zQ29uZmlnO1xuXG5cdC8qKlxuXHQgKiBUaGUgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgY29tbWFuZC4gQ2FuIGJlIG9taXR0ZWQuXG5cdCAqL1xuXHRhcmdzPzogQ29tbWFuZFN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBvdXRwdXQgdmlldyBvZiB0aGUgcnVubmluZyB0YXNrcyBpcyBicm91Z2h0IHRvIGZyb250IG9yIG5vdC5cblx0ICogVmFsaWQgdmFsdWVzIGFyZTpcblx0ICogICBcImFsd2F5c1wiOiBicmluZyB0aGUgb3V0cHV0IHdpbmRvdyBhbHdheXMgdG8gZnJvbnQgd2hlbiBhIHRhc2sgaXMgZXhlY3V0ZWQuXG5cdCAqICAgXCJzaWxlbnRcIjogb25seSBicmluZyBpdCB0byBmcm9udCBpZiBubyBwcm9ibGVtIG1hdGNoZXIgaXMgZGVmaW5lZCBmb3IgdGhlIHRhc2sgZXhlY3V0ZWQuXG5cdCAqICAgXCJuZXZlclwiOiBuZXZlciBicmluZyB0aGUgb3V0cHV0IHdpbmRvdyB0byBmcm9udC5cblx0ICpcblx0ICogSWYgb21pdHRlZCBcImFsd2F5c1wiIGlzIHVzZWQuXG5cdCAqL1xuXHRzaG93T3V0cHV0Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSBleGVjdXRlZCBjb21tYW5kIGlzIHByaW50ZWQgdG8gdGhlIG91dHB1dCB3aW5kb3dzIGFzIHdlbGwuXG5cdCAqL1xuXHRlY2hvQ29tbWFuZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBncm91cFxuXHQgKi9cblx0Z3JvdXA/OiBzdHJpbmcgfCBJR3JvdXBLaW5kO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB0aGUgYmVoYXZpb3Igb2YgdGhlIHVzZWQgdGVybWluYWxcblx0ICovXG5cdHByZXNlbnRhdGlvbj86IElQcmVzZW50YXRpb25PcHRpb25zQ29uZmlnO1xuXG5cdC8qKlxuXHQgKiBJZiBzZXQgdG8gZmFsc2UgdGhlIHRhc2sgbmFtZSBpcyBhZGRlZCBhcyBhbiBhZGRpdGlvbmFsIGFyZ3VtZW50IHRvIHRoZVxuXHQgKiBjb21tYW5kIHdoZW4gZXhlY3V0ZWQuIElmIHNldCB0byB0cnVlIHRoZSB0YXNrIG5hbWUgaXMgc3VwcHJlc3NlZC4gSWZcblx0ICogb21pdHRlZCBmYWxzZSBpcyB1c2VkLlxuXHQgKi9cblx0c3VwcHJlc3NUYXNrTmFtZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNvbWUgY29tbWFuZHMgcmVxdWlyZSB0aGF0IHRoZSB0YXNrIGFyZ3VtZW50IGlzIGhpZ2hsaWdodGVkIHdpdGggYSBzcGVjaWFsXG5cdCAqIHByZWZpeCAoZS5nLiAvdDogZm9yIG1zYnVpbGQpLiBUaGlzIHByb3BlcnR5IGNhbiBiZSB1c2VkIHRvIGNvbnRyb2wgc3VjaFxuXHQgKiBhIHByZWZpeC5cblx0ICovXG5cdHRhc2tTZWxlY3Rvcj86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIHByb2JsZW0gbWF0Y2hlcihzKSB0byB1c2VkIGlmIGEgZ2xvYmFsIGNvbW1hbmQgaXMgZXhlY3V0ZWQgKGUuZy4gbm8gdGFza3Ncblx0ICogYXJlIGRlZmluZWQpLiBBIHRhc2tzLmpzb24gZmlsZSBjYW4gZWl0aGVyIGNvbnRhaW4gYSBnbG9iYWwgcHJvYmxlbU1hdGNoZXJcblx0ICogcHJvcGVydHkgb3IgYSB0YXNrcyBwcm9wZXJ0eSBidXQgbm90IGJvdGguXG5cdCAqL1xuXHRwcm9ibGVtTWF0Y2hlcj86IFByb2JsZW1NYXRjaGVyQ29uZmlnLlByb2JsZW1NYXRjaGVyVHlwZTtcblxuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgVXNlIGBpc0JhY2tncm91bmRgIGluc3RlYWQuXG5cdCAqXG5cdCAqIFNwZWNpZmllcyB3aGV0aGVyIGEgZ2xvYmFsIGNvbW1hbmQgaXMgYSB3YXRjaGluZyB0aGUgZmlsZXN5c3RlbS4gQSB0YXNrLmpzb25cblx0ICogZmlsZSBjYW4gZWl0aGVyIGNvbnRhaW4gYSBnbG9iYWwgaXNXYXRjaGluZyBwcm9wZXJ0eSBvciBhIHRhc2tzIHByb3BlcnR5XG5cdCAqIGJ1dCBub3QgYm90aC5cblx0ICovXG5cdGlzV2F0Y2hpbmc/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTcGVjaWZpZXMgd2hldGhlciBhIGdsb2JhbCBjb21tYW5kIGlzIGEgYmFja2dyb3VuZCB0YXNrLlxuXHQgKi9cblx0aXNCYWNrZ3JvdW5kPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgdGFzayBzaG91bGQgcHJvbXB0IG9uIGNsb3NlIGZvciBjb25maXJtYXRpb24gaWYgcnVubmluZy5cblx0ICovXG5cdHByb21wdE9uQ2xvc2U/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgY29uZmlndXJhdGlvbiBvZiB0aGUgYXZhaWxhYmxlIHRhc2tzLiBBIHRhc2tzLmpzb24gZmlsZSBjYW4gZWl0aGVyXG5cdCAqIGNvbnRhaW4gYSBnbG9iYWwgcHJvYmxlbU1hdGNoZXIgcHJvcGVydHkgb3IgYSB0YXNrcyBwcm9wZXJ0eSBidXQgbm90IGJvdGguXG5cdCAqL1xuXHR0YXNrcz86IEFycmF5PElDdXN0b21UYXNrIHwgSUNvbmZpZ3VyaW5nVGFzaz47XG5cblx0LyoqXG5cdCAqIFByb2JsZW0gbWF0Y2hlciBkZWNsYXJhdGlvbnMuXG5cdCAqL1xuXHRkZWNsYXJlcz86IFByb2JsZW1NYXRjaGVyQ29uZmlnLklOYW1lZFByb2JsZW1NYXRjaGVyW107XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIHVzZXIgaW5wdXQgdmFyaWFibGVzLlxuXHQgKi9cblx0aW5wdXRzPzogQ29uZmlndXJlZElucHV0W107XG59XG5cbi8qKlxuICogQSBjb25maWd1cmF0aW9uIG9mIGFuIGV4dGVybmFsIGJ1aWxkIHN5c3RlbS4gQnVpbGRDb25maWd1cmF0aW9uLmJ1aWxkU3lzdGVtXG4gKiBtdXN0IGJlIHNldCB0byAncHJvZ3JhbSdcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiBleHRlbmRzIElCYXNlVGFza1J1bm5lckNvbmZpZ3VyYXRpb24ge1xuXG5cdF9ydW5uZXI/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIERldGVybWluZXMgdGhlIHJ1bm5lciB0byB1c2Vcblx0ICovXG5cdHJ1bm5lcj86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIGNvbmZpZydzIHZlcnNpb24gbnVtYmVyXG5cdCAqL1xuXHR2ZXJzaW9uOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFdpbmRvd3Mgc3BlY2lmaWMgdGFzayBjb25maWd1cmF0aW9uXG5cdCAqL1xuXHR3aW5kb3dzPzogSUJhc2VUYXNrUnVubmVyQ29uZmlndXJhdGlvbjtcblxuXHQvKipcblx0ICogTWFjIHNwZWNpZmljIHRhc2sgY29uZmlndXJhdGlvblxuXHQgKi9cblx0b3N4PzogSUJhc2VUYXNrUnVubmVyQ29uZmlndXJhdGlvbjtcblxuXHQvKipcblx0ICogTGludXggc3BlY2lmaWMgdGFzayBjb25maWd1cmF0aW9uXG5cdCAqL1xuXHRsaW51eD86IElCYXNlVGFza1J1bm5lckNvbmZpZ3VyYXRpb247XG59XG5cbmVudW0gUHJvYmxlbU1hdGNoZXJLaW5kIHtcblx0VW5rbm93bixcblx0U3RyaW5nLFxuXHRQcm9ibGVtTWF0Y2hlcixcblx0QXJyYXlcbn1cblxudHlwZSBUYXNrQ29uZmlndXJhdGlvblZhbHVlV2l0aEVycm9yczxUPiA9IHtcblx0dmFsdWU/OiBUO1xuXHRlcnJvcnM/OiBzdHJpbmdbXTtcbn07XG5cbmNvbnN0IEVNUFRZX0FSUkFZOiBuZXZlcltdID0gW107XG5PYmplY3QuZnJlZXplKEVNUFRZX0FSUkFZKTtcblxuZnVuY3Rpb24gYXNzaWduUHJvcGVydHk8VCwgSyBleHRlbmRzIGtleW9mIFQ+KHRhcmdldDogVCwgc291cmNlOiBQYXJ0aWFsPFQ+LCBrZXk6IEspIHtcblx0Y29uc3Qgc291cmNlQXRLZXkgPSBzb3VyY2Vba2V5XTtcblx0aWYgKHNvdXJjZUF0S2V5ICE9PSB1bmRlZmluZWQpIHtcblx0XHR0YXJnZXRba2V5XSA9IHNvdXJjZUF0S2V5ITtcblx0fVxufVxuXG5mdW5jdGlvbiBmaWxsUHJvcGVydHk8VCwgSyBleHRlbmRzIGtleW9mIFQ+KHRhcmdldDogVCwgc291cmNlOiBQYXJ0aWFsPFQ+LCBrZXk6IEspIHtcblx0Y29uc3Qgc291cmNlQXRLZXkgPSBzb3VyY2Vba2V5XTtcblx0aWYgKHRhcmdldFtrZXldID09PSB1bmRlZmluZWQgJiYgc291cmNlQXRLZXkgIT09IHVuZGVmaW5lZCkge1xuXHRcdHRhcmdldFtrZXldID0gc291cmNlQXRLZXkhO1xuXHR9XG59XG5cblxuaW50ZXJmYWNlIElQYXJzZXJUeXBlPFQ+IHtcblx0aXNFbXB0eSh2YWx1ZTogVCB8IHVuZGVmaW5lZCk6IGJvb2xlYW47XG5cdGFzc2lnblByb3BlcnRpZXModGFyZ2V0OiBUIHwgdW5kZWZpbmVkLCBzb3VyY2U6IFQgfCB1bmRlZmluZWQpOiBUIHwgdW5kZWZpbmVkO1xuXHRmaWxsUHJvcGVydGllcyh0YXJnZXQ6IFQgfCB1bmRlZmluZWQsIHNvdXJjZTogVCB8IHVuZGVmaW5lZCk6IFQgfCB1bmRlZmluZWQ7XG5cdGZpbGxEZWZhdWx0cyh2YWx1ZTogVCB8IHVuZGVmaW5lZCwgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IFQgfCB1bmRlZmluZWQ7XG5cdGZyZWV6ZSh2YWx1ZTogVCk6IFJlYWRvbmx5PFQ+IHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSU1ldGFEYXRhPFQsIFU+IHtcblx0cHJvcGVydHk6IGtleW9mIFQ7XG5cdHR5cGU/OiBJUGFyc2VyVHlwZTxVPjtcbn1cblxuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSAtLSBJTWV0YURhdGEgYXJyYXkgaG9sZHMgaGV0ZXJvZ2VuZW91cyBwYXJzZXIgdHlwZXNcbmZ1bmN0aW9uIF9pc0VtcHR5PFQ+KHRoaXM6IHZvaWQsIHZhbHVlOiBUIHwgdW5kZWZpbmVkLCBwcm9wZXJ0aWVzOiBJTWV0YURhdGE8VCwgYW55PltdIHwgdW5kZWZpbmVkLCBhbGxvd0VtcHR5QXJyYXk6IGJvb2xlYW4gPSBmYWxzZSk6IGJvb2xlYW4ge1xuXHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCB8fCBwcm9wZXJ0aWVzID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRmb3IgKGNvbnN0IG1ldGEgb2YgcHJvcGVydGllcykge1xuXHRcdGNvbnN0IHByb3BlcnR5ID0gdmFsdWVbbWV0YS5wcm9wZXJ0eV07XG5cdFx0aWYgKHByb3BlcnR5ICE9PSB1bmRlZmluZWQgJiYgcHJvcGVydHkgIT09IG51bGwpIHtcblx0XHRcdGlmIChtZXRhLnR5cGUgIT09IHVuZGVmaW5lZCAmJiAhbWV0YS50eXBlLmlzRW1wdHkocHJvcGVydHkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkocHJvcGVydHkpIHx8IChwcm9wZXJ0eS5sZW5ndGggPiAwKSB8fCBhbGxvd0VtcHR5QXJyYXkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnkgLS0gSU1ldGFEYXRhIGFycmF5IGhvbGRzIGhldGVyb2dlbmVvdXMgcGFyc2VyIHR5cGVzXG5mdW5jdGlvbiBfYXNzaWduUHJvcGVydGllczxUPih0aGlzOiB2b2lkLCB0YXJnZXQ6IFQgfCB1bmRlZmluZWQsIHNvdXJjZTogVCB8IHVuZGVmaW5lZCwgcHJvcGVydGllczogSU1ldGFEYXRhPFQsIGFueT5bXSk6IFQgfCB1bmRlZmluZWQge1xuXHRpZiAoIXNvdXJjZSB8fCBfaXNFbXB0eShzb3VyY2UsIHByb3BlcnRpZXMpKSB7XG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fVxuXHRpZiAoIXRhcmdldCB8fCBfaXNFbXB0eSh0YXJnZXQsIHByb3BlcnRpZXMpKSB7XG5cdFx0cmV0dXJuIHNvdXJjZTtcblx0fVxuXHRmb3IgKGNvbnN0IG1ldGEgb2YgcHJvcGVydGllcykge1xuXHRcdGNvbnN0IHByb3BlcnR5ID0gbWV0YS5wcm9wZXJ0eTtcblx0XHRsZXQgdmFsdWU6IFRba2V5b2YgVF0gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1ldGEudHlwZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZSA9IG1ldGEudHlwZS5hc3NpZ25Qcm9wZXJ0aWVzKHRhcmdldFtwcm9wZXJ0eV0sIHNvdXJjZVtwcm9wZXJ0eV0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWx1ZSA9IHNvdXJjZVtwcm9wZXJ0eV07XG5cdFx0fVxuXHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsKSB7XG5cdFx0XHQodGFyZ2V0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwcm9wZXJ0eSBhcyBzdHJpbmddID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0YXJnZXQ7XG59XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55IC0tIElNZXRhRGF0YSBhcnJheSBob2xkcyBoZXRlcm9nZW5lb3VzIHBhcnNlciB0eXBlc1xuZnVuY3Rpb24gX2ZpbGxQcm9wZXJ0aWVzPFQ+KHRoaXM6IHZvaWQsIHRhcmdldDogVCB8IHVuZGVmaW5lZCwgc291cmNlOiBUIHwgdW5kZWZpbmVkLCBwcm9wZXJ0aWVzOiBJTWV0YURhdGE8VCwgYW55PltdIHwgdW5kZWZpbmVkLCBhbGxvd0VtcHR5QXJyYXk6IGJvb2xlYW4gPSBmYWxzZSk6IFQgfCB1bmRlZmluZWQge1xuXHRpZiAoIXNvdXJjZSB8fCBfaXNFbXB0eShzb3VyY2UsIHByb3BlcnRpZXMpKSB7XG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fVxuXHRpZiAoIXRhcmdldCB8fCBfaXNFbXB0eSh0YXJnZXQsIHByb3BlcnRpZXMsIGFsbG93RW1wdHlBcnJheSkpIHtcblx0XHRyZXR1cm4gc291cmNlO1xuXHR9XG5cdGZvciAoY29uc3QgbWV0YSBvZiBwcm9wZXJ0aWVzISkge1xuXHRcdGNvbnN0IHByb3BlcnR5ID0gbWV0YS5wcm9wZXJ0eTtcblx0XHRsZXQgdmFsdWU6IFRba2V5b2YgVF0gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1ldGEudHlwZSkge1xuXHRcdFx0dmFsdWUgPSBtZXRhLnR5cGUuZmlsbFByb3BlcnRpZXModGFyZ2V0W3Byb3BlcnR5XSwgc291cmNlW3Byb3BlcnR5XSk7XG5cdFx0fSBlbHNlIGlmICh0YXJnZXRbcHJvcGVydHldID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhbHVlID0gc291cmNlW3Byb3BlcnR5XTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwpIHtcblx0XHRcdCh0YXJnZXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW3Byb3BlcnR5IGFzIHN0cmluZ10gPSB2YWx1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRhcmdldDtcbn1cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnkgLS0gSU1ldGFEYXRhIGFycmF5IGhvbGRzIGhldGVyb2dlbmVvdXMgcGFyc2VyIHR5cGVzXG5mdW5jdGlvbiBfZmlsbERlZmF1bHRzPFQ+KHRoaXM6IHZvaWQsIHRhcmdldDogVCB8IHVuZGVmaW5lZCwgZGVmYXVsdHM6IFQgfCB1bmRlZmluZWQsIHByb3BlcnRpZXM6IElNZXRhRGF0YTxULCBhbnk+W10sIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBUIHwgdW5kZWZpbmVkIHtcblx0aWYgKHRhcmdldCAmJiBPYmplY3QuaXNGcm96ZW4odGFyZ2V0KSkge1xuXHRcdHJldHVybiB0YXJnZXQ7XG5cdH1cblx0aWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkIHx8IHRhcmdldCA9PT0gbnVsbCB8fCBkZWZhdWx0cyA9PT0gdW5kZWZpbmVkIHx8IGRlZmF1bHRzID09PSBudWxsKSB7XG5cdFx0aWYgKGRlZmF1bHRzICE9PSB1bmRlZmluZWQgJiYgZGVmYXVsdHMgIT09IG51bGwpIHtcblx0XHRcdHJldHVybiBPYmplY3RzLmRlZXBDbG9uZShkZWZhdWx0cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cdGZvciAoY29uc3QgbWV0YSBvZiBwcm9wZXJ0aWVzKSB7XG5cdFx0Y29uc3QgcHJvcGVydHkgPSBtZXRhLnByb3BlcnR5O1xuXHRcdGlmICh0YXJnZXRbcHJvcGVydHldICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRsZXQgdmFsdWU6IFRba2V5b2YgVF0gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1ldGEudHlwZSkge1xuXHRcdFx0dmFsdWUgPSBtZXRhLnR5cGUuZmlsbERlZmF1bHRzKHRhcmdldFtwcm9wZXJ0eV0sIGNvbnRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWx1ZSA9IGRlZmF1bHRzW3Byb3BlcnR5XTtcblx0XHR9XG5cblx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0KHRhcmdldCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcHJvcGVydHkgYXMgc3RyaW5nXSA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdGFyZ2V0O1xufVxuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSAtLSBJTWV0YURhdGEgYXJyYXkgaG9sZHMgaGV0ZXJvZ2VuZW91cyBwYXJzZXIgdHlwZXNcbmZ1bmN0aW9uIF9mcmVlemU8VD4odGhpczogdm9pZCwgdGFyZ2V0OiBULCBwcm9wZXJ0aWVzOiBJTWV0YURhdGE8VCwgYW55PltdKTogUmVhZG9ubHk8VD4gfCB1bmRlZmluZWQge1xuXHRpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQgfHwgdGFyZ2V0ID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoT2JqZWN0LmlzRnJvemVuKHRhcmdldCkpIHtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cdGZvciAoY29uc3QgbWV0YSBvZiBwcm9wZXJ0aWVzKSB7XG5cdFx0aWYgKG1ldGEudHlwZSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0YXJnZXRbbWV0YS5wcm9wZXJ0eV07XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0bWV0YS50eXBlLmZyZWV6ZSh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdE9iamVjdC5mcmVlemUodGFyZ2V0KTtcblx0cmV0dXJuIHRhcmdldDtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBSdW5Pbk9wdGlvbnMge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVN0cmluZyh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogVGFza3MuUnVuT25PcHRpb25zIHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gVGFza3MuUnVuT25PcHRpb25zLmRlZmF1bHQ7XG5cdFx0fVxuXHRcdHN3aXRjaCAodmFsdWUudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0Y2FzZSAnZm9sZGVyb3Blbic6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5SdW5Pbk9wdGlvbnMuZm9sZGVyT3Blbjtcblx0XHRcdGNhc2UgJ3dvcmt0cmVlY3JlYXRlZCc6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5SdW5Pbk9wdGlvbnMud29ya3RyZWVDcmVhdGVkO1xuXHRcdFx0Y2FzZSAnZGVmYXVsdCc6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gVGFza3MuUnVuT25PcHRpb25zLmRlZmF1bHQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUnVuT3B0aW9ucyB7XG5cdGNvbnN0IHByb3BlcnRpZXM6IElNZXRhRGF0YTxUYXNrcy5JUnVuT3B0aW9ucywgdm9pZD5bXSA9IFt7IHByb3BlcnR5OiAncmVldmFsdWF0ZU9uUmVydW4nIH0sIHsgcHJvcGVydHk6ICdydW5PbicgfSwgeyBwcm9wZXJ0eTogJ2luc3RhbmNlTGltaXQnIH0sIHsgcHJvcGVydHk6ICdpbnN0YW5jZVBvbGljeScgfV07XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tQ29uZmlndXJhdGlvbih2YWx1ZTogSVJ1bk9wdGlvbnNDb25maWcgfCB1bmRlZmluZWQpOiBUYXNrcy5JUnVuT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlZXZhbHVhdGVPblJlcnVuOiB2YWx1ZSA/IHZhbHVlLnJlZXZhbHVhdGVPblJlcnVuIDogdHJ1ZSxcblx0XHRcdHJ1bk9uOiB2YWx1ZSA/IFJ1bk9uT3B0aW9ucy5mcm9tU3RyaW5nKHZhbHVlLnJ1bk9uKSA6IFRhc2tzLlJ1bk9uT3B0aW9ucy5kZWZhdWx0LFxuXHRcdFx0aW5zdGFuY2VMaW1pdDogdmFsdWU/Lmluc3RhbmNlTGltaXQgPyBNYXRoLm1heCh2YWx1ZS5pbnN0YW5jZUxpbWl0LCAxKSA6IDEsXG5cdFx0XHRpbnN0YW5jZVBvbGljeTogdmFsdWUgPyBJbnN0YW5jZVBvbGljeS5mcm9tU3RyaW5nKHZhbHVlLmluc3RhbmNlUG9saWN5KSA6IFRhc2tzLkluc3RhbmNlUG9saWN5LnByb21wdFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gYXNzaWduUHJvcGVydGllcyh0YXJnZXQ6IFRhc2tzLklSdW5PcHRpb25zLCBzb3VyY2U6IFRhc2tzLklSdW5PcHRpb25zIHwgdW5kZWZpbmVkKTogVGFza3MuSVJ1bk9wdGlvbnMge1xuXHRcdHJldHVybiBfYXNzaWduUHJvcGVydGllcyh0YXJnZXQsIHNvdXJjZSwgcHJvcGVydGllcykhO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxQcm9wZXJ0aWVzKHRhcmdldDogVGFza3MuSVJ1bk9wdGlvbnMsIHNvdXJjZTogVGFza3MuSVJ1bk9wdGlvbnMgfCB1bmRlZmluZWQpOiBUYXNrcy5JUnVuT3B0aW9ucyB7XG5cdFx0cmV0dXJuIF9maWxsUHJvcGVydGllcyh0YXJnZXQsIHNvdXJjZSwgcHJvcGVydGllcykhO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSW5zdGFuY2VQb2xpY3kge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVN0cmluZyh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogVGFza3MuSW5zdGFuY2VQb2xpY3kge1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybiBUYXNrcy5JbnN0YW5jZVBvbGljeS5wcm9tcHQ7XG5cdFx0fVxuXHRcdHN3aXRjaCAodmFsdWUudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0Y2FzZSAndGVybWluYXRlbmV3ZXN0Jzpcblx0XHRcdFx0cmV0dXJuIFRhc2tzLkluc3RhbmNlUG9saWN5LnRlcm1pbmF0ZU5ld2VzdDtcblx0XHRcdGNhc2UgJ3Rlcm1pbmF0ZW9sZGVzdCc6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5JbnN0YW5jZVBvbGljeS50ZXJtaW5hdGVPbGRlc3Q7XG5cdFx0XHRjYXNlICd3YXJuJzpcblx0XHRcdFx0cmV0dXJuIFRhc2tzLkluc3RhbmNlUG9saWN5Lndhcm47XG5cdFx0XHRjYXNlICdzaWxlbnQnOlxuXHRcdFx0XHRyZXR1cm4gVGFza3MuSW5zdGFuY2VQb2xpY3kuc2lsZW50O1xuXHRcdFx0Y2FzZSAncHJvbXB0Jzpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5JbnN0YW5jZVBvbGljeS5wcm9tcHQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnNlQ29udGV4dCB7XG5cdHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcjtcblx0d29ya3NwYWNlOiBJV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXHRwcm9ibGVtUmVwb3J0ZXI6IElQcm9ibGVtUmVwb3J0ZXI7XG5cdG5hbWVkUHJvYmxlbU1hdGNoZXJzOiBJU3RyaW5nRGljdGlvbmFyeTxJTmFtZWRQcm9ibGVtTWF0Y2hlcj47XG5cdHV1aWRNYXA6IFVVSURNYXA7XG5cdGVuZ2luZTogVGFza3MuRXhlY3V0aW9uRW5naW5lO1xuXHRzY2hlbWFWZXJzaW9uOiBUYXNrcy5Kc29uU2NoZW1hVmVyc2lvbjtcblx0cGxhdGZvcm06IFBsYXRmb3JtO1xuXHR0YXNrTG9hZElzc3Vlczogc3RyaW5nW107XG5cdGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG59XG5cblxubmFtZXNwYWNlIFNoZWxsQ29uZmlndXJhdGlvbiB7XG5cblx0Y29uc3QgcHJvcGVydGllczogSU1ldGFEYXRhPFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24sIHZvaWQ+W10gPSBbeyBwcm9wZXJ0eTogJ2V4ZWN1dGFibGUnIH0sIHsgcHJvcGVydHk6ICdhcmdzJyB9LCB7IHByb3BlcnR5OiAncXVvdGluZycgfV07XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSVNoZWxsQ29uZmlndXJhdGlvbiB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlOiBJU2hlbGxDb25maWd1cmF0aW9uID0gdmFsdWUgYXMgSVNoZWxsQ29uZmlndXJhdGlvbjtcblx0XHRyZXR1cm4gY2FuZGlkYXRlICYmIChUeXBlcy5pc1N0cmluZyhjYW5kaWRhdGUuZXhlY3V0YWJsZSkgfHwgVHlwZXMuaXNTdHJpbmdBcnJheShjYW5kaWRhdGUuYXJncykpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odGhpczogdm9pZCwgY29uZmlnOiBJU2hlbGxDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVGFza3MuSVNoZWxsQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFpcyhjb25maWcpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IElTaGVsbENvbmZpZ3VyYXRpb24gPSB7fTtcblx0XHRpZiAoY29uZmlnLmV4ZWN1dGFibGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0LmV4ZWN1dGFibGUgPSBjb25maWcuZXhlY3V0YWJsZTtcblx0XHR9XG5cdFx0aWYgKGNvbmZpZy5hcmdzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5hcmdzID0gY29uZmlnLmFyZ3Muc2xpY2UoKTtcblx0XHR9XG5cdFx0aWYgKGNvbmZpZy5xdW90aW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5xdW90aW5nID0gT2JqZWN0cy5kZWVwQ2xvbmUoY29uZmlnLnF1b3RpbmcpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaXNFbXB0eSh0aGlzOiB2b2lkLCB2YWx1ZTogVGFza3MuSVNoZWxsQ29uZmlndXJhdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBfaXNFbXB0eSh2YWx1ZSwgcHJvcGVydGllcywgdHJ1ZSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gYXNzaWduUHJvcGVydGllcyh0aGlzOiB2b2lkLCB0YXJnZXQ6IFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQsIHNvdXJjZTogVGFza3MuSVNoZWxsQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCk6IFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBfYXNzaWduUHJvcGVydGllcyh0YXJnZXQsIHNvdXJjZSwgcHJvcGVydGllcyk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZmlsbFByb3BlcnRpZXModGhpczogdm9pZCwgdGFyZ2V0OiBUYXNrcy5JU2hlbGxDb25maWd1cmF0aW9uLCBzb3VyY2U6IFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24pOiBUYXNrcy5JU2hlbGxDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gX2ZpbGxQcm9wZXJ0aWVzKHRhcmdldCwgc291cmNlLCBwcm9wZXJ0aWVzLCB0cnVlKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmaWxsRGVmYXVsdHModGhpczogdm9pZCwgdmFsdWU6IFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24sIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBUYXNrcy5JU2hlbGxDb25maWd1cmF0aW9uIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJlZXplKHRoaXM6IHZvaWQsIHZhbHVlOiBUYXNrcy5JU2hlbGxDb25maWd1cmF0aW9uKTogUmVhZG9ubHk8VGFza3MuSVNoZWxsQ29uZmlndXJhdGlvbj4gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHZhbHVlKTtcblx0fVxufVxuXG5uYW1lc3BhY2UgQ29tbWFuZE9wdGlvbnMge1xuXG5cdGNvbnN0IHByb3BlcnRpZXM6IElNZXRhRGF0YTxUYXNrcy5Db21tYW5kT3B0aW9ucywgVGFza3MuSVNoZWxsQ29uZmlndXJhdGlvbj5bXSA9IFt7IHByb3BlcnR5OiAnY3dkJyB9LCB7IHByb3BlcnR5OiAnZW52JyB9LCB7IHByb3BlcnR5OiAnc2hlbGwnLCB0eXBlOiBTaGVsbENvbmZpZ3VyYXRpb24gfV07XG5cdGNvbnN0IGRlZmF1bHRzOiBJQ29tbWFuZE9wdGlvbnNDb25maWcgPSB7IGN3ZDogJyR7d29ya3NwYWNlRm9sZGVyfScgfTtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0aGlzOiB2b2lkLCBvcHRpb25zOiBJQ29tbWFuZE9wdGlvbnNDb25maWcsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBUYXNrcy5Db21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0OiBUYXNrcy5Db21tYW5kT3B0aW9ucyA9IHt9O1xuXHRcdGlmIChvcHRpb25zLmN3ZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcob3B0aW9ucy5jd2QpKSB7XG5cdFx0XHRcdHJlc3VsdC5jd2QgPSBvcHRpb25zLmN3ZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRleHQudGFza0xvYWRJc3N1ZXMucHVzaChubHMubG9jYWxpemUoJ0NvbmZpZ3VyYXRpb25QYXJzZXIuaW52YWxpZENXRCcsICdXYXJuaW5nOiBvcHRpb25zLmN3ZCBtdXN0IGJlIG9mIHR5cGUgc3RyaW5nLiBJZ25vcmluZyB2YWx1ZSB7MH1cXG4nLCBvcHRpb25zLmN3ZCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5lbnYgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0LmVudiA9IE9iamVjdHMuZGVlcENsb25lKG9wdGlvbnMuZW52KTtcblx0XHR9XG5cdFx0cmVzdWx0LnNoZWxsID0gU2hlbGxDb25maWd1cmF0aW9uLmZyb20ob3B0aW9ucy5zaGVsbCwgY29udGV4dCk7XG5cdFx0cmV0dXJuIGlzRW1wdHkocmVzdWx0KSA/IHVuZGVmaW5lZCA6IHJlc3VsdDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5KHZhbHVlOiBUYXNrcy5Db21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBfaXNFbXB0eSh2YWx1ZSwgcHJvcGVydGllcyk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gYXNzaWduUHJvcGVydGllcyh0YXJnZXQ6IFRhc2tzLkNvbW1hbmRPcHRpb25zIHwgdW5kZWZpbmVkLCBzb3VyY2U6IFRhc2tzLkNvbW1hbmRPcHRpb25zIHwgdW5kZWZpbmVkKTogVGFza3MuQ29tbWFuZE9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGlmICgoc291cmNlID09PSB1bmRlZmluZWQpIHx8IGlzRW1wdHkoc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHR9XG5cdFx0aWYgKCh0YXJnZXQgPT09IHVuZGVmaW5lZCkgfHwgaXNFbXB0eSh0YXJnZXQpKSB7XG5cdFx0XHRyZXR1cm4gc291cmNlO1xuXHRcdH1cblx0XHRhc3NpZ25Qcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ2N3ZCcpO1xuXHRcdGlmICh0YXJnZXQuZW52ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRhcmdldC5lbnYgPSBzb3VyY2UuZW52O1xuXHRcdH0gZWxzZSBpZiAoc291cmNlLmVudiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0aWYgKHRhcmdldC5lbnYgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRPYmplY3Qua2V5cyh0YXJnZXQuZW52KS5mb3JFYWNoKGtleSA9PiBlbnZba2V5XSA9IHRhcmdldC5lbnYhW2tleV0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNvdXJjZS5lbnYgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRPYmplY3Qua2V5cyhzb3VyY2UuZW52KS5mb3JFYWNoKGtleSA9PiBlbnZba2V5XSA9IHNvdXJjZS5lbnYhW2tleV0pO1xuXHRcdFx0fVxuXHRcdFx0dGFyZ2V0LmVudiA9IGVudjtcblx0XHR9XG5cdFx0dGFyZ2V0LnNoZWxsID0gU2hlbGxDb25maWd1cmF0aW9uLmFzc2lnblByb3BlcnRpZXModGFyZ2V0LnNoZWxsLCBzb3VyY2Uuc2hlbGwpO1xuXHRcdHJldHVybiB0YXJnZXQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZmlsbFByb3BlcnRpZXModGFyZ2V0OiBUYXNrcy5Db21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCwgc291cmNlOiBUYXNrcy5Db21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFRhc2tzLkNvbW1hbmRPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gX2ZpbGxQcm9wZXJ0aWVzKHRhcmdldCwgc291cmNlLCBwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmaWxsRGVmYXVsdHModmFsdWU6IFRhc2tzLkNvbW1hbmRPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVGFza3MuQ29tbWFuZE9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBfZmlsbERlZmF1bHRzKHZhbHVlLCBkZWZhdWx0cywgcHJvcGVydGllcywgY29udGV4dCk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJlZXplKHZhbHVlOiBUYXNrcy5Db21tYW5kT3B0aW9ucyk6IFJlYWRvbmx5PFRhc2tzLkNvbW1hbmRPcHRpb25zPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIF9mcmVlemUodmFsdWUsIHByb3BlcnRpZXMpO1xuXHR9XG59XG5cbm5hbWVzcGFjZSBDb21tYW5kQ29uZmlndXJhdGlvbiB7XG5cblx0ZXhwb3J0IG5hbWVzcGFjZSBQcmVzZW50YXRpb25PcHRpb25zIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzOiBJTWV0YURhdGE8VGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMsIHZvaWQ+W10gPSBbeyBwcm9wZXJ0eTogJ2VjaG8nIH0sIHsgcHJvcGVydHk6ICdyZXZlYWwnIH0sIHsgcHJvcGVydHk6ICdyZXZlYWxQcm9ibGVtcycgfSwgeyBwcm9wZXJ0eTogJ2ZvY3VzJyB9LCB7IHByb3BlcnR5OiAncGFuZWwnIH0sIHsgcHJvcGVydHk6ICdzaG93UmV1c2VNZXNzYWdlJyB9LCB7IHByb3BlcnR5OiAnY2xlYXInIH0sIHsgcHJvcGVydHk6ICdncm91cCcgfSwgeyBwcm9wZXJ0eTogJ2Nsb3NlJyB9LCB7IHByb3BlcnR5OiAncHJlc2VydmVUZXJtaW5hbE5hbWUnIH1dO1xuXG5cdFx0aW50ZXJmYWNlIElQcmVzZW50YXRpb25PcHRpb25zU2hhcGUgZXh0ZW5kcyBJTGVnYWN5Q29tbWFuZFByb3BlcnRpZXMge1xuXHRcdFx0cHJlc2VudGF0aW9uPzogSVByZXNlbnRhdGlvbk9wdGlvbnNDb25maWc7XG5cdFx0fVxuXG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odGhpczogdm9pZCwgY29uZmlnOiBJUHJlc2VudGF0aW9uT3B0aW9uc1NoYXBlLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdFx0bGV0IGVjaG86IGJvb2xlYW47XG5cdFx0XHRsZXQgcmV2ZWFsOiBUYXNrcy5SZXZlYWxLaW5kO1xuXHRcdFx0bGV0IHJldmVhbFByb2JsZW1zOiBUYXNrcy5SZXZlYWxQcm9ibGVtS2luZDtcblx0XHRcdGxldCBmb2N1czogYm9vbGVhbjtcblx0XHRcdGxldCBwYW5lbDogVGFza3MuUGFuZWxLaW5kO1xuXHRcdFx0bGV0IHNob3dSZXVzZU1lc3NhZ2U6IGJvb2xlYW47XG5cdFx0XHRsZXQgY2xlYXI6IGJvb2xlYW47XG5cdFx0XHRsZXQgZ3JvdXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBjbG9zZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBwcmVzZXJ2ZVRlcm1pbmFsTmFtZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBoYXNQcm9wcyA9IGZhbHNlO1xuXHRcdFx0aWYgKFR5cGVzLmlzQm9vbGVhbihjb25maWcuZWNob0NvbW1hbmQpKSB7XG5cdFx0XHRcdGVjaG8gPSBjb25maWcuZWNob0NvbW1hbmQ7XG5cdFx0XHRcdGhhc1Byb3BzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhjb25maWcuc2hvd091dHB1dCkpIHtcblx0XHRcdFx0cmV2ZWFsID0gVGFza3MuUmV2ZWFsS2luZC5mcm9tU3RyaW5nKGNvbmZpZy5zaG93T3V0cHV0KTtcblx0XHRcdFx0aGFzUHJvcHMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gY29uZmlnLnByZXNlbnRhdGlvbiB8fCBjb25maWcudGVybWluYWw7XG5cdFx0XHRpZiAocHJlc2VudGF0aW9uKSB7XG5cdFx0XHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4ocHJlc2VudGF0aW9uLmVjaG8pKSB7XG5cdFx0XHRcdFx0ZWNobyA9IHByZXNlbnRhdGlvbi5lY2hvO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhwcmVzZW50YXRpb24ucmV2ZWFsKSkge1xuXHRcdFx0XHRcdHJldmVhbCA9IFRhc2tzLlJldmVhbEtpbmQuZnJvbVN0cmluZyhwcmVzZW50YXRpb24ucmV2ZWFsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcocHJlc2VudGF0aW9uLnJldmVhbFByb2JsZW1zKSkge1xuXHRcdFx0XHRcdHJldmVhbFByb2JsZW1zID0gVGFza3MuUmV2ZWFsUHJvYmxlbUtpbmQuZnJvbVN0cmluZyhwcmVzZW50YXRpb24ucmV2ZWFsUHJvYmxlbXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4ocHJlc2VudGF0aW9uLmZvY3VzKSkge1xuXHRcdFx0XHRcdGZvY3VzID0gcHJlc2VudGF0aW9uLmZvY3VzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhwcmVzZW50YXRpb24ucGFuZWwpKSB7XG5cdFx0XHRcdFx0cGFuZWwgPSBUYXNrcy5QYW5lbEtpbmQuZnJvbVN0cmluZyhwcmVzZW50YXRpb24ucGFuZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4ocHJlc2VudGF0aW9uLnNob3dSZXVzZU1lc3NhZ2UpKSB7XG5cdFx0XHRcdFx0c2hvd1JldXNlTWVzc2FnZSA9IHByZXNlbnRhdGlvbi5zaG93UmV1c2VNZXNzYWdlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4ocHJlc2VudGF0aW9uLmNsZWFyKSkge1xuXHRcdFx0XHRcdGNsZWFyID0gcHJlc2VudGF0aW9uLmNsZWFyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhwcmVzZW50YXRpb24uZ3JvdXApKSB7XG5cdFx0XHRcdFx0Z3JvdXAgPSBwcmVzZW50YXRpb24uZ3JvdXA7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKFR5cGVzLmlzQm9vbGVhbihwcmVzZW50YXRpb24uY2xvc2UpKSB7XG5cdFx0XHRcdFx0Y2xvc2UgPSBwcmVzZW50YXRpb24uY2xvc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKFR5cGVzLmlzQm9vbGVhbihwcmVzZW50YXRpb24ucHJlc2VydmVUZXJtaW5hbE5hbWUpKSB7XG5cdFx0XHRcdFx0cHJlc2VydmVUZXJtaW5hbE5hbWUgPSBwcmVzZW50YXRpb24ucHJlc2VydmVUZXJtaW5hbE5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aGFzUHJvcHMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFoYXNQcm9wcykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgZWNobzogZWNobyEsIHJldmVhbDogcmV2ZWFsISwgcmV2ZWFsUHJvYmxlbXM6IHJldmVhbFByb2JsZW1zISwgZm9jdXM6IGZvY3VzISwgcGFuZWw6IHBhbmVsISwgc2hvd1JldXNlTWVzc2FnZTogc2hvd1JldXNlTWVzc2FnZSEsIGNsZWFyOiBjbGVhciEsIGdyb3VwLCBjbG9zZTogY2xvc2UsIHByZXNlcnZlVGVybWluYWxOYW1lIH07XG5cdFx0fVxuXG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGFzc2lnblByb3BlcnRpZXModGFyZ2V0OiBUYXNrcy5JUHJlc2VudGF0aW9uT3B0aW9ucywgc291cmNlOiBUYXNrcy5JUHJlc2VudGF0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiBfYXNzaWduUHJvcGVydGllcyh0YXJnZXQsIHNvdXJjZSwgcHJvcGVydGllcyk7XG5cdFx0fVxuXG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxQcm9wZXJ0aWVzKHRhcmdldDogVGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMsIHNvdXJjZTogVGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQpOiBUYXNrcy5JUHJlc2VudGF0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gX2ZpbGxQcm9wZXJ0aWVzKHRhcmdldCwgc291cmNlLCBwcm9wZXJ0aWVzKTtcblx0XHR9XG5cblx0XHRleHBvcnQgZnVuY3Rpb24gZmlsbERlZmF1bHRzKHZhbHVlOiBUYXNrcy5JUHJlc2VudGF0aW9uT3B0aW9ucywgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRFY2hvID0gY29udGV4dC5lbmdpbmUgPT09IFRhc2tzLkV4ZWN1dGlvbkVuZ2luZS5UZXJtaW5hbCA/IHRydWUgOiBmYWxzZTtcblx0XHRcdHJldHVybiBfZmlsbERlZmF1bHRzKHZhbHVlLCB7IGVjaG86IGRlZmF1bHRFY2hvLCByZXZlYWw6IFRhc2tzLlJldmVhbEtpbmQuQWx3YXlzLCByZXZlYWxQcm9ibGVtczogVGFza3MuUmV2ZWFsUHJvYmxlbUtpbmQuTmV2ZXIsIGZvY3VzOiBmYWxzZSwgcGFuZWw6IFRhc2tzLlBhbmVsS2luZC5TaGFyZWQsIHNob3dSZXVzZU1lc3NhZ2U6IHRydWUsIGNsZWFyOiBmYWxzZSwgcHJlc2VydmVUZXJtaW5hbE5hbWU6IGZhbHNlIH0sIHByb3BlcnRpZXMsIGNvbnRleHQpO1xuXHRcdH1cblxuXHRcdGV4cG9ydCBmdW5jdGlvbiBmcmVlemUodmFsdWU6IFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zKTogUmVhZG9ubHk8VGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnM+IHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiBfZnJlZXplKHZhbHVlLCBwcm9wZXJ0aWVzKTtcblx0XHR9XG5cblx0XHRleHBvcnQgZnVuY3Rpb24gaXNFbXB0eSh0aGlzOiB2b2lkLCB2YWx1ZTogVGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiBfaXNFbXB0eSh2YWx1ZSwgcHJvcGVydGllcyk7XG5cdFx0fVxuXHR9XG5cblx0bmFtZXNwYWNlIFNoZWxsU3RyaW5nIHtcblx0XHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0aGlzOiB2b2lkLCB2YWx1ZTogQ29tbWFuZFN0cmluZyB8IHVuZGVmaW5lZCk6IFRhc2tzLkNvbW1hbmRTdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fSBlbHNlIGlmIChUeXBlcy5pc1N0cmluZ0FycmF5KHZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWUuam9pbignICcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcXVvdGluZyA9IFRhc2tzLlNoZWxsUXVvdGluZy5mcm9tKHZhbHVlLnF1b3RpbmcpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBUeXBlcy5pc1N0cmluZyh2YWx1ZS52YWx1ZSkgPyB2YWx1ZS52YWx1ZSA6IFR5cGVzLmlzU3RyaW5nQXJyYXkodmFsdWUudmFsdWUpID8gdmFsdWUudmFsdWUuam9pbignICcpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHZhbHVlOiByZXN1bHQsXG5cdFx0XHRcdFx0XHRxdW90aW5nOiBxdW90aW5nXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aW50ZXJmYWNlIElCYXNlQ29tbWFuZENvbmZpZ3VyYXRpb25TaGFwZSBleHRlbmRzIElCYXNlQ29tbWFuZFByb3BlcnRpZXMsIElMZWdhY3lDb21tYW5kUHJvcGVydGllcyB7XG5cdH1cblxuXHRpbnRlcmZhY2UgSUNvbW1hbmRDb25maWd1cmF0aW9uU2hhcGUgZXh0ZW5kcyBJQmFzZUNvbW1hbmRDb25maWd1cmF0aW9uU2hhcGUge1xuXHRcdHdpbmRvd3M/OiBJQmFzZUNvbW1hbmRDb25maWd1cmF0aW9uU2hhcGU7XG5cdFx0b3N4PzogSUJhc2VDb21tYW5kQ29uZmlndXJhdGlvblNoYXBlO1xuXHRcdGxpbnV4PzogSUJhc2VDb21tYW5kQ29uZmlndXJhdGlvblNoYXBlO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnkgLS0gSU1ldGFEYXRhIGFycmF5IGhvbGRzIGhldGVyb2dlbmVvdXMgcGFyc2VyIHR5cGVzXG5cdGNvbnN0IHByb3BlcnRpZXM6IElNZXRhRGF0YTxUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24sIGFueT5bXSA9IFtcblx0XHR7IHByb3BlcnR5OiAncnVudGltZScgfSwgeyBwcm9wZXJ0eTogJ25hbWUnIH0sIHsgcHJvcGVydHk6ICdvcHRpb25zJywgdHlwZTogQ29tbWFuZE9wdGlvbnMgfSxcblx0XHR7IHByb3BlcnR5OiAnYXJncycgfSwgeyBwcm9wZXJ0eTogJ3Rhc2tTZWxlY3RvcicgfSwgeyBwcm9wZXJ0eTogJ3N1cHByZXNzVGFza05hbWUnIH0sXG5cdFx0eyBwcm9wZXJ0eTogJ3ByZXNlbnRhdGlvbicsIHR5cGU6IFByZXNlbnRhdGlvbk9wdGlvbnMgfVxuXHRdO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGNvbmZpZzogSUNvbW1hbmRDb25maWd1cmF0aW9uU2hhcGUsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQ6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiA9IGZyb21CYXNlKGNvbmZpZywgY29udGV4dCkhO1xuXG5cdFx0bGV0IG9zQ29uZmlnOiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbmZpZy53aW5kb3dzICYmIGNvbnRleHQucGxhdGZvcm0gPT09IFBsYXRmb3JtLldpbmRvd3MpIHtcblx0XHRcdG9zQ29uZmlnID0gZnJvbUJhc2UoY29uZmlnLndpbmRvd3MsIGNvbnRleHQpO1xuXHRcdH0gZWxzZSBpZiAoY29uZmlnLm9zeCAmJiBjb250ZXh0LnBsYXRmb3JtID09PSBQbGF0Zm9ybS5NYWMpIHtcblx0XHRcdG9zQ29uZmlnID0gZnJvbUJhc2UoY29uZmlnLm9zeCwgY29udGV4dCk7XG5cdFx0fSBlbHNlIGlmIChjb25maWcubGludXggJiYgY29udGV4dC5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uTGludXgpIHtcblx0XHRcdG9zQ29uZmlnID0gZnJvbUJhc2UoY29uZmlnLmxpbnV4LCBjb250ZXh0KTtcblx0XHR9XG5cdFx0aWYgKG9zQ29uZmlnKSB7XG5cdFx0XHRyZXN1bHQgPSBhc3NpZ25Qcm9wZXJ0aWVzKHJlc3VsdCwgb3NDb25maWcsIGNvbnRleHQuc2NoZW1hVmVyc2lvbiA9PT0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKTtcblx0XHR9XG5cdFx0cmV0dXJuIGlzRW1wdHkocmVzdWx0KSA/IHVuZGVmaW5lZCA6IHJlc3VsdDtcblx0fVxuXG5cdGZ1bmN0aW9uIGZyb21CYXNlKHRoaXM6IHZvaWQsIGNvbmZpZzogSUJhc2VDb21tYW5kQ29uZmlndXJhdGlvblNoYXBlLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBuYW1lOiBUYXNrcy5Db21tYW5kU3RyaW5nIHwgdW5kZWZpbmVkID0gU2hlbGxTdHJpbmcuZnJvbShjb25maWcuY29tbWFuZCk7XG5cdFx0bGV0IHJ1bnRpbWU6IFRhc2tzLlJ1bnRpbWVUeXBlO1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyhjb25maWcudHlwZSkpIHtcblx0XHRcdGlmIChjb25maWcudHlwZSA9PT0gJ3NoZWxsJyB8fCBjb25maWcudHlwZSA9PT0gJ3Byb2Nlc3MnKSB7XG5cdFx0XHRcdHJ1bnRpbWUgPSBUYXNrcy5SdW50aW1lVHlwZS5mcm9tU3RyaW5nKGNvbmZpZy50eXBlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKFR5cGVzLmlzQm9vbGVhbihjb25maWcuaXNTaGVsbENvbW1hbmQpIHx8IFNoZWxsQ29uZmlndXJhdGlvbi5pcyhjb25maWcuaXNTaGVsbENvbW1hbmQpKSB7XG5cdFx0XHRydW50aW1lID0gVGFza3MuUnVudGltZVR5cGUuU2hlbGw7XG5cdFx0fSBlbHNlIGlmIChjb25maWcuaXNTaGVsbENvbW1hbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cnVudGltZSA9ICEhY29uZmlnLmlzU2hlbGxDb21tYW5kID8gVGFza3MuUnVudGltZVR5cGUuU2hlbGwgOiBUYXNrcy5SdW50aW1lVHlwZS5Qcm9jZXNzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0bmFtZTogbmFtZSxcblx0XHRcdHJ1bnRpbWU6IHJ1bnRpbWUhLFxuXHRcdFx0cHJlc2VudGF0aW9uOiBQcmVzZW50YXRpb25PcHRpb25zLmZyb20oY29uZmlnLCBjb250ZXh0KSFcblx0XHR9O1xuXG5cdFx0aWYgKGNvbmZpZy5hcmdzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5hcmdzID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGFyZyBvZiBjb25maWcuYXJncykge1xuXHRcdFx0XHRjb25zdCBjb252ZXJ0ZWQgPSBTaGVsbFN0cmluZy5mcm9tKGFyZyk7XG5cdFx0XHRcdGlmIChjb252ZXJ0ZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJlc3VsdC5hcmdzLnB1c2goY29udmVydGVkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb250ZXh0LnRhc2tMb2FkSXNzdWVzLnB1c2goXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdCdDb25maWd1cmF0aW9uUGFyc2VyLmluVmFsaWRBcmcnLFxuXHRcdFx0XHRcdFx0XHQnRXJyb3I6IGNvbW1hbmQgYXJndW1lbnQgbXVzdCBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBxdW90ZWQgc3RyaW5nLiBQcm92aWRlZCB2YWx1ZSBpczpcXG57MH0nLFxuXHRcdFx0XHRcdFx0XHRhcmcgPyBKU09OLnN0cmluZ2lmeShhcmcsIHVuZGVmaW5lZCwgNCkgOiAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNvbmZpZy5vcHRpb25zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5vcHRpb25zID0gQ29tbWFuZE9wdGlvbnMuZnJvbShjb25maWcub3B0aW9ucywgY29udGV4dCk7XG5cdFx0XHRpZiAocmVzdWx0Lm9wdGlvbnMgJiYgcmVzdWx0Lm9wdGlvbnMuc2hlbGwgPT09IHVuZGVmaW5lZCAmJiBTaGVsbENvbmZpZ3VyYXRpb24uaXMoY29uZmlnLmlzU2hlbGxDb21tYW5kKSkge1xuXHRcdFx0XHRyZXN1bHQub3B0aW9ucy5zaGVsbCA9IFNoZWxsQ29uZmlndXJhdGlvbi5mcm9tKGNvbmZpZy5pc1NoZWxsQ29tbWFuZCwgY29udGV4dCk7XG5cdFx0XHRcdGlmIChjb250ZXh0LmVuZ2luZSAhPT0gVGFza3MuRXhlY3V0aW9uRW5naW5lLlRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0Y29udGV4dC50YXNrTG9hZElzc3Vlcy5wdXNoKG5scy5sb2NhbGl6ZSgnQ29uZmlndXJhdGlvblBhcnNlci5ub1NoZWxsJywgJ1dhcm5pbmc6IHNoZWxsIGNvbmZpZ3VyYXRpb24gaXMgb25seSBzdXBwb3J0ZWQgd2hlbiBleGVjdXRpbmcgdGFza3MgaW4gdGhlIHRlcm1pbmFsLicpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChUeXBlcy5pc1N0cmluZyhjb25maWcudGFza1NlbGVjdG9yKSkge1xuXHRcdFx0cmVzdWx0LnRhc2tTZWxlY3RvciA9IGNvbmZpZy50YXNrU2VsZWN0b3I7XG5cdFx0fVxuXHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4oY29uZmlnLnN1cHByZXNzVGFza05hbWUpKSB7XG5cdFx0XHRyZXN1bHQuc3VwcHJlc3NUYXNrTmFtZSA9IGNvbmZpZy5zdXBwcmVzc1Rhc2tOYW1lO1xuXHRcdH1cblxuXHRcdHJldHVybiBpc0VtcHR5KHJlc3VsdCkgPyB1bmRlZmluZWQgOiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaGFzQ29tbWFuZCh2YWx1ZTogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHZhbHVlICYmICEhdmFsdWUubmFtZTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5KHZhbHVlOiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gX2lzRW1wdHkodmFsdWUsIHByb3BlcnRpZXMpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGFzc2lnblByb3BlcnRpZXModGFyZ2V0OiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24sIHNvdXJjZTogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uLCBvdmVyd3JpdGVBcmdzOiBib29sZWFuKTogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uIHtcblx0XHRpZiAoaXNFbXB0eShzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdH1cblx0XHRpZiAoaXNFbXB0eSh0YXJnZXQpKSB7XG5cdFx0XHRyZXR1cm4gc291cmNlO1xuXHRcdH1cblx0XHRhc3NpZ25Qcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ25hbWUnKTtcblx0XHRhc3NpZ25Qcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ3J1bnRpbWUnKTtcblx0XHRhc3NpZ25Qcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ3Rhc2tTZWxlY3RvcicpO1xuXHRcdGFzc2lnblByb3BlcnR5KHRhcmdldCwgc291cmNlLCAnc3VwcHJlc3NUYXNrTmFtZScpO1xuXHRcdGlmIChzb3VyY2UuYXJncyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAodGFyZ2V0LmFyZ3MgPT09IHVuZGVmaW5lZCB8fCBvdmVyd3JpdGVBcmdzKSB7XG5cdFx0XHRcdHRhcmdldC5hcmdzID0gc291cmNlLmFyZ3M7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0YXJnZXQuYXJncyA9IHRhcmdldC5hcmdzLmNvbmNhdChzb3VyY2UuYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRhcmdldC5wcmVzZW50YXRpb24gPSBQcmVzZW50YXRpb25PcHRpb25zLmFzc2lnblByb3BlcnRpZXModGFyZ2V0LnByZXNlbnRhdGlvbiEsIHNvdXJjZS5wcmVzZW50YXRpb24pITtcblx0XHR0YXJnZXQub3B0aW9ucyA9IENvbW1hbmRPcHRpb25zLmFzc2lnblByb3BlcnRpZXModGFyZ2V0Lm9wdGlvbnMsIHNvdXJjZS5vcHRpb25zKTtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxQcm9wZXJ0aWVzKHRhcmdldDogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uLCBzb3VyY2U6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbik6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIF9maWxsUHJvcGVydGllcyh0YXJnZXQsIHNvdXJjZSwgcHJvcGVydGllcyk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZmlsbEdsb2JhbHModGFyZ2V0OiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24sIHNvdXJjZTogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkLCB0YXNrTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uIHtcblx0XHRpZiAoKHNvdXJjZSA9PT0gdW5kZWZpbmVkKSB8fCBpc0VtcHR5KHNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0fVxuXHRcdHRhcmdldCA9IHRhcmdldCB8fCB7XG5cdFx0XHRuYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRydW50aW1lOiB1bmRlZmluZWQsXG5cdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZFxuXHRcdH07XG5cdFx0aWYgKHRhcmdldC5uYW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGZpbGxQcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ25hbWUnKTtcblx0XHRcdGZpbGxQcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ3Rhc2tTZWxlY3RvcicpO1xuXHRcdFx0ZmlsbFByb3BlcnR5KHRhcmdldCwgc291cmNlLCAnc3VwcHJlc3NUYXNrTmFtZScpO1xuXHRcdFx0bGV0IGFyZ3M6IFRhc2tzLkNvbW1hbmRTdHJpbmdbXSA9IHNvdXJjZS5hcmdzID8gc291cmNlLmFyZ3Muc2xpY2UoKSA6IFtdO1xuXHRcdFx0aWYgKCF0YXJnZXQuc3VwcHJlc3NUYXNrTmFtZSAmJiB0YXNrTmFtZSkge1xuXHRcdFx0XHRpZiAodGFyZ2V0LnRhc2tTZWxlY3RvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0YXJncy5wdXNoKHRhcmdldC50YXNrU2VsZWN0b3IgKyB0YXNrTmFtZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXJncy5wdXNoKHRhc2tOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHRhcmdldC5hcmdzKSB7XG5cdFx0XHRcdGFyZ3MgPSBhcmdzLmNvbmNhdCh0YXJnZXQuYXJncyk7XG5cdFx0XHR9XG5cdFx0XHR0YXJnZXQuYXJncyA9IGFyZ3M7XG5cdFx0fVxuXHRcdGZpbGxQcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ3J1bnRpbWUnKTtcblxuXHRcdHRhcmdldC5wcmVzZW50YXRpb24gPSBQcmVzZW50YXRpb25PcHRpb25zLmZpbGxQcm9wZXJ0aWVzKHRhcmdldC5wcmVzZW50YXRpb24hLCBzb3VyY2UucHJlc2VudGF0aW9uKSE7XG5cdFx0dGFyZ2V0Lm9wdGlvbnMgPSBDb21tYW5kT3B0aW9ucy5maWxsUHJvcGVydGllcyh0YXJnZXQub3B0aW9ucywgc291cmNlLm9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmaWxsRGVmYXVsdHModmFsdWU6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCwgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICghdmFsdWUgfHwgT2JqZWN0LmlzRnJvemVuKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodmFsdWUubmFtZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlLnJ1bnRpbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFsdWUucnVudGltZSA9IFRhc2tzLlJ1bnRpbWVUeXBlLlByb2Nlc3M7XG5cdFx0fVxuXHRcdHZhbHVlLnByZXNlbnRhdGlvbiA9IFByZXNlbnRhdGlvbk9wdGlvbnMuZmlsbERlZmF1bHRzKHZhbHVlLnByZXNlbnRhdGlvbiEsIGNvbnRleHQpITtcblx0XHRpZiAoIWlzRW1wdHkodmFsdWUpKSB7XG5cdFx0XHR2YWx1ZS5vcHRpb25zID0gQ29tbWFuZE9wdGlvbnMuZmlsbERlZmF1bHRzKHZhbHVlLm9wdGlvbnMsIGNvbnRleHQpO1xuXHRcdH1cblx0XHRpZiAodmFsdWUuYXJncyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZS5hcmdzID0gRU1QVFlfQVJSQVk7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS5zdXBwcmVzc1Rhc2tOYW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhbHVlLnN1cHByZXNzVGFza05hbWUgPSAoY29udGV4dC5zY2hlbWFWZXJzaW9uID09PSBUYXNrcy5Kc29uU2NoZW1hVmVyc2lvbi5WMl8wXzApO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcmVlemUodmFsdWU6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbik6IFJlYWRvbmx5PFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBfZnJlZXplKHZhbHVlLCBwcm9wZXJ0aWVzKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFByb2JsZW1NYXRjaGVyQ29udmVydGVyIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gbmFtZWRGcm9tKHRoaXM6IHZvaWQsIGRlY2xhcmVzOiBQcm9ibGVtTWF0Y2hlckNvbmZpZy5JTmFtZWRQcm9ibGVtTWF0Y2hlcltdIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogSVN0cmluZ0RpY3Rpb25hcnk8SU5hbWVkUHJvYmxlbU1hdGNoZXI+IHtcblx0XHRjb25zdCByZXN1bHQ6IElTdHJpbmdEaWN0aW9uYXJ5PElOYW1lZFByb2JsZW1NYXRjaGVyPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZGVjbGFyZXMpKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHQoPFByb2JsZW1NYXRjaGVyQ29uZmlnLklOYW1lZFByb2JsZW1NYXRjaGVyW10+ZGVjbGFyZXMpLmZvckVhY2goKHZhbHVlKSA9PiB7XG5cdFx0XHRjb25zdCBuYW1lZFByb2JsZW1NYXRjaGVyID0gKG5ldyBQcm9ibGVtTWF0Y2hlclBhcnNlcihjb250ZXh0LnByb2JsZW1SZXBvcnRlcikpLnBhcnNlKHZhbHVlKTtcblx0XHRcdGlmIChpc05hbWVkUHJvYmxlbU1hdGNoZXIobmFtZWRQcm9ibGVtTWF0Y2hlcikpIHtcblx0XHRcdFx0cmVzdWx0W25hbWVkUHJvYmxlbU1hdGNoZXIubmFtZV0gPSBuYW1lZFByb2JsZW1NYXRjaGVyO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGV4dC5wcm9ibGVtUmVwb3J0ZXIuZXJyb3IobmxzLmxvY2FsaXplKCdDb25maWd1cmF0aW9uUGFyc2VyLm5vTmFtZScsICdFcnJvcjogUHJvYmxlbSBNYXRjaGVyIGluIGRlY2xhcmUgc2NvcGUgbXVzdCBoYXZlIGEgbmFtZTpcXG57MH1cXG4nLCBKU09OLnN0cmluZ2lmeSh2YWx1ZSwgdW5kZWZpbmVkLCA0KSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVdpdGhPc0NvbmZpZyh0aGlzOiB2b2lkLCBleHRlcm5hbDogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzICYgeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0sIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBUYXNrQ29uZmlndXJhdGlvblZhbHVlV2l0aEVycm9yczxQcm9ibGVtTWF0Y2hlcltdPiB7XG5cdFx0bGV0IHJlc3VsdDogVGFza0NvbmZpZ3VyYXRpb25WYWx1ZVdpdGhFcnJvcnM8UHJvYmxlbU1hdGNoZXJbXT4gPSB7fTtcblx0XHRjb25zdCBvc0V4dGVybmFsID0gZXh0ZXJuYWwgYXMgdW5rbm93biBhcyB7IHdpbmRvd3M/OiB7IHByb2JsZW1NYXRjaGVyPzogUHJvYmxlbU1hdGNoZXJDb25maWcuUHJvYmxlbU1hdGNoZXJUeXBlIH07IG9zeD86IHsgcHJvYmxlbU1hdGNoZXI/OiBQcm9ibGVtTWF0Y2hlckNvbmZpZy5Qcm9ibGVtTWF0Y2hlclR5cGUgfTsgbGludXg/OiB7IHByb2JsZW1NYXRjaGVyPzogUHJvYmxlbU1hdGNoZXJDb25maWcuUHJvYmxlbU1hdGNoZXJUeXBlIH0gfTtcblx0XHRpZiAob3NFeHRlcm5hbC53aW5kb3dzPy5wcm9ibGVtTWF0Y2hlciAmJiBjb250ZXh0LnBsYXRmb3JtID09PSBQbGF0Zm9ybS5XaW5kb3dzKSB7XG5cdFx0XHRyZXN1bHQgPSBmcm9tKG9zRXh0ZXJuYWwud2luZG93cy5wcm9ibGVtTWF0Y2hlciwgY29udGV4dCk7XG5cdFx0fSBlbHNlIGlmIChvc0V4dGVybmFsLm9zeD8ucHJvYmxlbU1hdGNoZXIgJiYgY29udGV4dC5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uTWFjKSB7XG5cdFx0XHRyZXN1bHQgPSBmcm9tKG9zRXh0ZXJuYWwub3N4LnByb2JsZW1NYXRjaGVyLCBjb250ZXh0KTtcblx0XHR9IGVsc2UgaWYgKG9zRXh0ZXJuYWwubGludXg/LnByb2JsZW1NYXRjaGVyICYmIGNvbnRleHQucGxhdGZvcm0gPT09IFBsYXRmb3JtLkxpbnV4KSB7XG5cdFx0XHRyZXN1bHQgPSBmcm9tKG9zRXh0ZXJuYWwubGludXgucHJvYmxlbU1hdGNoZXIsIGNvbnRleHQpO1xuXHRcdH0gZWxzZSBpZiAoZXh0ZXJuYWwucHJvYmxlbU1hdGNoZXIpIHtcblx0XHRcdHJlc3VsdCA9IGZyb20oZXh0ZXJuYWwucHJvYmxlbU1hdGNoZXIsIGNvbnRleHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odGhpczogdm9pZCwgY29uZmlnOiBQcm9ibGVtTWF0Y2hlckNvbmZpZy5Qcm9ibGVtTWF0Y2hlclR5cGUgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBUYXNrQ29uZmlndXJhdGlvblZhbHVlV2l0aEVycm9yczxQcm9ibGVtTWF0Y2hlcltdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBQcm9ibGVtTWF0Y2hlcltdID0gW107XG5cdFx0aWYgKGNvbmZpZyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4geyB2YWx1ZTogcmVzdWx0IH07XG5cdFx0fVxuXHRcdGNvbnN0IGVycm9yczogc3RyaW5nW10gPSBbXTtcblx0XHRmdW5jdGlvbiBhZGRSZXN1bHQobWF0Y2hlcjogVGFza0NvbmZpZ3VyYXRpb25WYWx1ZVdpdGhFcnJvcnM8UHJvYmxlbU1hdGNoZXI+KSB7XG5cdFx0XHRpZiAobWF0Y2hlci52YWx1ZSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChtYXRjaGVyLnZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGlmIChtYXRjaGVyLmVycm9ycykge1xuXHRcdFx0XHRlcnJvcnMucHVzaCguLi5tYXRjaGVyLmVycm9ycyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGtpbmQgPSBnZXRQcm9ibGVtTWF0Y2hlcktpbmQoY29uZmlnKTtcblx0XHRpZiAoa2luZCA9PT0gUHJvYmxlbU1hdGNoZXJLaW5kLlVua25vd24pIHtcblx0XHRcdGNvbnN0IGVycm9yID0gbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnQ29uZmlndXJhdGlvblBhcnNlci51bmtub3duTWF0Y2hlcktpbmQnLFxuXHRcdFx0XHQnV2FybmluZzogdGhlIGRlZmluZWQgcHJvYmxlbSBtYXRjaGVyIGlzIHVua25vd24uIFN1cHBvcnRlZCB0eXBlcyBhcmUgc3RyaW5nIHwgUHJvYmxlbU1hdGNoZXIgfCBBcnJheTxzdHJpbmcgfCBQcm9ibGVtTWF0Y2hlcj4uXFxuezB9XFxuJyxcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoY29uZmlnLCBudWxsLCA0KSk7XG5cdFx0XHRjb250ZXh0LnByb2JsZW1SZXBvcnRlci53YXJuKGVycm9yKTtcblx0XHR9IGVsc2UgaWYgKGtpbmQgPT09IFByb2JsZW1NYXRjaGVyS2luZC5TdHJpbmcgfHwga2luZCA9PT0gUHJvYmxlbU1hdGNoZXJLaW5kLlByb2JsZW1NYXRjaGVyKSB7XG5cdFx0XHRhZGRSZXN1bHQocmVzb2x2ZVByb2JsZW1NYXRjaGVyKGNvbmZpZyBhcyBQcm9ibGVtTWF0Y2hlckNvbmZpZy5Qcm9ibGVtTWF0Y2hlciwgY29udGV4dCkpO1xuXHRcdH0gZWxzZSBpZiAoa2luZCA9PT0gUHJvYmxlbU1hdGNoZXJLaW5kLkFycmF5KSB7XG5cdFx0XHRjb25zdCBwcm9ibGVtTWF0Y2hlcnMgPSA8KHN0cmluZyB8IFByb2JsZW1NYXRjaGVyQ29uZmlnLlByb2JsZW1NYXRjaGVyKVtdPmNvbmZpZztcblx0XHRcdHByb2JsZW1NYXRjaGVycy5mb3JFYWNoKHByb2JsZW1NYXRjaGVyID0+IHtcblx0XHRcdFx0YWRkUmVzdWx0KHJlc29sdmVQcm9ibGVtTWF0Y2hlcihwcm9ibGVtTWF0Y2hlciwgY29udGV4dCkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHZhbHVlOiByZXN1bHQsIGVycm9ycyB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0UHJvYmxlbU1hdGNoZXJLaW5kKHRoaXM6IHZvaWQsIHZhbHVlOiBQcm9ibGVtTWF0Y2hlckNvbmZpZy5Qcm9ibGVtTWF0Y2hlclR5cGUpOiBQcm9ibGVtTWF0Y2hlcktpbmQge1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiBQcm9ibGVtTWF0Y2hlcktpbmQuU3RyaW5nO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiBQcm9ibGVtTWF0Y2hlcktpbmQuQXJyYXk7XG5cdFx0fSBlbHNlIGlmICghVHlwZXMuaXNVbmRlZmluZWQodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gUHJvYmxlbU1hdGNoZXJLaW5kLlByb2JsZW1NYXRjaGVyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gUHJvYmxlbU1hdGNoZXJLaW5kLlVua25vd247XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gcmVzb2x2ZVByb2JsZW1NYXRjaGVyKHRoaXM6IHZvaWQsIHZhbHVlOiBzdHJpbmcgfCBQcm9ibGVtTWF0Y2hlckNvbmZpZy5Qcm9ibGVtTWF0Y2hlciwgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IFRhc2tDb25maWd1cmF0aW9uVmFsdWVXaXRoRXJyb3JzPFByb2JsZW1NYXRjaGVyPiB7XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0bGV0IHZhcmlhYmxlTmFtZSA9IDxzdHJpbmc+dmFsdWU7XG5cdFx0XHRpZiAodmFyaWFibGVOYW1lLmxlbmd0aCA+IDEgJiYgdmFyaWFibGVOYW1lWzBdID09PSAnJCcpIHtcblx0XHRcdFx0dmFyaWFibGVOYW1lID0gdmFyaWFibGVOYW1lLnN1YnN0cmluZygxKTtcblx0XHRcdFx0Y29uc3QgZ2xvYmFsID0gUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5nZXQodmFyaWFibGVOYW1lKTtcblx0XHRcdFx0aWYgKGdsb2JhbCkge1xuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlOiBPYmplY3RzLmRlZXBDbG9uZShnbG9iYWwpIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IGxvY2FsUHJvYmxlbU1hdGNoZXI6IFByb2JsZW1NYXRjaGVyICYgUGFydGlhbDxJTmFtZWRQcm9ibGVtTWF0Y2hlcj4gPSBjb250ZXh0Lm5hbWVkUHJvYmxlbU1hdGNoZXJzW3ZhcmlhYmxlTmFtZV07XG5cdFx0XHRcdGlmIChsb2NhbFByb2JsZW1NYXRjaGVyKSB7XG5cdFx0XHRcdFx0bG9jYWxQcm9ibGVtTWF0Y2hlciA9IE9iamVjdHMuZGVlcENsb25lKGxvY2FsUHJvYmxlbU1hdGNoZXIpO1xuXHRcdFx0XHRcdC8vIHJlbW92ZSB0aGUgbmFtZVxuXHRcdFx0XHRcdGRlbGV0ZSBsb2NhbFByb2JsZW1NYXRjaGVyLm5hbWU7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IGxvY2FsUHJvYmxlbU1hdGNoZXIgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgZXJyb3JzOiBbbmxzLmxvY2FsaXplKCdDb25maWd1cmF0aW9uUGFyc2VyLmludmFsaWRWYXJpYWJsZVJlZmVyZW5jZScsICdFcnJvcjogSW52YWxpZCBwcm9ibGVtTWF0Y2hlciByZWZlcmVuY2U6IHswfVxcbicsIHZhbHVlKV0gfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QganNvbiA9IDxQcm9ibGVtTWF0Y2hlckNvbmZpZy5Qcm9ibGVtTWF0Y2hlcj52YWx1ZTtcblx0XHRcdHJldHVybiB7IHZhbHVlOiBuZXcgUHJvYmxlbU1hdGNoZXJQYXJzZXIoY29udGV4dC5wcm9ibGVtUmVwb3J0ZXIpLnBhcnNlKGpzb24pIH07XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgR3JvdXBLaW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odGhpczogdm9pZCwgZXh0ZXJuYWw6IHN0cmluZyB8IElHcm91cEtpbmQgfCB1bmRlZmluZWQpOiBUYXNrcy5UYXNrR3JvdXAgfCB1bmRlZmluZWQge1xuXHRcdGlmIChleHRlcm5hbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoVHlwZXMuaXNTdHJpbmcoZXh0ZXJuYWwpICYmIFRhc2tzLlRhc2tHcm91cC5pcyhleHRlcm5hbCkpIHtcblx0XHRcdHJldHVybiB7IF9pZDogZXh0ZXJuYWwsIGlzRGVmYXVsdDogZmFsc2UgfTtcblx0XHR9IGVsc2UgaWYgKFR5cGVzLmlzU3RyaW5nKGV4dGVybmFsLmtpbmQpICYmIFRhc2tzLlRhc2tHcm91cC5pcyhleHRlcm5hbC5raW5kKSkge1xuXHRcdFx0Y29uc3QgZ3JvdXA6IHN0cmluZyA9IGV4dGVybmFsLmtpbmQ7XG5cdFx0XHRjb25zdCBpc0RlZmF1bHQ6IGJvb2xlYW4gfCBzdHJpbmcgPSBUeXBlcy5pc1VuZGVmaW5lZChleHRlcm5hbC5pc0RlZmF1bHQpID8gZmFsc2UgOiBleHRlcm5hbC5pc0RlZmF1bHQ7XG5cblx0XHRcdHJldHVybiB7IF9pZDogZ3JvdXAsIGlzRGVmYXVsdCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGdyb3VwOiBUYXNrcy5UYXNrR3JvdXAgfCBzdHJpbmcpOiBJR3JvdXBLaW5kIHwgc3RyaW5nIHtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZ3JvdXApKSB7XG5cdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdFx0fSBlbHNlIGlmICghZ3JvdXAuaXNEZWZhdWx0KSB7XG5cdFx0XHRyZXR1cm4gZ3JvdXAuX2lkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogZ3JvdXAuX2lkLFxuXHRcdFx0aXNEZWZhdWx0OiBncm91cC5pc0RlZmF1bHQsXG5cdFx0fTtcblx0fVxufVxuXG5uYW1lc3BhY2UgVGFza0RlcGVuZGVuY3kge1xuXHRmdW5jdGlvbiB1cmlGcm9tU291cmNlKGNvbnRleHQ6IElQYXJzZUNvbnRleHQsIHNvdXJjZTogVGFza0NvbmZpZ1NvdXJjZSk6IFVSSSB8IHN0cmluZyB7XG5cdFx0c3dpdGNoIChzb3VyY2UpIHtcblx0XHRcdGNhc2UgVGFza0NvbmZpZ1NvdXJjZS5Vc2VyOiByZXR1cm4gVGFza3MuVVNFUl9UQVNLU19HUk9VUF9LRVk7XG5cdFx0XHRjYXNlIFRhc2tDb25maWdTb3VyY2UuVGFza3NKc29uOiByZXR1cm4gY29udGV4dC53b3Jrc3BhY2VGb2xkZXIudXJpO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIGNvbnRleHQud29ya3NwYWNlICYmIGNvbnRleHQud29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPyBjb250ZXh0LndvcmtzcGFjZS5jb25maWd1cmF0aW9uIDogY29udGV4dC53b3Jrc3BhY2VGb2xkZXIudXJpO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGV4dGVybmFsOiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQsIHNvdXJjZTogVGFza0NvbmZpZ1NvdXJjZSk6IFRhc2tzLklUYXNrRGVwZW5kZW5jeSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGV4dGVybmFsKSkge1xuXHRcdFx0cmV0dXJuIHsgdXJpOiB1cmlGcm9tU291cmNlKGNvbnRleHQsIHNvdXJjZSksIHRhc2s6IGV4dGVybmFsIH07XG5cdFx0fSBlbHNlIGlmIChJVGFza0lkZW50aWZpZXIuaXMoZXh0ZXJuYWwpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IHVyaUZyb21Tb3VyY2UoY29udGV4dCwgc291cmNlKSxcblx0XHRcdFx0dGFzazogVGFza3MuVGFza0RlZmluaXRpb24uY3JlYXRlVGFza0lkZW50aWZpZXIoZXh0ZXJuYWwgYXMgVGFza3MuSVRhc2tJZGVudGlmaWVyLCBjb250ZXh0LnByb2JsZW1SZXBvcnRlcilcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbm5hbWVzcGFjZSBEZXBlbmRzT3JkZXIge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkKTogVGFza3MuRGVwZW5kc09yZGVyIHtcblx0XHRzd2l0Y2ggKG9yZGVyKSB7XG5cdFx0XHRjYXNlIFRhc2tzLkRlcGVuZHNPcmRlci5zZXF1ZW5jZTpcblx0XHRcdFx0cmV0dXJuIFRhc2tzLkRlcGVuZHNPcmRlci5zZXF1ZW5jZTtcblx0XHRcdGNhc2UgVGFza3MuRGVwZW5kc09yZGVyLnBhcmFsbGVsOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFRhc2tzLkRlcGVuZHNPcmRlci5wYXJhbGxlbDtcblx0XHR9XG5cdH1cbn1cblxubmFtZXNwYWNlIENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIHtcblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSAtLSBJTWV0YURhdGEgYXJyYXkgaG9sZHMgaGV0ZXJvZ2VuZW91cyBwYXJzZXIgdHlwZXNcblx0Y29uc3QgcHJvcGVydGllczogSU1ldGFEYXRhPFRhc2tzLklDb25maWd1cmF0aW9uUHJvcGVydGllcywgYW55PltdID0gW1xuXHRcdHsgcHJvcGVydHk6ICduYW1lJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdpZGVudGlmaWVyJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdncm91cCcgfSxcblx0XHR7IHByb3BlcnR5OiAnaXNCYWNrZ3JvdW5kJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdwcm9tcHRPbkNsb3NlJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdkZXBlbmRzT24nIH0sXG5cdFx0eyBwcm9wZXJ0eTogJ3ByZXNlbnRhdGlvbicsIHR5cGU6IENvbW1hbmRDb25maWd1cmF0aW9uLlByZXNlbnRhdGlvbk9wdGlvbnMgfSxcblx0XHR7IHByb3BlcnR5OiAncHJvYmxlbU1hdGNoZXJzJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdvcHRpb25zJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdpY29uJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdoaWRlJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdpbkFnZW50cycgfVxuXHRdO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGV4dGVybmFsOiBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMgJiB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSwgY29udGV4dDogSVBhcnNlQ29udGV4dCxcblx0XHRpbmNsdWRlQ29tbWFuZE9wdGlvbnM6IGJvb2xlYW4sIHNvdXJjZTogVGFza0NvbmZpZ1NvdXJjZSwgcHJvcGVydGllcz86IElKU09OU2NoZW1hTWFwKTogVGFza0NvbmZpZ3VyYXRpb25WYWx1ZVdpdGhFcnJvcnM8VGFza3MuSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPiB7XG5cdFx0aWYgKCFleHRlcm5hbCkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IFRhc2tzLklDb25maWd1cmF0aW9uUHJvcGVydGllcyAmIHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9ID0ge307XG5cblx0XHRpZiAocHJvcGVydGllcykge1xuXHRcdFx0Zm9yIChjb25zdCBwcm9wZXJ0eU5hbWUgb2YgT2JqZWN0LmtleXMocHJvcGVydGllcykpIHtcblx0XHRcdFx0aWYgKGV4dGVybmFsW3Byb3BlcnR5TmFtZV0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJlc3VsdFtwcm9wZXJ0eU5hbWVdID0gT2JqZWN0cy5kZWVwQ2xvbmUoZXh0ZXJuYWxbcHJvcGVydHlOYW1lXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZXh0ZXJuYWwudGFza05hbWUpKSB7XG5cdFx0XHRyZXN1bHQubmFtZSA9IGV4dGVybmFsLnRhc2tOYW1lO1xuXHRcdH1cblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZXh0ZXJuYWwubGFiZWwpICYmIGNvbnRleHQuc2NoZW1hVmVyc2lvbiA9PT0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKSB7XG5cdFx0XHRyZXN1bHQubmFtZSA9IGV4dGVybmFsLmxhYmVsO1xuXHRcdH1cblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZXh0ZXJuYWwuaWRlbnRpZmllcikpIHtcblx0XHRcdHJlc3VsdC5pZGVudGlmaWVyID0gZXh0ZXJuYWwuaWRlbnRpZmllcjtcblx0XHR9XG5cdFx0cmVzdWx0Lmljb24gPSBleHRlcm5hbC5pY29uO1xuXHRcdHJlc3VsdC5oaWRlID0gZXh0ZXJuYWwuaGlkZTtcblx0XHRyZXN1bHQuaW5BZ2VudHMgPSBleHRlcm5hbC5pbkFnZW50cztcblx0XHRpZiAoZXh0ZXJuYWwuaXNCYWNrZ3JvdW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5pc0JhY2tncm91bmQgPSAhIWV4dGVybmFsLmlzQmFja2dyb3VuZDtcblx0XHR9XG5cdFx0aWYgKGV4dGVybmFsLnByb21wdE9uQ2xvc2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0LnByb21wdE9uQ2xvc2UgPSAhIWV4dGVybmFsLnByb21wdE9uQ2xvc2U7XG5cdFx0fVxuXHRcdHJlc3VsdC5ncm91cCA9IEdyb3VwS2luZC5mcm9tKGV4dGVybmFsLmdyb3VwKTtcblx0XHRpZiAoZXh0ZXJuYWwuZGVwZW5kc09uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGV4dGVybmFsLmRlcGVuZHNPbikpIHtcblx0XHRcdFx0cmVzdWx0LmRlcGVuZHNPbiA9IGV4dGVybmFsLmRlcGVuZHNPbi5yZWR1Y2UoKGRlcGVuZGVuY2llczogVGFza3MuSVRhc2tEZXBlbmRlbmN5W10sIGl0ZW0pOiBUYXNrcy5JVGFza0RlcGVuZGVuY3lbXSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGVwZW5kZW5jeSA9IFRhc2tEZXBlbmRlbmN5LmZyb20oaXRlbSwgY29udGV4dCwgc291cmNlKTtcblx0XHRcdFx0XHRpZiAoZGVwZW5kZW5jeSkge1xuXHRcdFx0XHRcdFx0ZGVwZW5kZW5jaWVzLnB1c2goZGVwZW5kZW5jeSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBkZXBlbmRlbmNpZXM7XG5cdFx0XHRcdH0sIFtdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGRlcGVuZHNPblZhbHVlID0gVGFza0RlcGVuZGVuY3kuZnJvbShleHRlcm5hbC5kZXBlbmRzT24sIGNvbnRleHQsIHNvdXJjZSk7XG5cdFx0XHRcdHJlc3VsdC5kZXBlbmRzT24gPSBkZXBlbmRzT25WYWx1ZSA/IFtkZXBlbmRzT25WYWx1ZV0gOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJlc3VsdC5kZXBlbmRzT3JkZXIgPSBEZXBlbmRzT3JkZXIuZnJvbShleHRlcm5hbC5kZXBlbmRzT3JkZXIpO1xuXHRcdGlmIChpbmNsdWRlQ29tbWFuZE9wdGlvbnMgJiYgKGV4dGVybmFsLnByZXNlbnRhdGlvbiAhPT0gdW5kZWZpbmVkIHx8IChleHRlcm5hbCBhcyBJTGVnYWN5Q29tbWFuZFByb3BlcnRpZXMpLnRlcm1pbmFsICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRyZXN1bHQucHJlc2VudGF0aW9uID0gQ29tbWFuZENvbmZpZ3VyYXRpb24uUHJlc2VudGF0aW9uT3B0aW9ucy5mcm9tKGV4dGVybmFsLCBjb250ZXh0KTtcblx0XHR9XG5cdFx0aWYgKGluY2x1ZGVDb21tYW5kT3B0aW9ucyAmJiAoZXh0ZXJuYWwub3B0aW9ucyAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0cmVzdWx0Lm9wdGlvbnMgPSBDb21tYW5kT3B0aW9ucy5mcm9tKGV4dGVybmFsLm9wdGlvbnMsIGNvbnRleHQpO1xuXHRcdH1cblx0XHRjb25zdCBjb25maWdQcm9ibGVtTWF0Y2hlciA9IFByb2JsZW1NYXRjaGVyQ29udmVydGVyLmZyb21XaXRoT3NDb25maWcoZXh0ZXJuYWwsIGNvbnRleHQpO1xuXHRcdGlmIChjb25maWdQcm9ibGVtTWF0Y2hlci52YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQucHJvYmxlbU1hdGNoZXJzID0gY29uZmlnUHJvYmxlbU1hdGNoZXIudmFsdWU7XG5cdFx0fVxuXHRcdGlmIChleHRlcm5hbC5kZXRhaWwpIHtcblx0XHRcdHJlc3VsdC5kZXRhaWwgPSBleHRlcm5hbC5kZXRhaWw7XG5cdFx0fVxuXHRcdHJldHVybiBpc0VtcHR5KHJlc3VsdCkgPyB7fSA6IHsgdmFsdWU6IHJlc3VsdCwgZXJyb3JzOiBjb25maWdQcm9ibGVtTWF0Y2hlci5lcnJvcnMgfTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5KHRoaXM6IHZvaWQsIHZhbHVlOiBUYXNrcy5JQ29uZmlndXJhdGlvblByb3BlcnRpZXMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gX2lzRW1wdHkodmFsdWUsIHByb3BlcnRpZXMpO1xuXHR9XG59XG5jb25zdCBsYWJlbCA9ICdXb3Jrc3BhY2UnO1xuXG5uYW1lc3BhY2UgQ29uZmlndXJpbmdUYXNrIHtcblxuXHRjb25zdCBncnVudCA9ICdncnVudC4nO1xuXHRjb25zdCBqYWtlID0gJ2pha2UuJztcblx0Y29uc3QgZ3VscCA9ICdndWxwLic7XG5cdGNvbnN0IG5wbSA9ICd2c2NvZGUubnBtLic7XG5cdGNvbnN0IHR5cGVzY3JpcHQgPSAndnNjb2RlLnR5cGVzY3JpcHQuJztcblxuXHRpbnRlcmZhY2UgSUN1c3RvbWl6ZVNoYXBlIHtcblx0XHRjdXN0b21pemU6IHN0cmluZztcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGV4dGVybmFsOiBJQ29uZmlndXJpbmdUYXNrLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0LCBpbmRleDogbnVtYmVyLCBzb3VyY2U6IFRhc2tDb25maWdTb3VyY2UsIHJlZ2lzdHJ5PzogUGFydGlhbDxJVGFza0RlZmluaXRpb25SZWdpc3RyeT4pOiBUYXNrcy5Db25maWd1cmluZ1Rhc2sgfCB1bmRlZmluZWQge1xuXHRcdGlmICghZXh0ZXJuYWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHR5cGUgPSBleHRlcm5hbC50eXBlO1xuXHRcdGNvbnN0IGN1c3RvbWl6ZSA9IChleHRlcm5hbCBhcyBJQ3VzdG9taXplU2hhcGUpLmN1c3RvbWl6ZTtcblx0XHRpZiAoIXR5cGUgJiYgIWN1c3RvbWl6ZSkge1xuXHRcdFx0Y29udGV4dC5wcm9ibGVtUmVwb3J0ZXIuZXJyb3IobmxzLmxvY2FsaXplKCdDb25maWd1cmF0aW9uUGFyc2VyLm5vVGFza1R5cGUnLCAnRXJyb3I6IHRhc2tzIGNvbmZpZ3VyYXRpb24gbXVzdCBoYXZlIGEgdHlwZSBwcm9wZXJ0eS4gVGhlIGNvbmZpZ3VyYXRpb24gd2lsbCBiZSBpZ25vcmVkLlxcbnswfVxcbicsIEpTT04uc3RyaW5naWZ5KGV4dGVybmFsLCBudWxsLCA0KSkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZURlY2xhcmF0aW9uID0gdHlwZSA/IHJlZ2lzdHJ5Py5nZXQ/Lih0eXBlKSB8fCBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmdldCh0eXBlKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXR5cGVEZWNsYXJhdGlvbikge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnQ29uZmlndXJhdGlvblBhcnNlci5ub1R5cGVEZWZpbml0aW9uJywgJ0Vycm9yOiB0aGVyZSBpcyBubyByZWdpc3RlcmVkIHRhc2sgdHlwZSBcXCd7MH1cXCcuIERpZCB5b3UgbWlzcyBpbnN0YWxsaW5nIGFuIGV4dGVuc2lvbiB0aGF0IHByb3ZpZGVzIGEgY29ycmVzcG9uZGluZyB0YXNrIHByb3ZpZGVyPycsIHR5cGUpO1xuXHRcdFx0Y29udGV4dC5wcm9ibGVtUmVwb3J0ZXIuZXJyb3IobWVzc2FnZSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgaWRlbnRpZmllcjogVGFza3MuSVRhc2tJZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyhjdXN0b21pemUpKSB7XG5cdFx0XHRpZiAoY3VzdG9taXplLmluZGV4T2YoZ3J1bnQpID09PSAwKSB7XG5cdFx0XHRcdGlkZW50aWZpZXIgPSB7IHR5cGU6ICdncnVudCcsIHRhc2s6IGN1c3RvbWl6ZS5zdWJzdHJpbmcoZ3J1bnQubGVuZ3RoKSB9O1xuXHRcdFx0fSBlbHNlIGlmIChjdXN0b21pemUuaW5kZXhPZihqYWtlKSA9PT0gMCkge1xuXHRcdFx0XHRpZGVudGlmaWVyID0geyB0eXBlOiAnamFrZScsIHRhc2s6IGN1c3RvbWl6ZS5zdWJzdHJpbmcoamFrZS5sZW5ndGgpIH07XG5cdFx0XHR9IGVsc2UgaWYgKGN1c3RvbWl6ZS5pbmRleE9mKGd1bHApID09PSAwKSB7XG5cdFx0XHRcdGlkZW50aWZpZXIgPSB7IHR5cGU6ICdndWxwJywgdGFzazogY3VzdG9taXplLnN1YnN0cmluZyhndWxwLmxlbmd0aCkgfTtcblx0XHRcdH0gZWxzZSBpZiAoY3VzdG9taXplLmluZGV4T2YobnBtKSA9PT0gMCkge1xuXHRcdFx0XHRpZGVudGlmaWVyID0geyB0eXBlOiAnbnBtJywgc2NyaXB0OiBjdXN0b21pemUuc3Vic3RyaW5nKG5wbS5sZW5ndGggKyA0KSB9O1xuXHRcdFx0fSBlbHNlIGlmIChjdXN0b21pemUuaW5kZXhPZih0eXBlc2NyaXB0KSA9PT0gMCkge1xuXHRcdFx0XHRpZGVudGlmaWVyID0geyB0eXBlOiAndHlwZXNjcmlwdCcsIHRzY29uZmlnOiBjdXN0b21pemUuc3Vic3RyaW5nKHR5cGVzY3JpcHQubGVuZ3RoICsgNikgfTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGV4dGVybmFsLnR5cGUpKSB7XG5cdFx0XHRcdGlkZW50aWZpZXIgPSBleHRlcm5hbCBhcyBUYXNrcy5JVGFza0lkZW50aWZpZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChpZGVudGlmaWVyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnRleHQucHJvYmxlbVJlcG9ydGVyLmVycm9yKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J0NvbmZpZ3VyYXRpb25QYXJzZXIubWlzc2luZ1R5cGUnLFxuXHRcdFx0XHQnRXJyb3I6IHRoZSB0YXNrIGNvbmZpZ3VyYXRpb24gXFwnezB9XFwnIGlzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIHByb3BlcnR5IFxcJ3R5cGVcXCcuIFRoZSB0YXNrIGNvbmZpZ3VyYXRpb24gd2lsbCBiZSBpZ25vcmVkLicsIEpTT04uc3RyaW5naWZ5KGV4dGVybmFsLCB1bmRlZmluZWQsIDApXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRhc2tJZGVudGlmaWVyOiBUYXNrcy5LZXllZFRhc2tJZGVudGlmaWVyIHwgdW5kZWZpbmVkID0gVGFza3MuVGFza0RlZmluaXRpb24uY3JlYXRlVGFza0lkZW50aWZpZXIoaWRlbnRpZmllciwgY29udGV4dC5wcm9ibGVtUmVwb3J0ZXIpO1xuXHRcdGlmICh0YXNrSWRlbnRpZmllciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250ZXh0LnByb2JsZW1SZXBvcnRlci5lcnJvcihubHMubG9jYWxpemUoXG5cdFx0XHRcdCdDb25maWd1cmF0aW9uUGFyc2VyLmluY29ycmVjdFR5cGUnLFxuXHRcdFx0XHQnRXJyb3I6IHRoZSB0YXNrIGNvbmZpZ3VyYXRpb24gXFwnezB9XFwnIGlzIHVzaW5nIGFuIHVua25vd24gdHlwZS4gVGhlIHRhc2sgY29uZmlndXJhdGlvbiB3aWxsIGJlIGlnbm9yZWQuJywgSlNPTi5zdHJpbmdpZnkoZXh0ZXJuYWwsIHVuZGVmaW5lZCwgMClcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnRWxlbWVudDogVGFza3MuSVRhc2tTb3VyY2VDb25maWdFbGVtZW50ID0ge1xuXHRcdFx0d29ya3NwYWNlRm9sZGVyOiBjb250ZXh0LndvcmtzcGFjZUZvbGRlcixcblx0XHRcdGZpbGU6ICcudnNjb2RlL3Rhc2tzLmpzb24nLFxuXHRcdFx0aW5kZXgsXG5cdFx0XHRlbGVtZW50OiBleHRlcm5hbFxuXHRcdH07XG5cdFx0bGV0IHRhc2tTb3VyY2U6IFRhc2tzLkZpbGVCYXNlZFRhc2tTb3VyY2U7XG5cdFx0c3dpdGNoIChzb3VyY2UpIHtcblx0XHRcdGNhc2UgVGFza0NvbmZpZ1NvdXJjZS5Vc2VyOiB7XG5cdFx0XHRcdHRhc2tTb3VyY2UgPSB7IGtpbmQ6IFRhc2tzLlRhc2tTb3VyY2VLaW5kLlVzZXIsIGNvbmZpZzogY29uZmlnRWxlbWVudCwgbGFiZWwgfTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFRhc2tDb25maWdTb3VyY2UuV29ya3NwYWNlRmlsZToge1xuXHRcdFx0XHR0YXNrU291cmNlID0geyBraW5kOiBUYXNrcy5UYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlLCBjb25maWc6IGNvbmZpZ0VsZW1lbnQsIGxhYmVsIH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHR0YXNrU291cmNlID0geyBraW5kOiBUYXNrcy5UYXNrU291cmNlS2luZC5Xb3Jrc3BhY2UsIGNvbmZpZzogY29uZmlnRWxlbWVudCwgbGFiZWwgfTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogVGFza3MuQ29uZmlndXJpbmdUYXNrID0gbmV3IFRhc2tzLkNvbmZpZ3VyaW5nVGFzayhcblx0XHRcdGAke3R5cGVEZWNsYXJhdGlvbi5leHRlbnNpb25JZH0uJHt0YXNrSWRlbnRpZmllci5fa2V5fWAsXG5cdFx0XHR0YXNrU291cmNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dHlwZSxcblx0XHRcdHRhc2tJZGVudGlmaWVyLFxuXHRcdFx0UnVuT3B0aW9ucy5mcm9tQ29uZmlndXJhdGlvbihleHRlcm5hbC5ydW5PcHRpb25zKSxcblx0XHRcdHsgaGlkZTogZXh0ZXJuYWwuaGlkZSwgaW5BZ2VudHM6IGV4dGVybmFsLmluQWdlbnRzIH1cblx0XHQpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBDb25maWd1cmF0aW9uUHJvcGVydGllcy5mcm9tKGV4dGVybmFsIGFzIElDb25maWd1cmF0aW9uUHJvcGVydGllcyAmIHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9LCBjb250ZXh0LCB0cnVlLCBzb3VyY2UsIHR5cGVEZWNsYXJhdGlvbi5wcm9wZXJ0aWVzKTtcblx0XHRyZXN1bHQuYWRkVGFza0xvYWRNZXNzYWdlcyhjb25maWd1cmF0aW9uLmVycm9ycyk7XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24udmFsdWUpIHtcblx0XHRcdHJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcyA9IE9iamVjdC5hc3NpZ24ocmVzdWx0LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCBjb25maWd1cmF0aW9uLnZhbHVlKTtcblx0XHRcdGlmIChyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSkge1xuXHRcdFx0XHRyZXN1bHQuX2xhYmVsID0gcmVzdWx0LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgbGFiZWwgPSByZXN1bHQuY29uZmlndXJlcy50eXBlO1xuXHRcdFx0XHRpZiAodHlwZURlY2xhcmF0aW9uLnJlcXVpcmVkICYmIHR5cGVEZWNsYXJhdGlvbi5yZXF1aXJlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByZXF1aXJlZCBvZiB0eXBlRGVjbGFyYXRpb24ucmVxdWlyZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gcmVzdWx0LmNvbmZpZ3VyZXNbcmVxdWlyZWRdO1xuXHRcdFx0XHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbGFiZWwgKyAnOiAnICsgdmFsdWU7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQuX2xhYmVsID0gbGFiZWw7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyKSB7XG5cdFx0XHRcdHJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyID0gdGFza0lkZW50aWZpZXIuX2tleTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5uYW1lc3BhY2UgQ3VzdG9tVGFzayB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGV4dGVybmFsOiBJQ3VzdG9tVGFzaywgY29udGV4dDogSVBhcnNlQ29udGV4dCwgaW5kZXg6IG51bWJlciwgc291cmNlOiBUYXNrQ29uZmlnU291cmNlKTogVGFza3MuQ3VzdG9tVGFzayB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFleHRlcm5hbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IHR5cGUgPSBleHRlcm5hbC50eXBlO1xuXHRcdGlmICh0eXBlID09PSB1bmRlZmluZWQgfHwgdHlwZSA9PT0gbnVsbCkge1xuXHRcdFx0dHlwZSA9IFRhc2tzLkNVU1RPTUlaRURfVEFTS19UWVBFO1xuXHRcdH1cblx0XHRpZiAodHlwZSAhPT0gVGFza3MuQ1VTVE9NSVpFRF9UQVNLX1RZUEUgJiYgdHlwZSAhPT0gJ3NoZWxsJyAmJiB0eXBlICE9PSAncHJvY2VzcycpIHtcblx0XHRcdGNvbnRleHQucHJvYmxlbVJlcG9ydGVyLmVycm9yKG5scy5sb2NhbGl6ZSgnQ29uZmlndXJhdGlvblBhcnNlci5ub3RDdXN0b20nLCAnRXJyb3I6IHRhc2tzIGlzIG5vdCBkZWNsYXJlZCBhcyBhIGN1c3RvbSB0YXNrLiBUaGUgY29uZmlndXJhdGlvbiB3aWxsIGJlIGlnbm9yZWQuXFxuezB9XFxuJywgSlNPTi5zdHJpbmdpZnkoZXh0ZXJuYWwsIG51bGwsIDQpKSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgdGFza05hbWUgPSBleHRlcm5hbC50YXNrTmFtZTtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZXh0ZXJuYWwubGFiZWwpICYmIGNvbnRleHQuc2NoZW1hVmVyc2lvbiA9PT0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKSB7XG5cdFx0XHR0YXNrTmFtZSA9IGV4dGVybmFsLmxhYmVsO1xuXHRcdH1cblx0XHRpZiAoIXRhc2tOYW1lKSB7XG5cdFx0XHRjb250ZXh0LnByb2JsZW1SZXBvcnRlci5lcnJvcihubHMubG9jYWxpemUoJ0NvbmZpZ3VyYXRpb25QYXJzZXIubm9UYXNrTmFtZScsICdFcnJvcjogYSB0YXNrIG11c3QgcHJvdmlkZSBhIGxhYmVsIHByb3BlcnR5LiBUaGUgdGFzayB3aWxsIGJlIGlnbm9yZWQuXFxuezB9XFxuJywgSlNPTi5zdHJpbmdpZnkoZXh0ZXJuYWwsIG51bGwsIDQpKSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCB0YXNrU291cmNlOiBUYXNrcy5GaWxlQmFzZWRUYXNrU291cmNlO1xuXHRcdHN3aXRjaCAoc291cmNlKSB7XG5cdFx0XHRjYXNlIFRhc2tDb25maWdTb3VyY2UuVXNlcjoge1xuXHRcdFx0XHR0YXNrU291cmNlID0geyBraW5kOiBUYXNrcy5UYXNrU291cmNlS2luZC5Vc2VyLCBjb25maWc6IHsgaW5kZXgsIGVsZW1lbnQ6IGV4dGVybmFsLCBmaWxlOiAnLnZzY29kZS90YXNrcy5qc29uJywgd29ya3NwYWNlRm9sZGVyOiBjb250ZXh0LndvcmtzcGFjZUZvbGRlciB9LCBsYWJlbCB9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgVGFza0NvbmZpZ1NvdXJjZS5Xb3Jrc3BhY2VGaWxlOiB7XG5cdFx0XHRcdHRhc2tTb3VyY2UgPSB7IGtpbmQ6IFRhc2tzLlRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZUZpbGUsIGNvbmZpZzogeyBpbmRleCwgZWxlbWVudDogZXh0ZXJuYWwsIGZpbGU6ICcudnNjb2RlL3Rhc2tzLmpzb24nLCB3b3Jrc3BhY2VGb2xkZXI6IGNvbnRleHQud29ya3NwYWNlRm9sZGVyLCB3b3Jrc3BhY2U6IGNvbnRleHQud29ya3NwYWNlIH0sIGxhYmVsIH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHR0YXNrU291cmNlID0geyBraW5kOiBUYXNrcy5UYXNrU291cmNlS2luZC5Xb3Jrc3BhY2UsIGNvbmZpZzogeyBpbmRleCwgZWxlbWVudDogZXh0ZXJuYWwsIGZpbGU6ICcudnNjb2RlL3Rhc2tzLmpzb24nLCB3b3Jrc3BhY2VGb2xkZXI6IGNvbnRleHQud29ya3NwYWNlRm9sZGVyIH0sIGxhYmVsIH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogVGFza3MuQ3VzdG9tVGFzayA9IG5ldyBUYXNrcy5DdXN0b21UYXNrKFxuXHRcdFx0Y29udGV4dC51dWlkTWFwLmdldFVVSUQodGFza05hbWUpLFxuXHRcdFx0dGFza1NvdXJjZSxcblx0XHRcdHRhc2tOYW1lLFxuXHRcdFx0VGFza3MuQ1VTVE9NSVpFRF9UQVNLX1RZUEUsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmYWxzZSxcblx0XHRcdFJ1bk9wdGlvbnMuZnJvbUNvbmZpZ3VyYXRpb24oZXh0ZXJuYWwucnVuT3B0aW9ucyksXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IHRhc2tOYW1lLFxuXHRcdFx0XHRpZGVudGlmaWVyOiB0YXNrTmFtZSxcblx0XHRcdH1cblx0XHQpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBDb25maWd1cmF0aW9uUHJvcGVydGllcy5mcm9tKGV4dGVybmFsIGFzIElDb25maWd1cmF0aW9uUHJvcGVydGllcyAmIHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9LCBjb250ZXh0LCBmYWxzZSwgc291cmNlKTtcblx0XHRyZXN1bHQuYWRkVGFza0xvYWRNZXNzYWdlcyhjb25maWd1cmF0aW9uLmVycm9ycyk7XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24udmFsdWUpIHtcblx0XHRcdHJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcyA9IE9iamVjdC5hc3NpZ24ocmVzdWx0LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCBjb25maWd1cmF0aW9uLnZhbHVlKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3VwcG9ydExlZ2FjeTogYm9vbGVhbiA9IHRydWU7IC8vY29udGV4dC5zY2hlbWFWZXJzaW9uID09PSBUYXNrcy5Kc29uU2NoZW1hVmVyc2lvbi5WMl8wXzA7XG5cdFx0aWYgKHN1cHBvcnRMZWdhY3kpIHtcblx0XHRcdGNvbnN0IGxlZ2FjeTogSUxlZ2FjeVRhc2tQcm9wZXJ0aWVzID0gZXh0ZXJuYWwgYXMgSUxlZ2FjeVRhc2tQcm9wZXJ0aWVzO1xuXHRcdFx0aWYgKHJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQgPT09IHVuZGVmaW5lZCAmJiBsZWdhY3kuaXNXYXRjaGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQgPSAhIWxlZ2FjeS5pc1dhdGNoaW5nO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmIChsZWdhY3kuaXNCdWlsZENvbW1hbmQgPT09IHRydWUpIHtcblx0XHRcdFx0XHRyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPSBUYXNrcy5UYXNrR3JvdXAuQnVpbGQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAobGVnYWN5LmlzVGVzdENvbW1hbmQgPT09IHRydWUpIHtcblx0XHRcdFx0XHRyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPSBUYXNrcy5UYXNrR3JvdXAuVGVzdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kOiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24gPSBDb21tYW5kQ29uZmlndXJhdGlvbi5mcm9tKGV4dGVybmFsLCBjb250ZXh0KSE7XG5cdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdHJlc3VsdC5jb21tYW5kID0gY29tbWFuZDtcblx0XHR9XG5cdFx0aWYgKGV4dGVybmFsLmNvbW1hbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gaWYgdGhlIHRhc2sgaGFzIGl0cyBvd24gY29tbWFuZCB0aGVuIHdlIHN1cHByZXNzIHRoZVxuXHRcdFx0Ly8gdGFzayBuYW1lIGJ5IGRlZmF1bHQuXG5cdFx0XHRjb21tYW5kLnN1cHByZXNzVGFza05hbWUgPSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxHbG9iYWxzKHRhc2s6IFRhc2tzLkN1c3RvbVRhc2ssIGdsb2JhbHM6IElHbG9iYWxzKTogdm9pZCB7XG5cdFx0Ly8gV2Ugb25seSBtZXJnZSBhIGNvbW1hbmQgZnJvbSBhIGdsb2JhbCBkZWZpbml0aW9uIGlmIHRoZXJlIGlzIG5vIGRlcGVuZHNPblxuXHRcdC8vIG9yIHRoZXJlIGlzIGEgZGVwZW5kc09uIGFuZCBhIGRlZmluZWQgY29tbWFuZC5cblx0XHRpZiAoQ29tbWFuZENvbmZpZ3VyYXRpb24uaGFzQ29tbWFuZCh0YXNrLmNvbW1hbmQpIHx8IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZGVwZW5kc09uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRhc2suY29tbWFuZCA9IENvbW1hbmRDb25maWd1cmF0aW9uLmZpbGxHbG9iYWxzKHRhc2suY29tbWFuZCwgZ2xvYmFscy5jb21tYW5kLCB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUpO1xuXHRcdH1cblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMgPT09IHVuZGVmaW5lZCAmJiBnbG9iYWxzLnByb2JsZW1NYXRjaGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzID0gT2JqZWN0cy5kZWVwQ2xvbmUoZ2xvYmFscy5wcm9ibGVtTWF0Y2hlcik7XG5cdFx0XHR0YXNrLmhhc0RlZmluZWRNYXRjaGVycyA9IHRydWU7XG5cdFx0fVxuXHRcdC8vIHByb21wdE9uQ2xvc2UgaXMgaW5mZXJyZWQgZnJvbSBpc0JhY2tncm91bmQgaWYgYXZhaWxhYmxlXG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvbXB0T25DbG9zZSA9PT0gdW5kZWZpbmVkICYmIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kID09PSB1bmRlZmluZWQgJiYgZ2xvYmFscy5wcm9tcHRPbkNsb3NlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvbXB0T25DbG9zZSA9IGdsb2JhbHMucHJvbXB0T25DbG9zZTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZmlsbERlZmF1bHRzKHRhc2s6IFRhc2tzLkN1c3RvbVRhc2ssIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiB2b2lkIHtcblx0XHRDb21tYW5kQ29uZmlndXJhdGlvbi5maWxsRGVmYXVsdHModGFzay5jb21tYW5kLCBjb250ZXh0KTtcblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9tcHRPbkNsb3NlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvbXB0T25DbG9zZSA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kICE9PSB1bmRlZmluZWQgPyAhdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQgOiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQgPSBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzID0gRU1QVFlfQVJSQVk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUN1c3RvbVRhc2soY29udHJpYnV0ZWRUYXNrOiBUYXNrcy5Db250cmlidXRlZFRhc2ssIGNvbmZpZ3VyZWRQcm9wczogVGFza3MuQ29uZmlndXJpbmdUYXNrIHwgVGFza3MuQ3VzdG9tVGFzayk6IFRhc2tzLkN1c3RvbVRhc2sge1xuXHRcdGNvbnN0IHJlc3VsdDogVGFza3MuQ3VzdG9tVGFzayA9IG5ldyBUYXNrcy5DdXN0b21UYXNrKFxuXHRcdFx0Y29uZmlndXJlZFByb3BzLl9pZCxcblx0XHRcdE9iamVjdC5hc3NpZ24oe30sIGNvbmZpZ3VyZWRQcm9wcy5fc291cmNlLCB7IGN1c3RvbWl6ZXM6IGNvbnRyaWJ1dGVkVGFzay5kZWZpbmVzIH0pLFxuXHRcdFx0Y29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUgfHwgY29udHJpYnV0ZWRUYXNrLl9sYWJlbCxcblx0XHRcdFRhc2tzLkNVU1RPTUlaRURfVEFTS19UWVBFLFxuXHRcdFx0Y29udHJpYnV0ZWRUYXNrLmNvbW1hbmQsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGNvbnRyaWJ1dGVkVGFzay5ydW5PcHRpb25zLFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiBjb25maWd1cmVkUHJvcHMuY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSB8fCBjb250cmlidXRlZFRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSxcblx0XHRcdFx0aWRlbnRpZmllcjogY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlkZW50aWZpZXIgfHwgY29udHJpYnV0ZWRUYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlkZW50aWZpZXIsXG5cdFx0XHRcdGljb246IGNvbmZpZ3VyZWRQcm9wcy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uLFxuXHRcdFx0XHRoaWRlOiBjb25maWd1cmVkUHJvcHMuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaGlkZSxcblx0XHRcdFx0aW5BZ2VudHM6IGNvbmZpZ3VyZWRQcm9wcy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pbkFnZW50c1xuXHRcdFx0fSxcblxuXHRcdCk7XG5cdFx0cmVzdWx0LmFkZFRhc2tMb2FkTWVzc2FnZXMoY29uZmlndXJlZFByb3BzLnRhc2tMb2FkTWVzc2FnZXMpO1xuXHRcdGNvbnN0IHJlc3VsdENvbmZpZ1Byb3BzOiBUYXNrcy5JQ29uZmlndXJhdGlvblByb3BlcnRpZXMgPSByZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXM7XG5cblx0XHRhc3NpZ25Qcm9wZXJ0eShyZXN1bHRDb25maWdQcm9wcywgY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCAnZ3JvdXAnKTtcblx0XHRhc3NpZ25Qcm9wZXJ0eShyZXN1bHRDb25maWdQcm9wcywgY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCAnaXNCYWNrZ3JvdW5kJyk7XG5cdFx0YXNzaWduUHJvcGVydHkocmVzdWx0Q29uZmlnUHJvcHMsIGNvbmZpZ3VyZWRQcm9wcy5jb25maWd1cmF0aW9uUHJvcGVydGllcywgJ2RlcGVuZHNPbicpO1xuXHRcdGFzc2lnblByb3BlcnR5KHJlc3VsdENvbmZpZ1Byb3BzLCBjb25maWd1cmVkUHJvcHMuY29uZmlndXJhdGlvblByb3BlcnRpZXMsICdwcm9ibGVtTWF0Y2hlcnMnKTtcblx0XHRhc3NpZ25Qcm9wZXJ0eShyZXN1bHRDb25maWdQcm9wcywgY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCAncHJvbXB0T25DbG9zZScpO1xuXHRcdGFzc2lnblByb3BlcnR5KHJlc3VsdENvbmZpZ1Byb3BzLCBjb25maWd1cmVkUHJvcHMuY29uZmlndXJhdGlvblByb3BlcnRpZXMsICdkZXRhaWwnKTtcblx0XHRyZXN1bHQuY29tbWFuZC5wcmVzZW50YXRpb24gPSBDb21tYW5kQ29uZmlndXJhdGlvbi5QcmVzZW50YXRpb25PcHRpb25zLmFzc2lnblByb3BlcnRpZXMoXG5cdFx0XHRyZXN1bHQuY29tbWFuZC5wcmVzZW50YXRpb24hLCBjb25maWd1cmVkUHJvcHMuY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJlc2VudGF0aW9uKSE7XG5cdFx0cmVzdWx0LmNvbW1hbmQub3B0aW9ucyA9IENvbW1hbmRPcHRpb25zLmFzc2lnblByb3BlcnRpZXMocmVzdWx0LmNvbW1hbmQub3B0aW9ucywgY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm9wdGlvbnMpO1xuXHRcdHJlc3VsdC5ydW5PcHRpb25zID0gUnVuT3B0aW9ucy5hc3NpZ25Qcm9wZXJ0aWVzKHJlc3VsdC5ydW5PcHRpb25zLCBjb25maWd1cmVkUHJvcHMucnVuT3B0aW9ucyk7XG5cblx0XHRjb25zdCBjb250cmlidXRlZENvbmZpZ1Byb3BzOiBUYXNrcy5JQ29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBjb250cmlidXRlZFRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXM7XG5cdFx0ZmlsbFByb3BlcnR5KHJlc3VsdENvbmZpZ1Byb3BzLCBjb250cmlidXRlZENvbmZpZ1Byb3BzLCAnZ3JvdXAnKTtcblx0XHRmaWxsUHJvcGVydHkocmVzdWx0Q29uZmlnUHJvcHMsIGNvbnRyaWJ1dGVkQ29uZmlnUHJvcHMsICdpc0JhY2tncm91bmQnKTtcblx0XHRmaWxsUHJvcGVydHkocmVzdWx0Q29uZmlnUHJvcHMsIGNvbnRyaWJ1dGVkQ29uZmlnUHJvcHMsICdkZXBlbmRzT24nKTtcblx0XHRmaWxsUHJvcGVydHkocmVzdWx0Q29uZmlnUHJvcHMsIGNvbnRyaWJ1dGVkQ29uZmlnUHJvcHMsICdwcm9ibGVtTWF0Y2hlcnMnKTtcblx0XHRmaWxsUHJvcGVydHkocmVzdWx0Q29uZmlnUHJvcHMsIGNvbnRyaWJ1dGVkQ29uZmlnUHJvcHMsICdwcm9tcHRPbkNsb3NlJyk7XG5cdFx0ZmlsbFByb3BlcnR5KHJlc3VsdENvbmZpZ1Byb3BzLCBjb250cmlidXRlZENvbmZpZ1Byb3BzLCAnZGV0YWlsJyk7XG5cdFx0cmVzdWx0LmNvbW1hbmQucHJlc2VudGF0aW9uID0gQ29tbWFuZENvbmZpZ3VyYXRpb24uUHJlc2VudGF0aW9uT3B0aW9ucy5maWxsUHJvcGVydGllcyhcblx0XHRcdHJlc3VsdC5jb21tYW5kLnByZXNlbnRhdGlvbiwgY29udHJpYnV0ZWRDb25maWdQcm9wcy5wcmVzZW50YXRpb24pITtcblx0XHRyZXN1bHQuY29tbWFuZC5vcHRpb25zID0gQ29tbWFuZE9wdGlvbnMuZmlsbFByb3BlcnRpZXMocmVzdWx0LmNvbW1hbmQub3B0aW9ucywgY29udHJpYnV0ZWRDb25maWdQcm9wcy5vcHRpb25zKTtcblx0XHRyZXN1bHQucnVuT3B0aW9ucyA9IFJ1bk9wdGlvbnMuZmlsbFByb3BlcnRpZXMocmVzdWx0LnJ1bk9wdGlvbnMsIGNvbnRyaWJ1dGVkVGFzay5ydW5PcHRpb25zKTtcblxuXHRcdGlmIChjb250cmlidXRlZFRhc2suaGFzRGVmaW5lZE1hdGNoZXJzID09PSB0cnVlKSB7XG5cdFx0XHRyZXN1bHQuaGFzRGVmaW5lZE1hdGNoZXJzID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tQYXJzZVJlc3VsdCB7XG5cdGN1c3RvbTogVGFza3MuQ3VzdG9tVGFza1tdO1xuXHRjb25maWd1cmVkOiBUYXNrcy5Db25maWd1cmluZ1Rhc2tbXTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUYXNrUGFyc2VyIHtcblxuXHRmdW5jdGlvbiBpc0N1c3RvbVRhc2sodmFsdWU6IElDdXN0b21UYXNrIHwgSUNvbmZpZ3VyaW5nVGFzayk6IHZhbHVlIGlzIElDdXN0b21UYXNrIHtcblx0XHRjb25zdCB0eXBlID0gdmFsdWUudHlwZTtcblx0XHRjb25zdCBjdXN0b21pemUgPSAodmFsdWUgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuY3VzdG9taXplO1xuXHRcdHJldHVybiBjdXN0b21pemUgPT09IHVuZGVmaW5lZCAmJiAodHlwZSA9PT0gdW5kZWZpbmVkIHx8IHR5cGUgPT09IG51bGwgfHwgdHlwZSA9PT0gVGFza3MuQ1VTVE9NSVpFRF9UQVNLX1RZUEUgfHwgdHlwZSA9PT0gJ3NoZWxsJyB8fCB0eXBlID09PSAncHJvY2VzcycpO1xuXHR9XG5cblx0Y29uc3QgYnVpbHRpblR5cGVDb250ZXh0TWFwOiBJU3RyaW5nRGljdGlvbmFyeTxSYXdDb250ZXh0S2V5PGJvb2xlYW4+PiA9IHtcblx0XHRzaGVsbDogU2hlbGxFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0LFxuXHRcdHByb2Nlc3M6IFByb2Nlc3NFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG5cdH07XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odGhpczogdm9pZCwgZXh0ZXJuYWxzOiBBcnJheTxJQ3VzdG9tVGFzayB8IElDb25maWd1cmluZ1Rhc2s+IHwgdW5kZWZpbmVkLCBnbG9iYWxzOiBJR2xvYmFscywgY29udGV4dDogSVBhcnNlQ29udGV4dCwgc291cmNlOiBUYXNrQ29uZmlnU291cmNlLCByZWdpc3RyeT86IFBhcnRpYWw8SVRhc2tEZWZpbml0aW9uUmVnaXN0cnk+KTogSVRhc2tQYXJzZVJlc3VsdCB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVGFza1BhcnNlUmVzdWx0ID0geyBjdXN0b206IFtdLCBjb25maWd1cmVkOiBbXSB9O1xuXHRcdGlmICghZXh0ZXJuYWxzKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRjb25zdCBkZWZhdWx0QnVpbGRUYXNrOiB7IHRhc2s6IFRhc2tzLlRhc2sgfCB1bmRlZmluZWQ7IHJhbms6IG51bWJlciB9ID0geyB0YXNrOiB1bmRlZmluZWQsIHJhbms6IC0xIH07XG5cdFx0Y29uc3QgZGVmYXVsdFRlc3RUYXNrOiB7IHRhc2s6IFRhc2tzLlRhc2sgfCB1bmRlZmluZWQ7IHJhbms6IG51bWJlciB9ID0geyB0YXNrOiB1bmRlZmluZWQsIHJhbms6IC0xIH07XG5cdFx0Y29uc3Qgc2NoZW1hMl8wXzA6IGJvb2xlYW4gPSBjb250ZXh0LnNjaGVtYVZlcnNpb24gPT09IFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMDtcblx0XHRjb25zdCBiYXNlTG9hZElzc3VlcyA9IE9iamVjdHMuZGVlcENsb25lKGNvbnRleHQudGFza0xvYWRJc3N1ZXMpO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBleHRlcm5hbHMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBleHRlcm5hbCA9IGV4dGVybmFsc1tpbmRleF07XG5cdFx0XHRjb25zdCBkZWZpbml0aW9uID0gZXh0ZXJuYWwudHlwZSA/IHJlZ2lzdHJ5Py5nZXQ/LihleHRlcm5hbC50eXBlKSB8fCBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmdldChleHRlcm5hbC50eXBlKSA6IHVuZGVmaW5lZDtcblx0XHRcdGxldCB0eXBlTm90U3VwcG9ydGVkOiBib29sZWFuID0gZmFsc2U7XG5cdFx0XHRpZiAoZGVmaW5pdGlvbiAmJiBkZWZpbml0aW9uLndoZW4gJiYgIWNvbnRleHQuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhkZWZpbml0aW9uLndoZW4pKSB7XG5cdFx0XHRcdHR5cGVOb3RTdXBwb3J0ZWQgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmICghZGVmaW5pdGlvbiAmJiBleHRlcm5hbC50eXBlKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGJ1aWx0aW5UeXBlQ29udGV4dE1hcCkpIHtcblx0XHRcdFx0XHRpZiAoZXh0ZXJuYWwudHlwZSA9PT0ga2V5KSB7XG5cdFx0XHRcdFx0XHR0eXBlTm90U3VwcG9ydGVkID0gIVNoZWxsRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dC5ldmFsdWF0ZShjb250ZXh0LmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHQobnVsbCkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0eXBlTm90U3VwcG9ydGVkKSB7XG5cdFx0XHRcdGNvbnRleHQucHJvYmxlbVJlcG9ydGVyLmluZm8obmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdCd0YXNrQ29uZmlndXJhdGlvbi5wcm92aWRlclVuYXZhaWxhYmxlJywgJ1dhcm5pbmc6IHswfSB0YXNrcyBhcmUgdW5hdmFpbGFibGUgaW4gdGhlIGN1cnJlbnQgZW52aXJvbm1lbnQuXFxuJyxcblx0XHRcdFx0XHRleHRlcm5hbC50eXBlXG5cdFx0XHRcdCkpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzQ3VzdG9tVGFzayhleHRlcm5hbCkpIHtcblx0XHRcdFx0Y29uc3QgY3VzdG9tVGFzayA9IEN1c3RvbVRhc2suZnJvbShleHRlcm5hbCwgY29udGV4dCwgaW5kZXgsIHNvdXJjZSk7XG5cdFx0XHRcdGlmIChjdXN0b21UYXNrKSB7XG5cdFx0XHRcdFx0Q3VzdG9tVGFzay5maWxsR2xvYmFscyhjdXN0b21UYXNrLCBnbG9iYWxzKTtcblx0XHRcdFx0XHRDdXN0b21UYXNrLmZpbGxEZWZhdWx0cyhjdXN0b21UYXNrLCBjb250ZXh0KTtcblx0XHRcdFx0XHRpZiAoc2NoZW1hMl8wXzApIHtcblx0XHRcdFx0XHRcdGlmICgoY3VzdG9tVGFzay5jb21tYW5kID09PSB1bmRlZmluZWQgfHwgY3VzdG9tVGFzay5jb21tYW5kLm5hbWUgPT09IHVuZGVmaW5lZCkgJiYgKGN1c3RvbVRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZGVwZW5kc09uID09PSB1bmRlZmluZWQgfHwgY3VzdG9tVGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXBlbmRzT24ubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LnByb2JsZW1SZXBvcnRlci5lcnJvcihubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0J3Rhc2tDb25maWd1cmF0aW9uLm5vQ29tbWFuZE9yRGVwZW5kc09uJywgJ0Vycm9yOiB0aGUgdGFzayBcXCd7MH1cXCcgbmVpdGhlciBzcGVjaWZpZXMgYSBjb21tYW5kIG5vciBhIGRlcGVuZHNPbiBwcm9wZXJ0eS4gVGhlIHRhc2sgd2lsbCBiZSBpZ25vcmVkLiBJdHMgZGVmaW5pdGlvbiBpczpcXG57MX0nLFxuXHRcdFx0XHRcdFx0XHRcdGN1c3RvbVRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSwgSlNPTi5zdHJpbmdpZnkoZXh0ZXJuYWwsIHVuZGVmaW5lZCwgNClcblx0XHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAoY3VzdG9tVGFzay5jb21tYW5kID09PSB1bmRlZmluZWQgfHwgY3VzdG9tVGFzay5jb21tYW5kLm5hbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRjb250ZXh0LnByb2JsZW1SZXBvcnRlci53YXJuKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0XHQndGFza0NvbmZpZ3VyYXRpb24ubm9Db21tYW5kJywgJ0Vycm9yOiB0aGUgdGFzayBcXCd7MH1cXCcgZG9lc25cXCd0IGRlZmluZSBhIGNvbW1hbmQuIFRoZSB0YXNrIHdpbGwgYmUgaWdub3JlZC4gSXRzIGRlZmluaXRpb24gaXM6XFxuezF9Jyxcblx0XHRcdFx0XHRcdFx0XHRjdXN0b21UYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUsIEpTT04uc3RyaW5naWZ5KGV4dGVybmFsLCB1bmRlZmluZWQsIDQpXG5cdFx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGN1c3RvbVRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPT09IFRhc2tzLlRhc2tHcm91cC5CdWlsZCAmJiBkZWZhdWx0QnVpbGRUYXNrLnJhbmsgPCAyKSB7XG5cdFx0XHRcdFx0XHRkZWZhdWx0QnVpbGRUYXNrLnRhc2sgPSBjdXN0b21UYXNrO1xuXHRcdFx0XHRcdFx0ZGVmYXVsdEJ1aWxkVGFzay5yYW5rID0gMjtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGN1c3RvbVRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPT09IFRhc2tzLlRhc2tHcm91cC5UZXN0ICYmIGRlZmF1bHRUZXN0VGFzay5yYW5rIDwgMikge1xuXHRcdFx0XHRcdFx0ZGVmYXVsdFRlc3RUYXNrLnRhc2sgPSBjdXN0b21UYXNrO1xuXHRcdFx0XHRcdFx0ZGVmYXVsdFRlc3RUYXNrLnJhbmsgPSAyO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY3VzdG9tVGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lID09PSAnYnVpbGQnICYmIGRlZmF1bHRCdWlsZFRhc2sucmFuayA8IDEpIHtcblx0XHRcdFx0XHRcdGRlZmF1bHRCdWlsZFRhc2sudGFzayA9IGN1c3RvbVRhc2s7XG5cdFx0XHRcdFx0XHRkZWZhdWx0QnVpbGRUYXNrLnJhbmsgPSAxO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY3VzdG9tVGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lID09PSAndGVzdCcgJiYgZGVmYXVsdFRlc3RUYXNrLnJhbmsgPCAxKSB7XG5cdFx0XHRcdFx0XHRkZWZhdWx0VGVzdFRhc2sudGFzayA9IGN1c3RvbVRhc2s7XG5cdFx0XHRcdFx0XHRkZWZhdWx0VGVzdFRhc2sucmFuayA9IDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGN1c3RvbVRhc2suYWRkVGFza0xvYWRNZXNzYWdlcyhjb250ZXh0LnRhc2tMb2FkSXNzdWVzKTtcblx0XHRcdFx0XHRyZXN1bHQuY3VzdG9tLnB1c2goY3VzdG9tVGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRUYXNrID0gQ29uZmlndXJpbmdUYXNrLmZyb20oZXh0ZXJuYWwsIGNvbnRleHQsIGluZGV4LCBzb3VyY2UsIHJlZ2lzdHJ5KTtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyZWRUYXNrKSB7XG5cdFx0XHRcdFx0Y29uZmlndXJlZFRhc2suYWRkVGFza0xvYWRNZXNzYWdlcyhjb250ZXh0LnRhc2tMb2FkSXNzdWVzKTtcblx0XHRcdFx0XHRyZXN1bHQuY29uZmlndXJlZC5wdXNoKGNvbmZpZ3VyZWRUYXNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29udGV4dC50YXNrTG9hZElzc3VlcyA9IE9iamVjdHMuZGVlcENsb25lKGJhc2VMb2FkSXNzdWVzKTtcblx0XHR9XG5cdFx0Ly8gVGhlcmUgaXMgc29tZSBzcGVjaWFsIGxvZ2ljIGZvciB0YXNrcyB3aXRoIHRoZSBsYWJlbHMgXCJidWlsZFwiIGFuZCBcInRlc3RcIi5cblx0XHQvLyBFdmVuIGlmIHRoZXkgYXJlIG5vdCBtYXJrZWQgYXMgYSB0YXNrIGdyb3VwIEJ1aWxkIG9yIFRlc3QsIHdlIGF1dG9tYWdpY2FsbHkgZ3JvdXAgdGhlbSBhcyBzdWNoLlxuXHRcdC8vIEhvd2V2ZXIsIGlmIHRoZXkgYXJlIGFscmVhZHkgZ3JvdXBlZCBhcyBCdWlsZCBvciBUZXN0LCB3ZSBkb24ndCBuZWVkIHRvIGFkZCB0aGlzIGdyb3VwaW5nLlxuXHRcdGNvbnN0IGRlZmF1bHRCdWlsZEdyb3VwTmFtZSA9IFR5cGVzLmlzU3RyaW5nKGRlZmF1bHRCdWlsZFRhc2sudGFzaz8uY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApID8gZGVmYXVsdEJ1aWxkVGFzay50YXNrPy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCA6IGRlZmF1bHRCdWlsZFRhc2sudGFzaz8uY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXA/Ll9pZDtcblx0XHRjb25zdCBkZWZhdWx0VGVzdFRhc2tHcm91cE5hbWUgPSBUeXBlcy5pc1N0cmluZyhkZWZhdWx0VGVzdFRhc2sudGFzaz8uY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApID8gZGVmYXVsdFRlc3RUYXNrLnRhc2s/LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwIDogZGVmYXVsdFRlc3RUYXNrLnRhc2s/LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwPy5faWQ7XG5cdFx0aWYgKChkZWZhdWx0QnVpbGRHcm91cE5hbWUgIT09IFRhc2tzLlRhc2tHcm91cC5CdWlsZC5faWQpICYmIChkZWZhdWx0QnVpbGRUYXNrLnJhbmsgPiAtMSkgJiYgKGRlZmF1bHRCdWlsZFRhc2sucmFuayA8IDIpICYmIGRlZmF1bHRCdWlsZFRhc2sudGFzaykge1xuXHRcdFx0ZGVmYXVsdEJ1aWxkVGFzay50YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwID0gVGFza3MuVGFza0dyb3VwLkJ1aWxkO1xuXHRcdH0gZWxzZSBpZiAoKGRlZmF1bHRUZXN0VGFza0dyb3VwTmFtZSAhPT0gVGFza3MuVGFza0dyb3VwLlRlc3QuX2lkKSAmJiAoZGVmYXVsdFRlc3RUYXNrLnJhbmsgPiAtMSkgJiYgKGRlZmF1bHRUZXN0VGFzay5yYW5rIDwgMikgJiYgZGVmYXVsdFRlc3RUYXNrLnRhc2spIHtcblx0XHRcdGRlZmF1bHRUZXN0VGFzay50YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwID0gVGFza3MuVGFza0dyb3VwLlRlc3Q7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBhc3NpZ25UYXNrcyh0YXJnZXQ6IFRhc2tzLkN1c3RvbVRhc2tbXSwgc291cmNlOiBUYXNrcy5DdXN0b21UYXNrW10pOiBUYXNrcy5DdXN0b21UYXNrW10ge1xuXHRcdGlmIChzb3VyY2UgPT09IHVuZGVmaW5lZCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQgfHwgdGFyZ2V0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHNvdXJjZTtcblx0XHR9XG5cblx0XHRpZiAoc291cmNlKSB7XG5cdFx0XHQvLyBUYXNrcyBhcmUga2V5ZWQgYnkgSUQgYnV0IHdlIG5lZWQgdG8gbWVyZ2UgYnkgbmFtZVxuXHRcdFx0Y29uc3QgbWFwOiBJU3RyaW5nRGljdGlvbmFyeTxUYXNrcy5DdXN0b21UYXNrPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHR0YXJnZXQuZm9yRWFjaCgodGFzaykgPT4ge1xuXHRcdFx0XHRtYXBbdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lIV0gPSB0YXNrO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNvdXJjZS5mb3JFYWNoKCh0YXNrKSA9PiB7XG5cdFx0XHRcdG1hcFt0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUhXSA9IHRhc2s7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG5ld1RhcmdldDogVGFza3MuQ3VzdG9tVGFza1tdID0gW107XG5cdFx0XHR0YXJnZXQuZm9yRWFjaCh0YXNrID0+IHtcblx0XHRcdFx0bmV3VGFyZ2V0LnB1c2gobWFwW3Rhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSFdKTtcblx0XHRcdFx0ZGVsZXRlIG1hcFt0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUhXTtcblx0XHRcdH0pO1xuXHRcdFx0T2JqZWN0LmtleXMobWFwKS5mb3JFYWNoKGtleSA9PiBuZXdUYXJnZXQucHVzaChtYXBba2V5XSkpO1xuXHRcdFx0dGFyZ2V0ID0gbmV3VGFyZ2V0O1xuXHRcdH1cblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdsb2JhbHMge1xuXHRjb21tYW5kPzogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uO1xuXHRwcm9ibGVtTWF0Y2hlcj86IFByb2JsZW1NYXRjaGVyW107XG5cdHByb21wdE9uQ2xvc2U/OiBib29sZWFuO1xuXHRzdXBwcmVzc1Rhc2tOYW1lPzogYm9vbGVhbjtcbn1cblxubmFtZXNwYWNlIEdsb2JhbHMge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGNvbmZpZzogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24sIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBJR2xvYmFscyB7XG5cdFx0bGV0IHJlc3VsdCA9IGZyb21CYXNlKGNvbmZpZywgY29udGV4dCk7XG5cdFx0bGV0IG9zR2xvYmFsczogSUdsb2JhbHMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbmZpZy53aW5kb3dzICYmIGNvbnRleHQucGxhdGZvcm0gPT09IFBsYXRmb3JtLldpbmRvd3MpIHtcblx0XHRcdG9zR2xvYmFscyA9IGZyb21CYXNlKGNvbmZpZy53aW5kb3dzLCBjb250ZXh0KTtcblx0XHR9IGVsc2UgaWYgKGNvbmZpZy5vc3ggJiYgY29udGV4dC5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uTWFjKSB7XG5cdFx0XHRvc0dsb2JhbHMgPSBmcm9tQmFzZShjb25maWcub3N4LCBjb250ZXh0KTtcblx0XHR9IGVsc2UgaWYgKGNvbmZpZy5saW51eCAmJiBjb250ZXh0LnBsYXRmb3JtID09PSBQbGF0Zm9ybS5MaW51eCkge1xuXHRcdFx0b3NHbG9iYWxzID0gZnJvbUJhc2UoY29uZmlnLmxpbnV4LCBjb250ZXh0KTtcblx0XHR9XG5cdFx0aWYgKG9zR2xvYmFscykge1xuXHRcdFx0cmVzdWx0ID0gR2xvYmFscy5hc3NpZ25Qcm9wZXJ0aWVzKHJlc3VsdCwgb3NHbG9iYWxzKTtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZCA9IENvbW1hbmRDb25maWd1cmF0aW9uLmZyb20oY29uZmlnLCBjb250ZXh0KTtcblx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0cmVzdWx0LmNvbW1hbmQgPSBjb21tYW5kO1xuXHRcdH1cblx0XHRHbG9iYWxzLmZpbGxEZWZhdWx0cyhyZXN1bHQsIGNvbnRleHQpO1xuXHRcdEdsb2JhbHMuZnJlZXplKHJlc3VsdCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tQmFzZSh0aGlzOiB2b2lkLCBjb25maWc6IElCYXNlVGFza1J1bm5lckNvbmZpZ3VyYXRpb24sIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBJR2xvYmFscyB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJR2xvYmFscyA9IHt9O1xuXHRcdGlmIChjb25maWcuc3VwcHJlc3NUYXNrTmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQuc3VwcHJlc3NUYXNrTmFtZSA9ICEhY29uZmlnLnN1cHByZXNzVGFza05hbWU7XG5cdFx0fVxuXHRcdGlmIChjb25maWcucHJvbXB0T25DbG9zZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQucHJvbXB0T25DbG9zZSA9ICEhY29uZmlnLnByb21wdE9uQ2xvc2U7XG5cdFx0fVxuXHRcdGlmIChjb25maWcucHJvYmxlbU1hdGNoZXIpIHtcblx0XHRcdHJlc3VsdC5wcm9ibGVtTWF0Y2hlciA9IFByb2JsZW1NYXRjaGVyQ29udmVydGVyLmZyb20oY29uZmlnLnByb2JsZW1NYXRjaGVyLCBjb250ZXh0KS52YWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc0VtcHR5KHZhbHVlOiBJR2xvYmFscyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdmFsdWUgfHwgdmFsdWUuY29tbWFuZCA9PT0gdW5kZWZpbmVkICYmIHZhbHVlLnByb21wdE9uQ2xvc2UgPT09IHVuZGVmaW5lZCAmJiB2YWx1ZS5zdXBwcmVzc1Rhc2tOYW1lID09PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gYXNzaWduUHJvcGVydGllcyh0YXJnZXQ6IElHbG9iYWxzLCBzb3VyY2U6IElHbG9iYWxzKTogSUdsb2JhbHMge1xuXHRcdGlmIChpc0VtcHR5KHNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0fVxuXHRcdGlmIChpc0VtcHR5KHRhcmdldCkpIHtcblx0XHRcdHJldHVybiBzb3VyY2U7XG5cdFx0fVxuXHRcdGFzc2lnblByb3BlcnR5KHRhcmdldCwgc291cmNlLCAncHJvbXB0T25DbG9zZScpO1xuXHRcdGFzc2lnblByb3BlcnR5KHRhcmdldCwgc291cmNlLCAnc3VwcHJlc3NUYXNrTmFtZScpO1xuXHRcdHJldHVybiB0YXJnZXQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZmlsbERlZmF1bHRzKHZhbHVlOiBJR2xvYmFscywgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Q29tbWFuZENvbmZpZ3VyYXRpb24uZmlsbERlZmF1bHRzKHZhbHVlLmNvbW1hbmQsIGNvbnRleHQpO1xuXHRcdGlmICh2YWx1ZS5zdXBwcmVzc1Rhc2tOYW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhbHVlLnN1cHByZXNzVGFza05hbWUgPSAoY29udGV4dC5zY2hlbWFWZXJzaW9uID09PSBUYXNrcy5Kc29uU2NoZW1hVmVyc2lvbi5WMl8wXzApO1xuXHRcdH1cblx0XHRpZiAodmFsdWUucHJvbXB0T25DbG9zZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZS5wcm9tcHRPbkNsb3NlID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJlZXplKHZhbHVlOiBJR2xvYmFscyk6IHZvaWQge1xuXHRcdE9iamVjdC5mcmVlemUodmFsdWUpO1xuXHRcdGlmICh2YWx1ZS5jb21tYW5kKSB7XG5cdFx0XHRDb21tYW5kQ29uZmlndXJhdGlvbi5mcmVlemUodmFsdWUuY29tbWFuZCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRXhlY3V0aW9uRW5naW5lIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShjb25maWc6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uKTogVGFza3MuRXhlY3V0aW9uRW5naW5lIHtcblx0XHRjb25zdCBydW5uZXIgPSBjb25maWcucnVubmVyIHx8IGNvbmZpZy5fcnVubmVyO1xuXHRcdGxldCByZXN1bHQ6IFRhc2tzLkV4ZWN1dGlvbkVuZ2luZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAocnVubmVyKSB7XG5cdFx0XHRzd2l0Y2ggKHJ1bm5lcikge1xuXHRcdFx0XHRjYXNlICd0ZXJtaW5hbCc6XG5cdFx0XHRcdFx0cmVzdWx0ID0gVGFza3MuRXhlY3V0aW9uRW5naW5lLlRlcm1pbmFsO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdwcm9jZXNzJzpcblx0XHRcdFx0XHRyZXN1bHQgPSBUYXNrcy5FeGVjdXRpb25FbmdpbmUuUHJvY2Vzcztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2NoZW1hVmVyc2lvbiA9IEpzb25TY2hlbWFWZXJzaW9uLmZyb20oY29uZmlnKTtcblx0XHRpZiAoc2NoZW1hVmVyc2lvbiA9PT0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjBfMV8wKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0IHx8IFRhc2tzLkV4ZWN1dGlvbkVuZ2luZS5Qcm9jZXNzO1xuXHRcdH0gZWxzZSBpZiAoc2NoZW1hVmVyc2lvbiA9PT0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKSB7XG5cdFx0XHRyZXR1cm4gVGFza3MuRXhlY3V0aW9uRW5naW5lLlRlcm1pbmFsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nob3VsZG5cXCd0IGhhcHBlbi4nKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBKc29uU2NoZW1hVmVyc2lvbiB7XG5cblx0Y29uc3QgX2RlZmF1bHQ6IFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uID0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGNvbmZpZzogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24pOiBUYXNrcy5Kc29uU2NoZW1hVmVyc2lvbiB7XG5cdFx0Y29uc3QgdmVyc2lvbiA9IGNvbmZpZy52ZXJzaW9uO1xuXHRcdGlmICghdmVyc2lvbikge1xuXHRcdFx0cmV0dXJuIF9kZWZhdWx0O1xuXHRcdH1cblx0XHRzd2l0Y2ggKHZlcnNpb24pIHtcblx0XHRcdGNhc2UgJzAuMS4wJzpcblx0XHRcdFx0cmV0dXJuIFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYwXzFfMDtcblx0XHRcdGNhc2UgJzIuMC4wJzpcblx0XHRcdFx0cmV0dXJuIFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBfZGVmYXVsdDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGFyc2VSZXN1bHQge1xuXHR2YWxpZGF0aW9uU3RhdHVzOiBWYWxpZGF0aW9uU3RhdHVzO1xuXHRjdXN0b206IFRhc2tzLkN1c3RvbVRhc2tbXTtcblx0Y29uZmlndXJlZDogVGFza3MuQ29uZmlndXJpbmdUYXNrW107XG5cdGVuZ2luZTogVGFza3MuRXhlY3V0aW9uRW5naW5lO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9ibGVtUmVwb3J0ZXIgZXh0ZW5kcyBJUHJvYmxlbVJlcG9ydGVyQmFzZSB7XG59XG5cbmV4cG9ydCBjbGFzcyBVVUlETWFwIHtcblxuXHRwcml2YXRlIGxhc3Q6IElTdHJpbmdEaWN0aW9uYXJ5PFR5cGVzLlNpbmdsZU9yTWFueTxzdHJpbmc+PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50OiBJU3RyaW5nRGljdGlvbmFyeTxUeXBlcy5TaW5nbGVPck1hbnk8c3RyaW5nPj47XG5cblx0Y29uc3RydWN0b3Iob3RoZXI/OiBVVUlETWFwKSB7XG5cdFx0dGhpcy5jdXJyZW50ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRpZiAob3RoZXIpIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKG90aGVyLmN1cnJlbnQpKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gb3RoZXIuY3VycmVudFtrZXldO1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0XHR0aGlzLmN1cnJlbnRba2V5XSA9IHZhbHVlLnNsaWNlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50W2tleV0gPSB2YWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGFydCgpOiB2b2lkIHtcblx0XHR0aGlzLmxhc3QgPSB0aGlzLmN1cnJlbnQ7XG5cdFx0dGhpcy5jdXJyZW50ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRVVUlEKGlkZW50aWZpZXI6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGFzdFZhbHVlID0gdGhpcy5sYXN0ID8gdGhpcy5sYXN0W2lkZW50aWZpZXJdIDogdW5kZWZpbmVkO1xuXHRcdGxldCByZXN1bHQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAobGFzdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGxhc3RWYWx1ZSkpIHtcblx0XHRcdFx0cmVzdWx0ID0gbGFzdFZhbHVlLnNoaWZ0KCk7XG5cdFx0XHRcdGlmIChsYXN0VmFsdWUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHRoaXMubGFzdCFbaWRlbnRpZmllcl07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdCA9IGxhc3RWYWx1ZTtcblx0XHRcdFx0ZGVsZXRlIHRoaXMubGFzdCFbaWRlbnRpZmllcl07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0ID0gVVVJRC5nZW5lcmF0ZVV1aWQoKTtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudFZhbHVlID0gdGhpcy5jdXJyZW50W2lkZW50aWZpZXJdO1xuXHRcdGlmIChjdXJyZW50VmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5jdXJyZW50W2lkZW50aWZpZXJdID0gcmVzdWx0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShjdXJyZW50VmFsdWUpKSB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZS5wdXNoKHJlc3VsdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBhcnJheVZhbHVlOiBzdHJpbmdbXSA9IFtjdXJyZW50VmFsdWVdO1xuXHRcdFx0XHRhcnJheVZhbHVlLnB1c2gocmVzdWx0KTtcblx0XHRcdFx0dGhpcy5jdXJyZW50W2lkZW50aWZpZXJdID0gYXJyYXlWYWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBmaW5pc2goKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0ID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFRhc2tDb25maWdTb3VyY2Uge1xuXHRUYXNrc0pzb24sXG5cdFdvcmtzcGFjZUZpbGUsXG5cdFVzZXJcbn1cblxuY2xhc3MgQ29uZmlndXJhdGlvblBhcnNlciB7XG5cblx0cHJpdmF0ZSB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXI7XG5cdHByaXZhdGUgd29ya3NwYWNlOiBJV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb2JsZW1SZXBvcnRlcjogSVByb2JsZW1SZXBvcnRlcjtcblx0cHJpdmF0ZSB1dWlkTWFwOiBVVUlETWFwO1xuXHRwcml2YXRlIHBsYXRmb3JtOiBQbGF0Zm9ybTtcblxuXHRjb25zdHJ1Y3Rvcih3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIsIHdvcmtzcGFjZTogSVdvcmtzcGFjZSB8IHVuZGVmaW5lZCwgcGxhdGZvcm06IFBsYXRmb3JtLCBwcm9ibGVtUmVwb3J0ZXI6IElQcm9ibGVtUmVwb3J0ZXIsIHV1aWRNYXA6IFVVSURNYXApIHtcblx0XHR0aGlzLndvcmtzcGFjZUZvbGRlciA9IHdvcmtzcGFjZUZvbGRlcjtcblx0XHR0aGlzLndvcmtzcGFjZSA9IHdvcmtzcGFjZTtcblx0XHR0aGlzLnBsYXRmb3JtID0gcGxhdGZvcm07XG5cdFx0dGhpcy5wcm9ibGVtUmVwb3J0ZXIgPSBwcm9ibGVtUmVwb3J0ZXI7XG5cdFx0dGhpcy51dWlkTWFwID0gdXVpZE1hcDtcblx0fVxuXG5cdHB1YmxpYyBydW4oZmlsZUNvbmZpZzogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24sIHNvdXJjZTogVGFza0NvbmZpZ1NvdXJjZSwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IElQYXJzZVJlc3VsdCB7XG5cdFx0Y29uc3QgZW5naW5lID0gRXhlY3V0aW9uRW5naW5lLmZyb20oZmlsZUNvbmZpZyk7XG5cdFx0Y29uc3Qgc2NoZW1hVmVyc2lvbiA9IEpzb25TY2hlbWFWZXJzaW9uLmZyb20oZmlsZUNvbmZpZyk7XG5cdFx0Y29uc3QgY29udGV4dDogSVBhcnNlQ29udGV4dCA9IHtcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogdGhpcy53b3Jrc3BhY2VGb2xkZXIsXG5cdFx0XHR3b3Jrc3BhY2U6IHRoaXMud29ya3NwYWNlLFxuXHRcdFx0cHJvYmxlbVJlcG9ydGVyOiB0aGlzLnByb2JsZW1SZXBvcnRlcixcblx0XHRcdHV1aWRNYXA6IHRoaXMudXVpZE1hcCxcblx0XHRcdG5hbWVkUHJvYmxlbU1hdGNoZXJzOiB7fSxcblx0XHRcdGVuZ2luZSxcblx0XHRcdHNjaGVtYVZlcnNpb24sXG5cdFx0XHRwbGF0Zm9ybTogdGhpcy5wbGF0Zm9ybSxcblx0XHRcdHRhc2tMb2FkSXNzdWVzOiBbXSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlXG5cdFx0fTtcblx0XHRjb25zdCB0YXNrUGFyc2VSZXN1bHQgPSB0aGlzLmNyZWF0ZVRhc2tSdW5uZXJDb25maWd1cmF0aW9uKGZpbGVDb25maWcsIGNvbnRleHQsIHNvdXJjZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHZhbGlkYXRpb25TdGF0dXM6IHRoaXMucHJvYmxlbVJlcG9ydGVyLnN0YXR1cyxcblx0XHRcdGN1c3RvbTogdGFza1BhcnNlUmVzdWx0LmN1c3RvbSxcblx0XHRcdGNvbmZpZ3VyZWQ6IHRhc2tQYXJzZVJlc3VsdC5jb25maWd1cmVkLFxuXHRcdFx0ZW5naW5lXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVGFza1J1bm5lckNvbmZpZ3VyYXRpb24oZmlsZUNvbmZpZzogSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24sIGNvbnRleHQ6IElQYXJzZUNvbnRleHQsIHNvdXJjZTogVGFza0NvbmZpZ1NvdXJjZSk6IElUYXNrUGFyc2VSZXN1bHQge1xuXHRcdGNvbnN0IGdsb2JhbHMgPSBHbG9iYWxzLmZyb20oZmlsZUNvbmZpZywgY29udGV4dCk7XG5cdFx0aWYgKHRoaXMucHJvYmxlbVJlcG9ydGVyLnN0YXR1cy5pc0ZhdGFsKCkpIHtcblx0XHRcdHJldHVybiB7IGN1c3RvbTogW10sIGNvbmZpZ3VyZWQ6IFtdIH07XG5cdFx0fVxuXHRcdGNvbnRleHQubmFtZWRQcm9ibGVtTWF0Y2hlcnMgPSBQcm9ibGVtTWF0Y2hlckNvbnZlcnRlci5uYW1lZEZyb20oZmlsZUNvbmZpZy5kZWNsYXJlcywgY29udGV4dCk7XG5cdFx0bGV0IGdsb2JhbFRhc2tzOiBUYXNrcy5DdXN0b21UYXNrW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGV4dGVybmFsR2xvYmFsVGFza3M6IEFycmF5PElDb25maWd1cmluZ1Rhc2sgfCBJQ3VzdG9tVGFzaz4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGZpbGVDb25maWcud2luZG93cyAmJiBjb250ZXh0LnBsYXRmb3JtID09PSBQbGF0Zm9ybS5XaW5kb3dzKSB7XG5cdFx0XHRnbG9iYWxUYXNrcyA9IFRhc2tQYXJzZXIuZnJvbShmaWxlQ29uZmlnLndpbmRvd3MudGFza3MsIGdsb2JhbHMsIGNvbnRleHQsIHNvdXJjZSkuY3VzdG9tO1xuXHRcdFx0ZXh0ZXJuYWxHbG9iYWxUYXNrcyA9IGZpbGVDb25maWcud2luZG93cy50YXNrcztcblx0XHR9IGVsc2UgaWYgKGZpbGVDb25maWcub3N4ICYmIGNvbnRleHQucGxhdGZvcm0gPT09IFBsYXRmb3JtLk1hYykge1xuXHRcdFx0Z2xvYmFsVGFza3MgPSBUYXNrUGFyc2VyLmZyb20oZmlsZUNvbmZpZy5vc3gudGFza3MsIGdsb2JhbHMsIGNvbnRleHQsIHNvdXJjZSkuY3VzdG9tO1xuXHRcdFx0ZXh0ZXJuYWxHbG9iYWxUYXNrcyA9IGZpbGVDb25maWcub3N4LnRhc2tzO1xuXHRcdH0gZWxzZSBpZiAoZmlsZUNvbmZpZy5saW51eCAmJiBjb250ZXh0LnBsYXRmb3JtID09PSBQbGF0Zm9ybS5MaW51eCkge1xuXHRcdFx0Z2xvYmFsVGFza3MgPSBUYXNrUGFyc2VyLmZyb20oZmlsZUNvbmZpZy5saW51eC50YXNrcywgZ2xvYmFscywgY29udGV4dCwgc291cmNlKS5jdXN0b207XG5cdFx0XHRleHRlcm5hbEdsb2JhbFRhc2tzID0gZmlsZUNvbmZpZy5saW51eC50YXNrcztcblx0XHR9XG5cdFx0aWYgKGNvbnRleHQuc2NoZW1hVmVyc2lvbiA9PT0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wICYmIGdsb2JhbFRhc2tzICYmIGdsb2JhbFRhc2tzLmxlbmd0aCA+IDAgJiYgZXh0ZXJuYWxHbG9iYWxUYXNrcyAmJiBleHRlcm5hbEdsb2JhbFRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHRhc2tDb250ZW50OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIGV4dGVybmFsR2xvYmFsVGFza3MpIHtcblx0XHRcdFx0dGFza0NvbnRlbnQucHVzaChKU09OLnN0cmluZ2lmeSh0YXNrLCBudWxsLCA0KSk7XG5cdFx0XHR9XG5cdFx0XHRjb250ZXh0LnByb2JsZW1SZXBvcnRlci5lcnJvcihcblx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdHsga2V5OiAnVGFza1BhcnNlLm5vT3NTcGVjaWZpY0dsb2JhbFRhc2tzJywgY29tbWVudDogWydcXFwiVGFzayB2ZXJzaW9uIDIuMC4wXFxcIiByZWZlcnMgdG8gdGhlIDIuMC4wIHZlcnNpb24gb2YgdGhlIHRhc2sgc3lzdGVtLiBUaGUgXFxcInZlcnNpb24gMi4wLjBcXFwiIGlzIG5vdCBsb2NhbGl6YWJsZSBhcyBpdCBpcyBhIGpzb24ga2V5IGFuZCB2YWx1ZS4nXSB9LFxuXHRcdFx0XHRcdCdUYXNrIHZlcnNpb24gMi4wLjAgZG9lc25cXCd0IHN1cHBvcnQgZ2xvYmFsIE9TIHNwZWNpZmljIHRhc2tzLiBDb252ZXJ0IHRoZW0gdG8gYSB0YXNrIHdpdGggYSBPUyBzcGVjaWZpYyBjb21tYW5kLiBBZmZlY3RlZCB0YXNrcyBhcmU6XFxuezB9JywgdGFza0NvbnRlbnQuam9pbignXFxuJykpXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGxldCByZXN1bHQ6IElUYXNrUGFyc2VSZXN1bHQgPSB7IGN1c3RvbTogW10sIGNvbmZpZ3VyZWQ6IFtdIH07XG5cdFx0aWYgKGZpbGVDb25maWcudGFza3MpIHtcblx0XHRcdHJlc3VsdCA9IFRhc2tQYXJzZXIuZnJvbShmaWxlQ29uZmlnLnRhc2tzLCBnbG9iYWxzLCBjb250ZXh0LCBzb3VyY2UpO1xuXHRcdH1cblx0XHRpZiAoZ2xvYmFsVGFza3MpIHtcblx0XHRcdHJlc3VsdC5jdXN0b20gPSBUYXNrUGFyc2VyLmFzc2lnblRhc2tzKHJlc3VsdC5jdXN0b20sIGdsb2JhbFRhc2tzKTtcblx0XHR9XG5cblx0XHRpZiAoKCFyZXN1bHQuY3VzdG9tIHx8IHJlc3VsdC5jdXN0b20ubGVuZ3RoID09PSAwKSAmJiAoZ2xvYmFscy5jb21tYW5kICYmIGdsb2JhbHMuY29tbWFuZC5uYW1lKSkge1xuXHRcdFx0Y29uc3QgbWF0Y2hlcnM6IFByb2JsZW1NYXRjaGVyW10gPSBQcm9ibGVtTWF0Y2hlckNvbnZlcnRlci5mcm9tKGZpbGVDb25maWcucHJvYmxlbU1hdGNoZXIsIGNvbnRleHQpLnZhbHVlID8/IFtdO1xuXHRcdFx0Y29uc3QgaXNCYWNrZ3JvdW5kID0gZmlsZUNvbmZpZy5pc0JhY2tncm91bmQgPyAhIWZpbGVDb25maWcuaXNCYWNrZ3JvdW5kIDogZmlsZUNvbmZpZy5pc1dhdGNoaW5nID8gISFmaWxlQ29uZmlnLmlzV2F0Y2hpbmcgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBuYW1lID0gVGFza3MuQ29tbWFuZFN0cmluZy52YWx1ZShnbG9iYWxzLmNvbW1hbmQubmFtZSk7XG5cdFx0XHRjb25zdCB0YXNrOiBUYXNrcy5DdXN0b21UYXNrID0gbmV3IFRhc2tzLkN1c3RvbVRhc2soXG5cdFx0XHRcdGNvbnRleHQudXVpZE1hcC5nZXRVVUlEKG5hbWUpLFxuXHRcdFx0XHRPYmplY3QuYXNzaWduKHt9LCBzb3VyY2UsICd3b3Jrc3BhY2UnLCB7IGNvbmZpZzogeyBpbmRleDogLTEsIGVsZW1lbnQ6IGZpbGVDb25maWcsIHdvcmtzcGFjZUZvbGRlcjogY29udGV4dC53b3Jrc3BhY2VGb2xkZXIgfSB9KSBzYXRpc2ZpZXMgVGFza3MuSVdvcmtzcGFjZVRhc2tTb3VyY2UsXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFRhc2tzLkNVU1RPTUlaRURfVEFTS19UWVBFLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJ1bnRpbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzdXBwcmVzc1Rhc2tOYW1lOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHR7IHJlZXZhbHVhdGVPblJlcnVuOiB0cnVlIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRuYW1lOiBuYW1lLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6IG5hbWUsXG5cdFx0XHRcdFx0Z3JvdXA6IFRhc2tzLlRhc2tHcm91cC5CdWlsZCxcblx0XHRcdFx0XHRpc0JhY2tncm91bmQ6IGlzQmFja2dyb3VuZCxcblx0XHRcdFx0XHRwcm9ibGVtTWF0Y2hlcnM6IG1hdGNoZXJzXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0XHRjb25zdCB0YXNrR3JvdXBLaW5kID0gR3JvdXBLaW5kLmZyb20oZmlsZUNvbmZpZy5ncm91cCk7XG5cdFx0XHRpZiAodGFza0dyb3VwS2luZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPSB0YXNrR3JvdXBLaW5kO1xuXHRcdFx0fSBlbHNlIGlmIChmaWxlQ29uZmlnLmdyb3VwID09PSAnbm9uZScpIHtcblx0XHRcdFx0dGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdEN1c3RvbVRhc2suZmlsbEdsb2JhbHModGFzaywgZ2xvYmFscyk7XG5cdFx0XHRDdXN0b21UYXNrLmZpbGxEZWZhdWx0cyh0YXNrLCBjb250ZXh0KTtcblx0XHRcdHJlc3VsdC5jdXN0b20gPSBbdGFza107XG5cdFx0fVxuXHRcdHJlc3VsdC5jdXN0b20gPSByZXN1bHQuY3VzdG9tIHx8IFtdO1xuXHRcdHJlc3VsdC5jb25maWd1cmVkID0gcmVzdWx0LmNvbmZpZ3VyZWQgfHwgW107XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jb25zdCB1dWlkTWFwczogTWFwPFRhc2tDb25maWdTb3VyY2UsIE1hcDxzdHJpbmcsIFVVSURNYXA+PiA9IG5ldyBNYXAoKTtcbmNvbnN0IHJlY2VudFV1aWRNYXBzOiBNYXA8VGFza0NvbmZpZ1NvdXJjZSwgTWFwPHN0cmluZywgVVVJRE1hcD4+ID0gbmV3IE1hcCgpO1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciwgd29ya3NwYWNlOiBJV29ya3NwYWNlIHwgdW5kZWZpbmVkLCBwbGF0Zm9ybTogUGxhdGZvcm0sIGNvbmZpZ3VyYXRpb246IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uLCBsb2dnZXI6IElQcm9ibGVtUmVwb3J0ZXIsIHNvdXJjZTogVGFza0NvbmZpZ1NvdXJjZSwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgaXNSZWNlbnRzOiBib29sZWFuID0gZmFsc2UpOiBJUGFyc2VSZXN1bHQge1xuXHRjb25zdCByZWNlbnRPck90aGVyTWFwcyA9IGlzUmVjZW50cyA/IHJlY2VudFV1aWRNYXBzIDogdXVpZE1hcHM7XG5cdGxldCBzZWxlY3RlZFV1aWRNYXBzID0gcmVjZW50T3JPdGhlck1hcHMuZ2V0KHNvdXJjZSk7XG5cdGlmICghc2VsZWN0ZWRVdWlkTWFwcykge1xuXHRcdHJlY2VudE9yT3RoZXJNYXBzLnNldChzb3VyY2UsIG5ldyBNYXAoKSk7XG5cdFx0c2VsZWN0ZWRVdWlkTWFwcyA9IHJlY2VudE9yT3RoZXJNYXBzLmdldChzb3VyY2UpITtcblx0fVxuXHRsZXQgdXVpZE1hcCA9IHNlbGVjdGVkVXVpZE1hcHMuZ2V0KHdvcmtzcGFjZUZvbGRlci51cmkudG9TdHJpbmcoKSk7XG5cdGlmICghdXVpZE1hcCkge1xuXHRcdHV1aWRNYXAgPSBuZXcgVVVJRE1hcCgpO1xuXHRcdHNlbGVjdGVkVXVpZE1hcHMuc2V0KHdvcmtzcGFjZUZvbGRlci51cmkudG9TdHJpbmcoKSwgdXVpZE1hcCk7XG5cdH1cblx0dHJ5IHtcblx0XHR1dWlkTWFwLnN0YXJ0KCk7XG5cdFx0cmV0dXJuIChuZXcgQ29uZmlndXJhdGlvblBhcnNlcih3b3Jrc3BhY2VGb2xkZXIsIHdvcmtzcGFjZSwgcGxhdGZvcm0sIGxvZ2dlciwgdXVpZE1hcCkpLnJ1bihjb25maWd1cmF0aW9uLCBzb3VyY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fSBmaW5hbGx5IHtcblx0XHR1dWlkTWFwLmZpbmlzaCgpO1xuXHR9XG59XG5cblxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ3VzdG9tVGFzayhjb250cmlidXRlZFRhc2s6IFRhc2tzLkNvbnRyaWJ1dGVkVGFzaywgY29uZmlndXJlZFByb3BzOiBUYXNrcy5Db25maWd1cmluZ1Rhc2sgfCBUYXNrcy5DdXN0b21UYXNrKTogVGFza3MuQ3VzdG9tVGFzayB7XG5cdHJldHVybiBDdXN0b21UYXNrLmNyZWF0ZUN1c3RvbVRhc2soY29udHJpYnV0ZWRUYXNrLCBjb25maWd1cmVkUHJvcHMpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBRXJCLFlBQVksYUFBYTtBQUd6QixTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFdBQVc7QUFDdkIsWUFBWSxVQUFVO0FBR3RCO0FBQUEsRUFDdUI7QUFBQSxFQUN0QjtBQUFBLEVBQXVCO0FBQUEsT0FDakI7QUFHUCxZQUFZLFdBQVc7QUFDdkIsU0FBa0MsOEJBQThCO0FBR2hFLFNBQVMsZ0NBQWdDLHdDQUF3QztBQUcxRSxJQUFXLGVBQVgsa0JBQVdBLGtCQUFYO0FBSU4sRUFBQUEsNEJBQUEsWUFBUyxLQUFUO0FBS0EsRUFBQUEsNEJBQUEsWUFBUyxLQUFUO0FBS0EsRUFBQUEsNEJBQUEsVUFBTyxLQUFQO0FBZGlCLFNBQUFBO0FBQUEsR0FBQTtBQWlJWCxJQUFVO0FBQUEsQ0FBVixDQUFVQyxxQkFBVjtBQUNDLFdBQVMsR0FBRyxPQUEwQztBQUM1RCxVQUFNLFlBQTZCO0FBQ25DLFdBQU8sY0FBYyxVQUFhLE1BQU0sU0FBVSxNQUEwQixJQUFJO0FBQUEsRUFDakY7QUFITyxFQUFBQSxpQkFBUztBQUFBLEdBREE7QUE2RVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsbUJBQVY7QUFDQyxXQUFTLE1BQU1DLFFBQThCO0FBQ25ELFFBQUksTUFBTSxTQUFTQSxNQUFLLEdBQUc7QUFDMUIsYUFBT0E7QUFBQSxJQUNSLFdBQVcsTUFBTSxjQUFjQSxNQUFLLEdBQUc7QUFDdEMsYUFBT0EsT0FBTSxLQUFLLEdBQUc7QUFBQSxJQUN0QixPQUFPO0FBQ04s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dkQsTUFBSSxtQkFBbUIsa0JBQWtCLElBQUksTUFBTTtBQUNuRCxNQUFJLENBQUMsa0JBQWtCO0FBQ3RCLHNCQUFrQixJQUFJLFFBQVEsb0JBQUksSUFBSSxDQUFDO0FBQ3ZDLHVCQUFtQixrQkFBa0IsSUFBSSxNQUFNO0FBQUEsRUFDaEQ7QUFDQSxNQUFJLFVBQVUsaUJBQWlCLElBQUksZ0JBQWdCLElBQUksU0FBUyxDQUFDO0FBQ2pFLE1BQUksQ0FBQyxTQUFTO0FBQ2IsY0FBVSxJQUFJLFFBQVE7QUFDdEIscUJBQWlCLElBQUksZ0JBQWdCLElBQUksU0FBUyxHQUFHLE9BQU87QUFBQSxFQUM3RDtBQUNBLE1BQUk7QUFDSCxZQUFRLE1BQU07QUFDZCxXQUFRLElBQUksb0JBQW9CLGlCQUFpQixXQUFXLFVBQVUsUUFBUSxPQUFPLEVBQUcsSUFBSSxlQUFlLFFBQVEsaUJBQWlCO0FBQUEsRUFDckksVUFBRTtBQUNELFlBQVEsT0FBTztBQUFBLEVBQ2hCO0FBQ0Q7QUFJTyxTQUFTLGlCQUFpQixpQkFBd0MsaUJBQTZFO0FBQ3JKLFNBQU8sV0FBVyxpQkFBaUIsaUJBQWlCLGVBQWU7QUFDcEU7IiwKICAibmFtZXMiOiBbIlNoZWxsUXVvdGluZyIsICJJVGFza0lkZW50aWZpZXIiLCAiQ29tbWFuZFN0cmluZyIsICJ2YWx1ZSIsICJQcm9ibGVtTWF0Y2hlcktpbmQiLCAiUnVuT25PcHRpb25zIiwgIlJ1bk9wdGlvbnMiLCAiSW5zdGFuY2VQb2xpY3kiLCAiU2hlbGxDb25maWd1cmF0aW9uIiwgIkNvbW1hbmRPcHRpb25zIiwgIkNvbW1hbmRDb25maWd1cmF0aW9uIiwgIlByZXNlbnRhdGlvbk9wdGlvbnMiLCAicHJvcGVydGllcyIsICJmcm9tIiwgImFzc2lnblByb3BlcnRpZXMiLCAiZmlsbFByb3BlcnRpZXMiLCAiZmlsbERlZmF1bHRzIiwgImZyZWV6ZSIsICJpc0VtcHR5IiwgIlNoZWxsU3RyaW5nIiwgIlByb2JsZW1NYXRjaGVyQ29udmVydGVyIiwgIkdyb3VwS2luZCIsICJUYXNrRGVwZW5kZW5jeSIsICJEZXBlbmRzT3JkZXIiLCAiQ29uZmlndXJhdGlvblByb3BlcnRpZXMiLCAiQ29uZmlndXJpbmdUYXNrIiwgImxhYmVsIiwgIkN1c3RvbVRhc2siLCAiY3JlYXRlQ3VzdG9tVGFzayIsICJUYXNrUGFyc2VyIiwgIkdsb2JhbHMiLCAiRXhlY3V0aW9uRW5naW5lIiwgIkpzb25TY2hlbWFWZXJzaW9uIiwgIlRhc2tDb25maWdTb3VyY2UiXQp9Cg==
