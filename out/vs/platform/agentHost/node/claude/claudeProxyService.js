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
import { once } from "events";
import { Emitter } from "../../../../base/common/event.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import {
  COPILOT_API_ERROR_STATUS_STREAMING,
  CopilotApiError,
  ICopilotApiService
} from "../shared/copilotApiService.js";
import { buildForwardedChatError, encodeForwardedChatError } from "../shared/proxyChatError.js";
import {
  LoopbackProxyServer,
  readProxyRequestBody
} from "../shared/loopbackProxyServer.js";
import { filterSupportedBetas } from "./anthropicBetas.js";
import {
  buildErrorEnvelope,
  formatSseErrorFrame,
  writeJsonError,
  writeUpstreamJsonError
} from "./anthropicErrors.js";
import { tryParseClaudeModelId } from "./claudeModelId.js";
import { parseProxyBearer } from "./claudeProxyAuth.js";
const IClaudeProxyService = createDecorator("claudeProxyService");
const KNOWN_CLAUDE_VENDORS = /* @__PURE__ */ new Set(["anthropic"]);
const ANTHROPIC_MESSAGES_ENDPOINT = "/v1/messages";
const PROXY_USER_FACING_NAME = "ClaudeProxyService";
const USER_AGENT_PREFIX = "vscode_claude_code";
function readCopilotUsageNanoAiu(event) {
  const value = event?.copilot_usage?.total_nano_aiu;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
let ClaudeProxyService = class extends LoopbackProxyServer {
  constructor(logService, _copilotApiService) {
    super(PROXY_USER_FACING_NAME, logService);
    this._copilotApiService = _copilotApiService;
    this._onDidReportCredits = new Emitter();
    this.onDidReportCredits = this._onDidReportCredits.event;
  }
  createState(githubToken) {
    return { githubToken };
  }
  async start(githubToken) {
    const { runtime, release } = await this.acquire(githubToken);
    runtime.state.githubToken = githubToken;
    return {
      baseUrl: runtime.baseUrl,
      nonce: runtime.nonce,
      dispose: release
    };
  }
  dispose() {
    super.dispose();
    this._onDidReportCredits.dispose();
  }
  writeInternalError(res) {
    writeJsonError(res, 500, "api_error", "Internal proxy error");
  }
  /**
   * Fire {@link onDidReportCredits} for a completed request. No-op when
   * the request carried no credits (`copilot_usage` absent) or the
   * Bearer token lacked a session id (shouldn't happen post-auth).
   */
  _reportCredits(sessionId, totalNanoAiu) {
    if (sessionId === void 0 || totalNanoAiu === void 0) {
      return;
    }
    this._logService.trace(`[${PROXY_USER_FACING_NAME}] credits: session=${sessionId} totalNanoAiu=${totalNanoAiu}`);
    this._onDidReportCredits.fire({ sessionId, totalNanoAiu });
  }
  // #region Dispatch
  async handleRequest(req, res, runtime) {
    const method = req.method ?? "GET";
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    this._logService.trace(`[${PROXY_USER_FACING_NAME}] ${method} ${pathname}`);
    if (method === "GET" && pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    const auth = parseProxyBearer(req.headers, runtime.nonce);
    if (!auth.valid) {
      writeJsonError(res, 401, "authentication_error", "Invalid authentication");
      return;
    }
    if (method === "GET" && pathname === "/v1/models") {
      await this._handleModels(req, res, runtime);
      return;
    }
    if (method === "POST" && pathname === "/v1/messages") {
      await this._handleMessages(req, res, runtime, auth.sessionId);
      return;
    }
    if (method === "POST" && pathname === "/v1/messages/count_tokens") {
      writeJsonError(res, 501, "api_error", "count_tokens not supported by CAPI");
      return;
    }
    writeJsonError(res, 404, "not_found_error", `No route for ${method} ${pathname}`);
  }
  // #endregion
  // #region GET /v1/models
  async _handleModels(req, res, runtime) {
    const headers = buildOutboundHeaders(req.headers);
    let models;
    try {
      models = await this._copilotApiService.models(runtime.state.githubToken, { headers, suppressIntegrationId: true });
    } catch (err) {
      this._writeUpstreamErrorResponse(res, err);
      return;
    }
    const data = [];
    for (const m of models) {
      if (!isAnthropicMessagesModel(m)) {
        continue;
      }
      const parsed = tryParseClaudeModelId(m.id);
      const sdkId = parsed ? parsed.toSdkModelId() : m.id;
      data.push({
        id: sdkId,
        type: "model",
        display_name: m.name || sdkId,
        created_at: "1970-01-01T00:00:00Z",
        capabilities: null,
        max_input_tokens: null,
        max_tokens: null
      });
    }
    const body = {
      data,
      has_more: false,
      first_id: data.length > 0 ? data[0].id : null,
      last_id: data.length > 0 ? data[data.length - 1].id : null
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
  // #endregion
  // #region POST /v1/messages
  async _handleMessages(req, res, runtime, sessionId) {
    let bodyString;
    try {
      bodyString = await readProxyRequestBody(req);
    } catch (err) {
      writeJsonError(res, 400, "invalid_request_error", `Failed to read request body: ${stringifyError(err)}`);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(bodyString);
    } catch {
      writeJsonError(res, 400, "invalid_request_error", "Request body is not valid JSON");
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      writeJsonError(res, 400, "invalid_request_error", "Request body must be a JSON object");
      return;
    }
    const body = parsed;
    const sdkModelId = body.model;
    if (typeof sdkModelId !== "string" || sdkModelId.length === 0) {
      writeJsonError(res, 400, "invalid_request_error", "Missing required field: model");
      return;
    }
    if (!Array.isArray(body.messages)) {
      writeJsonError(res, 400, "invalid_request_error", "Missing required field: messages");
      return;
    }
    const parsedModel = tryParseClaudeModelId(sdkModelId);
    if (!parsedModel) {
      writeJsonError(res, 404, "not_found_error", `Unknown model: ${sdkModelId}`);
      return;
    }
    const endpointModelId = parsedModel.toEndpointModelId();
    body.model = endpointModelId;
    const stream = body.stream === true;
    const headers = buildOutboundHeaders(req.headers);
    const entry = {
      ac: new AbortController(),
      res,
      clientGone: false
    };
    runtime.inFlight.add(entry);
    const onClose = () => {
      entry.clientGone = true;
      entry.ac.abort();
    };
    res.on("close", onClose);
    try {
      if (stream) {
        await this._streamMessages(
          body,
          headers,
          res,
          entry,
          runtime,
          sdkModelId,
          sessionId
        );
      } else {
        await this._sendNonStreamingMessage(
          body,
          headers,
          res,
          entry,
          runtime,
          sdkModelId,
          sessionId
        );
      }
    } finally {
      res.removeListener("close", onClose);
      runtime.inFlight.delete(entry);
    }
  }
  async _sendNonStreamingMessage(body, headers, res, entry, runtime, originalSdkModelId, sessionId) {
    const options = { headers, signal: entry.ac.signal, suppressIntegrationId: true };
    let message;
    try {
      message = await this._copilotApiService.messages(runtime.state.githubToken, body, options);
    } catch (err) {
      if (entry.ac.signal.aborted) {
        if (!entry.clientGone && !res.writableEnded) {
          res.destroy();
        }
        return;
      }
      this._writeUpstreamErrorResponse(res, err, true);
      return;
    }
    this._reportCredits(sessionId, readCopilotUsageNanoAiu(message));
    const outboundModel = rewriteModelToSdk(message.model, this._logService) ?? originalSdkModelId;
    const responseBody = { ...message, model: outboundModel };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(responseBody));
  }
  async _streamMessages(body, headers, res, entry, runtime, _originalSdkModelId, sessionId) {
    const options = { headers, signal: entry.ac.signal, suppressIntegrationId: true };
    let stream;
    try {
      stream = this._copilotApiService.messages(runtime.state.githubToken, body, options);
    } catch (err) {
      if (entry.ac.signal.aborted) {
        if (!entry.clientGone && !res.writableEnded) {
          res.destroy();
        }
        return;
      }
      this._writeUpstreamErrorResponse(res, err, true);
      return;
    }
    let first;
    try {
      first = await stream.next();
    } catch (err) {
      if (entry.ac.signal.aborted) {
        if (!entry.clientGone && !res.writableEnded) {
          res.destroy();
        }
        return;
      }
      this._writeUpstreamErrorResponse(res, err, true);
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    res.flushHeaders();
    req_setNoDelay(res);
    const writeFrame = async (event) => {
      const transformed = rewriteEventModel(event, this._logService);
      const frame = `event: ${transformed.type}
data: ${JSON.stringify(transformed)}

`;
      const ok = res.write(frame);
      if (!ok) {
        try {
          await once(res, "drain", { signal: entry.ac.signal });
        } catch {
          return false;
        }
      }
      return true;
    };
    let reportedNanoAiu;
    try {
      if (!first.done) {
        reportedNanoAiu = readCopilotUsageNanoAiu(first.value) ?? reportedNanoAiu;
        const ok = await writeFrame(first.value);
        if (!ok) {
          return;
        }
      }
      while (true) {
        let next;
        try {
          next = await stream.next();
        } catch (err) {
          if (entry.ac.signal.aborted) {
            if (!entry.clientGone && !res.writableEnded) {
              res.destroy();
            }
            return;
          }
          const envelope = err instanceof CopilotApiError ? embedForwardedChatError(err) : buildErrorEnvelope("api_error", stringifyError(err));
          if (!res.writableEnded) {
            try {
              res.write(formatSseErrorFrame(envelope));
            } catch {
            }
            try {
              res.end();
            } catch {
            }
          }
          return;
        }
        if (next.done) {
          break;
        }
        reportedNanoAiu = readCopilotUsageNanoAiu(next.value) ?? reportedNanoAiu;
        const ok = await writeFrame(next.value);
        if (!ok) {
          return;
        }
      }
      if (!res.writableEnded) {
        res.end();
      }
      this._reportCredits(sessionId, reportedNanoAiu);
    } catch (err) {
      this._logService.warn(`[${PROXY_USER_FACING_NAME}] stream loop unexpected error: ${stringifyError(err)}`);
      if (!res.writableEnded) {
        try {
          res.end();
        } catch {
        }
      }
    }
  }
  // #endregion
  // #region Error helpers
  /**
   * Writes an upstream error as a JSON response. When `embedChatError` is set
   * (the `/v1/messages` paths), a `VSCODE_PROXY_ERROR` marker is appended to
   * the envelope message so the structured CAPI error round-trips back through
   * the SDK subprocess to the agent host (which decodes it into `_meta` and
   * strips the marker). The `/v1/models` path does not round-trip, so it
   * re-emits the envelope verbatim.
   */
  _writeUpstreamErrorResponse(res, err, embedChatError = false) {
    if (res.headersSent) {
      this._logService.warn(`[${PROXY_USER_FACING_NAME}] cannot write upstream error after headers sent: ${stringifyError(err)}`);
      if (!res.writableEnded) {
        try {
          res.end();
        } catch {
        }
      }
      return;
    }
    if (err instanceof CopilotApiError) {
      const status = err.status === COPILOT_API_ERROR_STATUS_STREAMING ? 502 : err.status;
      writeUpstreamJsonError(res, status, embedChatError ? embedForwardedChatError(err) : err.envelope);
      return;
    }
    writeJsonError(res, 502, "api_error", err instanceof Error ? err.message : String(err));
  }
  // #endregion
};
ClaudeProxyService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ICopilotApiService)
], ClaudeProxyService);
function isAnthropicMessagesModel(m) {
  if (!KNOWN_CLAUDE_VENDORS.has(m.vendor.toLowerCase())) {
    return false;
  }
  return Array.isArray(m.supported_endpoints) && m.supported_endpoints.includes(ANTHROPIC_MESSAGES_ENDPOINT);
}
function rewriteModelToSdk(modelId, logService) {
  const parsed = tryParseClaudeModelId(modelId);
  if (!parsed) {
    logService.warn(`[${PROXY_USER_FACING_NAME}] outbound model ID could not be parsed for SDK rewrite: ${modelId}`);
    return void 0;
  }
  return parsed.toSdkModelId();
}
function rewriteEventModel(event, logService) {
  if (event.type !== "message_start") {
    return event;
  }
  const sdkModel = rewriteModelToSdk(event.message.model, logService);
  if (sdkModel === void 0 || sdkModel === event.message.model) {
    return event;
  }
  return {
    ...event,
    message: { ...event.message, model: sdkModel }
  };
}
function buildOutboundHeaders(inbound) {
  const out = {};
  const version = inbound["anthropic-version"];
  if (typeof version === "string" && version.length > 0) {
    out["anthropic-version"] = version;
  }
  const beta = inbound["anthropic-beta"];
  if (typeof beta === "string" && beta.length > 0) {
    const filtered = filterSupportedBetas(beta);
    if (filtered !== void 0) {
      out["anthropic-beta"] = filtered;
    }
  }
  const userAgent = inbound["user-agent"];
  if (typeof userAgent === "string" && userAgent.length > 0) {
    out["User-Agent"] = transformUserAgent(userAgent);
  }
  return out;
}
function transformUserAgent(userAgent) {
  const slashIndex = userAgent.indexOf("/");
  if (slashIndex === -1) {
    return `${USER_AGENT_PREFIX}/${userAgent}`;
  }
  return `${USER_AGENT_PREFIX}${userAgent.substring(slashIndex)}`;
}
function req_setNoDelay(res) {
  const socket = res.socket;
  if (socket && typeof socket.setNoDelay === "function") {
    try {
      socket.setNoDelay(true);
    } catch {
    }
  }
}
function stringifyError(err) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
function embedForwardedChatError(err) {
  const marker = encodeForwardedChatError(buildForwardedChatError(err));
  return {
    ...err.envelope,
    error: {
      ...err.envelope.error,
      message: `${err.envelope.error.message} ${marker}`
    }
  };
}
export {
  ClaudeProxyService,
  IClaudeProxyService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjbGF1ZGVcXGNsYXVkZVByb3h5U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIEFudGhyb3BpYyBmcm9tICdAYW50aHJvcGljLWFpL3Nkayc7XG5pbXBvcnQgdHlwZSB7IENDQU1vZGVsIH0gZnJvbSAnQHZzY29kZS9jb3BpbG90LWFwaSc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyBvbmNlIH0gZnJvbSAnZXZlbnRzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7XG5cdENPUElMT1RfQVBJX0VSUk9SX1NUQVRVU19TVFJFQU1JTkcsXG5cdENvcGlsb3RBcGlFcnJvcixcblx0SUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHR0eXBlIElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxufSBmcm9tICcuLi9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3IsIGVuY29kZUZvcndhcmRlZENoYXRFcnJvciB9IGZyb20gJy4uL3NoYXJlZC9wcm94eUNoYXRFcnJvci5qcyc7XG5pbXBvcnQge1xuXHRJUHJveHlJbkZsaWdodCxcblx0SUxvb3BiYWNrUHJveHlIYW5kbGUsXG5cdElMb29wYmFja1Byb3h5UnVudGltZSxcblx0TG9vcGJhY2tQcm94eVNlcnZlcixcblx0cmVhZFByb3h5UmVxdWVzdEJvZHksXG59IGZyb20gJy4uL3NoYXJlZC9sb29wYmFja1Byb3h5U2VydmVyLmpzJztcbmltcG9ydCB7IGZpbHRlclN1cHBvcnRlZEJldGFzIH0gZnJvbSAnLi9hbnRocm9waWNCZXRhcy5qcyc7XG5pbXBvcnQge1xuXHRidWlsZEVycm9yRW52ZWxvcGUsXG5cdGZvcm1hdFNzZUVycm9yRnJhbWUsXG5cdHdyaXRlSnNvbkVycm9yLFxuXHR3cml0ZVVwc3RyZWFtSnNvbkVycm9yLFxufSBmcm9tICcuL2FudGhyb3BpY0Vycm9ycy5qcyc7XG5pbXBvcnQgeyB0cnlQYXJzZUNsYXVkZU1vZGVsSWQgfSBmcm9tICcuL2NsYXVkZU1vZGVsSWQuanMnO1xuaW1wb3J0IHsgcGFyc2VQcm94eUJlYXJlciB9IGZyb20gJy4vY2xhdWRlUHJveHlBdXRoLmpzJztcblxuLy8gI3JlZ2lvbiBQdWJsaWMgdHlwZXNcblxuLyoqXG4gKiBIYW5kbGUgcmV0dXJuZWQgYnkge0BsaW5rIElDbGF1ZGVQcm94eVNlcnZpY2Uuc3RhcnR9LiBSZWZjb3VudHMgdGhlXG4gKiB1bmRlcmx5aW5nIHNlcnZlcjogd2hlbiBldmVyeSBoYW5kbGUgaXMgZGlzcG9zZWQsIHRoZSBsaXN0ZW5lciBjbG9zZXMsXG4gKiB0aGUgdG9rZW4gc2xvdCBjbGVhcnMsIGFuZCB0aGUgbm9uY2UgaXMgZGVzdHJveWVkLiBUaGUgbmV4dCBgc3RhcnQoKWBcbiAqIGNhbGwgcmViaW5kcyB3aXRoIGEgbmV3IHBvcnQgYW5kIGEgZnJlc2ggbm9uY2UuXG4gKlxuICogKipTdWJwcm9jZXNzIG93bmVyc2hpcCBpbnZhcmlhbnQuKiogQ2FsbGVycyB0aGF0IGhhbmQgYGJhc2VVcmxgIC9cbiAqIGBub25jZWAgdG8gYSBDbGF1ZGUgU0RLIHN1YnByb2Nlc3MgTVVTVCBraWxsIHRoYXQgc3VicHJvY2VzcyBiZWZvcmVcbiAqIGNhbGxpbmcgYGRpc3Bvc2UoKWAuIFRoZSBzdWJwcm9jZXNzIGNhbm5vdCBvdXRsaXZlIHRoZSBoYW5kbGUgXHUyMDE0XG4gKiBhZnRlciBgZGlzcG9zZSgpYCB0aGUgcHJveHkgbWF5IHJlYmluZCBvbiBhIGRpZmZlcmVudCBwb3J0IGFuZCB0aGVcbiAqIHN1YnByb2Nlc3Mgd291bGQgc2lsZW50bHkgbG9zZSBpdHMgZW5kcG9pbnQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNsYXVkZVByb3h5SGFuZGxlIGV4dGVuZHMgSUxvb3BiYWNrUHJveHlIYW5kbGUge1xuXHQvKiogZS5nLiBgaHR0cDovLzEyNy4wLjAuMTo1NDMyMWAgXHUyMDE0IG5vIHRyYWlsaW5nIHNsYXNoLiAqL1xuXHRyZWFkb25seSBiYXNlVXJsOiBzdHJpbmc7XG5cdC8qKiAyNTYtYml0IGhleCBzdHJpbmcuIENvbWJpbmUgd2l0aCBhIHNlc3Npb24gaWQgYXMgYEJlYXJlciA8bm9uY2U+LjxzZXNzaW9uSWQ+YC4gKi9cblx0cmVhZG9ubHkgbm9uY2U6IHN0cmluZztcbn1cblxuLyoqXG4gKiBIb3cgdGhlIENsYXVkZSBwcm92aWRlciByZWFjaGVzIEFudGhyb3BpYywgcmVzb2x2ZWQgb25jZSBwZXIgc2Vzc2lvbiBhdFxuICogbWF0ZXJpYWxpemUgdGltZSBhbmQgdGhyZWFkZWQgYXMgZGF0YSB0aHJvdWdoIGBJTWF0ZXJpYWxpemVDb250ZXh0YCBpbnRvXG4gKiBgYnVpbGRPcHRpb25zYCAvIGBidWlsZFN1YnByb2Nlc3NFbnZgLlxuICpcbiAqIC0gYHByb3h5YDogQ29waWxvdC1yb3V0ZWQgQ2xhdWRlICh0aGUgZGVmYXVsdCkuIEFsbCBgbWVzc2FnZXNgIHRyYWZmaWMgZ29lc1xuICogICB0aHJvdWdoIHRoZSBsb2NhbCB7QGxpbmsgSUNsYXVkZVByb3h5SGFuZGxlfSBcdTIxOTIgQ29waWxvdCBDQVBJLlxuICogLSBgbmF0aXZlYDogQllPLUFudGhyb3BpYyAoUGhhc2UgMTkpLiBUaGUgU0RLIHRhbGtzIHRvIEFudGhyb3BpYyBkaXJlY3RseSBvblxuICogICB0aGUgdXNlcidzIG93biBjcmVkZW50aWFscyAoYEFOVEhST1BJQ19BUElfS0VZYCwgb3IgYSBzdWJzY3JpcHRpb24gT0F1dGhcbiAqICAgdG9rZW4gaW4gYENMQVVERV9DT0RFX09BVVRIX1RPS0VOYCBmcm9tIGBjbGF1ZGUgc2V0dXAtdG9rZW5gKTsgbm8gcHJveHkgaXNcbiAqICAgaW52b2x2ZWQuIFRoZSBTREsncyBidW5kbGVkIGBjbGF1ZGVgIENMSSBydW5zIHRoZSB0dXJuLlxuICovXG5leHBvcnQgdHlwZSBDbGF1ZGVUcmFuc3BvcnQgPVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3Byb3h5JzsgcmVhZG9ubHkgaGFuZGxlOiBJQ2xhdWRlUHJveHlIYW5kbGUgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ25hdGl2ZScgfTtcblxuLyoqXG4gKiBBIHBlci1yZXF1ZXN0IGNyZWRpdHMgcmVwb3J0LiBDQVBJIHJldHVybnMgdGhlIGFjdHVhbCBiaWxsZWQgY3JlZGl0c1xuICogZm9yIGEgYC92MS9tZXNzYWdlc2AgcmVxdWVzdCBhcyBgY29waWxvdF91c2FnZS50b3RhbF9uYW5vX2FpdWAgb24gdGhlXG4gKiBBbnRocm9waWMgU1NFIHN0cmVhbS4gVGhlIENsYXVkZSBTREsgc3VicHJvY2VzcyBzdHJpcHMgdGhpcyBmaWVsZCBmcm9tXG4gKiBpdHMgYHJlc3VsdGAgbWVzc2FnZSwgc28gdGhlIHByb3h5IFx1MjAxNCB3aGljaCBzZWVzIHRoZSByYXcgQ0FQSSByZXNwb25zZSBcdTIwMTRcbiAqIGlzIHRoZSBvbmx5IHBsYWNlIHRoZSByZWFsIGJpbGxlZCBhbW91bnQgc3Vydml2ZXMuIGBzZXNzaW9uSWRgIGlzXG4gKiBkZWNvZGVkIGZyb20gdGhlIHByb3h5IEJlYXJlciB0b2tlbiAoYDxub25jZT4uPHNlc3Npb25JZD5gKSBzbyBjb25zdW1lcnNcbiAqIGNhbiBhdHRyaWJ1dGUgY3JlZGl0cyB0byB0aGUgb3JpZ2luYXRpbmcgc2Vzc2lvbi90dXJuLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDbGF1ZGVQcm94eUNyZWRpdHNSZXBvcnQge1xuXHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZztcblx0LyoqIEJpbGxlZCBjcmVkaXRzIGZvciB0aGUgcmVxdWVzdCwgaW4gbmFuby1BSVUgKDEgY3JlZGl0ID0gMWU5IG5hbm8tQUlVKS4gKi9cblx0cmVhZG9ubHkgdG90YWxOYW5vQWl1OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNsYXVkZVByb3h5U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRmlyZXMgb25jZSBwZXIgY29tcGxldGVkIENBUEkgYC92MS9tZXNzYWdlc2AgcmVxdWVzdCB0aGF0IHJlcG9ydGVkXG5cdCAqIGBjb3BpbG90X3VzYWdlLnRvdGFsX25hbm9fYWl1YC4gQ29uc3VtZXJzIGFjY3VtdWxhdGUgcGVyIHR1cm4gdG9cblx0ICogc3VyZmFjZSByZWFsIHBlci10dXJuIENvcGlsb3QgY3JlZGl0cyAodGhlIFNESy1jb21wdXRlZFxuXHQgKiBgdG90YWxfY29zdF91c2RgIGlzIGFuIEFudGhyb3BpYy1saXN0LXByaWNlIGVzdGltYXRlLCBub3QgdGhlXG5cdCAqIGFtb3VudCBDQVBJIGFjdHVhbGx5IGJpbGxzKS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkUmVwb3J0Q3JlZGl0czogRXZlbnQ8SUNsYXVkZVByb3h5Q3JlZGl0c1JlcG9ydD47XG5cblx0LyoqXG5cdCAqIFN0YXJ0IHRoZSBwcm94eSAoaWYgbm90IGFscmVhZHkgcnVubmluZykgYW5kIHJldHVybiBhIHJlZmNvdW50ZWRcblx0ICogaGFuZGxlLiBUaGUgc3VwcGxpZWQgYGdpdGh1YlRva2VuYCBiZWNvbWVzIHRoZSBhY3RpdmUgdG9rZW4gZm9yXG5cdCAqIG91dGJvdW5kIENBUEkgcmVxdWVzdHM7IGlmIG11bHRpcGxlIGNhbGxlcnMgaG9sZCBoYW5kbGVzXG5cdCAqIGNvbmN1cnJlbnRseSwgdGhlIG1vc3QgcmVjZW50IHRva2VuIHdpbnMgKHNpbmdsZS10ZW5hbnQgYXNzdW1wdGlvbixcblx0ICogc2VlIHJvYWRtYXAgc2VjdGlvbiA2KS5cblx0ICovXG5cdHN0YXJ0KGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElDbGF1ZGVQcm94eUhhbmRsZT47XG5cblx0LyoqXG5cdCAqIEZvcmNlLWNsb3NlIHRoZSBwcm94eSByZWdhcmRsZXNzIG9mIHJlZmNvdW50IGFuZCBhYm9ydCBhbnlcblx0ICogaW4tZmxpZ2h0IHJlcXVlc3RzLiBJZGVtcG90ZW50LiBTdWJzZXF1ZW50IGBzdGFydCgpYCBjYWxscyByZWJpbmQuXG5cdCAqL1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjb25zdCBJQ2xhdWRlUHJveHlTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDbGF1ZGVQcm94eVNlcnZpY2U+KCdjbGF1ZGVQcm94eVNlcnZpY2UnKTtcblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIEludGVybmFsIHN0YXRlXG5cbi8qKiBTdWJjbGFzcy1vd25lZCBwZXItYmluZCBtdXRhYmxlIHN0YXRlOiB0aGUgYWN0aXZlIG91dGJvdW5kIENBUEkgdG9rZW4uICovXG5pbnRlcmZhY2UgSUNsYXVkZVByb3h5U3RhdGUge1xuXHRnaXRodWJUb2tlbjogc3RyaW5nO1xufVxuXG50eXBlIElDbGF1ZGVQcm94eVJ1bnRpbWUgPSBJTG9vcGJhY2tQcm94eVJ1bnRpbWU8SUNsYXVkZVByb3h5U3RhdGU+O1xuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gSW1wbGVtZW50YXRpb25cblxuY29uc3QgS05PV05fQ0xBVURFX1ZFTkRPUlMgPSBuZXcgU2V0KFsnYW50aHJvcGljJ10pO1xuY29uc3QgQU5USFJPUElDX01FU1NBR0VTX0VORFBPSU5UID0gJy92MS9tZXNzYWdlcyc7XG5jb25zdCBQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FID0gJ0NsYXVkZVByb3h5U2VydmljZSc7XG5jb25zdCBVU0VSX0FHRU5UX1BSRUZJWCA9ICd2c2NvZGVfY2xhdWRlX2NvZGUnO1xuXG4vKipcbiAqIENBUEkgYXVnbWVudHMgdGhlIEFudGhyb3BpYyBgL3YxL21lc3NhZ2VzYCByZXNwb25zZSB3aXRoIHRoZSByZXF1ZXN0J3NcbiAqIGJpbGxlZCBjcmVkaXRzIHVuZGVyIGBjb3BpbG90X3VzYWdlLnRvdGFsX25hbm9fYWl1YC4gVGhlIHB1Ymxpc2hlZFxuICogQW50aHJvcGljIFNESyB0eXBlcyBkb24ndCBkZWNsYXJlIGl0LCBzbyBuYXJyb3cgdGhyb3VnaCB0aGlzIHNoYXBlXG4gKiAobWlycm9ycyBgbWVzc2FnZXNBcGkudHNgIGluIHRoZSBDb3BpbG90IGV4dGVuc2lvbikuXG4gKi9cbmludGVyZmFjZSBJQ29waWxvdFVzYWdlRW52ZWxvcGUge1xuXHRyZWFkb25seSBjb3BpbG90X3VzYWdlPzogeyByZWFkb25seSB0b3RhbF9uYW5vX2FpdT86IG51bWJlciB9O1xufVxuXG4vKipcbiAqIFJlYWQgYGNvcGlsb3RfdXNhZ2UudG90YWxfbmFub19haXVgIG9mZiBhbiBBbnRocm9waWMgc3RyZWFtIGV2ZW50IG9yXG4gKiBtZXNzYWdlLCByZXR1cm5pbmcgYHVuZGVmaW5lZGAgdW5sZXNzIGl0IGlzIGEgZmluaXRlLCBub24tbmVnYXRpdmVcbiAqIG51bWJlci5cbiAqL1xuZnVuY3Rpb24gcmVhZENvcGlsb3RVc2FnZU5hbm9BaXUoZXZlbnQ6IHVua25vd24pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCB2YWx1ZSA9IChldmVudCBhcyBJQ29waWxvdFVzYWdlRW52ZWxvcGUgfCB1bmRlZmluZWQpPy5jb3BpbG90X3VzYWdlPy50b3RhbF9uYW5vX2FpdTtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlKSAmJiB2YWx1ZSA+PSAwID8gdmFsdWUgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogTG9jYWwgSFRUUCBwcm94eSB0aGF0IHNwZWFrcyB0aGUgQW50aHJvcGljIE1lc3NhZ2VzIEFQSSBvbiB0aGUgaW5ib3VuZFxuICogc2lkZSBhbmQge0BsaW5rIElDb3BpbG90QXBpU2VydmljZX0gb24gdGhlIG91dGJvdW5kIHNpZGUuIFRoZSBDbGF1ZGVcbiAqIEFnZW50IFNESyBjb25uZWN0cyB2aWEgYEFOVEhST1BJQ19CQVNFX1VSTGAgKyBgQU5USFJPUElDX0FVVEhfVE9LRU5gXG4gKiBhbmQgc2VlcyB0aGlzIGFzIGEgcmVhbCBBbnRocm9waWMgZW5kcG9pbnQuXG4gKlxuICogTGlmZWN5Y2xlIGlzIHJlZmNvdW50ZWQgdmlhIHtAbGluayBJQ2xhdWRlUHJveHlIYW5kbGV9OyBzZWVcbiAqIHtAbGluayBJQ2xhdWRlUHJveHlTZXJ2aWNlLnN0YXJ0fSBhbmQgdGhlIHN1YnByb2Nlc3Mtb3duZXJzaGlwXG4gKiBpbnZhcmlhbnQgb24gYElDbGF1ZGVQcm94eUhhbmRsZWAuXG4gKi9cbmV4cG9ydCBjbGFzcyBDbGF1ZGVQcm94eVNlcnZpY2UgZXh0ZW5kcyBMb29wYmFja1Byb3h5U2VydmVyPElDbGF1ZGVQcm94eVN0YXRlLCBzdHJpbmc+IGltcGxlbWVudHMgSUNsYXVkZVByb3h5U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXBvcnRDcmVkaXRzID0gbmV3IEVtaXR0ZXI8SUNsYXVkZVByb3h5Q3JlZGl0c1JlcG9ydD4oKTtcblx0cmVhZG9ubHkgb25EaWRSZXBvcnRDcmVkaXRzOiBFdmVudDxJQ2xhdWRlUHJveHlDcmVkaXRzUmVwb3J0PiA9IHRoaXMuX29uRGlkUmVwb3J0Q3JlZGl0cy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FLCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVTdGF0ZShnaXRodWJUb2tlbjogc3RyaW5nKTogSUNsYXVkZVByb3h5U3RhdGUge1xuXHRcdHJldHVybiB7IGdpdGh1YlRva2VuIH07XG5cdH1cblxuXHRhc3luYyBzdGFydChnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxJQ2xhdWRlUHJveHlIYW5kbGU+IHtcblx0XHRjb25zdCB7IHJ1bnRpbWUsIHJlbGVhc2UgfSA9IGF3YWl0IHRoaXMuYWNxdWlyZShnaXRodWJUb2tlbik7XG5cdFx0Ly8gTGF0ZS1iaW5kaW5nIHRva2VuIHVwZGF0ZSBjb3ZlcnMgdGhlIGNhc2Ugd2hlcmUgbXVsdGlwbGVcblx0XHQvLyBjb25jdXJyZW50IGNhbGxlcnMgYXdhaXRlZCB0aGUgc2FtZSBiaW5kIFx1MjAxNCBsYXN0IGNhbGxlcidzIHRva2VuXG5cdFx0Ly8gd2lucywgbWF0Y2hpbmcgdGhlIHNpbmdsZS10ZW5hbnQgY29udHJhY3QuXG5cdFx0cnVudGltZS5zdGF0ZS5naXRodWJUb2tlbiA9IGdpdGh1YlRva2VuO1xuXHRcdHJldHVybiB7XG5cdFx0XHRiYXNlVXJsOiBydW50aW1lLmJhc2VVcmwsXG5cdFx0XHRub25jZTogcnVudGltZS5ub25jZSxcblx0XHRcdGRpc3Bvc2U6IHJlbGVhc2UsXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkUmVwb3J0Q3JlZGl0cy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgd3JpdGVJbnRlcm5hbEVycm9yKHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IHZvaWQge1xuXHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNTAwLCAnYXBpX2Vycm9yJywgJ0ludGVybmFsIHByb3h5IGVycm9yJyk7XG5cdH1cblxuXHQvKipcblx0ICogRmlyZSB7QGxpbmsgb25EaWRSZXBvcnRDcmVkaXRzfSBmb3IgYSBjb21wbGV0ZWQgcmVxdWVzdC4gTm8tb3Agd2hlblxuXHQgKiB0aGUgcmVxdWVzdCBjYXJyaWVkIG5vIGNyZWRpdHMgKGBjb3BpbG90X3VzYWdlYCBhYnNlbnQpIG9yIHRoZVxuXHQgKiBCZWFyZXIgdG9rZW4gbGFja2VkIGEgc2Vzc2lvbiBpZCAoc2hvdWxkbid0IGhhcHBlbiBwb3N0LWF1dGgpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVwb3J0Q3JlZGl0cyhzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdG90YWxOYW5vQWl1OiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoc2Vzc2lvbklkID09PSB1bmRlZmluZWQgfHwgdG90YWxOYW5vQWl1ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dIGNyZWRpdHM6IHNlc3Npb249JHtzZXNzaW9uSWR9IHRvdGFsTmFub0FpdT0ke3RvdGFsTmFub0FpdX1gKTtcblx0XHR0aGlzLl9vbkRpZFJlcG9ydENyZWRpdHMuZmlyZSh7IHNlc3Npb25JZCwgdG90YWxOYW5vQWl1IH0pO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBEaXNwYXRjaFxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBoYW5kbGVSZXF1ZXN0KFxuXHRcdHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsXG5cdFx0cmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLFxuXHRcdHJ1bnRpbWU6IElDbGF1ZGVQcm94eVJ1bnRpbWUsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1ldGhvZCA9IHJlcS5tZXRob2QgPz8gJ0dFVCc7XG5cdFx0Y29uc3QgcGF0aG5hbWUgPSBuZXcgVVJMKHJlcS51cmwgPz8gJy8nLCAnaHR0cDovLzEyNy4wLjAuMScpLnBhdGhuYW1lO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSAke21ldGhvZH0gJHtwYXRobmFtZX1gKTtcblxuXHRcdC8vIEhlYWx0aCBjaGVjayBpcyB0aGUgb25seSB1bmF1dGhlbnRpY2F0ZWQgcm91dGUuXG5cdFx0aWYgKG1ldGhvZCA9PT0gJ0dFVCcgJiYgcGF0aG5hbWUgPT09ICcvJykge1xuXHRcdFx0cmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L3BsYWluJyB9KTtcblx0XHRcdHJlcy5lbmQoJ29rJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0aCA9IHBhcnNlUHJveHlCZWFyZXIocmVxLmhlYWRlcnMsIHJ1bnRpbWUubm9uY2UpO1xuXHRcdGlmICghYXV0aC52YWxpZCkge1xuXHRcdFx0d3JpdGVKc29uRXJyb3IocmVzLCA0MDEsICdhdXRoZW50aWNhdGlvbl9lcnJvcicsICdJbnZhbGlkIGF1dGhlbnRpY2F0aW9uJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1ldGhvZCA9PT0gJ0dFVCcgJiYgcGF0aG5hbWUgPT09ICcvdjEvbW9kZWxzJykge1xuXHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlTW9kZWxzKHJlcSwgcmVzLCBydW50aW1lKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobWV0aG9kID09PSAnUE9TVCcgJiYgcGF0aG5hbWUgPT09ICcvdjEvbWVzc2FnZXMnKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9oYW5kbGVNZXNzYWdlcyhyZXEsIHJlcywgcnVudGltZSwgYXV0aC5zZXNzaW9uSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtZXRob2QgPT09ICdQT1NUJyAmJiBwYXRobmFtZSA9PT0gJy92MS9tZXNzYWdlcy9jb3VudF90b2tlbnMnKSB7XG5cdFx0XHR3cml0ZUpzb25FcnJvcihyZXMsIDUwMSwgJ2FwaV9lcnJvcicsICdjb3VudF90b2tlbnMgbm90IHN1cHBvcnRlZCBieSBDQVBJJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0d3JpdGVKc29uRXJyb3IocmVzLCA0MDQsICdub3RfZm91bmRfZXJyb3InLCBgTm8gcm91dGUgZm9yICR7bWV0aG9kfSAke3BhdGhuYW1lfWApO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gR0VUIC92MS9tb2RlbHNcblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVNb2RlbHMocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBydW50aW1lOiBJQ2xhdWRlUHJveHlSdW50aW1lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGVhZGVycyA9IGJ1aWxkT3V0Ym91bmRIZWFkZXJzKHJlcS5oZWFkZXJzKTtcblx0XHRsZXQgbW9kZWxzOiBDQ0FNb2RlbFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRtb2RlbHMgPSBhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5tb2RlbHMocnVudGltZS5zdGF0ZS5naXRodWJUb2tlbiwgeyBoZWFkZXJzLCBzdXBwcmVzc0ludGVncmF0aW9uSWQ6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl93cml0ZVVwc3RyZWFtRXJyb3JSZXNwb25zZShyZXMsIGVycik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YTogQW50aHJvcGljLk1vZGVsSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBtIG9mIG1vZGVscykge1xuXHRcdFx0aWYgKCFpc0FudGhyb3BpY01lc3NhZ2VzTW9kZWwobSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXJzZWQgPSB0cnlQYXJzZUNsYXVkZU1vZGVsSWQobS5pZCk7XG5cdFx0XHRjb25zdCBzZGtJZCA9IHBhcnNlZCA/IHBhcnNlZC50b1Nka01vZGVsSWQoKSA6IG0uaWQ7XG5cdFx0XHRkYXRhLnB1c2goe1xuXHRcdFx0XHRpZDogc2RrSWQsXG5cdFx0XHRcdHR5cGU6ICdtb2RlbCcsXG5cdFx0XHRcdGRpc3BsYXlfbmFtZTogbS5uYW1lIHx8IHNka0lkLFxuXHRcdFx0XHRjcmVhdGVkX2F0OiAnMTk3MC0wMS0wMVQwMDowMDowMFonLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IG51bGwsXG5cdFx0XHRcdG1heF9pbnB1dF90b2tlbnM6IG51bGwsXG5cdFx0XHRcdG1heF90b2tlbnM6IG51bGwsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBib2R5ID0ge1xuXHRcdFx0ZGF0YSxcblx0XHRcdGhhc19tb3JlOiBmYWxzZSxcblx0XHRcdGZpcnN0X2lkOiBkYXRhLmxlbmd0aCA+IDAgPyBkYXRhWzBdLmlkIDogbnVsbCxcblx0XHRcdGxhc3RfaWQ6IGRhdGEubGVuZ3RoID4gMCA/IGRhdGFbZGF0YS5sZW5ndGggLSAxXS5pZCA6IG51bGwsXG5cdFx0fTtcblx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuXHRcdHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoYm9keSkpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUE9TVCAvdjEvbWVzc2FnZXNcblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVNZXNzYWdlcyhcblx0XHRyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLFxuXHRcdHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSxcblx0XHRydW50aW1lOiBJQ2xhdWRlUHJveHlSdW50aW1lLFxuXHRcdHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgYm9keVN0cmluZzogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHRib2R5U3RyaW5nID0gYXdhaXQgcmVhZFByb3h5UmVxdWVzdEJvZHkocmVxKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNDAwLCAnaW52YWxpZF9yZXF1ZXN0X2Vycm9yJywgYEZhaWxlZCB0byByZWFkIHJlcXVlc3QgYm9keTogJHtzdHJpbmdpZnlFcnJvcihlcnIpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBwYXJzZWQ6IHVua25vd247XG5cdFx0dHJ5IHtcblx0XHRcdHBhcnNlZCA9IEpTT04ucGFyc2UoYm9keVN0cmluZyk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR3cml0ZUpzb25FcnJvcihyZXMsIDQwMCwgJ2ludmFsaWRfcmVxdWVzdF9lcnJvcicsICdSZXF1ZXN0IGJvZHkgaXMgbm90IHZhbGlkIEpTT04nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNDAwLCAnaW52YWxpZF9yZXF1ZXN0X2Vycm9yJywgJ1JlcXVlc3QgYm9keSBtdXN0IGJlIGEgSlNPTiBvYmplY3QnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBib2R5ID0gcGFyc2VkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGNvbnN0IHNka01vZGVsSWQgPSBib2R5Lm1vZGVsO1xuXHRcdGlmICh0eXBlb2Ygc2RrTW9kZWxJZCAhPT0gJ3N0cmluZycgfHwgc2RrTW9kZWxJZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNDAwLCAnaW52YWxpZF9yZXF1ZXN0X2Vycm9yJywgJ01pc3NpbmcgcmVxdWlyZWQgZmllbGQ6IG1vZGVsJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghQXJyYXkuaXNBcnJheShib2R5Lm1lc3NhZ2VzKSkge1xuXHRcdFx0d3JpdGVKc29uRXJyb3IocmVzLCA0MDAsICdpbnZhbGlkX3JlcXVlc3RfZXJyb3InLCAnTWlzc2luZyByZXF1aXJlZCBmaWVsZDogbWVzc2FnZXMnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWRNb2RlbCA9IHRyeVBhcnNlQ2xhdWRlTW9kZWxJZChzZGtNb2RlbElkKTtcblx0XHRpZiAoIXBhcnNlZE1vZGVsKSB7XG5cdFx0XHR3cml0ZUpzb25FcnJvcihyZXMsIDQwNCwgJ25vdF9mb3VuZF9lcnJvcicsIGBVbmtub3duIG1vZGVsOiAke3Nka01vZGVsSWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFRoZSBTREsvQ0xJIHNlbmRzIHRoZSBtb2RlbCBpbiBTREsgZm9ybWF0IChkYXNoZWQsIGBjbGF1ZGUtaGFpa3UtNC01YCk7XG5cdFx0Ly8gQ0FQSSdzIGAvdjEvbWVzc2FnZXNgIGV4cGVjdHMgdGhlIGVuZHBvaW50IGZvcm1hdCAoZG90dGVkLFxuXHRcdC8vIGBjbGF1ZGUtaGFpa3UtNC41YCkuIFJld3JpdGUgb24gdGhlIHdheSBvdXQuXG5cdFx0Y29uc3QgZW5kcG9pbnRNb2RlbElkID0gcGFyc2VkTW9kZWwudG9FbmRwb2ludE1vZGVsSWQoKTtcblx0XHRib2R5Lm1vZGVsID0gZW5kcG9pbnRNb2RlbElkO1xuXG5cdFx0Y29uc3Qgc3RyZWFtID0gYm9keS5zdHJlYW0gPT09IHRydWU7XG5cdFx0Y29uc3QgaGVhZGVycyA9IGJ1aWxkT3V0Ym91bmRIZWFkZXJzKHJlcS5oZWFkZXJzKTtcblxuXHRcdGNvbnN0IGVudHJ5OiBJUHJveHlJbkZsaWdodCA9IHtcblx0XHRcdGFjOiBuZXcgQWJvcnRDb250cm9sbGVyKCksXG5cdFx0XHRyZXMsXG5cdFx0XHRjbGllbnRHb25lOiBmYWxzZSxcblx0XHR9O1xuXHRcdHJ1bnRpbWUuaW5GbGlnaHQuYWRkKGVudHJ5KTtcblx0XHRjb25zdCBvbkNsb3NlID0gKCkgPT4ge1xuXHRcdFx0ZW50cnkuY2xpZW50R29uZSA9IHRydWU7XG5cdFx0XHRlbnRyeS5hYy5hYm9ydCgpO1xuXHRcdH07XG5cdFx0cmVzLm9uKCdjbG9zZScsIG9uQ2xvc2UpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChzdHJlYW0pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc3RyZWFtTWVzc2FnZXMoXG5cdFx0XHRcdFx0Ym9keSBhcyB1bmtub3duIGFzIEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLFxuXHRcdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdFx0cmVzLFxuXHRcdFx0XHRcdGVudHJ5LFxuXHRcdFx0XHRcdHJ1bnRpbWUsXG5cdFx0XHRcdFx0c2RrTW9kZWxJZCxcblx0XHRcdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zZW5kTm9uU3RyZWFtaW5nTWVzc2FnZShcblx0XHRcdFx0XHRib2R5IGFzIHVua25vd24gYXMgQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsXG5cdFx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0XHRyZXMsXG5cdFx0XHRcdFx0ZW50cnksXG5cdFx0XHRcdFx0cnVudGltZSxcblx0XHRcdFx0XHRzZGtNb2RlbElkLFxuXHRcdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVzLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uQ2xvc2UpO1xuXHRcdFx0cnVudGltZS5pbkZsaWdodC5kZWxldGUoZW50cnkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmROb25TdHJlYW1pbmdNZXNzYWdlKFxuXHRcdGJvZHk6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zTm9uU3RyZWFtaW5nLFxuXHRcdGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG5cdFx0cmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLFxuXHRcdGVudHJ5OiBJUHJveHlJbkZsaWdodCxcblx0XHRydW50aW1lOiBJQ2xhdWRlUHJveHlSdW50aW1lLFxuXHRcdG9yaWdpbmFsU2RrTW9kZWxJZDogc3RyaW5nLFxuXHRcdHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvcHRpb25zOiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyA9IHsgaGVhZGVycywgc2lnbmFsOiBlbnRyeS5hYy5zaWduYWwsIHN1cHByZXNzSW50ZWdyYXRpb25JZDogdHJ1ZSB9O1xuXHRcdGxldCBtZXNzYWdlOiBBbnRocm9waWMuTWVzc2FnZTtcblx0XHR0cnkge1xuXHRcdFx0bWVzc2FnZSA9IGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLm1lc3NhZ2VzKHJ1bnRpbWUuc3RhdGUuZ2l0aHViVG9rZW4sIGJvZHksIG9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVudHJ5LmFjLnNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdGlmICghZW50cnkuY2xpZW50R29uZSAmJiAhcmVzLndyaXRhYmxlRW5kZWQpIHtcblx0XHRcdFx0XHRyZXMuZGVzdHJveSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3dyaXRlVXBzdHJlYW1FcnJvclJlc3BvbnNlKHJlcywgZXJyLCB0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXBvcnRDcmVkaXRzKHNlc3Npb25JZCwgcmVhZENvcGlsb3RVc2FnZU5hbm9BaXUobWVzc2FnZSkpO1xuXG5cdFx0Ly8gUmV3cml0ZSBvdXRib3VuZCBgbW9kZWxgIHRvIFNESyBmb3JtYXQuIEZhaWx1cmUgdG8gcmUtcGFyc2Vcblx0XHQvLyBzaG91bGRuJ3Qgbm9ybWFsbHkgaGFwcGVuIGJlY2F1c2Ugd2UganVzdCB0cmFuc2xhdGVkIGl0IG9uXG5cdFx0Ly8gdGhlIHdheSBpbiwgYnV0IGxvZyArIHBhc3N0aHJvdWdoIHJhdGhlciB0aGFuIGRyb3BwaW5nLlxuXHRcdGNvbnN0IG91dGJvdW5kTW9kZWwgPSByZXdyaXRlTW9kZWxUb1NkayhtZXNzYWdlLm1vZGVsLCB0aGlzLl9sb2dTZXJ2aWNlKSA/PyBvcmlnaW5hbFNka01vZGVsSWQ7XG5cdFx0Y29uc3QgcmVzcG9uc2VCb2R5OiBBbnRocm9waWMuTWVzc2FnZSA9IHsgLi4ubWVzc2FnZSwgbW9kZWw6IG91dGJvdW5kTW9kZWwgfTtcblxuXHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG5cdFx0cmVzLmVuZChKU09OLnN0cmluZ2lmeShyZXNwb25zZUJvZHkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N0cmVhbU1lc3NhZ2VzKFxuXHRcdGJvZHk6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLFxuXHRcdGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG5cdFx0cmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLFxuXHRcdGVudHJ5OiBJUHJveHlJbkZsaWdodCxcblx0XHRydW50aW1lOiBJQ2xhdWRlUHJveHlSdW50aW1lLFxuXHRcdF9vcmlnaW5hbFNka01vZGVsSWQ6IHN0cmluZyxcblx0XHRzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3B0aW9uczogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgPSB7IGhlYWRlcnMsIHNpZ25hbDogZW50cnkuYWMuc2lnbmFsLCBzdXBwcmVzc0ludGVncmF0aW9uSWQ6IHRydWUgfTtcblx0XHRsZXQgc3RyZWFtOiBBc3luY0dlbmVyYXRvcjxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50Pjtcblx0XHR0cnkge1xuXHRcdFx0c3RyZWFtID0gdGhpcy5fY29waWxvdEFwaVNlcnZpY2UubWVzc2FnZXMocnVudGltZS5zdGF0ZS5naXRodWJUb2tlbiwgYm9keSwgb3B0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBTeW5jaHJvbm91cyB0aHJvd3MgZnJvbSB0aGUgZ2VuZXJhdG9yIGZhY3RvcnkgKHJhcmUgXHUyMDE0XG5cdFx0XHQvLyBDQVBJIGVycm9ycyBjb21lIGZyb20gdGhlIGZpcnN0IGl0ZXJhdGlvbikuXG5cdFx0XHRpZiAoZW50cnkuYWMuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0aWYgKCFlbnRyeS5jbGllbnRHb25lICYmICFyZXMud3JpdGFibGVFbmRlZCkge1xuXHRcdFx0XHRcdHJlcy5kZXN0cm95KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fd3JpdGVVcHN0cmVhbUVycm9yUmVzcG9uc2UocmVzLCBlcnIsIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFB1bGwgdGhlIGZpcnN0IGV2ZW50IGJlZm9yZSBjb21taXR0aW5nIHRvIGEgMjAwIHJlc3BvbnNlIHNvXG5cdFx0Ly8gd2UgY2FuIHN1cmZhY2UgYSBwcmUtc3RyZWFtIGVycm9yIGFzIGEgcmVndWxhciBKU09OIGVycm9yLlxuXHRcdGxldCBmaXJzdDogSXRlcmF0b3JSZXN1bHQ8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cdFx0dHJ5IHtcblx0XHRcdGZpcnN0ID0gYXdhaXQgc3RyZWFtLm5leHQoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlbnRyeS5hYy5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHRpZiAoIWVudHJ5LmNsaWVudEdvbmUgJiYgIXJlcy53cml0YWJsZUVuZGVkKSB7XG5cdFx0XHRcdFx0cmVzLmRlc3Ryb3koKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93cml0ZVVwc3RyZWFtRXJyb3JSZXNwb25zZShyZXMsIGVyciwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ29tbWl0IHRvIHN0cmVhbWluZyByZXNwb25zZSBub3cuXG5cdFx0cmVzLndyaXRlSGVhZCgyMDAsIHtcblx0XHRcdCdDb250ZW50LVR5cGUnOiAndGV4dC9ldmVudC1zdHJlYW0nLFxuXHRcdFx0J0NhY2hlLUNvbnRyb2wnOiAnbm8tY2FjaGUnLFxuXHRcdFx0J0Nvbm5lY3Rpb24nOiAna2VlcC1hbGl2ZScsXG5cdFx0fSk7XG5cdFx0cmVzLmZsdXNoSGVhZGVycygpO1xuXHRcdHJlcV9zZXROb0RlbGF5KHJlcyk7XG5cblx0XHRjb25zdCB3cml0ZUZyYW1lID0gYXN5bmMgKGV2ZW50OiBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50KTogUHJvbWlzZTxib29sZWFuPiA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc2Zvcm1lZCA9IHJld3JpdGVFdmVudE1vZGVsKGV2ZW50LCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGZyYW1lID0gYGV2ZW50OiAke3RyYW5zZm9ybWVkLnR5cGV9XFxuZGF0YTogJHtKU09OLnN0cmluZ2lmeSh0cmFuc2Zvcm1lZCl9XFxuXFxuYDtcblx0XHRcdGNvbnN0IG9rID0gcmVzLndyaXRlKGZyYW1lKTtcblx0XHRcdGlmICghb2spIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBvbmNlKHJlcywgJ2RyYWluJywgeyBzaWduYWw6IGVudHJ5LmFjLnNpZ25hbCB9KTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gc2lnbmFsIGFib3J0ZWQgd2hpbGUgd2FpdGluZyBvbiBkcmFpbiBcdTIwMTQgYmFpbCBvdXRcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cblx0XHQvLyBUcmFja3MgdGhlIGxhdGVzdCBgY29waWxvdF91c2FnZS50b3RhbF9uYW5vX2FpdWAgc2VlbiBvbiB0aGVcblx0XHQvLyBzdHJlYW07IENBUEkgc2VuZHMgdGhlIHJlcXVlc3QncyBydW5uaW5nIHRvdGFsIG9uIGBtZXNzYWdlX2RlbHRhYFxuXHRcdC8vIChhc3NpZ24tbGFzdC13aW5zKS4gUmVwb3J0ZWQgb25jZSBvbiBjbGVhbiBzdHJlYW0gZW5kLlxuXHRcdGxldCByZXBvcnRlZE5hbm9BaXU6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIWZpcnN0LmRvbmUpIHtcblx0XHRcdFx0cmVwb3J0ZWROYW5vQWl1ID0gcmVhZENvcGlsb3RVc2FnZU5hbm9BaXUoZmlyc3QudmFsdWUpID8/IHJlcG9ydGVkTmFub0FpdTtcblx0XHRcdFx0Y29uc3Qgb2sgPSBhd2FpdCB3cml0ZUZyYW1lKGZpcnN0LnZhbHVlKTtcblx0XHRcdFx0aWYgKCFvaykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0bGV0IG5leHQ6IEl0ZXJhdG9yUmVzdWx0PEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+O1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdG5leHQgPSBhd2FpdCBzdHJlYW0ubmV4dCgpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRpZiAoZW50cnkuYWMuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0XHRcdGlmICghZW50cnkuY2xpZW50R29uZSAmJiAhcmVzLndyaXRhYmxlRW5kZWQpIHtcblx0XHRcdFx0XHRcdFx0cmVzLmRlc3Ryb3koKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gTWlkLXN0cmVhbSBlcnJvcjogZW1pdCBBbnRocm9waWMgU1NFIGVycm9yIGZyYW1lLCB0aGVuIGVuZC5cblx0XHRcdFx0XHRjb25zdCBlbnZlbG9wZSA9IGVyciBpbnN0YW5jZW9mIENvcGlsb3RBcGlFcnJvclxuXHRcdFx0XHRcdFx0PyBlbWJlZEZvcndhcmRlZENoYXRFcnJvcihlcnIpXG5cdFx0XHRcdFx0XHQ6IGJ1aWxkRXJyb3JFbnZlbG9wZSgnYXBpX2Vycm9yJywgc3RyaW5naWZ5RXJyb3IoZXJyKSk7XG5cdFx0XHRcdFx0aWYgKCFyZXMud3JpdGFibGVFbmRlZCkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0cmVzLndyaXRlKGZvcm1hdFNzZUVycm9yRnJhbWUoZW52ZWxvcGUpKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggeyAvKiBzb2NrZXQgbWF5IGhhdmUgZGllZCAqLyB9XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRyZXMuZW5kKCk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChuZXh0LmRvbmUpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXBvcnRlZE5hbm9BaXUgPSByZWFkQ29waWxvdFVzYWdlTmFub0FpdShuZXh0LnZhbHVlKSA/PyByZXBvcnRlZE5hbm9BaXU7XG5cdFx0XHRcdGNvbnN0IG9rID0gYXdhaXQgd3JpdGVGcmFtZShuZXh0LnZhbHVlKTtcblx0XHRcdFx0aWYgKCFvaykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZXMud3JpdGFibGVFbmRlZCkge1xuXHRcdFx0XHRyZXMuZW5kKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDQVBJIHJlcG9ydHMgdGhlIHJlcXVlc3QncyBiaWxsZWQgY3JlZGl0cyBhcyB0aGUgbGFzdFxuXHRcdFx0Ly8gYGNvcGlsb3RfdXNhZ2UudG90YWxfbmFub19haXVgIHNlZW4gb24gdGhlIHN0cmVhbVxuXHRcdFx0Ly8gKGFzc2lnbi1sYXN0LXdpbnMsIG1hdGNoaW5nIHRoZSBDb3BpbG90IG1lc3NhZ2VzIGNsaWVudCkuXG5cdFx0XHQvLyBGaXJlIG9ubHkgYWZ0ZXIgYSBjbGVhbiBlbmQgc28gd2UgbmV2ZXIgYXR0cmlidXRlIGNyZWRpdHNcblx0XHRcdC8vIGZvciBhIHJlcXVlc3QgdGhlIGNsaWVudCBhYmFuZG9uZWQgbWlkLXN0cmVhbS5cblx0XHRcdHRoaXMuX3JlcG9ydENyZWRpdHMoc2Vzc2lvbklkLCByZXBvcnRlZE5hbm9BaXUpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gRGVmZW5zZSBpbiBkZXB0aCBcdTIwMTQgc2hvdWxkIG5vdCBiZSByZWFjaGVkLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gc3RyZWFtIGxvb3AgdW5leHBlY3RlZCBlcnJvcjogJHtzdHJpbmdpZnlFcnJvcihlcnIpfWApO1xuXHRcdFx0aWYgKCFyZXMud3JpdGFibGVFbmRlZCkge1xuXHRcdFx0XHR0cnkgeyByZXMuZW5kKCk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIEVycm9yIGhlbHBlcnNcblxuXHQvKipcblx0ICogV3JpdGVzIGFuIHVwc3RyZWFtIGVycm9yIGFzIGEgSlNPTiByZXNwb25zZS4gV2hlbiBgZW1iZWRDaGF0RXJyb3JgIGlzIHNldFxuXHQgKiAodGhlIGAvdjEvbWVzc2FnZXNgIHBhdGhzKSwgYSBgVlNDT0RFX1BST1hZX0VSUk9SYCBtYXJrZXIgaXMgYXBwZW5kZWQgdG9cblx0ICogdGhlIGVudmVsb3BlIG1lc3NhZ2Ugc28gdGhlIHN0cnVjdHVyZWQgQ0FQSSBlcnJvciByb3VuZC10cmlwcyBiYWNrIHRocm91Z2hcblx0ICogdGhlIFNESyBzdWJwcm9jZXNzIHRvIHRoZSBhZ2VudCBob3N0ICh3aGljaCBkZWNvZGVzIGl0IGludG8gYF9tZXRhYCBhbmRcblx0ICogc3RyaXBzIHRoZSBtYXJrZXIpLiBUaGUgYC92MS9tb2RlbHNgIHBhdGggZG9lcyBub3Qgcm91bmQtdHJpcCwgc28gaXRcblx0ICogcmUtZW1pdHMgdGhlIGVudmVsb3BlIHZlcmJhdGltLlxuXHQgKi9cblx0cHJpdmF0ZSBfd3JpdGVVcHN0cmVhbUVycm9yUmVzcG9uc2UocmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBlcnI6IHVua25vd24sIGVtYmVkQ2hhdEVycm9yID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAocmVzLmhlYWRlcnNTZW50KSB7XG5cdFx0XHQvLyBIZWFkZXJzIGFyZSBhbHJlYWR5IHNlbnQgXHUyMDE0IGNhbGxlciBzaG91bGQgaGF2ZSByb3V0ZWQgdG9cblx0XHRcdC8vIHRoZSBTU0UgZXJyb3IgcGF0aC4gVGhpcyBpcyBhIGRlZmVuc2l2ZSBsb2cuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSBjYW5ub3Qgd3JpdGUgdXBzdHJlYW0gZXJyb3IgYWZ0ZXIgaGVhZGVycyBzZW50OiAke3N0cmluZ2lmeUVycm9yKGVycil9YCk7XG5cdFx0XHRpZiAoIXJlcy53cml0YWJsZUVuZGVkKSB7XG5cdFx0XHRcdHRyeSB7IHJlcy5lbmQoKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBDb3BpbG90QXBpRXJyb3IpIHtcblx0XHRcdC8vIE1pZC1zdHJlYW0gc2VudGluZWwgZG9lc24ndCBtYXAgdG8gYSBtZWFuaW5nZnVsIEhUVFBcblx0XHRcdC8vIHN0YXR1cyBiZWZvcmUgaGVhZGVycyBhcmUgc2VudC4gQ29lcmNlIHRvIDUwMiBzbyB3ZVxuXHRcdFx0Ly8gZG9uJ3Qgc2hpcCBhIDUyMCB3aXRoIGEgSlNPTiBib2R5IHRoYXQgdmlvbGF0ZXMgSFRUUFxuXHRcdFx0Ly8gc2VtYW50aWNzIGZvciB0aGUgY29uc3VtZXIuXG5cdFx0XHRjb25zdCBzdGF0dXMgPSBlcnIuc3RhdHVzID09PSBDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HID8gNTAyIDogZXJyLnN0YXR1cztcblx0XHRcdHdyaXRlVXBzdHJlYW1Kc29uRXJyb3IocmVzLCBzdGF0dXMsIGVtYmVkQ2hhdEVycm9yID8gZW1iZWRGb3J3YXJkZWRDaGF0RXJyb3IoZXJyKSA6IGVyci5lbnZlbG9wZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNTAyLCAnYXBpX2Vycm9yJywgZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpKTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIEhlbHBlcnNcblxuZnVuY3Rpb24gaXNBbnRocm9waWNNZXNzYWdlc01vZGVsKG06IENDQU1vZGVsKTogYm9vbGVhbiB7XG5cdGlmICghS05PV05fQ0xBVURFX1ZFTkRPUlMuaGFzKG0udmVuZG9yLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBBcnJheS5pc0FycmF5KG0uc3VwcG9ydGVkX2VuZHBvaW50cykgJiYgbS5zdXBwb3J0ZWRfZW5kcG9pbnRzLmluY2x1ZGVzKEFOVEhST1BJQ19NRVNTQUdFU19FTkRQT0lOVCk7XG59XG5cbmZ1bmN0aW9uIHJld3JpdGVNb2RlbFRvU2RrKG1vZGVsSWQ6IHN0cmluZywgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwYXJzZWQgPSB0cnlQYXJzZUNsYXVkZU1vZGVsSWQobW9kZWxJZCk7XG5cdGlmICghcGFyc2VkKSB7XG5cdFx0bG9nU2VydmljZS53YXJuKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gb3V0Ym91bmQgbW9kZWwgSUQgY291bGQgbm90IGJlIHBhcnNlZCBmb3IgU0RLIHJld3JpdGU6ICR7bW9kZWxJZH1gKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBwYXJzZWQudG9TZGtNb2RlbElkKCk7XG59XG5cbi8qKlxuICogUHVyZS1mdW5jdGlvbiByZXdyaXRlIG9mIGBtb2RlbGAgZmllbGRzIG9uIGBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50YFxuICogb2JqZWN0cyBmcm9tIENBUEkgKGVuZHBvaW50IGZvcm1hdCkgdG8gU0RLIChoeXBoZW5hdGVkKSBmb3JtYXQuIE9ubHlcbiAqIGBtZXNzYWdlX3N0YXJ0Lm1lc3NhZ2UubW9kZWxgIGNhcnJpZXMgYSBtb2RlbCBJRCBpbiB0aGUgc3RyZWFtaW5nXG4gKiB0YXhvbm9teTsgb3RoZXIgZXZlbnQgdHlwZXMgcGFzcyB0aHJvdWdoIHVuY2hhbmdlZC5cbiAqL1xuZnVuY3Rpb24gcmV3cml0ZUV2ZW50TW9kZWwoXG5cdGV2ZW50OiBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50LFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcbik6IEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQge1xuXHRpZiAoZXZlbnQudHlwZSAhPT0gJ21lc3NhZ2Vfc3RhcnQnKSB7XG5cdFx0cmV0dXJuIGV2ZW50O1xuXHR9XG5cdGNvbnN0IHNka01vZGVsID0gcmV3cml0ZU1vZGVsVG9TZGsoZXZlbnQubWVzc2FnZS5tb2RlbCwgbG9nU2VydmljZSk7XG5cdGlmIChzZGtNb2RlbCA9PT0gdW5kZWZpbmVkIHx8IHNka01vZGVsID09PSBldmVudC5tZXNzYWdlLm1vZGVsKSB7XG5cdFx0cmV0dXJuIGV2ZW50O1xuXHR9XG5cdHJldHVybiB7XG5cdFx0Li4uZXZlbnQsXG5cdFx0bWVzc2FnZTogeyAuLi5ldmVudC5tZXNzYWdlLCBtb2RlbDogc2RrTW9kZWwgfSxcblx0fTtcbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUgaGVhZGVycyB3ZSBmb3J3YXJkIHRvIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2UubWVzc2FnZXN9XG4gKiBmcm9tIHRoZSBpbmJvdW5kIHJlcXVlc3QuIEZvcndhcmRzIGBhbnRocm9waWMtdmVyc2lvbmAgKHZlcmJhdGltKSxcbiAqIGBhbnRocm9waWMtYmV0YWAgKGZpbHRlcmVkIHRocm91Z2gge0BsaW5rIGZpbHRlclN1cHBvcnRlZEJldGFzfSksIGFuZFxuICogYHVzZXItYWdlbnRgICh0cmFuc2Zvcm1lZCB2aWEge0BsaW5rIHRyYW5zZm9ybVVzZXJBZ2VudH0pLlxuICovXG5mdW5jdGlvbiBidWlsZE91dGJvdW5kSGVhZGVycyhpbmJvdW5kOiBodHRwLkluY29taW5nSHR0cEhlYWRlcnMpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcblx0Y29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdGNvbnN0IHZlcnNpb24gPSBpbmJvdW5kWydhbnRocm9waWMtdmVyc2lvbiddO1xuXHRpZiAodHlwZW9mIHZlcnNpb24gPT09ICdzdHJpbmcnICYmIHZlcnNpb24ubGVuZ3RoID4gMCkge1xuXHRcdG91dFsnYW50aHJvcGljLXZlcnNpb24nXSA9IHZlcnNpb247XG5cdH1cblx0Y29uc3QgYmV0YSA9IGluYm91bmRbJ2FudGhyb3BpYy1iZXRhJ107XG5cdGlmICh0eXBlb2YgYmV0YSA9PT0gJ3N0cmluZycgJiYgYmV0YS5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgZmlsdGVyZWQgPSBmaWx0ZXJTdXBwb3J0ZWRCZXRhcyhiZXRhKTtcblx0XHRpZiAoZmlsdGVyZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0b3V0WydhbnRocm9waWMtYmV0YSddID0gZmlsdGVyZWQ7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHVzZXJBZ2VudCA9IGluYm91bmRbJ3VzZXItYWdlbnQnXTtcblx0aWYgKHR5cGVvZiB1c2VyQWdlbnQgPT09ICdzdHJpbmcnICYmIHVzZXJBZ2VudC5sZW5ndGggPiAwKSB7XG5cdFx0b3V0WydVc2VyLUFnZW50J10gPSB0cmFuc2Zvcm1Vc2VyQWdlbnQodXNlckFnZW50KTtcblx0fVxuXHRyZXR1cm4gb3V0O1xufVxuXG4vKipcbiAqIFRyYW5zZm9ybSBhbiBpbmNvbWluZyB1c2VyLWFnZW50IHN0cmluZyBieSByZXBsYWNpbmcgdGhlIGNsaWVudCBuYW1lXG4gKiBwb3J0aW9uIChiZWZvcmUgdGhlIGZpcnN0IGAvYCkgd2l0aCB7QGxpbmsgVVNFUl9BR0VOVF9QUkVGSVh9LiBUaGlzXG4gKiBtaXJyb3JzIHRoZSBwYXR0ZXJuIHVzZWQgYnkgYGNsYXVkZUxhbmd1YWdlTW9kZWxTZXJ2ZXIudHNgIGluIHRoZVxuICogZXh0ZW5zaW9uLCBlbnN1cmluZyBhbGwgQ2xhdWRlIHJlcXVlc3RzIGFyZSB0YWdnZWQgd2l0aCBhIGNvbnNpc3RlbnRcbiAqIHByZWZpeCBmb3Igc2VydmVyLXNpZGUgaWRlbnRpZmljYXRpb24uXG4gKlxuICogRXhhbXBsZXM6XG4gKiAtIGBjbGF1ZGUtY29kZS8xLjIuM2AgXHUyMTkyIGB2c2NvZGVfY2xhdWRlX2NvZGUvMS4yLjNgXG4gKiAtIGBBbnRocm9waWMvUHl0aG9uLzEuMGAgXHUyMTkyIGB2c2NvZGVfY2xhdWRlX2NvZGUvUHl0aG9uLzEuMGBcbiAqIC0gYHVua25vd25gIFx1MjE5MiBgdnNjb2RlX2NsYXVkZV9jb2RlL3Vua25vd25gXG4gKi9cbmZ1bmN0aW9uIHRyYW5zZm9ybVVzZXJBZ2VudCh1c2VyQWdlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNsYXNoSW5kZXggPSB1c2VyQWdlbnQuaW5kZXhPZignLycpO1xuXHRpZiAoc2xhc2hJbmRleCA9PT0gLTEpIHtcblx0XHRyZXR1cm4gYCR7VVNFUl9BR0VOVF9QUkVGSVh9LyR7dXNlckFnZW50fWA7XG5cdH1cblx0cmV0dXJuIGAke1VTRVJfQUdFTlRfUFJFRklYfSR7dXNlckFnZW50LnN1YnN0cmluZyhzbGFzaEluZGV4KX1gO1xufVxuXG5mdW5jdGlvbiByZXFfc2V0Tm9EZWxheShyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiB2b2lkIHtcblx0Y29uc3Qgc29ja2V0ID0gcmVzLnNvY2tldDtcblx0aWYgKHNvY2tldCAmJiB0eXBlb2Ygc29ja2V0LnNldE5vRGVsYXkgPT09ICdmdW5jdGlvbicpIHtcblx0XHR0cnkge1xuXHRcdFx0c29ja2V0LnNldE5vRGVsYXkodHJ1ZSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBub3QgYWxsIHNvY2tldCBpbXBsZW1lbnRhdGlvbnMgc3VwcG9ydCBpdCAobW9ja3MgZXRjLilcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gc3RyaW5naWZ5RXJyb3IoZXJyOiB1bmtub3duKTogc3RyaW5nIHtcblx0aWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0cmV0dXJuIGVyci5tZXNzYWdlO1xuXHR9XG5cdHJldHVybiBTdHJpbmcoZXJyKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgY29weSBvZiBhIHtAbGluayBDb3BpbG90QXBpRXJyb3J9J3MgQW50aHJvcGljIGVudmVsb3BlIHdpdGggYVxuICogYFZTQ09ERV9QUk9YWV9FUlJPUjo8YmFzZTY0PmAgbWFya2VyIGFwcGVuZGVkIHRvIHRoZSBlcnJvciBtZXNzYWdlLiBUaGVcbiAqIG1hcmtlciBjYXJyaWVzIHRoZSBzdHJ1Y3R1cmVkIGNoYXQgZmV0Y2ggZXJyb3Igc28gdGhlIGFnZW50IGhvc3QgY2FuXG4gKiBmb3J3YXJkIHJpY2gsIGxvY2FsaXplZCBlcnJvciBtZXNzYWdpbmcgdG8gY29yZSBvbmNlIHRoZSBTREsgc3VicHJvY2Vzc1xuICogZWNob2VzIHRoZSB0ZXh0IGJhY2suIFRoZSBvcmlnaW5hbCBtZXNzYWdlIGlzIHByZXNlcnZlZCAodGhlIGRlY29kZXIgc3RvcHNcbiAqIGF0IHRoZSBmaXJzdCB3aGl0ZXNwYWNlKSwgc28gbm9uLWNvcmUgY29uc3VtZXJzIHN0aWxsIHJlYWQgaXQgdmVyYmF0aW0uXG4gKi9cbmZ1bmN0aW9uIGVtYmVkRm9yd2FyZGVkQ2hhdEVycm9yKGVycjogQ29waWxvdEFwaUVycm9yKTogQW50aHJvcGljLkVycm9yUmVzcG9uc2Uge1xuXHRjb25zdCBtYXJrZXIgPSBlbmNvZGVGb3J3YXJkZWRDaGF0RXJyb3IoYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3IoZXJyKSk7XG5cdHJldHVybiB7XG5cdFx0Li4uZXJyLmVudmVsb3BlLFxuXHRcdGVycm9yOiB7XG5cdFx0XHQuLi5lcnIuZW52ZWxvcGUuZXJyb3IsXG5cdFx0XHRtZXNzYWdlOiBgJHtlcnIuZW52ZWxvcGUuZXJyb3IubWVzc2FnZX0gJHttYXJrZXJ9YCxcblx0XHR9LFxuXHR9O1xufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQVFBLFNBQVMsWUFBWTtBQUNyQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FFTTtBQUNQLFNBQVMseUJBQXlCLGdDQUFnQztBQUNsRTtBQUFBLEVBSUM7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUNQLFNBQVMsNEJBQTRCO0FBQ3JDO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QjtBQWtGMUIsTUFBTSxzQkFBc0IsZ0JBQXFDLG9CQUFvQjtBQWlCNUYsTUFBTSx1QkFBdUIsb0JBQUksSUFBSSxDQUFD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
