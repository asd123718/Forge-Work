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
import { toAction } from "../../../../base/common/actions.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { createErrorWithActions } from "../../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import severity from "../../../../base/common/severity.js";
import * as nls from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL } from "./debugCommands.js";
import { Markers } from "../../markers/common/markers.js";
import { ConfiguringTask, CustomTask, TaskEventKind } from "../../tasks/common/tasks.js";
import { ITaskService } from "../../tasks/common/taskService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
const onceFilter = (event, filter) => Event.once(Event.filter(event, filter));
var TaskRunResult = /* @__PURE__ */ ((TaskRunResult2) => {
  TaskRunResult2[TaskRunResult2["Failure"] = 0] = "Failure";
  TaskRunResult2[TaskRunResult2["Success"] = 1] = "Success";
  return TaskRunResult2;
})(TaskRunResult || {});
const DEBUG_TASK_ERROR_CHOICE_KEY = "debug.taskerrorchoice";
const ABORT_LABEL = nls.localize("abort", "Abort");
const DEBUG_ANYWAY_LABEL = nls.localize({ key: "debugAnyway", comment: ["&& denotes a mnemonic"] }, "&&Debug Anyway");
const DEBUG_ANYWAY_LABEL_NO_MEMO = nls.localize("debugAnywayNoMemo", "Debug Anyway");
let DebugTaskRunner = class {
  constructor(taskService, markerService, configurationService, viewsService, dialogService, storageService, commandService, progressService) {
    this.taskService = taskService;
    this.markerService = markerService;
    this.configurationService = configurationService;
    this.viewsService = viewsService;
    this.dialogService = dialogService;
    this.storageService = storageService;
    this.commandService = commandService;
    this.progressService = progressService;
    this.globalCancellation = new CancellationTokenSource();
  }
  cancel() {
    this.globalCancellation.dispose(true);
    this.globalCancellation = new CancellationTokenSource();
  }
  dispose() {
    this.globalCancellation.dispose(true);
  }
  async runTaskAndCheckErrors(root, taskId) {
    try {
      const taskSummary = await this.runTask(root, taskId, this.globalCancellation.token);
      if (taskSummary && (taskSummary.exitCode === void 0 || taskSummary.cancelled)) {
        return 0 /* Failure */;
      }
      const errorCount = taskId ? this.markerService.read({ severities: MarkerSeverity.Error, take: 2 }).length : 0;
      const successExitCode = taskSummary && taskSummary.exitCode === 0;
      const failureExitCode = taskSummary && taskSummary.exitCode !== 0;
      const onTaskErrors = this.configurationService.getValue("debug").onTaskErrors;
      if (successExitCode || onTaskErrors === "debugAnyway" || errorCount === 0 && !failureExitCode) {
        return 1 /* Success */;
      }
      if (onTaskErrors === "showErrors") {
        await this.viewsService.openView(Markers.MARKERS_VIEW_ID, true);
        return Promise.resolve(0 /* Failure */);
      }
      if (onTaskErrors === "abort") {
        return Promise.resolve(0 /* Failure */);
      }
      const taskLabel = typeof taskId === "string" ? taskId : taskId ? taskId.name : "";
      const message = errorCount > 1 ? nls.localize("preLaunchTaskErrors", "Errors exist after running preLaunchTask '{0}'.", taskLabel) : errorCount === 1 ? nls.localize("preLaunchTaskError", "Error exists after running preLaunchTask '{0}'.", taskLabel) : taskSummary && typeof taskSummary.exitCode === "number" ? nls.localize("preLaunchTaskExitCode", "The preLaunchTask '{0}' terminated with exit code {1}.", taskLabel, taskSummary.exitCode) : nls.localize("preLaunchTaskTerminated", "The preLaunchTask '{0}' terminated.", taskLabel);
      let DebugChoice;
      ((DebugChoice2) => {
        DebugChoice2[DebugChoice2["DebugAnyway"] = 1] = "DebugAnyway";
        DebugChoice2[DebugChoice2["ShowErrors"] = 2] = "ShowErrors";
        DebugChoice2[DebugChoice2["Cancel"] = 0] = "Cancel";
      })(DebugChoice || (DebugChoice = {}));
      const { result, checkboxChecked } = await this.dialogService.prompt({
        type: severity.Warning,
        message,
        buttons: [
          {
            label: DEBUG_ANYWAY_LABEL,
            run: () => 1 /* DebugAnyway */
          },
          {
            label: nls.localize({ key: "showErrors", comment: ["&& denotes a mnemonic"] }, "&&Show Errors"),
            run: () => 2 /* ShowErrors */
          }
        ],
        cancelButton: {
          label: ABORT_LABEL,
          run: () => 0 /* Cancel */
        },
        checkbox: {
          label: nls.localize("remember", "Remember my choice in user settings")
        }
      });
      const debugAnyway = result === 1 /* DebugAnyway */;
      const abort = result === 0 /* Cancel */;
      if (checkboxChecked) {
        this.configurationService.updateValue("debug.onTaskErrors", result === 1 /* DebugAnyway */ ? "debugAnyway" : abort ? "abort" : "showErrors");
      }
      if (abort) {
        return Promise.resolve(0 /* Failure */);
      }
      if (debugAnyway) {
        return 1 /* Success */;
      }
      await this.viewsService.openView(Markers.MARKERS_VIEW_ID, true);
      return Promise.resolve(0 /* Failure */);
    } catch (err) {
      const taskConfigureAction = this.taskService.configureAction();
      const choiceMap = JSON.parse(this.storageService.get(DEBUG_TASK_ERROR_CHOICE_KEY, StorageScope.WORKSPACE, "{}"));
      let choice = -1;
      let DebugChoice;
      ((DebugChoice2) => {
        DebugChoice2[DebugChoice2["DebugAnyway"] = 0] = "DebugAnyway";
        DebugChoice2[DebugChoice2["ConfigureTask"] = 1] = "ConfigureTask";
        DebugChoice2[DebugChoice2["Cancel"] = 2] = "Cancel";
      })(DebugChoice || (DebugChoice = {}));
      if (choiceMap[err.message] !== void 0) {
        choice = choiceMap[err.message];
      } else {
        const { result, checkboxChecked } = await this.dialogService.prompt({
          type: severity.Error,
          message: err.message,
          buttons: [
            {
              label: nls.localize({ key: "debugAnyway", comment: ["&& denotes a mnemonic"] }, "&&Debug Anyway"),
              run: () => 0 /* DebugAnyway */
            },
            {
              label: taskConfigureAction.label,
              run: () => 1 /* ConfigureTask */
            }
          ],
          cancelButton: {
            run: () => 2 /* Cancel */
          },
          checkbox: {
            label: nls.localize("rememberTask", "Remember my choice for this task")
          }
        });
        choice = result;
        if (checkboxChecked) {
          choiceMap[err.message] = choice;
          this.storageService.store(DEBUG_TASK_ERROR_CHOICE_KEY, JSON.stringify(choiceMap), StorageScope.WORKSPACE, StorageTarget.MACHINE);
        }
      }
      if (choice === 1 /* ConfigureTask */) {
        await taskConfigureAction.run();
      }
      return choice === 0 /* DebugAnyway */ ? 1 /* Success */ : 0 /* Failure */;
    }
  }
  async runTask(root, taskId, token = this.globalCancellation.token) {
    if (!taskId) {
      return Promise.resolve(null);
    }
    if (!root) {
      return Promise.reject(new Error(nls.localize("invalidTaskReference", "Task '{0}' can not be referenced from a launch configuration that is in a different workspace folder.", typeof taskId === "string" ? taskId : taskId.type)));
    }
    const task = await this.taskService.getTask(root, taskId);
    if (!task) {
      const errorMessage = typeof taskId === "string" ? nls.localize("DebugTaskNotFoundWithTaskId", "Could not find the task '{0}'.", taskId) : nls.localize("DebugTaskNotFound", "Could not find the specified task.");
      return Promise.reject(createErrorWithActions(errorMessage, [toAction({ id: DEBUG_CONFIGURE_COMMAND_ID, label: DEBUG_CONFIGURE_LABEL, enabled: true, run: () => this.commandService.executeCommand(DEBUG_CONFIGURE_COMMAND_ID) })]));
    }
    let taskStarted = false;
    const store = new DisposableStore();
    const getTaskKey = (t) => t.getKey() ?? t.getMapKey();
    const taskKey = getTaskKey(task);
    const inactivePromise = new Promise((resolve) => store.add(
      onceFilter(this.taskService.onDidStateChange, (e) => {
        return (e.kind === TaskEventKind.Inactive || e.kind === TaskEventKind.ProcessEnded && e.exitCode === void 0) && getTaskKey(e.__task) === taskKey;
      })((e) => {
        taskStarted = true;
        resolve(e.kind === TaskEventKind.ProcessEnded ? { exitCode: e.exitCode } : null);
      })
    ));
    store.add(
      onceFilter(
        this.taskService.onDidStateChange,
        (e) => (e.kind === TaskEventKind.Active || e.kind === TaskEventKind.DependsOnStarted) && getTaskKey(e.__task) === taskKey
      )(() => {
        taskStarted = true;
      })
    );
    const didAcquireInput = store.add(new Emitter());
    store.add(onceFilter(
      this.taskService.onDidStateChange,
      (e) => e.kind === TaskEventKind.AcquiredInput && getTaskKey(e.__task) === taskKey
    )(() => didAcquireInput.fire()));
    const taskDonePromise = this.taskService.getActiveTasks().then(async (tasks) => {
      if (tasks.find((t) => getTaskKey(t) === taskKey)) {
        didAcquireInput.fire();
        const busyTasks = await this.taskService.getBusyTasks();
        if (busyTasks.find((t) => getTaskKey(t) === taskKey)) {
          taskStarted = true;
          return inactivePromise;
        }
        return Promise.resolve(null);
      }
      const taskPromise = this.taskService.run(task);
      if (task.configurationProperties.isBackground) {
        return inactivePromise;
      }
      return taskPromise.then((x) => x ?? null);
    });
    const result = new Promise((resolve, reject) => {
      taskDonePromise.then((result2) => {
        taskStarted = true;
        resolve(result2);
      }, (error) => reject(error));
      store.add(token.onCancellationRequested(() => {
        resolve({ exitCode: void 0, cancelled: true });
        this.taskService.terminate(task).catch(() => {
        });
      }));
      store.add(didAcquireInput.event(() => {
        const waitTime = task.configurationProperties.isBackground ? 5e3 : 1e4;
        store.add(disposableTimeout(() => {
          if (!taskStarted) {
            const errorMessage = nls.localize("taskNotTracked", "The task '{0}' has not exited and doesn't have a 'problemMatcher' defined. Make sure to define a problem matcher for watch tasks.", typeof taskId === "string" ? taskId : JSON.stringify(taskId));
            reject({ severity: severity.Error, message: errorMessage });
          }
        }, waitTime));
        const hideSlowPreLaunchWarning = this.configurationService.getValue("debug").hideSlowPreLaunchWarning;
        if (!hideSlowPreLaunchWarning) {
          store.add(disposableTimeout(() => {
            const message = nls.localize("runningTask", "Waiting for preLaunchTask '{0}'...", task.configurationProperties.name);
            const buttons = [DEBUG_ANYWAY_LABEL_NO_MEMO, ABORT_LABEL];
            const canConfigure = task instanceof CustomTask || task instanceof ConfiguringTask;
            if (canConfigure) {
              buttons.splice(1, 0, nls.localize("configureTask", "Configure Task"));
            }
            this.progressService.withProgress(
              { location: ProgressLocation.Notification, title: message, buttons },
              () => result.catch(() => {
              }),
              (choice) => {
                if (choice === void 0) {
                } else if (choice === 0) {
                  resolve({ exitCode: 0 });
                } else {
                  resolve({ exitCode: void 0, cancelled: true });
                  this.taskService.terminate(task).catch(() => {
                  });
                  if (canConfigure && choice === 1) {
                    this.taskService.openConfig(task);
                  }
                }
              }
            );
          }, 1e4));
        }
      }));
    });
    return result.finally(() => store.dispose());
  }
};
DebugTaskRunner = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IViewsService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IProgressService)
], DebugTaskRunner);
export {
  DebugTaskRunner,
  TaskRunResult
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z1Rhc2tSdW5uZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVFcnJvcldpdGhBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgc2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UsIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgREVCVUdfQ09ORklHVVJFX0NPTU1BTkRfSUQsIERFQlVHX0NPTkZJR1VSRV9MQUJFTCB9IGZyb20gJy4vZGVidWdDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGVidWdDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IE1hcmtlcnMgfSBmcm9tICcuLi8uLi9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyaW5nVGFzaywgQ3VzdG9tVGFzaywgSVRhc2tFdmVudCwgSVRhc2tJZGVudGlmaWVyLCBUYXNrLCBUYXNrRXZlbnRLaW5kIH0gZnJvbSAnLi4vLi4vdGFza3MvY29tbW9uL3Rhc2tzLmpzJztcbmltcG9ydCB7IElUYXNrU2VydmljZSwgSVRhc2tTdW1tYXJ5IH0gZnJvbSAnLi4vLi4vdGFza3MvY29tbW9uL3Rhc2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcblxuY29uc3Qgb25jZUZpbHRlciA9IChldmVudDogRXZlbnQ8SVRhc2tFdmVudD4sIGZpbHRlcjogKGU6IElUYXNrRXZlbnQpID0+IGJvb2xlYW4pID0+IEV2ZW50Lm9uY2UoRXZlbnQuZmlsdGVyKGV2ZW50LCBmaWx0ZXIpKTtcblxuZXhwb3J0IGNvbnN0IGVudW0gVGFza1J1blJlc3VsdCB7XG5cdEZhaWx1cmUsXG5cdFN1Y2Nlc3Ncbn1cblxuY29uc3QgREVCVUdfVEFTS19FUlJPUl9DSE9JQ0VfS0VZID0gJ2RlYnVnLnRhc2tlcnJvcmNob2ljZSc7XG5jb25zdCBBQk9SVF9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnYWJvcnQnLCBcIkFib3J0XCIpO1xuY29uc3QgREVCVUdfQU5ZV0FZX0xBQkVMID0gbmxzLmxvY2FsaXplKHsga2V5OiAnZGVidWdBbnl3YXknLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZEZWJ1ZyBBbnl3YXlcIik7XG5jb25zdCBERUJVR19BTllXQVlfTEFCRUxfTk9fTUVNTyA9IG5scy5sb2NhbGl6ZSgnZGVidWdBbnl3YXlOb01lbW8nLCBcIkRlYnVnIEFueXdheVwiKTtcblxuaW50ZXJmYWNlIElSdW5uZXJUYXNrU3VtbWFyeSBleHRlbmRzIElUYXNrU3VtbWFyeSB7XG5cdGNhbmNlbGxlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Rhc2tSdW5uZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBnbG9iYWxDYW5jZWxsYXRpb24gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRhc2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGFza1NlcnZpY2U6IElUYXNrU2VydmljZSxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0KSB7IH1cblxuXHRjYW5jZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5nbG9iYWxDYW5jZWxsYXRpb24uZGlzcG9zZSh0cnVlKTtcblx0XHR0aGlzLmdsb2JhbENhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5nbG9iYWxDYW5jZWxsYXRpb24uZGlzcG9zZSh0cnVlKTtcblx0fVxuXG5cdGFzeW5jIHJ1blRhc2tBbmRDaGVja0Vycm9ycyhcblx0XHRyb290OiBJV29ya3NwYWNlRm9sZGVyIHwgSVdvcmtzcGFjZSB8IHVuZGVmaW5lZCxcblx0XHR0YXNrSWQ6IHN0cmluZyB8IElUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTxUYXNrUnVuUmVzdWx0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRhc2tTdW1tYXJ5ID0gYXdhaXQgdGhpcy5ydW5UYXNrKHJvb3QsIHRhc2tJZCwgdGhpcy5nbG9iYWxDYW5jZWxsYXRpb24udG9rZW4pO1xuXHRcdFx0aWYgKHRhc2tTdW1tYXJ5ICYmICh0YXNrU3VtbWFyeS5leGl0Q29kZSA9PT0gdW5kZWZpbmVkIHx8IHRhc2tTdW1tYXJ5LmNhbmNlbGxlZCkpIHtcblx0XHRcdFx0Ly8gVXNlciBjYW5jZWxlZCwgZWl0aGVyIGRlYnVnZ2luZywgb3IgdGhlIHByZWxhdW5jaCB0YXNrXG5cdFx0XHRcdHJldHVybiBUYXNrUnVuUmVzdWx0LkZhaWx1cmU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVycm9yQ291bnQgPSB0YXNrSWQgPyB0aGlzLm1hcmtlclNlcnZpY2UucmVhZCh7IHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkVycm9yLCB0YWtlOiAyIH0pLmxlbmd0aCA6IDA7XG5cdFx0XHRjb25zdCBzdWNjZXNzRXhpdENvZGUgPSB0YXNrU3VtbWFyeSAmJiB0YXNrU3VtbWFyeS5leGl0Q29kZSA9PT0gMDtcblx0XHRcdGNvbnN0IGZhaWx1cmVFeGl0Q29kZSA9IHRhc2tTdW1tYXJ5ICYmIHRhc2tTdW1tYXJ5LmV4aXRDb2RlICE9PSAwO1xuXHRcdFx0Y29uc3Qgb25UYXNrRXJyb3JzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5vblRhc2tFcnJvcnM7XG5cdFx0XHRpZiAoc3VjY2Vzc0V4aXRDb2RlIHx8IG9uVGFza0Vycm9ycyA9PT0gJ2RlYnVnQW55d2F5JyB8fCAoZXJyb3JDb3VudCA9PT0gMCAmJiAhZmFpbHVyZUV4aXRDb2RlKSkge1xuXHRcdFx0XHRyZXR1cm4gVGFza1J1blJlc3VsdC5TdWNjZXNzO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9uVGFza0Vycm9ycyA9PT0gJ3Nob3dFcnJvcnMnKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3KE1hcmtlcnMuTUFSS0VSU19WSUVXX0lELCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShUYXNrUnVuUmVzdWx0LkZhaWx1cmUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9uVGFza0Vycm9ycyA9PT0gJ2Fib3J0Jykge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFRhc2tSdW5SZXN1bHQuRmFpbHVyZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhc2tMYWJlbCA9IHR5cGVvZiB0YXNrSWQgPT09ICdzdHJpbmcnID8gdGFza0lkIDogdGFza0lkID8gdGFza0lkLm5hbWUgYXMgc3RyaW5nIDogJyc7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyb3JDb3VudCA+IDFcblx0XHRcdFx0PyBubHMubG9jYWxpemUoJ3ByZUxhdW5jaFRhc2tFcnJvcnMnLCBcIkVycm9ycyBleGlzdCBhZnRlciBydW5uaW5nIHByZUxhdW5jaFRhc2sgJ3swfScuXCIsIHRhc2tMYWJlbClcblx0XHRcdFx0OiBlcnJvckNvdW50ID09PSAxXG5cdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ3ByZUxhdW5jaFRhc2tFcnJvcicsIFwiRXJyb3IgZXhpc3RzIGFmdGVyIHJ1bm5pbmcgcHJlTGF1bmNoVGFzayAnezB9Jy5cIiwgdGFza0xhYmVsKVxuXHRcdFx0XHRcdDogdGFza1N1bW1hcnkgJiYgdHlwZW9mIHRhc2tTdW1tYXJ5LmV4aXRDb2RlID09PSAnbnVtYmVyJ1xuXHRcdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ3ByZUxhdW5jaFRhc2tFeGl0Q29kZScsIFwiVGhlIHByZUxhdW5jaFRhc2sgJ3swfScgdGVybWluYXRlZCB3aXRoIGV4aXQgY29kZSB7MX0uXCIsIHRhc2tMYWJlbCwgdGFza1N1bW1hcnkuZXhpdENvZGUpXG5cdFx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgncHJlTGF1bmNoVGFza1Rlcm1pbmF0ZWQnLCBcIlRoZSBwcmVMYXVuY2hUYXNrICd7MH0nIHRlcm1pbmF0ZWQuXCIsIHRhc2tMYWJlbCk7XG5cblx0XHRcdGVudW0gRGVidWdDaG9pY2Uge1xuXHRcdFx0XHREZWJ1Z0FueXdheSA9IDEsXG5cdFx0XHRcdFNob3dFcnJvcnMgPSAyLFxuXHRcdFx0XHRDYW5jZWwgPSAwXG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IHJlc3VsdCwgY2hlY2tib3hDaGVja2VkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0PERlYnVnQ2hvaWNlPih7XG5cdFx0XHRcdHR5cGU6IHNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogREVCVUdfQU5ZV0FZX0xBQkVMLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBEZWJ1Z0Nob2ljZS5EZWJ1Z0FueXdheVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ3Nob3dFcnJvcnMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTaG93IEVycm9yc1wiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gRGVidWdDaG9pY2UuU2hvd0Vycm9yc1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0bGFiZWw6IEFCT1JUX0xBQkVMLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gRGVidWdDaG9pY2UuQ2FuY2VsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNoZWNrYm94OiB7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtZW1iZXInLCBcIlJlbWVtYmVyIG15IGNob2ljZSBpbiB1c2VyIHNldHRpbmdzXCIpLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXG5cdFx0XHRjb25zdCBkZWJ1Z0FueXdheSA9IHJlc3VsdCA9PT0gRGVidWdDaG9pY2UuRGVidWdBbnl3YXk7XG5cdFx0XHRjb25zdCBhYm9ydCA9IHJlc3VsdCA9PT0gRGVidWdDaG9pY2UuQ2FuY2VsO1xuXHRcdFx0aWYgKGNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdkZWJ1Zy5vblRhc2tFcnJvcnMnLCByZXN1bHQgPT09IERlYnVnQ2hvaWNlLkRlYnVnQW55d2F5ID8gJ2RlYnVnQW55d2F5JyA6IGFib3J0ID8gJ2Fib3J0JyA6ICdzaG93RXJyb3JzJyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhYm9ydCkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFRhc2tSdW5SZXN1bHQuRmFpbHVyZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGVidWdBbnl3YXkpIHtcblx0XHRcdFx0cmV0dXJuIFRhc2tSdW5SZXN1bHQuU3VjY2Vzcztcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy52aWV3c1NlcnZpY2Uub3BlblZpZXcoTWFya2Vycy5NQVJLRVJTX1ZJRVdfSUQsIHRydWUpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShUYXNrUnVuUmVzdWx0LkZhaWx1cmUpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgdGFza0NvbmZpZ3VyZUFjdGlvbiA9IHRoaXMudGFza1NlcnZpY2UuY29uZmlndXJlQWN0aW9uKCk7XG5cdFx0XHRjb25zdCBjaG9pY2VNYXA6IHsgW2tleTogc3RyaW5nXTogbnVtYmVyIH0gPSBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KERFQlVHX1RBU0tfRVJST1JfQ0hPSUNFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ3t9JykpO1xuXG5cdFx0XHRsZXQgY2hvaWNlID0gLTE7XG5cdFx0XHRlbnVtIERlYnVnQ2hvaWNlIHtcblx0XHRcdFx0RGVidWdBbnl3YXkgPSAwLFxuXHRcdFx0XHRDb25maWd1cmVUYXNrID0gMSxcblx0XHRcdFx0Q2FuY2VsID0gMlxuXHRcdFx0fVxuXHRcdFx0aWYgKGNob2ljZU1hcFtlcnIubWVzc2FnZV0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjaG9pY2UgPSBjaG9pY2VNYXBbZXJyLm1lc3NhZ2VdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgeyByZXN1bHQsIGNoZWNrYm94Q2hlY2tlZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdDxEZWJ1Z0Nob2ljZT4oe1xuXHRcdFx0XHRcdHR5cGU6IHNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGVyci5tZXNzYWdlLFxuXHRcdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2RlYnVnQW55d2F5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRGVidWcgQW55d2F5XCIpLFxuXHRcdFx0XHRcdFx0XHRydW46ICgpID0+IERlYnVnQ2hvaWNlLkRlYnVnQW55d2F5XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogdGFza0NvbmZpZ3VyZUFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBEZWJ1Z0Nob2ljZS5Db25maWd1cmVUYXNrXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gRGVidWdDaG9pY2UuQ2FuY2VsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtZW1iZXJUYXNrJywgXCJSZW1lbWJlciBteSBjaG9pY2UgZm9yIHRoaXMgdGFza1wiKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNob2ljZSA9IHJlc3VsdDtcblx0XHRcdFx0aWYgKGNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHRcdGNob2ljZU1hcFtlcnIubWVzc2FnZV0gPSBjaG9pY2U7XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShERUJVR19UQVNLX0VSUk9SX0NIT0lDRV9LRVksIEpTT04uc3RyaW5naWZ5KGNob2ljZU1hcCksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNob2ljZSA9PT0gRGVidWdDaG9pY2UuQ29uZmlndXJlVGFzaykge1xuXHRcdFx0XHRhd2FpdCB0YXNrQ29uZmlndXJlQWN0aW9uLnJ1bigpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2hvaWNlID09PSBEZWJ1Z0Nob2ljZS5EZWJ1Z0FueXdheSA/IFRhc2tSdW5SZXN1bHQuU3VjY2VzcyA6IFRhc2tSdW5SZXN1bHQuRmFpbHVyZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBydW5UYXNrKHJvb3Q6IElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCB0YXNrSWQ6IHN0cmluZyB8IElUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZCwgdG9rZW4gPSB0aGlzLmdsb2JhbENhbmNlbGxhdGlvbi50b2tlbik6IFByb21pc2U8SVJ1bm5lclRhc2tTdW1tYXJ5IHwgbnVsbD4ge1xuXHRcdGlmICghdGFza0lkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdH1cblx0XHRpZiAoIXJvb3QpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkVGFza1JlZmVyZW5jZScsIFwiVGFzayAnezB9JyBjYW4gbm90IGJlIHJlZmVyZW5jZWQgZnJvbSBhIGxhdW5jaCBjb25maWd1cmF0aW9uIHRoYXQgaXMgaW4gYSBkaWZmZXJlbnQgd29ya3NwYWNlIGZvbGRlci5cIiwgdHlwZW9mIHRhc2tJZCA9PT0gJ3N0cmluZycgPyB0YXNrSWQgOiB0YXNrSWQudHlwZSkpKTtcblx0XHR9XG5cdFx0Ly8gcnVuIGEgdGFzayBiZWZvcmUgc3RhcnRpbmcgYSBkZWJ1ZyBzZXNzaW9uXG5cdFx0Y29uc3QgdGFzayA9IGF3YWl0IHRoaXMudGFza1NlcnZpY2UuZ2V0VGFzayhyb290LCB0YXNrSWQpO1xuXHRcdGlmICghdGFzaykge1xuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gdHlwZW9mIHRhc2tJZCA9PT0gJ3N0cmluZydcblx0XHRcdFx0PyBubHMubG9jYWxpemUoJ0RlYnVnVGFza05vdEZvdW5kV2l0aFRhc2tJZCcsIFwiQ291bGQgbm90IGZpbmQgdGhlIHRhc2sgJ3swfScuXCIsIHRhc2tJZClcblx0XHRcdFx0OiBubHMubG9jYWxpemUoJ0RlYnVnVGFza05vdEZvdW5kJywgXCJDb3VsZCBub3QgZmluZCB0aGUgc3BlY2lmaWVkIHRhc2suXCIpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGNyZWF0ZUVycm9yV2l0aEFjdGlvbnMoZXJyb3JNZXNzYWdlLCBbdG9BY3Rpb24oeyBpZDogREVCVUdfQ09ORklHVVJFX0NPTU1BTkRfSUQsIGxhYmVsOiBERUJVR19DT05GSUdVUkVfTEFCRUwsIGVuYWJsZWQ6IHRydWUsIHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChERUJVR19DT05GSUdVUkVfQ09NTUFORF9JRCkgfSldKSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgYSB0YXNrIGlzIG1pc3NpbmcgdGhlIHByb2JsZW0gbWF0Y2hlciB0aGUgcHJvbWlzZSB3aWxsIG5ldmVyIGNvbXBsZXRlLCBzbyB3ZSBuZWVkIHRvIGhhdmUgYSB3b3JrYXJvdW5kICMzNTM0MFxuXHRcdGxldCB0YXNrU3RhcnRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGdldFRhc2tLZXkgPSAodDogVGFzaykgPT4gdC5nZXRLZXkoKSA/PyB0LmdldE1hcEtleSgpO1xuXHRcdGNvbnN0IHRhc2tLZXkgPSBnZXRUYXNrS2V5KHRhc2spO1xuXHRcdGNvbnN0IGluYWN0aXZlUHJvbWlzZTogUHJvbWlzZTxJVGFza1N1bW1hcnkgfCBudWxsPiA9IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzdG9yZS5hZGQoXG5cdFx0XHRvbmNlRmlsdGVyKHRoaXMudGFza1NlcnZpY2Uub25EaWRTdGF0ZUNoYW5nZSwgZSA9PiB7XG5cdFx0XHRcdC8vIFdoZW4gYSB0YXNrIGlzQmFja2dyb3VuZCBpdCB3aWxsIGdvIGluYWN0aXZlIHdoZW4gaXQgaXMgc2FmZSB0byBsYXVuY2guXG5cdFx0XHRcdC8vIEJ1dCB3aGVuIGEgYmFja2dyb3VuZCB0YXNrIGlzIHRlcm1pbmF0ZWQgYnkgdGhlIHVzZXIsIGl0IHdpbGwgYWxzbyBmaXJlIGFuIGluYWN0aXZlIGV2ZW50LlxuXHRcdFx0XHQvLyBUaGlzIG1lYW5zIHRoYXQgd2Ugd2lsbCBub3QgZ2V0IHRvIHNlZSB0aGUgcmVhbCBleGl0IGNvZGUgZnJvbSBydW5uaW5nIHRoZSB0YXNrICh1bmRlZmluZWQgd2hlbiB0ZXJtaW5hdGVkIGJ5IHRoZSB1c2VyKS5cblx0XHRcdFx0Ly8gQ2F0Y2ggdGhlIFByb2Nlc3NFbmRlZCBldmVudCBoZXJlLCB3aGljaCBvY2N1cnMgYmVmb3JlIGluYWN0aXZlLCBhbmQgY2FwdHVyZSB0aGUgZXhpdCBjb2RlIHRvIHByZXZlbnQgdGhpcy5cblx0XHRcdFx0cmV0dXJuIChlLmtpbmQgPT09IFRhc2tFdmVudEtpbmQuSW5hY3RpdmVcblx0XHRcdFx0XHR8fCAoZS5raW5kID09PSBUYXNrRXZlbnRLaW5kLlByb2Nlc3NFbmRlZCAmJiBlLmV4aXRDb2RlID09PSB1bmRlZmluZWQpKVxuXHRcdFx0XHRcdCYmIGdldFRhc2tLZXkoZS5fX3Rhc2spID09PSB0YXNrS2V5O1xuXHRcdFx0fSkoZSA9PiB7XG5cdFx0XHRcdHRhc2tTdGFydGVkID0gdHJ1ZTtcblx0XHRcdFx0cmVzb2x2ZShlLmtpbmQgPT09IFRhc2tFdmVudEtpbmQuUHJvY2Vzc0VuZGVkID8geyBleGl0Q29kZTogZS5leGl0Q29kZSB9IDogbnVsbCk7XG5cdFx0XHR9KSxcblx0XHQpKTtcblxuXHRcdHN0b3JlLmFkZChcblx0XHRcdG9uY2VGaWx0ZXIodGhpcy50YXNrU2VydmljZS5vbkRpZFN0YXRlQ2hhbmdlLCBlID0+ICgoZS5raW5kID09PSBUYXNrRXZlbnRLaW5kLkFjdGl2ZSkgfHwgKGUua2luZCA9PT0gVGFza0V2ZW50S2luZC5EZXBlbmRzT25TdGFydGVkKSkgJiYgZ2V0VGFza0tleShlLl9fdGFzaykgPT09IHRhc2tLZXlcblx0XHRcdCkoKCkgPT4ge1xuXHRcdFx0XHQvLyBUYXNrIGlzIGFjdGl2ZSwgc28gZXZlcnl0aGluZyBzZWVtcyB0byBiZSBmaW5lLCBubyBuZWVkIHRvIHByb21wdCBhZnRlciAxMCBzZWNvbmRzXG5cdFx0XHRcdC8vIFVzZSBjYXNlIGJlaW5nIGEgc2xvdyBydW5uaW5nIHRhc2sgc2hvdWxkIG5vdCBiZSBwcm9tcHRlZCBldmVuIHRob3VnaCBpdCB0YWtlcyBtb3JlIHRoYW4gMTAgc2Vjb25kc1xuXHRcdFx0XHR0YXNrU3RhcnRlZCA9IHRydWU7XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRjb25zdCBkaWRBY3F1aXJlSW5wdXQgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0c3RvcmUuYWRkKG9uY2VGaWx0ZXIoXG5cdFx0XHR0aGlzLnRhc2tTZXJ2aWNlLm9uRGlkU3RhdGVDaGFuZ2UsXG5cdFx0XHRlID0+IChlLmtpbmQgPT09IFRhc2tFdmVudEtpbmQuQWNxdWlyZWRJbnB1dCkgJiYgZ2V0VGFza0tleShlLl9fdGFzaykgPT09IHRhc2tLZXlcblx0XHQpKCgpID0+IGRpZEFjcXVpcmVJbnB1dC5maXJlKCkpKTtcblxuXHRcdGNvbnN0IHRhc2tEb25lUHJvbWlzZTogUHJvbWlzZTxJVGFza1N1bW1hcnkgfCBudWxsPiA9IHRoaXMudGFza1NlcnZpY2UuZ2V0QWN0aXZlVGFza3MoKS50aGVuKGFzeW5jICh0YXNrcyk6IFByb21pc2U8SVRhc2tTdW1tYXJ5IHwgbnVsbD4gPT4ge1xuXHRcdFx0aWYgKHRhc2tzLmZpbmQodCA9PiBnZXRUYXNrS2V5KHQpID09PSB0YXNrS2V5KSkge1xuXHRcdFx0XHRkaWRBY3F1aXJlSW5wdXQuZmlyZSgpO1xuXHRcdFx0XHQvLyBDaGVjayB0aGF0IHRoZSB0YXNrIGlzbid0IGJ1c3kgYW5kIGlmIGl0IGlzLCB3YWl0IGZvciBpdFxuXHRcdFx0XHRjb25zdCBidXN5VGFza3MgPSBhd2FpdCB0aGlzLnRhc2tTZXJ2aWNlLmdldEJ1c3lUYXNrcygpO1xuXHRcdFx0XHRpZiAoYnVzeVRhc2tzLmZpbmQodCA9PiBnZXRUYXNrS2V5KHQpID09PSB0YXNrS2V5KSkge1xuXHRcdFx0XHRcdHRhc2tTdGFydGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gaW5hY3RpdmVQcm9taXNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIHRhc2sgaXMgYWxyZWFkeSBydW5uaW5nIGFuZCBpc24ndCBidXN5IC0gbm90aGluZyB0byBkby5cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFza1Byb21pc2UgPSB0aGlzLnRhc2tTZXJ2aWNlLnJ1bih0YXNrKTtcblx0XHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCkge1xuXHRcdFx0XHRyZXR1cm4gaW5hY3RpdmVQcm9taXNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGFza1Byb21pc2UudGhlbih4ID0+IHggPz8gbnVsbCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbWlzZTxJUnVubmVyVGFza1N1bW1hcnkgfCBudWxsPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0YXNrRG9uZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHR0YXNrU3RhcnRlZCA9IHRydWU7XG5cdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdH0sIGVycm9yID0+IHJlamVjdChlcnJvcikpO1xuXG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHsgZXhpdENvZGU6IHVuZGVmaW5lZCwgY2FuY2VsbGVkOiB0cnVlIH0pO1xuXHRcdFx0XHR0aGlzLnRhc2tTZXJ2aWNlLnRlcm1pbmF0ZSh0YXNrKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBTdGFydCB0aGUgdGltZW91dHMgb25jZSBhIHRlcm1pbmFsIGhhcyBiZWVuIGFjcXVpcmVkXG5cdFx0XHRzdG9yZS5hZGQoZGlkQWNxdWlyZUlucHV0LmV2ZW50KCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgd2FpdFRpbWUgPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCA/IDUwMDAgOiAxMDAwMDtcblxuXHRcdFx0XHQvLyBFcnJvciBzaG93biBpZiB0aGVyZSdzIGEgYmFja2dyb3VuZCB0YXNrIHdpdGggbm8gcHJvYmxlbSBtYXRjaGVyIHRoYXQgZG9lc24ndCBleGl0IHF1aWNrbHlcblx0XHRcdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRhc2tTdGFydGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3Rhc2tOb3RUcmFja2VkJywgXCJUaGUgdGFzayAnezB9JyBoYXMgbm90IGV4aXRlZCBhbmQgZG9lc24ndCBoYXZlIGEgJ3Byb2JsZW1NYXRjaGVyJyBkZWZpbmVkLiBNYWtlIHN1cmUgdG8gZGVmaW5lIGEgcHJvYmxlbSBtYXRjaGVyIGZvciB3YXRjaCB0YXNrcy5cIiwgdHlwZW9mIHRhc2tJZCA9PT0gJ3N0cmluZycgPyB0YXNrSWQgOiBKU09OLnN0cmluZ2lmeSh0YXNrSWQpKTtcblx0XHRcdFx0XHRcdHJlamVjdCh7IHNldmVyaXR5OiBzZXZlcml0eS5FcnJvciwgbWVzc2FnZTogZXJyb3JNZXNzYWdlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgd2FpdFRpbWUpKTtcblxuXHRcdFx0XHRjb25zdCBoaWRlU2xvd1ByZUxhdW5jaFdhcm5pbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmhpZGVTbG93UHJlTGF1bmNoV2FybmluZztcblx0XHRcdFx0aWYgKCFoaWRlU2xvd1ByZUxhdW5jaFdhcm5pbmcpIHtcblx0XHRcdFx0XHQvLyBOb3RpZmljYXRpb24gc2hvd24gb24gYW55IHRhc2sgdGFraW5nIGEgd2hpbGUgdG8gcmVzb2x2ZVxuXHRcdFx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdydW5uaW5nVGFzaycsIFwiV2FpdGluZyBmb3IgcHJlTGF1bmNoVGFzayAnezB9Jy4uLlwiLCB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgYnV0dG9ucyA9IFtERUJVR19BTllXQVlfTEFCRUxfTk9fTUVNTywgQUJPUlRfTEFCRUxdO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2FuQ29uZmlndXJlID0gdGFzayBpbnN0YW5jZW9mIEN1c3RvbVRhc2sgfHwgdGFzayBpbnN0YW5jZW9mIENvbmZpZ3VyaW5nVGFzaztcblx0XHRcdFx0XHRcdGlmIChjYW5Db25maWd1cmUpIHtcblx0XHRcdFx0XHRcdFx0YnV0dG9ucy5zcGxpY2UoMSwgMCwgbmxzLmxvY2FsaXplKCdjb25maWd1cmVUYXNrJywgXCJDb25maWd1cmUgVGFza1wiKSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHRcdFx0XHRcdFx0eyBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sIHRpdGxlOiBtZXNzYWdlLCBidXR0b25zIH0sXG5cdFx0XHRcdFx0XHRcdCgpID0+IHJlc3VsdC5jYXRjaCgoKSA9PiB7IH0pLFxuXHRcdFx0XHRcdFx0XHQoY2hvaWNlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGNob2ljZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBuby1vcCwga2VlcCB3YWl0aW5nXG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChjaG9pY2UgPT09IDApIHsgLy8gZGVidWcgYW55d2F5XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlKHsgZXhpdENvZGU6IDAgfSk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHsgLy8gYWJvcnQgb3IgY29uZmlndXJlXG5cdFx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlKHsgZXhpdENvZGU6IHVuZGVmaW5lZCwgY2FuY2VsbGVkOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy50YXNrU2VydmljZS50ZXJtaW5hdGUodGFzaykuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChjYW5Db25maWd1cmUgJiYgY2hvaWNlID09PSAxKSB7IC8vIGNvbmZpZ3VyZVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnRhc2tTZXJ2aWNlLm9wZW5Db25maWcodGFzayBhcyBDdXN0b21UYXNrKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSwgMTBfMDAwKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQuZmluYWxseSgoKSA9PiBzdG9yZS5kaXNwb3NlKCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQW9DO0FBQzdDLE9BQU8sY0FBYztBQUNyQixZQUFZLFNBQVM7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0Isc0JBQXNCO0FBQy9DLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUU3RCxTQUFTLDRCQUE0Qiw2QkFBNkI7QUFFbEUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLFlBQStDLHFCQUFxQjtBQUM5RixTQUFTLG9CQUFrQztBQUMzQyxTQUFTLHFCQUFxQjtBQUU5QixNQUFNLGFBQWEsQ0FBQyxPQUEwQixXQUF1QyxNQUFNLEtBQUssTUFBTSxPQUFPLE9BQU8sTUFBTSxDQUFDO0FBRXBILElBQVcsZ0JBQVgsa0JBQVdBLG1CQUFYO0FBQ04sRUFBQUEsOEJB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U0FBUyxLQUFLLFVBQVUsTUFBTSxDQUFDO0FBQ3JQLG1CQUFPLEVBQUUsVUFBVSxTQUFTLE9BQU8sU0FBUyxhQUFhLENBQUM7QUFBQSxVQUMzRDtBQUFBLFFBQ0QsR0FBRyxRQUFRLENBQUM7QUFFWixjQUFNLDJCQUEyQixLQUFLLHFCQUFxQixTQUE4QixPQUFPLEVBQUU7QUFDbEcsWUFBSSxDQUFDLDBCQUEwQjtBQUU5QixnQkFBTSxJQUFJLGtCQUFrQixNQUFNO0FBQ2pDLGtCQUFNLFVBQVUsSUFBSSxTQUFTLGVBQWUsc0NBQXNDLEtBQUssd0JBQXdCLElBQUk7QUFDbkgsa0JBQU0sVUFBVSxDQUFDLDRCQUE0QixXQUFXO0FBQ3hELGtCQUFNLGVBQWUsZ0JBQWdCLGNBQWMsZ0JBQWdCO0FBQ25FLGdCQUFJLGNBQWM7QUFDakIsc0JBQVEsT0FBTyxHQUFHLEdBQUcsSUFBSSxTQUFTLGlCQUFpQixnQkFBZ0IsQ0FBQztBQUFBLFlBQ3JFO0FBRUEsaUJBQUssZ0JBQWdCO0FBQUEsY0FDcEIsRUFBRSxVQUFVLGlCQUFpQixjQUFjLE9BQU8sU0FBUyxRQUFRO0FBQUEsY0FDbkUsTUFBTSxPQUFPLE1BQU0sTUFBTTtBQUFBLGNBQUUsQ0FBQztBQUFBLGNBQzVCLENBQUMsV0FBVztBQUNYLG9CQUFJLFdBQVcsUUFBVztBQUFBLGdCQUUxQixXQUFXLFdBQVcsR0FBRztBQUN4QiwwQkFBUSxFQUFFLFVBQVUsRUFBRSxDQUFDO0FBQUEsZ0JBQ3hCLE9BQU87QUFDTiwwQkFBUSxFQUFFLFVBQVUsUUFBVyxXQUFXLEtBQUssQ0FBQztBQUNoRCx1QkFBSyxZQUFZLFVBQVUsSUFBSSxFQUFFLE1BQU0sTUFBTTtBQUFBLGtCQUFFLENBQUM7QUFDaEQsc0JBQUksZ0JBQWdCLFdBQVcsR0FBRztBQUNqQyx5QkFBSyxZQUFZLFdBQVcsSUFBa0I7QUFBQSxrQkFDL0M7QUFBQSxnQkFDRDtBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBQUEsVUFDRCxHQUFHLEdBQU0sQ0FBQztBQUFBLFFBQ1g7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0gsQ0FBQztBQUVELFdBQU8sT0FBTyxRQUFRLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFBQSxFQUM1QztBQUNEO0FBeFJhLGtCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpVOyIsCiAgIm5hbWVzIjogWyJUYXNrUnVuUmVzdWx0IiwgIkRlYnVnQ2hvaWNlIiwgInJlc3VsdCJdCn0K
