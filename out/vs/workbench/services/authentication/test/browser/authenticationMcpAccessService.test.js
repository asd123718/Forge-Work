import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { TestStorageService, TestProductService } from "../../../../test/common/workbenchTestServices.js";
import { AuthenticationMcpAccessService } from "../../browser/authenticationMcpAccessService.js";
suite("AuthenticationMcpAccessService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let storageService;
  let productService;
  let authenticationMcpAccessService;
  setup(() => {
    instantiationService = disposables.add(new TestInstantiationService());
    storageService = disposables.add(new TestStorageService());
    instantiationService.stub(IStorageService, storageService);
    productService = { ...TestProductService };
    instantiationService.stub(IProductService, productService);
    authenticationMcpAccessService = disposables.add(instantiationService.createInstance(AuthenticationMcpAccessService));
  });
  suite("isAccessAllowed", () => {
    test("returns undefined for unknown MCP server with no product configuration", () => {
      const result = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "unknown-server");
      assert.strictEqual(result, void 0);
    });
    test("returns true for trusted MCP server from product.json (array format)", () => {
      productService.trustedMcpAuthAccess = ["trusted-server-1", "trusted-server-2"];
      const result = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "trusted-server-1");
      assert.strictEqual(result, true);
    });
    test("returns true for trusted MCP server from product.json (object format)", () => {
      productService.trustedMcpAuthAccess = {
        "github": ["github-server"],
        "microsoft": ["microsoft-server"]
      };
      const result1 = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "github-server");
      assert.strictEqual(result1, true);
      const result2 = authenticationMcpAccessService.isAccessAllowed("microsoft", "user@microsoft.com", "microsoft-server");
      assert.strictEqual(result2, true);
    });
    test("returns undefined for MCP server not in trusted list", () => {
      productService.trustedMcpAuthAccess = ["trusted-server"];
      const result = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "untrusted-server");
      assert.strictEqual(result, void 0);
    });
    test("returns stored allowed state when server is in storage", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [{
        id: "stored-server",
        name: "Stored Server",
        allowed: false
      }]);
      const result = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "stored-server");
      assert.strictEqual(result, false);
    });
    test("returns true for server in storage with allowed=true", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [{
        id: "allowed-server",
        name: "Allowed Server",
        allowed: true
      }]);
      const result = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "allowed-server");
      assert.strictEqual(result, true);
    });
    test("returns true for server in storage with undefined allowed property (legacy behavior)", () => {
      const legacyServer = {
        id: "legacy-server",
        name: "Legacy Server"
        // allowed property is undefined
      };
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [legacyServer]);
      const result = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "legacy-server");
      assert.strictEqual(result, true);
    });
    test("product.json trusted servers take precedence over storage", () => {
      productService.trustedMcpAuthAccess = ["product-trusted-server"];
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [{
        id: "product-trusted-server",
        name: "Product Trusted Server",
        allowed: false
      }]);
      const result = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "product-trusted-server");
      assert.strictEqual(result, true);
    });
  });
  suite("isAccessAllowedForUrl URL binding (security)", () => {
    const serverUrl = "https://server.example.com/mcp";
    test("grants access when the supplied URL matches the stored URL", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "http-server", name: "HTTP Server", allowed: true, url: serverUrl }
      ]);
      const result = authenticationMcpAccessService.isAccessAllowedForUrl("github", "user@example.com", "http-server", serverUrl);
      assert.strictEqual(result, true);
    });
    test("grants access despite cosmetic origin differences (root slash, host case)", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "http-server", name: "HTTP Server", allowed: true, url: "https://server.example.com" }
      ]);
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowedForUrl("github", "user@example.com", "http-server", "https://server.example.com/"),
        true
      );
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowedForUrl("github", "user@example.com", "http-server", "https://SERVER.EXAMPLE.COM"),
        true
      );
    });
    test("re-prompts when a path trailing slash differs (foo.com/a vs foo.com/a/)", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "http-server", name: "HTTP Server", allowed: true, url: "https://server.example.com/mcp" }
      ]);
      const result = authenticationMcpAccessService.isAccessAllowedForUrl("github", "user@example.com", "http-server", "https://server.example.com/mcp/");
      assert.strictEqual(result, void 0);
    });
    test("re-prompts (returns undefined) when the URL changed for the same server id", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "http-server", name: "HTTP Server", allowed: true, url: serverUrl }
      ]);
      const result = authenticationMcpAccessService.isAccessAllowedForUrl("github", "user@example.com", "http-server", "https://evil.example.com/mcp");
      assert.strictEqual(result, void 0);
    });
    test("breaks legacy grants that have no stored URL when a URL is supplied", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "http-server", name: "HTTP Server", allowed: true }
      ]);
      const result = authenticationMcpAccessService.isAccessAllowedForUrl("github", "user@example.com", "http-server", serverUrl);
      assert.strictEqual(result, void 0);
    });
    test("inspection (isAccessAllowed) returns the stored decision regardless of stored URL", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "http-server", name: "HTTP Server", allowed: true, url: serverUrl }
      ]);
      const result = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "http-server");
      assert.strictEqual(result, true);
    });
    test("stdio servers (inspection, no URL) are unaffected", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "stdio-server", name: "Stdio Server", allowed: true }
      ]);
      const result = authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "stdio-server");
      assert.strictEqual(result, true);
    });
    test("product.json trusted servers bypass the URL check", () => {
      productService.trustedMcpAuthAccess = ["trusted-http-server"];
      const result = authenticationMcpAccessService.isAccessAllowedForUrl("github", "user@example.com", "trusted-http-server", "https://anything.example.com/mcp");
      assert.strictEqual(result, true);
    });
    test("a management toggle that omits the URL does not clear the stored binding", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "http-server", name: "HTTP Server", allowed: true, url: serverUrl }
      ]);
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "http-server", name: "HTTP Server", allowed: true }
      ]);
      const stored = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com").find((s) => s.id === "http-server");
      assert.strictEqual(stored?.url, serverUrl);
      assert.strictEqual(authenticationMcpAccessService.isAccessAllowedForUrl("github", "user@example.com", "http-server", serverUrl), true);
    });
  });
  suite("readAllowedMcpServers", () => {
    test("returns empty array when no data exists", () => {
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 0);
    });
    test("returns stored MCP servers", () => {
      const servers = [
        { id: "server1", name: "Server 1", allowed: true },
        { id: "server2", name: "Server 2", allowed: false }
      ];
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", servers);
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, "server1");
      assert.strictEqual(result[0].allowed, true);
      assert.strictEqual(result[1].id, "server2");
      assert.strictEqual(result[1].allowed, false);
    });
    test("includes trusted servers from product.json (array format)", () => {
      productService.trustedMcpAuthAccess = ["trusted-server-1", "trusted-server-2"];
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      const trustedServer1 = result.find((s) => s.id === "trusted-server-1");
      assert.ok(trustedServer1);
      assert.strictEqual(trustedServer1.allowed, true);
      assert.strictEqual(trustedServer1.trusted, true);
      assert.strictEqual(trustedServer1.name, "trusted-server-1");
      const trustedServer2 = result.find((s) => s.id === "trusted-server-2");
      assert.ok(trustedServer2);
      assert.strictEqual(trustedServer2.allowed, true);
      assert.strictEqual(trustedServer2.trusted, true);
    });
    test("includes trusted servers from product.json (object format)", () => {
      productService.trustedMcpAuthAccess = {
        "github": ["github-server"],
        "microsoft": ["microsoft-server"]
      };
      const githubResult = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(githubResult.length, 1);
      assert.strictEqual(githubResult[0].id, "github-server");
      assert.strictEqual(githubResult[0].trusted, true);
      const microsoftResult = authenticationMcpAccessService.readAllowedMcpServers("microsoft", "user@microsoft.com");
      assert.strictEqual(microsoftResult.length, 1);
      assert.strictEqual(microsoftResult[0].id, "microsoft-server");
      assert.strictEqual(microsoftResult[0].trusted, true);
      const unknownResult = authenticationMcpAccessService.readAllowedMcpServers("unknown", "user@unknown.com");
      assert.strictEqual(unknownResult.length, 0);
    });
    test("merges stored servers with trusted servers from product.json", () => {
      productService.trustedMcpAuthAccess = ["trusted-server"];
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "stored-server", name: "Stored Server", allowed: false }
      ]);
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      const trustedServer = result.find((s) => s.id === "trusted-server");
      assert.ok(trustedServer);
      assert.strictEqual(trustedServer.trusted, true);
      assert.strictEqual(trustedServer.allowed, true);
      const storedServer = result.find((s) => s.id === "stored-server");
      assert.ok(storedServer);
      assert.strictEqual(storedServer.trusted, void 0);
      assert.strictEqual(storedServer.allowed, false);
    });
    test("updates existing stored server to be trusted when it appears in product.json", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server-1", name: "Server 1", allowed: false }
      ]);
      productService.trustedMcpAuthAccess = ["server-1"];
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      const server = result[0];
      assert.strictEqual(server.id, "server-1");
      assert.strictEqual(server.allowed, true);
      assert.strictEqual(server.trusted, true);
      assert.strictEqual(server.name, "Server 1");
    });
    test("handles malformed JSON in storage gracefully", () => {
      storageService.store("mcpserver-github-user@example.com", "invalid json", StorageScope.APPLICATION, StorageTarget.USER);
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 0);
    });
    test("handles non-array product.json configuration gracefully", () => {
      productService.trustedMcpAuthAccess = "invalid-string";
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 0);
    });
  });
  suite("updateAllowedMcpServers", () => {
    test("stores new MCP servers", () => {
      const servers = [
        { id: "server1", name: "Server 1", allowed: true },
        { id: "server2", name: "Server 2", allowed: false }
      ];
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", servers);
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].id, "server1");
      assert.strictEqual(result[1].id, "server2");
    });
    test("updates existing MCP server allowed status", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server1", name: "Server 1", allowed: true }
      ]);
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server1", name: "Server 1", allowed: false }
      ]);
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].allowed, false);
    });
    test("updates existing MCP server name when new name is provided", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server1", name: "server1", allowed: true }
      ]);
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server1", name: "My Server", allowed: true }
      ]);
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "My Server");
    });
    test("does not update name when new name is same as ID", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server1", name: "My Server", allowed: true }
      ]);
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server1", name: "server1", allowed: false }
      ]);
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "My Server");
      assert.strictEqual(result[0].allowed, false);
    });
    test("adds new servers while preserving existing ones", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server1", name: "Server 1", allowed: true }
      ]);
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server2", name: "Server 2", allowed: false }
      ]);
      const result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      const server1 = result.find((s) => s.id === "server1");
      const server2 = result.find((s) => s.id === "server2");
      assert.ok(server1);
      assert.ok(server2);
      assert.strictEqual(server1.allowed, true);
      assert.strictEqual(server2.allowed, false);
    });
    test("does not store trusted servers from product.json", () => {
      productService.trustedMcpAuthAccess = ["trusted-server"];
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "trusted-server", name: "Trusted Server", allowed: false, trusted: true },
        { id: "user-server", name: "User Server", allowed: true }
      ]);
      const storageKey = "mcpserver-github-user@example.com";
      const storedData = JSON.parse(storageService.get(storageKey, StorageScope.APPLICATION) || "[]");
      assert.strictEqual(storedData.length, 1);
      assert.strictEqual(storedData[0].id, "user-server");
      const allServers = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(allServers.length, 2);
    });
    test("persists agentHost metadata and preserves it when a later toggle omits it", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "agent-host-mcp:remote/GitHub/https://api.example/mcp", name: "GitHub", allowed: true, url: "https://api.example/mcp", agentHost: { authority: "remote", label: "SSH: my-host" } }
      ]);
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "agent-host-mcp:remote/GitHub/https://api.example/mcp", name: "GitHub", allowed: true }
      ]);
      const stored = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com").find((s) => s.id === "agent-host-mcp:remote/GitHub/https://api.example/mcp");
      assert.deepStrictEqual(stored?.agentHost, { authority: "remote", label: "SSH: my-host" });
    });
    test("fires onDidChangeMcpSessionAccess event", () => {
      let eventFired = false;
      let eventData;
      const disposable = authenticationMcpAccessService.onDidChangeMcpSessionAccess((event) => {
        eventFired = true;
        eventData = event;
      });
      try {
        authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
          { id: "server1", name: "Server 1", allowed: true }
        ]);
        assert.strictEqual(eventFired, true);
        assert.ok(eventData);
        assert.strictEqual(eventData.providerId, "github");
        assert.strictEqual(eventData.accountName, "user@example.com");
      } finally {
        disposable.dispose();
      }
    });
  });
  suite("removeAllowedMcpServers", () => {
    test("removes all stored MCP servers for account", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "server1", name: "Server 1", allowed: true },
        { id: "server2", name: "Server 2", allowed: false }
      ]);
      let result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      authenticationMcpAccessService.removeAllowedMcpServers("github", "user@example.com");
      result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 0);
    });
    test("does not affect trusted servers from product.json", () => {
      productService.trustedMcpAuthAccess = ["trusted-server"];
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "user-server", name: "User Server", allowed: true }
      ]);
      let result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 2);
      authenticationMcpAccessService.removeAllowedMcpServers("github", "user@example.com");
      result = authenticationMcpAccessService.readAllowedMcpServers("github", "user@example.com");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, "trusted-server");
      assert.strictEqual(result[0].trusted, true);
    });
    test("fires onDidChangeMcpSessionAccess event", () => {
      let eventFired = false;
      let eventData;
      const disposable = authenticationMcpAccessService.onDidChangeMcpSessionAccess((event) => {
        eventFired = true;
        eventData = event;
      });
      try {
        authenticationMcpAccessService.removeAllowedMcpServers("github", "user@example.com");
        assert.strictEqual(eventFired, true);
        assert.ok(eventData);
        assert.strictEqual(eventData.providerId, "github");
        assert.strictEqual(eventData.accountName, "user@example.com");
      } finally {
        disposable.dispose();
      }
    });
    test("handles removal of non-existent data gracefully", () => {
      assert.doesNotThrow(() => {
        authenticationMcpAccessService.removeAllowedMcpServers("nonexistent", "user@example.com");
      });
    });
  });
  suite("onDidChangeMcpSessionAccess event", () => {
    test("event is fired for each update operation", () => {
      const events = [];
      const disposable = authenticationMcpAccessService.onDidChangeMcpSessionAccess((event) => {
        events.push(event);
      });
      try {
        authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
          { id: "server1", name: "Server 1", allowed: true }
        ]);
        authenticationMcpAccessService.removeAllowedMcpServers("github", "user@example.com");
        authenticationMcpAccessService.updateAllowedMcpServers("microsoft", "admin@company.com", [
          { id: "server2", name: "Server 2", allowed: false }
        ]);
        assert.strictEqual(events.length, 3);
        assert.strictEqual(events[0].providerId, "github");
        assert.strictEqual(events[0].accountName, "user@example.com");
        assert.strictEqual(events[1].providerId, "github");
        assert.strictEqual(events[1].accountName, "user@example.com");
        assert.strictEqual(events[2].providerId, "microsoft");
        assert.strictEqual(events[2].accountName, "admin@company.com");
      } finally {
        disposable.dispose();
      }
    });
    test("multiple listeners receive events", () => {
      let listener1Fired = false;
      let listener2Fired = false;
      const disposable1 = authenticationMcpAccessService.onDidChangeMcpSessionAccess(() => {
        listener1Fired = true;
      });
      const disposable2 = authenticationMcpAccessService.onDidChangeMcpSessionAccess(() => {
        listener2Fired = true;
      });
      try {
        authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
          { id: "server1", name: "Server 1", allowed: true }
        ]);
        assert.strictEqual(listener1Fired, true);
        assert.strictEqual(listener2Fired, true);
      } finally {
        disposable1.dispose();
        disposable2.dispose();
      }
    });
  });
  suite("integration scenarios", () => {
    test("complete workflow: add, update, query, remove", () => {
      const providerId = "github";
      const accountName = "user@example.com";
      const serverId = "test-server";
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId),
        void 0
      );
      authenticationMcpAccessService.updateAllowedMcpServers(providerId, accountName, [
        { id: serverId, name: "Test Server", allowed: true }
      ]);
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId),
        true
      );
      authenticationMcpAccessService.updateAllowedMcpServers(providerId, accountName, [
        { id: serverId, name: "Test Server", allowed: false }
      ]);
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId),
        false
      );
      authenticationMcpAccessService.removeAllowedMcpServers(providerId, accountName);
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed(providerId, accountName, serverId),
        void 0
      );
    });
    test("multiple providers and accounts are isolated", () => {
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user1@example.com", [
        { id: "server1", name: "Server 1", allowed: true }
      ]);
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user2@example.com", [
        { id: "server1", name: "Server 1", allowed: false }
      ]);
      authenticationMcpAccessService.updateAllowedMcpServers("microsoft", "user1@example.com", [
        { id: "server1", name: "Server 1", allowed: true }
      ]);
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed("github", "user1@example.com", "server1"),
        true
      );
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed("github", "user2@example.com", "server1"),
        false
      );
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed("microsoft", "user1@example.com", "server1"),
        true
      );
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed("microsoft", "user2@example.com", "server1"),
        void 0
      );
    });
    test("product.json configuration takes precedence in all scenarios", () => {
      productService.trustedMcpAuthAccess = {
        "github": ["trusted-server"],
        "microsoft": ["microsoft-trusted"]
      };
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "trusted-server"),
        true
      );
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "trusted-server", name: "Trusted Server", allowed: false }
      ]);
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "trusted-server"),
        true
      );
      authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
        { id: "user-server", name: "User Server", allowed: false }
      ]);
      assert.strictEqual(
        authenticationMcpAccessService.isAccessAllowed("github", "user@example.com", "user-server"),
        false
      );
    });
    test("handles edge cases with empty or null values", () => {
      assert.doesNotThrow(() => {
        authenticationMcpAccessService.isAccessAllowed("", "", "server1");
      });
      assert.doesNotThrow(() => {
        authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", []);
      });
      assert.doesNotThrow(() => {
        authenticationMcpAccessService.updateAllowedMcpServers("github", "user@example.com", [
          { id: "", name: "", allowed: true }
        ]);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhdXRoZW50aWNhdGlvblxcdGVzdFxcYnJvd3NlclxcYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsIEFsbG93ZWRNY3BTZXJ2ZXIsIElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2F1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5qcyc7XG5cbnN1aXRlKCdBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBzdG9yYWdlU2VydmljZTogVGVzdFN0b3JhZ2VTZXJ2aWNlO1xuXHRsZXQgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSAmIHsgdHJ1c3RlZE1jcEF1dGhBY2Nlc3M/OiBzdHJpbmdbXSB8IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiB9O1xuXHRsZXQgYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gU2V0IHVwIHN0b3JhZ2Ugc2VydmljZVxuXHRcdHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdC8vIFNldCB1cCBwcm9kdWN0IHNlcnZpY2Ugd2l0aCBubyB0cnVzdGVkIHNlcnZlcnMgYnkgZGVmYXVsdFxuXHRcdHByb2R1Y3RTZXJ2aWNlID0geyAuLi5UZXN0UHJvZHVjdFNlcnZpY2UgfTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9kdWN0U2VydmljZSwgcHJvZHVjdFNlcnZpY2UpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBzZXJ2aWNlIGluc3RhbmNlXG5cdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNBY2Nlc3NBbGxvd2VkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIE1DUCBzZXJ2ZXIgd2l0aCBubyBwcm9kdWN0IGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICd1bmtub3duLXNlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgdHJ1c3RlZCBNQ1Agc2VydmVyIGZyb20gcHJvZHVjdC5qc29uIChhcnJheSBmb3JtYXQpJywgKCkgPT4ge1xuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZE1jcEF1dGhBY2Nlc3MgPSBbJ3RydXN0ZWQtc2VydmVyLTEnLCAndHJ1c3RlZC1zZXJ2ZXItMiddO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICd0cnVzdGVkLXNlcnZlci0xJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgdHJ1c3RlZCBNQ1Agc2VydmVyIGZyb20gcHJvZHVjdC5qc29uIChvYmplY3QgZm9ybWF0KScsICgpID0+IHtcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRNY3BBdXRoQWNjZXNzID0ge1xuXHRcdFx0XHQnZ2l0aHViJzogWydnaXRodWItc2VydmVyJ10sXG5cdFx0XHRcdCdtaWNyb3NvZnQnOiBbJ21pY3Jvc29mdC1zZXJ2ZXInXVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgJ2dpdGh1Yi1zZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MiA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ21pY3Jvc29mdCcsICd1c2VyQG1pY3Jvc29mdC5jb20nLCAnbWljcm9zb2Z0LXNlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdDIsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIE1DUCBzZXJ2ZXIgbm90IGluIHRydXN0ZWQgbGlzdCcsICgpID0+IHtcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRNY3BBdXRoQWNjZXNzID0gWyd0cnVzdGVkLXNlcnZlciddO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICd1bnRydXN0ZWQtc2VydmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBzdG9yZWQgYWxsb3dlZCBzdGF0ZSB3aGVuIHNlcnZlciBpcyBpbiBzdG9yYWdlJywgKCkgPT4ge1xuXHRcdFx0Ly8gQWRkIHNlcnZlciB0byBzdG9yYWdlXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW3tcblx0XHRcdFx0aWQ6ICdzdG9yZWQtc2VydmVyJyxcblx0XHRcdFx0bmFtZTogJ1N0b3JlZCBTZXJ2ZXInLFxuXHRcdFx0XHRhbGxvd2VkOiBmYWxzZVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICdzdG9yZWQtc2VydmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIHNlcnZlciBpbiBzdG9yYWdlIHdpdGggYWxsb3dlZD10cnVlJywgKCkgPT4ge1xuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFt7XG5cdFx0XHRcdGlkOiAnYWxsb3dlZC1zZXJ2ZXInLFxuXHRcdFx0XHRuYW1lOiAnQWxsb3dlZCBTZXJ2ZXInLFxuXHRcdFx0XHRhbGxvd2VkOiB0cnVlXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgJ2FsbG93ZWQtc2VydmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3Igc2VydmVyIGluIHN0b3JhZ2Ugd2l0aCB1bmRlZmluZWQgYWxsb3dlZCBwcm9wZXJ0eSAobGVnYWN5IGJlaGF2aW9yKScsICgpID0+IHtcblx0XHRcdC8vIFNpbXVsYXRlIGxlZ2FjeSBkYXRhIHdoZXJlIGFsbG93ZWQgcHJvcGVydHkgZGlkbid0IGV4aXN0XG5cdFx0XHRjb25zdCBsZWdhY3lTZXJ2ZXI6IEFsbG93ZWRNY3BTZXJ2ZXIgPSB7XG5cdFx0XHRcdGlkOiAnbGVnYWN5LXNlcnZlcicsXG5cdFx0XHRcdG5hbWU6ICdMZWdhY3kgU2VydmVyJ1xuXHRcdFx0XHQvLyBhbGxvd2VkIHByb3BlcnR5IGlzIHVuZGVmaW5lZFxuXHRcdFx0fTtcblxuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtsZWdhY3lTZXJ2ZXJdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAnbGVnYWN5LXNlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9kdWN0Lmpzb24gdHJ1c3RlZCBzZXJ2ZXJzIHRha2UgcHJlY2VkZW5jZSBvdmVyIHN0b3JhZ2UnLCAoKSA9PiB7XG5cdFx0XHRwcm9kdWN0U2VydmljZS50cnVzdGVkTWNwQXV0aEFjY2VzcyA9IFsncHJvZHVjdC10cnVzdGVkLXNlcnZlciddO1xuXG5cdFx0XHQvLyBUcnkgdG8gc3RvcmUgdGhlIHNhbWUgc2VydmVyIGFzIG5vdCBhbGxvd2VkXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW3tcblx0XHRcdFx0aWQ6ICdwcm9kdWN0LXRydXN0ZWQtc2VydmVyJyxcblx0XHRcdFx0bmFtZTogJ1Byb2R1Y3QgVHJ1c3RlZCBTZXJ2ZXInLFxuXHRcdFx0XHRhbGxvd2VkOiBmYWxzZVxuXHRcdFx0fV0pO1xuXG5cdFx0XHQvLyBQcm9kdWN0Lmpzb24gc2hvdWxkIHRha2UgcHJlY2VkZW5jZVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAncHJvZHVjdC10cnVzdGVkLXNlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc0FjY2Vzc0FsbG93ZWRGb3JVcmwgVVJMIGJpbmRpbmcgKHNlY3VyaXR5KScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2ZXJVcmwgPSAnaHR0cHM6Ly9zZXJ2ZXIuZXhhbXBsZS5jb20vbWNwJztcblxuXHRcdHRlc3QoJ2dyYW50cyBhY2Nlc3Mgd2hlbiB0aGUgc3VwcGxpZWQgVVJMIG1hdGNoZXMgdGhlIHN0b3JlZCBVUkwnLCAoKSA9PiB7XG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnaHR0cC1zZXJ2ZXInLCBuYW1lOiAnSFRUUCBTZXJ2ZXInLCBhbGxvd2VkOiB0cnVlLCB1cmw6IHNlcnZlclVybCB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZEZvclVybCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAnaHR0cC1zZXJ2ZXInLCBzZXJ2ZXJVcmwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncmFudHMgYWNjZXNzIGRlc3BpdGUgY29zbWV0aWMgb3JpZ2luIGRpZmZlcmVuY2VzIChyb290IHNsYXNoLCBob3N0IGNhc2UpJywgKCkgPT4ge1xuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ2h0dHAtc2VydmVyJywgbmFtZTogJ0hUVFAgU2VydmVyJywgYWxsb3dlZDogdHJ1ZSwgdXJsOiAnaHR0cHM6Ly9zZXJ2ZXIuZXhhbXBsZS5jb20nIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBcImZvby5jb21cIiBhbmQgXCJmb28uY29tL1wiIGFyZSB0aGUgc2FtZSBvcmlnaW4sIGFuZCB0aGUgaG9zdCBpcyBjYXNlLWluc2Vuc2l0aXZlLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkRm9yVXJsKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICdodHRwLXNlcnZlcicsICdodHRwczovL3NlcnZlci5leGFtcGxlLmNvbS8nKSxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZEZvclVybCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAnaHR0cC1zZXJ2ZXInLCAnaHR0cHM6Ly9TRVJWRVIuRVhBTVBMRS5DT00nKSxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlLXByb21wdHMgd2hlbiBhIHBhdGggdHJhaWxpbmcgc2xhc2ggZGlmZmVycyAoZm9vLmNvbS9hIHZzIGZvby5jb20vYS8pJywgKCkgPT4ge1xuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ2h0dHAtc2VydmVyJywgbmFtZTogJ0hUVFAgU2VydmVyJywgYWxsb3dlZDogdHJ1ZSwgdXJsOiAnaHR0cHM6Ly9zZXJ2ZXIuZXhhbXBsZS5jb20vbWNwJyB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gQSB0cmFpbGluZyBzbGFzaCBvbiBhIHBhdGggcG9pbnRzIGF0IGEgZGlmZmVyZW50IGVuZHBvaW50LCBzbyB0aGUgdXNlciBtdXN0IHJlLWNvbnNlbnQuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkRm9yVXJsKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICdodHRwLXNlcnZlcicsICdodHRwczovL3NlcnZlci5leGFtcGxlLmNvbS9tY3AvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtcHJvbXB0cyAocmV0dXJucyB1bmRlZmluZWQpIHdoZW4gdGhlIFVSTCBjaGFuZ2VkIGZvciB0aGUgc2FtZSBzZXJ2ZXIgaWQnLCAoKSA9PiB7XG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnaHR0cC1zZXJ2ZXInLCBuYW1lOiAnSFRUUCBTZXJ2ZXInLCBhbGxvd2VkOiB0cnVlLCB1cmw6IHNlcnZlclVybCB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZEZvclVybCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAnaHR0cC1zZXJ2ZXInLCAnaHR0cHM6Ly9ldmlsLmV4YW1wbGUuY29tL21jcCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JyZWFrcyBsZWdhY3kgZ3JhbnRzIHRoYXQgaGF2ZSBubyBzdG9yZWQgVVJMIHdoZW4gYSBVUkwgaXMgc3VwcGxpZWQnLCAoKSA9PiB7XG5cdFx0XHQvLyBMZWdhY3kgZ3JhbnQ6IHN0b3JlZCBiZWZvcmUgVVJMIGJpbmRpbmcgZXhpc3RlZCwgc28gaXQgaGFzIG5vIFVSTC5cblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdodHRwLXNlcnZlcicsIG5hbWU6ICdIVFRQIFNlcnZlcicsIGFsbG93ZWQ6IHRydWUgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWRGb3JVcmwoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgJ2h0dHAtc2VydmVyJywgc2VydmVyVXJsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNwZWN0aW9uIChpc0FjY2Vzc0FsbG93ZWQpIHJldHVybnMgdGhlIHN0b3JlZCBkZWNpc2lvbiByZWdhcmRsZXNzIG9mIHN0b3JlZCBVUkwnLCAoKSA9PiB7XG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnaHR0cC1zZXJ2ZXInLCBuYW1lOiAnSFRUUCBTZXJ2ZXInLCBhbGxvd2VkOiB0cnVlLCB1cmw6IHNlcnZlclVybCB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAnaHR0cC1zZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RkaW8gc2VydmVycyAoaW5zcGVjdGlvbiwgbm8gVVJMKSBhcmUgdW5hZmZlY3RlZCcsICgpID0+IHtcblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdzdGRpby1zZXJ2ZXInLCBuYW1lOiAnU3RkaW8gU2VydmVyJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAnc3RkaW8tc2VydmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2R1Y3QuanNvbiB0cnVzdGVkIHNlcnZlcnMgYnlwYXNzIHRoZSBVUkwgY2hlY2snLCAoKSA9PiB7XG5cdFx0XHRwcm9kdWN0U2VydmljZS50cnVzdGVkTWNwQXV0aEFjY2VzcyA9IFsndHJ1c3RlZC1odHRwLXNlcnZlciddO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkRm9yVXJsKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICd0cnVzdGVkLWh0dHAtc2VydmVyJywgJ2h0dHBzOi8vYW55dGhpbmcuZXhhbXBsZS5jb20vbWNwJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgbWFuYWdlbWVudCB0b2dnbGUgdGhhdCBvbWl0cyB0aGUgVVJMIGRvZXMgbm90IGNsZWFyIHRoZSBzdG9yZWQgYmluZGluZycsICgpID0+IHtcblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdodHRwLXNlcnZlcicsIG5hbWU6ICdIVFRQIFNlcnZlcicsIGFsbG93ZWQ6IHRydWUsIHVybDogc2VydmVyVXJsIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB0aGUgbWFuYWdlbWVudCBVSSB0b2dnbGluZyBhY2Nlc3Mgd2l0aG91dCBrbm93bGVkZ2Ugb2YgdGhlIFVSTC5cblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdodHRwLXNlcnZlcicsIG5hbWU6ICdIVFRQIFNlcnZlcicsIGFsbG93ZWQ6IHRydWUgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHN0b3JlZCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJylcblx0XHRcdFx0LmZpbmQocyA9PiBzLmlkID09PSAnaHR0cC1zZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZWQ/LnVybCwgc2VydmVyVXJsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkRm9yVXJsKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsICdodHRwLXNlcnZlcicsIHNlcnZlclVybCksIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVhZEFsbG93ZWRNY3BTZXJ2ZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgd2hlbiBubyBkYXRhIGV4aXN0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHN0b3JlZCBNQ1Agc2VydmVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlcnM6IEFsbG93ZWRNY3BTZXJ2ZXJbXSA9IFtcblx0XHRcdFx0eyBpZDogJ3NlcnZlcjEnLCBuYW1lOiAnU2VydmVyIDEnLCBhbGxvd2VkOiB0cnVlIH0sXG5cdFx0XHRcdHsgaWQ6ICdzZXJ2ZXIyJywgbmFtZTogJ1NlcnZlciAyJywgYWxsb3dlZDogZmFsc2UgfVxuXHRcdFx0XTtcblxuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIHNlcnZlcnMpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pZCwgJ3NlcnZlcjEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uYWxsb3dlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLmlkLCAnc2VydmVyMicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS5hbGxvd2VkLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyB0cnVzdGVkIHNlcnZlcnMgZnJvbSBwcm9kdWN0Lmpzb24gKGFycmF5IGZvcm1hdCknLCAoKSA9PiB7XG5cdFx0XHRwcm9kdWN0U2VydmljZS50cnVzdGVkTWNwQXV0aEFjY2VzcyA9IFsndHJ1c3RlZC1zZXJ2ZXItMScsICd0cnVzdGVkLXNlcnZlci0yJ107XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cblx0XHRcdGNvbnN0IHRydXN0ZWRTZXJ2ZXIxID0gcmVzdWx0LmZpbmQocyA9PiBzLmlkID09PSAndHJ1c3RlZC1zZXJ2ZXItMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRydXN0ZWRTZXJ2ZXIxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdGVkU2VydmVyMS5hbGxvd2VkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdGVkU2VydmVyMS50cnVzdGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdGVkU2VydmVyMS5uYW1lLCAndHJ1c3RlZC1zZXJ2ZXItMScpOyAvLyBTaG91bGQgZGVmYXVsdCB0byBJRFxuXG5cdFx0XHRjb25zdCB0cnVzdGVkU2VydmVyMiA9IHJlc3VsdC5maW5kKHMgPT4gcy5pZCA9PT0gJ3RydXN0ZWQtc2VydmVyLTInKTtcblx0XHRcdGFzc2VydC5vayh0cnVzdGVkU2VydmVyMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1c3RlZFNlcnZlcjIuYWxsb3dlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ1c3RlZFNlcnZlcjIudHJ1c3RlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyB0cnVzdGVkIHNlcnZlcnMgZnJvbSBwcm9kdWN0Lmpzb24gKG9iamVjdCBmb3JtYXQpJywgKCkgPT4ge1xuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZE1jcEF1dGhBY2Nlc3MgPSB7XG5cdFx0XHRcdCdnaXRodWInOiBbJ2dpdGh1Yi1zZXJ2ZXInXSxcblx0XHRcdFx0J21pY3Jvc29mdCc6IFsnbWljcm9zb2Z0LXNlcnZlciddXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBnaXRodWJSZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdGh1YlJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdGh1YlJlc3VsdFswXS5pZCwgJ2dpdGh1Yi1zZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRodWJSZXN1bHRbMF0udHJ1c3RlZCwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IG1pY3Jvc29mdFJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnMoJ21pY3Jvc29mdCcsICd1c2VyQG1pY3Jvc29mdC5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWNyb3NvZnRSZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWNyb3NvZnRSZXN1bHRbMF0uaWQsICdtaWNyb3NvZnQtc2VydmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWljcm9zb2Z0UmVzdWx0WzBdLnRydXN0ZWQsIHRydWUpO1xuXG5cdFx0XHQvLyBQcm92aWRlciBub3QgaW4gdHJ1c3RlZCBsaXN0IHNob3VsZCByZXR1cm4gZW1wdHkgKG5vIHN0b3JlZCBzZXJ2ZXJzKVxuXHRcdFx0Y29uc3QgdW5rbm93blJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnMoJ3Vua25vd24nLCAndXNlckB1bmtub3duLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVua25vd25SZXN1bHQubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21lcmdlcyBzdG9yZWQgc2VydmVycyB3aXRoIHRydXN0ZWQgc2VydmVycyBmcm9tIHByb2R1Y3QuanNvbicsICgpID0+IHtcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRNY3BBdXRoQWNjZXNzID0gWyd0cnVzdGVkLXNlcnZlciddO1xuXG5cdFx0XHQvLyBBZGQgc29tZSBzdG9yZWQgc2VydmVyc1xuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ3N0b3JlZC1zZXJ2ZXInLCBuYW1lOiAnU3RvcmVkIFNlcnZlcicsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXG5cdFx0XHRjb25zdCB0cnVzdGVkU2VydmVyID0gcmVzdWx0LmZpbmQocyA9PiBzLmlkID09PSAndHJ1c3RlZC1zZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5vayh0cnVzdGVkU2VydmVyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnVzdGVkU2VydmVyLnRydXN0ZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydXN0ZWRTZXJ2ZXIuYWxsb3dlZCwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHN0b3JlZFNlcnZlciA9IHJlc3VsdC5maW5kKHMgPT4gcy5pZCA9PT0gJ3N0b3JlZC1zZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5vayhzdG9yZWRTZXJ2ZXIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlZFNlcnZlci50cnVzdGVkLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlZFNlcnZlci5hbGxvd2VkLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIGV4aXN0aW5nIHN0b3JlZCBzZXJ2ZXIgdG8gYmUgdHJ1c3RlZCB3aGVuIGl0IGFwcGVhcnMgaW4gcHJvZHVjdC5qc29uJywgKCkgPT4ge1xuXHRcdFx0Ly8gRmlyc3QgYWRkIGEgc2VydmVyIGFzIHN0b3JlZCAobm90IHRydXN0ZWQpXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnc2VydmVyLTEnLCBuYW1lOiAnU2VydmVyIDEnLCBhbGxvd2VkOiBmYWxzZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gVGhlbiBtYWtlIGl0IHRydXN0ZWQgdmlhIHByb2R1Y3QuanNvblxuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZE1jcEF1dGhBY2Nlc3MgPSBbJ3NlcnZlci0xJ107XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cblx0XHRcdGNvbnN0IHNlcnZlciA9IHJlc3VsdFswXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIuaWQsICdzZXJ2ZXItMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5hbGxvd2VkLCB0cnVlKTsgLy8gU2hvdWxkIGJlIG92ZXJyaWRkZW4gdG8gdHJ1ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci50cnVzdGVkLCB0cnVlKTsgLy8gU2hvdWxkIGJlIG1hcmtlZCBhcyB0cnVzdGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLm5hbWUsICdTZXJ2ZXIgMScpOyAvLyBTaG91bGQga2VlcCBleGlzdGluZyBuYW1lXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIG1hbGZvcm1lZCBKU09OIGluIHN0b3JhZ2UgZ3JhY2VmdWxseScsICgpID0+IHtcblx0XHRcdC8vIE1hbnVhbGx5IGNvcnJ1cHQgdGhlIHN0b3JhZ2Vcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdtY3BzZXJ2ZXItZ2l0aHViLXVzZXJAZXhhbXBsZS5jb20nLCAnaW52YWxpZCBqc29uJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0XHQvLyBTaG91bGQgcmV0dXJuIGVtcHR5IGFycmF5IGluc3RlYWQgb2YgdGhyb3dpbmdcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIG5vbi1hcnJheSBwcm9kdWN0Lmpzb24gY29uZmlndXJhdGlvbiBncmFjZWZ1bGx5JywgKCkgPT4ge1xuXHRcdFx0Ly8gU2V0IHVwIGludmFsaWQgY29uZmlndXJhdGlvblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRwcm9kdWN0U2VydmljZS50cnVzdGVkTWNwQXV0aEFjY2VzcyA9ICdpbnZhbGlkLXN0cmluZycgYXMgYW55O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc3RvcmVzIG5ldyBNQ1Agc2VydmVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlcnM6IEFsbG93ZWRNY3BTZXJ2ZXJbXSA9IFtcblx0XHRcdFx0eyBpZDogJ3NlcnZlcjEnLCBuYW1lOiAnU2VydmVyIDEnLCBhbGxvd2VkOiB0cnVlIH0sXG5cdFx0XHRcdHsgaWQ6ICdzZXJ2ZXIyJywgbmFtZTogJ1NlcnZlciAyJywgYWxsb3dlZDogZmFsc2UgfVxuXHRcdFx0XTtcblxuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIHNlcnZlcnMpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pZCwgJ3NlcnZlcjEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0uaWQsICdzZXJ2ZXIyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIGV4aXN0aW5nIE1DUCBzZXJ2ZXIgYWxsb3dlZCBzdGF0dXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBGaXJzdCBhZGQgYSBzZXJ2ZXJcblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdzZXJ2ZXIxJywgbmFtZTogJ1NlcnZlciAxJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gVGhlbiB1cGRhdGUgaXRzIGFsbG93ZWQgc3RhdHVzXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnc2VydmVyMScsIG5hbWU6ICdTZXJ2ZXIgMScsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5hbGxvd2VkLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIGV4aXN0aW5nIE1DUCBzZXJ2ZXIgbmFtZSB3aGVuIG5ldyBuYW1lIGlzIHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Ly8gRmlyc3QgYWRkIGEgc2VydmVyIHdpdGggZGVmYXVsdCBuYW1lXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnc2VydmVyMScsIG5hbWU6ICdzZXJ2ZXIxJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gVGhlbiB1cGRhdGUgd2l0aCBhIHByb3BlciBuYW1lXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnc2VydmVyMScsIG5hbWU6ICdNeSBTZXJ2ZXInLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5uYW1lLCAnTXkgU2VydmVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCB1cGRhdGUgbmFtZSB3aGVuIG5ldyBuYW1lIGlzIHNhbWUgYXMgSUQnLCAoKSA9PiB7XG5cdFx0XHQvLyBGaXJzdCBhZGQgYSBzZXJ2ZXIgd2l0aCBhIHByb3BlciBuYW1lXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnc2VydmVyMScsIG5hbWU6ICdNeSBTZXJ2ZXInLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBUaGVuIHRyeSB0byB1cGRhdGUgd2l0aCBJRCBhcyBuYW1lIChzaG91bGQga2VlcCBleGlzdGluZyBuYW1lKVxuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ3NlcnZlcjEnLCBuYW1lOiAnc2VydmVyMScsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5uYW1lLCAnTXkgU2VydmVyJyk7IC8vIFNob3VsZCBrZWVwIG9yaWdpbmFsIG5hbWVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uYWxsb3dlZCwgZmFsc2UpOyAvLyBCdXQgYWxsb3dlZCBzdGF0dXMgc2hvdWxkIHVwZGF0ZVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkcyBuZXcgc2VydmVycyB3aGlsZSBwcmVzZXJ2aW5nIGV4aXN0aW5nIG9uZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBGaXJzdCBhZGQgb25lIHNlcnZlclxuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ3NlcnZlcjEnLCBuYW1lOiAnU2VydmVyIDEnLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBUaGVuIGFkZCBhbm90aGVyIHNlcnZlclxuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ3NlcnZlcjInLCBuYW1lOiAnU2VydmVyIDInLCBhbGxvd2VkOiBmYWxzZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyMSA9IHJlc3VsdC5maW5kKHMgPT4gcy5pZCA9PT0gJ3NlcnZlcjEnKTtcblx0XHRcdGNvbnN0IHNlcnZlcjIgPSByZXN1bHQuZmluZChzID0+IHMuaWQgPT09ICdzZXJ2ZXIyJyk7XG5cdFx0XHRhc3NlcnQub2soc2VydmVyMSk7XG5cdFx0XHRhc3NlcnQub2soc2VydmVyMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyMS5hbGxvd2VkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIyLmFsbG93ZWQsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHN0b3JlIHRydXN0ZWQgc2VydmVycyBmcm9tIHByb2R1Y3QuanNvbicsICgpID0+IHtcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRNY3BBdXRoQWNjZXNzID0gWyd0cnVzdGVkLXNlcnZlciddO1xuXG5cdFx0XHQvLyBUcnkgdG8gdXBkYXRlIGEgdHJ1c3RlZCBzZXJ2ZXJcblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICd0cnVzdGVkLXNlcnZlcicsIG5hbWU6ICdUcnVzdGVkIFNlcnZlcicsIGFsbG93ZWQ6IGZhbHNlLCB0cnVzdGVkOiB0cnVlIH0sXG5cdFx0XHRcdHsgaWQ6ICd1c2VyLXNlcnZlcicsIG5hbWU6ICdVc2VyIFNlcnZlcicsIGFsbG93ZWQ6IHRydWUgfVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIENoZWNrIHdoYXQncyBhY3R1YWxseSBzdG9yZWQgaW4gc3RvcmFnZSAobm90IGluY2x1ZGluZyBwcm9kdWN0Lmpzb24gc2VydmVycylcblx0XHRcdGNvbnN0IHN0b3JhZ2VLZXkgPSAnbWNwc2VydmVyLWdpdGh1Yi11c2VyQGV4YW1wbGUuY29tJztcblx0XHRcdGNvbnN0IHN0b3JlZERhdGEgPSBKU09OLnBhcnNlKHN0b3JhZ2VTZXJ2aWNlLmdldChzdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pIHx8ICdbXScpO1xuXG5cdFx0XHQvLyBTaG91bGQgb25seSBjb250YWluIHRoZSB1c2VyLW1hbmFnZWQgc2VydmVyLCBub3QgdGhlIHRydXN0ZWQgb25lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmVkRGF0YS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlZERhdGFbMF0uaWQsICd1c2VyLXNlcnZlcicpO1xuXG5cdFx0XHQvLyBCdXQgcmVhZEFsbG93ZWRNY3BTZXJ2ZXJzIHNob3VsZCByZXR1cm4gYm90aCAoaW5jbHVkaW5nIHRydXN0ZWQgZnJvbSBwcm9kdWN0Lmpzb24pXG5cdFx0XHRjb25zdCBhbGxTZXJ2ZXJzID0gYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhbGxTZXJ2ZXJzLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZXJzaXN0cyBhZ2VudEhvc3QgbWV0YWRhdGEgYW5kIHByZXNlcnZlcyBpdCB3aGVuIGEgbGF0ZXIgdG9nZ2xlIG9taXRzIGl0JywgKCkgPT4ge1xuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ2FnZW50LWhvc3QtbWNwOnJlbW90ZS9HaXRIdWIvaHR0cHM6Ly9hcGkuZXhhbXBsZS9tY3AnLCBuYW1lOiAnR2l0SHViJywgYWxsb3dlZDogdHJ1ZSwgdXJsOiAnaHR0cHM6Ly9hcGkuZXhhbXBsZS9tY3AnLCBhZ2VudEhvc3Q6IHsgYXV0aG9yaXR5OiAncmVtb3RlJywgbGFiZWw6ICdTU0g6IG15LWhvc3QnIH0gfVxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIEEgbWFuYWdlbWVudCB0b2dnbGUgKG5vIGFnZW50SG9zdC91cmwpIG11c3Qgbm90IGNsZWFyIHRoZSBzdG9yZWQgbWV0YWRhdGEuXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnYWdlbnQtaG9zdC1tY3A6cmVtb3RlL0dpdEh1Yi9odHRwczovL2FwaS5leGFtcGxlL21jcCcsIG5hbWU6ICdHaXRIdWInLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzdG9yZWQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpXG5cdFx0XHRcdC5maW5kKHMgPT4gcy5pZCA9PT0gJ2FnZW50LWhvc3QtbWNwOnJlbW90ZS9HaXRIdWIvaHR0cHM6Ly9hcGkuZXhhbXBsZS9tY3AnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RvcmVkPy5hZ2VudEhvc3QsIHsgYXV0aG9yaXR5OiAncmVtb3RlJywgbGFiZWw6ICdTU0g6IG15LWhvc3QnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2VNY3BTZXNzaW9uQWNjZXNzIGV2ZW50JywgKCkgPT4ge1xuXHRcdFx0bGV0IGV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdGxldCBldmVudERhdGE6IHsgcHJvdmlkZXJJZDogc3RyaW5nOyBhY2NvdW50TmFtZTogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2Uub25EaWRDaGFuZ2VNY3BTZXNzaW9uQWNjZXNzKGV2ZW50ID0+IHtcblx0XHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0XHRcdGV2ZW50RGF0YSA9IGV2ZW50O1xuXHRcdFx0fSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdFx0eyBpZDogJ3NlcnZlcjEnLCBuYW1lOiAnU2VydmVyIDEnLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RmlyZWQsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQub2soZXZlbnREYXRhKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RGF0YS5wcm92aWRlcklkLCAnZ2l0aHViJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudERhdGEuYWNjb3VudE5hbWUsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlbW92ZUFsbG93ZWRNY3BTZXJ2ZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbW92ZXMgYWxsIHN0b3JlZCBNQ1Agc2VydmVycyBmb3IgYWNjb3VudCcsICgpID0+IHtcblx0XHRcdC8vIEZpcnN0IGFkZCBzb21lIHNlcnZlcnNcblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICdzZXJ2ZXIxJywgbmFtZTogJ1NlcnZlciAxJywgYWxsb3dlZDogdHJ1ZSB9LFxuXHRcdFx0XHR7IGlkOiAnc2VydmVyMicsIG5hbWU6ICdTZXJ2ZXIgMicsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhleSBleGlzdFxuXHRcdFx0bGV0IHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cblx0XHRcdC8vIFJlbW92ZSB0aGVtXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVtb3ZlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGV5J3JlIGdvbmVcblx0XHRcdHJlc3VsdCA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBhZmZlY3QgdHJ1c3RlZCBzZXJ2ZXJzIGZyb20gcHJvZHVjdC5qc29uJywgKCkgPT4ge1xuXHRcdFx0cHJvZHVjdFNlcnZpY2UudHJ1c3RlZE1jcEF1dGhBY2Nlc3MgPSBbJ3RydXN0ZWQtc2VydmVyJ107XG5cblx0XHRcdC8vIEFkZCBzb21lIHVzZXItbWFuYWdlZCBzZXJ2ZXJzXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAndXNlci1zZXJ2ZXInLCBuYW1lOiAnVXNlciBTZXJ2ZXInLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBWZXJpZnkgYm90aCB0cnVzdGVkIGFuZCB1c2VyIHNlcnZlcnMgZXhpc3Rcblx0XHRcdGxldCByZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXG5cdFx0XHQvLyBSZW1vdmUgdXNlciBzZXJ2ZXJzXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVtb3ZlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cblx0XHRcdC8vIFNob3VsZCBzdGlsbCBoYXZlIHRydXN0ZWQgc2VydmVyXG5cdFx0XHRyZXN1bHQgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UucmVhZEFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pZCwgJ3RydXN0ZWQtc2VydmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnRydXN0ZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2VNY3BTZXNzaW9uQWNjZXNzIGV2ZW50JywgKCkgPT4ge1xuXHRcdFx0bGV0IGV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdGxldCBldmVudERhdGE6IHsgcHJvdmlkZXJJZDogc3RyaW5nOyBhY2NvdW50TmFtZTogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2Uub25EaWRDaGFuZ2VNY3BTZXNzaW9uQWNjZXNzKGV2ZW50ID0+IHtcblx0XHRcdFx0ZXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0XHRcdGV2ZW50RGF0YSA9IGV2ZW50O1xuXHRcdFx0fSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZW1vdmVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRGaXJlZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5vayhldmVudERhdGEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnREYXRhLnByb3ZpZGVySWQsICdnaXRodWInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50RGF0YS5hY2NvdW50TmFtZSwgJ3VzZXJAZXhhbXBsZS5jb20nKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyByZW1vdmFsIG9mIG5vbi1leGlzdGVudCBkYXRhIGdyYWNlZnVsbHknLCAoKSA9PiB7XG5cdFx0XHQvLyBTaG91bGQgbm90IHRocm93IHdoZW4gdHJ5aW5nIHRvIHJlbW92ZSBkYXRhIHRoYXQgZG9lc24ndCBleGlzdFxuXHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5yZW1vdmVBbGxvd2VkTWNwU2VydmVycygnbm9uZXhpc3RlbnQnLCAndXNlckBleGFtcGxlLmNvbScpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdvbkRpZENoYW5nZU1jcFNlc3Npb25BY2Nlc3MgZXZlbnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZXZlbnQgaXMgZmlyZWQgZm9yIGVhY2ggdXBkYXRlIG9wZXJhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50czogQXJyYXk8eyBwcm92aWRlcklkOiBzdHJpbmc7IGFjY291bnROYW1lOiBzdHJpbmcgfT4gPSBbXTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5vbkRpZENoYW5nZU1jcFNlc3Npb25BY2Nlc3MoZXZlbnQgPT4ge1xuXHRcdFx0XHRldmVudHMucHVzaChldmVudCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gU2hvdWxkIGZpcmUgZm9yIHVwZGF0ZVxuXHRcdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHRcdHsgaWQ6ICdzZXJ2ZXIxJywgbmFtZTogJ1NlcnZlciAxJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdC8vIFNob3VsZCBmaXJlIGZvciByZW1vdmVcblx0XHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnJlbW92ZUFsbG93ZWRNY3BTZXJ2ZXJzKCdnaXRodWInLCAndXNlckBleGFtcGxlLmNvbScpO1xuXG5cdFx0XHRcdC8vIFNob3VsZCBmaXJlIGZvciBkaWZmZXJlbnQgYWNjb3VudFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ21pY3Jvc29mdCcsICdhZG1pbkBjb21wYW55LmNvbScsIFtcblx0XHRcdFx0XHR7IGlkOiAnc2VydmVyMicsIG5hbWU6ICdTZXJ2ZXIgMicsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzWzBdLnByb3ZpZGVySWQsICdnaXRodWInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5hY2NvdW50TmFtZSwgJ3VzZXJAZXhhbXBsZS5jb20nKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1sxXS5wcm92aWRlcklkLCAnZ2l0aHViJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMV0uYWNjb3VudE5hbWUsICd1c2VyQGV4YW1wbGUuY29tJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMl0ucHJvdmlkZXJJZCwgJ21pY3Jvc29mdCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzWzJdLmFjY291bnROYW1lLCAnYWRtaW5AY29tcGFueS5jb20nKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgbGlzdGVuZXJzIHJlY2VpdmUgZXZlbnRzJywgKCkgPT4ge1xuXHRcdFx0bGV0IGxpc3RlbmVyMUZpcmVkID0gZmFsc2U7XG5cdFx0XHRsZXQgbGlzdGVuZXIyRmlyZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZTEgPSBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2Uub25EaWRDaGFuZ2VNY3BTZXNzaW9uQWNjZXNzKCgpID0+IHtcblx0XHRcdFx0bGlzdGVuZXIxRmlyZWQgPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUyID0gYXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLm9uRGlkQ2hhbmdlTWNwU2Vzc2lvbkFjY2VzcygoKSA9PiB7XG5cdFx0XHRcdGxpc3RlbmVyMkZpcmVkID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHRcdHsgaWQ6ICdzZXJ2ZXIxJywgbmFtZTogJ1NlcnZlciAxJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0ZW5lcjFGaXJlZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0ZW5lcjJGaXJlZCwgdHJ1ZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkaXNwb3NhYmxlMS5kaXNwb3NlKCk7XG5cdFx0XHRcdGRpc3Bvc2FibGUyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ludGVncmF0aW9uIHNjZW5hcmlvcycsICgpID0+IHtcblx0XHR0ZXN0KCdjb21wbGV0ZSB3b3JrZmxvdzogYWRkLCB1cGRhdGUsIHF1ZXJ5LCByZW1vdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlcklkID0gJ2dpdGh1Yic7XG5cdFx0XHRjb25zdCBhY2NvdW50TmFtZSA9ICd1c2VyQGV4YW1wbGUuY29tJztcblx0XHRcdGNvbnN0IHNlcnZlcklkID0gJ3Rlc3Qtc2VydmVyJztcblxuXHRcdFx0Ly8gSW5pdGlhbGx5IHVua25vd25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZChwcm92aWRlcklkLCBhY2NvdW50TmFtZSwgc2VydmVySWQpLFxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHRcdCk7XG5cblx0XHRcdC8vIEFkZCBzZXJ2ZXIgYXMgYWxsb3dlZFxuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKHByb3ZpZGVySWQsIGFjY291bnROYW1lLCBbXG5cdFx0XHRcdHsgaWQ6IHNlcnZlcklkLCBuYW1lOiAnVGVzdCBTZXJ2ZXInLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQocHJvdmlkZXJJZCwgYWNjb3VudE5hbWUsIHNlcnZlcklkKSxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVXBkYXRlIHRvIGRpc2FsbG93ZWRcblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycyhwcm92aWRlcklkLCBhY2NvdW50TmFtZSwgW1xuXHRcdFx0XHR7IGlkOiBzZXJ2ZXJJZCwgbmFtZTogJ1Rlc3QgU2VydmVyJywgYWxsb3dlZDogZmFsc2UgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZChwcm92aWRlcklkLCBhY2NvdW50TmFtZSwgc2VydmVySWQpLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gUmVtb3ZlIGFsbFxuXHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLnJlbW92ZUFsbG93ZWRNY3BTZXJ2ZXJzKHByb3ZpZGVySWQsIGFjY291bnROYW1lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKHByb3ZpZGVySWQsIGFjY291bnROYW1lLCBzZXJ2ZXJJZCksXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIHByb3ZpZGVycyBhbmQgYWNjb3VudHMgYXJlIGlzb2xhdGVkJywgKCkgPT4ge1xuXHRcdFx0Ly8gQWRkIGRhdGEgZm9yIGRpZmZlcmVudCBjb21iaW5hdGlvbnNcblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXIxQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnc2VydmVyMScsIG5hbWU6ICdTZXJ2ZXIgMScsIGFsbG93ZWQ6IHRydWUgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXIyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAnc2VydmVyMScsIG5hbWU6ICdTZXJ2ZXIgMScsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ21pY3Jvc29mdCcsICd1c2VyMUBleGFtcGxlLmNvbScsIFtcblx0XHRcdFx0eyBpZDogJ3NlcnZlcjEnLCBuYW1lOiAnU2VydmVyIDEnLCBhbGxvd2VkOiB0cnVlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBWZXJpZnkgaXNvbGF0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ2dpdGh1YicsICd1c2VyMUBleGFtcGxlLmNvbScsICdzZXJ2ZXIxJyksXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ2dpdGh1YicsICd1c2VyMkBleGFtcGxlLmNvbScsICdzZXJ2ZXIxJyksXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkKCdtaWNyb3NvZnQnLCAndXNlcjFAZXhhbXBsZS5jb20nLCAnc2VydmVyMScpLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBOb24tZXhpc3RlbnQgY29tYmluYXRpb25zIHNob3VsZCByZXR1cm4gdW5kZWZpbmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ21pY3Jvc29mdCcsICd1c2VyMkBleGFtcGxlLmNvbScsICdzZXJ2ZXIxJyksXG5cdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2R1Y3QuanNvbiBjb25maWd1cmF0aW9uIHRha2VzIHByZWNlZGVuY2UgaW4gYWxsIHNjZW5hcmlvcycsICgpID0+IHtcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRNY3BBdXRoQWNjZXNzID0ge1xuXHRcdFx0XHQnZ2l0aHViJzogWyd0cnVzdGVkLXNlcnZlciddLFxuXHRcdFx0XHQnbWljcm9zb2Z0JzogWydtaWNyb3NvZnQtdHJ1c3RlZCddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBUcnVzdGVkIHNlcnZlcnMgc2hvdWxkIGFsd2F5cyByZXR1cm4gdHJ1ZSByZWdhcmRsZXNzIG9mIHN0b3JhZ2Vcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCAndHJ1c3RlZC1zZXJ2ZXInKSxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVHJ5IHRvIG92ZXJyaWRlIHZpYSBzdG9yYWdlXG5cdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHR7IGlkOiAndHJ1c3RlZC1zZXJ2ZXInLCBuYW1lOiAnVHJ1c3RlZCBTZXJ2ZXInLCBhbGxvd2VkOiBmYWxzZSB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gU2hvdWxkIHN0aWxsIHJldHVybiB0cnVlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgJ3RydXN0ZWQtc2VydmVyJyksXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cblx0XHRcdC8vIEJ1dCBub24tdHJ1c3RlZCBzZXJ2ZXJzIHNob3VsZCBzdGlsbCByZXNwZWN0IHN0b3JhZ2Vcblx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXG5cdFx0XHRcdHsgaWQ6ICd1c2VyLXNlcnZlcicsIG5hbWU6ICdVc2VyIFNlcnZlcicsIGFsbG93ZWQ6IGZhbHNlIH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWQoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgJ3VzZXItc2VydmVyJyksXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBlZGdlIGNhc2VzIHdpdGggZW1wdHkgb3IgbnVsbCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBFbXB0eSBwcm92aWRlci9hY2NvdW50IG5hbWVzXG5cdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLmlzQWNjZXNzQWxsb3dlZCgnJywgJycsICdzZXJ2ZXIxJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRW1wdHkgc2VydmVyIGFycmF5c1xuXHRcdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiB7XG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS51cGRhdGVBbGxvd2VkTWNwU2VydmVycygnZ2l0aHViJywgJ3VzZXJAZXhhbXBsZS5jb20nLCBbXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRW1wdHkgc2VydmVyIElEL25hbWVcblx0XHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4ge1xuXHRcdFx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMoJ2dpdGh1YicsICd1c2VyQGV4YW1wbGUuY29tJywgW1xuXHRcdFx0XHRcdHsgaWQ6ICcnLCBuYW1lOiAnJywgYWxsb3dlZDogdHJ1ZSB9XG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5c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
