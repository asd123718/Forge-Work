import { fetchAuthorizationServerMetadata } from "../../../../../../base/common/oauth.js";
import { SequencerByKey } from "../../../../../../base/common/async.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { URI } from "../../../../../../base/common/uri.js";
import { readAgentModelByokIdentifier } from "../../../../../../platform/agentHost/common/agentModelByokMeta.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { localize } from "../../../../../../nls.js";
import { IAuthenticationMcpAccessService } from "../../../../../services/authentication/browser/authenticationMcpAccessService.js";
import { IAuthenticationMcpService } from "../../../../../services/authentication/browser/authenticationMcpService.js";
import { IAuthenticationMcpUsageService } from "../../../../../services/authentication/browser/authenticationMcpUsageService.js";
import { getDynamicAuthenticationProviderId, IAuthenticationService } from "../../../../../services/authentication/common/authentication.js";
import { IDynamicAuthenticationProviderStorageService } from "../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { CHAT_SETUP_ACTION_ID } from "../../actions/chatActions.js";
function agentHostMcpServerId(authority, serverName, resourceUrl) {
  return `agent-host-mcp:${authority}/${encodeURIComponent(serverName)}/${encodeURIComponent(resourceUrl)}`;
}
function modelRequiresAgentAuthentication(agent, model, allowSignedOutWhenUsable = false) {
  if (!agent?.protectedResources?.length) {
    return false;
  }
  const requiresAuthentication = agent.protectedResources.some((resource) => resource.required !== false);
  if (!allowSignedOutWhenUsable || !agent.models.some((candidate) => readAgentModelByokIdentifier(candidate) !== void 0)) {
    return requiresAuthentication;
  }
  if (!model) {
    return true;
  }
  const selectedModel = agent.models.find((candidate) => candidate.id === model.id);
  return !selectedModel || readAgentModelByokIdentifier(selectedModel) === void 0;
}
class AgentHostAuthTokenCache {
  constructor() {
    this._completedTokens = /* @__PURE__ */ new Map();
    this._pendingAuthentications = /* @__PURE__ */ new Map();
    this._keyGenerations = /* @__PURE__ */ new Map();
    this._globalGeneration = 0;
  }
  /**
   * Forwards a token once per resource/scope pair. Same-token callers share
   * and await an in-flight authentication.
   */
  async authenticate(resource, scopes, token, authenticate) {
    const key = this._key(resource, scopes);
    const globalGeneration = this._globalGeneration;
    const keyGeneration = this._keyGenerations.get(key) ?? 0;
    const pending = this._pendingAuthentications.get(key);
    if (pending) {
      if (pending.token === token) {
        await pending.promise;
        if (!this._isCurrentGeneration(key, globalGeneration, keyGeneration)) {
          throw new CancellationError();
        }
        return false;
      }
      try {
        await pending.promise;
      } catch {
      }
      if (!this._isCurrentGeneration(key, globalGeneration, keyGeneration)) {
        throw new CancellationError();
      }
      return this.authenticate(resource, scopes, token, authenticate);
    }
    if (this._completedTokens.get(key) === token) {
      return false;
    }
    const promise = (async () => {
      await authenticate();
      if (!this._isCurrentGeneration(key, globalGeneration, keyGeneration)) {
        throw new CancellationError();
      }
      this._completedTokens.set(key, token);
    })();
    this._pendingAuthentications.set(key, { token, promise });
    try {
      await promise;
      return true;
    } finally {
      if (this._pendingAuthentications.get(key)?.promise === promise) {
        this._pendingAuthentications.delete(key);
      }
    }
  }
  /**
   * Clear the cached token for a specific resource/scope pair, a whole resource,
   * or all resources if no argument is given. Call after a failed `authenticate`
   * RPC or when the agent host process restarts.
   */
  clear(resource, scopes) {
    if (resource !== void 0) {
      if (scopes !== void 0) {
        const key = this._key(resource, scopes);
        this._invalidateKey(key);
        this._completedTokens.delete(key);
        this._pendingAuthentications.delete(key);
        return;
      }
      const prefix = `${resource}\0`;
      const keys = /* @__PURE__ */ new Set([...this._completedTokens.keys(), ...this._pendingAuthentications.keys(), ...this._keyGenerations.keys()]);
      for (const key of keys) {
        if (key.startsWith(prefix)) {
          this._invalidateKey(key);
          this._completedTokens.delete(key);
          this._pendingAuthentications.delete(key);
        }
      }
    } else {
      this._globalGeneration++;
      this._completedTokens.clear();
      this._pendingAuthentications.clear();
      this._keyGenerations.clear();
    }
  }
  _invalidateKey(key) {
    this._keyGenerations.set(key, (this._keyGenerations.get(key) ?? 0) + 1);
  }
  _isCurrentGeneration(key, globalGeneration, keyGeneration) {
    return this._globalGeneration === globalGeneration && (this._keyGenerations.get(key) ?? 0) === keyGeneration;
  }
  _key(resource, scopes) {
    return `${resource}\0${scopes ? [...new Set(scopes)].sort().join("\0") : ""}`;
  }
}
function protectedResourceAuthenticationKey(resource) {
  return JSON.stringify([
    resource.resource,
    [...new Set(resource.scopes_supported ?? [])].sort(),
    resource.authorization_servers ?? []
  ]);
}
class AgentHostAuthenticationRecovery {
  constructor() {
    this._resentTokens = /* @__PURE__ */ new Map();
    this._pendingRecoveries = /* @__PURE__ */ new Map();
  }
  clear() {
    this._resentTokens.clear();
    this._pendingRecoveries.clear();
  }
  recover(accessor, resource, options) {
    const key = protectedResourceAuthenticationKey(resource);
    const pendingRecovery = this._pendingRecoveries.get(key);
    if (pendingRecovery) {
      return pendingRecovery;
    }
    const recovery = this._recover(accessor, key, resource, options).finally(() => {
      if (this._pendingRecoveries.get(key) === recovery) {
        this._pendingRecoveries.delete(key);
      }
    });
    this._pendingRecoveries.set(key, recovery);
    return recovery;
  }
  async _recover(accessor, key, resource, options) {
    throwIfAuthenticationStale(options);
    const authenticationService = accessor.get(IAuthenticationService);
    const commandService = accessor.get(ICommandService);
    const logService = accessor.get(ILogService);
    const scopes = resource.scopes_supported ?? [];
    const token = await resolveTokenForResource(
      URI.parse(resource.resource),
      resource.authorization_servers ?? [],
      scopes,
      authenticationService,
      logService,
      options.logPrefix
    );
    throwIfAuthenticationStale(options);
    if (!token) {
      logService.info(`${options.logPrefix} No token resolved for resource: ${resource.resource}`);
      options.authTokenCache?.clear(resource.resource, resource.scopes_supported);
      if (await forwardAuthenticationToken(options, resource.resource, scopes, "")) {
        this._resentTokens.delete(key);
        logService.info(`${options.logPrefix} Clearing authentication for resource: ${resource.resource}`);
      }
      return;
    }
    const previousToken = this._resentTokens.get(key);
    if (previousToken !== void 0 && previousToken === token) {
      options.authTokenCache?.clear(resource.resource, resource.scopes_supported);
      throwIfAuthenticationStale(options);
      const interactiveToken = await forceAuthenticationInteractively(authenticationService, commandService, logService, resource, options);
      throwIfAuthenticationStale(options);
      if (interactiveToken) {
        this._resentTokens.set(key, interactiveToken);
        if (interactiveToken === token) {
          logService.info(`${options.logPrefix} Interactive authentication completed without a new token for ${resource.resource}`);
        }
      }
      return;
    }
    options.authTokenCache?.clear(resource.resource, resource.scopes_supported);
    if (await forwardAuthenticationToken(options, resource.resource, resource.scopes_supported ?? [], token)) {
      this._resentTokens.set(key, token);
      logService.info(`${options.logPrefix} Authenticating for resource: ${resource.resource}`);
    }
  }
}
async function resolveTokenForResource(resourceServer, authorizationServers, scopes, authenticationService, logService, logPrefix) {
  for (const server of authorizationServers) {
    const serverUri = URI.parse(server);
    const providerId = await authenticationService.getOrActivateProviderIdForServer(serverUri, resourceServer);
    if (!providerId) {
      logService.trace(`${logPrefix} No auth provider found for server: ${server}`);
      continue;
    }
    logService.trace(`${logPrefix} Resolved auth provider '${providerId}' for server: ${server}`);
    const sessions = await authenticationService.getSessions(providerId, [...scopes], { authorizationServer: serverUri }, true);
    const exactSession = sessions[0];
    if (exactSession) {
      return exactSession.accessToken;
    }
    const allSessions = await authenticationService.getSessions(providerId, void 0, { authorizationServer: serverUri }, true);
    const requestedSet = new Set(scopes);
    let bestToken;
    let bestExtraScopes = Infinity;
    for (const session of allSessions) {
      const sessionScopes = new Set(session.scopes);
      let isSuperset = true;
      for (const scope of requestedSet) {
        if (!sessionScopes.has(scope)) {
          isSuperset = false;
          break;
        }
      }
      if (isSuperset) {
        const extraScopes = sessionScopes.size - requestedSet.size;
        if (extraScopes < bestExtraScopes) {
          bestExtraScopes = extraScopes;
          bestToken = session.accessToken;
        }
      }
    }
    if (bestToken) {
      return bestToken;
    }
  }
  return void 0;
}
async function forwardAuthenticationToken(options, resource, scopes, token) {
  throwIfAuthenticationStale(options);
  const request = { resource, scopes, token };
  if (options.authTokenCache) {
    return options.authTokenCache.authenticate(resource, scopes, token, () => options.authenticate(request));
  }
  await options.authenticate(request);
  return true;
}
function throwIfAuthenticationStale(options) {
  if (options.isCurrent?.() === false) {
    throw new CancellationError();
  }
}
async function authenticateProtectedResources(accessor, agents, options) {
  const authenticationService = accessor.get(IAuthenticationService);
  const logService = accessor.get(ILogService);
  for (const agent of agents) {
    for (const resource of agent.protectedResources ?? []) {
      await authenticateProtectedResourceWithServices(authenticationService, logService, resource, options);
    }
  }
}
async function authenticateProtectedResource(accessor, resource, options) {
  return authenticateProtectedResourceWithServices(accessor.get(IAuthenticationService), accessor.get(ILogService), resource, options);
}
async function authenticateProtectedResourceWithServices(authenticationService, logService, resource, options) {
  throwIfAuthenticationStale(options);
  const token = await resolveTokenForProtectedResource(authenticationService, logService, resource, options);
  throwIfAuthenticationStale(options);
  const authenticated = await forwardAuthenticationToken(options, resource.resource, resource.scopes_supported ?? [], token ?? "");
  if (!authenticated) {
    logService.trace(`${options.logPrefix} Authentication state for ${resource.resource} unchanged; skipping authenticate RPC`);
    return false;
  }
  logService.info(token ? `${options.logPrefix} Authenticating for resource: ${resource.resource}` : `${options.logPrefix} Clearing authentication for resource: ${resource.resource}`);
  return true;
}
async function resolveTokenForProtectedResource(authenticationService, logService, resource, options) {
  const token = await resolveTokenForResource(
    URI.parse(resource.resource),
    resource.authorization_servers ?? [],
    resource.scopes_supported ?? [],
    authenticationService,
    logService,
    options.logPrefix
  );
  if (!token) {
    logService.info(`${options.logPrefix} No token resolved for resource: ${resource.resource}`);
  }
  return token;
}
async function resolveAuthenticationInteractively(accessor, protectedResources, options) {
  const authenticationService = accessor.get(IAuthenticationService);
  const commandService = accessor.get(ICommandService);
  const logService = accessor.get(ILogService);
  for (const resource of protectedResources) {
    throwIfAuthenticationStale(options);
    const resourceUri = URI.parse(resource.resource);
    const scopes = resource.scopes_supported ?? [];
    const existingToken = await resolveTokenForResource(
      resourceUri,
      resource.authorization_servers ?? [],
      scopes,
      authenticationService,
      logService,
      options.logPrefix
    );
    throwIfAuthenticationStale(options);
    if (existingToken) {
      await forwardAuthenticationToken(options, resource.resource, scopes, existingToken);
      logService.info(`${options.logPrefix} Interactive authentication succeeded for ${resource.resource}`);
      return true;
    }
    return await forceAuthenticationInteractively(authenticationService, commandService, logService, resource, options) !== void 0;
  }
  return false;
}
async function forceAuthenticationInteractively(authenticationService, commandService, logService, resource, options) {
  throwIfAuthenticationStale(options);
  const scopes = resource.scopes_supported ?? [];
  const setupResult = await commandService.executeCommand(CHAT_SETUP_ACTION_ID, void 0, {
    forceSignInDialog: true,
    additionalScopes: scopes,
    dialogTitle: localize("agentHost.signInDialogTitle", "Sign in to use GitHub Copilot"),
    disableChatViewReveal: true,
    returnResult: true
  });
  throwIfAuthenticationStale(options);
  if (setupResult?.success === void 0) {
    return void 0;
  }
  if (!setupResult.success) {
    throw setupResult.error ?? new Error(localize("agentHost.signInFailed", "Failed to sign in to use GitHub Copilot."));
  }
  const token = await resolveTokenForResource(
    URI.parse(resource.resource),
    resource.authorization_servers ?? [],
    scopes,
    authenticationService,
    logService,
    options.logPrefix
  );
  throwIfAuthenticationStale(options);
  if (!token) {
    logService.info(`${options.logPrefix} Interactive authentication did not provide a token for ${resource.resource}`);
    return void 0;
  }
  options.authTokenCache?.clear(resource.resource, scopes);
  if (!await forwardAuthenticationToken(options, resource.resource, scopes, token)) {
    return void 0;
  }
  logService.info(`${options.logPrefix} Interactive authentication completed for ${resource.resource}`);
  return token;
}
async function resolveMcpServerAuthentication(accessor, protectedResource, options) {
  const authenticationService = accessor.get(IAuthenticationService);
  const authenticationMcpAccessService = accessor.get(IAuthenticationMcpAccessService);
  const authenticationMcpService = accessor.get(IAuthenticationMcpService);
  const authenticationMcpUsageService = accessor.get(IAuthenticationMcpUsageService);
  const dynamicAuthenticationProviderStorageService = accessor.get(IDynamicAuthenticationProviderStorageService);
  const logService = accessor.get(ILogService);
  const agentHostMeta = options.agentHost ? { authority: options.agentHost.authority, label: accessor.get(ILabelService).getHostLabel(options.agentHost.scheme, options.agentHost.authority) } : void 0;
  const scopes = options.scopes.length > 0 || isGitHubMcpResource(protectedResource) ? options.scopes : protectedResource.scopes_supported ?? [];
  const authenticationOperations = getMcpAuthenticationOperations(authenticationService);
  for (const authorizationServer of protectedResource.authorization_servers ?? []) {
    const authorizationServerUri = URI.parse(authorizationServer);
    const providerOperationId = getDynamicAuthenticationProviderId(authorizationServerUri, protectedResource);
    const authenticated = await authenticationOperations.queue(providerOperationId, async () => {
      const providerId = await getOrCreateProviderForMcpResource(
        authorizationServerUri,
        protectedResource,
        options.oauthClient,
        authenticationService,
        dynamicAuthenticationProviderStorageService,
        logService,
        options.logPrefix,
        options.allowInteraction,
        options.authorizationServerMetadataFetcher ?? fetchAuthorizationServerMetadata
      );
      if (!providerId) {
        return false;
      }
      const oauthClientOptions = options.oauthClient ? { clientId: options.oauthClient.clientId, clientSecret: options.oauthClient.clientSecret } : {};
      const sessions = await authenticationService.getSessions(providerId, [...scopes], {
        authorizationServer: authorizationServerUri,
        resource: protectedResource.resource,
        ...oauthClientOptions,
        silent: !options.allowInteraction
      }, true);
      const allowedSession = getAllowedMcpSession(providerId, sessions, authenticationMcpAccessService, authenticationMcpService, options);
      if (allowedSession) {
        await authenticateMcpSession(providerId, allowedSession, scopes, authenticationMcpAccessService, authenticationMcpService, authenticationMcpUsageService, logService, options, false, agentHostMeta);
        return true;
      }
      if (!options.allowInteraction) {
        return false;
      }
      const provider = authenticationService.getProvider(providerId);
      const session = sessions.length ? provider.supportsMultipleAccounts ? await authenticationMcpService.selectSession(providerId, options.mcpServerId, options.mcpServerName, [...scopes], sessions) : sessions[0] : await authenticationService.createSession(providerId, [...scopes], {
        activateImmediate: true,
        authorizationServer: authorizationServerUri,
        resource: protectedResource.resource,
        ...oauthClientOptions
      });
      await authenticateMcpSession(providerId, session, scopes, authenticationMcpAccessService, authenticationMcpService, authenticationMcpUsageService, logService, options, true, agentHostMeta);
      return true;
    });
    if (authenticated) {
      return true;
    }
  }
  return false;
}
const mcpAuthenticationOperations = /* @__PURE__ */ new WeakMap();
function getMcpAuthenticationOperations(authenticationService) {
  let operations = mcpAuthenticationOperations.get(authenticationService);
  if (!operations) {
    operations = new SequencerByKey();
    mcpAuthenticationOperations.set(authenticationService, operations);
  }
  return operations;
}
function isGitHubMcpResource(resource) {
  return resource.resource_name === "GitHub MCP Server";
}
async function getOrCreateProviderForMcpResource(authorizationServer, protectedResource, oauthClient, authenticationService, dynamicAuthenticationProviderStorageService, logService, logPrefix, allowCreation, authorizationServerMetadataFetcher) {
  const resourceUri = URI.parse(protectedResource.resource);
  const dynamicProviderId = getDynamicAuthenticationProviderId(authorizationServer, protectedResource);
  let clientId = oauthClient?.clientId;
  let clientSecret = oauthClient?.clientSecret;
  if (oauthClient) {
    const isProviderActive = authenticationService.isDynamicAuthenticationProvider(dynamicProviderId);
    const registeredClient = await dynamicAuthenticationProviderStorageService.getClientRegistration(dynamicProviderId);
    const clientMatches = registeredClient?.clientId === oauthClient.clientId && registeredClient.clientSecret === oauthClient.clientSecret;
    if (clientMatches) {
      if (isProviderActive) {
        return dynamicProviderId;
      }
    } else {
      if (!allowCreation) {
        return void 0;
      }
      if (isProviderActive) {
        authenticationService.unregisterAuthenticationProvider(dynamicProviderId);
        await dynamicAuthenticationProviderStorageService.removeDynamicProvider(dynamicProviderId);
      }
    }
  } else {
    const existing = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceUri);
    if (existing) {
      return existing;
    }
    const registeredClient = await dynamicAuthenticationProviderStorageService.getClientRegistration(dynamicProviderId);
    if (!registeredClient?.clientId && !allowCreation) {
      return void 0;
    }
    clientId = registeredClient?.clientId;
    clientSecret = registeredClient?.clientSecret;
  }
  try {
    const { metadata } = await authorizationServerMetadataFetcher(authorizationServer.toString(true));
    const provider = await authenticationService.createDynamicAuthenticationProvider(authorizationServer, metadata, protectedResource, clientId, clientSecret);
    return provider?.id;
  } catch (err) {
    logService.warn(`${logPrefix} Failed to create MCP auth provider for ${authorizationServer.toString(true)}`, err);
    return void 0;
  }
}
function getAllowedMcpSession(providerId, sessions, authenticationMcpAccessService, authenticationMcpService, options) {
  const accountNamePreference = authenticationMcpService.getAccountPreference(options.mcpServerId, providerId);
  if (accountNamePreference) {
    const preferred = sessions.find((session) => session.account.label === accountNamePreference);
    if (preferred && authenticationMcpAccessService.isAccessAllowedForUrl(providerId, preferred.account.label, options.mcpServerId, options.mcpServerUrl)) {
      return preferred;
    }
  }
  if (sessions.length === 1 && authenticationMcpAccessService.isAccessAllowedForUrl(providerId, sessions[0].account.label, options.mcpServerId, options.mcpServerUrl)) {
    return sessions[0];
  }
  return void 0;
}
async function authenticateMcpSession(providerId, session, scopes, authenticationMcpAccessService, authenticationMcpService, authenticationMcpUsageService, logService, options, updateAccess, agentHost) {
  await forwardAuthenticationToken(options, options.mcpServerUrl, scopes, session.accessToken);
  if (updateAccess) {
    authenticationMcpAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: options.mcpServerId, name: options.mcpServerName, allowed: true, url: options.mcpServerUrl, agentHost }]);
    authenticationMcpService.updateAccountPreference(options.mcpServerId, providerId, session.account);
  }
  authenticationMcpUsageService.addAccountUsage(providerId, session.account.label, scopes, options.mcpServerId, options.mcpServerName);
  logService.info(`${options.logPrefix} MCP authentication succeeded for ${options.mcpServerName}`);
}
export {
  AgentHostAuthTokenCache,
  AgentHostAuthenticationRecovery,
  agentHostMcpServerId,
  authenticateProtectedResource,
  authenticateProtectedResources,
  modelRequiresAgentAuthentication,
  resolveAuthenticationInteractively,
  resolveMcpServerAuthentication,
  resolveTokenForResource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0QXV0aC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcmVhZEFnZW50TW9kZWxCeW9rSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRNb2RlbEJ5b2tNZXRhLmpzJztcbmltcG9ydCB7IHR5cGUgTWNwT0F1dGhDbGllbnQsIHR5cGUgTW9kZWxTZWxlY3Rpb24sIHR5cGUgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IHR5cGUgQWdlbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvblNlc3Npb24sIGdldER5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVySWQsIElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlLmpzJztcbmltcG9ydCB7IENIQVRfU0VUVVBfQUNUSU9OX0lEIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNldHVwUmVzdWx0IH0gZnJvbSAnLi4vLi4vY2hhdFNldHVwL2NoYXRTZXR1cC5qcyc7XG5cbi8qKlxuICogU3RhYmxlIGlkZW50aXR5IGZvciBhbiBhZ2VudC1ob3N0IE1DUCBzZXJ2ZXIsIHVzZWQgYXMgdGhlIGtleSBmb3JcbiAqIHJlbWVtYmVyZWQgYXV0aGVudGljYXRpb24gKGFsbG93ZWQtc2VydmVyIGFjY2VzcywgYWNjb3VudCBwcmVmZXJlbmNlIGFuZFxuICogdXNhZ2UpLiBBZ2VudC1ob3N0IGN1c3RvbWl6YXRpb24gaWRzIGFyZSAqKm5vdCoqIHN0YWJsZSBhY3Jvc3MgcmVsb2FkcyBcdTIwMTRcbiAqIGJhcmUvdG9wLWxldmVsIGlkcyBlbWJlZCB0aGUgYWdlbnQtaG9zdCBzZXNzaW9uIGlkLCBhbmQgc3luY2VkIGNoaWxkIGlkc1xuICogZW1iZWQgYSBwZXItc3luYyBub25jZSBcdTIwMTQgc28ga2V5aW5nIHJlbWVtYmVyZWQgYXV0aCBvbiB0aGVtIG9ycGhhbnMgdGhlXG4gKiBncmFudCBvbiBldmVyeSByZWxvYWQuIEluc3RlYWQgd2Uga2V5IG9uIHRoZSBzZXNzaW9uJ3MgaG9zdCBgYXV0aG9yaXR5YFxuICogcGx1cyB0aGUgc2VydmVyIGBuYW1lYCBhbmQgaXRzIHJlc291cmNlIGB1cmxgLCBhbGwgb2Ygd2hpY2ggYXJlIHN0YWJsZVxuICogZm9yIGEgZ2l2ZW4gc2VydmVyIGFjcm9zcyBzZXNzaW9ucyBhbmQgcmVsb2Fkcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFnZW50SG9zdE1jcFNlcnZlcklkKGF1dGhvcml0eTogc3RyaW5nLCBzZXJ2ZXJOYW1lOiBzdHJpbmcsIHJlc291cmNlVXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYGFnZW50LWhvc3QtbWNwOiR7YXV0aG9yaXR5fS8ke2VuY29kZVVSSUNvbXBvbmVudChzZXJ2ZXJOYW1lKX0vJHtlbmNvZGVVUklDb21wb25lbnQocmVzb3VyY2VVcmwpfWA7XG59XG5cbi8qKlxuICogV2hldGhlciBjcmVhdGluZyBhIHNlc3Npb24gd2l0aCB0aGUgc2VsZWN0ZWQgbW9kZWwgcmVxdWlyZXMgdGhlIGFnZW50J3MgcHJvdGVjdGVkLXJlc291cmNlIGF1dGhlbnRpY2F0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbW9kZWxSZXF1aXJlc0FnZW50QXV0aGVudGljYXRpb24oYWdlbnQ6IEFnZW50SW5mbyB8IHVuZGVmaW5lZCwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBhbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUgPSBmYWxzZSk6IGJvb2xlYW4ge1xuXHRpZiAoIWFnZW50Py5wcm90ZWN0ZWRSZXNvdXJjZXM/Lmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCByZXF1aXJlc0F1dGhlbnRpY2F0aW9uID0gYWdlbnQucHJvdGVjdGVkUmVzb3VyY2VzLnNvbWUocmVzb3VyY2UgPT4gcmVzb3VyY2UucmVxdWlyZWQgIT09IGZhbHNlKTtcblx0aWYgKCFhbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUgfHwgIWFnZW50Lm1vZGVscy5zb21lKGNhbmRpZGF0ZSA9PiByZWFkQWdlbnRNb2RlbEJ5b2tJZGVudGlmaWVyKGNhbmRpZGF0ZSkgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRyZXR1cm4gcmVxdWlyZXNBdXRoZW50aWNhdGlvbjtcblx0fVxuXHRpZiAoIW1vZGVsKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Y29uc3Qgc2VsZWN0ZWRNb2RlbCA9IGFnZW50Lm1vZGVscy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQgPT09IG1vZGVsLmlkKTtcblx0cmV0dXJuICFzZWxlY3RlZE1vZGVsIHx8IHJlYWRBZ2VudE1vZGVsQnlva0lkZW50aWZpZXIoc2VsZWN0ZWRNb2RlbCkgPT09IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBUcmFja3MgdGhlIGxhc3QgYmVhcmVyIHRva2VuIHB1c2hlZCB0byBhIGdpdmVuIGFnZW50IGhvc3QgY29ubmVjdGlvblxuICogZm9yIGVhY2ggcHJvdGVjdGVkIHJlc291cmNlLCBzbyB0aGF0IHJlZHVuZGFudCBgYXV0aGVudGljYXRlYCBSUENzIGNhblxuICogYmUgc3VwcHJlc3NlZCB3aGVuIG5laXRoZXIgdGhlIHJlc291cmNlIG5vciB0aGUgdG9rZW4gaGFzIGNoYW5nZWQuXG4gKlxuICogT25lIGluc3RhbmNlIHBlciBjb25uZWN0aW9uLiBPd25lZCBieSB0aGUgY29udHJpYnV0aW9uIHRoYXQgZHJpdmVzXG4gKiBhdXRoZW50aWNhdGlvbiBmb3IgdGhhdCBjb25uZWN0aW9uIHNvIHRoZSBjYWNoZSBpcyBkcm9wcGVkIG5hdHVyYWxseVxuICogd2hlbiB0aGUgY29ubmVjdGlvbiBpcyBkaXNwb3NlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tcGxldGVkVG9rZW5zID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0F1dGhlbnRpY2F0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlYWRvbmx5IHRva2VuOiBzdHJpbmc7IHJlYWRvbmx5IHByb21pc2U6IFByb21pc2U8dm9pZD4gfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfa2V5R2VuZXJhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRwcml2YXRlIF9nbG9iYWxHZW5lcmF0aW9uID0gMDtcblxuXHQvKipcblx0ICogRm9yd2FyZHMgYSB0b2tlbiBvbmNlIHBlciByZXNvdXJjZS9zY29wZSBwYWlyLiBTYW1lLXRva2VuIGNhbGxlcnMgc2hhcmVcblx0ICogYW5kIGF3YWl0IGFuIGluLWZsaWdodCBhdXRoZW50aWNhdGlvbi5cblx0ICovXG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShyZXNvdXJjZTogc3RyaW5nLCBzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCB0b2tlbjogc3RyaW5nLCBhdXRoZW50aWNhdGU6ICgpID0+IFByb21pc2U8dW5rbm93bj4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9rZXkocmVzb3VyY2UsIHNjb3Blcyk7XG5cdFx0Y29uc3QgZ2xvYmFsR2VuZXJhdGlvbiA9IHRoaXMuX2dsb2JhbEdlbmVyYXRpb247XG5cdFx0Y29uc3Qga2V5R2VuZXJhdGlvbiA9IHRoaXMuX2tleUdlbmVyYXRpb25zLmdldChrZXkpID8/IDA7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdBdXRoZW50aWNhdGlvbnMuZ2V0KGtleSk7XG5cdFx0aWYgKHBlbmRpbmcpIHtcblx0XHRcdGlmIChwZW5kaW5nLnRva2VuID09PSB0b2tlbikge1xuXHRcdFx0XHRhd2FpdCBwZW5kaW5nLnByb21pc2U7XG5cdFx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihrZXksIGdsb2JhbEdlbmVyYXRpb24sIGtleUdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwZW5kaW5nLnByb21pc2U7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gVGhlIG5ld2VyIHRva2VuIGdldHMgaXRzIG93biBhdHRlbXB0IHJlZ2FyZGxlc3Mgb2YgdGhlIHByZXZpb3VzIHJlc3VsdC5cblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihrZXksIGdsb2JhbEdlbmVyYXRpb24sIGtleUdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuYXV0aGVudGljYXRlKHJlc291cmNlLCBzY29wZXMsIHRva2VuLCBhdXRoZW50aWNhdGUpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb21wbGV0ZWRUb2tlbnMuZ2V0KGtleSkgPT09IHRva2VuKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBhdXRoZW50aWNhdGUoKTtcblx0XHRcdGlmICghdGhpcy5faXNDdXJyZW50R2VuZXJhdGlvbihrZXksIGdsb2JhbEdlbmVyYXRpb24sIGtleUdlbmVyYXRpb24pKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29tcGxldGVkVG9rZW5zLnNldChrZXksIHRva2VuKTtcblx0XHR9KSgpO1xuXHRcdHRoaXMuX3BlbmRpbmdBdXRoZW50aWNhdGlvbnMuc2V0KGtleSwgeyB0b2tlbiwgcHJvbWlzZSB9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ0F1dGhlbnRpY2F0aW9ucy5nZXQoa2V5KT8ucHJvbWlzZSA9PT0gcHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQXV0aGVudGljYXRpb25zLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhciB0aGUgY2FjaGVkIHRva2VuIGZvciBhIHNwZWNpZmljIHJlc291cmNlL3Njb3BlIHBhaXIsIGEgd2hvbGUgcmVzb3VyY2UsXG5cdCAqIG9yIGFsbCByZXNvdXJjZXMgaWYgbm8gYXJndW1lbnQgaXMgZ2l2ZW4uIENhbGwgYWZ0ZXIgYSBmYWlsZWQgYGF1dGhlbnRpY2F0ZWBcblx0ICogUlBDIG9yIHdoZW4gdGhlIGFnZW50IGhvc3QgcHJvY2VzcyByZXN0YXJ0cy5cblx0ICovXG5cdGNsZWFyKHJlc291cmNlPzogc3RyaW5nLCBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGlmIChyZXNvdXJjZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoc2NvcGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gdGhpcy5fa2V5KHJlc291cmNlLCBzY29wZXMpO1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlS2V5KGtleSk7XG5cdFx0XHRcdHRoaXMuX2NvbXBsZXRlZFRva2Vucy5kZWxldGUoa2V5KTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0F1dGhlbnRpY2F0aW9ucy5kZWxldGUoa2V5KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJlZml4ID0gYCR7cmVzb3VyY2V9XFx4MDBgO1xuXHRcdFx0Y29uc3Qga2V5cyA9IG5ldyBTZXQoWy4uLnRoaXMuX2NvbXBsZXRlZFRva2Vucy5rZXlzKCksIC4uLnRoaXMuX3BlbmRpbmdBdXRoZW50aWNhdGlvbnMua2V5cygpLCAuLi50aGlzLl9rZXlHZW5lcmF0aW9ucy5rZXlzKCldKTtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGtleXMpIHtcblx0XHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKHByZWZpeCkpIHtcblx0XHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlS2V5KGtleSk7XG5cdFx0XHRcdFx0dGhpcy5fY29tcGxldGVkVG9rZW5zLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdBdXRoZW50aWNhdGlvbnMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZ2xvYmFsR2VuZXJhdGlvbisrO1xuXHRcdFx0dGhpcy5fY29tcGxldGVkVG9rZW5zLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQXV0aGVudGljYXRpb25zLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9rZXlHZW5lcmF0aW9ucy5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ludmFsaWRhdGVLZXkoa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9rZXlHZW5lcmF0aW9ucy5zZXQoa2V5LCAodGhpcy5fa2V5R2VuZXJhdGlvbnMuZ2V0KGtleSkgPz8gMCkgKyAxKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQ3VycmVudEdlbmVyYXRpb24oa2V5OiBzdHJpbmcsIGdsb2JhbEdlbmVyYXRpb246IG51bWJlciwga2V5R2VuZXJhdGlvbjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dsb2JhbEdlbmVyYXRpb24gPT09IGdsb2JhbEdlbmVyYXRpb24gJiYgKHRoaXMuX2tleUdlbmVyYXRpb25zLmdldChrZXkpID8/IDApID09PSBrZXlHZW5lcmF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfa2V5KHJlc291cmNlOiBzdHJpbmcsIHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtyZXNvdXJjZX1cXHgwMCR7c2NvcGVzID8gWy4uLm5ldyBTZXQoc2NvcGVzKV0uc29ydCgpLmpvaW4oJ1xceDAwJykgOiAnJ31gO1xuXHR9XG59XG5cbi8qKlxuICogUmV0dXJucyBhIHN0YWJsZSBpZGVudGl0eSBmb3IgYW4gYXV0aGVudGljYXRpb24gY2hhbGxlbmdlLlxuICovXG5mdW5jdGlvbiBwcm90ZWN0ZWRSZXNvdXJjZUF1dGhlbnRpY2F0aW9uS2V5KHJlc291cmNlOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhKTogc3RyaW5nIHtcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KFtcblx0XHRyZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRbLi4ubmV3IFNldChyZXNvdXJjZS5zY29wZXNfc3VwcG9ydGVkID8/IFtdKV0uc29ydCgpLFxuXHRcdHJlc291cmNlLmF1dGhvcml6YXRpb25fc2VydmVycyA/PyBbXSxcblx0XSk7XG59XG5cbi8qKlxuICogQ29vcmRpbmF0ZXMgcmVjb3ZlcnkgZnJvbSBhdXRoZW50aWNhdGlvbiBjaGFsbGVuZ2VzIGZvciBvbmUgYWdlbnQtaG9zdCBjb25uZWN0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0QXV0aGVudGljYXRpb25SZWNvdmVyeSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc2VudFRva2VucyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdSZWNvdmVyaWVzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzZW50VG9rZW5zLmNsZWFyKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1JlY292ZXJpZXMuY2xlYXIoKTtcblx0fVxuXG5cdHJlY292ZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhLCBvcHRpb25zOiBJQWdlbnRIb3N0QXV0aGVudGljYXRpb25PcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga2V5ID0gcHJvdGVjdGVkUmVzb3VyY2VBdXRoZW50aWNhdGlvbktleShyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcGVuZGluZ1JlY292ZXJ5ID0gdGhpcy5fcGVuZGluZ1JlY292ZXJpZXMuZ2V0KGtleSk7XG5cdFx0aWYgKHBlbmRpbmdSZWNvdmVyeSkge1xuXHRcdFx0cmV0dXJuIHBlbmRpbmdSZWNvdmVyeTtcblx0XHR9XG5cblx0XHRjb25zdCByZWNvdmVyeSA9IHRoaXMuX3JlY292ZXIoYWNjZXNzb3IsIGtleSwgcmVzb3VyY2UsIG9wdGlvbnMpXG5cdFx0XHQuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9wZW5kaW5nUmVjb3Zlcmllcy5nZXQoa2V5KSA9PT0gcmVjb3ZlcnkpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVjb3Zlcmllcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0dGhpcy5fcGVuZGluZ1JlY292ZXJpZXMuc2V0KGtleSwgcmVjb3ZlcnkpO1xuXHRcdHJldHVybiByZWNvdmVyeTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY292ZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGtleTogc3RyaW5nLCByZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSwgb3B0aW9uczogSUFnZW50SG9zdEF1dGhlbnRpY2F0aW9uT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93SWZBdXRoZW50aWNhdGlvblN0YWxlKG9wdGlvbnMpO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHNjb3BlcyA9IHJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQgPz8gW107XG5cdFx0Y29uc3QgdG9rZW4gPSBhd2FpdCByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZShcblx0XHRcdFVSSS5wYXJzZShyZXNvdXJjZS5yZXNvdXJjZSksXG5cdFx0XHRyZXNvdXJjZS5hdXRob3JpemF0aW9uX3NlcnZlcnMgPz8gW10sXG5cdFx0XHRzY29wZXMsXG5cdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0b3B0aW9ucy5sb2dQcmVmaXgsXG5cdFx0KTtcblx0XHR0aHJvd0lmQXV0aGVudGljYXRpb25TdGFsZShvcHRpb25zKTtcblx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7b3B0aW9ucy5sb2dQcmVmaXh9IE5vIHRva2VuIHJlc29sdmVkIGZvciByZXNvdXJjZTogJHtyZXNvdXJjZS5yZXNvdXJjZX1gKTtcblx0XHRcdG9wdGlvbnMuYXV0aFRva2VuQ2FjaGU/LmNsZWFyKHJlc291cmNlLnJlc291cmNlLCByZXNvdXJjZS5zY29wZXNfc3VwcG9ydGVkKTtcblx0XHRcdGlmIChhd2FpdCBmb3J3YXJkQXV0aGVudGljYXRpb25Ub2tlbihvcHRpb25zLCByZXNvdXJjZS5yZXNvdXJjZSwgc2NvcGVzLCAnJykpIHtcblx0XHRcdFx0dGhpcy5fcmVzZW50VG9rZW5zLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7b3B0aW9ucy5sb2dQcmVmaXh9IENsZWFyaW5nIGF1dGhlbnRpY2F0aW9uIGZvciByZXNvdXJjZTogJHtyZXNvdXJjZS5yZXNvdXJjZX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c1Rva2VuID0gdGhpcy5fcmVzZW50VG9rZW5zLmdldChrZXkpO1xuXHRcdGlmIChwcmV2aW91c1Rva2VuICE9PSB1bmRlZmluZWQgJiYgcHJldmlvdXNUb2tlbiA9PT0gdG9rZW4pIHtcblx0XHRcdG9wdGlvbnMuYXV0aFRva2VuQ2FjaGU/LmNsZWFyKHJlc291cmNlLnJlc291cmNlLCByZXNvdXJjZS5zY29wZXNfc3VwcG9ydGVkKTtcblx0XHRcdHRocm93SWZBdXRoZW50aWNhdGlvblN0YWxlKG9wdGlvbnMpO1xuXHRcdFx0Y29uc3QgaW50ZXJhY3RpdmVUb2tlbiA9IGF3YWl0IGZvcmNlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5KGF1dGhlbnRpY2F0aW9uU2VydmljZSwgY29tbWFuZFNlcnZpY2UsIGxvZ1NlcnZpY2UsIHJlc291cmNlLCBvcHRpb25zKTtcblx0XHRcdHRocm93SWZBdXRoZW50aWNhdGlvblN0YWxlKG9wdGlvbnMpO1xuXHRcdFx0aWYgKGludGVyYWN0aXZlVG9rZW4pIHtcblx0XHRcdFx0dGhpcy5fcmVzZW50VG9rZW5zLnNldChrZXksIGludGVyYWN0aXZlVG9rZW4pO1xuXHRcdFx0XHRpZiAoaW50ZXJhY3RpdmVUb2tlbiA9PT0gdG9rZW4pIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7b3B0aW9ucy5sb2dQcmVmaXh9IEludGVyYWN0aXZlIGF1dGhlbnRpY2F0aW9uIGNvbXBsZXRlZCB3aXRob3V0IGEgbmV3IHRva2VuIGZvciAke3Jlc291cmNlLnJlc291cmNlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0b3B0aW9ucy5hdXRoVG9rZW5DYWNoZT8uY2xlYXIocmVzb3VyY2UucmVzb3VyY2UsIHJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQpO1xuXHRcdGlmIChhd2FpdCBmb3J3YXJkQXV0aGVudGljYXRpb25Ub2tlbihvcHRpb25zLCByZXNvdXJjZS5yZXNvdXJjZSwgcmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCA/PyBbXSwgdG9rZW4pKSB7XG5cdFx0XHR0aGlzLl9yZXNlbnRUb2tlbnMuc2V0KGtleSwgdG9rZW4pO1xuXHRcdFx0bG9nU2VydmljZS5pbmZvKGAke29wdGlvbnMubG9nUHJlZml4fSBBdXRoZW50aWNhdGluZyBmb3IgcmVzb3VyY2U6ICR7cmVzb3VyY2UucmVzb3VyY2V9YCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgYSBiZWFyZXIgdG9rZW4gZm9yIGEgcHJvdGVjdGVkIHJlc291cmNlIGJ5IHRyeWluZyBlYWNoXG4gKiBhdXRob3JpemF0aW9uIHNlcnZlciBpbiBvcmRlci4gRmlyc3QgYXR0ZW1wdHMgYW4gZXhhY3Qgc2NvcGUgbWF0Y2gsXG4gKiB0aGVuIGZhbGxzIGJhY2sgdG8gZmluZGluZyB0aGUgc2Vzc2lvbiB3aG9zZSBzY29wZXMgYXJlIHRoZSBuYXJyb3dlc3RcbiAqIHN1cGVyc2V0IG9mIHRoZSByZXF1ZXN0ZWQgc2NvcGVzLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVRva2VuRm9yUmVzb3VyY2UoXG5cdHJlc291cmNlU2VydmVyOiBVUkksXG5cdGF1dGhvcml6YXRpb25TZXJ2ZXJzOiByZWFkb25seSBzdHJpbmdbXSxcblx0c2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSxcblx0YXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0bG9nUHJlZml4OiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRmb3IgKGNvbnN0IHNlcnZlciBvZiBhdXRob3JpemF0aW9uU2VydmVycykge1xuXHRcdGNvbnN0IHNlcnZlclVyaSA9IFVSSS5wYXJzZShzZXJ2ZXIpO1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIoc2VydmVyVXJpLCByZXNvdXJjZVNlcnZlcik7XG5cdFx0aWYgKCFwcm92aWRlcklkKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGAke2xvZ1ByZWZpeH0gTm8gYXV0aCBwcm92aWRlciBmb3VuZCBmb3Igc2VydmVyOiAke3NlcnZlcn1gKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRsb2dTZXJ2aWNlLnRyYWNlKGAke2xvZ1ByZWZpeH0gUmVzb2x2ZWQgYXV0aCBwcm92aWRlciAnJHtwcm92aWRlcklkfScgZm9yIHNlcnZlcjogJHtzZXJ2ZXJ9YCk7XG5cblx0XHQvLyBUcnkgZXhhY3Qgc2NvcGUgbWF0Y2ggZmlyc3Rcblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCBbLi4uc2NvcGVzXSwgeyBhdXRob3JpemF0aW9uU2VydmVyOiBzZXJ2ZXJVcmkgfSwgdHJ1ZSk7XG5cdFx0Y29uc3QgZXhhY3RTZXNzaW9uID0gc2Vzc2lvbnNbMF07XG5cdFx0aWYgKGV4YWN0U2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIGV4YWN0U2Vzc2lvbi5hY2Nlc3NUb2tlbjtcblx0XHR9XG5cblx0XHQvLyBGYWxsIGJhY2s6IGdldCBhbGwgc2Vzc2lvbnMgYW5kIGZpbmQgdGhlIG5hcnJvd2VzdCBzdXBlcnNldCBvZiByZXF1ZXN0ZWQgc2NvcGVzXG5cdFx0Y29uc3QgYWxsU2Vzc2lvbnMgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXJJZCwgdW5kZWZpbmVkLCB7IGF1dGhvcml6YXRpb25TZXJ2ZXI6IHNlcnZlclVyaSB9LCB0cnVlKTtcblx0XHRjb25zdCByZXF1ZXN0ZWRTZXQgPSBuZXcgU2V0KHNjb3Blcyk7XG5cdFx0bGV0IGJlc3RUb2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBiZXN0RXh0cmFTY29wZXMgPSBJbmZpbml0eTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgYWxsU2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25TY29wZXMgPSBuZXcgU2V0KHNlc3Npb24uc2NvcGVzKTtcblx0XHRcdGxldCBpc1N1cGVyc2V0ID0gdHJ1ZTtcblx0XHRcdGZvciAoY29uc3Qgc2NvcGUgb2YgcmVxdWVzdGVkU2V0KSB7XG5cdFx0XHRcdGlmICghc2Vzc2lvblNjb3Blcy5oYXMoc2NvcGUpKSB7XG5cdFx0XHRcdFx0aXNTdXBlcnNldCA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNTdXBlcnNldCkge1xuXHRcdFx0XHRjb25zdCBleHRyYVNjb3BlcyA9IHNlc3Npb25TY29wZXMuc2l6ZSAtIHJlcXVlc3RlZFNldC5zaXplO1xuXHRcdFx0XHRpZiAoZXh0cmFTY29wZXMgPCBiZXN0RXh0cmFTY29wZXMpIHtcblx0XHRcdFx0XHRiZXN0RXh0cmFTY29wZXMgPSBleHRyYVNjb3Blcztcblx0XHRcdFx0XHRiZXN0VG9rZW4gPSBzZXNzaW9uLmFjY2Vzc1Rva2VuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChiZXN0VG9rZW4pIHtcblx0XHRcdHJldHVybiBiZXN0VG9rZW47XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdEF1dGhlbnRpY2F0ZVJlcXVlc3Qge1xuXHRyZWFkb25seSByZXNvdXJjZTogc3RyaW5nO1xuXHRyZWFkb25seSBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqIEFuIGVtcHR5IHRva2VuIHJldm9rZXMgdGhlIGNyZWRlbnRpYWwgcHJldmlvdXNseSBmb3J3YXJkZWQgZm9yIHRoaXMgcmVzb3VyY2UgYW5kIHNjb3BlIHNldC4gKi9cblx0cmVhZG9ubHkgdG9rZW46IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0QXV0aGVudGljYXRpb25PcHRpb25zIHtcblx0cmVhZG9ubHkgYXV0aFRva2VuQ2FjaGU/OiBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZTtcblx0cmVhZG9ubHkgbG9nUHJlZml4OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlzQ3VycmVudD86ICgpID0+IGJvb2xlYW47XG5cdHJlYWRvbmx5IGF1dGhlbnRpY2F0ZTogKHJlcXVlc3Q6IElBZ2VudEhvc3RBdXRoZW50aWNhdGVSZXF1ZXN0KSA9PiBQcm9taXNlPHVua25vd24+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RNY3BBdXRoZW50aWNhdGlvbk9wdGlvbnNCYXNlIHtcblx0cmVhZG9ubHkgYWxsb3dJbnRlcmFjdGlvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgYXV0aFRva2VuQ2FjaGU/OiBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZTtcblx0cmVhZG9ubHkgbG9nUHJlZml4OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1jcFNlcnZlcklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1jcFNlcnZlck5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgbWNwU2VydmVyVXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9hdXRoQ2xpZW50PzogTWNwT0F1dGhDbGllbnQ7XG5cdHJlYWRvbmx5IHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YUZldGNoZXI/OiB0eXBlb2YgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGE7XG5cdC8qKlxuXHQgKiBJZGVudGlmaWVzIHRoZSBhZ2VudCBob3N0IGJhY2tpbmcgdGhpcyBNQ1Agc2VydmVyIHNvIHJlbWVtYmVyZWQtYXV0aFxuXHQgKiBlbnRyaWVzIGNhbiBiZSBzdXJmYWNlZCBpbiB0aGVpciBvd24gc2VjdGlvbiBvZiB0aGUgXCJNYW5hZ2UgVHJ1c3RlZCBNQ1Bcblx0ICogU2VydmVyc1wiIHBpY2tlci4gV2hlbiBzZXQsIHRoZSByZXNvbHZlZCBob3N0IGxhYmVsICh2aWFcblx0ICoge0BsaW5rIElMYWJlbFNlcnZpY2UuZ2V0SG9zdExhYmVsfSkgaXMgcmVjb3JkZWQgb24gdGhlIGFsbG93ZWQtc2VydmVyXG5cdCAqIGVudHJ5LiBPbWl0IGZvciBub24tYWdlbnQtaG9zdCBjYWxsZXJzLlxuXHQgKi9cblx0cmVhZG9ubHkgYWdlbnRIb3N0PzogeyByZWFkb25seSBzY2hlbWU6IHN0cmluZzsgcmVhZG9ubHkgYXV0aG9yaXR5OiBzdHJpbmcgfTtcblx0cmVhZG9ubHkgYXV0aGVudGljYXRlOiAocmVxdWVzdDogSUFnZW50SG9zdEF1dGhlbnRpY2F0ZVJlcXVlc3QpID0+IFByb21pc2U8dW5rbm93bj47XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGZvcndhcmRBdXRoZW50aWNhdGlvblRva2VuKFxuXHRvcHRpb25zOiBQaWNrPElBZ2VudEhvc3RBdXRoZW50aWNhdGlvbk9wdGlvbnMsICdhdXRoVG9rZW5DYWNoZScgfCAnYXV0aGVudGljYXRlJyB8ICdpc0N1cnJlbnQnPixcblx0cmVzb3VyY2U6IHN0cmluZyxcblx0c2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSxcblx0dG9rZW46IHN0cmluZyxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHR0aHJvd0lmQXV0aGVudGljYXRpb25TdGFsZShvcHRpb25zKTtcblx0Y29uc3QgcmVxdWVzdCA9IHsgcmVzb3VyY2UsIHNjb3BlcywgdG9rZW4gfTtcblx0aWYgKG9wdGlvbnMuYXV0aFRva2VuQ2FjaGUpIHtcblx0XHRyZXR1cm4gb3B0aW9ucy5hdXRoVG9rZW5DYWNoZS5hdXRoZW50aWNhdGUocmVzb3VyY2UsIHNjb3BlcywgdG9rZW4sICgpID0+IG9wdGlvbnMuYXV0aGVudGljYXRlKHJlcXVlc3QpKTtcblx0fVxuXHRhd2FpdCBvcHRpb25zLmF1dGhlbnRpY2F0ZShyZXF1ZXN0KTtcblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHRocm93SWZBdXRoZW50aWNhdGlvblN0YWxlKG9wdGlvbnM6IFBpY2s8SUFnZW50SG9zdEF1dGhlbnRpY2F0aW9uT3B0aW9ucywgJ2lzQ3VycmVudCc+KTogdm9pZCB7XG5cdGlmIChvcHRpb25zLmlzQ3VycmVudD8uKCkgPT09IGZhbHNlKSB7XG5cdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXNvbHZlcyBhbmQgZm9yd2FyZHMgYmVhcmVyIHRva2VucyBmb3IgdGhlIHByb3RlY3RlZCByZXNvdXJjZXMgZGVjbGFyZWQgYnlcbiAqIHRoZSBhZ2VudHMgY3VycmVudGx5IHB1Ymxpc2hlZCBmcm9tIGFuIGFnZW50IGhvc3QuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRhZ2VudHM6IHJlYWRvbmx5IEFnZW50SW5mb1tdLFxuXHRvcHRpb25zOiBJQWdlbnRIb3N0QXV0aGVudGljYXRpb25PcHRpb25zLFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnRzKSB7XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBhZ2VudC5wcm90ZWN0ZWRSZXNvdXJjZXMgPz8gW10pIHtcblx0XHRcdGF3YWl0IGF1dGhlbnRpY2F0ZVByb3RlY3RlZFJlc291cmNlV2l0aFNlcnZpY2VzKGF1dGhlbnRpY2F0aW9uU2VydmljZSwgbG9nU2VydmljZSwgcmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFJlc29sdmVzIGFuZCBmb3J3YXJkcyBhIGJlYXJlciB0b2tlbiBmb3IgYSBzaW5nbGUgcHJvdGVjdGVkIHJlc291cmNlLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXV0aGVudGljYXRlUHJvdGVjdGVkUmVzb3VyY2UoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRyZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSxcblx0b3B0aW9uczogSUFnZW50SG9zdEF1dGhlbnRpY2F0aW9uT3B0aW9ucyxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRyZXR1cm4gYXV0aGVudGljYXRlUHJvdGVjdGVkUmVzb3VyY2VXaXRoU2VydmljZXMoYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvblNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpLCByZXNvdXJjZSwgb3B0aW9ucyk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGF1dGhlbnRpY2F0ZVByb3RlY3RlZFJlc291cmNlV2l0aFNlcnZpY2VzKFxuXHRhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRyZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSxcblx0b3B0aW9uczogSUFnZW50SG9zdEF1dGhlbnRpY2F0aW9uT3B0aW9ucyxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHR0aHJvd0lmQXV0aGVudGljYXRpb25TdGFsZShvcHRpb25zKTtcblx0Y29uc3QgdG9rZW4gPSBhd2FpdCByZXNvbHZlVG9rZW5Gb3JQcm90ZWN0ZWRSZXNvdXJjZShhdXRoZW50aWNhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2UsIHJlc291cmNlLCBvcHRpb25zKTtcblx0dGhyb3dJZkF1dGhlbnRpY2F0aW9uU3RhbGUob3B0aW9ucyk7XG5cblx0Y29uc3QgYXV0aGVudGljYXRlZCA9IGF3YWl0IGZvcndhcmRBdXRoZW50aWNhdGlvblRva2VuKG9wdGlvbnMsIHJlc291cmNlLnJlc291cmNlLCByZXNvdXJjZS5zY29wZXNfc3VwcG9ydGVkID8/IFtdLCB0b2tlbiA/PyAnJyk7XG5cdGlmICghYXV0aGVudGljYXRlZCkge1xuXHRcdGxvZ1NlcnZpY2UudHJhY2UoYCR7b3B0aW9ucy5sb2dQcmVmaXh9IEF1dGhlbnRpY2F0aW9uIHN0YXRlIGZvciAke3Jlc291cmNlLnJlc291cmNlfSB1bmNoYW5nZWQ7IHNraXBwaW5nIGF1dGhlbnRpY2F0ZSBSUENgKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0bG9nU2VydmljZS5pbmZvKHRva2VuXG5cdFx0PyBgJHtvcHRpb25zLmxvZ1ByZWZpeH0gQXV0aGVudGljYXRpbmcgZm9yIHJlc291cmNlOiAke3Jlc291cmNlLnJlc291cmNlfWBcblx0XHQ6IGAke29wdGlvbnMubG9nUHJlZml4fSBDbGVhcmluZyBhdXRoZW50aWNhdGlvbiBmb3IgcmVzb3VyY2U6ICR7cmVzb3VyY2UucmVzb3VyY2V9YCk7XG5cdHJldHVybiB0cnVlO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlVG9rZW5Gb3JQcm90ZWN0ZWRSZXNvdXJjZShcblx0YXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0cmVzb3VyY2U6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEsXG5cdG9wdGlvbnM6IFBpY2s8SUFnZW50SG9zdEF1dGhlbnRpY2F0aW9uT3B0aW9ucywgJ2xvZ1ByZWZpeCc+LFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgdG9rZW4gPSBhd2FpdCByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZShcblx0XHRVUkkucGFyc2UocmVzb3VyY2UucmVzb3VyY2UpLFxuXHRcdHJlc291cmNlLmF1dGhvcml6YXRpb25fc2VydmVycyA/PyBbXSxcblx0XHRyZXNvdXJjZS5zY29wZXNfc3VwcG9ydGVkID8/IFtdLFxuXHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRsb2dTZXJ2aWNlLFxuXHRcdG9wdGlvbnMubG9nUHJlZml4LFxuXHQpO1xuXHRpZiAoIXRva2VuKSB7XG5cdFx0bG9nU2VydmljZS5pbmZvKGAke29wdGlvbnMubG9nUHJlZml4fSBObyB0b2tlbiByZXNvbHZlZCBmb3IgcmVzb3VyY2U6ICR7cmVzb3VyY2UucmVzb3VyY2V9YCk7XG5cdH1cblx0cmV0dXJuIHRva2VuO1xufVxuXG4vKipcbiAqIFByb21wdHMgdGhlIHVzZXIgdG8gYXV0aGVudGljYXRlIG9uZSBvZiB0aGUgcHJvdmlkZWQgcHJvdGVjdGVkIHJlc291cmNlcyBhbmRcbiAqIGZvcndhcmRzIHRoZSByZXN1bHRpbmcgdG9rZW4gdG8gdGhlIGFnZW50IGhvc3QgY29ubmVjdGlvbi5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc29sdmVBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlbHkoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRwcm90ZWN0ZWRSZXNvdXJjZXM6IHJlYWRvbmx5IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGFbXSxcblx0b3B0aW9uczogSUFnZW50SG9zdEF1dGhlbnRpY2F0aW9uT3B0aW9ucyxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCBhdXRoZW50aWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHByb3RlY3RlZFJlc291cmNlcykge1xuXHRcdHRocm93SWZBdXRoZW50aWNhdGlvblN0YWxlKG9wdGlvbnMpO1xuXHRcdGNvbnN0IHJlc291cmNlVXJpID0gVVJJLnBhcnNlKHJlc291cmNlLnJlc291cmNlKTtcblx0XHRjb25zdCBzY29wZXMgPSByZXNvdXJjZS5zY29wZXNfc3VwcG9ydGVkID8/IFtdO1xuXHRcdGNvbnN0IGV4aXN0aW5nVG9rZW4gPSBhd2FpdCByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZShcblx0XHRcdHJlc291cmNlVXJpLFxuXHRcdFx0cmVzb3VyY2UuYXV0aG9yaXphdGlvbl9zZXJ2ZXJzID8/IFtdLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdG9wdGlvbnMubG9nUHJlZml4LFxuXHRcdCk7XG5cdFx0dGhyb3dJZkF1dGhlbnRpY2F0aW9uU3RhbGUob3B0aW9ucyk7XG5cdFx0aWYgKGV4aXN0aW5nVG9rZW4pIHtcblx0XHRcdGF3YWl0IGZvcndhcmRBdXRoZW50aWNhdGlvblRva2VuKG9wdGlvbnMsIHJlc291cmNlLnJlc291cmNlLCBzY29wZXMsIGV4aXN0aW5nVG9rZW4pO1xuXHRcdFx0bG9nU2VydmljZS5pbmZvKGAke29wdGlvbnMubG9nUHJlZml4fSBJbnRlcmFjdGl2ZSBhdXRoZW50aWNhdGlvbiBzdWNjZWVkZWQgZm9yICR7cmVzb3VyY2UucmVzb3VyY2V9YCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gKGF3YWl0IGZvcmNlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5KGF1dGhlbnRpY2F0aW9uU2VydmljZSwgY29tbWFuZFNlcnZpY2UsIGxvZ1NlcnZpY2UsIHJlc291cmNlLCBvcHRpb25zKSkgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZm9yY2VBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlbHkoXG5cdGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0Y29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdHJlc291cmNlOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhLFxuXHRvcHRpb25zOiBJQWdlbnRIb3N0QXV0aGVudGljYXRpb25PcHRpb25zLFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0dGhyb3dJZkF1dGhlbnRpY2F0aW9uU3RhbGUob3B0aW9ucyk7XG5cdGNvbnN0IHNjb3BlcyA9IHJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQgPz8gW107XG5cdGNvbnN0IHNldHVwUmVzdWx0ID0gYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SUNoYXRTZXR1cFJlc3VsdD4oQ0hBVF9TRVRVUF9BQ1RJT05fSUQsIHVuZGVmaW5lZCwge1xuXHRcdGZvcmNlU2lnbkluRGlhbG9nOiB0cnVlLFxuXHRcdGFkZGl0aW9uYWxTY29wZXM6IHNjb3Blcyxcblx0XHRkaWFsb2dUaXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5zaWduSW5EaWFsb2dUaXRsZScsIFwiU2lnbiBpbiB0byB1c2UgR2l0SHViIENvcGlsb3RcIiksXG5cdFx0ZGlzYWJsZUNoYXRWaWV3UmV2ZWFsOiB0cnVlLFxuXHRcdHJldHVyblJlc3VsdDogdHJ1ZSxcblx0fSk7XG5cdHRocm93SWZBdXRoZW50aWNhdGlvblN0YWxlKG9wdGlvbnMpO1xuXHRpZiAoc2V0dXBSZXN1bHQ/LnN1Y2Nlc3MgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKCFzZXR1cFJlc3VsdC5zdWNjZXNzKSB7XG5cdFx0dGhyb3cgc2V0dXBSZXN1bHQuZXJyb3IgPz8gbmV3IEVycm9yKGxvY2FsaXplKCdhZ2VudEhvc3Quc2lnbkluRmFpbGVkJywgXCJGYWlsZWQgdG8gc2lnbiBpbiB0byB1c2UgR2l0SHViIENvcGlsb3QuXCIpKTtcblx0fVxuXHRjb25zdCB0b2tlbiA9IGF3YWl0IHJlc29sdmVUb2tlbkZvclJlc291cmNlKFxuXHRcdFVSSS5wYXJzZShyZXNvdXJjZS5yZXNvdXJjZSksXG5cdFx0cmVzb3VyY2UuYXV0aG9yaXphdGlvbl9zZXJ2ZXJzID8/IFtdLFxuXHRcdHNjb3Blcyxcblx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0bG9nU2VydmljZSxcblx0XHRvcHRpb25zLmxvZ1ByZWZpeCxcblx0KTtcblx0dGhyb3dJZkF1dGhlbnRpY2F0aW9uU3RhbGUob3B0aW9ucyk7XG5cdGlmICghdG9rZW4pIHtcblx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7b3B0aW9ucy5sb2dQcmVmaXh9IEludGVyYWN0aXZlIGF1dGhlbnRpY2F0aW9uIGRpZCBub3QgcHJvdmlkZSBhIHRva2VuIGZvciAke3Jlc291cmNlLnJlc291cmNlfWApO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0b3B0aW9ucy5hdXRoVG9rZW5DYWNoZT8uY2xlYXIocmVzb3VyY2UucmVzb3VyY2UsIHNjb3Blcyk7XG5cdGlmICghYXdhaXQgZm9yd2FyZEF1dGhlbnRpY2F0aW9uVG9rZW4ob3B0aW9ucywgcmVzb3VyY2UucmVzb3VyY2UsIHNjb3BlcywgdG9rZW4pKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsb2dTZXJ2aWNlLmluZm8oYCR7b3B0aW9ucy5sb2dQcmVmaXh9IEludGVyYWN0aXZlIGF1dGhlbnRpY2F0aW9uIGNvbXBsZXRlZCBmb3IgJHtyZXNvdXJjZS5yZXNvdXJjZX1gKTtcblx0cmV0dXJuIHRva2VuO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0cHJvdGVjdGVkUmVzb3VyY2U6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEsXG5cdG9wdGlvbnM6IElBZ2VudEhvc3RNY3BBdXRoZW50aWNhdGlvbk9wdGlvbnNCYXNlLFxuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UpO1xuXHRjb25zdCBhdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSk7XG5cdGNvbnN0IGF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSk7XG5cdGNvbnN0IGR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UpO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0Y29uc3QgYWdlbnRIb3N0TWV0YSA9IG9wdGlvbnMuYWdlbnRIb3N0XG5cdFx0PyB7IGF1dGhvcml0eTogb3B0aW9ucy5hZ2VudEhvc3QuYXV0aG9yaXR5LCBsYWJlbDogYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpLmdldEhvc3RMYWJlbChvcHRpb25zLmFnZW50SG9zdC5zY2hlbWUsIG9wdGlvbnMuYWdlbnRIb3N0LmF1dGhvcml0eSkgfVxuXHRcdDogdW5kZWZpbmVkO1xuXHQvLyBHaXRIdWIgTUNQIHN1cHBvcnRzIGRlbWFuZC1kcml2ZW4gc3RlcC11cCBhdXRoLCB3aGlsZSBvdGhlciBzZXJ2ZXJzIG1heSByZWplY3QgYXV0aG9yaXphdGlvbiByZXF1ZXN0cyB3aXRoIG5vIHNjb3Blcy5cblx0Y29uc3Qgc2NvcGVzID0gb3B0aW9ucy5zY29wZXMubGVuZ3RoID4gMCB8fCBpc0dpdEh1Yk1jcFJlc291cmNlKHByb3RlY3RlZFJlc291cmNlKVxuXHRcdD8gb3B0aW9ucy5zY29wZXNcblx0XHQ6IHByb3RlY3RlZFJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQgPz8gW107XG5cdGNvbnN0IGF1dGhlbnRpY2F0aW9uT3BlcmF0aW9ucyA9IGdldE1jcEF1dGhlbnRpY2F0aW9uT3BlcmF0aW9ucyhhdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRmb3IgKGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgb2YgcHJvdGVjdGVkUmVzb3VyY2UuYXV0aG9yaXphdGlvbl9zZXJ2ZXJzID8/IFtdKSB7XG5cdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlclVyaSA9IFVSSS5wYXJzZShhdXRob3JpemF0aW9uU2VydmVyKTtcblx0XHRjb25zdCBwcm92aWRlck9wZXJhdGlvbklkID0gZ2V0RHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZChhdXRob3JpemF0aW9uU2VydmVyVXJpLCBwcm90ZWN0ZWRSZXNvdXJjZSk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRlZCA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uT3BlcmF0aW9ucy5xdWV1ZShwcm92aWRlck9wZXJhdGlvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcklkID0gYXdhaXQgZ2V0T3JDcmVhdGVQcm92aWRlckZvck1jcFJlc291cmNlKFxuXHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyVXJpLFxuXHRcdFx0XHRwcm90ZWN0ZWRSZXNvdXJjZSxcblx0XHRcdFx0b3B0aW9ucy5vYXV0aENsaWVudCxcblx0XHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRkeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0XHRvcHRpb25zLmxvZ1ByZWZpeCxcblx0XHRcdFx0b3B0aW9ucy5hbGxvd0ludGVyYWN0aW9uLFxuXHRcdFx0XHRvcHRpb25zLmF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YUZldGNoZXIgPz8gZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsXG5cdFx0XHQpO1xuXHRcdFx0aWYgKCFwcm92aWRlcklkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb2F1dGhDbGllbnRPcHRpb25zID0gb3B0aW9ucy5vYXV0aENsaWVudFxuXHRcdFx0XHQ/IHsgY2xpZW50SWQ6IG9wdGlvbnMub2F1dGhDbGllbnQuY2xpZW50SWQsIGNsaWVudFNlY3JldDogb3B0aW9ucy5vYXV0aENsaWVudC5jbGllbnRTZWNyZXQgfVxuXHRcdFx0XHQ6IHt9O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXJJZCwgWy4uLnNjb3Blc10sIHtcblx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcjogYXV0aG9yaXphdGlvblNlcnZlclVyaSxcblx0XHRcdFx0cmVzb3VyY2U6IHByb3RlY3RlZFJlc291cmNlLnJlc291cmNlLFxuXHRcdFx0XHQuLi5vYXV0aENsaWVudE9wdGlvbnMsXG5cdFx0XHRcdHNpbGVudDogIW9wdGlvbnMuYWxsb3dJbnRlcmFjdGlvbixcblx0XHRcdH0sIHRydWUpO1xuXHRcdFx0Y29uc3QgYWxsb3dlZFNlc3Npb24gPSBnZXRBbGxvd2VkTWNwU2Vzc2lvbihwcm92aWRlcklkLCBzZXNzaW9ucywgYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLCBhdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsIG9wdGlvbnMpO1xuXHRcdFx0aWYgKGFsbG93ZWRTZXNzaW9uKSB7XG5cdFx0XHRcdGF3YWl0IGF1dGhlbnRpY2F0ZU1jcFNlc3Npb24ocHJvdmlkZXJJZCwgYWxsb3dlZFNlc3Npb24sIHNjb3BlcywgYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLCBhdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsIGF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBvcHRpb25zLCBmYWxzZSwgYWdlbnRIb3N0TWV0YSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIW9wdGlvbnMuYWxsb3dJbnRlcmFjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zLmxlbmd0aFxuXHRcdFx0XHQ/IHByb3ZpZGVyLnN1cHBvcnRzTXVsdGlwbGVBY2NvdW50c1xuXHRcdFx0XHRcdD8gYXdhaXQgYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLnNlbGVjdFNlc3Npb24ocHJvdmlkZXJJZCwgb3B0aW9ucy5tY3BTZXJ2ZXJJZCwgb3B0aW9ucy5tY3BTZXJ2ZXJOYW1lLCBbLi4uc2NvcGVzXSwgc2Vzc2lvbnMpXG5cdFx0XHRcdFx0OiBzZXNzaW9uc1swXVxuXHRcdFx0XHQ6IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5jcmVhdGVTZXNzaW9uKHByb3ZpZGVySWQsIFsuLi5zY29wZXNdLCB7XG5cdFx0XHRcdFx0YWN0aXZhdGVJbW1lZGlhdGU6IHRydWUsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcjogYXV0aG9yaXphdGlvblNlcnZlclVyaSxcblx0XHRcdFx0XHRyZXNvdXJjZTogcHJvdGVjdGVkUmVzb3VyY2UucmVzb3VyY2UsXG5cdFx0XHRcdFx0Li4ub2F1dGhDbGllbnRPcHRpb25zLFxuXHRcdFx0XHR9KTtcblx0XHRcdGF3YWl0IGF1dGhlbnRpY2F0ZU1jcFNlc3Npb24ocHJvdmlkZXJJZCwgc2Vzc2lvbiwgc2NvcGVzLCBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsIGF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwgYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsIGxvZ1NlcnZpY2UsIG9wdGlvbnMsIHRydWUsIGFnZW50SG9zdE1ldGEpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0aWYgKGF1dGhlbnRpY2F0ZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmNvbnN0IG1jcEF1dGhlbnRpY2F0aW9uT3BlcmF0aW9ucyA9IG5ldyBXZWFrTWFwPElBdXRoZW50aWNhdGlvblNlcnZpY2UsIFNlcXVlbmNlckJ5S2V5PHN0cmluZz4+KCk7XG5cbmZ1bmN0aW9uIGdldE1jcEF1dGhlbnRpY2F0aW9uT3BlcmF0aW9ucyhhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UpOiBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+IHtcblx0bGV0IG9wZXJhdGlvbnMgPSBtY3BBdXRoZW50aWNhdGlvbk9wZXJhdGlvbnMuZ2V0KGF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdGlmICghb3BlcmF0aW9ucykge1xuXHRcdG9wZXJhdGlvbnMgPSBuZXcgU2VxdWVuY2VyQnlLZXkoKTtcblx0XHRtY3BBdXRoZW50aWNhdGlvbk9wZXJhdGlvbnMuc2V0KGF1dGhlbnRpY2F0aW9uU2VydmljZSwgb3BlcmF0aW9ucyk7XG5cdH1cblx0cmV0dXJuIG9wZXJhdGlvbnM7XG59XG5cbmZ1bmN0aW9uIGlzR2l0SHViTWNwUmVzb3VyY2UocmVzb3VyY2U6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEpOiBib29sZWFuIHtcblx0cmV0dXJuIHJlc291cmNlLnJlc291cmNlX25hbWUgPT09ICdHaXRIdWIgTUNQIFNlcnZlcic7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldE9yQ3JlYXRlUHJvdmlkZXJGb3JNY3BSZXNvdXJjZShcblx0YXV0aG9yaXphdGlvblNlcnZlcjogVVJJLFxuXHRwcm90ZWN0ZWRSZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSxcblx0b2F1dGhDbGllbnQ6IE1jcE9BdXRoQ2xpZW50IHwgdW5kZWZpbmVkLFxuXHRhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdGR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2U6IElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0bG9nUHJlZml4OiBzdHJpbmcsXG5cdGFsbG93Q3JlYXRpb246IGJvb2xlYW4sXG5cdGF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YUZldGNoZXI6IHR5cGVvZiBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSxcbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IHJlc291cmNlVXJpID0gVVJJLnBhcnNlKHByb3RlY3RlZFJlc291cmNlLnJlc291cmNlKTtcblx0Y29uc3QgZHluYW1pY1Byb3ZpZGVySWQgPSBnZXREeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcklkKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHByb3RlY3RlZFJlc291cmNlKTtcblx0bGV0IGNsaWVudElkID0gb2F1dGhDbGllbnQ/LmNsaWVudElkO1xuXHRsZXQgY2xpZW50U2VjcmV0ID0gb2F1dGhDbGllbnQ/LmNsaWVudFNlY3JldDtcblx0aWYgKG9hdXRoQ2xpZW50KSB7XG5cdFx0Y29uc3QgaXNQcm92aWRlckFjdGl2ZSA9IGF1dGhlbnRpY2F0aW9uU2VydmljZS5pc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyKGR5bmFtaWNQcm92aWRlcklkKTtcblx0XHRjb25zdCByZWdpc3RlcmVkQ2xpZW50ID0gYXdhaXQgZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZS5nZXRDbGllbnRSZWdpc3RyYXRpb24oZHluYW1pY1Byb3ZpZGVySWQpO1xuXHRcdGNvbnN0IGNsaWVudE1hdGNoZXMgPSByZWdpc3RlcmVkQ2xpZW50Py5jbGllbnRJZCA9PT0gb2F1dGhDbGllbnQuY2xpZW50SWQgJiYgcmVnaXN0ZXJlZENsaWVudC5jbGllbnRTZWNyZXQgPT09IG9hdXRoQ2xpZW50LmNsaWVudFNlY3JldDtcblx0XHRpZiAoY2xpZW50TWF0Y2hlcykge1xuXHRcdFx0aWYgKGlzUHJvdmlkZXJBY3RpdmUpIHtcblx0XHRcdFx0cmV0dXJuIGR5bmFtaWNQcm92aWRlcklkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIWFsbG93Q3JlYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChpc1Byb3ZpZGVyQWN0aXZlKSB7XG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS51bnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihkeW5hbWljUHJvdmlkZXJJZCk7XG5cdFx0XHRcdGF3YWl0IGR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UucmVtb3ZlRHluYW1pY1Byb3ZpZGVyKGR5bmFtaWNQcm92aWRlcklkKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIoYXV0aG9yaXphdGlvblNlcnZlciwgcmVzb3VyY2VVcmkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblx0XHRjb25zdCByZWdpc3RlcmVkQ2xpZW50ID0gYXdhaXQgZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZS5nZXRDbGllbnRSZWdpc3RyYXRpb24oZHluYW1pY1Byb3ZpZGVySWQpO1xuXHRcdGlmICghcmVnaXN0ZXJlZENsaWVudD8uY2xpZW50SWQgJiYgIWFsbG93Q3JlYXRpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNsaWVudElkID0gcmVnaXN0ZXJlZENsaWVudD8uY2xpZW50SWQ7XG5cdFx0Y2xpZW50U2VjcmV0ID0gcmVnaXN0ZXJlZENsaWVudD8uY2xpZW50U2VjcmV0O1xuXHR9XG5cblx0dHJ5IHtcblx0XHRjb25zdCB7IG1ldGFkYXRhIH0gPSBhd2FpdCBhdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGFGZXRjaGVyKGF1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcodHJ1ZSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyKGF1dGhvcml6YXRpb25TZXJ2ZXIsIG1ldGFkYXRhLCBwcm90ZWN0ZWRSZXNvdXJjZSwgY2xpZW50SWQsIGNsaWVudFNlY3JldCk7XG5cdFx0cmV0dXJuIHByb3ZpZGVyPy5pZDtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0bG9nU2VydmljZS53YXJuKGAke2xvZ1ByZWZpeH0gRmFpbGVkIHRvIGNyZWF0ZSBNQ1AgYXV0aCBwcm92aWRlciBmb3IgJHthdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKHRydWUpfWAsIGVycik7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRBbGxvd2VkTWNwU2Vzc2lvbihcblx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRzZXNzaW9uczogcmVhZG9ubHkgQXV0aGVudGljYXRpb25TZXNzaW9uW10sXG5cdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZTogSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSxcblx0YXV0aGVudGljYXRpb25NY3BTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLFxuXHRvcHRpb25zOiBJQWdlbnRIb3N0TWNwQXV0aGVudGljYXRpb25PcHRpb25zQmFzZSxcbik6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGFjY291bnROYW1lUHJlZmVyZW5jZSA9IGF1dGhlbnRpY2F0aW9uTWNwU2VydmljZS5nZXRBY2NvdW50UHJlZmVyZW5jZShvcHRpb25zLm1jcFNlcnZlcklkLCBwcm92aWRlcklkKTtcblx0aWYgKGFjY291bnROYW1lUHJlZmVyZW5jZSkge1xuXHRcdGNvbnN0IHByZWZlcnJlZCA9IHNlc3Npb25zLmZpbmQoc2Vzc2lvbiA9PiBzZXNzaW9uLmFjY291bnQubGFiZWwgPT09IGFjY291bnROYW1lUHJlZmVyZW5jZSk7XG5cdFx0aWYgKHByZWZlcnJlZCAmJiBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkRm9yVXJsKHByb3ZpZGVySWQsIHByZWZlcnJlZC5hY2NvdW50LmxhYmVsLCBvcHRpb25zLm1jcFNlcnZlcklkLCBvcHRpb25zLm1jcFNlcnZlclVybCkpIHtcblx0XHRcdHJldHVybiBwcmVmZXJyZWQ7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMSAmJiBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkRm9yVXJsKHByb3ZpZGVySWQsIHNlc3Npb25zWzBdLmFjY291bnQubGFiZWwsIG9wdGlvbnMubWNwU2VydmVySWQsIG9wdGlvbnMubWNwU2VydmVyVXJsKSkge1xuXHRcdHJldHVybiBzZXNzaW9uc1swXTtcblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGF1dGhlbnRpY2F0ZU1jcFNlc3Npb24oXG5cdHByb3ZpZGVySWQ6IHN0cmluZyxcblx0c2Vzc2lvbjogQXV0aGVudGljYXRpb25TZXNzaW9uLFxuXHRzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsXG5cdGF1dGhlbnRpY2F0aW9uTWNwU2VydmljZTogSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSxcblx0YXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdG9wdGlvbnM6IElBZ2VudEhvc3RNY3BBdXRoZW50aWNhdGlvbk9wdGlvbnNCYXNlLFxuXHR1cGRhdGVBY2Nlc3M6IGJvb2xlYW4sXG5cdGFnZW50SG9zdDogeyByZWFkb25seSBhdXRob3JpdHk6IHN0cmluZzsgcmVhZG9ubHkgbGFiZWw6IHN0cmluZyB9IHwgdW5kZWZpbmVkLFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGF3YWl0IGZvcndhcmRBdXRoZW50aWNhdGlvblRva2VuKG9wdGlvbnMsIG9wdGlvbnMubWNwU2VydmVyVXJsLCBzY29wZXMsIHNlc3Npb24uYWNjZXNzVG9rZW4pO1xuXHRpZiAodXBkYXRlQWNjZXNzKSB7XG5cdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKHByb3ZpZGVySWQsIHNlc3Npb24uYWNjb3VudC5sYWJlbCwgW3sgaWQ6IG9wdGlvbnMubWNwU2VydmVySWQsIG5hbWU6IG9wdGlvbnMubWNwU2VydmVyTmFtZSwgYWxsb3dlZDogdHJ1ZSwgdXJsOiBvcHRpb25zLm1jcFNlcnZlclVybCwgYWdlbnRIb3N0IH1dKTtcblx0XHRhdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UudXBkYXRlQWNjb3VudFByZWZlcmVuY2Uob3B0aW9ucy5tY3BTZXJ2ZXJJZCwgcHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50KTtcblx0fVxuXHRhdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5hZGRBY2NvdW50VXNhZ2UocHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBzY29wZXMsIG9wdGlvbnMubWNwU2VydmVySWQsIG9wdGlvbnMubWNwU2VydmVyTmFtZSk7XG5cdGxvZ1NlcnZpY2UuaW5mbyhgJHtvcHRpb25zLmxvZ1ByZWZpeH0gTUNQIGF1dGhlbnRpY2F0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
