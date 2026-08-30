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
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IDebugService } from "./debug.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
let DebugLifecycle = class {
  constructor(lifecycleService, debugService, configurationService, dialogService) {
    this.debugService = debugService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.disposable = lifecycleService.onBeforeShutdown(async (e) => e.veto(this.shouldVetoShutdown(e.reason), "veto.debug"));
  }
  shouldVetoShutdown(_reason) {
    const rootSessions = this.debugService.getModel().getSessions().filter((s) => s.parentSession === void 0);
    if (rootSessions.length === 0) {
      return false;
    }
    const shouldConfirmOnExit = this.configurationService.getValue("debug").confirmOnExit;
    if (shouldConfirmOnExit === "never") {
      return false;
    }
    return this.showWindowCloseConfirmation(rootSessions.length);
  }
  dispose() {
    return this.disposable.dispose();
  }
  async showWindowCloseConfirmation(numSessions) {
    let message;
    if (numSessions === 1) {
      message = nls.localize("debug.debugSessionCloseConfirmationSingular", "There is an active debug session, are you sure you want to stop it?");
    } else {
      message = nls.localize("debug.debugSessionCloseConfirmationPlural", "There are active debug sessions, are you sure you want to stop them?");
    }
    const res = await this.dialogService.confirm({
      message,
      type: "warning",
      primaryButton: nls.localize({ key: "debug.stop", comment: ["&& denotes a mnemonic"] }, "&&Stop Debugging")
    });
    return !res.confirmed;
  }
};
DebugLifecycle = __decorateClass([
  __decorateParam(0, ILifecycleService),
  __decorateParam(1, IDebugService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IDialogService)
], DebugLifecycle);
export {
  DebugLifecycle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXGRlYnVnTGlmZWN5Y2xlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSURlYnVnQ29uZmlndXJhdGlvbiwgSURlYnVnU2VydmljZSB9IGZyb20gJy4vZGVidWcuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIFNodXRkb3duUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5leHBvcnQgY2xhc3MgRGVidWdMaWZlY3ljbGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZGlzcG9zYWJsZSA9IGxpZmVjeWNsZVNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bihhc3luYyBlID0+IGUudmV0byh0aGlzLnNob3VsZFZldG9TaHV0ZG93bihlLnJlYXNvbiksICd2ZXRvLmRlYnVnJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRWZXRvU2h1dGRvd24oX3JlYXNvbjogU2h1dGRvd25SZWFzb24pOiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgcm9vdFNlc3Npb25zID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpLmZpbHRlcihzID0+IHMucGFyZW50U2Vzc2lvbiA9PT0gdW5kZWZpbmVkKTtcblx0XHRpZiAocm9vdFNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3VsZENvbmZpcm1PbkV4aXQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmNvbmZpcm1PbkV4aXQ7XG5cdFx0aWYgKHNob3VsZENvbmZpcm1PbkV4aXQgPT09ICduZXZlcicpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zaG93V2luZG93Q2xvc2VDb25maXJtYXRpb24ocm9vdFNlc3Npb25zLmxlbmd0aCk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd1dpbmRvd0Nsb3NlQ29uZmlybWF0aW9uKG51bVNlc3Npb25zOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdGlmIChudW1TZXNzaW9ucyA9PT0gMSkge1xuXHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnZGVidWcuZGVidWdTZXNzaW9uQ2xvc2VDb25maXJtYXRpb25TaW5ndWxhcicsIFwiVGhlcmUgaXMgYW4gYWN0aXZlIGRlYnVnIHNlc3Npb24sIGFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBzdG9wIGl0P1wiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnZGVidWcuZGVidWdTZXNzaW9uQ2xvc2VDb25maXJtYXRpb25QbHVyYWwnLCBcIlRoZXJlIGFyZSBhY3RpdmUgZGVidWcgc2Vzc2lvbnMsIGFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBzdG9wIHRoZW0/XCIpO1xuXHRcdH1cblx0XHRjb25zdCByZXMgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAnZGVidWcuc3RvcCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlN0b3AgRGVidWdnaW5nXCIpXG5cdFx0fSk7XG5cdFx0cmV0dXJuICFyZXMuY29uZmlybWVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUUvQixTQUE4QixxQkFBcUI7QUFDbkQsU0FBUyx5QkFBeUM7QUFFM0MsSUFBTSxpQkFBTixNQUF1RDtBQUFBLEVBRzdELFlBQ29CLGtCQUNhLGNBQ1Esc0JBQ1AsZUFDaEM7QUFIK0I7QUFDUTtBQUNQO0FBRWpDLFNBQUssYUFBYSxpQkFBaUIsaUJBQWlCLE9BQU0sTUFBSyxFQUFFLEtBQUssS0FBSyxtQkFBbUIsRUFBRSxNQUFNLEdBQUcsWUFBWSxDQUFDO0FBQUEsRUFDdkg7QUFBQSxFQUVRLG1CQUFtQixTQUFxRDtBQUMvRSxVQUFNLGVBQWUsS0FBSyxhQUFhLFNBQVMsRUFBRSxZQUFZLEVBQUUsT0FBTyxPQUFLLEVBQUUsa0JBQWtCLE1BQVM7QUFDekcsUUFBSSxhQUFhLFdBQVcsR0FBRztBQUM5QixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sc0JBQXNCLEtBQUsscUJBQXFCLFNBQThCLE9BQU8sRUFBRTtBQUM3RixRQUFJLHdCQUF3QixTQUFTO0FBQ3BDLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxLQUFLLDRCQUE0QixhQUFhLE1BQU07QUFBQSxFQUM1RDtBQUFBLEVBRU8sVUFBVTtBQUNoQixXQUFPLEtBQUssV0FBVyxRQUFRO0FBQUEsRUFDaEM7QUFBQSxFQUVBLE1BQWMsNEJBQTRCLGFBQXVDO0FBQ2hGLFFBQUk7QUFDSixRQUFJLGdCQUFnQixHQUFHO0FBQ3RCLGdCQUFVLElBQUksU0FBUywrQ0FBK0MscUVBQXFFO0FBQUEsSUFDNUksT0FBTztBQUNOLGdCQUFVLElBQUksU0FBUyw2Q0FBNkMsc0VBQXNFO0FBQUEsSUFDM0k7QUFDQSxVQUFNLE1BQU0sTUFBTSxLQUFLLGNBQWMsUUFBUTtBQUFBLE1BQzVDO0FBQUEsTUFDQSxNQUFNO0FBQUEsTUFDTixlQUFlLElBQUksU0FBUyxFQUFFLEtBQUssY0FBYyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxrQkFBa0I7QUFBQSxJQUMxRyxDQUFDO0FBQ0QsV0FBTyxDQUFDLElBQUk7QUFBQSxFQUNiO0FBQ0Q7QUE1Q2EsaUJBQU47QUFBQSxFQUlKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFtdCn0K
