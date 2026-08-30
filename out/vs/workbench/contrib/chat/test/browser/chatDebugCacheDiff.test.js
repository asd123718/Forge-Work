import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { appendSystemDrift, appendToolsDrift, CacheDiffKind, diffPromptSignature, formatSignatureToken, parseInputMessages } from "../../browser/chatDebug/chatDebugCacheDiff.js";
function msg(role, content, name) {
  const part = { type: "text", content };
  if (name) {
    part.name = name;
  }
  return { role, ...name ? { name } : {}, parts: [part] };
}
suite("chatDebugCacheDiff", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseInputMessages", () => {
    test("parses well-formed input messages and computes byte length", () => {
      const json = JSON.stringify([msg("system", "hi"), msg("user", "hello"), msg("tool", "result", "tool_a")]);
      const parsed = parseInputMessages(json);
      assert.deepStrictEqual(parsed, [
        { role: "system", name: void 0, text: "hi", charLength: 2 },
        { role: "user", name: void 0, text: "hello", charLength: 5 },
        { role: "tool", name: "tool_a", text: "result", charLength: 6 }
      ]);
    });
    test("returns empty array for malformed inputs", () => {
      assert.deepStrictEqual(parseInputMessages(void 0), []);
      assert.deepStrictEqual(parseInputMessages(""), []);
      assert.deepStrictEqual(parseInputMessages("not json"), []);
      assert.deepStrictEqual(parseInputMessages('"a string"'), []);
    });
    test("extracts tool_call_response content and reclassifies role to tool", () => {
      const json = JSON.stringify([
        { role: "user", parts: [{ type: "tool_call_response", id: "call_1", response: "Found 12 references." }] }
      ]);
      assert.deepStrictEqual(parseInputMessages(json), [
        { role: "tool", name: void 0, text: "Found 12 references.", charLength: "Found 12 references.".length }
      ]);
    });
    test("names tool results after the matching tool_call (correlated by id)", () => {
      const json = JSON.stringify([
        { role: "assistant", parts: [{ type: "tool_call", id: "call_1", name: "read_file", arguments: { path: "/a" } }] },
        { role: "user", parts: [{ type: "tool_call_response", id: "call_1", response: "file contents" }] },
        { role: "user", parts: [{ type: "tool_call_response", id: "call_unknown", response: "orphan result" }] }
      ]);
      assert.deepStrictEqual(parseInputMessages(json).map((m) => ({ role: m.role, name: m.name })), [
        { role: "assistant", name: void 0 },
        { role: "tool", name: "read_file" },
        { role: "tool", name: void 0 }
      ]);
    });
    test("extracts tool_call arguments on assistant messages", () => {
      const json = JSON.stringify([
        { role: "assistant", parts: [{ type: "tool_call", id: "call_1", name: "fs_read", arguments: { path: "/etc/hosts" } }] }
      ]);
      const expected = `call:fs_read${JSON.stringify({ path: "/etc/hosts" })}`;
      assert.deepStrictEqual(parseInputMessages(json), [
        { role: "assistant", name: void 0, text: expected, charLength: expected.length }
      ]);
    });
    test("extracts tool_search_output content and labels role distinctly", () => {
      const payload = { id: "call_1", status: "completed", tools: [{ type: "function", name: "read_file" }] };
      const json = JSON.stringify([
        { role: "tool_search", parts: [{ type: "tool_search_output", ...payload }] }
      ]);
      const expected = JSON.stringify(payload);
      assert.deepStrictEqual(parseInputMessages(json), [
        { role: "tool_search", name: void 0, text: expected, charLength: expected.length }
      ]);
    });
  });
  suite("diffPromptSignature", () => {
    test("all identical messages produce no break and only identical tokens", () => {
      const a = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "q1")]));
      const b = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "q1")]));
      const result = diffPromptSignature(a, b);
      assert.deepStrictEqual(
        {
          break: result.break,
          counts: result.counts,
          kinds: result.signature.map((s) => s.kind),
          drift: result.drift.map((d) => d.name + ":" + d.status)
        },
        {
          break: void 0,
          counts: { identical: 2, contentDrift: 0, lengthChange: 0, onlyInA: 0, onlyInB: 0 },
          kinds: [CacheDiffKind.Identical, CacheDiffKind.Identical],
          drift: []
        }
      );
    });
    test("content drift at index 1 reports a contentDrift break", () => {
      const a = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "aaaa")]));
      const b = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "bbbb")]));
      const result = diffPromptSignature(a, b);
      assert.deepStrictEqual(
        {
          break: result.break,
          counts: result.counts,
          kinds: result.signature.map((s) => s.kind),
          drift: result.drift.map((d) => `${d.name}:${d.status}:${d.aSize}->${d.bSize}`)
        },
        {
          break: { index: 1, kind: CacheDiffKind.ContentDrift },
          counts: { identical: 1, contentDrift: 1, lengthChange: 0, onlyInA: 0, onlyInB: 0 },
          kinds: [CacheDiffKind.Identical, CacheDiffKind.ContentDrift],
          drift: ["messages[1]:contentDrift:4->4"]
        }
      );
    });
    test("length change at index 1 reports a lengthChange break", () => {
      const a = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "short")]));
      const b = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "much longer text")]));
      const result = diffPromptSignature(a, b);
      assert.deepStrictEqual(
        {
          break: result.break,
          counts: result.counts,
          kinds: result.signature.map((s) => s.kind),
          drift: result.drift.map((d) => `${d.name}:${d.status}:${d.aSize}->${d.bSize}`)
        },
        {
          break: { index: 1, kind: CacheDiffKind.LengthChange },
          counts: { identical: 1, contentDrift: 0, lengthChange: 1, onlyInA: 0, onlyInB: 0 },
          kinds: [CacheDiffKind.Identical, CacheDiffKind.LengthChange],
          drift: ["messages[1]:lengthChange:5->16"]
        }
      );
    });
    test("B has trailing messages A does not \u2014 break at first onlyInB", () => {
      const a = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "q1")]));
      const b = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "q1"), msg("assistant", "a1"), msg("user", "q2")]));
      const result = diffPromptSignature(a, b);
      assert.deepStrictEqual(
        {
          break: result.break,
          counts: result.counts,
          kinds: result.signature.map((s) => s.kind)
        },
        {
          break: { index: 2, kind: CacheDiffKind.OnlyInB },
          counts: { identical: 2, contentDrift: 0, lengthChange: 0, onlyInA: 0, onlyInB: 2 },
          kinds: [CacheDiffKind.Identical, CacheDiffKind.Identical, CacheDiffKind.OnlyInB, CacheDiffKind.OnlyInB]
        }
      );
    });
    test("A has trailing messages B does not \u2014 break at first onlyInA", () => {
      const a = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "q1"), msg("assistant", "a1")]));
      const b = parseInputMessages(JSON.stringify([msg("system", "sys"), msg("user", "q1")]));
      const result = diffPromptSignature(a, b);
      assert.deepStrictEqual(
        { break: result.break, counts: result.counts },
        {
          break: { index: 2, kind: CacheDiffKind.OnlyInA },
          counts: { identical: 2, contentDrift: 0, lengthChange: 0, onlyInA: 1, onlyInB: 0 }
        }
      );
    });
    test("appendSystemDrift inserts a system row when system instructions differ", () => {
      const drift = appendSystemDrift([], "old system", "new system!!");
      assert.deepStrictEqual(drift, [{ name: "system", status: CacheDiffKind.LengthChange, aSize: 10, bSize: 12 }]);
    });
    test("appendSystemDrift returns input unchanged when system matches", () => {
      const existing = [{ name: "messages[0]", role: "user", status: CacheDiffKind.ContentDrift, aSize: 4, bSize: 4 }];
      assert.deepStrictEqual(appendSystemDrift(existing, "sys", "sys"), existing);
    });
    test("appendToolsDrift returns input unchanged when tools match", () => {
      const existing = [{ name: "messages[0]", role: "user", status: CacheDiffKind.ContentDrift, aSize: 4, bSize: 4 }];
      assert.deepStrictEqual(appendToolsDrift(existing, "[tools]", "[tools]"), existing);
      assert.deepStrictEqual(appendToolsDrift(existing, void 0, void 0), existing);
    });
    test("appendToolsDrift classifies all kinds and inserts after a leading system entry", () => {
      const sys = { name: "system", status: CacheDiffKind.LengthChange, aSize: 4, bSize: 6 };
      const msg2 = { name: "messages[0]", role: "user", status: CacheDiffKind.ContentDrift, aSize: 4, bSize: 4 };
      assert.deepStrictEqual(
        {
          onlyInA: appendToolsDrift([msg2], "[a]", void 0),
          onlyInB: appendToolsDrift([msg2], void 0, "[b]"),
          contentDrift: appendToolsDrift([msg2], "[ab]", "[cd]"),
          lengthChange: appendToolsDrift([msg2], "[a]", "[abc]"),
          afterSystem: appendToolsDrift([sys, msg2], "[a]", "[abc]")
        },
        {
          onlyInA: [{ name: "tools", status: CacheDiffKind.OnlyInA, aSize: 3, bSize: 0 }, msg2],
          onlyInB: [{ name: "tools", status: CacheDiffKind.OnlyInB, aSize: 0, bSize: 3 }, msg2],
          contentDrift: [{ name: "tools", status: CacheDiffKind.ContentDrift, aSize: 4, bSize: 4 }, msg2],
          lengthChange: [{ name: "tools", status: CacheDiffKind.LengthChange, aSize: 3, bSize: 5 }, msg2],
          afterSystem: [sys, { name: "tools", status: CacheDiffKind.LengthChange, aSize: 3, bSize: 5 }, msg2]
        }
      );
    });
  });
  suite("formatSignatureToken", () => {
    test("formats identical, drift, and one-sided tokens", () => {
      assert.strictEqual(
        formatSignatureToken({ index: 0, kind: CacheDiffKind.Identical, aRole: "user", aCharLength: 12, bRole: "user", bCharLength: 12 }),
        "user:12"
      );
      assert.strictEqual(
        formatSignatureToken({ index: 1, kind: CacheDiffKind.LengthChange, aRole: "user", aCharLength: 5, bRole: "user", bCharLength: 8 }),
        "user:5\u21928"
      );
      assert.strictEqual(
        formatSignatureToken({ index: 2, kind: CacheDiffKind.OnlyInB, bRole: "tool", bName: "fs_read", bCharLength: 320 }),
        "tool-fs_read:0\u2192320"
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXREZWJ1Z0NhY2hlRGlmZi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBhcHBlbmRTeXN0ZW1EcmlmdCwgYXBwZW5kVG9vbHNEcmlmdCwgQ2FjaGVEaWZmS2luZCwgZGlmZlByb21wdFNpZ25hdHVyZSwgZm9ybWF0U2lnbmF0dXJlVG9rZW4sIHBhcnNlSW5wdXRNZXNzYWdlcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY2hhdERlYnVnL2NoYXREZWJ1Z0NhY2hlRGlmZi5qcyc7XG5cbmZ1bmN0aW9uIG1zZyhyb2xlOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZywgbmFtZT86IHN0cmluZykge1xuXHRjb25zdCBwYXJ0OiB7IHR5cGU6IHN0cmluZzsgY29udGVudDogc3RyaW5nOyBuYW1lPzogc3RyaW5nIH0gPSB7IHR5cGU6ICd0ZXh0JywgY29udGVudCB9O1xuXHRpZiAobmFtZSkge1xuXHRcdHBhcnQubmFtZSA9IG5hbWU7XG5cdH1cblx0cmV0dXJuIHsgcm9sZSwgLi4uKG5hbWUgPyB7IG5hbWUgfSA6IHt9KSwgcGFydHM6IFtwYXJ0XSB9O1xufVxuXG5zdWl0ZSgnY2hhdERlYnVnQ2FjaGVEaWZmJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncGFyc2VJbnB1dE1lc3NhZ2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlcyB3ZWxsLWZvcm1lZCBpbnB1dCBtZXNzYWdlcyBhbmQgY29tcHV0ZXMgYnl0ZSBsZW5ndGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoW21zZygnc3lzdGVtJywgJ2hpJyksIG1zZygndXNlcicsICdoZWxsbycpLCBtc2coJ3Rvb2wnLCAncmVzdWx0JywgJ3Rvb2xfYScpXSk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUlucHV0TWVzc2FnZXMoanNvbik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZCwgW1xuXHRcdFx0XHR7IHJvbGU6ICdzeXN0ZW0nLCBuYW1lOiB1bmRlZmluZWQsIHRleHQ6ICdoaScsIGNoYXJMZW5ndGg6IDIgfSxcblx0XHRcdFx0eyByb2xlOiAndXNlcicsIG5hbWU6IHVuZGVmaW5lZCwgdGV4dDogJ2hlbGxvJywgY2hhckxlbmd0aDogNSB9LFxuXHRcdFx0XHR7IHJvbGU6ICd0b29sJywgbmFtZTogJ3Rvb2xfYScsIHRleHQ6ICdyZXN1bHQnLCBjaGFyTGVuZ3RoOiA2IH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgZm9yIG1hbGZvcm1lZCBpbnB1dHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlSW5wdXRNZXNzYWdlcyh1bmRlZmluZWQpLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlSW5wdXRNZXNzYWdlcygnJyksIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VJbnB1dE1lc3NhZ2VzKCdub3QganNvbicpLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlSW5wdXRNZXNzYWdlcygnXCJhIHN0cmluZ1wiJyksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIHRvb2xfY2FsbF9yZXNwb25zZSBjb250ZW50IGFuZCByZWNsYXNzaWZpZXMgcm9sZSB0byB0b29sJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KFtcblx0XHRcdFx0eyByb2xlOiAndXNlcicsIHBhcnRzOiBbeyB0eXBlOiAndG9vbF9jYWxsX3Jlc3BvbnNlJywgaWQ6ICdjYWxsXzEnLCByZXNwb25zZTogJ0ZvdW5kIDEyIHJlZmVyZW5jZXMuJyB9XSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlSW5wdXRNZXNzYWdlcyhqc29uKSwgW1xuXHRcdFx0XHR7IHJvbGU6ICd0b29sJywgbmFtZTogdW5kZWZpbmVkLCB0ZXh0OiAnRm91bmQgMTIgcmVmZXJlbmNlcy4nLCBjaGFyTGVuZ3RoOiAnRm91bmQgMTIgcmVmZXJlbmNlcy4nLmxlbmd0aCB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYW1lcyB0b29sIHJlc3VsdHMgYWZ0ZXIgdGhlIG1hdGNoaW5nIHRvb2xfY2FsbCAoY29ycmVsYXRlZCBieSBpZCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoW1xuXHRcdFx0XHR7IHJvbGU6ICdhc3Npc3RhbnQnLCBwYXJ0czogW3sgdHlwZTogJ3Rvb2xfY2FsbCcsIGlkOiAnY2FsbF8xJywgbmFtZTogJ3JlYWRfZmlsZScsIGFyZ3VtZW50czogeyBwYXRoOiAnL2EnIH0gfV0gfSxcblx0XHRcdFx0eyByb2xlOiAndXNlcicsIHBhcnRzOiBbeyB0eXBlOiAndG9vbF9jYWxsX3Jlc3BvbnNlJywgaWQ6ICdjYWxsXzEnLCByZXNwb25zZTogJ2ZpbGUgY29udGVudHMnIH1dIH0sXG5cdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBwYXJ0czogW3sgdHlwZTogJ3Rvb2xfY2FsbF9yZXNwb25zZScsIGlkOiAnY2FsbF91bmtub3duJywgcmVzcG9uc2U6ICdvcnBoYW4gcmVzdWx0JyB9XSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlSW5wdXRNZXNzYWdlcyhqc29uKS5tYXAobSA9PiAoeyByb2xlOiBtLnJvbGUsIG5hbWU6IG0ubmFtZSB9KSksIFtcblx0XHRcdFx0eyByb2xlOiAnYXNzaXN0YW50JywgbmFtZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsgcm9sZTogJ3Rvb2wnLCBuYW1lOiAncmVhZF9maWxlJyB9LFxuXHRcdFx0XHR7IHJvbGU6ICd0b29sJywgbmFtZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIHRvb2xfY2FsbCBhcmd1bWVudHMgb24gYXNzaXN0YW50IG1lc3NhZ2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KFtcblx0XHRcdFx0eyByb2xlOiAnYXNzaXN0YW50JywgcGFydHM6IFt7IHR5cGU6ICd0b29sX2NhbGwnLCBpZDogJ2NhbGxfMScsIG5hbWU6ICdmc19yZWFkJywgYXJndW1lbnRzOiB7IHBhdGg6ICcvZXRjL2hvc3RzJyB9IH1dIH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gYGNhbGw6ZnNfcmVhZCR7SlNPTi5zdHJpbmdpZnkoeyBwYXRoOiAnL2V0Yy9ob3N0cycgfSl9YDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VJbnB1dE1lc3NhZ2VzKGpzb24pLCBbXG5cdFx0XHRcdHsgcm9sZTogJ2Fzc2lzdGFudCcsIG5hbWU6IHVuZGVmaW5lZCwgdGV4dDogZXhwZWN0ZWQsIGNoYXJMZW5ndGg6IGV4cGVjdGVkLmxlbmd0aCB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyB0b29sX3NlYXJjaF9vdXRwdXQgY29udGVudCBhbmQgbGFiZWxzIHJvbGUgZGlzdGluY3RseScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBheWxvYWQgPSB7IGlkOiAnY2FsbF8xJywgc3RhdHVzOiAnY29tcGxldGVkJywgdG9vbHM6IFt7IHR5cGU6ICdmdW5jdGlvbicsIG5hbWU6ICdyZWFkX2ZpbGUnIH1dIH07XG5cdFx0XHRjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoW1xuXHRcdFx0XHR7IHJvbGU6ICd0b29sX3NlYXJjaCcsIHBhcnRzOiBbeyB0eXBlOiAndG9vbF9zZWFyY2hfb3V0cHV0JywgLi4ucGF5bG9hZCB9XSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IEpTT04uc3RyaW5naWZ5KHBheWxvYWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUlucHV0TWVzc2FnZXMoanNvbiksIFtcblx0XHRcdFx0eyByb2xlOiAndG9vbF9zZWFyY2gnLCBuYW1lOiB1bmRlZmluZWQsIHRleHQ6IGV4cGVjdGVkLCBjaGFyTGVuZ3RoOiBleHBlY3RlZC5sZW5ndGggfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGlmZlByb21wdFNpZ25hdHVyZScsICgpID0+IHtcblx0XHR0ZXN0KCdhbGwgaWRlbnRpY2FsIG1lc3NhZ2VzIHByb2R1Y2Ugbm8gYnJlYWsgYW5kIG9ubHkgaWRlbnRpY2FsIHRva2VucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGEgPSBwYXJzZUlucHV0TWVzc2FnZXMoSlNPTi5zdHJpbmdpZnkoW21zZygnc3lzdGVtJywgJ3N5cycpLCBtc2coJ3VzZXInLCAncTEnKV0pKTtcblx0XHRcdGNvbnN0IGIgPSBwYXJzZUlucHV0TWVzc2FnZXMoSlNPTi5zdHJpbmdpZnkoW21zZygnc3lzdGVtJywgJ3N5cycpLCBtc2coJ3VzZXInLCAncTEnKV0pKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGRpZmZQcm9tcHRTaWduYXR1cmUoYSwgYik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YnJlYWs6IHJlc3VsdC5icmVhayxcblx0XHRcdFx0XHRjb3VudHM6IHJlc3VsdC5jb3VudHMsXG5cdFx0XHRcdFx0a2luZHM6IHJlc3VsdC5zaWduYXR1cmUubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdFx0XHRkcmlmdDogcmVzdWx0LmRyaWZ0Lm1hcChkID0+IGQubmFtZSArICc6JyArIGQuc3RhdHVzKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJyZWFrOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y291bnRzOiB7IGlkZW50aWNhbDogMiwgY29udGVudERyaWZ0OiAwLCBsZW5ndGhDaGFuZ2U6IDAsIG9ubHlJbkE6IDAsIG9ubHlJbkI6IDAgfSxcblx0XHRcdFx0XHRraW5kczogW0NhY2hlRGlmZktpbmQuSWRlbnRpY2FsLCBDYWNoZURpZmZLaW5kLklkZW50aWNhbF0sXG5cdFx0XHRcdFx0ZHJpZnQ6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnRlbnQgZHJpZnQgYXQgaW5kZXggMSByZXBvcnRzIGEgY29udGVudERyaWZ0IGJyZWFrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYSA9IHBhcnNlSW5wdXRNZXNzYWdlcyhKU09OLnN0cmluZ2lmeShbbXNnKCdzeXN0ZW0nLCAnc3lzJyksIG1zZygndXNlcicsICdhYWFhJyldKSk7XG5cdFx0XHRjb25zdCBiID0gcGFyc2VJbnB1dE1lc3NhZ2VzKEpTT04uc3RyaW5naWZ5KFttc2coJ3N5c3RlbScsICdzeXMnKSwgbXNnKCd1c2VyJywgJ2JiYmInKV0pKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGRpZmZQcm9tcHRTaWduYXR1cmUoYSwgYik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YnJlYWs6IHJlc3VsdC5icmVhayxcblx0XHRcdFx0XHRjb3VudHM6IHJlc3VsdC5jb3VudHMsXG5cdFx0XHRcdFx0a2luZHM6IHJlc3VsdC5zaWduYXR1cmUubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdFx0XHRkcmlmdDogcmVzdWx0LmRyaWZ0Lm1hcChkID0+IGAke2QubmFtZX06JHtkLnN0YXR1c306JHtkLmFTaXplfS0+JHtkLmJTaXplfWApLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YnJlYWs6IHsgaW5kZXg6IDEsIGtpbmQ6IENhY2hlRGlmZktpbmQuQ29udGVudERyaWZ0IH0sXG5cdFx0XHRcdFx0Y291bnRzOiB7IGlkZW50aWNhbDogMSwgY29udGVudERyaWZ0OiAxLCBsZW5ndGhDaGFuZ2U6IDAsIG9ubHlJbkE6IDAsIG9ubHlJbkI6IDAgfSxcblx0XHRcdFx0XHRraW5kczogW0NhY2hlRGlmZktpbmQuSWRlbnRpY2FsLCBDYWNoZURpZmZLaW5kLkNvbnRlbnREcmlmdF0sXG5cdFx0XHRcdFx0ZHJpZnQ6IFsnbWVzc2FnZXNbMV06Y29udGVudERyaWZ0OjQtPjQnXSxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZW5ndGggY2hhbmdlIGF0IGluZGV4IDEgcmVwb3J0cyBhIGxlbmd0aENoYW5nZSBicmVhaycsICgpID0+IHtcblx0XHRcdGNvbnN0IGEgPSBwYXJzZUlucHV0TWVzc2FnZXMoSlNPTi5zdHJpbmdpZnkoW21zZygnc3lzdGVtJywgJ3N5cycpLCBtc2coJ3VzZXInLCAnc2hvcnQnKV0pKTtcblx0XHRcdGNvbnN0IGIgPSBwYXJzZUlucHV0TWVzc2FnZXMoSlNPTi5zdHJpbmdpZnkoW21zZygnc3lzdGVtJywgJ3N5cycpLCBtc2coJ3VzZXInLCAnbXVjaCBsb25nZXIgdGV4dCcpXSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZGlmZlByb21wdFNpZ25hdHVyZShhLCBiKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRicmVhazogcmVzdWx0LmJyZWFrLFxuXHRcdFx0XHRcdGNvdW50czogcmVzdWx0LmNvdW50cyxcblx0XHRcdFx0XHRraW5kczogcmVzdWx0LnNpZ25hdHVyZS5tYXAocyA9PiBzLmtpbmQpLFxuXHRcdFx0XHRcdGRyaWZ0OiByZXN1bHQuZHJpZnQubWFwKGQgPT4gYCR7ZC5uYW1lfToke2Quc3RhdHVzfToke2QuYVNpemV9LT4ke2QuYlNpemV9YCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRicmVhazogeyBpbmRleDogMSwga2luZDogQ2FjaGVEaWZmS2luZC5MZW5ndGhDaGFuZ2UgfSxcblx0XHRcdFx0XHRjb3VudHM6IHsgaWRlbnRpY2FsOiAxLCBjb250ZW50RHJpZnQ6IDAsIGxlbmd0aENoYW5nZTogMSwgb25seUluQTogMCwgb25seUluQjogMCB9LFxuXHRcdFx0XHRcdGtpbmRzOiBbQ2FjaGVEaWZmS2luZC5JZGVudGljYWwsIENhY2hlRGlmZktpbmQuTGVuZ3RoQ2hhbmdlXSxcblx0XHRcdFx0XHRkcmlmdDogWydtZXNzYWdlc1sxXTpsZW5ndGhDaGFuZ2U6NS0+MTYnXSxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdCIGhhcyB0cmFpbGluZyBtZXNzYWdlcyBBIGRvZXMgbm90IFx1MjAxNCBicmVhayBhdCBmaXJzdCBvbmx5SW5CJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYSA9IHBhcnNlSW5wdXRNZXNzYWdlcyhKU09OLnN0cmluZ2lmeShbbXNnKCdzeXN0ZW0nLCAnc3lzJyksIG1zZygndXNlcicsICdxMScpXSkpO1xuXHRcdFx0Y29uc3QgYiA9IHBhcnNlSW5wdXRNZXNzYWdlcyhKU09OLnN0cmluZ2lmeShbbXNnKCdzeXN0ZW0nLCAnc3lzJyksIG1zZygndXNlcicsICdxMScpLCBtc2coJ2Fzc2lzdGFudCcsICdhMScpLCBtc2coJ3VzZXInLCAncTInKV0pKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGRpZmZQcm9tcHRTaWduYXR1cmUoYSwgYik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YnJlYWs6IHJlc3VsdC5icmVhayxcblx0XHRcdFx0XHRjb3VudHM6IHJlc3VsdC5jb3VudHMsXG5cdFx0XHRcdFx0a2luZHM6IHJlc3VsdC5zaWduYXR1cmUubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJyZWFrOiB7IGluZGV4OiAyLCBraW5kOiBDYWNoZURpZmZLaW5kLk9ubHlJbkIgfSxcblx0XHRcdFx0XHRjb3VudHM6IHsgaWRlbnRpY2FsOiAyLCBjb250ZW50RHJpZnQ6IDAsIGxlbmd0aENoYW5nZTogMCwgb25seUluQTogMCwgb25seUluQjogMiB9LFxuXHRcdFx0XHRcdGtpbmRzOiBbQ2FjaGVEaWZmS2luZC5JZGVudGljYWwsIENhY2hlRGlmZktpbmQuSWRlbnRpY2FsLCBDYWNoZURpZmZLaW5kLk9ubHlJbkIsIENhY2hlRGlmZktpbmQuT25seUluQl0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQSBoYXMgdHJhaWxpbmcgbWVzc2FnZXMgQiBkb2VzIG5vdCBcdTIwMTQgYnJlYWsgYXQgZmlyc3Qgb25seUluQScsICgpID0+IHtcblx0XHRcdGNvbnN0IGEgPSBwYXJzZUlucHV0TWVzc2FnZXMoSlNPTi5zdHJpbmdpZnkoW21zZygnc3lzdGVtJywgJ3N5cycpLCBtc2coJ3VzZXInLCAncTEnKSwgbXNnKCdhc3Npc3RhbnQnLCAnYTEnKV0pKTtcblx0XHRcdGNvbnN0IGIgPSBwYXJzZUlucHV0TWVzc2FnZXMoSlNPTi5zdHJpbmdpZnkoW21zZygnc3lzdGVtJywgJ3N5cycpLCBtc2coJ3VzZXInLCAncTEnKV0pKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGRpZmZQcm9tcHRTaWduYXR1cmUoYSwgYik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IGJyZWFrOiByZXN1bHQuYnJlYWssIGNvdW50czogcmVzdWx0LmNvdW50cyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YnJlYWs6IHsgaW5kZXg6IDIsIGtpbmQ6IENhY2hlRGlmZktpbmQuT25seUluQSB9LFxuXHRcdFx0XHRcdGNvdW50czogeyBpZGVudGljYWw6IDIsIGNvbnRlbnREcmlmdDogMCwgbGVuZ3RoQ2hhbmdlOiAwLCBvbmx5SW5BOiAxLCBvbmx5SW5COiAwIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwZW5kU3lzdGVtRHJpZnQgaW5zZXJ0cyBhIHN5c3RlbSByb3cgd2hlbiBzeXN0ZW0gaW5zdHJ1Y3Rpb25zIGRpZmZlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGRyaWZ0ID0gYXBwZW5kU3lzdGVtRHJpZnQoW10sICdvbGQgc3lzdGVtJywgJ25ldyBzeXN0ZW0hIScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkcmlmdCwgW3sgbmFtZTogJ3N5c3RlbScsIHN0YXR1czogQ2FjaGVEaWZmS2luZC5MZW5ndGhDaGFuZ2UsIGFTaXplOiAxMCwgYlNpemU6IDEyIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGVuZFN5c3RlbURyaWZ0IHJldHVybnMgaW5wdXQgdW5jaGFuZ2VkIHdoZW4gc3lzdGVtIG1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IFt7IG5hbWU6ICdtZXNzYWdlc1swXScsIHJvbGU6ICd1c2VyJywgc3RhdHVzOiBDYWNoZURpZmZLaW5kLkNvbnRlbnREcmlmdCwgYVNpemU6IDQsIGJTaXplOiA0IH1dO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcHBlbmRTeXN0ZW1EcmlmdChleGlzdGluZywgJ3N5cycsICdzeXMnKSwgZXhpc3RpbmcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwZW5kVG9vbHNEcmlmdCByZXR1cm5zIGlucHV0IHVuY2hhbmdlZCB3aGVuIHRvb2xzIG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBbeyBuYW1lOiAnbWVzc2FnZXNbMF0nLCByb2xlOiAndXNlcicsIHN0YXR1czogQ2FjaGVEaWZmS2luZC5Db250ZW50RHJpZnQsIGFTaXplOiA0LCBiU2l6ZTogNCB9XTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwZW5kVG9vbHNEcmlmdChleGlzdGluZywgJ1t0b29sc10nLCAnW3Rvb2xzXScpLCBleGlzdGluZyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGVuZFRvb2xzRHJpZnQoZXhpc3RpbmcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgZXhpc3RpbmcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwZW5kVG9vbHNEcmlmdCBjbGFzc2lmaWVzIGFsbCBraW5kcyBhbmQgaW5zZXJ0cyBhZnRlciBhIGxlYWRpbmcgc3lzdGVtIGVudHJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3lzID0geyBuYW1lOiAnc3lzdGVtJywgc3RhdHVzOiBDYWNoZURpZmZLaW5kLkxlbmd0aENoYW5nZSwgYVNpemU6IDQsIGJTaXplOiA2IH07XG5cdFx0XHRjb25zdCBtc2cgPSB7IG5hbWU6ICdtZXNzYWdlc1swXScsIHJvbGU6ICd1c2VyJywgc3RhdHVzOiBDYWNoZURpZmZLaW5kLkNvbnRlbnREcmlmdCwgYVNpemU6IDQsIGJTaXplOiA0IH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b25seUluQTogYXBwZW5kVG9vbHNEcmlmdChbbXNnXSwgJ1thXScsIHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0b25seUluQjogYXBwZW5kVG9vbHNEcmlmdChbbXNnXSwgdW5kZWZpbmVkLCAnW2JdJyksXG5cdFx0XHRcdFx0Y29udGVudERyaWZ0OiBhcHBlbmRUb29sc0RyaWZ0KFttc2ddLCAnW2FiXScsICdbY2RdJyksXG5cdFx0XHRcdFx0bGVuZ3RoQ2hhbmdlOiBhcHBlbmRUb29sc0RyaWZ0KFttc2ddLCAnW2FdJywgJ1thYmNdJyksXG5cdFx0XHRcdFx0YWZ0ZXJTeXN0ZW06IGFwcGVuZFRvb2xzRHJpZnQoW3N5cywgbXNnXSwgJ1thXScsICdbYWJjXScpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b25seUluQTogW3sgbmFtZTogJ3Rvb2xzJywgc3RhdHVzOiBDYWNoZURpZmZLaW5kLk9ubHlJbkEsIGFTaXplOiAzLCBiU2l6ZTogMCB9LCBtc2ddLFxuXHRcdFx0XHRcdG9ubHlJbkI6IFt7IG5hbWU6ICd0b29scycsIHN0YXR1czogQ2FjaGVEaWZmS2luZC5Pbmx5SW5CLCBhU2l6ZTogMCwgYlNpemU6IDMgfSwgbXNnXSxcblx0XHRcdFx0XHRjb250ZW50RHJpZnQ6IFt7IG5hbWU6ICd0b29scycsIHN0YXR1czogQ2FjaGVEaWZmS2luZC5Db250ZW50RHJpZnQsIGFTaXplOiA0LCBiU2l6ZTogNCB9LCBtc2ddLFxuXHRcdFx0XHRcdGxlbmd0aENoYW5nZTogW3sgbmFtZTogJ3Rvb2xzJywgc3RhdHVzOiBDYWNoZURpZmZLaW5kLkxlbmd0aENoYW5nZSwgYVNpemU6IDMsIGJTaXplOiA1IH0sIG1zZ10sXG5cdFx0XHRcdFx0YWZ0ZXJTeXN0ZW06IFtzeXMsIHsgbmFtZTogJ3Rvb2xzJywgc3RhdHVzOiBDYWNoZURpZmZLaW5kLkxlbmd0aENoYW5nZSwgYVNpemU6IDMsIGJTaXplOiA1IH0sIG1zZ10sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZm9ybWF0U2lnbmF0dXJlVG9rZW4nLCAoKSA9PiB7XG5cdFx0dGVzdCgnZm9ybWF0cyBpZGVudGljYWwsIGRyaWZ0LCBhbmQgb25lLXNpZGVkIHRva2VucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Zm9ybWF0U2lnbmF0dXJlVG9rZW4oeyBpbmRleDogMCwga2luZDogQ2FjaGVEaWZmS2luZC5JZGVudGljYWwsIGFSb2xlOiAndXNlcicsIGFDaGFyTGVuZ3RoOiAxMiwgYlJvbGU6ICd1c2VyJywgYkNoYXJMZW5ndGg6IDEyIH0pLFxuXHRcdFx0XHQndXNlcjoxMicsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRmb3JtYXRTaWduYXR1cmVUb2tlbih7IGluZGV4OiAxLCBraW5kOiBDYWNoZURpZmZLaW5kLkxlbmd0aENoYW5nZSwgYVJvbGU6ICd1c2VyJywgYUNoYXJMZW5ndGg6IDUsIGJSb2xlOiAndXNlcicsIGJDaGFyTGVuZ3RoOiA4IH0pLFxuXHRcdFx0XHQndXNlcjo1XFx1MjE5MjgnLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Zm9ybWF0U2lnbmF0dXJlVG9rZW4oeyBpbmRleDogMiwga2luZDogQ2FjaGVEaWZmS2luZC5Pbmx5SW5CLCBiUm9sZTogJ3Rvb2wnLCBiTmFtZTogJ2ZzX3JlYWQnLCBiQ2hhckxlbmd0aDogMzIwIH0pLFxuXHRcdFx0XHQndG9vbC1mc19yZWFkOjBcXHUyMTkyMzIwJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUIsa0JBQWtCLGVBQWUscUJBQXFCLHNCQUFzQiwwQkFBMEI7QUFFbEksU0FBUyxJQUFJLE1BQWMsU0FBaUIsTUFBZTtBQUMxRCxRQUFNLE9BQXlELEVBQUUsTUFB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QSxVQUNqRCxjQUFjLGlCQUFpQixDQUFDQSxJQUFHLEdBQUcsUUFBUSxNQUFNO0FBQUEsVUFDcEQsY0FBYyxpQkFBaUIsQ0FBQ0EsSUFBRyxHQUFHLE9BQU8sT0FBTztBQUFBLFVBQ3BELGFBQWEsaUJBQWlCLENBQUMsS0FBS0EsSUFBRyxHQUFHLE9BQU8sT0FBTztBQUFBLFFBQ3pEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsU0FBUyxDQUFDLEVBQUUsTUFBTSxTQUFTLFFBQVEsY0FBYyxTQUFTLE9BQU8sR0FBRyxPQUFPLEVBQUUsR0FBR0EsSUFBRztBQUFBLFVBQ25GLFNBQVMsQ0FBQyxFQUFFLE1BQU0sU0FBUyxRQUFRLGNBQWMsU0FBUyxPQUFPLEdBQUcsT0FBTyxFQUFFLEdBQUdBLElBQUc7QUFBQSxVQUNuRixjQUFjLENBQUMsRUFBRSxNQUFNLFNBQVMsUUFBUSxjQUFjLGNBQWMsT0FBTyxHQUFHLE9BQU8sRUFBRSxHQUFHQSxJQUFHO0FBQUEsVUFDN0YsY0FBYyxDQUFDLEVBQUUsTUFBTSxTQUFTLFFBQVEsY0FBYyxjQUFjLE9BQU8sR0FBRyxPQUFPLEVBQUUsR0FBR0EsSUFBRztBQUFBLFVBQzdGLGFBQWEsQ0FBQyxLQUFLLEVBQUUsTUFBTSxTQUFTLFFBQVEsY0FBYyxjQUFjLE9BQU8sR0FBRyxPQUFPLEVBQUUsR0FBR0EsSUFBRztBQUFBLFFBQ2xHO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sd0JBQXdCLE1BQU07QUFDbkMsU0FBSyxrREFBa0QsTUFBTTtBQUM1RCxhQUFPO0FBQUEsUUFDTixxQkFBcUIsRUFBRSxPQUFPLEdBQUcsTUFBTSxjQUFjLFdBQVcsT0FBTyxRQUFRLGFBQWEsSUFBSSxPQUFPLFFBQVEsYUFBYSxHQUFHLENBQUM7QUFBQSxRQUNoSTtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsUUFDTixxQkFBcUIsRUFBRSxPQUFPLEdBQUcsTUFBTSxjQUFjLGNBQWMsT0FBTyxRQUFRLGFBQWEsR0FBRyxPQUFPLFFBQVEsYUFBYSxFQUFFLENBQUM7QUFBQSxRQUNqSTtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsUUFDTixxQkFBcUIsRUFBRSxPQUFPLEdBQUcsTUFBTSxjQUFjLFNBQVMsT0FBTyxRQUFRLE9BQU8sV0FBVyxhQUFhLElBQUksQ0FBQztBQUFBLFFBQ2pIO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbIm1zZyJdCn0K
