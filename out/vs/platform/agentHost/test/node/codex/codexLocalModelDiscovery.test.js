import * as assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CodexLocalModelDiscoveryError, discoverCodexLocalModels } from "../../../node/codex/codexLocalModelDiscovery.js";
import { ollamaTagsUrl, parseOllamaListOutput, parseOllamaTagsJson } from "../../../../native/common/ollamaList.js";
suite("Codex local model discovery", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("discovers Ollama models from its native API", async () => {
    let requestedUrl = "";
    const models = await discoverCodexLocalModels("ollama", "http://localhost:11434/v1", async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ models: [{ name: "qwen3-coder" }, { model: "gpt-oss:20b" }] }), { status: 200 });
    });
    assert.strictEqual(requestedUrl, "http://localhost:11434/api/tags");
    assert.deepStrictEqual(models, [
      { id: "qwen3-coder", name: "qwen3-coder" },
      { id: "gpt-oss:20b", name: "gpt-oss:20b" }
    ]);
  });
  test("discovers LM Studio model metadata", async () => {
    const models = await discoverCodexLocalModels("lmstudio", "http://localhost:1234/v1/", async (input) => {
      assert.strictEqual(String(input), "http://localhost:1234/api/v0/models");
      return new Response(JSON.stringify({ data: [{ id: "local/model", max_context_length: 32768 }] }), { status: 200 });
    });
    assert.deepStrictEqual(models, [{ id: "local/model", name: "local/model", contextWindow: 32768 }]);
  });
  test("classifies authentication errors", async () => {
    await assert.rejects(
      () => discoverCodexLocalModels("lmstudio", "http://localhost:1234/v1", async () => new Response("", { status: 401 })),
      (error) => error instanceof CodexLocalModelDiscoveryError && error.kind === "unauthorized"
    );
  });
  test("parses ollama list table output", () => {
    const names = parseOllamaListOutput([
      "NAME                       ID              SIZE      MODIFIED",
      "llama3.2:latest            abc123          2.0 GB    2 weeks ago",
      "qwen2.5:7b                 def456          4.7 GB    3 days ago"
    ].join("\n"));
    assert.deepStrictEqual(names, ["llama3.2:latest", "qwen2.5:7b"]);
  });
  test("parses ollama list names that contain slashes", () => {
    const names = parseOllamaListOutput([
      "NAME                                 ID              SIZE     MODIFIED",
      "huihui_ai/Qwen3.6-abliterated:27b    418838acbea7    17 GB    3 days ago"
    ].join("\n"));
    assert.deepStrictEqual(names, ["huihui_ai/Qwen3.6-abliterated:27b"]);
  });
  test("parses ollama /api/tags JSON", () => {
    assert.strictEqual(ollamaTagsUrl("http://localhost:11434/v1"), "http://localhost:11434/api/tags");
    assert.deepStrictEqual(parseOllamaTagsJson({
      models: [{ name: "huihui_ai/Qwen3.6-abliterated:27b", model: "huihui_ai/Qwen3.6-abliterated:27b" }]
    }), ["huihui_ai/Qwen3.6-abliterated:27b"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhMb2NhbE1vZGVsRGlzY292ZXJ5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29kZXhMb2NhbE1vZGVsRGlzY292ZXJ5RXJyb3IsIGRpc2NvdmVyQ29kZXhMb2NhbE1vZGVscyB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhMb2NhbE1vZGVsRGlzY292ZXJ5LmpzJztcbmltcG9ydCB7IG9sbGFtYVRhZ3NVcmwsIHBhcnNlT2xsYW1hTGlzdE91dHB1dCwgcGFyc2VPbGxhbWFUYWdzSnNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL25hdGl2ZS9jb21tb24vb2xsYW1hTGlzdC5qcyc7XG5cbnN1aXRlKCdDb2RleCBsb2NhbCBtb2RlbCBkaXNjb3ZlcnknLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBPbGxhbWEgbW9kZWxzIGZyb20gaXRzIG5hdGl2ZSBBUEknLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlcXVlc3RlZFVybCA9ICcnO1xuXHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IGRpc2NvdmVyQ29kZXhMb2NhbE1vZGVscygnb2xsYW1hJywgJ2h0dHA6Ly9sb2NhbGhvc3Q6MTE0MzQvdjEnLCBhc3luYyBpbnB1dCA9PiB7XG5cdFx0XHRyZXF1ZXN0ZWRVcmwgPSBTdHJpbmcoaW5wdXQpO1xuXHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG1vZGVsczogW3sgbmFtZTogJ3F3ZW4zLWNvZGVyJyB9LCB7IG1vZGVsOiAnZ3B0LW9zczoyMGInIH1dIH0pLCB7IHN0YXR1czogMjAwIH0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0ZWRVcmwsICdodHRwOi8vbG9jYWxob3N0OjExNDM0L2FwaS90YWdzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbHMsIFtcblx0XHRcdHsgaWQ6ICdxd2VuMy1jb2RlcicsIG5hbWU6ICdxd2VuMy1jb2RlcicgfSxcblx0XHRcdHsgaWQ6ICdncHQtb3NzOjIwYicsIG5hbWU6ICdncHQtb3NzOjIwYicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXJzIExNIFN0dWRpbyBtb2RlbCBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCBkaXNjb3ZlckNvZGV4TG9jYWxNb2RlbHMoJ2xtc3R1ZGlvJywgJ2h0dHA6Ly9sb2NhbGhvc3Q6MTIzNC92MS8nLCBhc3luYyBpbnB1dCA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoU3RyaW5nKGlucHV0KSwgJ2h0dHA6Ly9sb2NhbGhvc3Q6MTIzNC9hcGkvdjAvbW9kZWxzJyk7XG5cdFx0XHRyZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgZGF0YTogW3sgaWQ6ICdsb2NhbC9tb2RlbCcsIG1heF9jb250ZXh0X2xlbmd0aDogMzI3NjggfV0gfSksIHsgc3RhdHVzOiAyMDAgfSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbHMsIFt7IGlkOiAnbG9jYWwvbW9kZWwnLCBuYW1lOiAnbG9jYWwvbW9kZWwnLCBjb250ZXh0V2luZG93OiAzMjc2OCB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYXNzaWZpZXMgYXV0aGVudGljYXRpb24gZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gZGlzY292ZXJDb2RleExvY2FsTW9kZWxzKCdsbXN0dWRpbycsICdodHRwOi8vbG9jYWxob3N0OjEyMzQvdjEnLCBhc3luYyAoKSA9PiBuZXcgUmVzcG9uc2UoJycsIHsgc3RhdHVzOiA0MDEgfSkpLFxuXHRcdFx0KGVycm9yOiB1bmtub3duKSA9PiBlcnJvciBpbnN0YW5jZW9mIENvZGV4TG9jYWxNb2RlbERpc2NvdmVyeUVycm9yICYmIGVycm9yLmtpbmQgPT09ICd1bmF1dGhvcml6ZWQnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBvbGxhbWEgbGlzdCB0YWJsZSBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbmFtZXMgPSBwYXJzZU9sbGFtYUxpc3RPdXRwdXQoW1xuXHRcdFx0J05BTUUgICAgICAgICAgICAgICAgICAgICAgIElEICAgICAgICAgICAgICBTSVpFICAgICAgTU9ESUZJRUQnLFxuXHRcdFx0J2xsYW1hMy4yOmxhdGVzdCAgICAgICAgICAgIGFiYzEyMyAgICAgICAgICAyLjAgR0IgICAgMiB3ZWVrcyBhZ28nLFxuXHRcdFx0J3F3ZW4yLjU6N2IgICAgICAgICAgICAgICAgIGRlZjQ1NiAgICAgICAgICA0LjcgR0IgICAgMyBkYXlzIGFnbycsXG5cdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuYW1lcywgWydsbGFtYTMuMjpsYXRlc3QnLCAncXdlbjIuNTo3YiddKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIG9sbGFtYSBsaXN0IG5hbWVzIHRoYXQgY29udGFpbiBzbGFzaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5hbWVzID0gcGFyc2VPbGxhbWFMaXN0T3V0cHV0KFtcblx0XHRcdCdOQU1FICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSUQgICAgICAgICAgICAgIFNJWkUgICAgIE1PRElGSUVEJyxcblx0XHRcdCdodWlodWlfYWkvUXdlbjMuNi1hYmxpdGVyYXRlZDoyN2IgICAgNDE4ODM4YWNiZWE3ICAgIDE3IEdCICAgIDMgZGF5cyBhZ28nLFxuXHRcdF0uam9pbignXFxuJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmFtZXMsIFsnaHVpaHVpX2FpL1F3ZW4zLjYtYWJsaXRlcmF0ZWQ6MjdiJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgb2xsYW1hIC9hcGkvdGFncyBKU09OJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbGxhbWFUYWdzVXJsKCdodHRwOi8vbG9jYWxob3N0OjExNDM0L3YxJyksICdodHRwOi8vbG9jYWxob3N0OjExNDM0L2FwaS90YWdzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZU9sbGFtYVRhZ3NKc29uKHtcblx0XHRcdG1vZGVsczogW3sgbmFtZTogJ2h1aWh1aV9haS9Rd2VuMy42LWFibGl0ZXJhdGVkOjI3YicsIG1vZGVsOiAnaHVpaHVpX2FpL1F3ZW4zLjYtYWJsaXRlcmF0ZWQ6MjdiJyB9XSxcblx0XHR9KSwgWydodWlodWlfYWkvUXdlbjMuNi1hYmxpdGVyYXRlZDoyN2InXSk7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
