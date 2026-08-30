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
import { IDebugService } from "./debug.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Expression } from "./debugModel.js";
let DebugWatchAccessibilityAnnouncer = class extends Disposable {
  constructor(_debugService, _logService, _accessibilityService, _configurationService) {
    super();
    this._debugService = _debugService;
    this._logService = _logService;
    this._accessibilityService = _accessibilityService;
    this._configurationService = _configurationService;
    this._listener = this._register(new MutableDisposable());
    this._setListener();
    this._register(_configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("accessibility.debugWatchVariableAnnouncements")) {
        this._setListener();
      }
    }));
  }
  _setListener() {
    const value = this._configurationService.getValue("accessibility.debugWatchVariableAnnouncements");
    if (value && !this._listener.value) {
      this._listener.value = this._debugService.getModel().onDidChangeWatchExpressionValue((e) => {
        if (!e || e.value === Expression.DEFAULT_VALUE) {
          return;
        }
        this._accessibilityService.alert(`${e.name} = ${e.value}`);
        this._logService.trace(`debugAccessibilityAnnouncerValueChanged ${e.name} ${e.value}`);
      });
    } else {
      this._listener.clear();
    }
  }
};
DebugWatchAccessibilityAnnouncer.ID = "workbench.contrib.debugWatchAccessibilityAnnouncer";
DebugWatchAccessibilityAnnouncer = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IAccessibilityService),
  __decorateParam(3, IConfigurationService)
], DebugWatchAccessibilityAnnouncer);
export {
  DebugWatchAccessibilityAnnouncer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxjb21tb25cXGRlYnVnQWNjZXNzaWJpbGl0eUFubm91bmNlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UgfSBmcm9tICcuL2RlYnVnLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXhwcmVzc2lvbiB9IGZyb20gJy4vZGVidWdNb2RlbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1dhdGNoQWNjZXNzaWJpbGl0eUFubm91bmNlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIElEID0gJ3dvcmtiZW5jaC5jb250cmliLmRlYnVnV2F0Y2hBY2Nlc3NpYmlsaXR5QW5ub3VuY2VyJztcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdGVuZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc2V0TGlzdGVuZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2FjY2Vzc2liaWxpdHkuZGVidWdXYXRjaFZhcmlhYmxlQW5ub3VuY2VtZW50cycpKSB7XG5cdFx0XHRcdHRoaXMuX3NldExpc3RlbmVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0TGlzdGVuZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnYWNjZXNzaWJpbGl0eS5kZWJ1Z1dhdGNoVmFyaWFibGVBbm5vdW5jZW1lbnRzJyk7XG5cdFx0aWYgKHZhbHVlICYmICF0aGlzLl9saXN0ZW5lci52YWx1ZSkge1xuXHRcdFx0dGhpcy5fbGlzdGVuZXIudmFsdWUgPSB0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvblZhbHVlKChlKSA9PiB7XG5cdFx0XHRcdGlmICghZSB8fCBlLnZhbHVlID09PSBFeHByZXNzaW9uLkRFRkFVTFRfVkFMVUUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUT0RPOiBnZXQgdXNlciBmZWVkYmFjaywgcGVyaGFwcyBzZXR0aW5nIHRvIGNvbmZpZ3VyZSB2ZXJib3NpdHkgKyB3aGV0aGVyIHZhbHVlLCBuYW1lLCBuZWl0aGVyLCBvciBib3RoIGFyZSBhbm5vdW5jZWRcblx0XHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuYWxlcnQoYCR7ZS5uYW1lfSA9ICR7ZS52YWx1ZX1gKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgZGVidWdBY2Nlc3NpYmlsaXR5QW5ub3VuY2VyVmFsdWVDaGFuZ2VkICR7ZS5uYW1lfSAke2UudmFsdWV9YCk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGlzdGVuZXIuY2xlYXIoKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxZQUF5Qix5QkFBeUI7QUFFM0QsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0I7QUFFcEIsSUFBTSxtQ0FBTixjQUErQyxXQUE2QztBQUFBLEVBR2xHLFlBQ2lDLGVBQ0YsYUFDVSx1QkFDQSx1QkFDdkM7QUFDRCxVQUFNO0FBTDBCO0FBQ0Y7QUFDVTtBQUNBO0FBTHpDLFNBQWlCLFlBQTRDLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBUWxHLFNBQUssYUFBYTtBQUNsQixTQUFLLFVBQVUsc0JBQXNCLHlCQUF5QixPQUFLO0FBQ2xFLFVBQUksRUFBRSxxQkFBcUIsK0NBQStDLEdBQUc7QUFDNUUsYUFBSyxhQUFhO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLGVBQXFCO0FBQzVCLFVBQU0sUUFBUSxLQUFLLHNCQUFzQixTQUFTLCtDQUErQztBQUNqRyxRQUFJLFNBQVMsQ0FBQyxLQUFLLFVBQVUsT0FBTztBQUNuQyxXQUFLLFVBQVUsUUFBUSxLQUFLLGNBQWMsU0FBUyxFQUFFLGdDQUFnQyxDQUFDLE1BQU07QUFDM0YsWUFBSSxDQUFDLEtBQUssRUFBRSxVQUFVLFdBQVcsZUFBZTtBQUMvQztBQUFBLFFBQ0Q7QUFHQSxhQUFLLHNCQUFzQixNQUFNLEdBQUcsRUFBRSxJQUFJLE1BQU0sRUFBRSxLQUFLLEVBQUU7QUFDekQsYUFBSyxZQUFZLE1BQU0sMkNBQTJDLEVBQUUsSUFBSSxJQUFJLEVBQUUsS0FBSyxFQUFFO0FBQUEsTUFDdEYsQ0FBQztBQUFBLElBQ0YsT0FBTztBQUNOLFdBQUssVUFBVSxNQUFNO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQ0Q7QUFsQ2EsaUNBQ0wsS0FBSztBQURBLG1DQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
