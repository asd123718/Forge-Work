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
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { UserDataSyncWorkbenchContribution } from "./userDataSync.js";
import { IUserDataAutoSyncService, UserDataSyncErrorCode } from "../../../../platform/userDataSync/common/userDataSync.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { isWeb } from "../../../../base/common/platform.js";
import { UserDataSyncTrigger } from "./userDataSyncTrigger.js";
import { toAction } from "../../../../base/common/actions.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { SHOW_SYNC_LOG_COMMAND_ID } from "../../../services/userDataSync/common/userDataSync.js";
let UserDataSyncReportIssueContribution = class extends Disposable {
  constructor(userDataAutoSyncService, notificationService, productService, commandService, hostService) {
    super();
    this.notificationService = notificationService;
    this.productService = productService;
    this.commandService = commandService;
    this.hostService = hostService;
    this._register(userDataAutoSyncService.onError((error) => this.onAutoSyncError(error)));
  }
  onAutoSyncError(error) {
    switch (error.code) {
      case UserDataSyncErrorCode.LocalTooManyRequests: {
        const message = isWeb ? localize({ key: "local too many requests - reload", comment: ["Settings Sync is the name of the feature"] }, "Settings sync is suspended temporarily because the current device is making too many requests. Please reload {0} to resume.", this.productService.nameLong) : localize({ key: "local too many requests - restart", comment: ["Settings Sync is the name of the feature"] }, "Settings sync is suspended temporarily because the current device is making too many requests. Please restart {0} to resume.", this.productService.nameLong);
        this.notificationService.notify({
          severity: Severity.Error,
          message,
          actions: {
            primary: [
              toAction({
                id: "Show Sync Logs",
                label: localize("show sync logs", "Show Log"),
                run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
              }),
              toAction({
                id: "Restart",
                label: isWeb ? localize("reload", "Reload") : localize("restart", "Restart"),
                run: () => this.hostService.restart()
              })
            ]
          }
        });
        return;
      }
      case UserDataSyncErrorCode.TooManyRequests: {
        const operationId = error.operationId ? localize("operationId", "Operation Id: {0}", error.operationId) : void 0;
        const message = localize({ key: "server too many requests", comment: ["Settings Sync is the name of the feature"] }, "Settings sync is disabled because the current device is making too many requests. Please wait for 10 minutes and turn on sync.");
        this.notificationService.notify({
          severity: Severity.Error,
          message: operationId ? `${message} ${operationId}` : message,
          source: error.operationId ? localize("settings sync", "Settings Sync. Operation Id: {0}", error.operationId) : void 0,
          actions: {
            primary: [
              toAction({
                id: "Show Sync Logs",
                label: localize("show sync logs", "Show Log"),
                run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
              })
            ]
          }
        });
        return;
      }
    }
  }
};
UserDataSyncReportIssueContribution = __decorateClass([
  __decorateParam(0, IUserDataAutoSyncService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IHostService)
], UserDataSyncReportIssueContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncWorkbenchContribution, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncTrigger, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncReportIssueContribution, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVzZXJEYXRhU3luY1xcYnJvd3NlclxcdXNlckRhdGFTeW5jLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLCBVc2VyRGF0YVN5bmNFcnJvciwgVXNlckRhdGFTeW5jRXJyb3JDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY1RyaWdnZXIgfSBmcm9tICcuL3VzZXJEYXRhU3luY1RyaWdnZXIuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBTSE9XX1NZTkNfTE9HX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5cbmNsYXNzIFVzZXJEYXRhU3luY1JlcG9ydElzc3VlQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UgdXNlckRhdGFBdXRvU3luY1NlcnZpY2U6IElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YUF1dG9TeW5jU2VydmljZS5vbkVycm9yKGVycm9yID0+IHRoaXMub25BdXRvU3luY0Vycm9yKGVycm9yKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkF1dG9TeW5jRXJyb3IoZXJyb3I6IFVzZXJEYXRhU3luY0Vycm9yKTogdm9pZCB7XG5cdFx0c3dpdGNoIChlcnJvci5jb2RlKSB7XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbFRvb01hbnlSZXF1ZXN0czoge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gaXNXZWIgPyBsb2NhbGl6ZSh7IGtleTogJ2xvY2FsIHRvbyBtYW55IHJlcXVlc3RzIC0gcmVsb2FkJywgY29tbWVudDogWydTZXR0aW5ncyBTeW5jIGlzIHRoZSBuYW1lIG9mIHRoZSBmZWF0dXJlJ10gfSwgXCJTZXR0aW5ncyBzeW5jIGlzIHN1c3BlbmRlZCB0ZW1wb3JhcmlseSBiZWNhdXNlIHRoZSBjdXJyZW50IGRldmljZSBpcyBtYWtpbmcgdG9vIG1hbnkgcmVxdWVzdHMuIFBsZWFzZSByZWxvYWQgezB9IHRvIHJlc3VtZS5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZylcblx0XHRcdFx0XHQ6IGxvY2FsaXplKHsga2V5OiAnbG9jYWwgdG9vIG1hbnkgcmVxdWVzdHMgLSByZXN0YXJ0JywgY29tbWVudDogWydTZXR0aW5ncyBTeW5jIGlzIHRoZSBuYW1lIG9mIHRoZSBmZWF0dXJlJ10gfSwgXCJTZXR0aW5ncyBzeW5jIGlzIHN1c3BlbmRlZCB0ZW1wb3JhcmlseSBiZWNhdXNlIHRoZSBjdXJyZW50IGRldmljZSBpcyBtYWtpbmcgdG9vIG1hbnkgcmVxdWVzdHMuIFBsZWFzZSByZXN0YXJ0IHswfSB0byByZXN1bWUuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBbXG5cdFx0XHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRpZDogJ1Nob3cgU3luYyBMb2dzJyxcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Nob3cgc3luYyBsb2dzJywgXCJTaG93IExvZ1wiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoU0hPV19TWU5DX0xPR19DT01NQU5EX0lEKVxuXHRcdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiAnUmVzdGFydCcsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGlzV2ViID8gbG9jYWxpemUoJ3JlbG9hZCcsIFwiUmVsb2FkXCIpIDogbG9jYWxpemUoJ3Jlc3RhcnQnLCBcIlJlc3RhcnRcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmhvc3RTZXJ2aWNlLnJlc3RhcnQoKVxuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlRvb01hbnlSZXF1ZXN0czoge1xuXHRcdFx0XHRjb25zdCBvcGVyYXRpb25JZCA9IGVycm9yLm9wZXJhdGlvbklkID8gbG9jYWxpemUoJ29wZXJhdGlvbklkJywgXCJPcGVyYXRpb24gSWQ6IHswfVwiLCBlcnJvci5vcGVyYXRpb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSh7IGtleTogJ3NlcnZlciB0b28gbWFueSByZXF1ZXN0cycsIGNvbW1lbnQ6IFsnU2V0dGluZ3MgU3luYyBpcyB0aGUgbmFtZSBvZiB0aGUgZmVhdHVyZSddIH0sIFwiU2V0dGluZ3Mgc3luYyBpcyBkaXNhYmxlZCBiZWNhdXNlIHRoZSBjdXJyZW50IGRldmljZSBpcyBtYWtpbmcgdG9vIG1hbnkgcmVxdWVzdHMuIFBsZWFzZSB3YWl0IGZvciAxMCBtaW51dGVzIGFuZCB0dXJuIG9uIHN5bmMuXCIpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bWVzc2FnZTogb3BlcmF0aW9uSWQgPyBgJHttZXNzYWdlfSAke29wZXJhdGlvbklkfWAgOiBtZXNzYWdlLFxuXHRcdFx0XHRcdHNvdXJjZTogZXJyb3Iub3BlcmF0aW9uSWQgPyBsb2NhbGl6ZSgnc2V0dGluZ3Mgc3luYycsIFwiU2V0dGluZ3MgU3luYy4gT3BlcmF0aW9uIElkOiB7MH1cIiwgZXJyb3Iub3BlcmF0aW9uSWQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IFtcblx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiAnU2hvdyBTeW5jIExvZ3MnLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2hvdyBzeW5jIGxvZ3MnLCBcIlNob3cgTG9nXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTSE9XX1NZTkNfTE9HX0NPTU1BTkRfSUQpXG5cdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jb25zdCB3b3JrYmVuY2hSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFVzZXJEYXRhU3luY1dvcmtiZW5jaENvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oVXNlckRhdGFTeW5jVHJpZ2dlciwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihVc2VyRGF0YVN5bmNSZXBvcnRJc3N1ZUNvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtB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
