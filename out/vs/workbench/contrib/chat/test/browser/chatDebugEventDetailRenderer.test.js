import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { URI } from "../../../../../base/common/uri.js";
import { ChatDebugLogLevel } from "../../common/chatDebugService.js";
import { formatEventDetail } from "../../browser/chatDebug/chatDebugEventDetailRenderer.js";
suite("formatEventDetail", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("toolCall - minimal", () => {
    const event = {
      kind: "toolCall",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      toolName: "readFile"
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("readFile"));
  });
  test("toolCall - with all fields", () => {
    const event = {
      kind: "toolCall",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      toolName: "grep_search",
      toolCallId: "tc-123",
      input: '{"query": "test"}',
      output: "5 results",
      result: "success",
      durationInMillis: 250
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("grep_search"));
    assert.ok(result.includes("tc-123"));
    assert.ok(result.includes("success"));
    assert.ok(result.includes("250"));
    assert.ok(result.includes('{"query": "test"}'));
    assert.ok(result.includes("5 results"));
  });
  test("modelTurn - minimal", () => {
    const event = {
      kind: "modelTurn",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date()
    };
    const result = formatEventDetail(event);
    assert.ok(result.length > 0);
  });
  test("modelTurn - with all fields", () => {
    const event = {
      kind: "modelTurn",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 80,
      totalTokens: 150,
      durationInMillis: 320
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("gpt-4o"));
    assert.ok(result.includes("100"));
    assert.ok(result.includes("50"));
    assert.ok(result.includes("80"));
    assert.ok(result.includes("150"));
    assert.ok(result.includes("320"));
  });
  test("generic event", () => {
    const event = {
      kind: "generic",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      name: "Discovery Start",
      details: "Loading instructions",
      level: ChatDebugLogLevel.Info
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("Discovery Start"));
    assert.ok(result.includes("Loading instructions"));
  });
  test("generic event without details", () => {
    const event = {
      kind: "generic",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      name: "Something",
      level: ChatDebugLogLevel.Trace
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("Something"));
  });
  test("subagentInvocation - minimal", () => {
    const event = {
      kind: "subagentInvocation",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      agentName: "Explore"
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("Explore"));
  });
  test("subagentInvocation - with all fields", () => {
    const event = {
      kind: "subagentInvocation",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      agentName: "Data",
      description: "Querying KQL",
      status: "completed",
      durationInMillis: 500,
      toolCallCount: 3,
      modelTurnCount: 2
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("Data"));
    assert.ok(result.includes("Querying KQL"));
    assert.ok(result.includes("completed"));
    assert.ok(result.includes("500"));
    assert.ok(result.includes("3"));
    assert.ok(result.includes("2"));
  });
  test("userMessage", () => {
    const event = {
      kind: "userMessage",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      message: "Help me fix this bug",
      sections: [
        { name: "System Prompt", content: "You are a helpful assistant." },
        { name: "Context", content: "file.ts attached" }
      ]
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("Help me fix this bug"));
    assert.ok(result.includes("System Prompt"));
    assert.ok(result.includes("You are a helpful assistant."));
    assert.ok(result.includes("Context"));
    assert.ok(result.includes("file.ts attached"));
  });
  test("userMessage with empty sections", () => {
    const event = {
      kind: "userMessage",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      message: "Simple prompt",
      sections: []
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("Simple prompt"));
  });
  test("agentResponse", () => {
    const event = {
      kind: "agentResponse",
      sessionResource: URI.parse("test://s1"),
      created: /* @__PURE__ */ new Date(),
      message: "Here is the fix",
      sections: [
        { name: "Code", content: "const x = 1;" }
      ]
    };
    const result = formatEventDetail(event);
    assert.ok(result.includes("Here is the fix"));
    assert.ok(result.includes("Code"));
    assert.ok(result.includes("const x = 1;"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGNoYXREZWJ1Z0V2ZW50RGV0YWlsUmVuZGVyZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z0xvZ0xldmVsLCBJQ2hhdERlYnVnQWdlbnRSZXNwb25zZUV2ZW50LCBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50LCBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQsIElDaGF0RGVidWdTdWJhZ2VudEludm9jYXRpb25FdmVudCwgSUNoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQsIElDaGF0RGVidWdVc2VyTWVzc2FnZUV2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZm9ybWF0RXZlbnREZXRhaWwgfSBmcm9tICcuLi8uLi9icm93c2VyL2NoYXREZWJ1Zy9jaGF0RGVidWdFdmVudERldGFpbFJlbmRlcmVyLmpzJztcblxuc3VpdGUoJ2Zvcm1hdEV2ZW50RGV0YWlsJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd0b29sQ2FsbCAtIG1pbmltYWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnQ6IElDaGF0RGVidWdUb29sQ2FsbEV2ZW50ID0ge1xuXHRcdFx0a2luZDogJ3Rvb2xDYWxsJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vczEnKSxcblx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHR0b29sTmFtZTogJ3JlYWRGaWxlJyxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGZvcm1hdEV2ZW50RGV0YWlsKGV2ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdyZWFkRmlsZScpKTtcblx0fSk7XG5cblx0dGVzdCgndG9vbENhbGwgLSB3aXRoIGFsbCBmaWVsZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnQ6IElDaGF0RGVidWdUb29sQ2FsbEV2ZW50ID0ge1xuXHRcdFx0a2luZDogJ3Rvb2xDYWxsJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vczEnKSxcblx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHR0b29sTmFtZTogJ2dyZXBfc2VhcmNoJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xMjMnLFxuXHRcdFx0aW5wdXQ6ICd7XCJxdWVyeVwiOiBcInRlc3RcIn0nLFxuXHRcdFx0b3V0cHV0OiAnNSByZXN1bHRzJyxcblx0XHRcdHJlc3VsdDogJ3N1Y2Nlc3MnLFxuXHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogMjUwLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gZm9ybWF0RXZlbnREZXRhaWwoZXZlbnQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2dyZXBfc2VhcmNoJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ3RjLTEyMycpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdzdWNjZXNzJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJzI1MCcpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCd7XCJxdWVyeVwiOiBcInRlc3RcIn0nKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnNSByZXN1bHRzJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbFR1cm4gLSBtaW5pbWFsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50OiBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQgPSB7XG5cdFx0XHRraW5kOiAnbW9kZWxUdXJuJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vczEnKSxcblx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBmb3JtYXRFdmVudERldGFpbChldmVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5sZW5ndGggPiAwKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWxUdXJuIC0gd2l0aCBhbGwgZmllbGRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50OiBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQgPSB7XG5cdFx0XHRraW5kOiAnbW9kZWxUdXJuJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vczEnKSxcblx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRtb2RlbDogJ2dwdC00bycsXG5cdFx0XHRpbnB1dFRva2VuczogMTAwLFxuXHRcdFx0b3V0cHV0VG9rZW5zOiA1MCxcblx0XHRcdGNhY2hlZFRva2VuczogODAsXG5cdFx0XHR0b3RhbFRva2VuczogMTUwLFxuXHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogMzIwLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gZm9ybWF0RXZlbnREZXRhaWwoZXZlbnQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ2dwdC00bycpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCcxMDAnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnNTAnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnODAnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnMTUwJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJzMyMCcpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2VuZXJpYyBldmVudCcsICgpID0+IHtcblx0XHRjb25zdCBldmVudDogSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCA9IHtcblx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vczEnKSxcblx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRuYW1lOiAnRGlzY292ZXJ5IFN0YXJ0Jyxcblx0XHRcdGRldGFpbHM6ICdMb2FkaW5nIGluc3RydWN0aW9ucycsXG5cdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGZvcm1hdEV2ZW50RGV0YWlsKGV2ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdEaXNjb3ZlcnkgU3RhcnQnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnTG9hZGluZyBpbnN0cnVjdGlvbnMnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dlbmVyaWMgZXZlbnQgd2l0aG91dCBkZXRhaWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50OiBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50ID0ge1xuXHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zMScpLFxuXHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoKSxcblx0XHRcdG5hbWU6ICdTb21ldGhpbmcnLFxuXHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLlRyYWNlLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gZm9ybWF0RXZlbnREZXRhaWwoZXZlbnQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1NvbWV0aGluZycpKTtcblx0fSk7XG5cblx0dGVzdCgnc3ViYWdlbnRJbnZvY2F0aW9uIC0gbWluaW1hbCcsICgpID0+IHtcblx0XHRjb25zdCBldmVudDogSUNoYXREZWJ1Z1N1YmFnZW50SW52b2NhdGlvbkV2ZW50ID0ge1xuXHRcdFx0a2luZDogJ3N1YmFnZW50SW52b2NhdGlvbicsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3MxJyksXG5cdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0YWdlbnROYW1lOiAnRXhwbG9yZScsXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBmb3JtYXRFdmVudERldGFpbChldmVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnRXhwbG9yZScpKTtcblx0fSk7XG5cblx0dGVzdCgnc3ViYWdlbnRJbnZvY2F0aW9uIC0gd2l0aCBhbGwgZmllbGRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50OiBJQ2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQgPSB7XG5cdFx0XHRraW5kOiAnc3ViYWdlbnRJbnZvY2F0aW9uJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vczEnKSxcblx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCksXG5cdFx0XHRhZ2VudE5hbWU6ICdEYXRhJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnUXVlcnlpbmcgS1FMJyxcblx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRkdXJhdGlvbkluTWlsbGlzOiA1MDAsXG5cdFx0XHR0b29sQ2FsbENvdW50OiAzLFxuXHRcdFx0bW9kZWxUdXJuQ291bnQ6IDIsXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBmb3JtYXRFdmVudERldGFpbChldmVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnRGF0YScpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdRdWVyeWluZyBLUUwnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnY29tcGxldGVkJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJzUwMCcpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCczJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJzInKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXJNZXNzYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50OiBJQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudCA9IHtcblx0XHRcdGtpbmQ6ICd1c2VyTWVzc2FnZScsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3MxJyksXG5cdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0bWVzc2FnZTogJ0hlbHAgbWUgZml4IHRoaXMgYnVnJyxcblx0XHRcdHNlY3Rpb25zOiBbXG5cdFx0XHRcdHsgbmFtZTogJ1N5c3RlbSBQcm9tcHQnLCBjb250ZW50OiAnWW91IGFyZSBhIGhlbHBmdWwgYXNzaXN0YW50LicgfSxcblx0XHRcdFx0eyBuYW1lOiAnQ29udGV4dCcsIGNvbnRlbnQ6ICdmaWxlLnRzIGF0dGFjaGVkJyB9LFxuXHRcdFx0XSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGZvcm1hdEV2ZW50RGV0YWlsKGV2ZW50KTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdIZWxwIG1lIGZpeCB0aGlzIGJ1ZycpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdTeXN0ZW0gUHJvbXB0JykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1lvdSBhcmUgYSBoZWxwZnVsIGFzc2lzdGFudC4nKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnQ29udGV4dCcpKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmluY2x1ZGVzKCdmaWxlLnRzIGF0dGFjaGVkJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VyTWVzc2FnZSB3aXRoIGVtcHR5IHNlY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50OiBJQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudCA9IHtcblx0XHRcdGtpbmQ6ICd1c2VyTWVzc2FnZScsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3MxJyksXG5cdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0bWVzc2FnZTogJ1NpbXBsZSBwcm9tcHQnLFxuXHRcdFx0c2VjdGlvbnM6IFtdLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gZm9ybWF0RXZlbnREZXRhaWwoZXZlbnQpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1NpbXBsZSBwcm9tcHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50UmVzcG9uc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnQ6IElDaGF0RGVidWdBZ2VudFJlc3BvbnNlRXZlbnQgPSB7XG5cdFx0XHRraW5kOiAnYWdlbnRSZXNwb25zZScsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3MxJyksXG5cdFx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgpLFxuXHRcdFx0bWVzc2FnZTogJ0hlcmUgaXMgdGhlIGZpeCcsXG5cdFx0XHRzZWN0aW9uczogW1xuXHRcdFx0XHR7IG5hbWU6ICdDb2RlJywgY29udGVudDogJ2NvbnN0IHggPSAxOycgfSxcblx0XHRcdF0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBmb3JtYXRFdmVudERldGFpbChldmVudCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnSGVyZSBpcyB0aGUgZml4JykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ0NvZGUnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnY29uc3QgeCA9IDE7JykpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsV0FBVztBQUNwQixTQUFTLHlCQUFpTTtBQUMxTSxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLDBDQUF3QztBQUV4QyxPQUFLLHNCQUFzQixNQUFNO0FBQ2hDLFVBQU0sUUFBaUM7QUFBQSxNQUN0QyxNQUFNO0FBQUEsTUFDTixpQkFBaUIsSUFBSSxNQUFNLFdBQVc7QUFBQSxNQUN0QyxTQUFTLG9CQUFJLEtBQUs7QUFBQSxNQUNsQixVQUFVO0FBQUEsSUFDWDtBQUNBLFVBQU0sU0FBUyxrQkFBa0IsS0FBSztBQUN0QyxXQUFPLEdBQUcsT0FBTyxTQUFTLFVBQVUsQ0FBQztBQUFBLEVBQ3RDLENBQUM7QUFFRCxPQUFLLDhCQUE4QixNQUFNO0FBQ3hDLFVBQU0sUUFBaUM7QUFBQSxNQUN0QyxNQUFNO0FBQUEsTUFDTixpQkFBaUIsSUFBSSxNQUFNLFdBQVc7QUFBQSxNQUN0QyxTQUFTLG9CQUFJLEtBQUs7QUFBQSxNQUNsQixVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsTUFDWixPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsTUFDUixRQUFRO0FBQUEsTUFDUixrQkFBa0I7QUFBQSxJQUNu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
