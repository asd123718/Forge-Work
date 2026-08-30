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
import { Emitter } from "../../../../base/common/event.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ILocalPtyService, ITerminalLogService, TerminalExtensions, TerminalIpcChannels, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ITerminalInstanceService } from "../browser/terminal.js";
import { ITerminalProfileResolverService } from "../common/terminal.js";
import { TerminalStorageKeys } from "../common/terminalStorageKeys.js";
import { LocalPty } from "./localPty.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IShellEnvironmentService } from "../../../services/environment/electron-browser/shellEnvironmentService.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import * as terminalEnvironment from "../common/terminalEnvironment.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IEnvironmentVariableService } from "../common/environmentVariable.js";
import { BaseTerminalBackend } from "../browser/baseTerminalBackend.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Client as MessagePortClient } from "../../../../base/parts/ipc/common/ipc.mp.js";
import { acquirePort } from "../../../../base/parts/ipc/electron-browser/ipc.mp.js";
import { getDelayedChannel, ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { mark } from "../../../../base/common/performance.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { memoize } from "../../../../base/common/decorators.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { shouldUseEnvironmentVariableCollection } from "../../../../platform/terminal/common/terminalEnvironment.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
let LocalTerminalBackendContribution = class {
  constructor(instantiationService, terminalInstanceService) {
    const backend = instantiationService.createInstance(LocalTerminalBackend);
    Registry.as(TerminalExtensions.Backend).registerTerminalBackend(backend);
    terminalInstanceService.didRegisterBackend(backend);
  }
};
LocalTerminalBackendContribution.ID = "workbench.contrib.localTerminalBackend";
LocalTerminalBackendContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ITerminalInstanceService)
], LocalTerminalBackendContribution);
let LocalTerminalBackend = class extends BaseTerminalBackend {
  constructor(workspaceContextService, _lifecycleService, logService, _localPtyService, _labelService, _shellEnvironmentService, _storageService, _configurationResolverService, _configurationService, _productService, _historyService, _terminalProfileResolverService, _environmentVariableService, historyService, _nativeHostService, statusBarService, _remoteAgentService, _environmentService) {
    super(_localPtyService, logService, historyService, _configurationResolverService, statusBarService, workspaceContextService);
    this._lifecycleService = _lifecycleService;
    this._localPtyService = _localPtyService;
    this._labelService = _labelService;
    this._shellEnvironmentService = _shellEnvironmentService;
    this._storageService = _storageService;
    this._configurationResolverService = _configurationResolverService;
    this._configurationService = _configurationService;
    this._productService = _productService;
    this._historyService = _historyService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._environmentVariableService = _environmentVariableService;
    this._nativeHostService = _nativeHostService;
    this._remoteAgentService = _remoteAgentService;
    this._environmentService = _environmentService;
    this.remoteAuthority = void 0;
    this._ptys = /* @__PURE__ */ new Map();
    this._directProxyDisposables = this._register(new MutableDisposable());
    this._whenReady = new DeferredPromise();
    this._onDidRequestDetach = this._register(new Emitter());
    this.onDidRequestDetach = this._onDidRequestDetach.event;
    this._register(this.onPtyHostRestart(() => {
      this._directProxy = void 0;
      this._directProxyClientEventually = void 0;
      this._connectToDirectProxy();
    }));
  }
  /**
   * Communicate to the direct proxy (renderer<->ptyhost) if it's available, otherwise use the
   * indirect proxy (renderer<->main<->ptyhost). The latter may not need to actually launch the
   * pty host, for example when detecting profiles.
   */
  get _proxy() {
    return this._directProxy || this._localPtyService;
  }
  get whenReady() {
    return this._whenReady.p;
  }
  setReady() {
    this._whenReady.complete();
  }
  /**
   * Request a direct connection to the pty host, this will launch the pty host process if necessary.
   */
  async _connectToDirectProxy() {
    if (this._directProxyClientEventually) {
      await this._directProxyClientEventually.p;
      return;
    }
    this._logService.debug("Starting pty host");
    const directProxyClientEventually = new DeferredPromise();
    this._directProxyClientEventually = directProxyClientEventually;
    const directProxy = ProxyChannel.toService(getDelayedChannel(this._directProxyClientEventually.p.then((client) => client.getChannel(TerminalIpcChannels.PtyHostWindow))));
    this._directProxy = directProxy;
    this._directProxyDisposables.clear();
    if (!this._remoteAgentService.getConnection()?.remoteAuthority) {
      await this._lifecycleService.when(LifecyclePhase.Restored);
    }
    mark("code/terminal/willConnectPtyHost");
    this._logService.trace("Renderer->PtyHost#connect: before acquirePort");
    acquirePort("vscode:createPtyHostMessageChannel", "vscode:createPtyHostMessageChannelResult").then((port) => {
      mark("code/terminal/didConnectPtyHost");
      this._logService.trace("Renderer->PtyHost#connect: connection established");
      const store = new DisposableStore();
      this._directProxyDisposables.value = store;
      const client = store.add(new MessagePortClient(port, `window:${this._nativeHostService.windowId}`));
      directProxyClientEventually.complete(client);
      this._onPtyHostConnected.fire();
      store.add(directProxy.onProcessData((e) => this._ptys.get(e.id)?.handleData(e.event)));
      store.add(directProxy.onDidChangeProperty((e) => this._ptys.get(e.id)?.handleDidChangeProperty(e.property)));
      store.add(directProxy.onProcessExit((e) => {
        const pty = this._ptys.get(e.id);
        if (pty) {
          pty.handleExit(e.event);
          pty.dispose();
          this._ptys.delete(e.id);
        }
      }));
      store.add(directProxy.onProcessReady((e) => this._ptys.get(e.id)?.handleReady(e.event)));
      store.add(directProxy.onProcessReplay((e) => this._ptys.get(e.id)?.handleReplay(e.event)));
      store.add(directProxy.onProcessOrphanQuestion((e) => this._ptys.get(e.id)?.handleOrphanQuestion()));
      store.add(directProxy.onDidRequestDetach((e) => this._onDidRequestDetach.fire(e)));
      this.getEnvironment();
    });
  }
  async requestDetachInstance(workspaceId, instanceId) {
    return this._proxy.requestDetachInstance(workspaceId, instanceId);
  }
  async acceptDetachInstanceReply(requestId, persistentProcessId) {
    if (!persistentProcessId) {
      this._logService.warn("Cannot attach to feature terminals, custom pty terminals, or those without a persistentProcessId");
      return;
    }
    return this._proxy.acceptDetachInstanceReply(requestId, persistentProcessId);
  }
  async persistTerminalState() {
    const ids = Array.from(this._ptys.keys());
    const serialized = await this._proxy.serializeTerminalState(ids);
    this._storageService.store(TerminalStorageKeys.TerminalBufferState, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async updateTitle(id, title, titleSource) {
    await this._proxy.updateTitle(id, title, titleSource);
  }
  async updateIcon(id, userInitiated, icon, color) {
    await this._proxy.updateIcon(id, userInitiated, icon, color);
  }
  async setNextCommandId(id, commandLine, commandId) {
    await this._proxy.setNextCommandId(id, commandLine, commandId);
  }
  async updateProperty(id, property, value) {
    return this._proxy.updateProperty(id, property, value);
  }
  async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, options, shouldPersist) {
    await this._connectToDirectProxy();
    const executableEnv = await this._shellEnvironmentService.getShellEnv();
    const id = await this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, this._getWorkspaceId(), this._getWorkspaceName());
    const pty = new LocalPty(id, shouldPersist, this._proxy);
    this._ptys.set(id, pty);
    return pty;
  }
  async attachToProcess(id) {
    await this._connectToDirectProxy();
    try {
      await this._proxy.attachToProcess(id);
      const pty = new LocalPty(id, true, this._proxy);
      this._ptys.set(id, pty);
      return pty;
    } catch (e) {
      this._logService.warn(`Couldn't attach to process ${e.message}`);
    }
    return void 0;
  }
  async attachToRevivedProcess(id) {
    await this._connectToDirectProxy();
    try {
      const newId = await this._proxy.getRevivedPtyNewId(this._getWorkspaceId(), id) ?? id;
      return await this.attachToProcess(newId);
    } catch (e) {
      this._logService.warn(`Couldn't attach to process ${e.message}`);
    }
    return void 0;
  }
  async listProcesses() {
    await this._connectToDirectProxy();
    return this._proxy.listProcesses();
  }
  async getLatency() {
    const measurements = [];
    const sw = new StopWatch();
    if (this._directProxy) {
      await this._directProxy.getLatency();
      sw.stop();
      measurements.push({
        label: "window<->ptyhost (message port)",
        latency: sw.elapsed()
      });
      sw.reset();
    }
    const results = await this._localPtyService.getLatency();
    sw.stop();
    measurements.push({
      label: "window<->ptyhostservice<->ptyhost",
      latency: sw.elapsed()
    });
    return [
      ...measurements,
      ...results
    ];
  }
  async getPerformanceMarks() {
    return this._proxy.getPerformanceMarks();
  }
  async reduceConnectionGraceTime() {
    this._proxy.reduceConnectionGraceTime();
  }
  async getDefaultSystemShell(osOverride) {
    return this._proxy.getDefaultSystemShell(osOverride);
  }
  async getProfiles(profiles, defaultProfile, includeDetectedProfiles) {
    return this._localPtyService.getProfiles(this._workspaceContextService.getWorkspace().id, profiles, defaultProfile, includeDetectedProfiles) || [];
  }
  async getEnvironment() {
    return this._proxy.getEnvironment();
  }
  async getShellEnvironment() {
    const env = { ...await this._shellEnvironmentService.getShellEnv() };
    if (this._environmentService.debugExtensionHost.env) {
      terminalEnvironment.mergeEnvironments(env, this._environmentService.debugExtensionHost.env);
    }
    return env;
  }
  async getWslPath(original, direction) {
    return this._proxy.getWslPath(original, direction);
  }
  async setTerminalLayoutInfo(layoutInfo) {
    const args = {
      workspaceId: this._getWorkspaceId(),
      tabs: layoutInfo ? layoutInfo.tabs : [],
      background: layoutInfo ? layoutInfo.background : null
    };
    await this._proxy.setTerminalLayoutInfo(args);
    this._storageService.store(TerminalStorageKeys.TerminalLayoutInfo, JSON.stringify(args), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async getTerminalLayoutInfo() {
    const workspaceId = this._getWorkspaceId();
    const layoutArgs = { workspaceId };
    const serializedState = this._storageService.get(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
    const reviveBufferState = this._deserializeTerminalState(serializedState);
    if (reviveBufferState && reviveBufferState.length > 0) {
      try {
        const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
        const lastActiveWorkspace = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? void 0 : void 0;
        const variableResolver = terminalEnvironment.createVariableResolver(lastActiveWorkspace, await this._terminalProfileResolverService.getEnvironment(this.remoteAuthority), this._configurationResolverService);
        mark("code/terminal/willGetReviveEnvironments");
        await Promise.all(reviveBufferState.map((state) => new Promise((r) => {
          this._resolveEnvironmentForRevive(variableResolver, state.shellLaunchConfig).then((freshEnv) => {
            state.processLaunchConfig.env = freshEnv;
            r();
          });
        })));
        mark("code/terminal/didGetReviveEnvironments");
        mark("code/terminal/willReviveTerminalProcesses");
        await this._proxy.reviveTerminalProcesses(workspaceId, reviveBufferState, Intl.DateTimeFormat().resolvedOptions().locale);
        mark("code/terminal/didReviveTerminalProcesses");
        this._storageService.remove(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
        const layoutInfo = this._storageService.get(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
        if (layoutInfo) {
          mark("code/terminal/willSetTerminalLayoutInfo");
          await this._proxy.setTerminalLayoutInfo(JSON.parse(layoutInfo));
          mark("code/terminal/didSetTerminalLayoutInfo");
          this._storageService.remove(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
        }
      } catch (e) {
        this._logService.warn("LocalTerminalBackend#getTerminalLayoutInfo Error", e.message ?? e);
      }
    }
    return this._proxy.getTerminalLayoutInfo(layoutArgs);
  }
  async _resolveEnvironmentForRevive(variableResolver, shellLaunchConfig) {
    const platformKey = isWindows ? "windows" : isMacintosh ? "osx" : "linux";
    const envFromConfigValue = this._configurationService.getValue(`terminal.integrated.env.${platformKey}`);
    const baseEnv = await (shellLaunchConfig.useShellEnvironment ? this.getShellEnvironment() : this.getEnvironment());
    const env = await terminalEnvironment.createTerminalEnvironment(shellLaunchConfig, envFromConfigValue, variableResolver, this._productService.version, this._configurationService.getValue(TerminalSettingId.DetectLocale), baseEnv);
    if (shouldUseEnvironmentVariableCollection(shellLaunchConfig)) {
      const workspaceFolder = terminalEnvironment.getWorkspaceForTerminal(shellLaunchConfig.cwd, this._workspaceContextService, this._historyService);
      await this._environmentVariableService.mergedCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
    }
    return env;
  }
  _getWorkspaceName() {
    return this._labelService.getWorkspaceLabel(this._workspaceContextService.getWorkspace());
  }
  // #region Pty service contribution RPC calls
  installAutoReply(match, reply) {
    return this._proxy.installAutoReply(match, reply);
  }
  uninstallAllAutoReplies() {
    return this._proxy.uninstallAllAutoReplies();
  }
  // #endregion
};
__decorateClass([
  memoize
], LocalTerminalBackend.prototype, "getEnvironment", 1);
__decorateClass([
  memoize
], LocalTerminalBackend.prototype, "getShellEnvironment", 1);
LocalTerminalBackend = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, ITerminalLogService),
  __decorateParam(3, ILocalPtyService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IShellEnvironmentService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IConfigurationResolverService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IHistoryService),
  __decorateParam(11, ITerminalProfileResolverService),
  __decorateParam(12, IEnvironmentVariableService),
  __decorateParam(13, IHistoryService),
  __decorateParam(14, INativeHostService),
  __decorateParam(15, IStatusbarService),
  __decorateParam(16, IRemoteAgentService),
  __decorateParam(17, INativeWorkbenchEnvironmentService)
], LocalTerminalBackend);
export {
  LocalTerminalBackendContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxlbGVjdHJvbi1icm93c2VyXFxsb2NhbFRlcm1pbmFsQmFja2VuZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzLCBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElMb2NhbFB0eVNlcnZpY2UsIElQcm9jZXNzUHJvcGVydHlNYXAsIElQdHlIb3N0TGF0ZW5jeU1lYXN1cmVtZW50LCBJUHR5U2VydmljZSwgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxCYWNrZW5kLCBJVGVybWluYWxCYWNrZW5kUmVnaXN0cnksIElUZXJtaW5hbENoaWxkUHJvY2VzcywgSVRlcm1pbmFsRW52aXJvbm1lbnQsIElUZXJtaW5hbExvZ1NlcnZpY2UsIElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLCBJVGVybWluYWxzTGF5b3V0SW5mbywgSVRlcm1pbmFsc0xheW91dEluZm9CeUlkLCBQcm9jZXNzUHJvcGVydHlUeXBlLCBUZXJtaW5hbEV4dGVuc2lvbnMsIFRlcm1pbmFsSXBjQ2hhbm5lbHMsIFRlcm1pbmFsU2V0dGluZ0lkLCBUaXRsZUV2ZW50U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElHZXRUZXJtaW5hbExheW91dEluZm9BcmdzLCBJUHJvY2Vzc0RldGFpbHMsIElTZXRUZXJtaW5hbExheW91dEluZm9BcmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsUHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3RvcmFnZUtleXMgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxTdG9yYWdlS2V5cy5qcyc7XG5pbXBvcnQgeyBMb2NhbFB0eSB9IGZyb20gJy4vbG9jYWxQdHkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJU2hlbGxFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL3NoZWxsRW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0ICogYXMgdGVybWluYWxFbnZpcm9ubWVudCBmcm9tICcuLi9jb21tb24vdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZS5qcyc7XG5pbXBvcnQgeyBCYXNlVGVybWluYWxCYWNrZW5kIH0gZnJvbSAnLi4vYnJvd3Nlci9iYXNlVGVybWluYWxCYWNrZW5kLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IENsaWVudCBhcyBNZXNzYWdlUG9ydENsaWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubXAuanMnO1xuaW1wb3J0IHsgYWNxdWlyZVBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9lbGVjdHJvbi1icm93c2VyL2lwYy5tcC5qcyc7XG5pbXBvcnQgeyBnZXREZWxheWVkQ2hhbm5lbCwgUHJveHlDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBtYXJrLCBQZXJmb3JtYW5jZU1hcmsgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBzaG91bGRVc2VFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5leHBvcnQgY2xhc3MgTG9jYWxUZXJtaW5hbEJhY2tlbmRDb250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubG9jYWxUZXJtaW5hbEJhY2tlbmQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlIHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlOiBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgYmFja2VuZCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvY2FsVGVybWluYWxCYWNrZW5kKTtcblx0XHRSZWdpc3RyeS5hczxJVGVybWluYWxCYWNrZW5kUmVnaXN0cnk+KFRlcm1pbmFsRXh0ZW5zaW9ucy5CYWNrZW5kKS5yZWdpc3RlclRlcm1pbmFsQmFja2VuZChiYWNrZW5kKTtcblx0XHR0ZXJtaW5hbEluc3RhbmNlU2VydmljZS5kaWRSZWdpc3RlckJhY2tlbmQoYmFja2VuZCk7XG5cdH1cbn1cblxuY2xhc3MgTG9jYWxUZXJtaW5hbEJhY2tlbmQgZXh0ZW5kcyBCYXNlVGVybWluYWxCYWNrZW5kIGltcGxlbWVudHMgSVRlcm1pbmFsQmFja2VuZCB7XG5cdHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eSA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wdHlzOiBNYXA8bnVtYmVyLCBMb2NhbFB0eT4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSBfZGlyZWN0UHJveHlDbGllbnRFdmVudHVhbGx5OiBEZWZlcnJlZFByb21pc2U8TWVzc2FnZVBvcnRDbGllbnQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kaXJlY3RQcm94eTogSVB0eVNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpcmVjdFByb3h5RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0LyoqXG5cdCAqIENvbW11bmljYXRlIHRvIHRoZSBkaXJlY3QgcHJveHkgKHJlbmRlcmVyPC0+cHR5aG9zdCkgaWYgaXQncyBhdmFpbGFibGUsIG90aGVyd2lzZSB1c2UgdGhlXG5cdCAqIGluZGlyZWN0IHByb3h5IChyZW5kZXJlcjwtPm1haW48LT5wdHlob3N0KS4gVGhlIGxhdHRlciBtYXkgbm90IG5lZWQgdG8gYWN0dWFsbHkgbGF1bmNoIHRoZVxuXHQgKiBwdHkgaG9zdCwgZm9yIGV4YW1wbGUgd2hlbiBkZXRlY3RpbmcgcHJvZmlsZXMuXG5cdCAqL1xuXHRwcml2YXRlIGdldCBfcHJveHkoKTogSVB0eVNlcnZpY2UgeyByZXR1cm4gdGhpcy5fZGlyZWN0UHJveHkgfHwgdGhpcy5fbG9jYWxQdHlTZXJ2aWNlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2hlblJlYWR5ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRnZXQgd2hlblJlYWR5KCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy5fd2hlblJlYWR5LnA7IH1cblx0c2V0UmVhZHkoKTogdm9pZCB7IHRoaXMuX3doZW5SZWFkeS5jb21wbGV0ZSgpOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0RGV0YWNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZXF1ZXN0SWQ6IG51bWJlcjsgd29ya3NwYWNlSWQ6IHN0cmluZzsgaW5zdGFuY2VJZDogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3REZXRhY2ggPSB0aGlzLl9vbkRpZFJlcXVlc3REZXRhY2guZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHRcdEBJTG9jYWxQdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsUHR5U2VydmljZTogSUxvY2FsUHR5U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElTaGVsbEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zaGVsbEVudmlyb25tZW50U2VydmljZTogSVNoZWxsRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2U6IElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIGhpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9uYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBzdGF0dXNCYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihfbG9jYWxQdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBoaXN0b3J5U2VydmljZSwgX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsIHN0YXR1c0JhclNlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25QdHlIb3N0UmVzdGFydCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kaXJlY3RQcm94eSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2RpcmVjdFByb3h5Q2xpZW50RXZlbnR1YWxseSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2Nvbm5lY3RUb0RpcmVjdFByb3h5KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlcXVlc3QgYSBkaXJlY3QgY29ubmVjdGlvbiB0byB0aGUgcHR5IGhvc3QsIHRoaXMgd2lsbCBsYXVuY2ggdGhlIHB0eSBob3N0IHByb2Nlc3MgaWYgbmVjZXNzYXJ5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY29ubmVjdFRvRGlyZWN0UHJveHkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ2hlY2sgaWYgY29ubmVjdGluZyBpcyBpbiBwcm9ncmVzc1xuXHRcdGlmICh0aGlzLl9kaXJlY3RQcm94eUNsaWVudEV2ZW50dWFsbHkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2RpcmVjdFByb3h5Q2xpZW50RXZlbnR1YWxseS5wO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ1N0YXJ0aW5nIHB0eSBob3N0Jyk7XG5cdFx0Y29uc3QgZGlyZWN0UHJveHlDbGllbnRFdmVudHVhbGx5ID0gbmV3IERlZmVycmVkUHJvbWlzZTxNZXNzYWdlUG9ydENsaWVudD4oKTtcblx0XHR0aGlzLl9kaXJlY3RQcm94eUNsaWVudEV2ZW50dWFsbHkgPSBkaXJlY3RQcm94eUNsaWVudEV2ZW50dWFsbHk7XG5cdFx0Y29uc3QgZGlyZWN0UHJveHkgPSBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElQdHlTZXJ2aWNlPihnZXREZWxheWVkQ2hhbm5lbCh0aGlzLl9kaXJlY3RQcm94eUNsaWVudEV2ZW50dWFsbHkucC50aGVuKGNsaWVudCA9PiBjbGllbnQuZ2V0Q2hhbm5lbChUZXJtaW5hbElwY0NoYW5uZWxzLlB0eUhvc3RXaW5kb3cpKSkpO1xuXHRcdHRoaXMuX2RpcmVjdFByb3h5ID0gZGlyZWN0UHJveHk7XG5cdFx0dGhpcy5fZGlyZWN0UHJveHlEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Ly8gVGhlIHB0eSBob3N0IHNob3VsZCBub3QgZ2V0IGxhdW5jaGVkIHVudGlsIGF0IGxlYXN0IHRoZSB3aW5kb3cgcmVzdG9yZWQgcGhhc2Vcblx0XHQvLyBpZiByZW1vdGUgYXV0aCBleGlzdHMsIGRvbid0IGF3YWl0XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2xpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cdFx0fVxuXG5cdFx0bWFyaygnY29kZS90ZXJtaW5hbC93aWxsQ29ubmVjdFB0eUhvc3QnKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdSZW5kZXJlci0+UHR5SG9zdCNjb25uZWN0OiBiZWZvcmUgYWNxdWlyZVBvcnQnKTtcblx0XHRhY3F1aXJlUG9ydCgndnNjb2RlOmNyZWF0ZVB0eUhvc3RNZXNzYWdlQ2hhbm5lbCcsICd2c2NvZGU6Y3JlYXRlUHR5SG9zdE1lc3NhZ2VDaGFubmVsUmVzdWx0JykudGhlbihwb3J0ID0+IHtcblx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkQ29ubmVjdFB0eUhvc3QnKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1JlbmRlcmVyLT5QdHlIb3N0I2Nvbm5lY3Q6IGNvbm5lY3Rpb24gZXN0YWJsaXNoZWQnKTtcblxuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0aGlzLl9kaXJlY3RQcm94eURpc3Bvc2FibGVzLnZhbHVlID0gc3RvcmU7XG5cblx0XHRcdC8vIFRoZXJlIGFyZSB0d28gY29ubmVjdGlvbnMgdG8gdGhlIHB0eSBob3N0OyBvbmUgdG8gdGhlIHJlZ3VsYXIgc2hhcmVkIHByb2Nlc3Ncblx0XHRcdC8vIF9sb2NhbFB0eVNlcnZpY2UsIGFuZCBvbmUgZGlyZWN0bHkgdmlhIG1lc3NhZ2UgcG9ydCBfcHR5SG9zdERpcmVjdFByb3h5LiBUaGUgZm9ybWVyIGlzXG5cdFx0XHQvLyB1c2VkIGZvciBwdHkgaG9zdCBtYW5hZ2VtZW50IG1lc3NhZ2VzLCBpdCB3b3VsZCBtYWtlIHNlbnNlIGluIHRoZSBmdXR1cmUgdG8gdXNlIGFcblx0XHRcdC8vIHNlcGFyYXRlIGludGVyZmFjZS9zZXJ2aWNlIGZvciB0aGlzIG9uZS5cblx0XHRcdGNvbnN0IGNsaWVudCA9IHN0b3JlLmFkZChuZXcgTWVzc2FnZVBvcnRDbGllbnQocG9ydCwgYHdpbmRvdzoke3RoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLndpbmRvd0lkfWApKTtcblx0XHRcdGRpcmVjdFByb3h5Q2xpZW50RXZlbnR1YWxseS5jb21wbGV0ZShjbGllbnQpO1xuXHRcdFx0dGhpcy5fb25QdHlIb3N0Q29ubmVjdGVkLmZpcmUoKTtcblxuXHRcdFx0Ly8gQXR0YWNoIHByb2Nlc3MgbGlzdGVuZXJzXG5cdFx0XHRzdG9yZS5hZGQoZGlyZWN0UHJveHkub25Qcm9jZXNzRGF0YShlID0+IHRoaXMuX3B0eXMuZ2V0KGUuaWQpPy5oYW5kbGVEYXRhKGUuZXZlbnQpKSk7XG5cdFx0XHRzdG9yZS5hZGQoZGlyZWN0UHJveHkub25EaWRDaGFuZ2VQcm9wZXJ0eShlID0+IHRoaXMuX3B0eXMuZ2V0KGUuaWQpPy5oYW5kbGVEaWRDaGFuZ2VQcm9wZXJ0eShlLnByb3BlcnR5KSkpO1xuXHRcdFx0c3RvcmUuYWRkKGRpcmVjdFByb3h5Lm9uUHJvY2Vzc0V4aXQoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHB0eSA9IHRoaXMuX3B0eXMuZ2V0KGUuaWQpO1xuXHRcdFx0XHRpZiAocHR5KSB7XG5cdFx0XHRcdFx0cHR5LmhhbmRsZUV4aXQoZS5ldmVudCk7XG5cdFx0XHRcdFx0cHR5LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9wdHlzLmRlbGV0ZShlLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGRpcmVjdFByb3h5Lm9uUHJvY2Vzc1JlYWR5KGUgPT4gdGhpcy5fcHR5cy5nZXQoZS5pZCk/LmhhbmRsZVJlYWR5KGUuZXZlbnQpKSk7XG5cdFx0XHRzdG9yZS5hZGQoZGlyZWN0UHJveHkub25Qcm9jZXNzUmVwbGF5KGUgPT4gdGhpcy5fcHR5cy5nZXQoZS5pZCk/LmhhbmRsZVJlcGxheShlLmV2ZW50KSkpO1xuXHRcdFx0c3RvcmUuYWRkKGRpcmVjdFByb3h5Lm9uUHJvY2Vzc09ycGhhblF1ZXN0aW9uKGUgPT4gdGhpcy5fcHR5cy5nZXQoZS5pZCk/LmhhbmRsZU9ycGhhblF1ZXN0aW9uKCkpKTtcblx0XHRcdHN0b3JlLmFkZChkaXJlY3RQcm94eS5vbkRpZFJlcXVlc3REZXRhY2goZSA9PiB0aGlzLl9vbkRpZFJlcXVlc3REZXRhY2guZmlyZShlKSkpO1xuXG5cdFx0XHQvLyBFYWdlcmx5IGZldGNoIHRoZSBiYWNrZW5kJ3MgZW52aXJvbm1lbnQgZm9yIG1lbW9pemF0aW9uXG5cdFx0XHR0aGlzLmdldEVudmlyb25tZW50KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyByZXF1ZXN0RGV0YWNoSW5zdGFuY2Uod29ya3NwYWNlSWQ6IHN0cmluZywgaW5zdGFuY2VJZDogbnVtYmVyKTogUHJvbWlzZTxJUHJvY2Vzc0RldGFpbHMgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkucmVxdWVzdERldGFjaEluc3RhbmNlKHdvcmtzcGFjZUlkLCBpbnN0YW5jZUlkKTtcblx0fVxuXG5cdGFzeW5jIGFjY2VwdERldGFjaEluc3RhbmNlUmVwbHkocmVxdWVzdElkOiBudW1iZXIsIHBlcnNpc3RlbnRQcm9jZXNzSWQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXBlcnNpc3RlbnRQcm9jZXNzSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignQ2Fubm90IGF0dGFjaCB0byBmZWF0dXJlIHRlcm1pbmFscywgY3VzdG9tIHB0eSB0ZXJtaW5hbHMsIG9yIHRob3NlIHdpdGhvdXQgYSBwZXJzaXN0ZW50UHJvY2Vzc0lkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94eS5hY2NlcHREZXRhY2hJbnN0YW5jZVJlcGx5KHJlcXVlc3RJZCwgcGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cdH1cblxuXHRhc3luYyBwZXJzaXN0VGVybWluYWxTdGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpZHMgPSBBcnJheS5mcm9tKHRoaXMuX3B0eXMua2V5cygpKTtcblx0XHRjb25zdCBzZXJpYWxpemVkID0gYXdhaXQgdGhpcy5fcHJveHkuc2VyaWFsaXplVGVybWluYWxTdGF0ZShpZHMpO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRlcm1pbmFsU3RvcmFnZUtleXMuVGVybWluYWxCdWZmZXJTdGF0ZSwgc2VyaWFsaXplZCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVRpdGxlKGlkOiBudW1iZXIsIHRpdGxlOiBzdHJpbmcsIHRpdGxlU291cmNlOiBUaXRsZUV2ZW50U291cmNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcHJveHkudXBkYXRlVGl0bGUoaWQsIHRpdGxlLCB0aXRsZVNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVJY29uKGlkOiBudW1iZXIsIHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4sIGljb246IFVSSSB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCB7IGlkOiBzdHJpbmc7IGNvbG9yPzogeyBpZDogc3RyaW5nIH0gfSwgY29sb3I/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9wcm94eS51cGRhdGVJY29uKGlkLCB1c2VySW5pdGlhdGVkLCBpY29uLCBjb2xvcik7XG5cdH1cblxuXHRhc3luYyBzZXROZXh0Q29tbWFuZElkKGlkOiBudW1iZXIsIGNvbW1hbmRMaW5lOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcHJveHkuc2V0TmV4dENvbW1hbmRJZChpZCwgY29tbWFuZExpbmUsIGNvbW1hbmRJZCk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4oaWQ6IG51bWJlciwgcHJvcGVydHk6IFByb2Nlc3NQcm9wZXJ0eVR5cGUsIHZhbHVlOiBJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnVwZGF0ZVByb3BlcnR5KGlkLCBwcm9wZXJ0eSwgdmFsdWUpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlUHJvY2Vzcyhcblx0XHRzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdGN3ZDogc3RyaW5nLFxuXHRcdGNvbHM6IG51bWJlcixcblx0XHRyb3dzOiBudW1iZXIsXG5cdFx0dW5pY29kZVZlcnNpb246ICc2JyB8ICcxMScsXG5cdFx0ZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50LFxuXHRcdG9wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLFxuXHRcdHNob3VsZFBlcnNpc3Q6IGJvb2xlYW5cblx0KTogUHJvbWlzZTxJVGVybWluYWxDaGlsZFByb2Nlc3M+IHtcblx0XHRhd2FpdCB0aGlzLl9jb25uZWN0VG9EaXJlY3RQcm94eSgpO1xuXHRcdGNvbnN0IGV4ZWN1dGFibGVFbnYgPSBhd2FpdCB0aGlzLl9zaGVsbEVudmlyb25tZW50U2VydmljZS5nZXRTaGVsbEVudigpO1xuXHRcdGNvbnN0IGlkID0gYXdhaXQgdGhpcy5fcHJveHkuY3JlYXRlUHJvY2VzcyhzaGVsbExhdW5jaENvbmZpZywgY3dkLCBjb2xzLCByb3dzLCB1bmljb2RlVmVyc2lvbiwgZW52LCBleGVjdXRhYmxlRW52LCBvcHRpb25zLCBzaG91bGRQZXJzaXN0LCB0aGlzLl9nZXRXb3Jrc3BhY2VJZCgpLCB0aGlzLl9nZXRXb3Jrc3BhY2VOYW1lKCkpO1xuXHRcdGNvbnN0IHB0eSA9IG5ldyBMb2NhbFB0eShpZCwgc2hvdWxkUGVyc2lzdCwgdGhpcy5fcHJveHkpO1xuXHRcdHRoaXMuX3B0eXMuc2V0KGlkLCBwdHkpO1xuXHRcdHJldHVybiBwdHk7XG5cdH1cblxuXHRhc3luYyBhdHRhY2hUb1Byb2Nlc3MoaWQ6IG51bWJlcik6IFByb21pc2U8SVRlcm1pbmFsQ2hpbGRQcm9jZXNzIHwgdW5kZWZpbmVkPiB7XG5cdFx0YXdhaXQgdGhpcy5fY29ubmVjdFRvRGlyZWN0UHJveHkoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuYXR0YWNoVG9Qcm9jZXNzKGlkKTtcblx0XHRcdGNvbnN0IHB0eSA9IG5ldyBMb2NhbFB0eShpZCwgdHJ1ZSwgdGhpcy5fcHJveHkpO1xuXHRcdFx0dGhpcy5fcHR5cy5zZXQoaWQsIHB0eSk7XG5cdFx0XHRyZXR1cm4gcHR5O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgQ291bGRuJ3QgYXR0YWNoIHRvIHByb2Nlc3MgJHtlLm1lc3NhZ2V9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBhdHRhY2hUb1Jldml2ZWRQcm9jZXNzKGlkOiBudW1iZXIpOiBQcm9taXNlPElUZXJtaW5hbENoaWxkUHJvY2VzcyB8IHVuZGVmaW5lZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3RUb0RpcmVjdFByb3h5KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG5ld0lkID0gYXdhaXQgdGhpcy5fcHJveHkuZ2V0UmV2aXZlZFB0eU5ld0lkKHRoaXMuX2dldFdvcmtzcGFjZUlkKCksIGlkKSA/PyBpZDtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmF0dGFjaFRvUHJvY2VzcyhuZXdJZCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBDb3VsZG4ndCBhdHRhY2ggdG8gcHJvY2VzcyAke2UubWVzc2FnZX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGxpc3RQcm9jZXNzZXMoKTogUHJvbWlzZTxJUHJvY2Vzc0RldGFpbHNbXT4ge1xuXHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3RUb0RpcmVjdFByb3h5KCk7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5Lmxpc3RQcm9jZXNzZXMoKTtcblx0fVxuXG5cdGFzeW5jIGdldExhdGVuY3koKTogUHJvbWlzZTxJUHR5SG9zdExhdGVuY3lNZWFzdXJlbWVudFtdPiB7XG5cdFx0Y29uc3QgbWVhc3VyZW1lbnRzOiBJUHR5SG9zdExhdGVuY3lNZWFzdXJlbWVudFtdID0gW107XG5cdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0aWYgKHRoaXMuX2RpcmVjdFByb3h5KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9kaXJlY3RQcm94eS5nZXRMYXRlbmN5KCk7XG5cdFx0XHRzdy5zdG9wKCk7XG5cdFx0XHRtZWFzdXJlbWVudHMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiAnd2luZG93PC0+cHR5aG9zdCAobWVzc2FnZSBwb3J0KScsXG5cdFx0XHRcdGxhdGVuY3k6IHN3LmVsYXBzZWQoKVxuXHRcdFx0fSk7XG5cdFx0XHRzdy5yZXNldCgpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5fbG9jYWxQdHlTZXJ2aWNlLmdldExhdGVuY3koKTtcblx0XHRzdy5zdG9wKCk7XG5cdFx0bWVhc3VyZW1lbnRzLnB1c2goe1xuXHRcdFx0bGFiZWw6ICd3aW5kb3c8LT5wdHlob3N0c2VydmljZTwtPnB0eWhvc3QnLFxuXHRcdFx0bGF0ZW5jeTogc3cuZWxhcHNlZCgpXG5cdFx0fSk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLm1lYXN1cmVtZW50cyxcblx0XHRcdC4uLnJlc3VsdHNcblx0XHRdO1xuXHR9XG5cblx0YXN5bmMgZ2V0UGVyZm9ybWFuY2VNYXJrcygpOiBQcm9taXNlPFBlcmZvcm1hbmNlTWFya1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmdldFBlcmZvcm1hbmNlTWFya3MoKTtcblx0fVxuXG5cdGFzeW5jIHJlZHVjZUNvbm5lY3Rpb25HcmFjZVRpbWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcHJveHkucmVkdWNlQ29ubmVjdGlvbkdyYWNlVGltZSgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0RGVmYXVsdFN5c3RlbVNoZWxsKG9zT3ZlcnJpZGU/OiBPcGVyYXRpbmdTeXN0ZW0pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5nZXREZWZhdWx0U3lzdGVtU2hlbGwob3NPdmVycmlkZSk7XG5cdH1cblxuXHRhc3luYyBnZXRQcm9maWxlcyhwcm9maWxlczogdW5rbm93biwgZGVmYXVsdFByb2ZpbGU6IHVua25vd24sIGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzPzogYm9vbGVhbikge1xuXHRcdHJldHVybiB0aGlzLl9sb2NhbFB0eVNlcnZpY2UuZ2V0UHJvZmlsZXModGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuaWQsIHByb2ZpbGVzLCBkZWZhdWx0UHJvZmlsZSwgaW5jbHVkZURldGVjdGVkUHJvZmlsZXMpIHx8IFtdO1xuXHR9XG5cblx0QG1lbW9pemVcblx0YXN5bmMgZ2V0RW52aXJvbm1lbnQoKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmdldEVudmlyb25tZW50KCk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRhc3luYyBnZXRTaGVsbEVudmlyb25tZW50KCk6IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD4ge1xuXHRcdGNvbnN0IGVudiA9IHsgLi4uIGF3YWl0IHRoaXMuX3NoZWxsRW52aXJvbm1lbnRTZXJ2aWNlLmdldFNoZWxsRW52KCkgfTtcblxuXHRcdC8vIElmIHJ1bm5pbmcgaW4gdGhlIGNvbnRleHQgb2YgYW4gZXh0ZW5zaW9uIGRldmVsb3BtZW50IGhvc3QsIGluY2x1ZGUgdGhlIGVudmlyb25tZW50IGRlcml2ZWQgZnJvbSB0aGUgbGF1bmNoIGNvbmZpZ3VyYXRpb25cblx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5lbnYpIHtcblx0XHRcdHRlcm1pbmFsRW52aXJvbm1lbnQubWVyZ2VFbnZpcm9ubWVudHMoZW52LCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0LmVudik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVudjtcblx0fVxuXG5cdGFzeW5jIGdldFdzbFBhdGgob3JpZ2luYWw6IHN0cmluZywgZGlyZWN0aW9uOiAndW5peC10by13aW4nIHwgJ3dpbi10by11bml4Jyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmdldFdzbFBhdGgob3JpZ2luYWwsIGRpcmVjdGlvbik7XG5cdH1cblxuXHRhc3luYyBzZXRUZXJtaW5hbExheW91dEluZm8obGF5b3V0SW5mbz86IElUZXJtaW5hbHNMYXlvdXRJbmZvQnlJZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFyZ3M6IElTZXRUZXJtaW5hbExheW91dEluZm9BcmdzID0ge1xuXHRcdFx0d29ya3NwYWNlSWQ6IHRoaXMuX2dldFdvcmtzcGFjZUlkKCksXG5cdFx0XHR0YWJzOiBsYXlvdXRJbmZvID8gbGF5b3V0SW5mby50YWJzIDogW10sXG5cdFx0XHRiYWNrZ3JvdW5kOiBsYXlvdXRJbmZvID8gbGF5b3V0SW5mby5iYWNrZ3JvdW5kIDogbnVsbFxuXHRcdH07XG5cdFx0YXdhaXQgdGhpcy5fcHJveHkuc2V0VGVybWluYWxMYXlvdXRJbmZvKGFyZ3MpO1xuXHRcdC8vIFN0b3JlIGluIHRoZSBzdG9yYWdlIHNlcnZpY2UgYXMgd2VsbCB0byBiZSB1c2VkIHdoZW4gcmV2aXZpbmcgcHJvY2Vzc2VzIGFzIG5vcm1hbGx5IHRoaXNcblx0XHQvLyBpcyBzdG9yZWQgaW4gbWVtb3J5IG9uIHRoZSBwdHkgaG9zdFxuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRlcm1pbmFsU3RvcmFnZUtleXMuVGVybWluYWxMYXlvdXRJbmZvLCBKU09OLnN0cmluZ2lmeShhcmdzKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdGFzeW5jIGdldFRlcm1pbmFsTGF5b3V0SW5mbygpOiBQcm9taXNlPElUZXJtaW5hbHNMYXlvdXRJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlSWQgPSB0aGlzLl9nZXRXb3Jrc3BhY2VJZCgpO1xuXHRcdGNvbnN0IGxheW91dEFyZ3M6IElHZXRUZXJtaW5hbExheW91dEluZm9BcmdzID0geyB3b3Jrc3BhY2VJZCB9O1xuXG5cdFx0Ly8gUmV2aXZlIHByb2Nlc3NlcyBpZiBuZWVkZWRcblx0XHRjb25zdCBzZXJpYWxpemVkU3RhdGUgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoVGVybWluYWxTdG9yYWdlS2V5cy5UZXJtaW5hbEJ1ZmZlclN0YXRlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRjb25zdCByZXZpdmVCdWZmZXJTdGF0ZSA9IHRoaXMuX2Rlc2VyaWFsaXplVGVybWluYWxTdGF0ZShzZXJpYWxpemVkU3RhdGUpO1xuXHRcdGlmIChyZXZpdmVCdWZmZXJTdGF0ZSAmJiByZXZpdmVCdWZmZXJTdGF0ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBDcmVhdGUgdmFyaWFibGUgcmVzb2x2ZXJcblx0XHRcdFx0Y29uc3QgYWN0aXZlV29ya3NwYWNlUm9vdFVyaSA9IHRoaXMuX2hpc3RvcnlTZXJ2aWNlLmdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290KCk7XG5cdFx0XHRcdGNvbnN0IGxhc3RBY3RpdmVXb3Jrc3BhY2UgPSBhY3RpdmVXb3Jrc3BhY2VSb290VXJpID8gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkpID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgdmFyaWFibGVSZXNvbHZlciA9IHRlcm1pbmFsRW52aXJvbm1lbnQuY3JlYXRlVmFyaWFibGVSZXNvbHZlcihsYXN0QWN0aXZlV29ya3NwYWNlLCBhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UuZ2V0RW52aXJvbm1lbnQodGhpcy5yZW1vdGVBdXRob3JpdHkpLCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBSZS1yZXNvbHZlIHRoZSBlbnZpcm9ubWVudHMgYW5kIHJlcGxhY2UgaXQgb24gdGhlIHN0YXRlIHNvIGxvY2FsIHRlcm1pbmFscyB1c2UgYSBmcmVzaFxuXHRcdFx0XHQvLyBlbnZpcm9ubWVudFxuXHRcdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL3dpbGxHZXRSZXZpdmVFbnZpcm9ubWVudHMnKTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocmV2aXZlQnVmZmVyU3RhdGUubWFwKHN0YXRlID0+IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Jlc29sdmVFbnZpcm9ubWVudEZvclJldml2ZSh2YXJpYWJsZVJlc29sdmVyLCBzdGF0ZS5zaGVsbExhdW5jaENvbmZpZykudGhlbihmcmVzaEVudiA9PiB7XG5cdFx0XHRcdFx0XHRzdGF0ZS5wcm9jZXNzTGF1bmNoQ29uZmlnLmVudiA9IGZyZXNoRW52O1xuXHRcdFx0XHRcdFx0cigpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZEdldFJldml2ZUVudmlyb25tZW50cycpO1xuXG5cdFx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbFJldml2ZVRlcm1pbmFsUHJvY2Vzc2VzJyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LnJldml2ZVRlcm1pbmFsUHJvY2Vzc2VzKHdvcmtzcGFjZUlkLCByZXZpdmVCdWZmZXJTdGF0ZSwgSW50bC5EYXRlVGltZUZvcm1hdCgpLnJlc29sdmVkT3B0aW9ucygpLmxvY2FsZSk7XG5cdFx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkUmV2aXZlVGVybWluYWxQcm9jZXNzZXMnKTtcblx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFRlcm1pbmFsU3RvcmFnZUtleXMuVGVybWluYWxCdWZmZXJTdGF0ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRcdC8vIElmIHJldml2aW5nIHByb2Nlc3Nlcywgc2VuZCB0aGUgdGVybWluYWwgbGF5b3V0IGluZm8gYmFjayB0byB0aGUgcHR5IGhvc3QgYXMgaXRcblx0XHRcdFx0Ly8gd2lsbCBub3QgaGF2ZSBiZWVuIHBlcnNpc3RlZCBvbiBhcHBsaWNhdGlvbiBleGl0XG5cdFx0XHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoVGVybWluYWxTdG9yYWdlS2V5cy5UZXJtaW5hbExheW91dEluZm8sIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0XHRpZiAobGF5b3V0SW5mbykge1xuXHRcdFx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbFNldFRlcm1pbmFsTGF5b3V0SW5mbycpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LnNldFRlcm1pbmFsTGF5b3V0SW5mbyhKU09OLnBhcnNlKGxheW91dEluZm8pKTtcblx0XHRcdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZFNldFRlcm1pbmFsTGF5b3V0SW5mbycpO1xuXHRcdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShUZXJtaW5hbFN0b3JhZ2VLZXlzLlRlcm1pbmFsTGF5b3V0SW5mbywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGU6IHVua25vd24pIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdMb2NhbFRlcm1pbmFsQmFja2VuZCNnZXRUZXJtaW5hbExheW91dEluZm8gRXJyb3InLCAoPHsgbWVzc2FnZT86IHN0cmluZyB9PmUpLm1lc3NhZ2UgPz8gZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmdldFRlcm1pbmFsTGF5b3V0SW5mbyhsYXlvdXRBcmdzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVFbnZpcm9ubWVudEZvclJldml2ZSh2YXJpYWJsZVJlc29sdmVyOiB0ZXJtaW5hbEVudmlyb25tZW50LlZhcmlhYmxlUmVzb2x2ZXIgfCB1bmRlZmluZWQsIHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcpOiBQcm9taXNlPElQcm9jZXNzRW52aXJvbm1lbnQ+IHtcblx0XHRjb25zdCBwbGF0Zm9ybUtleSA9IGlzV2luZG93cyA/ICd3aW5kb3dzJyA6IChpc01hY2ludG9zaCA/ICdvc3gnIDogJ2xpbnV4Jyk7XG5cdFx0Y29uc3QgZW52RnJvbUNvbmZpZ1ZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVRlcm1pbmFsRW52aXJvbm1lbnQgfCB1bmRlZmluZWQ+KGB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudi4ke3BsYXRmb3JtS2V5fWApO1xuXHRcdGNvbnN0IGJhc2VFbnYgPSBhd2FpdCAoc2hlbGxMYXVuY2hDb25maWcudXNlU2hlbGxFbnZpcm9ubWVudCA/IHRoaXMuZ2V0U2hlbGxFbnZpcm9ubWVudCgpIDogdGhpcy5nZXRFbnZpcm9ubWVudCgpKTtcblx0XHRjb25zdCBlbnYgPSBhd2FpdCB0ZXJtaW5hbEVudmlyb25tZW50LmNyZWF0ZVRlcm1pbmFsRW52aXJvbm1lbnQoc2hlbGxMYXVuY2hDb25maWcsIGVudkZyb21Db25maWdWYWx1ZSwgdmFyaWFibGVSZXNvbHZlciwgdGhpcy5fcHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuRGV0ZWN0TG9jYWxlKSwgYmFzZUVudik7XG5cdFx0aWYgKHNob3VsZFVzZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKHNoZWxsTGF1bmNoQ29uZmlnKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGVybWluYWxFbnZpcm9ubWVudC5nZXRXb3Jrc3BhY2VGb3JUZXJtaW5hbChzaGVsbExhdW5jaENvbmZpZy5jd2QsIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB0aGlzLl9oaXN0b3J5U2VydmljZSk7XG5cdFx0XHRhd2FpdCB0aGlzLl9lbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZS5tZXJnZWRDb2xsZWN0aW9uLmFwcGx5VG9Qcm9jZXNzRW52aXJvbm1lbnQoZW52LCB7IHdvcmtzcGFjZUZvbGRlciB9LCB2YXJpYWJsZVJlc29sdmVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVudjtcblx0fVxuXG5cdHByaXZhdGUgX2dldFdvcmtzcGFjZU5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKTtcblx0fVxuXG5cdC8vICNyZWdpb24gUHR5IHNlcnZpY2UgY29udHJpYnV0aW9uIFJQQyBjYWxsc1xuXG5cdGluc3RhbGxBdXRvUmVwbHkobWF0Y2g6IHN0cmluZywgcmVwbHk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5pbnN0YWxsQXV0b1JlcGx5KG1hdGNoLCByZXBseSk7XG5cdH1cblx0dW5pbnN0YWxsQWxsQXV0b1JlcGxpZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzKCk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUE4QixhQUFhLGlCQUFrQztBQUU3RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGtCQUE2TCxxQkFBbUgsb0JBQW9CLHFCQUFxQix5QkFBMkM7QUFFN1ksU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1QkFBdUI7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
