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
import { IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
let NativeWorkspacesService = class {
  constructor(mainProcessService, nativeHostService) {
    return ProxyChannel.toService(mainProcessService.getChannel("workspaces"), { context: nativeHostService.windowId });
  }
};
NativeWorkspacesService = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, INativeHostService)
], NativeWorkspacesService);
registerSingleton(IWorkspacesService, NativeWorkspacesService, InstantiationType.Delayed);
export {
  NativeWorkspacesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx3b3Jrc3BhY2VzXFxlbGVjdHJvbi1icm93c2VyXFx3b3Jrc3BhY2VzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElXb3Jrc3BhY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgSU1haW5Qcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2lwYy9jb21tb24vbWFpblByb2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUHJveHlDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5cbi8vIEB0cy1leHBlY3QtZXJyb3I6IGludGVyZmFjZSBpcyBpbXBsZW1lbnRlZCB2aWEgcHJveHlcbmV4cG9ydCBjbGFzcyBOYXRpdmVXb3Jrc3BhY2VzU2VydmljZSBpbXBsZW1lbnRzIElXb3Jrc3BhY2VzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNYWluUHJvY2Vzc1NlcnZpY2UgbWFpblByb2Nlc3NTZXJ2aWNlOiBJTWFpblByb2Nlc3NTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZVxuXHQpIHtcblx0XHRyZXR1cm4gUHJveHlDaGFubmVsLnRvU2VydmljZTxJV29ya3NwYWNlc1NlcnZpY2U+KG1haW5Qcm9jZXNzU2VydmljZS5nZXRDaGFubmVsKCd3b3Jrc3BhY2VzJyksIHsgY29udGV4dDogbmF0aXZlSG9zdFNlcnZpY2Uud2luZG93SWQgfSk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVdvcmtzcGFjZXNTZXJ2aWNlLCBOYXRpdmVXb3Jrc3BhY2VzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBCQUEwQjtBQUc1QixJQUFNLDBCQUFOLE1BQTREO0FBQUEsRUFJbEUsWUFDc0Isb0JBQ0QsbUJBQ25CO0FBQ0QsV0FBTyxhQUFhLFVBQThCLG1CQUFtQixXQUFXLFlBQVksR0FBRyxFQUFFLFNBQVMsa0JBQWtCLFNBQVMsQ0FBQztBQUFBLEVBQ3ZJO0FBQ0Q7QUFWYSwwQkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsR0FOVTtBQVliLGtCQUFrQixvQkFBb0IseUJBQXlCLGtCQUFrQixPQUFPOyIsCiAgIm5hbWVzIjogW10KfQo=
