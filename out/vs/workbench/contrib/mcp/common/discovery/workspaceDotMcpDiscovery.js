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
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { StorageScope } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { IMcpRegistry } from "../mcpRegistryTypes.js";
import { McpCollectionSortOrder, McpServerTrust, WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX } from "../mcpTypes.js";
import { claudeConfigToServerDefinition } from "./nativeMcpDiscoveryAdapters.js";
let WorkspaceDotMcpDiscovery = class extends Disposable {
  constructor(_fileService, _workspaceContextService, _mcpRegistry, _remoteAgentService) {
    super();
    this._fileService = _fileService;
    this._workspaceContextService = _workspaceContextService;
    this._mcpRegistry = _mcpRegistry;
    this._remoteAgentService = _remoteAgentService;
    this.fromGallery = false;
    this._collections = this._register(new DisposableMap());
  }
  start() {
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders((e) => {
      for (const removed of e.removed) {
        this._collections.deleteAndDispose(removed.uri.toString());
      }
      for (const added of e.added) {
        this._watchFolder(added);
      }
    }));
    for (const folder of this._workspaceContextService.getWorkspace().folders) {
      this._watchFolder(folder);
    }
  }
  _watchFolder(folder) {
    const configFile = joinPath(folder.uri, ".mcp.json");
    const collectionId = `${WORKSPACE_DOT_MCP_COLLECTION_ID_PREFIX}${folder.index}`;
    const serverDefinitions = observableValue(this, []);
    const collection = {
      id: collectionId,
      label: `${folder.name}/.mcp.json`,
      remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority || null,
      scope: StorageScope.WORKSPACE,
      trustBehavior: McpServerTrust.Kind.TrustedOnNonce,
      serverDefinitions,
      configTarget: ConfigurationTarget.WORKSPACE_FOLDER,
      order: McpCollectionSortOrder.WorkspaceFolder + 1,
      presentation: {
        origin: configFile
      }
    };
    const store = new DisposableStore();
    const collectionRegistration = store.add(new MutableDisposable());
    const updateFile = async () => {
      let definitions = [];
      try {
        const contents = await this._fileService.readFile(configFile);
        const defs = await claudeConfigToServerDefinition(collectionId, contents.value, folder.uri);
        if (defs) {
          for (const d of defs) {
            d.roots = [folder.uri];
          }
          definitions = defs;
        }
      } catch {
      }
      if (!definitions.length) {
        collectionRegistration.clear();
      } else {
        serverDefinitions.set(definitions, void 0);
        if (!collectionRegistration.value) {
          collectionRegistration.value = this._mcpRegistry.registerCollection(collection);
        }
      }
    };
    const throttler = store.add(new RunOnceScheduler(updateFile, 500));
    const watcher = store.add(this._fileService.createWatcher(configFile, { recursive: false, excludes: [] }));
    store.add(watcher.onDidChange(() => throttler.schedule()));
    updateFile();
    this._collections.set(folder.uri.toString(), store);
  }
};
WorkspaceDotMcpDiscovery = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IMcpRegistry),
  __decorateParam(3, IRemoteAgentService)
], WorkspaceDotMcpDiscovery);
export {
  WorkspaceDotMcpDiscovery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxkaXNjb3ZlcnlcXHdvcmtzcGFjZURvdE1jcERpc2NvdmVyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwUmVnaXN0cnkgfSBmcm9tICcuLi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIsIE1jcFNlcnZlckRlZmluaXRpb24sIE1jcFNlcnZlclRydXN0LCBXT1JLU1BBQ0VfRE9UX01DUF9DT0xMRUNUSU9OX0lEX1BSRUZJWCB9IGZyb20gJy4uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BEaXNjb3ZlcnkgfSBmcm9tICcuL21jcERpc2NvdmVyeS5qcyc7XG5pbXBvcnQgeyBjbGF1ZGVDb25maWdUb1NlcnZlckRlZmluaXRpb24gfSBmcm9tICcuL25hdGl2ZU1jcERpc2NvdmVyeUFkYXB0ZXJzLmpzJztcblxuLyoqXG4gKiBEaXNjb3ZlcnMgTUNQIHNlcnZlcnMgZGVmaW5lZCBpbiBgLm1jcC5qc29uYCBmaWxlcyBhdCB3b3Jrc3BhY2UgZm9sZGVyIHJvb3RzLlxuICogVXNlcyB0aGUgQ2xhdWRlLXN0eWxlIGZvcm1hdDogYHsgXCJtY3BTZXJ2ZXJzXCI6IHsgLi4uIH0gfWAuXG4gKi9cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VEb3RNY3BEaXNjb3ZlcnkgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcERpc2NvdmVyeSB7XG5cdHJlYWRvbmx5IGZyb21HYWxsZXJ5ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29sbGVjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTWNwUmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBfbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzdGFydCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlbW92ZWQgb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHRcdHRoaXMuX2NvbGxlY3Rpb25zLmRlbGV0ZUFuZERpc3Bvc2UocmVtb3ZlZC51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGFkZGVkIG9mIGUuYWRkZWQpIHtcblx0XHRcdFx0dGhpcy5fd2F0Y2hGb2xkZXIoYWRkZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpIHtcblx0XHRcdHRoaXMuX3dhdGNoRm9sZGVyKGZvbGRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfd2F0Y2hGb2xkZXIoZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0Y29uc3QgY29uZmlnRmlsZSA9IGpvaW5QYXRoKGZvbGRlci51cmksICcubWNwLmpzb24nKTtcblx0XHRjb25zdCBjb2xsZWN0aW9uSWQgPSBgJHtXT1JLU1BBQ0VfRE9UX01DUF9DT0xMRUNUSU9OX0lEX1BSRUZJWH0ke2ZvbGRlci5pbmRleH1gO1xuXHRcdGNvbnN0IHNlcnZlckRlZmluaXRpb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IE1jcFNlcnZlckRlZmluaXRpb25bXT4odGhpcywgW10pO1xuXG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IHtcblx0XHRcdGlkOiBjb2xsZWN0aW9uSWQsXG5cdFx0XHRsYWJlbDogYCR7Zm9sZGVyLm5hbWV9Ly5tY3AuanNvbmAsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk/LnJlbW90ZUF1dGhvcml0eSB8fCBudWxsLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHR0cnVzdEJlaGF2aW9yOiBNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWRPbk5vbmNlIGFzIGNvbnN0LFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbnMsXG5cdFx0XHRjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUixcblx0XHRcdG9yZGVyOiBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLldvcmtzcGFjZUZvbGRlciArIDEsXG5cdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0b3JpZ2luOiBjb25maWdGaWxlLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY29sbGVjdGlvblJlZ2lzdHJhdGlvbiA9IHN0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0XHRjb25zdCB1cGRhdGVGaWxlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGRlZmluaXRpb25zOiBNY3BTZXJ2ZXJEZWZpbml0aW9uW10gPSBbXTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoY29uZmlnRmlsZSk7XG5cdFx0XHRcdGNvbnN0IGRlZnMgPSBhd2FpdCBjbGF1ZGVDb25maWdUb1NlcnZlckRlZmluaXRpb24oY29sbGVjdGlvbklkLCBjb250ZW50cy52YWx1ZSwgZm9sZGVyLnVyaSk7XG5cdFx0XHRcdGlmIChkZWZzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBkIG9mIGRlZnMpIHtcblx0XHRcdFx0XHRcdGQucm9vdHMgPSBbZm9sZGVyLnVyaV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlZmluaXRpb25zID0gZGVmcztcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGZpbGUgZG9lc24ndCBleGlzdCBvciBpcyBtYWxmb3JtZWRcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFkZWZpbml0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0Y29sbGVjdGlvblJlZ2lzdHJhdGlvbi5jbGVhcigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2VydmVyRGVmaW5pdGlvbnMuc2V0KGRlZmluaXRpb25zLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRpZiAoIWNvbGxlY3Rpb25SZWdpc3RyYXRpb24udmFsdWUpIHtcblx0XHRcdFx0XHRjb2xsZWN0aW9uUmVnaXN0cmF0aW9uLnZhbHVlID0gdGhpcy5fbWNwUmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKGNvbGxlY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRocm90dGxlciA9IHN0b3JlLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcih1cGRhdGVGaWxlLCA1MDApKTtcblx0XHRjb25zdCB3YXRjaGVyID0gc3RvcmUuYWRkKHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZVdhdGNoZXIoY29uZmlnRmlsZSwgeyByZWN1cnNpdmU6IGZhbHNlLCBleGNsdWRlczogW10gfSkpO1xuXHRcdHN0b3JlLmFkZCh3YXRjaGVyLm9uRGlkQ2hhbmdlKCgpID0+IHRocm90dGxlci5zY2hlZHVsZSgpKSk7XG5cdFx0dXBkYXRlRmlsZSgpO1xuXG5cdFx0dGhpcy5fY29sbGVjdGlvbnMuc2V0KGZvbGRlci51cmkudG9TdHJpbmcoKSwgc3RvcmUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsWUFBWSxlQUFlLGlCQUE4Qix5QkFBeUI7QUFDM0YsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBa0Q7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBNkMsZ0JBQWdCLDhDQUE4QztBQUVwSCxTQUFTLHNDQUFzQztBQU14QyxJQUFNLDJCQUFOLGNBQXVDLFdBQW9DO0FBQUEsRUFLakYsWUFDZ0MsY0FDWSwwQkFDWixjQUNPLHFCQUNyQztBQUNELFVBQU07QUFMeUI7QUFDWTtBQUNaO0FBQ087QUFSdkMsU0FBUyxjQUFjO0FBRXZCLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksY0FBbUMsQ0FBQztBQUFBLEVBU3ZGO0FBQUEsRUFFQSxRQUFjO0FBQ2Is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
