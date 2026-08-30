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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ILifecycleService, LifecyclePhase, ShutdownReason } from "../../../services/lifecycle/common/lifecycle.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { localize, localize2 } from "../../../../nls.js";
import { IEditSessionsStorageService, ChangeType, FileType, EDIT_SESSION_SYNC_CATEGORY, EDIT_SESSIONS_CONTAINER_ID, EditSessionSchemaVersion, IEditSessionsLogService, EDIT_SESSIONS_VIEW_ICON, EDIT_SESSIONS_TITLE, EDIT_SESSIONS_SHOW_VIEW, EDIT_SESSIONS_DATA_VIEW_ID, decodeEditSessionFileContent, hashedEditSessionId, editSessionsLogId, EDIT_SESSIONS_PENDING } from "../common/editSessions.js";
import { ISCMService } from "../../scm/common/scm.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { URI } from "../../../../base/common/uri.js";
import { basename, joinPath, relativePath } from "../../../../base/common/resources.js";
import { encodeBase64 } from "../../../../base/common/buffer.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { EditSessionsWorkbenchService } from "./editSessionsStorageService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { UserDataSyncErrorCode, UserDataSyncStoreError } from "../../../../platform/userDataSync/common/userDataSync.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { getFileNamesMessage, IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { Schemas } from "../../../../base/common/network.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IExtensionService, isProposedApiEnabled } from "../../../services/extensions/common/extensions.js";
import { EditSessionsLogService } from "../common/editSessionsLogService.js";
import { Extensions as ViewExtensions, ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { EditSessionsDataViews } from "./editSessionsViews.js";
import { EditSessionsFileSystemProvider } from "./editSessionsFileSystemProvider.js";
import { isNative, isWeb } from "../../../../base/common/platform.js";
import { VirtualWorkspaceContext, WorkspaceFolderCountContext } from "../../../common/contextkeys.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { equals } from "../../../../base/common/objects.js";
import { EditSessionIdentityMatch, IEditSessionIdentityService } from "../../../../platform/workspace/common/editSessions.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IActivityService, NumberBadge } from "../../../services/activity/common/activity.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { WorkspaceStateSynchroniser } from "../common/workspaceStateSync.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IRequestService } from "../../../../platform/request/common/request.js";
import { EditSessionsStoreClient } from "../common/editSessionsStorageClient.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceIdentityService } from "../../../services/workspaces/common/workspaceIdentityService.js";
import { hashAsync } from "../../../../base/common/hash.js";
import { ResourceSet } from "../../../../base/common/map.js";
registerSingleton(IEditSessionsLogService, EditSessionsLogService, InstantiationType.Delayed);
registerSingleton(IEditSessionsStorageService, EditSessionsWorkbenchService, InstantiationType.Delayed);
const continueWorkingOnCommand = {
  id: "_workbench.editSessions.actions.continueEditSession",
  title: localize2("continue working on", "Continue Working On..."),
  precondition: WorkspaceFolderCountContext.notEqualsTo("0"),
  f1: true
};
const openLocalFolderCommand = {
  id: "_workbench.editSessions.actions.continueEditSession.openLocalFolder",
  title: localize2("continue edit session in local folder", "Open In Local Folder"),
  category: EDIT_SESSION_SYNC_CATEGORY,
  precondition: ContextKeyExpr.and(IsWebContext.toNegated(), VirtualWorkspaceContext)
};
const showOutputChannelCommand = {
  id: "workbench.editSessions.actions.showOutputChannel",
  title: localize2("show log", "Show Log"),
  category: EDIT_SESSION_SYNC_CATEGORY
};
const installAdditionalContinueOnOptionsCommand = {
  id: "workbench.action.continueOn.extensions",
  title: localize("continueOn.installAdditional", "Install additional development environment options")
};
registerAction2(class extends Action2 {
  constructor() {
    super({ ...installAdditionalContinueOnOptionsCommand, f1: false });
  }
  async run(accessor) {
    return accessor.get(IExtensionsWorkbenchService).openSearch("@tag:continueOn");
  }
});
const resumeProgressOptionsTitle = `[${localize("resuming working changes window", "Resuming working changes...")}](command:${showOutputChannelCommand.id})`;
const resumeProgressOptions = {
  location: ProgressLocation.Window,
  type: "syncing"
};
const queryParamName = "editSessionId";
const useEditSessionsWithContinueOn = "workbench.editSessions.continueOn";
let EditSessionsContribution = class extends Disposable {
  constructor(editSessionsStorageService, fileService, progressService, openerService, telemetryService, scmService, notificationService, dialogService, logService, environmentService, instantiationService, productService, configurationService, contextService, editSessionIdentityService, quickInputService, commandService, contextKeyService, fileDialogService, lifecycleService, storageService, activityService, editorService, remoteAgentService, extensionService, requestService, userDataProfilesService, uriIdentityService, workspaceIdentityService) {
    super();
    this.editSessionsStorageService = editSessionsStorageService;
    this.fileService = fileService;
    this.progressService = progressService;
    this.openerService = openerService;
    this.telemetryService = telemetryService;
    this.scmService = scmService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.instantiationService = instantiationService;
    this.productService = productService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.editSessionIdentityService = editSessionIdentityService;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.contextKeyService = contextKeyService;
    this.fileDialogService = fileDialogService;
    this.lifecycleService = lifecycleService;
    this.storageService = storageService;
    this.activityService = activityService;
    this.editorService = editorService;
    this.remoteAgentService = remoteAgentService;
    this.extensionService = extensionService;
    this.requestService = requestService;
    this.userDataProfilesService = userDataProfilesService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceIdentityService = workspaceIdentityService;
    this.continueEditSessionOptions = [];
    this.accountsMenuBadgeDisposable = this._register(new MutableDisposable());
    this.registeredCommands = /* @__PURE__ */ new Set();
    this.shouldShowViewsContext = EDIT_SESSIONS_SHOW_VIEW.bindTo(this.contextKeyService);
    this.pendingEditSessionsContext = EDIT_SESSIONS_PENDING.bindTo(this.contextKeyService);
    this.pendingEditSessionsContext.set(false);
    if (!this.productService["editSessions.store"]?.url) {
      return;
    }
    this.editSessionsStorageClient = new EditSessionsStoreClient(URI.parse(this.productService["editSessions.store"].url), this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService);
    this.editSessionsStorageService.storeClient = this.editSessionsStorageClient;
    this.workspaceStateSynchronizer = new WorkspaceStateSynchroniser(this.userDataProfilesService.defaultProfile, void 0, this.editSessionsStorageClient, this.logService, this.fileService, this.environmentService, this.telemetryService, this.configurationService, this.storageService, this.uriIdentityService, this.workspaceIdentityService, this.editSessionsStorageService);
    this.autoResumeEditSession();
    this.registerActions();
    this.registerViews();
    this.registerContributedEditSessionOptions();
    this._register(this.fileService.registerProvider(EditSessionsFileSystemProvider.SCHEMA, new EditSessionsFileSystemProvider(this.editSessionsStorageService)));
    this._register(this.lifecycleService.onWillShutdown((e) => {
      if (e.reason !== ShutdownReason.RELOAD && this.editSessionsStorageService.isSignedIn && this.configurationService.getValue("workbench.experimental.cloudChanges.autoStore") === "onShutdown" && !isWeb) {
        e.join(this.autoStoreEditSession(), { id: "autoStoreWorkingChanges", label: localize("autoStoreWorkingChanges", "Storing current working changes...") });
      }
    }));
    this._register(this.editSessionsStorageService.onDidSignIn(() => this.updateAccountsMenuBadge()));
    this._register(this.editSessionsStorageService.onDidSignOut(() => this.updateAccountsMenuBadge()));
  }
  async autoResumeEditSession() {
    const shouldAutoResumeOnReload = this.configurationService.getValue("workbench.cloudChanges.autoResume") === "onReload";
    if (this.environmentService.editSessionId !== void 0) {
      this.logService.info(`Resuming cloud changes, reason: found editSessionId ${this.environmentService.editSessionId} in environment service...`);
      await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(this.environmentService.editSessionId, void 0, void 0, void 0, progress).finally(() => this.environmentService.editSessionId = void 0));
    } else if (shouldAutoResumeOnReload && this.editSessionsStorageService.isSignedIn) {
      this.logService.info("Resuming cloud changes, reason: cloud changes enabled...");
      await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(void 0, true, void 0, void 0, progress));
    } else if (shouldAutoResumeOnReload) {
      const hasApplicationLaunchedFromContinueOnFlow = this.storageService.getBoolean(EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, StorageScope.APPLICATION, false);
      this.logService.info(`Prompting to enable cloud changes, has application previously launched from Continue On flow: ${hasApplicationLaunchedFromContinueOnFlow}`);
      const handlePendingEditSessions = () => {
        this.logService.info("Showing badge to enable cloud changes in accounts menu...");
        this.updateAccountsMenuBadge();
        this.pendingEditSessionsContext.set(true);
        const disposable = this.editSessionsStorageService.onDidSignIn(async () => {
          disposable.dispose();
          this.logService.info("Showing badge to enable cloud changes in accounts menu succeeded, resuming cloud changes...");
          await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(void 0, true, void 0, void 0, progress));
          this.storageService.remove(EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, StorageScope.APPLICATION);
          this.environmentService.continueOn = void 0;
        });
      };
      if (this.environmentService.continueOn !== void 0 && !this.editSessionsStorageService.isSignedIn && // and user has not yet been prompted to sign in on this machine
      hasApplicationLaunchedFromContinueOnFlow === false) {
        this.storageService.store(EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
        this.logService.info("Prompting to enable cloud changes...");
        await this.editSessionsStorageService.initialize("read");
        if (this.editSessionsStorageService.isSignedIn) {
          this.logService.info("Prompting to enable cloud changes succeeded, resuming cloud changes...");
          await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(void 0, true, void 0, void 0, progress));
        } else {
          handlePendingEditSessions();
        }
      } else if (!this.editSessionsStorageService.isSignedIn && // and user has been prompted to sign in on this machine
      hasApplicationLaunchedFromContinueOnFlow === true) {
        handlePendingEditSessions();
      }
    } else {
      this.logService.debug("Auto resuming cloud changes disabled.");
    }
  }
  updateAccountsMenuBadge() {
    if (this.editSessionsStorageService.isSignedIn) {
      return this.accountsMenuBadgeDisposable.clear();
    }
    const badge = new NumberBadge(1, () => localize("check for pending cloud changes", "Check for pending cloud changes"));
    this.accountsMenuBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
  }
  async autoStoreEditSession() {
    const cancellationTokenSource = new CancellationTokenSource();
    await this.progressService.withProgress({
      location: ProgressLocation.Window,
      type: "syncing",
      title: localize("store working changes", "Storing working changes...")
    }, async () => this.storeEditSession(false, cancellationTokenSource.token), () => {
      cancellationTokenSource.cancel();
      cancellationTokenSource.dispose();
    });
  }
  registerViews() {
    const container = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer(
      {
        id: EDIT_SESSIONS_CONTAINER_ID,
        title: EDIT_SESSIONS_TITLE,
        ctorDescriptor: new SyncDescriptor(
          ViewPaneContainer,
          [EDIT_SESSIONS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]
        ),
        icon: EDIT_SESSIONS_VIEW_ICON,
        hideIfEmpty: true
      },
      ViewContainerLocation.Sidebar,
      { doNotRegisterOpenCommand: true }
    );
    this._register(this.instantiationService.createInstance(EditSessionsDataViews, container));
  }
  registerActions() {
    this.registerContinueEditSessionAction();
    this.registerResumeLatestEditSessionAction();
    this.registerStoreLatestEditSessionAction();
    this.registerContinueInLocalFolderAction();
    this.registerShowEditSessionViewAction();
    this.registerShowEditSessionOutputChannelAction();
  }
  registerShowEditSessionOutputChannelAction() {
    this._register(registerAction2(class ShowEditSessionOutput extends Action2 {
      constructor() {
        super(showOutputChannelCommand);
      }
      run(accessor, ...args) {
        const outputChannel = accessor.get(IOutputService);
        void outputChannel.showChannel(editSessionsLogId);
      }
    }));
  }
  registerShowEditSessionViewAction() {
    const that = this;
    this._register(registerAction2(class ShowEditSessionView extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.showEditSessions",
          title: localize2("show cloud changes", "Show Cloud Changes"),
          category: EDIT_SESSION_SYNC_CATEGORY,
          f1: true
        });
      }
      async run(accessor) {
        that.shouldShowViewsContext.set(true);
        const viewsService = accessor.get(IViewsService);
        await viewsService.openView(EDIT_SESSIONS_DATA_VIEW_ID);
      }
    }));
  }
  registerContinueEditSessionAction() {
    const that = this;
    this._register(registerAction2(class ContinueEditSessionAction extends Action2 {
      constructor() {
        super(continueWorkingOnCommand);
      }
      async run(accessor, workspaceUri, destination) {
        let uri = workspaceUri;
        if (!destination && !uri) {
          destination = await that.pickContinueEditSessionDestination();
          if (!destination) {
            that.telemetryService.publicLog2("continueOn.editSessions.pick.outcome", { outcome: "noSelection" });
            return;
          }
        }
        const shouldStoreEditSession = await that.shouldContinueOnWithEditSession();
        let ref;
        if (shouldStoreEditSession) {
          that.telemetryService.publicLog2("continueOn.editSessions.store");
          const cancellationTokenSource = new CancellationTokenSource();
          try {
            ref = await that.progressService.withProgress({
              location: ProgressLocation.Notification,
              cancellable: true,
              type: "syncing",
              title: localize("store your working changes", "Storing your working changes...")
            }, async () => {
              const ref2 = await that.storeEditSession(false, cancellationTokenSource.token);
              if (ref2 !== void 0) {
                that.telemetryService.publicLog2("continueOn.editSessions.store.outcome", { outcome: "storeSucceeded", hashedId: hashedEditSessionId(ref2) });
              } else {
                that.telemetryService.publicLog2("continueOn.editSessions.store.outcome", { outcome: "storeSkipped" });
              }
              return ref2;
            }, () => {
              cancellationTokenSource.cancel();
              cancellationTokenSource.dispose();
              that.telemetryService.publicLog2("continueOn.editSessions.store.outcome", { outcome: "storeCancelledByUser" });
            });
          } catch (ex) {
            that.telemetryService.publicLog2("continueOn.editSessions.store.outcome", { outcome: "storeFailed" });
            throw ex;
          }
        }
        uri = destination ? await that.resolveDestination(destination) : uri;
        if (uri === void 0) {
          return;
        }
        if (ref !== void 0 && uri !== "noDestinationUri") {
          const encodedRef = encodeURIComponent(ref);
          uri = uri.with({
            query: uri.query.length > 0 ? uri.query + `&${queryParamName}=${encodedRef}&continueOn=1` : `${queryParamName}=${encodedRef}&continueOn=1`
          });
          that.logService.info(`Opening ${uri.toString()}`);
          await that.openerService.open(uri, { openExternal: true });
        } else if ((!shouldStoreEditSession || ref === void 0) && uri !== "noDestinationUri") {
          that.logService.info(`Opening ${uri.toString()}`);
          await that.openerService.open(uri, { openExternal: true });
        } else if (ref === void 0 && shouldStoreEditSession) {
          that.logService.warn(`Failed to store working changes when invoking ${continueWorkingOnCommand.id}.`);
        }
      }
    }));
  }
  registerResumeLatestEditSessionAction() {
    const that = this;
    this._register(registerAction2(class ResumeLatestEditSessionAction extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.resumeLatest",
          title: localize2("resume latest cloud changes", "Resume Latest Changes from Cloud"),
          category: EDIT_SESSION_SYNC_CATEGORY,
          f1: true
        });
      }
      async run(accessor, editSessionId, forceApplyUnrelatedChange) {
        await that.progressService.withProgress({ ...resumeProgressOptions, title: resumeProgressOptionsTitle }, async () => await that.resumeEditSession(editSessionId, void 0, forceApplyUnrelatedChange));
      }
    }));
    this._register(registerAction2(class ResumeLatestEditSessionAction extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.resumeFromSerializedPayload",
          title: localize2("resume cloud changes", "Resume Changes from Serialized Data"),
          category: "Developer",
          f1: true
        });
      }
      async run(accessor, editSessionId) {
        const data = await that.quickInputService.input({ prompt: "Enter serialized data" });
        if (data) {
          that.editSessionsStorageService.lastReadResources.set("editSessions", { content: data, ref: "" });
        }
        await that.progressService.withProgress({ ...resumeProgressOptions, title: resumeProgressOptionsTitle }, async () => await that.resumeEditSession(editSessionId, void 0, void 0, void 0, void 0, data));
      }
    }));
  }
  registerStoreLatestEditSessionAction() {
    const that = this;
    this._register(registerAction2(class StoreLatestEditSessionAction extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.storeCurrent",
          title: localize2("store working changes in cloud", "Store Working Changes in Cloud"),
          category: EDIT_SESSION_SYNC_CATEGORY,
          f1: true
        });
      }
      async run(accessor) {
        const cancellationTokenSource = new CancellationTokenSource();
        await that.progressService.withProgress({
          location: ProgressLocation.Notification,
          title: localize("storing working changes", "Storing working changes...")
        }, async () => {
          that.telemetryService.publicLog2("editSessions.store");
          await that.storeEditSession(true, cancellationTokenSource.token);
        }, () => {
          cancellationTokenSource.cancel();
          cancellationTokenSource.dispose();
        });
      }
    }));
  }
  async resumeEditSession(ref, silent, forceApplyUnrelatedChange, applyPartialMatch, progress, serializedData) {
    await this.remoteAgentService.getEnvironment();
    if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    this.logService.info(ref !== void 0 ? `Resuming changes from cloud with ref ${ref}...` : "Checking for pending cloud changes...");
    if (silent && !await this.editSessionsStorageService.initialize("read", true)) {
      return;
    }
    this.telemetryService.publicLog2("editSessions.resume");
    performance.mark("code/willResumeEditSessionFromIdentifier");
    progress?.report({ message: localize("checkingForWorkingChanges", "Checking for pending cloud changes...") });
    const data = serializedData ? { content: serializedData, ref: "" } : await this.editSessionsStorageService.read("editSessions", ref);
    if (!data) {
      if (ref === void 0 && !silent) {
        this.notificationService.info(localize("no cloud changes", "There are no changes to resume from the cloud."));
      } else if (ref !== void 0) {
        this.notificationService.warn(localize("no cloud changes for ref", "Could not resume changes from the cloud for ID {0}.", ref));
      }
      this.logService.info(ref !== void 0 ? `Aborting resuming changes from cloud as no edit session content is available to be applied from ref ${ref}.` : `Aborting resuming edit session as no edit session content is available to be applied`);
      return;
    }
    progress?.report({ message: resumeProgressOptionsTitle });
    const editSession = JSON.parse(data.content);
    ref = data.ref;
    if (editSession.version > EditSessionSchemaVersion) {
      this.notificationService.error(localize("client too old", "Please upgrade to a newer version of {0} to resume your working changes from the cloud.", this.productService.nameLong));
      this.telemetryService.publicLog2("editSessions.resume.outcome", { hashedId: hashedEditSessionId(ref), outcome: "clientUpdateNeeded" });
      return;
    }
    try {
      const { changes, conflictingChanges } = await this.generateChanges(editSession, ref, forceApplyUnrelatedChange, applyPartialMatch);
      if (changes.length === 0) {
        return;
      }
      if (conflictingChanges.length > 0) {
        const { confirmed } = await this.dialogService.confirm({
          type: Severity.Warning,
          message: conflictingChanges.length > 1 ? localize("resume edit session warning many", "Resuming your working changes from the cloud will overwrite the following {0} files. Do you want to proceed?", conflictingChanges.length) : localize("resume edit session warning 1", "Resuming your working changes from the cloud will overwrite {0}. Do you want to proceed?", basename(conflictingChanges[0].uri)),
          detail: conflictingChanges.length > 1 ? getFileNamesMessage(conflictingChanges.map((c) => c.uri)) : void 0
        });
        if (!confirmed) {
          return;
        }
      }
      for (const { uri, type, contents } of changes) {
        if (type === ChangeType.Addition) {
          await this.fileService.writeFile(uri, decodeEditSessionFileContent(editSession.version, contents));
        } else if (type === ChangeType.Deletion && await this.fileService.exists(uri)) {
          await this.fileService.del(uri);
        }
      }
      await this.workspaceStateSynchronizer?.apply();
      this.logService.info(`Deleting edit session with ref ${ref} after successfully applying it to current workspace...`);
      await this.editSessionsStorageService.delete("editSessions", ref);
      this.logService.info(`Deleted edit session with ref ${ref}.`);
      this.telemetryService.publicLog2("editSessions.resume.outcome", { hashedId: hashedEditSessionId(ref), outcome: "resumeSucceeded" });
    } catch (ex) {
      this.logService.error("Failed to resume edit session, reason: ", ex.toString());
      this.notificationService.error(localize("resume failed", "Failed to resume your working changes from the cloud."));
    }
    performance.mark("code/didResumeEditSessionFromIdentifier");
  }
  async generateChanges(editSession, ref, forceApplyUnrelatedChange = false, applyPartialMatch = false) {
    const changes = [];
    const conflictingChanges = [];
    const workspaceFolders = this.contextService.getWorkspace().folders;
    const cancellationTokenSource = new CancellationTokenSource();
    for (const folder of editSession.folders) {
      let folderRoot;
      if (folder.canonicalIdentity) {
        for (const f of workspaceFolders) {
          const identity = await this.editSessionIdentityService.getEditSessionIdentifier(f, cancellationTokenSource.token);
          this.logService.info(`Matching identity ${identity} against edit session folder identity ${folder.canonicalIdentity}...`);
          if (equals(identity, folder.canonicalIdentity) || forceApplyUnrelatedChange) {
            folderRoot = f;
            break;
          }
          if (identity !== void 0) {
            const match = await this.editSessionIdentityService.provideEditSessionIdentityMatch(f, identity, folder.canonicalIdentity, cancellationTokenSource.token);
            if (match === EditSessionIdentityMatch.Complete) {
              folderRoot = f;
              break;
            } else if (match === EditSessionIdentityMatch.Partial && this.configurationService.getValue("workbench.experimental.cloudChanges.partialMatches.enabled") === true) {
              if (!applyPartialMatch) {
                this.notificationService.prompt(
                  Severity.Info,
                  localize("editSessionPartialMatch", "You have pending working changes in the cloud for this workspace. Would you like to resume them?"),
                  [{ label: localize("resume", "Resume"), run: () => this.resumeEditSession(ref, false, void 0, true) }]
                );
              } else {
                folderRoot = f;
                break;
              }
            }
          }
        }
      } else {
        folderRoot = workspaceFolders.find((f) => f.name === folder.name);
      }
      if (!folderRoot) {
        this.logService.info(`Skipping applying ${folder.workingChanges.length} changes from edit session with ref ${ref} as no matching workspace folder was found.`);
        return { changes: [], conflictingChanges: [], contributedStateHandlers: [] };
      }
      const localChanges = /* @__PURE__ */ new Set();
      for (const repository of this.scmService.repositories) {
        if (repository.provider.rootUri !== void 0 && this.contextService.getWorkspaceFolder(repository.provider.rootUri)?.name === folder.name) {
          const repositoryChanges = this.getChangedResources(repository);
          repositoryChanges.forEach((change) => localChanges.add(change.toString()));
        }
      }
      for (const change of folder.workingChanges) {
        const uri = joinPath(folderRoot.uri, change.relativeFilePath);
        if (!this.uriIdentityService.extUri.isEqualOrParent(uri, folderRoot.uri) || this.uriIdentityService.extUri.isEqual(uri, folderRoot.uri)) {
          this.logService.warn(`Skipping change outside workspace folder: ${change.relativeFilePath}`);
          continue;
        }
        changes.push({ uri, type: change.type, contents: change.contents });
        if (await this.willChangeLocalContents(localChanges, uri, change)) {
          conflictingChanges.push({ uri, type: change.type, contents: change.contents });
        }
      }
    }
    return { changes, conflictingChanges };
  }
  async willChangeLocalContents(localChanges, uriWithIncomingChanges, incomingChange) {
    if (!localChanges.has(uriWithIncomingChanges.toString())) {
      return false;
    }
    const { contents, type } = incomingChange;
    switch (type) {
      case ChangeType.Addition: {
        const [originalContents, incomingContents] = await Promise.all([
          hashAsync(contents),
          hashAsync(encodeBase64((await this.fileService.readFile(uriWithIncomingChanges)).value))
        ]);
        return originalContents !== incomingContents;
      }
      case ChangeType.Deletion: {
        return await this.fileService.exists(uriWithIncomingChanges);
      }
      default:
        throw new Error("Unhandled change type.");
    }
  }
  async storeEditSession(fromStoreCommand, cancellationToken) {
    const folders = [];
    let editSessionSize = 0;
    let hasEdits = false;
    await this.editorService.saveAll();
    const createdEditSessionIdentities = new ResourceSet();
    for (const repository of this.scmService.repositories) {
      const changedResources = this.getChangedResources(repository);
      if (!changedResources.size) {
        continue;
      }
      for (const uri of changedResources) {
        const workspaceFolder = this.contextService.getWorkspaceFolder(uri);
        if (!workspaceFolder || createdEditSessionIdentities.has(uri)) {
          continue;
        }
        createdEditSessionIdentities.add(uri);
        await this.editSessionIdentityService.onWillCreateEditSessionIdentity(workspaceFolder, cancellationToken);
      }
    }
    for (const repository of this.scmService.repositories) {
      const trackedUris = this.getChangedResources(repository);
      const workingChanges = [];
      const { rootUri } = repository.provider;
      const workspaceFolder = rootUri ? this.contextService.getWorkspaceFolder(rootUri) : void 0;
      let name = workspaceFolder?.name;
      for (const uri of trackedUris) {
        const workspaceFolder2 = this.contextService.getWorkspaceFolder(uri);
        if (!workspaceFolder2) {
          this.logService.info(`Skipping working change ${uri.toString()} as no associated workspace folder was found.`);
          continue;
        }
        name = name ?? workspaceFolder2.name;
        const relativeFilePath = relativePath(workspaceFolder2.uri, uri) ?? uri.path;
        try {
          if (!(await this.fileService.stat(uri)).isFile) {
            continue;
          }
        } catch {
        }
        hasEdits = true;
        if (await this.fileService.exists(uri)) {
          const contents = encodeBase64((await this.fileService.readFile(uri)).value);
          editSessionSize += contents.length;
          if (editSessionSize > this.editSessionsStorageService.SIZE_LIMIT) {
            this.notificationService.error(localize("payload too large", "Your working changes exceed the size limit and cannot be stored."));
            return void 0;
          }
          workingChanges.push({ type: ChangeType.Addition, fileType: FileType.File, contents, relativeFilePath });
        } else {
          workingChanges.push({ type: ChangeType.Deletion, fileType: FileType.File, contents: void 0, relativeFilePath });
        }
      }
      let canonicalIdentity = void 0;
      if (workspaceFolder !== null && workspaceFolder !== void 0) {
        canonicalIdentity = await this.editSessionIdentityService.getEditSessionIdentifier(workspaceFolder, cancellationToken);
      }
      folders.push({ workingChanges, name: name ?? "", canonicalIdentity: canonicalIdentity ?? void 0, absoluteUri: workspaceFolder?.uri.toString() });
    }
    await this.workspaceStateSynchronizer?.sync();
    if (!hasEdits) {
      this.logService.info("Skipped storing working changes in the cloud as there are no edits to store.");
      if (fromStoreCommand) {
        this.notificationService.info(localize("no working changes to store", "Skipped storing working changes in the cloud as there are no edits to store."));
      }
      return void 0;
    }
    const data = { folders, version: 2, workspaceStateId: this.editSessionsStorageService.lastWrittenResources.get("workspaceState")?.ref };
    try {
      this.logService.info(`Storing edit session...`);
      const ref = await this.editSessionsStorageService.write("editSessions", data);
      this.logService.info(`Stored edit session with ref ${ref}.`);
      return ref;
    } catch (ex) {
      this.logService.error(`Failed to store edit session, reason: `, ex.toString());
      if (ex instanceof UserDataSyncStoreError) {
        switch (ex.code) {
          case UserDataSyncErrorCode.TooLarge:
            this.telemetryService.publicLog2("editSessions.upload.failed", { reason: "TooLarge" });
            this.notificationService.error(localize("payload too large", "Your working changes exceed the size limit and cannot be stored."));
            break;
          default:
            this.telemetryService.publicLog2("editSessions.upload.failed", { reason: "unknown" });
            this.notificationService.error(localize("payload failed", "Your working changes cannot be stored."));
            break;
        }
      }
    }
    return void 0;
  }
  getChangedResources(repository) {
    return repository.provider.groups.reduce((resources, resourceGroups) => {
      resourceGroups.resources.forEach((resource) => resources.add(resource.sourceUri));
      return resources;
    }, /* @__PURE__ */ new Set());
  }
  hasEditSession() {
    for (const repository of this.scmService.repositories) {
      if (this.getChangedResources(repository).size > 0) {
        return true;
      }
    }
    return false;
  }
  async shouldContinueOnWithEditSession() {
    if (this.editSessionsStorageService.isSignedIn) {
      return this.hasEditSession();
    }
    if (this.configurationService.getValue(useEditSessionsWithContinueOn) === "off") {
      this.telemetryService.publicLog2("continueOn.editSessions.canStore.outcome", { outcome: "disabledEditSessionsViaSetting" });
      return false;
    }
    if (this.hasEditSession()) {
      const disposables = new DisposableStore();
      const quickpick = disposables.add(this.quickInputService.createQuickPick());
      quickpick.placeholder = localize("continue with cloud changes", "Select whether to bring your working changes with you");
      quickpick.ok = false;
      quickpick.ignoreFocusOut = true;
      const withCloudChanges = { label: localize("with cloud changes", "Yes, continue with my working changes") };
      const withoutCloudChanges = { label: localize("without cloud changes", "No, continue without my working changes") };
      quickpick.items = [withCloudChanges, withoutCloudChanges];
      const continueWithCloudChanges = await new Promise((resolve, reject) => {
        disposables.add(quickpick.onDidAccept(() => {
          resolve(quickpick.selectedItems[0] === withCloudChanges);
          disposables.dispose();
        }));
        disposables.add(quickpick.onDidHide(() => {
          reject(new CancellationError());
          disposables.dispose();
        }));
        quickpick.show();
      });
      if (!continueWithCloudChanges) {
        this.telemetryService.publicLog2("continueOn.editSessions.canStore.outcome", { outcome: "didNotEnableEditSessionsWhenPrompted" });
        return continueWithCloudChanges;
      }
      const initialized = await this.editSessionsStorageService.initialize("write");
      if (!initialized) {
        this.telemetryService.publicLog2("continueOn.editSessions.canStore.outcome", { outcome: "didNotEnableEditSessionsWhenPrompted" });
      }
      return initialized;
    }
    return false;
  }
  //#region Continue Edit Session extension contribution point
  registerContributedEditSessionOptions() {
    continueEditSessionExtPoint.setHandler((extensions) => {
      const continueEditSessionOptions = [];
      for (const extension of extensions) {
        if (!isProposedApiEnabled(extension.description, "contribEditSessions")) {
          continue;
        }
        if (!Array.isArray(extension.value)) {
          continue;
        }
        for (const contribution of extension.value) {
          const command = MenuRegistry.getCommand(contribution.command);
          if (!command) {
            return;
          }
          const icon = command.icon;
          const title = typeof command.title === "string" ? command.title : command.title.value;
          const when = ContextKeyExpr.deserialize(contribution.when);
          continueEditSessionOptions.push(new ContinueEditSessionItem(
            ThemeIcon.isThemeIcon(icon) ? `$(${icon.id}) ${title}` : title,
            command.id,
            command.source?.title,
            when,
            contribution.documentation
          ));
          if (contribution.qualifiedName) {
            this.generateStandaloneOptionCommand(command.id, contribution.qualifiedName, contribution.category ?? command.category, when, contribution.remoteGroup);
          }
        }
      }
      this.continueEditSessionOptions = continueEditSessionOptions;
    });
  }
  generateStandaloneOptionCommand(commandId, qualifiedName, category, when, remoteGroup) {
    const command = {
      id: `${continueWorkingOnCommand.id}.${commandId}`,
      title: { original: qualifiedName, value: qualifiedName },
      category: typeof category === "string" ? { original: category, value: category } : category,
      precondition: when,
      f1: true
    };
    if (!this.registeredCommands.has(command.id)) {
      this.registeredCommands.add(command.id);
      this._register(registerAction2(class StandaloneContinueOnOption extends Action2 {
        constructor() {
          super(command);
        }
        async run(accessor) {
          return accessor.get(ICommandService).executeCommand(continueWorkingOnCommand.id, void 0, commandId);
        }
      }));
      if (remoteGroup !== void 0) {
        MenuRegistry.appendMenuItem(MenuId.StatusBarRemoteIndicatorMenu, {
          group: remoteGroup,
          command,
          when: command.precondition
        });
      }
    }
  }
  registerContinueInLocalFolderAction() {
    const that = this;
    this._register(registerAction2(class ContinueInLocalFolderAction extends Action2 {
      constructor() {
        super(openLocalFolderCommand);
      }
      async run(accessor) {
        const selection = await that.fileDialogService.showOpenDialog({
          title: localize("continueEditSession.openLocalFolder.title.v2", "Select a local folder to continue working in"),
          canSelectFolders: true,
          canSelectMany: false,
          canSelectFiles: false,
          availableFileSystems: [Schemas.file]
        });
        return selection?.length !== 1 ? void 0 : URI.from({
          scheme: that.productService.urlProtocol,
          authority: Schemas.file,
          path: selection[0].path
        });
      }
    }));
    if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== void 0 && isNative) {
      this.generateStandaloneOptionCommand(openLocalFolderCommand.id, localize("continueWorkingOn.existingLocalFolder", "Continue Working in Existing Local Folder"), void 0, openLocalFolderCommand.precondition, void 0);
    }
  }
  async pickContinueEditSessionDestination() {
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    const workspaceContext = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? this.contextService.getWorkspace().folders[0].name : this.contextService.getWorkspace().folders.map((folder) => folder.name).join(", ");
    quickPick.placeholder = localize("continueEditSessionPick.title.v2", "Select a development environment to continue working on {0} in", `'${workspaceContext}'`);
    quickPick.items = this.createPickItems();
    disposables.add(this.extensionService.onDidChangeExtensions(() => {
      quickPick.items = this.createPickItems();
    }));
    const command = await new Promise((resolve, reject) => {
      disposables.add(quickPick.onDidHide(() => {
        disposables.dispose();
        resolve(void 0);
      }));
      disposables.add(quickPick.onDidAccept((e) => {
        const selection = quickPick.activeItems[0].command;
        if (selection === installAdditionalContinueOnOptionsCommand.id) {
          void this.commandService.executeCommand(installAdditionalContinueOnOptionsCommand.id);
        } else {
          resolve(selection);
          quickPick.hide();
        }
      }));
      quickPick.show();
      disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
        if (e.item.documentation !== void 0) {
          const uri = URI.isUri(e.item.documentation) ? URI.parse(e.item.documentation) : await this.commandService.executeCommand(e.item.documentation);
          if (uri) {
            void this.openerService.open(uri, { openExternal: true });
          }
        }
      }));
    });
    quickPick.dispose();
    return command;
  }
  async resolveDestination(command) {
    try {
      const uri = await this.commandService.executeCommand(command);
      if (uri === void 0) {
        this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "noDestinationUri" });
        return "noDestinationUri";
      }
      if (URI.isUri(uri)) {
        this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "resolvedUri" });
        return uri;
      }
      this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "invalidDestination" });
      return void 0;
    } catch (ex) {
      if (ex instanceof CancellationError) {
        this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "cancelled" });
      } else {
        this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "unknownError" });
      }
      return void 0;
    }
  }
  createPickItems() {
    const items = [...this.continueEditSessionOptions].filter((option) => option.when === void 0 || this.contextKeyService.contextMatchesRules(option.when));
    if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== void 0 && isNative) {
      items.push(new ContinueEditSessionItem(
        "$(folder) " + localize("continueEditSessionItem.openInLocalFolder.v2", "Open in Local Folder"),
        openLocalFolderCommand.id,
        localize("continueEditSessionItem.builtin", "Built-in")
      ));
    }
    const sortedItems = items.sort((item1, item2) => item1.label.localeCompare(item2.label));
    return sortedItems.concat({ type: "separator" }, new ContinueEditSessionItem(installAdditionalContinueOnOptionsCommand.title, installAdditionalContinueOnOptionsCommand.id));
  }
};
EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY = "applicationLaunchedViaContinueOn";
EditSessionsContribution = __decorateClass([
  __decorateParam(0, IEditSessionsStorageService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IProgressService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, ISCMService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IEditSessionsLogService),
  __decorateParam(9, IEnvironmentService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IEditSessionIdentityService),
  __decorateParam(15, IQuickInputService),
  __decorateParam(16, ICommandService),
  __decorateParam(17, IContextKeyService),
  __decorateParam(18, IFileDialogService),
  __decorateParam(19, ILifecycleService),
  __decorateParam(20, IStorageService),
  __decorateParam(21, IActivityService),
  __decorateParam(22, IEditorService),
  __decorateParam(23, IRemoteAgentService),
  __decorateParam(24, IExtensionService),
  __decorateParam(25, IRequestService),
  __decorateParam(26, IUserDataProfilesService),
  __decorateParam(27, IUriIdentityService),
  __decorateParam(28, IWorkspaceIdentityService)
], EditSessionsContribution);
const infoButtonClass = ThemeIcon.asClassName(Codicon.info);
class ContinueEditSessionItem {
  constructor(label, command, description, when, documentation) {
    this.label = label;
    this.command = command;
    this.description = description;
    this.when = when;
    this.documentation = documentation;
    if (documentation !== void 0) {
      this.buttons = [{
        iconClass: infoButtonClass,
        tooltip: localize("learnMoreTooltip", "Learn More")
      }];
    }
  }
}
const continueEditSessionExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "continueEditSession",
  jsonSchema: {
    description: localize("continueEditSessionExtPoint", "Contributes options for continuing the current edit session in a different environment"),
    type: "array",
    items: {
      type: "object",
      properties: {
        command: {
          description: localize("continueEditSessionExtPoint.command", "Identifier of the command to execute. The command must be declared in the 'commands'-section and return a URI representing a different environment where the current edit session can be continued."),
          type: "string"
        },
        group: {
          description: localize("continueEditSessionExtPoint.group", "Group into which this item belongs."),
          type: "string"
        },
        qualifiedName: {
          description: localize("continueEditSessionExtPoint.qualifiedName", "A fully qualified name for this item which is used for display in menus."),
          type: "string"
        },
        description: {
          description: localize("continueEditSessionExtPoint.description", "The url, or a command that returns the url, to the option's documentation page."),
          type: "string"
        },
        remoteGroup: {
          description: localize("continueEditSessionExtPoint.remoteGroup", "Group into which this item belongs in the remote indicator."),
          type: "string"
        },
        when: {
          description: localize("continueEditSessionExtPoint.when", "Condition which must be true to show this item."),
          type: "string"
        }
      },
      required: ["command"]
    }
  }
});
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditSessionsContribution, LifecyclePhase.Restored);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  "properties": {
    "workbench.experimental.cloudChanges.autoStore": {
      enum: ["onShutdown", "off"],
      enumDescriptions: [
        localize("autoStoreWorkingChanges.onShutdown", "Automatically store current working changes in the cloud on window close."),
        localize("autoStoreWorkingChanges.off", "Never attempt to automatically store working changes in the cloud.")
      ],
      "type": "string",
      "tags": ["experimental", "usesOnlineServices"],
      "default": "off",
      "markdownDescription": localize("autoStoreWorkingChangesDescription", "Controls whether to automatically store available working changes in the cloud for the current workspace. This setting has no effect in the web.")
    },
    "workbench.cloudChanges.autoResume": {
      enum: ["onReload", "off"],
      enumDescriptions: [
        localize("autoResumeWorkingChanges.onReload", "Automatically resume available working changes from the cloud on window reload."),
        localize("autoResumeWorkingChanges.off", "Never attempt to resume working changes from the cloud.")
      ],
      "type": "string",
      "tags": ["usesOnlineServices"],
      "default": "onReload",
      "markdownDescription": localize("autoResumeWorkingChanges", "Controls whether to automatically resume available working changes stored in the cloud for the current workspace.")
    },
    "workbench.cloudChanges.continueOn": {
      enum: ["prompt", "off"],
      enumDescriptions: [
        localize("continueOnCloudChanges.promptForAuth", "Prompt the user to sign in to store working changes in the cloud with Continue Working On."),
        localize("continueOnCloudChanges.off", "Do not store working changes in the cloud with Continue Working On unless the user has already turned on Cloud Changes.")
      ],
      type: "string",
      tags: ["usesOnlineServices"],
      default: "prompt",
      markdownDescription: localize("continueOnCloudChanges", "Controls whether to prompt the user to store working changes in the cloud when using Continue Working On.")
    },
    "workbench.experimental.cloudChanges.partialMatches.enabled": {
      "type": "boolean",
      "tags": ["experimental", "usesOnlineServices"],
      "default": false,
      "markdownDescription": localize("cloudChangesPartialMatchesEnabled", "Controls whether to surface cloud changes which partially match the current session.")
    }
  }
});
export {
  EditSessionsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVkaXRTZXNzaW9uc1xcYnJvd3NlclxcZWRpdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlLCBTaHV0ZG93blJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucywgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UsIENoYW5nZSwgQ2hhbmdlVHlwZSwgRm9sZGVyLCBFZGl0U2Vzc2lvbiwgRmlsZVR5cGUsIEVESVRfU0VTU0lPTl9TWU5DX0NBVEVHT1JZLCBFRElUX1NFU1NJT05TX0NPTlRBSU5FUl9JRCwgRWRpdFNlc3Npb25TY2hlbWFWZXJzaW9uLCBJRWRpdFNlc3Npb25zTG9nU2VydmljZSwgRURJVF9TRVNTSU9OU19WSUVXX0lDT04sIEVESVRfU0VTU0lPTlNfVElUTEUsIEVESVRfU0VTU0lPTlNfU0hPV19WSUVXLCBFRElUX1NFU1NJT05TX0RBVEFfVklFV19JRCwgZGVjb2RlRWRpdFNlc3Npb25GaWxlQ29udGVudCwgaGFzaGVkRWRpdFNlc3Npb25JZCwgZWRpdFNlc3Npb25zTG9nSWQsIEVESVRfU0VTU0lPTlNfUEVORElORyB9IGZyb20gJy4uL2NvbW1vbi9lZGl0U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSVNDTVJlcG9zaXRvcnksIElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2NtL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGpvaW5QYXRoLCByZWxhdGl2ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZW5jb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTZXJ2aWNlLCBJUHJvZ3Jlc3NTdGVwLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IEVkaXRTZXNzaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuL2VkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jRXJyb3JDb2RlLCBVc2VyRGF0YVN5bmNTdG9yZUVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRGaWxlTmFtZXNNZXNzYWdlLCBJRGlhbG9nU2VydmljZSwgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEJ1dHRvbiwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGdldFZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVkaXRTZXNzaW9uc0xvZ1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZWRpdFNlc3Npb25zTG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBWaWV3RXh0ZW5zaW9ucywgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lQ29udGFpbmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdFNlc3Npb25zRGF0YVZpZXdzIH0gZnJvbSAnLi9lZGl0U2Vzc2lvbnNWaWV3cy5qcyc7XG5pbXBvcnQgeyBFZGl0U2Vzc2lvbnNGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuL2VkaXRTZXNzaW9uc0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBpc05hdGl2ZSwgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBWaXJ0dWFsV29ya3NwYWNlQ29udGV4dCwgV29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IEVkaXRTZXNzaW9uSWRlbnRpdHlNYXRjaCwgSUVkaXRTZXNzaW9uSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi9lZGl0U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIE51bWJlckJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlU3RhdGVTeW5jaHJvbmlzZXIgfSBmcm9tICcuLi9jb21tb24vd29ya3NwYWNlU3RhdGVTeW5jLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgRWRpdFNlc3Npb25zU3RvcmVDbGllbnQgfSBmcm9tICcuLi9jb21tb24vZWRpdFNlc3Npb25zU3RvcmFnZUNsaWVudC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VJZGVudGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzaEFzeW5jIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlLCBFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElFZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZSwgRWRpdFNlc3Npb25zV29ya2JlbmNoU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cblxuY29uc3QgY29udGludWVXb3JraW5nT25Db21tYW5kOiBJQWN0aW9uMk9wdGlvbnMgPSB7XG5cdGlkOiAnX3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5jb250aW51ZUVkaXRTZXNzaW9uJyxcblx0dGl0bGU6IGxvY2FsaXplMignY29udGludWUgd29ya2luZyBvbicsICdDb250aW51ZSBXb3JraW5nIE9uLi4uJyksXG5cdHByZWNvbmRpdGlvbjogV29ya3NwYWNlRm9sZGVyQ291bnRDb250ZXh0Lm5vdEVxdWFsc1RvKCcwJyksXG5cdGYxOiB0cnVlXG59O1xuY29uc3Qgb3BlbkxvY2FsRm9sZGVyQ29tbWFuZDogSUFjdGlvbjJPcHRpb25zID0ge1xuXHRpZDogJ193b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuY29udGludWVFZGl0U2Vzc2lvbi5vcGVuTG9jYWxGb2xkZXInLFxuXHR0aXRsZTogbG9jYWxpemUyKCdjb250aW51ZSBlZGl0IHNlc3Npb24gaW4gbG9jYWwgZm9sZGVyJywgJ09wZW4gSW4gTG9jYWwgRm9sZGVyJyksXG5cdGNhdGVnb3J5OiBFRElUX1NFU1NJT05fU1lOQ19DQVRFR09SWSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoSXNXZWJDb250ZXh0LnRvTmVnYXRlZCgpLCBWaXJ0dWFsV29ya3NwYWNlQ29udGV4dClcbn07XG5jb25zdCBzaG93T3V0cHV0Q2hhbm5lbENvbW1hbmQ6IElBY3Rpb24yT3B0aW9ucyA9IHtcblx0aWQ6ICd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuc2hvd091dHB1dENoYW5uZWwnLFxuXHR0aXRsZTogbG9jYWxpemUyKCdzaG93IGxvZycsIFwiU2hvdyBMb2dcIiksXG5cdGNhdGVnb3J5OiBFRElUX1NFU1NJT05fU1lOQ19DQVRFR09SWVxufTtcbmNvbnN0IGluc3RhbGxBZGRpdGlvbmFsQ29udGludWVPbk9wdGlvbnNDb21tYW5kID0ge1xuXHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY29udGludWVPbi5leHRlbnNpb25zJyxcblx0dGl0bGU6IGxvY2FsaXplKCdjb250aW51ZU9uLmluc3RhbGxBZGRpdGlvbmFsJywgJ0luc3RhbGwgYWRkaXRpb25hbCBkZXZlbG9wbWVudCBlbnZpcm9ubWVudCBvcHRpb25zJyksXG59O1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHsgLi4uaW5zdGFsbEFkZGl0aW9uYWxDb250aW51ZU9uT3B0aW9uc0NvbW1hbmQsIGYxOiBmYWxzZSB9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5vcGVuU2VhcmNoKCdAdGFnOmNvbnRpbnVlT24nKTtcblx0fVxufSk7XG5cbmNvbnN0IHJlc3VtZVByb2dyZXNzT3B0aW9uc1RpdGxlID0gYFske2xvY2FsaXplKCdyZXN1bWluZyB3b3JraW5nIGNoYW5nZXMgd2luZG93JywgJ1Jlc3VtaW5nIHdvcmtpbmcgY2hhbmdlcy4uLicpfV0oY29tbWFuZDoke3Nob3dPdXRwdXRDaGFubmVsQ29tbWFuZC5pZH0pYDtcbmNvbnN0IHJlc3VtZVByb2dyZXNzT3B0aW9ucyA9IHtcblx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LFxuXHR0eXBlOiAnc3luY2luZycsXG59O1xuY29uc3QgcXVlcnlQYXJhbU5hbWUgPSAnZWRpdFNlc3Npb25JZCc7XG5cbmNvbnN0IHVzZUVkaXRTZXNzaW9uc1dpdGhDb250aW51ZU9uID0gJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuY29udGludWVPbic7XG5leHBvcnQgY2xhc3MgRWRpdFNlc3Npb25zQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgY29udGludWVFZGl0U2Vzc2lvbk9wdGlvbnM6IENvbnRpbnVlRWRpdFNlc3Npb25JdGVtW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNob3VsZFNob3dWaWV3c0NvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHBlbmRpbmdFZGl0U2Vzc2lvbnNDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHN0YXRpYyBBUFBMSUNBVElPTl9MQVVOQ0hFRF9WSUFfQ09OVElOVUVfT05fU1RPUkFHRV9LRVkgPSAnYXBwbGljYXRpb25MYXVuY2hlZFZpYUNvbnRpbnVlT24nO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjY291bnRzTWVudUJhZGdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHJlZ2lzdGVyZWRDb21tYW5kcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgd29ya3NwYWNlU3RhdGVTeW5jaHJvbml6ZXI6IFdvcmtzcGFjZVN0YXRlU3luY2hyb25pc2VyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVkaXRTZXNzaW9uc1N0b3JhZ2VDbGllbnQ6IEVkaXRTZXNzaW9uc1N0b3JlQ2xpZW50IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZTogSUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRWRpdFNlc3Npb25zTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRWRpdFNlc3Npb25JZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0U2Vzc2lvbklkZW50aXR5U2VydmljZTogSUVkaXRTZXNzaW9uSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlSWRlbnRpdHlTZXJ2aWNlOiBJV29ya3NwYWNlSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zaG91bGRTaG93Vmlld3NDb250ZXh0ID0gRURJVF9TRVNTSU9OU19TSE9XX1ZJRVcuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucGVuZGluZ0VkaXRTZXNzaW9uc0NvbnRleHQgPSBFRElUX1NFU1NJT05TX1BFTkRJTkcuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucGVuZGluZ0VkaXRTZXNzaW9uc0NvbnRleHQuc2V0KGZhbHNlKTtcblxuXHRcdGlmICghdGhpcy5wcm9kdWN0U2VydmljZVsnZWRpdFNlc3Npb25zLnN0b3JlJ10/LnVybCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZUNsaWVudCA9IG5ldyBFZGl0U2Vzc2lvbnNTdG9yZUNsaWVudChVUkkucGFyc2UodGhpcy5wcm9kdWN0U2VydmljZVsnZWRpdFNlc3Npb25zLnN0b3JlJ10udXJsKSwgdGhpcy5wcm9kdWN0U2VydmljZSwgdGhpcy5yZXF1ZXN0U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5zdG9yZUNsaWVudCA9IHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZUNsaWVudDtcblx0XHR0aGlzLndvcmtzcGFjZVN0YXRlU3luY2hyb25pemVyID0gbmV3IFdvcmtzcGFjZVN0YXRlU3luY2hyb25pc2VyKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUsIHVuZGVmaW5lZCwgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlQ2xpZW50LCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLndvcmtzcGFjZUlkZW50aXR5U2VydmljZSwgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZSk7XG5cblx0XHR0aGlzLmF1dG9SZXN1bWVFZGl0U2Vzc2lvbigpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckFjdGlvbnMoKTtcblx0XHR0aGlzLnJlZ2lzdGVyVmlld3MoKTtcblx0XHR0aGlzLnJlZ2lzdGVyQ29udHJpYnV0ZWRFZGl0U2Vzc2lvbk9wdGlvbnMoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihFZGl0U2Vzc2lvbnNGaWxlU3lzdGVtUHJvdmlkZXIuU0NIRU1BLCBuZXcgRWRpdFNlc3Npb25zRmlsZVN5c3RlbVByb3ZpZGVyKHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5yZWFzb24gIT09IFNodXRkb3duUmVhc29uLlJFTE9BRCAmJiB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmlzU2lnbmVkSW4gJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd29ya2JlbmNoLmV4cGVyaW1lbnRhbC5jbG91ZENoYW5nZXMuYXV0b1N0b3JlJykgPT09ICdvblNodXRkb3duJyAmJiAhaXNXZWIpIHtcblx0XHRcdFx0ZS5qb2luKHRoaXMuYXV0b1N0b3JlRWRpdFNlc3Npb24oKSwgeyBpZDogJ2F1dG9TdG9yZVdvcmtpbmdDaGFuZ2VzJywgbGFiZWw6IGxvY2FsaXplKCdhdXRvU3RvcmVXb3JraW5nQ2hhbmdlcycsICdTdG9yaW5nIGN1cnJlbnQgd29ya2luZyBjaGFuZ2VzLi4uJykgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2Uub25EaWRTaWduSW4oKCkgPT4gdGhpcy51cGRhdGVBY2NvdW50c01lbnVCYWRnZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5vbkRpZFNpZ25PdXQoKCkgPT4gdGhpcy51cGRhdGVBY2NvdW50c01lbnVCYWRnZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGF1dG9SZXN1bWVFZGl0U2Vzc2lvbigpIHtcblx0XHRjb25zdCBzaG91bGRBdXRvUmVzdW1lT25SZWxvYWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guY2xvdWRDaGFuZ2VzLmF1dG9SZXN1bWUnKSA9PT0gJ29uUmVsb2FkJztcblxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5lZGl0U2Vzc2lvbklkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBSZXN1bWluZyBjbG91ZCBjaGFuZ2VzLCByZWFzb246IGZvdW5kIGVkaXRTZXNzaW9uSWQgJHt0aGlzLmVudmlyb25tZW50U2VydmljZS5lZGl0U2Vzc2lvbklkfSBpbiBlbnZpcm9ubWVudCBzZXJ2aWNlLi4uYCk7XG5cdFx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MocmVzdW1lUHJvZ3Jlc3NPcHRpb25zLCBhc3luYyAocHJvZ3Jlc3MpID0+IGF3YWl0IHRoaXMucmVzdW1lRWRpdFNlc3Npb24odGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZWRpdFNlc3Npb25JZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgcHJvZ3Jlc3MpLmZpbmFsbHkoKCkgPT4gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZWRpdFNlc3Npb25JZCA9IHVuZGVmaW5lZCkpO1xuXHRcdH0gZWxzZSBpZiAoc2hvdWxkQXV0b1Jlc3VtZU9uUmVsb2FkICYmIHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UuaXNTaWduZWRJbikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1Jlc3VtaW5nIGNsb3VkIGNoYW5nZXMsIHJlYXNvbjogY2xvdWQgY2hhbmdlcyBlbmFibGVkLi4uJyk7XG5cdFx0XHQvLyBBdHRlbXB0IHRvIHJlc3VtZSBlZGl0IHNlc3Npb24gYmFzZWQgb24gZWRpdCB3b3Jrc3BhY2UgaWRlbnRpZmllclxuXHRcdFx0Ly8gTm90ZTogYXQgdGhpcyBwb2ludCBpZiB0aGUgdXNlciBpcyBub3Qgc2lnbmVkIGludG8gZWRpdCBzZXNzaW9ucyxcblx0XHRcdC8vIHdlIGRvbid0IHdhbnQgdGhlbSB0byBiZSBwcm9tcHRlZCB0byBzaWduIGluIGFuZCBzaG91bGQganVzdCByZXR1cm4gZWFybHlcblx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhyZXN1bWVQcm9ncmVzc09wdGlvbnMsIGFzeW5jIChwcm9ncmVzcykgPT4gYXdhaXQgdGhpcy5yZXN1bWVFZGl0U2Vzc2lvbih1bmRlZmluZWQsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBwcm9ncmVzcykpO1xuXHRcdH0gZWxzZSBpZiAoc2hvdWxkQXV0b1Jlc3VtZU9uUmVsb2FkKSB7XG5cdFx0XHQvLyBUaGUgYXBwbGljYXRpb24gaGFzIHByZXZpb3VzbHkgbGF1bmNoZWQgdmlhIGEgcHJvdG9jb2wgVVJMIENvbnRpbnVlIE9uIGZsb3dcblx0XHRcdGNvbnN0IGhhc0FwcGxpY2F0aW9uTGF1bmNoZWRGcm9tQ29udGludWVPbkZsb3cgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oRWRpdFNlc3Npb25zQ29udHJpYnV0aW9uLkFQUExJQ0FUSU9OX0xBVU5DSEVEX1ZJQV9DT05USU5VRV9PTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgUHJvbXB0aW5nIHRvIGVuYWJsZSBjbG91ZCBjaGFuZ2VzLCBoYXMgYXBwbGljYXRpb24gcHJldmlvdXNseSBsYXVuY2hlZCBmcm9tIENvbnRpbnVlIE9uIGZsb3c6ICR7aGFzQXBwbGljYXRpb25MYXVuY2hlZEZyb21Db250aW51ZU9uRmxvd31gKTtcblxuXHRcdFx0Y29uc3QgaGFuZGxlUGVuZGluZ0VkaXRTZXNzaW9ucyA9ICgpID0+IHtcblx0XHRcdFx0Ly8gZGlzcGxheSBhIGJhZGdlIGluIHRoZSBhY2NvdW50cyBtZW51IGJ1dCBkbyBub3QgcHJvbXB0IHRoZSB1c2VyIHRvIHNpZ24gaW4gYWdhaW5cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1Nob3dpbmcgYmFkZ2UgdG8gZW5hYmxlIGNsb3VkIGNoYW5nZXMgaW4gYWNjb3VudHMgbWVudS4uLicpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFjY291bnRzTWVudUJhZGdlKCk7XG5cdFx0XHRcdHRoaXMucGVuZGluZ0VkaXRTZXNzaW9uc0NvbnRleHQuc2V0KHRydWUpO1xuXHRcdFx0XHQvLyBhdHRlbXB0IGEgcmVzdW1lIGlmIHdlIGFyZSBpbiBhIHBlbmRpbmcgc3RhdGUgYW5kIHRoZSB1c2VyIGp1c3Qgc2lnbmVkIGluXG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLm9uRGlkU2lnbkluKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU2hvd2luZyBiYWRnZSB0byBlbmFibGUgY2xvdWQgY2hhbmdlcyBpbiBhY2NvdW50cyBtZW51IHN1Y2NlZWRlZCwgcmVzdW1pbmcgY2xvdWQgY2hhbmdlcy4uLicpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhyZXN1bWVQcm9ncmVzc09wdGlvbnMsIGFzeW5jIChwcm9ncmVzcykgPT4gYXdhaXQgdGhpcy5yZXN1bWVFZGl0U2Vzc2lvbih1bmRlZmluZWQsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBwcm9ncmVzcykpO1xuXHRcdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEVkaXRTZXNzaW9uc0NvbnRyaWJ1dGlvbi5BUFBMSUNBVElPTl9MQVVOQ0hFRF9WSUFfQ09OVElOVUVfT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuY29udGludWVPbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmNvbnRpbnVlT24gIT09IHVuZGVmaW5lZCkgJiZcblx0XHRcdFx0IXRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UuaXNTaWduZWRJbiAmJlxuXHRcdFx0XHQvLyBhbmQgdXNlciBoYXMgbm90IHlldCBiZWVuIHByb21wdGVkIHRvIHNpZ24gaW4gb24gdGhpcyBtYWNoaW5lXG5cdFx0XHRcdGhhc0FwcGxpY2F0aW9uTGF1bmNoZWRGcm9tQ29udGludWVPbkZsb3cgPT09IGZhbHNlXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gc3RvcmUgdGhlIGZhY3QgdGhhdCB3ZSBwcm9tcHRlZCB0aGUgdXNlclxuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEVkaXRTZXNzaW9uc0NvbnRyaWJ1dGlvbi5BUFBMSUNBVElPTl9MQVVOQ0hFRF9WSUFfQ09OVElOVUVfT05fU1RPUkFHRV9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1Byb21wdGluZyB0byBlbmFibGUgY2xvdWQgY2hhbmdlcy4uLicpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmluaXRpYWxpemUoJ3JlYWQnKTtcblx0XHRcdFx0aWYgKHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UuaXNTaWduZWRJbikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdQcm9tcHRpbmcgdG8gZW5hYmxlIGNsb3VkIGNoYW5nZXMgc3VjY2VlZGVkLCByZXN1bWluZyBjbG91ZCBjaGFuZ2VzLi4uJyk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHJlc3VtZVByb2dyZXNzT3B0aW9ucywgYXN5bmMgKHByb2dyZXNzKSA9PiBhd2FpdCB0aGlzLnJlc3VtZUVkaXRTZXNzaW9uKHVuZGVmaW5lZCwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHByb2dyZXNzKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aGFuZGxlUGVuZGluZ0VkaXRTZXNzaW9ucygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKCF0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmlzU2lnbmVkSW4gJiZcblx0XHRcdFx0Ly8gYW5kIHVzZXIgaGFzIGJlZW4gcHJvbXB0ZWQgdG8gc2lnbiBpbiBvbiB0aGlzIG1hY2hpbmVcblx0XHRcdFx0aGFzQXBwbGljYXRpb25MYXVuY2hlZEZyb21Db250aW51ZU9uRmxvdyA9PT0gdHJ1ZVxuXHRcdFx0KSB7XG5cdFx0XHRcdGhhbmRsZVBlbmRpbmdFZGl0U2Vzc2lvbnMoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdBdXRvIHJlc3VtaW5nIGNsb3VkIGNoYW5nZXMgZGlzYWJsZWQuJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY2NvdW50c01lbnVCYWRnZSgpIHtcblx0XHRpZiAodGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5pc1NpZ25lZEluKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hY2NvdW50c01lbnVCYWRnZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRjb25zdCBiYWRnZSA9IG5ldyBOdW1iZXJCYWRnZSgxLCAoKSA9PiBsb2NhbGl6ZSgnY2hlY2sgZm9yIHBlbmRpbmcgY2xvdWQgY2hhbmdlcycsICdDaGVjayBmb3IgcGVuZGluZyBjbG91ZCBjaGFuZ2VzJykpO1xuXHRcdHRoaXMuYWNjb3VudHNNZW51QmFkZ2VEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd0FjY291bnRzQWN0aXZpdHkoeyBiYWRnZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXV0b1N0b3JlRWRpdFNlc3Npb24oKSB7XG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93LFxuXHRcdFx0dHlwZTogJ3N5bmNpbmcnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzdG9yZSB3b3JraW5nIGNoYW5nZXMnLCAnU3RvcmluZyB3b3JraW5nIGNoYW5nZXMuLi4nKVxuXHRcdH0sIGFzeW5jICgpID0+IHRoaXMuc3RvcmVFZGl0U2Vzc2lvbihmYWxzZSwgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pLCAoKSA9PiB7XG5cdFx0XHRjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdGNhbmNlbGxhdGlvblRva2VuU291cmNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJWaWV3cygpIHtcblx0XHRjb25zdCBjb250YWluZXIgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0V4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogRURJVF9TRVNTSU9OU19DT05UQUlORVJfSUQsXG5cdFx0XHRcdHRpdGxlOiBFRElUX1NFU1NJT05TX1RJVExFLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKFxuXHRcdFx0XHRcdFZpZXdQYW5lQ29udGFpbmVyLFxuXHRcdFx0XHRcdFtFRElUX1NFU1NJT05TX0NPTlRBSU5FUl9JRCwgeyBtZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXc6IHRydWUgfV1cblx0XHRcdFx0KSxcblx0XHRcdFx0aWNvbjogRURJVF9TRVNTSU9OU19WSUVXX0lDT04sXG5cdFx0XHRcdGhpZGVJZkVtcHR5OiB0cnVlXG5cdFx0XHR9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgeyBkb05vdFJlZ2lzdGVyT3BlbkNvbW1hbmQ6IHRydWUgfVxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0U2Vzc2lvbnNEYXRhVmlld3MsIGNvbnRhaW5lcikpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKSB7XG5cdFx0dGhpcy5yZWdpc3RlckNvbnRpbnVlRWRpdFNlc3Npb25BY3Rpb24oKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJSZXN1bWVMYXRlc3RFZGl0U2Vzc2lvbkFjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJTdG9yZUxhdGVzdEVkaXRTZXNzaW9uQWN0aW9uKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyQ29udGludWVJbkxvY2FsRm9sZGVyQWN0aW9uKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyU2hvd0VkaXRTZXNzaW9uVmlld0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJTaG93RWRpdFNlc3Npb25PdXRwdXRDaGFubmVsQWN0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2hvd0VkaXRTZXNzaW9uT3V0cHV0Q2hhbm5lbEFjdGlvbigpIHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd0VkaXRTZXNzaW9uT3V0cHV0IGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoc2hvd091dHB1dENoYW5uZWxDb21tYW5kKTtcblx0XHRcdH1cblxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0Q2hhbm5lbCA9IGFjY2Vzc29yLmdldChJT3V0cHV0U2VydmljZSk7XG5cdFx0XHRcdHZvaWQgb3V0cHV0Q2hhbm5lbC5zaG93Q2hhbm5lbChlZGl0U2Vzc2lvbnNMb2dJZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNob3dFZGl0U2Vzc2lvblZpZXdBY3Rpb24oKSB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNob3dFZGl0U2Vzc2lvblZpZXcgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuc2hvd0VkaXRTZXNzaW9ucycsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvdyBjbG91ZCBjaGFuZ2VzJywgJ1Nob3cgQ2xvdWQgQ2hhbmdlcycpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBFRElUX1NFU1NJT05fU1lOQ19DQVRFR09SWSxcblx0XHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRcdHRoYXQuc2hvdWxkU2hvd1ZpZXdzQ29udGV4dC5zZXQodHJ1ZSk7XG5cdFx0XHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRcdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KEVESVRfU0VTU0lPTlNfREFUQV9WSUVXX0lEKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29udGludWVFZGl0U2Vzc2lvbkFjdGlvbigpIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29udGludWVFZGl0U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKGNvbnRpbnVlV29ya2luZ09uQ29tbWFuZCk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd29ya3NwYWNlVXJpOiBVUkkgfCB1bmRlZmluZWQsIGRlc3RpbmF0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dHlwZSBDb250aW51ZU9uRXZlbnRPdXRjb21lID0geyBvdXRjb21lOiBzdHJpbmc7IGhhc2hlZElkPzogc3RyaW5nIH07XG5cdFx0XHRcdHR5cGUgQ29udGludWVPbkNsYXNzaWZpY2F0aW9uT3V0Y29tZSA9IHtcblx0XHRcdFx0XHRvd25lcjogJ2pveWNlZXJobCc7IGNvbW1lbnQ6ICdSZXBvcnRpbmcgdGhlIG91dGNvbWUgb2YgaW52b2tpbmcgdGhlIENvbnRpbnVlIE9uIGFjdGlvbi4nO1xuXHRcdFx0XHRcdG91dGNvbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgb3V0Y29tZSBvZiBpbnZva2luZyBjb250aW51ZSBlZGl0IHNlc3Npb24uJyB9O1xuXHRcdFx0XHRcdGhhc2hlZElkPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBoYXNoIG9mIHRoZSBzdG9yZWQgZWRpdCBzZXNzaW9uIGlkLCBmb3IgY29ycmVsYXRpbmcgc3VjY2VzcyBvZiBzdG9yZXMgYW5kIHJlc3VtZXMuJyB9O1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdC8vIEZpcnN0IGFzayB0aGUgdXNlciB0byBwaWNrIGEgZGVzdGluYXRpb24sIGlmIG5lY2Vzc2FyeVxuXHRcdFx0XHRsZXQgdXJpOiBVUkkgfCAnbm9EZXN0aW5hdGlvblVyaScgfCB1bmRlZmluZWQgPSB3b3Jrc3BhY2VVcmk7XG5cdFx0XHRcdGlmICghZGVzdGluYXRpb24gJiYgIXVyaSkge1xuXHRcdFx0XHRcdGRlc3RpbmF0aW9uID0gYXdhaXQgdGhhdC5waWNrQ29udGludWVFZGl0U2Vzc2lvbkRlc3RpbmF0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKCFkZXN0aW5hdGlvbikge1xuXHRcdFx0XHRcdFx0dGhhdC50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q29udGludWVPbkV2ZW50T3V0Y29tZSwgQ29udGludWVPbkNsYXNzaWZpY2F0aW9uT3V0Y29tZT4oJ2NvbnRpbnVlT24uZWRpdFNlc3Npb25zLnBpY2sub3V0Y29tZScsIHsgb3V0Y29tZTogJ25vU2VsZWN0aW9uJyB9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEZXRlcm1pbmUgaWYgd2UgbmVlZCB0byBzdG9yZSBhbiBlZGl0IHNlc3Npb24sIGFza2luZyBmb3IgZWRpdCBzZXNzaW9uIGF1dGggaWYgbmVjZXNzYXJ5XG5cdFx0XHRcdGNvbnN0IHNob3VsZFN0b3JlRWRpdFNlc3Npb24gPSBhd2FpdCB0aGF0LnNob3VsZENvbnRpbnVlT25XaXRoRWRpdFNlc3Npb24oKTtcblxuXHRcdFx0XHQvLyBSdW4gdGhlIHN0b3JlIGFjdGlvbiB0byBnZXQgYmFjayBhIHJlZlxuXHRcdFx0XHRsZXQgcmVmOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChzaG91bGRTdG9yZUVkaXRTZXNzaW9uKSB7XG5cdFx0XHRcdFx0dHlwZSBDb250aW51ZVdpdGhFZGl0U2Vzc2lvbkV2ZW50ID0ge307XG5cdFx0XHRcdFx0dHlwZSBDb250aW51ZVdpdGhFZGl0U2Vzc2lvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdFx0b3duZXI6ICdqb3ljZWVyaGwnOyBjb21tZW50OiAnUmVwb3J0aW5nIHdoZW4gc3RvcmluZyBhbiBlZGl0IHNlc3Npb24gYXMgcGFydCBvZiB0aGUgQ29udGludWUgT24gZmxvdy4nO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dGhhdC50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q29udGludWVXaXRoRWRpdFNlc3Npb25FdmVudCwgQ29udGludWVXaXRoRWRpdFNlc3Npb25DbGFzc2lmaWNhdGlvbj4oJ2NvbnRpbnVlT24uZWRpdFNlc3Npb25zLnN0b3JlJyk7XG5cblx0XHRcdFx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRyZWYgPSBhd2FpdCB0aGF0LnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0XHRcdGNhbmNlbGxhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3luY2luZycsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3RvcmUgeW91ciB3b3JraW5nIGNoYW5nZXMnLCAnU3RvcmluZyB5b3VyIHdvcmtpbmcgY2hhbmdlcy4uLicpXG5cdFx0XHRcdFx0XHR9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoYXQuc3RvcmVFZGl0U2Vzc2lvbihmYWxzZSwgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0XHRcdFx0XHRpZiAocmVmICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGF0LnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDb250aW51ZU9uRXZlbnRPdXRjb21lLCBDb250aW51ZU9uQ2xhc3NpZmljYXRpb25PdXRjb21lPignY29udGludWVPbi5lZGl0U2Vzc2lvbnMuc3RvcmUub3V0Y29tZScsIHsgb3V0Y29tZTogJ3N0b3JlU3VjY2VlZGVkJywgaGFzaGVkSWQ6IGhhc2hlZEVkaXRTZXNzaW9uSWQocmVmKSB9KTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0aGF0LnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDb250aW51ZU9uRXZlbnRPdXRjb21lLCBDb250aW51ZU9uQ2xhc3NpZmljYXRpb25PdXRjb21lPignY29udGludWVPbi5lZGl0U2Vzc2lvbnMuc3RvcmUub3V0Y29tZScsIHsgb3V0Y29tZTogJ3N0b3JlU2tpcHBlZCcgfSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlZjtcblx0XHRcdFx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHRcdFx0XHRcdGNhbmNlbGxhdGlvblRva2VuU291cmNlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0dGhhdC50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q29udGludWVPbkV2ZW50T3V0Y29tZSwgQ29udGludWVPbkNsYXNzaWZpY2F0aW9uT3V0Y29tZT4oJ2NvbnRpbnVlT24uZWRpdFNlc3Npb25zLnN0b3JlLm91dGNvbWUnLCB7IG91dGNvbWU6ICdzdG9yZUNhbmNlbGxlZEJ5VXNlcicgfSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0XHRcdFx0dGhhdC50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q29udGludWVPbkV2ZW50T3V0Y29tZSwgQ29udGludWVPbkNsYXNzaWZpY2F0aW9uT3V0Y29tZT4oJ2NvbnRpbnVlT24uZWRpdFNlc3Npb25zLnN0b3JlLm91dGNvbWUnLCB7IG91dGNvbWU6ICdzdG9yZUZhaWxlZCcgfSk7XG5cdFx0XHRcdFx0XHR0aHJvdyBleDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBcHBlbmQgdGhlIHJlZiB0byB0aGUgVVJJXG5cdFx0XHRcdHVyaSA9IGRlc3RpbmF0aW9uID8gYXdhaXQgdGhhdC5yZXNvbHZlRGVzdGluYXRpb24oZGVzdGluYXRpb24pIDogdXJpO1xuXHRcdFx0XHRpZiAodXJpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocmVmICE9PSB1bmRlZmluZWQgJiYgdXJpICE9PSAnbm9EZXN0aW5hdGlvblVyaScpIHtcblx0XHRcdFx0XHRjb25zdCBlbmNvZGVkUmVmID0gZW5jb2RlVVJJQ29tcG9uZW50KHJlZik7XG5cdFx0XHRcdFx0dXJpID0gdXJpLndpdGgoe1xuXHRcdFx0XHRcdFx0cXVlcnk6IHVyaS5xdWVyeS5sZW5ndGggPiAwID8gKHVyaS5xdWVyeSArIGAmJHtxdWVyeVBhcmFtTmFtZX09JHtlbmNvZGVkUmVmfSZjb250aW51ZU9uPTFgKSA6IGAke3F1ZXJ5UGFyYW1OYW1lfT0ke2VuY29kZWRSZWZ9JmNvbnRpbnVlT249MWBcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdC8vIE9wZW4gdGhlIFVSSVxuXHRcdFx0XHRcdHRoYXQubG9nU2VydmljZS5pbmZvKGBPcGVuaW5nICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhhdC5vcGVuZXJTZXJ2aWNlLm9wZW4odXJpLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmICgoIXNob3VsZFN0b3JlRWRpdFNlc3Npb24gfHwgcmVmID09PSB1bmRlZmluZWQpICYmIHVyaSAhPT0gJ25vRGVzdGluYXRpb25VcmknKSB7XG5cdFx0XHRcdFx0Ly8gT3BlbiB0aGUgVVJJIHdpdGhvdXQgYW4gZWRpdCBzZXNzaW9uIHJlZlxuXHRcdFx0XHRcdHRoYXQubG9nU2VydmljZS5pbmZvKGBPcGVuaW5nICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhhdC5vcGVuZXJTZXJ2aWNlLm9wZW4odXJpLCB7IG9wZW5FeHRlcm5hbDogdHJ1ZSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChyZWYgPT09IHVuZGVmaW5lZCAmJiBzaG91bGRTdG9yZUVkaXRTZXNzaW9uKSB7XG5cdFx0XHRcdFx0dGhhdC5sb2dTZXJ2aWNlLndhcm4oYEZhaWxlZCB0byBzdG9yZSB3b3JraW5nIGNoYW5nZXMgd2hlbiBpbnZva2luZyAke2NvbnRpbnVlV29ya2luZ09uQ29tbWFuZC5pZH0uYCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyUmVzdW1lTGF0ZXN0RWRpdFNlc3Npb25BY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc3VtZUxhdGVzdEVkaXRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLnJlc3VtZUxhdGVzdCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVzdW1lIGxhdGVzdCBjbG91ZCBjaGFuZ2VzJywgJ1Jlc3VtZSBMYXRlc3QgQ2hhbmdlcyBmcm9tIENsb3VkJyksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IEVESVRfU0VTU0lPTl9TWU5DX0NBVEVHT1JZLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0U2Vzc2lvbklkPzogc3RyaW5nLCBmb3JjZUFwcGx5VW5yZWxhdGVkQ2hhbmdlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRhd2FpdCB0aGF0LnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyAuLi5yZXN1bWVQcm9ncmVzc09wdGlvbnMsIHRpdGxlOiByZXN1bWVQcm9ncmVzc09wdGlvbnNUaXRsZSB9LCBhc3luYyAoKSA9PiBhd2FpdCB0aGF0LnJlc3VtZUVkaXRTZXNzaW9uKGVkaXRTZXNzaW9uSWQsIHVuZGVmaW5lZCwgZm9yY2VBcHBseVVucmVsYXRlZENoYW5nZSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVzdW1lTGF0ZXN0RWRpdFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMucmVzdW1lRnJvbVNlcmlhbGl6ZWRQYXlsb2FkJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXN1bWUgY2xvdWQgY2hhbmdlcycsICdSZXN1bWUgQ2hhbmdlcyBmcm9tIFNlcmlhbGl6ZWQgRGF0YScpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiAnRGV2ZWxvcGVyJyxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdFNlc3Npb25JZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgdGhhdC5xdWlja0lucHV0U2VydmljZS5pbnB1dCh7IHByb21wdDogJ0VudGVyIHNlcmlhbGl6ZWQgZGF0YScgfSk7XG5cdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0dGhhdC5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5sYXN0UmVhZFJlc291cmNlcy5zZXQoJ2VkaXRTZXNzaW9ucycsIHsgY29udGVudDogZGF0YSwgcmVmOiAnJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aGF0LnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyAuLi5yZXN1bWVQcm9ncmVzc09wdGlvbnMsIHRpdGxlOiByZXN1bWVQcm9ncmVzc09wdGlvbnNUaXRsZSB9LCBhc3luYyAoKSA9PiBhd2FpdCB0aGF0LnJlc3VtZUVkaXRTZXNzaW9uKGVkaXRTZXNzaW9uSWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZGF0YSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTdG9yZUxhdGVzdEVkaXRTZXNzaW9uQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTdG9yZUxhdGVzdEVkaXRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLnN0b3JlQ3VycmVudCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3RvcmUgd29ya2luZyBjaGFuZ2VzIGluIGNsb3VkJywgJ1N0b3JlIFdvcmtpbmcgQ2hhbmdlcyBpbiBDbG91ZCcpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBFRElUX1NFU1NJT05fU1lOQ19DQVRFR09SWSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHRhd2FpdCB0aGF0LnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3N0b3Jpbmcgd29ya2luZyBjaGFuZ2VzJywgJ1N0b3Jpbmcgd29ya2luZyBjaGFuZ2VzLi4uJylcblx0XHRcdFx0fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHR5cGUgU3RvcmVFdmVudCA9IHt9O1xuXHRcdFx0XHRcdHR5cGUgU3RvcmVDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdG93bmVyOiAnam95Y2VlcmhsJzsgY29tbWVudDogJ1JlcG9ydGluZyB3aGVuIHRoZSBzdG9yZSBlZGl0IHNlc3Npb24gYWN0aW9uIGlzIGludm9rZWQuJztcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoYXQudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFN0b3JlRXZlbnQsIFN0b3JlQ2xhc3NpZmljYXRpb24+KCdlZGl0U2Vzc2lvbnMuc3RvcmUnKTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoYXQuc3RvcmVFZGl0U2Vzc2lvbih0cnVlLCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbik7XG5cdFx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0XHRjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdFx0XHRjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHJlc3VtZUVkaXRTZXNzaW9uKHJlZj86IHN0cmluZywgc2lsZW50PzogYm9vbGVhbiwgZm9yY2VBcHBseVVucmVsYXRlZENoYW5nZT86IGJvb2xlYW4sIGFwcGx5UGFydGlhbE1hdGNoPzogYm9vbGVhbiwgcHJvZ3Jlc3M/OiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIHNlcmlhbGl6ZWREYXRhPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gV2FpdCBmb3IgdGhlIHJlbW90ZSBlbnZpcm9ubWVudCB0byBiZWNvbWUgYXZhaWxhYmxlLCBpZiBhbnlcblx0XHRhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXG5cdFx0Ly8gRWRpdCBzZXNzaW9ucyBhcmUgbm90IGN1cnJlbnRseSBzdXBwb3J0ZWQgaW4gZW1wdHkgd29ya3NwYWNlc1xuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNTkyMjBcblx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKHJlZiAhPT0gdW5kZWZpbmVkID8gYFJlc3VtaW5nIGNoYW5nZXMgZnJvbSBjbG91ZCB3aXRoIHJlZiAke3JlZn0uLi5gIDogJ0NoZWNraW5nIGZvciBwZW5kaW5nIGNsb3VkIGNoYW5nZXMuLi4nKTtcblxuXHRcdGlmIChzaWxlbnQgJiYgIShhd2FpdCB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmluaXRpYWxpemUoJ3JlYWQnLCB0cnVlKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0eXBlIFJlc3VtZUV2ZW50ID0geyBvdXRjb21lOiBzdHJpbmc7IGhhc2hlZElkPzogc3RyaW5nIH07XG5cdFx0dHlwZSBSZXN1bWVDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnam95Y2VlcmhsJzsgY29tbWVudDogJ1JlcG9ydGluZyB3aGVuIGFuIGVkaXQgc2Vzc2lvbiBpcyByZXN1bWVkIGZyb20gYW4gZWRpdCBzZXNzaW9uIGlkZW50aWZpZXIuJztcblx0XHRcdG91dGNvbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgb3V0Y29tZSBvZiByZXN1bWluZyB0aGUgZWRpdCBzZXNzaW9uLicgfTtcblx0XHRcdGhhc2hlZElkPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBoYXNoIG9mIHRoZSBzdG9yZWQgZWRpdCBzZXNzaW9uIGlkLCBmb3IgY29ycmVsYXRpbmcgc3VjY2VzcyBvZiBzdG9yZXMgYW5kIHJlc3VtZXMuJyB9O1xuXHRcdH07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmVzdW1lRXZlbnQsIFJlc3VtZUNsYXNzaWZpY2F0aW9uPignZWRpdFNlc3Npb25zLnJlc3VtZScpO1xuXG5cdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS93aWxsUmVzdW1lRWRpdFNlc3Npb25Gcm9tSWRlbnRpZmllcicpO1xuXG5cdFx0cHJvZ3Jlc3M/LnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdjaGVja2luZ0ZvcldvcmtpbmdDaGFuZ2VzJywgJ0NoZWNraW5nIGZvciBwZW5kaW5nIGNsb3VkIGNoYW5nZXMuLi4nKSB9KTtcblx0XHRjb25zdCBkYXRhID0gc2VyaWFsaXplZERhdGEgPyB7IGNvbnRlbnQ6IHNlcmlhbGl6ZWREYXRhLCByZWY6ICcnIH0gOiBhd2FpdCB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLnJlYWQoJ2VkaXRTZXNzaW9ucycsIHJlZik7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRpZiAocmVmID09PSB1bmRlZmluZWQgJiYgIXNpbGVudCkge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnbm8gY2xvdWQgY2hhbmdlcycsICdUaGVyZSBhcmUgbm8gY2hhbmdlcyB0byByZXN1bWUgZnJvbSB0aGUgY2xvdWQuJykpO1xuXHRcdFx0fSBlbHNlIGlmIChyZWYgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnbm8gY2xvdWQgY2hhbmdlcyBmb3IgcmVmJywgJ0NvdWxkIG5vdCByZXN1bWUgY2hhbmdlcyBmcm9tIHRoZSBjbG91ZCBmb3IgSUQgezB9LicsIHJlZikpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8ocmVmICE9PSB1bmRlZmluZWQgPyBgQWJvcnRpbmcgcmVzdW1pbmcgY2hhbmdlcyBmcm9tIGNsb3VkIGFzIG5vIGVkaXQgc2Vzc2lvbiBjb250ZW50IGlzIGF2YWlsYWJsZSB0byBiZSBhcHBsaWVkIGZyb20gcmVmICR7cmVmfS5gIDogYEFib3J0aW5nIHJlc3VtaW5nIGVkaXQgc2Vzc2lvbiBhcyBubyBlZGl0IHNlc3Npb24gY29udGVudCBpcyBhdmFpbGFibGUgdG8gYmUgYXBwbGllZGApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHByb2dyZXNzPy5yZXBvcnQoeyBtZXNzYWdlOiByZXN1bWVQcm9ncmVzc09wdGlvbnNUaXRsZSB9KTtcblx0XHRjb25zdCBlZGl0U2Vzc2lvbiA9IEpTT04ucGFyc2UoZGF0YS5jb250ZW50KTtcblx0XHRyZWYgPSBkYXRhLnJlZjtcblxuXHRcdGlmIChlZGl0U2Vzc2lvbi52ZXJzaW9uID4gRWRpdFNlc3Npb25TY2hlbWFWZXJzaW9uKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2NsaWVudCB0b28gb2xkJywgXCJQbGVhc2UgdXBncmFkZSB0byBhIG5ld2VyIHZlcnNpb24gb2YgezB9IHRvIHJlc3VtZSB5b3VyIHdvcmtpbmcgY2hhbmdlcyBmcm9tIHRoZSBjbG91ZC5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZykpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmVzdW1lRXZlbnQsIFJlc3VtZUNsYXNzaWZpY2F0aW9uPignZWRpdFNlc3Npb25zLnJlc3VtZS5vdXRjb21lJywgeyBoYXNoZWRJZDogaGFzaGVkRWRpdFNlc3Npb25JZChyZWYpLCBvdXRjb21lOiAnY2xpZW50VXBkYXRlTmVlZGVkJyB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBjaGFuZ2VzLCBjb25mbGljdGluZ0NoYW5nZXMgfSA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVDaGFuZ2VzKGVkaXRTZXNzaW9uLCByZWYsIGZvcmNlQXBwbHlVbnJlbGF0ZWRDaGFuZ2UsIGFwcGx5UGFydGlhbE1hdGNoKTtcblx0XHRcdGlmIChjaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRPRE9Aam95Y2VlcmhsIFByb3ZpZGUgdGhlIG9wdGlvbiB0byBkaWZmIGZpbGVzIHdoaWNoIHdvdWxkIGJlIG92ZXJ3cml0dGVuIGJ5IGVkaXQgc2Vzc2lvbiBjb250ZW50c1xuXHRcdFx0aWYgKGNvbmZsaWN0aW5nQ2hhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdC8vIEFsbG93IHRvIHNob3cgZWRpdCBzZXNzaW9uc1xuXG5cdFx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRtZXNzYWdlOiBjb25mbGljdGluZ0NoYW5nZXMubGVuZ3RoID4gMSA/XG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgncmVzdW1lIGVkaXQgc2Vzc2lvbiB3YXJuaW5nIG1hbnknLCAnUmVzdW1pbmcgeW91ciB3b3JraW5nIGNoYW5nZXMgZnJvbSB0aGUgY2xvdWQgd2lsbCBvdmVyd3JpdGUgdGhlIGZvbGxvd2luZyB7MH0gZmlsZXMuIERvIHlvdSB3YW50IHRvIHByb2NlZWQ/JywgY29uZmxpY3RpbmdDaGFuZ2VzLmxlbmd0aCkgOlxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Jlc3VtZSBlZGl0IHNlc3Npb24gd2FybmluZyAxJywgJ1Jlc3VtaW5nIHlvdXIgd29ya2luZyBjaGFuZ2VzIGZyb20gdGhlIGNsb3VkIHdpbGwgb3ZlcndyaXRlIHswfS4gRG8geW91IHdhbnQgdG8gcHJvY2VlZD8nLCBiYXNlbmFtZShjb25mbGljdGluZ0NoYW5nZXNbMF0udXJpKSksXG5cdFx0XHRcdFx0ZGV0YWlsOiBjb25mbGljdGluZ0NoYW5nZXMubGVuZ3RoID4gMSA/IGdldEZpbGVOYW1lc01lc3NhZ2UoY29uZmxpY3RpbmdDaGFuZ2VzLm1hcCgoYykgPT4gYy51cmkpKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHsgdXJpLCB0eXBlLCBjb250ZW50cyB9IG9mIGNoYW5nZXMpIHtcblx0XHRcdFx0aWYgKHR5cGUgPT09IENoYW5nZVR5cGUuQWRkaXRpb24pIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh1cmksIGRlY29kZUVkaXRTZXNzaW9uRmlsZUNvbnRlbnQoZWRpdFNlc3Npb24udmVyc2lvbiwgY29udGVudHMhKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZSA9PT0gQ2hhbmdlVHlwZS5EZWxldGlvbiAmJiBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVN0YXRlU3luY2hyb25pemVyPy5hcHBseSgpO1xuXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgRGVsZXRpbmcgZWRpdCBzZXNzaW9uIHdpdGggcmVmICR7cmVmfSBhZnRlciBzdWNjZXNzZnVsbHkgYXBwbHlpbmcgaXQgdG8gY3VycmVudCB3b3Jrc3BhY2UuLi5gKTtcblx0XHRcdGF3YWl0IHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UuZGVsZXRlKCdlZGl0U2Vzc2lvbnMnLCByZWYpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYERlbGV0ZWQgZWRpdCBzZXNzaW9uIHdpdGggcmVmICR7cmVmfS5gKTtcblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmVzdW1lRXZlbnQsIFJlc3VtZUNsYXNzaWZpY2F0aW9uPignZWRpdFNlc3Npb25zLnJlc3VtZS5vdXRjb21lJywgeyBoYXNoZWRJZDogaGFzaGVkRWRpdFNlc3Npb25JZChyZWYpLCBvdXRjb21lOiAncmVzdW1lU3VjY2VlZGVkJyB9KTtcblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gcmVzdW1lIGVkaXQgc2Vzc2lvbiwgcmVhc29uOiAnLCAoZXggYXMgRXJyb3IpLnRvU3RyaW5nKCkpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdyZXN1bWUgZmFpbGVkJywgXCJGYWlsZWQgdG8gcmVzdW1lIHlvdXIgd29ya2luZyBjaGFuZ2VzIGZyb20gdGhlIGNsb3VkLlwiKSk7XG5cdFx0fVxuXG5cdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9kaWRSZXN1bWVFZGl0U2Vzc2lvbkZyb21JZGVudGlmaWVyJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdlbmVyYXRlQ2hhbmdlcyhlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24sIHJlZjogc3RyaW5nLCBmb3JjZUFwcGx5VW5yZWxhdGVkQ2hhbmdlID0gZmFsc2UsIGFwcGx5UGFydGlhbE1hdGNoID0gZmFsc2UpIHtcblx0XHRjb25zdCBjaGFuZ2VzOiAoeyB1cmk6IFVSSTsgdHlwZTogQ2hhbmdlVHlwZTsgY29udGVudHM6IHN0cmluZyB8IHVuZGVmaW5lZCB9KVtdID0gW107XG5cdFx0Y29uc3QgY29uZmxpY3RpbmdDaGFuZ2VzID0gW107XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgZWRpdFNlc3Npb24uZm9sZGVycykge1xuXHRcdFx0bGV0IGZvbGRlclJvb3Q6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChmb2xkZXIuY2Fub25pY2FsSWRlbnRpdHkpIHtcblx0XHRcdFx0Ly8gTG9vayBmb3IgYW4gZWRpdCBzZXNzaW9uIGlkZW50aWZpZXIgdGhhdCB3ZSBjYW4gdXNlXG5cdFx0XHRcdGZvciAoY29uc3QgZiBvZiB3b3Jrc3BhY2VGb2xkZXJzKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWRlbnRpdHkgPSBhd2FpdCB0aGlzLmVkaXRTZXNzaW9uSWRlbnRpdHlTZXJ2aWNlLmdldEVkaXRTZXNzaW9uSWRlbnRpZmllcihmLCBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbik7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYE1hdGNoaW5nIGlkZW50aXR5ICR7aWRlbnRpdHl9IGFnYWluc3QgZWRpdCBzZXNzaW9uIGZvbGRlciBpZGVudGl0eSAke2ZvbGRlci5jYW5vbmljYWxJZGVudGl0eX0uLi5gKTtcblxuXHRcdFx0XHRcdGlmIChlcXVhbHMoaWRlbnRpdHksIGZvbGRlci5jYW5vbmljYWxJZGVudGl0eSkgfHwgZm9yY2VBcHBseVVucmVsYXRlZENoYW5nZSkge1xuXHRcdFx0XHRcdFx0Zm9sZGVyUm9vdCA9IGY7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoaWRlbnRpdHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSBhd2FpdCB0aGlzLmVkaXRTZXNzaW9uSWRlbnRpdHlTZXJ2aWNlLnByb3ZpZGVFZGl0U2Vzc2lvbklkZW50aXR5TWF0Y2goZiwgaWRlbnRpdHksIGZvbGRlci5jYW5vbmljYWxJZGVudGl0eSwgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0XHRcdFx0aWYgKG1hdGNoID09PSBFZGl0U2Vzc2lvbklkZW50aXR5TWF0Y2guQ29tcGxldGUpIHtcblx0XHRcdFx0XHRcdFx0Zm9sZGVyUm9vdCA9IGY7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChtYXRjaCA9PT0gRWRpdFNlc3Npb25JZGVudGl0eU1hdGNoLlBhcnRpYWwgJiZcblx0XHRcdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd29ya2JlbmNoLmV4cGVyaW1lbnRhbC5jbG91ZENoYW5nZXMucGFydGlhbE1hdGNoZXMuZW5hYmxlZCcpID09PSB0cnVlXG5cdFx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdFx0aWYgKCFhcHBseVBhcnRpYWxNYXRjaCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFN1cmZhY2UgcGFydGlhbGx5IG1hdGNoaW5nIGVkaXQgc2Vzc2lvblxuXHRcdFx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0XHRcdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2VkaXRTZXNzaW9uUGFydGlhbE1hdGNoJywgJ1lvdSBoYXZlIHBlbmRpbmcgd29ya2luZyBjaGFuZ2VzIGluIHRoZSBjbG91ZCBmb3IgdGhpcyB3b3Jrc3BhY2UuIFdvdWxkIHlvdSBsaWtlIHRvIHJlc3VtZSB0aGVtPycpLFxuXHRcdFx0XHRcdFx0XHRcdFx0W3sgbGFiZWw6IGxvY2FsaXplKCdyZXN1bWUnLCAnUmVzdW1lJyksIHJ1bjogKCkgPT4gdGhpcy5yZXN1bWVFZGl0U2Vzc2lvbihyZWYsIGZhbHNlLCB1bmRlZmluZWQsIHRydWUpIH1dXG5cdFx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRmb2xkZXJSb290ID0gZjtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9sZGVyUm9vdCA9IHdvcmtzcGFjZUZvbGRlcnMuZmluZCgoZikgPT4gZi5uYW1lID09PSBmb2xkZXIubmFtZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZm9sZGVyUm9vdCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2tpcHBpbmcgYXBwbHlpbmcgJHtmb2xkZXIud29ya2luZ0NoYW5nZXMubGVuZ3RofSBjaGFuZ2VzIGZyb20gZWRpdCBzZXNzaW9uIHdpdGggcmVmICR7cmVmfSBhcyBubyBtYXRjaGluZyB3b3Jrc3BhY2UgZm9sZGVyIHdhcyBmb3VuZC5gKTtcblx0XHRcdFx0cmV0dXJuIHsgY2hhbmdlczogW10sIGNvbmZsaWN0aW5nQ2hhbmdlczogW10sIGNvbnRyaWJ1dGVkU3RhdGVIYW5kbGVyczogW10gfTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbG9jYWxDaGFuZ2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21TZXJ2aWNlLnJlcG9zaXRvcmllcykge1xuXHRcdFx0XHRpZiAocmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0XHR0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkpPy5uYW1lID09PSBmb2xkZXIubmFtZVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRjb25zdCByZXBvc2l0b3J5Q2hhbmdlcyA9IHRoaXMuZ2V0Q2hhbmdlZFJlc291cmNlcyhyZXBvc2l0b3J5KTtcblx0XHRcdFx0XHRyZXBvc2l0b3J5Q2hhbmdlcy5mb3JFYWNoKChjaGFuZ2UpID0+IGxvY2FsQ2hhbmdlcy5hZGQoY2hhbmdlLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBmb2xkZXIud29ya2luZ0NoYW5nZXMpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gam9pblBhdGgoZm9sZGVyUm9vdC51cmksIGNoYW5nZS5yZWxhdGl2ZUZpbGVQYXRoKTtcblx0XHRcdFx0aWYgKCF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgZm9sZGVyUm9vdC51cmkpIHx8IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHVyaSwgZm9sZGVyUm9vdC51cmkpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFNraXBwaW5nIGNoYW5nZSBvdXRzaWRlIHdvcmtzcGFjZSBmb2xkZXI6ICR7Y2hhbmdlLnJlbGF0aXZlRmlsZVBhdGh9YCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjaGFuZ2VzLnB1c2goeyB1cmksIHR5cGU6IGNoYW5nZS50eXBlLCBjb250ZW50czogY2hhbmdlLmNvbnRlbnRzIH0pO1xuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy53aWxsQ2hhbmdlTG9jYWxDb250ZW50cyhsb2NhbENoYW5nZXMsIHVyaSwgY2hhbmdlKSkge1xuXHRcdFx0XHRcdGNvbmZsaWN0aW5nQ2hhbmdlcy5wdXNoKHsgdXJpLCB0eXBlOiBjaGFuZ2UudHlwZSwgY29udGVudHM6IGNoYW5nZS5jb250ZW50cyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGNoYW5nZXMsIGNvbmZsaWN0aW5nQ2hhbmdlcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3aWxsQ2hhbmdlTG9jYWxDb250ZW50cyhsb2NhbENoYW5nZXM6IFNldDxzdHJpbmc+LCB1cmlXaXRoSW5jb21pbmdDaGFuZ2VzOiBVUkksIGluY29taW5nQ2hhbmdlOiBDaGFuZ2UpIHtcblx0XHRpZiAoIWxvY2FsQ2hhbmdlcy5oYXModXJpV2l0aEluY29taW5nQ2hhbmdlcy50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgY29udGVudHMsIHR5cGUgfSA9IGluY29taW5nQ2hhbmdlO1xuXG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIChDaGFuZ2VUeXBlLkFkZGl0aW9uKToge1xuXHRcdFx0XHRjb25zdCBbb3JpZ2luYWxDb250ZW50cywgaW5jb21pbmdDb250ZW50c10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0aGFzaEFzeW5jKGNvbnRlbnRzKSxcblx0XHRcdFx0XHRoYXNoQXN5bmMoZW5jb2RlQmFzZTY0KChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaVdpdGhJbmNvbWluZ0NoYW5nZXMpKS52YWx1ZSkpXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxDb250ZW50cyAhPT0gaW5jb21pbmdDb250ZW50cztcblx0XHRcdH1cblx0XHRcdGNhc2UgKENoYW5nZVR5cGUuRGVsZXRpb24pOiB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh1cmlXaXRoSW5jb21pbmdDaGFuZ2VzKTtcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5oYW5kbGVkIGNoYW5nZSB0eXBlLicpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN0b3JlRWRpdFNlc3Npb24oZnJvbVN0b3JlQ29tbWFuZDogYm9vbGVhbiwgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBmb2xkZXJzOiBGb2xkZXJbXSA9IFtdO1xuXHRcdGxldCBlZGl0U2Vzc2lvblNpemUgPSAwO1xuXHRcdGxldCBoYXNFZGl0cyA9IGZhbHNlO1xuXG5cdFx0Ly8gU2F2ZSBhbGwgc2F2ZWFibGUgZWRpdG9ycyBiZWZvcmUgYnVpbGRpbmcgZWRpdCBzZXNzaW9uIGNvbnRlbnRzXG5cdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLnNhdmVBbGwoKTtcblxuXHRcdC8vIERvIGEgZmlyc3QgcGFzcyBvdmVyIGFsbCByZXBvc2l0b3JpZXMgdG8gZW5zdXJlIHRoYXQgdGhlIGVkaXQgc2Vzc2lvbiBpZGVudGl0eSBpcyBjcmVhdGVkIGZvciBlYWNoLlxuXHRcdC8vIFRoaXMgbWF5IGNoYW5nZSB0aGUgd29ya2luZyBjaGFuZ2VzIHRoYXQgbmVlZCB0byBiZSBzdG9yZWQgbGF0ZXJcblx0XHRjb25zdCBjcmVhdGVkRWRpdFNlc3Npb25JZGVudGl0aWVzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdGNvbnN0IGNoYW5nZWRSZXNvdXJjZXMgPSB0aGlzLmdldENoYW5nZWRSZXNvdXJjZXMocmVwb3NpdG9yeSk7XG5cdFx0XHRpZiAoIWNoYW5nZWRSZXNvdXJjZXMuc2l6ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgdXJpIG9mIGNoYW5nZWRSZXNvdXJjZXMpIHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIodXJpKTtcblx0XHRcdFx0aWYgKCF3b3Jrc3BhY2VGb2xkZXIgfHwgY3JlYXRlZEVkaXRTZXNzaW9uSWRlbnRpdGllcy5oYXModXJpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNyZWF0ZWRFZGl0U2Vzc2lvbklkZW50aXRpZXMuYWRkKHVyaSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdFNlc3Npb25JZGVudGl0eVNlcnZpY2Uub25XaWxsQ3JlYXRlRWRpdFNlc3Npb25JZGVudGl0eSh3b3Jrc3BhY2VGb2xkZXIsIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21TZXJ2aWNlLnJlcG9zaXRvcmllcykge1xuXHRcdFx0Ly8gTG9vayB0aHJvdWdoIGFsbCByZXNvdXJjZSBncm91cHMgYW5kIGNvbXB1dGUgd2hpY2ggZmlsZXMgd2VyZSBhZGRlZC9tb2RpZmllZC9kZWxldGVkXG5cdFx0XHRjb25zdCB0cmFja2VkVXJpcyA9IHRoaXMuZ2V0Q2hhbmdlZFJlc291cmNlcyhyZXBvc2l0b3J5KTsgLy8gQSBVUkkgbWlnaHQgYXBwZWFyIGluIG1vcmUgdGhhbiBvbmUgcmVzb3VyY2UgZ3JvdXBcblxuXHRcdFx0Y29uc3Qgd29ya2luZ0NoYW5nZXM6IENoYW5nZVtdID0gW107XG5cblx0XHRcdGNvbnN0IHsgcm9vdFVyaSB9ID0gcmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHJvb3RVcmkgPyB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyb290VXJpKSA6IHVuZGVmaW5lZDtcblx0XHRcdGxldCBuYW1lID0gd29ya3NwYWNlRm9sZGVyPy5uYW1lO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0cmFja2VkVXJpcykge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcih1cmkpO1xuXHRcdFx0XHRpZiAoIXdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTa2lwcGluZyB3b3JraW5nIGNoYW5nZSAke3VyaS50b1N0cmluZygpfSBhcyBubyBhc3NvY2lhdGVkIHdvcmtzcGFjZSBmb2xkZXIgd2FzIGZvdW5kLmApO1xuXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRuYW1lID0gbmFtZSA/PyB3b3Jrc3BhY2VGb2xkZXIubmFtZTtcblx0XHRcdFx0Y29uc3QgcmVsYXRpdmVGaWxlUGF0aCA9IHJlbGF0aXZlUGF0aCh3b3Jrc3BhY2VGb2xkZXIudXJpLCB1cmkpID8/IHVyaS5wYXRoO1xuXG5cdFx0XHRcdC8vIE9ubHkgZGVhbCB3aXRoIGZpbGUgY29udGVudHMgZm9yIG5vd1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmICghKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uuc3RhdCh1cmkpKS5pc0ZpbGUpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCB7IH1cblxuXHRcdFx0XHRoYXNFZGl0cyA9IHRydWU7XG5cblxuXHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHModXJpKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnRzID0gZW5jb2RlQmFzZTY0KChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSkpLnZhbHVlKTtcblx0XHRcdFx0XHRlZGl0U2Vzc2lvblNpemUgKz0gY29udGVudHMubGVuZ3RoO1xuXHRcdFx0XHRcdGlmIChlZGl0U2Vzc2lvblNpemUgPiB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLlNJWkVfTElNSVQpIHtcblx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgncGF5bG9hZCB0b28gbGFyZ2UnLCAnWW91ciB3b3JraW5nIGNoYW5nZXMgZXhjZWVkIHRoZSBzaXplIGxpbWl0IGFuZCBjYW5ub3QgYmUgc3RvcmVkLicpKTtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0d29ya2luZ0NoYW5nZXMucHVzaCh7IHR5cGU6IENoYW5nZVR5cGUuQWRkaXRpb24sIGZpbGVUeXBlOiBGaWxlVHlwZS5GaWxlLCBjb250ZW50czogY29udGVudHMsIHJlbGF0aXZlRmlsZVBhdGg6IHJlbGF0aXZlRmlsZVBhdGggfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gQXNzdW1lIGl0J3MgYSBkZWxldGlvblxuXHRcdFx0XHRcdHdvcmtpbmdDaGFuZ2VzLnB1c2goeyB0eXBlOiBDaGFuZ2VUeXBlLkRlbGV0aW9uLCBmaWxlVHlwZTogRmlsZVR5cGUuRmlsZSwgY29udGVudHM6IHVuZGVmaW5lZCwgcmVsYXRpdmVGaWxlUGF0aDogcmVsYXRpdmVGaWxlUGF0aCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY2Fub25pY2FsSWRlbnRpdHkgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAod29ya3NwYWNlRm9sZGVyICE9PSBudWxsICYmIHdvcmtzcGFjZUZvbGRlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNhbm9uaWNhbElkZW50aXR5ID0gYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbklkZW50aXR5U2VydmljZS5nZXRFZGl0U2Vzc2lvbklkZW50aWZpZXIod29ya3NwYWNlRm9sZGVyLCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRPRE9Aam95Y2VlcmhsIGRlYnQ6IGRvbid0IHN0b3JlIHdvcmtpbmcgY2hhbmdlcyBhcyBhIGNoaWxkIG9mIHRoZSBmb2xkZXJcblx0XHRcdGZvbGRlcnMucHVzaCh7IHdvcmtpbmdDaGFuZ2VzLCBuYW1lOiBuYW1lID8/ICcnLCBjYW5vbmljYWxJZGVudGl0eTogY2Fub25pY2FsSWRlbnRpdHkgPz8gdW5kZWZpbmVkLCBhYnNvbHV0ZVVyaTogd29ya3NwYWNlRm9sZGVyPy51cmkudG9TdHJpbmcoKSB9KTtcblx0XHR9XG5cblx0XHQvLyBTdG9yZSBjb250cmlidXRlZCB3b3Jrc3BhY2Ugc3RhdGVcblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVN0YXRlU3luY2hyb25pemVyPy5zeW5jKCk7XG5cblx0XHRpZiAoIWhhc0VkaXRzKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnU2tpcHBlZCBzdG9yaW5nIHdvcmtpbmcgY2hhbmdlcyBpbiB0aGUgY2xvdWQgYXMgdGhlcmUgYXJlIG5vIGVkaXRzIHRvIHN0b3JlLicpO1xuXHRcdFx0aWYgKGZyb21TdG9yZUNvbW1hbmQpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ25vIHdvcmtpbmcgY2hhbmdlcyB0byBzdG9yZScsICdTa2lwcGVkIHN0b3Jpbmcgd29ya2luZyBjaGFuZ2VzIGluIHRoZSBjbG91ZCBhcyB0aGVyZSBhcmUgbm8gZWRpdHMgdG8gc3RvcmUuJykpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhOiBFZGl0U2Vzc2lvbiA9IHsgZm9sZGVycywgdmVyc2lvbjogMiwgd29ya3NwYWNlU3RhdGVJZDogdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5sYXN0V3JpdHRlblJlc291cmNlcy5nZXQoJ3dvcmtzcGFjZVN0YXRlJyk/LnJlZiB9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTdG9yaW5nIGVkaXQgc2Vzc2lvbi4uLmApO1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS53cml0ZSgnZWRpdFNlc3Npb25zJywgZGF0YSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU3RvcmVkIGVkaXQgc2Vzc2lvbiB3aXRoIHJlZiAke3JlZn0uYCk7XG5cdFx0XHRyZXR1cm4gcmVmO1xuXHRcdH0gY2F0Y2ggKGV4KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBzdG9yZSBlZGl0IHNlc3Npb24sIHJlYXNvbjogYCwgKGV4IGFzIEVycm9yKS50b1N0cmluZygpKTtcblxuXHRcdFx0dHlwZSBVcGxvYWRGYWlsZWRFdmVudCA9IHsgcmVhc29uOiBzdHJpbmcgfTtcblx0XHRcdHR5cGUgVXBsb2FkRmFpbGVkQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnam95Y2VlcmhsJzsgY29tbWVudDogJ1JlcG9ydGluZyB3aGVuIENvbnRpbnVlIE9uIHNlcnZlciByZXF1ZXN0IGZhaWxzLic7XG5cdFx0XHRcdHJlYXNvbj86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcmVhc29uIHRoYXQgdGhlIHNlcnZlciByZXF1ZXN0IGZhaWxlZC4nIH07XG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoZXggaW5zdGFuY2VvZiBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKSB7XG5cdFx0XHRcdHN3aXRjaCAoZXguY29kZSkge1xuXHRcdFx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlRvb0xhcmdlOlxuXHRcdFx0XHRcdFx0Ly8gVXBsb2FkaW5nIGEgcGF5bG9hZCBjYW4gZmFpbCBkdWUgdG8gc2VydmVyIHNpemUgbGltaXRzXG5cdFx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxVcGxvYWRGYWlsZWRFdmVudCwgVXBsb2FkRmFpbGVkQ2xhc3NpZmljYXRpb24+KCdlZGl0U2Vzc2lvbnMudXBsb2FkLmZhaWxlZCcsIHsgcmVhc29uOiAnVG9vTGFyZ2UnIH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdwYXlsb2FkIHRvbyBsYXJnZScsICdZb3VyIHdvcmtpbmcgY2hhbmdlcyBleGNlZWQgdGhlIHNpemUgbGltaXQgYW5kIGNhbm5vdCBiZSBzdG9yZWQuJykpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFVwbG9hZEZhaWxlZEV2ZW50LCBVcGxvYWRGYWlsZWRDbGFzc2lmaWNhdGlvbj4oJ2VkaXRTZXNzaW9ucy51cGxvYWQuZmFpbGVkJywgeyByZWFzb246ICd1bmtub3duJyB9KTtcblx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgncGF5bG9hZCBmYWlsZWQnLCAnWW91ciB3b3JraW5nIGNoYW5nZXMgY2Fubm90IGJlIHN0b3JlZC4nKSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldENoYW5nZWRSZXNvdXJjZXMocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpIHtcblx0XHRyZXR1cm4gcmVwb3NpdG9yeS5wcm92aWRlci5ncm91cHMucmVkdWNlKChyZXNvdXJjZXMsIHJlc291cmNlR3JvdXBzKSA9PiB7XG5cdFx0XHRyZXNvdXJjZUdyb3Vwcy5yZXNvdXJjZXMuZm9yRWFjaCgocmVzb3VyY2UpID0+IHJlc291cmNlcy5hZGQocmVzb3VyY2Uuc291cmNlVXJpKSk7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VzO1xuXHRcdH0sIG5ldyBTZXQ8VVJJPigpKTsgLy8gQSBVUkkgbWlnaHQgYXBwZWFyIGluIG1vcmUgdGhhbiBvbmUgcmVzb3VyY2UgZ3JvdXBcblx0fVxuXG5cdHByaXZhdGUgaGFzRWRpdFNlc3Npb24oKSB7XG5cdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdGlmICh0aGlzLmdldENoYW5nZWRSZXNvdXJjZXMocmVwb3NpdG9yeSkuc2l6ZSA+IDApIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvdWxkQ29udGludWVPbldpdGhFZGl0U2Vzc2lvbigpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0eXBlIEVkaXRTZXNzaW9uc0F1dGhDaGVja0V2ZW50ID0geyBvdXRjb21lOiBzdHJpbmcgfTtcblx0XHR0eXBlIEVkaXRTZXNzaW9uc0F1dGhDaGVja0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdqb3ljZWVyaGwnOyBjb21tZW50OiAnUmVwb3J0aW5nIHdoZXRoZXIgd2UgY2FuIGFuZCBzaG91bGQgc3RvcmUgZWRpdCBzZXNzaW9uIGFzIHBhcnQgb2YgQ29udGludWUgT24uJztcblx0XHRcdG91dGNvbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgb3V0Y29tZSBvZiBjaGVja2luZyB3aGV0aGVyIHdlIGNhbiBzdG9yZSBhbiBlZGl0IHNlc3Npb24gYXMgcGFydCBvZiB0aGUgQ29udGludWUgT24gZmxvdy4nIH07XG5cdFx0fTtcblxuXHRcdC8vIElmIHRoZSB1c2VyIGlzIGFscmVhZHkgc2lnbmVkIGluLCB3ZSBzaG91bGQgc3RvcmUgZWRpdCBzZXNzaW9uXG5cdFx0aWYgKHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UuaXNTaWduZWRJbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuaGFzRWRpdFNlc3Npb24oKTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgdXNlciBoYXMgYmVlbiBhc2tlZCBiZWZvcmUgYW5kIHNhaWQgbm8sIGRvbid0IHVzZSBlZGl0IHNlc3Npb25zXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodXNlRWRpdFNlc3Npb25zV2l0aENvbnRpbnVlT24pID09PSAnb2ZmJykge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RWRpdFNlc3Npb25zQXV0aENoZWNrRXZlbnQsIEVkaXRTZXNzaW9uc0F1dGhDaGVja0NsYXNzaWZpY2F0aW9uPignY29udGludWVPbi5lZGl0U2Vzc2lvbnMuY2FuU3RvcmUub3V0Y29tZScsIHsgb3V0Y29tZTogJ2Rpc2FibGVkRWRpdFNlc3Npb25zVmlhU2V0dGluZycgfSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvbXB0IHRoZSB1c2VyIHRvIHVzZSBlZGl0IHNlc3Npb25zIGlmIHRoZXkgY3VycmVudGx5IGNvdWxkIGJlbmVmaXQgZnJvbSB1c2luZyBpdFxuXHRcdGlmICh0aGlzLmhhc0VkaXRTZXNzaW9uKCkpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcXVpY2twaWNrID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPigpKTtcblx0XHRcdHF1aWNrcGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdjb250aW51ZSB3aXRoIGNsb3VkIGNoYW5nZXMnLCBcIlNlbGVjdCB3aGV0aGVyIHRvIGJyaW5nIHlvdXIgd29ya2luZyBjaGFuZ2VzIHdpdGggeW91XCIpO1xuXHRcdFx0cXVpY2twaWNrLm9rID0gZmFsc2U7XG5cdFx0XHRxdWlja3BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0Y29uc3Qgd2l0aENsb3VkQ2hhbmdlcyA9IHsgbGFiZWw6IGxvY2FsaXplKCd3aXRoIGNsb3VkIGNoYW5nZXMnLCBcIlllcywgY29udGludWUgd2l0aCBteSB3b3JraW5nIGNoYW5nZXNcIikgfTtcblx0XHRcdGNvbnN0IHdpdGhvdXRDbG91ZENoYW5nZXMgPSB7IGxhYmVsOiBsb2NhbGl6ZSgnd2l0aG91dCBjbG91ZCBjaGFuZ2VzJywgXCJObywgY29udGludWUgd2l0aG91dCBteSB3b3JraW5nIGNoYW5nZXNcIikgfTtcblx0XHRcdHF1aWNrcGljay5pdGVtcyA9IFt3aXRoQ2xvdWRDaGFuZ2VzLCB3aXRob3V0Q2xvdWRDaGFuZ2VzXTtcblxuXHRcdFx0Y29uc3QgY29udGludWVXaXRoQ2xvdWRDaGFuZ2VzID0gYXdhaXQgbmV3IFByb21pc2U8Ym9vbGVhbj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlKHF1aWNrcGljay5zZWxlY3RlZEl0ZW1zWzBdID09PSB3aXRoQ2xvdWRDaGFuZ2VzKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRcdHJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHF1aWNrcGljay5zaG93KCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFjb250aW51ZVdpdGhDbG91ZENoYW5nZXMpIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RWRpdFNlc3Npb25zQXV0aENoZWNrRXZlbnQsIEVkaXRTZXNzaW9uc0F1dGhDaGVja0NsYXNzaWZpY2F0aW9uPignY29udGludWVPbi5lZGl0U2Vzc2lvbnMuY2FuU3RvcmUub3V0Y29tZScsIHsgb3V0Y29tZTogJ2RpZE5vdEVuYWJsZUVkaXRTZXNzaW9uc1doZW5Qcm9tcHRlZCcgfSk7XG5cdFx0XHRcdHJldHVybiBjb250aW51ZVdpdGhDbG91ZENoYW5nZXM7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluaXRpYWxpemVkID0gYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5pbml0aWFsaXplKCd3cml0ZScpO1xuXHRcdFx0aWYgKCFpbml0aWFsaXplZCkge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFZGl0U2Vzc2lvbnNBdXRoQ2hlY2tFdmVudCwgRWRpdFNlc3Npb25zQXV0aENoZWNrQ2xhc3NpZmljYXRpb24+KCdjb250aW51ZU9uLmVkaXRTZXNzaW9ucy5jYW5TdG9yZS5vdXRjb21lJywgeyBvdXRjb21lOiAnZGlkTm90RW5hYmxlRWRpdFNlc3Npb25zV2hlblByb21wdGVkJyB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbml0aWFsaXplZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyNyZWdpb24gQ29udGludWUgRWRpdCBTZXNzaW9uIGV4dGVuc2lvbiBjb250cmlidXRpb24gcG9pbnRcblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29udHJpYnV0ZWRFZGl0U2Vzc2lvbk9wdGlvbnMoKSB7XG5cdFx0Y29udGludWVFZGl0U2Vzc2lvbkV4dFBvaW50LnNldEhhbmRsZXIoZXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRjb25zdCBjb250aW51ZUVkaXRTZXNzaW9uT3B0aW9uczogQ29udGludWVFZGl0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2NvbnRyaWJFZGl0U2Vzc2lvbnMnKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShleHRlbnNpb24udmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgZXh0ZW5zaW9uLnZhbHVlKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kKGNvbnRyaWJ1dGlvbi5jb21tYW5kKTtcblx0XHRcdFx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBpY29uID0gY29tbWFuZC5pY29uO1xuXHRcdFx0XHRcdGNvbnN0IHRpdGxlID0gdHlwZW9mIGNvbW1hbmQudGl0bGUgPT09ICdzdHJpbmcnID8gY29tbWFuZC50aXRsZSA6IGNvbW1hbmQudGl0bGUudmFsdWU7XG5cdFx0XHRcdFx0Y29uc3Qgd2hlbiA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGNvbnRyaWJ1dGlvbi53aGVuKTtcblxuXHRcdFx0XHRcdGNvbnRpbnVlRWRpdFNlc3Npb25PcHRpb25zLnB1c2gobmV3IENvbnRpbnVlRWRpdFNlc3Npb25JdGVtKFxuXHRcdFx0XHRcdFx0VGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pID8gYCQoJHtpY29uLmlkfSkgJHt0aXRsZX1gIDogdGl0bGUsXG5cdFx0XHRcdFx0XHRjb21tYW5kLmlkLFxuXHRcdFx0XHRcdFx0Y29tbWFuZC5zb3VyY2U/LnRpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRcdGNvbnRyaWJ1dGlvbi5kb2N1bWVudGF0aW9uXG5cdFx0XHRcdFx0KSk7XG5cblx0XHRcdFx0XHRpZiAoY29udHJpYnV0aW9uLnF1YWxpZmllZE5hbWUpIHtcblx0XHRcdFx0XHRcdHRoaXMuZ2VuZXJhdGVTdGFuZGFsb25lT3B0aW9uQ29tbWFuZChjb21tYW5kLmlkLCBjb250cmlidXRpb24ucXVhbGlmaWVkTmFtZSwgY29udHJpYnV0aW9uLmNhdGVnb3J5ID8/IGNvbW1hbmQuY2F0ZWdvcnksIHdoZW4sIGNvbnRyaWJ1dGlvbi5yZW1vdGVHcm91cCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbnRpbnVlRWRpdFNlc3Npb25PcHRpb25zID0gY29udGludWVFZGl0U2Vzc2lvbk9wdGlvbnM7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlU3RhbmRhbG9uZU9wdGlvbkNvbW1hbmQoY29tbWFuZElkOiBzdHJpbmcsIHF1YWxpZmllZE5hbWU6IHN0cmluZywgY2F0ZWdvcnk6IHN0cmluZyB8IElMb2NhbGl6ZWRTdHJpbmcgfCB1bmRlZmluZWQsIHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCByZW1vdGVHcm91cDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgY29tbWFuZDogSUFjdGlvbjJPcHRpb25zID0ge1xuXHRcdFx0aWQ6IGAke2NvbnRpbnVlV29ya2luZ09uQ29tbWFuZC5pZH0uJHtjb21tYW5kSWR9YCxcblx0XHRcdHRpdGxlOiB7IG9yaWdpbmFsOiBxdWFsaWZpZWROYW1lLCB2YWx1ZTogcXVhbGlmaWVkTmFtZSB9LFxuXHRcdFx0Y2F0ZWdvcnk6IHR5cGVvZiBjYXRlZ29yeSA9PT0gJ3N0cmluZycgPyB7IG9yaWdpbmFsOiBjYXRlZ29yeSwgdmFsdWU6IGNhdGVnb3J5IH0gOiBjYXRlZ29yeSxcblx0XHRcdHByZWNvbmRpdGlvbjogd2hlbixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fTtcblxuXHRcdGlmICghdGhpcy5yZWdpc3RlcmVkQ29tbWFuZHMuaGFzKGNvbW1hbmQuaWQpKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyZWRDb21tYW5kcy5hZGQoY29tbWFuZC5pZCk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTdGFuZGFsb25lQ29udGludWVPbk9wdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcihjb21tYW5kKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChjb250aW51ZVdvcmtpbmdPbkNvbW1hbmQuaWQsIHVuZGVmaW5lZCwgY29tbWFuZElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAocmVtb3RlR3JvdXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlN0YXR1c0JhclJlbW90ZUluZGljYXRvck1lbnUsIHtcblx0XHRcdFx0XHRncm91cDogcmVtb3RlR3JvdXAsXG5cdFx0XHRcdFx0Y29tbWFuZDogY29tbWFuZCxcblx0XHRcdFx0XHR3aGVuOiBjb21tYW5kLnByZWNvbmRpdGlvblxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ29udGludWVJbkxvY2FsRm9sZGVyQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb250aW51ZUluTG9jYWxGb2xkZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcihvcGVuTG9jYWxGb2xkZXJDb21tYW5kKTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgdGhhdC5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb250aW51ZUVkaXRTZXNzaW9uLm9wZW5Mb2NhbEZvbGRlci50aXRsZS52MicsICdTZWxlY3QgYSBsb2NhbCBmb2xkZXIgdG8gY29udGludWUgd29ya2luZyBpbicpLFxuXHRcdFx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0XHRcdFx0Y2FuU2VsZWN0TWFueTogZmFsc2UsXG5cdFx0XHRcdFx0Y2FuU2VsZWN0RmlsZXM6IGZhbHNlLFxuXHRcdFx0XHRcdGF2YWlsYWJsZUZpbGVTeXN0ZW1zOiBbU2NoZW1hcy5maWxlXVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gc2VsZWN0aW9uPy5sZW5ndGggIT09IDEgPyB1bmRlZmluZWQgOiBVUkkuZnJvbSh7XG5cdFx0XHRcdFx0c2NoZW1lOiB0aGF0LnByb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sLFxuXHRcdFx0XHRcdGF1dGhvcml0eTogU2NoZW1hcy5maWxlLFxuXHRcdFx0XHRcdHBhdGg6IHNlbGVjdGlvblswXS5wYXRoXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChnZXRWaXJ0dWFsV29ya3NwYWNlTG9jYXRpb24odGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSkgIT09IHVuZGVmaW5lZCAmJiBpc05hdGl2ZSkge1xuXHRcdFx0dGhpcy5nZW5lcmF0ZVN0YW5kYWxvbmVPcHRpb25Db21tYW5kKG9wZW5Mb2NhbEZvbGRlckNvbW1hbmQuaWQsIGxvY2FsaXplKCdjb250aW51ZVdvcmtpbmdPbi5leGlzdGluZ0xvY2FsRm9sZGVyJywgJ0NvbnRpbnVlIFdvcmtpbmcgaW4gRXhpc3RpbmcgTG9jYWwgRm9sZGVyJyksIHVuZGVmaW5lZCwgb3BlbkxvY2FsRm9sZGVyQ29tbWFuZC5wcmVjb25kaXRpb24sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwaWNrQ29udGludWVFZGl0U2Vzc2lvbkRlc3RpbmF0aW9uKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPENvbnRpbnVlRWRpdFNlc3Npb25JdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dCA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSXG5cdFx0XHQ/IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXS5uYW1lXG5cdFx0XHQ6IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoKGZvbGRlcikgPT4gZm9sZGVyLm5hbWUpLmpvaW4oJywgJyk7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2NvbnRpbnVlRWRpdFNlc3Npb25QaWNrLnRpdGxlLnYyJywgXCJTZWxlY3QgYSBkZXZlbG9wbWVudCBlbnZpcm9ubWVudCB0byBjb250aW51ZSB3b3JraW5nIG9uIHswfSBpblwiLCBgJyR7d29ya3NwYWNlQ29udGV4dH0nYCk7XG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gdGhpcy5jcmVhdGVQaWNrSXRlbXMoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucygoKSA9PiB7XG5cdFx0XHRxdWlja1BpY2suaXRlbXMgPSB0aGlzLmNyZWF0ZVBpY2tJdGVtcygpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNvbW1hbmQgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKGUpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gcXVpY2tQaWNrLmFjdGl2ZUl0ZW1zWzBdLmNvbW1hbmQ7XG5cblx0XHRcdFx0aWYgKHNlbGVjdGlvbiA9PT0gaW5zdGFsbEFkZGl0aW9uYWxDb250aW51ZU9uT3B0aW9uc0NvbW1hbmQuaWQpIHtcblx0XHRcdFx0XHR2b2lkIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoaW5zdGFsbEFkZGl0aW9uYWxDb250aW51ZU9uT3B0aW9uc0NvbW1hbmQuaWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmUoc2VsZWN0aW9uKTtcblx0XHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5pdGVtLmRvY3VtZW50YXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5pc1VyaShlLml0ZW0uZG9jdW1lbnRhdGlvbikgPyBVUkkucGFyc2UoZS5pdGVtLmRvY3VtZW50YXRpb24pIDogYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxVUkk+KGUuaXRlbS5kb2N1bWVudGF0aW9uKTtcblx0XHRcdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdFx0XHR2b2lkIHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHVyaSwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRxdWlja1BpY2suZGlzcG9zZSgpO1xuXG5cdFx0cmV0dXJuIGNvbW1hbmQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVEZXN0aW5hdGlvbihjb21tYW5kOiBzdHJpbmcpOiBQcm9taXNlPFVSSSB8ICdub0Rlc3RpbmF0aW9uVXJpJyB8IHVuZGVmaW5lZD4ge1xuXHRcdHR5cGUgRXZhbHVhdGVDb250aW51ZU9uRGVzdGluYXRpb25FdmVudCA9IHsgb3V0Y29tZTogc3RyaW5nOyBzZWxlY3Rpb246IHN0cmluZyB9O1xuXHRcdHR5cGUgRXZhbHVhdGVDb250aW51ZU9uRGVzdGluYXRpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnam95Y2VlcmhsJzsgY29tbWVudDogJ1JlcG9ydGluZyB0aGUgb3V0Y29tZSBvZiBldmFsdWF0aW5nIGEgc2VsZWN0ZWQgQ29udGludWUgT24gZGVzdGluYXRpb24gb3B0aW9uLic7XG5cdFx0XHRzZWxlY3Rpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc2VsZWN0ZWQgQ29udGludWUgT24gZGVzdGluYXRpb24gb3B0aW9uLicgfTtcblx0XHRcdG91dGNvbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgb3V0Y29tZSBvZiBldmFsdWF0aW5nIHRoZSBzZWxlY3RlZCBDb250aW51ZSBPbiBkZXN0aW5hdGlvbiBvcHRpb24uJyB9O1xuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdXJpID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kKTtcblxuXHRcdFx0Ly8gU29tZSBjb250aW51ZSBvbiBjb21tYW5kcyBkbyBub3QgcmV0dXJuIGEgVVJJXG5cdFx0XHQvLyB0byBzdXBwb3J0IGV4dGVuc2lvbnMgd2hpY2ggd2FudCB0byBiZSBpbiBjb250cm9sXG5cdFx0XHQvLyBvZiBob3cgdGhlIGRlc3RpbmF0aW9uIGlzIG9wZW5lZFxuXHRcdFx0aWYgKHVyaSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uRXZlbnQsIEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uQ2xhc3NpZmljYXRpb24+KCdjb250aW51ZU9uLm9wZW5EZXN0aW5hdGlvbi5vdXRjb21lJywgeyBzZWxlY3Rpb246IGNvbW1hbmQsIG91dGNvbWU6ICdub0Rlc3RpbmF0aW9uVXJpJyB9KTtcblx0XHRcdFx0cmV0dXJuICdub0Rlc3RpbmF0aW9uVXJpJztcblx0XHRcdH1cblxuXHRcdFx0aWYgKFVSSS5pc1VyaSh1cmkpKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uRXZlbnQsIEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uQ2xhc3NpZmljYXRpb24+KCdjb250aW51ZU9uLm9wZW5EZXN0aW5hdGlvbi5vdXRjb21lJywgeyBzZWxlY3Rpb246IGNvbW1hbmQsIG91dGNvbWU6ICdyZXNvbHZlZFVyaScgfSk7XG5cdFx0XHRcdHJldHVybiB1cmk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uRXZlbnQsIEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uQ2xhc3NpZmljYXRpb24+KCdjb250aW51ZU9uLm9wZW5EZXN0aW5hdGlvbi5vdXRjb21lJywgeyBzZWxlY3Rpb246IGNvbW1hbmQsIG91dGNvbWU6ICdpbnZhbGlkRGVzdGluYXRpb24nIH0pO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0aWYgKGV4IGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RXZhbHVhdGVDb250aW51ZU9uRGVzdGluYXRpb25FdmVudCwgRXZhbHVhdGVDb250aW51ZU9uRGVzdGluYXRpb25DbGFzc2lmaWNhdGlvbj4oJ2NvbnRpbnVlT24ub3BlbkRlc3RpbmF0aW9uLm91dGNvbWUnLCB7IHNlbGVjdGlvbjogY29tbWFuZCwgb3V0Y29tZTogJ2NhbmNlbGxlZCcgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFdmFsdWF0ZUNvbnRpbnVlT25EZXN0aW5hdGlvbkV2ZW50LCBFdmFsdWF0ZUNvbnRpbnVlT25EZXN0aW5hdGlvbkNsYXNzaWZpY2F0aW9uPignY29udGludWVPbi5vcGVuRGVzdGluYXRpb24ub3V0Y29tZScsIHsgc2VsZWN0aW9uOiBjb21tYW5kLCBvdXRjb21lOiAndW5rbm93bkVycm9yJyB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQaWNrSXRlbXMoKTogKENvbnRpbnVlRWRpdFNlc3Npb25JdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSB7XG5cdFx0Y29uc3QgaXRlbXMgPSBbLi4udGhpcy5jb250aW51ZUVkaXRTZXNzaW9uT3B0aW9uc10uZmlsdGVyKChvcHRpb24pID0+IG9wdGlvbi53aGVuID09PSB1bmRlZmluZWQgfHwgdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKG9wdGlvbi53aGVuKSk7XG5cblx0XHRpZiAoZ2V0VmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpICE9PSB1bmRlZmluZWQgJiYgaXNOYXRpdmUpIHtcblx0XHRcdGl0ZW1zLnB1c2gobmV3IENvbnRpbnVlRWRpdFNlc3Npb25JdGVtKFxuXHRcdFx0XHQnJChmb2xkZXIpICcgKyBsb2NhbGl6ZSgnY29udGludWVFZGl0U2Vzc2lvbkl0ZW0ub3BlbkluTG9jYWxGb2xkZXIudjInLCAnT3BlbiBpbiBMb2NhbCBGb2xkZXInKSxcblx0XHRcdFx0b3BlbkxvY2FsRm9sZGVyQ29tbWFuZC5pZCxcblx0XHRcdFx0bG9jYWxpemUoJ2NvbnRpbnVlRWRpdFNlc3Npb25JdGVtLmJ1aWx0aW4nLCAnQnVpbHQtaW4nKVxuXHRcdFx0KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc29ydGVkSXRlbXM6IChDb250aW51ZUVkaXRTZXNzaW9uSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBpdGVtcy5zb3J0KChpdGVtMSwgaXRlbTIpID0+IGl0ZW0xLmxhYmVsLmxvY2FsZUNvbXBhcmUoaXRlbTIubGFiZWwpKTtcblx0XHRyZXR1cm4gc29ydGVkSXRlbXMuY29uY2F0KHsgdHlwZTogJ3NlcGFyYXRvcicgfSwgbmV3IENvbnRpbnVlRWRpdFNlc3Npb25JdGVtKGluc3RhbGxBZGRpdGlvbmFsQ29udGludWVPbk9wdGlvbnNDb21tYW5kLnRpdGxlLCBpbnN0YWxsQWRkaXRpb25hbENvbnRpbnVlT25PcHRpb25zQ29tbWFuZC5pZCkpO1xuXHR9XG59XG5cbmNvbnN0IGluZm9CdXR0b25DbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmluZm8pO1xuY2xhc3MgQ29udGludWVFZGl0U2Vzc2lvbkl0ZW0gaW1wbGVtZW50cyBJUXVpY2tQaWNrSXRlbSB7XG5cdHB1YmxpYyByZWFkb25seSBidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb21tYW5kOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSB3aGVuPzogQ29udGV4dEtleUV4cHJlc3Npb24sXG5cdFx0cHVibGljIHJlYWRvbmx5IGRvY3VtZW50YXRpb24/OiBzdHJpbmcsXG5cdCkge1xuXHRcdGlmIChkb2N1bWVudGF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuYnV0dG9ucyA9IFt7XG5cdFx0XHRcdGljb25DbGFzczogaW5mb0J1dHRvbkNsYXNzLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbGVhcm5Nb3JlVG9vbHRpcCcsICdMZWFybiBNb3JlJyksXG5cdFx0XHR9XTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDb21tYW5kIHtcblx0Y29tbWFuZDogc3RyaW5nO1xuXHRncm91cDogc3RyaW5nO1xuXHR3aGVuOiBzdHJpbmc7XG5cdGRvY3VtZW50YXRpb24/OiBzdHJpbmc7XG5cdHF1YWxpZmllZE5hbWU/OiBzdHJpbmc7XG5cdGNhdGVnb3J5Pzogc3RyaW5nO1xuXHRyZW1vdGVHcm91cD86IHN0cmluZztcbn1cblxuY29uc3QgY29udGludWVFZGl0U2Vzc2lvbkV4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SUNvbW1hbmRbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2NvbnRpbnVlRWRpdFNlc3Npb24nLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb250aW51ZUVkaXRTZXNzaW9uRXh0UG9pbnQnLCAnQ29udHJpYnV0ZXMgb3B0aW9ucyBmb3IgY29udGludWluZyB0aGUgY3VycmVudCBlZGl0IHNlc3Npb24gaW4gYSBkaWZmZXJlbnQgZW52aXJvbm1lbnQnKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29udGludWVFZGl0U2Vzc2lvbkV4dFBvaW50LmNvbW1hbmQnLCAnSWRlbnRpZmllciBvZiB0aGUgY29tbWFuZCB0byBleGVjdXRlLiBUaGUgY29tbWFuZCBtdXN0IGJlIGRlY2xhcmVkIGluIHRoZSBcXCdjb21tYW5kc1xcJy1zZWN0aW9uIGFuZCByZXR1cm4gYSBVUkkgcmVwcmVzZW50aW5nIGEgZGlmZmVyZW50IGVudmlyb25tZW50IHdoZXJlIHRoZSBjdXJyZW50IGVkaXQgc2Vzc2lvbiBjYW4gYmUgY29udGludWVkLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdyb3VwOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb250aW51ZUVkaXRTZXNzaW9uRXh0UG9pbnQuZ3JvdXAnLCAnR3JvdXAgaW50byB3aGljaCB0aGlzIGl0ZW0gYmVsb25ncy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRxdWFsaWZpZWROYW1lOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb250aW51ZUVkaXRTZXNzaW9uRXh0UG9pbnQucXVhbGlmaWVkTmFtZScsICdBIGZ1bGx5IHF1YWxpZmllZCBuYW1lIGZvciB0aGlzIGl0ZW0gd2hpY2ggaXMgdXNlZCBmb3IgZGlzcGxheSBpbiBtZW51cy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29udGludWVFZGl0U2Vzc2lvbkV4dFBvaW50LmRlc2NyaXB0aW9uJywgXCJUaGUgdXJsLCBvciBhIGNvbW1hbmQgdGhhdCByZXR1cm5zIHRoZSB1cmwsIHRvIHRoZSBvcHRpb24ncyBkb2N1bWVudGF0aW9uIHBhZ2UuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlbW90ZUdyb3VwOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb250aW51ZUVkaXRTZXNzaW9uRXh0UG9pbnQucmVtb3RlR3JvdXAnLCAnR3JvdXAgaW50byB3aGljaCB0aGlzIGl0ZW0gYmVsb25ncyBpbiB0aGUgcmVtb3RlIGluZGljYXRvci4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb250aW51ZUVkaXRTZXNzaW9uRXh0UG9pbnQud2hlbicsICdDb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIHNob3cgdGhpcyBpdGVtLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJ11cblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuY29uc3Qgd29ya2JlbmNoUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihFZGl0U2Vzc2lvbnNDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0Li4ud29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHQncHJvcGVydGllcyc6IHtcblx0XHQnd29ya2JlbmNoLmV4cGVyaW1lbnRhbC5jbG91ZENoYW5nZXMuYXV0b1N0b3JlJzoge1xuXHRcdFx0ZW51bTogWydvblNodXRkb3duJywgJ29mZiddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnYXV0b1N0b3JlV29ya2luZ0NoYW5nZXMub25TaHV0ZG93bicsIFwiQXV0b21hdGljYWxseSBzdG9yZSBjdXJyZW50IHdvcmtpbmcgY2hhbmdlcyBpbiB0aGUgY2xvdWQgb24gd2luZG93IGNsb3NlLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2F1dG9TdG9yZVdvcmtpbmdDaGFuZ2VzLm9mZicsIFwiTmV2ZXIgYXR0ZW1wdCB0byBhdXRvbWF0aWNhbGx5IHN0b3JlIHdvcmtpbmcgY2hhbmdlcyBpbiB0aGUgY2xvdWQuXCIpXG5cdFx0XHRdLFxuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCd0YWdzJzogWydleHBlcmltZW50YWwnLCAndXNlc09ubGluZVNlcnZpY2VzJ10sXG5cdFx0XHQnZGVmYXVsdCc6ICdvZmYnLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYXV0b1N0b3JlV29ya2luZ0NoYW5nZXNEZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0byBhdXRvbWF0aWNhbGx5IHN0b3JlIGF2YWlsYWJsZSB3b3JraW5nIGNoYW5nZXMgaW4gdGhlIGNsb3VkIGZvciB0aGUgY3VycmVudCB3b3Jrc3BhY2UuIFRoaXMgc2V0dGluZyBoYXMgbm8gZWZmZWN0IGluIHRoZSB3ZWIuXCIpLFxuXHRcdH0sXG5cdFx0J3dvcmtiZW5jaC5jbG91ZENoYW5nZXMuYXV0b1Jlc3VtZSc6IHtcblx0XHRcdGVudW06IFsnb25SZWxvYWQnLCAnb2ZmJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvUmVzdW1lV29ya2luZ0NoYW5nZXMub25SZWxvYWQnLCBcIkF1dG9tYXRpY2FsbHkgcmVzdW1lIGF2YWlsYWJsZSB3b3JraW5nIGNoYW5nZXMgZnJvbSB0aGUgY2xvdWQgb24gd2luZG93IHJlbG9hZC5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvUmVzdW1lV29ya2luZ0NoYW5nZXMub2ZmJywgXCJOZXZlciBhdHRlbXB0IHRvIHJlc3VtZSB3b3JraW5nIGNoYW5nZXMgZnJvbSB0aGUgY2xvdWQuXCIpXG5cdFx0XHRdLFxuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCd0YWdzJzogWyd1c2VzT25saW5lU2VydmljZXMnXSxcblx0XHRcdCdkZWZhdWx0JzogJ29uUmVsb2FkJyxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2F1dG9SZXN1bWVXb3JraW5nQ2hhbmdlcycsIFwiQ29udHJvbHMgd2hldGhlciB0byBhdXRvbWF0aWNhbGx5IHJlc3VtZSBhdmFpbGFibGUgd29ya2luZyBjaGFuZ2VzIHN0b3JlZCBpbiB0aGUgY2xvdWQgZm9yIHRoZSBjdXJyZW50IHdvcmtzcGFjZS5cIiksXG5cdFx0fSxcblx0XHQnd29ya2JlbmNoLmNsb3VkQ2hhbmdlcy5jb250aW51ZU9uJzoge1xuXHRcdFx0ZW51bTogWydwcm9tcHQnLCAnb2ZmJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdjb250aW51ZU9uQ2xvdWRDaGFuZ2VzLnByb21wdEZvckF1dGgnLCAnUHJvbXB0IHRoZSB1c2VyIHRvIHNpZ24gaW4gdG8gc3RvcmUgd29ya2luZyBjaGFuZ2VzIGluIHRoZSBjbG91ZCB3aXRoIENvbnRpbnVlIFdvcmtpbmcgT24uJyksXG5cdFx0XHRcdGxvY2FsaXplKCdjb250aW51ZU9uQ2xvdWRDaGFuZ2VzLm9mZicsICdEbyBub3Qgc3RvcmUgd29ya2luZyBjaGFuZ2VzIGluIHRoZSBjbG91ZCB3aXRoIENvbnRpbnVlIFdvcmtpbmcgT24gdW5sZXNzIHRoZSB1c2VyIGhhcyBhbHJlYWR5IHR1cm5lZCBvbiBDbG91ZCBDaGFuZ2VzLicpXG5cdFx0XHRdLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHR0YWdzOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcyddLFxuXHRcdFx0ZGVmYXVsdDogJ3Byb21wdCcsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29udGludWVPbkNsb3VkQ2hhbmdlcycsICdDb250cm9scyB3aGV0aGVyIHRvIHByb21wdCB0aGUgdXNlciB0byBzdG9yZSB3b3JraW5nIGNoYW5nZXMgaW4gdGhlIGNsb3VkIHdoZW4gdXNpbmcgQ29udGludWUgV29ya2luZyBPbi4nKVxuXHRcdH0sXG5cdFx0J3dvcmtiZW5jaC5leHBlcmltZW50YWwuY2xvdWRDaGFuZ2VzLnBhcnRpYWxNYXRjaGVzLmVuYWJsZWQnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCd0YWdzJzogWydleHBlcmltZW50YWwnLCAndXNlc09ubGluZVNlcnZpY2VzJ10sXG5cdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnY2xvdWRDaGFuZ2VzUGFydGlhbE1hdGNoZXNFbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHN1cmZhY2UgY2xvdWQgY2hhbmdlcyB3aGljaCBwYXJ0aWFsbHkgbWF0Y2ggdGhlIGN1cnJlbnQgc2Vzc2lvbi5cIilcblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUEwQyxjQUFjLDJCQUFtRDtBQUMzRyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQixnQkFBZ0Isc0JBQXNCO0FBQ2xFLFNBQVMsU0FBMEIsUUFBUSxjQUFjLHVCQUF1QjtBQUVoRixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsNkJBQXFDLFlBQWlDLFVBQVUsNEJBQTRCLDRCQUE0QiwwQkFBMEIseUJBQXlCLHlCQUF5QixxQkFBcUIseUJBQXlCLDRCQUE0Qiw4QkFBOEIscUJBQXFCLG1CQUFtQiw2QkFBNkI7QUFDMVksU0FBeUIsbUJBQW1CO0FBQzVDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTRDLHNCQUFzQjtBQUMzRSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxVQUFVLFVBQVUsb0JBQW9CO0FBQ2pELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQW9CLGtCQUFpQyx3QkFBd0I7QUFDN0UsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCLDhCQUE4QjtBQUM5RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxxQkFBcUIsZ0JBQWdCLDBCQUEwQjtBQUN4RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGNBQWMsK0JBQXVEO0FBQzlFLFNBQTRCLDBCQUErRDtB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
