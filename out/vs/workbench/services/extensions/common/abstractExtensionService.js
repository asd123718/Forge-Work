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
import { Barrier } from "../../../../base/common/async.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as perf from "../../../../base/common/performance.js";
import { isCI } from "../../../../base/common/platform.js";
import { isEqualOrParent } from "../../../../base/common/resources.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { isDefined } from "../../../../base/common/types.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstallOperation } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { ImplicitActivationEvents } from "../../../../platform/extensionManagement/common/implicitActivationEvents.js";
import { ExtensionIdentifier, ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { handleVetos } from "../../../../platform/lifecycle/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, getRemoteAuthorityPrefix } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IRemoteExtensionsScannerService } from "../../../../platform/remote/common/remoteExtensionsScanner.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { Extensions as ExtensionFeaturesExtensions } from "../../extensionManagement/common/extensionFeatures.js";
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { LockableExtensionDescriptionRegistry } from "./extensionDescriptionRegistry.js";
import { parseExtensionDevOptions } from "./extensionDevOptions.js";
import { ExtensionHostKind, ExtensionRunningPreference } from "./extensionHostKind.js";
import { ExtensionHostManager } from "./extensionHostManager.js";
import { IExtensionManifestPropertiesService } from "./extensionManifestPropertiesService.js";
import { LocalProcessRunningLocation, LocalWebWorkerRunningLocation, RemoteRunningLocation } from "./extensionRunningLocation.js";
import { ExtensionRunningLocationTracker, filterExtensionIdentifiers } from "./extensionRunningLocationTracker.js";
import { ActivationKind, ActivationTimes, ExtensionHostStartup, ExtensionPointContribution, setProposedApiUsageReporter, toExtension, toExtensionDescription } from "./extensions.js";
import { ExtensionMessageCollector, ExtensionsRegistry } from "./extensionsRegistry.js";
import { LazyCreateExtensionHostManager } from "./lazyCreateExtensionHostManager.js";
import { ResponsiveState } from "./rpcProtocol.js";
import { checkActivateWorkspaceContainsExtension, checkGlobFileExists } from "./workspaceContains.js";
import { ILifecycleService, WillShutdownJoinerOrder } from "../../lifecycle/common/lifecycle.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
const hasOwnProperty = Object.hasOwnProperty;
const NO_OP_VOID_PROMISE = Promise.resolve(void 0);
let AbstractExtensionService = class extends Disposable {
  constructor(options, _extensionsProposedApi, _extensionHostFactory, _extensionHostKindPicker, _instantiationService, _notificationService, _environmentService, _telemetryService, _extensionEnablementService, _fileService, _productService, _extensionManagementService, _contextService, _configurationService, _extensionManifestPropertiesService, _logService, _remoteAgentService, _remoteExtensionsScannerService, _lifecycleService, _remoteAuthorityResolverService, _dialogService) {
    super();
    this._extensionsProposedApi = _extensionsProposedApi;
    this._extensionHostFactory = _extensionHostFactory;
    this._extensionHostKindPicker = _extensionHostKindPicker;
    this._instantiationService = _instantiationService;
    this._notificationService = _notificationService;
    this._environmentService = _environmentService;
    this._telemetryService = _telemetryService;
    this._extensionEnablementService = _extensionEnablementService;
    this._fileService = _fileService;
    this._productService = _productService;
    this._extensionManagementService = _extensionManagementService;
    this._contextService = _contextService;
    this._configurationService = _configurationService;
    this._extensionManifestPropertiesService = _extensionManifestPropertiesService;
    this._logService = _logService;
    this._remoteAgentService = _remoteAgentService;
    this._remoteExtensionsScannerService = _remoteExtensionsScannerService;
    this._lifecycleService = _lifecycleService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._dialogService = _dialogService;
    this._onDidRegisterExtensions = this._register(new Emitter());
    this.onDidRegisterExtensions = this._onDidRegisterExtensions.event;
    this._onDidChangeExtensionsStatus = this._register(new Emitter());
    this.onDidChangeExtensionsStatus = this._onDidChangeExtensionsStatus.event;
    this._onDidChangeExtensions = this._register(new Emitter({ leakWarningThreshold: 400, leakWarningName: "ExtensionService._onDidChangeExtensions" }));
    this.onDidChangeExtensions = this._onDidChangeExtensions.event;
    this._onWillActivateByEvent = this._register(new Emitter());
    this.onWillActivateByEvent = this._onWillActivateByEvent.event;
    this._onDidChangeResponsiveChange = this._register(new Emitter());
    this.onDidChangeResponsiveChange = this._onDidChangeResponsiveChange.event;
    this._onWillStop = this._register(new Emitter());
    this.onWillStop = this._onWillStop.event;
    this._activationEventReader = new ImplicitActivationAwareReader();
    this._registry = new LockableExtensionDescriptionRegistry(this._activationEventReader);
    this._installedExtensionsReady = new Barrier();
    this._extensionStatus = new ExtensionIdentifierMap();
    this._allRequestedActivateEvents = /* @__PURE__ */ new Set();
    this._pendingRemoteActivationEvents = /* @__PURE__ */ new Set();
    this._remoteCrashTracker = new ExtensionHostCrashTracker();
    this._deltaExtensionsQueue = [];
    this._inHandleDeltaExtensions = false;
    this._extensionHostManagers = this._register(new ExtensionHostCollection());
    this._resolveAuthorityAttempt = 0;
    //#endregion
    this._initializePromise = null;
    this._hasLocalProcess = options.hasLocalProcess;
    this._allowRemoteExtensionsInLocalWebWorker = options.allowRemoteExtensionsInLocalWebWorker;
    this._register(this._fileService.onWillActivateFileSystemProvider((e) => {
      if (e.scheme !== Schemas.vscodeRemote) {
        e.join(this.activateByEvent(`onFileSystem:${e.scheme}`));
      }
    }));
    this._register(setProposedApiUsageReporter((usage) => this._reportProposedApiUsage(usage)));
    this._runningLocations = new ExtensionRunningLocationTracker(
      this._registry,
      this._extensionHostKindPicker,
      this._environmentService,
      this._configurationService,
      this._logService,
      this._extensionManifestPropertiesService
    );
    this._register(this._extensionEnablementService.onEnablementChanged((extensions) => {
      const toAdd = [];
      const toRemove = [];
      for (const extension of extensions) {
        if (this._safeInvokeIsEnabled(extension)) {
          toAdd.push(extension);
        } else {
          toRemove.push(extension);
        }
      }
      if (isCI) {
        this._logService.info(`AbstractExtensionService.onEnablementChanged fired for ${extensions.map((e) => e.identifier.id).join(", ")}`);
      }
      this._handleDeltaExtensions(new DeltaExtensionsQueueItem(toAdd, toRemove));
    }));
    this._register(this._extensionManagementService.onDidChangeProfile(({ added, removed }) => {
      if (added.length || removed.length) {
        if (isCI) {
          this._logService.info(`AbstractExtensionService.onDidChangeProfile fired`);
        }
        this._handleDeltaExtensions(new DeltaExtensionsQueueItem(added, removed));
      }
    }));
    this._register(this._extensionManagementService.onDidEnableExtensions((extensions) => {
      if (extensions.length) {
        if (isCI) {
          this._logService.info(`AbstractExtensionService.onDidEnableExtensions fired`);
        }
        this._handleDeltaExtensions(new DeltaExtensionsQueueItem(extensions, []));
      }
    }));
    this._register(this._extensionManagementService.onDidInstallExtensions((result) => {
      const extensions = [];
      const toRemove = [];
      for (const { local, operation } of result) {
        if (local && local.isValid && operation !== InstallOperation.Migrate && this._safeInvokeIsEnabled(local)) {
          extensions.push(local);
          if (operation === InstallOperation.Update) {
            toRemove.push(local.identifier.id);
          }
        }
      }
      if (extensions.length) {
        if (isCI) {
          this._logService.info(`AbstractExtensionService.onDidInstallExtensions fired for ${extensions.map((e) => e.identifier.id).join(", ")}`);
        }
        this._handleDeltaExtensions(new DeltaExtensionsQueueItem(extensions, toRemove));
      }
    }));
    this._register(this._extensionManagementService.onDidUninstallExtension((event) => {
      if (!event.error) {
        if (isCI) {
          this._logService.info(`AbstractExtensionService.onDidUninstallExtension fired for ${event.identifier.id}`);
        }
        this._handleDeltaExtensions(new DeltaExtensionsQueueItem([], [event.identifier.id]));
      }
    }));
    this._register(this._lifecycleService.onWillShutdown((event) => {
      if (this._remoteAgentService.getConnection()) {
        event.join(async () => {
          try {
            await this._remoteAgentService.endConnection();
            await this._doStopExtensionHosts();
            this._remoteAgentService.getConnection()?.dispose();
          } catch {
            this._logService.warn("Error while disconnecting remote agent");
          }
        }, {
          id: "join.disconnectRemote",
          label: nls.localize("disconnectRemote", "Disconnect Remote Agent"),
          order: WillShutdownJoinerOrder.Last
          // after others have joined that might depend on a remote connection
        });
      } else {
        event.join(this._doStopExtensionHosts(), {
          id: "join.stopExtensionHosts",
          label: nls.localize("stopExtensionHosts", "Stopping Extension Hosts")
        });
      }
    }));
  }
  _getExtensionHostManagers(kind) {
    return this._extensionHostManagers.getByKind(kind);
  }
  //#region deltaExtensions
  async _handleDeltaExtensions(item) {
    this._deltaExtensionsQueue.push(item);
    if (this._inHandleDeltaExtensions) {
      return;
    }
    let lock = null;
    try {
      this._inHandleDeltaExtensions = true;
      await this._installedExtensionsReady.wait();
      lock = await this._registry.acquireLock("handleDeltaExtensions");
      while (this._deltaExtensionsQueue.length > 0) {
        const item2 = this._deltaExtensionsQueue.shift();
        await this._deltaExtensions(lock, item2.toAdd, item2.toRemove);
      }
    } finally {
      this._inHandleDeltaExtensions = false;
      lock?.dispose();
    }
  }
  async _deltaExtensions(lock, _toAdd, _toRemove) {
    if (isCI) {
      this._logService.info(`AbstractExtensionService._deltaExtensions: toAdd: [${_toAdd.map((e) => e.identifier.id).join(",")}] toRemove: [${_toRemove.map((e) => typeof e === "string" ? e : e.identifier.id).join(",")}]`);
    }
    let toRemove = [];
    for (let i = 0, len = _toRemove.length; i < len; i++) {
      const extensionOrId = _toRemove[i];
      const extensionId = typeof extensionOrId === "string" ? extensionOrId : extensionOrId.identifier.id;
      const extension = typeof extensionOrId === "string" ? null : extensionOrId;
      const extensionDescription = this._registry.getExtensionDescription(extensionId);
      if (!extensionDescription) {
        continue;
      }
      if (extension && extensionDescription.extensionLocation.scheme !== extension.location.scheme) {
        continue;
      }
      if (!this.canRemoveExtension(extensionDescription)) {
        continue;
      }
      toRemove.push(extensionDescription);
    }
    const toAdd = [];
    for (let i = 0, len = _toAdd.length; i < len; i++) {
      const extension = _toAdd[i];
      const extensionDescription = toExtensionDescription(extension, false);
      if (!extensionDescription) {
        continue;
      }
      if (!this._canAddExtension(extensionDescription, toRemove)) {
        continue;
      }
      toAdd.push(extensionDescription);
    }
    if (toAdd.length === 0 && toRemove.length === 0) {
      return;
    }
    const result = this._registry.deltaExtensions(lock, toAdd, toRemove.map((e) => e.identifier));
    this._onDidChangeExtensions.fire({ added: toAdd, removed: toRemove });
    toRemove = toRemove.concat(result.removedDueToLooping);
    if (result.removedDueToLooping.length > 0) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: nls.localize("looping", "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map((e) => `'${e.identifier.value}'`).join(", "))
      });
    }
    this._extensionsProposedApi.updateEnabledApiProposals(toAdd);
    this._doHandleExtensionPoints([].concat(toAdd).concat(toRemove), false);
    await this._updateExtensionsOnExtHosts(result.versionId, toAdd, toRemove.map((e) => e.identifier));
    for (let i = 0; i < toAdd.length; i++) {
      this._activateAddedExtensionIfNeeded(toAdd[i]);
    }
  }
  async _updateExtensionsOnExtHosts(versionId, toAdd, toRemove) {
    const removedRunningLocation = this._runningLocations.deltaExtensions(toAdd, toRemove);
    const promises = this._extensionHostManagers.map(
      (extHostManager) => this._updateExtensionsOnExtHost(extHostManager, versionId, toAdd, toRemove, removedRunningLocation)
    );
    await Promise.all(promises);
  }
  async _updateExtensionsOnExtHost(extensionHostManager, versionId, toAdd, toRemove, removedRunningLocation) {
    const myToAdd = this._runningLocations.filterByExtensionHostManager(toAdd, extensionHostManager);
    const myToRemove = filterExtensionIdentifiers(toRemove, removedRunningLocation, (extRunningLocation) => extensionHostManager.representsRunningLocation(extRunningLocation));
    const addActivationEvents = ImplicitActivationEvents.createActivationEventsMap(toAdd);
    if (isCI) {
      const printExtIds = (extensions) => extensions.map((e) => e.identifier.value).join(",");
      const printIds = (extensions) => extensions.map((e) => e.value).join(",");
      this._logService.info(`AbstractExtensionService: Calling deltaExtensions: toRemove: [${printIds(toRemove)}], toAdd: [${printExtIds(toAdd)}], myToRemove: [${printIds(myToRemove)}], myToAdd: [${printExtIds(myToAdd)}],`);
    }
    await extensionHostManager.deltaExtensions({ versionId, toRemove, toAdd, addActivationEvents, myToRemove, myToAdd: myToAdd.map((extension) => extension.identifier) });
  }
  canAddExtension(extension) {
    return this._canAddExtension(extension, []);
  }
  _canAddExtension(extension, extensionsBeingRemoved) {
    const existing = this._registry.getExtensionDescriptionByIdOrUUID(extension.identifier, extension.id);
    if (existing) {
      const isBeingRemoved = extensionsBeingRemoved.some((extensionDescription) => ExtensionIdentifier.equals(extension.identifier, extensionDescription.identifier));
      if (!isBeingRemoved) {
        return false;
      }
    }
    const extensionKinds = this._runningLocations.readExtensionKinds(extension);
    const isRemote = extension.extensionLocation.scheme === Schemas.vscodeRemote;
    const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKinds, !isRemote, isRemote, ExtensionRunningPreference.None);
    if (extensionHostKind === null) {
      return false;
    }
    return true;
  }
  canRemoveExtension(extension) {
    const extensionDescription = this._registry.getExtensionDescription(extension.identifier);
    if (!extensionDescription) {
      return false;
    }
    if (this._extensionStatus.get(extensionDescription.identifier)?.activationStarted) {
      return false;
    }
    return true;
  }
  async _activateAddedExtensionIfNeeded(extensionDescription) {
    let shouldActivateReason = null;
    let hasWorkspaceContains = false;
    const activationEvents = this._activationEventReader.readActivationEvents(extensionDescription);
    for (const activationEvent of activationEvents) {
      if (this._allRequestedActivateEvents.has(activationEvent)) {
        shouldActivateReason = activationEvent;
        break;
      }
      if (activationEvent === "*") {
        shouldActivateReason = activationEvent;
        break;
      }
      if (/^workspaceContains/.test(activationEvent)) {
        hasWorkspaceContains = true;
      }
      if (activationEvent === "onStartupFinished") {
        shouldActivateReason = activationEvent;
        break;
      }
    }
    if (!shouldActivateReason && hasWorkspaceContains) {
      const workspace = await this._contextService.getCompleteWorkspace();
      const forceUsingSearch = !!this._environmentService.remoteAuthority;
      const host = {
        logService: this._logService,
        folders: workspace.folders.map((folder) => folder.uri),
        forceUsingSearch,
        exists: (uri) => this._fileService.exists(uri),
        checkExists: (folders, includes2, token) => this._instantiationService.invokeFunction((accessor) => checkGlobFileExists(accessor, folders, includes2, token))
      };
      const result = await checkActivateWorkspaceContainsExtension(host, extensionDescription);
      if (result) {
        shouldActivateReason = result.activationEvent;
      }
    }
    if (shouldActivateReason) {
      await Promise.all(
        this._extensionHostManagers.map((extHostManager) => extHostManager.activate(extensionDescription.identifier, { startup: false, extensionId: extensionDescription.identifier, activationEvent: shouldActivateReason }))
      );
    }
  }
  _initializeIfNeeded() {
    if (!this._initializePromise) {
      this._initializePromise = this._initialize();
    }
    return this._initializePromise;
  }
  async _initialize() {
    perf.mark("code/willLoadExtensions");
    this._startExtensionHostsIfNecessary(true, []);
    const lock = await this._registry.acquireLock("_initialize");
    try {
      await this._resolveAndProcessExtensions(lock);
      this._startOnDemandExtensionHosts();
    } finally {
      lock.dispose();
    }
    this._releaseBarrier();
    perf.mark("code/didLoadExtensions");
    this._activateDeferredRemoteEvents();
    await this._handleExtensionTests();
  }
  async _activateDeferredRemoteEvents() {
    if (this._pendingRemoteActivationEvents.size === 0) {
      return;
    }
    const remoteExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.Remote);
    if (remoteExtensionHosts.length === 0) {
      this._pendingRemoteActivationEvents.clear();
      return;
    }
    await Promise.all(remoteExtensionHosts.map((extHost) => extHost.ready()));
    for (const activationEvent of this._pendingRemoteActivationEvents) {
      const result = Promise.all(
        remoteExtensionHosts.map((extHostManager) => extHostManager.activateByEvent(activationEvent, ActivationKind.Normal))
      ).then(() => {
      });
      this._onWillActivateByEvent.fire({
        event: activationEvent,
        activation: result,
        activationKind: ActivationKind.Normal
      });
    }
    this._pendingRemoteActivationEvents.clear();
  }
  async _resolveAndProcessExtensions(lock) {
    let resolverExtensions = [];
    let localExtensions = [];
    let remoteExtensions = [];
    for await (const extensions of this._resolveExtensions()) {
      if (extensions instanceof ResolverExtensions) {
        resolverExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, extensions.extensions, false);
        this._registry.deltaExtensions(lock, resolverExtensions, []);
        this._doHandleExtensionPoints(resolverExtensions, true);
      }
      if (extensions instanceof LocalExtensions) {
        localExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, extensions.extensions, false);
      }
      if (extensions instanceof RemoteExtensions) {
        remoteExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, extensions.extensions, false);
      }
    }
    this._runningLocations.initializeRunningLocation(localExtensions, remoteExtensions);
    this._startExtensionHostsIfNecessary(true, []);
    const remoteExtensionsThatNeedToRunLocally = this._allowRemoteExtensionsInLocalWebWorker ? this._runningLocations.filterByExtensionHostKind(remoteExtensions, ExtensionHostKind.LocalWebWorker) : [];
    const localProcessExtensions = this._hasLocalProcess ? this._runningLocations.filterByExtensionHostKind(localExtensions, ExtensionHostKind.LocalProcess) : [];
    const localWebWorkerExtensions = this._runningLocations.filterByExtensionHostKind(localExtensions, ExtensionHostKind.LocalWebWorker);
    remoteExtensions = this._runningLocations.filterByExtensionHostKind(remoteExtensions, ExtensionHostKind.Remote);
    for (const ext of remoteExtensionsThatNeedToRunLocally) {
      if (!includes(localWebWorkerExtensions, ext.identifier)) {
        localWebWorkerExtensions.push(ext);
      }
    }
    const allExtensions = remoteExtensions.concat(localProcessExtensions).concat(localWebWorkerExtensions);
    let toAdd = allExtensions;
    if (resolverExtensions.length) {
      toAdd = allExtensions.filter((extension) => !resolverExtensions.some((e) => ExtensionIdentifier.equals(e.identifier, extension.identifier) && e.extensionLocation.toString() === extension.extensionLocation.toString()));
      if (allExtensions.length < toAdd.length + resolverExtensions.length) {
        const toRemove = resolverExtensions.filter((registered) => !allExtensions.some((e) => ExtensionIdentifier.equals(e.identifier, registered.identifier) && e.extensionLocation.toString() === registered.extensionLocation.toString()));
        if (toRemove.length) {
          this._registry.deltaExtensions(lock, [], toRemove.map((e) => e.identifier));
          this._doHandleExtensionPoints(toRemove, true);
        }
      }
    }
    const result = this._registry.deltaExtensions(lock, toAdd, []);
    if (result.removedDueToLooping.length > 0) {
      this._notificationService.notify({
        severity: Severity.Error,
        message: nls.localize("looping", "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map((e) => `'${e.identifier.value}'`).join(", "))
      });
    }
    this._doHandleExtensionPoints(this._registry.getAllExtensionDescriptions(), false);
  }
  async _handleExtensionTests() {
    if (!this._environmentService.isExtensionDevelopment || !this._environmentService.extensionTestsLocationURI) {
      return;
    }
    const extensionHostManager = this.findTestExtensionHost(this._environmentService.extensionTestsLocationURI);
    if (!extensionHostManager) {
      const msg = nls.localize("extensionTestError", "No extension host found that can launch the test runner at {0}.", this._environmentService.extensionTestsLocationURI.toString());
      console.error(msg);
      this._notificationService.error(msg);
      return;
    }
    let exitCode;
    try {
      exitCode = await extensionHostManager.extensionTestsExecute();
      if (isCI) {
        this._logService.info(`Extension host test runner exit code: ${exitCode}`);
      }
    } catch (err) {
      if (isCI) {
        this._logService.error(`Extension host test runner error`, err);
      }
      console.error(err);
      exitCode = 1;
    }
    this._onExtensionHostExit(exitCode);
  }
  findTestExtensionHost(testLocation) {
    let runningLocation = null;
    for (const extension of this._registry.getAllExtensionDescriptions()) {
      if (isEqualOrParent(testLocation, extension.extensionLocation)) {
        runningLocation = this._runningLocations.getRunningLocation(extension.identifier);
        break;
      }
    }
    if (runningLocation === null) {
      if (testLocation.scheme === Schemas.vscodeRemote) {
        runningLocation = new RemoteRunningLocation();
      } else {
        runningLocation = new LocalProcessRunningLocation(0);
      }
    }
    if (runningLocation !== null) {
      return this._extensionHostManagers.getByRunningLocation(runningLocation);
    }
    return null;
  }
  _releaseBarrier() {
    this._installedExtensionsReady.open();
    this._onDidRegisterExtensions.fire(void 0);
    this._onDidChangeExtensionsStatus.fire(this._registry.getAllExtensionDescriptions().map((e) => e.identifier));
  }
  //#region remote authority resolving
  async _resolveAuthorityInitial(remoteAuthority) {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt++) {
      try {
        return this._resolveAuthorityWithLogging(remoteAuthority);
      } catch (err) {
        if (RemoteAuthorityResolverError.isNoResolverFound(err)) {
          throw err;
        }
        if (RemoteAuthorityResolverError.isNotAvailable(err)) {
          throw err;
        }
        if (attempt >= MAX_ATTEMPTS) {
          throw err;
        }
      }
    }
  }
  async _resolveAuthorityAgain() {
    const remoteAuthority = this._environmentService.remoteAuthority;
    if (!remoteAuthority) {
      return;
    }
    this._remoteAuthorityResolverService._clearResolvedAuthority(remoteAuthority);
    try {
      const result = await this._resolveAuthorityWithLogging(remoteAuthority);
      this._remoteAuthorityResolverService._setResolvedAuthority(result.authority, result.options);
    } catch (err) {
      this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
    }
  }
  async _resolveAuthorityWithLogging(remoteAuthority) {
    const authorityPrefix = getRemoteAuthorityPrefix(remoteAuthority);
    const sw = StopWatch.create(false);
    this._logService.info(`Invoking resolveAuthority(${authorityPrefix})...`);
    try {
      perf.mark(`code/willResolveAuthority/${authorityPrefix}`);
      const result = await this._resolveAuthority(remoteAuthority);
      perf.mark(`code/didResolveAuthorityOK/${authorityPrefix}`);
      this._logService.info(`resolveAuthority(${authorityPrefix}) returned '${result.authority.connectTo}' after ${sw.elapsed()} ms`);
      return result;
    } catch (err) {
      perf.mark(`code/didResolveAuthorityError/${authorityPrefix}`);
      this._logService.error(`resolveAuthority(${authorityPrefix}) returned an error after ${sw.elapsed()} ms`, err);
      throw err;
    }
  }
  async _resolveAuthorityOnExtensionHosts(kind, remoteAuthority) {
    const extensionHosts = this._getExtensionHostManagers(kind);
    if (extensionHosts.length === 0) {
      throw new Error(`Cannot resolve authority`);
    }
    this._resolveAuthorityAttempt++;
    const results = await Promise.all(extensionHosts.map((extHost) => extHost.resolveAuthority(remoteAuthority, this._resolveAuthorityAttempt)));
    let bestErrorResult = null;
    for (const result of results) {
      if (result.type === "ok") {
        return result.value;
      }
      if (!bestErrorResult) {
        bestErrorResult = result;
        continue;
      }
      const bestErrorIsUnknown = bestErrorResult.error.code === RemoteAuthorityResolverErrorCode.Unknown;
      const errorIsUnknown = result.error.code === RemoteAuthorityResolverErrorCode.Unknown;
      if (bestErrorIsUnknown && !errorIsUnknown) {
        bestErrorResult = result;
      }
    }
    throw new RemoteAuthorityResolverError(bestErrorResult.error.message, bestErrorResult.error.code, bestErrorResult.error.detail);
  }
  //#endregion
  //#region Stopping / Starting / Restarting
  async stopExtensionHosts(reason, auto) {
    await this._initializeIfNeeded();
    return this._doStopExtensionHostsWithVeto(reason, auto);
  }
  async _doStopExtensionHosts() {
    const previouslyActivatedExtensionIds = [];
    for (const extensionStatus of this._extensionStatus.values()) {
      if (extensionStatus.activationStarted) {
        previouslyActivatedExtensionIds.push(extensionStatus.id);
      }
    }
    await this._extensionHostManagers.stopAllInReverse();
    for (const extensionStatus of this._extensionStatus.values()) {
      extensionStatus.clearRuntimeStatus();
    }
    if (previouslyActivatedExtensionIds.length > 0) {
      this._onDidChangeExtensionsStatus.fire(previouslyActivatedExtensionIds);
    }
  }
  async _doStopExtensionHostsWithVeto(reason, auto = false) {
    if (auto && this._environmentService.isExtensionDevelopment) {
      return false;
    }
    const vetos = [];
    const vetoReasons = /* @__PURE__ */ new Set();
    this._onWillStop.fire({
      reason,
      auto,
      veto(value, reason2) {
        vetos.push(value);
        if (typeof value === "boolean") {
          if (value === true) {
            vetoReasons.add(reason2);
          }
        } else {
          value.then((value2) => {
            if (value2) {
              vetoReasons.add(reason2);
            }
          }).catch((error) => {
            vetoReasons.add(nls.localize("extensionStopVetoError", "{0} (Error: {1})", reason2, toErrorMessage(error)));
          });
        }
      }
    });
    const veto = await handleVetos(vetos, (error) => this._logService.error(error));
    if (!veto) {
      await this._doStopExtensionHosts();
    } else {
      if (!auto) {
        const vetoReasonsArray = Array.from(vetoReasons);
        this._logService.warn(`Extension host was not stopped because of veto (stop reason: ${reason}, veto reason: ${vetoReasonsArray.join(", ")})`);
        const { confirmed } = await this._dialogService.confirm({
          type: Severity.Warning,
          message: nls.localize("extensionStopVetoMessage", "Please confirm restart of extensions."),
          detail: vetoReasonsArray.length === 1 ? vetoReasonsArray[0] : vetoReasonsArray.join("\n -"),
          primaryButton: nls.localize("proceedAnyways", "Restart Anyway")
        });
        if (confirmed) {
          return true;
        }
      }
    }
    return !veto;
  }
  _startExtensionHostsIfNecessary(isInitialStart, initialActivationEvents) {
    const locations = [];
    for (let affinity = 0; affinity <= this._runningLocations.maxLocalProcessAffinity; affinity++) {
      locations.push(new LocalProcessRunningLocation(affinity));
    }
    for (let affinity = 0; affinity <= this._runningLocations.maxLocalWebWorkerAffinity; affinity++) {
      locations.push(new LocalWebWorkerRunningLocation(affinity));
    }
    locations.push(new RemoteRunningLocation());
    for (const location of locations) {
      if (this._extensionHostManagers.getByRunningLocation(location)) {
        continue;
      }
      const res = this._createExtensionHostManager(location, isInitialStart, initialActivationEvents);
      if (res) {
        const [extHostManager, disposableStore] = res;
        this._extensionHostManagers.add(extHostManager, disposableStore);
      }
    }
  }
  _createExtensionHostManager(runningLocation, isInitialStart, initialActivationEvents) {
    const extensionHost = this._extensionHostFactory.createExtensionHost(this._runningLocations, runningLocation, isInitialStart);
    if (!extensionHost) {
      return null;
    }
    const processManager = this._doCreateExtensionHostManager(extensionHost, initialActivationEvents);
    const disposableStore = new DisposableStore();
    disposableStore.add(processManager.onDidExit(([code, signal]) => this._onExtensionHostCrashOrExit(processManager, code, signal)));
    disposableStore.add(processManager.onDidChangeResponsiveState((responsiveState) => {
      this._logService.info(`Extension host (${processManager.friendyName}) is ${responsiveState === ResponsiveState.Responsive ? "responsive" : "unresponsive"}.`);
      this._onDidChangeResponsiveChange.fire({
        extensionHostKind: processManager.kind,
        isResponsive: responsiveState === ResponsiveState.Responsive,
        getInspectListener: (tryEnableInspector) => {
          return processManager.getInspectPort(tryEnableInspector);
        }
      });
    }));
    return [processManager, disposableStore];
  }
  _doCreateExtensionHostManager(extensionHost, initialActivationEvents) {
    const internalExtensionService = this._acquireInternalAPI(extensionHost);
    if (extensionHost.startup === ExtensionHostStartup.LazyAutoStart) {
      return this._instantiationService.createInstance(LazyCreateExtensionHostManager, extensionHost, initialActivationEvents, internalExtensionService);
    }
    return this._instantiationService.createInstance(ExtensionHostManager, extensionHost, initialActivationEvents, internalExtensionService);
  }
  _onExtensionHostCrashOrExit(extensionHost, code, signal) {
    const isExtensionDevHost = parseExtensionDevOptions(this._environmentService).isExtensionDevHost;
    if (!isExtensionDevHost) {
      this._onExtensionHostCrashed(extensionHost, code, signal);
      return;
    }
    this._onExtensionHostExit(code);
  }
  _onExtensionHostCrashed(extensionHost, code, signal) {
    console.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. Code: ${code}, Signal: ${signal}`);
    if (extensionHost.kind === ExtensionHostKind.LocalProcess) {
      this._doStopExtensionHosts();
    } else if (extensionHost.kind === ExtensionHostKind.Remote) {
      if (signal) {
        this._onRemoteExtensionHostCrashed(extensionHost, signal);
      }
      this._extensionHostManagers.stopOne(extensionHost);
    }
  }
  _getExtensionHostExitInfoWithTimeout(reconnectionToken) {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error("getExtensionHostExitInfo timed out"));
      }, 2e3);
      this._remoteAgentService.getExtensionHostExitInfo(reconnectionToken).then(
        (r) => {
          clearTimeout(timeoutHandle);
          resolve(r);
        },
        reject
      );
    });
  }
  async _onRemoteExtensionHostCrashed(extensionHost, reconnectionToken) {
    try {
      const info = await this._getExtensionHostExitInfoWithTimeout(reconnectionToken);
      if (info) {
        this._logService.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly with code ${info.code}.`);
      }
      this._logExtensionHostCrash(extensionHost);
      this._remoteCrashTracker.registerCrash();
      if (this._remoteCrashTracker.shouldAutomaticallyRestart()) {
        this._logService.info(`Automatically restarting the remote extension host.`);
        this._notificationService.status(nls.localize("extensionService.autoRestart", "The remote extension host terminated unexpectedly. Restarting..."), { hideAfter: 5e3 });
        this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));
      } else {
        this._notificationService.prompt(
          Severity.Error,
          nls.localize("extensionService.crash", "Remote Extension host terminated unexpectedly 3 times within the last 5 minutes."),
          [{
            label: nls.localize("restart", "Restart Remote Extension Host"),
            run: () => {
              this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));
            }
          }]
        );
      }
    } catch (err) {
    }
  }
  _logExtensionHostCrash(extensionHost) {
    const activatedExtensions = [];
    for (const extensionStatus of this._extensionStatus.values()) {
      if (extensionStatus.activationStarted && extensionHost.containsExtension(extensionStatus.id)) {
        activatedExtensions.push(extensionStatus.id);
      }
    }
    if (activatedExtensions.length > 0) {
      this._logService.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. The following extensions were running: ${activatedExtensions.map((id) => id.value).join(", ")}`);
    } else {
      this._logService.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. No extensions were activated.`);
    }
  }
  async startExtensionHosts(updates) {
    await this._doStopExtensionHosts();
    if (updates) {
      await this._handleDeltaExtensions(new DeltaExtensionsQueueItem(updates.toAdd, updates.toRemove));
    }
    const lock = await this._registry.acquireLock("startExtensionHosts");
    try {
      this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));
      this._startOnDemandExtensionHosts();
      const localProcessExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.LocalProcess);
      await Promise.all(localProcessExtensionHosts.map((extHost) => extHost.ready()));
    } finally {
      lock.dispose();
    }
  }
  _startOnDemandExtensionHosts() {
    const snapshot = this._registry.getSnapshot();
    for (const extHostManager of this._extensionHostManagers) {
      if (extHostManager.startup !== ExtensionHostStartup.EagerAutoStart) {
        const extensions = this._runningLocations.filterByExtensionHostManager(snapshot.extensions, extHostManager);
        extHostManager.start(snapshot.versionId, snapshot.extensions, extensions.map((extension) => extension.identifier));
      }
    }
  }
  //#endregion
  //#region IExtensionService
  activateByEvent(activationEvent, activationKind = ActivationKind.Normal) {
    if (this._installedExtensionsReady.isOpen()) {
      this._allRequestedActivateEvents.add(activationEvent);
      if (!this._registry.containsActivationEvent(activationEvent)) {
        return NO_OP_VOID_PROMISE;
      }
      return this._activateByEvent(activationEvent, activationKind);
    } else {
      this._allRequestedActivateEvents.add(activationEvent);
      if (activationKind === ActivationKind.Immediate) {
        void this._initializeIfNeeded();
        return this._activateByEvent(activationEvent, activationKind);
      }
      return this._installedExtensionsReady.wait().then(() => this._activateByEvent(activationEvent, activationKind));
    }
  }
  _activateByEvent(activationEvent, activationKind) {
    let managers;
    if (activationKind === ActivationKind.Immediate) {
      managers = this._extensionHostManagers.filter(
        (extHostManager) => extHostManager.kind === ExtensionHostKind.LocalProcess || extHostManager.kind === ExtensionHostKind.LocalWebWorker || extHostManager.isReady
      );
      this._pendingRemoteActivationEvents.add(activationEvent);
    } else {
      managers = [...this._extensionHostManagers];
    }
    const result = Promise.all(
      managers.map((extHostManager) => extHostManager.activateByEvent(activationEvent, activationKind))
    ).then(() => {
    });
    this._onWillActivateByEvent.fire({
      event: activationEvent,
      activation: result,
      activationKind
    });
    return result;
  }
  activateById(extensionId, reason) {
    return this._activateById(extensionId, reason);
  }
  activationEventIsDone(activationEvent) {
    if (!this._installedExtensionsReady.isOpen()) {
      return false;
    }
    if (!this._registry.containsActivationEvent(activationEvent)) {
      return true;
    }
    return this._extensionHostManagers.every((manager) => manager.activationEventIsDone(activationEvent));
  }
  whenInstalledExtensionsRegistered() {
    return this._installedExtensionsReady.wait();
  }
  get extensions() {
    return this._registry.getAllExtensionDescriptions();
  }
  _getExtensionRegistrySnapshotWhenReady() {
    return this._installedExtensionsReady.wait().then(() => this._registry.getSnapshot());
  }
  getExtension(id) {
    return this._installedExtensionsReady.wait().then(() => {
      return this._registry.getExtensionDescription(id);
    });
  }
  readExtensionPointContributions(extPoint) {
    return this._installedExtensionsReady.wait().then(() => {
      const availableExtensions = this._registry.getAllExtensionDescriptions();
      const result = [];
      for (const desc of availableExtensions) {
        if (desc.contributes && hasOwnProperty.call(desc.contributes, extPoint.name)) {
          result.push(new ExtensionPointContribution(desc, desc.contributes[extPoint.name]));
        }
      }
      return result;
    });
  }
  getExtensionsStatus() {
    const result = /* @__PURE__ */ Object.create(null);
    if (this._registry) {
      const extensions = this._registry.getAllExtensionDescriptions();
      for (const extension of extensions) {
        const extensionStatus = this._extensionStatus.get(extension.identifier);
        result[extension.identifier.value] = {
          id: extension.identifier,
          messages: extensionStatus?.messages ?? [],
          activationStarted: extensionStatus?.activationStarted ?? false,
          activationTimes: extensionStatus?.activationTimes ?? void 0,
          runtimeErrors: extensionStatus?.runtimeErrors ?? [],
          runningLocation: this._runningLocations.getRunningLocation(extension.identifier)
        };
      }
    }
    return result;
  }
  async getInspectPorts(extensionHostKind, tryEnableInspector) {
    const result = await Promise.all(
      this._getExtensionHostManagers(extensionHostKind).map(async (extHost) => {
        let portInfo = await extHost.getInspectPort(tryEnableInspector);
        if (portInfo !== void 0) {
          portInfo = { ...portInfo, devtoolsLabel: extHost.friendyName };
        }
        return portInfo;
      })
    );
    return result.filter(isDefined);
  }
  async setRemoteEnvironment(env) {
    await this._extensionHostManagers.map((manager) => manager.setRemoteEnvironment(env));
  }
  //#endregion
  // --- impl
  _safeInvokeIsEnabled(extension) {
    try {
      return this._extensionEnablementService.isEnabled(extension);
    } catch (err) {
      return false;
    }
  }
  _doHandleExtensionPoints(affectedExtensions, onlyResolverExtensionPoints) {
    const affectedExtensionPoints = /* @__PURE__ */ Object.create(null);
    for (const extensionDescription of affectedExtensions) {
      if (extensionDescription.contributes) {
        for (const extPointName in extensionDescription.contributes) {
          if (hasOwnProperty.call(extensionDescription.contributes, extPointName)) {
            affectedExtensionPoints[extPointName] = true;
          }
        }
      }
    }
    const messageHandler = (msg) => this._handleExtensionPointMessage(msg);
    const availableExtensions = this._registry.getAllExtensionDescriptions();
    const extensionPoints = ExtensionsRegistry.getExtensionPoints();
    perf.mark(onlyResolverExtensionPoints ? "code/willHandleResolverExtensionPoints" : "code/willHandleExtensionPoints");
    for (const extensionPoint of extensionPoints) {
      if (affectedExtensionPoints[extensionPoint.name] && (!onlyResolverExtensionPoints || extensionPoint.canHandleResolver)) {
        perf.mark(`code/willHandleExtensionPoint/${extensionPoint.name}`);
        AbstractExtensionService._handleExtensionPoint(extensionPoint, availableExtensions, messageHandler);
        perf.mark(`code/didHandleExtensionPoint/${extensionPoint.name}`);
      }
    }
    perf.mark(onlyResolverExtensionPoints ? "code/didHandleResolverExtensionPoints" : "code/didHandleExtensionPoints");
  }
  _getOrCreateExtensionStatus(extensionId) {
    if (!this._extensionStatus.has(extensionId)) {
      this._extensionStatus.set(extensionId, new ExtensionStatus(extensionId));
    }
    return this._extensionStatus.get(extensionId);
  }
  _handleExtensionPointMessage(msg) {
    const extensionStatus = this._getOrCreateExtensionStatus(msg.extensionId);
    extensionStatus.addMessage(msg);
    const extension = this._registry.getExtensionDescription(msg.extensionId);
    const strMsg = `[${msg.extensionId.value}]: ${msg.message}`;
    if (msg.type === Severity.Error) {
      if (extension && extension.isUnderDevelopment) {
        this._notificationService.notify({ severity: Severity.Error, message: strMsg });
      }
      this._logService.error(strMsg);
    } else if (msg.type === Severity.Warning) {
      if (extension && extension.isUnderDevelopment) {
        this._notificationService.notify({ severity: Severity.Warning, message: strMsg });
      }
      this._logService.warn(strMsg);
    } else {
      this._logService.info(strMsg);
    }
    if (msg.extensionId && this._environmentService.isBuilt && !this._environmentService.isExtensionDevelopment) {
      const { type, extensionId, extensionPointId, message } = msg;
      this._telemetryService.publicLog2("extensionsMessage", {
        type,
        extensionId: extensionId.value,
        extensionPointId,
        message
      });
    }
  }
  static _handleExtensionPoint(extensionPoint, availableExtensions, messageHandler) {
    const users = [];
    for (const desc of availableExtensions) {
      if (desc.contributes && hasOwnProperty.call(desc.contributes, extensionPoint.name)) {
        users.push({
          description: desc,
          value: desc.contributes[extensionPoint.name],
          collector: new ExtensionMessageCollector(messageHandler, desc, extensionPoint.name)
        });
      }
    }
    extensionPoint.acceptUsers(users);
  }
  //#region Called by extension host
  _acquireInternalAPI(extensionHost) {
    return {
      _activateById: (extensionId, reason) => {
        return this._activateById(extensionId, reason);
      },
      _onWillActivateExtension: (extensionId) => {
        return this._onWillActivateExtension(extensionId, extensionHost.runningLocation);
      },
      _onDidActivateExtension: (extensionId, codeLoadingTime, activateCallTime, activateResolvedTime, activationReason) => {
        return this._onDidActivateExtension(extensionId, codeLoadingTime, activateCallTime, activateResolvedTime, activationReason);
      },
      _onDidActivateExtensionError: (extensionId, error) => {
        return this._onDidActivateExtensionError(extensionId, error);
      },
      _onExtensionRuntimeError: (extensionId, err) => {
        return this._onExtensionRuntimeError(extensionId, err);
      }
    };
  }
  async _activateById(extensionId, reason) {
    const results = await Promise.all(
      this._extensionHostManagers.map((manager) => manager.activate(extensionId, reason))
    );
    const activated = results.some((e) => e);
    if (!activated) {
      throw new Error(`Unknown extension ${extensionId.value}`);
    }
  }
  _onWillActivateExtension(extensionId, runningLocation) {
    this._runningLocations.set(extensionId, runningLocation);
    const extensionStatus = this._getOrCreateExtensionStatus(extensionId);
    extensionStatus.onWillActivate();
  }
  _onDidActivateExtension(extensionId, codeLoadingTime, activateCallTime, activateResolvedTime, activationReason) {
    const extensionStatus = this._getOrCreateExtensionStatus(extensionId);
    extensionStatus.setActivationTimes(new ActivationTimes(codeLoadingTime, activateCallTime, activateResolvedTime, activationReason));
    this._onDidChangeExtensionsStatus.fire([extensionId]);
  }
  _onDidActivateExtensionError(extensionId, error) {
    this._telemetryService.publicLog2("extensionActivationError", {
      extensionId: extensionId.value,
      error: error.message
    });
  }
  _onExtensionRuntimeError(extensionId, err) {
    const extensionStatus = this._getOrCreateExtensionStatus(extensionId);
    extensionStatus.addRuntimeError(err);
    this._onDidChangeExtensionsStatus.fire([extensionId]);
  }
  _reportProposedApiUsage(usage) {
    this._telemetryService.publicLog2("extensionProposedApiNotEnabled", {
      extensionId: usage.extensionId,
      proposalName: usage.proposalName
    });
  }
};
AbstractExtensionService = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IWorkbenchEnvironmentService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IWorkbenchExtensionEnablementService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IWorkbenchExtensionManagementService),
  __decorateParam(12, IWorkspaceContextService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IExtensionManifestPropertiesService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IRemoteAgentService),
  __decorateParam(17, IRemoteExtensionsScannerService),
  __decorateParam(18, ILifecycleService),
  __decorateParam(19, IRemoteAuthorityResolverService),
  __decorateParam(20, IDialogService)
], AbstractExtensionService);
class ExtensionHostCollection extends Disposable {
  constructor() {
    super(...arguments);
    this._extensionHostManagers = [];
  }
  dispose() {
    for (let i = this._extensionHostManagers.length - 1; i >= 0; i--) {
      const manager = this._extensionHostManagers[i];
      manager.extensionHost.disconnect();
      manager.dispose();
    }
    this._extensionHostManagers = [];
    super.dispose();
  }
  add(extensionHostManager, disposableStore) {
    this._extensionHostManagers.push(new ExtensionHostManagerData(extensionHostManager, disposableStore));
  }
  async stopAllInReverse() {
    for (let i = this._extensionHostManagers.length - 1; i >= 0; i--) {
      const manager = this._extensionHostManagers[i];
      await manager.extensionHost.disconnect();
      manager.dispose();
    }
    this._extensionHostManagers = [];
  }
  async stopOne(extensionHostManager) {
    const index = this._extensionHostManagers.findIndex((el) => el.extensionHost === extensionHostManager);
    if (index >= 0) {
      this._extensionHostManagers.splice(index, 1);
      await extensionHostManager.disconnect();
      extensionHostManager.dispose();
    }
  }
  getByKind(kind) {
    return this.filter((el) => el.kind === kind);
  }
  getByRunningLocation(runningLocation) {
    for (const el of this._extensionHostManagers) {
      if (el.extensionHost.representsRunningLocation(runningLocation)) {
        return el.extensionHost;
      }
    }
    return null;
  }
  *[Symbol.iterator]() {
    for (const extensionHostManager of this._extensionHostManagers) {
      yield extensionHostManager.extensionHost;
    }
  }
  map(callback) {
    return this._extensionHostManagers.map((el) => callback(el.extensionHost));
  }
  every(callback) {
    return this._extensionHostManagers.every((el) => callback(el.extensionHost));
  }
  filter(callback) {
    return this._extensionHostManagers.filter((el) => callback(el.extensionHost)).map((el) => el.extensionHost);
  }
}
class ExtensionHostManagerData {
  constructor(extensionHost, disposableStore) {
    this.extensionHost = extensionHost;
    this.disposableStore = disposableStore;
  }
  dispose() {
    this.disposableStore.dispose();
    this.extensionHost.dispose();
  }
}
class ResolverExtensions {
  constructor(extensions) {
    this.extensions = extensions;
  }
}
class LocalExtensions {
  constructor(extensions) {
    this.extensions = extensions;
  }
}
class RemoteExtensions {
  constructor(extensions) {
    this.extensions = extensions;
  }
}
class DeltaExtensionsQueueItem {
  constructor(toAdd, toRemove) {
    this.toAdd = toAdd;
    this.toRemove = toRemove;
  }
}
function isResolverExtension(extension) {
  return !!extension.activationEvents?.some((activationEvent) => activationEvent.startsWith("onResolveRemoteAuthority:"));
}
function checkEnabledAndProposedAPI(logService, extensionEnablementService, extensionsProposedApi, extensions, ignoreWorkspaceTrust) {
  extensionsProposedApi.updateEnabledApiProposals(extensions);
  return filterEnabledExtensions(logService, extensionEnablementService, extensions, ignoreWorkspaceTrust);
}
function filterEnabledExtensions(logService, extensionEnablementService, extensions, ignoreWorkspaceTrust) {
  const enabledExtensions = [], extensionsToCheck = [], mappedExtensions = [];
  for (const extension of extensions) {
    if (extension.isUnderDevelopment) {
      enabledExtensions.push(extension);
    } else {
      extensionsToCheck.push(extension);
      mappedExtensions.push(toExtension(extension));
    }
  }
  const enablementStates = extensionEnablementService.getEnablementStates(mappedExtensions, ignoreWorkspaceTrust ? { trusted: true } : void 0);
  for (let index = 0; index < enablementStates.length; index++) {
    if (extensionEnablementService.isEnabledEnablementState(enablementStates[index])) {
      enabledExtensions.push(extensionsToCheck[index]);
    } else {
      if (isCI) {
        logService.info(`filterEnabledExtensions: extension '${extensionsToCheck[index].identifier.value}' is disabled`);
      }
    }
  }
  return enabledExtensions;
}
function extensionIsEnabled(logService, extensionEnablementService, extension, ignoreWorkspaceTrust) {
  return filterEnabledExtensions(logService, extensionEnablementService, [extension], ignoreWorkspaceTrust).includes(extension);
}
function includes(extensions, identifier) {
  for (const extension of extensions) {
    if (ExtensionIdentifier.equals(extension.identifier, identifier)) {
      return true;
    }
  }
  return false;
}
class ExtensionStatus {
  constructor(id) {
    this.id = id;
    this._messages = [];
    this._activationTimes = null;
    this._runtimeErrors = [];
    this._activationStarted = false;
  }
  get messages() {
    return this._messages;
  }
  get activationTimes() {
    return this._activationTimes;
  }
  get runtimeErrors() {
    return this._runtimeErrors;
  }
  get activationStarted() {
    return this._activationStarted;
  }
  clearRuntimeStatus() {
    this._activationStarted = false;
    this._activationTimes = null;
    this._runtimeErrors = [];
  }
  addMessage(msg) {
    this._messages.push(msg);
  }
  setActivationTimes(activationTimes) {
    this._activationTimes = activationTimes;
  }
  addRuntimeError(err) {
    this._runtimeErrors.push(err);
  }
  onWillActivate() {
    this._activationStarted = true;
  }
}
const _ExtensionHostCrashTracker = class _ExtensionHostCrashTracker {
  constructor() {
    this._recentCrashes = [];
  }
  _removeOldCrashes() {
    const limit = Date.now() - _ExtensionHostCrashTracker._TIME_LIMIT;
    while (this._recentCrashes.length > 0 && this._recentCrashes[0].timestamp < limit) {
      this._recentCrashes.shift();
    }
  }
  registerCrash() {
    this._removeOldCrashes();
    this._recentCrashes.push({ timestamp: Date.now() });
  }
  shouldAutomaticallyRestart() {
    this._removeOldCrashes();
    return this._recentCrashes.length < _ExtensionHostCrashTracker._CRASH_LIMIT;
  }
};
_ExtensionHostCrashTracker._TIME_LIMIT = 5 * 60 * 1e3;
// 5 minutes
_ExtensionHostCrashTracker._CRASH_LIMIT = 3;
let ExtensionHostCrashTracker = _ExtensionHostCrashTracker;
class ImplicitActivationAwareReader {
  readActivationEvents(extensionDescription) {
    return ImplicitActivationEvents.readActivationEvents(extensionDescription);
  }
}
class ActivationFeatureMarkdowneRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "markdown";
  }
  shouldRender(manifest) {
    return !!manifest.activationEvents;
  }
  render(manifest) {
    const activationEvents = manifest.activationEvents || [];
    const data = new MarkdownString();
    if (activationEvents.length) {
      for (const activationEvent of activationEvents) {
        data.appendMarkdown(`- \`${activationEvent}\`
`);
      }
    }
    return {
      data,
      dispose: () => {
      }
    };
  }
}
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "activationEvents",
  label: nls.localize("activation", "Activation Events"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ActivationFeatureMarkdowneRenderer)
});
export {
  AbstractExtensionService,
  ExtensionHostCrashTracker,
  ExtensionStatus,
  ImplicitActivationAwareReader,
  LocalExtensions,
  RemoteExtensions,
  ResolverExtensions,
  checkEnabledAndProposedAPI,
  extensionIsEnabled,
  filterEnabledExtensions,
  isResolverExtension
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxjb21tb25cXGFic3RyYWN0RXh0ZW5zaW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJhcnJpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwZXJmIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IGlzQ0kgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsT3JQYXJlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEluc3RhbGxPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEltcGxpY2l0QWN0aXZhdGlvbkV2ZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2ltcGxpY2l0QWN0aXZhdGlvbkV2ZW50cy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uQ29udHJpYnV0aW9ucywgSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgaGFuZGxlVmV0b3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IsIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLCBSZXNvbHZlclJlc3VsdCwgZ2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBdXRob3JpdHlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVFeHRlbnNpb25zU2Nhbm5lci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIEV4dGVuc2lvbkZlYXR1cmVzRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVNYXJrZG93blJlbmRlcmVyLCBJUmVuZGVyZWREYXRhLCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5TG9jaywgRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeVNuYXBzaG90LCBJQWN0aXZhdGlvbkV2ZW50c1JlYWRlciwgTG9ja2FibGVFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi9leHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHBhcnNlRXh0ZW5zaW9uRGV2T3B0aW9ucyB9IGZyb20gJy4vZXh0ZW5zaW9uRGV2T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0S2luZCwgRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UsIElFeHRlbnNpb25Ib3N0S2luZFBpY2tlciB9IGZyb20gJy4vZXh0ZW5zaW9uSG9zdEtpbmQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdE1hbmFnZXIgfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0TWFuYWdlciB9IGZyb20gJy4vZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmpzJztcbmltcG9ydCB7IElSZXNvbHZlQXV0aG9yaXR5RXJyb3JSZXN1bHQgfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RQcm94eS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24sIExvY2FsUHJvY2Vzc1J1bm5pbmdMb2NhdGlvbiwgTG9jYWxXZWJXb3JrZXJSdW5uaW5nTG9jYXRpb24sIFJlbW90ZVJ1bm5pbmdMb2NhdGlvbiB9IGZyb20gJy4vZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIsIGZpbHRlckV4dGVuc2lvbklkZW50aWZpZXJzIH0gZnJvbSAnLi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLmpzJztcbmltcG9ydCB7IEFjdGl2YXRpb25LaW5kLCBBY3RpdmF0aW9uVGltZXMsIEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24sIEV4dGVuc2lvbkhvc3RTdGFydHVwLCBFeHRlbnNpb25Qb2ludENvbnRyaWJ1dGlvbiwgSUV4dGVuc2lvbkhvc3QsIElFeHRlbnNpb25JbnNwZWN0SW5mbywgSUV4dGVuc2lvblNlcnZpY2UsIElFeHRlbnNpb25zU3RhdHVzLCBJSW50ZXJuYWxFeHRlbnNpb25TZXJ2aWNlLCBJTWVzc2FnZSwgSVByb3Bvc2VkQXBpVXNhZ2UsIElSZXNwb25zaXZlU3RhdGVDaGFuZ2VFdmVudCwgSVdpbGxBY3RpdmF0ZUV2ZW50LCBzZXRQcm9wb3NlZEFwaVVzYWdlUmVwb3J0ZXIsIFdpbGxTdG9wRXh0ZW5zaW9uSG9zdHNFdmVudCwgdG9FeHRlbnNpb24sIHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1Byb3Bvc2VkQXBpIH0gZnJvbSAnLi9leHRlbnNpb25zUHJvcG9zZWRBcGkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgRXh0ZW5zaW9uUG9pbnQsIEV4dGVuc2lvbnNSZWdpc3RyeSwgSUV4dGVuc2lvblBvaW50LCBJRXh0ZW5zaW9uUG9pbnRVc2VyIH0gZnJvbSAnLi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTGF6eUNyZWF0ZUV4dGVuc2lvbkhvc3RNYW5hZ2VyIH0gZnJvbSAnLi9sYXp5Q3JlYXRlRXh0ZW5zaW9uSG9zdE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgUmVzcG9uc2l2ZVN0YXRlIH0gZnJvbSAnLi9ycGNQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uQWN0aXZhdGlvbkhvc3QgYXMgSVdvcmtzcGFjZUNvbnRhaW5zQWN0aXZhdGlvbkhvc3QsIGNoZWNrQWN0aXZhdGVXb3Jrc3BhY2VDb250YWluc0V4dGVuc2lvbiwgY2hlY2tHbG9iRmlsZUV4aXN0cyB9IGZyb20gJy4vd29ya3NwYWNlQ29udGFpbnMuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIFdpbGxTaHV0ZG93bkpvaW5lck9yZGVyIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3RFeGl0SW5mbywgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcblxuY29uc3QgaGFzT3duUHJvcGVydHkgPSBPYmplY3QuaGFzT3duUHJvcGVydHk7XG5jb25zdCBOT19PUF9WT0lEX1BST01JU0UgPSBQcm9taXNlLnJlc29sdmU8dm9pZD4odW5kZWZpbmVkKTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0RXh0ZW5zaW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uU2VydmljZSB7XG5cblx0cHVibGljIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNMb2NhbFByb2Nlc3M6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsbG93UmVtb3RlRXh0ZW5zaW9uc0luTG9jYWxXZWJXb3JrZXI6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWdpc3RlckV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUmVnaXN0ZXJFeHRlbnNpb25zID0gdGhpcy5fb25EaWRSZWdpc3RlckV4dGVuc2lvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VFeHRlbnNpb25zU3RhdHVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RXh0ZW5zaW9uSWRlbnRpZmllcltdPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cyA9IHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGFkZGVkOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25EZXNjcmlwdGlvbj47IHJlYWRvbmx5IHJlbW92ZWQ6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbkRlc2NyaXB0aW9uPiB9Pih7IGxlYWtXYXJuaW5nVGhyZXNob2xkOiA0MDAsIGxlYWtXYXJuaW5nTmFtZTogJ0V4dGVuc2lvblNlcnZpY2UuX29uRGlkQ2hhbmdlRXh0ZW5zaW9ucycgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VFeHRlbnNpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VFeHRlbnNpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbEFjdGl2YXRlQnlFdmVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXaWxsQWN0aXZhdGVFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxBY3RpdmF0ZUJ5RXZlbnQgPSB0aGlzLl9vbldpbGxBY3RpdmF0ZUJ5RXZlbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZXNwb25zaXZlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVJlc3BvbnNpdmVTdGF0ZUNoYW5nZUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVzcG9uc2l2ZUNoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlUmVzcG9uc2l2ZUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxTdG9wID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8V2lsbFN0b3BFeHRlbnNpb25Ib3N0c0V2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbFN0b3AgPSB0aGlzLl9vbldpbGxTdG9wLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2YXRpb25FdmVudFJlYWRlciA9IG5ldyBJbXBsaWNpdEFjdGl2YXRpb25Bd2FyZVJlYWRlcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyeSA9IG5ldyBMb2NrYWJsZUV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkodGhpcy5fYWN0aXZhdGlvbkV2ZW50UmVhZGVyKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFsbGVkRXh0ZW5zaW9uc1JlYWR5ID0gbmV3IEJhcnJpZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU3RhdHVzID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uU3RhdHVzPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGxSZXF1ZXN0ZWRBY3RpdmF0ZUV2ZW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUmVtb3RlQWN0aXZhdGlvbkV2ZW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ydW5uaW5nTG9jYXRpb25zOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVDcmFzaFRyYWNrZXIgPSBuZXcgRXh0ZW5zaW9uSG9zdENyYXNoVHJhY2tlcigpO1xuXG5cdHByaXZhdGUgX2RlbHRhRXh0ZW5zaW9uc1F1ZXVlOiBEZWx0YUV4dGVuc2lvbnNRdWV1ZUl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIF9pbkhhbmRsZURlbHRhRXh0ZW5zaW9ucyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkhvc3RNYW5hZ2VycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFeHRlbnNpb25Ib3N0Q29sbGVjdGlvbigpKTtcblxuXHRwcml2YXRlIF9yZXNvbHZlQXV0aG9yaXR5QXR0ZW1wdDogbnVtYmVyID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiB7IGhhc0xvY2FsUHJvY2VzczogYm9vbGVhbjsgYWxsb3dSZW1vdGVFeHRlbnNpb25zSW5Mb2NhbFdlYldvcmtlcjogYm9vbGVhbiB9LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbnNQcm9wb3NlZEFwaTogRXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkhvc3RGYWN0b3J5OiBJRXh0ZW5zaW9uSG9zdEZhY3RvcnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXI6IElFeHRlbnNpb25Ib3N0S2luZFBpY2tlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZTogSVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2hhc0xvY2FsUHJvY2VzcyA9IG9wdGlvbnMuaGFzTG9jYWxQcm9jZXNzO1xuXHRcdHRoaXMuX2FsbG93UmVtb3RlRXh0ZW5zaW9uc0luTG9jYWxXZWJXb3JrZXIgPSBvcHRpb25zLmFsbG93UmVtb3RlRXh0ZW5zaW9uc0luTG9jYWxXZWJXb3JrZXI7XG5cblx0XHQvLyBoZWxwIHRoZSBmaWxlIHNlcnZpY2UgdG8gYWN0aXZhdGUgcHJvdmlkZXJzIGJ5IGFjdGl2YXRpbmcgZXh0ZW5zaW9ucyBieSBmaWxlIHN5c3RlbSBldmVudFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbGVTZXJ2aWNlLm9uV2lsbEFjdGl2YXRlRmlsZVN5c3RlbVByb3ZpZGVyKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXHRcdFx0XHRlLmpvaW4odGhpcy5hY3RpdmF0ZUJ5RXZlbnQoYG9uRmlsZVN5c3RlbToke2Uuc2NoZW1lfWApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyByZXBvcnQgdGVsZW1ldHJ5IHdoZW4gYW4gZXh0ZW5zaW9uIGF0dGVtcHRzIHRvIHVzZSBhIHByb3Bvc2VkIEFQSSBpdCBpcyBub3QgZW50aXRsZWQgdG8gdXNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2V0UHJvcG9zZWRBcGlVc2FnZVJlcG9ydGVyKHVzYWdlID0+IHRoaXMuX3JlcG9ydFByb3Bvc2VkQXBpVXNhZ2UodXNhZ2UpKSk7XG5cblx0XHR0aGlzLl9ydW5uaW5nTG9jYXRpb25zID0gbmV3IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIoXG5cdFx0XHR0aGlzLl9yZWdpc3RyeSxcblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RLaW5kUGlja2VyLFxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5vbkVuYWJsZW1lbnRDaGFuZ2VkKChleHRlbnNpb25zKSA9PiB7XG5cdFx0XHRjb25zdCB0b0FkZDogSUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRjb25zdCB0b1JlbW92ZTogSUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zYWZlSW52b2tlSXNFbmFibGVkKGV4dGVuc2lvbikpIHtcblx0XHRcdFx0XHQvLyBhbiBleHRlbnNpb24gaGFzIGJlZW4gZW5hYmxlZFxuXHRcdFx0XHRcdHRvQWRkLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBhbiBleHRlbnNpb24gaGFzIGJlZW4gZGlzYWJsZWRcblx0XHRcdFx0XHR0b1JlbW92ZS5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLm9uRW5hYmxlbWVudENoYW5nZWQgZmlyZWQgZm9yICR7ZXh0ZW5zaW9ucy5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQpLmpvaW4oJywgJyl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9oYW5kbGVEZWx0YUV4dGVuc2lvbnMobmV3IERlbHRhRXh0ZW5zaW9uc1F1ZXVlSXRlbSh0b0FkZCwgdG9SZW1vdmUpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGUoKHsgYWRkZWQsIHJlbW92ZWQgfSkgPT4ge1xuXHRcdFx0aWYgKGFkZGVkLmxlbmd0aCB8fCByZW1vdmVkLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvZmlsZSBmaXJlZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2hhbmRsZURlbHRhRXh0ZW5zaW9ucyhuZXcgRGVsdGFFeHRlbnNpb25zUXVldWVJdGVtKGFkZGVkLCByZW1vdmVkKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRFbmFibGVFeHRlbnNpb25zKGV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBBYnN0cmFjdEV4dGVuc2lvblNlcnZpY2Uub25EaWRFbmFibGVFeHRlbnNpb25zIGZpcmVkYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faGFuZGxlRGVsdGFFeHRlbnNpb25zKG5ldyBEZWx0YUV4dGVuc2lvbnNRdWV1ZUl0ZW0oZXh0ZW5zaW9ucywgW10pKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxFeHRlbnNpb25zKChyZXN1bHQpID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgdG9SZW1vdmU6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHsgbG9jYWwsIG9wZXJhdGlvbiB9IG9mIHJlc3VsdCkge1xuXHRcdFx0XHRpZiAobG9jYWwgJiYgbG9jYWwuaXNWYWxpZCAmJiBvcGVyYXRpb24gIT09IEluc3RhbGxPcGVyYXRpb24uTWlncmF0ZSAmJiB0aGlzLl9zYWZlSW52b2tlSXNFbmFibGVkKGxvY2FsKSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnMucHVzaChsb2NhbCk7XG5cdFx0XHRcdFx0aWYgKG9wZXJhdGlvbiA9PT0gSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGUpIHtcblx0XHRcdFx0XHRcdHRvUmVtb3ZlLnB1c2gobG9jYWwuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEFic3RyYWN0RXh0ZW5zaW9uU2VydmljZS5vbkRpZEluc3RhbGxFeHRlbnNpb25zIGZpcmVkIGZvciAke2V4dGVuc2lvbnMubWFwKGUgPT4gZS5pZGVudGlmaWVyLmlkKS5qb2luKCcsICcpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2hhbmRsZURlbHRhRXh0ZW5zaW9ucyhuZXcgRGVsdGFFeHRlbnNpb25zUXVldWVJdGVtKGV4dGVuc2lvbnMsIHRvUmVtb3ZlKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxFeHRlbnNpb24oKGV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIWV2ZW50LmVycm9yKSB7XG5cdFx0XHRcdC8vIGFuIGV4dGVuc2lvbiBoYXMgYmVlbiB1bmluc3RhbGxlZFxuXHRcdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uIGZpcmVkIGZvciAke2V2ZW50LmlkZW50aWZpZXIuaWR9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faGFuZGxlRGVsdGFFeHRlbnNpb25zKG5ldyBEZWx0YUV4dGVuc2lvbnNRdWV1ZUl0ZW0oW10sIFtldmVudC5pZGVudGlmaWVyLmlkXSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oZXZlbnQgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCkpIHtcblx0XHRcdFx0ZXZlbnQuam9pbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gV2UgbmVlZCB0byBkaXNjb25uZWN0IHRoZSBtYW5hZ2VtZW50IGNvbm5lY3Rpb24gYmVmb3JlIGtpbGxpbmcgdGhlIGxvY2FsIGV4dGVuc2lvbiBob3N0LlxuXHRcdFx0XHRcdC8vIE90aGVyd2lzZSwgdGhlIGxvY2FsIGV4dGVuc2lvbiBob3N0IG1pZ2h0IHRlcm1pbmF0ZSB0aGUgdW5kZXJseWluZyB0dW5uZWwgYmVmb3JlIHRoZVxuXHRcdFx0XHRcdC8vIG1hbmFnZW1lbnQgY29ubmVjdGlvbiBoYXMgYSBjaGFuY2UgdG8gc2VuZCBpdHMgZGlzY29ubmVjdGlvbiBtZXNzYWdlLlxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZW5kQ29ubmVjdGlvbigpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fZG9TdG9wRXh0ZW5zaW9uSG9zdHMoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignRXJyb3Igd2hpbGUgZGlzY29ubmVjdGluZyByZW1vdGUgYWdlbnQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpZDogJ2pvaW4uZGlzY29ubmVjdFJlbW90ZScsXG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnZGlzY29ubmVjdFJlbW90ZScsIFwiRGlzY29ubmVjdCBSZW1vdGUgQWdlbnRcIiksXG5cdFx0XHRcdFx0b3JkZXI6IFdpbGxTaHV0ZG93bkpvaW5lck9yZGVyLkxhc3QgLy8gYWZ0ZXIgb3RoZXJzIGhhdmUgam9pbmVkIHRoYXQgbWlnaHQgZGVwZW5kIG9uIGEgcmVtb3RlIGNvbm5lY3Rpb25cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRldmVudC5qb2luKHRoaXMuX2RvU3RvcEV4dGVuc2lvbkhvc3RzKCksIHtcblx0XHRcdFx0XHRpZDogJ2pvaW4uc3RvcEV4dGVuc2lvbkhvc3RzJyxcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdzdG9wRXh0ZW5zaW9uSG9zdHMnLCBcIlN0b3BwaW5nIEV4dGVuc2lvbiBIb3N0c1wiKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRFeHRlbnNpb25Ib3N0TWFuYWdlcnMoa2luZDogRXh0ZW5zaW9uSG9zdEtpbmQpOiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5nZXRCeUtpbmQoa2luZCk7XG5cdH1cblxuXHQvLyNyZWdpb24gZGVsdGFFeHRlbnNpb25zXG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRGVsdGFFeHRlbnNpb25zKGl0ZW06IERlbHRhRXh0ZW5zaW9uc1F1ZXVlSXRlbSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2RlbHRhRXh0ZW5zaW9uc1F1ZXVlLnB1c2goaXRlbSk7XG5cdFx0aWYgKHRoaXMuX2luSGFuZGxlRGVsdGFFeHRlbnNpb25zKSB7XG5cdFx0XHQvLyBMZXQgdGhlIGN1cnJlbnQgaXRlbSBmaW5pc2gsIHRoZSBuZXcgb25lIHdpbGwgYmUgcGlja2VkIHVwXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGxvY2s6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnlMb2NrIHwgbnVsbCA9IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2luSGFuZGxlRGVsdGFFeHRlbnNpb25zID0gdHJ1ZTtcblxuXHRcdFx0Ly8gd2FpdCBmb3IgX2luaXRpYWxpemUgdG8gZmluaXNoIGJlZm9yZSBoYW5sZGluZyBhbnkgZGVsdGEgZXh0ZW5zaW9uIGV2ZW50c1xuXHRcdFx0YXdhaXQgdGhpcy5faW5zdGFsbGVkRXh0ZW5zaW9uc1JlYWR5LndhaXQoKTtcblxuXHRcdFx0bG9jayA9IGF3YWl0IHRoaXMuX3JlZ2lzdHJ5LmFjcXVpcmVMb2NrKCdoYW5kbGVEZWx0YUV4dGVuc2lvbnMnKTtcblx0XHRcdHdoaWxlICh0aGlzLl9kZWx0YUV4dGVuc2lvbnNRdWV1ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9kZWx0YUV4dGVuc2lvbnNRdWV1ZS5zaGlmdCgpITtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZGVsdGFFeHRlbnNpb25zKGxvY2ssIGl0ZW0udG9BZGQsIGl0ZW0udG9SZW1vdmUpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pbkhhbmRsZURlbHRhRXh0ZW5zaW9ucyA9IGZhbHNlO1xuXHRcdFx0bG9jaz8uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RlbHRhRXh0ZW5zaW9ucyhsb2NrOiBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5TG9jaywgX3RvQWRkOiBJRXh0ZW5zaW9uW10sIF90b1JlbW92ZTogc3RyaW5nW10gfCBJRXh0ZW5zaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoaXNDSSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBBYnN0cmFjdEV4dGVuc2lvblNlcnZpY2UuX2RlbHRhRXh0ZW5zaW9uczogdG9BZGQ6IFske190b0FkZC5tYXAoZSA9PiBlLmlkZW50aWZpZXIuaWQpLmpvaW4oJywnKX1dIHRvUmVtb3ZlOiBbJHtfdG9SZW1vdmUubWFwKGUgPT4gdHlwZW9mIGUgPT09ICdzdHJpbmcnID8gZSA6IGUuaWRlbnRpZmllci5pZCkuam9pbignLCcpfV1gKTtcblx0XHR9XG5cdFx0bGV0IHRvUmVtb3ZlOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBfdG9SZW1vdmUubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbk9ySWQgPSBfdG9SZW1vdmVbaV07XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZCA9ICh0eXBlb2YgZXh0ZW5zaW9uT3JJZCA9PT0gJ3N0cmluZycgPyBleHRlbnNpb25PcklkIDogZXh0ZW5zaW9uT3JJZC5pZGVudGlmaWVyLmlkKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9ICh0eXBlb2YgZXh0ZW5zaW9uT3JJZCA9PT0gJ3N0cmluZycgPyBudWxsIDogZXh0ZW5zaW9uT3JJZCk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25EZXNjcmlwdGlvbiA9IHRoaXMuX3JlZ2lzdHJ5LmdldEV4dGVuc2lvbkRlc2NyaXB0aW9uKGV4dGVuc2lvbklkKTtcblx0XHRcdGlmICghZXh0ZW5zaW9uRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0Ly8gaWdub3JlIGRpc2FibGluZy91bmluc3RhbGxpbmcgYW4gZXh0ZW5zaW9uIHdoaWNoIGlzIG5vdCBydW5uaW5nXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXh0ZW5zaW9uICYmIGV4dGVuc2lvbkRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLnNjaGVtZSAhPT0gZXh0ZW5zaW9uLmxvY2F0aW9uLnNjaGVtZSkge1xuXHRcdFx0XHQvLyB0aGlzIGV2ZW50IGlzIGZvciBhIGRpZmZlcmVudCBleHRlbnNpb24gdGhhbiBtaW5lIChtYXliZSBmb3IgdGhlIGxvY2FsIGV4dGVuc2lvbiwgd2hpbGUgSSBoYXZlIHRoZSByZW1vdGUgZXh0ZW5zaW9uKVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLmNhblJlbW92ZUV4dGVuc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbikpIHtcblx0XHRcdFx0Ly8gdXNlcyBub24tZHluYW1pYyBleHRlbnNpb24gcG9pbnQgb3IgaXMgYWN0aXZhdGVkXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0b1JlbW92ZS5wdXNoKGV4dGVuc2lvbkRlc2NyaXB0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCB0b0FkZDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gX3RvQWRkLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSBfdG9BZGRbaV07XG5cblx0XHRcdGNvbnN0IGV4dGVuc2lvbkRlc2NyaXB0aW9uID0gdG9FeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb24sIGZhbHNlKTtcblx0XHRcdGlmICghZXh0ZW5zaW9uRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0Ly8gY291bGQgbm90IHNjYW4gZXh0ZW5zaW9uLi4uXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX2NhbkFkZEV4dGVuc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgdG9SZW1vdmUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0b0FkZC5wdXNoKGV4dGVuc2lvbkRlc2NyaXB0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAodG9BZGQubGVuZ3RoID09PSAwICYmIHRvUmVtb3ZlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aGUgbG9jYWwgcmVnaXN0cnlcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9yZWdpc3RyeS5kZWx0YUV4dGVuc2lvbnMobG9jaywgdG9BZGQsIHRvUmVtb3ZlLm1hcChlID0+IGUuaWRlbnRpZmllcikpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9ucy5maXJlKHsgYWRkZWQ6IHRvQWRkLCByZW1vdmVkOiB0b1JlbW92ZSB9KTtcblxuXHRcdHRvUmVtb3ZlID0gdG9SZW1vdmUuY29uY2F0KHJlc3VsdC5yZW1vdmVkRHVlVG9Mb29waW5nKTtcblx0XHRpZiAocmVzdWx0LnJlbW92ZWREdWVUb0xvb3BpbmcubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnbG9vcGluZycsIFwiVGhlIGZvbGxvd2luZyBleHRlbnNpb25zIGNvbnRhaW4gZGVwZW5kZW5jeSBsb29wcyBhbmQgaGF2ZSBiZWVuIGRpc2FibGVkOiB7MH1cIiwgcmVzdWx0LnJlbW92ZWREdWVUb0xvb3BpbmcubWFwKGUgPT4gYCcke2UuaWRlbnRpZmllci52YWx1ZX0nYCkuam9pbignLCAnKSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIGVuYWJsZSBvciBkaXNhYmxlIHByb3Bvc2VkIEFQSSBwZXIgZXh0ZW5zaW9uXG5cdFx0dGhpcy5fZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLnVwZGF0ZUVuYWJsZWRBcGlQcm9wb3NhbHModG9BZGQpO1xuXG5cdFx0Ly8gVXBkYXRlIGV4dGVuc2lvbiBwb2ludHNcblx0XHR0aGlzLl9kb0hhbmRsZUV4dGVuc2lvblBvaW50cygoPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPltdKS5jb25jYXQodG9BZGQpLmNvbmNhdCh0b1JlbW92ZSksIGZhbHNlKTtcblxuXHRcdC8vIFVwZGF0ZSB0aGUgZXh0ZW5zaW9uIGhvc3Rcblx0XHRhd2FpdCB0aGlzLl91cGRhdGVFeHRlbnNpb25zT25FeHRIb3N0cyhyZXN1bHQudmVyc2lvbklkLCB0b0FkZCwgdG9SZW1vdmUubWFwKGUgPT4gZS5pZGVudGlmaWVyKSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRvQWRkLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9hY3RpdmF0ZUFkZGVkRXh0ZW5zaW9uSWZOZWVkZWQodG9BZGRbaV0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZUV4dGVuc2lvbnNPbkV4dEhvc3RzKHZlcnNpb25JZDogbnVtYmVyLCB0b0FkZDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIHRvUmVtb3ZlOiBFeHRlbnNpb25JZGVudGlmaWVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZW1vdmVkUnVubmluZ0xvY2F0aW9uID0gdGhpcy5fcnVubmluZ0xvY2F0aW9ucy5kZWx0YUV4dGVuc2lvbnModG9BZGQsIHRvUmVtb3ZlKTtcblx0XHRjb25zdCBwcm9taXNlcyA9IHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5tYXAoXG5cdFx0XHRleHRIb3N0TWFuYWdlciA9PiB0aGlzLl91cGRhdGVFeHRlbnNpb25zT25FeHRIb3N0KGV4dEhvc3RNYW5hZ2VyLCB2ZXJzaW9uSWQsIHRvQWRkLCB0b1JlbW92ZSwgcmVtb3ZlZFJ1bm5pbmdMb2NhdGlvbilcblx0XHQpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZUV4dGVuc2lvbnNPbkV4dEhvc3QoZXh0ZW5zaW9uSG9zdE1hbmFnZXI6IElFeHRlbnNpb25Ib3N0TWFuYWdlciwgdmVyc2lvbklkOiBudW1iZXIsIHRvQWRkOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgdG9SZW1vdmU6IEV4dGVuc2lvbklkZW50aWZpZXJbXSwgcmVtb3ZlZFJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24gfCBudWxsPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG15VG9BZGQgPSB0aGlzLl9ydW5uaW5nTG9jYXRpb25zLmZpbHRlckJ5RXh0ZW5zaW9uSG9zdE1hbmFnZXIodG9BZGQsIGV4dGVuc2lvbkhvc3RNYW5hZ2VyKTtcblx0XHRjb25zdCBteVRvUmVtb3ZlID0gZmlsdGVyRXh0ZW5zaW9uSWRlbnRpZmllcnModG9SZW1vdmUsIHJlbW92ZWRSdW5uaW5nTG9jYXRpb24sIGV4dFJ1bm5pbmdMb2NhdGlvbiA9PiBleHRlbnNpb25Ib3N0TWFuYWdlci5yZXByZXNlbnRzUnVubmluZ0xvY2F0aW9uKGV4dFJ1bm5pbmdMb2NhdGlvbikpO1xuXHRcdGNvbnN0IGFkZEFjdGl2YXRpb25FdmVudHMgPSBJbXBsaWNpdEFjdGl2YXRpb25FdmVudHMuY3JlYXRlQWN0aXZhdGlvbkV2ZW50c01hcCh0b0FkZCk7XG5cdFx0aWYgKGlzQ0kpIHtcblx0XHRcdGNvbnN0IHByaW50RXh0SWRzID0gKGV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdKSA9PiBleHRlbnNpb25zLm1hcChlID0+IGUuaWRlbnRpZmllci52YWx1ZSkuam9pbignLCcpO1xuXHRcdFx0Y29uc3QgcHJpbnRJZHMgPSAoZXh0ZW5zaW9uczogRXh0ZW5zaW9uSWRlbnRpZmllcltdKSA9PiBleHRlbnNpb25zLm1hcChlID0+IGUudmFsdWUpLmpvaW4oJywnKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlOiBDYWxsaW5nIGRlbHRhRXh0ZW5zaW9uczogdG9SZW1vdmU6IFske3ByaW50SWRzKHRvUmVtb3ZlKX1dLCB0b0FkZDogWyR7cHJpbnRFeHRJZHModG9BZGQpfV0sIG15VG9SZW1vdmU6IFske3ByaW50SWRzKG15VG9SZW1vdmUpfV0sIG15VG9BZGQ6IFske3ByaW50RXh0SWRzKG15VG9BZGQpfV0sYCk7XG5cdFx0fVxuXHRcdGF3YWl0IGV4dGVuc2lvbkhvc3RNYW5hZ2VyLmRlbHRhRXh0ZW5zaW9ucyh7IHZlcnNpb25JZCwgdG9SZW1vdmUsIHRvQWRkLCBhZGRBY3RpdmF0aW9uRXZlbnRzLCBteVRvUmVtb3ZlLCBteVRvQWRkOiBteVRvQWRkLm1hcChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIpIH0pO1xuXHR9XG5cblx0cHVibGljIGNhbkFkZEV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jYW5BZGRFeHRlbnNpb24oZXh0ZW5zaW9uLCBbXSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5BZGRFeHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGV4dGVuc2lvbnNCZWluZ1JlbW92ZWQ6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdKTogYm9vbGVhbiB7XG5cdFx0Ly8gKEFsc28gY2hlY2sgZm9yIHJlbmFtZWQgZXh0ZW5zaW9ucylcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3JlZ2lzdHJ5LmdldEV4dGVuc2lvbkRlc2NyaXB0aW9uQnlJZE9yVVVJRChleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdC8vIFRoaXMgZXh0ZW5zaW9uIGlzIGFscmVhZHkga25vd24gKG1vc3QgbGlrZWx5IGF0IGEgZGlmZmVyZW50IHZlcnNpb24pXG5cdFx0XHQvLyBzbyBpdCBjYW5ub3QgYmUgYWRkZWQgYWdhaW4gdW5sZXNzIGl0IGlzIHJlbW92ZWQgZmlyc3Rcblx0XHRcdGNvbnN0IGlzQmVpbmdSZW1vdmVkID0gZXh0ZW5zaW9uc0JlaW5nUmVtb3ZlZC5zb21lKChleHRlbnNpb25EZXNjcmlwdGlvbikgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdGlmICghaXNCZWluZ1JlbW92ZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmRzID0gdGhpcy5fcnVubmluZ0xvY2F0aW9ucy5yZWFkRXh0ZW5zaW9uS2luZHMoZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBpc1JlbW90ZSA9IGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkhvc3RLaW5kID0gdGhpcy5fZXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIucGlja0V4dGVuc2lvbkhvc3RLaW5kKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBleHRlbnNpb25LaW5kcywgIWlzUmVtb3RlLCBpc1JlbW90ZSwgRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UuTm9uZSk7XG5cdFx0aWYgKGV4dGVuc2lvbkhvc3RLaW5kID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgY2FuUmVtb3ZlRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRGVzY3JpcHRpb24gPSB0aGlzLl9yZWdpc3RyeS5nZXRFeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0aWYgKCFleHRlbnNpb25EZXNjcmlwdGlvbikge1xuXHRcdFx0Ly8gQ2FuJ3QgcmVtb3ZlIGFuIGV4dGVuc2lvbiB0aGF0IGlzIHVua25vd24hXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2V4dGVuc2lvblN0YXR1cy5nZXQoZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcik/LmFjdGl2YXRpb25TdGFydGVkKSB7XG5cdFx0XHQvLyBFeHRlbnNpb24gaXMgcnVubmluZywgY2Fubm90IHJlbW92ZSBpdCBzYWZlbHlcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FjdGl2YXRlQWRkZWRFeHRlbnNpb25JZk5lZWRlZChleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHNob3VsZEFjdGl2YXRlUmVhc29uOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgaGFzV29ya3NwYWNlQ29udGFpbnMgPSBmYWxzZTtcblx0XHRjb25zdCBhY3RpdmF0aW9uRXZlbnRzID0gdGhpcy5fYWN0aXZhdGlvbkV2ZW50UmVhZGVyLnJlYWRBY3RpdmF0aW9uRXZlbnRzKGV4dGVuc2lvbkRlc2NyaXB0aW9uKTtcblx0XHRmb3IgKGNvbnN0IGFjdGl2YXRpb25FdmVudCBvZiBhY3RpdmF0aW9uRXZlbnRzKSB7XG5cdFx0XHRpZiAodGhpcy5fYWxsUmVxdWVzdGVkQWN0aXZhdGVFdmVudHMuaGFzKGFjdGl2YXRpb25FdmVudCkpIHtcblx0XHRcdFx0Ly8gVGhpcyBhY3RpdmF0aW9uIGV2ZW50IHdhcyBmaXJlZCBiZWZvcmUgdGhlIGV4dGVuc2lvbiB3YXMgYWRkZWRcblx0XHRcdFx0c2hvdWxkQWN0aXZhdGVSZWFzb24gPSBhY3RpdmF0aW9uRXZlbnQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWN0aXZhdGlvbkV2ZW50ID09PSAnKicpIHtcblx0XHRcdFx0c2hvdWxkQWN0aXZhdGVSZWFzb24gPSBhY3RpdmF0aW9uRXZlbnQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoL153b3Jrc3BhY2VDb250YWlucy8udGVzdChhY3RpdmF0aW9uRXZlbnQpKSB7XG5cdFx0XHRcdGhhc1dvcmtzcGFjZUNvbnRhaW5zID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjdGl2YXRpb25FdmVudCA9PT0gJ29uU3RhcnR1cEZpbmlzaGVkJykge1xuXHRcdFx0XHRzaG91bGRBY3RpdmF0ZVJlYXNvbiA9IGFjdGl2YXRpb25FdmVudDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFzaG91bGRBY3RpdmF0ZVJlYXNvbiAmJiBoYXNXb3Jrc3BhY2VDb250YWlucykge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0Q29tcGxldGVXb3Jrc3BhY2UoKTtcblx0XHRcdGNvbnN0IGZvcmNlVXNpbmdTZWFyY2ggPSAhIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRjb25zdCBob3N0OiBJV29ya3NwYWNlQ29udGFpbnNBY3RpdmF0aW9uSG9zdCA9IHtcblx0XHRcdFx0bG9nU2VydmljZTogdGhpcy5fbG9nU2VydmljZSxcblx0XHRcdFx0Zm9sZGVyczogd29ya3NwYWNlLmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKSxcblx0XHRcdFx0Zm9yY2VVc2luZ1NlYXJjaDogZm9yY2VVc2luZ1NlYXJjaCxcblx0XHRcdFx0ZXhpc3RzOiAodXJpKSA9PiB0aGlzLl9maWxlU2VydmljZS5leGlzdHModXJpKSxcblx0XHRcdFx0Y2hlY2tFeGlzdHM6IChmb2xkZXJzLCBpbmNsdWRlcywgdG9rZW4pID0+IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4gY2hlY2tHbG9iRmlsZUV4aXN0cyhhY2Nlc3NvciwgZm9sZGVycywgaW5jbHVkZXMsIHRva2VuKSlcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNoZWNrQWN0aXZhdGVXb3Jrc3BhY2VDb250YWluc0V4dGVuc2lvbihob3N0LCBleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHNob3VsZEFjdGl2YXRlUmVhc29uID0gcmVzdWx0LmFjdGl2YXRpb25FdmVudDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2hvdWxkQWN0aXZhdGVSZWFzb24pIHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFxuXHRcdFx0XHR0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMubWFwKGV4dEhvc3RNYW5hZ2VyID0+IGV4dEhvc3RNYW5hZ2VyLmFjdGl2YXRlKGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIHsgc3RhcnR1cDogZmFsc2UsIGV4dGVuc2lvbklkOiBleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBhY3RpdmF0aW9uRXZlbnQ6IHNob3VsZEFjdGl2YXRlUmVhc29uIH0pKVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIF9pbml0aWFsaXplUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuXHRwcm90ZWN0ZWQgX2luaXRpYWxpemVJZk5lZWRlZCgpOiBQcm9taXNlPHZvaWQ+IHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9pbml0aWFsaXplUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5faW5pdGlhbGl6ZVByb21pc2UgPSB0aGlzLl9pbml0aWFsaXplKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsaXplUHJvbWlzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRwZXJmLm1hcmsoJ2NvZGUvd2lsbExvYWRFeHRlbnNpb25zJyk7XG5cdFx0dGhpcy5fc3RhcnRFeHRlbnNpb25Ib3N0c0lmTmVjZXNzYXJ5KHRydWUsIFtdKTtcblxuXHRcdGNvbnN0IGxvY2sgPSBhd2FpdCB0aGlzLl9yZWdpc3RyeS5hY3F1aXJlTG9jaygnX2luaXRpYWxpemUnKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZUFuZFByb2Nlc3NFeHRlbnNpb25zKGxvY2spO1xuXHRcdFx0Ly8gU3RhcnQgZXh0ZW5zaW9uIGhvc3RzIHdoaWNoIGFyZSBub3QgYXV0b21hdGljYWxseSBzdGFydGVkXG5cdFx0XHR0aGlzLl9zdGFydE9uRGVtYW5kRXh0ZW5zaW9uSG9zdHMoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bG9jay5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVsZWFzZUJhcnJpZXIoKTtcblx0XHRwZXJmLm1hcmsoJ2NvZGUvZGlkTG9hZEV4dGVuc2lvbnMnKTtcblxuXHRcdC8vIEFjdGl2YXRlIGRlZmVycmVkIHJlbW90ZSBldmVudHMgbm93IHRoYXQgcmVtb3RlIGhvc3RzIGFyZSBzdGFydGluZ1xuXHRcdC8vIFRoaXMgaXMgZG9uZSBhZnRlciB0aGUgYmFycmllciBpcyByZWxlYXNlZCB0byBhdm9pZCBibG9ja2luZyBpbml0aWFsaXphdGlvblxuXHRcdHRoaXMuX2FjdGl2YXRlRGVmZXJyZWRSZW1vdGVFdmVudHMoKTtcblxuXHRcdGF3YWl0IHRoaXMuX2hhbmRsZUV4dGVuc2lvblRlc3RzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hY3RpdmF0ZURlZmVycmVkUmVtb3RlRXZlbnRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nUmVtb3RlQWN0aXZhdGlvbkV2ZW50cy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3RlRXh0ZW5zaW9uSG9zdHMgPSB0aGlzLl9nZXRFeHRlbnNpb25Ib3N0TWFuYWdlcnMoRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlKTtcblx0XHRpZiAocmVtb3RlRXh0ZW5zaW9uSG9zdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVtb3RlQWN0aXZhdGlvbkV2ZW50cy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFdhaXQgZm9yIHJlbW90ZSBleHRlbnNpb24gaG9zdHMgdG8gYmUgcmVhZHlcblx0XHRhd2FpdCBQcm9taXNlLmFsbChyZW1vdGVFeHRlbnNpb25Ib3N0cy5tYXAoZXh0SG9zdCA9PiBleHRIb3N0LnJlYWR5KCkpKTtcblxuXHRcdC8vIFJlcGxheSBkZWZlcnJlZCBhY3RpdmF0aW9uIGV2ZW50cyBvbiByZW1vdGUgaG9zdHNcblx0XHRmb3IgKGNvbnN0IGFjdGl2YXRpb25FdmVudCBvZiB0aGlzLl9wZW5kaW5nUmVtb3RlQWN0aXZhdGlvbkV2ZW50cykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gUHJvbWlzZS5hbGwoXG5cdFx0XHRcdHJlbW90ZUV4dGVuc2lvbkhvc3RzLm1hcChleHRIb3N0TWFuYWdlciA9PiBleHRIb3N0TWFuYWdlci5hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50LCBBY3RpdmF0aW9uS2luZC5Ob3JtYWwpKVxuXHRcdFx0KS50aGVuKCgpID0+IHsgfSk7XG5cdFx0XHR0aGlzLl9vbldpbGxBY3RpdmF0ZUJ5RXZlbnQuZmlyZSh7XG5cdFx0XHRcdGV2ZW50OiBhY3RpdmF0aW9uRXZlbnQsXG5cdFx0XHRcdGFjdGl2YXRpb246IHJlc3VsdCxcblx0XHRcdFx0YWN0aXZhdGlvbktpbmQ6IEFjdGl2YXRpb25LaW5kLk5vcm1hbFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ1JlbW90ZUFjdGl2YXRpb25FdmVudHMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVBbmRQcm9jZXNzRXh0ZW5zaW9ucyhsb2NrOiBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5TG9jaywpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgcmVzb2x2ZXJFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdO1xuXHRcdGxldCBsb2NhbEV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW107XG5cdFx0bGV0IHJlbW90ZUV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW107XG5cblx0XHRmb3IgYXdhaXQgKGNvbnN0IGV4dGVuc2lvbnMgb2YgdGhpcy5fcmVzb2x2ZUV4dGVuc2lvbnMoKSkge1xuXHRcdFx0aWYgKGV4dGVuc2lvbnMgaW5zdGFuY2VvZiBSZXNvbHZlckV4dGVuc2lvbnMpIHtcblx0XHRcdFx0cmVzb2x2ZXJFeHRlbnNpb25zID0gY2hlY2tFbmFibGVkQW5kUHJvcG9zZWRBUEkodGhpcy5fbG9nU2VydmljZSwgdGhpcy5fZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIHRoaXMuX2V4dGVuc2lvbnNQcm9wb3NlZEFwaSwgZXh0ZW5zaW9ucy5leHRlbnNpb25zLCBmYWxzZSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdHJ5LmRlbHRhRXh0ZW5zaW9ucyhsb2NrLCByZXNvbHZlckV4dGVuc2lvbnMsIFtdKTtcblx0XHRcdFx0dGhpcy5fZG9IYW5kbGVFeHRlbnNpb25Qb2ludHMocmVzb2x2ZXJFeHRlbnNpb25zLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdGlmIChleHRlbnNpb25zIGluc3RhbmNlb2YgTG9jYWxFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGxvY2FsRXh0ZW5zaW9ucyA9IGNoZWNrRW5hYmxlZEFuZFByb3Bvc2VkQVBJKHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCB0aGlzLl9leHRlbnNpb25zUHJvcG9zZWRBcGksIGV4dGVuc2lvbnMuZXh0ZW5zaW9ucywgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbnMgaW5zdGFuY2VvZiBSZW1vdGVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdHJlbW90ZUV4dGVuc2lvbnMgPSBjaGVja0VuYWJsZWRBbmRQcm9wb3NlZEFQSSh0aGlzLl9sb2dTZXJ2aWNlLCB0aGlzLl9leHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgdGhpcy5fZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLCBleHRlbnNpb25zLmV4dGVuc2lvbnMsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBgaW5pdGlhbGl6ZVJ1bm5pbmdMb2NhdGlvbmAgd2lsbCBsb29rIGF0IHRoZSBjb21wbGV0ZSBwaWN0dXJlIChlLmcuIGFuIGV4dGVuc2lvbiBpbnN0YWxsZWQgb24gYm90aCBzaWRlcyksXG5cdFx0Ly8gdGFrZXMgY2FyZSBvZiBkdXBsaWNhdGVzIGFuZCBwaWNrcyBhIHJ1bm5pbmcgbG9jYXRpb24gZm9yIGVhY2ggZXh0ZW5zaW9uXG5cdFx0dGhpcy5fcnVubmluZ0xvY2F0aW9ucy5pbml0aWFsaXplUnVubmluZ0xvY2F0aW9uKGxvY2FsRXh0ZW5zaW9ucywgcmVtb3RlRXh0ZW5zaW9ucyk7XG5cblx0XHR0aGlzLl9zdGFydEV4dGVuc2lvbkhvc3RzSWZOZWNlc3NhcnkodHJ1ZSwgW10pO1xuXG5cdFx0Ly8gU29tZSByZW1vdGUgZXh0ZW5zaW9ucyBjb3VsZCBydW4gbG9jYWxseSBpbiB0aGUgd2ViIHdvcmtlciwgc28gc3RvcmUgdGhlbVxuXHRcdGNvbnN0IHJlbW90ZUV4dGVuc2lvbnNUaGF0TmVlZFRvUnVuTG9jYWxseSA9ICh0aGlzLl9hbGxvd1JlbW90ZUV4dGVuc2lvbnNJbkxvY2FsV2ViV29ya2VyID8gdGhpcy5fcnVubmluZ0xvY2F0aW9ucy5maWx0ZXJCeUV4dGVuc2lvbkhvc3RLaW5kKHJlbW90ZUV4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyKSA6IFtdKTtcblx0XHRjb25zdCBsb2NhbFByb2Nlc3NFeHRlbnNpb25zID0gKHRoaXMuX2hhc0xvY2FsUHJvY2VzcyA/IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMuZmlsdGVyQnlFeHRlbnNpb25Ib3N0S2luZChsb2NhbEV4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2VzcykgOiBbXSk7XG5cdFx0Y29uc3QgbG9jYWxXZWJXb3JrZXJFeHRlbnNpb25zID0gdGhpcy5fcnVubmluZ0xvY2F0aW9ucy5maWx0ZXJCeUV4dGVuc2lvbkhvc3RLaW5kKGxvY2FsRXh0ZW5zaW9ucywgRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxXZWJXb3JrZXIpO1xuXHRcdHJlbW90ZUV4dGVuc2lvbnMgPSB0aGlzLl9ydW5uaW5nTG9jYXRpb25zLmZpbHRlckJ5RXh0ZW5zaW9uSG9zdEtpbmQocmVtb3RlRXh0ZW5zaW9ucywgRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlKTtcblxuXHRcdC8vIEFkZCBsb2NhbGx5IHRoZSByZW1vdGUgZXh0ZW5zaW9ucyB0aGF0IG5lZWQgdG8gcnVuIGxvY2FsbHkgaW4gdGhlIHdlYiB3b3JrZXJcblx0XHRmb3IgKGNvbnN0IGV4dCBvZiByZW1vdGVFeHRlbnNpb25zVGhhdE5lZWRUb1J1bkxvY2FsbHkpIHtcblx0XHRcdGlmICghaW5jbHVkZXMobG9jYWxXZWJXb3JrZXJFeHRlbnNpb25zLCBleHQuaWRlbnRpZmllcikpIHtcblx0XHRcdFx0bG9jYWxXZWJXb3JrZXJFeHRlbnNpb25zLnB1c2goZXh0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhbGxFeHRlbnNpb25zID0gcmVtb3RlRXh0ZW5zaW9ucy5jb25jYXQobG9jYWxQcm9jZXNzRXh0ZW5zaW9ucykuY29uY2F0KGxvY2FsV2ViV29ya2VyRXh0ZW5zaW9ucyk7XG5cdFx0bGV0IHRvQWRkID0gYWxsRXh0ZW5zaW9ucztcblxuXHRcdGlmIChyZXNvbHZlckV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHQvLyBBZGQgZXh0ZW5zaW9ucyB0aGF0IGFyZSBub3QgcmVnaXN0ZXJlZCBhcyByZXNvbHZlcnMgYnV0IGFyZSBpbiB0aGUgZmluYWwgcmVzb2x2ZWQgc2V0XG5cdFx0XHR0b0FkZCA9IGFsbEV4dGVuc2lvbnMuZmlsdGVyKGV4dGVuc2lvbiA9PiAhcmVzb2x2ZXJFeHRlbnNpb25zLnNvbWUoZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSAmJiBlLmV4dGVuc2lvbkxvY2F0aW9uLnRvU3RyaW5nKCkgPT09IGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbi50b1N0cmluZygpKSk7XG5cdFx0XHQvLyBSZW1vdmUgZXh0ZW5zaW9ucyB0aGF0IGFyZSByZWdpc3RlcmVkIGFzIHJlc29sdmVycyBidXQgYXJlIG5vdCBpbiB0aGUgZmluYWwgcmVzb2x2ZWQgc2V0XG5cdFx0XHRpZiAoYWxsRXh0ZW5zaW9ucy5sZW5ndGggPCB0b0FkZC5sZW5ndGggKyByZXNvbHZlckV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHRvUmVtb3ZlID0gcmVzb2x2ZXJFeHRlbnNpb25zLmZpbHRlcihyZWdpc3RlcmVkID0+ICFhbGxFeHRlbnNpb25zLnNvbWUoZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhlLmlkZW50aWZpZXIsIHJlZ2lzdGVyZWQuaWRlbnRpZmllcikgJiYgZS5leHRlbnNpb25Mb2NhdGlvbi50b1N0cmluZygpID09PSByZWdpc3RlcmVkLmV4dGVuc2lvbkxvY2F0aW9uLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0aWYgKHRvUmVtb3ZlLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdHJ5LmRlbHRhRXh0ZW5zaW9ucyhsb2NrLCBbXSwgdG9SZW1vdmUubWFwKGUgPT4gZS5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0dGhpcy5fZG9IYW5kbGVFeHRlbnNpb25Qb2ludHModG9SZW1vdmUsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fcmVnaXN0cnkuZGVsdGFFeHRlbnNpb25zKGxvY2ssIHRvQWRkLCBbXSk7XG5cdFx0aWYgKHJlc3VsdC5yZW1vdmVkRHVlVG9Mb29waW5nLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2xvb3BpbmcnLCBcIlRoZSBmb2xsb3dpbmcgZXh0ZW5zaW9ucyBjb250YWluIGRlcGVuZGVuY3kgbG9vcHMgYW5kIGhhdmUgYmVlbiBkaXNhYmxlZDogezB9XCIsIHJlc3VsdC5yZW1vdmVkRHVlVG9Mb29waW5nLm1hcChlID0+IGAnJHtlLmlkZW50aWZpZXIudmFsdWV9J2ApLmpvaW4oJywgJykpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9kb0hhbmRsZUV4dGVuc2lvblBvaW50cyh0aGlzLl9yZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKSwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRXh0ZW5zaW9uVGVzdHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCB8fCAhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25Ib3N0TWFuYWdlciA9IHRoaXMuZmluZFRlc3RFeHRlbnNpb25Ib3N0KHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKTtcblx0XHRpZiAoIWV4dGVuc2lvbkhvc3RNYW5hZ2VyKSB7XG5cdFx0XHRjb25zdCBtc2cgPSBubHMubG9jYWxpemUoJ2V4dGVuc2lvblRlc3RFcnJvcicsIFwiTm8gZXh0ZW5zaW9uIGhvc3QgZm91bmQgdGhhdCBjYW4gbGF1bmNoIHRoZSB0ZXN0IHJ1bm5lciBhdCB7MH0uXCIsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc29sZS5lcnJvcihtc2cpO1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihtc2cpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXG5cdFx0bGV0IGV4aXRDb2RlOiBudW1iZXI7XG5cdFx0dHJ5IHtcblx0XHRcdGV4aXRDb2RlID0gYXdhaXQgZXh0ZW5zaW9uSG9zdE1hbmFnZXIuZXh0ZW5zaW9uVGVzdHNFeGVjdXRlKCk7XG5cdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEV4dGVuc2lvbiBob3N0IHRlc3QgcnVubmVyIGV4aXQgY29kZTogJHtleGl0Q29kZX1gKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEV4dGVuc2lvbiBob3N0IHRlc3QgcnVubmVyIGVycm9yYCwgZXJyKTtcblx0XHRcdH1cblx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyKTtcblx0XHRcdGV4aXRDb2RlID0gMSAvKiBFUlJPUiAqLztcblx0XHR9XG5cblx0XHR0aGlzLl9vbkV4dGVuc2lvbkhvc3RFeGl0KGV4aXRDb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgZmluZFRlc3RFeHRlbnNpb25Ib3N0KHRlc3RMb2NhdGlvbjogVVJJKTogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyIHwgbnVsbCB7XG5cdFx0bGV0IHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIHwgbnVsbCA9IG51bGw7XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiB0aGlzLl9yZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKSkge1xuXHRcdFx0aWYgKGlzRXF1YWxPclBhcmVudCh0ZXN0TG9jYXRpb24sIGV4dGVuc2lvbi5leHRlbnNpb25Mb2NhdGlvbikpIHtcblx0XHRcdFx0cnVubmluZ0xvY2F0aW9uID0gdGhpcy5fcnVubmluZ0xvY2F0aW9ucy5nZXRSdW5uaW5nTG9jYXRpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJ1bm5pbmdMb2NhdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0Ly8gbm90IHN1cmUgaWYgd2Ugc2hvdWxkIHN1cHBvcnQgdGhhdCwgYnV0IGl0IHdhcyBwb3NzaWJsZSB0byBoYXZlIGFuIHRlc3Qgb3V0c2lkZSBhbiBleHRlbnNpb25cblxuXHRcdFx0aWYgKHRlc3RMb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cdFx0XHRcdHJ1bm5pbmdMb2NhdGlvbiA9IG5ldyBSZW1vdGVSdW5uaW5nTG9jYXRpb24oKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFdoZW4gYSBkZWJ1Z2dlciBhdHRhY2hlcyB0byB0aGUgZXh0ZW5zaW9uIGhvc3QsIGl0IHdpbGwgc3VyZmFjZSBhbGwgY29uc29sZS5sb2cgbWVzc2FnZXMgZnJvbSB0aGUgZXh0ZW5zaW9uIGhvc3QsXG5cdFx0XHRcdC8vIGJ1dCBub3QgbmVjZXNzYXJpbHkgZnJvbSB0aGUgd2luZG93LiBTbyBpdCB3b3VsZCBiZSBiZXN0IGlmIGFueSBlcnJvcnMgZ2V0IHByaW50ZWQgdG8gdGhlIGNvbnNvbGUgb2YgdGhlIGV4dGVuc2lvbiBob3N0LlxuXHRcdFx0XHQvLyBUaGF0IGlzIHdoeSBoZXJlIHdlIHVzZSB0aGUgbG9jYWwgcHJvY2VzcyBleHRlbnNpb24gaG9zdCBldmVuIGZvciBub24tZmlsZSBVUklzXG5cdFx0XHRcdHJ1bm5pbmdMb2NhdGlvbiA9IG5ldyBMb2NhbFByb2Nlc3NSdW5uaW5nTG9jYXRpb24oMCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChydW5uaW5nTG9jYXRpb24gIT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMuZ2V0QnlSdW5uaW5nTG9jYXRpb24ocnVubmluZ0xvY2F0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF9yZWxlYXNlQmFycmllcigpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnN0YWxsZWRFeHRlbnNpb25zUmVhZHkub3BlbigpO1xuXHRcdHRoaXMuX29uRGlkUmVnaXN0ZXJFeHRlbnNpb25zLmZpcmUodW5kZWZpbmVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnNTdGF0dXMuZmlyZSh0aGlzLl9yZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKS5tYXAoZSA9PiBlLmlkZW50aWZpZXIpKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiByZW1vdGUgYXV0aG9yaXR5IHJlc29sdmluZ1xuXG5cdHByb3RlY3RlZCBhc3luYyBfcmVzb2x2ZUF1dGhvcml0eUluaXRpYWwocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpOiBQcm9taXNlPFJlc29sdmVyUmVzdWx0PiB7XG5cdFx0Y29uc3QgTUFYX0FUVEVNUFRTID0gNTtcblxuXHRcdGZvciAobGV0IGF0dGVtcHQgPSAxOyA7IGF0dGVtcHQrKykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVBdXRob3JpdHlXaXRoTG9nZ2luZyhyZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGlmIChSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLmlzTm9SZXNvbHZlckZvdW5kKGVycikpIHtcblx0XHRcdFx0XHQvLyBUaGVyZSBpcyBubyBwb2ludCBpbiByZXRyeWluZyBpZiB0aGVyZSBpcyBubyByZXNvbHZlciBmb3VuZFxuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLmlzTm90QXZhaWxhYmxlKGVycikpIHtcblx0XHRcdFx0XHQvLyBUaGUgcmVzb2x2ZXIgaXMgbm90IGF2YWlsYWJsZSBhbmQgYXNrZWQgdXMgdG8gbm90IHJldHJ5XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGF0dGVtcHQgPj0gTUFYX0FUVEVNUFRTKSB7XG5cdFx0XHRcdFx0Ly8gVG9vIG1hbnkgZmFpbGVkIGF0dGVtcHRzLCBnaXZlIHVwXG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9yZXNvbHZlQXV0aG9yaXR5QWdhaW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRpZiAoIXJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fY2xlYXJSZXNvbHZlZEF1dGhvcml0eShyZW1vdGVBdXRob3JpdHkpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQXV0aG9yaXR5V2l0aExvZ2dpbmcocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fc2V0UmVzb2x2ZWRBdXRob3JpdHkocmVzdWx0LmF1dGhvcml0eSwgcmVzdWx0Lm9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLl9zZXRSZXNvbHZlZEF1dGhvcml0eUVycm9yKHJlbW90ZUF1dGhvcml0eSwgZXJyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQXV0aG9yaXR5V2l0aExvZ2dpbmcocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpOiBQcm9taXNlPFJlc29sdmVyUmVzdWx0PiB7XG5cdFx0Y29uc3QgYXV0aG9yaXR5UHJlZml4ID0gZ2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4KHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0Y29uc3Qgc3cgPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEludm9raW5nIHJlc29sdmVBdXRob3JpdHkoJHthdXRob3JpdHlQcmVmaXh9KS4uLmApO1xuXHRcdHRyeSB7XG5cdFx0XHRwZXJmLm1hcmsoYGNvZGUvd2lsbFJlc29sdmVBdXRob3JpdHkvJHthdXRob3JpdHlQcmVmaXh9YCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQXV0aG9yaXR5KHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRwZXJmLm1hcmsoYGNvZGUvZGlkUmVzb2x2ZUF1dGhvcml0eU9LLyR7YXV0aG9yaXR5UHJlZml4fWApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGByZXNvbHZlQXV0aG9yaXR5KCR7YXV0aG9yaXR5UHJlZml4fSkgcmV0dXJuZWQgJyR7cmVzdWx0LmF1dGhvcml0eS5jb25uZWN0VG99JyBhZnRlciAke3N3LmVsYXBzZWQoKX0gbXNgKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRwZXJmLm1hcmsoYGNvZGUvZGlkUmVzb2x2ZUF1dGhvcml0eUVycm9yLyR7YXV0aG9yaXR5UHJlZml4fWApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgcmVzb2x2ZUF1dGhvcml0eSgke2F1dGhvcml0eVByZWZpeH0pIHJldHVybmVkIGFuIGVycm9yIGFmdGVyICR7c3cuZWxhcHNlZCgpfSBtc2AsIGVycik7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9yZXNvbHZlQXV0aG9yaXR5T25FeHRlbnNpb25Ib3N0cyhraW5kOiBFeHRlbnNpb25Ib3N0S2luZCwgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpOiBQcm9taXNlPFJlc29sdmVyUmVzdWx0PiB7XG5cblx0XHRjb25zdCBleHRlbnNpb25Ib3N0cyA9IHRoaXMuX2dldEV4dGVuc2lvbkhvc3RNYW5hZ2VycyhraW5kKTtcblx0XHRpZiAoZXh0ZW5zaW9uSG9zdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBubyBsb2NhbCBwcm9jZXNzIGV4dGVuc2lvbiBob3N0c1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVzb2x2ZSBhdXRob3JpdHlgKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXNvbHZlQXV0aG9yaXR5QXR0ZW1wdCsrO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChleHRlbnNpb25Ib3N0cy5tYXAoZXh0SG9zdCA9PiBleHRIb3N0LnJlc29sdmVBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5LCB0aGlzLl9yZXNvbHZlQXV0aG9yaXR5QXR0ZW1wdCkpKTtcblxuXHRcdGxldCBiZXN0RXJyb3JSZXN1bHQ6IElSZXNvbHZlQXV0aG9yaXR5RXJyb3JSZXN1bHQgfCBudWxsID0gbnVsbDtcblx0XHRmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzKSB7XG5cdFx0XHRpZiAocmVzdWx0LnR5cGUgPT09ICdvaycpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdC52YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghYmVzdEVycm9yUmVzdWx0KSB7XG5cdFx0XHRcdGJlc3RFcnJvclJlc3VsdCA9IHJlc3VsdDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBiZXN0RXJyb3JJc1Vua25vd24gPSAoYmVzdEVycm9yUmVzdWx0LmVycm9yLmNvZGUgPT09IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLlVua25vd24pO1xuXHRcdFx0Y29uc3QgZXJyb3JJc1Vua25vd24gPSAocmVzdWx0LmVycm9yLmNvZGUgPT09IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLlVua25vd24pO1xuXHRcdFx0aWYgKGJlc3RFcnJvcklzVW5rbm93biAmJiAhZXJyb3JJc1Vua25vd24pIHtcblx0XHRcdFx0YmVzdEVycm9yUmVzdWx0ID0gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHdlIGNhbiBvbmx5IHJlYWNoIHRoaXMgaWYgdGhlcmUgaXMgYW4gZXJyb3Jcblx0XHR0aHJvdyBuZXcgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvcihiZXN0RXJyb3JSZXN1bHQhLmVycm9yLm1lc3NhZ2UsIGJlc3RFcnJvclJlc3VsdCEuZXJyb3IuY29kZSwgYmVzdEVycm9yUmVzdWx0IS5lcnJvci5kZXRhaWwpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFN0b3BwaW5nIC8gU3RhcnRpbmcgLyBSZXN0YXJ0aW5nXG5cblx0cHVibGljIGFzeW5jIHN0b3BFeHRlbnNpb25Ib3N0cyhyZWFzb246IHN0cmluZywgYXV0bz86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRhd2FpdCB0aGlzLl9pbml0aWFsaXplSWZOZWVkZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5fZG9TdG9wRXh0ZW5zaW9uSG9zdHNXaXRoVmV0byhyZWFzb24sIGF1dG8pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9kb1N0b3BFeHRlbnNpb25Ib3N0cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcmV2aW91c2x5QWN0aXZhdGVkRXh0ZW5zaW9uSWRzOiBFeHRlbnNpb25JZGVudGlmaWVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvblN0YXR1cyBvZiB0aGlzLl9leHRlbnNpb25TdGF0dXMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChleHRlbnNpb25TdGF0dXMuYWN0aXZhdGlvblN0YXJ0ZWQpIHtcblx0XHRcdFx0cHJldmlvdXNseUFjdGl2YXRlZEV4dGVuc2lvbklkcy5wdXNoKGV4dGVuc2lvblN0YXR1cy5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLnN0b3BBbGxJblJldmVyc2UoKTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvblN0YXR1cyBvZiB0aGlzLl9leHRlbnNpb25TdGF0dXMudmFsdWVzKCkpIHtcblx0XHRcdGV4dGVuc2lvblN0YXR1cy5jbGVhclJ1bnRpbWVTdGF0dXMoKTtcblx0XHR9XG5cblx0XHRpZiAocHJldmlvdXNseUFjdGl2YXRlZEV4dGVuc2lvbklkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnNTdGF0dXMuZmlyZShwcmV2aW91c2x5QWN0aXZhdGVkRXh0ZW5zaW9uSWRzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1N0b3BFeHRlbnNpb25Ib3N0c1dpdGhWZXRvKHJlYXNvbjogc3RyaW5nLCBhdXRvOiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoYXV0byAmJiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZldG9zOiAoYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4pW10gPSBbXTtcblx0XHRjb25zdCB2ZXRvUmVhc29ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0dGhpcy5fb25XaWxsU3RvcC5maXJlKHtcblx0XHRcdHJlYXNvbixcblx0XHRcdGF1dG8sXG5cdFx0XHR2ZXRvKHZhbHVlLCByZWFzb24pIHtcblx0XHRcdFx0dmV0b3MucHVzaCh2YWx1ZSk7XG5cblx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHR2ZXRvUmVhc29ucy5hZGQocmVhc29uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmFsdWUudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0dmV0b1JlYXNvbnMuYWRkKHJlYXNvbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRcdFx0dmV0b1JlYXNvbnMuYWRkKG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uU3RvcFZldG9FcnJvcicsIFwiezB9IChFcnJvcjogezF9KVwiLCByZWFzb24sIHRvRXJyb3JNZXNzYWdlKGVycm9yKSkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgaGFuZGxlVmV0b3ModmV0b3MsIGVycm9yID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpKTtcblx0XHRpZiAoIXZldG8pIHtcblx0XHRcdGF3YWl0IHRoaXMuX2RvU3RvcEV4dGVuc2lvbkhvc3RzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghYXV0bykge1xuXHRcdFx0XHRjb25zdCB2ZXRvUmVhc29uc0FycmF5ID0gQXJyYXkuZnJvbSh2ZXRvUmVhc29ucyk7XG5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBFeHRlbnNpb24gaG9zdCB3YXMgbm90IHN0b3BwZWQgYmVjYXVzZSBvZiB2ZXRvIChzdG9wIHJlYXNvbjogJHtyZWFzb259LCB2ZXRvIHJlYXNvbjogJHt2ZXRvUmVhc29uc0FycmF5LmpvaW4oJywgJyl9KWApO1xuXG5cdFx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdleHRlbnNpb25TdG9wVmV0b01lc3NhZ2UnLCBcIlBsZWFzZSBjb25maXJtIHJlc3RhcnQgb2YgZXh0ZW5zaW9ucy5cIiksXG5cdFx0XHRcdFx0ZGV0YWlsOiB2ZXRvUmVhc29uc0FycmF5Lmxlbmd0aCA9PT0gMSA/XG5cdFx0XHRcdFx0XHR2ZXRvUmVhc29uc0FycmF5WzBdIDpcblx0XHRcdFx0XHRcdHZldG9SZWFzb25zQXJyYXkuam9pbignXFxuIC0nKSxcblx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBubHMubG9jYWxpemUoJ3Byb2NlZWRBbnl3YXlzJywgXCJSZXN0YXJ0IEFueXdheVwiKVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH1cblxuXHRcdHJldHVybiAhdmV0bztcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0RXh0ZW5zaW9uSG9zdHNJZk5lY2Vzc2FyeShpc0luaXRpYWxTdGFydDogYm9vbGVhbiwgaW5pdGlhbEFjdGl2YXRpb25FdmVudHM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9jYXRpb25zOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGFmZmluaXR5ID0gMDsgYWZmaW5pdHkgPD0gdGhpcy5fcnVubmluZ0xvY2F0aW9ucy5tYXhMb2NhbFByb2Nlc3NBZmZpbml0eTsgYWZmaW5pdHkrKykge1xuXHRcdFx0bG9jYXRpb25zLnB1c2gobmV3IExvY2FsUHJvY2Vzc1J1bm5pbmdMb2NhdGlvbihhZmZpbml0eSkpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBhZmZpbml0eSA9IDA7IGFmZmluaXR5IDw9IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMubWF4TG9jYWxXZWJXb3JrZXJBZmZpbml0eTsgYWZmaW5pdHkrKykge1xuXHRcdFx0bG9jYXRpb25zLnB1c2gobmV3IExvY2FsV2ViV29ya2VyUnVubmluZ0xvY2F0aW9uKGFmZmluaXR5KSk7XG5cdFx0fVxuXHRcdGxvY2F0aW9ucy5wdXNoKG5ldyBSZW1vdGVSdW5uaW5nTG9jYXRpb24oKSk7XG5cdFx0Zm9yIChjb25zdCBsb2NhdGlvbiBvZiBsb2NhdGlvbnMpIHtcblx0XHRcdGlmICh0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMuZ2V0QnlSdW5uaW5nTG9jYXRpb24obG9jYXRpb24pKSB7XG5cdFx0XHRcdC8vIGFscmVhZHkgcnVubmluZ1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcyA9IHRoaXMuX2NyZWF0ZUV4dGVuc2lvbkhvc3RNYW5hZ2VyKGxvY2F0aW9uLCBpc0luaXRpYWxTdGFydCwgaW5pdGlhbEFjdGl2YXRpb25FdmVudHMpO1xuXHRcdFx0aWYgKHJlcykge1xuXHRcdFx0XHRjb25zdCBbZXh0SG9zdE1hbmFnZXIsIGRpc3Bvc2FibGVTdG9yZV0gPSByZXM7XG5cdFx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5hZGQoZXh0SG9zdE1hbmFnZXIsIGRpc3Bvc2FibGVTdG9yZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRXh0ZW5zaW9uSG9zdE1hbmFnZXIocnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24sIGlzSW5pdGlhbFN0YXJ0OiBib29sZWFuLCBpbml0aWFsQWN0aXZhdGlvbkV2ZW50czogc3RyaW5nW10pOiBudWxsIHwgW0lFeHRlbnNpb25Ib3N0TWFuYWdlciwgRGlzcG9zYWJsZVN0b3JlXSB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSG9zdCA9IHRoaXMuX2V4dGVuc2lvbkhvc3RGYWN0b3J5LmNyZWF0ZUV4dGVuc2lvbkhvc3QodGhpcy5fcnVubmluZ0xvY2F0aW9ucywgcnVubmluZ0xvY2F0aW9uLCBpc0luaXRpYWxTdGFydCk7XG5cdFx0aWYgKCFleHRlbnNpb25Ib3N0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9jZXNzTWFuYWdlcjogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyID0gdGhpcy5fZG9DcmVhdGVFeHRlbnNpb25Ib3N0TWFuYWdlcihleHRlbnNpb25Ib3N0LCBpbml0aWFsQWN0aXZhdGlvbkV2ZW50cyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQocHJvY2Vzc01hbmFnZXIub25EaWRFeGl0KChbY29kZSwgc2lnbmFsXSkgPT4gdGhpcy5fb25FeHRlbnNpb25Ib3N0Q3Jhc2hPckV4aXQocHJvY2Vzc01hbmFnZXIsIGNvZGUsIHNpZ25hbCkpKTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHByb2Nlc3NNYW5hZ2VyLm9uRGlkQ2hhbmdlUmVzcG9uc2l2ZVN0YXRlKChyZXNwb25zaXZlU3RhdGUpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgRXh0ZW5zaW9uIGhvc3QgKCR7cHJvY2Vzc01hbmFnZXIuZnJpZW5keU5hbWV9KSBpcyAke3Jlc3BvbnNpdmVTdGF0ZSA9PT0gUmVzcG9uc2l2ZVN0YXRlLlJlc3BvbnNpdmUgPyAncmVzcG9uc2l2ZScgOiAndW5yZXNwb25zaXZlJ30uYCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJlc3BvbnNpdmVDaGFuZ2UuZmlyZSh7XG5cdFx0XHRcdGV4dGVuc2lvbkhvc3RLaW5kOiBwcm9jZXNzTWFuYWdlci5raW5kLFxuXHRcdFx0XHRpc1Jlc3BvbnNpdmU6IHJlc3BvbnNpdmVTdGF0ZSA9PT0gUmVzcG9uc2l2ZVN0YXRlLlJlc3BvbnNpdmUsXG5cdFx0XHRcdGdldEluc3BlY3RMaXN0ZW5lcjogKHRyeUVuYWJsZUluc3BlY3RvcjogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBwcm9jZXNzTWFuYWdlci5nZXRJbnNwZWN0UG9ydCh0cnlFbmFibGVJbnNwZWN0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIFtwcm9jZXNzTWFuYWdlciwgZGlzcG9zYWJsZVN0b3JlXTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZG9DcmVhdGVFeHRlbnNpb25Ib3N0TWFuYWdlcihleHRlbnNpb25Ib3N0OiBJRXh0ZW5zaW9uSG9zdCwgaW5pdGlhbEFjdGl2YXRpb25FdmVudHM6IHN0cmluZ1tdKTogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyIHtcblx0XHRjb25zdCBpbnRlcm5hbEV4dGVuc2lvblNlcnZpY2UgPSB0aGlzLl9hY3F1aXJlSW50ZXJuYWxBUEkoZXh0ZW5zaW9uSG9zdCk7XG5cdFx0aWYgKGV4dGVuc2lvbkhvc3Quc3RhcnR1cCA9PT0gRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuTGF6eUF1dG9TdGFydCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhenlDcmVhdGVFeHRlbnNpb25Ib3N0TWFuYWdlciwgZXh0ZW5zaW9uSG9zdCwgaW5pdGlhbEFjdGl2YXRpb25FdmVudHMsIGludGVybmFsRXh0ZW5zaW9uU2VydmljZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25Ib3N0TWFuYWdlciwgZXh0ZW5zaW9uSG9zdCwgaW5pdGlhbEFjdGl2YXRpb25FdmVudHMsIGludGVybmFsRXh0ZW5zaW9uU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkV4dGVuc2lvbkhvc3RDcmFzaE9yRXhpdChleHRlbnNpb25Ib3N0OiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIsIGNvZGU6IG51bWJlciwgc2lnbmFsOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG5cblx0XHQvLyBVbmV4cGVjdGVkIHRlcm1pbmF0aW9uXG5cdFx0Y29uc3QgaXNFeHRlbnNpb25EZXZIb3N0ID0gcGFyc2VFeHRlbnNpb25EZXZPcHRpb25zKHRoaXMuX2Vudmlyb25tZW50U2VydmljZSkuaXNFeHRlbnNpb25EZXZIb3N0O1xuXHRcdGlmICghaXNFeHRlbnNpb25EZXZIb3N0KSB7XG5cdFx0XHR0aGlzLl9vbkV4dGVuc2lvbkhvc3RDcmFzaGVkKGV4dGVuc2lvbkhvc3QsIGNvZGUsIHNpZ25hbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25FeHRlbnNpb25Ib3N0RXhpdChjb2RlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfb25FeHRlbnNpb25Ib3N0Q3Jhc2hlZChleHRlbnNpb25Ib3N0OiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIsIGNvZGU6IG51bWJlciwgc2lnbmFsOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc29sZS5lcnJvcihgRXh0ZW5zaW9uIGhvc3QgKCR7ZXh0ZW5zaW9uSG9zdC5mcmllbmR5TmFtZX0pIHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5LiBDb2RlOiAke2NvZGV9LCBTaWduYWw6ICR7c2lnbmFsfWApO1xuXHRcdGlmIChleHRlbnNpb25Ib3N0LmtpbmQgPT09IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcykge1xuXHRcdFx0dGhpcy5fZG9TdG9wRXh0ZW5zaW9uSG9zdHMoKTtcblx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbkhvc3Qua2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlKSB7XG5cdFx0XHRpZiAoc2lnbmFsKSB7XG5cdFx0XHRcdHRoaXMuX29uUmVtb3RlRXh0ZW5zaW9uSG9zdENyYXNoZWQoZXh0ZW5zaW9uSG9zdCwgc2lnbmFsKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5zdG9wT25lKGV4dGVuc2lvbkhvc3QpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldEV4dGVuc2lvbkhvc3RFeGl0SW5mb1dpdGhUaW1lb3V0KHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElFeHRlbnNpb25Ib3N0RXhpdEluZm8gfCBudWxsPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignZ2V0RXh0ZW5zaW9uSG9zdEV4aXRJbmZvIHRpbWVkIG91dCcpKTtcblx0XHRcdH0sIDIwMDApO1xuXHRcdFx0dGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEV4dGVuc2lvbkhvc3RFeGl0SW5mbyhyZWNvbm5lY3Rpb25Ub2tlbikudGhlbihcblx0XHRcdFx0KHIpID0+IHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG5cdFx0XHRcdFx0cmVzb2x2ZShyKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVqZWN0XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb25SZW1vdGVFeHRlbnNpb25Ib3N0Q3Jhc2hlZChleHRlbnNpb25Ib3N0OiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIsIHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHRoaXMuX2dldEV4dGVuc2lvbkhvc3RFeGl0SW5mb1dpdGhUaW1lb3V0KHJlY29ubmVjdGlvblRva2VuKTtcblx0XHRcdGlmIChpbmZvKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEV4dGVuc2lvbiBob3N0ICgke2V4dGVuc2lvbkhvc3QuZnJpZW5keU5hbWV9KSB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseSB3aXRoIGNvZGUgJHtpbmZvLmNvZGV9LmApO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dFeHRlbnNpb25Ib3N0Q3Jhc2goZXh0ZW5zaW9uSG9zdCk7XG5cdFx0XHR0aGlzLl9yZW1vdGVDcmFzaFRyYWNrZXIucmVnaXN0ZXJDcmFzaCgpO1xuXG5cdFx0XHRpZiAodGhpcy5fcmVtb3RlQ3Jhc2hUcmFja2VyLnNob3VsZEF1dG9tYXRpY2FsbHlSZXN0YXJ0KCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBBdXRvbWF0aWNhbGx5IHJlc3RhcnRpbmcgdGhlIHJlbW90ZSBleHRlbnNpb24gaG9zdC5gKTtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5zdGF0dXMobmxzLmxvY2FsaXplKCdleHRlbnNpb25TZXJ2aWNlLmF1dG9SZXN0YXJ0JywgXCJUaGUgcmVtb3RlIGV4dGVuc2lvbiBob3N0IHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5LiBSZXN0YXJ0aW5nLi4uXCIpLCB7IGhpZGVBZnRlcjogNTAwMCB9KTtcblx0XHRcdFx0dGhpcy5fc3RhcnRFeHRlbnNpb25Ib3N0c0lmTmVjZXNzYXJ5KGZhbHNlLCBBcnJheS5mcm9tKHRoaXMuX2FsbFJlcXVlc3RlZEFjdGl2YXRlRXZlbnRzLmtleXMoKSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uU2VydmljZS5jcmFzaCcsIFwiUmVtb3RlIEV4dGVuc2lvbiBob3N0IHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5IDMgdGltZXMgd2l0aGluIHRoZSBsYXN0IDUgbWludXRlcy5cIiksXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3Jlc3RhcnQnLCBcIlJlc3RhcnQgUmVtb3RlIEV4dGVuc2lvbiBIb3N0XCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0YXJ0RXh0ZW5zaW9uSG9zdHNJZk5lY2Vzc2FyeShmYWxzZSwgQXJyYXkuZnJvbSh0aGlzLl9hbGxSZXF1ZXN0ZWRBY3RpdmF0ZUV2ZW50cy5rZXlzKCkpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gbWF5YmUgdGhpcyB3YXNuJ3QgYW4gZXh0ZW5zaW9uIGhvc3QgY3Jhc2ggYW5kIGl0IHdhcyBhIHBlcm1hbmVudCBkaXNjb25uZWN0aW9uXG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9sb2dFeHRlbnNpb25Ib3N0Q3Jhc2goZXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyKTogdm9pZCB7XG5cblx0XHRjb25zdCBhY3RpdmF0ZWRFeHRlbnNpb25zOiBFeHRlbnNpb25JZGVudGlmaWVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvblN0YXR1cyBvZiB0aGlzLl9leHRlbnNpb25TdGF0dXMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChleHRlbnNpb25TdGF0dXMuYWN0aXZhdGlvblN0YXJ0ZWQgJiYgZXh0ZW5zaW9uSG9zdC5jb250YWluc0V4dGVuc2lvbihleHRlbnNpb25TdGF0dXMuaWQpKSB7XG5cdFx0XHRcdGFjdGl2YXRlZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb25TdGF0dXMuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhY3RpdmF0ZWRFeHRlbnNpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEV4dGVuc2lvbiBob3N0ICgke2V4dGVuc2lvbkhvc3QuZnJpZW5keU5hbWV9KSB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseS4gVGhlIGZvbGxvd2luZyBleHRlbnNpb25zIHdlcmUgcnVubmluZzogJHthY3RpdmF0ZWRFeHRlbnNpb25zLm1hcChpZCA9PiBpZC52YWx1ZSkuam9pbignLCAnKX1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRXh0ZW5zaW9uIGhvc3QgKCR7ZXh0ZW5zaW9uSG9zdC5mcmllbmR5TmFtZX0pIHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5LiBObyBleHRlbnNpb25zIHdlcmUgYWN0aXZhdGVkLmApO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzdGFydEV4dGVuc2lvbkhvc3RzKHVwZGF0ZXM/OiB7IHRvQWRkOiBJRXh0ZW5zaW9uW107IHRvUmVtb3ZlOiBzdHJpbmdbXSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZG9TdG9wRXh0ZW5zaW9uSG9zdHMoKTtcblxuXHRcdGlmICh1cGRhdGVzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9oYW5kbGVEZWx0YUV4dGVuc2lvbnMobmV3IERlbHRhRXh0ZW5zaW9uc1F1ZXVlSXRlbSh1cGRhdGVzLnRvQWRkLCB1cGRhdGVzLnRvUmVtb3ZlKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jayA9IGF3YWl0IHRoaXMuX3JlZ2lzdHJ5LmFjcXVpcmVMb2NrKCdzdGFydEV4dGVuc2lvbkhvc3RzJyk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3N0YXJ0RXh0ZW5zaW9uSG9zdHNJZk5lY2Vzc2FyeShmYWxzZSwgQXJyYXkuZnJvbSh0aGlzLl9hbGxSZXF1ZXN0ZWRBY3RpdmF0ZUV2ZW50cy5rZXlzKCkpKTtcblx0XHRcdHRoaXMuX3N0YXJ0T25EZW1hbmRFeHRlbnNpb25Ib3N0cygpO1xuXG5cdFx0XHRjb25zdCBsb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0cyA9IHRoaXMuX2dldEV4dGVuc2lvbkhvc3RNYW5hZ2VycyhFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3MpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwobG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdHMubWFwKGV4dEhvc3QgPT4gZXh0SG9zdC5yZWFkeSgpKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxvY2suZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0T25EZW1hbmRFeHRlbnNpb25Ib3N0cygpOiB2b2lkIHtcblx0XHRjb25zdCBzbmFwc2hvdCA9IHRoaXMuX3JlZ2lzdHJ5LmdldFNuYXBzaG90KCk7XG5cdFx0Zm9yIChjb25zdCBleHRIb3N0TWFuYWdlciBvZiB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMpIHtcblx0XHRcdGlmIChleHRIb3N0TWFuYWdlci5zdGFydHVwICE9PSBFeHRlbnNpb25Ib3N0U3RhcnR1cC5FYWdlckF1dG9TdGFydCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gdGhpcy5fcnVubmluZ0xvY2F0aW9ucy5maWx0ZXJCeUV4dGVuc2lvbkhvc3RNYW5hZ2VyKHNuYXBzaG90LmV4dGVuc2lvbnMsIGV4dEhvc3RNYW5hZ2VyKTtcblx0XHRcdFx0ZXh0SG9zdE1hbmFnZXIuc3RhcnQoc25hcHNob3QudmVyc2lvbklkLCBzbmFwc2hvdC5leHRlbnNpb25zLCBleHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gSUV4dGVuc2lvblNlcnZpY2VcblxuXHRwdWJsaWMgYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudDogc3RyaW5nLCBhY3RpdmF0aW9uS2luZDogQWN0aXZhdGlvbktpbmQgPSBBY3RpdmF0aW9uS2luZC5Ob3JtYWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faW5zdGFsbGVkRXh0ZW5zaW9uc1JlYWR5LmlzT3BlbigpKSB7XG5cdFx0XHQvLyBFeHRlbnNpb25zIGhhdmUgYmVlbiBzY2FubmVkIGFuZCBpbnRlcnByZXRlZFxuXG5cdFx0XHQvLyBSZWNvcmQgdGhlIGZhY3QgdGhhdCB0aGlzIGFjdGl2YXRpb25FdmVudCB3YXMgcmVxdWVzdGVkIChpbiBjYXNlIG9mIGEgcmVzdGFydClcblx0XHRcdHRoaXMuX2FsbFJlcXVlc3RlZEFjdGl2YXRlRXZlbnRzLmFkZChhY3RpdmF0aW9uRXZlbnQpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX3JlZ2lzdHJ5LmNvbnRhaW5zQWN0aXZhdGlvbkV2ZW50KGFjdGl2YXRpb25FdmVudCkpIHtcblx0XHRcdFx0Ly8gVGhlcmUgaXMgbm8gZXh0ZW5zaW9uIHRoYXQgaXMgaW50ZXJlc3RlZCBpbiB0aGlzIGFjdGl2YXRpb24gZXZlbnRcblx0XHRcdFx0cmV0dXJuIE5PX09QX1ZPSURfUFJPTUlTRTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQsIGFjdGl2YXRpb25LaW5kKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRXh0ZW5zaW9ucyBoYXZlIG5vdCBiZWVuIHNjYW5uZWQgeWV0LlxuXG5cdFx0XHQvLyBSZWNvcmQgdGhlIGZhY3QgdGhhdCB0aGlzIGFjdGl2YXRpb25FdmVudCB3YXMgcmVxdWVzdGVkIChpbiBjYXNlIG9mIGEgcmVzdGFydClcblx0XHRcdHRoaXMuX2FsbFJlcXVlc3RlZEFjdGl2YXRlRXZlbnRzLmFkZChhY3RpdmF0aW9uRXZlbnQpO1xuXG5cdFx0XHRpZiAoYWN0aXZhdGlvbktpbmQgPT09IEFjdGl2YXRpb25LaW5kLkltbWVkaWF0ZSkge1xuXHRcdFx0XHQvLyBEbyBub3Qgd2FpdCBmb3IgdGhlIG5vcm1hbCBzdGFydC11cCBvZiB0aGUgZXh0ZW5zaW9uIGhvc3QocylcblxuXHRcdFx0XHQvLyBOb3RlOiBzb21lIGNhbGxlcnMgY29tZSBpbiBzbyBlYXJseSB0aGF0IHRoZSBleHRlbnNpb24gaG9zdHMgaGF2ZSBub3QgZXZlbiBiZWVuIGNyZWF0ZWQgeWV0LlxuXHRcdFx0XHQvLyBUaGVyZWZvcmUgd2Uga2ljayBvZmYgdGhlIGV4dGVuc2lvbiBob3N0IGNyZWF0aW9uLCBidXQgd2l0aG91dCBhd2FpdGluZyBpdC5cblx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNjAwNjFcblx0XHRcdFx0dm9pZCB0aGlzLl9pbml0aWFsaXplSWZOZWVkZWQoKTtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudCwgYWN0aXZhdGlvbktpbmQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFsbGVkRXh0ZW5zaW9uc1JlYWR5LndhaXQoKS50aGVuKCgpID0+IHRoaXMuX2FjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQsIGFjdGl2YXRpb25LaW5kKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudDogc3RyaW5nLCBhY3RpdmF0aW9uS2luZDogQWN0aXZhdGlvbktpbmQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgbWFuYWdlcnM6IElFeHRlbnNpb25Ib3N0TWFuYWdlcltdO1xuXHRcdGlmIChhY3RpdmF0aW9uS2luZCA9PT0gQWN0aXZhdGlvbktpbmQuSW1tZWRpYXRlKSB7XG5cdFx0XHQvLyBGb3IgaW1tZWRpYXRlIGFjdGl2YXRpb24sIG9ubHkgYWN0aXZhdGUgb24gbG9jYWwgZXh0ZW5zaW9uIGhvc3RzXG5cdFx0XHQvLyBhbmQgb24gcmVtb3RlIGV4dGVuc2lvbiBob3N0cyB0aGF0IGFyZSBhbHJlYWR5IHJlYWR5LlxuXHRcdFx0Ly8gRGVmZXIgYWN0aXZhdGlvbiBmb3IgcmVtb3RlIGhvc3RzIHRoYXQgYXJlIG5vdCB5ZXQgcmVhZHkgdG8gYXZvaWRcblx0XHRcdC8vIGJsb2NraW5nIChlLmcuIGR1cmluZyByZW1vdGUgYXV0aG9yaXR5IHJlc29sdXRpb24pLlxuXHRcdFx0bWFuYWdlcnMgPSB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMuZmlsdGVyKFxuXHRcdFx0XHRleHRIb3N0TWFuYWdlciA9PiBleHRIb3N0TWFuYWdlci5raW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3Ncblx0XHRcdFx0XHR8fCBleHRIb3N0TWFuYWdlci5raW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlclxuXHRcdFx0XHRcdHx8IGV4dEhvc3RNYW5hZ2VyLmlzUmVhZHlcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVtb3RlQWN0aXZhdGlvbkV2ZW50cy5hZGQoYWN0aXZhdGlvbkV2ZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWFuYWdlcnMgPSBbLi4udGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBQcm9taXNlLmFsbChcblx0XHRcdG1hbmFnZXJzLm1hcChleHRIb3N0TWFuYWdlciA9PiBleHRIb3N0TWFuYWdlci5hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50LCBhY3RpdmF0aW9uS2luZCkpXG5cdFx0KS50aGVuKCgpID0+IHsgfSk7XG5cdFx0dGhpcy5fb25XaWxsQWN0aXZhdGVCeUV2ZW50LmZpcmUoe1xuXHRcdFx0ZXZlbnQ6IGFjdGl2YXRpb25FdmVudCxcblx0XHRcdGFjdGl2YXRpb246IHJlc3VsdCxcblx0XHRcdGFjdGl2YXRpb25LaW5kXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhY3RpdmF0ZUJ5SWQoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmF0ZUJ5SWQoZXh0ZW5zaW9uSWQsIHJlYXNvbik7XG5cdH1cblxuXHRwdWJsaWMgYWN0aXZhdGlvbkV2ZW50SXNEb25lKGFjdGl2YXRpb25FdmVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9pbnN0YWxsZWRFeHRlbnNpb25zUmVhZHkuaXNPcGVuKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9yZWdpc3RyeS5jb250YWluc0FjdGl2YXRpb25FdmVudChhY3RpdmF0aW9uRXZlbnQpKSB7XG5cdFx0XHQvLyBUaGVyZSBpcyBubyBleHRlbnNpb24gdGhhdCBpcyBpbnRlcmVzdGVkIGluIHRoaXMgYWN0aXZhdGlvbiBldmVudFxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMuZXZlcnkobWFuYWdlciA9PiBtYW5hZ2VyLmFjdGl2YXRpb25FdmVudElzRG9uZShhY3RpdmF0aW9uRXZlbnQpKTtcblx0fVxuXG5cdHB1YmxpYyB3aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbGxlZEV4dGVuc2lvbnNSZWFkeS53YWl0KCk7XG5cdH1cblxuXHRnZXQgZXh0ZW5zaW9ucygpOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRFeHRlbnNpb25SZWdpc3RyeVNuYXBzaG90V2hlblJlYWR5KCk6IFByb21pc2U8RXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeVNuYXBzaG90PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbGxlZEV4dGVuc2lvbnNSZWFkeS53YWl0KCkudGhlbigoKSA9PiB0aGlzLl9yZWdpc3RyeS5nZXRTbmFwc2hvdCgpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFeHRlbnNpb24oaWQ6IHN0cmluZyk6IFByb21pc2U8SUV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbGxlZEV4dGVuc2lvbnNSZWFkeS53YWl0KCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0cnkuZ2V0RXh0ZW5zaW9uRGVzY3JpcHRpb24oaWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJlYWRFeHRlbnNpb25Qb2ludENvbnRyaWJ1dGlvbnM8VCBleHRlbmRzIElFeHRlbnNpb25Db250cmlidXRpb25zW2tleW9mIElFeHRlbnNpb25Db250cmlidXRpb25zXT4oZXh0UG9pbnQ6IElFeHRlbnNpb25Qb2ludDxUPik6IFByb21pc2U8RXh0ZW5zaW9uUG9pbnRDb250cmlidXRpb248VD5bXT4ge1xuXHRcdHJldHVybiB0aGlzLl9pbnN0YWxsZWRFeHRlbnNpb25zUmVhZHkud2FpdCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXZhaWxhYmxlRXh0ZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IEV4dGVuc2lvblBvaW50Q29udHJpYnV0aW9uPFQ+W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZGVzYyBvZiBhdmFpbGFibGVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmIChkZXNjLmNvbnRyaWJ1dGVzICYmIGhhc093blByb3BlcnR5LmNhbGwoZGVzYy5jb250cmlidXRlcywgZXh0UG9pbnQubmFtZSkpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChuZXcgRXh0ZW5zaW9uUG9pbnRDb250cmlidXRpb248VD4oZGVzYywgZGVzYy5jb250cmlidXRlc1tleHRQb2ludC5uYW1lIGFzIGtleW9mIHR5cGVvZiBkZXNjLmNvbnRyaWJ1dGVzXSBhcyBUKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFeHRlbnNpb25zU3RhdHVzKCk6IHsgW2lkOiBzdHJpbmddOiBJRXh0ZW5zaW9uc1N0YXR1cyB9IHtcblx0XHRjb25zdCByZXN1bHQ6IHsgW2lkOiBzdHJpbmddOiBJRXh0ZW5zaW9uc1N0YXR1cyB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRpZiAodGhpcy5fcmVnaXN0cnkpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzID0gdGhpcy5fZXh0ZW5zaW9uU3RhdHVzLmdldChleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdHJlc3VsdFtleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZV0gPSB7XG5cdFx0XHRcdFx0aWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdG1lc3NhZ2VzOiBleHRlbnNpb25TdGF0dXM/Lm1lc3NhZ2VzID8/IFtdLFxuXHRcdFx0XHRcdGFjdGl2YXRpb25TdGFydGVkOiBleHRlbnNpb25TdGF0dXM/LmFjdGl2YXRpb25TdGFydGVkID8/IGZhbHNlLFxuXHRcdFx0XHRcdGFjdGl2YXRpb25UaW1lczogZXh0ZW5zaW9uU3RhdHVzPy5hY3RpdmF0aW9uVGltZXMgPz8gdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJ1bnRpbWVFcnJvcnM6IGV4dGVuc2lvblN0YXR1cz8ucnVudGltZUVycm9ycyA/PyBbXSxcblx0XHRcdFx0XHRydW5uaW5nTG9jYXRpb246IHRoaXMuX3J1bm5pbmdMb2NhdGlvbnMuZ2V0UnVubmluZ0xvY2F0aW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyKSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRJbnNwZWN0UG9ydHMoZXh0ZW5zaW9uSG9zdEtpbmQ6IEV4dGVuc2lvbkhvc3RLaW5kLCB0cnlFbmFibGVJbnNwZWN0b3I6IGJvb2xlYW4pOiBQcm9taXNlPElFeHRlbnNpb25JbnNwZWN0SW5mb1tdPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGwoXG5cdFx0XHR0aGlzLl9nZXRFeHRlbnNpb25Ib3N0TWFuYWdlcnMoZXh0ZW5zaW9uSG9zdEtpbmQpLm1hcChhc3luYyBleHRIb3N0ID0+IHtcblx0XHRcdFx0bGV0IHBvcnRJbmZvID0gYXdhaXQgZXh0SG9zdC5nZXRJbnNwZWN0UG9ydCh0cnlFbmFibGVJbnNwZWN0b3IpO1xuXHRcdFx0XHRpZiAocG9ydEluZm8gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHBvcnRJbmZvID0geyAuLi5wb3J0SW5mbywgZGV2dG9vbHNMYWJlbDogZXh0SG9zdC5mcmllbmR5TmFtZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwb3J0SW5mbztcblx0XHRcdH0pXG5cdFx0KTtcblx0XHQvLyByZW1vdmUgMHM6XG5cdFx0cmV0dXJuIHJlc3VsdC5maWx0ZXIoaXNEZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZXRSZW1vdGVFbnZpcm9ubWVudChlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgbnVsbCB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzXG5cdFx0XHQubWFwKG1hbmFnZXIgPT4gbWFuYWdlci5zZXRSZW1vdGVFbnZpcm9ubWVudChlbnYpKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vIC0tLSBpbXBsXG5cblx0cHJpdmF0ZSBfc2FmZUludm9rZUlzRW5hYmxlZChleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChleHRlbnNpb24pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RvSGFuZGxlRXh0ZW5zaW9uUG9pbnRzKGFmZmVjdGVkRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIG9ubHlSZXNvbHZlckV4dGVuc2lvblBvaW50czogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGFmZmVjdGVkRXh0ZW5zaW9uUG9pbnRzOiB7IFtleHRQb2ludE5hbWU6IHN0cmluZ106IGJvb2xlYW4gfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25EZXNjcmlwdGlvbiBvZiBhZmZlY3RlZEV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChleHRlbnNpb25EZXNjcmlwdGlvbi5jb250cmlidXRlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dFBvaW50TmFtZSBpbiBleHRlbnNpb25EZXNjcmlwdGlvbi5jb250cmlidXRlcykge1xuXHRcdFx0XHRcdGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKGV4dGVuc2lvbkRlc2NyaXB0aW9uLmNvbnRyaWJ1dGVzLCBleHRQb2ludE5hbWUpKSB7XG5cdFx0XHRcdFx0XHRhZmZlY3RlZEV4dGVuc2lvblBvaW50c1tleHRQb2ludE5hbWVdID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtZXNzYWdlSGFuZGxlciA9IChtc2c6IElNZXNzYWdlKSA9PiB0aGlzLl9oYW5kbGVFeHRlbnNpb25Qb2ludE1lc3NhZ2UobXNnKTtcblx0XHRjb25zdCBhdmFpbGFibGVFeHRlbnNpb25zID0gdGhpcy5fcmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uUG9pbnRzID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEV4dGVuc2lvblBvaW50cygpO1xuXHRcdHBlcmYubWFyayhvbmx5UmVzb2x2ZXJFeHRlbnNpb25Qb2ludHMgPyAnY29kZS93aWxsSGFuZGxlUmVzb2x2ZXJFeHRlbnNpb25Qb2ludHMnIDogJ2NvZGUvd2lsbEhhbmRsZUV4dGVuc2lvblBvaW50cycpO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uUG9pbnQgb2YgZXh0ZW5zaW9uUG9pbnRzKSB7XG5cdFx0XHRpZiAoYWZmZWN0ZWRFeHRlbnNpb25Qb2ludHNbZXh0ZW5zaW9uUG9pbnQubmFtZV0gJiYgKCFvbmx5UmVzb2x2ZXJFeHRlbnNpb25Qb2ludHMgfHwgZXh0ZW5zaW9uUG9pbnQuY2FuSGFuZGxlUmVzb2x2ZXIpKSB7XG5cdFx0XHRcdHBlcmYubWFyayhgY29kZS93aWxsSGFuZGxlRXh0ZW5zaW9uUG9pbnQvJHtleHRlbnNpb25Qb2ludC5uYW1lfWApO1xuXHRcdFx0XHRBYnN0cmFjdEV4dGVuc2lvblNlcnZpY2UuX2hhbmRsZUV4dGVuc2lvblBvaW50KGV4dGVuc2lvblBvaW50LCBhdmFpbGFibGVFeHRlbnNpb25zLCBtZXNzYWdlSGFuZGxlcik7XG5cdFx0XHRcdHBlcmYubWFyayhgY29kZS9kaWRIYW5kbGVFeHRlbnNpb25Qb2ludC8ke2V4dGVuc2lvblBvaW50Lm5hbWV9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHBlcmYubWFyayhvbmx5UmVzb2x2ZXJFeHRlbnNpb25Qb2ludHMgPyAnY29kZS9kaWRIYW5kbGVSZXNvbHZlckV4dGVuc2lvblBvaW50cycgOiAnY29kZS9kaWRIYW5kbGVFeHRlbnNpb25Qb2ludHMnKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlRXh0ZW5zaW9uU3RhdHVzKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogRXh0ZW5zaW9uU3RhdHVzIHtcblx0XHRpZiAoIXRoaXMuX2V4dGVuc2lvblN0YXR1cy5oYXMoZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25TdGF0dXMuc2V0KGV4dGVuc2lvbklkLCBuZXcgRXh0ZW5zaW9uU3RhdHVzKGV4dGVuc2lvbklkKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25TdGF0dXMuZ2V0KGV4dGVuc2lvbklkKSE7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVFeHRlbnNpb25Qb2ludE1lc3NhZ2UobXNnOiBJTWVzc2FnZSkge1xuXHRcdGNvbnN0IGV4dGVuc2lvblN0YXR1cyA9IHRoaXMuX2dldE9yQ3JlYXRlRXh0ZW5zaW9uU3RhdHVzKG1zZy5leHRlbnNpb25JZCk7XG5cdFx0ZXh0ZW5zaW9uU3RhdHVzLmFkZE1lc3NhZ2UobXNnKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuX3JlZ2lzdHJ5LmdldEV4dGVuc2lvbkRlc2NyaXB0aW9uKG1zZy5leHRlbnNpb25JZCk7XG5cdFx0Y29uc3Qgc3RyTXNnID0gYFske21zZy5leHRlbnNpb25JZC52YWx1ZX1dOiAke21zZy5tZXNzYWdlfWA7XG5cblx0XHRpZiAobXNnLnR5cGUgPT09IFNldmVyaXR5LkVycm9yKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uICYmIGV4dGVuc2lvbi5pc1VuZGVyRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0Ly8gVGhpcyBtZXNzYWdlIGlzIGFib3V0IHRoZSBleHRlbnNpb24gY3VycmVudGx5IGJlaW5nIGRldmVsb3BlZFxuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7IHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogc3RyTXNnIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihzdHJNc2cpO1xuXHRcdH0gZWxzZSBpZiAobXNnLnR5cGUgPT09IFNldmVyaXR5Lldhcm5pbmcpIHtcblx0XHRcdGlmIChleHRlbnNpb24gJiYgZXh0ZW5zaW9uLmlzVW5kZXJEZXZlbG9wbWVudCkge1xuXHRcdFx0XHQvLyBUaGlzIG1lc3NhZ2UgaXMgYWJvdXQgdGhlIGV4dGVuc2lvbiBjdXJyZW50bHkgYmVpbmcgZGV2ZWxvcGVkXG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHsgc2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsIG1lc3NhZ2U6IHN0ck1zZyB9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihzdHJNc2cpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oc3RyTXNnKTtcblx0XHR9XG5cblx0XHRpZiAobXNnLmV4dGVuc2lvbklkICYmIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0ICYmICF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCkge1xuXHRcdFx0Y29uc3QgeyB0eXBlLCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uUG9pbnRJZCwgbWVzc2FnZSB9ID0gbXNnO1xuXHRcdFx0dHlwZSBFeHRlbnNpb25zTWVzc2FnZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ2FsZXhkaW1hJztcblx0XHRcdFx0Y29tbWVudDogJ0EgdmFsaWRhdGlvbiBtZXNzYWdlIGZvciBhbiBleHRlbnNpb24nO1xuXHRcdFx0XHR0eXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnU2V2ZXJpdHkgb2YgcHJvYmxlbS4nIH07XG5cdFx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGV4dGVuc2lvbiB0aGF0IGhhcyBhIHByb2JsZW0uJyB9O1xuXHRcdFx0XHRleHRlbnNpb25Qb2ludElkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGV4dGVuc2lvbiBwb2ludCB0aGF0IGhhcyBhIHByb2JsZW0uJyB9O1xuXHRcdFx0XHRtZXNzYWdlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIG1lc3NhZ2Ugb2YgdGhlIHByb2JsZW0uJyB9O1xuXHRcdFx0fTtcblx0XHRcdHR5cGUgRXh0ZW5zaW9uc01lc3NhZ2VFdmVudCA9IHtcblx0XHRcdFx0dHlwZTogU2V2ZXJpdHk7XG5cdFx0XHRcdGV4dGVuc2lvbklkOiBzdHJpbmc7XG5cdFx0XHRcdGV4dGVuc2lvblBvaW50SWQ6IHN0cmluZztcblx0XHRcdFx0bWVzc2FnZTogc3RyaW5nO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFeHRlbnNpb25zTWVzc2FnZUV2ZW50LCBFeHRlbnNpb25zTWVzc2FnZUNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uc01lc3NhZ2UnLCB7XG5cdFx0XHRcdHR5cGUsIGV4dGVuc2lvbklkOiBleHRlbnNpb25JZC52YWx1ZSwgZXh0ZW5zaW9uUG9pbnRJZCwgbWVzc2FnZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hhbmRsZUV4dGVuc2lvblBvaW50PFQgZXh0ZW5kcyBJRXh0ZW5zaW9uQ29udHJpYnV0aW9uc1trZXlvZiBJRXh0ZW5zaW9uQ29udHJpYnV0aW9uc10+KGV4dGVuc2lvblBvaW50OiBFeHRlbnNpb25Qb2ludDxUPiwgYXZhaWxhYmxlRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIG1lc3NhZ2VIYW5kbGVyOiAobXNnOiBJTWVzc2FnZSkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHVzZXJzOiBJRXh0ZW5zaW9uUG9pbnRVc2VyPFQ+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGRlc2Mgb2YgYXZhaWxhYmxlRXh0ZW5zaW9ucykge1xuXHRcdFx0aWYgKGRlc2MuY29udHJpYnV0ZXMgJiYgaGFzT3duUHJvcGVydHkuY2FsbChkZXNjLmNvbnRyaWJ1dGVzLCBleHRlbnNpb25Qb2ludC5uYW1lKSkge1xuXHRcdFx0XHR1c2Vycy5wdXNoKHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZGVzYyxcblx0XHRcdFx0XHR2YWx1ZTogZGVzYy5jb250cmlidXRlc1tleHRlbnNpb25Qb2ludC5uYW1lIGFzIGtleW9mIHR5cGVvZiBkZXNjLmNvbnRyaWJ1dGVzXSBhcyBULFxuXHRcdFx0XHRcdGNvbGxlY3RvcjogbmV3IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IobWVzc2FnZUhhbmRsZXIsIGRlc2MsIGV4dGVuc2lvblBvaW50Lm5hbWUpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRleHRlbnNpb25Qb2ludC5hY2NlcHRVc2Vycyh1c2Vycyk7XG5cdH1cblxuXHQvLyNyZWdpb24gQ2FsbGVkIGJ5IGV4dGVuc2lvbiBob3N0XG5cblx0cHJpdmF0ZSBfYWNxdWlyZUludGVybmFsQVBJKGV4dGVuc2lvbkhvc3Q6IElFeHRlbnNpb25Ib3N0KTogSUludGVybmFsRXh0ZW5zaW9uU2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9hY3RpdmF0ZUJ5SWQ6IChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgcmVhc29uOiBFeHRlbnNpb25BY3RpdmF0aW9uUmVhc29uKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hY3RpdmF0ZUJ5SWQoZXh0ZW5zaW9uSWQsIHJlYXNvbik7XG5cdFx0XHR9LFxuXHRcdFx0X29uV2lsbEFjdGl2YXRlRXh0ZW5zaW9uOiAoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiB2b2lkID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX29uV2lsbEFjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbklkLCBleHRlbnNpb25Ib3N0LnJ1bm5pbmdMb2NhdGlvbik7XG5cdFx0XHR9LFxuXHRcdFx0X29uRGlkQWN0aXZhdGVFeHRlbnNpb246IChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgY29kZUxvYWRpbmdUaW1lOiBudW1iZXIsIGFjdGl2YXRlQ2FsbFRpbWU6IG51bWJlciwgYWN0aXZhdGVSZXNvbHZlZFRpbWU6IG51bWJlciwgYWN0aXZhdGlvblJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IHZvaWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fb25EaWRBY3RpdmF0ZUV4dGVuc2lvbihleHRlbnNpb25JZCwgY29kZUxvYWRpbmdUaW1lLCBhY3RpdmF0ZUNhbGxUaW1lLCBhY3RpdmF0ZVJlc29sdmVkVGltZSwgYWN0aXZhdGlvblJlYXNvbik7XG5cdFx0XHR9LFxuXHRcdFx0X29uRGlkQWN0aXZhdGVFeHRlbnNpb25FcnJvcjogKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBlcnJvcjogRXJyb3IpOiB2b2lkID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX29uRGlkQWN0aXZhdGVFeHRlbnNpb25FcnJvcihleHRlbnNpb25JZCwgZXJyb3IpO1xuXHRcdFx0fSxcblx0XHRcdF9vbkV4dGVuc2lvblJ1bnRpbWVFcnJvcjogKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBlcnI6IEVycm9yKTogdm9pZCA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9vbkV4dGVuc2lvblJ1bnRpbWVFcnJvcihleHRlbnNpb25JZCwgZXJyKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIF9hY3RpdmF0ZUJ5SWQoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChcblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5tYXAobWFuYWdlciA9PiBtYW5hZ2VyLmFjdGl2YXRlKGV4dGVuc2lvbklkLCByZWFzb24pKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWN0aXZhdGVkID0gcmVzdWx0cy5zb21lKGUgPT4gZSk7XG5cdFx0aWYgKCFhY3RpdmF0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBleHRlbnNpb24gJHtleHRlbnNpb25JZC52YWx1ZX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbldpbGxBY3RpdmF0ZUV4dGVuc2lvbihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgcnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9ydW5uaW5nTG9jYXRpb25zLnNldChleHRlbnNpb25JZCwgcnVubmluZ0xvY2F0aW9uKTtcblx0XHRjb25zdCBleHRlbnNpb25TdGF0dXMgPSB0aGlzLl9nZXRPckNyZWF0ZUV4dGVuc2lvblN0YXR1cyhleHRlbnNpb25JZCk7XG5cdFx0ZXh0ZW5zaW9uU3RhdHVzLm9uV2lsbEFjdGl2YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZEFjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBjb2RlTG9hZGluZ1RpbWU6IG51bWJlciwgYWN0aXZhdGVDYWxsVGltZTogbnVtYmVyLCBhY3RpdmF0ZVJlc29sdmVkVGltZTogbnVtYmVyLCBhY3RpdmF0aW9uUmVhc29uOiBFeHRlbnNpb25BY3RpdmF0aW9uUmVhc29uKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzID0gdGhpcy5fZ2V0T3JDcmVhdGVFeHRlbnNpb25TdGF0dXMoZXh0ZW5zaW9uSWQpO1xuXHRcdGV4dGVuc2lvblN0YXR1cy5zZXRBY3RpdmF0aW9uVGltZXMobmV3IEFjdGl2YXRpb25UaW1lcyhjb2RlTG9hZGluZ1RpbWUsIGFjdGl2YXRlQ2FsbFRpbWUsIGFjdGl2YXRlUmVzb2x2ZWRUaW1lLCBhY3RpdmF0aW9uUmVhc29uKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFeHRlbnNpb25zU3RhdHVzLmZpcmUoW2V4dGVuc2lvbklkXSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZEFjdGl2YXRlRXh0ZW5zaW9uRXJyb3IoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGVycm9yOiBFcnJvcik6IHZvaWQge1xuXHRcdHR5cGUgRXh0ZW5zaW9uQWN0aXZhdGlvbkVycm9yQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2FsZXhkaW1hJztcblx0XHRcdGNvbW1lbnQ6ICdBbiBleHRlbnNpb24gZmFpbGVkIHRvIGFjdGl2YXRlJztcblx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGV4dGVuc2lvbi4nIH07XG5cdFx0XHRlcnJvcjogeyBjbGFzc2lmaWNhdGlvbjogJ0NhbGxzdGFja09yRXhjZXB0aW9uJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBlcnJvciBtZXNzYWdlLicgfTtcblx0XHR9O1xuXHRcdHR5cGUgRXh0ZW5zaW9uQWN0aXZhdGlvbkVycm9yRXZlbnQgPSB7XG5cdFx0XHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdFx0ZXJyb3I6IHN0cmluZztcblx0XHR9O1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFeHRlbnNpb25BY3RpdmF0aW9uRXJyb3JFdmVudCwgRXh0ZW5zaW9uQWN0aXZhdGlvbkVycm9yQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25BY3RpdmF0aW9uRXJyb3InLCB7XG5cdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uSWQudmFsdWUsXG5cdFx0XHRlcnJvcjogZXJyb3IubWVzc2FnZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FeHRlbnNpb25SdW50aW1lRXJyb3IoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGVycjogRXJyb3IpOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb25TdGF0dXMgPSB0aGlzLl9nZXRPckNyZWF0ZUV4dGVuc2lvblN0YXR1cyhleHRlbnNpb25JZCk7XG5cdFx0ZXh0ZW5zaW9uU3RhdHVzLmFkZFJ1bnRpbWVFcnJvcihlcnIpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cy5maXJlKFtleHRlbnNpb25JZF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0UHJvcG9zZWRBcGlVc2FnZSh1c2FnZTogSVByb3Bvc2VkQXBpVXNhZ2UpOiB2b2lkIHtcblx0XHR0eXBlIFByb3Bvc2VkQXBpVXNhZ2VDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYWxleHIwMCc7XG5cdFx0XHRjb21tZW50OiAnQW4gZXh0ZW5zaW9uIGF0dGVtcHRlZCB0byB1c2UgYSBwcm9wb3NlZCBBUEkgaXQgaGFzIG5vdCBiZWVuIGFsbG93bGlzdGVkIHRvIHVzZS4nO1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgZXh0ZW5zaW9uIGF0dGVtcHRpbmcgdG8gdXNlIHRoZSBwcm9wb3NlZCBBUEkuJyB9O1xuXHRcdFx0cHJvcG9zYWxOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIHByb3Bvc2VkIEFQSSB0aGUgZXh0ZW5zaW9uIGlzIG5vdCBlbnRpdGxlZCB0byB1c2UuJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBQcm9wb3NlZEFwaVVzYWdlRXZlbnQgPSB7XG5cdFx0XHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdFx0cHJvcG9zYWxOYW1lOiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UHJvcG9zZWRBcGlVc2FnZUV2ZW50LCBQcm9wb3NlZEFwaVVzYWdlQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Qcm9wb3NlZEFwaU5vdEVuYWJsZWQnLCB7XG5cdFx0XHRleHRlbnNpb25JZDogdXNhZ2UuZXh0ZW5zaW9uSWQsXG5cdFx0XHRwcm9wb3NhbE5hbWU6IHVzYWdlLnByb3Bvc2FsTmFtZVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9yZXNvbHZlRXh0ZW5zaW9ucygpOiBBc3luY0l0ZXJhYmxlPFJlc29sdmVkRXh0ZW5zaW9ucz47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfb25FeHRlbnNpb25Ib3N0RXhpdChjb2RlOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX3Jlc29sdmVBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpOiBQcm9taXNlPFJlc29sdmVyUmVzdWx0Pjtcbn1cblxuY2xhc3MgRXh0ZW5zaW9uSG9zdENvbGxlY3Rpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9leHRlbnNpb25Ib3N0TWFuYWdlcnM6IEV4dGVuc2lvbkhvc3RNYW5hZ2VyRGF0YVtdID0gW107XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgbWFuYWdlciA9IHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vyc1tpXTtcblx0XHRcdG1hbmFnZXIuZXh0ZW5zaW9uSG9zdC5kaXNjb25uZWN0KCk7XG5cdFx0XHRtYW5hZ2VyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzID0gW107XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIGFkZChleHRlbnNpb25Ib3N0TWFuYWdlcjogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyLCBkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5wdXNoKG5ldyBFeHRlbnNpb25Ib3N0TWFuYWdlckRhdGEoZXh0ZW5zaW9uSG9zdE1hbmFnZXIsIGRpc3Bvc2FibGVTdG9yZSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHN0b3BBbGxJblJldmVyc2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNTIyMDRcblx0XHQvLyBEaXNwb3NlIGV4dGVuc2lvbiBob3N0cyBpbiByZXZlcnNlIGNyZWF0aW9uIG9yZGVyIGJlY2F1c2UgdGhlIGxvY2FsIGV4dGVuc2lvbiBob3N0XG5cdFx0Ly8gbWlnaHQgYmUgY3JpdGljYWwgaW4gc3VzdGFpbmluZyBhIGNvbm5lY3Rpb24gdG8gdGhlIHJlbW90ZSBleHRlbnNpb24gaG9zdFxuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IG1hbmFnZXIgPSB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnNbaV07XG5cdFx0XHRhd2FpdCBtYW5hZ2VyLmV4dGVuc2lvbkhvc3QuZGlzY29ubmVjdCgpO1xuXHRcdFx0bWFuYWdlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2VycyA9IFtdO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHN0b3BPbmUoZXh0ZW5zaW9uSG9zdE1hbmFnZXI6IElFeHRlbnNpb25Ib3N0TWFuYWdlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmZpbmRJbmRleChlbCA9PiBlbC5leHRlbnNpb25Ib3N0ID09PSBleHRlbnNpb25Ib3N0TWFuYWdlcik7XG5cdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RNYW5hZ2Vycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0YXdhaXQgZXh0ZW5zaW9uSG9zdE1hbmFnZXIuZGlzY29ubmVjdCgpO1xuXHRcdFx0ZXh0ZW5zaW9uSG9zdE1hbmFnZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRCeUtpbmQoa2luZDogRXh0ZW5zaW9uSG9zdEtpbmQpOiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsdGVyKGVsID0+IGVsLmtpbmQgPT09IGtpbmQpO1xuXHR9XG5cblx0cHVibGljIGdldEJ5UnVubmluZ0xvY2F0aW9uKHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uKTogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyIHwgbnVsbCB7XG5cdFx0Zm9yIChjb25zdCBlbCBvZiB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMpIHtcblx0XHRcdGlmIChlbC5leHRlbnNpb25Ib3N0LnJlcHJlc2VudHNSdW5uaW5nTG9jYXRpb24ocnVubmluZ0xvY2F0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gZWwuZXh0ZW5zaW9uSG9zdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQqW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25Ib3N0TWFuYWdlciBvZiB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMpIHtcblx0XHRcdHlpZWxkIGV4dGVuc2lvbkhvc3RNYW5hZ2VyLmV4dGVuc2lvbkhvc3Q7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG1hcDxUPihjYWxsYmFjazogKGV4dEhvc3RNYW5hZ2VyOiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIpID0+IFQpOiBUW10ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMubWFwKGVsID0+IGNhbGxiYWNrKGVsLmV4dGVuc2lvbkhvc3QpKTtcblx0fVxuXG5cdHB1YmxpYyBldmVyeShjYWxsYmFjazogKGV4dEhvc3RNYW5hZ2VyOiBJRXh0ZW5zaW9uSG9zdE1hbmFnZXIpID0+IHVua25vd24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmV2ZXJ5KGVsID0+IGNhbGxiYWNrKGVsLmV4dGVuc2lvbkhvc3QpKTtcblx0fVxuXG5cdHB1YmxpYyBmaWx0ZXIoY2FsbGJhY2s6IChleHRIb3N0TWFuYWdlcjogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyKSA9PiB1bmtub3duKTogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyW10ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0TWFuYWdlcnMuZmlsdGVyKGVsID0+IGNhbGxiYWNrKGVsLmV4dGVuc2lvbkhvc3QpKS5tYXAoZWwgPT4gZWwuZXh0ZW5zaW9uSG9zdCk7XG5cdH1cbn1cblxuY2xhc3MgRXh0ZW5zaW9uSG9zdE1hbmFnZXJEYXRhIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGV4dGVuc2lvbkhvc3Q6IElFeHRlbnNpb25Ib3N0TWFuYWdlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmVcblx0KSB7IH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5leHRlbnNpb25Ib3N0LmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVzb2x2ZXJFeHRlbnNpb25zIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxFeHRlbnNpb25zIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgUmVtb3RlRXh0ZW5zaW9ucyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSxcblx0KSB7IH1cbn1cblxuZXhwb3J0IHR5cGUgUmVzb2x2ZWRFeHRlbnNpb25zID0gUmVzb2x2ZXJFeHRlbnNpb25zIHwgTG9jYWxFeHRlbnNpb25zIHwgUmVtb3RlRXh0ZW5zaW9ucztcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uSG9zdEZhY3Rvcnkge1xuXHRjcmVhdGVFeHRlbnNpb25Ib3N0KHJ1bm5pbmdMb2NhdGlvbnM6IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIsIHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLCBpc0luaXRpYWxTdGFydDogYm9vbGVhbik6IElFeHRlbnNpb25Ib3N0IHwgbnVsbDtcbn1cblxuY2xhc3MgRGVsdGFFeHRlbnNpb25zUXVldWVJdGVtIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHRvQWRkOiBJRXh0ZW5zaW9uW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IHRvUmVtb3ZlOiBzdHJpbmdbXSB8IElFeHRlbnNpb25bXVxuXHQpIHsgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNSZXNvbHZlckV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFleHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cz8uc29tZShhY3RpdmF0aW9uRXZlbnQgPT4gYWN0aXZhdGlvbkV2ZW50LnN0YXJ0c1dpdGgoJ29uUmVzb2x2ZVJlbW90ZUF1dGhvcml0eTonKSk7XG59XG5cbi8qKlxuICogQGFyZ3VtZW50IGV4dGVuc2lvbnMgVGhlIGV4dGVuc2lvbnMgdG8gYmUgY2hlY2tlZC5cbiAqIEBhcmd1bWVudCBpZ25vcmVXb3Jrc3BhY2VUcnVzdCBEbyBub3QgdGFrZSB3b3Jrc3BhY2UgdHJ1c3QgaW50byBhY2NvdW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tFbmFibGVkQW5kUHJvcG9zZWRBUEkobG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIGV4dGVuc2lvbnNQcm9wb3NlZEFwaTogRXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLCBleHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgaWdub3JlV29ya3NwYWNlVHJ1c3Q6IGJvb2xlYW4pOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSB7XG5cdC8vIGVuYWJsZSBvciBkaXNhYmxlIHByb3Bvc2VkIEFQSSBwZXIgZXh0ZW5zaW9uXG5cdGV4dGVuc2lvbnNQcm9wb3NlZEFwaS51cGRhdGVFbmFibGVkQXBpUHJvcG9zYWxzKGV4dGVuc2lvbnMpO1xuXG5cdC8vIGtlZXAgb25seSBlbmFibGVkIGV4dGVuc2lvbnNcblx0cmV0dXJuIGZpbHRlckVuYWJsZWRFeHRlbnNpb25zKGxvZ1NlcnZpY2UsIGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBleHRlbnNpb25zLCBpZ25vcmVXb3Jrc3BhY2VUcnVzdCk7XG59XG5cbi8qKlxuICogUmV0dXJuIHRoZSBzdWJzZXQgb2YgZXh0ZW5zaW9ucyB0aGF0IGFyZSBlbmFibGVkLlxuICogQGFyZ3VtZW50IGlnbm9yZVdvcmtzcGFjZVRydXN0IERvIG5vdCB0YWtlIHdvcmtzcGFjZSB0cnVzdCBpbnRvIGFjY291bnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWx0ZXJFbmFibGVkRXh0ZW5zaW9ucyhsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgZXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIGlnbm9yZVdvcmtzcGFjZVRydXN0OiBib29sZWFuKTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10ge1xuXHRjb25zdCBlbmFibGVkRXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXSwgZXh0ZW5zaW9uc1RvQ2hlY2s6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW10sIG1hcHBlZEV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0aWYgKGV4dGVuc2lvbi5pc1VuZGVyRGV2ZWxvcG1lbnQpIHtcblx0XHRcdC8vIE5ldmVyIGRpc2FibGUgZXh0ZW5zaW9ucyB1bmRlciBkZXZlbG9wbWVudFxuXHRcdFx0ZW5hYmxlZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRleHRlbnNpb25zVG9DaGVjay5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRtYXBwZWRFeHRlbnNpb25zLnB1c2godG9FeHRlbnNpb24oZXh0ZW5zaW9uKSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZW5hYmxlbWVudFN0YXRlcyA9IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmdldEVuYWJsZW1lbnRTdGF0ZXMobWFwcGVkRXh0ZW5zaW9ucywgaWdub3JlV29ya3NwYWNlVHJ1c3QgPyB7IHRydXN0ZWQ6IHRydWUgfSA6IHVuZGVmaW5lZCk7XG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBlbmFibGVtZW50U3RhdGVzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdGlmIChleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUoZW5hYmxlbWVudFN0YXRlc1tpbmRleF0pKSB7XG5cdFx0XHRlbmFibGVkRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvbnNUb0NoZWNrW2luZGV4XSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgZmlsdGVyRW5hYmxlZEV4dGVuc2lvbnM6IGV4dGVuc2lvbiAnJHtleHRlbnNpb25zVG9DaGVja1tpbmRleF0uaWRlbnRpZmllci52YWx1ZX0nIGlzIGRpc2FibGVkYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGVuYWJsZWRFeHRlbnNpb25zO1xufVxuXG4vKipcbiAqIEBhcmd1bWVudCBleHRlbnNpb24gVGhlIGV4dGVuc2lvbiB0byBiZSBjaGVja2VkLlxuICogQGFyZ3VtZW50IGlnbm9yZVdvcmtzcGFjZVRydXN0IERvIG5vdCB0YWtlIHdvcmtzcGFjZSB0cnVzdCBpbnRvIGFjY291bnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHRlbnNpb25Jc0VuYWJsZWQobG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZ25vcmVXb3Jrc3BhY2VUcnVzdDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZmlsdGVyRW5hYmxlZEV4dGVuc2lvbnMobG9nU2VydmljZSwgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIFtleHRlbnNpb25dLCBpZ25vcmVXb3Jrc3BhY2VUcnVzdCkuaW5jbHVkZXMoZXh0ZW5zaW9uKTtcbn1cblxuZnVuY3Rpb24gaW5jbHVkZXMoZXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIGlkZW50aWZpZXI6IEV4dGVuc2lvbklkZW50aWZpZXIpOiBib29sZWFuIHtcblx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdGlmIChFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHRlbnNpb24uaWRlbnRpZmllciwgaWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25TdGF0dXMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VzOiBJTWVzc2FnZVtdID0gW107XG5cdHB1YmxpYyBnZXQgbWVzc2FnZXMoKTogSU1lc3NhZ2VbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX21lc3NhZ2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZhdGlvblRpbWVzOiBBY3RpdmF0aW9uVGltZXMgfCBudWxsID0gbnVsbDtcblx0cHVibGljIGdldCBhY3RpdmF0aW9uVGltZXMoKTogQWN0aXZhdGlvblRpbWVzIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2YXRpb25UaW1lcztcblx0fVxuXG5cdHByaXZhdGUgX3J1bnRpbWVFcnJvcnM6IEVycm9yW10gPSBbXTtcblx0cHVibGljIGdldCBydW50aW1lRXJyb3JzKCk6IEVycm9yW10ge1xuXHRcdHJldHVybiB0aGlzLl9ydW50aW1lRXJyb3JzO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZhdGlvblN0YXJ0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHVibGljIGdldCBhY3RpdmF0aW9uU3RhcnRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdGlvblN0YXJ0ZWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsXG5cdCkgeyB9XG5cblx0cHVibGljIGNsZWFyUnVudGltZVN0YXR1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmF0aW9uU3RhcnRlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2FjdGl2YXRpb25UaW1lcyA9IG51bGw7XG5cdFx0dGhpcy5fcnVudGltZUVycm9ycyA9IFtdO1xuXHR9XG5cblx0cHVibGljIGFkZE1lc3NhZ2UobXNnOiBJTWVzc2FnZSk6IHZvaWQge1xuXHRcdHRoaXMuX21lc3NhZ2VzLnB1c2gobXNnKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRBY3RpdmF0aW9uVGltZXMoYWN0aXZhdGlvblRpbWVzOiBBY3RpdmF0aW9uVGltZXMpIHtcblx0XHR0aGlzLl9hY3RpdmF0aW9uVGltZXMgPSBhY3RpdmF0aW9uVGltZXM7XG5cdH1cblxuXHRwdWJsaWMgYWRkUnVudGltZUVycm9yKGVycjogRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLl9ydW50aW1lRXJyb3JzLnB1c2goZXJyKTtcblx0fVxuXG5cdHB1YmxpYyBvbldpbGxBY3RpdmF0ZSgpIHtcblx0XHR0aGlzLl9hY3RpdmF0aW9uU3RhcnRlZCA9IHRydWU7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25Ib3N0Q3Jhc2hJbmZvIHtcblx0dGltZXN0YW1wOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25Ib3N0Q3Jhc2hUcmFja2VyIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfVElNRV9MSU1JVCA9IDUgKiA2MCAqIDEwMDA7IC8vIDUgbWludXRlc1xuXHRwcml2YXRlIHN0YXRpYyBfQ1JBU0hfTElNSVQgPSAzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY2VudENyYXNoZXM6IElFeHRlbnNpb25Ib3N0Q3Jhc2hJbmZvW10gPSBbXTtcblxuXHRwcml2YXRlIF9yZW1vdmVPbGRDcmFzaGVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxpbWl0ID0gRGF0ZS5ub3coKSAtIEV4dGVuc2lvbkhvc3RDcmFzaFRyYWNrZXIuX1RJTUVfTElNSVQ7XG5cdFx0d2hpbGUgKHRoaXMuX3JlY2VudENyYXNoZXMubGVuZ3RoID4gMCAmJiB0aGlzLl9yZWNlbnRDcmFzaGVzWzBdLnRpbWVzdGFtcCA8IGxpbWl0KSB7XG5cdFx0XHR0aGlzLl9yZWNlbnRDcmFzaGVzLnNoaWZ0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyQ3Jhc2goKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVtb3ZlT2xkQ3Jhc2hlcygpO1xuXHRcdHRoaXMuX3JlY2VudENyYXNoZXMucHVzaCh7IHRpbWVzdGFtcDogRGF0ZS5ub3coKSB9KTtcblx0fVxuXG5cdHB1YmxpYyBzaG91bGRBdXRvbWF0aWNhbGx5UmVzdGFydCgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9yZW1vdmVPbGRDcmFzaGVzKCk7XG5cdFx0cmV0dXJuICh0aGlzLl9yZWNlbnRDcmFzaGVzLmxlbmd0aCA8IEV4dGVuc2lvbkhvc3RDcmFzaFRyYWNrZXIuX0NSQVNIX0xJTUlUKTtcblx0fVxufVxuXG4vKipcbiAqIFRoaXMgY2FuIHJ1biBjb3JyZWN0bHkgb25seSBvbiB0aGUgcmVuZGVyZXIgcHJvY2VzcyBiZWNhdXNlIHRoYXQgaXMgdGhlIG9ubHkgcGxhY2VcbiAqIHdoZXJlIGFsbCBleHRlbnNpb24gcG9pbnRzIGFuZCBhbGwgaW1wbGljaXQgYWN0aXZhdGlvbiBldmVudHMgZ2VuZXJhdG9ycyBhcmUga25vd24uXG4gKi9cbmV4cG9ydCBjbGFzcyBJbXBsaWNpdEFjdGl2YXRpb25Bd2FyZVJlYWRlciBpbXBsZW1lbnRzIElBY3RpdmF0aW9uRXZlbnRzUmVhZGVyIHtcblx0cHVibGljIHJlYWRBY3RpdmF0aW9uRXZlbnRzKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIEltcGxpY2l0QWN0aXZhdGlvbkV2ZW50cy5yZWFkQWN0aXZhdGlvbkV2ZW50cyhleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cdH1cbn1cblxuY2xhc3MgQWN0aXZhdGlvbkZlYXR1cmVNYXJrZG93bmVSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZU1hcmtkb3duUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAnbWFya2Rvd24nO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuYWN0aXZhdGlvbkV2ZW50cztcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJTWFya2Rvd25TdHJpbmc+IHtcblx0XHRjb25zdCBhY3RpdmF0aW9uRXZlbnRzID0gbWFuaWZlc3QuYWN0aXZhdGlvbkV2ZW50cyB8fCBbXTtcblx0XHRjb25zdCBkYXRhID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0aWYgKGFjdGl2YXRpb25FdmVudHMubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGl2YXRpb25FdmVudCBvZiBhY3RpdmF0aW9uRXZlbnRzKSB7XG5cdFx0XHRcdGRhdGEuYXBwZW5kTWFya2Rvd24oYC0gXFxgJHthY3RpdmF0aW9uRXZlbnR9XFxgXFxuYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9uRmVhdHVyZXNFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAnYWN0aXZhdGlvbkV2ZW50cycsXG5cdGxhYmVsOiBubHMubG9jYWxpemUoJ2FjdGl2YXRpb24nLCBcIkFjdGl2YXRpb24gRXZlbnRzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoQWN0aXZhdGlvbkZlYXR1cmVNYXJrZG93bmVSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNB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
