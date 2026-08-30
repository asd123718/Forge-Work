import { deepStrictEqual, ok, strictEqual } from "assert";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { AbstractLogger, LogLevel } from "../../../../log/common/log.js";
import { SpanStatusCode } from "../../../common/spanData.js";
import {
  CompositeForwarder,
  ConsoleForwarder,
  FileForwarder,
  OtlpHttpForwarder,
  resolveOtlpTracesEndpoint
} from "../../../node/otlp/outboundForwarder.js";
class CapturingLogger extends AbstractLogger {
  constructor() {
    super();
    this.messages = [];
    this.setLevel(LogLevel.Trace);
  }
  log(level, message) {
    this.messages.push({ level: LogLevel[level], msg: message });
  }
  trace(m) {
    this.log(LogLevel.Trace, m);
  }
  debug(m) {
    this.log(LogLevel.Debug, m);
  }
  info(m) {
    this.log(LogLevel.Info, m);
  }
  warn(m) {
    this.log(LogLevel.Warning, m);
  }
  error(m) {
    this.log(LogLevel.Error, m);
  }
  flush() {
  }
}
function makeSpan(name, spanId, attrs = {}) {
  return {
    name,
    spanId,
    traceId: "aabbccddeeff00112233445566778899",
    startTime: 17e11,
    endTime: 1700000000500,
    status: { code: SpanStatusCode.OK },
    attributes: attrs,
    events: []
  };
}
function makeResult(spans) {
  return { spans, rejected: 0, errors: [] };
}
async function startFakeUpstream(behavior = "ok") {
  const httpModule = await import("http");
  const received = [];
  const server = httpModule.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        body: Buffer.concat(chunks),
        contentType: (req.headers["content-type"] ?? "").toString(),
        auth: req.headers["authorization"]?.toString(),
        path: req.url ?? ""
      });
      if (behavior === "ok") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end("{}");
      } else {
        res.statusCode = 500;
        res.end("boom");
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = server.address().port;
  return {
    port,
    received,
    dispose: () => new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    })
  };
}
suite("platform/otel - outboundForwarder", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("OtlpHttpForwarder re-POSTs raw body with custom headers", async () => {
    const upstream = await startFakeUpstream();
    const logger = store.add(new CapturingLogger());
    const fwd = store.add(new OtlpHttpForwarder({
      endpoint: `http://127.0.0.1:${upstream.port}/v1/traces`,
      headers: { "authorization": "Bearer test-token" }
    }, logger));
    const body = Buffer.from('{"resourceSpans":[]}', "utf8");
    fwd.forwardRaw(body, "application/json");
    await fwd.flush();
    await upstream.dispose();
    strictEqual(upstream.received.length, 1);
    strictEqual(upstream.received[0].body.toString("utf8"), '{"resourceSpans":[]}');
    ok(upstream.received[0].contentType.includes("application/json"));
    strictEqual(upstream.received[0].auth, "Bearer test-token");
    strictEqual(logger.messages.filter((m) => m.level === "Warning").length, 0);
  });
  test("OtlpHttpForwarder uses supplied fetch with raw body and custom headers", async () => {
    const logger = store.add(new CapturingLogger());
    let captured;
    const fetchFn = async (input, init) => {
      captured = { input, init };
      return new Response(void 0, { status: 200 });
    };
    const fwd = store.add(new OtlpHttpForwarder({
      endpoint: "https://collector.example.com/v1/traces",
      headers: { authorization: "Bearer test-token" }
    }, logger, fetchFn));
    const body = Buffer.from([0, 1, 2, 255]);
    fwd.forwardRaw(body, "application/x-protobuf");
    await fwd.flush();
    deepStrictEqual({
      url: captured?.input,
      method: captured?.init?.method,
      contentType: new Headers(captured?.init?.headers).get("content-type"),
      contentLength: new Headers(captured?.init?.headers).get("content-length"),
      authorization: new Headers(captured?.init?.headers).get("authorization"),
      body: [...new Uint8Array(captured?.init?.body)]
    }, {
      url: "https://collector.example.com/v1/traces",
      method: "POST",
      contentType: "application/x-protobuf",
      contentLength: "4",
      authorization: "Bearer test-token",
      body: [0, 1, 2, 255]
    });
  });
  test("OtlpHttpForwarder logs warning on upstream 500 and does not throw", async () => {
    const upstream = await startFakeUpstream("fail");
    const logger = store.add(new CapturingLogger());
    const fwd = store.add(new OtlpHttpForwarder(
      { endpoint: `http://127.0.0.1:${upstream.port}/v1/traces` },
      logger
    ));
    fwd.forwardRaw(Buffer.from("{}"), "application/json");
    await fwd.flush();
    await upstream.dispose();
    ok(logger.messages.some((m) => m.level === "Warning" && m.msg.includes("500")));
  });
  test("OtlpHttpForwarder auto-appends /v1/traces to a bare base endpoint", async () => {
    const upstream = await startFakeUpstream();
    const logger = store.add(new CapturingLogger());
    const fwd = store.add(new OtlpHttpForwarder({
      endpoint: `http://127.0.0.1:${upstream.port}`
    }, logger));
    fwd.forwardRaw(Buffer.from("{}"), "application/json");
    await fwd.flush();
    await upstream.dispose();
    strictEqual(upstream.received.length, 1);
    strictEqual(upstream.received[0].path, "/v1/traces");
    strictEqual(logger.messages.filter((m) => m.level === "Warning").length, 0);
  });
  test("resolveOtlpTracesEndpoint appends path on base URL, leaves explicit path alone", () => {
    strictEqual(resolveOtlpTracesEndpoint("http://localhost:4318"), "http://localhost:4318/v1/traces");
    strictEqual(resolveOtlpTracesEndpoint("http://localhost:4318/"), "http://localhost:4318/v1/traces");
    strictEqual(resolveOtlpTracesEndpoint("http://localhost:4318/v1/traces"), "http://localhost:4318/v1/traces");
    strictEqual(resolveOtlpTracesEndpoint("http://localhost:4318/custom/path"), "http://localhost:4318/custom/path");
    strictEqual(resolveOtlpTracesEndpoint("not a url"), "not a url");
  });
  test("FileForwarder appends one JSON line per span", async () => {
    const path = join(tmpdir(), `vscode-otel-forwarder-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    const fwd = store.add(new FileForwarder({ filePath: path }, store.add(new CapturingLogger())));
    fwd.forwardSpans(makeResult([makeSpan("a", "1111111111111111"), makeSpan("b", "2222222222222222")]));
    fwd.forwardSpans(makeResult([makeSpan("c", "3333333333333333")]));
    await fwd.flush();
    const content = await fs.readFile(path, "utf8");
    await fs.unlink(path);
    const lines = content.split("\n").filter((l) => l.length > 0);
    strictEqual(lines.length, 3);
    deepStrictEqual(lines.map((l) => JSON.parse(l).name), ["a", "b", "c"]);
  });
  test("FileForwarder ignores empty result", async () => {
    const path = join(tmpdir(), `vscode-otel-forwarder-empty-${Date.now()}.jsonl`);
    const fwd = store.add(new FileForwarder({ filePath: path }, store.add(new CapturingLogger())));
    fwd.forwardSpans(makeResult([]));
    await fwd.flush();
    await fs.access(path).then(() => fs.unlink(path)).catch(() => void 0);
  });
  test("ConsoleForwarder logs one info per span", () => {
    const logger = store.add(new CapturingLogger());
    const fwd = store.add(new ConsoleForwarder(logger));
    fwd.forwardSpans(makeResult([
      makeSpan("invoke_agent copilot", "1111111111111111", { "gen_ai.operation.name": "invoke_agent", "gen_ai.request.model": "gpt-4o" })
    ]));
    const info = logger.messages.filter((m) => m.level === "Info");
    strictEqual(info.length, 1);
    ok(info[0].msg.includes("invoke_agent copilot"));
    ok(info[0].msg.includes("500ms"));
    ok(info[0].msg.includes("op=invoke_agent"));
    ok(info[0].msg.includes("model=gpt-4o"));
  });
  test("CompositeForwarder fans out forwardRaw and forwardSpans", async () => {
    const calls = [];
    const child = (name) => ({
      forwardRaw: () => {
        calls.push(`${name}.raw`);
      },
      forwardSpans: () => {
        calls.push(`${name}.spans`);
      },
      flush: async () => {
        calls.push(`${name}.flush`);
      },
      dispose: () => {
        calls.push(`${name}.dispose`);
      }
    });
    const a = child("a");
    const b = child("b");
    const composite = store.add(new CompositeForwarder([a, b]));
    composite.forwardRaw(Buffer.alloc(0), "application/json");
    composite.forwardSpans(makeResult([]));
    await composite.flush();
    deepStrictEqual(calls, [
      "a.raw",
      "b.raw",
      "a.spans",
      "b.spans",
      "a.flush",
      "b.flush"
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcb3RlbFxcdGVzdFxcbm9kZVxcb3RscFxcb3V0Ym91bmRGb3J3YXJkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHByb21pc2VzIGFzIGZzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHR5cGUgeyBBZGRyZXNzSW5mbyB9IGZyb20gJ25ldCc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFic3RyYWN0TG9nZ2VyLCBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ29tcGxldGVkU3BhbkRhdGEsIFNwYW5TdGF0dXNDb2RlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NwYW5EYXRhLmpzJztcbmltcG9ydCB7IElEZWNvZGVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9ub2RlL290bHAvb3RscEpzb25EZWNvZGUuanMnO1xuaW1wb3J0IHtcblx0Q29tcG9zaXRlRm9yd2FyZGVyLFxuXHRDb25zb2xlRm9yd2FyZGVyLFxuXHRGaWxlRm9yd2FyZGVyLFxuXHRPdGxwSHR0cEZvcndhcmRlcixcblx0cmVzb2x2ZU90bHBUcmFjZXNFbmRwb2ludCxcbn0gZnJvbSAnLi4vLi4vLi4vbm9kZS9vdGxwL291dGJvdW5kRm9yd2FyZGVyLmpzJztcblxuY2xhc3MgQ2FwdHVyaW5nTG9nZ2VyIGV4dGVuZHMgQWJzdHJhY3RMb2dnZXIgaW1wbGVtZW50cyBJTG9nU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWVzc2FnZXM6IHsgbGV2ZWw6IHN0cmluZzsgbXNnOiBzdHJpbmcgfVtdID0gW107XG5cdGNvbnN0cnVjdG9yKCkgeyBzdXBlcigpOyB0aGlzLnNldExldmVsKExvZ0xldmVsLlRyYWNlKTsgfVxuXHRsb2cobGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm1lc3NhZ2VzLnB1c2goeyBsZXZlbDogTG9nTGV2ZWxbbGV2ZWxdLCBtc2c6IG1lc3NhZ2UgfSk7XG5cdH1cblx0dHJhY2UobTogc3RyaW5nKSB7IHRoaXMubG9nKExvZ0xldmVsLlRyYWNlLCBtKTsgfVxuXHRkZWJ1ZyhtOiBzdHJpbmcpIHsgdGhpcy5sb2coTG9nTGV2ZWwuRGVidWcsIG0pOyB9XG5cdGluZm8obTogc3RyaW5nKSB7IHRoaXMubG9nKExvZ0xldmVsLkluZm8sIG0pOyB9XG5cdHdhcm4obTogc3RyaW5nKSB7IHRoaXMubG9nKExvZ0xldmVsLldhcm5pbmcsIG0pOyB9XG5cdGVycm9yKG06IHN0cmluZykgeyB0aGlzLmxvZyhMb2dMZXZlbC5FcnJvciwgbSk7IH1cblx0Zmx1c2goKSB7IC8qIG5vb3AgKi8gfVxufVxuXG5mdW5jdGlvbiBtYWtlU3BhbihuYW1lOiBzdHJpbmcsIHNwYW5JZDogc3RyaW5nLCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IHN0cmluZ1tdPiA9IHt9KTogSUNvbXBsZXRlZFNwYW5EYXRhIHtcblx0cmV0dXJuIHtcblx0XHRuYW1lLFxuXHRcdHNwYW5JZCxcblx0XHR0cmFjZUlkOiAnYWFiYmNjZGRlZWZmMDAxMTIyMzM0NDU1NjY3Nzg4OTknLFxuXHRcdHN0YXJ0VGltZTogMV83MDBfMDAwXzAwMF8wMDAsXG5cdFx0ZW5kVGltZTogMV83MDBfMDAwXzAwMF81MDAsXG5cdFx0c3RhdHVzOiB7IGNvZGU6IFNwYW5TdGF0dXNDb2RlLk9LIH0sXG5cdFx0YXR0cmlidXRlczogYXR0cnMsXG5cdFx0ZXZlbnRzOiBbXSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZVJlc3VsdChzcGFuczogSUNvbXBsZXRlZFNwYW5EYXRhW10pOiBJRGVjb2RlUmVzdWx0IHtcblx0cmV0dXJuIHsgc3BhbnMsIHJlamVjdGVkOiAwLCBlcnJvcnM6IFtdIH07XG59XG5cbmludGVyZmFjZSBJRmFrZVVwc3RyZWFtIHtcblx0cG9ydDogbnVtYmVyO1xuXHRyZWNlaXZlZDogeyBib2R5OiBCdWZmZXI7IGNvbnRlbnRUeXBlOiBzdHJpbmc7IGF1dGg/OiBzdHJpbmc7IHBhdGg6IHN0cmluZyB9W107XG5cdGRpc3Bvc2UoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc3RhcnRGYWtlVXBzdHJlYW0oYmVoYXZpb3I6ICdvaycgfCAnZmFpbCcgPSAnb2snKTogUHJvbWlzZTxJRmFrZVVwc3RyZWFtPiB7XG5cdGNvbnN0IGh0dHBNb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0Y29uc3QgcmVjZWl2ZWQ6IHsgYm9keTogQnVmZmVyOyBjb250ZW50VHlwZTogc3RyaW5nOyBhdXRoPzogc3RyaW5nOyBwYXRoOiBzdHJpbmcgfVtdID0gW107XG5cdGNvbnN0IHNlcnZlciA9IGh0dHBNb2R1bGUuY3JlYXRlU2VydmVyKChyZXEsIHJlcykgPT4ge1xuXHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRyZXEub24oJ2RhdGEnLCAoY2h1bms6IEJ1ZmZlcikgPT4gY2h1bmtzLnB1c2goY2h1bmspKTtcblx0XHRyZXEub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdHJlY2VpdmVkLnB1c2goe1xuXHRcdFx0XHRib2R5OiBCdWZmZXIuY29uY2F0KGNodW5rcyksXG5cdFx0XHRcdGNvbnRlbnRUeXBlOiAocmVxLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID8/ICcnKS50b1N0cmluZygpLFxuXHRcdFx0XHRhdXRoOiByZXEuaGVhZGVyc1snYXV0aG9yaXphdGlvbiddPy50b1N0cmluZygpLFxuXHRcdFx0XHRwYXRoOiByZXEudXJsID8/ICcnLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoYmVoYXZpb3IgPT09ICdvaycpIHtcblx0XHRcdFx0cmVzLnN0YXR1c0NvZGUgPSAyMDA7XG5cdFx0XHRcdHJlcy5zZXRIZWFkZXIoJ2NvbnRlbnQtdHlwZScsICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0XHRcdHJlcy5lbmQoJ3t9Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXMuc3RhdHVzQ29kZSA9IDUwMDtcblx0XHRcdFx0cmVzLmVuZCgnYm9vbScpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdHNlcnZlci5vbmNlKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0c2VydmVyLmxpc3RlbigwLCAnMTI3LjAuMC4xJywgKCkgPT4gcmVzb2x2ZSgpKTtcblx0fSk7XG5cdGNvbnN0IHBvcnQgPSAoc2VydmVyLmFkZHJlc3MoKSBhcyBBZGRyZXNzSW5mbykucG9ydDtcblx0cmV0dXJuIHtcblx0XHRwb3J0LFxuXHRcdHJlY2VpdmVkLFxuXHRcdGRpc3Bvc2U6ICgpID0+IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4geyBzZXJ2ZXIuY2xvc2VBbGxDb25uZWN0aW9ucygpOyBzZXJ2ZXIuY2xvc2UoKCkgPT4gcmVzb2x2ZSgpKTsgfSksXG5cdH07XG59XG5cbnN1aXRlKCdwbGF0Zm9ybS9vdGVsIC0gb3V0Ym91bmRGb3J3YXJkZXInLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnT3RscEh0dHBGb3J3YXJkZXIgcmUtUE9TVHMgcmF3IGJvZHkgd2l0aCBjdXN0b20gaGVhZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cHN0cmVhbSA9IGF3YWl0IHN0YXJ0RmFrZVVwc3RyZWFtKCk7XG5cdFx0Y29uc3QgbG9nZ2VyID0gc3RvcmUuYWRkKG5ldyBDYXB0dXJpbmdMb2dnZXIoKSk7XG5cdFx0Y29uc3QgZndkID0gc3RvcmUuYWRkKG5ldyBPdGxwSHR0cEZvcndhcmRlcih7XG5cdFx0XHRlbmRwb2ludDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt1cHN0cmVhbS5wb3J0fS92MS90cmFjZXNgLFxuXHRcdFx0aGVhZGVyczogeyAnYXV0aG9yaXphdGlvbic6ICdCZWFyZXIgdGVzdC10b2tlbicgfSxcblx0XHR9LCBsb2dnZXIpKTtcblxuXHRcdGNvbnN0IGJvZHkgPSBCdWZmZXIuZnJvbSgne1wicmVzb3VyY2VTcGFuc1wiOltdfScsICd1dGY4Jyk7XG5cdFx0ZndkLmZvcndhcmRSYXcoYm9keSwgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblx0XHRhd2FpdCBmd2QuZmx1c2goKTtcblx0XHRhd2FpdCB1cHN0cmVhbS5kaXNwb3NlKCk7XG5cblx0XHRzdHJpY3RFcXVhbCh1cHN0cmVhbS5yZWNlaXZlZC5sZW5ndGgsIDEpO1xuXHRcdHN0cmljdEVxdWFsKHVwc3RyZWFtLnJlY2VpdmVkWzBdLmJvZHkudG9TdHJpbmcoJ3V0ZjgnKSwgJ3tcInJlc291cmNlU3BhbnNcIjpbXX0nKTtcblx0XHRvayh1cHN0cmVhbS5yZWNlaXZlZFswXS5jb250ZW50VHlwZS5pbmNsdWRlcygnYXBwbGljYXRpb24vanNvbicpKTtcblx0XHRzdHJpY3RFcXVhbCh1cHN0cmVhbS5yZWNlaXZlZFswXS5hdXRoLCAnQmVhcmVyIHRlc3QtdG9rZW4nKTtcblx0XHRzdHJpY3RFcXVhbChsb2dnZXIubWVzc2FnZXMuZmlsdGVyKG0gPT4gbS5sZXZlbCA9PT0gJ1dhcm5pbmcnKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdPdGxwSHR0cEZvcndhcmRlciB1c2VzIHN1cHBsaWVkIGZldGNoIHdpdGggcmF3IGJvZHkgYW5kIGN1c3RvbSBoZWFkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ2dlciA9IHN0b3JlLmFkZChuZXcgQ2FwdHVyaW5nTG9nZ2VyKCkpO1xuXHRcdGxldCBjYXB0dXJlZDogeyBpbnB1dDogc3RyaW5nIHwgVVJMIHwgUmVxdWVzdDsgaW5pdD86IFJlcXVlc3RJbml0IH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZmV0Y2hGbjogdHlwZW9mIGdsb2JhbFRoaXMuZmV0Y2ggPSBhc3luYyAoaW5wdXQsIGluaXQpID0+IHtcblx0XHRcdGNhcHR1cmVkID0geyBpbnB1dCwgaW5pdCB9O1xuXHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZSh1bmRlZmluZWQsIHsgc3RhdHVzOiAyMDAgfSk7XG5cdFx0fTtcblx0XHRjb25zdCBmd2QgPSBzdG9yZS5hZGQobmV3IE90bHBIdHRwRm9yd2FyZGVyKHtcblx0XHRcdGVuZHBvaW50OiAnaHR0cHM6Ly9jb2xsZWN0b3IuZXhhbXBsZS5jb20vdjEvdHJhY2VzJyxcblx0XHRcdGhlYWRlcnM6IHsgYXV0aG9yaXphdGlvbjogJ0JlYXJlciB0ZXN0LXRva2VuJyB9LFxuXHRcdH0sIGxvZ2dlciwgZmV0Y2hGbikpO1xuXHRcdGNvbnN0IGJvZHkgPSBCdWZmZXIuZnJvbShbMCwgMSwgMiwgMjU1XSk7XG5cblx0XHRmd2QuZm9yd2FyZFJhdyhib2R5LCAnYXBwbGljYXRpb24veC1wcm90b2J1ZicpO1xuXHRcdGF3YWl0IGZ3ZC5mbHVzaCgpO1xuXG5cdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVybDogY2FwdHVyZWQ/LmlucHV0LFxuXHRcdFx0bWV0aG9kOiBjYXB0dXJlZD8uaW5pdD8ubWV0aG9kLFxuXHRcdFx0Y29udGVudFR5cGU6IG5ldyBIZWFkZXJzKGNhcHR1cmVkPy5pbml0Py5oZWFkZXJzKS5nZXQoJ2NvbnRlbnQtdHlwZScpLFxuXHRcdFx0Y29udGVudExlbmd0aDogbmV3IEhlYWRlcnMoY2FwdHVyZWQ/LmluaXQ/LmhlYWRlcnMpLmdldCgnY29udGVudC1sZW5ndGgnKSxcblx0XHRcdGF1dGhvcml6YXRpb246IG5ldyBIZWFkZXJzKGNhcHR1cmVkPy5pbml0Py5oZWFkZXJzKS5nZXQoJ2F1dGhvcml6YXRpb24nKSxcblx0XHRcdGJvZHk6IFsuLi5uZXcgVWludDhBcnJheShjYXB0dXJlZD8uaW5pdD8uYm9keSBhcyBBcnJheUJ1ZmZlcildLFxuXHRcdH0sIHtcblx0XHRcdHVybDogJ2h0dHBzOi8vY29sbGVjdG9yLmV4YW1wbGUuY29tL3YxL3RyYWNlcycsXG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24veC1wcm90b2J1ZicsXG5cdFx0XHRjb250ZW50TGVuZ3RoOiAnNCcsXG5cdFx0XHRhdXRob3JpemF0aW9uOiAnQmVhcmVyIHRlc3QtdG9rZW4nLFxuXHRcdFx0Ym9keTogWzAsIDEsIDIsIDI1NV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ090bHBIdHRwRm9yd2FyZGVyIGxvZ3Mgd2FybmluZyBvbiB1cHN0cmVhbSA1MDAgYW5kIGRvZXMgbm90IHRocm93JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVwc3RyZWFtID0gYXdhaXQgc3RhcnRGYWtlVXBzdHJlYW0oJ2ZhaWwnKTtcblx0XHRjb25zdCBsb2dnZXIgPSBzdG9yZS5hZGQobmV3IENhcHR1cmluZ0xvZ2dlcigpKTtcblx0XHRjb25zdCBmd2QgPSBzdG9yZS5hZGQobmV3IE90bHBIdHRwRm9yd2FyZGVyKFxuXHRcdFx0eyBlbmRwb2ludDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt1cHN0cmVhbS5wb3J0fS92MS90cmFjZXNgIH0sXG5cdFx0XHRsb2dnZXIsXG5cdFx0KSk7XG5cdFx0ZndkLmZvcndhcmRSYXcoQnVmZmVyLmZyb20oJ3t9JyksICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0YXdhaXQgZndkLmZsdXNoKCk7XG5cdFx0YXdhaXQgdXBzdHJlYW0uZGlzcG9zZSgpO1xuXHRcdG9rKGxvZ2dlci5tZXNzYWdlcy5zb21lKG0gPT4gbS5sZXZlbCA9PT0gJ1dhcm5pbmcnICYmIG0ubXNnLmluY2x1ZGVzKCc1MDAnKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdPdGxwSHR0cEZvcndhcmRlciBhdXRvLWFwcGVuZHMgL3YxL3RyYWNlcyB0byBhIGJhcmUgYmFzZSBlbmRwb2ludCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cHN0cmVhbSA9IGF3YWl0IHN0YXJ0RmFrZVVwc3RyZWFtKCk7XG5cdFx0Y29uc3QgbG9nZ2VyID0gc3RvcmUuYWRkKG5ldyBDYXB0dXJpbmdMb2dnZXIoKSk7XG5cdFx0Y29uc3QgZndkID0gc3RvcmUuYWRkKG5ldyBPdGxwSHR0cEZvcndhcmRlcih7XG5cdFx0XHRlbmRwb2ludDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt1cHN0cmVhbS5wb3J0fWAsXG5cdFx0fSwgbG9nZ2VyKSk7XG5cblx0XHRmd2QuZm9yd2FyZFJhdyhCdWZmZXIuZnJvbSgne30nKSwgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblx0XHRhd2FpdCBmd2QuZmx1c2goKTtcblx0XHRhd2FpdCB1cHN0cmVhbS5kaXNwb3NlKCk7XG5cblx0XHRzdHJpY3RFcXVhbCh1cHN0cmVhbS5yZWNlaXZlZC5sZW5ndGgsIDEpO1xuXHRcdHN0cmljdEVxdWFsKHVwc3RyZWFtLnJlY2VpdmVkWzBdLnBhdGgsICcvdjEvdHJhY2VzJyk7XG5cdFx0c3RyaWN0RXF1YWwobG9nZ2VyLm1lc3NhZ2VzLmZpbHRlcihtID0+IG0ubGV2ZWwgPT09ICdXYXJuaW5nJykubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZU90bHBUcmFjZXNFbmRwb2ludCBhcHBlbmRzIHBhdGggb24gYmFzZSBVUkwsIGxlYXZlcyBleHBsaWNpdCBwYXRoIGFsb25lJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKHJlc29sdmVPdGxwVHJhY2VzRW5kcG9pbnQoJ2h0dHA6Ly9sb2NhbGhvc3Q6NDMxOCcpLCAnaHR0cDovL2xvY2FsaG9zdDo0MzE4L3YxL3RyYWNlcycpO1xuXHRcdHN0cmljdEVxdWFsKHJlc29sdmVPdGxwVHJhY2VzRW5kcG9pbnQoJ2h0dHA6Ly9sb2NhbGhvc3Q6NDMxOC8nKSwgJ2h0dHA6Ly9sb2NhbGhvc3Q6NDMxOC92MS90cmFjZXMnKTtcblx0XHRzdHJpY3RFcXVhbChyZXNvbHZlT3RscFRyYWNlc0VuZHBvaW50KCdodHRwOi8vbG9jYWxob3N0OjQzMTgvdjEvdHJhY2VzJyksICdodHRwOi8vbG9jYWxob3N0OjQzMTgvdjEvdHJhY2VzJyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzb2x2ZU90bHBUcmFjZXNFbmRwb2ludCgnaHR0cDovL2xvY2FsaG9zdDo0MzE4L2N1c3RvbS9wYXRoJyksICdodHRwOi8vbG9jYWxob3N0OjQzMTgvY3VzdG9tL3BhdGgnKTtcblx0XHRzdHJpY3RFcXVhbChyZXNvbHZlT3RscFRyYWNlc0VuZHBvaW50KCdub3QgYSB1cmwnKSwgJ25vdCBhIHVybCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlRm9yd2FyZGVyIGFwcGVuZHMgb25lIEpTT04gbGluZSBwZXIgc3BhbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXRoID0gam9pbih0bXBkaXIoKSwgYHZzY29kZS1vdGVsLWZvcndhcmRlci0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9Lmpzb25sYCk7XG5cdFx0Y29uc3QgZndkID0gc3RvcmUuYWRkKG5ldyBGaWxlRm9yd2FyZGVyKHsgZmlsZVBhdGg6IHBhdGggfSwgc3RvcmUuYWRkKG5ldyBDYXB0dXJpbmdMb2dnZXIoKSkpKTtcblx0XHRmd2QuZm9yd2FyZFNwYW5zKG1ha2VSZXN1bHQoW21ha2VTcGFuKCdhJywgJzExMTExMTExMTExMTExMTEnKSwgbWFrZVNwYW4oJ2InLCAnMjIyMjIyMjIyMjIyMjIyMicpXSkpO1xuXHRcdGZ3ZC5mb3J3YXJkU3BhbnMobWFrZVJlc3VsdChbbWFrZVNwYW4oJ2MnLCAnMzMzMzMzMzMzMzMzMzMzMycpXSkpO1xuXHRcdGF3YWl0IGZ3ZC5mbHVzaCgpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZzLnJlYWRGaWxlKHBhdGgsICd1dGY4Jyk7XG5cdFx0YXdhaXQgZnMudW5saW5rKHBhdGgpO1xuXHRcdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGwgPT4gbC5sZW5ndGggPiAwKTtcblx0XHRzdHJpY3RFcXVhbChsaW5lcy5sZW5ndGgsIDMpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChsaW5lcy5tYXAobCA9PiBKU09OLnBhcnNlKGwpLm5hbWUpLCBbJ2EnLCAnYicsICdjJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlRm9yd2FyZGVyIGlnbm9yZXMgZW1wdHkgcmVzdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhdGggPSBqb2luKHRtcGRpcigpLCBgdnNjb2RlLW90ZWwtZm9yd2FyZGVyLWVtcHR5LSR7RGF0ZS5ub3coKX0uanNvbmxgKTtcblx0XHRjb25zdCBmd2QgPSBzdG9yZS5hZGQobmV3IEZpbGVGb3J3YXJkZXIoeyBmaWxlUGF0aDogcGF0aCB9LCBzdG9yZS5hZGQobmV3IENhcHR1cmluZ0xvZ2dlcigpKSkpO1xuXHRcdGZ3ZC5mb3J3YXJkU3BhbnMobWFrZVJlc3VsdChbXSkpO1xuXHRcdGF3YWl0IGZ3ZC5mbHVzaCgpO1xuXHRcdGF3YWl0IGZzLmFjY2VzcyhwYXRoKS50aGVuKCgpID0+IGZzLnVubGluayhwYXRoKSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnQ29uc29sZUZvcndhcmRlciBsb2dzIG9uZSBpbmZvIHBlciBzcGFuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ2dlciA9IHN0b3JlLmFkZChuZXcgQ2FwdHVyaW5nTG9nZ2VyKCkpO1xuXHRcdGNvbnN0IGZ3ZCA9IHN0b3JlLmFkZChuZXcgQ29uc29sZUZvcndhcmRlcihsb2dnZXIpKTtcblx0XHRmd2QuZm9yd2FyZFNwYW5zKG1ha2VSZXN1bHQoW1xuXHRcdFx0bWFrZVNwYW4oJ2ludm9rZV9hZ2VudCBjb3BpbG90JywgJzExMTExMTExMTExMTExMTEnLCB7ICdnZW5fYWkub3BlcmF0aW9uLm5hbWUnOiAnaW52b2tlX2FnZW50JywgJ2dlbl9haS5yZXF1ZXN0Lm1vZGVsJzogJ2dwdC00bycgfSksXG5cdFx0XSkpO1xuXHRcdGNvbnN0IGluZm8gPSBsb2dnZXIubWVzc2FnZXMuZmlsdGVyKG0gPT4gbS5sZXZlbCA9PT0gJ0luZm8nKTtcblx0XHRzdHJpY3RFcXVhbChpbmZvLmxlbmd0aCwgMSk7XG5cdFx0b2soaW5mb1swXS5tc2cuaW5jbHVkZXMoJ2ludm9rZV9hZ2VudCBjb3BpbG90JykpO1xuXHRcdG9rKGluZm9bMF0ubXNnLmluY2x1ZGVzKCc1MDBtcycpKTtcblx0XHRvayhpbmZvWzBdLm1zZy5pbmNsdWRlcygnb3A9aW52b2tlX2FnZW50JykpO1xuXHRcdG9rKGluZm9bMF0ubXNnLmluY2x1ZGVzKCdtb2RlbD1ncHQtNG8nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvbXBvc2l0ZUZvcndhcmRlciBmYW5zIG91dCBmb3J3YXJkUmF3IGFuZCBmb3J3YXJkU3BhbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY2hpbGQgPSAobmFtZTogc3RyaW5nKSA9PiAoe1xuXHRcdFx0Zm9yd2FyZFJhdzogKCkgPT4geyBjYWxscy5wdXNoKGAke25hbWV9LnJhd2ApOyB9LFxuXHRcdFx0Zm9yd2FyZFNwYW5zOiAoKSA9PiB7IGNhbGxzLnB1c2goYCR7bmFtZX0uc3BhbnNgKTsgfSxcblx0XHRcdGZsdXNoOiBhc3luYyAoKSA9PiB7IGNhbGxzLnB1c2goYCR7bmFtZX0uZmx1c2hgKTsgfSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgY2FsbHMucHVzaChgJHtuYW1lfS5kaXNwb3NlYCk7IH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhID0gY2hpbGQoJ2EnKTtcblx0XHRjb25zdCBiID0gY2hpbGQoJ2InKTtcblx0XHRjb25zdCBjb21wb3NpdGUgPSBzdG9yZS5hZGQobmV3IENvbXBvc2l0ZUZvcndhcmRlcihbYSwgYl0pKTtcblx0XHRjb21wb3NpdGUuZm9yd2FyZFJhdyhCdWZmZXIuYWxsb2MoMCksICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0Y29tcG9zaXRlLmZvcndhcmRTcGFucyhtYWtlUmVzdWx0KFtdKSk7XG5cdFx0YXdhaXQgY29tcG9zaXRlLmZsdXNoKCk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtcblx0XHRcdCdhLnJhdycsICdiLnJhdycsXG5cdFx0XHQnYS5zcGFucycsICdiLnNwYW5zJyxcblx0XHRcdCdhLmZsdXNoJywgJ2IuZmx1c2gnLFxuXHRcdF0pO1xuXHRcdC8vIGRpc3Bvc2UgaGFwcGVucyB2aWEgc3RvcmUgdGVhcmRvd25cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLElBQUksbUJBQW1CO0FBQ2pELFNBQVMsWUFBWSxVQUFVO0FBRS9CLFNBQVMsY0FBYztBQUN2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TSxNQUFNLElBQUksSUFBSSxpQkFBaUIsTUFBTSxDQUFDO0FBQ2xELFFBQUksYUFBYSxXQUFXO0FBQUEsTUFDM0IsU0FBUyx3QkFBd0Isb0JBQW9CLEVBQUUseUJBQXlCLGdCQUFnQix3QkFBd0IsU0FBUyxDQUFDO0FBQUEsSUFDbkksQ0FBQyxDQUFDO0FBQ0YsVUFBTSxPQUFPLE9BQU8sU0FBUyxPQUFPLE9BQUssRUFBRSxVQUFVLE1BQU07QUFDM0QsZ0JBQVksS0FBSyxRQUFRLENBQUM7QUFDMUIsT0FBRyxLQUFLLENBQUMsRUFBRSxJQUFJLFNBQVMsc0JBQXNCLENBQUM7QUFDL0MsT0FBRyxLQUFLLENBQUMsRUFBRSxJQUFJLFNBQVMsT0FBTyxDQUFDO0FBQ2hDLE9BQUcsS0FBSyxDQUFDLEVBQUUsSUFBSSxTQUFTLGlCQUFpQixDQUFDO0FBQzFDLE9BQUcsS0FBSyxDQUFDLEVBQUUsSUFBSSxTQUFTLGNBQWMsQ0FBQztBQUFBLEVBQ3hDLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxZQUFZO0FBQzNFLFVBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFNLFFBQVEsQ0FBQyxVQUFrQjtBQUFBLE1BQ2hDLFlBQVksTUFBTTtBQUFFLGNBQU0sS0FBSyxHQUFHLElBQUksTUFBTTtBQUFBLE1BQUc7QUFBQSxNQUMvQyxjQUFjLE1BQU07QUFBRSxjQUFNLEtBQUssR0FBRyxJQUFJLFFBQVE7QUFBQSxNQUFHO0FBQUEsTUFDbkQsT0FBTyxZQUFZO0FBQUUsY0FBTSxLQUFLLEdBQUcsSUFBSSxRQUFRO0FBQUEsTUFBRztBQUFBLE1BQ2xELFNBQVMsTUFBTTtBQUFFLGNBQU0sS0FBSyxHQUFHLElBQUksVUFBVTtBQUFBLE1BQUc7QUFBQSxJQUNqRDtBQUVBLFVBQU0sSUFBSSxNQUFNLEdBQUc7QUFDbkIsVUFBTSxJQUFJLE1BQU0sR0FBRztBQUNuQixVQUFNLFlBQVksTUFBTSxJQUFJLElBQUksbUJBQW1CLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUMxRCxjQUFVLFdBQVcsT0FBTyxNQUFNLENBQUMsR0FBRyxrQkFBa0I7QUFDeEQsY0FBVSxhQUFhLFdBQVcsQ0FBQyxDQUFDLENBQUM7QUFDckMsVUFBTSxVQUFVLE1BQU07QUFFdEIsb0JBQWdCLE9BQU87QUFBQSxNQUN0QjtBQUFBLE1BQVM7QUFBQSxNQUNUO0FBQUEsTUFBVztBQUFBLE1BQ1g7QUFBQSxNQUFXO0FBQUEsSUFDWixDQUFDO0FBQUEsRUFFRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
