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
import { localize } from "../../../../nls.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { PickerQuickAccessProvider, TriggerAction } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { matchesFuzzy } from "../../../../base/common/filters.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ITaskService } from "../common/taskService.js";
import { CustomTask, ContributedTask, ConfiguringTask } from "../common/tasks.js";
import { TaskQuickPick } from "./taskQuickPick.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { isString } from "../../../../base/common/types.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
let TasksQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(extensionService, _taskService, _configurationService, _quickInputService, _notificationService, _dialogService, _themeService, _storageService) {
    super(TasksQuickAccessProvider.PREFIX, {
      noResultsPick: {
        label: localize("noTaskResults", "No matching tasks")
      }
    });
    this._taskService = _taskService;
    this._configurationService = _configurationService;
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._dialogService = _dialogService;
    this._themeService = _themeService;
    this._storageService = _storageService;
  }
  async _getPicks(filter, disposables, token) {
    if (token.isCancellationRequested) {
      return [];
    }
    const taskQuickPick = new TaskQuickPick(this._taskService, this._configurationService, this._quickInputService, this._notificationService, this._themeService, this._dialogService, this._storageService);
    const topLevelPicks = await taskQuickPick.getTopLevelEntries();
    const taskPicks = [];
    for (const entry of topLevelPicks.entries) {
      const highlights = matchesFuzzy(filter, entry.label);
      if (!highlights) {
        continue;
      }
      if (entry.type === "separator") {
        taskPicks.push(entry);
      }
      const task = entry.task;
      const quickAccessEntry = entry;
      quickAccessEntry.highlights = { label: highlights };
      quickAccessEntry.trigger = (index) => {
        if (index === 1 && quickAccessEntry.buttons?.length === 2) {
          const key = task && !isString(task) ? task.getKey() : void 0;
          if (key) {
            this._taskService.removeRecentlyUsedTask(key);
          }
          return TriggerAction.REFRESH_PICKER;
        } else {
          if (ContributedTask.is(task)) {
            this._taskService.customize(task, void 0, true);
          } else if (CustomTask.is(task)) {
            this._taskService.openConfig(task);
          }
          return TriggerAction.CLOSE_PICKER;
        }
      };
      quickAccessEntry.accept = async () => {
        if (isString(task)) {
          const showResult = await taskQuickPick.show(localize("TaskService.pickRunTask", "Select the task to run"), void 0, task);
          if (showResult) {
            this._taskService.run(showResult, { attachProblemMatcher: true });
          }
        } else {
          this._taskService.run(await this._toTask(task), { attachProblemMatcher: true });
        }
      };
      taskPicks.push(quickAccessEntry);
    }
    return taskPicks;
  }
  async _toTask(task) {
    if (!ConfiguringTask.is(task)) {
      return task;
    }
    return this._taskService.tryResolveTask(task);
  }
};
TasksQuickAccessProvider.PREFIX = "task ";
TasksQuickAccessProvider = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, ITaskService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IStorageService)
], TasksQuickAccessProvider);
export {
  TasksQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxicm93c2VyXFx0YXNrc1F1aWNrQWNjZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVF1aWNrUGlja1NlcGFyYXRvciwgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtLCBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyLCBUcmlnZ2VyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3BpY2tlclF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IG1hdGNoZXNGdXp6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElUYXNrU2VydmljZSwgVGFzayB9IGZyb20gJy4uL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21UYXNrLCBDb250cmlidXRlZFRhc2ssIENvbmZpZ3VyaW5nVGFzayB9IGZyb20gJy4uL2NvbW1vbi90YXNrcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGFza1F1aWNrUGljaywgSVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5IH0gZnJvbSAnLi90YXNrUXVpY2tQaWNrLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcblxuZXhwb3J0IGNsYXNzIFRhc2tzUXVpY2tBY2Nlc3NQcm92aWRlciBleHRlbmRzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8SVBpY2tlclF1aWNrQWNjZXNzSXRlbT4ge1xuXG5cdHN0YXRpYyBQUkVGSVggPSAndGFzayAnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVRhc2tTZXJ2aWNlIHByaXZhdGUgX3Rhc2tTZXJ2aWNlOiBJVGFza1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoVGFza3NRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCwge1xuXHRcdFx0bm9SZXN1bHRzUGljazoge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25vVGFza1Jlc3VsdHMnLCBcIk5vIG1hdGNoaW5nIHRhc2tzXCIpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX2dldFBpY2tzKGZpbHRlcjogc3RyaW5nLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFycmF5PElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yPj4ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhc2tRdWlja1BpY2sgPSBuZXcgVGFza1F1aWNrUGljayh0aGlzLl90YXNrU2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLCB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLCB0aGlzLl90aGVtZVNlcnZpY2UsIHRoaXMuX2RpYWxvZ1NlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCB0b3BMZXZlbFBpY2tzID0gYXdhaXQgdGFza1F1aWNrUGljay5nZXRUb3BMZXZlbEVudHJpZXMoKTtcblx0XHRjb25zdCB0YXNrUGlja3M6IEFycmF5PElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yPiA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0b3BMZXZlbFBpY2tzLmVudHJpZXMpIHtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodHMgPSBtYXRjaGVzRnV6enkoZmlsdGVyLCBlbnRyeS5sYWJlbCEpO1xuXHRcdFx0aWYgKCFoaWdobGlnaHRzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZW50cnkudHlwZSA9PT0gJ3NlcGFyYXRvcicpIHtcblx0XHRcdFx0dGFza1BpY2tzLnB1c2goZW50cnkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXNrOiBUYXNrIHwgQ29uZmlndXJpbmdUYXNrIHwgc3RyaW5nID0gKDxJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnk+ZW50cnkpLnRhc2shO1xuXHRcdFx0Y29uc3QgcXVpY2tBY2Nlc3NFbnRyeTogSVBpY2tlclF1aWNrQWNjZXNzSXRlbSA9IDxJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnk+ZW50cnk7XG5cdFx0XHRxdWlja0FjY2Vzc0VudHJ5LmhpZ2hsaWdodHMgPSB7IGxhYmVsOiBoaWdobGlnaHRzIH07XG5cdFx0XHRxdWlja0FjY2Vzc0VudHJ5LnRyaWdnZXIgPSAoaW5kZXgpID0+IHtcblx0XHRcdFx0aWYgKChpbmRleCA9PT0gMSkgJiYgKHF1aWNrQWNjZXNzRW50cnkuYnV0dG9ucz8ubGVuZ3RoID09PSAyKSkge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9ICh0YXNrICYmICFpc1N0cmluZyh0YXNrKSkgPyB0YXNrLmdldEtleSgpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChrZXkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Rhc2tTZXJ2aWNlLnJlbW92ZVJlY2VudGx5VXNlZFRhc2soa2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uUkVGUkVTSF9QSUNLRVI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGFza1NlcnZpY2UuY3VzdG9taXplKHRhc2ssIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChDdXN0b21UYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5vcGVuQ29uZmlnKHRhc2spO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gVHJpZ2dlckFjdGlvbi5DTE9TRV9QSUNLRVI7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRxdWlja0FjY2Vzc0VudHJ5LmFjY2VwdCA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKGlzU3RyaW5nKHRhc2spKSB7XG5cdFx0XHRcdFx0Ly8gc3dpdGNoIHRvIHF1aWNrIHBpY2sgYW5kIHNob3cgc2Vjb25kIGxldmVsXG5cdFx0XHRcdFx0Y29uc3Qgc2hvd1Jlc3VsdCA9IGF3YWl0IHRhc2tRdWlja1BpY2suc2hvdyhsb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja1J1blRhc2snLCAnU2VsZWN0IHRoZSB0YXNrIHRvIHJ1bicpLCB1bmRlZmluZWQsIHRhc2spO1xuXHRcdFx0XHRcdGlmIChzaG93UmVzdWx0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5ydW4oc2hvd1Jlc3VsdCwgeyBhdHRhY2hQcm9ibGVtTWF0Y2hlcjogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fdGFza1NlcnZpY2UucnVuKGF3YWl0IHRoaXMuX3RvVGFzayh0YXNrKSwgeyBhdHRhY2hQcm9ibGVtTWF0Y2hlcjogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0dGFza1BpY2tzLnB1c2gocXVpY2tBY2Nlc3NFbnRyeSk7XG5cdFx0fVxuXHRcdHJldHVybiB0YXNrUGlja3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF90b1Rhc2sodGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzayk6IFByb21pc2U8VGFzayB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRyZXR1cm4gdGFzaztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fdGFza1NlcnZpY2UudHJ5UmVzb2x2ZVRhc2sodGFzayk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBOEIsMEJBQTBCO0FBQ3hELFNBQWlDLDJCQUEyQixxQkFBcUI7QUFDakYsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7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
