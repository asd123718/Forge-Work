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
import { protocol } from "electron";
import { COI, FileAccess, Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { IFileService } from "../../files/common/files.js";
let WebviewProtocolProvider = class {
  constructor(_fileService) {
    this._fileService = _fileService;
    const webviewHandler = this.handleWebviewRequest.bind(this);
    protocol.handle(Schemas.vscodeWebview, webviewHandler);
  }
  dispose() {
    protocol.unhandle(Schemas.vscodeWebview);
  }
  async handleWebviewRequest(request) {
    try {
      const uri = URI.parse(request.url);
      const entry = WebviewProtocolProvider.validWebviewFilePaths.get(uri.path);
      if (entry) {
        const relativeResourcePath = `vs/workbench/contrib/webview/browser/pre${uri.path}`;
        const url = FileAccess.asFileUri(relativeResourcePath);
        const content = await this._fileService.readFile(url);
        return new Response(content.value.buffer, {
          headers: {
            "Content-Type": entry.mime,
            ...COI.getHeadersFromQuery(request.url),
            "Cross-Origin-Resource-Policy": "cross-origin"
          }
        });
      } else {
        return new Response(null, { status: 403 });
      }
    } catch {
    }
    return new Response(null, { status: 500 });
  }
};
WebviewProtocolProvider.validWebviewFilePaths = /* @__PURE__ */ new Map([
  ["/index.html", { mime: "text/html" }],
  ["/fake.html", { mime: "text/html" }],
  ["/service-worker.js", { mime: "application/javascript" }]
]);
WebviewProtocolProvider = __decorateClass([
  __decorateParam(0, IFileService)
], WebviewProtocolProvider);
export {
  WebviewProtocolProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd2Vidmlld1xcZWxlY3Ryb24tbWFpblxcd2Vidmlld1Byb3RvY29sUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBwcm90b2NvbCB9IGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFwcFJlc291cmNlUGF0aCwgQ09JLCBGaWxlQWNjZXNzLCBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcblxuXG5leHBvcnQgY2xhc3MgV2Vidmlld1Byb3RvY29sUHJvdmlkZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgdmFsaWRXZWJ2aWV3RmlsZVBhdGhzID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVhZG9ubHkgbWltZTogc3RyaW5nIH0+KFtcblx0XHRbJy9pbmRleC5odG1sJywgeyBtaW1lOiAndGV4dC9odG1sJyB9XSxcblx0XHRbJy9mYWtlLmh0bWwnLCB7IG1pbWU6ICd0ZXh0L2h0bWwnIH1dLFxuXHRcdFsnL3NlcnZpY2Utd29ya2VyLmpzJywgeyBtaW1lOiAnYXBwbGljYXRpb24vamF2YXNjcmlwdCcgfV0sXG5cdF0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZVxuXHQpIHtcblx0XHQvLyBSZWdpc3RlciB0aGUgcHJvdG9jb2wgZm9yIGxvYWRpbmcgd2VidmlldyBodG1sXG5cdFx0Y29uc3Qgd2Vidmlld0hhbmRsZXIgPSB0aGlzLmhhbmRsZVdlYnZpZXdSZXF1ZXN0LmJpbmQodGhpcyk7XG5cdFx0cHJvdG9jb2wuaGFuZGxlKFNjaGVtYXMudnNjb2RlV2Vidmlldywgd2Vidmlld0hhbmRsZXIpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRwcm90b2NvbC51bmhhbmRsZShTY2hlbWFzLnZzY29kZVdlYnZpZXcpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVXZWJ2aWV3UmVxdWVzdChyZXF1ZXN0OiBHbG9iYWxSZXF1ZXN0KTogUHJvbWlzZTxHbG9iYWxSZXNwb25zZT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UocmVxdWVzdC51cmwpO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBXZWJ2aWV3UHJvdG9jb2xQcm92aWRlci52YWxpZFdlYnZpZXdGaWxlUGF0aHMuZ2V0KHVyaS5wYXRoKTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRjb25zdCByZWxhdGl2ZVJlc291cmNlUGF0aDogQXBwUmVzb3VyY2VQYXRoID0gYHZzL3dvcmtiZW5jaC9jb250cmliL3dlYnZpZXcvYnJvd3Nlci9wcmUke3VyaS5wYXRofWA7XG5cdFx0XHRcdGNvbnN0IHVybCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKHJlbGF0aXZlUmVzb3VyY2VQYXRoKTtcblxuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUodXJsKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZShjb250ZW50LnZhbHVlLmJ1ZmZlciBhcyBBcnJheUJ1ZmZlclZpZXc8QXJyYXlCdWZmZXI+LCB7XG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6IGVudHJ5Lm1pbWUsXG5cdFx0XHRcdFx0XHQuLi5DT0kuZ2V0SGVhZGVyc0Zyb21RdWVyeShyZXF1ZXN0LnVybCksXG5cdFx0XHRcdFx0XHQnQ3Jvc3MtT3JpZ2luLVJlc291cmNlLVBvbGljeSc6ICdjcm9zcy1vcmlnaW4nLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJlc3BvbnNlKG51bGwsIHsgc3RhdHVzOiA0MDMgfSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBub29wXG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmVzcG9uc2UobnVsbCwgeyBzdGF0dXM6IDUwMCB9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUEwQixLQUFLLFlBQVksZUFBZTtBQUMxRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFHdEIsSUFBTSwwQkFBTixNQUFxRDtBQUFBLEVBUTNELFlBQ2dDLGNBQzlCO0FBRDhCO0FBRy9CLFVBQU0saUJBQWlCLEtBQUsscUJBQXFCLEtBQUssSUFBSTtBQUMxRCxhQUFTLE9BQU8sUUFBUSxlQUFlLGNBQWM7QUFBQSxFQUN0RDtBQUFBLEVBRUEsVUFBZ0I7QUFDZixhQUFTLFNBQVMsUUFBUSxhQUFhO0FBQUEsRUFDeEM7QUFBQSxFQUVBLE1BQWMscUJBQXFCLFNBQWlEO0FBQ25GLFFBQUk7QUFDSCxZQUFNLE1BQU0sSUFBSSxNQUFNLFFBQVEsR0FBRztBQUNqQyxZQUFNLFFBQVEsd0JBQXdCLHNCQUFzQixJQUFJLElBQUksSUFBSTtBQUN4RSxVQUFJLE9BQU87QUFDVixjQUFNLHVCQUF3QywyQ0FBMkMsSUFBSSxJQUFJO0FBQ2pHLGNBQU0sTUFBTSxXQUFXLFVBQVUsb0JBQW9CO0FBRXJELGNBQU0sVUFBVSxNQUFNLEtBQUssYUFBYSxTQUFTLEdBQUc7QUFDcEQsZUFBTyxJQUFJLFNBQVMsUUFBUSxNQUFNLFFBQXdDO0FBQUEsVUFDekUsU0FBUztBQUFBLFlBQ1IsZ0JBQWdCLE1BQU07QUFBQSxZQUN0QixHQUFHLElBQUksb0JBQW9CLFFBQVEsR0FBRztBQUFBLFlBQ3RDLGdDQUFnQztBQUFBLFVBQ2pDO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRixPQUFPO0FBQ04sZUFBTyxJQUFJLFNBQVMsTUFBTSxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsTUFDMUM7QUFBQSxJQUNELFFBQVE7QUFBQSxJQUVSO0FBQ0EsV0FBTyxJQUFJLFNBQVMsTUFBTSxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsRUFDMUM7QUFDRDtBQTVDYSx3QkFFRyx3QkFBd0Isb0JBQUksSUFBdUM7QUFBQSxFQUNqRixDQUFDLGVBQWUsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUFBLEVBQ3JDLENBQUMsY0FBYyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQUEsRUFDcEMsQ0FBQyxzQkFBc0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzFELENBQUM7QUFOVywwQkFBTjtBQUFBLEVBU0o7QUFBQSxHQVRVOyIsCiAgIm5hbWVzIjogW10KfQo=
