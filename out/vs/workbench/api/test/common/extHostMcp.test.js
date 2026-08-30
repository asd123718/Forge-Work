import * as assert from "assert";
import * as sinon from "sinon";
import { LogLevel } from "../../../../platform/log/common/log.js";
import { createAuthMetadata } from "../../common/extHostMcp.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
const TEST_MCP_URL = "https://example.com/mcp";
const TEST_AUTH_SERVER = "https://auth.example.com";
const TEST_RESOURCE_METADATA_URL = "https://example.com/.well-known/oauth-protected-resource";
function createMockResponse(options) {
  const headers = new Headers(options.headers ?? {});
  return {
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    url: options.url ?? TEST_MCP_URL,
    headers,
    body: null,
    json: async () => JSON.parse(options.body ?? "{}"),
    text: async () => options.body ?? ""
  };
}
async function createTestAuthMetadata(options) {
  const logMessages = [];
  const mockLogger = (level, message) => logMessages.push({ level, message });
  const issuer = options.serverMetadataIssuer ?? TEST_AUTH_SERVER;
  const mockFetch = sinon.stub();
  mockFetch.onCall(0).resolves(createMockResponse({
    status: 200,
    url: TEST_RESOURCE_METADATA_URL,
    body: JSON.stringify(options.resourceMetadata ?? {
      resource: TEST_MCP_URL,
      authorization_servers: [issuer]
    })
  }));
  mockFetch.onCall(1).resolves(createMockResponse({
    status: 200,
    url: `${issuer}/.well-known/oauth-authorization-server`,
    body: JSON.stringify({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      response_types_supported: ["code"]
    })
  }));
  const wwwAuthHeader = options.scopes ? `Bearer scope="${options.scopes.join(" ")}"` : 'Bearer realm="example"';
  const originalResponse = createMockResponse({
    status: 401,
    url: TEST_MCP_URL,
    headers: {
      "WWW-Authenticate": wwwAuthHeader
    }
  });
  const authMetadata = await createAuthMetadata(
    TEST_MCP_URL,
    originalResponse.headers,
    {
      sameOriginHeaders: {},
      fetch: mockFetch,
      log: mockLogger
    }
  );
  return { authMetadata, logMessages };
}
suite("ExtHostMcp", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("IAuthMetadata", () => {
    suite("properties", () => {
      test("should expose readonly properties", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read", "write"],
          serverMetadataIssuer: TEST_AUTH_SERVER
        });
        assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));
        assert.strictEqual(authMetadata.serverMetadata.issuer, TEST_AUTH_SERVER);
        assert.deepStrictEqual(authMetadata.scopes, ["read", "write"]);
      });
      test("should allow undefined scopes", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        assert.strictEqual(authMetadata.scopes, void 0);
      });
    });
    suite("update()", () => {
      test("should return true and update scopes when WWW-Authenticate header contains new scopes", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read"]
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="read write admin"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, true);
        assert.deepStrictEqual(authMetadata.scopes, ["read", "write", "admin"]);
      });
      test("should return false when scopes are the same", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read", "write"]
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="read write"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, false);
        assert.deepStrictEqual(authMetadata.scopes, ["read", "write"]);
      });
      test("should return false when scopes are same but in different order", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read", "write"]
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="write read"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, false);
      });
      test("should return true when updating from undefined scopes to defined scopes", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="read"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, true);
        assert.deepStrictEqual(authMetadata.scopes, ["read"]);
      });
      test("should return true when updating from defined scopes to undefined (no scope in header)", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: ["read"]
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer realm="example"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, true);
        assert.strictEqual(authMetadata.scopes, void 0);
      });
      test("should return false when no WWW-Authenticate header and scopes are already undefined", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        const response = createMockResponse({
          status: 401,
          headers: {}
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, false);
      });
      test("should handle multiple Bearer challenges and use first scope", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Bearer scope="first", Bearer scope="second"'
          }
        });
        authMetadata.update(response.headers);
        assert.deepStrictEqual(authMetadata.scopes, ["first"]);
      });
      test("should ignore non-Bearer schemes", async () => {
        const { authMetadata } = await createTestAuthMetadata({
          scopes: void 0
        });
        const response = createMockResponse({
          status: 401,
          headers: {
            "WWW-Authenticate": 'Basic realm="example"'
          }
        });
        const result = authMetadata.update(response.headers);
        assert.strictEqual(result, false);
        assert.strictEqual(authMetadata.scopes, void 0);
      });
    });
  });
  suite("createAuthMetadata", () => {
    let sandbox;
    let logMessages;
    let mockLogger;
    setup(() => {
      sandbox = sinon.createSandbox();
      logMessages = [];
      mockLogger = (level, message) => logMessages.push({ level, message });
    });
    teardown(() => {
      sandbox.restore();
    });
    test("should create IAuthMetadata with fetched server metadata", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER],
          scopes_supported: ["read", "write"]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer scope="api.read"'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: { "X-Custom": "value" },
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));
      assert.strictEqual(authMetadata.serverMetadata.issuer, TEST_AUTH_SERVER);
      assert.deepStrictEqual(authMetadata.scopes, ["api.read"]);
    });
    test("should fall back to default metadata when server metadata fetch fails", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).rejects(new Error("Network error"));
      mockFetch.onCall(1).rejects(new Error("Network error"));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {}
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer.toString().startsWith("https://example.com"));
      assert.ok(authMetadata.serverMetadata.issuer.startsWith("https://example.com"));
      assert.ok(authMetadata.serverMetadata.authorization_endpoint?.startsWith("https://example.com/authorize"));
      assert.ok(authMetadata.serverMetadata.token_endpoint?.startsWith("https://example.com/token"));
      assert.ok(logMessages.some(
        (m) => m.level === LogLevel.Info && m.message.includes("Using default auth metadata")
      ));
    });
    test("should use scopes from WWW-Authenticate header when resource metadata has none", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer scope="header.scope"'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.deepStrictEqual(authMetadata.scopes, ["header.scope"]);
    });
    test("should use scopes from WWW-Authenticate header even when resource metadata has scopes_supported", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER],
          scopes_supported: ["resource.scope1", "resource.scope2"]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer scope="header.scope"'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.deepStrictEqual(authMetadata.scopes, ["header.scope"]);
    });
    test("should use resource_metadata challenge URL from WWW-Authenticate header", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: "https://example.com/custom-resource-metadata",
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer resource_metadata="https://example.com/custom-resource-metadata"'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer.toString().startsWith(TEST_AUTH_SERVER));
      assert.ok(logMessages.some(
        (m) => m.level === LogLevel.Debug && m.message.includes("resource_metadata challenge")
      ));
    });
    test("should pass launch headers when fetching metadata from same origin", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {}
      });
      const launchHeaders = {
        "Authorization": "Bearer existing-token",
        "X-Custom-Header": "custom-value"
      };
      await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: launchHeaders,
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(mockFetch.called, "fetch should have been called");
      const firstCallArgs = mockFetch.firstCall.args;
      assert.ok(firstCallArgs.length >= 2, "fetch should have been called with options");
      const fetchOptions = firstCallArgs[1];
      assert.ok(fetchOptions.headers, "fetch options should include headers");
    });
    test("should handle empty scope string in WWW-Authenticate header", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          "WWW-Authenticate": 'Bearer scope=""'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(
        authMetadata.scopes === void 0 || Array.isArray(authMetadata.scopes) && authMetadata.scopes.length === 0 || Array.isArray(authMetadata.scopes) && authMetadata.scopes.every((s) => s === ""),
        "Empty scope string should be handled gracefully"
      );
    });
    test("should handle malformed WWW-Authenticate header gracefully", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: JSON.stringify({
          resource: TEST_MCP_URL,
          authorization_servers: [TEST_AUTH_SERVER]
        })
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: `${TEST_AUTH_SERVER}/.well-known/oauth-authorization-server`,
        body: JSON.stringify({
          issuer: TEST_AUTH_SERVER,
          authorization_endpoint: `${TEST_AUTH_SERVER}/authorize`,
          token_endpoint: `${TEST_AUTH_SERVER}/token`,
          response_types_supported: ["code"]
        })
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {
          // Malformed header - missing closing quote
          "WWW-Authenticate": 'Bearer scope="unclosed'
        }
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer);
      assert.ok(authMetadata.serverMetadata);
    });
    test("should handle invalid JSON in resource metadata response", async () => {
      const mockFetch = sandbox.stub();
      mockFetch.onCall(0).resolves(createMockResponse({
        status: 200,
        url: TEST_RESOURCE_METADATA_URL,
        body: "not valid json {"
      }));
      mockFetch.onCall(1).resolves(createMockResponse({
        status: 200,
        url: "https://example.com/.well-known/oauth-authorization-server",
        body: "{ invalid }"
      }));
      const originalResponse = createMockResponse({
        status: 401,
        url: TEST_MCP_URL,
        headers: {}
      });
      const authMetadata = await createAuthMetadata(
        TEST_MCP_URL,
        originalResponse.headers,
        {
          sameOriginHeaders: {},
          fetch: mockFetch,
          log: mockLogger
        }
      );
      assert.ok(authMetadata.authorizationServer);
      assert.ok(authMetadata.serverMetadata);
    });
    test("should handle non-401 status codes in update()", async () => {
      const { authMetadata } = await createTestAuthMetadata({
        scopes: ["read"]
      });
      const response = createMockResponse({
        status: 403,
        headers: {
          "WWW-Authenticate": 'Bearer scope="new.scope"'
        }
      });
      const result = authMetadata.update(response.headers);
      assert.strictEqual(typeof result, "boolean");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcY29tbW9uXFxleHRIb3N0TWNwLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgY3JlYXRlQXV0aE1ldGFkYXRhLCBDb21tb25SZXNwb25zZSwgSUF1dGhNZXRhZGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0TWNwLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG4vLyBUZXN0IGNvbnN0YW50cyB0byBhdm9pZCBtYWdpYyBzdHJpbmdzXG5jb25zdCBURVNUX01DUF9VUkwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9tY3AnO1xuY29uc3QgVEVTVF9BVVRIX1NFUlZFUiA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuY29uc3QgVEVTVF9SRVNPVVJDRV9NRVRBREFUQV9VUkwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBtb2NrIENvbW1vblJlc3BvbnNlIGZvciB0ZXN0aW5nLlxuICovXG5mdW5jdGlvbiBjcmVhdGVNb2NrUmVzcG9uc2Uob3B0aW9uczoge1xuXHRzdGF0dXM/OiBudW1iZXI7XG5cdHN0YXR1c1RleHQ/OiBzdHJpbmc7XG5cdHVybD86IHN0cmluZztcblx0aGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdGJvZHk/OiBzdHJpbmc7XG59KTogQ29tbW9uUmVzcG9uc2Uge1xuXHRjb25zdCBoZWFkZXJzID0gbmV3IEhlYWRlcnMob3B0aW9ucy5oZWFkZXJzID8/IHt9KTtcblx0cmV0dXJuIHtcblx0XHRzdGF0dXM6IG9wdGlvbnMuc3RhdHVzID8/IDIwMCxcblx0XHRzdGF0dXNUZXh0OiBvcHRpb25zLnN0YXR1c1RleHQgPz8gJ09LJyxcblx0XHR1cmw6IG9wdGlvbnMudXJsID8/IFRFU1RfTUNQX1VSTCxcblx0XHRoZWFkZXJzLFxuXHRcdGJvZHk6IG51bGwsXG5cdFx0anNvbjogYXN5bmMgKCkgPT4gSlNPTi5wYXJzZShvcHRpb25zLmJvZHkgPz8gJ3t9JyksXG5cdFx0dGV4dDogYXN5bmMgKCkgPT4gb3B0aW9ucy5ib2R5ID8/ICcnLFxuXHR9O1xufVxuXG4vKipcbiAqIEhlbHBlciB0byBjcmVhdGUgYW4gSUF1dGhNZXRhZGF0YSBpbnN0YW5jZSBmb3IgdGVzdGluZyB2aWEgdGhlIGZhY3RvcnkgZnVuY3Rpb24uXG4gKiBVc2VzIGEgbW9jayBmZXRjaCB0aGF0IHJldHVybnMgdGhlIHByb3ZpZGVkIHNlcnZlciBtZXRhZGF0YS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gY3JlYXRlVGVzdEF1dGhNZXRhZGF0YShvcHRpb25zOiB7XG5cdHNjb3Blcz86IHN0cmluZ1tdO1xuXHRzZXJ2ZXJNZXRhZGF0YUlzc3Vlcj86IHN0cmluZztcblx0cmVzb3VyY2VNZXRhZGF0YT86IHsgcmVzb3VyY2U6IHN0cmluZzsgYXV0aG9yaXphdGlvbl9zZXJ2ZXJzPzogc3RyaW5nW107IHNjb3Blc19zdXBwb3J0ZWQ/OiBzdHJpbmdbXSB9O1xufSk6IFByb21pc2U8eyBhdXRoTWV0YWRhdGE6IElBdXRoTWV0YWRhdGE7IGxvZ01lc3NhZ2VzOiBBcnJheTx7IGxldmVsOiBMb2dMZXZlbDsgbWVzc2FnZTogc3RyaW5nIH0+IH0+IHtcblx0Y29uc3QgbG9nTWVzc2FnZXM6IEFycmF5PHsgbGV2ZWw6IExvZ0xldmVsOyBtZXNzYWdlOiBzdHJpbmcgfT4gPSBbXTtcblx0Y29uc3QgbW9ja0xvZ2dlciA9IChsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZykgPT4gbG9nTWVzc2FnZXMucHVzaCh7IGxldmVsLCBtZXNzYWdlIH0pO1xuXG5cdGNvbnN0IGlzc3VlciA9IG9wdGlvbnMuc2VydmVyTWV0YWRhdGFJc3N1ZXIgPz8gVEVTVF9BVVRIX1NFUlZFUjtcblxuXHRjb25zdCBtb2NrRmV0Y2ggPSBzaW5vbi5zdHViKCk7XG5cblx0Ly8gTW9jayByZXNvdXJjZSBtZXRhZGF0YSBmZXRjaFxuXHRtb2NrRmV0Y2gub25DYWxsKDApLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0c3RhdHVzOiAyMDAsXG5cdFx0dXJsOiBURVNUX1JFU09VUkNFX01FVEFEQVRBX1VSTCxcblx0XHRib2R5OiBKU09OLnN0cmluZ2lmeShvcHRpb25zLnJlc291cmNlTWV0YWRhdGEgPz8ge1xuXHRcdFx0cmVzb3VyY2U6IFRFU1RfTUNQX1VSTCxcblx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogW2lzc3Vlcl1cblx0XHR9KVxuXHR9KSk7XG5cblx0Ly8gTW9jayBzZXJ2ZXIgbWV0YWRhdGEgZmV0Y2hcblx0bW9ja0ZldGNoLm9uQ2FsbCgxKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdHN0YXR1czogMjAwLFxuXHRcdHVybDogYCR7aXNzdWVyfS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcmAsXG5cdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0aXNzdWVyLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogYCR7aXNzdWVyfS9hdXRob3JpemVgLFxuXHRcdFx0dG9rZW5fZW5kcG9pbnQ6IGAke2lzc3Vlcn0vdG9rZW5gLFxuXHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdH0pXG5cdH0pKTtcblxuXHRjb25zdCB3d3dBdXRoSGVhZGVyID0gb3B0aW9ucy5zY29wZXNcblx0XHQ/IGBCZWFyZXIgc2NvcGU9XCIke29wdGlvbnMuc2NvcGVzLmpvaW4oJyAnKX1cImBcblx0XHQ6ICdCZWFyZXIgcmVhbG09XCJleGFtcGxlXCInO1xuXG5cdGNvbnN0IG9yaWdpbmFsUmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdHN0YXR1czogNDAxLFxuXHRcdHVybDogVEVTVF9NQ1BfVVJMLFxuXHRcdGhlYWRlcnM6IHtcblx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogd3d3QXV0aEhlYWRlclxuXHRcdH1cblx0fSk7XG5cblx0Y29uc3QgYXV0aE1ldGFkYXRhID0gYXdhaXQgY3JlYXRlQXV0aE1ldGFkYXRhKFxuXHRcdFRFU1RfTUNQX1VSTCxcblx0XHRvcmlnaW5hbFJlc3BvbnNlLmhlYWRlcnMsXG5cdFx0e1xuXHRcdFx0c2FtZU9yaWdpbkhlYWRlcnM6IHt9LFxuXHRcdFx0ZmV0Y2g6IG1vY2tGZXRjaCxcblx0XHRcdGxvZzogbW9ja0xvZ2dlclxuXHRcdH1cblx0KTtcblxuXHRyZXR1cm4geyBhdXRoTWV0YWRhdGEsIGxvZ01lc3NhZ2VzIH07XG59XG5cbnN1aXRlKCdFeHRIb3N0TWNwJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnSUF1dGhNZXRhZGF0YScsICgpID0+IHtcblx0XHRzdWl0ZSgncHJvcGVydGllcycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCBleHBvc2UgcmVhZG9ubHkgcHJvcGVydGllcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBhdXRoTWV0YWRhdGEgfSA9IGF3YWl0IGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEoe1xuXHRcdFx0XHRcdHNjb3BlczogWydyZWFkJywgJ3dyaXRlJ10sXG5cdFx0XHRcdFx0c2VydmVyTWV0YWRhdGFJc3N1ZXI6IFRFU1RfQVVUSF9TRVJWRVJcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5hdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKCkuc3RhcnRzV2l0aChURVNUX0FVVEhfU0VSVkVSKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRoTWV0YWRhdGEuc2VydmVyTWV0YWRhdGEuaXNzdWVyLCBURVNUX0FVVEhfU0VSVkVSKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdXRoTWV0YWRhdGEuc2NvcGVzLCBbJ3JlYWQnLCAnd3JpdGUnXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGFsbG93IHVuZGVmaW5lZCBzY29wZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0XHRzY29wZXM6IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNjb3BlcywgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3VwZGF0ZSgpJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGFuZCB1cGRhdGUgc2NvcGVzIHdoZW4gV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgY29udGFpbnMgbmV3IHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBhdXRoTWV0YWRhdGEgfSA9IGF3YWl0IGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEoe1xuXHRcdFx0XHRcdHNjb3BlczogWydyZWFkJ11cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogJ0JlYXJlciBzY29wZT1cInJlYWQgd3JpdGUgYWRtaW5cIidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhNZXRhZGF0YS51cGRhdGUocmVzcG9uc2UuaGVhZGVycyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNjb3BlcywgWydyZWFkJywgJ3dyaXRlJywgJ2FkbWluJ10pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZmFsc2Ugd2hlbiBzY29wZXMgYXJlIHRoZSBzYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGF1dGhNZXRhZGF0YSB9ID0gYXdhaXQgY3JlYXRlVGVzdEF1dGhNZXRhZGF0YSh7XG5cdFx0XHRcdFx0c2NvcGVzOiBbJ3JlYWQnLCAnd3JpdGUnXVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J1dXVy1BdXRoZW50aWNhdGUnOiAnQmVhcmVyIHNjb3BlPVwicmVhZCB3cml0ZVwiJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aE1ldGFkYXRhLnVwZGF0ZShyZXNwb25zZS5oZWFkZXJzKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNjb3BlcywgWydyZWFkJywgJ3dyaXRlJ10pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZmFsc2Ugd2hlbiBzY29wZXMgYXJlIHNhbWUgYnV0IGluIGRpZmZlcmVudCBvcmRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBhdXRoTWV0YWRhdGEgfSA9IGF3YWl0IGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEoe1xuXHRcdFx0XHRcdHNjb3BlczogWydyZWFkJywgJ3dyaXRlJ11cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogJ0JlYXJlciBzY29wZT1cIndyaXRlIHJlYWRcIidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhNZXRhZGF0YS51cGRhdGUocmVzcG9uc2UuaGVhZGVycyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdHJ1ZSB3aGVuIHVwZGF0aW5nIGZyb20gdW5kZWZpbmVkIHNjb3BlcyB0byBkZWZpbmVkIHNjb3BlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBhdXRoTWV0YWRhdGEgfSA9IGF3YWl0IGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEoe1xuXHRcdFx0XHRcdHNjb3BlczogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCZWFyZXIgc2NvcGU9XCJyZWFkXCInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoTWV0YWRhdGEudXBkYXRlKHJlc3BvbnNlLmhlYWRlcnMpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF1dGhNZXRhZGF0YS5zY29wZXMsIFsncmVhZCddKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHRydWUgd2hlbiB1cGRhdGluZyBmcm9tIGRlZmluZWQgc2NvcGVzIHRvIHVuZGVmaW5lZCAobm8gc2NvcGUgaW4gaGVhZGVyKScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBhdXRoTWV0YWRhdGEgfSA9IGF3YWl0IGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEoe1xuXHRcdFx0XHRcdHNjb3BlczogWydyZWFkJ11cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogJ0JlYXJlciByZWFsbT1cImV4YW1wbGVcIidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhNZXRhZGF0YS51cGRhdGUocmVzcG9uc2UuaGVhZGVycyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRoTWV0YWRhdGEuc2NvcGVzLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZmFsc2Ugd2hlbiBubyBXV1ctQXV0aGVudGljYXRlIGhlYWRlciBhbmQgc2NvcGVzIGFyZSBhbHJlYWR5IHVuZGVmaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBhdXRoTWV0YWRhdGEgfSA9IGF3YWl0IGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEoe1xuXHRcdFx0XHRcdHNjb3BlczogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0XHRoZWFkZXJzOiB7fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhdXRoTWV0YWRhdGEudXBkYXRlKHJlc3BvbnNlLmhlYWRlcnMpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGZhbHNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIEJlYXJlciBjaGFsbGVuZ2VzIGFuZCB1c2UgZmlyc3Qgc2NvcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgYXV0aE1ldGFkYXRhIH0gPSBhd2FpdCBjcmVhdGVUZXN0QXV0aE1ldGFkYXRhKHtcblx0XHRcdFx0XHRzY29wZXM6IHVuZGVmaW5lZFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J1dXVy1BdXRoZW50aWNhdGUnOiAnQmVhcmVyIHNjb3BlPVwiZmlyc3RcIiwgQmVhcmVyIHNjb3BlPVwic2Vjb25kXCInXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhdXRoTWV0YWRhdGEudXBkYXRlKHJlc3BvbnNlLmhlYWRlcnMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNjb3BlcywgWydmaXJzdCddKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgaWdub3JlIG5vbi1CZWFyZXIgc2NoZW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBhdXRoTWV0YWRhdGEgfSA9IGF3YWl0IGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEoe1xuXHRcdFx0XHRcdHNjb3BlczogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCYXNpYyByZWFsbT1cImV4YW1wbGVcIidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF1dGhNZXRhZGF0YS51cGRhdGUocmVzcG9uc2UuaGVhZGVycyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNjb3BlcywgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY3JlYXRlQXV0aE1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdGxldCBzYW5kYm94OiBzaW5vbi5TaW5vblNhbmRib3g7XG5cdFx0bGV0IGxvZ01lc3NhZ2VzOiBBcnJheTx7IGxldmVsOiBMb2dMZXZlbDsgbWVzc2FnZTogc3RyaW5nIH0+O1xuXHRcdGxldCBtb2NrTG9nZ2VyOiAobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQ7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzYW5kYm94ID0gc2lub24uY3JlYXRlU2FuZGJveCgpO1xuXHRcdFx0bG9nTWVzc2FnZXMgPSBbXTtcblx0XHRcdG1vY2tMb2dnZXIgPSAobGV2ZWwsIG1lc3NhZ2UpID0+IGxvZ01lc3NhZ2VzLnB1c2goeyBsZXZlbCwgbWVzc2FnZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNhbmRib3gucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGNyZWF0ZSBJQXV0aE1ldGFkYXRhIHdpdGggZmV0Y2hlZCBzZXJ2ZXIgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRmV0Y2ggPSBzYW5kYm94LnN0dWIoKTtcblxuXHRcdFx0Ly8gTW9jayByZXNvdXJjZSBtZXRhZGF0YSBmZXRjaFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgwKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBURVNUX1JFU09VUkNFX01FVEFEQVRBX1VSTCxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdHJlc291cmNlOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbVEVTVF9BVVRIX1NFUlZFUl0sXG5cdFx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJywgJ3dyaXRlJ11cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gTW9jayBzZXJ2ZXIgbWV0YWRhdGEgZmV0Y2hcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMSkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXJgLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0aXNzdWVyOiBURVNUX0FVVEhfU0VSVkVSLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L2F1dGhvcml6ZWAsXG5cdFx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L3Rva2VuYCxcblx0XHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHRcdH0pXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0dXJsOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCZWFyZXIgc2NvcGU9XCJhcGkucmVhZFwiJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYXV0aE1ldGFkYXRhID0gYXdhaXQgY3JlYXRlQXV0aE1ldGFkYXRhKFxuXHRcdFx0XHRURVNUX01DUF9VUkwsXG5cdFx0XHRcdG9yaWdpbmFsUmVzcG9uc2UuaGVhZGVycyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNhbWVPcmlnaW5IZWFkZXJzOiB7ICdYLUN1c3RvbSc6ICd2YWx1ZScgfSxcblx0XHRcdFx0XHRmZXRjaDogbW9ja0ZldGNoLFxuXHRcdFx0XHRcdGxvZzogbW9ja0xvZ2dlclxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2soYXV0aE1ldGFkYXRhLmF1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcoKS5zdGFydHNXaXRoKFRFU1RfQVVUSF9TRVJWRVIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRoTWV0YWRhdGEuc2VydmVyTWV0YWRhdGEuaXNzdWVyLCBURVNUX0FVVEhfU0VSVkVSKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXV0aE1ldGFkYXRhLnNjb3BlcywgWydhcGkucmVhZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsIGJhY2sgdG8gZGVmYXVsdCBtZXRhZGF0YSB3aGVuIHNlcnZlciBtZXRhZGF0YSBmZXRjaCBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tGZXRjaCA9IHNhbmRib3guc3R1YigpO1xuXG5cdFx0XHQvLyBNb2NrIHJlc291cmNlIG1ldGFkYXRhIGZldGNoIC0gZmFpbHNcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMCkucmVqZWN0cyhuZXcgRXJyb3IoJ05ldHdvcmsgZXJyb3InKSk7XG5cblx0XHRcdC8vIE1vY2sgc2VydmVyIG1ldGFkYXRhIGZldGNoIC0gYWxzbyBmYWlsc1xuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgxKS5yZWplY3RzKG5ldyBFcnJvcignTmV0d29yayBlcnJvcicpKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxSZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHR1cmw6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0aGVhZGVyczoge31cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhdXRoTWV0YWRhdGEgPSBhd2FpdCBjcmVhdGVBdXRoTWV0YWRhdGEoXG5cdFx0XHRcdFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0b3JpZ2luYWxSZXNwb25zZS5oZWFkZXJzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZU9yaWdpbkhlYWRlcnM6IHt9LFxuXHRcdFx0XHRcdGZldGNoOiBtb2NrRmV0Y2gsXG5cdFx0XHRcdFx0bG9nOiBtb2NrTG9nZ2VyXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIFNob3VsZCB1c2UgZGVmYXVsdCBtZXRhZGF0YSBiYXNlZCBvbiB0aGUgVVJMXG5cdFx0XHRhc3NlcnQub2soYXV0aE1ldGFkYXRhLmF1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcoKS5zdGFydHNXaXRoKCdodHRwczovL2V4YW1wbGUuY29tJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5zZXJ2ZXJNZXRhZGF0YS5pc3N1ZXIuc3RhcnRzV2l0aCgnaHR0cHM6Ly9leGFtcGxlLmNvbScpKTtcblx0XHRcdGFzc2VydC5vayhhdXRoTWV0YWRhdGEuc2VydmVyTWV0YWRhdGEuYXV0aG9yaXphdGlvbl9lbmRwb2ludD8uc3RhcnRzV2l0aCgnaHR0cHM6Ly9leGFtcGxlLmNvbS9hdXRob3JpemUnKSk7XG5cdFx0XHRhc3NlcnQub2soYXV0aE1ldGFkYXRhLnNlcnZlck1ldGFkYXRhLnRva2VuX2VuZHBvaW50Py5zdGFydHNXaXRoKCdodHRwczovL2V4YW1wbGUuY29tL3Rva2VuJykpO1xuXG5cdFx0XHQvLyBTaG91bGQgbG9nIHRoZSBmYWxsYmFja1xuXHRcdFx0YXNzZXJ0Lm9rKGxvZ01lc3NhZ2VzLnNvbWUobSA9PlxuXHRcdFx0XHRtLmxldmVsID09PSBMb2dMZXZlbC5JbmZvICYmXG5cdFx0XHRcdG0ubWVzc2FnZS5pbmNsdWRlcygnVXNpbmcgZGVmYXVsdCBhdXRoIG1ldGFkYXRhJylcblx0XHRcdCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBzY29wZXMgZnJvbSBXV1ctQXV0aGVudGljYXRlIGhlYWRlciB3aGVuIHJlc291cmNlIG1ldGFkYXRhIGhhcyBub25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0ZldGNoID0gc2FuZGJveC5zdHViKCk7XG5cblx0XHRcdC8vIE1vY2sgcmVzb3VyY2UgbWV0YWRhdGEgZmV0Y2ggLSBubyBzY29wZXNfc3VwcG9ydGVkXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDApLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6IFRFU1RfUkVTT1VSQ0VfTUVUQURBVEFfVVJMLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFtURVNUX0FVVEhfU0VSVkVSXVxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBNb2NrIHNlcnZlciBtZXRhZGF0YSBmZXRjaFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgxKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBgJHtURVNUX0FVVEhfU0VSVkVSfS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcmAsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRpc3N1ZXI6IFRFU1RfQVVUSF9TRVJWRVIsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vYXV0aG9yaXplYCxcblx0XHRcdFx0XHR0b2tlbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vdG9rZW5gLFxuXHRcdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxSZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHR1cmw6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogJ0JlYXJlciBzY29wZT1cImhlYWRlci5zY29wZVwiJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYXV0aE1ldGFkYXRhID0gYXdhaXQgY3JlYXRlQXV0aE1ldGFkYXRhKFxuXHRcdFx0XHRURVNUX01DUF9VUkwsXG5cdFx0XHRcdG9yaWdpbmFsUmVzcG9uc2UuaGVhZGVycyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNhbWVPcmlnaW5IZWFkZXJzOiB7fSxcblx0XHRcdFx0XHRmZXRjaDogbW9ja0ZldGNoLFxuXHRcdFx0XHRcdGxvZzogbW9ja0xvZ2dlclxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF1dGhNZXRhZGF0YS5zY29wZXMsIFsnaGVhZGVyLnNjb3BlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBzY29wZXMgZnJvbSBXV1ctQXV0aGVudGljYXRlIGhlYWRlciBldmVuIHdoZW4gcmVzb3VyY2UgbWV0YWRhdGEgaGFzIHNjb3Blc19zdXBwb3J0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRmV0Y2ggPSBzYW5kYm94LnN0dWIoKTtcblxuXHRcdFx0Ly8gTW9jayByZXNvdXJjZSBtZXRhZGF0YSBmZXRjaCAtIGhhcyBzY29wZXNfc3VwcG9ydGVkXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDApLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6IFRFU1RfUkVTT1VSQ0VfTUVUQURBVEFfVVJMLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFtURVNUX0FVVEhfU0VSVkVSXSxcblx0XHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3Jlc291cmNlLnNjb3BlMScsICdyZXNvdXJjZS5zY29wZTInXVxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBNb2NrIHNlcnZlciBtZXRhZGF0YSBmZXRjaFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgxKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBgJHtURVNUX0FVVEhfU0VSVkVSfS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcmAsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRpc3N1ZXI6IFRFU1RfQVVUSF9TRVJWRVIsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vYXV0aG9yaXplYCxcblx0XHRcdFx0XHR0b2tlbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vdG9rZW5gLFxuXHRcdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxSZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHR1cmw6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdXV1ctQXV0aGVudGljYXRlJzogJ0JlYXJlciBzY29wZT1cImhlYWRlci5zY29wZVwiJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYXV0aE1ldGFkYXRhID0gYXdhaXQgY3JlYXRlQXV0aE1ldGFkYXRhKFxuXHRcdFx0XHRURVNUX01DUF9VUkwsXG5cdFx0XHRcdG9yaWdpbmFsUmVzcG9uc2UuaGVhZGVycyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNhbWVPcmlnaW5IZWFkZXJzOiB7fSxcblx0XHRcdFx0XHRmZXRjaDogbW9ja0ZldGNoLFxuXHRcdFx0XHRcdGxvZzogbW9ja0xvZ2dlclxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBXV1ctQXV0aGVudGljYXRlIGhlYWRlciBzY29wZXMgdGFrZSBwcmVjZWRlbmNlIG92ZXIgcmVzb3VyY2UgbWV0YWRhdGEgc2NvcGVzX3N1cHBvcnRlZFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdXRoTWV0YWRhdGEuc2NvcGVzLCBbJ2hlYWRlci5zY29wZSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgcmVzb3VyY2VfbWV0YWRhdGEgY2hhbGxlbmdlIFVSTCBmcm9tIFdXVy1BdXRoZW50aWNhdGUgaGVhZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0ZldGNoID0gc2FuZGJveC5zdHViKCk7XG5cblx0XHRcdC8vIE1vY2sgcmVzb3VyY2UgbWV0YWRhdGEgZmV0Y2ggZnJvbSBjaGFsbGVuZ2UgVVJMXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDApLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2N1c3RvbS1yZXNvdXJjZS1tZXRhZGF0YScsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRyZXNvdXJjZTogVEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogW1RFU1RfQVVUSF9TRVJWRVJdXG5cdFx0XHRcdH0pXG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIE1vY2sgc2VydmVyIG1ldGFkYXRhIGZldGNoXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDEpLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6IGAke1RFU1RfQVVUSF9TRVJWRVJ9Ly53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyYCxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGlzc3VlcjogVEVTVF9BVVRIX1NFUlZFUixcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiBgJHtURVNUX0FVVEhfU0VSVkVSfS9hdXRob3JpemVgLFxuXHRcdFx0XHRcdHRva2VuX2VuZHBvaW50OiBgJHtURVNUX0FVVEhfU0VSVkVSfS90b2tlbmAsXG5cdFx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbFJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdHVybDogVEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0J1dXVy1BdXRoZW50aWNhdGUnOiAnQmVhcmVyIHJlc291cmNlX21ldGFkYXRhPVwiaHR0cHM6Ly9leGFtcGxlLmNvbS9jdXN0b20tcmVzb3VyY2UtbWV0YWRhdGFcIidcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGF1dGhNZXRhZGF0YSA9IGF3YWl0IGNyZWF0ZUF1dGhNZXRhZGF0YShcblx0XHRcdFx0VEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRvcmlnaW5hbFJlc3BvbnNlLmhlYWRlcnMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzYW1lT3JpZ2luSGVhZGVyczoge30sXG5cdFx0XHRcdFx0ZmV0Y2g6IG1vY2tGZXRjaCxcblx0XHRcdFx0XHRsb2c6IG1vY2tMb2dnZXJcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5hdXRob3JpemF0aW9uU2VydmVyLnRvU3RyaW5nKCkuc3RhcnRzV2l0aChURVNUX0FVVEhfU0VSVkVSKSk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgcmVzb3VyY2VfbWV0YWRhdGEgVVJMIHdhcyBsb2dnZWRcblx0XHRcdGFzc2VydC5vayhsb2dNZXNzYWdlcy5zb21lKG0gPT5cblx0XHRcdFx0bS5sZXZlbCA9PT0gTG9nTGV2ZWwuRGVidWcgJiZcblx0XHRcdFx0bS5tZXNzYWdlLmluY2x1ZGVzKCdyZXNvdXJjZV9tZXRhZGF0YSBjaGFsbGVuZ2UnKVxuXHRcdFx0KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcGFzcyBsYXVuY2ggaGVhZGVycyB3aGVuIGZldGNoaW5nIG1ldGFkYXRhIGZyb20gc2FtZSBvcmlnaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrRmV0Y2ggPSBzYW5kYm94LnN0dWIoKTtcblxuXHRcdFx0Ly8gTW9jayByZXNvdXJjZSBtZXRhZGF0YSBmZXRjaCB0byBzdWNjZWVkIHNvIHdlIGNhbiB2ZXJpZnkgaGVhZGVyc1xuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgwKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBURVNUX1JFU09VUkNFX01FVEFEQVRBX1VSTCxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdHJlc291cmNlOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbVEVTVF9BVVRIX1NFUlZFUl1cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gTW9jayBzZXJ2ZXIgbWV0YWRhdGEgZmV0Y2hcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMSkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXJgLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0aXNzdWVyOiBURVNUX0FVVEhfU0VSVkVSLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L2F1dGhvcml6ZWAsXG5cdFx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6IGAke1RFU1RfQVVUSF9TRVJWRVJ9L3Rva2VuYCxcblx0XHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHRcdH0pXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0dXJsOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdGhlYWRlcnM6IHt9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgbGF1bmNoSGVhZGVycyA9IHtcblx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiAnQmVhcmVyIGV4aXN0aW5nLXRva2VuJyxcblx0XHRcdFx0J1gtQ3VzdG9tLUhlYWRlcic6ICdjdXN0b20tdmFsdWUnXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBjcmVhdGVBdXRoTWV0YWRhdGEoXG5cdFx0XHRcdFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0b3JpZ2luYWxSZXNwb25zZS5oZWFkZXJzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZU9yaWdpbkhlYWRlcnM6IGxhdW5jaEhlYWRlcnMsXG5cdFx0XHRcdFx0ZmV0Y2g6IG1vY2tGZXRjaCxcblx0XHRcdFx0XHRsb2c6IG1vY2tMb2dnZXJcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IGZldGNoIHdhcyBjYWxsZWRcblx0XHRcdGFzc2VydC5vayhtb2NrRmV0Y2guY2FsbGVkLCAnZmV0Y2ggc2hvdWxkIGhhdmUgYmVlbiBjYWxsZWQnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBmaXJzdCBjYWxsIChyZXNvdXJjZSBtZXRhZGF0YSkgaW5jbHVkZWQgdGhlIGxhdW5jaCBoZWFkZXJzXG5cdFx0XHRjb25zdCBmaXJzdENhbGxBcmdzID0gbW9ja0ZldGNoLmZpcnN0Q2FsbC5hcmdzO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpcnN0Q2FsbEFyZ3MubGVuZ3RoID49IDIsICdmZXRjaCBzaG91bGQgaGF2ZSBiZWVuIGNhbGxlZCB3aXRoIG9wdGlvbnMnKTtcblx0XHRcdGNvbnN0IGZldGNoT3B0aW9ucyA9IGZpcnN0Q2FsbEFyZ3NbMV0gYXMgUmVxdWVzdEluaXQ7XG5cdFx0XHRhc3NlcnQub2soZmV0Y2hPcHRpb25zLmhlYWRlcnMsICdmZXRjaCBvcHRpb25zIHNob3VsZCBpbmNsdWRlIGhlYWRlcnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgc2NvcGUgc3RyaW5nIGluIFdXVy1BdXRoZW50aWNhdGUgaGVhZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja0ZldGNoID0gc2FuZGJveC5zdHViKCk7XG5cblx0XHRcdC8vIE1vY2sgcmVzb3VyY2UgbWV0YWRhdGEgZmV0Y2hcblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMCkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogVEVTVF9SRVNPVVJDRV9NRVRBREFUQV9VUkwsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRyZXNvdXJjZTogVEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogW1RFU1RfQVVUSF9TRVJWRVJdXG5cdFx0XHRcdH0pXG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIE1vY2sgc2VydmVyIG1ldGFkYXRhIGZldGNoXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDEpLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6IGAke1RFU1RfQVVUSF9TRVJWRVJ9Ly53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyYCxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGlzc3VlcjogVEVTVF9BVVRIX1NFUlZFUixcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiBgJHtURVNUX0FVVEhfU0VSVkVSfS9hdXRob3JpemVgLFxuXHRcdFx0XHRcdHRva2VuX2VuZHBvaW50OiBgJHtURVNUX0FVVEhfU0VSVkVSfS90b2tlbmAsXG5cdFx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbFJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdHVybDogVEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0J1dXVy1BdXRoZW50aWNhdGUnOiAnQmVhcmVyIHNjb3BlPVwiXCInXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhdXRoTWV0YWRhdGEgPSBhd2FpdCBjcmVhdGVBdXRoTWV0YWRhdGEoXG5cdFx0XHRcdFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0b3JpZ2luYWxSZXNwb25zZS5oZWFkZXJzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZU9yaWdpbkhlYWRlcnM6IHt9LFxuXHRcdFx0XHRcdGZldGNoOiBtb2NrRmV0Y2gsXG5cdFx0XHRcdFx0bG9nOiBtb2NrTG9nZ2VyXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIEVtcHR5IHNjb3BlIHN0cmluZyBzaG91bGQgcmVzdWx0IGluIGVtcHR5IGFycmF5IG9yIHVuZGVmaW5lZFxuXHRcdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0XHRhdXRoTWV0YWRhdGEuc2NvcGVzID09PSB1bmRlZmluZWQgfHxcblx0XHRcdFx0KEFycmF5LmlzQXJyYXkoYXV0aE1ldGFkYXRhLnNjb3BlcykgJiYgYXV0aE1ldGFkYXRhLnNjb3Blcy5sZW5ndGggPT09IDApIHx8XG5cdFx0XHRcdChBcnJheS5pc0FycmF5KGF1dGhNZXRhZGF0YS5zY29wZXMpICYmIGF1dGhNZXRhZGF0YS5zY29wZXMuZXZlcnkocyA9PiBzID09PSAnJykpLFxuXHRcdFx0XHQnRW1wdHkgc2NvcGUgc3RyaW5nIHNob3VsZCBiZSBoYW5kbGVkIGdyYWNlZnVsbHknXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtYWxmb3JtZWQgV1dXLUF1dGhlbnRpY2F0ZSBoZWFkZXIgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tGZXRjaCA9IHNhbmRib3guc3R1YigpO1xuXG5cdFx0XHQvLyBNb2NrIHJlc291cmNlIG1ldGFkYXRhIGZldGNoXG5cdFx0XHRtb2NrRmV0Y2gub25DYWxsKDApLnJlc29sdmVzKGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHR1cmw6IFRFU1RfUkVTT1VSQ0VfTUVUQURBVEFfVVJMLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFtURVNUX0FVVEhfU0VSVkVSXVxuXHRcdFx0XHR9KVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBNb2NrIHNlcnZlciBtZXRhZGF0YSBmZXRjaFxuXHRcdFx0bW9ja0ZldGNoLm9uQ2FsbCgxKS5yZXNvbHZlcyhjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0dXJsOiBgJHtURVNUX0FVVEhfU0VSVkVSfS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcmAsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRpc3N1ZXI6IFRFU1RfQVVUSF9TRVJWRVIsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vYXV0aG9yaXplYCxcblx0XHRcdFx0XHR0b2tlbl9lbmRwb2ludDogYCR7VEVTVF9BVVRIX1NFUlZFUn0vdG9rZW5gLFxuXHRcdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxSZXNwb25zZSA9IGNyZWF0ZU1vY2tSZXNwb25zZSh7XG5cdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHR1cmw6IFRFU1RfTUNQX1VSTCxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdC8vIE1hbGZvcm1lZCBoZWFkZXIgLSBtaXNzaW5nIGNsb3NpbmcgcXVvdGVcblx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCZWFyZXIgc2NvcGU9XCJ1bmNsb3NlZCdcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNob3VsZCBub3QgdGhyb3cgLSBzaG91bGQgaGFuZGxlIGdyYWNlZnVsbHlcblx0XHRcdGNvbnN0IGF1dGhNZXRhZGF0YSA9IGF3YWl0IGNyZWF0ZUF1dGhNZXRhZGF0YShcblx0XHRcdFx0VEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRvcmlnaW5hbFJlc3BvbnNlLmhlYWRlcnMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzYW1lT3JpZ2luSGVhZGVyczoge30sXG5cdFx0XHRcdFx0ZmV0Y2g6IG1vY2tGZXRjaCxcblx0XHRcdFx0XHRsb2c6IG1vY2tMb2dnZXJcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gU2hvdWxkIHN0aWxsIGNyZWF0ZSB2YWxpZCBhdXRoIG1ldGFkYXRhXG5cdFx0XHRhc3NlcnQub2soYXV0aE1ldGFkYXRhLmF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5zZXJ2ZXJNZXRhZGF0YSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGludmFsaWQgSlNPTiBpbiByZXNvdXJjZSBtZXRhZGF0YSByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tGZXRjaCA9IHNhbmRib3guc3R1YigpO1xuXG5cdFx0XHQvLyBNb2NrIHJlc291cmNlIG1ldGFkYXRhIGZldGNoIC0gcmV0dXJucyBpbnZhbGlkIEpTT05cblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMCkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogVEVTVF9SRVNPVVJDRV9NRVRBREFUQV9VUkwsXG5cdFx0XHRcdGJvZHk6ICdub3QgdmFsaWQganNvbiB7J1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBNb2NrIHNlcnZlciBtZXRhZGF0YSBmZXRjaCAtIGFsc28gcmV0dXJucyBpbnZhbGlkIEpTT05cblx0XHRcdG1vY2tGZXRjaC5vbkNhbGwoMSkucmVzb2x2ZXMoY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXInLFxuXHRcdFx0XHRib2R5OiAneyBpbnZhbGlkIH0nXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVzcG9uc2UgPSBjcmVhdGVNb2NrUmVzcG9uc2Uoe1xuXHRcdFx0XHRzdGF0dXM6IDQwMSxcblx0XHRcdFx0dXJsOiBURVNUX01DUF9VUkwsXG5cdFx0XHRcdGhlYWRlcnM6IHt9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2hvdWxkIGZhbGwgYmFjayB0byBkZWZhdWx0IG1ldGFkYXRhLCBub3QgdGhyb3dcblx0XHRcdGNvbnN0IGF1dGhNZXRhZGF0YSA9IGF3YWl0IGNyZWF0ZUF1dGhNZXRhZGF0YShcblx0XHRcdFx0VEVTVF9NQ1BfVVJMLFxuXHRcdFx0XHRvcmlnaW5hbFJlc3BvbnNlLmhlYWRlcnMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzYW1lT3JpZ2luSGVhZGVyczoge30sXG5cdFx0XHRcdFx0ZmV0Y2g6IG1vY2tGZXRjaCxcblx0XHRcdFx0XHRsb2c6IG1vY2tMb2dnZXJcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gU2hvdWxkIHVzZSBkZWZhdWx0IG1ldGFkYXRhXG5cdFx0XHRhc3NlcnQub2soYXV0aE1ldGFkYXRhLmF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGF1dGhNZXRhZGF0YS5zZXJ2ZXJNZXRhZGF0YSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG5vbi00MDEgc3RhdHVzIGNvZGVzIGluIHVwZGF0ZSgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBhdXRoTWV0YWRhdGEgfSA9IGF3YWl0IGNyZWF0ZVRlc3RBdXRoTWV0YWRhdGEoe1xuXHRcdFx0XHRzY29wZXM6IFsncmVhZCddXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUmVzcG9uc2Ugd2l0aCA0MDMgaW5zdGVhZCBvZiA0MDFcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY3JlYXRlTW9ja1Jlc3BvbnNlKHtcblx0XHRcdFx0c3RhdHVzOiA0MDMsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQnV1dXLUF1dGhlbnRpY2F0ZSc6ICdCZWFyZXIgc2NvcGU9XCJuZXcuc2NvcGVcIidcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIHVwZGF0ZSgpIHNob3VsZCBzdGlsbCBwcm9jZXNzIHRoZSBXV1ctQXV0aGVudGljYXRlIGhlYWRlciByZWdhcmRsZXNzIG9mIHN0YXR1c1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXV0aE1ldGFkYXRhLnVwZGF0ZShyZXNwb25zZS5oZWFkZXJzKTtcblxuXHRcdFx0Ly8gVGhlIGJlaGF2aW9yIGRlcGVuZHMgb24gaW1wbGVtZW50YXRpb24gLSBlaXRoZXIgaXQgdXBkYXRlcyBvciBpZ25vcmVzIG5vbi00MDFcblx0XHRcdC8vIFRoaXMgdGVzdCBkb2N1bWVudHMgdGhlIGFjdHVhbCBiZWhhdmlvclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHQsICdib29sZWFuJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixZQUFZLFdBQVc7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBeUQ7QUFDbEUsU0FBUywrQ0FBK0M7QUFHeEQsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sNkJBQTZCO0FBS25DLFNBQVMsbUJBQW1CLFNBTVQ7QUFDbEIsUUFBTSxVQUFVLElBQUksUUFBUSxRQUFRLFdBQVcsQ0FBQyxDQUFDO0FBQ2pELFNBQU87QUFBQSxJQUNOLFFBQVEsUUFBUSxVQUFVO0FBQUEsSUFDMUIsWUFBWSxRQUFRLGNBQWM7QUFBQSxJQUNsQyxLQUFLLFFBQVEsT0FBTztBQUFBLElBQ3BCO0FBQUEsSUFDQSxNQUFNO0FBQUEsSUFDTixNQUFNLFlBQVksS0FBSyxNQUFNLFFBQVEsUUFBUSxJQUFJO0FBQUEsSUFDakQsTUFBTSxZQUFZLFFBQVEsUUFBUTtBQUFBLEVBQ25DO0FBQ0Q7QUFNQSxlQUFlLHVCQUF1QixTQUlpRTtBQUN0RyxRQUFNLGNBQTJELENBQUM7QUFDbEUsUUFBTSxhQUFhLENBQUMsT0FBaUIsWUFBb0IsWUFBWSxLQUFLLEVBQUUsT0FBTyxRQUFRLENBQUM7QUFFNUYsUUFBTSxTQUFTLFFBQVEsd0JBQXdCO0FBRS9DLFFBQU0sWUFBWSxNQUFNLEtBQUs7QUFHN0IsWUFBVSxPQUFPLENBQUMsRUFBRSxTQUFTLG1CQUFtQjtBQUFBLElBQy9DLFFBQVE7QUFBQSxJQUNSLEtBQUs7QUFBQSxJQUNMLE1BQU0sS0FBSyxVQUFVLFFBQVEsb0JBQW9CO0FBQUEsTUFDaEQsVUFBVTtBQUFBLE1BQ1YsdUJBQXVCLENBQUMsTUFBTTtBQUFBLElB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
