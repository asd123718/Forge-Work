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
import { URI } from "../../../../../base/common/uri.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { localize } from "../../../../../nls.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkbenchLayoutService } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { DEFAULT_PERMISSION_LEVELS, PermissionPicker } from "./permissionPicker.js";
import { isPhoneLayout } from "../../../../browser/parts/mobile/mobileLayout.js";
import { showMobilePickerSheet } from "../../../../browser/parts/mobile/mobilePickerSheet.js";
const LEARN_MORE_ID = "learn-more";
let MobilePermissionPicker = class extends PermissionPicker {
  constructor(_delegate, actionWidgetService, configurationService, dialogService, openerService, storageService, telemetryService, hoverService, _layoutService) {
    super(_delegate, actionWidgetService, configurationService, dialogService, openerService, storageService, telemetryService, hoverService);
    this._layoutService = _layoutService;
  }
  showPicker() {
    if (!this._triggerElement || this.actionWidgetService.isVisible || this._isResolving()) {
      return;
    }
    if (!isPhoneLayout(this._layoutService)) {
      super.showPicker();
      return;
    }
    const policyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    const levels = this._delegate.availableLevels ?? DEFAULT_PERMISSION_LEVELS;
    const items = levels.map((level) => {
      const meta = this._getPermissionLevelMeta(level);
      return {
        id: level,
        label: meta.label,
        description: meta.detail,
        icon: meta.icon,
        checked: this._currentLevel === level,
        // Default is never policy-restricted; elevated levels are
        // disabled when enterprise policy turns off auto-approval.
        ...level !== ChatPermissionLevel.Default && policyRestricted ? { disabled: true } : {}
      };
    });
    items.push({
      id: LEARN_MORE_ID,
      label: localize("permissions.learnMore", "Learn more about permissions"),
      icon: Codicon.linkExternal,
      sectionTitle: ""
    });
    const trigger = this._triggerElement;
    trigger.setAttribute("aria-expanded", "true");
    showMobilePickerSheet(
      this._layoutService.mainContainer,
      localize("permissionPicker.title", "Approvals"),
      items
    ).then(async (id) => {
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
      if (!id) {
        return;
      }
      if (id === LEARN_MORE_ID) {
        await this.openerService.open(URI.parse("https://aka.ms/vscode/docs/permissions"));
        return;
      }
      await this._selectLevel(id);
    });
  }
};
MobilePermissionPicker = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, IWorkbenchLayoutService)
], MobilePermissionPicker);
export {
  MobilePermissionPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxjb3BpbG90Q2hhdFNlc3Npb25zXFxicm93c2VyXFxtb2JpbGVQZXJtaXNzaW9uUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IERFRkFVTFRfUEVSTUlTU0lPTl9MRVZFTFMsIElQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsIFBlcm1pc3Npb25QaWNrZXIgfSBmcm9tICcuL3Blcm1pc3Npb25QaWNrZXIuanMnO1xuaW1wb3J0IHsgaXNQaG9uZUxheW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvbW9iaWxlL21vYmlsZUxheW91dC5qcyc7XG5pbXBvcnQgeyBJTW9iaWxlUGlja2VyU2hlZXRJdGVtLCBzaG93TW9iaWxlUGlja2VyU2hlZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9tb2JpbGVQaWNrZXJTaGVldC5qcyc7XG5cbmNvbnN0IExFQVJOX01PUkVfSUQgPSAnbGVhcm4tbW9yZSc7XG5cbi8qKlxuICogUGhvbmUgdmFyaWFudCBvZiB7QGxpbmsgUGVybWlzc2lvblBpY2tlcn0gdGhhdCBzdXJmYWNlcyB0aGUgYXZhaWxhYmxlXG4gKiBhcHByb3ZhbCBsZXZlbHMgKHByb3ZpZGVkIGJ5IHRoZSBkZWxlZ2F0ZSwgZGVmYXVsdGluZyB0b1xuICogRGVmYXVsdC9CeXBhc3MvQXV0b3BpbG90KSBhcyBhIHtAbGluayBzaG93TW9iaWxlUGlja2VyU2hlZXR9IGJvdHRvbSBzaGVldFxuICogcmF0aGVyIHRoYW4gdGhlIGRlc2t0b3AgYWN0aW9uLXdpZGdldCBwb3B1cC5cbiAqXG4gKiBGYWxscyBiYWNrIHRvIHRoZSBpbmhlcml0ZWQgZHJvcGRvd24gd2hlbiB0aGUgdmlld3BvcnQgaXMgbm90IHBob25lXG4gKiAoZS5nLiB1c2VyIHJlc2l6ZWQgcGFzdCB0aGUgYnJlYWtwb2ludCBhZnRlciB0aGUgcGlja2VyIHJlbmRlcmVkKS5cbiAqL1xuZXhwb3J0IGNsYXNzIE1vYmlsZVBlcm1pc3Npb25QaWNrZXIgZXh0ZW5kcyBQZXJtaXNzaW9uUGlja2VyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfZGVsZWdhdGU6IElQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoX2RlbGVnYXRlLCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZGlhbG9nU2VydmljZSwgb3BlbmVyU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBzaG93UGlja2VyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdHJpZ2dlckVsZW1lbnQgfHwgdGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLmlzVmlzaWJsZSB8fCB0aGlzLl9pc1Jlc29sdmluZygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghaXNQaG9uZUxheW91dCh0aGlzLl9sYXlvdXRTZXJ2aWNlKSkge1xuXHRcdFx0c3VwZXIuc2hvd1BpY2tlcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpLnBvbGljeVZhbHVlID09PSBmYWxzZTtcblxuXHRcdGNvbnN0IGxldmVscyA9IHRoaXMuX2RlbGVnYXRlLmF2YWlsYWJsZUxldmVscyA/PyBERUZBVUxUX1BFUk1JU1NJT05fTEVWRUxTO1xuXHRcdGNvbnN0IGl0ZW1zOiBJTW9iaWxlUGlja2VyU2hlZXRJdGVtW10gPSBsZXZlbHMubWFwKGxldmVsID0+IHtcblx0XHRcdGNvbnN0IG1ldGEgPSB0aGlzLl9nZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKGxldmVsKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBsZXZlbCxcblx0XHRcdFx0bGFiZWw6IG1ldGEubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBtZXRhLmRldGFpbCxcblx0XHRcdFx0aWNvbjogbWV0YS5pY29uLFxuXHRcdFx0XHRjaGVja2VkOiB0aGlzLl9jdXJyZW50TGV2ZWwgPT09IGxldmVsLFxuXHRcdFx0XHQvLyBEZWZhdWx0IGlzIG5ldmVyIHBvbGljeS1yZXN0cmljdGVkOyBlbGV2YXRlZCBsZXZlbHMgYXJlXG5cdFx0XHRcdC8vIGRpc2FibGVkIHdoZW4gZW50ZXJwcmlzZSBwb2xpY3kgdHVybnMgb2ZmIGF1dG8tYXBwcm92YWwuXG5cdFx0XHRcdC4uLihsZXZlbCAhPT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0ICYmIHBvbGljeVJlc3RyaWN0ZWQgPyB7IGRpc2FibGVkOiB0cnVlIH0gOiB7fSksXG5cdFx0XHR9IHNhdGlzZmllcyBJTW9iaWxlUGlja2VyU2hlZXRJdGVtO1xuXHRcdH0pO1xuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0aWQ6IExFQVJOX01PUkVfSUQsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmxlYXJuTW9yZScsIFwiTGVhcm4gbW9yZSBhYm91dCBwZXJtaXNzaW9uc1wiKSxcblx0XHRcdGljb246IENvZGljb24ubGlua0V4dGVybmFsLFxuXHRcdFx0c2VjdGlvblRpdGxlOiAnJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyaWdnZXIgPSB0aGlzLl90cmlnZ2VyRWxlbWVudDtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cdFx0c2hvd01vYmlsZVBpY2tlclNoZWV0KFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLFxuXHRcdFx0bG9jYWxpemUoJ3Blcm1pc3Npb25QaWNrZXIudGl0bGUnLCBcIkFwcHJvdmFsc1wiKSxcblx0XHRcdGl0ZW1zLFxuXHRcdCkudGhlbihhc3luYyBpZCA9PiB7XG5cdFx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdFx0dHJpZ2dlci5mb2N1cygpO1xuXHRcdFx0aWYgKCFpZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaWQgPT09IExFQVJOX01PUkVfSUQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy92c2NvZGUvZG9jcy9wZXJtaXNzaW9ucycpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fc2VsZWN0TGV2ZWwoaWQgYXMgQ2hhdFBlcm1pc3Npb25MZXZlbCk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1CQUFtQiwyQkFBMkI7QUFDdkQsU0FBUywyQkFBc0Qsd0JBQXdCO0FBQ3ZGLFNBQVMscUJBQXFCO0FBQzlCLFNBQWlDLDZCQUE2QjtBQUU5RCxNQUFNLGdCQUFnQjtBQVdmLElBQU0seUJBQU4sY0FBcUMsaUJBQWlCO0FBQUEsRUFFNUQsWUFDQyxXQUNzQixxQkFDQyxzQkFDUCxlQUNBLGVBQ0MsZ0JBQ0Usa0JBQ0osY0FDMkIsZ0JBQ3pDO0FBQ0QsVUFBTSxXQUFXLHFCQUFxQixzQkFBc0IsZUFBZSxlQUFlLGdCQUFnQixrQkFBa0IsWUFBWTtBQUY5RjtBQUFBLEVBRzNDO0FBQUEsRUFFUyxhQUFtQjtBQUMzQixRQUFJLENBQUMsS0FBSyxtQkFBbUIsS0FBSyxvQkFBb0IsYUFBYSxLQUFLLGFBQWEsR0FBRztBQUN2RjtBQUFBLElBQ0Q7QUFDQSxRQUFJLENBQUMsY0FBYyxLQUFLLGNBQWMsR0FBRztBQUN4QyxZQUFNLFdBQVc7QUFDakI7QUFBQSxJQUNEO0FBRUEsVUFBTSxtQkFBbUIsS0FBSyxxQkFBcUIsUUFBaUIsa0JBQWtCLGlCQUFpQixFQUFFLGdCQUFnQjtBQUV6SCxVQUFNLFNBQVMsS0FBSyxVQUFVLG1CQUFtQjtBQUNqRCxVQUFNLFFBQWtDLE9BQU8sSUFBSSxXQUFTO0FBQzNELFlBQU0sT0FBTyxLQUFLLHdCQUF3QixLQUFLO0FBQy9DLGFBQU87QUFBQSxRQUNOLElBQUk7QUFBQSxRQUNKLE9BQU8sS0FBSztBQUFBLFFBQ1osYUFBYSxLQUFLO0FBQUEsUUFDbEIsTUFBTSxLQUFLO0FBQUEsUUFDWCxTQUFTLEtBQUssa0JBQWtCO0FBQUE7QUFBQTtBQUFBLFFBR2hDLEdBQUksVUFBVSxvQkFBb0IsV0FBVyxtQkFBbUIsRUFBRSxVQUFVLEtBQUssSUFBSSxDQUFDO0FBQUEsTUFDdkY7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLEtBQUs7QUFBQSxNQUNWLElBQUk7QUFBQSxNQUNKLE9BQU8sU0FBUyx5QkFBeUIsOEJBQThCO0FBQUEsTUFDdkUsTUFBTSxRQUFRO0FBQUEsTUFDZCxjQUFjO0FBQUEsSUFDZixDQUFDO0FBRUQsVUFBTSxVQUFVLEtBQUs7QUFDckIsWUFBUSxhQUFhLGlCQUFpQixNQUFNO0FBQzVDO0FBQUEsTUFDQyxLQUFLLGVBQWU7QUFBQSxNQUNwQixTQUFTLDBCQUEwQixXQUFXO0FBQUEsTUFDOUM7QUFBQSxJQUNELEVBQUUsS0FBSyxPQUFNLE9BQU07QUFDbEIsY0FBUSxhQUFhLGlCQUFpQixPQUFPO0FBQzdDLGNBQVEsTUFBTTtBQUNkLFVBQUksQ0FBQyxJQUFJO0FBQ1I7QUFBQSxNQUNEO0FBQ0EsVUFBSSxPQUFPLGVBQWU7QUFDekIsY0FBTSxLQUFLLGNBQWMsS0FBSyxJQUFJLE1BQU0sd0NBQXdDLENBQUM7QUFDakY7QUFBQSxNQUNEO0FBQ0EsWUFBTSxLQUFLLGFBQWEsRUFBeUI7QUFBQSxJQUNsRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBbkVhLHlCQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVhVOyIsCiAgIm5hbWVzIjogW10KfQo=
