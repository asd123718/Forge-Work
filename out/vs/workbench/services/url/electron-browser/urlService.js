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
import { IURLService } from "../../../../platform/url/common/url.js";
import { URI } from "../../../../base/common/uri.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { URLHandlerChannel } from "../../../../platform/url/common/urlIpc.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { matchesScheme } from "../../../../base/common/network.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { FocusMode, INativeHostService } from "../../../../platform/native/common/native.js";
import { NativeURLService } from "../../../../platform/url/common/urlService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
let RelayURLService = class extends NativeURLService {
  constructor(mainProcessService, openerService, nativeHostService, productService, logService) {
    super(productService);
    this.nativeHostService = nativeHostService;
    this.logService = logService;
    this.urlService = ProxyChannel.toService(mainProcessService.getChannel("url"));
    mainProcessService.registerChannel("urlHandler", new URLHandlerChannel(this));
    openerService.registerOpener(this);
  }
  create(options) {
    const uri = super.create(options);
    let query = uri.query;
    if (!query) {
      query = `windowId=${encodeURIComponent(this.nativeHostService.windowId)}`;
    } else {
      query += `&windowId=${encodeURIComponent(this.nativeHostService.windowId)}`;
    }
    return uri.with({ query });
  }
  async open(resource, options) {
    if (!matchesScheme(resource, this.productService.urlProtocol)) {
      return false;
    }
    if (typeof resource === "string") {
      resource = URI.parse(resource);
    }
    return await this.urlService.open(resource, options);
  }
  async handleURL(uri, options) {
    const result = await super.open(uri, options);
    if (result) {
      this.logService.trace("URLService#handleURL(): handled", uri.toString(true));
      await this.nativeHostService.focusWindow({ mode: FocusMode.Force, targetWindowId: this.nativeHostService.windowId });
    } else {
      this.logService.trace("URLService#handleURL(): not handled", uri.toString(true));
    }
    return result;
  }
};
RelayURLService = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, IOpenerService),
  __decorateParam(2, INativeHostService),
  __decorateParam(3, IProductService),
  __decorateParam(4, ILogService)
], RelayURLService);
registerSingleton(IURLService, RelayURLService, InstantiationType.Eager);
export {
  RelayURLService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx1cmxcXGVsZWN0cm9uLWJyb3dzZXJcXHVybFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJVVJMU2VydmljZSwgSVVSTEhhbmRsZXIsIElPcGVuVVJMT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTWFpblByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaXBjL2NvbW1vbi9tYWluUHJvY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJMSGFuZGxlckNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybElwYy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSwgSU9wZW5lciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IG1hdGNoZXNTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUHJveHlDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBGb2N1c01vZGUsIElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IE5hdGl2ZVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbGF5T3BlblVSTE9wdGlvbnMgZXh0ZW5kcyBJT3BlblVSTE9wdGlvbnMge1xuXHRvcGVuVG9TaWRlPzogYm9vbGVhbjtcblx0b3BlbkV4dGVybmFsPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFJlbGF5VVJMU2VydmljZSBleHRlbmRzIE5hdGl2ZVVSTFNlcnZpY2UgaW1wbGVtZW50cyBJVVJMSGFuZGxlciwgSU9wZW5lciB7XG5cblx0cHJpdmF0ZSB1cmxTZXJ2aWNlOiBJVVJMU2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1haW5Qcm9jZXNzU2VydmljZSBtYWluUHJvY2Vzc1NlcnZpY2U6IElNYWluUHJvY2Vzc1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihwcm9kdWN0U2VydmljZSk7XG5cblx0XHR0aGlzLnVybFNlcnZpY2UgPSBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElVUkxTZXJ2aWNlPihtYWluUHJvY2Vzc1NlcnZpY2UuZ2V0Q2hhbm5lbCgndXJsJykpO1xuXG5cdFx0bWFpblByb2Nlc3NTZXJ2aWNlLnJlZ2lzdGVyQ2hhbm5lbCgndXJsSGFuZGxlcicsIG5ldyBVUkxIYW5kbGVyQ2hhbm5lbCh0aGlzKSk7XG5cdFx0b3BlbmVyU2VydmljZS5yZWdpc3Rlck9wZW5lcih0aGlzKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZShvcHRpb25zPzogUGFydGlhbDxVcmlDb21wb25lbnRzPik6IFVSSSB7XG5cdFx0Y29uc3QgdXJpID0gc3VwZXIuY3JlYXRlKG9wdGlvbnMpO1xuXG5cdFx0bGV0IHF1ZXJ5ID0gdXJpLnF1ZXJ5O1xuXHRcdGlmICghcXVlcnkpIHtcblx0XHRcdHF1ZXJ5ID0gYHdpbmRvd0lkPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uud2luZG93SWQpfWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHF1ZXJ5ICs9IGAmd2luZG93SWQ9JHtlbmNvZGVVUklDb21wb25lbnQodGhpcy5uYXRpdmVIb3N0U2VydmljZS53aW5kb3dJZCl9YDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdXJpLndpdGgoeyBxdWVyeSB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIG9wZW4ocmVzb3VyY2U6IFVSSSB8IHN0cmluZywgb3B0aW9ucz86IElSZWxheU9wZW5VUkxPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHRpZiAoIW1hdGNoZXNTY2hlbWUocmVzb3VyY2UsIHRoaXMucHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiByZXNvdXJjZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJlc291cmNlID0gVVJJLnBhcnNlKHJlc291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMudXJsU2VydmljZS5vcGVuKHJlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZVVSTCh1cmk6IFVSSSwgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN1cGVyLm9wZW4odXJpLCBvcHRpb25zKTtcblxuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnVVJMU2VydmljZSNoYW5kbGVVUkwoKTogaGFuZGxlZCcsIHVyaS50b1N0cmluZyh0cnVlKSk7XG5cblx0XHRcdGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2UuZm9jdXNXaW5kb3coeyBtb2RlOiBGb2N1c01vZGUuRm9yY2UgLyogQXBwbGljYXRpb24gbWF5IG5vdCBiZSBhY3RpdmUgKi8sIHRhcmdldFdpbmRvd0lkOiB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLndpbmRvd0lkIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1VSTFNlcnZpY2UjaGFuZGxlVVJMKCk6IG5vdCBoYW5kbGVkJywgdXJpLnRvU3RyaW5nKHRydWUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElVUkxTZXJ2aWNlLCBSZWxheVVSTFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBaUQ7QUFDMUQsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUErQjtBQUN4QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUFXLDBCQUEwQjtBQUM5QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1CQUFtQjtBQU9yQixJQUFNLGtCQUFOLGNBQThCLGlCQUFpRDtBQUFBLEVBSXJGLFlBQ3NCLG9CQUNMLGVBQ3FCLG1CQUNwQixnQkFDYSxZQUM3QjtBQUNELFVBQU0sY0FBYztBQUppQjtBQUVQO0FBSTlCLFNBQUssYUFBYSxhQUFhLFVBQXVCLG1CQUFtQixXQUFXLEtBQUssQ0FBQztBQUUxRix1QkFBbUIsZ0JBQWdCLGNBQWMsSUFBSSxrQkFBa0IsSUFBSSxDQUFDO0FBQzVFLGtCQUFjLGVBQWUsSUFBSTtBQUFBLEVBQ2xDO0FBQUEsRUFFUyxPQUFPLFNBQXVDO0FBQ3RELFVBQU0sTUFBTSxNQUFNLE9BQU8sT0FBTztBQUVoQyxRQUFJLFFBQVEsSUFBSTtBQUNoQixRQUFJLENBQUMsT0FBTztBQUNYLGNBQVEsWUFBWSxtQkFBbUIsS0FBSyxrQkFBa0IsUUFBUSxDQUFDO0FBQUEsSUFDeEUsT0FBTztBQUNOLGVBQVMsYUFBYSxtQkFBbUIsS0FBSyxrQkFBa0IsUUFBUSxDQUFDO0FBQUEsSUFDMUU7QUFFQSxXQUFPLElBQUksS0FBSyxFQUFFLE1BQU0sQ0FBQztBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFlLEtBQUssVUFBd0IsU0FBa0Q7QUFFN0YsUUFBSSxDQUFDLGNBQWMsVUFBVSxLQUFLLGVBQWUsV0FBVyxHQUFHO0FBQzlELGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxPQUFPLGFBQWEsVUFBVTtBQUNqQyxpQkFBVyxJQUFJLE1BQU0sUUFBUTtBQUFBLElBQzlCO0FBQ0EsV0FBTyxNQUFNLEtBQUssV0FBVyxLQUFLLFVBQVUsT0FBTztBQUFBLEVBQ3BEO0FBQUEsRUFFQSxNQUFNLFVBQVUsS0FBVSxTQUE2QztBQUN0RSxVQUFNLFNBQVMsTUFBTSxNQUFNLEtBQUssS0FBSyxPQUFPO0FBRTVDLFFBQUksUUFBUTtBQUNYLFdBQUssV0FBVyxNQUFNLG1DQUFtQyxJQUFJLFNBQVMsSUFBSSxDQUFDO0FBRTNFLFlBQU0sS0FBSyxrQkFBa0IsWUFBWSxFQUFFLE1BQU0sVUFBVSxPQUEyQyxnQkFBZ0IsS0FBSyxrQkFBa0IsU0FBUyxDQUFDO0FBQUEsSUFDeEosT0FBTztBQUNOLFdBQUssV0FBVyxNQUFNLHVDQUF1QyxJQUFJLFNBQVMsSUFBSSxDQUFDO0FBQUEsSUFDaEY7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBekRhLGtCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVO0FBMkRiLGtCQUFrQixhQUFhLGlCQUFpQixrQkFBa0IsS0FBSzsiLAogICJuYW1lcyI6IFtdCn0K
