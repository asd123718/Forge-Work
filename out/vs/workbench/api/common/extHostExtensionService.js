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
import * as nls from "../../../nls.js";
import * as path from "../../../base/common/path.js";
import * as performance from "../../../base/common/performance.js";
import { originalFSPath, joinPath, extUriBiasedIgnorePathCase } from "../../../base/common/resources.js";
import { asPromise, Barrier, IntervalTimer, timeout } from "../../../base/common/async.js";
import { dispose, toDisposable, Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { TernarySearchTree } from "../../../base/common/ternarySearchTree.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { MainContext } from "./extHost.protocol.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
import { ActivatedExtension, EmptyExtension, ExtensionActivationTimes, ExtensionActivationTimesBuilder, ExtensionsActivator, HostExtension } from "./extHostExtensionActivator.js";
import { ExtHostStorage, IExtHostStorage } from "./extHostStorage.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { ActivationKind, checkProposedApiEnabled, isProposedApiEnabled, setProposedApiUsageReporter, setEnabledApiProposalsFallbackExperiment } from "../../services/extensions/common/extensions.js";
import { ExtensionDescriptionRegistry } from "../../services/extensions/common/extensionDescriptionRegistry.js";
import * as errors from "../../../base/common/errors.js";
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet } from "../../../platform/extensions/common/extensions.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { ExtensionGlobalMemento, ExtensionMemento } from "./extHostMemento.js";
import { RemoteAuthorityResolverError, ExtensionKind, ExtensionMode, ManagedResolvedAuthority as ExtHostManagedResolvedAuthority } from "./extHostTypes.js";
import { RemoteAuthorityResolverErrorCode, getRemoteAuthorityPrefix, ManagedRemoteConnection, WebSocketRemoteConnection } from "../../../platform/remote/common/remoteAuthorityResolver.js";
import { IInstantiationService, createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { IExtensionStoragePaths } from "./extHostStoragePaths.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ServiceCollection } from "../../../platform/instantiation/common/serviceCollection.js";
import { IExtHostTunnelService } from "./extHostTunnelService.js";
import { IExtHostTerminalService } from "./extHostTerminalService.js";
import { IExtHostLanguageModels } from "./extHostLanguageModels.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { checkActivateWorkspaceContainsExtension } from "../../services/extensions/common/workspaceContains.js";
import { ExtHostSecretState, IExtHostSecretState } from "./extHostSecretState.js";
import { ExtensionSecrets } from "./extHostSecrets.js";
import { Schemas } from "../../../base/common/network.js";
import { IExtHostLocalizationService } from "./extHostLocalizationService.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { isCI, setTimeout0 } from "../../../base/common/platform.js";
import { IExtHostManagedSockets } from "./extHostManagedSockets.js";
const IHostUtils = createDecorator("IHostUtils");
let AbstractExtHostExtensionService = class extends Disposable {
  constructor(instaService, hostUtils, extHostContext, extHostWorkspace, extHostConfiguration, logService, initData, storagePath, extHostTunnelService, extHostTerminalService, extHostLocalizationService, _extHostManagedSockets, _extHostLanguageModels) {
    super();
    this._extHostManagedSockets = _extHostManagedSockets;
    this._extHostLanguageModels = _extHostLanguageModels;
    this._onDidChangeRemoteConnectionData = this._register(new Emitter());
    this.onDidChangeRemoteConnectionData = this._onDidChangeRemoteConnectionData.event;
    this._realPathCache = /* @__PURE__ */ new Map();
    this._isTerminating = false;
    this._hostUtils = hostUtils;
    this._extHostContext = extHostContext;
    this._initData = initData;
    this._extHostWorkspace = extHostWorkspace;
    this._extHostConfiguration = extHostConfiguration;
    this._logService = logService;
    this._extHostTunnelService = extHostTunnelService;
    this._extHostTerminalService = extHostTerminalService;
    this._extHostLocalizationService = extHostLocalizationService;
    this._mainThreadWorkspaceProxy = this._extHostContext.getProxy(MainContext.MainThreadWorkspace);
    this._mainThreadTelemetryProxy = this._extHostContext.getProxy(MainContext.MainThreadTelemetry);
    this._mainThreadExtensionsProxy = this._extHostContext.getProxy(MainContext.MainThreadExtensionService);
    this._almostReadyToRunExtensions = new Barrier();
    this._readyToStartExtensionHost = new Barrier();
    this._readyToRunExtensions = new Barrier();
    this._eagerExtensionsActivated = new Barrier();
    this._activationEventsReader = new SyncedActivationEventsReader(this._initData.extensions.activationEvents);
    this._globalRegistry = new ExtensionDescriptionRegistry(this._activationEventsReader, this._initData.extensions.allExtensions);
    const myExtensionsSet = new ExtensionIdentifierSet(this._initData.extensions.myExtensions);
    this._myRegistry = new ExtensionDescriptionRegistry(
      this._activationEventsReader,
      filterExtensions(this._globalRegistry, myExtensionsSet)
    );
    if (isCI) {
      this._logService.info(`Creating extension host with the following global extensions: ${printExtIds(this._globalRegistry)}`);
      this._logService.info(`Creating extension host with the following local extensions: ${printExtIds(this._myRegistry)}`);
    }
    this._storage = new ExtHostStorage(this._extHostContext, this._logService);
    this._secretState = new ExtHostSecretState(this._extHostContext);
    this._storagePath = storagePath;
    this._instaService = this._store.add(instaService.createChild(new ServiceCollection(
      [IExtHostStorage, this._storage],
      [IExtHostSecretState, this._secretState]
    )));
    this._activator = this._register(new ExtensionsActivator(
      this._myRegistry,
      this._globalRegistry,
      {
        onExtensionActivationError: (extensionId, error, missingExtensionDependency) => {
          this._mainThreadExtensionsProxy.$onExtensionActivationError(extensionId, errors.transformErrorForSerialization(error), missingExtensionDependency);
        },
        actualActivateExtension: async (extensionId, reason) => {
          if (ExtensionDescriptionRegistry.isHostExtension(extensionId, this._myRegistry, this._globalRegistry)) {
            await this._mainThreadExtensionsProxy.$activateExtension(extensionId, reason);
            return new HostExtension();
          }
          const extensionDescription = this._myRegistry.getExtensionDescription(extensionId);
          return this._activateExtension(extensionDescription, reason);
        }
      },
      this._logService
    ));
    this._extensionPathIndex = null;
    this._resolvers = /* @__PURE__ */ Object.create(null);
    this._started = false;
    this._remoteConnectionData = this._initData.remote.connectionData;
    this._register(setProposedApiUsageReporter((usage) => this._reportProposedApiUsage(usage)));
    this._register(setEnabledApiProposalsFallbackExperiment(this._initData.enabledApiProposalsFallback, this._initData.quality));
  }
  _reportProposedApiUsage(usage) {
    this._mainThreadTelemetryProxy.$publicLog2("extensionProposedApiNotEnabled", {
      extensionId: usage.extensionId,
      proposalName: usage.proposalName
    });
  }
  getRemoteConnectionData() {
    return this._remoteConnectionData;
  }
  async initialize() {
    try {
      await this._beforeAlmostReadyToRunExtensions();
      this._almostReadyToRunExtensions.open();
      await this._extHostWorkspace.waitForInitializeCall();
      performance.mark("code/extHost/ready");
      this._readyToStartExtensionHost.open();
      if (this._initData.autoStart) {
        this._startExtensionHost();
      }
    } catch (err) {
      errors.onUnexpectedError(err);
    }
  }
  async _deactivateAll() {
    this._storagePath.onWillDeactivateAll();
    let allPromises = [];
    try {
      const allExtensions = this._myRegistry.getAllExtensionDescriptions();
      const allExtensionsIds = allExtensions.map((ext) => ext.identifier);
      const activatedExtensions = allExtensionsIds.filter((id) => this.isActivated(id));
      allPromises = activatedExtensions.map((extensionId) => {
        return this._deactivate(extensionId);
      });
    } catch (err) {
    }
    await Promise.all(allPromises);
  }
  terminate(reason, code = 0) {
    if (this._isTerminating) {
      return;
    }
    this._isTerminating = true;
    this._logService.info(`Extension host terminating: ${reason}`);
    this._logService.flush();
    this._extHostTerminalService.dispose();
    this._activator.dispose();
    errors.setUnexpectedErrorHandler((err) => {
      this._logService.error(err);
    });
    this._extHostContext.dispose();
    const extensionsDeactivated = this._deactivateAll();
    Promise.race([timeout(5e3), extensionsDeactivated]).finally(() => {
      if (this._hostUtils.pid) {
        this._logService.info(`Extension host with pid ${this._hostUtils.pid} exiting with code ${code}`);
      } else {
        this._logService.info(`Extension host exiting with code ${code}`);
      }
      this._logService.flush();
      this._logService.dispose();
      this._hostUtils.exit(code);
    });
  }
  isActivated(extensionId) {
    if (this._readyToRunExtensions.isOpen()) {
      return this._activator.isActivated(extensionId);
    }
    return false;
  }
  async getExtension(extensionId) {
    const ext = await this._mainThreadExtensionsProxy.$getExtension(extensionId);
    return ext && {
      ...ext,
      identifier: new ExtensionIdentifier(ext.identifier.value),
      extensionLocation: URI.revive(ext.extensionLocation)
    };
  }
  _activateByEvent(activationEvent, startup) {
    return this._activator.activateByEvent(activationEvent, startup);
  }
  _activateById(extensionId, reason) {
    return this._activator.activateById(extensionId, reason);
  }
  activateByIdWithErrors(extensionId, reason) {
    return this._activateById(extensionId, reason).then(() => {
      const extension = this._activator.getActivatedExtension(extensionId);
      if (extension.activationFailed) {
        return Promise.reject(extension.activationFailedError);
      }
      return void 0;
    });
  }
  getExtensionRegistry() {
    return this._readyToRunExtensions.wait().then((_) => this._myRegistry);
  }
  getExtensionExports(extensionId) {
    if (this._readyToRunExtensions.isOpen()) {
      return this._activator.getActivatedExtension(extensionId).exports;
    } else {
      try {
        return this._activator.getActivatedExtension(extensionId).exports;
      } catch (err) {
        return null;
      }
    }
  }
  /**
   * Applies realpath to file-uris and returns all others uris unmodified.
   * The real path is cached for the lifetime of the extension host.
   */
  async _realPathExtensionUri(uri) {
    if (uri.scheme === Schemas.file && this._hostUtils.fsRealpath) {
      const fsPath = uri.fsPath;
      if (!this._realPathCache.has(fsPath)) {
        this._realPathCache.set(fsPath, this._hostUtils.fsRealpath(fsPath));
      }
      const realpathValue = await this._realPathCache.get(fsPath);
      return URI.file(realpathValue);
    }
    return uri;
  }
  // create trie to enable fast 'filename -> extension id' look up
  async getExtensionPathIndex() {
    if (!this._extensionPathIndex) {
      this._extensionPathIndex = this._createExtensionPathIndex(this._myRegistry.getAllExtensionDescriptions()).then((searchTree) => {
        return new ExtensionPaths(searchTree);
      });
    }
    return this._extensionPathIndex;
  }
  /**
   * create trie to enable fast 'filename -> extension id' look up
   */
  async _createExtensionPathIndex(extensions) {
    const tst = TernarySearchTree.forUris((key) => {
      return extUriBiasedIgnorePathCase.ignorePathCasing(key);
    });
    await Promise.all(extensions.map(async (ext) => {
      if (this._getEntryPoint(ext)) {
        const uri = await this._realPathExtensionUri(ext.extensionLocation);
        tst.set(uri, ext);
      }
    }));
    return tst;
  }
  _deactivate(extensionId) {
    let result = Promise.resolve(void 0);
    if (!this._readyToRunExtensions.isOpen()) {
      return result;
    }
    if (!this._activator.isActivated(extensionId)) {
      return result;
    }
    const extension = this._activator.getActivatedExtension(extensionId);
    if (!extension) {
      return result;
    }
    try {
      if (typeof extension.module.deactivate === "function") {
        result = Promise.resolve(extension.module.deactivate()).then(void 0, (err) => {
          this._logService.error(err);
          return Promise.resolve(void 0);
        });
      }
    } catch (err) {
      this._logService.error(`An error occurred when deactivating the extension '${extensionId.value}':`);
      this._logService.error(err);
    }
    try {
      extension.disposable.dispose();
    } catch (err) {
      this._logService.error(`An error occurred when disposing the subscriptions for extension '${extensionId.value}':`);
      this._logService.error(err);
    }
    return result;
  }
  // --- impl
  async _activateExtension(extensionDescription, reason) {
    if (!this._initData.remote.isRemote) {
      await this._mainThreadExtensionsProxy.$onWillActivateExtension(extensionDescription.identifier);
    } else {
      this._mainThreadExtensionsProxy.$onWillActivateExtension(extensionDescription.identifier);
    }
    return this._doActivateExtension(extensionDescription, reason).then((activatedExtension) => {
      const activationTimes = activatedExtension.activationTimes;
      this._mainThreadExtensionsProxy.$onDidActivateExtension(extensionDescription.identifier, activationTimes.codeLoadingTime, activationTimes.activateCallTime, activationTimes.activateResolvedTime, reason);
      this._logExtensionActivationTimes(extensionDescription, reason, "success", activationTimes);
      return activatedExtension;
    }, (err) => {
      this._logExtensionActivationTimes(extensionDescription, reason, "failure");
      throw err;
    });
  }
  _logExtensionActivationTimes(extensionDescription, reason, outcome, activationTimes) {
    const event = getTelemetryActivationEvent(extensionDescription, reason);
    this._mainThreadTelemetryProxy.$publicLog2("extensionActivationTimes", {
      ...event,
      ...activationTimes || {},
      outcome
    });
  }
  _doActivateExtension(extensionDescription, reason) {
    const event = getTelemetryActivationEvent(extensionDescription, reason);
    this._mainThreadTelemetryProxy.$publicLog2("activatePlugin", event);
    const entryPoint = this._getEntryPoint(extensionDescription);
    if (!entryPoint) {
      return Promise.resolve(new EmptyExtension(ExtensionActivationTimes.NONE));
    }
    this._logService.info(`ExtensionService#_doActivateExtension ${extensionDescription.identifier.value}, startup: ${reason.startup}, activationEvent: '${reason.activationEvent}'${extensionDescription.identifier.value !== reason.extensionId.value ? `, root cause: ${reason.extensionId.value}` : ``}`);
    this._logService.flush();
    const isESM = this._isESM(extensionDescription);
    const extensionInternalStore = new DisposableStore();
    const activationTimesBuilder = new ExtensionActivationTimesBuilder(reason.startup);
    return Promise.all([
      isESM ? this._loadESMModule(extensionDescription, joinPath(extensionDescription.extensionLocation, entryPoint), activationTimesBuilder) : this._loadCommonJSModule(extensionDescription, joinPath(extensionDescription.extensionLocation, entryPoint), activationTimesBuilder),
      this._loadExtensionContext(extensionDescription, extensionInternalStore)
    ]).then((values) => {
      performance.mark(`code/extHost/willActivateExtension/${extensionDescription.identifier.value}`);
      return AbstractExtHostExtensionService._callActivate(this._logService, extensionDescription.identifier, values[0], values[1], extensionInternalStore, activationTimesBuilder);
    }).then((activatedExtension) => {
      performance.mark(`code/extHost/didActivateExtension/${extensionDescription.identifier.value}`);
      return activatedExtension;
    });
  }
  _loadExtensionContext(extensionDescription, extensionInternalStore) {
    const languageModelAccessInformation = this._extHostLanguageModels.createLanguageModelAccessInformation(extensionDescription);
    const globalState = extensionInternalStore.add(new ExtensionGlobalMemento(extensionDescription, this._storage));
    const workspaceState = extensionInternalStore.add(new ExtensionMemento(extensionDescription.identifier.value, false, this._storage));
    const secrets = extensionInternalStore.add(new ExtensionSecrets(extensionDescription, this._secretState));
    const extensionMode = extensionDescription.isUnderDevelopment ? this._initData.environment.extensionTestsLocationURI ? ExtensionMode.Test : ExtensionMode.Development : ExtensionMode.Production;
    const extensionKind = this._initData.remote.isRemote ? ExtensionKind.Workspace : ExtensionKind.UI;
    this._logService.trace(`ExtensionService#loadExtensionContext ${extensionDescription.identifier.value}`);
    return Promise.all([
      globalState.whenReady,
      workspaceState.whenReady,
      this._storagePath.whenReady
    ]).then(() => {
      const that = this;
      let extension;
      let messagePassingProtocol;
      const messagePort = isProposedApiEnabled(extensionDescription, "ipc") ? this._initData.messagePorts?.get(ExtensionIdentifier.toKey(extensionDescription.identifier)) : void 0;
      return Object.freeze({
        globalState,
        workspaceState,
        secrets,
        subscriptions: [],
        get languageModelAccessInformation() {
          return languageModelAccessInformation;
        },
        get extensionUri() {
          return extensionDescription.extensionLocation;
        },
        get extensionPath() {
          return extensionDescription.extensionLocation.fsPath;
        },
        asAbsolutePath(relativePath) {
          return path.join(extensionDescription.extensionLocation.fsPath, relativePath);
        },
        get storagePath() {
          return that._storagePath.workspaceValue(extensionDescription)?.fsPath;
        },
        get globalStoragePath() {
          return that._storagePath.globalValue(extensionDescription).fsPath;
        },
        get logPath() {
          return path.join(that._initData.logsLocation.fsPath, extensionDescription.identifier.value);
        },
        get logUri() {
          return URI.joinPath(that._initData.logsLocation, extensionDescription.identifier.value);
        },
        get storageUri() {
          return that._storagePath.workspaceValue(extensionDescription);
        },
        get globalStorageUri() {
          return that._storagePath.globalValue(extensionDescription);
        },
        get extensionMode() {
          return extensionMode;
        },
        get extension() {
          if (extension === void 0) {
            extension = new Extension(that, extensionDescription.identifier, extensionDescription, extensionKind, false);
          }
          return extension;
        },
        get extensionRuntime() {
          checkProposedApiEnabled(extensionDescription, "extensionRuntime");
          return that.extensionRuntime;
        },
        get environmentVariableCollection() {
          return that._extHostTerminalService.getEnvironmentVariableCollection(extensionDescription);
        },
        get messagePassingProtocol() {
          if (!messagePassingProtocol) {
            if (!messagePort) {
              return void 0;
            }
            const onDidReceiveMessage = Event.buffer(Event.fromDOMEventEmitter(messagePort, "message", (e) => e.data), "onDidReceiveMessage");
            messagePort.start();
            messagePassingProtocol = {
              onDidReceiveMessage,
              // eslint-disable-next-line local/code-no-any-casts
              postMessage: messagePort.postMessage.bind(messagePort)
            };
          }
          return messagePassingProtocol;
        }
      });
    });
  }
  static _callActivate(logService, extensionId, extensionModule, context, extensionInternalStore, activationTimesBuilder) {
    extensionModule = extensionModule || {
      activate: void 0,
      deactivate: void 0
    };
    return this._callActivateOptional(logService, extensionId, extensionModule, context, activationTimesBuilder).then((extensionExports) => {
      return new ActivatedExtension(false, null, activationTimesBuilder.build(), extensionModule, extensionExports, toDisposable(() => {
        extensionInternalStore.dispose();
        dispose(context.subscriptions);
      }));
    });
  }
  static _callActivateOptional(logService, extensionId, extensionModule, context, activationTimesBuilder) {
    if (typeof extensionModule.activate === "function") {
      try {
        activationTimesBuilder.activateCallStart();
        logService.trace(`ExtensionService#_callActivateOptional ${extensionId.value}`);
        const activateResult = extensionModule.activate.apply(globalThis, [context]);
        activationTimesBuilder.activateCallStop();
        activationTimesBuilder.activateResolveStart();
        return Promise.resolve(activateResult).then((value) => {
          activationTimesBuilder.activateResolveStop();
          return value;
        });
      } catch (err) {
        return Promise.reject(err);
      }
    } else {
      return Promise.resolve(extensionModule);
    }
  }
  // -- eager activation
  _activateOneStartupFinished(desc, activationEvent) {
    this._activateById(desc.identifier, {
      startup: false,
      extensionId: desc.identifier,
      activationEvent
    }).then(void 0, (err) => {
      this._logService.error(err);
    });
  }
  _activateAllStartupFinishedDeferred(extensions, start = 0) {
    const timeBudget = 50;
    const startTime = Date.now();
    setTimeout0(() => {
      for (let i = start; i < extensions.length; i += 1) {
        const desc = extensions[i];
        for (const activationEvent of desc.activationEvents ?? []) {
          if (activationEvent === "onStartupFinished") {
            if (Date.now() - startTime > timeBudget) {
              this._activateAllStartupFinishedDeferred(extensions, i);
              break;
            } else {
              this._activateOneStartupFinished(desc, activationEvent);
            }
          }
        }
      }
    });
  }
  _activateAllStartupFinished() {
    this._mainThreadExtensionsProxy.$setPerformanceMarks(performance.getMarks());
    this._extHostConfiguration.getConfigProvider().then((configProvider) => {
      const shouldDeferActivation = configProvider.getConfiguration("extensions.experimental").get("deferredStartupFinishedActivation");
      const allExtensionDescriptions = this._myRegistry.getAllExtensionDescriptions();
      if (shouldDeferActivation) {
        this._activateAllStartupFinishedDeferred(allExtensionDescriptions);
      } else {
        for (const desc of allExtensionDescriptions) {
          if (desc.activationEvents) {
            for (const activationEvent of desc.activationEvents) {
              if (activationEvent === "onStartupFinished") {
                this._activateOneStartupFinished(desc, activationEvent);
              }
            }
          }
        }
      }
    });
  }
  // Handle "eager" activation extensions
  _handleEagerExtensions() {
    const starActivation = this._activateByEvent("*", true).then(void 0, (err) => {
      this._logService.error(err);
    });
    this._register(this._extHostWorkspace.onDidChangeWorkspace((e) => this._handleWorkspaceContainsEagerExtensions(e.added)));
    const folders = this._extHostWorkspace.workspace ? this._extHostWorkspace.workspace.folders : [];
    const workspaceContainsActivation = this._handleWorkspaceContainsEagerExtensions(folders);
    const remoteResolverActivation = this._handleRemoteResolverEagerExtensions();
    const eagerExtensionsActivation = Promise.all([remoteResolverActivation, starActivation, workspaceContainsActivation]).then(() => {
    });
    Promise.race([eagerExtensionsActivation, timeout(1e4)]).then(() => {
      this._activateAllStartupFinished();
    });
    return eagerExtensionsActivation;
  }
  _handleWorkspaceContainsEagerExtensions(folders) {
    if (folders.length === 0) {
      return Promise.resolve(void 0);
    }
    return Promise.all(
      this._myRegistry.getAllExtensionDescriptions().map((desc) => {
        return this._handleWorkspaceContainsEagerExtension(folders, desc);
      })
    ).then(() => {
    });
  }
  async _handleWorkspaceContainsEagerExtension(folders, desc) {
    if (this.isActivated(desc.identifier)) {
      return;
    }
    const localWithRemote = !this._initData.remote.isRemote && !!this._initData.remote.authority;
    const host = {
      logService: this._logService,
      folders: folders.map((folder) => folder.uri),
      forceUsingSearch: localWithRemote || !this._hostUtils.fsExists,
      exists: (uri) => this._hostUtils.fsExists(uri.fsPath),
      checkExists: (folders2, includes, token) => this._mainThreadWorkspaceProxy.$checkExists(folders2, includes, token)
    };
    const result = await checkActivateWorkspaceContainsExtension(host, desc);
    if (!result) {
      return;
    }
    return this._activateById(desc.identifier, { startup: true, extensionId: desc.identifier, activationEvent: result.activationEvent }).then(void 0, (err) => this._logService.error(err));
  }
  async _handleRemoteResolverEagerExtensions() {
    if (this._initData.remote.authority) {
      return this._activateByEvent(`onResolveRemoteAuthority:${this._initData.remote.authority}`, false);
    }
  }
  async $extensionTestsExecute() {
    await this._eagerExtensionsActivated.wait();
    try {
      return await this._doHandleExtensionTests();
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
  async _doHandleExtensionTests() {
    const { extensionDevelopmentLocationURI, extensionTestsLocationURI } = this._initData.environment;
    if (!extensionDevelopmentLocationURI || !extensionTestsLocationURI) {
      throw new Error(nls.localize("extensionTestError1", "Cannot load test runner."));
    }
    const extensionDescription = (await this.getExtensionPathIndex()).findSubstr(extensionTestsLocationURI);
    const isESM = this._isESM(extensionDescription, extensionTestsLocationURI.path);
    const testRunner = await (isESM ? this._loadESMModule(null, extensionTestsLocationURI, new ExtensionActivationTimesBuilder(false)) : this._loadCommonJSModule(null, extensionTestsLocationURI, new ExtensionActivationTimesBuilder(false)));
    if (!testRunner || typeof testRunner.run !== "function") {
      throw new Error(nls.localize("extensionTestError", "Path {0} does not point to a valid extension test runner.", extensionTestsLocationURI.toString()));
    }
    return new Promise((resolve, reject) => {
      const oldTestRunnerCallback = (error, failures) => {
        if (error) {
          if (isCI) {
            this._logService.error(`Test runner called back with error`, error);
          }
          reject(error);
        } else {
          if (isCI) {
            if (failures) {
              this._logService.info(`Test runner called back with ${failures} failures.`);
            } else {
              this._logService.info(`Test runner called back with successful outcome.`);
            }
          }
          resolve(
            typeof failures === "number" && failures > 0 ? 1 : 0
            /* OK */
          );
        }
      };
      const extensionTestsPath = originalFSPath(extensionTestsLocationURI);
      const runResult = testRunner.run(extensionTestsPath, oldTestRunnerCallback);
      if (runResult && runResult.then) {
        runResult.then(() => {
          if (isCI) {
            this._logService.info(`Test runner finished successfully.`);
          }
          resolve(0);
        }).catch((err) => {
          if (isCI) {
            this._logService.error(`Test runner finished with error`, err);
          }
          reject(err instanceof Error && err.stack ? err.stack : String(err));
        });
      }
    });
  }
  _startExtensionHost() {
    if (this._started) {
      throw new Error(`Extension host is already started!`);
    }
    this._started = true;
    return this._readyToStartExtensionHost.wait().then(() => this._readyToRunExtensions.open()).then(() => {
      return Promise.race([this._activator.waitForActivatingExtensions(), timeout(1e3)]);
    }).then(() => this._handleEagerExtensions()).then(() => {
      this._eagerExtensionsActivated.open();
      this._logService.info(`Eager extensions activated`);
    });
  }
  // -- called by extensions
  registerRemoteAuthorityResolver(authorityPrefix, resolver) {
    this._resolvers[authorityPrefix] = resolver;
    return toDisposable(() => {
      delete this._resolvers[authorityPrefix];
    });
  }
  async getRemoteExecServer(remoteAuthority) {
    const { resolver } = await this._activateAndGetResolver(remoteAuthority);
    return resolver?.resolveExecServer?.(remoteAuthority, { resolveAttempt: 0 });
  }
  // -- called by main thread
  async _activateAndGetResolver(remoteAuthority) {
    const authorityPlusIndex = remoteAuthority.indexOf("+");
    if (authorityPlusIndex === -1) {
      throw new RemoteAuthorityResolverError(`Not an authority that can be resolved!`, RemoteAuthorityResolverErrorCode.InvalidAuthority);
    }
    const authorityPrefix = remoteAuthority.substr(0, authorityPlusIndex);
    await this._almostReadyToRunExtensions.wait();
    await this._activateByEvent(`onResolveRemoteAuthority:${authorityPrefix}`, false);
    return { authorityPrefix, resolver: this._resolvers[authorityPrefix] };
  }
  async $resolveAuthority(remoteAuthorityChain, resolveAttempt) {
    const sw = StopWatch.create(false);
    const prefix = () => `[resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthorityChain)},${resolveAttempt})][${sw.elapsed()}ms] `;
    const logInfo = (msg) => this._logService.info(`${prefix()}${msg}`);
    const logWarning = (msg) => this._logService.warn(`${prefix()}${msg}`);
    const logError = (msg, err = void 0) => this._logService.error(`${prefix()}${msg}`, err);
    const normalizeError = (err) => {
      if (err instanceof RemoteAuthorityResolverError) {
        return {
          type: "error",
          error: {
            code: err._code,
            message: err._message,
            detail: err._detail
          }
        };
      }
      throw err;
    };
    const getResolver = async (remoteAuthority) => {
      logInfo(`activating resolver for ${remoteAuthority}...`);
      const { resolver, authorityPrefix } = await this._activateAndGetResolver(remoteAuthority);
      if (!resolver) {
        logError(`no resolver for ${authorityPrefix}`);
        throw new RemoteAuthorityResolverError(`No remote extension installed to resolve ${authorityPrefix}.`, RemoteAuthorityResolverErrorCode.NoResolverFound);
      }
      return { resolver, authorityPrefix, remoteAuthority };
    };
    const chain = remoteAuthorityChain.split(/@|%40/g).reverse();
    logInfo(`activating remote resolvers ${chain.join(" -> ")}`);
    let resolvers;
    try {
      resolvers = await Promise.all(chain.map(getResolver)).catch(async (e) => {
        if (!(e instanceof RemoteAuthorityResolverError) || e._code !== RemoteAuthorityResolverErrorCode.InvalidAuthority) {
          throw e;
        }
        logWarning(`resolving nested authorities failed: ${e.message}`);
        return [await getResolver(remoteAuthorityChain)];
      });
    } catch (e) {
      return normalizeError(e);
    }
    const intervalLogger = new IntervalTimer();
    intervalLogger.cancelAndSet(() => logInfo("waiting..."), 1e3);
    let result;
    let execServer;
    for (const [i, { authorityPrefix, resolver, remoteAuthority }] of resolvers.entries()) {
      try {
        if (i === resolvers.length - 1) {
          logInfo(`invoking final resolve()...`);
          performance.mark(`code/extHost/willResolveAuthority/${authorityPrefix}`);
          result = await resolver.resolve(remoteAuthority, { resolveAttempt, execServer });
          performance.mark(`code/extHost/didResolveAuthorityOK/${authorityPrefix}`);
          logInfo(`setting tunnel factory...`);
          this._register(await this._extHostTunnelService.setTunnelFactory(
            resolver,
            ExtHostManagedResolvedAuthority.isManagedResolvedAuthority(result) ? result : void 0
          ));
        } else {
          logInfo(`invoking resolveExecServer() for ${remoteAuthority}`);
          performance.mark(`code/extHost/willResolveExecServer/${authorityPrefix}`);
          execServer = await resolver.resolveExecServer?.(remoteAuthority, { resolveAttempt, execServer });
          if (!execServer) {
            throw new RemoteAuthorityResolverError(`Exec server was not available for ${remoteAuthority}`, RemoteAuthorityResolverErrorCode.NoResolverFound);
          }
          performance.mark(`code/extHost/didResolveExecServerOK/${authorityPrefix}`);
        }
      } catch (e) {
        performance.mark(`code/extHost/didResolveAuthorityError/${authorityPrefix}`);
        logError(`returned an error`, e);
        intervalLogger.dispose();
        return normalizeError(e);
      }
    }
    intervalLogger.dispose();
    const tunnelInformation = {
      environmentTunnels: result.environmentTunnels,
      features: result.tunnelFeatures ? {
        elevation: result.tunnelFeatures.elevation,
        privacyOptions: result.tunnelFeatures.privacyOptions,
        protocol: result.tunnelFeatures.protocol === void 0 ? true : result.tunnelFeatures.protocol
      } : void 0
    };
    const options = {
      extensionHostEnv: result.extensionHostEnv,
      isTrusted: result.isTrusted,
      authenticationSession: result.authenticationSessionForInitializingExtensions ? { id: result.authenticationSessionForInitializingExtensions.id, providerId: result.authenticationSessionForInitializingExtensions.providerId } : void 0
    };
    logInfo(`returned ${ExtHostManagedResolvedAuthority.isManagedResolvedAuthority(result) ? "managed authority" : `${result.host}:${result.port}`}`);
    let authority;
    if (ExtHostManagedResolvedAuthority.isManagedResolvedAuthority(result)) {
      const socketFactoryId = resolveAttempt;
      this._extHostManagedSockets.setFactory(socketFactoryId, result.makeConnection);
      authority = {
        authority: remoteAuthorityChain,
        connectTo: new ManagedRemoteConnection(socketFactoryId),
        connectionToken: result.connectionToken
      };
    } else {
      authority = {
        authority: remoteAuthorityChain,
        connectTo: new WebSocketRemoteConnection(result.host, result.port),
        connectionToken: result.connectionToken
      };
    }
    return {
      type: "ok",
      value: {
        authority,
        options,
        tunnelInformation
      }
    };
  }
  async $getCanonicalURI(remoteAuthority, uriComponents) {
    this._logService.info(`$getCanonicalURI invoked for authority (${getRemoteAuthorityPrefix(remoteAuthority)})`);
    const { resolver } = await this._activateAndGetResolver(remoteAuthority);
    if (!resolver) {
      return null;
    }
    const uri = URI.revive(uriComponents);
    if (typeof resolver.getCanonicalURI === "undefined") {
      return uri;
    }
    const result = await asPromise(() => resolver.getCanonicalURI(uri));
    if (!result) {
      return uri;
    }
    return result;
  }
  async $startExtensionHost(extensionsDelta) {
    extensionsDelta.toAdd.forEach((extension) => extension.extensionLocation = URI.revive(extension.extensionLocation));
    const { globalRegistry, myExtensions } = applyExtensionsDelta(this._activationEventsReader, this._globalRegistry, this._myRegistry, extensionsDelta);
    const newSearchTree = await this._createExtensionPathIndex(myExtensions);
    const extensionsPaths = await this.getExtensionPathIndex();
    extensionsPaths.setSearchTree(newSearchTree);
    this._globalRegistry.set(globalRegistry.getAllExtensionDescriptions());
    this._myRegistry.set(myExtensions);
    if (isCI) {
      this._logService.info(`$startExtensionHost: global extensions: ${printExtIds(this._globalRegistry)}`);
      this._logService.info(`$startExtensionHost: local extensions: ${printExtIds(this._myRegistry)}`);
    }
    return this._startExtensionHost();
  }
  $activateByEvent(activationEvent, activationKind) {
    if (activationKind === ActivationKind.Immediate) {
      return this._almostReadyToRunExtensions.wait().then((_) => this._activateByEvent(activationEvent, false));
    }
    return this._readyToRunExtensions.wait().then((_) => this._activateByEvent(activationEvent, false));
  }
  async $activate(extensionId, reason) {
    await this._readyToRunExtensions.wait();
    if (!this._myRegistry.getExtensionDescription(extensionId)) {
      return false;
    }
    await this._activateById(extensionId, reason);
    return true;
  }
  async $deltaExtensions(extensionsDelta) {
    extensionsDelta.toAdd.forEach((extension) => extension.extensionLocation = URI.revive(extension.extensionLocation));
    const { globalRegistry, myExtensions } = applyExtensionsDelta(this._activationEventsReader, this._globalRegistry, this._myRegistry, extensionsDelta);
    const newSearchTree = await this._createExtensionPathIndex(myExtensions);
    const extensionsPaths = await this.getExtensionPathIndex();
    extensionsPaths.setSearchTree(newSearchTree);
    this._globalRegistry.set(globalRegistry.getAllExtensionDescriptions());
    this._myRegistry.set(myExtensions);
    if (isCI) {
      this._logService.info(`$deltaExtensions: global extensions: ${printExtIds(this._globalRegistry)}`);
      this._logService.info(`$deltaExtensions: local extensions: ${printExtIds(this._myRegistry)}`);
    }
    return Promise.resolve(void 0);
  }
  async $test_latency(n) {
    return n;
  }
  async $test_up(b) {
    return b.byteLength;
  }
  async $test_down(size) {
    const buff = VSBuffer.alloc(size);
    const value = Math.random() % 256;
    for (let i = 0; i < size; i++) {
      buff.writeUInt8(value, i);
    }
    return buff;
  }
  async $updateRemoteConnectionData(connectionData) {
    this._remoteConnectionData = connectionData;
    this._onDidChangeRemoteConnectionData.fire();
  }
  _isESM(extensionDescription, modulePath) {
    modulePath ??= extensionDescription ? this._getEntryPoint(extensionDescription) : modulePath;
    return modulePath?.endsWith(".mjs") || extensionDescription?.type === "module" && !modulePath?.endsWith(".cjs");
  }
};
AbstractExtHostExtensionService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IHostUtils),
  __decorateParam(2, IExtHostRpcService),
  __decorateParam(3, IExtHostWorkspace),
  __decorateParam(4, IExtHostConfiguration),
  __decorateParam(5, ILogService),
  __decorateParam(6, IExtHostInitDataService),
  __decorateParam(7, IExtensionStoragePaths),
  __decorateParam(8, IExtHostTunnelService),
  __decorateParam(9, IExtHostTerminalService),
  __decorateParam(10, IExtHostLocalizationService),
  __decorateParam(11, IExtHostManagedSockets),
  __decorateParam(12, IExtHostLanguageModels)
], AbstractExtHostExtensionService);
function applyExtensionsDelta(activationEventsReader, oldGlobalRegistry, oldMyRegistry, extensionsDelta) {
  activationEventsReader.addActivationEvents(extensionsDelta.addActivationEvents);
  const globalRegistry = new ExtensionDescriptionRegistry(activationEventsReader, oldGlobalRegistry.getAllExtensionDescriptions());
  globalRegistry.deltaExtensions(extensionsDelta.toAdd, extensionsDelta.toRemove);
  const myExtensionsSet = new ExtensionIdentifierSet(oldMyRegistry.getAllExtensionDescriptions().map((extension) => extension.identifier));
  for (const extensionId of extensionsDelta.myToRemove) {
    myExtensionsSet.delete(extensionId);
  }
  for (const extensionId of extensionsDelta.myToAdd) {
    myExtensionsSet.add(extensionId);
  }
  const myExtensions = filterExtensions(globalRegistry, myExtensionsSet);
  return { globalRegistry, myExtensions };
}
function getTelemetryActivationEvent(extensionDescription, reason) {
  const event = {
    id: extensionDescription.identifier.value,
    name: extensionDescription.name,
    extensionVersion: extensionDescription.version,
    publisherDisplayName: extensionDescription.publisher,
    activationEvents: extensionDescription.activationEvents ? extensionDescription.activationEvents.join(",") : null,
    isBuiltin: extensionDescription.isBuiltin,
    reason: reason.activationEvent,
    reasonId: reason.extensionId.value
  };
  return event;
}
function printExtIds(registry) {
  return registry.getAllExtensionDescriptions().map((ext) => ext.identifier.value).join(",");
}
const IExtHostExtensionService = createDecorator("IExtHostExtensionService");
class Extension {
  #extensionService;
  #originExtensionId;
  #identifier;
  constructor(extensionService, originExtensionId, description, kind, isFromDifferentExtensionHost) {
    this.#extensionService = extensionService;
    this.#originExtensionId = originExtensionId;
    this.#identifier = description.identifier;
    this.id = description.identifier.value;
    this.extensionUri = description.extensionLocation;
    this.extensionPath = path.normalize(originalFSPath(description.extensionLocation));
    this.packageJSON = description;
    this.extensionKind = kind;
    this.isFromDifferentExtensionHost = isFromDifferentExtensionHost;
  }
  get isActive() {
    return this.#extensionService.isActivated(this.#identifier);
  }
  get exports() {
    if (this.packageJSON.api === "none" || this.isFromDifferentExtensionHost) {
      return void 0;
    }
    return this.#extensionService.getExtensionExports(this.#identifier);
  }
  async activate() {
    if (this.isFromDifferentExtensionHost) {
      throw new Error("Cannot activate foreign extension");
    }
    await this.#extensionService.activateByIdWithErrors(this.#identifier, { startup: false, extensionId: this.#originExtensionId, activationEvent: "api" });
    return this.exports;
  }
}
function filterExtensions(globalRegistry, desiredExtensions) {
  return globalRegistry.getAllExtensionDescriptions().filter(
    (extension) => desiredExtensions.has(extension.identifier)
  );
}
class ExtensionPaths {
  constructor(_searchTree) {
    this._searchTree = _searchTree;
  }
  setSearchTree(searchTree) {
    this._searchTree = searchTree;
  }
  findSubstr(key) {
    return this._searchTree.findSubstr(key);
  }
  forEach(callback) {
    return this._searchTree.forEach(callback);
  }
}
class SyncedActivationEventsReader {
  constructor(activationEvents) {
    this._map = new ExtensionIdentifierMap();
    this.addActivationEvents(activationEvents);
  }
  readActivationEvents(extensionDescription) {
    return this._map.get(extensionDescription.identifier) ?? [];
  }
  addActivationEvents(activationEvents) {
    for (const extensionId of Object.keys(activationEvents)) {
      this._map.set(extensionId, activationEvents[extensionId]);
    }
  }
}
export {
  AbstractExtHostExtensionService,
  Extension,
  ExtensionPaths,
  IExtHostExtensionService,
  IHostUtils
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0RXh0ZW5zaW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHBlcmZvcm1hbmNlIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IG9yaWdpbmFsRlNQYXRoLCBqb2luUGF0aCwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXNQcm9taXNlLCBCYXJyaWVyLCBJbnRlcnZhbFRpbWVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZGlzcG9zZSwgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRlcm5hcnlTZWFyY2hUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGVybmFyeVNlYXJjaFRyZWUuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEV4dGVuc2lvblNlcnZpY2VTaGFwZSwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRFeHRlbnNpb25TZXJ2aWNlU2hhcGUsIE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSwgTWFpblRocmVhZFdvcmtzcGFjZVNoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbkRlbHRhLCBJRXh0ZW5zaW9uSG9zdEluaXREYXRhIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdFByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb25maWd1cmF0aW9uLCBJRXh0SG9zdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuL2V4dEhvc3RDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjdGl2YXRlZEV4dGVuc2lvbiwgRW1wdHlFeHRlbnNpb24sIEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lcywgRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzQnVpbGRlciwgRXh0ZW5zaW9uc0FjdGl2YXRvciwgSUV4dGVuc2lvbkFQSSwgSUV4dGVuc2lvbk1vZHVsZSwgSG9zdEV4dGVuc2lvbiwgRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzRnJhZ21lbnQgfSBmcm9tICcuL2V4dEhvc3RFeHRlbnNpb25BY3RpdmF0b3IuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFN0b3JhZ2UsIElFeHRIb3N0U3RvcmFnZSB9IGZyb20gJy4vZXh0SG9zdFN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFdvcmtzcGFjZSwgSUV4dEhvc3RXb3Jrc3BhY2UgfSBmcm9tICcuL2V4dEhvc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgTWlzc2luZ0V4dGVuc2lvbkRlcGVuZGVuY3ksIEFjdGl2YXRpb25LaW5kLCBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCwgaXNQcm9wb3NlZEFwaUVuYWJsZWQsIEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24sIElQcm9wb3NlZEFwaVVzYWdlLCBzZXRQcm9wb3NlZEFwaVVzYWdlUmVwb3J0ZXIsIHNldEVuYWJsZWRBcGlQcm9wb3NhbHNGYWxsYmFja0V4cGVyaW1lbnQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnksIElBY3RpdmF0aW9uRXZlbnRzUmVhZGVyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBFeHRlbnNpb25JZGVudGlmaWVyU2V0LCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkdsb2JhbE1lbWVudG8sIEV4dGVuc2lvbk1lbWVudG8gfSBmcm9tICcuL2V4dEhvc3RNZW1lbnRvLmpzJztcbmltcG9ydCB7IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IsIEV4dGVuc2lvbktpbmQsIEV4dGVuc2lvbk1vZGUsIEV4dGVuc2lvblJ1bnRpbWUsIE1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eSBhcyBFeHRIb3N0TWFuYWdlZFJlc29sdmVkQXV0aG9yaXR5IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRBdXRob3JpdHksIFJlc29sdmVkT3B0aW9ucywgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUsIElSZW1vdGVDb25uZWN0aW9uRGF0YSwgZ2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4LCBUdW5uZWxJbmZvcm1hdGlvbiwgTWFuYWdlZFJlbW90ZUNvbm5lY3Rpb24sIFdlYlNvY2tldFJlbW90ZUNvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU3RvcmFnZVBhdGhzIH0gZnJvbSAnLi9leHRIb3N0U3RvcmFnZVBhdGhzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFR1bm5lbFNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RUdW5uZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0VGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMgfSBmcm9tICcuL2V4dEhvc3RMYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25BY3RpdmF0aW9uSG9zdCwgY2hlY2tBY3RpdmF0ZVdvcmtzcGFjZUNvbnRhaW5zRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vd29ya3NwYWNlQ29udGFpbnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFNlY3JldFN0YXRlLCBJRXh0SG9zdFNlY3JldFN0YXRlIH0gZnJvbSAnLi9leHRIb3N0U2VjcmV0U3RhdGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uU2VjcmV0cyB9IGZyb20gJy4vZXh0SG9zdFNlY3JldHMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVBdXRob3JpdHlSZXN1bHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25Ib3N0UHJveHkuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RMb2NhbGl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0TG9jYWxpemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgaXNDSSwgc2V0VGltZW91dDAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdE1hbmFnZWRTb2NrZXRzIH0gZnJvbSAnLi9leHRIb3N0TWFuYWdlZFNvY2tldHMuanMnO1xuaW1wb3J0IHsgRHRvIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcblxuaW50ZXJmYWNlIElUZXN0UnVubmVyIHtcblx0LyoqIE9sZCB0ZXN0IHJ1bm5lciBBUEksIGFzIGV4cG9ydGVkIGZyb20gYHZzY29kZS9saWIvdGVzdHJ1bm5lcmAgKi9cblx0cnVuKHRlc3RzUm9vdDogc3RyaW5nLCBjbGI6IChlcnJvcjogRXJyb3IsIGZhaWx1cmVzPzogbnVtYmVyKSA9PiB2b2lkKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElOZXdUZXN0UnVubmVyIHtcblx0LyoqIE5ldyB0ZXN0IHJ1bm5lciBBUEksIGFzIGV4cGxhaW5lZCBpbiB0aGUgZXh0ZW5zaW9uIHRlc3QgZG9jICovXG5cdHJ1bigpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY29uc3QgSUhvc3RVdGlscyA9IGNyZWF0ZURlY29yYXRvcjxJSG9zdFV0aWxzPignSUhvc3RVdGlscycpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElIb3N0VXRpbHMge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHBpZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRleGl0KGNvZGU6IG51bWJlcik6IHZvaWQ7XG5cdGZzRXhpc3RzPyhwYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRmc1JlYWxwYXRoPyhwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz47XG59XG5cbnR5cGUgVGVsZW1ldHJ5QWN0aXZhdGlvbkV2ZW50RnJhZ21lbnQgPSB7XG5cdGlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIGFuIGV4dGVuc2lvbicgfTtcblx0bmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgZXh0ZW5zaW9uJyB9O1xuXHRleHRlbnNpb25WZXJzaW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB2ZXJzaW9uIG9mIHRoZSBleHRlbnNpb24nIH07XG5cdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHB1Ymxpc2hlciBvZiB0aGUgZXh0ZW5zaW9uJyB9O1xuXHRhY3RpdmF0aW9uRXZlbnRzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQWxsIGFjdGl2YXRpb24gZXZlbnRzIG9mIHRoZSBleHRlbnNpb24nIH07XG5cdGlzQnVpbHRpbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lmIHRoZSBleHRlbnNpb24gaXMgYnVpbHRpbiBvciBnaXQgaW5zdGFsbGVkJyB9O1xuXHRyZWFzb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYWN0aXZhdGlvbiBldmVudCcgfTtcblx0cmVhc29uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGFjdGl2YXRpb24gZXZlbnQnIH07XG59O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBFeHRIb3N0RXh0ZW5zaW9uU2VydmljZVNoYXBlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0YWJzdHJhY3QgcmVhZG9ubHkgZXh0ZW5zaW9uUnVudGltZTogRXh0ZW5zaW9uUnVudGltZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlbW90ZUNvbm5lY3Rpb25EYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVJlbW90ZUNvbm5lY3Rpb25EYXRhID0gdGhpcy5fb25EaWRDaGFuZ2VSZW1vdGVDb25uZWN0aW9uRGF0YS5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2hvc3RVdGlsczogSUhvc3RVdGlscztcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9pbml0RGF0YTogSUV4dGVuc2lvbkhvc3RJbml0RGF0YTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9leHRIb3N0Q29udGV4dDogSUV4dEhvc3RScGNTZXJ2aWNlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2luc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2V4dEhvc3RXb3Jrc3BhY2U6IEV4dEhvc3RXb3Jrc3BhY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZXh0SG9zdENvbmZpZ3VyYXRpb246IEV4dEhvc3RDb25maWd1cmF0aW9uO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2V4dEhvc3RUdW5uZWxTZXJ2aWNlOiBJRXh0SG9zdFR1bm5lbFNlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZXh0SG9zdFRlcm1pbmFsU2VydmljZTogSUV4dEhvc3RUZXJtaW5hbFNlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZXh0SG9zdExvY2FsaXphdGlvblNlcnZpY2U6IElFeHRIb3N0TG9jYWxpemF0aW9uU2VydmljZTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX21haW5UaHJlYWRXb3Jrc3BhY2VQcm94eTogTWFpblRocmVhZFdvcmtzcGFjZVNoYXBlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX21haW5UaHJlYWRUZWxlbWV0cnlQcm94eTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX21haW5UaHJlYWRFeHRlbnNpb25zUHJveHk6IE1haW5UaHJlYWRFeHRlbnNpb25TZXJ2aWNlU2hhcGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWxtb3N0UmVhZHlUb1J1bkV4dGVuc2lvbnM6IEJhcnJpZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlYWR5VG9TdGFydEV4dGVuc2lvbkhvc3Q6IEJhcnJpZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlYWR5VG9SdW5FeHRlbnNpb25zOiBCYXJyaWVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lYWdlckV4dGVuc2lvbnNBY3RpdmF0ZWQ6IEJhcnJpZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZhdGlvbkV2ZW50c1JlYWRlcjogU3luY2VkQWN0aXZhdGlvbkV2ZW50c1JlYWRlcjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9teVJlZ2lzdHJ5OiBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2dsb2JhbFJlZ2lzdHJ5OiBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlOiBFeHRIb3N0U3RvcmFnZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VjcmV0U3RhdGU6IEV4dEhvc3RTZWNyZXRTdGF0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVBhdGg6IElFeHRlbnNpb25TdG9yYWdlUGF0aHM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2YXRvcjogRXh0ZW5zaW9uc0FjdGl2YXRvcjtcblx0cHJpdmF0ZSBfZXh0ZW5zaW9uUGF0aEluZGV4OiBQcm9taXNlPEV4dGVuc2lvblBhdGhzPiB8IG51bGw7XG5cdHByaXZhdGUgX3JlYWxQYXRoQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxzdHJpbmc+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVyczogeyBbYXV0aG9yaXR5UHJlZml4OiBzdHJpbmddOiB2c2NvZGUuUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIgfTtcblxuXHRwcml2YXRlIF9zdGFydGVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9pc1Rlcm1pbmF0aW5nOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3JlbW90ZUNvbm5lY3Rpb25EYXRhOiBJUmVtb3RlQ29ubmVjdGlvbkRhdGEgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElIb3N0VXRpbHMgaG9zdFV0aWxzOiBJSG9zdFV0aWxzLFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUV4dEhvc3RXb3Jrc3BhY2UgZXh0SG9zdFdvcmtzcGFjZTogSUV4dEhvc3RXb3Jrc3BhY2UsXG5cdFx0QElFeHRIb3N0Q29uZmlndXJhdGlvbiBleHRIb3N0Q29uZmlndXJhdGlvbjogSUV4dEhvc3RDb25maWd1cmF0aW9uLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgaW5pdERhdGE6IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU3RvcmFnZVBhdGhzIHN0b3JhZ2VQYXRoOiBJRXh0ZW5zaW9uU3RvcmFnZVBhdGhzLFxuXHRcdEBJRXh0SG9zdFR1bm5lbFNlcnZpY2UgZXh0SG9zdFR1bm5lbFNlcnZpY2U6IElFeHRIb3N0VHVubmVsU2VydmljZSxcblx0XHRASUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UgZXh0SG9zdFRlcm1pbmFsU2VydmljZTogSUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElFeHRIb3N0TG9jYWxpemF0aW9uU2VydmljZSBleHRIb3N0TG9jYWxpemF0aW9uU2VydmljZTogSUV4dEhvc3RMb2NhbGl6YXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdE1hbmFnZWRTb2NrZXRzIHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RNYW5hZ2VkU29ja2V0czogSUV4dEhvc3RNYW5hZ2VkU29ja2V0cyxcblx0XHRASUV4dEhvc3RMYW5ndWFnZU1vZGVscyBwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0TGFuZ3VhZ2VNb2RlbHM6IElFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faG9zdFV0aWxzID0gaG9zdFV0aWxzO1xuXHRcdHRoaXMuX2V4dEhvc3RDb250ZXh0ID0gZXh0SG9zdENvbnRleHQ7XG5cdFx0dGhpcy5faW5pdERhdGEgPSBpbml0RGF0YTtcblxuXHRcdHRoaXMuX2V4dEhvc3RXb3Jrc3BhY2UgPSBleHRIb3N0V29ya3NwYWNlO1xuXHRcdHRoaXMuX2V4dEhvc3RDb25maWd1cmF0aW9uID0gZXh0SG9zdENvbmZpZ3VyYXRpb247XG5cdFx0dGhpcy5fbG9nU2VydmljZSA9IGxvZ1NlcnZpY2U7XG5cdFx0dGhpcy5fZXh0SG9zdFR1bm5lbFNlcnZpY2UgPSBleHRIb3N0VHVubmVsU2VydmljZTtcblx0XHR0aGlzLl9leHRIb3N0VGVybWluYWxTZXJ2aWNlID0gZXh0SG9zdFRlcm1pbmFsU2VydmljZTtcblx0XHR0aGlzLl9leHRIb3N0TG9jYWxpemF0aW9uU2VydmljZSA9IGV4dEhvc3RMb2NhbGl6YXRpb25TZXJ2aWNlO1xuXG5cdFx0dGhpcy5fbWFpblRocmVhZFdvcmtzcGFjZVByb3h5ID0gdGhpcy5fZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZFdvcmtzcGFjZSk7XG5cdFx0dGhpcy5fbWFpblRocmVhZFRlbGVtZXRyeVByb3h5ID0gdGhpcy5fZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZFRlbGVtZXRyeSk7XG5cdFx0dGhpcy5fbWFpblRocmVhZEV4dGVuc2lvbnNQcm94eSA9IHRoaXMuX2V4dEhvc3RDb250ZXh0LmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRFeHRlbnNpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2FsbW9zdFJlYWR5VG9SdW5FeHRlbnNpb25zID0gbmV3IEJhcnJpZXIoKTtcblx0XHR0aGlzLl9yZWFkeVRvU3RhcnRFeHRlbnNpb25Ib3N0ID0gbmV3IEJhcnJpZXIoKTtcblx0XHR0aGlzLl9yZWFkeVRvUnVuRXh0ZW5zaW9ucyA9IG5ldyBCYXJyaWVyKCk7XG5cdFx0dGhpcy5fZWFnZXJFeHRlbnNpb25zQWN0aXZhdGVkID0gbmV3IEJhcnJpZXIoKTtcblx0XHR0aGlzLl9hY3RpdmF0aW9uRXZlbnRzUmVhZGVyID0gbmV3IFN5bmNlZEFjdGl2YXRpb25FdmVudHNSZWFkZXIodGhpcy5faW5pdERhdGEuZXh0ZW5zaW9ucy5hY3RpdmF0aW9uRXZlbnRzKTtcblx0XHR0aGlzLl9nbG9iYWxSZWdpc3RyeSA9IG5ldyBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5KHRoaXMuX2FjdGl2YXRpb25FdmVudHNSZWFkZXIsIHRoaXMuX2luaXREYXRhLmV4dGVuc2lvbnMuYWxsRXh0ZW5zaW9ucyk7XG5cdFx0Y29uc3QgbXlFeHRlbnNpb25zU2V0ID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJTZXQodGhpcy5faW5pdERhdGEuZXh0ZW5zaW9ucy5teUV4dGVuc2lvbnMpO1xuXHRcdHRoaXMuX215UmVnaXN0cnkgPSBuZXcgRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeShcblx0XHRcdHRoaXMuX2FjdGl2YXRpb25FdmVudHNSZWFkZXIsXG5cdFx0XHRmaWx0ZXJFeHRlbnNpb25zKHRoaXMuX2dsb2JhbFJlZ2lzdHJ5LCBteUV4dGVuc2lvbnNTZXQpXG5cdFx0KTtcblxuXHRcdGlmIChpc0NJKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYENyZWF0aW5nIGV4dGVuc2lvbiBob3N0IHdpdGggdGhlIGZvbGxvd2luZyBnbG9iYWwgZXh0ZW5zaW9uczogJHtwcmludEV4dElkcyh0aGlzLl9nbG9iYWxSZWdpc3RyeSl9YCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYENyZWF0aW5nIGV4dGVuc2lvbiBob3N0IHdpdGggdGhlIGZvbGxvd2luZyBsb2NhbCBleHRlbnNpb25zOiAke3ByaW50RXh0SWRzKHRoaXMuX215UmVnaXN0cnkpfWApO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0b3JhZ2UgPSBuZXcgRXh0SG9zdFN0b3JhZ2UodGhpcy5fZXh0SG9zdENvbnRleHQsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX3NlY3JldFN0YXRlID0gbmV3IEV4dEhvc3RTZWNyZXRTdGF0ZSh0aGlzLl9leHRIb3N0Q29udGV4dCk7XG5cdFx0dGhpcy5fc3RvcmFnZVBhdGggPSBzdG9yYWdlUGF0aDtcblxuXHRcdHRoaXMuX2luc3RhU2VydmljZSA9IHRoaXMuX3N0b3JlLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lFeHRIb3N0U3RvcmFnZSwgdGhpcy5fc3RvcmFnZV0sXG5cdFx0XHRbSUV4dEhvc3RTZWNyZXRTdGF0ZSwgdGhpcy5fc2VjcmV0U3RhdGVdXG5cdFx0KSkpO1xuXG5cdFx0dGhpcy5fYWN0aXZhdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEV4dGVuc2lvbnNBY3RpdmF0b3IoXG5cdFx0XHR0aGlzLl9teVJlZ2lzdHJ5LFxuXHRcdFx0dGhpcy5fZ2xvYmFsUmVnaXN0cnksXG5cdFx0XHR7XG5cdFx0XHRcdG9uRXh0ZW5zaW9uQWN0aXZhdGlvbkVycm9yOiAoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGVycm9yOiBFcnJvciwgbWlzc2luZ0V4dGVuc2lvbkRlcGVuZGVuY3k6IE1pc3NpbmdFeHRlbnNpb25EZXBlbmRlbmN5IHwgbnVsbCk6IHZvaWQgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX21haW5UaHJlYWRFeHRlbnNpb25zUHJveHkuJG9uRXh0ZW5zaW9uQWN0aXZhdGlvbkVycm9yKGV4dGVuc2lvbklkLCBlcnJvcnMudHJhbnNmb3JtRXJyb3JGb3JTZXJpYWxpemF0aW9uKGVycm9yKSwgbWlzc2luZ0V4dGVuc2lvbkRlcGVuZGVuY3kpO1xuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdGFjdHVhbEFjdGl2YXRlRXh0ZW5zaW9uOiBhc3luYyAoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFByb21pc2U8QWN0aXZhdGVkRXh0ZW5zaW9uPiA9PiB7XG5cdFx0XHRcdFx0aWYgKEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkuaXNIb3N0RXh0ZW5zaW9uKGV4dGVuc2lvbklkLCB0aGlzLl9teVJlZ2lzdHJ5LCB0aGlzLl9nbG9iYWxSZWdpc3RyeSkpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX21haW5UaHJlYWRFeHRlbnNpb25zUHJveHkuJGFjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbklkLCByZWFzb24pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBIb3N0RXh0ZW5zaW9uKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkRlc2NyaXB0aW9uID0gdGhpcy5fbXlSZWdpc3RyeS5nZXRFeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb25JZCkhO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9hY3RpdmF0ZUV4dGVuc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgcmVhc29uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Vcblx0XHQpKTtcblx0XHR0aGlzLl9leHRlbnNpb25QYXRoSW5kZXggPSBudWxsO1xuXHRcdHRoaXMuX3Jlc29sdmVycyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fc3RhcnRlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3JlbW90ZUNvbm5lY3Rpb25EYXRhID0gdGhpcy5faW5pdERhdGEucmVtb3RlLmNvbm5lY3Rpb25EYXRhO1xuXG5cdFx0Ly8gcmVwb3J0IHRlbGVtZXRyeSB3aGVuIGFuIGV4dGVuc2lvbiBhdHRlbXB0cyB0byB1c2UgYSBwcm9wb3NlZCBBUEkgaXQgaXMgbm90IGVudGl0bGVkIHRvIHVzZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHNldFByb3Bvc2VkQXBpVXNhZ2VSZXBvcnRlcih1c2FnZSA9PiB0aGlzLl9yZXBvcnRQcm9wb3NlZEFwaVVzYWdlKHVzYWdlKSkpO1xuXG5cdFx0Ly8gZXhwZXJpbWVudDogZ3JhbnQgcHJvcG9zZWQgQVBJIGFjY2VzcyB0byBleHRlbnNpb24vcHJvcG9zYWwgY29tYmluYXRpb25zIHRoYXQgaGF2ZSBub3Rcblx0XHQvLyBkZWNsYXJlZCB0aGUgcHJvcG9zYWwgdGhlbXNlbHZlcyAob25seSB0YWtlcyBlZmZlY3Qgb24gYHN0YWJsZWApXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2V0RW5hYmxlZEFwaVByb3Bvc2Fsc0ZhbGxiYWNrRXhwZXJpbWVudCh0aGlzLl9pbml0RGF0YS5lbmFibGVkQXBpUHJvcG9zYWxzRmFsbGJhY2ssIHRoaXMuX2luaXREYXRhLnF1YWxpdHkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydFByb3Bvc2VkQXBpVXNhZ2UodXNhZ2U6IElQcm9wb3NlZEFwaVVzYWdlKTogdm9pZCB7XG5cdFx0dHlwZSBQcm9wb3NlZEFwaVVzYWdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2FsZXhyMDAnO1xuXHRcdFx0Y29tbWVudDogJ0FuIGV4dGVuc2lvbiBhdHRlbXB0ZWQgdG8gdXNlIGEgcHJvcG9zZWQgQVBJIGl0IGhhcyBub3QgYmVlbiBhbGxvd2xpc3RlZCB0byB1c2UuJztcblx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGV4dGVuc2lvbiBhdHRlbXB0aW5nIHRvIHVzZSB0aGUgcHJvcG9zZWQgQVBJLicgfTtcblx0XHRcdHByb3Bvc2FsTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSBwcm9wb3NlZCBBUEkgdGhlIGV4dGVuc2lvbiBpcyBub3QgZW50aXRsZWQgdG8gdXNlLicgfTtcblx0XHR9O1xuXHRcdHR5cGUgUHJvcG9zZWRBcGlVc2FnZUV2ZW50ID0ge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0XHRcdHByb3Bvc2FsTmFtZTogc3RyaW5nO1xuXHRcdH07XG5cdFx0dGhpcy5fbWFpblRocmVhZFRlbGVtZXRyeVByb3h5LiRwdWJsaWNMb2cyPFByb3Bvc2VkQXBpVXNhZ2VFdmVudCwgUHJvcG9zZWRBcGlVc2FnZUNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uUHJvcG9zZWRBcGlOb3RFbmFibGVkJywge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHVzYWdlLmV4dGVuc2lvbklkLFxuXHRcdFx0cHJvcG9zYWxOYW1lOiB1c2FnZS5wcm9wb3NhbE5hbWVcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRSZW1vdGVDb25uZWN0aW9uRGF0YSgpOiBJUmVtb3RlQ29ubmVjdGlvbkRhdGEgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlQ29ubmVjdGlvbkRhdGE7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXG5cdFx0XHRhd2FpdCB0aGlzLl9iZWZvcmVBbG1vc3RSZWFkeVRvUnVuRXh0ZW5zaW9ucygpO1xuXHRcdFx0dGhpcy5fYWxtb3N0UmVhZHlUb1J1bkV4dGVuc2lvbnMub3BlbigpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLl9leHRIb3N0V29ya3NwYWNlLndhaXRGb3JJbml0aWFsaXplQ2FsbCgpO1xuXHRcdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9leHRIb3N0L3JlYWR5Jyk7XG5cdFx0XHR0aGlzLl9yZWFkeVRvU3RhcnRFeHRlbnNpb25Ib3N0Lm9wZW4oKTtcblxuXHRcdFx0aWYgKHRoaXMuX2luaXREYXRhLmF1dG9TdGFydCkge1xuXHRcdFx0XHR0aGlzLl9zdGFydEV4dGVuc2lvbkhvc3QoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RlYWN0aXZhdGVBbGwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc3RvcmFnZVBhdGgub25XaWxsRGVhY3RpdmF0ZUFsbCgpO1xuXG5cdFx0bGV0IGFsbFByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYWxsRXh0ZW5zaW9ucyA9IHRoaXMuX215UmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCk7XG5cdFx0XHRjb25zdCBhbGxFeHRlbnNpb25zSWRzID0gYWxsRXh0ZW5zaW9ucy5tYXAoZXh0ID0+IGV4dC5pZGVudGlmaWVyKTtcblx0XHRcdGNvbnN0IGFjdGl2YXRlZEV4dGVuc2lvbnMgPSBhbGxFeHRlbnNpb25zSWRzLmZpbHRlcihpZCA9PiB0aGlzLmlzQWN0aXZhdGVkKGlkKSk7XG5cblx0XHRcdGFsbFByb21pc2VzID0gYWN0aXZhdGVkRXh0ZW5zaW9ucy5tYXAoKGV4dGVuc2lvbklkKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9kZWFjdGl2YXRlKGV4dGVuc2lvbklkKTtcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gVE9ETzogd3JpdGUgdG8gbG9nIG9uY2Ugd2UgaGF2ZSBvbmVcblx0XHR9XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoYWxsUHJvbWlzZXMpO1xuXHR9XG5cblx0cHVibGljIHRlcm1pbmF0ZShyZWFzb246IHN0cmluZywgY29kZTogbnVtYmVyID0gMCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1Rlcm1pbmF0aW5nKSB7XG5cdFx0XHQvLyB3ZSBhcmUgYWxyZWFkeSBzaHV0dGluZyBkb3duLi4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzVGVybWluYXRpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgRXh0ZW5zaW9uIGhvc3QgdGVybWluYXRpbmc6ICR7cmVhc29ufWApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZmx1c2goKTtcblxuXHRcdHRoaXMuX2V4dEhvc3RUZXJtaW5hbFNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2FjdGl2YXRvci5kaXNwb3NlKCk7XG5cblx0XHRlcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoZXJyKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0fSk7XG5cblx0XHQvLyBJbnZhbGlkYXRlIGFsbCBwcm94aWVzXG5cdFx0dGhpcy5fZXh0SG9zdENvbnRleHQuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0RlYWN0aXZhdGVkID0gdGhpcy5fZGVhY3RpdmF0ZUFsbCgpO1xuXG5cdFx0Ly8gR2l2ZSBleHRlbnNpb25zIGF0IG1vc3QgNSBzZWNvbmRzIHRvIHdyYXAgdXAgYW55IGFzeW5jIGRlYWN0aXZhdGUsIHRoZW4gZXhpdFxuXHRcdFByb21pc2UucmFjZShbdGltZW91dCg1MDAwKSwgZXh0ZW5zaW9uc0RlYWN0aXZhdGVkXSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faG9zdFV0aWxzLnBpZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEV4dGVuc2lvbiBob3N0IHdpdGggcGlkICR7dGhpcy5faG9zdFV0aWxzLnBpZH0gZXhpdGluZyB3aXRoIGNvZGUgJHtjb2RlfWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBFeHRlbnNpb24gaG9zdCBleGl0aW5nIHdpdGggY29kZSAke2NvZGV9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmZsdXNoKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2hvc3RVdGlscy5leGl0KGNvZGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGlzQWN0aXZhdGVkKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3JlYWR5VG9SdW5FeHRlbnNpb25zLmlzT3BlbigpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdG9yLmlzQWN0aXZhdGVkKGV4dGVuc2lvbklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldEV4dGVuc2lvbihleHRlbnNpb25JZDogc3RyaW5nKTogUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleHQgPSBhd2FpdCB0aGlzLl9tYWluVGhyZWFkRXh0ZW5zaW9uc1Byb3h5LiRnZXRFeHRlbnNpb24oZXh0ZW5zaW9uSWQpO1xuXHRcdHJldHVybiBleHQgJiYge1xuXHRcdFx0Li4uZXh0LFxuXHRcdFx0aWRlbnRpZmllcjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoZXh0LmlkZW50aWZpZXIudmFsdWUpLFxuXHRcdFx0ZXh0ZW5zaW9uTG9jYXRpb246IFVSSS5yZXZpdmUoZXh0LmV4dGVuc2lvbkxvY2F0aW9uKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50OiBzdHJpbmcsIHN0YXJ0dXA6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdG9yLmFjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQsIHN0YXJ0dXApO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZhdGVCeUlkKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCByZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdG9yLmFjdGl2YXRlQnlJZChleHRlbnNpb25JZCwgcmVhc29uKTtcblx0fVxuXG5cdHB1YmxpYyBhY3RpdmF0ZUJ5SWRXaXRoRXJyb3JzKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCByZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZhdGVCeUlkKGV4dGVuc2lvbklkLCByZWFzb24pLnRoZW4oKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5fYWN0aXZhdG9yLmdldEFjdGl2YXRlZEV4dGVuc2lvbihleHRlbnNpb25JZCk7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uLmFjdGl2YXRpb25GYWlsZWQpIHtcblx0XHRcdFx0Ly8gYWN0aXZhdGlvbiBmYWlsZWQgPT4gYnViYmxlIHVwIHRoZSBlcnJvciBhcyB0aGUgcHJvbWlzZSByZXN1bHRcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGV4dGVuc2lvbi5hY3RpdmF0aW9uRmFpbGVkRXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFeHRlbnNpb25SZWdpc3RyeSgpOiBQcm9taXNlPEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnk+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVhZHlUb1J1bkV4dGVuc2lvbnMud2FpdCgpLnRoZW4oXyA9PiB0aGlzLl9teVJlZ2lzdHJ5KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFeHRlbnNpb25FeHBvcnRzKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogSUV4dGVuc2lvbkFQSSB8IG51bGwgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9yZWFkeVRvUnVuRXh0ZW5zaW9ucy5pc09wZW4oKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2YXRvci5nZXRBY3RpdmF0ZWRFeHRlbnNpb24oZXh0ZW5zaW9uSWQpLmV4cG9ydHM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hY3RpdmF0b3IuZ2V0QWN0aXZhdGVkRXh0ZW5zaW9uKGV4dGVuc2lvbklkKS5leHBvcnRzO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIHJlYWxwYXRoIHRvIGZpbGUtdXJpcyBhbmQgcmV0dXJucyBhbGwgb3RoZXJzIHVyaXMgdW5tb2RpZmllZC5cblx0ICogVGhlIHJlYWwgcGF0aCBpcyBjYWNoZWQgZm9yIHRoZSBsaWZldGltZSBvZiB0aGUgZXh0ZW5zaW9uIGhvc3QuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWFsUGF0aEV4dGVuc2lvblVyaSh1cmk6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiB0aGlzLl9ob3N0VXRpbHMuZnNSZWFscGF0aCkge1xuXHRcdFx0Y29uc3QgZnNQYXRoID0gdXJpLmZzUGF0aDtcblx0XHRcdGlmICghdGhpcy5fcmVhbFBhdGhDYWNoZS5oYXMoZnNQYXRoKSkge1xuXHRcdFx0XHR0aGlzLl9yZWFsUGF0aENhY2hlLnNldChmc1BhdGgsIHRoaXMuX2hvc3RVdGlscy5mc1JlYWxwYXRoKGZzUGF0aCkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVhbHBhdGhWYWx1ZSA9IGF3YWl0IHRoaXMuX3JlYWxQYXRoQ2FjaGUuZ2V0KGZzUGF0aCkhO1xuXHRcdFx0cmV0dXJuIFVSSS5maWxlKHJlYWxwYXRoVmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0Ly8gY3JlYXRlIHRyaWUgdG8gZW5hYmxlIGZhc3QgJ2ZpbGVuYW1lIC0+IGV4dGVuc2lvbiBpZCcgbG9vayB1cFxuXHRwdWJsaWMgYXN5bmMgZ2V0RXh0ZW5zaW9uUGF0aEluZGV4KCk6IFByb21pc2U8RXh0ZW5zaW9uUGF0aHM+IHtcblx0XHRpZiAoIXRoaXMuX2V4dGVuc2lvblBhdGhJbmRleCkge1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uUGF0aEluZGV4ID0gdGhpcy5fY3JlYXRlRXh0ZW5zaW9uUGF0aEluZGV4KHRoaXMuX215UmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkpLnRoZW4oKHNlYXJjaFRyZWUpID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBFeHRlbnNpb25QYXRocyhzZWFyY2hUcmVlKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uUGF0aEluZGV4O1xuXHR9XG5cblx0LyoqXG5cdCAqIGNyZWF0ZSB0cmllIHRvIGVuYWJsZSBmYXN0ICdmaWxlbmFtZSAtPiBleHRlbnNpb24gaWQnIGxvb2sgdXBcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUV4dGVuc2lvblBhdGhJbmRleChleHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSk6IFByb21pc2U8VGVybmFyeVNlYXJjaFRyZWU8VVJJLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24+PiB7XG5cdFx0Y29uc3QgdHN0ID0gVGVybmFyeVNlYXJjaFRyZWUuZm9yVXJpczxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+KGtleSA9PiB7XG5cdFx0XHQvLyB1c2luZyB0aGUgZGVmYXVsdC9iaWFzZWQgZXh0VXJpLXV0aWwgYmVjYXVzZSB0aGUgSUV4dEhvc3RGaWxlU3lzdGVtSW5mby1zZXJ2aWNlXG5cdFx0XHQvLyBpc24ndCByZWFkeSB0byBiZSB1c2VkIHlldCwgZS5nIHRoZSBrbm93bGVkZ2UgYWJvdXQgYGZpbGVgIHByb3RvY29sIGFuZCBvdGhlcnNcblx0XHRcdC8vIGNvbWVzIGluIHdoaWxlIHRoaXMgY29kZSBydW5zXG5cdFx0XHRyZXR1cm4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaWdub3JlUGF0aENhc2luZyhrZXkpO1xuXHRcdH0pO1xuXHRcdC8vIGNvbnN0IHRzdCA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXM8SUV4dGVuc2lvbkRlc2NyaXB0aW9uPihrZXkgPT4gdHJ1ZSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZXh0ZW5zaW9ucy5tYXAoYXN5bmMgKGV4dCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2dldEVudHJ5UG9pbnQoZXh0KSkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBhd2FpdCB0aGlzLl9yZWFsUGF0aEV4dGVuc2lvblVyaShleHQuZXh0ZW5zaW9uTG9jYXRpb24pO1xuXHRcdFx0XHR0c3Quc2V0KHVyaSwgZXh0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIHRzdDtcblx0fVxuXG5cdHByaXZhdGUgX2RlYWN0aXZhdGUoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgcmVzdWx0ID0gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHRpZiAoIXRoaXMuX3JlYWR5VG9SdW5FeHRlbnNpb25zLmlzT3BlbigpKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fYWN0aXZhdG9yLmlzQWN0aXZhdGVkKGV4dGVuc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLl9hY3RpdmF0b3IuZ2V0QWN0aXZhdGVkRXh0ZW5zaW9uKGV4dGVuc2lvbklkKTtcblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHQvLyBjYWxsIGRlYWN0aXZhdGUgaWYgYXZhaWxhYmxlXG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0eXBlb2YgZXh0ZW5zaW9uLm1vZHVsZS5kZWFjdGl2YXRlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHJlc3VsdCA9IFByb21pc2UucmVzb2x2ZShleHRlbnNpb24ubW9kdWxlLmRlYWN0aXZhdGUoKSkudGhlbih1bmRlZmluZWQsIChlcnIpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEFuIGVycm9yIG9jY3VycmVkIHdoZW4gZGVhY3RpdmF0aW5nIHRoZSBleHRlbnNpb24gJyR7ZXh0ZW5zaW9uSWQudmFsdWV9JzpgKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHR9XG5cblx0XHQvLyBjbGVhbiB1cCBzdWJzY3JpcHRpb25zXG5cdFx0dHJ5IHtcblx0XHRcdGV4dGVuc2lvbi5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEFuIGVycm9yIG9jY3VycmVkIHdoZW4gZGlzcG9zaW5nIHRoZSBzdWJzY3JpcHRpb25zIGZvciBleHRlbnNpb24gJyR7ZXh0ZW5zaW9uSWQudmFsdWV9JzpgKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8gLS0tIGltcGxcblxuXHRwcml2YXRlIGFzeW5jIF9hY3RpdmF0ZUV4dGVuc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCByZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24pOiBQcm9taXNlPEFjdGl2YXRlZEV4dGVuc2lvbj4ge1xuXHRcdGlmICghdGhpcy5faW5pdERhdGEucmVtb3RlLmlzUmVtb3RlKSB7XG5cdFx0XHQvLyBsb2NhbCBleHRlbnNpb24gaG9zdCBwcm9jZXNzXG5cdFx0XHRhd2FpdCB0aGlzLl9tYWluVGhyZWFkRXh0ZW5zaW9uc1Byb3h5LiRvbldpbGxBY3RpdmF0ZUV4dGVuc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gcmVtb3RlIGV4dGVuc2lvbiBob3N0IHByb2Nlc3Ncblx0XHRcdC8vIGRvIG5vdCB3YWl0IGZvciByZW5kZXJlciBjb25maXJtYXRpb25cblx0XHRcdHRoaXMuX21haW5UaHJlYWRFeHRlbnNpb25zUHJveHkuJG9uV2lsbEFjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZG9BY3RpdmF0ZUV4dGVuc2lvbihleHRlbnNpb25EZXNjcmlwdGlvbiwgcmVhc29uKS50aGVuKChhY3RpdmF0ZWRFeHRlbnNpb24pID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2YXRpb25UaW1lcyA9IGFjdGl2YXRlZEV4dGVuc2lvbi5hY3RpdmF0aW9uVGltZXM7XG5cdFx0XHR0aGlzLl9tYWluVGhyZWFkRXh0ZW5zaW9uc1Byb3h5LiRvbkRpZEFjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIGFjdGl2YXRpb25UaW1lcy5jb2RlTG9hZGluZ1RpbWUsIGFjdGl2YXRpb25UaW1lcy5hY3RpdmF0ZUNhbGxUaW1lLCBhY3RpdmF0aW9uVGltZXMuYWN0aXZhdGVSZXNvbHZlZFRpbWUsIHJlYXNvbik7XG5cdFx0XHR0aGlzLl9sb2dFeHRlbnNpb25BY3RpdmF0aW9uVGltZXMoZXh0ZW5zaW9uRGVzY3JpcHRpb24sIHJlYXNvbiwgJ3N1Y2Nlc3MnLCBhY3RpdmF0aW9uVGltZXMpO1xuXHRcdFx0cmV0dXJuIGFjdGl2YXRlZEV4dGVuc2lvbjtcblx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dFeHRlbnNpb25BY3RpdmF0aW9uVGltZXMoZXh0ZW5zaW9uRGVzY3JpcHRpb24sIHJlYXNvbiwgJ2ZhaWx1cmUnKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2xvZ0V4dGVuc2lvbkFjdGl2YXRpb25UaW1lcyhleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCByZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24sIG91dGNvbWU6IHN0cmluZywgYWN0aXZhdGlvblRpbWVzPzogRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzKSB7XG5cdFx0Y29uc3QgZXZlbnQgPSBnZXRUZWxlbWV0cnlBY3RpdmF0aW9uRXZlbnQoZXh0ZW5zaW9uRGVzY3JpcHRpb24sIHJlYXNvbik7XG5cdFx0dHlwZSBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnanJpZWtlbic7XG5cdFx0XHRjb21tZW50OiAnVGltZXN0YW1wcyBmb3IgZXh0ZW5zaW9uIGFjdGl2YXRpb24nO1xuXHRcdFx0b3V0Y29tZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0RpZCBleHRlbnNpb24gYWN0aXZhdGlvbiBzdWNjZWVkIG9yIGZhaWwnIH07XG5cdFx0fSAmIFRlbGVtZXRyeUFjdGl2YXRpb25FdmVudEZyYWdtZW50ICYgRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzRnJhZ21lbnQ7XG5cblx0XHR0eXBlIEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc0V2ZW50ID0ge1xuXHRcdFx0b3V0Y29tZTogc3RyaW5nO1xuXHRcdH0gJiBBY3RpdmF0aW9uVGltZXNFdmVudCAmIFRlbGVtZXRyeUFjdGl2YXRpb25FdmVudDtcblxuXHRcdHR5cGUgQWN0aXZhdGlvblRpbWVzRXZlbnQgPSB7XG5cdFx0XHRzdGFydHVwPzogYm9vbGVhbjtcblx0XHRcdGNvZGVMb2FkaW5nVGltZT86IG51bWJlcjtcblx0XHRcdGFjdGl2YXRlQ2FsbFRpbWU/OiBudW1iZXI7XG5cdFx0XHRhY3RpdmF0ZVJlc29sdmVkVGltZT86IG51bWJlcjtcblx0XHR9O1xuXG5cdFx0dGhpcy5fbWFpblRocmVhZFRlbGVtZXRyeVByb3h5LiRwdWJsaWNMb2cyPEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc0V2ZW50LCBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbkFjdGl2YXRpb25UaW1lcycsIHtcblx0XHRcdC4uLmV2ZW50LFxuXHRcdFx0Li4uKGFjdGl2YXRpb25UaW1lcyB8fCB7fSksXG5cdFx0XHRvdXRjb21lXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9kb0FjdGl2YXRlRXh0ZW5zaW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFByb21pc2U8QWN0aXZhdGVkRXh0ZW5zaW9uPiB7XG5cdFx0Y29uc3QgZXZlbnQgPSBnZXRUZWxlbWV0cnlBY3RpdmF0aW9uRXZlbnQoZXh0ZW5zaW9uRGVzY3JpcHRpb24sIHJlYXNvbik7XG5cdFx0dHlwZSBBY3RpdmF0ZVBsdWdpbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdqcmlla2VuJztcblx0XHRcdGNvbW1lbnQ6ICdEYXRhIGFib3V0IGhvdy93aHkgYW4gZXh0ZW5zaW9uIHdhcyBhY3RpdmF0ZWQnO1xuXHRcdH0gJiBUZWxlbWV0cnlBY3RpdmF0aW9uRXZlbnRGcmFnbWVudDtcblx0XHR0aGlzLl9tYWluVGhyZWFkVGVsZW1ldHJ5UHJveHkuJHB1YmxpY0xvZzI8VGVsZW1ldHJ5QWN0aXZhdGlvbkV2ZW50LCBBY3RpdmF0ZVBsdWdpbkNsYXNzaWZpY2F0aW9uPignYWN0aXZhdGVQbHVnaW4nLCBldmVudCk7XG5cdFx0Y29uc3QgZW50cnlQb2ludCA9IHRoaXMuX2dldEVudHJ5UG9pbnQoZXh0ZW5zaW9uRGVzY3JpcHRpb24pO1xuXHRcdGlmICghZW50cnlQb2ludCkge1xuXHRcdFx0Ly8gVHJlYXQgdGhlIGV4dGVuc2lvbiBhcyBiZWluZyBlbXB0eSA9PiBOT1QgQU4gRVJST1IgQ0FTRVxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShuZXcgRW1wdHlFeHRlbnNpb24oRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzLk5PTkUpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEV4dGVuc2lvblNlcnZpY2UjX2RvQWN0aXZhdGVFeHRlbnNpb24gJHtleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfSwgc3RhcnR1cDogJHtyZWFzb24uc3RhcnR1cH0sIGFjdGl2YXRpb25FdmVudDogJyR7cmVhc29uLmFjdGl2YXRpb25FdmVudH0nJHtleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlICE9PSByZWFzb24uZXh0ZW5zaW9uSWQudmFsdWUgPyBgLCByb290IGNhdXNlOiAke3JlYXNvbi5leHRlbnNpb25JZC52YWx1ZX1gIDogYGB9YCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5mbHVzaCgpO1xuXG5cdFx0Y29uc3QgaXNFU00gPSB0aGlzLl9pc0VTTShleHRlbnNpb25EZXNjcmlwdGlvbik7XG5cblx0XHRjb25zdCBleHRlbnNpb25JbnRlcm5hbFN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpOyAvLyBkaXNwb3NhYmxlcyB0aGF0IGZvbGxvdyB0aGUgZXh0ZW5zaW9uIGxpZmVjeWNsZVxuXHRcdGNvbnN0IGFjdGl2YXRpb25UaW1lc0J1aWxkZXIgPSBuZXcgRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzQnVpbGRlcihyZWFzb24uc3RhcnR1cCk7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKFtcblx0XHRcdGlzRVNNXG5cdFx0XHRcdD8gdGhpcy5fbG9hZEVTTU1vZHVsZTxJRXh0ZW5zaW9uTW9kdWxlPihleHRlbnNpb25EZXNjcmlwdGlvbiwgam9pblBhdGgoZXh0ZW5zaW9uRGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGVudHJ5UG9pbnQpLCBhY3RpdmF0aW9uVGltZXNCdWlsZGVyKVxuXHRcdFx0XHQ6IHRoaXMuX2xvYWRDb21tb25KU01vZHVsZTxJRXh0ZW5zaW9uTW9kdWxlPihleHRlbnNpb25EZXNjcmlwdGlvbiwgam9pblBhdGgoZXh0ZW5zaW9uRGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGVudHJ5UG9pbnQpLCBhY3RpdmF0aW9uVGltZXNCdWlsZGVyKSxcblx0XHRcdHRoaXMuX2xvYWRFeHRlbnNpb25Db250ZXh0KGV4dGVuc2lvbkRlc2NyaXB0aW9uLCBleHRlbnNpb25JbnRlcm5hbFN0b3JlKVxuXHRcdF0pLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZXh0SG9zdC93aWxsQWN0aXZhdGVFeHRlbnNpb24vJHtleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfWApO1xuXHRcdFx0cmV0dXJuIEFic3RyYWN0RXh0SG9zdEV4dGVuc2lvblNlcnZpY2UuX2NhbGxBY3RpdmF0ZSh0aGlzLl9sb2dTZXJ2aWNlLCBleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLCB2YWx1ZXNbMF0sIHZhbHVlc1sxXSwgZXh0ZW5zaW9uSW50ZXJuYWxTdG9yZSwgYWN0aXZhdGlvblRpbWVzQnVpbGRlcik7XG5cdFx0fSkudGhlbigoYWN0aXZhdGVkRXh0ZW5zaW9uKSA9PiB7XG5cdFx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2V4dEhvc3QvZGlkQWN0aXZhdGVFeHRlbnNpb24vJHtleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfWApO1xuXHRcdFx0cmV0dXJuIGFjdGl2YXRlZEV4dGVuc2lvbjtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWRFeHRlbnNpb25Db250ZXh0KGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGV4dGVuc2lvbkludGVybmFsU3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8dnNjb2RlLkV4dGVuc2lvbkNvbnRleHQ+IHtcblxuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxBY2Nlc3NJbmZvcm1hdGlvbiA9IHRoaXMuX2V4dEhvc3RMYW5ndWFnZU1vZGVscy5jcmVhdGVMYW5ndWFnZU1vZGVsQWNjZXNzSW5mb3JtYXRpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb24pO1xuXHRcdGNvbnN0IGdsb2JhbFN0YXRlID0gZXh0ZW5zaW9uSW50ZXJuYWxTdG9yZS5hZGQobmV3IEV4dGVuc2lvbkdsb2JhbE1lbWVudG8oZXh0ZW5zaW9uRGVzY3JpcHRpb24sIHRoaXMuX3N0b3JhZ2UpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTdGF0ZSA9IGV4dGVuc2lvbkludGVybmFsU3RvcmUuYWRkKG5ldyBFeHRlbnNpb25NZW1lbnRvKGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsIGZhbHNlLCB0aGlzLl9zdG9yYWdlKSk7XG5cdFx0Y29uc3Qgc2VjcmV0cyA9IGV4dGVuc2lvbkludGVybmFsU3RvcmUuYWRkKG5ldyBFeHRlbnNpb25TZWNyZXRzKGV4dGVuc2lvbkRlc2NyaXB0aW9uLCB0aGlzLl9zZWNyZXRTdGF0ZSkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbk1vZGUgPSBleHRlbnNpb25EZXNjcmlwdGlvbi5pc1VuZGVyRGV2ZWxvcG1lbnRcblx0XHRcdD8gKHRoaXMuX2luaXREYXRhLmVudmlyb25tZW50LmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkgPyBFeHRlbnNpb25Nb2RlLlRlc3QgOiBFeHRlbnNpb25Nb2RlLkRldmVsb3BtZW50KVxuXHRcdFx0OiBFeHRlbnNpb25Nb2RlLlByb2R1Y3Rpb247XG5cdFx0Y29uc3QgZXh0ZW5zaW9uS2luZCA9IHRoaXMuX2luaXREYXRhLnJlbW90ZS5pc1JlbW90ZSA/IEV4dGVuc2lvbktpbmQuV29ya3NwYWNlIDogRXh0ZW5zaW9uS2luZC5VSTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYEV4dGVuc2lvblNlcnZpY2UjbG9hZEV4dGVuc2lvbkNvbnRleHQgJHtleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfWApO1xuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKFtcblx0XHRcdGdsb2JhbFN0YXRlLndoZW5SZWFkeSxcblx0XHRcdHdvcmtzcGFjZVN0YXRlLndoZW5SZWFkeSxcblx0XHRcdHRoaXMuX3N0b3JhZ2VQYXRoLndoZW5SZWFkeVxuXHRcdF0pLnRoZW4oKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0XHRsZXQgZXh0ZW5zaW9uOiB2c2NvZGUuRXh0ZW5zaW9uPGFueT4gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGxldCBtZXNzYWdlUGFzc2luZ1Byb3RvY29sOiB2c2NvZGUuTWVzc2FnZVBhc3NpbmdQcm90b2NvbCB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG1lc3NhZ2VQb3J0ID0gaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uRGVzY3JpcHRpb24sICdpcGMnKVxuXHRcdFx0XHQ/IHRoaXMuX2luaXREYXRhLm1lc3NhZ2VQb3J0cz8uZ2V0KEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcikpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZTx2c2NvZGUuRXh0ZW5zaW9uQ29udGV4dD4oe1xuXHRcdFx0XHRnbG9iYWxTdGF0ZSxcblx0XHRcdFx0d29ya3NwYWNlU3RhdGUsXG5cdFx0XHRcdHNlY3JldHMsXG5cdFx0XHRcdHN1YnNjcmlwdGlvbnM6IFtdLFxuXHRcdFx0XHRnZXQgbGFuZ3VhZ2VNb2RlbEFjY2Vzc0luZm9ybWF0aW9uKCkgeyByZXR1cm4gbGFuZ3VhZ2VNb2RlbEFjY2Vzc0luZm9ybWF0aW9uOyB9LFxuXHRcdFx0XHRnZXQgZXh0ZW5zaW9uVXJpKCkgeyByZXR1cm4gZXh0ZW5zaW9uRGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb247IH0sXG5cdFx0XHRcdGdldCBleHRlbnNpb25QYXRoKCkgeyByZXR1cm4gZXh0ZW5zaW9uRGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24uZnNQYXRoOyB9LFxuXHRcdFx0XHRhc0Fic29sdXRlUGF0aChyZWxhdGl2ZVBhdGg6IHN0cmluZykgeyByZXR1cm4gcGF0aC5qb2luKGV4dGVuc2lvbkRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLmZzUGF0aCwgcmVsYXRpdmVQYXRoKTsgfSxcblx0XHRcdFx0Z2V0IHN0b3JhZ2VQYXRoKCkgeyByZXR1cm4gdGhhdC5fc3RvcmFnZVBhdGgud29ya3NwYWNlVmFsdWUoZXh0ZW5zaW9uRGVzY3JpcHRpb24pPy5mc1BhdGg7IH0sXG5cdFx0XHRcdGdldCBnbG9iYWxTdG9yYWdlUGF0aCgpIHsgcmV0dXJuIHRoYXQuX3N0b3JhZ2VQYXRoLmdsb2JhbFZhbHVlKGV4dGVuc2lvbkRlc2NyaXB0aW9uKS5mc1BhdGg7IH0sXG5cdFx0XHRcdGdldCBsb2dQYXRoKCkgeyByZXR1cm4gcGF0aC5qb2luKHRoYXQuX2luaXREYXRhLmxvZ3NMb2NhdGlvbi5mc1BhdGgsIGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUpOyB9LFxuXHRcdFx0XHRnZXQgbG9nVXJpKCkgeyByZXR1cm4gVVJJLmpvaW5QYXRoKHRoYXQuX2luaXREYXRhLmxvZ3NMb2NhdGlvbiwgZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSk7IH0sXG5cdFx0XHRcdGdldCBzdG9yYWdlVXJpKCkgeyByZXR1cm4gdGhhdC5fc3RvcmFnZVBhdGgud29ya3NwYWNlVmFsdWUoZXh0ZW5zaW9uRGVzY3JpcHRpb24pOyB9LFxuXHRcdFx0XHRnZXQgZ2xvYmFsU3RvcmFnZVVyaSgpIHsgcmV0dXJuIHRoYXQuX3N0b3JhZ2VQYXRoLmdsb2JhbFZhbHVlKGV4dGVuc2lvbkRlc2NyaXB0aW9uKTsgfSxcblx0XHRcdFx0Z2V0IGV4dGVuc2lvbk1vZGUoKSB7IHJldHVybiBleHRlbnNpb25Nb2RlOyB9LFxuXHRcdFx0XHRnZXQgZXh0ZW5zaW9uKCkge1xuXHRcdFx0XHRcdGlmIChleHRlbnNpb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uID0gbmV3IEV4dGVuc2lvbih0aGF0LCBleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBleHRlbnNpb25EZXNjcmlwdGlvbiwgZXh0ZW5zaW9uS2luZCwgZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZXh0ZW5zaW9uO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgZXh0ZW5zaW9uUnVudGltZSgpIHtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb25EZXNjcmlwdGlvbiwgJ2V4dGVuc2lvblJ1bnRpbWUnKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5leHRlbnNpb25SdW50aW1lO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oKSB7IHJldHVybiB0aGF0Ll9leHRIb3N0VGVybWluYWxTZXJ2aWNlLmdldEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uKTsgfSxcblx0XHRcdFx0Z2V0IG1lc3NhZ2VQYXNzaW5nUHJvdG9jb2woKSB7XG5cdFx0XHRcdFx0aWYgKCFtZXNzYWdlUGFzc2luZ1Byb3RvY29sKSB7XG5cdFx0XHRcdFx0XHRpZiAoIW1lc3NhZ2VQb3J0KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IG9uRGlkUmVjZWl2ZU1lc3NhZ2UgPSBFdmVudC5idWZmZXIoRXZlbnQuZnJvbURPTUV2ZW50RW1pdHRlcihtZXNzYWdlUG9ydCwgJ21lc3NhZ2UnLCBlID0+IGUuZGF0YSksICdvbkRpZFJlY2VpdmVNZXNzYWdlJyk7XG5cdFx0XHRcdFx0XHRtZXNzYWdlUG9ydC5zdGFydCgpO1xuXHRcdFx0XHRcdFx0bWVzc2FnZVBhc3NpbmdQcm90b2NvbCA9IHtcblx0XHRcdFx0XHRcdFx0b25EaWRSZWNlaXZlTWVzc2FnZSxcblx0XHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0XHRcdHBvc3RNZXNzYWdlOiBtZXNzYWdlUG9ydC5wb3N0TWVzc2FnZS5iaW5kKG1lc3NhZ2VQb3J0KSBhcyBhbnlcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIG1lc3NhZ2VQYXNzaW5nUHJvdG9jb2w7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NhbGxBY3RpdmF0ZShsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGV4dGVuc2lvbk1vZHVsZTogSUV4dGVuc2lvbk1vZHVsZSwgY29udGV4dDogdnNjb2RlLkV4dGVuc2lvbkNvbnRleHQsIGV4dGVuc2lvbkludGVybmFsU3RvcmU6IElEaXNwb3NhYmxlLCBhY3RpdmF0aW9uVGltZXNCdWlsZGVyOiBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNCdWlsZGVyKTogUHJvbWlzZTxBY3RpdmF0ZWRFeHRlbnNpb24+IHtcblx0XHQvLyBNYWtlIHN1cmUgdGhlIGV4dGVuc2lvbidzIHN1cmZhY2UgaXMgbm90IHVuZGVmaW5lZFxuXHRcdGV4dGVuc2lvbk1vZHVsZSA9IGV4dGVuc2lvbk1vZHVsZSB8fCB7XG5cdFx0XHRhY3RpdmF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0ZGVhY3RpdmF0ZTogdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdHJldHVybiB0aGlzLl9jYWxsQWN0aXZhdGVPcHRpb25hbChsb2dTZXJ2aWNlLCBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTW9kdWxlLCBjb250ZXh0LCBhY3RpdmF0aW9uVGltZXNCdWlsZGVyKS50aGVuKChleHRlbnNpb25FeHBvcnRzKSA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IEFjdGl2YXRlZEV4dGVuc2lvbihmYWxzZSwgbnVsbCwgYWN0aXZhdGlvblRpbWVzQnVpbGRlci5idWlsZCgpLCBleHRlbnNpb25Nb2R1bGUsIGV4dGVuc2lvbkV4cG9ydHMsIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdGV4dGVuc2lvbkludGVybmFsU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRkaXNwb3NlKGNvbnRleHQuc3Vic2NyaXB0aW9ucyk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY2FsbEFjdGl2YXRlT3B0aW9uYWwobG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBleHRlbnNpb25Nb2R1bGU6IElFeHRlbnNpb25Nb2R1bGUsIGNvbnRleHQ6IHZzY29kZS5FeHRlbnNpb25Db250ZXh0LCBhY3RpdmF0aW9uVGltZXNCdWlsZGVyOiBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNCdWlsZGVyKTogUHJvbWlzZTxJRXh0ZW5zaW9uQVBJPiB7XG5cdFx0aWYgKHR5cGVvZiBleHRlbnNpb25Nb2R1bGUuYWN0aXZhdGUgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFjdGl2YXRpb25UaW1lc0J1aWxkZXIuYWN0aXZhdGVDYWxsU3RhcnQoKTtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZShgRXh0ZW5zaW9uU2VydmljZSNfY2FsbEFjdGl2YXRlT3B0aW9uYWwgJHtleHRlbnNpb25JZC52YWx1ZX1gKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZhdGVSZXN1bHQ6IFByb21pc2U8SUV4dGVuc2lvbkFQST4gPSBleHRlbnNpb25Nb2R1bGUuYWN0aXZhdGUuYXBwbHkoZ2xvYmFsVGhpcywgW2NvbnRleHRdKTtcblx0XHRcdFx0YWN0aXZhdGlvblRpbWVzQnVpbGRlci5hY3RpdmF0ZUNhbGxTdG9wKCk7XG5cblx0XHRcdFx0YWN0aXZhdGlvblRpbWVzQnVpbGRlci5hY3RpdmF0ZVJlc29sdmVTdGFydCgpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGFjdGl2YXRlUmVzdWx0KS50aGVuKCh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdGFjdGl2YXRpb25UaW1lc0J1aWxkZXIuYWN0aXZhdGVSZXNvbHZlU3RvcCgpO1xuXHRcdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGVycik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE5vIGFjdGl2YXRlIGZvdW5kID0+IHRoZSBtb2R1bGUgaXMgdGhlIGV4dGVuc2lvbidzIGV4cG9ydHNcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8SUV4dGVuc2lvbkFQST4oZXh0ZW5zaW9uTW9kdWxlKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBlYWdlciBhY3RpdmF0aW9uXG5cblx0cHJpdmF0ZSBfYWN0aXZhdGVPbmVTdGFydHVwRmluaXNoZWQoZGVzYzogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBhY3RpdmF0aW9uRXZlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2YXRlQnlJZChkZXNjLmlkZW50aWZpZXIsIHtcblx0XHRcdHN0YXJ0dXA6IGZhbHNlLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGRlc2MuaWRlbnRpZmllcixcblx0XHRcdGFjdGl2YXRpb25FdmVudDogYWN0aXZhdGlvbkV2ZW50XG5cdFx0fSkudGhlbih1bmRlZmluZWQsIChlcnIpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGl2YXRlQWxsU3RhcnR1cEZpbmlzaGVkRGVmZXJyZWQoZXh0ZW5zaW9uczogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10sIHN0YXJ0OiBudW1iZXIgPSAwKTogdm9pZCB7XG5cdFx0Y29uc3QgdGltZUJ1ZGdldCA9IDUwOyAvLyA1MCBtaWxsaXNlY29uZHNcblx0XHRjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0c2V0VGltZW91dDAoKCkgPT4ge1xuXHRcdFx0Zm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgZXh0ZW5zaW9ucy5sZW5ndGg7IGkgKz0gMSkge1xuXHRcdFx0XHRjb25zdCBkZXNjID0gZXh0ZW5zaW9uc1tpXTtcblx0XHRcdFx0Zm9yIChjb25zdCBhY3RpdmF0aW9uRXZlbnQgb2YgKGRlc2MuYWN0aXZhdGlvbkV2ZW50cyA/PyBbXSkpIHtcblx0XHRcdFx0XHRpZiAoYWN0aXZhdGlvbkV2ZW50ID09PSAnb25TdGFydHVwRmluaXNoZWQnKSB7XG5cdFx0XHRcdFx0XHRpZiAoRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSA+IHRpbWVCdWRnZXQpIHtcblx0XHRcdFx0XHRcdFx0Ly8gdGltZSBidWRnZXQgZm9yIGN1cnJlbnQgdGFzayBoYXMgYmVlbiBleGNlZWRlZFxuXHRcdFx0XHRcdFx0XHQvLyBzZXQgYSBuZXcgdGFzayB0byBhY3RpdmF0ZSBjdXJyZW50IGFuZCByZW1haW5pbmcgZXh0ZW5zaW9uc1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9hY3RpdmF0ZUFsbFN0YXJ0dXBGaW5pc2hlZERlZmVycmVkKGV4dGVuc2lvbnMsIGkpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2FjdGl2YXRlT25lU3RhcnR1cEZpbmlzaGVkKGRlc2MsIGFjdGl2YXRpb25FdmVudCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9hY3RpdmF0ZUFsbFN0YXJ0dXBGaW5pc2hlZCgpOiB2b2lkIHtcblx0XHQvLyBzdGFydHVwIGlzIGNvbnNpZGVyZWQgZmluaXNoZWRcblx0XHR0aGlzLl9tYWluVGhyZWFkRXh0ZW5zaW9uc1Byb3h5LiRzZXRQZXJmb3JtYW5jZU1hcmtzKHBlcmZvcm1hbmNlLmdldE1hcmtzKCkpO1xuXG5cdFx0dGhpcy5fZXh0SG9zdENvbmZpZ3VyYXRpb24uZ2V0Q29uZmlnUHJvdmlkZXIoKS50aGVuKChjb25maWdQcm92aWRlcikgPT4ge1xuXHRcdFx0Y29uc3Qgc2hvdWxkRGVmZXJBY3RpdmF0aW9uID0gY29uZmlnUHJvdmlkZXIuZ2V0Q29uZmlndXJhdGlvbignZXh0ZW5zaW9ucy5leHBlcmltZW50YWwnKS5nZXQ8Ym9vbGVhbj4oJ2RlZmVycmVkU3RhcnR1cEZpbmlzaGVkQWN0aXZhdGlvbicpO1xuXHRcdFx0Y29uc3QgYWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zID0gdGhpcy5fbXlSZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKTtcblx0XHRcdGlmIChzaG91bGREZWZlckFjdGl2YXRpb24pIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZhdGVBbGxTdGFydHVwRmluaXNoZWREZWZlcnJlZChhbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChjb25zdCBkZXNjIG9mIGFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucykge1xuXHRcdFx0XHRcdGlmIChkZXNjLmFjdGl2YXRpb25FdmVudHMpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgYWN0aXZhdGlvbkV2ZW50IG9mIGRlc2MuYWN0aXZhdGlvbkV2ZW50cykge1xuXHRcdFx0XHRcdFx0XHRpZiAoYWN0aXZhdGlvbkV2ZW50ID09PSAnb25TdGFydHVwRmluaXNoZWQnKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fYWN0aXZhdGVPbmVTdGFydHVwRmluaXNoZWQoZGVzYywgYWN0aXZhdGlvbkV2ZW50KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gSGFuZGxlIFwiZWFnZXJcIiBhY3RpdmF0aW9uIGV4dGVuc2lvbnNcblx0cHJpdmF0ZSBfaGFuZGxlRWFnZXJFeHRlbnNpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN0YXJBY3RpdmF0aW9uID0gdGhpcy5fYWN0aXZhdGVCeUV2ZW50KCcqJywgdHJ1ZSkudGhlbih1bmRlZmluZWQsIChlcnIpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2V4dEhvc3RXb3Jrc3BhY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2UoKGUpID0+IHRoaXMuX2hhbmRsZVdvcmtzcGFjZUNvbnRhaW5zRWFnZXJFeHRlbnNpb25zKGUuYWRkZWQpKSk7XG5cdFx0Y29uc3QgZm9sZGVycyA9IHRoaXMuX2V4dEhvc3RXb3Jrc3BhY2Uud29ya3NwYWNlID8gdGhpcy5fZXh0SG9zdFdvcmtzcGFjZS53b3Jrc3BhY2UuZm9sZGVycyA6IFtdO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRhaW5zQWN0aXZhdGlvbiA9IHRoaXMuX2hhbmRsZVdvcmtzcGFjZUNvbnRhaW5zRWFnZXJFeHRlbnNpb25zKGZvbGRlcnMpO1xuXHRcdGNvbnN0IHJlbW90ZVJlc29sdmVyQWN0aXZhdGlvbiA9IHRoaXMuX2hhbmRsZVJlbW90ZVJlc29sdmVyRWFnZXJFeHRlbnNpb25zKCk7XG5cdFx0Y29uc3QgZWFnZXJFeHRlbnNpb25zQWN0aXZhdGlvbiA9IFByb21pc2UuYWxsKFtyZW1vdGVSZXNvbHZlckFjdGl2YXRpb24sIHN0YXJBY3RpdmF0aW9uLCB3b3Jrc3BhY2VDb250YWluc0FjdGl2YXRpb25dKS50aGVuKCgpID0+IHsgfSk7XG5cblx0XHRQcm9taXNlLnJhY2UoW2VhZ2VyRXh0ZW5zaW9uc0FjdGl2YXRpb24sIHRpbWVvdXQoMTAwMDApXSkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9hY3RpdmF0ZUFsbFN0YXJ0dXBGaW5pc2hlZCgpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGVhZ2VyRXh0ZW5zaW9uc0FjdGl2YXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVXb3Jrc3BhY2VDb250YWluc0VhZ2VyRXh0ZW5zaW9ucyhmb2xkZXJzOiBSZWFkb25seUFycmF5PHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXI+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGZvbGRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKFxuXHRcdFx0dGhpcy5fbXlSZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKS5tYXAoKGRlc2MpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2hhbmRsZVdvcmtzcGFjZUNvbnRhaW5zRWFnZXJFeHRlbnNpb24oZm9sZGVycywgZGVzYyk7XG5cdFx0XHR9KVxuXHRcdCkudGhlbigoKSA9PiB7IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlV29ya3NwYWNlQ29udGFpbnNFYWdlckV4dGVuc2lvbihmb2xkZXJzOiBSZWFkb25seUFycmF5PHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXI+LCBkZXNjOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pc0FjdGl2YXRlZChkZXNjLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYWxXaXRoUmVtb3RlID0gIXRoaXMuX2luaXREYXRhLnJlbW90ZS5pc1JlbW90ZSAmJiAhIXRoaXMuX2luaXREYXRhLnJlbW90ZS5hdXRob3JpdHk7XG5cdFx0Y29uc3QgaG9zdDogSUV4dGVuc2lvbkFjdGl2YXRpb25Ib3N0ID0ge1xuXHRcdFx0bG9nU2VydmljZTogdGhpcy5fbG9nU2VydmljZSxcblx0XHRcdGZvbGRlcnM6IGZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKSxcblx0XHRcdGZvcmNlVXNpbmdTZWFyY2g6IGxvY2FsV2l0aFJlbW90ZSB8fCAhdGhpcy5faG9zdFV0aWxzLmZzRXhpc3RzLFxuXHRcdFx0ZXhpc3RzOiAodXJpKSA9PiB0aGlzLl9ob3N0VXRpbHMuZnNFeGlzdHMhKHVyaS5mc1BhdGgpLFxuXHRcdFx0Y2hlY2tFeGlzdHM6IChmb2xkZXJzLCBpbmNsdWRlcywgdG9rZW4pID0+IHRoaXMuX21haW5UaHJlYWRXb3Jrc3BhY2VQcm94eS4kY2hlY2tFeGlzdHMoZm9sZGVycywgaW5jbHVkZXMsIHRva2VuKVxuXHRcdH07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjaGVja0FjdGl2YXRlV29ya3NwYWNlQ29udGFpbnNFeHRlbnNpb24oaG9zdCwgZGVzYyk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gKFxuXHRcdFx0dGhpcy5fYWN0aXZhdGVCeUlkKGRlc2MuaWRlbnRpZmllciwgeyBzdGFydHVwOiB0cnVlLCBleHRlbnNpb25JZDogZGVzYy5pZGVudGlmaWVyLCBhY3RpdmF0aW9uRXZlbnQ6IHJlc3VsdC5hY3RpdmF0aW9uRXZlbnQgfSlcblx0XHRcdFx0LnRoZW4odW5kZWZpbmVkLCBlcnIgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpKVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVSZW1vdGVSZXNvbHZlckVhZ2VyRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faW5pdERhdGEucmVtb3RlLmF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGl2YXRlQnlFdmVudChgb25SZXNvbHZlUmVtb3RlQXV0aG9yaXR5OiR7dGhpcy5faW5pdERhdGEucmVtb3RlLmF1dGhvcml0eX1gLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRleHRlbnNpb25UZXN0c0V4ZWN1dGUoKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRhd2FpdCB0aGlzLl9lYWdlckV4dGVuc2lvbnNBY3RpdmF0ZWQud2FpdCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZG9IYW5kbGVFeHRlbnNpb25UZXN0cygpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGVycm9yKTsgLy8gZW5zdXJlIGFueSBlcnJvciBtZXNzYWdlIG1ha2VzIGl0IG9udG8gdGhlIGNvbnNvbGVcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvSGFuZGxlRXh0ZW5zaW9uVGVzdHMoKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCB7IGV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkksIGV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkgfSA9IHRoaXMuX2luaXREYXRhLmVudmlyb25tZW50O1xuXHRcdGlmICghZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSB8fCAhZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnZXh0ZW5zaW9uVGVzdEVycm9yMScsIFwiQ2Fubm90IGxvYWQgdGVzdCBydW5uZXIuXCIpKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25EZXNjcmlwdGlvbiA9IChhd2FpdCB0aGlzLmdldEV4dGVuc2lvblBhdGhJbmRleCgpKS5maW5kU3Vic3RyKGV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkpO1xuXHRcdGNvbnN0IGlzRVNNID0gdGhpcy5faXNFU00oZXh0ZW5zaW9uRGVzY3JpcHRpb24sIGV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkucGF0aCk7XG5cblx0XHQvLyBSZXF1aXJlIHRoZSB0ZXN0IHJ1bm5lciB2aWEgbm9kZSByZXF1aXJlIGZyb20gdGhlIHByb3ZpZGVkIHBhdGhcblx0XHRjb25zdCB0ZXN0UnVubmVyID0gYXdhaXQgKGlzRVNNXG5cdFx0XHQ/IHRoaXMuX2xvYWRFU01Nb2R1bGU8SVRlc3RSdW5uZXIgfCBJTmV3VGVzdFJ1bm5lciB8IHVuZGVmaW5lZD4obnVsbCwgZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSwgbmV3IEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc0J1aWxkZXIoZmFsc2UpKVxuXHRcdFx0OiB0aGlzLl9sb2FkQ29tbW9uSlNNb2R1bGU8SVRlc3RSdW5uZXIgfCBJTmV3VGVzdFJ1bm5lciB8IHVuZGVmaW5lZD4obnVsbCwgZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSwgbmV3IEV4dGVuc2lvbkFjdGl2YXRpb25UaW1lc0J1aWxkZXIoZmFsc2UpKSk7XG5cblx0XHRpZiAoIXRlc3RSdW5uZXIgfHwgdHlwZW9mIHRlc3RSdW5uZXIucnVuICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdleHRlbnNpb25UZXN0RXJyb3InLCBcIlBhdGggezB9IGRvZXMgbm90IHBvaW50IHRvIGEgdmFsaWQgZXh0ZW5zaW9uIHRlc3QgcnVubmVyLlwiLCBleHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJLnRvU3RyaW5nKCkpKTtcblx0XHR9XG5cblx0XHQvLyBFeGVjdXRlIHRoZSBydW5uZXIgaWYgaXQgZm9sbG93cyB0aGUgb2xkIGBydW5gIHNwZWNcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8bnVtYmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBvbGRUZXN0UnVubmVyQ2FsbGJhY2sgPSAoZXJyb3I6IEVycm9yLCBmYWlsdXJlczogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBUZXN0IHJ1bm5lciBjYWxsZWQgYmFjayB3aXRoIGVycm9yYCwgZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChpc0NJKSB7XG5cdFx0XHRcdFx0XHRpZiAoZmFpbHVyZXMpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBUZXN0IHJ1bm5lciBjYWxsZWQgYmFjayB3aXRoICR7ZmFpbHVyZXN9IGZhaWx1cmVzLmApO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBUZXN0IHJ1bm5lciBjYWxsZWQgYmFjayB3aXRoIHN1Y2Nlc3NmdWwgb3V0Y29tZS5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzb2x2ZSgodHlwZW9mIGZhaWx1cmVzID09PSAnbnVtYmVyJyAmJiBmYWlsdXJlcyA+IDApID8gMSAvKiBFUlJPUiAqLyA6IDAgLyogT0sgKi8pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBleHRlbnNpb25UZXN0c1BhdGggPSBvcmlnaW5hbEZTUGF0aChleHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJKTsgLy8gZm9yIHRoZSBvbGQgdGVzdCBydW5uZXIgQVBJXG5cblx0XHRcdGNvbnN0IHJ1blJlc3VsdCA9IHRlc3RSdW5uZXIucnVuKGV4dGVuc2lvblRlc3RzUGF0aCwgb2xkVGVzdFJ1bm5lckNhbGxiYWNrKTtcblxuXHRcdFx0Ly8gVXNpbmcgdGhlIG5ldyBBUEkgYHJ1bigpOiBQcm9taXNlPHZvaWQ+YFxuXHRcdFx0aWYgKHJ1blJlc3VsdCAmJiBydW5SZXN1bHQudGhlbikge1xuXHRcdFx0XHRydW5SZXN1bHRcblx0XHRcdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaXNDSSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFRlc3QgcnVubmVyIGZpbmlzaGVkIHN1Y2Nlc3NmdWxseS5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJlc29sdmUoMCk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0XHQuY2F0Y2goKGVycjogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzQ0kpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgVGVzdCBydW5uZXIgZmluaXNoZWQgd2l0aCBlcnJvcmAsIGVycik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZWplY3QoZXJyIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyLnN0YWNrID8gZXJyLnN0YWNrIDogU3RyaW5nKGVycikpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRFeHRlbnNpb25Ib3N0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdGFydGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEV4dGVuc2lvbiBob3N0IGlzIGFscmVhZHkgc3RhcnRlZCFgKTtcblx0XHR9XG5cdFx0dGhpcy5fc3RhcnRlZCA9IHRydWU7XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVhZHlUb1N0YXJ0RXh0ZW5zaW9uSG9zdC53YWl0KClcblx0XHRcdC50aGVuKCgpID0+IHRoaXMuX3JlYWR5VG9SdW5FeHRlbnNpb25zLm9wZW4oKSlcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0Ly8gd2FpdCBmb3IgYWxsIGFjdGl2YXRpb24gZXZlbnRzIHRoYXQgY2FtZSBpbiBkdXJpbmcgd29ya2JlbmNoIHN0YXJ0dXAsIGJ1dCBhdCBtYXhpbXVtIDFzXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJhY2UoW3RoaXMuX2FjdGl2YXRvci53YWl0Rm9yQWN0aXZhdGluZ0V4dGVuc2lvbnMoKSwgdGltZW91dCgxMDAwKV0pO1xuXHRcdFx0fSlcblx0XHRcdC50aGVuKCgpID0+IHRoaXMuX2hhbmRsZUVhZ2VyRXh0ZW5zaW9ucygpKVxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lYWdlckV4dGVuc2lvbnNBY3RpdmF0ZWQub3BlbigpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEVhZ2VyIGV4dGVuc2lvbnMgYWN0aXZhdGVkYCk7XG5cdFx0XHR9KTtcblx0fVxuXG5cdC8vIC0tIGNhbGxlZCBieSBleHRlbnNpb25zXG5cblx0cHVibGljIHJlZ2lzdGVyUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIoYXV0aG9yaXR5UHJlZml4OiBzdHJpbmcsIHJlc29sdmVyOiB2c2NvZGUuUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fcmVzb2x2ZXJzW2F1dGhvcml0eVByZWZpeF0gPSByZXNvbHZlcjtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9yZXNvbHZlcnNbYXV0aG9yaXR5UHJlZml4XTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRSZW1vdGVFeGVjU2VydmVyKHJlbW90ZUF1dGhvcml0eTogc3RyaW5nKTogUHJvbWlzZTx2c2NvZGUuRXhlY1NlcnZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIgfSA9IGF3YWl0IHRoaXMuX2FjdGl2YXRlQW5kR2V0UmVzb2x2ZXIocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRyZXR1cm4gcmVzb2x2ZXI/LnJlc29sdmVFeGVjU2VydmVyPy4ocmVtb3RlQXV0aG9yaXR5LCB7IHJlc29sdmVBdHRlbXB0OiAwIH0pO1xuXHR9XG5cblx0Ly8gLS0gY2FsbGVkIGJ5IG1haW4gdGhyZWFkXG5cblx0cHJpdmF0ZSBhc3luYyBfYWN0aXZhdGVBbmRHZXRSZXNvbHZlcihyZW1vdGVBdXRob3JpdHk6IHN0cmluZyk6IFByb21pc2U8eyBhdXRob3JpdHlQcmVmaXg6IHN0cmluZzsgcmVzb2x2ZXI6IHZzY29kZS5SZW1vdGVBdXRob3JpdHlSZXNvbHZlciB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0Y29uc3QgYXV0aG9yaXR5UGx1c0luZGV4ID0gcmVtb3RlQXV0aG9yaXR5LmluZGV4T2YoJysnKTtcblx0XHRpZiAoYXV0aG9yaXR5UGx1c0luZGV4ID09PSAtMSkge1xuXHRcdFx0dGhyb3cgbmV3IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IoYE5vdCBhbiBhdXRob3JpdHkgdGhhdCBjYW4gYmUgcmVzb2x2ZWQhYCwgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUuSW52YWxpZEF1dGhvcml0eSk7XG5cdFx0fVxuXHRcdGNvbnN0IGF1dGhvcml0eVByZWZpeCA9IHJlbW90ZUF1dGhvcml0eS5zdWJzdHIoMCwgYXV0aG9yaXR5UGx1c0luZGV4KTtcblxuXHRcdGF3YWl0IHRoaXMuX2FsbW9zdFJlYWR5VG9SdW5FeHRlbnNpb25zLndhaXQoKTtcblx0XHRhd2FpdCB0aGlzLl9hY3RpdmF0ZUJ5RXZlbnQoYG9uUmVzb2x2ZVJlbW90ZUF1dGhvcml0eToke2F1dGhvcml0eVByZWZpeH1gLCBmYWxzZSk7XG5cblx0XHRyZXR1cm4geyBhdXRob3JpdHlQcmVmaXgsIHJlc29sdmVyOiB0aGlzLl9yZXNvbHZlcnNbYXV0aG9yaXR5UHJlZml4XSB9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRyZXNvbHZlQXV0aG9yaXR5KHJlbW90ZUF1dGhvcml0eUNoYWluOiBzdHJpbmcsIHJlc29sdmVBdHRlbXB0OiBudW1iZXIpOiBQcm9taXNlPER0bzxJUmVzb2x2ZUF1dGhvcml0eVJlc3VsdD4+IHtcblx0XHRjb25zdCBzdyA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRcdGNvbnN0IHByZWZpeCA9ICgpID0+IGBbcmVzb2x2ZUF1dGhvcml0eSgke2dldFJlbW90ZUF1dGhvcml0eVByZWZpeChyZW1vdGVBdXRob3JpdHlDaGFpbil9LCR7cmVzb2x2ZUF0dGVtcHR9KV1bJHtzdy5lbGFwc2VkKCl9bXNdIGA7XG5cdFx0Y29uc3QgbG9nSW5mbyA9IChtc2c6IHN0cmluZykgPT4gdGhpcy5fbG9nU2VydmljZS5pbmZvKGAke3ByZWZpeCgpfSR7bXNnfWApO1xuXHRcdGNvbnN0IGxvZ1dhcm5pbmcgPSAobXNnOiBzdHJpbmcpID0+IHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtwcmVmaXgoKX0ke21zZ31gKTtcblx0XHRjb25zdCBsb2dFcnJvciA9IChtc2c6IHN0cmluZywgZXJyOiBhbnkgPSB1bmRlZmluZWQpID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7cHJlZml4KCl9JHttc2d9YCwgZXJyKTtcblx0XHRjb25zdCBub3JtYWxpemVFcnJvciA9IChlcnI6IHVua25vd24pID0+IHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Vycm9yJyBhcyBjb25zdCxcblx0XHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdFx0Y29kZTogZXJyLl9jb2RlLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXJyLl9tZXNzYWdlLFxuXHRcdFx0XHRcdFx0ZGV0YWlsOiBlcnIuX2RldGFpbFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZ2V0UmVzb2x2ZXIgPSBhc3luYyAocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcpID0+IHtcblx0XHRcdGxvZ0luZm8oYGFjdGl2YXRpbmcgcmVzb2x2ZXIgZm9yICR7cmVtb3RlQXV0aG9yaXR5fS4uLmApO1xuXHRcdFx0Y29uc3QgeyByZXNvbHZlciwgYXV0aG9yaXR5UHJlZml4IH0gPSBhd2FpdCB0aGlzLl9hY3RpdmF0ZUFuZEdldFJlc29sdmVyKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRpZiAoIXJlc29sdmVyKSB7XG5cdFx0XHRcdGxvZ0Vycm9yKGBubyByZXNvbHZlciBmb3IgJHthdXRob3JpdHlQcmVmaXh9YCk7XG5cdFx0XHRcdHRocm93IG5ldyBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yKGBObyByZW1vdGUgZXh0ZW5zaW9uIGluc3RhbGxlZCB0byByZXNvbHZlICR7YXV0aG9yaXR5UHJlZml4fS5gLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZS5Ob1Jlc29sdmVyRm91bmQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgcmVzb2x2ZXIsIGF1dGhvcml0eVByZWZpeCwgcmVtb3RlQXV0aG9yaXR5IH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNoYWluID0gcmVtb3RlQXV0aG9yaXR5Q2hhaW4uc3BsaXQoL0B8JTQwL2cpLnJldmVyc2UoKTtcblx0XHRsb2dJbmZvKGBhY3RpdmF0aW5nIHJlbW90ZSByZXNvbHZlcnMgJHtjaGFpbi5qb2luKCcgLT4gJyl9YCk7XG5cblx0XHRsZXQgcmVzb2x2ZXJzO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXNvbHZlcnMgPSBhd2FpdCBQcm9taXNlLmFsbChjaGFpbi5tYXAoZ2V0UmVzb2x2ZXIpKS5jYXRjaChhc3luYyAoZTogRXJyb3IpID0+IHtcblx0XHRcdFx0aWYgKCEoZSBpbnN0YW5jZW9mIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3IpIHx8IGUuX2NvZGUgIT09IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLkludmFsaWRBdXRob3JpdHkpIHsgdGhyb3cgZTsgfVxuXHRcdFx0XHRsb2dXYXJuaW5nKGByZXNvbHZpbmcgbmVzdGVkIGF1dGhvcml0aWVzIGZhaWxlZDogJHtlLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdHJldHVybiBbYXdhaXQgZ2V0UmVzb2x2ZXIocmVtb3RlQXV0aG9yaXR5Q2hhaW4pXTtcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBub3JtYWxpemVFcnJvcihlKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnRlcnZhbExvZ2dlciA9IG5ldyBJbnRlcnZhbFRpbWVyKCk7XG5cdFx0aW50ZXJ2YWxMb2dnZXIuY2FuY2VsQW5kU2V0KCgpID0+IGxvZ0luZm8oJ3dhaXRpbmcuLi4nKSwgMTAwMCk7XG5cblx0XHRsZXQgcmVzdWx0ITogdnNjb2RlLlJlc29sdmVyUmVzdWx0O1xuXHRcdGxldCBleGVjU2VydmVyOiB2c2NvZGUuRXhlY1NlcnZlciB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IFtpLCB7IGF1dGhvcml0eVByZWZpeCwgcmVzb2x2ZXIsIHJlbW90ZUF1dGhvcml0eSB9XSBvZiByZXNvbHZlcnMuZW50cmllcygpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoaSA9PT0gcmVzb2x2ZXJzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0XHRsb2dJbmZvKGBpbnZva2luZyBmaW5hbCByZXNvbHZlKCkuLi5gKTtcblx0XHRcdFx0XHRwZXJmb3JtYW5jZS5tYXJrKGBjb2RlL2V4dEhvc3Qvd2lsbFJlc29sdmVBdXRob3JpdHkvJHthdXRob3JpdHlQcmVmaXh9YCk7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgcmVzb2x2ZXIucmVzb2x2ZShyZW1vdGVBdXRob3JpdHksIHsgcmVzb2x2ZUF0dGVtcHQsIGV4ZWNTZXJ2ZXIgfSk7XG5cdFx0XHRcdFx0cGVyZm9ybWFuY2UubWFyayhgY29kZS9leHRIb3N0L2RpZFJlc29sdmVBdXRob3JpdHlPSy8ke2F1dGhvcml0eVByZWZpeH1gKTtcblx0XHRcdFx0XHRsb2dJbmZvKGBzZXR0aW5nIHR1bm5lbCBmYWN0b3J5Li4uYCk7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXdhaXQgdGhpcy5fZXh0SG9zdFR1bm5lbFNlcnZpY2Uuc2V0VHVubmVsRmFjdG9yeShcblx0XHRcdFx0XHRcdHJlc29sdmVyLFxuXHRcdFx0XHRcdFx0RXh0SG9zdE1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eS5pc01hbmFnZWRSZXNvbHZlZEF1dGhvcml0eShyZXN1bHQpID8gcmVzdWx0IDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bG9nSW5mbyhgaW52b2tpbmcgcmVzb2x2ZUV4ZWNTZXJ2ZXIoKSBmb3IgJHtyZW1vdGVBdXRob3JpdHl9YCk7XG5cdFx0XHRcdFx0cGVyZm9ybWFuY2UubWFyayhgY29kZS9leHRIb3N0L3dpbGxSZXNvbHZlRXhlY1NlcnZlci8ke2F1dGhvcml0eVByZWZpeH1gKTtcblx0XHRcdFx0XHRleGVjU2VydmVyID0gYXdhaXQgcmVzb2x2ZXIucmVzb2x2ZUV4ZWNTZXJ2ZXI/LihyZW1vdGVBdXRob3JpdHksIHsgcmVzb2x2ZUF0dGVtcHQsIGV4ZWNTZXJ2ZXIgfSk7XG5cdFx0XHRcdFx0aWYgKCFleGVjU2VydmVyKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvcihgRXhlYyBzZXJ2ZXIgd2FzIG5vdCBhdmFpbGFibGUgZm9yICR7cmVtb3RlQXV0aG9yaXR5fWAsIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLk5vUmVzb2x2ZXJGb3VuZCk7IC8vIHdlIGRpZCwgaW4gZmFjdCwgYnJlYWsgdGhlIGNoYWluIDooXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZXh0SG9zdC9kaWRSZXNvbHZlRXhlY1NlcnZlck9LLyR7YXV0aG9yaXR5UHJlZml4fWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHBlcmZvcm1hbmNlLm1hcmsoYGNvZGUvZXh0SG9zdC9kaWRSZXNvbHZlQXV0aG9yaXR5RXJyb3IvJHthdXRob3JpdHlQcmVmaXh9YCk7XG5cdFx0XHRcdGxvZ0Vycm9yKGByZXR1cm5lZCBhbiBlcnJvcmAsIGUpO1xuXHRcdFx0XHRpbnRlcnZhbExvZ2dlci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybiBub3JtYWxpemVFcnJvcihlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpbnRlcnZhbExvZ2dlci5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCB0dW5uZWxJbmZvcm1hdGlvbjogVHVubmVsSW5mb3JtYXRpb24gPSB7XG5cdFx0XHRlbnZpcm9ubWVudFR1bm5lbHM6IHJlc3VsdC5lbnZpcm9ubWVudFR1bm5lbHMsXG5cdFx0XHRmZWF0dXJlczogcmVzdWx0LnR1bm5lbEZlYXR1cmVzID8ge1xuXHRcdFx0XHRlbGV2YXRpb246IHJlc3VsdC50dW5uZWxGZWF0dXJlcy5lbGV2YXRpb24sXG5cdFx0XHRcdHByaXZhY3lPcHRpb25zOiByZXN1bHQudHVubmVsRmVhdHVyZXMucHJpdmFjeU9wdGlvbnMsXG5cdFx0XHRcdHByb3RvY29sOiByZXN1bHQudHVubmVsRmVhdHVyZXMucHJvdG9jb2wgPT09IHVuZGVmaW5lZCA/IHRydWUgOiByZXN1bHQudHVubmVsRmVhdHVyZXMucHJvdG9jb2wsXG5cdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdC8vIFNwbGl0IG1lcmdlZCBBUEkgcmVzdWx0IGludG8gc2VwYXJhdGUgYXV0aG9yaXR5L29wdGlvbnNcblx0XHRjb25zdCBvcHRpb25zOiBSZXNvbHZlZE9wdGlvbnMgPSB7XG5cdFx0XHRleHRlbnNpb25Ib3N0RW52OiByZXN1bHQuZXh0ZW5zaW9uSG9zdEVudixcblx0XHRcdGlzVHJ1c3RlZDogcmVzdWx0LmlzVHJ1c3RlZCxcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2Vzc2lvbjogcmVzdWx0LmF1dGhlbnRpY2F0aW9uU2Vzc2lvbkZvckluaXRpYWxpemluZ0V4dGVuc2lvbnMgPyB7IGlkOiByZXN1bHQuYXV0aGVudGljYXRpb25TZXNzaW9uRm9ySW5pdGlhbGl6aW5nRXh0ZW5zaW9ucy5pZCwgcHJvdmlkZXJJZDogcmVzdWx0LmF1dGhlbnRpY2F0aW9uU2Vzc2lvbkZvckluaXRpYWxpemluZ0V4dGVuc2lvbnMucHJvdmlkZXJJZCB9IDogdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdC8vIGV4dGVuc2lvbiBhcmUgbm90IHJlcXVpcmVkIHRvIHJldHVybiBhbiBpbnN0YW5jZSBvZiBSZXNvbHZlZEF1dGhvcml0eSBvciBNYW5hZ2VkUmVzb2x2ZWRBdXRob3JpdHksIHNvIGRvbid0IHVzZSBgaW5zdGFuY2VvZmBcblx0XHRsb2dJbmZvKGByZXR1cm5lZCAke0V4dEhvc3RNYW5hZ2VkUmVzb2x2ZWRBdXRob3JpdHkuaXNNYW5hZ2VkUmVzb2x2ZWRBdXRob3JpdHkocmVzdWx0KSA/ICdtYW5hZ2VkIGF1dGhvcml0eScgOiBgJHtyZXN1bHQuaG9zdH06JHtyZXN1bHQucG9ydH1gfWApO1xuXG5cdFx0bGV0IGF1dGhvcml0eTogUmVzb2x2ZWRBdXRob3JpdHk7XG5cdFx0aWYgKEV4dEhvc3RNYW5hZ2VkUmVzb2x2ZWRBdXRob3JpdHkuaXNNYW5hZ2VkUmVzb2x2ZWRBdXRob3JpdHkocmVzdWx0KSkge1xuXHRcdFx0Ly8gVGhlIHNvY2tldCBmYWN0b3J5IGlzIGlkZW50aWZpZWQgYnkgdGhlIGByZXNvbHZlQXR0ZW1wdGAsIHNpbmNlIHRoYXQgaXMgYSBudW1iZXIgd2hpY2hcblx0XHRcdC8vIGFsd2F5cyBpbmNyZW1lbnRzIGFuZCBpcyB1bmlxdWUgb3ZlciBhbGwgcmVzb2x2ZSgpIGNhbGxzIGluIGEgd29ya2JlbmNoIHNlc3Npb24uXG5cdFx0XHRjb25zdCBzb2NrZXRGYWN0b3J5SWQgPSByZXNvbHZlQXR0ZW1wdDtcblxuXHRcdFx0Ly8gVGhlcmUgaXMgb25seSBvbiBtYW5hZ2VkIHNvY2tldCBmYWN0b3J5IGF0IGEgdGltZSwgc28gd2UgY2FuIGp1c3Qgb3ZlcndyaXRlIHRoZSBvbGQgb25lLlxuXHRcdFx0dGhpcy5fZXh0SG9zdE1hbmFnZWRTb2NrZXRzLnNldEZhY3Rvcnkoc29ja2V0RmFjdG9yeUlkLCByZXN1bHQubWFrZUNvbm5lY3Rpb24pO1xuXG5cdFx0XHRhdXRob3JpdHkgPSB7XG5cdFx0XHRcdGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5Q2hhaW4sXG5cdFx0XHRcdGNvbm5lY3RUbzogbmV3IE1hbmFnZWRSZW1vdGVDb25uZWN0aW9uKHNvY2tldEZhY3RvcnlJZCksXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogcmVzdWx0LmNvbm5lY3Rpb25Ub2tlblxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXV0aG9yaXR5ID0ge1xuXHRcdFx0XHRhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eUNoYWluLFxuXHRcdFx0XHRjb25uZWN0VG86IG5ldyBXZWJTb2NrZXRSZW1vdGVDb25uZWN0aW9uKHJlc3VsdC5ob3N0LCByZXN1bHQucG9ydCksXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogcmVzdWx0LmNvbm5lY3Rpb25Ub2tlblxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ29rJyxcblx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdGF1dGhvcml0eTogYXV0aG9yaXR5IGFzIER0bzxSZXNvbHZlZEF1dGhvcml0eT4sXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdHR1bm5lbEluZm9ybWF0aW9uLFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGdldENhbm9uaWNhbFVSSShyZW1vdGVBdXRob3JpdHk6IHN0cmluZywgdXJpQ29tcG9uZW50czogVXJpQ29tcG9uZW50cyk6IFByb21pc2U8VXJpQ29tcG9uZW50cyB8IG51bGw+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCRnZXRDYW5vbmljYWxVUkkgaW52b2tlZCBmb3IgYXV0aG9yaXR5ICgke2dldFJlbW90ZUF1dGhvcml0eVByZWZpeChyZW1vdGVBdXRob3JpdHkpfSlgKTtcblxuXHRcdGNvbnN0IHsgcmVzb2x2ZXIgfSA9IGF3YWl0IHRoaXMuX2FjdGl2YXRlQW5kR2V0UmVzb2x2ZXIocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRpZiAoIXJlc29sdmVyKSB7XG5cdFx0XHQvLyBSZXR1cm4gYG51bGxgIGlmIG5vIHJlc29sdmVyIGZvciBgcmVtb3RlQXV0aG9yaXR5YCBpcyBmb3VuZC5cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUodXJpQ29tcG9uZW50cyk7XG5cblx0XHRpZiAodHlwZW9mIHJlc29sdmVyLmdldENhbm9uaWNhbFVSSSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdC8vIHJlc29sdmVyIGNhbm5vdCBjb21wdXRlIGNhbm9uaWNhbCBVUklcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXNQcm9taXNlKCgpID0+IHJlc29sdmVyLmdldENhbm9uaWNhbFVSSSEodXJpKSk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkc3RhcnRFeHRlbnNpb25Ib3N0KGV4dGVuc2lvbnNEZWx0YTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uRGVsdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRleHRlbnNpb25zRGVsdGEudG9BZGQuZm9yRWFjaCgoZXh0ZW5zaW9uKSA9PiAoPGFueT5leHRlbnNpb24pLmV4dGVuc2lvbkxvY2F0aW9uID0gVVJJLnJldml2ZShleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24pKTtcblxuXHRcdGNvbnN0IHsgZ2xvYmFsUmVnaXN0cnksIG15RXh0ZW5zaW9ucyB9ID0gYXBwbHlFeHRlbnNpb25zRGVsdGEodGhpcy5fYWN0aXZhdGlvbkV2ZW50c1JlYWRlciwgdGhpcy5fZ2xvYmFsUmVnaXN0cnksIHRoaXMuX215UmVnaXN0cnksIGV4dGVuc2lvbnNEZWx0YSk7XG5cdFx0Y29uc3QgbmV3U2VhcmNoVHJlZSA9IGF3YWl0IHRoaXMuX2NyZWF0ZUV4dGVuc2lvblBhdGhJbmRleChteUV4dGVuc2lvbnMpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNQYXRocyA9IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9uUGF0aEluZGV4KCk7XG5cdFx0ZXh0ZW5zaW9uc1BhdGhzLnNldFNlYXJjaFRyZWUobmV3U2VhcmNoVHJlZSk7XG5cdFx0dGhpcy5fZ2xvYmFsUmVnaXN0cnkuc2V0KGdsb2JhbFJlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpKTtcblx0XHR0aGlzLl9teVJlZ2lzdHJ5LnNldChteUV4dGVuc2lvbnMpO1xuXG5cdFx0aWYgKGlzQ0kpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHN0YXJ0RXh0ZW5zaW9uSG9zdDogZ2xvYmFsIGV4dGVuc2lvbnM6ICR7cHJpbnRFeHRJZHModGhpcy5fZ2xvYmFsUmVnaXN0cnkpfWApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAkc3RhcnRFeHRlbnNpb25Ib3N0OiBsb2NhbCBleHRlbnNpb25zOiAke3ByaW50RXh0SWRzKHRoaXMuX215UmVnaXN0cnkpfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zdGFydEV4dGVuc2lvbkhvc3QoKTtcblx0fVxuXG5cdHB1YmxpYyAkYWN0aXZhdGVCeUV2ZW50KGFjdGl2YXRpb25FdmVudDogc3RyaW5nLCBhY3RpdmF0aW9uS2luZDogQWN0aXZhdGlvbktpbmQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYWN0aXZhdGlvbktpbmQgPT09IEFjdGl2YXRpb25LaW5kLkltbWVkaWF0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FsbW9zdFJlYWR5VG9SdW5FeHRlbnNpb25zLndhaXQoKVxuXHRcdFx0XHQudGhlbihfID0+IHRoaXMuX2FjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQsIGZhbHNlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIChcblx0XHRcdHRoaXMuX3JlYWR5VG9SdW5FeHRlbnNpb25zLndhaXQoKVxuXHRcdFx0XHQudGhlbihfID0+IHRoaXMuX2FjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQsIGZhbHNlKSlcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY3RpdmF0ZShleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciwgcmVhc29uOiBFeHRlbnNpb25BY3RpdmF0aW9uUmVhc29uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVhZHlUb1J1bkV4dGVuc2lvbnMud2FpdCgpO1xuXHRcdGlmICghdGhpcy5fbXlSZWdpc3RyeS5nZXRFeHRlbnNpb25EZXNjcmlwdGlvbihleHRlbnNpb25JZCkpIHtcblx0XHRcdC8vIHVua25vd24gZXh0ZW5zaW9uID0+IGlnbm9yZVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9hY3RpdmF0ZUJ5SWQoZXh0ZW5zaW9uSWQsIHJlYXNvbik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGRlbHRhRXh0ZW5zaW9ucyhleHRlbnNpb25zRGVsdGE6IElFeHRlbnNpb25EZXNjcmlwdGlvbkRlbHRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0ZXh0ZW5zaW9uc0RlbHRhLnRvQWRkLmZvckVhY2goKGV4dGVuc2lvbikgPT4gKDxhbnk+ZXh0ZW5zaW9uKS5leHRlbnNpb25Mb2NhdGlvbiA9IFVSSS5yZXZpdmUoZXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uKSk7XG5cblx0XHQvLyBGaXJzdCBidWlsZCB1cCBhbmQgdXBkYXRlIHRoZSB0cmllIGFuZCBvbmx5IGFmdGVyd2FyZHMgYXBwbHkgdGhlIGRlbHRhXG5cdFx0Y29uc3QgeyBnbG9iYWxSZWdpc3RyeSwgbXlFeHRlbnNpb25zIH0gPSBhcHBseUV4dGVuc2lvbnNEZWx0YSh0aGlzLl9hY3RpdmF0aW9uRXZlbnRzUmVhZGVyLCB0aGlzLl9nbG9iYWxSZWdpc3RyeSwgdGhpcy5fbXlSZWdpc3RyeSwgZXh0ZW5zaW9uc0RlbHRhKTtcblx0XHRjb25zdCBuZXdTZWFyY2hUcmVlID0gYXdhaXQgdGhpcy5fY3JlYXRlRXh0ZW5zaW9uUGF0aEluZGV4KG15RXh0ZW5zaW9ucyk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1BhdGhzID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25QYXRoSW5kZXgoKTtcblx0XHRleHRlbnNpb25zUGF0aHMuc2V0U2VhcmNoVHJlZShuZXdTZWFyY2hUcmVlKTtcblx0XHR0aGlzLl9nbG9iYWxSZWdpc3RyeS5zZXQoZ2xvYmFsUmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkpO1xuXHRcdHRoaXMuX215UmVnaXN0cnkuc2V0KG15RXh0ZW5zaW9ucyk7XG5cblx0XHRpZiAoaXNDSSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAkZGVsdGFFeHRlbnNpb25zOiBnbG9iYWwgZXh0ZW5zaW9uczogJHtwcmludEV4dElkcyh0aGlzLl9nbG9iYWxSZWdpc3RyeSl9YCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCRkZWx0YUV4dGVuc2lvbnM6IGxvY2FsIGV4dGVuc2lvbnM6ICR7cHJpbnRFeHRJZHModGhpcy5fbXlSZWdpc3RyeSl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICR0ZXN0X2xhdGVuY3kobjogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gbjtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkdGVzdF91cChiOiBWU0J1ZmZlcik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIGIuYnl0ZUxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkdGVzdF9kb3duKHNpemU6IG51bWJlcik6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRjb25zdCBidWZmID0gVlNCdWZmZXIuYWxsb2Moc2l6ZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBNYXRoLnJhbmRvbSgpICUgMjU2O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2l6ZTsgaSsrKSB7XG5cdFx0XHRidWZmLndyaXRlVUludDgodmFsdWUsIGkpO1xuXHRcdH1cblx0XHRyZXR1cm4gYnVmZjtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkdXBkYXRlUmVtb3RlQ29ubmVjdGlvbkRhdGEoY29ubmVjdGlvbkRhdGE6IElSZW1vdGVDb25uZWN0aW9uRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3JlbW90ZUNvbm5lY3Rpb25EYXRhID0gY29ubmVjdGlvbkRhdGE7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZW1vdGVDb25uZWN0aW9uRGF0YS5maXJlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2lzRVNNKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQsIG1vZHVsZVBhdGg/OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRtb2R1bGVQYXRoID8/PSBleHRlbnNpb25EZXNjcmlwdGlvbiA/IHRoaXMuX2dldEVudHJ5UG9pbnQoZXh0ZW5zaW9uRGVzY3JpcHRpb24pIDogbW9kdWxlUGF0aDtcblx0XHRyZXR1cm4gbW9kdWxlUGF0aD8uZW5kc1dpdGgoJy5tanMnKSB8fCAoZXh0ZW5zaW9uRGVzY3JpcHRpb24/LnR5cGUgPT09ICdtb2R1bGUnICYmICFtb2R1bGVQYXRoPy5lbmRzV2l0aCgnLmNqcycpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfYmVmb3JlQWxtb3N0UmVhZHlUb1J1bkV4dGVuc2lvbnMoKTogUHJvbWlzZTx2b2lkPjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9nZXRFbnRyeVBvaW50KGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfbG9hZENvbW1vbkpTTW9kdWxlPFQgZXh0ZW5kcyBvYmplY3QgfCB1bmRlZmluZWQ+KGV4dGVuc2lvbklkOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCBudWxsLCBtb2R1bGU6IFVSSSwgYWN0aXZhdGlvblRpbWVzQnVpbGRlcjogRXh0ZW5zaW9uQWN0aXZhdGlvblRpbWVzQnVpbGRlcik6IFByb21pc2U8VD47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfbG9hZEVTTU1vZHVsZTxUPihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IG51bGwsIG1vZHVsZTogVVJJLCBhY3RpdmF0aW9uVGltZXNCdWlsZGVyOiBFeHRlbnNpb25BY3RpdmF0aW9uVGltZXNCdWlsZGVyKTogUHJvbWlzZTxUPjtcblx0cHVibGljIGFic3RyYWN0ICRzZXRSZW1vdGVFbnZpcm9ubWVudChlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgbnVsbCB9KTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZnVuY3Rpb24gYXBwbHlFeHRlbnNpb25zRGVsdGEoYWN0aXZhdGlvbkV2ZW50c1JlYWRlcjogU3luY2VkQWN0aXZhdGlvbkV2ZW50c1JlYWRlciwgb2xkR2xvYmFsUmVnaXN0cnk6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnksIG9sZE15UmVnaXN0cnk6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnksIGV4dGVuc2lvbnNEZWx0YTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uRGVsdGEpIHtcblx0YWN0aXZhdGlvbkV2ZW50c1JlYWRlci5hZGRBY3RpdmF0aW9uRXZlbnRzKGV4dGVuc2lvbnNEZWx0YS5hZGRBY3RpdmF0aW9uRXZlbnRzKTtcblx0Y29uc3QgZ2xvYmFsUmVnaXN0cnkgPSBuZXcgRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeShhY3RpdmF0aW9uRXZlbnRzUmVhZGVyLCBvbGRHbG9iYWxSZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKSk7XG5cdGdsb2JhbFJlZ2lzdHJ5LmRlbHRhRXh0ZW5zaW9ucyhleHRlbnNpb25zRGVsdGEudG9BZGQsIGV4dGVuc2lvbnNEZWx0YS50b1JlbW92ZSk7XG5cblx0Y29uc3QgbXlFeHRlbnNpb25zU2V0ID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJTZXQob2xkTXlSZWdpc3RyeS5nZXRBbGxFeHRlbnNpb25EZXNjcmlwdGlvbnMoKS5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdGZvciAoY29uc3QgZXh0ZW5zaW9uSWQgb2YgZXh0ZW5zaW9uc0RlbHRhLm15VG9SZW1vdmUpIHtcblx0XHRteUV4dGVuc2lvbnNTZXQuZGVsZXRlKGV4dGVuc2lvbklkKTtcblx0fVxuXHRmb3IgKGNvbnN0IGV4dGVuc2lvbklkIG9mIGV4dGVuc2lvbnNEZWx0YS5teVRvQWRkKSB7XG5cdFx0bXlFeHRlbnNpb25zU2V0LmFkZChleHRlbnNpb25JZCk7XG5cdH1cblx0Y29uc3QgbXlFeHRlbnNpb25zID0gZmlsdGVyRXh0ZW5zaW9ucyhnbG9iYWxSZWdpc3RyeSwgbXlFeHRlbnNpb25zU2V0KTtcblxuXHRyZXR1cm4geyBnbG9iYWxSZWdpc3RyeSwgbXlFeHRlbnNpb25zIH07XG59XG5cbnR5cGUgVGVsZW1ldHJ5QWN0aXZhdGlvbkV2ZW50ID0ge1xuXHRpZDogc3RyaW5nO1xuXHRuYW1lOiBzdHJpbmc7XG5cdGV4dGVuc2lvblZlcnNpb246IHN0cmluZztcblx0cHVibGlzaGVyRGlzcGxheU5hbWU6IHN0cmluZztcblx0YWN0aXZhdGlvbkV2ZW50czogc3RyaW5nIHwgbnVsbDtcblx0aXNCdWlsdGluOiBib29sZWFuO1xuXHRyZWFzb246IHN0cmluZztcblx0cmVhc29uSWQ6IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIGdldFRlbGVtZXRyeUFjdGl2YXRpb25FdmVudChleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCByZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24pOiBUZWxlbWV0cnlBY3RpdmF0aW9uRXZlbnQge1xuXHRjb25zdCBldmVudCA9IHtcblx0XHRpZDogZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHRuYW1lOiBleHRlbnNpb25EZXNjcmlwdGlvbi5uYW1lLFxuXHRcdGV4dGVuc2lvblZlcnNpb246IGV4dGVuc2lvbkRlc2NyaXB0aW9uLnZlcnNpb24sXG5cdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IGV4dGVuc2lvbkRlc2NyaXB0aW9uLnB1Ymxpc2hlcixcblx0XHRhY3RpdmF0aW9uRXZlbnRzOiBleHRlbnNpb25EZXNjcmlwdGlvbi5hY3RpdmF0aW9uRXZlbnRzID8gZXh0ZW5zaW9uRGVzY3JpcHRpb24uYWN0aXZhdGlvbkV2ZW50cy5qb2luKCcsJykgOiBudWxsLFxuXHRcdGlzQnVpbHRpbjogZXh0ZW5zaW9uRGVzY3JpcHRpb24uaXNCdWlsdGluLFxuXHRcdHJlYXNvbjogcmVhc29uLmFjdGl2YXRpb25FdmVudCxcblx0XHRyZWFzb25JZDogcmVhc29uLmV4dGVuc2lvbklkLnZhbHVlLFxuXHR9O1xuXG5cdHJldHVybiBldmVudDtcbn1cblxuZnVuY3Rpb24gcHJpbnRFeHRJZHMocmVnaXN0cnk6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkpIHtcblx0cmV0dXJuIHJlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpLm1hcChleHQgPT4gZXh0LmlkZW50aWZpZXIudmFsdWUpLmpvaW4oJywnKTtcbn1cblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2U+KCdJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdEV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD47XG5cdHRlcm1pbmF0ZShyZWFzb246IHN0cmluZyk6IHZvaWQ7XG5cdGdldEV4dGVuc2lvbihleHRlbnNpb25JZDogc3RyaW5nKTogUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQ+O1xuXHRpc0FjdGl2YXRlZChleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IGJvb2xlYW47XG5cdGFjdGl2YXRlQnlJZFdpdGhFcnJvcnMoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIHJlYXNvbjogRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbik6IFByb21pc2U8dm9pZD47XG5cdGdldEV4dGVuc2lvbkV4cG9ydHMoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIpOiBJRXh0ZW5zaW9uQVBJIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0Z2V0RXh0ZW5zaW9uUmVnaXN0cnkoKTogUHJvbWlzZTxFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5Pjtcblx0Z2V0RXh0ZW5zaW9uUGF0aEluZGV4KCk6IFByb21pc2U8RXh0ZW5zaW9uUGF0aHM+O1xuXHRyZWdpc3RlclJlbW90ZUF1dGhvcml0eVJlc29sdmVyKGF1dGhvcml0eVByZWZpeDogc3RyaW5nLCByZXNvbHZlcjogdnNjb2RlLlJlbW90ZUF1dGhvcml0eVJlc29sdmVyKTogdnNjb2RlLkRpc3Bvc2FibGU7XG5cdGdldFJlbW90ZUV4ZWNTZXJ2ZXIoYXV0aG9yaXR5OiBzdHJpbmcpOiBQcm9taXNlPHZzY29kZS5FeGVjU2VydmVyIHwgdW5kZWZpbmVkPjtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlbW90ZUNvbm5lY3Rpb25EYXRhOiBFdmVudDx2b2lkPjtcblx0Z2V0UmVtb3RlQ29ubmVjdGlvbkRhdGEoKTogSVJlbW90ZUNvbm5lY3Rpb25EYXRhIHwgbnVsbDtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbjxUIGV4dGVuZHMgb2JqZWN0IHwgbnVsbCB8IHVuZGVmaW5lZD4gaW1wbGVtZW50cyB2c2NvZGUuRXh0ZW5zaW9uPFQ+IHtcblxuXHQjZXh0ZW5zaW9uU2VydmljZTogSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlO1xuXHQjb3JpZ2luRXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cdCNpZGVudGlmaWVyOiBFeHRlbnNpb25JZGVudGlmaWVyO1xuXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dGVuc2lvblVyaTogVVJJO1xuXHRyZWFkb25seSBleHRlbnNpb25QYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhY2thZ2VKU09OOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdHJlYWRvbmx5IGV4dGVuc2lvbktpbmQ6IHZzY29kZS5FeHRlbnNpb25LaW5kO1xuXHRyZWFkb25seSBpc0Zyb21EaWZmZXJlbnRFeHRlbnNpb25Ib3N0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGV4dGVuc2lvblNlcnZpY2U6IElFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSwgb3JpZ2luRXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGtpbmQ6IEV4dGVuc2lvbktpbmQsIGlzRnJvbURpZmZlcmVudEV4dGVuc2lvbkhvc3Q6IGJvb2xlYW4pIHtcblx0XHR0aGlzLiNleHRlbnNpb25TZXJ2aWNlID0gZXh0ZW5zaW9uU2VydmljZTtcblx0XHR0aGlzLiNvcmlnaW5FeHRlbnNpb25JZCA9IG9yaWdpbkV4dGVuc2lvbklkO1xuXHRcdHRoaXMuI2lkZW50aWZpZXIgPSBkZXNjcmlwdGlvbi5pZGVudGlmaWVyO1xuXHRcdHRoaXMuaWQgPSBkZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlO1xuXHRcdHRoaXMuZXh0ZW5zaW9uVXJpID0gZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb247XG5cdFx0dGhpcy5leHRlbnNpb25QYXRoID0gcGF0aC5ub3JtYWxpemUob3JpZ2luYWxGU1BhdGgoZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24pKTtcblx0XHR0aGlzLnBhY2thZ2VKU09OID0gZGVzY3JpcHRpb247XG5cdFx0dGhpcy5leHRlbnNpb25LaW5kID0ga2luZDtcblx0XHR0aGlzLmlzRnJvbURpZmZlcmVudEV4dGVuc2lvbkhvc3QgPSBpc0Zyb21EaWZmZXJlbnRFeHRlbnNpb25Ib3N0O1xuXHR9XG5cblx0Z2V0IGlzQWN0aXZlKCk6IGJvb2xlYW4ge1xuXHRcdC8vIFRPRE9AYWxleGRpbWEgc3VwcG9ydCB0aGlzXG5cdFx0cmV0dXJuIHRoaXMuI2V4dGVuc2lvblNlcnZpY2UuaXNBY3RpdmF0ZWQodGhpcy4jaWRlbnRpZmllcik7XG5cdH1cblxuXHRnZXQgZXhwb3J0cygpOiBUIHtcblx0XHRpZiAodGhpcy5wYWNrYWdlSlNPTi5hcGkgPT09ICdub25lJyB8fCB0aGlzLmlzRnJvbURpZmZlcmVudEV4dGVuc2lvbkhvc3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQhOyAvLyBTdHJpY3QgbnVsbG92ZXJyaWRlIC0gUHVibGljIGFwaVxuXHRcdH1cblx0XHRyZXR1cm4gPFQ+dGhpcy4jZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25FeHBvcnRzKHRoaXMuI2lkZW50aWZpZXIpO1xuXHR9XG5cblx0YXN5bmMgYWN0aXZhdGUoKTogUHJvbWlzZTxUPiB7XG5cdFx0aWYgKHRoaXMuaXNGcm9tRGlmZmVyZW50RXh0ZW5zaW9uSG9zdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgYWN0aXZhdGUgZm9yZWlnbiBleHRlbnNpb24nKTsgLy8gVE9ET0BhbGV4ZGltYSBzdXBwb3J0IHRoaXNcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy4jZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5SWRXaXRoRXJyb3JzKHRoaXMuI2lkZW50aWZpZXIsIHsgc3RhcnR1cDogZmFsc2UsIGV4dGVuc2lvbklkOiB0aGlzLiNvcmlnaW5FeHRlbnNpb25JZCwgYWN0aXZhdGlvbkV2ZW50OiAnYXBpJyB9KTtcblx0XHRyZXR1cm4gdGhpcy5leHBvcnRzO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZpbHRlckV4dGVuc2lvbnMoZ2xvYmFsUmVnaXN0cnk6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnksIGRlc2lyZWRFeHRlbnNpb25zOiBFeHRlbnNpb25JZGVudGlmaWVyU2V0KTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uW10ge1xuXHRyZXR1cm4gZ2xvYmFsUmVnaXN0cnkuZ2V0QWxsRXh0ZW5zaW9uRGVzY3JpcHRpb25zKCkuZmlsdGVyKFxuXHRcdGV4dGVuc2lvbiA9PiBkZXNpcmVkRXh0ZW5zaW9ucy5oYXMoZXh0ZW5zaW9uLmlkZW50aWZpZXIpXG5cdCk7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25QYXRocyB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfc2VhcmNoVHJlZTogVGVybmFyeVNlYXJjaFRyZWU8VVJJLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24+XG5cdCkgeyB9XG5cblx0c2V0U2VhcmNoVHJlZShzZWFyY2hUcmVlOiBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIElFeHRlbnNpb25EZXNjcmlwdGlvbj4pOiB2b2lkIHtcblx0XHR0aGlzLl9zZWFyY2hUcmVlID0gc2VhcmNoVHJlZTtcblx0fVxuXG5cdGZpbmRTdWJzdHIoa2V5OiBVUkkpOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZWFyY2hUcmVlLmZpbmRTdWJzdHIoa2V5KTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2s6ICh2YWx1ZTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpbmRleDogVVJJKSA9PiBhbnkpOiB2b2lkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VhcmNoVHJlZS5mb3JFYWNoKGNhbGxiYWNrKTtcblx0fVxufVxuXG4vKipcbiAqIFRoaXMgbWlycm9ycyB0aGUgYWN0aXZhdGlvbiBldmVudHMgYXMgc2VlbiBieSB0aGUgcmVuZGVyZXIuIFRoZSByZW5kZXJlclxuICogaXMgdGhlIG9ubHkgb25lIHdoaWNoIGNhbiBoYXZlIGEgcmVsaWFibGUgdmlldyBvZiBhY3RpdmF0aW9uIGV2ZW50cyBiZWNhdXNlXG4gKiBpbXBsaWNpdCBhY3RpdmF0aW9uIGV2ZW50cyBhcmUgZ2VuZXJhdGVkIHZpYSBleHRlbnNpb24gcG9pbnRzLCBhbmQgdGhleVxuICogYXJlIHJlZ2lzdGVyZWQgb25seSBvbiB0aGUgcmVuZGVyZXIgc2lkZS5cbiAqL1xuY2xhc3MgU3luY2VkQWN0aXZhdGlvbkV2ZW50c1JlYWRlciBpbXBsZW1lbnRzIElBY3RpdmF0aW9uRXZlbnRzUmVhZGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXAgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxzdHJpbmdbXT4oKTtcblxuXHRjb25zdHJ1Y3RvcihhY3RpdmF0aW9uRXZlbnRzOiB7IFtleHRlbnNpb25JZDogc3RyaW5nXTogc3RyaW5nW10gfSkge1xuXHRcdHRoaXMuYWRkQWN0aXZhdGlvbkV2ZW50cyhhY3RpdmF0aW9uRXZlbnRzKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkQWN0aXZhdGlvbkV2ZW50cyhleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9tYXAuZ2V0KGV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIpID8/IFtdO1xuXHR9XG5cblx0cHVibGljIGFkZEFjdGl2YXRpb25FdmVudHMoYWN0aXZhdGlvbkV2ZW50czogeyBbZXh0ZW5zaW9uSWQ6IHN0cmluZ106IHN0cmluZ1tdIH0pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbklkIG9mIE9iamVjdC5rZXlzKGFjdGl2YXRpb25FdmVudHMpKSB7XG5cdFx0XHR0aGlzLl9tYXAuc2V0KGV4dGVuc2lvbklkLCBhY3RpdmF0aW9uRXZlbnRzW2V4dGVuc2lvbklkXSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFVBQVU7QUFDdEIsWUFBWSxpQkFBaUI7QUFDN0IsU0FBUyxnQkFBZ0IsVUFBVSxrQ0FBa0M7QUFDckUsU0FBUyxXQUFXLFNBQVMsZUFBZSxlQUFlO0FBQzNELFNBQVMsU0FBUyxjQUFjLFlBQVksdUJBQW9DO0FBQ2hGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBdUMsbUJBQXdHO0FBRS9JLFNBQStCLDZCQUE2QjtBQUM1RCxTQUFTLG9CQUFvQixnQkFBZ0IsMEJBQTBCLGlDQUFpQyxxQkFBc0QscUJBQXVEO0FBQ3JOLFNBQVMsZ0JB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
