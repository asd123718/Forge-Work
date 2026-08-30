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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { Promises } from "../../../../base/common/async.js";
let LogsDataCleaner = class extends Disposable {
  constructor(environmentService, fileService, lifecycleService) {
    super();
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.lifecycleService = lifecycleService;
    this.cleanUpOldLogsSoon();
  }
  cleanUpOldLogsSoon() {
    let handle = setTimeout(async () => {
      handle = void 0;
      const stat = await this.fileService.resolve(dirname(this.environmentService.logsHome));
      if (stat.children) {
        const currentLog = basename(this.environmentService.logsHome);
        const allSessions = stat.children.filter((stat2) => stat2.isDirectory && /^\d{8}T\d{6}$/.test(stat2.name));
        const oldSessions = allSessions.sort().filter((d, i) => d.name !== currentLog);
        const toDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 49));
        Promises.settled(toDelete.map((stat2) => this.fileService.del(stat2.resource, { recursive: true })));
      }
    }, 10 * 1e3);
    this._register(this.lifecycleService.onWillShutdown(() => {
      if (handle) {
        clearTimeout(handle);
        handle = void 0;
      }
    }));
  }
};
LogsDataCleaner = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILifecycleService)
], LogsDataCleaner);
export {
  LogsDataCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGxvZ3NcXGNvbW1vblxcbG9nc0RhdGFDbGVhbmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuZXhwb3J0IGNsYXNzIExvZ3NEYXRhQ2xlYW5lciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY2xlYW5VcE9sZExvZ3NTb29uKCk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFuVXBPbGRMb2dzU29vbigpOiB2b2lkIHtcblx0XHRsZXQgaGFuZGxlOiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0XHRoYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKGRpcm5hbWUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUpKTtcblx0XHRcdGlmIChzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRMb2cgPSBiYXNlbmFtZSh0aGlzLmVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSk7XG5cdFx0XHRcdGNvbnN0IGFsbFNlc3Npb25zID0gc3RhdC5jaGlsZHJlbi5maWx0ZXIoc3RhdCA9PiBzdGF0LmlzRGlyZWN0b3J5ICYmIC9eXFxkezh9VFxcZHs2fSQvLnRlc3Qoc3RhdC5uYW1lKSk7XG5cdFx0XHRcdGNvbnN0IG9sZFNlc3Npb25zID0gYWxsU2Vzc2lvbnMuc29ydCgpLmZpbHRlcigoZCwgaSkgPT4gZC5uYW1lICE9PSBjdXJyZW50TG9nKTtcblx0XHRcdFx0Y29uc3QgdG9EZWxldGUgPSBvbGRTZXNzaW9ucy5zbGljZSgwLCBNYXRoLm1heCgwLCBvbGRTZXNzaW9ucy5sZW5ndGggLSA0OSkpO1xuXHRcdFx0XHRQcm9taXNlcy5zZXR0bGVkKHRvRGVsZXRlLm1hcChzdGF0ID0+IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHN0YXQucmVzb3VyY2UsIHsgcmVjdXJzaXZlOiB0cnVlIH0pKSk7XG5cdFx0XHR9XG5cdFx0fSwgMTAgKiAxMDAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4ge1xuXHRcdFx0aWYgKGhhbmRsZSkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQoaGFuZGxlKTtcblx0XHRcdFx0aGFuZGxlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUVsQixJQUFNLGtCQUFOLGNBQThCLFdBQVc7QUFBQSxFQUUvQyxZQUNnRCxvQkFDaEIsYUFDSyxrQkFDbkM7QUFDRCxVQUFNO0FBSnlDO0FBQ2hCO0FBQ0s7QUFHcEMsU0FBSyxtQkFBbUI7QUFBQSxFQUN6QjtBQUFBLEVBRVEscUJBQTJCO0FBQ2xDLFFBQUksU0FBOEIsV0FBVyxZQUFZO0FBQ3hELGVBQVM7QUFDVCxZQUFNLE9BQU8sTUFBTSxLQUFLLFlBQVksUUFBUSxRQUFRLEtBQUssbUJBQW1CLFFBQVEsQ0FBQztBQUNyRixVQUFJLEtBQUssVUFBVTtBQUNsQixjQUFNLGFBQWEsU0FBUyxLQUFLLG1CQUFtQixRQUFRO0FBQzVELGNBQU0sY0FBYyxLQUFLLFNBQVMsT0FBTyxDQUFBQSxVQUFRQSxNQUFLLGVBQWUsZ0JBQWdCLEtBQUtBLE1BQUssSUFBSSxDQUFDO0FBQ3BHLGNBQU0sY0FBYyxZQUFZLEtBQUssRUFBRSxPQUFPLENBQUMsR0FBRyxNQUFNLEVBQUUsU0FBUyxVQUFVO0FBQzdFLGNBQU0sV0FBVyxZQUFZLE1BQU0sR0FBRyxLQUFLLElBQUksR0FBRyxZQUFZLFNBQVMsRUFBRSxDQUFDO0FBQzFFLGlCQUFTLFFBQVEsU0FBUyxJQUFJLENBQUFBLFVBQVEsS0FBSyxZQUFZLElBQUlBLE1BQUssVUFBVSxFQUFFLFdBQVcsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ2hHO0FBQUEsSUFDRCxHQUFHLEtBQUssR0FBSTtBQUNaLFNBQUssVUFBVSxLQUFLLGlCQUFpQixlQUFlLE1BQU07QUFDekQsVUFBSSxRQUFRO0FBQ1gscUJBQWEsTUFBTTtBQUNuQixpQkFBUztBQUFBLE1BQ1Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQTlCYSxrQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTFU7IiwKICAibmFtZXMiOiBbInN0YXQiXQp9Cg==
