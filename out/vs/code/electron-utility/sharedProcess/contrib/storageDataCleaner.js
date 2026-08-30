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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { join } from "../../../../base/common/path.js";
import { Promises } from "../../../../base/node/pfs.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { StorageClient } from "../../../../platform/storage/common/storageIpc.js";
import { EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE } from "../../../../platform/workspace/common/workspace.js";
import { getWorkspaceIdentifier } from "../../../../platform/workspaces/common/workspaceIdentifier.js";
import { NON_EMPTY_WORKSPACE_ID_LENGTH } from "../../../../platform/workspaces/node/workspaces.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { Schemas } from "../../../../base/common/network.js";
let UnusedWorkspaceStorageDataCleaner = class extends Disposable {
  constructor(environmentService, logService, nativeHostService, mainProcessService) {
    super();
    this.environmentService = environmentService;
    this.logService = logService;
    this.nativeHostService = nativeHostService;
    this.mainProcessService = mainProcessService;
    const scheduler = this._register(new RunOnceScheduler(
      () => {
        this.cleanUpStorage();
      },
      30 * 1e3
      /* after 30s */
    ));
    scheduler.schedule();
  }
  /**
   * Public for testing.
   */
  async cleanUpStorage() {
    this.logService.trace("[storage cleanup]: Starting to clean up workspace storage folders for unused empty workspaces.");
    try {
      const workspaceStorageHome = this.environmentService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath;
      const workspaceStorageFolders = await Promises.readdir(workspaceStorageHome);
      const storageClient = new StorageClient(this.mainProcessService.getChannel("storage"));
      await Promise.all(workspaceStorageFolders.map(async (workspaceStorageFolder) => {
        const workspaceStoragePath = join(workspaceStorageHome, workspaceStorageFolder);
        if (workspaceStorageFolder.length === NON_EMPTY_WORKSPACE_ID_LENGTH) {
          return;
        }
        if (workspaceStorageFolder === EXTENSION_DEVELOPMENT_EMPTY_WINDOW_WORKSPACE.id) {
          return;
        }
        if (workspaceStorageFolder === getWorkspaceIdentifier(this.environmentService.agentSessionsWorkspace).id) {
          return;
        }
        const windows = await this.nativeHostService.getWindows({ includeAuxiliaryWindows: false });
        if (windows.some((window) => window.workspace?.id === workspaceStorageFolder)) {
          return;
        }
        const isStorageUsed = await storageClient.isUsed(workspaceStoragePath);
        if (isStorageUsed) {
          return;
        }
        this.logService.trace(`[storage cleanup]: Deleting workspace storage folder ${workspaceStorageFolder} as it seems to be an unused empty workspace.`);
        await Promises.rm(workspaceStoragePath);
      }));
    } catch (error) {
      onUnexpectedError(error);
    }
  }
};
UnusedWorkspaceStorageDataCleaner = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, ILogService),
  __decorateParam(2, INativeHostService),
  __decorateParam(3, IMainProcessService)
], UnusedWorkspaceStorageDataCleaner);
export {
  UnusedWorkspaceStorageDataCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxlbGVjdHJvbi11dGlsaXR5XFxzaGFyZWRQcm9jZXNzXFxjb250cmliXFxzdG9yYWdlRGF0YUNsZWFuZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VDbGllbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlSXBjLmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9ERVZFTE9QTUVOVF9FTVBUWV9XSU5ET1dfV09SS1NQQUNFIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgZ2V0V29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgTk9OX0VNUFRZX1dPUktTUEFDRV9JRF9MRU5HVEggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL25vZGUvd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJTWFpblByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaXBjL2NvbW1vbi9tYWluUHJvY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuXG5leHBvcnQgY2xhc3MgVW51c2VkV29ya3NwYWNlU3RvcmFnZURhdGFDbGVhbmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdFx0QElNYWluUHJvY2Vzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYWluUHJvY2Vzc1NlcnZpY2U6IElNYWluUHJvY2Vzc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMuY2xlYW5VcFN0b3JhZ2UoKTtcblx0XHR9LCAzMCAqIDEwMDAgLyogYWZ0ZXIgMzBzICovKSk7XG5cdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUHVibGljIGZvciB0ZXN0aW5nLlxuXHQgKi9cblx0YXN5bmMgY2xlYW5VcFN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbc3RvcmFnZSBjbGVhbnVwXTogU3RhcnRpbmcgdG8gY2xlYW4gdXAgd29ya3NwYWNlIHN0b3JhZ2UgZm9sZGVycyBmb3IgdW51c2VkIGVtcHR5IHdvcmtzcGFjZXMuJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlU3RvcmFnZUhvbWUgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS53b3Jrc3BhY2VTdG9yYWdlSG9tZS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUgfSkuZnNQYXRoO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlU3RvcmFnZUZvbGRlcnMgPSBhd2FpdCBQcm9taXNlcy5yZWFkZGlyKHdvcmtzcGFjZVN0b3JhZ2VIb21lKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VDbGllbnQgPSBuZXcgU3RvcmFnZUNsaWVudCh0aGlzLm1haW5Qcm9jZXNzU2VydmljZS5nZXRDaGFubmVsKCdzdG9yYWdlJykpO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbCh3b3Jrc3BhY2VTdG9yYWdlRm9sZGVycy5tYXAoYXN5bmMgd29ya3NwYWNlU3RvcmFnZUZvbGRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZVN0b3JhZ2VQYXRoID0gam9pbih3b3Jrc3BhY2VTdG9yYWdlSG9tZSwgd29ya3NwYWNlU3RvcmFnZUZvbGRlcik7XG5cblx0XHRcdFx0aWYgKHdvcmtzcGFjZVN0b3JhZ2VGb2xkZXIubGVuZ3RoID09PSBOT05fRU1QVFlfV09SS1NQQUNFX0lEX0xFTkdUSCkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8ga2VlcCB3b3Jrc3BhY2Ugc3RvcmFnZSBmb3IgZm9sZGVycy93b3Jrc3BhY2VzIHRoYXQgY2FuIGJlIGFjY2Vzc2VkIHN0aWxsXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAod29ya3NwYWNlU3RvcmFnZUZvbGRlciA9PT0gRVhURU5TSU9OX0RFVkVMT1BNRU5UX0VNUFRZX1dJTkRPV19XT1JLU1BBQ0UuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGtlZXAgd29ya3NwYWNlIHN0b3JhZ2UgZm9yIGVtcHR5IGV4dGVuc2lvbiBkZXZlbG9wbWVudCB3b3Jrc3BhY2VzXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAod29ya3NwYWNlU3RvcmFnZUZvbGRlciA9PT0gZ2V0V29ya3NwYWNlSWRlbnRpZmllcih0aGlzLmVudmlyb25tZW50U2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlKS5pZCkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8ga2VlcCB3b3Jrc3BhY2Ugc3RvcmFnZSBmb3IgdGhlIGFnZW50cyB3aW5kb3cgKHBlcm1hbmVudCBidWlsdC1pbiBzdXJmYWNlKVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgd2luZG93cyA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2UuZ2V0V2luZG93cyh7IGluY2x1ZGVBdXhpbGlhcnlXaW5kb3dzOiBmYWxzZSB9KTtcblx0XHRcdFx0aWYgKHdpbmRvd3Muc29tZSh3aW5kb3cgPT4gd2luZG93LndvcmtzcGFjZT8uaWQgPT09IHdvcmtzcGFjZVN0b3JhZ2VGb2xkZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBrZWVwIHdvcmtzcGFjZSBzdG9yYWdlIGZvciBlbXB0eSB3b3Jrc3BhY2VzIG9wZW5lZCBhcyB3aW5kb3dcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGlzU3RvcmFnZVVzZWQgPSBhd2FpdCBzdG9yYWdlQ2xpZW50LmlzVXNlZCh3b3Jrc3BhY2VTdG9yYWdlUGF0aCk7XG5cdFx0XHRcdGlmIChpc1N0b3JhZ2VVc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBrZWVwIHdvcmtzcGFjZSBzdG9yYWdlIGZvciBlbXB0eSB3b3Jrc3BhY2VzIHRoYXQgYXJlIGluIHVzZVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbc3RvcmFnZSBjbGVhbnVwXTogRGVsZXRpbmcgd29ya3NwYWNlIHN0b3JhZ2UgZm9sZGVyICR7d29ya3NwYWNlU3RvcmFnZUZvbGRlcn0gYXMgaXQgc2VlbXMgdG8gYmUgYW4gdW51c2VkIGVtcHR5IHdvcmtzcGFjZS5gKTtcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5ybSh3b3Jrc3BhY2VTdG9yYWdlUGF0aCk7XG5cdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0RBQW9EO0FBQzdELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZUFBZTtBQUVqQixJQUFNLG9DQUFOLGNBQWdELFdBQVc7QUFBQSxFQUVqRSxZQUM2QyxvQkFDZCxZQUNPLG1CQUNDLG9CQUNyQztBQUNELFVBQU07QUFMc0M7QUFDZDtBQUNPO0FBQ0M7QUFJdEMsVUFBTSxZQUFZLEtBQUssVUFBVSxJQUFJO0FBQUEsTUFBaUIsTUFBTTtBQUMzRCxhQUFLLGVBQWU7QUFBQSxNQUNyQjtBQUFBLE1BQUcsS0FBSztBQUFBO0FBQUEsSUFBb0IsQ0FBQztBQUM3QixjQUFVLFNBQVM7QUFBQSxFQUNwQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBTSxpQkFBZ0M7QUFDckMsU0FBSyxXQUFXLE1BQU0sZ0dBQWdHO0FBRXRILFFBQUk7QUFDSCxZQUFNLHVCQUF1QixLQUFLLG1CQUFtQixxQkFBcUIsS0FBSyxFQUFFLFFBQVEsUUFBUSxLQUFLLENBQUMsRUFBRTtBQUN6RyxZQUFNLDBCQUEwQixNQUFNLFNBQVMsUUFBUSxvQkFBb0I7QUFDM0UsWUFBTSxnQkFBZ0IsSUFBSSxjQUFjLEtBQUssbUJBQW1CLFdBQVcsU0FBUyxDQUFDO0FBRXJGLFlBQU0sUUFBUSxJQUFJLHdCQUF3QixJQUFJLE9BQU0sMkJBQTBCO0FBQzdFLGNBQU0sdUJBQXVCLEtBQUssc0JBQXNCLHNCQUFzQjtBQUU5RSxZQUFJLHVCQUF1QixXQUFXLCtCQUErQjtBQUNwRTtBQUFBLFFBQ0Q7QUFFQSxZQUFJLDJCQUEyQiw2Q0FBNkMsSUFBSTtBQUMvRTtBQUFBLFFBQ0Q7QUFFQSxZQUFJLDJCQUEyQix1QkFBdUIsS0FBSyxtQkFBbUIsc0JBQXNCLEVBQUUsSUFBSTtBQUN6RztBQUFBLFFBQ0Q7QUFFQSxjQUFNLFVBQVUsTUFBTSxLQUFLLGtCQUFrQixXQUFXLEVBQUUseUJBQXlCLE1BQU0sQ0FBQztBQUMxRixZQUFJLFFBQVEsS0FBSyxZQUFVLE9BQU8sV0FBVyxPQUFPLHNCQUFzQixHQUFHO0FBQzVFO0FBQUEsUUFDRDtBQUVBLGNBQU0sZ0JBQWdCLE1BQU0sY0FBYyxPQUFPLG9CQUFvQjtBQUNyRSxZQUFJLGVBQWU7QUFDbEI7QUFBQSxRQUNEO0FBRUEsYUFBSyxXQUFXLE1BQU0sd0RBQXdELHNCQUFzQiwrQ0FBK0M7QUFFbkosY0FBTSxTQUFTLEdBQUcsb0JBQW9CO0FBQUEsTUFDdkMsQ0FBQyxDQUFDO0FBQUEsSUFDSCxTQUFTLE9BQU87QUFDZix3QkFBa0IsS0FBSztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUNEO0FBNURhLG9DQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
