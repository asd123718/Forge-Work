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
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { AbstractDialogHandler } from "../../../../platform/dialogs/common/dialogs.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { getActiveWindow } from "../../../../base/browser/dom.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
let NativeDialogHandler = class extends AbstractDialogHandler {
  constructor(logService, nativeHostService, clipboardService) {
    super();
    this.logService = logService;
    this.nativeHostService = nativeHostService;
    this.clipboardService = clipboardService;
  }
  /**
   * Native Electron message boxes have no Markdown rendering capability, so
   * a Markdown `detail` is degraded to its plain-text equivalent rather than
   * shown with raw Markdown/link syntax.
   */
  toNativeDetail(detail) {
    return typeof detail === "object" ? renderAsPlaintext(detail) : detail;
  }
  async prompt(prompt) {
    this.logService.trace("DialogService#prompt", prompt.message);
    const buttons = this.getPromptButtons(prompt);
    const { response, checkboxChecked } = await this.nativeHostService.showMessageBox({
      type: this.getDialogType(prompt.type),
      title: prompt.title,
      message: prompt.message,
      detail: this.toNativeDetail(prompt.detail),
      buttons,
      cancelId: prompt.cancelButton ? buttons.length - 1 : -1,
      checkboxLabel: prompt.checkbox?.label,
      checkboxChecked: prompt.checkbox?.checked,
      targetWindowId: getActiveWindow().vscodeWindowId
    });
    return this.getPromptResult(prompt, response, checkboxChecked);
  }
  async confirm(confirmation) {
    this.logService.trace("DialogService#confirm", confirmation.message);
    const buttons = this.getConfirmationButtons(confirmation);
    const { response, checkboxChecked } = await this.nativeHostService.showMessageBox({
      type: this.getDialogType(confirmation.type) ?? "question",
      title: confirmation.title,
      message: confirmation.message,
      detail: this.toNativeDetail(confirmation.detail),
      buttons,
      cancelId: buttons.length - 1,
      checkboxLabel: confirmation.checkbox?.label,
      checkboxChecked: confirmation.checkbox?.checked,
      targetWindowId: getActiveWindow().vscodeWindowId
    });
    return { confirmed: response === 0, checkboxChecked };
  }
  input() {
    throw new Error("Unsupported");
  }
  async about(title, details, detailsToCopy) {
    const { response } = await this.nativeHostService.showMessageBox({
      type: "info",
      message: title,
      detail: `
${details}`,
      buttons: [
        localize({ key: "copy", comment: ["&& denotes a mnemonic"] }, "&&Copy"),
        localize("okButton", "OK")
      ],
      targetWindowId: getActiveWindow().vscodeWindowId
    });
    if (response === 0) {
      this.clipboardService.writeText(detailsToCopy);
    }
  }
};
NativeDialogHandler = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, INativeHostService),
  __decorateParam(2, IClipboardService)
], NativeDialogHandler);
export {
  NativeDialogHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGVsZWN0cm9uLWJyb3dzZXJcXHBhcnRzXFxkaWFsb2dzXFxkaWFsb2dIYW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3REaWFsb2dIYW5kbGVyLCBJQ29uZmlybWF0aW9uLCBJQ29uZmlybWF0aW9uUmVzdWx0LCBJUHJvbXB0LCBJQXN5bmNQcm9tcHRSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZURpYWxvZ0hhbmRsZXIgZXh0ZW5kcyBBYnN0cmFjdERpYWxvZ0hhbmRsZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogTmF0aXZlIEVsZWN0cm9uIG1lc3NhZ2UgYm94ZXMgaGF2ZSBubyBNYXJrZG93biByZW5kZXJpbmcgY2FwYWJpbGl0eSwgc29cblx0ICogYSBNYXJrZG93biBgZGV0YWlsYCBpcyBkZWdyYWRlZCB0byBpdHMgcGxhaW4tdGV4dCBlcXVpdmFsZW50IHJhdGhlciB0aGFuXG5cdCAqIHNob3duIHdpdGggcmF3IE1hcmtkb3duL2xpbmsgc3ludGF4LlxuXHQgKi9cblx0cHJpdmF0ZSB0b05hdGl2ZURldGFpbChkZXRhaWw6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHR5cGVvZiBkZXRhaWwgPT09ICdvYmplY3QnID8gcmVuZGVyQXNQbGFpbnRleHQoZGV0YWlsKSA6IGRldGFpbDtcblx0fVxuXG5cdGFzeW5jIHByb21wdDxUPihwcm9tcHQ6IElQcm9tcHQ8VD4pOiBQcm9taXNlPElBc3luY1Byb21wdFJlc3VsdDxUPj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRGlhbG9nU2VydmljZSNwcm9tcHQnLCBwcm9tcHQubWVzc2FnZSk7XG5cblx0XHRjb25zdCBidXR0b25zID0gdGhpcy5nZXRQcm9tcHRCdXR0b25zKHByb21wdCk7XG5cblx0XHRjb25zdCB7IHJlc3BvbnNlLCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0dHlwZTogdGhpcy5nZXREaWFsb2dUeXBlKHByb21wdC50eXBlKSxcblx0XHRcdHRpdGxlOiBwcm9tcHQudGl0bGUsXG5cdFx0XHRtZXNzYWdlOiBwcm9tcHQubWVzc2FnZSxcblx0XHRcdGRldGFpbDogdGhpcy50b05hdGl2ZURldGFpbChwcm9tcHQuZGV0YWlsKSxcblx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRjYW5jZWxJZDogcHJvbXB0LmNhbmNlbEJ1dHRvbiA/IGJ1dHRvbnMubGVuZ3RoIC0gMSA6IC0xIC8qIERpc2FibGVkICovLFxuXHRcdFx0Y2hlY2tib3hMYWJlbDogcHJvbXB0LmNoZWNrYm94Py5sYWJlbCxcblx0XHRcdGNoZWNrYm94Q2hlY2tlZDogcHJvbXB0LmNoZWNrYm94Py5jaGVja2VkLFxuXHRcdFx0dGFyZ2V0V2luZG93SWQ6IGdldEFjdGl2ZVdpbmRvdygpLnZzY29kZVdpbmRvd0lkXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRQcm9tcHRSZXN1bHQocHJvbXB0LCByZXNwb25zZSwgY2hlY2tib3hDaGVja2VkKTtcblx0fVxuXG5cdGFzeW5jIGNvbmZpcm0oY29uZmlybWF0aW9uOiBJQ29uZmlybWF0aW9uKTogUHJvbWlzZTxJQ29uZmlybWF0aW9uUmVzdWx0PiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdEaWFsb2dTZXJ2aWNlI2NvbmZpcm0nLCBjb25maXJtYXRpb24ubWVzc2FnZSk7XG5cblx0XHRjb25zdCBidXR0b25zID0gdGhpcy5nZXRDb25maXJtYXRpb25CdXR0b25zKGNvbmZpcm1hdGlvbik7XG5cblx0XHRjb25zdCB7IHJlc3BvbnNlLCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0dHlwZTogdGhpcy5nZXREaWFsb2dUeXBlKGNvbmZpcm1hdGlvbi50eXBlKSA/PyAncXVlc3Rpb24nLFxuXHRcdFx0dGl0bGU6IGNvbmZpcm1hdGlvbi50aXRsZSxcblx0XHRcdG1lc3NhZ2U6IGNvbmZpcm1hdGlvbi5tZXNzYWdlLFxuXHRcdFx0ZGV0YWlsOiB0aGlzLnRvTmF0aXZlRGV0YWlsKGNvbmZpcm1hdGlvbi5kZXRhaWwpLFxuXHRcdFx0YnV0dG9ucyxcblx0XHRcdGNhbmNlbElkOiBidXR0b25zLmxlbmd0aCAtIDEsXG5cdFx0XHRjaGVja2JveExhYmVsOiBjb25maXJtYXRpb24uY2hlY2tib3g/LmxhYmVsLFxuXHRcdFx0Y2hlY2tib3hDaGVja2VkOiBjb25maXJtYXRpb24uY2hlY2tib3g/LmNoZWNrZWQsXG5cdFx0XHR0YXJnZXRXaW5kb3dJZDogZ2V0QWN0aXZlV2luZG93KCkudnNjb2RlV2luZG93SWRcblx0XHR9KTtcblxuXHRcdHJldHVybiB7IGNvbmZpcm1lZDogcmVzcG9uc2UgPT09IDAsIGNoZWNrYm94Q2hlY2tlZCB9O1xuXHR9XG5cblx0aW5wdXQoKTogbmV2ZXIge1xuXHRcdHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQnKTsgLy8gd2UgaGF2ZSBubyBuYXRpdmUgQVBJIGZvciBwYXNzd29yZCBkaWFsb2dzIGluIEVsZWN0cm9uXG5cdH1cblxuXHRhc3luYyBhYm91dCh0aXRsZTogc3RyaW5nLCBkZXRhaWxzOiBzdHJpbmcsIGRldGFpbHNUb0NvcHk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgcmVzcG9uc2UgfSA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0bWVzc2FnZTogdGl0bGUsXG5cdFx0XHRkZXRhaWw6IGBcXG4ke2RldGFpbHN9YCxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdjb3B5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ29weVwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ29rQnV0dG9uJywgXCJPS1wiKVxuXHRcdFx0XSxcblx0XHRcdHRhcmdldFdpbmRvd0lkOiBnZXRBY3RpdmVXaW5kb3coKS52c2NvZGVXaW5kb3dJZFxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlc3BvbnNlID09PSAwKSB7XG5cdFx0XHR0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGRldGFpbHNUb0NvcHkpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE4RjtBQUN2RyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUczQixJQUFNLHNCQUFOLGNBQWtDLHNCQUFzQjtBQUFBLEVBRTlELFlBQytCLFlBQ08sbUJBQ0Qsa0JBQ25DO0FBQ0QsVUFBTTtBQUp3QjtBQUNPO0FBQ0Q7QUFBQSxFQUdyQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLGVBQWUsUUFBa0U7QUFDeEYsV0FBTyxPQUFPLFdBQVcsV0FBVyxrQkFBa0IsTUFBTSxJQUFJO0FBQUEsRUFDakU7QUFBQSxFQUVBLE1BQU0sT0FBVSxRQUFvRDtBQUNuRSxTQUFLLFdBQVcsTUFBTSx3QkFBd0IsT0FBTyxPQUFPO0FBRTVELFVBQU0sVUFBVSxLQUFLLGlCQUFpQixNQUFNO0FBRTVDLFVBQU0sRUFBRSxVQUFVLGdCQUFnQixJQUFJLE1BQU0sS0FBSyxrQkFBa0IsZUFBZTtBQUFBLE1BQ2pGLE1BQU0sS0FBSyxjQUFjLE9BQU8sSUFBSTtBQUFBLE1BQ3BDLE9BQU8sT0FBTztBQUFBLE1BQ2QsU0FBUyxPQUFPO0FBQUEsTUFDaEIsUUFBUSxLQUFLLGVBQWUsT0FBTyxNQUFNO0FBQUEsTUFDekM7QUFBQSxNQUNBLFVBQVUsT0FBTyxlQUFlLFFBQVEsU0FBUyxJQUFJO0FBQUEsTUFDckQsZUFBZSxPQUFPLFVBQVU7QUFBQSxNQUNoQyxpQkFBaUIsT0FBTyxVQUFVO0FBQUEsTUFDbEMsZ0JBQWdCLGdCQUFnQixFQUFFO0FBQUEsSUFDbkMsQ0FBQztBQUVELFdBQU8sS0FBSyxnQkFBZ0IsUUFBUSxVQUFVLGVBQWU7QUFBQSxFQUM5RDtBQUFBLEVBRUEsTUFBTSxRQUFRLGNBQTJEO0FBQ3hFLFNBQUssV0FBVyxNQUFNLHlCQUF5QixhQUFhLE9BQU87QUFFbkUsVUFBTSxVQUFVLEtBQUssdUJBQXVCLFlBQVk7QUFFeEQsVUFBTSxFQUFFLFVBQVUsZ0JBQWdCLElBQUksTUFBTSxLQUFLLGtCQUFrQixlQUFlO0FBQUEsTUFDakYsTUFBTSxLQUFLLGNBQWMsYUFBYSxJQUFJLEtBQUs7QUFBQSxNQUMvQyxPQUFPLGFBQWE7QUFBQSxNQUNwQixTQUFTLGFBQWE7QUFBQSxNQUN0QixRQUFRLEtBQUssZUFBZSxhQUFhLE1BQU07QUFBQSxNQUMvQztBQUFBLE1BQ0EsVUFBVSxRQUFRLFNBQVM7QUFBQSxNQUMzQixlQUFlLGFBQWEsVUFBVTtBQUFBLE1BQ3RDLGlCQUFpQixhQUFhLFVBQVU7QUFBQSxNQUN4QyxnQkFBZ0IsZ0JBQWdCLEVBQUU7QUFBQSxJQUNuQyxDQUFDO0FBRUQsV0FBTyxFQUFFLFdBQVcsYUFBYSxHQUFHLGdCQUFnQjtBQUFBLEVBQ3JEO0FBQUEsRUFFQSxRQUFlO0FBQ2QsVUFBTSxJQUFJLE1BQU0sYUFBYTtBQUFBLEVBQzlCO0FBQUEsRUFFQSxNQUFNLE1BQU0sT0FBZSxTQUFpQixlQUFzQztBQUNqRixVQUFNLEVBQUUsU0FBUyxJQUFJLE1BQU0sS0FBSyxrQkFBa0IsZUFBZTtBQUFBLE1BQ2hFLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxFQUFLLE9BQU87QUFBQSxNQUNwQixTQUFTO0FBQUEsUUFDUixTQUFTLEVBQUUsS0FBSyxRQUFRLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLFFBQVE7QUFBQSxRQUN0RSxTQUFTLFlBQVksSUFBSTtBQUFBLE1BQzFCO0FBQUEsTUFDQSxnQkFBZ0IsZ0JBQWdCLEVBQUU7QUFBQSxJQUNuQyxDQUFDO0FBRUQsUUFBSSxhQUFhLEdBQUc7QUFDbkIsV0FBSyxpQkFBaUIsVUFBVSxhQUFhO0FBQUEsSUFDOUM7QUFBQSxFQUNEO0FBQ0Q7QUEvRWEsc0JBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogW10KfQo=
