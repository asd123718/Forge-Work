import assert from "assert";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ResponsePartKind, ToolResultContentType, TurnState } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { importedTurnsFromChatModel } from "../../../browser/agentSessions/agentHost/importLocalConversationToAgentSession.js";
suite("importedTurnsFromChatModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function markdown(value) {
    return { kind: "markdownContent", content: new MarkdownString(value) };
  }
  function thinking(value) {
    return { kind: "thinking", value };
  }
  function inlineReference(uri, name) {
    return { kind: "inlineReference", inlineReference: uri, name };
  }
  function inlineRef(reference, name) {
    return { kind: "inlineReference", inlineReference: reference, name };
  }
  function subagentTool(toolCallId, agentName, description, result) {
    return {
      kind: "toolInvocationSerialized",
      toolId: "delegate",
      toolCallId,
      invocationMessage: "Delegating",
      pastTenseMessage: "Delegated",
      resultDetails: void 0,
      toolSpecificData: { kind: "subagent", agentName, description, prompt: "go", result }
    };
  }
  function response(parts, opts) {
    return {
      entireResponse: { value: parts },
      isCanceled: !!opts?.canceled,
      result: opts?.error ? { errorDetails: opts.error } : void 0
    };
  }
  function request(text, response2, opts) {
    return { message: { text }, response: response2, isSystemInitiated: opts?.systemInitiated };
  }
  function model(requests) {
    return { getRequests: () => requests };
  }
  function subagentOf(part) {
    if (part.kind !== ResponsePartKind.ToolCall) {
      return void 0;
    }
    const sub = part.toolCall.content?.find((c) => c.type === ToolResultContentType.Subagent);
    return sub && sub.type === ToolResultContentType.Subagent ? { agentName: sub.agentName, description: sub.description } : void 0;
  }
  function project(model2) {
    return importedTurnsFromChatModel(model2).map((turn) => ({
      text: turn.message.text,
      state: turn.state,
      error: turn.error,
      parts: turn.responseParts.map((part) => part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning ? { kind: part.kind, content: part.content } : { kind: part.kind, subagent: subagentOf(part) })
    }));
  }
  test("maps markdown, reasoning and inline references in stream order", () => {
    const result = project(model([request("q", response([
      markdown("Found in "),
      inlineReference(URI.file("/repo/a.ts")),
      markdown(" \u2014 done"),
      thinking("let me check")
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "Found in " },
        { kind: ResponsePartKind.Markdown, content: `[a.ts](${URI.file("/repo/a.ts").toString()})` },
        { kind: ResponsePartKind.Markdown, content: " \u2014 done" },
        { kind: ResponsePartKind.Reasoning, content: "let me check" }
      ]
    }]);
  });
  test("collapses a path-like inline reference label to the file basename", () => {
    const uri = URI.file("/repo/src/common/appInsightsClientFactory.ts");
    const result = project(model([request("q", response([
      inlineReference(uri, "src/common/appInsightsClientFactory.ts")
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: `[appInsightsClientFactory.ts](${uri.toString()})` }
      ]
    }]);
  });
  test("keeps a short inline reference label (e.g. a symbol name) as-is", () => {
    const uri = URI.file("/repo/src/common/appInsightsClientFactory.ts");
    const result = project(model([request("q", response([
      inlineReference(uri, "logEvent")
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: `[logEvent](${uri.toString()})` }
      ]
    }]);
  });
  test("maps a Location-shaped inline reference to its file basename", () => {
    const uri = URI.file("/repo/src/common/baseTelemetrySender.ts");
    const result = project(model([request("q", response([
      inlineRef({ uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } })
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: `[baseTelemetrySender.ts](${uri.toString()})` }
      ]
    }]);
  });
  test("maps a workspace-symbol inline reference using its symbol name", () => {
    const uri = URI.file("/repo/src/common/baseTelemetrySender.ts");
    const result = project(model([request("q", response([
      inlineRef({ name: "logEvent", location: { uri } })
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: `[logEvent](${uri.toString()})` }
      ]
    }]);
  });
  test("falls back to the plain label when an inline reference has no resolvable URI", () => {
    const result = project(model([request("q", response([
      inlineRef({ name: "orphan" }, "orphan")
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "orphan" }
      ]
    }]);
  });
  test("maps a cancelled response to a cancelled turn", () => {
    const result = project(model([request("q", response([markdown("partial")], { canceled: true }))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Cancelled,
      error: void 0,
      parts: [{ kind: ResponsePartKind.Markdown, content: "partial" }]
    }]);
  });
  test("maps an errored response to an error turn carrying the message and code", () => {
    const result = project(model([request("q", response([], { error: { message: "boom", code: "E1" } }))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Error,
      error: { errorType: "E1", message: "boom" },
      parts: []
    }]);
  });
  test("folds a system-initiated continuation into the previous turn and supersedes its outcome", () => {
    const result = project(model([
      request("real question", response([markdown("working")])),
      request("[Terminal notification]", response([markdown("continued")], { canceled: true }), { systemInitiated: true })
    ]));
    assert.deepStrictEqual(result, [{
      text: "real question",
      state: TurnState.Cancelled,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "working" },
        { kind: ResponsePartKind.Markdown, content: "continued" }
      ]
    }]);
  });
  test("maps a sub-agent tool invocation preserving its identity as structured content", () => {
    const result = project(model([request("delegate", response([subagentTool("tc-1", "explore", "Explores the codebase", "done")]))]));
    assert.deepStrictEqual(result, [{
      text: "delegate",
      state: TurnState.Complete,
      error: void 0,
      parts: [{ kind: ResponsePartKind.ToolCall, subagent: { agentName: "explore", description: "Explores the codebase" } }]
    }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGltcG9ydExvY2FsQ29udmVyc2F0aW9uVG9BZ2VudFNlc3Npb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBUdXJuU3RhdGUsIHR5cGUgUmVzcG9uc2VQYXJ0LCB0eXBlIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQsIElDaGF0TW9kZWwsIElDaGF0UmVxdWVzdE1vZGVsLCBJQ2hhdFJlc3BvbnNlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IGltcG9ydGVkVHVybnNGcm9tQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9pbXBvcnRMb2NhbENvbnZlcnNhdGlvblRvQWdlbnRTZXNzaW9uLmpzJztcblxuc3VpdGUoJ2ltcG9ydGVkVHVybnNGcm9tQ2hhdE1vZGVsJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1hcmtkb3duKHZhbHVlOiBzdHJpbmcpOiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50IHtcblx0XHRyZXR1cm4geyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHZhbHVlKSB9IGFzIElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQ7XG5cdH1cblxuXHRmdW5jdGlvbiB0aGlua2luZyh2YWx1ZTogc3RyaW5nKTogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCB7XG5cdFx0cmV0dXJuIHsga2luZDogJ3RoaW5raW5nJywgdmFsdWUgfSBhcyBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50O1xuXHR9XG5cblx0ZnVuY3Rpb24gaW5saW5lUmVmZXJlbmNlKHVyaTogVVJJLCBuYW1lPzogc3RyaW5nKTogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCB7XG5cdFx0cmV0dXJuIHsga2luZDogJ2lubGluZVJlZmVyZW5jZScsIGlubGluZVJlZmVyZW5jZTogdXJpLCBuYW1lIH0gYXMgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudDtcblx0fVxuXG5cdC8qKiBCdWlsZHMgYW4gaW5saW5lIHJlZmVyZW5jZSBmcm9tIGEgbm9uLVVSSSBzaGFwZSAoYSBgTG9jYXRpb25gIG9yIGBJV29ya3NwYWNlU3ltYm9sYCkuICovXG5cdGZ1bmN0aW9uIGlubGluZVJlZihyZWZlcmVuY2U6IHVua25vd24sIG5hbWU/OiBzdHJpbmcpOiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50IHtcblx0XHRyZXR1cm4geyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiByZWZlcmVuY2UsIG5hbWUgfSBhcyBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50O1xuXHR9XG5cblx0ZnVuY3Rpb24gc3ViYWdlbnRUb29sKHRvb2xDYWxsSWQ6IHN0cmluZywgYWdlbnROYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHJlc3VsdDogc3RyaW5nKTogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnLFxuXHRcdFx0dG9vbElkOiAnZGVsZWdhdGUnLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZycsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnRGVsZWdhdGVkJyxcblx0XHRcdHJlc3VsdERldGFpbHM6IHVuZGVmaW5lZCxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHsga2luZDogJ3N1YmFnZW50JywgYWdlbnROYW1lLCBkZXNjcmlwdGlvbiwgcHJvbXB0OiAnZ28nLCByZXN1bHQgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudDtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlc3BvbnNlKHBhcnRzOiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50W10sIG9wdHM/OiB7IGNhbmNlbGVkPzogYm9vbGVhbjsgZXJyb3I/OiB7IG1lc3NhZ2U6IHN0cmluZzsgY29kZT86IHN0cmluZyB9IH0pOiBJQ2hhdFJlc3BvbnNlTW9kZWwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbnRpcmVSZXNwb25zZTogeyB2YWx1ZTogcGFydHMgfSxcblx0XHRcdGlzQ2FuY2VsZWQ6ICEhb3B0cz8uY2FuY2VsZWQsXG5cdFx0XHRyZXN1bHQ6IG9wdHM/LmVycm9yID8geyBlcnJvckRldGFpbHM6IG9wdHMuZXJyb3IgfSA6IHVuZGVmaW5lZCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRSZXNwb25zZU1vZGVsO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVxdWVzdCh0ZXh0OiBzdHJpbmcsIHJlc3BvbnNlPzogSUNoYXRSZXNwb25zZU1vZGVsLCBvcHRzPzogeyBzeXN0ZW1Jbml0aWF0ZWQ/OiBib29sZWFuIH0pOiBJQ2hhdFJlcXVlc3RNb2RlbCB7XG5cdFx0cmV0dXJuIHsgbWVzc2FnZTogeyB0ZXh0IH0sIHJlc3BvbnNlLCBpc1N5c3RlbUluaXRpYXRlZDogb3B0cz8uc3lzdGVtSW5pdGlhdGVkIH0gYXMgdW5rbm93biBhcyBJQ2hhdFJlcXVlc3RNb2RlbDtcblx0fVxuXG5cdGZ1bmN0aW9uIG1vZGVsKHJlcXVlc3RzOiBJQ2hhdFJlcXVlc3RNb2RlbFtdKTogSUNoYXRNb2RlbCB7XG5cdFx0cmV0dXJuIHsgZ2V0UmVxdWVzdHM6ICgpID0+IHJlcXVlc3RzIH0gYXMgdW5rbm93biBhcyBJQ2hhdE1vZGVsO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3ViYWdlbnRPZihwYXJ0OiBSZXNwb25zZVBhcnQpIHtcblx0XHRpZiAocGFydC5raW5kICE9PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzdWIgPSAocGFydC50b29sQ2FsbCBhcyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlKS5jb250ZW50Py5maW5kKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdHJldHVybiBzdWIgJiYgc3ViLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCA/IHsgYWdlbnROYW1lOiBzdWIuYWdlbnROYW1lLCBkZXNjcmlwdGlvbjogc3ViLmRlc2NyaXB0aW9uIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBwcm9qZWN0KG1vZGVsOiBJQ2hhdE1vZGVsKSB7XG5cdFx0cmV0dXJuIGltcG9ydGVkVHVybnNGcm9tQ2hhdE1vZGVsKG1vZGVsKS5tYXAodHVybiA9PiAoe1xuXHRcdFx0dGV4dDogdHVybi5tZXNzYWdlLnRleHQsXG5cdFx0XHRzdGF0ZTogdHVybi5zdGF0ZSxcblx0XHRcdGVycm9yOiB0dXJuLmVycm9yLFxuXHRcdFx0cGFydHM6IHR1cm4ucmVzcG9uc2VQYXJ0cy5tYXAocGFydCA9PlxuXHRcdFx0XHRwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gfHwgcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZ1xuXHRcdFx0XHRcdD8geyBraW5kOiBwYXJ0LmtpbmQsIGNvbnRlbnQ6IHBhcnQuY29udGVudCB9XG5cdFx0XHRcdFx0OiB7IGtpbmQ6IHBhcnQua2luZCwgc3ViYWdlbnQ6IHN1YmFnZW50T2YocGFydCkgfSksXG5cdFx0fSkpO1xuXHR9XG5cblx0dGVzdCgnbWFwcyBtYXJrZG93biwgcmVhc29uaW5nIGFuZCBpbmxpbmUgcmVmZXJlbmNlcyBpbiBzdHJlYW0gb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvamVjdChtb2RlbChbcmVxdWVzdCgncScsIHJlc3BvbnNlKFtcblx0XHRcdG1hcmtkb3duKCdGb3VuZCBpbiAnKSxcblx0XHRcdGlubGluZVJlZmVyZW5jZShVUkkuZmlsZSgnL3JlcG8vYS50cycpKSxcblx0XHRcdG1hcmtkb3duKCcgXHUyMDE0IGRvbmUnKSxcblx0XHRcdHRoaW5raW5nKCdsZXQgbWUgY2hlY2snKSxcblx0XHRdKSldKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdHRleHQ6ICdxJyxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnRm91bmQgaW4gJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6IGBbYS50c10oJHtVUkkuZmlsZSgnL3JlcG8vYS50cycpLnRvU3RyaW5nKCl9KWAgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnIFx1MjAxNCBkb25lJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLCBjb250ZW50OiAnbGV0IG1lIGNoZWNrJyB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxhcHNlcyBhIHBhdGgtbGlrZSBpbmxpbmUgcmVmZXJlbmNlIGxhYmVsIHRvIHRoZSBmaWxlIGJhc2VuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvcmVwby9zcmMvY29tbW9uL2FwcEluc2lnaHRzQ2xpZW50RmFjdG9yeS50cycpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByb2plY3QobW9kZWwoW3JlcXVlc3QoJ3EnLCByZXNwb25zZShbXG5cdFx0XHRpbmxpbmVSZWZlcmVuY2UodXJpLCAnc3JjL2NvbW1vbi9hcHBJbnNpZ2h0c0NsaWVudEZhY3RvcnkudHMnKSxcblx0XHRdKSldKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdHRleHQ6ICdxJyxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiBgW2FwcEluc2lnaHRzQ2xpZW50RmFjdG9yeS50c10oJHt1cmkudG9TdHJpbmcoKX0pYCB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGEgc2hvcnQgaW5saW5lIHJlZmVyZW5jZSBsYWJlbCAoZS5nLiBhIHN5bWJvbCBuYW1lKSBhcy1pcycsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3JlcG8vc3JjL2NvbW1vbi9hcHBJbnNpZ2h0c0NsaWVudEZhY3RvcnkudHMnKTtcblx0XHRjb25zdCByZXN1bHQgPSBwcm9qZWN0KG1vZGVsKFtyZXF1ZXN0KCdxJywgcmVzcG9uc2UoW1xuXHRcdFx0aW5saW5lUmVmZXJlbmNlKHVyaSwgJ2xvZ0V2ZW50JyksXG5cdFx0XSkpXSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHR0ZXh0OiAncScsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogYFtsb2dFdmVudF0oJHt1cmkudG9TdHJpbmcoKX0pYCB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgYSBMb2NhdGlvbi1zaGFwZWQgaW5saW5lIHJlZmVyZW5jZSB0byBpdHMgZmlsZSBiYXNlbmFtZScsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3JlcG8vc3JjL2NvbW1vbi9iYXNlVGVsZW1ldHJ5U2VuZGVyLnRzJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvamVjdChtb2RlbChbcmVxdWVzdCgncScsIHJlc3BvbnNlKFtcblx0XHRcdGlubGluZVJlZih7IHVyaSwgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxIH0gfSksXG5cdFx0XSkpXSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHR0ZXh0OiAncScsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogYFtiYXNlVGVsZW1ldHJ5U2VuZGVyLnRzXSgke3VyaS50b1N0cmluZygpfSlgIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBhIHdvcmtzcGFjZS1zeW1ib2wgaW5saW5lIHJlZmVyZW5jZSB1c2luZyBpdHMgc3ltYm9sIG5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9yZXBvL3NyYy9jb21tb24vYmFzZVRlbGVtZXRyeVNlbmRlci50cycpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByb2plY3QobW9kZWwoW3JlcXVlc3QoJ3EnLCByZXNwb25zZShbXG5cdFx0XHRpbmxpbmVSZWYoeyBuYW1lOiAnbG9nRXZlbnQnLCBsb2NhdGlvbjogeyB1cmkgfSB9KSxcblx0XHRdKSldKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdHRleHQ6ICdxJyxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiBgW2xvZ0V2ZW50XSgke3VyaS50b1N0cmluZygpfSlgIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgcGxhaW4gbGFiZWwgd2hlbiBhbiBpbmxpbmUgcmVmZXJlbmNlIGhhcyBubyByZXNvbHZhYmxlIFVSSScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcm9qZWN0KG1vZGVsKFtyZXF1ZXN0KCdxJywgcmVzcG9uc2UoW1xuXHRcdFx0aW5saW5lUmVmKHsgbmFtZTogJ29ycGhhbicgfSwgJ29ycGhhbicpLFxuXHRcdF0pKV0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0dGV4dDogJ3EnLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdvcnBoYW4nIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBhIGNhbmNlbGxlZCByZXNwb25zZSB0byBhIGNhbmNlbGxlZCB0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByb2plY3QobW9kZWwoW3JlcXVlc3QoJ3EnLCByZXNwb25zZShbbWFya2Rvd24oJ3BhcnRpYWwnKV0sIHsgY2FuY2VsZWQ6IHRydWUgfSkpXSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHR0ZXh0OiAncScsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCxcblx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ3BhcnRpYWwnIH1dLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBhbiBlcnJvcmVkIHJlc3BvbnNlIHRvIGFuIGVycm9yIHR1cm4gY2FycnlpbmcgdGhlIG1lc3NhZ2UgYW5kIGNvZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvamVjdChtb2RlbChbcmVxdWVzdCgncScsIHJlc3BvbnNlKFtdLCB7IGVycm9yOiB7IG1lc3NhZ2U6ICdib29tJywgY29kZTogJ0UxJyB9IH0pKV0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0dGV4dDogJ3EnLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5FcnJvcixcblx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ0UxJywgbWVzc2FnZTogJ2Jvb20nIH0sXG5cdFx0XHRwYXJ0czogW10sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2xkcyBhIHN5c3RlbS1pbml0aWF0ZWQgY29udGludWF0aW9uIGludG8gdGhlIHByZXZpb3VzIHR1cm4gYW5kIHN1cGVyc2VkZXMgaXRzIG91dGNvbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvamVjdChtb2RlbChbXG5cdFx0XHRyZXF1ZXN0KCdyZWFsIHF1ZXN0aW9uJywgcmVzcG9uc2UoW21hcmtkb3duKCd3b3JraW5nJyldKSksXG5cdFx0XHRyZXF1ZXN0KCdbVGVybWluYWwgbm90aWZpY2F0aW9uXScsIHJlc3BvbnNlKFttYXJrZG93bignY29udGludWVkJyldLCB7IGNhbmNlbGVkOiB0cnVlIH0pLCB7IHN5c3RlbUluaXRpYXRlZDogdHJ1ZSB9KSxcblx0XHRdKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdHRleHQ6ICdyZWFsIHF1ZXN0aW9uJyxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ2FuY2VsbGVkLFxuXHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ3dvcmtpbmcnIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ2NvbnRpbnVlZCcgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIGEgc3ViLWFnZW50IHRvb2wgaW52b2NhdGlvbiBwcmVzZXJ2aW5nIGl0cyBpZGVudGl0eSBhcyBzdHJ1Y3R1cmVkIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvamVjdChtb2RlbChbcmVxdWVzdCgnZGVsZWdhdGUnLCByZXNwb25zZShbc3ViYWdlbnRUb29sKCd0Yy0xJywgJ2V4cGxvcmUnLCAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJywgJ2RvbmUnKV0pKV0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0dGV4dDogJ2RlbGVnYXRlJyxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHN1YmFnZW50OiB7IGFnZW50TmFtZTogJ2V4cGxvcmUnLCBkZXNjcmlwdGlvbjogJ0V4cGxvcmVzIHRoZSBjb2RlYmFzZScgfSB9XSxcblx0XHR9XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCLHVCQUF1QixpQkFBaUU7QUFFbkgsU0FBUyxrQ0FBa0M7QUFFM0MsTUFBTSw4QkFBOEIsTUFBTTtBQUV6QywwQ0FBd0M7QUFFeEMsV0FBUyxTQUFTLE9BQTZDO0FBQzlELFdBQU8sRUFBRSxN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
