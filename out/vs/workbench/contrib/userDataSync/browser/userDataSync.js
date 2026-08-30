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
import { toAction } from "../../../../base/common/actions.js";
import { getErrorMessage, isCancellationError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize, localize2 } from "../../../../nls.js";
import { MenuId, MenuRegistry, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, ContextKeyTrueExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import {
  IUserDataAutoSyncService,
  IUserDataSyncService,
  registerConfiguration,
  SyncResource,
  SyncStatus,
  UserDataSyncError,
  UserDataSyncErrorCode,
  USER_DATA_SYNC_SCHEME,
  IUserDataSyncEnablementService,
  IUserDataSyncStoreManagementService,
  USER_DATA_SYNC_LOG_ID
} from "../../../../platform/userDataSync/common/userDataSync.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { IActivityService, NumberBadge, ProgressBadge } from "../../../services/activity/common/activity.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { fromNow } from "../../../../base/common/date.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ViewContainerLocation, Extensions } from "../../../common/views.js";
import { UserDataSyncDataViews } from "./userDataSyncViews.js";
import { IUserDataSyncWorkbenchService, getSyncAreaLabel, AccountStatus, CONTEXT_SYNC_STATE, CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE, CONFIGURE_SYNC_COMMAND_ID, SHOW_SYNC_LOG_COMMAND_ID, SYNC_VIEW_CONTAINER_ID, SYNC_TITLE, SYNC_VIEW_ICON, CONTEXT_HAS_CONFLICTS, DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR } from "../../../services/userDataSync/common/userDataSync.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { ctxIsMergeResultEditor, ctxMergeBaseUri } from "../../mergeEditor/common/mergeEditor.js";
import { IWorkbenchIssueService } from "../../issue/common/issue.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { isWeb } from "../../../../base/common/platform.js";
const turnOffSyncCommand = { id: "workbench.userDataSync.actions.turnOff", title: localize2("stop sync", "Turn Off") };
const configureSyncCommand = { id: CONFIGURE_SYNC_COMMAND_ID, title: localize2("configure sync", "Configure...") };
const showConflictsCommandId = "workbench.userDataSync.actions.showConflicts";
const syncNowCommand = {
  id: "workbench.userDataSync.actions.syncNow",
  title: localize2("sync now", "Sync Now"),
  description(userDataSyncService) {
    if (userDataSyncService.status === SyncStatus.Syncing) {
      return localize("syncing", "syncing");
    }
    if (userDataSyncService.lastSyncTime) {
      return localize("synced with time", "synced {0}", fromNow(userDataSyncService.lastSyncTime, true));
    }
    return void 0;
  }
};
const showSyncSettingsCommand = { id: "workbench.userDataSync.actions.settings", title: localize2("sync settings", "Show Settings") };
const showSyncedDataCommand = { id: "workbench.userDataSync.actions.showSyncedData", title: localize2("show synced data", "Show Synced Data") };
const CONTEXT_TURNING_ON_STATE = new RawContextKey("userDataSyncTurningOn", false);
let UserDataSyncWorkbenchContribution = class extends Disposable {
  constructor(userDataSyncEnablementService, userDataSyncService, userDataSyncWorkbenchService, contextKeyService, activityService, notificationService, editorService, userDataProfileService, dialogService, quickInputService, instantiationService, outputService, userDataAutoSyncService, textModelResolverService, preferencesService, telemetryService, productService, openerService, authenticationService, userDataSyncStoreManagementService, hostService, commandService, workbenchIssueService) {
    super();
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.userDataSyncService = userDataSyncService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
    this.activityService = activityService;
    this.notificationService = notificationService;
    this.editorService = editorService;
    this.userDataProfileService = userDataProfileService;
    this.dialogService = dialogService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.outputService = outputService;
    this.preferencesService = preferencesService;
    this.telemetryService = telemetryService;
    this.productService = productService;
    this.openerService = openerService;
    this.authenticationService = authenticationService;
    this.userDataSyncStoreManagementService = userDataSyncStoreManagementService;
    this.hostService = hostService;
    this.commandService = commandService;
    this.workbenchIssueService = workbenchIssueService;
    this.globalActivityBadgeDisposable = this._register(new MutableDisposable());
    this.accountBadgeDisposable = this._register(new MutableDisposable());
    this.conflictsDisposables = /* @__PURE__ */ new Map();
    this.invalidContentErrorDisposables = /* @__PURE__ */ new Map();
    this.conflictsActionDisposable = this._register(new MutableDisposable());
    this.turningOnSyncContext = CONTEXT_TURNING_ON_STATE.bindTo(contextKeyService);
    if (userDataSyncWorkbenchService.enabled) {
      registerConfiguration();
      this.updateAccountBadge();
      this.updateGlobalActivityBadge();
      this.onDidChangeConflicts(this.userDataSyncService.conflicts);
      this._register(Event.any(
        Event.debounce(userDataSyncService.onDidChangeStatus, () => void 0, 500),
        this.userDataSyncEnablementService.onDidChangeEnablement,
        this.userDataSyncWorkbenchService.onDidChangeAccountStatus
      )(() => {
        this.updateAccountBadge();
        this.updateGlobalActivityBadge();
      }));
      this._register(userDataSyncService.onDidChangeConflicts(() => this.onDidChangeConflicts(this.userDataSyncService.conflicts)));
      this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.onDidChangeConflicts(this.userDataSyncService.conflicts)));
      this._register(userDataSyncService.onSyncErrors((errors) => this.onSynchronizerErrors(errors)));
      this._register(userDataAutoSyncService.onError((error) => this.onAutoSyncError(error)));
      this.registerActions();
      this.registerViews();
      textModelResolverService.registerTextModelContentProvider(USER_DATA_SYNC_SCHEME, instantiationService.createInstance(UserDataRemoteContentProvider));
      this._register(Event.any(userDataSyncService.onDidChangeStatus, userDataSyncEnablementService.onDidChangeEnablement)(() => this.turningOnSync = !userDataSyncEnablementService.isEnabled() && userDataSyncService.status !== SyncStatus.Idle));
    }
  }
  get turningOnSync() {
    return !!this.turningOnSyncContext.get();
  }
  set turningOnSync(turningOn) {
    this.turningOnSyncContext.set(turningOn);
    this.updateGlobalActivityBadge();
  }
  toKey({ syncResource: resource, profile }) {
    return `${profile.id}:${resource}`;
  }
  onDidChangeConflicts(conflicts) {
    this.updateGlobalActivityBadge();
    this.registerShowConflictsAction();
    if (!this.userDataSyncEnablementService.isEnabled()) {
      return;
    }
    if (conflicts.length) {
      for (const [key, disposable] of this.conflictsDisposables.entries()) {
        if (!conflicts.some((conflict) => this.toKey(conflict) === key)) {
          disposable.dispose();
          this.conflictsDisposables.delete(key);
        }
      }
      for (const conflict of this.userDataSyncService.conflicts) {
        const key = this.toKey(conflict);
        if (!this.conflictsDisposables.has(key)) {
          const conflictsArea = getSyncAreaLabel(conflict.syncResource);
          const handle = this.notificationService.prompt(
            Severity.Warning,
            localize("conflicts detected", "Unable to sync due to conflicts in {0}. Please resolve them to continue.", conflictsArea.toLowerCase()),
            [
              {
                label: localize("replace remote", "Replace Remote"),
                run: () => {
                  this.acceptLocal(conflict, conflict.conflicts[0]);
                }
              },
              {
                label: localize("replace local", "Replace Local"),
                run: () => {
                  this.acceptRemote(conflict, conflict.conflicts[0]);
                }
              },
              {
                label: localize("show conflicts", "Show Conflicts"),
                run: () => {
                  this.telemetryService.publicLog2("sync/showConflicts", { source: conflict.syncResource });
                  this.userDataSyncWorkbenchService.showConflicts(conflict.conflicts[0]);
                }
              }
            ],
            {
              sticky: true
            }
          );
          this.conflictsDisposables.set(key, toDisposable(() => {
            handle.close();
            this.conflictsDisposables.delete(key);
          }));
        }
      }
    } else {
      this.conflictsDisposables.forEach((disposable) => disposable.dispose());
      this.conflictsDisposables.clear();
    }
  }
  async acceptRemote(syncResource, conflict) {
    try {
      await this.userDataSyncService.accept(syncResource, conflict.remoteResource, void 0, this.userDataSyncEnablementService.isEnabled());
    } catch (e) {
      this.notificationService.error(localize("accept failed", "Error while accepting changes. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
    }
  }
  async acceptLocal(syncResource, conflict) {
    try {
      await this.userDataSyncService.accept(syncResource, conflict.localResource, void 0, this.userDataSyncEnablementService.isEnabled());
    } catch (e) {
      this.notificationService.error(localize("accept failed", "Error while accepting changes. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
    }
  }
  onAutoSyncError(error) {
    switch (error.code) {
      case UserDataSyncErrorCode.SessionExpired:
        this.notificationService.notify({
          severity: Severity.Info,
          message: localize("session expired", "Settings sync was turned off because current session is expired, please sign in again to turn on sync."),
          actions: {
            primary: [toAction({
              id: "turn on sync",
              label: localize("turn on sync", "Turn on Settings Sync..."),
              run: () => this.turnOn()
            })]
          }
        });
        break;
      case UserDataSyncErrorCode.TurnedOff:
        this.notificationService.notify({
          severity: Severity.Info,
          message: localize("turned off", "Settings sync was turned off from another device, please turn on sync again."),
          actions: {
            primary: [toAction({
              id: "turn on sync",
              label: localize("turn on sync", "Turn on Settings Sync..."),
              run: () => this.turnOn()
            })]
          }
        });
        break;
      case UserDataSyncErrorCode.TooLarge:
        if (error.resource === SyncResource.Keybindings || error.resource === SyncResource.Settings || error.resource === SyncResource.Tasks) {
          this.disableSync(error.resource);
          const sourceArea = getSyncAreaLabel(error.resource);
          this.handleTooLargeError(error.resource, localize("too large", "Disabled syncing {0} because size of the {1} file to sync is larger than {2}. Please open the file and reduce the size and enable sync", sourceArea.toLowerCase(), sourceArea.toLowerCase(), "100kb"), error);
        }
        break;
      case UserDataSyncErrorCode.LocalTooManyProfiles:
        this.disableSync(SyncResource.Profiles);
        this.notificationService.error(localize("too many profiles", "Disabled syncing profiles because there are too many profiles to sync. Settings Sync supports syncing maximum 20 profiles. Please reduce the number of profiles and enable sync"));
        break;
      case UserDataSyncErrorCode.IncompatibleLocalContent:
      case UserDataSyncErrorCode.Gone:
      case UserDataSyncErrorCode.UpgradeRequired: {
        const message = localize("error upgrade required", "Settings sync is disabled because the current version ({0}, {1}) is not compatible with the sync service. Please update before turning on sync.", this.productService.version, this.productService.commit);
        const operationId = error.operationId ? localize("operationId", "Operation Id: {0}", error.operationId) : void 0;
        this.notificationService.notify({
          severity: Severity.Error,
          message: operationId ? `${message} ${operationId}` : message
        });
        break;
      }
      case UserDataSyncErrorCode.MethodNotFound: {
        const message = localize("method not found", "Settings sync is disabled because the client is making invalid requests. Please report an issue with the logs.");
        const operationId = error.operationId ? localize("operationId", "Operation Id: {0}", error.operationId) : void 0;
        this.notificationService.notify({
          severity: Severity.Error,
          message: operationId ? `${message} ${operationId}` : message,
          actions: {
            primary: [
              toAction({
                id: "Show Sync Logs",
                label: localize("show sync logs", "Show Log"),
                run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
              }),
              toAction({
                id: "Report Issue",
                label: localize("report issue", "Report Issue"),
                run: () => this.workbenchIssueService.openReporter()
              })
            ]
          }
        });
        break;
      }
      case UserDataSyncErrorCode.IncompatibleRemoteContent:
        this.notificationService.notify({
          severity: Severity.Error,
          message: localize("error reset required", "Settings sync is disabled because your data in the cloud is older than that of the client. Please clear your data in the cloud before turning on sync."),
          actions: {
            primary: [
              toAction({
                id: "reset",
                label: localize("reset", "Clear Data in Cloud..."),
                run: () => this.userDataSyncWorkbenchService.resetSyncedData()
              }),
              toAction({
                id: "show synced data",
                label: localize("show synced data action", "Show Synced Data"),
                run: () => this.userDataSyncWorkbenchService.showSyncActivity()
              })
            ]
          }
        });
        return;
      case UserDataSyncErrorCode.ServiceChanged:
        this.notificationService.notify({
          severity: Severity.Info,
          message: this.userDataSyncStoreManagementService.userDataSyncStore?.type === "insiders" ? localize("service switched to insiders", "Settings Sync has been switched to insiders service") : localize("service switched to stable", "Settings Sync has been switched to stable service")
        });
        return;
      case UserDataSyncErrorCode.DefaultServiceChanged:
        if (this.userDataSyncEnablementService.isEnabled()) {
          this.notificationService.notify({
            severity: Severity.Info,
            message: localize("using separate service", "Settings sync now uses a separate service, more information is available in the [Settings Sync Documentation](https://aka.ms/vscode-settings-sync-help#_syncing-stable-versus-insiders).")
          });
        } else {
          this.notificationService.notify({
            severity: Severity.Info,
            message: localize("service changed and turned off", "Settings sync was turned off because {0} now uses a separate service. Please turn on sync again.", this.productService.nameLong),
            actions: {
              primary: [toAction({
                id: "turn on sync",
                label: localize("turn on sync", "Turn on Settings Sync..."),
                run: () => this.turnOn()
              })]
            }
          });
        }
        return;
    }
  }
  handleTooLargeError(resource, message, error) {
    const operationId = error.operationId ? localize("operationId", "Operation Id: {0}", error.operationId) : void 0;
    this.notificationService.notify({
      severity: Severity.Error,
      message: operationId ? `${message} ${operationId}` : message,
      actions: {
        primary: [toAction({
          id: "open sync file",
          label: localize("open file", "Open {0} File", getSyncAreaLabel(resource)),
          run: () => resource === SyncResource.Settings ? this.preferencesService.openUserSettings({ jsonEditor: true }) : this.preferencesService.openGlobalKeybindingSettings(true)
        })]
      }
    });
  }
  onSynchronizerErrors(errors) {
    if (errors.length) {
      for (const { profile, syncResource: resource, error } of errors) {
        switch (error.code) {
          case UserDataSyncErrorCode.LocalInvalidContent:
            this.handleInvalidContentError({ profile, syncResource: resource });
            break;
          default: {
            const key = `${profile.id}:${resource}`;
            const disposable = this.invalidContentErrorDisposables.get(key);
            if (disposable) {
              disposable.dispose();
              this.invalidContentErrorDisposables.delete(key);
            }
          }
        }
      }
    } else {
      this.invalidContentErrorDisposables.forEach((disposable) => disposable.dispose());
      this.invalidContentErrorDisposables.clear();
    }
  }
  handleInvalidContentError({ profile, syncResource: source }) {
    if (this.userDataProfileService.currentProfile.id !== profile.id) {
      return;
    }
    const key = `${profile.id}:${source}`;
    if (this.invalidContentErrorDisposables.has(key)) {
      return;
    }
    if (source !== SyncResource.Settings && source !== SyncResource.Keybindings && source !== SyncResource.Tasks) {
      return;
    }
    if (!this.hostService.hasFocus) {
      return;
    }
    const resource = source === SyncResource.Settings ? this.userDataProfileService.currentProfile.settingsResource : source === SyncResource.Keybindings ? this.userDataProfileService.currentProfile.keybindingsResource : this.userDataProfileService.currentProfile.tasksResource;
    const editorUri = EditorResourceAccessor.getCanonicalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (isEqual(resource, editorUri)) {
      return;
    }
    const errorArea = getSyncAreaLabel(source);
    const handle = this.notificationService.notify({
      severity: Severity.Error,
      message: localize("errorInvalidConfiguration", "Unable to sync {0} because the content in the file is not valid. Please open the file and correct it.", errorArea.toLowerCase()),
      actions: {
        primary: [toAction({
          id: "open sync file",
          label: localize("open file", "Open {0} File", errorArea),
          run: () => source === SyncResource.Settings ? this.preferencesService.openUserSettings({ jsonEditor: true }) : this.preferencesService.openGlobalKeybindingSettings(true)
        })]
      }
    });
    this.invalidContentErrorDisposables.set(key, toDisposable(() => {
      handle.close();
      this.invalidContentErrorDisposables.delete(key);
    }));
  }
  getConflictsCount() {
    return this.userDataSyncService.conflicts.reduce((result, { conflicts }) => {
      return result + conflicts.length;
    }, 0);
  }
  async updateGlobalActivityBadge() {
    this.globalActivityBadgeDisposable.clear();
    let badge = void 0;
    if (this.userDataSyncService.conflicts.length && this.userDataSyncEnablementService.isEnabled()) {
      badge = new NumberBadge(this.getConflictsCount(), () => localize("has conflicts", "{0}: Conflicts Detected", SYNC_TITLE.value));
    } else if (this.turningOnSync) {
      badge = new ProgressBadge(() => localize("turning on syncing", "Turning on Settings Sync..."));
    }
    if (badge) {
      this.globalActivityBadgeDisposable.value = this.activityService.showGlobalActivity({ badge });
    }
  }
  async updateAccountBadge() {
    this.accountBadgeDisposable.clear();
    let badge = void 0;
    if (this.userDataSyncService.status !== SyncStatus.Uninitialized && this.userDataSyncEnablementService.isEnabled() && this.userDataSyncWorkbenchService.accountStatus === AccountStatus.Unavailable) {
      badge = new NumberBadge(1, () => localize("sign in to sync", "Sign in to Sync Settings"));
    }
    if (badge) {
      this.accountBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
    }
  }
  async turnOn() {
    try {
      if (!this.userDataSyncWorkbenchService.authenticationProviders.length) {
        throw new Error(localize("no authentication providers", "No authentication providers are available."));
      }
      const turnOn = await this.askToConfigure();
      if (!turnOn) {
        return;
      }
      if (this.userDataSyncStoreManagementService.userDataSyncStore?.canSwitch) {
        await this.selectSettingsSyncService(this.userDataSyncStoreManagementService.userDataSyncStore);
      }
      await this.userDataSyncWorkbenchService.turnOn();
    } catch (e) {
      if (isCancellationError(e)) {
        return;
      }
      if (e instanceof UserDataSyncError) {
        switch (e.code) {
          case UserDataSyncErrorCode.TooLarge:
            if (e.resource === SyncResource.Keybindings || e.resource === SyncResource.Settings || e.resource === SyncResource.Tasks) {
              this.handleTooLargeError(e.resource, localize("too large while starting sync", "Settings sync cannot be turned on because size of the {0} file to sync is larger than {1}. Please open the file and reduce the size and turn on sync", getSyncAreaLabel(e.resource).toLowerCase(), "100kb"), e);
              return;
            }
            break;
          case UserDataSyncErrorCode.IncompatibleLocalContent:
          case UserDataSyncErrorCode.Gone:
          case UserDataSyncErrorCode.UpgradeRequired: {
            const message = localize("error upgrade required while starting sync", "Settings sync cannot be turned on because the current version ({0}, {1}) is not compatible with the sync service. Please update before turning on sync.", this.productService.version, this.productService.commit);
            const operationId = e.operationId ? localize("operationId", "Operation Id: {0}", e.operationId) : void 0;
            this.notificationService.notify({
              severity: Severity.Error,
              message: operationId ? `${message} ${operationId}` : message
            });
            return;
          }
          case UserDataSyncErrorCode.IncompatibleRemoteContent:
            this.notificationService.notify({
              severity: Severity.Error,
              message: localize("error reset required while starting sync", "Settings sync cannot be turned on because your data in the cloud is older than that of the client. Please clear your data in the cloud before turning on sync."),
              actions: {
                primary: [
                  toAction({
                    id: "reset",
                    label: localize("reset", "Clear Data in Cloud..."),
                    run: () => this.userDataSyncWorkbenchService.resetSyncedData()
                  }),
                  toAction({
                    id: "show synced data",
                    label: localize("show synced data action", "Show Synced Data"),
                    run: () => this.userDataSyncWorkbenchService.showSyncActivity()
                  })
                ]
              }
            });
            return;
          case UserDataSyncErrorCode.Unauthorized:
          case UserDataSyncErrorCode.Forbidden:
            this.notificationService.error(localize("auth failed", "Error while turning on Settings Sync: Authentication failed."));
            return;
        }
        this.notificationService.error(localize("turn on failed with user data sync error", "Error while turning on Settings Sync. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
      } else {
        this.notificationService.error(localize({ key: "turn on failed", comment: ["Substitution is for error reason"] }, "Error while turning on Settings Sync. {0}", getErrorMessage(e)));
      }
    }
  }
  async askToConfigure() {
    return new Promise((c, e) => {
      const disposables = new DisposableStore();
      const quickPick = this.quickInputService.createQuickPick();
      disposables.add(quickPick);
      quickPick.title = SYNC_TITLE.value;
      quickPick.ok = false;
      quickPick.customButton = true;
      quickPick.customLabel = localize("sign in and turn on", "Sign in");
      quickPick.description = localize("configure and turn on sync detail", "Please sign in to backup and sync your data across devices.");
      quickPick.canSelectMany = true;
      quickPick.ignoreFocusOut = true;
      quickPick.hideInput = true;
      quickPick.hideCheckAll = true;
      const items = this.getConfigureSyncQuickPickItems();
      quickPick.items = items;
      quickPick.selectedItems = items.filter((item) => this.userDataSyncEnablementService.isResourceEnabled(item.id, true));
      let accepted = false;
      disposables.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(() => {
        accepted = true;
        quickPick.hide();
      }));
      disposables.add(quickPick.onDidHide(() => {
        try {
          if (accepted) {
            this.updateConfiguration(items, quickPick.selectedItems);
          }
          c(accepted);
        } catch (error) {
          e(error);
        } finally {
          disposables.dispose();
        }
      }));
      quickPick.show();
    });
  }
  getConfigureSyncQuickPickItems() {
    const result = [{
      id: SyncResource.Settings,
      label: getSyncAreaLabel(SyncResource.Settings)
    }, {
      id: SyncResource.Keybindings,
      label: getSyncAreaLabel(SyncResource.Keybindings)
    }, {
      id: SyncResource.Snippets,
      label: getSyncAreaLabel(SyncResource.Snippets)
    }, {
      id: SyncResource.Tasks,
      label: getSyncAreaLabel(SyncResource.Tasks)
    }, {
      id: SyncResource.Mcp,
      label: getSyncAreaLabel(SyncResource.Mcp)
    }, {
      id: SyncResource.GlobalState,
      label: getSyncAreaLabel(SyncResource.GlobalState)
    }, {
      id: SyncResource.Extensions,
      label: getSyncAreaLabel(SyncResource.Extensions)
    }, {
      id: SyncResource.Profiles,
      label: getSyncAreaLabel(SyncResource.Profiles)
    }, {
      id: SyncResource.Prompts,
      label: getSyncAreaLabel(SyncResource.Prompts)
    }];
    return result;
  }
  updateConfiguration(items, selectedItems) {
    for (const item of items) {
      const wasEnabled = this.userDataSyncEnablementService.isResourceEnabled(item.id);
      const isEnabled = !!selectedItems.filter((selected) => selected.id === item.id)[0];
      if (wasEnabled !== isEnabled) {
        this.userDataSyncEnablementService.setResourceEnablement(item.id, isEnabled);
      }
    }
  }
  async configureSyncOptions() {
    return new Promise((c, e) => {
      const disposables = new DisposableStore();
      const quickPick = this.quickInputService.createQuickPick();
      disposables.add(quickPick);
      quickPick.title = localize("configure sync title", "{0}: Configure...", SYNC_TITLE.value);
      quickPick.placeholder = localize("configure sync placeholder", "Choose what to sync");
      quickPick.canSelectMany = true;
      quickPick.ignoreFocusOut = true;
      quickPick.ok = true;
      const items = this.getConfigureSyncQuickPickItems();
      quickPick.items = items;
      quickPick.selectedItems = items.filter((item) => this.userDataSyncEnablementService.isResourceEnabled(item.id));
      disposables.add(quickPick.onDidAccept(async () => {
        if (quickPick.selectedItems.length) {
          this.updateConfiguration(items, quickPick.selectedItems);
          quickPick.hide();
        }
      }));
      disposables.add(quickPick.onDidHide(() => {
        disposables.dispose();
        c();
      }));
      quickPick.show();
    });
  }
  async turnOff() {
    const result = await this.dialogService.confirm({
      message: localize("turn off sync confirmation", "Do you want to turn off sync?"),
      detail: localize("turn off sync detail", "Your settings, keybindings, extensions, snippets and UI State will no longer be synced."),
      primaryButton: localize({ key: "turn off", comment: ["&& denotes a mnemonic"] }, "&&Turn off"),
      checkbox: this.userDataSyncWorkbenchService.accountStatus === AccountStatus.Available ? {
        label: localize("turn off sync everywhere", "Turn off sync on all your devices and clear the data from the cloud.")
      } : void 0
    });
    if (result.confirmed) {
      return this.userDataSyncWorkbenchService.turnoff(!!result.checkboxChecked);
    }
  }
  disableSync(source) {
    switch (source) {
      case SyncResource.Settings:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Settings, false);
      case SyncResource.Keybindings:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Keybindings, false);
      case SyncResource.Snippets:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Snippets, false);
      case SyncResource.Tasks:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Tasks, false);
      case SyncResource.Extensions:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Extensions, false);
      case SyncResource.GlobalState:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.GlobalState, false);
      case SyncResource.Profiles:
        return this.userDataSyncEnablementService.setResourceEnablement(SyncResource.Profiles, false);
    }
  }
  showSyncActivity() {
    return this.outputService.showChannel(USER_DATA_SYNC_LOG_ID);
  }
  async selectSettingsSyncService(userDataSyncStore) {
    return new Promise((c, e) => {
      const disposables = new DisposableStore();
      const quickPick = disposables.add(this.quickInputService.createQuickPick());
      quickPick.title = localize("switchSyncService.title", "{0}: Select Service", SYNC_TITLE.value);
      quickPick.description = localize("switchSyncService.description", "Ensure you are using the same settings sync service when syncing with multiple environments");
      quickPick.hideInput = true;
      quickPick.ignoreFocusOut = true;
      const getDescription = (url) => {
        const isDefault = isEqual(url, userDataSyncStore.defaultUrl);
        if (isDefault) {
          return localize("default", "Default");
        }
        return void 0;
      };
      quickPick.items = [
        {
          id: "insiders",
          label: localize("insiders", "Insiders"),
          description: getDescription(userDataSyncStore.insidersUrl)
        },
        {
          id: "stable",
          label: localize("stable", "Stable"),
          description: getDescription(userDataSyncStore.stableUrl)
        }
      ];
      disposables.add(quickPick.onDidAccept(async () => {
        try {
          await this.userDataSyncStoreManagementService.switch(quickPick.selectedItems[0].id);
          c();
        } catch (error) {
          e(error);
        } finally {
          quickPick.hide();
        }
      }));
      disposables.add(quickPick.onDidHide(() => disposables.dispose()));
      quickPick.show();
    });
  }
  registerActions() {
    if (this.userDataSyncEnablementService.canToggleEnablement()) {
      this.registerTurnOnSyncAction();
      this.registerTurnOffSyncAction();
    }
    this.registerTurningOnSyncAction();
    this.registerCancelTurnOnSyncAction();
    this.registerSignInAction();
    this.registerShowConflictsAction();
    this.registerEnableSyncViewsAction();
    this.registerManageSyncAction();
    this.registerSyncNowAction();
    this.registerConfigureSyncAction();
    this.registerShowSettingsAction();
    this.registerHelpAction();
    this.registerShowLogAction();
    this.registerResetSyncDataAction();
    this.registerAcceptMergesAction();
    if (isWeb) {
      this.registerDownloadSyncActivityAction();
    }
  }
  registerTurnOnSyncAction() {
    const that = this;
    const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT.toNegated(), CONTEXT_TURNING_ON_STATE.negate());
    this._register(registerAction2(class TurningOnSyncAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userDataSync.actions.turnOn",
          title: localize2("global activity turn on sync", "Backup and Sync Settings..."),
          category: SYNC_TITLE,
          f1: true,
          precondition: when,
          menu: [{
            group: "3_configuration",
            id: MenuId.GlobalActivity,
            when,
            order: 2
          }, {
            group: "3_configuration",
            id: MenuId.MenubarPreferencesMenu,
            when,
            order: 2
          }, {
            group: "1_settings",
            id: MenuId.AccountsContext,
            when,
            order: 2
          }]
        });
      }
      async run() {
        return that.turnOn();
      }
    }));
  }
  registerTurningOnSyncAction() {
    const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT.toNegated(), CONTEXT_TURNING_ON_STATE);
    this._register(registerAction2(class TurningOnSyncAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userData.actions.turningOn",
          title: localize("turning on sync", "Turning on Settings Sync..."),
          precondition: ContextKeyExpr.false(),
          menu: [{
            group: "3_configuration",
            id: MenuId.GlobalActivity,
            when,
            order: 2
          }, {
            group: "1_settings",
            id: MenuId.AccountsContext,
            when
          }]
        });
      }
      async run() {
      }
    }));
  }
  registerCancelTurnOnSyncAction() {
    const that = this;
    this._register(registerAction2(class TurningOnSyncAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userData.actions.cancelTurnOn",
          title: localize("cancel turning on sync", "Cancel"),
          icon: Codicon.stopCircle,
          menu: {
            id: MenuId.ViewContainerTitle,
            when: ContextKeyExpr.and(CONTEXT_TURNING_ON_STATE, ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID)),
            group: "navigation",
            order: 1
          }
        });
      }
      async run() {
        return that.userDataSyncWorkbenchService.turnoff(false);
      }
    }));
  }
  registerSignInAction() {
    const that = this;
    const id = "workbench.userData.actions.signin";
    const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Unavailable));
    this._register(registerAction2(class StopSyncAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userData.actions.signin",
          title: localize("sign in global", "Sign in to Sync Settings"),
          menu: {
            group: "3_configuration",
            id: MenuId.GlobalActivity,
            when,
            order: 2
          }
        });
      }
      async run() {
        try {
          await that.userDataSyncWorkbenchService.signIn();
        } catch (e) {
          that.notificationService.error(e);
        }
      }
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
      group: "1_settings",
      command: {
        id,
        title: localize("sign in accounts", "Sign in to Sync Settings (1)")
      },
      when
    }));
  }
  getShowConflictsTitle() {
    return localize2("resolveConflicts_global", "Show Conflicts ({0})", this.getConflictsCount());
  }
  registerShowConflictsAction() {
    this.conflictsActionDisposable.value = void 0;
    const that = this;
    this.conflictsActionDisposable.value = registerAction2(class TurningOnSyncAction extends Action2 {
      constructor() {
        super({
          id: showConflictsCommandId,
          get title() {
            return that.getShowConflictsTitle();
          },
          category: SYNC_TITLE,
          f1: true,
          precondition: CONTEXT_HAS_CONFLICTS,
          menu: [{
            group: "3_configuration",
            id: MenuId.GlobalActivity,
            when: CONTEXT_HAS_CONFLICTS,
            order: 2
          }, {
            group: "3_configuration",
            id: MenuId.MenubarPreferencesMenu,
            when: CONTEXT_HAS_CONFLICTS,
            order: 2
          }]
        });
      }
      async run() {
        return that.userDataSyncWorkbenchService.showConflicts();
      }
    });
  }
  registerManageSyncAction() {
    const that = this;
    const when = ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.notEqualsTo(AccountStatus.Unavailable), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized));
    this._register(registerAction2(class SyncStatusAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userDataSync.actions.manage",
          title: localize("sync is on", "Settings Sync is On"),
          toggled: ContextKeyTrueExpr.INSTANCE,
          menu: [
            {
              id: MenuId.GlobalActivity,
              group: "3_configuration",
              when,
              order: 2
            },
            {
              id: MenuId.MenubarPreferencesMenu,
              group: "3_configuration",
              when,
              order: 2
            },
            {
              id: MenuId.AccountsContext,
              group: "1_settings",
              when
            }
          ]
        });
      }
      run(accessor) {
        return new Promise((c, e) => {
          const quickInputService = accessor.get(IQuickInputService);
          const commandService = accessor.get(ICommandService);
          const disposables = new DisposableStore();
          const quickPick = quickInputService.createQuickPick({ useSeparators: true });
          disposables.add(quickPick);
          const items = [];
          if (that.userDataSyncService.conflicts.length) {
            items.push({ id: showConflictsCommandId, label: `${SYNC_TITLE.value}: ${that.getShowConflictsTitle().original}` });
            items.push({ type: "separator" });
          }
          items.push({ id: configureSyncCommand.id, label: `${SYNC_TITLE.value}: ${configureSyncCommand.title.original}` });
          items.push({ id: showSyncSettingsCommand.id, label: `${SYNC_TITLE.value}: ${showSyncSettingsCommand.title.original}` });
          items.push({ id: showSyncedDataCommand.id, label: `${SYNC_TITLE.value}: ${showSyncedDataCommand.title.original}` });
          items.push({ type: "separator" });
          items.push({ id: syncNowCommand.id, label: `${SYNC_TITLE.value}: ${syncNowCommand.title.original}`, description: syncNowCommand.description(that.userDataSyncService) });
          if (that.userDataSyncEnablementService.canToggleEnablement()) {
            const account = that.userDataSyncWorkbenchService.current;
            items.push({ id: turnOffSyncCommand.id, label: `${SYNC_TITLE.value}: ${turnOffSyncCommand.title.original}`, description: account ? `${account.accountName} (${that.authenticationService.getProvider(account.authenticationProviderId).label})` : void 0 });
          }
          quickPick.items = items;
          disposables.add(quickPick.onDidAccept(() => {
            if (quickPick.selectedItems[0] && quickPick.selectedItems[0].id) {
              commandService.executeCommand(quickPick.selectedItems[0].id);
            }
            quickPick.hide();
          }));
          disposables.add(quickPick.onDidHide(() => {
            disposables.dispose();
            c();
          }));
          quickPick.show();
        });
      }
    }));
  }
  registerEnableSyncViewsAction() {
    const that = this;
    const when = ContextKeyExpr.and(CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized));
    this._register(registerAction2(class SyncStatusAction extends Action2 {
      constructor() {
        super({
          id: showSyncedDataCommand.id,
          title: showSyncedDataCommand.title,
          category: SYNC_TITLE,
          precondition: when,
          menu: {
            id: MenuId.CommandPalette,
            when
          }
        });
      }
      run(accessor) {
        return that.userDataSyncWorkbenchService.showSyncActivity();
      }
    }));
  }
  registerSyncNowAction() {
    const that = this;
    this._register(registerAction2(class SyncNowAction extends Action2 {
      constructor() {
        super({
          id: syncNowCommand.id,
          title: syncNowCommand.title,
          category: SYNC_TITLE,
          menu: {
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, CONTEXT_ACCOUNT_STATE.isEqualTo(AccountStatus.Available), CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
          }
        });
      }
      run(accessor) {
        return that.userDataSyncWorkbenchService.syncNow();
      }
    }));
  }
  registerTurnOffSyncAction() {
    const that = this;
    this._register(registerAction2(class StopSyncAction extends Action2 {
      constructor() {
        super({
          id: turnOffSyncCommand.id,
          title: turnOffSyncCommand.title,
          category: SYNC_TITLE,
          menu: {
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT)
          }
        });
      }
      async run() {
        try {
          await that.turnOff();
        } catch (e) {
          if (!isCancellationError(e)) {
            that.notificationService.error(localize("turn off failed", "Error while turning off Settings Sync. Please check [logs]({0}) for more details.", `command:${SHOW_SYNC_LOG_COMMAND_ID}`));
          }
        }
      }
    }));
  }
  registerConfigureSyncAction() {
    const that = this;
    const when = ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized), CONTEXT_SYNC_ENABLEMENT);
    this._register(registerAction2(class ConfigureSyncAction extends Action2 {
      constructor() {
        super({
          id: configureSyncCommand.id,
          title: configureSyncCommand.title,
          category: SYNC_TITLE,
          icon: Codicon.settingsGear,
          tooltip: localize("configure", "Configure..."),
          menu: [{
            id: MenuId.CommandPalette,
            when
          }, {
            id: MenuId.ViewContainerTitle,
            when: ContextKeyExpr.and(CONTEXT_SYNC_ENABLEMENT, ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID)),
            group: "navigation",
            order: 2
          }]
        });
      }
      run() {
        return that.configureSyncOptions();
      }
    }));
  }
  registerShowLogAction() {
    const that = this;
    this._register(registerAction2(class ShowSyncActivityAction extends Action2 {
      constructor() {
        super({
          id: SHOW_SYNC_LOG_COMMAND_ID,
          title: localize("show sync log title", "{0}: Show Log", SYNC_TITLE.value),
          tooltip: localize("show sync log toolrip", "Show Log"),
          icon: Codicon.output,
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
          }, {
            id: MenuId.ViewContainerTitle,
            when: ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID),
            group: "navigation",
            order: 1
          }]
        });
      }
      run() {
        return that.showSyncActivity();
      }
    }));
  }
  registerShowSettingsAction() {
    this._register(registerAction2(class ShowSyncSettingsAction extends Action2 {
      constructor() {
        super({
          id: showSyncSettingsCommand.id,
          title: showSyncSettingsCommand.title,
          category: SYNC_TITLE,
          menu: {
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
          }
        });
      }
      run(accessor) {
        accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, query: "@tag:sync" });
      }
    }));
  }
  registerHelpAction() {
    const that = this;
    this._register(registerAction2(class HelpAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userDataSync.actions.help",
          title: SYNC_TITLE,
          category: Categories.Help,
          menu: [{
            id: MenuId.CommandPalette,
            when: ContextKeyExpr.and(CONTEXT_SYNC_STATE.notEqualsTo(SyncStatus.Uninitialized))
          }]
        });
      }
      run() {
        return that.openerService.open(URI.parse("https://aka.ms/vscode-settings-sync-help"));
      }
    }));
    MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
      command: {
        id: "workbench.userDataSync.actions.help",
        title: Categories.Help.value
      },
      when: ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID),
      group: "1_help"
    });
  }
  registerAcceptMergesAction() {
    const that = this;
    this._register(registerAction2(class AcceptMergesAction extends Action2 {
      constructor() {
        super({
          id: "workbench.userDataSync.actions.acceptMerges",
          title: localize("complete merges title", "Complete Merge"),
          menu: [{
            id: MenuId.EditorContent,
            when: ContextKeyExpr.and(ctxIsMergeResultEditor, ContextKeyExpr.regex(ctxMergeBaseUri.key, new RegExp(`^${USER_DATA_SYNC_SCHEME}:`)))
          }]
        });
      }
      async run(accessor, previewResource) {
        const textFileService = accessor.get(ITextFileService);
        await textFileService.save(previewResource);
        const content = await textFileService.read(previewResource);
        await that.userDataSyncService.accept(this.getSyncResource(previewResource), previewResource, content.value, true);
      }
      getSyncResource(previewResource) {
        const conflict = that.userDataSyncService.conflicts.find(({ conflicts }) => conflicts.some((conflict2) => isEqual(conflict2.previewResource, previewResource)));
        if (conflict) {
          return conflict;
        }
        throw new Error(`Unknown resource: ${previewResource.toString()}`);
      }
    }));
  }
  registerDownloadSyncActivityAction() {
    this._register(registerAction2(class DownloadSyncActivityAction extends Action2 {
      constructor() {
        super(DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR);
      }
      async run(accessor) {
        const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
        const notificationService = accessor.get(INotificationService);
        const folder = await userDataSyncWorkbenchService.downloadSyncActivity();
        if (folder) {
          notificationService.info(localize("download sync activity complete", "Successfully downloaded Settings Sync activity."));
        }
      }
    }));
  }
  registerViews() {
    const container = this.registerViewContainer();
    this.registerDataViews(container);
  }
  registerViewContainer() {
    return Registry.as(Extensions.ViewContainersRegistry).registerViewContainer(
      {
        id: SYNC_VIEW_CONTAINER_ID,
        title: SYNC_TITLE,
        ctorDescriptor: new SyncDescriptor(
          ViewPaneContainer,
          [SYNC_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]
        ),
        icon: SYNC_VIEW_ICON,
        hideIfEmpty: true
      },
      ViewContainerLocation.Sidebar
    );
  }
  registerResetSyncDataAction() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.actions.syncData.reset",
          title: localize("workbench.actions.syncData.reset", "Clear Data in Cloud..."),
          menu: [{
            id: MenuId.ViewContainerTitle,
            when: ContextKeyExpr.equals("viewContainer", SYNC_VIEW_CONTAINER_ID),
            group: "0_configure"
          }]
        });
      }
      run() {
        return that.userDataSyncWorkbenchService.resetSyncedData();
      }
    }));
  }
  registerDataViews(container) {
    this._register(this.instantiationService.createInstance(UserDataSyncDataViews, container));
  }
};
UserDataSyncWorkbenchContribution = __decorateClass([
  __decorateParam(0, IUserDataSyncEnablementService),
  __decorateParam(1, IUserDataSyncService),
  __decorateParam(2, IUserDataSyncWorkbenchService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IActivityService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IUserDataProfileService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IQuickInputService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IOutputService),
  __decorateParam(12, IUserDataAutoSyncService),
  __decorateParam(13, ITextModelService),
  __decorateParam(14, IPreferencesService),
  __decorateParam(15, ITelemetryService),
  __decorateParam(16, IProductService),
  __decorateParam(17, IOpenerService),
  __decorateParam(18, IAuthenticationService),
  __decorateParam(19, IUserDataSyncStoreManagementService),
  __decorateParam(20, IHostService),
  __decorateParam(21, ICommandService),
  __decorateParam(22, IWorkbenchIssueService)
], UserDataSyncWorkbenchContribution);
let UserDataRemoteContentProvider = class {
  constructor(userDataSyncService, modelService, languageService) {
    this.userDataSyncService = userDataSyncService;
    this.modelService = modelService;
    this.languageService = languageService;
  }
  provideTextContent(uri) {
    if (uri.scheme === USER_DATA_SYNC_SCHEME) {
      return this.userDataSyncService.resolveContent(uri).then((content) => this.modelService.createModel(content || "", this.languageService.createById("jsonc"), uri));
    }
    return null;
  }
};
UserDataRemoteContentProvider = __decorateClass([
  __decorateParam(0, IUserDataSyncService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService)
], UserDataRemoteContentProvider);
export {
  UserDataSyncWorkbenchContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVzZXJEYXRhU3luY1xcYnJvd3NlclxcdXNlckRhdGFTeW5jLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbENvbnRlbnRQcm92aWRlciwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleVRydWVFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBRdWlja1BpY2tJdGVtLCBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHtcblx0SVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU2VydmljZSwgcmVnaXN0ZXJDb25maWd1cmF0aW9uLFxuXHRTeW5jUmVzb3VyY2UsIFN5bmNTdGF0dXMsIFVzZXJEYXRhU3luY0Vycm9yLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUsIFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRJUmVzb3VyY2VQcmV2aWV3LCBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgVXNlckRhdGFTeW5jU3RvcmVUeXBlLCBJVXNlckRhdGFTeW5jU3RvcmUsIElVc2VyRGF0YVN5bmNSZXNvdXJjZUNvbmZsaWN0cywgSVVzZXJEYXRhU3luY1Jlc291cmNlLCBJVXNlckRhdGFTeW5jUmVzb3VyY2VFcnJvciwgVVNFUl9EQVRBX1NZTkNfTE9HX0lEXG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIElCYWRnZSwgTnVtYmVyQmFkZ2UsIFByb2dyZXNzQmFkZ2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24sIElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBFeHRlbnNpb25zLCBWaWV3Q29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY0RhdGFWaWV3cyB9IGZyb20gJy4vdXNlckRhdGFTeW5jVmlld3MuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsIGdldFN5bmNBcmVhTGFiZWwsIEFjY291bnRTdGF0dXMsIENPTlRFWFRfU1lOQ19TVEFURSwgQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQsIENPTlRFWFRfQUNDT1VOVF9TVEFURSwgQ09ORklHVVJFX1NZTkNfQ09NTUFORF9JRCwgU0hPV19TWU5DX0xPR19DT01NQU5EX0lELCBTWU5DX1ZJRVdfQ09OVEFJTkVSX0lELCBTWU5DX1RJVExFLCBTWU5DX1ZJRVdfSUNPTiwgQ09OVEVYVF9IQVNfQ09ORkxJQ1RTLCBET1dOTE9BRF9BQ1RJVklUWV9BQ1RJT05fREVTQ1JJUFRPUiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmVDb250YWluZXIuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBjdHhJc01lcmdlUmVzdWx0RWRpdG9yLCBjdHhNZXJnZUJhc2VVcmkgfSBmcm9tICcuLi8uLi9tZXJnZUVkaXRvci9jb21tb24vbWVyZ2VFZGl0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaElzc3VlU2VydmljZSB9IGZyb20gJy4uLy4uL2lzc3VlL2NvbW1vbi9pc3N1ZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcblxudHlwZSBDb25maWd1cmVTeW5jUXVpY2tQaWNrSXRlbSA9IHsgaWQ6IFN5bmNSZXNvdXJjZTsgbGFiZWw6IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfTtcblxudHlwZSBTeW5jQ29uZmxpY3RzQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnc2FuZHkwODEnO1xuXHRjb21tZW50OiAnUmVzcG9uc2UgaW5mb3JtYXRpb24gd2hlbiBjb25mbGljdCBoYXBwZW5zIGR1cmluZyBzZXR0aW5ncyBzeW5jJztcblx0c291cmNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnc2V0dGluZ3Mgc3luYyByZXNvdXJjZS4gZWcuLCBzZXR0aW5ncywga2V5YmluZGluZ3MuLi4nIH07XG5cdGFjdGlvbj86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdhY3Rpb24gdGFrZW4gd2hpbGUgcmVzb2x2aW5nIGNvbmZsaWN0cy4gRWc6IGFjY2VwdExvY2FsLCBhY2NlcHRSZW1vdGUnIH07XG59O1xuXG5jb25zdCB0dXJuT2ZmU3luY0NvbW1hbmQgPSB7IGlkOiAnd29ya2JlbmNoLnVzZXJEYXRhU3luYy5hY3Rpb25zLnR1cm5PZmYnLCB0aXRsZTogbG9jYWxpemUyKCdzdG9wIHN5bmMnLCAnVHVybiBPZmYnKSB9O1xuY29uc3QgY29uZmlndXJlU3luY0NvbW1hbmQgPSB7IGlkOiBDT05GSUdVUkVfU1lOQ19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCdjb25maWd1cmUgc3luYycsICdDb25maWd1cmUuLi4nKSB9O1xuY29uc3Qgc2hvd0NvbmZsaWN0c0NvbW1hbmRJZCA9ICd3b3JrYmVuY2gudXNlckRhdGFTeW5jLmFjdGlvbnMuc2hvd0NvbmZsaWN0cyc7XG5jb25zdCBzeW5jTm93Q29tbWFuZCA9IHtcblx0aWQ6ICd3b3JrYmVuY2gudXNlckRhdGFTeW5jLmFjdGlvbnMuc3luY05vdycsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3N5bmMgbm93JywgJ1N5bmMgTm93JyksXG5cdGRlc2NyaXB0aW9uKHVzZXJEYXRhU3luY1NlcnZpY2U6IElVc2VyRGF0YVN5bmNTZXJ2aWNlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodXNlckRhdGFTeW5jU2VydmljZS5zdGF0dXMgPT09IFN5bmNTdGF0dXMuU3luY2luZykge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzeW5jaW5nJywgXCJzeW5jaW5nXCIpO1xuXHRcdH1cblx0XHRpZiAodXNlckRhdGFTeW5jU2VydmljZS5sYXN0U3luY1RpbWUpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc3luY2VkIHdpdGggdGltZScsIFwic3luY2VkIHswfVwiLCBmcm9tTm93KHVzZXJEYXRhU3luY1NlcnZpY2UubGFzdFN5bmNUaW1lLCB0cnVlKSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn07XG5jb25zdCBzaG93U3luY1NldHRpbmdzQ29tbWFuZCA9IHsgaWQ6ICd3b3JrYmVuY2gudXNlckRhdGFTeW5jLmFjdGlvbnMuc2V0dGluZ3MnLCB0aXRsZTogbG9jYWxpemUyKCdzeW5jIHNldHRpbmdzJywgJ1Nob3cgU2V0dGluZ3MnKSwgfTtcbmNvbnN0IHNob3dTeW5jZWREYXRhQ29tbWFuZCA9IHsgaWQ6ICd3b3JrYmVuY2gudXNlckRhdGFTeW5jLmFjdGlvbnMuc2hvd1N5bmNlZERhdGEnLCB0aXRsZTogbG9jYWxpemUyKCdzaG93IHN5bmNlZCBkYXRhJywgJ1Nob3cgU3luY2VkIERhdGEnKSwgfTtcblxuY29uc3QgQ09OVEVYVF9UVVJOSU5HX09OX1NUQVRFID0gbmV3IFJhd0NvbnRleHRLZXk8ZmFsc2U+KCd1c2VyRGF0YVN5bmNUdXJuaW5nT24nLCBmYWxzZSk7XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVN5bmNXb3JrYmVuY2hDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0dXJuaW5nT25TeW5jQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBnbG9iYWxBY3Rpdml0eUJhZGdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhY2NvdW50QmFkZ2VEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1NlcnZpY2U6IElVc2VyRGF0YVN5bmNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2U6IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU91dHB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0XHRASVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIHVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlOiBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hJc3N1ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hJc3N1ZVNlcnZpY2U6IElXb3JrYmVuY2hJc3N1ZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudHVybmluZ09uU3luY0NvbnRleHQgPSBDT05URVhUX1RVUk5JTkdfT05fU1RBVEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGlmICh1c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLmVuYWJsZWQpIHtcblx0XHRcdHJlZ2lzdGVyQ29uZmlndXJhdGlvbigpO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZUFjY291bnRCYWRnZSgpO1xuXHRcdFx0dGhpcy51cGRhdGVHbG9iYWxBY3Rpdml0eUJhZGdlKCk7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlQ29uZmxpY3RzKHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5jb25mbGljdHMpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50LmRlYm91bmNlKHVzZXJEYXRhU3luY1NlcnZpY2Uub25EaWRDaGFuZ2VTdGF0dXMsICgpID0+IHVuZGVmaW5lZCwgNTAwKSxcblx0XHRcdFx0dGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVuYWJsZW1lbnQsXG5cdFx0XHRcdHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5vbkRpZENoYW5nZUFjY291bnRTdGF0dXNcblx0XHRcdCkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFjY291bnRCYWRnZSgpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUdsb2JhbEFjdGl2aXR5QmFkZ2UoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY1NlcnZpY2Uub25EaWRDaGFuZ2VDb25mbGljdHMoKCkgPT4gdGhpcy5vbkRpZENoYW5nZUNvbmZsaWN0cyh0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuY29uZmxpY3RzKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbmFibGVtZW50KCgpID0+IHRoaXMub25EaWRDaGFuZ2VDb25mbGljdHModGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLmNvbmZsaWN0cykpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY1NlcnZpY2Uub25TeW5jRXJyb3JzKGVycm9ycyA9PiB0aGlzLm9uU3luY2hyb25pemVyRXJyb3JzKGVycm9ycykpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlLm9uRXJyb3IoZXJyb3IgPT4gdGhpcy5vbkF1dG9TeW5jRXJyb3IoZXJyb3IpKSk7XG5cblx0XHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyVmlld3MoKTtcblxuXHRcdFx0dGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKFVTRVJfREFUQV9TWU5DX1NDSEVNRSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFSZW1vdGVDb250ZW50UHJvdmlkZXIpKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KHVzZXJEYXRhU3luY1NlcnZpY2Uub25EaWRDaGFuZ2VTdGF0dXMsIHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW5hYmxlbWVudClcblx0XHRcdFx0KCgpID0+IHRoaXMudHVybmluZ09uU3luYyA9ICF1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSAmJiB1c2VyRGF0YVN5bmNTZXJ2aWNlLnN0YXR1cyAhPT0gU3luY1N0YXR1cy5JZGxlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgdHVybmluZ09uU3luYygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLnR1cm5pbmdPblN5bmNDb250ZXh0LmdldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgdHVybmluZ09uU3luYyh0dXJuaW5nT246IGJvb2xlYW4pIHtcblx0XHR0aGlzLnR1cm5pbmdPblN5bmNDb250ZXh0LnNldCh0dXJuaW5nT24pO1xuXHRcdHRoaXMudXBkYXRlR2xvYmFsQWN0aXZpdHlCYWRnZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0tleSh7IHN5bmNSZXNvdXJjZTogcmVzb3VyY2UsIHByb2ZpbGUgfTogSVVzZXJEYXRhU3luY1Jlc291cmNlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7cHJvZmlsZS5pZH06JHtyZXNvdXJjZX1gO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb25mbGljdHNEaXNwb3NhYmxlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSBvbkRpZENoYW5nZUNvbmZsaWN0cyhjb25mbGljdHM6IElVc2VyRGF0YVN5bmNSZXNvdXJjZUNvbmZsaWN0c1tdKSB7XG5cdFx0dGhpcy51cGRhdGVHbG9iYWxBY3Rpdml0eUJhZGdlKCk7XG5cdFx0dGhpcy5yZWdpc3RlclNob3dDb25mbGljdHNBY3Rpb24oKTtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGNvbmZsaWN0cy5sZW5ndGgpIHtcblx0XHRcdC8vIENsZWFyIGFuZCBkaXNwb3NlIGNvbmZsaWN0cyB0aG9zZSB3ZXJlIGNsZWFyZWRcblx0XHRcdGZvciAoY29uc3QgW2tleSwgZGlzcG9zYWJsZV0gb2YgdGhpcy5jb25mbGljdHNEaXNwb3NhYmxlcy5lbnRyaWVzKCkpIHtcblx0XHRcdFx0aWYgKCFjb25mbGljdHMuc29tZShjb25mbGljdCA9PiB0aGlzLnRvS2V5KGNvbmZsaWN0KSA9PT0ga2V5KSkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuY29uZmxpY3RzRGlzcG9zYWJsZXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBjb25mbGljdCBvZiB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuY29uZmxpY3RzKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IHRoaXMudG9LZXkoY29uZmxpY3QpO1xuXHRcdFx0XHQvLyBTaG93IGNvbmZsaWN0cyBub3RpZmljYXRpb24gaWYgbm90IHNob3duIGJlZm9yZVxuXHRcdFx0XHRpZiAoIXRoaXMuY29uZmxpY3RzRGlzcG9zYWJsZXMuaGFzKGtleSkpIHtcblx0XHRcdFx0XHRjb25zdCBjb25mbGljdHNBcmVhID0gZ2V0U3luY0FyZWFMYWJlbChjb25mbGljdC5zeW5jUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuV2FybmluZywgbG9jYWxpemUoJ2NvbmZsaWN0cyBkZXRlY3RlZCcsIFwiVW5hYmxlIHRvIHN5bmMgZHVlIHRvIGNvbmZsaWN0cyBpbiB7MH0uIFBsZWFzZSByZXNvbHZlIHRoZW0gdG8gY29udGludWUuXCIsIGNvbmZsaWN0c0FyZWEudG9Mb3dlckNhc2UoKSksXG5cdFx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JlcGxhY2UgcmVtb3RlJywgXCJSZXBsYWNlIFJlbW90ZVwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuYWNjZXB0TG9jYWwoY29uZmxpY3QsIGNvbmZsaWN0LmNvbmZsaWN0c1swXSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXBsYWNlIGxvY2FsJywgXCJSZXBsYWNlIExvY2FsXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5hY2NlcHRSZW1vdGUoY29uZmxpY3QsIGNvbmZsaWN0LmNvbmZsaWN0c1swXSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93IGNvbmZsaWN0cycsIFwiU2hvdyBDb25mbGljdHNcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7IHNvdXJjZTogc3RyaW5nOyBhY3Rpb24/OiBzdHJpbmcgfSwgU3luY0NvbmZsaWN0c0NsYXNzaWZpY2F0aW9uPignc3luYy9zaG93Q29uZmxpY3RzJywgeyBzb3VyY2U6IGNvbmZsaWN0LnN5bmNSZXNvdXJjZSB9KTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5zaG93Q29uZmxpY3RzKGNvbmZsaWN0LmNvbmZsaWN0c1swXSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRzdGlja3k6IHRydWVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHRoaXMuY29uZmxpY3RzRGlzcG9zYWJsZXMuc2V0KGtleSwgdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRcdC8vIGNsb3NlIHRoZSBjb25mbGljdHMgd2FybmluZyBub3RpZmljYXRpb25cblx0XHRcdFx0XHRcdGhhbmRsZS5jbG9zZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5jb25mbGljdHNEaXNwb3NhYmxlcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb25mbGljdHNEaXNwb3NhYmxlcy5mb3JFYWNoKGRpc3Bvc2FibGUgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdFx0dGhpcy5jb25mbGljdHNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWNjZXB0UmVtb3RlKHN5bmNSZXNvdXJjZTogSVVzZXJEYXRhU3luY1Jlc291cmNlLCBjb25mbGljdDogSVJlc291cmNlUHJldmlldykge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuYWNjZXB0KHN5bmNSZXNvdXJjZSwgY29uZmxpY3QucmVtb3RlUmVzb3VyY2UsIHVuZGVmaW5lZCwgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdhY2NlcHQgZmFpbGVkJywgXCJFcnJvciB3aGlsZSBhY2NlcHRpbmcgY2hhbmdlcy4gUGxlYXNlIGNoZWNrIFtsb2dzXSh7MH0pIGZvciBtb3JlIGRldGFpbHMuXCIsIGBjb21tYW5kOiR7U0hPV19TWU5DX0xPR19DT01NQU5EX0lEfWApKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFjY2VwdExvY2FsKHN5bmNSZXNvdXJjZTogSVVzZXJEYXRhU3luY1Jlc291cmNlLCBjb25mbGljdDogSVJlc291cmNlUHJldmlldyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuYWNjZXB0KHN5bmNSZXNvdXJjZSwgY29uZmxpY3QubG9jYWxSZXNvdXJjZSwgdW5kZWZpbmVkLCB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2FjY2VwdCBmYWlsZWQnLCBcIkVycm9yIHdoaWxlIGFjY2VwdGluZyBjaGFuZ2VzLiBQbGVhc2UgY2hlY2sgW2xvZ3NdKHswfSkgZm9yIG1vcmUgZGV0YWlscy5cIiwgYGNvbW1hbmQ6JHtTSE9XX1NZTkNfTE9HX0NPTU1BTkRfSUR9YCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25BdXRvU3luY0Vycm9yKGVycm9yOiBVc2VyRGF0YVN5bmNFcnJvcik6IHZvaWQge1xuXHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuU2Vzc2lvbkV4cGlyZWQ6XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdzZXNzaW9uIGV4cGlyZWQnLCBcIlNldHRpbmdzIHN5bmMgd2FzIHR1cm5lZCBvZmYgYmVjYXVzZSBjdXJyZW50IHNlc3Npb24gaXMgZXhwaXJlZCwgcGxlYXNlIHNpZ24gaW4gYWdhaW4gdG8gdHVybiBvbiBzeW5jLlwiKSxcblx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBbdG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRpZDogJ3R1cm4gb24gc3luYycsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndHVybiBvbiBzeW5jJywgXCJUdXJuIG9uIFNldHRpbmdzIFN5bmMuLi5cIiksXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy50dXJuT24oKVxuXHRcdFx0XHRcdFx0fSldXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5UdXJuZWRPZmY6XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0dXJuZWQgb2ZmJywgXCJTZXR0aW5ncyBzeW5jIHdhcyB0dXJuZWQgb2ZmIGZyb20gYW5vdGhlciBkZXZpY2UsIHBsZWFzZSB0dXJuIG9uIHN5bmMgYWdhaW4uXCIpLFxuXHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IFt0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdGlkOiAndHVybiBvbiBzeW5jJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0dXJuIG9uIHN5bmMnLCBcIlR1cm4gb24gU2V0dGluZ3MgU3luYy4uLlwiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnR1cm5PbigpXG5cdFx0XHRcdFx0XHR9KV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlRvb0xhcmdlOlxuXHRcdFx0XHRpZiAoZXJyb3IucmVzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5LZXliaW5kaW5ncyB8fCBlcnJvci5yZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLlNldHRpbmdzIHx8IGVycm9yLnJlc291cmNlID09PSBTeW5jUmVzb3VyY2UuVGFza3MpIHtcblx0XHRcdFx0XHR0aGlzLmRpc2FibGVTeW5jKGVycm9yLnJlc291cmNlKTtcblx0XHRcdFx0XHRjb25zdCBzb3VyY2VBcmVhID0gZ2V0U3luY0FyZWFMYWJlbChlcnJvci5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVUb29MYXJnZUVycm9yKGVycm9yLnJlc291cmNlLCBsb2NhbGl6ZSgndG9vIGxhcmdlJywgXCJEaXNhYmxlZCBzeW5jaW5nIHswfSBiZWNhdXNlIHNpemUgb2YgdGhlIHsxfSBmaWxlIHRvIHN5bmMgaXMgbGFyZ2VyIHRoYW4gezJ9LiBQbGVhc2Ugb3BlbiB0aGUgZmlsZSBhbmQgcmVkdWNlIHRoZSBzaXplIGFuZCBlbmFibGUgc3luY1wiLCBzb3VyY2VBcmVhLnRvTG93ZXJDYXNlKCksIHNvdXJjZUFyZWEudG9Mb3dlckNhc2UoKSwgJzEwMGtiJyksIGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsVG9vTWFueVByb2ZpbGVzOlxuXHRcdFx0XHR0aGlzLmRpc2FibGVTeW5jKFN5bmNSZXNvdXJjZS5Qcm9maWxlcyk7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgndG9vIG1hbnkgcHJvZmlsZXMnLCBcIkRpc2FibGVkIHN5bmNpbmcgcHJvZmlsZXMgYmVjYXVzZSB0aGVyZSBhcmUgdG9vIG1hbnkgcHJvZmlsZXMgdG8gc3luYy4gU2V0dGluZ3MgU3luYyBzdXBwb3J0cyBzeW5jaW5nIG1heGltdW0gMjAgcHJvZmlsZXMuIFBsZWFzZSByZWR1Y2UgdGhlIG51bWJlciBvZiBwcm9maWxlcyBhbmQgZW5hYmxlIHN5bmNcIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkluY29tcGF0aWJsZUxvY2FsQ29udGVudDpcblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkdvbmU6XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5VcGdyYWRlUmVxdWlyZWQ6IHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCdlcnJvciB1cGdyYWRlIHJlcXVpcmVkJywgXCJTZXR0aW5ncyBzeW5jIGlzIGRpc2FibGVkIGJlY2F1c2UgdGhlIGN1cnJlbnQgdmVyc2lvbiAoezB9LCB7MX0pIGlzIG5vdCBjb21wYXRpYmxlIHdpdGggdGhlIHN5bmMgc2VydmljZS4gUGxlYXNlIHVwZGF0ZSBiZWZvcmUgdHVybmluZyBvbiBzeW5jLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0KTtcblx0XHRcdFx0Y29uc3Qgb3BlcmF0aW9uSWQgPSBlcnJvci5vcGVyYXRpb25JZCA/IGxvY2FsaXplKCdvcGVyYXRpb25JZCcsIFwiT3BlcmF0aW9uIElkOiB7MH1cIiwgZXJyb3Iub3BlcmF0aW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bWVzc2FnZTogb3BlcmF0aW9uSWQgPyBgJHttZXNzYWdlfSAke29wZXJhdGlvbklkfWAgOiBtZXNzYWdlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5NZXRob2ROb3RGb3VuZDoge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ21ldGhvZCBub3QgZm91bmQnLCBcIlNldHRpbmdzIHN5bmMgaXMgZGlzYWJsZWQgYmVjYXVzZSB0aGUgY2xpZW50IGlzIG1ha2luZyBpbnZhbGlkIHJlcXVlc3RzLiBQbGVhc2UgcmVwb3J0IGFuIGlzc3VlIHdpdGggdGhlIGxvZ3MuXCIpO1xuXHRcdFx0XHRjb25zdCBvcGVyYXRpb25JZCA9IGVycm9yLm9wZXJhdGlvbklkID8gbG9jYWxpemUoJ29wZXJhdGlvbklkJywgXCJPcGVyYXRpb24gSWQ6IHswfVwiLCBlcnJvci5vcGVyYXRpb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiBvcGVyYXRpb25JZCA/IGAke21lc3NhZ2V9ICR7b3BlcmF0aW9uSWR9YCA6IG1lc3NhZ2UsXG5cdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6ICdTaG93IFN5bmMgTG9ncycsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93IHN5bmMgbG9ncycsIFwiU2hvdyBMb2dcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNIT1dfU1lOQ19MT0dfQ09NTUFORF9JRClcblx0XHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRpZDogJ1JlcG9ydCBJc3N1ZScsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXBvcnQgaXNzdWUnLCBcIlJlcG9ydCBJc3N1ZVwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMud29ya2JlbmNoSXNzdWVTZXJ2aWNlLm9wZW5SZXBvcnRlcigpXG5cdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5JbmNvbXBhdGlibGVSZW1vdGVDb250ZW50OlxuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Vycm9yIHJlc2V0IHJlcXVpcmVkJywgXCJTZXR0aW5ncyBzeW5jIGlzIGRpc2FibGVkIGJlY2F1c2UgeW91ciBkYXRhIGluIHRoZSBjbG91ZCBpcyBvbGRlciB0aGFuIHRoYXQgb2YgdGhlIGNsaWVudC4gUGxlYXNlIGNsZWFyIHlvdXIgZGF0YSBpbiB0aGUgY2xvdWQgYmVmb3JlIHR1cm5pbmcgb24gc3luYy5cIiksXG5cdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6ICdyZXNldCcsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXNldCcsIFwiQ2xlYXIgRGF0YSBpbiBDbG91ZC4uLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5yZXNldFN5bmNlZERhdGEoKVxuXHRcdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiAnc2hvdyBzeW5jZWQgZGF0YScsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93IHN5bmNlZCBkYXRhIGFjdGlvbicsIFwiU2hvdyBTeW5jZWQgRGF0YVwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5zaG93U3luY0FjdGl2aXR5KClcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlNlcnZpY2VDaGFuZ2VkOlxuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRtZXNzYWdlOiB0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmU/LnR5cGUgPT09ICdpbnNpZGVycycgP1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3NlcnZpY2Ugc3dpdGNoZWQgdG8gaW5zaWRlcnMnLCBcIlNldHRpbmdzIFN5bmMgaGFzIGJlZW4gc3dpdGNoZWQgdG8gaW5zaWRlcnMgc2VydmljZVwiKSA6XG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnc2VydmljZSBzd2l0Y2hlZCB0byBzdGFibGUnLCBcIlNldHRpbmdzIFN5bmMgaGFzIGJlZW4gc3dpdGNoZWQgdG8gc3RhYmxlIHNlcnZpY2VcIiksXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybjtcblxuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuRGVmYXVsdFNlcnZpY2VDaGFuZ2VkOlxuXHRcdFx0XHQvLyBTZXR0aW5ncyBzeW5jIGlzIHVzaW5nIHNlcGFyYXRlIHNlcnZpY2Vcblx0XHRcdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3VzaW5nIHNlcGFyYXRlIHNlcnZpY2UnLCBcIlNldHRpbmdzIHN5bmMgbm93IHVzZXMgYSBzZXBhcmF0ZSBzZXJ2aWNlLCBtb3JlIGluZm9ybWF0aW9uIGlzIGF2YWlsYWJsZSBpbiB0aGUgW1NldHRpbmdzIFN5bmMgRG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXNldHRpbmdzLXN5bmMtaGVscCNfc3luY2luZy1zdGFibGUtdmVyc3VzLWluc2lkZXJzKS5cIiksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiBzZXR0aW5ncyBzeW5jIGdvdCB0dXJuZWQgb2ZmIHRoZW4gYXNrIHVzZXIgdG8gdHVybiBvbiBzeW5jIGFnYWluLlxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3NlcnZpY2UgY2hhbmdlZCBhbmQgdHVybmVkIG9mZicsIFwiU2V0dGluZ3Mgc3luYyB3YXMgdHVybmVkIG9mZiBiZWNhdXNlIHswfSBub3cgdXNlcyBhIHNlcGFyYXRlIHNlcnZpY2UuIFBsZWFzZSB0dXJuIG9uIHN5bmMgYWdhaW4uXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRwcmltYXJ5OiBbdG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdGlkOiAndHVybiBvbiBzeW5jJyxcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3R1cm4gb24gc3luYycsIFwiVHVybiBvbiBTZXR0aW5ncyBTeW5jLi4uXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy50dXJuT24oKVxuXHRcdFx0XHRcdFx0XHR9KV1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVUb29MYXJnZUVycm9yKHJlc291cmNlOiBTeW5jUmVzb3VyY2UsIG1lc3NhZ2U6IHN0cmluZywgZXJyb3I6IFVzZXJEYXRhU3luY0Vycm9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uSWQgPSBlcnJvci5vcGVyYXRpb25JZCA/IGxvY2FsaXplKCdvcGVyYXRpb25JZCcsIFwiT3BlcmF0aW9uIElkOiB7MH1cIiwgZXJyb3Iub3BlcmF0aW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0bWVzc2FnZTogb3BlcmF0aW9uSWQgPyBgJHttZXNzYWdlfSAke29wZXJhdGlvbklkfWAgOiBtZXNzYWdlLFxuXHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRwcmltYXJ5OiBbdG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiAnb3BlbiBzeW5jIGZpbGUnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb3BlbiBmaWxlJywgXCJPcGVuIHswfSBGaWxlXCIsIGdldFN5bmNBcmVhTGFiZWwocmVzb3VyY2UpKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHJlc291cmNlID09PSBTeW5jUmVzb3VyY2UuU2V0dGluZ3MgPyB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuVXNlclNldHRpbmdzKHsganNvbkVkaXRvcjogdHJ1ZSB9KSA6IHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5HbG9iYWxLZXliaW5kaW5nU2V0dGluZ3ModHJ1ZSlcblx0XHRcdFx0fSldXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGludmFsaWRDb250ZW50RXJyb3JEaXNwb3NhYmxlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSBvblN5bmNocm9uaXplckVycm9ycyhlcnJvcnM6IElVc2VyRGF0YVN5bmNSZXNvdXJjZUVycm9yW10pOiB2b2lkIHtcblx0XHRpZiAoZXJyb3JzLmxlbmd0aCkge1xuXHRcdFx0Zm9yIChjb25zdCB7IHByb2ZpbGUsIHN5bmNSZXNvdXJjZTogcmVzb3VyY2UsIGVycm9yIH0gb2YgZXJyb3JzKSB7XG5cdFx0XHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0XHRcdGNhc2UgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkxvY2FsSW52YWxpZENvbnRlbnQ6XG5cdFx0XHRcdFx0XHR0aGlzLmhhbmRsZUludmFsaWRDb250ZW50RXJyb3IoeyBwcm9maWxlLCBzeW5jUmVzb3VyY2U6IHJlc291cmNlIH0pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdFx0Y29uc3Qga2V5ID0gYCR7cHJvZmlsZS5pZH06JHtyZXNvdXJjZX1gO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuaW52YWxpZENvbnRlbnRFcnJvckRpc3Bvc2FibGVzLmdldChrZXkpO1xuXHRcdFx0XHRcdFx0aWYgKGRpc3Bvc2FibGUpIHtcblx0XHRcdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuaW52YWxpZENvbnRlbnRFcnJvckRpc3Bvc2FibGVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmludmFsaWRDb250ZW50RXJyb3JEaXNwb3NhYmxlcy5mb3JFYWNoKGRpc3Bvc2FibGUgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdFx0dGhpcy5pbnZhbGlkQ29udGVudEVycm9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUludmFsaWRDb250ZW50RXJyb3IoeyBwcm9maWxlLCBzeW5jUmVzb3VyY2U6IHNvdXJjZSB9OiBJVXNlckRhdGFTeW5jUmVzb3VyY2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlkICE9PSBwcm9maWxlLmlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IGAke3Byb2ZpbGUuaWR9OiR7c291cmNlfWA7XG5cdFx0aWYgKHRoaXMuaW52YWxpZENvbnRlbnRFcnJvckRpc3Bvc2FibGVzLmhhcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzb3VyY2UgIT09IFN5bmNSZXNvdXJjZS5TZXR0aW5ncyAmJiBzb3VyY2UgIT09IFN5bmNSZXNvdXJjZS5LZXliaW5kaW5ncyAmJiBzb3VyY2UgIT09IFN5bmNSZXNvdXJjZS5UYXNrcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuaG9zdFNlcnZpY2UuaGFzRm9jdXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5TZXR0aW5ncyA/IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlXG5cdFx0XHQ6IHNvdXJjZSA9PT0gU3luY1Jlc291cmNlLktleWJpbmRpbmdzID8gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2Vcblx0XHRcdFx0OiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUudGFza3NSZXNvdXJjZTtcblx0XHRjb25zdCBlZGl0b3JVcmkgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaSh0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0aWYgKGlzRXF1YWwocmVzb3VyY2UsIGVkaXRvclVyaSkpIHtcblx0XHRcdC8vIERvIG5vdCBzaG93IG5vdGlmaWNhdGlvbiBpZiB0aGUgZmlsZSBpbiBlcnJvciBpcyBhY3RpdmVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXJyb3JBcmVhID0gZ2V0U3luY0FyZWFMYWJlbChzb3VyY2UpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Vycm9ySW52YWxpZENvbmZpZ3VyYXRpb24nLCBcIlVuYWJsZSB0byBzeW5jIHswfSBiZWNhdXNlIHRoZSBjb250ZW50IGluIHRoZSBmaWxlIGlzIG5vdCB2YWxpZC4gUGxlYXNlIG9wZW4gdGhlIGZpbGUgYW5kIGNvcnJlY3QgaXQuXCIsIGVycm9yQXJlYS50b0xvd2VyQ2FzZSgpKSxcblx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeTogW3RvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogJ29wZW4gc3luYyBmaWxlJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ29wZW4gZmlsZScsIFwiT3BlbiB7MH0gRmlsZVwiLCBlcnJvckFyZWEpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gc291cmNlID09PSBTeW5jUmVzb3VyY2UuU2V0dGluZ3MgPyB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuVXNlclNldHRpbmdzKHsganNvbkVkaXRvcjogdHJ1ZSB9KSA6IHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5HbG9iYWxLZXliaW5kaW5nU2V0dGluZ3ModHJ1ZSlcblx0XHRcdFx0fSldXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5pbnZhbGlkQ29udGVudEVycm9yRGlzcG9zYWJsZXMuc2V0KGtleSwgdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdC8vIGNsb3NlIHRoZSBlcnJvciB3YXJuaW5nIG5vdGlmaWNhdGlvblxuXHRcdFx0aGFuZGxlLmNsb3NlKCk7XG5cdFx0XHR0aGlzLmludmFsaWRDb250ZW50RXJyb3JEaXNwb3NhYmxlcy5kZWxldGUoa2V5KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZsaWN0c0NvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5jb25mbGljdHMucmVkdWNlKChyZXN1bHQsIHsgY29uZmxpY3RzIH0pID0+IHsgcmV0dXJuIHJlc3VsdCArIGNvbmZsaWN0cy5sZW5ndGg7IH0sIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVHbG9iYWxBY3Rpdml0eUJhZGdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZ2xvYmFsQWN0aXZpdHlCYWRnZURpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdGxldCBiYWRnZTogSUJhZGdlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UuY29uZmxpY3RzLmxlbmd0aCAmJiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRiYWRnZSA9IG5ldyBOdW1iZXJCYWRnZSh0aGlzLmdldENvbmZsaWN0c0NvdW50KCksICgpID0+IGxvY2FsaXplKCdoYXMgY29uZmxpY3RzJywgXCJ7MH06IENvbmZsaWN0cyBEZXRlY3RlZFwiLCBTWU5DX1RJVExFLnZhbHVlKSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnR1cm5pbmdPblN5bmMpIHtcblx0XHRcdGJhZGdlID0gbmV3IFByb2dyZXNzQmFkZ2UoKCkgPT4gbG9jYWxpemUoJ3R1cm5pbmcgb24gc3luY2luZycsIFwiVHVybmluZyBvbiBTZXR0aW5ncyBTeW5jLi4uXCIpKTtcblx0XHR9XG5cblx0XHRpZiAoYmFkZ2UpIHtcblx0XHRcdHRoaXMuZ2xvYmFsQWN0aXZpdHlCYWRnZURpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmFjdGl2aXR5U2VydmljZS5zaG93R2xvYmFsQWN0aXZpdHkoeyBiYWRnZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUFjY291bnRCYWRnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFjY291bnRCYWRnZURpc3Bvc2FibGUuY2xlYXIoKTtcblxuXHRcdGxldCBiYWRnZTogSUJhZGdlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jU2VydmljZS5zdGF0dXMgIT09IFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCAmJiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpICYmIHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5hY2NvdW50U3RhdHVzID09PSBBY2NvdW50U3RhdHVzLlVuYXZhaWxhYmxlKSB7XG5cdFx0XHRiYWRnZSA9IG5ldyBOdW1iZXJCYWRnZSgxLCAoKSA9PiBsb2NhbGl6ZSgnc2lnbiBpbiB0byBzeW5jJywgXCJTaWduIGluIHRvIFN5bmMgU2V0dGluZ3NcIikpO1xuXHRcdH1cblxuXHRcdGlmIChiYWRnZSkge1xuXHRcdFx0dGhpcy5hY2NvdW50QmFkZ2VEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd0FjY291bnRzQWN0aXZpdHkoeyBiYWRnZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHR1cm5PbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UuYXV0aGVudGljYXRpb25Qcm92aWRlcnMubGVuZ3RoKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnbm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXJzJywgXCJObyBhdXRoZW50aWNhdGlvbiBwcm92aWRlcnMgYXJlIGF2YWlsYWJsZS5cIikpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdHVybk9uID0gYXdhaXQgdGhpcy5hc2tUb0NvbmZpZ3VyZSgpO1xuXHRcdFx0aWYgKCF0dXJuT24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZT8uY2FuU3dpdGNoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2VsZWN0U2V0dGluZ3NTeW5jU2VydmljZSh0aGlzLnVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UudXNlckRhdGFTeW5jU3RvcmUpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnR1cm5PbigpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlIGluc3RhbmNlb2YgVXNlckRhdGFTeW5jRXJyb3IpIHtcblx0XHRcdFx0c3dpdGNoIChlLmNvZGUpIHtcblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29MYXJnZTpcblx0XHRcdFx0XHRcdGlmIChlLnJlc291cmNlID09PSBTeW5jUmVzb3VyY2UuS2V5YmluZGluZ3MgfHwgZS5yZXNvdXJjZSA9PT0gU3luY1Jlc291cmNlLlNldHRpbmdzIHx8IGUucmVzb3VyY2UgPT09IFN5bmNSZXNvdXJjZS5UYXNrcykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmhhbmRsZVRvb0xhcmdlRXJyb3IoZS5yZXNvdXJjZSwgbG9jYWxpemUoJ3RvbyBsYXJnZSB3aGlsZSBzdGFydGluZyBzeW5jJywgXCJTZXR0aW5ncyBzeW5jIGNhbm5vdCBiZSB0dXJuZWQgb24gYmVjYXVzZSBzaXplIG9mIHRoZSB7MH0gZmlsZSB0byBzeW5jIGlzIGxhcmdlciB0aGFuIHsxfS4gUGxlYXNlIG9wZW4gdGhlIGZpbGUgYW5kIHJlZHVjZSB0aGUgc2l6ZSBhbmQgdHVybiBvbiBzeW5jXCIsIGdldFN5bmNBcmVhTGFiZWwoZS5yZXNvdXJjZSkudG9Mb3dlckNhc2UoKSwgJzEwMGtiJyksIGUpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5JbmNvbXBhdGlibGVMb2NhbENvbnRlbnQ6XG5cdFx0XHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuR29uZTpcblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5VcGdyYWRlUmVxdWlyZWQ6IHtcblx0XHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnZXJyb3IgdXBncmFkZSByZXF1aXJlZCB3aGlsZSBzdGFydGluZyBzeW5jJywgXCJTZXR0aW5ncyBzeW5jIGNhbm5vdCBiZSB0dXJuZWQgb24gYmVjYXVzZSB0aGUgY3VycmVudCB2ZXJzaW9uICh7MH0sIHsxfSkgaXMgbm90IGNvbXBhdGlibGUgd2l0aCB0aGUgc3luYyBzZXJ2aWNlLiBQbGVhc2UgdXBkYXRlIGJlZm9yZSB0dXJuaW5nIG9uIHN5bmMuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3BlcmF0aW9uSWQgPSBlLm9wZXJhdGlvbklkID8gbG9jYWxpemUoJ29wZXJhdGlvbklkJywgXCJPcGVyYXRpb24gSWQ6IHswfVwiLCBlLm9wZXJhdGlvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IG9wZXJhdGlvbklkID8gYCR7bWVzc2FnZX0gJHtvcGVyYXRpb25JZH1gIDogbWVzc2FnZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5JbmNvbXBhdGlibGVSZW1vdGVDb250ZW50OlxuXHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2Vycm9yIHJlc2V0IHJlcXVpcmVkIHdoaWxlIHN0YXJ0aW5nIHN5bmMnLCBcIlNldHRpbmdzIHN5bmMgY2Fubm90IGJlIHR1cm5lZCBvbiBiZWNhdXNlIHlvdXIgZGF0YSBpbiB0aGUgY2xvdWQgaXMgb2xkZXIgdGhhbiB0aGF0IG9mIHRoZSBjbGllbnQuIFBsZWFzZSBjbGVhciB5b3VyIGRhdGEgaW4gdGhlIGNsb3VkIGJlZm9yZSB0dXJuaW5nIG9uIHN5bmMuXCIpLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZDogJ3Jlc2V0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXNldCcsIFwiQ2xlYXIgRGF0YSBpbiBDbG91ZC4uLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UucmVzZXRTeW5jZWREYXRhKClcblx0XHRcdFx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZDogJ3Nob3cgc3luY2VkIGRhdGEnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Nob3cgc3luY2VkIGRhdGEgYWN0aW9uJywgXCJTaG93IFN5bmNlZCBEYXRhXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5zaG93U3luY0FjdGl2aXR5KClcblx0XHRcdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5VbmF1dGhvcml6ZWQ6XG5cdFx0XHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuRm9yYmlkZGVuOlxuXHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdhdXRoIGZhaWxlZCcsIFwiRXJyb3Igd2hpbGUgdHVybmluZyBvbiBTZXR0aW5ncyBTeW5jOiBBdXRoZW50aWNhdGlvbiBmYWlsZWQuXCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3R1cm4gb24gZmFpbGVkIHdpdGggdXNlciBkYXRhIHN5bmMgZXJyb3InLCBcIkVycm9yIHdoaWxlIHR1cm5pbmcgb24gU2V0dGluZ3MgU3luYy4gUGxlYXNlIGNoZWNrIFtsb2dzXSh7MH0pIGZvciBtb3JlIGRldGFpbHMuXCIsIGBjb21tYW5kOiR7U0hPV19TWU5DX0xPR19DT01NQU5EX0lEfWApKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSh7IGtleTogJ3R1cm4gb24gZmFpbGVkJywgY29tbWVudDogWydTdWJzdGl0dXRpb24gaXMgZm9yIGVycm9yIHJlYXNvbiddIH0sIFwiRXJyb3Igd2hpbGUgdHVybmluZyBvbiBTZXR0aW5ncyBTeW5jLiB7MH1cIiwgZ2V0RXJyb3JNZXNzYWdlKGUpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhc2tUb0NvbmZpZ3VyZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4oKGMsIGUpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBxdWlja1BpY2sgPSB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxDb25maWd1cmVTeW5jUXVpY2tQaWNrSXRlbT4oKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2spO1xuXHRcdFx0cXVpY2tQaWNrLnRpdGxlID0gU1lOQ19USVRMRS52YWx1ZTtcblx0XHRcdHF1aWNrUGljay5vayA9IGZhbHNlO1xuXHRcdFx0cXVpY2tQaWNrLmN1c3RvbUJ1dHRvbiA9IHRydWU7XG5cdFx0XHRxdWlja1BpY2suY3VzdG9tTGFiZWwgPSBsb2NhbGl6ZSgnc2lnbiBpbiBhbmQgdHVybiBvbicsIFwiU2lnbiBpblwiKTtcblx0XHRcdHF1aWNrUGljay5kZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdjb25maWd1cmUgYW5kIHR1cm4gb24gc3luYyBkZXRhaWwnLCBcIlBsZWFzZSBzaWduIGluIHRvIGJhY2t1cCBhbmQgc3luYyB5b3VyIGRhdGEgYWNyb3NzIGRldmljZXMuXCIpO1xuXHRcdFx0cXVpY2tQaWNrLmNhblNlbGVjdE1hbnkgPSB0cnVlO1xuXHRcdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRcdHF1aWNrUGljay5oaWRlSW5wdXQgPSB0cnVlO1xuXHRcdFx0cXVpY2tQaWNrLmhpZGVDaGVja0FsbCA9IHRydWU7XG5cblx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRDb25maWd1cmVTeW5jUXVpY2tQaWNrSXRlbXMoKTtcblx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0cXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzUmVzb3VyY2VFbmFibGVkKGl0ZW0uaWQsIHRydWUpKTtcblx0XHRcdGxldCBhY2NlcHRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueShxdWlja1BpY2sub25EaWRBY2NlcHQsIHF1aWNrUGljay5vbkRpZEN1c3RvbSkoKCkgPT4ge1xuXHRcdFx0XHRhY2NlcHRlZCA9IHRydWU7XG5cdFx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKGFjY2VwdGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZ3VyYXRpb24oaXRlbXMsIHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YyhhY2NlcHRlZCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0ZShlcnJvcik7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maWd1cmVTeW5jUXVpY2tQaWNrSXRlbXMoKTogQ29uZmlndXJlU3luY1F1aWNrUGlja0l0ZW1bXSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gW3tcblx0XHRcdGlkOiBTeW5jUmVzb3VyY2UuU2V0dGluZ3MsXG5cdFx0XHRsYWJlbDogZ2V0U3luY0FyZWFMYWJlbChTeW5jUmVzb3VyY2UuU2V0dGluZ3MpXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFN5bmNSZXNvdXJjZS5LZXliaW5kaW5ncyxcblx0XHRcdGxhYmVsOiBnZXRTeW5jQXJlYUxhYmVsKFN5bmNSZXNvdXJjZS5LZXliaW5kaW5ncyksXG5cdFx0fSwge1xuXHRcdFx0aWQ6IFN5bmNSZXNvdXJjZS5TbmlwcGV0cyxcblx0XHRcdGxhYmVsOiBnZXRTeW5jQXJlYUxhYmVsKFN5bmNSZXNvdXJjZS5TbmlwcGV0cylcblx0XHR9LCB7XG5cdFx0XHRpZDogU3luY1Jlc291cmNlLlRhc2tzLFxuXHRcdFx0bGFiZWw6IGdldFN5bmNBcmVhTGFiZWwoU3luY1Jlc291cmNlLlRhc2tzKVxuXHRcdH0sIHtcblx0XHRcdGlkOiBTeW5jUmVzb3VyY2UuTWNwLFxuXHRcdFx0bGFiZWw6IGdldFN5bmNBcmVhTGFiZWwoU3luY1Jlc291cmNlLk1jcClcblx0XHR9LCB7XG5cdFx0XHRpZDogU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlLFxuXHRcdFx0bGFiZWw6IGdldFN5bmNBcmVhTGFiZWwoU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlKSxcblx0XHR9LCB7XG5cdFx0XHRpZDogU3luY1Jlc291cmNlLkV4dGVuc2lvbnMsXG5cdFx0XHRsYWJlbDogZ2V0U3luY0FyZWFMYWJlbChTeW5jUmVzb3VyY2UuRXh0ZW5zaW9ucylcblx0XHR9LCB7XG5cdFx0XHRpZDogU3luY1Jlc291cmNlLlByb2ZpbGVzLFxuXHRcdFx0bGFiZWw6IGdldFN5bmNBcmVhTGFiZWwoU3luY1Jlc291cmNlLlByb2ZpbGVzKSxcblx0XHR9LCB7XG5cdFx0XHRpZDogU3luY1Jlc291cmNlLlByb21wdHMsXG5cdFx0XHRsYWJlbDogZ2V0U3luY0FyZWFMYWJlbChTeW5jUmVzb3VyY2UuUHJvbXB0cylcblx0XHR9XTtcblxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmlndXJhdGlvbihpdGVtczogQ29uZmlndXJlU3luY1F1aWNrUGlja0l0ZW1bXSwgc2VsZWN0ZWRJdGVtczogUmVhZG9ubHlBcnJheTxDb25maWd1cmVTeW5jUXVpY2tQaWNrSXRlbT4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGNvbnN0IHdhc0VuYWJsZWQgPSB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzUmVzb3VyY2VFbmFibGVkKGl0ZW0uaWQpO1xuXHRcdFx0Y29uc3QgaXNFbmFibGVkID0gISFzZWxlY3RlZEl0ZW1zLmZpbHRlcihzZWxlY3RlZCA9PiBzZWxlY3RlZC5pZCA9PT0gaXRlbS5pZClbMF07XG5cdFx0XHRpZiAod2FzRW5hYmxlZCAhPT0gaXNFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uuc2V0UmVzb3VyY2VFbmFibGVtZW50KGl0ZW0uaWQsIGlzRW5hYmxlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maWd1cmVTeW5jT3B0aW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKGMsIGUpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBxdWlja1BpY2sgPSB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxDb25maWd1cmVTeW5jUXVpY2tQaWNrSXRlbT4oKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2spO1xuXHRcdFx0cXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoJ2NvbmZpZ3VyZSBzeW5jIHRpdGxlJywgXCJ7MH06IENvbmZpZ3VyZS4uLlwiLCBTWU5DX1RJVExFLnZhbHVlKTtcblx0XHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdjb25maWd1cmUgc3luYyBwbGFjZWhvbGRlcicsIFwiQ2hvb3NlIHdoYXQgdG8gc3luY1wiKTtcblx0XHRcdHF1aWNrUGljay5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRcdHF1aWNrUGljay5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0XHRxdWlja1BpY2sub2sgPSB0cnVlO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldENvbmZpZ3VyZVN5bmNRdWlja1BpY2tJdGVtcygpO1xuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyA9IGl0ZW1zLmZpbHRlcihpdGVtID0+IHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNSZXNvdXJjZUVuYWJsZWQoaXRlbS5pZCkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmIChxdWlja1BpY2suc2VsZWN0ZWRJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZ3VyYXRpb24oaXRlbXMsIHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zKTtcblx0XHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0YygpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHVybk9mZigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndHVybiBvZmYgc3luYyBjb25maXJtYXRpb24nLCBcIkRvIHlvdSB3YW50IHRvIHR1cm4gb2ZmIHN5bmM/XCIpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgndHVybiBvZmYgc3luYyBkZXRhaWwnLCBcIllvdXIgc2V0dGluZ3MsIGtleWJpbmRpbmdzLCBleHRlbnNpb25zLCBzbmlwcGV0cyBhbmQgVUkgU3RhdGUgd2lsbCBubyBsb25nZXIgYmUgc3luY2VkLlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAndHVybiBvZmYnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUdXJuIG9mZlwiKSxcblx0XHRcdGNoZWNrYm94OiB0aGlzLnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UuYWNjb3VudFN0YXR1cyA9PT0gQWNjb3VudFN0YXR1cy5BdmFpbGFibGUgPyB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndHVybiBvZmYgc3luYyBldmVyeXdoZXJlJywgXCJUdXJuIG9mZiBzeW5jIG9uIGFsbCB5b3VyIGRldmljZXMgYW5kIGNsZWFyIHRoZSBkYXRhIGZyb20gdGhlIGNsb3VkLlwiKVxuXHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHRcdGlmIChyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnR1cm5vZmYoISFyZXN1bHQuY2hlY2tib3hDaGVja2VkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRpc2FibGVTeW5jKHNvdXJjZTogU3luY1Jlc291cmNlKTogdm9pZCB7XG5cdFx0c3dpdGNoIChzb3VyY2UpIHtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlNldHRpbmdzOiByZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5zZXRSZXNvdXJjZUVuYWJsZW1lbnQoU3luY1Jlc291cmNlLlNldHRpbmdzLCBmYWxzZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5LZXliaW5kaW5nczogcmV0dXJuIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uuc2V0UmVzb3VyY2VFbmFibGVtZW50KFN5bmNSZXNvdXJjZS5LZXliaW5kaW5ncywgZmFsc2UpO1xuXHRcdFx0Y2FzZSBTeW5jUmVzb3VyY2UuU25pcHBldHM6IHJldHVybiB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLnNldFJlc291cmNlRW5hYmxlbWVudChTeW5jUmVzb3VyY2UuU25pcHBldHMsIGZhbHNlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLlRhc2tzOiByZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5zZXRSZXNvdXJjZUVuYWJsZW1lbnQoU3luY1Jlc291cmNlLlRhc2tzLCBmYWxzZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5FeHRlbnNpb25zOiByZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5zZXRSZXNvdXJjZUVuYWJsZW1lbnQoU3luY1Jlc291cmNlLkV4dGVuc2lvbnMsIGZhbHNlKTtcblx0XHRcdGNhc2UgU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlOiByZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5zZXRSZXNvdXJjZUVuYWJsZW1lbnQoU3luY1Jlc291cmNlLkdsb2JhbFN0YXRlLCBmYWxzZSk7XG5cdFx0XHRjYXNlIFN5bmNSZXNvdXJjZS5Qcm9maWxlczogcmV0dXJuIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2Uuc2V0UmVzb3VyY2VFbmFibGVtZW50KFN5bmNSZXNvdXJjZS5Qcm9maWxlcywgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd1N5bmNBY3Rpdml0eSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5vdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKFVTRVJfREFUQV9TWU5DX0xPR19JRCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlbGVjdFNldHRpbmdzU3luY1NlcnZpY2UodXNlckRhdGFTeW5jU3RvcmU6IElVc2VyRGF0YVN5bmNTdG9yZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazx7IGlkOiBVc2VyRGF0YVN5bmNTdG9yZVR5cGU7IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH0+KCkpO1xuXHRcdFx0cXVpY2tQaWNrLnRpdGxlID0gbG9jYWxpemUoJ3N3aXRjaFN5bmNTZXJ2aWNlLnRpdGxlJywgXCJ7MH06IFNlbGVjdCBTZXJ2aWNlXCIsIFNZTkNfVElUTEUudmFsdWUpO1xuXHRcdFx0cXVpY2tQaWNrLmRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3N3aXRjaFN5bmNTZXJ2aWNlLmRlc2NyaXB0aW9uJywgXCJFbnN1cmUgeW91IGFyZSB1c2luZyB0aGUgc2FtZSBzZXR0aW5ncyBzeW5jIHNlcnZpY2Ugd2hlbiBzeW5jaW5nIHdpdGggbXVsdGlwbGUgZW52aXJvbm1lbnRzXCIpO1xuXHRcdFx0cXVpY2tQaWNrLmhpZGVJbnB1dCA9IHRydWU7XG5cdFx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgZ2V0RGVzY3JpcHRpb24gPSAodXJsOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRjb25zdCBpc0RlZmF1bHQgPSBpc0VxdWFsKHVybCwgdXNlckRhdGFTeW5jU3RvcmUuZGVmYXVsdFVybCk7XG5cdFx0XHRcdGlmIChpc0RlZmF1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2RlZmF1bHQnLCBcIkRlZmF1bHRcIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH07XG5cdFx0XHRxdWlja1BpY2suaXRlbXMgPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2luc2lkZXJzJyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc2lkZXJzJywgXCJJbnNpZGVyc1wiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZ2V0RGVzY3JpcHRpb24odXNlckRhdGFTeW5jU3RvcmUuaW5zaWRlcnNVcmwpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3N0YWJsZScsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzdGFibGUnLCBcIlN0YWJsZVwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZ2V0RGVzY3JpcHRpb24odXNlckRhdGFTeW5jU3RvcmUuc3RhYmxlVXJsKVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnN3aXRjaChxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXS5pZCk7XG5cdFx0XHRcdFx0YygpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdGUoZXJyb3IpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3Rpb25zKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmNhblRvZ2dsZUVuYWJsZW1lbnQoKSkge1xuXHRcdFx0dGhpcy5yZWdpc3RlclR1cm5PblN5bmNBY3Rpb24oKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJUdXJuT2ZmU3luY0FjdGlvbigpO1xuXHRcdH1cblx0XHR0aGlzLnJlZ2lzdGVyVHVybmluZ09uU3luY0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJDYW5jZWxUdXJuT25TeW5jQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlclNpZ25JbkFjdGlvbigpOyAvLyBXaGVuIFN5bmMgaXMgdHVybmVkIG9uIGZyb20gQ0xJXG5cdFx0dGhpcy5yZWdpc3RlclNob3dDb25mbGljdHNBY3Rpb24oKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJFbmFibGVTeW5jVmlld3NBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyTWFuYWdlU3luY0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJTeW5jTm93QWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlckNvbmZpZ3VyZVN5bmNBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyU2hvd1NldHRpbmdzQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlckhlbHBBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyU2hvd0xvZ0FjdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJSZXNldFN5bmNEYXRhQWN0aW9uKCk7XG5cdFx0dGhpcy5yZWdpc3RlckFjY2VwdE1lcmdlc0FjdGlvbigpO1xuXG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyRG93bmxvYWRTeW5jQWN0aXZpdHlBY3Rpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVHVybk9uU3luY0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCB3aGVuID0gQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1lOQ19TVEFURS5ub3RFcXVhbHNUbyhTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpLCBDT05URVhUX1NZTkNfRU5BQkxFTUVOVC50b05lZ2F0ZWQoKSwgQ09OVEVYVF9UVVJOSU5HX09OX1NUQVRFLm5lZ2F0ZSgpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgVHVybmluZ09uU3luY0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy50dXJuT24nLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dsb2JhbCBhY3Rpdml0eSB0dXJuIG9uIHN5bmMnLCAnQmFja3VwIGFuZCBTeW5jIFNldHRpbmdzLi4uJyksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFNZTkNfVElUTEUsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiB3aGVuLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRncm91cDogJzNfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkdsb2JhbEFjdGl2aXR5LFxuXHRcdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0Z3JvdXA6ICczX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LFxuXHRcdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0Z3JvdXA6ICcxX3NldHRpbmdzJyxcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQWNjb3VudHNDb250ZXh0LFxuXHRcdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHJldHVybiB0aGF0LnR1cm5PbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJUdXJuaW5nT25TeW5jQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TWU5DX1NUQVRFLm5vdEVxdWFsc1RvKFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCksIENPTlRFWFRfU1lOQ19FTkFCTEVNRU5ULnRvTmVnYXRlZCgpLCBDT05URVhUX1RVUk5JTkdfT05fU1RBVEUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUdXJuaW5nT25TeW5jQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLnVzZXJEYXRhLmFjdGlvbnMudHVybmluZ09uJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3R1cm5pbmcgb24gc3luYycsIFwiVHVybmluZyBvbiBTZXR0aW5ncyBTeW5jLi4uXCIpLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZmFsc2UoKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0Z3JvdXA6ICczX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5HbG9iYWxBY3Rpdml0eSxcblx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGdyb3VwOiAnMV9zZXR0aW5ncycsXG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkFjY291bnRzQ29udGV4dCxcblx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ2FuY2VsVHVybk9uU3luY0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgVHVybmluZ09uU3luY0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC51c2VyRGF0YS5hY3Rpb25zLmNhbmNlbFR1cm5PbicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjYW5jZWwgdHVybmluZyBvbiBzeW5jJywgXCJDYW5jZWxcIiksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zdG9wQ2lyY2xlLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfVFVSTklOR19PTl9TVEFURSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyJywgU1lOQ19WSUVXX0NPTlRBSU5FUl9JRCkpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0cmV0dXJuIHRoYXQudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS50dXJub2ZmKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2lnbkluQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IGlkID0gJ3dvcmtiZW5jaC51c2VyRGF0YS5hY3Rpb25zLnNpZ25pbic7XG5cdFx0Y29uc3Qgd2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NZTkNfU1RBVEUubm90RXF1YWxzVG8oU3luY1N0YXR1cy5VbmluaXRpYWxpemVkKSwgQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQsIENPTlRFWFRfQUNDT1VOVF9TVEFURS5pc0VxdWFsVG8oQWNjb3VudFN0YXR1cy5VbmF2YWlsYWJsZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTdG9wU3luY0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC51c2VyRGF0YS5hY3Rpb25zLnNpZ25pbicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaWduIGluIGdsb2JhbCcsIFwiU2lnbiBpbiB0byBTeW5jIFNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGdyb3VwOiAnM19jb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuR2xvYmFsQWN0aXZpdHksXG5cdFx0XHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoYXQudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5zaWduSW4oKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHRoYXQubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkFjY291bnRzQ29udGV4dCwge1xuXHRcdFx0Z3JvdXA6ICcxX3NldHRpbmdzJyxcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2lnbiBpbiBhY2NvdW50cycsIFwiU2lnbiBpbiB0byBTeW5jIFNldHRpbmdzICgxKVwiKSxcblx0XHRcdH0sXG5cdFx0XHR3aGVuXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTaG93Q29uZmxpY3RzVGl0bGUoKTogSUxvY2FsaXplZFN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplMigncmVzb2x2ZUNvbmZsaWN0c19nbG9iYWwnLCBcIlNob3cgQ29uZmxpY3RzICh7MH0pXCIsIHRoaXMuZ2V0Q29uZmxpY3RzQ291bnQoKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbmZsaWN0c0FjdGlvbkRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVnaXN0ZXJTaG93Q29uZmxpY3RzQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuY29uZmxpY3RzQWN0aW9uRGlzcG9zYWJsZS52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLmNvbmZsaWN0c0FjdGlvbkRpc3Bvc2FibGUudmFsdWUgPSByZWdpc3RlckFjdGlvbjIoY2xhc3MgVHVybmluZ09uU3luY0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogc2hvd0NvbmZsaWN0c0NvbW1hbmRJZCxcblx0XHRcdFx0XHRnZXQgdGl0bGUoKSB7IHJldHVybiB0aGF0LmdldFNob3dDb25mbGljdHNUaXRsZSgpOyB9LFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBTWU5DX1RJVExFLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9IQVNfQ09ORkxJQ1RTLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRncm91cDogJzNfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkdsb2JhbEFjdGl2aXR5LFxuXHRcdFx0XHRcdFx0d2hlbjogQ09OVEVYVF9IQVNfQ09ORkxJQ1RTLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRncm91cDogJzNfY29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJQcmVmZXJlbmNlc01lbnUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDT05URVhUX0hBU19DT05GTElDVFMsXG5cdFx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnNob3dDb25mbGljdHMoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNYW5hZ2VTeW5jQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQsIENPTlRFWFRfQUNDT1VOVF9TVEFURS5ub3RFcXVhbHNUbyhBY2NvdW50U3RhdHVzLlVuYXZhaWxhYmxlKSwgQ09OVEVYVF9TWU5DX1NUQVRFLm5vdEVxdWFsc1RvKFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTeW5jU3RhdHVzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLnVzZXJEYXRhU3luYy5hY3Rpb25zLm1hbmFnZScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzeW5jIGlzIG9uJywgXCJTZXR0aW5ncyBTeW5jIGlzIE9uXCIpLFxuXHRcdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlUcnVlRXhwci5JTlNUQU5DRSxcblx0XHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuR2xvYmFsQWN0aXZpdHksXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnM19jb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0d2hlbixcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhclByZWZlcmVuY2VzTWVudSxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICczX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQWNjb3VudHNDb250ZXh0LFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzFfc2V0dGluZ3MnLFxuXHRcdFx0XHRcdFx0XHR3aGVuLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdW5rbm93biB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHRjb25zdCBxdWlja1BpY2sgPSBxdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2soeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2spO1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW1zOiBBcnJheTxRdWlja1BpY2tJdGVtPiA9IFtdO1xuXHRcdFx0XHRcdGlmICh0aGF0LnVzZXJEYXRhU3luY1NlcnZpY2UuY29uZmxpY3RzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0aXRlbXMucHVzaCh7IGlkOiBzaG93Q29uZmxpY3RzQ29tbWFuZElkLCBsYWJlbDogYCR7U1lOQ19USVRMRS52YWx1ZX06ICR7dGhhdC5nZXRTaG93Q29uZmxpY3RzVGl0bGUoKS5vcmlnaW5hbH1gIH0pO1xuXHRcdFx0XHRcdFx0aXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgaWQ6IGNvbmZpZ3VyZVN5bmNDb21tYW5kLmlkLCBsYWJlbDogYCR7U1lOQ19USVRMRS52YWx1ZX06ICR7Y29uZmlndXJlU3luY0NvbW1hbmQudGl0bGUub3JpZ2luYWx9YCB9KTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgaWQ6IHNob3dTeW5jU2V0dGluZ3NDb21tYW5kLmlkLCBsYWJlbDogYCR7U1lOQ19USVRMRS52YWx1ZX06ICR7c2hvd1N5bmNTZXR0aW5nc0NvbW1hbmQudGl0bGUub3JpZ2luYWx9YCB9KTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgaWQ6IHNob3dTeW5jZWREYXRhQ29tbWFuZC5pZCwgbGFiZWw6IGAke1NZTkNfVElUTEUudmFsdWV9OiAke3Nob3dTeW5jZWREYXRhQ29tbWFuZC50aXRsZS5vcmlnaW5hbH1gIH0pO1xuXHRcdFx0XHRcdGl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgaWQ6IHN5bmNOb3dDb21tYW5kLmlkLCBsYWJlbDogYCR7U1lOQ19USVRMRS52YWx1ZX06ICR7c3luY05vd0NvbW1hbmQudGl0bGUub3JpZ2luYWx9YCwgZGVzY3JpcHRpb246IHN5bmNOb3dDb21tYW5kLmRlc2NyaXB0aW9uKHRoYXQudXNlckRhdGFTeW5jU2VydmljZSkgfSk7XG5cdFx0XHRcdFx0aWYgKHRoYXQudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuY2FuVG9nZ2xlRW5hYmxlbWVudCgpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhY2NvdW50ID0gdGhhdC51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLmN1cnJlbnQ7XG5cdFx0XHRcdFx0XHRpdGVtcy5wdXNoKHsgaWQ6IHR1cm5PZmZTeW5jQ29tbWFuZC5pZCwgbGFiZWw6IGAke1NZTkNfVElUTEUudmFsdWV9OiAke3R1cm5PZmZTeW5jQ29tbWFuZC50aXRsZS5vcmlnaW5hbH1gLCBkZXNjcmlwdGlvbjogYWNjb3VudCA/IGAke2FjY291bnQuYWNjb3VudE5hbWV9ICgke3RoYXQuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKGFjY291bnQuYXV0aGVudGljYXRpb25Qcm92aWRlcklkKS5sYWJlbH0pYCA6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0gJiYgcXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0uaWQpIHtcblx0XHRcdFx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXNbMF0uaWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0YygpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRW5hYmxlU3luY1ZpZXdzQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9BQ0NPVU5UX1NUQVRFLmlzRXF1YWxUbyhBY2NvdW50U3RhdHVzLkF2YWlsYWJsZSksIENPTlRFWFRfU1lOQ19TVEFURS5ub3RFcXVhbHNUbyhTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU3luY1N0YXR1c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogc2hvd1N5bmNlZERhdGFDb21tYW5kLmlkLFxuXHRcdFx0XHRcdHRpdGxlOiBzaG93U3luY2VkRGF0YUNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFNZTkNfVElUTEUsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiB3aGVuLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnNob3dTeW5jQWN0aXZpdHkoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU3luY05vd0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU3luY05vd0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogc3luY05vd0NvbW1hbmQuaWQsXG5cdFx0XHRcdFx0dGl0bGU6IHN5bmNOb3dDb21tYW5kLnRpdGxlLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBTWU5DX1RJVExFLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQsIENPTlRFWFRfQUNDT1VOVF9TVEFURS5pc0VxdWFsVG8oQWNjb3VudFN0YXR1cy5BdmFpbGFibGUpLCBDT05URVhUX1NZTkNfU1RBVEUubm90RXF1YWxzVG8oU3luY1N0YXR1cy5VbmluaXRpYWxpemVkKSlcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHJldHVybiB0aGF0LnVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2Uuc3luY05vdygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJUdXJuT2ZmU3luY0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU3RvcFN5bmNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IHR1cm5PZmZTeW5jQ29tbWFuZC5pZCxcblx0XHRcdFx0XHR0aXRsZTogdHVybk9mZlN5bmNDb21tYW5kLnRpdGxlLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBTWU5DX1RJVExFLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TWU5DX1NUQVRFLm5vdEVxdWFsc1RvKFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCksIENPTlRFWFRfU1lOQ19FTkFCTEVNRU5UKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGF0LnR1cm5PZmYoKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRcdFx0dGhhdC5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCd0dXJuIG9mZiBmYWlsZWQnLCBcIkVycm9yIHdoaWxlIHR1cm5pbmcgb2ZmIFNldHRpbmdzIFN5bmMuIFBsZWFzZSBjaGVjayBbbG9nc10oezB9KSBmb3IgbW9yZSBkZXRhaWxzLlwiLCBgY29tbWFuZDoke1NIT1dfU1lOQ19MT0dfQ09NTUFORF9JRH1gKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbmZpZ3VyZVN5bmNBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3Qgd2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NZTkNfU1RBVEUubm90RXF1YWxzVG8oU3luY1N0YXR1cy5VbmluaXRpYWxpemVkKSwgQ09OVEVYVF9TWU5DX0VOQUJMRU1FTlQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb25maWd1cmVTeW5jQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBjb25maWd1cmVTeW5jQ29tbWFuZC5pZCxcblx0XHRcdFx0XHR0aXRsZTogY29uZmlndXJlU3luY0NvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFNZTkNfVElUTEUsXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5zZXR0aW5nc0dlYXIsXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NvbmZpZ3VyZScsIFwiQ29uZmlndXJlLi4uXCIpLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlblxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1lOQ19FTkFCTEVNRU5ULCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXInLCBTWU5DX1ZJRVdfQ09OVEFJTkVSX0lEKSksXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bigpOiB1bmtub3duIHsgcmV0dXJuIHRoYXQuY29uZmlndXJlU3luY09wdGlvbnMoKTsgfVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTaG93TG9nQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93U3luY0FjdGl2aXR5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBTSE9XX1NZTkNfTE9HX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93IHN5bmMgbG9nIHRpdGxlJywgXCJ7MH06IFNob3cgTG9nXCIsIFNZTkNfVElUTEUudmFsdWUpLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzaG93IHN5bmMgbG9nIHRvb2xyaXAnLCBcIlNob3cgTG9nXCIpLFxuXHRcdFx0XHRcdGljb246IENvZGljb24ub3V0cHV0LFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfU1lOQ19TVEFURS5ub3RFcXVhbHNUbyhTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpKSxcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFNZTkNfVklFV19DT05UQUlORVJfSUQpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKCk6IHVua25vd24geyByZXR1cm4gdGhhdC5zaG93U3luY0FjdGl2aXR5KCk7IH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU2hvd1NldHRpbmdzQWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93U3luY1NldHRpbmdzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBzaG93U3luY1NldHRpbmdzQ29tbWFuZC5pZCxcblx0XHRcdFx0XHR0aXRsZTogc2hvd1N5bmNTZXR0aW5nc0NvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IFNZTkNfVElUTEUsXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX1NZTkNfU1RBVEUubm90RXF1YWxzVG8oU3luY1N0YXR1cy5VbmluaXRpYWxpemVkKSksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5Vc2VyU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgcXVlcnk6ICdAdGFnOnN5bmMnIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJIZWxwQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBIZWxwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLnVzZXJEYXRhU3luYy5hY3Rpb25zLmhlbHAnLFxuXHRcdFx0XHRcdHRpdGxlOiBTWU5DX1RJVExFLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkhlbHAsXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9TWU5DX1NUQVRFLm5vdEVxdWFsc1RvKFN5bmNTdGF0dXMuVW5pbml0aWFsaXplZCkpLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bigpOiB1bmtub3duIHsgcmV0dXJuIHRoYXQub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSgnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXNldHRpbmdzLXN5bmMtaGVscCcpKTsgfVxuXHRcdH0pKTtcblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy5oZWxwJyxcblx0XHRcdFx0dGl0bGU6IENhdGVnb3JpZXMuSGVscC52YWx1ZVxuXHRcdFx0fSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFNZTkNfVklFV19DT05UQUlORVJfSUQpLFxuXHRcdFx0Z3JvdXA6ICcxX2hlbHAnLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjY2VwdE1lcmdlc0FjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgQWNjZXB0TWVyZ2VzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLnVzZXJEYXRhU3luYy5hY3Rpb25zLmFjY2VwdE1lcmdlcycsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb21wbGV0ZSBtZXJnZXMgdGl0bGUnLCBcIkNvbXBsZXRlIE1lcmdlXCIpLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRlbnQsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoY3R4SXNNZXJnZVJlc3VsdEVkaXRvciwgQ29udGV4dEtleUV4cHIucmVnZXgoY3R4TWVyZ2VCYXNlVXJpLmtleSwgbmV3IFJlZ0V4cChgXiR7VVNFUl9EQVRBX1NZTkNfU0NIRU1FfTpgKSkpLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBwcmV2aWV3UmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRGaWxlU2VydmljZSk7XG5cdFx0XHRcdGF3YWl0IHRleHRGaWxlU2VydmljZS5zYXZlKHByZXZpZXdSZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0ZXh0RmlsZVNlcnZpY2UucmVhZChwcmV2aWV3UmVzb3VyY2UpO1xuXHRcdFx0XHRhd2FpdCB0aGF0LnVzZXJEYXRhU3luY1NlcnZpY2UuYWNjZXB0KHRoaXMuZ2V0U3luY1Jlc291cmNlKHByZXZpZXdSZXNvdXJjZSksIHByZXZpZXdSZXNvdXJjZSwgY29udGVudC52YWx1ZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdHByaXZhdGUgZ2V0U3luY1Jlc291cmNlKHByZXZpZXdSZXNvdXJjZTogVVJJKTogSVVzZXJEYXRhU3luY1Jlc291cmNlIHtcblx0XHRcdFx0Y29uc3QgY29uZmxpY3QgPSB0aGF0LnVzZXJEYXRhU3luY1NlcnZpY2UuY29uZmxpY3RzLmZpbmQoKHsgY29uZmxpY3RzIH0pID0+IGNvbmZsaWN0cy5zb21lKGNvbmZsaWN0ID0+IGlzRXF1YWwoY29uZmxpY3QucHJldmlld1Jlc291cmNlLCBwcmV2aWV3UmVzb3VyY2UpKSk7XG5cdFx0XHRcdGlmIChjb25mbGljdCkge1xuXHRcdFx0XHRcdHJldHVybiBjb25mbGljdDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcmVzb3VyY2U6ICR7cHJldmlld1Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckRvd25sb2FkU3luY0FjdGl2aXR5QWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBEb3dubG9hZFN5bmNBY3Rpdml0eUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKERPV05MT0FEX0FDVElWSVRZX0FDVElPTl9ERVNDUklQVE9SKTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UuZG93bmxvYWRTeW5jQWN0aXZpdHkoKTtcblx0XHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhsb2NhbGl6ZSgnZG93bmxvYWQgc3luYyBhY3Rpdml0eSBjb21wbGV0ZScsIFwiU3VjY2Vzc2Z1bGx5IGRvd25sb2FkZWQgU2V0dGluZ3MgU3luYyBhY3Rpdml0eS5cIikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlld3MoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5yZWdpc3RlclZpZXdDb250YWluZXIoKTtcblx0XHR0aGlzLnJlZ2lzdGVyRGF0YVZpZXdzKGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlld0NvbnRhaW5lcigpOiBWaWV3Q29udGFpbmVyIHtcblx0XHRyZXR1cm4gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogU1lOQ19WSUVXX0NPTlRBSU5FUl9JRCxcblx0XHRcdFx0dGl0bGU6IFNZTkNfVElUTEUsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoXG5cdFx0XHRcdFx0Vmlld1BhbmVDb250YWluZXIsXG5cdFx0XHRcdFx0W1NZTkNfVklFV19DT05UQUlORVJfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH1dXG5cdFx0XHRcdCksXG5cdFx0XHRcdGljb246IFNZTkNfVklFV19JQ09OLFxuXHRcdFx0XHRoaWRlSWZFbXB0eTogdHJ1ZSxcblx0XHRcdH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJSZXNldFN5bmNEYXRhQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb25zLnN5bmNEYXRhLnJlc2V0Jyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb25zLnN5bmNEYXRhLnJlc2V0JywgXCJDbGVhciBEYXRhIGluIENsb3VkLi4uXCIpLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsIFNZTkNfVklFV19DT05UQUlORVJfSUQpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcwX2NvbmZpZ3VyZScsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKCk6IHVua25vd24geyByZXR1cm4gdGhhdC51c2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLnJlc2V0U3luY2VkRGF0YSgpOyB9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckRhdGFWaWV3cyhjb250YWluZXI6IFZpZXdDb250YWluZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJEYXRhU3luY0RhdGFWaWV3cywgY29udGFpbmVyKSk7XG5cdH1cblxufVxuXG5jbGFzcyBVc2VyRGF0YVJlbW90ZUNvbnRlbnRQcm92aWRlciBpbXBsZW1lbnRzIElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFTeW5jU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1NlcnZpY2U6IElVc2VyRGF0YVN5bmNTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdHByb3ZpZGVUZXh0Q29udGVudCh1cmk6IFVSSSk6IFByb21pc2U8SVRleHRNb2RlbD4gfCBudWxsIHtcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gVVNFUl9EQVRBX1NZTkNfU0NIRU1FKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLnJlc29sdmVDb250ZW50KHVyaSkudGhlbihjb250ZW50ID0+IHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKGNvbnRlbnQgfHwgJycsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQoJ2pzb25jJyksIHVyaSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQiwyQkFBMkI7QUFDckQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxpQkFBaUIsbUJBQW1CLG9CQUFpQztBQUMxRixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBR3BCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQW9DLHlCQUF5QjtBQUM3RCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsUUFBUSxjQUFjLGlCQUFpQixlQUFlO0FBQy9ELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCLG9CQUFpQyxvQkFBb0IscUJBQXFCO0FBQ25HLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUF3QiwwQkFBMEI7QUFDbEQsU0FBUyx5QkFBeUI7QUFDbEM7QUFBQSxFQUNDO0FBQUEsRUFBMEI7QUFBQSxFQUFzQjtBQUFBLEVBQ2hEO0FBQUEsRUFBYztBQUFBLEVBQVk7QUFBQSxFQUFtQjtBQUFBLEVBQXVCO0FBQUEsRUFBdUI7QUFBQSxFQUN6RTtBQUFBLEVBQW1LO0FBQUEsT0FDL0s7QUFFUCxTQUFTLHdCQUF3Qix3QkFBd0I7QUFDekQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBMEIsYUFBYSxxQkFBcUI7QUFDckUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMs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
