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
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { OpenWindowSessionLogFileAction } from "../common/logsActions.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { LogsDataCleaner } from "../common/logsDataCleaner.js";
let WebLogOutputChannels = class extends Disposable {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.registerWebContributions();
  }
  registerWebContributions() {
    this.instantiationService.createInstance(LogsDataCleaner);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: OpenWindowSessionLogFileAction.ID,
          title: OpenWindowSessionLogFileAction.TITLE,
          category: Categories.Developer,
          f1: true
        });
      }
      run(servicesAccessor) {
        return servicesAccessor.get(IInstantiationService).createInstance(OpenWindowSessionLogFileAction, OpenWindowSessionLogFileAction.ID, OpenWindowSessionLogFileAction.TITLE.value).run();
      }
    }));
  }
};
WebLogOutputChannels = __decorateClass([
  __decorateParam(0, IInstantiationService)
], WebLogOutputChannels);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WebLogOutputChannels, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGxvZ3NcXGJyb3dzZXJcXGxvZ3MuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE9wZW5XaW5kb3dTZXNzaW9uTG9nRmlsZUFjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9sb2dzQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBMb2dzRGF0YUNsZWFuZXIgfSBmcm9tICcuLi9jb21tb24vbG9nc0RhdGFDbGVhbmVyLmpzJztcblxuY2xhc3MgV2ViTG9nT3V0cHV0Q2hhbm5lbHMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZWdpc3RlcldlYkNvbnRyaWJ1dGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJXZWJDb250cmlidXRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9nc0RhdGFDbGVhbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogT3BlbldpbmRvd1Nlc3Npb25Mb2dGaWxlQWN0aW9uLklELFxuXHRcdFx0XHRcdHRpdGxlOiBPcGVuV2luZG93U2Vzc2lvbkxvZ0ZpbGVBY3Rpb24uVElUTEUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuRGV2ZWxvcGVyLFxuXHRcdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKHNlcnZpY2VzQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0cmV0dXJuIHNlcnZpY2VzQWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoT3BlbldpbmRvd1Nlc3Npb25Mb2dGaWxlQWN0aW9uLCBPcGVuV2luZG93U2Vzc2lvbkxvZ0ZpbGVBY3Rpb24uSUQsIE9wZW5XaW5kb3dTZXNzaW9uTG9nRmlsZUFjdGlvbi5USVRMRS52YWx1ZSkucnVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdH1cblxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oV2ViTG9nT3V0cHV0Q2hhbm5lbHMsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFrRSxjQUFjLDJCQUEyQjtBQUMzRyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUVoQyxJQUFNLHVCQUFOLGNBQW1DLFdBQTZDO0FBQUEsRUFFL0UsWUFDeUMsc0JBQ3ZDO0FBQ0QsVUFBTTtBQUZrQztBQUd4QyxTQUFLLHlCQUF5QjtBQUFBLEVBQy9CO0FBQUEsRUFFUSwyQkFBaUM7QUFDeEMsU0FBSyxxQkFBcUIsZUFBZSxlQUFlO0FBRXhELFNBQUssVUFBVSxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsTUFDcEQsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUksK0JBQStCO0FBQUEsVUFDbkMsT0FBTywrQkFBK0I7QUFBQSxVQUN0QyxVQUFVLFdBQVc7QUFBQSxVQUNyQixJQUFJO0FBQUEsUUFDTCxDQUFDO0FBQUEsTUFDRjtBQUFBLE1BQ0EsSUFBSSxrQkFBbUQ7QUFDdEQsZUFBTyxpQkFBaUIsSUFBSSxxQkFBcUIsRUFBRSxlQUFlLGdDQUFnQywrQkFBK0IsSUFBSSwrQkFBK0IsTUFBTSxLQUFLLEVBQUUsSUFBSTtBQUFBLE1BQ3RMO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUVIO0FBRUQ7QUE1Qk0sdUJBQU47QUFBQSxFQUdHO0FBQUEsR0FIRztBQThCTixTQUFTLEdBQW9DLG9CQUFvQixTQUFTLEVBQUUsOEJBQThCLHNCQUFzQixlQUFlLFFBQVE7IiwKICAibmFtZXMiOiBbXQp9Cg==
