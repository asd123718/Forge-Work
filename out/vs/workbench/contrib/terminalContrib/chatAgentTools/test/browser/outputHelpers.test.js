import { ok, strictEqual } from "assert";
import { getOutput, MAX_OUTPUT_LENGTH, truncateLargeOutput } from "../../browser/outputHelpers.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("outputHelpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockInstance(lines) {
    const buffer = {
      length: lines.length,
      getLine: (index) => {
        const line = lines[index];
        if (!line) {
          return void 0;
        }
        return {
          isWrapped: !!line.isWrapped,
          translateToString: (trimRight) => trimRight ? line.text.replace(/\s+$/g, "") : line.text
        };
      }
    };
    return {
      xterm: {
        raw: {
          buffer: {
            active: buffer
          }
        }
      }
    };
  }
  test("preserves explicit newline after an 80-column soft wrap", () => {
    const line80 = "A".repeat(80);
    const instance = createMockInstance([
      { text: line80 },
      { text: "X", isWrapped: true },
      { text: "after" }
    ]);
    const output = getOutput(instance);
    strictEqual(output, `${line80}X
after`);
  });
  test("rewinds marker when it starts on a wrapped continuation line", () => {
    const line80 = "A".repeat(80);
    const instance = createMockInstance([
      { text: line80 },
      { text: "X", isWrapped: true },
      { text: "after" }
    ]);
    const marker = { line: 1 };
    const output = getOutput(instance, marker);
    strictEqual(output, `${line80}X
after`);
  });
  test("returns raw JSON without formatting (formatting only in file writer)", () => {
    const instance = createMockInstance([
      { text: '{"items":[1,2],"nested":{"value":true}}' }
    ]);
    const output = getOutput(instance);
    strictEqual(output, '{"items":[1,2],"nested":{"value":true}}');
  });
  test("does not truncate output (callers handle truncation)", () => {
    const line = "a".repeat(1e3);
    const instance = createMockInstance(
      Array.from({ length: 100 }, () => ({ text: line }))
    );
    const output = getOutput(instance);
    strictEqual(output.length, 100 * 1e3 + 99);
  });
  suite("truncateLargeOutput", () => {
    test("truncates with preview header and tail", () => {
      const largeOutput = "a".repeat(3e4);
      const result = truncateLargeOutput(largeOutput);
      strictEqual(result.length, MAX_OUTPUT_LENGTH);
      ok(result.includes("[Output too large"));
      ok(result.includes("[... middle of output truncated ...]"));
    });
    test("includes both head preview and tail", () => {
      const head = "HEAD_CONTENT_" + "x".repeat(487);
      const middle = "m".repeat(29e3);
      const tail = "TAIL_CONTENT_" + "z".repeat(487);
      const largeOutput = head + middle + tail;
      const result = truncateLargeOutput(largeOutput);
      ok(result.includes("HEAD_CONTENT_"), "should include head preview");
      ok(result.includes("TAIL_CONTENT_"), "should include tail");
      ok(result.length <= MAX_OUTPUT_LENGTH);
    });
    test("includes file path when provided", () => {
      const largeOutput = "x".repeat(3e4);
      const result = truncateLargeOutput(largeOutput, "/tmp/copilot-terminal-output-abc.txt");
      ok(result.includes("/tmp/copilot-terminal-output-abc.txt"));
      ok(result.includes("readFile"));
      ok(result.includes("grep"));
      ok(result.length <= MAX_OUTPUT_LENGTH);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXG91dHB1dEhlbHBlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSB7IElNYXJrZXIgYXMgSVh0ZXJtTWFya2VyIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGdldE91dHB1dCwgTUFYX09VVFBVVF9MRU5HVEgsIHRydW5jYXRlTGFyZ2VPdXRwdXQgfSBmcm9tICcuLi8uLi9icm93c2VyL291dHB1dEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdvdXRwdXRIZWxwZXJzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0ZnVuY3Rpb24gY3JlYXRlTW9ja0luc3RhbmNlKGxpbmVzOiB7IHRleHQ6IHN0cmluZzsgaXNXcmFwcGVkPzogYm9vbGVhbiB9W10pOiBJVGVybWluYWxJbnN0YW5jZSB7XG5cdFx0Y29uc3QgYnVmZmVyID0ge1xuXHRcdFx0bGVuZ3RoOiBsaW5lcy5sZW5ndGgsXG5cdFx0XHRnZXRMaW5lOiAoaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRjb25zdCBsaW5lID0gbGluZXNbaW5kZXhdO1xuXHRcdFx0XHRpZiAoIWxpbmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aXNXcmFwcGVkOiAhIWxpbmUuaXNXcmFwcGVkLFxuXHRcdFx0XHRcdHRyYW5zbGF0ZVRvU3RyaW5nOiAodHJpbVJpZ2h0PzogYm9vbGVhbikgPT4gdHJpbVJpZ2h0ID8gbGluZS50ZXh0LnJlcGxhY2UoL1xccyskL2csICcnKSA6IGxpbmUudGV4dFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdHh0ZXJtOiB7XG5cdFx0XHRcdHJhdzoge1xuXHRcdFx0XHRcdGJ1ZmZlcjoge1xuXHRcdFx0XHRcdFx0YWN0aXZlOiBidWZmZXJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdH1cblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgZXhwbGljaXQgbmV3bGluZSBhZnRlciBhbiA4MC1jb2x1bW4gc29mdCB3cmFwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmU4MCA9ICdBJy5yZXBlYXQoODApO1xuXHRcdGNvbnN0IGluc3RhbmNlID0gY3JlYXRlTW9ja0luc3RhbmNlKFtcblx0XHRcdHsgdGV4dDogbGluZTgwIH0sXG5cdFx0XHR7IHRleHQ6ICdYJywgaXNXcmFwcGVkOiB0cnVlIH0sXG5cdFx0XHR7IHRleHQ6ICdhZnRlcicgfVxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgb3V0cHV0ID0gZ2V0T3V0cHV0KGluc3RhbmNlKTtcblx0XHRzdHJpY3RFcXVhbChvdXRwdXQsIGAke2xpbmU4MH1YXFxuYWZ0ZXJgKTtcblx0fSk7XG5cblx0dGVzdCgncmV3aW5kcyBtYXJrZXIgd2hlbiBpdCBzdGFydHMgb24gYSB3cmFwcGVkIGNvbnRpbnVhdGlvbiBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmU4MCA9ICdBJy5yZXBlYXQoODApO1xuXHRcdGNvbnN0IGluc3RhbmNlID0gY3JlYXRlTW9ja0luc3RhbmNlKFtcblx0XHRcdHsgdGV4dDogbGluZTgwIH0sXG5cdFx0XHR7IHRleHQ6ICdYJywgaXNXcmFwcGVkOiB0cnVlIH0sXG5cdFx0XHR7IHRleHQ6ICdhZnRlcicgfVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbWFya2VyID0geyBsaW5lOiAxIH0gYXMgSVh0ZXJtTWFya2VyO1xuXHRcdGNvbnN0IG91dHB1dCA9IGdldE91dHB1dChpbnN0YW5jZSwgbWFya2VyKTtcblx0XHRzdHJpY3RFcXVhbChvdXRwdXQsIGAke2xpbmU4MH1YXFxuYWZ0ZXJgKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyByYXcgSlNPTiB3aXRob3V0IGZvcm1hdHRpbmcgKGZvcm1hdHRpbmcgb25seSBpbiBmaWxlIHdyaXRlciknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBjcmVhdGVNb2NrSW5zdGFuY2UoW1xuXHRcdFx0eyB0ZXh0OiAne1wiaXRlbXNcIjpbMSwyXSxcIm5lc3RlZFwiOntcInZhbHVlXCI6dHJ1ZX19JyB9XG5cdFx0XSk7XG5cblx0XHRjb25zdCBvdXRwdXQgPSBnZXRPdXRwdXQoaW5zdGFuY2UpO1xuXHRcdHN0cmljdEVxdWFsKG91dHB1dCwgJ3tcIml0ZW1zXCI6WzEsMl0sXCJuZXN0ZWRcIjp7XCJ2YWx1ZVwiOnRydWV9fScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCB0cnVuY2F0ZSBvdXRwdXQgKGNhbGxlcnMgaGFuZGxlIHRydW5jYXRpb24pJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmUgPSAnYScucmVwZWF0KDEwMDApO1xuXHRcdGNvbnN0IGluc3RhbmNlID0gY3JlYXRlTW9ja0luc3RhbmNlKFxuXHRcdFx0QXJyYXkuZnJvbSh7IGxlbmd0aDogMTAwIH0sICgpID0+ICh7IHRleHQ6IGxpbmUgfSkpXG5cdFx0KTtcblxuXHRcdGNvbnN0IG91dHB1dCA9IGdldE91dHB1dChpbnN0YW5jZSk7XG5cdFx0Ly8gZ2V0T3V0cHV0IG5vIGxvbmdlciB0cnVuY2F0ZXMgLSBpdCByZXR1cm5zIGZ1bGwgb3V0cHV0XG5cdFx0c3RyaWN0RXF1YWwob3V0cHV0Lmxlbmd0aCwgMTAwICogMTAwMCArIDk5KTsgLy8gMTAwIGxpbmVzIG9mIDEwMDAgY2hhcnMgKyA5OSBuZXdsaW5lc1xuXHR9KTtcblxuXHRzdWl0ZSgndHJ1bmNhdGVMYXJnZU91dHB1dCcsICgpID0+IHtcblx0XHR0ZXN0KCd0cnVuY2F0ZXMgd2l0aCBwcmV2aWV3IGhlYWRlciBhbmQgdGFpbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGxhcmdlT3V0cHV0ID0gJ2EnLnJlcGVhdCgzMDAwMCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0cnVuY2F0ZUxhcmdlT3V0cHV0KGxhcmdlT3V0cHV0KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIE1BWF9PVVRQVVRfTEVOR1RIKTtcblx0XHRcdG9rKHJlc3VsdC5pbmNsdWRlcygnW091dHB1dCB0b28gbGFyZ2UnKSk7XG5cdFx0XHRvayhyZXN1bHQuaW5jbHVkZXMoJ1suLi4gbWlkZGxlIG9mIG91dHB1dCB0cnVuY2F0ZWQgLi4uXScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGJvdGggaGVhZCBwcmV2aWV3IGFuZCB0YWlsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZCA9ICdIRUFEX0NPTlRFTlRfJyArICd4Jy5yZXBlYXQoNDg3KTtcblx0XHRcdGNvbnN0IG1pZGRsZSA9ICdtJy5yZXBlYXQoMjkwMDApO1xuXHRcdFx0Y29uc3QgdGFpbCA9ICdUQUlMX0NPTlRFTlRfJyArICd6Jy5yZXBlYXQoNDg3KTtcblx0XHRcdGNvbnN0IGxhcmdlT3V0cHV0ID0gaGVhZCArIG1pZGRsZSArIHRhaWw7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRydW5jYXRlTGFyZ2VPdXRwdXQobGFyZ2VPdXRwdXQpO1xuXHRcdFx0b2socmVzdWx0LmluY2x1ZGVzKCdIRUFEX0NPTlRFTlRfJyksICdzaG91bGQgaW5jbHVkZSBoZWFkIHByZXZpZXcnKTtcblx0XHRcdG9rKHJlc3VsdC5pbmNsdWRlcygnVEFJTF9DT05URU5UXycpLCAnc2hvdWxkIGluY2x1ZGUgdGFpbCcpO1xuXHRcdFx0b2socmVzdWx0Lmxlbmd0aCA8PSBNQVhfT1VUUFVUX0xFTkdUSCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBmaWxlIHBhdGggd2hlbiBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGxhcmdlT3V0cHV0ID0gJ3gnLnJlcGVhdCgzMDAwMCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0cnVuY2F0ZUxhcmdlT3V0cHV0KGxhcmdlT3V0cHV0LCAnL3RtcC9jb3BpbG90LXRlcm1pbmFsLW91dHB1dC1hYmMudHh0Jyk7XG5cdFx0XHRvayhyZXN1bHQuaW5jbHVkZXMoJy90bXAvY29waWxvdC10ZXJtaW5hbC1vdXRwdXQtYWJjLnR4dCcpKTtcblx0XHRcdG9rKHJlc3VsdC5pbmNsdWRlcygncmVhZEZpbGUnKSk7XG5cdFx0XHRvayhyZXN1bHQuaW5jbHVkZXMoJ2dyZXAnKSk7XG5cdFx0XHRvayhyZXN1bHQubGVuZ3RoIDw9IE1BWF9PVVRQVVRfTEVOR1RIKTtcblx0XHR9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
