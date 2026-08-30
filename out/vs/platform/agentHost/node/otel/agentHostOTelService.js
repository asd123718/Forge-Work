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
import { mkdir } from "fs/promises";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { dirname, join } from "../../../../base/common/path.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { ILogService } from "../../../log/common/log.js";
import { startLocalOtlpHttpReceiver } from "../../../otel/node/otlp/localOtlpReceiver.js";
import {
  CompositeForwarder,
  ConsoleForwarder,
  FileForwarder,
  OtlpHttpForwarder
} from "../../../otel/node/otlp/outboundForwarder.js";
import { GenAiAttr } from "../../../otel/common/genAiAttributes.js";
import { SpanStatusCode } from "../../../otel/common/spanData.js";
import { OTelSqliteStore } from "../../../otel/node/sqlite/otelSqliteStore.js";
import { AgentHostOTelSpansDbSubPath } from "../../common/agentService.js";
import { AgentHostOTelServiceName, AgentHostOTelServiceNamespace, AgentHostSessionSpanName, AgentHostSessionTitleAttribute, AgentHostSessionTitleSpanName, AgentHostSessionUriAttribute } from "../../common/otel/agentHostOTelService.js";
const SPANS_DB_SUBPATH = AgentHostOTelSpansDbSubPath;
function isTruthy(v) {
  if (!v) {
    return false;
  }
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}
function parseOtlpHeaders(raw) {
  if (!raw) {
    return void 0;
  }
  const out = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const rawKey = pair.slice(0, eq).trim();
    const rawValue = pair.slice(eq + 1).trim();
    if (rawKey) {
      try {
        out[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
      } catch {
        out[rawKey] = rawValue;
      }
    }
  }
  return Object.keys(out).length ? out : void 0;
}
function parseResourceAttributes(raw, serviceName) {
  const attributes = {};
  for (const pair of raw?.split(",") ?? []) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key) {
      try {
        attributes[key] = decodeURIComponent(value);
      } catch {
        attributes[key] = value;
      }
    }
  }
  attributes["service.namespace"] = AgentHostOTelServiceNamespace;
  attributes["service.name"] = serviceName ?? attributes["service.name"] ?? AgentHostOTelServiceName;
  return attributes;
}
function readAgentHostOTelEnv(env) {
  const dbSpanExporter = isTruthy(env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED);
  const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT ?? env.COPILOT_OTEL_ENDPOINT;
  const filePath = env.COPILOT_OTEL_FILE_EXPORTER_PATH;
  const explicitlyEnabled = isTruthy(env.COPILOT_OTEL_ENABLED);
  const enabled = explicitlyEnabled || dbSpanExporter || !!otlpEndpoint || !!filePath;
  const rawType = (env.COPILOT_OTEL_EXPORTER_TYPE ?? "").trim().toLowerCase();
  const protocol = (env.OTEL_EXPORTER_OTLP_PROTOCOL ?? env.COPILOT_OTEL_PROTOCOL ?? "").trim().toLowerCase();
  let exporterType = "otlp-http";
  if (rawType === "console" || rawType === "file" || rawType === "otlp-grpc" || rawType === "otlp-http") {
    exporterType = rawType;
  } else if (filePath) {
    exporterType = "file";
  }
  if (protocol === "grpc" || protocol === "http/grpc") {
    exporterType = "otlp-grpc";
  }
  return {
    enabled,
    dbSpanExporter,
    exporterType,
    otlpEndpoint,
    filePath,
    sourceName: env.COPILOT_OTEL_SOURCE_NAME,
    captureContent: env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT === void 0 ? void 0 : isTruthy(env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT),
    headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    otlpProtocol: protocol,
    resourceAttributes: parseResourceAttributes(env.OTEL_RESOURCE_ATTRIBUTES, env.OTEL_SERVICE_NAME)
  };
}
const CodexAuthPollingServiceName = "codex-app-server";
const CodexAuthPollingSpanName = "auth";
const CodexAuthPollingModuleName = "codex_login::auth::manager";
function attributeValue(attributes, key) {
  return attributes?.find((attribute) => attribute.key === key)?.value?.stringValue;
}
function upsertResourceAttribute(attributes, key, value) {
  const existing = attributes.find((attribute) => attribute.key === key);
  if (existing) {
    existing.value = { stringValue: value };
  } else {
    attributes.push({ key, value: { stringValue: value } });
  }
}
function normalizeAgentHostOtlpBody(body) {
  const payload = JSON.parse(body.toString("utf8"));
  let filteredSpanCount = 0;
  for (const resourceSpan of payload.resourceSpans ?? []) {
    const resource = resourceSpan.resource ??= {};
    const resourceAttributes = resource.attributes ??= [];
    const isCodex = attributeValue(resourceAttributes, "service.name") === CodexAuthPollingServiceName;
    upsertResourceAttribute(resourceAttributes, "service.namespace", AgentHostOTelServiceNamespace);
    for (const scopeSpans of resourceSpan.scopeSpans ?? []) {
      const spans = scopeSpans.spans ?? [];
      scopeSpans.spans = spans.filter((span) => {
        const shouldFilter = isCodex && span.name === CodexAuthPollingSpanName && attributeValue(span.attributes, "code.module.name") === CodexAuthPollingModuleName;
        if (shouldFilter) {
          filteredSpanCount++;
        }
        return !shouldFilter;
      });
    }
  }
  return { body: Buffer.from(JSON.stringify(payload)), filteredSpanCount };
}
let AgentHostOTelService = class extends Disposable {
  constructor(_fetchFn, _logService, environmentService) {
    super();
    this._fetchFn = _fetchFn;
    this._logService = _logService;
    this._metadataExportQueue = Promise.resolve();
    this._sessionContexts = /* @__PURE__ */ new Map();
    this._pendingFilteredCodexAuthSpans = 0;
    this._totalFilteredCodexAuthSpans = 0;
    this._filteredSpanLogScheduler = this._register(new RunOnceScheduler(() => this._logFilteredCodexAuthSpans(), 6e4));
    this._config = readAgentHostOTelEnv(process.env);
    this._spansDbPath = join(environmentService.userDataPath, SPANS_DB_SUBPATH);
  }
  async getSdkTelemetryConfig() {
    if (!this._config.enabled) {
      return void 0;
    }
    if (this._config.dbSpanExporter) {
      await this._ensureStarted();
      if (!this._receiver) {
        if (!this._config.otlpEndpoint && this._config.exporterType !== "console" && !this._config.filePath) {
          return void 0;
        }
      } else {
        return this._buildLoopbackConfig();
      }
    }
    return this._buildPassthroughConfig();
  }
  async getNativeSdkTelemetryConfig() {
    if (!this._config.enabled) {
      return void 0;
    }
    const protocol = this._config.otlpProtocol === "grpc" || this._config.otlpProtocol === "http/grpc" ? "grpc" : this._config.otlpProtocol === "http/protobuf" ? "http/protobuf" : "http/json";
    const external = this._config.otlpEndpoint ? {
      endpoint: this._config.otlpEndpoint,
      protocol,
      ...this._config.headers ? { headers: this._config.headers } : {}
    } : void 0;
    const resourceAttributes = { ...this._config.resourceAttributes };
    delete resourceAttributes["service.name"];
    resourceAttributes["service.namespace"] = AgentHostOTelServiceNamespace;
    if (!this._config.dbSpanExporter) {
      return { traces: external, external, captureContent: this._config.captureContent === true, resourceAttributes };
    }
    await this._ensureStarted();
    return {
      traces: this._receiver ? { endpoint: `${this._receiver.baseUrl}/v1/traces`, protocol: "http/json" } : external,
      external,
      captureContent: this._config.captureContent === true,
      resourceAttributes
    };
  }
  getSessionTraceContext(conversationId, sessionUri) {
    if (!this._config.enabled || !conversationId || !sessionUri || !this._config.dbSpanExporter && !this._canForwardSyntheticSpan()) {
      return void 0;
    }
    const existing = this._sessionContexts.get(sessionUri);
    if (existing) {
      return existing;
    }
    const traceId = generateUuid().replaceAll("-", "");
    const spanId = generateUuid().replaceAll("-", "").slice(0, 16);
    const context = { traceId, spanId, traceparent: `00-${traceId}-${spanId}-01` };
    this._sessionContexts.set(sessionUri, context);
    const now = Date.now();
    this._queueSyntheticSpan({
      name: AgentHostSessionSpanName,
      traceId,
      spanId,
      startTime: now,
      endTime: now,
      status: { code: SpanStatusCode.OK },
      attributes: {
        ...this._config.resourceAttributes,
        [GenAiAttr.CONVERSATION_ID]: conversationId,
        [AgentHostSessionUriAttribute]: sessionUri
      },
      events: []
    });
    return context;
  }
  releaseSessionTraceContext(sessionUri) {
    this._sessionContexts.delete(sessionUri);
  }
  withTraceContext(context, fn) {
    const previous = this._currentTraceContext;
    this._currentTraceContext = context;
    try {
      return fn();
    } finally {
      this._currentTraceContext = previous;
    }
  }
  getCurrentTraceContext() {
    return this._currentTraceContext;
  }
  getSpansDbPath() {
    return this._config.dbSpanExporter ? URI.file(this._spansDbPath) : void 0;
  }
  emitSessionTitleChanged(conversationId, sessionUri, title) {
    if (!this._config.enabled || this._config.captureContent !== true || !conversationId || !title) {
      return;
    }
    if (!this._config.dbSpanExporter && !this._canForwardSyntheticSpan()) {
      return;
    }
    const boundedTitle = title.slice(0, 200);
    const context = this.getSessionTraceContext(conversationId, sessionUri);
    const now = Date.now();
    this._queueSyntheticSpan({
      name: AgentHostSessionTitleSpanName,
      traceId: context?.traceId ?? generateUuid().replaceAll("-", ""),
      spanId: generateUuid().replaceAll("-", "").slice(0, 16),
      parentSpanId: context?.spanId,
      startTime: now,
      endTime: now,
      status: { code: SpanStatusCode.OK },
      attributes: {
        ...this._config.resourceAttributes,
        [GenAiAttr.CONVERSATION_ID]: conversationId,
        [AgentHostSessionTitleAttribute]: boundedTitle,
        [AgentHostSessionUriAttribute]: sessionUri
      },
      events: []
    });
  }
  async flush() {
    this._filteredSpanLogScheduler.flush();
    await this._metadataExportQueue;
    await this._startPromise;
    if (this._forwarder) {
      await this._forwarder.flush();
    }
  }
  _buildLoopbackConfig() {
    return {
      exporterType: "otlp-http",
      otlpEndpoint: this._receiver.baseUrl,
      sourceName: this._config.sourceName,
      captureContent: this._config.captureContent
    };
  }
  _buildPassthroughConfig() {
    return {
      exporterType: this._config.exporterType,
      otlpEndpoint: this._config.otlpEndpoint,
      filePath: this._config.filePath,
      sourceName: this._config.sourceName,
      captureContent: this._config.captureContent
    };
  }
  _ensureStarted() {
    if (!this._startPromise) {
      this._startPromise = this._start().catch((err) => {
        this._logService.error("[agentHost.otel] failed to start loopback OTel pipeline", err);
        this._receiver = void 0;
        this._forwarder = void 0;
      });
    }
    return this._startPromise;
  }
  async _start() {
    await mkdir(dirname(this._spansDbPath), { recursive: true });
    const store = new OTelSqliteStore(this._spansDbPath);
    this._spanStore = store;
    this._register(toDisposable(() => {
      store.close();
      this._spanStore = void 0;
    }));
    this._forwarder = this._buildOutboundForwarder();
    const receiver = await startLocalOtlpHttpReceiver(
      {
        transformBody: (body) => {
          const normalized = normalizeAgentHostOtlpBody(body);
          this._recordFilteredCodexAuthSpans(normalized.filteredSpanCount);
          return normalized.body;
        },
        onSpans: (result) => {
          for (const span of result.spans) {
            try {
              store.insertSpan(span);
            } catch (err) {
              this._logService.warn("[agentHost.otel] failed to insert span", err);
            }
          }
          this._forwarder?.forwardSpans?.(result);
        },
        onForward: this._forwarder ? (body, contentType) => {
          this._forwarder.forwardRaw?.(body, contentType);
        } : void 0
      },
      this._logService
    );
    this._receiver = receiver;
    this._register(receiver);
    if (this._forwarder) {
      this._register(this._forwarder);
    }
    this._logService.info(`[agentHost.otel] loopback receiver at ${receiver.baseUrl}, db ${this._spansDbPath}`);
  }
  _queueSyntheticSpan(span) {
    this._metadataExportQueue = this._metadataExportQueue.then(() => this._emitSyntheticSpan(span)).catch((err) => this._logService.warn("[agentHost.otel] failed to emit metadata span", err));
  }
  async _emitSyntheticSpan(span) {
    if (this._config.dbSpanExporter) {
      await this._ensureStarted();
    } else if (!this._forwarder) {
      this._forwarder = this._buildOutboundForwarder();
      if (this._forwarder) {
        this._register(this._forwarder);
      }
    }
    try {
      this._spanStore?.insertSpan(span);
    } catch (err) {
      this._logService.warn("[agentHost.otel] failed to persist session title span", err);
    }
    const result = { spans: [span], rejected: 0, errors: [] };
    this._forwarder?.forwardSpans?.(result);
    if (this._canForwardSyntheticSpan()) {
      this._forwarder?.forwardRaw?.(this._encodeOtlpSpan(span), "application/json");
    }
  }
  _recordFilteredCodexAuthSpans(count) {
    if (count <= 0) {
      return;
    }
    this._pendingFilteredCodexAuthSpans = Math.min(Number.MAX_SAFE_INTEGER, this._pendingFilteredCodexAuthSpans + count);
    this._totalFilteredCodexAuthSpans = Math.min(Number.MAX_SAFE_INTEGER, this._totalFilteredCodexAuthSpans + count);
    if (!this._filteredSpanLogScheduler.isScheduled()) {
      this._filteredSpanLogScheduler.schedule();
    }
  }
  _logFilteredCodexAuthSpans() {
    if (this._pendingFilteredCodexAuthSpans === 0) {
      return;
    }
    this._logService.info(`[agentHost.otel] filtered ${this._pendingFilteredCodexAuthSpans} Codex 0.142 auth polling span(s); total=${this._totalFilteredCodexAuthSpans}`);
    this._pendingFilteredCodexAuthSpans = 0;
  }
  _canForwardSyntheticSpan() {
    return this._config.exporterType === "file" || this._config.exporterType === "console" || this._config.exporterType === "otlp-http" && this._config.otlpProtocol !== "http/protobuf";
  }
  _encodeOtlpSpan(span) {
    const resourceAttributeKeys = new Set(Object.keys(this._config.resourceAttributes));
    const attributes = Object.entries(span.attributes).filter(([key]) => !resourceAttributeKeys.has(key) || key === GenAiAttr.CONVERSATION_ID || key.startsWith("vscode.agent_host.")).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? { stringValue: value } : typeof value === "number" ? { doubleValue: value } : typeof value === "boolean" ? { boolValue: value } : { arrayValue: { values: value.map((item) => ({ stringValue: item })) } }
    }));
    const resourceAttributes = Object.entries(this._config.resourceAttributes).map(([key, value]) => ({ key, value: { stringValue: value } }));
    return Buffer.from(JSON.stringify({
      resourceSpans: [{
        ...resourceAttributes.length ? { resource: { attributes: resourceAttributes } } : {},
        scopeSpans: [{
          scope: { name: this._config.sourceName ?? "vscode.agent-host" },
          spans: [{
            traceId: span.traceId,
            spanId: span.spanId,
            ...span.parentSpanId ? { parentSpanId: span.parentSpanId } : {},
            name: span.name,
            kind: 1,
            startTimeUnixNano: `${span.startTime}000000`,
            endTimeUnixNano: `${span.endTime}000000`,
            attributes,
            status: { code: 1 }
          }]
        }]
      }]
    }), "utf8");
  }
  _buildOutboundForwarder() {
    const children = [];
    switch (this._config.exporterType) {
      case "otlp-http":
        if (this._config.otlpEndpoint && this._config.otlpProtocol !== "http/protobuf") {
          children.push(new OtlpHttpForwarder(
            {
              endpoint: this._config.otlpEndpoint,
              headers: this._config.headers
            },
            this._logService,
            this._fetchFn
          ));
        } else if (this._config.otlpEndpoint) {
          this._logService.warn("[agentHost.otel] DB trace fan-out is unavailable for OTLP/HTTP protobuf; traces remain in the local DB while provider logs and metrics export directly");
        }
        break;
      case "otlp-grpc":
        if (this._config.otlpEndpoint) {
          this._logService.warn("[agentHost.otel] DB trace fan-out is unavailable for OTLP/gRPC; traces remain in the local DB while provider logs and metrics export directly");
        }
        break;
      case "file":
        if (this._config.filePath) {
          children.push(new FileForwarder({ filePath: this._config.filePath }, this._logService));
        }
        break;
      case "console":
        children.push(new ConsoleForwarder(this._logService));
        break;
    }
    if (!children.length) {
      return void 0;
    }
    return children.length === 1 ? children[0] : new CompositeForwarder(children);
  }
};
AgentHostOTelService = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, INativeEnvironmentService)
], AgentHostOTelService);
export {
  AgentHostOTelService,
  normalizeAgentHostOtlpBody,
  readAgentHostOTelEnv
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxvdGVsXFxhZ2VudEhvc3RPVGVsU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1rZGlyIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB0eXBlIHsgVGVsZW1ldHJ5Q29uZmlnIH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHN0YXJ0TG9jYWxPdGxwSHR0cFJlY2VpdmVyLCB0eXBlIElMb2NhbE90bHBIdHRwUmVjZWl2ZXIgfSBmcm9tICcuLi8uLi8uLi9vdGVsL25vZGUvb3RscC9sb2NhbE90bHBSZWNlaXZlci5qcyc7XG5pbXBvcnQge1xuXHRDb21wb3NpdGVGb3J3YXJkZXIsXG5cdENvbnNvbGVGb3J3YXJkZXIsXG5cdEZpbGVGb3J3YXJkZXIsXG5cdE90bHBIdHRwRm9yd2FyZGVyLFxuXHR0eXBlIElPdXRib3VuZEZvcndhcmRlcixcbn0gZnJvbSAnLi4vLi4vLi4vb3RlbC9ub2RlL290bHAvb3V0Ym91bmRGb3J3YXJkZXIuanMnO1xuaW1wb3J0IHsgR2VuQWlBdHRyIH0gZnJvbSAnLi4vLi4vLi4vb3RlbC9jb21tb24vZ2VuQWlBdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElDb21wbGV0ZWRTcGFuRGF0YSwgU3BhblN0YXR1c0NvZGUgfSBmcm9tICcuLi8uLi8uLi9vdGVsL2NvbW1vbi9zcGFuRGF0YS5qcyc7XG5pbXBvcnQgeyBPVGVsU3FsaXRlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9vdGVsL25vZGUvc3FsaXRlL290ZWxTcWxpdGVTdG9yZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RPVGVsU3BhbnNEYlN1YlBhdGggfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdE9UZWxTZXJ2aWNlTmFtZSwgQWdlbnRIb3N0T1RlbFNlcnZpY2VOYW1lc3BhY2UsIEFnZW50SG9zdFNlc3Npb25TcGFuTmFtZSwgQWdlbnRIb3N0U2Vzc2lvblRpdGxlQXR0cmlidXRlLCBBZ2VudEhvc3RTZXNzaW9uVGl0bGVTcGFuTmFtZSwgQWdlbnRIb3N0U2Vzc2lvblVyaUF0dHJpYnV0ZSwgSUFnZW50SG9zdE5hdGl2ZU9UZWxDb25maWcsIElBZ2VudEhvc3RPVGVsU2VydmljZSwgSUFnZW50SG9zdFRyYWNlQ29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcblxuLyoqIFN1Yi1wYXRoIHVuZGVyIHRoZSB1c2VyIGRhdGEgZGlyZWN0b3J5IHdoZXJlIHRoZSBzcGFuIERCIGxpdmVzLiAqL1xuY29uc3QgU1BBTlNfREJfU1VCUEFUSCA9IEFnZW50SG9zdE9UZWxTcGFuc0RiU3ViUGF0aDtcblxuLyoqXG4gKiBFZmZlY3RpdmUgT1RlbCBjb25maWd1cmF0aW9uIHJlc29sdmVkIGZyb20gYHByb2Nlc3MuZW52YC4gU2V0dGluZ3MgXHUyMTkyIGVudiBjb252ZXJzaW9uXG4gKiBoYXBwZW5zIGluIHRoZSB3b3JrYmVuY2gtc2lkZSBhZ2VudC1ob3N0IHN0YXJ0ZXIgKHNlZSBgbm9kZUFnZW50SG9zdFN0YXJ0ZXIudHNgKTtcbiAqIHRoaXMgc2VydmljZSBvbmx5IGNvbnN1bWVzIGVudiBzbyBpdCBjYW4gc3RheSBkZWNvdXBsZWQgZnJvbSBjb25maWd1cmF0aW9uIHBsdW1iaW5nLlxuICovXG5pbnRlcmZhY2UgUmVzb2x2ZWRDb25maWcge1xuXHQvKiogVGVsZW1ldHJ5IGVuYWJsZWQgYXQgYWxsPyAqL1xuXHRyZWFkb25seSBlbmFibGVkOiBib29sZWFuO1xuXHQvKiogREIgbW9kZSAobG9vcGJhY2sgKyBTUUxpdGUpIHJlcXVlc3RlZD8gKi9cblx0cmVhZG9ubHkgZGJTcGFuRXhwb3J0ZXI6IGJvb2xlYW47XG5cdC8qKiBQYXNzLXRocm91Z2ggZXhwb3J0ZXIgdHlwZS4gKi9cblx0cmVhZG9ubHkgZXhwb3J0ZXJUeXBlOiAnb3RscC1odHRwJyB8ICdvdGxwLWdycGMnIHwgJ2NvbnNvbGUnIHwgJ2ZpbGUnO1xuXHQvKiogUGFzcy10aHJvdWdoIE9UTFAgZW5kcG9pbnQuICovXG5cdHJlYWRvbmx5IG90bHBFbmRwb2ludDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogUGFzcy10aHJvdWdoIGZpbGUgcGF0aCAoZmlsZSBleHBvcnRlcikuICovXG5cdHJlYWRvbmx5IGZpbGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBJbnN0cnVtZW50YXRpb24gc291cmNlL3NlcnZpY2UgbmFtZS4gKi9cblx0cmVhZG9ubHkgc291cmNlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogQ2FwdHVyZSBwcm9tcHQvcmVzcG9uc2UgY29udGVudCBpbiBzcGFucy4gKi9cblx0cmVhZG9ubHkgY2FwdHVyZUNvbnRlbnQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdC8qKiBQYXJzZWQgT1RFTF9FWFBPUlRFUl9PVExQX0hFQURFUlMgZm9yIG91dGJvdW5kIGZvcndhcmRpbmcuICovXG5cdHJlYWRvbmx5IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdC8qKiBFZmZlY3RpdmUgT1RMUCBwcm90b2NvbCBjb25maWd1cmVkIGZvciB0aGUgU0RLIHJ1bnRpbWUuICovXG5cdHJlYWRvbmx5IG90bHBQcm90b2NvbDogc3RyaW5nO1xuXHQvKiogUmVzb3VyY2UgYXR0cmlidXRlcyBhcHBsaWVkIHRvIGhvc3QtcHJvZHVjZWQgbWV0YWRhdGEgc3BhbnMuICovXG5cdHJlYWRvbmx5IHJlc291cmNlQXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuZnVuY3Rpb24gaXNUcnV0aHkodjogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmICghdikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBzID0gdi50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0cmV0dXJuIHMgPT09ICd0cnVlJyB8fCBzID09PSAnMScgfHwgcyA9PT0gJ3llcycgfHwgcyA9PT0gJ29uJztcbn1cblxuZnVuY3Rpb24gcGFyc2VPdGxwSGVhZGVycyhyYXc6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQge1xuXHRpZiAoIXJhdykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdGZvciAoY29uc3QgcGFpciBvZiByYXcuc3BsaXQoJywnKSkge1xuXHRcdGNvbnN0IGVxID0gcGFpci5pbmRleE9mKCc9Jyk7XG5cdFx0aWYgKGVxIDw9IDApIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCByYXdLZXkgPSBwYWlyLnNsaWNlKDAsIGVxKS50cmltKCk7XG5cdFx0Y29uc3QgcmF3VmFsdWUgPSBwYWlyLnNsaWNlKGVxICsgMSkudHJpbSgpO1xuXHRcdGlmIChyYXdLZXkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdG91dFtkZWNvZGVVUklDb21wb25lbnQocmF3S2V5KV0gPSBkZWNvZGVVUklDb21wb25lbnQocmF3VmFsdWUpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdG91dFtyYXdLZXldID0gcmF3VmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhvdXQpLmxlbmd0aCA/IG91dCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcGFyc2VSZXNvdXJjZUF0dHJpYnV0ZXMocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQsIHNlcnZpY2VOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcblx0Y29uc3QgYXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRmb3IgKGNvbnN0IHBhaXIgb2YgcmF3Py5zcGxpdCgnLCcpID8/IFtdKSB7XG5cdFx0Y29uc3QgZXEgPSBwYWlyLmluZGV4T2YoJz0nKTtcblx0XHRpZiAoZXEgPD0gMCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IHBhaXIuc2xpY2UoMCwgZXEpLnRyaW0oKTtcblx0XHRjb25zdCB2YWx1ZSA9IHBhaXIuc2xpY2UoZXEgKyAxKS50cmltKCk7XG5cdFx0aWYgKGtleSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXR0cmlidXRlc1trZXldID0gZGVjb2RlVVJJQ29tcG9uZW50KHZhbHVlKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRhdHRyaWJ1dGVzW2tleV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0YXR0cmlidXRlc1snc2VydmljZS5uYW1lc3BhY2UnXSA9IEFnZW50SG9zdE9UZWxTZXJ2aWNlTmFtZXNwYWNlO1xuXHRhdHRyaWJ1dGVzWydzZXJ2aWNlLm5hbWUnXSA9IHNlcnZpY2VOYW1lID8/IGF0dHJpYnV0ZXNbJ3NlcnZpY2UubmFtZSddID8/IEFnZW50SG9zdE9UZWxTZXJ2aWNlTmFtZTtcblx0cmV0dXJuIGF0dHJpYnV0ZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkQWdlbnRIb3N0T1RlbEVudihlbnY6IE5vZGVKUy5Qcm9jZXNzRW52KTogUmVzb2x2ZWRDb25maWcge1xuXHRjb25zdCBkYlNwYW5FeHBvcnRlciA9IGlzVHJ1dGh5KGVudi5DT1BJTE9UX09URUxfREJfU1BBTl9FWFBPUlRFUl9FTkFCTEVEKTtcblx0Y29uc3Qgb3RscEVuZHBvaW50ID0gZW52Lk9URUxfRVhQT1JURVJfT1RMUF9FTkRQT0lOVCA/PyBlbnYuQ09QSUxPVF9PVEVMX0VORFBPSU5UO1xuXHRjb25zdCBmaWxlUGF0aCA9IGVudi5DT1BJTE9UX09URUxfRklMRV9FWFBPUlRFUl9QQVRIO1xuXHRjb25zdCBleHBsaWNpdGx5RW5hYmxlZCA9IGlzVHJ1dGh5KGVudi5DT1BJTE9UX09URUxfRU5BQkxFRCk7XG5cdGNvbnN0IGVuYWJsZWQgPSBleHBsaWNpdGx5RW5hYmxlZCB8fCBkYlNwYW5FeHBvcnRlciB8fCAhIW90bHBFbmRwb2ludCB8fCAhIWZpbGVQYXRoO1xuXG5cdC8vIE1hcCB0aGUgT1RMUCBwcm90b2NvbCBlbnYgdmFyIG9udG8gb3VyIGZvdXIgdXNlci12aXNpYmxlIGV4cG9ydGVyIHR5cGVzLlxuXHRjb25zdCByYXdUeXBlID0gKGVudi5DT1BJTE9UX09URUxfRVhQT1JURVJfVFlQRSA/PyAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cdGNvbnN0IHByb3RvY29sID0gKGVudi5PVEVMX0VYUE9SVEVSX09UTFBfUFJPVE9DT0wgPz8gZW52LkNPUElMT1RfT1RFTF9QUk9UT0NPTCA/PyAnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cdGxldCBleHBvcnRlclR5cGU6IFJlc29sdmVkQ29uZmlnWydleHBvcnRlclR5cGUnXSA9ICdvdGxwLWh0dHAnO1xuXHRpZiAocmF3VHlwZSA9PT0gJ2NvbnNvbGUnIHx8IHJhd1R5cGUgPT09ICdmaWxlJyB8fCByYXdUeXBlID09PSAnb3RscC1ncnBjJyB8fCByYXdUeXBlID09PSAnb3RscC1odHRwJykge1xuXHRcdGV4cG9ydGVyVHlwZSA9IHJhd1R5cGU7XG5cdH0gZWxzZSBpZiAoZmlsZVBhdGgpIHtcblx0XHRleHBvcnRlclR5cGUgPSAnZmlsZSc7XG5cdH1cblx0aWYgKHByb3RvY29sID09PSAnZ3JwYycgfHwgcHJvdG9jb2wgPT09ICdodHRwL2dycGMnKSB7XG5cdFx0ZXhwb3J0ZXJUeXBlID0gJ290bHAtZ3JwYyc7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGVuYWJsZWQsXG5cdFx0ZGJTcGFuRXhwb3J0ZXIsXG5cdFx0ZXhwb3J0ZXJUeXBlLFxuXHRcdG90bHBFbmRwb2ludCxcblx0XHRmaWxlUGF0aCxcblx0XHRzb3VyY2VOYW1lOiBlbnYuQ09QSUxPVF9PVEVMX1NPVVJDRV9OQU1FLFxuXHRcdGNhcHR1cmVDb250ZW50OiBlbnYuT1RFTF9JTlNUUlVNRU5UQVRJT05fR0VOQUlfQ0FQVFVSRV9NRVNTQUdFX0NPTlRFTlQgPT09IHVuZGVmaW5lZFxuXHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdDogaXNUcnV0aHkoZW52Lk9URUxfSU5TVFJVTUVOVEFUSU9OX0dFTkFJX0NBUFRVUkVfTUVTU0FHRV9DT05URU5UKSxcblx0XHRoZWFkZXJzOiBwYXJzZU90bHBIZWFkZXJzKGVudi5PVEVMX0VYUE9SVEVSX09UTFBfSEVBREVSUyksXG5cdFx0b3RscFByb3RvY29sOiBwcm90b2NvbCxcblx0XHRyZXNvdXJjZUF0dHJpYnV0ZXM6IHBhcnNlUmVzb3VyY2VBdHRyaWJ1dGVzKGVudi5PVEVMX1JFU09VUkNFX0FUVFJJQlVURVMsIGVudi5PVEVMX1NFUlZJQ0VfTkFNRSksXG5cdH07XG59XG5cbmludGVyZmFjZSBJT3RscEF0dHJpYnV0ZSB7XG5cdGtleT86IHN0cmluZztcblx0dmFsdWU/OiB7IHN0cmluZ1ZhbHVlPzogc3RyaW5nIH07XG59XG5cbmludGVyZmFjZSBJT3RscFNwYW4ge1xuXHRuYW1lPzogc3RyaW5nO1xuXHRhdHRyaWJ1dGVzPzogSU90bHBBdHRyaWJ1dGVbXTtcbn1cblxuaW50ZXJmYWNlIElPdGxwU2NvcGVTcGFucyB7XG5cdHNwYW5zPzogSU90bHBTcGFuW107XG59XG5cbmludGVyZmFjZSBJT3RscFJlc291cmNlU3BhbnMge1xuXHRyZXNvdXJjZT86IHsgYXR0cmlidXRlcz86IElPdGxwQXR0cmlidXRlW10gfTtcblx0c2NvcGVTcGFucz86IElPdGxwU2NvcGVTcGFuc1tdO1xufVxuXG5pbnRlcmZhY2UgSU90bHBUcmFjZVBheWxvYWQge1xuXHRyZXNvdXJjZVNwYW5zPzogSU90bHBSZXNvdXJjZVNwYW5zW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vcm1hbGl6ZWRBZ2VudEhvc3RPdGxwQm9keSB7XG5cdHJlYWRvbmx5IGJvZHk6IEJ1ZmZlcjtcblx0cmVhZG9ubHkgZmlsdGVyZWRTcGFuQ291bnQ6IG51bWJlcjtcbn1cblxuY29uc3QgQ29kZXhBdXRoUG9sbGluZ1NlcnZpY2VOYW1lID0gJ2NvZGV4LWFwcC1zZXJ2ZXInO1xuY29uc3QgQ29kZXhBdXRoUG9sbGluZ1NwYW5OYW1lID0gJ2F1dGgnO1xuY29uc3QgQ29kZXhBdXRoUG9sbGluZ01vZHVsZU5hbWUgPSAnY29kZXhfbG9naW46OmF1dGg6Om1hbmFnZXInO1xuXG5mdW5jdGlvbiBhdHRyaWJ1dGVWYWx1ZShhdHRyaWJ1dGVzOiByZWFkb25seSBJT3RscEF0dHJpYnV0ZVtdIHwgdW5kZWZpbmVkLCBrZXk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBhdHRyaWJ1dGVzPy5maW5kKGF0dHJpYnV0ZSA9PiBhdHRyaWJ1dGUua2V5ID09PSBrZXkpPy52YWx1ZT8uc3RyaW5nVmFsdWU7XG59XG5cbmZ1bmN0aW9uIHVwc2VydFJlc291cmNlQXR0cmlidXRlKGF0dHJpYnV0ZXM6IElPdGxwQXR0cmlidXRlW10sIGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IGV4aXN0aW5nID0gYXR0cmlidXRlcy5maW5kKGF0dHJpYnV0ZSA9PiBhdHRyaWJ1dGUua2V5ID09PSBrZXkpO1xuXHRpZiAoZXhpc3RpbmcpIHtcblx0XHRleGlzdGluZy52YWx1ZSA9IHsgc3RyaW5nVmFsdWU6IHZhbHVlIH07XG5cdH0gZWxzZSB7XG5cdFx0YXR0cmlidXRlcy5wdXNoKHsga2V5LCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogdmFsdWUgfSB9KTtcblx0fVxufVxuXG4vKiogTm9ybWFsaXplIEFnZW50IEhvc3QgcmVzb3VyY2UgaWRlbnRpdHkgYW5kIHN1cHByZXNzIHRoZSBDb2RleCAwLjE0MiBhdXRoIHBvbGxpbmcgc3Bhbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVBZ2VudEhvc3RPdGxwQm9keShib2R5OiBCdWZmZXIpOiBJTm9ybWFsaXplZEFnZW50SG9zdE90bHBCb2R5IHtcblx0Y29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoYm9keS50b1N0cmluZygndXRmOCcpKSBhcyBJT3RscFRyYWNlUGF5bG9hZDtcblx0bGV0IGZpbHRlcmVkU3BhbkNvdW50ID0gMDtcblx0Zm9yIChjb25zdCByZXNvdXJjZVNwYW4gb2YgcGF5bG9hZC5yZXNvdXJjZVNwYW5zID8/IFtdKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSByZXNvdXJjZVNwYW4ucmVzb3VyY2UgPz89IHt9O1xuXHRcdGNvbnN0IHJlc291cmNlQXR0cmlidXRlcyA9IHJlc291cmNlLmF0dHJpYnV0ZXMgPz89IFtdO1xuXHRcdGNvbnN0IGlzQ29kZXggPSBhdHRyaWJ1dGVWYWx1ZShyZXNvdXJjZUF0dHJpYnV0ZXMsICdzZXJ2aWNlLm5hbWUnKSA9PT0gQ29kZXhBdXRoUG9sbGluZ1NlcnZpY2VOYW1lO1xuXHRcdHVwc2VydFJlc291cmNlQXR0cmlidXRlKHJlc291cmNlQXR0cmlidXRlcywgJ3NlcnZpY2UubmFtZXNwYWNlJywgQWdlbnRIb3N0T1RlbFNlcnZpY2VOYW1lc3BhY2UpO1xuXHRcdGZvciAoY29uc3Qgc2NvcGVTcGFucyBvZiByZXNvdXJjZVNwYW4uc2NvcGVTcGFucyA/PyBbXSkge1xuXHRcdFx0Y29uc3Qgc3BhbnMgPSBzY29wZVNwYW5zLnNwYW5zID8/IFtdO1xuXHRcdFx0c2NvcGVTcGFucy5zcGFucyA9IHNwYW5zLmZpbHRlcihzcGFuID0+IHtcblx0XHRcdFx0Y29uc3Qgc2hvdWxkRmlsdGVyID0gaXNDb2RleFxuXHRcdFx0XHRcdCYmIHNwYW4ubmFtZSA9PT0gQ29kZXhBdXRoUG9sbGluZ1NwYW5OYW1lXG5cdFx0XHRcdFx0JiYgYXR0cmlidXRlVmFsdWUoc3Bhbi5hdHRyaWJ1dGVzLCAnY29kZS5tb2R1bGUubmFtZScpID09PSBDb2RleEF1dGhQb2xsaW5nTW9kdWxlTmFtZTtcblx0XHRcdFx0aWYgKHNob3VsZEZpbHRlcikge1xuXHRcdFx0XHRcdGZpbHRlcmVkU3BhbkNvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuICFzaG91bGRGaWx0ZXI7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHsgYm9keTogQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkocGF5bG9hZCkpLCBmaWx0ZXJlZFNwYW5Db3VudCB9O1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0T1RlbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdE9UZWxTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWc6IFJlc29sdmVkQ29uZmlnO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zcGFuc0RiUGF0aDogc3RyaW5nO1xuXG5cdHByaXZhdGUgX3JlY2VpdmVyOiBJTG9jYWxPdGxwSHR0cFJlY2VpdmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zcGFuU3RvcmU6IE9UZWxTcWxpdGVTdG9yZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZm9yd2FyZGVyOiBJT3V0Ym91bmRGb3J3YXJkZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N0YXJ0UHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbWV0YWRhdGFFeHBvcnRRdWV1ZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uQ29udGV4dHMgPSBuZXcgTWFwPHN0cmluZywgSUFnZW50SG9zdFRyYWNlQ29udGV4dD4oKTtcblx0cHJpdmF0ZSBfY3VycmVudFRyYWNlQ29udGV4dDogSUFnZW50SG9zdFRyYWNlQ29udGV4dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGVuZGluZ0ZpbHRlcmVkQ29kZXhBdXRoU3BhbnMgPSAwO1xuXHRwcml2YXRlIF90b3RhbEZpbHRlcmVkQ29kZXhBdXRoU3BhbnMgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWx0ZXJlZFNwYW5Mb2dTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZmV0Y2hGbjogdHlwZW9mIGdsb2JhbFRoaXMuZmV0Y2ggfCB1bmRlZmluZWQsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9maWx0ZXJlZFNwYW5Mb2dTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9sb2dGaWx0ZXJlZENvZGV4QXV0aFNwYW5zKCksIDYwXzAwMCkpO1xuXHRcdHRoaXMuX2NvbmZpZyA9IHJlYWRBZ2VudEhvc3RPVGVsRW52KHByb2Nlc3MuZW52KTtcblx0XHR0aGlzLl9zcGFuc0RiUGF0aCA9IGpvaW4oZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCwgU1BBTlNfREJfU1VCUEFUSCk7XG5cdH1cblxuXHRhc3luYyBnZXRTZGtUZWxlbWV0cnlDb25maWcoKTogUHJvbWlzZTxUZWxlbWV0cnlDb25maWcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb25maWcuZGJTcGFuRXhwb3J0ZXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Vuc3VyZVN0YXJ0ZWQoKTtcblx0XHRcdGlmICghdGhpcy5fcmVjZWl2ZXIpIHtcblx0XHRcdFx0Ly8gU3RhcnQgZmFpbGVkOyB3ZSBhbHJlYWR5IGxvZ2dlZC4gRmFsbCB0aHJvdWdoIHRvIHBhc3MtdGhyb3VnaCBpZlxuXHRcdFx0XHQvLyB0aGUgdXNlciBhbHNvIGhhcyBhbiBleHRlcm5hbCBlbmRwb2ludCBjb25maWd1cmVkLlxuXHRcdFx0XHRpZiAoIXRoaXMuX2NvbmZpZy5vdGxwRW5kcG9pbnQgJiYgdGhpcy5fY29uZmlnLmV4cG9ydGVyVHlwZSAhPT0gJ2NvbnNvbGUnICYmICF0aGlzLl9jb25maWcuZmlsZVBhdGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYnVpbGRMb29wYmFja0NvbmZpZygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9idWlsZFBhc3N0aHJvdWdoQ29uZmlnKCk7XG5cdH1cblxuXHRhc3luYyBnZXROYXRpdmVTZGtUZWxlbWV0cnlDb25maWcoKTogUHJvbWlzZTxJQWdlbnRIb3N0TmF0aXZlT1RlbENvbmZpZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fY29uZmlnLmVuYWJsZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3RvY29sID0gdGhpcy5fY29uZmlnLm90bHBQcm90b2NvbCA9PT0gJ2dycGMnIHx8IHRoaXMuX2NvbmZpZy5vdGxwUHJvdG9jb2wgPT09ICdodHRwL2dycGMnXG5cdFx0XHQ/ICdncnBjJ1xuXHRcdFx0OiB0aGlzLl9jb25maWcub3RscFByb3RvY29sID09PSAnaHR0cC9wcm90b2J1ZicgPyAnaHR0cC9wcm90b2J1ZicgOiAnaHR0cC9qc29uJztcblx0XHRjb25zdCBleHRlcm5hbCA9IHRoaXMuX2NvbmZpZy5vdGxwRW5kcG9pbnQgPyB7XG5cdFx0XHRlbmRwb2ludDogdGhpcy5fY29uZmlnLm90bHBFbmRwb2ludCxcblx0XHRcdHByb3RvY29sLFxuXHRcdFx0Li4uKHRoaXMuX2NvbmZpZy5oZWFkZXJzID8geyBoZWFkZXJzOiB0aGlzLl9jb25maWcuaGVhZGVycyB9IDoge30pLFxuXHRcdH0gYXMgY29uc3QgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVzb3VyY2VBdHRyaWJ1dGVzID0geyAuLi50aGlzLl9jb25maWcucmVzb3VyY2VBdHRyaWJ1dGVzIH07XG5cdFx0ZGVsZXRlIHJlc291cmNlQXR0cmlidXRlc1snc2VydmljZS5uYW1lJ107XG5cdFx0cmVzb3VyY2VBdHRyaWJ1dGVzWydzZXJ2aWNlLm5hbWVzcGFjZSddID0gQWdlbnRIb3N0T1RlbFNlcnZpY2VOYW1lc3BhY2U7XG5cdFx0aWYgKCF0aGlzLl9jb25maWcuZGJTcGFuRXhwb3J0ZXIpIHtcblx0XHRcdHJldHVybiB7IHRyYWNlczogZXh0ZXJuYWwsIGV4dGVybmFsLCBjYXB0dXJlQ29udGVudDogdGhpcy5fY29uZmlnLmNhcHR1cmVDb250ZW50ID09PSB0cnVlLCByZXNvdXJjZUF0dHJpYnV0ZXMgfTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZW5zdXJlU3RhcnRlZCgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0cmFjZXM6IHRoaXMuX3JlY2VpdmVyID8geyBlbmRwb2ludDogYCR7dGhpcy5fcmVjZWl2ZXIuYmFzZVVybH0vdjEvdHJhY2VzYCwgcHJvdG9jb2w6ICdodHRwL2pzb24nIH0gOiBleHRlcm5hbCxcblx0XHRcdGV4dGVybmFsLFxuXHRcdFx0Y2FwdHVyZUNvbnRlbnQ6IHRoaXMuX2NvbmZpZy5jYXB0dXJlQ29udGVudCA9PT0gdHJ1ZSxcblx0XHRcdHJlc291cmNlQXR0cmlidXRlcyxcblx0XHR9O1xuXHR9XG5cblx0Z2V0U2Vzc2lvblRyYWNlQ29udGV4dChjb252ZXJzYXRpb25JZDogc3RyaW5nLCBzZXNzaW9uVXJpOiBzdHJpbmcpOiBJQWdlbnRIb3N0VHJhY2VDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZy5lbmFibGVkIHx8ICFjb252ZXJzYXRpb25JZCB8fCAhc2Vzc2lvblVyaSB8fCAoIXRoaXMuX2NvbmZpZy5kYlNwYW5FeHBvcnRlciAmJiAhdGhpcy5fY2FuRm9yd2FyZFN5bnRoZXRpY1NwYW4oKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbkNvbnRleHRzLmdldChzZXNzaW9uVXJpKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3QgdHJhY2VJZCA9IGdlbmVyYXRlVXVpZCgpLnJlcGxhY2VBbGwoJy0nLCAnJyk7XG5cdFx0Y29uc3Qgc3BhbklkID0gZ2VuZXJhdGVVdWlkKCkucmVwbGFjZUFsbCgnLScsICcnKS5zbGljZSgwLCAxNik7XG5cdFx0Y29uc3QgY29udGV4dDogSUFnZW50SG9zdFRyYWNlQ29udGV4dCA9IHsgdHJhY2VJZCwgc3BhbklkLCB0cmFjZXBhcmVudDogYDAwLSR7dHJhY2VJZH0tJHtzcGFuSWR9LTAxYCB9O1xuXHRcdHRoaXMuX3Nlc3Npb25Db250ZXh0cy5zZXQoc2Vzc2lvblVyaSwgY29udGV4dCk7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHR0aGlzLl9xdWV1ZVN5bnRoZXRpY1NwYW4oe1xuXHRcdFx0bmFtZTogQWdlbnRIb3N0U2Vzc2lvblNwYW5OYW1lLFxuXHRcdFx0dHJhY2VJZCxcblx0XHRcdHNwYW5JZCxcblx0XHRcdHN0YXJ0VGltZTogbm93LFxuXHRcdFx0ZW5kVGltZTogbm93LFxuXHRcdFx0c3RhdHVzOiB7IGNvZGU6IFNwYW5TdGF0dXNDb2RlLk9LIH0sXG5cdFx0XHRhdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdC4uLnRoaXMuX2NvbmZpZy5yZXNvdXJjZUF0dHJpYnV0ZXMsXG5cdFx0XHRcdFtHZW5BaUF0dHIuQ09OVkVSU0FUSU9OX0lEXTogY29udmVyc2F0aW9uSWQsXG5cdFx0XHRcdFtBZ2VudEhvc3RTZXNzaW9uVXJpQXR0cmlidXRlXTogc2Vzc2lvblVyaSxcblx0XHRcdH0sXG5cdFx0XHRldmVudHM6IFtdLFxuXHRcdH0pO1xuXHRcdHJldHVybiBjb250ZXh0O1xuXHR9XG5cblx0cmVsZWFzZVNlc3Npb25UcmFjZUNvbnRleHQoc2Vzc2lvblVyaTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbkNvbnRleHRzLmRlbGV0ZShzZXNzaW9uVXJpKTtcblx0fVxuXG5cdHdpdGhUcmFjZUNvbnRleHQ8VD4oY29udGV4dDogSUFnZW50SG9zdFRyYWNlQ29udGV4dCB8IHVuZGVmaW5lZCwgZm46ICgpID0+IFQpOiBUIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2N1cnJlbnRUcmFjZUNvbnRleHQ7XG5cdFx0dGhpcy5fY3VycmVudFRyYWNlQ29udGV4dCA9IGNvbnRleHQ7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFByb3ZpZGVyIFNES3MgcmVhZCB0aGVpciBjYWxsYmFjay1iYXNlZCB0cmFjZSBjYXJyaWVyIHN5bmNocm9ub3VzbHlcblx0XHRcdC8vIHdoaWxlIGNvbnN0cnVjdGluZyB0aGUgUlBDIHByb21pc2UuIERvIG5vdCByZXRhaW4gY29udGV4dCBmb3IgdGhlXG5cdFx0XHQvLyBsaWZldGltZSBvZiB0aGF0IHByb21pc2U6IGNvbmN1cnJlbnQgdHVybnMgbXVzdCBub3QgaW5oZXJpdCBpdC5cblx0XHRcdHJldHVybiBmbigpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50VHJhY2VDb250ZXh0ID0gcHJldmlvdXM7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q3VycmVudFRyYWNlQ29udGV4dCgpOiBJQWdlbnRIb3N0VHJhY2VDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudFRyYWNlQ29udGV4dDtcblx0fVxuXG5cdGdldFNwYW5zRGJQYXRoKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZy5kYlNwYW5FeHBvcnRlciA/IFVSSS5maWxlKHRoaXMuX3NwYW5zRGJQYXRoKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGVtaXRTZXNzaW9uVGl0bGVDaGFuZ2VkKGNvbnZlcnNhdGlvbklkOiBzdHJpbmcsIHNlc3Npb25Vcmk6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29uZmlnLmVuYWJsZWQgfHwgdGhpcy5fY29uZmlnLmNhcHR1cmVDb250ZW50ICE9PSB0cnVlIHx8ICFjb252ZXJzYXRpb25JZCB8fCAhdGl0bGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9jb25maWcuZGJTcGFuRXhwb3J0ZXIgJiYgIXRoaXMuX2NhbkZvcndhcmRTeW50aGV0aWNTcGFuKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBib3VuZGVkVGl0bGUgPSB0aXRsZS5zbGljZSgwLCAyMDApO1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLmdldFNlc3Npb25UcmFjZUNvbnRleHQoY29udmVyc2F0aW9uSWQsIHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fcXVldWVTeW50aGV0aWNTcGFuKHtcblx0XHRcdG5hbWU6IEFnZW50SG9zdFNlc3Npb25UaXRsZVNwYW5OYW1lLFxuXHRcdFx0dHJhY2VJZDogY29udGV4dD8udHJhY2VJZCA/PyBnZW5lcmF0ZVV1aWQoKS5yZXBsYWNlQWxsKCctJywgJycpLFxuXHRcdFx0c3BhbklkOiBnZW5lcmF0ZVV1aWQoKS5yZXBsYWNlQWxsKCctJywgJycpLnNsaWNlKDAsIDE2KSxcblx0XHRcdHBhcmVudFNwYW5JZDogY29udGV4dD8uc3BhbklkLFxuXHRcdFx0c3RhcnRUaW1lOiBub3csXG5cdFx0XHRlbmRUaW1lOiBub3csXG5cdFx0XHRzdGF0dXM6IHsgY29kZTogU3BhblN0YXR1c0NvZGUuT0sgfSxcblx0XHRcdGF0dHJpYnV0ZXM6IHtcblx0XHRcdFx0Li4udGhpcy5fY29uZmlnLnJlc291cmNlQXR0cmlidXRlcyxcblx0XHRcdFx0W0dlbkFpQXR0ci5DT05WRVJTQVRJT05fSURdOiBjb252ZXJzYXRpb25JZCxcblx0XHRcdFx0W0FnZW50SG9zdFNlc3Npb25UaXRsZUF0dHJpYnV0ZV06IGJvdW5kZWRUaXRsZSxcblx0XHRcdFx0W0FnZW50SG9zdFNlc3Npb25VcmlBdHRyaWJ1dGVdOiBzZXNzaW9uVXJpLFxuXHRcdFx0fSxcblx0XHRcdGV2ZW50czogW10sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBmbHVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9maWx0ZXJlZFNwYW5Mb2dTY2hlZHVsZXIuZmx1c2goKTtcblx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YUV4cG9ydFF1ZXVlO1xuXHRcdGF3YWl0IHRoaXMuX3N0YXJ0UHJvbWlzZTtcblx0XHRpZiAodGhpcy5fZm9yd2FyZGVyKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9mb3J3YXJkZXIuZmx1c2goKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZExvb3BiYWNrQ29uZmlnKCk6IFRlbGVtZXRyeUNvbmZpZyB7XG5cdFx0Ly8gSW4gREIgbW9kZSB3ZSBhbHdheXMgcG9pbnQgdGhlIFNESyBhdCBvdXIgbG9vcGJhY2sgT1RMUC9IVFRQIGVuZHBvaW50XG5cdFx0Ly8gcmVnYXJkbGVzcyBvZiB3aGF0IHRoZSB1c2VyIGNvbmZpZ3VyZWQgZXh0ZXJuYWxseSBcdTIwMTQgdGhlIHVzZXIncyBleHRlcm5hbFxuXHRcdC8vIHNpbmsgaXMgZmVkIGJ5IG91ciBvdXRib3VuZCBmb3J3YXJkZXIgaW5zdGVhZC4gVGhpcyBndWFyYW50ZWVzIHdlIGdldCBhXG5cdFx0Ly8gU1FMaXRlIG1pcnJvciBvZiBldmVyeSBzcGFuIHRoZSBhZ2VudCBlbWl0cy5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXhwb3J0ZXJUeXBlOiAnb3RscC1odHRwJyxcblx0XHRcdG90bHBFbmRwb2ludDogdGhpcy5fcmVjZWl2ZXIhLmJhc2VVcmwsXG5cdFx0XHRzb3VyY2VOYW1lOiB0aGlzLl9jb25maWcuc291cmNlTmFtZSxcblx0XHRcdGNhcHR1cmVDb250ZW50OiB0aGlzLl9jb25maWcuY2FwdHVyZUNvbnRlbnQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkUGFzc3Rocm91Z2hDb25maWcoKTogVGVsZW1ldHJ5Q29uZmlnIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXhwb3J0ZXJUeXBlOiB0aGlzLl9jb25maWcuZXhwb3J0ZXJUeXBlLFxuXHRcdFx0b3RscEVuZHBvaW50OiB0aGlzLl9jb25maWcub3RscEVuZHBvaW50LFxuXHRcdFx0ZmlsZVBhdGg6IHRoaXMuX2NvbmZpZy5maWxlUGF0aCxcblx0XHRcdHNvdXJjZU5hbWU6IHRoaXMuX2NvbmZpZy5zb3VyY2VOYW1lLFxuXHRcdFx0Y2FwdHVyZUNvbnRlbnQ6IHRoaXMuX2NvbmZpZy5jYXB0dXJlQ29udGVudCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlU3RhcnRlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3N0YXJ0UHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fc3RhcnRQcm9taXNlID0gdGhpcy5fc3RhcnQoKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbYWdlbnRIb3N0Lm90ZWxdIGZhaWxlZCB0byBzdGFydCBsb29wYmFjayBPVGVsIHBpcGVsaW5lJywgZXJyKTtcblx0XHRcdFx0Ly8gRHJvcCB0aGUgcmVjZWl2ZXIvc3RvcmUvZm9yd2FyZGVyIHNvIGdldFNka1RlbGVtZXRyeUNvbmZpZyBmYWxscyBiYWNrXG5cdFx0XHRcdC8vIHRvIHBhc3MtdGhyb3VnaCAob3IgdW5kZWZpbmVkKSBvbiBzdWJzZXF1ZW50IGNhbGxzLlxuXHRcdFx0XHR0aGlzLl9yZWNlaXZlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fZm9yd2FyZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zdGFydFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyAxLiBQZXJzaXN0ZW50IFNRTGl0ZSBzdG9yZS5cblx0XHRhd2FpdCBta2RpcihkaXJuYW1lKHRoaXMuX3NwYW5zRGJQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgT1RlbFNxbGl0ZVN0b3JlKHRoaXMuX3NwYW5zRGJQYXRoKTtcblx0XHR0aGlzLl9zcGFuU3RvcmUgPSBzdG9yZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0c3RvcmUuY2xvc2UoKTtcblx0XHRcdHRoaXMuX3NwYW5TdG9yZSA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cblx0XHQvLyAyLiBPcHRpb25hbCBvdXRib3VuZCBmb3J3YXJkZXIgd2hlbiB0aGUgdXNlciAqYWxzbyogd2FudHMgYW4gZXh0ZXJuYWwgc2luay5cblx0XHR0aGlzLl9mb3J3YXJkZXIgPSB0aGlzLl9idWlsZE91dGJvdW5kRm9yd2FyZGVyKCk7XG5cblx0XHQvLyAzLiBMb29wYmFjayBPVExQL0hUVFAgcmVjZWl2ZXIuXG5cdFx0Y29uc3QgcmVjZWl2ZXIgPSBhd2FpdCBzdGFydExvY2FsT3RscEh0dHBSZWNlaXZlcihcblx0XHRcdHtcblx0XHRcdFx0dHJhbnNmb3JtQm9keTogYm9keSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUFnZW50SG9zdE90bHBCb2R5KGJvZHkpO1xuXHRcdFx0XHRcdHRoaXMuX3JlY29yZEZpbHRlcmVkQ29kZXhBdXRoU3BhbnMobm9ybWFsaXplZC5maWx0ZXJlZFNwYW5Db3VudCk7XG5cdFx0XHRcdFx0cmV0dXJuIG5vcm1hbGl6ZWQuYm9keTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25TcGFuczogcmVzdWx0ID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNwYW4gb2YgcmVzdWx0LnNwYW5zKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRzdG9yZS5pbnNlcnRTcGFuKHNwYW4pO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW2FnZW50SG9zdC5vdGVsXSBmYWlsZWQgdG8gaW5zZXJ0IHNwYW4nLCBlcnIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBBbHNvIGZlZWQgZGVjb2RlZCBzcGFucyB0byBmb3J3YXJkZXJzIHRoYXQgY29uc3VtZSBJRGVjb2RlUmVzdWx0XG5cdFx0XHRcdFx0Ly8gKEZpbGVGb3J3YXJkZXIgLyBDb25zb2xlRm9yd2FyZGVyKS4gT1RMUC1zdHlsZSBmb3J3YXJkZXJzIGNvbnN1bWVcblx0XHRcdFx0XHQvLyB0aGUgcmF3IGJvZHkgdmlhIG9uRm9yd2FyZCBiZWxvdy5cblx0XHRcdFx0XHR0aGlzLl9mb3J3YXJkZXI/LmZvcndhcmRTcGFucz8uKHJlc3VsdCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uRm9yd2FyZDogdGhpcy5fZm9yd2FyZGVyID8gKGJvZHksIGNvbnRlbnRUeXBlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZm9yd2FyZGVyIS5mb3J3YXJkUmF3Py4oYm9keSwgY29udGVudFR5cGUpO1xuXHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UsXG5cdFx0KTtcblx0XHR0aGlzLl9yZWNlaXZlciA9IHJlY2VpdmVyO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlY2VpdmVyKTtcblx0XHRpZiAodGhpcy5fZm9yd2FyZGVyKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9mb3J3YXJkZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW2FnZW50SG9zdC5vdGVsXSBsb29wYmFjayByZWNlaXZlciBhdCAke3JlY2VpdmVyLmJhc2VVcmx9LCBkYiAke3RoaXMuX3NwYW5zRGJQYXRofWApO1xuXHR9XG5cblx0cHJpdmF0ZSBfcXVldWVTeW50aGV0aWNTcGFuKHNwYW46IElDb21wbGV0ZWRTcGFuRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX21ldGFkYXRhRXhwb3J0UXVldWUgPSB0aGlzLl9tZXRhZGF0YUV4cG9ydFF1ZXVlXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLl9lbWl0U3ludGhldGljU3BhbihzcGFuKSlcblx0XHRcdC5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKCdbYWdlbnRIb3N0Lm90ZWxdIGZhaWxlZCB0byBlbWl0IG1ldGFkYXRhIHNwYW4nLCBlcnIpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2VtaXRTeW50aGV0aWNTcGFuKHNwYW46IElDb21wbGV0ZWRTcGFuRGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9jb25maWcuZGJTcGFuRXhwb3J0ZXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Vuc3VyZVN0YXJ0ZWQoKTtcblx0XHR9IGVsc2UgaWYgKCF0aGlzLl9mb3J3YXJkZXIpIHtcblx0XHRcdHRoaXMuX2ZvcndhcmRlciA9IHRoaXMuX2J1aWxkT3V0Ym91bmRGb3J3YXJkZXIoKTtcblx0XHRcdGlmICh0aGlzLl9mb3J3YXJkZXIpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZm9yd2FyZGVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fc3BhblN0b3JlPy5pbnNlcnRTcGFuKHNwYW4pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbYWdlbnRIb3N0Lm90ZWxdIGZhaWxlZCB0byBwZXJzaXN0IHNlc3Npb24gdGl0bGUgc3BhbicsIGVycik7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IHsgc3BhbnM6IFtzcGFuXSwgcmVqZWN0ZWQ6IDAsIGVycm9yczogW10gfTtcblx0XHR0aGlzLl9mb3J3YXJkZXI/LmZvcndhcmRTcGFucz8uKHJlc3VsdCk7XG5cdFx0aWYgKHRoaXMuX2NhbkZvcndhcmRTeW50aGV0aWNTcGFuKCkpIHtcblx0XHRcdHRoaXMuX2ZvcndhcmRlcj8uZm9yd2FyZFJhdz8uKHRoaXMuX2VuY29kZU90bHBTcGFuKHNwYW4pLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZEZpbHRlcmVkQ29kZXhBdXRoU3BhbnMoY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChjb3VudCA8PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdGaWx0ZXJlZENvZGV4QXV0aFNwYW5zID0gTWF0aC5taW4oTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsIHRoaXMuX3BlbmRpbmdGaWx0ZXJlZENvZGV4QXV0aFNwYW5zICsgY291bnQpO1xuXHRcdHRoaXMuX3RvdGFsRmlsdGVyZWRDb2RleEF1dGhTcGFucyA9IE1hdGgubWluKE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCB0aGlzLl90b3RhbEZpbHRlcmVkQ29kZXhBdXRoU3BhbnMgKyBjb3VudCk7XG5cdFx0aWYgKCF0aGlzLl9maWx0ZXJlZFNwYW5Mb2dTY2hlZHVsZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0dGhpcy5fZmlsdGVyZWRTcGFuTG9nU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbG9nRmlsdGVyZWRDb2RleEF1dGhTcGFucygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ0ZpbHRlcmVkQ29kZXhBdXRoU3BhbnMgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbYWdlbnRIb3N0Lm90ZWxdIGZpbHRlcmVkICR7dGhpcy5fcGVuZGluZ0ZpbHRlcmVkQ29kZXhBdXRoU3BhbnN9IENvZGV4IDAuMTQyIGF1dGggcG9sbGluZyBzcGFuKHMpOyB0b3RhbD0ke3RoaXMuX3RvdGFsRmlsdGVyZWRDb2RleEF1dGhTcGFuc31gKTtcblx0XHR0aGlzLl9wZW5kaW5nRmlsdGVyZWRDb2RleEF1dGhTcGFucyA9IDA7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5Gb3J3YXJkU3ludGhldGljU3BhbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnLmV4cG9ydGVyVHlwZSA9PT0gJ2ZpbGUnXG5cdFx0XHR8fCB0aGlzLl9jb25maWcuZXhwb3J0ZXJUeXBlID09PSAnY29uc29sZSdcblx0XHRcdHx8ICh0aGlzLl9jb25maWcuZXhwb3J0ZXJUeXBlID09PSAnb3RscC1odHRwJyAmJiB0aGlzLl9jb25maWcub3RscFByb3RvY29sICE9PSAnaHR0cC9wcm90b2J1ZicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5jb2RlT3RscFNwYW4oc3BhbjogSUNvbXBsZXRlZFNwYW5EYXRhKTogQnVmZmVyIHtcblx0XHRjb25zdCByZXNvdXJjZUF0dHJpYnV0ZUtleXMgPSBuZXcgU2V0KE9iamVjdC5rZXlzKHRoaXMuX2NvbmZpZy5yZXNvdXJjZUF0dHJpYnV0ZXMpKTtcblx0XHRjb25zdCBhdHRyaWJ1dGVzID0gT2JqZWN0LmVudHJpZXMoc3Bhbi5hdHRyaWJ1dGVzKVxuXHRcdFx0LmZpbHRlcigoW2tleV0pID0+ICFyZXNvdXJjZUF0dHJpYnV0ZUtleXMuaGFzKGtleSkgfHwga2V5ID09PSBHZW5BaUF0dHIuQ09OVkVSU0FUSU9OX0lEIHx8IGtleS5zdGFydHNXaXRoKCd2c2NvZGUuYWdlbnRfaG9zdC4nKSlcblx0XHRcdC5tYXAoKFtrZXksIHZhbHVlXSkgPT4gKHtcblx0XHRcdFx0a2V5LFxuXHRcdFx0XHR2YWx1ZTogdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHsgc3RyaW5nVmFsdWU6IHZhbHVlIH1cblx0XHRcdFx0XHQ6IHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgPyB7IGRvdWJsZVZhbHVlOiB2YWx1ZSB9XG5cdFx0XHRcdFx0XHQ6IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nID8geyBib29sVmFsdWU6IHZhbHVlIH1cblx0XHRcdFx0XHRcdFx0OiB7IGFycmF5VmFsdWU6IHsgdmFsdWVzOiB2YWx1ZS5tYXAoaXRlbSA9PiAoeyBzdHJpbmdWYWx1ZTogaXRlbSB9KSkgfSB9LFxuXHRcdFx0fSkpO1xuXHRcdGNvbnN0IHJlc291cmNlQXR0cmlidXRlcyA9IE9iamVjdC5lbnRyaWVzKHRoaXMuX2NvbmZpZy5yZXNvdXJjZUF0dHJpYnV0ZXMpLm1hcCgoW2tleSwgdmFsdWVdKSA9PiAoeyBrZXksIHZhbHVlOiB7IHN0cmluZ1ZhbHVlOiB2YWx1ZSB9IH0pKTtcblx0XHRyZXR1cm4gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0cmVzb3VyY2VTcGFuczogW3tcblx0XHRcdFx0Li4uKHJlc291cmNlQXR0cmlidXRlcy5sZW5ndGggPyB7IHJlc291cmNlOiB7IGF0dHJpYnV0ZXM6IHJlc291cmNlQXR0cmlidXRlcyB9IH0gOiB7fSksXG5cdFx0XHRcdHNjb3BlU3BhbnM6IFt7XG5cdFx0XHRcdFx0c2NvcGU6IHsgbmFtZTogdGhpcy5fY29uZmlnLnNvdXJjZU5hbWUgPz8gJ3ZzY29kZS5hZ2VudC1ob3N0JyB9LFxuXHRcdFx0XHRcdHNwYW5zOiBbe1xuXHRcdFx0XHRcdFx0dHJhY2VJZDogc3Bhbi50cmFjZUlkLFxuXHRcdFx0XHRcdFx0c3BhbklkOiBzcGFuLnNwYW5JZCxcblx0XHRcdFx0XHRcdC4uLihzcGFuLnBhcmVudFNwYW5JZCA/IHsgcGFyZW50U3BhbklkOiBzcGFuLnBhcmVudFNwYW5JZCB9IDoge30pLFxuXHRcdFx0XHRcdFx0bmFtZTogc3Bhbi5uYW1lLFxuXHRcdFx0XHRcdFx0a2luZDogMSxcblx0XHRcdFx0XHRcdHN0YXJ0VGltZVVuaXhOYW5vOiBgJHtzcGFuLnN0YXJ0VGltZX0wMDAwMDBgLFxuXHRcdFx0XHRcdFx0ZW5kVGltZVVuaXhOYW5vOiBgJHtzcGFuLmVuZFRpbWV9MDAwMDAwYCxcblx0XHRcdFx0XHRcdGF0dHJpYnV0ZXMsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IHsgY29kZTogMSB9LFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dLFxuXHRcdH0pLCAndXRmOCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRPdXRib3VuZEZvcndhcmRlcigpOiBJT3V0Ym91bmRGb3J3YXJkZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNoaWxkcmVuOiBJT3V0Ym91bmRGb3J3YXJkZXJbXSA9IFtdO1xuXHRcdHN3aXRjaCAodGhpcy5fY29uZmlnLmV4cG9ydGVyVHlwZSkge1xuXHRcdFx0Y2FzZSAnb3RscC1odHRwJzpcblx0XHRcdFx0aWYgKHRoaXMuX2NvbmZpZy5vdGxwRW5kcG9pbnQgJiYgdGhpcy5fY29uZmlnLm90bHBQcm90b2NvbCAhPT0gJ2h0dHAvcHJvdG9idWYnKSB7XG5cdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaChuZXcgT3RscEh0dHBGb3J3YXJkZXIoXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGVuZHBvaW50OiB0aGlzLl9jb25maWcub3RscEVuZHBvaW50LFxuXHRcdFx0XHRcdFx0XHRoZWFkZXJzOiB0aGlzLl9jb25maWcuaGVhZGVycyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0dGhpcy5fZmV0Y2hGbixcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9jb25maWcub3RscEVuZHBvaW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbYWdlbnRIb3N0Lm90ZWxdIERCIHRyYWNlIGZhbi1vdXQgaXMgdW5hdmFpbGFibGUgZm9yIE9UTFAvSFRUUCBwcm90b2J1ZjsgdHJhY2VzIHJlbWFpbiBpbiB0aGUgbG9jYWwgREIgd2hpbGUgcHJvdmlkZXIgbG9ncyBhbmQgbWV0cmljcyBleHBvcnQgZGlyZWN0bHknKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ290bHAtZ3JwYyc6XG5cdFx0XHRcdGlmICh0aGlzLl9jb25maWcub3RscEVuZHBvaW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbYWdlbnRIb3N0Lm90ZWxdIERCIHRyYWNlIGZhbi1vdXQgaXMgdW5hdmFpbGFibGUgZm9yIE9UTFAvZ1JQQzsgdHJhY2VzIHJlbWFpbiBpbiB0aGUgbG9jYWwgREIgd2hpbGUgcHJvdmlkZXIgbG9ncyBhbmQgbWV0cmljcyBleHBvcnQgZGlyZWN0bHknKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2ZpbGUnOlxuXHRcdFx0XHRpZiAodGhpcy5fY29uZmlnLmZpbGVQYXRoKSB7XG5cdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaChuZXcgRmlsZUZvcndhcmRlcih7IGZpbGVQYXRoOiB0aGlzLl9jb25maWcuZmlsZVBhdGggfSwgdGhpcy5fbG9nU2VydmljZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnY29uc29sZSc6XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2gobmV3IENvbnNvbGVGb3J3YXJkZXIodGhpcy5fbG9nU2VydmljZSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0aWYgKCFjaGlsZHJlbi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBjaGlsZHJlbi5sZW5ndGggPT09IDEgPyBjaGlsZHJlblswXSA6IG5ldyBDb21wb3NpdGVGb3J3YXJkZXIoY2hpbGRyZW4pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsWUFBWTtBQUU5QixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUErRDtBQUN4RTtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUVNO0FBQ1AsU0FBUyxpQkFBaUI7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
