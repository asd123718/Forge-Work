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
import "./media/progressService.css";
import { localize } from "../../../../nls.js";
import { dispose, DisposableStore, Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { IProgressService, ProgressLocation, Progress } from "../../../../platform/progress/common/progress.js";
import { StatusbarAlignment, IStatusbarService } from "../../statusbar/browser/statusbar.js";
import { DeferredPromise, RunOnceScheduler, timeout } from "../../../../base/common/async.js";
import { ProgressBadge, IActivityService } from "../../activity/common/activity.js";
import { INotificationService, Severity, NotificationPriority, isNotificationSource, NotificationsFilter } from "../../../../platform/notification/common/notification.js";
import { Action } from "../../../../base/common/actions.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { Dialog } from "../../../../base/browser/ui/dialog/dialog.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../views/common/viewsService.js";
import { IPaneCompositePartService } from "../../panecomposite/browser/panecomposite.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { IUserActivityService } from "../../userActivity/common/userActivityService.js";
import { createWorkbenchDialogOptions } from "../../../browser/parts/dialogs/dialog.js";
import { IHostService } from "../../host/browser/host.js";
let ProgressService = class extends Disposable {
  constructor(activityService, paneCompositeService, viewDescriptorService, viewsService, notificationService, statusbarService, layoutService, keybindingService, userActivityService, hostService) {
    super();
    this.activityService = activityService;
    this.paneCompositeService = paneCompositeService;
    this.viewDescriptorService = viewDescriptorService;
    this.viewsService = viewsService;
    this.notificationService = notificationService;
    this.statusbarService = statusbarService;
    this.layoutService = layoutService;
    this.keybindingService = keybindingService;
    this.userActivityService = userActivityService;
    this.hostService = hostService;
    this.windowProgressStack = [];
    this.windowProgressStatusEntry = void 0;
  }
  async withProgress(options, originalTask, onDidCancel) {
    const { location } = options;
    const task = async (progress) => {
      const activeLock = this.userActivityService.markActive({ extendOnly: true, whenHeldFor: 15e3 });
      try {
        return await originalTask(progress);
      } finally {
        activeLock.dispose();
      }
    };
    const handleStringLocation = (location2) => {
      const viewContainer = this.viewDescriptorService.getViewContainerById(location2);
      if (viewContainer) {
        const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
        if (viewContainerLocation !== null) {
          return this.withPaneCompositeProgress(location2, viewContainerLocation, task, { ...options, location: location2 });
        }
      }
      if (this.viewDescriptorService.getViewDescriptorById(location2) !== null) {
        return this.withViewProgress(location2, task, { ...options, location: location2 });
      }
      throw new Error(`Bad progress location: ${location2}`);
    };
    if (typeof location === "string") {
      return handleStringLocation(location);
    }
    switch (location) {
      case ProgressLocation.Notification: {
        let priority = options.priority;
        if (priority !== NotificationPriority.URGENT) {
          if (this.notificationService.getFilter() === NotificationsFilter.ERROR) {
            priority = NotificationPriority.SILENT;
          } else if (isNotificationSource(options.source) && this.notificationService.getFilter(options.source) === NotificationsFilter.ERROR) {
            priority = NotificationPriority.SILENT;
          }
        }
        return this.withNotificationProgress({ ...options, location, priority }, task, onDidCancel);
      }
      case ProgressLocation.Window: {
        const type = options.type;
        if (options.command) {
          return this.withWindowProgress({ ...options, location, type }, task);
        }
        return this.withNotificationProgress({ delay: 150, ...options, priority: NotificationPriority.SILENT, location: ProgressLocation.Notification, type }, task, onDidCancel);
      }
      case ProgressLocation.Explorer:
        return this.withPaneCompositeProgress("workbench.view.explorer", ViewContainerLocation.Sidebar, task, { ...options, location });
      case ProgressLocation.Scm:
        return handleStringLocation("workbench.scm");
      case ProgressLocation.Extensions:
        return this.withPaneCompositeProgress("workbench.view.extensions", ViewContainerLocation.Sidebar, task, { ...options, location });
      case ProgressLocation.Dialog:
        return this.withDialogProgress(options, task, onDidCancel);
      default:
        throw new Error(`Bad progress location: ${location}`);
    }
  }
  withWindowProgress(options, callback) {
    const task = [options, new Progress(() => this.updateWindowProgress())];
    const promise = callback(task[1]);
    let delayHandle = setTimeout(() => {
      delayHandle = void 0;
      this.windowProgressStack.unshift(task);
      this.updateWindowProgress();
      Promise.all([
        timeout(150),
        promise
      ]).finally(() => {
        const idx = this.windowProgressStack.indexOf(task);
        if (idx !== -1) {
          this.windowProgressStack.splice(idx, 1);
        }
        this.updateWindowProgress();
      });
    }, 150);
    return promise.finally(() => clearTimeout(delayHandle));
  }
  updateWindowProgress(idx = 0) {
    if (idx < this.windowProgressStack.length) {
      const [options, progress] = this.windowProgressStack[idx];
      const progressTitle = options.title;
      const progressMessage = progress.value?.message;
      const progressCommand = options.command;
      let text;
      let title;
      const source = options.source && typeof options.source !== "string" ? options.source.label : options.source;
      if (progressTitle && progressMessage) {
        text = localize("progress.text2", "{0}: {1}", progressTitle, progressMessage);
        title = source ? localize("progress.title3", "[{0}] {1}: {2}", source, progressTitle, progressMessage) : text;
      } else if (progressTitle) {
        text = progressTitle;
        title = source ? localize("progress.title2", "[{0}]: {1}", source, progressTitle) : text;
      } else if (progressMessage) {
        text = progressMessage;
        title = source ? localize("progress.title2", "[{0}]: {1}", source, progressMessage) : text;
      } else {
        this.updateWindowProgress(idx + 1);
        return;
      }
      const statusEntryProperties = {
        name: localize("status.progress", "Progress Message"),
        text,
        showProgress: options.type || true,
        ariaLabel: text,
        tooltip: stripIcons(title).trim(),
        command: progressCommand
      };
      if (this.windowProgressStatusEntry) {
        this.windowProgressStatusEntry.update(statusEntryProperties);
      } else {
        this.windowProgressStatusEntry = this.statusbarService.addEntry(
          statusEntryProperties,
          "status.progress",
          StatusbarAlignment.LEFT,
          -Number.MAX_VALUE
          /* almost last entry */
        );
      }
    } else {
      this.windowProgressStatusEntry?.dispose();
      this.windowProgressStatusEntry = void 0;
    }
  }
  withNotificationProgress(options, callback, onDidCancel) {
    const progressStateModel = new class extends Disposable {
      constructor() {
        super();
        this._onDidReport = this._register(new Emitter());
        this.onDidReport = this._onDidReport.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this._step = void 0;
        this._done = false;
        this.promise = callback(this);
        this.promise.finally(() => {
          this.dispose();
        });
      }
      get step() {
        return this._step;
      }
      get done() {
        return this._done;
      }
      report(step) {
        this._step = step;
        this._onDidReport.fire(step);
      }
      cancel(choice) {
        onDidCancel?.(choice);
        this.dispose();
      }
      dispose() {
        this._done = true;
        this._onWillDispose.fire();
        super.dispose();
      }
    }();
    const createWindowProgress = () => {
      const promise = new DeferredPromise();
      this.withWindowProgress({
        location: ProgressLocation.Window,
        title: options.title ? parseLinkedText(options.title).toString() : void 0,
        // convert markdown links => string
        command: "notifications.showList",
        type: options.type
      }, (progress) => {
        function reportProgress(step) {
          if (step.message) {
            progress.report({
              message: parseLinkedText(step.message).toString()
              // convert markdown links => string
            });
          }
        }
        if (progressStateModel.step) {
          reportProgress(progressStateModel.step);
        }
        const onDidReportListener = progressStateModel.onDidReport((step) => reportProgress(step));
        promise.p.finally(() => onDidReportListener.dispose());
        Event.once(progressStateModel.onWillDispose)(() => promise.complete());
        return promise.p;
      });
      return toDisposable(() => promise.complete());
    };
    const createNotification = (message, priority, increment) => {
      const notificationDisposables = new DisposableStore();
      const primaryActions = options.primaryActions ? Array.from(options.primaryActions) : [];
      const secondaryActions = options.secondaryActions ? Array.from(options.secondaryActions) : [];
      if (options.buttons) {
        options.buttons.forEach((button, index) => {
          const buttonAction = new class extends Action {
            constructor() {
              super(`progress.button.${button}`, button, void 0, true);
            }
            async run() {
              progressStateModel.cancel(index);
            }
          }();
          notificationDisposables.add(buttonAction);
          primaryActions.push(buttonAction);
        });
      }
      if (options.cancellable) {
        const cancelAction = new class extends Action {
          constructor() {
            super("progress.cancel", typeof options.cancellable === "string" ? options.cancellable : localize("cancel", "Cancel"), void 0, true);
          }
          async run() {
            progressStateModel.cancel();
          }
        }();
        notificationDisposables.add(cancelAction);
        primaryActions.push(cancelAction);
      }
      const notification = this.notificationService.notify({
        severity: Severity.Info,
        message: stripIcons(message),
        // status entries support codicons, but notifications do not (https://github.com/microsoft/vscode/issues/145722)
        source: options.source,
        actions: { primary: primaryActions, secondary: secondaryActions },
        progress: typeof increment === "number" && increment >= 0 ? { total: 100, worked: increment } : { infinite: true },
        priority
      });
      let windowProgressDisposable = void 0;
      const onVisibilityChange = (visible) => {
        dispose(windowProgressDisposable);
        if (!visible && !progressStateModel.done) {
          windowProgressDisposable = createWindowProgress();
        }
      };
      notificationDisposables.add(notification.onDidChangeVisibility(onVisibilityChange));
      if (priority === NotificationPriority.SILENT) {
        onVisibilityChange(false);
      }
      Event.once(notification.onDidClose)(() => {
        notificationDisposables.dispose();
        dispose(windowProgressDisposable);
      });
      return notification;
    };
    const updateProgress = (notification, increment) => {
      if (typeof increment === "number" && increment >= 0) {
        notification.progress.total(100);
        notification.progress.worked(increment);
      } else {
        notification.progress.infinite();
      }
    };
    let notificationHandle;
    let notificationTimeout;
    let titleAndMessage;
    const updateNotification = (step) => {
      if (step?.message && options.title) {
        titleAndMessage = `${options.title}: ${step.message}`;
      } else {
        titleAndMessage = options.title || step?.message;
      }
      if (!notificationHandle && titleAndMessage) {
        if (typeof options.delay === "number" && options.delay > 0) {
          if (notificationTimeout === void 0) {
            notificationTimeout = setTimeout(() => notificationHandle = createNotification(titleAndMessage, options.priority, step?.increment), options.delay);
          }
        } else {
          notificationHandle = createNotification(titleAndMessage, options.priority, step?.increment);
        }
      }
      if (notificationHandle) {
        if (titleAndMessage) {
          notificationHandle.updateMessage(titleAndMessage);
        }
        if (typeof step?.increment === "number") {
          updateProgress(notificationHandle, step.increment);
        }
      }
    };
    updateNotification(progressStateModel.step);
    const listener = progressStateModel.onDidReport((step) => updateNotification(step));
    Event.once(progressStateModel.onWillDispose)(() => listener.dispose());
    (async () => {
      try {
        if (typeof options.delay === "number" && options.delay > 0) {
          await progressStateModel.promise;
        } else {
          await Promise.all([timeout(800), progressStateModel.promise]);
        }
      } finally {
        clearTimeout(notificationTimeout);
        notificationHandle?.close();
      }
    })();
    return progressStateModel.promise;
  }
  withPaneCompositeProgress(paneCompositeId, viewContainerLocation, task, options) {
    const progressIndicator = this.paneCompositeService.getProgressIndicator(paneCompositeId, viewContainerLocation);
    const promise = progressIndicator ? this.withCompositeProgress(progressIndicator, task, options) : task({ report: () => {
    } });
    if (viewContainerLocation === ViewContainerLocation.Sidebar) {
      this.showOnActivityBar(paneCompositeId, options, promise);
    }
    return promise;
  }
  withViewProgress(viewId, task, options) {
    const progressIndicator = this.viewsService.getViewProgressIndicator(viewId);
    const promise = progressIndicator ? this.withCompositeProgress(progressIndicator, task, options) : task({ report: () => {
    } });
    const viewletId = this.viewDescriptorService.getViewContainerByViewId(viewId)?.id;
    if (viewletId === void 0) {
      return promise;
    }
    this.showOnActivityBar(viewletId, options, promise);
    return promise;
  }
  showOnActivityBar(viewletId, options, promise) {
    let activityProgress;
    let delayHandle = setTimeout(() => {
      delayHandle = void 0;
      const handle = this.activityService.showViewContainerActivity(viewletId, { badge: new ProgressBadge(() => "") });
      const startTimeVisible = Date.now();
      const minTimeVisible = 300;
      activityProgress = {
        dispose() {
          const d = Date.now() - startTimeVisible;
          if (d < minTimeVisible) {
            setTimeout(() => handle.dispose(), minTimeVisible - d);
          } else {
            handle.dispose();
          }
        }
      };
    }, options.delay || 300);
    promise.finally(() => {
      clearTimeout(delayHandle);
      dispose(activityProgress);
    });
  }
  withCompositeProgress(progressIndicator, task, options) {
    let discreteProgressRunner = void 0;
    function updateProgress(stepOrTotal) {
      let total = void 0;
      let increment = void 0;
      if (typeof stepOrTotal !== "undefined") {
        if (typeof stepOrTotal === "number") {
          total = stepOrTotal;
        } else if (typeof stepOrTotal.increment === "number") {
          total = stepOrTotal.total ?? 100;
          increment = stepOrTotal.increment;
        }
      }
      if (typeof total === "number") {
        if (!discreteProgressRunner) {
          discreteProgressRunner = progressIndicator.show(total, options.delay);
          promise.catch(
            () => void 0
            /* ignore */
          ).finally(() => discreteProgressRunner?.done());
        }
        if (typeof increment === "number") {
          discreteProgressRunner.worked(increment);
        }
      } else {
        discreteProgressRunner?.done();
        progressIndicator.showWhile(promise, options.delay);
      }
      return discreteProgressRunner;
    }
    const promise = task({
      report: (progress) => {
        updateProgress(progress);
      }
    });
    updateProgress(options.total);
    return promise;
  }
  withDialogProgress(options, task, onDidCancel) {
    const disposables = new DisposableStore();
    let dialog;
    let taskCompleted = false;
    const createDialog = (message) => {
      const buttons = options.buttons || [];
      if (!options.sticky) {
        buttons.push(
          options.cancellable ? typeof options.cancellable === "boolean" ? localize("cancel", "Cancel") : options.cancellable : localize("dismiss", "Dismiss")
        );
      }
      dialog = new Dialog(
        this.layoutService.activeContainer,
        message,
        buttons,
        createWorkbenchDialogOptions({
          type: "pending",
          detail: options.detail,
          cancelId: buttons.length - 1,
          disableCloseAction: options.sticky,
          disableDefaultAction: options.sticky
        }, this.keybindingService, this.layoutService, this.hostService)
      );
      disposables.add(dialog);
      dialog.show().then((dialogResult) => {
        if (!taskCompleted) {
          onDidCancel?.(dialogResult.button);
        }
        dispose(dialog);
      });
      return dialog;
    };
    let delay = options.delay ?? 0;
    let latestMessage = void 0;
    const scheduler = disposables.add(new RunOnceScheduler(() => {
      delay = 0;
      if (latestMessage && !dialog) {
        dialog = createDialog(latestMessage);
      } else if (latestMessage) {
        dialog.updateMessage(latestMessage);
      }
    }, 0));
    const updateDialog = function(message) {
      latestMessage = message;
      if (!scheduler.isScheduled()) {
        scheduler.schedule(delay);
      }
    };
    const promise = task({
      report: (progress) => {
        updateDialog(progress.message);
      }
    });
    promise.finally(() => {
      taskCompleted = true;
      dispose(disposables);
    });
    if (options.title) {
      updateDialog(options.title);
    }
    return promise;
  }
};
ProgressService = __decorateClass([
  __decorateParam(0, IActivityService),
  __decorateParam(1, IPaneCompositePartService),
  __decorateParam(2, IViewDescriptorService),
  __decorateParam(3, IViewsService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IStatusbarService),
  __decorateParam(6, ILayoutService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IUserActivityService),
  __decorateParam(9, IHostService)
], ProgressService);
registerSingleton(IProgressService, ProgressService, InstantiationType.Delayed);
export {
  ProgressService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxwcm9ncmVzc1xcYnJvd3NlclxccHJvZ3Jlc3NTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3Byb2dyZXNzU2VydmljZS5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc09wdGlvbnMsIElQcm9ncmVzc1N0ZXAsIFByb2dyZXNzTG9jYXRpb24sIElQcm9ncmVzcywgUHJvZ3Jlc3MsIElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMsIElQcm9ncmVzc05vdGlmaWNhdGlvbk9wdGlvbnMsIElQcm9ncmVzc1J1bm5lciwgSVByb2dyZXNzSW5kaWNhdG9yLCBJUHJvZ3Jlc3NXaW5kb3dPcHRpb25zLCBJUHJvZ3Jlc3NEaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFN0YXR1c2JhckFsaWdubWVudCwgSVN0YXR1c2JhclNlcnZpY2UsIElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyRW50cnkgfSBmcm9tICcuLi8uLi9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBSdW5PbmNlU2NoZWR1bGVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYWRnZSwgSUFjdGl2aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHksIElOb3RpZmljYXRpb25IYW5kbGUsIE5vdGlmaWNhdGlvblByaW9yaXR5LCBpc05vdGlmaWNhdGlvblNvdXJjZSwgTm90aWZpY2F0aW9uc0ZpbHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaWFsb2cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZGlhbG9nL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IHBhcnNlTGlua2VkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZFRleHQuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBzdHJpcEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJVXNlckFjdGl2aXR5U2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJBY3Rpdml0eS9jb21tb24vdXNlckFjdGl2aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVXb3JrYmVuY2hEaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9kaWFsb2dzL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBQcm9ncmVzc1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByb2dyZXNzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYW5lQ29tcG9zaXRlU2VydmljZTogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASUxheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVVzZXJBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyQWN0aXZpdHlTZXJ2aWNlOiBJVXNlckFjdGl2aXR5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIHdpdGhQcm9ncmVzczxSID0gdW5rbm93bj4ob3B0aW9uczogSVByb2dyZXNzT3B0aW9ucywgb3JpZ2luYWxUYXNrOiAocHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4gUHJvbWlzZTxSPiwgb25EaWRDYW5jZWw/OiAoY2hvaWNlPzogbnVtYmVyKSA9PiB2b2lkKTogUHJvbWlzZTxSPiB7XG5cdFx0Y29uc3QgeyBsb2NhdGlvbiB9ID0gb3B0aW9ucztcblxuXHRcdGNvbnN0IHRhc2sgPSBhc3luYyAocHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlTG9jayA9IHRoaXMudXNlckFjdGl2aXR5U2VydmljZS5tYXJrQWN0aXZlKHsgZXh0ZW5kT25seTogdHJ1ZSwgd2hlbkhlbGRGb3I6IDE1XzAwMCB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBvcmlnaW5hbFRhc2socHJvZ3Jlc3MpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YWN0aXZlTG9jay5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGhhbmRsZVN0cmluZ0xvY2F0aW9uID0gKGxvY2F0aW9uOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChsb2NhdGlvbik7XG5cdFx0XHRpZiAodmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyTG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0XHRcdGlmICh2aWV3Q29udGFpbmVyTG9jYXRpb24gIT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUGFuZUNvbXBvc2l0ZVByb2dyZXNzKGxvY2F0aW9uLCB2aWV3Q29udGFpbmVyTG9jYXRpb24sIHRhc2ssIHsgLi4ub3B0aW9ucywgbG9jYXRpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZChsb2NhdGlvbikgIT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFZpZXdQcm9ncmVzcyhsb2NhdGlvbiwgdGFzaywgeyAuLi5vcHRpb25zLCBsb2NhdGlvbiB9KTtcblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBCYWQgcHJvZ3Jlc3MgbG9jYXRpb246ICR7bG9jYXRpb259YCk7XG5cdFx0fTtcblxuXHRcdGlmICh0eXBlb2YgbG9jYXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gaGFuZGxlU3RyaW5nTG9jYXRpb24obG9jYXRpb24pO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAobG9jYXRpb24pIHtcblx0XHRcdGNhc2UgUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb246IHtcblx0XHRcdFx0bGV0IHByaW9yaXR5ID0gKG9wdGlvbnMgYXMgSVByb2dyZXNzTm90aWZpY2F0aW9uT3B0aW9ucykucHJpb3JpdHk7XG5cdFx0XHRcdGlmIChwcmlvcml0eSAhPT0gTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5nZXRGaWx0ZXIoKSA9PT0gTm90aWZpY2F0aW9uc0ZpbHRlci5FUlJPUikge1xuXHRcdFx0XHRcdFx0cHJpb3JpdHkgPSBOb3RpZmljYXRpb25Qcmlvcml0eS5TSUxFTlQ7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpc05vdGlmaWNhdGlvblNvdXJjZShvcHRpb25zLnNvdXJjZSkgJiYgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmdldEZpbHRlcihvcHRpb25zLnNvdXJjZSkgPT09IE5vdGlmaWNhdGlvbnNGaWx0ZXIuRVJST1IpIHtcblx0XHRcdFx0XHRcdHByaW9yaXR5ID0gTm90aWZpY2F0aW9uUHJpb3JpdHkuU0lMRU5UO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhOb3RpZmljYXRpb25Qcm9ncmVzcyh7IC4uLm9wdGlvbnMsIGxvY2F0aW9uLCBwcmlvcml0eSB9LCB0YXNrLCBvbkRpZENhbmNlbCk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb2dyZXNzTG9jYXRpb24uV2luZG93OiB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSAob3B0aW9ucyBhcyBJUHJvZ3Jlc3NXaW5kb3dPcHRpb25zKS50eXBlO1xuXHRcdFx0XHRpZiAoKG9wdGlvbnMgYXMgSVByb2dyZXNzV2luZG93T3B0aW9ucykuY29tbWFuZCkge1xuXHRcdFx0XHRcdC8vIFdpbmRvdyBwcm9ncmVzcyB3aXRoIGNvbW1hbmQgZ2V0J3Mgc2hvd24gaW4gdGhlIHN0YXR1cyBiYXJcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoV2luZG93UHJvZ3Jlc3MoeyAuLi5vcHRpb25zLCBsb2NhdGlvbiwgdHlwZSB9LCB0YXNrKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBXaW5kb3cgcHJvZ3Jlc3Mgd2l0aG91dCBjb21tYW5kIGNhbiBiZSBzaG93biBhcyBzaWxlbnQgbm90aWZpY2F0aW9uXG5cdFx0XHRcdC8vIHdoaWNoIHdpbGwgZmlyc3QgYXBwZWFyIGluIHRoZSBzdGF0dXMgYmFyIGFuZCBjYW4gdGhlbiBiZSBicm91Z2h0IHRvXG5cdFx0XHRcdC8vIHRoZSBmcm9udCB3aGVuIGNsaWNraW5nLlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoTm90aWZpY2F0aW9uUHJvZ3Jlc3MoeyBkZWxheTogMTUwIC8qIGRlZmF1bHQgZm9yIFByb2dyZXNzTG9jYXRpb24uV2luZG93ICovLCAuLi5vcHRpb25zLCBwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuU0lMRU5ULCBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sIHR5cGUgfSwgdGFzaywgb25EaWRDYW5jZWwpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBQcm9ncmVzc0xvY2F0aW9uLkV4cGxvcmVyOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUGFuZUNvbXBvc2l0ZVByb2dyZXNzKCd3b3JrYmVuY2gudmlldy5leHBsb3JlcicsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyLCB0YXNrLCB7IC4uLm9wdGlvbnMsIGxvY2F0aW9uIH0pO1xuXHRcdFx0Y2FzZSBQcm9ncmVzc0xvY2F0aW9uLlNjbTpcblx0XHRcdFx0cmV0dXJuIGhhbmRsZVN0cmluZ0xvY2F0aW9uKCd3b3JrYmVuY2guc2NtJyk7XG5cdFx0XHRjYXNlIFByb2dyZXNzTG9jYXRpb24uRXh0ZW5zaW9uczpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBhbmVDb21wb3NpdGVQcm9ncmVzcygnd29ya2JlbmNoLnZpZXcuZXh0ZW5zaW9ucycsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyLCB0YXNrLCB7IC4uLm9wdGlvbnMsIGxvY2F0aW9uIH0pO1xuXHRcdFx0Y2FzZSBQcm9ncmVzc0xvY2F0aW9uLkRpYWxvZzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aERpYWxvZ1Byb2dyZXNzKG9wdGlvbnMsIHRhc2ssIG9uRGlkQ2FuY2VsKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQmFkIHByb2dyZXNzIGxvY2F0aW9uOiAke2xvY2F0aW9ufWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2luZG93UHJvZ3Jlc3NTdGFjazogW0lQcm9ncmVzc1dpbmRvd09wdGlvbnMsIFByb2dyZXNzPElQcm9ncmVzc1N0ZXA+XVtdID0gW107XG5cdHByaXZhdGUgd2luZG93UHJvZ3Jlc3NTdGF0dXNFbnRyeTogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB3aXRoV2luZG93UHJvZ3Jlc3M8UiA9IHVua25vd24+KG9wdGlvbnM6IElQcm9ncmVzc1dpbmRvd09wdGlvbnMsIGNhbGxiYWNrOiAocHJvZ3Jlc3M6IElQcm9ncmVzczx7IG1lc3NhZ2U/OiBzdHJpbmcgfT4pID0+IFByb21pc2U8Uj4pOiBQcm9taXNlPFI+IHtcblx0XHRjb25zdCB0YXNrOiBbSVByb2dyZXNzV2luZG93T3B0aW9ucywgUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD5dID0gW29wdGlvbnMsIG5ldyBQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPigoKSA9PiB0aGlzLnVwZGF0ZVdpbmRvd1Byb2dyZXNzKCkpXTtcblxuXHRcdGNvbnN0IHByb21pc2UgPSBjYWxsYmFjayh0YXNrWzFdKTtcblxuXHRcdGxldCBkZWxheUhhbmRsZTogVGltZW91dCB8IHVuZGVmaW5lZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0ZGVsYXlIYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLndpbmRvd1Byb2dyZXNzU3RhY2sudW5zaGlmdCh0YXNrKTtcblx0XHRcdHRoaXMudXBkYXRlV2luZG93UHJvZ3Jlc3MoKTtcblxuXHRcdFx0Ly8gc2hvdyBwcm9ncmVzcyBmb3IgYXQgbGVhc3QgMTUwbXNcblx0XHRcdFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGltZW91dCgxNTApLFxuXHRcdFx0XHRwcm9taXNlXG5cdFx0XHRdKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy53aW5kb3dQcm9ncmVzc1N0YWNrLmluZGV4T2YodGFzayk7XG5cdFx0XHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy53aW5kb3dQcm9ncmVzc1N0YWNrLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudXBkYXRlV2luZG93UHJvZ3Jlc3MoKTtcblx0XHRcdH0pO1xuXHRcdH0sIDE1MCk7XG5cblx0XHQvLyBjYW5jZWwgZGVsYXkgaWYgcHJvbWlzZSBmaW5pc2hlcyBiZWxvdyAxNTBtc1xuXHRcdHJldHVybiBwcm9taXNlLmZpbmFsbHkoKCkgPT4gY2xlYXJUaW1lb3V0KGRlbGF5SGFuZGxlKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVdpbmRvd1Byb2dyZXNzKGlkeCA9IDApIHtcblxuXHRcdC8vIFdlIHN0aWxsIGhhdmUgcHJvZ3Jlc3MgdG8gc2hvd1xuXHRcdGlmIChpZHggPCB0aGlzLndpbmRvd1Byb2dyZXNzU3RhY2subGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBbb3B0aW9ucywgcHJvZ3Jlc3NdID0gdGhpcy53aW5kb3dQcm9ncmVzc1N0YWNrW2lkeF07XG5cblx0XHRcdGNvbnN0IHByb2dyZXNzVGl0bGUgPSBvcHRpb25zLnRpdGxlO1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3NNZXNzYWdlID0gcHJvZ3Jlc3MudmFsdWU/Lm1lc3NhZ2U7XG5cdFx0XHRjb25zdCBwcm9ncmVzc0NvbW1hbmQgPSBvcHRpb25zLmNvbW1hbmQ7XG5cdFx0XHRsZXQgdGV4dDogc3RyaW5nO1xuXHRcdFx0bGV0IHRpdGxlOiBzdHJpbmc7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBvcHRpb25zLnNvdXJjZSAmJiB0eXBlb2Ygb3B0aW9ucy5zb3VyY2UgIT09ICdzdHJpbmcnID8gb3B0aW9ucy5zb3VyY2UubGFiZWwgOiBvcHRpb25zLnNvdXJjZTtcblxuXHRcdFx0aWYgKHByb2dyZXNzVGl0bGUgJiYgcHJvZ3Jlc3NNZXNzYWdlKSB7XG5cdFx0XHRcdC8vIDx0aXRsZT46IDxtZXNzYWdlPlxuXHRcdFx0XHR0ZXh0ID0gbG9jYWxpemUoJ3Byb2dyZXNzLnRleHQyJywgXCJ7MH06IHsxfVwiLCBwcm9ncmVzc1RpdGxlLCBwcm9ncmVzc01lc3NhZ2UpO1xuXHRcdFx0XHR0aXRsZSA9IHNvdXJjZSA/IGxvY2FsaXplKCdwcm9ncmVzcy50aXRsZTMnLCBcIlt7MH1dIHsxfTogezJ9XCIsIHNvdXJjZSwgcHJvZ3Jlc3NUaXRsZSwgcHJvZ3Jlc3NNZXNzYWdlKSA6IHRleHQ7XG5cblx0XHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3NUaXRsZSkge1xuXHRcdFx0XHQvLyA8dGl0bGU+XG5cdFx0XHRcdHRleHQgPSBwcm9ncmVzc1RpdGxlO1xuXHRcdFx0XHR0aXRsZSA9IHNvdXJjZSA/IGxvY2FsaXplKCdwcm9ncmVzcy50aXRsZTInLCBcIlt7MH1dOiB7MX1cIiwgc291cmNlLCBwcm9ncmVzc1RpdGxlKSA6IHRleHQ7XG5cblx0XHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3NNZXNzYWdlKSB7XG5cdFx0XHRcdC8vIDxtZXNzYWdlPlxuXHRcdFx0XHR0ZXh0ID0gcHJvZ3Jlc3NNZXNzYWdlO1xuXHRcdFx0XHR0aXRsZSA9IHNvdXJjZSA/IGxvY2FsaXplKCdwcm9ncmVzcy50aXRsZTInLCBcIlt7MH1dOiB7MX1cIiwgc291cmNlLCBwcm9ncmVzc01lc3NhZ2UpIDogdGV4dDtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gbm8gdGl0bGUsIG5vIG1lc3NhZ2UgLT4gbm8gcHJvZ3Jlc3MuIHRyeSB3aXRoIG5leHQgb24gc3RhY2tcblx0XHRcdFx0dGhpcy51cGRhdGVXaW5kb3dQcm9ncmVzcyhpZHggKyAxKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0dXNFbnRyeVByb3BlcnRpZXM6IElTdGF0dXNiYXJFbnRyeSA9IHtcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ3N0YXR1cy5wcm9ncmVzcycsIFwiUHJvZ3Jlc3MgTWVzc2FnZVwiKSxcblx0XHRcdFx0dGV4dCxcblx0XHRcdFx0c2hvd1Byb2dyZXNzOiBvcHRpb25zLnR5cGUgfHwgdHJ1ZSxcblx0XHRcdFx0YXJpYUxhYmVsOiB0ZXh0LFxuXHRcdFx0XHR0b29sdGlwOiBzdHJpcEljb25zKHRpdGxlKS50cmltKCksXG5cdFx0XHRcdGNvbW1hbmQ6IHByb2dyZXNzQ29tbWFuZFxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKHRoaXMud2luZG93UHJvZ3Jlc3NTdGF0dXNFbnRyeSkge1xuXHRcdFx0XHR0aGlzLndpbmRvd1Byb2dyZXNzU3RhdHVzRW50cnkudXBkYXRlKHN0YXR1c0VudHJ5UHJvcGVydGllcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLndpbmRvd1Byb2dyZXNzU3RhdHVzRW50cnkgPSB0aGlzLnN0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoc3RhdHVzRW50cnlQcm9wZXJ0aWVzLCAnc3RhdHVzLnByb2dyZXNzJywgU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQsIC1OdW1iZXIuTUFYX1ZBTFVFIC8qIGFsbW9zdCBsYXN0IGVudHJ5ICovKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBQcm9ncmVzcyBpcyBkb25lIHNvIHdlIHJlbW92ZSB0aGUgc3RhdHVzIGVudHJ5XG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLndpbmRvd1Byb2dyZXNzU3RhdHVzRW50cnk/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMud2luZG93UHJvZ3Jlc3NTdGF0dXNFbnRyeSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHdpdGhOb3RpZmljYXRpb25Qcm9ncmVzczxQIGV4dGVuZHMgUHJvbWlzZTxSPiwgUiA9IHVua25vd24+KG9wdGlvbnM6IElQcm9ncmVzc05vdGlmaWNhdGlvbk9wdGlvbnMsIGNhbGxiYWNrOiAocHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4gUCwgb25EaWRDYW5jZWw/OiAoY2hvaWNlPzogbnVtYmVyKSA9PiB2b2lkKTogUCB7XG5cblx0XHRjb25zdCBwcm9ncmVzc1N0YXRlTW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXBvcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvZ3Jlc3NTdGVwPigpKTtcblx0XHRcdHJlYWRvbmx5IG9uRGlkUmVwb3J0ID0gdGhpcy5fb25EaWRSZXBvcnQuZXZlbnQ7XG5cblx0XHRcdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdFx0XHRwcml2YXRlIF9zdGVwOiBJUHJvZ3Jlc3NTdGVwIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0Z2V0IHN0ZXAoKSB7IHJldHVybiB0aGlzLl9zdGVwOyB9XG5cblx0XHRcdHByaXZhdGUgX2RvbmUgPSBmYWxzZTtcblx0XHRcdGdldCBkb25lKCkgeyByZXR1cm4gdGhpcy5fZG9uZTsgfVxuXG5cdFx0XHRyZWFkb25seSBwcm9taXNlOiBQO1xuXG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoKTtcblxuXHRcdFx0XHR0aGlzLnByb21pc2UgPSBjYWxsYmFjayh0aGlzKTtcblxuXHRcdFx0XHR0aGlzLnByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXBvcnQoc3RlcDogSVByb2dyZXNzU3RlcCk6IHZvaWQge1xuXHRcdFx0XHR0aGlzLl9zdGVwID0gc3RlcDtcblxuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcG9ydC5maXJlKHN0ZXApO1xuXHRcdFx0fVxuXG5cdFx0XHRjYW5jZWwoY2hvaWNlPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0XHRcdG9uRGlkQ2FuY2VsPy4oY2hvaWNlKTtcblxuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5fZG9uZSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXG5cdFx0XHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgY3JlYXRlV2luZG93UHJvZ3Jlc3MgPSAoKSA9PiB7XG5cblx0XHRcdC8vIENyZWF0ZSBhIHByb21pc2UgdGhhdCB3ZSBjYW4gcmVzb2x2ZSBhcyBuZWVkZWRcblx0XHRcdC8vIHdoZW4gdGhlIG91dHNpZGUgY2FsbHMgZGlzcG9zZSBvbiB1c1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblxuXHRcdFx0dGhpcy53aXRoV2luZG93UHJvZ3Jlc3Moe1xuXHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHRcdHRpdGxlOiBvcHRpb25zLnRpdGxlID8gcGFyc2VMaW5rZWRUZXh0KG9wdGlvbnMudGl0bGUpLnRvU3RyaW5nKCkgOiB1bmRlZmluZWQsIC8vIGNvbnZlcnQgbWFya2Rvd24gbGlua3MgPT4gc3RyaW5nXG5cdFx0XHRcdGNvbW1hbmQ6ICdub3RpZmljYXRpb25zLnNob3dMaXN0Jyxcblx0XHRcdFx0dHlwZTogb3B0aW9ucy50eXBlXG5cdFx0XHR9LCBwcm9ncmVzcyA9PiB7XG5cblx0XHRcdFx0ZnVuY3Rpb24gcmVwb3J0UHJvZ3Jlc3Moc3RlcDogSVByb2dyZXNzU3RlcCkge1xuXHRcdFx0XHRcdGlmIChzdGVwLm1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IHBhcnNlTGlua2VkVGV4dChzdGVwLm1lc3NhZ2UpLnRvU3RyaW5nKCkgIC8vIGNvbnZlcnQgbWFya2Rvd24gbGlua3MgPT4gc3RyaW5nXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBcHBseSBhbnkgcHJvZ3Jlc3MgdGhhdCB3YXMgbWFkZSBhbHJlYWR5XG5cdFx0XHRcdGlmIChwcm9ncmVzc1N0YXRlTW9kZWwuc3RlcCkge1xuXHRcdFx0XHRcdHJlcG9ydFByb2dyZXNzKHByb2dyZXNzU3RhdGVNb2RlbC5zdGVwKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENvbnRpbnVlIHRvIHJlcG9ydCBwcm9ncmVzcyBhcyBpdCBoYXBwZW5zXG5cdFx0XHRcdGNvbnN0IG9uRGlkUmVwb3J0TGlzdGVuZXIgPSBwcm9ncmVzc1N0YXRlTW9kZWwub25EaWRSZXBvcnQoc3RlcCA9PiByZXBvcnRQcm9ncmVzcyhzdGVwKSk7XG5cdFx0XHRcdHByb21pc2UucC5maW5hbGx5KCgpID0+IG9uRGlkUmVwb3J0TGlzdGVuZXIuZGlzcG9zZSgpKTtcblxuXHRcdFx0XHQvLyBXaGVuIHRoZSBwcm9ncmVzcyBtb2RlbCBnZXRzIGRpc3Bvc2VkLCB3ZSBhcmUgZG9uZSBhcyB3ZWxsXG5cdFx0XHRcdEV2ZW50Lm9uY2UocHJvZ3Jlc3NTdGF0ZU1vZGVsLm9uV2lsbERpc3Bvc2UpKCgpID0+IHByb21pc2UuY29tcGxldGUoKSk7XG5cblx0XHRcdFx0cmV0dXJuIHByb21pc2UucDtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBEaXNwb3NlIG1lYW5zIGNvbXBsZXRpbmcgb3VyIHByb21pc2Vcblx0XHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gcHJvbWlzZS5jb21wbGV0ZSgpKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3JlYXRlTm90aWZpY2F0aW9uID0gKG1lc3NhZ2U6IHN0cmluZywgcHJpb3JpdHk/OiBOb3RpZmljYXRpb25Qcmlvcml0eSwgaW5jcmVtZW50PzogbnVtYmVyKTogSU5vdGlmaWNhdGlvbkhhbmRsZSA9PiB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnMgPSBvcHRpb25zLnByaW1hcnlBY3Rpb25zID8gQXJyYXkuZnJvbShvcHRpb25zLnByaW1hcnlBY3Rpb25zKSA6IFtdO1xuXHRcdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9ucyA9IG9wdGlvbnMuc2Vjb25kYXJ5QWN0aW9ucyA/IEFycmF5LmZyb20ob3B0aW9ucy5zZWNvbmRhcnlBY3Rpb25zKSA6IFtdO1xuXG5cdFx0XHRpZiAob3B0aW9ucy5idXR0b25zKSB7XG5cdFx0XHRcdG9wdGlvbnMuYnV0dG9ucy5mb3JFYWNoKChidXR0b24sIGluZGV4KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYnV0dG9uQWN0aW9uID0gbmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uIHtcblx0XHRcdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdFx0XHRzdXBlcihgcHJvZ3Jlc3MuYnV0dG9uLiR7YnV0dG9ufWAsIGJ1dHRvbiwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdFx0XHRwcm9ncmVzc1N0YXRlTW9kZWwuY2FuY2VsKGluZGV4KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdG5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzLmFkZChidXR0b25BY3Rpb24pO1xuXG5cdFx0XHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaChidXR0b25BY3Rpb24pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9wdGlvbnMuY2FuY2VsbGFibGUpIHtcblx0XHRcdFx0Y29uc3QgY2FuY2VsQWN0aW9uID0gbmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uIHtcblx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdHN1cGVyKCdwcm9ncmVzcy5jYW5jZWwnLCB0eXBlb2Ygb3B0aW9ucy5jYW5jZWxsYWJsZSA9PT0gJ3N0cmluZycgPyBvcHRpb25zLmNhbmNlbGxhYmxlIDogbG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRcdHByb2dyZXNzU3RhdGVNb2RlbC5jYW5jZWwoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdG5vdGlmaWNhdGlvbkRpc3Bvc2FibGVzLmFkZChjYW5jZWxBY3Rpb24pO1xuXG5cdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2goY2FuY2VsQWN0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlOiBzdHJpcEljb25zKG1lc3NhZ2UpLCAvLyBzdGF0dXMgZW50cmllcyBzdXBwb3J0IGNvZGljb25zLCBidXQgbm90aWZpY2F0aW9ucyBkbyBub3QgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDU3MjIpXG5cdFx0XHRcdHNvdXJjZTogb3B0aW9ucy5zb3VyY2UsXG5cdFx0XHRcdGFjdGlvbnM6IHsgcHJpbWFyeTogcHJpbWFyeUFjdGlvbnMsIHNlY29uZGFyeTogc2Vjb25kYXJ5QWN0aW9ucyB9LFxuXHRcdFx0XHRwcm9ncmVzczogdHlwZW9mIGluY3JlbWVudCA9PT0gJ251bWJlcicgJiYgaW5jcmVtZW50ID49IDAgPyB7IHRvdGFsOiAxMDAsIHdvcmtlZDogaW5jcmVtZW50IH0gOiB7IGluZmluaXRlOiB0cnVlIH0sXG5cdFx0XHRcdHByaW9yaXR5XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU3dpdGNoIHRvIHdpbmRvdyBiYXNlZCBwcm9ncmVzcyBvbmNlIHRoZSBub3RpZmljYXRpb25cblx0XHRcdC8vIGNoYW5nZXMgdmlzaWJpbGl0eSB0byBoaWRkZW4gYW5kIGlzIHN0aWxsIG9uZ29pbmcuXG5cdFx0XHQvLyBSZW1vdmUgdGhhdCB3aW5kb3cgYmFzZWQgcHJvZ3Jlc3Mgb25jZSB0aGUgbm90aWZpY2F0aW9uXG5cdFx0XHQvLyBzaG93cyBhZ2Fpbi5cblx0XHRcdGxldCB3aW5kb3dQcm9ncmVzc0Rpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgb25WaXNpYmlsaXR5Q2hhbmdlID0gKHZpc2libGU6IGJvb2xlYW4pID0+IHtcblxuXHRcdFx0XHQvLyBDbGVhciBhbnkgcHJldmlvdXMgcnVubmluZyB3aW5kb3cgcHJvZ3Jlc3Ncblx0XHRcdFx0ZGlzcG9zZSh3aW5kb3dQcm9ncmVzc0Rpc3Bvc2FibGUpO1xuXG5cdFx0XHRcdC8vIENyZWF0ZSBuZXcgd2luZG93IHByb2dyZXNzIGlmIG5vdGlmaWNhdGlvbiBnb3QgaGlkZGVuXG5cdFx0XHRcdGlmICghdmlzaWJsZSAmJiAhcHJvZ3Jlc3NTdGF0ZU1vZGVsLmRvbmUpIHtcblx0XHRcdFx0XHR3aW5kb3dQcm9ncmVzc0Rpc3Bvc2FibGUgPSBjcmVhdGVXaW5kb3dQcm9ncmVzcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0bm90aWZpY2F0aW9uRGlzcG9zYWJsZXMuYWRkKG5vdGlmaWNhdGlvbi5vbkRpZENoYW5nZVZpc2liaWxpdHkob25WaXNpYmlsaXR5Q2hhbmdlKSk7XG5cdFx0XHRpZiAocHJpb3JpdHkgPT09IE5vdGlmaWNhdGlvblByaW9yaXR5LlNJTEVOVCkge1xuXHRcdFx0XHRvblZpc2liaWxpdHlDaGFuZ2UoZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbGVhciB1cG9uIGRpc3Bvc2Vcblx0XHRcdEV2ZW50Lm9uY2Uobm90aWZpY2F0aW9uLm9uRGlkQ2xvc2UpKCgpID0+IHtcblx0XHRcdFx0bm90aWZpY2F0aW9uRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRkaXNwb3NlKHdpbmRvd1Byb2dyZXNzRGlzcG9zYWJsZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIG5vdGlmaWNhdGlvbjtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXBkYXRlUHJvZ3Jlc3MgPSAobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uSGFuZGxlLCBpbmNyZW1lbnQ/OiBudW1iZXIpOiB2b2lkID0+IHtcblx0XHRcdGlmICh0eXBlb2YgaW5jcmVtZW50ID09PSAnbnVtYmVyJyAmJiBpbmNyZW1lbnQgPj0gMCkge1xuXHRcdFx0XHRub3RpZmljYXRpb24ucHJvZ3Jlc3MudG90YWwoMTAwKTsgLy8gYWx3YXlzIHBlcmNlbnRhZ2UgYmFzZWRcblx0XHRcdFx0bm90aWZpY2F0aW9uLnByb2dyZXNzLndvcmtlZChpbmNyZW1lbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uLnByb2dyZXNzLmluZmluaXRlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGxldCBub3RpZmljYXRpb25IYW5kbGU6IElOb3RpZmljYXRpb25IYW5kbGUgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG5vdGlmaWNhdGlvblRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHRpdGxlQW5kTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkOyAvLyBob2lzdGVkIHRvIG1ha2Ugc3VyZSBhIGRlbGF5ZWQgbm90aWZpY2F0aW9uIHNob3dzIHRoZSBtb3N0IHJlY2VudCBtZXNzYWdlXG5cblx0XHRjb25zdCB1cGRhdGVOb3RpZmljYXRpb24gPSAoc3RlcD86IElQcm9ncmVzc1N0ZXApOiB2b2lkID0+IHtcblxuXHRcdFx0Ly8gZnVsbCBtZXNzYWdlIChpbml0YWwgb3IgdXBkYXRlKVxuXHRcdFx0aWYgKHN0ZXA/Lm1lc3NhZ2UgJiYgb3B0aW9ucy50aXRsZSkge1xuXHRcdFx0XHR0aXRsZUFuZE1lc3NhZ2UgPSBgJHtvcHRpb25zLnRpdGxlfTogJHtzdGVwLm1lc3NhZ2V9YDsgLy8gYWx3YXlzIHByZWZpeCB3aXRoIG92ZXJhbGwgdGl0bGUgaWYgd2UgaGF2ZSBpdCAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzUwOTMyKVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGl0bGVBbmRNZXNzYWdlID0gb3B0aW9ucy50aXRsZSB8fCBzdGVwPy5tZXNzYWdlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIW5vdGlmaWNhdGlvbkhhbmRsZSAmJiB0aXRsZUFuZE1lc3NhZ2UpIHtcblxuXHRcdFx0XHQvLyBjcmVhdGUgbm90aWZpY2F0aW9uIG5vdyBvciBhZnRlciBhIGRlbGF5XG5cdFx0XHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5kZWxheSA9PT0gJ251bWJlcicgJiYgb3B0aW9ucy5kZWxheSA+IDApIHtcblx0XHRcdFx0XHRpZiAobm90aWZpY2F0aW9uVGltZW91dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRub3RpZmljYXRpb25UaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBub3RpZmljYXRpb25IYW5kbGUgPSBjcmVhdGVOb3RpZmljYXRpb24odGl0bGVBbmRNZXNzYWdlISwgb3B0aW9ucy5wcmlvcml0eSwgc3RlcD8uaW5jcmVtZW50KSwgb3B0aW9ucy5kZWxheSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG5vdGlmaWNhdGlvbkhhbmRsZSA9IGNyZWF0ZU5vdGlmaWNhdGlvbih0aXRsZUFuZE1lc3NhZ2UsIG9wdGlvbnMucHJpb3JpdHksIHN0ZXA/LmluY3JlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKG5vdGlmaWNhdGlvbkhhbmRsZSkge1xuXHRcdFx0XHRpZiAodGl0bGVBbmRNZXNzYWdlKSB7XG5cdFx0XHRcdFx0bm90aWZpY2F0aW9uSGFuZGxlLnVwZGF0ZU1lc3NhZ2UodGl0bGVBbmRNZXNzYWdlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0eXBlb2Ygc3RlcD8uaW5jcmVtZW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHVwZGF0ZVByb2dyZXNzKG5vdGlmaWNhdGlvbkhhbmRsZSwgc3RlcC5pbmNyZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFNob3cgaW5pdGlhbGx5XG5cdFx0dXBkYXRlTm90aWZpY2F0aW9uKHByb2dyZXNzU3RhdGVNb2RlbC5zdGVwKTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IHByb2dyZXNzU3RhdGVNb2RlbC5vbkRpZFJlcG9ydChzdGVwID0+IHVwZGF0ZU5vdGlmaWNhdGlvbihzdGVwKSk7XG5cdFx0RXZlbnQub25jZShwcm9ncmVzc1N0YXRlTW9kZWwub25XaWxsRGlzcG9zZSkoKCkgPT4gbGlzdGVuZXIuZGlzcG9zZSgpKTtcblxuXHRcdC8vIENsZWFuIHVwIGV2ZW50dWFsbHlcblx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblxuXHRcdFx0XHQvLyB3aXRoIGEgZGVsYXkgd2Ugb25seSB3YWl0IGZvciB0aGUgZmluaXNoIG9mIHRoZSBwcm9taXNlXG5cdFx0XHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5kZWxheSA9PT0gJ251bWJlcicgJiYgb3B0aW9ucy5kZWxheSA+IDApIHtcblx0XHRcdFx0XHRhd2FpdCBwcm9ncmVzc1N0YXRlTW9kZWwucHJvbWlzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHdpdGhvdXQgYSBkZWxheSB3ZSBzaG93IHRoZSBub3RpZmljYXRpb24gZm9yIGF0IGxlYXN0IDgwMG1zXG5cdFx0XHRcdC8vIHRvIHJlZHVjZSB0aGUgY2hhbmNlIG9mIHRoZSBub3RpZmljYXRpb24gZmxhc2hpbmcgdXAgYW5kIGhpZGluZ1xuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbdGltZW91dCg4MDApLCBwcm9ncmVzc1N0YXRlTW9kZWwucHJvbWlzZV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQobm90aWZpY2F0aW9uVGltZW91dCk7XG5cdFx0XHRcdG5vdGlmaWNhdGlvbkhhbmRsZT8uY2xvc2UoKTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0cmV0dXJuIHByb2dyZXNzU3RhdGVNb2RlbC5wcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoUGFuZUNvbXBvc2l0ZVByb2dyZXNzPFAgZXh0ZW5kcyBQcm9taXNlPFI+LCBSID0gdW5rbm93bj4ocGFuZUNvbXBvc2l0ZUlkOiBzdHJpbmcsIHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uLCB0YXNrOiAocHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4gUCwgb3B0aW9uczogSVByb2dyZXNzQ29tcG9zaXRlT3B0aW9ucyk6IFAge1xuXG5cdFx0Ly8gc2hvdyBpbiB2aWV3bGV0XG5cdFx0Y29uc3QgcHJvZ3Jlc3NJbmRpY2F0b3IgPSB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldFByb2dyZXNzSW5kaWNhdG9yKHBhbmVDb21wb3NpdGVJZCwgdmlld0NvbnRhaW5lckxvY2F0aW9uKTtcblx0XHRjb25zdCBwcm9taXNlID0gcHJvZ3Jlc3NJbmRpY2F0b3IgPyB0aGlzLndpdGhDb21wb3NpdGVQcm9ncmVzcyhwcm9ncmVzc0luZGljYXRvciwgdGFzaywgb3B0aW9ucykgOiB0YXNrKHsgcmVwb3J0OiAoKSA9PiB7IH0gfSk7XG5cblx0XHQvLyBzaG93IG9uIGFjdGl2aXR5IGJhclxuXHRcdGlmICh2aWV3Q29udGFpbmVyTG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSB7XG5cdFx0XHR0aGlzLnNob3dPbkFjdGl2aXR5QmFyPFAsIFI+KHBhbmVDb21wb3NpdGVJZCwgb3B0aW9ucywgcHJvbWlzZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIHdpdGhWaWV3UHJvZ3Jlc3M8UCBleHRlbmRzIFByb21pc2U8Uj4sIFIgPSB1bmtub3duPih2aWV3SWQ6IHN0cmluZywgdGFzazogKHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pID0+IFAsIG9wdGlvbnM6IElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMpOiBQIHtcblxuXHRcdC8vIHNob3cgaW4gdmlld2xldFxuXHRcdGNvbnN0IHByb2dyZXNzSW5kaWNhdG9yID0gdGhpcy52aWV3c1NlcnZpY2UuZ2V0Vmlld1Byb2dyZXNzSW5kaWNhdG9yKHZpZXdJZCk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHByb2dyZXNzSW5kaWNhdG9yID8gdGhpcy53aXRoQ29tcG9zaXRlUHJvZ3Jlc3MocHJvZ3Jlc3NJbmRpY2F0b3IsIHRhc2ssIG9wdGlvbnMpIDogdGFzayh7IHJlcG9ydDogKCkgPT4geyB9IH0pO1xuXG5cdFx0Y29uc3Qgdmlld2xldElkID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdJZCk/LmlkO1xuXHRcdGlmICh2aWV3bGV0SWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHByb21pc2U7XG5cdFx0fVxuXG5cdFx0Ly8gc2hvdyBvbiBhY3Rpdml0eSBiYXJcblx0XHR0aGlzLnNob3dPbkFjdGl2aXR5QmFyKHZpZXdsZXRJZCwgb3B0aW9ucywgcHJvbWlzZSk7XG5cblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd09uQWN0aXZpdHlCYXI8UCBleHRlbmRzIFByb21pc2U8Uj4sIFIgPSB1bmtub3duPih2aWV3bGV0SWQ6IHN0cmluZywgb3B0aW9uczogSVByb2dyZXNzQ29tcG9zaXRlT3B0aW9ucywgcHJvbWlzZTogUCk6IHZvaWQge1xuXHRcdGxldCBhY3Rpdml0eVByb2dyZXNzOiBJRGlzcG9zYWJsZTtcblx0XHRsZXQgZGVsYXlIYW5kbGU6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGRlbGF5SGFuZGxlID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd1ZpZXdDb250YWluZXJBY3Rpdml0eSh2aWV3bGV0SWQsIHsgYmFkZ2U6IG5ldyBQcm9ncmVzc0JhZGdlKCgpID0+ICcnKSB9KTtcblx0XHRcdGNvbnN0IHN0YXJ0VGltZVZpc2libGUgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgbWluVGltZVZpc2libGUgPSAzMDA7XG5cdFx0XHRhY3Rpdml0eVByb2dyZXNzID0ge1xuXHRcdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRcdGNvbnN0IGQgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lVmlzaWJsZTtcblx0XHRcdFx0XHRpZiAoZCA8IG1pblRpbWVWaXNpYmxlKSB7XG5cdFx0XHRcdFx0XHQvLyBzaG91bGQgYXQgbGVhc3Qgc2hvdyBmb3IgTm1zXG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGhhbmRsZS5kaXNwb3NlKCksIG1pblRpbWVWaXNpYmxlIC0gZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIHNob3duIGxvbmcgZW5vdWdoXG5cdFx0XHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9LCBvcHRpb25zLmRlbGF5IHx8IDMwMCk7XG5cdFx0cHJvbWlzZS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGNsZWFyVGltZW91dChkZWxheUhhbmRsZSk7XG5cdFx0XHRkaXNwb3NlKGFjdGl2aXR5UHJvZ3Jlc3MpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoQ29tcG9zaXRlUHJvZ3Jlc3M8UCBleHRlbmRzIFByb21pc2U8Uj4sIFIgPSB1bmtub3duPihwcm9ncmVzc0luZGljYXRvcjogSVByb2dyZXNzSW5kaWNhdG9yLCB0YXNrOiAocHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikgPT4gUCwgb3B0aW9uczogSVByb2dyZXNzQ29tcG9zaXRlT3B0aW9ucyk6IFAge1xuXHRcdGxldCBkaXNjcmV0ZVByb2dyZXNzUnVubmVyOiBJUHJvZ3Jlc3NSdW5uZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRmdW5jdGlvbiB1cGRhdGVQcm9ncmVzcyhzdGVwT3JUb3RhbDogSVByb2dyZXNzU3RlcCB8IG51bWJlciB8IHVuZGVmaW5lZCk6IElQcm9ncmVzc1J1bm5lciB8IHVuZGVmaW5lZCB7XG5cblx0XHRcdC8vIEZpZ3VyZSBvdXQgd2hldGhlciBkaXNjcmV0ZSBwcm9ncmVzcyBhcHBsaWVzXG5cdFx0XHQvLyBieSBmaWd1cmluZyBvdXQgdGhlIFwidG90YWxcIiBwcm9ncmVzcyB0byBzaG93XG5cdFx0XHQvLyBhbmQgdGhlIGluY3JlbWVudCBpZiBhbnkuXG5cdFx0XHRsZXQgdG90YWw6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBpbmNyZW1lbnQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0eXBlb2Ygc3RlcE9yVG90YWwgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdGlmICh0eXBlb2Ygc3RlcE9yVG90YWwgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0dG90YWwgPSBzdGVwT3JUb3RhbDtcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2Ygc3RlcE9yVG90YWwuaW5jcmVtZW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHRvdGFsID0gc3RlcE9yVG90YWwudG90YWwgPz8gMTAwOyAvLyBhbHdheXMgcGVyY2VudGFnZSBiYXNlZFxuXHRcdFx0XHRcdGluY3JlbWVudCA9IHN0ZXBPclRvdGFsLmluY3JlbWVudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBEaXNjcmV0ZVxuXHRcdFx0aWYgKHR5cGVvZiB0b3RhbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0aWYgKCFkaXNjcmV0ZVByb2dyZXNzUnVubmVyKSB7XG5cdFx0XHRcdFx0ZGlzY3JldGVQcm9ncmVzc1J1bm5lciA9IHByb2dyZXNzSW5kaWNhdG9yLnNob3codG90YWwsIG9wdGlvbnMuZGVsYXkpO1xuXHRcdFx0XHRcdHByb21pc2UuY2F0Y2goKCkgPT4gdW5kZWZpbmVkIC8qIGlnbm9yZSAqLykuZmluYWxseSgoKSA9PiBkaXNjcmV0ZVByb2dyZXNzUnVubmVyPy5kb25lKCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBpbmNyZW1lbnQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0ZGlzY3JldGVQcm9ncmVzc1J1bm5lci53b3JrZWQoaW5jcmVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbmZpbml0ZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGRpc2NyZXRlUHJvZ3Jlc3NSdW5uZXI/LmRvbmUoKTtcblx0XHRcdFx0cHJvZ3Jlc3NJbmRpY2F0b3Iuc2hvd1doaWxlKHByb21pc2UsIG9wdGlvbnMuZGVsYXkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZGlzY3JldGVQcm9ncmVzc1J1bm5lcjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9taXNlID0gdGFzayh7XG5cdFx0XHRyZXBvcnQ6IHByb2dyZXNzID0+IHtcblx0XHRcdFx0dXBkYXRlUHJvZ3Jlc3MocHJvZ3Jlc3MpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dXBkYXRlUHJvZ3Jlc3Mob3B0aW9ucy50b3RhbCk7XG5cblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgd2l0aERpYWxvZ1Byb2dyZXNzPFAgZXh0ZW5kcyBQcm9taXNlPFI+LCBSID0gdW5rbm93bj4ob3B0aW9uczogSVByb2dyZXNzRGlhbG9nT3B0aW9ucywgdGFzazogKHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pID0+IFAsIG9uRGlkQ2FuY2VsPzogKGNob2ljZT86IG51bWJlcikgPT4gdm9pZCk6IFAge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0bGV0IGRpYWxvZzogRGlhbG9nO1xuXHRcdGxldCB0YXNrQ29tcGxldGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBjcmVhdGVEaWFsb2cgPSAobWVzc2FnZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBidXR0b25zID0gb3B0aW9ucy5idXR0b25zIHx8IFtdO1xuXHRcdFx0aWYgKCFvcHRpb25zLnN0aWNreSkge1xuXHRcdFx0XHRidXR0b25zLnB1c2gob3B0aW9ucy5jYW5jZWxsYWJsZVxuXHRcdFx0XHRcdD8gKHR5cGVvZiBvcHRpb25zLmNhbmNlbGxhYmxlID09PSAnYm9vbGVhbicgPyBsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIikgOiBvcHRpb25zLmNhbmNlbGxhYmxlKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2Rpc21pc3MnLCBcIkRpc21pc3NcIilcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0ZGlhbG9nID0gbmV3IERpYWxvZyhcblx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcixcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0Y3JlYXRlV29ya2JlbmNoRGlhbG9nT3B0aW9ucyh7XG5cdFx0XHRcdFx0dHlwZTogJ3BlbmRpbmcnLFxuXHRcdFx0XHRcdGRldGFpbDogb3B0aW9ucy5kZXRhaWwsXG5cdFx0XHRcdFx0Y2FuY2VsSWQ6IGJ1dHRvbnMubGVuZ3RoIC0gMSxcblx0XHRcdFx0XHRkaXNhYmxlQ2xvc2VBY3Rpb246IG9wdGlvbnMuc3RpY2t5LFxuXHRcdFx0XHRcdGRpc2FibGVEZWZhdWx0QWN0aW9uOiBvcHRpb25zLnN0aWNreVxuXHRcdFx0XHR9LCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLmxheW91dFNlcnZpY2UsIHRoaXMuaG9zdFNlcnZpY2UpXG5cdFx0XHQpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZGlhbG9nKTtcblxuXHRcdFx0ZGlhbG9nLnNob3coKS50aGVuKGRpYWxvZ1Jlc3VsdCA9PiB7XG5cdFx0XHRcdC8vIFRoZSBkaWFsb2cgbWF5IGNsb3NlIGFzIGEgcmVzdWx0IG9mIGRpc3Bvc2luZyBpdCBhZnRlciB0aGVcblx0XHRcdFx0Ly8gdGFzayBoYXMgY29tcGxldGVkLiBJbiB0aGF0IGNhc2UsIHdlIGRvIG5vdCB3YW50IHRvIHRyaWdnZXJcblx0XHRcdFx0Ly8gdGhlIGBvbkRpZENhbmNlbGAgY2FsbGJhY2suXG5cdFx0XHRcdC8vIEhvd2V2ZXIsIGlmIHRoZSB0YXNrIGlzIHN0aWxsIHJ1bm5pbmcsIHRoaXMgbWVhbnMgdGhhdCB0aGVcblx0XHRcdFx0Ly8gdXNlciBoYXMgY2xpY2tlZCB0aGUgY2FuY2VsIGJ1dHRvbiBhbmQgd2Ugd2FudCB0byB0cmlnZ2VyXG5cdFx0XHRcdC8vIHRoZSBgb25EaWRDYW5jZWxgIGNhbGxiYWNrLlxuXHRcdFx0XHRpZiAoIXRhc2tDb21wbGV0ZWQpIHtcblx0XHRcdFx0XHRvbkRpZENhbmNlbD8uKGRpYWxvZ1Jlc3VsdC5idXR0b24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2UoZGlhbG9nKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gZGlhbG9nO1xuXHRcdH07XG5cblx0XHQvLyBJbiBvcmRlciB0byBzdXBwb3J0IHRoZSBgZGVsYXlgIG9wdGlvbiwgd2UgdXNlIGEgc2NoZWR1bGVyXG5cdFx0Ly8gdGhhdCB3aWxsIGd1YXJkIGVhY2ggYWNjZXNzIHRvIHRoZSBkaWFsb2cgYmVoaW5kIGEgZGVsYXlcblx0XHQvLyB0aGF0IGlzIGVpdGhlciB0aGUgb3JpZ2luYWwgZGVsYXkgZm9yIG9uZSBpbnZvY2F0aW9uIGFuZFxuXHRcdC8vIG90aGVyd2lzZSBydW5zIHdpdGhvdXQgZGVsYXkuXG5cdFx0bGV0IGRlbGF5ID0gb3B0aW9ucy5kZWxheSA/PyAwO1xuXHRcdGxldCBsYXRlc3RNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdGRlbGF5ID0gMDsgLy8gc2luY2Ugd2UgaGF2ZSBydW4gb25jZSwgd2UgcmVzZXQgdGhlIGRlbGF5XG5cblx0XHRcdGlmIChsYXRlc3RNZXNzYWdlICYmICFkaWFsb2cpIHtcblx0XHRcdFx0ZGlhbG9nID0gY3JlYXRlRGlhbG9nKGxhdGVzdE1lc3NhZ2UpO1xuXHRcdFx0fSBlbHNlIGlmIChsYXRlc3RNZXNzYWdlKSB7XG5cdFx0XHRcdGRpYWxvZy51cGRhdGVNZXNzYWdlKGxhdGVzdE1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH0sIDApKTtcblxuXHRcdGNvbnN0IHVwZGF0ZURpYWxvZyA9IGZ1bmN0aW9uIChtZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRsYXRlc3RNZXNzYWdlID0gbWVzc2FnZTtcblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRvIG9ubHkgcnVuIG9uZSBkaWFsb2cgdXBkYXRlIGFuZCBub3QgbXVsdGlwbGVcblx0XHRcdGlmICghc2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKGRlbGF5KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRhc2soe1xuXHRcdFx0cmVwb3J0OiBwcm9ncmVzcyA9PiB7XG5cdFx0XHRcdHVwZGF0ZURpYWxvZyhwcm9ncmVzcy5tZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0YXNrQ29tcGxldGVkID0gdHJ1ZTtcblx0XHRcdGRpc3Bvc2UoZGlzcG9zYWJsZXMpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKG9wdGlvbnMudGl0bGUpIHtcblx0XHRcdHVwZGF0ZURpYWxvZyhvcHRpb25zLnRpdGxlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7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USxjQUNuRixTQUFTLFdBQVcsU0FBUztBQUFBLFFBQ2hDO0FBQUEsTUFDRDtBQUVBLGVBQVMsSUFBSTtBQUFBLFFBQ1osS0FBSyxjQUFjO0FBQUEsUUFDbkI7QUFBQSxRQUNBO0FBQUEsUUFDQSw2QkFBNkI7QUFBQSxVQUM1QixNQUFNO0FBQUEsVUFDTixRQUFRLFFBQVE7QUFBQSxVQUNoQixVQUFVLFFBQVEsU0FBUztBQUFBLFVBQzNCLG9CQUFvQixRQUFRO0FBQUEsVUFDNUIsc0JBQXNCLFFBQVE7QUFBQSxRQUMvQixHQUFHLEtBQUssbUJBQW1CLEtBQUssZUFBZSxLQUFLLFdBQVc7QUFBQSxNQUNoRTtBQUVBLGtCQUFZLElBQUksTUFBTTtBQUV0QixhQUFPLEtBQUssRUFBRSxLQUFLLGtCQUFnQjtBQU9sQyxZQUFJLENBQUMsZUFBZTtBQUNuQix3QkFBYyxhQUFhLE1BQU07QUFBQSxRQUNsQztBQUNBLGdCQUFRLE1BQU07QUFBQSxNQUNmLENBQUM7QUFFRCxhQUFPO0FBQUEsSUFDUjtBQU1BLFFBQUksUUFBUSxRQUFRLFNBQVM7QUFDN0IsUUFBSSxnQkFBb0M7QUFDeEMsVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLGlCQUFpQixNQUFNO0FBQzVELGNBQVE7QUFFUixVQUFJLGlCQUFpQixDQUFDLFFBQVE7QUFDN0IsaUJBQVMsYUFBYSxhQUFhO0FBQUEsTUFDcEMsV0FBVyxlQUFlO0FBQ3pCLGVBQU8sY0FBYyxhQUFhO0FBQUEsTUFDbkM7QUFBQSxJQUNELEdBQUcsQ0FBQyxDQUFDO0FBRUwsVUFBTSxlQUFlLFNBQVUsU0FBd0I7QUFDdEQsc0JBQWdCO0FBR2hCLFVBQUksQ0FBQyxVQUFVLFlBQVksR0FBRztBQUM3QixrQkFBVSxTQUFTLEtBQUs7QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQVUsS0FBSztBQUFBLE1BQ3BCLFFBQVEsY0FBWTtBQUNuQixxQkFBYSxTQUFTLE9BQU87QUFBQSxNQUM5QjtBQUFBLElBQ0QsQ0FBQztBQUVELFlBQVEsUUFBUSxNQUFNO0FBQ3JCLHNCQUFnQjtBQUNoQixjQUFRLFdBQVc7QUFBQSxJQUNwQixDQUFDO0FBRUQsUUFBSSxRQUFRLE9BQU87QUFDbEIsbUJBQWEsUUFBUSxLQUFLO0FBQUEsSUFDM0I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBaG1CYSxrQkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWRVO0FBa21CYixrQkFBa0Isa0JBQWtCLGlCQUFpQixrQkFBa0IsT0FBTzsiLAogICJuYW1lcyI6IFsibG9jYXRpb24iXQp9Cg==
