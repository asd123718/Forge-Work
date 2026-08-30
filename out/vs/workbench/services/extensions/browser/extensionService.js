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
import { mainWindow } from "../../../../base/browser/window.js";
import { Schemas } from "../../../../base/common/network.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { getLogs } from "../../../../platform/log/browser/log.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { PersistentConnectionEventType } from "../../../../platform/remote/common/remoteAgentConnection.js";
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IRemoteExtensionsScannerService } from "../../../../platform/remote/common/remoteExtensionsScanner.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { WebWorkerExtensionHost } from "./webWorkerExtensionHost.js";
import { FetchFileSystemProvider } from "./webWorkerFileSystemProvider.js";
import { AbstractExtensionService, LocalExtensions, RemoteExtensions, ResolverExtensions, checkEnabledAndProposedAPI, isResolverExtension } from "../common/abstractExtensionService.js";
import { ExtensionHostKind, ExtensionRunningPreference, extensionHostKindToString, extensionRunningPreferenceToString } from "../common/extensionHostKind.js";
import { IExtensionManifestPropertiesService } from "../common/extensionManifestPropertiesService.js";
import { filterExtensionDescriptions } from "../common/extensionRunningLocationTracker.js";
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionService, toExtensionDescription } from "../common/extensions.js";
import { ExtensionsProposedApi } from "../common/extensionsProposedApi.js";
import { dedupExtensions } from "../common/extensionsUtil.js";
import { RemoteExtensionHost } from "../common/remoteExtensionHost.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { IRemoteExplorerService } from "../../remote/common/remoteExplorerService.js";
import { IUserDataInitializationService } from "../../userData/browser/userDataInit.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { AsyncIterableProducer } from "../../../../base/common/async.js";
let ExtensionService = class extends AbstractExtensionService {
  constructor(instantiationService, notificationService, _browserEnvironmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, _webExtensionsScannerService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService, _userDataInitializationService, _userDataProfileService, _workspaceTrustManagementService, _remoteExplorerService, dialogService) {
    const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
    const extensionHostFactory = new BrowserExtensionHostFactory(
      extensionsProposedApi,
      () => this._scanWebExtensions(),
      () => this._getExtensionRegistrySnapshotWhenReady(),
      instantiationService,
      remoteAgentService,
      remoteAuthorityResolverService,
      extensionEnablementService,
      logService
    );
    super(
      { hasLocalProcess: false, allowRemoteExtensionsInLocalWebWorker: true },
      extensionsProposedApi,
      extensionHostFactory,
      new BrowserExtensionHostKindPicker(logService),
      instantiationService,
      notificationService,
      _browserEnvironmentService,
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
    this._browserEnvironmentService = _browserEnvironmentService;
    this._webExtensionsScannerService = _webExtensionsScannerService;
    this._userDataInitializationService = _userDataInitializationService;
    this._userDataProfileService = _userDataProfileService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._remoteExplorerService = _remoteExplorerService;
    lifecycleService.when(LifecyclePhase.Ready).then(async () => {
      await this._initializeIfNeeded();
    });
    this._initFetchFileSystem();
  }
  _initFetchFileSystem() {
    const provider = new FetchFileSystemProvider();
    this._register(this._fileService.registerProvider(Schemas.http, provider));
    this._register(this._fileService.registerProvider(Schemas.https, provider));
  }
  async _initialize() {
    await this._userDataInitializationService.initializeInstalledExtensions(this._instantiationService);
    await super._initialize();
  }
  async _scanWebExtensions() {
    if (!this._scanWebExtensionsPromise) {
      this._scanWebExtensionsPromise = (async () => {
        const system = [], user = [], development = [];
        try {
          await Promise.all([
            this._webExtensionsScannerService.scanSystemExtensions().then((extensions) => system.push(...extensions.map((e) => toExtensionDescription(e)))),
            this._webExtensionsScannerService.scanUserExtensions(this._userDataProfileService.currentProfile.extensionsResource, { skipInvalidExtensions: true }).then((extensions) => user.push(...extensions.map((e) => toExtensionDescription(e)))),
            this._webExtensionsScannerService.scanExtensionsUnderDevelopment().then((extensions) => development.push(...extensions.map((e) => toExtensionDescription(e, true))))
          ]);
        } catch (error) {
          this._logService.error(error);
        }
        return dedupExtensions(system, user, [], development, this._logService);
      })();
    }
    return this._scanWebExtensionsPromise;
  }
  async _resolveExtensionsDefault(emitter) {
    const [localExtensions, remoteExtensions] = await Promise.all([
      this._scanWebExtensions(),
      this._remoteExtensionsScannerService.scanExtensions()
    ]);
    if (remoteExtensions.length) {
      emitter.emitOne(new RemoteExtensions(remoteExtensions));
    }
    emitter.emitOne(new LocalExtensions(localExtensions));
  }
  _resolveExtensions() {
    return new AsyncIterableProducer((emitter) => this._doResolveExtensions(emitter));
  }
  async _doResolveExtensions(emitter) {
    if (!this._browserEnvironmentService.expectsResolverExtension) {
      return this._resolveExtensionsDefault(emitter);
    }
    const remoteAuthority = this._environmentService.remoteAuthority;
    await this._workspaceTrustManagementService.workspaceResolved;
    const localExtensions = await this._scanWebExtensions();
    const resolverExtensions = localExtensions.filter((extension) => isResolverExtension(extension));
    if (resolverExtensions.length) {
      emitter.emitOne(new ResolverExtensions(resolverExtensions));
    }
    let resolverResult;
    try {
      resolverResult = await this._resolveAuthorityInitial(remoteAuthority);
    } catch (err) {
      if (RemoteAuthorityResolverError.isHandled(err)) {
        console.log(`Error handled: Not showing a notification for the error`);
      }
      this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
      return this._resolveExtensionsDefault(emitter);
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
    return this._resolveExtensionsDefault(emitter);
  }
  async _onExtensionHostExit(code) {
    await this._doStopExtensionHosts();
    const automatedWindow = mainWindow;
    if (typeof automatedWindow.codeAutomationExit === "function") {
      automatedWindow.codeAutomationExit(code, await getLogs(this._fileService, this._environmentService));
    }
  }
  async _resolveAuthority(remoteAuthority) {
    return this._resolveAuthorityOnExtensionHosts(ExtensionHostKind.LocalWebWorker, remoteAuthority);
  }
};
ExtensionService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IBrowserWorkbenchEnvironmentService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IWorkbenchExtensionEnablementService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IWorkbenchExtensionManagementService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IExtensionManifestPropertiesService),
  __decorateParam(11, IWebExtensionsScannerService),
  __decorateParam(12, ILogService),
  __decorateParam(13, IRemoteAgentService),
  __decorateParam(14, IRemoteExtensionsScannerService),
  __decorateParam(15, ILifecycleService),
  __decorateParam(16, IRemoteAuthorityResolverService),
  __decorateParam(17, IUserDataInitializationService),
  __decorateParam(18, IUserDataProfileService),
  __decorateParam(19, IWorkspaceTrustManagementService),
  __decorateParam(20, IRemoteExplorerService),
  __decorateParam(21, IDialogService)
], ExtensionService);
let BrowserExtensionHostFactory = class {
  constructor(_extensionsProposedApi, _scanWebExtensions, _getExtensionRegistrySnapshotWhenReady, _instantiationService, _remoteAgentService, _remoteAuthorityResolverService, _extensionEnablementService, _logService) {
    this._extensionsProposedApi = _extensionsProposedApi;
    this._scanWebExtensions = _scanWebExtensions;
    this._getExtensionRegistrySnapshotWhenReady = _getExtensionRegistrySnapshotWhenReady;
    this._instantiationService = _instantiationService;
    this._remoteAgentService = _remoteAgentService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._extensionEnablementService = _extensionEnablementService;
    this._logService = _logService;
  }
  createExtensionHost(runningLocations, runningLocation, isInitialStart) {
    switch (runningLocation.kind) {
      case ExtensionHostKind.LocalProcess: {
        return null;
      }
      case ExtensionHostKind.LocalWebWorker: {
        const startup = isInitialStart ? ExtensionHostStartup.EagerManualStart : ExtensionHostStartup.EagerAutoStart;
        return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createLocalExtensionHostDataProvider(runningLocations, runningLocation, isInitialStart));
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
  _createLocalExtensionHostDataProvider(runningLocations, desiredRunningLocation, isInitialStart) {
    return {
      getInitData: async () => {
        if (isInitialStart) {
          const localExtensions = checkEnabledAndProposedAPI(
            this._logService,
            this._extensionEnablementService,
            this._extensionsProposedApi,
            await this._scanWebExtensions(),
            /* ignore workspace trust */
            true
          );
          const runningLocation = runningLocations.computeRunningLocation(localExtensions, [], false);
          const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, (extRunningLocation) => desiredRunningLocation.equals(extRunningLocation));
          const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map((extension) => extension.identifier));
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
BrowserExtensionHostFactory = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IRemoteAgentService),
  __decorateParam(5, IRemoteAuthorityResolverService),
  __decorateParam(6, IWorkbenchExtensionEnablementService),
  __decorateParam(7, ILogService)
], BrowserExtensionHostFactory);
let BrowserExtensionHostKindPicker = class {
  constructor(_logService) {
    this._logService = _logService;
  }
  pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
    const result = BrowserExtensionHostKindPicker.pickRunningLocation(extensionKinds, isInstalledLocally, isInstalledRemotely, preference);
    this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(", ")}], isInstalledLocally: ${isInstalledLocally}, isInstalledRemotely: ${isInstalledRemotely}, preference: ${extensionRunningPreferenceToString(preference)} => ${extensionHostKindToString(result)}`);
    return result;
  }
  static pickRunningLocation(extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
    const result = [];
    let canRunRemotely = false;
    for (const extensionKind of extensionKinds) {
      if (extensionKind === "ui" && isInstalledRemotely) {
        if (preference === ExtensionRunningPreference.Remote) {
          return ExtensionHostKind.Remote;
        } else {
          canRunRemotely = true;
        }
      }
      if (extensionKind === "workspace" && isInstalledRemotely) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Remote) {
          return ExtensionHostKind.Remote;
        } else {
          result.push(ExtensionHostKind.Remote);
        }
      }
      if (extensionKind === "web" && (isInstalledLocally || isInstalledRemotely)) {
        if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
          return ExtensionHostKind.LocalWebWorker;
        } else {
          result.push(ExtensionHostKind.LocalWebWorker);
        }
      }
    }
    if (canRunRemotely) {
      result.push(ExtensionHostKind.Remote);
    }
    return result.length > 0 ? result[0] : null;
  }
};
BrowserExtensionHostKindPicker = __decorateClass([
  __decorateParam(0, ILogService)
], BrowserExtensionHostKindPicker);
registerSingleton(IExtensionService, ExtensionService, InstantiationType.Eager);
export {
  BrowserExtensionHostKindPicker,
  ExtensionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxicm93c2VyXFxleHRlbnNpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRlZFdpbmRvdywgZ2V0TG9ncyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9icm93c2VyL2xvZy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50Q29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yLCBSZXNvbHZlclJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLCBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlckV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIsIElXZWJXb3JrZXJFeHRlbnNpb25Ib3N0SW5pdERhdGEsIFdlYldvcmtlckV4dGVuc2lvbkhvc3QgfSBmcm9tICcuL3dlYldvcmtlckV4dGVuc2lvbkhvc3QuanMnO1xuaW1wb3J0IHsgRmV0Y2hGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuL3dlYldvcmtlckZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEV4dGVuc2lvblNlcnZpY2UsIElFeHRlbnNpb25Ib3N0RmFjdG9yeSwgTG9jYWxFeHRlbnNpb25zLCBSZW1vdGVFeHRlbnNpb25zLCBSZXNvbHZlZEV4dGVuc2lvbnMsIFJlc29sdmVyRXh0ZW5zaW9ucywgY2hlY2tFbmFibGVkQW5kUHJvcG9zZWRBUEksIGlzUmVzb2x2ZXJFeHRlbnNpb24gfSBmcm9tICcuLi9jb21tb24vYWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnlTbmFwc2hvdCB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RLaW5kLCBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZSwgSUV4dGVuc2lvbkhvc3RLaW5kUGlja2VyLCBleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nLCBleHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZVRvU3RyaW5nIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbkhvc3RLaW5kLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLCBmaWx0ZXJFeHRlbnNpb25EZXNjcmlwdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlci5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucywgRXh0ZW5zaW9uSG9zdFN0YXJ0dXAsIElFeHRlbnNpb25Ib3N0LCBJRXh0ZW5zaW9uU2VydmljZSwgdG9FeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNQcm9wb3NlZEFwaSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zUHJvcG9zZWRBcGkuanMnO1xuaW1wb3J0IHsgZGVkdXBFeHRlbnNpb25zIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNVdGlsLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHRlbnNpb25Ib3N0RGF0YVByb3ZpZGVyLCBJUmVtb3RlRXh0ZW5zaW9uSG9zdEluaXREYXRhLCBSZW1vdGVFeHRlbnNpb25Ib3N0IH0gZnJvbSAnLi4vY29tbW9uL3JlbW90ZUV4dGVuc2lvbkhvc3QuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUV4cGxvcmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFJbml0aWFsaXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YS9icm93c2VyL3VzZXJEYXRhSW5pdC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IEFzeW5jSXRlcmFibGVFbWl0dGVyLCBBc3luY0l0ZXJhYmxlUHJvZHVjZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25TZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25TZXJ2aWNlIGltcGxlbWVudHMgSUV4dGVuc2lvblNlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Jyb3dzZXJFbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElXZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJV2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgcmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJUmVtb3RlRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSByZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZTogSVVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1Byb3Bvc2VkQXBpID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1Byb3Bvc2VkQXBpKTtcblx0XHRjb25zdCBleHRlbnNpb25Ib3N0RmFjdG9yeSA9IG5ldyBCcm93c2VyRXh0ZW5zaW9uSG9zdEZhY3RvcnkoXG5cdFx0XHRleHRlbnNpb25zUHJvcG9zZWRBcGksXG5cdFx0XHQoKSA9PiB0aGlzLl9zY2FuV2ViRXh0ZW5zaW9ucygpLFxuXHRcdFx0KCkgPT4gdGhpcy5fZ2V0RXh0ZW5zaW9uUmVnaXN0cnlTbmFwc2hvdFdoZW5SZWFkeSgpLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRyZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2Vcblx0XHQpO1xuXHRcdHN1cGVyKFxuXHRcdFx0eyBoYXNMb2NhbFByb2Nlc3M6IGZhbHNlLCBhbGxvd1JlbW90ZUV4dGVuc2lvbnNJbkxvY2FsV2ViV29ya2VyOiB0cnVlIH0sXG5cdFx0XHRleHRlbnNpb25zUHJvcG9zZWRBcGksXG5cdFx0XHRleHRlbnNpb25Ib3N0RmFjdG9yeSxcblx0XHRcdG5ldyBCcm93c2VyRXh0ZW5zaW9uSG9zdEtpbmRQaWNrZXIobG9nU2VydmljZSksXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRfYnJvd3NlckVudmlyb25tZW50U2VydmljZSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0cHJvZHVjdFNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdGNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHJlbW90ZUFnZW50U2VydmljZSxcblx0XHRcdHJlbW90ZUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSxcblx0XHRcdGxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0XHRkaWFsb2dTZXJ2aWNlXG5cdFx0KTtcblxuXHRcdC8vIEluaXRpYWxpemUgaW5zdGFsbGVkIGV4dGVuc2lvbnMgZmlyc3QgYW5kIGRvIGl0IG9ubHkgYWZ0ZXIgd29ya2JlbmNoIGlzIHJlYWR5XG5cdFx0bGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLlJlYWR5KS50aGVuKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuX2luaXRpYWxpemVJZk5lZWRlZCgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5faW5pdEZldGNoRmlsZVN5c3RlbSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdEZldGNoRmlsZVN5c3RlbSgpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBGZXRjaEZpbGVTeXN0ZW1Qcm92aWRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5odHRwLCBwcm92aWRlcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5odHRwcywgcHJvdmlkZXIpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl91c2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZS5pbml0aWFsaXplSW5zdGFsbGVkRXh0ZW5zaW9ucyh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0YXdhaXQgc3VwZXIuX2luaXRpYWxpemUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NjYW5XZWJFeHRlbnNpb25zUHJvbWlzZTogUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXT4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXN5bmMgX3NjYW5XZWJFeHRlbnNpb25zKCk6IFByb21pc2U8SUV4dGVuc2lvbkRlc2NyaXB0aW9uW10+IHtcblx0XHRpZiAoIXRoaXMuX3NjYW5XZWJFeHRlbnNpb25zUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fc2NhbldlYkV4dGVuc2lvbnNQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc3lzdGVtOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdLCB1c2VyOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSA9IFtdLCBkZXZlbG9wbWVudDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10gPSBbXTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0XHR0aGlzLl93ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhblN5c3RlbUV4dGVuc2lvbnMoKS50aGVuKGV4dGVuc2lvbnMgPT4gc3lzdGVtLnB1c2goLi4uZXh0ZW5zaW9ucy5tYXAoZSA9PiB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGUpKSkpLFxuXHRcdFx0XHRcdFx0dGhpcy5fd2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5Vc2VyRXh0ZW5zaW9ucyh0aGlzLl91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmV4dGVuc2lvbnNSZXNvdXJjZSwgeyBza2lwSW52YWxpZEV4dGVuc2lvbnM6IHRydWUgfSkudGhlbihleHRlbnNpb25zID0+IHVzZXIucHVzaCguLi5leHRlbnNpb25zLm1hcChlID0+IHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24oZSkpKSksXG5cdFx0XHRcdFx0XHR0aGlzLl93ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkV4dGVuc2lvbnNVbmRlckRldmVsb3BtZW50KCkudGhlbihleHRlbnNpb25zID0+IGRldmVsb3BtZW50LnB1c2goLi4uZXh0ZW5zaW9ucy5tYXAoZSA9PiB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGUsIHRydWUpKSkpXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGRlZHVwRXh0ZW5zaW9ucyhzeXN0ZW0sIHVzZXIsIFtdLCBkZXZlbG9wbWVudCwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2NhbldlYkV4dGVuc2lvbnNQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUV4dGVuc2lvbnNEZWZhdWx0KGVtaXR0ZXI6IEFzeW5jSXRlcmFibGVFbWl0dGVyPFJlc29sdmVkRXh0ZW5zaW9ucz4pIHtcblx0XHRjb25zdCBbbG9jYWxFeHRlbnNpb25zLCByZW1vdGVFeHRlbnNpb25zXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX3NjYW5XZWJFeHRlbnNpb25zKCksXG5cdFx0XHR0aGlzLl9yZW1vdGVFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhbkV4dGVuc2lvbnMoKVxuXHRcdF0pO1xuXG5cdFx0aWYgKHJlbW90ZUV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRlbWl0dGVyLmVtaXRPbmUobmV3IFJlbW90ZUV4dGVuc2lvbnMocmVtb3RlRXh0ZW5zaW9ucykpO1xuXHRcdH1cblx0XHRlbWl0dGVyLmVtaXRPbmUobmV3IExvY2FsRXh0ZW5zaW9ucyhsb2NhbEV4dGVuc2lvbnMpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVzb2x2ZUV4dGVuc2lvbnMoKTogQXN5bmNJdGVyYWJsZTxSZXNvbHZlZEV4dGVuc2lvbnM+IHtcblx0XHRyZXR1cm4gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcihlbWl0dGVyID0+IHRoaXMuX2RvUmVzb2x2ZUV4dGVuc2lvbnMoZW1pdHRlcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9SZXNvbHZlRXh0ZW5zaW9ucyhlbWl0dGVyOiBBc3luY0l0ZXJhYmxlRW1pdHRlcjxSZXNvbHZlZEV4dGVuc2lvbnM+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9icm93c2VyRW52aXJvbm1lbnRTZXJ2aWNlLmV4cGVjdHNSZXNvbHZlckV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVFeHRlbnNpb25zRGVmYXVsdChlbWl0dGVyKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ITtcblxuXHRcdC8vIE5vdyB0aGF0IHRoZSBjYW5vbmljYWwgVVJJIHByb3ZpZGVyIGhhcyBiZWVuIHJlZ2lzdGVyZWQsIHdlIG5lZWQgdG8gd2FpdCBmb3IgdGhlIHRydXN0IHN0YXRlIHRvIGJlXG5cdFx0Ly8gY2FsY3VsYXRlZC4gVGhlIHRydXN0IHN0YXRlIHdpbGwgYmUgdXNlZCB3aGlsZSByZXNvbHZpbmcgdGhlIGF1dGhvcml0eSwgaG93ZXZlciB0aGUgcmVzb2x2ZXIgY2FuXG5cdFx0Ly8gb3ZlcnJpZGUgdGhlIHRydXN0IHN0YXRlIHRocm91Z2ggdGhlIHJlc29sdmVyIHJlc3VsdC5cblx0XHRhd2FpdCB0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLndvcmtzcGFjZVJlc29sdmVkO1xuXG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5fc2NhbldlYkV4dGVuc2lvbnMoKTtcblx0XHRjb25zdCByZXNvbHZlckV4dGVuc2lvbnMgPSBsb2NhbEV4dGVuc2lvbnMuZmlsdGVyKGV4dGVuc2lvbiA9PiBpc1Jlc29sdmVyRXh0ZW5zaW9uKGV4dGVuc2lvbikpO1xuXHRcdGlmIChyZXNvbHZlckV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRlbWl0dGVyLmVtaXRPbmUobmV3IFJlc29sdmVyRXh0ZW5zaW9ucyhyZXNvbHZlckV4dGVuc2lvbnMpKTtcblx0XHR9XG5cblx0XHRsZXQgcmVzb2x2ZXJSZXN1bHQ6IFJlc29sdmVyUmVzdWx0O1xuXHRcdHRyeSB7XG5cdFx0XHRyZXNvbHZlclJlc3VsdCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVBdXRob3JpdHlJbml0aWFsKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvci5pc0hhbmRsZWQoZXJyKSkge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhgRXJyb3IgaGFuZGxlZDogTm90IHNob3dpbmcgYSBub3RpZmljYXRpb24gZm9yIHRoZSBlcnJvcmApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLl9zZXRSZXNvbHZlZEF1dGhvcml0eUVycm9yKHJlbW90ZUF1dGhvcml0eSwgZXJyKTtcblxuXHRcdFx0Ly8gUHJvY2VlZCB3aXRoIHRoZSBsb2NhbCBleHRlbnNpb24gaG9zdFxuXHRcdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVFeHRlbnNpb25zRGVmYXVsdChlbWl0dGVyKTtcblx0XHR9XG5cblx0XHQvLyBzZXQgdGhlIHJlc29sdmVkIGF1dGhvcml0eVxuXHRcdHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5fc2V0UmVzb2x2ZWRBdXRob3JpdHkocmVzb2x2ZXJSZXN1bHQuYXV0aG9yaXR5LCByZXNvbHZlclJlc3VsdC5vcHRpb25zKTtcblx0XHR0aGlzLl9yZW1vdGVFeHBsb3JlclNlcnZpY2Uuc2V0VHVubmVsSW5mb3JtYXRpb24ocmVzb2x2ZXJSZXN1bHQudHVubmVsSW5mb3JtYXRpb24pO1xuXG5cdFx0Ly8gbW9uaXRvciBmb3IgYnJlYWthZ2Vcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY29ubmVjdGlvbi5vbkRpZFN0YXRlQ2hhbmdlKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdGlmIChlLnR5cGUgPT09IFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLkNvbm5lY3Rpb25Mb3N0KSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLl9jbGVhclJlc29sdmVkQXV0aG9yaXR5KHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGNvbm5lY3Rpb24ub25SZWNvbm5lY3RpbmcoKCkgPT4gdGhpcy5fcmVzb2x2ZUF1dGhvcml0eUFnYWluKCkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUV4dGVuc2lvbnNEZWZhdWx0KGVtaXR0ZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9vbkV4dGVuc2lvbkhvc3RFeGl0KGNvZGU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIERpc3Bvc2UgZXZlcnl0aGluZyBhc3NvY2lhdGVkIHdpdGggdGhlIGV4dGVuc2lvbiBob3N0XG5cdFx0YXdhaXQgdGhpcy5fZG9TdG9wRXh0ZW5zaW9uSG9zdHMoKTtcblxuXHRcdC8vIElmIHdlIGFyZSBydW5uaW5nIGV4dGVuc2lvbiB0ZXN0cywgZm9yd2FyZCBsb2dzIGFuZCBleGl0IGNvZGVcblx0XHRjb25zdCBhdXRvbWF0ZWRXaW5kb3cgPSBtYWluV2luZG93IGFzIHVua25vd24gYXMgSUF1dG9tYXRlZFdpbmRvdztcblx0XHRpZiAodHlwZW9mIGF1dG9tYXRlZFdpbmRvdy5jb2RlQXV0b21hdGlvbkV4aXQgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdGF1dG9tYXRlZFdpbmRvdy5jb2RlQXV0b21hdGlvbkV4aXQoY29kZSwgYXdhaXQgZ2V0TG9ncyh0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9yZXNvbHZlQXV0aG9yaXR5KHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogUHJvbWlzZTxSZXNvbHZlclJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlQXV0aG9yaXR5T25FeHRlbnNpb25Ib3N0cyhFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlciwgcmVtb3RlQXV0aG9yaXR5KTtcblx0fVxufVxuXG5jbGFzcyBCcm93c2VyRXh0ZW5zaW9uSG9zdEZhY3RvcnkgaW1wbGVtZW50cyBJRXh0ZW5zaW9uSG9zdEZhY3Rvcnkge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbnNQcm9wb3NlZEFwaTogRXh0ZW5zaW9uc1Byb3Bvc2VkQXBpLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NjYW5XZWJFeHRlbnNpb25zOiAoKSA9PiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRFeHRlbnNpb25SZWdpc3RyeVNuYXBzaG90V2hlblJlYWR5OiAoKSA9PiBQcm9taXNlPEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnlTbmFwc2hvdD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRjcmVhdGVFeHRlbnNpb25Ib3N0KHJ1bm5pbmdMb2NhdGlvbnM6IEV4dGVuc2lvblJ1bm5pbmdMb2NhdGlvblRyYWNrZXIsIHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uLCBpc0luaXRpYWxTdGFydDogYm9vbGVhbik6IElFeHRlbnNpb25Ib3N0IHwgbnVsbCB7XG5cdFx0c3dpdGNoIChydW5uaW5nTG9jYXRpb24ua2luZCkge1xuXHRcdFx0Y2FzZSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3M6IHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyOiB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0dXAgPSAoXG5cdFx0XHRcdFx0aXNJbml0aWFsU3RhcnRcblx0XHRcdFx0XHRcdD8gRXh0ZW5zaW9uSG9zdFN0YXJ0dXAuRWFnZXJNYW51YWxTdGFydFxuXHRcdFx0XHRcdFx0OiBFeHRlbnNpb25Ib3N0U3RhcnR1cC5FYWdlckF1dG9TdGFydFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV2ViV29ya2VyRXh0ZW5zaW9uSG9zdCwgcnVubmluZ0xvY2F0aW9uLCBzdGFydHVwLCB0aGlzLl9jcmVhdGVMb2NhbEV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIocnVubmluZ0xvY2F0aW9ucywgcnVubmluZ0xvY2F0aW9uLCBpc0luaXRpYWxTdGFydCkpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGU6IHtcblx0XHRcdFx0Y29uc3QgcmVtb3RlQWdlbnRDb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRcdFx0aWYgKHJlbW90ZUFnZW50Q29ubmVjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVFeHRlbnNpb25Ib3N0LCBydW5uaW5nTG9jYXRpb24sIHRoaXMuX2NyZWF0ZVJlbW90ZUV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIocnVubmluZ0xvY2F0aW9ucywgcmVtb3RlQWdlbnRDb25uZWN0aW9uLnJlbW90ZUF1dGhvcml0eSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUxvY2FsRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlcihydW5uaW5nTG9jYXRpb25zOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb25UcmFja2VyLCBkZXNpcmVkUnVubmluZ0xvY2F0aW9uOiBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24sIGlzSW5pdGlhbFN0YXJ0OiBib29sZWFuKTogSVdlYldvcmtlckV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRJbml0RGF0YTogYXN5bmMgKCk6IFByb21pc2U8SVdlYldvcmtlckV4dGVuc2lvbkhvc3RJbml0RGF0YT4gPT4ge1xuXHRcdFx0XHRpZiAoaXNJbml0aWFsU3RhcnQpIHtcblx0XHRcdFx0XHQvLyBIZXJlIHdlIGxvYWQgZXZlbiBleHRlbnNpb25zIHRoYXQgd291bGQgYmUgZGlzYWJsZWQgYnkgd29ya3NwYWNlIHRydXN0XG5cdFx0XHRcdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zID0gY2hlY2tFbmFibGVkQW5kUHJvcG9zZWRBUEkodGhpcy5fbG9nU2VydmljZSwgdGhpcy5fZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIHRoaXMuX2V4dGVuc2lvbnNQcm9wb3NlZEFwaSwgYXdhaXQgdGhpcy5fc2NhbldlYkV4dGVuc2lvbnMoKSwgLyogaWdub3JlIHdvcmtzcGFjZSB0cnVzdCAqL3RydWUpO1xuXHRcdFx0XHRcdGNvbnN0IHJ1bm5pbmdMb2NhdGlvbiA9IHJ1bm5pbmdMb2NhdGlvbnMuY29tcHV0ZVJ1bm5pbmdMb2NhdGlvbihsb2NhbEV4dGVuc2lvbnMsIFtdLCBmYWxzZSk7XG5cdFx0XHRcdFx0Y29uc3QgbXlFeHRlbnNpb25zID0gZmlsdGVyRXh0ZW5zaW9uRGVzY3JpcHRpb25zKGxvY2FsRXh0ZW5zaW9ucywgcnVubmluZ0xvY2F0aW9uLCBleHRSdW5uaW5nTG9jYXRpb24gPT4gZGVzaXJlZFJ1bm5pbmdMb2NhdGlvbi5lcXVhbHMoZXh0UnVubmluZ0xvY2F0aW9uKSk7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG5ldyBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucygwLCBsb2NhbEV4dGVuc2lvbnMsIG15RXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZXh0ZW5zaW9ucyB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHJlc3RhcnQgY2FzZVxuXHRcdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5fZ2V0RXh0ZW5zaW9uUmVnaXN0cnlTbmFwc2hvdFdoZW5SZWFkeSgpO1xuXHRcdFx0XHRcdGNvbnN0IG15RXh0ZW5zaW9ucyA9IHJ1bm5pbmdMb2NhdGlvbnMuZmlsdGVyQnlSdW5uaW5nTG9jYXRpb24oc25hcHNob3QuZXh0ZW5zaW9ucywgZGVzaXJlZFJ1bm5pbmdMb2NhdGlvbik7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG5ldyBFeHRlbnNpb25Ib3N0RXh0ZW5zaW9ucyhzbmFwc2hvdC52ZXJzaW9uSWQsIHNuYXBzaG90LmV4dGVuc2lvbnMsIG15RXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZXh0ZW5zaW9ucyB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVJlbW90ZUV4dGVuc2lvbkhvc3REYXRhUHJvdmlkZXIocnVubmluZ0xvY2F0aW9uczogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uVHJhY2tlciwgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpOiBJUmVtb3RlRXh0ZW5zaW9uSG9zdERhdGFQcm92aWRlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0Z2V0SW5pdERhdGE6IGFzeW5jICgpOiBQcm9taXNlPElSZW1vdGVFeHRlbnNpb25Ib3N0SW5pdERhdGE+ID0+IHtcblx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCB0aGlzLl9nZXRFeHRlbnNpb25SZWdpc3RyeVNuYXBzaG90V2hlblJlYWR5KCk7XG5cblx0XHRcdFx0Y29uc3QgcmVtb3RlRW52ID0gYXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCk7XG5cdFx0XHRcdGlmICghcmVtb3RlRW52KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcHJvdmlkZSBpbml0IGRhdGEgZm9yIHJlbW90ZSBleHRlbnNpb24gaG9zdCEnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG15RXh0ZW5zaW9ucyA9IHJ1bm5pbmdMb2NhdGlvbnMuZmlsdGVyQnlFeHRlbnNpb25Ib3N0S2luZChzbmFwc2hvdC5leHRlbnNpb25zLCBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGUpO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25zID0gbmV3IEV4dGVuc2lvbkhvc3RFeHRlbnNpb25zKHNuYXBzaG90LnZlcnNpb25JZCwgc25hcHNob3QuZXh0ZW5zaW9ucywgbXlFeHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gZXh0ZW5zaW9uLmlkZW50aWZpZXIpKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbm5lY3Rpb25EYXRhOiB0aGlzLl9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UuZ2V0Q29ubmVjdGlvbkRhdGEocmVtb3RlQXV0aG9yaXR5KSxcblx0XHRcdFx0XHRwaWQ6IHJlbW90ZUVudi5waWQsXG5cdFx0XHRcdFx0YXBwUm9vdDogcmVtb3RlRW52LmFwcFJvb3QsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdExvZ3NQYXRoOiByZW1vdGVFbnYuZXh0ZW5zaW9uSG9zdExvZ3NQYXRoLFxuXHRcdFx0XHRcdGdsb2JhbFN0b3JhZ2VIb21lOiByZW1vdGVFbnYuZ2xvYmFsU3RvcmFnZUhvbWUsXG5cdFx0XHRcdFx0d29ya3NwYWNlU3RvcmFnZUhvbWU6IHJlbW90ZUVudi53b3Jrc3BhY2VTdG9yYWdlSG9tZSxcblx0XHRcdFx0XHRleHRlbnNpb25zLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJFeHRlbnNpb25Ib3N0S2luZFBpY2tlciBpbXBsZW1lbnRzIElFeHRlbnNpb25Ib3N0S2luZFBpY2tlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHBpY2tFeHRlbnNpb25Ib3N0S2luZChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgZXh0ZW5zaW9uS2luZHM6IEV4dGVuc2lvbktpbmRbXSwgaXNJbnN0YWxsZWRMb2NhbGx5OiBib29sZWFuLCBpc0luc3RhbGxlZFJlbW90ZWx5OiBib29sZWFuLCBwcmVmZXJlbmNlOiBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZSk6IEV4dGVuc2lvbkhvc3RLaW5kIHwgbnVsbCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gQnJvd3NlckV4dGVuc2lvbkhvc3RLaW5kUGlja2VyLnBpY2tSdW5uaW5nTG9jYXRpb24oZXh0ZW5zaW9uS2luZHMsIGlzSW5zdGFsbGVkTG9jYWxseSwgaXNJbnN0YWxsZWRSZW1vdGVseSwgcHJlZmVyZW5jZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgcGlja1J1bm5pbmdMb2NhdGlvbiBmb3IgJHtleHRlbnNpb25JZC52YWx1ZX0sIGV4dGVuc2lvbiBraW5kczogWyR7ZXh0ZW5zaW9uS2luZHMuam9pbignLCAnKX1dLCBpc0luc3RhbGxlZExvY2FsbHk6ICR7aXNJbnN0YWxsZWRMb2NhbGx5fSwgaXNJbnN0YWxsZWRSZW1vdGVseTogJHtpc0luc3RhbGxlZFJlbW90ZWx5fSwgcHJlZmVyZW5jZTogJHtleHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZVRvU3RyaW5nKHByZWZlcmVuY2UpfSA9PiAke2V4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcocmVzdWx0KX1gKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBwaWNrUnVubmluZ0xvY2F0aW9uKGV4dGVuc2lvbktpbmRzOiBFeHRlbnNpb25LaW5kW10sIGlzSW5zdGFsbGVkTG9jYWxseTogYm9vbGVhbiwgaXNJbnN0YWxsZWRSZW1vdGVseTogYm9vbGVhbiwgcHJlZmVyZW5jZTogRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UpOiBFeHRlbnNpb25Ib3N0S2luZCB8IG51bGwge1xuXHRcdGNvbnN0IHJlc3VsdDogRXh0ZW5zaW9uSG9zdEtpbmRbXSA9IFtdO1xuXHRcdGxldCBjYW5SdW5SZW1vdGVseSA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uS2luZCBvZiBleHRlbnNpb25LaW5kcykge1xuXHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd1aScgJiYgaXNJbnN0YWxsZWRSZW1vdGVseSkge1xuXHRcdFx0XHQvLyB1aSBleHRlbnNpb25zIHJ1biByZW1vdGVseSBpZiBwb3NzaWJsZSAoYnV0IG9ubHkgYXMgYSBsYXN0IHJlc29ydClcblx0XHRcdFx0aWYgKHByZWZlcmVuY2UgPT09IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLlJlbW90ZSkge1xuXHRcdFx0XHRcdHJldHVybiBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2FuUnVuUmVtb3RlbHkgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uS2luZCA9PT0gJ3dvcmtzcGFjZScgJiYgaXNJbnN0YWxsZWRSZW1vdGVseSkge1xuXHRcdFx0XHQvLyB3b3Jrc3BhY2UgZXh0ZW5zaW9ucyBydW4gcmVtb3RlbHkgaWYgcG9zc2libGVcblx0XHRcdFx0aWYgKHByZWZlcmVuY2UgPT09IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLk5vbmUgfHwgcHJlZmVyZW5jZSA9PT0gRXh0ZW5zaW9uUnVubmluZ1ByZWZlcmVuY2UuUmVtb3RlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEV4dGVuc2lvbkhvc3RLaW5kLlJlbW90ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uS2luZCA9PT0gJ3dlYicgJiYgKGlzSW5zdGFsbGVkTG9jYWxseSB8fCBpc0luc3RhbGxlZFJlbW90ZWx5KSkge1xuXHRcdFx0XHQvLyB3ZWIgd29ya2VyIGV4dGVuc2lvbnMgcnVuIGluIHRoZSBsb2NhbCB3ZWIgd29ya2VyIGlmIHBvc3NpYmxlXG5cdFx0XHRcdGlmIChwcmVmZXJlbmNlID09PSBFeHRlbnNpb25SdW5uaW5nUHJlZmVyZW5jZS5Ob25lIHx8IHByZWZlcmVuY2UgPT09IEV4dGVuc2lvblJ1bm5pbmdQcmVmZXJlbmNlLkxvY2FsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY2FuUnVuUmVtb3RlbHkpIHtcblx0XHRcdHJlc3VsdC5wdXNoKEV4dGVuc2lvbkhvc3RLaW5kLlJlbW90ZSk7XG5cdFx0fVxuXHRcdHJldHVybiAocmVzdWx0Lmxlbmd0aCA+IDAgPyByZXN1bHRbMF0gOiBudWxsKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJRXh0ZW5zaW9uU2VydmljZSwgRXh0ZW5zaW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFT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
