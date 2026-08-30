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
import { app } from "electron";
import { coalesce } from "../../../base/common/arrays.js";
import { ThrottledDelayer } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { normalizeDriveLetter, splitRecentLabel } from "../../../base/common/labels.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { basename, dirname, extUriBiasedIgnorePathCase, isEqual, originalFSPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { Promises } from "../../../base/node/pfs.js";
import { localize } from "../../../nls.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILifecycleMainService, LifecycleMainPhase } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { IApplicationStorageMainService } from "../../storage/electron-main/storageMainService.js";
import { isRecentFile, isRecentFolder, isRecentWorkspace, restoreRecentlyOpened, toStoreData } from "../common/workspaces.js";
import { WORKSPACE_EXTENSION } from "../../workspace/common/workspace.js";
import { getWorkspaceIdentifier } from "../common/workspaceIdentifier.js";
import { IWorkspacesManagementMainService } from "./workspacesManagementMainService.js";
import { ResourceMap } from "../../../base/common/map.js";
import { IDialogMainService } from "../../dialogs/electron-main/dialogMainService.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
const IWorkspacesHistoryMainService = createDecorator("workspacesHistoryMainService");
let WorkspacesHistoryMainService = class extends Disposable {
  constructor(logService, workspacesManagementMainService, lifecycleMainService, applicationStorageMainService, dialogMainService, environmentMainService) {
    super();
    this.logService = logService;
    this.workspacesManagementMainService = workspacesManagementMainService;
    this.lifecycleMainService = lifecycleMainService;
    this.applicationStorageMainService = applicationStorageMainService;
    this.dialogMainService = dialogMainService;
    this.environmentMainService = environmentMainService;
    this._onDidChangeRecentlyOpened = this._register(new Emitter());
    this.onDidChangeRecentlyOpened = this._onDidChangeRecentlyOpened.event;
    this.macOSRecentDocumentsUpdater = this._register(new ThrottledDelayer(800));
    this.registerListeners();
  }
  registerListeners() {
    this.lifecycleMainService.when(LifecycleMainPhase.Eventually).then(() => this.handleWindowsJumpList());
    this._register(this.workspacesManagementMainService.onDidEnterWorkspace((event) => this.addRecentlyOpened([{ workspace: event.workspace, remoteAuthority: event.window.remoteAuthority }])));
  }
  //#region Workspaces History
  async addRecentlyOpened(recentToAdd) {
    let workspaces = [];
    let files = [];
    for (const recent of recentToAdd) {
      if (isRecentWorkspace(recent)) {
        if (!this.workspacesManagementMainService.isUntitledWorkspace(recent.workspace) && !this.containsWorkspace(workspaces, recent.workspace)) {
          workspaces.push(recent);
        }
      } else if (isRecentFolder(recent)) {
        if (!this.containsFolder(workspaces, recent.folderUri)) {
          workspaces.push(recent);
        }
      } else {
        const alreadyExistsInHistory = this.containsFile(files, recent.fileUri);
        const shouldBeFiltered = recent.fileUri.scheme === Schemas.file && WorkspacesHistoryMainService.COMMON_FILES_FILTER.indexOf(basename(recent.fileUri)) >= 0;
        if (!alreadyExistsInHistory && !shouldBeFiltered) {
          files.push(recent);
          if (isWindows && recent.fileUri.scheme === Schemas.file && !this.environmentMainService.isPortable) {
            app.addRecentDocument(recent.fileUri.fsPath);
          }
        }
      }
    }
    const mergedEntries = await this.mergeEntriesFromStorage({ workspaces, files });
    workspaces = this.canonicalizeAgentSessionsWorkspaces(mergedEntries.workspaces);
    files = mergedEntries.files;
    if (workspaces.length > WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES) {
      workspaces.length = WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES;
    }
    if (files.length > WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES) {
      files.length = WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES;
    }
    await this.saveRecentlyOpened({ workspaces, files });
    this._onDidChangeRecentlyOpened.fire();
    if (isMacintosh && !this.environmentMainService.isPortable) {
      this.macOSRecentDocumentsUpdater.trigger(() => this.updateMacOSRecentDocuments());
    }
  }
  async removeRecentlyOpened(recentToRemove) {
    const keep = (recent) => {
      const uri = this.location(recent);
      for (const resourceToRemove of recentToRemove) {
        if (extUriBiasedIgnorePathCase.isEqual(resourceToRemove, uri)) {
          return false;
        }
      }
      return true;
    };
    const mru = await this.getRecentlyOpened();
    const workspaces = mru.workspaces.filter(keep);
    const files = mru.files.filter(keep);
    if (workspaces.length !== mru.workspaces.length || files.length !== mru.files.length) {
      await this.saveRecentlyOpened({ files, workspaces });
      this._onDidChangeRecentlyOpened.fire();
      if (isMacintosh && !this.environmentMainService.isPortable) {
        this.macOSRecentDocumentsUpdater.trigger(() => this.updateMacOSRecentDocuments());
      }
    }
  }
  async clearRecentlyOpened(options) {
    if (options?.confirm) {
      const { response } = await this.dialogMainService.showMessageBox({
        type: "warning",
        buttons: [
          localize({ key: "clearButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Clear"),
          localize({ key: "cancel", comment: ["&& denotes a mnemonic"] }, "&&Cancel")
        ],
        message: localize("confirmClearRecentsMessage", "Do you want to clear all recently opened files and workspaces?"),
        detail: localize("confirmClearDetail", "This action is irreversible!"),
        cancelId: 1
      });
      if (response !== 0) {
        return;
      }
    }
    await this.saveRecentlyOpened({ workspaces: [], files: [] });
    if (!this.environmentMainService.isPortable) {
      app.clearRecentDocuments();
    }
    this._onDidChangeRecentlyOpened.fire();
  }
  async getRecentlyOpened() {
    const recentlyOpened = await this.mergeEntriesFromStorage();
    return {
      workspaces: this.canonicalizeAgentSessionsWorkspaces(recentlyOpened.workspaces),
      files: recentlyOpened.files
    };
  }
  canonicalizeAgentSessionsWorkspaces(workspaces) {
    const result = [];
    let agentsWindowAdded = false;
    for (const recent of workspaces) {
      if (isRecentWorkspace(recent) && this.isAgentSessionsWorkspace(recent.workspace)) {
        if (!agentsWindowAdded) {
          agentsWindowAdded = true;
          result.push({
            workspace: getWorkspaceIdentifier(this.environmentMainService.agentSessionsWorkspace),
            label: localize("agentsWindowRecentWorkspace", "Agents Window")
          });
        }
      } else {
        result.push(recent);
      }
    }
    return result;
  }
  isAgentSessionsWorkspace(workspace) {
    if (isEqual(workspace.configPath, this.environmentMainService.agentSessionsWorkspace)) {
      return true;
    }
    const agentSessionsWorkspace = this.environmentMainService.agentSessionsWorkspace;
    return basename(workspace.configPath) === basename(agentSessionsWorkspace) && basename(dirname(workspace.configPath)) === basename(dirname(agentSessionsWorkspace));
  }
  async mergeEntriesFromStorage(existingEntries) {
    const mapWorkspaceIdToWorkspace = new ResourceMap((uri) => extUriBiasedIgnorePathCase.getComparisonKey(uri));
    if (existingEntries?.workspaces) {
      for (const workspace of existingEntries.workspaces) {
        mapWorkspaceIdToWorkspace.set(this.location(workspace), workspace);
      }
    }
    const mapFileIdToFile = new ResourceMap((uri) => extUriBiasedIgnorePathCase.getComparisonKey(uri));
    if (existingEntries?.files) {
      for (const file of existingEntries.files) {
        mapFileIdToFile.set(this.location(file), file);
      }
    }
    const recentFromStorage = await this.getRecentlyOpenedFromStorage();
    for (const recentWorkspaceFromStorage of recentFromStorage.workspaces) {
      const existingRecentWorkspace = mapWorkspaceIdToWorkspace.get(this.location(recentWorkspaceFromStorage));
      if (existingRecentWorkspace) {
        existingRecentWorkspace.label = existingRecentWorkspace.label ?? recentWorkspaceFromStorage.label;
      } else {
        mapWorkspaceIdToWorkspace.set(this.location(recentWorkspaceFromStorage), recentWorkspaceFromStorage);
      }
    }
    for (const recentFileFromStorage of recentFromStorage.files) {
      const existingRecentFile = mapFileIdToFile.get(this.location(recentFileFromStorage));
      if (existingRecentFile) {
        existingRecentFile.label = existingRecentFile.label ?? recentFileFromStorage.label;
      } else {
        mapFileIdToFile.set(this.location(recentFileFromStorage), recentFileFromStorage);
      }
    }
    return {
      workspaces: [...mapWorkspaceIdToWorkspace.values()],
      files: [...mapFileIdToFile.values()]
    };
  }
  async getRecentlyOpenedFromStorage() {
    await this.applicationStorageMainService.whenReady;
    let storedRecentlyOpened = void 0;
    const storedRecentlyOpenedRaw = this.applicationStorageMainService.get(WorkspacesHistoryMainService.RECENTLY_OPENED_STORAGE_KEY, StorageScope.APPLICATION_SHARED);
    if (typeof storedRecentlyOpenedRaw === "string") {
      try {
        storedRecentlyOpened = JSON.parse(storedRecentlyOpenedRaw);
      } catch (error) {
        this.logService.error("Unexpected error parsing opened paths list", error);
      }
    }
    return restoreRecentlyOpened(storedRecentlyOpened, this.logService);
  }
  async saveRecentlyOpened(recent) {
    await this.applicationStorageMainService.whenReady;
    this.applicationStorageMainService.store(WorkspacesHistoryMainService.RECENTLY_OPENED_STORAGE_KEY, JSON.stringify(toStoreData(recent)), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
  }
  location(recent) {
    if (isRecentFolder(recent)) {
      return recent.folderUri;
    }
    if (isRecentFile(recent)) {
      return recent.fileUri;
    }
    return recent.workspace.configPath;
  }
  containsWorkspace(recents, candidate) {
    return !!recents.find((recent) => isRecentWorkspace(recent) && recent.workspace.id === candidate.id);
  }
  containsFolder(recents, candidate) {
    return !!recents.find((recent) => isRecentFolder(recent) && extUriBiasedIgnorePathCase.isEqual(recent.folderUri, candidate));
  }
  containsFile(recents, candidate) {
    return !!recents.find((recent) => extUriBiasedIgnorePathCase.isEqual(recent.fileUri, candidate));
  }
  async handleWindowsJumpList() {
    if (!isWindows) {
      return;
    }
    if (this.environmentMainService.isPortable) {
      return;
    }
    await this.updateWindowsJumpList();
    this._register(this.onDidChangeRecentlyOpened(() => this.updateWindowsJumpList()));
  }
  async updateWindowsJumpList() {
    if (!isWindows) {
      return;
    }
    const jumpList = [];
    jumpList.push({
      type: "tasks",
      items: [
        {
          type: "task",
          title: localize("newWindow", "New Window"),
          description: localize("newWindowDesc", "Opens a new window"),
          program: process.execPath,
          args: "-n",
          // force new window
          iconPath: process.execPath,
          iconIndex: 0
        }
      ]
    });
    if ((await this.getRecentlyOpened()).workspaces.length > 0) {
      const jumpListSettings = app.getJumpListSettings();
      const toRemove = [];
      for (const item of jumpListSettings.removedItems) {
        const args = item.args;
        if (args) {
          const match = /^--(folder|file)-uri\s+"([^"]+)"$/.exec(args);
          if (match) {
            toRemove.push(URI.parse(match[2]));
          }
        }
      }
      await this.removeRecentlyOpened(toRemove);
      let hasWorkspaces = false;
      const items = coalesce((await this.getRecentlyOpened()).workspaces.slice(0, jumpListSettings.minItems).map((recent) => {
        const workspace = isRecentWorkspace(recent) ? recent.workspace : recent.folderUri;
        const { title, description } = this.getWindowsJumpListLabel(workspace, recent.label);
        let args;
        if (URI.isUri(workspace)) {
          args = `--folder-uri "${workspace.toString()}"`;
        } else {
          hasWorkspaces = true;
          args = `--file-uri "${workspace.configPath.toString()}"`;
        }
        return {
          type: "task",
          title: title.substr(0, 255),
          // Windows seems to be picky around the length of entries
          description: description.substr(0, 255),
          // (see https://github.com/microsoft/vscode/issues/111177)
          program: process.execPath,
          args,
          iconPath: "explorer.exe",
          // simulate folder icon
          iconIndex: 0
        };
      }));
      if (items.length > 0) {
        jumpList.push({
          type: "custom",
          name: hasWorkspaces ? localize("recentFoldersAndWorkspaces", "Recent Folders & Workspaces") : localize("recentFolders", "Recent Folders"),
          items
        });
      }
    }
    jumpList.push({
      type: "recent"
      // this enables to show files in the "recent" category
    });
    try {
      const res = app.setJumpList(jumpList);
      if (res && res !== "ok") {
        this.logService.warn(`updateWindowsJumpList#setJumpList unexpected result: ${res}`);
      }
    } catch (error) {
      this.logService.warn("updateWindowsJumpList#setJumpList", error);
    }
  }
  getWindowsJumpListLabel(workspace, recentLabel) {
    if (recentLabel) {
      return { title: splitRecentLabel(recentLabel).name, description: recentLabel };
    }
    if (URI.isUri(workspace)) {
      return { title: basename(workspace), description: this.renderJumpListPathDescription(workspace) };
    }
    if (this.workspacesManagementMainService.isUntitledWorkspace(workspace)) {
      return { title: localize("untitledWorkspace", "Untitled (Workspace)"), description: "" };
    }
    let filename = basename(workspace.configPath);
    if (filename.endsWith(WORKSPACE_EXTENSION)) {
      filename = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
    }
    return { title: localize("workspaceName", "{0} (Workspace)", filename), description: this.renderJumpListPathDescription(workspace.configPath) };
  }
  renderJumpListPathDescription(uri) {
    return uri.scheme === "file" ? normalizeDriveLetter(uri.fsPath) : uri.toString();
  }
  async updateMacOSRecentDocuments() {
    if (!isMacintosh) {
      return;
    }
    app.clearRecentDocuments();
    const mru = await this.getRecentlyOpened();
    const workspaceEntries = [];
    let entries = 0;
    for (let i = 0; i < mru.workspaces.length && entries < WorkspacesHistoryMainService.MAX_MACOS_DOCK_RECENT_WORKSPACES; i++) {
      const loc = this.location(mru.workspaces[i]);
      if (loc.scheme === Schemas.file) {
        const workspacePath = originalFSPath(loc);
        if (await Promises.exists(workspacePath)) {
          workspaceEntries.push(workspacePath);
          entries++;
        }
      }
    }
    const fileEntries = [];
    for (let i = 0; i < mru.files.length && entries < WorkspacesHistoryMainService.MAX_MACOS_DOCK_RECENT_ENTRIES_TOTAL; i++) {
      const loc = this.location(mru.files[i]);
      if (loc.scheme === Schemas.file) {
        const filePath = originalFSPath(loc);
        if (WorkspacesHistoryMainService.COMMON_FILES_FILTER.includes(basename(loc)) || // skip some well known file entries
        workspaceEntries.includes(filePath)) {
          continue;
        }
        if (await Promises.exists(filePath)) {
          fileEntries.push(filePath);
          entries++;
        }
      }
    }
    fileEntries.reverse().forEach((fileEntry) => app.addRecentDocument(fileEntry));
    workspaceEntries.reverse().forEach((workspaceEntry) => app.addRecentDocument(workspaceEntry));
  }
  //#endregion
};
WorkspacesHistoryMainService.MAX_TOTAL_RECENT_ENTRIES = 500;
WorkspacesHistoryMainService.RECENTLY_OPENED_STORAGE_KEY = "history.recentlyOpenedPathsList";
//#endregion
//#region macOS Dock / Windows JumpList
WorkspacesHistoryMainService.MAX_MACOS_DOCK_RECENT_WORKSPACES = 7;
// prefer higher number of workspaces...
WorkspacesHistoryMainService.MAX_MACOS_DOCK_RECENT_ENTRIES_TOTAL = 10;
// ...over number of files
// Exclude some very common files from the dock/taskbar
WorkspacesHistoryMainService.COMMON_FILES_FILTER = [
  "COMMIT_EDITMSG",
  "MERGE_MSG",
  "git-rebase-todo"
];
WorkspacesHistoryMainService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IWorkspacesManagementMainService),
  __decorateParam(2, ILifecycleMainService),
  __decorateParam(3, IApplicationStorageMainService),
  __decorateParam(4, IDialogMainService),
  __decorateParam(5, IEnvironmentMainService)
], WorkspacesHistoryMainService);
export {
  IWorkspacesHistoryMainService,
  WorkspacesHistoryMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcd29ya3NwYWNlc1xcZWxlY3Ryb24tbWFpblxcd29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFwcCwgSnVtcExpc3RDYXRlZ29yeSwgSnVtcExpc3RJdGVtIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IGFzIENvbW1vbkV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplRHJpdmVMZXR0ZXIsIHNwbGl0UmVjZW50TGFiZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBpc0VxdWFsLCBvcmlnaW5hbEZTUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZU1haW5TZXJ2aWNlLCBMaWZlY3ljbGVNYWluUGhhc2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvZWxlY3Ryb24tbWFpbi9saWZlY3ljbGVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9lbGVjdHJvbi1tYWluL3N0b3JhZ2VNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVjZW50LCBJUmVjZW50RmlsZSwgSVJlY2VudEZvbGRlciwgSVJlY2VudGx5T3BlbmVkLCBJUmVjZW50V29ya3NwYWNlLCBpc1JlY2VudEZpbGUsIGlzUmVjZW50Rm9sZGVyLCBpc1JlY2VudFdvcmtzcGFjZSwgcmVzdG9yZVJlY2VudGx5T3BlbmVkLCB0b1N0b3JlRGF0YSB9IGZyb20gJy4uL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VJZGVudGlmaWVyLCBXT1JLU1BBQ0VfRVhURU5TSU9OIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgZ2V0V29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uL2NvbW1vbi93b3Jrc3BhY2VJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlIH0gZnJvbSAnLi93b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElEaWFsb2dNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2RpYWxvZ3MvZWxlY3Ryb24tbWFpbi9kaWFsb2dNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2VsZWN0cm9uLW1haW4vZW52aXJvbm1lbnRNYWluU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZT4oJ3dvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQ6IENvbW1vbkV2ZW50PHZvaWQ+O1xuXG5cdGFkZFJlY2VudGx5T3BlbmVkKHJlY2VudHM6IElSZWNlbnRbXSk6IFByb21pc2U8dm9pZD47XG5cdGdldFJlY2VudGx5T3BlbmVkKCk6IFByb21pc2U8SVJlY2VudGx5T3BlbmVkPjtcblx0cmVtb3ZlUmVjZW50bHlPcGVuZWQocGF0aHM6IFVSSVtdKTogUHJvbWlzZTx2b2lkPjtcblx0Y2xlYXJSZWNlbnRseU9wZW5lZChvcHRpb25zPzogeyBjb25maXJtPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2Uge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9UT1RBTF9SRUNFTlRfRU5UUklFUyA9IDUwMDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBSRUNFTlRMWV9PUEVORURfU1RPUkFHRV9LRVkgPSAnaGlzdG9yeS5yZWNlbnRseU9wZW5lZFBhdGhzTGlzdCc7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkID0gdGhpcy5fb25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZXNNYW5hZ2VtZW50TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlOiBJV29ya3NwYWNlc01hbmFnZW1lbnRNYWluU2VydmljZSxcblx0XHRASUxpZmVjeWNsZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlTWFpblNlcnZpY2U6IElMaWZlY3ljbGVNYWluU2VydmljZSxcblx0XHRASUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2U6IElBcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZSxcblx0XHRASURpYWxvZ01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nTWFpblNlcnZpY2U6IElEaWFsb2dNYWluU2VydmljZSxcblx0XHRASUVudmlyb25tZW50TWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudE1haW5TZXJ2aWNlOiBJRW52aXJvbm1lbnRNYWluU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIEluc3RhbGwgd2luZG93IGp1bXAgbGlzdCBkZWxheWVkIGFmdGVyIG9wZW5pbmcgd2luZG93XG5cdFx0Ly8gYmVjYXVzZSBwZXJmIG1lYXN1cmVtZW50cyBoYXZlIHNob3duIHRoaXMgdG8gYmUgc2xvd1xuXHRcdHRoaXMubGlmZWN5Y2xlTWFpblNlcnZpY2Uud2hlbihMaWZlY3ljbGVNYWluUGhhc2UuRXZlbnR1YWxseSkudGhlbigoKSA9PiB0aGlzLmhhbmRsZVdpbmRvd3NKdW1wTGlzdCgpKTtcblxuXHRcdC8vIEFkZCB0byBoaXN0b3J5IHdoZW4gZW50ZXJpbmcgd29ya3NwYWNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLm9uRGlkRW50ZXJXb3Jrc3BhY2UoZXZlbnQgPT4gdGhpcy5hZGRSZWNlbnRseU9wZW5lZChbeyB3b3Jrc3BhY2U6IGV2ZW50LndvcmtzcGFjZSwgcmVtb3RlQXV0aG9yaXR5OiBldmVudC53aW5kb3cucmVtb3RlQXV0aG9yaXR5IH1dKSkpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIFdvcmtzcGFjZXMgSGlzdG9yeVxuXG5cdGFzeW5jIGFkZFJlY2VudGx5T3BlbmVkKHJlY2VudFRvQWRkOiBJUmVjZW50W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgd29ya3NwYWNlczogQXJyYXk8SVJlY2VudEZvbGRlciB8IElSZWNlbnRXb3Jrc3BhY2U+ID0gW107XG5cdFx0bGV0IGZpbGVzOiBJUmVjZW50RmlsZVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHJlY2VudCBvZiByZWNlbnRUb0FkZCkge1xuXG5cdFx0XHQvLyBXb3Jrc3BhY2Vcblx0XHRcdGlmIChpc1JlY2VudFdvcmtzcGFjZShyZWNlbnQpKSB7XG5cdFx0XHRcdGlmICghdGhpcy53b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLmlzVW50aXRsZWRXb3Jrc3BhY2UocmVjZW50LndvcmtzcGFjZSkgJiYgIXRoaXMuY29udGFpbnNXb3Jrc3BhY2Uod29ya3NwYWNlcywgcmVjZW50LndvcmtzcGFjZSkpIHtcblx0XHRcdFx0XHR3b3Jrc3BhY2VzLnB1c2gocmVjZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb2xkZXJcblx0XHRcdGVsc2UgaWYgKGlzUmVjZW50Rm9sZGVyKHJlY2VudCkpIHtcblx0XHRcdFx0aWYgKCF0aGlzLmNvbnRhaW5zRm9sZGVyKHdvcmtzcGFjZXMsIHJlY2VudC5mb2xkZXJVcmkpKSB7XG5cdFx0XHRcdFx0d29ya3NwYWNlcy5wdXNoKHJlY2VudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlsZVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGFscmVhZHlFeGlzdHNJbkhpc3RvcnkgPSB0aGlzLmNvbnRhaW5zRmlsZShmaWxlcywgcmVjZW50LmZpbGVVcmkpO1xuXHRcdFx0XHRjb25zdCBzaG91bGRCZUZpbHRlcmVkID0gcmVjZW50LmZpbGVVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5DT01NT05fRklMRVNfRklMVEVSLmluZGV4T2YoYmFzZW5hbWUocmVjZW50LmZpbGVVcmkpKSA+PSAwO1xuXG5cdFx0XHRcdGlmICghYWxyZWFkeUV4aXN0c0luSGlzdG9yeSAmJiAhc2hvdWxkQmVGaWx0ZXJlZCkge1xuXHRcdFx0XHRcdGZpbGVzLnB1c2gocmVjZW50KTtcblxuXHRcdFx0XHRcdC8vIEFkZCB0byByZWNlbnQgZG9jdW1lbnRzIChXaW5kb3dzIG9ubHksIG1hY09TIGxhdGVyKVxuXHRcdFx0XHRcdC8vIFNraXAgaW4gcG9ydGFibGUgbW9kZSB0byBhdm9pZCBsZWF2aW5nIHRyYWNlcyBvbiB0aGUgbWFjaGluZVxuXHRcdFx0XHRcdC8vIFNraXAgaW4gdGhlIHNlc3Npb25zIGFwcCB0byBhdm9pZCBwb2xsdXRpbmcgdGhlIGp1bXAgbGlzdFxuXHRcdFx0XHRcdGlmIChpc1dpbmRvd3MgJiYgcmVjZW50LmZpbGVVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgIXRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5pc1BvcnRhYmxlKSB7XG5cdFx0XHRcdFx0XHRhcHAuYWRkUmVjZW50RG9jdW1lbnQocmVjZW50LmZpbGVVcmkuZnNQYXRoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtZXJnZWRFbnRyaWVzID0gYXdhaXQgdGhpcy5tZXJnZUVudHJpZXNGcm9tU3RvcmFnZSh7IHdvcmtzcGFjZXMsIGZpbGVzIH0pO1xuXHRcdHdvcmtzcGFjZXMgPSB0aGlzLmNhbm9uaWNhbGl6ZUFnZW50U2Vzc2lvbnNXb3Jrc3BhY2VzKG1lcmdlZEVudHJpZXMud29ya3NwYWNlcyk7XG5cdFx0ZmlsZXMgPSBtZXJnZWRFbnRyaWVzLmZpbGVzO1xuXG5cdFx0aWYgKHdvcmtzcGFjZXMubGVuZ3RoID4gV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5NQVhfVE9UQUxfUkVDRU5UX0VOVFJJRVMpIHtcblx0XHRcdHdvcmtzcGFjZXMubGVuZ3RoID0gV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5NQVhfVE9UQUxfUkVDRU5UX0VOVFJJRVM7XG5cdFx0fVxuXG5cdFx0aWYgKGZpbGVzLmxlbmd0aCA+IFdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UuTUFYX1RPVEFMX1JFQ0VOVF9FTlRSSUVTKSB7XG5cdFx0XHRmaWxlcy5sZW5ndGggPSBXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLk1BWF9UT1RBTF9SRUNFTlRfRU5UUklFUztcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnNhdmVSZWNlbnRseU9wZW5lZCh7IHdvcmtzcGFjZXMsIGZpbGVzIH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQuZmlyZSgpO1xuXG5cdFx0Ly8gU2NoZWR1bGUgdXBkYXRlIHRvIHJlY2VudCBkb2N1bWVudHMgb24gbWFjT1MgZG9ja1xuXHRcdC8vIFNraXAgaW4gcG9ydGFibGUgbW9kZSB0byBhdm9pZCBsZWF2aW5nIHRyYWNlcyBvbiB0aGUgbWFjaGluZVxuXHRcdGlmIChpc01hY2ludG9zaCAmJiAhdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzUG9ydGFibGUpIHtcblx0XHRcdHRoaXMubWFjT1NSZWNlbnREb2N1bWVudHNVcGRhdGVyLnRyaWdnZXIoKCkgPT4gdGhpcy51cGRhdGVNYWNPU1JlY2VudERvY3VtZW50cygpKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW1vdmVSZWNlbnRseU9wZW5lZChyZWNlbnRUb1JlbW92ZTogVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBrZWVwID0gKHJlY2VudDogSVJlY2VudCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gdGhpcy5sb2NhdGlvbihyZWNlbnQpO1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZVRvUmVtb3ZlIG9mIHJlY2VudFRvUmVtb3ZlKSB7XG5cdFx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHJlc291cmNlVG9SZW1vdmUsIHVyaSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1ydSA9IGF3YWl0IHRoaXMuZ2V0UmVjZW50bHlPcGVuZWQoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VzID0gbXJ1LndvcmtzcGFjZXMuZmlsdGVyKGtlZXApO1xuXHRcdGNvbnN0IGZpbGVzID0gbXJ1LmZpbGVzLmZpbHRlcihrZWVwKTtcblxuXHRcdGlmICh3b3Jrc3BhY2VzLmxlbmd0aCAhPT0gbXJ1LndvcmtzcGFjZXMubGVuZ3RoIHx8IGZpbGVzLmxlbmd0aCAhPT0gbXJ1LmZpbGVzLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhpcy5zYXZlUmVjZW50bHlPcGVuZWQoeyBmaWxlcywgd29ya3NwYWNlcyB9KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQuZmlyZSgpO1xuXG5cdFx0XHQvLyBTY2hlZHVsZSB1cGRhdGUgdG8gcmVjZW50IGRvY3VtZW50cyBvbiBtYWNPUyBkb2NrXG5cdFx0XHQvLyBTa2lwIGluIHBvcnRhYmxlIG1vZGUgdG8gYXZvaWQgbGVhdmluZyB0cmFjZXMgb24gdGhlIG1hY2hpbmVcblx0XHRcdGlmIChpc01hY2ludG9zaCAmJiAhdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmlzUG9ydGFibGUpIHtcblx0XHRcdFx0dGhpcy5tYWNPU1JlY2VudERvY3VtZW50c1VwZGF0ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnVwZGF0ZU1hY09TUmVjZW50RG9jdW1lbnRzKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNsZWFyUmVjZW50bHlPcGVuZWQob3B0aW9ucz86IHsgY29uZmlybT86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChvcHRpb25zPy5jb25maXJtKSB7XG5cdFx0XHRjb25zdCB7IHJlc3BvbnNlIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ01haW5TZXJ2aWNlLnNob3dNZXNzYWdlQm94KHtcblx0XHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdjbGVhckJ1dHRvbkxhYmVsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ2xlYXJcIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdjYW5jZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDYW5jZWxcIilcblx0XHRcdFx0XSxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1DbGVhclJlY2VudHNNZXNzYWdlJywgXCJEbyB5b3Ugd2FudCB0byBjbGVhciBhbGwgcmVjZW50bHkgb3BlbmVkIGZpbGVzIGFuZCB3b3Jrc3BhY2VzP1wiKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybUNsZWFyRGV0YWlsJywgXCJUaGlzIGFjdGlvbiBpcyBpcnJldmVyc2libGUhXCIpLFxuXHRcdFx0XHRjYW5jZWxJZDogMVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChyZXNwb25zZSAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5zYXZlUmVjZW50bHlPcGVuZWQoeyB3b3Jrc3BhY2VzOiBbXSwgZmlsZXM6IFtdIH0pO1xuXG5cdFx0Ly8gU2tpcCBpbiBwb3J0YWJsZSBtb2RlIHRvIGF2b2lkIGxlYXZpbmcgdHJhY2VzIG9uIHRoZSBtYWNoaW5lXG5cdFx0aWYgKCF0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNQb3J0YWJsZSkge1xuXHRcdFx0YXBwLmNsZWFyUmVjZW50RG9jdW1lbnRzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIGdldFJlY2VudGx5T3BlbmVkKCk6IFByb21pc2U8SVJlY2VudGx5T3BlbmVkPiB7XG5cdFx0Y29uc3QgcmVjZW50bHlPcGVuZWQgPSBhd2FpdCB0aGlzLm1lcmdlRW50cmllc0Zyb21TdG9yYWdlKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0d29ya3NwYWNlczogdGhpcy5jYW5vbmljYWxpemVBZ2VudFNlc3Npb25zV29ya3NwYWNlcyhyZWNlbnRseU9wZW5lZC53b3Jrc3BhY2VzKSxcblx0XHRcdGZpbGVzOiByZWNlbnRseU9wZW5lZC5maWxlc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNhbm9uaWNhbGl6ZUFnZW50U2Vzc2lvbnNXb3Jrc3BhY2VzKHdvcmtzcGFjZXM6IEFycmF5PElSZWNlbnRXb3Jrc3BhY2UgfCBJUmVjZW50Rm9sZGVyPik6IEFycmF5PElSZWNlbnRXb3Jrc3BhY2UgfCBJUmVjZW50Rm9sZGVyPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBBcnJheTxJUmVjZW50V29ya3NwYWNlIHwgSVJlY2VudEZvbGRlcj4gPSBbXTtcblx0XHRsZXQgYWdlbnRzV2luZG93QWRkZWQgPSBmYWxzZTtcblxuXHRcdGZvciAoY29uc3QgcmVjZW50IG9mIHdvcmtzcGFjZXMpIHtcblx0XHRcdGlmIChpc1JlY2VudFdvcmtzcGFjZShyZWNlbnQpICYmIHRoaXMuaXNBZ2VudFNlc3Npb25zV29ya3NwYWNlKHJlY2VudC53b3Jrc3BhY2UpKSB7XG5cdFx0XHRcdGlmICghYWdlbnRzV2luZG93QWRkZWQpIHtcblx0XHRcdFx0XHRhZ2VudHNXaW5kb3dBZGRlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0d29ya3NwYWNlOiBnZXRXb3Jrc3BhY2VJZGVudGlmaWVyKHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlKSxcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRzV2luZG93UmVjZW50V29ya3NwYWNlJywgXCJBZ2VudHMgV2luZG93XCIpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHJlY2VudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgaXNBZ2VudFNlc3Npb25zV29ya3NwYWNlKHdvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRpZiAoaXNFcXVhbCh3b3Jrc3BhY2UuY29uZmlnUGF0aCwgdGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFnZW50U2Vzc2lvbnNXb3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBSZWNlbnRzIGNhbiByZXRhaW4gQWdlbnRzIHdvcmtzcGFjZXMgZnJvbSBvdGhlciBwcm9maWxlIGFuZCB3b3JrdHJlZSB1c2VyLWRhdGEgZGlyZWN0b3JpZXMuXG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSA9IHRoaXMuZW52aXJvbm1lbnRNYWluU2VydmljZS5hZ2VudFNlc3Npb25zV29ya3NwYWNlO1xuXHRcdHJldHVybiBiYXNlbmFtZSh3b3Jrc3BhY2UuY29uZmlnUGF0aCkgPT09IGJhc2VuYW1lKGFnZW50U2Vzc2lvbnNXb3Jrc3BhY2UpXG5cdFx0XHQmJiBiYXNlbmFtZShkaXJuYW1lKHdvcmtzcGFjZS5jb25maWdQYXRoKSkgPT09IGJhc2VuYW1lKGRpcm5hbWUoYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtZXJnZUVudHJpZXNGcm9tU3RvcmFnZShleGlzdGluZ0VudHJpZXM/OiBJUmVjZW50bHlPcGVuZWQpOiBQcm9taXNlPElSZWNlbnRseU9wZW5lZD4ge1xuXG5cdFx0Ly8gQnVpbGQgbWFwcyBmb3IgbW9yZSBlZmZpY2llbnQgbG9va3VwIG9mIGV4aXN0aW5nIGVudHJpZXMgdGhhdFxuXHRcdC8vIGFyZSBwYXNzZWQgaW4gYnkgc3RvcmluZyBiYXNlZCBvbiB3b3Jrc3BhY2UvZmlsZSBpZGVudGlmaWVyXG5cblx0XHRjb25zdCBtYXBXb3Jrc3BhY2VJZFRvV29ya3NwYWNlID0gbmV3IFJlc291cmNlTWFwPElSZWNlbnRGb2xkZXIgfCBJUmVjZW50V29ya3NwYWNlPih1cmkgPT4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblx0XHRpZiAoZXhpc3RpbmdFbnRyaWVzPy53b3Jrc3BhY2VzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZSBvZiBleGlzdGluZ0VudHJpZXMud29ya3NwYWNlcykge1xuXHRcdFx0XHRtYXBXb3Jrc3BhY2VJZFRvV29ya3NwYWNlLnNldCh0aGlzLmxvY2F0aW9uKHdvcmtzcGFjZSksIHdvcmtzcGFjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFwRmlsZUlkVG9GaWxlID0gbmV3IFJlc291cmNlTWFwPElSZWNlbnRGaWxlPih1cmkgPT4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblx0XHRpZiAoZXhpc3RpbmdFbnRyaWVzPy5maWxlcykge1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGV4aXN0aW5nRW50cmllcy5maWxlcykge1xuXHRcdFx0XHRtYXBGaWxlSWRUb0ZpbGUuc2V0KHRoaXMubG9jYXRpb24oZmlsZSksIGZpbGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1lcmdlIGluIGVudHJpZXMgZnJvbSBzdG9yYWdlLCBwcmVzZXJ2aW5nIGV4aXN0aW5nIGtub3duIGVudHJpZXNcblxuXHRcdGNvbnN0IHJlY2VudEZyb21TdG9yYWdlID0gYXdhaXQgdGhpcy5nZXRSZWNlbnRseU9wZW5lZEZyb21TdG9yYWdlKCk7XG5cdFx0Zm9yIChjb25zdCByZWNlbnRXb3Jrc3BhY2VGcm9tU3RvcmFnZSBvZiByZWNlbnRGcm9tU3RvcmFnZS53b3Jrc3BhY2VzKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZ1JlY2VudFdvcmtzcGFjZSA9IG1hcFdvcmtzcGFjZUlkVG9Xb3Jrc3BhY2UuZ2V0KHRoaXMubG9jYXRpb24ocmVjZW50V29ya3NwYWNlRnJvbVN0b3JhZ2UpKTtcblx0XHRcdGlmIChleGlzdGluZ1JlY2VudFdvcmtzcGFjZSkge1xuXHRcdFx0XHRleGlzdGluZ1JlY2VudFdvcmtzcGFjZS5sYWJlbCA9IGV4aXN0aW5nUmVjZW50V29ya3NwYWNlLmxhYmVsID8/IHJlY2VudFdvcmtzcGFjZUZyb21TdG9yYWdlLmxhYmVsO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFwV29ya3NwYWNlSWRUb1dvcmtzcGFjZS5zZXQodGhpcy5sb2NhdGlvbihyZWNlbnRXb3Jrc3BhY2VGcm9tU3RvcmFnZSksIHJlY2VudFdvcmtzcGFjZUZyb21TdG9yYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHJlY2VudEZpbGVGcm9tU3RvcmFnZSBvZiByZWNlbnRGcm9tU3RvcmFnZS5maWxlcykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdSZWNlbnRGaWxlID0gbWFwRmlsZUlkVG9GaWxlLmdldCh0aGlzLmxvY2F0aW9uKHJlY2VudEZpbGVGcm9tU3RvcmFnZSkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nUmVjZW50RmlsZSkge1xuXHRcdFx0XHRleGlzdGluZ1JlY2VudEZpbGUubGFiZWwgPSBleGlzdGluZ1JlY2VudEZpbGUubGFiZWwgPz8gcmVjZW50RmlsZUZyb21TdG9yYWdlLmxhYmVsO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFwRmlsZUlkVG9GaWxlLnNldCh0aGlzLmxvY2F0aW9uKHJlY2VudEZpbGVGcm9tU3RvcmFnZSksIHJlY2VudEZpbGVGcm9tU3RvcmFnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHdvcmtzcGFjZXM6IFsuLi5tYXBXb3Jrc3BhY2VJZFRvV29ya3NwYWNlLnZhbHVlcygpXSxcblx0XHRcdGZpbGVzOiBbLi4ubWFwRmlsZUlkVG9GaWxlLnZhbHVlcygpXVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFJlY2VudGx5T3BlbmVkRnJvbVN0b3JhZ2UoKTogUHJvbWlzZTxJUmVjZW50bHlPcGVuZWQ+IHtcblxuXHRcdC8vIFdhaXQgZm9yIGdsb2JhbCBzdG9yYWdlIHRvIGJlIHJlYWR5XG5cdFx0YXdhaXQgdGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZS53aGVuUmVhZHk7XG5cblx0XHRsZXQgc3RvcmVkUmVjZW50bHlPcGVuZWQ6IG9iamVjdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIEZpcnN0IHRyeSB3aXRoIHN0b3JhZ2Ugc2VydmljZVxuXHRcdGNvbnN0IHN0b3JlZFJlY2VudGx5T3BlbmVkUmF3ID0gdGhpcy5hcHBsaWNhdGlvblN0b3JhZ2VNYWluU2VydmljZS5nZXQoV29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5SRUNFTlRMWV9PUEVORURfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTl9TSEFSRUQpO1xuXHRcdGlmICh0eXBlb2Ygc3RvcmVkUmVjZW50bHlPcGVuZWRSYXcgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzdG9yZWRSZWNlbnRseU9wZW5lZCA9IEpTT04ucGFyc2Uoc3RvcmVkUmVjZW50bHlPcGVuZWRSYXcpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdVbmV4cGVjdGVkIGVycm9yIHBhcnNpbmcgb3BlbmVkIHBhdGhzIGxpc3QnLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3RvcmVSZWNlbnRseU9wZW5lZChzdG9yZWRSZWNlbnRseU9wZW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2F2ZVJlY2VudGx5T3BlbmVkKHJlY2VudDogSVJlY2VudGx5T3BlbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBXYWl0IGZvciBnbG9iYWwgc3RvcmFnZSB0byBiZSByZWFkeVxuXHRcdGF3YWl0IHRoaXMuYXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2Uud2hlblJlYWR5O1xuXG5cdFx0Ly8gU3RvcmUgaW4gYXBwbGljYXRpb24gc2hhcmVkIHN0b3JhZ2UgKGJ1dCBkbyBub3Qgc3luYyBzaW5jZSB0aGlzIGlzIG1haW5seSBsb2NhbCBwYXRocylcblx0XHR0aGlzLmFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlLnN0b3JlKFdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UuUkVDRU5UTFlfT1BFTkVEX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeSh0b1N0b3JlRGF0YShyZWNlbnQpKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OX1NIQVJFRCwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgbG9jYXRpb24ocmVjZW50OiBJUmVjZW50KTogVVJJIHtcblx0XHRpZiAoaXNSZWNlbnRGb2xkZXIocmVjZW50KSkge1xuXHRcdFx0cmV0dXJuIHJlY2VudC5mb2xkZXJVcmk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUmVjZW50RmlsZShyZWNlbnQpKSB7XG5cdFx0XHRyZXR1cm4gcmVjZW50LmZpbGVVcmk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlY2VudC53b3Jrc3BhY2UuY29uZmlnUGF0aDtcblx0fVxuXG5cdHByaXZhdGUgY29udGFpbnNXb3Jrc3BhY2UocmVjZW50czogSVJlY2VudFtdLCBjYW5kaWRhdGU6IElXb3Jrc3BhY2VJZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhcmVjZW50cy5maW5kKHJlY2VudCA9PiBpc1JlY2VudFdvcmtzcGFjZShyZWNlbnQpICYmIHJlY2VudC53b3Jrc3BhY2UuaWQgPT09IGNhbmRpZGF0ZS5pZCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnRhaW5zRm9sZGVyKHJlY2VudHM6IElSZWNlbnRbXSwgY2FuZGlkYXRlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFyZWNlbnRzLmZpbmQocmVjZW50ID0+IGlzUmVjZW50Rm9sZGVyKHJlY2VudCkgJiYgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChyZWNlbnQuZm9sZGVyVXJpLCBjYW5kaWRhdGUpKTtcblx0fVxuXG5cdHByaXZhdGUgY29udGFpbnNGaWxlKHJlY2VudHM6IElSZWNlbnRGaWxlW10sIGNhbmRpZGF0ZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhcmVjZW50cy5maW5kKHJlY2VudCA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHJlY2VudC5maWxlVXJpLCBjYW5kaWRhdGUpKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cblx0Ly8jcmVnaW9uIG1hY09TIERvY2sgLyBXaW5kb3dzIEp1bXBMaXN0XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX01BQ09TX0RPQ0tfUkVDRU5UX1dPUktTUEFDRVMgPSA3OyBcdFx0Ly8gcHJlZmVyIGhpZ2hlciBudW1iZXIgb2Ygd29ya3NwYWNlcy4uLlxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfTUFDT1NfRE9DS19SRUNFTlRfRU5UUklFU19UT1RBTCA9IDEwOyBcdC8vIC4uLm92ZXIgbnVtYmVyIG9mIGZpbGVzXG5cblx0Ly8gRXhjbHVkZSBzb21lIHZlcnkgY29tbW9uIGZpbGVzIGZyb20gdGhlIGRvY2svdGFza2JhclxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDT01NT05fRklMRVNfRklMVEVSID0gW1xuXHRcdCdDT01NSVRfRURJVE1TRycsXG5cdFx0J01FUkdFX01TRycsXG5cdFx0J2dpdC1yZWJhc2UtdG9kbydcblx0XTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hY09TUmVjZW50RG9jdW1lbnRzVXBkYXRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZWREZWxheWVyPHZvaWQ+KDgwMCkpO1xuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlV2luZG93c0p1bXBMaXN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgb24gd2luZG93c1xuXHRcdH1cblxuXHRcdC8vIFNraXAgaW4gcG9ydGFibGUgbW9kZSB0byBhdm9pZCBsZWF2aW5nIHRyYWNlcyBvbiB0aGUgbWFjaGluZVxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuaXNQb3J0YWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMudXBkYXRlV2luZG93c0p1bXBMaXN0KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkKCgpID0+IHRoaXMudXBkYXRlV2luZG93c0p1bXBMaXN0KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlV2luZG93c0p1bXBMaXN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgb24gd2luZG93c1xuXHRcdH1cblxuXHRcdGNvbnN0IGp1bXBMaXN0OiBKdW1wTGlzdENhdGVnb3J5W10gPSBbXTtcblxuXHRcdC8vIFRhc2tzXG5cdFx0anVtcExpc3QucHVzaCh7XG5cdFx0XHR0eXBlOiAndGFza3MnLFxuXHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0YXNrJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25ld1dpbmRvdycsIFwiTmV3IFdpbmRvd1wiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ25ld1dpbmRvd0Rlc2MnLCBcIk9wZW5zIGEgbmV3IHdpbmRvd1wiKSxcblx0XHRcdFx0XHRwcm9ncmFtOiBwcm9jZXNzLmV4ZWNQYXRoLFxuXHRcdFx0XHRcdGFyZ3M6ICctbicsIC8vIGZvcmNlIG5ldyB3aW5kb3dcblx0XHRcdFx0XHRpY29uUGF0aDogcHJvY2Vzcy5leGVjUGF0aCxcblx0XHRcdFx0XHRpY29uSW5kZXg6IDBcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXG5cdFx0Ly8gUmVjZW50IFdvcmtzcGFjZXNcblx0XHRpZiAoKGF3YWl0IHRoaXMuZ2V0UmVjZW50bHlPcGVuZWQoKSkud29ya3NwYWNlcy5sZW5ndGggPiAwKSB7XG5cblx0XHRcdC8vIFRoZSB1c2VyIG1pZ2h0IGhhdmUgbWVhbndoaWxlIHJlbW92ZWQgaXRlbXMgZnJvbSB0aGUganVtcCBsaXN0IGFuZCB3ZSBoYXZlIHRvIHJlc3BlY3QgdGhhdFxuXHRcdFx0Ly8gc28gd2UgbmVlZCB0byB1cGRhdGUgb3VyIGxpc3Qgb2YgcmVjZW50IHBhdGhzIHdpdGggdGhlIGNob2ljZSBvZiB0aGUgdXNlciB0byBub3QgYWRkIHRoZW0gYWdhaW5cblx0XHRcdC8vIEFsc286IFdpbmRvd3Mgd2lsbCBub3Qgc2hvdyBvdXIgY3VzdG9tIGNhdGVnb3J5IGF0IGFsbCBpZiB0aGVyZSBpcyBhbnkgZW50cnkgd2hpY2ggd2FzIHJlbW92ZWRcblx0XHRcdC8vIGJ5IHRoZSB1c2VyISBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE1MDUyXG5cdFx0XHRjb25zdCBqdW1wTGlzdFNldHRpbmdzID0gYXBwLmdldEp1bXBMaXN0U2V0dGluZ3MoKTtcblx0XHRcdGNvbnN0IHRvUmVtb3ZlOiBVUklbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGp1bXBMaXN0U2V0dGluZ3MucmVtb3ZlZEl0ZW1zKSB7XG5cdFx0XHRcdGNvbnN0IGFyZ3MgPSBpdGVtLmFyZ3M7XG5cdFx0XHRcdGlmIChhcmdzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSAvXi0tKGZvbGRlcnxmaWxlKS11cmlcXHMrXCIoW15cIl0rKVwiJC8uZXhlYyhhcmdzKTtcblx0XHRcdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0XHRcdHRvUmVtb3ZlLnB1c2goVVJJLnBhcnNlKG1hdGNoWzJdKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLnJlbW92ZVJlY2VudGx5T3BlbmVkKHRvUmVtb3ZlKTtcblxuXHRcdFx0Ly8gQWRkIGVudHJpZXMgdXAgdG8gdGhlIHNsb3QgY291bnQgRXhwbG9yZXIgcmVxdWVzdGVkIChqdW1wTGlzdFNldHRpbmdzLm1pbkl0ZW1zKS5cblx0XHRcdGxldCBoYXNXb3Jrc3BhY2VzID0gZmFsc2U7XG5cdFx0XHRjb25zdCBpdGVtczogSnVtcExpc3RJdGVtW10gPSBjb2FsZXNjZSgoYXdhaXQgdGhpcy5nZXRSZWNlbnRseU9wZW5lZCgpKS53b3Jrc3BhY2VzLnNsaWNlKDAsIGp1bXBMaXN0U2V0dGluZ3MubWluSXRlbXMpLm1hcChyZWNlbnQgPT4ge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBpc1JlY2VudFdvcmtzcGFjZShyZWNlbnQpID8gcmVjZW50LndvcmtzcGFjZSA6IHJlY2VudC5mb2xkZXJVcmk7XG5cblx0XHRcdFx0Y29uc3QgeyB0aXRsZSwgZGVzY3JpcHRpb24gfSA9IHRoaXMuZ2V0V2luZG93c0p1bXBMaXN0TGFiZWwod29ya3NwYWNlLCByZWNlbnQubGFiZWwpO1xuXHRcdFx0XHRsZXQgYXJncztcblx0XHRcdFx0aWYgKFVSSS5pc1VyaSh3b3Jrc3BhY2UpKSB7XG5cdFx0XHRcdFx0YXJncyA9IGAtLWZvbGRlci11cmkgXCIke3dvcmtzcGFjZS50b1N0cmluZygpfVwiYDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRoYXNXb3Jrc3BhY2VzID0gdHJ1ZTtcblx0XHRcdFx0XHRhcmdzID0gYC0tZmlsZS11cmkgXCIke3dvcmtzcGFjZS5jb25maWdQYXRoLnRvU3RyaW5nKCl9XCJgO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAndGFzaycsXG5cdFx0XHRcdFx0dGl0bGU6IHRpdGxlLnN1YnN0cigwLCAyNTUpLCBcdFx0XHRcdC8vIFdpbmRvd3Mgc2VlbXMgdG8gYmUgcGlja3kgYXJvdW5kIHRoZSBsZW5ndGggb2YgZW50cmllc1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbi5zdWJzdHIoMCwgMjU1KSxcdC8vIChzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExMTE3Nylcblx0XHRcdFx0XHRwcm9ncmFtOiBwcm9jZXNzLmV4ZWNQYXRoLFxuXHRcdFx0XHRcdGFyZ3MsXG5cdFx0XHRcdFx0aWNvblBhdGg6ICdleHBsb3Jlci5leGUnLCAvLyBzaW11bGF0ZSBmb2xkZXIgaWNvblxuXHRcdFx0XHRcdGljb25JbmRleDogMFxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRqdW1wTGlzdC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnY3VzdG9tJyxcblx0XHRcdFx0XHRuYW1lOiBoYXNXb3Jrc3BhY2VzID8gbG9jYWxpemUoJ3JlY2VudEZvbGRlcnNBbmRXb3Jrc3BhY2VzJywgXCJSZWNlbnQgRm9sZGVycyAmIFdvcmtzcGFjZXNcIikgOiBsb2NhbGl6ZSgncmVjZW50Rm9sZGVycycsIFwiUmVjZW50IEZvbGRlcnNcIiksXG5cdFx0XHRcdFx0aXRlbXNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVjZW50XG5cdFx0anVtcExpc3QucHVzaCh7XG5cdFx0XHR0eXBlOiAncmVjZW50JyAvLyB0aGlzIGVuYWJsZXMgdG8gc2hvdyBmaWxlcyBpbiB0aGUgXCJyZWNlbnRcIiBjYXRlZ29yeVxuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlcyA9IGFwcC5zZXRKdW1wTGlzdChqdW1wTGlzdCk7XG5cdFx0XHRpZiAocmVzICYmIHJlcyAhPT0gJ29rJykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgdXBkYXRlV2luZG93c0p1bXBMaXN0I3NldEp1bXBMaXN0IHVuZXhwZWN0ZWQgcmVzdWx0OiAke3Jlc31gKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ3VwZGF0ZVdpbmRvd3NKdW1wTGlzdCNzZXRKdW1wTGlzdCcsIGVycm9yKTsgLy8gc2luY2Ugc2V0SnVtcExpc3QgaXMgcmVsYXRpdmVseSBuZXcgQVBJLCBtYWtlIHN1cmUgdG8gZ3VhcmQgZm9yIGVycm9yc1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0V2luZG93c0p1bXBMaXN0TGFiZWwod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IFVSSSwgcmVjZW50TGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgdGl0bGU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9IHtcblxuXHRcdC8vIFByZWZlciByZWNlbnQgbGFiZWxcblx0XHRpZiAocmVjZW50TGFiZWwpIHtcblx0XHRcdHJldHVybiB7IHRpdGxlOiBzcGxpdFJlY2VudExhYmVsKHJlY2VudExhYmVsKS5uYW1lLCBkZXNjcmlwdGlvbjogcmVjZW50TGFiZWwgfTtcblx0XHR9XG5cblx0XHQvLyBTaW5nbGUgRm9sZGVyXG5cdFx0aWYgKFVSSS5pc1VyaSh3b3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4geyB0aXRsZTogYmFzZW5hbWUod29ya3NwYWNlKSwgZGVzY3JpcHRpb246IHRoaXMucmVuZGVySnVtcExpc3RQYXRoRGVzY3JpcHRpb24od29ya3NwYWNlKSB9O1xuXHRcdH1cblxuXHRcdC8vIFdvcmtzcGFjZTogVW50aXRsZWRcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VzTWFuYWdlbWVudE1haW5TZXJ2aWNlLmlzVW50aXRsZWRXb3Jrc3BhY2Uod29ya3NwYWNlKSkge1xuXHRcdFx0cmV0dXJuIHsgdGl0bGU6IGxvY2FsaXplKCd1bnRpdGxlZFdvcmtzcGFjZScsIFwiVW50aXRsZWQgKFdvcmtzcGFjZSlcIiksIGRlc2NyaXB0aW9uOiAnJyB9O1xuXHRcdH1cblxuXHRcdC8vIFdvcmtzcGFjZTogbm9ybWFsXG5cdFx0bGV0IGZpbGVuYW1lID0gYmFzZW5hbWUod29ya3NwYWNlLmNvbmZpZ1BhdGgpO1xuXHRcdGlmIChmaWxlbmFtZS5lbmRzV2l0aChXT1JLU1BBQ0VfRVhURU5TSU9OKSkge1xuXHRcdFx0ZmlsZW5hbWUgPSBmaWxlbmFtZS5zdWJzdHIoMCwgZmlsZW5hbWUubGVuZ3RoIC0gV09SS1NQQUNFX0VYVEVOU0lPTi5sZW5ndGggLSAxKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyB0aXRsZTogbG9jYWxpemUoJ3dvcmtzcGFjZU5hbWUnLCBcInswfSAoV29ya3NwYWNlKVwiLCBmaWxlbmFtZSksIGRlc2NyaXB0aW9uOiB0aGlzLnJlbmRlckp1bXBMaXN0UGF0aERlc2NyaXB0aW9uKHdvcmtzcGFjZS5jb25maWdQYXRoKSB9O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJKdW1wTGlzdFBhdGhEZXNjcmlwdGlvbih1cmk6IFVSSSkge1xuXHRcdHJldHVybiB1cmkuc2NoZW1lID09PSAnZmlsZScgPyBub3JtYWxpemVEcml2ZUxldHRlcih1cmkuZnNQYXRoKSA6IHVyaS50b1N0cmluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVNYWNPU1JlY2VudERvY3VtZW50cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWlzTWFjaW50b3NoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2UgY2xlYXIgYWxsIGRvY3VtZW50cyBmaXJzdCB0byBlbnN1cmUgYW4gdXAtdG8tZGF0ZSB2aWV3IG9uIHRoZSBzZXQuIFNpbmNlIGVudHJpZXNcblx0XHQvLyBjYW4gZ2V0IGRlbGV0ZWQgb24gZGlzaywgdGhpcyBlbnN1cmVzIHRoYXQgdGhlIGxpc3QgaXMgYWx3YXlzIHZhbGlkXG5cdFx0YXBwLmNsZWFyUmVjZW50RG9jdW1lbnRzKCk7XG5cblx0XHRjb25zdCBtcnUgPSBhd2FpdCB0aGlzLmdldFJlY2VudGx5T3BlbmVkKCk7XG5cblx0XHQvLyBDb2xsZWN0IG1heC1OIHJlY2VudCB3b3Jrc3BhY2VzIHRoYXQgYXJlIGtub3duIHRvIGV4aXN0XG5cdFx0Y29uc3Qgd29ya3NwYWNlRW50cmllczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgZW50cmllcyA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtcnUud29ya3NwYWNlcy5sZW5ndGggJiYgZW50cmllcyA8IFdvcmtzcGFjZXNIaXN0b3J5TWFpblNlcnZpY2UuTUFYX01BQ09TX0RPQ0tfUkVDRU5UX1dPUktTUEFDRVM7IGkrKykge1xuXHRcdFx0Y29uc3QgbG9jID0gdGhpcy5sb2NhdGlvbihtcnUud29ya3NwYWNlc1tpXSk7XG5cdFx0XHRpZiAobG9jLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZVBhdGggPSBvcmlnaW5hbEZTUGF0aChsb2MpO1xuXHRcdFx0XHRpZiAoYXdhaXQgUHJvbWlzZXMuZXhpc3RzKHdvcmtzcGFjZVBhdGgpKSB7XG5cdFx0XHRcdFx0d29ya3NwYWNlRW50cmllcy5wdXNoKHdvcmtzcGFjZVBhdGgpO1xuXHRcdFx0XHRcdGVudHJpZXMrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbGxlY3QgbWF4LU4gcmVjZW50IGZpbGVzIHRoYXQgYXJlIGtub3duIHRvIGV4aXN0XG5cdFx0Y29uc3QgZmlsZUVudHJpZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtcnUuZmlsZXMubGVuZ3RoICYmIGVudHJpZXMgPCBXb3Jrc3BhY2VzSGlzdG9yeU1haW5TZXJ2aWNlLk1BWF9NQUNPU19ET0NLX1JFQ0VOVF9FTlRSSUVTX1RPVEFMOyBpKyspIHtcblx0XHRcdGNvbnN0IGxvYyA9IHRoaXMubG9jYXRpb24obXJ1LmZpbGVzW2ldKTtcblx0XHRcdGlmIChsb2Muc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0Y29uc3QgZmlsZVBhdGggPSBvcmlnaW5hbEZTUGF0aChsb2MpO1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0V29ya3NwYWNlc0hpc3RvcnlNYWluU2VydmljZS5DT01NT05fRklMRVNfRklMVEVSLmluY2x1ZGVzKGJhc2VuYW1lKGxvYykpIHx8IC8vIHNraXAgc29tZSB3ZWxsIGtub3duIGZpbGUgZW50cmllc1xuXHRcdFx0XHRcdHdvcmtzcGFjZUVudHJpZXMuaW5jbHVkZXMoZmlsZVBhdGgpXHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIHByZWZlciBhIHdvcmtzcGFjZSBlbnRyeSBvdmVyIGEgZmlsZSBlbnRyeSAoZS5nLiBmb3IgLmNvZGUtd29ya3NwYWNlKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhd2FpdCBQcm9taXNlcy5leGlzdHMoZmlsZVBhdGgpKSB7XG5cdFx0XHRcdFx0ZmlsZUVudHJpZXMucHVzaChmaWxlUGF0aCk7XG5cdFx0XHRcdFx0ZW50cmllcysrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGFwcGxlIGd1aWRlbGluZXMgKGh0dHBzOi8vZGV2ZWxvcGVyLmFwcGxlLmNvbS9kZXNpZ24vaHVtYW4taW50ZXJmYWNlLWd1aWRlbGluZXMvbWFjb3MvbWVudXMvbWVudS1hbmF0b215Lylcblx0XHQvLyBleHBsYWluIHRoYXQgbW9zdCByZWNlbnQgZW50cmllcyBzaG91bGQgYXBwZWFyIGNsb3NlIHRvIHRoZSBpbnRlcmFjdGlvbiBieSB0aGUgdXNlciAoZS5nLiBjbG9zZSB0byB0aGVcblx0XHQvLyBtb3VzZSBjbGljaykuIE1vc3QgbmF0aXZlIG1hY09TIGFwcGxpY2F0aW9ucyB0aGF0IGFkZCByZWNlbnQgZG9jdW1lbnRzIHRvIHRoZSBkb2NrLCBzaG93IHRoZSBtb3N0IHJlY2VudCBkb2N1bWVudFxuXHRcdC8vIHRvIHRoZSBib3R0b20gKGJlY2F1c2UgdGhlIGRvY2sgbWVudSBpcyBub3QgYXBwZWFyaW5nIGZyb20gdG9wIHRvIGJvdHRvbSwgYnV0IGZyb20gdGhlIGJvdHRvbSB0byB0aGUgdG9wKS4gQXMgc3VjaFxuXHRcdC8vIHdlIGZpbGwgaW4gdGhlIGVudHJpZXMgaW4gcmV2ZXJzZSBvcmRlciBzbyB0aGF0IHRoZSBtb3N0IHJlY2VudCBzaG93cyB1cCBhdCB0aGUgYm90dG9tIG9mIHRoZSBtZW51LlxuXHRcdC8vXG5cdFx0Ly8gT24gdG9wIG9mIHRoYXQsIHRoZSBtYXhpbXVtIG51bWJlciBvZiBkb2N1bWVudHMgY2FuIGJlIGNvbmZpZ3VyZWQgYnkgdGhlIHVzZXIgKGRlZmF1bHRzIHRvIDEwKS4gVG8gZW5zdXJlIHRoYXRcblx0XHQvLyB3ZSBhcmUgbm90IGZhaWxpbmcgdG8gc2hvdyB0aGUgbW9zdCByZWNlbnQgZW50cmllcywgd2Ugc3RhcnQgYnkgYWRkaW5nIGZpbGVzIGZpcnN0IChpbiByZXZlcnNlIG9yZGVyIG9mIHJlY2VuY3kpXG5cdFx0Ly8gYW5kIHRoZW4gYWRkIGZvbGRlcnMgKGluIHJldmVyc2Ugb3JkZXIgb2YgcmVjZW5jeSkuIEdpdmVuIHRoYXQgc3RyYXRlZ3ksIHdlIGNhbiBlbnN1cmUgdGhhdCB0aGUgbW9zdCByZWNlbnRcblx0XHQvLyBOIGZvbGRlcnMgYXJlIGFsd2F5cyBhcHBlYXJpbmcsIGV2ZW4gaWYgdGhlIGxpbWl0IGlzIGxvdyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzc0Nzg4KVxuXHRcdGZpbGVFbnRyaWVzLnJldmVyc2UoKS5mb3JFYWNoKGZpbGVFbnRyeSA9PiBhcHAuYWRkUmVjZW50RG9jdW1lbnQoZmlsZUVudHJ5KSk7XG5cdFx0d29ya3NwYWNlRW50cmllcy5yZXZlcnNlKCkuZm9yRWFjaCh3b3Jrc3BhY2VFbnRyeSA9PiBhcHAuYWRkUmVjZW50RG9jdW1lbnQod29ya3NwYWNlRW50cnkpKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFdBQTJDO0FBQ3BELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBcUM7QUFDOUMsU0FBUyxzQkFBc0Isd0JBQXdCO0FBQ3ZELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWEsaUJBQWlCO0FBQ3ZDLFNBQVMsVUFBVSxTQUFTLDRCQUE0QixTQUFTLHNCQUFzQjtBQUN2RixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUIsMEJBQTBCO0FBQzFELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYyxxQkFBcUI7QUFDNUMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBaUYsY0FBYyxnQkFBZ0IsbUJBQW1CLHVCQUF1QixtQkFBbUI7QUFDNUssU0FBK0IsMkJBQTJCO0FBQzFELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0JBQStCO0FBRWpDLE1BQU0sZ0NBQWdDLGdCQUErQyw4QkFBOEI7QUFjbkgsSUFBTSwrQkFBTixjQUEyQyxXQUFvRDtBQUFBLEVBV3JHLFlBQytCLFlBQ3FCLGlDQUNYLHNCQUNTLCtCQUNaLG1CQUNLLHdCQUN6QztBQUNELFVBQU07QUFQd0I7QUFDcUI7QUFDWDtBQUNTO0FB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
