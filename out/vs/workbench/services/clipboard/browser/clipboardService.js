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
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { BrowserClipboardService as BaseBrowserClipboardService } from "../../../../platform/clipboard/browser/clipboardService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { getActiveWindow } from "../../../../base/browser/dom.js";
let BrowserClipboardService = class extends BaseBrowserClipboardService {
  constructor(notificationService, openerService, environmentService, logService, layoutService) {
    super(layoutService, logService);
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.environmentService = environmentService;
  }
  async writeText(text, type) {
    this.logService.trace("BrowserClipboardService#writeText called with type:", type, " with text.length:", text.length);
    if (!!this.environmentService.extensionTestsLocationURI && typeof type !== "string") {
      type = "vscode-tests";
    }
    this.logService.trace("BrowserClipboardService#super.writeText");
    return super.writeText(text, type);
  }
  async readText(type) {
    this.logService.trace("BrowserClipboardService#readText called with type:", type);
    if (!!this.environmentService.extensionTestsLocationURI && typeof type !== "string") {
      type = "vscode-tests";
    }
    if (type) {
      this.logService.trace("BrowserClipboardService#super.readText");
      return super.readText(type);
    }
    try {
      const readText = await getActiveWindow().navigator.clipboard.readText();
      this.logService.trace("BrowserClipboardService#readText with readText.length:", readText.length);
      return readText;
    } catch (error) {
      return new Promise((resolve) => {
        const listener = new DisposableStore();
        const handle = this.notificationService.prompt(
          Severity.Error,
          localize("clipboardError", "Unable to read from the browser's clipboard. Please make sure you have granted access for this website to read from the clipboard."),
          [{
            label: localize("retry", "Retry"),
            run: async () => {
              listener.dispose();
              resolve(await this.readText(type));
            }
          }, {
            label: localize("learnMore", "Learn More"),
            run: () => this.openerService.open("https://go.microsoft.com/fwlink/?linkid=2151362")
          }],
          {
            sticky: true
          }
        );
        listener.add(Event.once(handle.onDidClose)(() => resolve("")));
      });
    }
  }
};
BrowserClipboardService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, ILogService),
  __decorateParam(4, ILayoutService)
], BrowserClipboardService);
registerSingleton(IClipboardService, BrowserClipboardService, InstantiationType.Delayed);
export {
  BrowserClipboardService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjbGlwYm9hcmRcXGJyb3dzZXJcXGNsaXBib2FyZFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlIGFzIEJhc2VCcm93c2VyQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9icm93c2VyL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlIGV4dGVuZHMgQmFzZUJyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGxheW91dFNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgd3JpdGVUZXh0KHRleHQ6IHN0cmluZywgdHlwZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnQnJvd3NlckNsaXBib2FyZFNlcnZpY2Ujd3JpdGVUZXh0IGNhbGxlZCB3aXRoIHR5cGU6JywgdHlwZSwgJyB3aXRoIHRleHQubGVuZ3RoOicsIHRleHQubGVuZ3RoKTtcblx0XHRpZiAoISF0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJICYmIHR5cGVvZiB0eXBlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dHlwZSA9ICd2c2NvZGUtdGVzdHMnOyAvLyBmb3JjZSBpbi1tZW1vcnkgY2xpcGJvYXJkIGZvciB0ZXN0cyB0byBhdm9pZCBwZXJtaXNzaW9uIGlzc3Vlc1xuXHRcdH1cblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0Jyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlI3N1cGVyLndyaXRlVGV4dCcpO1xuXHRcdHJldHVybiBzdXBlci53cml0ZVRleHQodGV4dCwgdHlwZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZWFkVGV4dCh0eXBlPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0Jyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlI3JlYWRUZXh0IGNhbGxlZCB3aXRoIHR5cGU6JywgdHlwZSk7XG5cdFx0aWYgKCEhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSAmJiB0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHR5cGUgPSAndnNjb2RlLXRlc3RzJzsgLy8gZm9yY2UgaW4tbWVtb3J5IGNsaXBib2FyZCBmb3IgdGVzdHMgdG8gYXZvaWQgcGVybWlzc2lvbiBpc3N1ZXNcblx0XHR9XG5cblx0XHRpZiAodHlwZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdCcm93c2VyQ2xpcGJvYXJkU2VydmljZSNzdXBlci5yZWFkVGV4dCcpO1xuXHRcdFx0cmV0dXJuIHN1cGVyLnJlYWRUZXh0KHR5cGUpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWFkVGV4dCA9IGF3YWl0IGdldEFjdGl2ZVdpbmRvdygpLm5hdmlnYXRvci5jbGlwYm9hcmQucmVhZFRleHQoKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnQnJvd3NlckNsaXBib2FyZFNlcnZpY2UjcmVhZFRleHQgd2l0aCByZWFkVGV4dC5sZW5ndGg6JywgcmVhZFRleHQubGVuZ3RoKTtcblx0XHRcdHJldHVybiByZWFkVGV4dDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4ocmVzb2x2ZSA9PiB7XG5cblx0XHRcdFx0Ly8gSW5mb3JtIHVzZXIgYWJvdXQgcGVybWlzc2lvbnMgcHJvYmxlbSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExMjA4OSlcblx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0U2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsaXBib2FyZEVycm9yJywgXCJVbmFibGUgdG8gcmVhZCBmcm9tIHRoZSBicm93c2VyJ3MgY2xpcGJvYXJkLiBQbGVhc2UgbWFrZSBzdXJlIHlvdSBoYXZlIGdyYW50ZWQgYWNjZXNzIGZvciB0aGlzIHdlYnNpdGUgdG8gcmVhZCBmcm9tIHRoZSBjbGlwYm9hcmQuXCIpLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JldHJ5JywgXCJSZXRyeVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoYXdhaXQgdGhpcy5yZWFkVGV4dCh0eXBlKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdsZWFybk1vcmUnLCBcIkxlYXJuIE1vcmVcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKCdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9saW5raWQ9MjE1MTM2MicpXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c3RpY2t5OiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdC8vIEFsd2F5cyByZXNvbHZlIHRoZSBwcm9taXNlIG9uY2UgdGhlIG5vdGlmaWNhdGlvbiBjbG9zZXNcblx0XHRcdFx0bGlzdGVuZXIuYWRkKEV2ZW50Lm9uY2UoaGFuZGxlLm9uRGlkQ2xvc2UpKCgpID0+IHJlc29sdmUoJycpKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUNsaXBib2FyZFNlcnZpY2UsIEJyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0Es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
