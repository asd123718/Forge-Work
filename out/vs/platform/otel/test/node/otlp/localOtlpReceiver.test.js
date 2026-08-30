import { deepStrictEqual, ok, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../log/common/log.js";
import {
  OTLP_TRACES_PATH,
  startLocalOtlpHttpReceiver
} from "../../../node/otlp/localOtlpReceiver.js";
import {
  OtlpSpanKind
} from "../../../node/otlp/otlpJsonTypes.js";
async function send(port, options) {
  const httpModule = await import("http");
  const payload = options.body === void 0 ? void 0 : typeof options.body === "string" ? Buffer.from(options.body, "utf8") : options.body;
  const headers = {};
  if (options.contentType) {
    headers["content-type"] = options.contentType;
  }
  if (options.contentEncoding) {
    headers["content-encoding"] = options.contentEncoding;
  }
  if (payload) {
    headers["content-length"] = String(payload.length);
  }
  const req = httpModule.request({
    host: "127.0.0.1",
    port,
    method: options.method ?? "POST",
    path: options.path ?? OTLP_TRACES_PATH,
    headers
  });
  const responsePromise = new Promise((resolve, reject) => {
    req.on("response", (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        statusCode: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
        contentType: (res.headers["content-type"] ?? "").toString()
      }));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
  if (payload) {
    req.write(payload);
  }
  req.end();
  return responsePromise;
}
const traceId = "aabbccddeeff00112233445566778899";
const spanId = "0011223344556677";
const ns = "1700000000000000000";
function validRequestBody() {
  return {
    resourceSpans: [{
      scopeSpans: [{
        spans: [{
          traceId,
          spanId,
          name: "invoke_agent copilotcli",
          kind: OtlpSpanKind.INTERNAL,
          startTimeUnixNano: ns,
          endTimeUnixNano: ns,
          attributes: [{ key: "gen_ai.operation.name", value: { stringValue: "invoke_agent" } }]
        }]
      }]
    }]
  };
}
suite("platform/otel - localOtlpHttpReceiver", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  test("accepts a valid OTLP-JSON payload and delivers decoded spans", async () => {
    const received = [];
    const receiver = await startLocalOtlpHttpReceiver(
      { onSpans: (r) => received.push(r) },
      logService
    );
    try {
      const res = await send(receiver.port, {
        contentType: "application/json",
        body: JSON.stringify(validRequestBody())
      });
      strictEqual(res.statusCode, 200);
      ok(res.contentType.startsWith("application/json"));
      deepStrictEqual(JSON.parse(res.body), {});
      strictEqual(received.length, 1);
      strictEqual(received[0].rejected, 0);
      strictEqual(received[0].spans.length, 1);
      strictEqual(received[0].spans[0].name, "invoke_agent copilotcli");
    } finally {
      receiver.dispose();
    }
  });
  test("returns partial_success when some spans are rejected", async () => {
    const receiver = await startLocalOtlpHttpReceiver(
      { onSpans: () => void 0 },
      logService
    );
    try {
      const body = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [
              { traceId, spanId, name: "ok", startTimeUnixNano: ns, endTimeUnixNano: ns },
              { traceId: "badhex", spanId, name: "bad", startTimeUnixNano: ns, endTimeUnixNano: ns }
            ]
          }]
        }]
      };
      const res = await send(receiver.port, {
        contentType: "application/json",
        body: JSON.stringify(body)
      });
      strictEqual(res.statusCode, 200);
      const parsed = JSON.parse(res.body);
      strictEqual(parsed.partialSuccess.rejectedSpans, 1);
      ok(typeof parsed.partialSuccess.errorMessage === "string");
    } finally {
      receiver.dispose();
    }
  });
  test("forwards raw body to onForward callback unchanged", async () => {
    const raw = JSON.stringify(validRequestBody());
    let forwarded;
    const receiver = await startLocalOtlpHttpReceiver(
      {
        onSpans: () => void 0,
        onForward: (body, contentType) => {
          forwarded = { body, contentType };
        }
      },
      logService
    );
    try {
      await send(receiver.port, { contentType: "application/json", body: raw });
      ok(forwarded);
      strictEqual(forwarded.body.toString("utf8"), raw);
      ok(forwarded.contentType.includes("application/json"));
    } finally {
      receiver.dispose();
    }
  });
  test("transforms the body before forwarding and local decoding", async () => {
    let forwarded;
    let decoded;
    const receiver = await startLocalOtlpHttpReceiver(
      {
        transformBody: (body) => Buffer.from(body.toString("utf8").replace("invoke_agent copilotcli", "transformed span")),
        onSpans: (result) => {
          decoded = result;
        },
        onForward: (body) => {
          forwarded = body;
        }
      },
      logService
    );
    try {
      const res = await send(receiver.port, { contentType: "application/json", body: JSON.stringify(validRequestBody()) });
      strictEqual(res.statusCode, 200);
      ok(forwarded?.toString("utf8").includes("transformed span"));
      strictEqual(decoded?.spans[0].name, "transformed span");
    } finally {
      receiver.dispose();
    }
  });
  test("still responds 200 even if onForward throws", async () => {
    const receiver = await startLocalOtlpHttpReceiver(
      {
        onSpans: () => void 0,
        onForward: () => {
          throw new Error("upstream down");
        }
      },
      logService
    );
    try {
      const res = await send(receiver.port, {
        contentType: "application/json",
        body: JSON.stringify(validRequestBody())
      });
      strictEqual(res.statusCode, 200);
    } finally {
      receiver.dispose();
    }
  });
  test("rejects non-JSON content-type with 415", async () => {
    const receiver = await startLocalOtlpHttpReceiver({ onSpans: () => void 0 }, logService);
    try {
      const res = await send(receiver.port, { contentType: "application/x-protobuf", body: "\0" });
      strictEqual(res.statusCode, 415);
    } finally {
      receiver.dispose();
    }
  });
  test("rejects non-identity content-encoding with 415", async () => {
    const receiver = await startLocalOtlpHttpReceiver({ onSpans: () => void 0 }, logService);
    try {
      const res = await send(receiver.port, {
        contentType: "application/json",
        contentEncoding: "gzip",
        body: "{}"
      });
      strictEqual(res.statusCode, 415);
    } finally {
      receiver.dispose();
    }
  });
  test("returns 405 for non-POST", async () => {
    const receiver = await startLocalOtlpHttpReceiver({ onSpans: () => void 0 }, logService);
    try {
      const res = await send(receiver.port, { method: "GET" });
      strictEqual(res.statusCode, 405);
    } finally {
      receiver.dispose();
    }
  });
  test("returns 404 for unknown paths", async () => {
    const receiver = await startLocalOtlpHttpReceiver({ onSpans: () => void 0 }, logService);
    try {
      const res = await send(receiver.port, { path: "/v1/metrics", contentType: "application/json", body: "{}" });
      strictEqual(res.statusCode, 404);
    } finally {
      receiver.dispose();
    }
  });
  test("returns 400 for invalid JSON", async () => {
    const receiver = await startLocalOtlpHttpReceiver({ onSpans: () => void 0 }, logService);
    try {
      const res = await send(receiver.port, { contentType: "application/json", body: "{not json" });
      strictEqual(res.statusCode, 400);
    } finally {
      receiver.dispose();
    }
  });
  test("returns 413 when body exceeds maxBodyBytes", async () => {
    const receiver = await startLocalOtlpHttpReceiver(
      { onSpans: () => void 0 },
      logService,
      { maxBodyBytes: 16 }
    );
    try {
      const res = await send(receiver.port, {
        contentType: "application/json",
        body: JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [] }] }] })
      });
      strictEqual(res.statusCode, 413);
    } finally {
      receiver.dispose();
    }
  });
  test("binds to 127.0.0.1 on an ephemeral port", async () => {
    const receiver = await startLocalOtlpHttpReceiver({ onSpans: () => void 0 }, logService);
    try {
      ok(receiver.port > 0);
      strictEqual(receiver.baseUrl, `http://127.0.0.1:${receiver.port}`);
    } finally {
      receiver.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcb3RlbFxcdGVzdFxcbm9kZVxcb3RscFxcbG9jYWxPdGxwUmVjZWl2ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRGVjb2RlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9vdGxwL290bHBKc29uRGVjb2RlLmpzJztcbmltcG9ydCB7XG5cdElMb2NhbE90bHBIdHRwUmVjZWl2ZXIsXG5cdE9UTFBfVFJBQ0VTX1BBVEgsXG5cdHN0YXJ0TG9jYWxPdGxwSHR0cFJlY2VpdmVyLFxufSBmcm9tICcuLi8uLi8uLi9ub2RlL290bHAvbG9jYWxPdGxwUmVjZWl2ZXIuanMnO1xuaW1wb3J0IHtcblx0SU90bHBFeHBvcnRUcmFjZVNlcnZpY2VSZXF1ZXN0LFxuXHRPdGxwU3BhbktpbmQsXG59IGZyb20gJy4uLy4uLy4uL25vZGUvb3RscC9vdGxwSnNvblR5cGVzLmpzJztcblxuaW50ZXJmYWNlIElUZXN0UmVzcG9uc2Uge1xuXHRzdGF0dXNDb2RlOiBudW1iZXI7XG5cdGJvZHk6IHN0cmluZztcblx0Y29udGVudFR5cGU6IHN0cmluZztcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2VuZChcblx0cG9ydDogbnVtYmVyLFxuXHRvcHRpb25zOiB7IG1ldGhvZD86IHN0cmluZzsgcGF0aD86IHN0cmluZzsgYm9keT86IEJ1ZmZlciB8IHN0cmluZzsgY29udGVudFR5cGU/OiBzdHJpbmc7IGNvbnRlbnRFbmNvZGluZz86IHN0cmluZyB9LFxuKTogUHJvbWlzZTxJVGVzdFJlc3BvbnNlPiB7XG5cdGNvbnN0IGh0dHBNb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0Y29uc3QgcGF5bG9hZCA9IG9wdGlvbnMuYm9keSA9PT0gdW5kZWZpbmVkXG5cdFx0PyB1bmRlZmluZWRcblx0XHQ6IHR5cGVvZiBvcHRpb25zLmJvZHkgPT09ICdzdHJpbmcnID8gQnVmZmVyLmZyb20ob3B0aW9ucy5ib2R5LCAndXRmOCcpIDogb3B0aW9ucy5ib2R5O1xuXHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdGlmIChvcHRpb25zLmNvbnRlbnRUeXBlKSB7XG5cdFx0aGVhZGVyc1snY29udGVudC10eXBlJ10gPSBvcHRpb25zLmNvbnRlbnRUeXBlO1xuXHR9XG5cdGlmIChvcHRpb25zLmNvbnRlbnRFbmNvZGluZykge1xuXHRcdGhlYWRlcnNbJ2NvbnRlbnQtZW5jb2RpbmcnXSA9IG9wdGlvbnMuY29udGVudEVuY29kaW5nO1xuXHR9XG5cdGlmIChwYXlsb2FkKSB7XG5cdFx0aGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IFN0cmluZyhwYXlsb2FkLmxlbmd0aCk7XG5cdH1cblx0Y29uc3QgcmVxOiBodHRwLkNsaWVudFJlcXVlc3QgPSBodHRwTW9kdWxlLnJlcXVlc3Qoe1xuXHRcdGhvc3Q6ICcxMjcuMC4wLjEnLFxuXHRcdHBvcnQsXG5cdFx0bWV0aG9kOiBvcHRpb25zLm1ldGhvZCA/PyAnUE9TVCcsXG5cdFx0cGF0aDogb3B0aW9ucy5wYXRoID8/IE9UTFBfVFJBQ0VTX1BBVEgsXG5cdFx0aGVhZGVycyxcblx0fSk7XG5cdGNvbnN0IHJlc3BvbnNlUHJvbWlzZSA9IG5ldyBQcm9taXNlPElUZXN0UmVzcG9uc2U+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRyZXEub24oJ3Jlc3BvbnNlJywgcmVzID0+IHtcblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdHJlcy5vbignZGF0YScsIChjaHVuazogQnVmZmVyKSA9PiBjaHVua3MucHVzaChjaHVuaykpO1xuXHRcdFx0cmVzLm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKHtcblx0XHRcdFx0c3RhdHVzQ29kZTogcmVzLnN0YXR1c0NvZGUgPz8gMCxcblx0XHRcdFx0Ym9keTogQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCd1dGY4JyksXG5cdFx0XHRcdGNvbnRlbnRUeXBlOiAocmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID8/ICcnKS50b1N0cmluZygpLFxuXHRcdFx0fSkpO1xuXHRcdFx0cmVzLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0fSk7XG5cdFx0cmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdH0pO1xuXHRpZiAocGF5bG9hZCkge1xuXHRcdHJlcS53cml0ZShwYXlsb2FkKTtcblx0fVxuXHRyZXEuZW5kKCk7XG5cdHJldHVybiByZXNwb25zZVByb21pc2U7XG59XG5cbmNvbnN0IHRyYWNlSWQgPSAnYWFiYmNjZGRlZWZmMDAxMTIyMzM0NDU1NjY3Nzg4OTknO1xuY29uc3Qgc3BhbklkID0gJzAwMTEyMjMzNDQ1NTY2NzcnO1xuY29uc3QgbnMgPSAnMTcwMDAwMDAwMDAwMDAwMDAwMCc7XG5cbmZ1bmN0aW9uIHZhbGlkUmVxdWVzdEJvZHkoKTogSU90bHBFeHBvcnRUcmFjZVNlcnZpY2VSZXF1ZXN0IHtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZVNwYW5zOiBbe1xuXHRcdFx0c2NvcGVTcGFuczogW3tcblx0XHRcdFx0c3BhbnM6IFt7XG5cdFx0XHRcdFx0dHJhY2VJZCxcblx0XHRcdFx0XHRzcGFuSWQsXG5cdFx0XHRcdFx0bmFtZTogJ2ludm9rZV9hZ2VudCBjb3BpbG90Y2xpJyxcblx0XHRcdFx0XHRraW5kOiBPdGxwU3BhbktpbmQuSU5URVJOQUwsXG5cdFx0XHRcdFx0c3RhcnRUaW1lVW5peE5hbm86IG5zLFxuXHRcdFx0XHRcdGVuZFRpbWVVbml4TmFubzogbnMsXG5cdFx0XHRcdFx0YXR0cmlidXRlczogW3sga2V5OiAnZ2VuX2FpLm9wZXJhdGlvbi5uYW1lJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICdpbnZva2VfYWdlbnQnIH0gfV0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fV0sXG5cdFx0fV0sXG5cdH07XG59XG5cbnN1aXRlKCdwbGF0Zm9ybS9vdGVsIC0gbG9jYWxPdGxwSHR0cFJlY2VpdmVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdHRlc3QoJ2FjY2VwdHMgYSB2YWxpZCBPVExQLUpTT04gcGF5bG9hZCBhbmQgZGVsaXZlcnMgZGVjb2RlZCBzcGFucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWNlaXZlZDogSURlY29kZVJlc3VsdFtdID0gW107XG5cdFx0Y29uc3QgcmVjZWl2ZXIgPSBhd2FpdCBzdGFydExvY2FsT3RscEh0dHBSZWNlaXZlcihcblx0XHRcdHsgb25TcGFuczogciA9PiByZWNlaXZlZC5wdXNoKHIpIH0sXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHNlbmQocmVjZWl2ZXIucG9ydCwge1xuXHRcdFx0XHRjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh2YWxpZFJlcXVlc3RCb2R5KCkpLFxuXHRcdFx0fSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgMjAwKTtcblx0XHRcdG9rKHJlcy5jb250ZW50VHlwZS5zdGFydHNXaXRoKCdhcHBsaWNhdGlvbi9qc29uJykpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UocmVzLmJvZHkpLCB7fSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZWNlaXZlZC5sZW5ndGgsIDEpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVjZWl2ZWRbMF0ucmVqZWN0ZWQsIDApO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVjZWl2ZWRbMF0uc3BhbnMubGVuZ3RoLCAxKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlY2VpdmVkWzBdLnNwYW5zWzBdLm5hbWUsICdpbnZva2VfYWdlbnQgY29waWxvdGNsaScpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWNlaXZlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHBhcnRpYWxfc3VjY2VzcyB3aGVuIHNvbWUgc3BhbnMgYXJlIHJlamVjdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlY2VpdmVyID0gYXdhaXQgc3RhcnRMb2NhbE90bHBIdHRwUmVjZWl2ZXIoXG5cdFx0XHR7IG9uU3BhbnM6ICgpID0+IHVuZGVmaW5lZCB9LFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBib2R5OiBJT3RscEV4cG9ydFRyYWNlU2VydmljZVJlcXVlc3QgPSB7XG5cdFx0XHRcdHJlc291cmNlU3BhbnM6IFt7XG5cdFx0XHRcdFx0c2NvcGVTcGFuczogW3tcblx0XHRcdFx0XHRcdHNwYW5zOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHJhY2VJZCwgc3BhbklkLCBuYW1lOiAnb2snLCBzdGFydFRpbWVVbml4TmFubzogbnMsIGVuZFRpbWVVbml4TmFubzogbnMgfSxcblx0XHRcdFx0XHRcdFx0eyB0cmFjZUlkOiAnYmFkaGV4Jywgc3BhbklkLCBuYW1lOiAnYmFkJywgc3RhcnRUaW1lVW5peE5hbm86IG5zLCBlbmRUaW1lVW5peE5hbm86IG5zIH0sXG5cdFx0XHRcdFx0XHRdIGFzIG5ldmVyLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBzZW5kKHJlY2VpdmVyLnBvcnQsIHtcblx0XHRcdFx0Y29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoYm9keSksXG5cdFx0XHR9KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZXMuYm9keSk7XG5cdFx0XHRzdHJpY3RFcXVhbChwYXJzZWQucGFydGlhbFN1Y2Nlc3MucmVqZWN0ZWRTcGFucywgMSk7XG5cdFx0XHRvayh0eXBlb2YgcGFyc2VkLnBhcnRpYWxTdWNjZXNzLmVycm9yTWVzc2FnZSA9PT0gJ3N0cmluZycpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWNlaXZlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyByYXcgYm9keSB0byBvbkZvcndhcmQgY2FsbGJhY2sgdW5jaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJhdyA9IEpTT04uc3RyaW5naWZ5KHZhbGlkUmVxdWVzdEJvZHkoKSk7XG5cdFx0bGV0IGZvcndhcmRlZDogeyBib2R5OiBCdWZmZXI7IGNvbnRlbnRUeXBlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZWNlaXZlciA9IGF3YWl0IHN0YXJ0TG9jYWxPdGxwSHR0cFJlY2VpdmVyKFxuXHRcdFx0e1xuXHRcdFx0XHRvblNwYW5zOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRm9yd2FyZDogKGJvZHksIGNvbnRlbnRUeXBlKSA9PiB7IGZvcndhcmRlZCA9IHsgYm9keSwgY29udGVudFR5cGUgfTsgfSxcblx0XHRcdH0sXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlbmQocmVjZWl2ZXIucG9ydCwgeyBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLCBib2R5OiByYXcgfSk7XG5cdFx0XHRvayhmb3J3YXJkZWQpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZm9yd2FyZGVkLmJvZHkudG9TdHJpbmcoJ3V0ZjgnKSwgcmF3KTtcblx0XHRcdG9rKGZvcndhcmRlZC5jb250ZW50VHlwZS5pbmNsdWRlcygnYXBwbGljYXRpb24vanNvbicpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVjZWl2ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndHJhbnNmb3JtcyB0aGUgYm9keSBiZWZvcmUgZm9yd2FyZGluZyBhbmQgbG9jYWwgZGVjb2RpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGZvcndhcmRlZDogQnVmZmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWNvZGVkOiBJRGVjb2RlUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlY2VpdmVyID0gYXdhaXQgc3RhcnRMb2NhbE90bHBIdHRwUmVjZWl2ZXIoXG5cdFx0XHR7XG5cdFx0XHRcdHRyYW5zZm9ybUJvZHk6IGJvZHkgPT4gQnVmZmVyLmZyb20oYm9keS50b1N0cmluZygndXRmOCcpLnJlcGxhY2UoJ2ludm9rZV9hZ2VudCBjb3BpbG90Y2xpJywgJ3RyYW5zZm9ybWVkIHNwYW4nKSksXG5cdFx0XHRcdG9uU3BhbnM6IHJlc3VsdCA9PiB7IGRlY29kZWQgPSByZXN1bHQ7IH0sXG5cdFx0XHRcdG9uRm9yd2FyZDogYm9keSA9PiB7IGZvcndhcmRlZCA9IGJvZHk7IH0sXG5cdFx0XHR9LFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBzZW5kKHJlY2VpdmVyLnBvcnQsIHsgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogSlNPTi5zdHJpbmdpZnkodmFsaWRSZXF1ZXN0Qm9keSgpKSB9KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdFx0b2soZm9yd2FyZGVkPy50b1N0cmluZygndXRmOCcpLmluY2x1ZGVzKCd0cmFuc2Zvcm1lZCBzcGFuJykpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZGVjb2RlZD8uc3BhbnNbMF0ubmFtZSwgJ3RyYW5zZm9ybWVkIHNwYW4nKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVjZWl2ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnc3RpbGwgcmVzcG9uZHMgMjAwIGV2ZW4gaWYgb25Gb3J3YXJkIHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWNlaXZlciA9IGF3YWl0IHN0YXJ0TG9jYWxPdGxwSHR0cFJlY2VpdmVyKFxuXHRcdFx0e1xuXHRcdFx0XHRvblNwYW5zOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG9uRm9yd2FyZDogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3Vwc3RyZWFtIGRvd24nKTsgfSxcblx0XHRcdH0sXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHNlbmQocmVjZWl2ZXIucG9ydCwge1xuXHRcdFx0XHRjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh2YWxpZFJlcXVlc3RCb2R5KCkpLFxuXHRcdFx0fSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgMjAwKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVjZWl2ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBub24tSlNPTiBjb250ZW50LXR5cGUgd2l0aCA0MTUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVjZWl2ZXIgPSBhd2FpdCBzdGFydExvY2FsT3RscEh0dHBSZWNlaXZlcih7IG9uU3BhbnM6ICgpID0+IHVuZGVmaW5lZCB9LCBsb2dTZXJ2aWNlKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgc2VuZChyZWNlaXZlci5wb3J0LCB7IGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24veC1wcm90b2J1ZicsIGJvZHk6ICdcXHgwMCcgfSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgNDE1KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVjZWl2ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBub24taWRlbnRpdHkgY29udGVudC1lbmNvZGluZyB3aXRoIDQxNScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWNlaXZlciA9IGF3YWl0IHN0YXJ0TG9jYWxPdGxwSHR0cFJlY2VpdmVyKHsgb25TcGFuczogKCkgPT4gdW5kZWZpbmVkIH0sIGxvZ1NlcnZpY2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBzZW5kKHJlY2VpdmVyLnBvcnQsIHtcblx0XHRcdFx0Y29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0Y29udGVudEVuY29kaW5nOiAnZ3ppcCcsXG5cdFx0XHRcdGJvZHk6ICd7fScsXG5cdFx0XHR9KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCA0MTUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWNlaXZlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIDQwNSBmb3Igbm9uLVBPU1QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVjZWl2ZXIgPSBhd2FpdCBzdGFydExvY2FsT3RscEh0dHBSZWNlaXZlcih7IG9uU3BhbnM6ICgpID0+IHVuZGVmaW5lZCB9LCBsb2dTZXJ2aWNlKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgc2VuZChyZWNlaXZlci5wb3J0LCB7IG1ldGhvZDogJ0dFVCcgfSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgNDA1KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVjZWl2ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyA0MDQgZm9yIHVua25vd24gcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVjZWl2ZXIgPSBhd2FpdCBzdGFydExvY2FsT3RscEh0dHBSZWNlaXZlcih7IG9uU3BhbnM6ICgpID0+IHVuZGVmaW5lZCB9LCBsb2dTZXJ2aWNlKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgc2VuZChyZWNlaXZlci5wb3J0LCB7IHBhdGg6ICcvdjEvbWV0cmljcycsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6ICd7fScgfSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgNDA0KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVjZWl2ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyA0MDAgZm9yIGludmFsaWQgSlNPTicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWNlaXZlciA9IGF3YWl0IHN0YXJ0TG9jYWxPdGxwSHR0cFJlY2VpdmVyKHsgb25TcGFuczogKCkgPT4gdW5kZWZpbmVkIH0sIGxvZ1NlcnZpY2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBzZW5kKHJlY2VpdmVyLnBvcnQsIHsgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogJ3tub3QganNvbicgfSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgNDAwKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVjZWl2ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyA0MTMgd2hlbiBib2R5IGV4Y2VlZHMgbWF4Qm9keUJ5dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlY2VpdmVyID0gYXdhaXQgc3RhcnRMb2NhbE90bHBIdHRwUmVjZWl2ZXIoXG5cdFx0XHR7IG9uU3BhbnM6ICgpID0+IHVuZGVmaW5lZCB9LFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHsgbWF4Qm9keUJ5dGVzOiAxNiB9LFxuXHRcdCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHNlbmQocmVjZWl2ZXIucG9ydCwge1xuXHRcdFx0XHRjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlc291cmNlU3BhbnM6IFt7IHNjb3BlU3BhbnM6IFt7IHNwYW5zOiBbXSB9XSB9XSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzLnN0YXR1c0NvZGUsIDQxMyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlY2VpdmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2JpbmRzIHRvIDEyNy4wLjAuMSBvbiBhbiBlcGhlbWVyYWwgcG9ydCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWNlaXZlcjogSUxvY2FsT3RscEh0dHBSZWNlaXZlciA9IGF3YWl0IHN0YXJ0TG9jYWxPdGxwSHR0cFJlY2VpdmVyKHsgb25TcGFuczogKCkgPT4gdW5kZWZpbmVkIH0sIGxvZ1NlcnZpY2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRvayhyZWNlaXZlci5wb3J0ID4gMCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZWNlaXZlci5iYXNlVXJsLCBgaHR0cDovLzEyNy4wLjAuMToke3JlY2VpdmVyLnBvcnR9YCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlY2VpdmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixJQUFJLG1CQUFtQjtBQUVqRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUUvQjtBQUFBLEVBRUM7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUNQO0FBQUEsRUFFQztBQUFBLE9BQ007QUFRUCxlQUFlLEtBQ2QsTUFDQSxTQUN5QjtBQUN6QixRQUFNLGFBQWEsTUFBTSxPQUFPLE1BQU07QUFDdEMsUUFBTSxVQUFVLFFBQVEsU0FBUyxTQUM5QixTQUNBLE9BQU8sUUFBUSxTQUFTLFdBQVcsT0FBTyxLQUFLLFFBQVEsTUFBTSxNQUFNLElBQUksUUFBUTtBQUNsRixRQUFNLFVBQWtDLENBQUM7QUFDekMsTUFBSSxRQUFRLGFBQWE7QUFDeEIsWUFBUSxjQUFjLElBQUksUUFBUTtBQUFBLEVBQ25DO0FBQ0EsTUFBSSxRQUFRLGlCQUFpQjtBQUM1QixZQUFRLGtCQUFrQixJQUFJLFFBQVE7QUFBQSxFQUN2QztBQUNBLE1BQUksU0FBUztBQUNaLFlBQVEsZ0JBQWdCLElBQUksT0FBTyxRQUFRLE1BQU07QUFBQSxFQUNsRDtBQUNBLFFBQU0sTUFBMEIsV0FBVyxRQUFRO0FBQUEsSUFDbEQsTUFBTTtBQUFBLElBQ047QUFBQSxJQUNBLFFBQVEsUUFBUSxVQUFVO0FBQUEsSUFDMUIsTUFBTSxRQUFRLFFBQVE7QUFBQSxJQUN0QjtBQUFBLEVBQ0QsQ0FBQztBQUNELFFBQU0sa0JB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
