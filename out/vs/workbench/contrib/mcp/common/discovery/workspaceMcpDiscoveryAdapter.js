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
import { DisposableMap } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { StorageScope } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { DiscoverySource } from "../mcpConfiguration.js";
import { IMcpRegistry } from "../mcpRegistryTypes.js";
import { McpCollectionSortOrder, McpServerTrust } from "../mcpTypes.js";
import { FilesystemMcpDiscovery } from "./nativeMcpDiscoveryAbstract.js";
import { claudeConfigToServerDefinition } from "./nativeMcpDiscoveryAdapters.js";
let CursorWorkspaceMcpDiscoveryAdapter = class extends FilesystemMcpDiscovery {
  constructor(fileService, _workspaceContextService, mcpRegistry, configurationService, _remoteAgentService) {
    super(configurationService, fileService, mcpRegistry);
    this._workspaceContextService = _workspaceContextService;
    this._remoteAgentService = _remoteAgentService;
    this._collections = this._register(new DisposableMap());
  }
  start() {
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders((e) => {
      for (const removed of e.removed) {
        this._collections.deleteAndDispose(removed.uri.toString());
      }
      for (const added of e.added) {
        this.watchFolder(added);
      }
    }));
    for (const folder of this._workspaceContextService.getWorkspace().folders) {
      this.watchFolder(folder);
    }
  }
  watchFolder(folder) {
    const configFile = joinPath(folder.uri, ".cursor", "mcp.json");
    const collection = {
      id: `cursor-workspace.${folder.index}`,
      label: `${folder.name}/.cursor/mcp.json`,
      remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority || null,
      scope: StorageScope.WORKSPACE,
      trustBehavior: McpServerTrust.Kind.TrustedOnNonce,
      serverDefinitions: observableValue(this, []),
      configTarget: ConfigurationTarget.WORKSPACE_FOLDER,
      order: McpCollectionSortOrder.WorkspaceFolder + 1,
      presentation: {
        origin: configFile
      }
    };
    this._collections.set(folder.uri.toString(), this.watchFile(
      URI.joinPath(folder.uri, ".cursor", "mcp.json"),
      collection,
      DiscoverySource.CursorWorkspace,
      async (contents) => {
        const defs = await claudeConfigToServerDefinition(collection.id, contents, folder.uri);
        defs?.forEach((d) => d.roots = [folder.uri]);
        return defs;
      }
    ));
  }
};
CursorWorkspaceMcpDiscoveryAdapter = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IMcpRegistry),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IRemoteAgentService)
], CursorWorkspaceMcpDiscoveryAdapter);
export {
  CursorWorkspaceMcpDiscoveryAdapter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxkaXNjb3ZlcnlcXHdvcmtzcGFjZU1jcERpc2NvdmVyeUFkYXB0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlTWFwLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNjb3ZlcnlTb3VyY2UgfSBmcm9tICcuLi9tY3BDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgTWNwQ29sbGVjdGlvblNvcnRPcmRlciwgTWNwU2VydmVyVHJ1c3QgfSBmcm9tICcuLi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwRGlzY292ZXJ5IH0gZnJvbSAnLi9tY3BEaXNjb3ZlcnkuanMnO1xuaW1wb3J0IHsgRmlsZXN5c3RlbU1jcERpc2NvdmVyeSwgV3JpdGFibGVNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiB9IGZyb20gJy4vbmF0aXZlTWNwRGlzY292ZXJ5QWJzdHJhY3QuanMnO1xuaW1wb3J0IHsgY2xhdWRlQ29uZmlnVG9TZXJ2ZXJEZWZpbml0aW9uIH0gZnJvbSAnLi9uYXRpdmVNY3BEaXNjb3ZlcnlBZGFwdGVycy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3Jrc3BhY2VNY3BEaXNjb3ZlcnlBZGFwdGVyIGV4dGVuZHMgRmlsZXN5c3RlbU1jcERpc2NvdmVyeSBpbXBsZW1lbnRzIElNY3BEaXNjb3Zlcnkge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2xsZWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElNY3BSZWdpc3RyeSBtY3BSZWdpc3RyeTogSU1jcFJlZ2lzdHJ5LFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBmaWxlU2VydmljZSwgbWNwUmVnaXN0cnkpO1xuXHR9XG5cblx0c3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByZW1vdmVkIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9jb2xsZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKHJlbW92ZWQudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBhZGRlZCBvZiBlLmFkZGVkKSB7XG5cdFx0XHRcdHRoaXMud2F0Y2hGb2xkZXIoYWRkZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpIHtcblx0XHRcdHRoaXMud2F0Y2hGb2xkZXIoZm9sZGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHdhdGNoRm9sZGVyKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcikge1xuXHRcdGNvbnN0IGNvbmZpZ0ZpbGUgPSBqb2luUGF0aChmb2xkZXIudXJpLCAnLmN1cnNvcicsICdtY3AuanNvbicpO1xuXHRcdGNvbnN0IGNvbGxlY3Rpb246IFdyaXRhYmxlTWNwQ29sbGVjdGlvbkRlZmluaXRpb24gPSB7XG5cdFx0XHRpZDogYGN1cnNvci13b3Jrc3BhY2UuJHtmb2xkZXIuaW5kZXh9YCxcblx0XHRcdGxhYmVsOiBgJHtmb2xkZXIubmFtZX0vLmN1cnNvci9tY3AuanNvbmAsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk/LnJlbW90ZUF1dGhvcml0eSB8fCBudWxsLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHR0cnVzdEJlaGF2aW9yOiBNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWRPbk5vbmNlLFxuXHRcdFx0c2VydmVyRGVmaW5pdGlvbnM6IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBbXSksXG5cdFx0XHRjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUixcblx0XHRcdG9yZGVyOiBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLldvcmtzcGFjZUZvbGRlciArIDEsXG5cdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0b3JpZ2luOiBjb25maWdGaWxlLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGhpcy5fY29sbGVjdGlvbnMuc2V0KGZvbGRlci51cmkudG9TdHJpbmcoKSwgdGhpcy53YXRjaEZpbGUoXG5cdFx0XHRVUkkuam9pblBhdGgoZm9sZGVyLnVyaSwgJy5jdXJzb3InLCAnbWNwLmpzb24nKSxcblx0XHRcdGNvbGxlY3Rpb24sXG5cdFx0XHREaXNjb3ZlcnlTb3VyY2UuQ3Vyc29yV29ya3NwYWNlLFxuXHRcdFx0YXN5bmMgY29udGVudHMgPT4ge1xuXHRcdFx0XHRjb25zdCBkZWZzID0gYXdhaXQgY2xhdWRlQ29uZmlnVG9TZXJ2ZXJEZWZpbml0aW9uKGNvbGxlY3Rpb24uaWQsIGNvbnRlbnRzLCBmb2xkZXIudXJpKTtcblx0XHRcdFx0ZGVmcz8uZm9yRWFjaChkID0+IGQucm9vdHMgPSBbZm9sZGVyLnVyaV0pO1xuXHRcdFx0XHRyZXR1cm4gZGVmcztcblx0XHRcdH1cblx0XHQpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFrQztBQUMzQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0NBQWtEO0FBQzNELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCLHNCQUFzQjtBQUV2RCxTQUFTLDhCQUErRDtBQUN4RSxTQUFTLHNDQUFzQztBQUV4QyxJQUFNLHFDQUFOLGNBQWlELHVCQUFnRDtBQUFBLEVBR3ZHLFlBQ2UsYUFDNkIsMEJBQzdCLGFBQ1Msc0JBQ2UscUJBQ3JDO0FBQ0QsVUFBTSxzQkFBc0IsYUFBYSxXQUFXO0FBTFQ7QUFHTDtBQVB2QyxTQUFpQixlQUFlLEtBQUssVUFBVSxJQUFJLGNBQW1DLENBQUM7QUFBQSxFQVV2RjtBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssVUFBVSxLQUFLLHlCQUF5Qiw0QkFBNEIsT0FBSztBQUM3RSxpQkFBVyxXQUFXLEVBQUUsU0FBUztBQUNoQyxhQUFLLGFBQWEsaUJBQWlCLFFBQVEsSUFBSSxTQUFTLENBQUM7QUFBQSxNQUMxRDtBQUNBLGlCQUFXLFNBQVMsRUFBRSxPQUFPO0FBQzVCLGFBQUssWUFBWSxLQUFLO0FBQUEsTUFDdkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLGVBQVcsVUFBVSxLQUFLLHlCQUF5QixhQUFhLEVBQUUsU0FBUztBQUMxRSxXQUFLLFlBQVksTUFBTTtBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRVEsWUFBWSxRQUEwQjtBQUM3QyxVQUFNLGFBQWEsU0FBUyxPQUFPLEtBQUssV0FBVyxVQUFVO0FBQzdELFVBQU0sYUFBOEM7QUFBQSxNQUNuRCxJQUFJLG9CQUFvQixPQUFPLEtBQUs7QUFBQSxNQUNwQyxPQUFPLEdBQUcsT0FBTyxJQUFJO0FBQUEsTUFDckIsaUJBQWlCLEtBQUssb0JBQW9CLGNBQWMsR0FBRyxtQkFBbUI7QUFBQSxNQUM5RSxPQUFPLGFBQWE7QUFBQSxNQUNwQixlQUFlLGVBQWUsS0FBSztBQUFBLE1BQ25DLG1CQUFtQixnQkFBZ0IsTUFBTSxDQUFDLENBQUM7QUFBQSxNQUMzQyxjQUFjLG9CQUFvQjtBQUFBLE1BQ2xDLE9BQU8sdUJBQXVCLGtCQUFrQjtBQUFBLE1BQ2hELGNBQWM7QUFBQSxRQUNiLFFBQVE7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUVBLFNBQUssYUFBYSxJQUFJLE9BQU8sSUFBSSxTQUFTLEdBQUcsS0FBSztBQUFBLE1BQ2pELElBQUksU0FBUyxPQUFPLEtBQUssV0FBVyxVQUFVO0FBQUEsTUFDOUM7QUFBQSxNQUNBLGdCQUFnQjtBQUFBLE1BQ2hCLE9BQU0sYUFBWTtBQUNqQixjQUFNLE9BQU8sTUFBTSwrQkFBK0IsV0FBVyxJQUFJLFVBQVUsT0FBTyxHQUFHO0FBQ3JGLGNBQU0sUUFBUSxPQUFLLEVBQUUsUUFBUSxDQUFDLE9BQU8sR0FBRyxDQUFDO0FBQ3pDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBdkRhLHFDQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVJVOyIsCiAgIm5hbWVzIjogW10KfQo=
