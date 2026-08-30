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
import { Disposable } from "../../../base/common/lifecycle.js";
import { MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IDownloadService } from "../../../platform/download/common/download.js";
import { URI } from "../../../base/common/uri.js";
let MainThreadDownloadService = class extends Disposable {
  constructor(extHostContext, downloadService) {
    super();
    this.downloadService = downloadService;
  }
  $download(uri, to) {
    return this.downloadService.download(URI.revive(uri), URI.revive(to), "mainThreadDownloadService.download");
  }
};
MainThreadDownloadService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadDownloadService),
  __decorateParam(1, IDownloadService)
], MainThreadDownloadService);
export {
  MainThreadDownloadService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZERvd25sb2FkU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWREb3dubG9hZFNlcnZpY2VTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IElEb3dubG9hZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kb3dubG9hZC9jb21tb24vZG93bmxvYWQuanMnO1xuaW1wb3J0IHsgVXJpQ29tcG9uZW50cywgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWREb3dubG9hZFNlcnZpY2UpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZERvd25sb2FkU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkRG93bmxvYWRTZXJ2aWNlU2hhcGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElEb3dubG9hZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkb3dubG9hZFNlcnZpY2U6IElEb3dubG9hZFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdCRkb3dubG9hZCh1cmk6IFVyaUNvbXBvbmVudHMsIHRvOiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG93bmxvYWRTZXJ2aWNlLmRvd25sb2FkKFVSSS5yZXZpdmUodXJpKSwgVVJJLnJldml2ZSh0byksICdtYWluVGhyZWFkRG93bmxvYWRTZXJ2aWNlLmRvd25sb2FkJyk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtRDtBQUM1RCxTQUFTLDRCQUE2QztBQUN0RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUF3QixXQUFXO0FBRzVCLElBQU0sNEJBQU4sY0FBd0MsV0FBcUQ7QUFBQSxFQUVuRyxZQUNDLGdCQUNtQyxpQkFDbEM7QUFDRCxVQUFNO0FBRjZCO0FBQUEsRUFHcEM7QUFBQSxFQUVBLFVBQVUsS0FBb0IsSUFBa0M7QUFDL0QsV0FBTyxLQUFLLGdCQUFnQixTQUFTLElBQUksT0FBTyxHQUFHLEdBQUcsSUFBSSxPQUFPLEVBQUUsR0FBRyxvQ0FBb0M7QUFBQSxFQUMzRztBQUVEO0FBYmEsNEJBQU47QUFBQSxFQUROLHFCQUFxQixZQUFZLHlCQUF5QjtBQUFBLEVBS3hEO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
