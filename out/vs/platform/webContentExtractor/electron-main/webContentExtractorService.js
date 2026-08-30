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
import { BrowserWindow } from "electron";
import { Limiter } from "../../../base/common/async.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentNetworkFilterService } from "../../networkFilter/common/networkFilterService.js";
import { isURLDomainTrusted } from "../../url/common/trustedDomains.js";
import { WebContentCache } from "./webContentCache.js";
import { WebPageLoader } from "./webPageLoader.js";
let NativeWebContentExtractorService = class extends Disposable {
  constructor(_logger, _agentNetworkFilterService) {
    super();
    this._logger = _logger;
    this._agentNetworkFilterService = _agentNetworkFilterService;
    // Only allow 3 windows to be opened at a time
    // to avoid overwhelming the system with too many processes.
    this._limiter = new Limiter(3);
    this._webContentsCache = new WebContentCache();
    this._register(this._agentNetworkFilterService.onDidChange(() => this._webContentsCache.clear()));
  }
  extract(uris, options) {
    if (uris.length === 0) {
      this._logger.info("No URIs provided for extraction");
      return Promise.resolve([]);
    }
    this._logger.info(`Extracting content from ${uris.length} URIs`);
    return Promise.all(uris.map((uri) => this._limiter.queue(() => this.doExtract(uri, options))));
  }
  async doExtract(uri, options) {
    const cached = this._webContentsCache.tryGet(uri, options);
    if (cached !== void 0) {
      this._logger.info(`Found cached content for ${uri.toString()}`);
      return cached;
    }
    const loader = new WebPageLoader(
      (options2) => new BrowserWindow(options2),
      this._logger,
      uri,
      options,
      (uri2) => isURLDomainTrusted(uri2, options?.trustedDomains || []),
      this._agentNetworkFilterService
    );
    try {
      const result = await loader.load();
      this._webContentsCache.add(uri, options, result);
      return result;
    } finally {
      loader.dispose();
    }
  }
};
NativeWebContentExtractorService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IAgentNetworkFilterService)
], NativeWebContentExtractorService);
export {
  NativeWebContentExtractorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd2ViQ29udGVudEV4dHJhY3RvclxcZWxlY3Ryb24tbWFpblxcd2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCcm93c2VyV2luZG93IH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgTGltaXRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9uZXR3b3JrRmlsdGVyL2NvbW1vbi9uZXR3b3JrRmlsdGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1VSTERvbWFpblRydXN0ZWQgfSBmcm9tICcuLi8uLi91cmwvY29tbW9uL3RydXN0ZWREb21haW5zLmpzJztcbmltcG9ydCB7IElXZWJDb250ZW50RXh0cmFjdG9yT3B0aW9ucywgSVdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlLCBXZWJDb250ZW50RXh0cmFjdFJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IFdlYkNvbnRlbnRDYWNoZSB9IGZyb20gJy4vd2ViQ29udGVudENhY2hlLmpzJztcbmltcG9ydCB7IFdlYlBhZ2VMb2FkZXIgfSBmcm9tICcuL3dlYlBhZ2VMb2FkZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8vIE9ubHkgYWxsb3cgMyB3aW5kb3dzIHRvIGJlIG9wZW5lZCBhdCBhIHRpbWVcblx0Ly8gdG8gYXZvaWQgb3ZlcndoZWxtaW5nIHRoZSBzeXN0ZW0gd2l0aCB0b28gbWFueSBwcm9jZXNzZXMuXG5cdHByaXZhdGUgX2xpbWl0ZXIgPSBuZXcgTGltaXRlcjxXZWJDb250ZW50RXh0cmFjdFJlc3VsdD4oMyk7XG5cdHByaXZhdGUgX3dlYkNvbnRlbnRzQ2FjaGUgPSBuZXcgV2ViQ29udGVudENhY2hlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlcjogSUxvZ1NlcnZpY2UsXG5cdFx0QElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2U6IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fd2ViQ29udGVudHNDYWNoZS5jbGVhcigpKSk7XG5cdH1cblxuXHRleHRyYWN0KHVyaXM6IFVSSVtdLCBvcHRpb25zPzogSVdlYkNvbnRlbnRFeHRyYWN0b3JPcHRpb25zKTogUHJvbWlzZTxXZWJDb250ZW50RXh0cmFjdFJlc3VsdFtdPiB7XG5cdFx0aWYgKHVyaXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbygnTm8gVVJJcyBwcm92aWRlZCBmb3IgZXh0cmFjdGlvbicpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBFeHRyYWN0aW5nIGNvbnRlbnQgZnJvbSAke3VyaXMubGVuZ3RofSBVUklzYCk7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHVyaXMubWFwKCh1cmkpID0+IHRoaXMuX2xpbWl0ZXIucXVldWUoKCkgPT4gdGhpcy5kb0V4dHJhY3QodXJpLCBvcHRpb25zKSkpKTtcblx0fVxuXG5cdGFzeW5jIGRvRXh0cmFjdCh1cmk6IFVSSSwgb3B0aW9uczogSVdlYkNvbnRlbnRFeHRyYWN0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxXZWJDb250ZW50RXh0cmFjdFJlc3VsdD4ge1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3dlYkNvbnRlbnRzQ2FjaGUudHJ5R2V0KHVyaSwgb3B0aW9ucyk7XG5cdFx0aWYgKGNhY2hlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgRm91bmQgY2FjaGVkIGNvbnRlbnQgZm9yICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvYWRlciA9IG5ldyBXZWJQYWdlTG9hZGVyKFxuXHRcdFx0KG9wdGlvbnMpID0+IG5ldyBCcm93c2VyV2luZG93KG9wdGlvbnMpLFxuXHRcdFx0dGhpcy5fbG9nZ2VyLFxuXHRcdFx0dXJpLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdCh1cmkpID0+IGlzVVJMRG9tYWluVHJ1c3RlZCh1cmksIG9wdGlvbnM/LnRydXN0ZWREb21haW5zIHx8IFtdKSxcblx0XHRcdHRoaXMuX2FnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGxvYWRlci5sb2FkKCk7XG5cdFx0XHR0aGlzLl93ZWJDb250ZW50c0NhY2hlLmFkZCh1cmksIG9wdGlvbnMsIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRsb2FkZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFFdkIsSUFBTSxtQ0FBTixjQUErQyxXQUFrRDtBQUFBLEVBUXZHLFlBQytCLFNBQ2UsNEJBQzVDO0FBQ0QsVUFBTTtBQUh3QjtBQUNlO0FBTDlDO0FBQUE7QUFBQSxTQUFRLFdBQVcsSUFBSSxRQUFpQyxDQUFDO0FBQ3pELFNBQVEsb0JBQW9CLElBQUksZ0JBQWdCO0FBTy9DLFNBQUssVUFBVSxLQUFLLDJCQUEyQixZQUFZLE1BQU0sS0FBSyxrQkFBa0IsTUFBTSxDQUFDLENBQUM7QUFBQSxFQUNqRztBQUFBLEVBRUEsUUFBUSxNQUFhLFNBQTJFO0FBQy9GLFFBQUksS0FBSyxXQUFXLEdBQUc7QUFDdEIsV0FBSyxRQUFRLEtBQUssaUNBQWlDO0FBQ25ELGFBQU8sUUFBUSxRQUFRLENBQUMsQ0FBQztBQUFBLElBQzFCO0FBQ0EsU0FBSyxRQUFRLEtBQUssMkJBQTJCLEtBQUssTUFBTSxPQUFPO0FBQy9ELFdBQU8sUUFBUSxJQUFJLEtBQUssSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTLE1BQU0sTUFBTSxLQUFLLFVBQVUsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDOUY7QUFBQSxFQUVBLE1BQU0sVUFBVSxLQUFVLFNBQW9GO0FBQzdHLFVBQU0sU0FBUyxLQUFLLGtCQUFrQixPQUFPLEtBQUssT0FBTztBQUN6RCxRQUFJLFdBQVcsUUFBVztBQUN6QixXQUFLLFFBQVEsS0FBSyw0QkFBNEIsSUFBSSxTQUFTLENBQUMsRUFBRTtBQUM5RCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBUyxJQUFJO0FBQUEsTUFDbEIsQ0FBQ0EsYUFBWSxJQUFJLGNBQWNBLFFBQU87QUFBQSxNQUN0QyxLQUFLO0FBQUEsTUFDTDtBQUFBLE1BQ0E7QUFBQSxNQUNBLENBQUNDLFNBQVEsbUJBQW1CQSxNQUFLLFNBQVMsa0JBQWtCLENBQUMsQ0FBQztBQUFBLE1BQzlELEtBQUs7QUFBQSxJQUEwQjtBQUVoQyxRQUFJO0FBQ0gsWUFBTSxTQUFTLE1BQU0sT0FBTyxLQUFLO0FBQ2pDLFdBQUssa0JBQWtCLElBQUksS0FBSyxTQUFTLE1BQU07QUFDL0MsYUFBTztBQUFBLElBQ1IsVUFBRTtBQUNELGFBQU8sUUFBUTtBQUFBLElBQ2hCO0FBQUEsRUFDRDtBQUNEO0FBaERhLG1DQUFOO0FBQUEsRUFTSjtBQUFBLEVBQ0E7QUFBQSxHQVZVOyIsCiAgIm5hbWVzIjogWyJvcHRpb25zIiwgInVyaSJdCn0K
