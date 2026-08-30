import { deepStrictEqual, ok, strictEqual } from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NonPtyShellTerminalStreams } from "../../node/copilot/copilotNonPtyShellTerminals.js";
import { TestAgentHostTerminalManager } from "./testAgentHostTerminalManager.js";
suite("NonPtyShellTerminalStreams", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let manager;
  let streams;
  setup(() => {
    manager = store.add(new TestAgentHostTerminalManager());
    streams = store.add(new NonPtyShellTerminalStreams(URI.parse("agenthost-session://test/session-1"), manager));
  });
  function channelContent() {
    return manager.outputTerminalData.map((d) => d.data).join("");
  }
  suite("rolling-tail snapshot stitching", () => {
    test("appends only the unseen suffix when the snapshot is a rolling tail, without resetting", () => {
      streams.track("call-1", "shell");
      streams.append("call-1", "line 1\r\nline 2\r\nline 3\r\n");
      streams.append("call-1", "line 2\r\nline 3\r\nline 4\r\n");
      streams.append("call-1", "line 4\r\nline 5\r\nline 6\r\n");
      deepStrictEqual(manager.outputTerminalResets, [], "rolling tails must not reset the channel");
      strictEqual(channelContent(), "line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\nline 6\r\n");
    });
    test("truncated completion preview does not discard the streamed transcript", () => {
      streams.track("call-2", "shell");
      streams.append("call-2", "line 1\r\nline 2\r\nline 3\r\n");
      streams.append("call-2", "line 3\r\nline 4\r\nline 5\r\n");
      const completion = streams.completeToolCall("call-2", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "line 4\r\nline 5\r\n", truncated: true }
      });
      ok(completion);
      deepStrictEqual(manager.outputTerminalResets, []);
      strictEqual(channelContent(), "line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\n");
      deepStrictEqual(manager.outputTerminalsFinalized, [{ uri: completion.uri, exitCode: 0 }]);
    });
    test("preserves the transcript across truncation marker rewrites and disjoint rolling tails", () => {
      streams.track("call-3", "shell");
      streams.append("call-3", "line 1\r\nline 498\r\nline 499\r\n");
      streams.append("call-3", "line 1\r\nline 498\r\nline 499\r\n<output too long - dropped 42 lines from the end>\n");
      streams.append("call-3", "line 1\r\nline 498\r\nline 499\r\n<output too long - dropped 99 lines from the end>\n");
      streams.append("call-3", "line 498\r\nline 499\r\nline 500\r\n");
      streams.append("call-3", "line 499\r\nline 500\r\nline 501\r\n");
      streams.append("call-3", "line 700\r\nline 701\r\nline 702\r\n");
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        content: channelContent()
      }, {
        resets: [],
        content: [
          "line 1\r\nline 498\r\nline 499\r\n<output too long - dropped 42 lines from the end>\n",
          "line 500\r\n",
          "line 501\r\n",
          "line 700\r\nline 701\r\nline 702\r\n"
        ].join("")
      });
    });
    test("recognizes the single-line character truncation marker", () => {
      streams.track("call-4", "shell");
      streams.append("call-4", "abcdefghij");
      streams.append("call-4", "abcdefghij<output too long - dropped 5 characters from the end>");
      streams.append("call-4", "abcdefghij<output too long - dropped 8 characters from the end>");
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        content: channelContent()
      }, {
        resets: [],
        content: "abcdefghij<output too long - dropped 5 characters from the end>"
      });
    });
    test("preserves a direct transition to disjoint shorter tails", () => {
      streams.track("call-5", "shell");
      streams.append("call-5", "alpha beta gamma\r\n");
      streams.append("call-5", "tail one\r\n");
      streams.append("call-5", "tail two\r\n");
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        content: channelContent()
      }, {
        resets: [],
        content: "alpha beta gamma\r\ntail one\r\ntail two\r\n"
      });
    });
    test("does not append a truncated completion preview after streamed output", () => {
      streams.track("call-6", "shell");
      streams.append("call-6", "line 1\r\nline 2\r\n<output too long - dropped 42 lines from the end>\n");
      streams.append("call-6", "line 498\r\nline 499\r\nline 500\r\n");
      streams.completeToolCall("call-6", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "line 1\r\nline 2\r\n", truncated: true }
      });
      strictEqual(channelContent(), [
        "line 1\r\nline 2\r\n<output too long - dropped 42 lines from the end>\n",
        "line 498\r\nline 499\r\nline 500\r\n"
      ].join(""));
    });
    test("seeds a zero-partial terminal from its truncated completion preview", () => {
      streams.track("call-7", "shell");
      streams.completeToolCall("call-7", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "line 1\r\nline 2\r\n", truncated: true }
      });
      strictEqual(channelContent(), "line 1\r\nline 2\r\n");
    });
    test("replaces a truncated stream with an authoritative non-truncated completion preview", () => {
      streams.track("call-8", "shell");
      const appended = streams.append("call-8", "head\r\n<output too long - dropped 42 lines from the end>\n");
      ok(appended);
      streams.completeToolCall("call-8", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "complete output\r\n", truncated: false }
      });
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        data: manager.outputTerminalData
      }, {
        resets: [appended.uri],
        data: [
          { uri: appended.uri, data: "head\r\n<output too long - dropped 42 lines from the end>\n" },
          { uri: appended.uri, data: "complete output\r\n" }
        ]
      });
    });
    test("clears stale streamed output when the authoritative completion preview is empty", () => {
      streams.track("call-9", "shell");
      const appended = streams.append("call-9", "stale output\r\n");
      ok(appended);
      streams.completeToolCall("call-9", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "", truncated: false }
      });
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        data: manager.outputTerminalData
      }, {
        resets: [appended.uri],
        data: [{ uri: appended.uri, data: "stale output\r\n" }]
      });
    });
    test("appends a prefix-stable authoritative completion preview", () => {
      streams.track("call-10", "shell");
      const appended = streams.append("call-10", "line 1\r\n");
      ok(appended);
      streams.completeToolCall("call-10", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "line 1\r\nline 2\r\n", truncated: false }
      });
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        data: manager.outputTerminalData
      }, {
        resets: [],
        data: [
          { uri: appended.uri, data: "line 1\r\n" },
          { uri: appended.uri, data: "line 2\r\n" }
        ]
      });
    });
    test("an unrelated rewrite still resets the channel", () => {
      streams.track("call-11", "shell");
      streams.append("call-11", "alpha beta gamma\r\n");
      streams.append("call-11", "completely different content\r\n");
      strictEqual(manager.outputTerminalResets.length, 1);
      deepStrictEqual(manager.outputTerminalData.map((d) => d.data), ["alpha beta gamma\r\n", "completely different content\r\n"]);
    });
  });
  suite("completion and lifecycle", () => {
    test("parses fallback completion, finalizes once, and ignores later output", () => {
      streams.track("call-12", "shell");
      const completion = streams.completeToolCall("call-12", "fallback output\r\n<shellId: shell-1 completed with exit code -1>", void 0);
      streams.completeToolCall("call-12", "different output\r\n<shellId: shell-1 completed with exit code -1>", void 0);
      streams.append("call-12", "late output\r\n");
      deepStrictEqual({
        completion,
        content: channelContent(),
        finalized: manager.outputTerminalsFinalized
      }, {
        completion: {
          uri: "agenthost-terminal://shell/session-1/call-12",
          result: { exitCode: -1, preview: "fallback output\r\n" },
          shouldRetire: true
        },
        content: "fallback output\r\n",
        finalized: [{ uri: "agenthost-terminal://shell/session-1/call-12", exitCode: -1 }]
      });
    });
    test("drops an unstarted stream without completion data", () => {
      streams.track("call-13", "shell");
      strictEqual(streams.completeToolCall("call-13", void 0, void 0), void 0);
      strictEqual(streams.append("call-13", "late output"), void 0);
    });
    test("keeps a started stream alive without completion data", () => {
      streams.track("call-14", "shell");
      const appended = streams.append("call-14", "partial output");
      ok(appended);
      deepStrictEqual(streams.completeToolCall("call-14", void 0, void 0), {
        uri: appended.uri,
        shouldRetire: false
      });
    });
    test("retires a stream exactly once", () => {
      streams.track("call-15", "shell");
      const appended = streams.append("call-15", "partial output");
      ok(appended);
      streams.retire("call-15");
      streams.retire("call-15");
      deepStrictEqual(manager.disposedTerminals, [appended.uri]);
      strictEqual(streams.append("call-15", "late output"), void 0);
    });
    test("ignores append and completion for an untracked tool call", () => {
      strictEqual(streams.append("missing", "output"), void 0);
      strictEqual(streams.completeToolCall("missing", void 0, void 0), void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90Tm9uUHR5U2hlbGxUZXJtaW5hbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE5vblB0eVNoZWxsVGVybWluYWxTdHJlYW1zIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2NvcGlsb3ROb25QdHlTaGVsbFRlcm1pbmFscy5qcyc7XG5pbXBvcnQgeyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIH0gZnJvbSAnLi90ZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcblxuc3VpdGUoJ05vblB0eVNoZWxsVGVybWluYWxTdHJlYW1zJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBtYW5hZ2VyOiBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyO1xuXHRsZXQgc3RyZWFtczogTm9uUHR5U2hlbGxUZXJtaW5hbFN0cmVhbXM7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG1hbmFnZXIgPSBzdG9yZS5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoKSk7XG5cdFx0c3RyZWFtcyA9IHN0b3JlLmFkZChuZXcgTm9uUHR5U2hlbGxUZXJtaW5hbFN0cmVhbXMoVVJJLnBhcnNlKCdhZ2VudGhvc3Qtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbi0xJyksIG1hbmFnZXIpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY2hhbm5lbENvbnRlbnQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbWFuYWdlci5vdXRwdXRUZXJtaW5hbERhdGEubWFwKGQgPT4gZC5kYXRhKS5qb2luKCcnKTtcblx0fVxuXG5cdHN1aXRlKCdyb2xsaW5nLXRhaWwgc25hcHNob3Qgc3RpdGNoaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FwcGVuZHMgb25seSB0aGUgdW5zZWVuIHN1ZmZpeCB3aGVuIHRoZSBzbmFwc2hvdCBpcyBhIHJvbGxpbmcgdGFpbCwgd2l0aG91dCByZXNldHRpbmcnLCAoKSA9PiB7XG5cdFx0XHRzdHJlYW1zLnRyYWNrKCdjYWxsLTEnLCAnc2hlbGwnKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTEnLCAnbGluZSAxXFxyXFxubGluZSAyXFxyXFxubGluZSAzXFxyXFxuJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC0xJywgJ2xpbmUgMlxcclxcbmxpbmUgM1xcclxcbmxpbmUgNFxcclxcbicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMScsICdsaW5lIDRcXHJcXG5saW5lIDVcXHJcXG5saW5lIDZcXHJcXG4nKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKG1hbmFnZXIub3V0cHV0VGVybWluYWxSZXNldHMsIFtdLCAncm9sbGluZyB0YWlscyBtdXN0IG5vdCByZXNldCB0aGUgY2hhbm5lbCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2hhbm5lbENvbnRlbnQoKSwgJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbmxpbmUgM1xcclxcbmxpbmUgNFxcclxcbmxpbmUgNVxcclxcbmxpbmUgNlxcclxcbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJ1bmNhdGVkIGNvbXBsZXRpb24gcHJldmlldyBkb2VzIG5vdCBkaXNjYXJkIHRoZSBzdHJlYW1lZCB0cmFuc2NyaXB0JywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC0yJywgJ3NoZWxsJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC0yJywgJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbmxpbmUgM1xcclxcbicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMicsICdsaW5lIDNcXHJcXG5saW5lIDRcXHJcXG5saW5lIDVcXHJcXG4nKTtcblxuXHRcdFx0Y29uc3QgY29tcGxldGlvbiA9IHN0cmVhbXMuY29tcGxldGVUb29sQ2FsbCgnY2FsbC0yJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHNoZWxsSWQ6ICdzaGVsbC0xJyxcblx0XHRcdFx0cmVzdWx0OiB7IGV4aXRDb2RlOiAwLCBwcmV2aWV3OiAnbGluZSA0XFxyXFxubGluZSA1XFxyXFxuJywgdHJ1bmNhdGVkOiB0cnVlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRvayhjb21wbGV0aW9uKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChtYW5hZ2VyLm91dHB1dFRlcm1pbmFsUmVzZXRzLCBbXSk7XG5cdFx0XHRzdHJpY3RFcXVhbChjaGFubmVsQ29udGVudCgpLCAnbGluZSAxXFxyXFxubGluZSAyXFxyXFxubGluZSAzXFxyXFxubGluZSA0XFxyXFxubGluZSA1XFxyXFxuJyk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwobWFuYWdlci5vdXRwdXRUZXJtaW5hbHNGaW5hbGl6ZWQsIFt7IHVyaTogY29tcGxldGlvbi51cmksIGV4aXRDb2RlOiAwIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyB0aGUgdHJhbnNjcmlwdCBhY3Jvc3MgdHJ1bmNhdGlvbiBtYXJrZXIgcmV3cml0ZXMgYW5kIGRpc2pvaW50IHJvbGxpbmcgdGFpbHMnLCAoKSA9PiB7XG5cdFx0XHRzdHJlYW1zLnRyYWNrKCdjYWxsLTMnLCAnc2hlbGwnKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTMnLCAnbGluZSAxXFxyXFxubGluZSA0OThcXHJcXG5saW5lIDQ5OVxcclxcbicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMycsICdsaW5lIDFcXHJcXG5saW5lIDQ5OFxcclxcbmxpbmUgNDk5XFxyXFxuPG91dHB1dCB0b28gbG9uZyAtIGRyb3BwZWQgNDIgbGluZXMgZnJvbSB0aGUgZW5kPlxcbicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMycsICdsaW5lIDFcXHJcXG5saW5lIDQ5OFxcclxcbmxpbmUgNDk5XFxyXFxuPG91dHB1dCB0b28gbG9uZyAtIGRyb3BwZWQgOTkgbGluZXMgZnJvbSB0aGUgZW5kPlxcbicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMycsICdsaW5lIDQ5OFxcclxcbmxpbmUgNDk5XFxyXFxubGluZSA1MDBcXHJcXG4nKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTMnLCAnbGluZSA0OTlcXHJcXG5saW5lIDUwMFxcclxcbmxpbmUgNTAxXFxyXFxuJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC0zJywgJ2xpbmUgNzAwXFxyXFxubGluZSA3MDFcXHJcXG5saW5lIDcwMlxcclxcbicpO1xuXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXNldHM6IG1hbmFnZXIub3V0cHV0VGVybWluYWxSZXNldHMsXG5cdFx0XHRcdGNvbnRlbnQ6IGNoYW5uZWxDb250ZW50KCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc2V0czogW10sXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHQnbGluZSAxXFxyXFxubGluZSA0OThcXHJcXG5saW5lIDQ5OVxcclxcbjxvdXRwdXQgdG9vIGxvbmcgLSBkcm9wcGVkIDQyIGxpbmVzIGZyb20gdGhlIGVuZD5cXG4nLFxuXHRcdFx0XHRcdCdsaW5lIDUwMFxcclxcbicsXG5cdFx0XHRcdFx0J2xpbmUgNTAxXFxyXFxuJyxcblx0XHRcdFx0XHQnbGluZSA3MDBcXHJcXG5saW5lIDcwMVxcclxcbmxpbmUgNzAyXFxyXFxuJyxcblx0XHRcdFx0XS5qb2luKCcnKSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjb2duaXplcyB0aGUgc2luZ2xlLWxpbmUgY2hhcmFjdGVyIHRydW5jYXRpb24gbWFya2VyJywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC00JywgJ3NoZWxsJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC00JywgJ2FiY2RlZmdoaWonKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTQnLCAnYWJjZGVmZ2hpajxvdXRwdXQgdG9vIGxvbmcgLSBkcm9wcGVkIDUgY2hhcmFjdGVycyBmcm9tIHRoZSBlbmQ+Jyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC00JywgJ2FiY2RlZmdoaWo8b3V0cHV0IHRvbyBsb25nIC0gZHJvcHBlZCA4IGNoYXJhY3RlcnMgZnJvbSB0aGUgZW5kPicpO1xuXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXNldHM6IG1hbmFnZXIub3V0cHV0VGVybWluYWxSZXNldHMsXG5cdFx0XHRcdGNvbnRlbnQ6IGNoYW5uZWxDb250ZW50KCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc2V0czogW10sXG5cdFx0XHRcdGNvbnRlbnQ6ICdhYmNkZWZnaGlqPG91dHB1dCB0b28gbG9uZyAtIGRyb3BwZWQgNSBjaGFyYWN0ZXJzIGZyb20gdGhlIGVuZD4nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgYSBkaXJlY3QgdHJhbnNpdGlvbiB0byBkaXNqb2ludCBzaG9ydGVyIHRhaWxzJywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC01JywgJ3NoZWxsJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC01JywgJ2FscGhhIGJldGEgZ2FtbWFcXHJcXG4nKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTUnLCAndGFpbCBvbmVcXHJcXG4nKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTUnLCAndGFpbCB0d29cXHJcXG4nKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzZXRzOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsUmVzZXRzLFxuXHRcdFx0XHRjb250ZW50OiBjaGFubmVsQ29udGVudCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXNldHM6IFtdLFxuXHRcdFx0XHRjb250ZW50OiAnYWxwaGEgYmV0YSBnYW1tYVxcclxcbnRhaWwgb25lXFxyXFxudGFpbCB0d29cXHJcXG4nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBhcHBlbmQgYSB0cnVuY2F0ZWQgY29tcGxldGlvbiBwcmV2aWV3IGFmdGVyIHN0cmVhbWVkIG91dHB1dCcsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtNicsICdzaGVsbCcpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtNicsICdsaW5lIDFcXHJcXG5saW5lIDJcXHJcXG48b3V0cHV0IHRvbyBsb25nIC0gZHJvcHBlZCA0MiBsaW5lcyBmcm9tIHRoZSBlbmQ+XFxuJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC02JywgJ2xpbmUgNDk4XFxyXFxubGluZSA0OTlcXHJcXG5saW5lIDUwMFxcclxcbicpO1xuXG5cdFx0XHRzdHJlYW1zLmNvbXBsZXRlVG9vbENhbGwoJ2NhbGwtNicsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzaGVsbElkOiAnc2hlbGwtMScsXG5cdFx0XHRcdHJlc3VsdDogeyBleGl0Q29kZTogMCwgcHJldmlldzogJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbicsIHRydW5jYXRlZDogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoY2hhbm5lbENvbnRlbnQoKSwgW1xuXHRcdFx0XHQnbGluZSAxXFxyXFxubGluZSAyXFxyXFxuPG91dHB1dCB0b28gbG9uZyAtIGRyb3BwZWQgNDIgbGluZXMgZnJvbSB0aGUgZW5kPlxcbicsXG5cdFx0XHRcdCdsaW5lIDQ5OFxcclxcbmxpbmUgNDk5XFxyXFxubGluZSA1MDBcXHJcXG4nLFxuXHRcdFx0XS5qb2luKCcnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZWVkcyBhIHplcm8tcGFydGlhbCB0ZXJtaW5hbCBmcm9tIGl0cyB0cnVuY2F0ZWQgY29tcGxldGlvbiBwcmV2aWV3JywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC03JywgJ3NoZWxsJyk7XG5cblx0XHRcdHN0cmVhbXMuY29tcGxldGVUb29sQ2FsbCgnY2FsbC03JywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHNoZWxsSWQ6ICdzaGVsbC0xJyxcblx0XHRcdFx0cmVzdWx0OiB7IGV4aXRDb2RlOiAwLCBwcmV2aWV3OiAnbGluZSAxXFxyXFxubGluZSAyXFxyXFxuJywgdHJ1bmNhdGVkOiB0cnVlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChjaGFubmVsQ29udGVudCgpLCAnbGluZSAxXFxyXFxubGluZSAyXFxyXFxuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBsYWNlcyBhIHRydW5jYXRlZCBzdHJlYW0gd2l0aCBhbiBhdXRob3JpdGF0aXZlIG5vbi10cnVuY2F0ZWQgY29tcGxldGlvbiBwcmV2aWV3JywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC04JywgJ3NoZWxsJyk7XG5cdFx0XHRjb25zdCBhcHBlbmRlZCA9IHN0cmVhbXMuYXBwZW5kKCdjYWxsLTgnLCAnaGVhZFxcclxcbjxvdXRwdXQgdG9vIGxvbmcgLSBkcm9wcGVkIDQyIGxpbmVzIGZyb20gdGhlIGVuZD5cXG4nKTtcblx0XHRcdG9rKGFwcGVuZGVkKTtcblxuXHRcdFx0c3RyZWFtcy5jb21wbGV0ZVRvb2xDYWxsKCdjYWxsLTgnLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0c2hlbGxJZDogJ3NoZWxsLTEnLFxuXHRcdFx0XHRyZXN1bHQ6IHsgZXhpdENvZGU6IDAsIHByZXZpZXc6ICdjb21wbGV0ZSBvdXRwdXRcXHJcXG4nLCB0cnVuY2F0ZWQ6IGZhbHNlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXNldHM6IG1hbmFnZXIub3V0cHV0VGVybWluYWxSZXNldHMsXG5cdFx0XHRcdGRhdGE6IG1hbmFnZXIub3V0cHV0VGVybWluYWxEYXRhLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXNldHM6IFthcHBlbmRlZC51cmldLFxuXHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0eyB1cmk6IGFwcGVuZGVkLnVyaSwgZGF0YTogJ2hlYWRcXHJcXG48b3V0cHV0IHRvbyBsb25nIC0gZHJvcHBlZCA0MiBsaW5lcyBmcm9tIHRoZSBlbmQ+XFxuJyB9LFxuXHRcdFx0XHRcdHsgdXJpOiBhcHBlbmRlZC51cmksIGRhdGE6ICdjb21wbGV0ZSBvdXRwdXRcXHJcXG4nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsZWFycyBzdGFsZSBzdHJlYW1lZCBvdXRwdXQgd2hlbiB0aGUgYXV0aG9yaXRhdGl2ZSBjb21wbGV0aW9uIHByZXZpZXcgaXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRzdHJlYW1zLnRyYWNrKCdjYWxsLTknLCAnc2hlbGwnKTtcblx0XHRcdGNvbnN0IGFwcGVuZGVkID0gc3RyZWFtcy5hcHBlbmQoJ2NhbGwtOScsICdzdGFsZSBvdXRwdXRcXHJcXG4nKTtcblx0XHRcdG9rKGFwcGVuZGVkKTtcblxuXHRcdFx0c3RyZWFtcy5jb21wbGV0ZVRvb2xDYWxsKCdjYWxsLTknLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0c2hlbGxJZDogJ3NoZWxsLTEnLFxuXHRcdFx0XHRyZXN1bHQ6IHsgZXhpdENvZGU6IDAsIHByZXZpZXc6ICcnLCB0cnVuY2F0ZWQ6IGZhbHNlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXNldHM6IG1hbmFnZXIub3V0cHV0VGVybWluYWxSZXNldHMsXG5cdFx0XHRcdGRhdGE6IG1hbmFnZXIub3V0cHV0VGVybWluYWxEYXRhLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXNldHM6IFthcHBlbmRlZC51cmldLFxuXHRcdFx0XHRkYXRhOiBbeyB1cmk6IGFwcGVuZGVkLnVyaSwgZGF0YTogJ3N0YWxlIG91dHB1dFxcclxcbicgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGVuZHMgYSBwcmVmaXgtc3RhYmxlIGF1dGhvcml0YXRpdmUgY29tcGxldGlvbiBwcmV2aWV3JywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC0xMCcsICdzaGVsbCcpO1xuXHRcdFx0Y29uc3QgYXBwZW5kZWQgPSBzdHJlYW1zLmFwcGVuZCgnY2FsbC0xMCcsICdsaW5lIDFcXHJcXG4nKTtcblx0XHRcdG9rKGFwcGVuZGVkKTtcblxuXHRcdFx0c3RyZWFtcy5jb21wbGV0ZVRvb2xDYWxsKCdjYWxsLTEwJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHNoZWxsSWQ6ICdzaGVsbC0xJyxcblx0XHRcdFx0cmVzdWx0OiB7IGV4aXRDb2RlOiAwLCBwcmV2aWV3OiAnbGluZSAxXFxyXFxubGluZSAyXFxyXFxuJywgdHJ1bmNhdGVkOiBmYWxzZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzZXRzOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsUmVzZXRzLFxuXHRcdFx0XHRkYXRhOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsRGF0YSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzZXRzOiBbXSxcblx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdHsgdXJpOiBhcHBlbmRlZC51cmksIGRhdGE6ICdsaW5lIDFcXHJcXG4nIH0sXG5cdFx0XHRcdFx0eyB1cmk6IGFwcGVuZGVkLnVyaSwgZGF0YTogJ2xpbmUgMlxcclxcbicgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYW4gdW5yZWxhdGVkIHJld3JpdGUgc3RpbGwgcmVzZXRzIHRoZSBjaGFubmVsJywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC0xMScsICdzaGVsbCcpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMTEnLCAnYWxwaGEgYmV0YSBnYW1tYVxcclxcbicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMTEnLCAnY29tcGxldGVseSBkaWZmZXJlbnQgY29udGVudFxcclxcbicpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChtYW5hZ2VyLm91dHB1dFRlcm1pbmFsUmVzZXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwobWFuYWdlci5vdXRwdXRUZXJtaW5hbERhdGEubWFwKGQgPT4gZC5kYXRhKSwgWydhbHBoYSBiZXRhIGdhbW1hXFxyXFxuJywgJ2NvbXBsZXRlbHkgZGlmZmVyZW50IGNvbnRlbnRcXHJcXG4nXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb21wbGV0aW9uIGFuZCBsaWZlY3ljbGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgncGFyc2VzIGZhbGxiYWNrIGNvbXBsZXRpb24sIGZpbmFsaXplcyBvbmNlLCBhbmQgaWdub3JlcyBsYXRlciBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0XHRzdHJlYW1zLnRyYWNrKCdjYWxsLTEyJywgJ3NoZWxsJyk7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSBzdHJlYW1zLmNvbXBsZXRlVG9vbENhbGwoJ2NhbGwtMTInLCAnZmFsbGJhY2sgb3V0cHV0XFxyXFxuPHNoZWxsSWQ6IHNoZWxsLTEgY29tcGxldGVkIHdpdGggZXhpdCBjb2RlIC0xPicsIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJlYW1zLmNvbXBsZXRlVG9vbENhbGwoJ2NhbGwtMTInLCAnZGlmZmVyZW50IG91dHB1dFxcclxcbjxzaGVsbElkOiBzaGVsbC0xIGNvbXBsZXRlZCB3aXRoIGV4aXQgY29kZSAtMT4nLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMTInLCAnbGF0ZSBvdXRwdXRcXHJcXG4nKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29tcGxldGlvbixcblx0XHRcdFx0Y29udGVudDogY2hhbm5lbENvbnRlbnQoKSxcblx0XHRcdFx0ZmluYWxpemVkOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsc0ZpbmFsaXplZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tcGxldGlvbjoge1xuXHRcdFx0XHRcdHVyaTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL3Nlc3Npb24tMS9jYWxsLTEyJyxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgZXhpdENvZGU6IC0xLCBwcmV2aWV3OiAnZmFsbGJhY2sgb3V0cHV0XFxyXFxuJyB9LFxuXHRcdFx0XHRcdHNob3VsZFJldGlyZTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29udGVudDogJ2ZhbGxiYWNrIG91dHB1dFxcclxcbicsXG5cdFx0XHRcdGZpbmFsaXplZDogW3sgdXJpOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vc2hlbGwvc2Vzc2lvbi0xL2NhbGwtMTInLCBleGl0Q29kZTogLTEgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BzIGFuIHVuc3RhcnRlZCBzdHJlYW0gd2l0aG91dCBjb21wbGV0aW9uIGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRzdHJlYW1zLnRyYWNrKCdjYWxsLTEzJywgJ3NoZWxsJyk7XG5cblx0XHRcdHN0cmljdEVxdWFsKHN0cmVhbXMuY29tcGxldGVUb29sQ2FsbCgnY2FsbC0xMycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmljdEVxdWFsKHN0cmVhbXMuYXBwZW5kKCdjYWxsLTEzJywgJ2xhdGUgb3V0cHV0JyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBhIHN0YXJ0ZWQgc3RyZWFtIGFsaXZlIHdpdGhvdXQgY29tcGxldGlvbiBkYXRhJywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC0xNCcsICdzaGVsbCcpO1xuXHRcdFx0Y29uc3QgYXBwZW5kZWQgPSBzdHJlYW1zLmFwcGVuZCgnY2FsbC0xNCcsICdwYXJ0aWFsIG91dHB1dCcpO1xuXHRcdFx0b2soYXBwZW5kZWQpO1xuXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc3RyZWFtcy5jb21wbGV0ZVRvb2xDYWxsKCdjYWxsLTE0JywgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCB7XG5cdFx0XHRcdHVyaTogYXBwZW5kZWQudXJpLFxuXHRcdFx0XHRzaG91bGRSZXRpcmU6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXRpcmVzIGEgc3RyZWFtIGV4YWN0bHkgb25jZScsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtMTUnLCAnc2hlbGwnKTtcblx0XHRcdGNvbnN0IGFwcGVuZGVkID0gc3RyZWFtcy5hcHBlbmQoJ2NhbGwtMTUnLCAncGFydGlhbCBvdXRwdXQnKTtcblx0XHRcdG9rKGFwcGVuZGVkKTtcblxuXHRcdFx0c3RyZWFtcy5yZXRpcmUoJ2NhbGwtMTUnKTtcblx0XHRcdHN0cmVhbXMucmV0aXJlKCdjYWxsLTE1Jyk7XG5cblx0XHRcdGRlZXBTdHJpY3RFcXVhbChtYW5hZ2VyLmRpc3Bvc2VkVGVybWluYWxzLCBbYXBwZW5kZWQudXJpXSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdHJlYW1zLmFwcGVuZCgnY2FsbC0xNScsICdsYXRlIG91dHB1dCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBhcHBlbmQgYW5kIGNvbXBsZXRpb24gZm9yIGFuIHVudHJhY2tlZCB0b29sIGNhbGwnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChzdHJlYW1zLmFwcGVuZCgnbWlzc2luZycsICdvdXRwdXQnKSwgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmljdEVxdWFsKHN0cmVhbXMuY29tcGxldGVUb29sQ2FsbCgnbWlzc2luZycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLElBQUksbUJBQW1CO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLG9DQUFvQztBQUU3QyxNQUFNLDhCQUE4QixNQUFNO0FBQ3pDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxjQUFVLE1BQU0sSUFBSSxJQUFJLDZCQUE2QixDQUFDO0FBQ3RELGNBQVUsTUFBTSxJQUFJLElBQUksMkJBQTJCLElBQUksTUFBTSxvQ0FBb0MsR0FBRyxPQUFPLENBQUM7QUFBQSxFQUM3RyxDQUFDO0FBRUQsV0FBUyxpQkFBeUI7QUFDakMsV0FBTyxRQUFRLG1CQUFtQixJQUFJLE9BQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFO0FBQUEsRUFDM0Q7QUFFQSxRQUFNLG1DQUFtQyxNQUFNO0FBQzlDLFNBQUsseUZBQXlG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
