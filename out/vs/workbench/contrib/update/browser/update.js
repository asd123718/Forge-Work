var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _internalOrg;
import * as nls from "../../../../nls.js";
import severity from "../../../../base/common/severity.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IActivityService, NumberBadge, ProgressBadge } from "../../../services/activity/common/activity.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { ReleaseNotesManager } from "./releaseNotesEditor.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { RawContextKey, IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { MenuRegistry, MenuId, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, SyncStatus } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { Promises, Throttler } from "../../../../base/common/async.js";
import { IUserDataSyncWorkbenchService } from "../../../services/userDataSync/common/userDataSync.js";
import { Event } from "../../../../base/common/event.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { getInternalOrg } from "../../../../platform/assignment/common/assignment.js";
import { tryParseVersion } from "../common/updateUtils.js";
const CONTEXT_UPDATE_STATE = new RawContextKey("updateState", StateType.Uninitialized);
const MAJOR_MINOR_UPDATE_AVAILABLE = new RawContextKey("majorMinorUpdateAvailable", false);
let releaseNotesManager = void 0;
function showReleaseNotesInEditor(instantiationService, version, useCurrentFile) {
  if (!releaseNotesManager) {
    releaseNotesManager = instantiationService.createInstance(ReleaseNotesManager);
  }
  return releaseNotesManager.show(version, useCurrentFile);
}
async function openLatestReleaseNotesInBrowser(accessor) {
  const openerService = accessor.get(IOpenerService);
  const productService = accessor.get(IProductService);
  if (productService.releaseNotesUrl) {
    const uri = URI.parse(productService.releaseNotesUrl);
    await openerService.open(uri);
  } else {
    throw new Error(nls.localize("update.noReleaseNotesOnline", "This version of {0} does not have release notes online", productService.nameLong));
  }
}
async function showReleaseNotes(accessor, version) {
  const instantiationService = accessor.get(IInstantiationService);
  try {
    await showReleaseNotesInEditor(instantiationService, version, false);
  } catch (err) {
    try {
      await instantiationService.invokeFunction(openLatestReleaseNotesInBrowser);
    } catch (err2) {
      throw new Error(`${err.message} and ${err2.message}`);
    }
  }
}
function appendUpdateMenuItems(menuId, group) {
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.check",
      title: nls.localize("checkForUpdates", "Check for Updates...")
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Idle)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.checking",
      title: nls.localize("checkingForUpdates2", "Checking for Updates..."),
      precondition: ContextKeyExpr.false()
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.CheckingForUpdates)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.downloadNow",
      title: nls.localize("download update_1", "Download Update (1)")
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.AvailableForDownload)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.downloading",
      title: nls.localize("DownloadingUpdate", "Downloading Update..."),
      precondition: ContextKeyExpr.false()
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloading)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.install",
      title: nls.localize("installUpdate...", "Install Update... (1)")
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Downloaded)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.updating",
      title: nls.localize("installingUpdate", "Installing Update..."),
      precondition: ContextKeyExpr.false()
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Updating)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    command: {
      id: "update.cancelling",
      title: nls.localize("cancellingUpdateMenuEntry", "Cancelling Update..."),
      precondition: ContextKeyExpr.false()
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Cancelling)
  });
  MenuRegistry.appendMenuItem(menuId, {
    group,
    order: 2,
    command: {
      id: "update.restart",
      title: nls.localize("restartToUpdate", "Restart to Update (1)")
    },
    when: CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready)
  });
}
function isMajorMinorUpdate(before, after) {
  return before.major < after.major || before.minor < after.minor;
}
let ProductContribution = class {
  constructor(storageService, instantiationService, notificationService, environmentService, openerService, configurationService, hostService, productService) {
    if (isWeb) {
      return;
    }
    hostService.hadLastFocus().then(async (hadLastFocus) => {
      if (!hadLastFocus) {
        return;
      }
      const lastVersion = tryParseVersion(storageService.get(ProductContribution.KEY, StorageScope.APPLICATION, ""));
      const currentVersion = tryParseVersion(productService.version);
      const shouldShowReleaseNotes = configurationService.getValue("update.showReleaseNotes");
      const shouldShowPostInstallInfo = configurationService.getValue("update.showPostInstallInfo");
      const releaseNotesUrl = productService.releaseNotesUrl;
      if (shouldShowReleaseNotes && !shouldShowPostInstallInfo && !environmentService.skipReleaseNotes && releaseNotesUrl && lastVersion && currentVersion && isMajorMinorUpdate(lastVersion, currentVersion)) {
        showReleaseNotesInEditor(instantiationService, productService.version, false).then(void 0, () => {
          notificationService.prompt(
            severity.Info,
            nls.localize("read the release notes", "Welcome to {0} v{1}! Would you like to read the Release Notes?", productService.nameLong, productService.version),
            [{
              label: nls.localize("releaseNotes", "Release Notes"),
              run: () => {
                const uri = URI.parse(releaseNotesUrl);
                openerService.open(uri);
              }
            }],
            { priority: NotificationPriority.OPTIONAL }
          );
        });
      }
      storageService.store(ProductContribution.KEY, productService.version, StorageScope.APPLICATION, StorageTarget.MACHINE);
    });
  }
};
ProductContribution.KEY = "releaseNotes/lastVersion";
ProductContribution = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IBrowserWorkbenchEnvironmentService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IHostService),
  __decorateParam(7, IProductService)
], ProductContribution);
let UpdateContribution = class extends Disposable {
  constructor(storageService, instantiationService, dialogService, updateService, activityService, contextKeyService, productService, hostService) {
    super();
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.updateService = updateService;
    this.activityService = activityService;
    this.productService = productService;
    this.hostService = hostService;
    this.badgeDisposable = this._register(new MutableDisposable());
    this.state = updateService.state;
    this.updateStateContextKey = CONTEXT_UPDATE_STATE.bindTo(contextKeyService);
    this.majorMinorUpdateAvailableContextKey = MAJOR_MINOR_UPDATE_AVAILABLE.bindTo(contextKeyService);
    this._register(updateService.onStateChange(this.onUpdateStateChange, this));
    this.onUpdateStateChange(this.updateService.state);
    const currentVersion = this.productService.commit;
    const lastKnownVersion = storageService.get("update/lastKnownVersion", StorageScope.APPLICATION);
    if (currentVersion !== lastKnownVersion) {
      storageService.remove("update/lastKnownVersion", StorageScope.APPLICATION);
      storageService.remove("update/updateNotificationTime", StorageScope.APPLICATION);
    }
    this.registerGlobalActivityActions();
  }
  async onUpdateStateChange(state) {
    this.updateStateContextKey.set(state.type);
    switch (state.type) {
      case StateType.Idle:
        if (state.notAvailable && !state.error && await this.hostService.hadLastFocus()) {
          this.dialogService.info(nls.localize("noUpdatesAvailable", "There are currently no updates available."));
        }
        break;
      case StateType.Ready: {
        const productVersion = state.update.productVersion;
        if (productVersion) {
          const currentVersion = tryParseVersion(this.productService.version);
          const nextVersion = tryParseVersion(productVersion);
          this.majorMinorUpdateAvailableContextKey.set(Boolean(currentVersion && nextVersion && isMajorMinorUpdate(currentVersion, nextVersion)));
        }
        break;
      }
    }
    let badge = void 0;
    if (state.type === StateType.AvailableForDownload || state.type === StateType.Downloaded || state.type === StateType.Ready) {
      badge = new NumberBadge(1, () => nls.localize("updateIsReady", "New {0} update available.", this.productService.nameShort));
    } else if (state.type === StateType.CheckingForUpdates) {
      badge = new ProgressBadge(() => nls.localize("checkingForUpdates", "Checking for {0} updates...", this.productService.nameShort));
    } else if (state.type === StateType.Downloading || state.type === StateType.Overwriting) {
      badge = new ProgressBadge(() => nls.localize("downloading", "Downloading {0} update...", this.productService.nameShort));
    } else if (state.type === StateType.Updating) {
      badge = new ProgressBadge(() => nls.localize("updating", "Updating {0}...", this.productService.nameShort));
    } else if (state.type === StateType.Cancelling) {
      badge = new ProgressBadge(() => nls.localize("cancellingUpdate", "Cancelling {0} update...", this.productService.nameShort));
    }
    this.badgeDisposable.clear();
    if (badge) {
      this.badgeDisposable.value = this.activityService.showGlobalActivity({ badge });
    }
    this.state = state;
  }
  registerGlobalActivityActions() {
    CommandsRegistry.registerCommand("update.check", () => this.updateService.checkForUpdates(true));
    CommandsRegistry.registerCommand("update.checking", () => {
    });
    CommandsRegistry.registerCommand("update.downloadNow", () => this.updateService.downloadUpdate(true));
    CommandsRegistry.registerCommand("update.downloading", () => {
    });
    CommandsRegistry.registerCommand("update.install", () => this.updateService.applyUpdate());
    CommandsRegistry.registerCommand("update.updating", () => {
    });
    CommandsRegistry.registerCommand("update.cancelling", () => {
    });
    CommandsRegistry.registerCommand("update.restart", () => this.updateService.quitAndInstall());
    CommandsRegistry.registerCommand("_update.state", () => {
      return this.state;
    });
    appendUpdateMenuItems(MenuId.GlobalActivity, "7_update");
    if (this.productService.quality === "stable") {
      CommandsRegistry.registerCommand("update.showUpdateReleaseNotes", () => {
        if (this.updateService.state.type !== StateType.Ready) {
          return;
        }
        const productVersion = this.updateService.state.update.productVersion;
        if (productVersion) {
          this.instantiationService.invokeFunction((accessor) => showReleaseNotes(accessor, productVersion));
        }
      });
      MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
        group: "7_update",
        order: 1,
        command: {
          id: "update.showUpdateReleaseNotes",
          title: nls.localize("showUpdateReleaseNotes", "Show Update Release Notes")
        },
        when: ContextKeyExpr.and(CONTEXT_UPDATE_STATE.isEqualTo(StateType.Ready), MAJOR_MINOR_UPDATE_AVAILABLE)
      });
    }
  }
};
UpdateContribution = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IUpdateService),
  __decorateParam(4, IActivityService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IHostService)
], UpdateContribution);
let SwitchProductQualityContribution = class extends Disposable {
  constructor(productService, environmentService) {
    super();
    this.productService = productService;
    this.environmentService = environmentService;
    this.registerGlobalActivityActions();
  }
  registerGlobalActivityActions() {
    const quality = this.productService.quality;
    const productQualityChangeHandler = this.environmentService.options?.productQualityChangeHandler;
    if (productQualityChangeHandler && (quality === "stable" || quality === "insider")) {
      const newQuality = quality === "stable" ? "insider" : "stable";
      const commandId = `update.switchQuality.${newQuality}`;
      const isSwitchingToInsiders = newQuality === "insider";
      this._register(registerAction2(class SwitchQuality extends Action2 {
        constructor() {
          super({
            id: commandId,
            title: isSwitchingToInsiders ? nls.localize("switchToInsiders", "Switch to Insiders Version...") : nls.localize("switchToStable", "Switch to Stable Version..."),
            precondition: IsWebContext,
            menu: {
              id: MenuId.GlobalActivity,
              when: IsWebContext,
              group: "7_update"
            }
          });
        }
        async run(accessor) {
          const dialogService = accessor.get(IDialogService);
          const userDataSyncEnablementService = accessor.get(IUserDataSyncEnablementService);
          const userDataSyncStoreManagementService = accessor.get(IUserDataSyncStoreManagementService);
          const storageService = accessor.get(IStorageService);
          const userDataSyncWorkbenchService = accessor.get(IUserDataSyncWorkbenchService);
          const userDataSyncService = accessor.get(IUserDataSyncService);
          const notificationService = accessor.get(INotificationService);
          try {
            const selectSettingsSyncServiceDialogShownKey = "switchQuality.selectSettingsSyncServiceDialogShown";
            const userDataSyncStore = userDataSyncStoreManagementService.userDataSyncStore;
            let userDataSyncStoreType;
            if (userDataSyncStore && isSwitchingToInsiders && userDataSyncEnablementService.isEnabled() && !storageService.getBoolean(selectSettingsSyncServiceDialogShownKey, StorageScope.APPLICATION, false)) {
              userDataSyncStoreType = await this.selectSettingsSyncService(dialogService);
              if (!userDataSyncStoreType) {
                return;
              }
              storageService.store(selectSettingsSyncServiceDialogShownKey, true, StorageScope.APPLICATION, StorageTarget.USER);
              if (userDataSyncStoreType === "stable") {
                await userDataSyncStoreManagementService.switch(userDataSyncStoreType);
              }
            }
            const res = await dialogService.confirm({
              type: "info",
              message: nls.localize("relaunchMessage", "Changing the version requires a reload to take effect"),
              detail: newQuality === "insider" ? nls.localize("relaunchDetailInsiders", "Press the reload button to switch to the Insiders version of VS Code.") : nls.localize("relaunchDetailStable", "Press the reload button to switch to the Stable version of VS Code."),
              primaryButton: nls.localize({ key: "reload", comment: ["&& denotes a mnemonic"] }, "&&Reload")
            });
            if (res.confirmed) {
              const promises = [];
              if (userDataSyncService.status === SyncStatus.Syncing) {
                promises.push(Event.toPromise(Event.filter(userDataSyncService.onDidChangeStatus, (status) => status !== SyncStatus.Syncing)));
              }
              if (isSwitchingToInsiders && userDataSyncStoreType) {
                promises.push(userDataSyncWorkbenchService.synchroniseUserDataSyncStoreType());
              }
              await Promises.settled(promises);
              productQualityChangeHandler(newQuality);
            } else {
              if (userDataSyncStoreType) {
                storageService.remove(selectSettingsSyncServiceDialogShownKey, StorageScope.APPLICATION);
              }
            }
          } catch (error) {
            notificationService.error(error);
          }
        }
        async selectSettingsSyncService(dialogService) {
          const { result } = await dialogService.prompt({
            type: Severity.Info,
            message: nls.localize("selectSyncService.message", "Choose the settings sync service to use after changing the version"),
            detail: nls.localize("selectSyncService.detail", "The Insiders version of VS Code will synchronize your settings, keybindings, extensions, snippets and UI State using separate insiders settings sync service by default."),
            buttons: [
              {
                label: nls.localize({ key: "use insiders", comment: ["&& denotes a mnemonic"] }, "&&Insiders"),
                run: () => "insiders"
              },
              {
                label: nls.localize({ key: "use stable", comment: ["&& denotes a mnemonic"] }, "&&Stable (current)"),
                run: () => "stable"
              }
            ],
            cancelButton: true
          });
          return result;
        }
      }));
    }
  }
};
SwitchProductQualityContribution = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService)
], SwitchProductQualityContribution);
let DefaultAccountUpdateContribution = class extends Disposable {
  constructor(updateService, defaultAccountService, storageService) {
    super();
    this.updateService = updateService;
    this.defaultAccountService = defaultAccountService;
    this.storageService = storageService;
    __privateAdd(this, _internalOrg);
    this.throttler = this._register(new Throttler());
    if (isWeb) {
      return;
    }
    __privateSet(this, _internalOrg, this.storageService.get(DefaultAccountUpdateContribution.STORAGE_KEY, StorageScope.APPLICATION, void 0));
    this.throttler.queue(() => this.updateService.setInternalOrg(__privateGet(this, _internalOrg)));
    this.refresh();
    this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.refresh()));
  }
  refresh() {
    this.throttler.queue(() => this.doRefresh());
  }
  async doRefresh() {
    try {
      const defaultAccount = await this.defaultAccountService.getDefaultAccount();
      const internalOrg = getInternalOrg(defaultAccount?.entitlementsData?.organization_login_list);
      if (internalOrg === __privateGet(this, _internalOrg)) {
        return;
      }
      __privateSet(this, _internalOrg, internalOrg);
      await this.updateService.setInternalOrg(__privateGet(this, _internalOrg));
      if (__privateGet(this, _internalOrg)) {
        this.storageService.store(DefaultAccountUpdateContribution.STORAGE_KEY, internalOrg, StorageScope.APPLICATION, StorageTarget.MACHINE);
      } else {
        this.storageService.remove(DefaultAccountUpdateContribution.STORAGE_KEY, StorageScope.APPLICATION);
      }
    } catch (error) {
    }
  }
};
_internalOrg = new WeakMap();
DefaultAccountUpdateContribution.STORAGE_KEY = "update/internalOrg";
DefaultAccountUpdateContribution = __decorateClass([
  __decorateParam(0, IUpdateService),
  __decorateParam(1, IDefaultAccountService),
  __decorateParam(2, IStorageService)
], DefaultAccountUpdateContribution);
export {
  CONTEXT_UPDATE_STATE,
  DefaultAccountUpdateContribution,
  MAJOR_MINOR_UPDATE_AVAILABLE,
  ProductContribution,
  SwitchProductQualityContribution,
  UpdateContribution,
  appendUpdateMenuItems,
  showReleaseNotesInEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVwZGF0ZVxcYnJvd3NlclxcdXBkYXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgc2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIE51bWJlckJhZGdlLCBJQmFkZ2UsIFByb2dyZXNzQmFkZ2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UsIFN0YXRlIGFzIFVwZGF0ZVN0YXRlLCBTdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVsZWFzZU5vdGVzTWFuYWdlciB9IGZyb20gJy4vcmVsZWFzZU5vdGVzRWRpdG9yLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSYXdDb250ZXh0S2V5LCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5LCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgU3luY1N0YXR1cywgVXNlckRhdGFTeW5jU3RvcmVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSXNXZWJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMsIFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IGdldEludGVybmFsT3JnIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudC5qcyc7XG5pbXBvcnQgeyBJVmVyc2lvbiwgdHJ5UGFyc2VWZXJzaW9uIH0gZnJvbSAnLi4vY29tbW9uL3VwZGF0ZVV0aWxzLmpzJztcblxuZXhwb3J0IGNvbnN0IENPTlRFWFRfVVBEQVRFX1NUQVRFID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPigndXBkYXRlU3RhdGUnLCBTdGF0ZVR5cGUuVW5pbml0aWFsaXplZCk7XG5leHBvcnQgY29uc3QgTUFKT1JfTUlOT1JfVVBEQVRFX0FWQUlMQUJMRSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdtYWpvck1pbm9yVXBkYXRlQXZhaWxhYmxlJywgZmFsc2UpO1xuXG5sZXQgcmVsZWFzZU5vdGVzTWFuYWdlcjogUmVsZWFzZU5vdGVzTWFuYWdlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNob3dSZWxlYXNlTm90ZXNJbkVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCB2ZXJzaW9uOiBzdHJpbmcsIHVzZUN1cnJlbnRGaWxlOiBib29sZWFuKSB7XG5cdGlmICghcmVsZWFzZU5vdGVzTWFuYWdlcikge1xuXHRcdHJlbGVhc2VOb3Rlc01hbmFnZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZWxlYXNlTm90ZXNNYW5hZ2VyKTtcblx0fVxuXG5cdHJldHVybiByZWxlYXNlTm90ZXNNYW5hZ2VyLnNob3codmVyc2lvbiwgdXNlQ3VycmVudEZpbGUpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBvcGVuTGF0ZXN0UmVsZWFzZU5vdGVzSW5Ccm93c2VyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRjb25zdCBwcm9kdWN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJvZHVjdFNlcnZpY2UpO1xuXG5cdGlmIChwcm9kdWN0U2VydmljZS5yZWxlYXNlTm90ZXNVcmwpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UocHJvZHVjdFNlcnZpY2UucmVsZWFzZU5vdGVzVXJsKTtcblx0XHRhd2FpdCBvcGVuZXJTZXJ2aWNlLm9wZW4odXJpKTtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCd1cGRhdGUubm9SZWxlYXNlTm90ZXNPbmxpbmUnLCBcIlRoaXMgdmVyc2lvbiBvZiB7MH0gZG9lcyBub3QgaGF2ZSByZWxlYXNlIG5vdGVzIG9ubGluZVwiLCBwcm9kdWN0U2VydmljZS5uYW1lTG9uZykpO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNob3dSZWxlYXNlTm90ZXMoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZlcnNpb246IHN0cmluZykge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHR0cnkge1xuXHRcdGF3YWl0IHNob3dSZWxlYXNlTm90ZXNJbkVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZSwgdmVyc2lvbiwgZmFsc2UpO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ob3BlbkxhdGVzdFJlbGVhc2VOb3Rlc0luQnJvd3Nlcik7XG5cdFx0fSBjYXRjaCAoZXJyMikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke2Vyci5tZXNzYWdlfSBhbmQgJHtlcnIyLm1lc3NhZ2V9YCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQXBwZW5kcyB1cGRhdGUtcmVsYXRlZCBtZW51IGl0ZW1zIHRvIHRoZSBnaXZlbiBtZW51LiBUaGlzIHJlZ2lzdGVycyBtZW51IGl0ZW1zXG4gKiBmb3IgYWxsIHVwZGF0ZSBzdGF0ZXMgKGlkbGUsIGNoZWNraW5nLCBkb3dubG9hZGluZywgZXRjLikgdGhhdCBzaG93IHRoZSBjdXJyZW50XG4gKiB1cGRhdGUgc3RhdHVzLiBUaGUgdW5kZXJseWluZyBjb21tYW5kcyAoYHVwZGF0ZS5jaGVja2AsIGB1cGRhdGUucmVzdGFydGAsIGV0Yy4pXG4gKiBtdXN0IGJlIHJlZ2lzdGVyZWQgc2VwYXJhdGVseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGVuZFVwZGF0ZU1lbnVJdGVtcyhtZW51SWQ6IE1lbnVJZCwgZ3JvdXA6IHN0cmluZyk6IHZvaWQge1xuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0Z3JvdXAsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6ICd1cGRhdGUuY2hlY2snLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hlY2tGb3JVcGRhdGVzJywgXCJDaGVjayBmb3IgVXBkYXRlcy4uLlwiKVxuXHRcdH0sXG5cdFx0d2hlbjogQ09OVEVYVF9VUERBVEVfU1RBVEUuaXNFcXVhbFRvKFN0YXRlVHlwZS5JZGxlKVxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0Z3JvdXAsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6ICd1cGRhdGUuY2hlY2tpbmcnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hlY2tpbmdGb3JVcGRhdGVzMicsIFwiQ2hlY2tpbmcgZm9yIFVwZGF0ZXMuLi5cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmZhbHNlKClcblx0XHR9LFxuXHRcdHdoZW46IENPTlRFWFRfVVBEQVRFX1NUQVRFLmlzRXF1YWxUbyhTdGF0ZVR5cGUuQ2hlY2tpbmdGb3JVcGRhdGVzKVxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0Z3JvdXAsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6ICd1cGRhdGUuZG93bmxvYWROb3cnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnZG93bmxvYWQgdXBkYXRlXzEnLCBcIkRvd25sb2FkIFVwZGF0ZSAoMSlcIilcblx0XHR9LFxuXHRcdHdoZW46IENPTlRFWFRfVVBEQVRFX1NUQVRFLmlzRXF1YWxUbyhTdGF0ZVR5cGUuQXZhaWxhYmxlRm9yRG93bmxvYWQpXG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51SWQsIHtcblx0XHRncm91cCxcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogJ3VwZGF0ZS5kb3dubG9hZGluZycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdEb3dubG9hZGluZ1VwZGF0ZScsIFwiRG93bmxvYWRpbmcgVXBkYXRlLi4uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5mYWxzZSgpXG5cdFx0fSxcblx0XHR3aGVuOiBDT05URVhUX1VQREFURV9TVEFURS5pc0VxdWFsVG8oU3RhdGVUeXBlLkRvd25sb2FkaW5nKVxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0Z3JvdXAsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6ICd1cGRhdGUuaW5zdGFsbCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdpbnN0YWxsVXBkYXRlLi4uJywgXCJJbnN0YWxsIFVwZGF0ZS4uLiAoMSlcIilcblx0XHR9LFxuXHRcdHdoZW46IENPTlRFWFRfVVBEQVRFX1NUQVRFLmlzRXF1YWxUbyhTdGF0ZVR5cGUuRG93bmxvYWRlZClcblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdGdyb3VwLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiAndXBkYXRlLnVwZGF0aW5nJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2luc3RhbGxpbmdVcGRhdGUnLCBcIkluc3RhbGxpbmcgVXBkYXRlLi4uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5mYWxzZSgpXG5cdFx0fSxcblx0XHR3aGVuOiBDT05URVhUX1VQREFURV9TVEFURS5pc0VxdWFsVG8oU3RhdGVUeXBlLlVwZGF0aW5nKVxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0Z3JvdXAsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6ICd1cGRhdGUuY2FuY2VsbGluZycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjYW5jZWxsaW5nVXBkYXRlTWVudUVudHJ5JywgXCJDYW5jZWxsaW5nIFVwZGF0ZS4uLlwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZmFsc2UoKVxuXHRcdH0sXG5cdFx0d2hlbjogQ09OVEVYVF9VUERBVEVfU1RBVEUuaXNFcXVhbFRvKFN0YXRlVHlwZS5DYW5jZWxsaW5nKVxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0obWVudUlkLCB7XG5cdFx0Z3JvdXAsXG5cdFx0b3JkZXI6IDIsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6ICd1cGRhdGUucmVzdGFydCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdyZXN0YXJ0VG9VcGRhdGUnLCBcIlJlc3RhcnQgdG8gVXBkYXRlICgxKVwiKVxuXHRcdH0sXG5cdFx0d2hlbjogQ09OVEVYVF9VUERBVEVfU1RBVEUuaXNFcXVhbFRvKFN0YXRlVHlwZS5SZWFkeSlcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGlzTWFqb3JNaW5vclVwZGF0ZShiZWZvcmU6IElWZXJzaW9uLCBhZnRlcjogSVZlcnNpb24pOiBib29sZWFuIHtcblx0cmV0dXJuIGJlZm9yZS5tYWpvciA8IGFmdGVyLm1ham9yIHx8IGJlZm9yZS5taW5vciA8IGFmdGVyLm1pbm9yO1xufVxuXG5leHBvcnQgY2xhc3MgUHJvZHVjdENvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEtFWSA9ICdyZWxlYXNlTm90ZXMvbGFzdFZlcnNpb24nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aG9zdFNlcnZpY2UuaGFkTGFzdEZvY3VzKCkudGhlbihhc3luYyBoYWRMYXN0Rm9jdXMgPT4ge1xuXHRcdFx0aWYgKCFoYWRMYXN0Rm9jdXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsYXN0VmVyc2lvbiA9IHRyeVBhcnNlVmVyc2lvbihzdG9yYWdlU2VydmljZS5nZXQoUHJvZHVjdENvbnRyaWJ1dGlvbi5LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgJycpKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRWZXJzaW9uID0gdHJ5UGFyc2VWZXJzaW9uKHByb2R1Y3RTZXJ2aWNlLnZlcnNpb24pO1xuXHRcdFx0Y29uc3Qgc2hvdWxkU2hvd1JlbGVhc2VOb3RlcyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd1cGRhdGUuc2hvd1JlbGVhc2VOb3RlcycpO1xuXHRcdFx0Y29uc3Qgc2hvdWxkU2hvd1Bvc3RJbnN0YWxsSW5mbyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd1cGRhdGUuc2hvd1Bvc3RJbnN0YWxsSW5mbycpO1xuXHRcdFx0Y29uc3QgcmVsZWFzZU5vdGVzVXJsID0gcHJvZHVjdFNlcnZpY2UucmVsZWFzZU5vdGVzVXJsO1xuXG5cdFx0XHQvLyB3YXMgdGhlcmUgYSBtYWpvci9taW5vciB1cGRhdGU/IGlmIHNvLCBvcGVuIHJlbGVhc2Ugbm90ZXMgKHVubGVzcyBwb3N0LWluc3RhbGwgaW5mbyBpcyBlbmFibGVkLCB3aGljaCB0YWtlcyBvdmVyKVxuXHRcdFx0aWYgKHNob3VsZFNob3dSZWxlYXNlTm90ZXMgJiYgIXNob3VsZFNob3dQb3N0SW5zdGFsbEluZm8gJiYgIWVudmlyb25tZW50U2VydmljZS5za2lwUmVsZWFzZU5vdGVzICYmIHJlbGVhc2VOb3Rlc1VybCAmJiBsYXN0VmVyc2lvbiAmJiBjdXJyZW50VmVyc2lvbiAmJiBpc01ham9yTWlub3JVcGRhdGUobGFzdFZlcnNpb24sIGN1cnJlbnRWZXJzaW9uKSkge1xuXHRcdFx0XHRzaG93UmVsZWFzZU5vdGVzSW5FZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIGZhbHNlKVxuXHRcdFx0XHRcdC50aGVuKHVuZGVmaW5lZCwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0XHRcdHNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgncmVhZCB0aGUgcmVsZWFzZSBub3RlcycsIFwiV2VsY29tZSB0byB7MH0gdnsxfSEgV291bGQgeW91IGxpa2UgdG8gcmVhZCB0aGUgUmVsZWFzZSBOb3Rlcz9cIiwgcHJvZHVjdFNlcnZpY2UubmFtZUxvbmcsIHByb2R1Y3RTZXJ2aWNlLnZlcnNpb24pLFxuXHRcdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbGVhc2VOb3RlcycsIFwiUmVsZWFzZSBOb3Rlc1wiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShyZWxlYXNlTm90ZXNVcmwpO1xuXHRcdFx0XHRcdFx0XHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKHVyaSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdFx0eyBwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuT1BUSU9OQUwgfVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoUHJvZHVjdENvbnRyaWJ1dGlvbi5LRVksIHByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVXBkYXRlQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgc3RhdGU6IFVwZGF0ZVN0YXRlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGJhZGdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSB1cGRhdGVTdGF0ZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgbWFqb3JNaW5vclVwZGF0ZUF2YWlsYWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVVwZGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cGRhdGVTZXJ2aWNlOiBJVXBkYXRlU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zdGF0ZSA9IHVwZGF0ZVNlcnZpY2Uuc3RhdGU7XG5cdFx0dGhpcy51cGRhdGVTdGF0ZUNvbnRleHRLZXkgPSBDT05URVhUX1VQREFURV9TVEFURS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMubWFqb3JNaW5vclVwZGF0ZUF2YWlsYWJsZUNvbnRleHRLZXkgPSBNQUpPUl9NSU5PUl9VUERBVEVfQVZBSUxBQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih1cGRhdGVTZXJ2aWNlLm9uU3RhdGVDaGFuZ2UodGhpcy5vblVwZGF0ZVN0YXRlQ2hhbmdlLCB0aGlzKSk7XG5cdFx0dGhpcy5vblVwZGF0ZVN0YXRlQ2hhbmdlKHRoaXMudXBkYXRlU2VydmljZS5zdGF0ZSk7XG5cblx0XHQvKlxuXHRcdFRoZSBgdXBkYXRlL2xhc3RLbm93blZlcnNpb25gIGFuZCBgdXBkYXRlL3VwZGF0ZU5vdGlmaWNhdGlvblRpbWVgIHN0b3JhZ2Uga2V5cyBhcmUgdXNlZCBpblxuXHRcdGNvbWJpbmF0aW9uIHRvIGZpZ3VyZSBvdXQgd2hlbiB0byBzaG93IGEgbWVzc2FnZSB0byB0aGUgdXNlciB0aGF0IGhlIHNob3VsZCB1cGRhdGUuXG5cblx0XHRUaGlzIG1lc3NhZ2Ugc2hvdWxkIGFwcGVhciBpZiB0aGUgdXNlciBoYXMgcmVjZWl2ZWQgYW4gdXBkYXRlIG5vdGlmaWNhdGlvbiBidXQgaGFzbid0XG5cdFx0dXBkYXRlZCBzaW5jZSA1IGRheXMuXG5cdFx0Ki9cblxuXHRcdGNvbnN0IGN1cnJlbnRWZXJzaW9uID0gdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQ7XG5cdFx0Y29uc3QgbGFzdEtub3duVmVyc2lvbiA9IHN0b3JhZ2VTZXJ2aWNlLmdldCgndXBkYXRlL2xhc3RLbm93blZlcnNpb24nLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXG5cdFx0Ly8gaWYgY3VycmVudCB2ZXJzaW9uICE9IHN0b3JlZCB2ZXJzaW9uLCBjbGVhciBib3RoIGZpZWxkc1xuXHRcdGlmIChjdXJyZW50VmVyc2lvbiAhPT0gbGFzdEtub3duVmVyc2lvbikge1xuXHRcdFx0c3RvcmFnZVNlcnZpY2UucmVtb3ZlKCd1cGRhdGUvbGFzdEtub3duVmVyc2lvbicsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5yZW1vdmUoJ3VwZGF0ZS91cGRhdGVOb3RpZmljYXRpb25UaW1lJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlZ2lzdGVyR2xvYmFsQWN0aXZpdHlBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uVXBkYXRlU3RhdGVDaGFuZ2Uoc3RhdGU6IFVwZGF0ZVN0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy51cGRhdGVTdGF0ZUNvbnRleHRLZXkuc2V0KHN0YXRlLnR5cGUpO1xuXG5cdFx0c3dpdGNoIChzdGF0ZS50eXBlKSB7XG5cdFx0XHRjYXNlIFN0YXRlVHlwZS5JZGxlOlxuXHRcdFx0XHQvLyBUaGVtZWQgZGlhbG9nIHNob3duIGZyb20gdGhlIGxhc3QgZm9jdXNlZCB3aW5kb3c7IHRoZSB3aW5kb3dsZXNzIG1hY09TIGNhc2UgaXMgaGFuZGxlZCBieSB0aGUgbWFpbiBwcm9jZXNzLlxuXHRcdFx0XHRpZiAoc3RhdGUubm90QXZhaWxhYmxlICYmICFzdGF0ZS5lcnJvciAmJiBhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLmhhZExhc3RGb2N1cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLmluZm8obmxzLmxvY2FsaXplKCdub1VwZGF0ZXNBdmFpbGFibGUnLCBcIlRoZXJlIGFyZSBjdXJyZW50bHkgbm8gdXBkYXRlcyBhdmFpbGFibGUuXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBTdGF0ZVR5cGUuUmVhZHk6IHtcblx0XHRcdFx0Y29uc3QgcHJvZHVjdFZlcnNpb24gPSBzdGF0ZS51cGRhdGUucHJvZHVjdFZlcnNpb247XG5cdFx0XHRcdGlmIChwcm9kdWN0VmVyc2lvbikge1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRWZXJzaW9uID0gdHJ5UGFyc2VWZXJzaW9uKHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbik7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dFZlcnNpb24gPSB0cnlQYXJzZVZlcnNpb24ocHJvZHVjdFZlcnNpb24pO1xuXHRcdFx0XHRcdHRoaXMubWFqb3JNaW5vclVwZGF0ZUF2YWlsYWJsZUNvbnRleHRLZXkuc2V0KEJvb2xlYW4oY3VycmVudFZlcnNpb24gJiYgbmV4dFZlcnNpb24gJiYgaXNNYWpvck1pbm9yVXBkYXRlKGN1cnJlbnRWZXJzaW9uLCBuZXh0VmVyc2lvbikpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgYmFkZ2U6IElCYWRnZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuQXZhaWxhYmxlRm9yRG93bmxvYWQgfHwgc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLkRvd25sb2FkZWQgfHwgc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlJlYWR5KSB7XG5cdFx0XHRiYWRnZSA9IG5ldyBOdW1iZXJCYWRnZSgxLCAoKSA9PiBubHMubG9jYWxpemUoJ3VwZGF0ZUlzUmVhZHknLCBcIk5ldyB7MH0gdXBkYXRlIGF2YWlsYWJsZS5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpKTtcblx0XHR9IGVsc2UgaWYgKHN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5DaGVja2luZ0ZvclVwZGF0ZXMpIHtcblx0XHRcdGJhZGdlID0gbmV3IFByb2dyZXNzQmFkZ2UoKCkgPT4gbmxzLmxvY2FsaXplKCdjaGVja2luZ0ZvclVwZGF0ZXMnLCBcIkNoZWNraW5nIGZvciB7MH0gdXBkYXRlcy4uLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCkpO1xuXHRcdH0gZWxzZSBpZiAoc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLkRvd25sb2FkaW5nIHx8IHN0YXRlLnR5cGUgPT09IFN0YXRlVHlwZS5PdmVyd3JpdGluZykge1xuXHRcdFx0YmFkZ2UgPSBuZXcgUHJvZ3Jlc3NCYWRnZSgoKSA9PiBubHMubG9jYWxpemUoJ2Rvd25sb2FkaW5nJywgXCJEb3dubG9hZGluZyB7MH0gdXBkYXRlLi4uXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuVXBkYXRpbmcpIHtcblx0XHRcdGJhZGdlID0gbmV3IFByb2dyZXNzQmFkZ2UoKCkgPT4gbmxzLmxvY2FsaXplKCd1cGRhdGluZycsIFwiVXBkYXRpbmcgezB9Li4uXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0ZS50eXBlID09PSBTdGF0ZVR5cGUuQ2FuY2VsbGluZykge1xuXHRcdFx0YmFkZ2UgPSBuZXcgUHJvZ3Jlc3NCYWRnZSgoKSA9PiBubHMubG9jYWxpemUoJ2NhbmNlbGxpbmdVcGRhdGUnLCBcIkNhbmNlbGxpbmcgezB9IHVwZGF0ZS4uLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCkpO1xuXHRcdH1cblxuXHRcdHRoaXMuYmFkZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHRpZiAoYmFkZ2UpIHtcblx0XHRcdHRoaXMuYmFkZ2VEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd0dsb2JhbEFjdGl2aXR5KHsgYmFkZ2UgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGF0ZSA9IHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckdsb2JhbEFjdGl2aXR5QWN0aW9ucygpOiB2b2lkIHtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgndXBkYXRlLmNoZWNrJywgKCkgPT4gdGhpcy51cGRhdGVTZXJ2aWNlLmNoZWNrRm9yVXBkYXRlcyh0cnVlKSk7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3VwZGF0ZS5jaGVja2luZycsICgpID0+IHsgfSk7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3VwZGF0ZS5kb3dubG9hZE5vdycsICgpID0+IHRoaXMudXBkYXRlU2VydmljZS5kb3dubG9hZFVwZGF0ZSh0cnVlKSk7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3VwZGF0ZS5kb3dubG9hZGluZycsICgpID0+IHsgfSk7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3VwZGF0ZS5pbnN0YWxsJywgKCkgPT4gdGhpcy51cGRhdGVTZXJ2aWNlLmFwcGx5VXBkYXRlKCkpO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd1cGRhdGUudXBkYXRpbmcnLCAoKSA9PiB7IH0pO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd1cGRhdGUuY2FuY2VsbGluZycsICgpID0+IHsgfSk7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3VwZGF0ZS5yZXN0YXJ0JywgKCkgPT4gdGhpcy51cGRhdGVTZXJ2aWNlLnF1aXRBbmRJbnN0YWxsKCkpO1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfdXBkYXRlLnN0YXRlJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuc3RhdGU7XG5cdFx0fSk7XG5cblx0XHRhcHBlbmRVcGRhdGVNZW51SXRlbXMoTWVudUlkLkdsb2JhbEFjdGl2aXR5LCAnN191cGRhdGUnKTtcblxuXHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdzdGFibGUnKSB7XG5cdFx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgndXBkYXRlLnNob3dVcGRhdGVSZWxlYXNlTm90ZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGUudHlwZSAhPT0gU3RhdGVUeXBlLlJlYWR5KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcHJvZHVjdFZlcnNpb24gPSB0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGUudXBkYXRlLnByb2R1Y3RWZXJzaW9uO1xuXHRcdFx0XHRpZiAocHJvZHVjdFZlcnNpb24pIHtcblx0XHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHNob3dSZWxlYXNlTm90ZXMoYWNjZXNzb3IsIHByb2R1Y3RWZXJzaW9uKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSk7XG5cdFx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkdsb2JhbEFjdGl2aXR5LCB7XG5cdFx0XHRcdGdyb3VwOiAnN191cGRhdGUnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiAndXBkYXRlLnNob3dVcGRhdGVSZWxlYXNlTm90ZXMnLFxuXHRcdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3Nob3dVcGRhdGVSZWxlYXNlTm90ZXMnLCBcIlNob3cgVXBkYXRlIFJlbGVhc2UgTm90ZXNcIilcblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfVVBEQVRFX1NUQVRFLmlzRXF1YWxUbyhTdGF0ZVR5cGUuUmVhZHkpLCBNQUpPUl9NSU5PUl9VUERBVEVfQVZBSUxBQkxFKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTd2l0Y2hQcm9kdWN0UXVhbGl0eUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyR2xvYmFsQWN0aXZpdHlBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyR2xvYmFsQWN0aXZpdHlBY3Rpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHF1YWxpdHkgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHk7XG5cdFx0Y29uc3QgcHJvZHVjdFF1YWxpdHlDaGFuZ2VIYW5kbGVyID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8ucHJvZHVjdFF1YWxpdHlDaGFuZ2VIYW5kbGVyO1xuXHRcdGlmIChwcm9kdWN0UXVhbGl0eUNoYW5nZUhhbmRsZXIgJiYgKHF1YWxpdHkgPT09ICdzdGFibGUnIHx8IHF1YWxpdHkgPT09ICdpbnNpZGVyJykpIHtcblx0XHRcdGNvbnN0IG5ld1F1YWxpdHkgPSBxdWFsaXR5ID09PSAnc3RhYmxlJyA/ICdpbnNpZGVyJyA6ICdzdGFibGUnO1xuXHRcdFx0Y29uc3QgY29tbWFuZElkID0gYHVwZGF0ZS5zd2l0Y2hRdWFsaXR5LiR7bmV3UXVhbGl0eX1gO1xuXHRcdFx0Y29uc3QgaXNTd2l0Y2hpbmdUb0luc2lkZXJzID0gbmV3UXVhbGl0eSA9PT0gJ2luc2lkZXInO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFN3aXRjaFF1YWxpdHkgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGNvbW1hbmRJZCxcblx0XHRcdFx0XHRcdHRpdGxlOiBpc1N3aXRjaGluZ1RvSW5zaWRlcnMgPyBubHMubG9jYWxpemUoJ3N3aXRjaFRvSW5zaWRlcnMnLCBcIlN3aXRjaCB0byBJbnNpZGVycyBWZXJzaW9uLi4uXCIpIDogbmxzLmxvY2FsaXplKCdzd2l0Y2hUb1N0YWJsZScsIFwiU3dpdGNoIHRvIFN0YWJsZSBWZXJzaW9uLi4uXCIpLFxuXHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBJc1dlYkNvbnRleHQsXG5cdFx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRcdGlkOiBNZW51SWQuR2xvYmFsQWN0aXZpdHksXG5cdFx0XHRcdFx0XHRcdHdoZW46IElzV2ViQ29udGV4dCxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICc3X3VwZGF0ZScsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgdXNlckRhdGFTeW5jU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFTeW5jU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0U2V0dGluZ3NTeW5jU2VydmljZURpYWxvZ1Nob3duS2V5ID0gJ3N3aXRjaFF1YWxpdHkuc2VsZWN0U2V0dGluZ3NTeW5jU2VydmljZURpYWxvZ1Nob3duJztcblx0XHRcdFx0XHRcdGNvbnN0IHVzZXJEYXRhU3luY1N0b3JlID0gdXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZTtcblx0XHRcdFx0XHRcdGxldCB1c2VyRGF0YVN5bmNTdG9yZVR5cGU6IFVzZXJEYXRhU3luY1N0b3JlVHlwZSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGlmICh1c2VyRGF0YVN5bmNTdG9yZSAmJiBpc1N3aXRjaGluZ1RvSW5zaWRlcnMgJiYgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKClcblx0XHRcdFx0XHRcdFx0JiYgIXN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oc2VsZWN0U2V0dGluZ3NTeW5jU2VydmljZURpYWxvZ1Nob3duS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKSkge1xuXHRcdFx0XHRcdFx0XHR1c2VyRGF0YVN5bmNTdG9yZVR5cGUgPSBhd2FpdCB0aGlzLnNlbGVjdFNldHRpbmdzU3luY1NlcnZpY2UoZGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdFx0XHRcdGlmICghdXNlckRhdGFTeW5jU3RvcmVUeXBlKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHNlbGVjdFNldHRpbmdzU3luY1NlcnZpY2VEaWFsb2dTaG93bktleSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRcdFx0XHRpZiAodXNlckRhdGFTeW5jU3RvcmVUeXBlID09PSAnc3RhYmxlJykge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFVwZGF0ZSB0aGUgc3RhYmxlIHNlcnZpY2UgdHlwZSBpbiB0aGUgY3VycmVudCB3aW5kb3csIHNvIHRoYXQgaXQgdXNlcyBzdGFibGUgc2VydmljZSBhZnRlciBzd2l0Y2hlZCB0byBpbnNpZGVycyB2ZXJzaW9uIChhZnRlciByZWxvYWQpLlxuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoKHVzZXJEYXRhU3luY1N0b3JlVHlwZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3JlbGF1bmNoTWVzc2FnZScsIFwiQ2hhbmdpbmcgdGhlIHZlcnNpb24gcmVxdWlyZXMgYSByZWxvYWQgdG8gdGFrZSBlZmZlY3RcIiksXG5cdFx0XHRcdFx0XHRcdGRldGFpbDogbmV3UXVhbGl0eSA9PT0gJ2luc2lkZXInID9cblx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3JlbGF1bmNoRGV0YWlsSW5zaWRlcnMnLCBcIlByZXNzIHRoZSByZWxvYWQgYnV0dG9uIHRvIHN3aXRjaCB0byB0aGUgSW5zaWRlcnMgdmVyc2lvbiBvZiBWUyBDb2RlLlwiKSA6XG5cdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdyZWxhdW5jaERldGFpbFN0YWJsZScsIFwiUHJlc3MgdGhlIHJlbG9hZCBidXR0b24gdG8gc3dpdGNoIHRvIHRoZSBTdGFibGUgdmVyc2lvbiBvZiBWUyBDb2RlLlwiKSxcblx0XHRcdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAncmVsb2FkJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmVsb2FkXCIpXG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0aWYgKHJlcy5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8dW5rbm93bj5bXSA9IFtdO1xuXG5cdFx0XHRcdFx0XHRcdC8vIElmIHN5bmMgaXMgaGFwcGVuaW5nIHdhaXQgdW50aWwgaXQgaXMgZmluaXNoZWQgYmVmb3JlIHJlbG9hZFxuXHRcdFx0XHRcdFx0XHRpZiAodXNlckRhdGFTeW5jU2VydmljZS5zdGF0dXMgPT09IFN5bmNTdGF0dXMuU3luY2luZykge1xuXHRcdFx0XHRcdFx0XHRcdHByb21pc2VzLnB1c2goRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcih1c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdHVzLCBzdGF0dXMgPT4gc3RhdHVzICE9PSBTeW5jU3RhdHVzLlN5bmNpbmcpKSk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHQvLyBJZiB1c2VyIGNob3NlIHRoZSBzeW5jIHNlcnZpY2UgdGhlbiBzeW5jaHJvbmlzZSB0aGUgc3RvcmUgdHlwZSBvcHRpb24gaW4gaW5zaWRlcnMgc2VydmljZSwgc28gdGhhdCBvdGhlciBjbGllbnRzIHVzaW5nIGluc2lkZXJzIHNlcnZpY2UgYXJlIGFsc28gdXBkYXRlZC5cblx0XHRcdFx0XHRcdFx0aWYgKGlzU3dpdGNoaW5nVG9JbnNpZGVycyAmJiB1c2VyRGF0YVN5bmNTdG9yZVR5cGUpIHtcblx0XHRcdFx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2Uuc3luY2hyb25pc2VVc2VyRGF0YVN5bmNTdG9yZVR5cGUoKSk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHByb21pc2VzKTtcblxuXHRcdFx0XHRcdFx0XHRwcm9kdWN0UXVhbGl0eUNoYW5nZUhhbmRsZXIobmV3UXVhbGl0eSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBSZXNldFxuXHRcdFx0XHRcdFx0XHRpZiAodXNlckRhdGFTeW5jU3RvcmVUeXBlKSB7XG5cdFx0XHRcdFx0XHRcdFx0c3RvcmFnZVNlcnZpY2UucmVtb3ZlKHNlbGVjdFNldHRpbmdzU3luY1NlcnZpY2VEaWFsb2dTaG93bktleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcml2YXRlIGFzeW5jIHNlbGVjdFNldHRpbmdzU3luY1NlcnZpY2UoZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UpOiBQcm9taXNlPFVzZXJEYXRhU3luY1N0b3JlVHlwZSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLnByb21wdDxVc2VyRGF0YVN5bmNTdG9yZVR5cGU+KHtcblx0XHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3NlbGVjdFN5bmNTZXJ2aWNlLm1lc3NhZ2UnLCBcIkNob29zZSB0aGUgc2V0dGluZ3Mgc3luYyBzZXJ2aWNlIHRvIHVzZSBhZnRlciBjaGFuZ2luZyB0aGUgdmVyc2lvblwiKSxcblx0XHRcdFx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdzZWxlY3RTeW5jU2VydmljZS5kZXRhaWwnLCBcIlRoZSBJbnNpZGVycyB2ZXJzaW9uIG9mIFZTIENvZGUgd2lsbCBzeW5jaHJvbml6ZSB5b3VyIHNldHRpbmdzLCBrZXliaW5kaW5ncywgZXh0ZW5zaW9ucywgc25pcHBldHMgYW5kIFVJIFN0YXRlIHVzaW5nIHNlcGFyYXRlIGluc2lkZXJzIHNldHRpbmdzIHN5bmMgc2VydmljZSBieSBkZWZhdWx0LlwiKSxcblx0XHRcdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICd1c2UgaW5zaWRlcnMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZJbnNpZGVyc1wiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+ICdpbnNpZGVycydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICd1c2Ugc3RhYmxlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU3RhYmxlIChjdXJyZW50KVwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+ICdzdGFibGUnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRjYW5jZWxCdXR0b246IHRydWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0QWNjb3VudFVwZGF0ZUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTVE9SQUdFX0tFWSA9ICd1cGRhdGUvaW50ZXJuYWxPcmcnO1xuXHQjaW50ZXJuYWxPcmc6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0aHJvdHRsZXI6IFRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVcGRhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0cmV0dXJuOyAvLyBFbGVjdHJvbiBvbmx5XG5cdFx0fVxuXG5cdFx0dGhpcy4jaW50ZXJuYWxPcmcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChEZWZhdWx0QWNjb3VudFVwZGF0ZUNvbnRyaWJ1dGlvbi5TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMudGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMudXBkYXRlU2VydmljZS5zZXRJbnRlcm5hbE9yZyh0aGlzLiNpbnRlcm5hbE9yZykpO1xuXG5cdFx0Ly8gQ2hlY2sgb24gc3RhcnR1cFxuXHRcdHRoaXMucmVmcmVzaCgpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBhY2NvdW50IGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KCgpID0+IHRoaXMucmVmcmVzaCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2goKTogdm9pZCB7XG5cdFx0dGhpcy50aHJvdHRsZXIucXVldWUoKCkgPT4gdGhpcy5kb1JlZnJlc2goKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdEFjY291bnQgPSBhd2FpdCB0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5nZXREZWZhdWx0QWNjb3VudCgpO1xuXHRcdFx0Y29uc3QgaW50ZXJuYWxPcmcgPSBnZXRJbnRlcm5hbE9yZyhkZWZhdWx0QWNjb3VudD8uZW50aXRsZW1lbnRzRGF0YT8ub3JnYW5pemF0aW9uX2xvZ2luX2xpc3QpO1xuXG5cdFx0XHRpZiAoaW50ZXJuYWxPcmcgPT09IHRoaXMuI2ludGVybmFsT3JnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy4jaW50ZXJuYWxPcmcgPSBpbnRlcm5hbE9yZztcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlU2VydmljZS5zZXRJbnRlcm5hbE9yZyh0aGlzLiNpbnRlcm5hbE9yZyk7XG5cblx0XHRcdGlmICh0aGlzLiNpbnRlcm5hbE9yZykge1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKERlZmF1bHRBY2NvdW50VXBkYXRlQ29udHJpYnV0aW9uLlNUT1JBR0VfS0VZLCBpbnRlcm5hbE9yZywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoRGVmYXVsdEFjY291bnRVcGRhdGVDb250cmlidXRpb24uU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIFNpbGVudGx5IGlnbm9yZSBlcnJvcnMgLSBpZiB3ZSBjYW4ndCBnZXQgdGhlIGFjY291bnQsIHdlIGRvbid0IGRpc2FibGUgYmFja2dyb3VuZCB1cGRhdGVzXG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUtBLFlBQVksU0FBUztBQUNyQixPQUFPLGNBQWM7QUFDckIsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxrQkFBa0IsYUFBcUIscUJBQXFCO0FBQ3JFLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsZ0JBQXNDLGlCQUFpQjtBQUNoRSxTQUFTLHNCQUFzQixzQkFBc0IsZ0JBQWdCO0FBQ3JFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQTRCLG9CQUFvQixzQkFBc0I7QUFDL0UsU0FBUyxjQUFjLFFBQVEsaUJBQWlCLGVBQWU7QUFDL0QsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQ0FBZ0Msc0JBQXNCLHFDQUFxQyxrQkFBeUM7QUFDN0ksU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBbUIsdUJBQXVCO0FBRW5DLE1BQU0sdUJBQXVCLElBQUksY0FBc0IsZUFBZSxVQUFVLGFBQWE7QUFDN0YsTUFBTSwrQkFBK0IsSUFBSSxjQUF1Qiw2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
