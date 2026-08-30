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
import * as nls from "../../../../nls.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { MenuRegistry, MenuId, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { ProblemMatcherRegistry } from "../common/problemMatcher.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import * as jsonContributionRegistry from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { StatusbarAlignment, IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { Extensions as OutputExt } from "../../../services/output/common/output.js";
import { TaskGroup, TaskSettingId, TASKS_CATEGORY, TASK_RUNNING_STATE, TASK_TERMINAL_ACTIVE, TaskEventKind, rerunTaskIcon, RerunForActiveTerminalCommandId, RerunAllRunningTasksCommandId } from "../common/tasks.js";
import { ITaskService, TaskCommandsRegistered, TaskExecutionSupportedContext } from "../common/taskService.js";
import { Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { RunAutomaticTasks, ManageAutomaticTaskRunning } from "./runAutomaticTasks.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import schemaVersion1 from "../common/jsonSchema_v1.js";
import schemaVersion2, { updateProblemMatchers, updateTaskDefinitions } from "../common/jsonSchema_v2.js";
import { AbstractTaskService, ConfigureTaskAction } from "./abstractTaskService.js";
import { tasksSchemaId } from "../../../services/configuration/common/configuration.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { WorkbenchStateContext } from "../../../common/contextkeys.js";
import { Extensions as QuickAccessExtensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { TasksQuickAccessProvider } from "./tasksQuickAccess.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TaskDefinitionRegistry } from "../common/taskDefinitionRegistry.js";
import { TerminalMenuBarGroup } from "../../terminal/browser/terminalMenus.js";
import { isString } from "../../../../base/common/types.js";
import { promiseWithResolvers } from "../../../../base/common/async.js";
import { TerminalContextKeys } from "../../terminal/common/terminalContextKey.js";
import { ITerminalService } from "../../terminal/browser/terminal.js";
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RunAutomaticTasks, LifecyclePhase.Eventually);
registerAction2(ManageAutomaticTaskRunning);
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ManageAutomaticTaskRunning.ID,
    title: ManageAutomaticTaskRunning.LABEL,
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
let TaskStatusBarContributions = class extends Disposable {
  constructor(_taskService, _statusbarService, _progressService) {
    super();
    this._taskService = _taskService;
    this._statusbarService = _statusbarService;
    this._progressService = _progressService;
    this._activeTasksCount = 0;
    this._registerListeners();
  }
  _registerListeners() {
    let promise = void 0;
    let resolve;
    this._register(this._taskService.onDidStateChange((event) => {
      if (event.kind === TaskEventKind.Changed) {
        this._updateRunningTasksStatus();
      }
      if (!this._ignoreEventForUpdateRunningTasksCount(event)) {
        switch (event.kind) {
          case TaskEventKind.Active:
            this._activeTasksCount++;
            if (this._activeTasksCount === 1) {
              if (!promise) {
                ({ promise, resolve } = promiseWithResolvers());
              }
            }
            break;
          case TaskEventKind.Inactive:
            if (this._activeTasksCount > 0) {
              this._activeTasksCount--;
              if (this._activeTasksCount === 0) {
                if (promise && resolve) {
                  resolve();
                }
              }
            }
            break;
          case TaskEventKind.Terminated:
            if (this._activeTasksCount !== 0) {
              this._activeTasksCount = 0;
              if (promise && resolve) {
                resolve();
              }
            }
            break;
        }
      }
      if (promise && event.kind === TaskEventKind.Active && this._activeTasksCount === 1) {
        this._progressService.withProgress({ location: ProgressLocation.Window, command: "workbench.action.tasks.showTasks" }, (progress) => {
          progress.report({ message: nls.localize("building", "Building...") });
          return promise;
        }).then(() => {
          promise = void 0;
        });
      }
    }));
  }
  async _updateRunningTasksStatus() {
    const tasks = await this._taskService.getActiveTasks();
    if (tasks.length === 0) {
      if (this._runningTasksStatusItem) {
        this._runningTasksStatusItem.dispose();
        this._runningTasksStatusItem = void 0;
      }
    } else {
      const itemProps = {
        name: nls.localize("status.runningTasks", "Running Tasks"),
        text: `$(tools) ${tasks.length}`,
        ariaLabel: nls.localize("numberOfRunningTasks", "{0} running tasks", tasks.length),
        tooltip: nls.localize("runningTasks", "Show Running Tasks"),
        command: "workbench.action.tasks.showTasks"
      };
      if (!this._runningTasksStatusItem) {
        this._runningTasksStatusItem = this._statusbarService.addEntry(itemProps, "status.runningTasks", StatusbarAlignment.LEFT, { location: { id: "status.problems", priority: 50 }, alignment: StatusbarAlignment.RIGHT });
      } else {
        this._runningTasksStatusItem.update(itemProps);
      }
    }
  }
  _ignoreEventForUpdateRunningTasksCount(event) {
    if (!this._taskService.inTerminal() || event.kind === TaskEventKind.Changed) {
      return false;
    }
    if ((isString(event.group) ? event.group : event.group?._id) !== TaskGroup.Build._id) {
      return true;
    }
    return event.__task.configurationProperties.problemMatchers === void 0 || event.__task.configurationProperties.problemMatchers.length === 0;
  }
};
TaskStatusBarContributions = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, IProgressService)
], TaskStatusBarContributions);
workbenchRegistry.registerWorkbenchContribution(TaskStatusBarContributions, LifecyclePhase.Restored);
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Run,
  command: {
    id: "workbench.action.tasks.runTask",
    title: nls.localize({ key: "miRunTask", comment: ["&& denotes a mnemonic"] }, "&&Run Task...")
  },
  order: 1,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Run,
  command: {
    id: "workbench.action.tasks.build",
    title: nls.localize({ key: "miBuildTask", comment: ["&& denotes a mnemonic"] }, "Run &&Build Task...")
  },
  order: 2,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Manage,
  command: {
    precondition: TASK_RUNNING_STATE,
    id: "workbench.action.tasks.showTasks",
    title: nls.localize({ key: "miRunningTask", comment: ["&& denotes a mnemonic"] }, "Show Runnin&&g Tasks...")
  },
  order: 1,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Manage,
  command: {
    precondition: TASK_RUNNING_STATE,
    id: "workbench.action.tasks.restartTask",
    title: nls.localize({ key: "miRestartTask", comment: ["&& denotes a mnemonic"] }, "R&&estart Running Task...")
  },
  order: 2,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Manage,
  command: {
    precondition: TASK_RUNNING_STATE,
    id: "workbench.action.tasks.terminate",
    title: nls.localize({ key: "miTerminateTask", comment: ["&& denotes a mnemonic"] }, "&&Terminate Task...")
  },
  order: 3,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Configure,
  command: {
    id: "workbench.action.tasks.configureTaskRunner",
    title: nls.localize({ key: "miConfigureTask", comment: ["&& denotes a mnemonic"] }, "&&Configure Tasks...")
  },
  order: 1,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Configure,
  command: {
    id: "workbench.action.tasks.configureDefaultBuildTask",
    title: nls.localize({ key: "miConfigureBuildTask", comment: ["&& denotes a mnemonic"] }, "Configure De&&fault Build Task...")
  },
  order: 2,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.openWorkspaceFileTasks",
    title: nls.localize2("workbench.action.tasks.openWorkspaceFileTasks", "Open Workspace Tasks"),
    category: TASKS_CATEGORY
  },
  when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), TaskExecutionSupportedContext)
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ConfigureTaskAction.ID,
    title: ConfigureTaskAction.TEXT,
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.showLog",
    title: nls.localize2("ShowLogAction.label", "Show Task Log"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.runTask",
    title: nls.localize2("RunTaskAction.label", "Run Task"),
    category: TASKS_CATEGORY
  }
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.reRunTask",
    title: nls.localize2("ReRunTaskAction.label", "Rerun Last Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.restartTask",
    title: nls.localize2("RestartTaskAction.label", "Restart Running Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: RerunAllRunningTasksCommandId,
    title: nls.localize2("RerunAllRunningTasksAction.label", "Rerun All Running Tasks"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.showTasks",
    title: nls.localize2("ShowTasksAction.label", "Show Running Tasks"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.terminate",
    title: nls.localize2("TerminateAction.label", "Terminate Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.build",
    title: nls.localize2("BuildAction.label", "Run Build Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.test",
    title: nls.localize2("TestAction.label", "Run Test Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.configureDefaultBuildTask",
    title: nls.localize2("ConfigureDefaultBuildTask.label", "Configure Default Build Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.configureDefaultTestTask",
    title: nls.localize2("ConfigureDefaultTestTask.label", "Configure Default Test Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.openUserTasks",
    title: nls.localize2("workbench.action.tasks.openUserTasks", "Open User Tasks"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
class UserTasksGlobalActionContribution extends Disposable {
  constructor() {
    super();
    this.registerActions();
  }
  registerActions() {
    const id = "workbench.action.tasks.openUserTasks";
    const title = nls.localize("tasks", "Tasks");
    this._register(MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
      command: {
        id,
        title
      },
      when: TaskExecutionSupportedContext,
      group: "2_configuration",
      order: 6
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
      command: {
        id,
        title
      },
      when: TaskExecutionSupportedContext,
      group: "2_configuration",
      order: 6
    }));
  }
}
workbenchRegistry.registerWorkbenchContribution(UserTasksGlobalActionContribution, LifecyclePhase.Restored);
KeybindingsRegistry.registerKeybindingRule({
  id: "workbench.action.tasks.build",
  weight: KeybindingWeight.WorkbenchContrib,
  when: TaskCommandsRegistered,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB
});
const outputChannelRegistry = Registry.as(OutputExt.OutputChannels);
outputChannelRegistry.registerChannel({ id: AbstractTaskService.OutputChannelId, label: AbstractTaskService.OutputChannelLabel, log: false });
const quickAccessRegistry = Registry.as(QuickAccessExtensions.Quickaccess);
const tasksPickerContextKey = "inTasksPicker";
quickAccessRegistry.registerQuickAccessProvider({
  ctor: TasksQuickAccessProvider,
  prefix: TasksQuickAccessProvider.PREFIX,
  contextKey: tasksPickerContextKey,
  placeholder: nls.localize("tasksQuickAccessPlaceholder", "Type the name of a task to run."),
  helpEntries: [{ description: nls.localize("tasksQuickAccessHelp", "Run Task"), commandCenterOrder: 60 }]
});
const schema = {
  id: tasksSchemaId,
  description: "Task definition file",
  type: "object",
  allowTrailingCommas: true,
  allowComments: true,
  default: {
    version: "2.0.0",
    tasks: [
      {
        label: "My Task",
        command: "echo hello",
        type: "shell",
        args: [],
        problemMatcher: ["$tsc"],
        presentation: {
          reveal: "always"
        },
        group: "build"
      }
    ]
  }
};
schema.definitions = {
  ...schemaVersion1.definitions,
  ...schemaVersion2.definitions
};
schema.oneOf = [...schemaVersion2.oneOf || [], ...schemaVersion1.oneOf || []];
const jsonRegistry = Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(tasksSchemaId, schema);
class TaskRegistryContribution extends Disposable {
  constructor() {
    super();
    this._register(ProblemMatcherRegistry.onMatcherChanged(() => {
      updateProblemMatchers();
      jsonRegistry.notifySchemaChanged(tasksSchemaId);
    }));
    this._register(TaskDefinitionRegistry.onDefinitionsChanged(() => {
      updateTaskDefinitions();
      jsonRegistry.notifySchemaChanged(tasksSchemaId);
    }));
  }
}
TaskRegistryContribution.ID = "taskRegistryContribution";
registerWorkbenchContribution2(TaskRegistryContribution.ID, TaskRegistryContribution, WorkbenchPhase.AfterRestored);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "task",
  order: 100,
  title: nls.localize("tasksConfigurationTitle", "Tasks"),
  type: "object",
  properties: {
    [TaskSettingId.ProblemMatchersNeverPrompt]: {
      markdownDescription: nls.localize("task.problemMatchers.neverPrompt", "Configures whether to show the problem matcher prompt when running a task. Set to `true` to never prompt, or use a dictionary of task types to turn off prompting only for specific task types."),
      "oneOf": [
        {
          type: "boolean",
          markdownDescription: nls.localize("task.problemMatchers.neverPrompt.boolean", "Sets problem matcher prompting behavior for all tasks.")
        },
        {
          type: "object",
          patternProperties: {
            ".*": {
              type: "boolean"
            }
          },
          markdownDescription: nls.localize("task.problemMatchers.neverPrompt.array", "An object containing task type-boolean pairs to never prompt for problem matchers on."),
          default: {
            "shell": true
          }
        }
      ],
      default: false
    },
    [TaskSettingId.AutoDetect]: {
      markdownDescription: nls.localize("task.autoDetect", "Controls enablement of `provideTasks` for all task provider extension. If the Tasks: Run Task command is slow, disabling auto detect for task providers may help. Individual extensions may also provide settings that disable auto detection."),
      type: "string",
      enum: ["on", "off"],
      default: "on"
    },
    [TaskSettingId.SlowProviderWarning]: {
      markdownDescription: nls.localize("task.slowProviderWarning", "Configures whether a warning is shown when a provider is slow"),
      "oneOf": [
        {
          type: "boolean",
          markdownDescription: nls.localize("task.slowProviderWarning.boolean", "Sets the slow provider warning for all tasks.")
        },
        {
          type: "array",
          items: {
            type: "string",
            markdownDescription: nls.localize("task.slowProviderWarning.array", "An array of task types to never show the slow provider warning.")
          }
        }
      ],
      default: true
    },
    [TaskSettingId.QuickOpenHistory]: {
      markdownDescription: nls.localize("task.quickOpen.history", "Controls the number of recent items tracked in task quick open dialog."),
      type: "number",
      default: 30,
      minimum: 0,
      maximum: 30
    },
    [TaskSettingId.QuickOpenDetail]: {
      markdownDescription: nls.localize("task.quickOpen.detail", "Controls whether to show the task detail for tasks that have a detail in task quick picks, such as Run Task."),
      type: "boolean",
      default: true
    },
    [TaskSettingId.QuickOpenSkip]: {
      type: "boolean",
      description: nls.localize("task.quickOpen.skip", "Controls whether the task quick pick is skipped when there is only one task to pick from."),
      default: false
    },
    [TaskSettingId.QuickOpenShowAll]: {
      type: "boolean",
      description: nls.localize("task.quickOpen.showAll", 'Causes the Tasks: Run Task command to use the slower "show all" behavior instead of the faster two level picker where tasks are grouped by provider.'),
      default: false
    },
    [TaskSettingId.AllowAutomaticTasks]: {
      type: "string",
      enum: ["on", "off"],
      enumDescriptions: [
        nls.localize("task.allowAutomaticTasks.on", "Always"),
        nls.localize("task.allowAutomaticTasks.off", "Never")
      ],
      description: nls.localize("task.allowAutomaticTasks", "Enable automatic tasks - note that tasks won't run in an untrusted workspace."),
      default: "off",
      scope: ConfigurationScope.APPLICATION,
      restricted: true
    },
    [TaskSettingId.Reconnection]: {
      type: "boolean",
      description: nls.localize("task.reconnection", "On window reload, reconnect to tasks that have problem matchers."),
      default: true
    },
    [TaskSettingId.SaveBeforeRun]: {
      markdownDescription: nls.localize(
        "task.saveBeforeRun",
        "Save all dirty editors before running a task."
      ),
      type: "string",
      enum: ["always", "never", "prompt"],
      enumDescriptions: [
        nls.localize("task.saveBeforeRun.always", "Always saves all editors before running."),
        nls.localize("task.saveBeforeRun.never", "Never saves editors before running."),
        nls.localize("task.SaveBeforeRun.prompt", "Prompts whether to save editors before running.")
      ],
      default: "always"
    },
    [TaskSettingId.NotifyWindowOnTaskCompletion]: {
      type: "integer",
      markdownDescription: nls.localize("task.NotifyWindowOnTaskCompletion", "Controls the minimum task runtime in milliseconds before showing an OS notification when the task finishes while the window is not in focus. Set to -1 to disable notifications. Set to 0 to always show notifications. This includes a window badge as well as notification toast."),
      default: 6e4,
      minimum: -1,
      agentsWindow: { default: -1 }
    },
    [TaskSettingId.VerboseLogging]: {
      type: "boolean",
      description: nls.localize("task.verboseLogging", "Enable verbose logging for tasks."),
      default: false
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RerunForActiveTerminalCommandId,
      icon: rerunTaskIcon,
      title: nls.localize2("workbench.action.tasks.rerunForActiveTerminal", "Rerun Task"),
      precondition: TASK_TERMINAL_ACTIVE,
      menu: [{ id: MenuId.TerminalInstanceContext, when: TASK_TERMINAL_ACTIVE }],
      keybinding: {
        when: TerminalContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
        mac: {
          primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyR
        },
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async run(accessor, args) {
    const terminalService = accessor.get(ITerminalService);
    const taskSystem = accessor.get(ITaskService);
    const instance = args ?? terminalService.activeInstance;
    if (instance) {
      await taskSystem.rerun(instance.instanceId);
    }
  }
});
export {
  TaskRegistryContribution,
  TaskStatusBarContributions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxicm93c2VyXFx0YXNrLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5LCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuXG5pbXBvcnQgeyBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL3Byb2JsZW1NYXRjaGVyLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuXG5pbXBvcnQgKiBhcyBqc29uQ29udHJpYnV0aW9uUmVnaXN0cnkgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuXG5pbXBvcnQgeyBTdGF0dXNiYXJBbGlnbm1lbnQsIElTdGF0dXNiYXJTZXJ2aWNlLCBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhckVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcblxuaW1wb3J0IHsgSU91dHB1dENoYW5uZWxSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBPdXRwdXRFeHQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5cbmltcG9ydCB7IElUYXNrRXZlbnQsIFRhc2tHcm91cCwgVGFza1NldHRpbmdJZCwgVEFTS1NfQ0FURUdPUlksIFRBU0tfUlVOTklOR19TVEFURSwgVEFTS19URVJNSU5BTF9BQ1RJVkUsIFRhc2tFdmVudEtpbmQsIHJlcnVuVGFza0ljb24sIFJlcnVuRm9yQWN0aXZlVGVybWluYWxDb21tYW5kSWQsIFJlcnVuQWxsUnVubmluZ1Rhc2tzQ29tbWFuZElkIH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tzLmpzJztcbmltcG9ydCB7IElUYXNrU2VydmljZSwgVGFza0NvbW1hbmRzUmVnaXN0ZXJlZCwgVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQgfSBmcm9tICcuLi9jb21tb24vdGFza1NlcnZpY2UuanMnO1xuXG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIElXb3JrYmVuY2hDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBSdW5BdXRvbWF0aWNUYXNrcywgTWFuYWdlQXV0b21hdGljVGFza1J1bm5pbmcgfSBmcm9tICcuL3J1bkF1dG9tYXRpY1Rhc2tzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCBzY2hlbWFWZXJzaW9uMSBmcm9tICcuLi9jb21tb24vanNvblNjaGVtYV92MS5qcyc7XG5pbXBvcnQgc2NoZW1hVmVyc2lvbjIsIHsgdXBkYXRlUHJvYmxlbU1hdGNoZXJzLCB1cGRhdGVUYXNrRGVmaW5pdGlvbnMgfSBmcm9tICcuLi9jb21tb24vanNvblNjaGVtYV92Mi5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRhc2tTZXJ2aWNlLCBDb25maWd1cmVUYXNrQWN0aW9uIH0gZnJvbSAnLi9hYnN0cmFjdFRhc2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRhc2tzU2NoZW1hSWQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hTdGF0ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVF1aWNrQWNjZXNzUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgUXVpY2tBY2Nlc3NFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgVGFza3NRdWlja0FjY2Vzc1Byb3ZpZGVyIH0gZnJvbSAnLi90YXNrc1F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tEZWZpbml0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGVybWluYWxNZW51QmFyR3JvdXAgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsTWVudXMuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBwcm9taXNlV2l0aFJlc29sdmVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuaW1wb3J0IHsgVGVybWluYWxDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbENvbnRleHRLZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcblxuY29uc3Qgd29ya2JlbmNoUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihSdW5BdXRvbWF0aWNUYXNrcywgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihNYW5hZ2VBdXRvbWF0aWNUYXNrUnVubmluZyk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogTWFuYWdlQXV0b21hdGljVGFza1J1bm5pbmcuSUQsXG5cdFx0dGl0bGU6IE1hbmFnZUF1dG9tYXRpY1Rhc2tSdW5uaW5nLkxBQkVMLFxuXHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5cbmV4cG9ydCBjbGFzcyBUYXNrU3RhdHVzQmFyQ29udHJpYnV0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSBfcnVubmluZ1Rhc2tzU3RhdHVzSXRlbTogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjdGl2ZVRhc2tzQ291bnQ6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUYXNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90YXNrU2VydmljZTogSVRhc2tTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0bGV0IHByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IHJlc29sdmU6ICh2YWx1ZT86IHZvaWQgfCBUaGVuYWJsZTx2b2lkPikgPT4gdm9pZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90YXNrU2VydmljZS5vbkRpZFN0YXRlQ2hhbmdlKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5raW5kID09PSBUYXNrRXZlbnRLaW5kLkNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlUnVubmluZ1Rhc2tzU3RhdHVzKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5faWdub3JlRXZlbnRGb3JVcGRhdGVSdW5uaW5nVGFza3NDb3VudChldmVudCkpIHtcblx0XHRcdFx0c3dpdGNoIChldmVudC5raW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSBUYXNrRXZlbnRLaW5kLkFjdGl2ZTpcblx0XHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVRhc2tzQ291bnQrKztcblx0XHRcdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVUYXNrc0NvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghcHJvbWlzZSkge1xuXHRcdFx0XHRcdFx0XHRcdCh7IHByb21pc2UsIHJlc29sdmUgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzPHZvaWQ+KCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFRhc2tFdmVudEtpbmQuSW5hY3RpdmU6XG5cdFx0XHRcdFx0XHQvLyBTaW5jZSB0aGUgZXhpdGluZyBvZiB0aGUgc3ViIHByb2Nlc3MgaXMgY29tbXVuaWNhdGVkIGFzeW5jIHdlIGNhbid0IG9yZGVyIGluYWN0aXZlIGFuZCB0ZXJtaW5hdGUgZXZlbnRzLlxuXHRcdFx0XHRcdFx0Ly8gU28gdHJ5IHRvIHRyZWF0IHRoZW0gYWNjb3JkaW5nbHkuXG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlVGFza3NDb3VudCA+IDApIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fYWN0aXZlVGFza3NDb3VudC0tO1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlVGFza3NDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChwcm9taXNlICYmIHJlc29sdmUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJlc29sdmUhKCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFRhc2tFdmVudEtpbmQuVGVybWluYXRlZDpcblx0XHRcdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVUYXNrc0NvdW50ICE9PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVRhc2tzQ291bnQgPSAwO1xuXHRcdFx0XHRcdFx0XHRpZiAocHJvbWlzZSAmJiByZXNvbHZlKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb2x2ZSEoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHByb21pc2UgJiYgKGV2ZW50LmtpbmQgPT09IFRhc2tFdmVudEtpbmQuQWN0aXZlKSAmJiAodGhpcy5fYWN0aXZlVGFza3NDb3VudCA9PT0gMSkpIHtcblx0XHRcdFx0dGhpcy5fcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdywgY29tbWFuZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Muc2hvd1Rhc2tzJyB9LCBwcm9ncmVzcyA9PiB7XG5cdFx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbmxzLmxvY2FsaXplKCdidWlsZGluZycsICdCdWlsZGluZy4uLicpIH0pO1xuXHRcdFx0XHRcdHJldHVybiBwcm9taXNlITtcblx0XHRcdFx0fSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0cHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlUnVubmluZ1Rhc2tzU3RhdHVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhc2tzID0gYXdhaXQgdGhpcy5fdGFza1NlcnZpY2UuZ2V0QWN0aXZlVGFza3MoKTtcblx0XHRpZiAodGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRpZiAodGhpcy5fcnVubmluZ1Rhc2tzU3RhdHVzSXRlbSkge1xuXHRcdFx0XHR0aGlzLl9ydW5uaW5nVGFza3NTdGF0dXNJdGVtLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fcnVubmluZ1Rhc2tzU3RhdHVzSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaXRlbVByb3BzOiBJU3RhdHVzYmFyRW50cnkgPSB7XG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZSgnc3RhdHVzLnJ1bm5pbmdUYXNrcycsIFwiUnVubmluZyBUYXNrc1wiKSxcblx0XHRcdFx0dGV4dDogYCQodG9vbHMpICR7dGFza3MubGVuZ3RofWAsXG5cdFx0XHRcdGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCdudW1iZXJPZlJ1bm5pbmdUYXNrcycsIFwiezB9IHJ1bm5pbmcgdGFza3NcIiwgdGFza3MubGVuZ3RoKSxcblx0XHRcdFx0dG9vbHRpcDogbmxzLmxvY2FsaXplKCdydW5uaW5nVGFza3MnLCBcIlNob3cgUnVubmluZyBUYXNrc1wiKSxcblx0XHRcdFx0Y29tbWFuZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Muc2hvd1Rhc2tzJyxcblx0XHRcdH07XG5cblx0XHRcdGlmICghdGhpcy5fcnVubmluZ1Rhc2tzU3RhdHVzSXRlbSkge1xuXHRcdFx0XHR0aGlzLl9ydW5uaW5nVGFza3NTdGF0dXNJdGVtID0gdGhpcy5fc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShpdGVtUHJvcHMsICdzdGF0dXMucnVubmluZ1Rhc2tzJywgU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQsIHsgbG9jYXRpb246IHsgaWQ6ICdzdGF0dXMucHJvYmxlbXMnLCBwcmlvcml0eTogNTAgfSwgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9ydW5uaW5nVGFza3NTdGF0dXNJdGVtLnVwZGF0ZShpdGVtUHJvcHMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lnbm9yZUV2ZW50Rm9yVXBkYXRlUnVubmluZ1Rhc2tzQ291bnQoZXZlbnQ6IElUYXNrRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3Rhc2tTZXJ2aWNlLmluVGVybWluYWwoKSB8fCBldmVudC5raW5kID09PSBUYXNrRXZlbnRLaW5kLkNoYW5nZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoKGlzU3RyaW5nKGV2ZW50Lmdyb3VwKSA/IGV2ZW50Lmdyb3VwIDogZXZlbnQuZ3JvdXA/Ll9pZCkgIT09IFRhc2tHcm91cC5CdWlsZC5faWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBldmVudC5fX3Rhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzID09PSB1bmRlZmluZWQgfHwgZXZlbnQuX190YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycy5sZW5ndGggPT09IDA7XG5cdH1cbn1cblxud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oVGFza1N0YXR1c0JhckNvbnRyaWJ1dGlvbnMsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyVGVybWluYWxNZW51LCB7XG5cdGdyb3VwOiBUZXJtaW5hbE1lbnVCYXJHcm91cC5SdW4sXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MucnVuVGFzaycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pUnVuVGFzaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJ1biBUYXNrLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSwge1xuXHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuUnVuLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmJ1aWxkJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlCdWlsZFRhc2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiUnVuICYmQnVpbGQgVGFzay4uLlwiKVxuXHR9LFxuXHRvcmRlcjogMixcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuXG4vLyBNYW5hZ2UgVGFza3Ncbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSwge1xuXHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuTWFuYWdlLFxuXHRjb21tYW5kOiB7XG5cdFx0cHJlY29uZGl0aW9uOiBUQVNLX1JVTk5JTkdfU1RBVEUsXG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnNob3dUYXNrcycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pUnVubmluZ1Rhc2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU2hvdyBSdW5uaW4mJmcgVGFza3MuLi5cIilcblx0fSxcblx0b3JkZXI6IDEsXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyVGVybWluYWxNZW51LCB7XG5cdGdyb3VwOiBUZXJtaW5hbE1lbnVCYXJHcm91cC5NYW5hZ2UsXG5cdGNvbW1hbmQ6IHtcblx0XHRwcmVjb25kaXRpb246IFRBU0tfUlVOTklOR19TVEFURSxcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MucmVzdGFydFRhc2snLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVJlc3RhcnRUYXNrJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlImJmVzdGFydCBSdW5uaW5nIFRhc2suLi5cIilcblx0fSxcblx0b3JkZXI6IDIsXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyVGVybWluYWxNZW51LCB7XG5cdGdyb3VwOiBUZXJtaW5hbE1lbnVCYXJHcm91cC5NYW5hZ2UsXG5cdGNvbW1hbmQ6IHtcblx0XHRwcmVjb25kaXRpb246IFRBU0tfUlVOTklOR19TVEFURSxcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MudGVybWluYXRlJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlUZXJtaW5hdGVUYXNrJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVGVybWluYXRlIFRhc2suLi5cIilcblx0fSxcblx0b3JkZXI6IDMsXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcblxuLy8gQ29uZmlndXJlIFRhc2tzXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJUZXJtaW5hbE1lbnUsIHtcblx0Z3JvdXA6IFRlcm1pbmFsTWVudUJhckdyb3VwLkNvbmZpZ3VyZSxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5jb25maWd1cmVUYXNrUnVubmVyJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlDb25maWd1cmVUYXNrJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ29uZmlndXJlIFRhc2tzLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSwge1xuXHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuQ29uZmlndXJlLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmNvbmZpZ3VyZURlZmF1bHRCdWlsZFRhc2snLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUNvbmZpZ3VyZUJ1aWxkVGFzaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJDb25maWd1cmUgRGUmJmZhdWx0IEJ1aWxkIFRhc2suLi5cIilcblx0fSxcblx0b3JkZXI6IDIsXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcblxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Mub3BlbldvcmtzcGFjZUZpbGVUYXNrcycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Mub3BlbldvcmtzcGFjZUZpbGVUYXNrcycsIFwiT3BlbiBXb3Jrc3BhY2UgVGFza3NcIiksXG5cdFx0Y2F0ZWdvcnk6IFRBU0tTX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSwgVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENvbmZpZ3VyZVRhc2tBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IENvbmZpZ3VyZVRhc2tBY3Rpb24uVEVYVCxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnNob3dMb2cnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdTaG93TG9nQWN0aW9uLmxhYmVsJywgXCJTaG93IFRhc2sgTG9nXCIpLFxuXHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MucnVuVGFzaycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1J1blRhc2tBY3Rpb24ubGFiZWwnLCBcIlJ1biBUYXNrXCIpLFxuXHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHR9XG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5yZVJ1blRhc2snLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdSZVJ1blRhc2tBY3Rpb24ubGFiZWwnLCBcIlJlcnVuIExhc3QgVGFza1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJlc3RhcnRUYXNrJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignUmVzdGFydFRhc2tBY3Rpb24ubGFiZWwnLCBcIlJlc3RhcnQgUnVubmluZyBUYXNrXCIpLFxuXHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogUmVydW5BbGxSdW5uaW5nVGFza3NDb21tYW5kSWQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1JlcnVuQWxsUnVubmluZ1Rhc2tzQWN0aW9uLmxhYmVsJywgXCJSZXJ1biBBbGwgUnVubmluZyBUYXNrc1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnNob3dUYXNrcycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1Nob3dUYXNrc0FjdGlvbi5sYWJlbCcsIFwiU2hvdyBSdW5uaW5nIFRhc2tzXCIpLFxuXHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MudGVybWluYXRlJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignVGVybWluYXRlQWN0aW9uLmxhYmVsJywgXCJUZXJtaW5hdGUgVGFza1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmJ1aWxkJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignQnVpbGRBY3Rpb24ubGFiZWwnLCBcIlJ1biBCdWlsZCBUYXNrXCIpLFxuXHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MudGVzdCcsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3RBY3Rpb24ubGFiZWwnLCBcIlJ1biBUZXN0IFRhc2tcIiksXG5cdFx0Y2F0ZWdvcnk6IFRBU0tTX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5jb25maWd1cmVEZWZhdWx0QnVpbGRUYXNrJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignQ29uZmlndXJlRGVmYXVsdEJ1aWxkVGFzay5sYWJlbCcsIFwiQ29uZmlndXJlIERlZmF1bHQgQnVpbGQgVGFza1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmNvbmZpZ3VyZURlZmF1bHRUZXN0VGFzaycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0NvbmZpZ3VyZURlZmF1bHRUZXN0VGFzay5sYWJlbCcsIFwiQ29uZmlndXJlIERlZmF1bHQgVGVzdCBUYXNrXCIpLFxuXHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Mub3BlblVzZXJUYXNrcycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Mub3BlblVzZXJUYXNrcycsIFwiT3BlbiBVc2VyIFRhc2tzXCIpLCBjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuXG5jbGFzcyBVc2VyVGFza3NHbG9iYWxBY3Rpb25Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKSB7XG5cdFx0Y29uc3QgaWQgPSAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5vcGVuVXNlclRhc2tzJztcblx0XHRjb25zdCB0aXRsZSA9IG5scy5sb2NhbGl6ZSgndGFza3MnLCBcIlRhc2tzXCIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuR2xvYmFsQWN0aXZpdHksIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHRpdGxlXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQsXG5cdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRvcmRlcjogNlxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHRpdGxlXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQsXG5cdFx0XHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdFx0XHRvcmRlcjogNlxuXHRcdH0pKTtcblx0fVxufVxud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oVXNlclRhc2tzR2xvYmFsQWN0aW9uQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cbi8vIE1lbnVSZWdpc3RyeS5hZGRDb21tYW5kKCB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5yZWJ1aWxkJywgdGl0bGU6IG5scy5sb2NhbGl6ZSgnUmVidWlsZEFjdGlvbi5sYWJlbCcsICdSdW4gUmVidWlsZCBUYXNrJyksIGNhdGVnb3J5OiB0YXNrc0NhdGVnb3J5IH0pO1xuLy8gTWVudVJlZ2lzdHJ5LmFkZENvbW1hbmQoIHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmNsZWFuJywgdGl0bGU6IG5scy5sb2NhbGl6ZSgnQ2xlYW5BY3Rpb24ubGFiZWwnLCAnUnVuIENsZWFuIFRhc2snKSwgY2F0ZWdvcnk6IHRhc2tzQ2F0ZWdvcnkgfSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5idWlsZCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBUYXNrQ29tbWFuZHNSZWdpc3RlcmVkLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5QlxufSk7XG5cbi8vIFRhc2tzIE91dHB1dCBjaGFubmVsLiBSZWdpc3RlciBpdCBiZWZvcmUgdXNpbmcgaXQgaW4gVGFzayBTZXJ2aWNlLlxuY29uc3Qgb3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SU91dHB1dENoYW5uZWxSZWdpc3RyeT4oT3V0cHV0RXh0Lk91dHB1dENoYW5uZWxzKTtcbm91dHB1dENoYW5uZWxSZWdpc3RyeS5yZWdpc3RlckNoYW5uZWwoeyBpZDogQWJzdHJhY3RUYXNrU2VydmljZS5PdXRwdXRDaGFubmVsSWQsIGxhYmVsOiBBYnN0cmFjdFRhc2tTZXJ2aWNlLk91dHB1dENoYW5uZWxMYWJlbCwgbG9nOiBmYWxzZSB9KTtcblxuXG4vLyBSZWdpc3RlciBRdWljayBBY2Nlc3NcbmNvbnN0IHF1aWNrQWNjZXNzUmVnaXN0cnkgPSAoUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KFF1aWNrQWNjZXNzRXh0ZW5zaW9ucy5RdWlja2FjY2VzcykpO1xuY29uc3QgdGFza3NQaWNrZXJDb250ZXh0S2V5ID0gJ2luVGFza3NQaWNrZXInO1xuXG5xdWlja0FjY2Vzc1JlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcih7XG5cdGN0b3I6IFRhc2tzUXVpY2tBY2Nlc3NQcm92aWRlcixcblx0cHJlZml4OiBUYXNrc1F1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYLFxuXHRjb250ZXh0S2V5OiB0YXNrc1BpY2tlckNvbnRleHRLZXksXG5cdHBsYWNlaG9sZGVyOiBubHMubG9jYWxpemUoJ3Rhc2tzUXVpY2tBY2Nlc3NQbGFjZWhvbGRlcicsIFwiVHlwZSB0aGUgbmFtZSBvZiBhIHRhc2sgdG8gcnVuLlwiKSxcblx0aGVscEVudHJpZXM6IFt7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2tzUXVpY2tBY2Nlc3NIZWxwJywgXCJSdW4gVGFza1wiKSwgY29tbWFuZENlbnRlck9yZGVyOiA2MCB9XVxufSk7XG5cbi8vIHRhc2tzLmpzb24gdmFsaWRhdGlvblxuY29uc3Qgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0aWQ6IHRhc2tzU2NoZW1hSWQsXG5cdGRlc2NyaXB0aW9uOiAnVGFzayBkZWZpbml0aW9uIGZpbGUnLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0YWxsb3dDb21tZW50czogdHJ1ZSxcblx0ZGVmYXVsdDoge1xuXHRcdHZlcnNpb246ICcyLjAuMCcsXG5cdFx0dGFza3M6IFtcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdNeSBUYXNrJyxcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0XHRhcmdzOiBbXSxcblx0XHRcdFx0cHJvYmxlbU1hdGNoZXI6IFsnJHRzYyddLFxuXHRcdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0XHRyZXZlYWw6ICdhbHdheXMnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdyb3VwOiAnYnVpbGQnXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59O1xuXG5zY2hlbWEuZGVmaW5pdGlvbnMgPSB7XG5cdC4uLnNjaGVtYVZlcnNpb24xLmRlZmluaXRpb25zLFxuXHQuLi5zY2hlbWFWZXJzaW9uMi5kZWZpbml0aW9ucyxcbn07XG5zY2hlbWEub25lT2YgPSBbLi4uKHNjaGVtYVZlcnNpb24yLm9uZU9mIHx8IFtdKSwgLi4uKHNjaGVtYVZlcnNpb24xLm9uZU9mIHx8IFtdKV07XG5cbmNvbnN0IGpzb25SZWdpc3RyeSA9IDxqc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuSUpTT05Db250cmlidXRpb25SZWdpc3RyeT5SZWdpc3RyeS5hcyhqc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuRXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcbmpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYSh0YXNrc1NjaGVtYUlkLCBzY2hlbWEpO1xuXG5leHBvcnQgY2xhc3MgVGFza1JlZ2lzdHJ5Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgSUQgPSAndGFza1JlZ2lzdHJ5Q29udHJpYnV0aW9uJztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFByb2JsZW1NYXRjaGVyUmVnaXN0cnkub25NYXRjaGVyQ2hhbmdlZCgoKSA9PiB7XG5cdFx0XHR1cGRhdGVQcm9ibGVtTWF0Y2hlcnMoKTtcblx0XHRcdGpzb25SZWdpc3RyeS5ub3RpZnlTY2hlbWFDaGFuZ2VkKHRhc2tzU2NoZW1hSWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFRhc2tEZWZpbml0aW9uUmVnaXN0cnkub25EZWZpbml0aW9uc0NoYW5nZWQoKCkgPT4ge1xuXHRcdFx0dXBkYXRlVGFza0RlZmluaXRpb25zKCk7XG5cdFx0XHRqc29uUmVnaXN0cnkubm90aWZ5U2NoZW1hQ2hhbmdlZCh0YXNrc1NjaGVtYUlkKTtcblx0XHR9KSk7XG5cdH1cbn1cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihUYXNrUmVnaXN0cnlDb250cmlidXRpb24uSUQsIFRhc2tSZWdpc3RyeUNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5cblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICd0YXNrJyxcblx0b3JkZXI6IDEwMCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndGFza3NDb25maWd1cmF0aW9uVGl0bGUnLCBcIlRhc2tzXCIpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdFtUYXNrU2V0dGluZ0lkLlByb2JsZW1NYXRjaGVyc05ldmVyUHJvbXB0XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YXNrLnByb2JsZW1NYXRjaGVycy5uZXZlclByb21wdCcsIFwiQ29uZmlndXJlcyB3aGV0aGVyIHRvIHNob3cgdGhlIHByb2JsZW0gbWF0Y2hlciBwcm9tcHQgd2hlbiBydW5uaW5nIGEgdGFzay4gU2V0IHRvIGB0cnVlYCB0byBuZXZlciBwcm9tcHQsIG9yIHVzZSBhIGRpY3Rpb25hcnkgb2YgdGFzayB0eXBlcyB0byB0dXJuIG9mZiBwcm9tcHRpbmcgb25seSBmb3Igc3BlY2lmaWMgdGFzayB0eXBlcy5cIiksXG5cdFx0XHQnb25lT2YnOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YXNrLnByb2JsZW1NYXRjaGVycy5uZXZlclByb21wdC5ib29sZWFuJywgJ1NldHMgcHJvYmxlbSBtYXRjaGVyIHByb21wdGluZyBiZWhhdmlvciBmb3IgYWxsIHRhc2tzLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwYXR0ZXJuUHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Jy4qJzoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5wcm9ibGVtTWF0Y2hlcnMubmV2ZXJQcm9tcHQuYXJyYXknLCAnQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGFzayB0eXBlLWJvb2xlYW4gcGFpcnMgdG8gbmV2ZXIgcHJvbXB0IGZvciBwcm9ibGVtIG1hdGNoZXJzIG9uLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRcdCdzaGVsbCc6IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0W1Rhc2tTZXR0aW5nSWQuQXV0b0RldGVjdF06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5hdXRvRGV0ZWN0JywgXCJDb250cm9scyBlbmFibGVtZW50IG9mIGBwcm92aWRlVGFza3NgIGZvciBhbGwgdGFzayBwcm92aWRlciBleHRlbnNpb24uIElmIHRoZSBUYXNrczogUnVuIFRhc2sgY29tbWFuZCBpcyBzbG93LCBkaXNhYmxpbmcgYXV0byBkZXRlY3QgZm9yIHRhc2sgcHJvdmlkZXJzIG1heSBoZWxwLiBJbmRpdmlkdWFsIGV4dGVuc2lvbnMgbWF5IGFsc28gcHJvdmlkZSBzZXR0aW5ncyB0aGF0IGRpc2FibGUgYXV0byBkZXRlY3Rpb24uXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ29uJywgJ29mZiddLFxuXHRcdFx0ZGVmYXVsdDogJ29uJ1xuXHRcdH0sXG5cdFx0W1Rhc2tTZXR0aW5nSWQuU2xvd1Byb3ZpZGVyV2FybmluZ106IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5zbG93UHJvdmlkZXJXYXJuaW5nJywgXCJDb25maWd1cmVzIHdoZXRoZXIgYSB3YXJuaW5nIGlzIHNob3duIHdoZW4gYSBwcm92aWRlciBpcyBzbG93XCIpLFxuXHRcdFx0J29uZU9mJzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5zbG93UHJvdmlkZXJXYXJuaW5nLmJvb2xlYW4nLCAnU2V0cyB0aGUgc2xvdyBwcm92aWRlciB3YXJuaW5nIGZvciBhbGwgdGFza3MuJylcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YXNrLnNsb3dQcm92aWRlcldhcm5pbmcuYXJyYXknLCAnQW4gYXJyYXkgb2YgdGFzayB0eXBlcyB0byBuZXZlciBzaG93IHRoZSBzbG93IHByb3ZpZGVyIHdhcm5pbmcuJylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHRbVGFza1NldHRpbmdJZC5RdWlja09wZW5IaXN0b3J5XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YXNrLnF1aWNrT3Blbi5oaXN0b3J5JywgXCJDb250cm9scyB0aGUgbnVtYmVyIG9mIHJlY2VudCBpdGVtcyB0cmFja2VkIGluIHRhc2sgcXVpY2sgb3BlbiBkaWFsb2cuXCIpLFxuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiAzMCwgbWluaW11bTogMCwgbWF4aW11bTogMzBcblx0XHR9LFxuXHRcdFtUYXNrU2V0dGluZ0lkLlF1aWNrT3BlbkRldGFpbF06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5xdWlja09wZW4uZGV0YWlsJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHNob3cgdGhlIHRhc2sgZGV0YWlsIGZvciB0YXNrcyB0aGF0IGhhdmUgYSBkZXRhaWwgaW4gdGFzayBxdWljayBwaWNrcywgc3VjaCBhcyBSdW4gVGFzay5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHRbVGFza1NldHRpbmdJZC5RdWlja09wZW5Ta2lwXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5xdWlja09wZW4uc2tpcCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgdGFzayBxdWljayBwaWNrIGlzIHNraXBwZWQgd2hlbiB0aGVyZSBpcyBvbmx5IG9uZSB0YXNrIHRvIHBpY2sgZnJvbS5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0W1Rhc2tTZXR0aW5nSWQuUXVpY2tPcGVuU2hvd0FsbF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2sucXVpY2tPcGVuLnNob3dBbGwnLCBcIkNhdXNlcyB0aGUgVGFza3M6IFJ1biBUYXNrIGNvbW1hbmQgdG8gdXNlIHRoZSBzbG93ZXIgXFxcInNob3cgYWxsXFxcIiBiZWhhdmlvciBpbnN0ZWFkIG9mIHRoZSBmYXN0ZXIgdHdvIGxldmVsIHBpY2tlciB3aGVyZSB0YXNrcyBhcmUgZ3JvdXBlZCBieSBwcm92aWRlci5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0W1Rhc2tTZXR0aW5nSWQuQWxsb3dBdXRvbWF0aWNUYXNrc106IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydvbicsICdvZmYnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd0YXNrLmFsbG93QXV0b21hdGljVGFza3Mub24nLCBcIkFsd2F5c1wiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd0YXNrLmFsbG93QXV0b21hdGljVGFza3Mub2ZmJywgXCJOZXZlclwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YXNrLmFsbG93QXV0b21hdGljVGFza3MnLCBcIkVuYWJsZSBhdXRvbWF0aWMgdGFza3MgLSBub3RlIHRoYXQgdGFza3Mgd29uJ3QgcnVuIGluIGFuIHVudHJ1c3RlZCB3b3Jrc3BhY2UuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ29mZicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdH0sXG5cdFx0W1Rhc2tTZXR0aW5nSWQuUmVjb25uZWN0aW9uXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5yZWNvbm5lY3Rpb24nLCBcIk9uIHdpbmRvdyByZWxvYWQsIHJlY29ubmVjdCB0byB0YXNrcyB0aGF0IGhhdmUgcHJvYmxlbSBtYXRjaGVycy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHRbVGFza1NldHRpbmdJZC5TYXZlQmVmb3JlUnVuXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQndGFzay5zYXZlQmVmb3JlUnVuJyxcblx0XHRcdFx0J1NhdmUgYWxsIGRpcnR5IGVkaXRvcnMgYmVmb3JlIHJ1bm5pbmcgYSB0YXNrLidcblx0XHRcdCksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYWx3YXlzJywgJ25ldmVyJywgJ3Byb21wdCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3Rhc2suc2F2ZUJlZm9yZVJ1bi5hbHdheXMnLCAnQWx3YXlzIHNhdmVzIGFsbCBlZGl0b3JzIGJlZm9yZSBydW5uaW5nLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3Rhc2suc2F2ZUJlZm9yZVJ1bi5uZXZlcicsICdOZXZlciBzYXZlcyBlZGl0b3JzIGJlZm9yZSBydW5uaW5nLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3Rhc2suU2F2ZUJlZm9yZVJ1bi5wcm9tcHQnLCAnUHJvbXB0cyB3aGV0aGVyIHRvIHNhdmUgZWRpdG9ycyBiZWZvcmUgcnVubmluZy4nKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnYWx3YXlzJyxcblx0XHR9LFxuXHRcdFtUYXNrU2V0dGluZ0lkLk5vdGlmeVdpbmRvd09uVGFza0NvbXBsZXRpb25dOiB7XG5cdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2suTm90aWZ5V2luZG93T25UYXNrQ29tcGxldGlvbicsICdDb250cm9scyB0aGUgbWluaW11bSB0YXNrIHJ1bnRpbWUgaW4gbWlsbGlzZWNvbmRzIGJlZm9yZSBzaG93aW5nIGFuIE9TIG5vdGlmaWNhdGlvbiB3aGVuIHRoZSB0YXNrIGZpbmlzaGVzIHdoaWxlIHRoZSB3aW5kb3cgaXMgbm90IGluIGZvY3VzLiBTZXQgdG8gLTEgdG8gZGlzYWJsZSBub3RpZmljYXRpb25zLiBTZXQgdG8gMCB0byBhbHdheXMgc2hvdyBub3RpZmljYXRpb25zLiBUaGlzIGluY2x1ZGVzIGEgd2luZG93IGJhZGdlIGFzIHdlbGwgYXMgbm90aWZpY2F0aW9uIHRvYXN0LicpLFxuXHRcdFx0ZGVmYXVsdDogNjAwMDAsXG5cdFx0XHRtaW5pbXVtOiAtMSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiAtMSB9LFxuXHRcdH0sXG5cdFx0W1Rhc2tTZXR0aW5nSWQuVmVyYm9zZUxvZ2dpbmddOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YXNrLnZlcmJvc2VMb2dnaW5nJywgXCJFbmFibGUgdmVyYm9zZSBsb2dnaW5nIGZvciB0YXNrcy5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJlcnVuRm9yQWN0aXZlVGVybWluYWxDb21tYW5kSWQsXG5cdFx0XHRpY29uOiByZXJ1blRhc2tJY29uLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MucmVydW5Gb3JBY3RpdmVUZXJtaW5hbCcsICdSZXJ1biBUYXNrJyksXG5cdFx0XHRwcmVjb25kaXRpb246IFRBU0tfVEVSTUlOQUxfQUNUSVZFLFxuXHRcdFx0bWVudTogW3sgaWQ6IE1lbnVJZC5UZXJtaW5hbEluc3RhbmNlQ29udGV4dCwgd2hlbjogVEFTS19URVJNSU5BTF9BQ1RJVkUgfV0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlSLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5UlxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxTZXJ2aWNlKTtcblx0XHRjb25zdCB0YXNrU3lzdGVtID0gYWNjZXNzb3IuZ2V0KElUYXNrU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBhcmdzIGFzIElUZXJtaW5hbEluc3RhbmNlID8/IHRlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdGF3YWl0IHRhc2tTeXN0ZW0ucmVydW4oaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYyxRQUFRLGlCQUFpQixlQUFlO0FBRS9ELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUVuRCxZQUFZLDhCQUE4QjtBQUcxQyxTQUFTLG9CQUFvQix5QkFBbUU7QUFFaEcsU0FBaUMsY0FBYyxpQkFBaUI7QUFFaEUsU0FBcUIsV0FBVyxlQUFlLGdCQUFnQixvQkFBb0Isc0JBQXNCLGVBQWUsZUFBZSxpQ0FBaUMscUNBQXFDO0FBQzdNLFNBQVMsY0FBYyx3QkFBd0IscUNBQXFDO0FBRXBGLFNBQVMsY0FBYyxxQkFBOEUsZ0JBQWdCLHNDQUFzQztBQUMzSixTQUFTLG1CQUFtQixrQ0FBa0M7QUFDOUQsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQVMsUUFBUSxlQUFlO0FBQ2hDLE9BQU8sb0JBQW9CO0FBQzNCLE9BQU8sa0JBQWtCLHVCQUF1Qiw2QkFBNkI7QUFDN0UsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CLGNBQWMsK0JBQXVEO0FBQ2xHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQStCLGNBQWMsNkJBQTZCO0FBQzFFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsMkJBQTJCO0FBRXBDLFNBQTRCLHdCQUF3QjtBQUVwRCxNQUFNLG9CQUFvQixTQUFTLEdBQW9DLG9CQUFvQixTQUFTO0FBQ3BHLGtCQUFrQiw4QkFBOEIsbUJBQW1CLGVBQWUsVUFBVTtBQUU1RixnQkFBZ0IsMEJBQTBCO0FBQzFDLGFBQWEsZUFBZSxPQUFPLGdCQUFnQjtBQUFBLEVBQ2xELFNBQVM7QUFBQSxJQUNSLElBQUksMkJBQTJCO0FBQUEsSUFDL0IsT0FBTywyQkFBMkI7QUFBQSxJQUNsQyxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0EsTUFBTTtBQUNQLENBQUM7QUFFTSxJQUFNLDZCQUFOLGNBQXlDLFdBQTZDO0FBQUEsRUFJNUYsWUFDZ0MsY0FDSyxtQkFDRCxrQkFDbEM7QUFDRCxVQUFNO0FBSnlCO0FBQ0s7QUFDRDtBQUxwQyxTQUFRLG9CQUE0QjtBQVFuQyxTQUFLLG1CQUFtQjtBQUFBLEVBQ3pCO0FBQUEsRUFFUSxxQkFBMkI7QUFDbEMsUUFBSSxVQUFxQztBQUN6QyxRQUFJO0FBQ0osU0FBSyxVQUFVLEtBQUssYUFBYSxpQkFBaUIsV0FBUztBQUMxRCxVQUFJLE1BQU0sU0FBUyxjQUFjLFNBQVM7QUFDekMsYUFBSywwQkFBMEI7QUFBQSxNQUNoQztBQUVBLFVBQUksQ0FBQyxLQUFLLHVDQUF1QyxLQUFLLEdBQUc7QUFDeEQsZ0JBQVEsTUFBTSxNQUFNO0FBQUEsVUFDbkIsS0FBSyxjQUFjO0FBQ2xCLGlCQUFLO0FBQ0wsZ0JBQUksS0FBSyxzQkFBc0IsR0FBRztBQUNqQyxrQkFBSSxDQUFDLFNBQVM7QUFDYixpQkFBQyxFQUFFLFNBQVMsUUFBUSxJQUFJLHFCQUEyQjtBQUFBLGNBQ3BEO0FBQUEsWUFDRDtBQUNBO0FBQUEsVUFDRCxLQUFLLGNBQWM7QUFHbEIsZ0JBQUksS0FBSyxvQkFBb0IsR0FBRztBQUMvQixtQkFBSztBQUNMLGtCQUFJLEtBQUssc0JBQXNCLEdBQUc7QUFDakMsb0JBQUksV0FBVyxTQUFTO0FBQ3ZCLDBCQUFTO0FBQUEsZ0JBQ1Y7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUNBO0FBQUEsVUFDRCxLQUFLLGNBQWM7QUFDbEIsZ0JBQUksS0FBSyxzQkFBc0IsR0FBRztBQUNqQyxtQkFBSyxvQkFBb0I7QUFDekIsa0JBQUksV0FBVyxTQUFTO0FBQ3ZCLHdCQUFTO0FBQUEsY0FDVjtBQUFBLFlBQ0Q7QUFDQTtBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBRUEsVUFBSSxXQUFZLE1BQU0sU0FBUyxjQUFjLFVBQVksS0FBSyxzQkFBc0IsR0FBSTtBQUN2RixhQUFLLGlCQUFpQixhQUFhLEVBQUUsVUFBVSxpQkFBaUIsUUFBUSxTQUFTLG1DQUFtQyxHQUFHLGNBQVk7QUFDbEksbUJBQVMsT0FBTyxFQUFFLFNBQVMsSUFBSSxTQUFTLFlBQVksYUFBYSxFQUFFLENBQUM7QUFDcEUsaUJBQU87QUFBQSxRQUNSLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDYixvQkFBVTtBQUFBLFFBQ1gsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQWMsNEJBQTJDO0FBQ3hELFVBQU0sUUFBUSxNQUFNLEtBQUssYUFBYSxlQUFlO0FBQ3JELFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsVUFBSSxLQUFLLHlCQUF5QjtBQUNqQyxhQUFLLHdCQUF3QixRQUFRO0FBQ3JDLGFBQUssMEJBQTBCO0FBQUEsTUFDaEM7QUFBQSxJQUNELE9BQU87QUFDTixZQUFNLFlBQTZCO0FBQUEsUUFDbEMsTUFBTSxJQUFJLFNBQVMsdUJBQXVCLGVBQWU7QUFBQSxRQUN6RCxNQUFNLFlBQVksTUFBTSxNQUFNO0FBQUEsUUFDOUIsV0FBVyxJQUFJLFNBQVMsd0JBQXdCLHFCQUFxQixNQUFNLE1BQU07QUFBQSxRQUNqRixTQUFTLElBQUksU0FBUyxnQkFBZ0Isb0JBQW9CO0FBQUEsUUFDMUQsU0FBUztBQUFBLE1BQ1Y7QUFFQSxVQUFJLENBQUMsS0FBSyx5QkFBeUI7QUFDbEMsYUFBSywwQkFBMEIsS0FBSyxrQkFBa0IsU0FBUyxXQUFXLHVCQUF1QixtQkFBbUIsTUFBTSxFQUFFLFVBQVUsRUFBRSxJQUFJLG1CQUFtQixVQUFVLEdBQUcsR0FBRyxXQUFXLG1CQUFtQixNQUFNLENBQUM7QUFBQSxNQUNyTixPQUFPO0FBQ04sYUFBSyx3QkFBd0IsT0FBTyxTQUFTO0FBQUEsTUFDOUM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUNBQXVDLE9BQTRCO0FBQzFFLFFBQUksQ0FBQyxLQUFLLGFBQWEsV0FBVyxLQUFLLE1BQU0sU0FBUyxjQUFjLFNBQVM7QUFDNUUsYUFBTztBQUFBLElBQ1I7QUFFQSxTQUFLLFNBQVMsTUFBTSxLQUFLLElBQUksTUFBTSxRQUFRLE1BQU0sT0FBTyxTQUFTLFVBQVUsTUFBTSxLQUFLO0FBQ3JGLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxNQUFNLE9BQU8sd0JBQXdCLG9CQUFvQixVQUFhLE1BQU0sT0FBTyx3QkFBd0IsZ0JBQWdCLFdBQVc7QUFBQSxFQUM5STtBQUNEO0FBcEdhLDZCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTtBQXNHYixrQkFBa0IsOEJBQThCLDRCQUE0QixlQUFlLFFBQVE7QUFFbkcsYUFBYSxlQUFlLE9BQU8scUJBQXFCO0FBQUEsRUFDdkQsT0FBTyxxQkFBcUI7QUFBQSxFQUM1QixTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLElBQUksU0FBUyxFQUFFLEtBQUssYUFBYSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxlQUFlO0FBQUEsRUFDOUY7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLE1BQU07QUFDUCxDQUFDO0FBRUQsYUFBYSxlQUFlLE9BQU8scUJBQXFCO0FBQUEsRUFDdkQsT0FBTyxxQkFBcUI7QUFBQSxFQUM1QixTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLElBQUksU0FBUyxFQUFFLEtBQUssZUFBZSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxxQkFBcUI7QUFBQSxFQUN0RztBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsTUFBTTtBQUNQLENBQUM7QUFHRCxhQUFhLGVBQWUsT0FBTyxxQkFBcUI7QUFBQSxFQUN2RCxPQUFPLHFCQUFxQjtBQUFBLEVBQzVCLFNBQVM7QUFBQSxJQUNSLGNBQWM7QUFBQSxJQUNkLElBQUk7QUFBQSxJQUNKLE9BQU8sSUFBSSxTQUFTLEVBQUUsS0FBSyxpQkFBaUIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcseUJBQXlCO0FBQUEsRUFDNUc7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLE1BQU07QUFDUCxDQUFDO0FBRUQsYUFBYSxlQUFlLE9BQU8scUJBQXFCO0FBQUEsRUFDdkQsT0FBTyxxQkFBcUI7QUFBQSxFQUM1QixTQUFTO0FBQUEsSUFDUixjQUFjO0FBQUEsSUFDZCxJQUFJO0FBQUEsSUFDSixPQUFPLElBQUksU0FBUyxFQUFFLEtBQUssaUJBQWlCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLDJCQUEyQjtBQUFBLEVBQzlHO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQ1AsQ0FBQztBQUVELGFBQWEsZUFBZSxPQUFPLHFCQUFxQjtBQUFBLEVBQ3ZELE9BQU8scUJBQXFCO0FBQUEsRUFDNUIsU0FBUztBQUFBLElBQ1IsY0FBYztBQUFBLElBQ2QsSUFBSTtBQUFBLElBQ0osT0FBTyxJQUFJLFNBQVMsRUFBRSxLQUFLLG1CQUFtQixTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxxQkFBcUI7QUFBQSxFQUMxRztBQUFBLEVBQ0EsT0FBTztBQUFBLEVBQ1AsTUFBTTtBQUNQLENBQUM7QUFHRCxhQUFhLGVBQWUsT0FBTyxxQkFBcUI7QUFBQSxFQUN2RCxPQUFPLHFCQUFxQjtBQUFBLEVBQzVCLFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sSUFBSSxTQUFTLEVBQUUsS0FBSyxtQkFBbUIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsc0JBQXNCO0FBQUEsRUFDM0c7QUFBQSxFQUNBLE9BQU87QUFBQSxFQUNQLE1BQU07QUFDUCxDQUFDO0FBRUQsYUFBYSxlQUFlLE9BQU8scUJBQXFCO0FBQUEsRUFDdkQsT0FBTyxxQkFBcUI7QUFBQSxFQUM1QixTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLElBQUksU0FBUyxFQUFFLEtBQUssd0JBQXdCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLG1DQUFtQztBQUFBLEVBQzdIO0FBQUEsRUFDQSxPQUFPO0FBQUEsRUFDUCxNQUFNO0FBQ1AsQ0FBQztBQUdELGFBQWEsZUFBZSxPQUFPLGdCQUFnQjtBQUFBLEVBQ2xELFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sSUFBSSxVQUFVLGlEQUFpRCxzQkFBc0I7QUFBQSxJQUM1RixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0EsTUFBTSxlQUFlLElBQUksc0JBQXNCLFVBQVUsV0FBVyxHQUFHLDZCQUE2QjtBQUNyRyxDQUFDO0FBRUQsYUFBYSxlQUFlLE9BQU8sZ0JBQWdCO0FBQUEsRUFDbEQsU0FBUztBQUFBLElBQ1IsSUFBSSxvQkFBb0I7QUFBQSxJQUN4QixPQUFPLG9CQUFvQjtBQUFBLElBQzNCLFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQSxNQUFNO0FBQ1AsQ0FBQztBQUNELGFBQWEsZUFBZSxPQUFPLGdCQUFnQjtBQUFBLEVBQ2xELFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sSUFBSSxVQUFVLHVCQUF1QixlQUFlO0FBQUEsSUFDM0QsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBLE1BQU07QUFDUCxDQUFDO0FBQ0QsYUFBYSxlQUFlLE9BQU8sZ0JBQWdCO0FBQUEsRUFDbEQsU0FBUztBQUFBLElBQ1IsSUFBSTtBQUFBLElBQ0osT0FBTyxJQUFJLFVBQVUsdUJBQXVCLFVBQVU7QUFBQSxJQUN0RCxVQUFVO0FBQUEsRUFDWDtBQUNELENBQUM7QUFDRCxhQUFhLGVBQWUsT0FBTyxnQkFBZ0I7QUFBQSxFQUNsRCxTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLElBQUksVUFBVSx5QkFBeUIsaUJBQWlCO0FBQUEsSUFDL0QsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBLE1BQU07QUFDUCxDQUFDO0FBQ0QsYUFBYSxlQUFlLE9BQU8sZ0JBQWdCO0FBQUEsRUFDbEQsU0FBUztBQUFBLElBQ1IsSUFBSTtBQUFBLElBQ0osT0FBTyxJQUFJLFVBQVUsMkJBQTJCLHNCQUFzQjtBQUFBLElBQ3RFLFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQSxNQUFNO0FBQ1AsQ0FBQztBQUNELGFBQWEsZUFBZSxPQUFPLGdCQUFnQjtBQUFBLEVBQ2xELFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sSUFBSSxVQUFVLG9DQUFvQyx5QkFBeUI7QUFBQSxJQUNsRixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0EsTUFBTTtBQUNQLENBQUM7QUFDRCxhQUFhLGVBQWUsT0FBTyxnQkFBZ0I7QUFBQSxFQUNsRCxTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLElBQUksVUFBVSx5QkFBeUIsb0JBQW9CO0FBQUEsSUFDbEUsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBLE1BQU07QUFDUCxDQUFDO0FBQ0QsYUFBYSxlQUFlLE9BQU8sZ0JBQWdCO0FBQUEsRUFDbEQsU0FBUztBQUFBLElBQ1IsSUFBSTtBQUFBLElBQ0osT0FBTyxJQUFJLFVBQVUseUJBQXlCLGdCQUFnQjtBQUFBLElBQzlELFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQSxNQUFNO0FBQ1AsQ0FBQztBQUNELGFBQWEsZUFBZSxPQUFPLGdCQUFnQjtBQUFBLEVBQ2xELFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sSUFBSSxVQUFVLHFCQUFxQixnQkFBZ0I7QUFBQSxJQUMxRCxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0EsTUFBTTtBQUNQLENBQUM7QUFDRCxhQUFhLGVBQWUsT0FBTyxnQkFBZ0I7QUFBQSxFQUNsRCxTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLElBQUksVUFBVSxvQkFBb0IsZUFBZTtBQUFBLElBQ3hELFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQSxNQUFNO0FBQ1AsQ0FBQztBQUNELGFBQWEsZUFBZSxPQUFPLGdCQUFnQjtBQUFBLEVBQ2xELFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sSUFBSSxVQUFVLG1DQUFtQyw4QkFBOEI7QUFBQSxJQUN0RixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0EsTUFBTTtBQUNQLENBQUM7QUFDRCxhQUFhLGVBQWUsT0FBTyxnQkFBZ0I7QUFBQSxFQUNsRCxTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLElBQUksVUFBVSxrQ0FBa0MsNkJBQTZCO0FBQUEsSUFDcEYsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBLE1BQU07QUFDUCxDQUFDO0FBQ0QsYUFBYSxlQUFlLE9BQU8sZ0JBQWdCO0FBQUEsRUFDbEQsU0FBUztBQUFBLElBQ1IsSUFBSTtBQUFBLElBQ0osT0FBTyxJQUFJLFVBQVUsd0NBQXdDLGlCQUFpQjtBQUFBLElBQUcsVUFBVTtBQUFBLEVBQzVGO0FBQUEsRUFDQSxNQUFNO0FBQ1AsQ0FBQztBQUVELE1BQU0sMENBQTBDLFdBQTZDO0FBQUEsRUFFNUYsY0FBYztBQUNiLFVBQU07QUFDTixTQUFLLGdCQUFnQjtBQUFBLEVBQ3RCO0FBQUEsRUFFUSxrQkFBa0I7QUFDekIsVUFBTSxLQUFLO0FBQ1gsVUFBTSxRQUFRLElBQUksU0FBUyxTQUFTLE9BQU87QUFDM0MsU0FBSyxVQUFVLGFBQWEsZUFBZSxPQUFPLGdCQUFnQjtBQUFBLE1BQ2pFLFNBQVM7QUFBQSxRQUNSO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQSxNQUNQLE9BQU87QUFBQSxJQUNSLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxhQUFhLGVBQWUsT0FBTyx3QkFBd0I7QUFBQSxNQUN6RSxTQUFTO0FBQUEsUUFDUjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxNQUFNO0FBQUEsTUFDTixPQUFPO0FBQUEsTUFDUCxPQUFPO0FBQUEsSUFDUixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUFDQSxrQkFBa0IsOEJBQThCLG1DQUFtQyxlQUFlLFFBQVE7QUFLMUcsb0JBQW9CLHVCQUF1QjtBQUFBLEVBQzFDLElBQUk7QUFBQSxFQUNKLFFBQVEsaUJBQWlCO0FBQUEsRUFDekIsTUFBTTtBQUFBLEVBQ04sU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVE7QUFDbEQsQ0FBQztBQUdELE1BQU0sd0JBQXdCLFNBQVMsR0FBMkIsVUFBVSxjQUFjO0FBQzFGLHNCQUFzQixnQkFBZ0IsRUFBRSxJQUFJLG9CQUFvQixpQkFBaUIsT0FBTyxvQkFBb0Isb0JBQW9CLEtBQUssTUFBTSxDQUFDO0FBSTVJLE1BQU0sc0JBQXVCLFNBQVMsR0FBeUIsc0JBQXNCLFdBQVc7QUFDaEcsTUFBTSx3QkFBd0I7QUFFOUIsb0JBQW9CLDRCQUE0QjtBQUFBLEVBQy9DLE1BQU07QUFBQSxFQUNOLFFBQVEseUJBQXlCO0FBQUEsRUFDakMsWUFBWTtBQUFBLEVBQ1osYUFBYSxJQUFJLFNBQVMsK0JBQStCLGlDQUFpQztBQUFBLEVBQzFGLGFBQWEsQ0FBQyxFQUFFLGFBQWEsSUFBSSxTQUFTLHdCQUF3QixVQUFVLEdBQUcsb0JBQW9CLEdBQUcsQ0FBQztBQUN4RyxDQUFDO0FBR0QsTUFBTSxTQUFzQjtBQUFBLEVBQzNCLElBQUk7QUFBQSxFQUNKLGFBQWE7QUFBQSxFQUNiLE1BQU07QUFBQSxFQUNOLHFCQUFxQjtBQUFBLEVBQ3JCLGVBQWU7QUFBQSxFQUNmLFNBQVM7QUFBQSxJQUNSLFNBQVM7QUFBQSxJQUNULE9BQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxPQUFPO0FBQUEsUUFDUCxTQUFTO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixNQUFNLENBQUM7QUFBQSxRQUNQLGdCQUFnQixDQUFDLE1BQU07QUFBQSxRQUN2QixjQUFjO0FBQUEsVUFDYixRQUFRO0FBQUEsUUFDVDtBQUFBLFFBQ0EsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRUEsT0FBTyxjQUFjO0FBQUEsRUFDcEIsR0FBRyxlQUFlO0FBQUEsRUFDbEIsR0FBRyxlQUFlO0FBQ25CO0FBQ0EsT0FBTyxRQUFRLENBQUMsR0FBSSxlQUFlLFNBQVMsQ0FBQyxHQUFJLEdBQUksZUFBZSxTQUFTLENBQUMsQ0FBRTtBQUVoRixNQUFNLGVBQW1FLFNBQVMsR0FBRyx5QkFBeUIsV0FBVyxnQkFBZ0I7QUFDekksYUFBYSxlQUFlLGVBQWUsTUFBTTtBQUUxQyxNQUFNLGlDQUFpQyxXQUE2QztBQUFBLEVBRTFGLGNBQWM7QUFDYixVQUFNO0FBRU4sU0FBSyxVQUFVLHVCQUF1QixpQkFBaUIsTUFBTTtBQUM1RCw0QkFBc0I7QUFDdEIsbUJBQWEsb0JBQW9CLGFBQWE7QUFBQSxJQUMvQyxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsdUJBQXVCLHFCQUFxQixNQUFNO0FBQ2hFLDRCQUFzQjtBQUN0QixtQkFBYSxvQkFBb0IsYUFBYTtBQUFBLElBQy9DLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQWZhLHlCQUNMLEtBQUs7QUFlYiwrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsYUFBYTtBQUdsSCxNQUFNLHdCQUF3QixTQUFTLEdBQTJCLHdCQUF3QixhQUFhO0FBQ3ZHLHNCQUFzQixzQkFBc0I7QUFBQSxFQUMzQyxJQUFJO0FBQUEsRUFDSixPQUFPO0FBQUEsRUFDUCxPQUFPLElBQUksU0FBUywyQkFBMkIsT0FBTztBQUFBLEVBQ3RELE1BQU07QUFBQSxFQUNOLFlBQVk7QUFBQSxJQUNYLENBQUMsY0FBYywwQkFBMEIsR0FBRztBQUFBLE1BQzNDLHFCQUFxQixJQUFJLFNBQVMsb0NBQW9DLGlNQUFpTTtBQUFBLE1BQ3ZRLFNBQVM7QUFBQSxRQUNSO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixxQkFBcUIsSUFBSSxTQUFTLDRDQUE0Qyx3REFBd0Q7QUFBQSxRQUN2STtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLG1CQUFtQjtBQUFBLFlBQ2xCLE1BQU07QUFBQSxjQUNMLE1BQU07QUFBQSxZQUNQO0FBQUEsVUFDRDtBQUFBLFVBQ0EscUJBQXFCLElBQUksU0FBUywwQ0FBMEMsdUZBQXVGO0FBQUEsVUFDbkssU0FBUztBQUFBLFlBQ1IsU0FBUztBQUFBLFVBQ1Y7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsY0FBYyxVQUFVLEdBQUc7QUFBQSxNQUMzQixxQkFBcUIsSUFBSSxTQUFTLG1CQUFtQixnUEFBZ1A7QUFBQSxNQUNyUyxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsTUFBTSxLQUFLO0FBQUEsTUFDbEIsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsY0FBYyxtQkFBbUIsR0FBRztBQUFBLE1BQ3BDLHFCQUFxQixJQUFJLFNBQVMsNEJBQTRCLCtEQUErRDtBQUFBLE1BQzdILFNBQVM7QUFBQSxRQUNSO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixxQkFBcUIsSUFBSSxTQUFTLG9DQUFvQywrQ0FBK0M7QUFBQSxRQUN0SDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLHFCQUFxQixJQUFJLFNBQVMsa0NBQWtDLGlFQUFpRTtBQUFBLFVBQ3RJO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGNBQWMsZ0JBQWdCLEdBQUc7QUFBQSxNQUNqQyxxQkFBcUIsSUFBSSxTQUFTLDBCQUEwQix3RUFBd0U7QUFBQSxNQUNwSSxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFBSSxTQUFTO0FBQUEsTUFBRyxTQUFTO0FBQUEsSUFDbkM7QUFBQSxJQUNBLENBQUMsY0FBYyxlQUFlLEdBQUc7QUFBQSxNQUNoQyxxQkFBcUIsSUFBSSxTQUFTLHlCQUF5Qiw4R0FBOEc7QUFBQSxNQUN6SyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxjQUFjLGFBQWEsR0FBRztBQUFBLE1BQzlCLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLHVCQUF1QiwyRkFBMkY7QUFBQSxNQUM1SSxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxjQUFjLGdCQUFnQixHQUFHO0FBQUEsTUFDakMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsMEJBQTBCLHNKQUF3SjtBQUFBLE1BQzVNLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGNBQWMsbUJBQW1CLEdBQUc7QUFBQSxNQUNwQyxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsTUFBTSxLQUFLO0FBQUEsTUFDbEIsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLCtCQUErQixRQUFRO0FBQUEsUUFDcEQsSUFBSSxTQUFTLGdDQUFnQyxPQUFPO0FBQUEsTUFDckQ7QUFBQSxNQUNBLGFBQWEsSUFBSSxTQUFTLDRCQUE0QiwrRUFBK0U7QUFBQSxNQUNySSxTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLFlBQVk7QUFBQSxJQUNiO0FBQUEsSUFDQSxDQUFDLGNBQWMsWUFBWSxHQUFHO0FBQUEsTUFDN0IsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMscUJBQXFCLGtFQUFrRTtBQUFBLE1BQ2pILFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGNBQWMsYUFBYSxHQUFHO0FBQUEsTUFDOUIscUJBQXFCLElBQUk7QUFBQSxRQUN4QjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsVUFBVSxTQUFTLFFBQVE7QUFBQSxNQUNsQyxrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMsNkJBQTZCLDBDQUEwQztBQUFBLFFBQ3BGLElBQUksU0FBUyw0QkFBNEIscUNBQXFDO0FBQUEsUUFDOUUsSUFBSSxTQUFTLDZCQUE2QixpREFBaUQ7QUFBQSxNQUM1RjtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsY0FBYyw0QkFBNEIsR0FBRztBQUFBLE1BQzdDLE1BQU07QUFBQSxNQUNOLHFCQUFxQixJQUFJLFNBQVMscUNBQXFDLHFSQUFxUjtBQUFBLE1BQzVWLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULGNBQWMsRUFBRSxTQUFTLEdBQUc7QUFBQSxJQUM3QjtBQUFBLElBQ0EsQ0FBQyxjQUFjLGNBQWMsR0FBRztBQUFBLE1BQy9CLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLHVCQUF1QixtQ0FBbUM7QUFBQSxNQUNwRixTQUFTO0FBQUEsSUFDVjtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixPQUFPLElBQUksVUFBVSxpREFBaUQsWUFBWTtBQUFBLE1BQ2xGLGNBQWM7QUFBQSxNQUNkLE1BQU0sQ0FBQyxFQUFFLElBQUksT0FBTyx5QkFBeUIsTUFBTSxxQkFBcUIsQ0FBQztBQUFBLE1BQ3pFLFlBQVk7QUFBQSxRQUNYLE1BQU0sb0JBQW9CO0FBQUEsUUFDMUIsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVE7QUFBQSxRQUNqRCxLQUFLO0FBQUEsVUFDSixTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLFFBQ2xEO0FBQUEsUUFDQSxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsTUFBTSxJQUFJLFVBQTRCLE1BQThCO0FBQ25FLFVBQU0sa0JBQWtCLFNBQVMsSUFBSSxnQkFBZ0I7QUFDckQsVUFBTSxhQUFhLFNBQVMsSUFBSSxZQUFZO0FBQzVDLFVBQU0sV0FBVyxRQUE2QixnQkFBZ0I7QUFDOUQsUUFBSSxVQUFVO0FBQ2IsWUFBTSxXQUFXLE1BQU0sU0FBUyxVQUFVO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
