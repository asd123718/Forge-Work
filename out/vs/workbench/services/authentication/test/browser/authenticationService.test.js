import assert from "assert";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { URI } from "../../../../../base/common/uri.js";
import { AuthenticationAccessService } from "../../browser/authenticationAccessService.js";
import { AuthenticationService } from "../../browser/authenticationService.js";
import { TestEnvironmentService } from "../../../../test/browser/workbenchTestServices.js";
import { TestExtensionService, TestProductService, TestStorageService } from "../../../../test/common/workbenchTestServices.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
function createSession() {
  return { id: "session1", accessToken: "token1", account: { id: "account", label: "Account" }, scopes: ["test"] };
}
function createProvider(overrides = {}) {
  return {
    supportsMultipleAccounts: false,
    onDidChangeSessions: new Emitter().event,
    id: "test",
    label: "Test",
    getSessions: async () => [],
    createSession: async () => createSession(),
    removeSession: async () => {
    },
    ...overrides
  };
}
suite("AuthenticationService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let authenticationService;
  setup(() => {
    const storageService = disposables.add(new TestStorageService());
    const authenticationAccessService = disposables.add(new AuthenticationAccessService(storageService, TestProductService));
    authenticationService = disposables.add(new AuthenticationService(new TestExtensionService(), authenticationAccessService, TestEnvironmentService, new NullLogService()));
  });
  teardown(() => {
    authenticationService.dispose();
  });
  suite("declaredAuthenticationProviders", () => {
    test("registerDeclaredAuthenticationProvider", async () => {
      const changed = Event.toPromise(authenticationService.onDidChangeDeclaredProviders);
      const provider = {
        id: "github",
        label: "GitHub"
      };
      authenticationService.registerDeclaredAuthenticationProvider(provider);
      assert.equal(authenticationService.declaredProviders.length, 1);
      assert.deepEqual(authenticationService.declaredProviders[0], provider);
      await changed;
    });
    test("unregisterDeclaredAuthenticationProvider", async () => {
      const provider = {
        id: "github",
        label: "GitHub"
      };
      authenticationService.registerDeclaredAuthenticationProvider(provider);
      const changed = Event.toPromise(authenticationService.onDidChangeDeclaredProviders);
      authenticationService.unregisterDeclaredAuthenticationProvider(provider.id);
      assert.equal(authenticationService.declaredProviders.length, 0);
      await changed;
    });
  });
  suite("authenticationProviders", () => {
    test("isAuthenticationProviderRegistered", async () => {
      const registered = Event.toPromise(authenticationService.onDidRegisterAuthenticationProvider);
      const provider = createProvider();
      assert.equal(authenticationService.isAuthenticationProviderRegistered(provider.id), false);
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      assert.equal(authenticationService.isAuthenticationProviderRegistered(provider.id), true);
      const result = await registered;
      assert.deepEqual(result, { id: provider.id, label: provider.label });
    });
    test("unregisterAuthenticationProvider", async () => {
      const unregistered = Event.toPromise(authenticationService.onDidUnregisterAuthenticationProvider);
      const provider = createProvider();
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      assert.equal(authenticationService.isAuthenticationProviderRegistered(provider.id), true);
      authenticationService.unregisterAuthenticationProvider(provider.id);
      assert.equal(authenticationService.isAuthenticationProviderRegistered(provider.id), false);
      const result = await unregistered;
      assert.deepEqual(result, { id: provider.id, label: provider.label });
    });
    test("getProviderIds", () => {
      const provider1 = createProvider({
        id: "provider1",
        label: "Provider 1"
      });
      const provider2 = createProvider({
        id: "provider2",
        label: "Provider 2"
      });
      authenticationService.registerAuthenticationProvider(provider1.id, provider1);
      authenticationService.registerAuthenticationProvider(provider2.id, provider2);
      const providerIds = authenticationService.getProviderIds();
      assert.deepEqual(providerIds, [provider1.id, provider2.id]);
    });
    test("getProvider", () => {
      const provider = createProvider();
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      const retrievedProvider = authenticationService.getProvider(provider.id);
      assert.deepEqual(retrievedProvider, provider);
    });
    test("getOrActivateProviderIdForServer - should return undefined when no provider matches the authorization server", async () => {
      const authorizationServer = URI.parse("https://example.com");
      const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
      assert.strictEqual(result, void 0);
    });
    test("getOrActivateProviderIdForServer - should return provider id if authorizationServerGlobs matches and authorizationServers match", async () => {
      const provider = {
        id: "github",
        label: "GitHub",
        authorizationServerGlobs: ["https://github.com/*"]
      };
      authenticationService.registerDeclaredAuthenticationProvider(provider);
      const authProvider = createProvider({
        id: "github",
        label: "GitHub",
        authorizationServers: [URI.parse("https://github.com/login")]
      });
      authenticationService.registerAuthenticationProvider("github", authProvider);
      const authorizationServer = URI.parse("https://github.com/login");
      const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
      assert.strictEqual(result, "github");
    });
    test("getOrActivateProviderIdForServer - should return undefined if authorizationServerGlobs match but authorizationServers do not match", async () => {
      const provider = {
        id: "github",
        label: "GitHub",
        authorizationServerGlobs: ["https://github.com/*"]
      };
      authenticationService.registerDeclaredAuthenticationProvider(provider);
      const authProvider = createProvider({
        id: "github",
        label: "GitHub",
        authorizationServers: [URI.parse("https://github.com/different")]
      });
      authenticationService.registerAuthenticationProvider("github", authProvider);
      const authorizationServer = URI.parse("https://github.com/login");
      const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
      assert.strictEqual(result, void 0);
    });
    test("getOrActivateProviderIdForAuthorizationServer - should check multiple providers and return the first match", async () => {
      const provider1 = {
        id: "github",
        label: "GitHub",
        authorizationServerGlobs: ["https://github.com/*"]
      };
      const provider2 = {
        id: "microsoft",
        label: "Microsoft",
        authorizationServerGlobs: ["https://login.microsoftonline.com/*"]
      };
      authenticationService.registerDeclaredAuthenticationProvider(provider1);
      authenticationService.registerDeclaredAuthenticationProvider(provider2);
      const githubProvider = createProvider({
        id: "github",
        label: "GitHub",
        authorizationServers: [URI.parse("https://github.com/different")]
      });
      authenticationService.registerAuthenticationProvider("github", githubProvider);
      const microsoftProvider = createProvider({
        id: "microsoft",
        label: "Microsoft",
        authorizationServers: [URI.parse("https://login.microsoftonline.com/common")]
      });
      authenticationService.registerAuthenticationProvider("microsoft", microsoftProvider);
      const authorizationServer = URI.parse("https://login.microsoftonline.com/common");
      const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
      assert.strictEqual(result, "microsoft");
    });
    test("getOrActivateProviderIdForServer - should match when resourceServer matches provider resourceServer", async () => {
      const authorizationServer = URI.parse("https://login.microsoftonline.com/common");
      const resourceServer = URI.parse("https://graph.microsoft.com");
      const authProvider = createProvider({
        id: "microsoft",
        label: "Microsoft",
        authorizationServers: [authorizationServer],
        resourceServer
      });
      authenticationService.registerAuthenticationProvider("microsoft", authProvider);
      const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer);
      assert.strictEqual(result, "microsoft");
    });
    test("getOrActivateProviderIdForServer - should not match when resourceServer does not match provider resourceServer", async () => {
      const authorizationServer = URI.parse("https://login.microsoftonline.com/common");
      const resourceServer = URI.parse("https://graph.microsoft.com");
      const differentResourceServer = URI.parse("https://vault.azure.net");
      const authProvider = createProvider({
        id: "microsoft",
        label: "Microsoft",
        authorizationServers: [authorizationServer],
        resourceServer
      });
      authenticationService.registerAuthenticationProvider("microsoft", authProvider);
      const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, differentResourceServer);
      assert.strictEqual(result, void 0);
    });
    test("getOrActivateProviderIdForServer - should match when provider has no resourceServer and resourceServer is provided", async () => {
      const authorizationServer = URI.parse("https://login.microsoftonline.com/common");
      const resourceServer = URI.parse("https://graph.microsoft.com");
      const authProvider = createProvider({
        id: "microsoft",
        label: "Microsoft",
        authorizationServers: [authorizationServer]
      });
      authenticationService.registerAuthenticationProvider("microsoft", authProvider);
      const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer);
      assert.strictEqual(result, "microsoft");
    });
    test("getOrActivateProviderIdForServer - should match when provider has resourceServer but no resourceServer is provided", async () => {
      const authorizationServer = URI.parse("https://login.microsoftonline.com/common");
      const resourceServer = URI.parse("https://graph.microsoft.com");
      const authProvider = createProvider({
        id: "microsoft",
        label: "Microsoft",
        authorizationServers: [authorizationServer],
        resourceServer
      });
      authenticationService.registerAuthenticationProvider("microsoft", authProvider);
      const result = await authenticationService.getOrActivateProviderIdForServer(authorizationServer);
      assert.strictEqual(result, "microsoft");
    });
    test("getOrActivateProviderIdForServer - should distinguish between providers with same authorization server but different resource servers", async () => {
      const authorizationServer = URI.parse("https://login.microsoftonline.com/common");
      const graphResourceServer = URI.parse("https://graph.microsoft.com");
      const vaultResourceServer = URI.parse("https://vault.azure.net");
      const graphProvider = createProvider({
        id: "microsoft-graph",
        label: "Microsoft Graph",
        authorizationServers: [authorizationServer],
        resourceServer: graphResourceServer
      });
      authenticationService.registerAuthenticationProvider("microsoft-graph", graphProvider);
      const vaultProvider = createProvider({
        id: "microsoft-vault",
        label: "Microsoft Vault",
        authorizationServers: [authorizationServer],
        resourceServer: vaultResourceServer
      });
      authenticationService.registerAuthenticationProvider("microsoft-vault", vaultProvider);
      const graphResult = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, graphResourceServer);
      assert.strictEqual(graphResult, "microsoft-graph");
      const vaultResult = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, vaultResourceServer);
      assert.strictEqual(vaultResult, "microsoft-vault");
      const otherResourceServer = URI.parse("https://storage.azure.com");
      const noMatchResult = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, otherResourceServer);
      assert.strictEqual(noMatchResult, void 0);
    });
  });
  suite("authenticationSessions", () => {
    test("getSessions - base case", async () => {
      let isCalled = false;
      const provider = createProvider({
        getSessions: async () => {
          isCalled = true;
          return [createSession()];
        }
      });
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      const sessions = await authenticationService.getSessions(provider.id);
      assert.equal(sessions.length, 1);
      assert.ok(isCalled);
    });
    test("getSessions - authorization server is not registered", async () => {
      let isCalled = false;
      const provider = createProvider({
        getSessions: async () => {
          isCalled = true;
          return [createSession()];
        }
      });
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      assert.rejects(() => authenticationService.getSessions(provider.id, [], { authorizationServer: URI.parse("https://example.com") }));
      assert.ok(!isCalled);
    });
    test("createSession", async () => {
      const emitter = new Emitter();
      const provider = createProvider({
        onDidChangeSessions: emitter.event,
        createSession: async () => {
          const session2 = createSession();
          emitter.fire({ added: [session2], removed: [], changed: [] });
          return session2;
        }
      });
      const changed = Event.toPromise(authenticationService.onDidChangeSessions);
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      const session = await authenticationService.createSession(provider.id, ["repo"]);
      assert.ok(session);
      const result = await changed;
      assert.deepEqual(result, {
        providerId: provider.id,
        label: provider.label,
        event: { added: [session], removed: [], changed: [] }
      });
    });
    test("getSessions - forwards resource option to provider", async () => {
      let receivedResource;
      const provider = createProvider({
        getSessions: async (_scopes, options) => {
          receivedResource = options.resource;
          return [createSession()];
        }
      });
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      await authenticationService.getSessions(provider.id, ["scope"], { resource: "https://api.example.com/" });
      assert.strictEqual(receivedResource, "https://api.example.com/");
    });
    test("createSession - forwards resource option to provider", async () => {
      let receivedResource;
      const provider = createProvider({
        createSession: async (_scopes, options) => {
          receivedResource = options.resource;
          return createSession();
        }
      });
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      await authenticationService.createSession(provider.id, ["scope"], { resource: "https://api.example.com/" });
      assert.strictEqual(receivedResource, "https://api.example.com/");
    });
    test("removeSession", async () => {
      const emitter = new Emitter();
      const session = createSession();
      const provider = createProvider({
        onDidChangeSessions: emitter.event,
        removeSession: async () => emitter.fire({ added: [], removed: [session], changed: [] })
      });
      const changed = Event.toPromise(authenticationService.onDidChangeSessions);
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      await authenticationService.removeSession(provider.id, session.id);
      const result = await changed;
      assert.deepEqual(result, {
        providerId: provider.id,
        label: provider.label,
        event: { added: [], removed: [session], changed: [] }
      });
    });
    test("onDidChangeSessions", async () => {
      const emitter = new Emitter();
      const provider = createProvider({
        onDidChangeSessions: emitter.event,
        getSessions: async () => []
      });
      authenticationService.registerAuthenticationProvider(provider.id, provider);
      const changed = Event.toPromise(authenticationService.onDidChangeSessions);
      const session = createSession();
      emitter.fire({ added: [], removed: [], changed: [session] });
      const result = await changed;
      assert.deepEqual(result, {
        providerId: provider.id,
        label: provider.label,
        event: { added: [], removed: [], changed: [session] }
      });
    });
  });
});
suite("AuthenticationService - tryActivateProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let authenticationService;
  setup(() => {
    const storageService = disposables.add(new TestStorageService());
    const authenticationAccessService = disposables.add(new AuthenticationAccessService(storageService, TestProductService));
    authenticationService = disposables.add(new AuthenticationService(new TestExtensionService(), authenticationAccessService, TestEnvironmentService, new NullLogService()));
  });
  teardown(() => {
    authenticationService.dispose();
  });
  test("should resolve when provider registers even if activateByEvent never resolves (#315841)", async () => {
    authenticationService.dispose();
    const storageService = disposables.add(new TestStorageService());
    const authAccessService = disposables.add(new AuthenticationAccessService(storageService, TestProductService));
    const hangingExtService = new class extends TestExtensionService {
      activateByEvent(_activationEvent, _activationKind) {
        return new Promise(() => {
        });
      }
    }();
    authenticationService = disposables.add(new AuthenticationService(hangingExtService, authAccessService, TestEnvironmentService, new NullLogService()));
    const provider = createProvider({ getSessions: async () => [createSession()] });
    const sessionsPromise = authenticationService.getSessions(provider.id);
    authenticationService.registerAuthenticationProvider(provider.id, provider);
    const sessions = await sessionsPromise;
    assert.strictEqual(sessions.length, 1);
  });
  test("should resolve when activateByEvent completes and provider is already registered", async () => {
    const provider = createProvider({ getSessions: async () => [createSession()] });
    authenticationService.registerAuthenticationProvider(provider.id, provider);
    const sessions = await authenticationService.getSessions(provider.id);
    assert.strictEqual(sessions.length, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhdXRoZW50aWNhdGlvblxcdGVzdFxcYnJvd3NlclxcYXV0aGVudGljYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbmZvcm1hdGlvbiwgQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50LCBJQXV0aGVudGljYXRpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXN0RXh0ZW5zaW9uU2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBY3RpdmF0aW9uS2luZCB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uKCkge1xuXHRyZXR1cm4geyBpZDogJ3Nlc3Npb24xJywgYWNjZXNzVG9rZW46ICd0b2tlbjEnLCBhY2NvdW50OiB7IGlkOiAnYWNjb3VudCcsIGxhYmVsOiAnQWNjb3VudCcgfSwgc2NvcGVzOiBbJ3Rlc3QnXSB9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQcm92aWRlcihvdmVycmlkZXM6IFBhcnRpYWw8SUF1dGhlbnRpY2F0aW9uUHJvdmlkZXI+ID0ge30pOiBJQXV0aGVudGljYXRpb25Qcm92aWRlciB7XG5cdHJldHVybiB7XG5cdFx0c3VwcG9ydHNNdWx0aXBsZUFjY291bnRzOiBmYWxzZSxcblx0XHRvbkRpZENoYW5nZVNlc3Npb25zOiBuZXcgRW1pdHRlcjxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+KCkuZXZlbnQsXG5cdFx0aWQ6ICd0ZXN0Jyxcblx0XHRsYWJlbDogJ1Rlc3QnLFxuXHRcdGdldFNlc3Npb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHRjcmVhdGVTZXNzaW9uOiBhc3luYyAoKSA9PiBjcmVhdGVTZXNzaW9uKCksXG5cdFx0cmVtb3ZlU2Vzc2lvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdC4uLm92ZXJyaWRlc1xuXHR9O1xufVxuXG5zdWl0ZSgnQXV0aGVudGljYXRpb25TZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBhdXRoZW50aWNhdGlvblNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZShzdG9yYWdlU2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlKSk7XG5cdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBdXRoZW50aWNhdGlvblNlcnZpY2UobmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCksIGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSwgVGVzdEVudmlyb25tZW50U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdC8vIERpc3Bvc2UgdGhlIGF1dGhlbnRpY2F0aW9uIHNlcnZpY2UgYWZ0ZXIgZWFjaCB0ZXN0XG5cdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c3VpdGUoJ2RlY2xhcmVkQXV0aGVudGljYXRpb25Qcm92aWRlcnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVnaXN0ZXJEZWNsYXJlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gRXZlbnQudG9Qcm9taXNlKGF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZURlY2xhcmVkUHJvdmlkZXJzKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBBdXRoZW50aWNhdGlvblByb3ZpZGVySW5mb3JtYXRpb24gPSB7XG5cdFx0XHRcdGlkOiAnZ2l0aHViJyxcblx0XHRcdFx0bGFiZWw6ICdHaXRIdWInXG5cdFx0XHR9O1xuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyRGVjbGFyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyKTtcblxuXHRcdFx0Ly8gQXNzZXJ0IHRoYXQgdGhlIHByb3ZpZGVyIGlzIGFkZGVkIHRvIHRoZSBkZWNsYXJlZFByb3ZpZGVycyBhcnJheSBhbmQgdGhlIGV2ZW50IGZpcmVzXG5cdFx0XHRhc3NlcnQuZXF1YWwoYXV0aGVudGljYXRpb25TZXJ2aWNlLmRlY2xhcmVkUHJvdmlkZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKGF1dGhlbnRpY2F0aW9uU2VydmljZS5kZWNsYXJlZFByb3ZpZGVyc1swXSwgcHJvdmlkZXIpO1xuXHRcdFx0YXdhaXQgY2hhbmdlZDtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VucmVnaXN0ZXJEZWNsYXJlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcjogQXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uID0ge1xuXHRcdFx0XHRpZDogJ2dpdGh1YicsXG5cdFx0XHRcdGxhYmVsOiAnR2l0SHViJ1xuXHRcdFx0fTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckRlY2xhcmVkQXV0aGVudGljYXRpb25Qcm92aWRlcihwcm92aWRlcik7XG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gRXZlbnQudG9Qcm9taXNlKGF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZURlY2xhcmVkUHJvdmlkZXJzKTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS51bnJlZ2lzdGVyRGVjbGFyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyLmlkKTtcblxuXHRcdFx0Ly8gQXNzZXJ0IHRoYXQgdGhlIHByb3ZpZGVyIGlzIHJlbW92ZWQgZnJvbSB0aGUgZGVjbGFyZWRQcm92aWRlcnMgYXJyYXkgYW5kIHRoZSBldmVudCBmaXJlc1xuXHRcdFx0YXNzZXJ0LmVxdWFsKGF1dGhlbnRpY2F0aW9uU2VydmljZS5kZWNsYXJlZFByb3ZpZGVycy5sZW5ndGgsIDApO1xuXHRcdFx0YXdhaXQgY2hhbmdlZDtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2F1dGhlbnRpY2F0aW9uUHJvdmlkZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2lzQXV0aGVudGljYXRpb25Qcm92aWRlclJlZ2lzdGVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWdpc3RlcmVkID0gRXZlbnQudG9Qcm9taXNlKGF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcik7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKCk7XG5cdFx0XHRhc3NlcnQuZXF1YWwoYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzQXV0aGVudGljYXRpb25Qcm92aWRlclJlZ2lzdGVyZWQocHJvdmlkZXIuaWQpLCBmYWxzZSk7XG5cdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyLmlkLCBwcm92aWRlcik7XG5cdFx0XHRhc3NlcnQuZXF1YWwoYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzQXV0aGVudGljYXRpb25Qcm92aWRlclJlZ2lzdGVyZWQocHJvdmlkZXIuaWQpLCB0cnVlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlZ2lzdGVyZWQ7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJlc3VsdCwgeyBpZDogcHJvdmlkZXIuaWQsIGxhYmVsOiBwcm92aWRlci5sYWJlbCB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdW5yZWdpc3RlcmVkID0gRXZlbnQudG9Qcm9taXNlKGF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoKTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIuaWQsIHByb3ZpZGVyKTtcblx0XHRcdGFzc2VydC5lcXVhbChhdXRoZW50aWNhdGlvblNlcnZpY2UuaXNBdXRoZW50aWNhdGlvblByb3ZpZGVyUmVnaXN0ZXJlZChwcm92aWRlci5pZCksIHRydWUpO1xuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyLmlkKTtcblx0XHRcdGFzc2VydC5lcXVhbChhdXRoZW50aWNhdGlvblNlcnZpY2UuaXNBdXRoZW50aWNhdGlvblByb3ZpZGVyUmVnaXN0ZXJlZChwcm92aWRlci5pZCksIGZhbHNlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHVucmVnaXN0ZXJlZDtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LCB7IGlkOiBwcm92aWRlci5pZCwgbGFiZWw6IHByb3ZpZGVyLmxhYmVsIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UHJvdmlkZXJJZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcjEgPSBjcmVhdGVQcm92aWRlcih7XG5cdFx0XHRcdGlkOiAncHJvdmlkZXIxJyxcblx0XHRcdFx0bGFiZWw6ICdQcm92aWRlciAxJ1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwcm92aWRlcjIgPSBjcmVhdGVQcm92aWRlcih7XG5cdFx0XHRcdGlkOiAncHJvdmlkZXIyJyxcblx0XHRcdFx0bGFiZWw6ICdQcm92aWRlciAyJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIxLmlkLCBwcm92aWRlcjEpO1xuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihwcm92aWRlcjIuaWQsIHByb3ZpZGVyMik7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVySWRzID0gYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCk7XG5cblx0XHRcdC8vIEFzc2VydCB0aGF0IHRoZSBwcm92aWRlcklkcyBhcnJheSBjb250YWlucyB0aGUgcmVnaXN0ZXJlZCBwcm92aWRlciBpZHNcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocHJvdmlkZXJJZHMsIFtwcm92aWRlcjEuaWQsIHByb3ZpZGVyMi5pZF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKCk7XG5cblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIuaWQsIHByb3ZpZGVyKTtcblxuXHRcdFx0Y29uc3QgcmV0cmlldmVkUHJvdmlkZXIgPSBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXIuaWQpO1xuXG5cdFx0XHQvLyBBc3NlcnQgdGhhdCB0aGUgcmV0cmlldmVkIHByb3ZpZGVyIGlzIHRoZSBzYW1lIGFzIHRoZSByZWdpc3RlcmVkIHByb3ZpZGVyXG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHJldHJpZXZlZFByb3ZpZGVyLCBwcm92aWRlcik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlciAtIHNob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gbm8gcHJvdmlkZXIgbWF0Y2hlcyB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIoYXV0aG9yaXphdGlvblNlcnZlcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIgLSBzaG91bGQgcmV0dXJuIHByb3ZpZGVyIGlkIGlmIGF1dGhvcml6YXRpb25TZXJ2ZXJHbG9icyBtYXRjaGVzIGFuZCBhdXRob3JpemF0aW9uU2VydmVycyBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlZ2lzdGVyIGEgZGVjbGFyZWQgcHJvdmlkZXIgd2l0aCBhbiBhdXRob3JpemF0aW9uIHNlcnZlciBnbG9iXG5cdFx0XHRjb25zdCBwcm92aWRlcjogQXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uID0ge1xuXHRcdFx0XHRpZDogJ2dpdGh1YicsXG5cdFx0XHRcdGxhYmVsOiAnR2l0SHViJyxcblx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlckdsb2JzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS8qJ11cblx0XHRcdH07XG5cdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJEZWNsYXJlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciBhbiBhdXRoZW50aWNhdGlvbiBwcm92aWRlciB3aXRoIG1hdGNoaW5nIGF1dGhvcml6YXRpb24gc2VydmVyc1xuXHRcdFx0Y29uc3QgYXV0aFByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoe1xuXHRcdFx0XHRpZDogJ2dpdGh1YicsXG5cdFx0XHRcdGxhYmVsOiAnR2l0SHViJyxcblx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcnM6IFtVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbicpXVxuXHRcdFx0fSk7XG5cdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKCdnaXRodWInLCBhdXRoUHJvdmlkZXIpO1xuXG5cdFx0XHQvLyBUZXN0IHdpdGggYSBtYXRjaGluZyBVUklcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyKGF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIHJlc3VsdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ2dpdGh1YicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIgLSBzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBpZiBhdXRob3JpemF0aW9uU2VydmVyR2xvYnMgbWF0Y2ggYnV0IGF1dGhvcml6YXRpb25TZXJ2ZXJzIGRvIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlZ2lzdGVyIGEgZGVjbGFyZWQgcHJvdmlkZXIgd2l0aCBhbiBhdXRob3JpemF0aW9uIHNlcnZlciBnbG9iXG5cdFx0XHRjb25zdCBwcm92aWRlcjogQXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uID0ge1xuXHRcdFx0XHRpZDogJ2dpdGh1YicsXG5cdFx0XHRcdGxhYmVsOiAnR2l0SHViJyxcblx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlckdsb2JzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS8qJ11cblx0XHRcdH07XG5cdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJEZWNsYXJlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciBhbiBhdXRoZW50aWNhdGlvbiBwcm92aWRlciB3aXRoIG5vbi1tYXRjaGluZyBhdXRob3JpemF0aW9uIHNlcnZlcnNcblx0XHRcdGNvbnN0IGF1dGhQcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKHtcblx0XHRcdFx0aWQ6ICdnaXRodWInLFxuXHRcdFx0XHRsYWJlbDogJ0dpdEh1YicsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJzOiBbVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vZGlmZmVyZW50JyldXG5cdFx0XHR9KTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoJ2dpdGh1YicsIGF1dGhQcm92aWRlcik7XG5cblx0XHRcdC8vIFRlc3Qgd2l0aCBhIG5vbi1tYXRjaGluZyBVUklcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyKGF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIHJlc3VsdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yQXV0aG9yaXphdGlvblNlcnZlciAtIHNob3VsZCBjaGVjayBtdWx0aXBsZSBwcm92aWRlcnMgYW5kIHJldHVybiB0aGUgZmlyc3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdpc3RlciB0d28gZGVjbGFyZWQgcHJvdmlkZXJzIHdpdGggYXV0aG9yaXphdGlvbiBzZXJ2ZXIgZ2xvYnNcblx0XHRcdGNvbnN0IHByb3ZpZGVyMTogQXV0aGVudGljYXRpb25Qcm92aWRlckluZm9ybWF0aW9uID0ge1xuXHRcdFx0XHRpZDogJ2dpdGh1YicsXG5cdFx0XHRcdGxhYmVsOiAnR2l0SHViJyxcblx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlckdsb2JzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS8qJ11cblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm92aWRlcjI6IEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbmZvcm1hdGlvbiA9IHtcblx0XHRcdFx0aWQ6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRsYWJlbDogJ01pY3Jvc29mdCcsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJHbG9iczogWydodHRwczovL2xvZ2luLm1pY3Jvc29mdG9ubGluZS5jb20vKiddXG5cdFx0XHR9O1xuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyRGVjbGFyZWRBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyMSk7XG5cdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJEZWNsYXJlZEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIyKTtcblxuXHRcdFx0Ly8gUmVnaXN0ZXIgYXV0aGVudGljYXRpb24gcHJvdmlkZXJzXG5cdFx0XHRjb25zdCBnaXRodWJQcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKHtcblx0XHRcdFx0aWQ6ICdnaXRodWInLFxuXHRcdFx0XHRsYWJlbDogJ0dpdEh1YicsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJzOiBbVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vZGlmZmVyZW50JyldXG5cdFx0XHR9KTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoJ2dpdGh1YicsIGdpdGh1YlByb3ZpZGVyKTtcblxuXHRcdFx0Y29uc3QgbWljcm9zb2Z0UHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcih7XG5cdFx0XHRcdGlkOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0bGFiZWw6ICdNaWNyb3NvZnQnLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyczogW1VSSS5wYXJzZSgnaHR0cHM6Ly9sb2dpbi5taWNyb3NvZnRvbmxpbmUuY29tL2NvbW1vbicpXVxuXHRcdFx0fSk7XG5cdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKCdtaWNyb3NvZnQnLCBtaWNyb3NvZnRQcm92aWRlcik7XG5cblx0XHRcdC8vIFRlc3Qgd2l0aCBhIFVSSSB0aGF0IHNob3VsZCBtYXRjaCB0aGUgc2Vjb25kIHByb3ZpZGVyXG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gVVJJLnBhcnNlKCdodHRwczovL2xvZ2luLm1pY3Jvc29mdG9ubGluZS5jb20vY29tbW9uJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIoYXV0aG9yaXphdGlvblNlcnZlcik7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgcmVzdWx0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnbWljcm9zb2Z0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlciAtIHNob3VsZCBtYXRjaCB3aGVuIHJlc291cmNlU2VydmVyIG1hdGNoZXMgcHJvdmlkZXIgcmVzb3VyY2VTZXJ2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gVVJJLnBhcnNlKCdodHRwczovL2xvZ2luLm1pY3Jvc29mdG9ubGluZS5jb20vY29tbW9uJyk7XG5cdFx0XHRjb25zdCByZXNvdXJjZVNlcnZlciA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tJyk7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIGFuIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIHdpdGggYSByZXNvdXJjZVNlcnZlclxuXHRcdFx0Y29uc3QgYXV0aFByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoe1xuXHRcdFx0XHRpZDogJ21pY3Jvc29mdCcsXG5cdFx0XHRcdGxhYmVsOiAnTWljcm9zb2Z0Jyxcblx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcnM6IFthdXRob3JpemF0aW9uU2VydmVyXSxcblx0XHRcdFx0cmVzb3VyY2VTZXJ2ZXI6IHJlc291cmNlU2VydmVyXG5cdFx0XHR9KTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoJ21pY3Jvc29mdCcsIGF1dGhQcm92aWRlcik7XG5cblx0XHRcdC8vIFRlc3Qgd2l0aCBtYXRjaGluZyBhdXRob3JpemF0aW9uIHNlcnZlciBhbmQgcmVzb3VyY2Ugc2VydmVyXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIoYXV0aG9yaXphdGlvblNlcnZlciwgcmVzb3VyY2VTZXJ2ZXIpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIHJlc3VsdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ21pY3Jvc29mdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIgLSBzaG91bGQgbm90IG1hdGNoIHdoZW4gcmVzb3VyY2VTZXJ2ZXIgZG9lcyBub3QgbWF0Y2ggcHJvdmlkZXIgcmVzb3VyY2VTZXJ2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gVVJJLnBhcnNlKCdodHRwczovL2xvZ2luLm1pY3Jvc29mdG9ubGluZS5jb20vY29tbW9uJyk7XG5cdFx0XHRjb25zdCByZXNvdXJjZVNlcnZlciA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tJyk7XG5cdFx0XHRjb25zdCBkaWZmZXJlbnRSZXNvdXJjZVNlcnZlciA9IFVSSS5wYXJzZSgnaHR0cHM6Ly92YXVsdC5henVyZS5uZXQnKTtcblxuXHRcdFx0Ly8gUmVnaXN0ZXIgYW4gYXV0aGVudGljYXRpb24gcHJvdmlkZXIgd2l0aCBhIHJlc291cmNlU2VydmVyXG5cdFx0XHRjb25zdCBhdXRoUHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcih7XG5cdFx0XHRcdGlkOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0bGFiZWw6ICdNaWNyb3NvZnQnLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyczogW2F1dGhvcml6YXRpb25TZXJ2ZXJdLFxuXHRcdFx0XHRyZXNvdXJjZVNlcnZlcjogcmVzb3VyY2VTZXJ2ZXJcblx0XHRcdH0pO1xuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcignbWljcm9zb2Z0JywgYXV0aFByb3ZpZGVyKTtcblxuXHRcdFx0Ly8gVGVzdCB3aXRoIG1hdGNoaW5nIGF1dGhvcml6YXRpb24gc2VydmVyIGJ1dCBkaWZmZXJlbnQgcmVzb3VyY2Ugc2VydmVyXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIoYXV0aG9yaXphdGlvblNlcnZlciwgZGlmZmVyZW50UmVzb3VyY2VTZXJ2ZXIpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhlIHJlc3VsdCAtIHNob3VsZCBub3QgbWF0Y2ggYmVjYXVzZSByZXNvdXJjZSBzZXJ2ZXJzIGRvbid0IG1hdGNoXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIgLSBzaG91bGQgbWF0Y2ggd2hlbiBwcm92aWRlciBoYXMgbm8gcmVzb3VyY2VTZXJ2ZXIgYW5kIHJlc291cmNlU2VydmVyIGlzIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9sb2dpbi5taWNyb3NvZnRvbmxpbmUuY29tL2NvbW1vbicpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VTZXJ2ZXIgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZ3JhcGgubWljcm9zb2Z0LmNvbScpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciBhbiBhdXRoZW50aWNhdGlvbiBwcm92aWRlciB3aXRob3V0IGEgcmVzb3VyY2VTZXJ2ZXJcblx0XHRcdGNvbnN0IGF1dGhQcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKHtcblx0XHRcdFx0aWQ6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRsYWJlbDogJ01pY3Jvc29mdCcsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJzOiBbYXV0aG9yaXphdGlvblNlcnZlcl1cblx0XHRcdH0pO1xuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcignbWljcm9zb2Z0JywgYXV0aFByb3ZpZGVyKTtcblxuXHRcdFx0Ly8gVGVzdCB3aXRoIG1hdGNoaW5nIGF1dGhvcml6YXRpb24gc2VydmVyIGFuZCBhIHJlc291cmNlIHNlcnZlclxuXHRcdFx0Ly8gU2hvdWxkIG1hdGNoIGJlY2F1c2UgcHJvdmlkZXIgaGFzIG5vIHJlc291cmNlU2VydmVyIGRlZmluZWRcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcihhdXRob3JpemF0aW9uU2VydmVyLCByZXNvdXJjZVNlcnZlcik7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgcmVzdWx0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnbWljcm9zb2Z0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlciAtIHNob3VsZCBtYXRjaCB3aGVuIHByb3ZpZGVyIGhhcyByZXNvdXJjZVNlcnZlciBidXQgbm8gcmVzb3VyY2VTZXJ2ZXIgaXMgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gVVJJLnBhcnNlKCdodHRwczovL2xvZ2luLm1pY3Jvc29mdG9ubGluZS5jb20vY29tbW9uJyk7XG5cdFx0XHRjb25zdCByZXNvdXJjZVNlcnZlciA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tJyk7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIGFuIGF1dGhlbnRpY2F0aW9uIHByb3ZpZGVyIHdpdGggYSByZXNvdXJjZVNlcnZlclxuXHRcdFx0Y29uc3QgYXV0aFByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoe1xuXHRcdFx0XHRpZDogJ21pY3Jvc29mdCcsXG5cdFx0XHRcdGxhYmVsOiAnTWljcm9zb2Z0Jyxcblx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlcnM6IFthdXRob3JpemF0aW9uU2VydmVyXSxcblx0XHRcdFx0cmVzb3VyY2VTZXJ2ZXI6IHJlc291cmNlU2VydmVyXG5cdFx0XHR9KTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoJ21pY3Jvc29mdCcsIGF1dGhQcm92aWRlcik7XG5cblx0XHRcdC8vIFRlc3Qgd2l0aCBtYXRjaGluZyBhdXRob3JpemF0aW9uIHNlcnZlciBidXQgbm8gcmVzb3VyY2Ugc2VydmVyIHByb3ZpZGVkXG5cdFx0XHQvLyBTaG91bGQgbWF0Y2ggYmVjYXVzZSBubyByZXNvdXJjZVNlcnZlciBpcyBwcm92aWRlZCB0byBjaGVjayBhZ2FpbnN0XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIoYXV0aG9yaXphdGlvblNlcnZlcik7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgcmVzdWx0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnbWljcm9zb2Z0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlciAtIHNob3VsZCBkaXN0aW5ndWlzaCBiZXR3ZWVuIHByb3ZpZGVycyB3aXRoIHNhbWUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgYnV0IGRpZmZlcmVudCByZXNvdXJjZSBzZXJ2ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9sb2dpbi5taWNyb3NvZnRvbmxpbmUuY29tL2NvbW1vbicpO1xuXHRcdFx0Y29uc3QgZ3JhcGhSZXNvdXJjZVNlcnZlciA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tJyk7XG5cdFx0XHRjb25zdCB2YXVsdFJlc291cmNlU2VydmVyID0gVVJJLnBhcnNlKCdodHRwczovL3ZhdWx0LmF6dXJlLm5ldCcpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciBmaXJzdCBwcm92aWRlciB3aXRoIEdyYXBoIHJlc291cmNlIHNlcnZlclxuXHRcdFx0Y29uc3QgZ3JhcGhQcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKHtcblx0XHRcdFx0aWQ6ICdtaWNyb3NvZnQtZ3JhcGgnLFxuXHRcdFx0XHRsYWJlbDogJ01pY3Jvc29mdCBHcmFwaCcsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJzOiBbYXV0aG9yaXphdGlvblNlcnZlcl0sXG5cdFx0XHRcdHJlc291cmNlU2VydmVyOiBncmFwaFJlc291cmNlU2VydmVyXG5cdFx0XHR9KTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoJ21pY3Jvc29mdC1ncmFwaCcsIGdyYXBoUHJvdmlkZXIpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciBzZWNvbmQgcHJvdmlkZXIgd2l0aCBWYXVsdCByZXNvdXJjZSBzZXJ2ZXJcblx0XHRcdGNvbnN0IHZhdWx0UHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcih7XG5cdFx0XHRcdGlkOiAnbWljcm9zb2Z0LXZhdWx0Jyxcblx0XHRcdFx0bGFiZWw6ICdNaWNyb3NvZnQgVmF1bHQnLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyczogW2F1dGhvcml6YXRpb25TZXJ2ZXJdLFxuXHRcdFx0XHRyZXNvdXJjZVNlcnZlcjogdmF1bHRSZXNvdXJjZVNlcnZlclxuXHRcdFx0fSk7XG5cdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKCdtaWNyb3NvZnQtdmF1bHQnLCB2YXVsdFByb3ZpZGVyKTtcblxuXHRcdFx0Ly8gVGVzdCB3aXRoIEdyYXBoIHJlc291cmNlIHNlcnZlciAtIHNob3VsZCBtYXRjaCB0aGUgZmlyc3QgcHJvdmlkZXJcblx0XHRcdGNvbnN0IGdyYXBoUmVzdWx0ID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyKGF1dGhvcml6YXRpb25TZXJ2ZXIsIGdyYXBoUmVzb3VyY2VTZXJ2ZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyYXBoUmVzdWx0LCAnbWljcm9zb2Z0LWdyYXBoJyk7XG5cblx0XHRcdC8vIFRlc3Qgd2l0aCBWYXVsdCByZXNvdXJjZSBzZXJ2ZXIgLSBzaG91bGQgbWF0Y2ggdGhlIHNlY29uZCBwcm92aWRlclxuXHRcdFx0Y29uc3QgdmF1bHRSZXN1bHQgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXIoYXV0aG9yaXphdGlvblNlcnZlciwgdmF1bHRSZXNvdXJjZVNlcnZlcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmF1bHRSZXN1bHQsICdtaWNyb3NvZnQtdmF1bHQnKTtcblxuXHRcdFx0Ly8gVGVzdCB3aXRoIGRpZmZlcmVudCByZXNvdXJjZSBzZXJ2ZXIgLSBzaG91bGQgbm90IG1hdGNoIGVpdGhlclxuXHRcdFx0Y29uc3Qgb3RoZXJSZXNvdXJjZVNlcnZlciA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9zdG9yYWdlLmF6dXJlLmNvbScpO1xuXHRcdFx0Y29uc3Qgbm9NYXRjaFJlc3VsdCA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcihhdXRob3JpemF0aW9uU2VydmVyLCBvdGhlclJlc291cmNlU2VydmVyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub01hdGNoUmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXV0aGVudGljYXRpb25TZXNzaW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdnZXRTZXNzaW9ucyAtIGJhc2UgY2FzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBpc0NhbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcih7XG5cdFx0XHRcdGdldFNlc3Npb25zOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aXNDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBbY3JlYXRlU2Vzc2lvbigpXTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihwcm92aWRlci5pZCwgcHJvdmlkZXIpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXIuaWQpO1xuXG5cdFx0XHRhc3NlcnQuZXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhpc0NhbGxlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRTZXNzaW9ucyAtIGF1dGhvcml6YXRpb24gc2VydmVyIGlzIG5vdCByZWdpc3RlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGlzQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKHtcblx0XHRcdFx0Z2V0U2Vzc2lvbnM6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpc0NhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIFtjcmVhdGVTZXNzaW9uKCldO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyLmlkLCBwcm92aWRlcik7XG5cdFx0XHRhc3NlcnQucmVqZWN0cygoKSA9PiBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXIuaWQsIFtdLCB7IGF1dGhvcml6YXRpb25TZXJ2ZXI6IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpIH0pKTtcblx0XHRcdGFzc2VydC5vayghaXNDYWxsZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+KCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKHtcblx0XHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uczogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHRcdFx0ZW1pdHRlci5maXJlKHsgYWRkZWQ6IFtzZXNzaW9uXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gRXZlbnQudG9Qcm9taXNlKGF1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIuaWQsIHByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuY3JlYXRlU2Vzc2lvbihwcm92aWRlci5pZCwgWydyZXBvJ10pO1xuXG5cdFx0XHQvLyBBc3NlcnQgdGhhdCB0aGUgY3JlYXRlZCBzZXNzaW9uIG1hdGNoZXMgdGhlIGV4cGVjdGVkIHNlc3Npb24gYW5kIHRoZSBldmVudCBmaXJlc1xuXHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2hhbmdlZDtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLFxuXHRcdFx0XHRsYWJlbDogcHJvdmlkZXIubGFiZWwsXG5cdFx0XHRcdGV2ZW50OiB7IGFkZGVkOiBbc2Vzc2lvbl0sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbXSB9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFNlc3Npb25zIC0gZm9yd2FyZHMgcmVzb3VyY2Ugb3B0aW9uIHRvIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHJlY2VpdmVkUmVzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoe1xuXHRcdFx0XHRnZXRTZXNzaW9uczogYXN5bmMgKF9zY29wZXMsIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRyZWNlaXZlZFJlc291cmNlID0gb3B0aW9ucy5yZXNvdXJjZTtcblx0XHRcdFx0XHRyZXR1cm4gW2NyZWF0ZVNlc3Npb24oKV07XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIuaWQsIHByb3ZpZGVyKTtcblx0XHRcdGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlci5pZCwgWydzY29wZSddLCB7IHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY2VpdmVkUmVzb3VyY2UsICdodHRwczovL2FwaS5leGFtcGxlLmNvbS8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZVNlc3Npb24gLSBmb3J3YXJkcyByZXNvdXJjZSBvcHRpb24gdG8gcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgcmVjZWl2ZWRSZXNvdXJjZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcih7XG5cdFx0XHRcdGNyZWF0ZVNlc3Npb246IGFzeW5jIChfc2NvcGVzLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdFx0cmVjZWl2ZWRSZXNvdXJjZSA9IG9wdGlvbnMucmVzb3VyY2U7XG5cdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihwcm92aWRlci5pZCwgcHJvdmlkZXIpO1xuXHRcdFx0YXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24ocHJvdmlkZXIuaWQsIFsnc2NvcGUnXSwgeyByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tLycgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZFJlc291cmNlLCAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20vJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVTZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudD4oKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKHtcblx0XHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uczogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0cmVtb3ZlU2Vzc2lvbjogYXN5bmMgKCkgPT4gZW1pdHRlci5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbc2Vzc2lvbl0sIGNoYW5nZWQ6IFtdIH0pXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNoYW5nZWQgPSBFdmVudC50b1Byb21pc2UoYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMpO1xuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihwcm92aWRlci5pZCwgcHJvdmlkZXIpO1xuXHRcdFx0YXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLnJlbW92ZVNlc3Npb24ocHJvdmlkZXIuaWQsIHNlc3Npb24uaWQpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjaGFuZ2VkO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0cHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsXG5cdFx0XHRcdGxhYmVsOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0ZXZlbnQ6IHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbc2Vzc2lvbl0sIGNoYW5nZWQ6IFtdIH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25EaWRDaGFuZ2VTZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+KCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKHtcblx0XHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uczogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0Z2V0U2Vzc2lvbnM6IGFzeW5jICgpID0+IFtdXG5cdFx0XHR9KTtcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXIuaWQsIHByb3ZpZGVyKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IEV2ZW50LnRvUHJvbWlzZShhdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0ZW1pdHRlci5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3Nlc3Npb25dIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjaGFuZ2VkO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0cHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsXG5cdFx0XHRcdGxhYmVsOiBwcm92aWRlci5sYWJlbCxcblx0XHRcdFx0ZXZlbnQ6IHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW3Nlc3Npb25dIH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdBdXRoZW50aWNhdGlvblNlcnZpY2UgLSB0cnlBY3RpdmF0ZVByb3ZpZGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBhdXRoZW50aWNhdGlvblNlcnZpY2U6IEF1dGhlbnRpY2F0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZShzdG9yYWdlU2VydmljZSwgVGVzdFByb2R1Y3RTZXJ2aWNlKSk7XG5cdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBdXRoZW50aWNhdGlvblNlcnZpY2UobmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCksIGF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSwgVGVzdEVudmlyb25tZW50U2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXNvbHZlIHdoZW4gcHJvdmlkZXIgcmVnaXN0ZXJzIGV2ZW4gaWYgYWN0aXZhdGVCeUV2ZW50IG5ldmVyIHJlc29sdmVzICgjMzE1ODQxKScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBEaXNwb3NlIHRoZSBzZXJ2aWNlIGNyZWF0ZWQgaW4gc2V0dXAgdG8gcmVsZWFzZSB0aGUgZXh0ZW5zaW9uIHBvaW50IGhhbmRsZXIsXG5cdFx0Ly8gc28gd2UgY2FuIGNyZWF0ZSBhIG5ldyBvbmUgd2l0aCBhIGhhbmdpbmcgYWN0aXZhdGVCeUV2ZW50LlxuXHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGF1dGhBY2Nlc3NTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2Uoc3RvcmFnZVNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSkpO1xuXHRcdC8vIFNpbXVsYXRlIGEgZGVhZGxvY2tlZCBleHRlbnNpb24gaG9zdDogYWN0aXZhdGVCeUV2ZW50IG5ldmVyIHJlc29sdmVzLlxuXHRcdGNvbnN0IGhhbmdpbmdFeHRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdEV4dGVuc2lvblNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgYWN0aXZhdGVCeUV2ZW50KF9hY3RpdmF0aW9uRXZlbnQ6IHN0cmluZywgX2FjdGl2YXRpb25LaW5kPzogQWN0aXZhdGlvbktpbmQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KCgpID0+IHsgLyogbmV2ZXIgcmVzb2x2ZXMgKi8gfSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEF1dGhlbnRpY2F0aW9uU2VydmljZShoYW5naW5nRXh0U2VydmljZSwgYXV0aEFjY2Vzc1NlcnZpY2UsIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKHsgZ2V0U2Vzc2lvbnM6IGFzeW5jICgpID0+IFtjcmVhdGVTZXNzaW9uKCldIH0pO1xuXG5cdFx0Ly8gU3RhcnQgZ2V0U2Vzc2lvbnMgXHUyMDE0IHRoaXMgY2FsbHMgdHJ5QWN0aXZhdGVQcm92aWRlciB3aGljaCBmaXJlcyBhY3RpdmF0ZUJ5RXZlbnQuXG5cdFx0Ly8gU2luY2UgYWN0aXZhdGVCeUV2ZW50IG5ldmVyIHJlc29sdmVzLCB0aGUgb2xkIGNvZGUgd291bGQgZGVhZGxvY2sgaGVyZS5cblx0XHRjb25zdCBzZXNzaW9uc1Byb21pc2UgPSBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXIuaWQpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIGxvY2FsIGV4dGVuc2lvbiBob3N0IHJlZ2lzdGVyaW5nIHRoZSBwcm92aWRlclxuXHRcdC8vIHdoaWxlIHRoZSB3ZWJ3b3JrZXIgaG9zdCBpcyBzdGlsbCBzdHVjay5cblx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKHByb3ZpZGVyLmlkLCBwcm92aWRlcik7XG5cblx0XHQvLyBUaGUgUHJvbWlzZS5yYWNlIGluIHRyeUFjdGl2YXRlUHJvdmlkZXIgc2hvdWxkIHVuYmxvY2sgaW1tZWRpYXRlbHkuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBzZXNzaW9uc1Byb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXNvbHZlIHdoZW4gYWN0aXZhdGVCeUV2ZW50IGNvbXBsZXRlcyBhbmQgcHJvdmlkZXIgaXMgYWxyZWFkeSByZWdpc3RlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoeyBnZXRTZXNzaW9uczogYXN5bmMgKCkgPT4gW2NyZWF0ZVNlc3Npb24oKV0gfSk7XG5cdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihwcm92aWRlci5pZCwgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXIuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsV0FBVztBQUNwQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHNCQUFzQixvQkFBb0IsMEJBQTBCO0FBQzdFLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsZ0JBQWdCO0FBQ3hCLFNBQU8sRUFBRSxJQUFJLFlBQVksYUFBYSxVQUFVLFNBQVMsRUFBRSxJQUFJLFdBQVcsT0FBTyxVQUFVLEdBQUcsUUFBUSxDQUFDLE1BQU0sRUFBRTtBQUNoSDtBQUVBLFNBQVMsZUFBZSxZQUE4QyxDQUFDLEdBQTRCO0FBQ2xHLFNBQU87QUFBQSxJQUNOLDBCQUEwQjtBQUFBLElBQzFCLHFCQUFxQixJQUFJLFFBQTJDLEVBQUU7QUFBQSxJQUN0RSxJQUFJO0FBQUEsSUFDSixPQUFPO0FBQUEsSUFDUCxhQUFhLFlBQVksQ0FBQztBQUFBLElBQzFCLGVBQWUsWUFBWSxjQUFjO0FBQUEsSUFDekMsZUFBZSxZQUFZO0FBQUEsSUFBRTtBQUFBLElBQzdCLEdBQUc7QUFBQSxFQUNKO0FBQ0Q7QUFFQSxNQUFNLHlCQUF5QixNQUFNO0FBQ3BDLFFBQU0s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
