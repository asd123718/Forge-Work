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
import { runWhenWindowIdle } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Schemas } from "../../../../base/common/network.js";
import * as performance from "../../../../base/common/performance.js";
import { isCI } from "../../../../base/common/platform.js";
import * as nls from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IExtensionGalleryService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { PersistentConnectionEventType } from "../../../../platform/remote/common/remoteAgentConnection.js";
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, RemoteConnectionType, getRemoteAuthorityPrefix } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IRemoteExtensionsScannerService } from "../../../../platform/remote/common/remoteExtensionsScanner.js";
import { getRemoteName, isLoopbackHost, parseAuthorityWithPort } from "../../../../platform/remote/common/remoteHosts.js";
import { updateProxyConfigurationsScope } from "../../../../platform/request/common/request.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { EnablementState, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { WebWorkerExtensionHost } from "../browser/webWorkerExtensionHost.js";
import { AbstractExtensionService, ExtensionHostCrashTracker, LocalExtensions, RemoteExtensions, ResolverExtensions, checkEnabledAndProposedAPI, extensionIsEnabled, isResolverExtension } from "../common/abstractExtensionService.js";
import { parseExtensionDevOptions } from "../common/extensionDevOptions.js";
import { ExtensionHostKind, ExtensionRunningPreference, extensionHostKindToString, extensionRunningPreferenceToString } from "../common/extensionHostKind.js";
import { ExtensionHostExitCode } from "../common/extensionHostProtocol.js";
import { IExtensionManifestPropertiesService } from "../common/extensionManifestPropertiesService.js";
import { filterExtensionDescriptions } from "../common/extensionRunningLocationTracker.js";
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionService, toExtension, webWorkerExtHostConfig } from "../common/extensions.js";
import { ExtensionsProposedApi } from "../common/extensionsProposedApi.js";
import { RemoteExtensionHost } from "../common/remoteExtensionHost.js";
import { CachedExtensionScanner } from "./cachedExtensionScanner.js";
import { NativeLocalProcessExtensionHost } from "./localProcessExtensionHost.js";
import { IHostService } from "../../host/browser/host.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { IRemoteExplorerService } from "../../remote/common/remoteExplorerService.js";
import { AsyncIterableProducer } from "../../../../base/common/async.js";
let NativeExtensionService = class extends AbstractExtensionService {
  constructor(instantiationService, notificationService, environmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService, _nativeHostService, _hostService, _remoteExplorerService, _extensionGalleryService, _workspaceTrustManagementService, dialogService) {
    const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
    const extensionScanner = instantiationService.createInstance(CachedExtensionScanner);
    const extensionHostFactory = new NativeExtensionHostFactory(
      extensionsProposedApi,
      extensionScanner,
      () => this._getExtensionRegistrySnapshotWhenReady(),
      instantiationService,
      environmentService,
      extensionEnablementService,
      configurationService,
      remoteAgentService,
      remoteAuthorityResolverService,
      logService
    );
    super(
      { hasLocalProcess: true, allowRemoteExtensionsInLocalWebWorker: false },
      extensionsProposedApi,
      extensionHostFactory,
      new NativeExtensionHostKindPicker(environmentService, configurationService, logService),
      instantiationService,
      notificationService,
      environmentService,
      telemetryService,
      extensionEnablementService,
      fileService,
      productService,
      extensionManagementService,
      contextService,
      configurationService,
      extensionManifestPropertiesService,
      logService,
      remoteAgentService,
      remoteExtensionsScannerService,
      lifecycleService,
      remoteAuthorityResolverService,
      dialogService
    );
    this._nativeHostService = _nativeHostService;
    this._hostService = _hostService;
    this._remoteExplorerService = _remoteExplorerService;
    this._extensionGalleryService = _extensionGalleryService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._localCrashTracker = new ExtensionHostCrashTracker();
    this._extensionScanner = extensionScanner;
    lifecycleService.when(LifecyclePhase.Ready).then(() => {
      runWhenWindowIdle(
        mainWindow,
        () => {
          this._initializeIfNeeded();
        },
        50
        /*max delay*/
      );
    });
  }
  async _scanAllLocalExtensions() {
    return this._extensionScanner.scannedExtensions;
  }
  _onExtensionHostCrashed(extensionHost, code, signal) {
    const activatedExtensions = [];
    const extensionsStatus = this.getExtensionsStatus();
    for (const key of Object.keys(extensionsStatus)) {
      const extensionStatus = extensionsStatus[key];
      if (extensionStatus.activationStarted && extensionHost.containsExtension(extensionStatus.id)) {
        activatedExtensions.push(extensionStatus.id);
      }
    }
    super._onExtensionHostCrashed(extensionHost, code, signal);
    if (extensionHost.kind === ExtensionHostKind.LocalProcess) {
      if (code === ExtensionHostExitCode.VersionMismatch) {
        this._notificationService.prompt(
          Severity.Error,
          nls.localize("extensionService.versionMismatchCrash", "Extension host cannot start: version mismatch."),
          [{
            label: nls.localize("relaunch", "Relaunch VS Code"),
            run: () => {
              this._instantiationService.invokeFunction((accessor) => {
                const hostService = accessor.get(IHostService);
                hostService.restart();
              });
            }
          }]
        );
        return;
      }
      this._logExtensionHostCrash(extensionHost);
      this._sendExtensionHostCrashTelemetry(code, signal, activatedExtensions);
      this._localCrashTracker.registerCrash();
      if (this._localCrashTracker.shouldAutomaticallyRestart()) {
        this._logService.info(`Automatically restarting the extension host.`);
        this._notificationService.status(nls.localize("extensionService.autoRestart", "The extension host terminated unexpectedly. Restarting..."), { hideAfter: 5e3 });
        this.startExtensionHosts();
      } else {
        const choices = [];
        if (this._environmentService.isBuilt) {
          choices.push({
            label: nls.localize("startBisect", "Start Extension Bisect"),
            run: () => {
              this._instantiationService.invokeFunction((accessor) => {
                const commandService = accessor.get(ICommandService);
                commandService.executeCommand("extension.bisect.start");
              });
            }
          });
        } else {
          choices.push({
            label: nls.localize("devTools", "Open Developer Tools"),
            run: () => this._nativeHostService.openDevTools()
          });
        }
        choices.push({
          label: nls.localize("restart", "Restart Extension Host"),
          run: () => this.startExtensionHosts()
        });
        if (this._environmentService.isBuilt) {
          choices.push({
            label: nls.localize("learnMore", "Learn More"),
            run: () => {
              this._instantiationService.invokeFunction((accessor) => {
                const openerService = accessor.get(IOpenerService);
                openerService.open("https://aka.ms/vscode-extension-bisect");
              });
            }
          });
        }
        this._notificationService.prompt(Severity.Error, nls.localize("extensionService.crash", "Extension host terminated unexpectedly 3 times within the last 5 minutes."), choices);
      }
    }
  }
  _sendExtensionHostCrashTelemetry(code, signal, activatedExtensions) {
    this._telemetryService.publicLog2("extensionHostCrash", {
      code,
      signal,
      extensionIds: activatedExtensions.map((e) => e.value)
    });
    for (const extensionId of activatedExtensions) {
      this._telemetryService.publicLog2("extensionHostCrashExtension", {
        code,
        signal,
        extensionId: extensionId.value
      });
    }
  }
  // --- impl
  async _resolveAuthority(remoteAuthority) {
    const authorityPlusIndex = remoteAuthority.indexOf("+");
    if (authorityPlusIndex === -1) {
      const { host, port } = parseAuthorityWithPort(remoteAuthority);
      if (!isLoopbackHost(host)) {
        await this._confirmDirectRemoteConnection(host, port);
      }
      return {
        authority: {
          authority: remoteAuthority,
          connectTo: {
            type: RemoteConnectionType.WebSocket,
            host,
            port
          },
          connectionToken: void 0
        }
      };
    }
    return this._resolveAuthorityOnExtensionHosts(ExtensionHostKind.LocalProcess, remoteAuthority);
  }
  async _confirmDirectRemoteConnection(host, port) {
    const { confirmed } = await this._dialogService.confirm({
      type: Severity.Warning,
      message: nls.localize("remoteConnectionConfirm", "Allow connecting to the remote server '{0}:{1}'?", host, port),
      detail: nls.localize("remoteConnectionConfirmDetail", "Code is about to connect to '{0}:{1}' to host a remote extension host. Only continue if you trust this server, as it will be able to run code and access files on your behalf.", host, port),
      primaryButton: nls.localize("remoteConnectionConfirmButton", "Connect")
    });
    if (!confirmed) {
      throw new RemoteAuthorityResolverError(
        nls.localize("remoteConnectionRejected", "Connection to '{0}:{1}' was not allowed.", host, port),
        RemoteAuthorityResolverErrorCode.NotAvailable
      );
    }
  }
  async _getCanonicalURI(remoteAuthority, uri) {
    const authorityPlusIndex = remoteAuthority.indexOf("+");
    if (authorityPlusIndex === -1) {
      return uri;
    }
    const localProcessExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.LocalProcess);
    if (localProcessExtensionHosts.length === 0) {
      throw new Error(`Cannot resolve canonical URI`);
    }
    const results = await Promise.all(localProcessExtensionHosts.map((extHost) => extHost.getCanonicalURI(remoteAuthority, uri)));
    for (const result of results) {
      if (result) {
        return result;
      }
    }
    throw new Error(`Cannot get canonical URI because no extension is installed to resolve ${getRemoteAuthorityPrefix(remoteAuthority)}`);
  }
  _resolveExtensions() {
    return new AsyncIterableProducer((emitter) => this._doResolveExtensions(emitter));
  }
  async _doResolveExtensions(emitter) {
    this._extensionScanner.startScanningExtensions();
    const remoteAuthority = this._environmentService.remoteAuthority;
    let remoteEnv = null;
    let remoteExtensions = [];
    if (remoteAuthority) {
      this._remoteAuthorityResolverService._setCanonicalURIProvider(async (uri) => {
        if (uri.scheme !== Schemas.vscodeRemote || uri.authority !== remoteAuthority) {
          return uri;
        }
        performance.mark(`code/willGetCanonicalURI/${getRemoteAuthorityPrefix(remoteAuthority)}`);
        if (isCI) {
          this._logService.info(`Invoking getCanonicalURI for authority ${getRemoteAuthorityPrefix(remoteAuthority)}...`);
        }
        try {
          return this._getCanonicalURI(remoteAuthority, uri);
        } finally {
          performance.mark(`code/didGetCanonicalURI/${getRemoteAuthorityPrefix(remoteAuthority)}`);
          if (isCI) {
            this._logService.info(`getCanonicalURI returned for authority ${getRemoteAuthorityPrefix(remoteAuthority)}.`);
          }
        }
      });
      if (isCI) {
        this._logService.info(`Starting to wait on IWorkspaceTrustManagementService.workspaceResolved...`);
      }
      await this._workspaceTrustManagementService.workspaceResolved;
      if (isCI) {
        this._logService.info(`Finished waiting on IWorkspaceTrustManagementService.workspaceResolved.`);
      }
      const localExtensions = await this._scanAllLocalExtensions();
      const resolverExtensions = localExtensions.filter((extension) => isResolverExtension(extension));
      if (resolverExtensions.length) {
        emitter.emitOne(new ResolverExtensions(resolverExtensions));
      }
      let resolverResult;
      try {
        resolverResult = await this._resolveAuthorityInitial(remoteAuthority);
      } catch (err) {
        if (RemoteAuthorityResolverError.isNoResolverFound(err)) {
          err.isHandled = await this._handleNoResolverFound(remoteAuthority);
        } else {
          if (RemoteAuthorityResolverError.isHandled(err)) {
            console.log(`Error handled: Not showing a notification for the error`);
          }
        }
        this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
        return this._startLocalExtensionHost(emitter);
      }
      this._remoteAuthorityResolverService._setResolvedAuthority(resolverResult.authority, resolverResult.options);
      this._remoteExplorerService.setTunnelInformation(resolverResult.tunnelInformation);
      const connection = this._remoteAgentService.getConnection();
      if (connection) {
        this._register(connection.onDidStateChange(async (e) => {
          if (e.type === PersistentConnectionEventType.ConnectionLost) {
            this._remoteAuthorityResolverService._clearResolvedAuthority(remoteAuthority);
          }
        }));
        this._register(connection.onReconnecting(() => this._resolveAuthorityAgain()));
      }
      [remoteEnv, remoteExtensions] = await Promise.all([
        this._remoteAgentService.getEnvironment(),
        this._remoteExtensionsScannerService.scanExtensions()
      ]);
      if (!remoteEnv) {
        this._notificationService.notify({ severity: Severity.Error, message: nls.localize("getEnvironmentFailure", "Could not fetch remote environment") });
        return this._startLocalExtensionHost(emitter);
      }
      const useHostProxyDefault = remoteEnv.useHostProxy;
      this._register(this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("http.useLocalProxyConfiguration")) {
          updateProxyConfigurationsScope(this._configurationService.getValue("http.useLocalProxyConfiguration"), useHostProxyDefault);
        }
      }));
      updateProxyConfigurationsScope(this._configurationService.getValue("http.useLocalProxyConfiguration"), useHostProxyDefault);
    } else {
      this._remoteAuthorityResolverService._setCanonicalURIProvider(async (uri) => uri);
    }
    return this._startLocalExtensionHost(emitter, remoteExtensions);
  }
  async _startLocalExtensionHost(emitter, remoteExtensions = []) {
    await this._workspaceTrustManagementService.workspaceTrustInitialized;
    if (remoteExtensions.length) {
      emitter.emitOne(new RemoteExtensions(remoteExtensions));
    }
    emitter.emitOne(new LocalExtensions(await this._scanAllLocalExtensions()));
  }
  async _onExtensionHostExit(code) {
    await this._doStopExtensionHosts();
    const connection = this._remoteAgentService.getConnection();
    connection?.dispose();
    if (parseExtensionDevOptions(this._environmentService).isExtensionDevTestFromCli) {
      if (isCI) {
        this._logService.info(`Asking native host service to exit with code ${code}.`);
      }
      this._nativeHostService.exit(code);
    } else {
      this._nativeHostService.closeWindow();
    }
  }
  async _handleNoResolverFound(remoteAuthority) {
    const remoteName = getRemoteName(remoteAuthority);
    const recommendation = this._productService.remoteExtensionTips?.[remoteName];
    if (!recommendation) {
      return false;
    }
    const resolverExtensionId = recommendation.extensionId;
    const allExtensions = await this._scanAllLocalExtensions();
    const extension = allExtensions.filter((e) => e.identifier.value === resolverExtensionId)[0];
    if (extension) {
      if (!extensionIsEnabled(this._logService, this._extensionEnablementService, extension, false)) {
        const message = nls.localize("enableResolver", "Extension '{0}' is required to open the remote window.\nOK to enable?", recommendation.friendlyName);
        this._notificationService.prompt(
          Severity.Info,
          message,
          [{
            label: nls.localize("enable", "Enable and Reload"),
            run: async () => {
              await this._extensionEnablementService.setEnablement([toExtension(extension)], EnablementState.EnabledGlobally);
              await this._hostService.reload();
            }
          }],
          {
            sticky: true,
            priority: NotificationPriority.URGENT
          }
        );
      }
    } else {
      const message = nls.localize("installResolver", "Extension '{0}' is required to open the remote window.\nDo you want to install the extension?", recommendation.friendlyName);
      this._notificationService.prompt(
        Severity.Info,
        message,
        [{
          label: nls.localize("install", "Install and Reload"),
          run: async () => {
            const [galleryExtension] = await this._extensionGalleryService.getExtensions([{ id: resolverExtensionId }], CancellationToken.None);
            if (galleryExtension) {
              await this._extensionManagementService.installFromGallery(galleryExtension);
              await this._hostService.reload();
            } else {
              this._notificationService.error(nls.localize("resolverExtensionNotFound", "`{0}` not found on marketplace"));
            }
          }
        }],
        {
          sticky: true,
          priority: NotificationPriority.URGENT
        }
      );
    }
    return true;
  }
};
NativeExtensionService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IWorkbenchExtensionEnablementService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IWorkbenchExtensionManagementService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IExtensionManifestPropertiesService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IRemoteAgentService),
  __decorateParam(13, IRemoteExtensionsScannerService),
  __decorateParam(14, ILifecycleService),
  __decorateParam(15, IRemoteAuthorityResolverService),
  __decorateParam(16, INativeHostService),
  __decorateParam(17, IHostService),
  __decorateParam(18, IRemoteExplorerService),
  __decorateParam(19, IExtensionGalleryService),
  __decorateParam(20, IWorkspaceTrustManagementService),
  __decorateParam(21, IDialogService)
], NativeExtensionService);
let NativeExtensionHostFactory = class {
  constructor(_extensionsProposedApi, _extensionScanner, _getExtensionRegistrySnapshotWhenReady, _instantiationService, environmentService, _extensionEnablementService, configurationService, _remoteAgentService, _remoteAuthorityResolverService, _logService) {
    this._extensionsProposedApi = _extensionsProposedApi;
    this._extensionScanner = _extensionScanner;
    this._getExtensionRegistrySnapshotWhenReady = _getExtensionRegistrySnapshotWhenReady;
    this._instantiationService = _instantiationService;
    this._extensionEnablementService = _extensionEnablementService;
    this._remoteAgentService = _remoteAgentService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._logService = _logService;
    this._webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
  }
  createExtensionHost(runningLocations, runningLocation, isInitialStart) {
    switch (runningLocation.kind) {
      case ExtensionHostKind.LocalProcess: {
        const startup = isInitialStart ? ExtensionHostStartup.EagerManualStart : ExtensionHostStartup.EagerAutoStart;
        return this._instantiationService.createInstance(NativeLocalProcessExtensionHost, runningLocation, startup, this._createLocalProcessExtensionHostDataProvider(runningLocations, isInitialStart, runningLocation));
      }
      case ExtensionHostKind.LocalWebWorker: {
        if (this._webWorkerExtHostEnablement !== 0 /* Disabled */) {
          const startup = this._webWorkerExtHostEnablement === 2 /* Lazy */ ? ExtensionHostStartup.LazyAutoStart : ExtensionHostStartup.EagerManualStart;
          return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createWebWorkerExtensionHostDataProvider(runningLocations, runningLocation));
        }
        return null;
      }
      case ExtensionHostKind.Remote: {
        const remoteAgentConnection = this._remoteAgentService.getConnection();
        if (remoteAgentConnection) {
          return this._instantiationService.createInstance(RemoteExtensionHost, runningLocation, this._createRemoteExtensionHostDataProvider(runningLocations, remoteAgentConnection.remoteAuthority));
        }
        return null;
      }
    }
  }
  _createLocalProcessExtensionHostDataProvider(runningLocations, isInitialStart, desiredRunningLocation) {
    return {
      getInitData: async () => {
        if (isInitialStart) {
          const scannedExtensions = await this._extensionScanner.scannedExtensions;
          if (isCI) {
            this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.scannedExtensions: ${scannedExtensions.map((ext) => ext.identifier.value).join(",")}`);
          }
          const localExtensions = checkEnabledAndProposedAPI(
            this._logService,
            this._extensionEnablementService,
            this._extensionsProposedApi,
            scannedExtensions,
            /* ignore workspace trust */
            true
          );
          if (isCI) {
            this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.localExtensions: ${localExtensions.map((ext) => ext.identifier.value).join(",")}`);
          }
          const runningLocation = runningLocations.computeRunningLocation(localExtensions, [], false);
          const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, (extRunningLocation) => desiredRunningLocation.equals(extRunningLocation));
          const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map((extension) => extension.identifier));
          if (isCI) {
            this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.myExtensions: ${myExtensions.map((ext) => ext.identifier.value).join(",")}`);
          }
          return { extensions };
        } else {
          const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
          const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
          const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map((extension) => extension.identifier));
          return { extensions };
        }
      }
    };
  }
  _createWebWorkerExtensionHostDataProvider(runningLocations, desiredRunningLocation) {
    return {
      getInitData: async () => {
        const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
        const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
        const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map((extension) => extension.identifier));
        return { extensions };
      }
    };
  }
  _createRemoteExtensionHostDataProvider(runningLocations, remoteAuthority) {
    return {
      remoteAuthority,
      getInitData: async () => {
        const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
        const remoteEnv = await this._remoteAgentService.getEnvironment();
        if (!remoteEnv) {
          throw new Error("Cannot provide init data for remote extension host!");
        }
        const myExtensions = runningLocations.filterByExtensionHostKind(snapshot.extensions, ExtensionHostKind.Remote);
        const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map((extension) => extension.identifier));
        return {
          connectionData: this._remoteAuthorityResolverService.getConnectionData(remoteAuthority),
          pid: remoteEnv.pid,
          appRoot: remoteEnv.appRoot,
          extensionHostLogsPath: remoteEnv.extensionHostLogsPath,
          globalStorageHome: remoteEnv.globalStorageHome,
          workspaceStorageHome: remoteEnv.workspaceStorageHome,
          extensions
        };
      }
    };
  }
};
NativeExtensionHostFactory = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, IWorkbenchExtensionEnablementService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IRemoteAgentService),
  __decorateParam(8, IRemoteAuthorityResolverService),
  __decorateParam(9, ILogService)
], NativeExtensionHostFactory);
function determineLocalWebWorkerExtHostEnablement(environmentService, configurationService) {
  if (environmentService.isExtensionDevelopment && environmentService.extensionDevelopmentKind?.some((k) => k === "web")) {
    return 1 /* Eager */;
  } else {
    const config = configurationService.getValue(webWorkerExtHostConfig);
    if (config === true) {
      return 1 /* Eager */;
    } else if (config === "auto") {
      return 2 /* Lazy */;
    } else {
      return 0 /* Disabled */;
    }
  }
}
var LocalWebWorkerExtHostEnablement = /* @__PURE__ */ ((LocalWebWorkerExtHostEnablement2) => {
  LocalWebWorkerExtHostEnablement2[LocalWebWorkerExtHostEnablement2["Disabled"] = 0] = "Disabled";
  LocalWebWorkerExtHostEnablement2[LocalWebWorkerExtHostEnablement2["Eager"] = 1] = "Eager";
  LocalWebWorkerExtHostEnablement2[LocalWebWorkerExtHostEnablement2["Lazy"] = 2] = "Lazy";
  return LocalWebWorkerExtHostEnablement2;
})(LocalWebWorkerExtHostEnablement || {});
let NativeExtensionHostKindPicker = class {
  constructor(environmentService, configurationService, _logService) {
    this._logService = _logService;
    this._hasRemoteExtHost = Boolean(environmentService.remoteAuthority);
    const webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
    this._hasWebWorkerExtHost = webWorkerExtHostEnablement !== 0 /* Disabled */;
  }
  pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
    const result = NativeExtensionHostKindPicker.pickExtensionHostKind(extensionKinds, isInstalledLocally, isInstalledRemotely, preference, this._hasRemoteExtHost, this._hasWebWorkerExtHost);
    this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(", ")}], isInstalledLocally: ${isInstalledLocally}, isInstalledRemotely: ${isInstalledRemotely}, preference: ${extensionRunningPreferenceToString(preference)} => ${extensionHostKindToString(result)}`);
    return result;
  }
  static pickExtensionHostKind(extensionKinds, isInstalledLocally, isInstalledRemotely, preference, hasRemoteExtHost, hasWebWorkerExtHost) {
    const result = [];
    for (const extensionKind of extensionKinds) {
      if (extensionKind === "ui" && isInstalledLocally) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
          return ExtensionHostKind.LocalProcess;
        } else {
          result.push(ExtensionHostKind.LocalProcess);
        }
      }
      if (extensionKind === "workspace" && isInstalledRemotely) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Remote) {
          return ExtensionHostKind.Remote;
        } else {
          result.push(ExtensionHostKind.Remote);
        }
      }
      if (extensionKind === "workspace" && !hasRemoteExtHost) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
          return ExtensionHostKind.LocalProcess;
        } else {
          result.push(ExtensionHostKind.LocalProcess);
        }
      }
      if (extensionKind === "web" && isInstalledLocally && hasWebWorkerExtHost) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
          return ExtensionHostKind.LocalWebWorker;
        } else {
          result.push(ExtensionHostKind.LocalWebWorker);
        }
      }
    }
    return result.length > 0 ? result[0] : null;
  }
};
NativeExtensionHostKindPicker = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService)
], NativeExtensionHostKindPicker);
class RestartExtensionHostAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.restartExtensionHost",
      title: nls.localize2("restartExtensionHost", "Restart Extension Host"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const extensionService = accessor.get(IExtensionService);
    const stopped = await extensionService.stopExtensionHosts(nls.localize("restartExtensionHost.reason", "An explicit request"));
    if (stopped) {
      extensionService.startExtensionHosts();
    }
  }
}
registerAction2(RestartExtensionHostAction);
registerSingleton(IExtensionService, NativeExtensionService, InstantiationType.Eager);
export {
  NativeExtensionHostKindPicker,
  NativeExtensionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxlbGVjdHJvbi1icm93c2VyXFxuYXRpdmVFeHRlbnNpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcnVuV2hlbldpbmRvd0lkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIHBlcmZvcm1hbmNlIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IGlzQ0kgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgSVByb21wdENob2ljZSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEVudmlyb25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IsIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLCBSZW1vdGVDb25uZWN0aW9uVHlwZSwgUmVzb2x2ZXJSZXN1bHQsIGdldFJlbW90ZUF1dGhvcml0eVByZWZpeCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXIuanMnO1xuaW1wb3J0IHsgZ2V0UmVtb3RlTmFtZSwgaXNMb29wYmFja0hvc3QsIHBhcnNlQXV0aG9yaXR5V2l0aFBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUhvc3RzLmpzJztcbmltcG9ydCB7IHVwZGF0ZVByb3h5Q29uZmlndXJhdGlvbnNTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXRlLCBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlckV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIsIElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0SW5pdERhdGEsIFdlYldvcmtlckV4dGVuc2lvbkhvc3QgfSBmcm9tICcuLi9icm93c2VyL3dlYldvcmtlckV4dGVuc2lvbkhvc3QuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLCBFeHRlbnNpb25Ib3N0Q3Jhc2hUcmFja2VyLCBJRXh0ZW5zaW9uSG9zdEZhY3RvcnksIExvY2FsRXh0ZW5zaW9ucywgUmVtb3RlRXh0ZW5zaW9ucywgUmVzb2x2ZWRFeHRlbnNpb25zLCBSZXNvbHZlckV4dGVuc2lvbnMsIGNoZWNrRW5hYmxlZEFuZFByb3Bvc2VkQVBJLCBleHRlbnNpb25Jc0VuYWJsZWQsIGlzUmVzb2x2ZXJFeHRlbnNpb24gfSBmcm9tICcuLi9jb21tb24vYWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnlTbmFwc2hvdCB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHBhcnNlRXh0ZW5zaW9uRGV2T3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25EZXZPcHRpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RLaW5kLCBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZSwgSUV4dGVuc2lvbkhvc3RLaW5kUGlja2VyLCBleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nLCBleHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZVRvU3RyaW5nIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbkhvc3RLaW5kLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0TWFuYWdlciB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0TWFuYWdlcnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEV4aXRDb2RlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbkhvc3RQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiwgTG9jYWxQcm9jZXNzUnVubmluZ0xvY2F0aW9uLCBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25SdW5uaW5nTG9jYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlciwgZmlsdGVyRXh0ZW5zaW9uRGVzY3JpcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEV4dGVuc2lvbnMsIEV4dGVuc2lvbkhvc3RTdGFydHVwLCBJRXh0ZW5zaW9uSG9zdCwgSUV4dGVuc2lvblNlcnZpY2UsIFdlYldvcmtlckV4dEhvc3RDb25maWdWYWx1ZSwgdG9FeHRlbnNpb24sIHdlYldvcmtlckV4dEhvc3RDb25maWcgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUHJvcG9zZWRBcGkgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyLCBJUmVtb3RlRXh0ZW5zaW9uSG9zdEluaXREYXRhLCBSZW1vdGVFeHRlbnNpb25Ib3N0IH0gZnJvbSAnLi4vY29tbW9uL3JlbW90ZUV4dGVuc2lvbkhvc3QuanMnO1xuaW1wb3J0IHsgQ2FjaGVkRXh0ZW5zaW9uU2Nhbm5lciB9IGZyb20gJy4vY2FjaGVkRXh0ZW5zaW9uU2Nhbm5lci5qcyc7XG5pbXBvcnQgeyBJTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlciwgSUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3RJbml0RGF0YSwgTmF0aXZlTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdCB9IGZyb20gJy4vbG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdC5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFzeW5jSXRlcmFibGVFbWl0dGVyLCBBc3luY0l0ZXJhYmxlUHJvZHVjZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVFeHRlbnNpb25TZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlIGltcGxlbWVudHMgSUV4dGVuc2lvblNlcnZpY2Uge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNjYW5uZXI6IENhY2hlZEV4dGVuc2lvblNjYW5uZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsQ3Jhc2hUcmFja2VyID0gbmV3IEV4dGVuc2lvbkhvc3RDcmFzaFRyYWNrZXIoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSByZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9uYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVJlbW90ZUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNQcm9wb3NlZEFwaSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbnNQcm9wb3NlZEFwaSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2Nhbm5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENhY2hlZEV4dGVuc2lvblNjYW5uZXIpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkhvc3RGYWN0b3J5ID0gbmV3IE5hdGl2ZUV4dGVuc2lvbkhvc3RGYWN0b3J5KFxuXHRcdFx0ZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLFxuXHRcdFx0ZXh0ZW5zaW9uU2Nhbm5lcixcblx0XHRcdCgpID0+IHRoaXMuX2dldEV4dGVuc2lvblJlZ2lzdHJ5U25hcHNob3RXaGVuUmVhZHkoKSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0ZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0ZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHJlbW90ZUFnZW50U2VydmljZSxcblx0XHRcdHJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2Vcblx0XHQpO1xuXHRcdHN1cGVyKFxuXHRcdFx0eyBoYXNMb2NhbFByb2Nlc3M6IHRydWUsIGFsbG93UmVtb3RlRXh0ZW5zaW9uc0luTG9jYWxXZWJXb3JrZXI6IGZhbHNlIH0sXG5cdFx0XHRleHRlbnNpb25zUHJvcG9zZWRBcGksXG5cdFx0XHRleHRlbnNpb25Ib3N0RmFjdG9yeSxcblx0XHRcdG5ldyBOYXRpdmVFeHRlbnNpb25Ib3N0S2luZFBpY2tlcihlbnZpcm9ubWVudFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsb2dTZXJ2aWNlKSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRcdGVudmlyb25tZW50U2VydmljZSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdGNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHJlbW90ZUFnZW50U2VydmljZSxcblx0XHRcdHJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRcdGxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0XHRkaWFsb2dTZXJ2aWNlXG5cdFx0KTtcblxuXHRcdHRoaXMuX2V4dGVuc2lvblNjYW5uZXIgPSBleHRlbnNpb25TY2FubmVyO1xuXG5cdFx0Ly8gZGVsYXkgZXh0ZW5zaW9uIGhvc3QgY3JlYXRpb24gYW5kIGV4dGVuc2lvbiBzY2FubmluZ1xuXHRcdC8vIHVudGlsIHRoZSB3b3JrYmVuY2ggaXMgcnVubmluZy4gd2UgY2Fubm90IGRlZmVyIHRoZVxuXHRcdC8vIGV4dGVuc2lvbiBob3N0IG1vcmUgKExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKSBiZWNhdXNlXG5cdFx0Ly8gc29tZSBlZGl0b3JzIHJlcXVpcmUgdGhlIGV4dGVuc2lvbiBob3N0IHRvIHJlc3RvcmVcblx0XHQvLyBhbmQgdGhpcyB3b3VsZCByZXN1bHQgaW4gYSBkZWFkbG9ja1xuXHRcdC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDEzMjJcblx0XHRsaWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuUmVhZHkpLnRoZW4oKCkgPT4ge1xuXHRcdFx0Ly8gcmVzY2hlZHVsZSB0byBlbnN1cmUgdGhpcyBydW5zIGFmdGVyIHJlc3RvcmluZyB2aWV3bGV0cywgcGFuZWxzLCBhbmQgZWRpdG9yc1xuXHRcdFx0cnVuV2hlbldpbmRvd0lkbGUobWFpbldpbmRvdywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9pbml0aWFsaXplSWZOZWVkZWQoKTtcblx0XHRcdH0sIDUwIC8qbWF4IGRlbGF5Ki8pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2NhbkFsbExvY2FsRXh0ZW5zaW9ucygpOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvblNjYW5uZXIuc2Nhbm5lZEV4dGVuc2lvbnM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX29uRXh0ZW5zaW9uSG9zdENyYXNoZWQoZXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3RNYW5hZ2VyLCBjb2RlOiBudW1iZXIsIHNpZ25hbDogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXG5cdFx0Y29uc3QgYWN0aXZhdGVkRXh0ZW5zaW9uczogRXh0ZW5zaW9uSWRlbnRpZmllcltdID0gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1N0YXR1cyA9IHRoaXMuZ2V0RXh0ZW5zaW9uc1N0YXR1cygpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGV4dGVuc2lvbnNTdGF0dXMpKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25TdGF0dXMgPSBleHRlbnNpb25zU3RhdHVzW2tleV07XG5cdFx0XHRpZiAoZXh0ZW5zaW9uU3RhdHVzLmFjdGl2YXRpb25TdGFydGVkICYmIGV4dGVuc2lvbkhvc3QuY29udGFpbnNFeHRlbnNpb24oZXh0ZW5zaW9uU3RhdHVzLmlkKSkge1xuXHRcdFx0XHRhY3RpdmF0ZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uU3RhdHVzLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzdXBlci5fb25FeHRlbnNpb25Ib3N0Q3Jhc2hlZChleHRlbnNpb25Ib3N0LCBjb2RlLCBzaWduYWwpO1xuXG5cdFx0aWYgKGV4dGVuc2lvbkhvc3Qua2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzKSB7XG5cdFx0XHRpZiAoY29kZSA9PT0gRXh0ZW5zaW9uSG9zdEV4aXRDb2RlLlZlcnNpb25NaXNtYXRjaCkge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0XHRTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2V4dGVuc2lvblNlcnZpY2UudmVyc2lvbk1pc21hdGNoQ3Jhc2gnLCBcIkV4dGVuc2lvbiBob3N0IGNhbm5vdCBzdGFydDogdmVyc2lvbiBtaXNtYXRjaC5cIiksXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbGF1bmNoJywgXCJSZWxhdW5jaCBWUyBDb2RlXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0XHRcdFx0XHRcdFx0aG9zdFNlcnZpY2UucmVzdGFydCgpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZ0V4dGVuc2lvbkhvc3RDcmFzaChleHRlbnNpb25Ib3N0KTtcblx0XHRcdHRoaXMuX3NlbmRFeHRlbnNpb25Ib3N0Q3Jhc2hUZWxlbWV0cnkoY29kZSwgc2lnbmFsLCBhY3RpdmF0ZWRFeHRlbnNpb25zKTtcblxuXHRcdFx0dGhpcy5fbG9jYWxDcmFzaFRyYWNrZXIucmVnaXN0ZXJDcmFzaCgpO1xuXG5cdFx0XHRpZiAodGhpcy5fbG9jYWxDcmFzaFRyYWNrZXIuc2hvdWxkQXV0b21hdGljYWxseVJlc3RhcnQoKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEF1dG9tYXRpY2FsbHkgcmVzdGFydGluZyB0aGUgZXh0ZW5zaW9uIGhvc3QuYCk7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uuc3RhdHVzKG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uU2VydmljZS5hdXRvUmVzdGFydCcsIFwiVGhlIGV4dGVuc2lvbiBob3N0IHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5LiBSZXN0YXJ0aW5nLi4uXCIpLCB7IGhpZGVBZnRlcjogNTAwMCB9KTtcblx0XHRcdFx0dGhpcy5zdGFydEV4dGVuc2lvbkhvc3RzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjaG9pY2VzOiBJUHJvbXB0Q2hvaWNlW10gPSBbXTtcblx0XHRcdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0KSB7XG5cdFx0XHRcdFx0Y2hvaWNlcy5wdXNoKHtcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3N0YXJ0QmlzZWN0JywgXCJTdGFydCBFeHRlbnNpb24gQmlzZWN0XCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdleHRlbnNpb24uYmlzZWN0LnN0YXJ0Jyk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNob2ljZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdkZXZUb29scycsIFwiT3BlbiBEZXZlbG9wZXIgVG9vbHNcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLm9wZW5EZXZUb29scygpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjaG9pY2VzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3Jlc3RhcnQnLCBcIlJlc3RhcnQgRXh0ZW5zaW9uIEhvc3RcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnN0YXJ0RXh0ZW5zaW9uSG9zdHMoKVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQpIHtcblx0XHRcdFx0XHRjaG9pY2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbGVhcm5Nb3JlJywgXCJMZWFybiBNb3JlXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdFx0XHRvcGVuZXJTZXJ2aWNlLm9wZW4oJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1leHRlbnNpb24tYmlzZWN0Jyk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uU2VydmljZS5jcmFzaCcsIFwiRXh0ZW5zaW9uIGhvc3QgdGVybWluYXRlZCB1bmV4cGVjdGVkbHkgMyB0aW1lcyB3aXRoaW4gdGhlIGxhc3QgNSBtaW51dGVzLlwiKSwgY2hvaWNlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZEV4dGVuc2lvbkhvc3RDcmFzaFRlbGVtZXRyeShjb2RlOiBudW1iZXIsIHNpZ25hbDogc3RyaW5nIHwgbnVsbCwgYWN0aXZhdGVkRXh0ZW5zaW9uczogRXh0ZW5zaW9uSWRlbnRpZmllcltdKTogdm9pZCB7XG5cdFx0dHlwZSBFeHRlbnNpb25Ib3N0Q3Jhc2hDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYWxleGRpbWEnO1xuXHRcdFx0Y29tbWVudDogJ1RoZSBleHRlbnNpb24gaG9zdCBoYXMgdGVybWluYXRlZCB1bmV4cGVjdGVkbHknO1xuXHRcdFx0Y29kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBleGl0IGNvZGUgb2YgdGhlIGV4dGVuc2lvbiBob3N0IHByb2Nlc3MuJyB9O1xuXHRcdFx0c2lnbmFsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHNpZ25hbCB0aGF0IGNhdXNlZCB0aGUgZXh0ZW5zaW9uIGhvc3QgcHJvY2VzcyB0byBleGl0LicgfTtcblx0XHRcdGV4dGVuc2lvbklkczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBsaXN0IG9mIGxvYWRlZCBleHRlbnNpb25zLicgfTtcblx0XHR9O1xuXHRcdHR5cGUgRXh0ZW5zaW9uSG9zdENyYXNoRXZlbnQgPSB7XG5cdFx0XHRjb2RlOiBudW1iZXI7XG5cdFx0XHRzaWduYWw6IHN0cmluZyB8IG51bGw7XG5cdFx0XHRleHRlbnNpb25JZHM6IHN0cmluZ1tdO1xuXHRcdH07XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV4dGVuc2lvbkhvc3RDcmFzaEV2ZW50LCBFeHRlbnNpb25Ib3N0Q3Jhc2hDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbkhvc3RDcmFzaCcsIHtcblx0XHRcdGNvZGUsXG5cdFx0XHRzaWduYWwsXG5cdFx0XHRleHRlbnNpb25JZHM6IGFjdGl2YXRlZEV4dGVuc2lvbnMubWFwKGUgPT4gZS52YWx1ZSlcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uSWQgb2YgYWN0aXZhdGVkRXh0ZW5zaW9ucykge1xuXHRcdFx0dHlwZSBFeHRlbnNpb25Ib3N0Q3Jhc2hFeHRlbnNpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdhbGV4ZGltYSc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdUaGUgZXh0ZW5zaW9uIGhvc3QgaGFzIHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5Jztcblx0XHRcdFx0Y29kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBleGl0IGNvZGUgb2YgdGhlIGV4dGVuc2lvbiBob3N0IHByb2Nlc3MuJyB9O1xuXHRcdFx0XHRzaWduYWw6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgc2lnbmFsIHRoYXQgY2F1c2VkIHRoZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzIHRvIGV4aXQuJyB9O1xuXHRcdFx0XHRleHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBleHRlbnNpb24uJyB9O1xuXHRcdFx0fTtcblx0XHRcdHR5cGUgRXh0ZW5zaW9uSG9zdENyYXNoRXh0ZW5zaW9uRXZlbnQgPSB7XG5cdFx0XHRcdGNvZGU6IG51bWJlcjtcblx0XHRcdFx0c2lnbmFsOiBzdHJpbmcgfCBudWxsO1xuXHRcdFx0XHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFeHRlbnNpb25Ib3N0Q3Jhc2hFeHRlbnNpb25FdmVudCwgRXh0ZW5zaW9uSG9zdENyYXNoRXh0ZW5zaW9uQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Ib3N0Q3Jhc2hFeHRlbnNpb24nLCB7XG5cdFx0XHRcdGNvZGUsXG5cdFx0XHRcdHNpZ25hbCxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbklkLnZhbHVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gaW1wbFxuXG5cdHByb3RlY3RlZCBhc3luYyBfcmVzb2x2ZUF1dGhvcml0eShyZW1vdGVBdXRob3JpdHk6IHN0cmluZyk6IFByb21pc2U8UmVzb2x2ZXJSZXN1bHQ+IHtcblxuXHRcdGNvbnN0IGF1dGhvcml0eVBsdXNJbmRleCA9IHJlbW90ZUF1dGhvcml0eS5pbmRleE9mKCcrJyk7XG5cdFx0aWYgKGF1dGhvcml0eVBsdXNJbmRleCA9PT0gLTEpIHtcblx0XHRcdC8vIFRoaXMgYXV0aG9yaXR5IGRvZXMgbm90IG5lZWQgdG8gYmUgcmVzb2x2ZWQsIHNpbXBseSBwYXJzZSB0aGUgcG9ydCBudW1iZXJcblx0XHRcdGNvbnN0IHsgaG9zdCwgcG9ydCB9ID0gcGFyc2VBdXRob3JpdHlXaXRoUG9ydChyZW1vdGVBdXRob3JpdHkpO1xuXG5cdFx0XHQvLyBBIGRpcmVjdCBgPGhvc3Q+Ojxwb3J0PmAgYXV0aG9yaXR5IGJ5cGFzc2VzIHJlc29sdmVyIGV4dGVuc2lvbnMgYW5kIGNvbm5lY3RzXG5cdFx0XHQvLyBzdHJhaWdodCB0byB0aGUgZ2l2ZW4gc2VydmVyLiBUaGlzIGZvcm0gY2FuIG9yaWdpbmF0ZSBmcm9tIHVudHJ1c3RlZCBzb3VyY2VzXG5cdFx0XHQvLyAoZS5nLiB0aGUgYHJlbW90ZUF1dGhvcml0eWAgb2YgYSBgLmNvZGUtd29ya3NwYWNlYCBmaWxlKSwgc28gYmVmb3JlIGNvbm5lY3Rpbmdcblx0XHRcdC8vIHRvIGFueXRoaW5nIHRoYXQgaXMgbm90IHRoZSBsb2NhbCBsb29wYmFjayBpbnRlcmZhY2Ugd2UgYXNrIHRoZSB1c2VyIHRvIGNvbmZpcm0uXG5cdFx0XHQvLyBUaGlzIHByZXZlbnRzIGEgY3JhZnRlZCB3b3Jrc3BhY2UgZnJvbSBzaWxlbnRseSBwb2ludGluZyB0aGUgd2luZG93J3MgYmFja2VuZCBhdFxuXHRcdFx0Ly8gYW4gYXR0YWNrZXIgY29udHJvbGxlZCBzZXJ2ZXIuXG5cdFx0XHRpZiAoIWlzTG9vcGJhY2tIb3N0KGhvc3QpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpcm1EaXJlY3RSZW1vdGVDb25uZWN0aW9uKGhvc3QsIHBvcnQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhdXRob3JpdHk6IHtcblx0XHRcdFx0XHRhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHRjb25uZWN0VG86IHtcblx0XHRcdFx0XHRcdHR5cGU6IFJlbW90ZUNvbm5lY3Rpb25UeXBlLldlYlNvY2tldCxcblx0XHRcdFx0XHRcdGhvc3QsXG5cdFx0XHRcdFx0XHRwb3J0XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjb25uZWN0aW9uVG9rZW46IHVuZGVmaW5lZFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlQXV0aG9yaXR5T25FeHRlbnNpb25Ib3N0cyhFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3MsIHJlbW90ZUF1dGhvcml0eSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb25maXJtRGlyZWN0UmVtb3RlQ29ubmVjdGlvbihob3N0OiBzdHJpbmcsIHBvcnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgncmVtb3RlQ29ubmVjdGlvbkNvbmZpcm0nLCBcIkFsbG93IGNvbm5lY3RpbmcgdG8gdGhlIHJlbW90ZSBzZXJ2ZXIgJ3swfTp7MX0nP1wiLCBob3N0LCBwb3J0KSxcblx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdyZW1vdGVDb25uZWN0aW9uQ29uZmlybURldGFpbCcsIFwiQ29kZSBpcyBhYm91dCB0byBjb25uZWN0IHRvICd7MH06ezF9JyB0byBob3N0IGEgcmVtb3RlIGV4dGVuc2lvbiBob3N0LiBPbmx5IGNvbnRpbnVlIGlmIHlvdSB0cnVzdCB0aGlzIHNlcnZlciwgYXMgaXQgd2lsbCBiZSBhYmxlIHRvIHJ1biBjb2RlIGFuZCBhY2Nlc3MgZmlsZXMgb24geW91ciBiZWhhbGYuXCIsIGhvc3QsIHBvcnQpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKCdyZW1vdGVDb25uZWN0aW9uQ29uZmlybUJ1dHRvbicsIFwiQ29ubmVjdFwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHRocm93IG5ldyBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yKFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3JlbW90ZUNvbm5lY3Rpb25SZWplY3RlZCcsIFwiQ29ubmVjdGlvbiB0byAnezB9OnsxfScgd2FzIG5vdCBhbGxvd2VkLlwiLCBob3N0LCBwb3J0KSxcblx0XHRcdFx0UmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUuTm90QXZhaWxhYmxlXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldENhbm9uaWNhbFVSSShyZW1vdGVBdXRob3JpdHk6IHN0cmluZywgdXJpOiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXG5cdFx0Y29uc3QgYXV0aG9yaXR5UGx1c0luZGV4ID0gcmVtb3RlQXV0aG9yaXR5LmluZGV4T2YoJysnKTtcblx0XHRpZiAoYXV0aG9yaXR5UGx1c0luZGV4ID09PSAtMSkge1xuXHRcdFx0Ly8gVGhpcyBhdXRob3JpdHkgZG9lcyBub3QgdXNlIGEgcmVzb2x2ZXJcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdHMgPSB0aGlzLl9nZXRFeHRlbnNpb25Ib3N0TWFuYWdlcnMoRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzKTtcblx0XHRpZiAobG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBubyBsb2NhbCBwcm9jZXNzIGV4dGVuc2lvbiBob3N0c1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVzb2x2ZSBjYW5vbmljYWwgVVJJYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKGxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3RzLm1hcChleHRIb3N0ID0+IGV4dEhvc3QuZ2V0Q2Fub25pY2FsVVJJKHJlbW90ZUF1dGhvcml0eSwgdXJpKSkpO1xuXG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgcmVzdWx0cykge1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHdlIGNhbiBvbmx5IHJlYWNoIHRoaXMgaWYgdGhlcmUgd2FzIG5vIHJlc29sdmVyIGV4dGVuc2lvbiB0aGF0IGNhbiByZXR1cm4gdGhlIGNhbm5vbmljYWwgdXJpXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZ2V0IGNhbm9uaWNhbCBVUkkgYmVjYXVzZSBubyBleHRlbnNpb24gaXMgaW5zdGFsbGVkIHRvIHJlc29sdmUgJHtnZXRSZW1vdGVBdXRob3JpdHlQcmVmaXgocmVtb3RlQXV0aG9yaXR5KX1gKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVzb2x2ZUV4dGVuc2lvbnMoKTogQXN5bmNJdGVyYWJsZTxSZXNvbHZlZEV4dGVuc2lvbnM+IHtcblx0XHRyZXR1cm4gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcihlbWl0dGVyID0+IHRoaXMuX2RvUmVzb2x2ZUV4dGVuc2lvbnMoZW1pdHRlcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9SZXNvbHZlRXh0ZW5zaW9ucyhlbWl0dGVyOiBBc3luY0l0ZXJhYmxlRW1pdHRlcjxSZXNvbHZlZEV4dGVuc2lvbnM+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fZXh0ZW5zaW9uU2Nhbm5lci5zdGFydFNjYW5uaW5nRXh0ZW5zaW9ucygpO1xuXG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblxuXHRcdGxldCByZW1vdGVFbnY6IElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IHJlbW90ZUV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW107XG5cblx0XHRpZiAocmVtb3RlQXV0aG9yaXR5KSB7XG5cblx0XHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fc2V0Q2Fub25pY2FsVVJJUHJvdmlkZXIoYXN5bmMgKHVyaSkgPT4ge1xuXHRcdFx0XHRpZiAodXJpLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVSZW1vdGUgfHwgdXJpLmF1dGhvcml0eSAhPT0gcmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdFx0Ly8gVGhlIGN1cnJlbnQgcmVtb3RlIGF1dGhvcml0eSByZXNvbHZlciBjYW5ub3QgZ2l2ZSB0aGUgY2Fub25pY2FsIFVSSSBmb3IgdGhpcyBVUklcblx0XHRcdFx0XHRyZXR1cm4gdXJpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvd2lsbEdldENhbm9uaWNhbFVSSS8ke2dldFJlbW90ZUF1dGhvcml0eVByZWZpeChyZW1vdGVBdXRob3JpdHkpfWApO1xuXHRcdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgSW52b2tpbmcgZ2V0Q2Fub25pY2FsVVJJIGZvciBhdXRob3JpdHkgJHtnZXRSZW1vdGVBdXRob3JpdHlQcmVmaXgocmVtb3RlQXV0aG9yaXR5KX0uLi5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9nZXRDYW5vbmljYWxVUkkocmVtb3RlQXV0aG9yaXR5LCB1cmkpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZGlkR2V0Q2Fub25pY2FsVVJJLyR7Z2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4KHJlbW90ZUF1dGhvcml0eSl9YCk7XG5cdFx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgZ2V0Q2Fub25pY2FsVVJJIHJldHVybmVkIGZvciBhdXRob3JpdHkgJHtnZXRSZW1vdGVBdXRob3JpdHlQcmVmaXgocmVtb3RlQXV0aG9yaXR5KX0uYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBTdGFydGluZyB0byB3YWl0IG9uIElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLndvcmtzcGFjZVJlc29sdmVkLi4uYCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5vdyB0aGF0IHRoZSBjYW5vbmljYWwgVVJJIHByb3ZpZGVyIGhhcyBiZWVuIHJlZ2lzdGVyZWQsIHdlIG5lZWQgdG8gd2FpdCBmb3IgdGhlIHRydXN0IHN0YXRlIHRvIGJlXG5cdFx0XHQvLyBjYWxjdWxhdGVkLiBUaGUgdHJ1c3Qgc3RhdGUgd2lsbCBiZSB1c2VkIHdoaWxlIHJlc29sdmluZyB0aGUgYXV0aG9yaXR5LCBob3dldmVyIHRoZSByZXNvbHZlciBjYW5cblx0XHRcdC8vIG92ZXJyaWRlIHRoZSB0cnVzdCBzdGF0ZSB0aHJvdWdoIHRoZSByZXNvbHZlciByZXN1bHQuXG5cdFx0XHRhd2FpdCB0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLndvcmtzcGFjZVJlc29sdmVkO1xuXG5cdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEZpbmlzaGVkIHdhaXRpbmcgb24gSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlUmVzb2x2ZWQuYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuX3NjYW5BbGxMb2NhbEV4dGVuc2lvbnMoKTtcblx0XHRcdGNvbnN0IHJlc29sdmVyRXh0ZW5zaW9ucyA9IGxvY2FsRXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+IGlzUmVzb2x2ZXJFeHRlbnNpb24oZXh0ZW5zaW9uKSk7XG5cdFx0XHRpZiAocmVzb2x2ZXJFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUobmV3IFJlc29sdmVyRXh0ZW5zaW9ucyhyZXNvbHZlckV4dGVuc2lvbnMpKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHJlc29sdmVyUmVzdWx0OiBSZXNvbHZlclJlc3VsdDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlc29sdmVyUmVzdWx0ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUF1dGhvcml0eUluaXRpYWwocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvci5pc05vUmVzb2x2ZXJGb3VuZChlcnIpKSB7XG5cdFx0XHRcdFx0ZXJyLmlzSGFuZGxlZCA9IGF3YWl0IHRoaXMuX2hhbmRsZU5vUmVzb2x2ZXJGb3VuZChyZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLmlzSGFuZGxlZChlcnIpKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhgRXJyb3IgaGFuZGxlZDogTm90IHNob3dpbmcgYSBub3RpZmljYXRpb24gZm9yIHRoZSBlcnJvcmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuX3NldFJlc29sdmVkQXV0aG9yaXR5RXJyb3IocmVtb3RlQXV0aG9yaXR5LCBlcnIpO1xuXG5cdFx0XHRcdC8vIFByb2NlZWQgd2l0aCB0aGUgbG9jYWwgZXh0ZW5zaW9uIGhvc3Rcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3N0YXJ0TG9jYWxFeHRlbnNpb25Ib3N0KGVtaXR0ZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzZXQgdGhlIHJlc29sdmVkIGF1dGhvcml0eVxuXHRcdFx0dGhpcy5fcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLl9zZXRSZXNvbHZlZEF1dGhvcml0eShyZXNvbHZlclJlc3VsdC5hdXRob3JpdHksIHJlc29sdmVyUmVzdWx0Lm9wdGlvbnMpO1xuXHRcdFx0dGhpcy5fcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnNldFR1bm5lbEluZm9ybWF0aW9uKHJlc29sdmVyUmVzdWx0LnR1bm5lbEluZm9ybWF0aW9uKTtcblxuXHRcdFx0Ly8gbW9uaXRvciBmb3IgYnJlYWthZ2Vcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoY29ubmVjdGlvbi5vbkRpZFN0YXRlQ2hhbmdlKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUudHlwZSA9PT0gUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuQ29ubmVjdGlvbkxvc3QpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fY2xlYXJSZXNvbHZlZEF1dGhvcml0eShyZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihjb25uZWN0aW9uLm9uUmVjb25uZWN0aW5nKCgpID0+IHRoaXMuX3Jlc29sdmVBdXRob3JpdHlBZ2FpbigpKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZldGNoIHRoZSByZW1vdGUgZW52aXJvbm1lbnRcblx0XHRcdFtyZW1vdGVFbnYsIHJlbW90ZUV4dGVuc2lvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKSxcblx0XHRcdFx0dGhpcy5fcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeHRlbnNpb25zKClcblx0XHRcdF0pO1xuXG5cdFx0XHRpZiAoIXJlbW90ZUVudikge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7IHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogbmxzLmxvY2FsaXplKCdnZXRFbnZpcm9ubWVudEZhaWx1cmUnLCBcIkNvdWxkIG5vdCBmZXRjaCByZW1vdGUgZW52aXJvbm1lbnRcIikgfSk7XG5cdFx0XHRcdC8vIFByb2NlZWQgd2l0aCB0aGUgbG9jYWwgZXh0ZW5zaW9uIGhvc3Rcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3N0YXJ0TG9jYWxFeHRlbnNpb25Ib3N0KGVtaXR0ZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1c2VIb3N0UHJveHlEZWZhdWx0ID0gcmVtb3RlRW52LnVzZUhvc3RQcm94eTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24nKSkge1xuXHRcdFx0XHRcdHVwZGF0ZVByb3h5Q29uZmlndXJhdGlvbnNTY29wZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbicpLCB1c2VIb3N0UHJveHlEZWZhdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dXBkYXRlUHJveHlDb25maWd1cmF0aW9uc1Njb3BlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdodHRwLnVzZUxvY2FsUHJveHlDb25maWd1cmF0aW9uJyksIHVzZUhvc3RQcm94eURlZmF1bHQpO1xuXHRcdH0gZWxzZSB7XG5cblx0XHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fc2V0Q2Fub25pY2FsVVJJUHJvdmlkZXIoYXN5bmMgKHVyaSkgPT4gdXJpKTtcblxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zdGFydExvY2FsRXh0ZW5zaW9uSG9zdChlbWl0dGVyLCByZW1vdGVFeHRlbnNpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N0YXJ0TG9jYWxFeHRlbnNpb25Ib3N0KGVtaXR0ZXI6IEFzeW5jSXRlcmFibGVFbWl0dGVyPFJlc29sdmVkRXh0ZW5zaW9ucz4sIHJlbW90ZUV4dGVuc2lvbnM6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdID0gW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBFbnN1cmUgdGhhdCB0aGUgd29ya3NwYWNlIHRydXN0IHN0YXRlIGhhcyBiZWVuIGZ1bGx5IGluaXRpYWxpemVkIHNvXG5cdFx0Ly8gdGhhdCB0aGUgZXh0ZW5zaW9uIGhvc3QgY2FuIHN0YXJ0IHdpdGggdGhlIGNvcnJlY3Qgc2V0IG9mIGV4dGVuc2lvbnMuXG5cdFx0YXdhaXQgdGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkO1xuXG5cdFx0aWYgKHJlbW90ZUV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRlbWl0dGVyLmVtaXRPbmUobmV3IFJlbW90ZUV4dGVuc2lvbnMocmVtb3RlRXh0ZW5zaW9ucykpO1xuXHRcdH1cblxuXHRcdGVtaXR0ZXIuZW1pdE9uZShuZXcgTG9jYWxFeHRlbnNpb25zKGF3YWl0IHRoaXMuX3NjYW5BbGxMb2NhbEV4dGVuc2lvbnMoKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9vbkV4dGVuc2lvbkhvc3RFeGl0KGNvZGU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIERpc3Bvc2UgZXZlcnl0aGluZyBhc3NvY2lhdGVkIHdpdGggdGhlIGV4dGVuc2lvbiBob3N0XG5cdFx0YXdhaXQgdGhpcy5fZG9TdG9wRXh0ZW5zaW9uSG9zdHMoKTtcblxuXHRcdC8vIERpc3Bvc2UgdGhlIG1hbmFnZW1lbnQgY29ubmVjdGlvbiB0byBhdm9pZCByZWNvbm5lY3RpbmcgYWZ0ZXIgdGhlIGV4dGVuc2lvbiBob3N0IGV4aXRzXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0Y29ubmVjdGlvbj8uZGlzcG9zZSgpO1xuXG5cdFx0aWYgKHBhcnNlRXh0ZW5zaW9uRGV2T3B0aW9ucyh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UpLmlzRXh0ZW5zaW9uRGV2VGVzdEZyb21DbGkpIHtcblx0XHRcdC8vIFdoZW4gQ0xJIHRlc3RpbmcgbWFrZSBzdXJlIHRvIGV4aXQgd2l0aCBwcm9wZXIgZXhpdCBjb2RlXG5cdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEFza2luZyBuYXRpdmUgaG9zdCBzZXJ2aWNlIHRvIGV4aXQgd2l0aCBjb2RlICR7Y29kZX0uYCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9uYXRpdmVIb3N0U2VydmljZS5leGl0KGNvZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBFeHBlY3RlZCBkZXZlbG9wbWVudCBleHRlbnNpb24gdGVybWluYXRpb246IFdoZW4gdGhlIGV4dGVuc2lvbiBob3N0IGdvZXMgZG93biB3ZSBhbHNvIHNodXRkb3duIHRoZSB3aW5kb3dcblx0XHRcdHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLmNsb3NlV2luZG93KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlTm9SZXNvbHZlckZvdW5kKHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVtb3RlTmFtZSA9IGdldFJlbW90ZU5hbWUocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbiA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvblRpcHM/LltyZW1vdGVOYW1lXTtcblx0XHRpZiAoIXJlY29tbWVuZGF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZXJFeHRlbnNpb25JZCA9IHJlY29tbWVuZGF0aW9uLmV4dGVuc2lvbklkO1xuXHRcdGNvbnN0IGFsbEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLl9zY2FuQWxsTG9jYWxFeHRlbnNpb25zKCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYWxsRXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiBlLmlkZW50aWZpZXIudmFsdWUgPT09IHJlc29sdmVyRXh0ZW5zaW9uSWQpWzBdO1xuXHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdGlmICghZXh0ZW5zaW9uSXNFbmFibGVkKHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBleHRlbnNpb24sIGZhbHNlKSkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdlbmFibGVSZXNvbHZlcicsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIHJlcXVpcmVkIHRvIG9wZW4gdGhlIHJlbW90ZSB3aW5kb3cuXFxuT0sgdG8gZW5hYmxlP1wiLCByZWNvbW1lbmRhdGlvbi5mcmllbmRseU5hbWUpO1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5JbmZvLCBtZXNzYWdlLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdlbmFibGUnLCAnRW5hYmxlIGFuZCBSZWxvYWQnKSxcblx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5zZXRFbmFibGVtZW50KFt0b0V4dGVuc2lvbihleHRlbnNpb24pXSwgRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2hvc3RTZXJ2aWNlLnJlbG9hZCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdFx0XHRcdHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5VUkdFTlRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEluc3RhbGwgdGhlIEV4dGVuc2lvbiBhbmQgcmVsb2FkIHRoZSB3aW5kb3cgdG8gaGFuZGxlLlxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnaW5zdGFsbFJlc29sdmVyJywgXCJFeHRlbnNpb24gJ3swfScgaXMgcmVxdWlyZWQgdG8gb3BlbiB0aGUgcmVtb3RlIHdpbmRvdy5cXG5EbyB5b3Ugd2FudCB0byBpbnN0YWxsIHRoZSBleHRlbnNpb24/XCIsIHJlY29tbWVuZGF0aW9uLmZyaWVuZGx5TmFtZSk7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5JbmZvLCBtZXNzYWdlLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2luc3RhbGwnLCAnSW5zdGFsbCBhbmQgUmVsb2FkJyksXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBbZ2FsbGVyeUV4dGVuc2lvbl0gPSBhd2FpdCB0aGlzLl9leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiByZXNvbHZlckV4dGVuc2lvbklkIH1dLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRcdGlmIChnYWxsZXJ5RXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5RXh0ZW5zaW9uKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5faG9zdFNlcnZpY2UucmVsb2FkKCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgncmVzb2x2ZXJFeHRlbnNpb25Ob3RGb3VuZCcsIFwiYHswfWAgbm90IGZvdW5kIG9uIG1hcmtldHBsYWNlXCIpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVCxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBOYXRpdmVFeHRlbnNpb25Ib3N0RmFjdG9yeSBpbXBsZW1lbnRzIElFeHRlbnNpb25Ib3N0RmFjdG9yeSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQ6IExvY2FsV2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpOiBFeHRlbnNpb25zUHJvcG9zZWRBcGksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2Nhbm5lcjogQ2FjaGVkRXh0ZW5zaW9uU2Nhbm5lcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRFeHRlbnNpb25SZWdpc3RyeVNuYXBzaG90V2hlblJlYWR5OiAoKSA9PiBQcm9taXNlPEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnlTbmFwc2hvdD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl93ZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudCA9IGRldGVybWluZUxvY2FsV2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQoZW52aXJvbm1lbnRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlRXh0ZW5zaW9uSG9zdChydW5uaW5nTG9jYXRpb25zOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLCBydW5uaW5nTG9jYXRpb246IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbiwgaXNJbml0aWFsU3RhcnQ6IGJvb2xlYW4pOiBJRXh0ZW5zaW9uSG9zdCB8IG51bGwge1xuXHRcdHN3aXRjaCAocnVubmluZ0xvY2F0aW9uLmtpbmQpIHtcblx0XHRcdGNhc2UgRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzOiB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0dXAgPSAoXG5cdFx0XHRcdFx0aXNJbml0aWFsU3RhcnRcblx0XHRcdFx0XHRcdD8gRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJNYW51YWxTdGFydFxuXHRcdFx0XHRcdFx0OiBFeHRlbnNpb25Ib3N0U3RhcnR1cC5FYWdlckF1dG9TdGFydFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmF0aXZlTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdCwgcnVubmluZ0xvY2F0aW9uLCBzdGFydHVwLCB0aGlzLl9jcmVhdGVMb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyKHJ1bm5pbmdMb2NhdGlvbnMsIGlzSW5pdGlhbFN0YXJ0LCBydW5uaW5nTG9jYXRpb24pKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxXZWJXb3JrZXI6IHtcblx0XHRcdFx0aWYgKHRoaXMuX3dlYldvcmtlckV4dEhvc3RFbmFibGVtZW50ICE9PSBMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50LkRpc2FibGVkKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnR1cCA9IHRoaXMuX3dlYldvcmtlckV4dEhvc3RFbmFibGVtZW50ID09PSBMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50LkxhenkgPyBFeHRlbnNpb25Ib3N0U3RhcnR1cC5MYXp5QXV0b1N0YXJ0IDogRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJNYW51YWxTdGFydDtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV2ViV29ya2VyRXh0ZW5zaW9uSG9zdCwgcnVubmluZ0xvY2F0aW9uLCBzdGFydHVwLCB0aGlzLl9jcmVhdGVXZWJXb3JrZXJFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyKHJ1bm5pbmdMb2NhdGlvbnMsIHJ1bm5pbmdMb2NhdGlvbikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGU6IHtcblx0XHRcdFx0Y29uc3QgcmVtb3RlQWdlbnRDb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRcdFx0aWYgKHJlbW90ZUFnZW50Q29ubmVjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVFeHRlbnNpb25Ib3N0LCBydW5uaW5nTG9jYXRpb24sIHRoaXMuX2NyZWF0ZVJlbW90ZUV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIocnVubmluZ0xvY2F0aW9ucywgcmVtb3RlQWdlbnRDb25uZWN0aW9uLnJlbW90ZUF1dGhvcml0eSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUxvY2FsUHJvY2Vzc0V4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIocnVubmluZ0xvY2F0aW9uczogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlciwgaXNJbml0aWFsU3RhcnQ6IGJvb2xlYW4sIGRlc2lyZWRSdW5uaW5nTG9jYXRpb246IExvY2FsUHJvY2Vzc1J1bm5pbmdMb2NhdGlvbik6IElMb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0SW5pdERhdGE6IGFzeW5jICgpOiBQcm9taXNlPElMb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0SW5pdERhdGE+ID0+IHtcblx0XHRcdFx0aWYgKGlzSW5pdGlhbFN0YXJ0KSB7XG5cdFx0XHRcdFx0Ly8gSGVyZSB3ZSBsb2FkIGV2ZW4gZXh0ZW5zaW9ucyB0aGF0IHdvdWxkIGJlIGRpc2FibGVkIGJ5IHdvcmtzcGFjZSB0cnVzdFxuXHRcdFx0XHRcdGNvbnN0IHNjYW5uZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2Nhbm5lci5zY2FubmVkRXh0ZW5zaW9ucztcblx0XHRcdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBOYXRpdmVFeHRlbnNpb25Ib3N0RmFjdG9yeS5fY3JlYXRlTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlci5zY2FubmVkRXh0ZW5zaW9uczogJHtzY2FubmVkRXh0ZW5zaW9ucy5tYXAoZXh0ID0+IGV4dC5pZGVudGlmaWVyLnZhbHVlKS5qb2luKCcsJyl9YCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gY2hlY2tFbmFibGVkQW5kUHJvcG9zZWRBUEkodGhpcy5fbG9nU2VydmljZSwgdGhpcy5fZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIHRoaXMuX2V4dGVuc2lvbnNQcm9wb3NlZEFwaSwgc2Nhbm5lZEV4dGVuc2lvbnMsIC8qIGlnbm9yZSB3b3Jrc3BhY2UgdHJ1c3QgKi90cnVlKTtcblx0XHRcdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBOYXRpdmVFeHRlbnNpb25Ib3N0RmFjdG9yeS5fY3JlYXRlTG9jYWxQcm9jZXNzRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlci5sb2NhbEV4dGVuc2lvbnM6ICR7bG9jYWxFeHRlbnNpb25zLm1hcChleHQgPT4gZXh0LmlkZW50aWZpZXIudmFsdWUpLmpvaW4oJywnKX1gKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBydW5uaW5nTG9jYXRpb24gPSBydW5uaW5nTG9jYXRpb25zLmNvbXB1dGVSdW5uaW5nTG9jYXRpb24obG9jYWxFeHRlbnNpb25zLCBbXSwgZmFsc2UpO1xuXHRcdFx0XHRcdGNvbnN0IG15RXh0ZW5zaW9ucyA9IGZpbHRlckV4dGVuc2lvbkRlc2NyaXB0aW9ucyhsb2NhbEV4dGVuc2lvbnMsIHJ1bm5pbmdMb2NhdGlvbiwgZXh0UnVubmluZ0xvY2F0aW9uID0+IGRlc2lyZWRSdW5uaW5nTG9jYXRpb24uZXF1YWxzKGV4dFJ1bm5pbmdMb2NhdGlvbikpO1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBuZXcgRXh0ZW5zaW9uSG9zdEV4dGVuc2lvbnMoMCwgbG9jYWxFeHRlbnNpb25zLCBteUV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYE5hdGl2ZUV4dGVuc2lvbkhvc3RGYWN0b3J5Ll9jcmVhdGVMb2NhbFByb2Nlc3NFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyLm15RXh0ZW5zaW9uczogJHtteUV4dGVuc2lvbnMubWFwKGV4dCA9PiBleHQuaWRlbnRpZmllci52YWx1ZSkuam9pbignLCcpfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyBleHRlbnNpb25zIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gcmVzdGFydCBjYXNlXG5cdFx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCB0aGlzLl9nZXRFeHRlbnNpb25SZWdpc3RyeVNuYXBzaG90V2hlblJlYWR5KCk7XG5cdFx0XHRcdFx0Y29uc3QgbXlFeHRlbnNpb25zID0gcnVubmluZ0xvY2F0aW9ucy5maWx0ZXJCeVJ1bm5pbmdMb2NhdGlvbihzbmFwc2hvdC5leHRlbnNpb25zLCBkZXNpcmVkUnVubmluZ0xvY2F0aW9uKTtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gbmV3IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zKHNuYXBzaG90LnZlcnNpb25JZCwgc25hcHNob3QuZXh0ZW5zaW9ucywgbXlFeHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblx0XHRcdFx0XHRyZXR1cm4geyBleHRlbnNpb25zIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlV2ViV29ya2VyRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlcihydW5uaW5nTG9jYXRpb25zOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLCBkZXNpcmVkUnVubmluZ0xvY2F0aW9uOiBMb2NhbFdlYldvcmtlclJ1bm5pbmdMb2NhdGlvbik6IElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0SW5pdERhdGE6IGFzeW5jICgpOiBQcm9taXNlPElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0SW5pdERhdGE+ID0+IHtcblx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCB0aGlzLl9nZXRFeHRlbnNpb25SZWdpc3RyeVNuYXBzaG90V2hlblJlYWR5KCk7XG5cdFx0XHRcdGNvbnN0IG15RXh0ZW5zaW9ucyA9IHJ1bm5pbmdMb2NhdGlvbnMuZmlsdGVyQnlSdW5uaW5nTG9jYXRpb24oc25hcHNob3QuZXh0ZW5zaW9ucywgZGVzaXJlZFJ1bm5pbmdMb2NhdGlvbik7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBuZXcgRXh0ZW5zaW9uSG9zdEV4dGVuc2lvbnMoc25hcHNob3QudmVyc2lvbklkLCBzbmFwc2hvdC5leHRlbnNpb25zLCBteUV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRyZXR1cm4geyBleHRlbnNpb25zIH07XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVJlbW90ZUV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIocnVubmluZ0xvY2F0aW9uczogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlciwgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpOiBJUmVtb3RlRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0Z2V0SW5pdERhdGE6IGFzeW5jICgpOiBQcm9taXNlPElSZW1vdGVFeHRlbnNpb25Ib3N0SW5pdERhdGE+ID0+IHtcblx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCB0aGlzLl9nZXRFeHRlbnNpb25SZWdpc3RyeVNuYXBzaG90V2hlblJlYWR5KCk7XG5cblx0XHRcdFx0Y29uc3QgcmVtb3RlRW52ID0gYXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCk7XG5cdFx0XHRcdGlmICghcmVtb3RlRW52KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcHJvdmlkZSBpbml0IGRhdGEgZm9yIHJlbW90ZSBleHRlbnNpb24gaG9zdCEnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG15RXh0ZW5zaW9ucyA9IHJ1bm5pbmdMb2NhdGlvbnMuZmlsdGVyQnlFeHRlbnNpb25Ib3N0S2luZChzbmFwc2hvdC5leHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGUpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gbmV3IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zKHNuYXBzaG90LnZlcnNpb25JZCwgc25hcHNob3QuZXh0ZW5zaW9ucywgbXlFeHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbm5lY3Rpb25EYXRhOiB0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuZ2V0Q29ubmVjdGlvbkRhdGEocmVtb3RlQXV0aG9yaXR5KSxcblx0XHRcdFx0XHRwaWQ6IHJlbW90ZUVudi5waWQsXG5cdFx0XHRcdFx0YXBwUm9vdDogcmVtb3RlRW52LmFwcFJvb3QsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdExvZ3NQYXRoOiByZW1vdGVFbnYuZXh0ZW5zaW9uSG9zdExvZ3NQYXRoLFxuXHRcdFx0XHRcdGdsb2JhbFN0b3JhZ2VIb21lOiByZW1vdGVFbnYuZ2xvYmFsU3RvcmFnZUhvbWUsXG5cdFx0XHRcdFx0d29ya3NwYWNlU3RvcmFnZUhvbWU6IHJlbW90ZUVudi53b3Jrc3BhY2VTdG9yYWdlSG9tZSxcblx0XHRcdFx0XHRleHRlbnNpb25zLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gZGV0ZXJtaW5lTG9jYWxXZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudChlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50IHtcblx0aWYgKGVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50ICYmIGVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25EZXZlbG9wbWVudEtpbmQ/LnNvbWUoayA9PiBrID09PSAnd2ViJykpIHtcblx0XHRyZXR1cm4gTG9jYWxXZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudC5FYWdlcjtcblx0fSBlbHNlIHtcblx0XHRjb25zdCBjb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxXZWJXb3JrZXJFeHRIb3N0Q29uZmlnVmFsdWU+KHdlYldvcmtlckV4dEhvc3RDb25maWcpO1xuXHRcdGlmIChjb25maWcgPT09IHRydWUpIHtcblx0XHRcdHJldHVybiBMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50LkVhZ2VyO1xuXHRcdH0gZWxzZSBpZiAoY29uZmlnID09PSAnYXV0bycpIHtcblx0XHRcdHJldHVybiBMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50Lkxhenk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBMb2NhbFdlYldvcmtlckV4dEhvc3RFbmFibGVtZW50LkRpc2FibGVkO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBlbnVtIExvY2FsV2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQge1xuXHREaXNhYmxlZCA9IDAsXG5cdEVhZ2VyID0gMSxcblx0TGF6eSA9IDJcbn1cblxuZXhwb3J0IGNsYXNzIE5hdGl2ZUV4dGVuc2lvbkhvc3RLaW5kUGlja2VyIGltcGxlbWVudHMgSUV4dGVuc2lvbkhvc3RLaW5kUGlja2VyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNSZW1vdGVFeHRIb3N0OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNXZWJXb3JrZXJFeHRIb3N0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9oYXNSZW1vdGVFeHRIb3N0ID0gQm9vbGVhbihlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KTtcblx0XHRjb25zdCB3ZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudCA9IGRldGVybWluZUxvY2FsV2ViV29ya2VyRXh0SG9zdEVuYWJsZW1lbnQoZW52aXJvbm1lbnRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5faGFzV2ViV29ya2VyRXh0SG9zdCA9ICh3ZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudCAhPT0gTG9jYWxXZWJXb3JrZXJFeHRIb3N0RW5hYmxlbWVudC5EaXNhYmxlZCk7XG5cdH1cblxuXHRwdWJsaWMgcGlja0V4dGVuc2lvbkhvc3RLaW5kKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBleHRlbnNpb25LaW5kczogRXh0ZW5zaW9uS2luZFtdLCBpc0luc3RhbGxlZExvY2FsbHk6IGJvb2xlYW4sIGlzSW5zdGFsbGVkUmVtb3RlbHk6IGJvb2xlYW4sIHByZWZlcmVuY2U6IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlKTogRXh0ZW5zaW9uSG9zdEtpbmQgfCBudWxsIHtcblx0XHRjb25zdCByZXN1bHQgPSBOYXRpdmVFeHRlbnNpb25Ib3N0S2luZFBpY2tlci5waWNrRXh0ZW5zaW9uSG9zdEtpbmQoZXh0ZW5zaW9uS2luZHMsIGlzSW5zdGFsbGVkTG9jYWxseSwgaXNJbnN0YWxsZWRSZW1vdGVseSwgcHJlZmVyZW5jZSwgdGhpcy5faGFzUmVtb3RlRXh0SG9zdCwgdGhpcy5faGFzV2ViV29ya2VyRXh0SG9zdCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgcGlja1J1bm5pbmdMb2NhdGlvbiBmb3IgJHtleHRlbnNpb25JZC52YWx1ZX0sIGV4dGVuc2lvbiBraW5kczogWyR7ZXh0ZW5zaW9uS2luZHMuam9pbignLCAnKX1dLCBpc0luc3RhbGxlZExvY2FsbHk6ICR7aXNJbnN0YWxsZWRMb2NhbGx5fSwgaXNJbnN0YWxsZWRSZW1vdGVseTogJHtpc0luc3RhbGxlZFJlbW90ZWx5fSwgcHJlZmVyZW5jZTogJHtleHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZVRvU3RyaW5nKHByZWZlcmVuY2UpfSA9PiAke2V4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcocmVzdWx0KX1gKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBwaWNrRXh0ZW5zaW9uSG9zdEtpbmQoZXh0ZW5zaW9uS2luZHM6IEV4dGVuc2lvbktpbmRbXSwgaXNJbnN0YWxsZWRMb2NhbGx5OiBib29sZWFuLCBpc0luc3RhbGxlZFJlbW90ZWx5OiBib29sZWFuLCBwcmVmZXJlbmNlOiBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZSwgaGFzUmVtb3RlRXh0SG9zdDogYm9vbGVhbiwgaGFzV2ViV29ya2VyRXh0SG9zdDogYm9vbGVhbik6IEV4dGVuc2lvbkhvc3RLaW5kIHwgbnVsbCB7XG5cdFx0Y29uc3QgcmVzdWx0OiBFeHRlbnNpb25Ib3N0S2luZFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25LaW5kIG9mIGV4dGVuc2lvbktpbmRzKSB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uS2luZCA9PT0gJ3VpJyAmJiBpc0luc3RhbGxlZExvY2FsbHkpIHtcblx0XHRcdFx0Ly8gdWkgZXh0ZW5zaW9ucyBydW4gbG9jYWxseSBpZiBwb3NzaWJsZVxuXHRcdFx0XHRpZiAocHJlZmVyZW5jZSA9PT0gRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UuTm9uZSB8fCBwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5Mb2NhbCkge1xuXHRcdFx0XHRcdHJldHVybiBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3M7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd3b3Jrc3BhY2UnICYmIGlzSW5zdGFsbGVkUmVtb3RlbHkpIHtcblx0XHRcdFx0Ly8gd29ya3NwYWNlIGV4dGVuc2lvbnMgcnVuIHJlbW90ZWx5IGlmIHBvc3NpYmxlXG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5Ob25lIHx8IHByZWZlcmVuY2UgPT09IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLlJlbW90ZSkge1xuXHRcdFx0XHRcdHJldHVybiBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd3b3Jrc3BhY2UnICYmICFoYXNSZW1vdGVFeHRIb3N0KSB7XG5cdFx0XHRcdC8vIHdvcmtzcGFjZSBleHRlbnNpb25zIGFsc28gcnVuIGxvY2FsbHkgaWYgdGhlcmUgaXMgbm8gcmVtb3RlXG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5Ob25lIHx8IHByZWZlcmVuY2UgPT09IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLkxvY2FsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsUHJvY2Vzcztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uS2luZCA9PT0gJ3dlYicgJiYgaXNJbnN0YWxsZWRMb2NhbGx5ICYmIGhhc1dlYldvcmtlckV4dEhvc3QpIHtcblx0XHRcdFx0Ly8gd2ViIHdvcmtlciBleHRlbnNpb25zIHJ1biBpbiB0aGUgbG9jYWwgd2ViIHdvcmtlciBpZiBwb3NzaWJsZVxuXHRcdFx0XHRpZiAocHJlZmVyZW5jZSA9PT0gRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UuTm9uZSB8fCBwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5Mb2NhbCkge1xuXHRcdFx0XHRcdHJldHVybiBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlcjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIChyZXN1bHQubGVuZ3RoID4gMCA/IHJlc3VsdFswXSA6IG51bGwpO1xuXHR9XG59XG5cbmNsYXNzIFJlc3RhcnRFeHRlbnNpb25Ib3N0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnJlc3RhcnRFeHRlbnNpb25Ib3N0Jyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZXN0YXJ0RXh0ZW5zaW9uSG9zdCcsIFwiUmVzdGFydCBFeHRlbnNpb24gSG9zdFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHN0b3BwZWQgPSBhd2FpdCBleHRlbnNpb25TZXJ2aWNlLnN0b3BFeHRlbnNpb25Ib3N0cyhubHMubG9jYWxpemUoJ3Jlc3RhcnRFeHRlbnNpb25Ib3N0LnJlYXNvbicsIFwiQW4gZXhwbGljaXQgcmVxdWVzdFwiKSk7XG5cdFx0aWYgKHN0b3BwZWQpIHtcblx0XHRcdGV4dGVuc2lvblNlcnZpY2Uuc3RhcnRFeHRlbnNpb25Ib3N0cygpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoUmVzdGFydEV4dGVuc2lvbkhvc3RBY3Rpb24pO1xuXG5yZWdpc3RlclNpbmdsZXRvbihJRXh0ZW5zaW9uU2VydmljZSwgTmF0aXZlRXh0ZW5zaW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsWUFBWSxpQkFBaUI7QUFDN0IsU0FBUyxZQUFZO0FBRXJCLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtB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
