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
import { ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { IMainProcessService } from "../../ipc/common/mainProcessService.js";
let NativeHostService = class {
  constructor(windowId, mainProcessService) {
    this.windowId = windowId;
    return ProxyChannel.toService(mainProcessService.getChannel("nativeHost"), {
      context: windowId,
      properties: (() => {
        const properties = /* @__PURE__ */ new Map();
        properties.set("windowId", windowId);
        return properties;
      })()
    });
  }
};
NativeHostService = __decorateClass([
  __decorateParam(1, IMainProcessService)
], NativeHostService);
export {
  NativeHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbmF0aXZlXFxjb21tb25cXG5hdGl2ZUhvc3RTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUHJveHlDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBJTWFpblByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaXBjL2NvbW1vbi9tYWluUHJvY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi9uYXRpdmUuanMnO1xuXG4vLyBAdHMtZXhwZWN0LWVycm9yOiBpbnRlcmZhY2UgaXMgaW1wbGVtZW50ZWQgdmlhIHByb3h5XG5leHBvcnQgY2xhc3MgTmF0aXZlSG9zdFNlcnZpY2UgaW1wbGVtZW50cyBJTmF0aXZlSG9zdFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHdpbmRvd0lkOiBudW1iZXIsXG5cdFx0QElNYWluUHJvY2Vzc1NlcnZpY2UgbWFpblByb2Nlc3NTZXJ2aWNlOiBJTWFpblByb2Nlc3NTZXJ2aWNlXG5cdCkge1xuXHRcdHJldHVybiBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElOYXRpdmVIb3N0U2VydmljZT4obWFpblByb2Nlc3NTZXJ2aWNlLmdldENoYW5uZWwoJ25hdGl2ZUhvc3QnKSwge1xuXHRcdFx0Y29udGV4dDogd2luZG93SWQsXG5cdFx0XHRwcm9wZXJ0aWVzOiAoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwcm9wZXJ0aWVzID0gbmV3IE1hcDxzdHJpbmcsIHVua25vd24+KCk7XG5cdFx0XHRcdHByb3BlcnRpZXMuc2V0KCd3aW5kb3dJZCcsIHdpbmRvd0lkKTtcblxuXHRcdFx0XHRyZXR1cm4gcHJvcGVydGllcztcblx0XHRcdH0pKClcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJCQUEyQjtBQUk3QixJQUFNLG9CQUFOLE1BQXNEO0FBQUEsRUFJNUQsWUFDVSxVQUNZLG9CQUNwQjtBQUZRO0FBR1QsV0FBTyxhQUFhLFVBQThCLG1CQUFtQixXQUFXLFlBQVksR0FBRztBQUFBLE1BQzlGLFNBQVM7QUFBQSxNQUNULGFBQWEsTUFBTTtBQUNsQixjQUFNLGFBQWEsb0JBQUksSUFBcUI7QUFDNUMsbUJBQVcsSUFBSSxZQUFZLFFBQVE7QUFFbkMsZUFBTztBQUFBLE1BQ1IsR0FBRztBQUFBLElBQ0osQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQWxCYSxvQkFBTjtBQUFBLEVBTUo7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
