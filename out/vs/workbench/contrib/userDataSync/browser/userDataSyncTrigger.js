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
import { Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../base/common/platform.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IUserDataAutoSyncService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { VIEWLET_ID } from "../../extensions/common/extensions.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { KeybindingsEditorInput } from "../../../services/preferences/browser/keybindingsEditorInput.js";
import { SettingsEditor2Input } from "../../../services/preferences/common/preferencesEditorInput.js";
let UserDataSyncTrigger = class extends Disposable {
  constructor(editorService, userDataProfilesService, viewsService, userDataAutoSyncService, hostService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    const event = Event.filter(
      Event.any(
        Event.map(editorService.onDidActiveEditorChange, () => this.getUserDataEditorInputSource(editorService.activeEditor)),
        Event.map(Event.filter(viewsService.onDidChangeViewContainerVisibility, (e) => e.id === VIEWLET_ID && e.visible), (e) => e.id)
      ),
      (source) => source !== void 0
    );
    if (isWeb) {
      this._register(Event.debounce(
        Event.any(
          Event.map(hostService.onDidChangeFocus, () => "windowFocus"),
          Event.map(event, (source) => source)
        ),
        (last, source) => last ? [...last, source] : [source],
        1e3
      )((sources) => userDataAutoSyncService.triggerSync(sources, { skipIfSyncedRecently: true })));
    } else {
      this._register(event((source) => userDataAutoSyncService.triggerSync([source], { skipIfSyncedRecently: true })));
    }
  }
  getUserDataEditorInputSource(editorInput) {
    if (!editorInput) {
      return void 0;
    }
    if (editorInput instanceof SettingsEditor2Input) {
      return "settingsEditor";
    }
    if (editorInput instanceof KeybindingsEditorInput) {
      return "keybindingsEditor";
    }
    const resource = editorInput.resource;
    if (isEqual(resource, this.userDataProfilesService.defaultProfile.settingsResource)) {
      return "settingsEditor";
    }
    if (isEqual(resource, this.userDataProfilesService.defaultProfile.keybindingsResource)) {
      return "keybindingsEditor";
    }
    return void 0;
  }
};
UserDataSyncTrigger = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IViewsService),
  __decorateParam(3, IUserDataAutoSyncService),
  __decorateParam(4, IHostService)
], UserDataSyncTrigger);
export {
  UserDataSyncTrigger
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVzZXJEYXRhU3luY1xcYnJvd3NlclxcdXNlckRhdGFTeW5jVHJpZ2dlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWSUVXTEVUX0lEIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvYnJvd3Nlci9rZXliaW5kaW5nc0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNldHRpbmdzRWRpdG9yMklucHV0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzRWRpdG9ySW5wdXQuanMnO1xuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jVHJpZ2dlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2Ugdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UgdXNlckRhdGFBdXRvU3luY1NlcnZpY2U6IElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgZXZlbnQgPSBFdmVudC5maWx0ZXIoXG5cdFx0XHRFdmVudC5hbnk8c3RyaW5nIHwgdW5kZWZpbmVkPihcblx0XHRcdFx0RXZlbnQubWFwKGVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsICgpID0+IHRoaXMuZ2V0VXNlckRhdGFFZGl0b3JJbnB1dFNvdXJjZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcikpLFxuXHRcdFx0XHRFdmVudC5tYXAoRXZlbnQuZmlsdGVyKHZpZXdzU2VydmljZS5vbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5LCBlID0+IGUuaWQgPT09IFZJRVdMRVRfSUQgJiYgZS52aXNpYmxlKSwgZSA9PiBlLmlkKVxuXHRcdFx0KSwgc291cmNlID0+IHNvdXJjZSAhPT0gdW5kZWZpbmVkKTtcblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlPHN0cmluZywgc3RyaW5nW10+KFxuXHRcdFx0XHRFdmVudC5hbnk8c3RyaW5nPihcblx0XHRcdFx0XHRFdmVudC5tYXAoaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cywgKCkgPT4gJ3dpbmRvd0ZvY3VzJyksXG5cdFx0XHRcdFx0RXZlbnQubWFwKGV2ZW50LCBzb3VyY2UgPT4gc291cmNlISksXG5cdFx0XHRcdCksIChsYXN0LCBzb3VyY2UpID0+IGxhc3QgPyBbLi4ubGFzdCwgc291cmNlXSA6IFtzb3VyY2VdLCAxMDAwKVxuXHRcdFx0XHQoc291cmNlcyA9PiB1c2VyRGF0YUF1dG9TeW5jU2VydmljZS50cmlnZ2VyU3luYyhzb3VyY2VzLCB7IHNraXBJZlN5bmNlZFJlY2VudGx5OiB0cnVlIH0pKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGV2ZW50KHNvdXJjZSA9PiB1c2VyRGF0YUF1dG9TeW5jU2VydmljZS50cmlnZ2VyU3luYyhbc291cmNlIV0sIHsgc2tpcElmU3luY2VkUmVjZW50bHk6IHRydWUgfSkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFVzZXJEYXRhRWRpdG9ySW5wdXRTb3VyY2UoZWRpdG9ySW5wdXQ6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoZWRpdG9ySW5wdXQgaW5zdGFuY2VvZiBTZXR0aW5nc0VkaXRvcjJJbnB1dCkge1xuXHRcdFx0cmV0dXJuICdzZXR0aW5nc0VkaXRvcic7XG5cdFx0fVxuXHRcdGlmIChlZGl0b3JJbnB1dCBpbnN0YW5jZW9mIEtleWJpbmRpbmdzRWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybiAna2V5YmluZGluZ3NFZGl0b3InO1xuXHRcdH1cblx0XHRjb25zdCByZXNvdXJjZSA9IGVkaXRvcklucHV0LnJlc291cmNlO1xuXHRcdGlmIChpc0VxdWFsKHJlc291cmNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gJ3NldHRpbmdzRWRpdG9yJztcblx0XHR9XG5cdFx0aWYgKGlzRXF1YWwocmVzb3VyY2UsIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiAna2V5YmluZGluZ3NFZGl0b3InO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBR3pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNEJBQTRCO0FBRTlCLElBQU0sc0JBQU4sY0FBa0MsV0FBNkM7QUFBQSxFQUVyRixZQUNpQixlQUMyQix5QkFDNUIsY0FDVyx5QkFDWixhQUNiO0FBQ0QsVUFBTTtBQUxxQztBQU0zQyxVQUFNLFFBQVEsTUFBTTtBQUFBLE1BQ25CLE1BQU07QUFBQSxRQUNMLE1BQU0sSUFBSSxjQUFjLHlCQUF5QixNQUFNLEtBQUssNkJBQTZCLGNBQWMsWUFBWSxDQUFDO0FBQUEsUUFDcEgsTUFBTSxJQUFJLE1BQU0sT0FBTyxhQUFhLG9DQUFvQyxPQUFLLEVBQUUsT0FBTyxjQUFjLEVBQUUsT0FBTyxHQUFHLE9BQUssRUFBRSxFQUFFO0FBQUEsTUFDMUg7QUFBQSxNQUFHLFlBQVUsV0FBVztBQUFBLElBQVM7QUFDbEMsUUFBSSxPQUFPO0FBQ1YsV0FBSyxVQUFVLE1BQU07QUFBQSxRQUNwQixNQUFNO0FBQUEsVUFDTCxNQUFNLElBQUksWUFBWSxrQkFBa0IsTUFBTSxhQUFhO0FBQUEsVUFDM0QsTUFBTSxJQUFJLE9BQU8sWUFBVSxNQUFPO0FBQUEsUUFDbkM7QUFBQSxRQUFHLENBQUMsTUFBTSxXQUFXLE9BQU8sQ0FBQyxHQUFHLE1BQU0sTUFBTSxJQUFJLENBQUMsTUFBTTtBQUFBLFFBQUc7QUFBQSxNQUFJLEVBQzdELGFBQVcsd0JBQXdCLFlBQVksU0FBUyxFQUFFLHNCQUFzQixLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDM0YsT0FBTztBQUNOLFdBQUssVUFBVSxNQUFNLFlBQVUsd0JBQXdCLFlBQVksQ0FBQyxNQUFPLEdBQUcsRUFBRSxzQkFBc0IsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQy9HO0FBQUEsRUFDRDtBQUFBLEVBRVEsNkJBQTZCLGFBQTBEO0FBQzlGLFFBQUksQ0FBQyxhQUFhO0FBQ2pCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSx1QkFBdUIsc0JBQXNCO0FBQ2hELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSx1QkFBdUIsd0JBQXdCO0FBQ2xELGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxXQUFXLFlBQVk7QUFDN0IsUUFBSSxRQUFRLFVBQVUsS0FBSyx3QkFBd0IsZUFBZSxnQkFBZ0IsR0FBRztBQUNwRixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksUUFBUSxVQUFVLEtBQUssd0JBQXdCLGVBQWUsbUJBQW1CLEdBQUc7QUFDdkYsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBOUNhLHNCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
