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
import * as nls from "../../../nls.js";
import { toAction } from "../../../base/common/actions.js";
import { MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { INotificationService, NotificationPriority } from "../../../platform/notification/common/notification.js";
import { Event } from "../../../base/common/event.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
let MainThreadMessageService = class {
  constructor(extHostContext, _notificationService, _commandService, _dialogService, extensionService) {
    this._notificationService = _notificationService;
    this._commandService = _commandService;
    this._dialogService = _dialogService;
    this.extensionsListener = extensionService.onDidChangeExtensions((e) => {
      for (const extension of e.removed) {
        this._notificationService.removeFilter(extension.identifier.value);
      }
    });
  }
  dispose() {
    this.extensionsListener.dispose();
  }
  $showMessage(severity, message, options, commands) {
    if (options.modal) {
      return this._showModalMessage(severity, message, options.detail, commands, options.useCustom);
    } else {
      return this._showMessage(severity, message, commands, options);
    }
  }
  _showMessage(severity, message, commands, options) {
    return new Promise((resolve) => {
      const primaryActions = commands.map((command) => toAction({
        id: `_extension_message_handle_${command.handle}`,
        label: command.title,
        enabled: true,
        run: () => {
          resolve(command.handle);
          return Promise.resolve();
        }
      }));
      let source;
      let sourceIsUrgent = false;
      if (options.source) {
        source = {
          label: options.source.label,
          id: options.source.identifier.value
        };
        sourceIsUrgent = MainThreadMessageService.URGENT_NOTIFICATION_SOURCES.includes(source.id);
      }
      if (!source) {
        source = nls.localize("defaultSource", "Extension");
      }
      const secondaryActions = [];
      if (options.source) {
        secondaryActions.push(toAction({
          id: options.source.identifier.value,
          label: nls.localize("manageExtension", "Manage Extension"),
          run: () => {
            return this._commandService.executeCommand("_extensions.manage", options.source.identifier.value);
          }
        }));
      }
      const messageHandle = this._notificationService.notify({
        severity,
        message,
        actions: { primary: primaryActions, secondary: secondaryActions },
        source,
        priority: sourceIsUrgent ? NotificationPriority.URGENT : NotificationPriority.DEFAULT,
        sticky: sourceIsUrgent
      });
      Event.once(messageHandle.onDidClose)(() => {
        resolve(void 0);
      });
    });
  }
  async _showModalMessage(severity, message, detail, commands, useCustom) {
    const buttons = [];
    let cancelButton = void 0;
    for (const command of commands) {
      const button = {
        label: command.title,
        run: () => command.handle
      };
      if (command.isCloseAffordance) {
        cancelButton = button;
      } else {
        buttons.push(button);
      }
    }
    if (!cancelButton) {
      if (buttons.length > 0) {
        cancelButton = {
          label: nls.localize("cancel", "Cancel"),
          run: () => void 0
        };
      } else {
        cancelButton = {
          label: nls.localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
          run: () => void 0
        };
      }
    }
    const { result } = await this._dialogService.prompt({
      type: severity,
      message,
      detail,
      buttons,
      cancelButton,
      custom: useCustom
    });
    return result;
  }
};
MainThreadMessageService.URGENT_NOTIFICATION_SOURCES = [
  "vscode.github-authentication",
  "vscode.microsoft-authentication"
];
MainThreadMessageService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadMessageService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IExtensionService)
], MainThreadMessageService);
export {
  MainThreadMessageService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZE1lc3NhZ2VTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRNZXNzYWdlU2VydmljZVNoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZE1lc3NhZ2VPcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElQcm9tcHRCdXR0b24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBJTm90aWZpY2F0aW9uU291cmNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkTWVzc2FnZVNlcnZpY2UpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZE1lc3NhZ2VTZXJ2aWNlIGltcGxlbWVudHMgTWFpblRocmVhZE1lc3NhZ2VTZXJ2aWNlU2hhcGUge1xuXG5cdHByaXZhdGUgZXh0ZW5zaW9uc0xpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBVUkdFTlRfTk9USUZJQ0FUSU9OX1NPVVJDRVMgPSBbXG5cdFx0J3ZzY29kZS5naXRodWItYXV0aGVudGljYXRpb24nLFxuXHRcdCd2c2NvZGUubWljcm9zb2Z0LWF1dGhlbnRpY2F0aW9uJ1xuXHRdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuZXh0ZW5zaW9uc0xpc3RlbmVyID0gZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5yZW1vdmVGaWx0ZXIoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmV4dGVuc2lvbnNMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH1cblxuXHQkc2hvd01lc3NhZ2Uoc2V2ZXJpdHk6IFNldmVyaXR5LCBtZXNzYWdlOiBzdHJpbmcsIG9wdGlvbnM6IE1haW5UaHJlYWRNZXNzYWdlT3B0aW9ucywgY29tbWFuZHM6IHsgdGl0bGU6IHN0cmluZzsgaXNDbG9zZUFmZm9yZGFuY2U6IGJvb2xlYW47IGhhbmRsZTogbnVtYmVyIH1bXSk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKG9wdGlvbnMubW9kYWwpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zaG93TW9kYWxNZXNzYWdlKHNldmVyaXR5LCBtZXNzYWdlLCBvcHRpb25zLmRldGFpbCwgY29tbWFuZHMsIG9wdGlvbnMudXNlQ3VzdG9tKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Nob3dNZXNzYWdlKHNldmVyaXR5LCBtZXNzYWdlLCBjb21tYW5kcywgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd01lc3NhZ2Uoc2V2ZXJpdHk6IFNldmVyaXR5LCBtZXNzYWdlOiBzdHJpbmcsIGNvbW1hbmRzOiB7IHRpdGxlOiBzdHJpbmc7IGlzQ2xvc2VBZmZvcmRhbmNlOiBib29sZWFuOyBoYW5kbGU6IG51bWJlciB9W10sIG9wdGlvbnM6IE1haW5UaHJlYWRNZXNzYWdlT3B0aW9ucyk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblxuXHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnM6IElBY3Rpb25bXSA9IGNvbW1hbmRzLm1hcChjb21tYW5kID0+IHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6IGBfZXh0ZW5zaW9uX21lc3NhZ2VfaGFuZGxlXyR7Y29tbWFuZC5oYW5kbGV9YCxcblx0XHRcdFx0bGFiZWw6IGNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmUoY29tbWFuZC5oYW5kbGUpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRsZXQgc291cmNlOiBzdHJpbmcgfCBJTm90aWZpY2F0aW9uU291cmNlIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHNvdXJjZUlzVXJnZW50ID0gZmFsc2U7XG5cdFx0XHRpZiAob3B0aW9ucy5zb3VyY2UpIHtcblx0XHRcdFx0c291cmNlID0ge1xuXHRcdFx0XHRcdGxhYmVsOiBvcHRpb25zLnNvdXJjZS5sYWJlbCxcblx0XHRcdFx0XHRpZDogb3B0aW9ucy5zb3VyY2UuaWRlbnRpZmllci52YWx1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzb3VyY2VJc1VyZ2VudCA9IE1haW5UaHJlYWRNZXNzYWdlU2VydmljZS5VUkdFTlRfTk9USUZJQ0FUSU9OX1NPVVJDRVMuaW5jbHVkZXMoc291cmNlLmlkKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzb3VyY2UpIHtcblx0XHRcdFx0c291cmNlID0gbmxzLmxvY2FsaXplKCdkZWZhdWx0U291cmNlJywgXCJFeHRlbnNpb25cIik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlY29uZGFyeUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0aWYgKG9wdGlvbnMuc291cmNlKSB7XG5cdFx0XHRcdHNlY29uZGFyeUFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6IG9wdGlvbnMuc291cmNlLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbWFuYWdlRXh0ZW5zaW9uJywgXCJNYW5hZ2UgRXh0ZW5zaW9uXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdfZXh0ZW5zaW9ucy5tYW5hZ2UnLCBvcHRpb25zLnNvdXJjZSEuaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1lc3NhZ2VIYW5kbGUgPSB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5LFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRhY3Rpb25zOiB7IHByaW1hcnk6IHByaW1hcnlBY3Rpb25zLCBzZWNvbmRhcnk6IHNlY29uZGFyeUFjdGlvbnMgfSxcblx0XHRcdFx0c291cmNlLFxuXHRcdFx0XHRwcmlvcml0eTogc291cmNlSXNVcmdlbnQgPyBOb3RpZmljYXRpb25Qcmlvcml0eS5VUkdFTlQgOiBOb3RpZmljYXRpb25Qcmlvcml0eS5ERUZBVUxULFxuXHRcdFx0XHRzdGlja3k6IHNvdXJjZUlzVXJnZW50XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gaWYgcHJvbWlzZSBoYXMgbm90IGJlZW4gcmVzb2x2ZWQgeWV0LCBub3cgaXMgdGhlIHRpbWUgdG8gZW5zdXJlIGEgcmV0dXJuIHZhbHVlXG5cdFx0XHQvLyBvdGhlcndpc2UgaWYgYWxyZWFkeSByZXNvbHZlZCBpdCBtZWFucyB0aGUgdXNlciBjbGlja2VkIG9uZSBvZiB0aGUgYnV0dG9uc1xuXHRcdFx0RXZlbnQub25jZShtZXNzYWdlSGFuZGxlLm9uRGlkQ2xvc2UpKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93TW9kYWxNZXNzYWdlKHNldmVyaXR5OiBTZXZlcml0eSwgbWVzc2FnZTogc3RyaW5nLCBkZXRhaWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29tbWFuZHM6IHsgdGl0bGU6IHN0cmluZzsgaXNDbG9zZUFmZm9yZGFuY2U6IGJvb2xlYW47IGhhbmRsZTogbnVtYmVyIH1bXSwgdXNlQ3VzdG9tPzogYm9vbGVhbik6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYnV0dG9uczogSVByb21wdEJ1dHRvbjxudW1iZXI+W10gPSBbXTtcblx0XHRsZXQgY2FuY2VsQnV0dG9uOiBJUHJvbXB0QnV0dG9uPG51bWJlciB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY29tbWFuZHMpIHtcblx0XHRcdGNvbnN0IGJ1dHRvbjogSVByb21wdEJ1dHRvbjxudW1iZXI+ID0ge1xuXHRcdFx0XHRsYWJlbDogY29tbWFuZC50aXRsZSxcblx0XHRcdFx0cnVuOiAoKSA9PiBjb21tYW5kLmhhbmRsZVxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGNvbW1hbmQuaXNDbG9zZUFmZm9yZGFuY2UpIHtcblx0XHRcdFx0Y2FuY2VsQnV0dG9uID0gYnV0dG9uO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnV0dG9ucy5wdXNoKGJ1dHRvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFjYW5jZWxCdXR0b24pIHtcblx0XHRcdGlmIChidXR0b25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y2FuY2VsQnV0dG9uID0ge1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdW5kZWZpbmVkXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjYW5jZWxCdXR0b24gPSB7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ29rJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT0tcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB1bmRlZmluZWRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogc2V2ZXJpdHksXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0ZGV0YWlsLFxuXHRcdFx0YnV0dG9ucyxcblx0XHRcdGNhbmNlbEJ1dHRvbixcblx0XHRcdGN1c3RvbTogdXNlQ3VzdG9tXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFrQixnQkFBZ0I7QUFDbEMsU0FBd0MsbUJBQTZDO0FBQ3JGLFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsc0JBQXFDO0FBQzlDLFNBQVMsc0JBQTJDLDRCQUE0QjtBQUNoRixT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
