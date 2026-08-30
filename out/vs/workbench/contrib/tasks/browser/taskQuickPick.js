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
import * as Objects from "../../../../base/common/objects.js";
import { ContributedTask, CustomTask, ConfiguringTask } from "../common/tasks.js";
import * as Types from "../../../../base/common/types.js";
import { ITaskService } from "../common/taskService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { getColorClass, createColorStyleElement } from "../../terminal/browser/terminalIcon.js";
import { showWithPinnedItems } from "../../../../platform/quickinput/browser/quickPickPin.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
const QUICKOPEN_DETAIL_CONFIG = "task.quickOpen.detail";
const QUICKOPEN_SKIP_CONFIG = "task.quickOpen.skip";
function isWorkspaceFolder(folder) {
  return "uri" in folder;
}
const SHOW_ALL = nls.localize("taskQuickPick.showAll", "Show All Tasks...");
const configureTaskIcon = registerIcon("tasks-list-configure", Codicon.gear, nls.localize("configureTaskIcon", "Configuration icon in the tasks selection list."));
const removeTaskIcon = registerIcon("tasks-remove", Codicon.close, nls.localize("removeTaskIcon", "Icon for remove in the tasks selection list."));
const runTaskStorageKey = "runTaskStorageKey";
let TaskQuickPick = class extends Disposable {
  constructor(_taskService, _configurationService, _quickInputService, _notificationService, _themeService, _dialogService, _storageService) {
    super();
    this._taskService = _taskService;
    this._configurationService = _configurationService;
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._themeService = _themeService;
    this._dialogService = _dialogService;
    this._storageService = _storageService;
    this._sorter = this._taskService.createSorter();
  }
  _showDetail() {
    return !!this._configurationService.getValue(QUICKOPEN_DETAIL_CONFIG);
  }
  _guessTaskLabel(task) {
    if (task._label) {
      return task._label;
    }
    if (ConfiguringTask.is(task)) {
      let label = task.configures.type;
      const configures = Objects.deepClone(task.configures);
      delete configures["_key"];
      delete configures["type"];
      Object.keys(configures).forEach((key) => label += `: ${configures[key]}`);
      return label;
    }
    return "";
  }
  static getTaskLabelWithIcon(task, labelGuess) {
    const label = labelGuess || task._label;
    const icon = task.configurationProperties.icon;
    if (!icon) {
      return `${label}`;
    }
    return icon.id ? `$(${icon.id}) ${label}` : `$(${Codicon.tools.id}) ${label}`;
  }
  static applyColorStyles(task, entry, themeService) {
    if (task.configurationProperties.icon?.color) {
      const colorTheme = themeService.getColorTheme();
      const disposable = createColorStyleElement(colorTheme);
      entry.iconClasses = [getColorClass(task.configurationProperties.icon.color)];
      return disposable;
    }
    return;
  }
  _createTaskEntry(task, extraButtons = []) {
    const buttons = [
      { iconClass: ThemeIcon.asClassName(configureTaskIcon), tooltip: nls.localize("configureTask", "Configure Task") },
      ...extraButtons
    ];
    const entry = { label: TaskQuickPick.getTaskLabelWithIcon(task, this._guessTaskLabel(task)), description: this._taskService.getTaskDescription(task), task, detail: this._showDetail() ? task.configurationProperties.detail : void 0, buttons };
    const disposable = TaskQuickPick.applyColorStyles(task, entry, this._themeService);
    if (disposable) {
      this._register(disposable);
    }
    return entry;
  }
  _createEntriesForGroup(entries, tasks, groupLabel, extraButtons = []) {
    entries.push({ type: "separator", label: groupLabel });
    tasks.forEach((task) => {
      if (!task.configurationProperties.hide) {
        entries.push(this._createTaskEntry(task, extraButtons));
      }
    });
  }
  _createTypeEntries(entries, types) {
    entries.push({ type: "separator", label: nls.localize("contributedTasks", "contributed") });
    types.forEach((type) => {
      entries.push({ label: `$(folder) ${type}`, task: type, ariaLabel: nls.localize("taskType", "All {0} tasks", type) });
    });
    entries.push({ label: SHOW_ALL, task: SHOW_ALL, alwaysShow: true });
  }
  _handleFolderTaskResult(result) {
    const tasks = [];
    Array.from(result).forEach(([key, folderTasks]) => {
      if (folderTasks.set) {
        tasks.push(...folderTasks.set.tasks);
      }
      if (folderTasks.configurations) {
        for (const configuration in folderTasks.configurations.byIdentifier) {
          tasks.push(folderTasks.configurations.byIdentifier[configuration]);
        }
      }
    });
    return tasks;
  }
  _dedupeConfiguredAndRecent(recentTasks, configuredTasks) {
    let dedupedConfiguredTasks = [];
    const foundRecentTasks = Array(recentTasks.length).fill(false);
    for (let j = 0; j < configuredTasks.length; j++) {
      const workspaceFolder = configuredTasks[j].getWorkspaceFolder()?.uri.toString();
      const definition = configuredTasks[j].getDefinition()?._key;
      const type = configuredTasks[j].type;
      const label = configuredTasks[j]._label;
      const recentKey = configuredTasks[j].getKey();
      const findIndex = recentTasks.findIndex((value) => {
        return workspaceFolder && definition && value.getWorkspaceFolder()?.uri.toString() === workspaceFolder && (value.getDefinition()?._key === definition || value.type === type && value._label === label) || recentKey && value.getKey() === recentKey;
      });
      if (findIndex === -1) {
        dedupedConfiguredTasks.push(configuredTasks[j]);
      } else {
        recentTasks[findIndex] = configuredTasks[j];
        foundRecentTasks[findIndex] = true;
      }
    }
    dedupedConfiguredTasks = dedupedConfiguredTasks.sort((a, b) => this._sorter.compare(a, b));
    const prunedRecentTasks = [];
    for (let i = 0; i < recentTasks.length; i++) {
      if (foundRecentTasks[i] || ConfiguringTask.is(recentTasks[i])) {
        prunedRecentTasks.push(recentTasks[i]);
      }
    }
    return { configuredTasks: dedupedConfiguredTasks, recentTasks: prunedRecentTasks };
  }
  async getTopLevelEntries(defaultEntry) {
    if (this._topLevelEntries !== void 0) {
      return { entries: this._topLevelEntries };
    }
    let recentTasks = (await this._taskService.getSavedTasks("historical")).reverse();
    const configuredTasks = this._handleFolderTaskResult(await this._taskService.getWorkspaceTasks());
    const extensionTaskTypes = this._taskService.taskTypes();
    this._topLevelEntries = [];
    const dedupeAndPrune = this._dedupeConfiguredAndRecent(recentTasks, configuredTasks);
    const dedupedConfiguredTasks = dedupeAndPrune.configuredTasks;
    recentTasks = dedupeAndPrune.recentTasks;
    if (recentTasks.length > 0) {
      const removeRecentButton = {
        iconClass: ThemeIcon.asClassName(removeTaskIcon),
        tooltip: nls.localize("removeRecent", "Remove Recently Used Task")
      };
      this._createEntriesForGroup(this._topLevelEntries, recentTasks, nls.localize("recentlyUsed", "recently used"), [removeRecentButton]);
    }
    if (configuredTasks.length > 0) {
      if (dedupedConfiguredTasks.length > 0) {
        this._createEntriesForGroup(this._topLevelEntries, dedupedConfiguredTasks, nls.localize("configured", "configured"));
      }
    }
    if (defaultEntry && configuredTasks.length === 0) {
      this._topLevelEntries.push({ type: "separator", label: nls.localize("configured", "configured") });
      this._topLevelEntries.push(defaultEntry);
    }
    if (extensionTaskTypes.length > 0) {
      this._createTypeEntries(this._topLevelEntries, extensionTaskTypes);
    }
    return { entries: this._topLevelEntries, isSingleConfigured: configuredTasks.length === 1 ? configuredTasks[0] : void 0 };
  }
  async handleSettingOption(selectedType) {
    const { confirmed } = await this._dialogService.confirm({
      type: Severity.Warning,
      message: nls.localize(
        "TaskQuickPick.changeSettingDetails",
        "Task detection for {0} tasks causes files in any workspace you open to be run as code. Enabling {0} task detection is a user setting and will apply to any workspace you open. \n\n Do you want to enable {0} task detection for all workspaces?",
        selectedType
      ),
      cancelButton: nls.localize("TaskQuickPick.changeSettingNo", "No")
    });
    if (confirmed) {
      await this._configurationService.updateValue(`${selectedType}.autoDetect`, "on");
      await new Promise((resolve) => setTimeout(() => resolve(), 100));
      return this.show(nls.localize("TaskService.pickRunTask", "Select the task to run"), void 0, selectedType);
    }
    return void 0;
  }
  async show(placeHolder, defaultEntry, startAtType, name) {
    const disposables = new DisposableStore();
    const picker = disposables.add(this._quickInputService.createQuickPick({ useSeparators: true }));
    picker.placeholder = placeHolder;
    picker.matchOnDescription = true;
    picker.ignoreFocusOut = false;
    disposables.add(picker.onDidTriggerItemButton(async (context) => {
      const task = context.item.task;
      if (context.button.iconClass === ThemeIcon.asClassName(removeTaskIcon)) {
        const key = task && !Types.isString(task) ? task.getKey() : void 0;
        if (key) {
          this._taskService.removeRecentlyUsedTask(key);
        }
        const indexToRemove = picker.items.indexOf(context.item);
        if (indexToRemove >= 0) {
          picker.items = [...picker.items.slice(0, indexToRemove), ...picker.items.slice(indexToRemove + 1)];
        }
      } else if (context.button.iconClass === ThemeIcon.asClassName(configureTaskIcon)) {
        this._quickInputService.cancel();
        if (ContributedTask.is(task)) {
          this._taskService.customize(task, void 0, true);
        } else if (CustomTask.is(task) || ConfiguringTask.is(task)) {
          let canOpenConfig = false;
          try {
            canOpenConfig = await this._taskService.openConfig(task);
          } catch (e) {
          }
          if (!canOpenConfig) {
            this._taskService.customize(task, void 0, true);
          }
        }
      }
    }));
    if (name) {
      picker.value = name;
    }
    let firstLevelTask = startAtType;
    if (!firstLevelTask) {
      const topLevelEntriesResult = await this.getTopLevelEntries(defaultEntry);
      if (topLevelEntriesResult.isSingleConfigured && this._configurationService.getValue(QUICKOPEN_SKIP_CONFIG)) {
        disposables.dispose();
        return this._toTask(topLevelEntriesResult.isSingleConfigured);
      }
      const taskQuickPickEntries = topLevelEntriesResult.entries;
      firstLevelTask = await this._doPickerFirstLevel(picker, taskQuickPickEntries, disposables);
    }
    do {
      if (Types.isString(firstLevelTask)) {
        if (name) {
          await this._doPickerFirstLevel(picker, (await this.getTopLevelEntries(defaultEntry)).entries, disposables);
          disposables.dispose();
          return void 0;
        }
        const selectedEntry = await this.doPickerSecondLevel(picker, disposables, firstLevelTask);
        if (selectedEntry && !selectedEntry.settingType && selectedEntry.task === null) {
          picker.value = "";
          firstLevelTask = await this._doPickerFirstLevel(picker, (await this.getTopLevelEntries(defaultEntry)).entries, disposables);
        } else if (selectedEntry && Types.isString(selectedEntry.settingType)) {
          disposables.dispose();
          return this.handleSettingOption(selectedEntry.settingType);
        } else {
          disposables.dispose();
          return selectedEntry?.task && !Types.isString(selectedEntry?.task) ? this._toTask(selectedEntry?.task) : void 0;
        }
      } else if (firstLevelTask) {
        disposables.dispose();
        return this._toTask(firstLevelTask);
      } else {
        disposables.dispose();
        return firstLevelTask;
      }
    } while (1);
    return;
  }
  async _doPickerFirstLevel(picker, taskQuickPickEntries, disposables) {
    picker.items = taskQuickPickEntries;
    disposables.add(showWithPinnedItems(this._storageService, runTaskStorageKey, picker, true));
    const firstLevelPickerResult = await new Promise((resolve) => {
      disposables.add(Event.once(picker.onDidAccept)(async () => {
        resolve(picker.selectedItems ? picker.selectedItems[0] : void 0);
      }));
    });
    return firstLevelPickerResult?.task;
  }
  async doPickerSecondLevel(picker, disposables, type, name) {
    picker.busy = true;
    if (type === SHOW_ALL) {
      const items = (await this._taskService.tasks()).filter((t) => !t.configurationProperties.hide).sort((a, b) => this._sorter.compare(a, b)).map((task) => this._createTaskEntry(task));
      items.push(...TaskQuickPick.allSettingEntries(this._configurationService));
      picker.items = items;
    } else {
      picker.value = name || "";
      picker.items = await this._getEntriesForProvider(type);
    }
    await picker.show();
    picker.busy = false;
    const secondLevelPickerResult = await new Promise((resolve) => {
      disposables.add(Event.once(picker.onDidAccept)(async () => {
        resolve(picker.selectedItems ? picker.selectedItems[0] : void 0);
      }));
    });
    return secondLevelPickerResult;
  }
  static allSettingEntries(configurationService) {
    const entries = [];
    const gruntEntry = TaskQuickPick.getSettingEntry(configurationService, "grunt");
    if (gruntEntry) {
      entries.push(gruntEntry);
    }
    const gulpEntry = TaskQuickPick.getSettingEntry(configurationService, "gulp");
    if (gulpEntry) {
      entries.push(gulpEntry);
    }
    const jakeEntry = TaskQuickPick.getSettingEntry(configurationService, "jake");
    if (jakeEntry) {
      entries.push(jakeEntry);
    }
    return entries;
  }
  static getSettingEntry(configurationService, type) {
    if (configurationService.getValue(`${type}.autoDetect`) === "off") {
      return {
        label: "$(gear) " + nls.localize(
          "TaskQuickPick.changeSettingsOptions",
          "{0} task detection is turned off. Enable {1} task detection...",
          type[0].toUpperCase() + type.slice(1),
          type
        ),
        task: null,
        settingType: type,
        alwaysShow: true
      };
    }
    return void 0;
  }
  async _getEntriesForProvider(type) {
    const tasks = (await this._taskService.tasks({ type })).sort((a, b) => this._sorter.compare(a, b));
    let taskQuickPickEntries = [];
    if (tasks.length > 0) {
      for (const task of tasks) {
        if (!task.configurationProperties.hide) {
          taskQuickPickEntries.push(this._createTaskEntry(task));
        }
      }
      taskQuickPickEntries.push({
        type: "separator"
      }, {
        label: nls.localize("TaskQuickPick.goBack", "Go back \u21A9"),
        task: null,
        alwaysShow: true
      });
    } else {
      taskQuickPickEntries = [{
        label: nls.localize("TaskQuickPick.noTasksForType", "No {0} tasks found. Go back \u21A9", type),
        task: null,
        alwaysShow: true
      }];
    }
    const settingEntry = TaskQuickPick.getSettingEntry(this._configurationService, type);
    if (settingEntry) {
      taskQuickPickEntries.push(settingEntry);
    }
    return taskQuickPickEntries;
  }
  async _toTask(task) {
    if (!ConfiguringTask.is(task)) {
      return task;
    }
    const resolvedTask = await this._taskService.tryResolveTask(task);
    if (!resolvedTask) {
      this._notificationService.error(nls.localize("noProviderForTask", 'There is no task provider registered for tasks of type "{0}".', task.type));
    }
    return resolvedTask;
  }
};
TaskQuickPick = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IStorageService)
], TaskQuickPick);
export {
  QUICKOPEN_DETAIL_CONFIG,
  QUICKOPEN_SKIP_CONFIG,
  TaskQuickPick,
  configureTaskIcon,
  isWorkspaceFolder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxicm93c2VyXFx0YXNrUXVpY2tQaWNrLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBPYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgVGFzaywgQ29udHJpYnV0ZWRUYXNrLCBDdXN0b21UYXNrLCBDb25maWd1cmluZ1Rhc2ssIFRhc2tTb3J0ZXIsIEtleWVkVGFza0lkZW50aWZpZXIgfSBmcm9tICcuLi9jb21tb24vdGFza3MuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCAqIGFzIFR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElUYXNrU2VydmljZSwgSVdvcmtzcGFjZUZvbGRlclRhc2tSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vdGFza1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrUGlja0l0ZW0sIFF1aWNrUGlja0lucHV0LCBJUXVpY2tQaWNrLCBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IGdldENvbG9yQ2xhc3MsIGNyZWF0ZUNvbG9yU3R5bGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEljb24uanMnO1xuaW1wb3J0IHsgVGFza1F1aWNrUGlja0VudHJ5VHlwZSB9IGZyb20gJy4vYWJzdHJhY3RUYXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBzaG93V2l0aFBpbm5lZEl0ZW1zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3F1aWNrUGlja1Bpbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcblxuZXhwb3J0IGNvbnN0IFFVSUNLT1BFTl9ERVRBSUxfQ09ORklHID0gJ3Rhc2sucXVpY2tPcGVuLmRldGFpbCc7XG5leHBvcnQgY29uc3QgUVVJQ0tPUEVOX1NLSVBfQ09ORklHID0gJ3Rhc2sucXVpY2tPcGVuLnNraXAnO1xuZXhwb3J0IGZ1bmN0aW9uIGlzV29ya3NwYWNlRm9sZGVyKGZvbGRlcjogSVdvcmtzcGFjZSB8IElXb3Jrc3BhY2VGb2xkZXIpOiBmb2xkZXIgaXMgSVdvcmtzcGFjZUZvbGRlciB7XG5cdHJldHVybiAndXJpJyBpbiBmb2xkZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tRdWlja1BpY2tFbnRyeSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0dGFzazogVGFzayB8IHVuZGVmaW5lZCB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5IGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHR0YXNrOiBUYXNrIHwgQ29uZmlndXJpbmdUYXNrIHwgc3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0c2V0dGluZ1R5cGU/OiBzdHJpbmc7XG59XG5cbmNvbnN0IFNIT1dfQUxMOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3Rhc2tRdWlja1BpY2suc2hvd0FsbCcsIFwiU2hvdyBBbGwgVGFza3MuLi5cIik7XG5cbmV4cG9ydCBjb25zdCBjb25maWd1cmVUYXNrSWNvbiA9IHJlZ2lzdGVySWNvbigndGFza3MtbGlzdC1jb25maWd1cmUnLCBDb2RpY29uLmdlYXIsIG5scy5sb2NhbGl6ZSgnY29uZmlndXJlVGFza0ljb24nLCAnQ29uZmlndXJhdGlvbiBpY29uIGluIHRoZSB0YXNrcyBzZWxlY3Rpb24gbGlzdC4nKSk7XG5jb25zdCByZW1vdmVUYXNrSWNvbiA9IHJlZ2lzdGVySWNvbigndGFza3MtcmVtb3ZlJywgQ29kaWNvbi5jbG9zZSwgbmxzLmxvY2FsaXplKCdyZW1vdmVUYXNrSWNvbicsICdJY29uIGZvciByZW1vdmUgaW4gdGhlIHRhc2tzIHNlbGVjdGlvbiBsaXN0LicpKTtcblxuY29uc3QgcnVuVGFza1N0b3JhZ2VLZXkgPSAncnVuVGFza1N0b3JhZ2VLZXknO1xuXG5leHBvcnQgY2xhc3MgVGFza1F1aWNrUGljayBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9zb3J0ZXI6IFRhc2tTb3J0ZXI7XG5cdHByaXZhdGUgX3RvcExldmVsRW50cmllczogUXVpY2tQaWNrSW5wdXQ8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5PltdIHwgdW5kZWZpbmVkO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRhc2tTZXJ2aWNlIHByaXZhdGUgX3Rhc2tTZXJ2aWNlOiBJVGFza1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3NvcnRlciA9IHRoaXMuX3Rhc2tTZXJ2aWNlLmNyZWF0ZVNvcnRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0RldGFpbCgpOiBib29sZWFuIHtcblx0XHQvLyBFbnN1cmUgaW52YWxpZCB2YWx1ZXMgZ2V0IGNvbnZlcnRlZCBpbnRvIGJvb2xlYW4gdmFsdWVzXG5cdFx0cmV0dXJuICEhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUVVJQ0tPUEVOX0RFVEFJTF9DT05GSUcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ3Vlc3NUYXNrTGFiZWwodGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzayk6IHN0cmluZyB7XG5cdFx0aWYgKHRhc2suX2xhYmVsKSB7XG5cdFx0XHRyZXR1cm4gdGFzay5fbGFiZWw7XG5cdFx0fVxuXHRcdGlmIChDb25maWd1cmluZ1Rhc2suaXModGFzaykpIHtcblx0XHRcdGxldCBsYWJlbDogc3RyaW5nID0gdGFzay5jb25maWd1cmVzLnR5cGU7XG5cdFx0XHRjb25zdCBjb25maWd1cmVzOiBQYXJ0aWFsPEtleWVkVGFza0lkZW50aWZpZXI+ID0gT2JqZWN0cy5kZWVwQ2xvbmUodGFzay5jb25maWd1cmVzKTtcblx0XHRcdGRlbGV0ZSBjb25maWd1cmVzWydfa2V5J107XG5cdFx0XHRkZWxldGUgY29uZmlndXJlc1sndHlwZSddO1xuXHRcdFx0T2JqZWN0LmtleXMoY29uZmlndXJlcykuZm9yRWFjaChrZXkgPT4gbGFiZWwgKz0gYDogJHtjb25maWd1cmVzW2tleV19YCk7XG5cdFx0XHRyZXR1cm4gbGFiZWw7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0VGFza0xhYmVsV2l0aEljb24odGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzaywgbGFiZWxHdWVzcz86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGFiZWwgPSBsYWJlbEd1ZXNzIHx8IHRhc2suX2xhYmVsO1xuXHRcdGNvbnN0IGljb24gPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb247XG5cdFx0aWYgKCFpY29uKSB7XG5cdFx0XHRyZXR1cm4gYCR7bGFiZWx9YDtcblx0XHR9XG5cdFx0cmV0dXJuIGljb24uaWQgPyBgJCgke2ljb24uaWR9KSAke2xhYmVsfWAgOiBgJCgke0NvZGljb24udG9vbHMuaWR9KSAke2xhYmVsfWA7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGFwcGx5Q29sb3JTdHlsZXModGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzaywgZW50cnk6IFRhc2tRdWlja1BpY2tFbnRyeVR5cGUgfCBJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnksIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSk6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uPy5jb2xvcikge1xuXHRcdFx0Y29uc3QgY29sb3JUaGVtZSA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gY3JlYXRlQ29sb3JTdHlsZUVsZW1lbnQoY29sb3JUaGVtZSk7XG5cdFx0XHRlbnRyeS5pY29uQ2xhc3NlcyA9IFtnZXRDb2xvckNsYXNzKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbi5jb2xvcildO1xuXHRcdFx0cmV0dXJuIGRpc3Bvc2FibGU7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRhc2tFbnRyeSh0YXNrOiBUYXNrIHwgQ29uZmlndXJpbmdUYXNrLCBleHRyYUJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXSk6IElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeSB7XG5cdFx0Y29uc3QgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSA9IFtcblx0XHRcdHsgaWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoY29uZmlndXJlVGFza0ljb24pLCB0b29sdGlwOiBubHMubG9jYWxpemUoJ2NvbmZpZ3VyZVRhc2snLCBcIkNvbmZpZ3VyZSBUYXNrXCIpIH0sXG5cdFx0XHQuLi5leHRyYUJ1dHRvbnNcblx0XHRdO1xuXHRcdGNvbnN0IGVudHJ5OiBJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnkgPSB7IGxhYmVsOiBUYXNrUXVpY2tQaWNrLmdldFRhc2tMYWJlbFdpdGhJY29uKHRhc2ssIHRoaXMuX2d1ZXNzVGFza0xhYmVsKHRhc2spKSwgZGVzY3JpcHRpb246IHRoaXMuX3Rhc2tTZXJ2aWNlLmdldFRhc2tEZXNjcmlwdGlvbih0YXNrKSwgdGFzaywgZGV0YWlsOiB0aGlzLl9zaG93RGV0YWlsKCkgPyB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRldGFpbCA6IHVuZGVmaW5lZCwgYnV0dG9ucyB9O1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBUYXNrUXVpY2tQaWNrLmFwcGx5Q29sb3JTdHlsZXModGFzaywgZW50cnksIHRoaXMuX3RoZW1lU2VydmljZSk7XG5cdFx0aWYgKGRpc3Bvc2FibGUpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVFbnRyaWVzRm9yR3JvdXAoZW50cmllczogUXVpY2tQaWNrSW5wdXQ8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5PltdLCB0YXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10sXG5cdFx0Z3JvdXBMYWJlbDogc3RyaW5nLCBleHRyYUJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXSkge1xuXHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogZ3JvdXBMYWJlbCB9KTtcblx0XHR0YXNrcy5mb3JFYWNoKHRhc2sgPT4ge1xuXHRcdFx0aWYgKCF0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmhpZGUpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKHRoaXMuX2NyZWF0ZVRhc2tFbnRyeSh0YXNrLCBleHRyYUJ1dHRvbnMpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVR5cGVFbnRyaWVzKGVudHJpZXM6IFF1aWNrUGlja0lucHV0PElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeT5bXSwgdHlwZXM6IHN0cmluZ1tdKSB7XG5cdFx0ZW50cmllcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVkVGFza3MnLCBcImNvbnRyaWJ1dGVkXCIpIH0pO1xuXHRcdHR5cGVzLmZvckVhY2godHlwZSA9PiB7XG5cdFx0XHRlbnRyaWVzLnB1c2goeyBsYWJlbDogYCQoZm9sZGVyKSAke3R5cGV9YCwgdGFzazogdHlwZSwgYXJpYUxhYmVsOiBubHMubG9jYWxpemUoJ3Rhc2tUeXBlJywgXCJBbGwgezB9IHRhc2tzXCIsIHR5cGUpIH0pO1xuXHRcdH0pO1xuXHRcdGVudHJpZXMucHVzaCh7IGxhYmVsOiBTSE9XX0FMTCwgdGFzazogU0hPV19BTEwsIGFsd2F5c1Nob3c6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVGb2xkZXJUYXNrUmVzdWx0KHJlc3VsdDogTWFwPHN0cmluZywgSVdvcmtzcGFjZUZvbGRlclRhc2tSZXN1bHQ+KTogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10ge1xuXHRcdGNvbnN0IHRhc2tzOiAoVGFzayB8IENvbmZpZ3VyaW5nVGFzaylbXSA9IFtdO1xuXHRcdEFycmF5LmZyb20ocmVzdWx0KS5mb3JFYWNoKChba2V5LCBmb2xkZXJUYXNrc10pID0+IHtcblx0XHRcdGlmIChmb2xkZXJUYXNrcy5zZXQpIHtcblx0XHRcdFx0dGFza3MucHVzaCguLi5mb2xkZXJUYXNrcy5zZXQudGFza3MpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZvbGRlclRhc2tzLmNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY29uZmlndXJhdGlvbiBpbiBmb2xkZXJUYXNrcy5jb25maWd1cmF0aW9ucy5ieUlkZW50aWZpZXIpIHtcblx0XHRcdFx0XHR0YXNrcy5wdXNoKGZvbGRlclRhc2tzLmNvbmZpZ3VyYXRpb25zLmJ5SWRlbnRpZmllcltjb25maWd1cmF0aW9uXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gdGFza3M7XG5cdH1cblxuXHRwcml2YXRlIF9kZWR1cGVDb25maWd1cmVkQW5kUmVjZW50KHJlY2VudFRhc2tzOiAoVGFzayB8IENvbmZpZ3VyaW5nVGFzaylbXSwgY29uZmlndXJlZFRhc2tzOiAoVGFzayB8IENvbmZpZ3VyaW5nVGFzaylbXSk6IHsgY29uZmlndXJlZFRhc2tzOiAoVGFzayB8IENvbmZpZ3VyaW5nVGFzaylbXTsgcmVjZW50VGFza3M6IChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdIH0ge1xuXHRcdGxldCBkZWR1cGVkQ29uZmlndXJlZFRhc2tzOiAoVGFzayB8IENvbmZpZ3VyaW5nVGFzaylbXSA9IFtdO1xuXHRcdGNvbnN0IGZvdW5kUmVjZW50VGFza3M6IGJvb2xlYW5bXSA9IEFycmF5KHJlY2VudFRhc2tzLmxlbmd0aCkuZmlsbChmYWxzZSk7XG5cdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBjb25maWd1cmVkVGFza3MubGVuZ3RoOyBqKyspIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IGNvbmZpZ3VyZWRUYXNrc1tqXS5nZXRXb3Jrc3BhY2VGb2xkZXIoKT8udXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZpbml0aW9uID0gY29uZmlndXJlZFRhc2tzW2pdLmdldERlZmluaXRpb24oKT8uX2tleTtcblx0XHRcdGNvbnN0IHR5cGUgPSBjb25maWd1cmVkVGFza3Nbal0udHlwZTtcblx0XHRcdGNvbnN0IGxhYmVsID0gY29uZmlndXJlZFRhc2tzW2pdLl9sYWJlbDtcblx0XHRcdGNvbnN0IHJlY2VudEtleSA9IGNvbmZpZ3VyZWRUYXNrc1tqXS5nZXRLZXkoKTtcblx0XHRcdGNvbnN0IGZpbmRJbmRleCA9IHJlY2VudFRhc2tzLmZpbmRJbmRleCgodmFsdWUpID0+IHtcblx0XHRcdFx0cmV0dXJuICh3b3Jrc3BhY2VGb2xkZXIgJiYgZGVmaW5pdGlvbiAmJiB2YWx1ZS5nZXRXb3Jrc3BhY2VGb2xkZXIoKT8udXJpLnRvU3RyaW5nKCkgPT09IHdvcmtzcGFjZUZvbGRlclxuXHRcdFx0XHRcdCYmICgodmFsdWUuZ2V0RGVmaW5pdGlvbigpPy5fa2V5ID09PSBkZWZpbml0aW9uKSB8fCAodmFsdWUudHlwZSA9PT0gdHlwZSAmJiB2YWx1ZS5fbGFiZWwgPT09IGxhYmVsKSkpXG5cdFx0XHRcdFx0fHwgKHJlY2VudEtleSAmJiB2YWx1ZS5nZXRLZXkoKSA9PT0gcmVjZW50S2V5KTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGZpbmRJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0ZGVkdXBlZENvbmZpZ3VyZWRUYXNrcy5wdXNoKGNvbmZpZ3VyZWRUYXNrc1tqXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZWNlbnRUYXNrc1tmaW5kSW5kZXhdID0gY29uZmlndXJlZFRhc2tzW2pdO1xuXHRcdFx0XHRmb3VuZFJlY2VudFRhc2tzW2ZpbmRJbmRleF0gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRkZWR1cGVkQ29uZmlndXJlZFRhc2tzID0gZGVkdXBlZENvbmZpZ3VyZWRUYXNrcy5zb3J0KChhLCBiKSA9PiB0aGlzLl9zb3J0ZXIuY29tcGFyZShhLCBiKSk7XG5cdFx0Y29uc3QgcHJ1bmVkUmVjZW50VGFza3M6IChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZWNlbnRUYXNrcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGZvdW5kUmVjZW50VGFza3NbaV0gfHwgQ29uZmlndXJpbmdUYXNrLmlzKHJlY2VudFRhc2tzW2ldKSkge1xuXHRcdFx0XHRwcnVuZWRSZWNlbnRUYXNrcy5wdXNoKHJlY2VudFRhc2tzW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgY29uZmlndXJlZFRhc2tzOiBkZWR1cGVkQ29uZmlndXJlZFRhc2tzLCByZWNlbnRUYXNrczogcHJ1bmVkUmVjZW50VGFza3MgfTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRUb3BMZXZlbEVudHJpZXMoZGVmYXVsdEVudHJ5PzogSVRhc2tRdWlja1BpY2tFbnRyeSk6IFByb21pc2U8eyBlbnRyaWVzOiBRdWlja1BpY2tJbnB1dDxJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnk+W107IGlzU2luZ2xlQ29uZmlndXJlZD86IFRhc2sgfCBDb25maWd1cmluZ1Rhc2sgfT4ge1xuXHRcdGlmICh0aGlzLl90b3BMZXZlbEVudHJpZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHsgZW50cmllczogdGhpcy5fdG9wTGV2ZWxFbnRyaWVzIH07XG5cdFx0fVxuXHRcdGxldCByZWNlbnRUYXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10gPSAoYXdhaXQgdGhpcy5fdGFza1NlcnZpY2UuZ2V0U2F2ZWRUYXNrcygnaGlzdG9yaWNhbCcpKS5yZXZlcnNlKCk7XG5cdFx0Y29uc3QgY29uZmlndXJlZFRhc2tzOiAoVGFzayB8IENvbmZpZ3VyaW5nVGFzaylbXSA9IHRoaXMuX2hhbmRsZUZvbGRlclRhc2tSZXN1bHQoYXdhaXQgdGhpcy5fdGFza1NlcnZpY2UuZ2V0V29ya3NwYWNlVGFza3MoKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVGFza1R5cGVzID0gdGhpcy5fdGFza1NlcnZpY2UudGFza1R5cGVzKCk7XG5cdFx0dGhpcy5fdG9wTGV2ZWxFbnRyaWVzID0gW107XG5cdFx0Ly8gRGVkdXBlIHdpbGwgdXBkYXRlIHJlY2VudCB0YXNrcyBpZiB0aGV5J3ZlIGNoYW5nZWQgaW4gdGFza3MuanNvbi5cblx0XHRjb25zdCBkZWR1cGVBbmRQcnVuZSA9IHRoaXMuX2RlZHVwZUNvbmZpZ3VyZWRBbmRSZWNlbnQocmVjZW50VGFza3MsIGNvbmZpZ3VyZWRUYXNrcyk7XG5cdFx0Y29uc3QgZGVkdXBlZENvbmZpZ3VyZWRUYXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10gPSBkZWR1cGVBbmRQcnVuZS5jb25maWd1cmVkVGFza3M7XG5cdFx0cmVjZW50VGFza3MgPSBkZWR1cGVBbmRQcnVuZS5yZWNlbnRUYXNrcztcblx0XHRpZiAocmVjZW50VGFza3MubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgcmVtb3ZlUmVjZW50QnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUocmVtb3ZlVGFza0ljb24pLFxuXHRcdFx0XHR0b29sdGlwOiBubHMubG9jYWxpemUoJ3JlbW92ZVJlY2VudCcsICdSZW1vdmUgUmVjZW50bHkgVXNlZCBUYXNrJylcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9jcmVhdGVFbnRyaWVzRm9yR3JvdXAodGhpcy5fdG9wTGV2ZWxFbnRyaWVzLCByZWNlbnRUYXNrcywgbmxzLmxvY2FsaXplKCdyZWNlbnRseVVzZWQnLCAncmVjZW50bHkgdXNlZCcpLCBbcmVtb3ZlUmVjZW50QnV0dG9uXSk7XG5cdFx0fVxuXHRcdGlmIChjb25maWd1cmVkVGFza3MubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKGRlZHVwZWRDb25maWd1cmVkVGFza3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVFbnRyaWVzRm9yR3JvdXAodGhpcy5fdG9wTGV2ZWxFbnRyaWVzLCBkZWR1cGVkQ29uZmlndXJlZFRhc2tzLCBubHMubG9jYWxpemUoJ2NvbmZpZ3VyZWQnLCAnY29uZmlndXJlZCcpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGVmYXVsdEVudHJ5ICYmIChjb25maWd1cmVkVGFza3MubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0dGhpcy5fdG9wTGV2ZWxFbnRyaWVzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IG5scy5sb2NhbGl6ZSgnY29uZmlndXJlZCcsICdjb25maWd1cmVkJykgfSk7XG5cdFx0XHR0aGlzLl90b3BMZXZlbEVudHJpZXMucHVzaChkZWZhdWx0RW50cnkpO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb25UYXNrVHlwZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fY3JlYXRlVHlwZUVudHJpZXModGhpcy5fdG9wTGV2ZWxFbnRyaWVzLCBleHRlbnNpb25UYXNrVHlwZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBlbnRyaWVzOiB0aGlzLl90b3BMZXZlbEVudHJpZXMsIGlzU2luZ2xlQ29uZmlndXJlZDogY29uZmlndXJlZFRhc2tzLmxlbmd0aCA9PT0gMSA/IGNvbmZpZ3VyZWRUYXNrc1swXSA6IHVuZGVmaW5lZCB9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGhhbmRsZVNldHRpbmdPcHRpb24oc2VsZWN0ZWRUeXBlOiBzdHJpbmcpIHtcblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ1Rhc2tRdWlja1BpY2suY2hhbmdlU2V0dGluZ0RldGFpbHMnLFxuXHRcdFx0XHRcIlRhc2sgZGV0ZWN0aW9uIGZvciB7MH0gdGFza3MgY2F1c2VzIGZpbGVzIGluIGFueSB3b3Jrc3BhY2UgeW91IG9wZW4gdG8gYmUgcnVuIGFzIGNvZGUuIEVuYWJsaW5nIHswfSB0YXNrIGRldGVjdGlvbiBpcyBhIHVzZXIgc2V0dGluZyBhbmQgd2lsbCBhcHBseSB0byBhbnkgd29ya3NwYWNlIHlvdSBvcGVuLiBcXG5cXG4gRG8geW91IHdhbnQgdG8gZW5hYmxlIHswfSB0YXNrIGRldGVjdGlvbiBmb3IgYWxsIHdvcmtzcGFjZXM/XCIsIHNlbGVjdGVkVHlwZSksXG5cdFx0XHRjYW5jZWxCdXR0b246IG5scy5sb2NhbGl6ZSgnVGFza1F1aWNrUGljay5jaGFuZ2VTZXR0aW5nTm8nLCBcIk5vXCIpXG5cdFx0fSk7XG5cdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoYCR7c2VsZWN0ZWRUeXBlfS5hdXRvRGV0ZWN0YCwgJ29uJyk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZSgpLCAxMDApKTtcblx0XHRcdHJldHVybiB0aGlzLnNob3cobmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5waWNrUnVuVGFzaycsICdTZWxlY3QgdGhlIHRhc2sgdG8gcnVuJyksIHVuZGVmaW5lZCwgc2VsZWN0ZWRUeXBlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzaG93KHBsYWNlSG9sZGVyOiBzdHJpbmcsIGRlZmF1bHRFbnRyeT86IElUYXNrUXVpY2tQaWNrRW50cnksIHN0YXJ0QXRUeXBlPzogc3RyaW5nLCBuYW1lPzogc3RyaW5nKTogUHJvbWlzZTxUYXNrIHwgdW5kZWZpbmVkIHwgbnVsbD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHBpY2tlciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5Pih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdHBpY2tlci5wbGFjZWhvbGRlciA9IHBsYWNlSG9sZGVyO1xuXHRcdHBpY2tlci5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdHBpY2tlci5pZ25vcmVGb2N1c091dCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihhc3luYyAoY29udGV4dCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFzayA9IGNvbnRleHQuaXRlbS50YXNrO1xuXHRcdFx0aWYgKGNvbnRleHQuYnV0dG9uLmljb25DbGFzcyA9PT0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHJlbW92ZVRhc2tJY29uKSkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSAodGFzayAmJiAhVHlwZXMuaXNTdHJpbmcodGFzaykpID8gdGFzay5nZXRLZXkoKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRcdHRoaXMuX3Rhc2tTZXJ2aWNlLnJlbW92ZVJlY2VudGx5VXNlZFRhc2soa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBpbmRleFRvUmVtb3ZlID0gcGlja2VyLml0ZW1zLmluZGV4T2YoY29udGV4dC5pdGVtKTtcblx0XHRcdFx0aWYgKGluZGV4VG9SZW1vdmUgPj0gMCkge1xuXHRcdFx0XHRcdHBpY2tlci5pdGVtcyA9IFsuLi5waWNrZXIuaXRlbXMuc2xpY2UoMCwgaW5kZXhUb1JlbW92ZSksIC4uLnBpY2tlci5pdGVtcy5zbGljZShpbmRleFRvUmVtb3ZlICsgMSldO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRleHQuYnV0dG9uLmljb25DbGFzcyA9PT0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGNvbmZpZ3VyZVRhc2tJY29uKSkge1xuXHRcdFx0XHR0aGlzLl9xdWlja0lucHV0U2VydmljZS5jYW5jZWwoKTtcblx0XHRcdFx0aWYgKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdHRoaXMuX3Rhc2tTZXJ2aWNlLmN1c3RvbWl6ZSh0YXNrLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKEN1c3RvbVRhc2suaXModGFzaykgfHwgQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdFx0bGV0IGNhbk9wZW5Db25maWc6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y2FuT3BlbkNvbmZpZyA9IGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLm9wZW5Db25maWcodGFzayk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0Ly8gZG8gbm90aGluZy5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFjYW5PcGVuQ29uZmlnKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5jdXN0b21pemUodGFzaywgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aWYgKG5hbWUpIHtcblx0XHRcdHBpY2tlci52YWx1ZSA9IG5hbWU7XG5cdFx0fVxuXHRcdGxldCBmaXJzdExldmVsVGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzayB8IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGwgPSBzdGFydEF0VHlwZTtcblx0XHRpZiAoIWZpcnN0TGV2ZWxUYXNrKSB7XG5cdFx0XHQvLyBGaXJzdCBzaG93IHJlY2VudCB0YXNrcyBjb25maWd1cmVkIHRhc2tzLiBPdGhlciB0YXNrcyB3aWxsIGJlIGF2YWlsYWJsZSBhdCBhIHNlY29uZCBsZXZlbFxuXHRcdFx0Y29uc3QgdG9wTGV2ZWxFbnRyaWVzUmVzdWx0ID0gYXdhaXQgdGhpcy5nZXRUb3BMZXZlbEVudHJpZXMoZGVmYXVsdEVudHJ5KTtcblx0XHRcdGlmICh0b3BMZXZlbEVudHJpZXNSZXN1bHQuaXNTaW5nbGVDb25maWd1cmVkICYmIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFFVSUNLT1BFTl9TS0lQX0NPTkZJRykpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdG9UYXNrKHRvcExldmVsRW50cmllc1Jlc3VsdC5pc1NpbmdsZUNvbmZpZ3VyZWQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGFza1F1aWNrUGlja0VudHJpZXM6IFF1aWNrUGlja0lucHV0PElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeT5bXSA9IHRvcExldmVsRW50cmllc1Jlc3VsdC5lbnRyaWVzO1xuXHRcdFx0Zmlyc3RMZXZlbFRhc2sgPSBhd2FpdCB0aGlzLl9kb1BpY2tlckZpcnN0TGV2ZWwocGlja2VyLCB0YXNrUXVpY2tQaWNrRW50cmllcywgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblx0XHRkbyB7XG5cdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoZmlyc3RMZXZlbFRhc2spKSB7XG5cdFx0XHRcdGlmIChuYW1lKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZG9QaWNrZXJGaXJzdExldmVsKHBpY2tlciwgKGF3YWl0IHRoaXMuZ2V0VG9wTGV2ZWxFbnRyaWVzKGRlZmF1bHRFbnRyeSkpLmVudHJpZXMsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzZWxlY3RlZEVudHJ5ID0gYXdhaXQgdGhpcy5kb1BpY2tlclNlY29uZExldmVsKHBpY2tlciwgZGlzcG9zYWJsZXMsIGZpcnN0TGV2ZWxUYXNrKTtcblx0XHRcdFx0Ly8gUHJvY2VlZCB0byBzZWNvbmQgbGV2ZWwgb2YgcXVpY2sgcGlja1xuXHRcdFx0XHRpZiAoc2VsZWN0ZWRFbnRyeSAmJiAhc2VsZWN0ZWRFbnRyeS5zZXR0aW5nVHlwZSAmJiBzZWxlY3RlZEVudHJ5LnRhc2sgPT09IG51bGwpIHtcblx0XHRcdFx0XHQvLyBUaGUgdXNlciBoYXMgY2hvc2VuIHRvIGdvIGJhY2sgdG8gdGhlIGZpcnN0IGxldmVsXG5cdFx0XHRcdFx0cGlja2VyLnZhbHVlID0gJyc7XG5cdFx0XHRcdFx0Zmlyc3RMZXZlbFRhc2sgPSBhd2FpdCB0aGlzLl9kb1BpY2tlckZpcnN0TGV2ZWwocGlja2VyLCAoYXdhaXQgdGhpcy5nZXRUb3BMZXZlbEVudHJpZXMoZGVmYXVsdEVudHJ5KSkuZW50cmllcywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGVkRW50cnkgJiYgVHlwZXMuaXNTdHJpbmcoc2VsZWN0ZWRFbnRyeS5zZXR0aW5nVHlwZSkpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaGFuZGxlU2V0dGluZ09wdGlvbihzZWxlY3RlZEVudHJ5LnNldHRpbmdUeXBlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIChzZWxlY3RlZEVudHJ5Py50YXNrICYmICFUeXBlcy5pc1N0cmluZyhzZWxlY3RlZEVudHJ5Py50YXNrKSkgPyB0aGlzLl90b1Rhc2soc2VsZWN0ZWRFbnRyeT8udGFzaykgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZmlyc3RMZXZlbFRhc2spIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdG9UYXNrKGZpcnN0TGV2ZWxUYXNrKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIGZpcnN0TGV2ZWxUYXNrO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKDEpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cblxuXHRwcml2YXRlIGFzeW5jIF9kb1BpY2tlckZpcnN0TGV2ZWwocGlja2VyOiBJUXVpY2tQaWNrPElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB0YXNrUXVpY2tQaWNrRW50cmllczogUXVpY2tQaWNrSW5wdXQ8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5PltdLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTxUYXNrIHwgQ29uZmlndXJpbmdUYXNrIHwgc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdHBpY2tlci5pdGVtcyA9IHRhc2tRdWlja1BpY2tFbnRyaWVzO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzaG93V2l0aFBpbm5lZEl0ZW1zKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLCBydW5UYXNrU3RvcmFnZUtleSwgcGlja2VyLCB0cnVlKSk7XG5cdFx0Y29uc3QgZmlyc3RMZXZlbFBpY2tlclJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlPElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeSB8IHVuZGVmaW5lZCB8IG51bGw+KHJlc29sdmUgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UocGlja2VyLm9uRGlkQWNjZXB0KShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocGlja2VyLnNlbGVjdGVkSXRlbXMgPyBwaWNrZXIuc2VsZWN0ZWRJdGVtc1swXSA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGZpcnN0TGV2ZWxQaWNrZXJSZXN1bHQ/LnRhc2s7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZG9QaWNrZXJTZWNvbmRMZXZlbChwaWNrZXI6IElRdWlja1BpY2s8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5LCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHR5cGU6IHN0cmluZywgbmFtZT86IHN0cmluZykge1xuXHRcdHBpY2tlci5idXN5ID0gdHJ1ZTtcblx0XHRpZiAodHlwZSA9PT0gU0hPV19BTEwpIHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gKGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLnRhc2tzKCkpLmZpbHRlcih0ID0+ICF0LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmhpZGUpLnNvcnQoKGEsIGIpID0+IHRoaXMuX3NvcnRlci5jb21wYXJlKGEsIGIpKS5tYXAodGFzayA9PiB0aGlzLl9jcmVhdGVUYXNrRW50cnkodGFzaykpO1xuXHRcdFx0aXRlbXMucHVzaCguLi5UYXNrUXVpY2tQaWNrLmFsbFNldHRpbmdFbnRyaWVzKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0XHRwaWNrZXIuaXRlbXMgPSBpdGVtcztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cGlja2VyLnZhbHVlID0gbmFtZSB8fCAnJztcblx0XHRcdHBpY2tlci5pdGVtcyA9IGF3YWl0IHRoaXMuX2dldEVudHJpZXNGb3JQcm92aWRlcih0eXBlKTtcblx0XHR9XG5cdFx0YXdhaXQgcGlja2VyLnNob3coKTtcblx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdGNvbnN0IHNlY29uZExldmVsUGlja2VyUmVzdWx0ID0gYXdhaXQgbmV3IFByb21pc2U8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5IHwgdW5kZWZpbmVkIHwgbnVsbD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQub25jZShwaWNrZXIub25EaWRBY2NlcHQpKGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZShwaWNrZXIuc2VsZWN0ZWRJdGVtcyA/IHBpY2tlci5zZWxlY3RlZEl0ZW1zWzBdIDogdW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gc2Vjb25kTGV2ZWxQaWNrZXJSZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGFsbFNldHRpbmdFbnRyaWVzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiAoSVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5ICYgeyBzZXR0aW5nVHlwZTogc3RyaW5nIH0pW10ge1xuXHRcdGNvbnN0IGVudHJpZXM6IChJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnkgJiB7IHNldHRpbmdUeXBlOiBzdHJpbmcgfSlbXSA9IFtdO1xuXHRcdGNvbnN0IGdydW50RW50cnkgPSBUYXNrUXVpY2tQaWNrLmdldFNldHRpbmdFbnRyeShjb25maWd1cmF0aW9uU2VydmljZSwgJ2dydW50Jyk7XG5cdFx0aWYgKGdydW50RW50cnkpIHtcblx0XHRcdGVudHJpZXMucHVzaChncnVudEVudHJ5KTtcblx0XHR9XG5cdFx0Y29uc3QgZ3VscEVudHJ5ID0gVGFza1F1aWNrUGljay5nZXRTZXR0aW5nRW50cnkoY29uZmlndXJhdGlvblNlcnZpY2UsICdndWxwJyk7XG5cdFx0aWYgKGd1bHBFbnRyeSkge1xuXHRcdFx0ZW50cmllcy5wdXNoKGd1bHBFbnRyeSk7XG5cdFx0fVxuXHRcdGNvbnN0IGpha2VFbnRyeSA9IFRhc2tRdWlja1BpY2suZ2V0U2V0dGluZ0VudHJ5KGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAnamFrZScpO1xuXHRcdGlmIChqYWtlRW50cnkpIHtcblx0XHRcdGVudHJpZXMucHVzaChqYWtlRW50cnkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZW50cmllcztcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0U2V0dGluZ0VudHJ5KGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHR5cGU6IHN0cmluZyk6IChJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnkgJiB7IHNldHRpbmdUeXBlOiBzdHJpbmcgfSkgfCB1bmRlZmluZWQge1xuXHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShgJHt0eXBlfS5hdXRvRGV0ZWN0YCkgPT09ICdvZmYnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogJyQoZ2VhcikgJyArIG5scy5sb2NhbGl6ZSgnVGFza1F1aWNrUGljay5jaGFuZ2VTZXR0aW5nc09wdGlvbnMnLCBcInswfSB0YXNrIGRldGVjdGlvbiBpcyB0dXJuZWQgb2ZmLiBFbmFibGUgezF9IHRhc2sgZGV0ZWN0aW9uLi4uXCIsXG5cdFx0XHRcdFx0dHlwZVswXS50b1VwcGVyQ2FzZSgpICsgdHlwZS5zbGljZSgxKSwgdHlwZSksXG5cdFx0XHRcdHRhc2s6IG51bGwsXG5cdFx0XHRcdHNldHRpbmdUeXBlOiB0eXBlLFxuXHRcdFx0XHRhbHdheXNTaG93OiB0cnVlXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0RW50cmllc0ZvclByb3ZpZGVyKHR5cGU6IHN0cmluZyk6IFByb21pc2U8UXVpY2tQaWNrSW5wdXQ8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5PltdPiB7XG5cdFx0Y29uc3QgdGFza3MgPSAoYXdhaXQgdGhpcy5fdGFza1NlcnZpY2UudGFza3MoeyB0eXBlIH0pKS5zb3J0KChhLCBiKSA9PiB0aGlzLl9zb3J0ZXIuY29tcGFyZShhLCBiKSk7XG5cdFx0bGV0IHRhc2tRdWlja1BpY2tFbnRyaWVzOiBRdWlja1BpY2tJbnB1dDxJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnk+W10gPSBbXTtcblx0XHRpZiAodGFza3MubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdGlmICghdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5oaWRlKSB7XG5cdFx0XHRcdFx0dGFza1F1aWNrUGlja0VudHJpZXMucHVzaCh0aGlzLl9jcmVhdGVUYXNrRW50cnkodGFzaykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0YXNrUXVpY2tQaWNrRW50cmllcy5wdXNoKHtcblx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcidcblx0XHRcdH0sIHtcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1F1aWNrUGljay5nb0JhY2snLCAnR28gYmFjayBcdTIxQTknKSxcblx0XHRcdFx0dGFzazogbnVsbCxcblx0XHRcdFx0YWx3YXlzU2hvdzogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhc2tRdWlja1BpY2tFbnRyaWVzID0gW3tcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1F1aWNrUGljay5ub1Rhc2tzRm9yVHlwZScsICdObyB7MH0gdGFza3MgZm91bmQuIEdvIGJhY2sgXHUyMUE5JywgdHlwZSksXG5cdFx0XHRcdHRhc2s6IG51bGwsXG5cdFx0XHRcdGFsd2F5c1Nob3c6IHRydWVcblx0XHRcdH1dO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNldHRpbmdFbnRyeSA9IFRhc2tRdWlja1BpY2suZ2V0U2V0dGluZ0VudHJ5KHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0eXBlKTtcblx0XHRpZiAoc2V0dGluZ0VudHJ5KSB7XG5cdFx0XHR0YXNrUXVpY2tQaWNrRW50cmllcy5wdXNoKHNldHRpbmdFbnRyeSk7XG5cdFx0fVxuXHRcdHJldHVybiB0YXNrUXVpY2tQaWNrRW50cmllcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3RvVGFzayh0YXNrOiBUYXNrIHwgQ29uZmlndXJpbmdUYXNrKTogUHJvbWlzZTxUYXNrIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFDb25maWd1cmluZ1Rhc2suaXModGFzaykpIHtcblx0XHRcdHJldHVybiB0YXNrO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkVGFzayA9IGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLnRyeVJlc29sdmVUYXNrKHRhc2spO1xuXG5cdFx0aWYgKCFyZXNvbHZlZFRhc2spIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdub1Byb3ZpZGVyRm9yVGFzaycsIFwiVGhlcmUgaXMgbm8gdGFzayBwcm92aWRlciByZWdpc3RlcmVkIGZvciB0YXNrcyBvZiB0eXBlIFxcXCJ7MH1cXFwiLlwiLCB0YXNrLnR5cGUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc29sdmVkVGFzaztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxhQUFhO0FBQ3pCLFNBQWUsaUJBQWlCLFlBQVksdUJBQXdEO0FBRXBHLFlBQVksV0FBVztBQUN2QixTQUFTLG9CQUFnRDtBQUN6RCxTQUF3RSwwQkFBMEI7QUFDbEcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWUsK0JBQStCO0FBRXZELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBRXpCLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0sd0JBQXdCO0FBQzlCLFNBQVMsa0JBQWtCLFFBQW1FO0FBQ3BHLFNBQU8sU0FBUztBQUNqQjtBQVdBLE1BQU0sV0FBbUIsSUFBSSxTQUFTLHlCQUF5QixtQkFBbUI7QUFFM0UsTUFBTSxvQkFBb0IsYUFBYSx3QkFBd0IsUUFBUSxNQUFNLElBQUksU0FBUyxxQkFBcUIsaURBQWlELENBQUM7QUFDeEssTUFBTSxpQkFBaUIsYUFBYSxnQkFBZ0IsUUFBUSxPQUFPLElBQUksU0FBUyxrQkFBa0IsOENBQThDLENBQUM7QUFFakosTUFBTSxvQkFBb0I7QUFFbkIsSUFBTSxnQkFBTixjQUE0QixXQUFXO0FBQUEsRUFHN0MsWUFDdUIsY0FDUyx1QkFD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
