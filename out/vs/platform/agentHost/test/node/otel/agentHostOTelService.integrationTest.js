import { deepStrictEqual, notStrictEqual, ok, strictEqual } from "assert";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "../../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { INativeEnvironmentService } from "../../../../environment/common/environment.js";
import { TestInstantiationService } from "../../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../log/common/log.js";
import { OTelSqliteStore } from "../../../../otel/node/sqlite/otelSqliteStore.js";
import { OTLP_TRACES_PATH } from "../../../../otel/node/otlp/localOtlpReceiver.js";
import {
  OtlpSpanKind
} from "../../../../otel/node/otlp/otlpJsonTypes.js";
import { AgentHostSessionTitleAttribute, AgentHostSessionTitleSpanName, AgentHostSessionUriAttribute, IAgentHostOTelService } from "../../../common/otel/agentHostOTelService.js";
import { AgentHostOTelService, normalizeAgentHostOtlpBody, readAgentHostOTelEnv } from "../../../node/otel/agentHostOTelService.js";
import { AgentHostOTelSpansDbSubPath } from "../../../common/agentService.js";
async function postOtlp(endpoint, payload) {
  const httpModule = await import("http");
  const url = new URL(endpoint);
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  return new Promise((resolve, reject) => {
    const req = httpModule.request({
      host: url.hostname,
      port: Number(url.port),
      method: "POST",
      path: OTLP_TRACES_PATH,
      headers: {
        "content-type": "application/json",
        "content-length": String(body.length)
      }
    });
    req.on("response", (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        statusCode: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8")
      }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
function makeOtlpRequest(traceId, spanId) {
  const nowNs = `${Date.now()}000000`;
  const endNs = `${Date.now() + 500}000000`;
  return {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "agent-host-test" } }
        ]
      },
      scopeSpans: [{
        scope: { name: "github.copilot.agent" },
        spans: [{
          traceId,
          spanId,
          name: "invoke_agent copilotcli",
          kind: OtlpSpanKind.INTERNAL,
          startTimeUnixNano: nowNs,
          endTimeUnixNano: endNs,
          attributes: [
            { key: "gen_ai.operation.name", value: { stringValue: "invoke_agent" } },
            { key: "gen_ai.provider.name", value: { stringValue: "github.copilot" } },
            { key: "gen_ai.agent.name", value: { stringValue: "copilotcli" } },
            { key: "gen_ai.conversation.id", value: { stringValue: "conv-1" } },
            { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } }
          ]
        }]
      }]
    }]
  };
}
const OTEL_ENV_KEYS = [
  "COPILOT_OTEL_ENABLED",
  "COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED",
  "COPILOT_OTEL_EXPORTER_TYPE",
  "COPILOT_OTEL_ENDPOINT",
  "COPILOT_OTEL_FILE_EXPORTER_PATH",
  "COPILOT_OTEL_SOURCE_NAME",
  "COPILOT_OTEL_PROTOCOL",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT",
  "OTEL_RESOURCE_ATTRIBUTES",
  "OTEL_SERVICE_NAME"
];
function saveEnv() {
  const saved = {};
  for (const key of OTEL_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}
function restoreEnv(saved) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === void 0) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
function makeEnvService(userDataPath) {
  const env = { _serviceBrand: void 0, userDataPath };
  return env;
}
suite("platform/agentHost - AgentHostOTelService (integration)", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("readAgentHostOTelEnv: disabled when no relevant env vars are set", () => {
    const cfg = readAgentHostOTelEnv({});
    strictEqual(cfg.enabled, false);
    strictEqual(cfg.dbSpanExporter, false);
    strictEqual(cfg.exporterType, "otlp-http");
  });
  test("readAgentHostOTelEnv: db mode implies enabled", () => {
    const cfg = readAgentHostOTelEnv({ COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: "true" });
    strictEqual(cfg.enabled, true);
    strictEqual(cfg.dbSpanExporter, true);
  });
  test("readAgentHostOTelEnv: grpc aliases select the gRPC exporter type", () => {
    for (const protocol of ["grpc", "http/grpc"]) {
      const cfg = readAgentHostOTelEnv({
        COPILOT_OTEL_ENABLED: "true",
        COPILOT_OTEL_EXPORTER_TYPE: "otlp-http",
        OTEL_EXPORTER_OTLP_PROTOCOL: protocol
      });
      strictEqual(cfg.exporterType, "otlp-grpc");
    }
  });
  test("readAgentHostOTelEnv: parses headers and resource attributes", () => {
    const cfg = readAgentHostOTelEnv({
      COPILOT_OTEL_ENABLED: "true",
      OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20xyz,x-tenant=acme%2Fprod",
      OTEL_RESOURCE_ATTRIBUTES: "deployment.environment.name=dev,custom=value%20with%20spaces,service.name=ignored,service.namespace=foreign",
      OTEL_SERVICE_NAME: "agent-host"
    });
    deepStrictEqual({ headers: cfg.headers, resourceAttributes: cfg.resourceAttributes }, {
      headers: { authorization: "Bearer xyz", "x-tenant": "acme/prod" },
      resourceAttributes: {
        "deployment.environment.name": "dev",
        custom: "value with spaces",
        "service.name": "agent-host",
        "service.namespace": "vscode.agent-host"
      }
    });
  });
  test("normalizes resources and narrowly filters Codex 0.142 auth polling spans", () => {
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "codex-app-server" } },
              { key: "service.namespace", value: { stringValue: "foreign" } },
              { key: "deployment.environment.name", value: { stringValue: "test" } }
            ]
          },
          scopeSpans: [
            {
              spans: [
                { name: "auth", attributes: [{ key: "code.module.name", value: { stringValue: "codex_login::auth::manager" } }] },
                { name: "auth", attributes: [{ key: "code.module.name", value: { stringValue: "other::module" } }] },
                { name: "list_models", attributes: [] }
              ]
            },
            { spans: [] },
            { spans: [{ name: "auth", attributes: [{ key: "code.module.name", value: { stringValue: "codex_login::auth::manager" } }] }] }
          ]
        },
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "another-service" } }] },
          scopeSpans: [{ spans: [{ name: "auth", attributes: [{ key: "code.module.name", value: { stringValue: "codex_login::auth::manager" } }] }] }]
        },
        { resource: { attributes: [{ key: "custom", value: { stringValue: "kept" } }] }, scopeSpans: [] }
      ]
    };
    const normalized = normalizeAgentHostOtlpBody(Buffer.from(JSON.stringify(payload)));
    const result = JSON.parse(normalized.body.toString("utf8"));
    strictEqual(normalized.filteredSpanCount, 2);
    deepStrictEqual(result.resourceSpans[0].scopeSpans[0].spans.map((span) => span.name), ["auth", "list_models"]);
    deepStrictEqual(result.resourceSpans[0].scopeSpans[1].spans, []);
    deepStrictEqual(result.resourceSpans[0].scopeSpans[2].spans, []);
    strictEqual(result.resourceSpans[1].scopeSpans[0].spans.length, 1);
    ok(result.resourceSpans[0].resource.attributes.some((attribute) => attribute.key === "deployment.environment.name" && attribute.value.stringValue === "test"));
    ok(result.resourceSpans.every((resourceSpan) => resourceSpan.resource.attributes.some((attribute) => attribute.key === "service.namespace" && attribute.value.stringValue === "vscode.agent-host")));
  });
  test("getSdkTelemetryConfig: returns undefined when fully disabled", async () => {
    const saved = saveEnv();
    try {
      const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
      store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => void 0) });
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      di.set(IAgentHostOTelService, svc);
      strictEqual(await svc.getSdkTelemetryConfig(), void 0);
      strictEqual(svc.getSpansDbPath(), void 0);
    } finally {
      restoreEnv(saved);
    }
  });
  test("getSdkTelemetryConfig: pass-through mode returns user-configured exporter settings", async () => {
    const saved = saveEnv();
    try {
      process.env.COPILOT_OTEL_ENABLED = "true";
      process.env.COPILOT_OTEL_EXPORTER_TYPE = "console";
      process.env.COPILOT_OTEL_SOURCE_NAME = "agent-host";
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = "true";
      const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
      store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => void 0) });
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      const cfg = await svc.getSdkTelemetryConfig();
      ok(cfg, "expected a TelemetryConfig");
      strictEqual(cfg.exporterType, "console");
      strictEqual(cfg.sourceName, "agent-host");
      strictEqual(cfg.captureContent, true);
      strictEqual(svc.getSpansDbPath(), void 0);
    } finally {
      restoreEnv(saved);
    }
  });
  test("external-only unsupported synthetic protocols do not propagate a missing anchor", async () => {
    const saved = saveEnv();
    try {
      for (const protocol of ["http/protobuf", "grpc", "http/grpc"]) {
        process.env.COPILOT_OTEL_ENABLED = "true";
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector:4318";
        process.env.OTEL_EXPORTER_OTLP_PROTOCOL = protocol;
        const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
        store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => void 0) });
        const di = store.add(new TestInstantiationService());
        di.set(ILogService, new NullLogService());
        di.set(INativeEnvironmentService, makeEnvService(tmp));
        const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
        const config = await svc.getNativeSdkTelemetryConfig();
        strictEqual(config?.external?.protocol, protocol === "http/grpc" ? "grpc" : protocol);
        strictEqual(svc.getSessionTraceContext("conversation", `claude:/${protocol}`), void 0);
      }
    } finally {
      restoreEnv(saved);
    }
  });
  test("session trace contexts are stable until permanent release", () => {
    const saved = saveEnv();
    try {
      process.env.COPILOT_OTEL_ENABLED = "true";
      process.env.COPILOT_OTEL_EXPORTER_TYPE = "console";
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmpdir()));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      const first = svc.getSessionTraceContext("conversation", "claude:/conversation");
      strictEqual(svc.getSessionTraceContext("conversation", "claude:/conversation"), first);
      svc.releaseSessionTraceContext("claude:/conversation");
      notStrictEqual(svc.getSessionTraceContext("conversation", "claude:/conversation"), first);
    } finally {
      restoreEnv(saved);
    }
  });
  test("native SDK config splits DB traces from direct external signals", async () => {
    const saved = saveEnv();
    const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
    store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => void 0) });
    try {
      process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = "true";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector:4318";
      process.env.OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf";
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      const config = await svc.getNativeSdkTelemetryConfig();
      ok(config?.traces?.endpoint.startsWith("http://127.0.0.1:"));
      strictEqual(config?.traces?.protocol, "http/json");
      deepStrictEqual(config?.external, { endpoint: "http://collector:4318", protocol: "http/protobuf" });
      deepStrictEqual(config?.resourceAttributes, { "service.namespace": "vscode.agent-host" });
      const context = svc.getSessionTraceContext("conversation", "claude:/conversation");
      ok(context);
      strictEqual(context.traceparent, `00-${context.traceId}-${context.spanId}-01`);
      strictEqual(svc.withTraceContext(context, () => svc.getCurrentTraceContext()), context);
      strictEqual(svc.getCurrentTraceContext(), void 0);
    } finally {
      restoreEnv(saved);
    }
  });
  test("DB mode: starts loopback, persists posted spans to SQLite, and exposes db path", async () => {
    const saved = saveEnv();
    const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
    const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => void 0);
    try {
      process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = "true";
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      const cfg = await svc.getSdkTelemetryConfig();
      ok(cfg, "expected a TelemetryConfig");
      strictEqual(cfg.exporterType, "otlp-http");
      ok(cfg.otlpEndpoint?.startsWith("http://127.0.0.1:"), `expected loopback endpoint, got ${cfg.otlpEndpoint}`);
      const dbPath = svc.getSpansDbPath();
      ok(dbPath, "expected a db path in DB mode");
      ok(dbPath.fsPath.replace(/\\/g, "/").endsWith(AgentHostOTelSpansDbSubPath));
      const traceId = "1122334455667788aabbccddeeff0011";
      const spanIdA = "0000000000000001";
      const spanIdB = "0000000000000002";
      const res1 = await postOtlp(cfg.otlpEndpoint, makeOtlpRequest(traceId, spanIdA));
      strictEqual(res1.statusCode, 200, `unexpected res1: ${res1.body}`);
      const res2 = await postOtlp(cfg.otlpEndpoint, makeOtlpRequest(traceId, spanIdB));
      strictEqual(res2.statusCode, 200, `unexpected res2: ${res2.body}`);
      await svc.flush();
      const cfg2 = await svc.getSdkTelemetryConfig();
      strictEqual(cfg2.otlpEndpoint, cfg.otlpEndpoint);
      const reader = new OTelSqliteStore(dbPath.fsPath);
      try {
        const persisted = reader.getSpansByTraceId(traceId);
        strictEqual(persisted.length, 2, `expected 2 persisted spans, got ${persisted.length} (res1.body=${res1.body})`);
        const names = persisted.map((s) => s.name).sort();
        deepStrictEqual(names, ["invoke_agent copilotcli", "invoke_agent copilotcli"]);
        const operationNames = persisted.map((s) => s.operation_name);
        ok(operationNames.every((op) => op === "invoke_agent"));
        notStrictEqual(persisted[0].request_model, null);
      } finally {
        reader.close();
      }
    } finally {
      restoreEnv(saved);
      await cleanup();
    }
  });
  test("DB mode: emits session title metadata spans when content capture is enabled", async () => {
    const saved = saveEnv();
    const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
    const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => void 0);
    try {
      process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = "true";
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = "true";
      process.env.OTEL_SERVICE_NAME = "agent-host-test";
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      await svc.getSdkTelemetryConfig();
      svc.emitSessionTitleChanged("conv-title", "copilotcli:/conv-title", `Updated title ${"x".repeat(300)}`);
      await svc.flush();
      const dbPath = svc.getSpansDbPath();
      ok(dbPath);
      const reader = new OTelSqliteStore(dbPath.fsPath);
      try {
        const spans = reader.getSpansByConversationId("conv-title");
        strictEqual(spans.length, 2);
        const titleSpan = spans.find((span) => span.name === AgentHostSessionTitleSpanName);
        ok(titleSpan);
        strictEqual(reader.getSpanAttribute(titleSpan.span_id, AgentHostSessionTitleAttribute)?.length, 200);
        strictEqual(reader.getSpanAttribute(titleSpan.span_id, AgentHostSessionUriAttribute), "copilotcli:/conv-title");
        strictEqual(reader.getSpanAttribute(titleSpan.span_id, "service.name"), "agent-host-test");
        strictEqual(reader.getSpanAttribute(titleSpan.span_id, "service.namespace"), "vscode.agent-host");
      } finally {
        reader.close();
      }
    } finally {
      restoreEnv(saved);
      await cleanup();
    }
  });
  test("DB mode keeps protobuf and gRPC traces local instead of HTTP-posting the wrong wire format", async () => {
    const saved = saveEnv();
    try {
      for (const protocol of ["http/protobuf", "grpc"]) {
        process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = "true";
        process.env.COPILOT_OTEL_EXPORTER_TYPE = protocol === "grpc" ? "otlp-grpc" : "otlp-http";
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector:4318";
        process.env.OTEL_EXPORTER_OTLP_PROTOCOL = protocol;
        let fetchCalls = 0;
        const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
        store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => void 0) });
        const di = store.add(new TestInstantiationService());
        di.set(ILogService, new NullLogService());
        di.set(INativeEnvironmentService, makeEnvService(tmp));
        const svc = store.add(di.createInstance(AgentHostOTelService, async () => {
          fetchCalls++;
          return new Response(null, { status: 200 });
        }));
        const config = await svc.getSdkTelemetryConfig();
        const res = await postOtlp(config.otlpEndpoint, makeOtlpRequest("ffeeddccbbaa99887766554433221100", "00000000000000aa"));
        strictEqual(res.statusCode, 200);
        await svc.flush();
        strictEqual(fetchCalls, 0);
      }
    } finally {
      restoreEnv(saved);
    }
  });
  test("DB mode + external endpoint: outbound forwarder is configured (best-effort)", async () => {
    const saved = saveEnv();
    const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
    const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => void 0);
    try {
      process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = "true";
      process.env.COPILOT_OTEL_EXPORTER_TYPE = "otlp-http";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:1";
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      const cfg = await svc.getSdkTelemetryConfig();
      ok(cfg.otlpEndpoint?.startsWith("http://127.0.0.1:"));
      notStrictEqual(cfg.otlpEndpoint, process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
      const traceId = "ffeeddccbbaa99887766554433221100";
      const res = await postOtlp(cfg.otlpEndpoint, makeOtlpRequest(traceId, "00000000000000ff"));
      strictEqual(res.statusCode, 200);
      await svc.flush();
    } finally {
      restoreEnv(saved);
      await cleanup();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxvdGVsXFxhZ2VudEhvc3RPVGVsU2VydmljZS5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG5vdFN0cmljdEVxdWFsLCBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkdGVtcCwgcm0gfSBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgT1RlbFNxbGl0ZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vb3RlbC9ub2RlL3NxbGl0ZS9vdGVsU3FsaXRlU3RvcmUuanMnO1xuaW1wb3J0IHsgT1RMUF9UUkFDRVNfUEFUSCB9IGZyb20gJy4uLy4uLy4uLy4uL290ZWwvbm9kZS9vdGxwL2xvY2FsT3RscFJlY2VpdmVyLmpzJztcbmltcG9ydCB7XG5cdElPdGxwRXhwb3J0VHJhY2VTZXJ2aWNlUmVxdWVzdCxcblx0T3RscFNwYW5LaW5kLFxufSBmcm9tICcuLi8uLi8uLi8uLi9vdGVsL25vZGUvb3RscC9vdGxwSnNvblR5cGVzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25UaXRsZUF0dHJpYnV0ZSwgQWdlbnRIb3N0U2Vzc2lvblRpdGxlU3Bhbk5hbWUsIEFnZW50SG9zdFNlc3Npb25VcmlBdHRyaWJ1dGUsIElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdE9UZWxTZXJ2aWNlLCBub3JtYWxpemVBZ2VudEhvc3RPdGxwQm9keSwgcmVhZEFnZW50SG9zdE9UZWxFbnYgfSBmcm9tICcuLi8uLi8uLi9ub2RlL290ZWwvYWdlbnRIb3N0T1RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0T1RlbFNwYW5zRGJTdWJQYXRoIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJUG9zdFJlc3BvbnNlIHtcblx0c3RhdHVzQ29kZTogbnVtYmVyO1xuXHRib2R5OiBzdHJpbmc7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBvc3RPdGxwKGVuZHBvaW50OiBzdHJpbmcsIHBheWxvYWQ6IG9iamVjdCk6IFByb21pc2U8SVBvc3RSZXNwb25zZT4ge1xuXHRjb25zdCBodHRwTW9kdWxlID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdGNvbnN0IHVybCA9IG5ldyBVUkwoZW5kcG9pbnQpO1xuXHRjb25zdCBib2R5ID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksICd1dGY4Jyk7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxJUG9zdFJlc3BvbnNlPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgcmVxOiBodHRwLkNsaWVudFJlcXVlc3QgPSBodHRwTW9kdWxlLnJlcXVlc3Qoe1xuXHRcdFx0aG9zdDogdXJsLmhvc3RuYW1lLFxuXHRcdFx0cG9ydDogTnVtYmVyKHVybC5wb3J0KSxcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0cGF0aDogT1RMUF9UUkFDRVNfUEFUSCxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0J2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J2NvbnRlbnQtbGVuZ3RoJzogU3RyaW5nKGJvZHkubGVuZ3RoKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0cmVxLm9uKCdyZXNwb25zZScsIHJlcyA9PiB7XG5cdFx0XHRjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRyZXMub24oJ2RhdGEnLCAoY2h1bms6IEJ1ZmZlcikgPT4gY2h1bmtzLnB1c2goY2h1bmspKTtcblx0XHRcdHJlcy5vbignZW5kJywgKCkgPT4gcmVzb2x2ZSh7XG5cdFx0XHRcdHN0YXR1c0NvZGU6IHJlcy5zdGF0dXNDb2RlID8/IDAsXG5cdFx0XHRcdGJvZHk6IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygndXRmOCcpLFxuXHRcdFx0fSkpO1xuXHRcdFx0cmVzLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0fSk7XG5cdFx0cmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0cmVxLndyaXRlKGJvZHkpO1xuXHRcdHJlcS5lbmQoKTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIG1ha2VPdGxwUmVxdWVzdCh0cmFjZUlkOiBzdHJpbmcsIHNwYW5JZDogc3RyaW5nKTogSU90bHBFeHBvcnRUcmFjZVNlcnZpY2VSZXF1ZXN0IHtcblx0Ly8gVXNlIGEgY3VycmVudC10aW1lIHNwYW4gc28gdGhlIDctZGF5IHJldGVudGlvbiBzd2VlcCBydW4gd2hlbiBhIHNlY29uZFxuXHQvLyAocmVhZGVyKSBjb25uZWN0aW9uIG9wZW5zIGRvZXMgbm90IGRlbGV0ZSB0aGUgcm93LlxuXHRjb25zdCBub3dOcyA9IGAke0RhdGUubm93KCl9MDAwMDAwYDtcblx0Y29uc3QgZW5kTnMgPSBgJHtEYXRlLm5vdygpICsgNTAwfTAwMDAwMGA7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2VTcGFuczogW3tcblx0XHRcdHJlc291cmNlOiB7XG5cdFx0XHRcdGF0dHJpYnV0ZXM6IFtcblx0XHRcdFx0XHR7IGtleTogJ3NlcnZpY2UubmFtZScsIHZhbHVlOiB7IHN0cmluZ1ZhbHVlOiAnYWdlbnQtaG9zdC10ZXN0JyB9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0c2NvcGVTcGFuczogW3tcblx0XHRcdFx0c2NvcGU6IHsgbmFtZTogJ2dpdGh1Yi5jb3BpbG90LmFnZW50JyB9LFxuXHRcdFx0XHRzcGFuczogW3tcblx0XHRcdFx0XHR0cmFjZUlkLFxuXHRcdFx0XHRcdHNwYW5JZCxcblx0XHRcdFx0XHRuYW1lOiAnaW52b2tlX2FnZW50IGNvcGlsb3RjbGknLFxuXHRcdFx0XHRcdGtpbmQ6IE90bHBTcGFuS2luZC5JTlRFUk5BTCxcblx0XHRcdFx0XHRzdGFydFRpbWVVbml4TmFubzogbm93TnMsXG5cdFx0XHRcdFx0ZW5kVGltZVVuaXhOYW5vOiBlbmROcyxcblx0XHRcdFx0XHRhdHRyaWJ1dGVzOiBbXG5cdFx0XHRcdFx0XHR7IGtleTogJ2dlbl9haS5vcGVyYXRpb24ubmFtZScsIHZhbHVlOiB7IHN0cmluZ1ZhbHVlOiAnaW52b2tlX2FnZW50JyB9IH0sXG5cdFx0XHRcdFx0XHR7IGtleTogJ2dlbl9haS5wcm92aWRlci5uYW1lJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICdnaXRodWIuY29waWxvdCcgfSB9LFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdnZW5fYWkuYWdlbnQubmFtZScsIHZhbHVlOiB7IHN0cmluZ1ZhbHVlOiAnY29waWxvdGNsaScgfSB9LFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdnZW5fYWkuY29udmVyc2F0aW9uLmlkJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICdjb252LTEnIH0gfSxcblx0XHRcdFx0XHRcdHsga2V5OiAnZ2VuX2FpLnJlcXVlc3QubW9kZWwnLCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogJ2dwdC00bycgfSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fV0sXG5cdFx0fV0sXG5cdH07XG59XG5cbmludGVyZmFjZSBJU2F2ZWRFbnYge1xuXHRba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IE9URUxfRU5WX0tFWVMgPSBbXG5cdCdDT1BJTE9UX09URUxfRU5BQkxFRCcsXG5cdCdDT1BJTE9UX09URUxfREJfU1BBTl9FWFBPUlRFUl9FTkFCTEVEJyxcblx0J0NPUElMT1RfT1RFTF9FWFBPUlRFUl9UWVBFJyxcblx0J0NPUElMT1RfT1RFTF9FTkRQT0lOVCcsXG5cdCdDT1BJTE9UX09URUxfRklMRV9FWFBPUlRFUl9QQVRIJyxcblx0J0NPUElMT1RfT1RFTF9TT1VSQ0VfTkFNRScsXG5cdCdDT1BJTE9UX09URUxfUFJPVE9DT0wnLFxuXHQnT1RFTF9FWFBPUlRFUl9PVExQX0VORFBPSU5UJyxcblx0J09URUxfRVhQT1JURVJfT1RMUF9QUk9UT0NPTCcsXG5cdCdPVEVMX0VYUE9SVEVSX09UTFBfSEVBREVSUycsXG5cdCdPVEVMX0lOU1RSVU1FTlRBVElPTl9HRU5BSV9DQVBUVVJFX01FU1NBR0VfQ09OVEVOVCcsXG5cdCdPVEVMX1JFU09VUkNFX0FUVFJJQlVURVMnLFxuXHQnT1RFTF9TRVJWSUNFX05BTUUnLFxuXSBhcyBjb25zdDtcblxuZnVuY3Rpb24gc2F2ZUVudigpOiBJU2F2ZWRFbnYge1xuXHRjb25zdCBzYXZlZDogSVNhdmVkRW52ID0ge307XG5cdGZvciAoY29uc3Qga2V5IG9mIE9URUxfRU5WX0tFWVMpIHtcblx0XHRzYXZlZFtrZXldID0gcHJvY2Vzcy5lbnZba2V5XTtcblx0XHRkZWxldGUgcHJvY2Vzcy5lbnZba2V5XTtcblx0fVxuXHRyZXR1cm4gc2F2ZWQ7XG59XG5cbmZ1bmN0aW9uIHJlc3RvcmVFbnYoc2F2ZWQ6IElTYXZlZEVudik6IHZvaWQge1xuXHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhzYXZlZCkpIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVsZXRlIHByb2Nlc3MuZW52W2tleV07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByb2Nlc3MuZW52W2tleV0gPSB2YWx1ZTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gbWFrZUVudlNlcnZpY2UodXNlckRhdGFQYXRoOiBzdHJpbmcpOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHtcblx0Y29uc3QgZW52OiBQYXJ0aWFsPElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2U+ID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIHVzZXJEYXRhUGF0aCB9O1xuXHRyZXR1cm4gZW52IGFzIElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2U7XG59XG5cbnN1aXRlKCdwbGF0Zm9ybS9hZ2VudEhvc3QgLSBBZ2VudEhvc3RPVGVsU2VydmljZSAoaW50ZWdyYXRpb24pJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlYWRBZ2VudEhvc3RPVGVsRW52OiBkaXNhYmxlZCB3aGVuIG5vIHJlbGV2YW50IGVudiB2YXJzIGFyZSBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2ZnID0gcmVhZEFnZW50SG9zdE9UZWxFbnYoe30pO1xuXHRcdHN0cmljdEVxdWFsKGNmZy5lbmFibGVkLCBmYWxzZSk7XG5cdFx0c3RyaWN0RXF1YWwoY2ZnLmRiU3BhbkV4cG9ydGVyLCBmYWxzZSk7XG5cdFx0c3RyaWN0RXF1YWwoY2ZnLmV4cG9ydGVyVHlwZSwgJ290bHAtaHR0cCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkQWdlbnRIb3N0T1RlbEVudjogZGIgbW9kZSBpbXBsaWVzIGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2ZnID0gcmVhZEFnZW50SG9zdE9UZWxFbnYoeyBDT1BJTE9UX09URUxfREJfU1BBTl9FWFBPUlRFUl9FTkFCTEVEOiAndHJ1ZScgfSk7XG5cdFx0c3RyaWN0RXF1YWwoY2ZnLmVuYWJsZWQsIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKGNmZy5kYlNwYW5FeHBvcnRlciwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRBZ2VudEhvc3RPVGVsRW52OiBncnBjIGFsaWFzZXMgc2VsZWN0IHRoZSBnUlBDIGV4cG9ydGVyIHR5cGUnLCAoKSA9PiB7XG5cdFx0Zm9yIChjb25zdCBwcm90b2NvbCBvZiBbJ2dycGMnLCAnaHR0cC9ncnBjJ10pIHtcblx0XHRcdGNvbnN0IGNmZyA9IHJlYWRBZ2VudEhvc3RPVGVsRW52KHtcblx0XHRcdFx0Q09QSUxPVF9PVEVMX0VOQUJMRUQ6ICd0cnVlJyxcblx0XHRcdFx0Q09QSUxPVF9PVEVMX0VYUE9SVEVSX1RZUEU6ICdvdGxwLWh0dHAnLFxuXHRcdFx0XHRPVEVMX0VYUE9SVEVSX09UTFBfUFJPVE9DT0w6IHByb3RvY29sLFxuXHRcdFx0fSk7XG5cdFx0XHRzdHJpY3RFcXVhbChjZmcuZXhwb3J0ZXJUeXBlLCAnb3RscC1ncnBjJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWFkQWdlbnRIb3N0T1RlbEVudjogcGFyc2VzIGhlYWRlcnMgYW5kIHJlc291cmNlIGF0dHJpYnV0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2ZnID0gcmVhZEFnZW50SG9zdE9UZWxFbnYoe1xuXHRcdFx0Q09QSUxPVF9PVEVMX0VOQUJMRUQ6ICd0cnVlJyxcblx0XHRcdE9URUxfRVhQT1JURVJfT1RMUF9IRUFERVJTOiAnYXV0aG9yaXphdGlvbj1CZWFyZXIlMjB4eXoseC10ZW5hbnQ9YWNtZSUyRnByb2QnLFxuXHRcdFx0T1RFTF9SRVNPVVJDRV9BVFRSSUJVVEVTOiAnZGVwbG95bWVudC5lbnZpcm9ubWVudC5uYW1lPWRldixjdXN0b209dmFsdWUlMjB3aXRoJTIwc3BhY2VzLHNlcnZpY2UubmFtZT1pZ25vcmVkLHNlcnZpY2UubmFtZXNwYWNlPWZvcmVpZ24nLFxuXHRcdFx0T1RFTF9TRVJWSUNFX05BTUU6ICdhZ2VudC1ob3N0Jyxcblx0XHR9KTtcblx0XHRkZWVwU3RyaWN0RXF1YWwoeyBoZWFkZXJzOiBjZmcuaGVhZGVycywgcmVzb3VyY2VBdHRyaWJ1dGVzOiBjZmcucmVzb3VyY2VBdHRyaWJ1dGVzIH0sIHtcblx0XHRcdGhlYWRlcnM6IHsgYXV0aG9yaXphdGlvbjogJ0JlYXJlciB4eXonLCAneC10ZW5hbnQnOiAnYWNtZS9wcm9kJyB9LFxuXHRcdFx0cmVzb3VyY2VBdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdCdkZXBsb3ltZW50LmVudmlyb25tZW50Lm5hbWUnOiAnZGV2Jyxcblx0XHRcdFx0Y3VzdG9tOiAndmFsdWUgd2l0aCBzcGFjZXMnLFxuXHRcdFx0XHQnc2VydmljZS5uYW1lJzogJ2FnZW50LWhvc3QnLFxuXHRcdFx0XHQnc2VydmljZS5uYW1lc3BhY2UnOiAndnNjb2RlLmFnZW50LWhvc3QnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplcyByZXNvdXJjZXMgYW5kIG5hcnJvd2x5IGZpbHRlcnMgQ29kZXggMC4xNDIgYXV0aCBwb2xsaW5nIHNwYW5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBheWxvYWQgPSB7XG5cdFx0XHRyZXNvdXJjZVNwYW5zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyZXNvdXJjZToge1xuXHRcdFx0XHRcdFx0YXR0cmlidXRlczogW1xuXHRcdFx0XHRcdFx0XHR7IGtleTogJ3NlcnZpY2UubmFtZScsIHZhbHVlOiB7IHN0cmluZ1ZhbHVlOiAnY29kZXgtYXBwLXNlcnZlcicgfSB9LFxuXHRcdFx0XHRcdFx0XHR7IGtleTogJ3NlcnZpY2UubmFtZXNwYWNlJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICdmb3JlaWduJyB9IH0sXG5cdFx0XHRcdFx0XHRcdHsga2V5OiAnZGVwbG95bWVudC5lbnZpcm9ubWVudC5uYW1lJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICd0ZXN0JyB9IH0sXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzY29wZVNwYW5zOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHNwYW5zOiBbXG5cdFx0XHRcdFx0XHRcdFx0eyBuYW1lOiAnYXV0aCcsIGF0dHJpYnV0ZXM6IFt7IGtleTogJ2NvZGUubW9kdWxlLm5hbWUnLCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogJ2NvZGV4X2xvZ2luOjphdXRoOjptYW5hZ2VyJyB9IH1dIH0sXG5cdFx0XHRcdFx0XHRcdFx0eyBuYW1lOiAnYXV0aCcsIGF0dHJpYnV0ZXM6IFt7IGtleTogJ2NvZGUubW9kdWxlLm5hbWUnLCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogJ290aGVyOjptb2R1bGUnIH0gfV0gfSxcblx0XHRcdFx0XHRcdFx0XHR7IG5hbWU6ICdsaXN0X21vZGVscycsIGF0dHJpYnV0ZXM6IFtdIH0sXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7IHNwYW5zOiBbXSB9LFxuXHRcdFx0XHRcdFx0eyBzcGFuczogW3sgbmFtZTogJ2F1dGgnLCBhdHRyaWJ1dGVzOiBbeyBrZXk6ICdjb2RlLm1vZHVsZS5uYW1lJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICdjb2RleF9sb2dpbjo6YXV0aDo6bWFuYWdlcicgfSB9XSB9XSB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyZXNvdXJjZTogeyBhdHRyaWJ1dGVzOiBbeyBrZXk6ICdzZXJ2aWNlLm5hbWUnLCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogJ2Fub3RoZXItc2VydmljZScgfSB9XSB9LFxuXHRcdFx0XHRcdHNjb3BlU3BhbnM6IFt7IHNwYW5zOiBbeyBuYW1lOiAnYXV0aCcsIGF0dHJpYnV0ZXM6IFt7IGtleTogJ2NvZGUubW9kdWxlLm5hbWUnLCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogJ2NvZGV4X2xvZ2luOjphdXRoOjptYW5hZ2VyJyB9IH1dIH1dIH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IHJlc291cmNlOiB7IGF0dHJpYnV0ZXM6IFt7IGtleTogJ2N1c3RvbScsIHZhbHVlOiB7IHN0cmluZ1ZhbHVlOiAna2VwdCcgfSB9XSB9LCBzY29wZVNwYW5zOiBbXSB9LFxuXHRcdFx0XSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUFnZW50SG9zdE90bHBCb2R5KEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gSlNPTi5wYXJzZShub3JtYWxpemVkLmJvZHkudG9TdHJpbmcoJ3V0ZjgnKSkgYXMgdHlwZW9mIHBheWxvYWQ7XG5cdFx0c3RyaWN0RXF1YWwobm9ybWFsaXplZC5maWx0ZXJlZFNwYW5Db3VudCwgMik7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5yZXNvdXJjZVNwYW5zWzBdLnNjb3BlU3BhbnNbMF0uc3BhbnMubWFwKHNwYW4gPT4gc3Bhbi5uYW1lKSwgWydhdXRoJywgJ2xpc3RfbW9kZWxzJ10pO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChyZXN1bHQucmVzb3VyY2VTcGFuc1swXS5zY29wZVNwYW5zWzFdLnNwYW5zLCBbXSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5yZXNvdXJjZVNwYW5zWzBdLnNjb3BlU3BhbnNbMl0uc3BhbnMsIFtdKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQucmVzb3VyY2VTcGFuc1sxXS5zY29wZVNwYW5zWzBdLnNwYW5zLmxlbmd0aCwgMSk7XG5cdFx0b2socmVzdWx0LnJlc291cmNlU3BhbnNbMF0ucmVzb3VyY2UuYXR0cmlidXRlcy5zb21lKGF0dHJpYnV0ZSA9PiBhdHRyaWJ1dGUua2V5ID09PSAnZGVwbG95bWVudC5lbnZpcm9ubWVudC5uYW1lJyAmJiBhdHRyaWJ1dGUudmFsdWUuc3RyaW5nVmFsdWUgPT09ICd0ZXN0JykpO1xuXHRcdG9rKHJlc3VsdC5yZXNvdXJjZVNwYW5zLmV2ZXJ5KHJlc291cmNlU3BhbiA9PiByZXNvdXJjZVNwYW4ucmVzb3VyY2UuYXR0cmlidXRlcy5zb21lKGF0dHJpYnV0ZSA9PiBhdHRyaWJ1dGUua2V5ID09PSAnc2VydmljZS5uYW1lc3BhY2UnICYmIGF0dHJpYnV0ZS52YWx1ZS5zdHJpbmdWYWx1ZSA9PT0gJ3ZzY29kZS5hZ2VudC1ob3N0JykpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U2RrVGVsZW1ldHJ5Q29uZmlnOiByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGZ1bGx5IGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNhdmVkID0gc2F2ZUVudigpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0bXAgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICd2c2NvZGUtb3RlbC1zdmMtJykpO1xuXHRcdFx0c3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gdm9pZCBybSh0bXAsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpIH0pO1xuXG5cdFx0XHRjb25zdCBkaSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0ZGkuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSwgbWFrZUVudlNlcnZpY2UodG1wKSk7XG5cdFx0XHRjb25zdCBzdmMgPSBzdG9yZS5hZGQoZGkuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0T1RlbFNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXHRcdFx0ZGkuc2V0KElBZ2VudEhvc3RPVGVsU2VydmljZSwgc3ZjKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgc3ZjLmdldFNka1RlbGVtZXRyeUNvbmZpZygpLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc3ZjLmdldFNwYW5zRGJQYXRoKCksIHVuZGVmaW5lZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlc3RvcmVFbnYoc2F2ZWQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZ2V0U2RrVGVsZW1ldHJ5Q29uZmlnOiBwYXNzLXRocm91Z2ggbW9kZSByZXR1cm5zIHVzZXItY29uZmlndXJlZCBleHBvcnRlciBzZXR0aW5ncycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzYXZlZCA9IHNhdmVFbnYoKTtcblx0XHR0cnkge1xuXHRcdFx0cHJvY2Vzcy5lbnYuQ09QSUxPVF9PVEVMX0VOQUJMRUQgPSAndHJ1ZSc7XG5cdFx0XHRwcm9jZXNzLmVudi5DT1BJTE9UX09URUxfRVhQT1JURVJfVFlQRSA9ICdjb25zb2xlJztcblx0XHRcdHByb2Nlc3MuZW52LkNPUElMT1RfT1RFTF9TT1VSQ0VfTkFNRSA9ICdhZ2VudC1ob3N0Jztcblx0XHRcdHByb2Nlc3MuZW52Lk9URUxfSU5TVFJVTUVOVEFUSU9OX0dFTkFJX0NBUFRVUkVfTUVTU0FHRV9DT05URU5UID0gJ3RydWUnO1xuXG5cdFx0XHRjb25zdCB0bXAgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICd2c2NvZGUtb3RlbC1zdmMtJykpO1xuXHRcdFx0c3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gdm9pZCBybSh0bXAsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpIH0pO1xuXG5cdFx0XHRjb25zdCBkaSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0ZGkuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSwgbWFrZUVudlNlcnZpY2UodG1wKSk7XG5cdFx0XHRjb25zdCBzdmMgPSBzdG9yZS5hZGQoZGkuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0T1RlbFNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXG5cdFx0XHRjb25zdCBjZmcgPSBhd2FpdCBzdmMuZ2V0U2RrVGVsZW1ldHJ5Q29uZmlnKCk7XG5cdFx0XHRvayhjZmcsICdleHBlY3RlZCBhIFRlbGVtZXRyeUNvbmZpZycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2ZnIS5leHBvcnRlclR5cGUsICdjb25zb2xlJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjZmchLnNvdXJjZU5hbWUsICdhZ2VudC1ob3N0Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjZmchLmNhcHR1cmVDb250ZW50LCB0cnVlKTtcblx0XHRcdHN0cmljdEVxdWFsKHN2Yy5nZXRTcGFuc0RiUGF0aCgpLCB1bmRlZmluZWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXN0b3JlRW52KHNhdmVkKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dGVybmFsLW9ubHkgdW5zdXBwb3J0ZWQgc3ludGhldGljIHByb3RvY29scyBkbyBub3QgcHJvcGFnYXRlIGEgbWlzc2luZyBhbmNob3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2F2ZWQgPSBzYXZlRW52KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGZvciAoY29uc3QgcHJvdG9jb2wgb2YgWydodHRwL3Byb3RvYnVmJywgJ2dycGMnLCAnaHR0cC9ncnBjJ10pIHtcblx0XHRcdFx0cHJvY2Vzcy5lbnYuQ09QSUxPVF9PVEVMX0VOQUJMRUQgPSAndHJ1ZSc7XG5cdFx0XHRcdHByb2Nlc3MuZW52Lk9URUxfRVhQT1JURVJfT1RMUF9FTkRQT0lOVCA9ICdodHRwOi8vY29sbGVjdG9yOjQzMTgnO1xuXHRcdFx0XHRwcm9jZXNzLmVudi5PVEVMX0VYUE9SVEVSX09UTFBfUFJPVE9DT0wgPSBwcm90b2NvbDtcblx0XHRcdFx0Y29uc3QgdG1wID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAndnNjb2RlLW90ZWwtc3ZjLScpKTtcblx0XHRcdFx0c3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gdm9pZCBybSh0bXAsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpIH0pO1xuXHRcdFx0XHRjb25zdCBkaSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0XHRkaS5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdFx0ZGkuc2V0KElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsIG1ha2VFbnZTZXJ2aWNlKHRtcCkpO1xuXHRcdFx0XHRjb25zdCBzdmMgPSBzdG9yZS5hZGQoZGkuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0T1RlbFNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXHRcdFx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBzdmMuZ2V0TmF0aXZlU2RrVGVsZW1ldHJ5Q29uZmlnKCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGNvbmZpZz8uZXh0ZXJuYWw/LnByb3RvY29sLCBwcm90b2NvbCA9PT0gJ2h0dHAvZ3JwYycgPyAnZ3JwYycgOiBwcm90b2NvbCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHN2Yy5nZXRTZXNzaW9uVHJhY2VDb250ZXh0KCdjb252ZXJzYXRpb24nLCBgY2xhdWRlOi8ke3Byb3RvY29sfWApLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXN0b3JlRW52KHNhdmVkKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gdHJhY2UgY29udGV4dHMgYXJlIHN0YWJsZSB1bnRpbCBwZXJtYW5lbnQgcmVsZWFzZScsICgpID0+IHtcblx0XHRjb25zdCBzYXZlZCA9IHNhdmVFbnYoKTtcblx0XHR0cnkge1xuXHRcdFx0cHJvY2Vzcy5lbnYuQ09QSUxPVF9PVEVMX0VOQUJMRUQgPSAndHJ1ZSc7XG5cdFx0XHRwcm9jZXNzLmVudi5DT1BJTE9UX09URUxfRVhQT1JURVJfVFlQRSA9ICdjb25zb2xlJztcblx0XHRcdGNvbnN0IGRpID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGRpLnNldChJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBtYWtlRW52U2VydmljZSh0bXBkaXIoKSkpO1xuXHRcdFx0Y29uc3Qgc3ZjID0gc3RvcmUuYWRkKGRpLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdE9UZWxTZXJ2aWNlLCB1bmRlZmluZWQpKTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gc3ZjLmdldFNlc3Npb25UcmFjZUNvbnRleHQoJ2NvbnZlcnNhdGlvbicsICdjbGF1ZGU6L2NvbnZlcnNhdGlvbicpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc3ZjLmdldFNlc3Npb25UcmFjZUNvbnRleHQoJ2NvbnZlcnNhdGlvbicsICdjbGF1ZGU6L2NvbnZlcnNhdGlvbicpLCBmaXJzdCk7XG5cdFx0XHRzdmMucmVsZWFzZVNlc3Npb25UcmFjZUNvbnRleHQoJ2NsYXVkZTovY29udmVyc2F0aW9uJyk7XG5cdFx0XHRub3RTdHJpY3RFcXVhbChzdmMuZ2V0U2Vzc2lvblRyYWNlQ29udGV4dCgnY29udmVyc2F0aW9uJywgJ2NsYXVkZTovY29udmVyc2F0aW9uJyksIGZpcnN0KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVzdG9yZUVudihzYXZlZCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCduYXRpdmUgU0RLIGNvbmZpZyBzcGxpdHMgREIgdHJhY2VzIGZyb20gZGlyZWN0IGV4dGVybmFsIHNpZ25hbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2F2ZWQgPSBzYXZlRW52KCk7XG5cdFx0Y29uc3QgdG1wID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAndnNjb2RlLW90ZWwtc3ZjLScpKTtcblx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiB2b2lkIHJtKHRtcCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pLmNhdGNoKCgpID0+IHVuZGVmaW5lZCkgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdHByb2Nlc3MuZW52LkNPUElMT1RfT1RFTF9EQl9TUEFOX0VYUE9SVEVSX0VOQUJMRUQgPSAndHJ1ZSc7XG5cdFx0XHRwcm9jZXNzLmVudi5PVEVMX0VYUE9SVEVSX09UTFBfRU5EUE9JTlQgPSAnaHR0cDovL2NvbGxlY3Rvcjo0MzE4Jztcblx0XHRcdHByb2Nlc3MuZW52Lk9URUxfRVhQT1JURVJfT1RMUF9QUk9UT0NPTCA9ICdodHRwL3Byb3RvYnVmJztcblx0XHRcdGNvbnN0IGRpID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGRpLnNldChJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBtYWtlRW52U2VydmljZSh0bXApKTtcblx0XHRcdGNvbnN0IHN2YyA9IHN0b3JlLmFkZChkaS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RPVGVsU2VydmljZSwgdW5kZWZpbmVkKSk7XG5cblx0XHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IHN2Yy5nZXROYXRpdmVTZGtUZWxlbWV0cnlDb25maWcoKTtcblx0XHRcdG9rKGNvbmZpZz8udHJhY2VzPy5lbmRwb2ludC5zdGFydHNXaXRoKCdodHRwOi8vMTI3LjAuMC4xOicpKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbmZpZz8udHJhY2VzPy5wcm90b2NvbCwgJ2h0dHAvanNvbicpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGNvbmZpZz8uZXh0ZXJuYWwsIHsgZW5kcG9pbnQ6ICdodHRwOi8vY29sbGVjdG9yOjQzMTgnLCBwcm90b2NvbDogJ2h0dHAvcHJvdG9idWYnIH0pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGNvbmZpZz8ucmVzb3VyY2VBdHRyaWJ1dGVzLCB7ICdzZXJ2aWNlLm5hbWVzcGFjZSc6ICd2c2NvZGUuYWdlbnQtaG9zdCcgfSk7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gc3ZjLmdldFNlc3Npb25UcmFjZUNvbnRleHQoJ2NvbnZlcnNhdGlvbicsICdjbGF1ZGU6L2NvbnZlcnNhdGlvbicpO1xuXHRcdFx0b2soY29udGV4dCk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb250ZXh0LnRyYWNlcGFyZW50LCBgMDAtJHtjb250ZXh0LnRyYWNlSWR9LSR7Y29udGV4dC5zcGFuSWR9LTAxYCk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdmMud2l0aFRyYWNlQ29udGV4dChjb250ZXh0LCAoKSA9PiBzdmMuZ2V0Q3VycmVudFRyYWNlQ29udGV4dCgpKSwgY29udGV4dCk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdmMuZ2V0Q3VycmVudFRyYWNlQ29udGV4dCgpLCB1bmRlZmluZWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXN0b3JlRW52KHNhdmVkKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0RCIG1vZGU6IHN0YXJ0cyBsb29wYmFjaywgcGVyc2lzdHMgcG9zdGVkIHNwYW5zIHRvIFNRTGl0ZSwgYW5kIGV4cG9zZXMgZGIgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzYXZlZCA9IHNhdmVFbnYoKTtcblx0XHRjb25zdCB0bXAgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICd2c2NvZGUtb3RlbC1zdmMtJykpO1xuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiBybSh0bXAsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRwcm9jZXNzLmVudi5DT1BJTE9UX09URUxfREJfU1BBTl9FWFBPUlRFUl9FTkFCTEVEID0gJ3RydWUnO1xuXG5cdFx0XHRjb25zdCBkaSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0ZGkuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSwgbWFrZUVudlNlcnZpY2UodG1wKSk7XG5cdFx0XHRjb25zdCBzdmMgPSBzdG9yZS5hZGQoZGkuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0T1RlbFNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXG5cdFx0XHRjb25zdCBjZmcgPSBhd2FpdCBzdmMuZ2V0U2RrVGVsZW1ldHJ5Q29uZmlnKCk7XG5cdFx0XHRvayhjZmcsICdleHBlY3RlZCBhIFRlbGVtZXRyeUNvbmZpZycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2ZnIS5leHBvcnRlclR5cGUsICdvdGxwLWh0dHAnKTtcblx0XHRcdG9rKGNmZyEub3RscEVuZHBvaW50Py5zdGFydHNXaXRoKCdodHRwOi8vMTI3LjAuMC4xOicpLCBgZXhwZWN0ZWQgbG9vcGJhY2sgZW5kcG9pbnQsIGdvdCAke2NmZyEub3RscEVuZHBvaW50fWApO1xuXG5cdFx0XHRjb25zdCBkYlBhdGggPSBzdmMuZ2V0U3BhbnNEYlBhdGgoKTtcblx0XHRcdG9rKGRiUGF0aCwgJ2V4cGVjdGVkIGEgZGIgcGF0aCBpbiBEQiBtb2RlJyk7XG5cdFx0XHQvLyBOb3JtYWxpemUgc2VwYXJhdG9ycyBzaW5jZSBVUkkuZnNQYXRoIHVzZXMgJ1xcXFwnIG9uIFdpbmRvd3MgYnV0XG5cdFx0XHQvLyBBZ2VudEhvc3RPVGVsU3BhbnNEYlN1YlBhdGggaXMgZGVjbGFyZWQgd2l0aCBQT1NJWCBzZXBhcmF0b3JzLlxuXHRcdFx0b2soZGJQYXRoIS5mc1BhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpLmVuZHNXaXRoKEFnZW50SG9zdE9UZWxTcGFuc0RiU3ViUGF0aCkpO1xuXG5cdFx0XHQvLyBQb3N0IGEgdmFsaWQgT1RMUC9KU09OIHBheWxvYWQgdG8gdGhlIGxvb3BiYWNrIGVuZHBvaW50LlxuXHRcdFx0Y29uc3QgdHJhY2VJZCA9ICcxMTIyMzM0NDU1NjY3Nzg4YWFiYmNjZGRlZWZmMDAxMSc7XG5cdFx0XHRjb25zdCBzcGFuSWRBID0gJzAwMDAwMDAwMDAwMDAwMDEnO1xuXHRcdFx0Y29uc3Qgc3BhbklkQiA9ICcwMDAwMDAwMDAwMDAwMDAyJztcblx0XHRcdGNvbnN0IHJlczEgPSBhd2FpdCBwb3N0T3RscChjZmchLm90bHBFbmRwb2ludCEsIG1ha2VPdGxwUmVxdWVzdCh0cmFjZUlkLCBzcGFuSWRBKSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXMxLnN0YXR1c0NvZGUsIDIwMCwgYHVuZXhwZWN0ZWQgcmVzMTogJHtyZXMxLmJvZHl9YCk7XG5cdFx0XHRjb25zdCByZXMyID0gYXdhaXQgcG9zdE90bHAoY2ZnIS5vdGxwRW5kcG9pbnQhLCBtYWtlT3RscFJlcXVlc3QodHJhY2VJZCwgc3BhbklkQikpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzMi5zdGF0dXNDb2RlLCAyMDAsIGB1bmV4cGVjdGVkIHJlczI6ICR7cmVzMi5ib2R5fWApO1xuXG5cdFx0XHRhd2FpdCBzdmMuZmx1c2goKTtcblxuXHRcdFx0Ly8gQ2FsbGluZyBhZ2FpbiByZXR1cm5zIHRoZSBzYW1lIGxvb3BiYWNrIGVuZHBvaW50IChpZGVtcG90ZW50IHN0YXJ0KS5cblx0XHRcdGNvbnN0IGNmZzIgPSBhd2FpdCBzdmMuZ2V0U2RrVGVsZW1ldHJ5Q29uZmlnKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChjZmcyIS5vdGxwRW5kcG9pbnQsIGNmZyEub3RscEVuZHBvaW50KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHNwYW5zIGxhbmRlZCBpbiBTUUxpdGUgdmlhIGEgc2VwYXJhdGUgcmVhZC1vbmx5IGNvbm5lY3Rpb24uXG5cdFx0XHQvLyAoVGhlIHN0b3JlIGtlZXBzIHRoZSB3cml0ZXIgb3BlbiB3aXRoIFdBTDsgYSBwYXJhbGxlbCByZWFkZXIgaXMgc2FmZS4pXG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgT1RlbFNxbGl0ZVN0b3JlKGRiUGF0aCEuZnNQYXRoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBlcnNpc3RlZCA9IHJlYWRlci5nZXRTcGFuc0J5VHJhY2VJZCh0cmFjZUlkKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwocGVyc2lzdGVkLmxlbmd0aCwgMiwgYGV4cGVjdGVkIDIgcGVyc2lzdGVkIHNwYW5zLCBnb3QgJHtwZXJzaXN0ZWQubGVuZ3RofSAocmVzMS5ib2R5PSR7cmVzMS5ib2R5fSlgKTtcblx0XHRcdFx0Y29uc3QgbmFtZXMgPSBwZXJzaXN0ZWQubWFwKHMgPT4gcy5uYW1lKS5zb3J0KCk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChuYW1lcywgWydpbnZva2VfYWdlbnQgY29waWxvdGNsaScsICdpbnZva2VfYWdlbnQgY29waWxvdGNsaSddKTtcblx0XHRcdFx0Y29uc3Qgb3BlcmF0aW9uTmFtZXMgPSBwZXJzaXN0ZWQubWFwKHMgPT4gcy5vcGVyYXRpb25fbmFtZSk7XG5cdFx0XHRcdG9rKG9wZXJhdGlvbk5hbWVzLmV2ZXJ5KG9wID0+IG9wID09PSAnaW52b2tlX2FnZW50JykpO1xuXHRcdFx0XHRub3RTdHJpY3RFcXVhbChwZXJzaXN0ZWRbMF0ucmVxdWVzdF9tb2RlbCwgbnVsbCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRyZWFkZXIuY2xvc2UoKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVzdG9yZUVudihzYXZlZCk7XG5cdFx0XHRhd2FpdCBjbGVhbnVwKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdEQiBtb2RlOiBlbWl0cyBzZXNzaW9uIHRpdGxlIG1ldGFkYXRhIHNwYW5zIHdoZW4gY29udGVudCBjYXB0dXJlIGlzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2F2ZWQgPSBzYXZlRW52KCk7XG5cdFx0Y29uc3QgdG1wID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAndnNjb2RlLW90ZWwtc3ZjLScpKTtcblx0XHRjb25zdCBjbGVhbnVwID0gKCkgPT4gcm0odG1wLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHR0cnkge1xuXHRcdFx0cHJvY2Vzcy5lbnYuQ09QSUxPVF9PVEVMX0RCX1NQQU5fRVhQT1JURVJfRU5BQkxFRCA9ICd0cnVlJztcblx0XHRcdHByb2Nlc3MuZW52Lk9URUxfSU5TVFJVTUVOVEFUSU9OX0dFTkFJX0NBUFRVUkVfTUVTU0FHRV9DT05URU5UID0gJ3RydWUnO1xuXHRcdFx0cHJvY2Vzcy5lbnYuT1RFTF9TRVJWSUNFX05BTUUgPSAnYWdlbnQtaG9zdC10ZXN0JztcblxuXHRcdFx0Y29uc3QgZGkgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGRpLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0ZGkuc2V0KElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsIG1ha2VFbnZTZXJ2aWNlKHRtcCkpO1xuXHRcdFx0Y29uc3Qgc3ZjID0gc3RvcmUuYWRkKGRpLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdE9UZWxTZXJ2aWNlLCB1bmRlZmluZWQpKTtcblxuXHRcdFx0YXdhaXQgc3ZjLmdldFNka1RlbGVtZXRyeUNvbmZpZygpO1xuXHRcdFx0c3ZjLmVtaXRTZXNzaW9uVGl0bGVDaGFuZ2VkKCdjb252LXRpdGxlJywgJ2NvcGlsb3RjbGk6L2NvbnYtdGl0bGUnLCBgVXBkYXRlZCB0aXRsZSAkeyd4Jy5yZXBlYXQoMzAwKX1gKTtcblx0XHRcdGF3YWl0IHN2Yy5mbHVzaCgpO1xuXG5cdFx0XHRjb25zdCBkYlBhdGggPSBzdmMuZ2V0U3BhbnNEYlBhdGgoKTtcblx0XHRcdG9rKGRiUGF0aCk7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgT1RlbFNxbGl0ZVN0b3JlKGRiUGF0aCEuZnNQYXRoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNwYW5zID0gcmVhZGVyLmdldFNwYW5zQnlDb252ZXJzYXRpb25JZCgnY29udi10aXRsZScpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChzcGFucy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRjb25zdCB0aXRsZVNwYW4gPSBzcGFucy5maW5kKHNwYW4gPT4gc3Bhbi5uYW1lID09PSBBZ2VudEhvc3RTZXNzaW9uVGl0bGVTcGFuTmFtZSk7XG5cdFx0XHRcdG9rKHRpdGxlU3Bhbik7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHJlYWRlci5nZXRTcGFuQXR0cmlidXRlKHRpdGxlU3Bhbi5zcGFuX2lkLCBBZ2VudEhvc3RTZXNzaW9uVGl0bGVBdHRyaWJ1dGUpPy5sZW5ndGgsIDIwMCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHJlYWRlci5nZXRTcGFuQXR0cmlidXRlKHRpdGxlU3Bhbi5zcGFuX2lkLCBBZ2VudEhvc3RTZXNzaW9uVXJpQXR0cmlidXRlKSwgJ2NvcGlsb3RjbGk6L2NvbnYtdGl0bGUnKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwocmVhZGVyLmdldFNwYW5BdHRyaWJ1dGUodGl0bGVTcGFuLnNwYW5faWQsICdzZXJ2aWNlLm5hbWUnKSwgJ2FnZW50LWhvc3QtdGVzdCcpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChyZWFkZXIuZ2V0U3BhbkF0dHJpYnV0ZSh0aXRsZVNwYW4uc3Bhbl9pZCwgJ3NlcnZpY2UubmFtZXNwYWNlJyksICd2c2NvZGUuYWdlbnQtaG9zdCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVhZGVyLmNsb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlc3RvcmVFbnYoc2F2ZWQpO1xuXHRcdFx0YXdhaXQgY2xlYW51cCgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnREIgbW9kZSBrZWVwcyBwcm90b2J1ZiBhbmQgZ1JQQyB0cmFjZXMgbG9jYWwgaW5zdGVhZCBvZiBIVFRQLXBvc3RpbmcgdGhlIHdyb25nIHdpcmUgZm9ybWF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNhdmVkID0gc2F2ZUVudigpO1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3RvY29sIG9mIFsnaHR0cC9wcm90b2J1ZicsICdncnBjJ10pIHtcblx0XHRcdFx0cHJvY2Vzcy5lbnYuQ09QSUxPVF9PVEVMX0RCX1NQQU5fRVhQT1JURVJfRU5BQkxFRCA9ICd0cnVlJztcblx0XHRcdFx0cHJvY2Vzcy5lbnYuQ09QSUxPVF9PVEVMX0VYUE9SVEVSX1RZUEUgPSBwcm90b2NvbCA9PT0gJ2dycGMnID8gJ290bHAtZ3JwYycgOiAnb3RscC1odHRwJztcblx0XHRcdFx0cHJvY2Vzcy5lbnYuT1RFTF9FWFBPUlRFUl9PVExQX0VORFBPSU5UID0gJ2h0dHA6Ly9jb2xsZWN0b3I6NDMxOCc7XG5cdFx0XHRcdHByb2Nlc3MuZW52Lk9URUxfRVhQT1JURVJfT1RMUF9QUk9UT0NPTCA9IHByb3RvY29sO1xuXHRcdFx0XHRsZXQgZmV0Y2hDYWxscyA9IDA7XG5cdFx0XHRcdGNvbnN0IHRtcCA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ3ZzY29kZS1vdGVsLXN2Yy0nKSk7XG5cdFx0XHRcdHN0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHZvaWQgcm0odG1wLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKSB9KTtcblx0XHRcdFx0Y29uc3QgZGkgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdFx0ZGkuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRcdGRpLnNldChJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBtYWtlRW52U2VydmljZSh0bXApKTtcblx0XHRcdFx0Y29uc3Qgc3ZjID0gc3RvcmUuYWRkKGRpLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdE9UZWxTZXJ2aWNlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0ZmV0Y2hDYWxscysrO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UobnVsbCwgeyBzdGF0dXM6IDIwMCB9KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRjb25zdCBjb25maWcgPSBhd2FpdCBzdmMuZ2V0U2RrVGVsZW1ldHJ5Q29uZmlnKCk7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHBvc3RPdGxwKGNvbmZpZyEub3RscEVuZHBvaW50ISwgbWFrZU90bHBSZXF1ZXN0KCdmZmVlZGRjY2JiYWE5OTg4Nzc2NjU1NDQzMzIyMTEwMCcsICcwMDAwMDAwMDAwMDAwMGFhJykpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgMjAwKTtcblx0XHRcdFx0YXdhaXQgc3ZjLmZsdXNoKCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGZldGNoQ2FsbHMsIDApO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXN0b3JlRW52KHNhdmVkKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0RCIG1vZGUgKyBleHRlcm5hbCBlbmRwb2ludDogb3V0Ym91bmQgZm9yd2FyZGVyIGlzIGNvbmZpZ3VyZWQgKGJlc3QtZWZmb3J0KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzYXZlZCA9IHNhdmVFbnYoKTtcblx0XHRjb25zdCB0bXAgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICd2c2NvZGUtb3RlbC1zdmMtJykpO1xuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiBybSh0bXAsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRwcm9jZXNzLmVudi5DT1BJTE9UX09URUxfREJfU1BBTl9FWFBPUlRFUl9FTkFCTEVEID0gJ3RydWUnO1xuXHRcdFx0cHJvY2Vzcy5lbnYuQ09QSUxPVF9PVEVMX0VYUE9SVEVSX1RZUEUgPSAnb3RscC1odHRwJztcblx0XHRcdC8vIFBvaW50IHRoZSBmb3J3YXJkZXIgYXQgYW4gdW5yZWFjaGFibGUgcG9ydDsgdGhlIGZvcndhcmRlciBpcyBcImJlc3QtZWZmb3J0XCJcblx0XHRcdC8vIGFuZCBtdXN0IG5vdCBmYWlsIGluZ2VzdGlvbiB3aGVuIHRoZSBleHRlcm5hbCBzaW5rIGlzIGRvd24uXG5cdFx0XHRwcm9jZXNzLmVudi5PVEVMX0VYUE9SVEVSX09UTFBfRU5EUE9JTlQgPSAnaHR0cDovLzEyNy4wLjAuMToxJztcblxuXHRcdFx0Y29uc3QgZGkgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGRpLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0ZGkuc2V0KElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsIG1ha2VFbnZTZXJ2aWNlKHRtcCkpO1xuXHRcdFx0Y29uc3Qgc3ZjID0gc3RvcmUuYWRkKGRpLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdE9UZWxTZXJ2aWNlLCB1bmRlZmluZWQpKTtcblxuXHRcdFx0Y29uc3QgY2ZnID0gYXdhaXQgc3ZjLmdldFNka1RlbGVtZXRyeUNvbmZpZygpO1xuXHRcdFx0b2soY2ZnIS5vdGxwRW5kcG9pbnQ/LnN0YXJ0c1dpdGgoJ2h0dHA6Ly8xMjcuMC4wLjE6JykpO1xuXHRcdFx0Ly8gVGhlIFNESyBpcyBzdGlsbCBwb2ludGVkIGF0IG91ciBsb29wYmFjaywgbm90IHRoZSB1c2VyJ3MgZW5kcG9pbnQuXG5cdFx0XHRub3RTdHJpY3RFcXVhbChjZmchLm90bHBFbmRwb2ludCwgcHJvY2Vzcy5lbnYuT1RFTF9FWFBPUlRFUl9PVExQX0VORFBPSU5UKTtcblxuXHRcdFx0Y29uc3QgdHJhY2VJZCA9ICdmZmVlZGRjY2JiYWE5OTg4Nzc2NjU1NDQzMzIyMTEwMCc7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBwb3N0T3RscChjZmchLm90bHBFbmRwb2ludCEsIG1ha2VPdGxwUmVxdWVzdCh0cmFjZUlkLCAnMDAwMDAwMDAwMDAwMDBmZicpKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdFx0Ly8gZmx1c2goKSBhd2FpdHMgdGhlIGZvcndhcmRlciBRdWV1ZSBcdTIwMTQgbXVzdCBub3QgdGhyb3cgZXZlbiB0aG91Z2ggdGhlXG5cdFx0XHQvLyB1cHN0cmVhbSBpcyB1bnJlYWNoYWJsZS5cblx0XHRcdGF3YWl0IHN2Yy5mbHVzaCgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXN0b3JlRW52KHNhdmVkKTtcblx0XHRcdGF3YWl0IGNsZWFudXAoKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixnQkFBZ0IsSUFBSSxtQkFBbUI7QUFDakUsU0FBUyxTQUFTLFVBQVU7QUFFNUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsdUJBQXVCO0FBQ2hDLFNB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
