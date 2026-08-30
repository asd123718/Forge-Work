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
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, TreeItemCollapsibleState } from "../../../common/views.js";
import { localize, localize2 } from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { TreeView, TreeViewPane } from "../../../browser/parts/views/treeView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ALL_SYNC_RESOURCES, IUserDataSyncService, SyncStatus, IUserDataSyncEnablementService, IUserDataAutoSyncService, UserDataSyncError, UserDataSyncErrorCode, getLastSyncResourceUri, SyncResource, IUserDataSyncResourceProviderService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { registerAction2, Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { URI } from "../../../../base/common/uri.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { FolderThemeIcon } from "../../../../platform/theme/common/themeService.js";
import { fromNow } from "../../../../base/common/date.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { toAction } from "../../../../base/common/actions.js";
import { IUserDataSyncWorkbenchService, CONTEXT_SYNC_STATE, getSyncAreaLabel, CONTEXT_ACCOUNT_STATE, AccountStatus, CONTEXT_ENABLE_ACTIVITY_VIEWS, SYNC_TITLE, SYNC_CONFLICTS_VIEW_ID, CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW, CONTEXT_HAS_CONFLICTS } from "../../../services/userDataSync/common/userDataSync.js";
import { IUserDataSyncMachinesService, isWebPlatform } from "../../../../platform/userDataSync/common/userDataSyncMachines.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { basename } from "../../../../base/common/resources.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { UserDataSyncConflictsViewPane } from "./userDataSyncConflictsView.js";
let UserDataSyncDataViews = class extends Disposable {
  constructor(container, instantiationService, userDataSyncEnablementService, userDataSyncMachinesService, userDataSyncService) {
    super();
    this.instantiationService = instantiationService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.userDataSyncMachinesService = userDataSyncMachinesService;
    this.userDataSyncService = userDataSyncService;
    this.registerViews(container);
  }
  registerViews(container) {
    this.registerConflictsView(container);
    this.registerActivityView(container, true);
    this.registerMachinesView(container);
    this.registerActivityView(container, false);
    this.registerTroubleShootView(container);
    this.registerExternalActivityView(container);
  }
  registerConflictsView(container) {
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewName = localize2("conflicts", "Conflicts");
    const viewDescriptor = {
      id: SYNC_CONFLICTS_VIEW_ID,
      name: viewName,
      ctorDescriptor: new SyncDescriptor(UserDataSyncConflictsViewPane),
      when: ContextKeyExpr.and(CONTEXT_ENABLE_SYNC_CONFLICTS_VIEW, CONTEXT_HAS_CONFLICTS),
      canToggleVisibility: false,
      canMoveView: false,
      treeView: this.instantiationService.createInstance(TreeView, SYNC_CONFLICTS_VIEW_ID, viewName.value),
      collapsed: false,
      order: 100
    };
    viewsRegistry.registerViews([viewDescriptor], container);
  }
  registerMachinesView(container) {
    const id = `workbench.views.sync.machines`;
    const name = localize2("synced machines", "Synced Machines");
    const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
    const dataProvider = this.instantiationService.createInstance(UserDataSyncMachinesViewDataProvider, treeView);
    treeView.showRefreshAction = true;
    treeView.canSelectMany = true;
    treeView.dataProvider = dataProvider;
    this._register(Event.any(this.userDataSyncMachinesService.onDidChange, this.userDataSyncService.onDidResetRemote)(() => treeView.refresh()));
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewDescriptor = {
      id,
      name,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_ENABLE_ACTIVITY_VIEWS),
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      order: 300
    };
    viewsRegistry.registerViews([viewDescriptor], container);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.editMachineName`,
          title: localize("workbench.actions.sync.editMachineName", "Edit Name"),
          icon: Codicon.edit,
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", id)),
            group: "inline"
          }
        });
      }
      async run(accessor, handle) {
        const changed = await dataProvider.rename(handle.$treeItemHandle);
        if (changed) {
          await treeView.refresh();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.turnOffSyncOnMachine`,
          title: localize("workbench.actions.sync.turnOffSyncOnMachine", "Turn off Settings Sync"),
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", id), ContextKeyExpr.equals("viewItem", "sync-machine"))
          }
        });
      }
      async run(accessor, handle, selected) {
        if (await dataProvider.disable((selected || [handle]).map((handle2) => handle2.$treeItemHandle))) {
          await treeView.refresh();
        }
      }
    }));
  }
  registerActivityView(container, remote) {
    const id = `workbench.views.sync.${remote ? "remote" : "local"}Activity`;
    const name = remote ? localize2("remote sync activity title", "Sync Activity (Remote)") : localize2("local sync activity title", "Sync Activity (Local)");
    const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
    treeView.showCollapseAllAction = true;
    treeView.showRefreshAction = true;
    treeView.dataProvider = remote ? this.instantiationService.createInstance(RemoteUserDataSyncActivityViewDataProvider) : this.instantiationService.createInstance(LocalUserDataSyncActivityViewDataProvider);
    this._register(Event.any(
      this.userDataSyncEnablementService.onDidChangeResourceEnablement,
      this.userDataSyncEnablementService.onDidChangeEnablement,
      this.userDataSyncService.onDidResetLocal,
      this.userDataSyncService.onDidResetRemote
    )(() => treeView.refresh()));
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewDescriptor = {
      id,
      name,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_ENABLE_ACTIVITY_VIEWS),
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      order: remote ? 200 : 400,
      hideByDefault: !remote
    };
    viewsRegistry.registerViews([viewDescriptor], container);
    this.registerDataViewActions(id);
  }
  registerExternalActivityView(container) {
    const id = `workbench.views.sync.externalActivity`;
    const name = localize2("downloaded sync activity title", "Sync Activity (Developer)");
    const dataProvider = this.instantiationService.createInstance(ExtractedUserDataSyncActivityViewDataProvider, void 0);
    const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
    treeView.showCollapseAllAction = false;
    treeView.showRefreshAction = false;
    treeView.dataProvider = dataProvider;
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewDescriptor = {
      id,
      name,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      when: CONTEXT_ENABLE_ACTIVITY_VIEWS,
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      hideByDefault: false
    };
    viewsRegistry.registerViews([viewDescriptor], container);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.loadActivity`,
          title: localize("workbench.actions.sync.loadActivity", "Load Sync Activity"),
          icon: Codicon.cloudUpload,
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.equals("view", id),
            group: "navigation"
          }
        });
      }
      async run(accessor) {
        const fileDialogService = accessor.get(IFileDialogService);
        const result = await fileDialogService.showOpenDialog({
          title: localize("select sync activity file", "Select Sync Activity File or Folder"),
          canSelectFiles: true,
          canSelectFolders: true,
          canSelectMany: false
        });
        if (!result?.[0]) {
          return;
        }
        dataProvider.activityDataResource = result[0];
        await treeView.refresh();
      }
    }));
  }
  registerDataViewActions(viewId) {
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.${viewId}.resolveResource`,
          title: localize("workbench.actions.sync.resolveResourceRef", "Show raw JSON sync data"),
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /sync-resource-.*/i))
          }
        });
      }
      async run(accessor, handle) {
        const { resource } = JSON.parse(handle.$treeItemHandle);
        const editorService = accessor.get(IEditorService);
        await editorService.openEditor({ resource: URI.parse(resource), options: { pinned: true } });
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.${viewId}.compareWithLocal`,
          title: localize("workbench.actions.sync.compareWithLocal", "Compare with Local"),
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /sync-associatedResource-.*/i))
          }
        });
      }
      async run(accessor, handle) {
        const commandService = accessor.get(ICommandService);
        const { resource, comparableResource } = JSON.parse(handle.$treeItemHandle);
        const remoteResource = URI.parse(resource);
        const localResource = URI.parse(comparableResource);
        return commandService.executeCommand(
          API_OPEN_DIFF_EDITOR_COMMAND_ID,
          remoteResource,
          localResource,
          localize("remoteToLocalDiff", "{0} \u2194 {1}", localize({ key: "leftResourceName", comment: ["remote as in file in cloud"] }, "{0} (Remote)", basename(remoteResource)), localize({ key: "rightResourceName", comment: ["local as in file in disk"] }, "{0} (Local)", basename(localResource))),
          void 0
        );
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.sync.${viewId}.replaceCurrent`,
          title: localize("workbench.actions.sync.replaceCurrent", "Restore"),
          icon: Codicon.discard,
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /sync-resource-.*/i), ContextKeyExpr.notEquals("viewItem", `sync-resource-${SyncResource.Profiles}`)),
            group: "inline"
          }
        });
      }
      async run(accessor, handle) {
        const dialogService = accessor.get(IDialogService);
        const userDataSyncService = accessor.get(IUserDataSyncService);
        const { syncResourceHandle, syncResource } = JSON.parse(handle.$treeItemHandle);
        const result = await dialogService.confirm({
          message: localize({ key: "confirm replace", comment: ["A confirmation message to replace current user data (settings, extensions, keybindings, snippets) with selected version"] }, "Would you like to replace your current {0} with selected?", getSyncAreaLabel(syncResource)),
          type: "info",
          title: SYNC_TITLE.value
        });
        if (result.confirmed) {
          return userDataSyncService.replace({ created: syncResourceHandle.created, uri: URI.revive(syncResourceHandle.uri) });
        }
      }
    }));
  }
  registerTroubleShootView(container) {
    const id = `workbench.views.sync.troubleshoot`;
    const name = localize2("troubleshoot", "Troubleshoot");
    const treeView = this.instantiationService.createInstance(TreeView, id, name.value);
    const dataProvider = this.instantiationService.createInstance(UserDataSyncTroubleshootViewDataProvider);
    treeView.showRefreshAction = true;
    treeView.dataProvider = dataProvider;
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    const viewDescriptor = {
      id,
      name,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      when: CONTEXT_ENABLE_ACTIVITY_VIEWS,
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      order: 500,
      hideByDefault: true
    };
    viewsRegistry.registerViews([viewDescriptor], container);
  }
};
UserDataSyncDataViews = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IUserDataSyncEnablementService),
  __decorateParam(3, IUserDataSyncMachinesService),
  __decorateParam(4, IUserDataSyncService)
], UserDataSyncDataViews);
let UserDataSyncActivityViewDataProvider = class {
  constructor(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService) {
    this.userDataSyncService = userDataSyncService;
    this.userDataSyncResourceProviderService = userDataSyncResourceProviderService;
    this.userDataAutoSyncService = userDataAutoSyncService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
    this.notificationService = notificationService;
    this.userDataProfilesService = userDataProfilesService;
    this.syncResourceHandlesByProfile = /* @__PURE__ */ new Map();
  }
  async getChildren(element) {
    try {
      if (!element) {
        return await this.getRoots();
      }
      if (element.profile || element.handle === this.userDataProfilesService.defaultProfile.id) {
        let promise = this.syncResourceHandlesByProfile.get(element.handle);
        if (!promise) {
          this.syncResourceHandlesByProfile.set(element.handle, promise = this.getSyncResourceHandles(element.profile));
        }
        return await promise;
      }
      if (element.syncResourceHandle) {
        return await this.getChildrenForSyncResourceTreeItem(element);
      }
      return [];
    } catch (error) {
      if (!(error instanceof UserDataSyncError)) {
        error = UserDataSyncError.toUserDataSyncError(error);
      }
      if (error instanceof UserDataSyncError && error.code === UserDataSyncErrorCode.IncompatibleRemoteContent) {
        this.notificationService.notify({
          severity: Severity.Error,
          message: error.message,
          actions: {
            primary: [
              toAction({
                id: "reset",
                label: localize("reset", "Reset Synced Data"),
                run: () => this.userDataSyncWorkbenchService.resetSyncedData()
              })
            ]
          }
        });
      } else {
        this.notificationService.error(error);
      }
      throw error;
    }
  }
  async getRoots() {
    this.syncResourceHandlesByProfile.clear();
    const roots = [];
    const profiles = await this.getProfiles();
    if (profiles.length) {
      const profileTreeItem = {
        handle: this.userDataProfilesService.defaultProfile.id,
        label: { label: this.userDataProfilesService.defaultProfile.name },
        collapsibleState: TreeItemCollapsibleState.Expanded
      };
      roots.push(profileTreeItem);
    } else {
      const defaultSyncResourceHandles = await this.getSyncResourceHandles();
      roots.push(...defaultSyncResourceHandles);
    }
    for (const profile of profiles) {
      const profileTreeItem = {
        handle: profile.id,
        label: { label: profile.name },
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        profile
      };
      roots.push(profileTreeItem);
    }
    return roots;
  }
  async getChildrenForSyncResourceTreeItem(element) {
    const syncResourceHandle = element.syncResourceHandle;
    const associatedResources = await this.userDataSyncResourceProviderService.getAssociatedResources(syncResourceHandle);
    const previousAssociatedResources = syncResourceHandle.previous ? await this.userDataSyncResourceProviderService.getAssociatedResources(syncResourceHandle.previous) : [];
    return associatedResources.map(({ resource, comparableResource }) => {
      const handle = JSON.stringify({ resource: resource.toString(), comparableResource: comparableResource.toString() });
      const previousResource = previousAssociatedResources.find((previous) => basename(previous.resource) === basename(resource))?.resource;
      return {
        handle,
        collapsibleState: TreeItemCollapsibleState.None,
        resourceUri: resource,
        command: previousResource ? {
          id: API_OPEN_DIFF_EDITOR_COMMAND_ID,
          title: "",
          arguments: [
            previousResource,
            resource,
            localize("sideBySideLabels", "{0} \u2194 {1}", `${basename(resource)} (${fromNow(syncResourceHandle.previous.created, true)})`, `${basename(resource)} (${fromNow(syncResourceHandle.created, true)})`),
            void 0
          ]
        } : {
          id: API_OPEN_EDITOR_COMMAND_ID,
          title: "",
          arguments: [resource, void 0, void 0]
        },
        contextValue: `sync-associatedResource-${syncResourceHandle.syncResource}`
      };
    });
  }
  async getSyncResourceHandles(profile) {
    const treeItems = [];
    const result = await Promise.all(ALL_SYNC_RESOURCES.map(async (syncResource) => {
      const resourceHandles = await this.getResourceHandles(syncResource, profile);
      return resourceHandles.map((resourceHandle, index) => ({ ...resourceHandle, syncResource, previous: resourceHandles[index + 1] }));
    }));
    const syncResourceHandles = result.flat().sort((a, b) => b.created - a.created);
    for (const syncResourceHandle of syncResourceHandles) {
      const handle = JSON.stringify({ syncResourceHandle, syncResource: syncResourceHandle.syncResource });
      treeItems.push({
        handle,
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label: getSyncAreaLabel(syncResourceHandle.syncResource) },
        description: fromNow(syncResourceHandle.created, true),
        tooltip: new Date(syncResourceHandle.created).toLocaleString(),
        themeIcon: FolderThemeIcon,
        syncResourceHandle,
        contextValue: `sync-resource-${syncResourceHandle.syncResource}`
      });
    }
    return treeItems;
  }
};
UserDataSyncActivityViewDataProvider = __decorateClass([
  __decorateParam(0, IUserDataSyncService),
  __decorateParam(1, IUserDataSyncResourceProviderService),
  __decorateParam(2, IUserDataAutoSyncService),
  __decorateParam(3, IUserDataSyncWorkbenchService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IUserDataProfilesService)
], UserDataSyncActivityViewDataProvider);
class LocalUserDataSyncActivityViewDataProvider extends UserDataSyncActivityViewDataProvider {
  getResourceHandles(syncResource, profile) {
    return this.userDataSyncResourceProviderService.getLocalSyncResourceHandles(syncResource, profile);
  }
  async getProfiles() {
    return this.userDataProfilesService.profiles.filter((p) => !p.isDefault).map((p) => ({
      id: p.id,
      collection: p.id,
      name: p.name
    }));
  }
}
let RemoteUserDataSyncActivityViewDataProvider = class extends UserDataSyncActivityViewDataProvider {
  constructor(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncMachinesService, userDataSyncWorkbenchService, notificationService, userDataProfilesService) {
    super(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService);
    this.userDataSyncMachinesService = userDataSyncMachinesService;
  }
  async getChildren(element) {
    if (!element) {
      this.machinesPromise = void 0;
    }
    return super.getChildren(element);
  }
  getMachines() {
    if (this.machinesPromise === void 0) {
      this.machinesPromise = this.userDataSyncMachinesService.getMachines();
    }
    return this.machinesPromise;
  }
  getResourceHandles(syncResource, profile) {
    return this.userDataSyncResourceProviderService.getRemoteSyncResourceHandles(syncResource, profile);
  }
  getProfiles() {
    return this.userDataSyncResourceProviderService.getRemoteSyncedProfiles();
  }
  async getChildrenForSyncResourceTreeItem(element) {
    const children = await super.getChildrenForSyncResourceTreeItem(element);
    if (children.length) {
      const machineId = await this.userDataSyncResourceProviderService.getMachineId(element.syncResourceHandle);
      if (machineId) {
        const machines = await this.getMachines();
        const machine = machines.find(({ id }) => id === machineId);
        children[0].description = machine?.isCurrent ? localize({ key: "current", comment: ["Represents current machine"] }, "Current") : machine?.name;
      }
    }
    return children;
  }
};
RemoteUserDataSyncActivityViewDataProvider = __decorateClass([
  __decorateParam(0, IUserDataSyncService),
  __decorateParam(1, IUserDataSyncResourceProviderService),
  __decorateParam(2, IUserDataAutoSyncService),
  __decorateParam(3, IUserDataSyncMachinesService),
  __decorateParam(4, IUserDataSyncWorkbenchService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IUserDataProfilesService)
], RemoteUserDataSyncActivityViewDataProvider);
let ExtractedUserDataSyncActivityViewDataProvider = class extends UserDataSyncActivityViewDataProvider {
  constructor(activityDataResource, userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService, fileService, uriIdentityService) {
    super(userDataSyncService, userDataSyncResourceProviderService, userDataAutoSyncService, userDataSyncWorkbenchService, notificationService, userDataProfilesService);
    this.activityDataResource = activityDataResource;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
  }
  async getChildren(element) {
    if (!element) {
      this.machinesPromise = void 0;
      if (!this.activityDataResource) {
        return [];
      }
      const stat = await this.fileService.resolve(this.activityDataResource);
      if (stat.isDirectory) {
        this.activityDataLocation = this.activityDataResource;
      } else {
        this.activityDataLocation = this.uriIdentityService.extUri.joinPath(this.uriIdentityService.extUri.dirname(this.activityDataResource), "remoteActivity");
        try {
          await this.fileService.del(this.activityDataLocation, { recursive: true });
        } catch (e) {
        }
        await this.userDataSyncService.extractActivityData(this.activityDataResource, this.activityDataLocation);
      }
    }
    return super.getChildren(element);
  }
  getResourceHandles(syncResource, profile) {
    return this.userDataSyncResourceProviderService.getLocalSyncResourceHandles(syncResource, profile, this.activityDataLocation);
  }
  async getProfiles() {
    return this.userDataSyncResourceProviderService.getLocalSyncedProfiles(this.activityDataLocation);
  }
  async getChildrenForSyncResourceTreeItem(element) {
    const children = await super.getChildrenForSyncResourceTreeItem(element);
    if (children.length) {
      const machineId = await this.userDataSyncResourceProviderService.getMachineId(element.syncResourceHandle);
      if (machineId) {
        const machines = await this.getMachines();
        const machine = machines.find(({ id }) => id === machineId);
        children[0].description = machine?.isCurrent ? localize({ key: "current", comment: ["Represents current machine"] }, "Current") : machine?.name;
      }
    }
    return children;
  }
  getMachines() {
    if (this.machinesPromise === void 0) {
      this.machinesPromise = this.userDataSyncResourceProviderService.getLocalSyncedMachines(this.activityDataLocation);
    }
    return this.machinesPromise;
  }
};
ExtractedUserDataSyncActivityViewDataProvider = __decorateClass([
  __decorateParam(1, IUserDataSyncService),
  __decorateParam(2, IUserDataSyncResourceProviderService),
  __decorateParam(3, IUserDataAutoSyncService),
  __decorateParam(4, IUserDataSyncWorkbenchService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IUserDataProfilesService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IUriIdentityService)
], ExtractedUserDataSyncActivityViewDataProvider);
let UserDataSyncMachinesViewDataProvider = class {
  constructor(treeView, userDataSyncMachinesService, quickInputService, notificationService, dialogService, userDataSyncWorkbenchService) {
    this.treeView = treeView;
    this.userDataSyncMachinesService = userDataSyncMachinesService;
    this.quickInputService = quickInputService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
  }
  async getChildren(element) {
    if (!element) {
      this.machinesPromise = void 0;
    }
    try {
      let machines = await this.getMachines();
      machines = machines.filter((m) => !m.disabled).sort((m1, m2) => m1.isCurrent ? -1 : 1);
      this.treeView.message = machines.length ? void 0 : localize("no machines", "No Machines");
      return machines.map(({ id, name, isCurrent, platform }) => ({
        handle: id,
        collapsibleState: TreeItemCollapsibleState.None,
        label: { label: name },
        description: isCurrent ? localize({ key: "current", comment: ["Current machine"] }, "Current") : void 0,
        themeIcon: platform && isWebPlatform(platform) ? Codicon.globe : Codicon.vm,
        contextValue: "sync-machine"
      }));
    } catch (error) {
      this.notificationService.error(error);
      return [];
    }
  }
  getMachines() {
    if (this.machinesPromise === void 0) {
      this.machinesPromise = this.userDataSyncMachinesService.getMachines();
    }
    return this.machinesPromise;
  }
  async disable(machineIds) {
    const machines = await this.getMachines();
    const machinesToDisable = machines.filter(({ id }) => machineIds.includes(id));
    if (!machinesToDisable.length) {
      throw new Error(localize("not found", "machine not found with id: {0}", machineIds.join(",")));
    }
    const result = await this.dialogService.confirm({
      type: "info",
      message: machinesToDisable.length > 1 ? localize("turn off sync on multiple machines", "Are you sure you want to turn off sync on selected machines?") : localize("turn off sync on machine", "Are you sure you want to turn off sync on {0}?", machinesToDisable[0].name),
      primaryButton: localize({ key: "turn off", comment: ["&& denotes a mnemonic"] }, "&&Turn off")
    });
    if (!result.confirmed) {
      return false;
    }
    if (machinesToDisable.some((machine) => machine.isCurrent)) {
      await this.userDataSyncWorkbenchService.turnoff(false);
    }
    const otherMachinesToDisable = machinesToDisable.filter((machine) => !machine.isCurrent).map((machine) => [machine.id, false]);
    if (otherMachinesToDisable.length) {
      await this.userDataSyncMachinesService.setEnablements(otherMachinesToDisable);
    }
    return true;
  }
  async rename(machineId) {
    const disposableStore = new DisposableStore();
    const inputBox = disposableStore.add(this.quickInputService.createInputBox());
    inputBox.placeholder = localize("placeholder", "Enter the name of the machine");
    inputBox.busy = true;
    inputBox.show();
    const machines = await this.getMachines();
    const machine = machines.find(({ id }) => id === machineId);
    const enabledMachines = machines.filter(({ disabled }) => !disabled);
    if (!machine) {
      inputBox.hide();
      disposableStore.dispose();
      throw new Error(localize("not found", "machine not found with id: {0}", machineId));
    }
    inputBox.busy = false;
    inputBox.value = machine.name;
    const validateMachineName = (machineName) => {
      machineName = machineName.trim();
      return machineName && !enabledMachines.some((m) => m.id !== machineId && m.name === machineName) ? machineName : null;
    };
    disposableStore.add(inputBox.onDidChangeValue(() => inputBox.validationMessage = validateMachineName(inputBox.value) ? "" : localize("valid message", "Machine name should be unique and not empty")));
    return new Promise((c, e) => {
      disposableStore.add(inputBox.onDidAccept(async () => {
        const machineName = validateMachineName(inputBox.value);
        disposableStore.dispose();
        if (machineName && machineName !== machine.name) {
          try {
            await this.userDataSyncMachinesService.renameMachine(machineId, machineName);
            c(true);
          } catch (error) {
            e(error);
          }
        } else {
          c(false);
        }
      }));
    });
  }
};
UserDataSyncMachinesViewDataProvider = __decorateClass([
  __decorateParam(1, IUserDataSyncMachinesService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IUserDataSyncWorkbenchService)
], UserDataSyncMachinesViewDataProvider);
let UserDataSyncTroubleshootViewDataProvider = class {
  constructor(fileService, userDataSyncWorkbenchService, environmentService, uriIdentityService) {
    this.fileService = fileService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
    this.environmentService = environmentService;
    this.uriIdentityService = uriIdentityService;
  }
  async getChildren(element) {
    if (!element) {
      return [{
        handle: "SYNC_LOGS",
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label: localize("sync logs", "Logs") },
        themeIcon: Codicon.folder
      }, {
        handle: "LAST_SYNC_STATES",
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label: localize("last sync states", "Last Synced Remotes") },
        themeIcon: Codicon.folder
      }];
    }
    if (element.handle === "LAST_SYNC_STATES") {
      return this.getLastSyncStates();
    }
    if (element.handle === "SYNC_LOGS") {
      return this.getSyncLogs();
    }
    return [];
  }
  async getLastSyncStates() {
    const result = [];
    for (const syncResource of ALL_SYNC_RESOURCES) {
      const resource = getLastSyncResourceUri(void 0, syncResource, this.environmentService, this.uriIdentityService.extUri);
      if (await this.fileService.exists(resource)) {
        result.push({
          handle: resource.toString(),
          label: { label: getSyncAreaLabel(syncResource) },
          collapsibleState: TreeItemCollapsibleState.None,
          resourceUri: resource,
          command: { id: API_OPEN_EDITOR_COMMAND_ID, title: "", arguments: [resource, void 0, void 0] }
        });
      }
    }
    return result;
  }
  async getSyncLogs() {
    const logResources = await this.userDataSyncWorkbenchService.getAllLogResources();
    const result = [];
    for (const syncLogResource of logResources) {
      const logFolder = this.uriIdentityService.extUri.dirname(syncLogResource);
      result.push({
        handle: syncLogResource.toString(),
        collapsibleState: TreeItemCollapsibleState.None,
        resourceUri: syncLogResource,
        label: { label: this.uriIdentityService.extUri.basename(logFolder) },
        description: this.uriIdentityService.extUri.isEqual(logFolder, this.environmentService.logsHome) ? localize({ key: "current", comment: ["Represents current log file"] }, "Current") : void 0,
        command: { id: API_OPEN_EDITOR_COMMAND_ID, title: "", arguments: [syncLogResource, void 0, void 0] }
      });
    }
    return result;
  }
};
UserDataSyncTroubleshootViewDataProvider = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUserDataSyncWorkbenchService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, IUriIdentityService)
], UserDataSyncTroubleshootViewDataProvider);
export {
  UserDataSyncDataViews
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVzZXJEYXRhU3luY1xcYnJvd3NlclxcdXNlckRhdGFTeW5jVmlld3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVmlld3NSZWdpc3RyeSwgRXh0ZW5zaW9ucywgSVRyZWVWaWV3RGVzY3JpcHRvciwgSVRyZWVWaWV3RGF0YVByb3ZpZGVyLCBJVHJlZUl0ZW0sIFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSwgVHJlZVZpZXdJdGVtSGFuZGxlQXJnLCBWaWV3Q29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBUcmVlVmlldywgVHJlZVZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy90cmVlVmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEFMTF9TWU5DX1JFU09VUkNFUywgSVVzZXJEYXRhU3luY1NlcnZpY2UsIElTeW5jUmVzb3VyY2VIYW5kbGUgYXMgSVJlc291cmNlSGFuZGxlLCBTeW5jU3RhdHVzLCBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSwgVXNlckRhdGFTeW5jRXJyb3IsIFVzZXJEYXRhU3luY0Vycm9yQ29kZSwgZ2V0TGFzdFN5bmNSZXNvdXJjZVVyaSwgU3luY1Jlc291cmNlLCBJU3luY1VzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUR0byB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGb2xkZXJUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGZyb21Ob3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsIENPTlRFWFRfU1lOQ19TVEFURSwgZ2V0U3luY0FyZWFMYWJlbCwgQ09OVEVYVF9BQ0NPVU5UX1NUQVRFLCBBY2NvdW50U3RhdHVzLCBDT05URVhUX0VOQUJMRV9BQ1RJVklUWV9WSUVXUywgU1lOQ19USVRMRSwgU1lOQ19DT05GTElDVFNfVklFV19JRCwgQ09OVEVYVF9FTkFCTEVfU1lOQ19DT05GTElDVFNfVklFVywgQ09OVEVYVF9IQVNfQ09ORkxJQ1RTIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSwgSVVzZXJEYXRhU3luY01hY2hpbmUsIGlzV2ViUGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luY01hY2hpbmVzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCwgQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNDb25mbGljdHNWaWV3UGFuZSB9IGZyb20gJy4vdXNlckRhdGFTeW5jQ29uZmxpY3RzVmlldy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVN5bmNEYXRhVmlld3MgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IFZpZXdDb250YWluZXIsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2U6IElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU2VydmljZTogSVVzZXJEYXRhU3luY1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZWdpc3RlclZpZXdzKGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlld3MoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0dGhpcy5yZWdpc3RlckNvbmZsaWN0c1ZpZXcoY29udGFpbmVyKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpdml0eVZpZXcoY29udGFpbmVyLCB0cnVlKTtcblx0XHR0aGlzLnJlZ2lzdGVyTWFjaGluZXNWaWV3KGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnJlZ2lzdGVyQWN0aXZpdHlWaWV3KGNvbnRhaW5lciwgZmFsc2UpO1xuXHRcdHRoaXMucmVnaXN0ZXJUcm91YmxlU2hvb3RWaWV3KGNvbnRhaW5lcik7XG5cdFx0dGhpcy5yZWdpc3RlckV4dGVybmFsQWN0aXZpdHlWaWV3KGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29uZmxpY3RzVmlldyhjb250YWluZXI6IFZpZXdDb250YWluZXIpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3c1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5cdFx0Y29uc3Qgdmlld05hbWUgPSBsb2NhbGl6ZTIoJ2NvbmZsaWN0cycsIFwiQ29uZmxpY3RzXCIpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJVHJlZVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6IFNZTkNfQ09ORkxJQ1RTX1ZJRVdfSUQsXG5cdFx0XHRuYW1lOiB2aWV3TmFtZSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVXNlckRhdGFTeW5jQ29uZmxpY3RzVmlld1BhbmUpLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfRU5BQkxFX1NZTkNfQ09ORkxJQ1RTX1ZJRVcsIENPTlRFWFRfSEFTX0NPTkZMSUNUUyksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiBmYWxzZSxcblx0XHRcdGNhbk1vdmVWaWV3OiBmYWxzZSxcblx0XHRcdHRyZWVWaWV3OiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVWaWV3LCBTWU5DX0NPTkZMSUNUU19WSUVXX0lELCB2aWV3TmFtZS52YWx1ZSksXG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0b3JkZXI6IDEwMCxcblx0XHR9O1xuXHRcdHZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck1hY2hpbmVzVmlldyhjb250YWluZXI6IFZpZXdDb250YWluZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpZCA9IGB3b3JrYmVuY2gudmlld3Muc3luYy5tYWNoaW5lc2A7XG5cdFx0Y29uc3QgbmFtZSA9IGxvY2FsaXplMignc3luY2VkIG1hY2hpbmVzJywgXCJTeW5jZWQgTWFjaGluZXNcIik7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVWaWV3LCBpZCwgbmFtZS52YWx1ZSk7XG5cdFx0Y29uc3QgZGF0YVByb3ZpZGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNNYWNoaW5lc1ZpZXdEYXRhUHJvdmlkZXIsIHRyZWVWaWV3KTtcblx0XHR0cmVlVmlldy5zaG93UmVmcmVzaEFjdGlvbiA9IHRydWU7XG5cdFx0dHJlZVZpZXcuY2FuU2VsZWN0TWFueSA9IHRydWU7XG5cdFx0dHJlZVZpZXcuZGF0YVByb3ZpZGVyID0gZGF0YVByb3ZpZGVyO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KHRoaXMudXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLm9uRGlkQ2hhbmdlLCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uub25EaWRSZXNldFJlbW90ZSkoKCkgPT4gdHJlZVZpZXcucmVmcmVzaCgpKSk7XG5cdFx0Y29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJVHJlZVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihUcmVlVmlld1BhbmUpLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1lOQ19TVEFURS5ub3RFcXVhbHNUbyhTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpLCBDT05URVhUX0FDQ09VTlRfU1RBVEUuaXNFcXVhbFRvKEFjY291bnRTdGF0dXMuQXZhaWxhYmxlKSwgQ09OVEVYVF9FTkFCTEVfQUNUSVZJVFlfVklFV1MpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0XHRcdGNhbk1vdmVWaWV3OiBmYWxzZSxcblx0XHRcdHRyZWVWaWV3LFxuXHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdG9yZGVyOiAzMDAsXG5cdFx0fTtcblx0XHR2aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yXSwgY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLnN5bmMuZWRpdE1hY2hpbmVOYW1lYCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb25zLnN5bmMuZWRpdE1hY2hpbmVOYW1lJywgXCJFZGl0IE5hbWVcIiksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5lZGl0LFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld0l0ZW1Db250ZXh0LFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIGlkKSksXG5cdFx0XHRcdFx0XHRncm91cDogJ2lubGluZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGhhbmRsZTogVHJlZVZpZXdJdGVtSGFuZGxlQXJnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZWQgPSBhd2FpdCBkYXRhUHJvdmlkZXIucmVuYW1lKGhhbmRsZS4kdHJlZUl0ZW1IYW5kbGUpO1xuXHRcdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRyZWVWaWV3LnJlZnJlc2goKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLnN5bmMudHVybk9mZlN5bmNPbk1hY2hpbmVgLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbnMuc3luYy50dXJuT2ZmU3luY09uTWFjaGluZScsIFwiVHVybiBvZmYgU2V0dGluZ3MgU3luY1wiKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdJdGVtQ29udGV4dCxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBpZCksIENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0l0ZW0nLCAnc3luYy1tYWNoaW5lJykpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBoYW5kbGU6IFRyZWVWaWV3SXRlbUhhbmRsZUFyZywgc2VsZWN0ZWQ/OiBUcmVlVmlld0l0ZW1IYW5kbGVBcmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRpZiAoYXdhaXQgZGF0YVByb3ZpZGVyLmRpc2FibGUoKHNlbGVjdGVkIHx8IFtoYW5kbGVdKS5tYXAoaGFuZGxlID0+IGhhbmRsZS4kdHJlZUl0ZW1IYW5kbGUpKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRyZWVWaWV3LnJlZnJlc2goKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGl2aXR5Vmlldyhjb250YWluZXI6IFZpZXdDb250YWluZXIsIHJlbW90ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGlkID0gYHdvcmtiZW5jaC52aWV3cy5zeW5jLiR7cmVtb3RlID8gJ3JlbW90ZScgOiAnbG9jYWwnfUFjdGl2aXR5YDtcblx0XHRjb25zdCBuYW1lID0gcmVtb3RlID8gbG9jYWxpemUyKCdyZW1vdGUgc3luYyBhY3Rpdml0eSB0aXRsZScsIFwiU3luYyBBY3Rpdml0eSAoUmVtb3RlKVwiKSA6IGxvY2FsaXplMignbG9jYWwgc3luYyBhY3Rpdml0eSB0aXRsZScsIFwiU3luYyBBY3Rpdml0eSAoTG9jYWwpXCIpO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlVmlldywgaWQsIG5hbWUudmFsdWUpO1xuXHRcdHRyZWVWaWV3LnNob3dDb2xsYXBzZUFsbEFjdGlvbiA9IHRydWU7XG5cdFx0dHJlZVZpZXcuc2hvd1JlZnJlc2hBY3Rpb24gPSB0cnVlO1xuXHRcdHRyZWVWaWV3LmRhdGFQcm92aWRlciA9IHJlbW90ZSA/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlVXNlckRhdGFTeW5jQWN0aXZpdHlWaWV3RGF0YVByb3ZpZGVyKVxuXHRcdFx0OiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsVXNlckRhdGFTeW5jQWN0aXZpdHlWaWV3RGF0YVByb3ZpZGVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVzb3VyY2VFbmFibGVtZW50LFxuXHRcdFx0dGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVuYWJsZW1lbnQsXG5cdFx0XHR0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uub25EaWRSZXNldExvY2FsLFxuXHRcdFx0dGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkUmVzZXRSZW1vdGUpKCgpID0+IHRyZWVWaWV3LnJlZnJlc2goKSkpO1xuXHRcdGNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVRyZWVWaWV3RGVzY3JpcHRvciA9IHtcblx0XHRcdGlkLFxuXHRcdFx0bmFtZSxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoVHJlZVZpZXdQYW5lKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NZTkNfU1RBVEUubm90RXF1YWxzVG8oU3luY1N0YXR1cy5VbmluaXRpYWxpemVkKSwgQ09OVEVYVF9BQ0NPVU5UX1NUQVRFLmlzRXF1YWxUbyhBY2NvdW50U3RhdHVzLkF2YWlsYWJsZSksIENPTlRFWFRfRU5BQkxFX0FDVElWSVRZX1ZJRVdTKSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdFx0XHRjYW5Nb3ZlVmlldzogZmFsc2UsXG5cdFx0XHR0cmVlVmlldyxcblx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRvcmRlcjogcmVtb3RlID8gMjAwIDogNDAwLFxuXHRcdFx0aGlkZUJ5RGVmYXVsdDogIXJlbW90ZSxcblx0XHR9O1xuXHRcdHZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckRhdGFWaWV3QWN0aW9ucyhpZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRXh0ZXJuYWxBY3Rpdml0eVZpZXcoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaWQgPSBgd29ya2JlbmNoLnZpZXdzLnN5bmMuZXh0ZXJuYWxBY3Rpdml0eWA7XG5cdFx0Y29uc3QgbmFtZSA9IGxvY2FsaXplMignZG93bmxvYWRlZCBzeW5jIGFjdGl2aXR5IHRpdGxlJywgXCJTeW5jIEFjdGl2aXR5IChEZXZlbG9wZXIpXCIpO1xuXHRcdGNvbnN0IGRhdGFQcm92aWRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0cmFjdGVkVXNlckRhdGFTeW5jQWN0aXZpdHlWaWV3RGF0YVByb3ZpZGVyLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlVmlldywgaWQsIG5hbWUudmFsdWUpO1xuXHRcdHRyZWVWaWV3LnNob3dDb2xsYXBzZUFsbEFjdGlvbiA9IGZhbHNlO1xuXHRcdHRyZWVWaWV3LnNob3dSZWZyZXNoQWN0aW9uID0gZmFsc2U7XG5cdFx0dHJlZVZpZXcuZGF0YVByb3ZpZGVyID0gZGF0YVByb3ZpZGVyO1xuXG5cdFx0Y29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJVHJlZVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihUcmVlVmlld1BhbmUpLFxuXHRcdFx0d2hlbjogQ09OVEVYVF9FTkFCTEVfQUNUSVZJVFlfVklFV1MsXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0Y2FuTW92ZVZpZXc6IGZhbHNlLFxuXHRcdFx0dHJlZVZpZXcsXG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0aGlkZUJ5RGVmYXVsdDogZmFsc2UsXG5cdFx0fTtcblx0XHR2aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yXSwgY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLnN5bmMubG9hZEFjdGl2aXR5YCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb25zLnN5bmMubG9hZEFjdGl2aXR5JywgXCJMb2FkIFN5bmMgQWN0aXZpdHlcIiksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5jbG91ZFVwbG9hZCxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIGlkKSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgZmlsZURpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd09wZW5EaWFsb2coe1xuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2VsZWN0IHN5bmMgYWN0aXZpdHkgZmlsZScsIFwiU2VsZWN0IFN5bmMgQWN0aXZpdHkgRmlsZSBvciBGb2xkZXJcIiksXG5cdFx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IHRydWUsXG5cdFx0XHRcdFx0Y2FuU2VsZWN0Rm9sZGVyczogdHJ1ZSxcblx0XHRcdFx0XHRjYW5TZWxlY3RNYW55OiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghcmVzdWx0Py5bMF0pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGF0YVByb3ZpZGVyLmFjdGl2aXR5RGF0YVJlc291cmNlID0gcmVzdWx0WzBdO1xuXHRcdFx0XHRhd2FpdCB0cmVlVmlldy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckRhdGFWaWV3QWN0aW9ucyh2aWV3SWQ6IHN0cmluZykge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb25zLnN5bmMuJHt2aWV3SWR9LnJlc29sdmVSZXNvdXJjZWAsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9ucy5zeW5jLnJlc29sdmVSZXNvdXJjZVJlZicsIFwiU2hvdyByYXcgSlNPTiBzeW5jIGRhdGFcIiksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3SXRlbUNvbnRleHQsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Jywgdmlld0lkKSwgQ29udGV4dEtleUV4cHIucmVnZXgoJ3ZpZXdJdGVtJywgL3N5bmMtcmVzb3VyY2UtLiovaSkpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGhhbmRsZTogVHJlZVZpZXdJdGVtSGFuZGxlQXJnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IDx7IHJlc291cmNlOiBzdHJpbmcgfT5KU09OLnBhcnNlKGhhbmRsZS4kdHJlZUl0ZW1IYW5kbGUpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5wYXJzZShyZXNvdXJjZSksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbnMuc3luYy4ke3ZpZXdJZH0uY29tcGFyZVdpdGhMb2NhbGAsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9ucy5zeW5jLmNvbXBhcmVXaXRoTG9jYWwnLCBcIkNvbXBhcmUgd2l0aCBMb2NhbFwiKSxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdJdGVtQ29udGV4dCxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCB2aWV3SWQpLCBDb250ZXh0S2V5RXhwci5yZWdleCgndmlld0l0ZW0nLCAvc3luYy1hc3NvY2lhdGVkUmVzb3VyY2UtLiovaSkpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGhhbmRsZTogVHJlZVZpZXdJdGVtSGFuZGxlQXJnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHsgcmVzb3VyY2UsIGNvbXBhcmFibGVSZXNvdXJjZSB9ID0gPHsgcmVzb3VyY2U6IHN0cmluZzsgY29tcGFyYWJsZVJlc291cmNlOiBzdHJpbmcgfT5KU09OLnBhcnNlKGhhbmRsZS4kdHJlZUl0ZW1IYW5kbGUpO1xuXHRcdFx0XHRjb25zdCByZW1vdGVSZXNvdXJjZSA9IFVSSS5wYXJzZShyZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGxvY2FsUmVzb3VyY2UgPSBVUkkucGFyc2UoY29tcGFyYWJsZVJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0cmVtb3RlUmVzb3VyY2UsXG5cdFx0XHRcdFx0bG9jYWxSZXNvdXJjZSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlVG9Mb2NhbERpZmYnLCBcInswfSBcdTIxOTQgezF9XCIsIGxvY2FsaXplKHsga2V5OiAnbGVmdFJlc291cmNlTmFtZScsIGNvbW1lbnQ6IFsncmVtb3RlIGFzIGluIGZpbGUgaW4gY2xvdWQnXSB9LCBcInswfSAoUmVtb3RlKVwiLCBiYXNlbmFtZShyZW1vdGVSZXNvdXJjZSkpLCBsb2NhbGl6ZSh7IGtleTogJ3JpZ2h0UmVzb3VyY2VOYW1lJywgY29tbWVudDogWydsb2NhbCBhcyBpbiBmaWxlIGluIGRpc2snXSB9LCBcInswfSAoTG9jYWwpXCIsIGJhc2VuYW1lKGxvY2FsUmVzb3VyY2UpKSksXG5cdFx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbnMuc3luYy4ke3ZpZXdJZH0ucmVwbGFjZUN1cnJlbnRgLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbnMuc3luYy5yZXBsYWNlQ3VycmVudCcsIFwiUmVzdG9yZVwiKSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmRpc2NhcmQsXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3SXRlbUNvbnRleHQsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Jywgdmlld0lkKSwgQ29udGV4dEtleUV4cHIucmVnZXgoJ3ZpZXdJdGVtJywgL3N5bmMtcmVzb3VyY2UtLiovaSksIENvbnRleHRLZXlFeHByLm5vdEVxdWFscygndmlld0l0ZW0nLCBgc3luYy1yZXNvdXJjZS0ke1N5bmNSZXNvdXJjZS5Qcm9maWxlc31gKSksXG5cdFx0XHRcdFx0XHRncm91cDogJ2lubGluZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGhhbmRsZTogVHJlZVZpZXdJdGVtSGFuZGxlQXJnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVN5bmNTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgeyBzeW5jUmVzb3VyY2VIYW5kbGUsIHN5bmNSZXNvdXJjZSB9ID0gPHsgc3luY1Jlc291cmNlSGFuZGxlOiBVcmlEdG88SVN5bmNSZXNvdXJjZUhhbmRsZT47IHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlIH0+SlNPTi5wYXJzZShoYW5kbGUuJHRyZWVJdGVtSGFuZGxlKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSh7IGtleTogJ2NvbmZpcm0gcmVwbGFjZScsIGNvbW1lbnQ6IFsnQSBjb25maXJtYXRpb24gbWVzc2FnZSB0byByZXBsYWNlIGN1cnJlbnQgdXNlciBkYXRhIChzZXR0aW5ncywgZXh0ZW5zaW9ucywga2V5YmluZGluZ3MsIHNuaXBwZXRzKSB3aXRoIHNlbGVjdGVkIHZlcnNpb24nXSB9LCBcIldvdWxkIHlvdSBsaWtlIHRvIHJlcGxhY2UgeW91ciBjdXJyZW50IHswfSB3aXRoIHNlbGVjdGVkP1wiLCBnZXRTeW5jQXJlYUxhYmVsKHN5bmNSZXNvdXJjZSkpLFxuXHRcdFx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdFx0XHR0aXRsZTogU1lOQ19USVRMRS52YWx1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdXNlckRhdGFTeW5jU2VydmljZS5yZXBsYWNlKHsgY3JlYXRlZDogc3luY1Jlc291cmNlSGFuZGxlLmNyZWF0ZWQsIHVyaTogVVJJLnJldml2ZShzeW5jUmVzb3VyY2VIYW5kbGUudXJpKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclRyb3VibGVTaG9vdFZpZXcoY29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaWQgPSBgd29ya2JlbmNoLnZpZXdzLnN5bmMudHJvdWJsZXNob290YDtcblx0XHRjb25zdCBuYW1lID0gbG9jYWxpemUyKCd0cm91Ymxlc2hvb3QnLCBcIlRyb3VibGVzaG9vdFwiKTtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVZpZXcsIGlkLCBuYW1lLnZhbHVlKTtcblx0XHRjb25zdCBkYXRhUHJvdmlkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhU3luY1Ryb3VibGVzaG9vdFZpZXdEYXRhUHJvdmlkZXIpO1xuXHRcdHRyZWVWaWV3LnNob3dSZWZyZXNoQWN0aW9uID0gdHJ1ZTtcblx0XHR0cmVlVmlldy5kYXRhUHJvdmlkZXIgPSBkYXRhUHJvdmlkZXI7XG5cblx0XHRjb25zdCB2aWV3c1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3I6IElUcmVlVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZCxcblx0XHRcdG5hbWUsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFRyZWVWaWV3UGFuZSksXG5cdFx0XHR3aGVuOiBDT05URVhUX0VOQUJMRV9BQ1RJVklUWV9WSUVXUyxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdFx0XHRjYW5Nb3ZlVmlldzogZmFsc2UsXG5cdFx0XHR0cmVlVmlldyxcblx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRvcmRlcjogNTAwLFxuXHRcdFx0aGlkZUJ5RGVmYXVsdDogdHJ1ZVxuXHRcdH07XG5cdFx0dmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt2aWV3RGVzY3JpcHRvcl0sIGNvbnRhaW5lcik7XG5cblx0fVxuXG59XG5cbnR5cGUgUHJvZmlsZSA9IElVc2VyRGF0YVByb2ZpbGUgfCBJU3luY1VzZXJEYXRhUHJvZmlsZTtcblxuaW50ZXJmYWNlIElTeW5jUmVzb3VyY2VIYW5kbGUgZXh0ZW5kcyBJUmVzb3VyY2VIYW5kbGUge1xuXHRwcm9maWxlSWQ/OiBzdHJpbmc7XG5cdHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlO1xuXHRwcmV2aW91cz86IElSZXNvdXJjZUhhbmRsZTtcbn1cblxuaW50ZXJmYWNlIFN5bmNSZXNvdXJjZUhhbmRsZVRyZWVJdGVtIGV4dGVuZHMgSVRyZWVJdGVtIHtcblx0c3luY1Jlc291cmNlSGFuZGxlOiBJU3luY1Jlc291cmNlSGFuZGxlO1xufVxuXG5pbnRlcmZhY2UgUHJvZmlsZVRyZWVJdGVtIGV4dGVuZHMgSVRyZWVJdGVtIHtcblx0cHJvZmlsZTogUHJvZmlsZTtcbn1cblxuYWJzdHJhY3QgY2xhc3MgVXNlckRhdGFTeW5jQWN0aXZpdHlWaWV3RGF0YVByb3ZpZGVyPFQgPSBQcm9maWxlPiBpbXBsZW1lbnRzIElUcmVlVmlld0RhdGFQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzeW5jUmVzb3VyY2VIYW5kbGVzQnlQcm9maWxlID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8U3luY1Jlc291cmNlSGFuZGxlVHJlZUl0ZW1bXT4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVN5bmNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1c2VyRGF0YVN5bmNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZTogSVVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlOiBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZTogSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbihlbGVtZW50PzogSVRyZWVJdGVtKTogUHJvbWlzZTxJVHJlZUl0ZW1bXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZ2V0Um9vdHMoKTtcblx0XHRcdH1cblx0XHRcdGlmICgoPFByb2ZpbGVUcmVlSXRlbT5lbGVtZW50KS5wcm9maWxlIHx8IGVsZW1lbnQuaGFuZGxlID09PSB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmlkKSB7XG5cdFx0XHRcdGxldCBwcm9taXNlID0gdGhpcy5zeW5jUmVzb3VyY2VIYW5kbGVzQnlQcm9maWxlLmdldChlbGVtZW50LmhhbmRsZSk7XG5cdFx0XHRcdGlmICghcHJvbWlzZSkge1xuXHRcdFx0XHRcdHRoaXMuc3luY1Jlc291cmNlSGFuZGxlc0J5UHJvZmlsZS5zZXQoZWxlbWVudC5oYW5kbGUsIHByb21pc2UgPSB0aGlzLmdldFN5bmNSZXNvdXJjZUhhbmRsZXMoPFQ+KDxQcm9maWxlVHJlZUl0ZW0+ZWxlbWVudCkucHJvZmlsZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhd2FpdCBwcm9taXNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCg8U3luY1Jlc291cmNlSGFuZGxlVHJlZUl0ZW0+ZWxlbWVudCkuc3luY1Jlc291cmNlSGFuZGxlKSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmdldENoaWxkcmVuRm9yU3luY1Jlc291cmNlVHJlZUl0ZW0oPFN5bmNSZXNvdXJjZUhhbmRsZVRyZWVJdGVtPmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIShlcnJvciBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY0Vycm9yKSkge1xuXHRcdFx0XHRlcnJvciA9IFVzZXJEYXRhU3luY0Vycm9yLnRvVXNlckRhdGFTeW5jRXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jRXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLkluY29tcGF0aWJsZVJlbW90ZUNvbnRlbnQpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6ICdyZXNldCcsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXNldCcsIFwiUmVzZXQgU3luY2VkIERhdGFcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UucmVzZXRTeW5jZWREYXRhKClcblx0XHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFJvb3RzKCk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHR0aGlzLnN5bmNSZXNvdXJjZUhhbmRsZXNCeVByb2ZpbGUuY2xlYXIoKTtcblxuXHRcdGNvbnN0IHJvb3RzOiBJVHJlZUl0ZW1bXSA9IFtdO1xuXG5cdFx0Y29uc3QgcHJvZmlsZXMgPSBhd2FpdCB0aGlzLmdldFByb2ZpbGVzKCk7XG5cdFx0aWYgKHByb2ZpbGVzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcHJvZmlsZVRyZWVJdGVtID0ge1xuXHRcdFx0XHRoYW5kbGU6IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuaWQsXG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLm5hbWUgfSxcblx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkLFxuXHRcdFx0fTtcblx0XHRcdHJvb3RzLnB1c2gocHJvZmlsZVRyZWVJdGVtKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFN5bmNSZXNvdXJjZUhhbmRsZXMgPSBhd2FpdCB0aGlzLmdldFN5bmNSZXNvdXJjZUhhbmRsZXMoKTtcblx0XHRcdHJvb3RzLnB1c2goLi4uZGVmYXVsdFN5bmNSZXNvdXJjZUhhbmRsZXMpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiBwcm9maWxlcykge1xuXHRcdFx0Y29uc3QgcHJvZmlsZVRyZWVJdGVtOiBQcm9maWxlVHJlZUl0ZW0gPSB7XG5cdFx0XHRcdGhhbmRsZTogcHJvZmlsZS5pZCxcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHByb2ZpbGUubmFtZSB9LFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkLFxuXHRcdFx0XHRwcm9maWxlLFxuXHRcdFx0fTtcblx0XHRcdHJvb3RzLnB1c2gocHJvZmlsZVRyZWVJdGVtKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcm9vdHM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0Q2hpbGRyZW5Gb3JTeW5jUmVzb3VyY2VUcmVlSXRlbShlbGVtZW50OiBTeW5jUmVzb3VyY2VIYW5kbGVUcmVlSXRlbSk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHRjb25zdCBzeW5jUmVzb3VyY2VIYW5kbGUgPSAoPFN5bmNSZXNvdXJjZUhhbmRsZVRyZWVJdGVtPmVsZW1lbnQpLnN5bmNSZXNvdXJjZUhhbmRsZTtcblx0XHRjb25zdCBhc3NvY2lhdGVkUmVzb3VyY2VzID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5nZXRBc3NvY2lhdGVkUmVzb3VyY2VzKHN5bmNSZXNvdXJjZUhhbmRsZSk7XG5cdFx0Y29uc3QgcHJldmlvdXNBc3NvY2lhdGVkUmVzb3VyY2VzID0gc3luY1Jlc291cmNlSGFuZGxlLnByZXZpb3VzID8gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5nZXRBc3NvY2lhdGVkUmVzb3VyY2VzKHN5bmNSZXNvdXJjZUhhbmRsZS5wcmV2aW91cykgOiBbXTtcblx0XHRyZXR1cm4gYXNzb2NpYXRlZFJlc291cmNlcy5tYXAoKHsgcmVzb3VyY2UsIGNvbXBhcmFibGVSZXNvdXJjZSB9KSA9PiB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBKU09OLnN0cmluZ2lmeSh7IHJlc291cmNlOiByZXNvdXJjZS50b1N0cmluZygpLCBjb21wYXJhYmxlUmVzb3VyY2U6IGNvbXBhcmFibGVSZXNvdXJjZS50b1N0cmluZygpIH0pO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNSZXNvdXJjZSA9IHByZXZpb3VzQXNzb2NpYXRlZFJlc291cmNlcy5maW5kKHByZXZpb3VzID0+IGJhc2VuYW1lKHByZXZpb3VzLnJlc291cmNlKSA9PT0gYmFzZW5hbWUocmVzb3VyY2UpKT8ucmVzb3VyY2U7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRoYW5kbGUsXG5cdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lLFxuXHRcdFx0XHRyZXNvdXJjZVVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdGNvbW1hbmQ6IHByZXZpb3VzUmVzb3VyY2UgPyB7XG5cdFx0XHRcdFx0aWQ6IEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRcdGFyZ3VtZW50czogW1xuXHRcdFx0XHRcdFx0cHJldmlvdXNSZXNvdXJjZSxcblx0XHRcdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3NpZGVCeVNpZGVMYWJlbHMnLCBcInswfSBcdTIxOTQgezF9XCIsIGAke2Jhc2VuYW1lKHJlc291cmNlKX0gKCR7ZnJvbU5vdyhzeW5jUmVzb3VyY2VIYW5kbGUucHJldmlvdXMhLmNyZWF0ZWQsIHRydWUpfSlgLCBgJHtiYXNlbmFtZShyZXNvdXJjZSl9ICgke2Zyb21Ob3coc3luY1Jlc291cmNlSGFuZGxlLmNyZWF0ZWQsIHRydWUpfSlgKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSA6IHtcblx0XHRcdFx0XHRpZDogQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRcdGFyZ3VtZW50czogW3Jlc291cmNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZF1cblx0XHRcdFx0fSxcblx0XHRcdFx0Y29udGV4dFZhbHVlOiBgc3luYy1hc3NvY2lhdGVkUmVzb3VyY2UtJHtzeW5jUmVzb3VyY2VIYW5kbGUuc3luY1Jlc291cmNlfWBcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFN5bmNSZXNvdXJjZUhhbmRsZXMocHJvZmlsZT86IFQpOiBQcm9taXNlPFN5bmNSZXNvdXJjZUhhbmRsZVRyZWVJdGVtW10+IHtcblx0XHRjb25zdCB0cmVlSXRlbXM6IFN5bmNSZXNvdXJjZUhhbmRsZVRyZWVJdGVtW10gPSBbXTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLmFsbChBTExfU1lOQ19SRVNPVVJDRVMubWFwKGFzeW5jIHN5bmNSZXNvdXJjZSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZUhhbmRsZXMgPSBhd2FpdCB0aGlzLmdldFJlc291cmNlSGFuZGxlcyhzeW5jUmVzb3VyY2UsIHByb2ZpbGUpO1xuXHRcdFx0cmV0dXJuIHJlc291cmNlSGFuZGxlcy5tYXAoKHJlc291cmNlSGFuZGxlLCBpbmRleCkgPT4gKHsgLi4ucmVzb3VyY2VIYW5kbGUsIHN5bmNSZXNvdXJjZSwgcHJldmlvdXM6IHJlc291cmNlSGFuZGxlc1tpbmRleCArIDFdIH0pKTtcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc3luY1Jlc291cmNlSGFuZGxlcyA9IHJlc3VsdC5mbGF0KCkuc29ydCgoYSwgYikgPT4gYi5jcmVhdGVkIC0gYS5jcmVhdGVkKTtcblx0XHRmb3IgKGNvbnN0IHN5bmNSZXNvdXJjZUhhbmRsZSBvZiBzeW5jUmVzb3VyY2VIYW5kbGVzKSB7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBKU09OLnN0cmluZ2lmeSh7IHN5bmNSZXNvdXJjZUhhbmRsZSwgc3luY1Jlc291cmNlOiBzeW5jUmVzb3VyY2VIYW5kbGUuc3luY1Jlc291cmNlIH0pO1xuXHRcdFx0dHJlZUl0ZW1zLnB1c2goe1xuXHRcdFx0XHRoYW5kbGUsXG5cdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQsXG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBnZXRTeW5jQXJlYUxhYmVsKHN5bmNSZXNvdXJjZUhhbmRsZS5zeW5jUmVzb3VyY2UpIH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBmcm9tTm93KHN5bmNSZXNvdXJjZUhhbmRsZS5jcmVhdGVkLCB0cnVlKSxcblx0XHRcdFx0dG9vbHRpcDogbmV3IERhdGUoc3luY1Jlc291cmNlSGFuZGxlLmNyZWF0ZWQpLnRvTG9jYWxlU3RyaW5nKCksXG5cdFx0XHRcdHRoZW1lSWNvbjogRm9sZGVyVGhlbWVJY29uLFxuXHRcdFx0XHRzeW5jUmVzb3VyY2VIYW5kbGUsXG5cdFx0XHRcdGNvbnRleHRWYWx1ZTogYHN5bmMtcmVzb3VyY2UtJHtzeW5jUmVzb3VyY2VIYW5kbGUuc3luY1Jlc291cmNlfWBcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJlZUl0ZW1zO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldFByb2ZpbGVzKCk6IFByb21pc2U8UHJvZmlsZVtdPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldFJlc291cmNlSGFuZGxlcyhzeW5jUmVzb3VyY2U6IFN5bmNSZXNvdXJjZSwgcHJvZmlsZT86IFQpOiBQcm9taXNlPElSZXNvdXJjZUhhbmRsZVtdPjtcbn1cblxuY2xhc3MgTG9jYWxVc2VyRGF0YVN5bmNBY3Rpdml0eVZpZXdEYXRhUHJvdmlkZXIgZXh0ZW5kcyBVc2VyRGF0YVN5bmNBY3Rpdml0eVZpZXdEYXRhUHJvdmlkZXI8SVN5bmNVc2VyRGF0YVByb2ZpbGU+IHtcblxuXHRwcm90ZWN0ZWQgZ2V0UmVzb3VyY2VIYW5kbGVzKHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLCBwcm9maWxlOiBJU3luY1VzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVJlc291cmNlSGFuZGxlW10+IHtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5nZXRMb2NhbFN5bmNSZXNvdXJjZUhhbmRsZXMoc3luY1Jlc291cmNlLCBwcm9maWxlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRQcm9maWxlcygpOiBQcm9taXNlPElTeW5jVXNlckRhdGFQcm9maWxlW10+IHtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlc1xuXHRcdFx0LmZpbHRlcihwID0+ICFwLmlzRGVmYXVsdClcblx0XHRcdC5tYXAocCA9PiAoe1xuXHRcdFx0XHRpZDogcC5pZCxcblx0XHRcdFx0Y29sbGVjdGlvbjogcC5pZCxcblx0XHRcdFx0bmFtZTogcC5uYW1lLFxuXHRcdFx0fSkpO1xuXHR9XG59XG5cbmNsYXNzIFJlbW90ZVVzZXJEYXRhU3luY0FjdGl2aXR5Vmlld0RhdGFQcm92aWRlciBleHRlbmRzIFVzZXJEYXRhU3luY0FjdGl2aXR5Vmlld0RhdGFQcm92aWRlcjxJU3luY1VzZXJEYXRhUHJvZmlsZT4ge1xuXG5cdHByaXZhdGUgbWFjaGluZXNQcm9taXNlOiBQcm9taXNlPElVc2VyRGF0YVN5bmNNYWNoaW5lW10+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFTeW5jU2VydmljZSB1c2VyRGF0YVN5bmNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlIHVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlOiBJVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSB1c2VyRGF0YUF1dG9TeW5jU2VydmljZTogSVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTWFjaGluZXNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSB1c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlOiBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih1c2VyRGF0YVN5bmNTZXJ2aWNlLCB1c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZSwgdXNlckRhdGFBdXRvU3luY1NlcnZpY2UsIHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ/OiBJVHJlZUl0ZW0pOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHR0aGlzLm1hY2hpbmVzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmdldENoaWxkcmVuKGVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYWNoaW5lcygpOiBQcm9taXNlPElVc2VyRGF0YVN5bmNNYWNoaW5lW10+IHtcblx0XHRpZiAodGhpcy5tYWNoaW5lc1Byb21pc2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tYWNoaW5lc1Byb21pc2UgPSB0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5nZXRNYWNoaW5lcygpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tYWNoaW5lc1Byb21pc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0UmVzb3VyY2VIYW5kbGVzKHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLCBwcm9maWxlPzogSVN5bmNVc2VyRGF0YVByb2ZpbGUpOiBQcm9taXNlPElSZXNvdXJjZUhhbmRsZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuZ2V0UmVtb3RlU3luY1Jlc291cmNlSGFuZGxlcyhzeW5jUmVzb3VyY2UsIHByb2ZpbGUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFByb2ZpbGVzKCk6IFByb21pc2U8SVN5bmNVc2VyRGF0YVByb2ZpbGVbXT4ge1xuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLmdldFJlbW90ZVN5bmNlZFByb2ZpbGVzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZ2V0Q2hpbGRyZW5Gb3JTeW5jUmVzb3VyY2VUcmVlSXRlbShlbGVtZW50OiBTeW5jUmVzb3VyY2VIYW5kbGVUcmVlSXRlbSk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IHN1cGVyLmdldENoaWxkcmVuRm9yU3luY1Jlc291cmNlVHJlZUl0ZW0oZWxlbWVudCk7XG5cdFx0aWYgKGNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbWFjaGluZUlkID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5nZXRNYWNoaW5lSWQoZWxlbWVudC5zeW5jUmVzb3VyY2VIYW5kbGUpO1xuXHRcdFx0aWYgKG1hY2hpbmVJZCkge1xuXHRcdFx0XHRjb25zdCBtYWNoaW5lcyA9IGF3YWl0IHRoaXMuZ2V0TWFjaGluZXMoKTtcblx0XHRcdFx0Y29uc3QgbWFjaGluZSA9IG1hY2hpbmVzLmZpbmQoKHsgaWQgfSkgPT4gaWQgPT09IG1hY2hpbmVJZCk7XG5cdFx0XHRcdGNoaWxkcmVuWzBdLmRlc2NyaXB0aW9uID0gbWFjaGluZT8uaXNDdXJyZW50ID8gbG9jYWxpemUoeyBrZXk6ICdjdXJyZW50JywgY29tbWVudDogWydSZXByZXNlbnRzIGN1cnJlbnQgbWFjaGluZSddIH0sIFwiQ3VycmVudFwiKSA6IG1hY2hpbmU/Lm5hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjaGlsZHJlbjtcblx0fVxufVxuXG5jbGFzcyBFeHRyYWN0ZWRVc2VyRGF0YVN5bmNBY3Rpdml0eVZpZXdEYXRhUHJvdmlkZXIgZXh0ZW5kcyBVc2VyRGF0YVN5bmNBY3Rpdml0eVZpZXdEYXRhUHJvdmlkZXI8SVN5bmNVc2VyRGF0YVByb2ZpbGU+IHtcblxuXHRwcml2YXRlIG1hY2hpbmVzUHJvbWlzZTogUHJvbWlzZTxJVXNlckRhdGFTeW5jTWFjaGluZVtdPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGFjdGl2aXR5RGF0YUxvY2F0aW9uOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGFjdGl2aXR5RGF0YVJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElVc2VyRGF0YVN5bmNTZXJ2aWNlIHVzZXJEYXRhU3luY1NlcnZpY2U6IElVc2VyRGF0YVN5bmNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UgdXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2U6IElVc2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZSxcblx0XHRASVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIHVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlOiBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlIHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2U6IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVzZXJEYXRhU3luY1NlcnZpY2UsIHVzZXJEYXRhU3luY1Jlc291cmNlUHJvdmlkZXJTZXJ2aWNlLCB1c2VyRGF0YUF1dG9TeW5jU2VydmljZSwgdXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudD86IElUcmVlSXRlbSk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHRoaXMubWFjaGluZXNQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCF0aGlzLmFjdGl2aXR5RGF0YVJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodGhpcy5hY3Rpdml0eURhdGFSZXNvdXJjZSk7XG5cdFx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0aGlzLmFjdGl2aXR5RGF0YUxvY2F0aW9uID0gdGhpcy5hY3Rpdml0eURhdGFSZXNvdXJjZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZpdHlEYXRhTG9jYXRpb24gPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmRpcm5hbWUodGhpcy5hY3Rpdml0eURhdGFSZXNvdXJjZSksICdyZW1vdGVBY3Rpdml0eScpO1xuXHRcdFx0XHR0cnkgeyBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbCh0aGlzLmFjdGl2aXR5RGF0YUxvY2F0aW9uLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTsgfSBjYXRjaCAoZSkgey8qIGlnbm9yZSAqLyB9XG5cdFx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5leHRyYWN0QWN0aXZpdHlEYXRhKHRoaXMuYWN0aXZpdHlEYXRhUmVzb3VyY2UsIHRoaXMuYWN0aXZpdHlEYXRhTG9jYXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuZ2V0Q2hpbGRyZW4oZWxlbWVudCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0UmVzb3VyY2VIYW5kbGVzKHN5bmNSZXNvdXJjZTogU3luY1Jlc291cmNlLCBwcm9maWxlOiBJU3luY1VzZXJEYXRhUHJvZmlsZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVJlc291cmNlSGFuZGxlW10+IHtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5nZXRMb2NhbFN5bmNSZXNvdXJjZUhhbmRsZXMoc3luY1Jlc291cmNlLCBwcm9maWxlLCB0aGlzLmFjdGl2aXR5RGF0YUxvY2F0aW9uKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBnZXRQcm9maWxlcygpOiBQcm9taXNlPElTeW5jVXNlckRhdGFQcm9maWxlW10+IHtcblx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNSZXNvdXJjZVByb3ZpZGVyU2VydmljZS5nZXRMb2NhbFN5bmNlZFByb2ZpbGVzKHRoaXMuYWN0aXZpdHlEYXRhTG9jYXRpb24pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGdldENoaWxkcmVuRm9yU3luY1Jlc291cmNlVHJlZUl0ZW0oZWxlbWVudDogU3luY1Jlc291cmNlSGFuZGxlVHJlZUl0ZW0pOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBhd2FpdCBzdXBlci5nZXRDaGlsZHJlbkZvclN5bmNSZXNvdXJjZVRyZWVJdGVtKGVsZW1lbnQpO1xuXHRcdGlmIChjaGlsZHJlbi5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG1hY2hpbmVJZCA9IGF3YWl0IHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuZ2V0TWFjaGluZUlkKGVsZW1lbnQuc3luY1Jlc291cmNlSGFuZGxlKTtcblx0XHRcdGlmIChtYWNoaW5lSWQpIHtcblx0XHRcdFx0Y29uc3QgbWFjaGluZXMgPSBhd2FpdCB0aGlzLmdldE1hY2hpbmVzKCk7XG5cdFx0XHRcdGNvbnN0IG1hY2hpbmUgPSBtYWNoaW5lcy5maW5kKCh7IGlkIH0pID0+IGlkID09PSBtYWNoaW5lSWQpO1xuXHRcdFx0XHRjaGlsZHJlblswXS5kZXNjcmlwdGlvbiA9IG1hY2hpbmU/LmlzQ3VycmVudCA/IGxvY2FsaXplKHsga2V5OiAnY3VycmVudCcsIGNvbW1lbnQ6IFsnUmVwcmVzZW50cyBjdXJyZW50IG1hY2hpbmUnXSB9LCBcIkN1cnJlbnRcIikgOiBtYWNoaW5lPy5uYW1lO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdH1cblxuXHRwcml2YXRlIGdldE1hY2hpbmVzKCk6IFByb21pc2U8SVVzZXJEYXRhU3luY01hY2hpbmVbXT4ge1xuXHRcdGlmICh0aGlzLm1hY2hpbmVzUHJvbWlzZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLm1hY2hpbmVzUHJvbWlzZSA9IHRoaXMudXNlckRhdGFTeW5jUmVzb3VyY2VQcm92aWRlclNlcnZpY2UuZ2V0TG9jYWxTeW5jZWRNYWNoaW5lcyh0aGlzLmFjdGl2aXR5RGF0YUxvY2F0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWFjaGluZXNQcm9taXNlO1xuXHR9XG59XG5cbmNsYXNzIFVzZXJEYXRhU3luY01hY2hpbmVzVmlld0RhdGFQcm92aWRlciBpbXBsZW1lbnRzIElUcmVlVmlld0RhdGFQcm92aWRlciB7XG5cblx0cHJpdmF0ZSBtYWNoaW5lc1Byb21pc2U6IFByb21pc2U8SVVzZXJEYXRhU3luY01hY2hpbmVbXT4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0cmVlVmlldzogVHJlZVZpZXcsXG5cdFx0QElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2U6IElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZTogSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudD86IElUcmVlSXRlbSk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHRoaXMubWFjaGluZXNQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0bGV0IG1hY2hpbmVzID0gYXdhaXQgdGhpcy5nZXRNYWNoaW5lcygpO1xuXHRcdFx0bWFjaGluZXMgPSBtYWNoaW5lcy5maWx0ZXIobSA9PiAhbS5kaXNhYmxlZCkuc29ydCgobTEsIG0yKSA9PiBtMS5pc0N1cnJlbnQgPyAtMSA6IDEpO1xuXHRcdFx0dGhpcy50cmVlVmlldy5tZXNzYWdlID0gbWFjaGluZXMubGVuZ3RoID8gdW5kZWZpbmVkIDogbG9jYWxpemUoJ25vIG1hY2hpbmVzJywgXCJObyBNYWNoaW5lc1wiKTtcblx0XHRcdHJldHVybiBtYWNoaW5lcy5tYXAoKHsgaWQsIG5hbWUsIGlzQ3VycmVudCwgcGxhdGZvcm0gfSkgPT4gKHtcblx0XHRcdFx0aGFuZGxlOiBpZCxcblx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUsXG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBuYW1lIH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBpc0N1cnJlbnQgPyBsb2NhbGl6ZSh7IGtleTogJ2N1cnJlbnQnLCBjb21tZW50OiBbJ0N1cnJlbnQgbWFjaGluZSddIH0sIFwiQ3VycmVudFwiKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dGhlbWVJY29uOiBwbGF0Zm9ybSAmJiBpc1dlYlBsYXRmb3JtKHBsYXRmb3JtKSA/IENvZGljb24uZ2xvYmUgOiBDb2RpY29uLnZtLFxuXHRcdFx0XHRjb250ZXh0VmFsdWU6ICdzeW5jLW1hY2hpbmUnXG5cdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYWNoaW5lcygpOiBQcm9taXNlPElVc2VyRGF0YVN5bmNNYWNoaW5lW10+IHtcblx0XHRpZiAodGhpcy5tYWNoaW5lc1Byb21pc2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tYWNoaW5lc1Byb21pc2UgPSB0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5nZXRNYWNoaW5lcygpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tYWNoaW5lc1Byb21pc2U7XG5cdH1cblxuXHRhc3luYyBkaXNhYmxlKG1hY2hpbmVJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgbWFjaGluZXMgPSBhd2FpdCB0aGlzLmdldE1hY2hpbmVzKCk7XG5cdFx0Y29uc3QgbWFjaGluZXNUb0Rpc2FibGUgPSBtYWNoaW5lcy5maWx0ZXIoKHsgaWQgfSkgPT4gbWFjaGluZUlkcy5pbmNsdWRlcyhpZCkpO1xuXHRcdGlmICghbWFjaGluZXNUb0Rpc2FibGUubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vdCBmb3VuZCcsIFwibWFjaGluZSBub3QgZm91bmQgd2l0aCBpZDogezB9XCIsIG1hY2hpbmVJZHMuam9pbignLCcpKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0bWVzc2FnZTogbWFjaGluZXNUb0Rpc2FibGUubGVuZ3RoID4gMSA/IGxvY2FsaXplKCd0dXJuIG9mZiBzeW5jIG9uIG11bHRpcGxlIG1hY2hpbmVzJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gdHVybiBvZmYgc3luYyBvbiBzZWxlY3RlZCBtYWNoaW5lcz9cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgndHVybiBvZmYgc3luYyBvbiBtYWNoaW5lJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gdHVybiBvZmYgc3luYyBvbiB7MH0/XCIsIG1hY2hpbmVzVG9EaXNhYmxlWzBdLm5hbWUpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICd0dXJuIG9mZicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlR1cm4gb2ZmXCIpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG1hY2hpbmVzVG9EaXNhYmxlLnNvbWUobWFjaGluZSA9PiBtYWNoaW5lLmlzQ3VycmVudCkpIHtcblx0XHRcdGF3YWl0IHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS50dXJub2ZmKGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBvdGhlck1hY2hpbmVzVG9EaXNhYmxlOiBbc3RyaW5nLCBib29sZWFuXVtdID0gbWFjaGluZXNUb0Rpc2FibGUuZmlsdGVyKG1hY2hpbmUgPT4gIW1hY2hpbmUuaXNDdXJyZW50KVxuXHRcdFx0Lm1hcChtYWNoaW5lID0+IChbbWFjaGluZS5pZCwgZmFsc2VdKSk7XG5cdFx0aWYgKG90aGVyTWFjaGluZXNUb0Rpc2FibGUubGVuZ3RoKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5zZXRFbmFibGVtZW50cyhvdGhlck1hY2hpbmVzVG9EaXNhYmxlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIHJlbmFtZShtYWNoaW5lSWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpbnB1dEJveCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVJbnB1dEJveCgpKTtcblx0XHRpbnB1dEJveC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdwbGFjZWhvbGRlcicsIFwiRW50ZXIgdGhlIG5hbWUgb2YgdGhlIG1hY2hpbmVcIik7XG5cdFx0aW5wdXRCb3guYnVzeSA9IHRydWU7XG5cdFx0aW5wdXRCb3guc2hvdygpO1xuXHRcdGNvbnN0IG1hY2hpbmVzID0gYXdhaXQgdGhpcy5nZXRNYWNoaW5lcygpO1xuXHRcdGNvbnN0IG1hY2hpbmUgPSBtYWNoaW5lcy5maW5kKCh7IGlkIH0pID0+IGlkID09PSBtYWNoaW5lSWQpO1xuXHRcdGNvbnN0IGVuYWJsZWRNYWNoaW5lcyA9IG1hY2hpbmVzLmZpbHRlcigoeyBkaXNhYmxlZCB9KSA9PiAhZGlzYWJsZWQpO1xuXHRcdGlmICghbWFjaGluZSkge1xuXHRcdFx0aW5wdXRCb3guaGlkZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm90IGZvdW5kJywgXCJtYWNoaW5lIG5vdCBmb3VuZCB3aXRoIGlkOiB7MH1cIiwgbWFjaGluZUlkKSk7XG5cdFx0fVxuXHRcdGlucHV0Qm94LmJ1c3kgPSBmYWxzZTtcblx0XHRpbnB1dEJveC52YWx1ZSA9IG1hY2hpbmUubmFtZTtcblx0XHRjb25zdCB2YWxpZGF0ZU1hY2hpbmVOYW1lID0gKG1hY2hpbmVOYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsID0+IHtcblx0XHRcdG1hY2hpbmVOYW1lID0gbWFjaGluZU5hbWUudHJpbSgpO1xuXHRcdFx0cmV0dXJuIG1hY2hpbmVOYW1lICYmICFlbmFibGVkTWFjaGluZXMuc29tZShtID0+IG0uaWQgIT09IG1hY2hpbmVJZCAmJiBtLm5hbWUgPT09IG1hY2hpbmVOYW1lKSA/IG1hY2hpbmVOYW1lIDogbnVsbDtcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5wdXRCb3gub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PlxuXHRcdFx0aW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSB2YWxpZGF0ZU1hY2hpbmVOYW1lKGlucHV0Qm94LnZhbHVlKSA/ICcnIDogbG9jYWxpemUoJ3ZhbGlkIG1lc3NhZ2UnLCBcIk1hY2hpbmUgbmFtZSBzaG91bGQgYmUgdW5pcXVlIGFuZCBub3QgZW1wdHlcIikpKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4oKGMsIGUpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5wdXRCb3gub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtYWNoaW5lTmFtZSA9IHZhbGlkYXRlTWFjaGluZU5hbWUoaW5wdXRCb3gudmFsdWUpO1xuXHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRpZiAobWFjaGluZU5hbWUgJiYgbWFjaGluZU5hbWUgIT09IG1hY2hpbmUubmFtZSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZS5yZW5hbWVNYWNoaW5lKG1hY2hpbmVJZCwgbWFjaGluZU5hbWUpO1xuXHRcdFx0XHRcdFx0Yyh0cnVlKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0ZShlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGMoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgVXNlckRhdGFTeW5jVHJvdWJsZXNob290Vmlld0RhdGFQcm92aWRlciBpbXBsZW1lbnRzIElUcmVlVmlld0RhdGFQcm92aWRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZTogSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudD86IElUcmVlSXRlbSk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRoYW5kbGU6ICdTWU5DX0xPR1MnLFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkLFxuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogbG9jYWxpemUoJ3N5bmMgbG9ncycsIFwiTG9nc1wiKSB9LFxuXHRcdFx0XHR0aGVtZUljb246IENvZGljb24uZm9sZGVyLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRoYW5kbGU6ICdMQVNUX1NZTkNfU1RBVEVTJyxcblx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCxcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGxvY2FsaXplKCdsYXN0IHN5bmMgc3RhdGVzJywgXCJMYXN0IFN5bmNlZCBSZW1vdGVzXCIpIH0sXG5cdFx0XHRcdHRoZW1lSWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHR9XTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5oYW5kbGUgPT09ICdMQVNUX1NZTkNfU1RBVEVTJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0TGFzdFN5bmNTdGF0ZXMoKTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5oYW5kbGUgPT09ICdTWU5DX0xPR1MnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRTeW5jTG9ncygpO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TGFzdFN5bmNTdGF0ZXMoKTogUHJvbWlzZTxJVHJlZUl0ZW1bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSVRyZWVJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHN5bmNSZXNvdXJjZSBvZiBBTExfU1lOQ19SRVNPVVJDRVMpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZ2V0TGFzdFN5bmNSZXNvdXJjZVVyaSh1bmRlZmluZWQsIHN5bmNSZXNvdXJjZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaSk7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRoYW5kbGU6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGdldFN5bmNBcmVhTGFiZWwoc3luY1Jlc291cmNlKSB9LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lLFxuXHRcdFx0XHRcdHJlc291cmNlVXJpOiByZXNvdXJjZSxcblx0XHRcdFx0XHRjb21tYW5kOiB7IGlkOiBBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCwgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFtyZXNvdXJjZSwgdW5kZWZpbmVkLCB1bmRlZmluZWRdIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTeW5jTG9ncygpOiBQcm9taXNlPElUcmVlSXRlbVtdPiB7XG5cdFx0Y29uc3QgbG9nUmVzb3VyY2VzID0gYXdhaXQgdGhpcy51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLmdldEFsbExvZ1Jlc291cmNlcygpO1xuXHRcdGNvbnN0IHJlc3VsdDogSVRyZWVJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHN5bmNMb2dSZXNvdXJjZSBvZiBsb2dSZXNvdXJjZXMpIHtcblx0XHRcdGNvbnN0IGxvZ0ZvbGRlciA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHN5bmNMb2dSZXNvdXJjZSk7XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdGhhbmRsZTogc3luY0xvZ1Jlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lLFxuXHRcdFx0XHRyZXNvdXJjZVVyaTogc3luY0xvZ1Jlc291cmNlLFxuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmJhc2VuYW1lKGxvZ0ZvbGRlcikgfSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGxvZ0ZvbGRlciwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUpID8gbG9jYWxpemUoeyBrZXk6ICdjdXJyZW50JywgY29tbWVudDogWydSZXByZXNlbnRzIGN1cnJlbnQgbG9nIGZpbGUnXSB9LCBcIkN1cnJlbnRcIikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbW1hbmQ6IHsgaWQ6IEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lELCB0aXRsZTogJycsIGFyZ3VtZW50czogW3N5bmNMb2dSZXNvdXJjZSwgdW5kZWZpbmVkLCB1bmRlZmluZWRdIH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQXlCLFlBQW1FLGdDQUFzRTtBQUNsSyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsVUFBVSxvQkFBb0I7QUFDdkMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxvQkFBb0Isc0JBQThELFlBQVksZ0NBQWdDLDBCQUEwQixtQkFBbUIsdUJBQXVCLHdCQUF3QixjQUFvQyw0Q0FBNEM7QUFDblQsU0FBUyxpQkFBaUIsU0FBUyxjQUFjO0FBQ2pELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQkFB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TyxLQUFLLGtCQUFrQjtBQUFBLElBQy9CO0FBRUEsUUFBSSxRQUFRLFdBQVcsYUFBYTtBQUNuQyxhQUFPLEtBQUssWUFBWTtBQUFBLElBQ3pCO0FBRUEsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRUEsTUFBYyxvQkFBMEM7QUFDdkQsVUFBTSxTQUFzQixDQUFDO0FBQzdCLGVBQVcsZ0JBQWdCLG9CQUFvQjtBQUM5QyxZQUFNLFdBQVcsdUJBQXVCLFFBQVcsY0FBYyxLQUFLLG9CQUFvQixLQUFLLG1CQUFtQixNQUFNO0FBQ3hILFVBQUksTUFBTSxLQUFLLFlBQVksT0FBTyxRQUFRLEdBQUc7QUFDNUMsZUFBTyxLQUFLO0FBQUEsVUFDWCxRQUFRLFNBQVMsU0FBUztBQUFBLFVBQzFCLE9BQU8sRUFBRSxPQUFPLGlCQUFpQixZQUFZLEVBQUU7QUFBQSxVQUMvQyxrQkFBa0IseUJBQXlCO0FBQUEsVUFDM0MsYUFBYTtBQUFBLFVBQ2IsU0FBUyxFQUFFLElBQUksNEJBQTRCLE9BQU8sSUFBSSxXQUFXLENBQUMsVUFBVSxRQUFXLE1BQVMsRUFBRTtBQUFBLFFBQ25HLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLGNBQW9DO0FBQ2pELFVBQU0sZUFBZSxNQUFNLEtBQUssNkJBQTZCLG1CQUFtQjtBQUNoRixVQUFNLFNBQXNCLENBQUM7QUFDN0IsZUFBVyxtQkFBbUIsY0FBYztBQUMzQyxZQUFNLFlBQVksS0FBSyxtQkFBbUIsT0FBTyxRQUFRLGVBQWU7QUFDeEUsYUFBTyxLQUFLO0FBQUEsUUFDWCxRQUFRLGdCQUFnQixTQUFTO0FBQUEsUUFDakMsa0JBQWtCLHlCQUF5QjtBQUFBLFFBQzNDLGFBQWE7QUFBQSxRQUNiLE9BQU8sRUFBRSxPQUFPLEtBQUssbUJBQW1CLE9BQU8sU0FBUyxTQUFTLEVBQUU7QUFBQSxRQUNuRSxhQUFhLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxXQUFXLEtBQUssbUJBQW1CLFFBQVEsSUFBSSxTQUFTLEVBQUUsS0FBSyxXQUFXLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLFNBQVMsSUFBSTtBQUFBLFFBQ3ZMLFNBQVMsRUFBRSxJQUFJLDRCQUE0QixPQUFPLElBQUksV0FBVyxDQUFDLGlCQUFpQixRQUFXLE1BQVMsRUFBRTtBQUFBLE1BQzFHLENBQUM7QUFBQSxJQUNGO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFFRDtBQXRFTSwyQ0FBTjtBQUFBLEVBR0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQU5HOyIsCiAgIm5hbWVzIjogWyJoYW5kbGUiXQp9Cg==
