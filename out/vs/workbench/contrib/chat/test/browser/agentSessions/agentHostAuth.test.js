import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { Event } from "../../../../../../base/common/event.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IAuthenticationMcpAccessService } from "../../../../../services/authentication/browser/authenticationMcpAccessService.js";
import { IAuthenticationMcpService } from "../../../../../services/authentication/browser/authenticationMcpService.js";
import { IAuthenticationMcpUsageService } from "../../../../../services/authentication/browser/authenticationMcpUsageService.js";
import { IAuthenticationService } from "../../../../../services/authentication/common/authentication.js";
import { IDynamicAuthenticationProviderStorageService } from "../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { CHAT_SETUP_ACTION_ID } from "../../../browser/actions/chatActions.js";
import { AgentHostAuthenticationRecovery, authenticateProtectedResources, resolveAuthenticationInteractively, resolveTokenForResource, AgentHostAuthTokenCache, agentHostMcpServerId, resolveMcpServerAuthentication, modelRequiresAgentAuthentication } from "../../../browser/agentSessions/agentHost/agentHostAuth.js";
import { createAgentModelByokMeta } from "../../../../../../platform/agentHost/common/agentModelByokMeta.js";
class TestCommandService extends mock() {
  constructor() {
    super(...arguments);
    this.calls = [];
    this.result = { success: true, dialogSkipped: false };
  }
  async executeCommand(commandId, ...args) {
    this.calls.push({ commandId, args });
    await this.onExecute?.();
    return this.result;
  }
}
function createAuthInstantiationService(disposables, authenticationService, commandService = new TestCommandService()) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IAuthenticationService, authenticationService);
  instantiationService.stub(ICommandService, commandService);
  instantiationService.stub(ILogService, new NullLogService());
  return instantiationService;
}
function createMockAuthService(overrides) {
  return {
    getOrActivateProviderIdForServer: overrides.getOrActivateProviderIdForServer ?? (() => Promise.resolve(void 0)),
    getSessions: overrides.getSessions ?? (() => Promise.resolve([])),
    createSession: overrides.createSession ?? (() => Promise.reject(new Error("Unexpected createSession call"))),
    createDynamicAuthenticationProvider: overrides.createDynamicAuthenticationProvider ?? (() => Promise.resolve(void 0)),
    getProvider: overrides.getProvider ?? (() => {
      throw new Error("Unexpected getProvider call");
    }),
    isDynamicAuthenticationProvider: overrides.isDynamicAuthenticationProvider ?? (() => false),
    unregisterAuthenticationProvider: overrides.unregisterAuthenticationProvider ?? (() => {
    })
  };
}
suite("agentHostMcpServerId", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("is stable for the same authority, server name and resource url", () => {
    const a = agentHostMcpServerId("remote-host", "GitHub", "https://api.githubcopilot.com/mcp/");
    const b = agentHostMcpServerId("remote-host", "GitHub", "https://api.githubcopilot.com/mcp/");
    assert.strictEqual(a, b);
    assert.strictEqual(a, "agent-host-mcp:remote-host/GitHub/https%3A%2F%2Fapi.githubcopilot.com%2Fmcp%2F");
  });
  test("differs when authority, name or url differ", () => {
    const base = agentHostMcpServerId("host-1", "GitHub", "https://a.example/mcp");
    const keys = /* @__PURE__ */ new Set([
      base,
      agentHostMcpServerId("host-2", "GitHub", "https://a.example/mcp"),
      agentHostMcpServerId("host-1", "Other", "https://a.example/mcp"),
      agentHostMcpServerId("host-1", "GitHub", "https://b.example/mcp")
    ]);
    assert.strictEqual(keys.size, 4);
  });
});
suite("resolveTokenForResource", () => {
  const log = new NullLogService();
  const resource = URI.parse("https://api.example.com");
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns undefined when no authorization servers provided", async () => {
    const authService = createMockAuthService({});
    const token = await resolveTokenForResource(resource, [], ["read"], authService, log, "test");
    assert.strictEqual(token, void 0);
  });
  test("returns undefined when no provider matches the server", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve(void 0)
    });
    const token = await resolveTokenForResource(resource, ["https://auth.example.com"], ["read"], authService, log, "test");
    assert.strictEqual(token, void 0);
  });
  test("returns token from exact scope match", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes && scopes.length === 1 && scopes[0] === "read") {
          return Promise.resolve([{ scopes: ["read"], accessToken: "exact-token" }]);
        }
        return Promise.resolve([]);
      }
    });
    const token = await resolveTokenForResource(resource, ["https://auth.example.com"], ["read"], authService, log, "test");
    assert.strictEqual(token, "exact-token");
  });
  test("falls back to narrowest superset session when exact match fails", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes !== void 0) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          { scopes: ["read", "write", "admin"], accessToken: "wide-token" },
          { scopes: ["read", "write"], accessToken: "narrow-token" }
        ]);
      }
    });
    const token = await resolveTokenForResource(resource, ["https://auth.example.com"], ["read"], authService, log, "test");
    assert.strictEqual(token, "narrow-token");
  });
  test("returns undefined when no session has matching scopes", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes !== void 0) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          { scopes: ["write"], accessToken: "wrong-token" }
        ]);
      }
    });
    const token = await resolveTokenForResource(resource, ["https://auth.example.com"], ["read"], authService, log, "test");
    assert.strictEqual(token, void 0);
  });
  test("tries multiple authorization servers in order", async () => {
    const calls = [];
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: (serverUri) => {
        calls.push(serverUri.toString());
        if (serverUri.toString() === "https://auth2.example.com/") {
          return Promise.resolve("provider-2");
        }
        return Promise.resolve(void 0);
      },
      getSessions: () => Promise.resolve([{ scopes: ["read"], accessToken: "server2-token" }])
    });
    const token = await resolveTokenForResource(
      resource,
      ["https://auth1.example.com", "https://auth2.example.com"],
      ["read"],
      authService,
      log,
      "test"
    );
    assert.strictEqual(token, "server2-token");
    assert.strictEqual(calls.length, 2);
  });
});
suite("AgentHostAuthTokenCache", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("forwards the first token and skips it after completion", async () => {
    const cache = new AgentHostAuthTokenCache();
    let authenticateCalls = 0;
    const authenticate = async () => {
      authenticateCalls++;
    };
    const results = [
      await cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate),
      await cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate)
    ];
    assert.deepStrictEqual({ results, authenticateCalls }, { results: [true, false], authenticateCalls: 1 });
  });
  test("same-token callers await the in-flight authentication", async () => {
    const cache = new AgentHostAuthTokenCache();
    const authentication = new DeferredPromise();
    let authenticateCalls = 0;
    const authenticate = async () => {
      authenticateCalls++;
      await authentication.p;
    };
    let secondSettled = false;
    const first = cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate);
    const second = cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate).then((result) => {
      secondSettled = true;
      return result;
    });
    await Promise.resolve();
    const beforeCompletion = { authenticateCalls, secondSettled };
    authentication.complete();
    assert.deepStrictEqual({
      beforeCompletion,
      results: await Promise.all([first, second]),
      authenticateCalls
    }, {
      beforeCompletion: { authenticateCalls: 1, secondSettled: false },
      results: [true, false],
      authenticateCalls: 1
    });
  });
  test("different tokens are serialized for the same resource and scopes", async () => {
    const cache = new AgentHostAuthTokenCache();
    const firstAuthentication = new DeferredPromise();
    const calls = [];
    const first = cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      calls.push("tok1");
      await firstAuthentication.p;
    });
    const second = cache.authenticate("https://api.example.com", ["read"], "tok2", async () => {
      calls.push("tok2");
    });
    await Promise.resolve();
    const beforeCompletion = [...calls];
    firstAuthentication.complete();
    await Promise.all([first, second]);
    assert.deepStrictEqual({ beforeCompletion, calls }, { beforeCompletion: ["tok1"], calls: ["tok1", "tok2"] });
  });
  test("a completed token waits for a newer in-flight authentication", async () => {
    const cache = new AgentHostAuthTokenCache();
    const newerAuthentication = new DeferredPromise();
    const calls = [];
    await cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      calls.push("tok1");
    });
    const newer = cache.authenticate("https://api.example.com", ["read"], "tok2", async () => {
      calls.push("tok2");
      await newerAuthentication.p;
    });
    let olderSettled = false;
    const older = cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      calls.push("tok1");
    }).then((result) => {
      olderSettled = true;
      return result;
    });
    await Promise.resolve();
    const beforeCompletion = { calls: [...calls], olderSettled };
    newerAuthentication.complete();
    assert.deepStrictEqual({
      beforeCompletion,
      results: await Promise.all([newer, older]),
      calls
    }, {
      beforeCompletion: { calls: ["tok1", "tok2"], olderSettled: false },
      results: [true, true],
      calls: ["tok1", "tok2", "tok1"]
    });
  });
  test("clear cancels queued authentication from the previous generation", async () => {
    const cache = new AgentHostAuthTokenCache();
    const firstAuthentication = new DeferredPromise();
    const calls = [];
    const first = cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      calls.push("tok1");
      await firstAuthentication.p;
    });
    const queued = cache.authenticate("https://api.example.com", ["read"], "tok2", async () => {
      calls.push("tok2");
    });
    cache.clear();
    await cache.authenticate("https://api.example.com", ["read"], "tok3", async () => {
      calls.push("tok3");
    });
    firstAuthentication.complete();
    await assert.rejects(first);
    await assert.rejects(queued);
    assert.deepStrictEqual(calls, ["tok1", "tok3"]);
  });
  test("scoped clear does not cancel unrelated in-flight authentication", async () => {
    const cache = new AgentHostAuthTokenCache();
    const unrelatedAuthentication = new DeferredPromise();
    let unrelatedCalls = 0;
    const unrelated = cache.authenticate("https://other.example.com", ["read"], "other-token", async () => {
      unrelatedCalls++;
      await unrelatedAuthentication.p;
    });
    cache.clear("https://api.example.com", ["read"]);
    unrelatedAuthentication.complete();
    assert.deepStrictEqual({
      result: await unrelated,
      unrelatedCalls,
      repeated: await cache.authenticate("https://other.example.com", ["read"], "other-token", async () => {
        unrelatedCalls++;
      })
    }, {
      result: true,
      unrelatedCalls: 1,
      repeated: false
    });
  });
  test("tokens for distinct scopes and resources are tracked independently", async () => {
    const cache = new AgentHostAuthTokenCache();
    let authenticateCalls = 0;
    const authenticate = async () => {
      authenticateCalls++;
    };
    await Promise.all([
      cache.authenticate("https://api.example.com", ["read"], "read-token", authenticate),
      cache.authenticate("https://api.example.com", ["write"], "write-token", authenticate),
      cache.authenticate("https://other.example.com", ["read"], "read-token", authenticate)
    ]);
    assert.strictEqual(authenticateCalls, 3);
  });
  test("failed authentication is not cached", async () => {
    const cache = new AgentHostAuthTokenCache();
    let authenticateCalls = 0;
    await assert.rejects(cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      authenticateCalls++;
      throw new Error("failed");
    }), /failed/);
    await cache.authenticate("https://api.example.com", ["read"], "tok1", async () => {
      authenticateCalls++;
    });
    assert.strictEqual(authenticateCalls, 2);
  });
  test("clear forgets every completed token", async () => {
    const cache = new AgentHostAuthTokenCache();
    let authenticateCalls = 0;
    const authenticate = async () => {
      authenticateCalls++;
    };
    await cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate);
    await cache.authenticate("https://other.example.com", ["read"], "tok2", authenticate);
    cache.clear();
    await cache.authenticate("https://api.example.com", ["read"], "tok1", authenticate);
    await cache.authenticate("https://other.example.com", ["read"], "tok2", authenticate);
    assert.strictEqual(authenticateCalls, 4);
  });
});
suite("AgentHostAuthenticationRecovery", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("cancels recovery when its enablement generation becomes stale", async () => {
    const sessions = new DeferredPromise();
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: () => sessions.p
    });
    const commandService = new TestCommandService();
    const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
    const recovery = new AgentHostAuthenticationRecovery();
    const authenticateCalls = [];
    let current = true;
    const recoveryPromise = instantiationService.invokeFunction((accessor) => recovery.recover(accessor, {
      resource: "https://api.example.com",
      authorization_servers: ["https://auth.example.com"],
      scopes_supported: ["read"]
    }, {
      logPrefix: "[AgentHost]",
      isCurrent: () => current,
      authenticate: async (request) => {
        authenticateCalls.push(request.token);
      }
    }));
    current = false;
    recovery.clear();
    sessions.complete([{ scopes: ["read"], accessToken: "tok-1" }]);
    await assert.rejects(recoveryPromise, /Canceled/);
    assert.deepStrictEqual({
      commandCalls: commandService.calls.length,
      authenticateCalls
    }, {
      commandCalls: 0,
      authenticateCalls: []
    });
  });
  test("force-forwards the post-sign-in token when session-change handling repopulates the cache", async () => {
    const token = { value: "tok-1" };
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => Promise.resolve(scopes ? [{ scopes, accessToken: token.value }] : [])
    });
    const commandService = new TestCommandService();
    const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
    const cache = new AgentHostAuthTokenCache();
    const recovery = new AgentHostAuthenticationRecovery();
    const resource = {
      resource: "https://api.example.com",
      authorization_servers: ["https://auth.example.com"],
      scopes_supported: ["read"]
    };
    const authenticateCalls = [];
    const options = {
      authTokenCache: cache,
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        authenticateCalls.push(request.token);
      }
    };
    await instantiationService.invokeFunction((accessor) => recovery.recover(accessor, resource, options));
    commandService.onExecute = async () => {
      token.value = "tok-2";
      await cache.authenticate(resource.resource, resource.scopes_supported, token.value, async () => {
        authenticateCalls.push(token.value);
      });
    };
    await instantiationService.invokeFunction((accessor) => recovery.recover(accessor, resource, options));
    assert.deepStrictEqual({
      commandCalls: commandService.calls.length,
      authenticateCalls
    }, {
      commandCalls: 1,
      authenticateCalls: ["tok-1", "tok-2", "tok-2"]
    });
    await instantiationService.invokeFunction((accessor) => recovery.recover(accessor, resource, options));
    assert.strictEqual(commandService.calls.length, 2);
  });
  test("forwards credential removal and resets escalation when the current token disappears", async () => {
    const token = { value: "tok-1" };
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => Promise.resolve(token.value && scopes ? [{ scopes, accessToken: token.value }] : [])
    });
    const commandService = new TestCommandService();
    const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
    const recovery = new AgentHostAuthenticationRecovery();
    const resource = {
      resource: "https://api.example.com",
      authorization_servers: ["https://auth.example.com"],
      scopes_supported: ["read"]
    };
    const authenticateCalls = [];
    const options = {
      authTokenCache: new AgentHostAuthTokenCache(),
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        authenticateCalls.push(request.token);
      }
    };
    await instantiationService.invokeFunction((accessor) => recovery.recover(accessor, resource, options));
    token.value = void 0;
    await instantiationService.invokeFunction((accessor) => recovery.recover(accessor, resource, options));
    token.value = "tok-1";
    await instantiationService.invokeFunction((accessor) => recovery.recover(accessor, resource, options));
    assert.deepStrictEqual({
      commandCalls: commandService.calls.length,
      authenticateCalls
    }, {
      commandCalls: 0,
      authenticateCalls: ["tok-1", "", "tok-1"]
    });
  });
});
suite("resolveMcpServerAuthentication", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("uses challenge scopes without replacing the protected resource scope catalog", async () => {
    const requestedScopes = [];
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        requestedScopes.push(scopes);
        return Promise.resolve([]);
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {});
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => void 0
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {});
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.example.com",
      authorization_servers: ["https://auth.example.com"],
      scopes_supported: ["repo", "read:org", "notifications"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "server-id",
      mcpServerName: "Example",
      mcpServerUrl: "https://mcp.example.com",
      scopes: ["notifications"],
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ result, requestedScopes }, {
      result: false,
      requestedScopes: [["notifications"]]
    });
  });
  test("uses supported scopes when the challenge does not specify scopes", async () => {
    const requestedScopes = [];
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        requestedScopes.push(scopes ?? []);
        return Promise.resolve([]);
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {});
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => void 0
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {});
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.slack.com",
      resource_name: "Slack API",
      authorization_servers: ["https://mcp.slack.com"],
      scopes_supported: ["search:read.public", "chat:write"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "slack",
      mcpServerName: "Slack",
      mcpServerUrl: "https://mcp.slack.com",
      scopes: [],
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ result, requestedScopes }, {
      result: false,
      requestedScopes: [["search:read.public", "chat:write"]]
    });
  });
  test("does not eagerly request GitHub MCP supported scopes", async () => {
    const requestedScopes = [];
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        requestedScopes.push(scopes ?? []);
        return Promise.resolve([]);
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {});
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => void 0
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {});
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {});
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://api.githubcopilot.com/mcp",
      resource_name: "GitHub MCP Server",
      authorization_servers: ["https://github.com/login/oauth"],
      scopes_supported: ["repo", "notifications"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "github",
      mcpServerName: "GitHub",
      mcpServerUrl: "https://api.githubcopilot.com/mcp",
      scopes: [],
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ result, requestedScopes }, {
      result: false,
      requestedScopes: [[]]
    });
  });
  test("does not create a dynamic provider silently without a persisted registration", async () => {
    const warnings = [];
    const providerCreations = [];
    const metadataRequests = [];
    const logService = new class extends NullLogService {
      warn(message) {
        warnings.push(message);
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, createMockAuthService({
      createDynamicAuthenticationProvider: async (authorizationServer) => {
        providerCreations.push(authorizationServer.toString(true));
        return void 0;
      }
    }));
    instantiationService.stub(IAuthenticationMcpAccessService, {});
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => void 0
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {});
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve(void 0)
    });
    instantiationService.stub(ILogService, logService);
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.example.com",
      authorization_servers: ["https://auth.example.com"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "server-id",
      mcpServerName: "Example",
      mcpServerUrl: "https://mcp.example.com",
      scopes: [],
      authorizationServerMetadataFetcher: async (authorizationServer) => {
        metadataRequests.push(authorizationServer);
        throw new Error("Unexpected metadata request");
      },
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ result, warnings, metadataRequests, providerCreations }, {
      result: false,
      warnings: [],
      metadataRequests: [],
      providerCreations: []
    });
  });
  test("restores a persisted dynamically registered provider without user interaction", async () => {
    const dynamicProviderId = "https://mcp.notion.com/ https://mcp.notion.com/mcp";
    const providerCreations = [];
    const sessionRequests = [];
    const authenticateRequests = [];
    const authService = createMockAuthService({
      createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId, clientSecret) => {
        providerCreations.push({ clientId, clientSecret });
        return { id: dynamicProviderId };
      },
      getSessions: (_providerId, _scopes, options) => {
        sessionRequests.push({ silent: options.silent });
        return Promise.resolve([{
          id: "notion-session",
          scopes: [],
          accessToken: "notion-token",
          account: { id: "account-id", label: "Notion Account" }
        }]);
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {
      isAccessAllowedForUrl: () => true
    });
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => "Notion Account"
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {
      addAccountUsage: () => {
      }
    });
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve({ clientId: "notion-client-id", clientSecret: "notion-client-secret" })
    });
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.notion.com/mcp",
      authorization_servers: ["https://mcp.notion.com"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "notion",
      mcpServerName: "notion",
      mcpServerUrl: "https://mcp.notion.com/mcp",
      scopes: [],
      authorizationServerMetadataFetcher: async (authorizationServer) => ({
        metadata: {
          issuer: authorizationServer,
          response_types_supported: ["code"]
        },
        discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
        errors: []
      }),
      authenticate: async (request) => {
        authenticateRequests.push(request);
      }
    });
    assert.deepStrictEqual({ result, providerCreations, sessionRequests, authenticateRequests }, {
      result: true,
      providerCreations: [{ clientId: "notion-client-id", clientSecret: "notion-client-secret" }],
      sessionRequests: [{ silent: true }],
      authenticateRequests: [{
        resource: "https://mcp.notion.com/mcp",
        scopes: [],
        token: "notion-token"
      }]
    });
  });
  test("serializes authentication transactions for different configured clients", async () => {
    const dynamicProviderId = "https://mcp.example.com/ https://mcp.example.com/resource";
    const firstSessionStarted = new DeferredPromise();
    const firstSessionGate = new DeferredPromise();
    const providerCreations = [];
    const sessionRequests = [];
    const authenticateRequests = [];
    let activeClient;
    let providerActive = false;
    const authService = createMockAuthService({
      isDynamicAuthenticationProvider: (providerId) => providerId === dynamicProviderId && providerActive,
      createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId) => {
        activeClient = clientId;
        providerActive = true;
        providerCreations.push(clientId ?? "");
        return { id: dynamicProviderId };
      },
      unregisterAuthenticationProvider: () => {
        providerActive = false;
      },
      getSessions: async () => {
        const clientId = activeClient ?? "";
        sessionRequests.push(clientId);
        if (clientId === "first-client") {
          firstSessionStarted.complete();
          await firstSessionGate.p;
        }
        return [{
          id: `${clientId}-session`,
          scopes: [],
          accessToken: `${clientId}-token`,
          account: { id: "account-id", label: "MCP Account" }
        }];
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {
      isAccessAllowedForUrl: () => true
    });
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => "MCP Account"
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {
      addAccountUsage: () => {
      }
    });
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve(activeClient ? { clientId: activeClient } : void 0),
      removeDynamicProvider: async () => {
        activeClient = void 0;
      }
    });
    instantiationService.stub(ILogService, new NullLogService());
    const protectedResource = {
      resource: "https://mcp.example.com/resource",
      authorization_servers: ["https://mcp.example.com"]
    };
    const options = (clientId) => ({
      allowInteraction: true,
      logPrefix: "[AgentHost]",
      mcpServerId: "example",
      mcpServerName: "Example",
      mcpServerUrl: "https://mcp.example.com/resource",
      oauthClient: { clientId },
      scopes: [],
      authorizationServerMetadataFetcher: async (authorizationServer) => ({
        metadata: {
          issuer: authorizationServer,
          response_types_supported: ["code"]
        },
        discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
        errors: []
      }),
      authenticate: async (request) => {
        authenticateRequests.push(request.token);
      }
    });
    const first = instantiationService.invokeFunction(resolveMcpServerAuthentication, protectedResource, options("first-client"));
    const second = instantiationService.invokeFunction(resolveMcpServerAuthentication, protectedResource, options("second-client"));
    await firstSessionStarted.p;
    const beforeResolution = {
      providerCreations: [...providerCreations],
      sessionRequests: [...sessionRequests]
    };
    firstSessionGate.complete();
    const results = await Promise.all([first, second]);
    assert.deepStrictEqual({
      beforeResolution,
      results,
      providerCreations,
      sessionRequests,
      authenticateRequests
    }, {
      beforeResolution: {
        providerCreations: ["first-client"],
        sessionRequests: ["first-client"]
      },
      results: [true, true],
      providerCreations: ["first-client", "second-client"],
      sessionRequests: ["first-client", "second-client"],
      authenticateRequests: ["first-client-token", "second-client-token"]
    });
  });
  test("restores a persisted configured provider without user interaction", async () => {
    const dynamicProviderId = "https://mcp.slack.com/ https://mcp.slack.com";
    const providerCreations = [];
    const authenticateRequests = [];
    let isProviderActive = false;
    const authService = createMockAuthService({
      isDynamicAuthenticationProvider: (providerId) => providerId === dynamicProviderId && isProviderActive,
      createDynamicAuthenticationProvider: async (_authorizationServer, _metadata, _resource, clientId) => {
        providerCreations.push(clientId ?? "");
        isProviderActive = true;
        return { id: dynamicProviderId };
      },
      getSessions: () => Promise.resolve([{
        id: "slack-session",
        scopes: ["search:read.public"],
        accessToken: "slack-token",
        account: { id: "account-id", label: "Slack Account" }
      }])
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {
      isAccessAllowedForUrl: () => true
    });
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => "Slack Account"
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {
      addAccountUsage: () => {
      }
    });
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve({ clientId: "slack-client-id" })
    });
    instantiationService.stub(ILogService, new NullLogService());
    const result = await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: "https://mcp.slack.com",
      authorization_servers: ["https://mcp.slack.com"],
      scopes_supported: ["search:read.public"]
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: "slack",
      mcpServerName: "Slack",
      mcpServerUrl: "https://mcp.slack.com",
      oauthClient: { clientId: "slack-client-id" },
      scopes: [],
      authorizationServerMetadataFetcher: async (authorizationServer) => ({
        metadata: {
          issuer: authorizationServer,
          response_types_supported: ["code"]
        },
        discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
        errors: []
      }),
      authenticate: async (request) => {
        authenticateRequests.push(request);
      }
    });
    assert.deepStrictEqual({ result, providerCreations, authenticateRequests }, {
      result: true,
      providerCreations: ["slack-client-id"],
      authenticateRequests: [{
        resource: "https://mcp.slack.com",
        scopes: ["search:read.public"],
        token: "slack-token"
      }]
    });
  });
  test("uses configured public and confidential clients when creating a dynamic provider", async () => {
    const dynamicProviderId = "https://mcp.slack.com/ https://mcp.slack.com";
    const providerCreations = [];
    const sessionRequests = [];
    const sessionCreations = [];
    const authenticateRequests = [];
    const removedProviders = [];
    let registeredClient;
    let getSessionsCall = 0;
    const provider = {
      id: dynamicProviderId,
      label: "Slack",
      supportsMultipleAccounts: false,
      onDidChangeSessions: Event.None,
      getSessions: () => Promise.reject(new Error("Unexpected provider getSessions call")),
      createSession: () => Promise.reject(new Error("Unexpected provider createSession call")),
      removeSession: () => Promise.reject(new Error("Unexpected provider removeSession call"))
    };
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.reject(new Error("Configured clients must not use a built-in provider")),
      getSessions: (_providerId, _scopes, options) => {
        sessionRequests.push({ clientId: options.clientId, clientSecret: options.clientSecret });
        getSessionsCall++;
        return Promise.resolve(getSessionsCall === 1 ? [{
          scopes: ["search:read.public"],
          accessToken: "public-token",
          account: { id: "account-id", label: "Slack Account" }
        }] : []);
      },
      createSession: (_providerId, _scopes, options) => {
        sessionCreations.push({ clientId: options.clientId, clientSecret: options.clientSecret });
        return Promise.resolve({
          id: "confidential-session",
          accessToken: "confidential-token",
          account: { id: "account-id", label: "Slack Account" },
          scopes: ["search:read.public"]
        });
      },
      createDynamicAuthenticationProvider: async (authorizationServer, _metadata, resource, clientId, clientSecret) => {
        providerCreations.push({
          authorizationServer: authorizationServer.toString(true),
          resource: resource?.resource,
          clientId,
          clientSecret
        });
        registeredClient = { clientId, clientSecret };
        return { id: dynamicProviderId };
      },
      getProvider: () => provider,
      isDynamicAuthenticationProvider: (providerId) => providerId === dynamicProviderId && registeredClient !== void 0,
      unregisterAuthenticationProvider: (providerId) => {
        removedProviders.push(providerId);
        registeredClient = void 0;
      }
    });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAuthenticationService, authService);
    instantiationService.stub(IAuthenticationMcpAccessService, {
      isAccessAllowedForUrl: () => true,
      updateAllowedMcpServers: () => {
      }
    });
    instantiationService.stub(IAuthenticationMcpService, {
      getAccountPreference: () => "Slack Account",
      updateAccountPreference: () => {
      }
    });
    instantiationService.stub(IAuthenticationMcpUsageService, {
      addAccountUsage: () => {
      }
    });
    instantiationService.stub(IDynamicAuthenticationProviderStorageService, {
      getClientRegistration: () => Promise.resolve(registeredClient),
      removeDynamicProvider: async (providerId) => {
        removedProviders.push(providerId);
      }
    });
    instantiationService.stub(ILogService, new NullLogService());
    const results = [];
    for (const oauthClient of [
      { clientId: "public-client-id" },
      { clientId: "confidential-client-id", clientSecret: "confidential-client-secret" }
    ]) {
      results.push(await instantiationService.invokeFunction(resolveMcpServerAuthentication, {
        resource: "https://mcp.slack.com",
        authorization_servers: ["https://mcp.slack.com"],
        scopes_supported: ["search:read.public"]
      }, {
        allowInteraction: true,
        logPrefix: "[AgentHost]",
        mcpServerId: "slack",
        mcpServerName: "Slack",
        mcpServerUrl: "https://mcp.slack.com",
        oauthClient,
        scopes: ["search:read.public"],
        authorizationServerMetadataFetcher: async (authorizationServer) => ({
          metadata: {
            issuer: authorizationServer,
            response_types_supported: ["code"]
          },
          discoveryUrl: `${authorizationServer}/.well-known/oauth-authorization-server`,
          errors: []
        }),
        authenticate: async (request) => {
          authenticateRequests.push(request);
        }
      }));
    }
    assert.deepStrictEqual({
      results,
      providerCreations,
      sessionRequests,
      sessionCreations,
      authenticateRequests,
      removedProviders
    }, {
      results: [true, true],
      providerCreations: [
        {
          authorizationServer: "https://mcp.slack.com/",
          resource: "https://mcp.slack.com",
          clientId: "public-client-id",
          clientSecret: void 0
        },
        {
          authorizationServer: "https://mcp.slack.com/",
          resource: "https://mcp.slack.com",
          clientId: "confidential-client-id",
          clientSecret: "confidential-client-secret"
        }
      ],
      sessionRequests: [
        { clientId: "public-client-id", clientSecret: void 0 },
        { clientId: "confidential-client-id", clientSecret: "confidential-client-secret" }
      ],
      sessionCreations: [
        { clientId: "confidential-client-id", clientSecret: "confidential-client-secret" }
      ],
      authenticateRequests: [
        {
          resource: "https://mcp.slack.com",
          scopes: ["search:read.public"],
          token: "public-token"
        },
        {
          resource: "https://mcp.slack.com",
          scopes: ["search:read.public"],
          token: "confidential-token"
        }
      ],
      removedProviders: [dynamicProviderId, dynamicProviderId]
    });
  });
});
suite("modelRequiresAgentAuthentication", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const requiredResource = { resource: "https://api.github.com", required: true };
  const byokModel = {
    id: "gemini/gemini-2.5-pro",
    _meta: createAgentModelByokMeta("gemini/Gemini/gemini-2.5-pro")
  };
  const copilotModel = { id: "gpt-5" };
  const agent = {
    models: [byokModel, copilotModel],
    protectedResources: [requiredResource]
  };
  test("bypasses required agent auth only for an advertised BYOK model", () => {
    const optionalResourceAgent = { ...agent, protectedResources: [{ ...requiredResource, required: false }] };
    const optionalResourceAgentWithoutByok = { ...optionalResourceAgent, models: [copilotModel] };
    assert.deepStrictEqual({
      byokEnabled: modelRequiresAgentAuthentication(agent, { id: byokModel.id }, true),
      byokDisabled: modelRequiresAgentAuthentication(agent, { id: byokModel.id }, false),
      copilot: modelRequiresAgentAuthentication(agent, { id: copilotModel.id }, true),
      unknown: modelRequiresAgentAuthentication(agent, { id: "unknown" }, true),
      noSelection: modelRequiresAgentAuthentication(agent, void 0, true),
      optionalResourceByok: modelRequiresAgentAuthentication(optionalResourceAgent, { id: byokModel.id }, true),
      optionalResourceCopilot: modelRequiresAgentAuthentication(optionalResourceAgent, { id: copilotModel.id }, true),
      optionalResourceUnknown: modelRequiresAgentAuthentication(optionalResourceAgent, { id: "unknown" }, true),
      optionalResourceSignedOutDisabled: modelRequiresAgentAuthentication(optionalResourceAgent, { id: copilotModel.id }, false),
      optionalResourceWithoutByok: modelRequiresAgentAuthentication(optionalResourceAgentWithoutByok, { id: copilotModel.id }, true),
      noProtectedResource: modelRequiresAgentAuthentication({ ...agent, protectedResources: [] }, { id: copilotModel.id }, true)
    }, {
      byokEnabled: false,
      byokDisabled: true,
      copilot: true,
      unknown: true,
      noSelection: true,
      optionalResourceByok: false,
      optionalResourceCopilot: true,
      optionalResourceUnknown: true,
      optionalResourceSignedOutDisabled: false,
      optionalResourceWithoutByok: false,
      noProtectedResource: false
    });
  });
});
suite("authenticateProtectedResources", () => {
  const protectedResource = {
    resource: "https://api.example.com",
    authorization_servers: ["https://auth.example.com"],
    scopes_supported: ["read"]
  };
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("skips authenticate when the cached token is unchanged", async () => {
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes) {
          return Promise.resolve([{ scopes: ["read"], accessToken: "cached-token" }]);
        }
        return Promise.resolve([]);
      }
    });
    const cache = new AgentHostAuthTokenCache();
    const requests = [];
    const agents = [{ protectedResources: [protectedResource] }];
    const instantiationService = createAuthInstantiationService(disposables, authService);
    await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
      authTokenCache: cache,
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        requests.push(request);
      }
    });
    await instantiationService.invokeFunction(authenticateProtectedResources, agents, {
      authTokenCache: cache,
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        requests.push(request);
      }
    });
    assert.deepStrictEqual(requests, [{ resource: protectedResource.resource, scopes: ["read"], token: "cached-token" }]);
  });
  test("forwards credential removal when a previously available token disappears", async () => {
    let token = "cached-token";
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes && token) {
          return Promise.resolve([{ scopes: ["read"], accessToken: token }]);
        }
        return Promise.resolve([]);
      }
    });
    const cache = new AgentHostAuthTokenCache();
    const requests = [];
    const agents = [{ protectedResources: [protectedResource] }];
    const instantiationService = createAuthInstantiationService(disposables, authService);
    const options = {
      authTokenCache: cache,
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        requests.push(request);
      }
    };
    await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
    token = void 0;
    await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
    await instantiationService.invokeFunction(authenticateProtectedResources, agents, options);
    assert.deepStrictEqual(requests, [
      { resource: protectedResource.resource, scopes: ["read"], token: "cached-token" },
      { resource: protectedResource.resource, scopes: ["read"], token: "" }
    ]);
  });
});
suite("resolveAuthenticationInteractively", () => {
  const protectedResource = {
    resource: "https://api.example.com",
    authorization_servers: ["https://auth.example.com"],
    scopes_supported: ["read"]
  };
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("uses an existing token before prompting and dedupes repeated checks", async () => {
    let createSessionCalls = 0;
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: (_providerId, scopes) => {
        if (scopes) {
          return Promise.resolve([{ scopes: ["read"], accessToken: "existing-token" }]);
        }
        return Promise.resolve([]);
      },
      createSession: async () => {
        createSessionCalls++;
        return { accessToken: "new-token" };
      }
    });
    const requests = [];
    const cache = new AgentHostAuthTokenCache();
    const instantiationService = createAuthInstantiationService(disposables, authService);
    const options = {
      authTokenCache: cache,
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        requests.push(request);
      }
    };
    const results = [
      await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], options),
      await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], options)
    ];
    assert.deepStrictEqual({ results, requests, createSessionCalls }, {
      results: [true, true],
      requests: [{ resource: protectedResource.resource, scopes: ["read"], token: "existing-token" }],
      createSessionCalls: 0
    });
  });
  test("uses the product sign-in flow and forwards its token", async () => {
    let signedIn = false;
    const commandService = new TestCommandService();
    commandService.onExecute = () => {
      signedIn = true;
    };
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: () => Promise.resolve(signedIn ? [{ scopes: ["read"], accessToken: "signed-in-token" }] : [])
    });
    const requests = [];
    const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
    const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
      authTokenCache: new AgentHostAuthTokenCache(),
      logPrefix: "[AgentHost]",
      authenticate: async (request) => {
        requests.push(request);
      }
    });
    assert.deepStrictEqual({ success, commandCalls: commandService.calls, requests }, {
      success: true,
      commandCalls: [{
        commandId: CHAT_SETUP_ACTION_ID,
        args: [void 0, {
          forceSignInDialog: true,
          additionalScopes: ["read"],
          dialogTitle: "Sign in to use GitHub Copilot",
          disableChatViewReveal: true,
          returnResult: true
        }]
      }],
      requests: [{ resource: protectedResource.resource, scopes: ["read"], token: "signed-in-token" }]
    });
  });
  test("does not fall back to direct provider login when product sign-in is canceled", async () => {
    const commandService = new TestCommandService();
    commandService.result = { success: void 0, dialogSkipped: false };
    let createSessionCalls = 0;
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: () => Promise.resolve([]),
      createSession: async () => {
        createSessionCalls++;
        return { accessToken: "unexpected-token" };
      }
    });
    const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
    const success = await instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
      logPrefix: "[AgentHost]",
      authenticate: async () => {
      }
    });
    assert.deepStrictEqual({ success, createSessionCalls }, { success: false, createSessionCalls: 0 });
  });
  test("propagates product sign-in failures", async () => {
    const commandService = new TestCommandService();
    commandService.result = { success: false, dialogSkipped: false, error: new Error("Bad credentials") };
    const authService = createMockAuthService({
      getOrActivateProviderIdForServer: () => Promise.resolve("provider-1"),
      getSessions: () => Promise.resolve([])
    });
    const instantiationService = createAuthInstantiationService(disposables, authService, commandService);
    await assert.rejects(instantiationService.invokeFunction(resolveAuthenticationInteractively, [protectedResource], {
      logPrefix: "[AgentHost]",
      authenticate: async () => {
      }
    }), /Bad credentials/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdEF1dGgudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB0eXBlIFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyB0eXBlIEFnZW50SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgdHlwZSBJQXV0aGVudGljYXRpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9keW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9TRVRVUF9BQ1RJT05fSUQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QXV0aGVudGljYXRpb25SZWNvdmVyeSwgYXV0aGVudGljYXRlUHJvdGVjdGVkUmVzb3VyY2VzLCByZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5LCByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZSwgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUsIGFnZW50SG9zdE1jcFNlcnZlcklkLCByZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIG1vZGVsUmVxdWlyZXNBZ2VudEF1dGhlbnRpY2F0aW9uLCB0eXBlIElBZ2VudEhvc3RBdXRoZW50aWNhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEF1dGguanMnO1xuaW1wb3J0IHsgY3JlYXRlQWdlbnRNb2RlbEJ5b2tNZXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudE1vZGVsQnlva01ldGEuanMnO1xuXG5jbGFzcyBUZXN0Q29tbWFuZFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElDb21tYW5kU2VydmljZT4oKSB7XG5cdHJlYWRvbmx5IGNhbGxzOiB7IGNvbW1hbmRJZDogc3RyaW5nOyBhcmdzOiB1bmtub3duW10gfVtdID0gW107XG5cdHJlc3VsdDogdW5rbm93biA9IHsgc3VjY2VzczogdHJ1ZSwgZGlhbG9nU2tpcHBlZDogZmFsc2UgfTtcblx0b25FeGVjdXRlOiAoKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIGFzeW5jIGV4ZWN1dGVDb21tYW5kPFIgPSB1bmtub3duPihjb21tYW5kSWQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxSIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKHsgY29tbWFuZElkLCBhcmdzIH0pO1xuXHRcdGF3YWl0IHRoaXMub25FeGVjdXRlPy4oKTtcblx0XHRyZXR1cm4gdGhpcy5yZXN1bHQgYXMgUjtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVBdXRoSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sIGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgY29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCkpOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIGF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uob3ZlcnJpZGVzOiB7XG5cdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyPzogKHNlcnZlclVyaTogVVJJLCByZXNvdXJjZVVyaTogVVJJKSA9PiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdGdldFNlc3Npb25zPzogKHByb3ZpZGVySWQ6IHN0cmluZywgc2NvcGVzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgb3B0aW9uczogYW55LCBhY3RpdmF0ZTogYm9vbGVhbikgPT4gUHJvbWlzZTxyZWFkb25seSB7IHNjb3Blczogc3RyaW5nW107IGFjY2Vzc1Rva2VuOiBzdHJpbmcgfVtdPjtcblx0Y3JlYXRlU2Vzc2lvbj86IChwcm92aWRlcklkOiBzdHJpbmcsIHNjb3Blczogc3RyaW5nW10sIG9wdGlvbnM6IGFueSkgPT4gUHJvbWlzZTx7IGFjY2Vzc1Rva2VuOiBzdHJpbmcgfT47XG5cdGNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyPzogKC4uLmFyZ3M6IFBhcmFtZXRlcnM8SUF1dGhlbnRpY2F0aW9uU2VydmljZVsnY3JlYXRlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXInXT4pID0+IFByb21pc2U8eyByZWFkb25seSBpZDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXHRnZXRQcm92aWRlcj86IElBdXRoZW50aWNhdGlvblNlcnZpY2VbJ2dldFByb3ZpZGVyJ107XG5cdGlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXI/OiAocHJvdmlkZXJJZDogc3RyaW5nKSA9PiBib29sZWFuO1xuXHR1bnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcj86IChwcm92aWRlcklkOiBzdHJpbmcpID0+IHZvaWQ7XG59KTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6IG92ZXJyaWRlcy5nZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlciA/PyAoKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCkpLFxuXHRcdGdldFNlc3Npb25zOiBvdmVycmlkZXMuZ2V0U2Vzc2lvbnMgPz8gKCgpID0+IFByb21pc2UucmVzb2x2ZShbXSkpLFxuXHRcdGNyZWF0ZVNlc3Npb246IG92ZXJyaWRlcy5jcmVhdGVTZXNzaW9uID8/ICgoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgY3JlYXRlU2Vzc2lvbiBjYWxsJykpKSxcblx0XHRjcmVhdGVEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcjogb3ZlcnJpZGVzLmNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyID8/ICgoKSA9PiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSksXG5cdFx0Z2V0UHJvdmlkZXI6IG92ZXJyaWRlcy5nZXRQcm92aWRlciA/PyAoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZ2V0UHJvdmlkZXIgY2FsbCcpOyB9KSxcblx0XHRpc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBvdmVycmlkZXMuaXNEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlciA/PyAoKCkgPT4gZmFsc2UpLFxuXHRcdHVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBvdmVycmlkZXMudW5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgPz8gKCgpID0+IHsgfSksXG5cdH0gYXMgdW5rbm93biBhcyBJQXV0aGVudGljYXRpb25TZXJ2aWNlO1xufVxuXG5zdWl0ZSgnYWdlbnRIb3N0TWNwU2VydmVySWQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaXMgc3RhYmxlIGZvciB0aGUgc2FtZSBhdXRob3JpdHksIHNlcnZlciBuYW1lIGFuZCByZXNvdXJjZSB1cmwnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGtleSBtdXN0IG5vdCBkZXBlbmQgb24gdGhlIChwZXItc2Vzc2lvbiAvIHBlci1zeW5jKSBjdXN0b21pemF0aW9uIGlkLCBzbyByZW1lbWJlcmVkXG5cdFx0Ly8gYXV0aCBzdXJ2aXZlcyByZWxvYWRzLiBTYW1lIGlucHV0cyBtdXN0IGFsd2F5cyBwcm9kdWNlIHRoZSBzYW1lIGtleS5cblx0XHRjb25zdCBhID0gYWdlbnRIb3N0TWNwU2VydmVySWQoJ3JlbW90ZS1ob3N0JywgJ0dpdEh1YicsICdodHRwczovL2FwaS5naXRodWJjb3BpbG90LmNvbS9tY3AvJyk7XG5cdFx0Y29uc3QgYiA9IGFnZW50SG9zdE1jcFNlcnZlcklkKCdyZW1vdGUtaG9zdCcsICdHaXRIdWInLCAnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20vbWNwLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLCBiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYSwgJ2FnZW50LWhvc3QtbWNwOnJlbW90ZS1ob3N0L0dpdEh1Yi9odHRwcyUzQSUyRiUyRmFwaS5naXRodWJjb3BpbG90LmNvbSUyRm1jcCUyRicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJzIHdoZW4gYXV0aG9yaXR5LCBuYW1lIG9yIHVybCBkaWZmZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmFzZSA9IGFnZW50SG9zdE1jcFNlcnZlcklkKCdob3N0LTEnLCAnR2l0SHViJywgJ2h0dHBzOi8vYS5leGFtcGxlL21jcCcpO1xuXHRcdGNvbnN0IGtleXMgPSBuZXcgU2V0KFtcblx0XHRcdGJhc2UsXG5cdFx0XHRhZ2VudEhvc3RNY3BTZXJ2ZXJJZCgnaG9zdC0yJywgJ0dpdEh1YicsICdodHRwczovL2EuZXhhbXBsZS9tY3AnKSxcblx0XHRcdGFnZW50SG9zdE1jcFNlcnZlcklkKCdob3N0LTEnLCAnT3RoZXInLCAnaHR0cHM6Ly9hLmV4YW1wbGUvbWNwJyksXG5cdFx0XHRhZ2VudEhvc3RNY3BTZXJ2ZXJJZCgnaG9zdC0xJywgJ0dpdEh1YicsICdodHRwczovL2IuZXhhbXBsZS9tY3AnKSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoa2V5cy5zaXplLCA0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Jlc29sdmVUb2tlbkZvclJlc291cmNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIGF1dGhvcml6YXRpb24gc2VydmVycyBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7fSk7XG5cdFx0Y29uc3QgdG9rZW4gPSBhd2FpdCByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZShyZXNvdXJjZSwgW10sIFsncmVhZCddLCBhdXRoU2VydmljZSwgbG9nLCAndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2tlbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBwcm92aWRlciBtYXRjaGVzIHRoZSBzZXJ2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRva2VuID0gYXdhaXQgcmVzb2x2ZVRva2VuRm9yUmVzb3VyY2UocmVzb3VyY2UsIFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sIFsncmVhZCddLCBhdXRoU2VydmljZSwgbG9nLCAndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2tlbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB0b2tlbiBmcm9tIGV4YWN0IHNjb3BlIG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIHNjb3BlcykgPT4ge1xuXHRcdFx0XHRpZiAoc2NvcGVzICYmIHNjb3Blcy5sZW5ndGggPT09IDEgJiYgc2NvcGVzWzBdID09PSAncmVhZCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFt7IHNjb3BlczogWydyZWFkJ10sIGFjY2Vzc1Rva2VuOiAnZXhhY3QtdG9rZW4nIH1dKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9rZW4gPSBhd2FpdCByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZShyZXNvdXJjZSwgWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSwgWydyZWFkJ10sIGF1dGhTZXJ2aWNlLCBsb2csICd0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRva2VuLCAnZXhhY3QtdG9rZW4nKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBuYXJyb3dlc3Qgc3VwZXJzZXQgc2Vzc2lvbiB3aGVuIGV4YWN0IG1hdGNoIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIHNjb3BlcykgPT4ge1xuXHRcdFx0XHRpZiAoc2NvcGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBFeGFjdCBtYXRjaCByZXR1cm5zIGVtcHR5XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWxsIHNlc3Npb25zIFx1MjAxNCByZXR1cm4gdHdvIHN1cGVyc2V0IG9wdGlvbnNcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXG5cdFx0XHRcdFx0eyBzY29wZXM6IFsncmVhZCcsICd3cml0ZScsICdhZG1pbiddLCBhY2Nlc3NUb2tlbjogJ3dpZGUtdG9rZW4nIH0sXG5cdFx0XHRcdFx0eyBzY29wZXM6IFsncmVhZCcsICd3cml0ZSddLCBhY2Nlc3NUb2tlbjogJ25hcnJvdy10b2tlbicgfSxcblx0XHRcdFx0XSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRva2VuID0gYXdhaXQgcmVzb2x2ZVRva2VuRm9yUmVzb3VyY2UocmVzb3VyY2UsIFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sIFsncmVhZCddLCBhdXRoU2VydmljZSwgbG9nLCAndGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2tlbiwgJ25hcnJvdy10b2tlbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIHNlc3Npb24gaGFzIG1hdGNoaW5nIHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdwcm92aWRlci0xJyksXG5cdFx0XHRnZXRTZXNzaW9uczogKF9wcm92aWRlcklkLCBzY29wZXMpID0+IHtcblx0XHRcdFx0aWYgKHNjb3BlcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gTm8gc2Vzc2lvbiBjb250YWlucyB0aGUgJ3JlYWQnIHNjb3BlXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW1xuXHRcdFx0XHRcdHsgc2NvcGVzOiBbJ3dyaXRlJ10sIGFjY2Vzc1Rva2VuOiAnd3JvbmctdG9rZW4nIH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCB0b2tlbiA9IGF3YWl0IHJlc29sdmVUb2tlbkZvclJlc291cmNlKHJlc291cmNlLCBbJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSddLCBbJ3JlYWQnXSwgYXV0aFNlcnZpY2UsIGxvZywgJ3Rlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9rZW4sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaWVzIG11bHRpcGxlIGF1dGhvcml6YXRpb24gc2VydmVycyBpbiBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKHNlcnZlclVyaSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKHNlcnZlclVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKHNlcnZlclVyaS50b1N0cmluZygpID09PSAnaHR0cHM6Ly9hdXRoMi5leGFtcGxlLmNvbS8nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFt7IHNjb3BlczogWydyZWFkJ10sIGFjY2Vzc1Rva2VuOiAnc2VydmVyMi10b2tlbicgfV0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRva2VuID0gYXdhaXQgcmVzb2x2ZVRva2VuRm9yUmVzb3VyY2UoXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdFsnaHR0cHM6Ly9hdXRoMS5leGFtcGxlLmNvbScsICdodHRwczovL2F1dGgyLmV4YW1wbGUuY29tJ10sXG5cdFx0XHRbJ3JlYWQnXSwgYXV0aFNlcnZpY2UsIGxvZywgJ3Rlc3QnLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRva2VuLCAnc2VydmVyMi10b2tlbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscy5sZW5ndGgsIDIpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZm9yd2FyZHMgdGhlIGZpcnN0IHRva2VuIGFuZCBza2lwcyBpdCBhZnRlciBjb21wbGV0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0bGV0IGF1dGhlbnRpY2F0ZUNhbGxzID0gMDtcblx0XHRjb25zdCBhdXRoZW50aWNhdGUgPSBhc3luYyAoKSA9PiB7IGF1dGhlbnRpY2F0ZUNhbGxzKys7IH07XG5cblx0XHRjb25zdCByZXN1bHRzID0gW1xuXHRcdFx0YXdhaXQgY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMScsIGF1dGhlbnRpY2F0ZSksXG5cdFx0XHRhd2FpdCBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2sxJywgYXV0aGVudGljYXRlKSxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdHMsIGF1dGhlbnRpY2F0ZUNhbGxzIH0sIHsgcmVzdWx0czogW3RydWUsIGZhbHNlXSwgYXV0aGVudGljYXRlQ2FsbHM6IDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhbWUtdG9rZW4gY2FsbGVycyBhd2FpdCB0aGUgaW4tZmxpZ2h0IGF1dGhlbnRpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IGF1dGhlbnRpY2F0ZUNhbGxzID0gMDtcblx0XHRjb25zdCBhdXRoZW50aWNhdGUgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRhdXRoZW50aWNhdGVDYWxscysrO1xuXHRcdFx0YXdhaXQgYXV0aGVudGljYXRpb24ucDtcblx0XHR9O1xuXHRcdGxldCBzZWNvbmRTZXR0bGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBmaXJzdCA9IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhdXRoZW50aWNhdGUpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhdXRoZW50aWNhdGUpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdHNlY29uZFNldHRsZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBiZWZvcmVDb21wbGV0aW9uID0geyBhdXRoZW50aWNhdGVDYWxscywgc2Vjb25kU2V0dGxlZCB9O1xuXHRcdGF1dGhlbnRpY2F0aW9uLmNvbXBsZXRlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZUNvbXBsZXRpb24sXG5cdFx0XHRyZXN1bHRzOiBhd2FpdCBQcm9taXNlLmFsbChbZmlyc3QsIHNlY29uZF0pLFxuXHRcdFx0YXV0aGVudGljYXRlQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlQ29tcGxldGlvbjogeyBhdXRoZW50aWNhdGVDYWxsczogMSwgc2Vjb25kU2V0dGxlZDogZmFsc2UgfSxcblx0XHRcdHJlc3VsdHM6IFt0cnVlLCBmYWxzZV0sXG5cdFx0XHRhdXRoZW50aWNhdGVDYWxsczogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IHRva2VucyBhcmUgc2VyaWFsaXplZCBmb3IgdGhlIHNhbWUgcmVzb3VyY2UgYW5kIHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpO1xuXHRcdGNvbnN0IGZpcnN0QXV0aGVudGljYXRpb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBmaXJzdCA9IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjYWxscy5wdXNoKCd0b2sxJyk7XG5cdFx0XHRhd2FpdCBmaXJzdEF1dGhlbnRpY2F0aW9uLnA7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNhbGxzLnB1c2goJ3RvazInKTtcblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBiZWZvcmVDb21wbGV0aW9uID0gWy4uLmNhbGxzXTtcblx0XHRmaXJzdEF1dGhlbnRpY2F0aW9uLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0LCBzZWNvbmRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBiZWZvcmVDb21wbGV0aW9uLCBjYWxscyB9LCB7IGJlZm9yZUNvbXBsZXRpb246IFsndG9rMSddLCBjYWxsczogWyd0b2sxJywgJ3RvazInXSB9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBjb21wbGV0ZWQgdG9rZW4gd2FpdHMgZm9yIGEgbmV3ZXIgaW4tZmxpZ2h0IGF1dGhlbnRpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0Y29uc3QgbmV3ZXJBdXRoZW50aWNhdGlvbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRhd2FpdCBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2sxJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2FsbHMucHVzaCgndG9rMScpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IG5ld2VyID0gY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNhbGxzLnB1c2goJ3RvazInKTtcblx0XHRcdGF3YWl0IG5ld2VyQXV0aGVudGljYXRpb24ucDtcblx0XHR9KTtcblx0XHRsZXQgb2xkZXJTZXR0bGVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgb2xkZXIgPSBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2sxJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2FsbHMucHVzaCgndG9rMScpO1xuXHRcdH0pLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdG9sZGVyU2V0dGxlZCA9IHRydWU7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGNvbnN0IGJlZm9yZUNvbXBsZXRpb24gPSB7IGNhbGxzOiBbLi4uY2FsbHNdLCBvbGRlclNldHRsZWQgfTtcblx0XHRuZXdlckF1dGhlbnRpY2F0aW9uLmNvbXBsZXRlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZUNvbXBsZXRpb24sXG5cdFx0XHRyZXN1bHRzOiBhd2FpdCBQcm9taXNlLmFsbChbbmV3ZXIsIG9sZGVyXSksXG5cdFx0XHRjYWxscyxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVDb21wbGV0aW9uOiB7IGNhbGxzOiBbJ3RvazEnLCAndG9rMiddLCBvbGRlclNldHRsZWQ6IGZhbHNlIH0sXG5cdFx0XHRyZXN1bHRzOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0XHRjYWxsczogWyd0b2sxJywgJ3RvazInLCAndG9rMSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhciBjYW5jZWxzIHF1ZXVlZCBhdXRoZW50aWNhdGlvbiBmcm9tIHRoZSBwcmV2aW91cyBnZW5lcmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0Y29uc3QgZmlyc3RBdXRoZW50aWNhdGlvbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBmaXJzdCA9IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjYWxscy5wdXNoKCd0b2sxJyk7XG5cdFx0XHRhd2FpdCBmaXJzdEF1dGhlbnRpY2F0aW9uLnA7XG5cdFx0fSk7XG5cdFx0Y29uc3QgcXVldWVkID0gY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNhbGxzLnB1c2goJ3RvazInKTtcblx0XHR9KTtcblx0XHRjYWNoZS5jbGVhcigpO1xuXHRcdGF3YWl0IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjYWxscy5wdXNoKCd0b2szJyk7XG5cdFx0fSk7XG5cdFx0Zmlyc3RBdXRoZW50aWNhdGlvbi5jb21wbGV0ZSgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoZmlyc3QpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHF1ZXVlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWyd0b2sxJywgJ3RvazMnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3BlZCBjbGVhciBkb2VzIG5vdCBjYW5jZWwgdW5yZWxhdGVkIGluLWZsaWdodCBhdXRoZW50aWNhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpO1xuXHRcdGNvbnN0IHVucmVsYXRlZEF1dGhlbnRpY2F0aW9uID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGxldCB1bnJlbGF0ZWRDYWxscyA9IDA7XG5cdFx0Y29uc3QgdW5yZWxhdGVkID0gY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL290aGVyLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICdvdGhlci10b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHVucmVsYXRlZENhbGxzKys7XG5cdFx0XHRhd2FpdCB1bnJlbGF0ZWRBdXRoZW50aWNhdGlvbi5wO1xuXHRcdH0pO1xuXHRcdGNhY2hlLmNsZWFyKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddKTtcblx0XHR1bnJlbGF0ZWRBdXRoZW50aWNhdGlvbi5jb21wbGV0ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IGF3YWl0IHVucmVsYXRlZCxcblx0XHRcdHVucmVsYXRlZENhbGxzLFxuXHRcdFx0cmVwZWF0ZWQ6IGF3YWl0IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9vdGhlci5leGFtcGxlLmNvbScsIFsncmVhZCddLCAnb3RoZXItdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHVucmVsYXRlZENhbGxzKys7XG5cdFx0XHR9KSxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHRydWUsXG5cdFx0XHR1bnJlbGF0ZWRDYWxsczogMSxcblx0XHRcdHJlcGVhdGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndG9rZW5zIGZvciBkaXN0aW5jdCBzY29wZXMgYW5kIHJlc291cmNlcyBhcmUgdHJhY2tlZCBpbmRlcGVuZGVudGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cdFx0bGV0IGF1dGhlbnRpY2F0ZUNhbGxzID0gMDtcblx0XHRjb25zdCBhdXRoZW50aWNhdGUgPSBhc3luYyAoKSA9PiB7IGF1dGhlbnRpY2F0ZUNhbGxzKys7IH07XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICdyZWFkLXRva2VuJywgYXV0aGVudGljYXRlKSxcblx0XHRcdGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3dyaXRlJ10sICd3cml0ZS10b2tlbicsIGF1dGhlbnRpY2F0ZSksXG5cdFx0XHRjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vb3RoZXIuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3JlYWQtdG9rZW4nLCBhdXRoZW50aWNhdGUpLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dGhlbnRpY2F0ZUNhbGxzLCAzKTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbGVkIGF1dGhlbnRpY2F0aW9uIGlzIG5vdCBjYWNoZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKTtcblx0XHRsZXQgYXV0aGVudGljYXRlQ2FsbHMgPSAwO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhdXRoZW50aWNhdGVDYWxscysrO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdmYWlsZWQnKTtcblx0XHR9KSwgL2ZhaWxlZC8pO1xuXHRcdGF3YWl0IGNhY2hlLmF1dGhlbnRpY2F0ZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhdXRoZW50aWNhdGVDYWxscysrO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF1dGhlbnRpY2F0ZUNhbGxzLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXIgZm9yZ2V0cyBldmVyeSBjb21wbGV0ZWQgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKTtcblx0XHRsZXQgYXV0aGVudGljYXRlQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0ZSA9IGFzeW5jICgpID0+IHsgYXV0aGVudGljYXRlQ2FsbHMrKzsgfTtcblx0XHRhd2FpdCBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2sxJywgYXV0aGVudGljYXRlKTtcblx0XHRhd2FpdCBjYWNoZS5hdXRoZW50aWNhdGUoJ2h0dHBzOi8vb3RoZXIuZXhhbXBsZS5jb20nLCBbJ3JlYWQnXSwgJ3RvazInLCBhdXRoZW50aWNhdGUpO1xuXHRcdGNhY2hlLmNsZWFyKCk7XG5cdFx0YXdhaXQgY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsIFsncmVhZCddLCAndG9rMScsIGF1dGhlbnRpY2F0ZSk7XG5cdFx0YXdhaXQgY2FjaGUuYXV0aGVudGljYXRlKCdodHRwczovL290aGVyLmV4YW1wbGUuY29tJywgWydyZWFkJ10sICd0b2syJywgYXV0aGVudGljYXRlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRoZW50aWNhdGVDYWxscywgNCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudEhvc3RBdXRoZW50aWNhdGlvblJlY292ZXJ5JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY2FuY2VscyByZWNvdmVyeSB3aGVuIGl0cyBlbmFibGVtZW50IGdlbmVyYXRpb24gYmVjb21lcyBzdGFsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IG5ldyBEZWZlcnJlZFByb21pc2U8cmVhZG9ubHkgeyBzY29wZXM6IHN0cmluZ1tdOyBhY2Nlc3NUb2tlbjogc3RyaW5nIH1bXT4oKTtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdwcm92aWRlci0xJyksXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gc2Vzc2lvbnMucCxcblx0XHR9KTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUF1dGhJbnN0YW50aWF0aW9uU2VydmljZShkaXNwb3NhYmxlcywgYXV0aFNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCByZWNvdmVyeSA9IG5ldyBBZ2VudEhvc3RBdXRoZW50aWNhdGlvblJlY292ZXJ5KCk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRlQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGN1cnJlbnQgPSB0cnVlO1xuXHRcdGNvbnN0IHJlY292ZXJ5UHJvbWlzZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHJlY292ZXJ5LnJlY292ZXIoYWNjZXNzb3IsIHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSddLFxuXHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJ10sXG5cdFx0fSwge1xuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0aXNDdXJyZW50OiAoKSA9PiBjdXJyZW50LFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHsgYXV0aGVudGljYXRlQ2FsbHMucHVzaChyZXF1ZXN0LnRva2VuKTsgfSxcblx0XHR9KSk7XG5cblx0XHRjdXJyZW50ID0gZmFsc2U7XG5cdFx0cmVjb3ZlcnkuY2xlYXIoKTtcblx0XHRzZXNzaW9ucy5jb21wbGV0ZShbeyBzY29wZXM6IFsncmVhZCddLCBhY2Nlc3NUb2tlbjogJ3Rvay0xJyB9XSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZWNvdmVyeVByb21pc2UsIC9DYW5jZWxlZC8pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tbWFuZENhbGxzOiBjb21tYW5kU2VydmljZS5jYWxscy5sZW5ndGgsXG5cdFx0XHRhdXRoZW50aWNhdGVDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRjb21tYW5kQ2FsbHM6IDAsXG5cdFx0XHRhdXRoZW50aWNhdGVDYWxsczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcmNlLWZvcndhcmRzIHRoZSBwb3N0LXNpZ24taW4gdG9rZW4gd2hlbiBzZXNzaW9uLWNoYW5nZSBoYW5kbGluZyByZXBvcHVsYXRlcyB0aGUgY2FjaGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9rZW4gPSB7IHZhbHVlOiAndG9rLTEnIH07XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMScpLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IChfcHJvdmlkZXJJZCwgc2NvcGVzKSA9PiBQcm9taXNlLnJlc29sdmUoc2NvcGVzID8gW3sgc2NvcGVzLCBhY2Nlc3NUb2tlbjogdG9rZW4udmFsdWUgfV0gOiBbXSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVBdXRoSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMsIGF1dGhTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKTtcblx0XHRjb25zdCByZWNvdmVyeSA9IG5ldyBBZ2VudEhvc3RBdXRoZW50aWNhdGlvblJlY292ZXJ5KCk7XG5cdFx0Y29uc3QgcmVzb3VyY2U6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgPSB7XG5cdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyxcblx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCddLFxuXHRcdH07XG5cdFx0Y29uc3QgYXV0aGVudGljYXRlQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgb3B0aW9uczogSUFnZW50SG9zdEF1dGhlbnRpY2F0aW9uT3B0aW9ucyA9IHtcblx0XHRcdGF1dGhUb2tlbkNhY2hlOiBjYWNoZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgcmVxdWVzdCA9PiB7IGF1dGhlbnRpY2F0ZUNhbGxzLnB1c2gocmVxdWVzdC50b2tlbik7IH0sXG5cdFx0fTtcblxuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHJlY292ZXJ5LnJlY292ZXIoYWNjZXNzb3IsIHJlc291cmNlLCBvcHRpb25zKSk7XG5cdFx0Y29tbWFuZFNlcnZpY2Uub25FeGVjdXRlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0dG9rZW4udmFsdWUgPSAndG9rLTInO1xuXHRcdFx0YXdhaXQgY2FjaGUuYXV0aGVudGljYXRlKHJlc291cmNlLnJlc291cmNlLCByZXNvdXJjZS5zY29wZXNfc3VwcG9ydGVkLCB0b2tlbi52YWx1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhdXRoZW50aWNhdGVDYWxscy5wdXNoKHRva2VuLnZhbHVlKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gcmVjb3ZlcnkucmVjb3ZlcihhY2Nlc3NvciwgcmVzb3VyY2UsIG9wdGlvbnMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tbWFuZENhbGxzOiBjb21tYW5kU2VydmljZS5jYWxscy5sZW5ndGgsXG5cdFx0XHRhdXRoZW50aWNhdGVDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRjb21tYW5kQ2FsbHM6IDEsXG5cdFx0XHRhdXRoZW50aWNhdGVDYWxsczogWyd0b2stMScsICd0b2stMicsICd0b2stMiddLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gcmVjb3ZlcnkucmVjb3ZlcihhY2Nlc3NvciwgcmVzb3VyY2UsIG9wdGlvbnMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tbWFuZFNlcnZpY2UuY2FsbHMubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgY3JlZGVudGlhbCByZW1vdmFsIGFuZCByZXNldHMgZXNjYWxhdGlvbiB3aGVuIHRoZSBjdXJyZW50IHRva2VuIGRpc2FwcGVhcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9rZW4gPSB7IHZhbHVlOiAndG9rLTEnIGFzIHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIHNjb3BlcykgPT4gUHJvbWlzZS5yZXNvbHZlKHRva2VuLnZhbHVlICYmIHNjb3BlcyA/IFt7IHNjb3BlcywgYWNjZXNzVG9rZW46IHRva2VuLnZhbHVlIH1dIDogW10pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gbmV3IFRlc3RDb21tYW5kU2VydmljZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlQXV0aEluc3RhbnRpYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzLCBhdXRoU2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlY292ZXJ5ID0gbmV3IEFnZW50SG9zdEF1dGhlbnRpY2F0aW9uUmVjb3ZlcnkoKTtcblx0XHRjb25zdCByZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSA9IHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSddLFxuXHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJ10sXG5cdFx0fTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGVDYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBvcHRpb25zOiBJQWdlbnRIb3N0QXV0aGVudGljYXRpb25PcHRpb25zID0ge1xuXHRcdFx0YXV0aFRva2VuQ2FjaGU6IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpLFxuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHsgYXV0aGVudGljYXRlQ2FsbHMucHVzaChyZXF1ZXN0LnRva2VuKTsgfSxcblx0XHR9O1xuXG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gcmVjb3ZlcnkucmVjb3ZlcihhY2Nlc3NvciwgcmVzb3VyY2UsIG9wdGlvbnMpKTtcblx0XHR0b2tlbi52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiByZWNvdmVyeS5yZWNvdmVyKGFjY2Vzc29yLCByZXNvdXJjZSwgb3B0aW9ucykpO1xuXHRcdHRva2VuLnZhbHVlID0gJ3Rvay0xJztcblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiByZWNvdmVyeS5yZWNvdmVyKGFjY2Vzc29yLCByZXNvdXJjZSwgb3B0aW9ucykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21tYW5kQ2FsbHM6IGNvbW1hbmRTZXJ2aWNlLmNhbGxzLmxlbmd0aCxcblx0XHRcdGF1dGhlbnRpY2F0ZUNhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGNvbW1hbmRDYWxsczogMCxcblx0XHRcdGF1dGhlbnRpY2F0ZUNhbGxzOiBbJ3Rvay0xJywgJycsICd0b2stMSddLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgncmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndXNlcyBjaGFsbGVuZ2Ugc2NvcGVzIHdpdGhvdXQgcmVwbGFjaW5nIHRoZSBwcm90ZWN0ZWQgcmVzb3VyY2Ugc2NvcGUgY2F0YWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0ZWRTY29wZXM6IChyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIHNjb3BlcykgPT4ge1xuXHRcdFx0XHRyZXF1ZXN0ZWRTY29wZXMucHVzaChzY29wZXMpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIGF1dGhTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsIHtcblx0XHRcdGdldEFjY291bnRQcmVmZXJlbmNlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uLCB7XG5cdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJyxcblx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVwbycsICdyZWFkOm9yZycsICdub3RpZmljYXRpb25zJ10sXG5cdFx0fSwge1xuXHRcdFx0YWxsb3dJbnRlcmFjdGlvbjogZmFsc2UsXG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRtY3BTZXJ2ZXJJZDogJ3NlcnZlci1pZCcsXG5cdFx0XHRtY3BTZXJ2ZXJOYW1lOiAnRXhhbXBsZScsXG5cdFx0XHRtY3BTZXJ2ZXJVcmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbScsXG5cdFx0XHRzY29wZXM6IFsnbm90aWZpY2F0aW9ucyddLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCByZXF1ZXN0ZWRTY29wZXMgfSwge1xuXHRcdFx0cmVzdWx0OiBmYWxzZSxcblx0XHRcdHJlcXVlc3RlZFNjb3BlczogW1snbm90aWZpY2F0aW9ucyddXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBzdXBwb3J0ZWQgc2NvcGVzIHdoZW4gdGhlIGNoYWxsZW5nZSBkb2VzIG5vdCBzcGVjaWZ5IHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0ZWRTY29wZXM6IChyZWFkb25seSBzdHJpbmdbXSlbXSA9IFtdO1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoJ3Byb3ZpZGVyLTEnKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIHNjb3BlcykgPT4ge1xuXHRcdFx0XHRyZXF1ZXN0ZWRTY29wZXMucHVzaChzY29wZXMgPz8gW10pO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIGF1dGhTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsIHtcblx0XHRcdGdldEFjY291bnRQcmVmZXJlbmNlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uLCB7XG5cdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbScsXG5cdFx0XHRyZXNvdXJjZV9uYW1lOiAnU2xhY2sgQVBJJyxcblx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL21jcC5zbGFjay5jb20nXSxcblx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsnc2VhcmNoOnJlYWQucHVibGljJywgJ2NoYXQ6d3JpdGUnXSxcblx0XHR9LCB7XG5cdFx0XHRhbGxvd0ludGVyYWN0aW9uOiBmYWxzZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdG1jcFNlcnZlcklkOiAnc2xhY2snLFxuXHRcdFx0bWNwU2VydmVyTmFtZTogJ1NsYWNrJyxcblx0XHRcdG1jcFNlcnZlclVybDogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbScsXG5cdFx0XHRzY29wZXM6IFtdLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCByZXF1ZXN0ZWRTY29wZXMgfSwge1xuXHRcdFx0cmVzdWx0OiBmYWxzZSxcblx0XHRcdHJlcXVlc3RlZFNjb3BlczogW1snc2VhcmNoOnJlYWQucHVibGljJywgJ2NoYXQ6d3JpdGUnXV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGVhZ2VybHkgcmVxdWVzdCBHaXRIdWIgTUNQIHN1cHBvcnRlZCBzY29wZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdGVkU2NvcGVzOiAocmVhZG9ubHkgc3RyaW5nW10pW10gPSBbXTtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdwcm92aWRlci0xJyksXG5cdFx0XHRnZXRTZXNzaW9uczogKF9wcm92aWRlcklkLCBzY29wZXMpID0+IHtcblx0XHRcdFx0cmVxdWVzdGVkU2NvcGVzLnB1c2goc2NvcGVzID8/IFtdKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBhdXRoU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLCB7XG5cdFx0XHRnZXRBY2NvdW50UHJlZmVyZW5jZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwge1xuXHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2FwaS5naXRodWJjb3BpbG90LmNvbS9tY3AnLFxuXHRcdFx0cmVzb3VyY2VfbmFtZTogJ0dpdEh1YiBNQ1AgU2VydmVyJyxcblx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2dpdGh1Yi5jb20vbG9naW4vb2F1dGgnXSxcblx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVwbycsICdub3RpZmljYXRpb25zJ10sXG5cdFx0fSwge1xuXHRcdFx0YWxsb3dJbnRlcmFjdGlvbjogZmFsc2UsXG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRtY3BTZXJ2ZXJJZDogJ2dpdGh1YicsXG5cdFx0XHRtY3BTZXJ2ZXJOYW1lOiAnR2l0SHViJyxcblx0XHRcdG1jcFNlcnZlclVybDogJ2h0dHBzOi8vYXBpLmdpdGh1YmNvcGlsb3QuY29tL21jcCcsXG5cdFx0XHRzY29wZXM6IFtdLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCByZXF1ZXN0ZWRTY29wZXMgfSwge1xuXHRcdFx0cmVzdWx0OiBmYWxzZSxcblx0XHRcdHJlcXVlc3RlZFNjb3BlczogW1tdXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY3JlYXRlIGEgZHluYW1pYyBwcm92aWRlciBzaWxlbnRseSB3aXRob3V0IGEgcGVyc2lzdGVkIHJlZ2lzdHJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3YXJuaW5nczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcm92aWRlckNyZWF0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBtZXRhZGF0YVJlcXVlc3RzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSB3YXJuKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHR3YXJuaW5ncy5wdXNoKG1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH0oKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBhc3luYyBhdXRob3JpemF0aW9uU2VydmVyID0+IHtcblx0XHRcdFx0cHJvdmlkZXJDcmVhdGlvbnMucHVzaChhdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKHRydWUpKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwge1xuXHRcdFx0Z2V0QWNjb3VudFByZWZlcmVuY2U6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsIHtcblx0XHRcdGdldENsaWVudFJlZ2lzdHJhdGlvbjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCksXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbG9nU2VydmljZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSddLFxuXHRcdH0sIHtcblx0XHRcdGFsbG93SW50ZXJhY3Rpb246IGZhbHNlLFxuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0bWNwU2VydmVySWQ6ICdzZXJ2ZXItaWQnLFxuXHRcdFx0bWNwU2VydmVyTmFtZTogJ0V4YW1wbGUnLFxuXHRcdFx0bWNwU2VydmVyVXJsOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLFxuXHRcdFx0c2NvcGVzOiBbXSxcblx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YUZldGNoZXI6IGFzeW5jIGF1dGhvcml6YXRpb25TZXJ2ZXIgPT4ge1xuXHRcdFx0XHRtZXRhZGF0YVJlcXVlc3RzLnB1c2goYXV0aG9yaXphdGlvblNlcnZlcik7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBtZXRhZGF0YSByZXF1ZXN0Jyk7XG5cdFx0XHR9LFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCB3YXJuaW5ncywgbWV0YWRhdGFSZXF1ZXN0cywgcHJvdmlkZXJDcmVhdGlvbnMgfSwge1xuXHRcdFx0cmVzdWx0OiBmYWxzZSxcblx0XHRcdHdhcm5pbmdzOiBbXSxcblx0XHRcdG1ldGFkYXRhUmVxdWVzdHM6IFtdLFxuXHRcdFx0cHJvdmlkZXJDcmVhdGlvbnM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBhIHBlcnNpc3RlZCBkeW5hbWljYWxseSByZWdpc3RlcmVkIHByb3ZpZGVyIHdpdGhvdXQgdXNlciBpbnRlcmFjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkeW5hbWljUHJvdmlkZXJJZCA9ICdodHRwczovL21jcC5ub3Rpb24uY29tLyBodHRwczovL21jcC5ub3Rpb24uY29tL21jcCc7XG5cdFx0Y29uc3QgcHJvdmlkZXJDcmVhdGlvbnM6IHsgY2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgY2xpZW50U2VjcmV0OiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0Y29uc3Qgc2Vzc2lvblJlcXVlc3RzOiB7IHNpbGVudDogYm9vbGVhbiB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGVSZXF1ZXN0czogeyByZXNvdXJjZTogc3RyaW5nOyBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTsgdG9rZW46IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRjcmVhdGVEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcjogYXN5bmMgKF9hdXRob3JpemF0aW9uU2VydmVyLCBfbWV0YWRhdGEsIF9yZXNvdXJjZSwgY2xpZW50SWQsIGNsaWVudFNlY3JldCkgPT4ge1xuXHRcdFx0XHRwcm92aWRlckNyZWF0aW9ucy5wdXNoKHsgY2xpZW50SWQsIGNsaWVudFNlY3JldCB9KTtcblx0XHRcdFx0cmV0dXJuIHsgaWQ6IGR5bmFtaWNQcm92aWRlcklkIH07XG5cdFx0XHR9LFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IChfcHJvdmlkZXJJZCwgX3Njb3Blcywgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRzZXNzaW9uUmVxdWVzdHMucHVzaCh7IHNpbGVudDogb3B0aW9ucy5zaWxlbnQgfSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW3tcblx0XHRcdFx0XHRpZDogJ25vdGlvbi1zZXNzaW9uJyxcblx0XHRcdFx0XHRzY29wZXM6IFtdLFxuXHRcdFx0XHRcdGFjY2Vzc1Rva2VuOiAnbm90aW9uLXRva2VuJyxcblx0XHRcdFx0XHRhY2NvdW50OiB7IGlkOiAnYWNjb3VudC1pZCcsIGxhYmVsOiAnTm90aW9uIEFjY291bnQnIH0sXG5cdFx0XHRcdH1dKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvblNlcnZpY2UsIGF1dGhTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsIHtcblx0XHRcdGlzQWNjZXNzQWxsb3dlZEZvclVybDogKCkgPT4gdHJ1ZSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsIHtcblx0XHRcdGdldEFjY291bnRQcmVmZXJlbmNlOiAoKSA9PiAnTm90aW9uIEFjY291bnQnLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLCB7XG5cdFx0XHRhZGRBY2NvdW50VXNhZ2U6ICgpID0+IHsgfSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLCB7XG5cdFx0XHRnZXRDbGllbnRSZWdpc3RyYXRpb246ICgpID0+IFByb21pc2UucmVzb2x2ZSh7IGNsaWVudElkOiAnbm90aW9uLWNsaWVudC1pZCcsIGNsaWVudFNlY3JldDogJ25vdGlvbi1jbGllbnQtc2VjcmV0JyB9KSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3Aubm90aW9uLmNvbS9tY3AnLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vbWNwLm5vdGlvbi5jb20nXSxcblx0XHR9LCB7XG5cdFx0XHRhbGxvd0ludGVyYWN0aW9uOiBmYWxzZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdG1jcFNlcnZlcklkOiAnbm90aW9uJyxcblx0XHRcdG1jcFNlcnZlck5hbWU6ICdub3Rpb24nLFxuXHRcdFx0bWNwU2VydmVyVXJsOiAnaHR0cHM6Ly9tY3Aubm90aW9uLmNvbS9tY3AnLFxuXHRcdFx0c2NvcGVzOiBbXSxcblx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YUZldGNoZXI6IGFzeW5jIGF1dGhvcml6YXRpb25TZXJ2ZXIgPT4gKHtcblx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRpc3N1ZXI6IGF1dGhvcml6YXRpb25TZXJ2ZXIsXG5cdFx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzY292ZXJ5VXJsOiBgJHthdXRob3JpemF0aW9uU2VydmVyfS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcmAsXG5cdFx0XHRcdGVycm9yczogW10sXG5cdFx0XHR9KSxcblx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgcmVxdWVzdCA9PiB7XG5cdFx0XHRcdGF1dGhlbnRpY2F0ZVJlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdCwgcHJvdmlkZXJDcmVhdGlvbnMsIHNlc3Npb25SZXF1ZXN0cywgYXV0aGVudGljYXRlUmVxdWVzdHMgfSwge1xuXHRcdFx0cmVzdWx0OiB0cnVlLFxuXHRcdFx0cHJvdmlkZXJDcmVhdGlvbnM6IFt7IGNsaWVudElkOiAnbm90aW9uLWNsaWVudC1pZCcsIGNsaWVudFNlY3JldDogJ25vdGlvbi1jbGllbnQtc2VjcmV0JyB9XSxcblx0XHRcdHNlc3Npb25SZXF1ZXN0czogW3sgc2lsZW50OiB0cnVlIH1dLFxuXHRcdFx0YXV0aGVudGljYXRlUmVxdWVzdHM6IFt7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3Aubm90aW9uLmNvbS9tY3AnLFxuXHRcdFx0XHRzY29wZXM6IFtdLFxuXHRcdFx0XHR0b2tlbjogJ25vdGlvbi10b2tlbicsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VyaWFsaXplcyBhdXRoZW50aWNhdGlvbiB0cmFuc2FjdGlvbnMgZm9yIGRpZmZlcmVudCBjb25maWd1cmVkIGNsaWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZHluYW1pY1Byb3ZpZGVySWQgPSAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vIGh0dHBzOi8vbWNwLmV4YW1wbGUuY29tL3Jlc291cmNlJztcblx0XHRjb25zdCBmaXJzdFNlc3Npb25TdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbkdhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJDcmVhdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc2Vzc2lvblJlcXVlc3RzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0ZVJlcXVlc3RzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBhY3RpdmVDbGllbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJvdmlkZXJBY3RpdmUgPSBmYWxzZTtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRpc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBwcm92aWRlcklkID0+IHByb3ZpZGVySWQgPT09IGR5bmFtaWNQcm92aWRlcklkICYmIHByb3ZpZGVyQWN0aXZlLFxuXHRcdFx0Y3JlYXRlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXI6IGFzeW5jIChfYXV0aG9yaXphdGlvblNlcnZlciwgX21ldGFkYXRhLCBfcmVzb3VyY2UsIGNsaWVudElkKSA9PiB7XG5cdFx0XHRcdGFjdGl2ZUNsaWVudCA9IGNsaWVudElkO1xuXHRcdFx0XHRwcm92aWRlckFjdGl2ZSA9IHRydWU7XG5cdFx0XHRcdHByb3ZpZGVyQ3JlYXRpb25zLnB1c2goY2xpZW50SWQgPz8gJycpO1xuXHRcdFx0XHRyZXR1cm4geyBpZDogZHluYW1pY1Byb3ZpZGVySWQgfTtcblx0XHRcdH0sXG5cdFx0XHR1bnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcjogKCkgPT4ge1xuXHRcdFx0XHRwcm92aWRlckFjdGl2ZSA9IGZhbHNlO1xuXHRcdFx0fSxcblx0XHRcdGdldFNlc3Npb25zOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNsaWVudElkID0gYWN0aXZlQ2xpZW50ID8/ICcnO1xuXHRcdFx0XHRzZXNzaW9uUmVxdWVzdHMucHVzaChjbGllbnRJZCk7XG5cdFx0XHRcdGlmIChjbGllbnRJZCA9PT0gJ2ZpcnN0LWNsaWVudCcpIHtcblx0XHRcdFx0XHRmaXJzdFNlc3Npb25TdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0YXdhaXQgZmlyc3RTZXNzaW9uR2F0ZS5wO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGlkOiBgJHtjbGllbnRJZH0tc2Vzc2lvbmAsXG5cdFx0XHRcdFx0c2NvcGVzOiBbXSxcblx0XHRcdFx0XHRhY2Nlc3NUb2tlbjogYCR7Y2xpZW50SWR9LXRva2VuYCxcblx0XHRcdFx0XHRhY2NvdW50OiB7IGlkOiAnYWNjb3VudC1pZCcsIGxhYmVsOiAnTUNQIEFjY291bnQnIH0sXG5cdFx0XHRcdH1dO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgYXV0aFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSwge1xuXHRcdFx0aXNBY2Nlc3NBbGxvd2VkRm9yVXJsOiAoKSA9PiB0cnVlLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwge1xuXHRcdFx0Z2V0QWNjb3VudFByZWZlcmVuY2U6ICgpID0+ICdNQ1AgQWNjb3VudCcsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsIHtcblx0XHRcdGFkZEFjY291bnRVc2FnZTogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsIHtcblx0XHRcdGdldENsaWVudFJlZ2lzdHJhdGlvbjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGFjdGl2ZUNsaWVudCA/IHsgY2xpZW50SWQ6IGFjdGl2ZUNsaWVudCB9IDogdW5kZWZpbmVkKSxcblx0XHRcdHJlbW92ZUR5bmFtaWNQcm92aWRlcjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhY3RpdmVDbGllbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBwcm90ZWN0ZWRSZXNvdXJjZSA9IHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vcmVzb3VyY2UnLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJ10sXG5cdFx0fTtcblx0XHRjb25zdCBvcHRpb25zID0gKGNsaWVudElkOiBzdHJpbmcpID0+ICh7XG5cdFx0XHRhbGxvd0ludGVyYWN0aW9uOiB0cnVlLFxuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0bWNwU2VydmVySWQ6ICdleGFtcGxlJyxcblx0XHRcdG1jcFNlcnZlck5hbWU6ICdFeGFtcGxlJyxcblx0XHRcdG1jcFNlcnZlclVybDogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tL3Jlc291cmNlJyxcblx0XHRcdG9hdXRoQ2xpZW50OiB7IGNsaWVudElkIH0sXG5cdFx0XHRzY29wZXM6IFtdLFxuXHRcdFx0YXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhRmV0Y2hlcjogYXN5bmMgKGF1dGhvcml6YXRpb25TZXJ2ZXI6IHN0cmluZykgPT4gKHtcblx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRpc3N1ZXI6IGF1dGhvcml6YXRpb25TZXJ2ZXIsXG5cdFx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzY292ZXJ5VXJsOiBgJHthdXRob3JpemF0aW9uU2VydmVyfS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcmAsXG5cdFx0XHRcdGVycm9yczogW10sXG5cdFx0XHR9KSxcblx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgKHJlcXVlc3Q6IHsgdG9rZW46IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdGF1dGhlbnRpY2F0ZVJlcXVlc3RzLnB1c2gocmVxdWVzdC50b2tlbik7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIHByb3RlY3RlZFJlc291cmNlLCBvcHRpb25zKCdmaXJzdC1jbGllbnQnKSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uLCBwcm90ZWN0ZWRSZXNvdXJjZSwgb3B0aW9ucygnc2Vjb25kLWNsaWVudCcpKTtcblx0XHRhd2FpdCBmaXJzdFNlc3Npb25TdGFydGVkLnA7XG5cdFx0Y29uc3QgYmVmb3JlUmVzb2x1dGlvbiA9IHtcblx0XHRcdHByb3ZpZGVyQ3JlYXRpb25zOiBbLi4ucHJvdmlkZXJDcmVhdGlvbnNdLFxuXHRcdFx0c2Vzc2lvblJlcXVlc3RzOiBbLi4uc2Vzc2lvblJlcXVlc3RzXSxcblx0XHR9O1xuXHRcdGZpcnN0U2Vzc2lvbkdhdGUuY29tcGxldGUoKTtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0LCBzZWNvbmRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YmVmb3JlUmVzb2x1dGlvbixcblx0XHRcdHJlc3VsdHMsXG5cdFx0XHRwcm92aWRlckNyZWF0aW9ucyxcblx0XHRcdHNlc3Npb25SZXF1ZXN0cyxcblx0XHRcdGF1dGhlbnRpY2F0ZVJlcXVlc3RzLFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZVJlc29sdXRpb246IHtcblx0XHRcdFx0cHJvdmlkZXJDcmVhdGlvbnM6IFsnZmlyc3QtY2xpZW50J10sXG5cdFx0XHRcdHNlc3Npb25SZXF1ZXN0czogWydmaXJzdC1jbGllbnQnXSxcblx0XHRcdH0sXG5cdFx0XHRyZXN1bHRzOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0XHRwcm92aWRlckNyZWF0aW9uczogWydmaXJzdC1jbGllbnQnLCAnc2Vjb25kLWNsaWVudCddLFxuXHRcdFx0c2Vzc2lvblJlcXVlc3RzOiBbJ2ZpcnN0LWNsaWVudCcsICdzZWNvbmQtY2xpZW50J10sXG5cdFx0XHRhdXRoZW50aWNhdGVSZXF1ZXN0czogWydmaXJzdC1jbGllbnQtdG9rZW4nLCAnc2Vjb25kLWNsaWVudC10b2tlbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBhIHBlcnNpc3RlZCBjb25maWd1cmVkIHByb3ZpZGVyIHdpdGhvdXQgdXNlciBpbnRlcmFjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkeW5hbWljUHJvdmlkZXJJZCA9ICdodHRwczovL21jcC5zbGFjay5jb20vIGh0dHBzOi8vbWNwLnNsYWNrLmNvbSc7XG5cdFx0Y29uc3QgcHJvdmlkZXJDcmVhdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgYXV0aGVudGljYXRlUmVxdWVzdHM6IHsgcmVzb3VyY2U6IHN0cmluZzsgc2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW107IHRva2VuOiBzdHJpbmcgfVtdID0gW107XG5cdFx0bGV0IGlzUHJvdmlkZXJBY3RpdmUgPSBmYWxzZTtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRpc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBwcm92aWRlcklkID0+IHByb3ZpZGVySWQgPT09IGR5bmFtaWNQcm92aWRlcklkICYmIGlzUHJvdmlkZXJBY3RpdmUsXG5cdFx0XHRjcmVhdGVEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcjogYXN5bmMgKF9hdXRob3JpemF0aW9uU2VydmVyLCBfbWV0YWRhdGEsIF9yZXNvdXJjZSwgY2xpZW50SWQpID0+IHtcblx0XHRcdFx0cHJvdmlkZXJDcmVhdGlvbnMucHVzaChjbGllbnRJZCA/PyAnJyk7XG5cdFx0XHRcdGlzUHJvdmlkZXJBY3RpdmUgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4geyBpZDogZHluYW1pY1Byb3ZpZGVySWQgfTtcblx0XHRcdH0sXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFt7XG5cdFx0XHRcdGlkOiAnc2xhY2stc2Vzc2lvbicsXG5cdFx0XHRcdHNjb3BlczogWydzZWFyY2g6cmVhZC5wdWJsaWMnXSxcblx0XHRcdFx0YWNjZXNzVG9rZW46ICdzbGFjay10b2tlbicsXG5cdFx0XHRcdGFjY291bnQ6IHsgaWQ6ICdhY2NvdW50LWlkJywgbGFiZWw6ICdTbGFjayBBY2NvdW50JyB9LFxuXHRcdFx0fV0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBhdXRoU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLCB7XG5cdFx0XHRpc0FjY2Vzc0FsbG93ZWRGb3JVcmw6ICgpID0+IHRydWUsXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLCB7XG5cdFx0XHRnZXRBY2NvdW50UHJlZmVyZW5jZTogKCkgPT4gJ1NsYWNrIEFjY291bnQnLFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLCB7XG5cdFx0XHRhZGRBY2NvdW50VXNhZ2U6ICgpID0+IHsgfSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLCB7XG5cdFx0XHRnZXRDbGllbnRSZWdpc3RyYXRpb246ICgpID0+IFByb21pc2UucmVzb2x2ZSh7IGNsaWVudElkOiAnc2xhY2stY2xpZW50LWlkJyB9KSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIHtcblx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3Auc2xhY2suY29tJyxcblx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL21jcC5zbGFjay5jb20nXSxcblx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsnc2VhcmNoOnJlYWQucHVibGljJ10sXG5cdFx0fSwge1xuXHRcdFx0YWxsb3dJbnRlcmFjdGlvbjogZmFsc2UsXG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRtY3BTZXJ2ZXJJZDogJ3NsYWNrJyxcblx0XHRcdG1jcFNlcnZlck5hbWU6ICdTbGFjaycsXG5cdFx0XHRtY3BTZXJ2ZXJVcmw6ICdodHRwczovL21jcC5zbGFjay5jb20nLFxuXHRcdFx0b2F1dGhDbGllbnQ6IHsgY2xpZW50SWQ6ICdzbGFjay1jbGllbnQtaWQnIH0sXG5cdFx0XHRzY29wZXM6IFtdLFxuXHRcdFx0YXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhRmV0Y2hlcjogYXN5bmMgYXV0aG9yaXphdGlvblNlcnZlciA9PiAoe1xuXHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdGlzc3VlcjogYXV0aG9yaXphdGlvblNlcnZlcixcblx0XHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNjb3ZlcnlVcmw6IGAke2F1dGhvcml6YXRpb25TZXJ2ZXJ9Ly53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyYCxcblx0XHRcdFx0ZXJyb3JzOiBbXSxcblx0XHRcdH0pLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHtcblx0XHRcdFx0YXV0aGVudGljYXRlUmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCBwcm92aWRlckNyZWF0aW9ucywgYXV0aGVudGljYXRlUmVxdWVzdHMgfSwge1xuXHRcdFx0cmVzdWx0OiB0cnVlLFxuXHRcdFx0cHJvdmlkZXJDcmVhdGlvbnM6IFsnc2xhY2stY2xpZW50LWlkJ10sXG5cdFx0XHRhdXRoZW50aWNhdGVSZXF1ZXN0czogW3tcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5zbGFjay5jb20nLFxuXHRcdFx0XHRzY29wZXM6IFsnc2VhcmNoOnJlYWQucHVibGljJ10sXG5cdFx0XHRcdHRva2VuOiAnc2xhY2stdG9rZW4nLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgY29uZmlndXJlZCBwdWJsaWMgYW5kIGNvbmZpZGVudGlhbCBjbGllbnRzIHdoZW4gY3JlYXRpbmcgYSBkeW5hbWljIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGR5bmFtaWNQcm92aWRlcklkID0gJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbS8gaHR0cHM6Ly9tY3Auc2xhY2suY29tJztcblx0XHRjb25zdCBwcm92aWRlckNyZWF0aW9uczogeyBhdXRob3JpemF0aW9uU2VydmVyOiBzdHJpbmc7IHJlc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGNsaWVudFNlY3JldDogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHNlc3Npb25SZXF1ZXN0czogeyBjbGllbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkOyBjbGllbnRTZWNyZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uQ3JlYXRpb25zOiB7IGNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGNsaWVudFNlY3JldDogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0ZVJlcXVlc3RzOiB7IHJlc291cmNlOiBzdHJpbmc7IHNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdOyB0b2tlbjogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHJlbW92ZWRQcm92aWRlcnM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHJlZ2lzdGVyZWRDbGllbnQ6IHsgY2xpZW50SWQ/OiBzdHJpbmc7IGNsaWVudFNlY3JldD86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBnZXRTZXNzaW9uc0NhbGwgPSAwO1xuXHRcdGNvbnN0IHByb3ZpZGVyOiBJQXV0aGVudGljYXRpb25Qcm92aWRlciA9IHtcblx0XHRcdGlkOiBkeW5hbWljUHJvdmlkZXJJZCxcblx0XHRcdGxhYmVsOiAnU2xhY2snLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUFjY291bnRzOiBmYWxzZSxcblx0XHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdVbmV4cGVjdGVkIHByb3ZpZGVyIGdldFNlc3Npb25zIGNhbGwnKSksXG5cdFx0XHRjcmVhdGVTZXNzaW9uOiAoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcHJvdmlkZXIgY3JlYXRlU2Vzc2lvbiBjYWxsJykpLFxuXHRcdFx0cmVtb3ZlU2Vzc2lvbjogKCkgPT4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdVbmV4cGVjdGVkIHByb3ZpZGVyIHJlbW92ZVNlc3Npb24gY2FsbCcpKSxcblx0XHR9O1xuXHRcdGNvbnN0IGF1dGhTZXJ2aWNlID0gY3JlYXRlTW9ja0F1dGhTZXJ2aWNlKHtcblx0XHRcdGdldE9yQWN0aXZhdGVQcm92aWRlcklkRm9yU2VydmVyOiAoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0NvbmZpZ3VyZWQgY2xpZW50cyBtdXN0IG5vdCB1c2UgYSBidWlsdC1pbiBwcm92aWRlcicpKSxcblx0XHRcdGdldFNlc3Npb25zOiAoX3Byb3ZpZGVySWQsIF9zY29wZXMsIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0c2Vzc2lvblJlcXVlc3RzLnB1c2goeyBjbGllbnRJZDogb3B0aW9ucy5jbGllbnRJZCwgY2xpZW50U2VjcmV0OiBvcHRpb25zLmNsaWVudFNlY3JldCB9KTtcblx0XHRcdFx0Z2V0U2Vzc2lvbnNDYWxsKys7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZ2V0U2Vzc2lvbnNDYWxsID09PSAxID8gW3tcblx0XHRcdFx0XHRzY29wZXM6IFsnc2VhcmNoOnJlYWQucHVibGljJ10sXG5cdFx0XHRcdFx0YWNjZXNzVG9rZW46ICdwdWJsaWMtdG9rZW4nLFxuXHRcdFx0XHRcdGFjY291bnQ6IHsgaWQ6ICdhY2NvdW50LWlkJywgbGFiZWw6ICdTbGFjayBBY2NvdW50JyB9LFxuXHRcdFx0XHR9XSA6IFtdKTtcblx0XHRcdH0sXG5cdFx0XHRjcmVhdGVTZXNzaW9uOiAoX3Byb3ZpZGVySWQsIF9zY29wZXMsIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0c2Vzc2lvbkNyZWF0aW9ucy5wdXNoKHsgY2xpZW50SWQ6IG9wdGlvbnMuY2xpZW50SWQsIGNsaWVudFNlY3JldDogb3B0aW9ucy5jbGllbnRTZWNyZXQgfSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0XHRcdGlkOiAnY29uZmlkZW50aWFsLXNlc3Npb24nLFxuXHRcdFx0XHRcdGFjY2Vzc1Rva2VuOiAnY29uZmlkZW50aWFsLXRva2VuJyxcblx0XHRcdFx0XHRhY2NvdW50OiB7IGlkOiAnYWNjb3VudC1pZCcsIGxhYmVsOiAnU2xhY2sgQWNjb3VudCcgfSxcblx0XHRcdFx0XHRzY29wZXM6IFsnc2VhcmNoOnJlYWQucHVibGljJ10sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBhc3luYyAoYXV0aG9yaXphdGlvblNlcnZlciwgX21ldGFkYXRhLCByZXNvdXJjZSwgY2xpZW50SWQsIGNsaWVudFNlY3JldCkgPT4ge1xuXHRcdFx0XHRwcm92aWRlckNyZWF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyOiBhdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKHRydWUpLFxuXHRcdFx0XHRcdHJlc291cmNlOiByZXNvdXJjZT8ucmVzb3VyY2UsXG5cdFx0XHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRcdFx0Y2xpZW50U2VjcmV0LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmVnaXN0ZXJlZENsaWVudCA9IHsgY2xpZW50SWQsIGNsaWVudFNlY3JldCB9O1xuXHRcdFx0XHRyZXR1cm4geyBpZDogZHluYW1pY1Byb3ZpZGVySWQgfTtcblx0XHRcdH0sXG5cdFx0XHRnZXRQcm92aWRlcjogKCkgPT4gcHJvdmlkZXIsXG5cdFx0XHRpc0R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBwcm92aWRlcklkID0+IHByb3ZpZGVySWQgPT09IGR5bmFtaWNQcm92aWRlcklkICYmIHJlZ2lzdGVyZWRDbGllbnQgIT09IHVuZGVmaW5lZCxcblx0XHRcdHVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyOiBwcm92aWRlcklkID0+IHtcblx0XHRcdFx0cmVtb3ZlZFByb3ZpZGVycy5wdXNoKHByb3ZpZGVySWQpO1xuXHRcdFx0XHRyZWdpc3RlcmVkQ2xpZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgYXV0aFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSwge1xuXHRcdFx0aXNBY2Nlc3NBbGxvd2VkRm9yVXJsOiAoKSA9PiB0cnVlLFxuXHRcdFx0dXBkYXRlQWxsb3dlZE1jcFNlcnZlcnM6ICgpID0+IHsgfSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsIHtcblx0XHRcdGdldEFjY291bnRQcmVmZXJlbmNlOiAoKSA9PiAnU2xhY2sgQWNjb3VudCcsXG5cdFx0XHR1cGRhdGVBY2NvdW50UHJlZmVyZW5jZTogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLCB7XG5cdFx0XHRhZGRBY2NvdW50VXNhZ2U6ICgpID0+IHsgfSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLCB7XG5cdFx0XHRnZXRDbGllbnRSZWdpc3RyYXRpb246ICgpID0+IFByb21pc2UucmVzb2x2ZShyZWdpc3RlcmVkQ2xpZW50KSxcblx0XHRcdHJlbW92ZUR5bmFtaWNQcm92aWRlcjogYXN5bmMgcHJvdmlkZXJJZCA9PiB7XG5cdFx0XHRcdHJlbW92ZWRQcm92aWRlcnMucHVzaChwcm92aWRlcklkKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0czogYm9vbGVhbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBvYXV0aENsaWVudCBvZiBbXG5cdFx0XHR7IGNsaWVudElkOiAncHVibGljLWNsaWVudC1pZCcgfSxcblx0XHRcdHsgY2xpZW50SWQ6ICdjb25maWRlbnRpYWwtY2xpZW50LWlkJywgY2xpZW50U2VjcmV0OiAnY29uZmlkZW50aWFsLWNsaWVudC1zZWNyZXQnIH0sXG5cdFx0XSkge1xuXHRcdFx0cmVzdWx0cy5wdXNoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbScsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL21jcC5zbGFjay5jb20nXSxcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydzZWFyY2g6cmVhZC5wdWJsaWMnXSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWxsb3dJbnRlcmFjdGlvbjogdHJ1ZSxcblx0XHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0XHRtY3BTZXJ2ZXJJZDogJ3NsYWNrJyxcblx0XHRcdFx0bWNwU2VydmVyTmFtZTogJ1NsYWNrJyxcblx0XHRcdFx0bWNwU2VydmVyVXJsOiAnaHR0cHM6Ly9tY3Auc2xhY2suY29tJyxcblx0XHRcdFx0b2F1dGhDbGllbnQsXG5cdFx0XHRcdHNjb3BlczogWydzZWFyY2g6cmVhZC5wdWJsaWMnXSxcblx0XHRcdFx0YXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhRmV0Y2hlcjogYXN5bmMgYXV0aG9yaXphdGlvblNlcnZlciA9PiAoe1xuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRpc3N1ZXI6IGF1dGhvcml6YXRpb25TZXJ2ZXIsXG5cdFx0XHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzY292ZXJ5VXJsOiBgJHthdXRob3JpemF0aW9uU2VydmVyfS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcmAsXG5cdFx0XHRcdFx0ZXJyb3JzOiBbXSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgcmVxdWVzdCA9PiB7XG5cdFx0XHRcdFx0YXV0aGVudGljYXRlUmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdHMsXG5cdFx0XHRwcm92aWRlckNyZWF0aW9ucyxcblx0XHRcdHNlc3Npb25SZXF1ZXN0cyxcblx0XHRcdHNlc3Npb25DcmVhdGlvbnMsXG5cdFx0XHRhdXRoZW50aWNhdGVSZXF1ZXN0cyxcblx0XHRcdHJlbW92ZWRQcm92aWRlcnMsXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0czogW3RydWUsIHRydWVdLFxuXHRcdFx0cHJvdmlkZXJDcmVhdGlvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXI6ICdodHRwczovL21jcC5zbGFjay5jb20vJyxcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbScsXG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdwdWJsaWMtY2xpZW50LWlkJyxcblx0XHRcdFx0XHRjbGllbnRTZWNyZXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXI6ICdodHRwczovL21jcC5zbGFjay5jb20vJyxcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vbWNwLnNsYWNrLmNvbScsXG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICdjb25maWRlbnRpYWwtY2xpZW50LWlkJyxcblx0XHRcdFx0XHRjbGllbnRTZWNyZXQ6ICdjb25maWRlbnRpYWwtY2xpZW50LXNlY3JldCcsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0c2Vzc2lvblJlcXVlc3RzOiBbXG5cdFx0XHRcdHsgY2xpZW50SWQ6ICdwdWJsaWMtY2xpZW50LWlkJywgY2xpZW50U2VjcmV0OiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBjbGllbnRJZDogJ2NvbmZpZGVudGlhbC1jbGllbnQtaWQnLCBjbGllbnRTZWNyZXQ6ICdjb25maWRlbnRpYWwtY2xpZW50LXNlY3JldCcgfSxcblx0XHRcdF0sXG5cdFx0XHRzZXNzaW9uQ3JlYXRpb25zOiBbXG5cdFx0XHRcdHsgY2xpZW50SWQ6ICdjb25maWRlbnRpYWwtY2xpZW50LWlkJywgY2xpZW50U2VjcmV0OiAnY29uZmlkZW50aWFsLWNsaWVudC1zZWNyZXQnIH0sXG5cdFx0XHRdLFxuXHRcdFx0YXV0aGVudGljYXRlUmVxdWVzdHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3Auc2xhY2suY29tJyxcblx0XHRcdFx0XHRzY29wZXM6IFsnc2VhcmNoOnJlYWQucHVibGljJ10sXG5cdFx0XHRcdFx0dG9rZW46ICdwdWJsaWMtdG9rZW4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5zbGFjay5jb20nLFxuXHRcdFx0XHRcdHNjb3BlczogWydzZWFyY2g6cmVhZC5wdWJsaWMnXSxcblx0XHRcdFx0XHR0b2tlbjogJ2NvbmZpZGVudGlhbC10b2tlbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0cmVtb3ZlZFByb3ZpZGVyczogW2R5bmFtaWNQcm92aWRlcklkLCBkeW5hbWljUHJvdmlkZXJJZF0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdtb2RlbFJlcXVpcmVzQWdlbnRBdXRoZW50aWNhdGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCByZXF1aXJlZFJlc291cmNlOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhID0geyByZXNvdXJjZTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20nLCByZXF1aXJlZDogdHJ1ZSB9O1xuXHRjb25zdCBieW9rTW9kZWwgPSB7XG5cdFx0aWQ6ICdnZW1pbmkvZ2VtaW5pLTIuNS1wcm8nLFxuXHRcdF9tZXRhOiBjcmVhdGVBZ2VudE1vZGVsQnlva01ldGEoJ2dlbWluaS9HZW1pbmkvZ2VtaW5pLTIuNS1wcm8nKSxcblx0fTtcblx0Y29uc3QgY29waWxvdE1vZGVsID0geyBpZDogJ2dwdC01JyB9O1xuXHRjb25zdCBhZ2VudCA9IHtcblx0XHRtb2RlbHM6IFtieW9rTW9kZWwsIGNvcGlsb3RNb2RlbF0sXG5cdFx0cHJvdGVjdGVkUmVzb3VyY2VzOiBbcmVxdWlyZWRSZXNvdXJjZV0sXG5cdH0gYXMgQWdlbnRJbmZvO1xuXG5cdHRlc3QoJ2J5cGFzc2VzIHJlcXVpcmVkIGFnZW50IGF1dGggb25seSBmb3IgYW4gYWR2ZXJ0aXNlZCBCWU9LIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9wdGlvbmFsUmVzb3VyY2VBZ2VudCA9IHsgLi4uYWdlbnQsIHByb3RlY3RlZFJlc291cmNlczogW3sgLi4ucmVxdWlyZWRSZXNvdXJjZSwgcmVxdWlyZWQ6IGZhbHNlIH1dIH07XG5cdFx0Y29uc3Qgb3B0aW9uYWxSZXNvdXJjZUFnZW50V2l0aG91dEJ5b2sgPSB7IC4uLm9wdGlvbmFsUmVzb3VyY2VBZ2VudCwgbW9kZWxzOiBbY29waWxvdE1vZGVsXSB9IGFzIEFnZW50SW5mbztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJ5b2tFbmFibGVkOiBtb2RlbFJlcXVpcmVzQWdlbnRBdXRoZW50aWNhdGlvbihhZ2VudCwgeyBpZDogYnlva01vZGVsLmlkIH0sIHRydWUpLFxuXHRcdFx0Ynlva0Rpc2FibGVkOiBtb2RlbFJlcXVpcmVzQWdlbnRBdXRoZW50aWNhdGlvbihhZ2VudCwgeyBpZDogYnlva01vZGVsLmlkIH0sIGZhbHNlKSxcblx0XHRcdGNvcGlsb3Q6IG1vZGVsUmVxdWlyZXNBZ2VudEF1dGhlbnRpY2F0aW9uKGFnZW50LCB7IGlkOiBjb3BpbG90TW9kZWwuaWQgfSwgdHJ1ZSksXG5cdFx0XHR1bmtub3duOiBtb2RlbFJlcXVpcmVzQWdlbnRBdXRoZW50aWNhdGlvbihhZ2VudCwgeyBpZDogJ3Vua25vd24nIH0sIHRydWUpLFxuXHRcdFx0bm9TZWxlY3Rpb246IG1vZGVsUmVxdWlyZXNBZ2VudEF1dGhlbnRpY2F0aW9uKGFnZW50LCB1bmRlZmluZWQsIHRydWUpLFxuXHRcdFx0b3B0aW9uYWxSZXNvdXJjZUJ5b2s6IG1vZGVsUmVxdWlyZXNBZ2VudEF1dGhlbnRpY2F0aW9uKG9wdGlvbmFsUmVzb3VyY2VBZ2VudCwgeyBpZDogYnlva01vZGVsLmlkIH0sIHRydWUpLFxuXHRcdFx0b3B0aW9uYWxSZXNvdXJjZUNvcGlsb3Q6IG1vZGVsUmVxdWlyZXNBZ2VudEF1dGhlbnRpY2F0aW9uKG9wdGlvbmFsUmVzb3VyY2VBZ2VudCwgeyBpZDogY29waWxvdE1vZGVsLmlkIH0sIHRydWUpLFxuXHRcdFx0b3B0aW9uYWxSZXNvdXJjZVVua25vd246IG1vZGVsUmVxdWlyZXNBZ2VudEF1dGhlbnRpY2F0aW9uKG9wdGlvbmFsUmVzb3VyY2VBZ2VudCwgeyBpZDogJ3Vua25vd24nIH0sIHRydWUpLFxuXHRcdFx0b3B0aW9uYWxSZXNvdXJjZVNpZ25lZE91dERpc2FibGVkOiBtb2RlbFJlcXVpcmVzQWdlbnRBdXRoZW50aWNhdGlvbihvcHRpb25hbFJlc291cmNlQWdlbnQsIHsgaWQ6IGNvcGlsb3RNb2RlbC5pZCB9LCBmYWxzZSksXG5cdFx0XHRvcHRpb25hbFJlc291cmNlV2l0aG91dEJ5b2s6IG1vZGVsUmVxdWlyZXNBZ2VudEF1dGhlbnRpY2F0aW9uKG9wdGlvbmFsUmVzb3VyY2VBZ2VudFdpdGhvdXRCeW9rLCB7IGlkOiBjb3BpbG90TW9kZWwuaWQgfSwgdHJ1ZSksXG5cdFx0XHRub1Byb3RlY3RlZFJlc291cmNlOiBtb2RlbFJlcXVpcmVzQWdlbnRBdXRoZW50aWNhdGlvbih7IC4uLmFnZW50LCBwcm90ZWN0ZWRSZXNvdXJjZXM6IFtdIH0sIHsgaWQ6IGNvcGlsb3RNb2RlbC5pZCB9LCB0cnVlKSxcblx0XHR9LCB7XG5cdFx0XHRieW9rRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRieW9rRGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRjb3BpbG90OiB0cnVlLFxuXHRcdFx0dW5rbm93bjogdHJ1ZSxcblx0XHRcdG5vU2VsZWN0aW9uOiB0cnVlLFxuXHRcdFx0b3B0aW9uYWxSZXNvdXJjZUJ5b2s6IGZhbHNlLFxuXHRcdFx0b3B0aW9uYWxSZXNvdXJjZUNvcGlsb3Q6IHRydWUsXG5cdFx0XHRvcHRpb25hbFJlc291cmNlVW5rbm93bjogdHJ1ZSxcblx0XHRcdG9wdGlvbmFsUmVzb3VyY2VTaWduZWRPdXREaXNhYmxlZDogZmFsc2UsXG5cdFx0XHRvcHRpb25hbFJlc291cmNlV2l0aG91dEJ5b2s6IGZhbHNlLFxuXHRcdFx0bm9Qcm90ZWN0ZWRSZXNvdXJjZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMnLCAoKSA9PiB7XG5cblx0Y29uc3QgcHJvdGVjdGVkUmVzb3VyY2U6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgPSB7XG5cdFx0cmVzb3VyY2U6ICdodHRwczovL2FwaS5leGFtcGxlLmNvbScsXG5cdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSddLFxuXHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCddLFxuXHR9O1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2tpcHMgYXV0aGVudGljYXRlIHdoZW4gdGhlIGNhY2hlZCB0b2tlbiBpcyB1bmNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMScpLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IChfcHJvdmlkZXJJZCwgc2NvcGVzKSA9PiB7XG5cdFx0XHRcdGlmIChzY29wZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFt7IHNjb3BlczogWydyZWFkJ10sIGFjY2Vzc1Rva2VuOiAnY2FjaGVkLXRva2VuJyB9XSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKTtcblx0XHRjb25zdCByZXF1ZXN0czogeyByZXNvdXJjZTogc3RyaW5nOyBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTsgdG9rZW46IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCBhZ2VudHMgPSBbeyBwcm90ZWN0ZWRSZXNvdXJjZXM6IFtwcm90ZWN0ZWRSZXNvdXJjZV0gfV0gYXMgdW5rbm93biBhcyByZWFkb25seSBBZ2VudEluZm9bXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUF1dGhJbnN0YW50aWF0aW9uU2VydmljZShkaXNwb3NhYmxlcywgYXV0aFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXV0aGVudGljYXRlUHJvdGVjdGVkUmVzb3VyY2VzLCBhZ2VudHMsIHtcblx0XHRcdGF1dGhUb2tlbkNhY2hlOiBjYWNoZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tBZ2VudEhvc3RdJyxcblx0XHRcdGF1dGhlbnRpY2F0ZTogYXN5bmMgcmVxdWVzdCA9PiB7XG5cdFx0XHRcdHJlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGF1dGhlbnRpY2F0ZVByb3RlY3RlZFJlc291cmNlcywgYWdlbnRzLCB7XG5cdFx0XHRhdXRoVG9rZW5DYWNoZTogY2FjaGUsXG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jIHJlcXVlc3QgPT4ge1xuXHRcdFx0XHRyZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdHMsIFt7IHJlc291cmNlOiBwcm90ZWN0ZWRSZXNvdXJjZS5yZXNvdXJjZSwgc2NvcGVzOiBbJ3JlYWQnXSwgdG9rZW46ICdjYWNoZWQtdG9rZW4nIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgY3JlZGVudGlhbCByZW1vdmFsIHdoZW4gYSBwcmV2aW91c2x5IGF2YWlsYWJsZSB0b2tlbiBkaXNhcHBlYXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCB0b2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gJ2NhY2hlZC10b2tlbic7XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMScpLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IChfcHJvdmlkZXJJZCwgc2NvcGVzKSA9PiB7XG5cdFx0XHRcdGlmIChzY29wZXMgJiYgdG9rZW4pIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFt7IHNjb3BlczogWydyZWFkJ10sIGFjY2Vzc1Rva2VuOiB0b2tlbiB9XSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUoKTtcblx0XHRjb25zdCByZXF1ZXN0czogeyByZXNvdXJjZTogc3RyaW5nOyBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTsgdG9rZW46IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCBhZ2VudHMgPSBbeyBwcm90ZWN0ZWRSZXNvdXJjZXM6IFtwcm90ZWN0ZWRSZXNvdXJjZV0gfV0gYXMgdW5rbm93biBhcyByZWFkb25seSBBZ2VudEluZm9bXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUF1dGhJbnN0YW50aWF0aW9uU2VydmljZShkaXNwb3NhYmxlcywgYXV0aFNlcnZpY2UpO1xuXHRcdGNvbnN0IG9wdGlvbnM6IElBZ2VudEhvc3RBdXRoZW50aWNhdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHRhdXRoVG9rZW5DYWNoZTogY2FjaGUsXG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jIHJlcXVlc3QgPT4ge1xuXHRcdFx0XHRyZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXV0aGVudGljYXRlUHJvdGVjdGVkUmVzb3VyY2VzLCBhZ2VudHMsIG9wdGlvbnMpO1xuXHRcdHRva2VuID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGF1dGhlbnRpY2F0ZVByb3RlY3RlZFJlc291cmNlcywgYWdlbnRzLCBvcHRpb25zKTtcblx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMsIGFnZW50cywgb3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3RzLCBbXG5cdFx0XHR7IHJlc291cmNlOiBwcm90ZWN0ZWRSZXNvdXJjZS5yZXNvdXJjZSwgc2NvcGVzOiBbJ3JlYWQnXSwgdG9rZW46ICdjYWNoZWQtdG9rZW4nIH0sXG5cdFx0XHR7IHJlc291cmNlOiBwcm90ZWN0ZWRSZXNvdXJjZS5yZXNvdXJjZSwgc2NvcGVzOiBbJ3JlYWQnXSwgdG9rZW46ICcnIH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdyZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5JywgKCkgPT4ge1xuXG5cdGNvbnN0IHByb3RlY3RlZFJlc291cmNlOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhID0ge1xuXHRcdHJlc291cmNlOiAnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nLFxuXHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnXSxcblx0fTtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3VzZXMgYW4gZXhpc3RpbmcgdG9rZW4gYmVmb3JlIHByb21wdGluZyBhbmQgZGVkdXBlcyByZXBlYXRlZCBjaGVja3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNyZWF0ZVNlc3Npb25DYWxscyA9IDA7XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMScpLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6IChfcHJvdmlkZXJJZCwgc2NvcGVzKSA9PiB7XG5cdFx0XHRcdGlmIChzY29wZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFt7IHNjb3BlczogWydyZWFkJ10sIGFjY2Vzc1Rva2VuOiAnZXhpc3RpbmctdG9rZW4nIH1dKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVNlc3Npb246IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbkNhbGxzKys7XG5cdFx0XHRcdHJldHVybiB7IGFjY2Vzc1Rva2VuOiAnbmV3LXRva2VuJyB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCByZXF1ZXN0czogeyByZXNvdXJjZTogc3RyaW5nOyBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTsgdG9rZW46IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlQXV0aEluc3RhbnRpYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzLCBhdXRoU2VydmljZSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBJQWdlbnRIb3N0QXV0aGVudGljYXRpb25PcHRpb25zID0ge1xuXHRcdFx0YXV0aFRva2VuQ2FjaGU6IGNhY2hlLFxuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyByZXF1ZXN0ID0+IHtcblx0XHRcdFx0cmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHRzID0gW1xuXHRcdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseSwgW3Byb3RlY3RlZFJlc291cmNlXSwgb3B0aW9ucyksXG5cdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5LCBbcHJvdGVjdGVkUmVzb3VyY2VdLCBvcHRpb25zKSxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdHMsIHJlcXVlc3RzLCBjcmVhdGVTZXNzaW9uQ2FsbHMgfSwge1xuXHRcdFx0cmVzdWx0czogW3RydWUsIHRydWVdLFxuXHRcdFx0cmVxdWVzdHM6IFt7IHJlc291cmNlOiBwcm90ZWN0ZWRSZXNvdXJjZS5yZXNvdXJjZSwgc2NvcGVzOiBbJ3JlYWQnXSwgdG9rZW46ICdleGlzdGluZy10b2tlbicgfV0sXG5cdFx0XHRjcmVhdGVTZXNzaW9uQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIHByb2R1Y3Qgc2lnbi1pbiBmbG93IGFuZCBmb3J3YXJkcyBpdHMgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNpZ25lZEluID0gZmFsc2U7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCk7XG5cdFx0Y29tbWFuZFNlcnZpY2Uub25FeGVjdXRlID0gKCkgPT4geyBzaWduZWRJbiA9IHRydWU7IH07XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMScpLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6ICgpID0+IFByb21pc2UucmVzb2x2ZShzaWduZWRJbiA/IFt7IHNjb3BlczogWydyZWFkJ10sIGFjY2Vzc1Rva2VuOiAnc2lnbmVkLWluLXRva2VuJyB9XSA6IFtdKSxcblx0XHR9KTtcblx0XHRjb25zdCByZXF1ZXN0czogeyByZXNvdXJjZTogc3RyaW5nOyBzY29wZXM/OiByZWFkb25seSBzdHJpbmdbXTsgdG9rZW46IHN0cmluZyB9W10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUF1dGhJbnN0YW50aWF0aW9uU2VydmljZShkaXNwb3NhYmxlcywgYXV0aFNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5LCBbcHJvdGVjdGVkUmVzb3VyY2VdLCB7XG5cdFx0XHRhdXRoVG9rZW5DYWNoZTogbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCksXG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jIHJlcXVlc3QgPT4ge1xuXHRcdFx0XHRyZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzdWNjZXNzLCBjb21tYW5kQ2FsbHM6IGNvbW1hbmRTZXJ2aWNlLmNhbGxzLCByZXF1ZXN0cyB9LCB7XG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0Y29tbWFuZENhbGxzOiBbe1xuXHRcdFx0XHRjb21tYW5kSWQ6IENIQVRfU0VUVVBfQUNUSU9OX0lELFxuXHRcdFx0XHRhcmdzOiBbdW5kZWZpbmVkLCB7XG5cdFx0XHRcdFx0Zm9yY2VTaWduSW5EaWFsb2c6IHRydWUsXG5cdFx0XHRcdFx0YWRkaXRpb25hbFNjb3BlczogWydyZWFkJ10sXG5cdFx0XHRcdFx0ZGlhbG9nVGl0bGU6ICdTaWduIGluIHRvIHVzZSBHaXRIdWIgQ29waWxvdCcsXG5cdFx0XHRcdFx0ZGlzYWJsZUNoYXRWaWV3UmV2ZWFsOiB0cnVlLFxuXHRcdFx0XHRcdHJldHVyblJlc3VsdDogdHJ1ZSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9XSxcblx0XHRcdHJlcXVlc3RzOiBbeyByZXNvdXJjZTogcHJvdGVjdGVkUmVzb3VyY2UucmVzb3VyY2UsIHNjb3BlczogWydyZWFkJ10sIHRva2VuOiAnc2lnbmVkLWluLXRva2VuJyB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZmFsbCBiYWNrIHRvIGRpcmVjdCBwcm92aWRlciBsb2dpbiB3aGVuIHByb2R1Y3Qgc2lnbi1pbiBpcyBjYW5jZWxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKTtcblx0XHRjb21tYW5kU2VydmljZS5yZXN1bHQgPSB7IHN1Y2Nlc3M6IHVuZGVmaW5lZCwgZGlhbG9nU2tpcHBlZDogZmFsc2UgfTtcblx0XHRsZXQgY3JlYXRlU2Vzc2lvbkNhbGxzID0gMDtcblx0XHRjb25zdCBhdXRoU2VydmljZSA9IGNyZWF0ZU1vY2tBdXRoU2VydmljZSh7XG5cdFx0XHRnZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdwcm92aWRlci0xJyksXG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFtdKSxcblx0XHRcdGNyZWF0ZVNlc3Npb246IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbkNhbGxzKys7XG5cdFx0XHRcdHJldHVybiB7IGFjY2Vzc1Rva2VuOiAndW5leHBlY3RlZC10b2tlbicgfTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVBdXRoSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMsIGF1dGhTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cblx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseSwgW3Byb3RlY3RlZFJlc291cmNlXSwge1xuXHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0YXV0aGVudGljYXRlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3VjY2VzcywgY3JlYXRlU2Vzc2lvbkNhbGxzIH0sIHsgc3VjY2VzczogZmFsc2UsIGNyZWF0ZVNlc3Npb25DYWxsczogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgncHJvcGFnYXRlcyBwcm9kdWN0IHNpZ24taW4gZmFpbHVyZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCk7XG5cdFx0Y29tbWFuZFNlcnZpY2UucmVzdWx0ID0geyBzdWNjZXNzOiBmYWxzZSwgZGlhbG9nU2tpcHBlZDogZmFsc2UsIGVycm9yOiBuZXcgRXJyb3IoJ0JhZCBjcmVkZW50aWFscycpIH07XG5cdFx0Y29uc3QgYXV0aFNlcnZpY2UgPSBjcmVhdGVNb2NrQXV0aFNlcnZpY2Uoe1xuXHRcdFx0Z2V0T3JBY3RpdmF0ZVByb3ZpZGVySWRGb3JTZXJ2ZXI6ICgpID0+IFByb21pc2UucmVzb2x2ZSgncHJvdmlkZXItMScpLFxuXHRcdFx0Z2V0U2Vzc2lvbnM6ICgpID0+IFByb21pc2UucmVzb2x2ZShbXSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVBdXRoSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMsIGF1dGhTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihyZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5LCBbcHJvdGVjdGVkUmVzb3VyY2VdLCB7XG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRhdXRoZW50aWNhdGU6IGFzeW5jICgpID0+IHsgfSxcblx0XHR9KSwgL0JhZCBjcmVkZW50aWFscy8pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUV0QixTQUFTLFdBQVc7QUFFcEIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyw4QkFBNEQ7QUFDckUsU0FBUyxvREFBb0Q7QUFDN0QsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxpQ0FBaUMsZ0NBQWdDLG9DQUFvQyx5QkFBeUIseUJBQXlCLHNCQUFzQixnQ0FBZ0Msd0NBQThFO0FBQ3BTLFNBQVMsZ0NBQWdDO0FBRXpDLE1BQU0sMkJBQTJCLEtBQXNCLEVBQUU7QUFBQSxFQUF6RDtBQUFBO0FBQ0MsU0FBUyxRQUFrRCxDQUFDO0FBQzVELGtCQUFrQixFQUFF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
