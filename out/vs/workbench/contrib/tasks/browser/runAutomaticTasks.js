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
import * as resources from "../../../../base/common/resources.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ITaskService } from "../common/taskService.js";
import { RunOnOptions, TaskRunSource, TaskSourceKind, TASKS_CATEGORY } from "../common/tasks.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Action2 } from "../../../../platform/actions/common/actions.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Event } from "../../../../base/common/event.js";
import { ILogService } from "../../../../platform/log/common/log.js";
const HAS_PROMPTED_FOR_AUTOMATIC_TASKS = "task.hasPromptedForAutomaticTasks.v2";
const ALLOW_AUTOMATIC_TASKS = "task.allowAutomaticTasks";
let RunAutomaticTasks = class extends Disposable {
  constructor(_taskService, _configurationService, _workspaceTrustManagementService, _logService, _storageService, _notificationService, _openerService) {
    super();
    this._taskService = _taskService;
    this._configurationService = _configurationService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._logService = _logService;
    this._storageService = _storageService;
    this._notificationService = _notificationService;
    this._openerService = _openerService;
    this._hasRunTasks = false;
    if (this._taskService.isReconnected) {
      this._tryRunTasks();
    } else {
      this._register(Event.once(this._taskService.onDidReconnectToTasks)(async () => await this._tryRunTasks()));
    }
    this._register(this._workspaceTrustManagementService.onDidChangeTrust(async () => await this._tryRunTasks()));
  }
  async _tryRunTasks() {
    if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
      return;
    }
    const { value, userValue } = this._configurationService.inspect(ALLOW_AUTOMATIC_TASKS);
    if (this._hasRunTasks || value === "off" && userValue !== void 0) {
      return;
    }
    this._hasRunTasks = true;
    this._logService.trace("RunAutomaticTasks: Trying to run tasks.");
    if (!this._taskService.hasTaskSystemInfo) {
      this._logService.trace("RunAutomaticTasks: Awaiting task system info.");
      await Event.toPromise(Event.once(this._taskService.onDidChangeTaskSystemInfo));
    }
    let workspaceTasks = await this._taskService.getWorkspaceTasks(TaskRunSource.FolderOpen);
    this._logService.trace(`RunAutomaticTasks: Found ${workspaceTasks.size} automatic tasks`);
    let autoTasks = this._findAutoTasks(this._taskService, workspaceTasks);
    this._logService.trace(`RunAutomaticTasks: taskNames=${JSON.stringify(autoTasks.taskNames)}`);
    if (autoTasks.taskNames.length === 0) {
      const updatedWithinTimeout = await Promise.race([
        new Promise((resolve) => {
          Event.toPromise(Event.once(this._taskService.onDidChangeTaskConfig)).then(() => resolve(true));
        }),
        new Promise((resolve) => {
          const timer = setTimeout(() => {
            clearTimeout(timer);
            resolve(false);
          }, 1e4);
        })
      ]);
      if (!updatedWithinTimeout) {
        this._logService.trace(`RunAutomaticTasks: waited some extra time, but no update of tasks configuration`);
        return;
      }
      workspaceTasks = await this._taskService.getWorkspaceTasks(TaskRunSource.FolderOpen);
      autoTasks = this._findAutoTasks(this._taskService, workspaceTasks);
      this._logService.trace(`RunAutomaticTasks: updated taskNames=${JSON.stringify(autoTasks.taskNames)}`);
    }
    this._runWithPermission(this._taskService, this._configurationService, this._storageService, this._notificationService, this._openerService, autoTasks.tasks, autoTasks.taskNames, autoTasks.locations);
  }
  _runTasks(taskService, tasks) {
    tasks.forEach((task) => {
      if (task instanceof Promise) {
        task.then((promiseResult) => {
          if (promiseResult) {
            taskService.run(promiseResult);
          }
        });
      } else {
        taskService.run(task);
      }
    });
  }
  _getTaskSource(source) {
    const taskKind = TaskSourceKind.toConfigurationTarget(source.kind);
    switch (taskKind) {
      case ConfigurationTarget.WORKSPACE_FOLDER: {
        return resources.joinPath(source.config.workspaceFolder.uri, source.config.file);
      }
      case ConfigurationTarget.WORKSPACE: {
        return source.config.workspace?.configuration ?? void 0;
      }
    }
    return void 0;
  }
  _findAutoTasks(taskService, workspaceTaskResult) {
    const tasks = new Array();
    const taskNames = new Array();
    const locations = /* @__PURE__ */ new Map();
    if (workspaceTaskResult) {
      workspaceTaskResult.forEach((resultElement) => {
        if (resultElement.set) {
          resultElement.set.tasks.forEach((task) => {
            if (task.runOptions.runOn === RunOnOptions.folderOpen) {
              tasks.push(task);
              taskNames.push(task._label);
              const location = this._getTaskSource(task._source);
              if (location) {
                locations.set(location.fsPath, location);
              }
            }
          });
        }
        if (resultElement.configurations) {
          for (const configuredTask of Object.values(resultElement.configurations.byIdentifier)) {
            if (configuredTask.runOptions.runOn === RunOnOptions.folderOpen) {
              tasks.push(new Promise((resolve) => {
                taskService.getTask(resultElement.workspaceFolder, configuredTask._id, true).then((task) => resolve(task));
              }));
              if (configuredTask._label) {
                taskNames.push(configuredTask._label);
              } else {
                taskNames.push(configuredTask.configures.task);
              }
              const location = this._getTaskSource(configuredTask._source);
              if (location) {
                locations.set(location.fsPath, location);
              }
            }
          }
        }
      });
    }
    return { tasks, taskNames, locations };
  }
  async _runWithPermission(taskService, configurationService, storageService, notificationService, openerService, tasks, taskNames, locations) {
    if (taskNames.length === 0) {
      return;
    }
    if (configurationService.getValue(ALLOW_AUTOMATIC_TASKS) === "on") {
      this._runTasks(taskService, tasks);
      return;
    }
    const hasShownPromptForAutomaticTasks = storageService.getBoolean(HAS_PROMPTED_FOR_AUTOMATIC_TASKS, StorageScope.WORKSPACE, false);
    if (hasShownPromptForAutomaticTasks) {
      return;
    }
    const allow = await this._showPrompt(notificationService, storageService, openerService, configurationService, taskNames, locations);
    if (allow) {
      this._runTasks(taskService, tasks);
    }
  }
  _showPrompt(notificationService, storageService, openerService, configurationService, taskNames, locations) {
    return new Promise((resolve) => {
      notificationService.prompt(
        Severity.Info,
        nls.localize(
          "tasks.run.allowAutomatic",
          "This workspace has tasks ({0}) defined ({1}) that can launch processes automatically when you open this workspace. Do you want to allow automatic tasks to run in all trusted workspaces?",
          taskNames.join(", "),
          Array.from(locations.keys()).join(", ")
        ),
        [
          {
            label: nls.localize("allow", "Allow"),
            run: () => {
              resolve(true);
              configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, "on", ConfigurationTarget.USER);
            }
          },
          {
            label: nls.localize("disallow", "Disallow"),
            run: () => {
              resolve(false);
              configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, "off", ConfigurationTarget.USER);
            }
          },
          {
            label: locations.size === 1 ? nls.localize("openTask", "Open File") : nls.localize("openTasks", "Open Files"),
            run: async () => {
              for (const location of locations) {
                await openerService.open(location[1]);
              }
              resolve(false);
            }
          }
        ],
        { onCancel: () => resolve(false) }
      );
      storageService.store(HAS_PROMPTED_FOR_AUTOMATIC_TASKS, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    });
  }
};
RunAutomaticTasks = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceTrustManagementService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IOpenerService)
], RunAutomaticTasks);
const _ManageAutomaticTaskRunning = class _ManageAutomaticTaskRunning extends Action2 {
  constructor() {
    super({
      id: _ManageAutomaticTaskRunning.ID,
      title: _ManageAutomaticTaskRunning.LABEL,
      category: TASKS_CATEGORY
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const configurationService = accessor.get(IConfigurationService);
    const allowItem = { label: nls.localize("workbench.action.tasks.allowAutomaticTasks", "Allow Automatic Tasks") };
    const disallowItem = { label: nls.localize("workbench.action.tasks.disallowAutomaticTasks", "Disallow Automatic Tasks") };
    const value = await quickInputService.pick([allowItem, disallowItem], { canPickMany: false });
    if (!value) {
      return;
    }
    configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, value === allowItem ? "on" : "off", ConfigurationTarget.USER);
  }
};
_ManageAutomaticTaskRunning.ID = "workbench.action.tasks.manageAutomaticRunning";
_ManageAutomaticTaskRunning.LABEL = nls.localize("workbench.action.tasks.manageAutomaticRunning", "Manage Automatic Tasks");
let ManageAutomaticTaskRunning = _ManageAutomaticTaskRunning;
export {
  ManageAutomaticTaskRunning,
  RunAutomaticTasks
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxicm93c2VyXFxydW5BdXRvbWF0aWNUYXNrcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGFza1NlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJ1bk9uT3B0aW9ucywgVGFzaywgVGFza1J1blNvdXJjZSwgVGFza1NvdXJjZSwgVGFza1NvdXJjZUtpbmQsIFRBU0tTX0NBVEVHT1JZLCBXb3Jrc3BhY2VGaWxlVGFza1NvdXJjZSwgSVdvcmtzcGFjZVRhc2tTb3VyY2UgfSBmcm9tICcuLi9jb21tb24vdGFza3MuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tJdGVtLCBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmNvbnN0IEhBU19QUk9NUFRFRF9GT1JfQVVUT01BVElDX1RBU0tTID0gJ3Rhc2suaGFzUHJvbXB0ZWRGb3JBdXRvbWF0aWNUYXNrcy52Mic7XG5jb25zdCBBTExPV19BVVRPTUFUSUNfVEFTS1MgPSAndGFzay5hbGxvd0F1dG9tYXRpY1Rhc2tzJztcblxuZXhwb3J0IGNsYXNzIFJ1bkF1dG9tYXRpY1Rhc2tzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIF9oYXNSdW5UYXNrczogYm9vbGVhbiA9IGZhbHNlO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRhc2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rhc2tTZXJ2aWNlOiBJVGFza1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdGlmICh0aGlzLl90YXNrU2VydmljZS5pc1JlY29ubmVjdGVkKSB7XG5cdFx0XHR0aGlzLl90cnlSdW5UYXNrcygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKHRoaXMuX3Rhc2tTZXJ2aWNlLm9uRGlkUmVjb25uZWN0VG9UYXNrcykoYXN5bmMgKCkgPT4gYXdhaXQgdGhpcy5fdHJ5UnVuVGFza3MoKSkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QoYXN5bmMgKCkgPT4gYXdhaXQgdGhpcy5fdHJ5UnVuVGFza3MoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdHJ5UnVuVGFza3MoKSB7XG5cdFx0aWYgKCF0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHsgdmFsdWUsIHVzZXJWYWx1ZSB9ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxzdHJpbmc+KEFMTE9XX0FVVE9NQVRJQ19UQVNLUyk7XG5cdFx0Ly8gSWYgdXNlciBleHBsaWNpdGx5IHNldCBpdCB0byAnb2ZmJywgZG9uJ3QgcnVuIG9yIHByb21wdFxuXHRcdGlmICh0aGlzLl9oYXNSdW5UYXNrcyB8fCAodmFsdWUgPT09ICdvZmYnICYmIHVzZXJWYWx1ZSAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9oYXNSdW5UYXNrcyA9IHRydWU7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnUnVuQXV0b21hdGljVGFza3M6IFRyeWluZyB0byBydW4gdGFza3MuJyk7XG5cdFx0Ly8gV2FpdCB1bnRpbCB3ZSBoYXZlIHRhc2sgc3lzdGVtIGluZm8gKHRoZSBleHRlbnNpb24gaG9zdCBhbmQgd29ya3NwYWNlIGZvbGRlcnMgYXJlIGF2YWlsYWJsZSkuXG5cdFx0aWYgKCF0aGlzLl90YXNrU2VydmljZS5oYXNUYXNrU3lzdGVtSW5mbykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnUnVuQXV0b21hdGljVGFza3M6IEF3YWl0aW5nIHRhc2sgc3lzdGVtIGluZm8uJyk7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoRXZlbnQub25jZSh0aGlzLl90YXNrU2VydmljZS5vbkRpZENoYW5nZVRhc2tTeXN0ZW1JbmZvKSk7XG5cdFx0fVxuXHRcdGxldCB3b3Jrc3BhY2VUYXNrcyA9IGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLmdldFdvcmtzcGFjZVRhc2tzKFRhc2tSdW5Tb3VyY2UuRm9sZGVyT3Blbik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgUnVuQXV0b21hdGljVGFza3M6IEZvdW5kICR7d29ya3NwYWNlVGFza3Muc2l6ZX0gYXV0b21hdGljIHRhc2tzYCk7XG5cblx0XHRsZXQgYXV0b1Rhc2tzID0gdGhpcy5fZmluZEF1dG9UYXNrcyh0aGlzLl90YXNrU2VydmljZSwgd29ya3NwYWNlVGFza3MpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFJ1bkF1dG9tYXRpY1Rhc2tzOiB0YXNrTmFtZXM9JHtKU09OLnN0cmluZ2lmeShhdXRvVGFza3MudGFza05hbWVzKX1gKTtcblxuXHRcdC8vIEFzIHNlZW4gaW4gc29tZSBjYXNlcyB3aXRoIHRoZSBSZW1vdGUgU1NIIGV4dGVuc2lvbiwgdGhlIHRhc2tzIGNvbmZpZ3VyYXRpb24gaXMgbG9hZGVkIGFmdGVyIHdlIGhhdmUgY29tZVxuXHRcdC8vIHRvIHRoaXMgcG9pbnQuIExldCdzIGdpdmUgaXQgc29tZSBleHRyYSB0aW1lLlxuXHRcdGlmIChhdXRvVGFza3MudGFza05hbWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgdXBkYXRlZFdpdGhpblRpbWVvdXQgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRuZXcgUHJvbWlzZTxib29sZWFuPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0XHRcdEV2ZW50LnRvUHJvbWlzZShFdmVudC5vbmNlKHRoaXMuX3Rhc2tTZXJ2aWNlLm9uRGlkQ2hhbmdlVGFza0NvbmZpZykpLnRoZW4oKCkgPT4gcmVzb2x2ZSh0cnVlKSk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRuZXcgUHJvbWlzZTxib29sZWFuPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7IGNsZWFyVGltZW91dCh0aW1lcik7IHJlc29sdmUoZmFsc2UpOyB9LCAxMDAwMCk7XG5cdFx0XHRcdH0pXSk7XG5cblx0XHRcdGlmICghdXBkYXRlZFdpdGhpblRpbWVvdXQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgUnVuQXV0b21hdGljVGFza3M6IHdhaXRlZCBzb21lIGV4dHJhIHRpbWUsIGJ1dCBubyB1cGRhdGUgb2YgdGFza3MgY29uZmlndXJhdGlvbmApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHdvcmtzcGFjZVRhc2tzID0gYXdhaXQgdGhpcy5fdGFza1NlcnZpY2UuZ2V0V29ya3NwYWNlVGFza3MoVGFza1J1blNvdXJjZS5Gb2xkZXJPcGVuKTtcblx0XHRcdGF1dG9UYXNrcyA9IHRoaXMuX2ZpbmRBdXRvVGFza3ModGhpcy5fdGFza1NlcnZpY2UsIHdvcmtzcGFjZVRhc2tzKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFJ1bkF1dG9tYXRpY1Rhc2tzOiB1cGRhdGVkIHRhc2tOYW1lcz0ke0pTT04uc3RyaW5naWZ5KGF1dG9UYXNrcy50YXNrTmFtZXMpfWApO1xuXHRcdH1cblxuXHRcdHRoaXMuX3J1bldpdGhQZXJtaXNzaW9uKHRoaXMuX3Rhc2tTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fc3RvcmFnZVNlcnZpY2UsIHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UsIHRoaXMuX29wZW5lclNlcnZpY2UsIGF1dG9UYXNrcy50YXNrcywgYXV0b1Rhc2tzLnRhc2tOYW1lcywgYXV0b1Rhc2tzLmxvY2F0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9ydW5UYXNrcyh0YXNrU2VydmljZTogSVRhc2tTZXJ2aWNlLCB0YXNrczogQXJyYXk8VGFzayB8IFByb21pc2U8VGFzayB8IHVuZGVmaW5lZD4+KSB7XG5cdFx0dGFza3MuZm9yRWFjaCh0YXNrID0+IHtcblx0XHRcdGlmICh0YXNrIGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0XHR0YXNrLnRoZW4ocHJvbWlzZVJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0aWYgKHByb21pc2VSZXN1bHQpIHtcblx0XHRcdFx0XHRcdHRhc2tTZXJ2aWNlLnJ1bihwcm9taXNlUmVzdWx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGFza1NlcnZpY2UucnVuKHRhc2spO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGFza1NvdXJjZShzb3VyY2U6IFRhc2tTb3VyY2UpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRhc2tLaW5kID0gVGFza1NvdXJjZUtpbmQudG9Db25maWd1cmF0aW9uVGFyZ2V0KHNvdXJjZS5raW5kKTtcblx0XHRzd2l0Y2ggKHRhc2tLaW5kKSB7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjoge1xuXHRcdFx0XHRyZXR1cm4gcmVzb3VyY2VzLmpvaW5QYXRoKCg8SVdvcmtzcGFjZVRhc2tTb3VyY2U+c291cmNlKS5jb25maWcud29ya3NwYWNlRm9sZGVyIS51cmksICg8SVdvcmtzcGFjZVRhc2tTb3VyY2U+c291cmNlKS5jb25maWcuZmlsZSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOiB7XG5cdFx0XHRcdHJldHVybiAoPFdvcmtzcGFjZUZpbGVUYXNrU291cmNlPnNvdXJjZSkuY29uZmlnLndvcmtzcGFjZT8uY29uZmlndXJhdGlvbiA/PyB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kQXV0b1Rhc2tzKHRhc2tTZXJ2aWNlOiBJVGFza1NlcnZpY2UsIHdvcmtzcGFjZVRhc2tSZXN1bHQ6IE1hcDxzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0Pik6IHsgdGFza3M6IEFycmF5PFRhc2sgfCBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+PjsgdGFza05hbWVzOiBBcnJheTxzdHJpbmc+OyBsb2NhdGlvbnM6IE1hcDxzdHJpbmcsIFVSST4gfSB7XG5cdFx0Y29uc3QgdGFza3MgPSBuZXcgQXJyYXk8VGFzayB8IFByb21pc2U8VGFzayB8IHVuZGVmaW5lZD4+KCk7XG5cdFx0Y29uc3QgdGFza05hbWVzID0gbmV3IEFycmF5PHN0cmluZz4oKTtcblx0XHRjb25zdCBsb2NhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXG5cdFx0aWYgKHdvcmtzcGFjZVRhc2tSZXN1bHQpIHtcblx0XHRcdHdvcmtzcGFjZVRhc2tSZXN1bHQuZm9yRWFjaChyZXN1bHRFbGVtZW50ID0+IHtcblx0XHRcdFx0aWYgKHJlc3VsdEVsZW1lbnQuc2V0KSB7XG5cdFx0XHRcdFx0cmVzdWx0RWxlbWVudC5zZXQudGFza3MuZm9yRWFjaCh0YXNrID0+IHtcblx0XHRcdFx0XHRcdGlmICh0YXNrLnJ1bk9wdGlvbnMucnVuT24gPT09IFJ1bk9uT3B0aW9ucy5mb2xkZXJPcGVuKSB7XG5cdFx0XHRcdFx0XHRcdHRhc2tzLnB1c2godGFzayk7XG5cdFx0XHRcdFx0XHRcdHRhc2tOYW1lcy5wdXNoKHRhc2suX2xhYmVsKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLl9nZXRUYXNrU291cmNlKHRhc2suX3NvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChsb2NhdGlvbikge1xuXHRcdFx0XHRcdFx0XHRcdGxvY2F0aW9ucy5zZXQobG9jYXRpb24uZnNQYXRoLCBsb2NhdGlvbik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVzdWx0RWxlbWVudC5jb25maWd1cmF0aW9ucykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY29uZmlndXJlZFRhc2sgb2YgT2JqZWN0LnZhbHVlcyhyZXN1bHRFbGVtZW50LmNvbmZpZ3VyYXRpb25zLmJ5SWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHRcdGlmIChjb25maWd1cmVkVGFzay5ydW5PcHRpb25zLnJ1bk9uID09PSBSdW5Pbk9wdGlvbnMuZm9sZGVyT3Blbikge1xuXHRcdFx0XHRcdFx0XHR0YXNrcy5wdXNoKG5ldyBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHRhc2tTZXJ2aWNlLmdldFRhc2socmVzdWx0RWxlbWVudC53b3Jrc3BhY2VGb2xkZXIsIGNvbmZpZ3VyZWRUYXNrLl9pZCwgdHJ1ZSkudGhlbih0YXNrID0+IHJlc29sdmUodGFzaykpO1xuXHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdGlmIChjb25maWd1cmVkVGFzay5fbGFiZWwpIHtcblx0XHRcdFx0XHRcdFx0XHR0YXNrTmFtZXMucHVzaChjb25maWd1cmVkVGFzay5fbGFiZWwpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHRhc2tOYW1lcy5wdXNoKGNvbmZpZ3VyZWRUYXNrLmNvbmZpZ3VyZXMudGFzayBhcyBzdHJpbmcpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5fZ2V0VGFza1NvdXJjZShjb25maWd1cmVkVGFzay5fc291cmNlKTtcblx0XHRcdFx0XHRcdFx0aWYgKGxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdFx0bG9jYXRpb25zLnNldChsb2NhdGlvbi5mc1BhdGgsIGxvY2F0aW9uKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHRhc2tzLCB0YXNrTmFtZXMsIGxvY2F0aW9ucyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuV2l0aFBlcm1pc3Npb24odGFza1NlcnZpY2U6IElUYXNrU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLCB0YXNrczogKFRhc2sgfCBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+KVtdLCB0YXNrTmFtZXM6IHN0cmluZ1tdLCBsb2NhdGlvbnM6IE1hcDxzdHJpbmcsIFVSST4pIHtcblx0XHRpZiAodGFza05hbWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQUxMT1dfQVVUT01BVElDX1RBU0tTKSA9PT0gJ29uJykge1xuXHRcdFx0dGhpcy5fcnVuVGFza3ModGFza1NlcnZpY2UsIHRhc2tzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGFzU2hvd25Qcm9tcHRGb3JBdXRvbWF0aWNUYXNrcyA9IHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oSEFTX1BST01QVEVEX0ZPUl9BVVRPTUFUSUNfVEFTS1MsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGZhbHNlKTtcblx0XHRpZiAoaGFzU2hvd25Qcm9tcHRGb3JBdXRvbWF0aWNUYXNrcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBXZSBoYXZlIGF1dG9tYXRpYyB0YXNrcyAtIHByb21wdCB0byBhbGxvdy5cblx0XHRjb25zdCBhbGxvdyA9IGF3YWl0IHRoaXMuX3Nob3dQcm9tcHQobm90aWZpY2F0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0YXNrTmFtZXMsIGxvY2F0aW9ucyk7XG5cdFx0aWYgKGFsbG93KSB7XG5cdFx0XHR0aGlzLl9ydW5UYXNrcyh0YXNrU2VydmljZSwgdGFza3MpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3dQcm9tcHQobm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0YXNrTmFtZXM6IHN0cmluZ1tdLCBsb2NhdGlvbnM6IE1hcDxzdHJpbmcsIFVSST4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5JbmZvLCBubHMubG9jYWxpemUoJ3Rhc2tzLnJ1bi5hbGxvd0F1dG9tYXRpYycsXG5cdFx0XHRcdFwiVGhpcyB3b3Jrc3BhY2UgaGFzIHRhc2tzICh7MH0pIGRlZmluZWQgKHsxfSkgdGhhdCBjYW4gbGF1bmNoIHByb2Nlc3NlcyBhdXRvbWF0aWNhbGx5IHdoZW4geW91IG9wZW4gdGhpcyB3b3Jrc3BhY2UuIERvIHlvdSB3YW50IHRvIGFsbG93IGF1dG9tYXRpYyB0YXNrcyB0byBydW4gaW4gYWxsIHRydXN0ZWQgd29ya3NwYWNlcz9cIixcblx0XHRcdFx0dGFza05hbWVzLmpvaW4oJywgJyksXG5cdFx0XHRcdEFycmF5LmZyb20obG9jYXRpb25zLmtleXMoKSkuam9pbignLCAnKVxuXHRcdFx0KSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdhbGxvdycsIFwiQWxsb3dcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHRydWUpO1xuXHRcdFx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQUxMT1dfQVVUT01BVElDX1RBU0tTLCAnb24nLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2Rpc2FsbG93JywgXCJEaXNhbGxvd1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHJlc29sdmUoZmFsc2UpO1xuXHRcdFx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQUxMT1dfQVVUT01BVElDX1RBU0tTLCAnb2ZmJywgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYXRpb25zLnNpemUgPT09IDEgPyBubHMubG9jYWxpemUoJ29wZW5UYXNrJywgXCJPcGVuIEZpbGVcIikgOiBubHMubG9jYWxpemUoJ29wZW5UYXNrcycsIFwiT3BlbiBGaWxlc1wiKSxcblx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbG9jYXRpb24gb2YgbG9jYXRpb25zKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3Blbihsb2NhdGlvblsxXSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXNvbHZlKGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR7IG9uQ2FuY2VsOiAoKSA9PiByZXNvbHZlKGZhbHNlKSB9XG5cdFx0XHQpO1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoSEFTX1BST01QVEVEX0ZPUl9BVVRPTUFUSUNfVEFTS1MsIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hbmFnZUF1dG9tYXRpY1Rhc2tSdW5uaW5nIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLm1hbmFnZUF1dG9tYXRpY1J1bm5pbmcnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IExBQkVMID0gbmxzLmxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLm1hbmFnZUF1dG9tYXRpY1J1bm5pbmcnLCBcIk1hbmFnZSBBdXRvbWF0aWMgVGFza3NcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1hbmFnZUF1dG9tYXRpY1Rhc2tSdW5uaW5nLklELFxuXHRcdFx0dGl0bGU6IE1hbmFnZUF1dG9tYXRpY1Rhc2tSdW5uaW5nLkxBQkVMLFxuXHRcdFx0Y2F0ZWdvcnk6IFRBU0tTX0NBVEVHT1JZXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGFsbG93SXRlbTogSVF1aWNrUGlja0l0ZW0gPSB7IGxhYmVsOiBubHMubG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MuYWxsb3dBdXRvbWF0aWNUYXNrcycsIFwiQWxsb3cgQXV0b21hdGljIFRhc2tzXCIpIH07XG5cdFx0Y29uc3QgZGlzYWxsb3dJdGVtOiBJUXVpY2tQaWNrSXRlbSA9IHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5kaXNhbGxvd0F1dG9tYXRpY1Rhc2tzJywgXCJEaXNhbGxvdyBBdXRvbWF0aWMgVGFza3NcIikgfTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soW2FsbG93SXRlbSwgZGlzYWxsb3dJdGVtXSwgeyBjYW5QaWNrTWFueTogZmFsc2UgfSk7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShBTExPV19BVVRPTUFUSUNfVEFTS1MsIHZhbHVlID09PSBhbGxvd0l0ZW0gPyAnb24nIDogJ29mZicsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksZUFBZTtBQUMzQixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLG9CQUFnRDtBQUN6RCxTQUFTLGNBQW9CLGVBQTJCLGdCQUFnQixzQkFBcUU7QUFDN0ksU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQXlCLDBCQUEwQjtBQUNuRCxTQUFTLGVBQWU7QUFFeEIsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUFtQjtBQUU1QixNQUFNLG1DQUFtQztBQUN6QyxNQUFNLHdCQUF3QjtBQUV2QixJQUFNLG9CQUFOLGNBQWdDLFdBQTZDO0FBQUEsRUFFbkYsWUFDZ0MsY0FDUyx1QkFDVyxrQ0FDckIsYUFDSSxpQkFDSyxzQkFDTixnQkFBZ0M7QUFDakUsVUFBTTtBQVB5QjtBQUNTO0FBQ1c7QUFDckI7QUFDSTtBQUNLO0FBQ047QUFSbEMsU0FBUSxlQUF3QjtBQVUvQixRQUFJLEtBQUssYUFBYSxlQUFlO0FBQ3BDLFdBQUssYUFBYTtBQUFBLElBQ25CLE9BQU87QUFDTixXQUFLLFVBQVUsTUFBTSxLQUFLLEtBQUssYUFBYSxxQkFBcUIsRUFBRSxZQUFZLE1BQU0sS0FBSyxhQUFhLENBQUMsQ0FBQztBQUFBLElBQzFHO0FBQ0EsU0FBSyxVQUFVLEtBQUssaUNBQWlDLGlCQUFpQixZQUFZLE1BQU0sS0FBSyxhQUFhLENBQUMsQ0FBQztBQUFBLEVBQzdHO0FBQUEsRUFFQSxNQUFjLGVBQWU7QUFDNUIsUUFBSSxDQUFDLEtBQUssaUNBQWlDLG1CQUFtQixHQUFHO0FBQ2hFO0FBQUEsSUFDRDtBQUNBLFVBQU0sRUFBRSxPQUFPLFVBQVUsSUFBSSxLQUFLLHNCQUFzQixRQUFnQixxQkFBcUI7QUFFN0YsUUFBSSxLQUFLLGdCQUFpQixVQUFVLFNBQVMsY0FBYyxRQUFZO0FBQ3RFO0FBQUEsSUFDRDtBQUNBLFNBQUssZUFBZTtBQUNwQixTQUFLLFlBQVksTUFBTSx5Q0FBeUM7QUFFaEUsUUFBSSxDQUFDLEtBQUssYUFBYSxtQkFBbUI7QUFDekMsV0FBSyxZQUFZLE1BQU0sK0NBQStDO0FBQ3RFLFlBQU0sTUFBTSxVQUFVLE1BQU0sS0FBSyxLQUFLLGFBQWEseUJBQXlCLENBQUM7QUFBQSxJQUM5RTtBQUNBLFFBQUksaUJBQWlCLE1BQU0sS0FBSyxhQUFhLGtCQUFrQixjQUFjLFVBQVU7QUFDdkYsU0FBSyxZQUFZLE1BQU0sNEJBQTRCLGVBQWUsSUFBSSxrQkFBa0I7QUFFeEYsUUFBSSxZQUFZLEtBQUssZUFBZSxLQUFLLGNBQWMsY0FBYztBQUNyRSxTQUFLLFlBQVksTUFBTSxnQ0FBZ0MsS0FBSyxVQUFVLFVBQVUsU0FBUyxDQUFDLEVBQUU7QUFJNUYsUUFBSSxVQUFVLFVBQVUsV0FBVyxHQUFHO0FBQ3JDLFlBQU0sdUJBQXVCLE1BQU0sUUFBUSxLQUFLO0FBQUEsUUFDL0MsSUFBSSxRQUFpQixDQUFDLFlBQVk7QUFDakMsZ0JBQU0sVUFBVSxNQUFNLEtBQUssS0FBSyxhQUFhLHFCQUFxQixDQUFDLEVBQUUsS0FBSyxNQUFNLFFBQVEsSUFBSSxDQUFDO0FBQUEsUUFDOUYsQ0FBQztBQUFBLFFBQ0QsSUFBSSxRQUFpQixDQUFDLFlBQVk7QUFDakMsZ0JBQU0sUUFBUSxXQUFXLE1BQU07QUFBRSx5QkFBYSxLQUFLO0FBQUcsb0JBQVEsS0FBSztBQUFBLFVBQUcsR0FBRyxHQUFLO0FBQUEsUUFDL0UsQ0FBQztBQUFBLE1BQUMsQ0FBQztBQUVKLFVBQUksQ0FBQyxzQkFBc0I7QUFDMUIsYUFBSyxZQUFZLE1BQU0saUZBQWlGO0FBQ3hHO0FBQUEsTUFDRDtBQUVBLHVCQUFpQixNQUFNLEtBQUssYUFBYSxrQkFBa0IsY0FBYyxVQUFVO0FBQ25GLGtCQUFZLEtBQUssZUFBZSxLQUFLLGNBQWMsY0FBYztBQUNqRSxXQUFLLFlBQVksTUFBTSx3Q0FBd0MsS0FBSyxVQUFVLFVBQVUsU0FBUyxDQUFDLEVBQUU7QUFBQSxJQUNyRztBQUVBLFNBQUssbUJBQW1CLEtBQUssY0FBYyxLQUFLLHVCQUF1QixLQUFLLGlCQUFpQixLQUFLLHNCQUFzQixLQUFLLGdCQUFnQixVQUFVLE9BQU8sVUFBVSxXQUFXLFVBQVUsU0FBUztBQUFBLEVBQ3ZNO0FBQUEsRUFFUSxVQUFVLGFBQTJCLE9BQWdEO0FBQzVGLFVBQU0sUUFBUSxVQUFRO0FBQ3JCLFVBQUksZ0JBQWdCLFNBQVM7QUFDNUIsYUFBSyxLQUFLLG1CQUFpQjtBQUMxQixjQUFJLGVBQWU7QUFDbEIsd0JBQVksSUFBSSxhQUFhO0FBQUEsVUFDOUI7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLE9BQU87QUFDTixvQkFBWSxJQUFJLElBQUk7QUFBQSxNQUNyQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGVBQWUsUUFBcUM7QUFDM0QsVUFBTSxXQUFXLGVBQWUsc0JBQXNCLE9BQU8sSUFBSTtBQUNqRSxZQUFRLFVBQVU7QUFBQSxNQUNqQixLQUFLLG9CQUFvQixrQkFBa0I7QUFDMUMsZUFBTyxVQUFVLFNBQWdDLE9BQVEsT0FBTyxnQkFBaUIsS0FBNEIsT0FBUSxPQUFPLElBQUk7QUFBQSxNQUNqSTtBQUFBLE1BQ0EsS0FBSyxvQkFBb0IsV0FBVztBQUNuQyxlQUFpQyxPQUFRLE9BQU8sV0FBVyxpQkFBaUI7QUFBQSxNQUM3RTtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZUFBZSxhQUEyQixxQkFBeUs7QUFDMU4sVUFBTSxRQUFRLElBQUksTUFBd0M7QUFDMUQsVUFBTSxZQUFZLElBQUksTUFBYztBQUNwQyxVQUFNLFlBQVksb0JBQUksSUFBaUI7QUFFdkMsUUFBSSxxQkFBcUI7QUFDeEIsMEJBQW9CLFFBQVEsbUJBQWlCO0FBQzVDLFlBQUksY0FBYyxLQUFLO0FBQ3RCLHdCQUFjLElBQUksTUFBTSxRQUFRLFVBQVE7QUFDdkMsZ0JBQUksS0FBSyxXQUFXLFVBQVUsYUFBYSxZQUFZO0FBQ3RELG9CQUFNLEtBQUssSUFBSTtBQUNmLHdCQUFVLEtBQUssS0FBSyxNQUFNO0FBQzFCLG9CQUFNLFdBQVcsS0FBSyxlQUFlLEtBQUssT0FBTztBQUNqRCxrQkFBSSxVQUFVO0FBQ2IsMEJBQVUsSUFBSSxTQUFTLFFBQVEsUUFBUTtBQUFBLGNBQ3hDO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0Y7QUFDQSxZQUFJLGNBQWMsZ0JBQWdCO0FBQ2pDLHFCQUFXLGtCQUFrQixPQUFPLE9BQU8sY0FBYyxlQUFlLFlBQVksR0FBRztBQUN0RixnQkFBSSxlQUFlLFdBQVcsVUFBVSxhQUFhLFlBQVk7QUFDaEUsb0JBQU0sS0FBSyxJQUFJLFFBQTBCLGFBQVc7QUFDbkQsNEJBQVksUUFBUSxjQUFjLGlCQUFpQixlQUFlLEtBQUssSUFBSSxFQUFFLEtBQUssVUFBUSxRQUFRLElBQUksQ0FBQztBQUFBLGNBQ3hHLENBQUMsQ0FBQztBQUNGLGtCQUFJLGVBQWUsUUFBUTtBQUMxQiwwQkFBVSxLQUFLLGVBQWUsTUFBTTtBQUFBLGNBQ3JDLE9BQU87QUFDTiwwQkFBVSxLQUFLLGVBQWUsV0FBVyxJQUFjO0FBQUEsY0FDeEQ7QUFDQSxvQkFBTSxXQUFXLEtBQUssZUFBZSxlQUFlLE9BQU87QUFDM0Qsa0JBQUksVUFBVTtBQUNiLDBCQUFVLElBQUksU0FBUyxRQUFRLFFBQVE7QUFBQSxjQUN4QztBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFDQSxXQUFPLEVBQUUsT0FBTyxXQUFXLFVBQVU7QUFBQSxFQUN0QztBQUFBLEVBRUEsTUFBYyxtQkFBbUIsYUFBMkIsc0JBQTZDLGdCQUFpQyxxQkFBMkMsZUFBK0IsT0FBNkMsV0FBcUIsV0FBNkI7QUFDbFQsUUFBSSxVQUFVLFdBQVcsR0FBRztBQUMzQjtBQUFBLElBQ0Q7QUFDQSxRQUFJLHFCQUFxQixTQUFTLHFCQUFxQixNQUFNLE1BQU07QUFDbEUsV0FBSyxVQUFVLGFBQWEsS0FBSztBQUNqQztBQUFBLElBQ0Q7QUFDQSxVQUFNLGtDQUFrQyxlQUFlLFdBQVcsa0NBQWtDLGFBQWEsV0FBVyxLQUFLO0FBQ2pJLFFBQUksaUNBQWlDO0FBQ3BDO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxNQUFNLEtBQUssWUFBWSxxQkFBcUIsZ0JBQWdCLGVBQWUsc0JBQXNCLFdBQVcsU0FBUztBQUNuSSxRQUFJLE9BQU87QUFDVixXQUFLLFVBQVUsYUFBYSxLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxZQUFZLHFCQUEyQyxnQkFBaUMsZUFBK0Isc0JBQTZDLFdBQXFCLFdBQStDO0FBQy9PLFdBQU8sSUFBSSxRQUFpQixhQUFXO0FBQ3RDLDBCQUFvQjtBQUFBLFFBQU8sU0FBUztBQUFBLFFBQU0sSUFBSTtBQUFBLFVBQVM7QUFBQSxVQUN0RDtBQUFBLFVBQ0EsVUFBVSxLQUFLLElBQUk7QUFBQSxVQUNuQixNQUFNLEtBQUssVUFBVSxLQUFLLENBQUMsRUFBRSxLQUFLLElBQUk7QUFBQSxRQUN2QztBQUFBLFFBQ0M7QUFBQSxVQUFDO0FBQUEsWUFDQSxPQUFPLElBQUksU0FBUyxTQUFTLE9BQU87QUFBQSxZQUNwQyxLQUFLLE1BQU07QUFDVixzQkFBUSxJQUFJO0FBQ1osbUNBQXFCLFlBQVksdUJBQXVCLE1BQU0sb0JBQW9CLElBQUk7QUFBQSxZQUN2RjtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsWUFDQyxPQUFPLElBQUksU0FBUyxZQUFZLFVBQVU7QUFBQSxZQUMxQyxLQUFLLE1BQU07QUFDVixzQkFBUSxLQUFLO0FBQ2IsbUNBQXFCLFlBQVksdUJBQXVCLE9BQU8sb0JBQW9CLElBQUk7QUFBQSxZQUN4RjtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsWUFDQyxPQUFPLFVBQVUsU0FBUyxJQUFJLElBQUksU0FBUyxZQUFZLFdBQVcsSUFBSSxJQUFJLFNBQVMsYUFBYSxZQUFZO0FBQUEsWUFDNUcsS0FBSyxZQUFZO0FBQ2hCLHlCQUFXLFlBQVksV0FBVztBQUNqQyxzQkFBTSxjQUFjLEtBQUssU0FBUyxDQUFDLENBQUM7QUFBQSxjQUNyQztBQUNBLHNCQUFRLEtBQUs7QUFBQSxZQUNkO0FBQUEsVUFDRDtBQUFBLFFBQUM7QUFBQSxRQUNELEVBQUUsVUFBVSxNQUFNLFFBQVEsS0FBSyxFQUFFO0FBQUEsTUFDbEM7QUFDQSxxQkFBZSxNQUFNLGtDQUFrQyxNQUFNLGFBQWEsV0FBVyxjQUFjLE9BQU87QUFBQSxJQUMzRyxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBNUxhLG9CQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVFU7QUE4TE4sTUFBTSw4QkFBTixNQUFNLG9DQUFtQyxRQUFRO0FBQUEsRUFLdkQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksNEJBQTJCO0FBQUEsTUFDL0IsT0FBTyw0QkFBMkI7QUFBQSxNQUNsQyxVQUFVO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYSxJQUFJLFVBQTJDO0FBQzNELFVBQU0sb0JBQW9CLFNBQVMsSUFBSSxrQkFBa0I7QUFDekQsVUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUMvRCxVQUFNLFlBQTRCLEVBQUUsT0FBTyxJQUFJLFNBQVMsOENBQThDLHVCQUF1QixFQUFFO0FBQy9ILFVBQU0sZUFBK0IsRUFBRSxPQUFPLElBQUksU0FBUyxpREFBaUQsMEJBQTBCLEVBQUU7QUFDeEksVUFBTSxRQUFRLE1BQU0sa0JBQWtCLEtBQUssQ0FBQyxXQUFXLFlBQVksR0FBRyxFQUFFLGFBQWEsTUFBTSxDQUFDO0FBQzVGLFFBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxJQUNEO0FBQ0EseUJBQXFCLFlBQVksdUJBQXVCLFVBQVUsWUFBWSxPQUFPLE9BQU8sb0JBQW9CLElBQUk7QUFBQSxFQUNySDtBQUNEO0FBeEJhLDRCQUVXLEtBQUs7QUFGaEIsNEJBR1csUUFBUSxJQUFJLFNBQVMsaURBQWlELHdCQUF3QjtBQUgvRyxJQUFNLDZCQUFOOyIsCiAgIm5hbWVzIjogW10KfQo=
