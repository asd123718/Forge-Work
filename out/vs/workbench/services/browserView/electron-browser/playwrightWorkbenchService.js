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
import { mainWindow } from "../../../../base/browser/window.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { IPlaywrightService } from "../../../../platform/browserView/common/playwrightService.js";
import { registerSharedProcessRemoteService } from "../../../../platform/ipc/electron-browser/services.js";
import { ILogService } from "../../../../platform/log/common/log.js";
let PlaywrightChannelClient = class {
  constructor(channel, logService) {
    void channel.call("__initialize", mainWindow.vscodeWindowId).catch((e) => {
      logService.error(`Failed to initialize Playwright service`, e);
    });
    return ProxyChannel.toService(channel);
  }
};
PlaywrightChannelClient = __decorateClass([
  __decorateParam(1, ILogService)
], PlaywrightChannelClient);
registerSharedProcessRemoteService(IPlaywrightService, "playwright", { channelClientCtor: PlaywrightChannelClient });
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxicm93c2VyVmlld1xcZWxlY3Ryb24tYnJvd3NlclxccGxheXdyaWdodFdvcmtiZW5jaFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQ2hhbm5lbCwgUHJveHlDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBJUGxheXdyaWdodFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vcGxheXdyaWdodFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJTaGFyZWRQcm9jZXNzUmVtb3RlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2lwYy9lbGVjdHJvbi1icm93c2VyL3NlcnZpY2VzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5jbGFzcyBQbGF5d3JpZ2h0Q2hhbm5lbENsaWVudCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNoYW5uZWw6IElDaGFubmVsLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHQvKipcblx0XHQgKiBzZW5kIHRoZSBjdXJyZW50IHdpbmRvdydzIElEIG9uY2UgdmlhIGBfX2luaXRpYWxpemVgLCBzbyB0aGUgc2VydmVyLXNpZGUge0BsaW5rIFBsYXl3cmlnaHRDaGFubmVsfVxuXHRcdCAqIGNhbiBjcmVhdGUgYSBwZXItd2luZG93IHtAbGluayBQbGF5d3JpZ2h0V2luZG93SW5zdGFuY2V9LiBBbGwgc3Vic2VxdWVudCBjYWxscyBhbmQgZXZlbnRzIGFyZSBwcm94aWVkIGRpcmVjdGx5LlxuXHRcdCAqL1xuXHRcdHZvaWQgY2hhbm5lbC5jYWxsKCdfX2luaXRpYWxpemUnLCBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkKS5jYXRjaCgoZSkgPT4ge1xuXHRcdFx0bG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIGluaXRpYWxpemUgUGxheXdyaWdodCBzZXJ2aWNlYCwgZSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIFByb3h5Q2hhbm5lbC50b1NlcnZpY2U8SVBsYXl3cmlnaHRTZXJ2aWNlPihjaGFubmVsKTtcblx0fVxufVxuXG5yZWdpc3RlclNoYXJlZFByb2Nlc3NSZW1vdGVTZXJ2aWNlKElQbGF5d3JpZ2h0U2VydmljZSwgJ3BsYXl3cmlnaHQnLCB7IGNoYW5uZWxDbGllbnRDdG9yOiBQbGF5d3JpZ2h0Q2hhbm5lbENsaWVudCB9KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBbUIsb0JBQW9CO0FBQ3ZDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsbUJBQW1CO0FBRTVCLElBQU0sMEJBQU4sTUFBOEI7QUFBQSxFQUM3QixZQUNDLFNBQ2EsWUFDWjtBQUtELFNBQUssUUFBUSxLQUFLLGdCQUFnQixXQUFXLGNBQWMsRUFBRSxNQUFNLENBQUMsTUFBTTtBQUN6RSxpQkFBVyxNQUFNLDJDQUEyQyxDQUFDO0FBQUEsSUFDOUQsQ0FBQztBQUNELFdBQU8sYUFBYSxVQUE4QixPQUFPO0FBQUEsRUFDMUQ7QUFDRDtBQWRNLDBCQUFOO0FBQUEsRUFHRztBQUFBLEdBSEc7QUFnQk4sbUNBQW1DLG9CQUFvQixjQUFjLEVBQUUsbUJBQW1CLHdCQUF3QixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
