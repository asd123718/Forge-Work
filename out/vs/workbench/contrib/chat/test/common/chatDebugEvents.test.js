import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ChatDebugLogLevel } from "../../common/chatDebugService.js";
import { debugEventMatchesText, filterDebugEvents, filterDebugEventsByText, parseTimeToken, stripTimestampTokens } from "../../common/chatDebugEvents.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const sessionResource = URI.parse("vscode-chat-session://local/test");
function makeGenericEvent(overrides = {}) {
  return {
    kind: "generic",
    sessionResource,
    created: /* @__PURE__ */ new Date("2026-03-10T12:00:00Z"),
    name: "test-event",
    level: ChatDebugLogLevel.Info,
    ...overrides
  };
}
function makeToolCallEvent(overrides = {}) {
  return {
    kind: "toolCall",
    sessionResource,
    created: /* @__PURE__ */ new Date("2026-03-10T12:01:00Z"),
    toolName: "readFile",
    ...overrides
  };
}
function makeModelTurnEvent(overrides = {}) {
  return {
    kind: "modelTurn",
    sessionResource,
    created: /* @__PURE__ */ new Date("2026-03-10T12:02:00Z"),
    model: "gpt-4o",
    requestName: "chat-request",
    ...overrides
  };
}
function makeSubagentEvent(overrides = {}) {
  return {
    kind: "subagentInvocation",
    sessionResource,
    created: /* @__PURE__ */ new Date("2026-03-10T12:03:00Z"),
    agentName: "explorer",
    ...overrides
  };
}
function makeUserMessageEvent(overrides = {}) {
  return {
    kind: "userMessage",
    sessionResource,
    created: /* @__PURE__ */ new Date("2026-03-10T12:04:00Z"),
    message: "hello world",
    sections: [],
    ...overrides
  };
}
function makeAgentResponseEvent(overrides = {}) {
  return {
    kind: "agentResponse",
    sessionResource,
    created: /* @__PURE__ */ new Date("2026-03-10T12:05:00Z"),
    message: "Here is the answer",
    sections: [],
    ...overrides
  };
}
suite("chatDebugEvents", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("debugEventMatchesText", () => {
    test("matches event kind", () => {
      assert.strictEqual(debugEventMatchesText(makeToolCallEvent(), "toolcall"), true);
      assert.strictEqual(debugEventMatchesText(makeToolCallEvent(), "generic"), false);
    });
    test("matches toolCall tool name", () => {
      assert.strictEqual(debugEventMatchesText(makeToolCallEvent({ toolName: "readFile" }), "readfile"), true);
      assert.strictEqual(debugEventMatchesText(makeToolCallEvent({ toolName: "readFile" }), "writefile"), false);
    });
    test("matches toolCall input and output", () => {
      const event = makeToolCallEvent({ input: "path/to/file.ts", output: "file contents" });
      assert.strictEqual(debugEventMatchesText(event, "path/to"), true);
      assert.strictEqual(debugEventMatchesText(event, "contents"), true);
      assert.strictEqual(debugEventMatchesText(event, "missing"), false);
    });
    test("matches modelTurn model and requestName", () => {
      assert.strictEqual(debugEventMatchesText(makeModelTurnEvent({ model: "gpt-4o" }), "gpt-4o"), true);
      assert.strictEqual(debugEventMatchesText(makeModelTurnEvent({ requestName: "chat-request" }), "chat-request"), true);
    });
    test("matches generic event name, details, and category", () => {
      const event = makeGenericEvent({ name: "discovery", details: "loaded 5 files", category: "instructions" });
      assert.strictEqual(debugEventMatchesText(event, "discovery"), true);
      assert.strictEqual(debugEventMatchesText(event, "loaded"), true);
      assert.strictEqual(debugEventMatchesText(event, "instructions"), true);
      assert.strictEqual(debugEventMatchesText(event, "missing"), false);
    });
    test("matches subagentInvocation agent name and description", () => {
      const event = makeSubagentEvent({ agentName: "explorer", description: "search codebase" });
      assert.strictEqual(debugEventMatchesText(event, "explorer"), true);
      assert.strictEqual(debugEventMatchesText(event, "codebase"), true);
    });
    test("matches userMessage message and sections", () => {
      const event = makeUserMessageEvent({
        message: "fix the bug",
        sections: [{ name: "system", content: "you are a helpful assistant" }]
      });
      assert.strictEqual(debugEventMatchesText(event, "fix"), true);
      assert.strictEqual(debugEventMatchesText(event, "system"), true);
      assert.strictEqual(debugEventMatchesText(event, "helpful"), true);
    });
    test("matches agentResponse message and sections", () => {
      const event = makeAgentResponseEvent({
        message: "done",
        sections: [{ name: "result", content: "applied 3 edits" }]
      });
      assert.strictEqual(debugEventMatchesText(event, "done"), true);
      assert.strictEqual(debugEventMatchesText(event, "result"), true);
      assert.strictEqual(debugEventMatchesText(event, "edits"), true);
    });
  });
  suite("parseTimeToken", () => {
    test("parses year-only before token", () => {
      const result = parseTimeToken("before:2026", "before");
      assert.strictEqual(result, new Date(2026, 11, 31, 23, 59, 59, 999).getTime());
    });
    test("parses year-month before token", () => {
      const result = parseTimeToken("before:2026-03", "before");
      assert.strictEqual(result, new Date(2026, 3, 0, 23, 59, 59, 999).getTime());
    });
    test("parses full date before token", () => {
      const result = parseTimeToken("before:2026-03-10", "before");
      assert.strictEqual(result, new Date(2026, 2, 10, 23, 59, 59, 999).getTime());
    });
    test("parses year-only after token", () => {
      const result = parseTimeToken("after:2026", "after");
      assert.strictEqual(result, new Date(2026, 0, 1, 0, 0, 0, 0).getTime());
    });
    test("parses full date after token", () => {
      const result = parseTimeToken("after:2026-03-10", "after");
      assert.strictEqual(result, new Date(2026, 2, 10, 0, 0, 0, 0).getTime());
    });
    test("returns undefined when token is absent", () => {
      assert.strictEqual(parseTimeToken("some text", "before"), void 0);
      assert.strictEqual(parseTimeToken("some text", "after"), void 0);
    });
  });
  suite("stripTimestampTokens", () => {
    test("strips before token", () => {
      assert.strictEqual(stripTimestampTokens("before:2026-03 hello"), "hello");
    });
    test("strips after token", () => {
      assert.strictEqual(stripTimestampTokens("after:2026-03-10 hello"), "hello");
    });
    test("strips both tokens", () => {
      assert.strictEqual(stripTimestampTokens("after:2026-03 before:2026-04 hello"), "hello");
    });
    test("returns text unchanged when no tokens", () => {
      assert.strictEqual(stripTimestampTokens("hello world"), "hello world");
    });
  });
  suite("filterDebugEventsByText", () => {
    const events = [
      makeGenericEvent({ name: "discovery", category: "instructions", created: new Date(2026, 2, 10, 10, 0, 0) }),
      makeToolCallEvent({ toolName: "readFile", created: new Date(2026, 2, 10, 11, 0, 0) }),
      makeToolCallEvent({ toolName: "writeFile", created: new Date(2026, 2, 10, 12, 0, 0) }),
      makeModelTurnEvent({ model: "gpt-4o", created: new Date(2026, 2, 10, 13, 0, 0) })
    ];
    test("filters by inclusion term", () => {
      const result = filterDebugEventsByText(events, "readfile");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].toolName, "readFile");
    });
    test("filters by exclusion term", () => {
      const result = filterDebugEventsByText(events, "!readfile");
      assert.strictEqual(result.length, 3);
    });
    test("handles comma-separated terms as OR", () => {
      const result = filterDebugEventsByText(events, "readfile, writefile");
      assert.strictEqual(result.length, 2);
    });
    test("combines inclusion and exclusion", () => {
      const result = filterDebugEventsByText(events, "toolcall, !readfile");
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].toolName, "writeFile");
    });
    test("filters by before timestamp", () => {
      const result = filterDebugEventsByText(events, "before:2026-03-10t11");
      assert.strictEqual(result.length, 2);
    });
    test("filters by after timestamp", () => {
      const result = filterDebugEventsByText(events, "after:2026-03-10t12");
      assert.strictEqual(result.length, 2);
    });
    test("combines timestamp and text filters", () => {
      const result = filterDebugEventsByText(events, "after:2026-03-10t11 toolcall");
      assert.strictEqual(result.length, 2);
    });
    test("returns all events with empty filter", () => {
      const result = filterDebugEventsByText(events, "");
      assert.strictEqual(result.length, 4);
    });
  });
  suite("filterDebugEvents", () => {
    const events = [
      makeGenericEvent({ name: "event-1", created: /* @__PURE__ */ new Date("2026-03-10T10:00:00Z") }),
      makeToolCallEvent({ toolName: "readFile", created: /* @__PURE__ */ new Date("2026-03-10T11:00:00Z") }),
      makeToolCallEvent({ toolName: "writeFile", created: /* @__PURE__ */ new Date("2026-03-10T12:00:00Z") }),
      makeModelTurnEvent({ model: "gpt-4o", created: /* @__PURE__ */ new Date("2026-03-10T13:00:00Z") }),
      makeSubagentEvent({ agentName: "explorer", created: /* @__PURE__ */ new Date("2026-03-10T14:00:00Z") })
    ];
    test("returns all events with empty options", () => {
      assert.deepStrictEqual(filterDebugEvents(events, {}), events);
    });
    test("filters by kind", () => {
      const result = filterDebugEvents(events, { kind: "toolCall" });
      assert.strictEqual(result.length, 2);
      assert.ok(result.every((e) => e.kind === "toolCall"));
    });
    test("filters by kind with no matches", () => {
      const result = filterDebugEvents(events, { kind: "userMessage" });
      assert.strictEqual(result.length, 0);
    });
    test("filters by text", () => {
      const result = filterDebugEvents(events, { filter: "readfile" });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].toolName, "readFile");
    });
    test("limits to N most recent", () => {
      const result = filterDebugEvents(events, { limit: 2 });
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].kind, "modelTurn");
      assert.strictEqual(result[1].kind, "subagentInvocation");
    });
    test("limit larger than event count returns all", () => {
      const result = filterDebugEvents(events, { limit: 100 });
      assert.strictEqual(result.length, 5);
    });
    test("limit of 0 returns all", () => {
      const result = filterDebugEvents(events, { limit: 0 });
      assert.strictEqual(result.length, 5);
    });
    test("limit of negative returns all", () => {
      const result = filterDebugEvents(events, { limit: -1 });
      assert.strictEqual(result.length, 5);
    });
    test("combines kind and text filters", () => {
      const result = filterDebugEvents(events, { kind: "toolCall", filter: "readfile" });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].toolName, "readFile");
    });
    test("combines kind and limit", () => {
      const result = filterDebugEvents(events, { kind: "toolCall", limit: 1 });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].toolName, "writeFile");
    });
    test("combines text filter and limit", () => {
      const result = filterDebugEvents(events, { filter: "toolcall", limit: 1 });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].toolName, "writeFile");
    });
    test("combines all three filters", () => {
      const allToolCalls = [
        makeToolCallEvent({ toolName: "readFile", created: /* @__PURE__ */ new Date("2026-03-10T10:00:00Z") }),
        makeToolCallEvent({ toolName: "writeFile", created: /* @__PURE__ */ new Date("2026-03-10T11:00:00Z") }),
        makeToolCallEvent({ toolName: "listDir", created: /* @__PURE__ */ new Date("2026-03-10T12:00:00Z") }),
        makeGenericEvent({ name: "unrelated", created: /* @__PURE__ */ new Date("2026-03-10T13:00:00Z") })
      ];
      const result = filterDebugEvents(allToolCalls, { kind: "toolCall", filter: "!readfile", limit: 1 });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].toolName, "listDir");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY2hhdERlYnVnRXZlbnRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnTG9nTGV2ZWwsIElDaGF0RGVidWdFdmVudCwgSUNoYXREZWJ1Z0dlbmVyaWNFdmVudCwgSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50LCBJQ2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQsIElDaGF0RGVidWdUb29sQ2FsbEV2ZW50LCBJQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudCwgSUNoYXREZWJ1Z0FnZW50UmVzcG9uc2VFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlYnVnRXZlbnRNYXRjaGVzVGV4dCwgZmlsdGVyRGVidWdFdmVudHMsIGZpbHRlckRlYnVnRXZlbnRzQnlUZXh0LCBwYXJzZVRpbWVUb2tlbiwgc3RyaXBUaW1lc3RhbXBUb2tlbnMgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdERlYnVnRXZlbnRzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5jb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9sb2NhbC90ZXN0Jyk7XG5cbmZ1bmN0aW9uIG1ha2VHZW5lcmljRXZlbnQob3ZlcnJpZGVzOiBQYXJ0aWFsPElDaGF0RGVidWdHZW5lcmljRXZlbnQ+ID0ge30pOiBJQ2hhdERlYnVnR2VuZXJpY0V2ZW50IHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKCcyMDI2LTAzLTEwVDEyOjAwOjAwWicpLFxuXHRcdG5hbWU6ICd0ZXN0LWV2ZW50Jyxcblx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbyxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VUb29sQ2FsbEV2ZW50KG92ZXJyaWRlczogUGFydGlhbDxJQ2hhdERlYnVnVG9vbENhbGxFdmVudD4gPSB7fSk6IElDaGF0RGVidWdUb29sQ2FsbEV2ZW50IHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAndG9vbENhbGwnLFxuXHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMy0xMFQxMjowMTowMFonKSxcblx0XHR0b29sTmFtZTogJ3JlYWRGaWxlJyxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VNb2RlbFR1cm5FdmVudChvdmVycmlkZXM6IFBhcnRpYWw8SUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50PiA9IHt9KTogSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50IHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAnbW9kZWxUdXJuJyxcblx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0Y3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDMtMTBUMTI6MDI6MDBaJyksXG5cdFx0bW9kZWw6ICdncHQtNG8nLFxuXHRcdHJlcXVlc3ROYW1lOiAnY2hhdC1yZXF1ZXN0Jyxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VTdWJhZ2VudEV2ZW50KG92ZXJyaWRlczogUGFydGlhbDxJQ2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQ+ID0ge30pOiBJQ2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdzdWJhZ2VudEludm9jYXRpb24nLFxuXHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMy0xMFQxMjowMzowMFonKSxcblx0XHRhZ2VudE5hbWU6ICdleHBsb3JlcicsXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlVXNlck1lc3NhZ2VFdmVudChvdmVycmlkZXM6IFBhcnRpYWw8SUNoYXREZWJ1Z1VzZXJNZXNzYWdlRXZlbnQ+ID0ge30pOiBJQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudCB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3VzZXJNZXNzYWdlJyxcblx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0Y3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDMtMTBUMTI6MDQ6MDBaJyksXG5cdFx0bWVzc2FnZTogJ2hlbGxvIHdvcmxkJyxcblx0XHRzZWN0aW9uczogW10sXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlQWdlbnRSZXNwb25zZUV2ZW50KG92ZXJyaWRlczogUGFydGlhbDxJQ2hhdERlYnVnQWdlbnRSZXNwb25zZUV2ZW50PiA9IHt9KTogSUNoYXREZWJ1Z0FnZW50UmVzcG9uc2VFdmVudCB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2FnZW50UmVzcG9uc2UnLFxuXHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRjcmVhdGVkOiBuZXcgRGF0ZSgnMjAyNi0wMy0xMFQxMjowNTowMFonKSxcblx0XHRtZXNzYWdlOiAnSGVyZSBpcyB0aGUgYW5zd2VyJyxcblx0XHRzZWN0aW9uczogW10sXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5zdWl0ZSgnY2hhdERlYnVnRXZlbnRzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdkZWJ1Z0V2ZW50TWF0Y2hlc1RleHQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbWF0Y2hlcyBldmVudCBraW5kJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnRXZlbnRNYXRjaGVzVGV4dChtYWtlVG9vbENhbGxFdmVudCgpLCAndG9vbGNhbGwnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVidWdFdmVudE1hdGNoZXNUZXh0KG1ha2VUb29sQ2FsbEV2ZW50KCksICdnZW5lcmljJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgdG9vbENhbGwgdG9vbCBuYW1lJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnRXZlbnRNYXRjaGVzVGV4dChtYWtlVG9vbENhbGxFdmVudCh7IHRvb2xOYW1lOiAncmVhZEZpbGUnIH0pLCAncmVhZGZpbGUnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVidWdFdmVudE1hdGNoZXNUZXh0KG1ha2VUb29sQ2FsbEV2ZW50KHsgdG9vbE5hbWU6ICdyZWFkRmlsZScgfSksICd3cml0ZWZpbGUnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyB0b29sQ2FsbCBpbnB1dCBhbmQgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBtYWtlVG9vbENhbGxFdmVudCh7IGlucHV0OiAncGF0aC90by9maWxlLnRzJywgb3V0cHV0OiAnZmlsZSBjb250ZW50cycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVidWdFdmVudE1hdGNoZXNUZXh0KGV2ZW50LCAncGF0aC90bycpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWJ1Z0V2ZW50TWF0Y2hlc1RleHQoZXZlbnQsICdjb250ZW50cycpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWJ1Z0V2ZW50TWF0Y2hlc1RleHQoZXZlbnQsICdtaXNzaW5nJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgbW9kZWxUdXJuIG1vZGVsIGFuZCByZXF1ZXN0TmFtZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWJ1Z0V2ZW50TWF0Y2hlc1RleHQobWFrZU1vZGVsVHVybkV2ZW50KHsgbW9kZWw6ICdncHQtNG8nIH0pLCAnZ3B0LTRvJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnRXZlbnRNYXRjaGVzVGV4dChtYWtlTW9kZWxUdXJuRXZlbnQoeyByZXF1ZXN0TmFtZTogJ2NoYXQtcmVxdWVzdCcgfSksICdjaGF0LXJlcXVlc3QnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGdlbmVyaWMgZXZlbnQgbmFtZSwgZGV0YWlscywgYW5kIGNhdGVnb3J5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBtYWtlR2VuZXJpY0V2ZW50KHsgbmFtZTogJ2Rpc2NvdmVyeScsIGRldGFpbHM6ICdsb2FkZWQgNSBmaWxlcycsIGNhdGVnb3J5OiAnaW5zdHJ1Y3Rpb25zJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWJ1Z0V2ZW50TWF0Y2hlc1RleHQoZXZlbnQsICdkaXNjb3ZlcnknKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVidWdFdmVudE1hdGNoZXNUZXh0KGV2ZW50LCAnbG9hZGVkJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnRXZlbnRNYXRjaGVzVGV4dChldmVudCwgJ2luc3RydWN0aW9ucycpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWJ1Z0V2ZW50TWF0Y2hlc1RleHQoZXZlbnQsICdtaXNzaW5nJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgc3ViYWdlbnRJbnZvY2F0aW9uIGFnZW50IG5hbWUgYW5kIGRlc2NyaXB0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBtYWtlU3ViYWdlbnRFdmVudCh7IGFnZW50TmFtZTogJ2V4cGxvcmVyJywgZGVzY3JpcHRpb246ICdzZWFyY2ggY29kZWJhc2UnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnRXZlbnRNYXRjaGVzVGV4dChldmVudCwgJ2V4cGxvcmVyJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnRXZlbnRNYXRjaGVzVGV4dChldmVudCwgJ2NvZGViYXNlJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyB1c2VyTWVzc2FnZSBtZXNzYWdlIGFuZCBzZWN0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbWFrZVVzZXJNZXNzYWdlRXZlbnQoe1xuXHRcdFx0XHRtZXNzYWdlOiAnZml4IHRoZSBidWcnLFxuXHRcdFx0XHRzZWN0aW9uczogW3sgbmFtZTogJ3N5c3RlbScsIGNvbnRlbnQ6ICd5b3UgYXJlIGEgaGVscGZ1bCBhc3Npc3RhbnQnIH1dLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVidWdFdmVudE1hdGNoZXNUZXh0KGV2ZW50LCAnZml4JyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnRXZlbnRNYXRjaGVzVGV4dChldmVudCwgJ3N5c3RlbScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWJ1Z0V2ZW50TWF0Y2hlc1RleHQoZXZlbnQsICdoZWxwZnVsJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBhZ2VudFJlc3BvbnNlIG1lc3NhZ2UgYW5kIHNlY3Rpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBtYWtlQWdlbnRSZXNwb25zZUV2ZW50KHtcblx0XHRcdFx0bWVzc2FnZTogJ2RvbmUnLFxuXHRcdFx0XHRzZWN0aW9uczogW3sgbmFtZTogJ3Jlc3VsdCcsIGNvbnRlbnQ6ICdhcHBsaWVkIDMgZWRpdHMnIH1dLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVidWdFdmVudE1hdGNoZXNUZXh0KGV2ZW50LCAnZG9uZScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWJ1Z0V2ZW50TWF0Y2hlc1RleHQoZXZlbnQsICdyZXN1bHQnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVidWdFdmVudE1hdGNoZXNUZXh0KGV2ZW50LCAnZWRpdHMnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZVRpbWVUb2tlbicsICgpID0+IHtcblx0XHR0ZXN0KCdwYXJzZXMgeWVhci1vbmx5IGJlZm9yZSB0b2tlbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlVGltZVRva2VuKCdiZWZvcmU6MjAyNicsICdiZWZvcmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIG5ldyBEYXRlKDIwMjYsIDExLCAzMSwgMjMsIDU5LCA1OSwgOTk5KS5nZXRUaW1lKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIHllYXItbW9udGggYmVmb3JlIHRva2VuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VUaW1lVG9rZW4oJ2JlZm9yZToyMDI2LTAzJywgJ2JlZm9yZScpO1xuXHRcdFx0Ly8gRW5kIG9mIE1hcmNoIDIwMjZcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIG5ldyBEYXRlKDIwMjYsIDMsIDAsIDIzLCA1OSwgNTksIDk5OSkuZ2V0VGltZSgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBmdWxsIGRhdGUgYmVmb3JlIHRva2VuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VUaW1lVG9rZW4oJ2JlZm9yZToyMDI2LTAzLTEwJywgJ2JlZm9yZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgbmV3IERhdGUoMjAyNiwgMiwgMTAsIDIzLCA1OSwgNTksIDk5OSkuZ2V0VGltZSgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyB5ZWFyLW9ubHkgYWZ0ZXIgdG9rZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVRpbWVUb2tlbignYWZ0ZXI6MjAyNicsICdhZnRlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgbmV3IERhdGUoMjAyNiwgMCwgMSwgMCwgMCwgMCwgMCkuZ2V0VGltZSgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBmdWxsIGRhdGUgYWZ0ZXIgdG9rZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVRpbWVUb2tlbignYWZ0ZXI6MjAyNi0wMy0xMCcsICdhZnRlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgbmV3IERhdGUoMjAyNiwgMiwgMTAsIDAsIDAsIDAsIDApLmdldFRpbWUoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRva2VuIGlzIGFic2VudCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVRpbWVUb2tlbignc29tZSB0ZXh0JywgJ2JlZm9yZScpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlVGltZVRva2VuKCdzb21lIHRleHQnLCAnYWZ0ZXInKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3N0cmlwVGltZXN0YW1wVG9rZW5zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3N0cmlwcyBiZWZvcmUgdG9rZW4nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaXBUaW1lc3RhbXBUb2tlbnMoJ2JlZm9yZToyMDI2LTAzIGhlbGxvJyksICdoZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIGFmdGVyIHRva2VuJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmlwVGltZXN0YW1wVG9rZW5zKCdhZnRlcjoyMDI2LTAzLTEwIGhlbGxvJyksICdoZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIGJvdGggdG9rZW5zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmlwVGltZXN0YW1wVG9rZW5zKCdhZnRlcjoyMDI2LTAzIGJlZm9yZToyMDI2LTA0IGhlbGxvJyksICdoZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0ZXh0IHVuY2hhbmdlZCB3aGVuIG5vIHRva2VucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpcFRpbWVzdGFtcFRva2VucygnaGVsbG8gd29ybGQnKSwgJ2hlbGxvIHdvcmxkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaWx0ZXJEZWJ1Z0V2ZW50c0J5VGV4dCcsICgpID0+IHtcblx0XHQvLyBwYXJzZVRpbWVUb2tlbiB1c2VzIGxvY2FsLXRpbWUgRGF0ZSBjb25zdHJ1Y3RvcnMsIHNvIGV2ZW50IHRpbWVzdGFtcHNcblx0XHQvLyBtdXN0IGFsc28gYmUgaW4gbG9jYWwgdGltZSB0byBwcm9kdWNlIHByZWRpY3RhYmxlIGNvbXBhcmlzb25zLlxuXHRcdGNvbnN0IGV2ZW50czogcmVhZG9ubHkgSUNoYXREZWJ1Z0V2ZW50W10gPSBbXG5cdFx0XHRtYWtlR2VuZXJpY0V2ZW50KHsgbmFtZTogJ2Rpc2NvdmVyeScsIGNhdGVnb3J5OiAnaW5zdHJ1Y3Rpb25zJywgY3JlYXRlZDogbmV3IERhdGUoMjAyNiwgMiwgMTAsIDEwLCAwLCAwKSB9KSxcblx0XHRcdG1ha2VUb29sQ2FsbEV2ZW50KHsgdG9vbE5hbWU6ICdyZWFkRmlsZScsIGNyZWF0ZWQ6IG5ldyBEYXRlKDIwMjYsIDIsIDEwLCAxMSwgMCwgMCkgfSksXG5cdFx0XHRtYWtlVG9vbENhbGxFdmVudCh7IHRvb2xOYW1lOiAnd3JpdGVGaWxlJywgY3JlYXRlZDogbmV3IERhdGUoMjAyNiwgMiwgMTAsIDEyLCAwLCAwKSB9KSxcblx0XHRcdG1ha2VNb2RlbFR1cm5FdmVudCh7IG1vZGVsOiAnZ3B0LTRvJywgY3JlYXRlZDogbmV3IERhdGUoMjAyNiwgMiwgMTAsIDEzLCAwLCAwKSB9KSxcblx0XHRdO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBieSBpbmNsdXNpb24gdGVybScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzQnlUZXh0KGV2ZW50cywgJ3JlYWRmaWxlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdFswXSBhcyBJQ2hhdERlYnVnVG9vbENhbGxFdmVudCkudG9vbE5hbWUsICdyZWFkRmlsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBieSBleGNsdXNpb24gdGVybScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzQnlUZXh0KGV2ZW50cywgJyFyZWFkZmlsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBjb21tYS1zZXBhcmF0ZWQgdGVybXMgYXMgT1InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJEZWJ1Z0V2ZW50c0J5VGV4dChldmVudHMsICdyZWFkZmlsZSwgd3JpdGVmaWxlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21iaW5lcyBpbmNsdXNpb24gYW5kIGV4Y2x1c2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzQnlUZXh0KGV2ZW50cywgJ3Rvb2xjYWxsLCAhcmVhZGZpbGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzBdIGFzIElDaGF0RGVidWdUb29sQ2FsbEV2ZW50KS50b29sTmFtZSwgJ3dyaXRlRmlsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBieSBiZWZvcmUgdGltZXN0YW1wJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyRGVidWdFdmVudHNCeVRleHQoZXZlbnRzLCAnYmVmb3JlOjIwMjYtMDMtMTB0MTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTsgLy8gMTA6MDAgYW5kIDExOjAwIChiZWZvcmUgcm91bmRzIHVwIHRvIDExOjU5OjU5KVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBieSBhZnRlciB0aW1lc3RhbXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJEZWJ1Z0V2ZW50c0J5VGV4dChldmVudHMsICdhZnRlcjoyMDI2LTAzLTEwdDEyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7IC8vIDEyOjAwIGFuZCAxMzowMFxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tYmluZXMgdGltZXN0YW1wIGFuZCB0ZXh0IGZpbHRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJEZWJ1Z0V2ZW50c0J5VGV4dChldmVudHMsICdhZnRlcjoyMDI2LTAzLTEwdDExIHRvb2xjYWxsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7IC8vIHdyaXRlRmlsZSBhdCAxMjowMCBhbmQgcmVhZEZpbGUgYXQgMTE6MDBcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgYWxsIGV2ZW50cyB3aXRoIGVtcHR5IGZpbHRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzQnlUZXh0KGV2ZW50cywgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmlsdGVyRGVidWdFdmVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiByZWFkb25seSBJQ2hhdERlYnVnRXZlbnRbXSA9IFtcblx0XHRcdG1ha2VHZW5lcmljRXZlbnQoeyBuYW1lOiAnZXZlbnQtMScsIGNyZWF0ZWQ6IG5ldyBEYXRlKCcyMDI2LTAzLTEwVDEwOjAwOjAwWicpIH0pLFxuXHRcdFx0bWFrZVRvb2xDYWxsRXZlbnQoeyB0b29sTmFtZTogJ3JlYWRGaWxlJywgY3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDMtMTBUMTE6MDA6MDBaJykgfSksXG5cdFx0XHRtYWtlVG9vbENhbGxFdmVudCh7IHRvb2xOYW1lOiAnd3JpdGVGaWxlJywgY3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDMtMTBUMTI6MDA6MDBaJykgfSksXG5cdFx0XHRtYWtlTW9kZWxUdXJuRXZlbnQoeyBtb2RlbDogJ2dwdC00bycsIGNyZWF0ZWQ6IG5ldyBEYXRlKCcyMDI2LTAzLTEwVDEzOjAwOjAwWicpIH0pLFxuXHRcdFx0bWFrZVN1YmFnZW50RXZlbnQoeyBhZ2VudE5hbWU6ICdleHBsb3JlcicsIGNyZWF0ZWQ6IG5ldyBEYXRlKCcyMDI2LTAzLTEwVDE0OjAwOjAwWicpIH0pLFxuXHRcdF07XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGFsbCBldmVudHMgd2l0aCBlbXB0eSBvcHRpb25zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWx0ZXJEZWJ1Z0V2ZW50cyhldmVudHMsIHt9KSwgZXZlbnRzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgYnkga2luZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzKGV2ZW50cywgeyBraW5kOiAndG9vbENhbGwnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ldmVyeShlID0+IGUua2luZCA9PT0gJ3Rvb2xDYWxsJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBieSBraW5kIHdpdGggbm8gbWF0Y2hlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzKGV2ZW50cywgeyBraW5kOiAndXNlck1lc3NhZ2UnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBieSB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyRGVidWdFdmVudHMoZXZlbnRzLCB7IGZpbHRlcjogJ3JlYWRmaWxlJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzBdIGFzIElDaGF0RGVidWdUb29sQ2FsbEV2ZW50KS50b29sTmFtZSwgJ3JlYWRGaWxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaW1pdHMgdG8gTiBtb3N0IHJlY2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzKGV2ZW50cywgeyBsaW1pdDogMiB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ua2luZCwgJ21vZGVsVHVybicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS5raW5kLCAnc3ViYWdlbnRJbnZvY2F0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsaW1pdCBsYXJnZXIgdGhhbiBldmVudCBjb3VudCByZXR1cm5zIGFsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzKGV2ZW50cywgeyBsaW1pdDogMTAwIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGltaXQgb2YgMCByZXR1cm5zIGFsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzKGV2ZW50cywgeyBsaW1pdDogMCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA1KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xpbWl0IG9mIG5lZ2F0aXZlIHJldHVybnMgYWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyRGVidWdFdmVudHMoZXZlbnRzLCB7IGxpbWl0OiAtMSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA1KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbWJpbmVzIGtpbmQgYW5kIHRleHQgZmlsdGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzKGV2ZW50cywgeyBraW5kOiAndG9vbENhbGwnLCBmaWx0ZXI6ICdyZWFkZmlsZScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdFswXSBhcyBJQ2hhdERlYnVnVG9vbENhbGxFdmVudCkudG9vbE5hbWUsICdyZWFkRmlsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tYmluZXMga2luZCBhbmQgbGltaXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXJEZWJ1Z0V2ZW50cyhldmVudHMsIHsga2luZDogJ3Rvb2xDYWxsJywgbGltaXQ6IDEgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdFswXSBhcyBJQ2hhdERlYnVnVG9vbENhbGxFdmVudCkudG9vbE5hbWUsICd3cml0ZUZpbGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbWJpbmVzIHRleHQgZmlsdGVyIGFuZCBsaW1pdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbHRlckRlYnVnRXZlbnRzKGV2ZW50cywgeyBmaWx0ZXI6ICd0b29sY2FsbCcsIGxpbWl0OiAxIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMF0gYXMgSUNoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQpLnRvb2xOYW1lLCAnd3JpdGVGaWxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21iaW5lcyBhbGwgdGhyZWUgZmlsdGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGFsbFRvb2xDYWxsczogcmVhZG9ubHkgSUNoYXREZWJ1Z0V2ZW50W10gPSBbXG5cdFx0XHRcdG1ha2VUb29sQ2FsbEV2ZW50KHsgdG9vbE5hbWU6ICdyZWFkRmlsZScsIGNyZWF0ZWQ6IG5ldyBEYXRlKCcyMDI2LTAzLTEwVDEwOjAwOjAwWicpIH0pLFxuXHRcdFx0XHRtYWtlVG9vbENhbGxFdmVudCh7IHRvb2xOYW1lOiAnd3JpdGVGaWxlJywgY3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDMtMTBUMTE6MDA6MDBaJykgfSksXG5cdFx0XHRcdG1ha2VUb29sQ2FsbEV2ZW50KHsgdG9vbE5hbWU6ICdsaXN0RGlyJywgY3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDMtMTBUMTI6MDA6MDBaJykgfSksXG5cdFx0XHRcdG1ha2VHZW5lcmljRXZlbnQoeyBuYW1lOiAndW5yZWxhdGVkJywgY3JlYXRlZDogbmV3IERhdGUoJzIwMjYtMDMtMTBUMTM6MDA6MDBaJykgfSksXG5cdFx0XHRdO1xuXHRcdFx0Ly8ga2luZD10b29sQ2FsbCwgZXhjbHVkZSByZWFkRmlsZSwgbGltaXQ9MSBcdTIxOTIgc2hvdWxkIGdldCB0aGUgbW9zdCByZWNlbnQgbm9uLXJlYWRGaWxlIHRvb2xDYWxsIChsaXN0RGlyKVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmlsdGVyRGVidWdFdmVudHMoYWxsVG9vbENhbGxzLCB7IGtpbmQ6ICd0b29sQ2FsbCcsIGZpbHRlcjogJyFyZWFkZmlsZScsIGxpbWl0OiAxIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMF0gYXMgSUNoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQpLnRvb2xOYW1lLCAnbGlzdERpcicpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLHlCQUFrTjtBQUMzTixTQUFTLHVCQUF1QixtQkFBbUIseUJBQXlC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
