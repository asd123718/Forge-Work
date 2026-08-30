import { joinPath } from "../../../../../base/common/resources.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { INativeHostService } from "../../../../../platform/native/common/native.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { ChatEntitlementContextKeys } from "../../../../services/chat/common/chatEntitlementService.js";
import { CHAT_CATEGORY } from "../../browser/actions/chatActions.js";
import { IChatWidgetService } from "../../browser/chat.js";
import { captureRepoInfo } from "../../browser/chatRepoInfo.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ISCMService } from "../../../scm/common/scm.js";
function registerChatExportZipAction() {
  registerAction2(class ExportChatAsZipAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.exportAsZip",
        category: CHAT_CATEGORY,
        title: localize2("chat.exportAsZip.label", "Export Chat as Zip..."),
        precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatEntitlementContextKeys.Entitlement.internal),
        f1: true
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      const fileDialogService = accessor.get(IFileDialogService);
      const chatService = accessor.get(IChatService);
      const nativeHostService = accessor.get(INativeHostService);
      const notificationService = accessor.get(INotificationService);
      const scmService = accessor.get(ISCMService);
      const fileService = accessor.get(IFileService);
      const widget = widgetService.lastFocusedWidget;
      if (!widget || !widget.viewModel) {
        return;
      }
      const defaultUri = joinPath(await fileDialogService.defaultFilePath(), "chat.zip");
      const result = await fileDialogService.showSaveDialog({
        defaultUri,
        filters: [{ name: "Zip Archive", extensions: ["zip"] }]
      });
      if (!result) {
        return;
      }
      const model = chatService.getSession(widget.viewModel.sessionResource);
      if (!model) {
        return;
      }
      const files = [
        {
          path: "chat.json",
          contents: JSON.stringify(model.toExport(), void 0, 2)
        }
      ];
      const hasMessages = model.getRequests().length > 0;
      if (hasMessages) {
        if (model.repoData) {
          files.push({
            path: "chat.repo.begin.json",
            contents: JSON.stringify(model.repoData, void 0, 2)
          });
        }
        const currentRepoData = await captureRepoInfo(scmService, fileService);
        if (currentRepoData) {
          files.push({
            path: "chat.repo.end.json",
            contents: JSON.stringify(currentRepoData, void 0, 2)
          });
        }
        if (!model.repoData && !currentRepoData) {
          notificationService.notify({
            severity: Severity.Warning,
            message: localize("chatExportZip.noRepoData", "Exported chat without repository context. No Git repository was detected.")
          });
        }
      } else {
        const currentRepoData = await captureRepoInfo(scmService, fileService);
        if (currentRepoData) {
          files.push({
            path: "chat.repo.begin.json",
            contents: JSON.stringify(currentRepoData, void 0, 2)
          });
        } else {
          notificationService.notify({
            severity: Severity.Warning,
            message: localize("chatExportZip.noRepoData", "Exported chat without repository context. No Git repository was detected.")
          });
        }
      }
      try {
        await nativeHostService.createZipFile(result, files);
      } catch (error) {
        notificationService.notify({
          severity: Severity.Error,
          message: localize("chatExportZip.error", "Failed to export chat as zip: {0}", error instanceof Error ? error.message : String(error))
        });
      }
    }
  });
}
export {
  registerChatExportZipAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGVsZWN0cm9uLWJyb3dzZXJcXGFjdGlvbnNcXGNoYXRFeHBvcnRaaXAudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSEFUX0NBVEVHT1JZIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBjYXB0dXJlUmVwb0luZm8gfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXRSZXBvSW5mby5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2NvbW1vbi9zY20uanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDaGF0RXhwb3J0WmlwQWN0aW9uKCkge1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhwb3J0Q2hhdEFzWmlwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmV4cG9ydEFzWmlwJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuZXhwb3J0QXNaaXAubGFiZWwnLCBcIkV4cG9ydCBDaGF0IGFzIFppcC4uLlwiKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLkVudGl0bGVtZW50LmludGVybmFsKSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZpbGVEaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlRGlhbG9nU2VydmljZSk7XG5cdFx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbmF0aXZlSG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgc2NtU2VydmljZSA9IGFjY2Vzc29yLmdldChJU0NNU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdFx0aWYgKCF3aWRnZXQgfHwgIXdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWZhdWx0VXJpID0gam9pblBhdGgoYXdhaXQgZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKCksICdjaGF0LnppcCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd1NhdmVEaWFsb2coe1xuXHRcdFx0XHRkZWZhdWx0VXJpLFxuXHRcdFx0XHRmaWx0ZXJzOiBbeyBuYW1lOiAnWmlwIEFyY2hpdmUnLCBleHRlbnNpb25zOiBbJ3ppcCddIH1dXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGNoYXRTZXJ2aWNlLmdldFNlc3Npb24od2lkZ2V0LnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpbGVzOiB7IHBhdGg6IHN0cmluZzsgY29udGVudHM6IHN0cmluZyB9W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnY2hhdC5qc29uJyxcblx0XHRcdFx0XHRjb250ZW50czogSlNPTi5zdHJpbmdpZnkobW9kZWwudG9FeHBvcnQoKSwgdW5kZWZpbmVkLCAyKVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBoYXNNZXNzYWdlcyA9IG1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoID4gMDtcblxuXHRcdFx0aWYgKGhhc01lc3NhZ2VzKSB7XG5cdFx0XHRcdGlmIChtb2RlbC5yZXBvRGF0YSkge1xuXHRcdFx0XHRcdGZpbGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0cGF0aDogJ2NoYXQucmVwby5iZWdpbi5qc29uJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBKU09OLnN0cmluZ2lmeShtb2RlbC5yZXBvRGF0YSwgdW5kZWZpbmVkLCAyKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY3VycmVudFJlcG9EYXRhID0gYXdhaXQgY2FwdHVyZVJlcG9JbmZvKHNjbVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRSZXBvRGF0YSkge1xuXHRcdFx0XHRcdGZpbGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0cGF0aDogJ2NoYXQucmVwby5lbmQuanNvbicsXG5cdFx0XHRcdFx0XHRjb250ZW50czogSlNPTi5zdHJpbmdpZnkoY3VycmVudFJlcG9EYXRhLCB1bmRlZmluZWQsIDIpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIW1vZGVsLnJlcG9EYXRhICYmICFjdXJyZW50UmVwb0RhdGEpIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjaGF0RXhwb3J0WmlwLm5vUmVwb0RhdGEnLCBcIkV4cG9ydGVkIGNoYXQgd2l0aG91dCByZXBvc2l0b3J5IGNvbnRleHQuIE5vIEdpdCByZXBvc2l0b3J5IHdhcyBkZXRlY3RlZC5cIilcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudFJlcG9EYXRhID0gYXdhaXQgY2FwdHVyZVJlcG9JbmZvKHNjbVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRSZXBvRGF0YSkge1xuXHRcdFx0XHRcdGZpbGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0cGF0aDogJ2NoYXQucmVwby5iZWdpbi5qc29uJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBKU09OLnN0cmluZ2lmeShjdXJyZW50UmVwb0RhdGEsIHVuZGVmaW5lZCwgMilcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjaGF0RXhwb3J0WmlwLm5vUmVwb0RhdGEnLCBcIkV4cG9ydGVkIGNoYXQgd2l0aG91dCByZXBvc2l0b3J5IGNvbnRleHQuIE5vIEdpdCByZXBvc2l0b3J5IHdhcyBkZXRlY3RlZC5cIilcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBuYXRpdmVIb3N0U2VydmljZS5jcmVhdGVaaXBGaWxlKHJlc3VsdCwgZmlsZXMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY2hhdEV4cG9ydFppcC5lcnJvcicsIFwiRmFpbGVkIHRvIGV4cG9ydCBjaGF0IGFzIHppcDogezB9XCIsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSlcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEw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
