import { createRequire } from "module";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { basename, dirname } from "../../../../../../base/common/path.js";
import { aggregateAnthropicSse, anthropicMessageToSse, ANTHROPIC_MESSAGES_PATH, aggregateResponsesSse, responsesMessageToSse, RESPONSES_PATH, summarizeResponsesRequest, deserializeAnthropicContent, serializeAnthropicContent, summarizeAnthropicRequest } from "./capiWireCodec.js";
import { getAncillaryStub } from "./capiStubs.js";
import { findPosixOnlyCommands, formatPosixCommandError, getRecordedShellCommand } from "./posixCommandLint.js";
import { formatModelRequestMismatch, modelRequestsMatch, projectModelRequest } from "./modelRequestProjection.js";
import { expandShellToolName, normalizeShellToolNameForCapture } from "./shellToolNames.js";
import { scrubUserName, USER_NAME_PLACEHOLDER } from "./userNameScrub.js";
const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire("http");
const httpsModule = nodeRequire("https");
const zlibModule = nodeRequire("zlib");
const yamlModule = nodeRequire("js-yaml");
const MODEL_ENDPOINTS = /* @__PURE__ */ new Set(["/chat/completions", "/responses", "/v1/messages"]);
const STORED_RESPONSE_HEADERS = /* @__PURE__ */ new Set(["content-type"]);
const WORKDIR_PLACEHOLDER = "${workdir}";
const HOMEDIR_PLACEHOLDER = "${homedir}";
const COPIED_PLUGIN_DIR_PLACEHOLDER = "${plugin_copy}";
const COPIED_PLUGIN_DIR_RE = /\$\{homedir\}(?:\/|\\\\)user-data(?:\/|\\\\)agentPlugins(?:\/|\\\\)[^\/\\"]+/g;
const TEMP_DIR_SUFFIX_PLACEHOLDER = "${temp}";
const TEMP_DIR_SUFFIX_RE = /(\$\{workdir\}(?:\/|\\\\)(?:ahp-(?:snapshot|perm-test|plan-test|abort|test|wt-test|subagent-test|subagent-replay|attachment-test|cd-strip-test|coverage-[a-z-]+)-|copilot-(?:cost-report|text-blob)-|read-sdk-simple))[A-Za-z0-9]{6}/g;
const UUID_PLACEHOLDER_RE = /\$\{uuid_\d+\}/g;
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE_LISTING_DATE_RE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\b/g;
const USER_PLACEHOLDER = USER_NAME_PLACEHOLDER;
const CAPI_PLACEHOLDER = "${capi}";
const SECRET_PLACEHOLDER = "${redacted}";
const SECRET_FIELD_RE = /("(?:token|session_token)"\s*:\s*)"[^"]*"/g;
const SYSTEM_FIELD_RE = /("instructions"\s*:\s*)"(?:[^"\\]|\\.)*"/g;
const SYSTEM_PROMPT_PLACEHOLDER = "${system}";
const GITHUB_API_PREFIXES = ["/copilot_internal", "/telemetry", "/copilot/mcp_registry"];
const DIALECT_ENDPOINT = {
  anthropic: { method: "POST", path: ANTHROPIC_MESSAGES_PATH },
  responses: { method: "POST", path: RESPONSES_PATH }
};
function isTurnExchange(exchange) {
  return exchange.request !== void 0;
}
class CapiReplayProxy {
  constructor(_options) {
    this._options = _options;
    this._stopped = false;
    /** Buckets used for replay, keyed by `${method} ${path}`. */
    this._replayBuckets = /* @__PURE__ */ new Map();
    /** Exchanges captured during recording, in arrival order. */
    this._recorded = [];
    this._observedModelRequestBodies = [];
    this._cacheMisses = [];
    this._requestMismatches = [];
    this._replayPlaceholderValues = /* @__PURE__ */ new Map();
    this._modelTurnCount = 0;
    this._allowStaleRecordedRequest = _options.allowStaleRecordedRequest ?? false;
    this._fixturePath = _options.fixturePath;
    this._workingDirectory = _options.workDir;
    const fixtureExists = existsSync(this._fixturePath);
    this._mode = _options.mode ?? "replay";
    this._strict = _options.strict ?? true;
    if (this._mode === "replay" && !fixtureExists) {
      throw new Error(`[capi-replay] replay mode requires a fixture but none exists at ${this._fixturePath}`);
    }
    this._isReplaying = this._mode === "replay";
    if (this._isReplaying) {
      this._loadFixture();
    }
  }
  /** Base URL the agent host should be pointed at. Available after {@link start}. */
  get url() {
    if (!this._url) {
      throw new Error("[capi-replay] proxy not started");
    }
    return this._url;
  }
  get isReplaying() {
    return this._isReplaying;
  }
  async start() {
    this._server = httpModule.createServer((req, res) => this._handle(req, res));
    return new Promise((resolve, reject) => {
      this._server.on("error", reject);
      this._server.listen(0, "127.0.0.1", () => {
        const addr = this._server.address();
        if (addr && typeof addr === "object") {
          this._url = `http://127.0.0.1:${addr.port}`;
          resolve(this._url);
        } else {
          reject(new Error("[capi-replay] failed to determine proxy address"));
        }
      });
    });
  }
  /**
   * Stop the proxy. When recording, flushes captured exchanges to the fixture.
   * When replaying in strict mode, throws if any request missed the cache.
   */
  async stop() {
    if (this._stopped) {
      return;
    }
    this._stopped = true;
    await this._closeSocket();
    if (this._isReplaying) {
      this.assertNoReplayMismatches();
      return;
    }
    this._writeFixture();
  }
  /**
   * Re-point a long-lived replay proxy at a different per-test fixture without
   * restarting the HTTP server (so the URL the agent host was pointed at stays
   * valid). Clears the previous fixture's replay buckets and cache-miss log.
   * Replay-only: recording keeps one fixture per proxy.
   */
  resetForReplay(fixturePath, allowStaleRecordedRequest = false) {
    if (!this._isReplaying) {
      throw new Error("[capi-replay] resetForReplay is only valid in replay mode");
    }
    if (!existsSync(fixturePath)) {
      throw new Error(`[capi-replay] replay mode requires a fixture but none exists at ${fixturePath}`);
    }
    this._fixturePath = fixturePath;
    this._allowStaleRecordedRequest = allowStaleRecordedRequest;
    this._workingDirectory = void 0;
    this._replayBuckets.clear();
    this._observedModelRequestBodies.length = 0;
    this._cacheMisses.length = 0;
    this._requestMismatches.length = 0;
    this._replayPlaceholderValues.clear();
    this._modelTurnCount = 0;
    this._loadFixture();
  }
  setWorkingDirectory(workingDirectory) {
    this._workingDirectory = workingDirectory;
  }
  setRecordingModelResponse(response) {
    if (this._isReplaying) {
      throw new Error("[capi-replay] setRecordingModelResponse is only valid in record mode");
    }
    this._recordingModelResponse = response;
  }
  get observedModelRequestBodies() {
    return this._observedModelRequestBodies;
  }
  /**
   * Surface strict replay failures — unrecorded requests and requests that do
   * not match the recorded one — without stopping the proxy. Lets a shared
   * replay server verify each test's traffic in `teardown` while keeping the
   * server (and the agent host's cached SDK client) alive for the next test.
   */
  assertNoReplayMismatches() {
    const error = this._createReplayError();
    if (error) {
      throw error;
    }
  }
  /** Returns and consumes the current replay failure so it can be surfaced at the original test failure. */
  takeReplayError() {
    const error = this._createReplayError();
    this._cacheMisses.length = 0;
    this._requestMismatches.length = 0;
    return error;
  }
  _createReplayError() {
    if (!this._isReplaying || !this._strict) {
      return void 0;
    }
    const sections = [];
    if (this._cacheMisses.length > 0) {
      sections.push(`[capi-replay] ${this._cacheMisses.length} cache miss(es):
${this._cacheMisses.join("\n")}`);
    }
    if (this._requestMismatches.length > 0) {
      sections.push(`[capi-replay] ${this._requestMismatches.length} model request mismatch(es):
${this._requestMismatches.join("\n")}`);
    }
    const unconsumed = Array.from(this._replayBuckets.entries()).flatMap(([key, bucket]) => bucket.index < bucket.items.length ? [`${key}: ${bucket.items.length - bucket.index} response(s)`] : []);
    if (unconsumed.length > 0) {
      sections.push(`[capi-replay] unconsumed recorded responses:
${unconsumed.join("\n")}`);
    }
    return sections.length > 0 ? new Error(sections.join("\n\n")) : void 0;
  }
  /**
   * Close the HTTP server socket without running the strict replay checks or
   * writing a fixture. Used to tear down a shared replay proxy after per-test
   * verification has already happened via {@link assertNoReplayMismatches}.
   */
  async close() {
    if (this._stopped) {
      return;
    }
    this._stopped = true;
    await this._closeSocket();
  }
  async _closeSocket() {
    const server = this._server;
    this._server = void 0;
    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    }
  }
  // -- request handling -----------------------------------------------------
  _handle(req, res) {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (this._isReplaying) {
        this._replay(req, body, res);
      } else {
        this._record(req, body, res);
      }
    });
    req.on("error", () => this._fail(res, "request stream error"));
  }
  _replay(req, body, res) {
    const method = req.method ?? "GET";
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const stub = getAncillaryStub(method, path, body);
    if (stub) {
      res.writeHead(stub.status, { ...stub.headers });
      res.end(replaceAll(stub.body, CAPI_PLACEHOLDER, this.url));
      return;
    }
    const key = `${method} ${path}`;
    if (MODEL_ENDPOINTS.has(path)) {
      this._observedModelRequestBodies.push(this._normalize(body));
    }
    const bucket = this._replayBuckets.get(key);
    let item;
    if (bucket) {
      if (bucket.index < bucket.items.length) {
        item = bucket.items[bucket.index++];
      } else if (!MODEL_ENDPOINTS.has(path)) {
        item = bucket.items[bucket.items.length - 1];
      }
    }
    if (!item) {
      this._cacheMisses.push(`${key} (call #${(bucket?.index ?? 0) + 1}) \u2014 no recorded response`);
      this._fail(res, `no recorded response for ${key}`);
      return;
    }
    if (item.kind === "turn") {
      this._assertRecordedRequest(item.dialect, item.request, body);
      const message = this._expandReplayMessage(item.message);
      const sseBody = item.dialect === "responses" ? responsesMessageToSse(message) : anthropicMessageToSse(message);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.end(sseBody);
      return;
    }
    const headers = { ...item.response.headers };
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    res.writeHead(item.response.status, headers);
    res.end(this._expandReplayPlaceholders(item.response.body));
  }
  /**
   * Compare the live request against the one recorded for this turn.
   *
   * Both sides go through the same summarizer and the same projection, so the
   * committed `request:` block becomes the expectation without its stored
   * shape having to change.
   */
  _assertRecordedRequest(dialect, recorded, body) {
    const turnIndex = this._modelTurnCount++;
    const summarize = dialect === "responses" ? summarizeResponsesRequest : summarizeAnthropicRequest;
    const normalizedBody = this._normalize(body);
    const observed = summarize(normalizedBody);
    if (!observed) {
      return;
    }
    captureReplayPlaceholderValues(recorded, observed, this._replayPlaceholderValues);
    if (this._allowStaleRecordedRequest) {
      return;
    }
    const normalizedObserved = summarize(this._normalizeReplayPlaceholderValues(normalizedBody));
    if (!normalizedObserved) {
      return;
    }
    const expected = projectModelRequest(recorded);
    const actual = projectModelRequest(normalizedObserved);
    if (!modelRequestsMatch(expected, actual)) {
      this._requestMismatches.push(formatModelRequestMismatch(turnIndex, expected, actual));
    }
  }
  _normalizeReplayPlaceholderValues(text) {
    let result = text;
    for (const [placeholder, value] of this._replayPlaceholderValues) {
      result = replaceAll(result, value, placeholder);
    }
    return result;
  }
  _record(req, body, res) {
    const method = req.method ?? "GET";
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const stub = getAncillaryStub(method, path, body);
    if (stub) {
      res.writeHead(stub.status, { ...stub.headers });
      res.end(replaceAll(stub.body, CAPI_PLACEHOLDER, this.url));
      return;
    }
    if (MODEL_ENDPOINTS.has(path)) {
      this._observedModelRequestBodies.push(this._normalize(body));
    }
    if (MODEL_ENDPOINTS.has(path) && this._recordingModelResponse) {
      const response = this._recordingModelResponse;
      res.writeHead(response.status, response.headers);
      res.end(response.body);
      this._recorded.push({
        method,
        path,
        requestBody: this._normalize(body),
        response: {
          ...response,
          headers: filterRecordedResponseHeaders(response.headers),
          body: this._normalize(response.body)
        }
      });
      return;
    }
    const upstreamBase = this._upstreamFor(path);
    const upstream = new URL(req.url ?? "/", upstreamBase);
    const isHttps = upstream.protocol === "https:";
    const transport = isHttps ? httpsModule : httpModule;
    const forwardHeaders = { ...req.headers };
    forwardHeaders.host = upstream.host;
    delete forwardHeaders["connection"];
    delete forwardHeaders["content-length"];
    const upstreamReq = transport.request(
      {
        hostname: upstream.hostname,
        port: upstream.port || (isHttps ? 443 : 80),
        path: upstream.pathname + upstream.search,
        method,
        headers: forwardHeaders
      },
      (upstreamRes) => {
        const respChunks = [];
        const status = upstreamRes.statusCode ?? 502;
        const headers = flattenHeaders(upstreamRes.headers);
        res.writeHead(status, headers);
        upstreamRes.on("data", (chunk) => {
          respChunks.push(chunk);
          res.write(chunk);
        });
        upstreamRes.on("end", () => {
          res.end();
          if (getAncillaryStub(method, path, body)) {
            return;
          }
          const decoded = decodeBody(Buffer.concat(respChunks), headers["content-encoding"]);
          const storedHeaders = filterRecordedResponseHeaders(headers);
          const capiOrigin = new URL(this._capiUpstream).origin;
          const normalizedBody = this._normalize(replaceAll(decoded, capiOrigin, CAPI_PLACEHOLDER)).replace(SECRET_FIELD_RE, `$1"${SECRET_PLACEHOLDER}"`).replace(SYSTEM_FIELD_RE, `$1"${SYSTEM_PROMPT_PLACEHOLDER}"`);
          this._recorded.push({
            method,
            path,
            requestBody: this._normalize(body),
            response: { status, headers: storedHeaders, body: normalizedBody }
          });
        });
      }
    );
    upstreamReq.on("error", (err) => this._fail(res, `upstream error: ${err instanceof Error ? err.message : String(err)}`));
    if (body) {
      upstreamReq.write(body);
    }
    upstreamReq.end();
  }
  /** GitHub-API paths go to the GitHub upstream; everything else to CAPI. */
  _upstreamFor(path) {
    if (GITHUB_API_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return this._githubUpstream;
    }
    return this._capiUpstream;
  }
  get _capiUpstream() {
    const url = this._options.capiUpstreamUrl ?? this._options.upstreamUrl;
    if (!url) {
      throw new Error("[capi-replay] no CAPI upstream configured (set capiUpstreamUrl or upstreamUrl)");
    }
    return url;
  }
  get _githubUpstream() {
    const url = this._options.githubUpstreamUrl ?? this._options.upstreamUrl;
    if (!url) {
      throw new Error("[capi-replay] no GitHub upstream configured (set githubUpstreamUrl or upstreamUrl)");
    }
    return url;
  }
  _fail(res, message) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain", "x-should-retry": "false" });
    }
    res.end(`[capi-replay] ${message}`);
  }
  // -- fixture I/O ----------------------------------------------------------
  _loadFixture() {
    const fixture = yamlModule.load(readFileSync(this._fixturePath, "utf8"));
    const turnEndpoint = fixture.dialect ? DIALECT_ENDPOINT[fixture.dialect] : void 0;
    for (const exchange of fixture.exchanges) {
      let key;
      let item;
      if (isTurnExchange(exchange)) {
        if (!turnEndpoint) {
          throw new Error(`[capi-replay] fixture has turn exchanges but no top-level dialect: ${this._fixturePath}`);
        }
        key = `${turnEndpoint.method} ${turnEndpoint.path}`;
        item = { kind: "turn", dialect: fixture.dialect, message: { content: deserializeAnthropicContent(exchange.response.content), stopReason: exchange.response.stopReason }, request: exchange.request };
      } else {
        key = `${exchange.method} ${exchange.path}`;
        item = { kind: "raw", response: exchange.response };
      }
      let bucket = this._replayBuckets.get(key);
      if (!bucket) {
        bucket = { items: [], index: 0 };
        this._replayBuckets.set(key, bucket);
      }
      bucket.items.push(item);
    }
  }
  _writeFixture() {
    const built = this._recorded.map((exchange) => this._toFixtureExchange(exchange));
    const exchanges = built.map((b) => b.exchange);
    this._normalizeToolCallIds(exchanges);
    this._normalizeUuids(exchanges);
    this._assertNoPosixOnlyCommands(exchanges);
    const dialect = built.find((b) => b.dialect !== void 0)?.dialect;
    const fixture = { version: 1, ...dialect ? { dialect } : {}, exchanges };
    mkdirSync(dirname(this._fixturePath), { recursive: true });
    writeFileSync(this._fixturePath, yamlModule.dump(fixture, { lineWidth: -1, noRefs: true }));
  }
  /**
   * Reject a recording whose shell commands cannot run on Windows.
   *
   * Only the assistant's `tool_use` blocks matter: those are what replay feeds
   * back to the agent, so they are the commands that will actually be executed
   * on whatever platform the test later runs on. The `tool_result` blocks
   * echoed in request summaries are never read back.
   *
   * Throws before the file is written so a rejected recording cannot leave a
   * half-portable fixture behind.
   */
  _assertNoPosixOnlyCommands(exchanges) {
    if (this._options.allowPosixCommands) {
      return;
    }
    const commands = [];
    for (const exchange of exchanges) {
      if (!isTurnExchange(exchange)) {
        continue;
      }
      for (const block of deserializeAnthropicContent(exchange.response.content)) {
        if (block.type !== "tool_use") {
          continue;
        }
        const command = getRecordedShellCommand(block.input);
        if (command) {
          commands.push({ command, toolName: block.name });
        }
      }
    }
    const findings = findPosixOnlyCommands(commands);
    if (findings.length > 0) {
      throw new Error(formatPosixCommandError(this._fixturePath, findings));
    }
  }
  /**
   * Replace the backend's opaque tool-call ids with stable, readable ordinals
   * (`toolcall_0`, `toolcall_1`, ...) across the whole fixture. Assistant
   * `tool_use` blocks define the ordering; the `tool_result` blocks that refer
   * back to them in later requests reuse the same mapping. Keeps captures
   * deterministic across re-records and easy to follow.
   */
  _normalizeToolCallIds(exchanges) {
    const idMap = /* @__PURE__ */ new Map();
    const mapId = (id) => {
      let mapped = idMap.get(id);
      if (mapped === void 0) {
        mapped = `toolcall_${idMap.size}`;
        idMap.set(id, mapped);
      }
      return mapped;
    };
    for (const exchange of exchanges) {
      if (!isTurnExchange(exchange) || !Array.isArray(exchange.response.content)) {
        continue;
      }
      for (const block of exchange.response.content) {
        const b = block;
        if (b.type === "tool_use" && typeof b.id === "string" && b.id) {
          b.id = mapId(b.id);
        }
      }
    }
    for (const exchange of exchanges) {
      if (!isTurnExchange(exchange)) {
        continue;
      }
      for (const message of exchange.request.messages) {
        const content = message.content;
        if (!Array.isArray(content)) {
          continue;
        }
        for (const block of content) {
          const b = block;
          if (b.type === "tool_result" && typeof b.tool_use_id === "string" && b.tool_use_id) {
            b.tool_use_id = mapId(b.tool_use_id);
          }
        }
      }
    }
  }
  /**
   * Replace ephemeral UUIDs (shell ids, session-state ids, ...) that appear in
   * captured request/response content with stable ordinal placeholders
   * (`${uuid_0}`, `${uuid_1}`, ...). They change on every re-record, so
   * normalizing them keeps committed fixtures diff-clean. Distinct UUIDs get
   * distinct placeholders; repeats of the same UUID reuse its placeholder.
   */
  _normalizeUuids(exchanges) {
    const idMap = /* @__PURE__ */ new Map();
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    const mapUuid = (uuid) => {
      let mapped = idMap.get(uuid);
      if (mapped === void 0) {
        mapped = `\${uuid_${idMap.size}}`;
        idMap.set(uuid, mapped);
      }
      return mapped;
    };
    const walk = (value) => {
      if (typeof value === "string") {
        return value.replace(uuidRe, mapUuid);
      }
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          value[i] = walk(value[i]);
        }
        return value;
      }
      if (value && typeof value === "object") {
        const obj = value;
        for (const key of Object.keys(obj)) {
          obj[key] = walk(obj[key]);
        }
        return value;
      }
      return value;
    };
    for (const exchange of exchanges) {
      walk(exchange);
    }
  }
  /**
   * Convert a raw recorded exchange into its fixture form: model-endpoint calls
   * become readable turns (parsed request + regeneratable reply) tagged with
   * their dialect (hoisted to the fixture level by {@link _writeFixture});
   * everything else stays raw.
   */
  _toFixtureExchange(exchange) {
    if (exchange.method === "POST" && exchange.path === ANTHROPIC_MESSAGES_PATH) {
      const request = summarizeAnthropicRequest(exchange.requestBody);
      const message = aggregateAnthropicSse(exchange.response.body);
      if (request && message) {
        const content = this._normalizeMessageContent(message.content);
        return { exchange: { request, response: { content: serializeAnthropicContent(content), stopReason: message.stopReason } }, dialect: "anthropic" };
      }
    }
    if (exchange.method === "POST" && exchange.path === RESPONSES_PATH) {
      const request = summarizeResponsesRequest(exchange.requestBody);
      const message = aggregateResponsesSse(exchange.response.body);
      if (request && message) {
        const content = this._normalizeMessageContent(message.content);
        return { exchange: { request, response: { content: serializeAnthropicContent(content), stopReason: message.stopReason } }, dialect: "responses" };
      }
    }
    return { exchange: { method: exchange.method, path: exchange.path, response: exchange.response } };
  }
  /**
   * Normalize local paths out of an aggregated assistant reply. Tool-input JSON
   * streams split across many SSE deltas, so a string replace on the raw body
   * can miss a path straddling a chunk boundary; normalizing the reassembled
   * content (text + tool inputs) is reliable.
   */
  _normalizeMessageContent(content) {
    return content.map((block) => {
      if (block.type === "text") {
        return { type: "text", text: this._normalize(block.text) };
      }
      let input = block.input;
      try {
        input = JSON.parse(this._normalize(JSON.stringify(block.input ?? {})));
      } catch {
      }
      return { type: "tool_use", id: block.id, name: normalizeShellToolNameForCapture(block.name), input };
    });
  }
  _normalize(text) {
    let result = text;
    if (this._workingDirectory) {
      const workDirs = /* @__PURE__ */ new Set([this._workingDirectory]);
      try {
        workDirs.add(realpathSync.native(this._workingDirectory));
      } catch {
      }
      for (const workDir of [...workDirs].sort((a, b) => b.length - a.length)) {
        result = replaceAll(result, escapeJsonString(workDir), WORKDIR_PLACEHOLDER);
        result = replaceAll(result, workDir, WORKDIR_PLACEHOLDER);
      }
    }
    if (this._options.homeDir) {
      result = replaceAll(result, escapeJsonString(this._options.homeDir), HOMEDIR_PLACEHOLDER);
      result = replaceAll(result, this._options.homeDir, HOMEDIR_PLACEHOLDER);
    }
    if (this._options.userName) {
      result = scrubUserName(result, this._options.userName);
    }
    result = result.replace(COPIED_PLUGIN_DIR_RE, `${HOMEDIR_PLACEHOLDER}/user-data/agentPlugins/${COPIED_PLUGIN_DIR_PLACEHOLDER}`);
    result = result.replace(TEMP_DIR_SUFFIX_RE, `$1${TEMP_DIR_SUFFIX_PLACEHOLDER}`);
    result = replaceAll(result, `/private${WORKDIR_PLACEHOLDER}`, WORKDIR_PLACEHOLDER);
    result = result.replace(FILE_LISTING_DATE_RE, "${timestamp}");
    return result;
  }
  _expandReplayMessage(message) {
    return {
      ...message,
      content: message.content.map((block) => {
        if (block.type === "text") {
          return { ...block, text: this._expandReplayPlaceholders(block.text) };
        }
        if (block.type === "tool_use") {
          return { ...block, name: expandShellToolName(block.name), input: this._expandReplayValue(block.input) };
        }
        return block;
      })
    };
  }
  _expandReplayValue(value) {
    if (typeof value === "string") {
      return this._expandReplayPlaceholders(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this._expandReplayValue(item));
    }
    if (value && typeof value === "object") {
      const result = {};
      for (const [key, item] of Object.entries(value)) {
        result[key] = this._expandReplayValue(item);
      }
      return result;
    }
    return value;
  }
  _expandReplayPlaceholders(text) {
    let result = replaceAll(text, CAPI_PLACEHOLDER, this.url);
    if (this._workingDirectory) {
      const workspaceName = basename(this._workingDirectory);
      const suffix = /-(?<suffix>[A-Za-z0-9]{6})$/.exec(workspaceName)?.groups?.suffix;
      let canonicalWorkingDirectory = this._workingDirectory;
      try {
        canonicalWorkingDirectory = realpathSync.native(this._workingDirectory);
      } catch {
      }
      if (suffix) {
        const workspaceStem = workspaceName.slice(0, -suffix.length);
        const normalizedWorkspaceName = `${workspaceStem}${TEMP_DIR_SUFFIX_PLACEHOLDER}`;
        const legacyWorkspacePlaceholder = `${WORKDIR_PLACEHOLDER}/${normalizedWorkspaceName}`;
        result = replaceAll(result, `/private${legacyWorkspacePlaceholder}`, canonicalWorkingDirectory);
        result = replaceAll(result, legacyWorkspacePlaceholder, this._workingDirectory);
        result = result.replace(
          new RegExp(`(?:\\/private)?${escapeRegExpCharacters(WORKDIR_PLACEHOLDER)}\\/${escapeRegExpCharacters(workspaceStem)}[A-Za-z0-9]{6}`, "g"),
          (match) => match.startsWith("/private") ? canonicalWorkingDirectory : this._workingDirectory
        );
      }
      result = replaceAll(result, `/private${WORKDIR_PLACEHOLDER}`, canonicalWorkingDirectory);
      result = replaceAll(result, WORKDIR_PLACEHOLDER, this._workingDirectory);
      if (suffix) {
        result = replaceAll(result, TEMP_DIR_SUFFIX_PLACEHOLDER, suffix);
      }
    }
    if (this._options.homeDir) {
      result = replaceAll(result, HOMEDIR_PLACEHOLDER, this._options.homeDir);
    }
    if (this._options.userName) {
      result = replaceAll(result, USER_PLACEHOLDER, this._options.userName);
    }
    for (const [placeholder, value] of this._replayPlaceholderValues) {
      result = replaceAll(result, placeholder, value);
    }
    return result;
  }
}
function captureReplayPlaceholderValues(recorded, observed, values) {
  if (typeof recorded === "string" && typeof observed === "string") {
    captureReplayPlaceholderValuesFromString(recorded, observed, values);
    return;
  }
  if (Array.isArray(recorded) && Array.isArray(observed)) {
    for (let index = 0; index < Math.min(recorded.length, observed.length); index++) {
      captureReplayPlaceholderValues(recorded[index], observed[index], values);
    }
    return;
  }
  if (!isRecord(recorded) || !isRecord(observed)) {
    return;
  }
  for (const [key, value] of Object.entries(recorded)) {
    captureReplayPlaceholderValues(value, observed[key], values);
  }
}
function captureReplayPlaceholderValuesFromString(recorded, observed, values) {
  const placeholders = [];
  let pattern = "^";
  let offset = 0;
  for (const match2 of recorded.matchAll(UUID_PLACEHOLDER_RE)) {
    pattern += escapeRegExpCharacters(recorded.slice(offset, match2.index));
    pattern += `(${UUID_PATTERN})`;
    placeholders.push(match2[0]);
    offset = match2.index + match2[0].length;
  }
  if (placeholders.length === 0) {
    return;
  }
  pattern += `${escapeRegExpCharacters(recorded.slice(offset))}$`;
  const match = new RegExp(pattern, "i").exec(observed);
  if (!match) {
    return;
  }
  const captured = /* @__PURE__ */ new Map();
  for (let index = 0; index < placeholders.length; index++) {
    const placeholder = placeholders[index];
    const value = match[index + 1];
    if (captured.has(placeholder) && captured.get(placeholder) !== value || values.has(placeholder) && values.get(placeholder) !== value) {
      return;
    }
    captured.set(placeholder, value);
  }
  for (const [placeholder, value] of captured) {
    values.set(placeholder, value);
  }
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function replaceAll(text, search, replacement) {
  if (!search) {
    return text;
  }
  return text.split(search).join(replacement);
}
function escapeJsonString(value) {
  return JSON.stringify(value).slice(1, -1);
}
function escapeRegExpCharacters(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function decodeBody(buffer, encoding) {
  try {
    switch (encoding?.trim().toLowerCase()) {
      case "gzip":
        return zlibModule.gunzipSync(buffer).toString("utf8");
      case "br":
        return zlibModule.brotliDecompressSync(buffer).toString("utf8");
      case "deflate":
        return zlibModule.inflateSync(buffer).toString("utf8");
      default:
        return buffer.toString("utf8");
    }
  } catch {
    return buffer.toString("utf8");
  }
}
function flattenHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === void 0) {
      continue;
    }
    result[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return result;
}
function filterRecordedResponseHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).filter(([key]) => STORED_RESPONSE_HEADERS.has(key.toLowerCase())));
}
export {
  CapiReplayProxy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXGhhcm5lc3NcXGNhcGlSZXBsYXlQcm94eS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogQSByZWNvcmQvcmVwbGF5IEhUVFAgcHJveHkgZm9yIHRoZSBDQVBJIChDb3BpbG90IEFQSSkgdHJhZmZpYyB0aGF0IHRoZSBhZ2VudFxuICogaG9zdCdzIGJ1bmRsZWQgQ29waWxvdCBTREsvQ0xJIHByb2R1Y2VzLlxuICpcbiAqIEl0IHNpdHMgaW4gZnJvbnQgb2YgYW4gdXBzdHJlYW0gQ0FQSS1zcGVha2luZyBzZXJ2ZXIgKGVpdGhlciB0aGUgaW4tcmVwbyBtb2NrXG4gKiBMTE0gc2VydmVyIG9yLCB3aGVuIHJlY29yZGluZyB3aXRoIGEgcmVhbCB0b2tlbiwgcmVhbCBDQVBJKSBhbmQ6XG4gKlxuICogIC0gKipyZXBsYXkqKiBtb2RlIChkZWZhdWx0KTogc2VydmVzIHJlY29yZGVkIHJlc3BvbnNlcyBmcm9tIHRoZSBjb21taXR0ZWRcbiAqICAgIGZpeHR1cmUgd2l0aCBubyB1cHN0cmVhbSBjb250YWN0IGF0IGFsbCBcdTIwMTQgZGV0ZXJtaW5pc3RpYyBhbmQgdG9rZW4tZnJlZS5cbiAqICAgIFRoZSBmaXh0dXJlIG11c3QgZXhpc3QgKGEgbWlzc2luZyBvbmUgdGhyb3dzKSBhbmQgYSByZXF1ZXN0IHdpdGggbm9cbiAqICAgIHJlY29yZGVkIHJlc3BvbnNlIGlzIGEgc3RyaWN0IGNhY2hlIG1pc3MgdGhhdCBmYWlscyB0aGUgcnVuLCBzbyBDSSBjYW5cbiAqICAgIG5ldmVyIHNpbGVudGx5IHJlYWNoIHJlYWwgQ0FQSS5cbiAqICAtICoqcmVjb3JkKiogbW9kZTogZm9yd2FyZHMgZXZlcnkgcmVxdWVzdCB0byB0aGUgdXBzdHJlYW0sIHN0cmVhbXMgdGhlXG4gKiAgICByZXNwb25zZSBiYWNrIHRvIHRoZSBjYWxsZXIsIGFuZCBjYXB0dXJlcyBpdCB0byB0aGUgZml4dHVyZSBvbiBkaXNrLlxuICogICAgT3B0LWluIChgQUdFTlRfSE9TVF9SRVBMQVlfUkVDT1JEPTFgLCBpbmNsdWRpbmcgdGhlIGZpcnN0IHBhc3Mgb2ZcbiAqICAgIGBBR0VOVF9IT1NUX1VQREFURV9TTkFQU0hPVFM9MWApIHNpbmNlIGl0IG5lZWRzIGEgcmVhbCB0b2tlbi5cbiAqXG4gKiBUaGUgcHJveHkgaXMgaW50ZW50aW9uYWxseSAqKndpcmUtYWdub3N0aWMqKjogaXQgY2FwdHVyZXMgYW5kIHJlcGxheXMgdGhlIHJhd1xuICogcmVzcG9uc2UgYm9keSwgc28gaXQgd29ya3MgaWRlbnRpY2FsbHkgZm9yIHRoZSBDaGF0IENvbXBsZXRpb25zXG4gKiAoYC9jaGF0L2NvbXBsZXRpb25zYCksIFJlc3BvbnNlcyAoYC9yZXNwb25zZXNgKSBhbmQgQW50aHJvcGljIE1lc3NhZ2VzXG4gKiAoYC92MS9tZXNzYWdlc2ApIFNTRSBkaWFsZWN0cyB3aXRob3V0IG5lZWRpbmcgcGVyLWRpYWxlY3QgYWRhcHRlcnMuXG4gKlxuICogTWF0Y2hpbmcgaXMgKipzZXF1ZW5jZS1iYXNlZCBwZXIgYChtZXRob2QsIHBhdGgpYCoqOiB0aGUgTnRoIHJlcXVlc3QgdG8gYVxuICogZ2l2ZW4gZW5kcG9pbnQgcmVwbGF5cyB0aGUgTnRoIHJlY29yZGVkIHJlc3BvbnNlLiBJbiByZXBsYXkgdGhlIGFnZW50J3NcbiAqIGJlaGF2aW9yIGlzIGRyaXZlbiBlbnRpcmVseSBieSB0aGUgcmVjb3JkZWQgcmVzcG9uc2VzLCBzbyB0aGUgc2VxdWVuY2Ugb2ZcbiAqIGNhbGxzIGl0IG1ha2VzIGlzIHJlcHJvZHVjZWQgZXhhY3RseSBcdTIwMTQgbWFraW5nIGV4YWN0LWJvZHkgbWF0Y2hpbmcgKHdoaWNoIGlzXG4gKiBicml0dGxlIGFnYWluc3Qgdm9sYXRpbGUgZmllbGRzIGxpa2UgZGF0ZXMgb3IgcmVxdWVzdCBpZHMpIHVubmVjZXNzYXJ5LiBUaGVcbiAqIG5vcm1hbGl6ZWQgcmVxdWVzdCBib2R5IGlzIHN0aWxsIHN0b3JlZCBpbiB0aGUgZml4dHVyZSBmb3IgcmV2aWV3YWJpbGl0eS5cbiAqL1xuXG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHBzIGZyb20gJ2h0dHBzJztcbmltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tICdtb2R1bGUnO1xuaW1wb3J0IHsgZXhpc3RzU3luYywgbWtkaXJTeW5jLCByZWFkRmlsZVN5bmMsIHJlYWxwYXRoU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBhZ2dyZWdhdGVBbnRocm9waWNTc2UsIGFudGhyb3BpY01lc3NhZ2VUb1NzZSwgQU5USFJPUElDX01FU1NBR0VTX1BBVEgsIGFnZ3JlZ2F0ZVJlc3BvbnNlc1NzZSwgcmVzcG9uc2VzTWVzc2FnZVRvU3NlLCBSRVNQT05TRVNfUEFUSCwgc3VtbWFyaXplUmVzcG9uc2VzUmVxdWVzdCwgZGVzZXJpYWxpemVBbnRocm9waWNDb250ZW50LCBzZXJpYWxpemVBbnRocm9waWNDb250ZW50LCBzdW1tYXJpemVBbnRocm9waWNSZXF1ZXN0LCB0eXBlIEFudGhyb3BpY0NvbnRlbnRCbG9jaywgdHlwZSBJQW50aHJvcGljTWVzc2FnZSwgdHlwZSBJUmVhZGFibGVBbnRocm9waWNSZXF1ZXN0IH0gZnJvbSAnLi9jYXBpV2lyZUNvZGVjLmpzJztcbmltcG9ydCB7IGdldEFuY2lsbGFyeVN0dWIgfSBmcm9tICcuL2NhcGlTdHVicy5qcyc7XG5pbXBvcnQgeyBmaW5kUG9zaXhPbmx5Q29tbWFuZHMsIGZvcm1hdFBvc2l4Q29tbWFuZEVycm9yLCBnZXRSZWNvcmRlZFNoZWxsQ29tbWFuZCwgdHlwZSBJUmVjb3JkZWRDb21tYW5kIH0gZnJvbSAnLi9wb3NpeENvbW1hbmRMaW50LmpzJztcbmltcG9ydCB7IGZvcm1hdE1vZGVsUmVxdWVzdE1pc21hdGNoLCBtb2RlbFJlcXVlc3RzTWF0Y2gsIHByb2plY3RNb2RlbFJlcXVlc3QgfSBmcm9tICcuL21vZGVsUmVxdWVzdFByb2plY3Rpb24uanMnO1xuaW1wb3J0IHsgZXhwYW5kU2hlbGxUb29sTmFtZSwgbm9ybWFsaXplU2hlbGxUb29sTmFtZUZvckNhcHR1cmUgfSBmcm9tICcuL3NoZWxsVG9vbE5hbWVzLmpzJztcbmltcG9ydCB7IHNjcnViVXNlck5hbWUsIFVTRVJfTkFNRV9QTEFDRUhPTERFUiB9IGZyb20gJy4vdXNlck5hbWVTY3J1Yi5qcyc7XG5cbi8vIGBodHRwYC9gaHR0cHNgL2Bqcy15YW1sYCBhcmUgbGF6aWx5IHJlcXVpcmVkIChzbG93IHRvIGxvYWQgYW5kL29yIG5vdCBpbiB0aGlzXG4vLyBsYXllcidzIGltcG9ydCBhbGxvd2xpc3QpOyBgaW1wb3J0IHR5cGVgIGFib3ZlIHN0aWxsIGdpdmVzIHVzIGh0dHAvaHR0cHMgdHlwZXMuXG5jb25zdCBub2RlUmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcbmNvbnN0IGh0dHBNb2R1bGUgPSBub2RlUmVxdWlyZSgnaHR0cCcpIGFzIHR5cGVvZiBodHRwO1xuY29uc3QgaHR0cHNNb2R1bGUgPSBub2RlUmVxdWlyZSgnaHR0cHMnKSBhcyB0eXBlb2YgaHR0cHM7XG5jb25zdCB6bGliTW9kdWxlID0gbm9kZVJlcXVpcmUoJ3psaWInKSBhcyB0eXBlb2YgaW1wb3J0KCd6bGliJyk7XG5jb25zdCB5YW1sTW9kdWxlID0gbm9kZVJlcXVpcmUoJ2pzLXlhbWwnKSBhcyB7IGxvYWQoaW5wdXQ6IHN0cmluZyk6IHVua25vd247IGR1bXAob2JqOiB1bmtub3duLCBvcHRzPzogeyBsaW5lV2lkdGg/OiBudW1iZXI7IG5vUmVmcz86IGJvb2xlYW47IHF1b3RpbmdUeXBlPzogJ1wiJyB8ICdcXCcnOyBmb3JjZVF1b3Rlcz86IGJvb2xlYW4gfSk6IHN0cmluZyB9O1xuXG4vKiogTW9kZWwtcHJvZHVjaW5nIGVuZHBvaW50cy4gUmVwbGF5aW5nIHBhc3QgdGhlIHJlY29yZGVkIGNvdW50IGhlcmUgaXMgYSBoYXJkXG4gKiBjYWNoZSBtaXNzIChyZXVzaW5nIGEgc3RhbGUgdHVybiBjb3VsZCBzcGluIHRoZSBhZ2VudCBsb29wIGZvcmV2ZXIpLCB3aGVyZWFzXG4gKiBpZGVtcG90ZW50IGVuZHBvaW50cyAoYC9tb2RlbHNgLCB0b2tlbikgbWF5IGJlIHNhZmVseSByZS1zZXJ2ZWQuICovXG5jb25zdCBNT0RFTF9FTkRQT0lOVFMgPSBuZXcgU2V0KFsnL2NoYXQvY29tcGxldGlvbnMnLCAnL3Jlc3BvbnNlcycsICcvdjEvbWVzc2FnZXMnXSk7XG5jb25zdCBTVE9SRURfUkVTUE9OU0VfSEVBREVSUyA9IG5ldyBTZXQoWydjb250ZW50LXR5cGUnXSk7XG5cbmNvbnN0IFdPUktESVJfUExBQ0VIT0xERVIgPSAnJHt3b3JrZGlyfSc7XG5jb25zdCBIT01FRElSX1BMQUNFSE9MREVSID0gJyR7aG9tZWRpcn0nO1xuY29uc3QgQ09QSUVEX1BMVUdJTl9ESVJfUExBQ0VIT0xERVIgPSAnJHtwbHVnaW5fY29weX0nO1xuY29uc3QgQ09QSUVEX1BMVUdJTl9ESVJfUkUgPSAvXFwkXFx7aG9tZWRpclxcfSg/OlxcL3xcXFxcXFxcXCl1c2VyLWRhdGEoPzpcXC98XFxcXFxcXFwpYWdlbnRQbHVnaW5zKD86XFwvfFxcXFxcXFxcKVteXFwvXFxcXFwiXSsvZztcbmNvbnN0IFRFTVBfRElSX1NVRkZJWF9QTEFDRUhPTERFUiA9ICcke3RlbXB9JztcbmNvbnN0IFRFTVBfRElSX1NVRkZJWF9SRSA9IC8oXFwkXFx7d29ya2RpclxcfSg/OlxcL3xcXFxcXFxcXCkoPzphaHAtKD86c25hcHNob3R8cGVybS10ZXN0fHBsYW4tdGVzdHxhYm9ydHx0ZXN0fHd0LXRlc3R8c3ViYWdlbnQtdGVzdHxzdWJhZ2VudC1yZXBsYXl8YXR0YWNobWVudC10ZXN0fGNkLXN0cmlwLXRlc3R8Y292ZXJhZ2UtW2Etei1dKyktfGNvcGlsb3QtKD86Y29zdC1yZXBvcnR8dGV4dC1ibG9iKS18cmVhZC1zZGstc2ltcGxlKSlbQS1aYS16MC05XXs2fS9nO1xuY29uc3QgVVVJRF9QTEFDRUhPTERFUl9SRSA9IC9cXCRcXHt1dWlkX1xcZCtcXH0vZztcbmNvbnN0IFVVSURfUEFUVEVSTiA9ICdbMC05YS1mXXs4fS1bMC05YS1mXXs0fS1bMC05YS1mXXs0fS1bMC05YS1mXXs0fS1bMC05YS1mXXsxMn0nO1xuY29uc3QgRklMRV9MSVNUSU5HX0RBVEVfUkUgPSAvXFxiKD86SmFufEZlYnxNYXJ8QXByfE1heXxKdW58SnVsfEF1Z3xTZXB8T2N0fE5vdnxEZWMpXFxzK1xcZHsxLDJ9XFxzKyg/OlxcZHsyfTpcXGR7Mn18XFxkezR9KVxcYi9nO1xuXG4vKipcbiAqIFBsYWNlaG9sZGVyIGZvciB0aGUgcmVjb3JkZXIncyBPUyB1c2VybmFtZS4gSXQgYXBwZWFycyBpbiBjYXB0dXJlZCB0b29sIG91dHB1dFxuICogKGUuZy4gdGhlIG93bmVyIGNvbHVtbiBvZiBgbHMgLWxhYCkgd2hlcmUgaXQgaXMgbm90IHBhcnQgb2YgYSBwYXRoLCBzb1xuICogYGhvbWVEaXJgIG5vcm1hbGl6YXRpb24gbWlzc2VzIGl0IFx1MjAxNCBzY3J1YiBpdCBleHBsaWNpdGx5IHRvIGtlZXAgbG9jYWwgaWRlbnRpdHlcbiAqIG91dCBvZiBmaXh0dXJlcy5cbiAqL1xuY29uc3QgVVNFUl9QTEFDRUhPTERFUiA9IFVTRVJfTkFNRV9QTEFDRUhPTERFUjtcbi8qKlxuICogUGxhY2Vob2xkZXIgZm9yIHRoZSB1cHN0cmVhbSBDQVBJIG9yaWdpbiBpbiByZWNvcmRlZCByZXNwb25zZSBib2RpZXMuIFRva2VuIC9cbiAqIHVzZXItZGlzY292ZXJ5IHJlc3BvbnNlcyBlY2hvIHRoZSBDQVBJIGhvc3QgKGBlbmRwb2ludHMuYXBpYCk7IHJld3JpdGluZyB0aGF0XG4gKiBvcmlnaW4gdG8gdGhpcyBwbGFjZWhvbGRlciBcdTIwMTQgYW5kIGJhY2sgdG8gdGhlIHByb3h5J3Mgb3duIFVSTCBvbiByZXBsYXkgXHUyMDE0XG4gKiBrZWVwcyB0aGUgU0RLL2FnZW50IGhvc3QgcG9pbnRlZCBhdCB0aGUgcHJveHkgcmF0aGVyIHRoYW4gYXQgYSByZWFsIChvciBtb2NrKVxuICogaG9zdCBvbiByZXBsYXkuXG4gKi9cbmNvbnN0IENBUElfUExBQ0VIT0xERVIgPSAnJHtjYXBpfSc7XG4vKipcbiAqIFJlZGFjdHMgc2hvcnQtbGl2ZWQgY3JlZGVudGlhbHMgZnJvbSByZWNvcmRlZCByZXNwb25zZSBib2RpZXMgc28gZml4dHVyZXNcbiAqIGNhcnJ5IG5vIHNlY3JldHMuIFRoZSBHaXRIdWIgYmVhcmVyIHRva2VuIGxpdmVzIG9ubHkgaW4gcmVxdWVzdCBoZWFkZXJzXG4gKiAobmV2ZXIgc3RvcmVkKTsgdGhlIG9uZSByZXNwb25zZS1zaWRlIHNlY3JldCBpcyB0aGUgbWludGVkIENvcGlsb3Qgc2Vzc2lvblxuICogdG9rZW4gcmV0dXJuZWQgYnkgYC9jb3BpbG90X2ludGVybmFsL3YyL3Rva2VuYCAoYW5kIGBzZXNzaW9uX3Rva2VuYCBmcm9tIHRoZVxuICogYXV0by1tb2RlbCBlbmRwb2ludCkuXG4gKi9cbmNvbnN0IFNFQ1JFVF9QTEFDRUhPTERFUiA9ICcke3JlZGFjdGVkfSc7XG5jb25zdCBTRUNSRVRfRklFTERfUkUgPSAvKFwiKD86dG9rZW58c2Vzc2lvbl90b2tlbilcIlxccyo6XFxzKilcIlteXCJdKlwiL2c7XG5cbi8qKlxuICogU2NydWIgdGhlIGVjaG9lZCBzeXN0ZW0gcHJvbXB0IG91dCBvZiByZWNvcmRlZCByZXNwb25zZSBib2RpZXMuIFRoZSBPcGVuQUlcbiAqIFJlc3BvbnNlcyBBUEkgKGAvcmVzcG9uc2VzYCwgdXNlZCBieSBDb2RleCkgZWNob2VzIHRoZSBmdWxsIHJlcXVlc3RcbiAqIGBpbnN0cnVjdGlvbnNgICh0aGUgc3lzdGVtIHByb21wdCkgYmFjayBpbnNpZGUgYHJlc3BvbnNlLmNyZWF0ZWRgIC9cbiAqIGBpbl9wcm9ncmVzc2AgLyBgY29tcGxldGVkYCBldmVudHM7IHJlcGxhY2UgaXQgd2l0aCBhIHBsYWNlaG9sZGVyIHNvIHRoZVxuICogbGFyZ2UgcHJvbXB0IChhbmQgYW55IHRlbmFudC1zcGVjaWZpYyBjb250ZW50IGluIGl0KSBuZXZlciBsYW5kcyBpbiBmaXh0dXJlcy5cbiAqL1xuY29uc3QgU1lTVEVNX0ZJRUxEX1JFID0gLyhcImluc3RydWN0aW9uc1wiXFxzKjpcXHMqKVwiKD86W15cIlxcXFxdfFxcXFwuKSpcIi9nO1xuY29uc3QgU1lTVEVNX1BST01QVF9QTEFDRUhPTERFUiA9ICcke3N5c3RlbX0nO1xuXG4vKiogR2l0SHViLUFQSSBwYXRoIHByZWZpeGVzIChyb3V0ZWQgdG8gdGhlIEdpdEh1YiB1cHN0cmVhbSwgbm90IENBUEkpLiAqL1xuY29uc3QgR0lUSFVCX0FQSV9QUkVGSVhFUyA9IFsnL2NvcGlsb3RfaW50ZXJuYWwnLCAnL3RlbGVtZXRyeScsICcvY29waWxvdC9tY3BfcmVnaXN0cnknXTtcblxuZXhwb3J0IHR5cGUgQ2FwaVJlcGxheU1vZGUgPSAncmVjb3JkJyB8ICdyZXBsYXknO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDYXBpUmVwbGF5UmVzcG9uc2Uge1xuXHRyZWFkb25seSBzdGF0dXM6IG51bWJlcjtcblx0cmVhZG9ubHkgaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj47XG5cdHJlYWRvbmx5IGJvZHk6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElSZWNvcmRlZEV4Y2hhbmdlIHtcblx0cmVhZG9ubHkgbWV0aG9kOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhdGg6IHN0cmluZztcblx0LyoqIE5vcm1hbGl6ZWQgcmVxdWVzdCBib2R5LCBzdG9yZWQgZm9yIGh1bWFuIHJldmlldyBvZiBmaXh0dXJlIGRpZmZzLiAqL1xuXHRyZWFkb25seSByZXF1ZXN0Qm9keTogc3RyaW5nO1xuXHRyZWFkb25seSByZXNwb25zZTogSUNhcGlSZXBsYXlSZXNwb25zZTtcbn1cblxuLyoqIFdpcmUgZGlhbGVjdCB0aGUgZml4dHVyZSdzIG1vZGVsIHR1cm5zIHdlcmUgY2FwdHVyZWQgaW4uIERyaXZlcyBTU0VcbiAqIHJlZ2VuZXJhdGlvbiBvbiByZXBsYXkgYW5kIHRoZSBgKG1ldGhvZCwgcGF0aClgIHRoZSB0dXJucyByZXBsYXkgdW5kZXIuICovXG50eXBlIFR1cm5EaWFsZWN0ID0gJ2FudGhyb3BpYycgfCAncmVzcG9uc2VzJztcblxuLyoqIFRoZSBgKG1ldGhvZCwgcGF0aClgIGVhY2ggZGlhbGVjdCdzIHR1cm5zIGFyZSByZWNvcmRlZC9yZXBsYXllZCB1bmRlci5cbiAqIGBtZXRob2RgIGlzIGFsd2F5cyBQT1NUIGFuZCBgcGF0aGAgaXMgZml4ZWQgcGVyIGRpYWxlY3QsIHNvIG5laXRoZXIgaXMgc3RvcmVkXG4gKiBwZXIgZXhjaGFuZ2UgXHUyMDE0IHRoZSBmaXh0dXJlIGNhcnJpZXMgYSBzaW5nbGUgdG9wLWxldmVsIGBkaWFsZWN0YCBpbnN0ZWFkLiAqL1xuY29uc3QgRElBTEVDVF9FTkRQT0lOVDogUmVhZG9ubHk8UmVjb3JkPFR1cm5EaWFsZWN0LCB7IHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nOyByZWFkb25seSBwYXRoOiBzdHJpbmcgfT4+ID0ge1xuXHRhbnRocm9waWM6IHsgbWV0aG9kOiAnUE9TVCcsIHBhdGg6IEFOVEhST1BJQ19NRVNTQUdFU19QQVRIIH0sXG5cdHJlc3BvbnNlczogeyBtZXRob2Q6ICdQT1NUJywgcGF0aDogUkVTUE9OU0VTX1BBVEggfSxcbn07XG5cbi8qKlxuICogVGhlIHN0b3JlZCBmb3JtIG9mIGFuIGFzc2lzdGFudCByZXBseS4gQ29udGVudCBpcyBhIGJhcmUgc3RyaW5nIGZvciBhIGxvbmVcbiAqIHRleHQgcmVwbHksIG9yIGFuIGV4cGxpY2l0IGJsb2NrIGxpc3QgZm9yIHJpY2hlciAodG9vbC1jYWxsaW5nKSByZXBsaWVzLlxuICovXG5pbnRlcmZhY2UgSVN0b3JlZEFudGhyb3BpY01lc3NhZ2Uge1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmcgfCBBbnRocm9waWNDb250ZW50QmxvY2tbXTtcblx0cmVhZG9ubHkgc3RvcFJlYXNvbjogc3RyaW5nIHwgbnVsbDtcbn1cblxuLyoqXG4gKiBBIG1vZGVsIHR1cm4gaW4gdGhlIFlBTUwgZml4dHVyZTogYSByZWFkYWJsZSByZXF1ZXN0IHN1bW1hcnkgKyB0aGUgY2FwdHVyZWRcbiAqIGFzc2lzdGFudCByZXBseS4gT24gcmVwbGF5IHRoZSByZXBseSBpcyByZWdlbmVyYXRlZCBpbnRvIHRoZSBmaXh0dXJlXG4gKiBkaWFsZWN0J3MgU1NFIHN0cmVhbSwgc28gY2FwdHVyZXMgc3RheSBodW1hbi1yZWFkYWJsZSBpbnN0ZWFkIG9mIHJhdyBTU0VcbiAqIGJsb2JzLiBUaGUgZW5kcG9pbnQgaXMgZGVyaXZlZCBmcm9tIHRoZSBmaXh0dXJlLWxldmVsIGBkaWFsZWN0YCwgc28gaXQgaXMgbm90XG4gKiByZXBlYXRlZCBoZXJlLlxuICovXG5pbnRlcmZhY2UgSVR1cm5FeGNoYW5nZSB7XG5cdHJlYWRvbmx5IHJlcXVlc3Q6IElSZWFkYWJsZUFudGhyb3BpY1JlcXVlc3Q7XG5cdHJlYWRvbmx5IHJlc3BvbnNlOiBJU3RvcmVkQW50aHJvcGljTWVzc2FnZTtcbn1cblxuLyoqXG4gKiBBIHJhdyBhbmNpbGxhcnkgZXhjaGFuZ2Ugc2VydmVkIHZlcmJhdGltIG9uIHJlcGxheS4gQ2FycmllcyBpdHMgb3duXG4gKiBgKG1ldGhvZCwgcGF0aClgIHNpbmNlIGl0IGlzIG5vdCB0aWVkIHRvIHRoZSBmaXh0dXJlIGRpYWxlY3QuIE5vdCBwcm9kdWNlZCBieVxuICogdGhlIGN1cnJlbnQgcmVjb3JkZXIgXHUyMDE0IG1vZGVsIHR1cm5zIGNvdmVyIGV2ZXJ5IGNhcHR1cmVkIGV4Y2hhbmdlIFx1MjAxNCBidXQgdGhlXG4gKiBsb2FkZXIgc3RpbGwgaG9ub3VycyBpdCBpZiBhIGZpeHR1cmUgY29udGFpbnMgb25lLlxuICovXG5pbnRlcmZhY2UgSVJhd0ZpeHR1cmVFeGNoYW5nZSB7XG5cdHJlYWRvbmx5IG1ldGhvZDogc3RyaW5nO1xuXHRyZWFkb25seSBwYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc3BvbnNlOiBJQ2FwaVJlcGxheVJlc3BvbnNlO1xufVxuXG50eXBlIElGaXh0dXJlRXhjaGFuZ2UgPSBJVHVybkV4Y2hhbmdlIHwgSVJhd0ZpeHR1cmVFeGNoYW5nZTtcblxuaW50ZXJmYWNlIElGaXh0dXJlIHtcblx0cmVhZG9ubHkgdmVyc2lvbjogMTtcblx0LyoqIERpYWxlY3Qgc2hhcmVkIGJ5IGV2ZXJ5IHR1cm4gZXhjaGFuZ2U7IG9taXR0ZWQgd2hlbiB0aGVyZSBhcmUgbm8gdHVybnMuICovXG5cdHJlYWRvbmx5IGRpYWxlY3Q/OiBUdXJuRGlhbGVjdDtcblx0cmVhZG9ubHkgZXhjaGFuZ2VzOiBJRml4dHVyZUV4Y2hhbmdlW107XG59XG5cbmZ1bmN0aW9uIGlzVHVybkV4Y2hhbmdlKGV4Y2hhbmdlOiBJRml4dHVyZUV4Y2hhbmdlKTogZXhjaGFuZ2UgaXMgSVR1cm5FeGNoYW5nZSB7XG5cdHJldHVybiAoZXhjaGFuZ2UgYXMgSVR1cm5FeGNoYW5nZSkucmVxdWVzdCAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDYXBpUmVwbGF5UHJveHlPcHRpb25zIHtcblx0LyoqIEFic29sdXRlIHBhdGggdG8gdGhlIEpTT04gZml4dHVyZSBmb3IgdGhpcyB0ZXN0LiAqL1xuXHRyZWFkb25seSBmaXh0dXJlUGF0aDogc3RyaW5nO1xuXHQvKipcblx0ICogU2luZ2xlIHVwc3RyZWFtIGJhc2UgVVJMIHRvIGZvcndhcmQgYWxsIHRyYWZmaWMgdG8gd2hpbGUgcmVjb3JkaW5nIChlLmcuXG5cdCAqIGEgbW9jayBzZXJ2ZXIpLiBVc2Uge0BsaW5rIGdpdGh1YlVwc3RyZWFtVXJsfS97QGxpbmsgY2FwaVVwc3RyZWFtVXJsfVxuXHQgKiBpbnN0ZWFkIHRvIHNwbGl0IEdpdEh1Yi1BUEkgdnMgQ0FQSSB0cmFmZmljIGFjcm9zcyB0d28gcmVhbCBob3N0cy5cblx0ICovXG5cdHJlYWRvbmx5IHVwc3RyZWFtVXJsPzogc3RyaW5nO1xuXHQvKiogUmVhbCBHaXRIdWItQVBJIGJhc2UgZm9yIGAvY29waWxvdF9pbnRlcm5hbC8qYCB3aGlsZSByZWNvcmRpbmcgKGUuZy4gYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb21gKS4gKi9cblx0cmVhZG9ubHkgZ2l0aHViVXBzdHJlYW1Vcmw/OiBzdHJpbmc7XG5cdC8qKiBSZWFsIENBUEkgYmFzZSBmb3IgbW9kZWwvYC9tb2RlbHNgIHRyYWZmaWMgd2hpbGUgcmVjb3JkaW5nIChlLmcuIGBodHRwczovL2FwaS5naXRodWJjb3BpbG90LmNvbWApLiAqL1xuXHRyZWFkb25seSBjYXBpVXBzdHJlYW1Vcmw/OiBzdHJpbmc7XG5cdC8qKiBSZWNvcmRpbmcvcmVwbGF5IGJlaGF2aW9yLiBEZWZhdWx0cyB0byBgcmVwbGF5YC4gKi9cblx0cmVhZG9ubHkgbW9kZT86IENhcGlSZXBsYXlNb2RlO1xuXHQvKiogQWJzb2x1dGUgd29ya2luZyBkaXJlY3RvcnkgdG8gbm9ybWFsaXplIG91dCBvZiByZXF1ZXN0IGJvZGllcy4gKi9cblx0cmVhZG9ubHkgd29ya0Rpcj86IHN0cmluZztcblx0LyoqIEFic29sdXRlIGhvbWUgZGlyZWN0b3J5IHRvIG5vcm1hbGl6ZSBvdXQgb2YgcmVxdWVzdCBib2RpZXMuICovXG5cdHJlYWRvbmx5IGhvbWVEaXI/OiBzdHJpbmc7XG5cdC8qKiBPUyB1c2VybmFtZSB0byBub3JtYWxpemUgb3V0IG9mIHJlY29yZGVkIGJvZGllcyAoZS5nLiBgbHMgLWxhYCBvd25lciBjb2x1bW5zKS4gKi9cblx0cmVhZG9ubHkgdXNlck5hbWU/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBGYWlsICh0aHJvdyBmcm9tIHtAbGluayBzdG9wfSkgaWYgYW55IHJlcXVlc3QgbWlzc2VkIHRoZSBjYWNoZSB3aGlsZVxuXHQgKiByZXBsYXlpbmcuIERlZmF1bHRzIHRvIHRydWUuIElnbm9yZWQgd2hpbGUgcmVjb3JkaW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgc3RyaWN0PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNraXAgdGhlIFBPU0lYLW9ubHkgc2hlbGwgY29tbWFuZCBjaGVjayB3aGVuIHdyaXRpbmcgYSBmaXh0dXJlLlxuXHQgKlxuXHQgKiBPbmx5IGZvciBhIHNjZW5hcmlvIHRoYXQgZ2VudWluZWx5IGNhbm5vdCBiZSBwb3J0YWJsZSBcdTIwMTQgdGhlIHRlc3QgbXVzdCBhbHNvXG5cdCAqIGJlIHNjb3BlZCB0byBhIHBsYXRmb3JtIGV4cGxpY2l0bHkgYXQgaXRzIGNhbGwgc2l0ZSwgd2l0aCB0aGUgcmVhc29uXG5cdCAqIHN0YXRlZCB0aGVyZS4gU2VlIGBwb3NpeENvbW1hbmRMaW50LnRzYC5cblx0ICovXG5cdHJlYWRvbmx5IGFsbG93UG9zaXhDb21tYW5kcz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNraXAgY29tcGFyaW5nIHRoZSBsaXZlIG1vZGVsIHJlcXVlc3QgYWdhaW5zdCB0aGUgcmVjb3JkZWQgb25lLlxuXHQgKlxuXHQgKiBPbmx5IGZvciBhIGNhcHR1cmUgdGhhdCBjYW5ub3QgYmUgcmVmcmVzaGVkOyBzZWVcblx0ICogYFNUQUxFX1JFQ09SREVEX1JFUVVFU1RfRVhDRVBUSU9OU2AgaW4gYGFnZW50SG9zdEUyRVRlc3RIYXJuZXNzLnRzYC5cblx0ICovXG5cdHJlYWRvbmx5IGFsbG93U3RhbGVSZWNvcmRlZFJlcXVlc3Q/OiBib29sZWFuO1xufVxuXG4vKiogQSByZXBsYXlhYmxlIGl0ZW06IHJhdyBieXRlcyAoYW5jaWxsYXJ5KSBvciBhIG1vZGVsIHJlcGx5IHRvIHJlZ2VuZXJhdGUuICovXG50eXBlIElSZXBsYXlJdGVtID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdyYXcnOyByZWFkb25seSByZXNwb25zZTogSUNhcGlSZXBsYXlSZXNwb25zZSB9XG5cdHwgeyByZWFkb25seSBraW5kOiAndHVybic7IHJlYWRvbmx5IGRpYWxlY3Q6IFR1cm5EaWFsZWN0OyByZWFkb25seSBtZXNzYWdlOiBJQW50aHJvcGljTWVzc2FnZTsgcmVhZG9ubHkgcmVxdWVzdDogSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCB9O1xuXG4vKiogU2VxdWVuY2UgY3Vyc29yIGZvciBvbmUgYChtZXRob2QsIHBhdGgpYCBidWNrZXQgZHVyaW5nIHJlcGxheS4gKi9cbmludGVyZmFjZSBJUmVwbGF5QnVja2V0IHtcblx0cmVhZG9ubHkgaXRlbXM6IElSZXBsYXlJdGVtW107XG5cdGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBDYXBpUmVwbGF5UHJveHkge1xuXHRwcml2YXRlIF9zZXJ2ZXI6IGh0dHAuU2VydmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF91cmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3RvcHBlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGU6IENhcGlSZXBsYXlNb2RlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHJpY3Q6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzUmVwbGF5aW5nOiBib29sZWFuO1xuXG5cdC8qKiBCdWNrZXRzIHVzZWQgZm9yIHJlcGxheSwga2V5ZWQgYnkgYCR7bWV0aG9kfSAke3BhdGh9YC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVwbGF5QnVja2V0cyA9IG5ldyBNYXA8c3RyaW5nLCBJUmVwbGF5QnVja2V0PigpO1xuXHQvKiogRXhjaGFuZ2VzIGNhcHR1cmVkIGR1cmluZyByZWNvcmRpbmcsIGluIGFycml2YWwgb3JkZXIuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY29yZGVkOiBJUmVjb3JkZWRFeGNoYW5nZVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX29ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZU1pc3Nlczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdE1pc21hdGNoZXM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcGxheVBsYWNlaG9sZGVyVmFsdWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfbW9kZWxUdXJuQ291bnQgPSAwO1xuXHRwcml2YXRlIF93b3JraW5nRGlyZWN0b3J5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlY29yZGluZ01vZGVsUmVzcG9uc2U6IElDYXBpUmVwbGF5UmVzcG9uc2UgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEZpeHR1cmUgY3VycmVudGx5IGJlaW5nIHJlcGxheWVkLiBNdXRhYmxlIHNvIGEgc2luZ2xlIGxvbmctbGl2ZWQgcHJveHkgY2FuXG5cdCAqIGJlIHJlLXBvaW50ZWQgYXQgYSBuZXcgcGVyLXRlc3QgZml4dHVyZSB2aWEge0BsaW5rIHJlc2V0Rm9yUmVwbGF5fSB3aXRob3V0XG5cdCAqIHJlc3RhcnRpbmcgKHRoZSBVUkwgdGhlIGFnZW50IGhvc3Qgd2FzIHBvaW50ZWQgYXQgc3RheXMgZml4ZWQpLiBSZWNvcmRpbmdcblx0ICogYWx3YXlzIHVzZXMgdGhlIGZpeHR1cmUgdGhlIHByb3h5IHdhcyBjb25zdHJ1Y3RlZCB3aXRoLlxuXHQgKi9cblx0cHJpdmF0ZSBfZml4dHVyZVBhdGg6IHN0cmluZztcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgY3VycmVudCBmaXh0dXJlJ3MgcmVjb3JkZWQgcmVxdWVzdCBtYXkgZGlzYWdyZWUgd2l0aCB0aGUgbGl2ZVxuXHQgKiBvbmUuIFBlci10ZXN0IGxpa2Uge0BsaW5rIF9maXh0dXJlUGF0aH0sIHNpbmNlIGEgc2hhcmVkIHJlcGxheSBwcm94eVxuXHQgKiBzZXJ2ZXMgZXZlcnkgdGVzdCBpbiB0aGUgc3VpdGUuXG5cdCAqL1xuXHRwcml2YXRlIF9hbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElDYXBpUmVwbGF5UHJveHlPcHRpb25zKSB7XG5cdFx0dGhpcy5fYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCA9IF9vcHRpb25zLmFsbG93U3RhbGVSZWNvcmRlZFJlcXVlc3QgPz8gZmFsc2U7XG5cdFx0dGhpcy5fZml4dHVyZVBhdGggPSBfb3B0aW9ucy5maXh0dXJlUGF0aDtcblx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3J5ID0gX29wdGlvbnMud29ya0Rpcjtcblx0XHRjb25zdCBmaXh0dXJlRXhpc3RzID0gZXhpc3RzU3luYyh0aGlzLl9maXh0dXJlUGF0aCk7XG5cdFx0dGhpcy5fbW9kZSA9IF9vcHRpb25zLm1vZGUgPz8gJ3JlcGxheSc7XG5cdFx0dGhpcy5fc3RyaWN0ID0gX29wdGlvbnMuc3RyaWN0ID8/IHRydWU7XG5cblx0XHRpZiAodGhpcy5fbW9kZSA9PT0gJ3JlcGxheScgJiYgIWZpeHR1cmVFeGlzdHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW2NhcGktcmVwbGF5XSByZXBsYXkgbW9kZSByZXF1aXJlcyBhIGZpeHR1cmUgYnV0IG5vbmUgZXhpc3RzIGF0ICR7dGhpcy5fZml4dHVyZVBhdGh9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVwbGF5IGlzIHJlYWQtb25seSAobmV2ZXIgY29udGFjdHMgdGhlIHVwc3RyZWFtKTsgcmVjb3JkaW5nIGlzIHRoZVxuXHRcdC8vIG9ubHkgbW9kZSB0aGF0IHByb3hpZXMgcmVhbCB0cmFmZmljLiBUaGlzIGtlZXBzIENJIGZyb20gZXZlciByZWFjaGluZ1xuXHRcdC8vIHJlYWwgQ0FQSTogYSBtaXNzaW5nIGZpeHR1cmUgdGhyb3dzIGFib3ZlIHJhdGhlciB0aGFuIHNpbGVudGx5IHJlY29yZGluZy5cblx0XHR0aGlzLl9pc1JlcGxheWluZyA9IHRoaXMuX21vZGUgPT09ICdyZXBsYXknO1xuXHRcdGlmICh0aGlzLl9pc1JlcGxheWluZykge1xuXHRcdFx0dGhpcy5fbG9hZEZpeHR1cmUoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogQmFzZSBVUkwgdGhlIGFnZW50IGhvc3Qgc2hvdWxkIGJlIHBvaW50ZWQgYXQuIEF2YWlsYWJsZSBhZnRlciB7QGxpbmsgc3RhcnR9LiAqL1xuXHRnZXQgdXJsKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl91cmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignW2NhcGktcmVwbGF5XSBwcm94eSBub3Qgc3RhcnRlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdXJsO1xuXHR9XG5cblx0Z2V0IGlzUmVwbGF5aW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1JlcGxheWluZztcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhpcy5fc2VydmVyID0gaHR0cE1vZHVsZS5jcmVhdGVTZXJ2ZXIoKHJlcSwgcmVzKSA9PiB0aGlzLl9oYW5kbGUocmVxLCByZXMpKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5fc2VydmVyIS5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdFx0dGhpcy5fc2VydmVyIS5saXN0ZW4oMCwgJzEyNy4wLjAuMScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgYWRkciA9IHRoaXMuX3NlcnZlciEuYWRkcmVzcygpO1xuXHRcdFx0XHRpZiAoYWRkciAmJiB0eXBlb2YgYWRkciA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHR0aGlzLl91cmwgPSBgaHR0cDovLzEyNy4wLjAuMToke2FkZHIucG9ydH1gO1xuXHRcdFx0XHRcdHJlc29sdmUodGhpcy5fdXJsKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCdbY2FwaS1yZXBsYXldIGZhaWxlZCB0byBkZXRlcm1pbmUgcHJveHkgYWRkcmVzcycpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU3RvcCB0aGUgcHJveHkuIFdoZW4gcmVjb3JkaW5nLCBmbHVzaGVzIGNhcHR1cmVkIGV4Y2hhbmdlcyB0byB0aGUgZml4dHVyZS5cblx0ICogV2hlbiByZXBsYXlpbmcgaW4gc3RyaWN0IG1vZGUsIHRocm93cyBpZiBhbnkgcmVxdWVzdCBtaXNzZWQgdGhlIGNhY2hlLlxuXHQgKi9cblx0YXN5bmMgc3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3RvcHBlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdG9wcGVkID0gdHJ1ZTtcblx0XHRhd2FpdCB0aGlzLl9jbG9zZVNvY2tldCgpO1xuXG5cdFx0aWYgKHRoaXMuX2lzUmVwbGF5aW5nKSB7XG5cdFx0XHR0aGlzLmFzc2VydE5vUmVwbGF5TWlzbWF0Y2hlcygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFsd2F5cyB3cml0ZSBhIGZpeHR1cmUgd2hlbiByZWNvcmRpbmcsIGV2ZW4gd2l0aCB6ZXJvIG1vZGVsIHR1cm5zOlxuXHRcdC8vIHRlc3RzIHRoYXQgb25seSB0b3VjaCBzdHViYmVkIGFuY2lsbGFyeSBlbmRwb2ludHMgKGUuZy4gbGlzdE1vZGVscylcblx0XHQvLyBuZWVkIGEgY29tbWl0dGVkIGZpeHR1cmUgc28gcmVwbGF5IHNlcnZlcyBzdHVicyBpbnN0ZWFkIG9mIHRyeWluZyB0b1xuXHRcdC8vIHNlbGYtaGVhbCBhZ2FpbnN0IHJlYWwgQ0FQSS5cblx0XHR0aGlzLl93cml0ZUZpeHR1cmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1wb2ludCBhIGxvbmctbGl2ZWQgcmVwbGF5IHByb3h5IGF0IGEgZGlmZmVyZW50IHBlci10ZXN0IGZpeHR1cmUgd2l0aG91dFxuXHQgKiByZXN0YXJ0aW5nIHRoZSBIVFRQIHNlcnZlciAoc28gdGhlIFVSTCB0aGUgYWdlbnQgaG9zdCB3YXMgcG9pbnRlZCBhdCBzdGF5c1xuXHQgKiB2YWxpZCkuIENsZWFycyB0aGUgcHJldmlvdXMgZml4dHVyZSdzIHJlcGxheSBidWNrZXRzIGFuZCBjYWNoZS1taXNzIGxvZy5cblx0ICogUmVwbGF5LW9ubHk6IHJlY29yZGluZyBrZWVwcyBvbmUgZml4dHVyZSBwZXIgcHJveHkuXG5cdCAqL1xuXHRyZXNldEZvclJlcGxheShmaXh0dXJlUGF0aDogc3RyaW5nLCBhbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0ID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzUmVwbGF5aW5nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1tjYXBpLXJlcGxheV0gcmVzZXRGb3JSZXBsYXkgaXMgb25seSB2YWxpZCBpbiByZXBsYXkgbW9kZScpO1xuXHRcdH1cblx0XHRpZiAoIWV4aXN0c1N5bmMoZml4dHVyZVBhdGgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtjYXBpLXJlcGxheV0gcmVwbGF5IG1vZGUgcmVxdWlyZXMgYSBmaXh0dXJlIGJ1dCBub25lIGV4aXN0cyBhdCAke2ZpeHR1cmVQYXRofWApO1xuXHRcdH1cblx0XHR0aGlzLl9maXh0dXJlUGF0aCA9IGZpeHR1cmVQYXRoO1xuXHRcdHRoaXMuX2FsbG93U3RhbGVSZWNvcmRlZFJlcXVlc3QgPSBhbGxvd1N0YWxlUmVjb3JkZWRSZXF1ZXN0O1xuXHRcdHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVwbGF5QnVja2V0cy5jbGVhcigpO1xuXHRcdHRoaXMuX29ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fY2FjaGVNaXNzZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9yZXF1ZXN0TWlzbWF0Y2hlcy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX3JlcGxheVBsYWNlaG9sZGVyVmFsdWVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fbW9kZWxUdXJuQ291bnQgPSAwO1xuXHRcdHRoaXMuX2xvYWRGaXh0dXJlKCk7XG5cdH1cblxuXHRzZXRXb3JraW5nRGlyZWN0b3J5KHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3J5O1xuXHR9XG5cblx0c2V0UmVjb3JkaW5nTW9kZWxSZXNwb25zZShyZXNwb25zZTogSUNhcGlSZXBsYXlSZXNwb25zZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1JlcGxheWluZykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbY2FwaS1yZXBsYXldIHNldFJlY29yZGluZ01vZGVsUmVzcG9uc2UgaXMgb25seSB2YWxpZCBpbiByZWNvcmQgbW9kZScpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWNvcmRpbmdNb2RlbFJlc3BvbnNlID0gcmVzcG9uc2U7XG5cdH1cblxuXHRnZXQgb2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMoKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcztcblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlIHN0cmljdCByZXBsYXkgZmFpbHVyZXMgXHUyMDE0IHVucmVjb3JkZWQgcmVxdWVzdHMgYW5kIHJlcXVlc3RzIHRoYXQgZG9cblx0ICogbm90IG1hdGNoIHRoZSByZWNvcmRlZCBvbmUgXHUyMDE0IHdpdGhvdXQgc3RvcHBpbmcgdGhlIHByb3h5LiBMZXRzIGEgc2hhcmVkXG5cdCAqIHJlcGxheSBzZXJ2ZXIgdmVyaWZ5IGVhY2ggdGVzdCdzIHRyYWZmaWMgaW4gYHRlYXJkb3duYCB3aGlsZSBrZWVwaW5nIHRoZVxuXHQgKiBzZXJ2ZXIgKGFuZCB0aGUgYWdlbnQgaG9zdCdzIGNhY2hlZCBTREsgY2xpZW50KSBhbGl2ZSBmb3IgdGhlIG5leHQgdGVzdC5cblx0ICovXG5cdGFzc2VydE5vUmVwbGF5TWlzbWF0Y2hlcygpOiB2b2lkIHtcblx0XHRjb25zdCBlcnJvciA9IHRoaXMuX2NyZWF0ZVJlcGxheUVycm9yKCk7XG5cdFx0aWYgKGVycm9yKSB7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHQvKiogUmV0dXJucyBhbmQgY29uc3VtZXMgdGhlIGN1cnJlbnQgcmVwbGF5IGZhaWx1cmUgc28gaXQgY2FuIGJlIHN1cmZhY2VkIGF0IHRoZSBvcmlnaW5hbCB0ZXN0IGZhaWx1cmUuICovXG5cdHRha2VSZXBsYXlFcnJvcigpOiBFcnJvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXJyb3IgPSB0aGlzLl9jcmVhdGVSZXBsYXlFcnJvcigpO1xuXHRcdHRoaXMuX2NhY2hlTWlzc2VzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fcmVxdWVzdE1pc21hdGNoZXMubGVuZ3RoID0gMDtcblx0XHRyZXR1cm4gZXJyb3I7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSZXBsYXlFcnJvcigpOiBFcnJvciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1JlcGxheWluZyB8fCAhdGhpcy5fc3RyaWN0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZWN0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodGhpcy5fY2FjaGVNaXNzZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0c2VjdGlvbnMucHVzaChgW2NhcGktcmVwbGF5XSAke3RoaXMuX2NhY2hlTWlzc2VzLmxlbmd0aH0gY2FjaGUgbWlzcyhlcyk6XFxuJHt0aGlzLl9jYWNoZU1pc3Nlcy5qb2luKCdcXG4nKX1gKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3JlcXVlc3RNaXNtYXRjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHNlY3Rpb25zLnB1c2goYFtjYXBpLXJlcGxheV0gJHt0aGlzLl9yZXF1ZXN0TWlzbWF0Y2hlcy5sZW5ndGh9IG1vZGVsIHJlcXVlc3QgbWlzbWF0Y2goZXMpOlxcbiR7dGhpcy5fcmVxdWVzdE1pc21hdGNoZXMuam9pbignXFxuJyl9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHVuY29uc3VtZWQgPSBBcnJheS5mcm9tKHRoaXMuX3JlcGxheUJ1Y2tldHMuZW50cmllcygpKVxuXHRcdFx0LmZsYXRNYXAoKFtrZXksIGJ1Y2tldF0pID0+IGJ1Y2tldC5pbmRleCA8IGJ1Y2tldC5pdGVtcy5sZW5ndGggPyBbYCR7a2V5fTogJHtidWNrZXQuaXRlbXMubGVuZ3RoIC0gYnVja2V0LmluZGV4fSByZXNwb25zZShzKWBdIDogW10pO1xuXHRcdGlmICh1bmNvbnN1bWVkLmxlbmd0aCA+IDApIHtcblx0XHRcdHNlY3Rpb25zLnB1c2goYFtjYXBpLXJlcGxheV0gdW5jb25zdW1lZCByZWNvcmRlZCByZXNwb25zZXM6XFxuJHt1bmNvbnN1bWVkLmpvaW4oJ1xcbicpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gc2VjdGlvbnMubGVuZ3RoID4gMCA/IG5ldyBFcnJvcihzZWN0aW9ucy5qb2luKCdcXG5cXG4nKSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQ2xvc2UgdGhlIEhUVFAgc2VydmVyIHNvY2tldCB3aXRob3V0IHJ1bm5pbmcgdGhlIHN0cmljdCByZXBsYXkgY2hlY2tzIG9yXG5cdCAqIHdyaXRpbmcgYSBmaXh0dXJlLiBVc2VkIHRvIHRlYXIgZG93biBhIHNoYXJlZCByZXBsYXkgcHJveHkgYWZ0ZXIgcGVyLXRlc3Rcblx0ICogdmVyaWZpY2F0aW9uIGhhcyBhbHJlYWR5IGhhcHBlbmVkIHZpYSB7QGxpbmsgYXNzZXJ0Tm9SZXBsYXlNaXNtYXRjaGVzfS5cblx0ICovXG5cdGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9wcGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3BwZWQgPSB0cnVlO1xuXHRcdGF3YWl0IHRoaXMuX2Nsb3NlU29ja2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jbG9zZVNvY2tldCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLl9zZXJ2ZXI7XG5cdFx0dGhpcy5fc2VydmVyID0gdW5kZWZpbmVkO1xuXHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdC8vIEZvcmNlLWRyb3AgYW55IGxpbmdlcmluZyBzb2NrZXRzIChlLmcuIGFuIGluLWZsaWdodCB1cHN0cmVhbVxuXHRcdFx0Ly8gcmVxdWVzdCBsZWZ0IG9wZW4gYnkgYW4gYWJvcnRlZCB0dXJuKSBzbyBgY2xvc2VgIHJlc29sdmVzIGluc3RlYWRcblx0XHRcdC8vIG9mIGhhbmdpbmcgdW50aWwgdGhlIGNvbm5lY3Rpb24gZHJhaW5zLlxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHNlcnZlci5jbG9zZSgoKSA9PiByZXNvbHZlKCkpO1xuXHRcdFx0XHRzZXJ2ZXIuY2xvc2VBbGxDb25uZWN0aW9ucz8uKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSByZXF1ZXN0IGhhbmRsaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfaGFuZGxlKHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRyZXEub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChjaHVuaykpO1xuXHRcdHJlcS5vbignZW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYm9keSA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0aWYgKHRoaXMuX2lzUmVwbGF5aW5nKSB7XG5cdFx0XHRcdHRoaXMuX3JlcGxheShyZXEsIGJvZHksIHJlcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9yZWNvcmQocmVxLCBib2R5LCByZXMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJlcS5vbignZXJyb3InLCAoKSA9PiB0aGlzLl9mYWlsKHJlcywgJ3JlcXVlc3Qgc3RyZWFtIGVycm9yJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwbGF5KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIGJvZHk6IHN0cmluZywgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0Y29uc3QgbWV0aG9kID0gcmVxLm1ldGhvZCA/PyAnR0VUJztcblx0XHRjb25zdCBwYXRoID0gbmV3IFVSTChyZXEudXJsID8/ICcvJywgJ2h0dHA6Ly9sb2NhbGhvc3QnKS5wYXRobmFtZTtcblxuXHRcdC8vIEFuY2lsbGFyeSBib290c3RyYXAgZW5kcG9pbnRzIGFyZSBuZXZlciByZWNvcmRlZCBcdTIwMTQgc2VydmUgdGhlbSBmcm9tXG5cdFx0Ly8gaGFyZGNvZGVkIHN0dWJzIChrZWVwcyBpZGVudGl0eS9tb2RlbC1jYXRhbG9nIG91dCBvZiBmaXh0dXJlcykuXG5cdFx0Y29uc3Qgc3R1YiA9IGdldEFuY2lsbGFyeVN0dWIobWV0aG9kLCBwYXRoLCBib2R5KTtcblx0XHRpZiAoc3R1Yikge1xuXHRcdFx0cmVzLndyaXRlSGVhZChzdHViLnN0YXR1cywgeyAuLi5zdHViLmhlYWRlcnMgfSk7XG5cdFx0XHRyZXMuZW5kKHJlcGxhY2VBbGwoc3R1Yi5ib2R5LCBDQVBJX1BMQUNFSE9MREVSLCB0aGlzLnVybCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleSA9IGAke21ldGhvZH0gJHtwYXRofWA7XG5cdFx0aWYgKE1PREVMX0VORFBPSU5UUy5oYXMocGF0aCkpIHtcblx0XHRcdHRoaXMuX29ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLnB1c2godGhpcy5fbm9ybWFsaXplKGJvZHkpKTtcblx0XHR9XG5cdFx0Y29uc3QgYnVja2V0ID0gdGhpcy5fcmVwbGF5QnVja2V0cy5nZXQoa2V5KTtcblxuXHRcdGxldCBpdGVtOiBJUmVwbGF5SXRlbSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYnVja2V0KSB7XG5cdFx0XHRpZiAoYnVja2V0LmluZGV4IDwgYnVja2V0Lml0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRpdGVtID0gYnVja2V0Lml0ZW1zW2J1Y2tldC5pbmRleCsrXTtcblx0XHRcdH0gZWxzZSBpZiAoIU1PREVMX0VORFBPSU5UUy5oYXMocGF0aCkpIHtcblx0XHRcdFx0Ly8gSWRlbXBvdGVudCBlbmRwb2ludCBjYWxsZWQgbW9yZSBvZnRlbiB0aGFuIHJlY29yZGVkIFx1MjAxNCByZS1zZXJ2ZVxuXHRcdFx0XHQvLyB0aGUgbGFzdCByZWNvcmRlZCBpdGVtIHJhdGhlciB0aGFuIGZhaWxpbmcuXG5cdFx0XHRcdGl0ZW0gPSBidWNrZXQuaXRlbXNbYnVja2V0Lml0ZW1zLmxlbmd0aCAtIDFdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0dGhpcy5fY2FjaGVNaXNzZXMucHVzaChgJHtrZXl9IChjYWxsICMkeyhidWNrZXQ/LmluZGV4ID8/IDApICsgMX0pIFx1MjAxNCBubyByZWNvcmRlZCByZXNwb25zZWApO1xuXHRcdFx0dGhpcy5fZmFpbChyZXMsIGBubyByZWNvcmRlZCByZXNwb25zZSBmb3IgJHtrZXl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGl0ZW0ua2luZCA9PT0gJ3R1cm4nKSB7XG5cdFx0XHR0aGlzLl9hc3NlcnRSZWNvcmRlZFJlcXVlc3QoaXRlbS5kaWFsZWN0LCBpdGVtLnJlcXVlc3QsIGJvZHkpO1xuXHRcdFx0Ly8gUmVnZW5lcmF0ZSB0aGUgZGlhbGVjdCdzIFNTRSBzdHJlYW0gZnJvbSB0aGUgY2FwdHVyZWQgcmVwbHkuXG5cdFx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5fZXhwYW5kUmVwbGF5TWVzc2FnZShpdGVtLm1lc3NhZ2UpO1xuXHRcdFx0Y29uc3Qgc3NlQm9keSA9IGl0ZW0uZGlhbGVjdCA9PT0gJ3Jlc3BvbnNlcycgPyByZXNwb25zZXNNZXNzYWdlVG9Tc2UobWVzc2FnZSkgOiBhbnRocm9waWNNZXNzYWdlVG9Tc2UobWVzc2FnZSk7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnY29udGVudC10eXBlJzogJ3RleHQvZXZlbnQtc3RyZWFtJywgJ2NhY2hlLWNvbnRyb2wnOiAnbm8tY2FjaGUnIH0pO1xuXHRcdFx0cmVzLmVuZChzc2VCb2R5KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJzID0geyAuLi5pdGVtLnJlc3BvbnNlLmhlYWRlcnMgfTtcblx0XHQvLyBMZXQgTm9kZSByZWNvbXB1dGUgZnJhbWluZyBmb3IgdGhlIGV4YWN0IHJlY29yZGVkIGJvZHkuXG5cdFx0ZGVsZXRlIGhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ107XG5cdFx0ZGVsZXRlIGhlYWRlcnNbJ3RyYW5zZmVyLWVuY29kaW5nJ107XG5cdFx0cmVzLndyaXRlSGVhZChpdGVtLnJlc3BvbnNlLnN0YXR1cywgaGVhZGVycyk7XG5cdFx0cmVzLmVuZCh0aGlzLl9leHBhbmRSZXBsYXlQbGFjZWhvbGRlcnMoaXRlbS5yZXNwb25zZS5ib2R5KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcGFyZSB0aGUgbGl2ZSByZXF1ZXN0IGFnYWluc3QgdGhlIG9uZSByZWNvcmRlZCBmb3IgdGhpcyB0dXJuLlxuXHQgKlxuXHQgKiBCb3RoIHNpZGVzIGdvIHRocm91Z2ggdGhlIHNhbWUgc3VtbWFyaXplciBhbmQgdGhlIHNhbWUgcHJvamVjdGlvbiwgc28gdGhlXG5cdCAqIGNvbW1pdHRlZCBgcmVxdWVzdDpgIGJsb2NrIGJlY29tZXMgdGhlIGV4cGVjdGF0aW9uIHdpdGhvdXQgaXRzIHN0b3JlZFxuXHQgKiBzaGFwZSBoYXZpbmcgdG8gY2hhbmdlLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXNzZXJ0UmVjb3JkZWRSZXF1ZXN0KGRpYWxlY3Q6IFR1cm5EaWFsZWN0LCByZWNvcmRlZDogSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCwgYm9keTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybkluZGV4ID0gdGhpcy5fbW9kZWxUdXJuQ291bnQrKztcblx0XHRjb25zdCBzdW1tYXJpemUgPSBkaWFsZWN0ID09PSAncmVzcG9uc2VzJyA/IHN1bW1hcml6ZVJlc3BvbnNlc1JlcXVlc3QgOiBzdW1tYXJpemVBbnRocm9waWNSZXF1ZXN0O1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRCb2R5ID0gdGhpcy5fbm9ybWFsaXplKGJvZHkpO1xuXHRcdGNvbnN0IG9ic2VydmVkID0gc3VtbWFyaXplKG5vcm1hbGl6ZWRCb2R5KTtcblx0XHRpZiAoIW9ic2VydmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNhcHR1cmVSZXBsYXlQbGFjZWhvbGRlclZhbHVlcyhyZWNvcmRlZCwgb2JzZXJ2ZWQsIHRoaXMuX3JlcGxheVBsYWNlaG9sZGVyVmFsdWVzKTtcblx0XHRpZiAodGhpcy5fYWxsb3dTdGFsZVJlY29yZGVkUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBub3JtYWxpemVkT2JzZXJ2ZWQgPSBzdW1tYXJpemUodGhpcy5fbm9ybWFsaXplUmVwbGF5UGxhY2Vob2xkZXJWYWx1ZXMobm9ybWFsaXplZEJvZHkpKTtcblx0XHRpZiAoIW5vcm1hbGl6ZWRPYnNlcnZlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBleHBlY3RlZCA9IHByb2plY3RNb2RlbFJlcXVlc3QocmVjb3JkZWQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHByb2plY3RNb2RlbFJlcXVlc3Qobm9ybWFsaXplZE9ic2VydmVkKTtcblx0XHRpZiAoIW1vZGVsUmVxdWVzdHNNYXRjaChleHBlY3RlZCwgYWN0dWFsKSkge1xuXHRcdFx0dGhpcy5fcmVxdWVzdE1pc21hdGNoZXMucHVzaChmb3JtYXRNb2RlbFJlcXVlc3RNaXNtYXRjaCh0dXJuSW5kZXgsIGV4cGVjdGVkLCBhY3R1YWwpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9ub3JtYWxpemVSZXBsYXlQbGFjZWhvbGRlclZhbHVlcyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGxldCByZXN1bHQgPSB0ZXh0O1xuXHRcdGZvciAoY29uc3QgW3BsYWNlaG9sZGVyLCB2YWx1ZV0gb2YgdGhpcy5fcmVwbGF5UGxhY2Vob2xkZXJWYWx1ZXMpIHtcblx0XHRcdHJlc3VsdCA9IHJlcGxhY2VBbGwocmVzdWx0LCB2YWx1ZSwgcGxhY2Vob2xkZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb3JkKHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIGJvZHk6IHN0cmluZywgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0Y29uc3QgbWV0aG9kID0gcmVxLm1ldGhvZCA/PyAnR0VUJztcblx0XHRjb25zdCBwYXRoID0gbmV3IFVSTChyZXEudXJsID8/ICcvJywgJ2h0dHA6Ly9sb2NhbGhvc3QnKS5wYXRobmFtZTtcblx0XHRjb25zdCBzdHViID0gZ2V0QW5jaWxsYXJ5U3R1YihtZXRob2QsIHBhdGgsIGJvZHkpO1xuXHRcdGlmIChzdHViKSB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKHN0dWIuc3RhdHVzLCB7IC4uLnN0dWIuaGVhZGVycyB9KTtcblx0XHRcdHJlcy5lbmQocmVwbGFjZUFsbChzdHViLmJvZHksIENBUElfUExBQ0VIT0xERVIsIHRoaXMudXJsKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChNT0RFTF9FTkRQT0lOVFMuaGFzKHBhdGgpKSB7XG5cdFx0XHR0aGlzLl9vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5wdXNoKHRoaXMuX25vcm1hbGl6ZShib2R5KSk7XG5cdFx0fVxuXHRcdGlmIChNT0RFTF9FTkRQT0lOVFMuaGFzKHBhdGgpICYmIHRoaXMuX3JlY29yZGluZ01vZGVsUmVzcG9uc2UpIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gdGhpcy5fcmVjb3JkaW5nTW9kZWxSZXNwb25zZTtcblx0XHRcdHJlcy53cml0ZUhlYWQocmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5oZWFkZXJzKTtcblx0XHRcdHJlcy5lbmQocmVzcG9uc2UuYm9keSk7XG5cdFx0XHR0aGlzLl9yZWNvcmRlZC5wdXNoKHtcblx0XHRcdFx0bWV0aG9kLFxuXHRcdFx0XHRwYXRoLFxuXHRcdFx0XHRyZXF1ZXN0Qm9keTogdGhpcy5fbm9ybWFsaXplKGJvZHkpLFxuXHRcdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRcdC4uLnJlc3BvbnNlLFxuXHRcdFx0XHRcdGhlYWRlcnM6IGZpbHRlclJlY29yZGVkUmVzcG9uc2VIZWFkZXJzKHJlc3BvbnNlLmhlYWRlcnMpLFxuXHRcdFx0XHRcdGJvZHk6IHRoaXMuX25vcm1hbGl6ZShyZXNwb25zZS5ib2R5KSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1cHN0cmVhbUJhc2UgPSB0aGlzLl91cHN0cmVhbUZvcihwYXRoKTtcblx0XHRjb25zdCB1cHN0cmVhbSA9IG5ldyBVUkwocmVxLnVybCA/PyAnLycsIHVwc3RyZWFtQmFzZSk7XG5cdFx0Y29uc3QgaXNIdHRwcyA9IHVwc3RyZWFtLnByb3RvY29sID09PSAnaHR0cHM6Jztcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBpc0h0dHBzID8gaHR0cHNNb2R1bGUgOiBodHRwTW9kdWxlO1xuXG5cdFx0Y29uc3QgZm9yd2FyZEhlYWRlcnMgPSB7IC4uLnJlcS5oZWFkZXJzIH07XG5cdFx0Zm9yd2FyZEhlYWRlcnMuaG9zdCA9IHVwc3RyZWFtLmhvc3Q7XG5cdFx0ZGVsZXRlIGZvcndhcmRIZWFkZXJzWydjb25uZWN0aW9uJ107XG5cdFx0ZGVsZXRlIGZvcndhcmRIZWFkZXJzWydjb250ZW50LWxlbmd0aCddO1xuXG5cdFx0Y29uc3QgdXBzdHJlYW1SZXEgPSB0cmFuc3BvcnQucmVxdWVzdChcblx0XHRcdHtcblx0XHRcdFx0aG9zdG5hbWU6IHVwc3RyZWFtLmhvc3RuYW1lLFxuXHRcdFx0XHRwb3J0OiB1cHN0cmVhbS5wb3J0IHx8IChpc0h0dHBzID8gNDQzIDogODApLFxuXHRcdFx0XHRwYXRoOiB1cHN0cmVhbS5wYXRobmFtZSArIHVwc3RyZWFtLnNlYXJjaCxcblx0XHRcdFx0bWV0aG9kLFxuXHRcdFx0XHRoZWFkZXJzOiBmb3J3YXJkSGVhZGVycyxcblx0XHRcdH0sXG5cdFx0XHR1cHN0cmVhbVJlcyA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3BDaHVua3M6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IHVwc3RyZWFtUmVzLnN0YXR1c0NvZGUgPz8gNTAyO1xuXHRcdFx0XHRjb25zdCBoZWFkZXJzID0gZmxhdHRlbkhlYWRlcnModXBzdHJlYW1SZXMuaGVhZGVycyk7XG5cdFx0XHRcdHJlcy53cml0ZUhlYWQoc3RhdHVzLCBoZWFkZXJzKTtcblx0XHRcdFx0dXBzdHJlYW1SZXMub24oJ2RhdGEnLCBjaHVuayA9PiB7XG5cdFx0XHRcdFx0cmVzcENodW5rcy5wdXNoKGNodW5rKTtcblx0XHRcdFx0XHRyZXMud3JpdGUoY2h1bmspO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dXBzdHJlYW1SZXMub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0XHRyZXMuZW5kKCk7XG5cdFx0XHRcdFx0Ly8gQW5jaWxsYXJ5IGJvb3RzdHJhcCBlbmRwb2ludHMgYXJlIGZvcndhcmRlZCAoc28gdGhlIGxpdmUgcnVuXG5cdFx0XHRcdFx0Ly8gd29ya3MpIGJ1dCBuZXZlciBzdG9yZWQgXHUyMDE0IHRoZXkgYXJlIHNlcnZlZCBmcm9tIHN0dWJzIG9uIHJlcGxheS5cblx0XHRcdFx0XHRpZiAoZ2V0QW5jaWxsYXJ5U3R1YihtZXRob2QsIHBhdGgsIGJvZHkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIERlY29tcHJlc3Mgc28gc3RvcmVkIGJvZGllcyBhcmUgcmVhZGFibGUgdGV4dCBhbmQgdGhlIG1vZGVsXG5cdFx0XHRcdFx0Ly8gZmlsdGVycyAvIGNvZGVjcyBjYW4gcGFyc2UgdGhlbS4gVGhlIGxpdmUgY2xpZW50IGFscmVhZHlcblx0XHRcdFx0XHQvLyByZWNlaXZlZCB0aGUgb3JpZ2luYWwgKGNvbXByZXNzZWQpIGNodW5rcyBhYm92ZS5cblx0XHRcdFx0XHRjb25zdCBkZWNvZGVkID0gZGVjb2RlQm9keShCdWZmZXIuY29uY2F0KHJlc3BDaHVua3MpLCBoZWFkZXJzWydjb250ZW50LWVuY29kaW5nJ10pO1xuXHRcdFx0XHRcdGNvbnN0IHN0b3JlZEhlYWRlcnMgPSBmaWx0ZXJSZWNvcmRlZFJlc3BvbnNlSGVhZGVycyhoZWFkZXJzKTtcblx0XHRcdFx0XHQvLyBSZXdyaXRlIHRoZSBDQVBJIG9yaWdpbiB0byBhIHBsYWNlaG9sZGVyIChzbyByZXBsYXkgcmUtcG9pbnRzXG5cdFx0XHRcdFx0Ly8gZGlzY292ZXJ5IGF0IHRoZSBwcm94eSksIG5vcm1hbGl6ZSBsb2NhbCBwYXRocywgYW5kIHJlZGFjdFxuXHRcdFx0XHRcdC8vIHJlc3BvbnNlLXNpZGUgc2VjcmV0cy5cblx0XHRcdFx0XHRjb25zdCBjYXBpT3JpZ2luID0gbmV3IFVSTCh0aGlzLl9jYXBpVXBzdHJlYW0pLm9yaWdpbjtcblx0XHRcdFx0XHRjb25zdCBub3JtYWxpemVkQm9keSA9IHRoaXMuX25vcm1hbGl6ZShyZXBsYWNlQWxsKGRlY29kZWQsIGNhcGlPcmlnaW4sIENBUElfUExBQ0VIT0xERVIpKVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoU0VDUkVUX0ZJRUxEX1JFLCBgJDFcIiR7U0VDUkVUX1BMQUNFSE9MREVSfVwiYClcblx0XHRcdFx0XHRcdC5yZXBsYWNlKFNZU1RFTV9GSUVMRF9SRSwgYCQxXCIke1NZU1RFTV9QUk9NUFRfUExBQ0VIT0xERVJ9XCJgKTtcblx0XHRcdFx0XHR0aGlzLl9yZWNvcmRlZC5wdXNoKHtcblx0XHRcdFx0XHRcdG1ldGhvZCxcblx0XHRcdFx0XHRcdHBhdGgsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0Qm9keTogdGhpcy5fbm9ybWFsaXplKGJvZHkpLFxuXHRcdFx0XHRcdFx0cmVzcG9uc2U6IHsgc3RhdHVzLCBoZWFkZXJzOiBzdG9yZWRIZWFkZXJzLCBib2R5OiBub3JtYWxpemVkQm9keSB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0KTtcblx0XHR1cHN0cmVhbVJlcS5vbignZXJyb3InLCBlcnIgPT4gdGhpcy5fZmFpbChyZXMsIGB1cHN0cmVhbSBlcnJvcjogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCkpO1xuXHRcdGlmIChib2R5KSB7XG5cdFx0XHR1cHN0cmVhbVJlcS53cml0ZShib2R5KTtcblx0XHR9XG5cdFx0dXBzdHJlYW1SZXEuZW5kKCk7XG5cdH1cblxuXHQvKiogR2l0SHViLUFQSSBwYXRocyBnbyB0byB0aGUgR2l0SHViIHVwc3RyZWFtOyBldmVyeXRoaW5nIGVsc2UgdG8gQ0FQSS4gKi9cblx0cHJpdmF0ZSBfdXBzdHJlYW1Gb3IocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoR0lUSFVCX0FQSV9QUkVGSVhFUy5zb21lKHByZWZpeCA9PiBwYXRoLnN0YXJ0c1dpdGgocHJlZml4KSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9naXRodWJVcHN0cmVhbTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhcGlVcHN0cmVhbTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9jYXBpVXBzdHJlYW0oKTogc3RyaW5nIHtcblx0XHRjb25zdCB1cmwgPSB0aGlzLl9vcHRpb25zLmNhcGlVcHN0cmVhbVVybCA/PyB0aGlzLl9vcHRpb25zLnVwc3RyZWFtVXJsO1xuXHRcdGlmICghdXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1tjYXBpLXJlcGxheV0gbm8gQ0FQSSB1cHN0cmVhbSBjb25maWd1cmVkIChzZXQgY2FwaVVwc3RyZWFtVXJsIG9yIHVwc3RyZWFtVXJsKScpO1xuXHRcdH1cblx0XHRyZXR1cm4gdXJsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2dpdGh1YlVwc3RyZWFtKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdXJsID0gdGhpcy5fb3B0aW9ucy5naXRodWJVcHN0cmVhbVVybCA/PyB0aGlzLl9vcHRpb25zLnVwc3RyZWFtVXJsO1xuXHRcdGlmICghdXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1tjYXBpLXJlcGxheV0gbm8gR2l0SHViIHVwc3RyZWFtIGNvbmZpZ3VyZWQgKHNldCBnaXRodWJVcHN0cmVhbVVybCBvciB1cHN0cmVhbVVybCknKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVybDtcblx0fVxuXG5cdHByaXZhdGUgX2ZhaWwocmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXJlcy5oZWFkZXJzU2VudCkge1xuXHRcdFx0Ly8gYHgtc2hvdWxkLXJldHJ5OiBmYWxzZWAgbWlycm9ycyB0aGUgQ0xJIHByb3h5IHNvIHRoZSBTREsgZG9lcyBub3Rcblx0XHRcdC8vIGhhbW1lciBhIG1pc3NpbmcgZml4dHVyZSB3aXRoIHJldHJpZXMuXG5cdFx0XHRyZXMud3JpdGVIZWFkKDUwMCwgeyAnY29udGVudC10eXBlJzogJ3RleHQvcGxhaW4nLCAneC1zaG91bGQtcmV0cnknOiAnZmFsc2UnIH0pO1xuXHRcdH1cblx0XHRyZXMuZW5kKGBbY2FwaS1yZXBsYXldICR7bWVzc2FnZX1gKTtcblx0fVxuXG5cdC8vIC0tIGZpeHR1cmUgSS9PIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9sb2FkRml4dHVyZSgpOiB2b2lkIHtcblx0XHRjb25zdCBmaXh0dXJlID0geWFtbE1vZHVsZS5sb2FkKHJlYWRGaWxlU3luYyh0aGlzLl9maXh0dXJlUGF0aCwgJ3V0ZjgnKSkgYXMgSUZpeHR1cmU7XG5cdFx0Y29uc3QgdHVybkVuZHBvaW50ID0gZml4dHVyZS5kaWFsZWN0ID8gRElBTEVDVF9FTkRQT0lOVFtmaXh0dXJlLmRpYWxlY3RdIDogdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgZXhjaGFuZ2Ugb2YgZml4dHVyZS5leGNoYW5nZXMpIHtcblx0XHRcdGxldCBrZXk6IHN0cmluZztcblx0XHRcdGxldCBpdGVtOiBJUmVwbGF5SXRlbTtcblx0XHRcdGlmIChpc1R1cm5FeGNoYW5nZShleGNoYW5nZSkpIHtcblx0XHRcdFx0aWYgKCF0dXJuRW5kcG9pbnQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtjYXBpLXJlcGxheV0gZml4dHVyZSBoYXMgdHVybiBleGNoYW5nZXMgYnV0IG5vIHRvcC1sZXZlbCBkaWFsZWN0OiAke3RoaXMuX2ZpeHR1cmVQYXRofWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGtleSA9IGAke3R1cm5FbmRwb2ludC5tZXRob2R9ICR7dHVybkVuZHBvaW50LnBhdGh9YDtcblx0XHRcdFx0aXRlbSA9IHsga2luZDogJ3R1cm4nLCBkaWFsZWN0OiBmaXh0dXJlLmRpYWxlY3QhLCBtZXNzYWdlOiB7IGNvbnRlbnQ6IGRlc2VyaWFsaXplQW50aHJvcGljQ29udGVudChleGNoYW5nZS5yZXNwb25zZS5jb250ZW50KSwgc3RvcFJlYXNvbjogZXhjaGFuZ2UucmVzcG9uc2Uuc3RvcFJlYXNvbiB9LCByZXF1ZXN0OiBleGNoYW5nZS5yZXF1ZXN0IH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRrZXkgPSBgJHtleGNoYW5nZS5tZXRob2R9ICR7ZXhjaGFuZ2UucGF0aH1gO1xuXHRcdFx0XHRpdGVtID0geyBraW5kOiAncmF3JywgcmVzcG9uc2U6IGV4Y2hhbmdlLnJlc3BvbnNlIH07XG5cdFx0XHR9XG5cdFx0XHRsZXQgYnVja2V0ID0gdGhpcy5fcmVwbGF5QnVja2V0cy5nZXQoa2V5KTtcblx0XHRcdGlmICghYnVja2V0KSB7XG5cdFx0XHRcdGJ1Y2tldCA9IHsgaXRlbXM6IFtdLCBpbmRleDogMCB9O1xuXHRcdFx0XHR0aGlzLl9yZXBsYXlCdWNrZXRzLnNldChrZXksIGJ1Y2tldCk7XG5cdFx0XHR9XG5cdFx0XHRidWNrZXQuaXRlbXMucHVzaChpdGVtKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93cml0ZUZpeHR1cmUoKTogdm9pZCB7XG5cdFx0Y29uc3QgYnVpbHQgPSB0aGlzLl9yZWNvcmRlZC5tYXAoZXhjaGFuZ2UgPT4gdGhpcy5fdG9GaXh0dXJlRXhjaGFuZ2UoZXhjaGFuZ2UpKTtcblx0XHRjb25zdCBleGNoYW5nZXMgPSBidWlsdC5tYXAoYiA9PiBiLmV4Y2hhbmdlKTtcblx0XHR0aGlzLl9ub3JtYWxpemVUb29sQ2FsbElkcyhleGNoYW5nZXMpO1xuXHRcdHRoaXMuX25vcm1hbGl6ZVV1aWRzKGV4Y2hhbmdlcyk7XG5cdFx0dGhpcy5fYXNzZXJ0Tm9Qb3NpeE9ubHlDb21tYW5kcyhleGNoYW5nZXMpO1xuXHRcdC8vIEV2ZXJ5IHR1cm4gaW4gYSBmaXh0dXJlIHNoYXJlcyBvbmUgZW5kcG9pbnQsIHNvIHRoZSBkaWFsZWN0IChhbmQgdGhlXG5cdFx0Ly8gYChtZXRob2QsIHBhdGgpYCBpdCBpbXBsaWVzKSBpcyBzdG9yZWQgb25jZSBhdCB0aGUgdG9wIGluc3RlYWQgb2Ygb24gZWFjaFxuXHRcdC8vIGV4Y2hhbmdlLlxuXHRcdGNvbnN0IGRpYWxlY3QgPSBidWlsdC5maW5kKGIgPT4gYi5kaWFsZWN0ICE9PSB1bmRlZmluZWQpPy5kaWFsZWN0O1xuXHRcdGNvbnN0IGZpeHR1cmU6IElGaXh0dXJlID0geyB2ZXJzaW9uOiAxLCAuLi4oZGlhbGVjdCA/IHsgZGlhbGVjdCB9IDoge30pLCBleGNoYW5nZXMgfTtcblx0XHRta2RpclN5bmMoZGlybmFtZSh0aGlzLl9maXh0dXJlUGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHdyaXRlRmlsZVN5bmModGhpcy5fZml4dHVyZVBhdGgsIHlhbWxNb2R1bGUuZHVtcChmaXh0dXJlLCB7IGxpbmVXaWR0aDogLTEsIG5vUmVmczogdHJ1ZSB9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVqZWN0IGEgcmVjb3JkaW5nIHdob3NlIHNoZWxsIGNvbW1hbmRzIGNhbm5vdCBydW4gb24gV2luZG93cy5cblx0ICpcblx0ICogT25seSB0aGUgYXNzaXN0YW50J3MgYHRvb2xfdXNlYCBibG9ja3MgbWF0dGVyOiB0aG9zZSBhcmUgd2hhdCByZXBsYXkgZmVlZHNcblx0ICogYmFjayB0byB0aGUgYWdlbnQsIHNvIHRoZXkgYXJlIHRoZSBjb21tYW5kcyB0aGF0IHdpbGwgYWN0dWFsbHkgYmUgZXhlY3V0ZWRcblx0ICogb24gd2hhdGV2ZXIgcGxhdGZvcm0gdGhlIHRlc3QgbGF0ZXIgcnVucyBvbi4gVGhlIGB0b29sX3Jlc3VsdGAgYmxvY2tzXG5cdCAqIGVjaG9lZCBpbiByZXF1ZXN0IHN1bW1hcmllcyBhcmUgbmV2ZXIgcmVhZCBiYWNrLlxuXHQgKlxuXHQgKiBUaHJvd3MgYmVmb3JlIHRoZSBmaWxlIGlzIHdyaXR0ZW4gc28gYSByZWplY3RlZCByZWNvcmRpbmcgY2Fubm90IGxlYXZlIGFcblx0ICogaGFsZi1wb3J0YWJsZSBmaXh0dXJlIGJlaGluZC5cblx0ICovXG5cdHByaXZhdGUgX2Fzc2VydE5vUG9zaXhPbmx5Q29tbWFuZHMoZXhjaGFuZ2VzOiBJRml4dHVyZUV4Y2hhbmdlW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fb3B0aW9ucy5hbGxvd1Bvc2l4Q29tbWFuZHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZHM6IElSZWNvcmRlZENvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXhjaGFuZ2Ugb2YgZXhjaGFuZ2VzKSB7XG5cdFx0XHRpZiAoIWlzVHVybkV4Y2hhbmdlKGV4Y2hhbmdlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYmxvY2sgb2YgZGVzZXJpYWxpemVBbnRocm9waWNDb250ZW50KGV4Y2hhbmdlLnJlc3BvbnNlLmNvbnRlbnQpKSB7XG5cdFx0XHRcdGlmIChibG9jay50eXBlICE9PSAndG9vbF91c2UnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IGdldFJlY29yZGVkU2hlbGxDb21tYW5kKGJsb2NrLmlucHV0IGFzIHsgY29tbWFuZD86IHVua25vd247IGNtZD86IHVua25vd24gfSB8IHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHRcdFx0Y29tbWFuZHMucHVzaCh7IGNvbW1hbmQsIHRvb2xOYW1lOiBibG9jay5uYW1lIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGZpbmRpbmdzID0gZmluZFBvc2l4T25seUNvbW1hbmRzKGNvbW1hbmRzKTtcblx0XHRpZiAoZmluZGluZ3MubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGZvcm1hdFBvc2l4Q29tbWFuZEVycm9yKHRoaXMuX2ZpeHR1cmVQYXRoLCBmaW5kaW5ncykpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBsYWNlIHRoZSBiYWNrZW5kJ3Mgb3BhcXVlIHRvb2wtY2FsbCBpZHMgd2l0aCBzdGFibGUsIHJlYWRhYmxlIG9yZGluYWxzXG5cdCAqIChgdG9vbGNhbGxfMGAsIGB0b29sY2FsbF8xYCwgLi4uKSBhY3Jvc3MgdGhlIHdob2xlIGZpeHR1cmUuIEFzc2lzdGFudFxuXHQgKiBgdG9vbF91c2VgIGJsb2NrcyBkZWZpbmUgdGhlIG9yZGVyaW5nOyB0aGUgYHRvb2xfcmVzdWx0YCBibG9ja3MgdGhhdCByZWZlclxuXHQgKiBiYWNrIHRvIHRoZW0gaW4gbGF0ZXIgcmVxdWVzdHMgcmV1c2UgdGhlIHNhbWUgbWFwcGluZy4gS2VlcHMgY2FwdHVyZXNcblx0ICogZGV0ZXJtaW5pc3RpYyBhY3Jvc3MgcmUtcmVjb3JkcyBhbmQgZWFzeSB0byBmb2xsb3cuXG5cdCAqL1xuXHRwcml2YXRlIF9ub3JtYWxpemVUb29sQ2FsbElkcyhleGNoYW5nZXM6IElGaXh0dXJlRXhjaGFuZ2VbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGlkTWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBtYXBJZCA9IChpZDogc3RyaW5nKTogc3RyaW5nID0+IHtcblx0XHRcdGxldCBtYXBwZWQgPSBpZE1hcC5nZXQoaWQpO1xuXHRcdFx0aWYgKG1hcHBlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdG1hcHBlZCA9IGB0b29sY2FsbF8ke2lkTWFwLnNpemV9YDtcblx0XHRcdFx0aWRNYXAuc2V0KGlkLCBtYXBwZWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1hcHBlZDtcblx0XHR9O1xuXHRcdC8vIEZpcnN0IHBhc3M6IGFzc2lzdGFudCB0b29sX3VzZSBpZHMgKGluIHJlcGx5IG9yZGVyKSBzZWVkIHRoZSBtYXBwaW5nLlxuXHRcdGZvciAoY29uc3QgZXhjaGFuZ2Ugb2YgZXhjaGFuZ2VzKSB7XG5cdFx0XHRpZiAoIWlzVHVybkV4Y2hhbmdlKGV4Y2hhbmdlKSB8fCAhQXJyYXkuaXNBcnJheShleGNoYW5nZS5yZXNwb25zZS5jb250ZW50KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYmxvY2sgb2YgZXhjaGFuZ2UucmVzcG9uc2UuY29udGVudCkge1xuXHRcdFx0XHRjb25zdCBiID0gYmxvY2sgYXMgeyB0eXBlPzogc3RyaW5nOyBpZD86IHN0cmluZyB9O1xuXHRcdFx0XHRpZiAoYi50eXBlID09PSAndG9vbF91c2UnICYmIHR5cGVvZiBiLmlkID09PSAnc3RyaW5nJyAmJiBiLmlkKSB7XG5cdFx0XHRcdFx0Yi5pZCA9IG1hcElkKGIuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFNlY29uZCBwYXNzOiB0b29sX3Jlc3VsdCByZWZlcmVuY2VzIGluIHJlcXVlc3RzIHJldXNlIHRoZSBzYW1lIGlkcy5cblx0XHRmb3IgKGNvbnN0IGV4Y2hhbmdlIG9mIGV4Y2hhbmdlcykge1xuXHRcdFx0aWYgKCFpc1R1cm5FeGNoYW5nZShleGNoYW5nZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgZXhjaGFuZ2UucmVxdWVzdC5tZXNzYWdlcykge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gKG1lc3NhZ2UgYXMgeyBjb250ZW50PzogdW5rbm93biB9KS5jb250ZW50O1xuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGJsb2NrIG9mIGNvbnRlbnQpIHtcblx0XHRcdFx0XHRjb25zdCBiID0gYmxvY2sgYXMgeyB0eXBlPzogc3RyaW5nOyB0b29sX3VzZV9pZD86IHN0cmluZyB9O1xuXHRcdFx0XHRcdGlmIChiLnR5cGUgPT09ICd0b29sX3Jlc3VsdCcgJiYgdHlwZW9mIGIudG9vbF91c2VfaWQgPT09ICdzdHJpbmcnICYmIGIudG9vbF91c2VfaWQpIHtcblx0XHRcdFx0XHRcdGIudG9vbF91c2VfaWQgPSBtYXBJZChiLnRvb2xfdXNlX2lkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVwbGFjZSBlcGhlbWVyYWwgVVVJRHMgKHNoZWxsIGlkcywgc2Vzc2lvbi1zdGF0ZSBpZHMsIC4uLikgdGhhdCBhcHBlYXIgaW5cblx0ICogY2FwdHVyZWQgcmVxdWVzdC9yZXNwb25zZSBjb250ZW50IHdpdGggc3RhYmxlIG9yZGluYWwgcGxhY2Vob2xkZXJzXG5cdCAqIChgJHt1dWlkXzB9YCwgYCR7dXVpZF8xfWAsIC4uLikuIFRoZXkgY2hhbmdlIG9uIGV2ZXJ5IHJlLXJlY29yZCwgc29cblx0ICogbm9ybWFsaXppbmcgdGhlbSBrZWVwcyBjb21taXR0ZWQgZml4dHVyZXMgZGlmZi1jbGVhbi4gRGlzdGluY3QgVVVJRHMgZ2V0XG5cdCAqIGRpc3RpbmN0IHBsYWNlaG9sZGVyczsgcmVwZWF0cyBvZiB0aGUgc2FtZSBVVUlEIHJldXNlIGl0cyBwbGFjZWhvbGRlci5cblx0ICovXG5cdHByaXZhdGUgX25vcm1hbGl6ZVV1aWRzKGV4Y2hhbmdlczogSUZpeHR1cmVFeGNoYW5nZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgaWRNYXAgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IHV1aWRSZSA9IC9bMC05YS1mXXs4fS1bMC05YS1mXXs0fS1bMC05YS1mXXs0fS1bMC05YS1mXXs0fS1bMC05YS1mXXsxMn0vZ2k7XG5cdFx0Y29uc3QgbWFwVXVpZCA9ICh1dWlkOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuXHRcdFx0bGV0IG1hcHBlZCA9IGlkTWFwLmdldCh1dWlkKTtcblx0XHRcdGlmIChtYXBwZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRtYXBwZWQgPSBgXFwke3V1aWRfJHtpZE1hcC5zaXplfX1gO1xuXHRcdFx0XHRpZE1hcC5zZXQodXVpZCwgbWFwcGVkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtYXBwZWQ7XG5cdFx0fTtcblx0XHRjb25zdCB3YWxrID0gKHZhbHVlOiB1bmtub3duKTogdW5rbm93biA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWUucmVwbGFjZSh1dWlkUmUsIG1hcFV1aWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHR2YWx1ZVtpXSA9IHdhbGsodmFsdWVbaV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdGNvbnN0IG9iaiA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvYmopKSB7XG5cdFx0XHRcdFx0b2JqW2tleV0gPSB3YWxrKG9ialtrZXldKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IGV4Y2hhbmdlIG9mIGV4Y2hhbmdlcykge1xuXHRcdFx0d2FsayhleGNoYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnQgYSByYXcgcmVjb3JkZWQgZXhjaGFuZ2UgaW50byBpdHMgZml4dHVyZSBmb3JtOiBtb2RlbC1lbmRwb2ludCBjYWxsc1xuXHQgKiBiZWNvbWUgcmVhZGFibGUgdHVybnMgKHBhcnNlZCByZXF1ZXN0ICsgcmVnZW5lcmF0YWJsZSByZXBseSkgdGFnZ2VkIHdpdGhcblx0ICogdGhlaXIgZGlhbGVjdCAoaG9pc3RlZCB0byB0aGUgZml4dHVyZSBsZXZlbCBieSB7QGxpbmsgX3dyaXRlRml4dHVyZX0pO1xuXHQgKiBldmVyeXRoaW5nIGVsc2Ugc3RheXMgcmF3LlxuXHQgKi9cblx0cHJpdmF0ZSBfdG9GaXh0dXJlRXhjaGFuZ2UoZXhjaGFuZ2U6IElSZWNvcmRlZEV4Y2hhbmdlKTogeyBleGNoYW5nZTogSUZpeHR1cmVFeGNoYW5nZTsgZGlhbGVjdD86IFR1cm5EaWFsZWN0IH0ge1xuXHRcdGlmIChleGNoYW5nZS5tZXRob2QgPT09ICdQT1NUJyAmJiBleGNoYW5nZS5wYXRoID09PSBBTlRIUk9QSUNfTUVTU0FHRVNfUEFUSCkge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHN1bW1hcml6ZUFudGhyb3BpY1JlcXVlc3QoZXhjaGFuZ2UucmVxdWVzdEJvZHkpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGFnZ3JlZ2F0ZUFudGhyb3BpY1NzZShleGNoYW5nZS5yZXNwb25zZS5ib2R5KTtcblx0XHRcdGlmIChyZXF1ZXN0ICYmIG1lc3NhZ2UpIHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHRoaXMuX25vcm1hbGl6ZU1lc3NhZ2VDb250ZW50KG1lc3NhZ2UuY29udGVudCk7XG5cdFx0XHRcdHJldHVybiB7IGV4Y2hhbmdlOiB7IHJlcXVlc3QsIHJlc3BvbnNlOiB7IGNvbnRlbnQ6IHNlcmlhbGl6ZUFudGhyb3BpY0NvbnRlbnQoY29udGVudCksIHN0b3BSZWFzb246IG1lc3NhZ2Uuc3RvcFJlYXNvbiB9IH0sIGRpYWxlY3Q6ICdhbnRocm9waWMnIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChleGNoYW5nZS5tZXRob2QgPT09ICdQT1NUJyAmJiBleGNoYW5nZS5wYXRoID09PSBSRVNQT05TRVNfUEFUSCkge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHN1bW1hcml6ZVJlc3BvbnNlc1JlcXVlc3QoZXhjaGFuZ2UucmVxdWVzdEJvZHkpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGFnZ3JlZ2F0ZVJlc3BvbnNlc1NzZShleGNoYW5nZS5yZXNwb25zZS5ib2R5KTtcblx0XHRcdGlmIChyZXF1ZXN0ICYmIG1lc3NhZ2UpIHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHRoaXMuX25vcm1hbGl6ZU1lc3NhZ2VDb250ZW50KG1lc3NhZ2UuY29udGVudCk7XG5cdFx0XHRcdHJldHVybiB7IGV4Y2hhbmdlOiB7IHJlcXVlc3QsIHJlc3BvbnNlOiB7IGNvbnRlbnQ6IHNlcmlhbGl6ZUFudGhyb3BpY0NvbnRlbnQoY29udGVudCksIHN0b3BSZWFzb246IG1lc3NhZ2Uuc3RvcFJlYXNvbiB9IH0sIGRpYWxlY3Q6ICdyZXNwb25zZXMnIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGV4Y2hhbmdlOiB7IG1ldGhvZDogZXhjaGFuZ2UubWV0aG9kLCBwYXRoOiBleGNoYW5nZS5wYXRoLCByZXNwb25zZTogZXhjaGFuZ2UucmVzcG9uc2UgfSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIE5vcm1hbGl6ZSBsb2NhbCBwYXRocyBvdXQgb2YgYW4gYWdncmVnYXRlZCBhc3Npc3RhbnQgcmVwbHkuIFRvb2wtaW5wdXQgSlNPTlxuXHQgKiBzdHJlYW1zIHNwbGl0IGFjcm9zcyBtYW55IFNTRSBkZWx0YXMsIHNvIGEgc3RyaW5nIHJlcGxhY2Ugb24gdGhlIHJhdyBib2R5XG5cdCAqIGNhbiBtaXNzIGEgcGF0aCBzdHJhZGRsaW5nIGEgY2h1bmsgYm91bmRhcnk7IG5vcm1hbGl6aW5nIHRoZSByZWFzc2VtYmxlZFxuXHQgKiBjb250ZW50ICh0ZXh0ICsgdG9vbCBpbnB1dHMpIGlzIHJlbGlhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSBfbm9ybWFsaXplTWVzc2FnZUNvbnRlbnQoY29udGVudDogQW50aHJvcGljQ29udGVudEJsb2NrW10pOiBBbnRocm9waWNDb250ZW50QmxvY2tbXSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQubWFwKChibG9jayk6IEFudGhyb3BpY0NvbnRlbnRCbG9jayA9PiB7XG5cdFx0XHRpZiAoYmxvY2sudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6ICd0ZXh0JywgdGV4dDogdGhpcy5fbm9ybWFsaXplKGJsb2NrLnRleHQpIH07XG5cdFx0XHR9XG5cdFx0XHRsZXQgaW5wdXQgPSBibG9jay5pbnB1dDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlucHV0ID0gSlNPTi5wYXJzZSh0aGlzLl9ub3JtYWxpemUoSlNPTi5zdHJpbmdpZnkoYmxvY2suaW5wdXQgPz8ge30pKSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gbm9uLXNlcmlhbGl6YWJsZSBpbnB1dDsga2VlcCBhcy1pc1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6IGJsb2NrLmlkLCBuYW1lOiBub3JtYWxpemVTaGVsbFRvb2xOYW1lRm9yQ2FwdHVyZShibG9jay5uYW1lKSwgaW5wdXQgfTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX25vcm1hbGl6ZSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGxldCByZXN1bHQgPSB0ZXh0O1xuXHRcdGlmICh0aGlzLl93b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRjb25zdCB3b3JrRGlycyA9IG5ldyBTZXQoW3RoaXMuX3dvcmtpbmdEaXJlY3RvcnldKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHdvcmtEaXJzLmFkZChyZWFscGF0aFN5bmMubmF0aXZlKHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBUaGUgcmVjb3JkaW5nIHdvcmsgZGlyZWN0b3J5IGNhbiBkaXNhcHBlYXIgZHVyaW5nIHRlYXJkb3duLlxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB3b3JrRGlyIG9mIFsuLi53b3JrRGlyc10uc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aCkpIHtcblx0XHRcdFx0cmVzdWx0ID0gcmVwbGFjZUFsbChyZXN1bHQsIGVzY2FwZUpzb25TdHJpbmcod29ya0RpciksIFdPUktESVJfUExBQ0VIT0xERVIpO1xuXHRcdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgd29ya0RpciwgV09SS0RJUl9QTEFDRUhPTERFUik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcHRpb25zLmhvbWVEaXIpIHtcblx0XHRcdHJlc3VsdCA9IHJlcGxhY2VBbGwocmVzdWx0LCBlc2NhcGVKc29uU3RyaW5nKHRoaXMuX29wdGlvbnMuaG9tZURpciksIEhPTUVESVJfUExBQ0VIT0xERVIpO1xuXHRcdFx0cmVzdWx0ID0gcmVwbGFjZUFsbChyZXN1bHQsIHRoaXMuX29wdGlvbnMuaG9tZURpciwgSE9NRURJUl9QTEFDRUhPTERFUik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcHRpb25zLnVzZXJOYW1lKSB7XG5cdFx0XHRyZXN1bHQgPSBzY3J1YlVzZXJOYW1lKHJlc3VsdCwgdGhpcy5fb3B0aW9ucy51c2VyTmFtZSk7XG5cdFx0fVxuXHRcdHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKENPUElFRF9QTFVHSU5fRElSX1JFLCBgJHtIT01FRElSX1BMQUNFSE9MREVSfS91c2VyLWRhdGEvYWdlbnRQbHVnaW5zLyR7Q09QSUVEX1BMVUdJTl9ESVJfUExBQ0VIT0xERVJ9YCk7XG5cdFx0cmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoVEVNUF9ESVJfU1VGRklYX1JFLCBgJDEke1RFTVBfRElSX1NVRkZJWF9QTEFDRUhPTERFUn1gKTtcblx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgYC9wcml2YXRlJHtXT1JLRElSX1BMQUNFSE9MREVSfWAsIFdPUktESVJfUExBQ0VIT0xERVIpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdC5yZXBsYWNlKEZJTEVfTElTVElOR19EQVRFX1JFLCAnJHt0aW1lc3RhbXB9Jyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2V4cGFuZFJlcGxheU1lc3NhZ2UobWVzc2FnZTogSUFudGhyb3BpY01lc3NhZ2UpOiBJQW50aHJvcGljTWVzc2FnZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLm1lc3NhZ2UsXG5cdFx0XHRjb250ZW50OiBtZXNzYWdlLmNvbnRlbnQubWFwKGJsb2NrID0+IHtcblx0XHRcdFx0aWYgKGJsb2NrLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLmJsb2NrLCB0ZXh0OiB0aGlzLl9leHBhbmRSZXBsYXlQbGFjZWhvbGRlcnMoYmxvY2sudGV4dCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYmxvY2sudHlwZSA9PT0gJ3Rvb2xfdXNlJykge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLmJsb2NrLCBuYW1lOiBleHBhbmRTaGVsbFRvb2xOYW1lKGJsb2NrLm5hbWUpLCBpbnB1dDogdGhpcy5fZXhwYW5kUmVwbGF5VmFsdWUoYmxvY2suaW5wdXQpIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQW55IGZ1dHVyZSBibG9jayBraW5kIHBhc3NlcyB0aHJvdWdoIHVudG91Y2hlZCByYXRoZXIgdGhhbiBiZWluZ1xuXHRcdFx0XHQvLyByZXdyaXR0ZW4gYXMgaWYgaXQgd2VyZSBhIHRvb2wgY2FsbC5cblx0XHRcdFx0cmV0dXJuIGJsb2NrO1xuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2V4cGFuZFJlcGxheVZhbHVlKHZhbHVlOiB1bmtub3duKTogdW5rbm93biB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLl9leHBhbmRSZXBsYXlQbGFjZWhvbGRlcnModmFsdWUpO1xuXHRcdH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAoaXRlbSA9PiB0aGlzLl9leHBhbmRSZXBsYXlWYWx1ZShpdGVtKSk7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIGl0ZW1dIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlKSkge1xuXHRcdFx0XHRyZXN1bHRba2V5XSA9IHRoaXMuX2V4cGFuZFJlcGxheVZhbHVlKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhwYW5kUmVwbGF5UGxhY2Vob2xkZXJzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9IHJlcGxhY2VBbGwodGV4dCwgQ0FQSV9QTEFDRUhPTERFUiwgdGhpcy51cmwpO1xuXHRcdGlmICh0aGlzLl93b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VOYW1lID0gYmFzZW5hbWUodGhpcy5fd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBzdWZmaXggPSAvLSg/PHN1ZmZpeD5bQS1aYS16MC05XXs2fSkkLy5leGVjKHdvcmtzcGFjZU5hbWUpPy5ncm91cHM/LnN1ZmZpeDtcblx0XHRcdGxldCBjYW5vbmljYWxXb3JraW5nRGlyZWN0b3J5ID0gdGhpcy5fd29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNhbm9uaWNhbFdvcmtpbmdEaXJlY3RvcnkgPSByZWFscGF0aFN5bmMubmF0aXZlKHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFRoZSByZXBsYXkgd29ya2luZyBkaXJlY3RvcnkgY2FuIGRpc2FwcGVhciBkdXJpbmcgdGVhcmRvd24uXG5cdFx0XHR9XG5cdFx0XHRpZiAoc3VmZml4KSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZVN0ZW0gPSB3b3Jrc3BhY2VOYW1lLnNsaWNlKDAsIC1zdWZmaXgubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplZFdvcmtzcGFjZU5hbWUgPSBgJHt3b3Jrc3BhY2VTdGVtfSR7VEVNUF9ESVJfU1VGRklYX1BMQUNFSE9MREVSfWA7XG5cdFx0XHRcdGNvbnN0IGxlZ2FjeVdvcmtzcGFjZVBsYWNlaG9sZGVyID0gYCR7V09SS0RJUl9QTEFDRUhPTERFUn0vJHtub3JtYWxpemVkV29ya3NwYWNlTmFtZX1gO1xuXHRcdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgYC9wcml2YXRlJHtsZWdhY3lXb3Jrc3BhY2VQbGFjZWhvbGRlcn1gLCBjYW5vbmljYWxXb3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdFx0cmVzdWx0ID0gcmVwbGFjZUFsbChyZXN1bHQsIGxlZ2FjeVdvcmtzcGFjZVBsYWNlaG9sZGVyLCB0aGlzLl93b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdFx0cmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoXG5cdFx0XHRcdFx0bmV3IFJlZ0V4cChgKD86XFxcXC9wcml2YXRlKT8ke2VzY2FwZVJlZ0V4cENoYXJhY3RlcnMoV09SS0RJUl9QTEFDRUhPTERFUil9XFxcXC8ke2VzY2FwZVJlZ0V4cENoYXJhY3RlcnMod29ya3NwYWNlU3RlbSl9W0EtWmEtejAtOV17Nn1gLCAnZycpLFxuXHRcdFx0XHRcdG1hdGNoID0+IG1hdGNoLnN0YXJ0c1dpdGgoJy9wcml2YXRlJykgPyBjYW5vbmljYWxXb3JraW5nRGlyZWN0b3J5IDogdGhpcy5fd29ya2luZ0RpcmVjdG9yeSEsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgYC9wcml2YXRlJHtXT1JLRElSX1BMQUNFSE9MREVSfWAsIGNhbm9uaWNhbFdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0cmVzdWx0ID0gcmVwbGFjZUFsbChyZXN1bHQsIFdPUktESVJfUExBQ0VIT0xERVIsIHRoaXMuX3dvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0aWYgKHN1ZmZpeCkge1xuXHRcdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgVEVNUF9ESVJfU1VGRklYX1BMQUNFSE9MREVSLCBzdWZmaXgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fb3B0aW9ucy5ob21lRGlyKSB7XG5cdFx0XHRyZXN1bHQgPSByZXBsYWNlQWxsKHJlc3VsdCwgSE9NRURJUl9QTEFDRUhPTERFUiwgdGhpcy5fb3B0aW9ucy5ob21lRGlyKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMudXNlck5hbWUpIHtcblx0XHRcdHJlc3VsdCA9IHJlcGxhY2VBbGwocmVzdWx0LCBVU0VSX1BMQUNFSE9MREVSLCB0aGlzLl9vcHRpb25zLnVzZXJOYW1lKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbcGxhY2Vob2xkZXIsIHZhbHVlXSBvZiB0aGlzLl9yZXBsYXlQbGFjZWhvbGRlclZhbHVlcykge1xuXHRcdFx0cmVzdWx0ID0gcmVwbGFjZUFsbChyZXN1bHQsIHBsYWNlaG9sZGVyLCB2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gY2FwdHVyZVJlcGxheVBsYWNlaG9sZGVyVmFsdWVzKHJlY29yZGVkOiB1bmtub3duLCBvYnNlcnZlZDogdW5rbm93biwgdmFsdWVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogdm9pZCB7XG5cdGlmICh0eXBlb2YgcmVjb3JkZWQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBvYnNlcnZlZCA9PT0gJ3N0cmluZycpIHtcblx0XHRjYXB0dXJlUmVwbGF5UGxhY2Vob2xkZXJWYWx1ZXNGcm9tU3RyaW5nKHJlY29yZGVkLCBvYnNlcnZlZCwgdmFsdWVzKTtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKEFycmF5LmlzQXJyYXkocmVjb3JkZWQpICYmIEFycmF5LmlzQXJyYXkob2JzZXJ2ZWQpKSB7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IE1hdGgubWluKHJlY29yZGVkLmxlbmd0aCwgb2JzZXJ2ZWQubGVuZ3RoKTsgaW5kZXgrKykge1xuXHRcdFx0Y2FwdHVyZVJlcGxheVBsYWNlaG9sZGVyVmFsdWVzKHJlY29yZGVkW2luZGV4XSwgb2JzZXJ2ZWRbaW5kZXhdLCB2YWx1ZXMpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKCFpc1JlY29yZChyZWNvcmRlZCkgfHwgIWlzUmVjb3JkKG9ic2VydmVkKSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyZWNvcmRlZCkpIHtcblx0XHRjYXB0dXJlUmVwbGF5UGxhY2Vob2xkZXJWYWx1ZXModmFsdWUsIG9ic2VydmVkW2tleV0sIHZhbHVlcyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY2FwdHVyZVJlcGxheVBsYWNlaG9sZGVyVmFsdWVzRnJvbVN0cmluZyhyZWNvcmRlZDogc3RyaW5nLCBvYnNlcnZlZDogc3RyaW5nLCB2YWx1ZXM6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiB2b2lkIHtcblx0Y29uc3QgcGxhY2Vob2xkZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRsZXQgcGF0dGVybiA9ICdeJztcblx0bGV0IG9mZnNldCA9IDA7XG5cdGZvciAoY29uc3QgbWF0Y2ggb2YgcmVjb3JkZWQubWF0Y2hBbGwoVVVJRF9QTEFDRUhPTERFUl9SRSkpIHtcblx0XHRwYXR0ZXJuICs9IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMocmVjb3JkZWQuc2xpY2Uob2Zmc2V0LCBtYXRjaC5pbmRleCkpO1xuXHRcdHBhdHRlcm4gKz0gYCgke1VVSURfUEFUVEVSTn0pYDtcblx0XHRwbGFjZWhvbGRlcnMucHVzaChtYXRjaFswXSk7XG5cdFx0b2Zmc2V0ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XG5cdH1cblx0aWYgKHBsYWNlaG9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cGF0dGVybiArPSBgJHtlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHJlY29yZGVkLnNsaWNlKG9mZnNldCkpfSRgO1xuXHRjb25zdCBtYXRjaCA9IG5ldyBSZWdFeHAocGF0dGVybiwgJ2knKS5leGVjKG9ic2VydmVkKTtcblx0aWYgKCFtYXRjaCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBjYXB0dXJlZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwbGFjZWhvbGRlcnMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcnNbaW5kZXhdO1xuXHRcdGNvbnN0IHZhbHVlID0gbWF0Y2hbaW5kZXggKyAxXTtcblx0XHRpZiAoKGNhcHR1cmVkLmhhcyhwbGFjZWhvbGRlcikgJiYgY2FwdHVyZWQuZ2V0KHBsYWNlaG9sZGVyKSAhPT0gdmFsdWUpXG5cdFx0XHR8fCAodmFsdWVzLmhhcyhwbGFjZWhvbGRlcikgJiYgdmFsdWVzLmdldChwbGFjZWhvbGRlcikgIT09IHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjYXB0dXJlZC5zZXQocGxhY2Vob2xkZXIsIHZhbHVlKTtcblx0fVxuXHRmb3IgKGNvbnN0IFtwbGFjZWhvbGRlciwgdmFsdWVdIG9mIGNhcHR1cmVkKSB7XG5cdFx0dmFsdWVzLnNldChwbGFjZWhvbGRlciwgdmFsdWUpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzUmVjb3JkKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+IHtcblx0cmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuXG5mdW5jdGlvbiByZXBsYWNlQWxsKHRleHQ6IHN0cmluZywgc2VhcmNoOiBzdHJpbmcsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIXNlYXJjaCkge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cdHJldHVybiB0ZXh0LnNwbGl0KHNlYXJjaCkuam9pbihyZXBsYWNlbWVudCk7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZUpzb25TdHJpbmcodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSkuc2xpY2UoMSwgLTEpO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbn1cblxuLyoqIERlY29tcHJlc3MgYSByZXNwb25zZSBib2R5IHBlciBpdHMgYGNvbnRlbnQtZW5jb2RpbmdgIGludG8gYSBVVEYtOCBzdHJpbmcuICovXG5mdW5jdGlvbiBkZWNvZGVCb2R5KGJ1ZmZlcjogQnVmZmVyLCBlbmNvZGluZzogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHQvLyBOb3JtYWxpemUgaGVhZGVyIGNhc2luZy93aGl0ZXNwYWNlIChlLmcuIGBHWklQYCwgYCBnemlwIGApIGJlZm9yZSBtYXRjaGluZy5cblx0XHRzd2l0Y2ggKGVuY29kaW5nPy50cmltKCkudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0Y2FzZSAnZ3ppcCc6IHJldHVybiB6bGliTW9kdWxlLmd1bnppcFN5bmMoYnVmZmVyKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0Y2FzZSAnYnInOiByZXR1cm4gemxpYk1vZHVsZS5icm90bGlEZWNvbXByZXNzU3luYyhidWZmZXIpLnRvU3RyaW5nKCd1dGY4Jyk7XG5cdFx0XHRjYXNlICdkZWZsYXRlJzogcmV0dXJuIHpsaWJNb2R1bGUuaW5mbGF0ZVN5bmMoYnVmZmVyKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIGJ1ZmZlci50b1N0cmluZygndXRmOCcpO1xuXHRcdH1cblx0fSBjYXRjaCB7XG5cdFx0Ly8gTm90IGFjdHVhbGx5IGNvbXByZXNzZWQgLyB1bmtub3duIGVuY29kaW5nIFx1MjAxNCBmYWxsIGJhY2sgdG8gcmF3IHRleHQuXG5cdFx0cmV0dXJuIGJ1ZmZlci50b1N0cmluZygndXRmOCcpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW5IZWFkZXJzKGhlYWRlcnM6IGh0dHAuSW5jb21pbmdIdHRwSGVhZGVycyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoaGVhZGVycykpIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHJlc3VsdFtrZXldID0gQXJyYXkuaXNBcnJheSh2YWx1ZSkgPyB2YWx1ZS5qb2luKCcsICcpIDogdmFsdWU7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZmlsdGVyUmVjb3JkZWRSZXNwb25zZUhlYWRlcnMoaGVhZGVyczogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4pOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcblx0cmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhoZWFkZXJzKS5maWx0ZXIoKFtrZXldKSA9PiBTVE9SRURfUkVTUE9OU0VfSEVBREVSUy5oYXMoa2V5LnRvTG93ZXJDYXNlKCkpKSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFxQ0EsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxZQUFZLFdBQVcsY0FBYyxjQUFjLHFCQUFxQjtBQUNqRixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLHVCQUF1Qix1QkFBdUIseUJBQXlCLHVCQUF1Qix1QkFBdUIsZ0JBQWdCLDJCQUEyQiw2QkFBNkIsMkJBQTJCLGlDQUFxSDtBQUN0VixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1Qix5QkFBeUIsK0JBQXNEO0FBQy9HLFNBQVMsNEJBQTRCLG9CQUFvQiwyQkFBMkI7QUFDcEYsU0FBUyxxQkFBcUIsd0NBQXdDO0FBQ3RFLFNBQVMsZUFBZSw2QkFBNkI7QUFJckQsTUFBTSxjQUFjLGNBQWMsWUFBWSxHQUFHO0FBQ2pELE1BQU0sYUFBYSxZQUFZLE1BQU07QUFDckMsTUFBTSxjQUFjLFlBQVksT0FBTztBQUN2QyxNQUFNLGFBQWEsWUFBWSxN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
