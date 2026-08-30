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
import { join } from "../../../base/common/path.js";
import { tmpdir } from "os";
import { generateUuid } from "../../../base/common/uuid.js";
import { IExtHostCommands } from "../common/extHostCommands.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { MainContext } from "../common/extHost.protocol.js";
import { URI } from "../../../base/common/uri.js";
import { IExtHostRpcService } from "../common/extHostRpcService.js";
let ExtHostDownloadService = class extends Disposable {
  constructor(extHostRpc, commands) {
    super();
    const proxy = extHostRpc.getProxy(MainContext.MainThreadDownloadService);
    commands.registerCommand(false, "_workbench.downloadResource", async (resource) => {
      const location = URI.file(join(tmpdir(), generateUuid()));
      await proxy.$download(resource, location);
      return location;
    });
  }
};
ExtHostDownloadService = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostCommands)
], ExtHostDownloadService);
export {
  ExtHostDownloadService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcbm9kZVxcZXh0SG9zdERvd25sb2FkU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYWluQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0SG9zdERvd25sb2FkU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdENvbW1hbmRzIGNvbW1hbmRzOiBJRXh0SG9zdENvbW1hbmRzXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBwcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZERvd25sb2FkU2VydmljZSk7XG5cblx0XHRjb21tYW5kcy5yZWdpc3RlckNvbW1hbmQoZmFsc2UsICdfd29ya2JlbmNoLmRvd25sb2FkUmVzb3VyY2UnLCBhc3luYyAocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8YW55PiA9PiB7XG5cdFx0XHRjb25zdCBsb2NhdGlvbiA9IFVSSS5maWxlKGpvaW4odG1wZGlyKCksIGdlbmVyYXRlVXVpZCgpKSk7XG5cdFx0XHRhd2FpdCBwcm94eS4kZG93bmxvYWQocmVzb3VyY2UsIGxvY2F0aW9uKTtcblx0XHRcdHJldHVybiBsb2NhdGlvbjtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVk7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUU1QixJQUFNLHlCQUFOLGNBQXFDLFdBQVc7QUFBQSxFQUV0RCxZQUNxQixZQUNGLFVBQ2pCO0FBQ0QsVUFBTTtBQUVOLFVBQU0sUUFBUSxXQUFXLFNBQVMsWUFBWSx5QkFBeUI7QUFFdkUsYUFBUyxnQkFBZ0IsT0FBTywrQkFBK0IsT0FBTyxhQUFnQztBQUNyRyxZQUFNLFdBQVcsSUFBSSxLQUFLLEtBQUssT0FBTyxHQUFHLGFBQWEsQ0FBQyxDQUFDO0FBQ3hELFlBQU0sTUFBTSxVQUFVLFVBQVUsUUFBUTtBQUN4QyxhQUFPO0FBQUEsSUFDUixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBaEJhLHlCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
