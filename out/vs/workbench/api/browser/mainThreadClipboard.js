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
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainContext } from "../common/extHost.protocol.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { ILogService } from "../../../platform/log/common/log.js";
let MainThreadClipboard = class {
  constructor(_context, _clipboardService, _logService) {
    this._clipboardService = _clipboardService;
    this._logService = _logService;
  }
  dispose() {
  }
  $readText() {
    this._logService.trace("MainThreadClipboard#readText");
    const readText = this._clipboardService.readText();
    return readText;
  }
  $writeText(value) {
    this._logService.trace("MainThreadClipboard#writeText with text.length : ", value.length);
    return this._clipboardService.writeText(value);
  }
};
MainThreadClipboard = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadClipboard),
  __decorateParam(1, IClipboardService),
  __decorateParam(2, ILogService)
], MainThreadClipboard);
export {
  MainThreadClipboard
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZENsaXBib2FyZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IE1haW5Db250ZXh0LCBNYWluVGhyZWFkQ2xpcGJvYXJkU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRDbGlwYm9hcmQpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZENsaXBib2FyZCBpbXBsZW1lbnRzIE1haW5UaHJlYWRDbGlwYm9hcmRTaGFwZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0X2NvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBub3RoaW5nXG5cdH1cblxuXHQkcmVhZFRleHQoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdNYWluVGhyZWFkQ2xpcGJvYXJkI3JlYWRUZXh0Jyk7XG5cdFx0Y29uc3QgcmVhZFRleHQgPSB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLnJlYWRUZXh0KCk7XG5cdFx0cmV0dXJuIHJlYWRUZXh0O1xuXHR9XG5cblx0JHdyaXRlVGV4dCh2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnTWFpblRocmVhZENsaXBib2FyZCN3cml0ZVRleHQgd2l0aCB0ZXh0Lmxlbmd0aCA6ICcsIHZhbHVlLmxlbmd0aCk7XG5cdFx0cmV0dXJuIHRoaXMuX2NsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHZhbHVlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDRCQUE2QztBQUN0RCxTQUFTLG1CQUE2QztBQUN0RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUdyQixJQUFNLHNCQUFOLE1BQThEO0FBQUEsRUFFcEUsWUFDQyxVQUNvQyxtQkFDTixhQUM3QjtBQUZtQztBQUNOO0FBQUEsRUFDM0I7QUFBQSxFQUVKLFVBQWdCO0FBQUEsRUFFaEI7QUFBQSxFQUVBLFlBQTZCO0FBQzVCLFNBQUssWUFBWSxNQUFNLDhCQUE4QjtBQUNyRCxVQUFNLFdBQVcsS0FBSyxrQkFBa0IsU0FBUztBQUNqRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsV0FBVyxPQUE4QjtBQUN4QyxTQUFLLFlBQVksTUFBTSxxREFBcUQsTUFBTSxNQUFNO0FBQ3hGLFdBQU8sS0FBSyxrQkFBa0IsVUFBVSxLQUFLO0FBQUEsRUFDOUM7QUFDRDtBQXRCYSxzQkFBTjtBQUFBLEVBRE4scUJBQXFCLFlBQVksbUJBQW1CO0FBQUEsRUFLbEQ7QUFBQSxFQUNBO0FBQUEsR0FMVTsiLAogICJuYW1lcyI6IFtdCn0K
