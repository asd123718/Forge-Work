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
import { localize } from "../../../../../nls.js";
import { $ } from "../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation } from "../browserEditor.js";
import { IBrowserViewWorkbenchService } from "../../common/browserView.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { workbenchConfigurationNodeBase } from "../../../../common/configuration.js";
import { BrowserRemoteProxyEnabledSettingId } from "../browserViewWorkbenchService.js";
import product from "../../../../../platform/product/common/product.js";
let BrowserRemoteIndicatorContribution = class extends BrowserEditorContribution {
  constructor(editor, hoverService, browserViewWorkbenchService) {
    super(editor);
    this.browserViewWorkbenchService = browserViewWorkbenchService;
    this._message = "";
    this._container = $(".browser-remote-indicator");
    this._container.setAttribute("role", "img");
    const icon = renderIcon(Codicon.remote);
    this._container.appendChild(icon);
    this._register(hoverService.setupDelayedHover(
      this._container,
      () => ({
        content: this._message
      })
    ));
    this.refresh(null);
  }
  get widgets() {
    return [{ location: BrowserWidgetLocation.PreUrl, element: this._container, order: 0 }];
  }
  onModelAttached(model, store) {
    this.refresh(model);
    store.add(model.onDidNavigate(() => this.refresh(model)));
    store.add(model.onDidChangeRemoteStatus(() => this.refresh(model)));
  }
  onModelDetached() {
    this.refresh(null);
  }
  refresh(model) {
    let statusMessage = "";
    let isConnected = false;
    let isWarning = false;
    if (model) {
      if (model.url.startsWith("file://")) {
        isConnected = false;
        statusMessage = localize("browser.connectedLocally.file", "File URLs are served locally, not over the remote connection.");
        isWarning = true;
      } else if (model.isRemoteSession) {
        isConnected = true;
        statusMessage = localize("browser.connectedRemotely", "Connected via remote");
      } else {
        isConnected = false;
        statusMessage = localize("browser.connectedLocally.generic", "Connected locally");
      }
    }
    this._container.classList.toggle("connected", isConnected);
    this._container.classList.toggle("warning", isWarning);
    this._container.style.display = isConnected || this.browserViewWorkbenchService.willUseRemoteProxy() ? "" : "none";
    this._container.setAttribute("aria-label", statusMessage);
    this._message = statusMessage;
  }
};
BrowserRemoteIndicatorContribution = __decorateClass([
  __decorateParam(1, IHoverService),
  __decorateParam(2, IBrowserViewWorkbenchService)
], BrowserRemoteIndicatorContribution);
BrowserEditor.registerContribution(BrowserRemoteIndicatorContribution);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    [BrowserRemoteProxyEnabledSettingId]: {
      type: "boolean",
      default: product.quality !== "stable",
      tags: ["experimental"],
      scope: ConfigurationScope.WINDOW,
      experiment: { mode: "startup" },
      markdownDescription: localize("browser.enableRemoteProxy", "When enabled, browser requests in remote workspaces are proxied through the remote connection. This allows web pages to access resources available on the remote host.")
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3NlclJlbW90ZUZlYXR1cmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3IsIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24sIEJyb3dzZXJXaWRnZXRMb2NhdGlvbiwgSUJyb3dzZXJFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi9icm93c2VyRWRpdG9yLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld01vZGVsLCBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIENvbmZpZ3VyYXRpb25TY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hDb25maWd1cmF0aW9uTm9kZUJhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBCcm93c2VyUmVtb3RlUHJveHlFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuXG5jbGFzcyBCcm93c2VyUmVtb3RlSW5kaWNhdG9yQ29udHJpYnV0aW9uIGV4dGVuZHMgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX21lc3NhZ2UgPSAnJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IEJyb3dzZXJFZGl0b3IsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlOiBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyID0gJCgnLmJyb3dzZXItcmVtb3RlLWluZGljYXRvcicpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnaW1nJyk7XG5cblx0XHRjb25zdCBpY29uID0gcmVuZGVySWNvbihDb2RpY29uLnJlbW90ZSk7XG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKFxuXHRcdFx0dGhpcy5fY29udGFpbmVyLFxuXHRcdFx0KCkgPT4gKHtcblx0XHRcdFx0Y29udGVudDogdGhpcy5fbWVzc2FnZSxcblx0XHRcdH0pXG5cdFx0KSk7XG5cblx0XHR0aGlzLnJlZnJlc2gobnVsbCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgd2lkZ2V0cygpOiByZWFkb25seSBJQnJvd3NlckVkaXRvcldpZGdldFtdIHtcblx0XHRyZXR1cm4gW3sgbG9jYXRpb246IEJyb3dzZXJXaWRnZXRMb2NhdGlvbi5QcmVVcmwsIGVsZW1lbnQ6IHRoaXMuX2NvbnRhaW5lciwgb3JkZXI6IDAgfV07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25Nb2RlbEF0dGFjaGVkKG1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdHRoaXMucmVmcmVzaChtb2RlbCk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkTmF2aWdhdGUoKCkgPT4gdGhpcy5yZWZyZXNoKG1vZGVsKSkpO1xuXHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZENoYW5nZVJlbW90ZVN0YXR1cygoKSA9PiB0aGlzLnJlZnJlc2gobW9kZWwpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBvbk1vZGVsRGV0YWNoZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWZyZXNoKG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoKG1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCB8IG51bGwpOiB2b2lkIHtcblx0XHRsZXQgc3RhdHVzTWVzc2FnZSA9ICcnO1xuXHRcdGxldCBpc0Nvbm5lY3RlZCA9IGZhbHNlO1xuXHRcdGxldCBpc1dhcm5pbmcgPSBmYWxzZTtcblxuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0aWYgKG1vZGVsLnVybC5zdGFydHNXaXRoKCdmaWxlOi8vJykpIHtcblx0XHRcdFx0aXNDb25uZWN0ZWQgPSBmYWxzZTtcblx0XHRcdFx0c3RhdHVzTWVzc2FnZSA9IGxvY2FsaXplKCdicm93c2VyLmNvbm5lY3RlZExvY2FsbHkuZmlsZScsIFwiRmlsZSBVUkxzIGFyZSBzZXJ2ZWQgbG9jYWxseSwgbm90IG92ZXIgdGhlIHJlbW90ZSBjb25uZWN0aW9uLlwiKTtcblx0XHRcdFx0aXNXYXJuaW5nID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAobW9kZWwuaXNSZW1vdGVTZXNzaW9uKSB7XG5cdFx0XHRcdGlzQ29ubmVjdGVkID0gdHJ1ZTtcblx0XHRcdFx0c3RhdHVzTWVzc2FnZSA9IGxvY2FsaXplKCdicm93c2VyLmNvbm5lY3RlZFJlbW90ZWx5JywgXCJDb25uZWN0ZWQgdmlhIHJlbW90ZVwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlzQ29ubmVjdGVkID0gZmFsc2U7XG5cdFx0XHRcdHN0YXR1c01lc3NhZ2UgPSBsb2NhbGl6ZSgnYnJvd3Nlci5jb25uZWN0ZWRMb2NhbGx5LmdlbmVyaWMnLCBcIkNvbm5lY3RlZCBsb2NhbGx5XCIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjb25uZWN0ZWQnLCBpc0Nvbm5lY3RlZCk7XG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3dhcm5pbmcnLCBpc1dhcm5pbmcpO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gaXNDb25uZWN0ZWQgfHwgdGhpcy5icm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2Uud2lsbFVzZVJlbW90ZVByb3h5KCkgPyAnJyA6ICdub25lJztcblx0XHR0aGlzLl9jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgc3RhdHVzTWVzc2FnZSk7XG5cdFx0dGhpcy5fbWVzc2FnZSA9IHN0YXR1c01lc3NhZ2U7XG5cdH1cbn1cblxuQnJvd3NlckVkaXRvci5yZWdpc3RlckNvbnRyaWJ1dGlvbihCcm93c2VyUmVtb3RlSW5kaWNhdG9yQ29udHJpYnV0aW9uKTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0Li4ud29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W0Jyb3dzZXJSZW1vdGVQcm94eUVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdicm93c2VyLmVuYWJsZVJlbW90ZVByb3h5JywgXCJXaGVuIGVuYWJsZWQsIGJyb3dzZXIgcmVxdWVzdHMgaW4gcmVtb3RlIHdvcmtzcGFjZXMgYXJlIHByb3hpZWQgdGhyb3VnaCB0aGUgcmVtb3RlIGNvbm5lY3Rpb24uIFRoaXMgYWxsb3dzIHdlYiBwYWdlcyB0byBhY2Nlc3MgcmVzb3VyY2VzIGF2YWlsYWJsZSBvbiB0aGUgcmVtb3RlIGhvc3QuXCIpLFxuXHRcdH1cblx0fVxufSk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUV4QixTQUFTLGVBQWUsMkJBQTJCLDZCQUFtRDtBQUN0RyxTQUE0QixvQ0FBb0M7QUFDaEUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBaUMsY0FBYyx5QkFBeUIsMEJBQTBCO0FBQ2xHLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsMENBQTBDO0FBQ25ELE9BQU8sYUFBYTtBQUVwQixJQUFNLHFDQUFOLGNBQWlELDBCQUEwQjtBQUFBLEVBSTFFLFlBQ0MsUUFDZSxjQUNnQyw2QkFDOUM7QUFDRCxVQUFNLE1BQU07QUFGbUM7QUFMaEQsU0FBUSxXQUFXO0FBU2xCLFNBQUssYUFBYSxFQUFFLDJCQUEyQjtBQUMvQyxTQUFLLFdBQVcsYUFBYSxRQUFRLEtBQUs7QUFFMUMsVUFBTSxPQUFPLFdBQVcsUUFBUSxNQUFNO0FBQ3RDLFNBQUssV0FBVyxZQUFZLElBQUk7QUFFaEMsU0FBSyxVQUFVLGFBQWE7QUFBQSxNQUMzQixLQUFLO0FBQUEsTUFDTCxPQUFPO0FBQUEsUUFDTixTQUFTLEtBQUs7QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxRQUFRLElBQUk7QUFBQSxFQUNsQjtBQUFBLEVBRUEsSUFBYSxVQUEyQztBQUN2RCxXQUFPLENBQUMsRUFBRSxVQUFVLHNCQUFzQixRQUFRLFNBQVMsS0FBSyxZQUFZLE9BQU8sRUFBRSxDQUFDO0FBQUEsRUFDdkY7QUFBQSxFQUVtQixnQkFBZ0IsT0FBMEIsT0FBOEI7QUFDMUYsU0FBSyxRQUFRLEtBQUs7QUFDbEIsVUFBTSxJQUFJLE1BQU0sY0FBYyxNQUFNLEtBQUssUUFBUSxLQUFLLENBQUMsQ0FBQztBQUN4RCxVQUFNLElBQUksTUFBTSx3QkFBd0IsTUFBTSxLQUFLLFFBQVEsS0FBSyxDQUFDLENBQUM7QUFBQSxFQUNuRTtBQUFBLEVBRVMsa0JBQXdCO0FBQ2hDLFNBQUssUUFBUSxJQUFJO0FBQUEsRUFDbEI7QUFBQSxFQUVRLFFBQVEsT0FBdUM7QUFDdEQsUUFBSSxnQkFBZ0I7QUFDcEIsUUFBSSxjQUFjO0FBQ2xCLFFBQUksWUFBWTtBQUVoQixRQUFJLE9BQU87QUFDVixVQUFJLE1BQU0sSUFBSSxXQUFXLFNBQVMsR0FBRztBQUNwQyxzQkFBYztBQUNkLHdCQUFnQixTQUFTLGlDQUFpQywrREFBK0Q7QUFDekgsb0JBQVk7QUFBQSxNQUNiLFdBQVcsTUFBTSxpQkFBaUI7QUFDakMsc0JBQWM7QUFDZCx3QkFBZ0IsU0FBUyw2QkFBNkIsc0JBQXNCO0FBQUEsTUFDN0UsT0FBTztBQUNOLHNCQUFjO0FBQ2Qsd0JBQWdCLFNBQVMsb0NBQW9DLG1CQUFtQjtBQUFBLE1BQ2pGO0FBQUEsSUFDRDtBQUVBLFNBQUssV0FBVyxVQUFVLE9BQU8sYUFBYSxXQUFXO0FBQ3pELFNBQUssV0FBVyxVQUFVLE9BQU8sV0FBVyxTQUFTO0FBQ3JELFNBQUssV0FBVyxNQUFNLFVBQVUsZUFBZSxLQUFLLDRCQUE0QixtQkFBbUIsSUFBSSxLQUFLO0FBQzVHLFNBQUssV0FBVyxhQUFhLGNBQWMsYUFBYTtBQUN4RCxTQUFLLFdBQVc7QUFBQSxFQUNqQjtBQUNEO0FBbEVNLHFDQUFOO0FBQUEsRUFNRztBQUFBLEVBQ0E7QUFBQSxHQVBHO0FBb0VOLGNBQWMscUJBQXFCLGtDQUFrQztBQUVyRSxTQUFTLEdBQTJCLHdCQUF3QixhQUFhLEVBQUUsc0JBQXNCO0FBQUEsRUFDaEcsR0FBRztBQUFBLEVBQ0gsWUFBWTtBQUFBLElBQ1gsQ0FBQyxrQ0FBa0MsR0FBRztBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLFNBQVMsUUFBUSxZQUFZO0FBQUEsTUFDN0IsTUFBTSxDQUFDLGNBQWM7QUFBQSxNQUNyQixPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLFlBQVksRUFBRSxNQUFNLFVBQVU7QUFBQSxNQUM5QixxQkFBcUIsU0FBUyw2QkFBNkIsd0tBQXdLO0FBQUEsSUFDcE87QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
