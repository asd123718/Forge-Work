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
import { localize } from "../../../../nls.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { IExtensionManagementService, IGlobalExtensionEnablementService, ENABLED_EXTENSIONS_STORAGE_PATH, DISABLED_EXTENSIONS_STORAGE_PATH, InstallOperation, IAllowedExtensionsService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IWorkbenchExtensionManagementService, ExtensionInstallLocation } from "../common/extensionManagement.js";
import { areSameExtensions, BetterMergeId, getExtensionDependencies, isMalicious } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { ExtensionType, isAuthenticationProviderExtension, isLanguagePackExtension, isResolverExtension } from "../../../../platform/extensions/common/extensions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { StorageManager } from "../../../../platform/extensionManagement/common/extensionEnablementService.js";
import { webWorkerExtHostConfig } from "../../extensions/common/extensions.js";
import { IUserDataSyncAccountService } from "../../../../platform/userDataSync/common/userDataSyncAccount.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../host/browser/host.js";
import { IExtensionBisectService } from "./extensionBisect.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IExtensionManifestPropertiesService } from "../../extensions/common/extensionManifestPropertiesService.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { equals } from "../../../../base/common/arrays.js";
import { isString } from "../../../../base/common/types.js";
import { Delayer } from "../../../../base/common/async.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IChatEntitlementService } from "../../chat/common/chatEntitlementService.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
const SOURCE = "IWorkbenchExtensionEnablementService";
const EXTENSION_UNIFICATION_SETTING = "chat.extensionUnification.enabled";
const MALICIOUS_EXTENSIONS_STORAGE_KEY = "extensionsEnablement/malicious";
let ExtensionEnablementService = class extends Disposable {
  constructor(storageService, globalExtensionEnablementService, contextService, environmentService, extensionManagementService, configurationService, extensionManagementServerService, userDataSyncEnablementService, defaultAccountService, userDataSyncAccountService, lifecycleService, notificationService, hostService, extensionBisectService, allowedExtensionsService, workspaceTrustManagementService, workspaceTrustRequestService, extensionManifestPropertiesService, chatEntitlementService, instantiationService, logService, productService) {
    super();
    this.storageService = storageService;
    this.globalExtensionEnablementService = globalExtensionEnablementService;
    this.contextService = contextService;
    this.environmentService = environmentService;
    this.extensionManagementService = extensionManagementService;
    this.configurationService = configurationService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.defaultAccountService = defaultAccountService;
    this.userDataSyncAccountService = userDataSyncAccountService;
    this.lifecycleService = lifecycleService;
    this.notificationService = notificationService;
    this.extensionBisectService = extensionBisectService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.chatEntitlementService = chatEntitlementService;
    this.logService = logService;
    this._onEnablementChanged = this._register(new Emitter());
    this.onEnablementChanged = this._onEnablementChanged.event;
    this.extensionsDisabledExtensions = [];
    this.delayer = this._register(new Delayer(0));
    this.storageManager = this._register(new StorageManager(storageService));
    const uninstallDisposable = this._register(Event.filter(extensionManagementService.onDidUninstallExtension, (e) => !e.error)(({ identifier }) => this._reset(identifier)));
    let isDisposed = false;
    this._register(toDisposable(() => isDisposed = true));
    this.extensionsManager = this._register(instantiationService.createInstance(ExtensionsManager));
    this.extensionsManager.whenInitialized().then(() => {
      if (!isDisposed) {
        uninstallDisposable.dispose();
        this._onDidChangeExtensions([], [], false);
        this._register(this.extensionsManager.onDidChangeExtensions(({ added, removed, isProfileSwitch }) => this._onDidChangeExtensions(added, removed, isProfileSwitch)));
        this.loopCheckForMaliciousExtensions();
      }
    });
    this._register(this.globalExtensionEnablementService.onDidChangeEnablement(({ extensions, source }) => this._onDidChangeGloballyDisabledExtensions(extensions, source)));
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this._onDidChangeExtensions([], [], false)));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, MALICIOUS_EXTENSIONS_STORAGE_KEY, this._store)(() => this._maliciousExtensionsCache = void 0));
    this._completionsExtensionId = productService.defaultChatAgent?.extensionId.toLowerCase();
    this._chatExtensionId = productService.defaultChatAgent?.chatExtensionId.toLowerCase();
    this._sessionsWindowAllowedExtensions = new Set((productService.sessionsWindowAllowedExtensions ?? []).map((id) => id.toLowerCase()));
    const unificationExtensions = [this._completionsExtensionId, this._chatExtensionId].filter((id) => !!id);
    if (isWeb && this.environmentService.remoteAuthority === void 0) {
      this._extensionUnificationEnabled = false;
    } else {
      this._extensionUnificationEnabled = this.configurationService.getValue(EXTENSION_UNIFICATION_SETTING);
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(EXTENSION_UNIFICATION_SETTING)) {
        const extensionUnificationEnabled = this.configurationService.getValue(EXTENSION_UNIFICATION_SETTING);
        if (!extensionUnificationEnabled) {
          this._extensionUnificationEnabled = false;
          this._onEnablementChanged.fire(this.extensionsManager.extensions.filter((ext) => unificationExtensions.includes(ext.identifier.id.toLowerCase())));
        }
      }
    }));
    if (this.allUserExtensionsDisabled) {
      this.lifecycleService.when(LifecyclePhase.Eventually).then(() => {
        this.notificationService.prompt(Severity.Info, localize("extensionsDisabled", "All installed extensions are temporarily disabled."), [{
          label: localize("Reload", "Reload and Enable Extensions"),
          run: () => hostService.reload({ disableExtensions: false })
        }], {
          sticky: true,
          priority: NotificationPriority.URGENT
        });
      });
    }
    this.ensureChatExtensionInitialDisabledState();
  }
  ensureChatExtensionInitialDisabledState() {
    if (!this._chatExtensionId || this.environmentService.isSessionsWindow || this.environmentService.skipBuiltinExtensions?.some((id) => id.toLowerCase() === this._chatExtensionId)) {
      return;
    }
    const builtinChatExtensionEnablementMigrationKey = "builtinChatExtensionEnablementMigration";
    const builtinChatExtensionEnablementMigration = this.storageService.getBoolean(builtinChatExtensionEnablementMigrationKey, StorageScope.PROFILE) === true;
    if (builtinChatExtensionEnablementMigration) {
      return;
    }
    this.logService.debug("Running builtin chat extension enablement migration");
    this.storageService.store(builtinChatExtensionEnablementMigrationKey, true, StorageScope.PROFILE, StorageTarget.MACHINE);
    const context = this.chatEntitlementService.context;
    if (context) {
      if (context.value.state.completed) {
        if (this._isDisabledGlobally({ id: this._chatExtensionId })) {
          if (this.configurationService.getValue(ChatAIDisabledSettingId) !== true) {
            this.logService.debug("Disabling AI features because builtin chat extension is disabled");
            this.configurationService.updateValue(ChatAIDisabledSettingId, true).catch((err) => this.logService.error("Failed to update chat.disableAIFeatures setting during builtin chat extension enablement migration", err));
          }
        }
      } else {
        try {
          this.logService.debug("Disabling builtin chat extension as chat set up is not completed");
          this._disableExtension({ id: this._chatExtensionId });
        } catch (error) {
          this.logService.error("Failed to disable builtin chat extension during enablement migration", error);
        }
      }
    }
  }
  get hasWorkspace() {
    return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  get allUserExtensionsDisabled() {
    return this.environmentService.disableExtensions === true;
  }
  getEnablementState(extension) {
    return this._computeEnablementState(extension, this.extensionsManager.extensions, this.getWorkspaceType());
  }
  getEnablementStates(extensions, workspaceTypeOverrides = {}) {
    const extensionsEnablements = /* @__PURE__ */ new Map();
    const workspaceType = { ...this.getWorkspaceType(), ...workspaceTypeOverrides };
    return extensions.map((extension) => this._computeEnablementState(extension, extensions, workspaceType, extensionsEnablements));
  }
  getDependenciesEnablementStates(extension) {
    return getExtensionDependencies(this.extensionsManager.extensions, extension).map((e) => [e, this.getEnablementState(e)]);
  }
  canChangeEnablement(extension) {
    try {
      this.throwErrorIfCannotChangeEnablement(extension);
      return true;
    } catch (error) {
      return false;
    }
  }
  canChangeWorkspaceEnablement(extension) {
    if (!this.canChangeEnablement(extension)) {
      return false;
    }
    try {
      this.throwErrorIfCannotChangeWorkspaceEnablement(extension);
      return true;
    } catch (error) {
      return false;
    }
  }
  isDefaultOrSettingsSyncAuthProviderExtension(manifest) {
    if (!isAuthenticationProviderExtension(manifest)) {
      return false;
    }
    const defaultAccountAuthProvider = this.defaultAccountService.getDefaultAccountAuthenticationProvider();
    if (manifest.contributes.authentication.some((a) => a.id === defaultAccountAuthProvider.id)) {
      return true;
    }
    if (this.userDataSyncEnablementService.isEnabled() && this.userDataSyncAccountService.account && manifest.contributes.authentication.some((a) => a.id === this.userDataSyncAccountService.account.authenticationProviderId)) {
      return true;
    }
    return false;
  }
  throwErrorIfCannotChangeEnablement(extension, donotCheckDependencies) {
    if (isLanguagePackExtension(extension.manifest)) {
      throw new Error(localize("cannot disable language pack extension", "Cannot change enablement of {0} extension because it contributes language packs.", extension.manifest.displayName || extension.identifier.id));
    }
    if (this.isDefaultOrSettingsSyncAuthProviderExtension(extension.manifest)) {
      throw new Error(localize("cannot disable settings sync auth extension", "Cannot change enablement of {0} extension because Settings Sync depends on it.", extension.manifest.displayName || extension.identifier.id));
    }
    if (this._isEnabledInEnv(extension)) {
      throw new Error(localize("cannot change enablement environment", "Cannot change enablement of {0} extension because it is enabled in environment", extension.manifest.displayName || extension.identifier.id));
    }
    this.throwErrorIfEnablementStateCannotBeChanged(extension, this.getEnablementState(extension), donotCheckDependencies);
  }
  throwErrorIfEnablementStateCannotBeChanged(extension, enablementStateOfExtension, donotCheckDependencies) {
    switch (enablementStateOfExtension) {
      case EnablementState.DisabledByEnvironment:
        throw new Error(localize("cannot change disablement environment", "Cannot change enablement of {0} extension because it is disabled in environment", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByMalicious:
        throw new Error(localize("cannot change enablement malicious", "Cannot change enablement of {0} extension because it is malicious", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByVirtualWorkspace:
        throw new Error(localize("cannot change enablement virtual workspace", "Cannot change enablement of {0} extension because it does not support virtual workspaces", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByExtensionKind:
        throw new Error(localize("cannot change enablement extension kind", "Cannot change enablement of {0} extension because of its extension kind", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByAllowlist:
        throw new Error(localize("cannot change disallowed extension enablement", "Cannot change enablement of {0} extension because it is disallowed", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByInvalidExtension:
        throw new Error(localize("cannot change invalid extension enablement", "Cannot change enablement of {0} extension because of it is invalid", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByExtensionDependency:
        if (donotCheckDependencies) {
          break;
        }
        for (const dependency of getExtensionDependencies(this.extensionsManager.extensions, extension)) {
          if (this.isEnabled(dependency)) {
            continue;
          }
          throw new Error(localize("cannot change enablement dependency", "Cannot enable '{0}' extension because it depends on '{1}' extension that cannot be enabled", extension.manifest.displayName || extension.identifier.id, dependency.manifest.displayName || dependency.identifier.id));
        }
    }
  }
  throwErrorIfCannotChangeWorkspaceEnablement(extension) {
    if (!this.hasWorkspace) {
      throw new Error(localize("noWorkspace", "No workspace."));
    }
    if (this.isDefaultOrSettingsSyncAuthProviderExtension(extension.manifest)) {
      throw new Error(localize("cannot disable settings sync auth extension in workspace", "Cannot change enablement of {0} extension in workspace because Settings Sync depends on it.", extension.manifest.displayName || extension.identifier.id));
    }
  }
  async setEnablement(extensions, newState) {
    await this.extensionsManager.whenInitialized();
    if (newState === EnablementState.EnabledGlobally || newState === EnablementState.EnabledWorkspace) {
      extensions.push(...this.getExtensionsToEnableRecursively(extensions, this.extensionsManager.extensions, newState, { dependencies: true, pack: true }));
    }
    const workspace = newState === EnablementState.DisabledWorkspace || newState === EnablementState.EnabledWorkspace;
    for (const extension of extensions) {
      if (workspace) {
        this.throwErrorIfCannotChangeWorkspaceEnablement(extension);
      } else {
        this.throwErrorIfCannotChangeEnablement(extension);
      }
    }
    const result = [];
    for (const extension of extensions) {
      const enablementState = this.getEnablementState(extension);
      if (enablementState === EnablementState.DisabledByTrustRequirement || enablementState === EnablementState.DisabledByExtensionDependency && this.getDependenciesEnablementStates(extension).every(([, e]) => this.isEnabledEnablementState(e) || e === EnablementState.DisabledByTrustRequirement)) {
        const trustState = await this.workspaceTrustRequestService.requestWorkspaceTrust();
        result.push(trustState ?? false);
      } else {
        result.push(await this._setUserEnablementState(extension, newState));
      }
    }
    const changedExtensions = extensions.filter((e, index) => result[index]);
    if (changedExtensions.length) {
      this._onEnablementChanged.fire(changedExtensions);
    }
    return result;
  }
  getExtensionsToEnableRecursively(extensions, allExtensions, enablementState, options, checked = []) {
    if (!options.dependencies && !options.pack) {
      return [];
    }
    const toCheck = extensions.filter((e) => checked.indexOf(e) === -1);
    if (!toCheck.length) {
      return [];
    }
    for (const extension of toCheck) {
      checked.push(extension);
    }
    const extensionsToEnable = [];
    for (const extension of allExtensions) {
      if (checked.some((e) => areSameExtensions(e.identifier, extension.identifier))) {
        continue;
      }
      const enablementStateOfExtension = this.getEnablementState(extension);
      if (this.isEnabledEnablementState(enablementStateOfExtension)) {
        continue;
      }
      if (enablementStateOfExtension === EnablementState.DisabledByExtensionKind) {
        continue;
      }
      if (extensions.some((e) => options.dependencies && e.manifest.extensionDependencies?.some((id) => areSameExtensions({ id }, extension.identifier)) || options.pack && e.manifest.extensionPack?.some((id) => areSameExtensions({ id }, extension.identifier)))) {
        const index = extensionsToEnable.findIndex((e) => areSameExtensions(e.identifier, extension.identifier));
        if (index === -1) {
          extensionsToEnable.push(extension);
        } else {
          try {
            this.throwErrorIfEnablementStateCannotBeChanged(extension, enablementStateOfExtension, true);
            extensionsToEnable.splice(index, 1, extension);
          } catch (error) {
          }
        }
      }
    }
    if (extensionsToEnable.length) {
      extensionsToEnable.push(...this.getExtensionsToEnableRecursively(extensionsToEnable, allExtensions, enablementState, options, checked));
    }
    return extensionsToEnable;
  }
  _setUserEnablementState(extension, newState) {
    const currentState = this._getUserEnablementState(extension.identifier);
    if (currentState === newState) {
      return Promise.resolve(false);
    }
    switch (newState) {
      case EnablementState.EnabledGlobally:
        this._enableExtension(extension.identifier);
        break;
      case EnablementState.DisabledGlobally:
        this._disableExtension(extension.identifier);
        break;
      case EnablementState.EnabledWorkspace:
        this._enableExtensionInWorkspace(extension.identifier);
        break;
      case EnablementState.DisabledWorkspace:
        this._disableExtensionInWorkspace(extension.identifier);
        break;
    }
    return Promise.resolve(true);
  }
  isEnabled(extension) {
    const enablementState = this.getEnablementState(extension);
    return this.isEnabledEnablementState(enablementState);
  }
  isEnabledEnablementState(enablementState) {
    return enablementState === EnablementState.EnabledByEnvironment || enablementState === EnablementState.EnabledWorkspace || enablementState === EnablementState.EnabledGlobally;
  }
  isDisabledGlobally(extension) {
    return this._isDisabledGlobally(extension.identifier);
  }
  _computeEnablementState(extension, extensions, workspaceType, computedEnablementStates) {
    computedEnablementStates = computedEnablementStates ?? /* @__PURE__ */ new Map();
    let enablementState = computedEnablementStates.get(extension);
    if (enablementState !== void 0) {
      return enablementState;
    }
    if (extension.identifier.id.toLowerCase() === this._chatExtensionId) {
      this.ensureChatExtensionInitialDisabledState();
    }
    enablementState = this._getUserEnablementState(extension.identifier);
    const isEnabled = this.isEnabledEnablementState(enablementState);
    if (isMalicious(extension.identifier, this.getMaliciousExtensionsForCheck())) {
      enablementState = EnablementState.DisabledByMalicious;
    } else if (isEnabled && extension.type === ExtensionType.User && this.allowedExtensionsService.isAllowed(extension) !== true) {
      enablementState = EnablementState.DisabledByAllowlist;
    } else if (isEnabled && !extension.isValid) {
      enablementState = EnablementState.DisabledByInvalidExtension;
    } else if (this.extensionBisectService.isDisabledByBisect(extension)) {
      enablementState = EnablementState.DisabledByEnvironment;
    } else if (this._isDisabledInEnv(extension)) {
      enablementState = EnablementState.DisabledByEnvironment;
    } else if (this._isDisabledByVirtualWorkspace(extension, workspaceType)) {
      enablementState = EnablementState.DisabledByVirtualWorkspace;
    } else if (isEnabled && this._isDisabledByWorkspaceTrust(extension, workspaceType)) {
      enablementState = EnablementState.DisabledByTrustRequirement;
    } else if (this._isDisabledByExtensionKind(extension)) {
      enablementState = EnablementState.DisabledByExtensionKind;
    } else if (this._isDisabledBySessionsWindow(extension)) {
      enablementState = EnablementState.DisabledByEnvironment;
    } else if (isEnabled && this._isDisabledByExtensionDependency(extension, extensions, workspaceType, computedEnablementStates)) {
      enablementState = EnablementState.DisabledByExtensionDependency;
    } else if (this._isDisabledByUnification(extension.identifier)) {
      enablementState = EnablementState.DisabledByUnification;
    } else if (!isEnabled && this._isEnabledInEnv(extension)) {
      enablementState = EnablementState.EnabledByEnvironment;
    }
    computedEnablementStates.set(extension, enablementState);
    return enablementState;
  }
  _isDisabledInEnv(extension) {
    if (this.allUserExtensionsDisabled) {
      return !extension.isBuiltin && !isResolverExtension(extension.manifest, this.environmentService.remoteAuthority);
    }
    const disabledExtensions = this.environmentService.disableExtensions;
    if (Array.isArray(disabledExtensions)) {
      return disabledExtensions.some((id) => areSameExtensions({ id }, extension.identifier));
    }
    if (areSameExtensions({ id: BetterMergeId.value }, extension.identifier)) {
      return true;
    }
    return false;
  }
  _isEnabledInEnv(extension) {
    const enabledExtensions = this.environmentService.enableExtensions;
    if (Array.isArray(enabledExtensions)) {
      return enabledExtensions.some((id) => areSameExtensions({ id }, extension.identifier));
    }
    return false;
  }
  _isDisabledByVirtualWorkspace(extension, workspaceType) {
    if (!workspaceType.virtual) {
      return false;
    }
    if (this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(extension.manifest) !== false) {
      return false;
    }
    if (this.extensionManagementServerService.getExtensionManagementServer(extension) === this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWeb(extension.manifest)) {
      return false;
    }
    return true;
  }
  _isDisabledByExtensionKind(extension) {
    if (this.extensionManagementServerService.remoteExtensionManagementServer || this.extensionManagementServerService.webExtensionManagementServer) {
      const installLocation = this.extensionManagementServerService.getExtensionInstallLocation(extension);
      for (const extensionKind of this.extensionManifestPropertiesService.getExtensionKind(extension.manifest)) {
        if (extensionKind === "ui") {
          if (installLocation === ExtensionInstallLocation.Local) {
            return false;
          }
        }
        if (extensionKind === "workspace") {
          if (installLocation === ExtensionInstallLocation.Remote) {
            return false;
          }
        }
        if (extensionKind === "web") {
          if (this.extensionManagementServerService.webExtensionManagementServer) {
            if (installLocation === ExtensionInstallLocation.Web || installLocation === ExtensionInstallLocation.Remote) {
              return false;
            }
          } else if (installLocation === ExtensionInstallLocation.Local) {
            const enableLocalWebWorker = this.configurationService.getValue(webWorkerExtHostConfig);
            if (enableLocalWebWorker === true || enableLocalWebWorker === "auto") {
              return false;
            }
          }
        }
      }
      return true;
    }
    return false;
  }
  _isDisabledByWorkspaceTrust(extension, workspaceType) {
    if (workspaceType.trusted) {
      return false;
    }
    if (this.contextService.isInsideWorkspace(extension.location)) {
      return true;
    }
    return this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.manifest) === false;
  }
  _isDisabledByExtensionDependency(extension, extensions, workspaceType, computedEnablementStates) {
    if (!extension.manifest.extensionDependencies) {
      return false;
    }
    const dependencyExtensions = extensions.filter((e) => extension.manifest.extensionDependencies?.some((id) => areSameExtensions(e.identifier, { id }) && (this.extensionManagementServerService.getExtensionManagementServer(e) === this.extensionManagementServerService.getExtensionManagementServer(extension) || (e.manifest.main || e.manifest.browser) && e.manifest.api === "none")));
    if (!dependencyExtensions.length) {
      return false;
    }
    const hasEnablementState = computedEnablementStates.has(extension);
    if (!hasEnablementState) {
      computedEnablementStates.set(extension, EnablementState.EnabledGlobally);
    }
    try {
      for (const dependencyExtension of dependencyExtensions) {
        const enablementState = this._computeEnablementState(dependencyExtension, extensions, workspaceType, computedEnablementStates);
        if (!this.isEnabledEnablementState(enablementState) && enablementState !== EnablementState.DisabledByExtensionKind) {
          return true;
        }
      }
    } finally {
      if (!hasEnablementState) {
        computedEnablementStates.delete(extension);
      }
    }
    return false;
  }
  _getUserEnablementState(identifier) {
    if (this.hasWorkspace) {
      if (this._getWorkspaceEnabledExtensions().filter((e) => areSameExtensions(e, identifier))[0]) {
        return EnablementState.EnabledWorkspace;
      }
      if (this._getWorkspaceDisabledExtensions().filter((e) => areSameExtensions(e, identifier))[0]) {
        return EnablementState.DisabledWorkspace;
      }
    }
    if (this._isDisabledGlobally(identifier)) {
      return EnablementState.DisabledGlobally;
    }
    return EnablementState.EnabledGlobally;
  }
  _isDisabledGlobally(identifier) {
    return this.globalExtensionEnablementService.getDisabledExtensions().some((e) => areSameExtensions(e, identifier));
  }
  _isDisabledByUnification(identifier) {
    return this._extensionUnificationEnabled && identifier.id.toLowerCase() === this._completionsExtensionId;
  }
  _isDisabledBySessionsWindow(extension) {
    if (!this.environmentService.isSessionsWindow) {
      return false;
    }
    if (this._sessionsWindowAllowedExtensions.has(extension.identifier.id.toLowerCase())) {
      return false;
    }
    if (extension.isBuiltin) {
      if (extension.identifier.id.toLowerCase() === this._chatExtensionId) {
        return false;
      }
      const contributes = extension.manifest.contributes;
      if (contributes?.debuggers || contributes?.views || contributes?.viewsContainers || contributes?.walkthroughs) {
        return true;
      }
      return false;
    }
    return !this.extensionManifestPropertiesService.canExecuteOnSessionsWindow(extension.manifest);
  }
  _enableExtension(identifier) {
    this._removeFromWorkspaceDisabledExtensions(identifier);
    this._removeFromWorkspaceEnabledExtensions(identifier);
    return this.globalExtensionEnablementService.enableExtension(identifier, SOURCE);
  }
  _disableExtension(identifier) {
    this._removeFromWorkspaceDisabledExtensions(identifier);
    this._removeFromWorkspaceEnabledExtensions(identifier);
    return this.globalExtensionEnablementService.disableExtension(identifier, SOURCE);
  }
  _enableExtensionInWorkspace(identifier) {
    this._removeFromWorkspaceDisabledExtensions(identifier);
    this._addToWorkspaceEnabledExtensions(identifier);
  }
  _disableExtensionInWorkspace(identifier) {
    this._addToWorkspaceDisabledExtensions(identifier);
    this._removeFromWorkspaceEnabledExtensions(identifier);
  }
  _addToWorkspaceDisabledExtensions(identifier) {
    if (!this.hasWorkspace) {
      return Promise.resolve(false);
    }
    const disabledExtensions = this._getWorkspaceDisabledExtensions();
    if (disabledExtensions.every((e) => !areSameExtensions(e, identifier))) {
      disabledExtensions.push(identifier);
      this._setDisabledExtensions(disabledExtensions);
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }
  async _removeFromWorkspaceDisabledExtensions(identifier) {
    if (!this.hasWorkspace) {
      return false;
    }
    const disabledExtensions = this._getWorkspaceDisabledExtensions();
    for (let index = 0; index < disabledExtensions.length; index++) {
      const disabledExtension = disabledExtensions[index];
      if (areSameExtensions(disabledExtension, identifier)) {
        disabledExtensions.splice(index, 1);
        this._setDisabledExtensions(disabledExtensions);
        return true;
      }
    }
    return false;
  }
  _addToWorkspaceEnabledExtensions(identifier) {
    if (!this.hasWorkspace) {
      return false;
    }
    const enabledExtensions = this._getWorkspaceEnabledExtensions();
    if (enabledExtensions.every((e) => !areSameExtensions(e, identifier))) {
      enabledExtensions.push(identifier);
      this._setEnabledExtensions(enabledExtensions);
      return true;
    }
    return false;
  }
  _removeFromWorkspaceEnabledExtensions(identifier) {
    if (!this.hasWorkspace) {
      return false;
    }
    const enabledExtensions = this._getWorkspaceEnabledExtensions();
    for (let index = 0; index < enabledExtensions.length; index++) {
      const disabledExtension = enabledExtensions[index];
      if (areSameExtensions(disabledExtension, identifier)) {
        enabledExtensions.splice(index, 1);
        this._setEnabledExtensions(enabledExtensions);
        return true;
      }
    }
    return false;
  }
  _getWorkspaceEnabledExtensions() {
    return this._getExtensions(ENABLED_EXTENSIONS_STORAGE_PATH);
  }
  _setEnabledExtensions(enabledExtensions) {
    this._setExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, enabledExtensions);
  }
  _getWorkspaceDisabledExtensions() {
    return this._getExtensions(DISABLED_EXTENSIONS_STORAGE_PATH);
  }
  _setDisabledExtensions(disabledExtensions) {
    this._setExtensions(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions);
  }
  _getExtensions(storageId) {
    if (!this.hasWorkspace) {
      return [];
    }
    return this.storageManager.get(storageId, StorageScope.WORKSPACE);
  }
  _setExtensions(storageId, extensions) {
    this.storageManager.set(storageId, extensions, StorageScope.WORKSPACE);
  }
  async _onDidChangeGloballyDisabledExtensions(extensionIdentifiers, source) {
    if (source !== SOURCE) {
      await this.extensionsManager.whenInitialized();
      const extensions = this.extensionsManager.extensions.filter((installedExtension) => extensionIdentifiers.some((identifier) => areSameExtensions(identifier, installedExtension.identifier)));
      this._onEnablementChanged.fire(extensions);
    }
  }
  _onDidChangeExtensions(added, removed, isProfileSwitch) {
    const changedExtensions = added.filter((e) => !this.isEnabledEnablementState(this.getEnablementState(e)));
    const existingDisabledExtensions = this.extensionsDisabledExtensions;
    this.extensionsDisabledExtensions = this.extensionsManager.extensions.filter((extension) => {
      const enablementState = this.getEnablementState(extension);
      return enablementState === EnablementState.DisabledByExtensionDependency || enablementState === EnablementState.DisabledByAllowlist || enablementState === EnablementState.DisabledByMalicious;
    });
    for (const extension of existingDisabledExtensions) {
      if (this.extensionsDisabledExtensions.every((e) => !areSameExtensions(e.identifier, extension.identifier))) {
        changedExtensions.push(extension);
      }
    }
    for (const extension of this.extensionsDisabledExtensions) {
      if (existingDisabledExtensions.every((e) => !areSameExtensions(e.identifier, extension.identifier))) {
        changedExtensions.push(extension);
      }
    }
    if (changedExtensions.length) {
      this._onEnablementChanged.fire(changedExtensions);
    }
    if (!isProfileSwitch) {
      removed.forEach(({ identifier }) => this._reset(identifier));
    }
  }
  async updateExtensionsEnablementsWhenWorkspaceTrustChanges() {
    await this.extensionsManager.whenInitialized();
    const computeEnablementStates = (workspaceType2) => {
      const extensionsEnablements = /* @__PURE__ */ new Map();
      return this.extensionsManager.extensions.map((extension) => [extension, this._computeEnablementState(extension, this.extensionsManager.extensions, workspaceType2, extensionsEnablements)]);
    };
    const workspaceType = this.getWorkspaceType();
    const enablementStatesWithTrustedWorkspace = computeEnablementStates({ ...workspaceType, trusted: true });
    const enablementStatesWithUntrustedWorkspace = computeEnablementStates({ ...workspaceType, trusted: false });
    const enablementChangedExtensionsBecauseOfTrust = enablementStatesWithTrustedWorkspace.filter(([, enablementState], index) => enablementState !== enablementStatesWithUntrustedWorkspace[index][1]).map(([extension]) => extension);
    if (enablementChangedExtensionsBecauseOfTrust.length) {
      this._onEnablementChanged.fire(enablementChangedExtensionsBecauseOfTrust);
    }
  }
  getWorkspaceType() {
    return { trusted: this.workspaceTrustManagementService.isWorkspaceTrusted(), virtual: isVirtualWorkspace(this.contextService.getWorkspace()) };
  }
  _reset(extension) {
    this._removeFromWorkspaceDisabledExtensions(extension);
    this._removeFromWorkspaceEnabledExtensions(extension);
    this.globalExtensionEnablementService.enableExtension(extension);
  }
  loopCheckForMaliciousExtensions() {
    this.checkForMaliciousExtensions().then(() => this.delayer.trigger(() => {
    }, 1e3 * 60 * 5)).then(() => this.loopCheckForMaliciousExtensions());
  }
  async checkForMaliciousExtensions() {
    try {
      const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
      const changed = this.storeMaliciousExtensions(extensionsControlManifest.malicious.map(({ extensionOrPublisher }) => extensionOrPublisher));
      if (changed) {
        this._onDidChangeExtensions([], [], false);
      }
    } catch (err) {
      this.logService.error(err);
    }
  }
  getMaliciousExtensions() {
    return this.storageService.getObject(MALICIOUS_EXTENSIONS_STORAGE_KEY, StorageScope.APPLICATION, []);
  }
  getMaliciousExtensionsForCheck() {
    if (!this._maliciousExtensionsCache) {
      this._maliciousExtensionsCache = this.getMaliciousExtensions().map((extensionOrPublisher) => ({ extensionOrPublisher }));
    }
    return this._maliciousExtensionsCache;
  }
  storeMaliciousExtensions(extensions) {
    const existing = this.getMaliciousExtensions();
    if (equals(existing, extensions, (a, b) => !isString(a) && !isString(b) ? areSameExtensions(a, b) : a === b)) {
      return false;
    }
    this._maliciousExtensionsCache = void 0;
    this.storageService.store(MALICIOUS_EXTENSIONS_STORAGE_KEY, JSON.stringify(extensions), StorageScope.APPLICATION, StorageTarget.MACHINE);
    return true;
  }
};
ExtensionEnablementService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IGlobalExtensionEnablementService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, IExtensionManagementService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IExtensionManagementServerService),
  __decorateParam(7, IUserDataSyncEnablementService),
  __decorateParam(8, IDefaultAccountService),
  __decorateParam(9, IUserDataSyncAccountService),
  __decorateParam(10, ILifecycleService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IHostService),
  __decorateParam(13, IExtensionBisectService),
  __decorateParam(14, IAllowedExtensionsService),
  __decorateParam(15, IWorkspaceTrustManagementService),
  __decorateParam(16, IWorkspaceTrustRequestService),
  __decorateParam(17, IExtensionManifestPropertiesService),
  __decorateParam(18, IChatEntitlementService),
  __decorateParam(19, IInstantiationService),
  __decorateParam(20, ILogService),
  __decorateParam(21, IProductService)
], ExtensionEnablementService);
let ExtensionsManager = class extends Disposable {
  constructor(extensionManagementService, extensionManagementServerService, logService) {
    super();
    this.extensionManagementService = extensionManagementService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.logService = logService;
    this._extensions = [];
    this._onDidChangeExtensions = this._register(new Emitter());
    this.onDidChangeExtensions = this._onDidChangeExtensions.event;
    this.disposed = false;
    this._register(toDisposable(() => this.disposed = true));
    this.initializePromise = this.initialize();
  }
  get extensions() {
    return this._extensions;
  }
  whenInitialized() {
    return this.initializePromise;
  }
  async initialize() {
    try {
      this._extensions = [
        ...await this.extensionManagementService.getInstalled(),
        ...await this.extensionManagementService.getInstalledWorkspaceExtensions(true)
      ];
      if (this.disposed) {
        return;
      }
      this._onDidChangeExtensions.fire({ added: this.extensions, removed: [], isProfileSwitch: false });
    } catch (error) {
      this.logService.error(error);
    }
    this._register(this.extensionManagementService.onDidInstallExtensions((e) => this.updateExtensions(e.reduce((result, { local, operation }) => {
      if (local && operation !== InstallOperation.Migrate) {
        result.push(local);
      }
      return result;
    }, []), [], void 0, false)));
    this._register(Event.filter(this.extensionManagementService.onDidUninstallExtension, ((e) => !e.error))((e) => this.updateExtensions([], [e.identifier], e.server, false)));
    this._register(this.extensionManagementService.onDidChangeProfile(({ added, removed, server }) => {
      this.updateExtensions(added, removed.map(({ identifier }) => identifier), server, true);
    }));
  }
  updateExtensions(added, identifiers, server, isProfileSwitch) {
    if (added.length) {
      for (const extension of added) {
        const extensionServer = this.extensionManagementServerService.getExtensionManagementServer(extension);
        const index = this._extensions.findIndex((e) => areSameExtensions(e.identifier, extension.identifier) && this.extensionManagementServerService.getExtensionManagementServer(e) === extensionServer);
        if (index !== -1) {
          this._extensions.splice(index, 1);
        }
      }
      this._extensions.push(...added);
    }
    const removed = [];
    for (const identifier of identifiers) {
      const index = this._extensions.findIndex((e) => areSameExtensions(e.identifier, identifier) && this.extensionManagementServerService.getExtensionManagementServer(e) === server);
      if (index !== -1) {
        removed.push(...this._extensions.splice(index, 1));
      }
    }
    if (added.length || removed.length) {
      this._onDidChangeExtensions.fire({ added, removed, isProfileSwitch });
    }
  }
};
ExtensionsManager = __decorateClass([
  __decorateParam(0, IWorkbenchExtensionManagementService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, ILogService)
], ExtensionsManager);
registerSingleton(IWorkbenchExtensionEnablementService, ExtensionEnablementService, InstantiationType.Delayed);
export {
  ExtensionEnablementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25NYW5hZ2VtZW50XFxicm93c2VyXFxleHRlbnNpb25FbmFibGVtZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUV4dGVuc2lvbklkZW50aWZpZXIsIElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgRU5BQkxFRF9FWFRFTlNJT05TX1NUT1JBR0VfUEFUSCwgRElTQUJMRURfRVhURU5TSU9OU19TVE9SQUdFX1BBVEgsIEluc3RhbGxPcGVyYXRpb24sIElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsIE1hbGljaW91c0V4dGVuc2lvbkluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgRW5hYmxlbWVudFN0YXRlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIEV4dGVuc2lvbkluc3RhbGxMb2NhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zLCBCZXR0ZXJNZXJnZUlkLCBnZXRFeHRlbnNpb25EZXBlbmRlbmNpZXMsIGlzTWFsaWNpb3VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlLCBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uTWFuaWZlc3QsIGlzQXV0aGVudGljYXRpb25Qcm92aWRlckV4dGVuc2lvbiwgaXNMYW5ndWFnZVBhY2tFeHRlbnNpb24sIGlzUmVzb2x2ZXJFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jaGF0L2NvbW1vbi9jaGF0U2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlTWFuYWdlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdlYldvcmtlckV4dEhvc3RDb25maWcsIFdlYldvcmtlckV4dEhvc3RDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmNBY2NvdW50LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSB9IGZyb20gJy4vZXh0ZW5zaW9uQmlzZWN0LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVmlydHVhbFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50U2VydmljZSwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuXG5jb25zdCBTT1VSQ0UgPSAnSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlJztcblxudHlwZSBXb3Jrc3BhY2VUeXBlID0geyByZWFkb25seSB2aXJ0dWFsOiBib29sZWFuOyByZWFkb25seSB0cnVzdGVkOiBib29sZWFuIH07XG5cbmNvbnN0IEVYVEVOU0lPTl9VTklGSUNBVElPTl9TRVRUSU5HID0gJ2NoYXQuZXh0ZW5zaW9uVW5pZmljYXRpb24uZW5hYmxlZCc7XG5jb25zdCBNQUxJQ0lPVVNfRVhURU5TSU9OU19TVE9SQUdFX0tFWSA9ICdleHRlbnNpb25zRW5hYmxlbWVudC9tYWxpY2lvdXMnO1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkVuYWJsZW1lbnRDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUV4dGVuc2lvbltdPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRW5hYmxlbWVudENoYW5nZWQ6IEV2ZW50PHJlYWRvbmx5IElFeHRlbnNpb25bXT4gPSB0aGlzLl9vbkVuYWJsZW1lbnRDaGFuZ2VkLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBleHRlbnNpb25zTWFuYWdlcjogRXh0ZW5zaW9uc01hbmFnZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZU1hbmFnZXI6IFN0b3JhZ2VNYW5hZ2VyO1xuXHRwcml2YXRlIGV4dGVuc2lvbnNEaXNhYmxlZEV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigwKSk7XG5cblx0Ly8gRXh0ZW5zaW9uIHVuaWZpY2F0aW9uXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbXBsZXRpb25zRXh0ZW5zaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdEV4dGVuc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4dGVuc2lvblVuaWZpY2F0aW9uRW5hYmxlZDogYm9vbGVhbjtcblxuXHQvLyBTZXNzaW9ucyB3aW5kb3cgYWxsb3ctbGlzdCAobG93ZXJjYXNlZCBleHRlbnNpb24gaWRzKVxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1dpbmRvd0FsbG93ZWRFeHRlbnNpb25zOiBSZWFkb25seVNldDxzdHJpbmc+O1xuXG5cdHByaXZhdGUgX21hbGljaW91c0V4dGVuc2lvbnNDYWNoZTogUmVhZG9ubHlBcnJheTxNYWxpY2lvdXNFeHRlbnNpb25JbmZvPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBnbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZTogSVVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbkJpc2VjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25CaXNlY3RTZXJ2aWNlOiBJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSxcblx0XHRASUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFsbG93ZWRFeHRlbnNpb25zU2VydmljZTogSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zdG9yYWdlTWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdG9yYWdlTWFuYWdlcihzdG9yYWdlU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgdW5pbnN0YWxsRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcihleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiwgZSA9PiAhZS5lcnJvcikoKHsgaWRlbnRpZmllciB9KSA9PiB0aGlzLl9yZXNldChpZGVudGlmaWVyKSkpO1xuXHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGlzRGlzcG9zZWQgPSB0cnVlKSk7XG5cdFx0dGhpcy5leHRlbnNpb25zTWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNNYW5hZ2VyKSk7XG5cdFx0dGhpcy5leHRlbnNpb25zTWFuYWdlci53aGVuSW5pdGlhbGl6ZWQoKS50aGVuKCgpID0+IHtcblx0XHRcdGlmICghaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR1bmluc3RhbGxEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFeHRlbnNpb25zKFtdLCBbXSwgZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbnNNYW5hZ2VyLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucygoeyBhZGRlZCwgcmVtb3ZlZCwgaXNQcm9maWxlU3dpdGNoIH0pID0+IHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9ucyhhZGRlZCwgcmVtb3ZlZCwgaXNQcm9maWxlU3dpdGNoKSkpO1xuXHRcdFx0XHR0aGlzLmxvb3BDaGVja0Zvck1hbGljaW91c0V4dGVuc2lvbnMoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZ2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbmFibGVtZW50KCh7IGV4dGVuc2lvbnMsIHNvdXJjZSB9KSA9PiB0aGlzLl9vbkRpZENoYW5nZUdsb2JhbGx5RGlzYWJsZWRFeHRlbnNpb25zKGV4dGVuc2lvbnMsIHNvdXJjZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VBbGxvd2VkRXh0ZW5zaW9uc0NvbmZpZ1ZhbHVlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9ucyhbXSwgW10sIGZhbHNlKSkpO1xuXG5cdFx0Ly8gSW52YWxpZGF0ZSB0aGUgY2FjaGVkIG1hbGljaW91cyBleHRlbnNpb25zIGxpc3Qgd2hlbiB0aGUgc3RvcmVkIHZhbHVlIGNoYW5nZXMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgTUFMSUNJT1VTX0VYVEVOU0lPTlNfU1RPUkFHRV9LRVksIHRoaXMuX3N0b3JlKSgoKSA9PiB0aGlzLl9tYWxpY2lvdXNFeHRlbnNpb25zQ2FjaGUgPSB1bmRlZmluZWQpKTtcblxuXHRcdC8vIEV4dGVuc2lvbiB1bmlmaWNhdGlvblxuXHRcdHRoaXMuX2NvbXBsZXRpb25zRXh0ZW5zaW9uSWQgPSBwcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5leHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpO1xuXHRcdHRoaXMuX2NoYXRFeHRlbnNpb25JZCA9IHByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpO1xuXHRcdHRoaXMuX3Nlc3Npb25zV2luZG93QWxsb3dlZEV4dGVuc2lvbnMgPSBuZXcgU2V0PHN0cmluZz4oKHByb2R1Y3RTZXJ2aWNlLnNlc3Npb25zV2luZG93QWxsb3dlZEV4dGVuc2lvbnMgPz8gW10pLm1hcChpZCA9PiBpZC50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0Y29uc3QgdW5pZmljYXRpb25FeHRlbnNpb25zID0gW3RoaXMuX2NvbXBsZXRpb25zRXh0ZW5zaW9uSWQsIHRoaXMuX2NoYXRFeHRlbnNpb25JZF0uZmlsdGVyKGlkID0+ICEhaWQpO1xuXG5cdFx0Ly8gRGlzYWJsaW5nIGV4dGVuc2lvbiB1bmlmaWNhdGlvbiBzaG91bGQgaW1tZWRpYXRlbHkgZGlzYWJsZSB0aGUgdW5pZmllZCBleHRlbnNpb24gZmxvd1xuXHRcdC8vIEVuYWJsaW5nIGV4dGVuc2lvbiB1bmlmaWNhdGlvbiB3aWxsIG9ubHkgdGFrZSBlZmZlY3QgYWZ0ZXIgcmVzdGFydFxuXHRcdC8vIEV4dGVuc2lvbiBVbmlmaWNhdGlvbiBpcyBkaXNhYmxlZCBpbiB3ZWIgd2hlbiB0aGVyZSBpcyBubyByZW1vdGUgYXV0aG9yaXR5XG5cdFx0aWYgKGlzV2ViICYmIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25VbmlmaWNhdGlvbkVuYWJsZWQgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uVW5pZmljYXRpb25FbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihFWFRFTlNJT05fVU5JRklDQVRJT05fU0VUVElORyk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oRVhURU5TSU9OX1VOSUZJQ0FUSU9OX1NFVFRJTkcpKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblVuaWZpY2F0aW9uRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oRVhURU5TSU9OX1VOSUZJQ0FUSU9OX1NFVFRJTkcpO1xuXHRcdFx0XHRpZiAoIWV4dGVuc2lvblVuaWZpY2F0aW9uRW5hYmxlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2V4dGVuc2lvblVuaWZpY2F0aW9uRW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuX29uRW5hYmxlbWVudENoYW5nZWQuZmlyZSh0aGlzLmV4dGVuc2lvbnNNYW5hZ2VyLmV4dGVuc2lvbnMuZmlsdGVyKGV4dCA9PiB1bmlmaWNhdGlvbkV4dGVuc2lvbnMuaW5jbHVkZXMoZXh0LmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIGRlbGF5IG5vdGlmaWNhdGlvbiBmb3IgZXh0ZW5zaW9ucyBkaXNhYmxlZCB1bnRpbCB3b3JrYmVuY2ggcmVzdG9yZWRcblx0XHRpZiAodGhpcy5hbGxVc2VyRXh0ZW5zaW9uc0Rpc2FibGVkKSB7XG5cdFx0XHR0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KS50aGVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5JbmZvLCBsb2NhbGl6ZSgnZXh0ZW5zaW9uc0Rpc2FibGVkJywgXCJBbGwgaW5zdGFsbGVkIGV4dGVuc2lvbnMgYXJlIHRlbXBvcmFyaWx5IGRpc2FibGVkLlwiKSwgW3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ1JlbG9hZCcsIFwiUmVsb2FkIGFuZCBFbmFibGUgRXh0ZW5zaW9uc1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IGhvc3RTZXJ2aWNlLnJlbG9hZCh7IGRpc2FibGVFeHRlbnNpb25zOiBmYWxzZSB9KVxuXHRcdFx0XHR9XSwge1xuXHRcdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5lbnN1cmVDaGF0RXh0ZW5zaW9uSW5pdGlhbERpc2FibGVkU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlQ2hhdEV4dGVuc2lvbkluaXRpYWxEaXNhYmxlZFN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY2hhdEV4dGVuc2lvbklkIHx8IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cgfHwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2Uuc2tpcEJ1aWx0aW5FeHRlbnNpb25zPy5zb21lKGlkID0+IGlkLnRvTG93ZXJDYXNlKCkgPT09IHRoaXMuX2NoYXRFeHRlbnNpb25JZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBidWlsdGluQ2hhdEV4dGVuc2lvbkVuYWJsZW1lbnRNaWdyYXRpb25LZXkgPSAnYnVpbHRpbkNoYXRFeHRlbnNpb25FbmFibGVtZW50TWlncmF0aW9uJztcblx0XHRjb25zdCBidWlsdGluQ2hhdEV4dGVuc2lvbkVuYWJsZW1lbnRNaWdyYXRpb24gPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oYnVpbHRpbkNoYXRFeHRlbnNpb25FbmFibGVtZW50TWlncmF0aW9uS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSkgPT09IHRydWU7XG5cdFx0aWYgKGJ1aWx0aW5DaGF0RXh0ZW5zaW9uRW5hYmxlbWVudE1pZ3JhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnUnVubmluZyBidWlsdGluIGNoYXQgZXh0ZW5zaW9uIGVuYWJsZW1lbnQgbWlncmF0aW9uJyk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShidWlsdGluQ2hhdEV4dGVuc2lvbkVuYWJsZW1lbnRNaWdyYXRpb25LZXksIHRydWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdGNvbnN0IGNvbnRleHQgPSAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlIGFzIENoYXRFbnRpdGxlbWVudFNlcnZpY2UpLmNvbnRleHQ7XG5cdFx0aWYgKGNvbnRleHQpIHtcblx0XHRcdGlmIChjb250ZXh0LnZhbHVlLnN0YXRlLmNvbXBsZXRlZCkge1xuXHRcdFx0XHQvLyBVc2VyIGhhcyB1c2VkIGNoYXQgZmVhdHVyZXMgYmVmb3JlXG5cdFx0XHRcdGlmICh0aGlzLl9pc0Rpc2FibGVkR2xvYmFsbHkoeyBpZDogdGhpcy5fY2hhdEV4dGVuc2lvbklkIH0pKSB7XG5cdFx0XHRcdFx0Ly8gVXNlciBoYWQgc3BlY2lmaWNhbGx5IGRpc2FibGVkIHRoZSBjaGF0IGV4dGVuc2lvbiB0byBkaXNhYmxlIEFJIGZlYXR1cmVzXG5cdFx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpICE9PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHQvLyBIb25vciB0aGF0IGNob2ljZSBieSBkaXNhYmxpbmcgQUkgZmVhdHVyZXNcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnRGlzYWJsaW5nIEFJIGZlYXR1cmVzIGJlY2F1c2UgYnVpbHRpbiBjaGF0IGV4dGVuc2lvbiBpcyBkaXNhYmxlZCcpO1xuXHRcdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCwgdHJ1ZSlcblx0XHRcdFx0XHRcdFx0LmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byB1cGRhdGUgY2hhdC5kaXNhYmxlQUlGZWF0dXJlcyBzZXR0aW5nIGR1cmluZyBidWlsdGluIGNoYXQgZXh0ZW5zaW9uIGVuYWJsZW1lbnQgbWlncmF0aW9uJywgZXJyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIFVzZXIgaGFzIG5vdCB1c2VkIGNoYXQgZmVhdHVyZXMgYmVmb3JlIHNvIGF2b2lkIGFjdGl2YXRpbmcgdGhlIGNoYXQgZXh0ZW5zaW9uIGJ5IGRpc2FibGluZyBpdFxuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnRGlzYWJsaW5nIGJ1aWx0aW4gY2hhdCBleHRlbnNpb24gYXMgY2hhdCBzZXQgdXAgaXMgbm90IGNvbXBsZXRlZCcpO1xuXHRcdFx0XHRcdHRoaXMuX2Rpc2FibGVFeHRlbnNpb24oeyBpZDogdGhpcy5fY2hhdEV4dGVuc2lvbklkIH0pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGRpc2FibGUgYnVpbHRpbiBjaGF0IGV4dGVuc2lvbiBkdXJpbmcgZW5hYmxlbWVudCBtaWdyYXRpb24nLCBlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBoYXNXb3Jrc3BhY2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBhbGxVc2VyRXh0ZW5zaW9uc0Rpc2FibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVudmlyb25tZW50U2VydmljZS5kaXNhYmxlRXh0ZW5zaW9ucyA9PT0gdHJ1ZTtcblx0fVxuXG5cdGdldEVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb246IElFeHRlbnNpb24pOiBFbmFibGVtZW50U3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9jb21wdXRlRW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbiwgdGhpcy5leHRlbnNpb25zTWFuYWdlci5leHRlbnNpb25zLCB0aGlzLmdldFdvcmtzcGFjZVR5cGUoKSk7XG5cdH1cblxuXHRnZXRFbmFibGVtZW50U3RhdGVzKGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgd29ya3NwYWNlVHlwZU92ZXJyaWRlczogUGFydGlhbDxXb3Jrc3BhY2VUeXBlPiA9IHt9KTogRW5hYmxlbWVudFN0YXRlW10ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNFbmFibGVtZW50cyA9IG5ldyBNYXA8SUV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlPigpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVR5cGUgPSB7IC4uLnRoaXMuZ2V0V29ya3NwYWNlVHlwZSgpLCAuLi53b3Jrc3BhY2VUeXBlT3ZlcnJpZGVzIH07XG5cdFx0cmV0dXJuIGV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiB0aGlzLl9jb21wdXRlRW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbiwgZXh0ZW5zaW9ucywgd29ya3NwYWNlVHlwZSwgZXh0ZW5zaW9uc0VuYWJsZW1lbnRzKSk7XG5cdH1cblxuXHRnZXREZXBlbmRlbmNpZXNFbmFibGVtZW50U3RhdGVzKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IFtJRXh0ZW5zaW9uLCBFbmFibGVtZW50U3RhdGVdW10ge1xuXHRcdHJldHVybiBnZXRFeHRlbnNpb25EZXBlbmRlbmNpZXModGhpcy5leHRlbnNpb25zTWFuYWdlci5leHRlbnNpb25zLCBleHRlbnNpb24pLm1hcChlID0+IFtlLCB0aGlzLmdldEVuYWJsZW1lbnRTdGF0ZShlKV0pO1xuXHR9XG5cblx0Y2FuQ2hhbmdlRW5hYmxlbWVudChleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy50aHJvd0Vycm9ySWZDYW5ub3RDaGFuZ2VFbmFibGVtZW50KGV4dGVuc2lvbik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGNhbkNoYW5nZVdvcmtzcGFjZUVuYWJsZW1lbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmNhbkNoYW5nZUVuYWJsZW1lbnQoZXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnRocm93RXJyb3JJZkNhbm5vdENoYW5nZVdvcmtzcGFjZUVuYWJsZW1lbnQoZXh0ZW5zaW9uKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc0RlZmF1bHRPclNldHRpbmdzU3luY0F1dGhQcm92aWRlckV4dGVuc2lvbihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0aWYgKCFpc0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJFeHRlbnNpb24obWFuaWZlc3QpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdEFjY291bnRBdXRoUHJvdmlkZXIgPSB0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKTtcblx0XHRpZiAobWFuaWZlc3QuY29udHJpYnV0ZXMhLmF1dGhlbnRpY2F0aW9uIS5zb21lKGEgPT4gYS5pZCA9PT0gZGVmYXVsdEFjY291bnRBdXRoUHJvdmlkZXIuaWQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSAmJiB0aGlzLnVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLmFjY291bnQgJiZcblx0XHRcdG1hbmlmZXN0LmNvbnRyaWJ1dGVzIS5hdXRoZW50aWNhdGlvbiEuc29tZShhID0+IGEuaWQgPT09IHRoaXMudXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2UuYWNjb3VudCEuYXV0aGVudGljYXRpb25Qcm92aWRlcklkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSB0aHJvd0Vycm9ySWZDYW5ub3RDaGFuZ2VFbmFibGVtZW50KGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgZG9ub3RDaGVja0RlcGVuZGVuY2llcz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoaXNMYW5ndWFnZVBhY2tFeHRlbnNpb24oZXh0ZW5zaW9uLm1hbmlmZXN0KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgZGlzYWJsZSBsYW5ndWFnZSBwYWNrIGV4dGVuc2lvbicsIFwiQ2Fubm90IGNoYW5nZSBlbmFibGVtZW50IG9mIHswfSBleHRlbnNpb24gYmVjYXVzZSBpdCBjb250cmlidXRlcyBsYW5ndWFnZSBwYWNrcy5cIiwgZXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNEZWZhdWx0T3JTZXR0aW5nc1N5bmNBdXRoUHJvdmlkZXJFeHRlbnNpb24oZXh0ZW5zaW9uLm1hbmlmZXN0KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgZGlzYWJsZSBzZXR0aW5ncyBzeW5jIGF1dGggZXh0ZW5zaW9uJywgXCJDYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgb2YgezB9IGV4dGVuc2lvbiBiZWNhdXNlIFNldHRpbmdzIFN5bmMgZGVwZW5kcyBvbiBpdC5cIiwgZXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzRW5hYmxlZEluRW52KGV4dGVuc2lvbikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGNoYW5nZSBlbmFibGVtZW50IGVudmlyb25tZW50JywgXCJDYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgb2YgezB9IGV4dGVuc2lvbiBiZWNhdXNlIGl0IGlzIGVuYWJsZWQgaW4gZW52aXJvbm1lbnRcIiwgZXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50aHJvd0Vycm9ySWZFbmFibGVtZW50U3RhdGVDYW5ub3RCZUNoYW5nZWQoZXh0ZW5zaW9uLCB0aGlzLmdldEVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24pLCBkb25vdENoZWNrRGVwZW5kZW5jaWVzKTtcblx0fVxuXG5cdHByaXZhdGUgdGhyb3dFcnJvcklmRW5hYmxlbWVudFN0YXRlQ2Fubm90QmVDaGFuZ2VkKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgZW5hYmxlbWVudFN0YXRlT2ZFeHRlbnNpb246IEVuYWJsZW1lbnRTdGF0ZSwgZG9ub3RDaGVja0RlcGVuZGVuY2llcz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzd2l0Y2ggKGVuYWJsZW1lbnRTdGF0ZU9mRXh0ZW5zaW9uKSB7XG5cdFx0XHRjYXNlIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RW52aXJvbm1lbnQ6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGNoYW5nZSBkaXNhYmxlbWVudCBlbnZpcm9ubWVudCcsIFwiQ2Fubm90IGNoYW5nZSBlbmFibGVtZW50IG9mIHswfSBleHRlbnNpb24gYmVjYXVzZSBpdCBpcyBkaXNhYmxlZCBpbiBlbnZpcm9ubWVudFwiLCBleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0XHRcdGNhc2UgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlNYWxpY2lvdXM6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGNoYW5nZSBlbmFibGVtZW50IG1hbGljaW91cycsIFwiQ2Fubm90IGNoYW5nZSBlbmFibGVtZW50IG9mIHswfSBleHRlbnNpb24gYmVjYXVzZSBpdCBpcyBtYWxpY2lvdXNcIiwgZXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0XHRjYXNlIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5VmlydHVhbFdvcmtzcGFjZTpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgdmlydHVhbCB3b3Jrc3BhY2UnLCBcIkNhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBvZiB7MH0gZXh0ZW5zaW9uIGJlY2F1c2UgaXQgZG9lcyBub3Qgc3VwcG9ydCB2aXJ0dWFsIHdvcmtzcGFjZXNcIiwgZXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0XHRjYXNlIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZDpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgZXh0ZW5zaW9uIGtpbmQnLCBcIkNhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBvZiB7MH0gZXh0ZW5zaW9uIGJlY2F1c2Ugb2YgaXRzIGV4dGVuc2lvbiBraW5kXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUFsbG93bGlzdDpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgY2hhbmdlIGRpc2FsbG93ZWQgZXh0ZW5zaW9uIGVuYWJsZW1lbnQnLCBcIkNhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBvZiB7MH0gZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgZGlzYWxsb3dlZFwiLCBleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0XHRcdGNhc2UgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlJbnZhbGlkRXh0ZW5zaW9uOlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2Nhbm5vdCBjaGFuZ2UgaW52YWxpZCBleHRlbnNpb24gZW5hYmxlbWVudCcsIFwiQ2Fubm90IGNoYW5nZSBlbmFibGVtZW50IG9mIHswfSBleHRlbnNpb24gYmVjYXVzZSBvZiBpdCBpcyBpbnZhbGlkXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbkRlcGVuZGVuY3k6XG5cdFx0XHRcdGlmIChkb25vdENoZWNrRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQ2FuIGJlIGNoYW5nZWQgb25seSB3aGVuIGFsbCBpdHMgZGVwZW5kZW5jaWVzIGVuYWJsZW1lbnRzIGNhbiBiZSBjaGFuZ2VkXG5cdFx0XHRcdGZvciAoY29uc3QgZGVwZW5kZW5jeSBvZiBnZXRFeHRlbnNpb25EZXBlbmRlbmNpZXModGhpcy5leHRlbnNpb25zTWFuYWdlci5leHRlbnNpb25zLCBleHRlbnNpb24pKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaXNFbmFibGVkKGRlcGVuZGVuY3kpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgZGVwZW5kZW5jeScsIFwiQ2Fubm90IGVuYWJsZSAnezB9JyBleHRlbnNpb24gYmVjYXVzZSBpdCBkZXBlbmRzIG9uICd7MX0nIGV4dGVuc2lvbiB0aGF0IGNhbm5vdCBiZSBlbmFibGVkXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZGVwZW5kZW5jeS5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBkZXBlbmRlbmN5LmlkZW50aWZpZXIuaWQpKTtcblx0XHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdGhyb3dFcnJvcklmQ2Fubm90Q2hhbmdlV29ya3NwYWNlRW5hYmxlbWVudChleHRlbnNpb246IElFeHRlbnNpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaGFzV29ya3NwYWNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ25vV29ya3NwYWNlJywgXCJObyB3b3Jrc3BhY2UuXCIpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc0RlZmF1bHRPclNldHRpbmdzU3luY0F1dGhQcm92aWRlckV4dGVuc2lvbihleHRlbnNpb24ubWFuaWZlc3QpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2Nhbm5vdCBkaXNhYmxlIHNldHRpbmdzIHN5bmMgYXV0aCBleHRlbnNpb24gaW4gd29ya3NwYWNlJywgXCJDYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgb2YgezB9IGV4dGVuc2lvbiBpbiB3b3Jrc3BhY2UgYmVjYXVzZSBTZXR0aW5ncyBTeW5jIGRlcGVuZHMgb24gaXQuXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldEVuYWJsZW1lbnQoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCBuZXdTdGF0ZTogRW5hYmxlbWVudFN0YXRlKTogUHJvbWlzZTxib29sZWFuW10+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNNYW5hZ2VyLndoZW5Jbml0aWFsaXplZCgpO1xuXG5cdFx0aWYgKG5ld1N0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5IHx8IG5ld1N0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSkge1xuXHRcdFx0ZXh0ZW5zaW9ucy5wdXNoKC4uLnRoaXMuZ2V0RXh0ZW5zaW9uc1RvRW5hYmxlUmVjdXJzaXZlbHkoZXh0ZW5zaW9ucywgdGhpcy5leHRlbnNpb25zTWFuYWdlci5leHRlbnNpb25zLCBuZXdTdGF0ZSwgeyBkZXBlbmRlbmNpZXM6IHRydWUsIHBhY2s6IHRydWUgfSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG5ld1N0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UgfHwgbmV3U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0dGhpcy50aHJvd0Vycm9ySWZDYW5ub3RDaGFuZ2VXb3Jrc3BhY2VFbmFibGVtZW50KGV4dGVuc2lvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRocm93RXJyb3JJZkNhbm5vdENoYW5nZUVuYWJsZW1lbnQoZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuZ2V0RW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbik7XG5cdFx0XHRpZiAoZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVRydXN0UmVxdWlyZW1lbnRcblx0XHRcdFx0LyogQWxsIGl0cyBkaXNhYmxlZCBkZXBlbmRlbmNpZXMgYXJlIGRpc2FibGVkIGJ5IFRydXN0IFJlcXVpcmVtZW50ICovXG5cdFx0XHRcdHx8IChlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uRGVwZW5kZW5jeSAmJiB0aGlzLmdldERlcGVuZGVuY2llc0VuYWJsZW1lbnRTdGF0ZXMoZXh0ZW5zaW9uKS5ldmVyeSgoWywgZV0pID0+IHRoaXMuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGUpIHx8IGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5VHJ1c3RSZXF1aXJlbWVudCkpXG5cdFx0XHQpIHtcblx0XHRcdFx0Y29uc3QgdHJ1c3RTdGF0ZSA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3QoKTtcblx0XHRcdFx0cmVzdWx0LnB1c2godHJ1c3RTdGF0ZSA/PyBmYWxzZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucHVzaChhd2FpdCB0aGlzLl9zZXRVc2VyRW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbiwgbmV3U3RhdGUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VkRXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuZmlsdGVyKChlLCBpbmRleCkgPT4gcmVzdWx0W2luZGV4XSk7XG5cdFx0aWYgKGNoYW5nZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fb25FbmFibGVtZW50Q2hhbmdlZC5maXJlKGNoYW5nZWRFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uc1RvRW5hYmxlUmVjdXJzaXZlbHkoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdLCBhbGxFeHRlbnNpb25zOiBSZWFkb25seUFycmF5PElFeHRlbnNpb24+LCBlbmFibGVtZW50U3RhdGU6IEVuYWJsZW1lbnRTdGF0ZSwgb3B0aW9uczogeyBkZXBlbmRlbmNpZXM6IGJvb2xlYW47IHBhY2s6IGJvb2xlYW4gfSwgY2hlY2tlZDogSUV4dGVuc2lvbltdID0gW10pOiBJRXh0ZW5zaW9uW10ge1xuXHRcdGlmICghb3B0aW9ucy5kZXBlbmRlbmNpZXMgJiYgIW9wdGlvbnMucGFjaykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvQ2hlY2sgPSBleHRlbnNpb25zLmZpbHRlcihlID0+IGNoZWNrZWQuaW5kZXhPZihlKSA9PT0gLTEpO1xuXHRcdGlmICghdG9DaGVjay5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0b0NoZWNrKSB7XG5cdFx0XHRjaGVja2VkLnB1c2goZXh0ZW5zaW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25zVG9FbmFibGU6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGFsbEV4dGVuc2lvbnMpIHtcblx0XHRcdC8vIEV4dGVuc2lvbiBpcyBhbHJlYWR5IGNoZWNrZWRcblx0XHRcdGlmIChjaGVja2VkLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0ZU9mRXh0ZW5zaW9uID0gdGhpcy5nZXRFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uKTtcblx0XHRcdC8vIEV4dGVuc2lvbiBpcyBlbmFibGVkXG5cdFx0XHRpZiAodGhpcy5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUoZW5hYmxlbWVudFN0YXRlT2ZFeHRlbnNpb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTa2lwIGlmIGRlcGVuZGVuY3kgZXh0ZW5zaW9uIGlzIGRpc2FibGVkIGJ5IGV4dGVuc2lvbiBraW5kXG5cdFx0XHRpZiAoZW5hYmxlbWVudFN0YXRlT2ZFeHRlbnNpb24gPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGV4dGVuc2lvbiBpcyBhIGRlcGVuZGVuY3kgb3IgaW4gZXh0ZW5zaW9uIHBhY2tcblx0XHRcdGlmIChleHRlbnNpb25zLnNvbWUoZSA9PlxuXHRcdFx0XHQob3B0aW9ucy5kZXBlbmRlbmNpZXMgJiYgZS5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXM/LnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpKVxuXHRcdFx0XHR8fCAob3B0aW9ucy5wYWNrICYmIGUubWFuaWZlc3QuZXh0ZW5zaW9uUGFjaz8uc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpKSkge1xuXG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gZXh0ZW5zaW9uc1RvRW5hYmxlLmZpbmRJbmRleChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblxuXHRcdFx0XHQvLyBFeHRlbnNpb24gaXMgbm90IGFkZGVkIHRvIHRoZSBkaXNhYmxlbWVudCBsaXN0IHNvIGFkZCBpdFxuXHRcdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uc1RvRW5hYmxlLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEV4dGVuc2lvbiBpcyB0aGVyZSBhbHJlYWR5IGluIHRoZSBkaXNhYmxlbWVudCBsaXN0LlxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Ly8gUmVwbGFjZSBvbmx5IGlmIHRoZSBlbmFibGVtZW50IHN0YXRlIGNhbiBiZSBjaGFuZ2VkXG5cdFx0XHRcdFx0XHR0aGlzLnRocm93RXJyb3JJZkVuYWJsZW1lbnRTdGF0ZUNhbm5vdEJlQ2hhbmdlZChleHRlbnNpb24sIGVuYWJsZW1lbnRTdGF0ZU9mRXh0ZW5zaW9uLCB0cnVlKTtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbnNUb0VuYWJsZS5zcGxpY2UoaW5kZXgsIDEsIGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHsgLypEbyBub3QgYWRkKi8gfVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbnNUb0VuYWJsZS5sZW5ndGgpIHtcblx0XHRcdGV4dGVuc2lvbnNUb0VuYWJsZS5wdXNoKC4uLnRoaXMuZ2V0RXh0ZW5zaW9uc1RvRW5hYmxlUmVjdXJzaXZlbHkoZXh0ZW5zaW9uc1RvRW5hYmxlLCBhbGxFeHRlbnNpb25zLCBlbmFibGVtZW50U3RhdGUsIG9wdGlvbnMsIGNoZWNrZWQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZXh0ZW5zaW9uc1RvRW5hYmxlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VXNlckVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb246IElFeHRlbnNpb24sIG5ld1N0YXRlOiBFbmFibGVtZW50U3RhdGUpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRoaXMuX2dldFVzZXJFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXG5cdFx0aWYgKGN1cnJlbnRTdGF0ZSA9PT0gbmV3U3RhdGUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAobmV3U3RhdGUpIHtcblx0XHRcdGNhc2UgRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseTpcblx0XHRcdFx0dGhpcy5fZW5hYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEdsb2JhbGx5OlxuXHRcdFx0XHR0aGlzLl9kaXNhYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlOlxuXHRcdFx0XHR0aGlzLl9lbmFibGVFeHRlbnNpb25JbldvcmtzcGFjZShleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2U6XG5cdFx0XHRcdHRoaXMuX2Rpc2FibGVFeHRlbnNpb25JbldvcmtzcGFjZShleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdH1cblxuXHRpc0VuYWJsZWQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW5hYmxlbWVudFN0YXRlID0gdGhpcy5nZXRFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uKTtcblx0XHRyZXR1cm4gdGhpcy5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUoZW5hYmxlbWVudFN0YXRlKTtcblx0fVxuXG5cdGlzRW5hYmxlZEVuYWJsZW1lbnRTdGF0ZShlbmFibGVtZW50U3RhdGU6IEVuYWJsZW1lbnRTdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkQnlFbnZpcm9ubWVudCB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlIHx8IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseTtcblx0fVxuXG5cdGlzRGlzYWJsZWRHbG9iYWxseShleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNEaXNhYmxlZEdsb2JhbGx5KGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBleHRlbnNpb25zOiBSZWFkb25seUFycmF5PElFeHRlbnNpb24+LCB3b3Jrc3BhY2VUeXBlOiBXb3Jrc3BhY2VUeXBlLCBjb21wdXRlZEVuYWJsZW1lbnRTdGF0ZXM/OiBNYXA8SUV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlPik6IEVuYWJsZW1lbnRTdGF0ZSB7XG5cdFx0Y29tcHV0ZWRFbmFibGVtZW50U3RhdGVzID0gY29tcHV0ZWRFbmFibGVtZW50U3RhdGVzID8/IG5ldyBNYXA8SUV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlPigpO1xuXHRcdGxldCBlbmFibGVtZW50U3RhdGUgPSBjb21wdXRlZEVuYWJsZW1lbnRTdGF0ZXMuZ2V0KGV4dGVuc2lvbik7XG5cdFx0aWYgKGVuYWJsZW1lbnRTdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZW5hYmxlbWVudFN0YXRlO1xuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSB0aGUgY2hhdCBleHRlbnNpb24gaXMgZGlzYWJsZWQgaW4gZnJlc2ggcHJvZmlsZXMgd2hlcmUgY2hhdCBzZXR1cCBpcyBub3QgY29tcGxldGVkLlxuXHRcdC8vIFRoaXMgaXMgY2FsbGVkIGhlcmUgKGluIGFkZGl0aW9uIHRvIHRoZSBjb25zdHJ1Y3RvcikgYmVjYXVzZSBvbiBwcm9maWxlIHN3aXRjaCB0aGVcblx0XHQvLyBlbmFibGVtZW50IHNlcnZpY2UgaXMgbm90IHJlY3JlYXRlZCwgYnV0IHRoZSBzdG9yYWdlIHNjb3BlIGNoYW5nZXMgdG8gdGhlIG5ldyBwcm9maWxlLlxuXHRcdGlmIChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpID09PSB0aGlzLl9jaGF0RXh0ZW5zaW9uSWQpIHtcblx0XHRcdHRoaXMuZW5zdXJlQ2hhdEV4dGVuc2lvbkluaXRpYWxEaXNhYmxlZFN0YXRlKCk7XG5cdFx0fVxuXG5cdFx0ZW5hYmxlbWVudFN0YXRlID0gdGhpcy5fZ2V0VXNlckVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0Y29uc3QgaXNFbmFibGVkID0gdGhpcy5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUoZW5hYmxlbWVudFN0YXRlKTtcblxuXHRcdGlmIChpc01hbGljaW91cyhleHRlbnNpb24uaWRlbnRpZmllciwgdGhpcy5nZXRNYWxpY2lvdXNFeHRlbnNpb25zRm9yQ2hlY2soKSkpIHtcblx0XHRcdGVuYWJsZW1lbnRTdGF0ZSA9IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5TWFsaWNpb3VzO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGlzRW5hYmxlZCAmJiBleHRlbnNpb24udHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5Vc2VyICYmIHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZChleHRlbnNpb24pICE9PSB0cnVlKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUFsbG93bGlzdDtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChpc0VuYWJsZWQgJiYgIWV4dGVuc2lvbi5pc1ZhbGlkKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUludmFsaWRFeHRlbnNpb247XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAodGhpcy5leHRlbnNpb25CaXNlY3RTZXJ2aWNlLmlzRGlzYWJsZWRCeUJpc2VjdChleHRlbnNpb24pKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUVudmlyb25tZW50O1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHRoaXMuX2lzRGlzYWJsZWRJbkVudihleHRlbnNpb24pKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUVudmlyb25tZW50O1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHRoaXMuX2lzRGlzYWJsZWRCeVZpcnR1YWxXb3Jrc3BhY2UoZXh0ZW5zaW9uLCB3b3Jrc3BhY2VUeXBlKSkge1xuXHRcdFx0ZW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlWaXJ0dWFsV29ya3NwYWNlO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGlzRW5hYmxlZCAmJiB0aGlzLl9pc0Rpc2FibGVkQnlXb3Jrc3BhY2VUcnVzdChleHRlbnNpb24sIHdvcmtzcGFjZVR5cGUpKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVRydXN0UmVxdWlyZW1lbnQ7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAodGhpcy5faXNEaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZChleHRlbnNpb24pKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbktpbmQ7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAodGhpcy5faXNEaXNhYmxlZEJ5U2Vzc2lvbnNXaW5kb3coZXh0ZW5zaW9uKSkge1xuXHRcdFx0ZW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFbnZpcm9ubWVudDtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChpc0VuYWJsZWQgJiYgdGhpcy5faXNEaXNhYmxlZEJ5RXh0ZW5zaW9uRGVwZW5kZW5jeShleHRlbnNpb24sIGV4dGVuc2lvbnMsIHdvcmtzcGFjZVR5cGUsIGNvbXB1dGVkRW5hYmxlbWVudFN0YXRlcykpIHtcblx0XHRcdGVuYWJsZW1lbnRTdGF0ZSA9IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uRGVwZW5kZW5jeTtcblx0XHR9XG5cblx0XHRlbHNlIGlmICh0aGlzLl9pc0Rpc2FibGVkQnlVbmlmaWNhdGlvbihleHRlbnNpb24uaWRlbnRpZmllcikpIHtcblx0XHRcdGVuYWJsZW1lbnRTdGF0ZSA9IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5VW5pZmljYXRpb247XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoIWlzRW5hYmxlZCAmJiB0aGlzLl9pc0VuYWJsZWRJbkVudihleHRlbnNpb24pKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEJ5RW52aXJvbm1lbnQ7XG5cdFx0fVxuXG5cdFx0Y29tcHV0ZWRFbmFibGVtZW50U3RhdGVzLnNldChleHRlbnNpb24sIGVuYWJsZW1lbnRTdGF0ZSk7XG5cdFx0cmV0dXJuIGVuYWJsZW1lbnRTdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRGlzYWJsZWRJbkVudihleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5hbGxVc2VyRXh0ZW5zaW9uc0Rpc2FibGVkKSB7XG5cdFx0XHRyZXR1cm4gIWV4dGVuc2lvbi5pc0J1aWx0aW4gJiYgIWlzUmVzb2x2ZXJFeHRlbnNpb24oZXh0ZW5zaW9uLm1hbmlmZXN0LCB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc2FibGVkRXh0ZW5zaW9ucyA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmRpc2FibGVFeHRlbnNpb25zO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGRpc2FibGVkRXh0ZW5zaW9ucykpIHtcblx0XHRcdHJldHVybiBkaXNhYmxlZEV4dGVuc2lvbnMuc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhpcyBpcyB0aGUgYmV0dGVyIG1lcmdlIGV4dGVuc2lvbiB3aGljaCB3YXMgbWlncmF0ZWQgdG8gYSBidWlsdC1pbiBleHRlbnNpb25cblx0XHRpZiAoYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogQmV0dGVyTWVyZ2VJZC52YWx1ZSB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRW5hYmxlZEluRW52KGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVuYWJsZWRFeHRlbnNpb25zID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZW5hYmxlRXh0ZW5zaW9ucztcblx0XHRpZiAoQXJyYXkuaXNBcnJheShlbmFibGVkRXh0ZW5zaW9ucykpIHtcblx0XHRcdHJldHVybiBlbmFibGVkRXh0ZW5zaW9ucy5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEaXNhYmxlZEJ5VmlydHVhbFdvcmtzcGFjZShleHRlbnNpb246IElFeHRlbnNpb24sIHdvcmtzcGFjZVR5cGU6IFdvcmtzcGFjZVR5cGUpOiBib29sZWFuIHtcblx0XHQvLyBOb3QgYSB2aXJ0dWFsIHdvcmtzcGFjZVxuXHRcdGlmICghd29ya3NwYWNlVHlwZS52aXJ0dWFsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gU3VwcG9ydHMgdmlydHVhbCB3b3Jrc3BhY2Vcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldEV4dGVuc2lvblZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0VHlwZShleHRlbnNpb24ubWFuaWZlc3QpICE9PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFdlYiBleHRlbnNpb24gZnJvbSB3ZWIgZXh0ZW5zaW9uIG1hbmFnZW1lbnQgc2VydmVyXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcihleHRlbnNpb24pID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmNhbkV4ZWN1dGVPbldlYihleHRlbnNpb24ubWFuaWZlc3QpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9pc0Rpc2FibGVkQnlFeHRlbnNpb25LaW5kKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgfHwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRjb25zdCBpbnN0YWxsTG9jYXRpb24gPSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmdldEV4dGVuc2lvbkluc3RhbGxMb2NhdGlvbihleHRlbnNpb24pO1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25LaW5kIG9mIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25LaW5kKGV4dGVuc2lvbi5tYW5pZmVzdCkpIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd1aScpIHtcblx0XHRcdFx0XHRpZiAoaW5zdGFsbExvY2F0aW9uID09PSBFeHRlbnNpb25JbnN0YWxsTG9jYXRpb24uTG9jYWwpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd3b3Jrc3BhY2UnKSB7XG5cdFx0XHRcdFx0aWYgKGluc3RhbGxMb2NhdGlvbiA9PT0gRXh0ZW5zaW9uSW5zdGFsbExvY2F0aW9uLlJlbW90ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uS2luZCA9PT0gJ3dlYicpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIC8qIHdlYiAqLykge1xuXHRcdFx0XHRcdFx0aWYgKGluc3RhbGxMb2NhdGlvbiA9PT0gRXh0ZW5zaW9uSW5zdGFsbExvY2F0aW9uLldlYiB8fCBpbnN0YWxsTG9jYXRpb24gPT09IEV4dGVuc2lvbkluc3RhbGxMb2NhdGlvbi5SZW1vdGUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaW5zdGFsbExvY2F0aW9uID09PSBFeHRlbnNpb25JbnN0YWxsTG9jYXRpb24uTG9jYWwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVuYWJsZUxvY2FsV2ViV29ya2VyID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxXZWJXb3JrZXJFeHRIb3N0Q29uZmlnVmFsdWU+KHdlYldvcmtlckV4dEhvc3RDb25maWcpO1xuXHRcdFx0XHRcdFx0aWYgKGVuYWJsZUxvY2FsV2ViV29ya2VyID09PSB0cnVlIHx8IGVuYWJsZUxvY2FsV2ViV29ya2VyID09PSAnYXV0bycpIHtcblx0XHRcdFx0XHRcdFx0Ly8gV2ViIGV4dGVuc2lvbnMgYXJlIGVuYWJsZWQgb24gYWxsIGNvbmZpZ3VyYXRpb25zXG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9pc0Rpc2FibGVkQnlXb3Jrc3BhY2VUcnVzdChleHRlbnNpb246IElFeHRlbnNpb24sIHdvcmtzcGFjZVR5cGU6IFdvcmtzcGFjZVR5cGUpOiBib29sZWFuIHtcblx0XHRpZiAod29ya3NwYWNlVHlwZS50cnVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UoZXh0ZW5zaW9uLmxvY2F0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZShleHRlbnNpb24ubWFuaWZlc3QpID09PSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRGlzYWJsZWRCeUV4dGVuc2lvbkRlcGVuZGVuY3koZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBleHRlbnNpb25zOiBSZWFkb25seUFycmF5PElFeHRlbnNpb24+LCB3b3Jrc3BhY2VUeXBlOiBXb3Jrc3BhY2VUeXBlLCBjb21wdXRlZEVuYWJsZW1lbnRTdGF0ZXM6IE1hcDxJRXh0ZW5zaW9uLCBFbmFibGVtZW50U3RhdGU+KTogYm9vbGVhbiB7XG5cblx0XHRpZiAoIWV4dGVuc2lvbi5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBGaW5kIGRlcGVuZGVuY3kgdGhhdCBpcyBmcm9tIHRoZSBzYW1lIHNlcnZlciBvciBkb2VzIG5vdCBleHBvcnRzIGFueSBBUElcblx0XHRjb25zdCBkZXBlbmRlbmN5RXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuZmlsdGVyKGUgPT5cblx0XHRcdGV4dGVuc2lvbi5tYW5pZmVzdC5leHRlbnNpb25EZXBlbmRlbmNpZXM/LnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCB7IGlkIH0pXG5cdFx0XHRcdCYmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIoZSkgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcihleHRlbnNpb24pIHx8ICgoZS5tYW5pZmVzdC5tYWluIHx8IGUubWFuaWZlc3QuYnJvd3NlcikgJiYgZS5tYW5pZmVzdC5hcGkgPT09ICdub25lJykpKSk7XG5cblx0XHRpZiAoIWRlcGVuZGVuY3lFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0VuYWJsZW1lbnRTdGF0ZSA9IGNvbXB1dGVkRW5hYmxlbWVudFN0YXRlcy5oYXMoZXh0ZW5zaW9uKTtcblx0XHRpZiAoIWhhc0VuYWJsZW1lbnRTdGF0ZSkge1xuXHRcdFx0Ly8gUGxhY2Vob2xkZXIgdG8gaGFuZGxlIGN5Y2xpYyBkZXBzXG5cdFx0XHRjb21wdXRlZEVuYWJsZW1lbnRTdGF0ZXMuc2V0KGV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRlcGVuZGVuY3lFeHRlbnNpb24gb2YgZGVwZW5kZW5jeUV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZW5hYmxlbWVudFN0YXRlID0gdGhpcy5fY29tcHV0ZUVuYWJsZW1lbnRTdGF0ZShkZXBlbmRlbmN5RXh0ZW5zaW9uLCBleHRlbnNpb25zLCB3b3Jrc3BhY2VUeXBlLCBjb21wdXRlZEVuYWJsZW1lbnRTdGF0ZXMpO1xuXHRcdFx0XHRpZiAoIXRoaXMuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGVuYWJsZW1lbnRTdGF0ZSkgJiYgZW5hYmxlbWVudFN0YXRlICE9PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbktpbmQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoIWhhc0VuYWJsZW1lbnRTdGF0ZSkge1xuXHRcdFx0XHQvLyByZW1vdmUgdGhlIHBsYWNlaG9sZGVyXG5cdFx0XHRcdGNvbXB1dGVkRW5hYmxlbWVudFN0YXRlcy5kZWxldGUoZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRVc2VyRW5hYmxlbWVudFN0YXRlKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogRW5hYmxlbWVudFN0YXRlIHtcblx0XHRpZiAodGhpcy5oYXNXb3Jrc3BhY2UpIHtcblx0XHRcdGlmICh0aGlzLl9nZXRXb3Jrc3BhY2VFbmFibGVkRXh0ZW5zaW9ucygpLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUsIGlkZW50aWZpZXIpKVswXSkge1xuXHRcdFx0XHRyZXR1cm4gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9nZXRXb3Jrc3BhY2VEaXNhYmxlZEV4dGVuc2lvbnMoKS5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLCBpZGVudGlmaWVyKSlbMF0pIHtcblx0XHRcdFx0cmV0dXJuIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzRGlzYWJsZWRHbG9iYWxseShpZGVudGlmaWVyKSkge1xuXHRcdFx0cmV0dXJuIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEdsb2JhbGx5O1xuXHRcdH1cblx0XHRyZXR1cm4gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRGlzYWJsZWRHbG9iYWxseShpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldERpc2FibGVkRXh0ZW5zaW9ucygpLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLCBpZGVudGlmaWVyKSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0Rpc2FibGVkQnlVbmlmaWNhdGlvbihpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25VbmlmaWNhdGlvbkVuYWJsZWQgJiYgaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpID09PSB0aGlzLl9jb21wbGV0aW9uc0V4dGVuc2lvbklkO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEaXNhYmxlZEJ5U2Vzc2lvbnNXaW5kb3coZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQWxsb3ctbGlzdGVkIGV4dGVuc2lvbnMgYXJlIGFsd2F5cyBlbmFibGVkIGluIHRoZSBzZXNzaW9ucyB3aW5kb3cuXG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25zV2luZG93QWxsb3dlZEV4dGVuc2lvbnMuaGFzKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbHQtaW4gZXh0ZW5zaW9ucyBhcmUgZW5hYmxlZCBpbiBzZXNzaW9ucyB3aW5kb3cgZXhjZXB0IHRoZSBjaGF0IGV4dGVuc2lvbiBhbmQgZXh0ZW5zaW9ucyB0aGF0IGNvbnRyaWJ1dGUgbm90IHN1cHBvcnRlZCBmZWF0dXJlcy5cblx0XHRpZiAoZXh0ZW5zaW9uLmlzQnVpbHRpbikge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkgPT09IHRoaXMuX2NoYXRFeHRlbnNpb25JZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVzID0gZXh0ZW5zaW9uLm1hbmlmZXN0LmNvbnRyaWJ1dGVzO1xuXHRcdFx0aWYgKGNvbnRyaWJ1dGVzPy5kZWJ1Z2dlcnMgfHwgY29udHJpYnV0ZXM/LnZpZXdzIHx8IGNvbnRyaWJ1dGVzPy52aWV3c0NvbnRhaW5lcnMgfHwgY29udHJpYnV0ZXM/LndhbGt0aHJvdWdocykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiAhdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmNhbkV4ZWN1dGVPblNlc3Npb25zV2luZG93KGV4dGVuc2lvbi5tYW5pZmVzdCk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmFibGVFeHRlbnNpb24oaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLl9yZW1vdmVGcm9tV29ya3NwYWNlRGlzYWJsZWRFeHRlbnNpb25zKGlkZW50aWZpZXIpO1xuXHRcdHRoaXMuX3JlbW92ZUZyb21Xb3Jrc3BhY2VFbmFibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gdGhpcy5nbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZS5lbmFibGVFeHRlbnNpb24oaWRlbnRpZmllciwgU09VUkNFKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc2FibGVFeHRlbnNpb24oaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLl9yZW1vdmVGcm9tV29ya3NwYWNlRGlzYWJsZWRFeHRlbnNpb25zKGlkZW50aWZpZXIpO1xuXHRcdHRoaXMuX3JlbW92ZUZyb21Xb3Jrc3BhY2VFbmFibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gdGhpcy5nbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZS5kaXNhYmxlRXh0ZW5zaW9uKGlkZW50aWZpZXIsIFNPVVJDRSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmFibGVFeHRlbnNpb25JbldvcmtzcGFjZShpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdHRoaXMuX3JlbW92ZUZyb21Xb3Jrc3BhY2VEaXNhYmxlZEV4dGVuc2lvbnMoaWRlbnRpZmllcik7XG5cdFx0dGhpcy5fYWRkVG9Xb3Jrc3BhY2VFbmFibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc2FibGVFeHRlbnNpb25JbldvcmtzcGFjZShpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdHRoaXMuX2FkZFRvV29ya3NwYWNlRGlzYWJsZWRFeHRlbnNpb25zKGlkZW50aWZpZXIpO1xuXHRcdHRoaXMuX3JlbW92ZUZyb21Xb3Jrc3BhY2VFbmFibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZFRvV29ya3NwYWNlRGlzYWJsZWRFeHRlbnNpb25zKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLmhhc1dvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdFx0fVxuXHRcdGNvbnN0IGRpc2FibGVkRXh0ZW5zaW9ucyA9IHRoaXMuX2dldFdvcmtzcGFjZURpc2FibGVkRXh0ZW5zaW9ucygpO1xuXHRcdGlmIChkaXNhYmxlZEV4dGVuc2lvbnMuZXZlcnkoZSA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoZSwgaWRlbnRpZmllcikpKSB7XG5cdFx0XHRkaXNhYmxlZEV4dGVuc2lvbnMucHVzaChpZGVudGlmaWVyKTtcblx0XHRcdHRoaXMuX3NldERpc2FibGVkRXh0ZW5zaW9ucyhkaXNhYmxlZEV4dGVuc2lvbnMpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZW1vdmVGcm9tV29ya3NwYWNlRGlzYWJsZWRFeHRlbnNpb25zKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLmhhc1dvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBkaXNhYmxlZEV4dGVuc2lvbnMgPSB0aGlzLl9nZXRXb3Jrc3BhY2VEaXNhYmxlZEV4dGVuc2lvbnMoKTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZGlzYWJsZWRFeHRlbnNpb25zLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgZGlzYWJsZWRFeHRlbnNpb24gPSBkaXNhYmxlZEV4dGVuc2lvbnNbaW5kZXhdO1xuXHRcdFx0aWYgKGFyZVNhbWVFeHRlbnNpb25zKGRpc2FibGVkRXh0ZW5zaW9uLCBpZGVudGlmaWVyKSkge1xuXHRcdFx0XHRkaXNhYmxlZEV4dGVuc2lvbnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0dGhpcy5fc2V0RGlzYWJsZWRFeHRlbnNpb25zKGRpc2FibGVkRXh0ZW5zaW9ucyk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRUb1dvcmtzcGFjZUVuYWJsZWRFeHRlbnNpb25zKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmhhc1dvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVkRXh0ZW5zaW9ucyA9IHRoaXMuX2dldFdvcmtzcGFjZUVuYWJsZWRFeHRlbnNpb25zKCk7XG5cdFx0aWYgKGVuYWJsZWRFeHRlbnNpb25zLmV2ZXJ5KGUgPT4gIWFyZVNhbWVFeHRlbnNpb25zKGUsIGlkZW50aWZpZXIpKSkge1xuXHRcdFx0ZW5hYmxlZEV4dGVuc2lvbnMucHVzaChpZGVudGlmaWVyKTtcblx0XHRcdHRoaXMuX3NldEVuYWJsZWRFeHRlbnNpb25zKGVuYWJsZWRFeHRlbnNpb25zKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVGcm9tV29ya3NwYWNlRW5hYmxlZEV4dGVuc2lvbnMoaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuaGFzV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGVuYWJsZWRFeHRlbnNpb25zID0gdGhpcy5fZ2V0V29ya3NwYWNlRW5hYmxlZEV4dGVuc2lvbnMoKTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZW5hYmxlZEV4dGVuc2lvbnMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBkaXNhYmxlZEV4dGVuc2lvbiA9IGVuYWJsZWRFeHRlbnNpb25zW2luZGV4XTtcblx0XHRcdGlmIChhcmVTYW1lRXh0ZW5zaW9ucyhkaXNhYmxlZEV4dGVuc2lvbiwgaWRlbnRpZmllcikpIHtcblx0XHRcdFx0ZW5hYmxlZEV4dGVuc2lvbnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0dGhpcy5fc2V0RW5hYmxlZEV4dGVuc2lvbnMoZW5hYmxlZEV4dGVuc2lvbnMpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRXb3Jrc3BhY2VFbmFibGVkRXh0ZW5zaW9ucygpOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0RXh0ZW5zaW9ucyhFTkFCTEVEX0VYVEVOU0lPTlNfU1RPUkFHRV9QQVRIKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEVuYWJsZWRFeHRlbnNpb25zKGVuYWJsZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0RXh0ZW5zaW9ucyhFTkFCTEVEX0VYVEVOU0lPTlNfU1RPUkFHRV9QQVRILCBlbmFibGVkRXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFdvcmtzcGFjZURpc2FibGVkRXh0ZW5zaW9ucygpOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0RXh0ZW5zaW9ucyhESVNBQkxFRF9FWFRFTlNJT05TX1NUT1JBR0VfUEFUSCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXREaXNhYmxlZEV4dGVuc2lvbnMoZGlzYWJsZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0RXh0ZW5zaW9ucyhESVNBQkxFRF9FWFRFTlNJT05TX1NUT1JBR0VfUEFUSCwgZGlzYWJsZWRFeHRlbnNpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEV4dGVuc2lvbnMoc3RvcmFnZUlkOiBzdHJpbmcpOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdIHtcblx0XHRpZiAoIXRoaXMuaGFzV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VNYW5hZ2VyLmdldChzdG9yYWdlSWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RXh0ZW5zaW9ucyhzdG9yYWdlSWQ6IHN0cmluZywgZXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZU1hbmFnZXIuc2V0KHN0b3JhZ2VJZCwgZXh0ZW5zaW9ucywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vbkRpZENoYW5nZUdsb2JhbGx5RGlzYWJsZWRFeHRlbnNpb25zKGV4dGVuc2lvbklkZW50aWZpZXJzOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25JZGVudGlmaWVyPiwgc291cmNlPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNvdXJjZSAhPT0gU09VUkNFKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNNYW5hZ2VyLndoZW5Jbml0aWFsaXplZCgpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IHRoaXMuZXh0ZW5zaW9uc01hbmFnZXIuZXh0ZW5zaW9ucy5maWx0ZXIoaW5zdGFsbGVkRXh0ZW5zaW9uID0+IGV4dGVuc2lvbklkZW50aWZpZXJzLnNvbWUoaWRlbnRpZmllciA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhpZGVudGlmaWVyLCBpbnN0YWxsZWRFeHRlbnNpb24uaWRlbnRpZmllcikpKTtcblx0XHRcdHRoaXMuX29uRW5hYmxlbWVudENoYW5nZWQuZmlyZShleHRlbnNpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUV4dGVuc2lvbnMoYWRkZWQ6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbj4sIHJlbW92ZWQ6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbj4sIGlzUHJvZmlsZVN3aXRjaDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBhZGRlZC5maWx0ZXIoZSA9PiAhdGhpcy5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUodGhpcy5nZXRFbmFibGVtZW50U3RhdGUoZSkpKTtcblx0XHRjb25zdCBleGlzdGluZ0Rpc2FibGVkRXh0ZW5zaW9ucyA9IHRoaXMuZXh0ZW5zaW9uc0Rpc2FibGVkRXh0ZW5zaW9ucztcblx0XHR0aGlzLmV4dGVuc2lvbnNEaXNhYmxlZEV4dGVuc2lvbnMgPSB0aGlzLmV4dGVuc2lvbnNNYW5hZ2VyLmV4dGVuc2lvbnMuZmlsdGVyKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50U3RhdGUgPSB0aGlzLmdldEVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24pO1xuXHRcdFx0cmV0dXJuIGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25EZXBlbmRlbmN5IHx8IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlBbGxvd2xpc3QgfHwgZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeU1hbGljaW91cztcblx0XHR9KTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleGlzdGluZ0Rpc2FibGVkRXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uc0Rpc2FibGVkRXh0ZW5zaW9ucy5ldmVyeShlID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0Y2hhbmdlZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0aGlzLmV4dGVuc2lvbnNEaXNhYmxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChleGlzdGluZ0Rpc2FibGVkRXh0ZW5zaW9ucy5ldmVyeShlID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0Y2hhbmdlZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY2hhbmdlZEV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9vbkVuYWJsZW1lbnRDaGFuZ2VkLmZpcmUoY2hhbmdlZEV4dGVuc2lvbnMpO1xuXHRcdH1cblx0XHRpZiAoIWlzUHJvZmlsZVN3aXRjaCkge1xuXHRcdFx0cmVtb3ZlZC5mb3JFYWNoKCh7IGlkZW50aWZpZXIgfSkgPT4gdGhpcy5fcmVzZXQoaWRlbnRpZmllcikpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGVFeHRlbnNpb25zRW5hYmxlbWVudHNXaGVuV29ya3NwYWNlVHJ1c3RDaGFuZ2VzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc01hbmFnZXIud2hlbkluaXRpYWxpemVkKCk7XG5cblx0XHRjb25zdCBjb21wdXRlRW5hYmxlbWVudFN0YXRlcyA9ICh3b3Jrc3BhY2VUeXBlOiBXb3Jrc3BhY2VUeXBlKTogW0lFeHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZV1bXSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zRW5hYmxlbWVudHMgPSBuZXcgTWFwPElFeHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZT4oKTtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNNYW5hZ2VyLmV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiBbZXh0ZW5zaW9uLCB0aGlzLl9jb21wdXRlRW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbiwgdGhpcy5leHRlbnNpb25zTWFuYWdlci5leHRlbnNpb25zLCB3b3Jrc3BhY2VUeXBlLCBleHRlbnNpb25zRW5hYmxlbWVudHMpXSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZVR5cGUgPSB0aGlzLmdldFdvcmtzcGFjZVR5cGUoKTtcblx0XHRjb25zdCBlbmFibGVtZW50U3RhdGVzV2l0aFRydXN0ZWRXb3Jrc3BhY2UgPSBjb21wdXRlRW5hYmxlbWVudFN0YXRlcyh7IC4uLndvcmtzcGFjZVR5cGUsIHRydXN0ZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgZW5hYmxlbWVudFN0YXRlc1dpdGhVbnRydXN0ZWRXb3Jrc3BhY2UgPSBjb21wdXRlRW5hYmxlbWVudFN0YXRlcyh7IC4uLndvcmtzcGFjZVR5cGUsIHRydXN0ZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGVuYWJsZW1lbnRDaGFuZ2VkRXh0ZW5zaW9uc0JlY2F1c2VPZlRydXN0ID0gZW5hYmxlbWVudFN0YXRlc1dpdGhUcnVzdGVkV29ya3NwYWNlLmZpbHRlcigoWywgZW5hYmxlbWVudFN0YXRlXSwgaW5kZXgpID0+IGVuYWJsZW1lbnRTdGF0ZSAhPT0gZW5hYmxlbWVudFN0YXRlc1dpdGhVbnRydXN0ZWRXb3Jrc3BhY2VbaW5kZXhdWzFdKS5tYXAoKFtleHRlbnNpb25dKSA9PiBleHRlbnNpb24pO1xuXG5cdFx0aWYgKGVuYWJsZW1lbnRDaGFuZ2VkRXh0ZW5zaW9uc0JlY2F1c2VPZlRydXN0Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fb25FbmFibGVtZW50Q2hhbmdlZC5maXJlKGVuYWJsZW1lbnRDaGFuZ2VkRXh0ZW5zaW9uc0JlY2F1c2VPZlRydXN0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmtzcGFjZVR5cGUoKTogV29ya3NwYWNlVHlwZSB7XG5cdFx0cmV0dXJuIHsgdHJ1c3RlZDogdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpLCB2aXJ0dWFsOiBpc1ZpcnR1YWxXb3Jrc3BhY2UodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSkgfTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0KGV4dGVuc2lvbjogSUV4dGVuc2lvbklkZW50aWZpZXIpIHtcblx0XHR0aGlzLl9yZW1vdmVGcm9tV29ya3NwYWNlRGlzYWJsZWRFeHRlbnNpb25zKGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcmVtb3ZlRnJvbVdvcmtzcGFjZUVuYWJsZWRFeHRlbnNpb25zKGV4dGVuc2lvbik7XG5cdFx0dGhpcy5nbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZS5lbmFibGVFeHRlbnNpb24oZXh0ZW5zaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgbG9vcENoZWNrRm9yTWFsaWNpb3VzRXh0ZW5zaW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLmNoZWNrRm9yTWFsaWNpb3VzRXh0ZW5zaW9ucygpXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLmRlbGF5ZXIudHJpZ2dlcigoKSA9PiB7IH0sIDEwMDAgKiA2MCAqIDUpKSAvLyBldmVyeSBmaXZlIG1pbnV0ZXNcblx0XHRcdC50aGVuKCgpID0+IHRoaXMubG9vcENoZWNrRm9yTWFsaWNpb3VzRXh0ZW5zaW9ucygpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tGb3JNYWxpY2lvdXNFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zQ29udHJvbE1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gdGhpcy5zdG9yZU1hbGljaW91c0V4dGVuc2lvbnMoZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdC5tYWxpY2lvdXMubWFwKCh7IGV4dGVuc2lvbk9yUHVibGlzaGVyIH0pID0+IGV4dGVuc2lvbk9yUHVibGlzaGVyKSk7XG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnMoW10sIFtdLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE1hbGljaW91c0V4dGVuc2lvbnMoKTogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uSWRlbnRpZmllciB8IHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChNQUxJQ0lPVVNfRVhURU5TSU9OU19TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBbXSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1hbGljaW91c0V4dGVuc2lvbnNGb3JDaGVjaygpOiBSZWFkb25seUFycmF5PE1hbGljaW91c0V4dGVuc2lvbkluZm8+IHtcblx0XHRpZiAoIXRoaXMuX21hbGljaW91c0V4dGVuc2lvbnNDYWNoZSkge1xuXHRcdFx0dGhpcy5fbWFsaWNpb3VzRXh0ZW5zaW9uc0NhY2hlID0gdGhpcy5nZXRNYWxpY2lvdXNFeHRlbnNpb25zKCkubWFwKGV4dGVuc2lvbk9yUHVibGlzaGVyID0+ICh7IGV4dGVuc2lvbk9yUHVibGlzaGVyIH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21hbGljaW91c0V4dGVuc2lvbnNDYWNoZTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcmVNYWxpY2lvdXNFeHRlbnNpb25zKGV4dGVuc2lvbnM6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbklkZW50aWZpZXIgfCBzdHJpbmc+KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldE1hbGljaW91c0V4dGVuc2lvbnMoKTtcblx0XHRpZiAoZXF1YWxzKGV4aXN0aW5nLCBleHRlbnNpb25zLCAoYSwgYikgPT4gIWlzU3RyaW5nKGEpICYmICFpc1N0cmluZyhiKSA/IGFyZVNhbWVFeHRlbnNpb25zKGEsIGIpIDogYSA9PT0gYikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fbWFsaWNpb3VzRXh0ZW5zaW9uc0NhY2hlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoTUFMSUNJT1VTX0VYVEVOU0lPTlNfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KGV4dGVuc2lvbnMpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuY2xhc3MgRXh0ZW5zaW9uc01hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9leHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0Z2V0IGV4dGVuc2lvbnMoKTogcmVhZG9ubHkgSUV4dGVuc2lvbltdIHsgcmV0dXJuIHRoaXMuX2V4dGVuc2lvbnM7IH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGFkZGVkOiByZWFkb25seSBJRXh0ZW5zaW9uW107IHJlbW92ZWQ6IHJlYWRvbmx5IElFeHRlbnNpb25bXTsgcmVhZG9ubHkgaXNQcm9maWxlU3dpdGNoOiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUV4dGVuc2lvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpbml0aWFsaXplUHJvbWlzZTtcblx0cHJpdmF0ZSBkaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuZGlzcG9zZWQgPSB0cnVlKSk7XG5cdFx0dGhpcy5pbml0aWFsaXplUHJvbWlzZSA9IHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHR9XG5cblx0d2hlbkluaXRpYWxpemVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmluaXRpYWxpemVQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25zID0gW1xuXHRcdFx0XHQuLi5hd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCgpLFxuXHRcdFx0XHQuLi5hd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZFdvcmtzcGFjZUV4dGVuc2lvbnModHJ1ZSlcblx0XHRcdF07XG5cdFx0XHRpZiAodGhpcy5kaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnMuZmlyZSh7IGFkZGVkOiB0aGlzLmV4dGVuc2lvbnMsIHJlbW92ZWQ6IFtdLCBpc1Byb2ZpbGVTd2l0Y2g6IGZhbHNlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMoZSA9PlxuXHRcdFx0dGhpcy51cGRhdGVFeHRlbnNpb25zKGUucmVkdWNlPElFeHRlbnNpb25bXT4oKHJlc3VsdCwgeyBsb2NhbCwgb3BlcmF0aW9uIH0pID0+IHtcblx0XHRcdFx0aWYgKGxvY2FsICYmIG9wZXJhdGlvbiAhPT0gSW5zdGFsbE9wZXJhdGlvbi5NaWdyYXRlKSB7IHJlc3VsdC5wdXNoKGxvY2FsKTsgfSByZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSwgW10pLCBbXSwgdW5kZWZpbmVkLCBmYWxzZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiwgKGUgPT4gIWUuZXJyb3IpKShlID0+IHRoaXMudXBkYXRlRXh0ZW5zaW9ucyhbXSwgW2UuaWRlbnRpZmllcl0sIGUuc2VydmVyLCBmYWxzZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvZmlsZSgoeyBhZGRlZCwgcmVtb3ZlZCwgc2VydmVyIH0pID0+IHtcblx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9ucyhhZGRlZCwgcmVtb3ZlZC5tYXAoKHsgaWRlbnRpZmllciB9KSA9PiBpZGVudGlmaWVyKSwgc2VydmVyLCB0cnVlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUV4dGVuc2lvbnMoYWRkZWQ6IElFeHRlbnNpb25bXSwgaWRlbnRpZmllcnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10sIHNlcnZlcjogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgfCB1bmRlZmluZWQsIGlzUHJvZmlsZVN3aXRjaDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChhZGRlZC5sZW5ndGgpIHtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGFkZGVkKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblNlcnZlciA9IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcihleHRlbnNpb24pO1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2V4dGVuc2lvbnMuZmluZEluZGV4KGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikgJiYgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKGUpID09PSBleHRlbnNpb25TZXJ2ZXIpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9leHRlbnNpb25zLnB1c2goLi4uYWRkZWQpO1xuXHRcdH1cblx0XHRjb25zdCByZW1vdmVkOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgaWRlbnRpZmllcnMpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZXh0ZW5zaW9ucy5maW5kSW5kZXgoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGlkZW50aWZpZXIpICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcihlKSA9PT0gc2VydmVyKTtcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0cmVtb3ZlZC5wdXNoKC4uLnRoaXMuX2V4dGVuc2lvbnMuc3BsaWNlKGluZGV4LCAxKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChhZGRlZC5sZW5ndGggfHwgcmVtb3ZlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9ucy5maXJlKHsgYWRkZWQsIHJlbW92ZWQsIGlzUHJvZmlsZVN3aXRjaCB9KTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyw2QkFBbUQsbUNBQW1DLGlDQUFpQyxrQ0FBa0Msa0JBQWtCLGlDQUF5RDtBQUM3TyxTQUFTLHNDQUFzQyxpQkFBaUIsbUNBQW1DLHNDQUFrRSxnQ0FBZ0M7QUFDck0sU0FBUyxtQkFBbUIsZUFBZSwwQkFBMEIsbUJBQW1CO0FBQ3hGLFNBQVMsMEJBQTBCLHNCQUFzQjtBQUN6RCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGVBQStDLG1DQUFtQyx5QkFBeUIsMkJBQTJCO0FBQy9JLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUEyRDtBQUNwRSxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUyxzQkFBc0Isc0JBQXNCLGdCQUFnQjtBQUNyRSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGtDQUFrQyxxQ0FBcUM7QUFDaEYsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUywwQkFB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
