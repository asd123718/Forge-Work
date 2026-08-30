import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { dirname, extUriBiasedIgnorePathCase } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { observableMemento } from "../../../../../../platform/observable/common/observableMemento.js";
import { StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ToolConfirmKind } from "../../chatService/chatService.js";
const workspaceAllowlistMemento = observableMemento({
  key: "chat.externalPath.workspaceAllowlist",
  defaultValue: [],
  toStorage: (value) => JSON.stringify(value),
  fromStorage: (value) => {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
});
class ChatExternalPathConfirmationContribution {
  constructor(_getPathInfo, _labelService, _findGitRoot, storageService, _pickFolder) {
    this._getPathInfo = _getPathInfo;
    this._labelService = _labelService;
    this._findGitRoot = _findGitRoot;
    this._pickFolder = _pickFolder;
    this.canUseDefaultApprovals = false;
    this._sessionFolderAllowlist = new ResourceMap();
    /** Cache of path URI -> resolved git root URI (or null if not in a repo) */
    this._gitRootCache = new ResourceMap();
    if (storageService) {
      this._workspaceAllowlist = workspaceAllowlistMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService);
    }
  }
  dispose() {
    this._workspaceAllowlist?.dispose();
  }
  _getWorkspaceFolders() {
    if (!this._workspaceAllowlist) {
      return new ResourceSet();
    }
    const set = new ResourceSet();
    for (const s of this._workspaceAllowlist.get()) {
      try {
        set.add(URI.parse(s));
      } catch {
      }
    }
    return set;
  }
  _setWorkspaceFolders(folders) {
    if (!this._workspaceAllowlist) {
      return;
    }
    const uriStrings = [];
    for (const uri of folders) {
      uriStrings.push(uri.toString());
    }
    this._workspaceAllowlist.set(uriStrings, void 0);
  }
  getPreConfirmAction(ref) {
    const pathInfo = this._getPathInfo(ref);
    if (!pathInfo) {
      return void 0;
    }
    let pathUri;
    try {
      pathUri = URI.file(pathInfo.path);
    } catch {
      return void 0;
    }
    if (ref.workingDirectory) {
      if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, ref.workingDirectory)) {
        return { type: ToolConfirmKind.UserAction };
      }
    } else {
      const workspaceFolders = this._getWorkspaceFolders();
      for (const folderUri of workspaceFolders) {
        if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, folderUri)) {
          return { type: ToolConfirmKind.UserAction };
        }
      }
    }
    if (ref.chatSessionResource) {
      const sessionFolders = this._sessionFolderAllowlist.get(ref.chatSessionResource);
      if (sessionFolders) {
        for (const folderUri of sessionFolders) {
          if (extUriBiasedIgnorePathCase.isEqualOrParent(pathUri, folderUri)) {
            return { type: ToolConfirmKind.UserAction };
          }
        }
      }
    }
    return void 0;
  }
  getPreConfirmActions(ref) {
    const pathInfo = this._getPathInfo(ref);
    if (!pathInfo || !ref.chatSessionResource) {
      return [];
    }
    let pathUri;
    try {
      pathUri = URI.file(pathInfo.path);
    } catch {
      return [];
    }
    const folderUri = pathInfo.isDirectory ? pathUri : dirname(pathUri);
    const sessionResource = ref.chatSessionResource;
    const actions = [
      {
        label: localize("allowFolderSession", "Allow this folder in this session"),
        detail: localize("allowFolderSessionDetail", "Allow reading files from this folder without further confirmation in this chat session"),
        select: async () => {
          let folders = this._sessionFolderAllowlist.get(sessionResource);
          if (!folders) {
            folders = new ResourceSet();
            this._sessionFolderAllowlist.set(sessionResource, folders);
          }
          folders.add(folderUri);
          return true;
        }
      }
    ];
    if (this._findGitRoot) {
      const findGitRoot = this._findGitRoot;
      const gitRootCache = this._gitRootCache;
      const allowlist = this._sessionFolderAllowlist;
      const cached = gitRootCache.get(pathUri);
      if (cached === null) {
      } else if (cached) {
        actions.push({
          label: localize("allowRepoSession", "Allow all files in this repository for this session"),
          detail: localize("allowRepoSessionDetail", "Allow reading files from {0}", cached.fsPath),
          select: async () => {
            let folders = allowlist.get(sessionResource);
            if (!folders) {
              folders = new ResourceSet();
              allowlist.set(sessionResource, folders);
            }
            folders.add(cached);
            return true;
          }
        });
      } else {
        actions.push({
          label: localize("allowRepoSession", "Allow all files in this repository for this session"),
          detail: localize("allowRepoSessionDetailLookup", "Looks up the containing git repository for this path"),
          select: async () => {
            const gitRootUri = await findGitRoot(pathUri);
            gitRootCache.set(pathUri, gitRootUri ?? null);
            let folders = allowlist.get(sessionResource);
            if (!folders) {
              folders = new ResourceSet();
              allowlist.set(sessionResource, folders);
            }
            folders.add(gitRootUri ?? folderUri);
            return true;
          }
        });
      }
    }
    return actions;
  }
  getManageActions() {
    const items = [];
    const workspaceFolders = this._getWorkspaceFolders();
    for (const folderUri of workspaceFolders) {
      items.push({
        label: this._labelService.getUriLabel(folderUri),
        description: localize("workspaceScope", "Workspace"),
        checked: true,
        onDidChangeChecked: (checked) => {
          if (!checked) {
            workspaceFolders.delete(folderUri);
            this._setWorkspaceFolders(workspaceFolders);
          } else {
            workspaceFolders.add(folderUri);
            this._setWorkspaceFolders(workspaceFolders);
          }
        }
      });
    }
    const allSessionFolders = new ResourceSet();
    for (const [, folders] of this._sessionFolderAllowlist) {
      for (const folder of folders) {
        allSessionFolders.add(folder);
      }
    }
    for (const folderUri of allSessionFolders) {
      const wasInSessions = [...this._sessionFolderAllowlist].filter(([, folders]) => folders.has(folderUri));
      items.push({
        label: this._labelService.getUriLabel(folderUri),
        description: localize("sessionScope", "Session"),
        checked: true,
        onDidChangeChecked: (checked) => {
          if (!checked) {
            for (const [, folders] of wasInSessions) {
              folders.delete(folderUri);
            }
          } else {
            for (const [, folders] of wasInSessions) {
              folders.add(folderUri);
            }
          }
        }
      });
    }
    if (this._pickFolder) {
      const pickFolder = this._pickFolder;
      items.push({
        pickable: false,
        label: localize("addPath", "Add Path..."),
        description: localize("addPathDescription", "Allow a folder in this workspace"),
        onDidOpen: async () => {
          const uri = await pickFolder();
          if (uri) {
            const folders = this._getWorkspaceFolders();
            folders.add(uri);
            this._setWorkspaceFolders(folders);
          }
        }
      });
    }
    return items;
  }
  reset() {
    this._sessionFolderAllowlist.clear();
    this._gitRootCache.clear();
    if (this._workspaceAllowlist) {
      this._workspaceAllowlist.set([], void 0);
    }
  }
}
export {
  ChatExternalPathConfirmationContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xcY2hhdEV4dGVybmFsUGF0aENvbmZpcm1hdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlTWVtZW50bywgb2JzZXJ2YWJsZU1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9vYnNlcnZhYmxlTWVtZW50by5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQ29uZmlybWVkUmVhc29uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHRJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zLFxuXHRJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb24sXG5cdElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvblF1aWNrVHJlZUl0ZW0sXG5cdElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZlxufSBmcm9tICcuLi9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcblxuY29uc3Qgd29ya3NwYWNlQWxsb3dsaXN0TWVtZW50byA9IG9ic2VydmFibGVNZW1lbnRvPHJlYWRvbmx5IHN0cmluZ1tdPih7XG5cdGtleTogJ2NoYXQuZXh0ZXJuYWxQYXRoLndvcmtzcGFjZUFsbG93bGlzdCcsXG5cdGRlZmF1bHRWYWx1ZTogW10sXG5cdHRvU3RvcmFnZTogdmFsdWUgPT4gSlNPTi5zdHJpbmdpZnkodmFsdWUpLFxuXHRmcm9tU3RvcmFnZTogdmFsdWUgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UodmFsdWUpO1xuXHRcdHJldHVybiBBcnJheS5pc0FycmF5KHBhcnNlZCkgPyBwYXJzZWQgOiBbXTtcblx0fSxcbn0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlcm5hbFBhdGhJbmZvIHtcblx0cGF0aDogc3RyaW5nO1xuXHRpc0RpcmVjdG9yeTogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBDb25maXJtYXRpb24gY29udHJpYnV0aW9uIGZvciByZWFkX2ZpbGUgYW5kIGxpc3RfZGlyIHRvb2xzIHRoYXQgYWxsb3dzIHVzZXJzIHRvIGFwcHJvdmVcbiAqIGFjY2Vzc2luZyBwYXRocyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UsIHdpdGggYW4gb3B0aW9uIHRvIGFsbG93IGFsbCBhY2Nlc3NcbiAqIGZyb20gYSBjb250YWluaW5nIGZvbGRlciBmb3IgdGhlIGN1cnJlbnQgY2hhdCBzZXNzaW9uLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdEV4dGVybmFsUGF0aENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiwgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBjYW5Vc2VEZWZhdWx0QXBwcm92YWxzID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkZvbGRlckFsbG93bGlzdCA9IG5ldyBSZXNvdXJjZU1hcDxSZXNvdXJjZVNldD4oKTtcblx0LyoqIENhY2hlIG9mIHBhdGggVVJJIC0+IHJlc29sdmVkIGdpdCByb290IFVSSSAob3IgbnVsbCBpZiBub3QgaW4gYSByZXBvKSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9naXRSb290Q2FjaGUgPSBuZXcgUmVzb3VyY2VNYXA8VVJJIHwgbnVsbD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQWxsb3dsaXN0PzogT2JzZXJ2YWJsZU1lbWVudG88cmVhZG9ubHkgc3RyaW5nW10+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldFBhdGhJbmZvOiAocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYpID0+IElFeHRlcm5hbFBhdGhJbmZvIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9maW5kR2l0Um9vdD86IChwYXRoVXJpOiBVUkkpID0+IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPixcblx0XHRzdG9yYWdlU2VydmljZT86IElTdG9yYWdlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9waWNrRm9sZGVyPzogKCkgPT4gUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+LFxuXHQpIHtcblx0XHRpZiAoc3RvcmFnZVNlcnZpY2UpIHtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZUFsbG93bGlzdCA9IHdvcmtzcGFjZUFsbG93bGlzdE1lbWVudG8oU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl93b3Jrc3BhY2VBbGxvd2xpc3Q/LmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFdvcmtzcGFjZUZvbGRlcnMoKTogUmVzb3VyY2VTZXQge1xuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlQWxsb3dsaXN0KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNldCA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGZvciAoY29uc3QgcyBvZiB0aGlzLl93b3Jrc3BhY2VBbGxvd2xpc3QuZ2V0KCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNldC5hZGQoVVJJLnBhcnNlKHMpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgbWFsZm9ybWVkIFVSSXNcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNldDtcblx0fVxuXG5cdHByaXZhdGUgX3NldFdvcmtzcGFjZUZvbGRlcnMoZm9sZGVyczogUmVzb3VyY2VTZXQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3dvcmtzcGFjZUFsbG93bGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1cmlTdHJpbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIGZvbGRlcnMpIHtcblx0XHRcdHVyaVN0cmluZ3MucHVzaCh1cmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3dvcmtzcGFjZUFsbG93bGlzdC5zZXQodXJpU3RyaW5ncywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldFByZUNvbmZpcm1BY3Rpb24ocmVmOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYpOiBDb25maXJtZWRSZWFzb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBhdGhJbmZvID0gdGhpcy5fZ2V0UGF0aEluZm8ocmVmKTtcblx0XHRpZiAoIXBhdGhJbmZvKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFBhcnNlIHRoZSBmaWxlIHBhdGggdG8gYSBVUklcblx0XHRsZXQgcGF0aFVyaTogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHRwYXRoVXJpID0gVVJJLmZpbGUocGF0aEluZm8ucGF0aCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gYSB3b3JraW5nIGRpcmVjdG9yeSBpcyBzZXQgKGFnZW50cyB3aW5kb3cpLCBpdCBpcyB0aGUgc291cmNlIG9mIHRydXRoXG5cdFx0Ly8gZm9yIGRldGVybWluaW5nIHdoZXRoZXIgYSBwYXRoIGlzIHdvcmtzcGFjZS1pbnRlcm5hbC4gT25seSBmYWxsIGJhY2sgdG8gdGhlXG5cdFx0Ly8gd29ya3NwYWNlLWxldmVsIGFsbG93bGlzdCB3aGVuIG5vIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHNwZWNpZmllZC5cblx0XHRpZiAocmVmLndvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQocGF0aFVyaSwgcmVmLndvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLl9nZXRXb3Jrc3BhY2VGb2xkZXJzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlclVyaSBvZiB3b3Jrc3BhY2VGb2xkZXJzKSB7XG5cdFx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQocGF0aFVyaSwgZm9sZGVyVXJpKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBzZXNzaW9uLWxldmVsIGFsbG93bGlzdFxuXHRcdGlmIChyZWYuY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkZvbGRlcnMgPSB0aGlzLl9zZXNzaW9uRm9sZGVyQWxsb3dsaXN0LmdldChyZWYuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoc2Vzc2lvbkZvbGRlcnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBmb2xkZXJVcmkgb2Ygc2Vzc2lvbkZvbGRlcnMpIHtcblx0XHRcdFx0XHRpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KHBhdGhVcmksIGZvbGRlclVyaSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFByZUNvbmZpcm1BY3Rpb25zKHJlZjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmKTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9uc1tdIHtcblx0XHRjb25zdCBwYXRoSW5mbyA9IHRoaXMuX2dldFBhdGhJbmZvKHJlZik7XG5cdFx0aWYgKCFwYXRoSW5mbyB8fCAhcmVmLmNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBQYXJzZSB0aGUgcGF0aCB0byBhIFVSSVxuXHRcdGxldCBwYXRoVXJpOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHBhdGhVcmkgPSBVUkkuZmlsZShwYXRoSW5mby5wYXRoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBGb3IgZGlyZWN0b3JpZXMsIHVzZSB0aGUgcGF0aCBpdHNlbGY7IGZvciBmaWxlcywgdXNlIHRoZSBwYXJlbnQgZGlyZWN0b3J5XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gcGF0aEluZm8uaXNEaXJlY3RvcnkgPyBwYXRoVXJpIDogZGlybmFtZShwYXRoVXJpKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSByZWYuY2hhdFNlc3Npb25SZXNvdXJjZTtcblxuXHRcdGNvbnN0IGFjdGlvbnM6IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkFjdGlvbnNbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd0ZvbGRlclNlc3Npb24nLCAnQWxsb3cgdGhpcyBmb2xkZXIgaW4gdGhpcyBzZXNzaW9uJyksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93Rm9sZGVyU2Vzc2lvbkRldGFpbCcsICdBbGxvdyByZWFkaW5nIGZpbGVzIGZyb20gdGhpcyBmb2xkZXIgd2l0aG91dCBmdXJ0aGVyIGNvbmZpcm1hdGlvbiBpbiB0aGlzIGNoYXQgc2Vzc2lvbicpLFxuXHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRsZXQgZm9sZGVycyA9IHRoaXMuX3Nlc3Npb25Gb2xkZXJBbGxvd2xpc3QuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKCFmb2xkZXJzKSB7XG5cdFx0XHRcdFx0XHRmb2xkZXJzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uRm9sZGVyQWxsb3dsaXN0LnNldChzZXNzaW9uUmVzb3VyY2UsIGZvbGRlcnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb2xkZXJzLmFkZChmb2xkZXJVcmkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdC8vIElmIGEgZ2l0IHJvb3QgZmluZGVyIGlzIGF2YWlsYWJsZSwgb2ZmZXIgdG8gYWxsb3cgdGhlIGVudGlyZSByZXBvc2l0b3J5XG5cdFx0aWYgKHRoaXMuX2ZpbmRHaXRSb290KSB7XG5cdFx0XHRjb25zdCBmaW5kR2l0Um9vdCA9IHRoaXMuX2ZpbmRHaXRSb290O1xuXHRcdFx0Y29uc3QgZ2l0Um9vdENhY2hlID0gdGhpcy5fZ2l0Um9vdENhY2hlO1xuXHRcdFx0Y29uc3QgYWxsb3dsaXN0ID0gdGhpcy5fc2Vzc2lvbkZvbGRlckFsbG93bGlzdDtcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgd2UgYWxyZWFkeSBrbm93IHRoZSBnaXQgcm9vdCBmb3IgdGhpcyBwYXRoIChvciB0aGF0IHRoZXJlIGlzIG5vbmUpXG5cdFx0XHRjb25zdCBjYWNoZWQgPSBnaXRSb290Q2FjaGUuZ2V0KHBhdGhVcmkpO1xuXHRcdFx0aWYgKGNhY2hlZCA9PT0gbnVsbCkge1xuXHRcdFx0XHQvLyBQcmV2aW91c2x5IHJlc29sdmVkOiBub3QgaW4gYSBnaXQgcmVwb3NpdG9yeSwgZG9uJ3Qgc2hvdyB0aGUgb3B0aW9uXG5cdFx0XHR9IGVsc2UgaWYgKGNhY2hlZCkge1xuXHRcdFx0XHQvLyBQcmV2aW91c2x5IHJlc29sdmVkOiBzaG93IHdpdGggdGhlIGtub3duIHJlcG8gcGF0aFxuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsb3dSZXBvU2Vzc2lvbicsICdBbGxvdyBhbGwgZmlsZXMgaW4gdGhpcyByZXBvc2l0b3J5IGZvciB0aGlzIHNlc3Npb24nKSxcblx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhbGxvd1JlcG9TZXNzaW9uRGV0YWlsJywgJ0FsbG93IHJlYWRpbmcgZmlsZXMgZnJvbSB7MH0nLCBjYWNoZWQuZnNQYXRoKSxcblx0XHRcdFx0XHRzZWxlY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGxldCBmb2xkZXJzID0gYWxsb3dsaXN0LmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0aWYgKCFmb2xkZXJzKSB7XG5cdFx0XHRcdFx0XHRcdGZvbGRlcnMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRcdFx0XHRcdFx0YWxsb3dsaXN0LnNldChzZXNzaW9uUmVzb3VyY2UsIGZvbGRlcnMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Zm9sZGVycy5hZGQoY2FjaGVkKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBOb3QgeWV0IHJlc29sdmVkOiBzaG93IHRoZSBvcHRpb24gYW5kIHJlc29sdmUgb24gc2VsZWN0aW9uXG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhbGxvd1JlcG9TZXNzaW9uJywgJ0FsbG93IGFsbCBmaWxlcyBpbiB0aGlzIHJlcG9zaXRvcnkgZm9yIHRoaXMgc2Vzc2lvbicpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FsbG93UmVwb1Nlc3Npb25EZXRhaWxMb29rdXAnLCAnTG9va3MgdXAgdGhlIGNvbnRhaW5pbmcgZ2l0IHJlcG9zaXRvcnkgZm9yIHRoaXMgcGF0aCcpLFxuXHRcdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgZ2l0Um9vdFVyaSA9IGF3YWl0IGZpbmRHaXRSb290KHBhdGhVcmkpO1xuXHRcdFx0XHRcdFx0Z2l0Um9vdENhY2hlLnNldChwYXRoVXJpLCBnaXRSb290VXJpID8/IG51bGwpO1xuXHRcdFx0XHRcdFx0bGV0IGZvbGRlcnMgPSBhbGxvd2xpc3QuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRpZiAoIWZvbGRlcnMpIHtcblx0XHRcdFx0XHRcdFx0Zm9sZGVycyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdFx0XHRcdFx0XHRhbGxvd2xpc3Quc2V0KHNlc3Npb25SZXNvdXJjZSwgZm9sZGVycyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyBJZiB3ZSBmb3VuZCB0aGUgZ2l0IHJvb3QsIGFsbG93IHRoZSBlbnRpcmUgcmVwbzsgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBqdXN0IHRoaXMgZm9sZGVyXG5cdFx0XHRcdFx0XHRmb2xkZXJzLmFkZChnaXRSb290VXJpID8/IGZvbGRlclVyaSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0Z2V0TWFuYWdlQWN0aW9ucygpOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb25RdWlja1RyZWVJdGVtW10ge1xuXHRcdGNvbnN0IGl0ZW1zOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb25RdWlja1RyZWVJdGVtW10gPSBbXTtcblxuXHRcdC8vIFdvcmtzcGFjZS1sZXZlbCBlbnRyaWVzIChwZXJzaXN0ZWQpXG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHRoaXMuX2dldFdvcmtzcGFjZUZvbGRlcnMoKTtcblx0XHRmb3IgKGNvbnN0IGZvbGRlclVyaSBvZiB3b3Jrc3BhY2VGb2xkZXJzKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmb2xkZXJVcmkpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtzcGFjZVNjb3BlJywgXCJXb3Jrc3BhY2VcIiksXG5cdFx0XHRcdGNoZWNrZWQ6IHRydWUsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ2hlY2tlZDogKGNoZWNrZWQpID0+IHtcblx0XHRcdFx0XHRpZiAoIWNoZWNrZWQpIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlcnMuZGVsZXRlKGZvbGRlclVyaSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXRXb3Jrc3BhY2VGb2xkZXJzKHdvcmtzcGFjZUZvbGRlcnMpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJzLmFkZChmb2xkZXJVcmkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2V0V29ya3NwYWNlRm9sZGVycyh3b3Jrc3BhY2VGb2xkZXJzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBTZXNzaW9uLWxldmVsIGVudHJpZXMgKGVwaGVtZXJhbClcblx0XHRjb25zdCBhbGxTZXNzaW9uRm9sZGVycyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGZvciAoY29uc3QgWywgZm9sZGVyc10gb2YgdGhpcy5fc2Vzc2lvbkZvbGRlckFsbG93bGlzdCkge1xuXHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgZm9sZGVycykge1xuXHRcdFx0XHRhbGxTZXNzaW9uRm9sZGVycy5hZGQoZm9sZGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBmb2xkZXJVcmkgb2YgYWxsU2Vzc2lvbkZvbGRlcnMpIHtcblx0XHRcdGNvbnN0IHdhc0luU2Vzc2lvbnMgPSBbLi4udGhpcy5fc2Vzc2lvbkZvbGRlckFsbG93bGlzdF0uZmlsdGVyKChbLCBmb2xkZXJzXSkgPT4gZm9sZGVycy5oYXMoZm9sZGVyVXJpKSk7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmb2xkZXJVcmkpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Nlc3Npb25TY29wZScsIFwiU2Vzc2lvblwiKSxcblx0XHRcdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VDaGVja2VkOiAoY2hlY2tlZCkgPT4ge1xuXHRcdFx0XHRcdGlmICghY2hlY2tlZCkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBbLCBmb2xkZXJzXSBvZiB3YXNJblNlc3Npb25zKSB7XG5cdFx0XHRcdFx0XHRcdGZvbGRlcnMuZGVsZXRlKGZvbGRlclVyaSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgWywgZm9sZGVyc10gb2Ygd2FzSW5TZXNzaW9ucykge1xuXHRcdFx0XHRcdFx0XHRmb2xkZXJzLmFkZChmb2xkZXJVcmkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFwiQWRkIFBhdGguLi5cIiBvcHRpb24gdG8gYWRkIGEgbmV3IHdvcmtzcGFjZS1sZXZlbCBmb2xkZXJcblx0XHRpZiAodGhpcy5fcGlja0ZvbGRlcikge1xuXHRcdFx0Y29uc3QgcGlja0ZvbGRlciA9IHRoaXMuX3BpY2tGb2xkZXI7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0cGlja2FibGU6IGZhbHNlLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FkZFBhdGgnLCBcIkFkZCBQYXRoLi4uXCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FkZFBhdGhEZXNjcmlwdGlvbicsIFwiQWxsb3cgYSBmb2xkZXIgaW4gdGhpcyB3b3Jrc3BhY2VcIiksXG5cdFx0XHRcdG9uRGlkT3BlbjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IGF3YWl0IHBpY2tGb2xkZXIoKTtcblx0XHRcdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy5fZ2V0V29ya3NwYWNlRm9sZGVycygpO1xuXHRcdFx0XHRcdFx0Zm9sZGVycy5hZGQodXJpKTtcblx0XHRcdFx0XHRcdHRoaXMuX3NldFdvcmtzcGFjZUZvbGRlcnMoZm9sZGVycyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uRm9sZGVyQWxsb3dsaXN0LmNsZWFyKCk7XG5cdFx0dGhpcy5fZ2l0Um9vdENhY2hlLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX3dvcmtzcGFjZUFsbG93bGlzdCkge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlQWxsb3dsaXN0LnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBUyxTQUFTLGtDQUFrQztBQUNwRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBNEIseUJBQXlCO0FBQ3JELFNBQTBCLGNBQWMscUJBQXFCO0FBQzdELFNBQTBCLHVCQUF1QjtBQVFqRCxNQUFNLDRCQUE0QixrQkFBcUM7QUFBQSxFQUN0RSxLQUFLO0FBQUEsRUFDTCxjQUFjLENBQUM7QUFBQSxFQUNmLFdBQVcsV0FBUyxLQUFLLFVBQVUsS0FBSztBQUFB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
