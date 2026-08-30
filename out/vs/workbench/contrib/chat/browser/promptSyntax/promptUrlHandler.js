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
import { streamToBuffer, VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IRequestService } from "../../../../../platform/request/common/request.js";
import { IURLService } from "../../../../../platform/url/common/url.js";
import { askForPromptFileName } from "./pickers/askForPromptName.js";
import { askForPromptSourceFolder } from "./pickers/askForPromptSourceFolder.js";
import { getCleanPromptName } from "../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { localize } from "../../../../../nls.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { Schemas } from "../../../../../base/common/network.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { mainWindow } from "../../../../../base/browser/window.js";
let PromptUrlHandler = class extends Disposable {
  constructor(urlService, notificationService, requestService, instantiationService, fileService, openerService, logService, dialogService, hostService) {
    super();
    this.notificationService = notificationService;
    this.requestService = requestService;
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.openerService = openerService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.hostService = hostService;
    this._register(urlService.registerHandler(this));
  }
  async handleURL(uri) {
    let promptType;
    switch (uri.path) {
      case "chat-prompt/install":
        promptType = PromptsType.prompt;
        break;
      case "chat-instructions/install":
        promptType = PromptsType.instructions;
        break;
      case "chat-mode/install":
      case "chat-agent/install":
        promptType = PromptsType.agent;
        break;
      default:
        return false;
    }
    try {
      const query = decodeURIComponent(uri.query);
      if (!query || !query.startsWith("url=")) {
        return true;
      }
      const urlString = query.substring(4);
      const url = URI.parse(urlString);
      if (url.scheme !== Schemas.https && url.scheme !== Schemas.http) {
        this.logService.error(`[PromptUrlHandler] Invalid URL: ${urlString}`);
        return true;
      }
      await this.hostService.focus(mainWindow);
      if (await this.shouldBlockInstall(promptType, url)) {
        return true;
      }
      const result = await this.requestService.request({ type: "GET", url: urlString, callSite: "promptUrlHandler.resolveUrl" }, CancellationToken.None);
      if (result.res.statusCode !== 200) {
        this.logService.error(`[PromptUrlHandler] Failed to fetch URL: ${urlString}`);
        this.notificationService.error(localize("failed", "Failed to fetch URL: {0}", urlString));
        return true;
      }
      const responseData = (await streamToBuffer(result.stream)).toString();
      const newFolder = await this.instantiationService.invokeFunction(askForPromptSourceFolder, promptType);
      if (!newFolder) {
        return true;
      }
      const newName = await this.instantiationService.invokeFunction(askForPromptFileName, promptType, newFolder.uri, getCleanPromptName(url));
      if (!newName) {
        return true;
      }
      const promptUri = URI.joinPath(newFolder.uri, newName);
      await this.fileService.createFolder(newFolder.uri);
      await this.fileService.createFile(promptUri, VSBuffer.fromString(responseData));
      await this.openerService.open(promptUri);
      return true;
    } catch (error) {
      this.logService.error(`Error handling prompt URL ${uri.toString()}`, error);
      return true;
    }
  }
  async shouldBlockInstall(promptType, url) {
    let uriLabel = url.toString();
    if (uriLabel.length > 50) {
      uriLabel = `${uriLabel.substring(0, 35)}...${uriLabel.substring(uriLabel.length - 15)}`;
    }
    const detail = new MarkdownString("", { supportHtml: true });
    detail.appendMarkdown(localize("confirmOpenDetail2", "This will access {0}.\n\n", `[${uriLabel}](${url.toString()})`));
    detail.appendMarkdown(localize("confirmOpenDetail3", "If you did not initiate this request, it may represent an attempted attack on your system. Unless you took an explicit action to initiate this request, you should press 'No'"));
    let message;
    switch (promptType) {
      case PromptsType.prompt:
        message = localize("confirmInstallPrompt", "An external application wants to create a prompt file with content from a URL. Do you want to continue by selecting a destination folder and name?");
        break;
      case PromptsType.instructions:
        message = localize("confirmInstallInstructions", "An external application wants to create an instructions file with content from a URL. Do you want to continue by selecting a destination folder and name?");
        break;
      default:
        message = localize("confirmInstallAgent", "An external application wants to create a custom agent with content from a URL. Do you want to continue by selecting a destination folder and name?");
        break;
    }
    const { confirmed } = await this.dialogService.confirm({
      type: "warning",
      primaryButton: localize({ key: "yesButton", comment: ["&& denotes a mnemonic"] }, "&&Yes"),
      cancelButton: localize("noButton", "No"),
      message,
      custom: {
        markdownDetails: [{
          markdown: detail
        }]
      }
    });
    return !confirmed;
  }
};
PromptUrlHandler.ID = "workbench.contrib.promptUrlHandler";
PromptUrlHandler = __decorateClass([
  __decorateParam(0, IURLService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IRequestService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IHostService)
], PromptUrlHandler);
export {
  PromptUrlHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHByb21wdFN5bnRheFxccHJvbXB0VXJsSGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHN0cmVhbVRvQnVmZmVyLCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJVVJMSGFuZGxlciwgSVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgYXNrRm9yUHJvbXB0RmlsZU5hbWUgfSBmcm9tICcuL3BpY2tlcnMvYXNrRm9yUHJvbXB0TmFtZS5qcyc7XG5pbXBvcnQgeyBhc2tGb3JQcm9tcHRTb3VyY2VGb2xkZXIgfSBmcm9tICcuL3BpY2tlcnMvYXNrRm9yUHJvbXB0U291cmNlRm9sZGVyLmpzJztcbmltcG9ydCB7IGdldENsZWFuUHJvbXB0TmFtZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuXG4vLyBleGFtcGxlIFVSTDogY29kZS1vc3M6Y2hhdC1wcm9tcHQvaW5zdGFsbD91cmw9aHR0cHM6Ly9naXN0LmdpdGh1YnVzZXJjb250ZW50LmNvbS9hZXNjaGxpLzQzZmU3OGJhYmQ1NjM1ZjA2MmFlZjAxOTVhNDc2YWFkL3Jhdy9kZmQ3MWY2MDA1OGE0ZGQyNWY1ODRiNTVkZTNlMjBmNWZkNTgwZTYzL2ZpbHRlckV2ZW5OdW1iZXJzLnByb21wdC5tZFxuXG5leHBvcnQgY2xhc3MgUHJvbXB0VXJsSGFuZGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJVVJMSGFuZGxlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnByb21wdFVybEhhbmRsZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVVJMU2VydmljZSB1cmxTZXJ2aWNlOiBJVVJMU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHVybFNlcnZpY2UucmVnaXN0ZXJIYW5kbGVyKHRoaXMpKTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZVVSTCh1cmk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGxldCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSB8IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKHVyaS5wYXRoKSB7XG5cdFx0XHRjYXNlICdjaGF0LXByb21wdC9pbnN0YWxsJzpcblx0XHRcdFx0cHJvbXB0VHlwZSA9IFByb21wdHNUeXBlLnByb21wdDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdjaGF0LWluc3RydWN0aW9ucy9pbnN0YWxsJzpcblx0XHRcdFx0cHJvbXB0VHlwZSA9IFByb21wdHNUeXBlLmluc3RydWN0aW9ucztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdjaGF0LW1vZGUvaW5zdGFsbCc6XG5cdFx0XHRjYXNlICdjaGF0LWFnZW50L2luc3RhbGwnOlxuXHRcdFx0XHRwcm9tcHRUeXBlID0gUHJvbXB0c1R5cGUuYWdlbnQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBxdWVyeSA9IGRlY29kZVVSSUNvbXBvbmVudCh1cmkucXVlcnkpO1xuXHRcdFx0aWYgKCFxdWVyeSB8fCAhcXVlcnkuc3RhcnRzV2l0aCgndXJsPScpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1cmxTdHJpbmcgPSBxdWVyeS5zdWJzdHJpbmcoNCk7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UodXJsU3RyaW5nKTtcblx0XHRcdGlmICh1cmwuc2NoZW1lICE9PSBTY2hlbWFzLmh0dHBzICYmIHVybC5zY2hlbWUgIT09IFNjaGVtYXMuaHR0cCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtQcm9tcHRVcmxIYW5kbGVyXSBJbnZhbGlkIFVSTDogJHt1cmxTdHJpbmd9YCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLmZvY3VzKG1haW5XaW5kb3cpO1xuXG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5zaG91bGRCbG9ja0luc3RhbGwocHJvbXB0VHlwZSwgdXJsKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHsgdHlwZTogJ0dFVCcsIHVybDogdXJsU3RyaW5nLCBjYWxsU2l0ZTogJ3Byb21wdFVybEhhbmRsZXIucmVzb2x2ZVVybCcgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAocmVzdWx0LnJlcy5zdGF0dXNDb2RlICE9PSAyMDApIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbUHJvbXB0VXJsSGFuZGxlcl0gRmFpbGVkIHRvIGZldGNoIFVSTDogJHt1cmxTdHJpbmd9YCk7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnZmFpbGVkJywgJ0ZhaWxlZCB0byBmZXRjaCBVUkw6IHswfScsIHVybFN0cmluZykpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzcG9uc2VEYXRhID0gKGF3YWl0IHN0cmVhbVRvQnVmZmVyKHJlc3VsdC5zdHJlYW0pKS50b1N0cmluZygpO1xuXG5cdFx0XHRjb25zdCBuZXdGb2xkZXIgPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFza0ZvclByb21wdFNvdXJjZUZvbGRlciwgcHJvbXB0VHlwZSk7XG5cdFx0XHRpZiAoIW5ld0ZvbGRlcikge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3TmFtZSA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXNrRm9yUHJvbXB0RmlsZU5hbWUsIHByb21wdFR5cGUsIG5ld0ZvbGRlci51cmksIGdldENsZWFuUHJvbXB0TmFtZSh1cmwpKTtcblx0XHRcdGlmICghbmV3TmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvbXB0VXJpID0gVVJJLmpvaW5QYXRoKG5ld0ZvbGRlci51cmksIG5ld05hbWUpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihuZXdGb2xkZXIudXJpKTtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShwcm9tcHRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcocmVzcG9uc2VEYXRhKSk7XG5cblx0XHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHByb21wdFVyaSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIGhhbmRsaW5nIHByb21wdCBVUkwgJHt1cmkudG9TdHJpbmcoKX1gLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3VsZEJsb2NrSW5zdGFsbChwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgdXJsOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgdXJpTGFiZWwgPSB1cmwudG9TdHJpbmcoKTtcblx0XHRpZiAodXJpTGFiZWwubGVuZ3RoID4gNTApIHtcblx0XHRcdHVyaUxhYmVsID0gYCR7dXJpTGFiZWwuc3Vic3RyaW5nKDAsIDM1KX0uLi4ke3VyaUxhYmVsLnN1YnN0cmluZyh1cmlMYWJlbC5sZW5ndGggLSAxNSl9YDtcblx0XHR9XG5cblx0XHRjb25zdCBkZXRhaWwgPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgc3VwcG9ydEh0bWw6IHRydWUgfSk7XG5cdFx0ZGV0YWlsLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdjb25maXJtT3BlbkRldGFpbDInLCBcIlRoaXMgd2lsbCBhY2Nlc3MgezB9LlxcblxcblwiLCBgWyR7dXJpTGFiZWx9XSgke3VybC50b1N0cmluZygpfSlgKSk7XG5cdFx0ZGV0YWlsLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdjb25maXJtT3BlbkRldGFpbDMnLCBcIklmIHlvdSBkaWQgbm90IGluaXRpYXRlIHRoaXMgcmVxdWVzdCwgaXQgbWF5IHJlcHJlc2VudCBhbiBhdHRlbXB0ZWQgYXR0YWNrIG9uIHlvdXIgc3lzdGVtLiBVbmxlc3MgeW91IHRvb2sgYW4gZXhwbGljaXQgYWN0aW9uIHRvIGluaXRpYXRlIHRoaXMgcmVxdWVzdCwgeW91IHNob3VsZCBwcmVzcyAnTm8nXCIpKTtcblxuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0c3dpdGNoIChwcm9tcHRUeXBlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnByb21wdDpcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjb25maXJtSW5zdGFsbFByb21wdCcsIFwiQW4gZXh0ZXJuYWwgYXBwbGljYXRpb24gd2FudHMgdG8gY3JlYXRlIGEgcHJvbXB0IGZpbGUgd2l0aCBjb250ZW50IGZyb20gYSBVUkwuIERvIHlvdSB3YW50IHRvIGNvbnRpbnVlIGJ5IHNlbGVjdGluZyBhIGRlc3RpbmF0aW9uIGZvbGRlciBhbmQgbmFtZT9cIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY29uZmlybUluc3RhbGxJbnN0cnVjdGlvbnMnLCBcIkFuIGV4dGVybmFsIGFwcGxpY2F0aW9uIHdhbnRzIHRvIGNyZWF0ZSBhbiBpbnN0cnVjdGlvbnMgZmlsZSB3aXRoIGNvbnRlbnQgZnJvbSBhIFVSTC4gRG8geW91IHdhbnQgdG8gY29udGludWUgYnkgc2VsZWN0aW5nIGEgZGVzdGluYXRpb24gZm9sZGVyIGFuZCBuYW1lP1wiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2NvbmZpcm1JbnN0YWxsQWdlbnQnLCBcIkFuIGV4dGVybmFsIGFwcGxpY2F0aW9uIHdhbnRzIHRvIGNyZWF0ZSBhIGN1c3RvbSBhZ2VudCB3aXRoIGNvbnRlbnQgZnJvbSBhIFVSTC4gRG8geW91IHdhbnQgdG8gY29udGludWUgYnkgc2VsZWN0aW5nIGEgZGVzdGluYXRpb24gZm9sZGVyIGFuZCBuYW1lP1wiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAneWVzQnV0dG9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmWWVzXCIpLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgnbm9CdXR0b24nLCBcIk5vXCIpLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IFt7XG5cdFx0XHRcdFx0bWFya2Rvd246IGRldGFpbFxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuICFjb25maXJtZWQ7XG5cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQixnQkFBZ0I7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXNCLG1CQUFtQjtBQUV6QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQkFBa0I7QUFJcEIsSUFBTSxtQkFBTixjQUErQixXQUEwRDtBQUFBLEVBSS9GLFlBQ2MsWUFDMEIscUJBQ0wsZ0JBQ00sc0JBQ1QsYUFD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
