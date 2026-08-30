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
import { timeout } from "../../../../base/common/async.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IDebugService } from "../../debug/common/debug.js";
import { McpDevModeDebugging } from "../common/mcpDevMode.js";
let McpDevModeDebuggingNode = class extends McpDevModeDebugging {
  constructor(debugService, commandService, _nativeHostService) {
    super(debugService, commandService);
    this._nativeHostService = _nativeHostService;
  }
  async ensureListeningOnPort(port) {
    const deadline = Date.now() + 3e4;
    while (await this._nativeHostService.isPortFree(port) && Date.now() < deadline) {
      await timeout(50);
    }
  }
  getDebugPort() {
    return this._nativeHostService.findFreePort(
      5e3,
      10,
      5e3,
      2048
      /* skip 2048 ports between attempts */
    );
  }
};
McpDevModeDebuggingNode = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, INativeHostService)
], McpDevModeDebuggingNode);
export {
  McpDevModeDebuggingNode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcZWxlY3Ryb24tYnJvd3NlclxcbWNwRGV2TW9kZURlYnVnZ2luZ05vZGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgTWNwRGV2TW9kZURlYnVnZ2luZyB9IGZyb20gJy4uL2NvbW1vbi9tY3BEZXZNb2RlLmpzJztcblxuZXhwb3J0IGNsYXNzIE1jcERldk1vZGVEZWJ1Z2dpbmdOb2RlIGV4dGVuZHMgTWNwRGV2TW9kZURlYnVnZ2luZyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGVidWdTZXJ2aWNlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9uYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihkZWJ1Z1NlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBlbnN1cmVMaXN0ZW5pbmdPblBvcnQocG9ydDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVhZGxpbmUgPSBEYXRlLm5vdygpICsgMzBfMDAwO1xuXHRcdHdoaWxlIChhd2FpdCB0aGlzLl9uYXRpdmVIb3N0U2VydmljZS5pc1BvcnRGcmVlKHBvcnQpICYmIERhdGUubm93KCkgPCBkZWFkbGluZSkge1xuXHRcdFx0YXdhaXQgdGltZW91dCg1MCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldERlYnVnUG9ydCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbmF0aXZlSG9zdFNlcnZpY2UuZmluZEZyZWVQb3J0KDUwMDAsIDEwIC8qIHRyeSAxMCBwb3J0cyAqLywgNTAwMCAvKiB0cnkgdXAgdG8gNSBzZWNvbmRzICovLCAyMDQ4IC8qIHNraXAgMjA0OCBwb3J0cyBiZXR3ZWVuIGF0dGVtcHRzICovKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBMkI7QUFFN0IsSUFBTSwwQkFBTixjQUFzQyxvQkFBb0I7QUFBQSxFQUNoRSxZQUNnQixjQUNFLGdCQUNvQixvQkFDcEM7QUFDRCxVQUFNLGNBQWMsY0FBYztBQUZHO0FBQUEsRUFHdEM7QUFBQSxFQUVBLE1BQXlCLHNCQUFzQixNQUE2QjtBQUMzRSxVQUFNLFdBQVcsS0FBSyxJQUFJLElBQUk7QUFDOUIsV0FBTyxNQUFNLEtBQUssbUJBQW1CLFdBQVcsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLFVBQVU7QUFDL0UsWUFBTSxRQUFRLEVBQUU7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFBQSxFQUVtQixlQUFlO0FBQ2pDLFdBQU8sS0FBSyxtQkFBbUI7QUFBQSxNQUFhO0FBQUEsTUFBTTtBQUFBLE1BQXVCO0FBQUEsTUFBZ0M7QUFBQTtBQUFBLElBQTJDO0FBQUEsRUFDcko7QUFDRDtBQW5CYSwwQkFBTjtBQUFBLEVBRUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
