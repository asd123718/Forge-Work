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
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, isDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { equalsIgnoreCase, isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { isString } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IAuthenticationAccessService } from "./authenticationAccessService.js";
import { IAuthenticationService, isAuthenticationWwwAuthenticateRequest } from "../common/authentication.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { ActivationKind, IExtensionService } from "../../extensions/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { match } from "../../../../base/common/glob.js";
import { parseWWWAuthenticateHeader } from "../../../../base/common/oauth.js";
import { raceCancellation, raceTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
function getAuthenticationProviderActivationEvent(id) {
  return `onAuthenticationRequest:${id}`;
}
async function getCurrentAuthenticationSessionInfo(secretStorageService, productService) {
  const authenticationSessionValue = await secretStorageService.get(`${productService.urlProtocol}.loginAccount`);
  if (authenticationSessionValue) {
    try {
      const authenticationSessionInfo = JSON.parse(authenticationSessionValue);
      if (authenticationSessionInfo && isString(authenticationSessionInfo.id) && isString(authenticationSessionInfo.accessToken) && isString(authenticationSessionInfo.providerId)) {
        return authenticationSessionInfo;
      }
    } catch (e) {
      console.error(`Failed parsing current auth session value: ${e}`);
    }
  }
  return void 0;
}
const authenticationDefinitionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description: localize("authentication.id", "The id of the authentication provider.")
    },
    label: {
      type: "string",
      description: localize("authentication.label", "The human readable name of the authentication provider.")
    },
    authorizationServerGlobs: {
      type: "array",
      items: {
        type: "string",
        description: localize("authentication.authorizationServerGlobs", "A list of globs that match the authorization servers that this provider supports.")
      },
      description: localize("authentication.authorizationServerGlobsDescription", "A list of globs that match the authorization servers that this provider supports.")
    }
  }
};
const authenticationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "authentication",
  jsonSchema: {
    description: localize({ key: "authenticationExtensionPoint", comment: [`'Contributes' means adds here`] }, "Contributes authentication"),
    type: "array",
    items: authenticationDefinitionSchema
  },
  activationEventsGenerator: function* (authenticationProviders) {
    for (const authenticationProvider of authenticationProviders) {
      if (authenticationProvider.id) {
        yield `onAuthenticationRequest:${authenticationProvider.id}`;
      }
    }
  }
});
let AuthenticationService = class extends Disposable {
  constructor(_extensionService, authenticationAccessService, _environmentService, _logService) {
    super();
    this._extensionService = _extensionService;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._onDidRegisterAuthenticationProvider = this._register(new Emitter());
    this.onDidRegisterAuthenticationProvider = this._onDidRegisterAuthenticationProvider.event;
    this._onDidUnregisterAuthenticationProvider = this._register(new Emitter());
    this.onDidUnregisterAuthenticationProvider = this._onDidUnregisterAuthenticationProvider.event;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidChangeDeclaredProviders = this._register(new Emitter());
    this.onDidChangeDeclaredProviders = this._onDidChangeDeclaredProviders.event;
    this._authenticationProviders = /* @__PURE__ */ new Map();
    this._authenticationProviderDisposables = this._register(new DisposableMap());
    this._dynamicAuthenticationProviderIds = /* @__PURE__ */ new Set();
    this._delegates = [];
    this._disposedSource = new CancellationTokenSource();
    this._declaredProviders = [];
    this._register(toDisposable(() => this._disposedSource.dispose(true)));
    this._register(authenticationAccessService.onDidChangeExtensionSessionAccess((e) => {
      this._onDidChangeSessions.fire({
        providerId: e.providerId,
        label: e.accountName,
        event: {
          added: [],
          changed: [],
          removed: []
        }
      });
    }));
    this._registerEnvContributedAuthenticationProviders();
    this._registerAuthenticationExtensionPointHandler();
  }
  get declaredProviders() {
    return this._declaredProviders;
  }
  _registerEnvContributedAuthenticationProviders() {
    if (!this._environmentService.options?.authenticationProviders?.length) {
      return;
    }
    for (const provider of this._environmentService.options.authenticationProviders) {
      this.registerDeclaredAuthenticationProvider(provider);
      this.registerAuthenticationProvider(provider.id, provider);
    }
  }
  _registerAuthenticationExtensionPointHandler() {
    this._register(authenticationExtPoint.setHandler((_extensions, { added, removed }) => {
      this._logService.debug(`Found authentication providers. added: ${added.length}, removed: ${removed.length}`);
      added.forEach((point) => {
        for (const provider of point.value) {
          if (isFalsyOrWhitespace(provider.id)) {
            point.collector.error(localize("authentication.missingId", "An authentication contribution must specify an id."));
            continue;
          }
          if (isFalsyOrWhitespace(provider.label)) {
            point.collector.error(localize("authentication.missingLabel", "An authentication contribution must specify a label."));
            continue;
          }
          if (!this.declaredProviders.some((p) => p.id === provider.id)) {
            this.registerDeclaredAuthenticationProvider(provider);
            this._logService.debug(`Declared authentication provider: ${provider.id}`);
          } else {
            point.collector.error(localize("authentication.idConflict", "This authentication id '{0}' has already been registered", provider.id));
          }
        }
      });
      const removedExtPoints = removed.flatMap((r) => r.value);
      removedExtPoints.forEach((point) => {
        const provider = this.declaredProviders.find((provider2) => provider2.id === point.id);
        if (provider) {
          this.unregisterDeclaredAuthenticationProvider(provider.id);
          this._logService.debug(`Undeclared authentication provider: ${provider.id}`);
        }
      });
    }));
  }
  registerDeclaredAuthenticationProvider(provider) {
    if (isFalsyOrWhitespace(provider.id)) {
      throw new Error(localize("authentication.missingId", "An authentication contribution must specify an id."));
    }
    if (isFalsyOrWhitespace(provider.label)) {
      throw new Error(localize("authentication.missingLabel", "An authentication contribution must specify a label."));
    }
    if (this.declaredProviders.some((p) => p.id === provider.id)) {
      throw new Error(localize("authentication.idConflict", "This authentication id '{0}' has already been registered", provider.id));
    }
    this._declaredProviders.push(provider);
    this._onDidChangeDeclaredProviders.fire();
  }
  unregisterDeclaredAuthenticationProvider(id) {
    const index = this.declaredProviders.findIndex((provider) => provider.id === id);
    if (index > -1) {
      this.declaredProviders.splice(index, 1);
    }
    this._onDidChangeDeclaredProviders.fire();
  }
  isAuthenticationProviderRegistered(id) {
    return this._authenticationProviders.has(id);
  }
  isDynamicAuthenticationProvider(id) {
    return this._dynamicAuthenticationProviderIds.has(id);
  }
  registerAuthenticationProvider(id, authenticationProvider) {
    this._authenticationProviders.set(id, authenticationProvider);
    const disposableStore = new DisposableStore();
    disposableStore.add(authenticationProvider.onDidChangeSessions((e) => this._onDidChangeSessions.fire({
      providerId: id,
      label: authenticationProvider.label,
      event: e
    })));
    if (isDisposable(authenticationProvider)) {
      disposableStore.add(authenticationProvider);
    }
    this._authenticationProviderDisposables.set(id, disposableStore);
    this._onDidRegisterAuthenticationProvider.fire({ id, label: authenticationProvider.label });
  }
  unregisterAuthenticationProvider(id) {
    const provider = this._authenticationProviders.get(id);
    if (provider) {
      this._authenticationProviders.delete(id);
      this._dynamicAuthenticationProviderIds.delete(id);
      this._onDidUnregisterAuthenticationProvider.fire({ id, label: provider.label });
    }
    this._authenticationProviderDisposables.deleteAndDispose(id);
  }
  getProviderIds() {
    const providerIds = [];
    this._authenticationProviders.forEach((provider) => {
      providerIds.push(provider.id);
    });
    return providerIds;
  }
  getProvider(id) {
    if (this._authenticationProviders.has(id)) {
      return this._authenticationProviders.get(id);
    }
    throw new Error(`No authentication provider '${id}' is currently registered.`);
  }
  async getAccounts(id) {
    const sessions = await this.getSessions(id);
    const accounts = new Array();
    const seenAccounts = /* @__PURE__ */ new Set();
    for (const session of sessions) {
      if (!seenAccounts.has(session.account.label)) {
        seenAccounts.add(session.account.label);
        accounts.push(session.account);
      }
    }
    return accounts;
  }
  async getSessions(id, scopeListOrRequest, options, activateImmediate = false) {
    if (this._disposedSource.token.isCancellationRequested) {
      return [];
    }
    const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, activateImmediate);
    if (authProvider) {
      const server = options?.authorizationServer;
      if (server) {
        if (!this.matchesProvider(authProvider, server)) {
          throw new Error(`The authentication provider '${id}' does not support the authorization server '${server.toString(true)}'.`);
        }
      }
      if (isAuthenticationWwwAuthenticateRequest(scopeListOrRequest)) {
        if (!authProvider.getSessionsFromChallenges) {
          throw new Error(`The authentication provider '${id}' does not support getting sessions from challenges.`);
        }
        return await authProvider.getSessionsFromChallenges(
          { challenges: parseWWWAuthenticateHeader(scopeListOrRequest.wwwAuthenticate), fallbackScopes: scopeListOrRequest.fallbackScopes },
          { ...options }
        );
      }
      return await authProvider.getSessions(scopeListOrRequest ? [...scopeListOrRequest] : void 0, { ...options });
    } else {
      throw new Error(`No authentication provider '${id}' is currently registered.`);
    }
  }
  async createSession(id, scopeListOrRequest, options) {
    if (this._disposedSource.token.isCancellationRequested) {
      throw new Error("Authentication service is disposed.");
    }
    const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, !!options?.activateImmediate);
    if (authProvider) {
      if (isAuthenticationWwwAuthenticateRequest(scopeListOrRequest)) {
        if (!authProvider.createSessionFromChallenges) {
          throw new Error(`The authentication provider '${id}' does not support creating sessions from challenges.`);
        }
        return await authProvider.createSessionFromChallenges(
          { challenges: parseWWWAuthenticateHeader(scopeListOrRequest.wwwAuthenticate), fallbackScopes: scopeListOrRequest.fallbackScopes },
          { ...options }
        );
      }
      return await authProvider.createSession([...scopeListOrRequest], { ...options });
    } else {
      throw new Error(`No authentication provider '${id}' is currently registered.`);
    }
  }
  async removeSession(id, sessionId) {
    if (this._disposedSource.token.isCancellationRequested) {
      throw new Error("Authentication service is disposed.");
    }
    const authProvider = this._authenticationProviders.get(id);
    if (authProvider) {
      return authProvider.removeSession(sessionId);
    } else {
      throw new Error(`No authentication provider '${id}' is currently registered.`);
    }
  }
  async getOrActivateProviderIdForServer(authorizationServer, resourceServer) {
    for (const provider of this._authenticationProviders.values()) {
      if (this.matchesProvider(provider, authorizationServer, resourceServer)) {
        return provider.id;
      }
    }
    const authServerStr = authorizationServer.toString(true);
    const providers = this._declaredProviders.filter((p) => !this._authenticationProviders.has(p.id)).filter((p) => !!p.authorizationServerGlobs?.some((i) => match(i, authServerStr, { ignoreCase: true })));
    for (const provider of providers) {
      const activeProvider = await this.tryActivateProvider(provider.id, true);
      if (this.matchesProvider(activeProvider, authorizationServer, resourceServer)) {
        return activeProvider.id;
      }
    }
    return void 0;
  }
  async createDynamicAuthenticationProvider(authorizationServer, serverMetadata, resource, clientId, clientSecret) {
    const delegate = this._delegates[0];
    if (!delegate) {
      this._logService.error("No authentication provider host delegate found");
      return void 0;
    }
    const providerId = await delegate.create(authorizationServer, serverMetadata, resource, clientId, clientSecret);
    const provider = this._authenticationProviders.get(providerId);
    if (provider) {
      this._logService.debug(`Created dynamic authentication provider: ${providerId}`);
      this._dynamicAuthenticationProviderIds.add(providerId);
      return provider;
    }
    this._logService.error(`Failed to create dynamic authentication provider: ${providerId}`);
    return void 0;
  }
  async createOrGetXaaProvider(issuer) {
    const providerId = `xaa:${issuer.toString(true)}`;
    if (this._authenticationProviders.has(providerId)) {
      return providerId;
    }
    const delegate = this._delegates.find((d) => !!d.createXaa);
    if (!delegate) {
      this._logService.error("No authentication provider host delegate supports XAA");
      return void 0;
    }
    const created = await delegate.createXaa(issuer);
    if (this._authenticationProviders.has(created)) {
      this._logService.debug(`Created XAA authentication provider: ${created}`);
      return created;
    }
    this._logService.error(`Failed to create XAA authentication provider for issuer: ${issuer.toString(true)}`);
    return void 0;
  }
  registerAuthenticationProviderHostDelegate(delegate) {
    this._delegates.push(delegate);
    this._delegates.sort((a, b) => b.priority - a.priority);
    return {
      dispose: () => {
        const index = this._delegates.indexOf(delegate);
        if (index !== -1) {
          this._delegates.splice(index, 1);
        }
      }
    };
  }
  matchesProvider(provider, authorizationServer, resourceServer) {
    if (resourceServer && provider.resourceServer) {
      const resourceServerStr = resourceServer.toString(true);
      const providerResourceServerStr = provider.resourceServer.toString(true);
      if (!equalsIgnoreCase(providerResourceServerStr, resourceServerStr)) {
        return false;
      }
    }
    if (provider.authorizationServers) {
      const authServerStr = authorizationServer.toString(true);
      for (const server of provider.authorizationServers) {
        const str = server.toString(true);
        if (equalsIgnoreCase(str, authServerStr) || match(str, authServerStr, { ignoreCase: true })) {
          return true;
        }
      }
    }
    return false;
  }
  async tryActivateProvider(providerId, activateImmediate) {
    const store = new DisposableStore();
    try {
      const activationPromise = this._extensionService.activateByEvent(
        getAuthenticationProviderActivationEvent(providerId),
        activateImmediate ? ActivationKind.Immediate : ActivationKind.Normal
      );
      let provider = this._authenticationProviders.get(providerId);
      if (provider) {
        return provider;
      }
      if (this._disposedSource.token.isCancellationRequested) {
        throw new Error("Authentication service is disposed.");
      }
      const providerRegistered = raceCancellation(
        Event.toPromise(
          Event.filter(
            this.onDidRegisterAuthenticationProvider,
            (e) => e.id === providerId,
            store
          ),
          store
        ),
        this._disposedSource.token
      );
      await Promise.race([activationPromise, providerRegistered]);
      provider = this._authenticationProviders.get(providerId);
      if (provider) {
        return provider;
      }
      const result = await raceTimeout(providerRegistered, 5e3);
      provider = this._authenticationProviders.get(providerId);
      if (provider) {
        return provider;
      }
      if (!result) {
        throw new Error(`Timed out waiting for authentication provider '${providerId}' to register.`);
      }
      throw new Error(`No authentication provider '${providerId}' is currently registered.`);
    } finally {
      store.dispose();
    }
  }
};
AuthenticationService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IAuthenticationAccessService),
  __decorateParam(2, IBrowserWorkbenchEnvironmentService),
  __decorateParam(3, ILogService)
], AuthenticationService);
registerSingleton(IAuthenticationService, AuthenticationService, InstantiationType.Delayed);
export {
  AuthenticationService,
  getAuthenticationProviderActivationEvent,
  getCurrentAuthenticationSessionInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhdXRoZW50aWNhdGlvblxcYnJvd3NlclxcYXV0aGVudGljYXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBpc0Rpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHNJZ25vcmVDYXNlLCBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uLCBBdXRoZW50aWNhdGlvblNlc3Npb24sIEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQsIEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudCwgSUF1dGhlbnRpY2F0aW9uQ3JlYXRlU2Vzc2lvbk9wdGlvbnMsIElBdXRoZW50aWNhdGlvbkdldFNlc3Npb25zT3B0aW9ucywgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIElBdXRoZW50aWNhdGlvblByb3ZpZGVySG9zdERlbGVnYXRlLCBJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBJQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBpc0F1dGhlbnRpY2F0aW9uV3d3QXV0aGVudGljYXRlUmVxdWVzdCB9IGZyb20gJy4uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGl2YXRpb25LaW5kLCBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IG1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUF1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhLCBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhLCBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29hdXRoLmpzJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24sIHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXV0aGVudGljYXRpb25Qcm92aWRlckFjdGl2YXRpb25FdmVudChpZDogc3RyaW5nKTogc3RyaW5nIHsgcmV0dXJuIGBvbkF1dGhlbnRpY2F0aW9uUmVxdWVzdDoke2lkfWA7IH1cblxuLy8gVE9ETzogcHVsbCB0aGlzIG91dCBpbnRvIGl0cyBvd24gc2VydmljZVxuZXhwb3J0IHR5cGUgQXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyA9IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkgYWNjZXNzVG9rZW46IHN0cmluZzsgcmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nOyByZWFkb25seSBjYW5TaWduT3V0PzogYm9vbGVhbiB9O1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEN1cnJlbnRBdXRoZW50aWNhdGlvblNlc3Npb25JbmZvKFxuXHRzZWNyZXRTdG9yYWdlU2VydmljZTogSVNlY3JldFN0b3JhZ2VTZXJ2aWNlLFxuXHRwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG4pOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm8gfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgYXV0aGVudGljYXRpb25TZXNzaW9uVmFsdWUgPSBhd2FpdCBzZWNyZXRTdG9yYWdlU2VydmljZS5nZXQoYCR7cHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2x9LmxvZ2luQWNjb3VudGApO1xuXHRpZiAoYXV0aGVudGljYXRpb25TZXNzaW9uVmFsdWUpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXV0aGVudGljYXRpb25TZXNzaW9uSW5mbzogQXV0aGVudGljYXRpb25TZXNzaW9uSW5mbyA9IEpTT04ucGFyc2UoYXV0aGVudGljYXRpb25TZXNzaW9uVmFsdWUpO1xuXHRcdFx0aWYgKGF1dGhlbnRpY2F0aW9uU2Vzc2lvbkluZm9cblx0XHRcdFx0JiYgaXNTdHJpbmcoYXV0aGVudGljYXRpb25TZXNzaW9uSW5mby5pZClcblx0XHRcdFx0JiYgaXNTdHJpbmcoYXV0aGVudGljYXRpb25TZXNzaW9uSW5mby5hY2Nlc3NUb2tlbilcblx0XHRcdFx0JiYgaXNTdHJpbmcoYXV0aGVudGljYXRpb25TZXNzaW9uSW5mby5wcm92aWRlcklkKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiBhdXRoZW50aWNhdGlvblNlc3Npb25JbmZvO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIFRoaXMgaXMgYSBiZXN0IGVmZm9ydCBvcGVyYXRpb24uXG5cdFx0XHRjb25zb2xlLmVycm9yKGBGYWlsZWQgcGFyc2luZyBjdXJyZW50IGF1dGggc2Vzc2lvbiB2YWx1ZTogJHtlfWApO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5jb25zdCBhdXRoZW50aWNhdGlvbkRlZmluaXRpb25TY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0aWQ6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdXRoZW50aWNhdGlvbi5pZCcsICdUaGUgaWQgb2YgdGhlIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyLicpXG5cdFx0fSxcblx0XHRsYWJlbDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dGhlbnRpY2F0aW9uLmxhYmVsJywgJ1RoZSBodW1hbiByZWFkYWJsZSBuYW1lIG9mIHRoZSBhdXRoZW50aWNhdGlvbiBwcm92aWRlci4nKSxcblx0XHR9LFxuXHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJHbG9iczoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dGhlbnRpY2F0aW9uLmF1dGhvcml6YXRpb25TZXJ2ZXJHbG9icycsICdBIGxpc3Qgb2YgZ2xvYnMgdGhhdCBtYXRjaCB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXJzIHRoYXQgdGhpcyBwcm92aWRlciBzdXBwb3J0cy4nKSxcblx0XHRcdH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dGhlbnRpY2F0aW9uLmF1dGhvcml6YXRpb25TZXJ2ZXJHbG9ic0Rlc2NyaXB0aW9uJywgJ0EgbGlzdCBvZiBnbG9icyB0aGF0IG1hdGNoIHRoZSBhdXRob3JpemF0aW9uIHNlcnZlcnMgdGhhdCB0aGlzIHByb3ZpZGVyIHN1cHBvcnRzLicpXG5cdFx0fVxuXHR9XG59O1xuXG5jb25zdCBhdXRoZW50aWNhdGlvbkV4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8QXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdhdXRoZW50aWNhdGlvbicsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoeyBrZXk6ICdhdXRoZW50aWNhdGlvbkV4dGVuc2lvblBvaW50JywgY29tbWVudDogW2AnQ29udHJpYnV0ZXMnIG1lYW5zIGFkZHMgaGVyZWBdIH0sICdDb250cmlidXRlcyBhdXRoZW50aWNhdGlvbicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IGF1dGhlbnRpY2F0aW9uRGVmaW5pdGlvblNjaGVtYVxuXHR9LFxuXHRhY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yOiBmdW5jdGlvbiogKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKSB7XG5cdFx0Zm9yIChjb25zdCBhdXRoZW50aWNhdGlvblByb3ZpZGVyIG9mIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAoYXV0aGVudGljYXRpb25Qcm92aWRlci5pZCkge1xuXHRcdFx0XHR5aWVsZCBgb25BdXRoZW50aWNhdGlvblJlcXVlc3Q6JHthdXRoZW50aWNhdGlvblByb3ZpZGVyLmlkfWA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIEF1dGhlbnRpY2F0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfb25EaWRSZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IEVtaXR0ZXI8QXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbmZvcm1hdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBFdmVudDxBdXRoZW50aWNhdGlvblByb3ZpZGVySW5mb3JtYXRpb24+ID0gdGhpcy5fb25EaWRSZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcjogRW1pdHRlcjxBdXRoZW50aWNhdGlvblByb3ZpZGVySW5mb3JtYXRpb24+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcjogRXZlbnQ8QXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uPiA9IHRoaXMuX29uRGlkVW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTZXNzaW9uczogRW1pdHRlcjx7IHByb3ZpZGVySWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZXZlbnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudCB9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcHJvdmlkZXJJZDogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBldmVudDogQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50IH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudDx7IHByb3ZpZGVySWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZXZlbnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudCB9PiA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VEZWNsYXJlZFByb3ZpZGVyczogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURlY2xhcmVkUHJvdmlkZXJzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlRGVjbGFyZWRQcm92aWRlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfYXV0aGVudGljYXRpb25Qcm92aWRlcnM6IE1hcDxzdHJpbmcsIElBdXRoZW50aWNhdGlvblByb3ZpZGVyPiA9IG5ldyBNYXA8c3RyaW5nLCBJQXV0aGVudGljYXRpb25Qcm92aWRlcj4oKTtcblx0cHJpdmF0ZSBfYXV0aGVudGljYXRpb25Qcm92aWRlckRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgX2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVySWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVsZWdhdGVzOiBJQXV0aGVudGljYXRpb25Qcm92aWRlckhvc3REZWxlZ2F0ZVtdID0gW107XG5cblx0cHJpdmF0ZSBfZGlzcG9zZWRTb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9kaXNwb3NlZFNvdXJjZS5kaXNwb3NlKHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uU2Vzc2lvbkFjY2VzcyhlID0+IHtcblx0XHRcdC8vIFRoZSBhY2Nlc3MgaGFzIGNoYW5nZWQsIG5vdCB0aGUgYWN0dWFsIHNlc3Npb24gaXRzZWxmIGJ1dCBleHRlbnNpb25zIGRlcGVuZCBvbiB0aGlzIGV2ZW50IGZpcmluZ1xuXHRcdFx0Ly8gd2hlbiB0aGV5IGhhdmUgZ2FpbmVkIGFjY2VzcyB0byBhbiBhY2NvdW50IHNvIHRoaXMgZmlyZXMgdGhhdCBldmVudC5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7XG5cdFx0XHRcdHByb3ZpZGVySWQ6IGUucHJvdmlkZXJJZCxcblx0XHRcdFx0bGFiZWw6IGUuYWNjb3VudE5hbWUsXG5cdFx0XHRcdGV2ZW50OiB7XG5cdFx0XHRcdFx0YWRkZWQ6IFtdLFxuXHRcdFx0XHRcdGNoYW5nZWQ6IFtdLFxuXHRcdFx0XHRcdHJlbW92ZWQ6IFtdXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyRW52Q29udHJpYnV0ZWRBdXRoZW50aWNhdGlvblByb3ZpZGVycygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyQXV0aGVudGljYXRpb25FeHRlbnNpb25Qb2ludEhhbmRsZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2RlY2xhcmVkUHJvdmlkZXJzOiBBdXRoZW50aWNhdGlvblByb3ZpZGVySW5mb3JtYXRpb25bXSA9IFtdO1xuXHRnZXQgZGVjbGFyZWRQcm92aWRlcnMoKTogQXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9kZWNsYXJlZFByb3ZpZGVycztcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyRW52Q29udHJpYnV0ZWRBdXRoZW50aWNhdGlvblByb3ZpZGVycygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5vcHRpb25zPy5hdXRoZW50aWNhdGlvblByb3ZpZGVycz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMuYXV0aGVudGljYXRpb25Qcm92aWRlcnMpIHtcblx0XHRcdHRoaXMucmVnaXN0ZXJEZWNsYXJlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdFx0dGhpcy5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIuaWQsIHByb3ZpZGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckF1dGhlbnRpY2F0aW9uRXh0ZW5zaW9uUG9pbnRIYW5kbGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dGhlbnRpY2F0aW9uRXh0UG9pbnQuc2V0SGFuZGxlcigoX2V4dGVuc2lvbnMsIHsgYWRkZWQsIHJlbW92ZWQgfSkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgRm91bmQgYXV0aGVudGljYXRpb24gcHJvdmlkZXJzLiBhZGRlZDogJHthZGRlZC5sZW5ndGh9LCByZW1vdmVkOiAke3JlbW92ZWQubGVuZ3RofWApO1xuXHRcdFx0YWRkZWQuZm9yRWFjaChwb2ludCA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgcG9pbnQudmFsdWUpIHtcblx0XHRcdFx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZShwcm92aWRlci5pZCkpIHtcblx0XHRcdFx0XHRcdHBvaW50LmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnYXV0aGVudGljYXRpb24ubWlzc2luZ0lkJywgJ0FuIGF1dGhlbnRpY2F0aW9uIGNvbnRyaWJ1dGlvbiBtdXN0IHNwZWNpZnkgYW4gaWQuJykpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2UocHJvdmlkZXIubGFiZWwpKSB7XG5cdFx0XHRcdFx0XHRwb2ludC5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2F1dGhlbnRpY2F0aW9uLm1pc3NpbmdMYWJlbCcsICdBbiBhdXRoZW50aWNhdGlvbiBjb250cmlidXRpb24gbXVzdCBzcGVjaWZ5IGEgbGFiZWwuJykpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCF0aGlzLmRlY2xhcmVkUHJvdmlkZXJzLnNvbWUocCA9PiBwLmlkID09PSBwcm92aWRlci5pZCkpIHtcblx0XHRcdFx0XHRcdHRoaXMucmVnaXN0ZXJEZWNsYXJlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgRGVjbGFyZWQgYXV0aGVudGljYXRpb24gcHJvdmlkZXI6ICR7cHJvdmlkZXIuaWR9YCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHBvaW50LmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnYXV0aGVudGljYXRpb24uaWRDb25mbGljdCcsIFwiVGhpcyBhdXRoZW50aWNhdGlvbiBpZCAnezB9JyBoYXMgYWxyZWFkeSBiZWVuIHJlZ2lzdGVyZWRcIiwgcHJvdmlkZXIuaWQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZW1vdmVkRXh0UG9pbnRzID0gcmVtb3ZlZC5mbGF0TWFwKHIgPT4gci52YWx1ZSk7XG5cdFx0XHRyZW1vdmVkRXh0UG9pbnRzLmZvckVhY2gocG9pbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZGVjbGFyZWRQcm92aWRlcnMuZmluZChwcm92aWRlciA9PiBwcm92aWRlci5pZCA9PT0gcG9pbnQuaWQpO1xuXHRcdFx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdFx0XHR0aGlzLnVucmVnaXN0ZXJEZWNsYXJlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIuaWQpO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFVuZGVjbGFyZWQgYXV0aGVudGljYXRpb24gcHJvdmlkZXI6ICR7cHJvdmlkZXIuaWR9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHJlZ2lzdGVyRGVjbGFyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyOiBBdXRoZW50aWNhdGlvblByb3ZpZGVySW5mb3JtYXRpb24pOiB2b2lkIHtcblx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZShwcm92aWRlci5pZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnYXV0aGVudGljYXRpb24ubWlzc2luZ0lkJywgJ0FuIGF1dGhlbnRpY2F0aW9uIGNvbnRyaWJ1dGlvbiBtdXN0IHNwZWNpZnkgYW4gaWQuJykpO1xuXHRcdH1cblx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZShwcm92aWRlci5sYWJlbCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnYXV0aGVudGljYXRpb24ubWlzc2luZ0xhYmVsJywgJ0FuIGF1dGhlbnRpY2F0aW9uIGNvbnRyaWJ1dGlvbiBtdXN0IHNwZWNpZnkgYSBsYWJlbC4nKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmRlY2xhcmVkUHJvdmlkZXJzLnNvbWUocCA9PiBwLmlkID09PSBwcm92aWRlci5pZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnYXV0aGVudGljYXRpb24uaWRDb25mbGljdCcsIFwiVGhpcyBhdXRoZW50aWNhdGlvbiBpZCAnezB9JyBoYXMgYWxyZWFkeSBiZWVuIHJlZ2lzdGVyZWRcIiwgcHJvdmlkZXIuaWQpKTtcblx0XHR9XG5cdFx0dGhpcy5fZGVjbGFyZWRQcm92aWRlcnMucHVzaChwcm92aWRlcik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNsYXJlZFByb3ZpZGVycy5maXJlKCk7XG5cdH1cblxuXHR1bnJlZ2lzdGVyRGVjbGFyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVyKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZGVjbGFyZWRQcm92aWRlcnMuZmluZEluZGV4KHByb3ZpZGVyID0+IHByb3ZpZGVyLmlkID09PSBpZCk7XG5cdFx0aWYgKGluZGV4ID4gLTEpIHtcblx0XHRcdHRoaXMuZGVjbGFyZWRQcm92aWRlcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNsYXJlZFByb3ZpZGVycy5maXJlKCk7XG5cdH1cblxuXHRpc0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJSZWdpc3RlcmVkKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuaGFzKGlkKTtcblx0fVxuXG5cdGlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcklkcy5oYXMoaWQpO1xuXHR9XG5cblx0cmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGlkOiBzdHJpbmcsIGF1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuc2V0KGlkLCBhdXRoZW50aWNhdGlvblByb3ZpZGVyKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChhdXRoZW50aWNhdGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoe1xuXHRcdFx0cHJvdmlkZXJJZDogaWQsXG5cdFx0XHRsYWJlbDogYXV0aGVudGljYXRpb25Qcm92aWRlci5sYWJlbCxcblx0XHRcdGV2ZW50OiBlXG5cdFx0fSkpKTtcblx0XHRpZiAoaXNEaXNwb3NhYmxlKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIpKSB7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIpO1xuXHRcdH1cblx0XHR0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVyRGlzcG9zYWJsZXMuc2V0KGlkLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHRcdHRoaXMuX29uRGlkUmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyLmZpcmUoeyBpZCwgbGFiZWw6IGF1dGhlbnRpY2F0aW9uUHJvdmlkZXIubGFiZWwgfSk7XG5cdH1cblxuXHR1bnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5nZXQoaWQpO1xuXHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZGVsZXRlKGlkKTtcblx0XHRcdC8vIElmIHRoaXMgaXMgYSBkeW5hbWljIHByb3ZpZGVyLCByZW1vdmUgaXQgZnJvbSB0aGUgc2V0IG9mIGR5bmFtaWMgcHJvdmlkZXJzXG5cdFx0XHR0aGlzLl9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcklkcy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fb25EaWRVbnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlci5maXJlKHsgaWQsIGxhYmVsOiBwcm92aWRlci5sYWJlbCB9KTtcblx0XHR9XG5cdFx0dGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlckRpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2UoaWQpO1xuXHR9XG5cblx0Z2V0UHJvdmlkZXJJZHMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHByb3ZpZGVySWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuXHRcdFx0cHJvdmlkZXJJZHMucHVzaChwcm92aWRlci5pZCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHByb3ZpZGVySWRzO1xuXHR9XG5cblx0Z2V0UHJvdmlkZXIoaWQ6IHN0cmluZyk6IElBdXRoZW50aWNhdGlvblByb3ZpZGVyIHtcblx0XHRpZiAodGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuaGFzKGlkKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmdldChpZCkhO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyICcke2lkfScgaXMgY3VycmVudGx5IHJlZ2lzdGVyZWQuYCk7XG5cdH1cblxuXHRhc3luYyBnZXRBY2NvdW50cyhpZDogc3RyaW5nKTogUHJvbWlzZTxSZWFkb25seUFycmF5PEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQ+PiB7XG5cdFx0Ly8gVE9ETzogQ2FjaGUgdGhpc1xuXHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5nZXRTZXNzaW9ucyhpZCk7XG5cdFx0Y29uc3QgYWNjb3VudHMgPSBuZXcgQXJyYXk8QXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudD4oKTtcblx0XHRjb25zdCBzZWVuQWNjb3VudHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGlmICghc2VlbkFjY291bnRzLmhhcyhzZXNzaW9uLmFjY291bnQubGFiZWwpKSB7XG5cdFx0XHRcdHNlZW5BY2NvdW50cy5hZGQoc2Vzc2lvbi5hY2NvdW50LmxhYmVsKTtcblx0XHRcdFx0YWNjb3VudHMucHVzaChzZXNzaW9uLmFjY291bnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYWNjb3VudHM7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9ucyhpZDogc3RyaW5nLCBzY29wZUxpc3RPclJlcXVlc3Q/OiBSZWFkb25seUFycmF5PHN0cmluZz4gfCBJQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBvcHRpb25zPzogSUF1dGhlbnRpY2F0aW9uR2V0U2Vzc2lvbnNPcHRpb25zLCBhY3RpdmF0ZUltbWVkaWF0ZTogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxSZWFkb25seUFycmF5PEF1dGhlbnRpY2F0aW9uU2Vzc2lvbj4+IHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWRTb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBhdXRoUHJvdmlkZXIgPSB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5nZXQoaWQpIHx8IGF3YWl0IHRoaXMudHJ5QWN0aXZhdGVQcm92aWRlcihpZCwgYWN0aXZhdGVJbW1lZGlhdGUpO1xuXHRcdGlmIChhdXRoUHJvdmlkZXIpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoZSBhdXRob3JpemF0aW9uIHNlcnZlciBpcyBpbiB0aGUgbGlzdCBvZiBzdXBwb3J0ZWQgYXV0aG9yaXphdGlvbiBzZXJ2ZXJzXG5cdFx0XHRjb25zdCBzZXJ2ZXIgPSBvcHRpb25zPy5hdXRob3JpemF0aW9uU2VydmVyO1xuXHRcdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0XHQvLyBTa2lwIHRoZSByZXNvdXJjZSBzZXJ2ZXIgY2hlY2sgc2luY2UgdGhlIGF1dGggcHJvdmlkZXIgaWQgY29udGFpbnMgYSBzcGVjaWZpYyByZXNvdXJjZSBzZXJ2ZXJcblx0XHRcdFx0Ly8gVE9ET0BUeWxlckxlb25oYXJkdDogdGhpcyBjYW4gY2hhbmdlIHdoZW4gd2UgaGF2ZSBwcm92aWRlcnMgdGhhdCBzdXBwb3J0IG11bHRpcGxlIHJlc291cmNlIHNlcnZlcnNcblx0XHRcdFx0aWYgKCF0aGlzLm1hdGNoZXNQcm92aWRlcihhdXRoUHJvdmlkZXIsIHNlcnZlcikpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRoZSBhdXRoZW50aWNhdGlvbiBwcm92aWRlciAnJHtpZH0nIGRvZXMgbm90IHN1cHBvcnQgdGhlIGF1dGhvcml6YXRpb24gc2VydmVyICcke3NlcnZlci50b1N0cmluZyh0cnVlKX0nLmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3Qoc2NvcGVMaXN0T3JSZXF1ZXN0KSkge1xuXHRcdFx0XHRpZiAoIWF1dGhQcm92aWRlci5nZXRTZXNzaW9uc0Zyb21DaGFsbGVuZ2VzKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUaGUgYXV0aGVudGljYXRpb24gcHJvdmlkZXIgJyR7aWR9JyBkb2VzIG5vdCBzdXBwb3J0IGdldHRpbmcgc2Vzc2lvbnMgZnJvbSBjaGFsbGVuZ2VzLmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhd2FpdCBhdXRoUHJvdmlkZXIuZ2V0U2Vzc2lvbnNGcm9tQ2hhbGxlbmdlcyhcblx0XHRcdFx0XHR7IGNoYWxsZW5nZXM6IHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyKHNjb3BlTGlzdE9yUmVxdWVzdC53d3dBdXRoZW50aWNhdGUpLCBmYWxsYmFja1Njb3Blczogc2NvcGVMaXN0T3JSZXF1ZXN0LmZhbGxiYWNrU2NvcGVzIH0sXG5cdFx0XHRcdFx0eyAuLi5vcHRpb25zIH1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhd2FpdCBhdXRoUHJvdmlkZXIuZ2V0U2Vzc2lvbnMoc2NvcGVMaXN0T3JSZXF1ZXN0ID8gWy4uLnNjb3BlTGlzdE9yUmVxdWVzdF0gOiB1bmRlZmluZWQsIHsgLi4ub3B0aW9ucyB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBhdXRoZW50aWNhdGlvbiBwcm92aWRlciAnJHtpZH0nIGlzIGN1cnJlbnRseSByZWdpc3RlcmVkLmApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oaWQ6IHN0cmluZywgc2NvcGVMaXN0T3JSZXF1ZXN0OiBSZWFkb25seUFycmF5PHN0cmluZz4gfCBJQXV0aGVudGljYXRpb25Xd3dBdXRoZW50aWNhdGVSZXF1ZXN0LCBvcHRpb25zPzogSUF1dGhlbnRpY2F0aW9uQ3JlYXRlU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbj4ge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZFNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBdXRoZW50aWNhdGlvbiBzZXJ2aWNlIGlzIGRpc3Bvc2VkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dGhQcm92aWRlciA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmdldChpZCkgfHwgYXdhaXQgdGhpcy50cnlBY3RpdmF0ZVByb3ZpZGVyKGlkLCAhIW9wdGlvbnM/LmFjdGl2YXRlSW1tZWRpYXRlKTtcblx0XHRpZiAoYXV0aFByb3ZpZGVyKSB7XG5cdFx0XHRpZiAoaXNBdXRoZW50aWNhdGlvbld3d0F1dGhlbnRpY2F0ZVJlcXVlc3Qoc2NvcGVMaXN0T3JSZXF1ZXN0KSkge1xuXHRcdFx0XHRpZiAoIWF1dGhQcm92aWRlci5jcmVhdGVTZXNzaW9uRnJvbUNoYWxsZW5nZXMpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRoZSBhdXRoZW50aWNhdGlvbiBwcm92aWRlciAnJHtpZH0nIGRvZXMgbm90IHN1cHBvcnQgY3JlYXRpbmcgc2Vzc2lvbnMgZnJvbSBjaGFsbGVuZ2VzLmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhd2FpdCBhdXRoUHJvdmlkZXIuY3JlYXRlU2Vzc2lvbkZyb21DaGFsbGVuZ2VzKFxuXHRcdFx0XHRcdHsgY2hhbGxlbmdlczogcGFyc2VXV1dBdXRoZW50aWNhdGVIZWFkZXIoc2NvcGVMaXN0T3JSZXF1ZXN0Lnd3d0F1dGhlbnRpY2F0ZSksIGZhbGxiYWNrU2NvcGVzOiBzY29wZUxpc3RPclJlcXVlc3QuZmFsbGJhY2tTY29wZXMgfSxcblx0XHRcdFx0XHR7IC4uLm9wdGlvbnMgfVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF3YWl0IGF1dGhQcm92aWRlci5jcmVhdGVTZXNzaW9uKFsuLi5zY29wZUxpc3RPclJlcXVlc3RdLCB7IC4uLm9wdGlvbnMgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXIgJyR7aWR9JyBpcyBjdXJyZW50bHkgcmVnaXN0ZXJlZC5gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW1vdmVTZXNzaW9uKGlkOiBzdHJpbmcsIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0F1dGhlbnRpY2F0aW9uIHNlcnZpY2UgaXMgZGlzcG9zZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0aFByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KGlkKTtcblx0XHRpZiAoYXV0aFByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gYXV0aFByb3ZpZGVyLnJlbW92ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBhdXRoZW50aWNhdGlvbiBwcm92aWRlciAnJHtpZH0nIGlzIGN1cnJlbnRseSByZWdpc3RlcmVkLmApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyKGF1dGhvcml6YXRpb25TZXJ2ZXI6IFVSSSwgcmVzb3VyY2VTZXJ2ZXI/OiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMudmFsdWVzKCkpIHtcblx0XHRcdGlmICh0aGlzLm1hdGNoZXNQcm92aWRlcihwcm92aWRlciwgYXV0aG9yaXphdGlvblNlcnZlciwgcmVzb3VyY2VTZXJ2ZXIpKSB7XG5cdFx0XHRcdHJldHVybiBwcm92aWRlci5pZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhdXRoU2VydmVyU3RyID0gYXV0aG9yaXphdGlvblNlcnZlci50b1N0cmluZyh0cnVlKTtcblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLl9kZWNsYXJlZFByb3ZpZGVyc1xuXHRcdFx0Ly8gT25seSBjb25zaWRlciBwcm92aWRlcnMgdGhhdCBhcmUgbm90IGFscmVhZHkgcmVnaXN0ZXJlZCBzaW5jZSB3ZSBhbHJlYWR5IGNoZWNrZWQgdGhlbVxuXHRcdFx0LmZpbHRlcihwID0+ICF0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5oYXMocC5pZCkpXG5cdFx0XHQuZmlsdGVyKHAgPT4gISFwLmF1dGhvcml6YXRpb25TZXJ2ZXJHbG9icz8uc29tZShpID0+IG1hdGNoKGksIGF1dGhTZXJ2ZXJTdHIsIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSkpO1xuXG5cdFx0Ly8gVE9ETzpAVHlsZXJMZW9uaGFyZHQgZmFuIG91dD9cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHByb3ZpZGVycykge1xuXHRcdFx0Y29uc3QgYWN0aXZlUHJvdmlkZXIgPSBhd2FpdCB0aGlzLnRyeUFjdGl2YXRlUHJvdmlkZXIocHJvdmlkZXIuaWQsIHRydWUpO1xuXHRcdFx0Ly8gQ2hlY2sgdGhlIHJlc29sdmVkIGF1dGhvcml6YXRpb24gc2VydmVyc1xuXHRcdFx0aWYgKHRoaXMubWF0Y2hlc1Byb3ZpZGVyKGFjdGl2ZVByb3ZpZGVyLCBhdXRob3JpemF0aW9uU2VydmVyLCByZXNvdXJjZVNlcnZlcikpIHtcblx0XHRcdFx0cmV0dXJuIGFjdGl2ZVByb3ZpZGVyLmlkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIoYXV0aG9yaXphdGlvblNlcnZlcjogVVJJLCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSwgcmVzb3VyY2U6IElBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSB8IHVuZGVmaW5lZCwgY2xpZW50SWQ/OiBzdHJpbmcsIGNsaWVudFNlY3JldD86IHN0cmluZyk6IFByb21pc2U8SUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuX2RlbGVnYXRlc1swXTtcblx0XHRpZiAoIWRlbGVnYXRlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdObyBhdXRoZW50aWNhdGlvbiBwcm92aWRlciBob3N0IGRlbGVnYXRlIGZvdW5kJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlcklkID0gYXdhaXQgZGVsZWdhdGUuY3JlYXRlKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHNlcnZlck1ldGFkYXRhLCByZXNvdXJjZSwgY2xpZW50SWQsIGNsaWVudFNlY3JldCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBDcmVhdGVkIGR5bmFtaWMgYXV0aGVudGljYXRpb24gcHJvdmlkZXI6ICR7cHJvdmlkZXJJZH1gKTtcblx0XHRcdHRoaXMuX2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVySWRzLmFkZChwcm92aWRlcklkKTtcblx0XHRcdHJldHVybiBwcm92aWRlcjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIGNyZWF0ZSBkeW5hbWljIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyOiAke3Byb3ZpZGVySWR9YCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU9yR2V0WGFhUHJvdmlkZXIoaXNzdWVyOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBgeGFhOiR7aXNzdWVyLnRvU3RyaW5nKHRydWUpfWA7XG5cdFx0aWYgKHRoaXMuX2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzLmhhcyhwcm92aWRlcklkKSkge1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVySWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGRlbGVnYXRlID0gdGhpcy5fZGVsZWdhdGVzLmZpbmQoZCA9PiAhIWQuY3JlYXRlWGFhKTtcblx0XHRpZiAoIWRlbGVnYXRlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdObyBhdXRoZW50aWNhdGlvbiBwcm92aWRlciBob3N0IGRlbGVnYXRlIHN1cHBvcnRzIFhBQScpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IGRlbGVnYXRlLmNyZWF0ZVhhYSEoaXNzdWVyKTtcblx0XHRpZiAodGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuaGFzKGNyZWF0ZWQpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBDcmVhdGVkIFhBQSBhdXRoZW50aWNhdGlvbiBwcm92aWRlcjogJHtjcmVhdGVkfWApO1xuXHRcdFx0cmV0dXJuIGNyZWF0ZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBjcmVhdGUgWEFBIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIGZvciBpc3N1ZXI6ICR7aXNzdWVyLnRvU3RyaW5nKHRydWUpfWApO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXJIb3N0RGVsZWdhdGUoZGVsZWdhdGU6IElBdXRoZW50aWNhdGlvblByb3ZpZGVySG9zdERlbGVnYXRlKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX2RlbGVnYXRlcy5wdXNoKGRlbGVnYXRlKTtcblx0XHR0aGlzLl9kZWxlZ2F0ZXMuc29ydCgoYSwgYikgPT4gYi5wcmlvcml0eSAtIGEucHJpb3JpdHkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9kZWxlZ2F0ZXMuaW5kZXhPZihkZWxlZ2F0ZSk7XG5cdFx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHR0aGlzLl9kZWxlZ2F0ZXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIG1hdGNoZXNQcm92aWRlcihwcm92aWRlcjogSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIsIGF1dGhvcml6YXRpb25TZXJ2ZXI6IFVSSSwgcmVzb3VyY2VTZXJ2ZXI/OiBVUkkpOiBib29sZWFuIHtcblx0XHQvLyBJZiBhIHJlc291cmNlU2VydmVyIGlzIHByb3ZpZGVkIGFuZCB0aGUgcHJvdmlkZXIgaGFzIGEgcmVzb3VyY2VTZXJ2ZXIgZGVmaW5lZCwgdGhleSBtdXN0IG1hdGNoXG5cdFx0aWYgKHJlc291cmNlU2VydmVyICYmIHByb3ZpZGVyLnJlc291cmNlU2VydmVyKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZVNlcnZlclN0ciA9IHJlc291cmNlU2VydmVyLnRvU3RyaW5nKHRydWUpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJSZXNvdXJjZVNlcnZlclN0ciA9IHByb3ZpZGVyLnJlc291cmNlU2VydmVyLnRvU3RyaW5nKHRydWUpO1xuXHRcdFx0aWYgKCFlcXVhbHNJZ25vcmVDYXNlKHByb3ZpZGVyUmVzb3VyY2VTZXJ2ZXJTdHIsIHJlc291cmNlU2VydmVyU3RyKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHByb3ZpZGVyLmF1dGhvcml6YXRpb25TZXJ2ZXJzKSB7XG5cdFx0XHRjb25zdCBhdXRoU2VydmVyU3RyID0gYXV0aG9yaXphdGlvblNlcnZlci50b1N0cmluZyh0cnVlKTtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHByb3ZpZGVyLmF1dGhvcml6YXRpb25TZXJ2ZXJzKSB7XG5cdFx0XHRcdGNvbnN0IHN0ciA9IHNlcnZlci50b1N0cmluZyh0cnVlKTtcblx0XHRcdFx0aWYgKGVxdWFsc0lnbm9yZUNhc2Uoc3RyLCBhdXRoU2VydmVyU3RyKSB8fCBtYXRjaChzdHIsIGF1dGhTZXJ2ZXJTdHIsIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJ5QWN0aXZhdGVQcm92aWRlcihwcm92aWRlcklkOiBzdHJpbmcsIGFjdGl2YXRlSW1tZWRpYXRlOiBib29sZWFuKTogUHJvbWlzZTxJQXV0aGVudGljYXRpb25Qcm92aWRlcj4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBEb24ndCBhd2FpdCBhY3RpdmF0ZUJ5RXZlbnQgZXhjbHVzaXZlbHkgXHUyMDE0IG9uZSBvciBtb3JlIGV4dGVuc2lvblxuXHRcdFx0Ly8gaG9zdHMgbWF5IGJlIGJsb2NrZWQgKGUuZy4gd2Vid29ya2VyIHdhaXRpbmcgb24gcmVtb3RlIGF1dGhvcml0eSksXG5cdFx0XHQvLyBjYXVzaW5nIGEgZGVhZGxvY2suIEluc3RlYWQsIHJhY2Ugd2l0aCB0aGUgcHJvdmlkZXIgYmVpbmdcblx0XHRcdC8vIHJlZ2lzdGVyZWQgc28gd2UgY2FuIHByb2NlZWQgYXMgc29vbiBhcyBhbnkgaG9zdCBkZWxpdmVycyBpdC4gKCMzMTU4NDEpXG5cdFx0XHRjb25zdCBhY3RpdmF0aW9uUHJvbWlzZSA9IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KFxuXHRcdFx0XHRnZXRBdXRoZW50aWNhdGlvblByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50KHByb3ZpZGVySWQpLFxuXHRcdFx0XHRhY3RpdmF0ZUltbWVkaWF0ZSA/IEFjdGl2YXRpb25LaW5kLkltbWVkaWF0ZSA6IEFjdGl2YXRpb25LaW5kLk5vcm1hbFxuXHRcdFx0KTtcblxuXHRcdFx0bGV0IHByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiBwcm92aWRlcjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9kaXNwb3NlZFNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0F1dGhlbnRpY2F0aW9uIHNlcnZpY2UgaXMgZGlzcG9zZWQuJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyUmVnaXN0ZXJlZCA9IHJhY2VDYW5jZWxsYXRpb24oXG5cdFx0XHRcdEV2ZW50LnRvUHJvbWlzZShcblx0XHRcdFx0XHRFdmVudC5maWx0ZXIoXG5cdFx0XHRcdFx0XHR0aGlzLm9uRGlkUmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0ZSA9PiBlLmlkID09PSBwcm92aWRlcklkLFxuXHRcdFx0XHRcdFx0c3RvcmVcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHN0b3JlXG5cdFx0XHRcdCksXG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VkU291cmNlLnRva2VuXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBXYWl0IGZvciBlaXRoZXIgYWN0aXZhdGlvbiB0byBjb21wbGV0ZSBvciB0aGUgcHJvdmlkZXIgdG8gcmVnaXN0ZXIuXG5cdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW2FjdGl2YXRpb25Qcm9taXNlLCBwcm92aWRlclJlZ2lzdGVyZWRdKTtcblxuXHRcdFx0cHJvdmlkZXIgPSB0aGlzLl9hdXRoZW50aWNhdGlvblByb3ZpZGVycy5nZXQocHJvdmlkZXJJZCk7XG5cdFx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdFx0cmV0dXJuIHByb3ZpZGVyO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUT0RPOiBSZW1vdmUgdGhpcyB0aW1lb3V0IGFuZCBmaWd1cmUgb3V0IGEgYmV0dGVyIHdheSB0byBlbnN1cmUgYXV0aCBwcm92aWRlcnNcblx0XHRcdC8vIGFyZSByZWdpc3RlcmVkIF9kdXJpbmdfIGV4dGVuc2lvbiBhY3RpdmF0aW9uLlxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmFjZVRpbWVvdXQocHJvdmlkZXJSZWdpc3RlcmVkLCA1MDAwKTtcblx0XHRcdHByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25Qcm92aWRlcnMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdHJldHVybiBwcm92aWRlcjtcblx0XHRcdH1cblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVGltZWQgb3V0IHdhaXRpbmcgZm9yIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyICcke3Byb3ZpZGVySWR9JyB0byByZWdpc3Rlci5gKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gYXV0aGVudGljYXRpb24gcHJvdmlkZXIgJyR7cHJvdmlkZXJJZH0nIGlzIGN1cnJlbnRseSByZWdpc3RlcmVkLmApO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIEF1dGhlbnRpY2F0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxlQUFlLGlCQUE4QixjQUFjLG9CQUFvQjtBQUNwRyxTQUFTLGtCQUFrQiwyQkFBMkI7QUFDdEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIseUJBQXlCO0FBR3JELFNBQVMsb0NBQW9DO0FBQzdDLFNBQTBRLHdCQUErRCw4Q0FBOEM7QUFDdlgsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsYUFBYTtBQUV0QixTQUFnRixrQ0FBa0M7QUFDbEgsU0FBUyxrQkFBa0IsbUJBQW1CO0FBQzlDLFNBQVMsK0JBQStCO0FBRWpDLFNBQVMseUNBQXlDLElBQW9CO0FBQUUs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
