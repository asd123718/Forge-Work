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
import { CAPIClient, RequestType } from "@vscode/copilot-api";
import { generateUuid } from "../../../../base/common/uuid.js";
import { getDevDeviceId, getMachineId } from "../../../../base/node/id.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { IAgentHostGitHubEndpointService } from "../agentHostGitHubEndpointService.js";
import { ILogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { COPILOT_LICENSE_AGREEMENT } from "../../../endpoint/common/licenseAgreement.js";
import { parseCopilotTokenFields } from "../copilot/copilotTokenFields.js";
const COPILOT_API_ERROR_STATUS_STREAMING = 520;
const CAPI_CONTEXT_REFRESH_BUFFER_SECONDS = 5 * 60;
const CAPI_CONTEXT_TTL_SECONDS = 30 * 60;
const USER_API_VERSION = "2025-04-01";
const CAPI_URL_OVERRIDE_ENV = "VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE";
const CAPI_URL_OVERRIDE_SMOKE_TEST_HOST = "vscode-smoke.test";
const CAPI_URL_OVERRIDE_SMOKE_TEST_ENV = "VSCODE_SMOKE_TEST_PROXY_HEADER";
const GITHUB_API_URL_OVERRIDE_ENV = "COPILOT_DEBUG_GITHUB_API_URL";
function isLoopbackUrl(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}
function isAllowedCapiUrlOverride(url) {
  if (isLoopbackUrl(url)) {
    return true;
  }
  if (!process.env[CAPI_URL_OVERRIDE_SMOKE_TEST_ENV]) {
    return false;
  }
  try {
    return new URL(url).hostname.toLowerCase() === CAPI_URL_OVERRIDE_SMOKE_TEST_HOST;
  } catch {
    return false;
  }
}
const COPILOT_TOKEN_REFRESH_BUFFER_SECONDS = 5 * 60;
const UTILITY_DEFAULT_MODEL_FAMILY = "gpt-4o-mini";
const UTILITY_DEFAULT_TEMPERATURE = 0.1;
const UTILITY_DEFAULT_TOP_P = 1;
const UTILITY_INTENT = "conversation-background";
const INTERNAL_COPILOT_ORGANIZATIONS = /* @__PURE__ */ new Set([
  "4535c7beffc844b46bb1ed4aa04d759a",
  "a5db0bcaae94032fe715fb34a5e4bce2",
  "7184f66dfcee98cb5f08a1cb936d5225",
  "1cb18ac6eedd49b43d74a1c5beb0b955",
  "ea9395b9a9248c05ee6847cbd24355ed"
]);
const VSCODE_COPILOT_ORGANIZATIONS = /* @__PURE__ */ new Set(["551cca60ce19654d894e786220822482"]);
class CopilotApiError extends Error {
  /**
   * @param status HTTP status from the originating CAPI response, or
   *   {@link COPILOT_API_ERROR_STATUS_STREAMING} for mid-stream SSE errors.
   * @param envelope Anthropic-format error envelope. For HTTP errors with a
   *   non-conforming body (plain text, malformed JSON, missing fields) this
   *   is synthesized; for conforming bodies and SSE frames it is the
   *   server's envelope verbatim.
   * @param message Optional override for `Error.message`. Defaults to
   *   `envelope.error.message`. **Never includes auth tokens.**
   */
  constructor(status, envelope, message) {
    super(message ?? envelope.error.message);
    this.status = status;
    this.envelope = envelope;
    this.name = "CopilotApiError";
  }
}
function buildCopilotApiHttpError(status, statusText, bodyText, prefix = "CAPI request failed") {
  let envelope;
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === "object" && parsed.type === "error") {
        const err = parsed.error;
        if (err && typeof err === "object" && typeof err.type === "string" && typeof err.message === "string") {
          envelope = parsed;
        }
      }
    } catch {
    }
  }
  if (!envelope) {
    envelope = {
      type: "error",
      error: {
        type: "api_error",
        message: bodyText || `${status} ${statusText}`
      },
      request_id: null
    };
  }
  return new CopilotApiError(
    status,
    envelope,
    `${prefix}: ${status} ${statusText} \u2014 ${envelope.error.message}`
  );
}
const ICopilotApiService = createDecorator("copilotApiService");
let CopilotApiService = class {
  constructor(fetchFn, _logService, _productService, _gitHubEndpointService) {
    this._logService = _logService;
    this._productService = _productService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._capiBasePromise = null;
    this._clientsByToken = /* @__PURE__ */ new Map();
    this._copilotTokensByGithub = /* @__PURE__ */ new Map();
    this._fetch = fetchFn ?? globalThis.fetch;
  }
  messages(githubToken, request, options) {
    if (request.stream) {
      return this._messagesStreaming(githubToken, request, options);
    }
    return this._messagesNonStreaming(githubToken, request, options);
  }
  async countTokens(_githubToken, _req, _options) {
    throw new Error("countTokens not supported by CAPI");
  }
  async models(githubToken, options) {
    const capiClient = await this._getClientForToken(githubToken);
    this._logService.debug("[CopilotApiService] GET models");
    const response = await capiClient.makeRequest(
      {
        method: "GET",
        headers: {
          ...options?.headers,
          "Authorization": `Bearer ${githubToken}`
        },
        // Opt-in per request — see
        // `ICopilotApiServiceRequestOptions.suppressIntegrationId`.
        suppressIntegrationId: options?.suppressIntegrationId,
        signal: options?.signal
      },
      { type: RequestType.Models }
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this._invalidateClientForToken(githubToken);
      }
      const text = await response.text().catch(() => "");
      throw buildCopilotApiHttpError(response.status, response.statusText, text, "CAPI models request failed");
    }
    const json = await response.json();
    return json.data ?? [];
  }
  async responses(githubToken, body, options) {
    const capiClient = await this._getClientForToken(githubToken);
    const requestId = generateUuid();
    let requestModel = "<unknown>";
    try {
      const parsed = JSON.parse(body);
      requestModel = parsed.model ?? "<none>";
    } catch {
    }
    this._logService.info(`[CopilotApiService] POST responses: requestId=${requestId}, model=${requestModel}`);
    const response = await capiClient.makeRequest(
      {
        method: "POST",
        headers: {
          ...options?.headers,
          "Content-Type": "application/json",
          "Authorization": `Bearer ${githubToken}`,
          "X-Request-Id": requestId,
          "OpenAI-Intent": "conversation"
        },
        // Opt-in per request — see
        // `ICopilotApiServiceRequestOptions.suppressIntegrationId`.
        suppressIntegrationId: options?.suppressIntegrationId,
        body,
        signal: options?.signal
      },
      { type: RequestType.ChatResponses }
    );
    this._logService.info(`[CopilotApiService] responses status=${response.status}, requestId=${requestId}`);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this._invalidateClientForToken(githubToken);
      }
      const text = await response.text().catch(() => "");
      throw buildCopilotApiHttpError(response.status, response.statusText, text, "CAPI responses request failed");
    }
    return response;
  }
  async utilityChatCompletion(githubToken, request, options) {
    const capiClient = await this._getClientForToken(githubToken);
    const modelId = await this._resolveUtilityModelId(githubToken, UTILITY_DEFAULT_MODEL_FAMILY);
    const requestId = generateUuid();
    this._logService.debug("[CopilotApiService] POST chat completions", `model=${modelId} requestId=${requestId}`);
    const body = JSON.stringify({
      model: modelId,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      temperature: request.temperature ?? UTILITY_DEFAULT_TEMPERATURE,
      top_p: UTILITY_DEFAULT_TOP_P,
      max_tokens: request.maxTokens
    });
    const response = await capiClient.makeRequest(
      {
        method: "POST",
        headers: {
          ...options?.headers,
          "Content-Type": "application/json",
          "Authorization": `Bearer ${githubToken}`,
          "X-Request-Id": requestId,
          "OpenAI-Intent": UTILITY_INTENT
        },
        body,
        signal: options?.signal
      },
      { type: RequestType.ChatCompletions }
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this._invalidateClientForToken(githubToken);
      }
      const text = await response.text().catch(() => "");
      throw buildCopilotApiHttpError(response.status, response.statusText, text, "CAPI chat completion request failed");
    }
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("CAPI chat completion returned no text content");
    }
    return content;
  }
  // #endregion
  // #region Lazy Init
  _getCapiBase() {
    if (!this._capiBasePromise) {
      this._capiBasePromise = this._buildCapiBase().catch((err) => {
        this._capiBasePromise = null;
        throw err;
      });
    }
    return this._capiBasePromise;
  }
  async _buildCapiBase() {
    const [machineId, deviceId] = await Promise.all([
      getMachineId((err) => this._logService.warn("[CopilotApiService] getMachineId failed", err)),
      getDevDeviceId((err) => this._logService.warn("[CopilotApiService] getDevDeviceId failed", err))
    ]);
    const extensionInfo = {
      name: "agent-host",
      sessionId: generateUuid(),
      machineId,
      deviceId,
      vscodeVersion: this._productService.version,
      version: this._productService.version,
      buildType: this._productService.quality === "stable" ? "prod" : "dev"
    };
    const userUrl = `${this._gitHubEndpointService.getApiBaseUri()}/copilot_internal/user`;
    return { extensionInfo, userUrl };
  }
  // #endregion
  // #region Streaming
  async *_messagesStreaming(githubToken, request, options) {
    const response = await this._sendRequest(githubToken, request, true, options);
    if (!response.body) {
      throw new Error("CAPI response has no body");
    }
    yield* this._readSSE(response.body);
  }
  // #endregion
  // #region Non-Streaming
  async _messagesNonStreaming(githubToken, request, options) {
    const response = await this._sendRequest(githubToken, request, false, options);
    return response.json();
  }
  // #endregion
  // #region Shared Request
  async _sendRequest(githubToken, request, stream, options) {
    const capiClient = await this._getClientForToken(githubToken);
    const requestId = generateUuid();
    this._logService.debug("[CopilotApiService] POST messages", `model=${request.model} stream=${stream} requestId=${requestId}`);
    const { system, ...rest } = request;
    const body = JSON.stringify({
      ...rest,
      stream,
      // CAPI requires system as a text-block array, not a raw string
      ...system !== void 0 ? { system: typeof system === "string" ? [{ type: "text", text: system }] : system } : {}
    });
    const response = await capiClient.makeRequest(
      {
        method: "POST",
        headers: {
          ...options?.headers,
          "Content-Type": "application/json",
          "Authorization": `Bearer ${githubToken}`,
          "X-Request-Id": requestId,
          "X-GitHub-Api-Version": "2026-01-09",
          // Should these be parameterized?
          "OpenAI-Intent": "messages-proxy",
          "X-Interaction-Type": "messages-proxy"
          // `X-Initiator` (user|agent) is intentionally omitted: the
          // user-vs-agent turn origin known to `ClaudeAgentSession` is not
          // plumbed across the SDK subprocess to this proxy, so a hardcoded
          // value would mislabel most agent-loop traffic. CAPI accepts the
          // request without it (the `responses()` and `utilityChatCompletion()`
          // paths already omit it). Thread a real per-turn initiator here if
          // that signal ever becomes available at the proxy boundary.
        },
        suppressIntegrationId: options?.suppressIntegrationId,
        body,
        signal: options?.signal
      },
      { type: RequestType.ChatMessages }
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this._invalidateClientForToken(githubToken);
      }
      const text = await response.text().catch(() => "");
      throw buildCopilotApiHttpError(response.status, response.statusText, text);
    }
    return response;
  }
  // #endregion
  // #region Per-Token Client
  /**
   * Resolve a {@link CAPIClient} that has had its domains updated for the
   * supplied user. Concurrent callers for the same token share one
   * `/copilot_internal/user` discovery via the cache map; callers with
   * different tokens get their **own** `CAPIClient` instance, so the
   * `updateDomains` mutation for token A can never affect a request being
   * dispatched for token B.
   */
  _getClientForToken(githubToken) {
    return this._getEntryForToken(githubToken).then((entry) => entry.capiClient);
  }
  /**
   * Resolve this user's restricted-telemetry context. Reads the `rt`/`tid` claims from the minted
   * CAPI Copilot session token (the GitHub token has neither), and resolves the CAPI
   * `endpoints.telemetry` host from the cached `/copilot_internal/user` discovery only when the
   * user is opted in, so public users pay no extra discovery call.
   */
  async resolveRestrictedTelemetryContext(githubToken) {
    const token = await this._getCopilotTokenEntry(githubToken);
    const client = await this._getEntryForToken(githubToken);
    const fields = parseCopilotTokenFields(token.token);
    const restrictedTelemetryEnabled = fields.get("rt") === "1";
    const trackingId = fields.get("tid");
    const telemetryEndpoint = restrictedTelemetryEnabled ? client.telemetryEndpoint : void 0;
    return {
      restrictedTelemetryEnabled,
      trackingId,
      telemetryEndpoint,
      isInternal: token.isInternal,
      userName: client.login,
      isVscodeTeamMember: token.isVscodeTeamMember,
      copilotIgnoreEnabled: client.copilotIgnoreEnabled
    };
  }
  async resolveApiEndpoint(githubToken) {
    return (await this._getEntryForToken(githubToken)).apiEndpoint;
  }
  async resolveUserLogin(githubToken) {
    return (await this._getEntryForToken(githubToken)).login;
  }
  async resolveCopilotSku(githubToken) {
    return (await this._getEntryForToken(githubToken)).copilotSku;
  }
  _getEntryForToken(githubToken) {
    const nowSeconds = Date.now() / 1e3;
    const existing = this._clientsByToken.get(githubToken);
    if (existing) {
      return existing.then((entry) => {
        if (entry.expiresAt - nowSeconds > CAPI_CONTEXT_REFRESH_BUFFER_SECONDS) {
          return entry;
        }
        this._clientsByToken.delete(githubToken);
        return this._getEntryForToken(githubToken);
      }).catch((err) => {
        this._clientsByToken.delete(githubToken);
        throw err;
      });
    }
    const pending = this._buildClientForToken(githubToken).catch((err) => {
      this._clientsByToken.delete(githubToken);
      throw err;
    });
    this._clientsByToken.set(githubToken, pending);
    return pending;
  }
  _invalidateClientForToken(githubToken) {
    this._clientsByToken.delete(githubToken);
  }
  async _buildClientForToken(githubToken) {
    const { extensionInfo, userUrl } = await this._getCapiBase();
    const fetch = this._fetch;
    const capiClient = new CAPIClient(extensionInfo, COPILOT_LICENSE_AGREEMENT, {
      fetch: (url, options) => fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: options.signal
      })
    });
    this._logService.debug("[CopilotApiService] Discovering CAPI endpoints via /copilot_internal/user");
    const overrideApi = process.env[CAPI_URL_OVERRIDE_ENV];
    if (overrideApi) {
      if (isAllowedCapiUrlOverride(overrideApi)) {
        this._logService.info(`[CopilotApiService] Using CAPI URL override ${overrideApi}; skipping endpoint discovery`);
        capiClient.updateDomains({ endpoints: { api: overrideApi, proxy: overrideApi }, sku: "" }, void 0);
        return {
          capiClient,
          expiresAt: Date.now() / 1e3 + CAPI_CONTEXT_TTL_SECONDS,
          utilityModelIdsByFamily: /* @__PURE__ */ new Map(),
          apiEndpoint: overrideApi
        };
      }
      this._logService.warn(`[CopilotApiService] Ignoring non-loopback CAPI URL override ${overrideApi}; falling back to normal endpoint discovery`);
    }
    const response = await this._fetch(userUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/json",
        "X-GitHub-Api-Version": USER_API_VERSION
      }
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw buildCopilotApiHttpError(response.status, response.statusText, text, "Copilot endpoint discovery failed");
    }
    const envelope = await response.json();
    capiClient.updateDomains(
      { endpoints: envelope.endpoints ?? {}, sku: envelope.access_type_sku ?? "" },
      // Enterprise base URI (e.g. `https://acme.ghe.com`), or `undefined` for
      // github.com. The package derives the GitHub API host (`api.<host>`) from
      // this for `copilot_internal` endpoints - notably the Copilot session
      // token mint (`/copilot_internal/v2/token`). Omitting it strands the mint
      // on `api.github.com`, which 401s an enterprise token ("Bad credentials").
      this._gitHubEndpointService.getEnterpriseUri()
    );
    this._logService.debug("[CopilotApiService] CAPI endpoint discovered, api=", envelope.endpoints?.api);
    return {
      capiClient,
      expiresAt: Date.now() / 1e3 + CAPI_CONTEXT_TTL_SECONDS,
      utilityModelIdsByFamily: /* @__PURE__ */ new Map(),
      copilotSku: envelope.access_type_sku,
      login: envelope.login,
      telemetryEndpoint: envelope.endpoints?.telemetry,
      apiEndpoint: envelope.endpoints?.api,
      copilotIgnoreEnabled: envelope.copilotignore_enabled
    };
  }
  // #endregion
  // #region Per-Token Copilot Session Token
  /**
   * Resolve the Copilot session token for a GitHub token, minting and
   * caching one if needed. Concurrent callers for the same GitHub token
   * share a single in-flight mint; the caller's `AbortSignal` is
   * deliberately NOT forwarded so cancelling one caller does not poison
   * the shared mint for the others.
   */
  _getCopilotTokenEntry(githubToken) {
    const nowSeconds = Date.now() / 1e3;
    const existing = this._copilotTokensByGithub.get(githubToken);
    if (existing) {
      return existing.then((entry) => {
        if (entry.expiresAt - nowSeconds > COPILOT_TOKEN_REFRESH_BUFFER_SECONDS) {
          return entry;
        }
        if (this._copilotTokensByGithub.get(githubToken) === existing) {
          this._copilotTokensByGithub.delete(githubToken);
        }
        return this._getCopilotTokenEntry(githubToken);
      }).catch((err) => {
        if (this._copilotTokensByGithub.get(githubToken) === existing) {
          this._copilotTokensByGithub.delete(githubToken);
        }
        throw err;
      });
    }
    const pending = this._buildCopilotToken(githubToken).catch((err) => {
      if (this._copilotTokensByGithub.get(githubToken) === pending) {
        this._copilotTokensByGithub.delete(githubToken);
      }
      throw err;
    });
    this._copilotTokensByGithub.set(githubToken, pending);
    return pending;
  }
  async _buildCopilotToken(githubToken) {
    const capiClient = await this._getClientForToken(githubToken);
    this._logService.debug("[CopilotApiService] Minting Copilot session token");
    const request = {
      method: "GET",
      headers: {
        "Authorization": `token ${githubToken}`,
        "X-GitHub-Api-Version": USER_API_VERSION
      }
    };
    const githubApiOverride = process.env[GITHUB_API_URL_OVERRIDE_ENV];
    const response = githubApiOverride && isAllowedCapiUrlOverride(githubApiOverride) ? await this._fetch(`${githubApiOverride.replace(/\/$/, "")}/copilot_internal/v2/token`, request) : await capiClient.makeRequest(
      {
        method: "GET",
        headers: request.headers
      },
      { type: RequestType.CopilotToken }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Copilot session token mint failed: ${response.status} ${response.statusText} \u2014 ${text}`);
    }
    const envelope = await response.json();
    if (typeof envelope.token !== "string" || typeof envelope.expires_at !== "number") {
      throw new Error("Copilot session token mint returned malformed envelope");
    }
    const nowSeconds = Date.now() / 1e3;
    const refreshIn = typeof envelope.refresh_in === "number" ? envelope.refresh_in : void 0;
    const organizationList = Array.isArray(envelope.organization_list) ? envelope.organization_list.filter((organization) => typeof organization === "string") : [];
    const expiresAt = Math.max(
      refreshIn !== void 0 ? nowSeconds + refreshIn : envelope.expires_at,
      nowSeconds + 60
    );
    return {
      token: envelope.token,
      expiresAt,
      isInternal: organizationList.some((organization) => INTERNAL_COPILOT_ORGANIZATIONS.has(organization)),
      isVscodeTeamMember: organizationList.some((organization) => VSCODE_COPILOT_ORGANIZATIONS.has(organization))
    };
  }
  /**
   * Resolve the concrete CAPI model id for the supplied family (e.g.
   * `gpt-4o-mini`). Cached with the per-GitHub-token CAPI client so
   * endpoint or authentication invalidation also clears the model id.
   */
  async _resolveUtilityModelId(githubToken, modelFamily) {
    const entry = await this._getEntryForToken(githubToken);
    const cached = entry.utilityModelIdsByFamily.get(modelFamily);
    if (cached) {
      return cached;
    }
    const models = await this.models(githubToken);
    const match = models.find((m) => m.capabilities?.family === modelFamily);
    if (!match) {
      throw new Error(`No CAPI model available for family '${modelFamily}'`);
    }
    entry.utilityModelIdsByFamily.set(modelFamily, match.id);
    return match.id;
  }
  // #endregion
  // #region SSE Parsing
  async *_readSSE(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const event = this._parseDataLine(line);
          if (event !== void 0) {
            yield event;
            if (event.type === "message_stop") {
              return;
            }
          }
        }
      }
      if (buffer.trim()) {
        const event = this._parseDataLine(buffer);
        if (event !== void 0) {
          yield event;
          if (event.type === "message_stop") {
            return;
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
      }
      reader.releaseLock();
    }
  }
  /**
   * @returns the parsed stream event, or `undefined` to skip the line.
   * @throws on `error` events from the server.
   */
  _parseDataLine(line) {
    if (!line.startsWith("data: ")) {
      return void 0;
    }
    const data = line.slice("data: ".length).trim();
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      this._logService.warn("[CopilotApiService] Failed to parse SSE data:", data);
      return void 0;
    }
    if (typeof parsed !== "object" || parsed === null) {
      return void 0;
    }
    const record = parsed;
    const type = record.type;
    if (typeof type !== "string") {
      return void 0;
    }
    if (type === "error") {
      const rawError = parsed.error;
      let envelope;
      if (rawError && typeof rawError === "object" && typeof rawError.type === "string" && typeof rawError.message === "string") {
        envelope = parsed;
      } else {
        let errorMessage;
        if (typeof rawError === "string") {
          errorMessage = rawError;
        } else if (typeof rawError?.message === "string") {
          errorMessage = rawError.message;
        } else {
          errorMessage = "Unknown streaming error";
        }
        envelope = {
          type: "error",
          error: { type: "api_error", message: errorMessage },
          request_id: null
        };
      }
      throw new CopilotApiError(COPILOT_API_ERROR_STATUS_STREAMING, envelope);
    }
    if (!KNOWN_SSE_EVENT_TYPES.has(type)) {
      return void 0;
    }
    return parsed;
  }
  // #endregion
};
CopilotApiService = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IAgentHostGitHubEndpointService)
], CopilotApiService);
const KNOWN_SSE_EVENT_TYPES = /* @__PURE__ */ new Set([
  "message_start",
  "message_delta",
  "message_stop",
  "content_block_start",
  "content_block_delta",
  "content_block_stop"
]);
export {
  COPILOT_API_ERROR_STATUS_STREAMING,
  CopilotApiError,
  CopilotApiService,
  ICopilotApiService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzaGFyZWRcXGNvcGlsb3RBcGlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgQW50aHJvcGljIGZyb20gJ0BhbnRocm9waWMtYWkvc2RrJztcbmltcG9ydCB7IENBUElDbGllbnQsIFJlcXVlc3RUeXBlLCB0eXBlIENDQU1vZGVsLCB0eXBlIElFeHRlbnNpb25JbmZvcm1hdGlvbiB9IGZyb20gJ0B2c2NvZGUvY29waWxvdC1hcGknO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBnZXREZXZEZXZpY2VJZCwgZ2V0TWFjaGluZUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL2lkLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4uL2FnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENPUElMT1RfTElDRU5TRV9BR1JFRU1FTlQgfSBmcm9tICcuLi8uLi8uLi9lbmRwb2ludC9jb21tb24vbGljZW5zZUFncmVlbWVudC5qcyc7XG5pbXBvcnQgeyBwYXJzZUNvcGlsb3RUb2tlbkZpZWxkcyB9IGZyb20gJy4uL2NvcGlsb3QvY29waWxvdFRva2VuRmllbGRzLmpzJztcblxuLy8gI3JlZ2lvbiBUeXBlc1xuXG4vKipcbiAqIFBlci1jYWxsIHRyYW5zcG9ydCBvcHRpb25zIGZvciBhbGwge0BsaW5rIElDb3BpbG90QXBpU2VydmljZX0gbWV0aG9kcy5cbiAqXG4gKiBgaGVhZGVyc2AgYXJlIG1lcmdlZCBpbnRvIHRoZSBvdXRnb2luZyBDQVBJIHJlcXVlc3QgYmVmb3JlIHNlY3VyaXR5LVxuICogc2Vuc2l0aXZlIGhlYWRlcnMgKGBBdXRob3JpemF0aW9uYCwgYENvbnRlbnQtVHlwZWAsIGBYLVJlcXVlc3QtSWRgLFxuICogYE9wZW5BSS1JbnRlbnRgKSwgc28gY2FsbGVycyBjYW5ub3Qgb3ZlcnJpZGUgdGhvc2UuXG4gKlxuICogYHNpZ25hbGAgcHJvcGFnYXRlcyB0byB0aGUgb3V0Z29pbmcgQVBJIHJlcXVlc3QgYnV0ICoqbm90KiogdG8gdGhlXG4gKiBzaGFyZWQgdG9rZW4gbWludC4gVGhlIG1pbnQgaXMgZGVkdXBlZCBhY3Jvc3MgY29uY3VycmVudCBjYWxsZXJzLCBzb1xuICogYSBzaW5nbGUgY2FsbGVyJ3MgYWJvcnQgbXVzdCBub3QgY2FuY2VsIGl0IGZvciBldmVyeW9uZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyB7XG5cdHJlYWRvbmx5IGhlYWRlcnM/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+Pjtcblx0cmVhZG9ubHkgc2lnbmFsPzogQWJvcnRTaWduYWw7XG5cblx0LyoqXG5cdCAqIFN1cHByZXNzIHRoZSBgQ29waWxvdC1JbnRlZ3JhdGlvbi1JZGAgaGVhZGVyIG9uIHRoaXMgcmVxdWVzdC5cblx0ICpcblx0ICogV2hlbiB1bnNldCwgYEB2c2NvZGUvY29waWxvdC1hcGlgIGRlcml2ZXMgdGhlIGludGVncmF0aW9uIGlkIGZyb20gdGhlXG5cdCAqIGRpc2NvdmVyZWQgQ29waWxvdCBTS1U6IGEgYG5vX2F1dGhfbGltaXRlZF9jb3BpbG90YCBTS1UgbWFwcyB0b1xuXHQgKiBgdnNjb2RlLW5sYCwgd2hpY2ggdGhlIENBUEkgYmFja2VuZCB0cmVhdHMgYXMgdGhlIGxpbWl0ZWQvbm8tYXV0aFxuXHQgKiBpbnRlZ3JhdGlvbiBhbmQgcmVmdXNlcyBwcmVtaXVtIG1vZGVscyBzdWNoIGFzIGBjbGF1ZGUtb3B1cy00LjdgLlxuXHQgKiBTZXR0aW5nIHRoaXMgdG8gYHRydWVgIG9taXRzIHRoZSBoZWFkZXIgc28gQ0FQSSBhdXRob3JpemVzIGFnYWluc3QgdGhlXG5cdCAqIHRva2VuJ3MgcmVhbCBlbnRpdGxlbWVudC4gTWlycm9ycyB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbidzXG5cdCAqIGBDbGF1ZGVTdHJlYW1pbmdQYXNzVGhyb3VnaEVuZHBvaW50LmdldEVuZHBvaW50RmV0Y2hPcHRpb25zKClgLlxuXHQgKi9cblx0cmVhZG9ubHkgc3VwcHJlc3NJbnRlZ3JhdGlvbklkPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBPbmUgY2hhdCBtZXNzYWdlIGluIGEge0BsaW5rIElDb3BpbG90VXRpbGl0eUNoYXRDb21wbGV0aW9uUmVxdWVzdH0uXG4gKiBNaXJyb3JzIHRoZSBPcGVuQUkgQ2hhdCBDb21wbGV0aW9ucyBtZXNzYWdlIHNoYXBlIENBUEkgYWNjZXB0cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29waWxvdFV0aWxpdHlDaGF0TWVzc2FnZSB7XG5cdHJlYWRvbmx5IHJvbGU6ICdzeXN0ZW0nIHwgJ3VzZXInIHwgJ2Fzc2lzdGFudCc7XG5cdHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBJbnB1dHMgZm9yIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNoYXRDb21wbGV0aW9ufS5cbiAqXG4gKiBDYWxsZXJzIG93biBwcm9tcHQgY29uc3RydWN0aW9uIFx1MjAxNCB0eXBpY2FsbHkgYSBgJ3N5c3RlbSdgIHJ1bGVzIG1lc3NhZ2VcbiAqIGZvbGxvd2VkIGJ5IG9uZSBvciBtb3JlIGAndXNlcidgIG1lc3NhZ2VzLCBtYXRjaGluZyB0aGUgQ29waWxvdCBDaGF0XG4gKiBleHRlbnNpb24ncyBgY29waWxvdC11dGlsaXR5LXNtYWxsYCBwcm9tcHRzIChzZWVcbiAqIGBHaXRDb21taXRNZXNzYWdlUHJvbXB0YCdzIGBTeXN0ZW1NZXNzYWdlYCArIGBVc2VyTWVzc2FnZWAgcGFpcikuIFRoaXNcbiAqIHNlcnZpY2UgZm9yd2FyZHMgdGhlIG1lc3NhZ2VzIGFuZCByZXR1cm5zIHRoZSBhc3Npc3RhbnQgdGV4dC5cbiAqXG4gKiBgdGVtcGVyYXR1cmVgIGRlZmF1bHRzIHRvIGAwLjFgIChtYXRjaGluZyB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbidzXG4gKiBkZWZhdWx0IGBJQ29udmVyc2F0aW9uT3B0aW9ucy50ZW1wZXJhdHVyZWApLiBgdG9wX3BgIGFuZCB0aGUgbW9kZWwgZmFtaWx5XG4gKiBhcmUgZml4ZWQgZGVmYXVsdHMgaW5zaWRlIHRoZSBzZXJ2aWNlLiBDYWxsZXJzIG1heSBzZXQgYG1heFRva2Vuc2Agd2hlblxuICogdGhlaXIgdXRpbGl0eSBmbG93IGhhcyBhIG5hdHVyYWxseSBib3VuZGVkIG91dHB1dC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3Qge1xuXHRyZWFkb25seSBtZXNzYWdlczogcmVhZG9ubHkgSUNvcGlsb3RVdGlsaXR5Q2hhdE1lc3NhZ2VbXTtcblx0cmVhZG9ubHkgdGVtcGVyYXR1cmU/OiBudW1iZXI7XG5cdHJlYWRvbmx5IG1heFRva2Vucz86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBTdWJzZXQgb2YgdGhlIEdpdEh1YiBgY29waWxvdF9pbnRlcm5hbC91c2VyYCByZXNwb25zZSB3ZSBjYXJlIGFib3V0LlxuICogVGhlIGZ1bGwgcGF5bG9hZCBjYXJyaWVzIGVudGl0bGVtZW50IGluZm87IHdlIG9ubHkgbmVlZCBgZW5kcG9pbnRzYCAoZm9yXG4gKiByb3V0aW5nIENBUEkgcmVxdWVzdHMpIGFuZCBgYWNjZXNzX3R5cGVfc2t1YCAod2hpY2ggYENBUElDbGllbnQudXBkYXRlRG9tYWluc2BcbiAqIHN0YW1wcyBvbnRvIHJlcXVlc3RzKS5cbiAqL1xuaW50ZXJmYWNlIElDb3BpbG90VXNlclJlc3BvbnNlIHtcblx0cmVhZG9ubHkgbG9naW4/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvcGlsb3RpZ25vcmVfZW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGVuZHBvaW50cz86IHtcblx0XHRyZWFkb25seSBhcGk/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdGVsZW1ldHJ5Pzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHByb3h5Pzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5ICdvcmlnaW4tdHJhY2tlcic/OiBzdHJpbmc7XG5cdH07XG5cdHJlYWRvbmx5IGFjY2Vzc190eXBlX3NrdT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElDYWNoZWRDbGllbnQge1xuXHRyZWFkb25seSBjYXBpQ2xpZW50OiBDQVBJQ2xpZW50O1xuXHRyZWFkb25seSBleHBpcmVzQXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgdXRpbGl0eU1vZGVsSWRzQnlGYW1pbHk6IE1hcDxzdHJpbmcsIHN0cmluZz47XG5cdC8qKiBUaGUgcmF3IENvcGlsb3QgZW50aXRsZW1lbnQgU0tVIHJldHVybmVkIGJ5IGAvY29waWxvdF9pbnRlcm5hbC91c2VyYCwgd2hlbiBwcmVzZW50LiAqL1xuXHRyZWFkb25seSBjb3BpbG90U2t1Pzogc3RyaW5nO1xuXHQvKiogR2l0SHViIGxvZ2luIHJldHVybmVkIGJ5IGAvY29waWxvdF9pbnRlcm5hbC91c2VyYCwgd2hlbiBwcmVzZW50LiAqL1xuXHRyZWFkb25seSBsb2dpbj86IHN0cmluZztcblx0LyoqIFRoZSBDQVBJIGBlbmRwb2ludHMudGVsZW1ldHJ5YCBiYXNlIFVSTCBkaXNjb3ZlcmVkIGZvciB0aGlzIHRva2VuLCBpZiBhbnkuICovXG5cdHJlYWRvbmx5IHRlbGVtZXRyeUVuZHBvaW50Pzogc3RyaW5nO1xuXHQvKiogVGhlIENBUEkgYGVuZHBvaW50cy5hcGlgIGJhc2UgVVJMIGRpc2NvdmVyZWQgKG9yIG92ZXJyaWRkZW4pIGZvciB0aGlzIHRva2VuLCBpZiBhbnkuICovXG5cdHJlYWRvbmx5IGFwaUVuZHBvaW50Pzogc3RyaW5nO1xuXHRyZWFkb25seSBjb3BpbG90SWdub3JlRW5hYmxlZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogU3Vic2V0IG9mIHRoZSBgUmVxdWVzdFR5cGUuQ29waWxvdFRva2VuYCBtaW50IHJlc3BvbnNlIHdlIGNhcmUgYWJvdXQuXG4gKi9cbmludGVyZmFjZSBJQ29waWxvdFRva2VuRW52ZWxvcGUge1xuXHRyZWFkb25seSB0b2tlbj86IHVua25vd247XG5cdHJlYWRvbmx5IGV4cGlyZXNfYXQ/OiB1bmtub3duO1xuXHRyZWFkb25seSByZWZyZXNoX2luPzogdW5rbm93bjtcblx0cmVhZG9ubHkgb3JnYW5pemF0aW9uX2xpc3Q/OiB1bmtub3duO1xufVxuXG4vKiogUGVyLUdpdEh1Yi10b2tlbiBDb3BpbG90IHNlc3Npb24gdG9rZW4gY2FjaGUgZW50cnkuICovXG5pbnRlcmZhY2UgSUNhY2hlZENvcGlsb3RUb2tlbiB7XG5cdHJlYWRvbmx5IHRva2VuOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4cGlyZXNBdDogbnVtYmVyO1xuXHRyZWFkb25seSBpc0ludGVybmFsOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1ZzY29kZVRlYW1NZW1iZXI6IGJvb2xlYW47XG59XG5cbi8qKlxuICogTWVtb2l6ZWQgcGFydHMgb2YgYENBUElDbGllbnRgIGNvbnN0cnVjdGlvbiB0aGF0IGRvbid0IGRlcGVuZCBvbiB0aGUgdXNlclxuICogdG9rZW4uIEJ1aWx0IG9uY2UgYW5kIHJldXNlZCBieSBldmVyeSBwZXItdG9rZW4gY2xpZW50LlxuICovXG5pbnRlcmZhY2UgSUNhcGlCYXNlIHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSW5mbzogSUV4dGVuc2lvbkluZm9ybWF0aW9uO1xuXHRyZWFkb25seSB1c2VyVXJsOiBzdHJpbmc7XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBDb25zdGFudHNcblxuLyoqXG4gKiBTZW50aW5lbCB7QGxpbmsgQ29waWxvdEFwaUVycm9yLnN0YXR1c30gdXNlZCB3aGVuIHRoZSBlcnJvciBjYW1lIGZyb20gYVxuICogbWlkLXN0cmVhbSBTU0UgYGV2ZW50OiBlcnJvcmAgZnJhbWUgcmF0aGVyIHRoYW4gYW4gSFRUUCBub24tMnh4IHJlc3BvbnNlLlxuICogVGhlIHVwc3RyZWFtIEhUVFAgc3RhdHVzIHdhcyAyMDAgKHRoZSBzdHJlYW0gaGFkIGFscmVhZHkgc3RhcnRlZCk7IHRoZVxuICogcmVhbCBIVFRQIHN0YXR1cyBpcyBubyBsb25nZXIgbWVhbmluZ2Z1bCwgc28gY29uc3VtZXJzIHRoYXQgbmVlZCBhbiBIVFRQXG4gKiBzdGF0dXMgY29kZSAoZS5nLiB3aGVuIHJlLWVtaXR0aW5nIGJlZm9yZSBoZWFkZXJzIGFyZSBzZW50KSBzaG91bGQgbm90XG4gKiB0cnVzdCB0aGlzIHZhbHVlLiBVc2UgYGVudmVsb3BlLmVycm9yLnR5cGVgIGluc3RlYWQuXG4gKi9cbmV4cG9ydCBjb25zdCBDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HID0gNTIwO1xuXG4vKipcbiAqIFJlLXJlc29sdmUgdGhlIENBUEkgZW5kcG9pbnQgZGlzY292ZXJ5IHRoaXMgbWFueSBzZWNvbmRzIGJlZm9yZSB0aGUgY2FjaGVcbiAqIGVudHJ5J3Mgbm90aW9uYWwgZXhwaXJ5LiBUaGUgYC9jb3BpbG90X2ludGVybmFsL3VzZXJgIHJlc3BvbnNlIGl0c2VsZlxuICogY2FycmllcyBubyBleHBpcnksIHNvIHdlIGFwcGx5IGEgZml4ZWQgVFRMIGFuZCByZWZyZXNoIGFoZWFkIG9mIGl0LlxuICovXG5jb25zdCBDQVBJX0NPTlRFWFRfUkVGUkVTSF9CVUZGRVJfU0VDT05EUyA9IDUgKiA2MDtcblxuLyoqIENvbnNlcnZhdGl2ZSBUVEwgZm9yIHRoZSBgL2NvcGlsb3RfaW50ZXJuYWwvdXNlcmAgZGlzY292ZXJ5IHJlc3VsdC4gKi9cbmNvbnN0IENBUElfQ09OVEVYVF9UVExfU0VDT05EUyA9IDMwICogNjA7XG5cbmNvbnN0IFVTRVJfQVBJX1ZFUlNJT04gPSAnMjAyNS0wNC0wMSc7XG5cbi8qKlxuICogVGVzdC9kZWJ1ZyBvdmVycmlkZSBmb3IgdGhlIENBUEkgYmFzZSBVUkwuIFdoZW4gc2V0IHRvIGEgKipsb29wYmFjayoqIFVSTCxcbiAqIHtAbGluayBDb3BpbG90QXBpU2VydmljZX0gc2tpcHMgdGhlIGBhcGkuZ2l0aHViLmNvbS9jb3BpbG90X2ludGVybmFsL3VzZXJgXG4gKiBlbmRwb2ludC1kaXNjb3Zlcnkgcm91bmQtdHJpcCAod2hpY2ggcmVxdWlyZXMgYSByZWFsIEdpdEh1YiB0b2tlbikgYW5kIHJvdXRlc1xuICogZXZlcnkgQ0FQSSByZXF1ZXN0IFx1MjAxNCBgbW9kZWxzYCwgYHJlc3BvbnNlc2AsIGBtZXNzYWdlc2AgXHUyMDE0IHN0cmFpZ2h0IGF0IHRoaXMgVVJMXG4gKiBpbnN0ZWFkLiBPbmx5IGV2ZXIgc2V0IGJ5IHRoZSBzbW9rZS10ZXN0IGhhcm5lc3MgKHNlZSBgc2V0dXBBZ2VudEhvc3RTdWl0ZWApXG4gKiBzbyB0aGUgYWdlbnQgaG9zdCdzIHNoYXJlZCBDQVBJIGNsaWVudCBjYW4gdGFsayB0byB0aGUgbW9jayBMTE0gc2VydmVyOyBuZXZlclxuICogc2V0IGluIHByb2R1Y3Rpb24sIHNvIG5vcm1hbCBwZXItdG9rZW4gZGlzY292ZXJ5IGlzIHVuY2hhbmdlZC5cbiAqXG4gKiBUaGUgb3ZlcnJpZGUgaXMgcmVzdHJpY3RlZCB0byBsb29wYmFjayBob3N0cywgcGx1cyB0aGUgcmVzZXJ2ZWRcbiAqIGB2c2NvZGUtc21va2UudGVzdGAgaG9zdCB3aGVuIHRoZSBzbW9rZSBwcm94eSBtYXJrZXIgaXMgcHJlc2VudC4gU3Vic2VxdWVudFxuICogQ0FQSSBjYWxscyBjYXJyeSB0aGUgdXNlcidzIEdpdEh1YiBiZWFyZXIgdG9rZW4sIHNvIGV2ZXJ5IG90aGVyIG5vbi1sb29wYmFja1xuICogb3IgdW5wYXJzZWFibGUgdmFsdWUgaXMgaWdub3JlZCB0byBwcmV2ZW50IHRva2VuIGV4ZmlsdHJhdGlvbi5cbiAqL1xuY29uc3QgQ0FQSV9VUkxfT1ZFUlJJREVfRU5WID0gJ1ZTQ09ERV9BR0VOVF9IT1NUX0NBUElfVVJMX09WRVJSSURFJztcbmNvbnN0IENBUElfVVJMX09WRVJSSURFX1NNT0tFX1RFU1RfSE9TVCA9ICd2c2NvZGUtc21va2UudGVzdCc7XG5jb25zdCBDQVBJX1VSTF9PVkVSUklERV9TTU9LRV9URVNUX0VOViA9ICdWU0NPREVfU01PS0VfVEVTVF9QUk9YWV9IRUFERVInO1xuY29uc3QgR0lUSFVCX0FQSV9VUkxfT1ZFUlJJREVfRU5WID0gJ0NPUElMT1RfREVCVUdfR0lUSFVCX0FQSV9VUkwnO1xuXG4vKiogVHJ1ZSBpZmYgYHVybGAgcGFyc2VzIGFuZCBpdHMgaG9zdCBpcyBhIGxvb3BiYWNrIGFkZHJlc3MgKGxvY2FsaG9zdCAvIDEyNy4wLjAuMC84IC8gOjoxKS4gKi9cbmZ1bmN0aW9uIGlzTG9vcGJhY2tVcmwodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcblx0bGV0IGhvc3RuYW1lOiBzdHJpbmc7XG5cdHRyeSB7XG5cdFx0aG9zdG5hbWUgPSBuZXcgVVJMKHVybCkuaG9zdG5hbWU7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHQvLyBTdHJpcCBJUHY2IGJyYWNrZXRzIGlmIHByZXNlbnQgKGUuZy4gYFs6OjFdYCkuXG5cdGNvbnN0IGhvc3QgPSBob3N0bmFtZS5yZXBsYWNlKC9eXFxbfFxcXSQvZywgJycpLnRvTG93ZXJDYXNlKCk7XG5cdHJldHVybiBob3N0ID09PSAnbG9jYWxob3N0JyB8fCBob3N0ID09PSAnOjoxJyB8fCAvXjEyNyg/OlxcLlxcZHsxLDN9KXszfSQvLnRlc3QoaG9zdCk7XG59XG5cbmZ1bmN0aW9uIGlzQWxsb3dlZENhcGlVcmxPdmVycmlkZSh1cmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoaXNMb29wYmFja1VybCh1cmwpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKCFwcm9jZXNzLmVudltDQVBJX1VSTF9PVkVSUklERV9TTU9LRV9URVNUX0VOVl0pIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0dHJ5IHtcblx0XHRyZXR1cm4gbmV3IFVSTCh1cmwpLmhvc3RuYW1lLnRvTG93ZXJDYXNlKCkgPT09IENBUElfVVJMX09WRVJSSURFX1NNT0tFX1RFU1RfSE9TVDtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbi8qKlxuICogUmUtbWludCB0aGUgQ29waWxvdCBzZXNzaW9uIHRva2VuIHRoaXMgbWFueSBzZWNvbmRzIGJlZm9yZSBpdHNcbiAqIHNlcnZlci1yZXBvcnRlZCBgZXhwaXJlc19hdGAsIG1pcnJvcmluZyB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbidzXG4gKiBgUmVmcmVzaGFibGVDb3BpbG90VG9rZW5NYW5hZ2VyYCA1LW1pbnV0ZSByZWZyZXNoIGJ1ZmZlci5cbiAqL1xuY29uc3QgQ09QSUxPVF9UT0tFTl9SRUZSRVNIX0JVRkZFUl9TRUNPTkRTID0gNSAqIDYwO1xuXG4vKipcbiAqIERlZmF1bHQgQ0FQSSBtb2RlbCBmYW1pbHkgZm9yIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNoYXRDb21wbGV0aW9ufS5cbiAqIE1hdGNoZXMgdGhlIENvcGlsb3QgQ2hhdCBleHRlbnNpb24ncyBgY29waWxvdC11dGlsaXR5LXNtYWxsYCByZXNvbHZlclxuICogKGBDb3BpbG90VXRpbGl0eVNtYWxsQ2hhdEVuZHBvaW50LmNhcGlGYW1pbHkgPT09IENIQVRfTU9ERUwuR1BUNE9NSU5JYCkuXG4gKi9cbmNvbnN0IFVUSUxJVFlfREVGQVVMVF9NT0RFTF9GQU1JTFkgPSAnZ3B0LTRvLW1pbmknO1xuXG4vKipcbiAqIERlZmF1bHQgYHRlbXBlcmF0dXJlYCBmb3IgdXRpbGl0eSBjaGF0IGNvbXBsZXRpb25zLiBNYXRjaGVzIHRoZSBDb3BpbG90XG4gKiBDaGF0IGV4dGVuc2lvbidzIGRlZmF1bHQgYElDb252ZXJzYXRpb25PcHRpb25zLnRlbXBlcmF0dXJlYC5cbiAqL1xuY29uc3QgVVRJTElUWV9ERUZBVUxUX1RFTVBFUkFUVVJFID0gMC4xO1xuXG4vKipcbiAqIERlZmF1bHQgYHRvcF9wYCBmb3IgdXRpbGl0eSBjaGF0IGNvbXBsZXRpb25zLiBNYXRjaGVzIHRoZSBDb3BpbG90IENoYXRcbiAqIGV4dGVuc2lvbidzIGRlZmF1bHQgYElDb252ZXJzYXRpb25PcHRpb25zLnRvcFBgLlxuICovXG5jb25zdCBVVElMSVRZX0RFRkFVTFRfVE9QX1AgPSAxO1xuXG4vKipcbiAqIGBPcGVuQUktSW50ZW50YCB2YWx1ZSBmb3IgdXRpbGl0eSBjaGF0IGNvbXBsZXRpb25zLiBNYXRjaGVzIHRoZSBleHRlbnNpb25cbiAqIHZvY2FidWxhcnkgYCdjb252ZXJzYXRpb24tYmFja2dyb3VuZCdgIGZvciBub24tdXNlci1pbml0aWF0ZWQgdXRpbGl0eVxuICogY2FsbHMgKGNoYXQgdGl0bGUgZ2VuZXJhdGlvbiwgY29tbWl0IG1lc3NhZ2VzLCBicmFuY2ggbmFtZXMsIGV0Yy4pLlxuICovXG5jb25zdCBVVElMSVRZX0lOVEVOVCA9ICdjb252ZXJzYXRpb24tYmFja2dyb3VuZCc7XG5cbmNvbnN0IElOVEVSTkFMX0NPUElMT1RfT1JHQU5JWkFUSU9OUyA9IG5ldyBTZXQoW1xuXHQnNDUzNWM3YmVmZmM4NDRiNDZiYjFlZDRhYTA0ZDc1OWEnLFxuXHQnYTVkYjBiY2FhZTk0MDMyZmU3MTVmYjM0YTVlNGJjZTInLFxuXHQnNzE4NGY2NmRmY2VlOThjYjVmMDhhMWNiOTM2ZDUyMjUnLFxuXHQnMWNiMThhYzZlZWRkNDliNDNkNzRhMWM1YmViMGI5NTUnLFxuXHQnZWE5Mzk1YjlhOTI0OGMwNWVlNjg0N2NiZDI0MzU1ZWQnLFxuXSk7XG5jb25zdCBWU0NPREVfQ09QSUxPVF9PUkdBTklaQVRJT05TID0gbmV3IFNldChbJzU1MWNjYTYwY2UxOTY1NGQ4OTRlNzg2MjIwODIyNDgyJ10pO1xuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gRXJyb3JzXG5cbi8qKlxuICogVGhyb3duIGJ5IHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2V9IHdoZW4gQ0FQSSByZXR1cm5zIGFuIEFudGhyb3BpYy1mb3JtYXRcbiAqIEFQSSBlcnJvciBcdTIwMTQgZWl0aGVyIGFzIGEgbm9uLTJ4eCBIVFRQIHJlc3BvbnNlIG9yIGFzIGEgbWlkLXN0cmVhbVxuICogYGV2ZW50OiBlcnJvcmAgU1NFIGZyYW1lLiBDYXJyaWVzIGVub3VnaCBpbmZvcm1hdGlvbiBmb3IgdGhlIFBoYXNlIDJcbiAqIENsYXVkZSBwcm94eSB0byByZS1lbWl0IHRoZSBlcnJvciBwYXNzdGhyb3VnaCB3aXRob3V0IHJlLW1hcHBpbmcuXG4gKlxuICogTmV0d29yay90cmFuc3BvcnQgZmFpbHVyZXMgKGNvbm5lY3Rpb24gcmVzZXQsIEROUyBmYWlsdXJlLCBldGMuKSBhcmVcbiAqICoqbm90Kiogd3JhcHBlZCBhcyBgQ29waWxvdEFwaUVycm9yYCBcdTIwMTQgdGhleSBwcm9wYWdhdGUgYXMgcmF3IGBmZXRjaGBcbiAqIHJlamVjdGlvbnMgc28gY29uc3VtZXJzIGNhbiBkaXN0aW5ndWlzaCBBUEkgZXJyb3JzIGZyb20gdHJhbnNwb3J0IGVycm9ycy5cbiAqL1xuZXhwb3J0IGNsYXNzIENvcGlsb3RBcGlFcnJvciBleHRlbmRzIEVycm9yIHtcblxuXHQvKipcblx0ICogQHBhcmFtIHN0YXR1cyBIVFRQIHN0YXR1cyBmcm9tIHRoZSBvcmlnaW5hdGluZyBDQVBJIHJlc3BvbnNlLCBvclxuXHQgKiAgIHtAbGluayBDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HfSBmb3IgbWlkLXN0cmVhbSBTU0UgZXJyb3JzLlxuXHQgKiBAcGFyYW0gZW52ZWxvcGUgQW50aHJvcGljLWZvcm1hdCBlcnJvciBlbnZlbG9wZS4gRm9yIEhUVFAgZXJyb3JzIHdpdGggYVxuXHQgKiAgIG5vbi1jb25mb3JtaW5nIGJvZHkgKHBsYWluIHRleHQsIG1hbGZvcm1lZCBKU09OLCBtaXNzaW5nIGZpZWxkcykgdGhpc1xuXHQgKiAgIGlzIHN5bnRoZXNpemVkOyBmb3IgY29uZm9ybWluZyBib2RpZXMgYW5kIFNTRSBmcmFtZXMgaXQgaXMgdGhlXG5cdCAqICAgc2VydmVyJ3MgZW52ZWxvcGUgdmVyYmF0aW0uXG5cdCAqIEBwYXJhbSBtZXNzYWdlIE9wdGlvbmFsIG92ZXJyaWRlIGZvciBgRXJyb3IubWVzc2FnZWAuIERlZmF1bHRzIHRvXG5cdCAqICAgYGVudmVsb3BlLmVycm9yLm1lc3NhZ2VgLiAqKk5ldmVyIGluY2x1ZGVzIGF1dGggdG9rZW5zLioqXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzdGF0dXM6IG51bWJlcixcblx0XHRyZWFkb25seSBlbnZlbG9wZTogQW50aHJvcGljLkVycm9yUmVzcG9uc2UsXG5cdFx0bWVzc2FnZT86IHN0cmluZyxcblx0KSB7XG5cdFx0c3VwZXIobWVzc2FnZSA/PyBlbnZlbG9wZS5lcnJvci5tZXNzYWdlKTtcblx0XHR0aGlzLm5hbWUgPSAnQ29waWxvdEFwaUVycm9yJztcblx0fVxufVxuXG4vKipcbiAqIEJ1aWxkIGEge0BsaW5rIENvcGlsb3RBcGlFcnJvcn0gZnJvbSBhIENBUEkgSFRUUCByZXNwb25zZSBib2R5LiBJZiB0aGVcbiAqIGJvZHkgcGFyc2VzIGFzIGEgY29uZm9ybWluZyBBbnRocm9waWMgZW52ZWxvcGUsIGl0IGlzIHVzZWQgdmVyYmF0aW07XG4gKiBvdGhlcndpc2UgYSBzeW50aGV0aWMgZW52ZWxvcGUgaXMgY29uc3RydWN0ZWQgd2l0aCBgZXJyb3IudHlwZTpcbiAqICdhcGlfZXJyb3InYCBhbmQgdGhlIHJlc3BvbnNlIGJvZHkgYXMgYGVycm9yLm1lc3NhZ2VgIChvciBzdGF0dXMgdGV4dFxuICogd2hlbiB0aGUgYm9keSBpcyBlbXB0eSkuIFRoZSByZXR1cm5lZCBlcnJvcidzIGBtZXNzYWdlYCBkZWxpYmVyYXRlbHlcbiAqIG1pcnJvcnMgdGhlIG9yaWdpbmFsIGBcIjxwcmVmaXg+OiA8c3RhdHVzPiA8c3RhdHVzVGV4dD5cImAgZm9ybWF0IHNvXG4gKiBleGlzdGluZyBsb2ctbGluZSBjb25zdW1lcnMgY29udGludWUgdG8gcmVhZCBpZGVudGlmaWFibHkuIGBwcmVmaXhgXG4gKiBkZWZhdWx0cyB0byBgXCJDQVBJIHJlcXVlc3QgZmFpbGVkXCJgICh0aGUgaGlzdG9yaWNhbCB3b3JkaW5nIGZvclxuICogYG1lc3NhZ2VzYCk7IHBhc3MgYFwiQ0FQSSBtb2RlbHMgcmVxdWVzdCBmYWlsZWRcImAgZm9yIHRoZSBgbW9kZWxzKClgIHBhdGguXG4gKi9cbmZ1bmN0aW9uIGJ1aWxkQ29waWxvdEFwaUh0dHBFcnJvcihzdGF0dXM6IG51bWJlciwgc3RhdHVzVGV4dDogc3RyaW5nLCBib2R5VGV4dDogc3RyaW5nLCBwcmVmaXggPSAnQ0FQSSByZXF1ZXN0IGZhaWxlZCcpOiBDb3BpbG90QXBpRXJyb3Ige1xuXHRsZXQgZW52ZWxvcGU6IEFudGhyb3BpYy5FcnJvclJlc3BvbnNlIHwgdW5kZWZpbmVkO1xuXHRpZiAoYm9keVRleHQpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShib2R5VGV4dCkgYXMgdW5rbm93bjtcblx0XHRcdGlmIChcblx0XHRcdFx0cGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09ICdvYmplY3QnXG5cdFx0XHRcdCYmIChwYXJzZWQgYXMgeyB0eXBlPzogdW5rbm93biB9KS50eXBlID09PSAnZXJyb3InXG5cdFx0XHQpIHtcblx0XHRcdFx0Y29uc3QgZXJyID0gKHBhcnNlZCBhcyB7IGVycm9yPzogdW5rbm93biB9KS5lcnJvcjtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdGVyciAmJiB0eXBlb2YgZXJyID09PSAnb2JqZWN0J1xuXHRcdFx0XHRcdCYmIHR5cGVvZiAoZXJyIGFzIHsgdHlwZT86IHVua25vd24gfSkudHlwZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHQmJiB0eXBlb2YgKGVyciBhcyB7IG1lc3NhZ2U/OiB1bmtub3duIH0pLm1lc3NhZ2UgPT09ICdzdHJpbmcnXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGVudmVsb3BlID0gcGFyc2VkIGFzIEFudGhyb3BpYy5FcnJvclJlc3BvbnNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBub24tSlNPTiBib2R5IFx1MjAxNCBmYWxsIHRocm91Z2ggdG8gc3ludGhlc2lzXG5cdFx0fVxuXHR9XG5cdGlmICghZW52ZWxvcGUpIHtcblx0XHRlbnZlbG9wZSA9IHtcblx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRlcnJvcjoge1xuXHRcdFx0XHR0eXBlOiAnYXBpX2Vycm9yJyxcblx0XHRcdFx0bWVzc2FnZTogYm9keVRleHQgfHwgYCR7c3RhdHVzfSAke3N0YXR1c1RleHR9YCxcblx0XHRcdH0sXG5cdFx0XHRyZXF1ZXN0X2lkOiBudWxsLFxuXHRcdH07XG5cdH1cblx0cmV0dXJuIG5ldyBDb3BpbG90QXBpRXJyb3IoXG5cdFx0c3RhdHVzLFxuXHRcdGVudmVsb3BlLFxuXHRcdGAke3ByZWZpeH06ICR7c3RhdHVzfSAke3N0YXR1c1RleHR9IFxcdTIwMTQgJHtlbnZlbG9wZS5lcnJvci5tZXNzYWdlfWAsXG5cdCk7XG59XG5cbi8vICNlbmRyZWdpb25cblxuZXhwb3J0IHR5cGUgRmV0Y2hGdW5jdGlvbiA9IHR5cGVvZiBnbG9iYWxUaGlzLmZldGNoO1xuXG5leHBvcnQgY29uc3QgSUNvcGlsb3RBcGlTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDb3BpbG90QXBpU2VydmljZT4oJ2NvcGlsb3RBcGlTZXJ2aWNlJyk7XG5cbi8qKlxuICogRm91bmRhdGlvbmFsIGdhdGV3YXkgYmV0d2VlbiB0aGUgYWdlbnQgaG9zdCBhbmQgR2l0SHViIENvcGlsb3QncyBDQVBJIHByb3h5XG4gKiBmb3IgQW50aHJvcGljLXN0eWxlIGNoYXQgY29tcGxldGlvbnMgYW5kIG1vZGVsIGRpc2NvdmVyeS5cbiAqXG4gKiAjIyBHb2Fsc1xuICpcbiAqIDEuICoqU2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3IgQ0FQSSBhdXRoLioqIENhbGxlcnMgcGFzcyBhIHJhdyBHaXRIdWIgdG9rZW5cbiAqICAgIGFuZCBuZXZlciBkZWFsIHdpdGggZW5kcG9pbnQgZGlzY292ZXJ5IG9yIHJvdXRpbmcgdGhlbXNlbHZlcy5cbiAqIDIuICoqU3RhYmxlIHN1cmZhY2UgZm9yIGNoYXQgYWdlbnRzLioqIEEgc21hbGwsIHR5cGVkIEFQSSB0aGF0IGFic3RyYWN0cyB0aGVcbiAqICAgIHVuZGVybHlpbmcgYENBUElDbGllbnRgLCBTU0UgZnJhbWluZywgYW5kIEFudGhyb3BpYyBldmVudCB0YXhvbm9teSBzb1xuICogICAgZmVhdHVyZSBjb2RlIGNhbiBmb2N1cyBvbiBwcm9tcHRpbmcuXG4gKiAzLiAqKlJlc291cmNlLXNhZmUgc3RyZWFtaW5nLioqIEFzeW5jLWdlbmVyYXRvciBvdXRwdXQgdGhhdCBmdWxseSByZWxlYXNlc1xuICogICAgdGhlIHVuZGVybHlpbmcgSFRUUCBjb25uZWN0aW9uIHJlZ2FyZGxlc3Mgb2YgaG93IHRoZSBjb25zdW1lciB0ZXJtaW5hdGVzXG4gKiAgICBpdGVyYXRpb24gKGVhcmx5IGBicmVha2AsIHRocm93biBlcnJvciwgYWJvcnQsIG9yIG5hdHVyYWwgZW5kLW9mLXN0cmVhbSkuXG4gKiA0LiAqKlNrZXctIGFuZCByZXZvY2F0aW9uLXRvbGVyYW50IGNvbnRleHQgY2FjaGUuKiogRW5kcG9pbnQvc2t1IGRpc2NvdmVyeVxuICogICAgc3RheXMgY2FjaGVkIGFzIGxvbmcgYXMgaXQncyB1c2FibGUgYW5kIGlzIGludmFsaWRhdGVkIGltbWVkaWF0ZWx5IG9uXG4gKiAgICBgNDAxYC9gNDAzYCBzbyBjYWxsZXJzIHNlbGYtaGVhbCB3aXRob3V0IHJlc3RhcnRpbmcgdGhlIGhvc3QuXG4gKlxuICogIyMgQXV0aCBzdHJhdGVneVxuICpcbiAqIFRoZSBHaXRIdWIgdXNlciB0b2tlbiBJUyB0aGUgY3JlZGVudGlhbC4gVGhlcmUgaXMgbm8gQ29waWxvdCBzZXNzaW9uLXRva2VuXG4gKiBtaW50OyB3ZSBzZW5kIGBBdXRob3JpemF0aW9uOiBCZWFyZXIgPGdpdGh1Yi10b2tlbj5gIGRpcmVjdGx5IHRvIENBUEknc1xuICogYC92MS9tZXNzYWdlc2AgYW5kIGAvbW9kZWxzYCBlbmRwb2ludHMuIFRoaXMgbWlycm9ycyB3aGF0IHRoZVxuICogYEBnaXRodWIvY29waWxvdGAgQ0xJIGRvZXMgKHNlZSBgZmV0Y2hDb3BpbG90VXNlcmAgYW5kXG4gKiBgQ29waWxvdEFudGhyb3BpY0NsaWVudC5jcmVhdGVXaXRoT0F1dGhUb2tlbmAgaW4gYGdpdGh1Yi9jb3BpbG90LWFnZW50LXJ1bnRpbWVgKS5cbiAqXG4gKiBUaGUgYGVuZHBvaW50cy5hcGlgIFVSTCBDQVBJIHJlcXVlc3RzIGFyZSByb3V0ZWQgdG8gaXMgZGlzY292ZXJlZCBwZXItdG9rZW5cbiAqIGJ5IGNhbGxpbmcgYEdFVCAvY29waWxvdF9pbnRlcm5hbC91c2VyYCBvbmNlIGFuZCBjYWNoaW5nIHRoZSByZXN1bHQuIFRoaXNcbiAqIHdvcmtzIGZvciBib3RoIGNvbnN1bWVyIChgYXBpLmdpdGh1YmNvcGlsb3QuY29tYCkgYW5kIEVudGVycHJpc2VcbiAqIChgYXBpLmVudGVycHJpc2UuZ2l0aHViY29waWxvdC5jb21gKSBhY2NvdW50cyB3aXRob3V0IGNvbmZpZ3VyYXRpb24uXG4gKlxuICoge0BsaW5rIHV0aWxpdHlDaGF0Q29tcGxldGlvbn0gaXMgdGhlIG9uZSBleGNlcHRpb24gdG8gdGhlXG4gKiBHaXRIdWItdG9rZW4tSVMtdGhlLWNyZWRlbnRpYWwgcnVsZTogQ0FQSSdzIGAvY2hhdC9jb21wbGV0aW9uc2AgZW5kcG9pbnRcbiAqIGV4cGVjdHMgYSBDb3BpbG90IHNlc3Npb24gdG9rZW4gKHRoZSBzYW1lIG9uZSB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvblxuICogbWludHMgdmlhIGBSZXF1ZXN0VHlwZS5Db3BpbG90VG9rZW5gKS4gVGhlIHNlcnZpY2UgbWludHMgaXQgaW50ZXJuYWxseVxuICogZnJvbSB0aGUgc3VwcGxpZWQgR2l0SHViIHRva2VuLCBjYWNoZXMgaXQgcGVyLXRva2VuIGFsb25nc2lkZSB0aGVcbiAqIHJlc29sdmVkIHV0aWxpdHkgbW9kZWwgaWQsIGFuZCByZWZyZXNoZXMgYWhlYWQgb2YgZXhwaXJ5LlxuICpcbiAqICMjIE5vbi1nb2Fsc1xuICpcbiAqIC0gUGVyLWNvbnZlcnNhdGlvbiBoaXN0b3J5LCByZXRyeS9iYWNrb2ZmLCBvciByYXRlLWxpbWl0IGhhbmRsaW5nLiBDYWxsZXJzXG4gKiAgIG93biByZXF1ZXN0IG9yY2hlc3RyYXRpb24uXG4gKlxuICogIyMgQ29uY3VycmVuY3kgbW9kZWxcbiAqXG4gKiAtIEVhY2ggY2FjaGVkIGVudHJ5IGlzIGEgKipkaXN0aW5jdCB7QGxpbmsgQ0FQSUNsaWVudH0gaW5zdGFuY2UqKiB3aXRoIGl0c1xuICogICBvd24gZGlzY292ZXJlZCBkb21haW4gc3RhdGUuIENvbmN1cnJlbnQgaW4tZmxpZ2h0IHJlcXVlc3RzIGZvciB0d29cbiAqICAgZGlmZmVyZW50IEdpdEh1YiB0b2tlbnMgY2Fubm90IHRyYW1wbGUgZWFjaCBvdGhlcidzIGBlbmRwb2ludHMuYXBpYCBcdTIwMTRcbiAqICAgdG9rZW4gQSdzIHJlcXVlc3Qgd2lsbCBhbHdheXMgcm91dGUgdGhyb3VnaCB0aGUgY2xpZW50IGJ1aWx0IGZvciBBLlxuICogLSBNdWx0aXBsZSBpbi1mbGlnaHQgcmVxdWVzdHMgZm9yIHRoZSAqKnNhbWUqKiBHaXRIdWIgdG9rZW4gc2hhcmUgYSBzaW5nbGVcbiAqICAgZW5kcG9pbnQtZGlzY292ZXJ5IGNhbGwgdmlhIHRoZSBwZXItdG9rZW4gY2FjaGUgbWFwIChubyB0aHVuZGVyaW5nIGhlcmRcbiAqICAgb24gY29sZCBzdGFydCkuXG4gKiAtIGBBYm9ydFNpZ25hbGAgaXMgZm9yd2FyZGVkIHRvIHRoZSBvdXRnb2luZyBBUEkgcmVxdWVzdCAobWVzc2FnZXMsIG1vZGVscylcbiAqICAgYnV0ICoqbm90KiogdG8gdGhlIHNoYXJlZCBkaXNjb3ZlcnkgY2FsbCwgc28gY2FuY2VsbGF0aW9uIHByb3BhZ2F0ZXMgdG9cbiAqICAgdGhlIGNhbGxlcidzIG93biByZXF1ZXN0IHdpdGhvdXQgYWZmZWN0aW5nIGNvbmN1cnJlbnQgY2FsbGVycyBzaGFyaW5nIHRoZVxuICogICBkaXNjb3ZlcnkuXG4gKlxuICogIyMgRXJyb3Igc2VtYW50aWNzXG4gKlxuICogLSBOZXR3b3JrL3RyYW5zcG9ydCBlcnJvcnMgcHJvcGFnYXRlIGFzIHJhdyBgZmV0Y2hgIHJlamVjdGlvbnMgKGUuZy5cbiAqICAgY29ubmVjdGlvbiByZXNldCwgRE5TIGZhaWx1cmUpLiBDb25zdW1lcnMgY2FuIGRpc3Rpbmd1aXNoIHRoZW0gZnJvbVxuICogICBBUEkgZXJyb3JzIGJ5IGBpbnN0YW5jZW9mIENvcGlsb3RBcGlFcnJvcmAuXG4gKiAtIE5vbi0yeHggcmVzcG9uc2VzIGZyb20gQ0FQSSdzIGBtZXNzYWdlc2AgYW5kIGBtb2RlbHNgIGVuZHBvaW50cyB0aHJvd1xuICogICB7QGxpbmsgQ29waWxvdEFwaUVycm9yfSBjYXJyeWluZyB0aGUgSFRUUCBgc3RhdHVzYCBhbmQgdGhlIHBhcnNlZFxuICogICBBbnRocm9waWMgZXJyb3IgYGVudmVsb3BlYCAoc3ludGhlc2l6ZWQgaWYgdGhlIHJlc3BvbnNlIGJvZHkgaXNuJ3QgYVxuICogICBjb25mb3JtaW5nIGVudmVsb3BlKS4gKipUb2tlbnMgYXJlIG5ldmVyIGVtYmVkZGVkIGluIGVycm9yIG1lc3NhZ2VzLioqXG4gKiAtIFN0cmVhbWluZyBgZXZlbnQ6IGVycm9yYCBTU0UgZnJhbWVzIHRocm93IHtAbGluayBDb3BpbG90QXBpRXJyb3J9IHdpdGhcbiAqICAgYHN0YXR1c2Agc2V0IHRvIHtAbGluayBDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HfSAodGhlIHVwc3RyZWFtXG4gKiAgIEhUVFAgc3RhdHVzIHdhcyAyMDAgYW5kIGlzIG5vIGxvbmdlciBtZWFuaW5nZnVsKSBhbmQgdGhlIHNlcnZlci1zdXBwbGllZFxuICogICBlcnJvciBlbnZlbG9wZSBwcmVzZXJ2ZWQgdmVyYmF0aW0uXG4gKiAtIEZhaWx1cmVzIG9mIHRoZSBgL2NvcGlsb3RfaW50ZXJuYWwvdXNlcmAgZGlzY292ZXJ5IGNhbGwgdGhyb3cgcGxhaW5cbiAqICAgYEVycm9yYCAobm90IGBDb3BpbG90QXBpRXJyb3JgKSB3aXRoIGEgYFwiQ29waWxvdCBlbmRwb2ludCBkaXNjb3ZlcnlcbiAqICAgZmFpbGVkOiAuLi5cImAgcHJlZml4IFx1MjAxNCBpdCBpcyBhbiBpbXBsZW1lbnRhdGlvbiBkZXRhaWwgb2YgdGhpcyBzZXJ2aWNlXG4gKiAgIGFuZCBpcyBub3QgcGFydCBvZiB0aGUgQW50aHJvcGljLXNoYXBlZCBDQVBJIHN1cmZhY2UuXG4gKiAtIE1hbGZvcm1lZCBKU09OIGluIGFuIFNTRSBgZGF0YTpgIGxpbmUgaXMgbG9nZ2VkIGFuZCBza2lwcGVkLCBub3QgdGhyb3duLlxuICovXG4vKipcbiAqIFJlc3RyaWN0ZWQvZW5oYW5jZWQgdGVsZW1ldHJ5IGNvbnRleHQgZGVyaXZlZCBmcm9tIGEgdXNlcidzIG1pbnRlZCBDQVBJIENvcGlsb3Qgc2Vzc2lvbiB0b2tlbixcbiAqIG1pcnJvcmluZyB3aGF0IHRoZSBDb3BpbG90IGV4dGVuc2lvbiByZWFkcyBvZmYgaXRzIGBDb3BpbG90VG9rZW5gIChgcnRgIG9wdC1pbiwgYHRpZGAgdHJhY2tpbmcgaWQpXG4gKiBwbHVzIHRoZSBDQVBJIGBlbmRwb2ludHMudGVsZW1ldHJ5YCBob3N0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCB7XG5cdC8qKiBXaGV0aGVyIHRoZSB0b2tlbiBvcHRzIGludG8gZW5oYW5jZWQvcmVzdHJpY3RlZCB0ZWxlbWV0cnkgKHRoZSBgcnQ9MWAgY2xhaW0pLiAqL1xuXHRyZWFkb25seSByZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZDogYm9vbGVhbjtcblx0LyoqIFRoZSBDb3BpbG90IHVzZXIgdHJhY2tpbmcgaWQgKGB0aWRgIGNsYWltKSwgb3IgYHVuZGVmaW5lZGAgd2hlbiBhYnNlbnQuICovXG5cdHJlYWRvbmx5IHRyYWNraW5nSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIFRoZSBDQVBJIGBlbmRwb2ludHMudGVsZW1ldHJ5YCBiYXNlIFVSTCwgcmVzb2x2ZWQgb25seSB3aGVuIGVuYWJsZWQ7IGB1bmRlZmluZWRgIG90aGVyd2lzZS4gKi9cblx0cmVhZG9ubHkgdGVsZW1ldHJ5RW5kcG9pbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIgdGhlIHRva2VuIGJlbG9uZ3MgdG8gYSBHaXRIdWIgb3IgTWljcm9zb2Z0IGludGVybmFsIG9yZ2FuaXphdGlvbi4gKi9cblx0cmVhZG9ubHkgaXNJbnRlcm5hbD86IGJvb2xlYW47XG5cdC8qKiBHaXRIdWIgbG9naW4gcmV0dXJuZWQgYnkgYC9jb3BpbG90X2ludGVybmFsL3VzZXJgLiAqL1xuXHRyZWFkb25seSB1c2VyTmFtZT86IHN0cmluZztcblx0LyoqIFdoZXRoZXIgdGhlIHRva2VuIGlkZW50aWZpZXMgYSBWUyBDb2RlIHRlYW0gbWVtYmVyLiAqL1xuXHRyZWFkb25seSBpc1ZzY29kZVRlYW1NZW1iZXI/OiBib29sZWFuO1xuXHQvKiogV2hldGhlciBjb250ZW50IGV4Y2x1c2lvbiBpcyBlbmFibGVkOyB1bmRlZmluZWQgd2hlbiBkaXNjb3ZlcnkgY291bGQgbm90IGRldGVybWluZSBpdC4gKi9cblx0cmVhZG9ubHkgY29waWxvdElnbm9yZUVuYWJsZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb3BpbG90QXBpU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTdHJlYW0gYSBjaGF0IGNvbXBsZXRpb24gYXMgcmF3IEFudGhyb3BpYyBzdHJlYW0gZXZlbnRzLlxuXHQgKlxuXHQgKiBZaWVsZHMgZXZlcnkgYEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnRgIGluIHRoZSBvcmRlciB0aGUgc2VydmVyXG5cdCAqIGVtaXRzIHRoZW0sICoqaW5jbHVkaW5nIGBtZXNzYWdlX3N0b3BgIGFzIHRoZSBsYXN0IGV2ZW50KiogYmVmb3JlIHRoZVxuXHQgKiBnZW5lcmF0b3IgcmV0dXJucy4gUGhhc2UgMiBwcm94eSByZWxpZXMgb24gcmVjZWl2aW5nIGEgY29tcGxldGUsXG5cdCAqIHJlcGxheWFibGUgZXZlbnQgc3RyZWFtLlxuXHQgKlxuXHQgKiBAdGhyb3dzIG9uIG5vbi0yeHggc3RhdHVzIG9yIFNTRSBgZXJyb3JgIGV2ZW50LlxuXHQgKi9cblx0bWVzc2FnZXMoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc1N0cmVhbWluZyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBTZW5kIGEgY2hhdCBjb21wbGV0aW9uIGFuZCByZXR1cm4gdGhlIGZ1bGwgYWdncmVnYXRlZCByZXNwb25zZS5cblx0ICogQHRocm93cyBvbiBub24tMnh4IHN0YXR1cy5cblx0ICovXG5cdG1lc3NhZ2VzKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblxuXHQvKipcblx0ICogQ291bnQgdG9rZW5zIGZvciBhIGh5cG90aGV0aWNhbCByZXF1ZXN0LlxuXHQgKlxuXHQgKiBAdGhyb3dzIGFsd2F5cyBcdTIwMTQgYGNvdW50VG9rZW5zYCBpcyBub3Qgc3VwcG9ydGVkIGJ5IENBUEkgaW4gUGhhc2UgMS41LlxuXHQgKiBQaGFzZSAyIHByb3h5IG1hcHMgdGhpcyB0byBIVFRQIDUwMS5cblx0ICovXG5cdGNvdW50VG9rZW5zKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxOiBBbnRocm9waWMuTWVzc2FnZUNvdW50VG9rZW5zUGFyYW1zLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZVRva2Vuc0NvdW50PjtcblxuXHQvKipcblx0ICogTGlzdCBtb2RlbHMgYXZhaWxhYmxlIHRvIHRoZSBHaXRIdWIgdXNlci5cblx0ICpcblx0ICogRWFjaCB7QGxpbmsgQ0NBTW9kZWx9IGNhcnJpZXMgYSBgdmVuZG9yYCAoZS5nLiBgJ0FudGhyb3BpYydgKSBhbmRcblx0ICogYHN1cHBvcnRlZF9lbmRwb2ludHNgIChlLmcuIGBbJy92MS9tZXNzYWdlcyddYCkuIENhbGxlcnMgZmlsdGVyaW5nIGZvclxuXHQgKiBBbnRocm9waWMtZm9ybWF0IG1vZGVscyBzaG91bGQgbWF0Y2ggb24gYm90aCBmaWVsZHMuXG5cdCAqXG5cdCAqIEtub3duIENBUEkgdmFsdWVzIGFzIG9mIDIwMjYtMDQtMzA6XG5cdCAqIC0gYHZlbmRvcmA6IGAnQW50aHJvcGljJ2AgKGNhcGl0YWxpemVkKVxuXHQgKiAtIGBzdXBwb3J0ZWRfZW5kcG9pbnRzYDogYCcvdjEvbWVzc2FnZXMnYCBmb3IgQW50aHJvcGljIGNoYXQgbW9kZWxzXG5cdCAqL1xuXHRtb2RlbHMoZ2l0aHViVG9rZW46IHN0cmluZywgb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxDQ0FNb2RlbFtdPjtcblxuXHQvKipcblx0ICogUGFzcy10aHJvdWdoIHRvIENBUEkncyBPcGVuQUktc2hhcGVkIFJlc3BvbnNlcyBlbmRwb2ludFxuXHQgKiAoYHtjYXBpQmFzZVVybH0vcmVzcG9uc2VzYCkuIFVzZWQgYnkgYENvZGV4UHJveHlTZXJ2aWNlYCB0byBmb3J3YXJkXG5cdCAqIGAvdjEvcmVzcG9uc2VzYCByZXF1ZXN0cyBmcm9tIHRoZSBDb2RleCBDTEkgd2l0aG91dCBkZXNlcmlhbGl6aW5nXG5cdCAqIHRoZSBib2R5LiBUaGUgY2FsbGVyIG93bnMgdGhlIHJldHVybmVkIGBSZXNwb25zZWAgKGl0cyBib2R5IGFuZCBhbnlcblx0ICogc3RyZWFtaW5nKSBhbmQgaXMgcmVzcG9uc2libGUgZm9yIGNvbnN1bWluZyBvciBhYm9ydGluZyBpdC5cblx0ICpcblx0ICogQHRocm93cyBvbiBub24tMnh4IHVwc3RyZWFtIHJlc3BvbnNlLlxuXHQgKi9cblx0cmVzcG9uc2VzKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0Ym9keTogc3RyaW5nLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogUHJvbWlzZTxSZXNwb25zZT47XG5cblx0LyoqXG5cdCAqIFNlbmQgYXJiaXRyYXJ5IHVzZXIgY2hhdCBtZXNzYWdlcyB0aHJvdWdoIENBUEkncyBgL2NoYXQvY29tcGxldGlvbnNgXG5cdCAqIGVuZHBvaW50IGFuZCByZXR1cm4gdGhlIGFzc2lzdGFudCB0ZXh0LlxuXHQgKlxuXHQgKiBJbnRlcm5hbGx5IG1pbnRzIChhbmQgY2FjaGVzKSBhIENvcGlsb3Qgc2Vzc2lvbiB0b2tlbiBmcm9tIHRoZVxuXHQgKiBzdXBwbGllZCBHaXRIdWIgdG9rZW4gXHUyMDE0IHRoZSBzYW1lIGZsb3cgdGhlIENvcGlsb3QgQ2hhdCBleHRlbnNpb25cblx0ICogdXNlcyBmb3IgaXRzIGBjb3BpbG90LXV0aWxpdHktc21hbGxgIGVuZHBvaW50IChQUiB0aXRsZS9kZXNjcmlwdGlvbixcblx0ICogY29tbWl0IG1lc3NhZ2VzLCBicmFuY2ggbmFtZXMsIGNoYXQgdGl0bGVzLCBldGMuKS4gVXNlcyB0aGVcblx0ICogYGdwdC00by1taW5pYCBtb2RlbCBmYW1pbHkgd2l0aCBgdG9wX3AgPSAxYCBhbmQgYHRlbXBlcmF0dXJlID0gMC4xYFxuXHQgKiBieSBkZWZhdWx0IChvdmVycmlkZSB2aWEgYHJlcXVlc3QudGVtcGVyYXR1cmVgKS5cblx0ICpcblx0ICogTm9uLXN0cmVhbWluZy4gQ2FsbGVycyBvd24gcHJvbXB0IGNvbnN0cnVjdGlvbiBhbmQgYW55XG5cdCAqIGRvbWFpbi1zcGVjaWZpYyBwYXJzaW5nIG9mIHRoZSByZXR1cm5lZCB0ZXh0LlxuXHQgKlxuXHQgKiBAdGhyb3dzIHtAbGluayBDb3BpbG90QXBpRXJyb3J9IG9uIG5vbi0yeHggQ0FQSSByZXNwb25zZS5cblx0ICogQHRocm93cyBwbGFpbiBgRXJyb3JgIHdoZW4gbm8gbW9kZWwgaW4gdGhlIHJlcXVlc3RlZCBmYW1pbHkgaXNcblx0ICogYXZhaWxhYmxlIG9yIHdoZW4gdGhlIHJlc3BvbnNlIGNvbnRhaW5zIG5vIHRleHQgY29udGVudC5cblx0ICovXG5cdHV0aWxpdHlDaGF0Q29tcGxldGlvbihcblx0XHRnaXRodWJUb2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IElDb3BpbG90VXRpbGl0eUNoYXRDb21wbGV0aW9uUmVxdWVzdCxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8c3RyaW5nPjtcblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGlzIHVzZXIncyByZXN0cmljdGVkLXRlbGVtZXRyeSBjb250ZXh0IGZyb20gdGhlIG1pbnRlZCBDQVBJIENvcGlsb3Qgc2Vzc2lvbiB0b2tlbiBcdTIwMTRcblx0ICogdGhlIGBydGAgb3B0LWluIGFuZCBgdGlkYCB0cmFja2luZyBpZCBcdTIwMTQgcGx1cyB0aGUgQ0FQSSBgZW5kcG9pbnRzLnRlbGVtZXRyeWAgaG9zdC4gVGhlIEdpdEh1YlxuXHQgKiB0b2tlbiBpdHNlbGYgY2FycmllcyBub25lIG9mIHRoZXNlIGNsYWltczsgdGhleSBsaXZlIGluIHRoZSBDb3BpbG90IHNlc3Npb24gdG9rZW4gKG1pbnRlZCB2aWFcblx0ICogYFJlcXVlc3RUeXBlLkNvcGlsb3RUb2tlbmApLCBleGFjdGx5IGFzIHRoZSBDb3BpbG90IGV4dGVuc2lvbiByZWFkcyB0aGVtIG9mZiBpdHMgYENvcGlsb3RUb2tlbmAuXG5cdCAqIFRoZSB0ZWxlbWV0cnkgZW5kcG9pbnQgaXMgcmVzb2x2ZWQgb25seSB3aGVuIGVuYWJsZWQsIHNvIHB1YmxpYyB1c2VycyBpbmN1ciBubyBleHRyYSBkaXNjb3ZlcnkuXG5cdCAqL1xuXHRyZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQoZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8SVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0PjtcblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgQ0FQSSBgZW5kcG9pbnRzLmFwaWAgYmFzZSBVUkwgZGlzY292ZXJlZCBmb3IgdGhpcyBHaXRIdWIgdG9rZW5cblx0ICogKG9yIHRoZSBsb29wYmFjayB0ZXN0IG92ZXJyaWRlKSwgb3IgYHVuZGVmaW5lZGAgd2hlbiBkaXNjb3ZlcnkgaGFzbid0IHJ1blxuXHQgKiBvciBmYWlsZWQuIFRoZSBlZmZlY3RpdmUgQ0FQSSBob3N0IHZhcmllcyBieSBhY2NvdW50IChjb25zdW1lclxuXHQgKiBgYXBpLmdpdGh1YmNvcGlsb3QuY29tYCB2cy4gRW50ZXJwcmlzZSAvIHByb3h5KSwgc28gY2FsbGVycyB0aGF0IG5lZWQgdGhlXG5cdCAqIHJlYWwgaG9zdCBcdTIwMTQgZS5nLiB0byByZXNvbHZlIHRoZSBjb3JyZWN0IHByb3h5IFx1MjAxNCBzaG91bGQgcHJlZmVyIHRoaXMgb3ZlciB0aGVcblx0ICogaGFyZGNvZGVkIGRlZmF1bHQuXG5cdCAqL1xuXHRyZXNvbHZlQXBpRW5kcG9pbnQoZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHQvKiogUmVzb2x2ZSB0aGUgR2l0SHViIGxvZ2luIGNhY2hlZCBmcm9tIGAvY29waWxvdF9pbnRlcm5hbC91c2VyYC4gKi9cblx0cmVzb2x2ZVVzZXJMb2dpbj8oZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHQvKiogUmVzb2x2ZSB0aGUgcmF3IENvcGlsb3QgZW50aXRsZW1lbnQgU0tVIGNhY2hlZCBmcm9tIGAvY29waWxvdF9pbnRlcm5hbC91c2VyYC4gKi9cblx0cmVzb2x2ZUNvcGlsb3RTa3U/KGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBjbGFzcyBDb3BpbG90QXBpU2VydmljZSBpbXBsZW1lbnRzIElDb3BpbG90QXBpU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY2FwaUJhc2VQcm9taXNlOiBQcm9taXNlPElDYXBpQmFzZT4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50c0J5VG9rZW4gPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxJQ2FjaGVkQ2xpZW50Pj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29waWxvdFRva2Vuc0J5R2l0aHViID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SUNhY2hlZENvcGlsb3RUb2tlbj4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZldGNoOiBGZXRjaEZ1bmN0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGZldGNoRm46IEZldGNoRnVuY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRIdWJFbmRwb2ludFNlcnZpY2U6IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX2ZldGNoID0gZmV0Y2hGbiA/PyBnbG9iYWxUaGlzLmZldGNoO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBQdWJsaWMgQVBJXG5cblx0bWVzc2FnZXMoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc1N0cmVhbWluZyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+O1xuXHRtZXNzYWdlcyhcblx0XHRnaXRodWJUb2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zTm9uU3RyZWFtaW5nLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT47XG5cdG1lc3NhZ2VzKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXMsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBBc3luY0dlbmVyYXRvcjxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50PiB8IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2U+IHtcblx0XHRpZiAocmVxdWVzdC5zdHJlYW0pIHtcblx0XHRcdHJldHVybiB0aGlzLl9tZXNzYWdlc1N0cmVhbWluZyhnaXRodWJUb2tlbiwgcmVxdWVzdCwgb3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tZXNzYWdlc05vblN0cmVhbWluZyhnaXRodWJUb2tlbiwgcmVxdWVzdCwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBjb3VudFRva2Vucyhcblx0XHRfZ2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRfcmVxOiBBbnRocm9waWMuTWVzc2FnZUNvdW50VG9rZW5zUGFyYW1zLFxuXHRcdF9vcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2VUb2tlbnNDb3VudD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignY291bnRUb2tlbnMgbm90IHN1cHBvcnRlZCBieSBDQVBJJyk7XG5cdH1cblxuXHRhc3luYyBtb2RlbHMoZ2l0aHViVG9rZW46IHN0cmluZywgb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxDQ0FNb2RlbFtdPiB7XG5cdFx0Y29uc3QgY2FwaUNsaWVudCA9IGF3YWl0IHRoaXMuX2dldENsaWVudEZvclRva2VuKGdpdGh1YlRva2VuKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ1tDb3BpbG90QXBpU2VydmljZV0gR0VUIG1vZGVscycpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjYXBpQ2xpZW50Lm1ha2VSZXF1ZXN0PFJlc3BvbnNlPihcblx0XHRcdHtcblx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdC4uLm9wdGlvbnM/LmhlYWRlcnMsXG5cdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7Z2l0aHViVG9rZW59YCxcblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gT3B0LWluIHBlciByZXF1ZXN0IFx1MjAxNCBzZWVcblx0XHRcdFx0Ly8gYElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLnN1cHByZXNzSW50ZWdyYXRpb25JZGAuXG5cdFx0XHRcdHN1cHByZXNzSW50ZWdyYXRpb25JZDogb3B0aW9ucz8uc3VwcHJlc3NJbnRlZ3JhdGlvbklkLFxuXHRcdFx0XHRzaWduYWw6IG9wdGlvbnM/LnNpZ25hbCxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6IFJlcXVlc3RUeXBlLk1vZGVscyB9LFxuXHRcdCk7XG5cblx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDEgfHwgcmVzcG9uc2Uuc3RhdHVzID09PSA0MDMpIHtcblx0XHRcdFx0dGhpcy5faW52YWxpZGF0ZUNsaWVudEZvclRva2VuKGdpdGh1YlRva2VuKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCkuY2F0Y2goKCkgPT4gJycpO1xuXHRcdFx0dGhyb3cgYnVpbGRDb3BpbG90QXBpSHR0cEVycm9yKHJlc3BvbnNlLnN0YXR1cywgcmVzcG9uc2Uuc3RhdHVzVGV4dCwgdGV4dCwgJ0NBUEkgbW9kZWxzIHJlcXVlc3QgZmFpbGVkJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QganNvbiA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblx0XHRyZXR1cm4ganNvbi5kYXRhID8/IFtdO1xuXHR9XG5cblx0YXN5bmMgcmVzcG9uc2VzKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0Ym9keTogc3RyaW5nLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogUHJvbWlzZTxSZXNwb25zZT4ge1xuXHRcdGNvbnN0IGNhcGlDbGllbnQgPSBhd2FpdCB0aGlzLl9nZXRDbGllbnRGb3JUb2tlbihnaXRodWJUb2tlbik7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHQvLyBQYXJzZSB0aGUgcmVxdWVzdCBib2R5IHRvIGxvZyB0aGUgbW9kZWwgYmVpbmcgc2VudCAoZGVidWcgYWlkOyBmYWlsdXJlc1xuXHRcdC8vIGFyZSBub24tZmF0YWwgXHUyMDE0IHRoZSBib2R5IGlzIGZvcndhcmRlZCBieXRlLWZvci1ieXRlIHJlZ2FyZGxlc3MpLlxuXHRcdGxldCByZXF1ZXN0TW9kZWwgPSAnPHVua25vd24+Jztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShib2R5KTtcblx0XHRcdHJlcXVlc3RNb2RlbCA9IHBhcnNlZC5tb2RlbCA/PyAnPG5vbmU+Jztcblx0XHR9IGNhdGNoIHsgLyogaWdub3JlIHBhcnNlIGVycm9ycyAqLyB9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdEFwaVNlcnZpY2VdIFBPU1QgcmVzcG9uc2VzOiByZXF1ZXN0SWQ9JHtyZXF1ZXN0SWR9LCBtb2RlbD0ke3JlcXVlc3RNb2RlbH1gKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2FwaUNsaWVudC5tYWtlUmVxdWVzdDxSZXNwb25zZT4oXG5cdFx0XHR7XG5cdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0Li4ub3B0aW9ucz8uaGVhZGVycyxcblx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2dpdGh1YlRva2VufWAsXG5cdFx0XHRcdFx0J1gtUmVxdWVzdC1JZCc6IHJlcXVlc3RJZCxcblx0XHRcdFx0XHQnT3BlbkFJLUludGVudCc6ICdjb252ZXJzYXRpb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQvLyBPcHQtaW4gcGVyIHJlcXVlc3QgXHUyMDE0IHNlZVxuXHRcdFx0XHQvLyBgSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMuc3VwcHJlc3NJbnRlZ3JhdGlvbklkYC5cblx0XHRcdFx0c3VwcHJlc3NJbnRlZ3JhdGlvbklkOiBvcHRpb25zPy5zdXBwcmVzc0ludGVncmF0aW9uSWQsXG5cdFx0XHRcdGJvZHksXG5cdFx0XHRcdHNpZ25hbDogb3B0aW9ucz8uc2lnbmFsLFxuXHRcdFx0fSxcblx0XHRcdHsgdHlwZTogUmVxdWVzdFR5cGUuQ2hhdFJlc3BvbnNlcyB9LFxuXHRcdCk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90QXBpU2VydmljZV0gcmVzcG9uc2VzIHN0YXR1cz0ke3Jlc3BvbnNlLnN0YXR1c30sIHJlcXVlc3RJZD0ke3JlcXVlc3RJZH1gKTtcblxuXHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwMSB8fCByZXNwb25zZS5zdGF0dXMgPT09IDQwMykge1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlQ2xpZW50Rm9yVG9rZW4oZ2l0aHViVG9rZW4pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKS5jYXRjaCgoKSA9PiAnJyk7XG5cdFx0XHR0aHJvdyBidWlsZENvcGlsb3RBcGlIdHRwRXJyb3IocmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5zdGF0dXNUZXh0LCB0ZXh0LCAnQ0FQSSByZXNwb25zZXMgcmVxdWVzdCBmYWlsZWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHR9XG5cblx0YXN5bmMgdXRpbGl0eUNoYXRDb21wbGV0aW9uKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0LFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjYXBpQ2xpZW50ID0gYXdhaXQgdGhpcy5fZ2V0Q2xpZW50Rm9yVG9rZW4oZ2l0aHViVG9rZW4pO1xuXHRcdGNvbnN0IG1vZGVsSWQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlVXRpbGl0eU1vZGVsSWQoZ2l0aHViVG9rZW4sIFVUSUxJVFlfREVGQVVMVF9NT0RFTF9GQU1JTFkpO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnW0NvcGlsb3RBcGlTZXJ2aWNlXSBQT1NUIGNoYXQgY29tcGxldGlvbnMnLCBgbW9kZWw9JHttb2RlbElkfSByZXF1ZXN0SWQ9JHtyZXF1ZXN0SWR9YCk7XG5cblx0XHRjb25zdCBib2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bW9kZWw6IG1vZGVsSWQsXG5cdFx0XHRtZXNzYWdlczogcmVxdWVzdC5tZXNzYWdlcy5tYXAobSA9PiAoeyByb2xlOiBtLnJvbGUsIGNvbnRlbnQ6IG0uY29udGVudCB9KSksXG5cdFx0XHRzdHJlYW06IGZhbHNlLFxuXHRcdFx0dGVtcGVyYXR1cmU6IHJlcXVlc3QudGVtcGVyYXR1cmUgPz8gVVRJTElUWV9ERUZBVUxUX1RFTVBFUkFUVVJFLFxuXHRcdFx0dG9wX3A6IFVUSUxJVFlfREVGQVVMVF9UT1BfUCxcblx0XHRcdG1heF90b2tlbnM6IHJlcXVlc3QubWF4VG9rZW5zLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjYXBpQ2xpZW50Lm1ha2VSZXF1ZXN0PFJlc3BvbnNlPihcblx0XHRcdHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQuLi5vcHRpb25zPy5oZWFkZXJzLFxuXHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7Z2l0aHViVG9rZW59YCxcblx0XHRcdFx0XHQnWC1SZXF1ZXN0LUlkJzogcmVxdWVzdElkLFxuXHRcdFx0XHRcdCdPcGVuQUktSW50ZW50JzogVVRJTElUWV9JTlRFTlQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJvZHksXG5cdFx0XHRcdHNpZ25hbDogb3B0aW9ucz8uc2lnbmFsLFxuXHRcdFx0fSxcblx0XHRcdHsgdHlwZTogUmVxdWVzdFR5cGUuQ2hhdENvbXBsZXRpb25zIH0sXG5cdFx0KTtcblxuXHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwMSB8fCByZXNwb25zZS5zdGF0dXMgPT09IDQwMykge1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlQ2xpZW50Rm9yVG9rZW4oZ2l0aHViVG9rZW4pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKS5jYXRjaCgoKSA9PiAnJyk7XG5cdFx0XHR0aHJvdyBidWlsZENvcGlsb3RBcGlIdHRwRXJyb3IocmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5zdGF0dXNUZXh0LCB0ZXh0LCAnQ0FQSSBjaGF0IGNvbXBsZXRpb24gcmVxdWVzdCBmYWlsZWQnKTtcblx0XHR9XG5cblx0XHRjb25zdCBqc29uID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIHsgY2hvaWNlcz86IFJlYWRvbmx5QXJyYXk8eyBtZXNzYWdlPzogeyBjb250ZW50PzogdW5rbm93biB9IH0+IH07XG5cdFx0Y29uc3QgY29udGVudCA9IGpzb24/LmNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudDtcblx0XHRpZiAodHlwZW9mIGNvbnRlbnQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NBUEkgY2hhdCBjb21wbGV0aW9uIHJldHVybmVkIG5vIHRleHQgY29udGVudCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIExhenkgSW5pdFxuXG5cdHByaXZhdGUgX2dldENhcGlCYXNlKCk6IFByb21pc2U8SUNhcGlCYXNlPiB7XG5cdFx0aWYgKCF0aGlzLl9jYXBpQmFzZVByb21pc2UpIHtcblx0XHRcdHRoaXMuX2NhcGlCYXNlUHJvbWlzZSA9IHRoaXMuX2J1aWxkQ2FwaUJhc2UoKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9jYXBpQmFzZVByb21pc2UgPSBudWxsO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhcGlCYXNlUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2J1aWxkQ2FwaUJhc2UoKTogUHJvbWlzZTxJQ2FwaUJhc2U+IHtcblx0XHRjb25zdCBbbWFjaGluZUlkLCBkZXZpY2VJZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRnZXRNYWNoaW5lSWQoZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0NvcGlsb3RBcGlTZXJ2aWNlXSBnZXRNYWNoaW5lSWQgZmFpbGVkJywgZXJyKSksXG5cdFx0XHRnZXREZXZEZXZpY2VJZChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdEFwaVNlcnZpY2VdIGdldERldkRldmljZUlkIGZhaWxlZCcsIGVycikpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSW5mbzogSUV4dGVuc2lvbkluZm9ybWF0aW9uID0ge1xuXHRcdFx0bmFtZTogJ2FnZW50LWhvc3QnLFxuXHRcdFx0c2Vzc2lvbklkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdG1hY2hpbmVJZCxcblx0XHRcdGRldmljZUlkLFxuXHRcdFx0dnNjb2RlVmVyc2lvbjogdGhpcy5fcHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdHZlcnNpb246IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHRidWlsZFR5cGU6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgPT09ICdzdGFibGUnID8gJ3Byb2QnIDogJ2RldicsXG5cdFx0fTtcblxuXHRcdC8vIENvcGlsb3QgZW5kcG9pbnQgZGlzY292ZXJ5OiBHRVQgYC9jb3BpbG90X2ludGVybmFsL3VzZXJgIG9uIHRoZSBHaXRIdWIgQVBJXG5cdFx0Ly8gaG9zdC4gRm9yIEdpdEh1YiBFbnRlcnByaXNlIHRoZSBob3N0IGlzIGRlcml2ZWQgZnJvbSBgZ2l0aHViRW50ZXJwcmlzZVVyaWBcblx0XHQvLyAodmlhIHRoZSBlbmRwb2ludCBzZXJ2aWNlKTsgdGhlIHJlc3BvbnNlJ3MgYGVuZHBvaW50cy5hcGlgIHRoZW4gY2FycmllcyB0aGVcblx0XHQvLyBlbnRlcnByaXNlIENBUEkgYmFzZSB0aGF0IENBUElDbGllbnQgcm91dGVzIHRocm91Z2guIERlZmF1bHRzIHRvXG5cdFx0Ly8gYXBpLmdpdGh1Yi5jb20gd2hlbiBubyBlbnRlcnByaXNlIFVSSSBpcyBzZXQuIChHSEUgQ2xvdWQgYCouZ2hlLmNvbWAgaXNcblx0XHQvLyBoYW5kbGVkOyBHSEUgU2VydmVyIG9uLXByZW0gYC9jb3BpbG90X2ludGVybmFsYCByb3V0aW5nIGlzIHVudmVyaWZpZWQuKVxuXHRcdGNvbnN0IHVzZXJVcmwgPSBgJHt0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0QXBpQmFzZVVyaSgpfS9jb3BpbG90X2ludGVybmFsL3VzZXJgO1xuXG5cdFx0cmV0dXJuIHsgZXh0ZW5zaW9uSW5mbywgdXNlclVybCB9O1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gU3RyZWFtaW5nXG5cblx0cHJpdmF0ZSBhc3luYyAqX21lc3NhZ2VzU3RyZWFtaW5nKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXMsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBBc3luY0dlbmVyYXRvcjxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50PiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdChnaXRodWJUb2tlbiwgcmVxdWVzdCwgdHJ1ZSwgb3B0aW9ucyk7XG5cblx0XHRpZiAoIXJlc3BvbnNlLmJvZHkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ0FQSSByZXNwb25zZSBoYXMgbm8gYm9keScpO1xuXHRcdH1cblxuXHRcdHlpZWxkKiB0aGlzLl9yZWFkU1NFKHJlc3BvbnNlLmJvZHkpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gTm9uLVN0cmVhbWluZ1xuXG5cdHByaXZhdGUgYXN5bmMgX21lc3NhZ2VzTm9uU3RyZWFtaW5nKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXMsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPiB7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdChnaXRodWJUb2tlbiwgcmVxdWVzdCwgZmFsc2UsIG9wdGlvbnMpO1xuXHRcdHJldHVybiByZXNwb25zZS5qc29uKCkgYXMgUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT47XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBTaGFyZWQgUmVxdWVzdFxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRSZXF1ZXN0KFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXMsXG5cdFx0c3RyZWFtOiBib29sZWFuLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogUHJvbWlzZTxSZXNwb25zZT4ge1xuXHRcdGNvbnN0IGNhcGlDbGllbnQgPSBhd2FpdCB0aGlzLl9nZXRDbGllbnRGb3JUb2tlbihnaXRodWJUb2tlbik7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdbQ29waWxvdEFwaVNlcnZpY2VdIFBPU1QgbWVzc2FnZXMnLCBgbW9kZWw9JHtyZXF1ZXN0Lm1vZGVsfSBzdHJlYW09JHtzdHJlYW19IHJlcXVlc3RJZD0ke3JlcXVlc3RJZH1gKTtcblxuXHRcdGNvbnN0IHsgc3lzdGVtLCAuLi5yZXN0IH0gPSByZXF1ZXN0O1xuXHRcdGNvbnN0IGJvZHkgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHQuLi5yZXN0LFxuXHRcdFx0c3RyZWFtLFxuXHRcdFx0Ly8gQ0FQSSByZXF1aXJlcyBzeXN0ZW0gYXMgYSB0ZXh0LWJsb2NrIGFycmF5LCBub3QgYSByYXcgc3RyaW5nXG5cdFx0XHQuLi4oc3lzdGVtICE9PSB1bmRlZmluZWRcblx0XHRcdFx0PyB7IHN5c3RlbTogdHlwZW9mIHN5c3RlbSA9PT0gJ3N0cmluZycgPyBbeyB0eXBlOiAndGV4dCcsIHRleHQ6IHN5c3RlbSB9XSA6IHN5c3RlbSB9XG5cdFx0XHRcdDoge30pLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjYXBpQ2xpZW50Lm1ha2VSZXF1ZXN0PFJlc3BvbnNlPihcblx0XHRcdHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQuLi5vcHRpb25zPy5oZWFkZXJzLFxuXHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7Z2l0aHViVG9rZW59YCxcblx0XHRcdFx0XHQnWC1SZXF1ZXN0LUlkJzogcmVxdWVzdElkLFxuXHRcdFx0XHRcdCdYLUdpdEh1Yi1BcGktVmVyc2lvbic6ICcyMDI2LTAxLTA5Jyxcblx0XHRcdFx0XHQvLyBTaG91bGQgdGhlc2UgYmUgcGFyYW1ldGVyaXplZD9cblx0XHRcdFx0XHQnT3BlbkFJLUludGVudCc6ICdtZXNzYWdlcy1wcm94eScsXG5cdFx0XHRcdFx0J1gtSW50ZXJhY3Rpb24tVHlwZSc6ICdtZXNzYWdlcy1wcm94eScsXG5cdFx0XHRcdFx0Ly8gYFgtSW5pdGlhdG9yYCAodXNlcnxhZ2VudCkgaXMgaW50ZW50aW9uYWxseSBvbWl0dGVkOiB0aGVcblx0XHRcdFx0XHQvLyB1c2VyLXZzLWFnZW50IHR1cm4gb3JpZ2luIGtub3duIHRvIGBDbGF1ZGVBZ2VudFNlc3Npb25gIGlzIG5vdFxuXHRcdFx0XHRcdC8vIHBsdW1iZWQgYWNyb3NzIHRoZSBTREsgc3VicHJvY2VzcyB0byB0aGlzIHByb3h5LCBzbyBhIGhhcmRjb2RlZFxuXHRcdFx0XHRcdC8vIHZhbHVlIHdvdWxkIG1pc2xhYmVsIG1vc3QgYWdlbnQtbG9vcCB0cmFmZmljLiBDQVBJIGFjY2VwdHMgdGhlXG5cdFx0XHRcdFx0Ly8gcmVxdWVzdCB3aXRob3V0IGl0ICh0aGUgYHJlc3BvbnNlcygpYCBhbmQgYHV0aWxpdHlDaGF0Q29tcGxldGlvbigpYFxuXHRcdFx0XHRcdC8vIHBhdGhzIGFscmVhZHkgb21pdCBpdCkuIFRocmVhZCBhIHJlYWwgcGVyLXR1cm4gaW5pdGlhdG9yIGhlcmUgaWZcblx0XHRcdFx0XHQvLyB0aGF0IHNpZ25hbCBldmVyIGJlY29tZXMgYXZhaWxhYmxlIGF0IHRoZSBwcm94eSBib3VuZGFyeS5cblx0XHRcdFx0fSxcblx0XHRcdFx0c3VwcHJlc3NJbnRlZ3JhdGlvbklkOiBvcHRpb25zPy5zdXBwcmVzc0ludGVncmF0aW9uSWQsXG5cdFx0XHRcdGJvZHksXG5cdFx0XHRcdHNpZ25hbDogb3B0aW9ucz8uc2lnbmFsLFxuXHRcdFx0fSxcblx0XHRcdHsgdHlwZTogUmVxdWVzdFR5cGUuQ2hhdE1lc3NhZ2VzIH0sXG5cdFx0KTtcblx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDEgfHwgcmVzcG9uc2Uuc3RhdHVzID09PSA0MDMpIHtcblx0XHRcdFx0dGhpcy5faW52YWxpZGF0ZUNsaWVudEZvclRva2VuKGdpdGh1YlRva2VuKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCkuY2F0Y2goKCkgPT4gJycpO1xuXHRcdFx0dGhyb3cgYnVpbGRDb3BpbG90QXBpSHR0cEVycm9yKHJlc3BvbnNlLnN0YXR1cywgcmVzcG9uc2Uuc3RhdHVzVGV4dCwgdGV4dCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUGVyLVRva2VuIENsaWVudFxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIGEge0BsaW5rIENBUElDbGllbnR9IHRoYXQgaGFzIGhhZCBpdHMgZG9tYWlucyB1cGRhdGVkIGZvciB0aGVcblx0ICogc3VwcGxpZWQgdXNlci4gQ29uY3VycmVudCBjYWxsZXJzIGZvciB0aGUgc2FtZSB0b2tlbiBzaGFyZSBvbmVcblx0ICogYC9jb3BpbG90X2ludGVybmFsL3VzZXJgIGRpc2NvdmVyeSB2aWEgdGhlIGNhY2hlIG1hcDsgY2FsbGVycyB3aXRoXG5cdCAqIGRpZmZlcmVudCB0b2tlbnMgZ2V0IHRoZWlyICoqb3duKiogYENBUElDbGllbnRgIGluc3RhbmNlLCBzbyB0aGVcblx0ICogYHVwZGF0ZURvbWFpbnNgIG11dGF0aW9uIGZvciB0b2tlbiBBIGNhbiBuZXZlciBhZmZlY3QgYSByZXF1ZXN0IGJlaW5nXG5cdCAqIGRpc3BhdGNoZWQgZm9yIHRva2VuIEIuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRDbGllbnRGb3JUb2tlbihnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxDQVBJQ2xpZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEVudHJ5Rm9yVG9rZW4oZ2l0aHViVG9rZW4pLnRoZW4oZW50cnkgPT4gZW50cnkuY2FwaUNsaWVudCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGlzIHVzZXIncyByZXN0cmljdGVkLXRlbGVtZXRyeSBjb250ZXh0LiBSZWFkcyB0aGUgYHJ0YC9gdGlkYCBjbGFpbXMgZnJvbSB0aGUgbWludGVkXG5cdCAqIENBUEkgQ29waWxvdCBzZXNzaW9uIHRva2VuICh0aGUgR2l0SHViIHRva2VuIGhhcyBuZWl0aGVyKSwgYW5kIHJlc29sdmVzIHRoZSBDQVBJXG5cdCAqIGBlbmRwb2ludHMudGVsZW1ldHJ5YCBob3N0IGZyb20gdGhlIGNhY2hlZCBgL2NvcGlsb3RfaW50ZXJuYWwvdXNlcmAgZGlzY292ZXJ5IG9ubHkgd2hlbiB0aGVcblx0ICogdXNlciBpcyBvcHRlZCBpbiwgc28gcHVibGljIHVzZXJzIHBheSBubyBleHRyYSBkaXNjb3ZlcnkgY2FsbC5cblx0ICovXG5cdGFzeW5jIHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dChnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxJUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQ+IHtcblx0XHRjb25zdCB0b2tlbiA9IGF3YWl0IHRoaXMuX2dldENvcGlsb3RUb2tlbkVudHJ5KGdpdGh1YlRva2VuKTtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLl9nZXRFbnRyeUZvclRva2VuKGdpdGh1YlRva2VuKTtcblx0XHRjb25zdCBmaWVsZHMgPSBwYXJzZUNvcGlsb3RUb2tlbkZpZWxkcyh0b2tlbi50b2tlbik7XG5cdFx0Y29uc3QgcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQgPSBmaWVsZHMuZ2V0KCdydCcpID09PSAnMSc7XG5cdFx0Y29uc3QgdHJhY2tpbmdJZCA9IGZpZWxkcy5nZXQoJ3RpZCcpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeUVuZHBvaW50ID0gcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWRcblx0XHRcdD8gY2xpZW50LnRlbGVtZXRyeUVuZHBvaW50XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQsXG5cdFx0XHR0cmFja2luZ0lkLFxuXHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQsXG5cdFx0XHRpc0ludGVybmFsOiB0b2tlbi5pc0ludGVybmFsLFxuXHRcdFx0dXNlck5hbWU6IGNsaWVudC5sb2dpbixcblx0XHRcdGlzVnNjb2RlVGVhbU1lbWJlcjogdG9rZW4uaXNWc2NvZGVUZWFtTWVtYmVyLFxuXHRcdFx0Y29waWxvdElnbm9yZUVuYWJsZWQ6IGNsaWVudC5jb3BpbG90SWdub3JlRW5hYmxlZCxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUFwaUVuZHBvaW50KGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fZ2V0RW50cnlGb3JUb2tlbihnaXRodWJUb2tlbikpLmFwaUVuZHBvaW50O1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVVzZXJMb2dpbihnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX2dldEVudHJ5Rm9yVG9rZW4oZ2l0aHViVG9rZW4pKS5sb2dpbjtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb3BpbG90U2t1KGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fZ2V0RW50cnlGb3JUb2tlbihnaXRodWJUb2tlbikpLmNvcGlsb3RTa3U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFbnRyeUZvclRva2VuKGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElDYWNoZWRDbGllbnQ+IHtcblx0XHRjb25zdCBub3dTZWNvbmRzID0gRGF0ZS5ub3coKSAvIDEwMDA7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jbGllbnRzQnlUb2tlbi5nZXQoZ2l0aHViVG9rZW4pO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLnRoZW4oZW50cnkgPT4ge1xuXHRcdFx0XHRpZiAoZW50cnkuZXhwaXJlc0F0IC0gbm93U2Vjb25kcyA+IENBUElfQ09OVEVYVF9SRUZSRVNIX0JVRkZFUl9TRUNPTkRTKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGVudHJ5O1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFN0YWxlIFx1MjAxNCBldmljdCBhbmQgcmVjdXJzZSB0byBidWlsZCBhIGZyZXNoIGVudHJ5LlxuXHRcdFx0XHR0aGlzLl9jbGllbnRzQnlUb2tlbi5kZWxldGUoZ2l0aHViVG9rZW4pO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0RW50cnlGb3JUb2tlbihnaXRodWJUb2tlbik7XG5cdFx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHQvLyBBIHByZXZpb3VzIGZhaWxlZCBidWlsZCBsZWFrZWQgaW50byB0aGUgY2FjaGU7IGV2aWN0IGFuZCByZWJ1aWxkLlxuXHRcdFx0XHR0aGlzLl9jbGllbnRzQnlUb2tlbi5kZWxldGUoZ2l0aHViVG9rZW4pO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBPbWl0IHRoZSBjYWxsZXIncyBzaWduYWwgaGVyZTogYSBkZWR1cGVkIGJ1aWxkIGlzIHNoYXJlZCBhY3Jvc3Ncblx0XHQvLyBjb25jdXJyZW50IGNhbGxlcnMsIHNvIGFib3J0aW5nIG9uZSBtdXN0IG5vdCBjYW5jZWwgaXQgZm9yIHRoZVxuXHRcdC8vIG90aGVycy4gRWFjaCBjYWxsZXIgc3RpbGwgZm9yd2FyZHMgaXRzIHNpZ25hbCB0byB0aGUgQVBJIGNhbGwuXG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX2J1aWxkQ2xpZW50Rm9yVG9rZW4oZ2l0aHViVG9rZW4pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9jbGllbnRzQnlUb2tlbi5kZWxldGUoZ2l0aHViVG9rZW4pO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2NsaWVudHNCeVRva2VuLnNldChnaXRodWJUb2tlbiwgcGVuZGluZyk7XG5cdFx0cmV0dXJuIHBlbmRpbmc7XG5cdH1cblxuXHRwcml2YXRlIF9pbnZhbGlkYXRlQ2xpZW50Rm9yVG9rZW4oZ2l0aHViVG9rZW46IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NsaWVudHNCeVRva2VuLmRlbGV0ZShnaXRodWJUb2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9idWlsZENsaWVudEZvclRva2VuKGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElDYWNoZWRDbGllbnQ+IHtcblx0XHRjb25zdCB7IGV4dGVuc2lvbkluZm8sIHVzZXJVcmwgfSA9IGF3YWl0IHRoaXMuX2dldENhcGlCYXNlKCk7XG5cdFx0Y29uc3QgZmV0Y2ggPSB0aGlzLl9mZXRjaDtcblx0XHRjb25zdCBjYXBpQ2xpZW50ID0gbmV3IENBUElDbGllbnQoZXh0ZW5zaW9uSW5mbywgQ09QSUxPVF9MSUNFTlNFX0FHUkVFTUVOVCwge1xuXHRcdFx0ZmV0Y2g6ICh1cmwsIG9wdGlvbnMpID0+IGZldGNoKHVybCwge1xuXHRcdFx0XHRtZXRob2Q6IG9wdGlvbnMubWV0aG9kID8/ICdHRVQnLFxuXHRcdFx0XHRoZWFkZXJzOiBvcHRpb25zLmhlYWRlcnMsXG5cdFx0XHRcdGJvZHk6IG9wdGlvbnMuYm9keSxcblx0XHRcdFx0c2lnbmFsOiBvcHRpb25zLnNpZ25hbCBhcyBBYm9ydFNpZ25hbCB8IHVuZGVmaW5lZCxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnW0NvcGlsb3RBcGlTZXJ2aWNlXSBEaXNjb3ZlcmluZyBDQVBJIGVuZHBvaW50cyB2aWEgL2NvcGlsb3RfaW50ZXJuYWwvdXNlcicpO1xuXG5cdFx0Ly8gVGVzdC9kZWJ1ZyBvdmVycmlkZTogc2tpcCBhcGkuZ2l0aHViLmNvbSBkaXNjb3ZlcnkgZm9yIGFuIGFsbG93ZWQgbG9jYWxcblx0XHQvLyBvciBzbW9rZS1wcm94eSBVUkwuIEV2ZXJ5IG90aGVyIG5vbi1sb29wYmFjayB2YWx1ZSBpcyBpZ25vcmVkIGJlY2F1c2Vcblx0XHQvLyBzdWJzZXF1ZW50IENBUEkgY2FsbHMgY2FycnkgdGhlIEdpdEh1YiBiZWFyZXIgdG9rZW4uXG5cdFx0Y29uc3Qgb3ZlcnJpZGVBcGkgPSBwcm9jZXNzLmVudltDQVBJX1VSTF9PVkVSUklERV9FTlZdO1xuXHRcdGlmIChvdmVycmlkZUFwaSkge1xuXHRcdFx0aWYgKGlzQWxsb3dlZENhcGlVcmxPdmVycmlkZShvdmVycmlkZUFwaSkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdEFwaVNlcnZpY2VdIFVzaW5nIENBUEkgVVJMIG92ZXJyaWRlICR7b3ZlcnJpZGVBcGl9OyBza2lwcGluZyBlbmRwb2ludCBkaXNjb3ZlcnlgKTtcblx0XHRcdFx0Y2FwaUNsaWVudC51cGRhdGVEb21haW5zKHsgZW5kcG9pbnRzOiB7IGFwaTogb3ZlcnJpZGVBcGksIHByb3h5OiBvdmVycmlkZUFwaSB9LCBza3U6ICcnIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y2FwaUNsaWVudCxcblx0XHRcdFx0XHRleHBpcmVzQXQ6IERhdGUubm93KCkgLyAxMDAwICsgQ0FQSV9DT05URVhUX1RUTF9TRUNPTkRTLFxuXHRcdFx0XHRcdHV0aWxpdHlNb2RlbElkc0J5RmFtaWx5OiBuZXcgTWFwKCksXG5cdFx0XHRcdFx0YXBpRW5kcG9pbnQ6IG92ZXJyaWRlQXBpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdEFwaVNlcnZpY2VdIElnbm9yaW5nIG5vbi1sb29wYmFjayBDQVBJIFVSTCBvdmVycmlkZSAke292ZXJyaWRlQXBpfTsgZmFsbGluZyBiYWNrIHRvIG5vcm1hbCBlbmRwb2ludCBkaXNjb3ZlcnlgKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX2ZldGNoKHVzZXJVcmwsIHtcblx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2dpdGh1YlRva2VufWAsXG5cdFx0XHRcdCdBY2NlcHQnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdCdYLUdpdEh1Yi1BcGktVmVyc2lvbic6IFVTRVJfQVBJX1ZFUlNJT04sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKS5jYXRjaCgoKSA9PiAnJyk7XG5cdFx0XHR0aHJvdyBidWlsZENvcGlsb3RBcGlIdHRwRXJyb3IocmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5zdGF0dXNUZXh0LCB0ZXh0LCAnQ29waWxvdCBlbmRwb2ludCBkaXNjb3ZlcnkgZmFpbGVkJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW52ZWxvcGU6IElDb3BpbG90VXNlclJlc3BvbnNlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXG5cdFx0Y2FwaUNsaWVudC51cGRhdGVEb21haW5zKFxuXHRcdFx0eyBlbmRwb2ludHM6IGVudmVsb3BlLmVuZHBvaW50cyA/PyB7fSwgc2t1OiBlbnZlbG9wZS5hY2Nlc3NfdHlwZV9za3UgPz8gJycgfSxcblx0XHRcdC8vIEVudGVycHJpc2UgYmFzZSBVUkkgKGUuZy4gYGh0dHBzOi8vYWNtZS5naGUuY29tYCksIG9yIGB1bmRlZmluZWRgIGZvclxuXHRcdFx0Ly8gZ2l0aHViLmNvbS4gVGhlIHBhY2thZ2UgZGVyaXZlcyB0aGUgR2l0SHViIEFQSSBob3N0IChgYXBpLjxob3N0PmApIGZyb21cblx0XHRcdC8vIHRoaXMgZm9yIGBjb3BpbG90X2ludGVybmFsYCBlbmRwb2ludHMgLSBub3RhYmx5IHRoZSBDb3BpbG90IHNlc3Npb25cblx0XHRcdC8vIHRva2VuIG1pbnQgKGAvY29waWxvdF9pbnRlcm5hbC92Mi90b2tlbmApLiBPbWl0dGluZyBpdCBzdHJhbmRzIHRoZSBtaW50XG5cdFx0XHQvLyBvbiBgYXBpLmdpdGh1Yi5jb21gLCB3aGljaCA0MDFzIGFuIGVudGVycHJpc2UgdG9rZW4gKFwiQmFkIGNyZWRlbnRpYWxzXCIpLlxuXHRcdFx0dGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldEVudGVycHJpc2VVcmkoKSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnW0NvcGlsb3RBcGlTZXJ2aWNlXSBDQVBJIGVuZHBvaW50IGRpc2NvdmVyZWQsIGFwaT0nLCBlbnZlbG9wZS5lbmRwb2ludHM/LmFwaSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2FwaUNsaWVudCxcblx0XHRcdGV4cGlyZXNBdDogRGF0ZS5ub3coKSAvIDEwMDAgKyBDQVBJX0NPTlRFWFRfVFRMX1NFQ09ORFMsXG5cdFx0XHR1dGlsaXR5TW9kZWxJZHNCeUZhbWlseTogbmV3IE1hcCgpLFxuXHRcdFx0Y29waWxvdFNrdTogZW52ZWxvcGUuYWNjZXNzX3R5cGVfc2t1LFxuXHRcdFx0bG9naW46IGVudmVsb3BlLmxvZ2luLFxuXHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQ6IGVudmVsb3BlLmVuZHBvaW50cz8udGVsZW1ldHJ5LFxuXHRcdFx0YXBpRW5kcG9pbnQ6IGVudmVsb3BlLmVuZHBvaW50cz8uYXBpLFxuXHRcdFx0Y29waWxvdElnbm9yZUVuYWJsZWQ6IGVudmVsb3BlLmNvcGlsb3RpZ25vcmVfZW5hYmxlZCxcblx0XHR9O1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUGVyLVRva2VuIENvcGlsb3QgU2Vzc2lvbiBUb2tlblxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBDb3BpbG90IHNlc3Npb24gdG9rZW4gZm9yIGEgR2l0SHViIHRva2VuLCBtaW50aW5nIGFuZFxuXHQgKiBjYWNoaW5nIG9uZSBpZiBuZWVkZWQuIENvbmN1cnJlbnQgY2FsbGVycyBmb3IgdGhlIHNhbWUgR2l0SHViIHRva2VuXG5cdCAqIHNoYXJlIGEgc2luZ2xlIGluLWZsaWdodCBtaW50OyB0aGUgY2FsbGVyJ3MgYEFib3J0U2lnbmFsYCBpc1xuXHQgKiBkZWxpYmVyYXRlbHkgTk9UIGZvcndhcmRlZCBzbyBjYW5jZWxsaW5nIG9uZSBjYWxsZXIgZG9lcyBub3QgcG9pc29uXG5cdCAqIHRoZSBzaGFyZWQgbWludCBmb3IgdGhlIG90aGVycy5cblx0ICovXG5cdHByaXZhdGUgX2dldENvcGlsb3RUb2tlbkVudHJ5KGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElDYWNoZWRDb3BpbG90VG9rZW4+IHtcblx0XHRjb25zdCBub3dTZWNvbmRzID0gRGF0ZS5ub3coKSAvIDEwMDA7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jb3BpbG90VG9rZW5zQnlHaXRodWIuZ2V0KGdpdGh1YlRva2VuKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZy50aGVuKGVudHJ5ID0+IHtcblx0XHRcdFx0aWYgKGVudHJ5LmV4cGlyZXNBdCAtIG5vd1NlY29uZHMgPiBDT1BJTE9UX1RPS0VOX1JFRlJFU0hfQlVGRkVSX1NFQ09ORFMpIHtcblx0XHRcdFx0XHRyZXR1cm4gZW50cnk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gU3RhbGUgXHUyMDE0IGV2aWN0IG9ubHkgaWYgdGhlIG1hcCBzdGlsbCBwb2ludHMgYXQgdGhpc1xuXHRcdFx0XHQvLyBwcm9taXNlLiBBIGNvbmN1cnJlbnQgY2FsbGVyIG1heSBhbHJlYWR5IGhhdmUgcmFjZWQgYWhlYWRcblx0XHRcdFx0Ly8gYW5kIG1pbnRlZCBhIGZyZXNoIHRva2VuOyBkZWxldGluZyB1bmNvbmRpdGlvbmFsbHkgd291bGRcblx0XHRcdFx0Ly8gZXZpY3QgdGhhdCBuZXdlciBlbnRyeSBhbmQgY2F1c2UgYSByZWR1bmRhbnQgcmUtbWludC5cblx0XHRcdFx0aWYgKHRoaXMuX2NvcGlsb3RUb2tlbnNCeUdpdGh1Yi5nZXQoZ2l0aHViVG9rZW4pID09PSBleGlzdGluZykge1xuXHRcdFx0XHRcdHRoaXMuX2NvcGlsb3RUb2tlbnNCeUdpdGh1Yi5kZWxldGUoZ2l0aHViVG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLl9nZXRDb3BpbG90VG9rZW5FbnRyeShnaXRodWJUb2tlbik7XG5cdFx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fY29waWxvdFRva2Vuc0J5R2l0aHViLmdldChnaXRodWJUb2tlbikgPT09IGV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29waWxvdFRva2Vuc0J5R2l0aHViLmRlbGV0ZShnaXRodWJUb2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZzogUHJvbWlzZTxJQ2FjaGVkQ29waWxvdFRva2VuPiA9IHRoaXMuX2J1aWxkQ29waWxvdFRva2VuKGdpdGh1YlRva2VuKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvcGlsb3RUb2tlbnNCeUdpdGh1Yi5nZXQoZ2l0aHViVG9rZW4pID09PSBwZW5kaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2NvcGlsb3RUb2tlbnNCeUdpdGh1Yi5kZWxldGUoZ2l0aHViVG9rZW4pO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2NvcGlsb3RUb2tlbnNCeUdpdGh1Yi5zZXQoZ2l0aHViVG9rZW4sIHBlbmRpbmcpO1xuXHRcdHJldHVybiBwZW5kaW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYnVpbGRDb3BpbG90VG9rZW4oZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8SUNhY2hlZENvcGlsb3RUb2tlbj4ge1xuXHRcdGNvbnN0IGNhcGlDbGllbnQgPSBhd2FpdCB0aGlzLl9nZXRDbGllbnRGb3JUb2tlbihnaXRodWJUb2tlbik7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdbQ29waWxvdEFwaVNlcnZpY2VdIE1pbnRpbmcgQ29waWxvdCBzZXNzaW9uIHRva2VuJyk7XG5cblx0XHRjb25zdCByZXF1ZXN0ID0ge1xuXHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgdG9rZW4gJHtnaXRodWJUb2tlbn1gLFxuXHRcdFx0XHQnWC1HaXRIdWItQXBpLVZlcnNpb24nOiBVU0VSX0FQSV9WRVJTSU9OLFxuXHRcdFx0fSxcblx0XHR9IGFzIGNvbnN0O1xuXHRcdGNvbnN0IGdpdGh1YkFwaU92ZXJyaWRlID0gcHJvY2Vzcy5lbnZbR0lUSFVCX0FQSV9VUkxfT1ZFUlJJREVfRU5WXTtcblx0XHRjb25zdCByZXNwb25zZSA9IGdpdGh1YkFwaU92ZXJyaWRlICYmIGlzQWxsb3dlZENhcGlVcmxPdmVycmlkZShnaXRodWJBcGlPdmVycmlkZSlcblx0XHRcdD8gYXdhaXQgdGhpcy5fZmV0Y2goYCR7Z2l0aHViQXBpT3ZlcnJpZGUucmVwbGFjZSgvXFwvJC8sICcnKX0vY29waWxvdF9pbnRlcm5hbC92Mi90b2tlbmAsIHJlcXVlc3QpXG5cdFx0XHQ6IGF3YWl0IGNhcGlDbGllbnQubWFrZVJlcXVlc3Q8UmVzcG9uc2U+KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiByZXF1ZXN0LmhlYWRlcnMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgdHlwZTogUmVxdWVzdFR5cGUuQ29waWxvdFRva2VuIH0sXG5cdFx0XHQpO1xuXG5cdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKS5jYXRjaCgoKSA9PiAnJyk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvcGlsb3Qgc2Vzc2lvbiB0b2tlbiBtaW50IGZhaWxlZDogJHtyZXNwb25zZS5zdGF0dXN9ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH0gXFx1MjAxNCAke3RleHR9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW52ZWxvcGUgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgSUNvcGlsb3RUb2tlbkVudmVsb3BlO1xuXHRcdGlmICh0eXBlb2YgZW52ZWxvcGUudG9rZW4gIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBlbnZlbG9wZS5leHBpcmVzX2F0ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3BpbG90IHNlc3Npb24gdG9rZW4gbWludCByZXR1cm5lZCBtYWxmb3JtZWQgZW52ZWxvcGUnKTtcblx0XHR9XG5cblx0XHQvLyBQcmVmZXIgYG5vdyArIHJlZnJlc2hfaW5gIG92ZXIgdGhlIHNlcnZlci1yZXBvcnRlZCBgZXhwaXJlc19hdGA6XG5cdFx0Ly8gdXNlcnMgd2l0aCBhIGZhc3QgbG9jYWwgY2xvY2sgY2FuIHNlZSBgZXhwaXJlc19hdGAgYWxyZWFkeSBpbiB0aGVcblx0XHQvLyBwYXN0LCB3aGljaCB3b3VsZCBjYXVzZSB1cyB0byByZS1taW50IG9uIGV2ZXJ5IGNhbGwuIE1pcnJvciB3aGF0XG5cdFx0Ly8gdGhlIENvcGlsb3QgQ2hhdCBleHRlbnNpb24ncyBgUmVmcmVzaGFibGVDb3BpbG90VG9rZW5NYW5hZ2VyYFxuXHRcdC8vIGRvZXMuIEZsb29yIGF0IGBub3cgKyA2MHNgIHNvIGEgbWFsZm9ybWVkL3Nob3J0IGByZWZyZXNoX2luYFxuXHRcdC8vIGNhbid0IHRyaWdnZXIgYSB0aWdodCByZS1taW50IGxvb3AuXG5cdFx0Y29uc3Qgbm93U2Vjb25kcyA9IERhdGUubm93KCkgLyAxMDAwO1xuXHRcdGNvbnN0IHJlZnJlc2hJbiA9IHR5cGVvZiBlbnZlbG9wZS5yZWZyZXNoX2luID09PSAnbnVtYmVyJyA/IGVudmVsb3BlLnJlZnJlc2hfaW4gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3JnYW5pemF0aW9uTGlzdCA9IEFycmF5LmlzQXJyYXkoZW52ZWxvcGUub3JnYW5pemF0aW9uX2xpc3QpXG5cdFx0XHQ/IGVudmVsb3BlLm9yZ2FuaXphdGlvbl9saXN0LmZpbHRlcigob3JnYW5pemF0aW9uKTogb3JnYW5pemF0aW9uIGlzIHN0cmluZyA9PiB0eXBlb2Ygb3JnYW5pemF0aW9uID09PSAnc3RyaW5nJylcblx0XHRcdDogW107XG5cdFx0Y29uc3QgZXhwaXJlc0F0ID0gTWF0aC5tYXgoXG5cdFx0XHRyZWZyZXNoSW4gIT09IHVuZGVmaW5lZCA/IG5vd1NlY29uZHMgKyByZWZyZXNoSW4gOiBlbnZlbG9wZS5leHBpcmVzX2F0LFxuXHRcdFx0bm93U2Vjb25kcyArIDYwLFxuXHRcdCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9rZW46IGVudmVsb3BlLnRva2VuLFxuXHRcdFx0ZXhwaXJlc0F0LFxuXHRcdFx0aXNJbnRlcm5hbDogb3JnYW5pemF0aW9uTGlzdC5zb21lKG9yZ2FuaXphdGlvbiA9PiBJTlRFUk5BTF9DT1BJTE9UX09SR0FOSVpBVElPTlMuaGFzKG9yZ2FuaXphdGlvbikpLFxuXHRcdFx0aXNWc2NvZGVUZWFtTWVtYmVyOiBvcmdhbml6YXRpb25MaXN0LnNvbWUob3JnYW5pemF0aW9uID0+IFZTQ09ERV9DT1BJTE9UX09SR0FOSVpBVElPTlMuaGFzKG9yZ2FuaXphdGlvbikpLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgY29uY3JldGUgQ0FQSSBtb2RlbCBpZCBmb3IgdGhlIHN1cHBsaWVkIGZhbWlseSAoZS5nLlxuXHQgKiBgZ3B0LTRvLW1pbmlgKS4gQ2FjaGVkIHdpdGggdGhlIHBlci1HaXRIdWItdG9rZW4gQ0FQSSBjbGllbnQgc29cblx0ICogZW5kcG9pbnQgb3IgYXV0aGVudGljYXRpb24gaW52YWxpZGF0aW9uIGFsc28gY2xlYXJzIHRoZSBtb2RlbCBpZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVVdGlsaXR5TW9kZWxJZChnaXRodWJUb2tlbjogc3RyaW5nLCBtb2RlbEZhbWlseTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IHRoaXMuX2dldEVudHJ5Rm9yVG9rZW4oZ2l0aHViVG9rZW4pO1xuXHRcdGNvbnN0IGNhY2hlZCA9IGVudHJ5LnV0aWxpdHlNb2RlbElkc0J5RmFtaWx5LmdldChtb2RlbEZhbWlseSk7XG5cdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZDtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLm1vZGVscyhnaXRodWJUb2tlbik7XG5cdFx0Y29uc3QgbWF0Y2ggPSBtb2RlbHMuZmluZChtID0+IG0uY2FwYWJpbGl0aWVzPy5mYW1pbHkgPT09IG1vZGVsRmFtaWx5KTtcblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIENBUEkgbW9kZWwgYXZhaWxhYmxlIGZvciBmYW1pbHkgJyR7bW9kZWxGYW1pbHl9J2ApO1xuXHRcdH1cblxuXHRcdGVudHJ5LnV0aWxpdHlNb2RlbElkc0J5RmFtaWx5LnNldChtb2RlbEZhbWlseSwgbWF0Y2guaWQpO1xuXHRcdHJldHVybiBtYXRjaC5pZDtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFNTRSBQYXJzaW5nXG5cblx0cHJpdmF0ZSBhc3luYyAqX3JlYWRTU0UoYm9keTogUmVhZGFibGVTdHJlYW08VWludDhBcnJheT4pOiBBc3luY0dlbmVyYXRvcjxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50PiB7XG5cdFx0Y29uc3QgcmVhZGVyID0gYm9keS5nZXRSZWFkZXIoKTtcblx0XHRjb25zdCBkZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKCk7XG5cdFx0bGV0IGJ1ZmZlciA9ICcnO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGNvbnN0IHsgZG9uZSwgdmFsdWUgfSA9IGF3YWl0IHJlYWRlci5yZWFkKCk7XG5cdFx0XHRcdGlmIChkb25lKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRidWZmZXIgKz0gZGVjb2Rlci5kZWNvZGUodmFsdWUsIHsgc3RyZWFtOiB0cnVlIH0pO1xuXHRcdFx0XHRjb25zdCBsaW5lcyA9IGJ1ZmZlci5zcGxpdCgnXFxuJyk7XG5cdFx0XHRcdGJ1ZmZlciA9IGxpbmVzLnBvcCgpID8/ICcnO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0XHRcdGNvbnN0IGV2ZW50ID0gdGhpcy5fcGFyc2VEYXRhTGluZShsaW5lKTtcblx0XHRcdFx0XHRpZiAoZXZlbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0eWllbGQgZXZlbnQ7XG5cdFx0XHRcdFx0XHRpZiAoZXZlbnQudHlwZSA9PT0gJ21lc3NhZ2Vfc3RvcCcpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYnVmZmVyLnRyaW0oKSkge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IHRoaXMuX3BhcnNlRGF0YUxpbmUoYnVmZmVyKTtcblx0XHRcdFx0aWYgKGV2ZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR5aWVsZCBldmVudDtcblx0XHRcdFx0XHRpZiAoZXZlbnQudHlwZSA9PT0gJ21lc3NhZ2Vfc3RvcCcpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gQ2FuY2VsIHRoZSB1bmRlcmx5aW5nIHN0cmVhbSBzbyB0aGUgSFRUUCBjb25uZWN0aW9uIGlzIHJlbGVhc2VkXG5cdFx0XHQvLyBldmVuIHdoZW4gdGhlIGNvbnN1bWVyIGFiYW5kb25zIHRoZSBnZW5lcmF0b3IgZWFybHkgKGJyZWFrLCB0aHJvdyxcblx0XHRcdC8vIGFib3J0KSBvciB0aGUgc3RyZWFtIGVuZGVkIG9uIGBtZXNzYWdlX3N0b3BgIHdpdGggYnl0ZXMgc3RpbGwgaW5cblx0XHRcdC8vIGZsaWdodC4gYHJlbGVhc2VMb2NrYCBhbG9uZSBsZWF2ZXMgdGhlIGJvZHkgaGFsZi1yZWFkLlxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcmVhZGVyLmNhbmNlbCgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBcdTIwMTQgY2FuY2VsbGF0aW9uIGlzIGJlc3QtZWZmb3J0IGNsZWFudXBcblx0XHRcdH1cblx0XHRcdHJlYWRlci5yZWxlYXNlTG9jaygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAcmV0dXJucyB0aGUgcGFyc2VkIHN0cmVhbSBldmVudCwgb3IgYHVuZGVmaW5lZGAgdG8gc2tpcCB0aGUgbGluZS5cblx0ICogQHRocm93cyBvbiBgZXJyb3JgIGV2ZW50cyBmcm9tIHRoZSBzZXJ2ZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9wYXJzZURhdGFMaW5lKGxpbmU6IHN0cmluZyk6IEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghbGluZS5zdGFydHNXaXRoKCdkYXRhOiAnKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gbGluZS5zbGljZSgnZGF0YTogJy5sZW5ndGgpLnRyaW0oKTtcblxuXHRcdGxldCBwYXJzZWQ6IHVua25vd247XG5cdFx0dHJ5IHtcblx0XHRcdHBhcnNlZCA9IEpTT04ucGFyc2UoZGF0YSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb3BpbG90QXBpU2VydmljZV0gRmFpbGVkIHRvIHBhcnNlIFNTRSBkYXRhOicsIGRhdGEpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHBhcnNlZCAhPT0gJ29iamVjdCcgfHwgcGFyc2VkID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlY29yZCA9IHBhcnNlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRjb25zdCB0eXBlID0gcmVjb3JkLnR5cGU7XG5cdFx0aWYgKHR5cGVvZiB0eXBlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xuXHRcdFx0Ly8gUHJlc2VydmUgdGhlIHVwc3RyZWFtIGVudmVsb3BlIHZlcmJhdGltIHdoZW4gaXQgY29uZm9ybXMgdG8gdGhlXG5cdFx0XHQvLyBBbnRocm9waWMgc2hhcGUgKHNvIGFueSBleHRyYSBmaWVsZHMgcHJvcGFnYXRlIHRvIFBoYXNlIDInc1xuXHRcdFx0Ly8gcGFzc3Rocm91Z2ggcHJveHkpLiBGYWxsIGJhY2sgdG8gYSBjbGVhbiBhcGlfZXJyb3Igc3ludGhlc2lzXG5cdFx0XHQvLyB3aGVuIGZpZWxkcyBhcmUgbWlzc2luZyBvciBgZXJyb3JgIGlzIHVuc3RydWN0dXJlZC5cblx0XHRcdGNvbnN0IHJhd0Vycm9yID0gKHBhcnNlZCBhcyB7IGVycm9yPzogdW5rbm93biB9KS5lcnJvcjtcblx0XHRcdGxldCBlbnZlbG9wZTogQW50aHJvcGljLkVycm9yUmVzcG9uc2U7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdHJhd0Vycm9yICYmIHR5cGVvZiByYXdFcnJvciA9PT0gJ29iamVjdCdcblx0XHRcdFx0JiYgdHlwZW9mIChyYXdFcnJvciBhcyB7IHR5cGU/OiB1bmtub3duIH0pLnR5cGUgPT09ICdzdHJpbmcnXG5cdFx0XHRcdCYmIHR5cGVvZiAocmF3RXJyb3IgYXMgeyBtZXNzYWdlPzogdW5rbm93biB9KS5tZXNzYWdlID09PSAnc3RyaW5nJ1xuXHRcdFx0KSB7XG5cdFx0XHRcdGVudmVsb3BlID0gcGFyc2VkIGFzIEFudGhyb3BpYy5FcnJvclJlc3BvbnNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGVycm9yTWVzc2FnZTogc3RyaW5nO1xuXHRcdFx0XHRpZiAodHlwZW9mIHJhd0Vycm9yID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGVycm9yTWVzc2FnZSA9IHJhd0Vycm9yO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiAocmF3RXJyb3IgYXMgeyBtZXNzYWdlPzogdW5rbm93biB9IHwgdW5kZWZpbmVkKT8ubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2UgPSAocmF3RXJyb3IgYXMgeyBtZXNzYWdlOiBzdHJpbmcgfSkubWVzc2FnZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2UgPSAnVW5rbm93biBzdHJlYW1pbmcgZXJyb3InO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVudmVsb3BlID0ge1xuXHRcdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ2FwaV9lcnJvcicsIG1lc3NhZ2U6IGVycm9yTWVzc2FnZSB9LFxuXHRcdFx0XHRcdHJlcXVlc3RfaWQ6IG51bGwsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgQ29waWxvdEFwaUVycm9yKENPUElMT1RfQVBJX0VSUk9SX1NUQVRVU19TVFJFQU1JTkcsIGVudmVsb3BlKTtcblx0XHR9XG5cblx0XHRpZiAoIUtOT1dOX1NTRV9FVkVOVF9UWVBFUy5oYXModHlwZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhcnNlZCBhcyBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50O1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxufVxuXG5jb25zdCBLTk9XTl9TU0VfRVZFTlRfVFlQRVMgPSBuZXcgU2V0KFtcblx0J21lc3NhZ2Vfc3RhcnQnLCAnbWVzc2FnZV9kZWx0YScsICdtZXNzYWdlX3N0b3AnLFxuXHQnY29udGVudF9ibG9ja19zdGFydCcsICdjb250ZW50X2Jsb2NrX2RlbHRhJywgJ2NvbnRlbnRfYmxvY2tfc3RvcCcsXG5dKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxZQUFZLG1CQUE4RDtBQUNuRixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQixvQkFBb0I7QUFDN0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywrQkFBK0I7QUFzSWpDLE1BQU0scUNBQXFDO0FBT2xELE1BQU0sc0NBQXNDLElBQUk7QUFHaEQsTUFBTSwyQkFBMkIsS0FBSztBQUV0QyxNQUFNLG1CQUFtQjtBQWdCekIsTUFBTSx3QkFBd0I7QUFDOUIsTUFBTSxvQ0FBb0M7QUFDMUMsTUFBTSxtQ0FBbUM7QUFDekMsTUFBTSw4QkFBOEI7QUFHcEMsU0FBUyxjQUFjLEtBQXNCO0FBQzVDLE1BQUk7QUFDSixNQUFJO0FBQ0gsZUFBVyxJQUFJLElBQUksR0FBRyxFQUFFO0FBQUEsRUFDekIsUUFBUTtBQUNQLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxPQUFPLFNBQVMsUUFBUSxZQUFZLEVBQUUsRUFBRSxZQUFZO0FBQzFELFNBQU8sU0FBUyxlQUFlLFNBQVMsU0FBUyx3QkFBd0IsS0FBSyxJQUFJO0FBQ25GO0FBRUEsU0FBUyx5QkFBeUIsS0FBc0I7QUFDdkQsTUFBSSxjQUFjLEdBQUcsR0FBRztBQUN2QixXQUFPO0FBQUEsRUFDUjtB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
