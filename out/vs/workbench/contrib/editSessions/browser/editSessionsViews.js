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
import { localize } from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { TreeView, TreeViewPane } from "../../../browser/parts/views/treeView.js";
import { Extensions, TreeItemCollapsibleState } from "../../../common/views.js";
import { ChangeType, EDIT_SESSIONS_DATA_VIEW_ID, EDIT_SESSIONS_SCHEME, EDIT_SESSIONS_SHOW_VIEW, EDIT_SESSIONS_TITLE, IEditSessionsStorageService } from "../common/editSessions.js";
import { URI } from "../../../../base/common/uri.js";
import { fromNow } from "../../../../base/common/date.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { registerAction2, Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { joinPath } from "../../../../base/common/resources.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { basename } from "../../../../base/common/path.js";
import { createCommandUri } from "../../../../base/common/htmlContent.js";
const EDIT_SESSIONS_COUNT_KEY = "editSessionsCount";
const EDIT_SESSIONS_COUNT_CONTEXT_KEY = new RawContextKey(EDIT_SESSIONS_COUNT_KEY, 0);
let EditSessionsDataViews = class extends Disposable {
  constructor(container, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.registerViews(container);
  }
  registerViews(container) {
    const viewId = EDIT_SESSIONS_DATA_VIEW_ID;
    const treeView = this.instantiationService.createInstance(TreeView, viewId, EDIT_SESSIONS_TITLE.value);
    treeView.showCollapseAllAction = true;
    treeView.showRefreshAction = true;
    treeView.dataProvider = this.instantiationService.createInstance(EditSessionDataViewDataProvider);
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    viewsRegistry.registerViews([{
      id: viewId,
      name: EDIT_SESSIONS_TITLE,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      when: ContextKeyExpr.and(EDIT_SESSIONS_SHOW_VIEW),
      order: 100,
      hideByDefault: true
    }], container);
    viewsRegistry.registerViewWelcomeContent(viewId, {
      content: localize(
        "noStoredChanges",
        "You have no stored changes in the cloud to display.\n{0}",
        `[${localize("storeWorkingChangesTitle", "Store Working Changes")}](${createCommandUri("workbench.editSessions.actions.store")})`
      ),
      when: ContextKeyExpr.equals(EDIT_SESSIONS_COUNT_KEY, 0),
      order: 1
    });
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.resume",
          title: localize("workbench.editSessions.actions.resume.v2", "Resume Working Changes"),
          icon: Codicon.desktopDownload,
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /edit-session/i)),
            group: "inline"
          }
        });
      }
      async run(accessor, handle) {
        const editSessionId = URI.parse(handle.$treeItemHandle).path.substring(1);
        const commandService = accessor.get(ICommandService);
        await commandService.executeCommand("workbench.editSessions.actions.resumeLatest", editSessionId, true);
        await treeView.refresh();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.store",
          title: localize("workbench.editSessions.actions.store.v2", "Store Working Changes"),
          icon: Codicon.cloudUpload
        });
      }
      async run(accessor, handle) {
        const commandService = accessor.get(ICommandService);
        await commandService.executeCommand("workbench.editSessions.actions.storeCurrent");
        await treeView.refresh();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.delete",
          title: localize("workbench.editSessions.actions.delete.v2", "Delete Working Changes"),
          icon: Codicon.trash,
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /edit-session/i)),
            group: "inline"
          }
        });
      }
      async run(accessor, handle) {
        const editSessionId = URI.parse(handle.$treeItemHandle).path.substring(1);
        const dialogService = accessor.get(IDialogService);
        const editSessionStorageService = accessor.get(IEditSessionsStorageService);
        const result = await dialogService.confirm({
          message: localize("confirm delete.v2", "Are you sure you want to permanently delete your working changes with ref {0}?", editSessionId),
          detail: localize("confirm delete detail.v2", " You cannot undo this action."),
          type: "warning",
          title: EDIT_SESSIONS_TITLE.value
        });
        if (result.confirmed) {
          await editSessionStorageService.delete("editSessions", editSessionId);
          await treeView.refresh();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.deleteAll",
          title: localize("workbench.editSessions.actions.deleteAll", "Delete All Working Changes from Cloud"),
          icon: Codicon.trash,
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.greater(EDIT_SESSIONS_COUNT_KEY, 0))
          }
        });
      }
      async run(accessor) {
        const dialogService = accessor.get(IDialogService);
        const editSessionStorageService = accessor.get(IEditSessionsStorageService);
        const result = await dialogService.confirm({
          message: localize("confirm delete all", "Are you sure you want to permanently delete all stored changes from the cloud?"),
          detail: localize("confirm delete all detail", " You cannot undo this action."),
          type: "warning",
          title: EDIT_SESSIONS_TITLE.value
        });
        if (result.confirmed) {
          await editSessionStorageService.delete("editSessions", null);
          await treeView.refresh();
        }
      }
    }));
  }
};
EditSessionsDataViews = __decorateClass([
  __decorateParam(1, IInstantiationService)
], EditSessionsDataViews);
let EditSessionDataViewDataProvider = class {
  constructor(editSessionsStorageService, contextKeyService, workspaceContextService, fileService) {
    this.editSessionsStorageService = editSessionsStorageService;
    this.contextKeyService = contextKeyService;
    this.workspaceContextService = workspaceContextService;
    this.fileService = fileService;
    this.editSessionsCount = EDIT_SESSIONS_COUNT_CONTEXT_KEY.bindTo(this.contextKeyService);
  }
  async getChildren(element) {
    if (!element) {
      return this.getAllEditSessions();
    }
    const [ref, folderName, filePath] = URI.parse(element.handle).path.substring(1).split("/");
    if (ref && !folderName) {
      return this.getEditSession(ref);
    } else if (ref && folderName && !filePath) {
      return this.getEditSessionFolderContents(ref, folderName);
    }
    return [];
  }
  async getAllEditSessions() {
    const allEditSessions = await this.editSessionsStorageService.list("editSessions");
    this.editSessionsCount.set(allEditSessions.length);
    const editSessions = [];
    for (const session of allEditSessions) {
      const resource = URI.from({ scheme: EDIT_SESSIONS_SCHEME, authority: "remote-session-content", path: `/${session.ref}` });
      const sessionData = await this.editSessionsStorageService.read("editSessions", session.ref);
      if (!sessionData) {
        continue;
      }
      const content = JSON.parse(sessionData.content);
      const label = content.folders.map((folder) => folder.name).join(", ") ?? session.ref;
      const machineId = content.machine;
      const machineName = machineId ? await this.editSessionsStorageService.getMachineById(machineId) : void 0;
      const description = machineName === void 0 ? fromNow(session.created, true) : `${fromNow(session.created, true)}\xA0\xA0\u2022\xA0\xA0${machineName}`;
      editSessions.push({
        handle: resource.toString(),
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label },
        description,
        themeIcon: Codicon.repo,
        contextValue: `edit-session`
      });
    }
    return editSessions;
  }
  async getEditSession(ref) {
    const data = await this.editSessionsStorageService.read("editSessions", ref);
    if (!data) {
      return [];
    }
    const content = JSON.parse(data.content);
    if (content.folders.length === 1) {
      const folder = content.folders[0];
      return this.getEditSessionFolderContents(ref, folder.name);
    }
    return content.folders.map((folder) => {
      const resource = URI.from({ scheme: EDIT_SESSIONS_SCHEME, authority: "remote-session-content", path: `/${data.ref}/${folder.name}` });
      return {
        handle: resource.toString(),
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label: folder.name },
        themeIcon: Codicon.folder
      };
    });
  }
  async getEditSessionFolderContents(ref, folderName) {
    const data = await this.editSessionsStorageService.read("editSessions", ref);
    if (!data) {
      return [];
    }
    const content = JSON.parse(data.content);
    const currentWorkspaceFolder = this.workspaceContextService.getWorkspace().folders.find((folder) => folder.name === folderName);
    const editSessionFolder = content.folders.find((folder) => folder.name === folderName);
    if (!editSessionFolder) {
      return [];
    }
    return Promise.all(editSessionFolder.workingChanges.map(async (change) => {
      const cloudChangeUri = URI.from({ scheme: EDIT_SESSIONS_SCHEME, authority: "remote-session-content", path: `/${data.ref}/${folderName}/${change.relativeFilePath}` });
      if (currentWorkspaceFolder?.uri) {
        const localCopy = joinPath(currentWorkspaceFolder.uri, change.relativeFilePath);
        if (change.type === ChangeType.Addition && await this.fileService.exists(localCopy)) {
          return {
            handle: cloudChangeUri.toString(),
            resourceUri: cloudChangeUri,
            collapsibleState: TreeItemCollapsibleState.None,
            label: { label: change.relativeFilePath },
            themeIcon: Codicon.file,
            command: {
              id: "vscode.diff",
              title: localize("compare changes", "Compare Changes"),
              arguments: [
                localCopy,
                cloudChangeUri,
                `${basename(change.relativeFilePath)} (${localize("local copy", "Local Copy")} \u2194 ${localize("cloud changes", "Cloud Changes")})`,
                void 0
              ]
            }
          };
        }
      }
      return {
        handle: cloudChangeUri.toString(),
        resourceUri: cloudChangeUri,
        collapsibleState: TreeItemCollapsibleState.None,
        label: { label: change.relativeFilePath },
        themeIcon: Codicon.file,
        command: {
          id: API_OPEN_EDITOR_COMMAND_ID,
          title: localize("open file", "Open File"),
          arguments: [cloudChangeUri, void 0, void 0]
        }
      };
    }));
  }
};
EditSessionDataViewDataProvider = __decorateClass([
  __decorateParam(0, IEditSessionsStorageService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IFileService)
], EditSessionDataViewDataProvider);
export {
  EditSessionsDataViews
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRTZXNzaW9uc1xcYnJvd3NlclxcZWRpdFNlc3Npb25zVmlld3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUcmVlVmlldywgVHJlZVZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy90cmVlVmlldy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJVHJlZUl0ZW0sIElUcmVlVmlld0RhdGFQcm92aWRlciwgSVRyZWVWaWV3RGVzY3JpcHRvciwgSVZpZXdzUmVnaXN0cnksIFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSwgVHJlZVZpZXdJdGVtSGFuZGxlQXJnLCBWaWV3Q29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IENoYW5nZVR5cGUsIEVESVRfU0VTU0lPTlNfREFUQV9WSUVXX0lELCBFRElUX1NFU1NJT05TX1NDSEVNRSwgRURJVF9TRVNTSU9OU19TSE9XX1ZJRVcsIEVESVRfU0VTU0lPTlNfVElUTEUsIEVkaXRTZXNzaW9uLCBJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZWRpdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbW1hbmRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5cbmNvbnN0IEVESVRfU0VTU0lPTlNfQ09VTlRfS0VZID0gJ2VkaXRTZXNzaW9uc0NvdW50JztcbmNvbnN0IEVESVRfU0VTU0lPTlNfQ09VTlRfQ09OVEVYVF9LRVkgPSBuZXcgUmF3Q29udGV4dEtleTxudW1iZXI+KEVESVRfU0VTU0lPTlNfQ09VTlRfS0VZLCAwKTtcblxuZXhwb3J0IGNsYXNzIEVkaXRTZXNzaW9uc0RhdGFWaWV3cyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IFZpZXdDb250YWluZXIsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZWdpc3RlclZpZXdzKGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlld3MoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0lkID0gRURJVF9TRVNTSU9OU19EQVRBX1ZJRVdfSUQ7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVWaWV3LCB2aWV3SWQsIEVESVRfU0VTU0lPTlNfVElUTEUudmFsdWUpO1xuXHRcdHRyZWVWaWV3LnNob3dDb2xsYXBzZUFsbEFjdGlvbiA9IHRydWU7XG5cdFx0dHJlZVZpZXcuc2hvd1JlZnJlc2hBY3Rpb24gPSB0cnVlO1xuXHRcdHRyZWVWaWV3LmRhdGFQcm92aWRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdFNlc3Npb25EYXRhVmlld0RhdGFQcm92aWRlcik7XG5cblx0XHRjb25zdCB2aWV3c1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdHZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbPElUcmVlVmlld0Rlc2NyaXB0b3I+e1xuXHRcdFx0aWQ6IHZpZXdJZCxcblx0XHRcdG5hbWU6IEVESVRfU0VTU0lPTlNfVElUTEUsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFRyZWVWaWV3UGFuZSksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0Y2FuTW92ZVZpZXc6IGZhbHNlLFxuXHRcdFx0dHJlZVZpZXcsXG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVESVRfU0VTU0lPTlNfU0hPV19WSUVXKSxcblx0XHRcdG9yZGVyOiAxMDAsXG5cdFx0XHRoaWRlQnlEZWZhdWx0OiB0cnVlLFxuXHRcdH1dLCBjb250YWluZXIpO1xuXG5cdFx0dmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdXZWxjb21lQ29udGVudCh2aWV3SWQsIHtcblx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKFxuXHRcdFx0XHQnbm9TdG9yZWRDaGFuZ2VzJyxcblx0XHRcdFx0J1lvdSBoYXZlIG5vIHN0b3JlZCBjaGFuZ2VzIGluIHRoZSBjbG91ZCB0byBkaXNwbGF5LlxcbnswfScsXG5cdFx0XHRcdGBbJHtsb2NhbGl6ZSgnc3RvcmVXb3JraW5nQ2hhbmdlc1RpdGxlJywgJ1N0b3JlIFdvcmtpbmcgQ2hhbmdlcycpfV0oJHtjcmVhdGVDb21tYW5kVXJpKCd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuc3RvcmUnKX0pYCxcblx0XHRcdCksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoRURJVF9TRVNTSU9OU19DT1VOVF9LRVksIDApLFxuXHRcdFx0b3JkZXI6IDFcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5yZXN1bWUnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLnJlc3VtZS52MicsIFwiUmVzdW1lIFdvcmtpbmcgQ2hhbmdlc1wiKSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmRlc2t0b3BEb3dubG9hZCxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdJdGVtQ29udGV4dCxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCB2aWV3SWQpLCBDb250ZXh0S2V5RXhwci5yZWdleCgndmlld0l0ZW0nLCAvZWRpdC1zZXNzaW9uL2kpKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnaW5saW5lJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaGFuZGxlOiBUcmVlVmlld0l0ZW1IYW5kbGVBcmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgZWRpdFNlc3Npb25JZCA9IFVSSS5wYXJzZShoYW5kbGUuJHRyZWVJdGVtSGFuZGxlKS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5yZXN1bWVMYXRlc3QnLCBlZGl0U2Vzc2lvbklkLCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgdHJlZVZpZXcucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5zdG9yZScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuc3RvcmUudjInLCBcIlN0b3JlIFdvcmtpbmcgQ2hhbmdlc1wiKSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmNsb3VkVXBsb2FkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBoYW5kbGU6IFRyZWVWaWV3SXRlbUhhbmRsZUFyZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLnN0b3JlQ3VycmVudCcpO1xuXHRcdFx0XHRhd2FpdCB0cmVlVmlldy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLmRlbGV0ZScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuZGVsZXRlLnYyJywgXCJEZWxldGUgV29ya2luZyBDaGFuZ2VzXCIpLFxuXHRcdFx0XHRcdGljb246IENvZGljb24udHJhc2gsXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3SXRlbUNvbnRleHQsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Jywgdmlld0lkKSwgQ29udGV4dEtleUV4cHIucmVnZXgoJ3ZpZXdJdGVtJywgL2VkaXQtc2Vzc2lvbi9pKSksXG5cdFx0XHRcdFx0XHRncm91cDogJ2lubGluZSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGhhbmRsZTogVHJlZVZpZXdJdGVtSGFuZGxlQXJnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRTZXNzaW9uSWQgPSBVUkkucGFyc2UoaGFuZGxlLiR0cmVlSXRlbUhhbmRsZSkucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBlZGl0U2Vzc2lvblN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm0gZGVsZXRlLnYyJywgJ0FyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBwZXJtYW5lbnRseSBkZWxldGUgeW91ciB3b3JraW5nIGNoYW5nZXMgd2l0aCByZWYgezB9PycsIGVkaXRTZXNzaW9uSWQpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm0gZGVsZXRlIGRldGFpbC52MicsICcgWW91IGNhbm5vdCB1bmRvIHRoaXMgYWN0aW9uLicpLFxuXHRcdFx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdFx0XHR0aXRsZTogRURJVF9TRVNTSU9OU19USVRMRS52YWx1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRhd2FpdCBlZGl0U2Vzc2lvblN0b3JhZ2VTZXJ2aWNlLmRlbGV0ZSgnZWRpdFNlc3Npb25zJywgZWRpdFNlc3Npb25JZCk7XG5cdFx0XHRcdFx0YXdhaXQgdHJlZVZpZXcucmVmcmVzaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLmRlbGV0ZUFsbCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuZGVsZXRlQWxsJywgXCJEZWxldGUgQWxsIFdvcmtpbmcgQ2hhbmdlcyBmcm9tIENsb3VkXCIpLFxuXHRcdFx0XHRcdGljb246IENvZGljb24udHJhc2gsXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Jywgdmlld0lkKSwgQ29udGV4dEtleUV4cHIuZ3JlYXRlcihFRElUX1NFU1NJT05TX0NPVU5UX0tFWSwgMCkpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZWRpdFNlc3Npb25TdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtIGRlbGV0ZSBhbGwnLCAnQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHBlcm1hbmVudGx5IGRlbGV0ZSBhbGwgc3RvcmVkIGNoYW5nZXMgZnJvbSB0aGUgY2xvdWQ/JyksXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybSBkZWxldGUgYWxsIGRldGFpbCcsICcgWW91IGNhbm5vdCB1bmRvIHRoaXMgYWN0aW9uLicpLFxuXHRcdFx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdFx0XHR0aXRsZTogRURJVF9TRVNTSU9OU19USVRMRS52YWx1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRhd2FpdCBlZGl0U2Vzc2lvblN0b3JhZ2VTZXJ2aWNlLmRlbGV0ZSgnZWRpdFNlc3Npb25zJywgbnVsbCk7XG5cdFx0XHRcdFx0YXdhaXQgdHJlZVZpZXcucmVmcmVzaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbmNsYXNzIEVkaXRTZXNzaW9uRGF0YVZpZXdEYXRhUHJvdmlkZXIgaW1wbGVtZW50cyBJVHJlZVZpZXdEYXRhUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgZWRpdFNlc3Npb25zQ291bnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlOiBJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZWRpdFNlc3Npb25zQ291bnQgPSBFRElUX1NFU1NJT05TX0NPVU5UX0NPTlRFWFRfS0VZLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ/OiBJVHJlZUl0ZW0pOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRBbGxFZGl0U2Vzc2lvbnMoKTtcblx0XHR9XG5cblx0XHRjb25zdCBbcmVmLCBmb2xkZXJOYW1lLCBmaWxlUGF0aF0gPSBVUkkucGFyc2UoZWxlbWVudC5oYW5kbGUpLnBhdGguc3Vic3RyaW5nKDEpLnNwbGl0KCcvJyk7XG5cblx0XHRpZiAocmVmICYmICFmb2xkZXJOYW1lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRFZGl0U2Vzc2lvbihyZWYpO1xuXHRcdH0gZWxzZSBpZiAocmVmICYmIGZvbGRlck5hbWUgJiYgIWZpbGVQYXRoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRFZGl0U2Vzc2lvbkZvbGRlckNvbnRlbnRzKHJlZiwgZm9sZGVyTmFtZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRBbGxFZGl0U2Vzc2lvbnMoKTogUHJvbWlzZTxJVHJlZUl0ZW1bXT4ge1xuXHRcdGNvbnN0IGFsbEVkaXRTZXNzaW9ucyA9IGF3YWl0IHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UubGlzdCgnZWRpdFNlc3Npb25zJyk7XG5cdFx0dGhpcy5lZGl0U2Vzc2lvbnNDb3VudC5zZXQoYWxsRWRpdFNlc3Npb25zLmxlbmd0aCk7XG5cdFx0Y29uc3QgZWRpdFNlc3Npb25zID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgYWxsRWRpdFNlc3Npb25zKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBFRElUX1NFU1NJT05TX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlLXNlc3Npb24tY29udGVudCcsIHBhdGg6IGAvJHtzZXNzaW9uLnJlZn1gIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGEgPSBhd2FpdCB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLnJlYWQoJ2VkaXRTZXNzaW9ucycsIHNlc3Npb24ucmVmKTtcblx0XHRcdGlmICghc2Vzc2lvbkRhdGEpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250ZW50OiBFZGl0U2Vzc2lvbiA9IEpTT04ucGFyc2Uoc2Vzc2lvbkRhdGEuY29udGVudCk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGNvbnRlbnQuZm9sZGVycy5tYXAoKGZvbGRlcikgPT4gZm9sZGVyLm5hbWUpLmpvaW4oJywgJykgPz8gc2Vzc2lvbi5yZWY7XG5cdFx0XHRjb25zdCBtYWNoaW5lSWQgPSBjb250ZW50Lm1hY2hpbmU7XG5cdFx0XHRjb25zdCBtYWNoaW5lTmFtZSA9IG1hY2hpbmVJZCA/IGF3YWl0IHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UuZ2V0TWFjaGluZUJ5SWQobWFjaGluZUlkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gbWFjaGluZU5hbWUgPT09IHVuZGVmaW5lZCA/IGZyb21Ob3coc2Vzc2lvbi5jcmVhdGVkLCB0cnVlKSA6IGAke2Zyb21Ob3coc2Vzc2lvbi5jcmVhdGVkLCB0cnVlKX1cXHUwMGEwXFx1MDBhMFxcdTIwMjJcXHUwMGEwXFx1MDBhMCR7bWFjaGluZU5hbWV9YDtcblxuXHRcdFx0ZWRpdFNlc3Npb25zLnB1c2goe1xuXHRcdFx0XHRoYW5kbGU6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQsXG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsIH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbixcblx0XHRcdFx0dGhlbWVJY29uOiBDb2RpY29uLnJlcG8sXG5cdFx0XHRcdGNvbnRleHRWYWx1ZTogYGVkaXQtc2Vzc2lvbmBcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0U2Vzc2lvbnM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEVkaXRTZXNzaW9uKHJlZjogc3RyaW5nKTogUHJvbWlzZTxJVHJlZUl0ZW1bXT4ge1xuXHRcdGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLnJlYWQoJ2VkaXRTZXNzaW9ucycsIHJlZik7XG5cblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgY29udGVudDogRWRpdFNlc3Npb24gPSBKU09OLnBhcnNlKGRhdGEuY29udGVudCk7XG5cblx0XHRpZiAoY29udGVudC5mb2xkZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gY29udGVudC5mb2xkZXJzWzBdO1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0RWRpdFNlc3Npb25Gb2xkZXJDb250ZW50cyhyZWYsIGZvbGRlci5uYW1lKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29udGVudC5mb2xkZXJzLm1hcCgoZm9sZGVyKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBFRElUX1NFU1NJT05TX1NDSEVNRSwgYXV0aG9yaXR5OiAncmVtb3RlLXNlc3Npb24tY29udGVudCcsIHBhdGg6IGAvJHtkYXRhLnJlZn0vJHtmb2xkZXIubmFtZX1gIH0pO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aGFuZGxlOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkLFxuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogZm9sZGVyLm5hbWUgfSxcblx0XHRcdFx0dGhlbWVJY29uOiBDb2RpY29uLmZvbGRlclxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RWRpdFNlc3Npb25Gb2xkZXJDb250ZW50cyhyZWY6IHN0cmluZywgZm9sZGVyTmFtZTogc3RyaW5nKTogUHJvbWlzZTxJVHJlZUl0ZW1bXT4ge1xuXHRcdGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLnJlYWQoJ2VkaXRTZXNzaW9ucycsIHJlZik7XG5cblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgY29udGVudDogRWRpdFNlc3Npb24gPSBKU09OLnBhcnNlKGRhdGEuY29udGVudCk7XG5cblx0XHRjb25zdCBjdXJyZW50V29ya3NwYWNlRm9sZGVyID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmZpbmQoKGZvbGRlcikgPT4gZm9sZGVyLm5hbWUgPT09IGZvbGRlck5hbWUpO1xuXHRcdGNvbnN0IGVkaXRTZXNzaW9uRm9sZGVyID0gY29udGVudC5mb2xkZXJzLmZpbmQoKGZvbGRlcikgPT4gZm9sZGVyLm5hbWUgPT09IGZvbGRlck5hbWUpO1xuXG5cdFx0aWYgKCFlZGl0U2Vzc2lvbkZvbGRlcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLmFsbChlZGl0U2Vzc2lvbkZvbGRlci53b3JraW5nQ2hhbmdlcy5tYXAoYXN5bmMgKGNoYW5nZSkgPT4ge1xuXHRcdFx0Y29uc3QgY2xvdWRDaGFuZ2VVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogRURJVF9TRVNTSU9OU19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZS1zZXNzaW9uLWNvbnRlbnQnLCBwYXRoOiBgLyR7ZGF0YS5yZWZ9LyR7Zm9sZGVyTmFtZX0vJHtjaGFuZ2UucmVsYXRpdmVGaWxlUGF0aH1gIH0pO1xuXG5cdFx0XHRpZiAoY3VycmVudFdvcmtzcGFjZUZvbGRlcj8udXJpKSB7XG5cdFx0XHRcdC8vIGZpbmQgdGhlIGNvcnJlc3BvbmRpbmcgZmlsZSBpbiB0aGUgd29ya3NwYWNlXG5cdFx0XHRcdGNvbnN0IGxvY2FsQ29weSA9IGpvaW5QYXRoKGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXIudXJpLCBjaGFuZ2UucmVsYXRpdmVGaWxlUGF0aCk7XG5cdFx0XHRcdGlmIChjaGFuZ2UudHlwZSA9PT0gQ2hhbmdlVHlwZS5BZGRpdGlvbiAmJiBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhsb2NhbENvcHkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGhhbmRsZTogY2xvdWRDaGFuZ2VVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdHJlc291cmNlVXJpOiBjbG91ZENoYW5nZVVyaSxcblx0XHRcdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lLFxuXHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGNoYW5nZS5yZWxhdGl2ZUZpbGVQYXRoIH0sXG5cdFx0XHRcdFx0XHR0aGVtZUljb246IENvZGljb24uZmlsZSxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0aWQ6ICd2c2NvZGUuZGlmZicsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29tcGFyZSBjaGFuZ2VzJywgJ0NvbXBhcmUgQ2hhbmdlcycpLFxuXHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtcblx0XHRcdFx0XHRcdFx0XHRsb2NhbENvcHksXG5cdFx0XHRcdFx0XHRcdFx0Y2xvdWRDaGFuZ2VVcmksXG5cdFx0XHRcdFx0XHRcdFx0YCR7YmFzZW5hbWUoY2hhbmdlLnJlbGF0aXZlRmlsZVBhdGgpfSAoJHtsb2NhbGl6ZSgnbG9jYWwgY29weScsICdMb2NhbCBDb3B5Jyl9IFxcdTIxOTQgJHtsb2NhbGl6ZSgnY2xvdWQgY2hhbmdlcycsICdDbG91ZCBDaGFuZ2VzJyl9KWAsXG5cdFx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGhhbmRsZTogY2xvdWRDaGFuZ2VVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVzb3VyY2VVcmk6IGNsb3VkQ2hhbmdlVXJpLFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSxcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGNoYW5nZS5yZWxhdGl2ZUZpbGVQYXRoIH0sXG5cdFx0XHRcdHRoZW1lSWNvbjogQ29kaWNvbi5maWxlLFxuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0aWQ6IEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnb3BlbiBmaWxlJywgJ09wZW4gRmlsZScpLFxuXHRcdFx0XHRcdGFyZ3VtZW50czogW2Nsb3VkQ2hhbmdlVXJpLCB1bmRlZmluZWQsIHVuZGVmaW5lZF1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLFlBQW1GLGdDQUFzRTtBQUNsSyxTQUFTLFlBQVksNEJBQTRCLHNCQUFzQix5QkFBeUIscUJBQWtDLG1DQUFtQztBQUNySyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGlCQUFpQixTQUFTLGNBQWM7QUFDakQs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
