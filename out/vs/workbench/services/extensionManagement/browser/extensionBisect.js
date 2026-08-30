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
import { localize, localize2 } from "../../../../nls.js";
import { IExtensionManagementService, IGlobalExtensionEnablementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ExtensionType, isResolverExtension } from "../../../../platform/extensions/common/extensions.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../host/browser/host.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../common/contributions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IWorkbenchExtensionEnablementService } from "../common/extensionManagement.js";
const IExtensionBisectService = createDecorator("IExtensionBisectService");
class BisectState {
  constructor(extensions, low, high, mid = (low + high) / 2 | 0) {
    this.extensions = extensions;
    this.low = low;
    this.high = high;
    this.mid = mid;
  }
  static fromJSON(raw) {
    if (!raw) {
      return void 0;
    }
    try {
      const data = JSON.parse(raw);
      return new BisectState(data.extensions, data.low, data.high, data.mid);
    } catch {
      return void 0;
    }
  }
}
let ExtensionBisectService = class {
  constructor(logService, _storageService, _envService) {
    this._storageService = _storageService;
    this._envService = _envService;
    this._disabled = /* @__PURE__ */ new Map();
    const raw = _storageService.get(ExtensionBisectService._storageKey, StorageScope.APPLICATION);
    this._state = BisectState.fromJSON(raw);
    if (this._state) {
      const { mid, high } = this._state;
      for (let i = 0; i < this._state.extensions.length; i++) {
        const isDisabled = i >= mid && i < high;
        this._disabled.set(this._state.extensions[i], isDisabled);
      }
      logService.warn("extension BISECT active", [...this._disabled]);
    }
  }
  get isActive() {
    return !!this._state;
  }
  get disabledCount() {
    return this._state ? this._state.high - this._state.mid : -1;
  }
  isDisabledByBisect(extension) {
    if (!this._state) {
      return false;
    }
    if (isResolverExtension(extension.manifest, this._envService.remoteAuthority)) {
      return false;
    }
    if (this._isEnabledInEnv(extension)) {
      return false;
    }
    const disabled = this._disabled.get(extension.identifier.id);
    return disabled ?? false;
  }
  _isEnabledInEnv(extension) {
    return Array.isArray(this._envService.enableExtensions) && this._envService.enableExtensions.some((id) => areSameExtensions({ id }, extension.identifier));
  }
  async start(extensions) {
    if (this._state) {
      throw new Error("invalid state");
    }
    const extensionIds = extensions.map((ext) => ext.identifier.id);
    const newState = new BisectState(extensionIds, 0, extensionIds.length, 0);
    this._storageService.store(ExtensionBisectService._storageKey, JSON.stringify(newState), StorageScope.APPLICATION, StorageTarget.MACHINE);
    await this._storageService.flush();
  }
  async next(seeingBad) {
    if (!this._state) {
      throw new Error("invalid state");
    }
    if (seeingBad && this._state.mid === 0 && this._state.high === this._state.extensions.length) {
      return { bad: true, id: "" };
    }
    if (this._state.low === this._state.high - 1) {
      await this.reset();
      return { id: this._state.extensions[this._state.low], bad: seeingBad };
    }
    const nextState = new BisectState(
      this._state.extensions,
      seeingBad ? this._state.low : this._state.mid,
      seeingBad ? this._state.mid : this._state.high
    );
    this._storageService.store(ExtensionBisectService._storageKey, JSON.stringify(nextState), StorageScope.APPLICATION, StorageTarget.MACHINE);
    await this._storageService.flush();
    return void 0;
  }
  async reset() {
    this._storageService.remove(ExtensionBisectService._storageKey, StorageScope.APPLICATION);
    await this._storageService.flush();
  }
};
ExtensionBisectService._storageKey = "extensionBisectState";
ExtensionBisectService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IWorkbenchEnvironmentService)
], ExtensionBisectService);
registerSingleton(IExtensionBisectService, ExtensionBisectService, InstantiationType.Delayed);
let ExtensionBisectUi = class {
  constructor(contextKeyService, _extensionBisectService, _notificationService, _commandService) {
    this._extensionBisectService = _extensionBisectService;
    this._notificationService = _notificationService;
    this._commandService = _commandService;
    if (_extensionBisectService.isActive) {
      ExtensionBisectUi.ctxIsBisectActive.bindTo(contextKeyService).set(true);
      this._showBisectPrompt();
    }
  }
  _showBisectPrompt() {
    const goodPrompt = {
      label: localize("I cannot reproduce", "I can't reproduce"),
      run: () => this._commandService.executeCommand("extension.bisect.next", false)
    };
    const badPrompt = {
      label: localize("This is Bad", "I can reproduce"),
      run: () => this._commandService.executeCommand("extension.bisect.next", true)
    };
    const stop = {
      label: "Stop Bisect",
      run: () => this._commandService.executeCommand("extension.bisect.stop")
    };
    const message = this._extensionBisectService.disabledCount === 1 ? localize("bisect.singular", "Extension Bisect is active and has disabled 1 extension. Check if you can still reproduce the problem and proceed by selecting from these options.") : localize("bisect.plural", "Extension Bisect is active and has disabled {0} extensions. Check if you can still reproduce the problem and proceed by selecting from these options.", this._extensionBisectService.disabledCount);
    this._notificationService.prompt(
      Severity.Info,
      message,
      [goodPrompt, badPrompt, stop],
      { sticky: true, priority: NotificationPriority.URGENT }
    );
  }
};
ExtensionBisectUi.ctxIsBisectActive = new RawContextKey("isExtensionBisectActive", false);
ExtensionBisectUi = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IExtensionBisectService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, ICommandService)
], ExtensionBisectUi);
Registry.as(Extensions.Workbench).registerWorkbenchContribution(
  ExtensionBisectUi,
  LifecyclePhase.Restored
);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "extension.bisect.start",
      title: localize2("title.start", "Start Extension Bisect"),
      category: Categories.Help,
      f1: true,
      precondition: ExtensionBisectUi.ctxIsBisectActive.negate(),
      menu: {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", "workbench.view.extensions"),
        group: "2_enablement",
        order: 4
      }
    });
  }
  async run(accessor) {
    const dialogService = accessor.get(IDialogService);
    const hostService = accessor.get(IHostService);
    const extensionManagement = accessor.get(IExtensionManagementService);
    const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
    const extensionsBisect = accessor.get(IExtensionBisectService);
    const extensions = (await extensionManagement.getInstalled(ExtensionType.User)).filter((ext) => extensionEnablementService.isEnabled(ext));
    const res = await dialogService.confirm({
      message: localize("msg.start", "Extension Bisect"),
      detail: localize("detail.start", "Extension Bisect will use binary search to find an extension that causes a problem. During the process the window reloads repeatedly (~{0} times). Each time you must confirm if you are still seeing problems.", 2 + Math.log2(extensions.length) | 0),
      primaryButton: localize({ key: "msg2", comment: ["&& denotes a mnemonic"] }, "&&Start Extension Bisect")
    });
    if (res.confirmed) {
      await extensionsBisect.start(extensions);
      hostService.reload();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "extension.bisect.next",
      title: localize2("title.isBad", "Continue Extension Bisect"),
      category: Categories.Help,
      f1: true,
      precondition: ExtensionBisectUi.ctxIsBisectActive
    });
  }
  async run(accessor, seeingBad) {
    const dialogService = accessor.get(IDialogService);
    const hostService = accessor.get(IHostService);
    const bisectService = accessor.get(IExtensionBisectService);
    const productService = accessor.get(IProductService);
    const extensionEnablementService = accessor.get(IGlobalExtensionEnablementService);
    const commandService = accessor.get(ICommandService);
    if (!bisectService.isActive) {
      return;
    }
    if (seeingBad === void 0) {
      const goodBadStopCancel = await this._checkForBad(dialogService, bisectService);
      if (goodBadStopCancel === null) {
        return;
      }
      seeingBad = goodBadStopCancel;
    }
    if (seeingBad === void 0) {
      await bisectService.reset();
      hostService.reload();
      return;
    }
    const done = await bisectService.next(seeingBad);
    if (!done) {
      hostService.reload();
      return;
    }
    if (done.bad) {
      await dialogService.info(
        localize("done.msg", "Extension Bisect"),
        localize("done.detail2", "Extension Bisect is done but no extension has been identified. This might be a problem with {0}.", productService.nameShort)
      );
    } else {
      const res = await dialogService.confirm({
        type: Severity.Info,
        message: localize("done.msg", "Extension Bisect"),
        primaryButton: localize({ key: "report", comment: ["&& denotes a mnemonic"] }, "&&Report Issue & Continue"),
        cancelButton: localize("continue", "Continue"),
        detail: localize("done.detail", "Extension Bisect is done and has identified {0} as the extension causing the problem.", done.id),
        checkbox: { label: localize("done.disbale", "Keep this extension disabled"), checked: true }
      });
      if (res.checkboxChecked) {
        await extensionEnablementService.disableExtension({ id: done.id }, void 0);
      }
      if (res.confirmed) {
        await commandService.executeCommand("workbench.action.openIssueReporter", done.id);
      }
    }
    await bisectService.reset();
    hostService.reload();
  }
  async _checkForBad(dialogService, bisectService) {
    const { result } = await dialogService.prompt({
      type: Severity.Info,
      message: localize("msg.next", "Extension Bisect"),
      detail: localize("bisect", "Extension Bisect is active and has disabled {0} extensions. Check if you can still reproduce the problem and proceed by selecting from these options.", bisectService.disabledCount),
      buttons: [
        {
          label: localize({ key: "next.good", comment: ["&& denotes a mnemonic"] }, "I ca&&n't reproduce"),
          run: () => false
          // good now
        },
        {
          label: localize({ key: "next.bad", comment: ["&& denotes a mnemonic"] }, "I can &&reproduce"),
          run: () => true
          // bad
        },
        {
          label: localize({ key: "next.stop", comment: ["&& denotes a mnemonic"] }, "&&Stop Bisect"),
          run: () => void 0
          // stop
        }
      ],
      cancelButton: {
        label: localize({ key: "next.cancel", comment: ["&& denotes a mnemonic"] }, "&&Cancel Bisect"),
        run: () => null
        // cancel
      }
    });
    return result;
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "extension.bisect.stop",
      title: localize2("title.stop", "Stop Extension Bisect"),
      category: Categories.Help,
      f1: true,
      precondition: ExtensionBisectUi.ctxIsBisectActive
    });
  }
  async run(accessor) {
    const extensionsBisect = accessor.get(IExtensionBisectService);
    const hostService = accessor.get(IHostService);
    await extensionsBisect.reset();
    hostService.reload();
  }
});
export {
  IExtensionBisectService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25NYW5hZ2VtZW50XFxicm93c2VyXFxleHRlbnNpb25CaXNlY3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBJTG9jYWxFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlLCBJRXh0ZW5zaW9uLCBpc1Jlc29sdmVyRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBJUHJvbXB0Q2hvaWNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcblxuLy8gLS0tIGJpc2VjdCBzZXJ2aWNlXG5cbmV4cG9ydCBjb25zdCBJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRXh0ZW5zaW9uQmlzZWN0U2VydmljZT4oJ0lFeHRlbnNpb25CaXNlY3RTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbkJpc2VjdFNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRpc0Rpc2FibGVkQnlCaXNlY3QoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbjtcblx0aXNBY3RpdmU6IGJvb2xlYW47XG5cdGRpc2FibGVkQ291bnQ6IG51bWJlcjtcblx0c3RhcnQoZXh0ZW5zaW9uczogSUxvY2FsRXh0ZW5zaW9uW10pOiBQcm9taXNlPHZvaWQ+O1xuXHRuZXh0KHNlZWluZ0JhZDogYm9vbGVhbik6IFByb21pc2U8eyBpZDogc3RyaW5nOyBiYWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZD47XG5cdHJlc2V0KCk6IFByb21pc2U8dm9pZD47XG59XG5cbmNsYXNzIEJpc2VjdFN0YXRlIHtcblxuXHRzdGF0aWMgZnJvbUpTT04ocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBCaXNlY3RTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRpbnRlcmZhY2UgUmF3IGV4dGVuZHMgQmlzZWN0U3RhdGUgeyB9XG5cdFx0XHRjb25zdCBkYXRhOiBSYXcgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRyZXR1cm4gbmV3IEJpc2VjdFN0YXRlKGRhdGEuZXh0ZW5zaW9ucywgZGF0YS5sb3csIGRhdGEuaGlnaCwgZGF0YS5taWQpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBleHRlbnNpb25zOiBzdHJpbmdbXSxcblx0XHRyZWFkb25seSBsb3c6IG51bWJlcixcblx0XHRyZWFkb25seSBoaWdoOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgbWlkOiBudW1iZXIgPSAoKGxvdyArIGhpZ2gpIC8gMikgfCAwXG5cdCkgeyB9XG59XG5cbmNsYXNzIEV4dGVuc2lvbkJpc2VjdFNlcnZpY2UgaW1wbGVtZW50cyBJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3N0b3JhZ2VLZXkgPSAnZXh0ZW5zaW9uQmlzZWN0U3RhdGUnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlOiBCaXNlY3RTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzYWJsZWQgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VudlNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgcmF3ID0gX3N0b3JhZ2VTZXJ2aWNlLmdldChFeHRlbnNpb25CaXNlY3RTZXJ2aWNlLl9zdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdHRoaXMuX3N0YXRlID0gQmlzZWN0U3RhdGUuZnJvbUpTT04ocmF3KTtcblxuXHRcdGlmICh0aGlzLl9zdGF0ZSkge1xuXHRcdFx0Y29uc3QgeyBtaWQsIGhpZ2ggfSA9IHRoaXMuX3N0YXRlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zdGF0ZS5leHRlbnNpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGlzRGlzYWJsZWQgPSBpID49IG1pZCAmJiBpIDwgaGlnaDtcblx0XHRcdFx0dGhpcy5fZGlzYWJsZWQuc2V0KHRoaXMuX3N0YXRlLmV4dGVuc2lvbnNbaV0sIGlzRGlzYWJsZWQpO1xuXHRcdFx0fVxuXHRcdFx0bG9nU2VydmljZS53YXJuKCdleHRlbnNpb24gQklTRUNUIGFjdGl2ZScsIFsuLi50aGlzLl9kaXNhYmxlZF0pO1xuXHRcdH1cblx0fVxuXG5cdGdldCBpc0FjdGl2ZSgpIHtcblx0XHRyZXR1cm4gISF0aGlzLl9zdGF0ZTtcblx0fVxuXG5cdGdldCBkaXNhYmxlZENvdW50KCkge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZSA/IHRoaXMuX3N0YXRlLmhpZ2ggLSB0aGlzLl9zdGF0ZS5taWQgOiAtMTtcblx0fVxuXG5cdGlzRGlzYWJsZWRCeUJpc2VjdChleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3N0YXRlKSB7XG5cdFx0XHQvLyBiaXNlY3QgaXNuJ3QgYWN0aXZlXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChpc1Jlc29sdmVyRXh0ZW5zaW9uKGV4dGVuc2lvbi5tYW5pZmVzdCwgdGhpcy5fZW52U2VydmljZS5yZW1vdGVBdXRob3JpdHkpKSB7XG5cdFx0XHQvLyB0aGUgY3VycmVudCByZW1vdGUgcmVzb2x2ZXIgZXh0ZW5zaW9uIGNhbm5vdCBiZSBkaXNhYmxlZFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNFbmFibGVkSW5FbnYoZXh0ZW5zaW9uKSkge1xuXHRcdFx0Ly8gRXh0ZW5zaW9uIGVuYWJsZWQgaW4gZW52IGNhbm5vdCBiZSBkaXNhYmxlZFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBkaXNhYmxlZCA9IHRoaXMuX2Rpc2FibGVkLmdldChleHRlbnNpb24uaWRlbnRpZmllci5pZCk7XG5cdFx0cmV0dXJuIGRpc2FibGVkID8/IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNFbmFibGVkSW5FbnYoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkodGhpcy5fZW52U2VydmljZS5lbmFibGVFeHRlbnNpb25zKSAmJiB0aGlzLl9lbnZTZXJ2aWNlLmVuYWJsZUV4dGVuc2lvbnMuc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdH1cblxuXHRhc3luYyBzdGFydChleHRlbnNpb25zOiBJTG9jYWxFeHRlbnNpb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHN0YXRlJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4dGVuc2lvbklkcyA9IGV4dGVuc2lvbnMubWFwKGV4dCA9PiBleHQuaWRlbnRpZmllci5pZCk7XG5cdFx0Y29uc3QgbmV3U3RhdGUgPSBuZXcgQmlzZWN0U3RhdGUoZXh0ZW5zaW9uSWRzLCAwLCBleHRlbnNpb25JZHMubGVuZ3RoLCAwKTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShFeHRlbnNpb25CaXNlY3RTZXJ2aWNlLl9zdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShuZXdTdGF0ZSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRhd2FpdCB0aGlzLl9zdG9yYWdlU2VydmljZS5mbHVzaCgpO1xuXHR9XG5cblx0YXN5bmMgbmV4dChzZWVpbmdCYWQ6IGJvb2xlYW4pOiBQcm9taXNlPHsgaWQ6IHN0cmluZzsgYmFkOiBib29sZWFuIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3N0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgc3RhdGUnKTtcblx0XHR9XG5cdFx0Ly8gY2hlY2sgaWYgYmFkIHdoZW4gYWxsIGV4dGVuc2lvbnMgYXJlIGRpc2FibGVkXG5cdFx0aWYgKHNlZWluZ0JhZCAmJiB0aGlzLl9zdGF0ZS5taWQgPT09IDAgJiYgdGhpcy5fc3RhdGUuaGlnaCA9PT0gdGhpcy5fc3RhdGUuZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGJhZDogdHJ1ZSwgaWQ6ICcnIH07XG5cdFx0fVxuXHRcdC8vIGNoZWNrIGlmIHRoZXJlIGlzIG9ubHkgb25lIGxlZnRcblx0XHRpZiAodGhpcy5fc3RhdGUubG93ID09PSB0aGlzLl9zdGF0ZS5oaWdoIC0gMSkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXNldCgpO1xuXHRcdFx0cmV0dXJuIHsgaWQ6IHRoaXMuX3N0YXRlLmV4dGVuc2lvbnNbdGhpcy5fc3RhdGUubG93XSwgYmFkOiBzZWVpbmdCYWQgfTtcblx0XHR9XG5cdFx0Ly8gdGhlIHNlY29uZCBoYWxmIGlzIGRpc2FibGVkIHNvIGlmIHRoZXJlIGlzIHN0aWxsIGJhZCBpdCBtdXN0IGJlXG5cdFx0Ly8gaW4gdGhlIGZpcnN0IGhhbGZcblx0XHRjb25zdCBuZXh0U3RhdGUgPSBuZXcgQmlzZWN0U3RhdGUoXG5cdFx0XHR0aGlzLl9zdGF0ZS5leHRlbnNpb25zLFxuXHRcdFx0c2VlaW5nQmFkID8gdGhpcy5fc3RhdGUubG93IDogdGhpcy5fc3RhdGUubWlkLFxuXHRcdFx0c2VlaW5nQmFkID8gdGhpcy5fc3RhdGUubWlkIDogdGhpcy5fc3RhdGUuaGlnaCxcblx0XHQpO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKEV4dGVuc2lvbkJpc2VjdFNlcnZpY2UuX3N0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KG5leHRTdGF0ZSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRhd2FpdCB0aGlzLl9zdG9yYWdlU2VydmljZS5mbHVzaCgpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyByZXNldCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoRXh0ZW5zaW9uQmlzZWN0U2VydmljZS5fc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRhd2FpdCB0aGlzLl9zdG9yYWdlU2VydmljZS5mbHVzaCgpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlLCBFeHRlbnNpb25CaXNlY3RTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuLy8gLS0tIGJpc2VjdCBVSVxuXG5jbGFzcyBFeHRlbnNpb25CaXNlY3RVaSB7XG5cblx0c3RhdGljIGN0eElzQmlzZWN0QWN0aXZlID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2lzRXh0ZW5zaW9uQmlzZWN0QWN0aXZlJywgZmFsc2UpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkJpc2VjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uQmlzZWN0U2VydmljZTogSUV4dGVuc2lvbkJpc2VjdFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0aWYgKF9leHRlbnNpb25CaXNlY3RTZXJ2aWNlLmlzQWN0aXZlKSB7XG5cdFx0XHRFeHRlbnNpb25CaXNlY3RVaS5jdHhJc0Jpc2VjdEFjdGl2ZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblx0XHRcdHRoaXMuX3Nob3dCaXNlY3RQcm9tcHQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93QmlzZWN0UHJvbXB0KCk6IHZvaWQge1xuXG5cdFx0Y29uc3QgZ29vZFByb21wdDogSVByb21wdENob2ljZSA9IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnSSBjYW5ub3QgcmVwcm9kdWNlJywgXCJJIGNhbid0IHJlcHJvZHVjZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2V4dGVuc2lvbi5iaXNlY3QubmV4dCcsIGZhbHNlKVxuXHRcdH07XG5cdFx0Y29uc3QgYmFkUHJvbXB0OiBJUHJvbXB0Q2hvaWNlID0ge1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdUaGlzIGlzIEJhZCcsIFwiSSBjYW4gcmVwcm9kdWNlXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZXh0ZW5zaW9uLmJpc2VjdC5uZXh0JywgdHJ1ZSlcblx0XHR9O1xuXHRcdGNvbnN0IHN0b3A6IElQcm9tcHRDaG9pY2UgPSB7XG5cdFx0XHRsYWJlbDogJ1N0b3AgQmlzZWN0Jyxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2V4dGVuc2lvbi5iaXNlY3Quc3RvcCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSB0aGlzLl9leHRlbnNpb25CaXNlY3RTZXJ2aWNlLmRpc2FibGVkQ291bnQgPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2Jpc2VjdC5zaW5ndWxhcicsIFwiRXh0ZW5zaW9uIEJpc2VjdCBpcyBhY3RpdmUgYW5kIGhhcyBkaXNhYmxlZCAxIGV4dGVuc2lvbi4gQ2hlY2sgaWYgeW91IGNhbiBzdGlsbCByZXByb2R1Y2UgdGhlIHByb2JsZW0gYW5kIHByb2NlZWQgYnkgc2VsZWN0aW5nIGZyb20gdGhlc2Ugb3B0aW9ucy5cIilcblx0XHRcdDogbG9jYWxpemUoJ2Jpc2VjdC5wbHVyYWwnLCBcIkV4dGVuc2lvbiBCaXNlY3QgaXMgYWN0aXZlIGFuZCBoYXMgZGlzYWJsZWQgezB9IGV4dGVuc2lvbnMuIENoZWNrIGlmIHlvdSBjYW4gc3RpbGwgcmVwcm9kdWNlIHRoZSBwcm9ibGVtIGFuZCBwcm9jZWVkIGJ5IHNlbGVjdGluZyBmcm9tIHRoZXNlIG9wdGlvbnMuXCIsIHRoaXMuX2V4dGVuc2lvbkJpc2VjdFNlcnZpY2UuZGlzYWJsZWRDb3VudCk7XG5cblx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0W2dvb2RQcm9tcHQsIGJhZFByb21wdCwgc3RvcF0sXG5cdFx0XHR7IHN0aWNreTogdHJ1ZSwgcHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVCB9XG5cdFx0KTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oXG5cdEV4dGVuc2lvbkJpc2VjdFVpLFxuXHRMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZFxuKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZXh0ZW5zaW9uLmJpc2VjdC5zdGFydCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0aXRsZS5zdGFydCcsICdTdGFydCBFeHRlbnNpb24gQmlzZWN0JyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5IZWxwLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEV4dGVuc2lvbkJpc2VjdFVpLmN0eElzQmlzZWN0QWN0aXZlLm5lZ2F0ZSgpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgJ3dvcmtiZW5jaC52aWV3LmV4dGVuc2lvbnMnKSxcblx0XHRcdFx0Z3JvdXA6ICcyX2VuYWJsZW1lbnQnLFxuXHRcdFx0XHRvcmRlcjogNFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25NYW5hZ2VtZW50ID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25zQmlzZWN0ID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSAoYXdhaXQgZXh0ZW5zaW9uTWFuYWdlbWVudC5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyKSkuZmlsdGVyKGV4dCA9PiBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZXh0KSk7XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ21zZy5zdGFydCcsIFwiRXh0ZW5zaW9uIEJpc2VjdFwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2RldGFpbC5zdGFydCcsIFwiRXh0ZW5zaW9uIEJpc2VjdCB3aWxsIHVzZSBiaW5hcnkgc2VhcmNoIHRvIGZpbmQgYW4gZXh0ZW5zaW9uIHRoYXQgY2F1c2VzIGEgcHJvYmxlbS4gRHVyaW5nIHRoZSBwcm9jZXNzIHRoZSB3aW5kb3cgcmVsb2FkcyByZXBlYXRlZGx5ICh+ezB9IHRpbWVzKS4gRWFjaCB0aW1lIHlvdSBtdXN0IGNvbmZpcm0gaWYgeW91IGFyZSBzdGlsbCBzZWVpbmcgcHJvYmxlbXMuXCIsIDIgKyBNYXRoLmxvZzIoZXh0ZW5zaW9ucy5sZW5ndGgpIHwgMCksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ21zZzInLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTdGFydCBFeHRlbnNpb24gQmlzZWN0XCIpXG5cdFx0fSk7XG5cblx0XHRpZiAocmVzLmNvbmZpcm1lZCkge1xuXHRcdFx0YXdhaXQgZXh0ZW5zaW9uc0Jpc2VjdC5zdGFydChleHRlbnNpb25zKTtcblx0XHRcdGhvc3RTZXJ2aWNlLnJlbG9hZCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2V4dGVuc2lvbi5iaXNlY3QubmV4dCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0aXRsZS5pc0JhZCcsICdDb250aW51ZSBFeHRlbnNpb24gQmlzZWN0JyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5IZWxwLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEV4dGVuc2lvbkJpc2VjdFVpLmN0eElzQmlzZWN0QWN0aXZlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlZWluZ0JhZDogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgYmlzZWN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2R1Y3RTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRpZiAoIWJpc2VjdFNlcnZpY2UuaXNBY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHNlZWluZ0JhZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBnb29kQmFkU3RvcENhbmNlbCA9IGF3YWl0IHRoaXMuX2NoZWNrRm9yQmFkKGRpYWxvZ1NlcnZpY2UsIGJpc2VjdFNlcnZpY2UpO1xuXHRcdFx0aWYgKGdvb2RCYWRTdG9wQ2FuY2VsID09PSBudWxsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHNlZWluZ0JhZCA9IGdvb2RCYWRTdG9wQ2FuY2VsO1xuXHRcdH1cblx0XHRpZiAoc2VlaW5nQmFkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGF3YWl0IGJpc2VjdFNlcnZpY2UucmVzZXQoKTtcblx0XHRcdGhvc3RTZXJ2aWNlLnJlbG9hZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkb25lID0gYXdhaXQgYmlzZWN0U2VydmljZS5uZXh0KHNlZWluZ0JhZCk7XG5cdFx0aWYgKCFkb25lKSB7XG5cdFx0XHRob3N0U2VydmljZS5yZWxvYWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZG9uZS5iYWQpIHtcblx0XHRcdC8vIERPTkUgYnV0IG5vdGhpbmcgZm91bmRcblx0XHRcdGF3YWl0IGRpYWxvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdFx0bG9jYWxpemUoJ2RvbmUubXNnJywgXCJFeHRlbnNpb24gQmlzZWN0XCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZG9uZS5kZXRhaWwyJywgXCJFeHRlbnNpb24gQmlzZWN0IGlzIGRvbmUgYnV0IG5vIGV4dGVuc2lvbiBoYXMgYmVlbiBpZGVudGlmaWVkLiBUaGlzIG1pZ2h0IGJlIGEgcHJvYmxlbSB3aXRoIHswfS5cIiwgcHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KVxuXHRcdFx0KTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBET05FIGFuZCBpZGVudGlmaWVkIGV4dGVuc2lvblxuXHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2RvbmUubXNnJywgXCJFeHRlbnNpb24gQmlzZWN0XCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3JlcG9ydCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlcG9ydCBJc3N1ZSAmIENvbnRpbnVlXCIpLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdjb250aW51ZScsIFwiQ29udGludWVcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2RvbmUuZGV0YWlsJywgXCJFeHRlbnNpb24gQmlzZWN0IGlzIGRvbmUgYW5kIGhhcyBpZGVudGlmaWVkIHswfSBhcyB0aGUgZXh0ZW5zaW9uIGNhdXNpbmcgdGhlIHByb2JsZW0uXCIsIGRvbmUuaWQpLFxuXHRcdFx0XHRjaGVja2JveDogeyBsYWJlbDogbG9jYWxpemUoJ2RvbmUuZGlzYmFsZScsIFwiS2VlcCB0aGlzIGV4dGVuc2lvbiBkaXNhYmxlZFwiKSwgY2hlY2tlZDogdHJ1ZSB9XG5cdFx0XHR9KTtcblx0XHRcdGlmIChyZXMuY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdGF3YWl0IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmRpc2FibGVFeHRlbnNpb24oeyBpZDogZG9uZS5pZCB9LCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlcy5jb25maXJtZWQpIHtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbklzc3VlUmVwb3J0ZXInLCBkb25lLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgYmlzZWN0U2VydmljZS5yZXNldCgpO1xuXHRcdGhvc3RTZXJ2aWNlLnJlbG9hZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hlY2tGb3JCYWQoZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsIGJpc2VjdFNlcnZpY2U6IElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlKTogUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLnByb21wdDxib29sZWFuIHwgdW5kZWZpbmVkIHwgbnVsbD4oe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtc2cubmV4dCcsIFwiRXh0ZW5zaW9uIEJpc2VjdFwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2Jpc2VjdCcsIFwiRXh0ZW5zaW9uIEJpc2VjdCBpcyBhY3RpdmUgYW5kIGhhcyBkaXNhYmxlZCB7MH0gZXh0ZW5zaW9ucy4gQ2hlY2sgaWYgeW91IGNhbiBzdGlsbCByZXByb2R1Y2UgdGhlIHByb2JsZW0gYW5kIHByb2NlZWQgYnkgc2VsZWN0aW5nIGZyb20gdGhlc2Ugb3B0aW9ucy5cIiwgYmlzZWN0U2VydmljZS5kaXNhYmxlZENvdW50KSxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ25leHQuZ29vZCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJJIGNhJiZuJ3QgcmVwcm9kdWNlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gZmFsc2UgLy8gZ29vZCBub3dcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ25leHQuYmFkJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkkgY2FuICYmcmVwcm9kdWNlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZSAvLyBiYWRcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ25leHQuc3RvcCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlN0b3AgQmlzZWN0XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdW5kZWZpbmVkIC8vIHN0b3Bcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICduZXh0LmNhbmNlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNhbmNlbCBCaXNlY3RcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4gbnVsbCAvLyBjYW5jZWxcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZXh0ZW5zaW9uLmJpc2VjdC5zdG9wJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RpdGxlLnN0b3AnLCAnU3RvcCBFeHRlbnNpb24gQmlzZWN0JyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5IZWxwLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEV4dGVuc2lvbkJpc2VjdFVpLmN0eElzQmlzZWN0QWN0aXZlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25zQmlzZWN0ID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlKTtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdGF3YWl0IGV4dGVuc2lvbnNCaXNlY3QucmVzZXQoKTtcblx0XHRob3N0U2VydmljZS5yZWxvYWQoKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw2QkFBNkIseUNBQTBEO0FBQ2hHLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsZUFBMkIsMkJBQTJCO0FBQy9ELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHNCQUFxQyxzQkFBc0IsZ0JBQWdCO0FBQ3BGLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXlDO0FBQ2xELFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLGdCQUFnQixvQkFBb0IscUJBQXFCO0FBQ2xFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQW1EO0FBQzVELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNENBQTRDO0FBSTlDLE1BQU0sMEJBQTBCLGdCQUF5Qyx5QkFBeUI7QUFjekcsTUFBTSxZQUFZO0FBQUEs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
