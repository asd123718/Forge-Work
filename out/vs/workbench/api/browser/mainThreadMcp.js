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
import { mapFindFirst } from "../../../base/common/arraysFind.js";
import { disposableTimeout, RunOnceScheduler } from "../../../base/common/async.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../base/common/observable.js";
import Severity from "../../../base/common/severity.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import * as nls from "../../../nls.js";
import { ContextKeyExpr, IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { LogLevel } from "../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { ISecretStorageService } from "../../../platform/secrets/common/secrets.js";
import { IWorkbenchMcpGatewayService } from "../../contrib/mcp/common/mcpGatewayService.js";
import { IMcpRegistry } from "../../contrib/mcp/common/mcpRegistryTypes.js";
import { extensionPrefixedIdentifier, McpCollectionSortOrder, McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust, mcpOAuthClientSecretStorageKey, UserInteractionRequiredError } from "../../contrib/mcp/common/mcpTypes.js";
import { mcpEnterpriseManagedAuthIdpSection } from "../../contrib/mcp/common/mcpConfiguration.js";
import { IAuthenticationMcpAccessService } from "../../services/authentication/browser/authenticationMcpAccessService.js";
import { IAuthenticationMcpService } from "../../services/authentication/browser/authenticationMcpService.js";
import { IAuthenticationMcpUsageService } from "../../services/authentication/browser/authenticationMcpUsageService.js";
import { IAuthenticationService } from "../../services/authentication/common/authentication.js";
import { IDynamicAuthenticationProviderStorageService } from "../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { ExtensionHostKind, extensionHostKindToString } from "../../services/extensions/common/extensionHostKind.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
let MainThreadMcp = class extends Disposable {
  constructor(_extHostContext, _mcpRegistry, dialogService, _authenticationService, authenticationMcpServersService, authenticationMCPServerAccessService, authenticationMCPServerUsageService, _dynamicAuthenticationProviderStorageService, _extensionService, _contextKeyService, _telemetryService, _mcpGatewayService, _configurationService, _secretStorageService) {
    super();
    this._extHostContext = _extHostContext;
    this._mcpRegistry = _mcpRegistry;
    this.dialogService = dialogService;
    this._authenticationService = _authenticationService;
    this.authenticationMcpServersService = authenticationMcpServersService;
    this.authenticationMCPServerAccessService = authenticationMCPServerAccessService;
    this.authenticationMCPServerUsageService = authenticationMCPServerUsageService;
    this._dynamicAuthenticationProviderStorageService = _dynamicAuthenticationProviderStorageService;
    this._extensionService = _extensionService;
    this._contextKeyService = _contextKeyService;
    this._telemetryService = _telemetryService;
    this._mcpGatewayService = _mcpGatewayService;
    this._configurationService = _configurationService;
    this._secretStorageService = _secretStorageService;
    this._serverIdCounter = 0;
    this._servers = /* @__PURE__ */ new Map();
    this._serverDefinitions = /* @__PURE__ */ new Map();
    this._serverAuthTracking = new McpServerAuthTracker();
    this._collectionDefinitions = this._register(new DisposableMap());
    this._gateways = this._register(new DisposableMap());
    this._register(_authenticationService.onDidChangeSessions((e) => this._onDidChangeAuthSessions(e.providerId, e.label)));
    const proxy = this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostMcp);
    this._register(this._mcpRegistry.registerDelegate({
      // Prefer Node.js extension hosts when they're available. No CORS issues etc.
      priority: _extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker ? 0 : 1,
      waitForInitialProviderPromises() {
        return proxy.$waitForInitialCollectionProviders();
      },
      canStart(collection, serverDefinition) {
        if (collection.remoteAuthority !== _extHostContext.remoteAuthority) {
          return false;
        }
        if (serverDefinition.launch.type === McpServerTransportType.Stdio && _extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker) {
          return false;
        }
        return true;
      },
      async substituteVariables(serverDefinition, launch) {
        const ser = await proxy.$substituteVariables(serverDefinition.variableReplacement?.folder?.uri, McpServerLaunch.toSerialized(launch));
        return McpServerLaunch.fromSerialized(ser);
      },
      start: (_collection, serverDefiniton, resolveLaunch, options) => {
        const id = ++this._serverIdCounter;
        const launch = new ExtHostMcpServerLaunch(
          _extHostContext.extensionHostKind,
          () => proxy.$stopMcp(id),
          (msg) => proxy.$sendMessage(id, JSON.stringify(msg))
        );
        this._servers.set(id, launch);
        this._serverDefinitions.set(id, serverDefiniton);
        proxy.$startMcp(id, {
          launch: resolveLaunch,
          defaultCwd: serverDefiniton.variableReplacement?.folder?.uri,
          errorOnUserInteraction: options?.errorOnUserInteraction
        });
        return launch;
      }
    }));
    const onDidChangeMcpServerDefinitionsTrigger = this._register(new RunOnceScheduler(() => this._publishServerDefinitions(), 500));
    this._register(autorun((reader) => {
      const collections = this._mcpRegistry.collections.read(reader);
      for (const collection of collections) {
        collection.serverDefinitions.read(reader);
      }
      if (!onDidChangeMcpServerDefinitionsTrigger.isScheduled()) {
        onDidChangeMcpServerDefinitionsTrigger.schedule();
      }
    }));
    onDidChangeMcpServerDefinitionsTrigger.schedule();
  }
  _publishServerDefinitions() {
    const collections = this._mcpRegistry.collections.get();
    const allServers = [];
    for (const collection of collections) {
      const servers = collection.serverDefinitions.get();
      for (const server of servers) {
        allServers.push(McpServerDefinition.toSerialized(server));
      }
    }
    this._proxy.$onDidChangeMcpServerDefinitions(allServers);
  }
  $upsertMcpCollection(collection, serversDto) {
    const servers = serversDto.map(McpServerDefinition.fromSerialized);
    const existing = this._collectionDefinitions.get(collection.id);
    if (existing) {
      existing.servers.set(servers, void 0);
    } else {
      const serverDefinitions = observableValue("mcpServers", servers);
      const extensionId = new ExtensionIdentifier(collection.extensionId);
      const store = new DisposableStore();
      const handle = store.add(new MutableDisposable());
      const register = () => {
        handle.value ??= this._mcpRegistry.registerCollection({
          ...collection,
          source: extensionId,
          order: McpCollectionSortOrder.Extension,
          resolveServerLanch: collection.canResolveLaunch ? (async (def) => {
            const r = await this._proxy.$resolveMcpLaunch(collection.id, def.label);
            return r ? McpServerLaunch.fromSerialized(r) : void 0;
          }) : void 0,
          trustBehavior: collection.isTrustedByDefault ? McpServerTrust.Kind.Trusted : McpServerTrust.Kind.TrustedOnNonce,
          remoteAuthority: this._extHostContext.remoteAuthority,
          serverDefinitions
        });
      };
      const whenClauseStr = mapFindFirst(this._extensionService.extensions, (e) => ExtensionIdentifier.equals(extensionId, e.identifier) ? e.contributes?.mcpServerDefinitionProviders?.find((p) => extensionPrefixedIdentifier(extensionId, p.id) === collection.id)?.when : void 0);
      const whenClause = whenClauseStr && ContextKeyExpr.deserialize(whenClauseStr);
      if (!whenClause) {
        register();
      } else {
        const evaluate = () => {
          if (this._contextKeyService.contextMatchesRules(whenClause)) {
            register();
          } else {
            handle.clear();
          }
        };
        store.add(this._contextKeyService.onDidChangeContext(evaluate));
        evaluate();
      }
      this._collectionDefinitions.set(collection.id, {
        servers: serverDefinitions,
        dispose: () => store.dispose()
      });
    }
  }
  $deleteMcpCollection(collectionId) {
    this._collectionDefinitions.deleteAndDispose(collectionId);
  }
  $onDidChangeState(id, update) {
    const server = this._servers.get(id);
    if (!server) {
      return;
    }
    server.state.set(update, void 0);
    if (!McpConnectionState.isRunning(update)) {
      server.dispose();
      this._servers.delete(id);
      this._serverDefinitions.delete(id);
      this._serverAuthTracking.untrack(id);
    }
  }
  $onDidPublishLog(id, level, log) {
    if (typeof level === "string") {
      level = LogLevel.Info;
      log = level;
    }
    this._servers.get(id)?.pushLog(level, log);
  }
  $onDidReceiveMessage(id, message) {
    this._servers.get(id)?.pushMessage(message);
  }
  async $getTokenForProviderId(id, providerId, scopes, options = {}) {
    const server = this._serverDefinitions.get(id);
    if (!server) {
      return void 0;
    }
    return this._getSessionForProvider(id, server, providerId, scopes, void 0, options.errorOnUserInteraction, options.clientId);
  }
  async $getTokenFromServerMetadata(id, authDetails, { errorOnUserInteraction, forceNewRegistration, clientId } = {}) {
    const server = this._serverDefinitions.get(id);
    if (!server) {
      return void 0;
    }
    const authorizationServer = URI.revive(authDetails.authorizationServer);
    const resourceServer = authDetails.resourceMetadata?.resource ? URI.parse(authDetails.resourceMetadata.resource) : void 0;
    const resolvedScopes = authDetails.scopes ?? authDetails.resourceMetadata?.scopes_supported ?? authDetails.authorizationServerMetadata.scopes_supported ?? [];
    if (authDetails.enterpriseManaged) {
      const resource = authDetails.resourceMetadata?.resource;
      if (!resource) {
        throw new Error(nls.localize("mcp.enterpriseManaged.missingResource", "The enterprise-managed MCP server '{0}' did not advertise a protected-resource metadata document with a 'resource' identifier.", server.label));
      }
      const resourceAuthServers = authDetails.resourceMetadata?.authorization_servers ?? [];
      const audience = resourceAuthServers[0];
      if (!audience) {
        throw new Error(nls.localize("mcp.enterpriseManaged.missingAS", "The enterprise-managed MCP server '{0}' did not advertise an `authorization_servers` entry in its protected-resource metadata.", server.label));
      }
      const xaaScopes = authDetails.scopes ?? authDetails.resourceMetadata?.scopes_supported ?? [];
      const issuer = this._ensureXaaIssuer();
      const xaaProviderId = await this._authenticationService.createOrGetXaaProvider(issuer);
      if (!xaaProviderId) {
        return void 0;
      }
      const resourceClientId = clientId ?? authDetails.clientId;
      let resourceClientSecret;
      if (resourceClientId) {
        try {
          resourceClientSecret = await this._secretStorageService.get(mcpOAuthClientSecretStorageKey(resource, resourceClientId));
        } catch {
        }
      }
      return this._getSessionForProvider(id, server, xaaProviderId, xaaScopes, issuer, errorOnUserInteraction, resourceClientId, resource, audience, resourceClientSecret);
    }
    let providerId = await this._authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer);
    const resolvedClientId = clientId ?? authDetails.clientId;
    const mcpServerUrl = server.launch.type === McpServerTransportType.HTTP ? server.launch.uri.toString(true) : void 0;
    let clientSecret;
    let didLookupClientSecret = false;
    if (resolvedClientId && mcpServerUrl) {
      try {
        clientSecret = await this._secretStorageService.get(mcpOAuthClientSecretStorageKey(mcpServerUrl, resolvedClientId));
        didLookupClientSecret = true;
      } catch {
      }
    }
    if (didLookupClientSecret && providerId && !forceNewRegistration && this._authenticationService.isDynamicAuthenticationProvider(providerId)) {
      const registered = await this._dynamicAuthenticationProviderStorageService.getClientRegistration(providerId);
      if (registered && registered.clientSecret !== clientSecret) {
        forceNewRegistration = true;
      }
    }
    if (forceNewRegistration && providerId) {
      if (!this._authenticationService.isDynamicAuthenticationProvider(providerId)) {
        throw new Error("Cannot force new registration for a non-dynamic authentication provider.");
      }
      this._authenticationService.unregisterAuthenticationProvider(providerId);
      await this._dynamicAuthenticationProviderStorageService.removeDynamicProvider(providerId);
      providerId = void 0;
    }
    if (!providerId) {
      const provider = await this._authenticationService.createDynamicAuthenticationProvider(authorizationServer, authDetails.authorizationServerMetadata, authDetails.resourceMetadata, resolvedClientId, clientSecret);
      if (!provider) {
        return void 0;
      }
      providerId = provider.id;
    }
    return this._getSessionForProvider(
      id,
      server,
      providerId,
      resolvedScopes,
      authorizationServer,
      errorOnUserInteraction,
      resolvedClientId,
      authDetails.resourceMetadata?.resource,
      /* audience */
      void 0,
      clientSecret
    );
  }
  _ensureXaaIssuer() {
    const config = this._configurationService.getValue(mcpEnterpriseManagedAuthIdpSection) ?? {};
    const configuredIssuer = config.issuer?.trim();
    if (!configuredIssuer) {
      throw new Error(nls.localize("mcp.enterpriseManaged.issuerMissing", "Enterprise-managed MCP authentication requires `mcp.enterpriseManagedAuth.idp.issuer` to be configured. Set it via enterprise policy (Windows Group Policy / macOS managed preferences / Linux `/etc/vscode/policy.json`) or, for local testing, by hand-editing `settings.json`."));
    }
    let parsed;
    try {
      parsed = URI.parse(configuredIssuer);
    } catch {
      throw new Error(nls.localize("mcp.enterpriseManaged.issuerInvalid", "Enterprise-managed MCP authentication requires `mcp.enterpriseManagedAuth.idp.issuer` to be a valid URL; got '{0}'.", configuredIssuer));
    }
    if (parsed.scheme !== "https" && parsed.scheme !== "http") {
      throw new Error(nls.localize("mcp.enterpriseManaged.issuerNotHttp", "Enterprise-managed MCP authentication requires `mcp.enterpriseManagedAuth.idp.issuer` to use the `https` or `http` scheme; got '{0}'.", configuredIssuer));
    }
    return parsed;
  }
  async _getSessionForProvider(serverId, server, providerId, scopes, authorizationServer, errorOnUserInteraction = false, clientId, resource, audience, clientSecret) {
    const authContext = { authorizationServer, clientId, resource, audience };
    const sessions = await this._authenticationService.getSessions(providerId, scopes, { authorizationServer, clientId, clientSecret, resource, audience }, true);
    if (server.launch.type !== McpServerTransportType.HTTP) {
      return void 0;
    }
    const mcpServerUrl = server.launch.uri.toString(true);
    const accountNamePreference = this.authenticationMcpServersService.getAccountPreference(server.id, providerId);
    let matchingAccountPreferenceSession;
    if (accountNamePreference) {
      matchingAccountPreferenceSession = sessions.find((session2) => session2.account.label === accountNamePreference);
    }
    const provider = this._authenticationService.getProvider(providerId);
    let session;
    if (sessions.length) {
      if (matchingAccountPreferenceSession && this.authenticationMCPServerAccessService.isAccessAllowedForUrl(providerId, matchingAccountPreferenceSession.account.label, server.id, mcpServerUrl)) {
        this.authenticationMCPServerUsageService.addAccountUsage(providerId, matchingAccountPreferenceSession.account.label, scopes, server.id, server.label);
        this._serverAuthTracking.track(providerId, serverId, scopes, authContext);
        return matchingAccountPreferenceSession.accessToken;
      }
      if (!provider.supportsMultipleAccounts && this.authenticationMCPServerAccessService.isAccessAllowedForUrl(providerId, sessions[0].account.label, server.id, mcpServerUrl)) {
        this.authenticationMCPServerUsageService.addAccountUsage(providerId, sessions[0].account.label, scopes, server.id, server.label);
        this._serverAuthTracking.track(providerId, serverId, scopes, authContext);
        return sessions[0].accessToken;
      }
    }
    if (errorOnUserInteraction) {
      throw new UserInteractionRequiredError("authentication");
    }
    const isAllowed = await this.loginPrompt(server.label, provider.label, false);
    if (!isAllowed) {
      throw new Error("User did not consent to login.");
    }
    if (sessions.length) {
      if (provider.supportsMultipleAccounts && errorOnUserInteraction) {
        throw new UserInteractionRequiredError("authentication");
      }
      session = provider.supportsMultipleAccounts ? await this.authenticationMcpServersService.selectSession(providerId, server.id, server.label, scopes, sessions) : sessions[0];
    } else {
      if (errorOnUserInteraction) {
        throw new UserInteractionRequiredError("authentication");
      }
      const accountToCreate = matchingAccountPreferenceSession?.account;
      do {
        session = await this._authenticationService.createSession(
          providerId,
          scopes,
          {
            activateImmediate: true,
            account: accountToCreate,
            authorizationServer,
            clientId,
            clientSecret,
            resource,
            audience
          }
        );
      } while (accountToCreate && accountToCreate.label !== session.account.label && !await this.continueWithIncorrectAccountPrompt(session.account.label, accountToCreate.label));
    }
    this.authenticationMCPServerAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: server.id, name: server.label, allowed: true, url: mcpServerUrl }]);
    this.authenticationMcpServersService.updateAccountPreference(server.id, providerId, session.account);
    this.authenticationMCPServerUsageService.addAccountUsage(providerId, session.account.label, scopes, server.id, server.label);
    this._serverAuthTracking.track(providerId, serverId, scopes, authContext);
    return session.accessToken;
  }
  async continueWithIncorrectAccountPrompt(chosenAccountLabel, requestedAccountLabel) {
    const result = await this.dialogService.prompt({
      message: nls.localize("incorrectAccount", "Incorrect account detected"),
      detail: nls.localize("incorrectAccountDetail", "The chosen account, {0}, does not match the requested account, {1}.", chosenAccountLabel, requestedAccountLabel),
      type: Severity.Warning,
      cancelButton: true,
      buttons: [
        {
          label: nls.localize("keep", "Keep {0}", chosenAccountLabel),
          run: () => chosenAccountLabel
        },
        {
          label: nls.localize("loginWith", "Login with {0}", requestedAccountLabel),
          run: () => requestedAccountLabel
        }
      ]
    });
    if (!result.result) {
      throw new CancellationError();
    }
    return result.result === chosenAccountLabel;
  }
  async _onDidChangeAuthSessions(providerId, providerLabel) {
    const serversUsingProvider = this._serverAuthTracking.get(providerId);
    if (!serversUsingProvider) {
      return;
    }
    for (const { serverId, scopes, context } of serversUsingProvider) {
      const server = this._servers.get(serverId);
      const serverDefinition = this._serverDefinitions.get(serverId);
      if (!server || !serverDefinition) {
        continue;
      }
      const state = server.state.get();
      if (state.state !== McpConnectionState.Kind.Running) {
        continue;
      }
      try {
        await this._getSessionForProvider(serverId, serverDefinition, providerId, scopes, context.authorizationServer, true, context.clientId, context.resource, context.audience);
      } catch (e) {
        if (UserInteractionRequiredError.is(e)) {
          server.pushLog(LogLevel.Warning, nls.localize("mcpAuthSessionRemoved", "Authentication session for {0} removed, stopping server", providerLabel));
          server.stop();
        }
      }
    }
  }
  $logMcpAuthSetup(data) {
    this._telemetryService.publicLog2("mcp/authSetup", data);
  }
  async $startMcpGateway(chatSessionResource) {
    const result = await this._mcpGatewayService.createGateway(
      this._extHostContext.extensionHostKind === ExtensionHostKind.Remote,
      chatSessionResource ? URI.revive(chatSessionResource) : void 0
    );
    if (!result) {
      return void 0;
    }
    if (this._store.isDisposed) {
      result.dispose();
      return void 0;
    }
    const gatewayId = generateUuid();
    const store = new DisposableStore();
    store.add(result);
    store.add(result.onDidChangeServers((servers) => {
      this._proxy.$onDidChangeGatewayServers(gatewayId, servers.map((s) => ({ label: s.label, address: s.address })));
    }));
    this._gateways.set(gatewayId, store);
    return {
      servers: result.servers.map((s) => ({ label: s.label, address: s.address })),
      gatewayId
    };
  }
  $disposeMcpGateway(gatewayId) {
    this._gateways.deleteAndDispose(gatewayId);
  }
  async loginPrompt(mcpLabel, providerLabel, recreatingSession) {
    const message = recreatingSession ? nls.localize("confirmRelogin", "The MCP Server Definition '{0}' wants you to authenticate to {1}.", mcpLabel, providerLabel) : nls.localize("confirmLogin", "The MCP Server Definition '{0}' wants to authenticate to {1}.", mcpLabel, providerLabel);
    const buttons = [
      {
        label: nls.localize({ key: "allow", comment: ["&& denotes a mnemonic"] }, "&&Allow"),
        run() {
          return true;
        }
      }
    ];
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message,
      buttons,
      cancelButton: true
    });
    return result ?? false;
  }
  dispose() {
    for (const server of this._servers.values()) {
      server.extHostDispose();
    }
    this._servers.clear();
    this._serverDefinitions.clear();
    this._serverAuthTracking.clear();
    super.dispose();
  }
};
MainThreadMcp = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadMcp),
  __decorateParam(1, IMcpRegistry),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IAuthenticationService),
  __decorateParam(4, IAuthenticationMcpService),
  __decorateParam(5, IAuthenticationMcpAccessService),
  __decorateParam(6, IAuthenticationMcpUsageService),
  __decorateParam(7, IDynamicAuthenticationProviderStorageService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IWorkbenchMcpGatewayService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, ISecretStorageService)
], MainThreadMcp);
class ExtHostMcpServerLaunch extends Disposable {
  constructor(extHostKind, stop, send) {
    super();
    this.stop = stop;
    this.send = send;
    this.state = observableValue("mcpServerState", { state: McpConnectionState.Kind.Starting });
    this._onDidLog = this._register(new Emitter());
    this.onDidLog = this._onDidLog.event;
    this._onDidReceiveMessage = this._register(new Emitter());
    this.onDidReceiveMessage = this._onDidReceiveMessage.event;
    this._register(disposableTimeout(() => {
      this.pushLog(LogLevel.Info, `Starting server from ${extensionHostKindToString(extHostKind)} extension host`);
    }));
  }
  pushLog(level, message) {
    this._onDidLog.fire({ message, level });
  }
  pushMessage(message) {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch (e) {
      this.pushLog(LogLevel.Warning, `Failed to parse message: ${JSON.stringify(message)}`);
    }
    if (parsed) {
      if (Array.isArray(parsed)) {
        parsed.forEach((p) => this._onDidReceiveMessage.fire(p));
      } else {
        this._onDidReceiveMessage.fire(parsed);
      }
    }
  }
  extHostDispose() {
    if (McpConnectionState.isRunning(this.state.get())) {
      this.pushLog(LogLevel.Warning, "Extension host shut down, server will stop.");
      this.state.set({ state: McpConnectionState.Kind.Stopped }, void 0);
    }
    this.dispose();
  }
  dispose() {
    if (McpConnectionState.isRunning(this.state.get())) {
      this.stop();
    }
    super.dispose();
  }
}
class McpServerAuthTracker {
  constructor() {
    // Provider ID -> Array of tracked servers (serverId, scopes, and the auth context to replay)
    this._tracking = /* @__PURE__ */ new Map();
  }
  /**
   * Track authentication for a server with a specific provider.
   * Replaces any existing tracking for this server/provider combination.
   */
  track(providerId, serverId, scopes, context) {
    const servers = this._tracking.get(providerId) || [];
    const filtered = servers.filter((s) => s.serverId !== serverId);
    filtered.push({ serverId, scopes, context });
    this._tracking.set(providerId, filtered);
  }
  /**
   * Remove all authentication tracking for a server across all providers.
   */
  untrack(serverId) {
    for (const [providerId, servers] of this._tracking.entries()) {
      const filtered = servers.filter((s) => s.serverId !== serverId);
      if (filtered.length === 0) {
        this._tracking.delete(providerId);
      } else {
        this._tracking.set(providerId, filtered);
      }
    }
  }
  /**
   * Get all servers using a specific authentication provider.
   */
  get(providerId) {
    return this._tracking.get(providerId);
  }
  /**
   * Clear all tracking data.
   */
  clear() {
    this._tracking.clear();
  }
}
export {
  MainThreadMcp,
  McpServerAuthTracker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZE1jcC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1hcEZpbmRGaXJzdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UsIElQcm9tcHRCdXR0b24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zZWNyZXRzL2NvbW1vbi9zZWNyZXRzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hNY3BHYXRld2F5U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BHYXRld2F5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwTWVzc2FnZVRyYW5zcG9ydCwgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgZXh0ZW5zaW9uUHJlZml4ZWRJZGVudGlmaWVyLCBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbiwgTWNwQ29sbGVjdGlvblNvcnRPcmRlciwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBNY3BTZXJ2ZXJMYXVuY2gsIE1jcFNlcnZlclRyYW5zcG9ydFR5cGUsIE1jcFNlcnZlclRydXN0LCBtY3BPQXV0aENsaWVudFNlY3JldFN0b3JhZ2VLZXksIFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IgfSBmcm9tICcuLi8uLi9jb250cmliL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcEVudGVycHJpc2VNYW5hZ2VkQXV0aElkcENvbmZpZywgbWNwRW50ZXJwcmlzZU1hbmFnZWRBdXRoSWRwU2VjdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWNwL2NvbW1vbi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uLCBBdXRoZW50aWNhdGlvblNlc3Npb25BY2NvdW50LCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3N0S2luZCwgZXh0ZW5zaW9uSG9zdEtpbmRUb1N0cmluZyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RLaW5kLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnRleHQsIGV4dEhvc3ROYW1lZEN1c3RvbWVyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBQcm94aWVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0TWNwU2hhcGUsIElNY3BBdXRoZW50aWNhdGlvbkRldGFpbHMsIElNY3BBdXRoZW50aWNhdGlvbk9wdGlvbnMsIElBdXRoTWV0YWRhdGFTb3VyY2UsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkTWNwU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkTWNwKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRNY3AgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZE1jcFNoYXBlIHtcblxuXHRwcml2YXRlIF9zZXJ2ZXJJZENvdW50ZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlcnMgPSBuZXcgTWFwPG51bWJlciwgRXh0SG9zdE1jcFNlcnZlckxhdW5jaD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VydmVyRGVmaW5pdGlvbnMgPSBuZXcgTWFwPG51bWJlciwgTWNwU2VydmVyRGVmaW5pdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VydmVyQXV0aFRyYWNraW5nID0gbmV3IE1jcFNlcnZlckF1dGhUcmFja2VyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBQcm94aWVkPEV4dEhvc3RNY3BTaGFwZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbGxlY3Rpb25EZWZpbml0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywge1xuXHRcdHNlcnZlcnM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgTWNwU2VydmVyRGVmaW5pdGlvbltdPjtcblx0XHRkaXNwb3NlKCk6IHZvaWQ7XG5cdH0+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nYXRld2F5cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJTWNwUmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBfbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvbk1jcFNlcnZlcnNTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYXV0aGVudGljYXRpb25NQ1BTZXJ2ZXJBY2Nlc3NTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvbk1DUFNlcnZlclVzYWdlU2VydmljZTogSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLFxuXHRcdEBJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlOiBJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaE1jcEdhdGV3YXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21jcEdhdGV3YXlTZXJ2aWNlOiBJV29ya2JlbmNoTWNwR2F0ZXdheVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2VjcmV0U3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VjcmV0U3RvcmFnZVNlcnZpY2U6IElTZWNyZXRTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB0aGlzLl9vbkRpZENoYW5nZUF1dGhTZXNzaW9ucyhlLnByb3ZpZGVySWQsIGUubGFiZWwpKSk7XG5cdFx0Y29uc3QgcHJveHkgPSB0aGlzLl9wcm94eSA9IF9leHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0TWNwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tY3BSZWdpc3RyeS5yZWdpc3RlckRlbGVnYXRlKHtcblx0XHRcdC8vIFByZWZlciBOb2RlLmpzIGV4dGVuc2lvbiBob3N0cyB3aGVuIHRoZXkncmUgYXZhaWxhYmxlLiBObyBDT1JTIGlzc3VlcyBldGMuXG5cdFx0XHRwcmlvcml0eTogX2V4dEhvc3RDb250ZXh0LmV4dGVuc2lvbkhvc3RLaW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlciA/IDAgOiAxLFxuXHRcdFx0d2FpdEZvckluaXRpYWxQcm92aWRlclByb21pc2VzKCkge1xuXHRcdFx0XHRyZXR1cm4gcHJveHkuJHdhaXRGb3JJbml0aWFsQ29sbGVjdGlvblByb3ZpZGVycygpO1xuXHRcdFx0fSxcblx0XHRcdGNhblN0YXJ0KGNvbGxlY3Rpb24sIHNlcnZlckRlZmluaXRpb24pIHtcblx0XHRcdFx0aWYgKGNvbGxlY3Rpb24ucmVtb3RlQXV0aG9yaXR5ICE9PSBfZXh0SG9zdENvbnRleHQucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZXJ2ZXJEZWZpbml0aW9uLmxhdW5jaC50eXBlID09PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvICYmIF9leHRIb3N0Q29udGV4dC5leHRlbnNpb25Ib3N0S2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxXZWJXb3JrZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgc3Vic3RpdHV0ZVZhcmlhYmxlcyhzZXJ2ZXJEZWZpbml0aW9uLCBsYXVuY2gpIHtcblx0XHRcdFx0Y29uc3Qgc2VyID0gYXdhaXQgcHJveHkuJHN1YnN0aXR1dGVWYXJpYWJsZXMoc2VydmVyRGVmaW5pdGlvbi52YXJpYWJsZVJlcGxhY2VtZW50Py5mb2xkZXI/LnVyaSwgTWNwU2VydmVyTGF1bmNoLnRvU2VyaWFsaXplZChsYXVuY2gpKTtcblx0XHRcdFx0cmV0dXJuIE1jcFNlcnZlckxhdW5jaC5mcm9tU2VyaWFsaXplZChzZXIpO1xuXHRcdFx0fSxcblx0XHRcdHN0YXJ0OiAoX2NvbGxlY3Rpb24sIHNlcnZlckRlZmluaXRvbiwgcmVzb2x2ZUxhdW5jaCwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRjb25zdCBpZCA9ICsrdGhpcy5fc2VydmVySWRDb3VudGVyO1xuXHRcdFx0XHRjb25zdCBsYXVuY2ggPSBuZXcgRXh0SG9zdE1jcFNlcnZlckxhdW5jaChcblx0XHRcdFx0XHRfZXh0SG9zdENvbnRleHQuZXh0ZW5zaW9uSG9zdEtpbmQsXG5cdFx0XHRcdFx0KCkgPT4gcHJveHkuJHN0b3BNY3AoaWQpLFxuXHRcdFx0XHRcdG1zZyA9PiBwcm94eS4kc2VuZE1lc3NhZ2UoaWQsIEpTT04uc3RyaW5naWZ5KG1zZykpLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aGlzLl9zZXJ2ZXJzLnNldChpZCwgbGF1bmNoKTtcblx0XHRcdFx0dGhpcy5fc2VydmVyRGVmaW5pdGlvbnMuc2V0KGlkLCBzZXJ2ZXJEZWZpbml0b24pO1xuXHRcdFx0XHRwcm94eS4kc3RhcnRNY3AoaWQsIHtcblx0XHRcdFx0XHRsYXVuY2g6IHJlc29sdmVMYXVuY2gsXG5cdFx0XHRcdFx0ZGVmYXVsdEN3ZDogc2VydmVyRGVmaW5pdG9uLnZhcmlhYmxlUmVwbGFjZW1lbnQ/LmZvbGRlcj8udXJpLFxuXHRcdFx0XHRcdGVycm9yT25Vc2VySW50ZXJhY3Rpb246IG9wdGlvbnM/LmVycm9yT25Vc2VySW50ZXJhY3Rpb24sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiBsYXVuY2g7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdC8vIFN1YnNjcmliZSB0byBNQ1Agc2VydmVyIGRlZmluaXRpb24gY2hhbmdlcyBhbmQgbm90aWZ5IGV4dCBob3N0XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9uc1RyaWdnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9wdWJsaXNoU2VydmVyRGVmaW5pdGlvbnMoKSwgNTAwKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY29sbGVjdGlvbnMgPSB0aGlzLl9tY3BSZWdpc3RyeS5jb2xsZWN0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHQvLyBSZWFkIGFsbCBzZXJ2ZXIgZGVmaW5pdGlvbnMgdG8gdHJhY2sgY2hhbmdlc1xuXHRcdFx0Zm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIGNvbGxlY3Rpb25zKSB7XG5cdFx0XHRcdGNvbGxlY3Rpb24uc2VydmVyRGVmaW5pdGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gTm90aWZ5IGV4dCBob3N0IHRoYXQgZGVmaW5pdGlvbnMgY2hhbmdlZCAoaXQgd2lsbCByZS1mZXRjaCBpZiBuZWVkZWQpXG5cdFx0XHRpZiAoIW9uRGlkQ2hhbmdlTWNwU2VydmVyRGVmaW5pdGlvbnNUcmlnZ2VyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0b25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9uc1RyaWdnZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRvbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zVHJpZ2dlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVibGlzaFNlcnZlckRlZmluaXRpb25zKCkge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb25zID0gdGhpcy5fbWNwUmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCk7XG5cdFx0Y29uc3QgYWxsU2VydmVyczogTWNwU2VydmVyRGVmaW5pdGlvbi5TZXJpYWxpemVkW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgY29sbGVjdGlvbiBvZiBjb2xsZWN0aW9ucykge1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IGNvbGxlY3Rpb24uc2VydmVyRGVmaW5pdGlvbnMuZ2V0KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRcdGFsbFNlcnZlcnMucHVzaChNY3BTZXJ2ZXJEZWZpbml0aW9uLnRvU2VyaWFsaXplZChzZXJ2ZXIpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9ucyhhbGxTZXJ2ZXJzKTtcblx0fVxuXG5cdCR1cHNlcnRNY3BDb2xsZWN0aW9uKGNvbGxlY3Rpb246IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uLkZyb21FeHRIb3N0LCBzZXJ2ZXJzRHRvOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLlNlcmlhbGl6ZWRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlcnZlcnMgPSBzZXJ2ZXJzRHRvLm1hcChNY3BTZXJ2ZXJEZWZpbml0aW9uLmZyb21TZXJpYWxpemVkKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NvbGxlY3Rpb25EZWZpbml0aW9ucy5nZXQoY29sbGVjdGlvbi5pZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy5zZXJ2ZXJzLnNldChzZXJ2ZXJzLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzZXJ2ZXJEZWZpbml0aW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBNY3BTZXJ2ZXJEZWZpbml0aW9uW10+KCdtY3BTZXJ2ZXJzJywgc2VydmVycyk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKGNvbGxlY3Rpb24uZXh0ZW5zaW9uSWQpO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBzdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdFx0Y29uc3QgcmVnaXN0ZXIgPSAoKSA9PiB7XG5cdFx0XHRcdGhhbmRsZS52YWx1ZSA/Pz0gdGhpcy5fbWNwUmVnaXN0cnkucmVnaXN0ZXJDb2xsZWN0aW9uKHtcblx0XHRcdFx0XHQuLi5jb2xsZWN0aW9uLFxuXHRcdFx0XHRcdHNvdXJjZTogZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdFx0b3JkZXI6IE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIuRXh0ZW5zaW9uLFxuXHRcdFx0XHRcdHJlc29sdmVTZXJ2ZXJMYW5jaDogY29sbGVjdGlvbi5jYW5SZXNvbHZlTGF1bmNoID8gKGFzeW5jIGRlZiA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCByID0gYXdhaXQgdGhpcy5fcHJveHkuJHJlc29sdmVNY3BMYXVuY2goY29sbGVjdGlvbi5pZCwgZGVmLmxhYmVsKTtcblx0XHRcdFx0XHRcdHJldHVybiByID8gTWNwU2VydmVyTGF1bmNoLmZyb21TZXJpYWxpemVkKHIpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH0pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRydXN0QmVoYXZpb3I6IGNvbGxlY3Rpb24uaXNUcnVzdGVkQnlEZWZhdWx0ID8gTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkIDogTWNwU2VydmVyVHJ1c3QuS2luZC5UcnVzdGVkT25Ob25jZSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMuX2V4dEhvc3RDb250ZXh0LnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHRzZXJ2ZXJEZWZpbml0aW9ucyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB3aGVuQ2xhdXNlU3RyID0gbWFwRmluZEZpcnN0KHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucywgZSA9PlxuXHRcdFx0XHRFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHRlbnNpb25JZCwgZS5pZGVudGlmaWVyKVxuXHRcdFx0XHRcdD8gZS5jb250cmlidXRlcz8ubWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVycz8uZmluZChwID0+IGV4dGVuc2lvblByZWZpeGVkSWRlbnRpZmllcihleHRlbnNpb25JZCwgcC5pZCkgPT09IGNvbGxlY3Rpb24uaWQpPy53aGVuXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgd2hlbkNsYXVzZSA9IHdoZW5DbGF1c2VTdHIgJiYgQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUod2hlbkNsYXVzZVN0cik7XG5cblx0XHRcdGlmICghd2hlbkNsYXVzZSkge1xuXHRcdFx0XHRyZWdpc3RlcigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZXZhbHVhdGUgPSAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMod2hlbkNsYXVzZSkpIHtcblx0XHRcdFx0XHRcdHJlZ2lzdGVyKCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGhhbmRsZS5jbGVhcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5fY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGV2YWx1YXRlKSk7XG5cdFx0XHRcdGV2YWx1YXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2NvbGxlY3Rpb25EZWZpbml0aW9ucy5zZXQoY29sbGVjdGlvbi5pZCwge1xuXHRcdFx0XHRzZXJ2ZXJzOiBzZXJ2ZXJEZWZpbml0aW9ucyxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0JGRlbGV0ZU1jcENvbGxlY3Rpb24oY29sbGVjdGlvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb2xsZWN0aW9uRGVmaW5pdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShjb2xsZWN0aW9uSWQpO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlU3RhdGUoaWQ6IG51bWJlciwgdXBkYXRlOiBNY3BDb25uZWN0aW9uU3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLl9zZXJ2ZXJzLmdldChpZCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzZXJ2ZXIuc3RhdGUuc2V0KHVwZGF0ZSwgdW5kZWZpbmVkKTtcblx0XHRpZiAoIU1jcENvbm5lY3Rpb25TdGF0ZS5pc1J1bm5pbmcodXBkYXRlKSkge1xuXHRcdFx0c2VydmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3NlcnZlcnMuZGVsZXRlKGlkKTtcblx0XHRcdHRoaXMuX3NlcnZlckRlZmluaXRpb25zLmRlbGV0ZShpZCk7XG5cdFx0XHR0aGlzLl9zZXJ2ZXJBdXRoVHJhY2tpbmcudW50cmFjayhpZCk7XG5cdFx0fVxuXHR9XG5cblx0JG9uRGlkUHVibGlzaExvZyhpZDogbnVtYmVyLCBsZXZlbDogTG9nTGV2ZWwsIGxvZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBsZXZlbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGxldmVsID0gTG9nTGV2ZWwuSW5mbztcblx0XHRcdGxvZyA9IGxldmVsIGFzIHVua25vd24gYXMgc3RyaW5nO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlcnZlcnMuZ2V0KGlkKT8ucHVzaExvZyhsZXZlbCwgbG9nKTtcblx0fVxuXG5cdCRvbkRpZFJlY2VpdmVNZXNzYWdlKGlkOiBudW1iZXIsIG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3NlcnZlcnMuZ2V0KGlkKT8ucHVzaE1lc3NhZ2UobWVzc2FnZSk7XG5cdH1cblxuXHRhc3luYyAkZ2V0VG9rZW5Gb3JQcm92aWRlcklkKGlkOiBudW1iZXIsIHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSwgb3B0aW9uczogSU1jcEF1dGhlbnRpY2F0aW9uT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLl9zZXJ2ZXJEZWZpbml0aW9ucy5nZXQoaWQpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0U2Vzc2lvbkZvclByb3ZpZGVyKGlkLCBzZXJ2ZXIsIHByb3ZpZGVySWQsIHNjb3BlcywgdW5kZWZpbmVkLCBvcHRpb25zLmVycm9yT25Vc2VySW50ZXJhY3Rpb24sIG9wdGlvbnMuY2xpZW50SWQpO1xuXHR9XG5cblx0YXN5bmMgJGdldFRva2VuRnJvbVNlcnZlck1ldGFkYXRhKGlkOiBudW1iZXIsIGF1dGhEZXRhaWxzOiBJTWNwQXV0aGVudGljYXRpb25EZXRhaWxzLCB7IGVycm9yT25Vc2VySW50ZXJhY3Rpb24sIGZvcmNlTmV3UmVnaXN0cmF0aW9uLCBjbGllbnRJZCB9OiBJTWNwQXV0aGVudGljYXRpb25PcHRpb25zID0ge30pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuX3NlcnZlckRlZmluaXRpb25zLmdldChpZCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSBVUkkucmV2aXZlKGF1dGhEZXRhaWxzLmF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXHRcdGNvbnN0IHJlc291cmNlU2VydmVyID0gYXV0aERldGFpbHMucmVzb3VyY2VNZXRhZGF0YT8ucmVzb3VyY2UgPyBVUkkucGFyc2UoYXV0aERldGFpbHMucmVzb3VyY2VNZXRhZGF0YS5yZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVzb2x2ZWRTY29wZXMgPSBhdXRoRGV0YWlscy5zY29wZXMgPz8gYXV0aERldGFpbHMucmVzb3VyY2VNZXRhZGF0YT8uc2NvcGVzX3N1cHBvcnRlZCA/PyBhdXRoRGV0YWlscy5hdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEuc2NvcGVzX3N1cHBvcnRlZCA/PyBbXTtcblxuXHRcdC8vIEVudGVycHJpc2UtbWFuYWdlZCBzZXJ2ZXJzIHJvdXRlIHRocm91Z2ggYW4gWEFBIC8gSUQtSkFHIHByb3ZpZGVyIGtleWVkIGJ5IHRoZSB1c2VyLWNvbmZpZ3VyZWRcblx0XHQvLyBTU08gaXNzdWVyIGluc3RlYWQgb2YgZG9pbmcgYSBwZXItc2VydmVyIERDUiBhZ2FpbnN0IHRoZSByZXNvdXJjZSdzIGF1dGhvcml6YXRpb24gc2VydmVyLlxuXHRcdGlmIChhdXRoRGV0YWlscy5lbnRlcnByaXNlTWFuYWdlZCkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBhdXRoRGV0YWlscy5yZXNvdXJjZU1ldGFkYXRhPy5yZXNvdXJjZTtcblx0XHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnbWNwLmVudGVycHJpc2VNYW5hZ2VkLm1pc3NpbmdSZXNvdXJjZScsIFwiVGhlIGVudGVycHJpc2UtbWFuYWdlZCBNQ1Agc2VydmVyICd7MH0nIGRpZCBub3QgYWR2ZXJ0aXNlIGEgcHJvdGVjdGVkLXJlc291cmNlIG1ldGFkYXRhIGRvY3VtZW50IHdpdGggYSAncmVzb3VyY2UnIGlkZW50aWZpZXIuXCIsIHNlcnZlci5sYWJlbCkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUGVyIElELUpBRyAoZHJhZnQtaWV0Zi1vYXV0aC1pZGVudGl0eS1hc3NlcnRpb24tYXV0aHotZ3JhbnQpLCB0aGUgdG9rZW4gZXhjaGFuZ2Vcblx0XHRcdC8vIGBhdWRpZW5jZWAgaXMgdGhlICphdXRob3JpemF0aW9uIHNlcnZlciogb2YgdGhlIHJlc291cmNlIFx1MjAxNCBpLmUuIHRoZSBpc3N1ZXIgdGhhdCB3aWxsXG5cdFx0XHQvLyByZWRlZW0gdGhlIElELUpBRyBhc3NlcnRpb24uIFdlIHBpY2sgdGhlIGZpcnN0IHNlcnZlciBhZHZlcnRpc2VkIGJ5IHRoZSByZXNvdXJjZSdzXG5cdFx0XHQvLyBvYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UgbWV0YWRhdGEuXG5cdFx0XHRjb25zdCByZXNvdXJjZUF1dGhTZXJ2ZXJzID0gYXV0aERldGFpbHMucmVzb3VyY2VNZXRhZGF0YT8uYXV0aG9yaXphdGlvbl9zZXJ2ZXJzID8/IFtdO1xuXHRcdFx0Y29uc3QgYXVkaWVuY2UgPSByZXNvdXJjZUF1dGhTZXJ2ZXJzWzBdO1xuXHRcdFx0aWYgKCFhdWRpZW5jZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWQubWlzc2luZ0FTJywgXCJUaGUgZW50ZXJwcmlzZS1tYW5hZ2VkIE1DUCBzZXJ2ZXIgJ3swfScgZGlkIG5vdCBhZHZlcnRpc2UgYW4gYGF1dGhvcml6YXRpb25fc2VydmVyc2AgZW50cnkgaW4gaXRzIHByb3RlY3RlZC1yZXNvdXJjZSBtZXRhZGF0YS5cIiwgc2VydmVyLmxhYmVsKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBGb3IgWEFBIHRoZSBzY29wZXMgc2VudCB0byB0aGUgSWRQIHRva2VuLWV4Y2hhbmdlIHN0ZXAgYXJlIHRoZSAqcmVzb3VyY2UqIHNjb3Blc1xuXHRcdFx0Ly8gKGUuZy4gXCJ0b2Rvcy5yZWFkIG1jcC5hY2Nlc3NcIiksIE5PVCB0aGUgSWRQIGxvZ2luIHNjb3BlcyAob3BlbmlkL29mZmxpbmVfYWNjZXNzL1x1MjAyNikuXG5cdFx0XHQvLyBgcmVzb2x2ZWRTY29wZXNgIG1heSBoYXZlIGZhbGxlbiB0aHJvdWdoIHRvIGBhdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEuc2NvcGVzX3N1cHBvcnRlZGBcblx0XHRcdC8vIHdoaWNoIGlzIHRoZSBJZFAncyBtZXRhZGF0YSBcdTIwMTQgd3JvbmcgZm9yIHRoaXMgc3RlcC4gVXNlIG9ubHkgdGhlIHNjb3BlcyBkZXJpdmVkIGZyb20gdGhlXG5cdFx0XHQvLyBXV1ctQXV0aGVudGljYXRlIGNoYWxsZW5nZSBvciB0aGUgcmVzb3VyY2UncyBvd24gbWV0YWRhdGEuXG5cdFx0XHRjb25zdCB4YWFTY29wZXMgPSBhdXRoRGV0YWlscy5zY29wZXMgPz8gYXV0aERldGFpbHMucmVzb3VyY2VNZXRhZGF0YT8uc2NvcGVzX3N1cHBvcnRlZCA/PyBbXTtcblx0XHRcdGNvbnN0IGlzc3VlciA9IHRoaXMuX2Vuc3VyZVhhYUlzc3VlcigpO1xuXHRcdFx0Y29uc3QgeGFhUHJvdmlkZXJJZCA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVPckdldFhhYVByb3ZpZGVyKGlzc3Vlcik7XG5cdFx0XHRpZiAoIXhhYVByb3ZpZGVySWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc291cmNlQ2xpZW50SWQgPSBjbGllbnRJZCA/PyBhdXRoRGV0YWlscy5jbGllbnRJZDtcblx0XHRcdC8vIFJlc29sdmUgdGhlIHJlc291cmNlLUFTIGNsaWVudCBzZWNyZXQgZnJvbSBzZWNyZXQgc3RvcmFnZSwga2V5ZWQgYnkgdGhlIHJlc291cmNlIGluZGljYXRvclxuXHRcdFx0Ly8gKyB0aGUgY29uZmlndXJlZCByZXNvdXJjZSBjbGllbnRfaWQuIFNldCB2aWEgdGhlIFwiU2V0IENsaWVudCBTZWNyZXRcIiBjb2RlIGxlbnMgYWJvdmVcblx0XHRcdC8vIGBvYXV0aC5jbGllbnRJZGAgaW4gbWNwLmpzb24gKHRoZSBzZXJ2ZXIgVVJMIGVxdWFscyB0aGUgcmVzb3VyY2UgaW5kaWNhdG9yIHBlciBSRkMgOTQ3MCkuXG5cdFx0XHQvLyBVc2luZyBgcmVzb3VyY2VgIChub3QgdGhlIHNlcnZlciBsYXVuY2ggVVJJKSBlbnN1cmVzIHRoZSBrZXkgbWF0Y2hlcyB3aGF0IHRoZSBwcm9tcHRcblx0XHRcdC8vIHdyaXRlcyBpbiAkcHJvbXB0Rm9yUmVzb3VyY2VDbGllbnRTZWNyZXQsIHNvIHByb21wdGVkIHNlY3JldHMgc3Vydml2ZSB3aW5kb3cgcmVsb2FkLlxuXHRcdFx0bGV0IHJlc291cmNlQ2xpZW50U2VjcmV0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocmVzb3VyY2VDbGllbnRJZCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJlc291cmNlQ2xpZW50U2VjcmV0ID0gYXdhaXQgdGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2UuZ2V0KG1jcE9BdXRoQ2xpZW50U2VjcmV0U3RvcmFnZUtleShyZXNvdXJjZSwgcmVzb3VyY2VDbGllbnRJZCkpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBCZXN0LWVmZm9ydCBsb29rdXA7IGZhbGwgdGhyb3VnaC5cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX2dldFNlc3Npb25Gb3JQcm92aWRlcihpZCwgc2VydmVyLCB4YWFQcm92aWRlcklkLCB4YWFTY29wZXMsIGlzc3VlciwgZXJyb3JPblVzZXJJbnRlcmFjdGlvbiwgcmVzb3VyY2VDbGllbnRJZCwgcmVzb3VyY2UsIGF1ZGllbmNlLCByZXNvdXJjZUNsaWVudFNlY3JldCk7XG5cdFx0fVxuXG5cdFx0bGV0IHByb3ZpZGVySWQgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIoYXV0aG9yaXphdGlvblNlcnZlciwgcmVzb3VyY2VTZXJ2ZXIpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWRDbGllbnRJZCA9IGNsaWVudElkID8/IGF1dGhEZXRhaWxzLmNsaWVudElkO1xuXHRcdGNvbnN0IG1jcFNlcnZlclVybCA9IHNlcnZlci5sYXVuY2gudHlwZSA9PT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5IVFRQID8gc2VydmVyLmxhdW5jaC51cmkudG9TdHJpbmcodHJ1ZSkgOiB1bmRlZmluZWQ7XG5cdFx0bGV0IGNsaWVudFNlY3JldDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkaWRMb29rdXBDbGllbnRTZWNyZXQgPSBmYWxzZTtcblx0XHRpZiAocmVzb2x2ZWRDbGllbnRJZCAmJiBtY3BTZXJ2ZXJVcmwpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNsaWVudFNlY3JldCA9IGF3YWl0IHRoaXMuX3NlY3JldFN0b3JhZ2VTZXJ2aWNlLmdldChtY3BPQXV0aENsaWVudFNlY3JldFN0b3JhZ2VLZXkobWNwU2VydmVyVXJsLCByZXNvbHZlZENsaWVudElkKSk7XG5cdFx0XHRcdGRpZExvb2t1cENsaWVudFNlY3JldCA9IHRydWU7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gQmVzdC1lZmZvcnQgbG9va3VwOyBwcm9jZWVkIHdpdGhvdXQgYSBjbGllbnQgc2VjcmV0LlxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIHRoZSB1c2VyIGV4cGxpY2l0bHkgY29uZmlndXJlZCBhbiBPQXV0aCBjbGllbnRfaWQgaW4gbWNwLmpzb24gYW5kIHRoZSBzdG9yZWRcblx0XHQvLyBjbGllbnQgc2VjcmV0IGRpZmZlcnMgZnJvbSB3aGF0IHRoZSBleGlzdGluZyBwcm92aWRlciB3YXMgcmVnaXN0ZXJlZCB3aXRoLCBmb3JjZSBhXG5cdFx0Ly8gcmUtcmVnaXN0cmF0aW9uIHNvIHRoZSBuZXcgc2VjcmV0IHRha2VzIGVmZmVjdCBvbiBzdWJzZXF1ZW50IHRva2VuIGV4Y2hhbmdlcy5cblx0XHQvLyBXaXRob3V0IHRoaXMsIHRoZSB1c2VyIGNhbiBuZXZlciByZXBsYWNlIGEgY2FjaGVkIGNsaWVudCBzZWNyZXQgaW4gdGhlIGV4dGVuc2lvblxuXHRcdC8vIGhvc3QncyBEeW5hbWljQXV0aFByb3ZpZGVyIGFmdGVyIHRoZSBwcm92aWRlciBoYXMgYmVlbiByZWdpc3RlcmVkLlxuXHRcdGlmIChkaWRMb29rdXBDbGllbnRTZWNyZXQgJiYgcHJvdmlkZXJJZCAmJiAhZm9yY2VOZXdSZWdpc3RyYXRpb24gJiYgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXJJZCkpIHtcblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBhd2FpdCB0aGlzLl9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLmdldENsaWVudFJlZ2lzdHJhdGlvbihwcm92aWRlcklkKTtcblx0XHRcdGlmIChyZWdpc3RlcmVkICYmIHJlZ2lzdGVyZWQuY2xpZW50U2VjcmV0ICE9PSBjbGllbnRTZWNyZXQpIHtcblx0XHRcdFx0Zm9yY2VOZXdSZWdpc3RyYXRpb24gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChmb3JjZU5ld1JlZ2lzdHJhdGlvbiAmJiBwcm92aWRlcklkKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5pc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVySWQpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZvcmNlIG5ldyByZWdpc3RyYXRpb24gZm9yIGEgbm9uLWR5bmFtaWMgYXV0aGVudGljYXRpb24gcHJvdmlkZXIuJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UudW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXJJZCk7XG5cdFx0XHQvLyBUT0RPOiBFbmNhcHN1bGF0ZSB0aGlzIGFuZCB0aGUgdW5yZWdpc3RlciBpbiBvbmUgY2FsbCBpbiB0aGUgYXV0aCBzZXJ2aWNlXG5cdFx0XHRhd2FpdCB0aGlzLl9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLnJlbW92ZUR5bmFtaWNQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRcdHByb3ZpZGVySWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFwcm92aWRlcklkKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcihhdXRob3JpemF0aW9uU2VydmVyLCBhdXRoRGV0YWlscy5hdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsIGF1dGhEZXRhaWxzLnJlc291cmNlTWV0YWRhdGEsIHJlc29sdmVkQ2xpZW50SWQsIGNsaWVudFNlY3JldCk7XG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRwcm92aWRlcklkID0gcHJvdmlkZXIuaWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2dldFNlc3Npb25Gb3JQcm92aWRlcihpZCwgc2VydmVyLCBwcm92aWRlcklkLCByZXNvbHZlZFNjb3BlcywgYXV0aG9yaXphdGlvblNlcnZlciwgZXJyb3JPblVzZXJJbnRlcmFjdGlvbiwgcmVzb2x2ZWRDbGllbnRJZCwgYXV0aERldGFpbHMucmVzb3VyY2VNZXRhZGF0YT8ucmVzb3VyY2UsIC8qIGF1ZGllbmNlICovIHVuZGVmaW5lZCwgY2xpZW50U2VjcmV0KTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVhhYUlzc3VlcigpOiBVUkkge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElNY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBDb25maWcgfCB1bmRlZmluZWQ+KG1jcEVudGVycHJpc2VNYW5hZ2VkQXV0aElkcFNlY3Rpb24pID8/IHt9O1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRJc3N1ZXIgPSBjb25maWcuaXNzdWVyPy50cmltKCk7XG5cdFx0aWYgKCFjb25maWd1cmVkSXNzdWVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWQuaXNzdWVyTWlzc2luZycsIFwiRW50ZXJwcmlzZS1tYW5hZ2VkIE1DUCBhdXRoZW50aWNhdGlvbiByZXF1aXJlcyBgbWNwLmVudGVycHJpc2VNYW5hZ2VkQXV0aC5pZHAuaXNzdWVyYCB0byBiZSBjb25maWd1cmVkLiBTZXQgaXQgdmlhIGVudGVycHJpc2UgcG9saWN5IChXaW5kb3dzIEdyb3VwIFBvbGljeSAvIG1hY09TIG1hbmFnZWQgcHJlZmVyZW5jZXMgLyBMaW51eCBgL2V0Yy92c2NvZGUvcG9saWN5Lmpzb25gKSBvciwgZm9yIGxvY2FsIHRlc3RpbmcsIGJ5IGhhbmQtZWRpdGluZyBgc2V0dGluZ3MuanNvbmAuXCIpKTtcblx0XHR9XG5cdFx0bGV0IHBhcnNlZDogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHRwYXJzZWQgPSBVUkkucGFyc2UoY29uZmlndXJlZElzc3Vlcik7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWQuaXNzdWVySW52YWxpZCcsIFwiRW50ZXJwcmlzZS1tYW5hZ2VkIE1DUCBhdXRoZW50aWNhdGlvbiByZXF1aXJlcyBgbWNwLmVudGVycHJpc2VNYW5hZ2VkQXV0aC5pZHAuaXNzdWVyYCB0byBiZSBhIHZhbGlkIFVSTDsgZ290ICd7MH0nLlwiLCBjb25maWd1cmVkSXNzdWVyKSk7XG5cdFx0fVxuXHRcdGlmIChwYXJzZWQuc2NoZW1lICE9PSAnaHR0cHMnICYmIHBhcnNlZC5zY2hlbWUgIT09ICdodHRwJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnbWNwLmVudGVycHJpc2VNYW5hZ2VkLmlzc3Vlck5vdEh0dHAnLCBcIkVudGVycHJpc2UtbWFuYWdlZCBNQ1AgYXV0aGVudGljYXRpb24gcmVxdWlyZXMgYG1jcC5lbnRlcnByaXNlTWFuYWdlZEF1dGguaWRwLmlzc3VlcmAgdG8gdXNlIHRoZSBgaHR0cHNgIG9yIGBodHRwYCBzY2hlbWU7IGdvdCAnezB9Jy5cIiwgY29uZmlndXJlZElzc3VlcikpO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFyc2VkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U2Vzc2lvbkZvclByb3ZpZGVyKFxuXHRcdHNlcnZlcklkOiBudW1iZXIsXG5cdFx0c2VydmVyOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLFxuXHRcdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0XHRzY29wZXM6IHN0cmluZ1tdLFxuXHRcdGF1dGhvcml6YXRpb25TZXJ2ZXI/OiBVUkksXG5cdFx0ZXJyb3JPblVzZXJJbnRlcmFjdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuXHRcdGNsaWVudElkPzogc3RyaW5nLFxuXHRcdHJlc291cmNlPzogc3RyaW5nLFxuXHRcdGF1ZGllbmNlPzogc3RyaW5nLFxuXHRcdGNsaWVudFNlY3JldD86IHN0cmluZyxcblx0KTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhdXRoQ29udGV4dDogSU1jcFNlcnZlckF1dGhDb250ZXh0ID0geyBhdXRob3JpemF0aW9uU2VydmVyLCBjbGllbnRJZCwgcmVzb3VyY2UsIGF1ZGllbmNlIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXJJZCwgc2NvcGVzLCB7IGF1dGhvcml6YXRpb25TZXJ2ZXIsIGNsaWVudElkLCBjbGllbnRTZWNyZXQsIHJlc291cmNlLCBhdWRpZW5jZSB9LCB0cnVlKTtcblx0XHQvLyBPbmx5IEhUVFAgc2VydmVycyBhdXRoZW50aWNhdGUsIHNvIHRoZSBzZXJ2ZXIgVVJMIGlzIGFsd2F5cyBrbm93biBoZXJlLiBBIHRva2VuIGlzIG9ubHkgcmVsZWFzZWRcblx0XHQvLyB0byBhIHNlcnZlciB3aG9zZSBjdXJyZW50IFVSTCBtYXRjaGVzIHRoZSBvbmUgdGhlIHVzZXIgY29uc2VudGVkIHRvLCBzbyBjaGFuZ2luZyB0aGUgVVJMIHdoaWxlXG5cdFx0Ly8ga2VlcGluZyB0aGUgc2FtZSBpZCByZXF1aXJlcyByZS1jb25zZW50LlxuXHRcdGlmIChzZXJ2ZXIubGF1bmNoLnR5cGUgIT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuSFRUUCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbWNwU2VydmVyVXJsID0gc2VydmVyLmxhdW5jaC51cmkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgYWNjb3VudE5hbWVQcmVmZXJlbmNlID0gdGhpcy5hdXRoZW50aWNhdGlvbk1jcFNlcnZlcnNTZXJ2aWNlLmdldEFjY291bnRQcmVmZXJlbmNlKHNlcnZlci5pZCwgcHJvdmlkZXJJZCk7XG5cdFx0bGV0IG1hdGNoaW5nQWNjb3VudFByZWZlcmVuY2VTZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGFjY291bnROYW1lUHJlZmVyZW5jZSkge1xuXHRcdFx0bWF0Y2hpbmdBY2NvdW50UHJlZmVyZW5jZVNlc3Npb24gPSBzZXNzaW9ucy5maW5kKHNlc3Npb24gPT4gc2Vzc2lvbi5hY2NvdW50LmxhYmVsID09PSBhY2NvdW50TmFtZVByZWZlcmVuY2UpO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRsZXQgc2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uO1xuXHRcdGlmIChzZXNzaW9ucy5sZW5ndGgpIHtcblx0XHRcdC8vIElmIHdlIGhhdmUgYW4gZXhpc3Rpbmcgc2Vzc2lvbiBwcmVmZXJlbmNlLCB1c2UgdGhhdC4gSWYgbm90LCB3ZSdsbCByZXR1cm4gYW55IHZhbGlkIHNlc3Npb24gYXQgdGhlIGVuZCBvZiB0aGlzIGZ1bmN0aW9uLlxuXHRcdFx0aWYgKG1hdGNoaW5nQWNjb3VudFByZWZlcmVuY2VTZXNzaW9uICYmIHRoaXMuYXV0aGVudGljYXRpb25NQ1BTZXJ2ZXJBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZEZvclVybChwcm92aWRlcklkLCBtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBzZXJ2ZXIuaWQsIG1jcFNlcnZlclVybCkpIHtcblx0XHRcdFx0dGhpcy5hdXRoZW50aWNhdGlvbk1DUFNlcnZlclVzYWdlU2VydmljZS5hZGRBY2NvdW50VXNhZ2UocHJvdmlkZXJJZCwgbWF0Y2hpbmdBY2NvdW50UHJlZmVyZW5jZVNlc3Npb24uYWNjb3VudC5sYWJlbCwgc2NvcGVzLCBzZXJ2ZXIuaWQsIHNlcnZlci5sYWJlbCk7XG5cdFx0XHRcdHRoaXMuX3NlcnZlckF1dGhUcmFja2luZy50cmFjayhwcm92aWRlcklkLCBzZXJ2ZXJJZCwgc2NvcGVzLCBhdXRoQ29udGV4dCk7XG5cdFx0XHRcdHJldHVybiBtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbi5hY2Nlc3NUb2tlbjtcblx0XHRcdH1cblx0XHRcdC8vIElmIHdlIG9ubHkgaGF2ZSBvbmUgYWNjb3VudCBmb3IgYSBzaW5nbGUgYXV0aCBwcm92aWRlciwgbGV0cyBqdXN0IGNoZWNrIGlmIGl0J3MgYWxsb3dlZCBhbmQgcmV0dXJuIGl0IGlmIGl0IGlzLlxuXHRcdFx0aWYgKCFwcm92aWRlci5zdXBwb3J0c011bHRpcGxlQWNjb3VudHMgJiYgdGhpcy5hdXRoZW50aWNhdGlvbk1DUFNlcnZlckFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkRm9yVXJsKHByb3ZpZGVySWQsIHNlc3Npb25zWzBdLmFjY291bnQubGFiZWwsIHNlcnZlci5pZCwgbWNwU2VydmVyVXJsKSkge1xuXHRcdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uTUNQU2VydmVyVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShwcm92aWRlcklkLCBzZXNzaW9uc1swXS5hY2NvdW50LmxhYmVsLCBzY29wZXMsIHNlcnZlci5pZCwgc2VydmVyLmxhYmVsKTtcblx0XHRcdFx0dGhpcy5fc2VydmVyQXV0aFRyYWNraW5nLnRyYWNrKHByb3ZpZGVySWQsIHNlcnZlcklkLCBzY29wZXMsIGF1dGhDb250ZXh0KTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb25zWzBdLmFjY2Vzc1Rva2VuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlcnJvck9uVXNlckludGVyYWN0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvcignYXV0aGVudGljYXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0FsbG93ZWQgPSBhd2FpdCB0aGlzLmxvZ2luUHJvbXB0KHNlcnZlci5sYWJlbCwgcHJvdmlkZXIubGFiZWwsIGZhbHNlKTtcblx0XHRpZiAoIWlzQWxsb3dlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVc2VyIGRpZCBub3QgY29uc2VudCB0byBsb2dpbi4nKTtcblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRpZiAocHJvdmlkZXIuc3VwcG9ydHNNdWx0aXBsZUFjY291bnRzICYmIGVycm9yT25Vc2VySW50ZXJhY3Rpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IoJ2F1dGhlbnRpY2F0aW9uJyk7XG5cdFx0XHR9XG5cdFx0XHRzZXNzaW9uID0gcHJvdmlkZXIuc3VwcG9ydHNNdWx0aXBsZUFjY291bnRzXG5cdFx0XHRcdD8gYXdhaXQgdGhpcy5hdXRoZW50aWNhdGlvbk1jcFNlcnZlcnNTZXJ2aWNlLnNlbGVjdFNlc3Npb24ocHJvdmlkZXJJZCwgc2VydmVyLmlkLCBzZXJ2ZXIubGFiZWwsIHNjb3Blcywgc2Vzc2lvbnMpXG5cdFx0XHRcdDogc2Vzc2lvbnNbMF07XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKGVycm9yT25Vc2VySW50ZXJhY3Rpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IoJ2F1dGhlbnRpY2F0aW9uJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY2NvdW50VG9DcmVhdGU6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQgfCB1bmRlZmluZWQgPSBtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbj8uYWNjb3VudDtcblx0XHRcdGRvIHtcblx0XHRcdFx0c2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKFxuXHRcdFx0XHRcdHByb3ZpZGVySWQsXG5cdFx0XHRcdFx0c2NvcGVzLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGFjdGl2YXRlSW1tZWRpYXRlOiB0cnVlLFxuXHRcdFx0XHRcdFx0YWNjb3VudDogYWNjb3VudFRvQ3JlYXRlLFxuXHRcdFx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcixcblx0XHRcdFx0XHRcdGNsaWVudElkLFxuXHRcdFx0XHRcdFx0Y2xpZW50U2VjcmV0LFxuXHRcdFx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRhdWRpZW5jZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fSB3aGlsZSAoXG5cdFx0XHRcdGFjY291bnRUb0NyZWF0ZVxuXHRcdFx0XHQmJiBhY2NvdW50VG9DcmVhdGUubGFiZWwgIT09IHNlc3Npb24uYWNjb3VudC5sYWJlbFxuXHRcdFx0XHQmJiAhYXdhaXQgdGhpcy5jb250aW51ZVdpdGhJbmNvcnJlY3RBY2NvdW50UHJvbXB0KHNlc3Npb24uYWNjb3VudC5sYWJlbCwgYWNjb3VudFRvQ3JlYXRlLmxhYmVsKVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uTUNQU2VydmVyQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycyhwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIFt7IGlkOiBzZXJ2ZXIuaWQsIG5hbWU6IHNlcnZlci5sYWJlbCwgYWxsb3dlZDogdHJ1ZSwgdXJsOiBtY3BTZXJ2ZXJVcmwgfV0pO1xuXHRcdHRoaXMuYXV0aGVudGljYXRpb25NY3BTZXJ2ZXJzU2VydmljZS51cGRhdGVBY2NvdW50UHJlZmVyZW5jZShzZXJ2ZXIuaWQsIHByb3ZpZGVySWQsIHNlc3Npb24uYWNjb3VudCk7XG5cdFx0dGhpcy5hdXRoZW50aWNhdGlvbk1DUFNlcnZlclVzYWdlU2VydmljZS5hZGRBY2NvdW50VXNhZ2UocHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBzY29wZXMsIHNlcnZlci5pZCwgc2VydmVyLmxhYmVsKTtcblx0XHR0aGlzLl9zZXJ2ZXJBdXRoVHJhY2tpbmcudHJhY2socHJvdmlkZXJJZCwgc2VydmVySWQsIHNjb3BlcywgYXV0aENvbnRleHQpO1xuXHRcdHJldHVybiBzZXNzaW9uLmFjY2Vzc1Rva2VuO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb250aW51ZVdpdGhJbmNvcnJlY3RBY2NvdW50UHJvbXB0KGNob3NlbkFjY291bnRMYWJlbDogc3RyaW5nLCByZXF1ZXN0ZWRBY2NvdW50TGFiZWw6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdpbmNvcnJlY3RBY2NvdW50JywgXCJJbmNvcnJlY3QgYWNjb3VudCBkZXRlY3RlZFwiKSxcblx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdpbmNvcnJlY3RBY2NvdW50RGV0YWlsJywgXCJUaGUgY2hvc2VuIGFjY291bnQsIHswfSwgZG9lcyBub3QgbWF0Y2ggdGhlIHJlcXVlc3RlZCBhY2NvdW50LCB7MX0uXCIsIGNob3NlbkFjY291bnRMYWJlbCwgcmVxdWVzdGVkQWNjb3VudExhYmVsKSxcblx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRjYW5jZWxCdXR0b246IHRydWUsXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdrZWVwJywgJ0tlZXAgezB9JywgY2hvc2VuQWNjb3VudExhYmVsKSxcblx0XHRcdFx0XHRydW46ICgpID0+IGNob3NlbkFjY291bnRMYWJlbFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbG9naW5XaXRoJywgJ0xvZ2luIHdpdGggezB9JywgcmVxdWVzdGVkQWNjb3VudExhYmVsKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHJlcXVlc3RlZEFjY291bnRMYWJlbFxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQucmVzdWx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0LnJlc3VsdCA9PT0gY2hvc2VuQWNjb3VudExhYmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb25EaWRDaGFuZ2VBdXRoU2Vzc2lvbnMocHJvdmlkZXJJZDogc3RyaW5nLCBwcm92aWRlckxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXJzVXNpbmdQcm92aWRlciA9IHRoaXMuX3NlcnZlckF1dGhUcmFja2luZy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFzZXJ2ZXJzVXNpbmdQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgeyBzZXJ2ZXJJZCwgc2NvcGVzLCBjb250ZXh0IH0gb2Ygc2VydmVyc1VzaW5nUHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuX3NlcnZlcnMuZ2V0KHNlcnZlcklkKTtcblx0XHRcdGNvbnN0IHNlcnZlckRlZmluaXRpb24gPSB0aGlzLl9zZXJ2ZXJEZWZpbml0aW9ucy5nZXQoc2VydmVySWQpO1xuXG5cdFx0XHRpZiAoIXNlcnZlciB8fCAhc2VydmVyRGVmaW5pdGlvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSB2YWxpZGF0ZSBzZXJ2ZXJzIHRoYXQgYXJlIHJ1bm5pbmdcblx0XHRcdGNvbnN0IHN0YXRlID0gc2VydmVyLnN0YXRlLmdldCgpO1xuXHRcdFx0aWYgKHN0YXRlLnN0YXRlICE9PSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBWYWxpZGF0ZSBpZiB0aGUgc2Vzc2lvbiBpcyBzdGlsbCBhdmFpbGFibGUuIFJlcGxheSB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIsIGNsaWVudFxuXHRcdFx0Ly8gaWQsIHJlc291cmNlLCBhbmQgYXVkaWVuY2UgY2FwdHVyZWQgd2hlbiB0aGUgc2Vzc2lvbiB3YXMgZXN0YWJsaXNoZWQgc28gdGhlIHNpbGVudFxuXHRcdFx0Ly8gdG9rZW4gcmVxdWVzdCB0YXJnZXRzIHRoZSBzYW1lIGF1dGhvcml0eSB0aGUgdXNlciBzaWduZWQgaW4gYWdhaW5zdCBcdTIwMTQgZHJvcHBpbmcgdGhlXG5cdFx0XHQvLyBhdXRob3JpemF0aW9uIHNlcnZlciBoZXJlIHdvdWxkIGZhbGwgYmFjayB0byB0aGUgcHJvdmlkZXIncyBkZWZhdWx0IGF1dGhvcml0eSAoZS5nLlxuXHRcdFx0Ly8gdGhlIE1pY3Jvc29mdCBwcm92aWRlcidzIGBvcmdhbml6YXRpb25zYCB0ZW5hbnQpIGFuZCBjYW4gdGVhciBkb3duIGEgd29ya2luZyBzZXJ2ZXIuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9nZXRTZXNzaW9uRm9yUHJvdmlkZXIoc2VydmVySWQsIHNlcnZlckRlZmluaXRpb24sIHByb3ZpZGVySWQsIHNjb3BlcywgY29udGV4dC5hdXRob3JpemF0aW9uU2VydmVyLCB0cnVlLCBjb250ZXh0LmNsaWVudElkLCBjb250ZXh0LnJlc291cmNlLCBjb250ZXh0LmF1ZGllbmNlKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKFVzZXJJbnRlcmFjdGlvblJlcXVpcmVkRXJyb3IuaXMoZSkpIHtcblx0XHRcdFx0XHQvLyBTZXNzaW9uIGlzIG5vIGxvbmdlciB2YWxpZCwgc3RvcCB0aGUgc2VydmVyXG5cdFx0XHRcdFx0c2VydmVyLnB1c2hMb2coTG9nTGV2ZWwuV2FybmluZywgbmxzLmxvY2FsaXplKCdtY3BBdXRoU2Vzc2lvblJlbW92ZWQnLCBcIkF1dGhlbnRpY2F0aW9uIHNlc3Npb24gZm9yIHswfSByZW1vdmVkLCBzdG9wcGluZyBzZXJ2ZXJcIiwgcHJvdmlkZXJMYWJlbCkpO1xuXHRcdFx0XHRcdHNlcnZlci5zdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSWdub3JlIG90aGVyIGVycm9ycyB0byBhdm9pZCBkaXNydXB0aW5nIG90aGVyIHNlcnZlcnNcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQkbG9nTWNwQXV0aFNldHVwKGRhdGE6IElBdXRoTWV0YWRhdGFTb3VyY2UpOiB2b2lkIHtcblx0XHR0eXBlIE1jcEF1dGhTZXR1cENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdUeWxlckxlb25oYXJkdCc7XG5cdFx0XHRjb21tZW50OiAnVHJhY2tzIGhvdyBNQ1AgT0F1dGggYXV0aGVudGljYXRpb24gc2V0dXAgd2FzIGRpc2NvdmVyZWQgYW5kIGNvbmZpZ3VyZWQnO1xuXHRcdFx0cmVzb3VyY2VNZXRhZGF0YVNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hvdyByZXNvdXJjZSBtZXRhZGF0YSB3YXMgZGlzY292ZXJlZCAoaGVhZGVyLCB3ZWxsS25vd24sIG9yIG5vbmUpJyB9O1xuXHRcdFx0c2VydmVyTWV0YWRhdGFTb3VyY2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdIb3cgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgd2FzIGRpc2NvdmVyZWQgKHJlc291cmNlTWV0YWRhdGEsIHdlbGxLbm93biwgb3IgZGVmYXVsdCknIH07XG5cdFx0fTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SUF1dGhNZXRhZGF0YVNvdXJjZSwgTWNwQXV0aFNldHVwQ2xhc3NpZmljYXRpb24+KCdtY3AvYXV0aFNldHVwJywgZGF0YSk7XG5cdH1cblxuXHRhc3luYyAkc3RhcnRNY3BHYXRld2F5KGNoYXRTZXNzaW9uUmVzb3VyY2U/OiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTx7IHNlcnZlcnM6IHsgbGFiZWw6IHN0cmluZzsgYWRkcmVzczogVVJJIH1bXTsgZ2F0ZXdheUlkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX21jcEdhdGV3YXlTZXJ2aWNlLmNyZWF0ZUdhdGV3YXkoXG5cdFx0XHR0aGlzLl9leHRIb3N0Q29udGV4dC5leHRlbnNpb25Ib3N0S2luZCA9PT0gRXh0ZW5zaW9uSG9zdEtpbmQuUmVtb3RlLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZSA/IFVSSS5yZXZpdmUoY2hhdFNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQsXG5cdFx0KTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmVzdWx0LmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2F0ZXdheUlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHJlc3VsdCk7XG5cdFx0c3RvcmUuYWRkKHJlc3VsdC5vbkRpZENoYW5nZVNlcnZlcnMoc2VydmVycyA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VHYXRld2F5U2VydmVycyhnYXRld2F5SWQsIHNlcnZlcnMubWFwKHMgPT4gKHsgbGFiZWw6IHMubGFiZWwsIGFkZHJlc3M6IHMuYWRkcmVzcyB9KSkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9nYXRld2F5cy5zZXQoZ2F0ZXdheUlkLCBzdG9yZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2VydmVyczogcmVzdWx0LnNlcnZlcnMubWFwKHMgPT4gKHsgbGFiZWw6IHMubGFiZWwsIGFkZHJlc3M6IHMuYWRkcmVzcyB9KSksXG5cdFx0XHRnYXRld2F5SWQsXG5cdFx0fTtcblx0fVxuXG5cdCRkaXNwb3NlTWNwR2F0ZXdheShnYXRld2F5SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2dhdGV3YXlzLmRlbGV0ZUFuZERpc3Bvc2UoZ2F0ZXdheUlkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9naW5Qcm9tcHQobWNwTGFiZWw6IHN0cmluZywgcHJvdmlkZXJMYWJlbDogc3RyaW5nLCByZWNyZWF0aW5nU2Vzc2lvbjogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSByZWNyZWF0aW5nU2Vzc2lvblxuXHRcdFx0PyBubHMubG9jYWxpemUoJ2NvbmZpcm1SZWxvZ2luJywgXCJUaGUgTUNQIFNlcnZlciBEZWZpbml0aW9uICd7MH0nIHdhbnRzIHlvdSB0byBhdXRoZW50aWNhdGUgdG8gezF9LlwiLCBtY3BMYWJlbCwgcHJvdmlkZXJMYWJlbClcblx0XHRcdDogbmxzLmxvY2FsaXplKCdjb25maXJtTG9naW4nLCBcIlRoZSBNQ1AgU2VydmVyIERlZmluaXRpb24gJ3swfScgd2FudHMgdG8gYXV0aGVudGljYXRlIHRvIHsxfS5cIiwgbWNwTGFiZWwsIHByb3ZpZGVyTGFiZWwpO1xuXG5cdFx0Y29uc3QgYnV0dG9uczogSVByb21wdEJ1dHRvbjxib29sZWFuIHwgdW5kZWZpbmVkPltdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKHsga2V5OiAnYWxsb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZBbGxvd1wiKSxcblx0XHRcdFx0cnVuKCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdF07XG5cdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRidXR0b25zLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlc3VsdCA/PyBmYWxzZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgdGhpcy5fc2VydmVycy52YWx1ZXMoKSkge1xuXHRcdFx0c2VydmVyLmV4dEhvc3REaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3NlcnZlcnMuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXJ2ZXJEZWZpbml0aW9ucy5jbGVhcigpO1xuXHRcdHRoaXMuX3NlcnZlckF1dGhUcmFja2luZy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5cbmNsYXNzIEV4dEhvc3RNY3BTZXJ2ZXJMYXVuY2ggZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcE1lc3NhZ2VUcmFuc3BvcnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8TWNwQ29ubmVjdGlvblN0YXRlPignbWNwU2VydmVyU3RhdGUnLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdGFydGluZyB9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExvZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgbGV2ZWw6IExvZ0xldmVsOyBtZXNzYWdlOiBzdHJpbmcgfT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZExvZyA9IHRoaXMuX29uRGlkTG9nLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVjZWl2ZU1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNQ1AuSlNPTlJQQ01lc3NhZ2U+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRSZWNlaXZlTWVzc2FnZSA9IHRoaXMuX29uRGlkUmVjZWl2ZU1lc3NhZ2UuZXZlbnQ7XG5cblx0cHVzaExvZyhsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkTG9nLmZpcmUoeyBtZXNzYWdlLCBsZXZlbCB9KTtcblx0fVxuXG5cdHB1c2hNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdGxldCBwYXJzZWQ6IE1DUC5KU09OUlBDTWVzc2FnZSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkID0gSlNPTi5wYXJzZShtZXNzYWdlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnB1c2hMb2coTG9nTGV2ZWwuV2FybmluZywgYEZhaWxlZCB0byBwYXJzZSBtZXNzYWdlOiAke0pTT04uc3RyaW5naWZ5KG1lc3NhZ2UpfWApO1xuXHRcdH1cblxuXHRcdGlmIChwYXJzZWQpIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhcnNlZCkpIHsgLy8gc3RyZWFtYWJsZSBIVFRQIHN1cHBvcnRzIGJhdGNoaW5nXG5cdFx0XHRcdHBhcnNlZC5mb3JFYWNoKHAgPT4gdGhpcy5fb25EaWRSZWNlaXZlTWVzc2FnZS5maXJlKHApKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVjZWl2ZU1lc3NhZ2UuZmlyZShwYXJzZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RLaW5kOiBFeHRlbnNpb25Ib3N0S2luZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RvcDogKCkgPT4gdm9pZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2VuZDogKG1lc3NhZ2U6IE1DUC5KU09OUlBDTWVzc2FnZSkgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMucHVzaExvZyhMb2dMZXZlbC5JbmZvLCBgU3RhcnRpbmcgc2VydmVyIGZyb20gJHtleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nKGV4dEhvc3RLaW5kKX0gZXh0ZW5zaW9uIGhvc3RgKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZXh0SG9zdERpc3Bvc2UoKSB7XG5cdFx0aWYgKE1jcENvbm5lY3Rpb25TdGF0ZS5pc1J1bm5pbmcodGhpcy5zdGF0ZS5nZXQoKSkpIHtcblx0XHRcdHRoaXMucHVzaExvZyhMb2dMZXZlbC5XYXJuaW5nLCAnRXh0ZW5zaW9uIGhvc3Qgc2h1dCBkb3duLCBzZXJ2ZXIgd2lsbCBzdG9wLicpO1xuXHRcdFx0dGhpcy5zdGF0ZS5zZXQoeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9LCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmIChNY3BDb25uZWN0aW9uU3RhdGUuaXNSdW5uaW5nKHRoaXMuc3RhdGUuZ2V0KCkpKSB7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHR9XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgY29udGV4dCBuZWVkZWQgdG8gcmUtYWNxdWlyZSBhIHRva2VuIGZvciBhIHRyYWNrZWQgTUNQIHNlcnZlciwgY2FwdHVyZWQgd2hlbiB0aGVcbiAqIHNlc3Npb24gd2FzIGZpcnN0IGVzdGFibGlzaGVkLiBUaGUgdHJhY2tlciBob2xkcyB0aGlzIG9wYXF1ZWx5IGFuZCByZXBsYXlzIGl0IHZlcmJhdGltIG9uXG4gKiByZS12YWxpZGF0aW9uIHNvIHRoZSBzaWxlbnQgdG9rZW4gcmVxdWVzdCB0YXJnZXRzIHRoZSBzYW1lIGF1dGhvcml0eSAvIHJlc291cmNlIC8gYXVkaWVuY2VcbiAqIHRoYXQgdGhlIG9yaWdpbmFsIHNpZ24taW4gdXNlZC4gRHJvcHBpbmcgdGhlIGF1dGhvcml6YXRpb24gc2VydmVyIGhlcmUgd291bGQgbGV0IHRoZSBwcm92aWRlclxuICogZmFsbCBiYWNrIHRvIGEgZGVmYXVsdCBhdXRob3JpdHkgKGUuZy4gdGhlIE1pY3Jvc29mdCBwcm92aWRlcidzIGBvcmdhbml6YXRpb25zYCB0ZW5hbnQpIGFuZFxuICogcmVxdWVzdCBhIHRva2VuIGFnYWluc3QgdGhlIHdyb25nIHRlbmFudC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTWNwU2VydmVyQXV0aENvbnRleHQge1xuXHRyZWFkb25seSBhdXRob3JpemF0aW9uU2VydmVyPzogVVJJO1xuXHRyZWFkb25seSBjbGllbnRJZD86IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGF1ZGllbmNlPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRyYWNrcyB3aGljaCBNQ1Agc2VydmVycyBhcmUgdXNpbmcgd2hpY2ggYXV0aGVudGljYXRpb24gcHJvdmlkZXJzLlxuICogT3JnYW5pemVkIGJ5IHByb3ZpZGVyIElEIGZvciBlZmZpY2llbnQgbG9va3VwIHdoZW4gYXV0aCBzZXNzaW9ucyBjaGFuZ2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBNY3BTZXJ2ZXJBdXRoVHJhY2tlciB7XG5cdC8vIFByb3ZpZGVyIElEIC0+IEFycmF5IG9mIHRyYWNrZWQgc2VydmVycyAoc2VydmVySWQsIHNjb3BlcywgYW5kIHRoZSBhdXRoIGNvbnRleHQgdG8gcmVwbGF5KVxuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFja2luZyA9IG5ldyBNYXA8c3RyaW5nLCBBcnJheTx7IHNlcnZlcklkOiBudW1iZXI7IHNjb3Blczogc3RyaW5nW107IGNvbnRleHQ6IElNY3BTZXJ2ZXJBdXRoQ29udGV4dCB9Pj4oKTtcblxuXHQvKipcblx0ICogVHJhY2sgYXV0aGVudGljYXRpb24gZm9yIGEgc2VydmVyIHdpdGggYSBzcGVjaWZpYyBwcm92aWRlci5cblx0ICogUmVwbGFjZXMgYW55IGV4aXN0aW5nIHRyYWNraW5nIGZvciB0aGlzIHNlcnZlci9wcm92aWRlciBjb21iaW5hdGlvbi5cblx0ICovXG5cdHRyYWNrKHByb3ZpZGVySWQ6IHN0cmluZywgc2VydmVySWQ6IG51bWJlciwgc2NvcGVzOiBzdHJpbmdbXSwgY29udGV4dDogSU1jcFNlcnZlckF1dGhDb250ZXh0KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VydmVycyA9IHRoaXMuX3RyYWNraW5nLmdldChwcm92aWRlcklkKSB8fCBbXTtcblx0XHRjb25zdCBmaWx0ZXJlZCA9IHNlcnZlcnMuZmlsdGVyKHMgPT4gcy5zZXJ2ZXJJZCAhPT0gc2VydmVySWQpO1xuXHRcdGZpbHRlcmVkLnB1c2goeyBzZXJ2ZXJJZCwgc2NvcGVzLCBjb250ZXh0IH0pO1xuXHRcdHRoaXMuX3RyYWNraW5nLnNldChwcm92aWRlcklkLCBmaWx0ZXJlZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIGFsbCBhdXRoZW50aWNhdGlvbiB0cmFja2luZyBmb3IgYSBzZXJ2ZXIgYWNyb3NzIGFsbCBwcm92aWRlcnMuXG5cdCAqL1xuXHR1bnRyYWNrKHNlcnZlcklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtwcm92aWRlcklkLCBzZXJ2ZXJzXSBvZiB0aGlzLl90cmFja2luZy5lbnRyaWVzKCkpIHtcblx0XHRcdGNvbnN0IGZpbHRlcmVkID0gc2VydmVycy5maWx0ZXIocyA9PiBzLnNlcnZlcklkICE9PSBzZXJ2ZXJJZCk7XG5cdFx0XHRpZiAoZmlsdGVyZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3RyYWNraW5nLmRlbGV0ZShwcm92aWRlcklkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3RyYWNraW5nLnNldChwcm92aWRlcklkLCBmaWx0ZXJlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBhbGwgc2VydmVycyB1c2luZyBhIHNwZWNpZmljIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyLlxuXHQgKi9cblx0Z2V0KHByb3ZpZGVySWQ6IHN0cmluZyk6IFJlYWRvbmx5QXJyYXk8eyBzZXJ2ZXJJZDogbnVtYmVyOyBzY29wZXM6IHN0cmluZ1tdOyBjb250ZXh0OiBJTWNwU2VydmVyQXV0aENvbnRleHQgfT4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90cmFja2luZy5nZXQocHJvdmlkZXJJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXIgYWxsIHRyYWNraW5nIGRhdGEuXG5cdCAqL1xuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl90cmFja2luZy5jbGVhcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUNwRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGVBQWUsaUJBQWlCLHlCQUF5QjtBQUM5RSxTQUFTLFNBQThCLHVCQUF1QjtBQUM5RCxPQUFPLGNBQWM7QUFDckIsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixZQUFZLFNBQVM7QUFDckIsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXFDO0FBQzlDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQStCLG9CQUFvQjtBQUNuRCxTQUFTLDZCQUFzRCx3QkFBd0Isb0JBQW9CLHFCQUFxQixpQkFBaUIsd0JBQXdCLGdCQUFnQixnQ0FBZ0Msb0NBQW9DO0FBQzdQLFNBQTZDLDBDQUEwQztBQUV2RixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHNDQUFzQztBQUMvQyxTQUE4RCw4QkFBOEI7QUFDNUYsU0FBUyxvREFBb0Q7QUFDN0QsU0FBUyxtQkFBbUIsaUNBQWlDO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQTBCLDRCQUE0QjtBQUV0RCxTQUFTLGdCQUE0RyxtQkFBdUM7QUFHckosSUFBTSxnQkFBTixjQUE0QixXQUF5QztBQUFBLEVBYzNFLFlBQ2tCLGlCQUNjLGNBQ0UsZUFDUSx3QkFDRyxpQ0FDTSxzQ0FDRCxxQ0FDYyw4Q0FDM0IsbUJBQ0Msb0JBQ0QsbUJBQ1Usb0JBQ04sdUJBQ0EsdUJBQ3ZDO0FBQ0QsVUFBTTtBQWZXO0FBQ2M7QUFD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
