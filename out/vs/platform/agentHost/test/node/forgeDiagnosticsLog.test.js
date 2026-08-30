import * as assert from "assert";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ForgeDiagnosticsLog, redactForgeDiagnosticValue } from "../../node/forgeDiagnosticsLog.js";
suite("ForgeDiagnosticsLog", () => {
  test("redacts secret keys recursively", () => {
    assert.deepStrictEqual(redactForgeDiagnosticValue({ token: "visible-nope", nested: { apiKey: "also-nope", value: "safe" } }), {
      token: "<redacted>",
      nested: { apiKey: "<redacted>", value: "safe" }
    });
  });
  test("redacts common credentials embedded in text", () => {
    const result = redactForgeDiagnosticValue('Authorization: Bearer abcdefghijklmnop and sk-abcdefghijklmnop api_key="plain-key"');
    assert.strictEqual(result, "Authorization: <redacted> and <redacted> api_key=<redacted>");
  });
  test("preserves normal user and agent content", () => {
    const text = "\u8BF7\u4FEE\u6539 src/main.ts\uFF0C\u5E76\u8FD0\u884C npm test\u3002";
    assert.strictEqual(redactForgeDiagnosticValue(text), text);
  });
  test("replaces large base64 payloads with compact metadata", () => {
    const encoded = Buffer.alloc(1024, 7).toString("base64");
    const result = String(redactForgeDiagnosticValue(encoded));
    assert.match(result, /^<base64 omitted chars=\d+ sha256=[a-f0-9]{64}>$/);
  });
  test("writes separated text logs and coalesces streamed content", async () => {
    const directory = await mkdtemp(join(tmpdir(), "forge-diagnostics-"));
    const log = new ForgeDiagnosticsLog(URI.file(directory), "test");
    try {
      log.recordText("chat", "USER", "hello sk-abcdefghijklmnop", { turn: "turn-1" });
      log.recordStream("chat", "turn-1:assistant", "ASSISTANT", "hel", { turn: "turn-1" });
      log.recordStream("chat", "turn-1:assistant", "ASSISTANT", "lo", { turn: "turn-1" });
      log.recordLatestText("files", "turn-1:diff", "UNIFIED-DIFF", "obsolete diff", { turn: "turn-1" });
      log.recordLatestText("files", "turn-1:diff", "UNIFIED-DIFF", "latest diff", { turn: "turn-1" });
      await log.flush();
      const content = await readFile(join(directory, "20-chat.txt"), "utf8");
      const files = await readFile(join(directory, "50-files.txt"), "utf8");
      assert.ok(content.includes("@@BEGIN USER"));
      assert.ok(content.includes("hello <redacted>"));
      assert.ok(content.includes("@@BEGIN ASSISTANT"));
      assert.ok(content.includes("\nhello\n"));
      assert.strictEqual(content.includes("sk-abcdefghijklmnop"), false);
      assert.ok(files.includes("latest diff"));
      assert.strictEqual(files.includes("obsolete diff"), false);
    } finally {
      log.dispose();
      await log.flush();
      await rm(directory, { recursive: true, force: true });
    }
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxmb3JnZURpYWdub3N0aWNzTG9nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZHRlbXAsIHJlYWRGaWxlLCBybSB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZvcmdlRGlhZ25vc3RpY3NMb2csIHJlZGFjdEZvcmdlRGlhZ25vc3RpY1ZhbHVlIH0gZnJvbSAnLi4vLi4vbm9kZS9mb3JnZURpYWdub3N0aWNzTG9nLmpzJztcblxuc3VpdGUoJ0ZvcmdlRGlhZ25vc3RpY3NMb2cnLCAoKSA9PiB7XG5cdHRlc3QoJ3JlZGFjdHMgc2VjcmV0IGtleXMgcmVjdXJzaXZlbHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWRhY3RGb3JnZURpYWdub3N0aWNWYWx1ZSh7IHRva2VuOiAndmlzaWJsZS1ub3BlJywgbmVzdGVkOiB7IGFwaUtleTogJ2Fsc28tbm9wZScsIHZhbHVlOiAnc2FmZScgfSB9KSwge1xuXHRcdFx0dG9rZW46ICc8cmVkYWN0ZWQ+Jyxcblx0XHRcdG5lc3RlZDogeyBhcGlLZXk6ICc8cmVkYWN0ZWQ+JywgdmFsdWU6ICdzYWZlJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWRhY3RzIGNvbW1vbiBjcmVkZW50aWFscyBlbWJlZGRlZCBpbiB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlZGFjdEZvcmdlRGlhZ25vc3RpY1ZhbHVlKCdBdXRob3JpemF0aW9uOiBCZWFyZXIgYWJjZGVmZ2hpamtsbW5vcCBhbmQgc2stYWJjZGVmZ2hpamtsbW5vcCBhcGlfa2V5PVwicGxhaW4ta2V5XCInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnQXV0aG9yaXphdGlvbjogPHJlZGFjdGVkPiBhbmQgPHJlZGFjdGVkPiBhcGlfa2V5PTxyZWRhY3RlZD4nKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIG5vcm1hbCB1c2VyIGFuZCBhZ2VudCBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnXHU4QkY3XHU0RkVFXHU2NTM5IHNyYy9tYWluLnRzXHVGRjBDXHU1RTc2XHU4RkQwXHU4ODRDIG5wbSB0ZXN0XHUzMDAyJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkYWN0Rm9yZ2VEaWFnbm9zdGljVmFsdWUodGV4dCksIHRleHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlcyBsYXJnZSBiYXNlNjQgcGF5bG9hZHMgd2l0aCBjb21wYWN0IG1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVuY29kZWQgPSBCdWZmZXIuYWxsb2MoMV8wMjQsIDcpLnRvU3RyaW5nKCdiYXNlNjQnKTtcblx0XHRjb25zdCByZXN1bHQgPSBTdHJpbmcocmVkYWN0Rm9yZ2VEaWFnbm9zdGljVmFsdWUoZW5jb2RlZCkpO1xuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQsIC9ePGJhc2U2NCBvbWl0dGVkIGNoYXJzPVxcZCsgc2hhMjU2PVthLWYwLTldezY0fT4kLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlcyBzZXBhcmF0ZWQgdGV4dCBsb2dzIGFuZCBjb2FsZXNjZXMgc3RyZWFtZWQgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXJlY3RvcnkgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICdmb3JnZS1kaWFnbm9zdGljcy0nKSk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IEZvcmdlRGlhZ25vc3RpY3NMb2coVVJJLmZpbGUoZGlyZWN0b3J5KSwgJ3Rlc3QnKTtcblx0XHR0cnkge1xuXHRcdFx0bG9nLnJlY29yZFRleHQoJ2NoYXQnLCAnVVNFUicsICdoZWxsbyBzay1hYmNkZWZnaGlqa2xtbm9wJywgeyB0dXJuOiAndHVybi0xJyB9KTtcblx0XHRcdGxvZy5yZWNvcmRTdHJlYW0oJ2NoYXQnLCAndHVybi0xOmFzc2lzdGFudCcsICdBU1NJU1RBTlQnLCAnaGVsJywgeyB0dXJuOiAndHVybi0xJyB9KTtcblx0XHRcdGxvZy5yZWNvcmRTdHJlYW0oJ2NoYXQnLCAndHVybi0xOmFzc2lzdGFudCcsICdBU1NJU1RBTlQnLCAnbG8nLCB7IHR1cm46ICd0dXJuLTEnIH0pO1xuXHRcdFx0bG9nLnJlY29yZExhdGVzdFRleHQoJ2ZpbGVzJywgJ3R1cm4tMTpkaWZmJywgJ1VOSUZJRUQtRElGRicsICdvYnNvbGV0ZSBkaWZmJywgeyB0dXJuOiAndHVybi0xJyB9KTtcblx0XHRcdGxvZy5yZWNvcmRMYXRlc3RUZXh0KCdmaWxlcycsICd0dXJuLTE6ZGlmZicsICdVTklGSUVELURJRkYnLCAnbGF0ZXN0IGRpZmYnLCB7IHR1cm46ICd0dXJuLTEnIH0pO1xuXHRcdFx0YXdhaXQgbG9nLmZsdXNoKCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVhZEZpbGUoam9pbihkaXJlY3RvcnksICcyMC1jaGF0LnR4dCcpLCAndXRmOCcpO1xuXHRcdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCByZWFkRmlsZShqb2luKGRpcmVjdG9yeSwgJzUwLWZpbGVzLnR4dCcpLCAndXRmOCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoJ0BAQkVHSU4gVVNFUicpKTtcblx0XHRcdGFzc2VydC5vayhjb250ZW50LmluY2x1ZGVzKCdoZWxsbyA8cmVkYWN0ZWQ+JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoJ0BAQkVHSU4gQVNTSVNUQU5UJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQuaW5jbHVkZXMoJ1xcbmhlbGxvXFxuJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQuaW5jbHVkZXMoJ3NrLWFiY2RlZmdoaWprbG1ub3AnKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpbGVzLmluY2x1ZGVzKCdsYXRlc3QgZGlmZicpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlcy5pbmNsdWRlcygnb2Jzb2xldGUgZGlmZicpLCBmYWxzZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxvZy5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCBsb2cuZmx1c2goKTtcblx0XHRcdGF3YWl0IHJtKGRpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdH1cblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7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
