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
import { AbstractExtHostConsoleForwarder } from "../common/extHostConsoleForwarder.js";
import { IExtHostInitDataService } from "../common/extHostInitDataService.js";
import { IExtHostRpcService } from "../common/extHostRpcService.js";
let ExtHostConsoleForwarder = class extends AbstractExtHostConsoleForwarder {
  constructor(extHostRpc, initData) {
    super(extHostRpc, initData);
  }
  _nativeConsoleLogMessage(_method, original, args) {
    original.apply(console, args);
  }
};
ExtHostConsoleForwarder = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService)
], ExtHostConsoleForwarder);
export {
  ExtHostConsoleForwarder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcd29ya2VyXFxleHRIb3N0Q29uc29sZUZvcndhcmRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFic3RyYWN0RXh0SG9zdENvbnNvbGVGb3J3YXJkZXIgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdENvbnNvbGVGb3J3YXJkZXIuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0SG9zdENvbnNvbGVGb3J3YXJkZXIgZXh0ZW5kcyBBYnN0cmFjdEV4dEhvc3RDb25zb2xlRm9yd2FyZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIGV4dEhvc3RScGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgaW5pdERhdGE6IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihleHRIb3N0UnBjLCBpbml0RGF0YSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX25hdGl2ZUNvbnNvbGVMb2dNZXNzYWdlKF9tZXRob2Q6IHVua25vd24sIG9yaWdpbmFsOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkLCBhcmdzOiB1bmtub3duW10pIHtcblx0XHRvcmlnaW5hbC5hcHBseShjb25zb2xlLCBhcmdzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDBCQUEwQjtBQUU1QixJQUFNLDBCQUFOLGNBQXNDLGdDQUFnQztBQUFBLEVBRTVFLFlBQ3FCLFlBQ0ssVUFDeEI7QUFDRCxVQUFNLFlBQVksUUFBUTtBQUFBLEVBQzNCO0FBQUEsRUFFbUIseUJBQXlCLFNBQWtCLFVBQXdDLE1BQWlCO0FBQ3RILGFBQVMsTUFBTSxTQUFTLElBQUk7QUFBQSxFQUM3QjtBQUNEO0FBWmEsMEJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
