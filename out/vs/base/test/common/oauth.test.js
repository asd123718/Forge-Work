import * as assert from "assert";
import * as sinon from "sinon";
import {
  buildIdJagExchangeBody,
  buildResourceRedemptionBody,
  getClaimsFromJWT,
  getDefaultMetadataForUrl,
  isAuthorizationAuthorizeResponse,
  isAuthorizationDeviceResponse,
  isAuthorizationErrorResponse,
  isAuthorizationDynamicClientRegistrationResponse,
  isAuthorizationProtectedResourceMetadata,
  isAuthorizationServerMetadata,
  isAuthorizationTokenResponse,
  parseWWWAuthenticateHeader,
  fetchDynamicRegistration,
  fetchResourceMetadata,
  fetchAuthorizationServerMetadata,
  scopesMatch,
  DEFAULT_AUTH_FLOW_PORT
} from "../../common/oauth.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { encodeBase64, VSBuffer } from "../../common/buffer.js";
suite("OAuth", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Type Guards", () => {
    test("isAuthorizationProtectedResourceMetadata should correctly identify protected resource metadata", () => {
      assert.strictEqual(isAuthorizationProtectedResourceMetadata({ resource: "https://example.com" }), true);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata({
        resource: "https://example.com",
        scopes_supported: ["read", "write"]
      }), true);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata(null), false);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata(void 0), false);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata({}), false);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata("not an object"), false);
      assert.strictEqual(isAuthorizationProtectedResourceMetadata({
        resource: "https://example.com",
        scopes_supported: "not an array"
      }), false);
    });
    test("isAuthorizationServerMetadata should correctly identify server metadata", () => {
      assert.strictEqual(isAuthorizationServerMetadata({
        issuer: "https://example.com",
        response_types_supported: ["code"]
      }), true);
      assert.strictEqual(isAuthorizationServerMetadata({
        issuer: "https://example.com",
        authorization_endpoint: "https://example.com/auth",
        token_endpoint: "https://example.com/token",
        registration_endpoint: "https://example.com/register",
        jwks_uri: "https://example.com/jwks",
        response_types_supported: ["code"]
      }), true);
      assert.strictEqual(isAuthorizationServerMetadata({
        issuer: "http://localhost:8080",
        authorization_endpoint: "http://localhost:8080/auth",
        token_endpoint: "http://localhost:8080/token",
        response_types_supported: ["code"]
      }), true);
      assert.strictEqual(isAuthorizationServerMetadata(null), false);
      assert.strictEqual(isAuthorizationServerMetadata(void 0), false);
      assert.strictEqual(isAuthorizationServerMetadata("not an object"), false);
      assert.throws(() => isAuthorizationServerMetadata({}), /Authorization server metadata must have an issuer/);
      assert.throws(() => isAuthorizationServerMetadata({ response_types_supported: ["code"] }), /Authorization server metadata must have an issuer/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        authorization_endpoint: 123,
        response_types_supported: ["code"]
      }), /Authorization server metadata 'authorization_endpoint' must be a string/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        token_endpoint: 123,
        response_types_supported: ["code"]
      }), /Authorization server metadata 'token_endpoint' must be a string/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        registration_endpoint: [],
        response_types_supported: ["code"]
      }), /Authorization server metadata 'registration_endpoint' must be a string/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        jwks_uri: {},
        response_types_supported: ["code"]
      }), /Authorization server metadata 'jwks_uri' must be a string/);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "ftp://example.com",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'issuer' must start with http:\/\/ or https:\/\//);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        authorization_endpoint: "ftp://example.com/auth",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'authorization_endpoint' must start with http:\/\/ or https:\/\//);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        token_endpoint: "file:///path/to/token",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'token_endpoint' must start with http:\/\/ or https:\/\//);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        registration_endpoint: "mailto:admin@example.com",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'registration_endpoint' must start with http:\/\/ or https:\/\//);
      assert.throws(() => isAuthorizationServerMetadata({
        issuer: "https://example.com",
        jwks_uri: "data:application/json,{}",
        response_types_supported: ["code"]
      }), /Authorization server metadata 'jwks_uri' must start with http:\/\/ or https:\/\//);
    });
    test("isAuthorizationDynamicClientRegistrationResponse should correctly identify registration response", () => {
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({
        client_id: "client-123",
        client_name: "Test Client"
      }), true);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse(null), false);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse(void 0), false);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({}), false);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({ client_id: "just-id" }), true);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse({ client_name: "missing-id" }), false);
      assert.strictEqual(isAuthorizationDynamicClientRegistrationResponse("not an object"), false);
    });
    test("isAuthorizationAuthorizeResponse should correctly identify authorization response", () => {
      assert.strictEqual(isAuthorizationAuthorizeResponse({
        code: "auth-code-123",
        state: "state-123"
      }), true);
      assert.strictEqual(isAuthorizationAuthorizeResponse(null), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse(void 0), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse({}), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse({ code: "missing-state" }), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse({ state: "missing-code" }), false);
      assert.strictEqual(isAuthorizationAuthorizeResponse("not an object"), false);
    });
    test("isAuthorizationTokenResponse should correctly identify token response", () => {
      assert.strictEqual(isAuthorizationTokenResponse({
        access_token: "token-123",
        token_type: "Bearer"
      }), true);
      assert.strictEqual(isAuthorizationTokenResponse(null), false);
      assert.strictEqual(isAuthorizationTokenResponse(void 0), false);
      assert.strictEqual(isAuthorizationTokenResponse({}), false);
      assert.strictEqual(isAuthorizationTokenResponse({ access_token: "missing-type" }), false);
      assert.strictEqual(isAuthorizationTokenResponse({ token_type: "missing-token" }), false);
      assert.strictEqual(isAuthorizationTokenResponse("not an object"), false);
    });
    test("isAuthorizationDeviceResponse should correctly identify device authorization response", () => {
      assert.strictEqual(isAuthorizationDeviceResponse({
        device_code: "device-code-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://example.com/verify",
        expires_in: 1800
      }), true);
      assert.strictEqual(isAuthorizationDeviceResponse({
        device_code: "device-code-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://example.com/verify",
        verification_uri_complete: "https://example.com/verify?user_code=ABCD-EFGH",
        expires_in: 1800,
        interval: 5
      }), true);
      assert.strictEqual(isAuthorizationDeviceResponse(null), false);
      assert.strictEqual(isAuthorizationDeviceResponse(void 0), false);
      assert.strictEqual(isAuthorizationDeviceResponse({}), false);
      assert.strictEqual(isAuthorizationDeviceResponse({ device_code: "missing-others" }), false);
      assert.strictEqual(isAuthorizationDeviceResponse({ user_code: "missing-others" }), false);
      assert.strictEqual(isAuthorizationDeviceResponse({ verification_uri: "missing-others" }), false);
      assert.strictEqual(isAuthorizationDeviceResponse({ expires_in: 1800 }), false);
      assert.strictEqual(isAuthorizationDeviceResponse({
        device_code: "device-code-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://example.com/verify"
        // Missing expires_in
      }), false);
      assert.strictEqual(isAuthorizationDeviceResponse("not an object"), false);
    });
    test("isAuthorizationErrorResponse should correctly identify error response", () => {
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "authorization_pending",
        error_description: "The authorization request is still pending"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "slow_down",
        error_description: "Polling too fast"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "access_denied",
        error_description: "The user denied the request"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "expired_token",
        error_description: "The device code has expired"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse({
        error: "invalid_request",
        error_description: "The request is missing a required parameter",
        error_uri: "https://example.com/error"
      }), true);
      assert.strictEqual(isAuthorizationErrorResponse(null), false);
      assert.strictEqual(isAuthorizationErrorResponse(void 0), false);
      assert.strictEqual(isAuthorizationErrorResponse({}), false);
      assert.strictEqual(isAuthorizationErrorResponse({ error_description: "missing-error" }), false);
      assert.strictEqual(isAuthorizationErrorResponse("not an object"), false);
    });
  });
  suite("Scope Matching", () => {
    test("scopesMatch should return true for identical scopes", () => {
      const scopes1 = ["test", "scopes"];
      const scopes2 = ["test", "scopes"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), true);
    });
    test("scopesMatch should return true for scopes in different order", () => {
      const scopes1 = ["6f1cc985-85e8-487e-b0dd-aa633302a731/.default", "VSCODE_TENANT:organizations"];
      const scopes2 = ["VSCODE_TENANT:organizations", "6f1cc985-85e8-487e-b0dd-aa633302a731/.default"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), true);
    });
    test("scopesMatch should return false for different scopes", () => {
      const scopes1 = ["test", "scopes"];
      const scopes2 = ["different", "scopes"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), false);
    });
    test("scopesMatch should return false for different length arrays", () => {
      const scopes1 = ["test"];
      const scopes2 = ["test", "scopes"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), false);
    });
    test("scopesMatch should handle complex Microsoft scopes", () => {
      const scopes1 = ["6f1cc985-85e8-487e-b0dd-aa633302a731/.default", "VSCODE_TENANT:organizations"];
      const scopes2 = ["VSCODE_TENANT:organizations", "6f1cc985-85e8-487e-b0dd-aa633302a731/.default"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), true);
    });
    test("scopesMatch should handle empty arrays", () => {
      assert.strictEqual(scopesMatch([], []), true);
    });
    test("scopesMatch should handle single scope arrays", () => {
      assert.strictEqual(scopesMatch(["single"], ["single"]), true);
      assert.strictEqual(scopesMatch(["single"], ["different"]), false);
    });
    test("scopesMatch should handle duplicate scopes within arrays", () => {
      const scopes1 = ["scope1", "scope2", "scope1"];
      const scopes2 = ["scope2", "scope1", "scope1"];
      assert.strictEqual(scopesMatch(scopes1, scopes2), true);
    });
    test("scopesMatch should handle undefined values", () => {
      assert.strictEqual(scopesMatch(void 0, void 0), true);
      assert.strictEqual(scopesMatch(["read"], void 0), false);
      assert.strictEqual(scopesMatch(void 0, ["write"]), false);
    });
    test("scopesMatch should handle mixed undefined and empty arrays", () => {
      assert.strictEqual(scopesMatch([], void 0), false);
      assert.strictEqual(scopesMatch(void 0, []), false);
      assert.strictEqual(scopesMatch([], []), true);
    });
  });
  suite("Utility Functions", () => {
    test("getDefaultMetadataForUrl should return correct default endpoints", () => {
      const authorizationServer = new URL("https://auth.example.com");
      const metadata = getDefaultMetadataForUrl(authorizationServer);
      assert.strictEqual(metadata.issuer, "https://auth.example.com/");
      assert.strictEqual(metadata.authorization_endpoint, "https://auth.example.com/authorize");
      assert.strictEqual(metadata.token_endpoint, "https://auth.example.com/token");
      assert.strictEqual(metadata.registration_endpoint, "https://auth.example.com/register");
      assert.deepStrictEqual(metadata.response_types_supported, ["code", "id_token", "id_token token"]);
    });
  });
  suite("Parsing Functions", () => {
    test("parseWWWAuthenticateHeader should correctly parse simple header", () => {
      const result = parseWWWAuthenticateHeader("Bearer");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].scheme, "Bearer");
      assert.deepStrictEqual(result[0].params, {});
    });
    test("parseWWWAuthenticateHeader should correctly parse header with parameters", () => {
      const result = parseWWWAuthenticateHeader('Bearer realm="api", error="invalid_token", error_description="The access token expired"');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].scheme, "Bearer");
      assert.deepStrictEqual(result[0].params, {
        realm: "api",
        error: "invalid_token",
        error_description: "The access token expired"
      });
    });
    test("parseWWWAuthenticateHeader should correctly parse parameters with equal signs", () => {
      const result = parseWWWAuthenticateHeader('Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource?v=1"');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].scheme, "Bearer");
      assert.deepStrictEqual(result[0].params, {
        resource_metadata: "https://example.com/.well-known/oauth-protected-resource?v=1"
      });
    });
    test("parseWWWAuthenticateHeader should correctly parse multiple", () => {
      const result = parseWWWAuthenticateHeader('Bearer realm="api", error="invalid_token", error_description="The access token expired", Basic realm="hi"');
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].scheme, "Bearer");
      assert.deepStrictEqual(result[0].params, {
        realm: "api",
        error: "invalid_token",
        error_description: "The access token expired"
      });
      assert.strictEqual(result[1].scheme, "Basic");
      assert.deepStrictEqual(result[1].params, {
        realm: "hi"
      });
    });
    test("getClaimsFromJWT should correctly parse a JWT token", () => {
      const payload = {
        jti: "id123",
        sub: "user123",
        iss: "https://example.com",
        aud: "client123",
        exp: 1716239022,
        iat: 1716235422,
        name: "Test User"
      };
      const header = { alg: "HS256", typ: "JWT" };
      const encodedHeader = encodeBase64(VSBuffer.fromString(JSON.stringify(header)));
      const encodedPayload = encodeBase64(VSBuffer.fromString(JSON.stringify(payload)));
      const fakeSignature = "fake-signature";
      const token = `${encodedHeader}.${encodedPayload}.${fakeSignature}`;
      const claims = getClaimsFromJWT(token);
      assert.deepStrictEqual(claims, payload);
    });
    test("getClaimsFromJWT should throw for invalid JWT format", () => {
      assert.throws(() => getClaimsFromJWT("only.two"), /Invalid JWT token format.*three parts/);
      assert.throws(() => getClaimsFromJWT("one"), /Invalid JWT token format.*three parts/);
      assert.throws(() => getClaimsFromJWT("has.four.parts.here"), /Invalid JWT token format.*three parts/);
    });
    test("getClaimsFromJWT should throw for invalid header content", () => {
      const encodedHeader = encodeBase64(VSBuffer.fromString("not-json"));
      const encodedPayload = encodeBase64(VSBuffer.fromString(JSON.stringify({ sub: "test" })));
      const token = `${encodedHeader}.${encodedPayload}.signature`;
      assert.throws(() => getClaimsFromJWT(token), /Failed to parse JWT token/);
    });
    test("getClaimsFromJWT should throw for invalid payload content", () => {
      const header = { alg: "HS256", typ: "JWT" };
      const encodedHeader = encodeBase64(VSBuffer.fromString(JSON.stringify(header)));
      const encodedPayload = encodeBase64(VSBuffer.fromString("not-json"));
      const token = `${encodedHeader}.${encodedPayload}.signature`;
      assert.throws(() => getClaimsFromJWT(token), /Failed to parse JWT token/);
    });
  });
  suite("Network Functions", () => {
    let sandbox;
    let fetchStub;
    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub(globalThis, "fetch");
    });
    teardown(() => {
      sandbox.restore();
    });
    test("fetchDynamicRegistration should make correct request and parse response", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client",
        client_uri: "https://code.visualstudio.com"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      const result = await fetchDynamicRegistration(
        serverMetadata,
        "Test Client"
      );
      assert.strictEqual(fetchStub.callCount, 1);
      const [url, options] = fetchStub.firstCall.args;
      assert.strictEqual(url, "https://auth.example.com/register");
      assert.strictEqual(options.method, "POST");
      assert.strictEqual(options.headers["Content-Type"], "application/json");
      const requestBody = JSON.parse(options.body);
      assert.strictEqual(requestBody.client_name, "Test Client");
      assert.strictEqual(requestBody.client_uri, "https://code.visualstudio.com");
      assert.deepStrictEqual(requestBody.grant_types, ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"]);
      assert.deepStrictEqual(requestBody.response_types, ["code"]);
      assert.deepStrictEqual(requestBody.redirect_uris, [
        "https://insiders.vscode.dev/redirect",
        "https://vscode.dev/redirect",
        "http://127.0.0.1/",
        `http://127.0.0.1:${DEFAULT_AUTH_FLOW_PORT}/`
      ]);
      assert.deepStrictEqual(result, mockResponse);
    });
    test("fetchDynamicRegistration should throw error on non-OK response", async () => {
      fetchStub.resolves({
        ok: false,
        statusText: "Bad Request",
        text: async () => "Bad Request"
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: Bad Request/
      );
    });
    test("fetchDynamicRegistration should throw error on invalid response format", async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ({ invalid: "response" })
        // Missing required fields
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Invalid authorization dynamic client registration response/
      );
    });
    test("fetchDynamicRegistration should filter grant types based on server metadata", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "client_credentials", "refresh_token"]
        // Mix of supported and unsupported
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client");
      assert.strictEqual(fetchStub.callCount, 1);
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.deepStrictEqual(requestBody.grant_types, ["authorization_code", "refresh_token"]);
    });
    test("fetchDynamicRegistration should use default grant types when server metadata has none", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
        // No grant_types_supported specified
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client");
      assert.strictEqual(fetchStub.callCount, 1);
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.deepStrictEqual(requestBody.grant_types, ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"]);
    });
    test("fetchDynamicRegistration should throw error when registration endpoint is missing", async () => {
      const serverMetadata = {
        issuer: "https://auth.example.com",
        response_types_supported: ["code"]
        // registration_endpoint is missing
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Server does not support dynamic registration/
      );
    });
    test("fetchDynamicRegistration should handle structured error response", async () => {
      const errorResponse = {
        error: "invalid_client_metadata",
        error_description: "The client metadata is invalid"
      };
      fetchStub.resolves({
        ok: false,
        text: async () => JSON.stringify(errorResponse)
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: invalid_client_metadata: The client metadata is invalid/
      );
    });
    test("fetchDynamicRegistration should handle structured error response without description", async () => {
      const errorResponse = {
        error: "invalid_redirect_uri"
      };
      fetchStub.resolves({
        ok: false,
        text: async () => JSON.stringify(errorResponse)
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: invalid_redirect_uri/
      );
    });
    test("fetchDynamicRegistration should handle malformed JSON error response", async () => {
      fetchStub.resolves({
        ok: false,
        text: async () => "Invalid JSON {"
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: Invalid JSON \{/
      );
    });
    test("fetchDynamicRegistration should include scopes in request when provided", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client", ["read", "write"]);
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.strictEqual(requestBody.scope, "read write");
    });
    test("fetchDynamicRegistration should omit scope from request when not provided", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client");
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.strictEqual(requestBody.scope, void 0);
    });
    test("fetchDynamicRegistration should handle empty scopes array", async () => {
      const mockResponse = {
        client_id: "generated-client-id",
        client_name: "Test Client"
      };
      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await fetchDynamicRegistration(serverMetadata, "Test Client", []);
      const [, options] = fetchStub.firstCall.args;
      const requestBody = JSON.parse(options.body);
      assert.strictEqual(requestBody.scope, "");
    });
    test("fetchDynamicRegistration should handle network fetch failure", async () => {
      fetchStub.rejects(new Error("Network error"));
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Network error/
      );
    });
    test("fetchDynamicRegistration should handle response.json() failure", async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => {
          throw new Error("JSON parsing failed");
        }
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /JSON parsing failed/
      );
    });
    test("fetchDynamicRegistration should handle response.text() failure for error cases", async () => {
      fetchStub.resolves({
        ok: false,
        text: async () => {
          throw new Error("Text parsing failed");
        }
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Text parsing failed/
      );
    });
  });
  suite("Client ID Fallback Scenarios", () => {
    let sandbox;
    let fetchStub;
    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub(globalThis, "fetch");
    });
    teardown(() => {
      sandbox.restore();
    });
    test("fetchDynamicRegistration should throw specific error for missing registration endpoint", async () => {
      const serverMetadata = {
        issuer: "https://auth.example.com",
        response_types_supported: ["code"]
        // registration_endpoint is missing
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        {
          message: "Server does not support dynamic registration"
        }
      );
    });
    test("fetchDynamicRegistration should throw specific error for DCR failure", async () => {
      fetchStub.resolves({
        ok: false,
        text: async () => "DCR not supported"
      });
      const serverMetadata = {
        issuer: "https://auth.example.com",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"]
      };
      await assert.rejects(
        async () => await fetchDynamicRegistration(serverMetadata, "Test Client"),
        /Registration to https:\/\/auth\.example\.com\/register failed: DCR not supported/
      );
    });
  });
  suite("fetchResourceMetadata", () => {
    let sandbox;
    let fetchStub;
    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub();
    });
    teardown(() => {
      sandbox.restore();
    });
    test("should successfully fetch and validate resource metadata", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const expectedMetadata = {
        resource: "https://example.com/api",
        scopes_supported: ["read", "write"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], resourceMetadataUrl);
      assert.strictEqual(fetchStub.firstCall.args[1].method, "GET");
      assert.strictEqual(fetchStub.firstCall.args[1].headers["Accept"], "application/json");
    });
    test("should include same-origin headers when origins match", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value",
        "X-Custom-Header": "value"
      };
      const expectedMetadata = {
        resource: "https://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["Accept"], "application/json");
      assert.strictEqual(headers["X-Test-Header"], "test-value");
      assert.strictEqual(headers["X-Custom-Header"], "value");
    });
    test("should not include same-origin headers when origins differ", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://other-domain.com/.well-known/oauth-protected-resource";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value"
      };
      const expectedMetadata = {
        resource: "https://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["Accept"], "application/json");
      assert.strictEqual(headers["X-Test-Header"], void 0);
    });
    test("should throw error when fetch returns non-200 status", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      fetchStub.resolves({
        status: 404,
        text: async () => "Not Found"
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /Failed to fetch resource metadata from.*404 Not Found/.test(error.message));
          return true;
        }
      );
    });
    test("should handle error when response.text() throws", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      fetchStub.resolves({
        status: 500,
        statusText: "Internal Server Error",
        text: async () => {
          throw new Error("Cannot read response");
        }
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /Failed to fetch resource metadata from.*500 Internal Server Error/.test(error.message));
          return true;
        }
      );
    });
    test("should throw error when resource property does not match target resource", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://different.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError);
          assert.ok(error.errors.some((e) => /does not match expected value/.test(e.message)));
          return true;
        }
      );
    });
    test("should normalize URLs when comparing resource values", async () => {
      const targetResource = "https://EXAMPLE.COM/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, metadata);
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
    });
    test("should throw error when response is not valid resource metadata", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const invalidMetadata = {
        // Missing required 'resource' property
        scopes_supported: ["read", "write"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /Invalid resource metadata/.test(error.message));
          return true;
        }
      );
    });
    test("should throw error when scopes_supported is not an array", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const invalidMetadata = {
        resource: "https://example.com/api",
        scopes_supported: "not an array"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /Invalid resource metadata/.test(error.message));
          return true;
        }
      );
    });
    test("should handle metadata with optional fields", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://example.com/api",
        resource_name: "Example API",
        authorization_servers: ["https://auth.example.com"],
        jwks_uri: "https://example.com/jwks",
        scopes_supported: ["read", "write", "admin"],
        bearer_methods_supported: ["header", "body"],
        resource_documentation: "https://example.com/docs"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, metadata);
    });
    test("should use global fetch when custom fetch is not provided", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://example.com/api"
      };
      const globalFetchStub = sandbox.stub(globalThis, "fetch").resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(targetResource, resourceMetadataUrl);
      assert.deepStrictEqual(result.metadata, metadata);
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      assert.strictEqual(globalFetchStub.callCount, 1);
    });
    test("should handle same origin with different ports", async () => {
      const targetResource = "https://example.com:8080/api";
      const resourceMetadataUrl = "https://example.com:9090/.well-known/oauth-protected-resource";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value"
      };
      const metadata = {
        resource: "https://example.com:8080/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["X-Test-Header"], void 0);
    });
    test("should handle same origin with different protocols", async () => {
      const targetResource = "http://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value"
      };
      const metadata = {
        resource: "http://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["X-Test-Header"], void 0);
    });
    test("should include error details in message with resource values", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const metadata = {
        resource: "https://different.com/other"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => metadata,
        text: async () => JSON.stringify(metadata)
      });
      try {
        await fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub });
        assert.fail("Should have thrown an error");
      } catch (error) {
        const errorMessage = error instanceof AggregateError ? error.errors.map((e) => e.message).join(" ") : error.message;
        assert.ok(/does not match expected value/.test(errorMessage), "Error message should mention mismatch");
        assert.ok(/https:\/\/different\.com\/other/.test(errorMessage), "Error message should include actual resource value");
        assert.ok(/https:\/\/example\.com\/api/.test(errorMessage), "Error message should include expected resource value");
      }
    });
    test("should fallback to well-known URI with path when no resourceMetadataUrl provided", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com/api/v1",
        scopes_supported: ["read", "write"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource/api/v1");
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource/api/v1");
    });
    test("should fallback to well-known URI at root when path version fails", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read", "write"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(fetchStub.callCount, 2);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource/api/v1");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://example.com/.well-known/oauth-protected-resource");
    });
    test("should throw error when all well-known URIs fail", async () => {
      const targetResource = "https://example.com/api/v1";
      fetchStub.resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 2, "Should contain 2 errors");
          assert.ok(/Failed to fetch resource metadata from.*\/api\/v1.*404/.test(error.errors[0].message), "First error should mention /api/v1 and 404");
          assert.ok(/Failed to fetch resource metadata from.*\.well-known.*404/.test(error.errors[1].message), "Second error should mention .well-known and 404");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should not append path when target resource is root", async () => {
      const targetResource = "https://example.com/";
      const expectedMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource");
    });
    test("should include same-origin headers when using well-known fallback", async () => {
      const targetResource = "https://example.com/api";
      const sameOriginHeaders = {
        "X-Test-Header": "test-value",
        "X-Custom-Header": "value"
      };
      const expectedMetadata = {
        resource: "https://example.com/api"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub, sameOriginHeaders }
      );
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource/api");
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["Accept"], "application/json");
      assert.strictEqual(headers["X-Test-Header"], "test-value");
      assert.strictEqual(headers["X-Custom-Header"], "value");
    });
    test("should handle fetchImpl throwing network error and continue to next URL", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read", "write"]
      };
      fetchStub.onFirstCall().rejects(new Error("Network connection failed"));
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.strictEqual(result.errors.length, 1);
      assert.ok(/Network connection failed/.test(result.errors[0].message));
      assert.strictEqual(fetchStub.callCount, 2);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource/api/v1");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://example.com/.well-known/oauth-protected-resource");
    });
    test("should throw AggregateError when fetchImpl throws on all URLs", async () => {
      const targetResource = "https://example.com/api/v1";
      fetchStub.rejects(new Error("Network connection failed"));
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 2, "Should contain 2 errors");
          assert.ok(/Network connection failed/.test(error.errors[0].message), "First error should mention network failure");
          assert.ok(/Network connection failed/.test(error.errors[1].message), "Second error should mention network failure");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should handle mix of fetch error and non-200 response", async () => {
      const targetResource = "https://example.com/api/v1";
      fetchStub.onFirstCall().rejects(new Error("Connection timeout"));
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 2, "Should contain 2 errors");
          assert.ok(/Connection timeout/.test(error.errors[0].message), "First error should be network error");
          assert.ok(/Failed to fetch resource metadata.*404/.test(error.errors[1].message), "Second error should be 404");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should accept root URL in PRM resource when using root discovery fallback (no trailing slash)", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com",
        scopes_supported: ["read", "write"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should accept root URL in PRM resource when using root discovery fallback (with trailing slash)", async () => {
      const targetResource = "https://example.com/api/v1";
      const expectedMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read", "write"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        void 0,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should reject PRM with full path resource when using root discovery fallback", async () => {
      const targetResource = "https://example.com/api/v1";
      const invalidMetadata = {
        resource: "https://example.com/api/v1",
        scopes_supported: ["read"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found"
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 2);
          assert.ok(/404/.test(error.errors[0].message));
          assert.ok(/does not match expected value/.test(error.errors[1].message));
          assert.ok(/https:\/\/example\.com\/api\/v1.*https:\/\/example\.com/.test(error.errors[1].message));
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should reject PRM with root resource when using path-appended discovery", async () => {
      const targetResource = "https://example.com/api/v1";
      const invalidMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      const result = await fetchResourceMetadata(targetResource, void 0, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, invalidMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(fetchStub.callCount, 2);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://example.com/.well-known/oauth-protected-resource/api/v1");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://example.com/.well-known/oauth-protected-resource");
    });
    test("should validate against targetResource when resourceMetadataUrl is explicitly provided", async () => {
      const targetResource = "https://example.com/api/v1";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const validMetadata = {
        resource: "https://example.com/api/v1",
        scopes_supported: ["read"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => validMetadata,
        text: async () => JSON.stringify(validMetadata)
      });
      const result = await fetchResourceMetadata(
        targetResource,
        resourceMetadataUrl,
        { fetch: fetchStub }
      );
      assert.deepStrictEqual(result.metadata, validMetadata);
      assert.strictEqual(result.discoveryUrl, resourceMetadataUrl);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], resourceMetadataUrl);
    });
    test("should fallback to root discovery when explicit resourceMetadataUrl validation fails", async () => {
      const targetResource = "https://example.com/api/v1";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      const invalidMetadata = {
        resource: "https://example.com/",
        scopes_supported: ["read"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata)
      });
      const result = await fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, invalidMetadata);
      assert.strictEqual(result.discoveryUrl, "https://example.com/.well-known/oauth-protected-resource");
      assert.ok(result.errors.length >= 1);
      assert.ok(fetchStub.callCount >= 2);
    });
    test("should handle fetchImpl throwing error with explicit resourceMetadataUrl", async () => {
      const targetResource = "https://example.com/api";
      const resourceMetadataUrl = "https://example.com/.well-known/oauth-protected-resource";
      fetchStub.rejects(new Error("DNS resolution failed"));
      await assert.rejects(
        async () => fetchResourceMetadata(targetResource, resourceMetadataUrl, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError || /DNS resolution failed/.test(error.message));
          return true;
        }
      );
      assert.ok(fetchStub.callCount >= 2);
    });
  });
  suite("fetchAuthorizationServerMetadata", () => {
    let sandbox;
    let fetchStub;
    setup(() => {
      sandbox = sinon.createSandbox();
      fetchStub = sandbox.stub();
    });
    teardown(() => {
      sandbox.restore();
    });
    test("should successfully fetch metadata from OAuth discovery endpoint with path insertion", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        authorization_endpoint: "https://auth.example.com/tenant/authorize",
        token_endpoint: "https://auth.example.com/tenant/token",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.strictEqual(fetchStub.firstCall.args[1].method, "GET");
    });
    test("should fallback to OpenID Connect discovery with path insertion", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        authorization_endpoint: "https://auth.example.com/tenant/authorize",
        token_endpoint: "https://auth.example.com/tenant/token",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/openid-configuration/tenant");
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(fetchStub.callCount, 2);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://auth.example.com/.well-known/openid-configuration/tenant");
    });
    test("should fallback to OpenID Connect discovery with path addition", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        authorization_endpoint: "https://auth.example.com/tenant/authorize",
        token_endpoint: "https://auth.example.com/tenant/token",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onThirdCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/tenant/.well-known/openid-configuration");
      assert.strictEqual(result.errors.length, 2);
      assert.strictEqual(fetchStub.callCount, 3);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.strictEqual(fetchStub.secondCall.args[0], "https://auth.example.com/.well-known/openid-configuration/tenant");
      assert.strictEqual(fetchStub.thirdCall.args[0], "https://auth.example.com/tenant/.well-known/openid-configuration");
    });
    test("should handle authorization server at root without extra path", async () => {
      const authorizationServer = "https://auth.example.com";
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server");
    });
    test("should handle authorization server with trailing slash", async () => {
      const authorizationServer = "https://auth.example.com/tenant/";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant/",
        authorization_endpoint: "https://auth.example.com/tenant/authorize",
        token_endpoint: "https://auth.example.com/tenant/token",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant/");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
    });
    test("should include additional headers in all requests", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const additionalHeaders = {
        "X-Custom-Header": "custom-value",
        "Authorization": "Bearer token123"
      };
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub, additionalHeaders });
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["X-Custom-Header"], "custom-value");
      assert.strictEqual(headers["Authorization"], "Bearer token123");
      assert.strictEqual(headers["Accept"], "application/json");
    });
    test("should throw AggregateError when all discovery endpoints fail", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      fetchStub.resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors (one for each URL)");
          assert.strictEqual(error.message, "Failed to fetch authorization server metadata from all attempted URLs");
          assert.ok(/oauth-authorization-server.*404/.test(error.errors[0].message), "First error should mention OAuth discovery and 404");
          assert.ok(/openid-configuration.*404/.test(error.errors[1].message), "Second error should mention OpenID path insertion and 404");
          assert.ok(/openid-configuration.*404/.test(error.errors[2].message), "Third error should mention OpenID path addition and 404");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should throw single error (not AggregateError) when only one URL is tried and fails", async () => {
      const authorizationServer = "https://auth.example.com";
      fetchStub.onFirstCall().resolves({
        status: 500,
        text: async () => "Internal Server Error",
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        response_types_supported: ["code"]
      };
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.errors.length, 1);
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should throw AggregateError when multiple URLs fail with mixed error types", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      fetchStub.onFirstCall().rejects(new Error("Connection timeout"));
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onThirdCall().resolves({
        status: 500,
        text: async () => "Internal Server Error",
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors");
          assert.ok(/Connection timeout/.test(error.errors[0].message), "First error should be network error");
          assert.ok(/404.*Not Found/.test(error.errors[1].message), "Second error should be 404");
          assert.ok(/500.*Internal Server Error/.test(error.errors[2].message), "Third error should be 500");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should handle invalid JSON response", async () => {
      const authorizationServer = "https://auth.example.com";
      fetchStub.resolves({
        status: 200,
        json: async () => {
          throw new Error("Invalid JSON");
        },
        text: async () => "Invalid JSON",
        statusText: "OK"
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        /Failed to fetch authorization server metadata/
      );
    });
    test("should handle valid JSON but invalid metadata structure", async () => {
      const authorizationServer = "https://auth.example.com";
      const invalidMetadata = {
        // Missing required 'issuer' field
        authorization_endpoint: "https://auth.example.com/authorize"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidMetadata,
        text: async () => JSON.stringify(invalidMetadata),
        statusText: "OK"
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        /Failed to fetch authorization server metadata/
      );
    });
    test("should use global fetch when custom fetch is not provided", async () => {
      const authorizationServer = "https://auth.example.com";
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        response_types_supported: ["code"]
      };
      const globalFetchStub = sandbox.stub(globalThis, "fetch").resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer);
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(globalFetchStub.callCount, 1);
    });
    test("should handle network fetch failure and continue to next endpoint", async () => {
      const authorizationServer = "https://auth.example.com";
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().rejects(new Error("Network error"));
      fetchStub.onSecondCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.errors.length, 1);
      assert.ok(/Network error/.test(result.errors[0].message));
      assert.strictEqual(fetchStub.callCount, 2);
    });
    test("should throw error when network fails on all endpoints", async () => {
      const authorizationServer = "https://auth.example.com";
      fetchStub.rejects(new Error("Network error"));
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors");
          assert.strictEqual(error.message, "Failed to fetch authorization server metadata from all attempted URLs");
          assert.ok(/Network error/.test(error.errors[0].message), "First error should be network error");
          assert.ok(/Network error/.test(error.errors[1].message), "Second error should be network error");
          assert.ok(/Network error/.test(error.errors[2].message), "Third error should be network error");
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should handle mix of network error and non-200 response", async () => {
      const authorizationServer = "https://auth.example.com/tenant";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().rejects(new Error("Connection timeout"));
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onThirdCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.errors.length, 2);
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should handle response.text() failure in error case", async () => {
      const authorizationServer = "https://auth.example.com";
      fetchStub.resolves({
        status: 500,
        text: async () => {
          throw new Error("Cannot read text");
        },
        statusText: "Internal Server Error",
        json: async () => {
          throw new Error("Cannot read json");
        }
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors");
          for (const err of error.errors) {
            assert.ok(/500 Internal Server Error/.test(err.message), `Error should mention 500 and statusText: ${err.message}`);
          }
          return true;
        }
      );
    });
    test("should correctly handle path addition with trailing slash", async () => {
      const authorizationServer = "https://auth.example.com/tenant/";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant/",
        response_types_supported: ["code"]
      };
      fetchStub.onFirstCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onSecondCall().resolves({
        status: 404,
        text: async () => "Not Found",
        statusText: "Not Found",
        json: async () => {
          throw new Error("Not JSON");
        }
      });
      fetchStub.onThirdCall().resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/tenant/.well-known/openid-configuration");
      assert.strictEqual(result.errors.length, 2);
      assert.strictEqual(fetchStub.callCount, 3);
      assert.strictEqual(fetchStub.thirdCall.args[0], "https://auth.example.com/tenant/.well-known/openid-configuration");
    });
    test("should handle deeply nested paths", async () => {
      const authorizationServer = "https://auth.example.com/tenant/org/sub";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant/org/sub",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant/org/sub");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
      assert.strictEqual(fetchStub.firstCall.args[0], "https://auth.example.com/.well-known/oauth-authorization-server/tenant/org/sub");
    });
    test("should handle 200 response with non-metadata JSON", async () => {
      const authorizationServer = "https://auth.example.com";
      const invalidResponse = {
        error: "not_supported",
        message: "Metadata not available"
      };
      fetchStub.resolves({
        status: 200,
        json: async () => invalidResponse,
        text: async () => JSON.stringify(invalidResponse),
        statusText: "OK"
      });
      await assert.rejects(
        async () => fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub }),
        (error) => {
          assert.ok(error instanceof AggregateError, "Should be an AggregateError");
          assert.strictEqual(error.errors.length, 3, "Should contain 3 errors");
          for (const err of error.errors) {
            assert.ok(/Failed to fetch authorization server metadata from/.test(err.message), `Error should mention failed fetch: ${err.message}`);
          }
          return true;
        }
      );
      assert.strictEqual(fetchStub.callCount, 3);
    });
    test("should validate metadata according to isAuthorizationServerMetadata", async () => {
      const authorizationServer = "https://auth.example.com";
      const validMetadata = {
        issuer: "https://auth.example.com/",
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        jwks_uri: "https://auth.example.com/jwks",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code", "token"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => validMetadata,
        text: async () => JSON.stringify(validMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, validMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
    });
    test("should handle URLs with query parameters", async () => {
      const authorizationServer = "https://auth.example.com/tenant?version=v2";
      const expectedMetadata = {
        issuer: "https://auth.example.com/tenant?version=v2",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub });
      assert.deepStrictEqual(result.metadata, expectedMetadata);
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server/tenant");
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(fetchStub.callCount, 1);
    });
    test("should handle empty additionalHeaders", async () => {
      const authorizationServer = "https://auth.example.com";
      const expectedMetadata = {
        issuer: "https://auth.example.com/",
        response_types_supported: ["code"]
      };
      fetchStub.resolves({
        status: 200,
        json: async () => expectedMetadata,
        text: async () => JSON.stringify(expectedMetadata),
        statusText: "OK"
      });
      const result = await fetchAuthorizationServerMetadata(authorizationServer, { fetch: fetchStub, additionalHeaders: {} });
      assert.strictEqual(result.discoveryUrl, "https://auth.example.com/.well-known/oauth-authorization-server");
      const headers = fetchStub.firstCall.args[1].headers;
      assert.strictEqual(headers["Accept"], "application/json");
    });
  });
  suite("Cross App Access (ID-JAG) wire format", () => {
    test("buildIdJagExchangeBody emits the exact spec parameters", () => {
      const body = buildIdJagExchangeBody(
        "my_idp_client_id",
        "secret_xyz",
        "<id_token>",
        "https://auth.resource.example.com",
        "https://api.resource.example.com",
        ["todos.read", "mcp.access"]
      );
      assert.strictEqual(body.get("client_id"), "my_idp_client_id");
      assert.strictEqual(body.get("client_secret"), "secret_xyz");
      assert.strictEqual(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:token-exchange");
      assert.strictEqual(body.get("subject_token"), "<id_token>");
      assert.strictEqual(body.get("subject_token_type"), "urn:ietf:params:oauth:token-type:id_token");
      assert.strictEqual(body.get("requested_token_type"), "urn:ietf:params:oauth:token-type:id-jag");
      assert.strictEqual(body.get("audience"), "https://auth.resource.example.com");
      assert.strictEqual(body.get("resource"), "https://api.resource.example.com");
      assert.strictEqual(body.get("scope"), "todos.read mcp.access");
    });
    test("buildIdJagExchangeBody omits client_secret when not provided", () => {
      const body = buildIdJagExchangeBody(
        "public_client_id",
        void 0,
        "<id_token>",
        "https://auth.resource.example.com",
        void 0,
        []
      );
      assert.strictEqual(body.has("client_secret"), false);
      assert.strictEqual(body.has("resource"), false);
      assert.strictEqual(body.has("scope"), false);
    });
    test("buildResourceRedemptionBody emits an RFC 7523 JWT-bearer grant", () => {
      const body = buildResourceRedemptionBody(
        "my_idp_client_id-at-todo0",
        "secret_xyz",
        "<id_jag>",
        "https://api.resource.example.com",
        ["todos.read", "mcp.access"]
      );
      assert.strictEqual(body.get("client_id"), "my_idp_client_id-at-todo0");
      assert.strictEqual(body.get("client_secret"), "secret_xyz");
      assert.strictEqual(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      assert.strictEqual(body.get("assertion"), "<id_jag>");
      assert.strictEqual(body.get("resource"), "https://api.resource.example.com");
      assert.strictEqual(body.get("scope"), "todos.read mcp.access");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXG9hdXRoLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7XG5cdGJ1aWxkSWRKYWdFeGNoYW5nZUJvZHksXG5cdGJ1aWxkUmVzb3VyY2VSZWRlbXB0aW9uQm9keSxcblx0Z2V0Q2xhaW1zRnJvbUpXVCxcblx0Z2V0RGVmYXVsdE1ldGFkYXRhRm9yVXJsLFxuXHRpc0F1dGhvcml6YXRpb25BdXRob3JpemVSZXNwb25zZSxcblx0aXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2UsXG5cdGlzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2UsXG5cdGlzQXV0aG9yaXphdGlvbkR5bmFtaWNDbGllbnRSZWdpc3RyYXRpb25SZXNwb25zZSxcblx0aXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSxcblx0aXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsXG5cdGlzQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UsXG5cdHBhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyLFxuXHRmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24sXG5cdGZldGNoUmVzb3VyY2VNZXRhZGF0YSxcblx0ZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEsXG5cdHNjb3Blc01hdGNoLFxuXHRJQXV0aG9yaXphdGlvbkpXVENsYWltcyxcblx0SUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSxcblx0REVGQVVMVF9BVVRIX0ZMT1dfUE9SVFxufSBmcm9tICcuLi8uLi9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2J1ZmZlci5qcyc7XG5cbnN1aXRlKCdPQXV0aCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHN1aXRlKCdUeXBlIEd1YXJkcycsICgpID0+IHtcblx0XHR0ZXN0KCdpc0F1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIHNob3VsZCBjb3JyZWN0bHkgaWRlbnRpZnkgcHJvdGVjdGVkIHJlc291cmNlIG1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdFx0Ly8gVmFsaWQgbWV0YWRhdGEgd2l0aCBtaW5pbWFsIHJlcXVpcmVkIGZpZWxkc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEoeyByZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20nIH0pLCB0cnVlKTtcblxuXHRcdFx0Ly8gVmFsaWQgbWV0YWRhdGEgd2l0aCBzY29wZXNfc3VwcG9ydGVkIGFzIGFycmF5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSh7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCcsICd3cml0ZSddXG5cdFx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRcdC8vIEludmFsaWQgY2FzZXMgLSBtaXNzaW5nIHJlc291cmNlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YShudWxsKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEodW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEoe30pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSgnbm90IGFuIG9iamVjdCcpLCBmYWxzZSk7XG5cblx0XHRcdC8vIEludmFsaWQgY2FzZXMgLSBzY29wZXNfc3VwcG9ydGVkIGlzIG5vdCBhbiBhcnJheSB3aGVuIHByb3ZpZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSh7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6ICdub3QgYW4gYXJyYXknXG5cdFx0XHR9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgc2hvdWxkIGNvcnJlY3RseSBpZGVudGlmeSBzZXJ2ZXIgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0XHQvLyBWYWxpZCBtZXRhZGF0YSB3aXRoIG1pbmltYWwgcmVxdWlyZWQgZmllbGRzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoe1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHQvLyBWYWxpZCBtZXRhZGF0YSB3aXRoIHZhbGlkIFVSTHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hdXRoJyxcblx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6ICdodHRwczovL2V4YW1wbGUuY29tL3Rva2VuJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdGp3a3NfdXJpOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9qd2tzJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHQvLyBWYWxpZCBtZXRhZGF0YSB3aXRoIGh0dHAgVVJMcyAoZm9yIGxvY2FsaG9zdC90ZXN0aW5nKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cDovL2xvY2FsaG9zdDo4MDgwJyxcblx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogJ2h0dHA6Ly9sb2NhbGhvc3Q6ODA4MC9hdXRoJyxcblx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6ICdodHRwOi8vbG9jYWxob3N0OjgwODAvdG9rZW4nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRcdC8vIEludmFsaWQgY2FzZXMgLSBub3QgYW4gb2JqZWN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEobnVsbCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoJ25vdCBhbiBvYmplY3QnKSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBJbnZhbGlkIGNhc2VzIC0gbWlzc2luZyBpc3N1ZXIgc2hvdWxkIHRocm93XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKHt9KSwgL0F1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhIG11c3QgaGF2ZSBhbiBpc3N1ZXIvKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoeyByZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddIH0pLCAvQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgbXVzdCBoYXZlIGFuIGlzc3Vlci8pO1xuXG5cdFx0XHQvLyBJbnZhbGlkIGNhc2VzIC0gVVJJIGZpZWxkcyBtdXN0IGJlIHN0cmluZ3Mgd2hlbiBwcm92aWRlZCAodHJ1dGh5IHZhbHVlcylcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoe1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogMTIzLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9KSwgL0F1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhICdhdXRob3JpemF0aW9uX2VuZHBvaW50JyBtdXN0IGJlIGEgc3RyaW5nLyk7XG5cblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoe1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6IDEyMyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fSksIC9BdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSAndG9rZW5fZW5kcG9pbnQnIG11c3QgYmUgYSBzdHJpbmcvKTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6IFtdLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9KSwgL0F1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhICdyZWdpc3RyYXRpb25fZW5kcG9pbnQnIG11c3QgYmUgYSBzdHJpbmcvKTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRqd2tzX3VyaToge30sXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH0pLCAvQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgJ2p3a3NfdXJpJyBtdXN0IGJlIGEgc3RyaW5nLyk7XG5cblx0XHRcdC8vIEludmFsaWQgY2FzZXMgLSBVUkkgZmllbGRzIG11c3Qgc3RhcnQgd2l0aCBodHRwOi8vIG9yIGh0dHBzOi8vXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKHtcblx0XHRcdFx0aXNzdWVyOiAnZnRwOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9KSwgL0F1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhICdpc3N1ZXInIG11c3Qgc3RhcnQgd2l0aCBodHRwOlxcL1xcLyBvciBodHRwczpcXC9cXC8vKTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiAnZnRwOi8vZXhhbXBsZS5jb20vYXV0aCcsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH0pLCAvQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgJ2F1dGhvcml6YXRpb25fZW5kcG9pbnQnIG11c3Qgc3RhcnQgd2l0aCBodHRwOlxcL1xcLyBvciBodHRwczpcXC9cXC8vKTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSh7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR0b2tlbl9lbmRwb2ludDogJ2ZpbGU6Ly8vcGF0aC90by90b2tlbicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH0pLCAvQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgJ3Rva2VuX2VuZHBvaW50JyBtdXN0IHN0YXJ0IHdpdGggaHR0cDpcXC9cXC8gb3IgaHR0cHM6XFwvXFwvLyk7XG5cblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoe1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnbWFpbHRvOmFkbWluQGV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fSksIC9BdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSAncmVnaXN0cmF0aW9uX2VuZHBvaW50JyBtdXN0IHN0YXJ0IHdpdGggaHR0cDpcXC9cXC8gb3IgaHR0cHM6XFwvXFwvLyk7XG5cblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoe1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdFx0andrc191cmk6ICdkYXRhOmFwcGxpY2F0aW9uL2pzb24se30nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9KSwgL0F1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhICdqd2tzX3VyaScgbXVzdCBzdGFydCB3aXRoIGh0dHA6XFwvXFwvIG9yIGh0dHBzOlxcL1xcLy8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaXNBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlc3BvbnNlIHNob3VsZCBjb3JyZWN0bHkgaWRlbnRpZnkgcmVnaXN0cmF0aW9uIHJlc3BvbnNlJywgKCkgPT4ge1xuXHRcdFx0Ly8gVmFsaWQgcmVzcG9uc2Vcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25EeW5hbWljQ2xpZW50UmVnaXN0cmF0aW9uUmVzcG9uc2Uoe1xuXHRcdFx0XHRjbGllbnRfaWQ6ICdjbGllbnQtMTIzJyxcblx0XHRcdFx0Y2xpZW50X25hbWU6ICdUZXN0IENsaWVudCdcblx0XHRcdH0pLCB0cnVlKTtcblxuXHRcdFx0Ly8gSW52YWxpZCBjYXNlc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkR5bmFtaWNDbGllbnRSZWdpc3RyYXRpb25SZXNwb25zZShudWxsKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkR5bmFtaWNDbGllbnRSZWdpc3RyYXRpb25SZXNwb25zZSh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlc3BvbnNlKHt9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkR5bmFtaWNDbGllbnRSZWdpc3RyYXRpb25SZXNwb25zZSh7IGNsaWVudF9pZDogJ2p1c3QtaWQnIH0pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25EeW5hbWljQ2xpZW50UmVnaXN0cmF0aW9uUmVzcG9uc2UoeyBjbGllbnRfbmFtZTogJ21pc3NpbmctaWQnIH0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlc3BvbnNlKCdub3QgYW4gb2JqZWN0JyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzQXV0aG9yaXphdGlvbkF1dGhvcml6ZVJlc3BvbnNlIHNob3VsZCBjb3JyZWN0bHkgaWRlbnRpZnkgYXV0aG9yaXphdGlvbiByZXNwb25zZScsICgpID0+IHtcblx0XHRcdC8vIFZhbGlkIHJlc3BvbnNlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uQXV0aG9yaXplUmVzcG9uc2Uoe1xuXHRcdFx0XHRjb2RlOiAnYXV0aC1jb2RlLTEyMycsXG5cdFx0XHRcdHN0YXRlOiAnc3RhdGUtMTIzJ1xuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHQvLyBJbnZhbGlkIGNhc2VzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uQXV0aG9yaXplUmVzcG9uc2UobnVsbCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25BdXRob3JpemVSZXNwb25zZSh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uQXV0aG9yaXplUmVzcG9uc2Uoe30pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uQXV0aG9yaXplUmVzcG9uc2UoeyBjb2RlOiAnbWlzc2luZy1zdGF0ZScgfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25BdXRob3JpemVSZXNwb25zZSh7IHN0YXRlOiAnbWlzc2luZy1jb2RlJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkF1dGhvcml6ZVJlc3BvbnNlKCdub3QgYW4gb2JqZWN0JyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2Ugc2hvdWxkIGNvcnJlY3RseSBpZGVudGlmeSB0b2tlbiByZXNwb25zZScsICgpID0+IHtcblx0XHRcdC8vIFZhbGlkIHJlc3BvbnNlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSh7XG5cdFx0XHRcdGFjY2Vzc190b2tlbjogJ3Rva2VuLTEyMycsXG5cdFx0XHRcdHRva2VuX3R5cGU6ICdCZWFyZXInXG5cdFx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRcdC8vIEludmFsaWQgY2FzZXNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlKG51bGwpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSh7fSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlKHsgYWNjZXNzX3Rva2VuOiAnbWlzc2luZy10eXBlJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2UoeyB0b2tlbl90eXBlOiAnbWlzc2luZy10b2tlbicgfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlKCdub3QgYW4gb2JqZWN0JyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlIHNob3VsZCBjb3JyZWN0bHkgaWRlbnRpZnkgZGV2aWNlIGF1dGhvcml6YXRpb24gcmVzcG9uc2UnLCAoKSA9PiB7XG5cdFx0XHQvLyBWYWxpZCByZXNwb25zZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKHtcblx0XHRcdFx0ZGV2aWNlX2NvZGU6ICdkZXZpY2UtY29kZS0xMjMnLFxuXHRcdFx0XHR1c2VyX2NvZGU6ICdBQkNELUVGR0gnLFxuXHRcdFx0XHR2ZXJpZmljYXRpb25fdXJpOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS92ZXJpZnknLFxuXHRcdFx0XHRleHBpcmVzX2luOiAxODAwXG5cdFx0XHR9KSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFZhbGlkIHJlc3BvbnNlIHdpdGggb3B0aW9uYWwgZmllbGRzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2Uoe1xuXHRcdFx0XHRkZXZpY2VfY29kZTogJ2RldmljZS1jb2RlLTEyMycsXG5cdFx0XHRcdHVzZXJfY29kZTogJ0FCQ0QtRUZHSCcsXG5cdFx0XHRcdHZlcmlmaWNhdGlvbl91cmk6ICdodHRwczovL2V4YW1wbGUuY29tL3ZlcmlmeScsXG5cdFx0XHRcdHZlcmlmaWNhdGlvbl91cmlfY29tcGxldGU6ICdodHRwczovL2V4YW1wbGUuY29tL3ZlcmlmeT91c2VyX2NvZGU9QUJDRC1FRkdIJyxcblx0XHRcdFx0ZXhwaXJlc19pbjogMTgwMCxcblx0XHRcdFx0aW50ZXJ2YWw6IDVcblx0XHRcdH0pLCB0cnVlKTtcblxuXHRcdFx0Ly8gSW52YWxpZCBjYXNlc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKG51bGwpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRGV2aWNlUmVzcG9uc2UodW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKHt9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKHsgZGV2aWNlX2NvZGU6ICdtaXNzaW5nLW90aGVycycgfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25EZXZpY2VSZXNwb25zZSh7IHVzZXJfY29kZTogJ21pc3Npbmctb3RoZXJzJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKHsgdmVyaWZpY2F0aW9uX3VyaTogJ21pc3Npbmctb3RoZXJzJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKHsgZXhwaXJlc19pbjogMTgwMCB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKHtcblx0XHRcdFx0ZGV2aWNlX2NvZGU6ICdkZXZpY2UtY29kZS0xMjMnLFxuXHRcdFx0XHR1c2VyX2NvZGU6ICdBQkNELUVGR0gnLFxuXHRcdFx0XHR2ZXJpZmljYXRpb25fdXJpOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS92ZXJpZnknXG5cdFx0XHRcdC8vIE1pc3NpbmcgZXhwaXJlc19pblxuXHRcdFx0fSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25EZXZpY2VSZXNwb25zZSgnbm90IGFuIG9iamVjdCcpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpc0F1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlIHNob3VsZCBjb3JyZWN0bHkgaWRlbnRpZnkgZXJyb3IgcmVzcG9uc2UnLCAoKSA9PiB7XG5cdFx0XHQvLyBWYWxpZCBlcnJvciByZXNwb25zZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2Uoe1xuXHRcdFx0XHRlcnJvcjogJ2F1dGhvcml6YXRpb25fcGVuZGluZycsXG5cdFx0XHRcdGVycm9yX2Rlc2NyaXB0aW9uOiAnVGhlIGF1dGhvcml6YXRpb24gcmVxdWVzdCBpcyBzdGlsbCBwZW5kaW5nJ1xuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHQvLyBWYWxpZCBlcnJvciByZXNwb25zZSB3aXRoIGRpZmZlcmVudCBlcnJvciBjb2Rlc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2Uoe1xuXHRcdFx0XHRlcnJvcjogJ3Nsb3dfZG93bicsXG5cdFx0XHRcdGVycm9yX2Rlc2NyaXB0aW9uOiAnUG9sbGluZyB0b28gZmFzdCdcblx0XHRcdH0pLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2Uoe1xuXHRcdFx0XHRlcnJvcjogJ2FjY2Vzc19kZW5pZWQnLFxuXHRcdFx0XHRlcnJvcl9kZXNjcmlwdGlvbjogJ1RoZSB1c2VyIGRlbmllZCB0aGUgcmVxdWVzdCdcblx0XHRcdH0pLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2Uoe1xuXHRcdFx0XHRlcnJvcjogJ2V4cGlyZWRfdG9rZW4nLFxuXHRcdFx0XHRlcnJvcl9kZXNjcmlwdGlvbjogJ1RoZSBkZXZpY2UgY29kZSBoYXMgZXhwaXJlZCdcblx0XHRcdH0pLCB0cnVlKTtcblxuXHRcdFx0Ly8gVmFsaWQgcmVzcG9uc2Ugd2l0aCBvcHRpb25hbCBlcnJvcl91cmlcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlKHtcblx0XHRcdFx0ZXJyb3I6ICdpbnZhbGlkX3JlcXVlc3QnLFxuXHRcdFx0XHRlcnJvcl9kZXNjcmlwdGlvbjogJ1RoZSByZXF1ZXN0IGlzIG1pc3NpbmcgYSByZXF1aXJlZCBwYXJhbWV0ZXInLFxuXHRcdFx0XHRlcnJvcl91cmk6ICdodHRwczovL2V4YW1wbGUuY29tL2Vycm9yJ1xuXHRcdFx0fSksIHRydWUpO1xuXG5cdFx0XHQvLyBJbnZhbGlkIGNhc2VzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZShudWxsKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2UodW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2Uoe30pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZSh7IGVycm9yX2Rlc2NyaXB0aW9uOiAnbWlzc2luZy1lcnJvcicgfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0F1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlKCdub3QgYW4gb2JqZWN0JyksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Njb3BlIE1hdGNoaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Njb3Blc01hdGNoIHNob3VsZCByZXR1cm4gdHJ1ZSBmb3IgaWRlbnRpY2FsIHNjb3BlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjb3BlczEgPSBbJ3Rlc3QnLCAnc2NvcGVzJ107XG5cdFx0XHRjb25zdCBzY29wZXMyID0gWyd0ZXN0JywgJ3Njb3BlcyddO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKHNjb3BlczEsIHNjb3BlczIpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Njb3Blc01hdGNoIHNob3VsZCByZXR1cm4gdHJ1ZSBmb3Igc2NvcGVzIGluIGRpZmZlcmVudCBvcmRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjb3BlczEgPSBbJzZmMWNjOTg1LTg1ZTgtNDg3ZS1iMGRkLWFhNjMzMzAyYTczMS8uZGVmYXVsdCcsICdWU0NPREVfVEVOQU5UOm9yZ2FuaXphdGlvbnMnXTtcblx0XHRcdGNvbnN0IHNjb3BlczIgPSBbJ1ZTQ09ERV9URU5BTlQ6b3JnYW5pemF0aW9ucycsICc2ZjFjYzk4NS04NWU4LTQ4N2UtYjBkZC1hYTYzMzMwMmE3MzEvLmRlZmF1bHQnXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaChzY29wZXMxLCBzY29wZXMyKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY29wZXNNYXRjaCBzaG91bGQgcmV0dXJuIGZhbHNlIGZvciBkaWZmZXJlbnQgc2NvcGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcGVzMSA9IFsndGVzdCcsICdzY29wZXMnXTtcblx0XHRcdGNvbnN0IHNjb3BlczIgPSBbJ2RpZmZlcmVudCcsICdzY29wZXMnXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaChzY29wZXMxLCBzY29wZXMyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NvcGVzTWF0Y2ggc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgZGlmZmVyZW50IGxlbmd0aCBhcnJheXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY29wZXMxID0gWyd0ZXN0J107XG5cdFx0XHRjb25zdCBzY29wZXMyID0gWyd0ZXN0JywgJ3Njb3BlcyddO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKHNjb3BlczEsIHNjb3BlczIpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY29wZXNNYXRjaCBzaG91bGQgaGFuZGxlIGNvbXBsZXggTWljcm9zb2Z0IHNjb3BlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjb3BlczEgPSBbJzZmMWNjOTg1LTg1ZTgtNDg3ZS1iMGRkLWFhNjMzMzAyYTczMS8uZGVmYXVsdCcsICdWU0NPREVfVEVOQU5UOm9yZ2FuaXphdGlvbnMnXTtcblx0XHRcdGNvbnN0IHNjb3BlczIgPSBbJ1ZTQ09ERV9URU5BTlQ6b3JnYW5pemF0aW9ucycsICc2ZjFjYzk4NS04NWU4LTQ4N2UtYjBkZC1hYTYzMzMwMmE3MzEvLmRlZmF1bHQnXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaChzY29wZXMxLCBzY29wZXMyKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY29wZXNNYXRjaCBzaG91bGQgaGFuZGxlIGVtcHR5IGFycmF5cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaChbXSwgW10pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Njb3Blc01hdGNoIHNob3VsZCBoYW5kbGUgc2luZ2xlIHNjb3BlIGFycmF5cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaChbJ3NpbmdsZSddLCBbJ3NpbmdsZSddKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcGVzTWF0Y2goWydzaW5nbGUnXSwgWydkaWZmZXJlbnQnXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Njb3Blc01hdGNoIHNob3VsZCBoYW5kbGUgZHVwbGljYXRlIHNjb3BlcyB3aXRoaW4gYXJyYXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcGVzMSA9IFsnc2NvcGUxJywgJ3Njb3BlMicsICdzY29wZTEnXTtcblx0XHRcdGNvbnN0IHNjb3BlczIgPSBbJ3Njb3BlMicsICdzY29wZTEnLCAnc2NvcGUxJ107XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcGVzTWF0Y2goc2NvcGVzMSwgc2NvcGVzMiksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NvcGVzTWF0Y2ggc2hvdWxkIGhhbmRsZSB1bmRlZmluZWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcGVzTWF0Y2goWydyZWFkJ10sIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaCh1bmRlZmluZWQsIFsnd3JpdGUnXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Njb3Blc01hdGNoIHNob3VsZCBoYW5kbGUgbWl4ZWQgdW5kZWZpbmVkIGFuZCBlbXB0eSBhcnJheXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcGVzTWF0Y2goW10sIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZXNNYXRjaCh1bmRlZmluZWQsIFtdKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3Blc01hdGNoKFtdLCBbXSksIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVXRpbGl0eSBGdW5jdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZ2V0RGVmYXVsdE1ldGFkYXRhRm9yVXJsIHNob3VsZCByZXR1cm4gY29ycmVjdCBkZWZhdWx0IGVuZHBvaW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSBuZXcgVVJMKCdodHRwczovL2F1dGguZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gZ2V0RGVmYXVsdE1ldGFkYXRhRm9yVXJsKGF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWV0YWRhdGEuaXNzdWVyLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ldGFkYXRhLmF1dGhvcml6YXRpb25fZW5kcG9pbnQsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vYXV0aG9yaXplJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWV0YWRhdGEudG9rZW5fZW5kcG9pbnQsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdG9rZW4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXRhZGF0YS5yZWdpc3RyYXRpb25fZW5kcG9pbnQsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vcmVnaXN0ZXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWV0YWRhdGEucmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkLCBbJ2NvZGUnLCAnaWRfdG9rZW4nLCAnaWRfdG9rZW4gdG9rZW4nXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQYXJzaW5nIEZ1bmN0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlciBzaG91bGQgY29ycmVjdGx5IHBhcnNlIHNpbXBsZSBoZWFkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlcignQmVhcmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnNjaGVtZSwgJ0JlYXJlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0ucGFyYW1zLCB7fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlciBzaG91bGQgY29ycmVjdGx5IHBhcnNlIGhlYWRlciB3aXRoIHBhcmFtZXRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlcignQmVhcmVyIHJlYWxtPVwiYXBpXCIsIGVycm9yPVwiaW52YWxpZF90b2tlblwiLCBlcnJvcl9kZXNjcmlwdGlvbj1cIlRoZSBhY2Nlc3MgdG9rZW4gZXhwaXJlZFwiJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uc2NoZW1lLCAnQmVhcmVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXS5wYXJhbXMsIHtcblx0XHRcdFx0cmVhbG06ICdhcGknLFxuXHRcdFx0XHRlcnJvcjogJ2ludmFsaWRfdG9rZW4nLFxuXHRcdFx0XHRlcnJvcl9kZXNjcmlwdGlvbjogJ1RoZSBhY2Nlc3MgdG9rZW4gZXhwaXJlZCdcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VXV1dBdXRoZW50aWNhdGVIZWFkZXIgc2hvdWxkIGNvcnJlY3RseSBwYXJzZSBwYXJhbWV0ZXJzIHdpdGggZXF1YWwgc2lnbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlcignQmVhcmVyIHJlc291cmNlX21ldGFkYXRhPVwiaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2U/dj0xXCInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uc2NoZW1lLCAnQmVhcmVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXS5wYXJhbXMsIHtcblx0XHRcdFx0cmVzb3VyY2VfbWV0YWRhdGE6ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZT92PTEnXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlV1dXQXV0aGVudGljYXRlSGVhZGVyIHNob3VsZCBjb3JyZWN0bHkgcGFyc2UgbXVsdGlwbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlcignQmVhcmVyIHJlYWxtPVwiYXBpXCIsIGVycm9yPVwiaW52YWxpZF90b2tlblwiLCBlcnJvcl9kZXNjcmlwdGlvbj1cIlRoZSBhY2Nlc3MgdG9rZW4gZXhwaXJlZFwiLCBCYXNpYyByZWFsbT1cImhpXCInKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5zY2hlbWUsICdCZWFyZXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLnBhcmFtcywge1xuXHRcdFx0XHRyZWFsbTogJ2FwaScsXG5cdFx0XHRcdGVycm9yOiAnaW52YWxpZF90b2tlbicsXG5cdFx0XHRcdGVycm9yX2Rlc2NyaXB0aW9uOiAnVGhlIGFjY2VzcyB0b2tlbiBleHBpcmVkJ1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLnNjaGVtZSwgJ0Jhc2ljJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFsxXS5wYXJhbXMsIHtcblx0XHRcdFx0cmVhbG06ICdoaSdcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdnZXRDbGFpbXNGcm9tSldUIHNob3VsZCBjb3JyZWN0bHkgcGFyc2UgYSBKV1QgdG9rZW4nLCAoKSA9PiB7XG5cdFx0XHQvLyBDcmVhdGUgYSBzYW1wbGUgSldUIHdpdGgga25vd24gcGF5bG9hZFxuXHRcdFx0Y29uc3QgcGF5bG9hZDogSUF1dGhvcml6YXRpb25KV1RDbGFpbXMgPSB7XG5cdFx0XHRcdGp0aTogJ2lkMTIzJyxcblx0XHRcdFx0c3ViOiAndXNlcjEyMycsXG5cdFx0XHRcdGlzczogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRhdWQ6ICdjbGllbnQxMjMnLFxuXHRcdFx0XHRleHA6IDE3MTYyMzkwMjIsXG5cdFx0XHRcdGlhdDogMTcxNjIzNTQyMixcblx0XHRcdFx0bmFtZTogJ1Rlc3QgVXNlcidcblx0XHRcdH07XG5cblx0XHRcdC8vIENyZWF0ZSBmYWtlIGJ1dCBwcm9wZXJseSBmb3JtYXR0ZWQgSldUXG5cdFx0XHRjb25zdCBoZWFkZXIgPSB7IGFsZzogJ0hTMjU2JywgdHlwOiAnSldUJyB9O1xuXHRcdFx0Y29uc3QgZW5jb2RlZEhlYWRlciA9IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGhlYWRlcikpKTtcblx0XHRcdGNvbnN0IGVuY29kZWRQYXlsb2FkID0gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpKTtcblx0XHRcdGNvbnN0IGZha2VTaWduYXR1cmUgPSAnZmFrZS1zaWduYXR1cmUnO1xuXHRcdFx0Y29uc3QgdG9rZW4gPSBgJHtlbmNvZGVkSGVhZGVyfS4ke2VuY29kZWRQYXlsb2FkfS4ke2Zha2VTaWduYXR1cmV9YDtcblxuXHRcdFx0Y29uc3QgY2xhaW1zID0gZ2V0Q2xhaW1zRnJvbUpXVCh0b2tlbik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsYWltcywgcGF5bG9hZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRDbGFpbXNGcm9tSldUIHNob3VsZCB0aHJvdyBmb3IgaW52YWxpZCBKV1QgZm9ybWF0JywgKCkgPT4ge1xuXHRcdFx0Ly8gVGVzdCB3aXRoIHdyb25nIG51bWJlciBvZiBwYXJ0cyAtIHNob3VsZCB0aHJvdyBcIkludmFsaWQgSldUIHRva2VuIGZvcm1hdFwiXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldENsYWltc0Zyb21KV1QoJ29ubHkudHdvJyksIC9JbnZhbGlkIEpXVCB0b2tlbiBmb3JtYXQuKnRocmVlIHBhcnRzLyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldENsYWltc0Zyb21KV1QoJ29uZScpLCAvSW52YWxpZCBKV1QgdG9rZW4gZm9ybWF0Lip0aHJlZSBwYXJ0cy8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRDbGFpbXNGcm9tSldUKCdoYXMuZm91ci5wYXJ0cy5oZXJlJyksIC9JbnZhbGlkIEpXVCB0b2tlbiBmb3JtYXQuKnRocmVlIHBhcnRzLyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRDbGFpbXNGcm9tSldUIHNob3VsZCB0aHJvdyBmb3IgaW52YWxpZCBoZWFkZXIgY29udGVudCcsICgpID0+IHtcblx0XHRcdC8vIENyZWF0ZSBKV1Qgd2l0aCBpbnZhbGlkIGhlYWRlclxuXHRcdFx0Y29uc3QgZW5jb2RlZEhlYWRlciA9IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKCdub3QtanNvbicpKTtcblx0XHRcdGNvbnN0IGVuY29kZWRQYXlsb2FkID0gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyBzdWI6ICd0ZXN0JyB9KSkpO1xuXHRcdFx0Y29uc3QgdG9rZW4gPSBgJHtlbmNvZGVkSGVhZGVyfS4ke2VuY29kZWRQYXlsb2FkfS5zaWduYXR1cmVgO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldENsYWltc0Zyb21KV1QodG9rZW4pLCAvRmFpbGVkIHRvIHBhcnNlIEpXVCB0b2tlbi8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0Q2xhaW1zRnJvbUpXVCBzaG91bGQgdGhyb3cgZm9yIGludmFsaWQgcGF5bG9hZCBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Ly8gQ3JlYXRlIEpXVCB3aXRoIHZhbGlkIGhlYWRlciBidXQgaW52YWxpZCBwYXlsb2FkXG5cdFx0XHRjb25zdCBoZWFkZXIgPSB7IGFsZzogJ0hTMjU2JywgdHlwOiAnSldUJyB9O1xuXHRcdFx0Y29uc3QgZW5jb2RlZEhlYWRlciA9IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGhlYWRlcikpKTtcblx0XHRcdGNvbnN0IGVuY29kZWRQYXlsb2FkID0gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoJ25vdC1qc29uJykpO1xuXHRcdFx0Y29uc3QgdG9rZW4gPSBgJHtlbmNvZGVkSGVhZGVyfS4ke2VuY29kZWRQYXlsb2FkfS5zaWduYXR1cmVgO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldENsYWltc0Zyb21KV1QodG9rZW4pLCAvRmFpbGVkIHRvIHBhcnNlIEpXVCB0b2tlbi8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTmV0d29yayBGdW5jdGlvbnMnLCAoKSA9PiB7XG5cdFx0bGV0IHNhbmRib3g6IHNpbm9uLlNpbm9uU2FuZGJveDtcblx0XHRsZXQgZmV0Y2hTdHViOiBzaW5vbi5TaW5vblN0dWI7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzYW5kYm94ID0gc2lub24uY3JlYXRlU2FuZGJveCgpO1xuXHRcdFx0ZmV0Y2hTdHViID0gc2FuZGJveC5zdHViKGdsb2JhbFRoaXMsICdmZXRjaCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2FuZGJveC5yZXN0b3JlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIG1ha2UgY29ycmVjdCByZXF1ZXN0IGFuZCBwYXJzZSByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFNldHVwIHN1Y2Nlc3NmdWwgcmVzcG9uc2Vcblx0XHRcdGNvbnN0IG1vY2tSZXNwb25zZSA9IHtcblx0XHRcdFx0Y2xpZW50X2lkOiAnZ2VuZXJhdGVkLWNsaWVudC1pZCcsXG5cdFx0XHRcdGNsaWVudF9uYW1lOiAnVGVzdCBDbGllbnQnLFxuXHRcdFx0XHRjbGllbnRfdXJpOiAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20nXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRvazogdHJ1ZSxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbW9ja1Jlc3BvbnNlXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihcblx0XHRcdFx0c2VydmVyTWV0YWRhdGEsXG5cdFx0XHRcdCdUZXN0IENsaWVudCdcblx0XHRcdCk7XG5cblx0XHRcdC8vIFZlcmlmeSBmZXRjaCB3YXMgY2FsbGVkIGNvcnJlY3RseVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0Y29uc3QgW3VybCwgb3B0aW9uc10gPSBmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3M7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJsLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5tZXRob2QsICdQT1NUJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5oZWFkZXJzWydDb250ZW50LVR5cGUnXSwgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHJlcXVlc3QgYm9keVxuXHRcdFx0Y29uc3QgcmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKG9wdGlvbnMuYm9keSBhcyBzdHJpbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RCb2R5LmNsaWVudF9uYW1lLCAnVGVzdCBDbGllbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0Qm9keS5jbGllbnRfdXJpLCAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdEJvZHkuZ3JhbnRfdHlwZXMsIFsnYXV0aG9yaXphdGlvbl9jb2RlJywgJ3JlZnJlc2hfdG9rZW4nLCAndXJuOmlldGY6cGFyYW1zOm9hdXRoOmdyYW50LXR5cGU6ZGV2aWNlX2NvZGUnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3RCb2R5LnJlc3BvbnNlX3R5cGVzLCBbJ2NvZGUnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3RCb2R5LnJlZGlyZWN0X3VyaXMsIFtcblx0XHRcdFx0J2h0dHBzOi8vaW5zaWRlcnMudnNjb2RlLmRldi9yZWRpcmVjdCcsXG5cdFx0XHRcdCdodHRwczovL3ZzY29kZS5kZXYvcmVkaXJlY3QnLFxuXHRcdFx0XHQnaHR0cDovLzEyNy4wLjAuMS8nLFxuXHRcdFx0XHRgaHR0cDovLzEyNy4wLjAuMToke0RFRkFVTFRfQVVUSF9GTE9XX1BPUlR9L2Bcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBWZXJpZnkgcmVzcG9uc2UgaXMgcHJvY2Vzc2VkIGNvcnJlY3RseVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIG1vY2tSZXNwb25zZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIHRocm93IGVycm9yIG9uIG5vbi1PSyByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiBmYWxzZSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ0JhZCBSZXF1ZXN0Jyxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ0JhZCBSZXF1ZXN0J1xuXHRcdFx0fSBhcyBSZXNwb25zZSk7XG5cblx0XHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vcmVnaXN0ZXInLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gYXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnKSxcblx0XHRcdFx0L1JlZ2lzdHJhdGlvbiB0byBodHRwczpcXC9cXC9hdXRoXFwuZXhhbXBsZVxcLmNvbVxcL3JlZ2lzdGVyIGZhaWxlZDogQmFkIFJlcXVlc3QvXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCB0aHJvdyBlcnJvciBvbiBpbnZhbGlkIHJlc3BvbnNlIGZvcm1hdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiB0cnVlLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiAoeyBpbnZhbGlkOiAncmVzcG9uc2UnIH0pIC8vIE1pc3NpbmcgcmVxdWlyZWQgZmllbGRzXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcpLFxuXHRcdFx0XHQvSW52YWxpZCBhdXRob3JpemF0aW9uIGR5bmFtaWMgY2xpZW50IHJlZ2lzdHJhdGlvbiByZXNwb25zZS9cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIGZpbHRlciBncmFudCB0eXBlcyBiYXNlZCBvbiBzZXJ2ZXIgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTZXR1cCBzdWNjZXNzZnVsIHJlc3BvbnNlXG5cdFx0XHRjb25zdCBtb2NrUmVzcG9uc2UgPSB7XG5cdFx0XHRcdGNsaWVudF9pZDogJ2dlbmVyYXRlZC1jbGllbnQtaWQnLFxuXHRcdFx0XHRjbGllbnRfbmFtZTogJ1Rlc3QgQ2xpZW50J1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0b2s6IHRydWUsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IG1vY2tSZXNwb25zZVxuXHRcdFx0fSBhcyBSZXNwb25zZSk7XG5cblx0XHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vcmVnaXN0ZXInLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddLFxuXHRcdFx0XHRncmFudF90eXBlc19zdXBwb3J0ZWQ6IFsnYXV0aG9yaXphdGlvbl9jb2RlJywgJ2NsaWVudF9jcmVkZW50aWFscycsICdyZWZyZXNoX3Rva2VuJ10gLy8gTWl4IG9mIHN1cHBvcnRlZCBhbmQgdW5zdXBwb3J0ZWRcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50Jyk7XG5cblx0XHRcdC8vIFZlcmlmeSBmZXRjaCB3YXMgY2FsbGVkIGNvcnJlY3RseVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0Y29uc3QgWywgb3B0aW9uc10gPSBmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3M7XG5cblx0XHRcdC8vIFZlcmlmeSByZXF1ZXN0IGJvZHkgY29udGFpbnMgb25seSB0aGUgaW50ZXJzZWN0aW9uIG9mIHN1cHBvcnRlZCBncmFudCB0eXBlc1xuXHRcdFx0Y29uc3QgcmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKG9wdGlvbnMuYm9keSBhcyBzdHJpbmcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXF1ZXN0Qm9keS5ncmFudF90eXBlcywgWydhdXRob3JpemF0aW9uX2NvZGUnLCAncmVmcmVzaF90b2tlbiddKTsgLy8gY2xpZW50X2NyZWRlbnRpYWxzIHNob3VsZCBiZSBmaWx0ZXJlZCBvdXRcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgdXNlIGRlZmF1bHQgZ3JhbnQgdHlwZXMgd2hlbiBzZXJ2ZXIgbWV0YWRhdGEgaGFzIG5vbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTZXR1cCBzdWNjZXNzZnVsIHJlc3BvbnNlXG5cdFx0XHRjb25zdCBtb2NrUmVzcG9uc2UgPSB7XG5cdFx0XHRcdGNsaWVudF9pZDogJ2dlbmVyYXRlZC1jbGllbnQtaWQnLFxuXHRcdFx0XHRjbGllbnRfbmFtZTogJ1Rlc3QgQ2xpZW50J1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0b2s6IHRydWUsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IG1vY2tSZXNwb25zZVxuXHRcdFx0fSBhcyBSZXNwb25zZSk7XG5cblx0XHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vcmVnaXN0ZXInLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHRcdC8vIE5vIGdyYW50X3R5cGVzX3N1cHBvcnRlZCBzcGVjaWZpZWRcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50Jyk7XG5cblx0XHRcdC8vIFZlcmlmeSBmZXRjaCB3YXMgY2FsbGVkIGNvcnJlY3RseVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0Y29uc3QgWywgb3B0aW9uc10gPSBmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3M7XG5cblx0XHRcdC8vIFZlcmlmeSByZXF1ZXN0IGJvZHkgY29udGFpbnMgZGVmYXVsdCBncmFudCB0eXBlc1xuXHRcdFx0Y29uc3QgcmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKG9wdGlvbnMuYm9keSBhcyBzdHJpbmcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXF1ZXN0Qm9keS5ncmFudF90eXBlcywgWydhdXRob3JpemF0aW9uX2NvZGUnLCAncmVmcmVzaF90b2tlbicsICd1cm46aWV0ZjpwYXJhbXM6b2F1dGg6Z3JhbnQtdHlwZTpkZXZpY2VfY29kZSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgdGhyb3cgZXJyb3Igd2hlbiByZWdpc3RyYXRpb24gZW5kcG9pbnQgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHRcdC8vIHJlZ2lzdHJhdGlvbl9lbmRwb2ludCBpcyBtaXNzaW5nXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gYXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnKSxcblx0XHRcdFx0L1NlcnZlciBkb2VzIG5vdCBzdXBwb3J0IGR5bmFtaWMgcmVnaXN0cmF0aW9uL1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgaGFuZGxlIHN0cnVjdHVyZWQgZXJyb3IgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnJvclJlc3BvbnNlID0ge1xuXHRcdFx0XHRlcnJvcjogJ2ludmFsaWRfY2xpZW50X21ldGFkYXRhJyxcblx0XHRcdFx0ZXJyb3JfZGVzY3JpcHRpb246ICdUaGUgY2xpZW50IG1ldGFkYXRhIGlzIGludmFsaWQnXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRvazogZmFsc2UsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGVycm9yUmVzcG9uc2UpXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcpLFxuXHRcdFx0XHQvUmVnaXN0cmF0aW9uIHRvIGh0dHBzOlxcL1xcL2F1dGhcXC5leGFtcGxlXFwuY29tXFwvcmVnaXN0ZXIgZmFpbGVkOiBpbnZhbGlkX2NsaWVudF9tZXRhZGF0YTogVGhlIGNsaWVudCBtZXRhZGF0YSBpcyBpbnZhbGlkL1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgaGFuZGxlIHN0cnVjdHVyZWQgZXJyb3IgcmVzcG9uc2Ugd2l0aG91dCBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVycm9yUmVzcG9uc2UgPSB7XG5cdFx0XHRcdGVycm9yOiAnaW52YWxpZF9yZWRpcmVjdF91cmknXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRvazogZmFsc2UsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGVycm9yUmVzcG9uc2UpXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcpLFxuXHRcdFx0XHQvUmVnaXN0cmF0aW9uIHRvIGh0dHBzOlxcL1xcL2F1dGhcXC5leGFtcGxlXFwuY29tXFwvcmVnaXN0ZXIgZmFpbGVkOiBpbnZhbGlkX3JlZGlyZWN0X3VyaS9cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIGhhbmRsZSBtYWxmb3JtZWQgSlNPTiBlcnJvciByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiBmYWxzZSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ0ludmFsaWQgSlNPTiB7J1xuXHRcdFx0fSBhcyBSZXNwb25zZSk7XG5cblx0XHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vcmVnaXN0ZXInLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gYXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnKSxcblx0XHRcdFx0L1JlZ2lzdHJhdGlvbiB0byBodHRwczpcXC9cXC9hdXRoXFwuZXhhbXBsZVxcLmNvbVxcL3JlZ2lzdGVyIGZhaWxlZDogSW52YWxpZCBKU09OIFxcey9cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIGluY2x1ZGUgc2NvcGVzIGluIHJlcXVlc3Qgd2hlbiBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tSZXNwb25zZSA9IHtcblx0XHRcdFx0Y2xpZW50X2lkOiAnZ2VuZXJhdGVkLWNsaWVudC1pZCcsXG5cdFx0XHRcdGNsaWVudF9uYW1lOiAnVGVzdCBDbGllbnQnXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRvazogdHJ1ZSxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbW9ja1Jlc3BvbnNlXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50JywgWydyZWFkJywgJ3dyaXRlJ10pO1xuXG5cdFx0XHQvLyBWZXJpZnkgcmVxdWVzdCBpbmNsdWRlcyBzY29wZXNcblx0XHRcdGNvbnN0IFssIG9wdGlvbnNdID0gZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzO1xuXHRcdFx0Y29uc3QgcmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKG9wdGlvbnMuYm9keSBhcyBzdHJpbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RCb2R5LnNjb3BlLCAncmVhZCB3cml0ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCBvbWl0IHNjb3BlIGZyb20gcmVxdWVzdCB3aGVuIG5vdCBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2tSZXNwb25zZSA9IHtcblx0XHRcdFx0Y2xpZW50X2lkOiAnZ2VuZXJhdGVkLWNsaWVudC1pZCcsXG5cdFx0XHRcdGNsaWVudF9uYW1lOiAnVGVzdCBDbGllbnQnXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRvazogdHJ1ZSxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbW9ja1Jlc3BvbnNlXG5cdFx0XHR9IGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50Jyk7XG5cblx0XHRcdC8vIFZlcmlmeSByZXF1ZXN0IGRvZXMgbm90IGluY2x1ZGUgc2NvcGUgd2hlbiBub3QgcHJvdmlkZWRcblx0XHRcdGNvbnN0IFssIG9wdGlvbnNdID0gZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzO1xuXHRcdFx0Y29uc3QgcmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKG9wdGlvbnMuYm9keSBhcyBzdHJpbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RCb2R5LnNjb3BlLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCBoYW5kbGUgZW1wdHkgc2NvcGVzIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja1Jlc3BvbnNlID0ge1xuXHRcdFx0XHRjbGllbnRfaWQ6ICdnZW5lcmF0ZWQtY2xpZW50LWlkJyxcblx0XHRcdFx0Y2xpZW50X25hbWU6ICdUZXN0IENsaWVudCdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiB0cnVlLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBtb2NrUmVzcG9uc2Vcblx0XHRcdH0gYXMgUmVzcG9uc2UpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnLCBbXSk7XG5cblx0XHRcdC8vIFZlcmlmeSByZXF1ZXN0IGluY2x1ZGVzIGVtcHR5IHNjb3BlXG5cdFx0XHRjb25zdCBbLCBvcHRpb25zXSA9IGZldGNoU3R1Yi5maXJzdENhbGwuYXJncztcblx0XHRcdGNvbnN0IHJlcXVlc3RCb2R5ID0gSlNPTi5wYXJzZShvcHRpb25zLmJvZHkgYXMgc3RyaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0Qm9keS5zY29wZSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCBoYW5kbGUgbmV0d29yayBmZXRjaCBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZmV0Y2hTdHViLnJlamVjdHMobmV3IEVycm9yKCdOZXR3b3JrIGVycm9yJykpO1xuXG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVnaXN0cmF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3JlZ2lzdGVyJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50JyksXG5cdFx0XHRcdC9OZXR3b3JrIGVycm9yL1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbiBzaG91bGQgaGFuZGxlIHJlc3BvbnNlLmpzb24oKSBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0b2s6IHRydWUsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0pTT04gcGFyc2luZyBmYWlsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcpLFxuXHRcdFx0XHQvSlNPTiBwYXJzaW5nIGZhaWxlZC9cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIGhhbmRsZSByZXNwb25zZS50ZXh0KCkgZmFpbHVyZSBmb3IgZXJyb3IgY2FzZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRvazogZmFsc2UsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RleHQgcGFyc2luZyBmYWlsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBhcyB1bmtub3duIGFzIFJlc3BvbnNlKTtcblxuXHRcdFx0Y29uc3Qgc2VydmVyTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24oc2VydmVyTWV0YWRhdGEsICdUZXN0IENsaWVudCcpLFxuXHRcdFx0XHQvVGV4dCBwYXJzaW5nIGZhaWxlZC9cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDbGllbnQgSUQgRmFsbGJhY2sgU2NlbmFyaW9zJywgKCkgPT4ge1xuXHRcdGxldCBzYW5kYm94OiBzaW5vbi5TaW5vblNhbmRib3g7XG5cdFx0bGV0IGZldGNoU3R1Yjogc2lub24uU2lub25TdHViO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2FuZGJveCA9IHNpbm9uLmNyZWF0ZVNhbmRib3goKTtcblx0XHRcdGZldGNoU3R1YiA9IHNhbmRib3guc3R1YihnbG9iYWxUaGlzLCAnZmV0Y2gnKTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHNhbmRib3gucmVzdG9yZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uIHNob3VsZCB0aHJvdyBzcGVjaWZpYyBlcnJvciBmb3IgbWlzc2luZyByZWdpc3RyYXRpb24gZW5kcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0XHQvLyByZWdpc3RyYXRpb25fZW5kcG9pbnQgaXMgbWlzc2luZ1xuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGF3YWl0IGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YSwgJ1Rlc3QgQ2xpZW50JyksXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtZXNzYWdlOiAnU2VydmVyIGRvZXMgbm90IHN1cHBvcnQgZHluYW1pYyByZWdpc3RyYXRpb24nXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmZXRjaER5bmFtaWNSZWdpc3RyYXRpb24gc2hvdWxkIHRocm93IHNwZWNpZmljIGVycm9yIGZvciBEQ1IgZmFpbHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdG9rOiBmYWxzZSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ0RDUiBub3Qgc3VwcG9ydGVkJ1xuXHRcdFx0fSBhcyBSZXNwb25zZSk7XG5cblx0XHRcdGNvbnN0IHNlcnZlck1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vcmVnaXN0ZXInLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gYXdhaXQgZmV0Y2hEeW5hbWljUmVnaXN0cmF0aW9uKHNlcnZlck1ldGFkYXRhLCAnVGVzdCBDbGllbnQnKSxcblx0XHRcdFx0L1JlZ2lzdHJhdGlvbiB0byBodHRwczpcXC9cXC9hdXRoXFwuZXhhbXBsZVxcLmNvbVxcL3JlZ2lzdGVyIGZhaWxlZDogRENSIG5vdCBzdXBwb3J0ZWQvXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmV0Y2hSZXNvdXJjZU1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdGxldCBzYW5kYm94OiBzaW5vbi5TaW5vblNhbmRib3g7XG5cdFx0bGV0IGZldGNoU3R1Yjogc2lub24uU2lub25TdHViO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2FuZGJveCA9IHNpbm9uLmNyZWF0ZVNhbmRib3goKTtcblx0XHRcdGZldGNoU3R1YiA9IHNhbmRib3guc3R1YigpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2FuZGJveC5yZXN0b3JlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VjY2Vzc2Z1bGx5IGZldGNoIGFuZCB2YWxpZGF0ZSByZXNvdXJjZSBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tL2FwaScsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCcsICd3cml0ZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHRyZXNvdXJjZU1ldGFkYXRhVXJsLFxuXHRcdFx0XHR7IGZldGNoOiBmZXRjaFN0dWIgfVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzBdLCByZXNvdXJjZU1ldGFkYXRhVXJsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMV0ubWV0aG9kLCAnR0VUJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzFdLmhlYWRlcnNbJ0FjY2VwdCddLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgc2FtZS1vcmlnaW4gaGVhZGVycyB3aGVuIG9yaWdpbnMgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblx0XHRcdGNvbnN0IHNhbWVPcmlnaW5IZWFkZXJzID0ge1xuXHRcdFx0XHQnWC1UZXN0LUhlYWRlcic6ICd0ZXN0LXZhbHVlJyxcblx0XHRcdFx0J1gtQ3VzdG9tLUhlYWRlcic6ICd2YWx1ZSdcblx0XHRcdH07XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJ1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKFxuXHRcdFx0XHR0YXJnZXRSZXNvdXJjZSxcblx0XHRcdFx0cmVzb3VyY2VNZXRhZGF0YVVybCxcblx0XHRcdFx0eyBmZXRjaDogZmV0Y2hTdHViLCBzYW1lT3JpZ2luSGVhZGVycyB9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgcmVzb3VyY2VNZXRhZGF0YVVybCk7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzFdLmhlYWRlcnM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQWNjZXB0J10sICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snWC1UZXN0LUhlYWRlciddLCAndGVzdC12YWx1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtQ3VzdG9tLUhlYWRlciddLCAndmFsdWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgaW5jbHVkZSBzYW1lLW9yaWdpbiBoZWFkZXJzIHdoZW4gb3JpZ2lucyBkaWZmZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vb3RoZXItZG9tYWluLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Y29uc3Qgc2FtZU9yaWdpbkhlYWRlcnMgPSB7XG5cdFx0XHRcdCdYLVRlc3QtSGVhZGVyJzogJ3Rlc3QtdmFsdWUnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tL2FwaSdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YShcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UsXG5cdFx0XHRcdHJlc291cmNlTWV0YWRhdGFVcmwsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1Yiwgc2FtZU9yaWdpbkhlYWRlcnMgfVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1sxXS5oZWFkZXJzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ0FjY2VwdCddLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtVGVzdC1IZWFkZXInXSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBlcnJvciB3aGVuIGZldGNoIHJldHVybnMgbm9uLTIwMCBzdGF0dXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblxuXHRcdFx0Ly8gU3R1YiBhbGwgcG9zc2libGUgVVJMcyB0byByZXR1cm4gNDA0IGZvciByb2J1c3QgZmFsbGJhY2sgdGVzdGluZ1xuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgcmVzb3VyY2VNZXRhZGF0YVVybCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdC8vIFNob3VsZCBiZSBBZ2dyZWdhdGVFcnJvciBzaW5jZSBhbGwgVVJMcyBmYWlsXG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IgfHwgL0ZhaWxlZCB0byBmZXRjaCByZXNvdXJjZSBtZXRhZGF0YSBmcm9tLio0MDQgTm90IEZvdW5kLy50ZXN0KGVycm9yLm1lc3NhZ2UpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZXJyb3Igd2hlbiByZXNwb25zZS50ZXh0KCkgdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cblx0XHRcdC8vIFN0dWIgYWxsIHBvc3NpYmxlIFVSTHMgdG8gcmV0dXJuIDUwMCBmb3Igcm9idXN0IGZhbGxiYWNrIHRlc3Rpbmdcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNTAwLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnSW50ZXJuYWwgU2VydmVyIEVycm9yJyxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZWFkIHJlc3BvbnNlJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCByZXNvdXJjZU1ldGFkYXRhVXJsLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0Ly8gU2hvdWxkIGJlIEFnZ3JlZ2F0ZUVycm9yIHNpbmNlIGFsbCBVUkxzIGZhaWxcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvciB8fCAvRmFpbGVkIHRvIGZldGNoIHJlc291cmNlIG1ldGFkYXRhIGZyb20uKjUwMCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IvLnRlc3QoZXJyb3IubWVzc2FnZSkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IGVycm9yIHdoZW4gcmVzb3VyY2UgcHJvcGVydHkgZG9lcyBub3QgbWF0Y2ggdGFyZ2V0IHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2RpZmZlcmVudC5jb20vYXBpJ1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gU3R1YiBhbGwgcG9zc2libGUgVVJMcyB0byByZXR1cm4gaW52YWxpZCBtZXRhZGF0YSBmb3Igcm9idXN0IGZhbGxiYWNrIHRlc3Rpbmdcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBtZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgcmVzb3VyY2VNZXRhZGF0YVVybCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdC8vIFNob3VsZCBiZSBBZ2dyZWdhdGVFcnJvciBzaW5jZSBhbGwgVVJMcyBmYWlsIHZhbGlkYXRpb25cblx0XHRcdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvcik7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yLmVycm9ycy5zb21lKChlOiBFcnJvcikgPT4gL2RvZXMgbm90IG1hdGNoIGV4cGVjdGVkIHZhbHVlLy50ZXN0KGUubWVzc2FnZSkpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3JtYWxpemUgVVJMcyB3aGVuIGNvbXBhcmluZyByZXNvdXJjZSB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL0VYQU1QTEUuQ09NL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJ1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IG1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShtZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBVUkwgbm9ybWFsaXphdGlvbiBzaG91bGQgaGFuZGxlIGhvc3RuYW1lIGNhc2UgZGlmZmVyZW5jZXNcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgcmVzb3VyY2VNZXRhZGF0YVVybCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIG1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCByZXNvdXJjZU1ldGFkYXRhVXJsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBlcnJvciB3aGVuIHJlc3BvbnNlIGlzIG5vdCB2YWxpZCByZXNvdXJjZSBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Y29uc3QgaW52YWxpZE1ldGFkYXRhID0ge1xuXHRcdFx0XHQvLyBNaXNzaW5nIHJlcXVpcmVkICdyZXNvdXJjZScgcHJvcGVydHlcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJywgJ3dyaXRlJ11cblx0XHRcdH07XG5cblx0XHRcdC8vIFN0dWIgYWxsIHBvc3NpYmxlIFVSTHMgdG8gcmV0dXJuIGludmFsaWQgbWV0YWRhdGEgZm9yIHJvYnVzdCBmYWxsYmFjayB0ZXN0aW5nXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gaW52YWxpZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShpbnZhbGlkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgcmVzb3VyY2VNZXRhZGF0YVVybCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdC8vIFNob3VsZCBiZSBBZ2dyZWdhdGVFcnJvciBzaW5jZSBhbGwgVVJMcyByZXR1cm4gaW52YWxpZCBtZXRhZGF0YVxuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yIHx8IC9JbnZhbGlkIHJlc291cmNlIG1ldGFkYXRhLy50ZXN0KGVycm9yLm1lc3NhZ2UpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBlcnJvciB3aGVuIHNjb3Blc19zdXBwb3J0ZWQgaXMgbm90IGFuIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHRjb25zdCBpbnZhbGlkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiAnbm90IGFuIGFycmF5J1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gU3R1YiBhbGwgcG9zc2libGUgVVJMcyB0byByZXR1cm4gaW52YWxpZCBtZXRhZGF0YSBmb3Igcm9idXN0IGZhbGxiYWNrIHRlc3Rpbmdcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBpbnZhbGlkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGludmFsaWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCByZXNvdXJjZU1ldGFkYXRhVXJsLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0Ly8gU2hvdWxkIGJlIEFnZ3JlZ2F0ZUVycm9yIHNpbmNlIGFsbCBVUkxzIHJldHVybiBpbnZhbGlkIG1ldGFkYXRhXG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IgfHwgL0ludmFsaWQgcmVzb3VyY2UgbWV0YWRhdGEvLnRlc3QoZXJyb3IubWVzc2FnZSkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtZXRhZGF0YSB3aXRoIG9wdGlvbmFsIGZpZWxkcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknLFxuXHRcdFx0XHRyZXNvdXJjZV9uYW1lOiAnRXhhbXBsZSBBUEknLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sXG5cdFx0XHRcdGp3a3NfdXJpOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9qd2tzJyxcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJywgJ3dyaXRlJywgJ2FkbWluJ10sXG5cdFx0XHRcdGJlYXJlcl9tZXRob2RzX3N1cHBvcnRlZDogWydoZWFkZXInLCAnYm9keSddLFxuXHRcdFx0XHRyZXNvdXJjZV9kb2N1bWVudGF0aW9uOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzJ1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IG1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShtZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHJlc291cmNlTWV0YWRhdGFVcmwsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBtZXRhZGF0YSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGdsb2JhbCBmZXRjaCB3aGVuIGN1c3RvbSBmZXRjaCBpcyBub3QgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJ1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRjb25zdCBnbG9iYWxGZXRjaFN0dWIgPSBzYW5kYm94LnN0dWIoZ2xvYmFsVGhpcywgJ2ZldGNoJykucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhKVxuXHRcdFx0fSBhcyBhbnkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgbWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2JhbEZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzYW1lIG9yaWdpbiB3aXRoIGRpZmZlcmVudCBwb3J0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb206ODA4MC9hcGknO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tOjkwOTAvLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblx0XHRcdGNvbnN0IHNhbWVPcmlnaW5IZWFkZXJzID0ge1xuXHRcdFx0XHQnWC1UZXN0LUhlYWRlcic6ICd0ZXN0LXZhbHVlJ1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb206ODA4MC9hcGknXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gbWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KG1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YShcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UsXG5cdFx0XHRcdHJlc291cmNlTWV0YWRhdGFVcmwsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1Yiwgc2FtZU9yaWdpbkhlYWRlcnMgfVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXHRcdFx0Ly8gRGlmZmVyZW50IHBvcnRzIG1lYW4gZGlmZmVyZW50IG9yaWdpbnNcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMV0uaGVhZGVycztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydYLVRlc3QtSGVhZGVyJ10sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNhbWUgb3JpZ2luIHdpdGggZGlmZmVyZW50IHByb3RvY29scycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHA6Ly9leGFtcGxlLmNvbS9hcGknO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHRjb25zdCBzYW1lT3JpZ2luSGVhZGVycyA9IHtcblx0XHRcdFx0J1gtVGVzdC1IZWFkZXInOiAndGVzdC12YWx1ZSdcblx0XHRcdH07XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwOi8vZXhhbXBsZS5jb20vYXBpJ1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IG1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShtZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHRyZXNvdXJjZU1ldGFkYXRhVXJsLFxuXHRcdFx0XHR7IGZldGNoOiBmZXRjaFN0dWIsIHNhbWVPcmlnaW5IZWFkZXJzIH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCByZXNvdXJjZU1ldGFkYXRhVXJsKTtcblx0XHRcdC8vIERpZmZlcmVudCBwcm90b2NvbHMgbWVhbiBkaWZmZXJlbnQgb3JpZ2luc1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1sxXS5oZWFkZXJzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtVGVzdC1IZWFkZXInXSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIGVycm9yIGRldGFpbHMgaW4gbWVzc2FnZSB3aXRoIHJlc291cmNlIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9kaWZmZXJlbnQuY29tL290aGVyJ1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gU3R1YiBhbGwgcG9zc2libGUgVVJMcyB0byByZXR1cm4gaW52YWxpZCBtZXRhZGF0YSBmb3Igcm9idXN0IGZhbGxiYWNrIHRlc3Rpbmdcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBtZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCByZXNvdXJjZU1ldGFkYXRhVXJsLCB7IGZldGNoOiBmZXRjaFN0dWIgfSk7XG5cdFx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgaGF2ZSB0aHJvd24gYW4gZXJyb3InKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcblx0XHRcdFx0Ly8gU2hvdWxkIGJlIEFnZ3JlZ2F0ZUVycm9yIHdpdGggdmFsaWRhdGlvbiBlcnJvcnNcblx0XHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvciA/IGVycm9yLmVycm9ycy5tYXAoKGU6IEVycm9yKSA9PiBlLm1lc3NhZ2UpLmpvaW4oJyAnKSA6IGVycm9yLm1lc3NhZ2U7XG5cdFx0XHRcdGFzc2VydC5vaygvZG9lcyBub3QgbWF0Y2ggZXhwZWN0ZWQgdmFsdWUvLnRlc3QoZXJyb3JNZXNzYWdlKSwgJ0Vycm9yIG1lc3NhZ2Ugc2hvdWxkIG1lbnRpb24gbWlzbWF0Y2gnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKC9odHRwczpcXC9cXC9kaWZmZXJlbnRcXC5jb21cXC9vdGhlci8udGVzdChlcnJvck1lc3NhZ2UpLCAnRXJyb3IgbWVzc2FnZSBzaG91bGQgaW5jbHVkZSBhY3R1YWwgcmVzb3VyY2UgdmFsdWUnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKC9odHRwczpcXC9cXC9leGFtcGxlXFwuY29tXFwvYXBpLy50ZXN0KGVycm9yTWVzc2FnZSksICdFcnJvciBtZXNzYWdlIHNob3VsZCBpbmNsdWRlIGV4cGVjdGVkIHJlc291cmNlIHZhbHVlJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmFsbGJhY2sgdG8gd2VsbC1rbm93biBVUkkgd2l0aCBwYXRoIHdoZW4gbm8gcmVzb3VyY2VNZXRhZGF0YVVybCBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3YxJztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnLCAnd3JpdGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKFxuXHRcdFx0XHR0YXJnZXRSZXNvdXJjZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR7IGZldGNoOiBmZXRjaFN0dWIgfVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZS9hcGkvdjEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAxKTtcblx0XHRcdC8vIFNob3VsZCB0cnkgcGF0aC1hcHBlbmRlZCB2ZXJzaW9uIGZpcnN0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UvYXBpL3YxJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmFsbGJhY2sgdG8gd2VsbC1rbm93biBVUkkgYXQgcm9vdCB3aGVuIHBhdGggdmVyc2lvbiBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3YxJztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnLCAnd3JpdGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRmlyc3QgY2FsbCBmYWlscywgc2Vjb25kIHN1Y2NlZWRzXG5cdFx0XHRmZXRjaFN0dWIub25GaXJzdENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnTm90IEZvdW5kJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ05vdCBGb3VuZCdcblx0XHRcdH0pO1xuXG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1YiB9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdFx0Ly8gRmlyc3QgYXR0ZW1wdCB3aXRoIHBhdGhcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMF0sICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZS9hcGkvdjEnKTtcblx0XHRcdC8vIFNlY29uZCBhdHRlbXB0IGF0IHJvb3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuc2Vjb25kQ2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBlcnJvciB3aGVuIGFsbCB3ZWxsLWtub3duIFVSSXMgZmFpbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3YxJztcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHVuZGVmaW5lZCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yLCAnU2hvdWxkIGJlIGFuIEFnZ3JlZ2F0ZUVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmVycm9ycy5sZW5ndGgsIDIsICdTaG91bGQgY29udGFpbiAyIGVycm9ycycpO1xuXHRcdFx0XHRcdGFzc2VydC5vaygvRmFpbGVkIHRvIGZldGNoIHJlc291cmNlIG1ldGFkYXRhIGZyb20uKlxcL2FwaVxcL3YxLio0MDQvLnRlc3QoZXJyb3IuZXJyb3JzWzBdLm1lc3NhZ2UpLCAnRmlyc3QgZXJyb3Igc2hvdWxkIG1lbnRpb24gL2FwaS92MSBhbmQgNDA0Jyk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC9GYWlsZWQgdG8gZmV0Y2ggcmVzb3VyY2UgbWV0YWRhdGEgZnJvbS4qXFwud2VsbC1rbm93bi4qNDA0Ly50ZXN0KGVycm9yLmVycm9yc1sxXS5tZXNzYWdlKSwgJ1NlY29uZCBlcnJvciBzaG91bGQgbWVudGlvbiAud2VsbC1rbm93biBhbmQgNDA0Jyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7IGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgYXBwZW5kIHBhdGggd2hlbiB0YXJnZXQgcmVzb3VyY2UgaXMgcm9vdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vJztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnXVxuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKFxuXHRcdFx0XHR0YXJnZXRSZXNvdXJjZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR7IGZldGNoOiBmZXRjaFN0dWIgfVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdFx0Ly8gQm90aCBVUkxzIHNob3VsZCBiZSB0aGUgc2FtZSB3aGVuIHBhdGggaXMgL1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaW5jbHVkZSBzYW1lLW9yaWdpbiBoZWFkZXJzIHdoZW4gdXNpbmcgd2VsbC1rbm93biBmYWxsYmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJztcblx0XHRcdGNvbnN0IHNhbWVPcmlnaW5IZWFkZXJzID0ge1xuXHRcdFx0XHQnWC1UZXN0LUhlYWRlcic6ICd0ZXN0LXZhbHVlJyxcblx0XHRcdFx0J1gtQ3VzdG9tLUhlYWRlcic6ICd2YWx1ZSdcblx0XHRcdH07XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJ1xuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKFxuXHRcdFx0XHR0YXJnZXRSZXNvdXJjZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR7IGZldGNoOiBmZXRjaFN0dWIsIHNhbWVPcmlnaW5IZWFkZXJzIH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UvYXBpJyk7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzFdLmhlYWRlcnM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQWNjZXB0J10sICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snWC1UZXN0LUhlYWRlciddLCAndGVzdC12YWx1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtQ3VzdG9tLUhlYWRlciddLCAndmFsdWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZmV0Y2hJbXBsIHRocm93aW5nIG5ldHdvcmsgZXJyb3IgYW5kIGNvbnRpbnVlIHRvIG5leHQgVVJMJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL2V4YW1wbGUuY29tLycsXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZCcsICd3cml0ZSddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCBjYWxsIHRocm93cyBuZXR3b3JrIGVycm9yLCBzZWNvbmQgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlamVjdHMobmV3IEVycm9yKCdOZXR3b3JrIGNvbm5lY3Rpb24gZmFpbGVkJykpO1xuXG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1YiB9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKC9OZXR3b3JrIGNvbm5lY3Rpb24gZmFpbGVkLy50ZXN0KHJlc3VsdC5lcnJvcnNbMF0ubWVzc2FnZSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdFx0Ly8gRmlyc3QgYXR0ZW1wdCB3aXRoIHBhdGggc2hvdWxkIGhhdmUgdGhyb3duIGVycm9yXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UvYXBpL3YxJyk7XG5cdFx0XHQvLyBTZWNvbmQgYXR0ZW1wdCBhdCByb290IHNob3VsZCBzdWNjZWVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLnNlY29uZENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdGhyb3cgQWdncmVnYXRlRXJyb3Igd2hlbiBmZXRjaEltcGwgdGhyb3dzIG9uIGFsbCBVUkxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXG5cdFx0XHQvLyBCb3RoIGNhbGxzIHRocm93IG5ldHdvcmsgZXJyb3JzXG5cdFx0XHRmZXRjaFN0dWIucmVqZWN0cyhuZXcgRXJyb3IoJ05ldHdvcmsgY29ubmVjdGlvbiBmYWlsZWQnKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHVuZGVmaW5lZCwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yLCAnU2hvdWxkIGJlIGFuIEFnZ3JlZ2F0ZUVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmVycm9ycy5sZW5ndGgsIDIsICdTaG91bGQgY29udGFpbiAyIGVycm9ycycpO1xuXHRcdFx0XHRcdGFzc2VydC5vaygvTmV0d29yayBjb25uZWN0aW9uIGZhaWxlZC8udGVzdChlcnJvci5lcnJvcnNbMF0ubWVzc2FnZSksICdGaXJzdCBlcnJvciBzaG91bGQgbWVudGlvbiBuZXR3b3JrIGZhaWx1cmUnKTtcblx0XHRcdFx0XHRhc3NlcnQub2soL05ldHdvcmsgY29ubmVjdGlvbiBmYWlsZWQvLnRlc3QoZXJyb3IuZXJyb3JzWzFdLm1lc3NhZ2UpLCAnU2Vjb25kIGVycm9yIHNob3VsZCBtZW50aW9uIG5ldHdvcmsgZmFpbHVyZScpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG1peCBvZiBmZXRjaCBlcnJvciBhbmQgbm9uLTIwMCByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3YxJztcblxuXHRcdFx0Ly8gRmlyc3QgY2FsbCB0aHJvd3MgbmV0d29yayBlcnJvclxuXHRcdFx0ZmV0Y2hTdHViLm9uRmlyc3RDYWxsKCkucmVqZWN0cyhuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gdGltZW91dCcpKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGNhbGwgcmV0dXJucyA0MDRcblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnTm90IEZvdW5kJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ05vdCBGb3VuZCdcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCB1bmRlZmluZWQsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KSxcblx0XHRcdFx0KGVycm9yOiBhbnkpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvciwgJ1Nob3VsZCBiZSBhbiBBZ2dyZWdhdGVFcnJvcicpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5lcnJvcnMubGVuZ3RoLCAyLCAnU2hvdWxkIGNvbnRhaW4gMiBlcnJvcnMnKTtcblx0XHRcdFx0XHRhc3NlcnQub2soL0Nvbm5lY3Rpb24gdGltZW91dC8udGVzdChlcnJvci5lcnJvcnNbMF0ubWVzc2FnZSksICdGaXJzdCBlcnJvciBzaG91bGQgYmUgbmV0d29yayBlcnJvcicpO1xuXHRcdFx0XHRcdGFzc2VydC5vaygvRmFpbGVkIHRvIGZldGNoIHJlc291cmNlIG1ldGFkYXRhLio0MDQvLnRlc3QoZXJyb3IuZXJyb3JzWzFdLm1lc3NhZ2UpLCAnU2Vjb25kIGVycm9yIHNob3VsZCBiZSA0MDQnKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGFjY2VwdCByb290IFVSTCBpbiBQUk0gcmVzb3VyY2Ugd2hlbiB1c2luZyByb290IGRpc2NvdmVyeSBmYWxsYmFjayAobm8gdHJhaWxpbmcgc2xhc2gpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXHRcdFx0Ly8gUGVyIFJGQyA5NzI4OiB3aGVuIG1ldGFkYXRhIHJldHJpZXZlZCBmcm9tIHJvb3QgZGlzY292ZXJ5IFVSTCxcblx0XHRcdC8vIHRoZSByZXNvdXJjZSB2YWx1ZSBtdXN0IG1hdGNoIHRoZSByb290IFVSTCAod2hlcmUgd2VsbC1rbm93biB3YXMgaW5zZXJ0ZWQpXG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnLCAnd3JpdGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRmlyc3QgY2FsbCAocGF0aC1hcHBlbmRlZCkgZmFpbHMsIHNlY29uZCAocm9vdCkgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoUmVzb3VyY2VNZXRhZGF0YShcblx0XHRcdFx0dGFyZ2V0UmVzb3VyY2UsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0eyBmZXRjaDogZmV0Y2hTdHViIH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBleHBlY3RlZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhY2NlcHQgcm9vdCBVUkwgaW4gUFJNIHJlc291cmNlIHdoZW4gdXNpbmcgcm9vdCBkaXNjb3ZlcnkgZmFsbGJhY2sgKHdpdGggdHJhaWxpbmcgc2xhc2gpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXHRcdFx0Ly8gVGVzdCB0aGF0IHRyYWlsaW5nIHNsYXNoIGZvcm0gaXMgYWxzbyBhY2NlcHRlZCAoVVJMIG5vcm1hbGl6YXRpb24pXG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJywgJ3dyaXRlJ11cblx0XHRcdH07XG5cblx0XHRcdC8vIEZpcnN0IGNhbGwgKHBhdGgtYXBwZW5kZWQpIGZhaWxzLCBzZWNvbmQgKHJvb3QpIHN1Y2NlZWRzXG5cdFx0XHRmZXRjaFN0dWIub25GaXJzdENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnTm90IEZvdW5kJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ05vdCBGb3VuZCdcblx0XHRcdH0pO1xuXG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaFJlc291cmNlTWV0YWRhdGEoXG5cdFx0XHRcdHRhcmdldFJlc291cmNlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHsgZmV0Y2g6IGZldGNoU3R1YiB9XG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVqZWN0IFBSTSB3aXRoIGZ1bGwgcGF0aCByZXNvdXJjZSB3aGVuIHVzaW5nIHJvb3QgZGlzY292ZXJ5IGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXHRcdFx0Ly8gVGhpcyB2aW9sYXRlcyBSRkMgOTcyODogcm9vdCBkaXNjb3ZlcnkgUFJNIHNob3VsZCBoYXZlIHJvb3QgVVJMLCBub3QgZnVsbCBwYXRoXG5cdFx0XHRjb25zdCBpbnZhbGlkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRmlyc3QgY2FsbCAocGF0aC1hcHBlbmRlZCkgZmFpbHMsIHNlY29uZCAocm9vdCkgcmV0dXJucyBpbnZhbGlkIG1ldGFkYXRhXG5cdFx0XHRmZXRjaFN0dWIub25GaXJzdENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnTm90IEZvdW5kJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ05vdCBGb3VuZCdcblx0XHRcdH0pO1xuXG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gaW52YWxpZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShpbnZhbGlkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoUmVzb3VyY2VNZXRhZGF0YSh0YXJnZXRSZXNvdXJjZSwgdW5kZWZpbmVkLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdChlcnJvcjogYW55KSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IsICdTaG91bGQgYmUgYW4gQWdncmVnYXRlRXJyb3InKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IuZXJyb3JzLmxlbmd0aCwgMik7XG5cdFx0XHRcdFx0Ly8gRmlyc3QgZXJyb3IgaXMgNDA0IGZyb20gcGF0aC1hcHBlbmRlZCBhdHRlbXB0XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC80MDQvLnRlc3QoZXJyb3IuZXJyb3JzWzBdLm1lc3NhZ2UpKTtcblx0XHRcdFx0XHQvLyBTZWNvbmQgZXJyb3IgaXMgdmFsaWRhdGlvbiBmYWlsdXJlIGZyb20gcm9vdCBhdHRlbXB0XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC9kb2VzIG5vdCBtYXRjaCBleHBlY3RlZCB2YWx1ZS8udGVzdChlcnJvci5lcnJvcnNbMV0ubWVzc2FnZSkpO1xuXHRcdFx0XHRcdC8vIENoZWNrIHRoYXQgdmFsaWRhdGlvbiB3YXMgYWdhaW5zdCByb290IFVSTCAob3JpZ2luKSBub3QgZnVsbCBwYXRoXG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC9odHRwczpcXC9cXC9leGFtcGxlXFwuY29tXFwvYXBpXFwvdjEuKmh0dHBzOlxcL1xcL2V4YW1wbGVcXC5jb20vLnRlc3QoZXJyb3IuZXJyb3JzWzFdLm1lc3NhZ2UpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlamVjdCBQUk0gd2l0aCByb290IHJlc291cmNlIHdoZW4gdXNpbmcgcGF0aC1hcHBlbmRlZCBkaXNjb3ZlcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MSc7XG5cdFx0XHQvLyBUaGlzIHZpb2xhdGVzIFJGQyA5NzI4OiBwYXRoLWFwcGVuZGVkIGRpc2NvdmVyeSBQUk0gc2hvdWxkIG1hdGNoIGZ1bGwgdGFyZ2V0IFVSTFxuXHRcdFx0Y29uc3QgaW52YWxpZE1ldGFkYXRhID0ge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0c2NvcGVzX3N1cHBvcnRlZDogWydyZWFkJ11cblx0XHRcdH07XG5cblx0XHRcdC8vIEZpcnN0IGF0dGVtcHQgKHBhdGgtYXBwZW5kZWQpIGdldHMgdGhlIHdyb25nIHJlc291cmNlIHZhbHVlXG5cdFx0XHQvLyBJdCB3aWxsIGZhaWwgdmFsaWRhdGlvbiBhbmQgY29udGludWUgdG8gc2Vjb25kIFVSTCAocm9vdClcblx0XHRcdC8vIFNlY29uZCBhdHRlbXB0IChyb290KSB3aWxsIHN1Y2NlZWQgYmVjYXVzZSByb290IGV4cGVjdHMgcm9vdCByZXNvdXJjZVxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGludmFsaWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoaW52YWxpZE1ldGFkYXRhKVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoaXMgc2hvdWxkIGFjdHVhbGx5IHN1Y2NlZWQgb24gdGhlIHNlY29uZCAocm9vdCkgYXR0ZW1wdFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCB1bmRlZmluZWQsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGludmFsaWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdFx0Ly8gVmVyaWZ5IGJvdGggVVJMcyB3ZXJlIHRyaWVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UvYXBpL3YxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLnNlY29uZENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdmFsaWRhdGUgYWdhaW5zdCB0YXJnZXRSZXNvdXJjZSB3aGVuIHJlc291cmNlTWV0YWRhdGFVcmwgaXMgZXhwbGljaXRseSBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldFJlc291cmNlID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3YxJztcblx0XHRcdGNvbnN0IHJlc291cmNlTWV0YWRhdGFVcmwgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnO1xuXHRcdFx0Ly8gV2hlbiBleHBsaWNpdCBVUkwgcHJvdmlkZWQgKGUuZy4sIGZyb20gV1dXLUF1dGhlbnRpY2F0ZSksIG11c3QgbWF0Y2ggdGFyZ2V0UmVzb3VyY2Vcblx0XHRcdGNvbnN0IHZhbGlkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnXVxuXHRcdFx0fTtcblxuXHRcdFx0ZmV0Y2hTdHViLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IHZhbGlkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KHZhbGlkTWV0YWRhdGEpXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKFxuXHRcdFx0XHR0YXJnZXRSZXNvdXJjZSxcblx0XHRcdFx0cmVzb3VyY2VNZXRhZGF0YVVybCxcblx0XHRcdFx0eyBmZXRjaDogZmV0Y2hTdHViIH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCB2YWxpZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCByZXNvdXJjZU1ldGFkYXRhVXJsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMF0sIHJlc291cmNlTWV0YWRhdGFVcmwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZhbGxiYWNrIHRvIHJvb3QgZGlzY292ZXJ5IHdoZW4gZXhwbGljaXQgcmVzb3VyY2VNZXRhZGF0YVVybCB2YWxpZGF0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0UmVzb3VyY2UgPSAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VNZXRhZGF0YVVybCA9ICdodHRwczovL2V4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSc7XG5cdFx0XHRjb25zdCBpbnZhbGlkTWV0YWRhdGEgPSB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlYWQnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gU3R1YiBhbGwgVVJMcyB0byByZXR1cm4gcm9vdCByZXNvdXJjZSBtZXRhZGF0YVxuXHRcdFx0Ly8gRXhwbGljaXQgVVJMIHJldHVybnMgcm9vdCAodmFsaWRhdGlvbiBmYWlscyksIHBhdGgtYXBwZW5kZWQgZmFpbHMsIHJvb3Qgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBpbnZhbGlkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGludmFsaWRNZXRhZGF0YSlcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBTaG91bGQgc3VjY2VlZCBvbiByb290IGRpc2NvdmVyeSBmYWxsYmFja1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKHRhcmdldFJlc291cmNlLCByZXNvdXJjZU1ldGFkYXRhVXJsLCB7IGZldGNoOiBmZXRjaFN0dWIgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgaW52YWxpZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2UnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuZXJyb3JzLmxlbmd0aCA+PSAxKTtcblx0XHRcdC8vIFNob3VsZCBoYXZlIHRyaWVkIGV4cGxpY2l0IFVSTCwgcGF0aC1hcHBlbmRlZCwgdGhlbiBzdWNjZWVkZWQgb24gcm9vdFxuXHRcdFx0YXNzZXJ0Lm9rKGZldGNoU3R1Yi5jYWxsQ291bnQgPj0gMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGZldGNoSW1wbCB0aHJvd2luZyBlcnJvciB3aXRoIGV4cGxpY2l0IHJlc291cmNlTWV0YWRhdGFVcmwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRSZXNvdXJjZSA9ICdodHRwczovL2V4YW1wbGUuY29tL2FwaSc7XG5cdFx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsID0gJ2h0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtcHJvdGVjdGVkLXJlc291cmNlJztcblxuXHRcdFx0Ly8gU3R1YiBhbGwgcG9zc2libGUgVVJMcyB0byB0aHJvdyBuZXR3b3JrIGVycm9yIGZvciByb2J1c3QgZmFsbGJhY2sgdGVzdGluZ1xuXHRcdFx0ZmV0Y2hTdHViLnJlamVjdHMobmV3IEVycm9yKCdETlMgcmVzb2x1dGlvbiBmYWlsZWQnKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaFJlc291cmNlTWV0YWRhdGEodGFyZ2V0UmVzb3VyY2UsIHJlc291cmNlTWV0YWRhdGFVcmwsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KSxcblx0XHRcdFx0KGVycm9yOiBhbnkpID0+IHtcblx0XHRcdFx0XHQvLyBTaG91bGQgYmUgQWdncmVnYXRlRXJyb3Igc2luY2UgYWxsIFVSTHMgZmFpbFxuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yIHx8IC9ETlMgcmVzb2x1dGlvbiBmYWlsZWQvLnRlc3QoZXJyb3IubWVzc2FnZSkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBTaG91bGQgaGF2ZSB0cmllZCBleHBsaWNpdCBVUkwgYW5kIHdlbGwta25vd24gZGlzY292ZXJ5XG5cdFx0XHRhc3NlcnQub2soZmV0Y2hTdHViLmNhbGxDb3VudCA+PSAyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdGxldCBzYW5kYm94OiBzaW5vbi5TaW5vblNhbmRib3g7XG5cdFx0bGV0IGZldGNoU3R1Yjogc2lub24uU2lub25TdHViO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2FuZGJveCA9IHNpbm9uLmNyZWF0ZVNhbmRib3goKTtcblx0XHRcdGZldGNoU3R1YiA9IHNhbmRib3guc3R1YigpO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0c2FuZGJveC5yZXN0b3JlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VjY2Vzc2Z1bGx5IGZldGNoIG1ldGFkYXRhIGZyb20gT0F1dGggZGlzY292ZXJ5IGVuZHBvaW50IHdpdGggcGF0aCBpbnNlcnRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQnO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudCcsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50L2F1dGhvcml6ZScsXG5cdFx0XHRcdHRva2VuX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC90b2tlbicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXIvdGVuYW50Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lcnJvcnMsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAxKTtcblx0XHRcdC8vIFNob3VsZCB0cnkgT0F1dGggZGlzY292ZXJ5IHdpdGggcGF0aCBpbnNlcnRpb246IGh0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlci90ZW5hbnRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMF0sICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXIvdGVuYW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzFdLm1ldGhvZCwgJ0dFVCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZhbGxiYWNrIHRvIE9wZW5JRCBDb25uZWN0IGRpc2NvdmVyeSB3aXRoIHBhdGggaW5zZXJ0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Jztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQnLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC9hdXRob3JpemUnLFxuXHRcdFx0XHR0b2tlbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvdG9rZW4nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCBjYWxsIGZhaWxzLCBzZWNvbmQgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJyxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBKU09OJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSksXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdPSydcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBleHBlY3RlZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29wZW5pZC1jb25maWd1cmF0aW9uL3RlbmFudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAyKTtcblx0XHRcdC8vIEZpcnN0IGF0dGVtcHQ6IE9BdXRoIGRpc2NvdmVyeVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlci90ZW5hbnQnKTtcblx0XHRcdC8vIFNlY29uZCBhdHRlbXB0OiBPcGVuSUQgQ29ubmVjdCBkaXNjb3Zlcnkgd2l0aCBwYXRoIGluc2VydGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5zZWNvbmRDYWxsLmFyZ3NbMF0sICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb3BlbmlkLWNvbmZpZ3VyYXRpb24vdGVuYW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmFsbGJhY2sgdG8gT3BlbklEIENvbm5lY3QgZGlzY292ZXJ5IHdpdGggcGF0aCBhZGRpdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudCc7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Jyxcblx0XHRcdFx0YXV0aG9yaXphdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvYXV0aG9yaXplJyxcblx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50L3Rva2VuJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRmlyc3QgdHdvIGNhbGxzIGZhaWwsIHRoaXJkIHN1Y2NlZWRzXG5cdFx0XHRmZXRjaFN0dWIub25GaXJzdENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnTm90IEZvdW5kJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ05vdCBGb3VuZCcsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgSlNPTicpOyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZmV0Y2hTdHViLm9uU2Vjb25kQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJyxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBKU09OJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRmZXRjaFN0dWIub25UaGlyZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Ly53ZWxsLWtub3duL29wZW5pZC1jb25maWd1cmF0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDMpO1xuXHRcdFx0Ly8gRmlyc3QgYXR0ZW1wdDogT0F1dGggZGlzY292ZXJ5XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmZpcnN0Q2FsbC5hcmdzWzBdLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyL3RlbmFudCcpO1xuXHRcdFx0Ly8gU2Vjb25kIGF0dGVtcHQ6IE9wZW5JRCBDb25uZWN0IGRpc2NvdmVyeSB3aXRoIHBhdGggaW5zZXJ0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLnNlY29uZENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vcGVuaWQtY29uZmlndXJhdGlvbi90ZW5hbnQnKTtcblx0XHRcdC8vIFRoaXJkIGF0dGVtcHQ6IE9wZW5JRCBDb25uZWN0IGRpc2NvdmVyeSB3aXRoIHBhdGggYWRkaXRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIudGhpcmRDYWxsLmFyZ3NbMF0sICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Ly53ZWxsLWtub3duL29wZW5pZC1jb25maWd1cmF0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGF1dGhvcml6YXRpb24gc2VydmVyIGF0IHJvb3Qgd2l0aG91dCBleHRyYSBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLycsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vYXV0aG9yaXplJyxcblx0XHRcdFx0dG9rZW5fZW5kcG9pbnQ6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdG9rZW4nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSksXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdPSydcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBleHBlY3RlZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lcnJvcnMsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAxKTtcblx0XHRcdC8vIEZvciByb290IFVSTHMsIG5vIGV4dHJhIHBhdGggaXMgYWRkZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuZmlyc3RDYWxsLmFyZ3NbMF0sICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgd2l0aCB0cmFpbGluZyBzbGFzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC8nO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC8nLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudC9hdXRob3JpemUnLFxuXHRcdFx0XHR0b2tlbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvdG9rZW4nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSksXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdPSydcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBleHBlY3RlZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyL3RlbmFudC8nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycywgW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgYWRkaXRpb25hbCBoZWFkZXJzIGluIGFsbCByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudCc7XG5cdFx0XHRjb25zdCBhZGRpdGlvbmFsSGVhZGVycyA9IHtcblx0XHRcdFx0J1gtQ3VzdG9tLUhlYWRlcic6ICdjdXN0b20tdmFsdWUnLFxuXHRcdFx0XHQnQXV0aG9yaXphdGlvbic6ICdCZWFyZXIgdG9rZW4xMjMnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudCcsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiwgYWRkaXRpb25hbEhlYWRlcnMgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyL3RlbmFudCcpO1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1sxXS5oZWFkZXJzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtQ3VzdG9tLUhlYWRlciddLCAnY3VzdG9tLXZhbHVlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQXV0aG9yaXphdGlvbiddLCAnQmVhcmVyIHRva2VuMTIzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQWNjZXB0J10sICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHRocm93IEFnZ3JlZ2F0ZUVycm9yIHdoZW4gYWxsIGRpc2NvdmVyeSBlbmRwb2ludHMgZmFpbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudCc7XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnTm90IEZvdW5kJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ05vdCBGb3VuZCcsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgSlNPTicpOyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KSxcblx0XHRcdFx0KGVycm9yOiBhbnkpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvciwgJ1Nob3VsZCBiZSBhbiBBZ2dyZWdhdGVFcnJvcicpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5lcnJvcnMubGVuZ3RoLCAzLCAnU2hvdWxkIGNvbnRhaW4gMyBlcnJvcnMgKG9uZSBmb3IgZWFjaCBVUkwpJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLm1lc3NhZ2UsICdGYWlsZWQgdG8gZmV0Y2ggYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgZnJvbSBhbGwgYXR0ZW1wdGVkIFVSTHMnKTtcblx0XHRcdFx0XHQvLyBWZXJpZnkgZWFjaCBlcnJvciBpbmNsdWRlcyB0aGUgVVJMIGl0IGF0dGVtcHRlZFxuXHRcdFx0XHRcdGFzc2VydC5vaygvb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXIuKjQwNC8udGVzdChlcnJvci5lcnJvcnNbMF0ubWVzc2FnZSksICdGaXJzdCBlcnJvciBzaG91bGQgbWVudGlvbiBPQXV0aCBkaXNjb3ZlcnkgYW5kIDQwNCcpO1xuXHRcdFx0XHRcdGFzc2VydC5vaygvb3BlbmlkLWNvbmZpZ3VyYXRpb24uKjQwNC8udGVzdChlcnJvci5lcnJvcnNbMV0ubWVzc2FnZSksICdTZWNvbmQgZXJyb3Igc2hvdWxkIG1lbnRpb24gT3BlbklEIHBhdGggaW5zZXJ0aW9uIGFuZCA0MDQnKTtcblx0XHRcdFx0XHRhc3NlcnQub2soL29wZW5pZC1jb25maWd1cmF0aW9uLio0MDQvLnRlc3QoZXJyb3IuZXJyb3JzWzJdLm1lc3NhZ2UpLCAnVGhpcmQgZXJyb3Igc2hvdWxkIG1lbnRpb24gT3BlbklEIHBhdGggYWRkaXRpb24gYW5kIDQwNCcpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBTaG91bGQgaGF2ZSB0cmllZCBhbGwgdGhyZWUgZW5kcG9pbnRzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdGhyb3cgc2luZ2xlIGVycm9yIChub3QgQWdncmVnYXRlRXJyb3IpIHdoZW4gb25seSBvbmUgVVJMIGlzIHRyaWVkIGFuZCBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJztcblxuXHRcdFx0Ly8gRmlyc3QgYXR0ZW1wdCBzdWNjZWVkcyBvbiBzZWNvbmQgdHJ5LCBzbyBvbmx5IG9uZSBlcnJvciBpcyBjb2xsZWN0ZWQgZm9yIGZpcnN0IFVSTFxuXHRcdFx0ZmV0Y2hTdHViLm9uRmlyc3RDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDUwMCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ0ludGVybmFsIFNlcnZlciBFcnJvcicsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdJbnRlcm5hbCBTZXJ2ZXIgRXJyb3InLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IEpTT04nKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSksXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdPSydcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBTaG91bGQgc3VjY2VlZCBvbiBzZWNvbmQgYXR0ZW1wdFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBBZ2dyZWdhdGVFcnJvciB3aGVuIG11bHRpcGxlIFVSTHMgZmFpbCB3aXRoIG1peGVkIGVycm9yIHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50JztcblxuXHRcdFx0Ly8gRmlyc3QgY2FsbDogbmV0d29yayBlcnJvclxuXHRcdFx0ZmV0Y2hTdHViLm9uRmlyc3RDYWxsKCkucmVqZWN0cyhuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gdGltZW91dCcpKTtcblxuXHRcdFx0Ly8gU2Vjb25kIGNhbGw6IDQwNFxuXHRcdFx0ZmV0Y2hTdHViLm9uU2Vjb25kQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJyxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBKU09OJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGlyZCBjYWxsOiA1MDBcblx0XHRcdGZldGNoU3R1Yi5vblRoaXJkQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA1MDAsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdJbnRlcm5hbCBTZXJ2ZXIgRXJyb3InLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnSW50ZXJuYWwgU2VydmVyIEVycm9yJyxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBKU09OJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yLCAnU2hvdWxkIGJlIGFuIEFnZ3JlZ2F0ZUVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmVycm9ycy5sZW5ndGgsIDMsICdTaG91bGQgY29udGFpbiAzIGVycm9ycycpO1xuXHRcdFx0XHRcdC8vIEZpcnN0IGVycm9yIGlzIG5ldHdvcmsgZXJyb3Jcblx0XHRcdFx0XHRhc3NlcnQub2soL0Nvbm5lY3Rpb24gdGltZW91dC8udGVzdChlcnJvci5lcnJvcnNbMF0ubWVzc2FnZSksICdGaXJzdCBlcnJvciBzaG91bGQgYmUgbmV0d29yayBlcnJvcicpO1xuXHRcdFx0XHRcdC8vIFNlY29uZCBlcnJvciBpcyA0MDRcblx0XHRcdFx0XHRhc3NlcnQub2soLzQwNC4qTm90IEZvdW5kLy50ZXN0KGVycm9yLmVycm9yc1sxXS5tZXNzYWdlKSwgJ1NlY29uZCBlcnJvciBzaG91bGQgYmUgNDA0Jyk7XG5cdFx0XHRcdFx0Ly8gVGhpcmQgZXJyb3IgaXMgNTAwXG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC81MDAuKkludGVybmFsIFNlcnZlciBFcnJvci8udGVzdChlcnJvci5lcnJvcnNbMl0ubWVzc2FnZSksICdUaGlyZCBlcnJvciBzaG91bGQgYmUgNTAwJyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgaW52YWxpZCBKU09OIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgSlNPTicpOyB9LFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnSW52YWxpZCBKU09OJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRhc3luYyAoKSA9PiBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSksXG5cdFx0XHRcdC9GYWlsZWQgdG8gZmV0Y2ggYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEvXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSB2YWxpZCBKU09OIGJ1dCBpbnZhbGlkIG1ldGFkYXRhIHN0cnVjdHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJztcblx0XHRcdGNvbnN0IGludmFsaWRNZXRhZGF0YSA9IHtcblx0XHRcdFx0Ly8gTWlzc2luZyByZXF1aXJlZCAnaXNzdWVyJyBmaWVsZFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL2F1dGhvcml6ZSdcblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBpbnZhbGlkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGludmFsaWRNZXRhZGF0YSksXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdPSydcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQvRmFpbGVkIHRvIGZldGNoIGF1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhL1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgZ2xvYmFsIGZldGNoIHdoZW4gY3VzdG9tIGZldGNoIGlzIG5vdCBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGNvbnN0IGdsb2JhbEZldGNoU3R1YiA9IHNhbmRib3guc3R1YihnbG9iYWxUaGlzLCAnZmV0Y2gnKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSBhcyBhbnkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycywgW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2JhbEZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBuZXR3b3JrIGZldGNoIGZhaWx1cmUgYW5kIGNvbnRpbnVlIHRvIG5leHQgZW5kcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSc7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRmlyc3QgY2FsbCB0aHJvd3MgbmV0d29yayBlcnJvciwgc2Vjb25kIHN1Y2NlZWRzXG5cdFx0XHRmZXRjaFN0dWIub25GaXJzdENhbGwoKS5yZWplY3RzKG5ldyBFcnJvcignTmV0d29yayBlcnJvcicpKTtcblx0XHRcdGZldGNoU3R1Yi5vblNlY29uZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vaygvTmV0d29yayBlcnJvci8udGVzdChyZXN1bHQuZXJyb3JzWzBdLm1lc3NhZ2UpKTtcblx0XHRcdC8vIFNob3VsZCBoYXZlIHRyaWVkIHR3byBlbmRwb2ludHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0aHJvdyBlcnJvciB3aGVuIG5ldHdvcmsgZmFpbHMgb24gYWxsIGVuZHBvaW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJztcblxuXHRcdFx0ZmV0Y2hTdHViLnJlamVjdHMobmV3IEVycm9yKCdOZXR3b3JrIGVycm9yJykpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yLCAnU2hvdWxkIGJlIGFuIEFnZ3JlZ2F0ZUVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmVycm9ycy5sZW5ndGgsIDMsICdTaG91bGQgY29udGFpbiAzIGVycm9ycycpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5tZXNzYWdlLCAnRmFpbGVkIHRvIGZldGNoIGF1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhIGZyb20gYWxsIGF0dGVtcHRlZCBVUkxzJyk7XG5cdFx0XHRcdFx0Ly8gQWxsIGVycm9ycyBzaG91bGQgYmUgbmV0d29yayBlcnJvcnNcblx0XHRcdFx0XHRhc3NlcnQub2soL05ldHdvcmsgZXJyb3IvLnRlc3QoZXJyb3IuZXJyb3JzWzBdLm1lc3NhZ2UpLCAnRmlyc3QgZXJyb3Igc2hvdWxkIGJlIG5ldHdvcmsgZXJyb3InKTtcblx0XHRcdFx0XHRhc3NlcnQub2soL05ldHdvcmsgZXJyb3IvLnRlc3QoZXJyb3IuZXJyb3JzWzFdLm1lc3NhZ2UpLCAnU2Vjb25kIGVycm9yIHNob3VsZCBiZSBuZXR3b3JrIGVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKC9OZXR3b3JrIGVycm9yLy50ZXN0KGVycm9yLmVycm9yc1syXS5tZXNzYWdlKSwgJ1RoaXJkIGVycm9yIHNob3VsZCBiZSBuZXR3b3JrIGVycm9yJyk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdC8vIFNob3VsZCBoYXZlIHRyaWVkIGFsbCB0aHJlZSBlbmRwb2ludHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4IG9mIG5ldHdvcmsgZXJyb3IgYW5kIG5vbi0yMDAgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQnO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudCcsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdC8vIEZpcnN0IGNhbGwgdGhyb3dzIG5ldHdvcmsgZXJyb3Jcblx0XHRcdGZldGNoU3R1Yi5vbkZpcnN0Q2FsbCgpLnJlamVjdHMobmV3IEVycm9yKCdDb25uZWN0aW9uIHRpbWVvdXQnKSk7XG5cblx0XHRcdC8vIFNlY29uZCBjYWxsIHJldHVybnMgNDA0XG5cdFx0XHRmZXRjaFN0dWIub25TZWNvbmRDYWxsKCkucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDQwNCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gJ05vdCBGb3VuZCcsXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IEpTT04nKTsgfVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoaXJkIGNhbGwgc3VjY2VlZHNcblx0XHRcdGZldGNoU3R1Yi5vblRoaXJkQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiAyMDAsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IGV4cGVjdGVkTWV0YWRhdGEsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkTWV0YWRhdGEpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgZXhwZWN0ZWRNZXRhZGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycy5sZW5ndGgsIDIpO1xuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgdHJpZWQgYWxsIHRocmVlIGVuZHBvaW50c1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZXNwb25zZS50ZXh0KCkgZmFpbHVyZSBpbiBlcnJvciBjYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDUwMCxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZWFkIHRleHQnKTsgfSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ0ludGVybmFsIFNlcnZlciBFcnJvcicsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcmVhZCBqc29uJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0YXN5bmMgKCkgPT4gZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEoYXV0aG9yaXphdGlvblNlcnZlciwgeyBmZXRjaDogZmV0Y2hTdHViIH0pLFxuXHRcdFx0XHQoZXJyb3I6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yLCAnU2hvdWxkIGJlIGFuIEFnZ3JlZ2F0ZUVycm9yJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLmVycm9ycy5sZW5ndGgsIDMsICdTaG91bGQgY29udGFpbiAzIGVycm9ycycpO1xuXHRcdFx0XHRcdC8vIEFsbCBlcnJvcnMgc2hvdWxkIGluY2x1ZGUgc3RhdHVzIGNvZGUgYW5kIHN0YXR1c1RleHQgKGZhbGxiYWNrIHdoZW4gdGV4dCgpIGZhaWxzKVxuXHRcdFx0XHRcdGZvciAoY29uc3QgZXJyIG9mIGVycm9yLmVycm9ycykge1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKC81MDAgSW50ZXJuYWwgU2VydmVyIEVycm9yLy50ZXN0KGVyci5tZXNzYWdlKSwgYEVycm9yIHNob3VsZCBtZW50aW9uIDUwMCBhbmQgc3RhdHVzVGV4dDogJHtlcnIubWVzc2FnZX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgY29ycmVjdGx5IGhhbmRsZSBwYXRoIGFkZGl0aW9uIHdpdGggdHJhaWxpbmcgc2xhc2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvJztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvJyxcblx0XHRcdFx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBbJ2NvZGUnXVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRmlyc3QgdHdvIGNhbGxzIGZhaWwsIHRoaXJkIHN1Y2NlZWRzXG5cdFx0XHRmZXRjaFN0dWIub25GaXJzdENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogNDA0LFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiAnTm90IEZvdW5kJyxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ05vdCBGb3VuZCcsXG5cdFx0XHRcdGpzb246IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgSlNPTicpOyB9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZmV0Y2hTdHViLm9uU2Vjb25kQ2FsbCgpLnJlc29sdmVzKHtcblx0XHRcdFx0c3RhdHVzOiA0MDQsXG5cdFx0XHRcdHRleHQ6IGFzeW5jICgpID0+ICdOb3QgRm91bmQnLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnTm90IEZvdW5kJyxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBKU09OJyk7IH1cblx0XHRcdH0pO1xuXG5cdFx0XHRmZXRjaFN0dWIub25UaGlyZENhbGwoKS5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Ly53ZWxsLWtub3duL29wZW5pZC1jb25maWd1cmF0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDMpO1xuXHRcdFx0Ly8gVGhpcmQgYXR0ZW1wdCBzaG91bGQgY29ycmVjdGx5IGhhbmRsZSB0cmFpbGluZyBzbGFzaCAobm90IGRvdWJsZS1zbGFzaClcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIudGhpcmRDYWxsLmFyZ3NbMF0sICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50Ly53ZWxsLWtub3duL29wZW5pZC1jb25maWd1cmF0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGRlZXBseSBuZXN0ZWQgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQvb3JnL3N1Yic7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhID0ge1xuXHRcdFx0XHRpc3N1ZXI6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vdGVuYW50L29yZy9zdWInLFxuXHRcdFx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZSddXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gZXhwZWN0ZWRNZXRhZGF0YSxcblx0XHRcdFx0dGV4dDogYXN5bmMgKCkgPT4gSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRNZXRhZGF0YSksXG5cdFx0XHRcdHN0YXR1c1RleHQ6ICdPSydcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShhdXRob3JpemF0aW9uU2VydmVyLCB7IGZldGNoOiBmZXRjaFN0dWIgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1ldGFkYXRhLCBleHBlY3RlZE1ldGFkYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyL3RlbmFudC9vcmcvc3ViJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lcnJvcnMsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAxKTtcblx0XHRcdC8vIFNob3VsZCBjb3JyZWN0bHkgaW5zZXJ0IHdlbGwta25vd24gcGF0aCB3aXRoIG5lc3RlZCBwYXRoc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1swXSwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlci90ZW5hbnQvb3JnL3N1YicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSAyMDAgcmVzcG9uc2Ugd2l0aCBub24tbWV0YWRhdGEgSlNPTicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJztcblx0XHRcdGNvbnN0IGludmFsaWRSZXNwb25zZSA9IHtcblx0XHRcdFx0ZXJyb3I6ICdub3Rfc3VwcG9ydGVkJyxcblx0XHRcdFx0bWVzc2FnZTogJ01ldGFkYXRhIG5vdCBhdmFpbGFibGUnXG5cdFx0XHR9O1xuXG5cdFx0XHRmZXRjaFN0dWIucmVzb2x2ZXMoe1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0anNvbjogYXN5bmMgKCkgPT4gaW52YWxpZFJlc3BvbnNlLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShpbnZhbGlkUmVzcG9uc2UpLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiAnT0snXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdGFzeW5jICgpID0+IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KSxcblx0XHRcdFx0KGVycm9yOiBhbnkpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyb3IgaW5zdGFuY2VvZiBBZ2dyZWdhdGVFcnJvciwgJ1Nob3VsZCBiZSBhbiBBZ2dyZWdhdGVFcnJvcicpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5lcnJvcnMubGVuZ3RoLCAzLCAnU2hvdWxkIGNvbnRhaW4gMyBlcnJvcnMnKTtcblx0XHRcdFx0XHQvLyBBbGwgZXJyb3JzIHNob3VsZCBpbmRpY2F0ZSBmYWlsZWQgdG8gZmV0Y2ggd2l0aCBzdGF0dXMgY29kZVxuXHRcdFx0XHRcdGZvciAoY29uc3QgZXJyIG9mIGVycm9yLmVycm9ycykge1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKC9GYWlsZWQgdG8gZmV0Y2ggYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgZnJvbS8udGVzdChlcnIubWVzc2FnZSksIGBFcnJvciBzaG91bGQgbWVudGlvbiBmYWlsZWQgZmV0Y2g6ICR7ZXJyLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBTaG91bGQgdHJ5IGFsbCB0aHJlZSBlbmRwb2ludHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmZXRjaFN0dWIuY2FsbENvdW50LCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB2YWxpZGF0ZSBtZXRhZGF0YSBhY2NvcmRpbmcgdG8gaXNBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyID0gJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbSc7XG5cdFx0XHQvLyBWYWxpZCBtZXRhZGF0YSB3aXRoIGFsbCByZXF1aXJlZCBmaWVsZHNcblx0XHRcdGNvbnN0IHZhbGlkTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8nLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL2F1dGhvcml6ZScsXG5cdFx0XHRcdHRva2VuX2VuZHBvaW50OiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3Rva2VuJyxcblx0XHRcdFx0andrc191cmk6ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vandrcycsXG5cdFx0XHRcdHJlZ2lzdHJhdGlvbl9lbmRwb2ludDogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS9yZWdpc3RlcicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJywgJ3Rva2VuJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiB2YWxpZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeSh2YWxpZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIHZhbGlkTWV0YWRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNjb3ZlcnlVcmwsICdodHRwczovL2F1dGguZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVycm9ycywgW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZldGNoU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBVUkxzIHdpdGggcXVlcnkgcGFyYW1ldGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXIgPSAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tL3RlbmFudD92ZXJzaW9uPXYyJztcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWV0YWRhdGE6IElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlzc3VlcjogJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS90ZW5hbnQ/dmVyc2lvbj12MicsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWV0YWRhdGEsIGV4cGVjdGVkTWV0YWRhdGEpO1xuXHRcdFx0Ly8gUXVlcnkgcGFyYW1ldGVycyBhcmUgbm90IGluY2x1ZGVkIGluIHRoZSBkaXNjb3ZlcnkgVVJMIChvbmx5IHBhdGhuYW1lIGlzIGV4dHJhY3RlZClcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLy53ZWxsLWtub3duL29hdXRoLWF1dGhvcml6YXRpb24tc2VydmVyL3RlbmFudCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZXJyb3JzLCBbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmV0Y2hTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IGFkZGl0aW9uYWxIZWFkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9ICdodHRwczovL2F1dGguZXhhbXBsZS5jb20nO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSA9IHtcblx0XHRcdFx0aXNzdWVyOiAnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tLycsXG5cdFx0XHRcdHJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZDogWydjb2RlJ11cblx0XHRcdH07XG5cblx0XHRcdGZldGNoU3R1Yi5yZXNvbHZlcyh7XG5cdFx0XHRcdHN0YXR1czogMjAwLFxuXHRcdFx0XHRqc29uOiBhc3luYyAoKSA9PiBleHBlY3RlZE1ldGFkYXRhLFxuXHRcdFx0XHR0ZXh0OiBhc3luYyAoKSA9PiBKU09OLnN0cmluZ2lmeShleHBlY3RlZE1ldGFkYXRhKSxcblx0XHRcdFx0c3RhdHVzVGV4dDogJ09LJ1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKGF1dGhvcml6YXRpb25TZXJ2ZXIsIHsgZmV0Y2g6IGZldGNoU3R1YiwgYWRkaXRpb25hbEhlYWRlcnM6IHt9IH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2NvdmVyeVVybCwgJ2h0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8ud2VsbC1rbm93bi9vYXV0aC1hdXRob3JpemF0aW9uLXNlcnZlcicpO1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGZldGNoU3R1Yi5maXJzdENhbGwuYXJnc1sxXS5oZWFkZXJzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ0FjY2VwdCddLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ3Jvc3MgQXBwIEFjY2VzcyAoSUQtSkFHKSB3aXJlIGZvcm1hdCcsICgpID0+IHtcblx0XHQvLyBTcGVjOiBkcmFmdC1pZXRmLW9hdXRoLWlkZW50aXR5LWFzc2VydGlvbi1hdXRoei1ncmFudC0wM1xuXHRcdHRlc3QoJ2J1aWxkSWRKYWdFeGNoYW5nZUJvZHkgZW1pdHMgdGhlIGV4YWN0IHNwZWMgcGFyYW1ldGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGJvZHkgPSBidWlsZElkSmFnRXhjaGFuZ2VCb2R5KFxuXHRcdFx0XHQnbXlfaWRwX2NsaWVudF9pZCcsXG5cdFx0XHRcdCdzZWNyZXRfeHl6Jyxcblx0XHRcdFx0JzxpZF90b2tlbj4nLFxuXHRcdFx0XHQnaHR0cHM6Ly9hdXRoLnJlc291cmNlLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0J2h0dHBzOi8vYXBpLnJlc291cmNlLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0Wyd0b2Rvcy5yZWFkJywgJ21jcC5hY2Nlc3MnXSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgnY2xpZW50X2lkJyksICdteV9pZHBfY2xpZW50X2lkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5nZXQoJ2NsaWVudF9zZWNyZXQnKSwgJ3NlY3JldF94eXonKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgnZ3JhbnRfdHlwZScpLCAndXJuOmlldGY6cGFyYW1zOm9hdXRoOmdyYW50LXR5cGU6dG9rZW4tZXhjaGFuZ2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgnc3ViamVjdF90b2tlbicpLCAnPGlkX3Rva2VuPicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdzdWJqZWN0X3Rva2VuX3R5cGUnKSwgJ3VybjppZXRmOnBhcmFtczpvYXV0aDp0b2tlbi10eXBlOmlkX3Rva2VuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5nZXQoJ3JlcXVlc3RlZF90b2tlbl90eXBlJyksICd1cm46aWV0ZjpwYXJhbXM6b2F1dGg6dG9rZW4tdHlwZTppZC1qYWcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgnYXVkaWVuY2UnKSwgJ2h0dHBzOi8vYXV0aC5yZXNvdXJjZS5leGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdyZXNvdXJjZScpLCAnaHR0cHM6Ly9hcGkucmVzb3VyY2UuZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgnc2NvcGUnKSwgJ3RvZG9zLnJlYWQgbWNwLmFjY2VzcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYnVpbGRJZEphZ0V4Y2hhbmdlQm9keSBvbWl0cyBjbGllbnRfc2VjcmV0IHdoZW4gbm90IHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYm9keSA9IGJ1aWxkSWRKYWdFeGNoYW5nZUJvZHkoXG5cdFx0XHRcdCdwdWJsaWNfY2xpZW50X2lkJyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQnPGlkX3Rva2VuPicsXG5cdFx0XHRcdCdodHRwczovL2F1dGgucmVzb3VyY2UuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFtdLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuaGFzKCdjbGllbnRfc2VjcmV0JyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmhhcygncmVzb3VyY2UnKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuaGFzKCdzY29wZScpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdidWlsZFJlc291cmNlUmVkZW1wdGlvbkJvZHkgZW1pdHMgYW4gUkZDIDc1MjMgSldULWJlYXJlciBncmFudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGJvZHkgPSBidWlsZFJlc291cmNlUmVkZW1wdGlvbkJvZHkoXG5cdFx0XHRcdCdteV9pZHBfY2xpZW50X2lkLWF0LXRvZG8wJyxcblx0XHRcdFx0J3NlY3JldF94eXonLFxuXHRcdFx0XHQnPGlkX2phZz4nLFxuXHRcdFx0XHQnaHR0cHM6Ly9hcGkucmVzb3VyY2UuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRbJ3RvZG9zLnJlYWQnLCAnbWNwLmFjY2VzcyddLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdjbGllbnRfaWQnKSwgJ215X2lkcF9jbGllbnRfaWQtYXQtdG9kbzAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgnY2xpZW50X3NlY3JldCcpLCAnc2VjcmV0X3h5eicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZ2V0KCdncmFudF90eXBlJyksICd1cm46aWV0ZjpwYXJhbXM6b2F1dGg6Z3JhbnQtdHlwZTpqd3QtYmVhcmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5nZXQoJ2Fzc2VydGlvbicpLCAnPGlkX2phZz4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmdldCgncmVzb3VyY2UnKSwgJ2h0dHBzOi8vYXBpLnJlc291cmNlLmV4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5nZXQoJ3Njb3BlJyksICd0b2Rvcy5yZWFkIG1jcC5hY2Nlc3MnKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixZQUFZLFdBQVc7QUFDdkI7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7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
