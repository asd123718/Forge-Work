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
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { StringSHA1 } from "../../../../../../base/common/hash.js";
import { Disposable, DisposableResourceMap, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
import { AgentHostMcpServersConfigKey } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { IAgentHostConnectionsService } from "../../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { getEffectiveAgents } from "../../../../../../platform/agentHost/common/customAgents.js";
import { getCustomizationDisabledReason, isCustomizationEnabled, withCustomizationEnablement } from "../../../../../../platform/agentHost/common/customizationEnablement.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { CustomizationEnablementKind, CustomizationType, McpServerStatus } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ROOT_STATE_URI, StateComponents } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { InstantiationType, registerSingleton } from "../../../../../../platform/instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILoggerService, ILogService } from "../../../../../../platform/log/common/log.js";
import { localize } from "../../../../../../nls.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { isUntitledChatSession } from "../../../common/model/chatUri.js";
import { IAgentHostUntitledProvisionalSessionService } from "./agentHostUntitledProvisionalSessionService.js";
import { IAgentHostActiveClientService } from "./agentHostActiveClientService.js";
import { resolveMcpServerAuthentication, agentHostMcpServerId } from "./agentHostAuth.js";
import { IOutputService } from "../../../../../services/output/common/output.js";
const IAgentHostCustomizationService = createDecorator("agentHostCustomizationService");
class NullAgentHostCustomizationService {
  constructor() {
    this.onDidChangeCustomAgents = Event.None;
    this.onDidChangeCustomizations = Event.None;
  }
  getCustomAgents(_sessionResource) {
    return [];
  }
  getCustomizations(_sessionResource) {
    return [];
  }
  getWorkingDirectory(sessionResource) {
    return void 0;
  }
  getWorkingDirectories(_sessionResource) {
    return [];
  }
  getMcpServers(_sessionResource) {
    return [];
  }
  addMcpServer(_sessionResource, _name, _config) {
  }
  authenticateMcpServer(_sessionResource, _serverId) {
    return Promise.resolve(false);
  }
  setCustomizationEnablement(_sessionResource, _customizationId, _currentEnablement, _kind, _enabled) {
  }
  async showMcpServerLog(_sessionResource, _serverId, beforeShow) {
    await beforeShow?.();
  }
}
class AbstractAgentHostCustomizationService extends Disposable {
  constructor(_instantiationService, _logService) {
    super();
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._onDidChangeCustomAgents = this._register(new Emitter());
    this._onDidChangeCustomizations = this._register(new Emitter());
    this.onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
    this.onDidChangeCustomizations = this._onDidChangeCustomizations.event;
    /**
     * Sessions whose MCP diagnostics we mirror into per-server Output channels.
     * A session is tracked once the user reveals a server's output; from then
     * on every state change is recorded via {@link onDidChangeCustomizations},
     * so subsequent failures and recoveries land in the channel history.
     */
    this._mcpDiagnosticSessions = new ResourceSet();
    this._mcpLogRegistry = this._register(this._instantiationService.createInstance(AgentHostMcpServerLogRegistry));
    this._register(this.onDidChangeCustomizations(() => this._recordMcpDiagnostics()));
  }
  getCustomAgents(sessionResource) {
    return getEffectiveAgents(this._resolveTarget(sessionResource)?.customizations);
  }
  getCustomizations(sessionResource) {
    return this._resolveTarget(sessionResource)?.customizations ?? [];
  }
  getWorkingDirectory(sessionResource) {
    return this._resolveTarget(sessionResource)?.workingDirectory;
  }
  getWorkingDirectories(sessionResource) {
    return this._resolveTarget(sessionResource)?.workingDirectories ?? [];
  }
  getMcpServers(sessionResource) {
    const target = this._resolveTarget(sessionResource);
    if (!target) {
      return [];
    }
    return this._flattenMcpServers(target.customizations).map(({ server, plugin }) => ({
      id: this._scopedMcpServerId(sessionResource, server.id),
      name: server.name,
      enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)),
      enablement: server.enablement,
      isPluginProvided: plugin !== void 0,
      isClientBundled: plugin !== void 0 && target.isBundledMcpServer(plugin.uri, server.name),
      owningPluginClientId: plugin?.clientId,
      disabledReason: getCustomizationDisabledReason(server, plugin),
      status: server.state.kind,
      state: server.state,
      logOutputChannelId: channelIdForMcpServer(sessionResource.toString(), server.id),
      setEnabled: (enabled) => target.setCustomizationEnablement(server.id, withCustomizationEnablement(server.enablement, CustomizationEnablementKind.Session, { kind: CustomizationEnablementKind.Session, enabled })),
      start: () => target.startMcpServer(server.id),
      stop: () => target.stopMcpServer(server.id)
    }));
  }
  showMcpServerLog(sessionResource, serverId, beforeShow) {
    const target = this._resolveTarget(sessionResource);
    if (!target) {
      return Promise.resolve();
    }
    const entry = this._flattenMcpServers(target.customizations).find(({ server: server2 }) => this._scopedMcpServerId(sessionResource, server2.id) === serverId);
    if (!entry) {
      return Promise.resolve();
    }
    const { server, plugin } = entry;
    this._trackMcpDiagnostics(sessionResource, target);
    const channelId = this._mcpLogRegistry.record({ sessionResource, rawId: server.id, name: server.name, enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)), state: server.state });
    return this._mcpLogRegistry.show(channelId, beforeShow);
  }
  /**
   * Registers `sessionResource` for MCP diagnostics mirroring and records the
   * currently-observed state of each of its servers. Idempotent: registering
   * an already-tracked session simply re-records (dedup'd by state signature).
   */
  _trackMcpDiagnostics(sessionResource, target) {
    this._mcpDiagnosticSessions.add(sessionResource);
    for (const { server, plugin } of this._flattenMcpServers(target.customizations)) {
      this._mcpLogRegistry.record({ sessionResource, rawId: server.id, name: server.name, enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)), state: server.state });
    }
  }
  /** Re-records every tracked session's MCP server states (on any customizations change). */
  _recordMcpDiagnostics() {
    for (const sessionResource of this._mcpDiagnosticSessions) {
      const target = this._resolveTarget(sessionResource);
      if (!target) {
        continue;
      }
      for (const { server, plugin } of this._flattenMcpServers(target.customizations)) {
        this._mcpLogRegistry.record({ sessionResource, rawId: server.id, name: server.name, enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)), state: server.state });
      }
    }
  }
  /** Stops mirroring and disposes all MCP diagnostics channels for a session that is going away. */
  _disposeMcpDiagnostics(sessionResource) {
    this._mcpDiagnosticSessions.delete(sessionResource);
    this._mcpLogRegistry.disposeForSession(sessionResource);
  }
  addMcpServer(sessionResource, name, config) {
    const target = this._resolveTarget(sessionResource);
    const existingServers = target?.rootConfig?.values?.[AgentHostMcpServersConfigKey];
    if (!target || !target.rootConfig) {
      return;
    }
    const servers = existingServers && typeof existingServers === "object" && !Array.isArray(existingServers) ? existingServers : {};
    target.setRootConfigValue(AgentHostMcpServersConfigKey, {
      ...servers,
      [name]: config
    });
  }
  async authenticateMcpServer(sessionResource, serverId) {
    const target = this._resolveTarget(sessionResource);
    if (!target) {
      return false;
    }
    const server = this._findMcpServer(target.customizations, serverId);
    if (!server || server.state.kind !== McpServerStatus.AuthRequired) {
      return false;
    }
    const scopedServerId = agentHostMcpServerId(sessionResource.authority, server.name, server.state.resource.resource);
    try {
      return await this._instantiationService.invokeFunction(resolveMcpServerAuthentication, server.state.resource, {
        allowInteraction: true,
        logPrefix: "[AgentHost]",
        mcpServerId: scopedServerId,
        mcpServerName: server.name,
        mcpServerUrl: server.state.resource.resource,
        oauthClient: server.state.oauthClient,
        scopes: server.state.requiredScopes ?? [],
        agentHost: { scheme: sessionResource.scheme, authority: sessionResource.authority },
        authenticate: (request) => target.authenticate(request)
      });
    } catch (err) {
      this._logService.error(`[AgentHost] Failed to authenticate MCP server '${server.name}'`, err);
      return false;
    }
  }
  setCustomizationEnablement(sessionResource, customizationId, currentEnablement, kind, enabled) {
    const target = this._resolveTarget(sessionResource);
    if (!target) {
      this._logService.warn(`[AgentHostCustomizationService] Cannot change enablement for '${customizationId}' because its session is unavailable.`);
      return;
    }
    const customization = this._findCustomization(target.customizations, customizationId);
    if (!customization) {
      this._logService.warn(`[AgentHostCustomizationService] Cannot change enablement for unavailable customization '${customizationId}'.`);
      return;
    }
    const entry = kind === CustomizationEnablementKind.Workspace ? this._workspaceEnablementEntry(target, enabled) : { kind, enabled };
    if (!entry) {
      this._logService.warn(`[AgentHostCustomizationService] Cannot set workspace enablement for '${customizationId}' without a working directory.`);
      return;
    }
    target.setCustomizationEnablement(customization.id, withCustomizationEnablement(currentEnablement, kind, entry));
  }
  _workspaceEnablementEntry(target, enabled) {
    const workingDirectory = target.workingDirectories?.[0] ?? target.workingDirectory;
    return workingDirectory ? { kind: CustomizationEnablementKind.Workspace, uri: workingDirectory, enabled } : void 0;
  }
  _fireCustomAgentsChanged() {
    this._onDidChangeCustomAgents.fire();
  }
  _fireCustomizationsChanged() {
    this._onDidChangeCustomizations.fire();
  }
  _flattenMcpServers(customizations) {
    return customizations.flatMap((customization) => customization.type === CustomizationType.McpServer ? [{ server: customization }] : customization.children?.filter((child) => child.type === CustomizationType.McpServer).map((server) => ({
      server,
      plugin: customization.type === CustomizationType.Plugin ? customization : void 0
    })) ?? []);
  }
  _findMcpServer(customizations, serverId) {
    for (const { server } of this._flattenMcpServers(customizations)) {
      if (server.id === serverId || this._isScopedMcpServerIdForRawId(serverId, server.id)) {
        return server;
      }
    }
    return void 0;
  }
  _findCustomization(customizations, customizationId) {
    for (const customization of customizations) {
      if (customization.id === customizationId || this._isScopedMcpServerIdForRawId(customizationId, customization.id)) {
        return customization;
      }
      const child = (customization.type !== CustomizationType.McpServer ? customization.children : void 0)?.find((child2) => child2.id === customizationId || this._isScopedMcpServerIdForRawId(customizationId, child2.id));
      if (child) {
        return child;
      }
    }
    return void 0;
  }
  _scopedMcpServerId(sessionResource, rawId) {
    return `${sessionResource.authority}/${rawId}`;
  }
  _isScopedMcpServerIdForRawId(serverId, rawId) {
    const separator = serverId.indexOf("/");
    return separator >= 0 && serverId.slice(separator + 1) === rawId;
  }
}
let WorkbenchAgentHostCustomizationService = class extends AbstractAgentHostCustomizationService {
  constructor(_connectionsService, _provisionalSessionService, instantiationService, logService, _chatService, _activeClientService) {
    super(instantiationService, logService);
    this._connectionsService = _connectionsService;
    this._provisionalSessionService = _provisionalSessionService;
    this._chatService = _chatService;
    this._activeClientService = _activeClientService;
    this._sessionStateSubscriptions = this._register(new DisposableResourceMap());
    this._register(this._connectionsService.ambientConnection.onDidAction((envelope) => {
      switch (envelope.action.type) {
        case ActionType.SessionCustomizationsChanged:
        case ActionType.SessionCustomizationUpdated:
        case ActionType.SessionMcpServerStateChanged:
          this._fireCustomizationsChanged();
          this._fireCustomAgentsChanged();
          break;
      }
    }));
    this._register(this._provisionalSessionService.onDidChange((sessionResource) => {
      const existing = this._sessionStateSubscriptions.get(sessionResource);
      const currentBackend = this._provisionalSessionService.get(sessionResource);
      if (existing && existing.backendSession.toString() !== currentBackend?.toString()) {
        this._disposeMcpDiagnostics(sessionResource);
      }
      this._sessionStateSubscriptions.deleteAndDispose(sessionResource);
      this._fireCustomizationsChanged();
      this._fireCustomAgentsChanged();
    }));
    this._register(this._chatService.onDidDisposeSession((e) => {
      for (const sessionResource of e.sessionResources) {
        this._sessionStateSubscriptions.deleteAndDispose(sessionResource);
        this._disposeMcpDiagnostics(sessionResource);
      }
      this._fireCustomizationsChanged();
      this._fireCustomAgentsChanged();
    }));
  }
  _resolveTarget(sessionResource) {
    const target = this._resolveSessionTarget(sessionResource);
    if (!target) {
      return void 0;
    }
    const sessionState = this._readSessionState(sessionResource);
    const rootState = target.connection.rootState.value;
    const channel = target.backendSession.toString();
    return {
      customizations: sessionState?.customizations ?? [],
      workingDirectory: sessionState?.workingDirectories?.[0],
      workingDirectories: sessionState?.workingDirectories,
      rootConfig: rootState && !(rootState instanceof Error) ? rootState.config : void 0,
      isBundledMcpServer: (pluginUri, serverName) => this._activeClientService.isBundledMcpServer(pluginUri, serverName),
      authenticate: (request) => target.connection.authenticate(request),
      setCustomizationEnablement: (rawId, enablement) => {
        target.connection.dispatch(channel, {
          type: ActionType.SessionCustomizationToggled,
          id: rawId,
          enablement: [...enablement]
        });
      },
      startMcpServer: (rawId) => {
        target.connection.dispatch(channel, {
          type: ActionType.SessionMcpServerStartRequested,
          id: rawId
        });
        return Promise.resolve();
      },
      stopMcpServer: (rawId) => {
        target.connection.dispatch(channel, {
          type: ActionType.SessionMcpServerStopRequested,
          id: rawId
        });
        return Promise.resolve();
      },
      setRootConfigValue: (property, value) => {
        target.connection.dispatch(ROOT_STATE_URI, {
          type: ActionType.RootConfigChanged,
          config: { [property]: value }
        });
      }
    };
  }
  _readSessionState(sessionResource) {
    const target = this._resolveSessionTarget(sessionResource);
    const value = target ? this._ensureSessionStateSubscription(sessionResource, target)?.sub.value : void 0;
    return value && !(value instanceof Error) ? value : void 0;
  }
  _ensureSessionStateSubscription(sessionResource, target) {
    const existing = this._sessionStateSubscriptions.get(sessionResource);
    if (existing?.backendSession.toString() === target.backendSession.toString() && existing.connection === target.connection) {
      return existing;
    }
    const ref = target.connection.getSubscription(StateComponents.Session, target.backendSession, "AgentHostCustomizationService");
    const sub = ref.object;
    const listener = sub.onDidChange(() => {
      this._fireCustomizationsChanged();
      this._fireCustomAgentsChanged();
    });
    const entry = {
      connection: target.connection,
      backendSession: target.backendSession,
      sub,
      dispose: () => {
        listener.dispose();
        ref.dispose();
      }
    };
    this._sessionStateSubscriptions.set(sessionResource, entry);
    return entry;
  }
  /**
   * Resolves a chat session resource to the backend agent-session URI plus
   * the {@link IAgentConnection} (local or remote) that owns it. Returns
   * `undefined` for sessions not backed by an agent host.
   */
  _resolveSessionTarget(sessionResource) {
    const provisionalSession = this._provisionalSessionService.get(sessionResource);
    if (provisionalSession) {
      return { connection: this._connectionsService.ambientConnection, backendSession: provisionalSession };
    }
    if (isUntitledChatSession(sessionResource)) {
      return void 0;
    }
    return this._connectionsService.resolveSessionResource(sessionResource);
  }
};
WorkbenchAgentHostCustomizationService = __decorateClass([
  __decorateParam(0, IAgentHostConnectionsService),
  __decorateParam(1, IAgentHostUntitledProvisionalSessionService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IAgentHostActiveClientService)
], WorkbenchAgentHostCustomizationService);
registerSingleton(IAgentHostCustomizationService, WorkbenchAgentHostCustomizationService, InstantiationType.Delayed);
let AgentHostMcpServerLogRegistry = class extends Disposable {
  constructor(_loggerService, _outputService) {
    super();
    this._loggerService = _loggerService;
    this._outputService = _outputService;
    this._entries = /* @__PURE__ */ new Map();
    /** Channel ids grouped by owning session key, so a session teardown can dispose them all. */
    this._bySession = /* @__PURE__ */ new Map();
    this._register(toDisposable(() => {
      for (const key of [...this._bySession.keys()]) {
        this._disposeSessionKey(key);
      }
    }));
  }
  /**
   * Ensures a hidden diagnostics channel exists for the MCP server identified
   * by `(sessionResource, rawId)` and records a line whenever its state
   * changes (including the first observed state). Returns the stable channel
   * id for the service to reveal via {@link show} -- the id is internal.
   */
  record(server) {
    const sessionKey = server.sessionResource.toString();
    const channelId = channelIdForMcpServer(sessionKey, server.rawId);
    let entry = this._entries.get(channelId);
    if (!entry) {
      const logger = this._loggerService.createLogger(channelId, {
        hidden: true,
        name: localize("agentHost.mcpServer.outputChannel", "MCP: {0}", server.name)
      });
      const dispose = () => {
        logger.dispose();
        this._loggerService.deregisterLogger(channelId);
      };
      entry = { logger, dispose, lastSignature: void 0 };
      this._entries.set(channelId, entry);
      let group = this._bySession.get(sessionKey);
      if (!group) {
        group = /* @__PURE__ */ new Set();
        this._bySession.set(sessionKey, group);
      }
      group.add(channelId);
    }
    const { signature, message, isError } = describeMcpServerState(server.name, server.enabled, server.state);
    if (entry.lastSignature !== signature) {
      entry.lastSignature = signature;
      if (isError) {
        entry.logger.error(message);
      } else {
        entry.logger.info(message);
      }
    }
    return channelId;
  }
  /** Reveals the diagnostics channel `channelId`, making its hidden logger visible. */
  async show(channelId, beforeShow) {
    if (!this._entries.has(channelId)) {
      return;
    }
    this._loggerService.setVisibility(channelId, true);
    await beforeShow?.();
    await this._outputService.showChannel(channelId);
  }
  /** Disposes every channel/logger owned by `sessionResource` (session teardown). */
  disposeForSession(sessionResource) {
    this._disposeSessionKey(sessionResource.toString());
  }
  _disposeSessionKey(sessionKey) {
    const group = this._bySession.get(sessionKey);
    if (!group) {
      return;
    }
    this._bySession.delete(sessionKey);
    for (const channelId of group) {
      this._entries.get(channelId)?.dispose();
      this._entries.delete(channelId);
    }
  }
};
AgentHostMcpServerLogRegistry = __decorateClass([
  __decorateParam(0, ILoggerService),
  __decorateParam(1, IOutputService)
], AgentHostMcpServerLogRegistry);
function channelIdForMcpServer(sessionKey, rawId) {
  const sha = new StringSHA1();
  sha.update(sessionKey);
  sha.update("\0");
  sha.update(rawId);
  return `agentHostMcpServer.${sha.digest()}`;
}
function describeMcpServerState(name, enabled, state) {
  if (!enabled) {
    return { signature: "disabled", message: localize("agentHost.mcpServer.disabled", "Server '{0}' is disabled", name), isError: false };
  }
  switch (state.kind) {
    case McpServerStatus.Ready:
      return { signature: "ready", message: localize("agentHost.mcpServer.ready", "Server '{0}' is running", name), isError: false };
    case McpServerStatus.Starting:
      return { signature: "starting", message: localize("agentHost.mcpServer.starting", "Server '{0}' is starting", name), isError: false };
    case McpServerStatus.AuthRequired:
      return { signature: `authRequired:${state.resource.resource}`, message: localize("agentHost.mcpServer.authRequired", "Server '{0}' requires authentication ({1})", name, state.resource.resource), isError: false };
    case McpServerStatus.Error:
      return { signature: `error:${state.error.errorType}:${state.error.message}`, message: localize("agentHost.mcpServer.error", "Server '{0}' failed: {1}", name, state.error.message), isError: true };
    case McpServerStatus.Stopped:
    default:
      return { signature: "stopped", message: localize("agentHost.mcpServer.stopped", "Server '{0}' is stopped", name), isError: false };
  }
}
export {
  AbstractAgentHostCustomizationService,
  IAgentHostCustomizationService,
  NullAgentHostCustomizationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTdHJpbmdTSEExIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlUmVzb3VyY2VNYXAsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TWNwU2VydmVycywgQWdlbnRIb3N0TWNwU2VydmVyc0NvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IElBZ2VudENvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLCBJQWdlbnRIb3N0U2Vzc2lvblJlc29sdXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRFZmZlY3RpdmVBZ2VudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2N1c3RvbUFnZW50cy5qcyc7XG5pbXBvcnQgeyBnZXRDdXN0b21pemF0aW9uRGlzYWJsZWRSZWFzb24sIGlzQ3VzdG9taXphdGlvbkVuYWJsZWQsIHdpdGhDdXN0b21pemF0aW9uRW5hYmxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY3VzdG9taXphdGlvbkVuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgdHlwZSBJQWdlbnRTdWJzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL2FnZW50U3Vic2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLCBDdXN0b21pemF0aW9uVHlwZSwgTWNwU2VydmVyQ3VzdG9taXphdGlvbiwgTWNwU2VydmVyU3RhdHVzLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQsIHR5cGUgTWNwU2VydmVyU3RhdGUsIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBSb290Q29uZmlnU3RhdGUsIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEN1c3RvbWl6YXRpb24sIFJPT1RfU1RBVEVfVVJJLCBTdGF0ZUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSwgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNVbnRpdGxlZENoYXRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RNY3BTZXJ2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyByZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIGFnZW50SG9zdE1jcFNlcnZlcklkIH0gZnJvbSAnLi9hZ2VudEhvc3RBdXRoLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuXG5leHBvcnQgY29uc3QgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZT4oJ2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbUFnZW50czogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnM6IEV2ZW50PHZvaWQ+O1xuXG5cdGdldEN1c3RvbUFnZW50cyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdO1xuXG5cdGdldEN1c3RvbWl6YXRpb25zKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdO1xuXG5cdGdldFdvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFRoZSBmdWxsIG9yZGVyZWQgc2V0IG9mIHdvcmtpbmctZGlyZWN0b3J5IHJvb3RzIGZvciBhIHNlc3Npb24gKGluZGV4IDAgPVxuXHQgKiBwcmltYXJ5KS5cblx0ICogUmV0dXJucyBhbiBlbXB0eSBhcnJheSBmb3Igc2Vzc2lvbnMgd2l0aCBubyB3b3JraW5nIGRpcmVjdG9yeS5cblx0ICovXG5cdGdldFdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBNQ1Agc2VydmVycyBleHBvc2VkIGJ5IGFuIGFnZW50LWhvc3Qgc2Vzc2lvbi4gRWFjaCBlbnRyeVxuXHQgKiBjYXJyaWVzIHRoZSBjdXJyZW50IHN0YXR1cywgYSB7QGxpbmsgSUFnZW50SG9zdE1jcFNlcnZlci5zZXRFbmFibGVkfVxuXHQgKiBtZXRob2QgdGhhdCBkaXNwYXRjaGVzIHRoZSBwcm90b2NvbC1sZXZlbCB0b2dnbGUgb24gYmVoYWxmIG9mIHRoZVxuXHQgKiBjYWxsZXIsIGFuZCBsaWZlY3ljbGUgYWN0aW9ucy4gUGVyLXNlcnZlciBkaWFnbm9zdGljcyBhcmUgcmV2ZWFsZWQgdmlhXG5cdCAqIHtAbGluayBzaG93TWNwU2VydmVyTG9nfS4gUmV0dXJucyBhbiBlbXB0eSBhcnJheSBmb3Igc2Vzc2lvbnMgbm90XG5cdCAqIGJhY2tlZCBieSBhbiBhZ2VudCBob3N0LCBvciB0aGF0IGRvbid0IGV4cG9zZSBhbnkgTUNQIHNlcnZlcnMuXG5cdCAqL1xuXHRnZXRNY3BTZXJ2ZXJzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgSUFnZW50SG9zdE1jcFNlcnZlcltdO1xuXG5cdC8qKlxuXHQgKiBBZGRzIChvciByZXBsYWNlcykgYW4gYWdlbnQtaG9zdC1sZXZlbCBNQ1Agc2VydmVyIGluIHRoZSByb290IGNvbmZpZyBvZlxuXHQgKiB0aGUgYWdlbnQgaG9zdCBiYWNraW5nIGBzZXNzaW9uUmVzb3VyY2VgLiBUaGUgd3JpdGUgaXMgcm91dGVkIHRvIHRoZVxuXHQgKiBjb3JyZWN0IGNvbm5lY3Rpb24gKGxvY2FsIG9yIHJlbW90ZSkgZm9yIHRoYXQgc2Vzc2lvbi4gTm8tb3AgZm9yXG5cdCAqIHNlc3Npb25zIG5vdCBiYWNrZWQgYnkgYW4gYWdlbnQgaG9zdC5cblx0ICovXG5cdGFkZE1jcFNlcnZlcihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbmFtZTogc3RyaW5nLCBjb25maWc6IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKTogdm9pZDtcblxuXHQvKipcblx0ICogUnVucyBpbnRlcmFjdGl2ZSBhdXRoZW50aWNhdGlvbiBmb3IgYW4gYXV0aC1yZXF1aXJlZCBNQ1Agc2VydmVyIGluIGFuXG5cdCAqIGFnZW50LWhvc3Qgc2Vzc2lvbi4gUmV0dXJucyBmYWxzZSB3aGVuIHRoZSBzZXNzaW9uL3NlcnZlciBjYW5ub3QgYmVcblx0ICogcmVzb2x2ZWQgb3IgYXV0aGVudGljYXRpb24gZGlkIG5vdCBjb21wbGV0ZS5cblx0ICovXG5cdGF1dGhlbnRpY2F0ZU1jcFNlcnZlcihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc2VydmVySWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG5cblx0LyoqIENoYW5nZXMgb25lIHNjb3BlIHdoaWxlIHByZXNlcnZpbmcgYWxsIG90aGVyIGV4cGxpY2l0IGRlY2lzaW9ucy4gKi9cblx0c2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQoc2Vzc2lvblJlc291cmNlOiBVUkksIGN1c3RvbWl6YXRpb25JZDogc3RyaW5nLCBjdXJyZW50RW5hYmxlbWVudDogcmVhZG9ubHkgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRbXSB8IHVuZGVmaW5lZCwga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLCBlbmFibGVkOiBib29sZWFuKTogdm9pZDtcblxuXHQvKipcblx0ICogUmV2ZWFscyB0aGUgcGVyLXNlcnZlciBNQ1AgZGlhZ25vc3RpY3MgT3V0cHV0IGNoYW5uZWwgZm9yIHRoZSBzZXJ2ZXJcblx0ICogYHNlcnZlcklkYCBpbiB0aGUgYWdlbnQtaG9zdCBzZXNzaW9uIGBzZXNzaW9uUmVzb3VyY2VgLCBtYWtpbmcgaXRzIGhpZGRlblxuXHQgKiBsb2dnZXIgdmlzaWJsZSBmaXJzdC4gVGhlIGNoYW5uZWwgaXMgYW4gaW50ZXJuYWwgZGV0YWlsIG9mIHRoaXMgc2VydmljZSAtLVxuXHQgKiBjYWxsZXJzIGlkZW50aWZ5IHRoZSBzZXJ2ZXIgdGhlIHNhbWUgd2F5IHRoZXkgZG8gZm9yXG5cdCAqIHtAbGluayBhdXRoZW50aWNhdGVNY3BTZXJ2ZXJ9LiBOby1vcCB3aGVuIHRoZSBzZXNzaW9uL3NlcnZlciBjYW5ub3QgYmVcblx0ICogcmVzb2x2ZWQuXG5cdCAqL1xuXHRzaG93TWNwU2VydmVyTG9nKHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXJJZDogc3RyaW5nLCBiZWZvcmVTaG93PzogKCkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjbGFzcyBOdWxsQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zID0gRXZlbnQuTm9uZTtcblx0Z2V0Q3VzdG9tQWdlbnRzKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Z2V0Q3VzdG9taXphdGlvbnMoX3Nlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Z2V0V29ya2luZ0RpcmVjdG9yeShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRnZXRXb3JraW5nRGlyZWN0b3JpZXMoX3Nlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRnZXRNY3BTZXJ2ZXJzKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IElBZ2VudEhvc3RNY3BTZXJ2ZXJbXSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGFkZE1jcFNlcnZlcihfc2Vzc2lvblJlc291cmNlOiBVUkksIF9uYW1lOiBzdHJpbmcsIF9jb25maWc6IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKTogdm9pZCB7XG5cdFx0Ly8gbm8tb3Bcblx0fVxuXHRhdXRoZW50aWNhdGVNY3BTZXJ2ZXIoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfc2VydmVySWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHR9XG5cdHNldEN1c3RvbWl6YXRpb25FbmFibGVtZW50KF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX2N1c3RvbWl6YXRpb25JZDogc3RyaW5nLCBfY3VycmVudEVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10gfCB1bmRlZmluZWQsIF9raW5kOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIF9lbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gbm8tb3Bcblx0fVxuXHRhc3luYyBzaG93TWNwU2VydmVyTG9nKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3NlcnZlcklkOiBzdHJpbmcsIGJlZm9yZVNob3c/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYmVmb3JlU2hvdz8uKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblRhcmdldCB7XG5cdHJlYWRvbmx5IGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW107XG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSByb290Q29uZmlnPzogUm9vdENvbmZpZ1N0YXRlO1xuXHRpc0J1bmRsZWRNY3BTZXJ2ZXIocGx1Z2luVXJpOiBzdHJpbmcsIHNlcnZlck5hbWU6IHN0cmluZyk6IGJvb2xlYW47XG5cdGF1dGhlbnRpY2F0ZShyZXF1ZXN0OiB7IHJlc291cmNlOiBzdHJpbmc7IHNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdOyB0b2tlbjogc3RyaW5nIH0pOiBQcm9taXNlPHVua25vd24+O1xuXHRzZXRDdXN0b21pemF0aW9uRW5hYmxlbWVudChyYXdJZDogc3RyaW5nLCBlbmFibGVtZW50OiByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdKTogdm9pZDtcblx0c3RhcnRNY3BTZXJ2ZXIocmF3SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdHN0b3BNY3BTZXJ2ZXIocmF3SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdHNldFJvb3RDb25maWdWYWx1ZShwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQ7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BMb2dSZWdpc3RyeTogQWdlbnRIb3N0TWNwU2VydmVyTG9nUmVnaXN0cnk7XG5cdC8qKlxuXHQgKiBTZXNzaW9ucyB3aG9zZSBNQ1AgZGlhZ25vc3RpY3Mgd2UgbWlycm9yIGludG8gcGVyLXNlcnZlciBPdXRwdXQgY2hhbm5lbHMuXG5cdCAqIEEgc2Vzc2lvbiBpcyB0cmFja2VkIG9uY2UgdGhlIHVzZXIgcmV2ZWFscyBhIHNlcnZlcidzIG91dHB1dDsgZnJvbSB0aGVuXG5cdCAqIG9uIGV2ZXJ5IHN0YXRlIGNoYW5nZSBpcyByZWNvcmRlZCB2aWEge0BsaW5rIG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnN9LFxuXHQgKiBzbyBzdWJzZXF1ZW50IGZhaWx1cmVzIGFuZCByZWNvdmVyaWVzIGxhbmQgaW4gdGhlIGNoYW5uZWwgaGlzdG9yeS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21jcERpYWdub3N0aWNTZXNzaW9ucyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9tY3BMb2dSZWdpc3RyeSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdE1jcFNlcnZlckxvZ1JlZ2lzdHJ5KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zKCgpID0+IHRoaXMuX3JlY29yZE1jcERpYWdub3N0aWNzKCkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfcmVzb2x2ZVRhcmdldChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdGdldEN1c3RvbUFnZW50cyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gZ2V0RWZmZWN0aXZlQWdlbnRzKHRoaXMuX3Jlc29sdmVUYXJnZXQoc2Vzc2lvblJlc291cmNlKT8uY3VzdG9taXphdGlvbnMpO1xuXHR9XG5cblx0Z2V0Q3VzdG9taXphdGlvbnMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlVGFyZ2V0KHNlc3Npb25SZXNvdXJjZSk/LmN1c3RvbWl6YXRpb25zID8/IFtdO1xuXHR9XG5cblx0Z2V0V29ya2luZ0RpcmVjdG9yeShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVUYXJnZXQoc2Vzc2lvblJlc291cmNlKT8ud29ya2luZ0RpcmVjdG9yeTtcblx0fVxuXG5cdGdldFdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVRhcmdldChzZXNzaW9uUmVzb3VyY2UpPy53b3JraW5nRGlyZWN0b3JpZXMgPz8gW107XG5cdH1cblxuXHRnZXRNY3BTZXJ2ZXJzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgSUFnZW50SG9zdE1jcFNlcnZlcltdIHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9yZXNvbHZlVGFyZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2ZsYXR0ZW5NY3BTZXJ2ZXJzKHRhcmdldC5jdXN0b21pemF0aW9ucylcblx0XHRcdC5tYXAoKHsgc2VydmVyLCBwbHVnaW4gfSk6IElBZ2VudEhvc3RNY3BTZXJ2ZXIgPT4gKHtcblx0XHRcdFx0aWQ6IHRoaXMuX3Njb3BlZE1jcFNlcnZlcklkKHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLmlkKSxcblx0XHRcdFx0bmFtZTogc2VydmVyLm5hbWUsXG5cdFx0XHRcdGVuYWJsZWQ6IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoc2VydmVyKSAmJiAoIXBsdWdpbiB8fCBpc0N1c3RvbWl6YXRpb25FbmFibGVkKHBsdWdpbikpLFxuXHRcdFx0XHRlbmFibGVtZW50OiBzZXJ2ZXIuZW5hYmxlbWVudCxcblx0XHRcdFx0aXNQbHVnaW5Qcm92aWRlZDogcGx1Z2luICE9PSB1bmRlZmluZWQsXG5cdFx0XHRcdGlzQ2xpZW50QnVuZGxlZDogcGx1Z2luICE9PSB1bmRlZmluZWQgJiYgdGFyZ2V0LmlzQnVuZGxlZE1jcFNlcnZlcihwbHVnaW4udXJpLCBzZXJ2ZXIubmFtZSksXG5cdFx0XHRcdG93bmluZ1BsdWdpbkNsaWVudElkOiBwbHVnaW4/LmNsaWVudElkLFxuXHRcdFx0XHRkaXNhYmxlZFJlYXNvbjogZ2V0Q3VzdG9taXphdGlvbkRpc2FibGVkUmVhc29uKHNlcnZlciwgcGx1Z2luKSxcblx0XHRcdFx0c3RhdHVzOiBzZXJ2ZXIuc3RhdGUua2luZCxcblx0XHRcdFx0c3RhdGU6IHNlcnZlci5zdGF0ZSxcblx0XHRcdFx0bG9nT3V0cHV0Q2hhbm5lbElkOiBjaGFubmVsSWRGb3JNY3BTZXJ2ZXIoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHNlcnZlci5pZCksXG5cdFx0XHRcdHNldEVuYWJsZWQ6IChlbmFibGVkOiBib29sZWFuKSA9PiB0YXJnZXQuc2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQoc2VydmVyLmlkLCB3aXRoQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQoc2VydmVyLmVuYWJsZW1lbnQsIEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCB7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5TZXNzaW9uLCBlbmFibGVkIH0pKSxcblx0XHRcdFx0c3RhcnQ6ICgpID0+IHRhcmdldC5zdGFydE1jcFNlcnZlcihzZXJ2ZXIuaWQpLFxuXHRcdFx0XHRzdG9wOiAoKSA9PiB0YXJnZXQuc3RvcE1jcFNlcnZlcihzZXJ2ZXIuaWQpLFxuXHRcdFx0fSkpO1xuXHR9XG5cblx0c2hvd01jcFNlcnZlckxvZyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc2VydmVySWQ6IHN0cmluZywgYmVmb3JlU2hvdz86ICgpID0+IFByb21pc2U8dm9pZD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9yZXNvbHZlVGFyZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9mbGF0dGVuTWNwU2VydmVycyh0YXJnZXQuY3VzdG9taXphdGlvbnMpLmZpbmQoKHsgc2VydmVyIH0pID0+IHRoaXMuX3Njb3BlZE1jcFNlcnZlcklkKHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLmlkKSA9PT0gc2VydmVySWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBzZXJ2ZXIsIHBsdWdpbiB9ID0gZW50cnk7XG5cdFx0Ly8gRW5zdXJlIHRoZSBzZXNzaW9uIGlzIHRyYWNrZWQgYW5kIGl0cyBjaGFubmVscyBleGlzdCwgdGhlbiByZXZlYWwuXG5cdFx0dGhpcy5fdHJhY2tNY3BEaWFnbm9zdGljcyhzZXNzaW9uUmVzb3VyY2UsIHRhcmdldCk7XG5cdFx0Y29uc3QgY2hhbm5lbElkID0gdGhpcy5fbWNwTG9nUmVnaXN0cnkucmVjb3JkKHsgc2Vzc2lvblJlc291cmNlLCByYXdJZDogc2VydmVyLmlkLCBuYW1lOiBzZXJ2ZXIubmFtZSwgZW5hYmxlZDogaXNDdXN0b21pemF0aW9uRW5hYmxlZChzZXJ2ZXIpICYmICghcGx1Z2luIHx8IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQocGx1Z2luKSksIHN0YXRlOiBzZXJ2ZXIuc3RhdGUgfSk7XG5cdFx0cmV0dXJuIHRoaXMuX21jcExvZ1JlZ2lzdHJ5LnNob3coY2hhbm5lbElkLCBiZWZvcmVTaG93KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYHNlc3Npb25SZXNvdXJjZWAgZm9yIE1DUCBkaWFnbm9zdGljcyBtaXJyb3JpbmcgYW5kIHJlY29yZHMgdGhlXG5cdCAqIGN1cnJlbnRseS1vYnNlcnZlZCBzdGF0ZSBvZiBlYWNoIG9mIGl0cyBzZXJ2ZXJzLiBJZGVtcG90ZW50OiByZWdpc3RlcmluZ1xuXHQgKiBhbiBhbHJlYWR5LXRyYWNrZWQgc2Vzc2lvbiBzaW1wbHkgcmUtcmVjb3JkcyAoZGVkdXAnZCBieSBzdGF0ZSBzaWduYXR1cmUpLlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJhY2tNY3BEaWFnbm9zdGljcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdGFyZ2V0OiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblRhcmdldCk6IHZvaWQge1xuXHRcdHRoaXMuX21jcERpYWdub3N0aWNTZXNzaW9ucy5hZGQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRmb3IgKGNvbnN0IHsgc2VydmVyLCBwbHVnaW4gfSBvZiB0aGlzLl9mbGF0dGVuTWNwU2VydmVycyh0YXJnZXQuY3VzdG9taXphdGlvbnMpKSB7XG5cdFx0XHR0aGlzLl9tY3BMb2dSZWdpc3RyeS5yZWNvcmQoeyBzZXNzaW9uUmVzb3VyY2UsIHJhd0lkOiBzZXJ2ZXIuaWQsIG5hbWU6IHNlcnZlci5uYW1lLCBlbmFibGVkOiBpc0N1c3RvbWl6YXRpb25FbmFibGVkKHNlcnZlcikgJiYgKCFwbHVnaW4gfHwgaXNDdXN0b21pemF0aW9uRW5hYmxlZChwbHVnaW4pKSwgc3RhdGU6IHNlcnZlci5zdGF0ZSB9KTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmUtcmVjb3JkcyBldmVyeSB0cmFja2VkIHNlc3Npb24ncyBNQ1Agc2VydmVyIHN0YXRlcyAob24gYW55IGN1c3RvbWl6YXRpb25zIGNoYW5nZSkuICovXG5cdHByaXZhdGUgX3JlY29yZE1jcERpYWdub3N0aWNzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvblJlc291cmNlIG9mIHRoaXMuX21jcERpYWdub3N0aWNTZXNzaW9ucykge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fcmVzb2x2ZVRhcmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHsgc2VydmVyLCBwbHVnaW4gfSBvZiB0aGlzLl9mbGF0dGVuTWNwU2VydmVycyh0YXJnZXQuY3VzdG9taXphdGlvbnMpKSB7XG5cdFx0XHRcdHRoaXMuX21jcExvZ1JlZ2lzdHJ5LnJlY29yZCh7IHNlc3Npb25SZXNvdXJjZSwgcmF3SWQ6IHNlcnZlci5pZCwgbmFtZTogc2VydmVyLm5hbWUsIGVuYWJsZWQ6IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoc2VydmVyKSAmJiAoIXBsdWdpbiB8fCBpc0N1c3RvbWl6YXRpb25FbmFibGVkKHBsdWdpbikpLCBzdGF0ZTogc2VydmVyLnN0YXRlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBTdG9wcyBtaXJyb3JpbmcgYW5kIGRpc3Bvc2VzIGFsbCBNQ1AgZGlhZ25vc3RpY3MgY2hhbm5lbHMgZm9yIGEgc2Vzc2lvbiB0aGF0IGlzIGdvaW5nIGF3YXkuICovXG5cdHByb3RlY3RlZCBfZGlzcG9zZU1jcERpYWdub3N0aWNzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fbWNwRGlhZ25vc3RpY1Nlc3Npb25zLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX21jcExvZ1JlZ2lzdHJ5LmRpc3Bvc2VGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRhZGRNY3BTZXJ2ZXIoc2Vzc2lvblJlc291cmNlOiBVUkksIG5hbWU6IHN0cmluZywgY29uZmlnOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVUYXJnZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBleGlzdGluZ1NlcnZlcnMgPSB0YXJnZXQ/LnJvb3RDb25maWc/LnZhbHVlcz8uW0FnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXldO1xuXHRcdGlmICghdGFyZ2V0IHx8ICF0YXJnZXQucm9vdENvbmZpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXJzOiBBZ2VudEhvc3RNY3BTZXJ2ZXJzID0gZXhpc3RpbmdTZXJ2ZXJzICYmIHR5cGVvZiBleGlzdGluZ1NlcnZlcnMgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KGV4aXN0aW5nU2VydmVycylcblx0XHRcdD8gZXhpc3RpbmdTZXJ2ZXJzIGFzIEFnZW50SG9zdE1jcFNlcnZlcnNcblx0XHRcdDoge307XG5cdFx0dGFyZ2V0LnNldFJvb3RDb25maWdWYWx1ZShBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5LCB7XG5cdFx0XHQuLi5zZXJ2ZXJzLFxuXHRcdFx0W25hbWVdOiBjb25maWcsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBhdXRoZW50aWNhdGVNY3BTZXJ2ZXIoc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlcklkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9yZXNvbHZlVGFyZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5fZmluZE1jcFNlcnZlcih0YXJnZXQuY3VzdG9taXphdGlvbnMsIHNlcnZlcklkKTtcblx0XHRpZiAoIXNlcnZlciB8fCBzZXJ2ZXIuc3RhdGUua2luZCAhPT0gTWNwU2VydmVyU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzY29wZWRTZXJ2ZXJJZCA9IGFnZW50SG9zdE1jcFNlcnZlcklkKHNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHksIHNlcnZlci5uYW1lLCBzZXJ2ZXIuc3RhdGUucmVzb3VyY2UucmVzb3VyY2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uLCBzZXJ2ZXIuc3RhdGUucmVzb3VyY2UsIHtcblx0XHRcdFx0YWxsb3dJbnRlcmFjdGlvbjogdHJ1ZSxcblx0XHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0XHRtY3BTZXJ2ZXJJZDogc2NvcGVkU2VydmVySWQsXG5cdFx0XHRcdG1jcFNlcnZlck5hbWU6IHNlcnZlci5uYW1lLFxuXHRcdFx0XHRtY3BTZXJ2ZXJVcmw6IHNlcnZlci5zdGF0ZS5yZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRcdFx0b2F1dGhDbGllbnQ6IHNlcnZlci5zdGF0ZS5vYXV0aENsaWVudCxcblx0XHRcdFx0c2NvcGVzOiBzZXJ2ZXIuc3RhdGUucmVxdWlyZWRTY29wZXMgPz8gW10sXG5cdFx0XHRcdGFnZW50SG9zdDogeyBzY2hlbWU6IHNlc3Npb25SZXNvdXJjZS5zY2hlbWUsIGF1dGhvcml0eTogc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSB9LFxuXHRcdFx0XHRhdXRoZW50aWNhdGU6IHJlcXVlc3QgPT4gdGFyZ2V0LmF1dGhlbnRpY2F0ZShyZXF1ZXN0KSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50SG9zdF0gRmFpbGVkIHRvIGF1dGhlbnRpY2F0ZSBNQ1Agc2VydmVyICcke3NlcnZlci5uYW1lfSdgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHNldEN1c3RvbWl6YXRpb25FbmFibGVtZW50KHNlc3Npb25SZXNvdXJjZTogVVJJLCBjdXN0b21pemF0aW9uSWQ6IHN0cmluZywgY3VycmVudEVuYWJsZW1lbnQ6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10gfCB1bmRlZmluZWQsIGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZCwgZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVUYXJnZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2VdIENhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBmb3IgJyR7Y3VzdG9taXphdGlvbklkfScgYmVjYXVzZSBpdHMgc2Vzc2lvbiBpcyB1bmF2YWlsYWJsZS5gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbiA9IHRoaXMuX2ZpbmRDdXN0b21pemF0aW9uKHRhcmdldC5jdXN0b21pemF0aW9ucywgY3VzdG9taXphdGlvbklkKTtcblx0XHRpZiAoIWN1c3RvbWl6YXRpb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlXSBDYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgZm9yIHVuYXZhaWxhYmxlIGN1c3RvbWl6YXRpb24gJyR7Y3VzdG9taXphdGlvbklkfScuYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJ5ID0ga2luZCA9PT0gQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZVxuXHRcdFx0PyB0aGlzLl93b3Jrc3BhY2VFbmFibGVtZW50RW50cnkodGFyZ2V0LCBlbmFibGVkKVxuXHRcdFx0OiB7IGtpbmQsIGVuYWJsZWQgfTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZV0gQ2Fubm90IHNldCB3b3Jrc3BhY2UgZW5hYmxlbWVudCBmb3IgJyR7Y3VzdG9taXphdGlvbklkfScgd2l0aG91dCBhIHdvcmtpbmcgZGlyZWN0b3J5LmApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0YXJnZXQuc2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQoY3VzdG9taXphdGlvbi5pZCwgd2l0aEN1c3RvbWl6YXRpb25FbmFibGVtZW50KGN1cnJlbnRFbmFibGVtZW50LCBraW5kLCBlbnRyeSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd29ya3NwYWNlRW5hYmxlbWVudEVudHJ5KHRhcmdldDogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25UYXJnZXQsIGVuYWJsZWQ6IGJvb2xlYW4pOiBDdXN0b21pemF0aW9uRW5hYmxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHRhcmdldC53b3JraW5nRGlyZWN0b3JpZXM/LlswXSA/PyB0YXJnZXQud29ya2luZ0RpcmVjdG9yeTtcblx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yeSA/IHsga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLldvcmtzcGFjZSwgdXJpOiB3b3JraW5nRGlyZWN0b3J5LCBlbmFibGVkIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2ZpcmVDdXN0b21BZ2VudHNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzLmZpcmUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZmlyZUN1c3RvbWl6YXRpb25zQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZsYXR0ZW5NY3BTZXJ2ZXJzKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiByZWFkb25seSB7IHJlYWRvbmx5IHNlcnZlcjogTWNwU2VydmVyQ3VzdG9taXphdGlvbjsgcmVhZG9ubHkgcGx1Z2luPzogUGx1Z2luQ3VzdG9taXphdGlvbiB9W10ge1xuXHRcdHJldHVybiBjdXN0b21pemF0aW9ucy5mbGF0TWFwKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXJcblx0XHRcdD8gW3sgc2VydmVyOiBjdXN0b21pemF0aW9uIH1dXG5cdFx0XHQ6IGN1c3RvbWl6YXRpb24uY2hpbGRyZW4/LmZpbHRlcihjaGlsZCA9PiBjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpLm1hcChzZXJ2ZXIgPT4gKHtcblx0XHRcdFx0c2VydmVyLFxuXHRcdFx0XHRwbHVnaW46IGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luID8gY3VzdG9taXphdGlvbiA6IHVuZGVmaW5lZCxcblx0XHRcdH0pKSA/PyBbXSk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTWNwU2VydmVyKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10sIHNlcnZlcklkOiBzdHJpbmcpOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHsgc2VydmVyIH0gb2YgdGhpcy5fZmxhdHRlbk1jcFNlcnZlcnMoY3VzdG9taXphdGlvbnMpKSB7XG5cdFx0XHRpZiAoc2VydmVyLmlkID09PSBzZXJ2ZXJJZCB8fCB0aGlzLl9pc1Njb3BlZE1jcFNlcnZlcklkRm9yUmF3SWQoc2VydmVySWQsIHNlcnZlci5pZCkpIHtcblx0XHRcdFx0cmV0dXJuIHNlcnZlcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRDdXN0b21pemF0aW9uKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10sIGN1c3RvbWl6YXRpb25JZDogc3RyaW5nKTogeyByZWFkb25seSBpZDogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiBjdXN0b21pemF0aW9ucykge1xuXHRcdFx0aWYgKGN1c3RvbWl6YXRpb24uaWQgPT09IGN1c3RvbWl6YXRpb25JZCB8fCB0aGlzLl9pc1Njb3BlZE1jcFNlcnZlcklkRm9yUmF3SWQoY3VzdG9taXphdGlvbklkLCBjdXN0b21pemF0aW9uLmlkKSkge1xuXHRcdFx0XHRyZXR1cm4gY3VzdG9taXphdGlvbjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoaWxkID0gKGN1c3RvbWl6YXRpb24udHlwZSAhPT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyID8gY3VzdG9taXphdGlvbi5jaGlsZHJlbiA6IHVuZGVmaW5lZCk/LmZpbmQoY2hpbGQgPT4gY2hpbGQuaWQgPT09IGN1c3RvbWl6YXRpb25JZCB8fCB0aGlzLl9pc1Njb3BlZE1jcFNlcnZlcklkRm9yUmF3SWQoY3VzdG9taXphdGlvbklkLCBjaGlsZC5pZCkpO1xuXHRcdFx0aWYgKGNoaWxkKSB7XG5cdFx0XHRcdHJldHVybiBjaGlsZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBfc2NvcGVkTWNwU2VydmVySWQoc2Vzc2lvblJlc291cmNlOiBVUkksIHJhd0lkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5fS8ke3Jhd0lkfWA7XG5cdH1cblxuXHRwcml2YXRlIF9pc1Njb3BlZE1jcFNlcnZlcklkRm9yUmF3SWQoc2VydmVySWQ6IHN0cmluZywgcmF3SWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlcGFyYXRvciA9IHNlcnZlcklkLmluZGV4T2YoJy8nKTtcblx0XHRyZXR1cm4gc2VwYXJhdG9yID49IDAgJiYgc2VydmVySWQuc2xpY2Uoc2VwYXJhdG9yICsgMSkgPT09IHJhd0lkO1xuXHR9XG59XG5cbmNsYXNzIFdvcmtiZW5jaEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzb3VyY2VNYXA8SURpc3Bvc2FibGUgJiB7IHJlYWRvbmx5IGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb247IHJlYWRvbmx5IGJhY2tlbmRTZXNzaW9uOiBVUkk7IHJlYWRvbmx5IHN1YjogSUFnZW50U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4gfT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbnNTZXJ2aWNlOiBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2U6IElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNsaWVudFNlcnZpY2U6IElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpbnN0YW50aWF0aW9uU2VydmljZSwgbG9nU2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25uZWN0aW9uc1NlcnZpY2UuYW1iaWVudENvbm5lY3Rpb24ub25EaWRBY3Rpb24oZW52ZWxvcGUgPT4ge1xuXHRcdFx0c3dpdGNoIChlbnZlbG9wZS5hY3Rpb24udHlwZSkge1xuXHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZDpcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZDpcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fZmlyZUN1c3RvbWl6YXRpb25zQ2hhbmdlZCgpO1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmVDdXN0b21BZ2VudHNDaGFuZ2VkKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2Uub25EaWRDaGFuZ2Uoc2Vzc2lvblJlc291cmNlID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRCYWNrZW5kID0gdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChleGlzdGluZyAmJiBleGlzdGluZy5iYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpICE9PSBjdXJyZW50QmFja2VuZD8udG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aGlzLl9kaXNwb3NlTWNwRGlhZ25vc3RpY3Moc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fZmlyZUN1c3RvbWl6YXRpb25zQ2hhbmdlZCgpO1xuXHRcdFx0dGhpcy5fZmlyZUN1c3RvbUFnZW50c0NoYW5nZWQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFNlcnZpY2Uub25EaWREaXNwb3NlU2Vzc2lvbihlID0+IHtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvblJlc291cmNlIG9mIGUuc2Vzc2lvblJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZU1jcERpYWdub3N0aWNzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2VkKCk7XG5cdFx0XHR0aGlzLl9maXJlQ3VzdG9tQWdlbnRzQ2hhbmdlZCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVzb2x2ZVRhcmdldChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblRhcmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9yZWFkU2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgcm9vdFN0YXRlID0gdGFyZ2V0LmNvbm5lY3Rpb24ucm9vdFN0YXRlLnZhbHVlO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0YXJnZXQuYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3VzdG9taXphdGlvbnM6IHNlc3Npb25TdGF0ZT8uY3VzdG9taXphdGlvbnMgPz8gW10sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBzZXNzaW9uU3RhdGU/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzZXNzaW9uU3RhdGU/LndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdHJvb3RDb25maWc6IHJvb3RTdGF0ZSAmJiAhKHJvb3RTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSA/IHJvb3RTdGF0ZS5jb25maWcgOiB1bmRlZmluZWQsXG5cdFx0XHRpc0J1bmRsZWRNY3BTZXJ2ZXI6IChwbHVnaW5VcmksIHNlcnZlck5hbWUpID0+IHRoaXMuX2FjdGl2ZUNsaWVudFNlcnZpY2UuaXNCdW5kbGVkTWNwU2VydmVyKHBsdWdpblVyaSwgc2VydmVyTmFtZSksXG5cdFx0XHRhdXRoZW50aWNhdGU6IHJlcXVlc3QgPT4gdGFyZ2V0LmNvbm5lY3Rpb24uYXV0aGVudGljYXRlKHJlcXVlc3QpLFxuXHRcdFx0c2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQ6IChyYXdJZCwgZW5hYmxlbWVudCkgPT4ge1xuXHRcdFx0XHR0YXJnZXQuY29ubmVjdGlvbi5kaXNwYXRjaChjaGFubmVsLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblRvZ2dsZWQsXG5cdFx0XHRcdFx0aWQ6IHJhd0lkLFxuXHRcdFx0XHRcdGVuYWJsZW1lbnQ6IFsuLi5lbmFibGVtZW50XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0c3RhcnRNY3BTZXJ2ZXI6IHJhd0lkID0+IHtcblx0XHRcdFx0dGFyZ2V0LmNvbm5lY3Rpb24uZGlzcGF0Y2goY2hhbm5lbCwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXJ0UmVxdWVzdGVkLFxuXHRcdFx0XHRcdGlkOiByYXdJZCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0sXG5cdFx0XHRzdG9wTWNwU2VydmVyOiByYXdJZCA9PiB7XG5cdFx0XHRcdHRhcmdldC5jb25uZWN0aW9uLmRpc3BhdGNoKGNoYW5uZWwsIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdG9wUmVxdWVzdGVkLFxuXHRcdFx0XHRcdGlkOiByYXdJZCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0sXG5cdFx0XHRzZXRSb290Q29uZmlnVmFsdWU6IChwcm9wZXJ0eSwgdmFsdWUpID0+IHtcblx0XHRcdFx0dGFyZ2V0LmNvbm5lY3Rpb24uZGlzcGF0Y2goUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRcdGNvbmZpZzogeyBbcHJvcGVydHldOiB2YWx1ZSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZFNlc3Npb25TdGF0ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fcmVzb2x2ZVNlc3Npb25UYXJnZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCB2YWx1ZSA9IHRhcmdldCA/IHRoaXMuX2Vuc3VyZVNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbihzZXNzaW9uUmVzb3VyY2UsIHRhcmdldCk/LnN1Yi52YWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdmFsdWUgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSA/IHZhbHVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0YXJnZXQ6IElBZ2VudEhvc3RTZXNzaW9uUmVzb2x1dGlvbik6IChJRGlzcG9zYWJsZSAmIHsgcmVhZG9ubHkgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbjsgcmVhZG9ubHkgYmFja2VuZFNlc3Npb246IFVSSTsgcmVhZG9ubHkgc3ViOiBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPiB9KSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZz8uYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSA9PT0gdGFyZ2V0LmJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCkgJiYgZXhpc3RpbmcuY29ubmVjdGlvbiA9PT0gdGFyZ2V0LmNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCByZWYgPSB0YXJnZXQuY29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHRhcmdldC5iYWNrZW5kU2Vzc2lvbiwgJ0FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlJyk7XG5cdFx0Y29uc3Qgc3ViID0gcmVmLm9iamVjdDtcblx0XHRjb25zdCBsaXN0ZW5lciA9IHN1Yi5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2VkKCk7XG5cdFx0XHR0aGlzLl9maXJlQ3VzdG9tQWdlbnRzQ2hhbmdlZCgpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGVudHJ5ID0ge1xuXHRcdFx0Y29ubmVjdGlvbjogdGFyZ2V0LmNvbm5lY3Rpb24sXG5cdFx0XHRiYWNrZW5kU2Vzc2lvbjogdGFyZ2V0LmJhY2tlbmRTZXNzaW9uLFxuXHRcdFx0c3ViLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5zZXQoc2Vzc2lvblJlc291cmNlLCBlbnRyeSk7XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGEgY2hhdCBzZXNzaW9uIHJlc291cmNlIHRvIHRoZSBiYWNrZW5kIGFnZW50LXNlc3Npb24gVVJJIHBsdXNcblx0ICogdGhlIHtAbGluayBJQWdlbnRDb25uZWN0aW9ufSAobG9jYWwgb3IgcmVtb3RlKSB0aGF0IG93bnMgaXQuIFJldHVybnNcblx0ICogYHVuZGVmaW5lZGAgZm9yIHNlc3Npb25zIG5vdCBiYWNrZWQgYnkgYW4gYWdlbnQgaG9zdC5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVTZXNzaW9uVGFyZ2V0KHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUFnZW50SG9zdFNlc3Npb25SZXNvbHV0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aXNpb25hbFNlc3Npb24gPSB0aGlzLl9wcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChwcm92aXNpb25hbFNlc3Npb24pIHtcblx0XHRcdC8vIFByb3Zpc2lvbmFsICh1bnRpdGxlZCkgc2Vzc2lvbnMgYXJlIGFsd2F5cyBiYWNrZWQgYnkgdGhlIGFtYmllbnQgaG9zdC5cblx0XHRcdHJldHVybiB7IGNvbm5lY3Rpb246IHRoaXMuX2Nvbm5lY3Rpb25zU2VydmljZS5hbWJpZW50Q29ubmVjdGlvbiwgYmFja2VuZFNlc3Npb246IHByb3Zpc2lvbmFsU2Vzc2lvbiB9O1xuXHRcdH1cblxuXHRcdGlmIChpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY29ubmVjdGlvbnNTZXJ2aWNlLnJlc29sdmVTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIFdvcmtiZW5jaEFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuLyoqXG4gKiBPd25zIG9uZSBoaWRkZW4gT3V0cHV0IGNoYW5uZWwgcGVyIChhZ2VudC1ob3N0IHNlc3Npb24sIE1DUCBzZXJ2ZXIpIHBhaXIuXG4gKiB7QGxpbmsgcmVjb3JkfSBhcHBlbmRzIGEgbGluZSB3aGVuZXZlciBhIHNlcnZlcidzIG9ic2VydmFibGUgc3RhdGUgY2hhbmdlc1xuICogKGl0cyBsaWZlY3ljbGUga2luZCwgZXJyb3IsIG9yIGVuYWJsZW1lbnQpIHNvIG9wZW5pbmcgdGhlIGNoYW5uZWwgc2hvd3MgdGhlXG4gKiBzZXJ2ZXIncyBoaXN0b3J5IGluY2x1ZGluZyBhbnkgZmFpbHVyZSBkZXRhaWwuIHtAbGluayBzaG93fSByZXZlYWxzIHRoZVxuICogKG90aGVyd2lzZSBoaWRkZW4pIGNoYW5uZWwsIGFuZCB7QGxpbmsgZGlzcG9zZUZvclNlc3Npb259IHRlYXJzIGRvd24gZXZlcnlcbiAqIGNoYW5uZWwgYmVsb25naW5nIHRvIGEgc2Vzc2lvbiB0aGF0IGlzIGdvaW5nIGF3YXkuXG4gKi9cbmNsYXNzIEFnZW50SG9zdE1jcFNlcnZlckxvZ1JlZ2lzdHJ5IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZW50cmllcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlYWRvbmx5IGxvZ2dlcjogSUxvZ2dlcjsgcmVhZG9ubHkgZGlzcG9zZTogKCkgPT4gdm9pZDsgbGFzdFNpZ25hdHVyZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0+KCk7XG5cdC8qKiBDaGFubmVsIGlkcyBncm91cGVkIGJ5IG93bmluZyBzZXNzaW9uIGtleSwgc28gYSBzZXNzaW9uIHRlYXJkb3duIGNhbiBkaXNwb3NlIHRoZW0gYWxsLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ieVNlc3Npb24gPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dnZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJT3V0cHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgWy4uLnRoaXMuX2J5U2Vzc2lvbi5rZXlzKCldKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VTZXNzaW9uS2V5KGtleSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuc3VyZXMgYSBoaWRkZW4gZGlhZ25vc3RpY3MgY2hhbm5lbCBleGlzdHMgZm9yIHRoZSBNQ1Agc2VydmVyIGlkZW50aWZpZWRcblx0ICogYnkgYChzZXNzaW9uUmVzb3VyY2UsIHJhd0lkKWAgYW5kIHJlY29yZHMgYSBsaW5lIHdoZW5ldmVyIGl0cyBzdGF0ZVxuXHQgKiBjaGFuZ2VzIChpbmNsdWRpbmcgdGhlIGZpcnN0IG9ic2VydmVkIHN0YXRlKS4gUmV0dXJucyB0aGUgc3RhYmxlIGNoYW5uZWxcblx0ICogaWQgZm9yIHRoZSBzZXJ2aWNlIHRvIHJldmVhbCB2aWEge0BsaW5rIHNob3d9IC0tIHRoZSBpZCBpcyBpbnRlcm5hbC5cblx0ICovXG5cdHJlY29yZChzZXJ2ZXI6IHsgcmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7IHJlYWRvbmx5IHJhd0lkOiBzdHJpbmc7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjsgcmVhZG9ubHkgc3RhdGU6IE1jcFNlcnZlclN0YXRlIH0pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXJ2ZXIuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhbm5lbElkID0gY2hhbm5lbElkRm9yTWNwU2VydmVyKHNlc3Npb25LZXksIHNlcnZlci5yYXdJZCk7XG5cdFx0bGV0IGVudHJ5ID0gdGhpcy5fZW50cmllcy5nZXQoY2hhbm5lbElkKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRjb25zdCBsb2dnZXIgPSB0aGlzLl9sb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcihjaGFubmVsSWQsIHtcblx0XHRcdFx0aGlkZGVuOiB0cnVlLFxuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lm1jcFNlcnZlci5vdXRwdXRDaGFubmVsJywgXCJNQ1A6IHswfVwiLCBzZXJ2ZXIubmFtZSksXG5cdFx0XHR9KTtcblx0XHRcdC8vIE1pcnJvciB0aGUgd29ya2JlbmNoIE1DUCBzZXJ2ZXIgcGF0dGVybjogYSBsb2dnZXIgZGlzcG9zZWQgYnV0IG5vdFxuXHRcdFx0Ly8gZGVyZWdpc3RlcmVkIGlzIHJldXNlZCBhcyBhIG5vLW9wIGluc3RhbmNlLCBzbyBkZXJlZ2lzdGVyIG9uIGRpc3Bvc2UuXG5cdFx0XHRjb25zdCBkaXNwb3NlID0gKCkgPT4ge1xuXHRcdFx0XHRsb2dnZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9sb2dnZXJTZXJ2aWNlLmRlcmVnaXN0ZXJMb2dnZXIoY2hhbm5lbElkKTtcblx0XHRcdH07XG5cdFx0XHRlbnRyeSA9IHsgbG9nZ2VyLCBkaXNwb3NlLCBsYXN0U2lnbmF0dXJlOiB1bmRlZmluZWQgfTtcblx0XHRcdHRoaXMuX2VudHJpZXMuc2V0KGNoYW5uZWxJZCwgZW50cnkpO1xuXHRcdFx0bGV0IGdyb3VwID0gdGhpcy5fYnlTZXNzaW9uLmdldChzZXNzaW9uS2V5KTtcblx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0Z3JvdXAgPSBuZXcgU2V0KCk7XG5cdFx0XHRcdHRoaXMuX2J5U2Vzc2lvbi5zZXQoc2Vzc2lvbktleSwgZ3JvdXApO1xuXHRcdFx0fVxuXHRcdFx0Z3JvdXAuYWRkKGNoYW5uZWxJZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBzaWduYXR1cmUsIG1lc3NhZ2UsIGlzRXJyb3IgfSA9IGRlc2NyaWJlTWNwU2VydmVyU3RhdGUoc2VydmVyLm5hbWUsIHNlcnZlci5lbmFibGVkLCBzZXJ2ZXIuc3RhdGUpO1xuXHRcdGlmIChlbnRyeS5sYXN0U2lnbmF0dXJlICE9PSBzaWduYXR1cmUpIHtcblx0XHRcdGVudHJ5Lmxhc3RTaWduYXR1cmUgPSBzaWduYXR1cmU7XG5cdFx0XHRpZiAoaXNFcnJvcikge1xuXHRcdFx0XHRlbnRyeS5sb2dnZXIuZXJyb3IobWVzc2FnZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnRyeS5sb2dnZXIuaW5mbyhtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNoYW5uZWxJZDtcblx0fVxuXG5cdC8qKiBSZXZlYWxzIHRoZSBkaWFnbm9zdGljcyBjaGFubmVsIGBjaGFubmVsSWRgLCBtYWtpbmcgaXRzIGhpZGRlbiBsb2dnZXIgdmlzaWJsZS4gKi9cblx0YXN5bmMgc2hvdyhjaGFubmVsSWQ6IHN0cmluZywgYmVmb3JlU2hvdz86ICgpID0+IFByb21pc2U8dm9pZD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2VudHJpZXMuaGFzKGNoYW5uZWxJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nZ2VyU2VydmljZS5zZXRWaXNpYmlsaXR5KGNoYW5uZWxJZCwgdHJ1ZSk7XG5cdFx0YXdhaXQgYmVmb3JlU2hvdz8uKCk7XG5cdFx0YXdhaXQgdGhpcy5fb3V0cHV0U2VydmljZS5zaG93Q2hhbm5lbChjaGFubmVsSWQpO1xuXHR9XG5cblx0LyoqIERpc3Bvc2VzIGV2ZXJ5IGNoYW5uZWwvbG9nZ2VyIG93bmVkIGJ5IGBzZXNzaW9uUmVzb3VyY2VgIChzZXNzaW9uIHRlYXJkb3duKS4gKi9cblx0ZGlzcG9zZUZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NlU2Vzc2lvbktleShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwb3NlU2Vzc2lvbktleShzZXNzaW9uS2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2J5U2Vzc2lvbi5nZXQoc2Vzc2lvbktleSk7XG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9ieVNlc3Npb24uZGVsZXRlKHNlc3Npb25LZXkpO1xuXHRcdGZvciAoY29uc3QgY2hhbm5lbElkIG9mIGdyb3VwKSB7XG5cdFx0XHR0aGlzLl9lbnRyaWVzLmdldChjaGFubmVsSWQpPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9lbnRyaWVzLmRlbGV0ZShjaGFubmVsSWQpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFN0YWJsZSwgaW5qZWN0aXZlLCBmaWxlc3lzdGVtLXNhZmUgT3V0cHV0L2xvZ2dlciBpZCBmb3IgdGhlIE1DUCBzZXJ2ZXJcbiAqIGByYXdJZGAgaW4gdGhlIHNlc3Npb24ga2V5ZWQgYnkgYHNlc3Npb25LZXlgLiBUaGUgY29tcG9zaXRlIGtleSBpcyBTSEExLWhhc2hlZFxuICogdG8gaGV4OiBoZXggY2hhcmFjdGVycyBhcmUgbmV2ZXIgdG91Y2hlZCBieSB0aGUgbG9nZ2VyIHNlcnZpY2UncyBvd24gcmVzZXJ2ZWQtXG4gKiBjaGFyYWN0ZXIgc3RyaXBwaW5nIChzbyBkaXN0aW5jdCBzZXJ2ZXJzIGNhbid0IGNvbGxhcHNlIG9udG8gb25lIGNoYW5uZWwpLCBhbmRcbiAqIGhhc2hpbmcga2VlcHMgdGhlIGlkIGJvdW5kZWQgcmVnYXJkbGVzcyBvZiBob3cgbG9uZyB0aGUgc2Vzc2lvbiBVUkkgb3IgcmF3IGlkXG4gKiBpcy5cbiAqL1xuZnVuY3Rpb24gY2hhbm5lbElkRm9yTWNwU2VydmVyKHNlc3Npb25LZXk6IHN0cmluZywgcmF3SWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNoYSA9IG5ldyBTdHJpbmdTSEExKCk7XG5cdHNoYS51cGRhdGUoc2Vzc2lvbktleSk7XG5cdHNoYS51cGRhdGUoJ1xcMCcpO1xuXHRzaGEudXBkYXRlKHJhd0lkKTtcblx0cmV0dXJuIGBhZ2VudEhvc3RNY3BTZXJ2ZXIuJHtzaGEuZGlnZXN0KCl9YDtcbn1cblxuLyoqXG4gKiBSZW5kZXJzIGFuIE1DUCBzZXJ2ZXIncyBjdXJyZW50IHN0YXRlIGludG8gYSBkaWFnbm9zdGljcyBsb2cgbGluZSwgYSBjaGFuZ2VcbiAqIHNpZ25hdHVyZSAodXNlZCB0byBzdXBwcmVzcyBkdXBsaWNhdGUgcmVjb3JkcyksIGFuZCB3aGV0aGVyIGl0IGlzIGFuIGVycm9yLlxuICovXG5mdW5jdGlvbiBkZXNjcmliZU1jcFNlcnZlclN0YXRlKG5hbWU6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbiwgc3RhdGU6IE1jcFNlcnZlclN0YXRlKTogeyBzaWduYXR1cmU6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nOyBpc0Vycm9yOiBib29sZWFuIH0ge1xuXHRpZiAoIWVuYWJsZWQpIHtcblx0XHRyZXR1cm4geyBzaWduYXR1cmU6ICdkaXNhYmxlZCcsIG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QubWNwU2VydmVyLmRpc2FibGVkJywgXCJTZXJ2ZXIgJ3swfScgaXMgZGlzYWJsZWRcIiwgbmFtZSksIGlzRXJyb3I6IGZhbHNlIH07XG5cdH1cblx0c3dpdGNoIChzdGF0ZS5raW5kKSB7XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHk6XG5cdFx0XHRyZXR1cm4geyBzaWduYXR1cmU6ICdyZWFkeScsIG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QubWNwU2VydmVyLnJlYWR5JywgXCJTZXJ2ZXIgJ3swfScgaXMgcnVubmluZ1wiLCBuYW1lKSwgaXNFcnJvcjogZmFsc2UgfTtcblx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5TdGFydGluZzpcblx0XHRcdHJldHVybiB7IHNpZ25hdHVyZTogJ3N0YXJ0aW5nJywgbWVzc2FnZTogbG9jYWxpemUoJ2FnZW50SG9zdC5tY3BTZXJ2ZXIuc3RhcnRpbmcnLCBcIlNlcnZlciAnezB9JyBpcyBzdGFydGluZ1wiLCBuYW1lKSwgaXNFcnJvcjogZmFsc2UgfTtcblx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQ6XG5cdFx0XHRyZXR1cm4geyBzaWduYXR1cmU6IGBhdXRoUmVxdWlyZWQ6JHtzdGF0ZS5yZXNvdXJjZS5yZXNvdXJjZX1gLCBtZXNzYWdlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lm1jcFNlcnZlci5hdXRoUmVxdWlyZWQnLCBcIlNlcnZlciAnezB9JyByZXF1aXJlcyBhdXRoZW50aWNhdGlvbiAoezF9KVwiLCBuYW1lLCBzdGF0ZS5yZXNvdXJjZS5yZXNvdXJjZSksIGlzRXJyb3I6IGZhbHNlIH07XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3I6XG5cdFx0XHRyZXR1cm4geyBzaWduYXR1cmU6IGBlcnJvcjoke3N0YXRlLmVycm9yLmVycm9yVHlwZX06JHtzdGF0ZS5lcnJvci5tZXNzYWdlfWAsIG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QubWNwU2VydmVyLmVycm9yJywgXCJTZXJ2ZXIgJ3swfScgZmFpbGVkOiB7MX1cIiwgbmFtZSwgc3RhdGUuZXJyb3IubWVzc2FnZSksIGlzRXJyb3I6IHRydWUgfTtcblx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkOlxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4geyBzaWduYXR1cmU6ICdzdG9wcGVkJywgbWVzc2FnZTogbG9jYWxpemUoJ2FnZW50SG9zdC5tY3BTZXJ2ZXIuc3RvcHBlZCcsIFwiU2VydmVyICd7MH0nIGlzIHN0b3BwZWRcIiwgbmFtZSksIGlzRXJyb3I6IGZhbHNlIH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZLHVCQUFvQyxvQkFBb0I7QUFDN0UsU0FBUyxtQkFBbUI7QUFDNUIsU0FBOEIsb0NBQW9DO0FBRWxFLFNBQVMsb0NBQWlFO0FBQzFFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDLHdCQUF3QixtQ0FBbUM7QUFFcEcsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkIsbUJBQTJDLHVCQUFpSztBQUNsUCxTQUE2QixnQkFBZ0IsdUJBQXVCO0FBQ3BFLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLGlCQUFpQiw2QkFBNkI7QUFFdkQsU0FBa0IsZ0JBQWdCLG1CQUFtQjtBQUNyRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1EQUFtRDtBQUM1RCxTQUFTLHFDQUFxQztBQUU5QyxTQUFTLGdDQUFnQyw0QkFBNEI7QUFDckUsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSxpQ0FBaUMsZ0JBQWdELCtCQUErQjtBQTJEdEgsTUFBTSxrQ0FBNEU7QUFBQSxFQUFsRjtBQUVOLFNBQVMsMEJBQTBCLE1BQU07QUFDekMsU0FBUyw0QkFBNEIsTUFBTTtBQUFBO0FBQUEsRUFDM0MsZ0JBQWdCLGtCQUFzRDtBQUNyRSxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQUEsRUFDQSxrQkFBa0Isa0JBQWlEO0FBQ2xFLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFBQSxFQUNBLG9CQUFvQixpQkFBMEM7QUFDN0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNBLHNCQUFzQixrQkFBMEM7QUFDL0QsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBQ0EsY0FBYyxrQkFBdUQ7QUFDcEUsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBQ0EsYUFBYSxrQkFBdUIsT0FBZSxTQUF3QztBQUFBLEVBRTNGO0FBQUEsRUFDQSxzQkFBc0Isa0JBQXVCLFdBQXFDO0FBQ2pGLFdBQU8sUUFBUSxRQUFRLEtBQUs7QUFBQSxFQUM3QjtBQUFBLEVBQ0EsMkJBQTJCLGtCQUF1QixrQkFBMEIsb0JBQW9FLE9BQW9DLFVBQXlCO0FBQUEsRUFFN007QUFBQSxFQUNBLE1BQU0saUJBQWlCLGtCQUF1QixXQUFtQixZQUFpRDtBQUNqSCxVQUFNLGFBQWE7QUFBQSxFQUNwQjtBQUNEO0FBZU8sTUFBZSw4Q0FBOEMsV0FBcUQ7QUFBQSxFQWlCOUcsWUFDVSx1QkFDQSxhQUNsQjtBQUNELFVBQU07QUFIYTtBQUNBO0FBaEJwQixTQUFpQiwyQkFBMkIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzlFLFNBQWlCLDZCQUE2QixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDaEYsU0FBUywwQkFBdUMsS0FBSyx5QkFBeUI7QUFDOUUsU0FBUyw0QkFBeUMsS0FBSywyQkFBMkI7QUFTbEY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIseUJBQXlCLElBQUksWUFBWTtBQU96RCxTQUFLLGtCQUFrQixLQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSw2QkFBNkIsQ0FBQztBQUM5RyxTQUFLLFVBQVUsS0FBSywwQkFBMEIsTUFBTSxLQUFLLHNCQUFzQixDQUFDLENBQUM7QUFBQSxFQUNsRjtBQUFBLEVBSUEsZ0JBQWdCLGlCQUFxRDtBQUNwRSxXQUFPLG1CQUFtQixLQUFLLGVBQWUsZUFBZSxHQUFHLGNBQWM7QUFBQSxFQUMvRTtBQUFBLEVBRUEsa0JBQWtCLGlCQUFnRDtBQUNqRSxXQUFPLEtBQUssZUFBZSxlQUFlLEdBQUcsa0JBQWtCLENBQUM7QUFBQSxFQUNqRTtBQUFBLEVBRUEsb0JBQW9CLGlCQUEwQztBQUM3RCxXQUFPLEtBQUssZUFBZSxlQUFlLEdBQUc7QUFBQSxFQUM5QztBQUFBLEVBRUEsc0JBQXNCLGlCQUF5QztBQUM5RCxXQUFPLEtBQUssZUFBZSxlQUFlLEdBQUcsc0JBQXNCLENBQUM7QUFBQSxFQUNyRTtBQUFBLEVBRUEsY0FBYyxpQkFBc0Q7QUFDbkUsVUFBTSxTQUFTLEtBQUssZUFBZSxlQUFlO0FBQ2xELFFBQUksQ0FBQyxRQUFRO0FBQ1osYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFdBQU8sS0FBSyxtQkFBbUIsT0FBTyxjQUFjLEVBQ2xELElBQUksQ0FBQyxFQUFFLFFBQVEsT0FBTyxPQUE0QjtBQUFBLE1BQ2xELElBQUksS0FBSyxtQkFBbUIsaUJBQWlCLE9BQU8sRUFBRTtBQUFBLE1BQ3RELE1BQU0sT0FBTztBQUFBLE1BQ2IsU0FBUyx1QkFBdUIsTUFBTSxNQUFNLENBQUMsVUFBVSx1QkFBdUIsTUFBTTtBQUFBLE1BQ3BGLFlBQVksT0FBTztBQUFBLE1BQ25CLGtCQUFrQixXQUFXO0FBQUEsTUFDN0IsaUJBQWlCLFdBQVcsVUFBYSxPQUFPLG1CQUFtQixPQUFPLEtBQUssT0FBTyxJQUFJO0FBQUEsTUFDMUYsc0JBQXNCLFFBQVE7QUFBQSxNQUM5QixnQkFBZ0IsK0JBQStCLFFBQVEsTUFBTTtBQUFBLE1BQzdELFFBQVEsT0FBTyxNQUFNO0FBQUEsTUFDckIsT0FBTyxPQUFPO0FBQUEsTUFDZCxvQkFBb0Isc0JBQXNCLGdCQUFnQixTQUFTLEdBQUcsT0FBTyxFQUFFO0FBQUEsTUFDL0UsWUFBWSxDQUFDLFlBQXFCLE9BQU8sMkJBQTJCLE9BQU8sSUFBSSw0QkFBNEIsT0FBTyxZQUFZLDRCQUE0QixTQUFTLEVBQUUsTUFBTSw0QkFBNEIsU0FBUyxRQUFRLENBQUMsQ0FBQztBQUFBLE1BQzFOLE9BQU8sTUFBTSxPQUFPLGVBQWUsT0FBTyxFQUFFO0FBQUEsTUFDNUMsTUFBTSxNQUFNLE9BQU8sY0FBYyxPQUFPLEVBQUU7QUFBQSxJQUMzQyxFQUFFO0FBQUEsRUFDSjtBQUFBLEVBRUEsaUJBQWlCLGlCQUFzQixVQUFrQixZQUFpRDtBQUN6RyxVQUFNLFNBQVMsS0FBSyxlQUFlLGVBQWU7QUFDbEQsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPLFFBQVEsUUFBUTtBQUFBLElBQ3hCO0FBQ0EsVUFBTSxRQUFRLEtBQUssbUJBQW1CLE9BQU8sY0FBYyxFQUFFLEtBQUssQ0FBQyxFQUFFLFFBQUFBLFFBQU8sTUFBTSxLQUFLLG1CQUFtQixpQkFBaUJBLFFBQU8sRUFBRSxNQUFNLFFBQVE7QUFDbEosUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPLFFBQVEsUUFBUTtBQUFBLElBQ3hCO0FBQ0EsVUFBTSxFQUFFLFFBQVEsT0FBTyxJQUFJO0FBRTNCLFNBQUsscUJBQXFCLGlCQUFpQixNQUFNO0FBQ2pELFVBQU0sWUFBWSxLQUFLLGdCQUFnQixPQUFPLEVBQUUsaUJBQWlCLE9BQU8sT0FBTyxJQUFJLE1BQU0sT0FBTyxNQUFNLFNBQVMsdUJBQXVCLE1BQU0sTUFBTSxDQUFDLFVBQVUsdUJBQXVCLE1BQU0sSUFBSSxPQUFPLE9BQU8sTUFBTSxDQUFDO0FBQ25OLFdBQU8sS0FBSyxnQkFBZ0IsS0FBSyxXQUFXLFVBQVU7QUFBQSxFQUN2RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLHFCQUFxQixpQkFBc0IsUUFBNkM7QUFDL0YsU0FBSyx1QkFBdUIsSUFBSSxlQUFlO0FBQy9DLGVBQVcsRUFBRSxRQUFRLE9BQU8sS0FBSyxLQUFLLG1CQUFtQixPQUFPLGNBQWMsR0FBRztBQUNoRixXQUFLLGdCQUFnQixPQUFPLEVBQUUsaUJBQWlCLE9BQU8sT0FBTyxJQUFJLE1BQU0sT0FBTyxNQUFNLFNBQVMsdUJBQXVCLE1BQU0sTUFBTSxDQUFDLFVBQVUsdUJBQXVCLE1BQU0sSUFBSSxPQUFPLE9BQU8sTUFBTSxDQUFDO0FBQUEsSUFDbE07QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdRLHdCQUE4QjtBQUNyQyxlQUFXLG1CQUFtQixLQUFLLHdCQUF3QjtBQUMxRCxZQUFNLFNBQVMsS0FBSyxlQUFlLGVBQWU7QUFDbEQsVUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxFQUFFLFFBQVEsT0FBTyxLQUFLLEtBQUssbUJBQW1CLE9BQU8sY0FBYyxHQUFHO0FBQ2hGLGFBQUssZ0JBQWdCLE9BQU8sRUFBRSxpQkFBaUIsT0FBTyxPQUFPLElBQUksTUFBTSxPQUFPLE1BQU0sU0FBUyx1QkFBdUIsTUFBTSxNQUFNLENBQUMsVUFBVSx1QkFBdUIsTUFBTSxJQUFJLE9BQU8sT0FBTyxNQUFNLENBQUM7QUFBQSxNQUNsTTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdVLHVCQUF1QixpQkFBNEI7QUFDNUQsU0FBSyx1QkFBdUIsT0FBTyxlQUFlO0FBQ2xELFNBQUssZ0JBQWdCLGtCQUFrQixlQUFlO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLGFBQWEsaUJBQXNCLE1BQWMsUUFBdUM7QUFDdkYsVUFBTSxTQUFTLEtBQUssZUFBZSxlQUFlO0FBQ2xELFVBQU0sa0JBQWtCLFFBQVEsWUFBWSxTQUFTLDRCQUE0QjtBQUNqRixRQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sWUFBWTtBQUNsQztBQUFBLElBQ0Q7QUFDQSxVQUFNLFVBQStCLG1CQUFtQixPQUFPLG9CQUFvQixZQUFZLENBQUMsTUFBTSxRQUFRLGVBQWUsSUFDMUgsa0JBQ0EsQ0FBQztBQUNKLFdBQU8sbUJBQW1CLDhCQUE4QjtBQUFBLE1BQ3ZELEdBQUc7QUFBQSxNQUNILENBQUMsSUFBSSxHQUFHO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxzQkFBc0IsaUJBQXNCLFVBQW9DO0FBQ3JGLFVBQU0sU0FBUyxLQUFLLGVBQWUsZUFBZTtBQUNsRCxRQUFJLENBQUMsUUFBUTtBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxTQUFTLEtBQUssZUFBZSxPQUFPLGdCQUFnQixRQUFRO0FBQ2xFLFFBQUksQ0FBQyxVQUFVLE9BQU8sTUFBTSxTQUFTLGdCQUFnQixjQUFjO0FBQ2xFLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxpQkFBaUIscUJBQXFCLGdCQUFnQixXQUFXLE9BQU8sTUFBTSxPQUFPLE1BQU0sU0FBUyxRQUFRO0FBQ2xILFFBQUk7QUFDSCxhQUFPLE1BQU0sS0FBSyxzQkFBc0IsZUFBZSxnQ0FBZ0MsT0FBTyxNQUFNLFVBQVU7QUFBQSxRQUM3RyxrQkFBa0I7QUFBQSxRQUNsQixXQUFXO0FBQUEsUUFDWCxhQUFhO0FBQUEsUUFDYixlQUFlLE9BQU87QUFBQSxRQUN0QixjQUFjLE9BQU8sTUFBTSxTQUFTO0FBQUEsUUFDcEMsYUFBYSxPQUFPLE1BQU07QUFBQSxRQUMxQixRQUFRLE9BQU8sTUFBTSxrQkFBa0IsQ0FBQztBQUFBLFFBQ3hDLFdBQVcsRUFBRSxRQUFRLGdCQUFnQixRQUFRLFdBQVcsZ0JBQWdCLFVBQVU7QUFBQSxRQUNsRixjQUFjLGFBQVcsT0FBTyxhQUFhLE9BQU87QUFBQSxNQUNyRCxDQUFDO0FBQUEsSUFDRixTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksTUFBTSxrREFBa0QsT0FBTyxJQUFJLEtBQUssR0FBRztBQUM1RixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLDJCQUEyQixpQkFBc0IsaUJBQXlCLG1CQUFtRSxNQUFtQyxTQUF3QjtBQUN2TSxVQUFNLFNBQVMsS0FBSyxlQUFlLGVBQWU7QUFDbEQsUUFBSSxDQUFDLFFBQVE7QUFDWixXQUFLLFlBQVksS0FBSyxpRUFBaUUsZUFBZSx1Q0FBdUM7QUFDN0k7QUFBQSxJQUNEO0FBQ0EsVUFBTSxnQkFBZ0IsS0FBSyxtQkFBbUIsT0FBTyxnQkFBZ0IsZUFBZTtBQUNwRixRQUFJLENBQUMsZUFBZTtBQUNuQixXQUFLLFlBQVksS0FBSywyRkFBMkYsZUFBZSxJQUFJO0FBQ3BJO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUSxTQUFTLDRCQUE0QixZQUNoRCxLQUFLLDBCQUEwQixRQUFRLE9BQU8sSUFDOUMsRUFBRSxNQUFNLFFBQVE7QUFDbkIsUUFBSSxDQUFDLE9BQU87QUFDWCxXQUFLLFlBQVksS0FBSyx3RUFBd0UsZUFBZSxnQ0FBZ0M7QUFDN0k7QUFBQSxJQUNEO0FBQ0EsV0FBTywyQkFBMkIsY0FBYyxJQUFJLDRCQUE0QixtQkFBbUIsTUFBTSxLQUFLLENBQUM7QUFBQSxFQUNoSDtBQUFBLEVBRVEsMEJBQTBCLFFBQXVDLFNBQXVEO0FBQy9ILFVBQU0sbUJBQW1CLE9BQU8scUJBQXFCLENBQUMsS0FBSyxPQUFPO0FBQ2xFLFdBQU8sbUJBQW1CLEVBQUUsTUFBTSw0QkFBNEIsV0FBVyxLQUFLLGtCQUFrQixRQUFRLElBQUk7QUFBQSxFQUM3RztBQUFBLEVBRVUsMkJBQWlDO0FBQzFDLFNBQUsseUJBQXlCLEtBQUs7QUFBQSxFQUNwQztBQUFBLEVBRVUsNkJBQW1DO0FBQzVDLFNBQUssMkJBQTJCLEtBQUs7QUFBQSxFQUN0QztBQUFBLEVBRVEsbUJBQW1CLGdCQUF5STtBQUNuSyxXQUFPLGVBQWUsUUFBUSxtQkFBaUIsY0FBYyxTQUFTLGtCQUFrQixZQUNyRixDQUFDLEVBQUUsUUFBUSxjQUFjLENBQUMsSUFDMUIsY0FBYyxVQUFVLE9BQU8sV0FBUyxNQUFNLFNBQVMsa0JBQWtCLFNBQVMsRUFBRSxJQUFJLGFBQVc7QUFBQSxNQUNwRztBQUFBLE1BQ0EsUUFBUSxjQUFjLFNBQVMsa0JBQWtCLFNBQVMsZ0JBQWdCO0FBQUEsSUFDM0UsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQ1g7QUFBQSxFQUVRLGVBQWUsZ0JBQTBDLFVBQXNEO0FBQ3RILGVBQVcsRUFBRSxPQUFPLEtBQUssS0FBSyxtQkFBbUIsY0FBYyxHQUFHO0FBQ2pFLFVBQUksT0FBTyxPQUFPLFlBQVksS0FBSyw2QkFBNkIsVUFBVSxPQUFPLEVBQUUsR0FBRztBQUNyRixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsbUJBQW1CLGdCQUEwQyxpQkFBOEQ7QUFDbEksZUFBVyxpQkFBaUIsZ0JBQWdCO0FBQzNDLFVBQUksY0FBYyxPQUFPLG1CQUFtQixLQUFLLDZCQUE2QixpQkFBaUIsY0FBYyxFQUFFLEdBQUc7QUFDakgsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFNBQVMsY0FBYyxTQUFTLGtCQUFrQixZQUFZLGNBQWMsV0FBVyxTQUFZLEtBQUssQ0FBQUMsV0FBU0EsT0FBTSxPQUFPLG1CQUFtQixLQUFLLDZCQUE2QixpQkFBaUJBLE9BQU0sRUFBRSxDQUFDO0FBQ25OLFVBQUksT0FBTztBQUNWLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFVSxtQkFBbUIsaUJBQXNCLE9BQXVCO0FBQ3pFLFdBQU8sR0FBRyxnQkFBZ0IsU0FBUyxJQUFJLEtBQUs7QUFBQSxFQUM3QztBQUFBLEVBRVEsNkJBQTZCLFVBQWtCLE9BQXdCO0FBQzlFLFVBQU0sWUFBWSxTQUFTLFFBQVEsR0FBRztBQUN0QyxXQUFPLGFBQWEsS0FBSyxTQUFTLE1BQU0sWUFBWSxDQUFDLE1BQU07QUFBQSxFQUM1RDtBQUNEO0FBRUEsSUFBTSx5Q0FBTixjQUFxRCxzQ0FBc0M7QUFBQSxFQUkxRixZQUNnRCxxQkFDZSw0QkFDdkMsc0JBQ1YsWUFDa0IsY0FDaUIsc0JBQy9DO0FBQ0QsVUFBTSxzQkFBc0IsVUFBVTtBQVBTO0FBQ2U7QUFHL0I7QUFDaUI7QUFSakQsU0FBaUIsNkJBQTZCLEtBQUssVUFBVSxJQUFJLHNCQUE2SixDQUFDO0FBWTlOLFNBQUssVUFBVSxLQUFLLG9CQUFvQixrQkFBa0IsWUFBWSxjQUFZO0FBQ2pGLGNBQVEsU0FBUyxPQUFPLE1BQU07QUFBQSxRQUM3QixLQUFLLFdBQVc7QUFBQSxRQUNoQixLQUFLLFdBQVc7QUFBQSxRQUNoQixLQUFLLFdBQVc7QUFDZixlQUFLLDJCQUEyQjtBQUNoQyxlQUFLLHlCQUF5QjtBQUM5QjtBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLDJCQUEyQixZQUFZLHFCQUFtQjtBQUM3RSxZQUFNLFdBQVcsS0FBSywyQkFBMkIsSUFBSSxlQUFlO0FBQ3BFLFlBQU0saUJBQWlCLEtBQUssMkJBQTJCLElBQUksZUFBZTtBQUMxRSxVQUFJLFlBQVksU0FBUyxlQUFlLFNBQVMsTUFBTSxnQkFBZ0IsU0FBUyxHQUFHO0FBQ2xGLGFBQUssdUJBQXVCLGVBQWU7QUFBQSxNQUM1QztBQUNBLFdBQUssMkJBQTJCLGlCQUFpQixlQUFlO0FBQ2hFLFdBQUssMkJBQTJCO0FBQ2hDLFdBQUsseUJBQXlCO0FBQUEsSUFDL0IsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssYUFBYSxvQkFBb0IsT0FBSztBQUN6RCxpQkFBVyxtQkFBbUIsRUFBRSxrQkFBa0I7QUFDakQsYUFBSywyQkFBMkIsaUJBQWlCLGVBQWU7QUFDaEUsYUFBSyx1QkFBdUIsZUFBZTtBQUFBLE1BQzVDO0FBQ0EsV0FBSywyQkFBMkI7QUFDaEMsV0FBSyx5QkFBeUI7QUFBQSxJQUMvQixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFbUIsZUFBZSxpQkFBaUU7QUFDbEcsVUFBTSxTQUFTLEtBQUssc0JBQXNCLGVBQWU7QUFDekQsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sZUFBZSxLQUFLLGtCQUFrQixlQUFlO0FBQzNELFVBQU0sWUFBWSxPQUFPLFdBQVcsVUFBVTtBQUM5QyxVQUFNLFVBQVUsT0FBTyxlQUFlLFNBQVM7QUFDL0MsV0FBTztBQUFBLE1BQ04sZ0JBQWdCLGNBQWMsa0JBQWtCLENBQUM7QUFBQSxNQUNqRCxrQkFBa0IsY0FBYyxxQkFBcUIsQ0FBQztBQUFBLE1BQ3RELG9CQUFvQixjQUFjO0FBQUEsTUFDbEMsWUFBWSxhQUFhLEVBQUUscUJBQXFCLFNBQVMsVUFBVSxTQUFTO0FBQUEsTUFDNUUsb0JBQW9CLENBQUMsV0FBVyxlQUFlLEtBQUsscUJBQXFCLG1CQUFtQixXQUFXLFVBQVU7QUFBQSxNQUNqSCxjQUFjLGFBQVcsT0FBTyxXQUFXLGFBQWEsT0FBTztBQUFBLE1BQy9ELDRCQUE0QixDQUFDLE9BQU8sZUFBZTtBQUNsRCxlQUFPLFdBQVcsU0FBUyxTQUFTO0FBQUEsVUFDbkMsTUFBTSxXQUFXO0FBQUEsVUFDakIsSUFBSTtBQUFBLFVBQ0osWUFBWSxDQUFDLEdBQUcsVUFBVTtBQUFBLFFBQzNCLENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxnQkFBZ0IsV0FBUztBQUN4QixlQUFPLFdBQVcsU0FBUyxTQUFTO0FBQUEsVUFDbkMsTUFBTSxXQUFXO0FBQUEsVUFDakIsSUFBSTtBQUFBLFFBQ0wsQ0FBQztBQUNELGVBQU8sUUFBUSxRQUFRO0FBQUEsTUFDeEI7QUFBQSxNQUNBLGVBQWUsV0FBUztBQUN2QixlQUFPLFdBQVcsU0FBUyxTQUFTO0FBQUEsVUFDbkMsTUFBTSxXQUFXO0FBQUEsVUFDakIsSUFBSTtBQUFBLFFBQ0wsQ0FBQztBQUNELGVBQU8sUUFBUSxRQUFRO0FBQUEsTUFDeEI7QUFBQSxNQUNBLG9CQUFvQixDQUFDLFVBQVUsVUFBVTtBQUN4QyxlQUFPLFdBQVcsU0FBUyxnQkFBZ0I7QUFBQSxVQUMxQyxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRLEVBQUUsQ0FBQyxRQUFRLEdBQUcsTUFBTTtBQUFBLFFBQzdCLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtCQUFrQixpQkFBZ0Q7QUFDekUsVUFBTSxTQUFTLEtBQUssc0JBQXNCLGVBQWU7QUFDekQsVUFBTSxRQUFRLFNBQVMsS0FBSyxnQ0FBZ0MsaUJBQWlCLE1BQU0sR0FBRyxJQUFJLFFBQVE7QUFDbEcsV0FBTyxTQUFTLEVBQUUsaUJBQWlCLFNBQVMsUUFBUTtBQUFBLEVBQ3JEO0FBQUEsRUFFUSxnQ0FBZ0MsaUJBQXNCLFFBQTBMO0FBQ3ZQLFVBQU0sV0FBVyxLQUFLLDJCQUEyQixJQUFJLGVBQWU7QUFDcEUsUUFBSSxVQUFVLGVBQWUsU0FBUyxNQUFNLE9BQU8sZUFBZSxTQUFTLEtBQUssU0FBUyxlQUFlLE9BQU8sWUFBWTtBQUMxSCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sTUFBTSxPQUFPLFdBQVcsZ0JBQWdCLGdCQUFnQixTQUFTLE9BQU8sZ0JBQWdCLCtCQUErQjtBQUM3SCxVQUFNLE1BQU0sSUFBSTtBQUNoQixVQUFNLFdBQVcsSUFBSSxZQUFZLE1BQU07QUFDdEMsV0FBSywyQkFBMkI7QUFDaEMsV0FBSyx5QkFBeUI7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxRQUFRO0FBQUEsTUFDYixZQUFZLE9BQU87QUFBQSxNQUNuQixnQkFBZ0IsT0FBTztBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxTQUFTLE1BQU07QUFDZCxpQkFBUyxRQUFRO0FBQ2pCLFlBQUksUUFBUTtBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBQ0EsU0FBSywyQkFBMkIsSUFBSSxpQkFBaUIsS0FBSztBQUMxRCxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLHNCQUFzQixpQkFBK0Q7QUFDNUYsVUFBTSxxQkFBcUIsS0FBSywyQkFBMkIsSUFBSSxlQUFlO0FBQzlFLFFBQUksb0JBQW9CO0FBRXZCLGFBQU8sRUFBRSxZQUFZLEtBQUssb0JBQW9CLG1CQUFtQixnQkFBZ0IsbUJBQW1CO0FBQUEsSUFDckc7QUFFQSxRQUFJLHNCQUFzQixlQUFlLEdBQUc7QUFDM0MsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssb0JBQW9CLHVCQUF1QixlQUFlO0FBQUEsRUFDdkU7QUFDRDtBQTFJTSx5Q0FBTjtBQUFBLEVBS0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVkc7QUE0SU4sa0JBQWtCLGdDQUFnQyx3Q0FBd0Msa0JBQWtCLE9BQU87QUFVbkgsSUFBTSxnQ0FBTixjQUE0QyxXQUFXO0FBQUEsRUFNdEQsWUFDa0MsZ0JBQ0EsZ0JBQ2hDO0FBQ0QsVUFBTTtBQUgyQjtBQUNBO0FBTmxDLFNBQWlCLFdBQVcsb0JBQUksSUFBMkc7QUFFM0k7QUFBQSxTQUFpQixhQUFhLG9CQUFJLElBQXlCO0FBTzFELFNBQUssVUFBVSxhQUFhLE1BQU07QUFDakMsaUJBQVcsT0FBTyxDQUFDLEdBQUcsS0FBSyxXQUFXLEtBQUssQ0FBQyxHQUFHO0FBQzlDLGFBQUssbUJBQW1CLEdBQUc7QUFBQSxNQUM1QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsT0FBTyxRQUE2SjtBQUNuSyxVQUFNLGFBQWEsT0FBTyxnQkFBZ0IsU0FBUztBQUNuRCxVQUFNLFlBQVksc0JBQXNCLFlBQVksT0FBTyxLQUFLO0FBQ2hFLFFBQUksUUFBUSxLQUFLLFNBQVMsSUFBSSxTQUFTO0FBQ3ZDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxTQUFTLEtBQUssZUFBZSxhQUFhLFdBQVc7QUFBQSxRQUMxRCxRQUFRO0FBQUEsUUFDUixNQUFNLFNBQVMscUNBQXFDLFlBQVksT0FBTyxJQUFJO0FBQUEsTUFDNUUsQ0FBQztBQUdELFlBQU0sVUFBVSxNQUFNO0FBQ3JCLGVBQU8sUUFBUTtBQUNmLGFBQUssZUFBZSxpQkFBaUIsU0FBUztBQUFBLE1BQy9DO0FBQ0EsY0FBUSxFQUFFLFFBQVEsU0FBUyxlQUFlLE9BQVU7QUFDcEQsV0FBSyxTQUFTLElBQUksV0FBVyxLQUFLO0FBQ2xDLFVBQUksUUFBUSxLQUFLLFdBQVcsSUFBSSxVQUFVO0FBQzFDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsZ0JBQVEsb0JBQUksSUFBSTtBQUNoQixhQUFLLFdBQVcsSUFBSSxZQUFZLEtBQUs7QUFBQSxNQUN0QztBQUNBLFlBQU0sSUFBSSxTQUFTO0FBQUEsSUFDcEI7QUFFQSxVQUFNLEVBQUUsV0FBVyxTQUFTLFFBQVEsSUFBSSx1QkFBdUIsT0FBTyxNQUFNLE9BQU8sU0FBUyxPQUFPLEtBQUs7QUFDeEcsUUFBSSxNQUFNLGtCQUFrQixXQUFXO0FBQ3RDLFlBQU0sZ0JBQWdCO0FBQ3RCLFVBQUksU0FBUztBQUNaLGNBQU0sT0FBTyxNQUFNLE9BQU87QUFBQSxNQUMzQixPQUFPO0FBQ04sY0FBTSxPQUFPLEtBQUssT0FBTztBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUdBLE1BQU0sS0FBSyxXQUFtQixZQUFpRDtBQUM5RSxRQUFJLENBQUMsS0FBSyxTQUFTLElBQUksU0FBUyxHQUFHO0FBQ2xDO0FBQUEsSUFDRDtBQUNBLFNBQUssZUFBZSxjQUFjLFdBQVcsSUFBSTtBQUNqRCxVQUFNLGFBQWE7QUFDbkIsVUFBTSxLQUFLLGVBQWUsWUFBWSxTQUFTO0FBQUEsRUFDaEQ7QUFBQTtBQUFBLEVBR0Esa0JBQWtCLGlCQUE0QjtBQUM3QyxTQUFLLG1CQUFtQixnQkFBZ0IsU0FBUyxDQUFDO0FBQUEsRUFDbkQ7QUFBQSxFQUVRLG1CQUFtQixZQUEwQjtBQUNwRCxVQUFNLFFBQVEsS0FBSyxXQUFXLElBQUksVUFBVTtBQUM1QyxRQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsSUFDRDtBQUNBLFNBQUssV0FBVyxPQUFPLFVBQVU7QUFDakMsZUFBVyxhQUFhLE9BQU87QUFDOUIsV0FBSyxTQUFTLElBQUksU0FBUyxHQUFHLFFBQVE7QUFDdEMsV0FBSyxTQUFTLE9BQU8sU0FBUztBQUFBLElBQy9CO0FBQUEsRUFDRDtBQUNEO0FBdkZNLGdDQUFOO0FBQUEsRUFPRztBQUFBLEVBQ0E7QUFBQSxHQVJHO0FBaUdOLFNBQVMsc0JBQXNCLFlBQW9CLE9BQXVCO0FBQ3pFLFFBQU0sTUFBTSxJQUFJLFdBQVc7QUFDM0IsTUFBSSxPQUFPLFVBQVU7QUFDckIsTUFBSSxPQUFPLElBQUk7QUFDZixNQUFJLE9BQU8sS0FBSztBQUNoQixTQUFPLHNCQUFzQixJQUFJLE9BQU8sQ0FBQztBQUMxQztBQU1BLFNBQVMsdUJBQXVCLE1BQWMsU0FBa0IsT0FBaUY7QUFDaEosTUFBSSxDQUFDLFNBQVM7QUFDYixXQUFPLEVBQUUsV0FBVyxZQUFZLFNBQVMsU0FBUyxnQ0FBZ0MsNEJBQTRCLElBQUksR0FBRyxTQUFTLE1BQU07QUFBQSxFQUNySTtBQUNBLFVBQVEsTUFBTSxNQUFNO0FBQUEsSUFDbkIsS0FBSyxnQkFBZ0I7QUFDcEIsYUFBTyxFQUFFLFdBQVcsU0FBUyxTQUFTLFNBQVMsNkJBQTZCLDJCQUEyQixJQUFJLEdBQUcsU0FBUyxNQUFNO0FBQUEsSUFDOUgsS0FBSyxnQkFBZ0I7QUFDcEIsYUFBTyxFQUFFLFdBQVcsWUFBWSxTQUFTLFNBQVMsZ0NBQWdDLDRCQUE0QixJQUFJLEdBQUcsU0FBUyxNQUFNO0FBQUEsSUFDckksS0FBSyxnQkFBZ0I7QUFDcEIsYUFBTyxFQUFFLFdBQVcsZ0JBQWdCLE1BQU0sU0FBUyxRQUFRLElBQUksU0FBUyxTQUFTLG9DQUFvQyw4Q0FBOEMsTUFBTSxNQUFNLFNBQVMsUUFBUSxHQUFHLFNBQVMsTUFBTTtBQUFBLElBQ25OLEtBQUssZ0JBQWdCO0FBQ3BCLGFBQU8sRUFBRSxXQUFXLFNBQVMsTUFBTSxNQUFNLFNBQVMsSUFBSSxNQUFNLE1BQU0sT0FBTyxJQUFJLFNBQVMsU0FBUyw2QkFBNkIsNEJBQTRCLE1BQU0sTUFBTSxNQUFNLE9BQU8sR0FBRyxTQUFTLEtBQUs7QUFBQSxJQUNuTSxLQUFLLGdCQUFnQjtBQUFBLElBQ3JCO0FBQ0MsYUFBTyxFQUFFLFdBQVcsV0FBVyxTQUFTLFNBQVMsK0JBQStCLDJCQUEyQixJQUFJLEdBQUcsU0FBUyxNQUFNO0FBQUEsRUFDbkk7QUFDRDsiLAogICJuYW1lcyI6IFsic2VydmVyIiwgImNoaWxkIl0KfQo=
