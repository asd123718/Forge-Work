import { decodeBase64 } from "./buffer.js";
const WELL_KNOWN_ROUTE = "/.well-known";
const AUTH_PROTECTED_RESOURCE_METADATA_DISCOVERY_PATH = `${WELL_KNOWN_ROUTE}/oauth-protected-resource`;
const AUTH_SERVER_METADATA_DISCOVERY_PATH = `${WELL_KNOWN_ROUTE}/oauth-authorization-server`;
const OPENID_CONNECT_DISCOVERY_PATH = `${WELL_KNOWN_ROUTE}/openid-configuration`;
const AUTH_SCOPE_SEPARATOR = " ";
const GRANT_TYPE_TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
const TOKEN_TYPE_ACCESS_TOKEN = "urn:ietf:params:oauth:token-type:access_token";
const TOKEN_TYPE_ID_TOKEN = "urn:ietf:params:oauth:token-type:id_token";
const TOKEN_TYPE_ID_JAG = "urn:ietf:params:oauth:token-type:id-jag";
const GRANT_TYPE_JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";
function buildIdJagExchangeBody(clientId, clientSecret, idToken, audience, resource, scopes) {
  const body = new URLSearchParams();
  body.append("client_id", clientId);
  if (clientSecret) {
    body.append("client_secret", clientSecret);
  }
  body.append("grant_type", GRANT_TYPE_TOKEN_EXCHANGE);
  body.append("subject_token", idToken);
  body.append("subject_token_type", TOKEN_TYPE_ID_TOKEN);
  body.append("requested_token_type", TOKEN_TYPE_ID_JAG);
  body.append("audience", audience);
  if (resource) {
    body.append("resource", resource);
  }
  if (scopes.length) {
    body.append("scope", scopes.join(AUTH_SCOPE_SEPARATOR));
  }
  return body;
}
function buildResourceRedemptionBody(clientId, clientSecret, idJag, resource, scopes) {
  const body = new URLSearchParams();
  body.append("client_id", clientId);
  if (clientSecret) {
    body.append("client_secret", clientSecret);
  }
  body.append("grant_type", GRANT_TYPE_JWT_BEARER);
  body.append("assertion", idJag);
  if (resource) {
    body.append("resource", resource);
  }
  if (scopes.length) {
    body.append("scope", scopes.join(AUTH_SCOPE_SEPARATOR));
  }
  return body;
}
var AuthorizationErrorType = /* @__PURE__ */ ((AuthorizationErrorType2) => {
  AuthorizationErrorType2["InvalidRequest"] = "invalid_request";
  AuthorizationErrorType2["InvalidClient"] = "invalid_client";
  AuthorizationErrorType2["InvalidGrant"] = "invalid_grant";
  AuthorizationErrorType2["UnauthorizedClient"] = "unauthorized_client";
  AuthorizationErrorType2["UnsupportedGrantType"] = "unsupported_grant_type";
  AuthorizationErrorType2["InvalidScope"] = "invalid_scope";
  return AuthorizationErrorType2;
})(AuthorizationErrorType || {});
var AuthorizationDeviceCodeErrorType = /* @__PURE__ */ ((AuthorizationDeviceCodeErrorType2) => {
  AuthorizationDeviceCodeErrorType2["AuthorizationPending"] = "authorization_pending";
  AuthorizationDeviceCodeErrorType2["SlowDown"] = "slow_down";
  AuthorizationDeviceCodeErrorType2["AccessDenied"] = "access_denied";
  AuthorizationDeviceCodeErrorType2["ExpiredToken"] = "expired_token";
  return AuthorizationDeviceCodeErrorType2;
})(AuthorizationDeviceCodeErrorType || {});
var AuthorizationRegistrationErrorType = /* @__PURE__ */ ((AuthorizationRegistrationErrorType2) => {
  AuthorizationRegistrationErrorType2["InvalidRedirectUri"] = "invalid_redirect_uri";
  AuthorizationRegistrationErrorType2["InvalidClientMetadata"] = "invalid_client_metadata";
  AuthorizationRegistrationErrorType2["InvalidSoftwareStatement"] = "invalid_software_statement";
  AuthorizationRegistrationErrorType2["UnapprovedSoftwareStatement"] = "unapproved_software_statement";
  return AuthorizationRegistrationErrorType2;
})(AuthorizationRegistrationErrorType || {});
function isAuthorizationProtectedResourceMetadata(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const metadata = obj;
  if (!metadata.resource) {
    return false;
  }
  if (metadata.scopes_supported !== void 0 && !Array.isArray(metadata.scopes_supported)) {
    return false;
  }
  return true;
}
const urisToCheck = [
  "issuer",
  "authorization_endpoint",
  "token_endpoint",
  "registration_endpoint",
  "jwks_uri"
];
function isAuthorizationServerMetadata(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const metadata = obj;
  if (!metadata.issuer) {
    throw new Error("Authorization server metadata must have an issuer");
  }
  for (const uri of urisToCheck) {
    if (!metadata[uri]) {
      continue;
    }
    if (typeof metadata[uri] !== "string") {
      throw new Error(`Authorization server metadata '${uri}' must be a string`);
    }
    if (!metadata[uri].startsWith("https://") && !metadata[uri].startsWith("http://")) {
      throw new Error(`Authorization server metadata '${uri}' must start with http:// or https://`);
    }
  }
  return true;
}
function isAuthorizationDynamicClientRegistrationResponse(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const response = obj;
  return response.client_id !== void 0;
}
function isAuthorizationAuthorizeResponse(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const response = obj;
  return response.code !== void 0 && response.state !== void 0;
}
function isAuthorizationTokenResponse(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const response = obj;
  return response.access_token !== void 0 && response.token_type !== void 0;
}
function isAuthorizationDeviceResponse(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const response = obj;
  return response.device_code !== void 0 && response.user_code !== void 0 && response.verification_uri !== void 0 && response.expires_in !== void 0;
}
function isAuthorizationErrorResponse(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const response = obj;
  return response.error !== void 0;
}
function isAuthorizationRegistrationErrorResponse(obj) {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  const response = obj;
  return response.error !== void 0;
}
function getDefaultMetadataForUrl(authorizationServer) {
  return {
    issuer: authorizationServer.toString(),
    authorization_endpoint: new URL("/authorize", authorizationServer).toString(),
    token_endpoint: new URL("/token", authorizationServer).toString(),
    registration_endpoint: new URL("/register", authorizationServer).toString(),
    // Default values for Dynamic OpenID Providers
    // https://openid.net/specs/openid-connect-discovery-1_0.html
    response_types_supported: ["code", "id_token", "id_token token"]
  };
}
const grantTypesSupported = ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"];
const DEFAULT_AUTH_FLOW_PORT = 33418;
async function fetchDynamicRegistration(serverMetadata, clientName, scopes) {
  if (!serverMetadata.registration_endpoint) {
    throw new Error("Server does not support dynamic registration");
  }
  const requestBody = {
    client_name: clientName,
    client_uri: "https://code.visualstudio.com",
    grant_types: serverMetadata.grant_types_supported ? serverMetadata.grant_types_supported.filter((gt) => grantTypesSupported.includes(gt)) : grantTypesSupported,
    response_types: ["code"],
    redirect_uris: [
      "https://insiders.vscode.dev/redirect",
      "https://vscode.dev/redirect",
      "http://127.0.0.1/",
      // Added these for any server that might do
      // only exact match on the redirect URI even
      // though the spec says it should not care
      // about the port.
      `http://127.0.0.1:${DEFAULT_AUTH_FLOW_PORT}/`
    ],
    scope: scopes?.join(AUTH_SCOPE_SEPARATOR),
    token_endpoint_auth_method: "none",
    application_type: "native"
  };
  const response = await fetch(serverMetadata.registration_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const result = await response.text();
    let errorDetails = result;
    try {
      const errorResponse = JSON.parse(result);
      if (isAuthorizationRegistrationErrorResponse(errorResponse)) {
        errorDetails = `${errorResponse.error}${errorResponse.error_description ? `: ${errorResponse.error_description}` : ""}`;
      }
    } catch {
    }
    throw new Error(`Registration to ${serverMetadata.registration_endpoint} failed: ${errorDetails}`);
  }
  const registration = await response.json();
  if (isAuthorizationDynamicClientRegistrationResponse(registration)) {
    return registration;
  }
  throw new Error(`Invalid authorization dynamic client registration response: ${JSON.stringify(registration)}`);
}
function parseWWWAuthenticateHeader(wwwAuthenticateHeaderValue) {
  const challenges = [];
  const tokens = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < wwwAuthenticateHeaderValue.length; i++) {
    const char = wwwAuthenticateHeaderValue[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === "," && !inQuotes) {
      if (current.trim()) {
        tokens.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    tokens.push(current.trim());
  }
  let currentChallenge;
  for (const token of tokens) {
    const hasEquals = token.includes("=");
    if (!hasEquals) {
      if (currentChallenge) {
        challenges.push(currentChallenge);
      }
      currentChallenge = { scheme: token.trim(), params: {} };
    } else {
      const spaceIndex = token.indexOf(" ");
      if (spaceIndex > 0) {
        const beforeSpace = token.substring(0, spaceIndex);
        const afterSpace = token.substring(spaceIndex + 1);
        if (!beforeSpace.includes("=") && afterSpace.includes("=")) {
          if (currentChallenge) {
            challenges.push(currentChallenge);
          }
          currentChallenge = { scheme: beforeSpace.trim(), params: {} };
          const equalIndex = afterSpace.indexOf("=");
          if (equalIndex > 0) {
            const key = afterSpace.substring(0, equalIndex).trim();
            const value = afterSpace.substring(equalIndex + 1).trim().replace(/^"|"$/g, "");
            if (key && value !== void 0) {
              currentChallenge.params[key] = value;
            }
          }
          continue;
        }
      }
      if (currentChallenge) {
        const equalIndex = token.indexOf("=");
        if (equalIndex > 0) {
          const key = token.substring(0, equalIndex).trim();
          const value = token.substring(equalIndex + 1).trim().replace(/^"|"$/g, "");
          if (key && value !== void 0) {
            currentChallenge.params[key] = value;
          }
        }
      }
    }
  }
  if (currentChallenge) {
    challenges.push(currentChallenge);
  }
  return challenges;
}
function getClaimsFromJWT(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT token format: token must have three parts separated by dots");
  }
  const [header, payload, _signature] = parts;
  try {
    const decodedHeader = JSON.parse(decodeBase64(header).toString());
    if (typeof decodedHeader !== "object") {
      throw new Error("Invalid JWT token format: header is not a JSON object");
    }
    const decodedPayload = JSON.parse(decodeBase64(payload).toString());
    if (typeof decodedPayload !== "object") {
      throw new Error("Invalid JWT token format: payload is not a JSON object");
    }
    return decodedPayload;
  } catch (e) {
    if (e instanceof Error) {
      throw new Error(`Failed to parse JWT token: ${e.message}`);
    }
    throw new Error("Failed to parse JWT token");
  }
}
function scopesMatch(scopes1, scopes2) {
  if (scopes1 === scopes2) {
    return true;
  }
  if (!scopes1 || !scopes2) {
    return false;
  }
  if (scopes1.length !== scopes2.length) {
    return false;
  }
  const sortedScopes1 = [...scopes1].sort();
  const sortedScopes2 = [...scopes2].sort();
  return sortedScopes1.every((scope, index) => scope === sortedScopes2[index]);
}
async function fetchResourceMetadata(targetResource, resourceMetadataUrl, options = {}) {
  const {
    sameOriginHeaders = {},
    fetch: fetchImpl = fetch
  } = options;
  const targetResourceUrlObj = new URL(targetResource);
  const fetchPrm = async (prmUrl, validateUrl) => {
    let headers = {
      "Accept": "application/json"
    };
    const resourceMetadataUrlObj = new URL(prmUrl);
    if (resourceMetadataUrlObj.origin === targetResourceUrlObj.origin) {
      headers = {
        ...headers,
        ...sameOriginHeaders
      };
    }
    const response = await fetchImpl(prmUrl, { method: "GET", headers });
    if (response.status !== 200) {
      let errorText;
      try {
        errorText = await response.text();
      } catch {
        errorText = response.statusText;
      }
      throw new Error(`Failed to fetch resource metadata from ${prmUrl}: ${response.status} ${errorText}`);
    }
    const body = await response.json();
    if (isAuthorizationProtectedResourceMetadata(body)) {
      const prmValue = new URL(body.resource).toString();
      const expectedResource = new URL(validateUrl).toString();
      if (prmValue !== expectedResource) {
        throw new Error(`Protected Resource Metadata 'resource' property value "${prmValue}" does not match expected value "${expectedResource}" for URL ${prmUrl}. Per RFC 9728, these MUST match. See https://datatracker.ietf.org/doc/html/rfc9728#PRConfigurationValidation`);
      }
      return body;
    } else {
      throw new Error(`Invalid resource metadata from ${prmUrl}. Expected to follow shape of https://datatracker.ietf.org/doc/html/rfc9728#name-protected-resource-metadata (Hints: is scopes_supported an array? Is resource a string?). Current payload: ${JSON.stringify(body)}`);
    }
  };
  const errors = [];
  if (resourceMetadataUrl) {
    try {
      const metadata = await fetchPrm(resourceMetadataUrl, targetResource);
      return { metadata, discoveryUrl: resourceMetadataUrl, errors };
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
  }
  const hasPathComponent = targetResourceUrlObj.pathname !== "/";
  const rootUrl = `${targetResourceUrlObj.origin}${AUTH_PROTECTED_RESOURCE_METADATA_DISCOVERY_PATH}`;
  if (hasPathComponent) {
    const pathAppendedUrl = `${rootUrl}${targetResourceUrlObj.pathname}`;
    try {
      const metadata = await fetchPrm(pathAppendedUrl, targetResource);
      return { metadata, discoveryUrl: pathAppendedUrl, errors };
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
  }
  try {
    const metadata = await fetchPrm(rootUrl, targetResourceUrlObj.origin);
    return { metadata, discoveryUrl: rootUrl, errors };
  } catch (e) {
    errors.push(e instanceof Error ? e : new Error(String(e)));
  }
  if (errors.length === 1) {
    throw errors[0];
  } else {
    throw new AggregateError(errors, "Failed to fetch resource metadata from all attempted URLs");
  }
}
async function tryParseAuthServerMetadata(response) {
  if (response.status !== 200) {
    return void 0;
  }
  try {
    const body = await response.json();
    if (isAuthorizationServerMetadata(body)) {
      return body;
    }
  } catch {
  }
  return void 0;
}
async function getErrText(res) {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}
async function fetchAuthorizationServerMetadata(authorizationServer, options = {}) {
  const {
    additionalHeaders = {},
    fetch: fetchImpl = fetch
  } = options;
  const authorizationServerUrl = new URL(authorizationServer);
  const extraPath = authorizationServerUrl.pathname === "/" ? "" : authorizationServerUrl.pathname;
  const errors = [];
  const doFetch = async (url) => {
    try {
      const rawResponse = await fetchImpl(url, {
        method: "GET",
        headers: {
          ...additionalHeaders,
          "Accept": "application/json"
        }
      });
      const metadata2 = await tryParseAuthServerMetadata(rawResponse);
      if (metadata2) {
        return metadata2;
      }
      errors.push(new Error(`Failed to fetch authorization server metadata from ${url}: ${rawResponse.status} ${await getErrText(rawResponse)}`));
      return void 0;
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
      return void 0;
    }
  };
  const pathToFetch = new URL(AUTH_SERVER_METADATA_DISCOVERY_PATH, authorizationServer).toString() + extraPath;
  let metadata = await doFetch(pathToFetch);
  if (metadata) {
    return { metadata, discoveryUrl: pathToFetch, errors };
  }
  const openidPathInsertionUrl = new URL(OPENID_CONNECT_DISCOVERY_PATH, authorizationServer).toString() + extraPath;
  metadata = await doFetch(openidPathInsertionUrl);
  if (metadata) {
    return { metadata, discoveryUrl: openidPathInsertionUrl, errors };
  }
  const openidPathAdditionUrl = authorizationServer.endsWith("/") ? authorizationServer + OPENID_CONNECT_DISCOVERY_PATH.substring(1) : authorizationServer + OPENID_CONNECT_DISCOVERY_PATH;
  metadata = await doFetch(openidPathAdditionUrl);
  if (metadata) {
    return { metadata, discoveryUrl: openidPathAdditionUrl, errors };
  }
  if (errors.length === 1) {
    throw errors[0];
  } else {
    throw new AggregateError(errors, "Failed to fetch authorization server metadata from all attempted URLs");
  }
}
export {
  AUTH_PROTECTED_RESOURCE_METADATA_DISCOVERY_PATH,
  AUTH_SCOPE_SEPARATOR,
  AUTH_SERVER_METADATA_DISCOVERY_PATH,
  AuthorizationDeviceCodeErrorType,
  AuthorizationErrorType,
  AuthorizationRegistrationErrorType,
  DEFAULT_AUTH_FLOW_PORT,
  GRANT_TYPE_JWT_BEARER,
  GRANT_TYPE_TOKEN_EXCHANGE,
  OPENID_CONNECT_DISCOVERY_PATH,
  TOKEN_TYPE_ACCESS_TOKEN,
  TOKEN_TYPE_ID_JAG,
  TOKEN_TYPE_ID_TOKEN,
  buildIdJagExchangeBody,
  buildResourceRedemptionBody,
  fetchAuthorizationServerMetadata,
  fetchDynamicRegistration,
  fetchResourceMetadata,
  getClaimsFromJWT,
  getDefaultMetadataForUrl,
  isAuthorizationAuthorizeResponse,
  isAuthorizationDeviceResponse,
  isAuthorizationDynamicClientRegistrationResponse,
  isAuthorizationErrorResponse,
  isAuthorizationProtectedResourceMetadata,
  isAuthorizationRegistrationErrorResponse,
  isAuthorizationServerMetadata,
  isAuthorizationTokenResponse,
  parseWWWAuthenticateHeader,
  scopesMatch
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXG9hdXRoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVjb2RlQmFzZTY0IH0gZnJvbSAnLi9idWZmZXIuanMnO1xuXG5jb25zdCBXRUxMX0tOT1dOX1JPVVRFID0gJy8ud2VsbC1rbm93bic7XG5leHBvcnQgY29uc3QgQVVUSF9QUk9URUNURURfUkVTT1VSQ0VfTUVUQURBVEFfRElTQ09WRVJZX1BBVEggPSBgJHtXRUxMX0tOT1dOX1JPVVRFfS9vYXV0aC1wcm90ZWN0ZWQtcmVzb3VyY2VgO1xuZXhwb3J0IGNvbnN0IEFVVEhfU0VSVkVSX01FVEFEQVRBX0RJU0NPVkVSWV9QQVRIID0gYCR7V0VMTF9LTk9XTl9ST1VURX0vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXJgO1xuZXhwb3J0IGNvbnN0IE9QRU5JRF9DT05ORUNUX0RJU0NPVkVSWV9QQVRIID0gYCR7V0VMTF9LTk9XTl9ST1VURX0vb3BlbmlkLWNvbmZpZ3VyYXRpb25gO1xuZXhwb3J0IGNvbnN0IEFVVEhfU0NPUEVfU0VQQVJBVE9SID0gJyAnO1xuXG4vKipcbiAqIFJGQyA4NjkzIGdyYW50IHR5cGUgZm9yIE9BdXRoIHRva2VuIGV4Y2hhbmdlLlxuICovXG5leHBvcnQgY29uc3QgR1JBTlRfVFlQRV9UT0tFTl9FWENIQU5HRSA9ICd1cm46aWV0ZjpwYXJhbXM6b2F1dGg6Z3JhbnQtdHlwZTp0b2tlbi1leGNoYW5nZSc7XG5cbi8qKlxuICogUkZDIDg2OTMgdG9rZW4gdHlwZSBmb3IgYW4gT0F1dGggMi4wIGFjY2VzcyB0b2tlbiB1c2VkIGFzIHRoZSBgc3ViamVjdF90b2tlbmBcbiAqIGR1cmluZyBhIHRva2VuIGV4Y2hhbmdlLlxuICovXG5leHBvcnQgY29uc3QgVE9LRU5fVFlQRV9BQ0NFU1NfVE9LRU4gPSAndXJuOmlldGY6cGFyYW1zOm9hdXRoOnRva2VuLXR5cGU6YWNjZXNzX3Rva2VuJztcblxuLyoqXG4gKiBUb2tlbiB0eXBlIGZvciBhbiBPcGVuSUQgQ29ubmVjdCBJRCBUb2tlbi4gVXNlZCBhcyB0aGUgYHN1YmplY3RfdG9rZW5fdHlwZWAgaW5cbiAqIHRoZSBJZFAtc2lkZSB0b2tlbiBleGNoYW5nZSB0aGF0IG1pbnRzIGFuIElELUpBRy5cbiAqL1xuZXhwb3J0IGNvbnN0IFRPS0VOX1RZUEVfSURfVE9LRU4gPSAndXJuOmlldGY6cGFyYW1zOm9hdXRoOnRva2VuLXR5cGU6aWRfdG9rZW4nO1xuXG4vKipcbiAqIFRva2VuIHR5cGUgZm9yIGFuIElkZW50aXR5IEFzc2VydGlvbiBBdXRob3JpemF0aW9uIEdyYW50IChJRC1KQUcpIHVzZWQgaW5cbiAqIENyb3NzIEFwcCBBY2Nlc3MgKFhBQSkgZmxvd3MuXG4gKi9cbmV4cG9ydCBjb25zdCBUT0tFTl9UWVBFX0lEX0pBRyA9ICd1cm46aWV0ZjpwYXJhbXM6b2F1dGg6dG9rZW4tdHlwZTppZC1qYWcnO1xuXG4vKipcbiAqIFJGQyA3NTIzIGdyYW50IHR5cGUgdXNlZCB0byBleGNoYW5nZSBhIEpXVCBhc3NlcnRpb24gKGUuZy4gYW4gSUQtSkFHKSBmb3IgYW5cbiAqIGFjY2VzcyB0b2tlbiBhdCB0aGUgcmVzb3VyY2UncyBhdXRob3JpemF0aW9uIHNlcnZlci5cbiAqL1xuZXhwb3J0IGNvbnN0IEdSQU5UX1RZUEVfSldUX0JFQVJFUiA9ICd1cm46aWV0ZjpwYXJhbXM6b2F1dGg6Z3JhbnQtdHlwZTpqd3QtYmVhcmVyJztcblxuLyoqXG4gKiBCdWlsZCB0aGUgcmVxdWVzdCBib2R5IGZvciB0aGUgSWRQLXNpZGUgdG9rZW4gZXhjaGFuZ2UgdGhhdCBtaW50cyBhbiBJRC1KQUdcbiAqIGZvciB0aGUgcmVxdWVzdGVkIGF1ZGllbmNlLiBTZWUgZHJhZnQtaWV0Zi1vYXV0aC1pZGVudGl0eS1hc3NlcnRpb24tYXV0aHotZ3JhbnQuXG4gKlxuICogQHBhcmFtIGNsaWVudElkIHRoZSByZXF1ZXN0aW5nIGFwcCdzIGNsaWVudF9pZCBhdCB0aGUgSWRQLlxuICogQHBhcmFtIGNsaWVudFNlY3JldCB0aGUgcmVxdWVzdGluZyBhcHAncyBjbGllbnRfc2VjcmV0IGF0IHRoZSBJZFAsIGlmIGFwcGxpY2FibGUuXG4gKiAgIE9taXQgKG9yIHBhc3MgYHVuZGVmaW5lZGApIGZvciBwdWJsaWMgY2xpZW50cyAoYHRva2VuX2VuZHBvaW50X2F1dGhfbWV0aG9kPW5vbmVgKS5cbiAqIEBwYXJhbSBpZFRva2VuIHRoZSBPcGVuSUQgQ29ubmVjdCBgaWRfdG9rZW5gIHByZXZpb3VzbHkgaXNzdWVkIGJ5IHRoZSBJZFAgdG9cbiAqICAgdGhlIHJlcXVlc3RpbmcgYXBwLiBQZXIgdGhlIHNwZWMgdGhlIHN1YmplY3QgdG9rZW4gTVVTVCBiZSBhbiBJRCBUb2tlblxuICogICAobm90IGFuIGFjY2VzcyB0b2tlbikuXG4gKiBAcGFyYW0gYXVkaWVuY2UgdGhlICphdXRob3JpemF0aW9uIHNlcnZlciogVVJMIG9mIHRoZSByZXNvdXJjZSAodGhlIGlzc3VlclxuICogICB0aGF0IHdpbGwgcmVkZWVtIHRoZSBJRC1KQUcpLiBSZXF1aXJlZC5cbiAqIEBwYXJhbSByZXNvdXJjZSB0aGUgcmVzb3VyY2UgaW5kaWNhdG9yIChSRkMgODcwNykgXHUyMDE0IHRoZSBVUkwgb2YgdGhlIGFjdHVhbFxuICogICBwcm90ZWN0ZWQgcmVzb3VyY2UgKGUuZy4gdGhlIE1DUCBzZXJ2ZXIgVVJMKS4gT3B0aW9uYWwgYnV0IHR5cGljYWxseSByZXF1aXJlZFxuICogICBpbiBwcmFjdGljZS5cbiAqIEBwYXJhbSBzY29wZXMgc2NvcGVzIHRoZSByZXF1ZXN0aW5nIGFwcCB3YW50cyBncmFudGVkIGF0IHRoZSByZXNvdXJjZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkSWRKYWdFeGNoYW5nZUJvZHkoY2xpZW50SWQ6IHN0cmluZywgY2xpZW50U2VjcmV0OiBzdHJpbmcgfCB1bmRlZmluZWQsIGlkVG9rZW46IHN0cmluZywgYXVkaWVuY2U6IHN0cmluZywgcmVzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSk6IFVSTFNlYXJjaFBhcmFtcyB7XG5cdGNvbnN0IGJvZHkgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdGJvZHkuYXBwZW5kKCdjbGllbnRfaWQnLCBjbGllbnRJZCk7XG5cdGlmIChjbGllbnRTZWNyZXQpIHtcblx0XHRib2R5LmFwcGVuZCgnY2xpZW50X3NlY3JldCcsIGNsaWVudFNlY3JldCk7XG5cdH1cblx0Ym9keS5hcHBlbmQoJ2dyYW50X3R5cGUnLCBHUkFOVF9UWVBFX1RPS0VOX0VYQ0hBTkdFKTtcblx0Ym9keS5hcHBlbmQoJ3N1YmplY3RfdG9rZW4nLCBpZFRva2VuKTtcblx0Ym9keS5hcHBlbmQoJ3N1YmplY3RfdG9rZW5fdHlwZScsIFRPS0VOX1RZUEVfSURfVE9LRU4pO1xuXHRib2R5LmFwcGVuZCgncmVxdWVzdGVkX3Rva2VuX3R5cGUnLCBUT0tFTl9UWVBFX0lEX0pBRyk7XG5cdGJvZHkuYXBwZW5kKCdhdWRpZW5jZScsIGF1ZGllbmNlKTtcblx0aWYgKHJlc291cmNlKSB7XG5cdFx0Ym9keS5hcHBlbmQoJ3Jlc291cmNlJywgcmVzb3VyY2UpO1xuXHR9XG5cdGlmIChzY29wZXMubGVuZ3RoKSB7XG5cdFx0Ym9keS5hcHBlbmQoJ3Njb3BlJywgc2NvcGVzLmpvaW4oQVVUSF9TQ09QRV9TRVBBUkFUT1IpKTtcblx0fVxuXHRyZXR1cm4gYm9keTtcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgcmVxdWVzdCBib2R5IHNlbnQgdG8gYSByZXNvdXJjZSBzZXJ2ZXIncyBhdXRob3JpemF0aW9uIHNlcnZlciB0b1xuICogcmVkZWVtIGFuIElELUpBRyBmb3IgYSByZXNvdXJjZS1zY29wZWQgYWNjZXNzIHRva2VuIChSRkMgNzUyMyBKV1QtYmVhcmVyIGdyYW50KS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUmVzb3VyY2VSZWRlbXB0aW9uQm9keShjbGllbnRJZDogc3RyaW5nLCBjbGllbnRTZWNyZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgaWRKYWc6IHN0cmluZywgcmVzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSk6IFVSTFNlYXJjaFBhcmFtcyB7XG5cdGNvbnN0IGJvZHkgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdGJvZHkuYXBwZW5kKCdjbGllbnRfaWQnLCBjbGllbnRJZCk7XG5cdGlmIChjbGllbnRTZWNyZXQpIHtcblx0XHRib2R5LmFwcGVuZCgnY2xpZW50X3NlY3JldCcsIGNsaWVudFNlY3JldCk7XG5cdH1cblx0Ym9keS5hcHBlbmQoJ2dyYW50X3R5cGUnLCBHUkFOVF9UWVBFX0pXVF9CRUFSRVIpO1xuXHRib2R5LmFwcGVuZCgnYXNzZXJ0aW9uJywgaWRKYWcpO1xuXHRpZiAocmVzb3VyY2UpIHtcblx0XHRib2R5LmFwcGVuZCgncmVzb3VyY2UnLCByZXNvdXJjZSk7XG5cdH1cblx0aWYgKHNjb3Blcy5sZW5ndGgpIHtcblx0XHRib2R5LmFwcGVuZCgnc2NvcGUnLCBzY29wZXMuam9pbihBVVRIX1NDT1BFX1NFUEFSQVRPUikpO1xuXHR9XG5cdHJldHVybiBib2R5O1xufVxuXG4vLyNyZWdpb24gdHlwZXNcblxuLyoqXG4gKiBCYXNlIE9BdXRoIDIuMCBlcnJvciBjb2RlcyBhcyBzcGVjaWZpZWQgaW4gUkZDIDY3NDkuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIEF1dGhvcml6YXRpb25FcnJvclR5cGUge1xuXHRJbnZhbGlkUmVxdWVzdCA9ICdpbnZhbGlkX3JlcXVlc3QnLFxuXHRJbnZhbGlkQ2xpZW50ID0gJ2ludmFsaWRfY2xpZW50Jyxcblx0SW52YWxpZEdyYW50ID0gJ2ludmFsaWRfZ3JhbnQnLFxuXHRVbmF1dGhvcml6ZWRDbGllbnQgPSAndW5hdXRob3JpemVkX2NsaWVudCcsXG5cdFVuc3VwcG9ydGVkR3JhbnRUeXBlID0gJ3Vuc3VwcG9ydGVkX2dyYW50X3R5cGUnLFxuXHRJbnZhbGlkU2NvcGUgPSAnaW52YWxpZF9zY29wZSdcbn1cblxuLyoqXG4gKiBEZXZpY2UgYXV0aG9yaXphdGlvbiBncmFudCBzcGVjaWZpYyBlcnJvciBjb2RlcyBhcyBzcGVjaWZpZWQgaW4gUkZDIDg2Mjggc2VjdGlvbiAzLjUuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIEF1dGhvcml6YXRpb25EZXZpY2VDb2RlRXJyb3JUeXBlIHtcblx0LyoqXG5cdCAqIFRoZSBhdXRob3JpemF0aW9uIHJlcXVlc3QgaXMgc3RpbGwgcGVuZGluZyBhcyB0aGUgZW5kIHVzZXIgaGFzbid0IGNvbXBsZXRlZCB0aGUgdXNlciBpbnRlcmFjdGlvbiBzdGVwcy5cblx0ICovXG5cdEF1dGhvcml6YXRpb25QZW5kaW5nID0gJ2F1dGhvcml6YXRpb25fcGVuZGluZycsXG5cdC8qKlxuXHQgKiBBIHZhcmlhbnQgb2YgXCJhdXRob3JpemF0aW9uX3BlbmRpbmdcIiwgcG9sbGluZyBzaG91bGQgY29udGludWUgYnV0IGludGVydmFsIG11c3QgYmUgaW5jcmVhc2VkIGJ5IDUgc2Vjb25kcy5cblx0ICovXG5cdFNsb3dEb3duID0gJ3Nsb3dfZG93bicsXG5cdC8qKlxuXHQgKiBUaGUgYXV0aG9yaXphdGlvbiByZXF1ZXN0IHdhcyBkZW5pZWQuXG5cdCAqL1xuXHRBY2Nlc3NEZW5pZWQgPSAnYWNjZXNzX2RlbmllZCcsXG5cdC8qKlxuXHQgKiBUaGUgXCJkZXZpY2VfY29kZVwiIGhhcyBleHBpcmVkIGFuZCB0aGUgZGV2aWNlIGF1dGhvcml6YXRpb24gc2Vzc2lvbiBoYXMgY29uY2x1ZGVkLlxuXHQgKi9cblx0RXhwaXJlZFRva2VuID0gJ2V4cGlyZWRfdG9rZW4nXG59XG5cbi8qKlxuICogRHluYW1pYyBjbGllbnQgcmVnaXN0cmF0aW9uIHNwZWNpZmljIGVycm9yIGNvZGVzIGFzIHNwZWNpZmllZCBpbiBSRkMgNzU5MS5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gQXV0aG9yaXphdGlvblJlZ2lzdHJhdGlvbkVycm9yVHlwZSB7XG5cdC8qKlxuXHQgKiBUaGUgdmFsdWUgb2Ygb25lIG9yIG1vcmUgcmVkaXJlY3Rpb24gVVJJcyBpcyBpbnZhbGlkLlxuXHQgKi9cblx0SW52YWxpZFJlZGlyZWN0VXJpID0gJ2ludmFsaWRfcmVkaXJlY3RfdXJpJyxcblx0LyoqXG5cdCAqIFRoZSB2YWx1ZSBvZiBvbmUgb2YgdGhlIGNsaWVudCBtZXRhZGF0YSBmaWVsZHMgaXMgaW52YWxpZCBhbmQgdGhlIHNlcnZlciBoYXMgcmVqZWN0ZWQgdGhpcyByZXF1ZXN0LlxuXHQgKi9cblx0SW52YWxpZENsaWVudE1ldGFkYXRhID0gJ2ludmFsaWRfY2xpZW50X21ldGFkYXRhJyxcblx0LyoqXG5cdCAqIFRoZSBzb2Z0d2FyZSBzdGF0ZW1lbnQgcHJlc2VudGVkIGlzIGludmFsaWQuXG5cdCAqL1xuXHRJbnZhbGlkU29mdHdhcmVTdGF0ZW1lbnQgPSAnaW52YWxpZF9zb2Z0d2FyZV9zdGF0ZW1lbnQnLFxuXHQvKipcblx0ICogVGhlIHNvZnR3YXJlIHN0YXRlbWVudCBwcmVzZW50ZWQgaXMgbm90IGFwcHJvdmVkIGZvciB1c2UgYnkgdGhpcyBhdXRob3JpemF0aW9uIHNlcnZlci5cblx0ICovXG5cdFVuYXBwcm92ZWRTb2Z0d2FyZVN0YXRlbWVudCA9ICd1bmFwcHJvdmVkX3NvZnR3YXJlX3N0YXRlbWVudCdcbn1cblxuLyoqXG4gKiBNZXRhZGF0YSBhYm91dCBhIHByb3RlY3RlZCByZXNvdXJjZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQXV0aG9yaXphdGlvblByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEge1xuXHQvKipcblx0ICogUkVRVUlSRUQuIFRoZSBwcm90ZWN0ZWQgcmVzb3VyY2UncyByZXNvdXJjZSBpZGVudGlmaWVyIFVSTCB0aGF0IHVzZXMgaHR0cHMgc2NoZW1lIGFuZCBoYXMgbm8gZnJhZ21lbnQgY29tcG9uZW50cy5cblx0ICovXG5cdHJlc291cmNlOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBIdW1hbi1yZWFkYWJsZSBuYW1lIG9mIHRoZSBwcm90ZWN0ZWQgcmVzb3VyY2UgaW50ZW5kZWQgZm9yIGRpc3BsYXkgdG8gdGhlIGVuZCB1c2VyLlxuXHQgKi9cblx0cmVzb3VyY2VfbmFtZT86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEpTT04gYXJyYXkgY29udGFpbmluZyBhIGxpc3Qgb2YgT0F1dGggYXV0aG9yaXphdGlvbiBzZXJ2ZXIgaWRlbnRpZmllcnMuXG5cdCAqL1xuXHRhdXRob3JpemF0aW9uX3NlcnZlcnM/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFVSTCBvZiB0aGUgcHJvdGVjdGVkIHJlc291cmNlJ3MgSldLIFNldCBkb2N1bWVudC5cblx0ICovXG5cdGp3a3NfdXJpPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBSRUNPTU1FTkRFRC4gSlNPTiBhcnJheSBjb250YWluaW5nIGEgbGlzdCBvZiB0aGUgT0F1dGggMi4wIHNjb3BlIHZhbHVlcyB1c2VkIGluIGF1dGhvcml6YXRpb24gcmVxdWVzdHMuXG5cdCAqL1xuXHRzY29wZXNfc3VwcG9ydGVkPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBKU09OIGFycmF5IGNvbnRhaW5pbmcgYSBsaXN0IG9mIHRoZSBPQXV0aCAyLjAgQmVhcmVyIFRva2VuIHByZXNlbnRhdGlvbiBtZXRob2RzIHN1cHBvcnRlZC5cblx0ICovXG5cdGJlYXJlcl9tZXRob2RzX3N1cHBvcnRlZD86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gSlNPTiBhcnJheSBjb250YWluaW5nIGEgbGlzdCBvZiB0aGUgSldTIHNpZ25pbmcgYWxnb3JpdGhtcyBzdXBwb3J0ZWQuXG5cdCAqL1xuXHRyZXNvdXJjZV9zaWduaW5nX2FsZ192YWx1ZXNfc3VwcG9ydGVkPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBKU09OIGFycmF5IGNvbnRhaW5pbmcgYSBsaXN0IG9mIHRoZSBKV0UgZW5jcnlwdGlvbiBhbGdvcml0aG1zIHN1cHBvcnRlZC5cblx0ICovXG5cdHJlc291cmNlX2VuY3J5cHRpb25fYWxnX3ZhbHVlc19zdXBwb3J0ZWQ/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEpTT04gYXJyYXkgY29udGFpbmluZyBhIGxpc3Qgb2YgdGhlIEpXRSBlbmNyeXB0aW9uIGFsZ29yaXRobXMgc3VwcG9ydGVkLlxuXHQgKi9cblx0cmVzb3VyY2VfZW5jcnlwdGlvbl9lbmNfdmFsdWVzX3N1cHBvcnRlZD86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJMIG9mIGEgcGFnZSBjb250YWluaW5nIGh1bWFuLXJlYWRhYmxlIGRvY3VtZW50YXRpb24uXG5cdCAqL1xuXHRyZXNvdXJjZV9kb2N1bWVudGF0aW9uPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJMIHRoYXQgcHJvdmlkZXMgdGhlIHJlc291cmNlJ3MgcmVxdWlyZW1lbnRzIG9uIGhvdyBjbGllbnRzIGNhbiB1c2UgdGhlIGRhdGEuXG5cdCAqL1xuXHRyZXNvdXJjZV9wb2xpY3lfdXJpPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJMIHRoYXQgcHJvdmlkZXMgdGhlIHJlc291cmNlJ3MgdGVybXMgb2Ygc2VydmljZS5cblx0ICovXG5cdHJlc291cmNlX3Rvc191cmk/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogTWV0YWRhdGEgYWJvdXQgYW4gT0F1dGggMi4wIEF1dGhvcml6YXRpb24gU2VydmVyLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEge1xuXHQvKipcblx0ICogUkVRVUlSRUQuIFRoZSBhdXRob3JpemF0aW9uIHNlcnZlcidzIGlzc3VlciBpZGVudGlmaWVyIFVSTCB0aGF0IHVzZXMgaHR0cHMgc2NoZW1lIGFuZCBoYXMgbm8gcXVlcnkgb3IgZnJhZ21lbnQgY29tcG9uZW50cy5cblx0ICovXG5cdGlzc3Vlcjogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBVUkwgb2YgdGhlIGF1dGhvcml6YXRpb24gc2VydmVyJ3MgYXV0aG9yaXphdGlvbiBlbmRwb2ludC5cblx0ICogVGhpcyBpcyBSRVFVSVJFRCB1bmxlc3Mgbm8gZ3JhbnQgdHlwZXMgYXJlIHN1cHBvcnRlZCB0aGF0IHVzZSB0aGUgYXV0aG9yaXphdGlvbiBlbmRwb2ludC5cblx0ICovXG5cdGF1dGhvcml6YXRpb25fZW5kcG9pbnQ/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFVSTCBvZiB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIncyB0b2tlbiBlbmRwb2ludC5cblx0ICogVGhpcyBpcyBSRVFVSVJFRCB1bmxlc3Mgb25seSB0aGUgaW1wbGljaXQgZ3JhbnQgdHlwZSBpcyBzdXBwb3J0ZWQuXG5cdCAqL1xuXHR0b2tlbl9lbmRwb2ludD86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFVSTCBvZiB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIncyBkZXZpY2UgY29kZSBlbmRwb2ludC5cblx0ICovXG5cdGRldmljZV9hdXRob3JpemF0aW9uX2VuZHBvaW50Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJMIG9mIHRoZSBhdXRob3JpemF0aW9uIHNlcnZlcidzIEpXSyBTZXQgZG9jdW1lbnQgY29udGFpbmluZyBzaWduaW5nIGtleXMuXG5cdCAqL1xuXHRqd2tzX3VyaT86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFVSTCBvZiB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIncyBPQXV0aCAyLjAgRHluYW1pYyBDbGllbnQgUmVnaXN0cmF0aW9uIGVuZHBvaW50LlxuXHQgKi9cblx0cmVnaXN0cmF0aW9uX2VuZHBvaW50Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBSRUNPTU1FTkRFRC4gSlNPTiBhcnJheSBjb250YWluaW5nIGEgbGlzdCBvZiB0aGUgT0F1dGggMi4wIHNjb3BlIHZhbHVlcyBzdXBwb3J0ZWQuXG5cdCAqL1xuXHRzY29wZXNfc3VwcG9ydGVkPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIFJFUVVJUkVELiBKU09OIGFycmF5IGNvbnRhaW5pbmcgYSBsaXN0IG9mIHRoZSBPQXV0aCAyLjAgcmVzcG9uc2VfdHlwZSB2YWx1ZXMgc3VwcG9ydGVkLlxuXHQgKi9cblx0cmVzcG9uc2VfdHlwZXNfc3VwcG9ydGVkOiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEpTT04gYXJyYXkgY29udGFpbmluZyBhIGxpc3Qgb2YgdGhlIE9BdXRoIDIuMCByZXNwb25zZV9tb2RlIHZhbHVlcyBzdXBwb3J0ZWQuXG5cdCAqIERlZmF1bHQgaXMgW1wicXVlcnlcIiwgXCJmcmFnbWVudFwiXS5cblx0ICovXG5cdHJlc3BvbnNlX21vZGVzX3N1cHBvcnRlZD86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gSlNPTiBhcnJheSBjb250YWluaW5nIGEgbGlzdCBvZiBPQXV0aCAyLjAgZ3JhbnQgdHlwZSB2YWx1ZXMgc3VwcG9ydGVkLlxuXHQgKiBEZWZhdWx0IGlzIFtcImF1dGhvcml6YXRpb25fY29kZVwiLCBcImltcGxpY2l0XCJdLlxuXHQgKi9cblx0Z3JhbnRfdHlwZXNfc3VwcG9ydGVkPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBKU09OIGFycmF5IGNvbnRhaW5pbmcgYSBsaXN0IG9mIGNsaWVudCBhdXRoZW50aWNhdGlvbiBtZXRob2RzIHN1cHBvcnRlZCBieSB0aGUgdG9rZW4gZW5kcG9pbnQuXG5cdCAqIERlZmF1bHQgaXMgXCJjbGllbnRfc2VjcmV0X2Jhc2ljXCIuXG5cdCAqL1xuXHR0b2tlbl9lbmRwb2ludF9hdXRoX21ldGhvZHNfc3VwcG9ydGVkPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBKU09OIGFycmF5IGNvbnRhaW5pbmcgYSBsaXN0IG9mIEpXUyBzaWduaW5nIGFsZ29yaXRobXMgc3VwcG9ydGVkIGJ5IHRoZSB0b2tlbiBlbmRwb2ludC5cblx0ICovXG5cdHRva2VuX2VuZHBvaW50X2F1dGhfc2lnbmluZ19hbGdfdmFsdWVzX3N1cHBvcnRlZD86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJMIG9mIGEgcGFnZSBjb250YWluaW5nIGh1bWFuLXJlYWRhYmxlIGRvY3VtZW50YXRpb24gZm9yIGRldmVsb3BlcnMuXG5cdCAqL1xuXHRzZXJ2aWNlX2RvY3VtZW50YXRpb24/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBMYW5ndWFnZXMgYW5kIHNjcmlwdHMgc3VwcG9ydGVkIGZvciB0aGUgdXNlciBpbnRlcmZhY2UsIGFzIGEgSlNPTiBhcnJheSBvZiBCQ1AgNDcgbGFuZ3VhZ2UgdGFncy5cblx0ICovXG5cdHVpX2xvY2FsZXNfc3VwcG9ydGVkPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBVUkwgdGhhdCB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgcHJvdmlkZXMgdG8gcmVhZCBhYm91dCB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIncyByZXF1aXJlbWVudHMuXG5cdCAqL1xuXHRvcF9wb2xpY3lfdXJpPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJMIHRoYXQgdGhlIGF1dGhvcml6YXRpb24gc2VydmVyIHByb3ZpZGVzIHRvIHJlYWQgYWJvdXQgdGhlIGF1dGhvcml6YXRpb24gc2VydmVyJ3MgdGVybXMgb2Ygc2VydmljZS5cblx0ICovXG5cdG9wX3Rvc191cmk/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBVUkwgb2YgdGhlIGF1dGhvcml6YXRpb24gc2VydmVyJ3MgT0F1dGggMi4wIHJldm9jYXRpb24gZW5kcG9pbnQuXG5cdCAqL1xuXHRyZXZvY2F0aW9uX2VuZHBvaW50Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gSlNPTiBhcnJheSBjb250YWluaW5nIGEgbGlzdCBvZiBjbGllbnQgYXV0aGVudGljYXRpb24gbWV0aG9kcyBzdXBwb3J0ZWQgYnkgdGhlIHJldm9jYXRpb24gZW5kcG9pbnQuXG5cdCAqL1xuXHRyZXZvY2F0aW9uX2VuZHBvaW50X2F1dGhfbWV0aG9kc19zdXBwb3J0ZWQ/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEpTT04gYXJyYXkgY29udGFpbmluZyBhIGxpc3Qgb2YgSldTIHNpZ25pbmcgYWxnb3JpdGhtcyBzdXBwb3J0ZWQgYnkgdGhlIHJldm9jYXRpb24gZW5kcG9pbnQuXG5cdCAqL1xuXHRyZXZvY2F0aW9uX2VuZHBvaW50X2F1dGhfc2lnbmluZ19hbGdfdmFsdWVzX3N1cHBvcnRlZD86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJMIG9mIHRoZSBhdXRob3JpemF0aW9uIHNlcnZlcidzIE9BdXRoIDIuMCBpbnRyb3NwZWN0aW9uIGVuZHBvaW50LlxuXHQgKi9cblx0aW50cm9zcGVjdGlvbl9lbmRwb2ludD86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEpTT04gYXJyYXkgY29udGFpbmluZyBhIGxpc3Qgb2YgY2xpZW50IGF1dGhlbnRpY2F0aW9uIG1ldGhvZHMgc3VwcG9ydGVkIGJ5IHRoZSBpbnRyb3NwZWN0aW9uIGVuZHBvaW50LlxuXHQgKi9cblx0aW50cm9zcGVjdGlvbl9lbmRwb2ludF9hdXRoX21ldGhvZHNfc3VwcG9ydGVkPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBKU09OIGFycmF5IGNvbnRhaW5pbmcgYSBsaXN0IG9mIEpXUyBzaWduaW5nIGFsZ29yaXRobXMgc3VwcG9ydGVkIGJ5IHRoZSBpbnRyb3NwZWN0aW9uIGVuZHBvaW50LlxuXHQgKi9cblx0aW50cm9zcGVjdGlvbl9lbmRwb2ludF9hdXRoX3NpZ25pbmdfYWxnX3ZhbHVlc19zdXBwb3J0ZWQ/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEpTT04gYXJyYXkgY29udGFpbmluZyBhIGxpc3Qgb2YgUEtDRSBjb2RlIGNoYWxsZW5nZSBtZXRob2RzIHN1cHBvcnRlZC5cblx0ICovXG5cdGNvZGVfY2hhbGxlbmdlX21ldGhvZHNfc3VwcG9ydGVkPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBCb29sZWFuIGZsYWcgaW5kaWNhdGluZyB3aGV0aGVyIHRoZSBhdXRob3JpemF0aW9uIHNlcnZlciBzdXBwb3J0cyB0aGVcblx0ICogY2xpZW50X2lkX21ldGFkYXRhIGRvY3VtZW50LlxuXHQgKiByZWYgaHR0cHM6Ly9kYXRhdHJhY2tlci5pZXRmLm9yZy9kb2MvaHRtbC9kcmFmdC1wYXJlY2tpLW9hdXRoLWNsaWVudC1pZC1tZXRhZGF0YS1kb2N1bWVudC0wM1xuXHQgKi9cblx0Y2xpZW50X2lkX21ldGFkYXRhX2RvY3VtZW50X3N1cHBvcnRlZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogUmVxdWVzdCBmb3IgdGhlIGR5bmFtaWMgY2xpZW50IHJlZ2lzdHJhdGlvbiBlbmRwb2ludC5cbiAqIEBzZWUgaHR0cHM6Ly9kYXRhdHJhY2tlci5pZXRmLm9yZy9kb2MvaHRtbC9yZmM3NTkxI3NlY3Rpb24tMlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlcXVlc3Qge1xuXHQvKipcblx0ICogT1BUSU9OQUwuIEFycmF5IG9mIHJlZGlyZWN0aW9uIFVSSSBzdHJpbmdzIGZvciB1c2UgaW4gcmVkaXJlY3QtYmFzZWQgZmxvd3Ncblx0ICogc3VjaCBhcyB0aGUgYXV0aG9yaXphdGlvbiBjb2RlIGFuZCBpbXBsaWNpdCBmbG93cy5cblx0ICovXG5cdHJlZGlyZWN0X3VyaXM/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFN0cmluZyBpbmRpY2F0b3Igb2YgdGhlIHJlcXVlc3RlZCBhdXRoZW50aWNhdGlvbiBtZXRob2QgZm9yIHRoZSB0b2tlbiBlbmRwb2ludC5cblx0ICogVmFsdWVzOiBcIm5vbmVcIiwgXCJjbGllbnRfc2VjcmV0X3Bvc3RcIiwgXCJjbGllbnRfc2VjcmV0X2Jhc2ljXCIuXG5cdCAqIERlZmF1bHQgaXMgXCJjbGllbnRfc2VjcmV0X2Jhc2ljXCIuXG5cdCAqL1xuXHR0b2tlbl9lbmRwb2ludF9hdXRoX21ldGhvZD86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEFycmF5IG9mIE9BdXRoIDIuMCBncmFudCB0eXBlIHN0cmluZ3MgdGhhdCB0aGUgY2xpZW50IGNhbiB1c2UgYXQgdGhlIHRva2VuIGVuZHBvaW50LlxuXHQgKiBEZWZhdWx0IGlzIFtcImF1dGhvcml6YXRpb25fY29kZVwiXS5cblx0ICovXG5cdGdyYW50X3R5cGVzPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBBcnJheSBvZiB0aGUgT0F1dGggMi4wIHJlc3BvbnNlIHR5cGUgc3RyaW5ncyB0aGF0IHRoZSBjbGllbnQgY2FuIHVzZSBhdCB0aGUgYXV0aG9yaXphdGlvbiBlbmRwb2ludC5cblx0ICogRGVmYXVsdCBpcyBbXCJjb2RlXCJdLlxuXHQgKi9cblx0cmVzcG9uc2VfdHlwZXM/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEh1bWFuLXJlYWRhYmxlIHN0cmluZyBuYW1lIG9mIHRoZSBjbGllbnQgdG8gYmUgcHJlc2VudGVkIHRvIHRoZSBlbmQtdXNlciBkdXJpbmcgYXV0aG9yaXphdGlvbi5cblx0ICovXG5cdGNsaWVudF9uYW1lPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJMIHN0cmluZyBvZiBhIHdlYiBwYWdlIHByb3ZpZGluZyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgY2xpZW50LlxuXHQgKi9cblx0Y2xpZW50X3VyaT86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFVSTCBzdHJpbmcgdGhhdCByZWZlcmVuY2VzIGEgbG9nbyBmb3IgdGhlIGNsaWVudC5cblx0ICovXG5cdGxvZ29fdXJpPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gU3RyaW5nIGNvbnRhaW5pbmcgYSBzcGFjZS1zZXBhcmF0ZWQgbGlzdCBvZiBzY29wZSB2YWx1ZXMgdGhhdCB0aGUgY2xpZW50IGNhbiB1c2Ugd2hlbiByZXF1ZXN0aW5nIGFjY2VzcyB0b2tlbnMuXG5cdCAqL1xuXHRzY29wZT86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEFycmF5IG9mIHN0cmluZ3MgcmVwcmVzZW50aW5nIHdheXMgdG8gY29udGFjdCBwZW9wbGUgcmVzcG9uc2libGUgZm9yIHRoaXMgY2xpZW50LCB0eXBpY2FsbHkgZW1haWwgYWRkcmVzc2VzLlxuXHQgKi9cblx0Y29udGFjdHM/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFVSTCBzdHJpbmcgdGhhdCBwb2ludHMgdG8gYSBodW1hbi1yZWFkYWJsZSB0ZXJtcyBvZiBzZXJ2aWNlIGRvY3VtZW50IGZvciB0aGUgY2xpZW50LlxuXHQgKi9cblx0dG9zX3VyaT86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFVSTCBzdHJpbmcgdGhhdCBwb2ludHMgdG8gYSBodW1hbi1yZWFkYWJsZSBwcml2YWN5IHBvbGljeSBkb2N1bWVudC5cblx0ICovXG5cdHBvbGljeV91cmk/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBVUkwgc3RyaW5nIHJlZmVyZW5jaW5nIHRoZSBjbGllbnQncyBKU09OIFdlYiBLZXkgKEpXSykgU2V0IGRvY3VtZW50LlxuXHQgKi9cblx0andrc191cmk/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBDbGllbnQncyBKU09OIFdlYiBLZXkgU2V0IGRvY3VtZW50IHZhbHVlLlxuXHQgKi9cblx0andrcz86IG9iamVjdDtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEEgdW5pcXVlIGlkZW50aWZpZXIgc3RyaW5nIGFzc2lnbmVkIGJ5IHRoZSBjbGllbnQgZGV2ZWxvcGVyIG9yIHNvZnR3YXJlIHB1Ymxpc2hlci5cblx0ICovXG5cdHNvZnR3YXJlX2lkPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gQSB2ZXJzaW9uIGlkZW50aWZpZXIgc3RyaW5nIGZvciB0aGUgY2xpZW50IHNvZnR3YXJlLlxuXHQgKi9cblx0c29mdHdhcmVfdmVyc2lvbj86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEEgc29mdHdhcmUgc3RhdGVtZW50IGNvbnRhaW5pbmcgY2xpZW50IG1ldGFkYXRhIHZhbHVlcyBhYm91dCB0aGUgY2xpZW50IHNvZnR3YXJlIGFzIGNsYWltcy5cblx0ICovXG5cdHNvZnR3YXJlX3N0YXRlbWVudD86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEFwcGxpY2F0aW9uIHR5cGUuIFVzdWFsbHkgXCJuYXRpdmVcIiBmb3IgT0F1dGggY2xpZW50cy5cblx0ICogaHR0cHM6Ly9vcGVuaWQubmV0L3NwZWNzL29wZW5pZC1jb25uZWN0LXJlZ2lzdHJhdGlvbi0xXzAuaHRtbFxuXHQgKi9cblx0YXBwbGljYXRpb25fdHlwZT86ICduYXRpdmUnIHwgJ3dlYicgfCBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBBZGRpdGlvbmFsIG1ldGFkYXRhIGZpZWxkcyBhcyBkZWZpbmVkIGJ5IGV4dGVuc2lvbnMuXG5cdCAqL1xuXHRba2V5OiBzdHJpbmddOiB1bmtub3duO1xufVxuXG4vKipcbiAqIFJlc3BvbnNlIGZyb20gdGhlIGR5bmFtaWMgY2xpZW50IHJlZ2lzdHJhdGlvbiBlbmRwb2ludC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQXV0aG9yaXphdGlvbkR5bmFtaWNDbGllbnRSZWdpc3RyYXRpb25SZXNwb25zZSB7XG5cdC8qKlxuXHQgKiBSRVFVSVJFRC4gVGhlIGNsaWVudCBpZGVudGlmaWVyIGlzc3VlZCBieSB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIuXG5cdCAqL1xuXHRjbGllbnRfaWQ6IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFRoZSBjbGllbnQgc2VjcmV0IGlzc3VlZCBieSB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIuXG5cdCAqIE5vdCByZXR1cm5lZCBmb3IgcHVibGljIGNsaWVudHMuXG5cdCAqL1xuXHRjbGllbnRfc2VjcmV0Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVGltZSBhdCB3aGljaCB0aGUgY2xpZW50IHNlY3JldCB3aWxsIGV4cGlyZSBpbiBzZWNvbmRzIHNpbmNlIHRoZSBVbml4IEVwb2NoLlxuXHQgKi9cblx0Y2xpZW50X3NlY3JldF9leHBpcmVzX2F0PzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gQ2xpZW50IG5hbWUgYXMgcHJvdmlkZWQgZHVyaW5nIHJlZ2lzdHJhdGlvbi5cblx0ICovXG5cdGNsaWVudF9uYW1lPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gQ2xpZW50IFVSSSBhcyBwcm92aWRlZCBkdXJpbmcgcmVnaXN0cmF0aW9uLlxuXHQgKi9cblx0Y2xpZW50X3VyaT86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEFycmF5IG9mIHJlZGlyZWN0aW9uIFVSSXMgYXMgcHJvdmlkZWQgZHVyaW5nIHJlZ2lzdHJhdGlvbi5cblx0ICovXG5cdHJlZGlyZWN0X3VyaXM/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEFycmF5IG9mIGdyYW50IHR5cGVzIGFsbG93ZWQgZm9yIHRoZSBjbGllbnQuXG5cdCAqL1xuXHRncmFudF90eXBlcz86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gQXJyYXkgb2YgcmVzcG9uc2UgdHlwZXMgYWxsb3dlZCBmb3IgdGhlIGNsaWVudC5cblx0ICovXG5cdHJlc3BvbnNlX3R5cGVzPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBUeXBlIG9mIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCB1c2VkIGJ5IHRoZSBjbGllbnQuXG5cdCAqL1xuXHR0b2tlbl9lbmRwb2ludF9hdXRoX21ldGhvZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXNwb25zZSBmcm9tIHRoZSBhdXRob3JpemF0aW9uIGVuZHBvaW50LlxuICogVHlwaWNhbGx5IHJldHVybmVkIGFzIHF1ZXJ5IHBhcmFtZXRlcnMgaW4gYSByZWRpcmVjdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQXV0aG9yaXphdGlvbkF1dGhvcml6ZVJlc3BvbnNlIHtcblx0LyoqXG5cdCAqIFJFUVVJUkVELiBUaGUgYXV0aG9yaXphdGlvbiBjb2RlIGdlbmVyYXRlZCBieSB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIuXG5cdCAqL1xuXHRjb2RlOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFJFUVVJUkVELiBUaGUgc3RhdGUgdmFsdWUgdGhhdCB3YXMgc2VudCBpbiB0aGUgYXV0aG9yaXphdGlvbiByZXF1ZXN0LlxuXHQgKiBVc2VkIHRvIHByZXZlbnQgQ1NSRiBhdHRhY2tzLlxuXHQgKi9cblx0c3RhdGU6IHN0cmluZztcbn1cblxuLyoqXG4gKiBFcnJvciByZXNwb25zZSBmcm9tIHRoZSBhdXRob3JpemF0aW9uIGVuZHBvaW50LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBdXRob3JpemF0aW9uQXV0aG9yaXplRXJyb3JSZXNwb25zZSB7XG5cdC8qKlxuXHQgKiBSRVFVSVJFRC4gRXJyb3IgY29kZSBhcyBzcGVjaWZpZWQgaW4gT0F1dGggMi4wLlxuXHQgKi9cblx0ZXJyb3I6IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEh1bWFuLXJlYWRhYmxlIGRlc2NyaXB0aW9uIG9mIHRoZSBlcnJvci5cblx0ICovXG5cdGVycm9yX2Rlc2NyaXB0aW9uPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJJIHRvIGEgaHVtYW4tcmVhZGFibGUgd2ViIHBhZ2Ugd2l0aCBtb3JlIGluZm9ybWF0aW9uIGFib3V0IHRoZSBlcnJvci5cblx0ICovXG5cdGVycm9yX3VyaT86IHN0cmluZztcblxuXHQvKipcblx0ICogUkVRVUlSRUQuIFRoZSBzdGF0ZSB2YWx1ZSB0aGF0IHdhcyBzZW50IGluIHRoZSBhdXRob3JpemF0aW9uIHJlcXVlc3QuXG5cdCAqL1xuXHRzdGF0ZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlc3BvbnNlIGZyb20gdGhlIHRva2VuIGVuZHBvaW50LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZSB7XG5cdC8qKlxuXHQgKiBSRVFVSVJFRC4gVGhlIGFjY2VzcyB0b2tlbiBpc3N1ZWQgYnkgdGhlIGF1dGhvcml6YXRpb24gc2VydmVyLlxuXHQgKi9cblx0YWNjZXNzX3Rva2VuOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFJFUVVJUkVELiBUaGUgdHlwZSBvZiB0aGUgdG9rZW4gaXNzdWVkLiBVc3VhbGx5IFwiQmVhcmVyXCIuXG5cdCAqL1xuXHR0b2tlbl90eXBlOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFJFQ09NTUVOREVELiBUaGUgbGlmZXRpbWUgaW4gc2Vjb25kcyBvZiB0aGUgYWNjZXNzIHRva2VuLlxuXHQgKi9cblx0ZXhwaXJlc19pbj86IG51bWJlcjtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFRoZSByZWZyZXNoIHRva2VuLCB3aGljaCBjYW4gYmUgdXNlZCB0byBvYnRhaW4gbmV3IGFjY2VzcyB0b2tlbnMuXG5cdCAqL1xuXHRyZWZyZXNoX3Rva2VuPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVGhlIHNjb3BlIG9mIHRoZSBhY2Nlc3MgdG9rZW4gYXMgYSBzcGFjZS1kZWxpbWl0ZWQgbGlzdCBvZiBzdHJpbmdzLlxuXHQgKi9cblx0c2NvcGU/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBJRCBUb2tlbiB2YWx1ZSBhc3NvY2lhdGVkIHdpdGggdGhlIGF1dGhlbnRpY2F0ZWQgc2Vzc2lvbiBmb3IgT3BlbklEIENvbm5lY3QgZmxvd3MuXG5cdCAqL1xuXHRpZF90b2tlbj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBFcnJvciByZXNwb25zZSBmcm9tIHRoZSB0b2tlbiBlbmRwb2ludC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQXV0aG9yaXphdGlvblRva2VuRXJyb3JSZXNwb25zZSB7XG5cdC8qKlxuXHQgKiBSRVFVSVJFRC4gRXJyb3IgY29kZSBhcyBzcGVjaWZpZWQgaW4gT0F1dGggMi4wLlxuXHQgKi9cblx0ZXJyb3I6IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEh1bWFuLXJlYWRhYmxlIGRlc2NyaXB0aW9uIG9mIHRoZSBlcnJvci5cblx0ICovXG5cdGVycm9yX2Rlc2NyaXB0aW9uPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVVJJIHRvIGEgaHVtYW4tcmVhZGFibGUgd2ViIHBhZ2Ugd2l0aCBtb3JlIGluZm9ybWF0aW9uIGFib3V0IHRoZSBlcnJvci5cblx0ICovXG5cdGVycm9yX3VyaT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXNwb25zZSBmcm9tIHRoZSBkZXZpY2UgYXV0aG9yaXphdGlvbiBlbmRwb2ludCBhcyBwZXIgUkZDIDg2Mjggc2VjdGlvbiAzLjIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUF1dGhvcml6YXRpb25EZXZpY2VSZXNwb25zZSB7XG5cdC8qKlxuXHQgKiBSRVFVSVJFRC4gVGhlIGRldmljZSB2ZXJpZmljYXRpb24gY29kZS5cblx0ICovXG5cdGRldmljZV9jb2RlOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFJFUVVJUkVELiBUaGUgZW5kLXVzZXIgdmVyaWZpY2F0aW9uIGNvZGUuXG5cdCAqL1xuXHR1c2VyX2NvZGU6IHN0cmluZztcblxuXHQvKipcblx0ICogUkVRVUlSRUQuIFRoZSBlbmQtdXNlciB2ZXJpZmljYXRpb24gVVJJIG9uIHRoZSBhdXRob3JpemF0aW9uIHNlcnZlci5cblx0ICovXG5cdHZlcmlmaWNhdGlvbl91cmk6IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEEgdmVyaWZpY2F0aW9uIFVSSSB0aGF0IGluY2x1ZGVzIHRoZSB1c2VyX2NvZGUsIGRlc2lnbmVkIGZvciBub24tdGV4dHVhbCB0cmFuc21pc3Npb24uXG5cdCAqL1xuXHR2ZXJpZmljYXRpb25fdXJpX2NvbXBsZXRlPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBSRVFVSVJFRC4gVGhlIGxpZmV0aW1lIGluIHNlY29uZHMgb2YgdGhlIGRldmljZV9jb2RlIGFuZCB1c2VyX2NvZGUuXG5cdCAqL1xuXHRleHBpcmVzX2luOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBUaGUgbWluaW11bSBhbW91bnQgb2YgdGltZSBpbiBzZWNvbmRzIHRoYXQgdGhlIGNsaWVudCBzaG91bGQgd2FpdCBiZXR3ZWVuIHBvbGxpbmcgcmVxdWVzdHMuXG5cdCAqIElmIG5vIHZhbHVlIGlzIHByb3ZpZGVkLCBjbGllbnRzIG11c3QgdXNlIDUgYXMgdGhlIGRlZmF1bHQuXG5cdCAqL1xuXHRpbnRlcnZhbD86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBFcnJvciByZXNwb25zZSBmcm9tIHRoZSB0b2tlbiBlbmRwb2ludCB3aGVuIHVzaW5nIGRldmljZSBhdXRob3JpemF0aW9uIGdyYW50LlxuICogQXMgZGVmaW5lZCBpbiBSRkMgODYyOCBzZWN0aW9uIDMuNS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2Uge1xuXHQvKipcblx0ICogUkVRVUlSRUQuIEVycm9yIGNvZGUgYXMgc3BlY2lmaWVkIGluIE9BdXRoIDIuMCBvciBpbiBSRkMgODYyOCBzZWN0aW9uIDMuNS5cblx0ICovXG5cdGVycm9yOiBBdXRob3JpemF0aW9uRXJyb3JUeXBlIHwgc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gSHVtYW4tcmVhZGFibGUgZGVzY3JpcHRpb24gb2YgdGhlIGVycm9yLlxuXHQgKi9cblx0ZXJyb3JfZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBVUkkgdG8gYSBodW1hbi1yZWFkYWJsZSB3ZWIgcGFnZSB3aXRoIG1vcmUgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGVycm9yLlxuXHQgKi9cblx0ZXJyb3JfdXJpPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEVycm9yIHJlc3BvbnNlIGZyb20gdGhlIHRva2VuIGVuZHBvaW50IHdoZW4gdXNpbmcgZGV2aWNlIGF1dGhvcml6YXRpb24gZ3JhbnQuXG4gKiBBcyBkZWZpbmVkIGluIFJGQyA4NjI4IHNlY3Rpb24gMy41LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBdXRob3JpemF0aW9uRGV2aWNlVG9rZW5FcnJvclJlc3BvbnNlIGV4dGVuZHMgSUF1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlIHtcblx0LyoqXG5cdCAqIFJFUVVJUkVELiBFcnJvciBjb2RlIGFzIHNwZWNpZmllZCBpbiBPQXV0aCAyLjAgb3IgaW4gUkZDIDg2Mjggc2VjdGlvbiAzLjUuXG5cdCAqL1xuXHRlcnJvcjogQXV0aG9yaXphdGlvbkVycm9yVHlwZSB8IEF1dGhvcml6YXRpb25EZXZpY2VDb2RlRXJyb3JUeXBlIHwgc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBdXRob3JpemF0aW9uUmVnaXN0cmF0aW9uRXJyb3JSZXNwb25zZSB7XG5cdC8qKlxuXHQgKiBSRVFVSVJFRC4gRXJyb3IgY29kZSBhcyBzcGVjaWZpZWQgaW4gT0F1dGggMi4wIG9yIER5bmFtaWMgQ2xpZW50IFJlZ2lzdHJhdGlvbi5cblx0ICovXG5cdGVycm9yOiBBdXRob3JpemF0aW9uUmVnaXN0cmF0aW9uRXJyb3JUeXBlIHwgc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gSHVtYW4tcmVhZGFibGUgZGVzY3JpcHRpb24gb2YgdGhlIGVycm9yLlxuXHQgKi9cblx0ZXJyb3JfZGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1dGhvcml6YXRpb25KV1RDbGFpbXMge1xuXHQvKipcblx0ICogUkVRVUlSRUQuIEpXVCBJRC4gVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSB0b2tlbi5cblx0ICovXG5cdGp0aTogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBSRVFVSVJFRC4gU3ViamVjdC4gUHJpbmNpcGFsIGFib3V0IHdoaWNoIHRoZSB0b2tlbiBhc3NlcnRzIGluZm9ybWF0aW9uLlxuXHQgKi9cblx0c3ViOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFJFUVVJUkVELiBJc3N1ZXIuIEVudGl0eSB0aGF0IGlzc3VlZCB0aGUgdG9rZW4uXG5cdCAqL1xuXHRpc3M6IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEF1ZGllbmNlLiBSZWNpcGllbnRzIHRoYXQgdGhlIHRva2VuIGlzIGludGVuZGVkIGZvci5cblx0ICovXG5cdGF1ZD86IHN0cmluZyB8IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gRXhwaXJhdGlvbiB0aW1lLiBUaW1lIGFmdGVyIHdoaWNoIHRoZSB0b2tlbiBpcyBpbnZhbGlkIChzZWNvbmRzIHNpbmNlIFVuaXggZXBvY2gpLlxuXHQgKi9cblx0ZXhwPzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gTm90IGJlZm9yZSB0aW1lLiBUaW1lIGJlZm9yZSB3aGljaCB0aGUgdG9rZW4gaXMgbm90IHZhbGlkIChzZWNvbmRzIHNpbmNlIFVuaXggZXBvY2gpLlxuXHQgKi9cblx0bmJmPzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gSXNzdWVkIGF0IHRpbWUgd2hlbiB0aGUgdG9rZW4gd2FzIGlzc3VlZCAoc2Vjb25kcyBzaW5jZSBVbml4IGVwb2NoKS5cblx0ICovXG5cdGlhdD86IG51bWJlcjtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIEF1dGhvcml6ZWQgcGFydHkuIFRoZSBwYXJ0eSB0byB3aGljaCB0aGUgdG9rZW4gd2FzIGlzc3VlZC5cblx0ICovXG5cdGF6cD86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFNjb3BlIHZhbHVlcyBmb3Igd2hpY2ggdGhlIHRva2VuIGlzIHZhbGlkLlxuXHQgKi9cblx0c2NvcGU/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBGdWxsIG5hbWUgb2YgdGhlIHVzZXIuXG5cdCAqL1xuXHRuYW1lPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gR2l2ZW4gb3IgZmlyc3QgbmFtZSBvZiB0aGUgdXNlci5cblx0ICovXG5cdGdpdmVuX25hbWU/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBGYW1pbHkgbmFtZSBvciBsYXN0IG5hbWUgb2YgdGhlIHVzZXIuXG5cdCAqL1xuXHRmYW1pbHlfbmFtZT86IHN0cmluZztcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIE1pZGRsZSBuYW1lIG9mIHRoZSB1c2VyLlxuXHQgKi9cblx0bWlkZGxlX25hbWU/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBQcmVmZXJyZWQgdXNlcm5hbWUgb3IgZW1haWwgdGhlIHVzZXIgd2lzaGVzIHRvIGJlIHJlZmVycmVkIHRvLlxuXHQgKi9cblx0cHJlZmVycmVkX3VzZXJuYW1lPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gRW1haWwgYWRkcmVzcyBvZiB0aGUgdXNlci5cblx0ICovXG5cdGVtYWlsPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVHJ1ZSBpZiB0aGUgdXNlcidzIGVtYWlsIGhhcyBiZWVuIHZlcmlmaWVkLlxuXHQgKi9cblx0ZW1haWxfdmVyaWZpZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gVXNlcidzIHByb2ZpbGUgcGljdHVyZSBVUkwuXG5cdCAqL1xuXHRwaWN0dXJlPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gQXV0aGVudGljYXRpb24gdGltZS4gVGltZSB3aGVuIHRoZSB1c2VyIGF1dGhlbnRpY2F0aW9uIG9jY3VycmVkLlxuXHQgKi9cblx0YXV0aF90aW1lPzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gQXV0aGVudGljYXRpb24gY29udGV4dCBjbGFzcyByZWZlcmVuY2UuXG5cdCAqL1xuXHRhY3I/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBBdXRoZW50aWNhdGlvbiBtZXRob2RzIHJlZmVyZW5jZXMuXG5cdCAqL1xuXHRhbXI/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogT1BUSU9OQUwuIFNlc3Npb24gSUQuIFN0cmluZyBpZGVudGlmaWVyIGZvciBhIHNlc3Npb24uXG5cdCAqL1xuXHRzaWQ/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9QVElPTkFMLiBBZGRyZXNzIGNvbXBvbmVudC5cblx0ICovXG5cdGFkZHJlc3M/OiB7XG5cdFx0Zm9ybWF0dGVkPzogc3RyaW5nO1xuXHRcdHN0cmVldF9hZGRyZXNzPzogc3RyaW5nO1xuXHRcdGxvY2FsaXR5Pzogc3RyaW5nO1xuXHRcdHJlZ2lvbj86IHN0cmluZztcblx0XHRwb3N0YWxfY29kZT86IHN0cmluZztcblx0XHRjb3VudHJ5Pzogc3RyaW5nO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gR3JvdXBzIHRoYXQgdGhlIHVzZXIgYmVsb25ncyB0by5cblx0ICovXG5cdGdyb3Vwcz86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gUm9sZXMgYXNzaWduZWQgdG8gdGhlIHVzZXIuXG5cdCAqL1xuXHRyb2xlcz86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBPUFRJT05BTC4gSGFuZGxlcyBvcHRpb25hbCBjbGFpbXMgdGhhdCBhcmUgbm90IGV4cGxpY2l0bHkgZGVmaW5lZCBpbiB0aGUgc3RhbmRhcmQuXG5cdCAqL1xuXHRba2V5OiBzdHJpbmddOiB1bmtub3duO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGlzIGZ1bmN0aW9uc1xuXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YShvYmo6IHVua25vd24pOiBvYmogaXMgSUF1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIHtcblx0aWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IG1ldGFkYXRhID0gb2JqIGFzIElBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YTtcblx0aWYgKCFtZXRhZGF0YS5yZXNvdXJjZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAobWV0YWRhdGEuc2NvcGVzX3N1cHBvcnRlZCAhPT0gdW5kZWZpbmVkICYmICFBcnJheS5pc0FycmF5KG1ldGFkYXRhLnNjb3Blc19zdXBwb3J0ZWQpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5jb25zdCB1cmlzVG9DaGVjazogQXJyYXk8a2V5b2YgSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YT4gPSBbXG5cdCdpc3N1ZXInLFxuXHQnYXV0aG9yaXphdGlvbl9lbmRwb2ludCcsXG5cdCd0b2tlbl9lbmRwb2ludCcsXG5cdCdyZWdpc3RyYXRpb25fZW5kcG9pbnQnLFxuXHQnandrc191cmknXG5dO1xuZXhwb3J0IGZ1bmN0aW9uIGlzQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKG9iajogdW5rbm93bik6IG9iaiBpcyBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhIHtcblx0aWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBtZXRhZGF0YSA9IG9iaiBhcyBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhO1xuXHRpZiAoIW1ldGFkYXRhLmlzc3Vlcikge1xuXHRcdHRocm93IG5ldyBFcnJvcignQXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgbXVzdCBoYXZlIGFuIGlzc3VlcicpO1xuXHR9XG5cblx0Zm9yIChjb25zdCB1cmkgb2YgdXJpc1RvQ2hlY2spIHtcblx0XHRpZiAoIW1ldGFkYXRhW3VyaV0pIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG1ldGFkYXRhW3VyaV0gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEF1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhICcke3VyaX0nIG11c3QgYmUgYSBzdHJpbmdgKTtcblx0XHR9XG5cdFx0aWYgKCFtZXRhZGF0YVt1cmldLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykgJiYgIW1ldGFkYXRhW3VyaV0uc3RhcnRzV2l0aCgnaHR0cDovLycpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEF1dGhvcml6YXRpb24gc2VydmVyIG1ldGFkYXRhICcke3VyaX0nIG11c3Qgc3RhcnQgd2l0aCBodHRwOi8vIG9yIGh0dHBzOi8vYCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlc3BvbnNlKG9iajogdW5rbm93bik6IG9iaiBpcyBJQXV0aG9yaXphdGlvbkR5bmFtaWNDbGllbnRSZWdpc3RyYXRpb25SZXNwb25zZSB7XG5cdGlmICh0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JyB8fCBvYmogPT09IG51bGwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgcmVzcG9uc2UgPSBvYmogYXMgSUF1dGhvcml6YXRpb25EeW5hbWljQ2xpZW50UmVnaXN0cmF0aW9uUmVzcG9uc2U7XG5cdHJldHVybiByZXNwb25zZS5jbGllbnRfaWQgIT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQXV0aG9yaXphdGlvbkF1dGhvcml6ZVJlc3BvbnNlKG9iajogdW5rbm93bik6IG9iaiBpcyBJQXV0aG9yaXphdGlvbkF1dGhvcml6ZVJlc3BvbnNlIHtcblx0aWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCByZXNwb25zZSA9IG9iaiBhcyBJQXV0aG9yaXphdGlvbkF1dGhvcml6ZVJlc3BvbnNlO1xuXHRyZXR1cm4gcmVzcG9uc2UuY29kZSAhPT0gdW5kZWZpbmVkICYmIHJlc3BvbnNlLnN0YXRlICE9PSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0F1dGhvcml6YXRpb25Ub2tlblJlc3BvbnNlKG9iajogdW5rbm93bik6IG9iaiBpcyBJQXV0aG9yaXphdGlvblRva2VuUmVzcG9uc2Uge1xuXHRpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgfHwgb2JqID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHJlc3BvbnNlID0gb2JqIGFzIElBdXRob3JpemF0aW9uVG9rZW5SZXNwb25zZTtcblx0cmV0dXJuIHJlc3BvbnNlLmFjY2Vzc190b2tlbiAhPT0gdW5kZWZpbmVkICYmIHJlc3BvbnNlLnRva2VuX3R5cGUgIT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlKG9iajogdW5rbm93bik6IG9iaiBpcyBJQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlIHtcblx0aWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCByZXNwb25zZSA9IG9iaiBhcyBJQXV0aG9yaXphdGlvbkRldmljZVJlc3BvbnNlO1xuXHRyZXR1cm4gcmVzcG9uc2UuZGV2aWNlX2NvZGUgIT09IHVuZGVmaW5lZCAmJiByZXNwb25zZS51c2VyX2NvZGUgIT09IHVuZGVmaW5lZCAmJiByZXNwb25zZS52ZXJpZmljYXRpb25fdXJpICE9PSB1bmRlZmluZWQgJiYgcmVzcG9uc2UuZXhwaXJlc19pbiAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRob3JpemF0aW9uRXJyb3JSZXNwb25zZShvYmo6IHVua25vd24pOiBvYmogaXMgSUF1dGhvcml6YXRpb25FcnJvclJlc3BvbnNlIHtcblx0aWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCByZXNwb25zZSA9IG9iaiBhcyBJQXV0aG9yaXphdGlvbkVycm9yUmVzcG9uc2U7XG5cdHJldHVybiByZXNwb25zZS5lcnJvciAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRob3JpemF0aW9uUmVnaXN0cmF0aW9uRXJyb3JSZXNwb25zZShvYmo6IHVua25vd24pOiBvYmogaXMgSUF1dGhvcml6YXRpb25SZWdpc3RyYXRpb25FcnJvclJlc3BvbnNlIHtcblx0aWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnIHx8IG9iaiA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCByZXNwb25zZSA9IG9iaiBhcyBJQXV0aG9yaXphdGlvblJlZ2lzdHJhdGlvbkVycm9yUmVzcG9uc2U7XG5cdHJldHVybiByZXNwb25zZS5lcnJvciAhPT0gdW5kZWZpbmVkO1xufVxuXG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHRNZXRhZGF0YUZvclVybChhdXRob3JpemF0aW9uU2VydmVyOiBVUkwpOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRpc3N1ZXI6IGF1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcoKSxcblx0XHRhdXRob3JpemF0aW9uX2VuZHBvaW50OiBuZXcgVVJMKCcvYXV0aG9yaXplJywgYXV0aG9yaXphdGlvblNlcnZlcikudG9TdHJpbmcoKSxcblx0XHR0b2tlbl9lbmRwb2ludDogbmV3IFVSTCgnL3Rva2VuJywgYXV0aG9yaXphdGlvblNlcnZlcikudG9TdHJpbmcoKSxcblx0XHRyZWdpc3RyYXRpb25fZW5kcG9pbnQ6IG5ldyBVUkwoJy9yZWdpc3RlcicsIGF1dGhvcml6YXRpb25TZXJ2ZXIpLnRvU3RyaW5nKCksXG5cdFx0Ly8gRGVmYXVsdCB2YWx1ZXMgZm9yIER5bmFtaWMgT3BlbklEIFByb3ZpZGVyc1xuXHRcdC8vIGh0dHBzOi8vb3BlbmlkLm5ldC9zcGVjcy9vcGVuaWQtY29ubmVjdC1kaXNjb3ZlcnktMV8wLmh0bWxcblx0XHRyZXNwb25zZV90eXBlc19zdXBwb3J0ZWQ6IFsnY29kZScsICdpZF90b2tlbicsICdpZF90b2tlbiB0b2tlbiddLFxuXHR9O1xufVxuXG4vKipcbiAqIFRoZSBncmFudCB0eXBlcyB0aGF0IHdlIHN1cHBvcnRcbiAqL1xuY29uc3QgZ3JhbnRUeXBlc1N1cHBvcnRlZCA9IFsnYXV0aG9yaXphdGlvbl9jb2RlJywgJ3JlZnJlc2hfdG9rZW4nLCAndXJuOmlldGY6cGFyYW1zOm9hdXRoOmdyYW50LXR5cGU6ZGV2aWNlX2NvZGUnXTtcblxuLyoqXG4gKiBEZWZhdWx0IHBvcnQgZm9yIHRoZSBhdXRob3JpemF0aW9uIGZsb3cuIFdlIHRyeSB0byB1c2UgdGhpcyBwb3J0IHNvIHRoYXRcbiAqIHRoZSByZWRpcmVjdCBVUkkgZG9lcyBub3QgY2hhbmdlIHdoZW4gcnVubmluZyBvbiBsb2NhbGhvc3QuIFRoaXMgaXMgdXNlZnVsXG4gKiBmb3Igc2VydmVycyB0aGF0IG9ubHkgYWxsb3cgZXhhY3QgbWF0Y2hlcyBvbiB0aGUgcmVkaXJlY3QgVVJJLiBUaGUgc3BlY1xuICogc2F5cyB0aGF0IHRoZSBwb3J0IHNob3VsZCBub3QgbWF0dGVyLCBidXQgc29tZSBzZXJ2ZXJzIGRvIG5vdCBmb2xsb3dcbiAqIHRoZSBzcGVjIGFuZCByZXF1aXJlIGFuIGV4YWN0IG1hdGNoLlxuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9BVVRIX0ZMT1dfUE9SVCA9IDMzNDE4O1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoRHluYW1pY1JlZ2lzdHJhdGlvbihzZXJ2ZXJNZXRhZGF0YTogSUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSwgY2xpZW50TmFtZTogc3RyaW5nLCBzY29wZXM/OiBzdHJpbmdbXSk6IFByb21pc2U8SUF1dGhvcml6YXRpb25EeW5hbWljQ2xpZW50UmVnaXN0cmF0aW9uUmVzcG9uc2U+IHtcblx0aWYgKCFzZXJ2ZXJNZXRhZGF0YS5yZWdpc3RyYXRpb25fZW5kcG9pbnQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1NlcnZlciBkb2VzIG5vdCBzdXBwb3J0IGR5bmFtaWMgcmVnaXN0cmF0aW9uJyk7XG5cdH1cblxuXHRjb25zdCByZXF1ZXN0Qm9keTogSUF1dGhvcml6YXRpb25EeW5hbWljQ2xpZW50UmVnaXN0cmF0aW9uUmVxdWVzdCA9IHtcblx0XHRjbGllbnRfbmFtZTogY2xpZW50TmFtZSxcblx0XHRjbGllbnRfdXJpOiAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20nLFxuXHRcdGdyYW50X3R5cGVzOiBzZXJ2ZXJNZXRhZGF0YS5ncmFudF90eXBlc19zdXBwb3J0ZWRcblx0XHRcdD8gc2VydmVyTWV0YWRhdGEuZ3JhbnRfdHlwZXNfc3VwcG9ydGVkLmZpbHRlcihndCA9PiBncmFudFR5cGVzU3VwcG9ydGVkLmluY2x1ZGVzKGd0KSlcblx0XHRcdDogZ3JhbnRUeXBlc1N1cHBvcnRlZCxcblx0XHRyZXNwb25zZV90eXBlczogWydjb2RlJ10sXG5cdFx0cmVkaXJlY3RfdXJpczogW1xuXHRcdFx0J2h0dHBzOi8vaW5zaWRlcnMudnNjb2RlLmRldi9yZWRpcmVjdCcsXG5cdFx0XHQnaHR0cHM6Ly92c2NvZGUuZGV2L3JlZGlyZWN0Jyxcblx0XHRcdCdodHRwOi8vMTI3LjAuMC4xLycsXG5cdFx0XHQvLyBBZGRlZCB0aGVzZSBmb3IgYW55IHNlcnZlciB0aGF0IG1pZ2h0IGRvXG5cdFx0XHQvLyBvbmx5IGV4YWN0IG1hdGNoIG9uIHRoZSByZWRpcmVjdCBVUkkgZXZlblxuXHRcdFx0Ly8gdGhvdWdoIHRoZSBzcGVjIHNheXMgaXQgc2hvdWxkIG5vdCBjYXJlXG5cdFx0XHQvLyBhYm91dCB0aGUgcG9ydC5cblx0XHRcdGBodHRwOi8vMTI3LjAuMC4xOiR7REVGQVVMVF9BVVRIX0ZMT1dfUE9SVH0vYFxuXHRcdF0sXG5cdFx0c2NvcGU6IHNjb3Blcz8uam9pbihBVVRIX1NDT1BFX1NFUEFSQVRPUiksXG5cdFx0dG9rZW5fZW5kcG9pbnRfYXV0aF9tZXRob2Q6ICdub25lJyxcblx0XHRhcHBsaWNhdGlvbl90eXBlOiAnbmF0aXZlJ1xuXHR9O1xuXG5cdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goc2VydmVyTWV0YWRhdGEucmVnaXN0cmF0aW9uX2VuZHBvaW50LCB7XG5cdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0aGVhZGVyczoge1xuXHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJ1xuXHRcdH0sXG5cdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkocmVxdWVzdEJvZHkpXG5cdH0pO1xuXG5cdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cdFx0bGV0IGVycm9yRGV0YWlsczogc3RyaW5nID0gcmVzdWx0O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGVycm9yUmVzcG9uc2UgPSBKU09OLnBhcnNlKHJlc3VsdCk7XG5cdFx0XHRpZiAoaXNBdXRob3JpemF0aW9uUmVnaXN0cmF0aW9uRXJyb3JSZXNwb25zZShlcnJvclJlc3BvbnNlKSkge1xuXHRcdFx0XHRlcnJvckRldGFpbHMgPSBgJHtlcnJvclJlc3BvbnNlLmVycm9yfSR7ZXJyb3JSZXNwb25zZS5lcnJvcl9kZXNjcmlwdGlvbiA/IGA6ICR7ZXJyb3JSZXNwb25zZS5lcnJvcl9kZXNjcmlwdGlvbn1gIDogJyd9YDtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIEpTT04gcGFyc2luZyBmYWlsZWQsIHVzZSByYXcgdGV4dFxuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgUmVnaXN0cmF0aW9uIHRvICR7c2VydmVyTWV0YWRhdGEucmVnaXN0cmF0aW9uX2VuZHBvaW50fSBmYWlsZWQ6ICR7ZXJyb3JEZXRhaWxzfWApO1xuXHR9XG5cblx0Y29uc3QgcmVnaXN0cmF0aW9uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXHRpZiAoaXNBdXRob3JpemF0aW9uRHluYW1pY0NsaWVudFJlZ2lzdHJhdGlvblJlc3BvbnNlKHJlZ2lzdHJhdGlvbikpIHtcblx0XHRyZXR1cm4gcmVnaXN0cmF0aW9uO1xuXHR9XG5cdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBhdXRob3JpemF0aW9uIGR5bmFtaWMgY2xpZW50IHJlZ2lzdHJhdGlvbiByZXNwb25zZTogJHtKU09OLnN0cmluZ2lmeShyZWdpc3RyYXRpb24pfWApO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBdXRoZW50aWNhdGlvbkNoYWxsZW5nZSB7XG5cdHNjaGVtZTogc3RyaW5nO1xuXHRwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVdXV0F1dGhlbnRpY2F0ZUhlYWRlcih3d3dBdXRoZW50aWNhdGVIZWFkZXJWYWx1ZTogc3RyaW5nKTogSUF1dGhlbnRpY2F0aW9uQ2hhbGxlbmdlW10ge1xuXHRjb25zdCBjaGFsbGVuZ2VzOiBJQXV0aGVudGljYXRpb25DaGFsbGVuZ2VbXSA9IFtdO1xuXG5cdC8vIEFjY29yZGluZyB0byBSRkMgNzIzNSwgbXVsdGlwbGUgY2hhbGxlbmdlcyBhcmUgc2VwYXJhdGVkIGJ5IGNvbW1hc1xuXHQvLyBCdXQgcGFyYW1ldGVycyB3aXRoaW4gYSBjaGFsbGVuZ2UgY2FuIGFsc28gYmUgc2VwYXJhdGVkIGJ5IGNvbW1hc1xuXHQvLyBXZSBuZWVkIHRvIGlkZW50aWZ5IHNjaGVtZSBuYW1lcyB0byBrbm93IHdoZXJlIGNoYWxsZW5nZXMgc3RhcnRcblxuXHQvLyBGaXJzdCwgc3BsaXQgYnkgY29tbWFzIHdoaWxlIHJlc3BlY3RpbmcgcXVvdGVkIHN0cmluZ3Ncblx0Y29uc3QgdG9rZW5zOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgY3VycmVudCA9ICcnO1xuXHRsZXQgaW5RdW90ZXMgPSBmYWxzZTtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHd3d0F1dGhlbnRpY2F0ZUhlYWRlclZhbHVlLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgY2hhciA9IHd3d0F1dGhlbnRpY2F0ZUhlYWRlclZhbHVlW2ldO1xuXG5cdFx0aWYgKGNoYXIgPT09ICdcIicpIHtcblx0XHRcdGluUXVvdGVzID0gIWluUXVvdGVzO1xuXHRcdFx0Y3VycmVudCArPSBjaGFyO1xuXHRcdH0gZWxzZSBpZiAoY2hhciA9PT0gJywnICYmICFpblF1b3Rlcykge1xuXHRcdFx0aWYgKGN1cnJlbnQudHJpbSgpKSB7XG5cdFx0XHRcdHRva2Vucy5wdXNoKGN1cnJlbnQudHJpbSgpKTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnQgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3VycmVudCArPSBjaGFyO1xuXHRcdH1cblx0fVxuXG5cdGlmIChjdXJyZW50LnRyaW0oKSkge1xuXHRcdHRva2Vucy5wdXNoKGN1cnJlbnQudHJpbSgpKTtcblx0fVxuXG5cdC8vIE5vdyBwcm9jZXNzIHRva2VucyB0byBpZGVudGlmeSBjaGFsbGVuZ2VzXG5cdC8vIEEgY2hhbGxlbmdlIHN0YXJ0cyB3aXRoIGEgc2NoZW1lIG5hbWUgKGEgdG9rZW4gdGhhdCBkb2Vzbid0IGNvbnRhaW4gJz0nIGFuZCBpcyBmb2xsb3dlZCBieSBwYXJhbWV0ZXJzIG9yIGlzIHN0YW5kYWxvbmUpXG5cdGxldCBjdXJyZW50Q2hhbGxlbmdlOiB7IHNjaGVtZTogc3RyaW5nOyBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSB8IHVuZGVmaW5lZDtcblxuXHRmb3IgKGNvbnN0IHRva2VuIG9mIHRva2Vucykge1xuXHRcdGNvbnN0IGhhc0VxdWFscyA9IHRva2VuLmluY2x1ZGVzKCc9Jyk7XG5cblx0XHRpZiAoIWhhc0VxdWFscykge1xuXHRcdFx0Ly8gVGhpcyB0b2tlbiBkb2Vzbid0IGhhdmUgJz0nLCBzbyBpdCdzIGxpa2VseSBhIHNjaGVtZSBuYW1lXG5cdFx0XHRpZiAoY3VycmVudENoYWxsZW5nZSkge1xuXHRcdFx0XHRjaGFsbGVuZ2VzLnB1c2goY3VycmVudENoYWxsZW5nZSk7XG5cdFx0XHR9XG5cdFx0XHRjdXJyZW50Q2hhbGxlbmdlID0geyBzY2hlbWU6IHRva2VuLnRyaW0oKSwgcGFyYW1zOiB7fSB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBUaGlzIHRva2VuIGhhcyAnPScsIGl0IGNvdWxkIGJlOlxuXHRcdFx0Ly8gMS4gQSBwYXJhbWV0ZXIgZm9yIHRoZSBjdXJyZW50IGNoYWxsZW5nZVxuXHRcdFx0Ly8gMi4gQSBuZXcgY2hhbGxlbmdlIHRoYXQgc3RhcnRzIHdpdGggXCJTY2hlbWUgcGFyYW09dmFsdWVcIlxuXG5cdFx0XHRjb25zdCBzcGFjZUluZGV4ID0gdG9rZW4uaW5kZXhPZignICcpO1xuXHRcdFx0aWYgKHNwYWNlSW5kZXggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGJlZm9yZVNwYWNlID0gdG9rZW4uc3Vic3RyaW5nKDAsIHNwYWNlSW5kZXgpO1xuXHRcdFx0XHRjb25zdCBhZnRlclNwYWNlID0gdG9rZW4uc3Vic3RyaW5nKHNwYWNlSW5kZXggKyAxKTtcblxuXHRcdFx0XHQvLyBDaGVjayBpZiB3aGF0J3MgYmVmb3JlIHRoZSBzcGFjZSBsb29rcyBsaWtlIGEgc2NoZW1lIG5hbWUgKG5vICc9Jylcblx0XHRcdFx0aWYgKCFiZWZvcmVTcGFjZS5pbmNsdWRlcygnPScpICYmIGFmdGVyU3BhY2UuaW5jbHVkZXMoJz0nKSkge1xuXHRcdFx0XHRcdC8vIFRoaXMgaXMgYSBuZXcgY2hhbGxlbmdlIHN0YXJ0aW5nIHdpdGggXCJTY2hlbWUgcGFyYW09dmFsdWVcIlxuXHRcdFx0XHRcdGlmIChjdXJyZW50Q2hhbGxlbmdlKSB7XG5cdFx0XHRcdFx0XHRjaGFsbGVuZ2VzLnB1c2goY3VycmVudENoYWxsZW5nZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGN1cnJlbnRDaGFsbGVuZ2UgPSB7IHNjaGVtZTogYmVmb3JlU3BhY2UudHJpbSgpLCBwYXJhbXM6IHt9IH07XG5cblx0XHRcdFx0XHQvLyBQYXJzZSB0aGUgcGFyYW1ldGVyIHBhcnRcblx0XHRcdFx0XHRjb25zdCBlcXVhbEluZGV4ID0gYWZ0ZXJTcGFjZS5pbmRleE9mKCc9Jyk7XG5cdFx0XHRcdFx0aWYgKGVxdWFsSW5kZXggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBrZXkgPSBhZnRlclNwYWNlLnN1YnN0cmluZygwLCBlcXVhbEluZGV4KS50cmltKCk7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGFmdGVyU3BhY2Uuc3Vic3RyaW5nKGVxdWFsSW5kZXggKyAxKS50cmltKCkucmVwbGFjZSgvXlwifFwiJC9nLCAnJyk7XG5cdFx0XHRcdFx0XHRpZiAoa2V5ICYmIHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0Y3VycmVudENoYWxsZW5nZS5wYXJhbXNba2V5XSA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaGlzIGlzIGEgcGFyYW1ldGVyIGZvciB0aGUgY3VycmVudCBjaGFsbGVuZ2Vcblx0XHRcdGlmIChjdXJyZW50Q2hhbGxlbmdlKSB7XG5cdFx0XHRcdGNvbnN0IGVxdWFsSW5kZXggPSB0b2tlbi5pbmRleE9mKCc9Jyk7XG5cdFx0XHRcdGlmIChlcXVhbEluZGV4ID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IHRva2VuLnN1YnN0cmluZygwLCBlcXVhbEluZGV4KS50cmltKCk7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSB0b2tlbi5zdWJzdHJpbmcoZXF1YWxJbmRleCArIDEpLnRyaW0oKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKTtcblx0XHRcdFx0XHRpZiAoa2V5ICYmIHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGN1cnJlbnRDaGFsbGVuZ2UucGFyYW1zW2tleV0gPSB2YWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBEb24ndCBmb3JnZXQgdGhlIGxhc3QgY2hhbGxlbmdlXG5cdGlmIChjdXJyZW50Q2hhbGxlbmdlKSB7XG5cdFx0Y2hhbGxlbmdlcy5wdXNoKGN1cnJlbnRDaGFsbGVuZ2UpO1xuXHR9XG5cblx0cmV0dXJuIGNoYWxsZW5nZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGFpbXNGcm9tSldUKHRva2VuOiBzdHJpbmcpOiBJQXV0aG9yaXphdGlvbkpXVENsYWltcyB7XG5cdGNvbnN0IHBhcnRzID0gdG9rZW4uc3BsaXQoJy4nKTtcblx0aWYgKHBhcnRzLmxlbmd0aCAhPT0gMykge1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKV1QgdG9rZW4gZm9ybWF0OiB0b2tlbiBtdXN0IGhhdmUgdGhyZWUgcGFydHMgc2VwYXJhdGVkIGJ5IGRvdHMnKTtcblx0fVxuXG5cdGNvbnN0IFtoZWFkZXIsIHBheWxvYWQsIF9zaWduYXR1cmVdID0gcGFydHM7XG5cblx0dHJ5IHtcblx0XHRjb25zdCBkZWNvZGVkSGVhZGVyID0gSlNPTi5wYXJzZShkZWNvZGVCYXNlNjQoaGVhZGVyKS50b1N0cmluZygpKTtcblx0XHRpZiAodHlwZW9mIGRlY29kZWRIZWFkZXIgIT09ICdvYmplY3QnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgSldUIHRva2VuIGZvcm1hdDogaGVhZGVyIGlzIG5vdCBhIEpTT04gb2JqZWN0Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVjb2RlZFBheWxvYWQgPSBKU09OLnBhcnNlKGRlY29kZUJhc2U2NChwYXlsb2FkKS50b1N0cmluZygpKTtcblx0XHRpZiAodHlwZW9mIGRlY29kZWRQYXlsb2FkICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEpXVCB0b2tlbiBmb3JtYXQ6IHBheWxvYWQgaXMgbm90IGEgSlNPTiBvYmplY3QnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVjb2RlZFBheWxvYWQ7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBwYXJzZSBKV1QgdG9rZW46ICR7ZS5tZXNzYWdlfWApO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBwYXJzZSBKV1QgdG9rZW4nKTtcblx0fVxufVxuXG4vKipcbiAqIENoZWNrcyBpZiB0d28gc2NvcGUgbGlzdHMgYXJlIGVxdWl2YWxlbnQsIHJlZ2FyZGxlc3Mgb2Ygb3JkZXIuXG4gKiBUaGlzIGlzIHVzZWZ1bCBmb3IgY29tcGFyaW5nIE9BdXRoIHNjb3BlcyB3aGVyZSB0aGUgb3JkZXIgc2hvdWxkIG5vdCBtYXR0ZXIuXG4gKlxuICogQHBhcmFtIHNjb3BlczEgRmlyc3QgbGlzdCBvZiBzY29wZXMgdG8gY29tcGFyZSAoY2FuIGJlIHVuZGVmaW5lZClcbiAqIEBwYXJhbSBzY29wZXMyIFNlY29uZCBsaXN0IG9mIHNjb3BlcyB0byBjb21wYXJlIChjYW4gYmUgdW5kZWZpbmVkKVxuICogQHJldHVybnMgdHJ1ZSBpZiB0aGUgc2NvcGUgbGlzdHMgY29udGFpbiB0aGUgc2FtZSBzY29wZXMgKG9yZGVyLWluZGVwZW5kZW50KSwgZmFsc2Ugb3RoZXJ3aXNlXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIHNjb3Blc01hdGNoKFsncmVhZCcsICd3cml0ZSddLCBbJ3dyaXRlJywgJ3JlYWQnXSkgLy8gUmV0dXJuczogdHJ1ZVxuICogc2NvcGVzTWF0Y2goWydyZWFkJ10sIFsnd3JpdGUnXSkgLy8gUmV0dXJuczogZmFsc2VcbiAqIHNjb3Blc01hdGNoKHVuZGVmaW5lZCwgdW5kZWZpbmVkKSAvLyBSZXR1cm5zOiB0cnVlXG4gKiBzY29wZXNNYXRjaChbJ3JlYWQnXSwgdW5kZWZpbmVkKSAvLyBSZXR1cm5zOiBmYWxzZVxuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzY29wZXNNYXRjaChzY29wZXMxOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgc2NvcGVzMjogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKHNjb3BlczEgPT09IHNjb3BlczIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoIXNjb3BlczEgfHwgIXNjb3BlczIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHNjb3BlczEubGVuZ3RoICE9PSBzY29wZXMyLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIFNvcnQgYm90aCBhcnJheXMgZm9yIGNvbXBhcmlzb24gdG8gaGFuZGxlIGRpZmZlcmVudCBvcmRlcmluZ3Ncblx0Y29uc3Qgc29ydGVkU2NvcGVzMSA9IFsuLi5zY29wZXMxXS5zb3J0KCk7XG5cdGNvbnN0IHNvcnRlZFNjb3BlczIgPSBbLi4uc2NvcGVzMl0uc29ydCgpO1xuXG5cdHJldHVybiBzb3J0ZWRTY29wZXMxLmV2ZXJ5KChzY29wZSwgaW5kZXgpID0+IHNjb3BlID09PSBzb3J0ZWRTY29wZXMyW2luZGV4XSk7XG59XG5cbmludGVyZmFjZSBDb21tb25SZXNwb25zZSB7XG5cdHN0YXR1czogbnVtYmVyO1xuXHRzdGF0dXNUZXh0OiBzdHJpbmc7XG5cdGpzb24oKTogUHJvbWlzZTx1bmtub3duPjtcblx0dGV4dCgpOiBQcm9taXNlPHN0cmluZz47XG59XG5cbmludGVyZmFjZSBJRmV0Y2hlciB7XG5cdChpbnB1dDogc3RyaW5nLCBpbml0OiB7IG1ldGhvZDogc3RyaW5nOyBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0pOiBQcm9taXNlPENvbW1vblJlc3BvbnNlPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmV0Y2hSZXNvdXJjZU1ldGFkYXRhT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBIZWFkZXJzIHRvIGluY2x1ZGUgb25seSB3aGVuIHRoZSByZXNvdXJjZSBtZXRhZGF0YSBVUkwgaGFzIHRoZSBzYW1lIG9yaWdpbiBhcyB0aGUgdGFyZ2V0IHJlc291cmNlXG5cdCAqL1xuXHRzYW1lT3JpZ2luSGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBjdXN0b20gZmV0Y2ggaW1wbGVtZW50YXRpb24gKGRlZmF1bHRzIHRvIGdsb2JhbCBmZXRjaClcblx0ICovXG5cdGZldGNoPzogSUZldGNoZXI7XG59XG5cbi8qKlxuICogRmV0Y2hlcyBhbmQgdmFsaWRhdGVzIE9BdXRoIDIuMCBwcm90ZWN0ZWQgcmVzb3VyY2UgbWV0YWRhdGEgZnJvbSB0aGUgZ2l2ZW4gVVJMLlxuICpcbiAqIEBwYXJhbSB0YXJnZXRSZXNvdXJjZSBUaGUgdGFyZ2V0IHJlc291cmNlIFVSTCB0byBjb21wYXJlIG9yaWdpbnMgd2l0aCAoZS5nLiwgdGhlIE1DUCBzZXJ2ZXIgVVJMKVxuICogQHBhcmFtIHJlc291cmNlTWV0YWRhdGFVcmwgT3B0aW9uYWwgVVJMIHRvIGZldGNoIHRoZSByZXNvdXJjZSBtZXRhZGF0YSBmcm9tLiBJZiBub3QgcHJvdmlkZWQsIHdpbGwgdHJ5IHdlbGwta25vd24gVVJJcy5cbiAqIEBwYXJhbSBvcHRpb25zIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgdGhlIGZldGNoIG9wZXJhdGlvblxuICogQHJldHVybnMgUHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSB2YWxpZGF0ZWQgcmVzb3VyY2UgbWV0YWRhdGEgYW5kIGFueSBlcnJvcnMgZW5jb3VudGVyZWQgZHVyaW5nIGRpc2NvdmVyeVxuICogQHRocm93cyBFcnJvciBpZiB0aGUgZmV0Y2ggZmFpbHMsIHJldHVybnMgbm9uLTIwMCBzdGF0dXMsIG9yIHRoZSByZXNwb25zZSBpcyBpbnZhbGlkIG9uIGFsbCBhdHRlbXB0ZWQgVVJMc1xuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hSZXNvdXJjZU1ldGFkYXRhKFxuXHR0YXJnZXRSZXNvdXJjZTogc3RyaW5nLFxuXHRyZXNvdXJjZU1ldGFkYXRhVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdG9wdGlvbnM6IElGZXRjaFJlc291cmNlTWV0YWRhdGFPcHRpb25zID0ge31cbik6IFByb21pc2U8eyBtZXRhZGF0YTogSUF1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhOyBkaXNjb3ZlcnlVcmw6IHN0cmluZzsgZXJyb3JzOiBFcnJvcltdIH0+IHtcblx0Y29uc3Qge1xuXHRcdHNhbWVPcmlnaW5IZWFkZXJzID0ge30sXG5cdFx0ZmV0Y2g6IGZldGNoSW1wbCA9IGZldGNoXG5cdH0gPSBvcHRpb25zO1xuXG5cdGNvbnN0IHRhcmdldFJlc291cmNlVXJsT2JqID0gbmV3IFVSTCh0YXJnZXRSZXNvdXJjZSk7XG5cblx0Y29uc3QgZmV0Y2hQcm0gPSBhc3luYyAocHJtVXJsOiBzdHJpbmcsIHZhbGlkYXRlVXJsOiBzdHJpbmcpID0+IHtcblx0XHQvLyBEZXRlcm1pbmUgaWYgd2Ugc2hvdWxkIGluY2x1ZGUgc2FtZS1vcmlnaW4gaGVhZGVyc1xuXHRcdGxldCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJ1xuXHRcdH07XG5cblx0XHRjb25zdCByZXNvdXJjZU1ldGFkYXRhVXJsT2JqID0gbmV3IFVSTChwcm1VcmwpO1xuXHRcdGlmIChyZXNvdXJjZU1ldGFkYXRhVXJsT2JqLm9yaWdpbiA9PT0gdGFyZ2V0UmVzb3VyY2VVcmxPYmoub3JpZ2luKSB7XG5cdFx0XHRoZWFkZXJzID0ge1xuXHRcdFx0XHQuLi5oZWFkZXJzLFxuXHRcdFx0XHQuLi5zYW1lT3JpZ2luSGVhZGVyc1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoSW1wbChwcm1VcmwsIHsgbWV0aG9kOiAnR0VUJywgaGVhZGVycyB9KTtcblx0XHRpZiAocmVzcG9uc2Uuc3RhdHVzICE9PSAyMDApIHtcblx0XHRcdGxldCBlcnJvclRleHQ6IHN0cmluZztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGVycm9yVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRlcnJvclRleHQgPSByZXNwb25zZS5zdGF0dXNUZXh0O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggcmVzb3VyY2UgbWV0YWRhdGEgZnJvbSAke3BybVVybH06ICR7cmVzcG9uc2Uuc3RhdHVzfSAke2Vycm9yVGV4dH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBib2R5ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXHRcdGlmIChpc0F1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhKGJvZHkpKSB7XG5cdFx0XHQvLyBWYWxpZGF0ZSB0aGF0IHRoZSByZXNvdXJjZSBtYXRjaGVzIHRoZSB0YXJnZXQgcmVzb3VyY2Vcblx0XHRcdC8vIFVzZSBVUkwgY29uc3RydWN0b3IgZm9yIG5vcm1hbGl6YXRpb24gLSBpdCBoYW5kbGVzIGhvc3RuYW1lIGNhc2UgYW5kIHRyYWlsaW5nIHNsYXNoZXNcblx0XHRcdGNvbnN0IHBybVZhbHVlID0gbmV3IFVSTChib2R5LnJlc291cmNlKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRSZXNvdXJjZSA9IG5ldyBVUkwodmFsaWRhdGVVcmwpLnRvU3RyaW5nKCk7XG5cdFx0XHRpZiAocHJtVmFsdWUgIT09IGV4cGVjdGVkUmVzb3VyY2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm90ZWN0ZWQgUmVzb3VyY2UgTWV0YWRhdGEgJ3Jlc291cmNlJyBwcm9wZXJ0eSB2YWx1ZSBcIiR7cHJtVmFsdWV9XCIgZG9lcyBub3QgbWF0Y2ggZXhwZWN0ZWQgdmFsdWUgXCIke2V4cGVjdGVkUmVzb3VyY2V9XCIgZm9yIFVSTCAke3BybVVybH0uIFBlciBSRkMgOTcyOCwgdGhlc2UgTVVTVCBtYXRjaC4gU2VlIGh0dHBzOi8vZGF0YXRyYWNrZXIuaWV0Zi5vcmcvZG9jL2h0bWwvcmZjOTcyOCNQUkNvbmZpZ3VyYXRpb25WYWxpZGF0aW9uYCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYm9keTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHJlc291cmNlIG1ldGFkYXRhIGZyb20gJHtwcm1Vcmx9LiBFeHBlY3RlZCB0byBmb2xsb3cgc2hhcGUgb2YgaHR0cHM6Ly9kYXRhdHJhY2tlci5pZXRmLm9yZy9kb2MvaHRtbC9yZmM5NzI4I25hbWUtcHJvdGVjdGVkLXJlc291cmNlLW1ldGFkYXRhIChIaW50czogaXMgc2NvcGVzX3N1cHBvcnRlZCBhbiBhcnJheT8gSXMgcmVzb3VyY2UgYSBzdHJpbmc/KS4gQ3VycmVudCBwYXlsb2FkOiAke0pTT04uc3RyaW5naWZ5KGJvZHkpfWApO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0aWYgKHJlc291cmNlTWV0YWRhdGFVcmwpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCBmZXRjaFBybShyZXNvdXJjZU1ldGFkYXRhVXJsLCB0YXJnZXRSZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4geyBtZXRhZGF0YSwgZGlzY292ZXJ5VXJsOiByZXNvdXJjZU1ldGFkYXRhVXJsLCBlcnJvcnMgfTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRlcnJvcnMucHVzaChlIGluc3RhbmNlb2YgRXJyb3IgPyBlIDogbmV3IEVycm9yKFN0cmluZyhlKSkpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFRyeSB3ZWxsLWtub3duIFVSSXMgc3RhcnRpbmcgd2l0aCBwYXRoLWFwcGVuZGVkLCB0aGVuIHJvb3Rcblx0Y29uc3QgaGFzUGF0aENvbXBvbmVudCA9IHRhcmdldFJlc291cmNlVXJsT2JqLnBhdGhuYW1lICE9PSAnLyc7XG5cdGNvbnN0IHJvb3RVcmwgPSBgJHt0YXJnZXRSZXNvdXJjZVVybE9iai5vcmlnaW59JHtBVVRIX1BST1RFQ1RFRF9SRVNPVVJDRV9NRVRBREFUQV9ESVNDT1ZFUllfUEFUSH1gO1xuXG5cdGlmIChoYXNQYXRoQ29tcG9uZW50KSB7XG5cdFx0Y29uc3QgcGF0aEFwcGVuZGVkVXJsID0gYCR7cm9vdFVybH0ke3RhcmdldFJlc291cmNlVXJsT2JqLnBhdGhuYW1lfWA7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgZmV0Y2hQcm0ocGF0aEFwcGVuZGVkVXJsLCB0YXJnZXRSZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4geyBtZXRhZGF0YSwgZGlzY292ZXJ5VXJsOiBwYXRoQXBwZW5kZWRVcmwsIGVycm9ycyB9O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGVycm9ycy5wdXNoKGUgaW5zdGFuY2VvZiBFcnJvciA/IGUgOiBuZXcgRXJyb3IoU3RyaW5nKGUpKSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRmluYWxseSwgdHJ5IHJvb3QgZGlzY292ZXJ5XG5cdHRyeSB7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCBmZXRjaFBybShyb290VXJsLCB0YXJnZXRSZXNvdXJjZVVybE9iai5vcmlnaW4pO1xuXHRcdHJldHVybiB7IG1ldGFkYXRhLCBkaXNjb3ZlcnlVcmw6IHJvb3RVcmwsIGVycm9ycyB9O1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0ZXJyb3JzLnB1c2goZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IG5ldyBFcnJvcihTdHJpbmcoZSkpKTtcblx0fVxuXG5cdC8vIElmIHdlJ3ZlIHRyaWVkIGFsbCBtZXRob2RzIGFuZCBub25lIHdvcmtlZCwgdGhyb3cgdGhlIGVycm9yKHMpXG5cdGlmIChlcnJvcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0dGhyb3cgZXJyb3JzWzBdO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBBZ2dyZWdhdGVFcnJvcihlcnJvcnMsICdGYWlsZWQgdG8gZmV0Y2ggcmVzb3VyY2UgbWV0YWRhdGEgZnJvbSBhbGwgYXR0ZW1wdGVkIFVSTHMnKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YU9wdGlvbnMge1xuXHQvKipcblx0ICogSGVhZGVycyB0byBpbmNsdWRlIGluIHRoZSByZXF1ZXN0c1xuXHQgKi9cblx0YWRkaXRpb25hbEhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHQvKipcblx0ICogT3B0aW9uYWwgY3VzdG9tIGZldGNoIGltcGxlbWVudGF0aW9uIChkZWZhdWx0cyB0byBnbG9iYWwgZmV0Y2gpXG5cdCAqL1xuXHRmZXRjaD86IElGZXRjaGVyO1xufVxuXG4vKiogSGVscGVyIHRvIHRyeSBwYXJzaW5nIHRoZSByZXNwb25zZSBhcyBhdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSAqL1xuYXN5bmMgZnVuY3Rpb24gdHJ5UGFyc2VBdXRoU2VydmVyTWV0YWRhdGEocmVzcG9uc2U6IENvbW1vblJlc3BvbnNlKTogUHJvbWlzZTxJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhIHwgdW5kZWZpbmVkPiB7XG5cdGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBib2R5ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXHRcdGlmIChpc0F1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YShib2R5KSkge1xuXHRcdFx0cmV0dXJuIGJvZHk7XG5cdFx0fVxuXHR9IGNhdGNoIHtcblx0XHQvLyBGYWlsZWQgdG8gcGFyc2UgYXMgSlNPTiBvciBub3QgdmFsaWQgbWV0YWRhdGFcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKiogSGVscGVyIHRvIGdldCBlcnJvciB0ZXh0IGZyb20gcmVzcG9uc2UgKi9cbmFzeW5jIGZ1bmN0aW9uIGdldEVyclRleHQocmVzOiBDb21tb25SZXNwb25zZSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGF3YWl0IHJlcy50ZXh0KCk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiByZXMuc3RhdHVzVGV4dDtcblx0fVxufVxuXG4vKipcbiAqIEZldGNoZXMgYW5kIHZhbGlkYXRlcyBPQXV0aCAyLjAgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgZnJvbSB0aGUgZ2l2ZW4gYXV0aG9yaXphdGlvbiBzZXJ2ZXIgVVJMLlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gdHJpZXMgbXVsdGlwbGUgZGlzY292ZXJ5IGVuZHBvaW50cyBpbiB0aGUgZm9sbG93aW5nIG9yZGVyOlxuICogMS4gT0F1dGggMi4wIEF1dGhvcml6YXRpb24gU2VydmVyIE1ldGFkYXRhIHdpdGggcGF0aCBpbnNlcnRpb24gKFJGQyA4NDE0KVxuICogMi4gT3BlbklEIENvbm5lY3QgRGlzY292ZXJ5IHdpdGggcGF0aCBpbnNlcnRpb25cbiAqIDMuIE9wZW5JRCBDb25uZWN0IERpc2NvdmVyeSB3aXRoIHBhdGggYWRkaXRpb25cbiAqXG4gKiBQYXRoIGluc2VydGlvbjogRm9yIGlzc3VlciBVUkxzIHdpdGggcGF0aCBjb21wb25lbnRzIChlLmcuLCBodHRwczovL2V4YW1wbGUuY29tL3RlbmFudCksXG4gKiB0aGUgd2VsbC1rbm93biBwYXRoIGlzIGluc2VydGVkIGFmdGVyIHRoZSBvcmlnaW4gYW5kIGJlZm9yZSB0aGUgcGF0aDpcbiAqIGh0dHBzOi8vZXhhbXBsZS5jb20vLndlbGwta25vd24vb2F1dGgtYXV0aG9yaXphdGlvbi1zZXJ2ZXIvdGVuYW50XG4gKlxuICogUGF0aCBhZGRpdGlvbjogVGhlIHdlbGwta25vd24gcGF0aCBpcyBzaW1wbHkgYXBwZW5kZWQgdG8gdGhlIGV4aXN0aW5nIHBhdGg6XG4gKiBodHRwczovL2V4YW1wbGUuY29tL3RlbmFudC8ud2VsbC1rbm93bi9vcGVuaWQtY29uZmlndXJhdGlvblxuICpcbiAqIEBwYXJhbSBhdXRob3JpemF0aW9uU2VydmVyIFRoZSBhdXRob3JpemF0aW9uIHNlcnZlciBVUkwgKGlzc3VlciBpZGVudGlmaWVyKVxuICogQHBhcmFtIG9wdGlvbnMgQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciB0aGUgZmV0Y2ggb3BlcmF0aW9uXG4gKiBAcmV0dXJucyBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIHZhbGlkYXRlZCBhdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YVxuICogQHRocm93cyBFcnJvciBpZiBhbGwgZGlzY292ZXJ5IGF0dGVtcHRzIGZhaWwgb3IgdGhlIHJlc3BvbnNlIGlzIGludmFsaWRcbiAqXG4gKiBAc2VlIGh0dHBzOi8vZGF0YXRyYWNrZXIuaWV0Zi5vcmcvZG9jL2h0bWwvcmZjODQxNCNzZWN0aW9uLTNcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhKFxuXHRhdXRob3JpemF0aW9uU2VydmVyOiBzdHJpbmcsXG5cdG9wdGlvbnM6IElGZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YU9wdGlvbnMgPSB7fVxuKTogUHJvbWlzZTx7IG1ldGFkYXRhOiBJQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhOyBkaXNjb3ZlcnlVcmw6IHN0cmluZzsgZXJyb3JzOiBFcnJvcltdIH0+IHtcblx0Y29uc3Qge1xuXHRcdGFkZGl0aW9uYWxIZWFkZXJzID0ge30sXG5cdFx0ZmV0Y2g6IGZldGNoSW1wbCA9IGZldGNoXG5cdH0gPSBvcHRpb25zO1xuXG5cdGNvbnN0IGF1dGhvcml6YXRpb25TZXJ2ZXJVcmwgPSBuZXcgVVJMKGF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXHRjb25zdCBleHRyYVBhdGggPSBhdXRob3JpemF0aW9uU2VydmVyVXJsLnBhdGhuYW1lID09PSAnLycgPyAnJyA6IGF1dGhvcml6YXRpb25TZXJ2ZXJVcmwucGF0aG5hbWU7XG5cblx0Y29uc3QgZXJyb3JzOiBFcnJvcltdID0gW107XG5cblx0Y29uc3QgZG9GZXRjaCA9IGFzeW5jICh1cmw6IHN0cmluZyk6IFByb21pc2U8SUF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByYXdSZXNwb25zZSA9IGF3YWl0IGZldGNoSW1wbCh1cmwsIHtcblx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdC4uLmFkZGl0aW9uYWxIZWFkZXJzLFxuXHRcdFx0XHRcdCdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbidcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHRyeVBhcnNlQXV0aFNlcnZlck1ldGFkYXRhKHJhd1Jlc3BvbnNlKTtcblx0XHRcdGlmIChtZXRhZGF0YSkge1xuXHRcdFx0XHRyZXR1cm4gbWV0YWRhdGE7XG5cdFx0XHR9XG5cdFx0XHQvLyBObyBtZXRhZGF0YSBmb3VuZCwgY29sbGVjdCBlcnJvciBmcm9tIHJlc3BvbnNlXG5cdFx0XHRlcnJvcnMucHVzaChuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBhdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSBmcm9tICR7dXJsfTogJHtyYXdSZXNwb25zZS5zdGF0dXN9ICR7YXdhaXQgZ2V0RXJyVGV4dChyYXdSZXNwb25zZSl9YCkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBDb2xsZWN0IGVycm9yIGZyb20gZmV0Y2ggZmFpbHVyZVxuXHRcdFx0ZXJyb3JzLnB1c2goZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IG5ldyBFcnJvcihTdHJpbmcoZSkpKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9O1xuXG5cdC8vIEZvciB0aGUgb2F1dGggc2VydmVyIG1ldGFkYXRhIGRpc2NvdmVyeSBwYXRoLCB3ZSBfSU5TRVJUX1xuXHQvLyB0aGUgd2VsbCBrbm93biBwYXRoIGFmdGVyIHRoZSBvcmlnaW4gYW5kIGJlZm9yZSB0aGUgcGF0aC5cblx0Ly8gaHR0cHM6Ly9kYXRhdHJhY2tlci5pZXRmLm9yZy9kb2MvaHRtbC9yZmM4NDE0I3NlY3Rpb24tM1xuXHRjb25zdCBwYXRoVG9GZXRjaCA9IG5ldyBVUkwoQVVUSF9TRVJWRVJfTUVUQURBVEFfRElTQ09WRVJZX1BBVEgsIGF1dGhvcml6YXRpb25TZXJ2ZXIpLnRvU3RyaW5nKCkgKyBleHRyYVBhdGg7XG5cdGxldCBtZXRhZGF0YSA9IGF3YWl0IGRvRmV0Y2gocGF0aFRvRmV0Y2gpO1xuXHRpZiAobWV0YWRhdGEpIHtcblx0XHRyZXR1cm4geyBtZXRhZGF0YSwgZGlzY292ZXJ5VXJsOiBwYXRoVG9GZXRjaCwgZXJyb3JzIH07XG5cdH1cblxuXHQvLyBUcnkgZmV0Y2hpbmcgdGhlIE9wZW5JRCBDb25uZWN0IERpc2NvdmVyeSB3aXRoIHBhdGggaW5zZXJ0aW9uLlxuXHQvLyBGb3IgaXNzdWVyIFVSTHMgd2l0aCBwYXRoIGNvbXBvbmVudHMsIHRoaXMgaW5zZXJ0cyB0aGUgd2VsbC1rbm93biBwYXRoXG5cdC8vIGFmdGVyIHRoZSBvcmlnaW4gYW5kIGJlZm9yZSB0aGUgcGF0aC5cblx0Y29uc3Qgb3BlbmlkUGF0aEluc2VydGlvblVybCA9IG5ldyBVUkwoT1BFTklEX0NPTk5FQ1RfRElTQ09WRVJZX1BBVEgsIGF1dGhvcml6YXRpb25TZXJ2ZXIpLnRvU3RyaW5nKCkgKyBleHRyYVBhdGg7XG5cdG1ldGFkYXRhID0gYXdhaXQgZG9GZXRjaChvcGVuaWRQYXRoSW5zZXJ0aW9uVXJsKTtcblx0aWYgKG1ldGFkYXRhKSB7XG5cdFx0cmV0dXJuIHsgbWV0YWRhdGEsIGRpc2NvdmVyeVVybDogb3BlbmlkUGF0aEluc2VydGlvblVybCwgZXJyb3JzIH07XG5cdH1cblxuXHQvLyBUcnkgZmV0Y2hpbmcgdGhlIG90aGVyIGRpc2NvdmVyeSBVUkwuIEZvciB0aGUgb3BlbmlkIG1ldGFkYXRhIGRpc2NvdmVyeVxuXHQvLyBwYXRoLCB3ZSBfQUREXyB0aGUgd2VsbCBrbm93biBwYXRoIGFmdGVyIHRoZSBleGlzdGluZyBwYXRoLlxuXHQvLyBodHRwczovL2RhdGF0cmFja2VyLmlldGYub3JnL2RvYy9odG1sL3JmYzg0MTQjc2VjdGlvbi0zXG5cdGNvbnN0IG9wZW5pZFBhdGhBZGRpdGlvblVybCA9IGF1dGhvcml6YXRpb25TZXJ2ZXIuZW5kc1dpdGgoJy8nKVxuXHRcdD8gYXV0aG9yaXphdGlvblNlcnZlciArIE9QRU5JRF9DT05ORUNUX0RJU0NPVkVSWV9QQVRILnN1YnN0cmluZygxKSAvLyBSZW1vdmUgbGVhZGluZyBzbGFzaCBpZiBhdXRoU2VydmVyIGVuZHMgd2l0aCBzbGFzaFxuXHRcdDogYXV0aG9yaXphdGlvblNlcnZlciArIE9QRU5JRF9DT05ORUNUX0RJU0NPVkVSWV9QQVRIO1xuXHRtZXRhZGF0YSA9IGF3YWl0IGRvRmV0Y2gob3BlbmlkUGF0aEFkZGl0aW9uVXJsKTtcblx0aWYgKG1ldGFkYXRhKSB7XG5cdFx0cmV0dXJuIHsgbWV0YWRhdGEsIGRpc2NvdmVyeVVybDogb3BlbmlkUGF0aEFkZGl0aW9uVXJsLCBlcnJvcnMgfTtcblx0fVxuXG5cdC8vIElmIHdlJ3ZlIHRyaWVkIGFsbCBVUkxzIGFuZCBub25lIHdvcmtlZCwgdGhyb3cgdGhlIGVycm9yKHMpXG5cdGlmIChlcnJvcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0dGhyb3cgZXJyb3JzWzBdO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBBZ2dyZWdhdGVFcnJvcihlcnJvcnMsICdGYWlsZWQgdG8gZmV0Y2ggYXV0aG9yaXphdGlvbiBzZXJ2ZXIgbWV0YWRhdGEgZnJvbSBhbGwgYXR0ZW1wdGVkIFVSTHMnKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxvQkFBb0I7QUFFN0IsTUFBTSxtQkFBbUI7QUFDbEIsTUFBTSxrREFBa0QsR0FBRyxnQkFBZ0I7QUFDM0UsTUFBTSxzQ0FBc0MsR0FBRyxnQkFBZ0I7QUFDL0QsTUFBTSxnQ0FBZ0MsR0FBRyxnQkFBZ0I7QUFDekQsTUFBTSx1QkFBdUI7QUFLN0IsTUFBTSw0QkFBNEI7QUFNbEMsTUFBTSwwQkFBMEI7QUFNaEMsTUFBTSxzQkFBc0I7QUFNNUIsTUFBTSxvQkFBb0I7QUFNMUIsTUFBTSx3QkFBd0I7QUFtQjlCLFNBQVMsdUJBQXVCLFVBQWtCLGNBQWtDLFNBQWlCLFVBQWtCLFVBQThCLFFBQTRDO0FBQ3ZNLFFBQU0sT0FBTyxJQUFJLGdCQUFnQjtBQUNqQyxPQUFLLE9BQU8sYUFBYSxRQUFRO0FBQ2pDLE1BQUksY0FBYztBQUNqQixTQUFLLE9BQU8saUJBQWlCLFlBQVk7QUFBQSxFQUMxQztBQUNBLE9BQUssT0FBTyxjQUFjLHlCQUF5QjtBQUNuRCxPQUFLLE9BQU8saUJBQWlCLE9BQU87QUFDcEMsT0FBSyxPQUFPLHNCQUFzQixtQkFBbUI7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WUFBWSxNQUFNLElBQUksTUFBTSxXQUFXLFdBQVcsQ0FBQyxFQUFFLENBQUM7QUFDMUksYUFBTztBQUFBLElBQ1IsU0FBUyxHQUFHO0FBRVgsYUFBTyxLQUFLLGFBQWEsUUFBUSxJQUFJLElBQUksTUFBTSxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQ3pELGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUtBLFFBQU0sY0FBYyxJQUFJLElBQUkscUNBQXFDLG1CQUFtQixFQUFFLFNBQVMsSUFBSTtBQUNuRyxNQUFJLFdBQVcsTUFBTSxRQUFRLFdBQVc7QUFDeEMsTUFBSSxVQUFVO0FBQ2IsV0FBTyxFQUFFLFVBQVUsY0FBYyxhQUFhLE9BQU87QUFBQSxFQUN0RDtBQUtBLFFBQU0seUJBQXlCLElBQUksSUFBSSwrQkFBK0IsbUJBQW1CLEVBQUUsU0FBUyxJQUFJO0FBQ3hHLGFBQVcsTUFBTSxRQUFRLHNCQUFzQjtBQUMvQyxNQUFJLFVBQVU7QUFDYixXQUFPLEVBQUUsVUFBVSxjQUFjLHdCQUF3QixPQUFPO0FBQUEsRUFDakU7QUFLQSxRQUFNLHdCQUF3QixvQkFBb0IsU0FBUyxHQUFHLElBQzNELHNCQUFzQiw4QkFBOEIsVUFBVSxDQUFDLElBQy9ELHNCQUFzQjtBQUN6QixhQUFXLE1BQU0sUUFBUSxxQkFBcUI7QUFDOUMsTUFBSSxVQUFVO0FBQ2IsV0FBTyxFQUFFLFVBQVUsY0FBYyx1QkFBdUIsT0FBTztBQUFBLEVBQ2hFO0FBR0EsTUFBSSxPQUFPLFdBQVcsR0FBRztBQUN4QixVQUFNLE9BQU8sQ0FBQztBQUFBLEVBQ2YsT0FBTztBQUNOLFVBQU0sSUFBSSxlQUFlLFFBQVEsdUVBQXVFO0FBQUEsRUFDekc7QUFDRDsiLAogICJuYW1lcyI6IFsiQXV0aG9yaXphdGlvbkVycm9yVHlwZSIsICJBdXRob3JpemF0aW9uRGV2aWNlQ29kZUVycm9yVHlwZSIsICJBdXRob3JpemF0aW9uUmVnaXN0cmF0aW9uRXJyb3JUeXBlIiwgIm1ldGFkYXRhIl0KfQo=
