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
import * as fs from "fs";
import { join } from "../../../../base/common/path.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { CopilotApiError, ICopilotApiService } from "../shared/copilotApiService.js";
import { buildForwardedChatError, encodeForwardedChatError } from "../shared/proxyChatError.js";
import {
  LoopbackProxyServer,
  readProxyRequestBody
} from "../shared/loopbackProxyServer.js";
const ICodexProxyService = createDecorator("codexProxyService");
const CODEX_AUTO_REVIEW_MODEL = "codex-auto-review";
const PROXY_USER_FACING_NAME = "CodexProxyService";
const USER_AGENT_PREFIX = "vscode_codex";
const DEBUG_DUMP_DIR_ENV = "VSCODE_CODEX_PROXY_DUMP_DIR";
let _dumpSeq = 0;
function nextDumpSeq() {
  return String(++_dumpSeq).padStart(4, "0");
}
function getDumpDir() {
  const dir = process.env[DEBUG_DUMP_DIR_ENV];
  if (!dir) {
    return void 0;
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return void 0;
  }
}
function writeJsonError(res, status, type, message) {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { type, message } }));
}
let CodexProxyService = class extends LoopbackProxyServer {
  constructor(logService, _copilotApiService) {
    super(PROXY_USER_FACING_NAME, logService);
    this._copilotApiService = _copilotApiService;
  }
  createState(githubToken) {
    return { githubToken, lastPrimaryModel: void 0 };
  }
  async start(githubToken) {
    const { runtime, release } = await this.acquire(githubToken);
    runtime.state.githubToken = githubToken;
    let disposed = false;
    return {
      baseUrl: runtime.baseUrl,
      nonce: runtime.nonce,
      setToken: (newToken) => {
        if (disposed) {
          return;
        }
        runtime.state.githubToken = newToken;
      },
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        release();
      }
    };
  }
  async handleRequest(req, res, runtime) {
    const method = req.method ?? "GET";
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const incomingHeaders = Object.keys(req.headers).join(", ");
    this._logService.info(`[${PROXY_USER_FACING_NAME}] >>> ${method} ${pathname} (headers: ${incomingHeaders})`);
    if (method === "GET" && pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    const authHeader = req.headers["authorization"];
    const expected = `Bearer ${runtime.nonce}`;
    if (typeof authHeader !== "string" || authHeader !== expected) {
      writeJsonError(res, 401, "authentication_error", "Invalid authentication");
      return;
    }
    if (method === "GET" && pathname === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: [] }));
      return;
    }
    if (method === "POST" && (pathname === "/v1/responses" || pathname === "/responses" || pathname === "//responses")) {
      await this._handleResponses(req, res, runtime);
      return;
    }
    writeJsonError(res, 404, "not_found_error", `No route for ${method} ${pathname}`);
  }
  async _handleResponses(req, res, runtime) {
    let body;
    try {
      body = await readProxyRequestBody(req);
    } catch (err) {
      writeJsonError(res, 400, "invalid_request_error", `Failed to read request body: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const remap = remapCodexReviewerModel(body, runtime.state);
    if (remap.remappedFrom) {
      this._logService.info(`[${PROXY_USER_FACING_NAME}] remapped unsupported reviewer model '${remap.remappedFrom}' -> '${remap.remappedTo}'`);
    }
    body = remap.body;
    const dumpDir = getDumpDir();
    const dumpSeq = dumpDir ? nextDumpSeq() : void 0;
    if (dumpDir && dumpSeq) {
      const reqFile = join(dumpDir, `req-${dumpSeq}-${Date.now()}.json`);
      try {
        fs.writeFileSync(reqFile, body);
        this._logService.info(`[${PROXY_USER_FACING_NAME}] dumped request body to ${reqFile}`);
      } catch (err) {
        this._logService.warn(`[${PROXY_USER_FACING_NAME}] failed to dump request body: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    try {
      const parsed = JSON.parse(body);
      this._logService.info(`[${PROXY_USER_FACING_NAME}] >>> /responses body: model=${parsed.model ?? "<none>"}, previous_response_id=${parsed.previous_response_id ?? "<none>"}, stream=${parsed.stream ?? "<none>"}, input_items=${Array.isArray(parsed.input) ? parsed.input.length : "<not-array>"}`);
      if (Array.isArray(parsed.input)) {
        for (let i = 0; i < parsed.input.length; i++) {
          const item = parsed.input[i];
          const type = item?.type ?? "<none>";
          const keys = item && typeof item === "object" ? Object.keys(item).join(",") : typeof item;
          let detail = "";
          if (type === "message") {
            const text = item?.content?.[0]?.text ?? "";
            detail = `role=${item?.role ?? "?"} chars=${text.length}`;
          } else if (type === "function_call") {
            detail = `name=${item?.name ?? "?"} call_id=${item?.call_id ?? "?"}`;
          } else if (type === "function_call_output") {
            const output = item?.output ?? "";
            detail = `call_id=${item?.call_id ?? "?"} output_chars=${typeof output === "string" ? output.length : 0}`;
          } else if (type === "reasoning") {
            const summary = item?.summary ?? item?.content ?? "";
            detail = `summary_chars=${typeof summary === "string" ? summary.length : JSON.stringify(summary).length} encrypted=${typeof item?.encrypted_content === "string"}`;
          } else {
            detail = JSON.stringify(item).slice(0, 120);
          }
          this._logService.info(`[${PROXY_USER_FACING_NAME}]   input[${i}] type=${type} keys=[${keys}] ${detail}`);
        }
      }
      const topLevelKeys = Object.keys(parsed).filter((k) => k !== "input").sort();
      this._logService.info(`[${PROXY_USER_FACING_NAME}]   top-level keys (excl. input)=[${topLevelKeys.join(", ")}]`);
      for (const k of topLevelKeys) {
        if (k === "instructions" || k === "tools") {
          const v2 = parsed[k];
          const size = typeof v2 === "string" ? v2.length : JSON.stringify(v2).length;
          this._logService.info(`[${PROXY_USER_FACING_NAME}]     ${k}=<${size} chars elided>`);
          continue;
        }
        const v = parsed[k];
        const preview = typeof v === "object" ? JSON.stringify(v).slice(0, 300) : String(v);
        this._logService.info(`[${PROXY_USER_FACING_NAME}]     ${k}=${preview}`);
      }
    } catch {
      this._logService.info(`[${PROXY_USER_FACING_NAME}] >>> /responses body (unparseable): ${body.slice(0, 200)}`);
    }
    const entry = { ac: new AbortController(), res, clientGone: false };
    runtime.inFlight.add(entry);
    const onClose = () => {
      entry.clientGone = true;
      entry.ac.abort();
    };
    res.on("close", onClose);
    const dispatchedToken = runtime.state.githubToken;
    const headers = buildOutboundHeaders(req.headers);
    try {
      this._logService.info(`[${PROXY_USER_FACING_NAME}] forwarding to CAPI responses...`);
      const upstream = await this._copilotApiService.responses(dispatchedToken, body, { headers, signal: entry.ac.signal, suppressIntegrationId: true });
      const contentType = upstream.headers.get("content-type") ?? "application/json";
      const upstreamHeaders = [...upstream.headers.entries()].map(([k, v]) => `${k}: ${v}`).join(", ");
      this._logService.info(`[${PROXY_USER_FACING_NAME}] <<< CAPI response: status=${upstream.status}, contentType=${contentType}, headers=[${upstreamHeaders}]`);
      res.writeHead(upstream.status, { "Content-Type": contentType });
      if (!upstream.body) {
        res.end();
        return;
      }
      const reader = upstream.body.getReader();
      const resDumpStream = dumpDir && dumpSeq ? fs.createWriteStream(join(dumpDir, `res-${dumpSeq}-${Date.now()}.txt`)) : void 0;
      let sseBuf = "";
      const eventCounts = {};
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (entry.clientGone) {
            break;
          }
          if (value && value.byteLength > 0) {
            const buf = Buffer.from(value);
            res.write(buf);
            if (resDumpStream) {
              resDumpStream.write(buf);
            }
            sseBuf += buf.toString("utf8");
            let nl;
            while ((nl = sseBuf.indexOf("\n")) >= 0) {
              const line = sseBuf.slice(0, nl).trimEnd();
              sseBuf = sseBuf.slice(nl + 1);
              if (line.startsWith("event:")) {
                const ev = line.slice("event:".length).trim();
                eventCounts[ev] = (eventCounts[ev] ?? 0) + 1;
              }
            }
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
        }
        resDumpStream?.end();
      }
      if (Object.keys(eventCounts).length) {
        const summary = Object.entries(eventCounts).map(([k, v]) => `${k}=${v}`).join(", ");
        this._logService.info(`[${PROXY_USER_FACING_NAME}] <<< SSE event counts: ${summary}`);
      }
      res.end();
    } catch (err) {
      if (entry.clientGone) {
        this._logService.info(`[${PROXY_USER_FACING_NAME}] client disconnected during upstream call`);
        return;
      }
      if (err instanceof CopilotApiError) {
        this._logService.error(`[${PROXY_USER_FACING_NAME}] CAPI error: status=${err.status}, message=${err.message}`);
        const marker = encodeForwardedChatError(buildForwardedChatError(err));
        writeJsonError(res, err.status, "api_error", `${err.message} ${marker}`);
        return;
      }
      this._logService.error(`[${PROXY_USER_FACING_NAME}] upstream error: ${err instanceof Error ? err.message : String(err)}`);
      writeJsonError(res, 502, "api_error", err instanceof Error ? err.message : String(err));
    } finally {
      res.removeListener("close", onClose);
      runtime.inFlight.delete(entry);
    }
  }
};
CodexProxyService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ICopilotApiService)
], CodexProxyService);
function remapCodexReviewerModel(body, state) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { body };
  }
  const model = typeof parsed.model === "string" ? parsed.model : void 0;
  if (!model) {
    return { body };
  }
  if (model !== CODEX_AUTO_REVIEW_MODEL) {
    state.lastPrimaryModel = model;
    return { body };
  }
  const target = state.lastPrimaryModel;
  if (!target) {
    return { body };
  }
  parsed.model = target;
  return { body: JSON.stringify(parsed), remappedFrom: model, remappedTo: target };
}
function buildOutboundHeaders(inbound) {
  const out = {};
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
export {
  CodexProxyService,
  ICodexProxyService,
  remapCodexReviewerModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb2RleFxcY29kZXhQcm94eVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ29waWxvdEFwaUVycm9yLCBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuLi9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3IsIGVuY29kZUZvcndhcmRlZENoYXRFcnJvciB9IGZyb20gJy4uL3NoYXJlZC9wcm94eUNoYXRFcnJvci5qcyc7XG5pbXBvcnQge1xuXHRJTG9vcGJhY2tQcm94eUhhbmRsZSxcblx0SUxvb3BiYWNrUHJveHlSdW50aW1lLFxuXHRJUHJveHlJbkZsaWdodCxcblx0TG9vcGJhY2tQcm94eVNlcnZlcixcblx0cmVhZFByb3h5UmVxdWVzdEJvZHksXG59IGZyb20gJy4uL3NoYXJlZC9sb29wYmFja1Byb3h5U2VydmVyLmpzJztcblxuLyoqXG4gKiBSZWZjb3VudGVkIGhhbmRsZSB0byB0aGUgbG9jYWwgT3BlbkFJLVJlc3BvbnNlcyBcdTIxOTIgQ0FQSSBwcm94eS5cbiAqXG4gKiBUaGUgaGFuZGxlIG93bnMgYSBub25jZSB0aGF0IHRoZSBjb2RleCBDTEkgcGFzc2VzIGFzIGBCZWFyZXIgPG5vbmNlPmAgb25cbiAqIGV2ZXJ5IHJlcXVlc3QuIFRoZSBwcm94eSB2YWxpZGF0ZXMgdGhhdCBub25jZSwgdGhlbiByZS1pc3N1ZXMgdGhlIHJlcXVlc3RcbiAqIHRvIENBUEkgdXNpbmcgdGhlICoqY3VycmVudCoqIEdpdEh1YiBDb3BpbG90IHRva2VuIFx1MjAxNCB3aGljaCBjYW4gcm90YXRlXG4gKiB1bmRlcm5lYXRoIHRoZSBjb2RleCBwcm9jZXNzIHdpdGhvdXQgYWZmZWN0aW5nIGl0LiBDYWxsXG4gKiB7QGxpbmsgc2V0VG9rZW59IHdoZW4gdGhlIHVwc3RyZWFtIHRva2VuIGNoYW5nZXM7IGluLWZsaWdodCByZXF1ZXN0cyBrZWVwXG4gKiB1c2luZyB0aGUgdmFsdWUgdGhleSBjYXB0dXJlZCBhdCBkaXNwYXRjaCB0aW1lLCBuZXcgcmVxdWVzdHMgcGljayB1cCB0aGVcbiAqIGZyZXNoIHZhbHVlLlxuICpcbiAqIFN1YnByb2Nlc3Mtb3duZXJzaGlwIGludmFyaWFudDogYW55IHN1YnByb2Nlc3MgZ2l2ZW4gYGJhc2VVcmxgIC8gYG5vbmNlYFxuICogTVVTVCBiZSBraWxsZWQgYmVmb3JlIHRoaXMgaGFuZGxlIGlzIGRpc3Bvc2VkOyBvdGhlcndpc2UgdGhlIHByb3h5IG1heVxuICogcmViaW5kIG9uIGEgZGlmZmVyZW50IHBvcnQgb24gbmV4dCBgc3RhcnQoKWAgYW5kIHRoZSBzdWJwcm9jZXNzIHNpbGVudGx5XG4gKiBsb3NlcyBpdHMgZW5kcG9pbnQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4UHJveHlIYW5kbGUgZXh0ZW5kcyBJTG9vcGJhY2tQcm94eUhhbmRsZSB7XG5cdC8qKiBlLmcuIGBodHRwOi8vMTI3LjAuMC4xOjU0MzIxYCBcdTIwMTQgbm8gdHJhaWxpbmcgc2xhc2guICovXG5cdHJlYWRvbmx5IGJhc2VVcmw6IHN0cmluZztcblx0LyoqIFJhbmRvbSBwZXItcHJvY2VzcyBub25jZSB1c2VkIGFzIGBCZWFyZXIgPG5vbmNlPmAgYnkgdGhlIGNvZGV4IENMSS4gKi9cblx0cmVhZG9ubHkgbm9uY2U6IHN0cmluZztcblx0LyoqXG5cdCAqIFJlcGxhY2UgdGhlIEdpdEh1YiBDb3BpbG90IHRva2VuIHVzZWQgZm9yIG91dGJvdW5kIENBUEkgY2FsbHMuIFRoZVxuXHQgKiBjb2RleCBwcm9jZXNzIGFuZCBpdHMgbm9uY2UgYXJlIHVuY2hhbmdlZC5cblx0ICovXG5cdHNldFRva2VuKGdpdGh1YlRva2VuOiBzdHJpbmcpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RleFByb3h5U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU3RhcnQgdGhlIHByb3h5IChpZiBub3QgYWxyZWFkeSBydW5uaW5nKSBhbmQgcmV0dXJuIGEgcmVmY291bnRlZFxuXHQgKiBoYW5kbGUuIFRoZSBwcm92aWRlZCB0b2tlbiBpcyB0aGUgaW5pdGlhbCB2YWx1ZTsgcm90YXRlIHZpYVxuXHQgKiB7QGxpbmsgSUNvZGV4UHJveHlIYW5kbGUuc2V0VG9rZW59LlxuXHQgKi9cblx0c3RhcnQoZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8SUNvZGV4UHJveHlIYW5kbGU+O1xuXG5cdC8qKiBGb3JjZS1jbG9zZSB0aGUgcHJveHkgcmVnYXJkbGVzcyBvZiByZWZjb3VudC4gSWRlbXBvdGVudC4gKi9cblx0ZGlzcG9zZSgpOiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgSUNvZGV4UHJveHlTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDb2RleFByb3h5U2VydmljZT4oJ2NvZGV4UHJveHlTZXJ2aWNlJyk7XG5cbi8qKiBTdWJjbGFzcy1vd25lZCBwZXItYmluZCBtdXRhYmxlIHN0YXRlOiB0aGUgYWN0aXZlIG91dGJvdW5kIENBUEkgdG9rZW4uICovXG5pbnRlcmZhY2UgSUNvZGV4UHJveHlTdGF0ZSB7XG5cdC8qKiBUb2tlbiBjZWxsIFx1MjAxNCByZWFkIGZyZXNoIG9uIGVhY2ggb3V0Ym91bmQgcmVxdWVzdC4gKi9cblx0Z2l0aHViVG9rZW46IHN0cmluZztcblx0LyoqXG5cdCAqIE1vc3QgcmVjZW50ICpwcmltYXJ5KiAobm9uLXJldmlld2VyKSBtb2RlbCBpZCBmb3J3YXJkZWQgb24gdGhpcyBiaW5kLFxuXHQgKiBvYnNlcnZlZCBmcm9tIG5vcm1hbCB0dXJuIHJlcXVlc3RzLiBVc2VkIHRvIHJlbWFwIHRoZSB1bnN1cHBvcnRlZFxuXHQgKiBhdXRvLXJldmlldyByZXZpZXdlciBtb2RlbCAoc2VlIHtAbGluayBDT0RFWF9BVVRPX1JFVklFV19NT0RFTH0pIG9udG8gYVxuXHQgKiBtb2RlbCB0aGF0IGlzIGtub3duIHRvIGJlIHN1cHBvcnRlZCBieSB0aGUgQ29waWxvdCBDQVBJLiBgdW5kZWZpbmVkYFxuXHQgKiB1bnRpbCB0aGUgZmlyc3QgcHJpbWFyeSByZXF1ZXN0IGlzIHNlZW4uXG5cdCAqXG5cdCAqIEJpbmQtZ2xvYmFsLCBub3QgcGVyLXNlc3Npb246IHRoZSBwcm94eSBpcyBhIHNpbmdsZSByZWZjb3VudGVkIGJpbmRcblx0ICogc2hhcmVkIGJ5IGV2ZXJ5IGNvbmN1cnJlbnQgQ29kZXggc2Vzc2lvbiBhbmQgcmV2aWV3ZXIgcmVxdWVzdHMgY2Fycnkgbm9cblx0ICogc2Vzc2lvbiBpZGVudGl0eSwgc28gdGhpcyB0cmFja3MgdGhlIGxhc3QgcHJpbWFyeSBtb2RlbCBzZWVuIGFjcm9zcyBhbGxcblx0ICogc2Vzc2lvbnMuIFVuZGVyIHRoZSBkb2N1bWVudGVkIHNpbmdsZS10ZW5hbnQgYXNzdW1wdGlvbiAob25lIGFjdGl2ZSBtb2RlbFxuXHQgKiBhdCBhIHRpbWUpIHRoYXQgaXMgY29ycmVjdDsgd2l0aCB0d28gY29uY3VycmVudCBzZXNzaW9ucyBvbiAqZGlmZmVyZW50KlxuXHQgKiBtb2RlbHMgd2hlcmUgb25lIHVzZXMgQXV0by1yZXZpZXcsIHRoZSByZXZpZXdlciBtYXkgcnVuIG9uIHRoZSBvdGhlclxuXHQgKiBzZXNzaW9uJ3MgbW9kZWwuIFRoYXQgb25seSBhZmZlY3RzIHJldmlld2VyIG1vZGVsIGNob2ljZSwgbmV2ZXJcblx0ICogY29ycmVjdG5lc3Mgb2YgdGhlIHByaW1hcnkgdHVybnMgKHdoaWNoIGFyZSBmb3J3YXJkZWQgdmVyYmF0aW0pLlxuXHQgKi9cblx0bGFzdFByaW1hcnlNb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIE1vZGVsIGlkIHRoZSBDb2RleCBhcHAtc2VydmVyIHVzZXMgZm9yIGl0cyBidWlsdC1pbiBhdXRvLXJldmlldyByZXZpZXdlclxuICogKHRoZSBcIkF1dG8tcmV2aWV3XCIgcGVybWlzc2lvbnMgcHJlc2V0IHJvdXRlcyBlbGlnaWJsZSBhcHByb3ZhbHMgdGhyb3VnaCBpdCkuXG4gKlxuICogVGhpcyBpcyBhIHNwZWNpYWxpemVkIE9wZW5BSSBtb2RlbCB0aGF0IGlzICoqbm90KiogcGFydCBvZiB0aGUgR2l0SHViXG4gKiBDb3BpbG90IENBUEkgY2F0YWxvZywgc28gZm9yd2FyZGluZyBpdCB2ZXJiYXRpbSB5aWVsZHMgYSA0MDBcbiAqIGBtb2RlbF9ub3Rfc3VwcG9ydGVkYC4gVGhlIGFwcC1zZXJ2ZXIgdHJlYXRzIHRoYXQgYXMgdGhlIHJldmlldyBoYXZpbmdcbiAqICpmYWlsZWQqIGFuZCByZWplY3RzIHRoZSBhY3Rpb24gaW5saW5lIChcIkF1dG9tYXRpYyBhcHByb3ZhbCByZXZpZXcgZmFpbGVkXCIpXG4gKiB3aXRob3V0IGV2ZXIgZW1pdHRpbmcgYW4gYGl0ZW0vYXV0b0FwcHJvdmFsUmV2aWV3L2NvbXBsZXRlZGAgbm90aWZpY2F0aW9uIFx1MjAxNFxuICogd2hpY2ggYnJlYWtzIHRoZSBlbnRpcmUgQXV0by1yZXZpZXcgcHJlc2V0LiBXZSB0cmFuc3BhcmVudGx5IHJlbWFwIGl0IG9udG9cbiAqIHRoZSBzZXNzaW9uJ3MgcHJpbWFyeSBtb2RlbCAoc2VlIHtAbGluayBJQ29kZXhQcm94eVN0YXRlLmxhc3RQcmltYXJ5TW9kZWx9KVxuICogc28gdGhlIHJldmlld2VyIHJ1bnMgb24gYSBzdXBwb3J0ZWQgbW9kZWw7IG9ubHkgdGhlIHVuZGVybHlpbmcgbW9kZWxcbiAqIGRpZmZlcnMsIHRoZSBhcHAtc2VydmVyJ3MgcmV2aWV3IGluc3RydWN0aW9ucyBhcmUgdW5jaGFuZ2VkLlxuICovXG5jb25zdCBDT0RFWF9BVVRPX1JFVklFV19NT0RFTCA9ICdjb2RleC1hdXRvLXJldmlldyc7XG5cbnR5cGUgSUNvZGV4UHJveHlSdW50aW1lID0gSUxvb3BiYWNrUHJveHlSdW50aW1lPElDb2RleFByb3h5U3RhdGU+O1xuXG5jb25zdCBQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FID0gJ0NvZGV4UHJveHlTZXJ2aWNlJztcblxuLyoqXG4gKiBVc2VyLWFnZW50IHByZWZpeCBhcHBsaWVkIHRvIG91dGJvdW5kIENBUEkgcmVxdWVzdHMgc28gdGhlIGNvZGV4IHByb3h5J3NcbiAqIHRyYWZmaWMgaXMgaWRlbnRpZmlhYmxlIHNlcnZlci1zaWRlLiBNaXJyb3JzIGBvYWlMYW5ndWFnZU1vZGVsU2VydmVyLnRzYFxuICogaW4gdGhlIENvcGlsb3QgQ2hhdCBleHRlbnNpb24sIHdoaWNoIHRhZ3MgQ29kZXggcmVxdWVzdHMgd2l0aCB0aGUgc2FtZVxuICogcHJlZml4LlxuICovXG5jb25zdCBVU0VSX0FHRU5UX1BSRUZJWCA9ICd2c2NvZGVfY29kZXgnO1xuXG4vKipcbiAqIFdoZW4gc2V0IHRvIGFuIGFic29sdXRlIGRpcmVjdG9yeSBwYXRoLCBldmVyeSBgL3YxL3Jlc3BvbnNlc2AgcmVxdWVzdCBib2R5XG4gKiBhbmQgaXRzIGZ1bGwgdXBzdHJlYW0gcmVzcG9uc2Ugc3RyZWFtIGFyZSB3cml0dGVuIHRvIHRoYXQgZGlyZWN0b3J5IGFzXG4gKiBgcmVxLU5OTi08dHM+Lmpzb25gIGFuZCBgcmVzLU5OTi08dHM+LnR4dGAgc28gd2UgY2FuIGRpZmYgYm9kaWVzIC8gZGVjb2RlXG4gKiBTU0Ugd2l0aG91dCBmbG9vZGluZyB0aGUgbG9nIGNoYW5uZWwuIE9mZiBieSBkZWZhdWx0LlxuICovXG5jb25zdCBERUJVR19EVU1QX0RJUl9FTlYgPSAnVlNDT0RFX0NPREVYX1BST1hZX0RVTVBfRElSJztcblxubGV0IF9kdW1wU2VxID0gMDtcbmZ1bmN0aW9uIG5leHREdW1wU2VxKCk6IHN0cmluZyB7XG5cdHJldHVybiBTdHJpbmcoKytfZHVtcFNlcSkucGFkU3RhcnQoNCwgJzAnKTtcbn1cblxuZnVuY3Rpb24gZ2V0RHVtcERpcigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBkaXIgPSBwcm9jZXNzLmVudltERUJVR19EVU1QX0RJUl9FTlZdO1xuXHRpZiAoIWRpcikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRmcy5ta2RpclN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gZGlyO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHdyaXRlSnNvbkVycm9yKHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSwgc3RhdHVzOiBudW1iZXIsIHR5cGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdGlmIChyZXMuaGVhZGVyc1NlbnQgfHwgcmVzLndyaXRhYmxlRW5kZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cmVzLndyaXRlSGVhZChzdGF0dXMsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcblx0cmVzLmVuZChKU09OLnN0cmluZ2lmeSh7IGVycm9yOiB7IHR5cGUsIG1lc3NhZ2UgfSB9KSk7XG59XG5cbi8qKlxuICogTG9jYWwgSFRUUCBzZXJ2ZXIgdGhhdCBzcGVha3MgdGhlIE9wZW5BSSBSZXNwb25zZXMgQVBJIG9uIGl0cyBpbmJvdW5kXG4gKiBzaWRlIGFuZCBmb3J3YXJkcyB0byB7QGxpbmsgSUNvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlc30gb24gdGhlXG4gKiBvdXRib3VuZCBzaWRlLiBUaGUgY29kZXggYXBwLXNlcnZlciBjb25uZWN0cyB2aWEgZW52IC8gYC0tY29uZmlnXG4gKiBvcGVuYWlfYmFzZV91cmw9PGJhc2VVcmw+L3YxYCArIEJlYXJlciBgPG5vbmNlPmAgYW5kIHNlZXMgdGhpcyBhcyBhXG4gKiByZWFsIE9wZW5BSSBlbmRwb2ludC5cbiAqXG4gKiBMaWZlY3ljbGU6IHJlZmNvdW50ZWQgaGFuZGxlcywgc2luZ2xlIHNoYXJlZCBiaW5kLCBpbi1mbGlnaHQgcmVxdWVzdHNcbiAqIGFib3J0ZWQgb24gdGVhcmRvd24uXG4gKi9cbmV4cG9ydCBjbGFzcyBDb2RleFByb3h5U2VydmljZSBleHRlbmRzIExvb3BiYWNrUHJveHlTZXJ2ZXI8SUNvZGV4UHJveHlTdGF0ZSwgc3RyaW5nPiBpbXBsZW1lbnRzIElDb2RleFByb3h5U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29waWxvdEFwaVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29waWxvdEFwaVNlcnZpY2U6IElDb3BpbG90QXBpU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoUFJPWFlfVVNFUl9GQUNJTkdfTkFNRSwgbG9nU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlU3RhdGUoZ2l0aHViVG9rZW46IHN0cmluZyk6IElDb2RleFByb3h5U3RhdGUge1xuXHRcdHJldHVybiB7IGdpdGh1YlRva2VuLCBsYXN0UHJpbWFyeU1vZGVsOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElDb2RleFByb3h5SGFuZGxlPiB7XG5cdFx0Y29uc3QgeyBydW50aW1lLCByZWxlYXNlIH0gPSBhd2FpdCB0aGlzLmFjcXVpcmUoZ2l0aHViVG9rZW4pO1xuXHRcdC8vIE1vc3QgcmVjZW50IHRva2VuIHdpbnMgZm9yIHRoZSBydW50aW1lIFx1MjAxNCBzaW5nbGUtdGVuYW50IGFzc3VtcHRpb24uXG5cdFx0Ly8gQ292ZXJzIGNvbmN1cnJlbnQgY2FsbGVycyB0aGF0IGF3YWl0ZWQgdGhlIHNhbWUgYmluZC5cblx0XHRydW50aW1lLnN0YXRlLmdpdGh1YlRva2VuID0gZ2l0aHViVG9rZW47XG5cblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YmFzZVVybDogcnVudGltZS5iYXNlVXJsLFxuXHRcdFx0bm9uY2U6IHJ1bnRpbWUubm9uY2UsXG5cdFx0XHRzZXRUb2tlbjogKG5ld1Rva2VuOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFVwZGF0ZSB0aGUgc2hhcmVkIHJ1bnRpbWUncyB0b2tlbiBjZWxsLiBJbi1mbGlnaHQgcmVxdWVzdHNcblx0XHRcdFx0Ly8ga2VlcCB0aGUgdmFsdWUgdGhleSBjYXB0dXJlZCBhdCBkaXNwYXRjaDsgbmV3IHJlcXVlc3RzXG5cdFx0XHRcdC8vIHBpY2sgdXAgdGhlIGZyZXNoIHZhbHVlIG9uIGBfaGFuZGxlUmVzcG9uc2VzYC5cblx0XHRcdFx0cnVudGltZS5zdGF0ZS5naXRodWJUb2tlbiA9IG5ld1Rva2VuO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0cmVsZWFzZSgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGhhbmRsZVJlcXVlc3QoXG5cdFx0cmVxOiBodHRwLkluY29taW5nTWVzc2FnZSxcblx0XHRyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsXG5cdFx0cnVudGltZTogSUNvZGV4UHJveHlSdW50aW1lLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtZXRob2QgPSByZXEubWV0aG9kID8/ICdHRVQnO1xuXHRcdGNvbnN0IHBhdGhuYW1lID0gbmV3IFVSTChyZXEudXJsID8/ICcvJywgJ2h0dHA6Ly8xMjcuMC4wLjEnKS5wYXRobmFtZTtcblx0XHRjb25zdCBpbmNvbWluZ0hlYWRlcnMgPSBPYmplY3Qua2V5cyhyZXEuaGVhZGVycykuam9pbignLCAnKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSA+Pj4gJHttZXRob2R9ICR7cGF0aG5hbWV9IChoZWFkZXJzOiAke2luY29taW5nSGVhZGVyc30pYCk7XG5cblx0XHRpZiAobWV0aG9kID09PSAnR0VUJyAmJiBwYXRobmFtZSA9PT0gJy8nKSB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nIH0pO1xuXHRcdFx0cmVzLmVuZCgnb2snKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb2RleCBDTEkgc2VuZHMgYEJlYXJlciA8bm9uY2U+YCBcdTIwMTQgcGxhaW4gbm9uY2UsIG5vIHNlc3Npb25JZCBzdWZmaXguXG5cdFx0Y29uc3QgYXV0aEhlYWRlciA9IHJlcS5oZWFkZXJzWydhdXRob3JpemF0aW9uJ107XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBgQmVhcmVyICR7cnVudGltZS5ub25jZX1gO1xuXHRcdGlmICh0eXBlb2YgYXV0aEhlYWRlciAhPT0gJ3N0cmluZycgfHwgYXV0aEhlYWRlciAhPT0gZXhwZWN0ZWQpIHtcblx0XHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNDAxLCAnYXV0aGVudGljYXRpb25fZXJyb3InLCAnSW52YWxpZCBhdXRoZW50aWNhdGlvbicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtZXRob2QgPT09ICdHRVQnICYmIHBhdGhuYW1lID09PSAnL3YxL21vZGVscycpIHtcblx0XHRcdC8vIFRoZSBDb2RleCBlbmRwb2ludCBleHBlY3RzIGl0cyBvd24gcmljaCBgTW9kZWxzUmVzcG9uc2VgIHNjaGVtYSwgbm90XG5cdFx0XHQvLyBDQVBJJ3MgbW9kZWwgc2hhcGUuIFZTIENvZGUgYWxyZWFkeSBvd25zIENBUEkgbW9kZWwgZGlzY292ZXJ5IGFuZFxuXHRcdFx0Ly8gc3VwcGxpZXMgdGhlIHNlbGVjdGVkIG1vZGVsIHdoZW4gc3RhcnRpbmcgYSB0dXJuLCBzbyBhbiBlbXB0eSByZW1vdGVcblx0XHRcdC8vIGNhdGFsb2cga2VlcHMgQ29kZXgncyBidW5kbGVkIG1vZGVsIG1ldGFkYXRhIHdoaWxlIGF2b2lkaW5nIGEgbm9pc3lcblx0XHRcdC8vIHJlZnJlc2ggZmFpbHVyZSBvbiBldmVyeSBwcm94eS1iYWNrZWQgcnVudGltZSBzdGFydC5cblx0XHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG5cdFx0XHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgbW9kZWxzOiBbXSB9KSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ29kZXggc2VuZHMgYC92MS9yZXNwb25zZXNgLCBgLy9yZXNwb25zZXNgICh3aGVuIGJhc2VfdXJsIGVuZHMgaW4gYC9gKSxcblx0XHQvLyBvciBwbGFpbiBgL3Jlc3BvbnNlc2AuIEFjY2VwdCBhbGwgdGhyZWUuXG5cdFx0aWYgKG1ldGhvZCA9PT0gJ1BPU1QnICYmIChwYXRobmFtZSA9PT0gJy92MS9yZXNwb25zZXMnIHx8IHBhdGhuYW1lID09PSAnL3Jlc3BvbnNlcycgfHwgcGF0aG5hbWUgPT09ICcvL3Jlc3BvbnNlcycpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9oYW5kbGVSZXNwb25zZXMocmVxLCByZXMsIHJ1bnRpbWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNDA0LCAnbm90X2ZvdW5kX2Vycm9yJywgYE5vIHJvdXRlIGZvciAke21ldGhvZH0gJHtwYXRobmFtZX1gKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVJlc3BvbnNlcyhcblx0XHRyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLFxuXHRcdHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSxcblx0XHRydW50aW1lOiBJQ29kZXhQcm94eVJ1bnRpbWUsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBib2R5OiBzdHJpbmc7XG5cdFx0dHJ5IHtcblx0XHRcdGJvZHkgPSBhd2FpdCByZWFkUHJveHlSZXF1ZXN0Qm9keShyZXEpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0d3JpdGVKc29uRXJyb3IocmVzLCA0MDAsICdpbnZhbGlkX3JlcXVlc3RfZXJyb3InLCBgRmFpbGVkIHRvIHJlYWQgcmVxdWVzdCBib2R5OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZW1hcCB0aGUgdW5zdXBwb3J0ZWQgYXV0by1yZXZpZXcgcmV2aWV3ZXIgbW9kZWwgb250byB0aGUgc2Vzc2lvbidzXG5cdFx0Ly8gcHJpbWFyeSBtb2RlbCBiZWZvcmUgZm9yd2FyZGluZywgc28gdGhlIFwiQXV0by1yZXZpZXdcIiBwcmVzZXQgd29ya3Ncblx0XHQvLyBhZ2FpbnN0IHRoZSBDb3BpbG90IENBUEkgKHdoaWNoIGRvZXMgbm90IGV4cG9zZSBgY29kZXgtYXV0by1yZXZpZXdgKS5cblx0XHQvLyBBbGwgZG93bnN0cmVhbSBoYW5kbGluZyAoZHVtcCwgbG9nZ2luZywgZm9yd2FyZCkgdXNlcyB0aGUgb3V0Ym91bmRcblx0XHQvLyBib2R5IHNvIGxvZ3MgcmVmbGVjdCBleGFjdGx5IHdoYXQgaXMgc2VudCB1cHN0cmVhbS5cblx0XHRjb25zdCByZW1hcCA9IHJlbWFwQ29kZXhSZXZpZXdlck1vZGVsKGJvZHksIHJ1bnRpbWUuc3RhdGUpO1xuXHRcdGlmIChyZW1hcC5yZW1hcHBlZEZyb20pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dIHJlbWFwcGVkIHVuc3VwcG9ydGVkIHJldmlld2VyIG1vZGVsICcke3JlbWFwLnJlbWFwcGVkRnJvbX0nIC0+ICcke3JlbWFwLnJlbWFwcGVkVG99J2ApO1xuXHRcdH1cblx0XHRib2R5ID0gcmVtYXAuYm9keTtcblxuXHRcdGNvbnN0IGR1bXBEaXIgPSBnZXREdW1wRGlyKCk7XG5cdFx0Y29uc3QgZHVtcFNlcSA9IGR1bXBEaXIgPyBuZXh0RHVtcFNlcSgpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChkdW1wRGlyICYmIGR1bXBTZXEpIHtcblx0XHRcdGNvbnN0IHJlcUZpbGUgPSBqb2luKGR1bXBEaXIsIGByZXEtJHtkdW1wU2VxfS0ke0RhdGUubm93KCl9Lmpzb25gKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZzLndyaXRlRmlsZVN5bmMocmVxRmlsZSwgYm9keSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dIGR1bXBlZCByZXF1ZXN0IGJvZHkgdG8gJHtyZXFGaWxlfWApO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dIGZhaWxlZCB0byBkdW1wIHJlcXVlc3QgYm9keTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGJvZHkpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gPj4+IC9yZXNwb25zZXMgYm9keTogbW9kZWw9JHtwYXJzZWQubW9kZWwgPz8gJzxub25lPid9LCBwcmV2aW91c19yZXNwb25zZV9pZD0ke3BhcnNlZC5wcmV2aW91c19yZXNwb25zZV9pZCA/PyAnPG5vbmU+J30sIHN0cmVhbT0ke3BhcnNlZC5zdHJlYW0gPz8gJzxub25lPid9LCBpbnB1dF9pdGVtcz0ke0FycmF5LmlzQXJyYXkocGFyc2VkLmlucHV0KSA/IHBhcnNlZC5pbnB1dC5sZW5ndGggOiAnPG5vdC1hcnJheT4nfWApO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyc2VkLmlucHV0KSkge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHBhcnNlZC5pbnB1dC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSBwYXJzZWQuaW5wdXRbaV07XG5cdFx0XHRcdFx0Y29uc3QgdHlwZSA9IGl0ZW0/LnR5cGUgPz8gJzxub25lPic7XG5cdFx0XHRcdFx0Y29uc3Qga2V5cyA9IGl0ZW0gJiYgdHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnID8gT2JqZWN0LmtleXMoaXRlbSkuam9pbignLCcpIDogdHlwZW9mIGl0ZW07XG5cdFx0XHRcdFx0bGV0IGRldGFpbCA9ICcnO1xuXHRcdFx0XHRcdGlmICh0eXBlID09PSAnbWVzc2FnZScpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRleHQ6IHN0cmluZyA9IGl0ZW0/LmNvbnRlbnQ/LlswXT8udGV4dCA/PyAnJztcblx0XHRcdFx0XHRcdGRldGFpbCA9IGByb2xlPSR7aXRlbT8ucm9sZSA/PyAnPyd9IGNoYXJzPSR7dGV4dC5sZW5ndGh9YDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGUgPT09ICdmdW5jdGlvbl9jYWxsJykge1xuXHRcdFx0XHRcdFx0ZGV0YWlsID0gYG5hbWU9JHtpdGVtPy5uYW1lID8/ICc/J30gY2FsbF9pZD0ke2l0ZW0/LmNhbGxfaWQgPz8gJz8nfWA7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0eXBlID09PSAnZnVuY3Rpb25fY2FsbF9vdXRwdXQnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvdXRwdXQgPSBpdGVtPy5vdXRwdXQgPz8gJyc7XG5cdFx0XHRcdFx0XHRkZXRhaWwgPSBgY2FsbF9pZD0ke2l0ZW0/LmNhbGxfaWQgPz8gJz8nfSBvdXRwdXRfY2hhcnM9JHt0eXBlb2Ygb3V0cHV0ID09PSAnc3RyaW5nJyA/IG91dHB1dC5sZW5ndGggOiAwfWA7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0eXBlID09PSAncmVhc29uaW5nJykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGl0ZW0/LnN1bW1hcnkgPz8gaXRlbT8uY29udGVudCA/PyAnJztcblx0XHRcdFx0XHRcdGRldGFpbCA9IGBzdW1tYXJ5X2NoYXJzPSR7dHlwZW9mIHN1bW1hcnkgPT09ICdzdHJpbmcnID8gc3VtbWFyeS5sZW5ndGggOiBKU09OLnN0cmluZ2lmeShzdW1tYXJ5KS5sZW5ndGh9IGVuY3J5cHRlZD0ke3R5cGVvZiBpdGVtPy5lbmNyeXB0ZWRfY29udGVudCA9PT0gJ3N0cmluZyd9YDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGV0YWlsID0gSlNPTi5zdHJpbmdpZnkoaXRlbSkuc2xpY2UoMCwgMTIwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gICBpbnB1dFske2l9XSB0eXBlPSR7dHlwZX0ga2V5cz1bJHtrZXlzfV0gJHtkZXRhaWx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHRvcExldmVsS2V5cyA9IE9iamVjdC5rZXlzKHBhcnNlZCkuZmlsdGVyKGsgPT4gayAhPT0gJ2lucHV0Jykuc29ydCgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gICB0b3AtbGV2ZWwga2V5cyAoZXhjbC4gaW5wdXQpPVske3RvcExldmVsS2V5cy5qb2luKCcsICcpfV1gKTtcblx0XHRcdGZvciAoY29uc3QgayBvZiB0b3BMZXZlbEtleXMpIHtcblx0XHRcdFx0aWYgKGsgPT09ICdpbnN0cnVjdGlvbnMnIHx8IGsgPT09ICd0b29scycpIHtcblx0XHRcdFx0XHRjb25zdCB2ID0gcGFyc2VkW2tdO1xuXHRcdFx0XHRcdGNvbnN0IHNpemUgPSB0eXBlb2YgdiA9PT0gJ3N0cmluZycgPyB2Lmxlbmd0aCA6IEpTT04uc3RyaW5naWZ5KHYpLmxlbmd0aDtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSAgICAgJHtrfT08JHtzaXplfSBjaGFycyBlbGlkZWQ+YCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdiA9IHBhcnNlZFtrXTtcblx0XHRcdFx0Y29uc3QgcHJldmlldyA9IHR5cGVvZiB2ID09PSAnb2JqZWN0JyA/IEpTT04uc3RyaW5naWZ5KHYpLnNsaWNlKDAsIDMwMCkgOiBTdHJpbmcodik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dICAgICAke2t9PSR7cHJldmlld31gKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dID4+PiAvcmVzcG9uc2VzIGJvZHkgKHVucGFyc2VhYmxlKTogJHtib2R5LnNsaWNlKDAsIDIwMCl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnk6IElQcm94eUluRmxpZ2h0ID0geyBhYzogbmV3IEFib3J0Q29udHJvbGxlcigpLCByZXMsIGNsaWVudEdvbmU6IGZhbHNlIH07XG5cdFx0cnVudGltZS5pbkZsaWdodC5hZGQoZW50cnkpO1xuXHRcdGNvbnN0IG9uQ2xvc2UgPSAoKSA9PiB7XG5cdFx0XHRlbnRyeS5jbGllbnRHb25lID0gdHJ1ZTtcblx0XHRcdGVudHJ5LmFjLmFib3J0KCk7XG5cdFx0fTtcblx0XHRyZXMub24oJ2Nsb3NlJywgb25DbG9zZSk7XG5cblx0XHQvLyBTbmFwc2hvdCB0aGUgdG9rZW4gYXQgZGlzcGF0Y2ggdGltZSBzbyBhbiBpbi1mbGlnaHQgcmVxdWVzdCBrZWVwc1xuXHRcdC8vIHVzaW5nIHRoZSB2YWx1ZSBpdCBzdGFydGVkIHdpdGg7IHN1YnNlcXVlbnQgcmVxdWVzdHMgd2lsbCBwaWNrIHVwXG5cdFx0Ly8gd2hhdGV2ZXIgYHJ1bnRpbWUuc3RhdGUuZ2l0aHViVG9rZW5gIGhhcyBiZWVuIHJvdGF0ZWQgdG8uXG5cdFx0Y29uc3QgZGlzcGF0Y2hlZFRva2VuID0gcnVudGltZS5zdGF0ZS5naXRodWJUb2tlbjtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBidWlsZE91dGJvdW5kSGVhZGVycyhyZXEuaGVhZGVycyk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gZm9yd2FyZGluZyB0byBDQVBJIHJlc3BvbnNlcy4uLmApO1xuXHRcdFx0Y29uc3QgdXBzdHJlYW0gPSBhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5yZXNwb25zZXMoZGlzcGF0Y2hlZFRva2VuLCBib2R5LCB7IGhlYWRlcnMsIHNpZ25hbDogZW50cnkuYWMuc2lnbmFsLCBzdXBwcmVzc0ludGVncmF0aW9uSWQ6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBjb250ZW50VHlwZSA9IHVwc3RyZWFtLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSA/PyAnYXBwbGljYXRpb24vanNvbic7XG5cdFx0XHRjb25zdCB1cHN0cmVhbUhlYWRlcnMgPSBbLi4udXBzdHJlYW0uaGVhZGVycy5lbnRyaWVzKCldLm1hcCgoW2ssIHZdKSA9PiBgJHtrfTogJHt2fWApLmpvaW4oJywgJyk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSA8PDwgQ0FQSSByZXNwb25zZTogc3RhdHVzPSR7dXBzdHJlYW0uc3RhdHVzfSwgY29udGVudFR5cGU9JHtjb250ZW50VHlwZX0sIGhlYWRlcnM9WyR7dXBzdHJlYW1IZWFkZXJzfV1gKTtcblx0XHRcdHJlcy53cml0ZUhlYWQodXBzdHJlYW0uc3RhdHVzLCB7ICdDb250ZW50LVR5cGUnOiBjb250ZW50VHlwZSB9KTtcblx0XHRcdGlmICghdXBzdHJlYW0uYm9keSkge1xuXHRcdFx0XHRyZXMuZW5kKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlYWRlciA9IHVwc3RyZWFtLmJvZHkuZ2V0UmVhZGVyKCk7XG5cdFx0XHRjb25zdCByZXNEdW1wU3RyZWFtID0gZHVtcERpciAmJiBkdW1wU2VxXG5cdFx0XHRcdD8gZnMuY3JlYXRlV3JpdGVTdHJlYW0oam9pbihkdW1wRGlyLCBgcmVzLSR7ZHVtcFNlcX0tJHtEYXRlLm5vdygpfS50eHRgKSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgc3NlQnVmID0gJyc7XG5cdFx0XHRjb25zdCBldmVudENvdW50czogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0XHRjb25zdCB7IGRvbmUsIHZhbHVlIH0gPSBhd2FpdCByZWFkZXIucmVhZCgpO1xuXHRcdFx0XHRcdGlmIChkb25lKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGVudHJ5LmNsaWVudEdvbmUpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodmFsdWUgJiYgdmFsdWUuYnl0ZUxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJ1ZiA9IEJ1ZmZlci5mcm9tKHZhbHVlKTtcblx0XHRcdFx0XHRcdHJlcy53cml0ZShidWYpO1xuXHRcdFx0XHRcdFx0aWYgKHJlc0R1bXBTdHJlYW0pIHtcblx0XHRcdFx0XHRcdFx0cmVzRHVtcFN0cmVhbS53cml0ZShidWYpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c3NlQnVmICs9IGJ1Zi50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0XHRcdFx0bGV0IG5sOiBudW1iZXI7XG5cdFx0XHRcdFx0XHR3aGlsZSAoKG5sID0gc3NlQnVmLmluZGV4T2YoJ1xcbicpKSA+PSAwKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmUgPSBzc2VCdWYuc2xpY2UoMCwgbmwpLnRyaW1FbmQoKTtcblx0XHRcdFx0XHRcdFx0c3NlQnVmID0gc3NlQnVmLnNsaWNlKG5sICsgMSk7XG5cdFx0XHRcdFx0XHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJ2V2ZW50OicpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZXYgPSBsaW5lLnNsaWNlKCdldmVudDonLmxlbmd0aCkudHJpbSgpO1xuXHRcdFx0XHRcdFx0XHRcdGV2ZW50Q291bnRzW2V2XSA9IChldmVudENvdW50c1tldl0gPz8gMCkgKyAxO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0cnkgeyByZWFkZXIucmVsZWFzZUxvY2soKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHRcdHJlc0R1bXBTdHJlYW0/LmVuZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKE9iamVjdC5rZXlzKGV2ZW50Q291bnRzKS5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3Qgc3VtbWFyeSA9IE9iamVjdC5lbnRyaWVzKGV2ZW50Q291bnRzKS5tYXAoKFtrLCB2XSkgPT4gYCR7a309JHt2fWApLmpvaW4oJywgJyk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dIDw8PCBTU0UgZXZlbnQgY291bnRzOiAke3N1bW1hcnl9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXMuZW5kKCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoZW50cnkuY2xpZW50R29uZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSBjbGllbnQgZGlzY29ubmVjdGVkIGR1cmluZyB1cHN0cmVhbSBjYWxsYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBDb3BpbG90QXBpRXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dIENBUEkgZXJyb3I6IHN0YXR1cz0ke2Vyci5zdGF0dXN9LCBtZXNzYWdlPSR7ZXJyLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlciA9IGVuY29kZUZvcndhcmRlZENoYXRFcnJvcihidWlsZEZvcndhcmRlZENoYXRFcnJvcihlcnIpKTtcblx0XHRcdFx0d3JpdGVKc29uRXJyb3IocmVzLCBlcnIuc3RhdHVzLCAnYXBpX2Vycm9yJywgYCR7ZXJyLm1lc3NhZ2V9ICR7bWFya2VyfWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gdXBzdHJlYW0gZXJyb3I6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0d3JpdGVKc29uRXJyb3IocmVzLCA1MDIsICdhcGlfZXJyb3InLCBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXMucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgb25DbG9zZSk7XG5cdFx0XHRydW50aW1lLmluRmxpZ2h0LmRlbGV0ZShlbnRyeSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQ29tcHV0ZSB0aGUgb3V0Ym91bmQgYC92MS9yZXNwb25zZXNgIGJvZHksIHRyYW5zcGFyZW50bHkgcmVtYXBwaW5nIHRoZVxuICogdW5zdXBwb3J0ZWQgQ29kZXggYXV0by1yZXZpZXcgcmV2aWV3ZXIgbW9kZWwgKHNlZVxuICoge0BsaW5rIENPREVYX0FVVE9fUkVWSUVXX01PREVMfSkgb250byB0aGUgbGFzdC1zZWVuIHByaW1hcnkgbW9kZWwuIFJlY29yZHNcbiAqIHRoZSBwcmltYXJ5IG1vZGVsIG9uIGBzdGF0ZWAgYXMgYSBzaWRlIGVmZmVjdCBzbyBhIGxhdGVyIHJldmlld2VyIHJlcXVlc3RcbiAqIGNhbiBiZSByZW1hcHBlZC5cbiAqXG4gKiBSZXR1cm5zIHRoZSBvcmlnaW5hbCBib2R5IHVudG91Y2hlZCBcdTIwMTQgYW5kIGZvcndhcmRzIHZlcmJhdGltLCBleGFjdGx5IGFzXG4gKiBiZWZvcmUgXHUyMDE0IHdoZW4gaXQgaXMgdW5wYXJzZWFibGUsIGNhcnJpZXMgbm8gYG1vZGVsYCwgYWxyZWFkeSB1c2VzIGEgcHJpbWFyeVxuICogbW9kZWwsIG9yIHdoZW4gbm8gcHJpbWFyeSBtb2RlbCBoYXMgYmVlbiBvYnNlcnZlZCB5ZXQgKGdyYWNlZnVsXG4gKiBkZWdyYWRhdGlvbjogdGhlIHJldmlld2VyIHJlcXVlc3Qgc3RpbGwgNDAwcywgaS5lLiBubyB3b3JzZSB0aGFuIG5vdFxuICogcmVtYXBwaW5nIGF0IGFsbCkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1hcENvZGV4UmV2aWV3ZXJNb2RlbChcblx0Ym9keTogc3RyaW5nLFxuXHRzdGF0ZTogeyBsYXN0UHJpbWFyeU1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQgfSxcbik6IHsgcmVhZG9ubHkgYm9keTogc3RyaW5nOyByZWFkb25seSByZW1hcHBlZEZyb20/OiBzdHJpbmc7IHJlYWRvbmx5IHJlbWFwcGVkVG8/OiBzdHJpbmcgfSB7XG5cdGxldCBwYXJzZWQ6IHsgbW9kZWw/OiB1bmtub3duIH07XG5cdHRyeSB7XG5cdFx0cGFyc2VkID0gSlNPTi5wYXJzZShib2R5KTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHsgYm9keSB9O1xuXHR9XG5cdGNvbnN0IG1vZGVsID0gdHlwZW9mIHBhcnNlZC5tb2RlbCA9PT0gJ3N0cmluZycgPyBwYXJzZWQubW9kZWwgOiB1bmRlZmluZWQ7XG5cdGlmICghbW9kZWwpIHtcblx0XHRyZXR1cm4geyBib2R5IH07XG5cdH1cblx0aWYgKG1vZGVsICE9PSBDT0RFWF9BVVRPX1JFVklFV19NT0RFTCkge1xuXHRcdC8vIEEgbm9ybWFsIHR1cm4gcmVxdWVzdCBcdTIwMTQgcmVtZW1iZXIgaXRzIG1vZGVsIHNvIHdlIGNhbiBzdWJzdGl0dXRlIGl0XG5cdFx0Ly8gZm9yIGEgc3Vic2VxdWVudCByZXZpZXdlciByZXF1ZXN0LlxuXHRcdHN0YXRlLmxhc3RQcmltYXJ5TW9kZWwgPSBtb2RlbDtcblx0XHRyZXR1cm4geyBib2R5IH07XG5cdH1cblx0Y29uc3QgdGFyZ2V0ID0gc3RhdGUubGFzdFByaW1hcnlNb2RlbDtcblx0aWYgKCF0YXJnZXQpIHtcblx0XHRyZXR1cm4geyBib2R5IH07XG5cdH1cblx0KHBhcnNlZCBhcyB7IG1vZGVsOiBzdHJpbmcgfSkubW9kZWwgPSB0YXJnZXQ7XG5cdHJldHVybiB7IGJvZHk6IEpTT04uc3RyaW5naWZ5KHBhcnNlZCksIHJlbWFwcGVkRnJvbTogbW9kZWwsIHJlbWFwcGVkVG86IHRhcmdldCB9O1xufVxuXG5cbmZ1bmN0aW9uIGJ1aWxkT3V0Ym91bmRIZWFkZXJzKGluYm91bmQ6IGh0dHAuSW5jb21pbmdIdHRwSGVhZGVycyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuXHRjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0Y29uc3QgdXNlckFnZW50ID0gaW5ib3VuZFsndXNlci1hZ2VudCddO1xuXHRpZiAodHlwZW9mIHVzZXJBZ2VudCA9PT0gJ3N0cmluZycgJiYgdXNlckFnZW50Lmxlbmd0aCA+IDApIHtcblx0XHRvdXRbJ1VzZXItQWdlbnQnXSA9IHRyYW5zZm9ybVVzZXJBZ2VudCh1c2VyQWdlbnQpO1xuXHR9XG5cdHJldHVybiBvdXQ7XG59XG5cbi8qKlxuICogVHJhbnNmb3JtIGFuIGluY29taW5nIHVzZXItYWdlbnQgc3RyaW5nIGJ5IHJlcGxhY2luZyB0aGUgY2xpZW50IG5hbWUgcG9ydGlvblxuICogKGJlZm9yZSB0aGUgZmlyc3QgYC9gKSB3aXRoIHtAbGluayBVU0VSX0FHRU5UX1BSRUZJWH0uIFRoaXMgbWlycm9ycyB0aGVcbiAqIHRyYW5zZm9ybSBpbiBgb2FpTGFuZ3VhZ2VNb2RlbFNlcnZlci50c2AgaW4gdGhlIENvcGlsb3QgQ2hhdCBleHRlbnNpb24sXG4gKiBlbnN1cmluZyBhbGwgQ29kZXggcmVxdWVzdHMgYXJlIHRhZ2dlZCB3aXRoIGEgY29uc2lzdGVudCBwcmVmaXggZm9yXG4gKiBzZXJ2ZXItc2lkZSBpZGVudGlmaWNhdGlvbi5cbiAqXG4gKiBFeGFtcGxlczpcbiAqIC0gYGNvZGV4LzEuMi4zYCBcdTIxOTIgYHZzY29kZV9jb2RleC8xLjIuM2BcbiAqIC0gYE9wZW5BSS9QeXRob24vMS4wYCBcdTIxOTIgYHZzY29kZV9jb2RleC9QeXRob24vMS4wYFxuICogLSBgdW5rbm93bmAgXHUyMTkyIGB2c2NvZGVfY29kZXgvdW5rbm93bmBcbiAqL1xuZnVuY3Rpb24gdHJhbnNmb3JtVXNlckFnZW50KHVzZXJBZ2VudDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgc2xhc2hJbmRleCA9IHVzZXJBZ2VudC5pbmRleE9mKCcvJyk7XG5cdGlmIChzbGFzaEluZGV4ID09PSAtMSkge1xuXHRcdHJldHVybiBgJHtVU0VSX0FHRU5UX1BSRUZJWH0vJHt1c2VyQWdlbnR9YDtcblx0fVxuXHRyZXR1cm4gYCR7VVNFUl9BR0VOVF9QUkVGSVh9JHt1c2VyQWdlbnQuc3Vic3RyaW5nKHNsYXNoSW5kZXgpfWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFlBQVksUUFBUTtBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUIsMEJBQTBCO0FBQ3BELFNBQVMseUJBQXlCLGdDQUFnQztBQUNsRTtBQUFBLEVBSUM7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQTRDQSxNQUFNLHFCQUFxQixnQkFBb0MsbUJBQW1CO0FBdUN6RixNQUFNLDBCQUEwQjtBQUloQyxNQUFNLHlCQUF5QjtBQVEvQixNQUFNLG9CQUFvQjtBQVExQixNQUFNLHFCQUFxQjtBQUUzQixJQUFJLFdBQVc7QUFDZixTQUFTLGNBQXNCO0FBQzlCLFNBQU8sT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUMxQztBQUVBLFNBQVMsYUFBaUM7QUFDekMsUUFBTSxNQUFNLFFBQVEsSUFBSSxrQkFBa0I7QUFDMUMsTUFBSSxDQUFDLEtBQUs7QUFDVCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUk7QUFDSCxPQUFHLFVBQVUsS0FBSyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQ3JDLFdBQU87QUFBQSxFQUNSLFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsU0FBUyxlQUFlLEtBQTBCLFFBQWdCLE1BQWMsU0FBdUI7QUFDdEcsTUFBSSxJQUFJLGVBQWUsSUFBSSxlQUFlO0FB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
