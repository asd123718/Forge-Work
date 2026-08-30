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
import { DeferredPromise } from "../../../base/common/async.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../base/common/observable.js";
import { mark } from "../../../base/common/performance.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { getDelayedChannel, ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { Client as MessagePortClient } from "../../../base/parts/ipc/common/ipc.mp.js";
import { acquirePort, MessagePortAcquisitionError } from "../../../base/parts/ipc/electron-browser/ipc.mp.js";
import { ipcRenderer } from "../../../base/parts/sandbox/electron-browser/globals.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { AgentHostIpcChannelTransport } from "../browser/agentHostIpcChannelTransport.js";
import { AgentHostClientState, RemoteAgentHostProtocolClient } from "../browser/remoteAgentHostProtocolClient.js";
import { AhpJsonlLogger } from "../common/ahpJsonlLogger.js";
import { AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, AgentHostClientByokLmChannel } from "../common/agentHostClientByokLmChannel.js";
import { AGENT_HOST_CLIENT_PROXY_CHANNEL, AgentHostClientProxyChannel } from "../common/agentHostClientProxyChannel.js";
import { LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from "../common/agentHostResourceService.js";
import { AgentHostClientConnectionKind } from "../common/agentHostTelemetry.js";
import {
  AgentHostAhpJsonlLoggingSettingId,
  AgentHostByokModelsEnabledSettingId,
  AgentHostIpcChannels,
  AgentHostOTelPolicyIpcChannel,
  AgentHostRestartIpcChannel,
  AgentHostWillRestartIpcChannel,
  AgentSession,
  readAgentHostOTelPolicySettings
} from "../common/agentService.js";
import { NonReconnectableTransportError } from "../common/state/sessionTransport.js";
const LOG_PREFIX = "[AgentHost:renderer]";
class LocalAgentHostManagementConnection extends Disposable {
  constructor() {
    super();
    this._generation = this._createGeneration();
    this._register(toDisposable(() => this.closed("Local agent host service was disposed.")));
  }
  client() {
    return this._generation.p;
  }
  acquire(client) {
    const generation = this._generation;
    return client.then((value) => {
      if (this._generation === generation) {
        this._pending = { generation, client: value };
      }
      return value;
    });
  }
  connected() {
    const pending = this._pending;
    this._pending = void 0;
    if (pending?.generation === this._generation) {
      void this._generation.complete(pending.client);
    }
  }
  reconnecting() {
    this._pending = void 0;
    const previous = this._generation;
    this._generation = this._createGeneration();
    void previous.error(new Error("Local agent host connection is reconnecting."));
  }
  closed(message = "Local agent host connection closed.") {
    this._pending = void 0;
    if (this._generation.isSettled) {
      this._generation = this._createGeneration();
    }
    void this._generation.error(new Error(message));
  }
  _createGeneration() {
    const generation = new DeferredPromise();
    generation.p.then(void 0, () => {
    });
    return generation;
  }
}
let LocalAgentHostServiceClient = class extends Disposable {
  constructor(_clientInfo, _logService, _configurationService, environmentService, _instantiationService) {
    super();
    this._clientInfo = _clientInfo;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this.clientId = generateUuid();
    this._clientStore = this._register(new MutableDisposable());
    this._managementConnection = this._register(new LocalAgentHostManagementConnection());
    this._connectStarted = false;
    this._didAcquireInitialMessagePort = false;
    this._didConnectInitially = false;
    this._didStartInitialSessionList = false;
    this._didCompleteInitialSessionList = false;
    this._onAgentHostExit = this._register(new Emitter());
    this.onAgentHostExit = this._onAgentHostExit.event;
    this._onAgentHostStart = this._register(new Emitter());
    this.onAgentHostStart = this._onAgentHostStart.event;
    this._authenticationPending = observableValue("authenticationPending", true);
    this.authenticationPending = this._authenticationPending;
    this._authenticationSettled = false;
    this._noopRootState = {
      value: void 0,
      verifiedValue: void 0,
      onDidChange: Event.None,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
    this._ahpLogger = this._configurationService.getValue(AgentHostAhpJsonlLoggingSettingId) ? this._register(this._instantiationService.createInstance(AhpJsonlLogger, {
      logsHome: environmentService.logsHome,
      connectionId: this.clientId,
      transport: "local"
    })) : void 0;
    const onWillRestart = () => {
      if (!this._protocolClient?.reconnectFromClosed()) {
        this._protocolClient?.notifyTransportClosed();
      }
    };
    ipcRenderer.on(AgentHostWillRestartIpcChannel, onWillRestart);
    this._register(toDisposable(() => ipcRenderer.removeListener(AgentHostWillRestartIpcChannel, onWillRestart)));
  }
  startAgentHost() {
    if (!this._protocolClient) {
      mark("code/agentHost/willStart");
      this._protocolClient = this._register(this._instantiationService.createInstance(
        RemoteAgentHostProtocolClient,
        LOCAL_AGENT_HOST_RESOURCE_IDENTITY,
        () => this._createTransport(),
        void 0,
        this.clientId,
        this._clientInfo
      ));
      this._register(this._protocolClient.onDidChangeConnectionState((state) => this._handleConnectionState(state)));
    }
    void this._connect().catch((error) => {
      this._logService.error(`${LOG_PREFIX} Protocol connection failed`, error);
    });
  }
  async _connect() {
    if (this._connectStarted) {
      return;
    }
    this._connectStarted = true;
    await this._requireClient().connect();
  }
  _createTransport() {
    const clientPromise = this._acquireClient();
    return new AgentHostIpcChannelTransport(
      getDelayedChannel(clientPromise.then((client) => client.getChannel(AgentHostIpcChannels.Protocol))),
      this._ahpLogger,
      AgentHostClientConnectionKind.Local
    );
  }
  _acquireClient() {
    return this._managementConnection.acquire(this._doAcquireClient());
  }
  async _doAcquireClient() {
    this._logService.info(`${LOG_PREFIX} Acquiring MessagePort to agent host...`);
    this._forwardOTelPolicy();
    let port;
    try {
      port = await acquirePort("vscode:createAgentHostMessageChannel", "vscode:createAgentHostMessageChannelResult");
    } catch (error) {
      if (error instanceof MessagePortAcquisitionError && error.fatal) {
        throw new NonReconnectableTransportError(error.message);
      }
      throw error;
    }
    if (this._store.isDisposed) {
      port.close();
      throw new Error("Local agent host service was disposed during connection.");
    }
    if (!this._didAcquireInitialMessagePort) {
      this._didAcquireInitialMessagePort = true;
      mark("code/agentHost/didAcquireMessagePort");
    }
    this._logService.info(`${LOG_PREFIX} MessagePort acquired, creating client...`);
    const store = new DisposableStore();
    try {
      const client = store.add(new MessagePortClient(port, this.clientId));
      registerAgentHostClientChannels(
        client,
        this._instantiationService,
        this._logService,
        this._configurationService.getValue(AgentHostByokModelsEnabledSettingId) === true
      );
      this._clientStore.value = store;
      return client;
    } catch (error) {
      store.dispose();
      throw error;
    }
  }
  _forwardOTelPolicy() {
    ipcRenderer.send(AgentHostOTelPolicyIpcChannel, readAgentHostOTelPolicySettings(this._configurationService));
  }
  _handleConnectionState(state) {
    if (this._store.isDisposed) {
      return;
    }
    if (state === AgentHostClientState.Connected) {
      this._managementConnection.connected();
      if (!this._didConnectInitially) {
        this._didConnectInitially = true;
        mark("code/agentHost/didConnect");
      }
      this._logService.info(`${LOG_PREFIX} Protocol connection established; clientId=${this._requireClient().clientId}`);
      this._onAgentHostStart.fire();
    } else if (state === AgentHostClientState.Reconnecting || state === AgentHostClientState.Incompatible || state === AgentHostClientState.Closed) {
      this._clientStore.clear();
      if (state === AgentHostClientState.Reconnecting) {
        this._managementConnection.reconnecting();
      } else {
        this._managementConnection.closed(state === AgentHostClientState.Incompatible ? "Local agent host protocol is incompatible." : "Local agent host connection closed.");
      }
      this._onAgentHostExit.fire(0);
    }
  }
  _requireClient() {
    if (!this._protocolClient) {
      throw new Error("Local agent host is not connected.");
    }
    return this._protocolClient;
  }
  setAuthenticationPending(pending) {
    if (this._authenticationSettled) {
      return;
    }
    if (!pending) {
      this._authenticationSettled = true;
    }
    this._authenticationPending.set(pending, void 0);
  }
  get initializeResult() {
    return this._protocolClient?.initializeResult ?? constObservable(void 0);
  }
  get rootState() {
    return this._protocolClient?.rootState ?? this._noopRootState;
  }
  get onDidAction() {
    return this._protocolClient?.onDidAction ?? Event.None;
  }
  get onDidNotification() {
    return this._protocolClient?.onDidNotification ?? Event.None;
  }
  get onMcpNotification() {
    return this._protocolClient?.onMcpNotification ?? Event.None;
  }
  getSubscription(kind, resource, owner) {
    return this._requireClient().getSubscription(kind, resource, owner);
  }
  getSubscriptionUnmanaged(kind, resource) {
    return this._protocolClient?.getSubscriptionUnmanaged(kind, resource);
  }
  getInflightSessionCreate(resource) {
    return this._protocolClient?.getInflightSessionCreate(resource);
  }
  getActiveSubscriptions() {
    return this._protocolClient?.getActiveSubscriptions() ?? [];
  }
  dispatch(channel, action) {
    this._requireClient().dispatch(channel, action);
  }
  authenticate(params) {
    return this._requireClient().authenticate(params);
  }
  listSessions() {
    if (!this._didStartInitialSessionList) {
      this._didStartInitialSessionList = true;
      mark("code/agentHost/willListSessions");
    }
    return this._requireClient().listSessions().then((sessions) => {
      if (!this._didCompleteInitialSessionList) {
        this._didCompleteInitialSessionList = true;
        mark("code/agentHost/didListSessions");
      }
      return sessions;
    });
  }
  createSession(config) {
    if (config && hasSessionExtensions(config)) {
      if (!config.provider) {
        throw new Error("Cannot create local agent host session without a provider.");
      }
      const session = config.session ?? AgentSession.uri(config.provider, generateUuid());
      const promise = this._getManagementService().createSessionWithExtensions({ ...config, session });
      this._requireClient().trackSessionCreate(session, promise);
      return promise;
    }
    return this._requireClient().createSession(config);
  }
  resolveSessionConfig(params) {
    return this._requireClient().resolveSessionConfig(params);
  }
  sessionConfigCompletions(params) {
    return this._requireClient().sessionConfigCompletions(params);
  }
  completions(params) {
    return this._requireClient().completions(params);
  }
  getCompletionTriggerCharacters() {
    return this._requireClient().getCompletionTriggerCharacters();
  }
  disposeSession(session) {
    return this._requireClient().disposeSession(session);
  }
  createChat(session, chat, options) {
    if (options && hasChatExtensions(options)) {
      return this._getManagementService().createChatWithExtensions(session, chat, options);
    }
    return this._requireClient().createChat(session, chat, options);
  }
  disposeChat(chat) {
    return this._requireClient().disposeChat(chat);
  }
  createTerminal(params) {
    return this._requireClient().createTerminal(params);
  }
  disposeTerminal(terminal) {
    return this._requireClient().disposeTerminal(terminal);
  }
  invokeChangesetOperation(params) {
    return this._requireClient().invokeChangesetOperation(params);
  }
  handleMcpRequest(channel, method, params) {
    return this._requireClient().handleMcpRequest(channel, method, params);
  }
  resourceList(uri) {
    return this._requireClient().resourceList(uri);
  }
  resourceRead(uri) {
    return this._requireClient().resourceRead(uri);
  }
  resourceWrite(params) {
    return this._requireClient().resourceWrite(params);
  }
  resourceCopy(params) {
    return this._requireClient().resourceCopy(params);
  }
  resourceDelete(params) {
    return this._requireClient().resourceDelete(params);
  }
  resourceMove(params) {
    return this._requireClient().resourceMove(params);
  }
  resourceResolve(params) {
    return this._requireClient().resourceResolve(params);
  }
  resourceMkdir(params) {
    return this._requireClient().resourceMkdir(params);
  }
  createResourceWatch(params) {
    return this._requireClient().createResourceWatch(params);
  }
  watchResource(params) {
    return this._requireClient().watchResource(params);
  }
  getNetworkDiagnosticsInfo() {
    return this._getManagementService().getNetworkDiagnosticsInfo();
  }
  getManagedSettingsDiagnostics() {
    return this._getManagementService().getManagedSettingsDiagnostics();
  }
  diagnosticsFetch(url) {
    return this._getManagementService().diagnosticsFetch(url);
  }
  async restartAgentHost() {
    this._forwardOTelPolicy();
    ipcRenderer.send(AgentHostRestartIpcChannel);
  }
  startWebSocketServer() {
    return this._getManagementService().startWebSocketServer();
  }
  getInspectInfo(tryEnable) {
    return this._getManagementService().getInspectInfo(tryEnable);
  }
  _getManagementService() {
    return ProxyChannel.toService(
      getDelayedChannel(this._managementConnection.client().then((client) => client.getChannel(AgentHostIpcChannels.Management)))
    );
  }
};
LocalAgentHostServiceClient = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IInstantiationService)
], LocalAgentHostServiceClient);
function hasSessionExtensions(config) {
  return config.model !== void 0 || config.agent !== void 0 || config.importConversation !== void 0;
}
function hasChatExtensions(options) {
  return options.title !== void 0 || options.model !== void 0;
}
function registerAgentHostClientChannels(client, instantiationService, logService, byokEnabled) {
  client.registerChannel(AGENT_HOST_CLIENT_PROXY_CHANNEL, instantiationService.createInstance(AgentHostClientProxyChannel));
  if (byokEnabled) {
    try {
      client.registerChannel(AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, instantiationService.createInstance(AgentHostClientByokLmChannel));
    } catch (error) {
      logService.warn(`${LOG_PREFIX} BYOK language-model bridge not registered for this window. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
export {
  LocalAgentHostManagementConnection,
  LocalAgentHostServiceClient,
  registerAgentHostClientChannels
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxlbGVjdHJvbi1icm93c2VyXFxsb2NhbEFnZW50SG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IG1hcmsgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBnZXREZWxheWVkQ2hhbm5lbCwgSUNoYW5uZWxDbGllbnQsIElDaGFubmVsU2VydmVyLCBQcm94eUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IENsaWVudCBhcyBNZXNzYWdlUG9ydENsaWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubXAuanMnO1xuaW1wb3J0IHsgYWNxdWlyZVBvcnQsIE1lc3NhZ2VQb3J0QWNxdWlzaXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2VsZWN0cm9uLWJyb3dzZXIvaXBjLm1wLmpzJztcbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9zYW5kYm94L2VsZWN0cm9uLWJyb3dzZXIvZ2xvYmFscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdElwY0NoYW5uZWxUcmFuc3BvcnQgfSBmcm9tICcuLi9icm93c2VyL2FnZW50SG9zdElwY0NoYW5uZWxUcmFuc3BvcnQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50U3RhdGUsIFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50IH0gZnJvbSAnLi4vYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC5qcyc7XG5pbXBvcnQgeyBBaHBKc29ubExvZ2dlciB9IGZyb20gJy4uL2NvbW1vbi9haHBKc29ubExvZ2dlci5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0NMSUVOVF9CWU9LX0xNX0NIQU5ORUwsIEFnZW50SG9zdENsaWVudEJ5b2tMbUNoYW5uZWwgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50Qnlva0xtQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0NMSUVOVF9QUk9YWV9DSEFOTkVMLCBBZ2VudEhvc3RDbGllbnRQcm94eUNoYW5uZWwgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50UHJveHlDaGFubmVsLmpzJztcbmltcG9ydCB7IExPQ0FMX0FHRU5UX0hPU1RfUkVTT1VSQ0VfSURFTlRJVFkgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQge1xuXHRBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQsXG5cdEFnZW50SG9zdEJ5b2tNb2RlbHNFbmFibGVkU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RJcGNDaGFubmVscyxcblx0QWdlbnRIb3N0T1RlbFBvbGljeUlwY0NoYW5uZWwsXG5cdEFnZW50SG9zdFJlc3RhcnRJcGNDaGFubmVsLFxuXHRBZ2VudEhvc3RXaWxsUmVzdGFydElwY0NoYW5uZWwsXG5cdEFnZW50U2Vzc2lvbixcblx0SUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMsXG5cdElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsXG5cdElBZ2VudEhvc3RJbnNwZWN0SW5mbyxcblx0SUFnZW50SG9zdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MsXG5cdElBZ2VudEhvc3ROZXR3b3JrRGlhZ25vc3RpY3NJbmZvLFxuXHRJQWdlbnRIb3N0TmV0d29ya0ZldGNoUmVzdWx0LFxuXHRJQWdlbnRIb3N0U2VydmljZSxcblx0SUFnZW50SG9zdFNvY2tldEluZm8sXG5cdElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zLFxuXHRJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMsXG5cdElBZ2VudFNlc3Npb25NZXRhZGF0YSxcblx0QXV0aGVudGljYXRlUGFyYW1zLFxuXHRBdXRoZW50aWNhdGVSZXN1bHQsXG5cdElNY3BOb3RpZmljYXRpb24sXG5cdHJlYWRBZ2VudEhvc3RPVGVsUG9saWN5U2V0dGluZ3MsXG59IGZyb20gJy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJUmVtb3RlV2F0Y2hIYW5kbGUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB0eXBlIHsgSUFjdGl2ZVN1YnNjcmlwdGlvbkluZm8sIElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbXBsZXRpb25zUGFyYW1zLCBDb21wbGV0aW9uc1Jlc3VsdCwgQ3JlYXRlVGVybWluYWxQYXJhbXMsIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJbXBsZW1lbnRhdGlvbiwgSW5pdGlhbGl6ZVJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTm9uUmVjb25uZWN0YWJsZVRyYW5zcG9ydEVycm9yIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25UcmFuc3BvcnQuanMnO1xuaW1wb3J0IHR5cGUgeyBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25QYXJhbXMsIEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1jaGFuZ2VzZXQvY29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zLCBDcmVhdGVSZXNvdXJjZVdhdGNoUmVzdWx0LCBSZXNvdXJjZUNvcHlQYXJhbXMsIFJlc291cmNlQ29weVJlc3VsdCwgUmVzb3VyY2VEZWxldGVQYXJhbXMsIFJlc291cmNlRGVsZXRlUmVzdWx0LCBSZXNvdXJjZUxpc3RSZXN1bHQsIFJlc291cmNlTWtkaXJQYXJhbXMsIFJlc291cmNlTWtkaXJSZXN1bHQsIFJlc291cmNlTW92ZVBhcmFtcywgUmVzb3VyY2VNb3ZlUmVzdWx0LCBSZXNvdXJjZVJlYWRSZXN1bHQsIFJlc291cmNlUmVzb2x2ZVBhcmFtcywgUmVzb3VyY2VSZXNvbHZlUmVzdWx0LCBSZXNvdXJjZVdyaXRlUGFyYW1zLCBSZXNvdXJjZVdyaXRlUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgdHlwZSB7IEFjdGlvbkVudmVsb3BlLCBDaGF0QWN0aW9uLCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiwgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uLCBJTm90aWZpY2F0aW9uLCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIFNlc3Npb25BY3Rpb24sIFRlcm1pbmFsQWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgQ29tcG9uZW50VG9TdGF0ZSwgUm9vdFN0YXRlLCBTdGF0ZUNvbXBvbmVudHMgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcblxuY29uc3QgTE9HX1BSRUZJWCA9ICdbQWdlbnRIb3N0OnJlbmRlcmVyXSc7XG5cbi8qKlxuICogS2VlcHMgbWFuYWdlbWVudC1jaGFubmVsIGNhbGxzIG9uIHRoZSBzYW1lIE1lc3NhZ2VQb3J0IGdlbmVyYXRpb24gYXMgdGhlXG4gKiBjb25uZWN0ZWQgQUhQIHRyYW5zcG9ydC5cbiAqL1xuZXhwb3J0IGNsYXNzIExvY2FsQWdlbnRIb3N0TWFuYWdlbWVudENvbm5lY3Rpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9nZW5lcmF0aW9uID0gdGhpcy5fY3JlYXRlR2VuZXJhdGlvbigpO1xuXHRwcml2YXRlIF9wZW5kaW5nOiB7IHJlYWRvbmx5IGdlbmVyYXRpb246IERlZmVycmVkUHJvbWlzZTxJQ2hhbm5lbENsaWVudD47IHJlYWRvbmx5IGNsaWVudDogSUNoYW5uZWxDbGllbnQgfSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsb3NlZCgnTG9jYWwgYWdlbnQgaG9zdCBzZXJ2aWNlIHdhcyBkaXNwb3NlZC4nKSkpO1xuXHR9XG5cblx0Y2xpZW50KCk6IFByb21pc2U8SUNoYW5uZWxDbGllbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2VuZXJhdGlvbi5wO1xuXHR9XG5cblx0YWNxdWlyZTxUIGV4dGVuZHMgSUNoYW5uZWxDbGllbnQ+KGNsaWVudDogUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSB0aGlzLl9nZW5lcmF0aW9uO1xuXHRcdHJldHVybiBjbGllbnQudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZ2VuZXJhdGlvbiA9PT0gZ2VuZXJhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nID0geyBnZW5lcmF0aW9uLCBjbGllbnQ6IHZhbHVlIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSk7XG5cdH1cblxuXHRjb25uZWN0ZWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmc7XG5cdFx0dGhpcy5fcGVuZGluZyA9IHVuZGVmaW5lZDtcblx0XHRpZiAocGVuZGluZz8uZ2VuZXJhdGlvbiA9PT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0dm9pZCB0aGlzLl9nZW5lcmF0aW9uLmNvbXBsZXRlKHBlbmRpbmcuY2xpZW50KTtcblx0XHR9XG5cdH1cblxuXHRyZWNvbm5lY3RpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZyA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2dlbmVyYXRpb247XG5cdFx0dGhpcy5fZ2VuZXJhdGlvbiA9IHRoaXMuX2NyZWF0ZUdlbmVyYXRpb24oKTtcblx0XHR2b2lkIHByZXZpb3VzLmVycm9yKG5ldyBFcnJvcignTG9jYWwgYWdlbnQgaG9zdCBjb25uZWN0aW9uIGlzIHJlY29ubmVjdGluZy4nKSk7XG5cdH1cblxuXHRjbG9zZWQobWVzc2FnZSA9ICdMb2NhbCBhZ2VudCBob3N0IGNvbm5lY3Rpb24gY2xvc2VkLicpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9nZW5lcmF0aW9uLmlzU2V0dGxlZCkge1xuXHRcdFx0dGhpcy5fZ2VuZXJhdGlvbiA9IHRoaXMuX2NyZWF0ZUdlbmVyYXRpb24oKTtcblx0XHR9XG5cdFx0dm9pZCB0aGlzLl9nZW5lcmF0aW9uLmVycm9yKG5ldyBFcnJvcihtZXNzYWdlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVHZW5lcmF0aW9uKCk6IERlZmVycmVkUHJvbWlzZTxJQ2hhbm5lbENsaWVudD4ge1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPElDaGFubmVsQ2xpZW50PigpO1xuXHRcdGdlbmVyYXRpb24ucC50aGVuKHVuZGVmaW5lZCwgKCkgPT4geyB9KTtcblx0XHRyZXR1cm4gZ2VuZXJhdGlvbjtcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlcmVyLXNpZGUgaW1wbGVtZW50YXRpb24gb2Yge0BsaW5rIElBZ2VudEhvc3RTZXJ2aWNlfSBmb3IgdGhlIGxvY2FsXG4gKiBhZ2VudCBob3N0LiBTdGF0ZSBhbmQgcmVxdWVzdCB0cmFmZmljIHVzZSBBSFAgb3ZlciB0aGUgUHJvdG9jb2wgY2hhbm5lbDtcbiAqIG1hbmFnZW1lbnQgcmVtYWlucyBvbiB0aGUgbmFycm93IE1hbmFnZW1lbnQgSVBDIGNoYW5uZWwuXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2NhbEFnZW50SG9zdFNlcnZpY2VDbGllbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBjbGllbnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hbmFnZW1lbnRDb25uZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IExvY2FsQWdlbnRIb3N0TWFuYWdlbWVudENvbm5lY3Rpb24oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FocExvZ2dlcjogQWhwSnNvbmxMb2dnZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Byb3RvY29sQ2xpZW50OiBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29ubmVjdFN0YXJ0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGlkQWNxdWlyZUluaXRpYWxNZXNzYWdlUG9ydCA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaWRDb25uZWN0SW5pdGlhbGx5ID0gZmFsc2U7XG5cdHByaXZhdGUgX2RpZFN0YXJ0SW5pdGlhbFNlc3Npb25MaXN0ID0gZmFsc2U7XG5cdHByaXZhdGUgX2RpZENvbXBsZXRlSW5pdGlhbFNlc3Npb25MaXN0ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25BZ2VudEhvc3RFeGl0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cmVhZG9ubHkgb25BZ2VudEhvc3RFeGl0ID0gdGhpcy5fb25BZ2VudEhvc3RFeGl0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkFnZW50SG9zdFN0YXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uQWdlbnRIb3N0U3RhcnQgPSB0aGlzLl9vbkFnZW50SG9zdFN0YXJ0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uUGVuZGluZzogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPiA9IG9ic2VydmFibGVWYWx1ZSgnYXV0aGVudGljYXRpb25QZW5kaW5nJywgdHJ1ZSk7XG5cdHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uUGVuZGluZzogSU9ic2VydmFibGU8Ym9vbGVhbj4gPSB0aGlzLl9hdXRoZW50aWNhdGlvblBlbmRpbmc7XG5cdHByaXZhdGUgX2F1dGhlbnRpY2F0aW9uU2V0dGxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub29wUm9vdFN0YXRlOiBJQWdlbnRTdWJzY3JpcHRpb248Um9vdFN0YXRlPiA9IHtcblx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdHZlcmlmaWVkVmFsdWU6IHVuZGVmaW5lZCxcblx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudEluZm86IEltcGxlbWVudGF0aW9uLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9haHBMb2dnZXIgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQpXG5cdFx0XHQ/IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFocEpzb25sTG9nZ2VyLCB7XG5cdFx0XHRcdGxvZ3NIb21lOiBlbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsXG5cdFx0XHRcdGNvbm5lY3Rpb25JZDogdGhpcy5jbGllbnRJZCxcblx0XHRcdFx0dHJhbnNwb3J0OiAnbG9jYWwnLFxuXHRcdFx0fSkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdC8vIFRoZSBtYWluIHByb2Nlc3MgdGVhcnMgdGhlIGFnZW50IGhvc3QgZG93biBiZWZvcmUgcmVzdGFydGluZyBpdDsgZHJvcCB0aGVcblx0XHQvLyBjdXJyZW50IHRyYW5zcG9ydCBlYWdlcmx5IHNvIHRoZSBwcm90b2NvbCBjbGllbnQgcmVjb25uZWN0cyBpbnN0ZWFkIG9mXG5cdFx0Ly8gdHJlYXRpbmcgdGhlIHBvcnQgZ29pbmcgYXdheSBhcyBhbiB1bmV4cGVjdGVkIGZhaWx1cmUuXG5cdFx0Y29uc3Qgb25XaWxsUmVzdGFydCA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5fcHJvdG9jb2xDbGllbnQ/LnJlY29ubmVjdEZyb21DbG9zZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9wcm90b2NvbENsaWVudD8ubm90aWZ5VHJhbnNwb3J0Q2xvc2VkKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpcGNSZW5kZXJlci5vbihBZ2VudEhvc3RXaWxsUmVzdGFydElwY0NoYW5uZWwsIG9uV2lsbFJlc3RhcnQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBpcGNSZW5kZXJlci5yZW1vdmVMaXN0ZW5lcihBZ2VudEhvc3RXaWxsUmVzdGFydElwY0NoYW5uZWwsIG9uV2lsbFJlc3RhcnQpKSk7XG5cdH1cblxuXHRzdGFydEFnZW50SG9zdCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Byb3RvY29sQ2xpZW50KSB7XG5cdFx0XHRtYXJrKCdjb2RlL2FnZW50SG9zdC93aWxsU3RhcnQnKTtcblx0XHRcdHRoaXMuX3Byb3RvY29sQ2xpZW50ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LFxuXHRcdFx0XHRMT0NBTF9BR0VOVF9IT1NUX1JFU09VUkNFX0lERU5USVRZLFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9jcmVhdGVUcmFuc3BvcnQoKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR0aGlzLmNsaWVudElkLFxuXHRcdFx0XHR0aGlzLl9jbGllbnRJbmZvLFxuXHRcdFx0KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm90b2NvbENsaWVudC5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZShzdGF0ZSA9PiB0aGlzLl9oYW5kbGVDb25uZWN0aW9uU3RhdGUoc3RhdGUpKSk7XG5cdFx0fVxuXG5cdFx0dm9pZCB0aGlzLl9jb25uZWN0KCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtMT0dfUFJFRklYfSBQcm90b2NvbCBjb25uZWN0aW9uIGZhaWxlZGAsIGVycm9yKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nvbm5lY3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2Nvbm5lY3RTdGFydGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Nvbm5lY3RTdGFydGVkID0gdHJ1ZTtcblx0XHRhd2FpdCB0aGlzLl9yZXF1aXJlQ2xpZW50KCkuY29ubmVjdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVHJhbnNwb3J0KCk6IEFnZW50SG9zdElwY0NoYW5uZWxUcmFuc3BvcnQge1xuXHRcdGNvbnN0IGNsaWVudFByb21pc2UgPSB0aGlzLl9hY3F1aXJlQ2xpZW50KCk7XG5cdFx0cmV0dXJuIG5ldyBBZ2VudEhvc3RJcGNDaGFubmVsVHJhbnNwb3J0KFxuXHRcdFx0Z2V0RGVsYXllZENoYW5uZWwoY2xpZW50UHJvbWlzZS50aGVuKGNsaWVudCA9PiBjbGllbnQuZ2V0Q2hhbm5lbChBZ2VudEhvc3RJcGNDaGFubmVscy5Qcm90b2NvbCkpKSxcblx0XHRcdHRoaXMuX2FocExvZ2dlcixcblx0XHRcdEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLkxvY2FsLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9hY3F1aXJlQ2xpZW50KCk6IFByb21pc2U8TWVzc2FnZVBvcnRDbGllbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbWFuYWdlbWVudENvbm5lY3Rpb24uYWNxdWlyZSh0aGlzLl9kb0FjcXVpcmVDbGllbnQoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb0FjcXVpcmVDbGllbnQoKTogUHJvbWlzZTxNZXNzYWdlUG9ydENsaWVudD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBBY3F1aXJpbmcgTWVzc2FnZVBvcnQgdG8gYWdlbnQgaG9zdC4uLmApO1xuXHRcdHRoaXMuX2ZvcndhcmRPVGVsUG9saWN5KCk7XG5cdFx0bGV0IHBvcnQ6IE1lc3NhZ2VQb3J0O1xuXHRcdHRyeSB7XG5cdFx0XHRwb3J0ID0gYXdhaXQgYWNxdWlyZVBvcnQoJ3ZzY29kZTpjcmVhdGVBZ2VudEhvc3RNZXNzYWdlQ2hhbm5lbCcsICd2c2NvZGU6Y3JlYXRlQWdlbnRIb3N0TWVzc2FnZUNoYW5uZWxSZXN1bHQnKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgTWVzc2FnZVBvcnRBY3F1aXNpdGlvbkVycm9yICYmIGVycm9yLmZhdGFsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBOb25SZWNvbm5lY3RhYmxlVHJhbnNwb3J0RXJyb3IoZXJyb3IubWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHBvcnQuY2xvc2UoKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTG9jYWwgYWdlbnQgaG9zdCBzZXJ2aWNlIHdhcyBkaXNwb3NlZCBkdXJpbmcgY29ubmVjdGlvbi4nKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9kaWRBY3F1aXJlSW5pdGlhbE1lc3NhZ2VQb3J0KSB7XG5cdFx0XHR0aGlzLl9kaWRBY3F1aXJlSW5pdGlhbE1lc3NhZ2VQb3J0ID0gdHJ1ZTtcblx0XHRcdG1hcmsoJ2NvZGUvYWdlbnRIb3N0L2RpZEFjcXVpcmVNZXNzYWdlUG9ydCcpO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gTWVzc2FnZVBvcnQgYWNxdWlyZWQsIGNyZWF0aW5nIGNsaWVudC4uLmApO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNsaWVudCA9IHN0b3JlLmFkZChuZXcgTWVzc2FnZVBvcnRDbGllbnQocG9ydCwgdGhpcy5jbGllbnRJZCkpO1xuXHRcdFx0cmVnaXN0ZXJBZ2VudEhvc3RDbGllbnRDaGFubmVscyhcblx0XHRcdFx0Y2xpZW50LFxuXHRcdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0Qnlva01vZGVsc0VuYWJsZWRTZXR0aW5nSWQpID09PSB0cnVlLFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX2NsaWVudFN0b3JlLnZhbHVlID0gc3RvcmU7XG5cdFx0XHRyZXR1cm4gY2xpZW50O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9mb3J3YXJkT1RlbFBvbGljeSgpOiB2b2lkIHtcblx0XHRpcGNSZW5kZXJlci5zZW5kKEFnZW50SG9zdE9UZWxQb2xpY3lJcGNDaGFubmVsLCByZWFkQWdlbnRIb3N0T1RlbFBvbGljeVNldHRpbmdzKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVDb25uZWN0aW9uU3RhdGUoc3RhdGU6IEFnZW50SG9zdENsaWVudFN0YXRlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHN0YXRlID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdHRoaXMuX21hbmFnZW1lbnRDb25uZWN0aW9uLmNvbm5lY3RlZCgpO1xuXHRcdFx0aWYgKCF0aGlzLl9kaWRDb25uZWN0SW5pdGlhbGx5KSB7XG5cdFx0XHRcdHRoaXMuX2RpZENvbm5lY3RJbml0aWFsbHkgPSB0cnVlO1xuXHRcdFx0XHRtYXJrKCdjb2RlL2FnZW50SG9zdC9kaWRDb25uZWN0Jyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUHJvdG9jb2wgY29ubmVjdGlvbiBlc3RhYmxpc2hlZDsgY2xpZW50SWQ9JHt0aGlzLl9yZXF1aXJlQ2xpZW50KCkuY2xpZW50SWR9YCk7XG5cdFx0XHR0aGlzLl9vbkFnZW50SG9zdFN0YXJ0LmZpcmUoKTtcblx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcgfHwgc3RhdGUgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZSB8fCBzdGF0ZSA9PT0gQWdlbnRIb3N0Q2xpZW50U3RhdGUuQ2xvc2VkKSB7XG5cdFx0XHR0aGlzLl9jbGllbnRTdG9yZS5jbGVhcigpO1xuXHRcdFx0aWYgKHN0YXRlID09PSBBZ2VudEhvc3RDbGllbnRTdGF0ZS5SZWNvbm5lY3RpbmcpIHtcblx0XHRcdFx0dGhpcy5fbWFuYWdlbWVudENvbm5lY3Rpb24ucmVjb25uZWN0aW5nKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbi5jbG9zZWQoc3RhdGUgPT09IEFnZW50SG9zdENsaWVudFN0YXRlLkluY29tcGF0aWJsZVxuXHRcdFx0XHRcdD8gJ0xvY2FsIGFnZW50IGhvc3QgcHJvdG9jb2wgaXMgaW5jb21wYXRpYmxlLidcblx0XHRcdFx0XHQ6ICdMb2NhbCBhZ2VudCBob3N0IGNvbm5lY3Rpb24gY2xvc2VkLicpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25BZ2VudEhvc3RFeGl0LmZpcmUoMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWlyZUNsaWVudCgpOiBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCB7XG5cdFx0aWYgKCF0aGlzLl9wcm90b2NvbENsaWVudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdMb2NhbCBhZ2VudCBob3N0IGlzIG5vdCBjb25uZWN0ZWQuJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm90b2NvbENsaWVudDtcblx0fVxuXG5cdHNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyhwZW5kaW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2F1dGhlbnRpY2F0aW9uU2V0dGxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uU2V0dGxlZCA9IHRydWU7XG5cdFx0fVxuXHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uUGVuZGluZy5zZXQocGVuZGluZywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldCBpbml0aWFsaXplUmVzdWx0KCk6IElPYnNlcnZhYmxlPEluaXRpYWxpemVSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvdG9jb2xDbGllbnQ/LmluaXRpYWxpemVSZXN1bHQgPz8gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRnZXQgcm9vdFN0YXRlKCk6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvdG9jb2xDbGllbnQ/LnJvb3RTdGF0ZSA/PyB0aGlzLl9ub29wUm9vdFN0YXRlO1xuXHR9XG5cblx0Z2V0IG9uRGlkQWN0aW9uKCk6IEV2ZW50PEFjdGlvbkVudmVsb3BlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3RvY29sQ2xpZW50Py5vbkRpZEFjdGlvbiA/PyBFdmVudC5Ob25lO1xuXHR9XG5cblx0Z2V0IG9uRGlkTm90aWZpY2F0aW9uKCk6IEV2ZW50PElOb3RpZmljYXRpb24+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvdG9jb2xDbGllbnQ/Lm9uRGlkTm90aWZpY2F0aW9uID8/IEV2ZW50Lk5vbmU7XG5cdH1cblxuXHRnZXQgb25NY3BOb3RpZmljYXRpb24oKTogRXZlbnQ8SU1jcE5vdGlmaWNhdGlvbj4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm90b2NvbENsaWVudD8ub25NY3BOb3RpZmljYXRpb24gPz8gRXZlbnQuTm9uZTtcblx0fVxuXG5cdGdldFN1YnNjcmlwdGlvbjxUIGV4dGVuZHMgU3RhdGVDb21wb25lbnRzPihraW5kOiBULCByZXNvdXJjZTogVVJJLCBvd25lcjogc3RyaW5nKTogSVJlZmVyZW5jZTxJQWdlbnRTdWJzY3JpcHRpb248Q29tcG9uZW50VG9TdGF0ZVtUXT4+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWlyZUNsaWVudCgpLmdldFN1YnNjcmlwdGlvbjxDb21wb25lbnRUb1N0YXRlW1RdPihraW5kLCByZXNvdXJjZSwgb3duZXIpO1xuXHR9XG5cblx0Z2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFQgZXh0ZW5kcyBTdGF0ZUNvbXBvbmVudHM+KGtpbmQ6IFQsIHJlc291cmNlOiBVUkkpOiBJQWdlbnRTdWJzY3JpcHRpb248Q29tcG9uZW50VG9TdGF0ZVtUXT4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wcm90b2NvbENsaWVudD8uZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPENvbXBvbmVudFRvU3RhdGVbVF0+KGtpbmQsIHJlc291cmNlKTtcblx0fVxuXG5cdGdldEluZmxpZ2h0U2Vzc2lvbkNyZWF0ZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3RvY29sQ2xpZW50Py5nZXRJbmZsaWdodFNlc3Npb25DcmVhdGUocmVzb3VyY2UpO1xuXHR9XG5cblx0Z2V0QWN0aXZlU3Vic2NyaXB0aW9ucygpOiByZWFkb25seSBJQWN0aXZlU3Vic2NyaXB0aW9uSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvdG9jb2xDbGllbnQ/LmdldEFjdGl2ZVN1YnNjcmlwdGlvbnMoKSA/PyBbXTtcblx0fVxuXG5cdGRpc3BhdGNoKGNoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9yZXF1aXJlQ2xpZW50KCkuZGlzcGF0Y2goY2hhbm5lbCwgYWN0aW9uKTtcblx0fVxuXG5cdGF1dGhlbnRpY2F0ZShwYXJhbXM6IEF1dGhlbnRpY2F0ZVBhcmFtcyk6IFByb21pc2U8QXV0aGVudGljYXRlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5hdXRoZW50aWNhdGUocGFyYW1zKTtcblx0fVxuXG5cdGxpc3RTZXNzaW9ucygpOiBQcm9taXNlPElBZ2VudFNlc3Npb25NZXRhZGF0YVtdPiB7XG5cdFx0aWYgKCF0aGlzLl9kaWRTdGFydEluaXRpYWxTZXNzaW9uTGlzdCkge1xuXHRcdFx0dGhpcy5fZGlkU3RhcnRJbml0aWFsU2Vzc2lvbkxpc3QgPSB0cnVlO1xuXHRcdFx0bWFyaygnY29kZS9hZ2VudEhvc3Qvd2lsbExpc3RTZXNzaW9ucycpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVxdWlyZUNsaWVudCgpLmxpc3RTZXNzaW9ucygpLnRoZW4oc2Vzc2lvbnMgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9kaWRDb21wbGV0ZUluaXRpYWxTZXNzaW9uTGlzdCkge1xuXHRcdFx0XHR0aGlzLl9kaWRDb21wbGV0ZUluaXRpYWxTZXNzaW9uTGlzdCA9IHRydWU7XG5cdFx0XHRcdG1hcmsoJ2NvZGUvYWdlbnRIb3N0L2RpZExpc3RTZXNzaW9ucycpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNlc3Npb25zO1xuXHRcdH0pO1xuXHR9XG5cblx0Y3JlYXRlU2Vzc2lvbihjb25maWc/OiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxVUkk+IHtcblx0XHRpZiAoY29uZmlnICYmIGhhc1Nlc3Npb25FeHRlbnNpb25zKGNvbmZpZykpIHtcblx0XHRcdGlmICghY29uZmlnLnByb3ZpZGVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGNyZWF0ZSBsb2NhbCBhZ2VudCBob3N0IHNlc3Npb24gd2l0aG91dCBhIHByb3ZpZGVyLicpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGNvbmZpZy5zZXNzaW9uID8/IEFnZW50U2Vzc2lvbi51cmkoY29uZmlnLnByb3ZpZGVyLCBnZW5lcmF0ZVV1aWQoKSk7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5fZ2V0TWFuYWdlbWVudFNlcnZpY2UoKS5jcmVhdGVTZXNzaW9uV2l0aEV4dGVuc2lvbnMoeyAuLi5jb25maWcsIHNlc3Npb24gfSk7XG5cdFx0XHR0aGlzLl9yZXF1aXJlQ2xpZW50KCkudHJhY2tTZXNzaW9uQ3JlYXRlKHNlc3Npb24sIHByb21pc2UpO1xuXHRcdFx0cmV0dXJuIHByb21pc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXF1aXJlQ2xpZW50KCkuY3JlYXRlU2Vzc2lvbihjb25maWcpO1xuXHR9XG5cblx0cmVzb2x2ZVNlc3Npb25Db25maWcocGFyYW1zOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcyk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWlyZUNsaWVudCgpLnJlc29sdmVTZXNzaW9uQ29uZmlnKHBhcmFtcyk7XG5cdH1cblxuXHRzZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMocGFyYW1zOiBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMpOiBQcm9taXNlPFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1aXJlQ2xpZW50KCkuc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHBhcmFtcyk7XG5cdH1cblxuXHRjb21wbGV0aW9ucyhwYXJhbXM6IENvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxDb21wbGV0aW9uc1Jlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1aXJlQ2xpZW50KCkuY29tcGxldGlvbnMocGFyYW1zKTtcblx0fVxuXG5cdGdldENvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycygpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5nZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKTtcblx0fVxuXG5cdGRpc3Bvc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1aXJlQ2xpZW50KCkuZGlzcG9zZVNlc3Npb24oc2Vzc2lvbik7XG5cdH1cblxuXHRjcmVhdGVDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAob3B0aW9ucyAmJiBoYXNDaGF0RXh0ZW5zaW9ucyhvcHRpb25zKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldE1hbmFnZW1lbnRTZXJ2aWNlKCkuY3JlYXRlQ2hhdFdpdGhFeHRlbnNpb25zKHNlc3Npb24sIGNoYXQsIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVxdWlyZUNsaWVudCgpLmNyZWF0ZUNoYXQoc2Vzc2lvbiwgY2hhdCwgb3B0aW9ucyk7XG5cdH1cblxuXHRkaXNwb3NlQ2hhdChjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWlyZUNsaWVudCgpLmRpc3Bvc2VDaGF0KGNoYXQpO1xuXHR9XG5cblx0Y3JlYXRlVGVybWluYWwocGFyYW1zOiBDcmVhdGVUZXJtaW5hbFBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1aXJlQ2xpZW50KCkuY3JlYXRlVGVybWluYWwocGFyYW1zKTtcblx0fVxuXG5cdGRpc3Bvc2VUZXJtaW5hbCh0ZXJtaW5hbDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5kaXNwb3NlVGVybWluYWwodGVybWluYWwpO1xuXHR9XG5cblx0aW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uKHBhcmFtczogSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zKTogUHJvbWlzZTxJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWlyZUNsaWVudCgpLmludm9rZUNoYW5nZXNldE9wZXJhdGlvbihwYXJhbXMpO1xuXHR9XG5cblx0aGFuZGxlTWNwUmVxdWVzdChjaGFubmVsOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5oYW5kbGVNY3BSZXF1ZXN0KGNoYW5uZWwsIG1ldGhvZCwgcGFyYW1zKTtcblx0fVxuXG5cdHJlc291cmNlTGlzdCh1cmk6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VMaXN0UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5yZXNvdXJjZUxpc3QodXJpKTtcblx0fVxuXG5cdHJlc291cmNlUmVhZCh1cmk6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VSZWFkUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5yZXNvdXJjZVJlYWQodXJpKTtcblx0fVxuXG5cdHJlc291cmNlV3JpdGUocGFyYW1zOiBSZXNvdXJjZVdyaXRlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVdyaXRlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5yZXNvdXJjZVdyaXRlKHBhcmFtcyk7XG5cdH1cblxuXHRyZXNvdXJjZUNvcHkocGFyYW1zOiBSZXNvdXJjZUNvcHlQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlQ29weVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1aXJlQ2xpZW50KCkucmVzb3VyY2VDb3B5KHBhcmFtcyk7XG5cdH1cblxuXHRyZXNvdXJjZURlbGV0ZShwYXJhbXM6IFJlc291cmNlRGVsZXRlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZURlbGV0ZVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1aXJlQ2xpZW50KCkucmVzb3VyY2VEZWxldGUocGFyYW1zKTtcblx0fVxuXG5cdHJlc291cmNlTW92ZShwYXJhbXM6IFJlc291cmNlTW92ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VNb3ZlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5yZXNvdXJjZU1vdmUocGFyYW1zKTtcblx0fVxuXG5cdHJlc291cmNlUmVzb2x2ZShwYXJhbXM6IFJlc291cmNlUmVzb2x2ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VSZXNvbHZlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5yZXNvdXJjZVJlc29sdmUocGFyYW1zKTtcblx0fVxuXG5cdHJlc291cmNlTWtkaXIocGFyYW1zOiBSZXNvdXJjZU1rZGlyUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1rZGlyUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVDbGllbnQoKS5yZXNvdXJjZU1rZGlyKHBhcmFtcyk7XG5cdH1cblxuXHRjcmVhdGVSZXNvdXJjZVdhdGNoKHBhcmFtczogQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtcyk6IFByb21pc2U8Q3JlYXRlUmVzb3VyY2VXYXRjaFJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1aXJlQ2xpZW50KCkuY3JlYXRlUmVzb3VyY2VXYXRjaChwYXJhbXMpO1xuXHR9XG5cblx0d2F0Y2hSZXNvdXJjZShwYXJhbXM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPElSZW1vdGVXYXRjaEhhbmRsZT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1aXJlQ2xpZW50KCkud2F0Y2hSZXNvdXJjZShwYXJhbXMpO1xuXHR9XG5cblx0Z2V0TmV0d29ya0RpYWdub3N0aWNzSW5mbygpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRGlhZ25vc3RpY3NJbmZvPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldE1hbmFnZW1lbnRTZXJ2aWNlKCkuZ2V0TmV0d29ya0RpYWdub3N0aWNzSW5mbygpO1xuXHR9XG5cblx0Z2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MoKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3NbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRNYW5hZ2VtZW50U2VydmljZSgpLmdldE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzKCk7XG5cdH1cblxuXHRkaWFnbm9zdGljc0ZldGNoKHVybDogc3RyaW5nKTogUHJvbWlzZTxJQWdlbnRIb3N0TmV0d29ya0ZldGNoUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldE1hbmFnZW1lbnRTZXJ2aWNlKCkuZGlhZ25vc3RpY3NGZXRjaCh1cmwpO1xuXHR9XG5cblx0YXN5bmMgcmVzdGFydEFnZW50SG9zdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9mb3J3YXJkT1RlbFBvbGljeSgpO1xuXHRcdGlwY1JlbmRlcmVyLnNlbmQoQWdlbnRIb3N0UmVzdGFydElwY0NoYW5uZWwpO1xuXHR9XG5cblx0c3RhcnRXZWJTb2NrZXRTZXJ2ZXIoKTogUHJvbWlzZTxJQWdlbnRIb3N0U29ja2V0SW5mbz4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRNYW5hZ2VtZW50U2VydmljZSgpLnN0YXJ0V2ViU29ja2V0U2VydmVyKCk7XG5cdH1cblxuXHRnZXRJbnNwZWN0SW5mbyh0cnlFbmFibGU6IGJvb2xlYW4pOiBQcm9taXNlPElBZ2VudEhvc3RJbnNwZWN0SW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRNYW5hZ2VtZW50U2VydmljZSgpLmdldEluc3BlY3RJbmZvKHRyeUVuYWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRNYW5hZ2VtZW50U2VydmljZSgpOiBJQWdlbnRIb3N0TWFuYWdlbWVudFNlcnZpY2Uge1xuXHRcdHJldHVybiBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElBZ2VudEhvc3RNYW5hZ2VtZW50U2VydmljZT4oXG5cdFx0XHRnZXREZWxheWVkQ2hhbm5lbCh0aGlzLl9tYW5hZ2VtZW50Q29ubmVjdGlvbi5jbGllbnQoKS50aGVuKGNsaWVudCA9PiBjbGllbnQuZ2V0Q2hhbm5lbChBZ2VudEhvc3RJcGNDaGFubmVscy5NYW5hZ2VtZW50KSkpXG5cdFx0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBoYXNTZXNzaW9uRXh0ZW5zaW9ucyhjb25maWc6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcpOiBib29sZWFuIHtcblx0cmV0dXJuIGNvbmZpZy5tb2RlbCAhPT0gdW5kZWZpbmVkIHx8IGNvbmZpZy5hZ2VudCAhPT0gdW5kZWZpbmVkIHx8IGNvbmZpZy5pbXBvcnRDb252ZXJzYXRpb24gIT09IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaGFzQ2hhdEV4dGVuc2lvbnMob3B0aW9uczogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBib29sZWFuIHtcblx0cmV0dXJuIG9wdGlvbnMudGl0bGUgIT09IHVuZGVmaW5lZCB8fCBvcHRpb25zLm1vZGVsICE9PSB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUmVnaXN0ZXJzIGxvY2FsLW9ubHkgSVBDIHJldmVyc2UgY2hhbm5lbHMgZm9yIG9uZSByZW5kZXJlciBjb25uZWN0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJBZ2VudEhvc3RDbGllbnRDaGFubmVscyhcblx0Y2xpZW50OiBJQ2hhbm5lbFNlcnZlcixcblx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdGJ5b2tFbmFibGVkOiBib29sZWFuLFxuKTogdm9pZCB7XG5cdGNsaWVudC5yZWdpc3RlckNoYW5uZWwoQUdFTlRfSE9TVF9DTElFTlRfUFJPWFlfQ0hBTk5FTCwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2xpZW50UHJveHlDaGFubmVsKSk7XG5cblx0aWYgKGJ5b2tFbmFibGVkKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNsaWVudC5yZWdpc3RlckNoYW5uZWwoQUdFTlRfSE9TVF9DTElFTlRfQllPS19MTV9DSEFOTkVMLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RDbGllbnRCeW9rTG1DaGFubmVsKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBCWU9LIGxhbmd1YWdlLW1vZGVsIGJyaWRnZSBub3QgcmVnaXN0ZXJlZCBmb3IgdGhpcyB3aW5kb3cuICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJBQTZCLG1CQUFtQixv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
