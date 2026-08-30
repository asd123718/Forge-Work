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
import { localize } from "../../../nls.js";
import { ILoggerService } from "../../../platform/log/common/log.js";
import { LogService } from "../../../platform/log/common/logService.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
let ExtHostLogService = class extends LogService {
  constructor(isWorker, loggerService, initData) {
    const id = initData.remote.isRemote ? "remoteexthost" : isWorker ? "workerexthost" : "exthost";
    const name = initData.remote.isRemote ? localize("remote", "Extension Host (Remote)") : isWorker ? localize("worker", "Extension Host (Worker)") : localize("local", "Extension Host");
    super(loggerService.createLogger(id, { name }));
  }
};
ExtHostLogService = __decorateClass([
  __decorateParam(1, ILoggerService),
  __decorateParam(2, IExtHostInitDataService)
], ExtHostLogService);
export {
  ExtHostLogService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0TG9nU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0TG9nU2VydmljZSBleHRlbmRzIExvZ1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlzV29ya2VyOiBib29sZWFuLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgaW5pdERhdGE6IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBpZCA9IGluaXREYXRhLnJlbW90ZS5pc1JlbW90ZSA/ICdyZW1vdGVleHRob3N0JyA6IGlzV29ya2VyID8gJ3dvcmtlcmV4dGhvc3QnIDogJ2V4dGhvc3QnO1xuXHRcdGNvbnN0IG5hbWUgPSBpbml0RGF0YS5yZW1vdGUuaXNSZW1vdGUgPyBsb2NhbGl6ZSgncmVtb3RlJywgXCJFeHRlbnNpb24gSG9zdCAoUmVtb3RlKVwiKSA6IGlzV29ya2VyID8gbG9jYWxpemUoJ3dvcmtlcicsIFwiRXh0ZW5zaW9uIEhvc3QgKFdvcmtlcilcIikgOiBsb2NhbGl6ZSgnbG9jYWwnLCBcIkV4dGVuc2lvbiBIb3N0XCIpO1xuXHRcdHN1cGVyKGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKGlkLCB7IG5hbWUgfSkpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywrQkFBK0I7QUFFakMsSUFBTSxvQkFBTixjQUFnQyxXQUFXO0FBQUEsRUFJakQsWUFDQyxVQUNnQixlQUNTLFVBQ3hCO0FBQ0QsVUFBTSxLQUFLLFNBQVMsT0FBTyxXQUFXLGtCQUFrQixXQUFXLGtCQUFrQjtBQUNyRixVQUFNLE9BQU8sU0FBUyxPQUFPLFdBQVcsU0FBUyxVQUFVLHlCQUF5QixJQUFJLFdBQVcsU0FBUyxVQUFVLHlCQUF5QixJQUFJLFNBQVMsU0FBUyxnQkFBZ0I7QUFDckwsVUFBTSxjQUFjLGFBQWEsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDL0M7QUFFRDtBQWRhLG9CQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
