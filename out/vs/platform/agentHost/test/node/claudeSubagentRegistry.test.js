import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType } from "../../common/state/protocol/state.js";
import { scanTranscriptForAgentIds, SUBAGENT_ID_SUFFIX_REGEX, SubagentRegistry, SubagentSpawn } from "../../node/claude/claudeSubagentRegistry.js";
function makeAgentToolCallTurn(toolCallId, opts) {
  return {
    id: "turn-" + toolCallId,
    message: { text: "", origin: { kind: MessageKind.User } },
    responseParts: [{
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        toolCallId,
        toolName: opts.toolName ?? "Task",
        displayName: "Task",
        status: opts.status ?? ToolCallStatus.Completed,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        invocationMessage: "invoking task",
        success: true,
        pastTenseMessage: "task done",
        content: opts.suffixText !== void 0 ? [{ type: ToolResultContentType.Text, text: opts.suffixText }] : void 0
      }
    }],
    state: 0,
    startedAt: "1970-01-01T00:00:00.001Z",
    duration: 2,
    usage: void 0
  };
}
suite("SubagentSpawn", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("agentId is set-once via setAgentId; subagentType/description/background are mutable; markAnnounced and markCompleted are first-call-true-then-false", () => {
    const spawn = new SubagentSpawn("toolu_x");
    const beforeSet = spawn.agentId;
    spawn.setAgentId("agent-1");
    spawn.setAgentId("agent-2");
    const afterSet = spawn.agentId;
    spawn.subagentType = "Explore";
    spawn.description = "Count files";
    spawn.background = true;
    const announce1 = spawn.markAnnounced();
    const announce2 = spawn.markAnnounced();
    const complete1 = spawn.markCompleted();
    const complete2 = spawn.markCompleted();
    assert.deepStrictEqual({
      toolUseId: spawn.toolUseId,
      beforeSet,
      afterSet,
      subagentType: spawn.subagentType,
      description: spawn.description,
      background: spawn.background,
      announce1,
      announce2,
      complete1,
      complete2
    }, {
      toolUseId: "toolu_x",
      beforeSet: void 0,
      afterSet: "agent-1",
      // second setAgentId silently dropped
      subagentType: "Explore",
      description: "Count files",
      background: true,
      announce1: true,
      announce2: false,
      complete1: true,
      complete2: false
    });
  });
});
suite("SubagentRegistry", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function r() {
    return disposables.add(new SubagentRegistry());
  }
  test("recordSpawn is idempotent; init fields are first-writer-wins; getSpawn returns the same record across calls", () => {
    const registry = r();
    const first = registry.recordSpawn("toolu_a", { agentId: "agent-1", subagentType: "Explore", description: "first desc" });
    const second = registry.recordSpawn("toolu_a", { agentId: "agent-2", subagentType: "OverwriteAttempt", description: "second desc" });
    assert.deepStrictEqual({
      sameRef: first === second,
      retrieved: registry.getSpawn("toolu_a") === first,
      agentId: first.agentId,
      subagentType: first.subagentType,
      description: first.description
    }, {
      sameRef: true,
      retrieved: true,
      agentId: "agent-1",
      subagentType: "Explore",
      description: "first desc"
    });
  });
  test("removeSpawn deletes the spawn AND evicts inner-tool edges that pointed at it; other parents\u2019 edges are untouched", () => {
    const registry = r();
    registry.recordSpawn("toolu_parent_a");
    registry.recordSpawn("toolu_parent_b");
    registry.noteInnerTool("toolu_inner_a1", "toolu_parent_a");
    registry.noteInnerTool("toolu_inner_a2", "toolu_parent_a");
    registry.noteInnerTool("toolu_inner_b1", "toolu_parent_b");
    registry.removeSpawn("toolu_parent_a");
    assert.deepStrictEqual({
      parentA: registry.getSpawn("toolu_parent_a"),
      parentB: registry.getSpawn("toolu_parent_b")?.toolUseId,
      innerA1Parent: registry.getParentSpawn("toolu_inner_a1"),
      innerA2Parent: registry.getParentSpawn("toolu_inner_a2"),
      innerB1Parent: registry.getParentSpawn("toolu_inner_b1")?.toolUseId
    }, {
      parentA: void 0,
      parentB: "toolu_parent_b",
      innerA1Parent: void 0,
      innerA2Parent: void 0,
      innerB1Parent: "toolu_parent_b"
    });
  });
  test("drainForegroundSpawns: returns and removes only foreground spawns; background spawns survive; inner-edge entries pointing at drained spawns are evicted", () => {
    const registry = r();
    registry.recordSpawn("toolu_fg_1");
    const bg = registry.recordSpawn("toolu_bg");
    bg.background = true;
    registry.recordSpawn("toolu_fg_2");
    registry.noteInnerTool("toolu_inner_fg1", "toolu_fg_1");
    registry.noteInnerTool("toolu_inner_bg", "toolu_bg");
    const drained = registry.drainForegroundSpawns();
    assert.deepStrictEqual({
      drainedIds: drained.map((s) => s.toolUseId).sort(),
      survivedFg1: registry.getSpawn("toolu_fg_1"),
      survivedFg2: registry.getSpawn("toolu_fg_2"),
      survivedBg: registry.getSpawn("toolu_bg")?.toolUseId,
      fgInnerEvicted: registry.getParentSpawn("toolu_inner_fg1"),
      bgInnerSurvived: registry.getParentSpawn("toolu_inner_bg")?.toolUseId
    }, {
      drainedIds: ["toolu_fg_1", "toolu_fg_2"],
      survivedFg1: void 0,
      survivedFg2: void 0,
      survivedBg: "toolu_bg",
      fgInnerEvicted: void 0,
      bgInnerSurvived: "toolu_bg"
    });
  });
  test("primeFromTranscript scans Task tool_result text blocks for agentId suffix and records each pair (idempotent against repeat calls)", () => {
    const registry = r();
    const transcript = [
      makeAgentToolCallTurn("toolu_a", { suffixText: "agentId: agentaaa\n(use SendMessage with to: 'agentaaa')" }),
      makeAgentToolCallTurn("toolu_b", { suffixText: "no suffix here" }),
      makeAgentToolCallTurn("toolu_c", { suffixText: "agentId: agentccc" }),
      makeAgentToolCallTurn("toolu_d", { suffixText: "agentId: agentddd", toolName: "Read" })
      // not a subagent tool
    ];
    registry.primeFromTranscript(transcript);
    registry.primeFromTranscript(transcript);
    assert.deepStrictEqual({
      a: registry.getSpawn("toolu_a")?.agentId,
      b: registry.getSpawn("toolu_b"),
      c: registry.getSpawn("toolu_c")?.agentId,
      d: registry.getSpawn("toolu_d")
    }, {
      a: "agentaaa",
      b: void 0,
      c: "agentccc",
      d: void 0
    });
  });
  test("dispose clears spawns + inner-edge maps so a stray reference cannot resurrect stale state", () => {
    const registry = new SubagentRegistry();
    registry.recordSpawn("toolu_x", { agentId: "agent-x" });
    registry.noteInnerTool("toolu_inner", "toolu_x");
    registry.dispose();
    assert.deepStrictEqual({
      spawn: registry.getSpawn("toolu_x"),
      innerParent: registry.getParentSpawn("toolu_inner")
    }, {
      spawn: void 0,
      innerParent: void 0
    });
  });
});
suite("SUBAGENT_ID_SUFFIX_REGEX + scanTranscriptForAgentIds", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("regex matches canonical and drifted formats; rejects unrelated text", () => {
    const matches = [
      "agentId: abc123 (use SendMessage with to: 'abc123') ...",
      "agentId:   abc123\n",
      "  agentId: abc123",
      "AgentId: ABC123",
      "noise\nagentId: xyz789 trailing"
    ];
    const nonMatches = [
      "no agent here",
      "agent-Id: nope",
      "agentid abc no colon"
    ];
    assert.deepStrictEqual({
      matches: matches.map((t) => SUBAGENT_ID_SUFFIX_REGEX.exec(t)?.[1]),
      nonMatches: nonMatches.map((t) => SUBAGENT_ID_SUFFIX_REGEX.exec(t))
    }, {
      matches: ["abc123", "abc123", "abc123", "ABC123", "xyz789"],
      nonMatches: [null, null, null]
    });
  });
  test("scanTranscriptForAgentIds returns only the (toolCallId \u2192 agentId) pairs from terminal Task/Agent tool_result text blocks", () => {
    const transcript = [
      makeAgentToolCallTurn("toolu_match", { suffixText: "agentId: agentmatch" }),
      makeAgentToolCallTurn("toolu_streaming", { suffixText: "agentId: agentstream", status: ToolCallStatus.Streaming }),
      makeAgentToolCallTurn("toolu_no_suffix", { suffixText: "just text" }),
      makeAgentToolCallTurn("toolu_wrong_tool", { suffixText: "agentId: agentx", toolName: "Read" })
    ];
    const pairs = scanTranscriptForAgentIds(transcript);
    assert.deepStrictEqual(Array.from(pairs.entries()).sort(), [
      ["toolu_match", "agentmatch"]
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVTdWJhZ2VudFJlZ2lzdHJ5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgdHlwZSBUdXJuIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IHNjYW5UcmFuc2NyaXB0Rm9yQWdlbnRJZHMsIFNVQkFHRU5UX0lEX1NVRkZJWF9SRUdFWCwgU3ViYWdlbnRSZWdpc3RyeSwgU3ViYWdlbnRTcGF3biB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZVN1YmFnZW50UmVnaXN0cnkuanMnO1xuXG5mdW5jdGlvbiBtYWtlQWdlbnRUb29sQ2FsbFR1cm4odG9vbENhbGxJZDogc3RyaW5nLCBvcHRzOiB7IHN1ZmZpeFRleHQ/OiBzdHJpbmc7IHRvb2xOYW1lPzogc3RyaW5nOyBzdGF0dXM/OiBUb29sQ2FsbFN0YXR1cyB9KTogVHVybiB7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICd0dXJuLScgKyB0b29sQ2FsbElkLFxuXHRcdG1lc3NhZ2U6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiBvcHRzLnRvb2xOYW1lID8/ICdUYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUYXNrJyxcblx0XHRcdFx0c3RhdHVzOiBvcHRzLnN0YXR1cyA/PyBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ2ludm9raW5nIHRhc2snLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAndGFzayBkb25lJyxcblx0XHRcdFx0Y29udGVudDogb3B0cy5zdWZmaXhUZXh0ICE9PSB1bmRlZmluZWQgPyBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogb3B0cy5zdWZmaXhUZXh0IH1dIDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9XSxcblx0XHRzdGF0ZTogMCBhcyB1bmtub3duIGFzIFR1cm5bJ3N0YXRlJ10sXG5cdFx0c3RhcnRlZEF0OiAnMTk3MC0wMS0wMVQwMDowMDowMC4wMDFaJyxcblx0XHRkdXJhdGlvbjogMixcblx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHR9IGFzIFR1cm47XG59XG5cbnN1aXRlKCdTdWJhZ2VudFNwYXduJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FnZW50SWQgaXMgc2V0LW9uY2UgdmlhIHNldEFnZW50SWQ7IHN1YmFnZW50VHlwZS9kZXNjcmlwdGlvbi9iYWNrZ3JvdW5kIGFyZSBtdXRhYmxlOyBtYXJrQW5ub3VuY2VkIGFuZCBtYXJrQ29tcGxldGVkIGFyZSBmaXJzdC1jYWxsLXRydWUtdGhlbi1mYWxzZScsICgpID0+IHtcblx0XHRjb25zdCBzcGF3biA9IG5ldyBTdWJhZ2VudFNwYXduKCd0b29sdV94Jyk7XG5cblx0XHRjb25zdCBiZWZvcmVTZXQgPSBzcGF3bi5hZ2VudElkO1xuXHRcdHNwYXduLnNldEFnZW50SWQoJ2FnZW50LTEnKTtcblx0XHRzcGF3bi5zZXRBZ2VudElkKCdhZ2VudC0yJyk7IC8vIGlnbm9yZWQ6IGZpcnN0LXdyaXRlci13aW5zXG5cdFx0Y29uc3QgYWZ0ZXJTZXQgPSBzcGF3bi5hZ2VudElkO1xuXG5cdFx0c3Bhd24uc3ViYWdlbnRUeXBlID0gJ0V4cGxvcmUnO1xuXHRcdHNwYXduLmRlc2NyaXB0aW9uID0gJ0NvdW50IGZpbGVzJztcblx0XHRzcGF3bi5iYWNrZ3JvdW5kID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGFubm91bmNlMSA9IHNwYXduLm1hcmtBbm5vdW5jZWQoKTtcblx0XHRjb25zdCBhbm5vdW5jZTIgPSBzcGF3bi5tYXJrQW5ub3VuY2VkKCk7XG5cdFx0Y29uc3QgY29tcGxldGUxID0gc3Bhd24ubWFya0NvbXBsZXRlZCgpO1xuXHRcdGNvbnN0IGNvbXBsZXRlMiA9IHNwYXduLm1hcmtDb21wbGV0ZWQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dG9vbFVzZUlkOiBzcGF3bi50b29sVXNlSWQsXG5cdFx0XHRiZWZvcmVTZXQsXG5cdFx0XHRhZnRlclNldCxcblx0XHRcdHN1YmFnZW50VHlwZTogc3Bhd24uc3ViYWdlbnRUeXBlLFxuXHRcdFx0ZGVzY3JpcHRpb246IHNwYXduLmRlc2NyaXB0aW9uLFxuXHRcdFx0YmFja2dyb3VuZDogc3Bhd24uYmFja2dyb3VuZCxcblx0XHRcdGFubm91bmNlMSxcblx0XHRcdGFubm91bmNlMixcblx0XHRcdGNvbXBsZXRlMSxcblx0XHRcdGNvbXBsZXRlMixcblx0XHR9LCB7XG5cdFx0XHR0b29sVXNlSWQ6ICd0b29sdV94Jyxcblx0XHRcdGJlZm9yZVNldDogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXJTZXQ6ICdhZ2VudC0xJywgLy8gc2Vjb25kIHNldEFnZW50SWQgc2lsZW50bHkgZHJvcHBlZFxuXHRcdFx0c3ViYWdlbnRUeXBlOiAnRXhwbG9yZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0NvdW50IGZpbGVzJyxcblx0XHRcdGJhY2tncm91bmQ6IHRydWUsXG5cdFx0XHRhbm5vdW5jZTE6IHRydWUsXG5cdFx0XHRhbm5vdW5jZTI6IGZhbHNlLFxuXHRcdFx0Y29tcGxldGUxOiB0cnVlLFxuXHRcdFx0Y29tcGxldGUyOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1N1YmFnZW50UmVnaXN0cnknLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiByKCk6IFN1YmFnZW50UmVnaXN0cnkge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFN1YmFnZW50UmVnaXN0cnkoKSk7XG5cdH1cblxuXHR0ZXN0KCdyZWNvcmRTcGF3biBpcyBpZGVtcG90ZW50OyBpbml0IGZpZWxkcyBhcmUgZmlyc3Qtd3JpdGVyLXdpbnM7IGdldFNwYXduIHJldHVybnMgdGhlIHNhbWUgcmVjb3JkIGFjcm9zcyBjYWxscycsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblx0XHRjb25zdCBmaXJzdCA9IHJlZ2lzdHJ5LnJlY29yZFNwYXduKCd0b29sdV9hJywgeyBhZ2VudElkOiAnYWdlbnQtMScsIHN1YmFnZW50VHlwZTogJ0V4cGxvcmUnLCBkZXNjcmlwdGlvbjogJ2ZpcnN0IGRlc2MnIH0pO1xuXHRcdGNvbnN0IHNlY29uZCA9IHJlZ2lzdHJ5LnJlY29yZFNwYXduKCd0b29sdV9hJywgeyBhZ2VudElkOiAnYWdlbnQtMicsIHN1YmFnZW50VHlwZTogJ092ZXJ3cml0ZUF0dGVtcHQnLCBkZXNjcmlwdGlvbjogJ3NlY29uZCBkZXNjJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2FtZVJlZjogZmlyc3QgPT09IHNlY29uZCxcblx0XHRcdHJldHJpZXZlZDogcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X2EnKSA9PT0gZmlyc3QsXG5cdFx0XHRhZ2VudElkOiBmaXJzdC5hZ2VudElkLFxuXHRcdFx0c3ViYWdlbnRUeXBlOiBmaXJzdC5zdWJhZ2VudFR5cGUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZmlyc3QuZGVzY3JpcHRpb24sXG5cdFx0fSwge1xuXHRcdFx0c2FtZVJlZjogdHJ1ZSxcblx0XHRcdHJldHJpZXZlZDogdHJ1ZSxcblx0XHRcdGFnZW50SWQ6ICdhZ2VudC0xJyxcblx0XHRcdHN1YmFnZW50VHlwZTogJ0V4cGxvcmUnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdmaXJzdCBkZXNjJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlU3Bhd24gZGVsZXRlcyB0aGUgc3Bhd24gQU5EIGV2aWN0cyBpbm5lci10b29sIGVkZ2VzIHRoYXQgcG9pbnRlZCBhdCBpdDsgb3RoZXIgcGFyZW50c1x1MjAxOSBlZGdlcyBhcmUgdW50b3VjaGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdHJlZ2lzdHJ5LnJlY29yZFNwYXduKCd0b29sdV9wYXJlbnRfYScpO1xuXHRcdHJlZ2lzdHJ5LnJlY29yZFNwYXduKCd0b29sdV9wYXJlbnRfYicpO1xuXHRcdHJlZ2lzdHJ5Lm5vdGVJbm5lclRvb2woJ3Rvb2x1X2lubmVyX2ExJywgJ3Rvb2x1X3BhcmVudF9hJyk7XG5cdFx0cmVnaXN0cnkubm90ZUlubmVyVG9vbCgndG9vbHVfaW5uZXJfYTInLCAndG9vbHVfcGFyZW50X2EnKTtcblx0XHRyZWdpc3RyeS5ub3RlSW5uZXJUb29sKCd0b29sdV9pbm5lcl9iMScsICd0b29sdV9wYXJlbnRfYicpO1xuXG5cdFx0cmVnaXN0cnkucmVtb3ZlU3Bhd24oJ3Rvb2x1X3BhcmVudF9hJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBhcmVudEE6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9wYXJlbnRfYScpLFxuXHRcdFx0cGFyZW50QjogcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X3BhcmVudF9iJyk/LnRvb2xVc2VJZCxcblx0XHRcdGlubmVyQTFQYXJlbnQ6IHJlZ2lzdHJ5LmdldFBhcmVudFNwYXduKCd0b29sdV9pbm5lcl9hMScpLFxuXHRcdFx0aW5uZXJBMlBhcmVudDogcmVnaXN0cnkuZ2V0UGFyZW50U3Bhd24oJ3Rvb2x1X2lubmVyX2EyJyksXG5cdFx0XHRpbm5lckIxUGFyZW50OiByZWdpc3RyeS5nZXRQYXJlbnRTcGF3bigndG9vbHVfaW5uZXJfYjEnKT8udG9vbFVzZUlkLFxuXHRcdH0sIHtcblx0XHRcdHBhcmVudEE6IHVuZGVmaW5lZCxcblx0XHRcdHBhcmVudEI6ICd0b29sdV9wYXJlbnRfYicsXG5cdFx0XHRpbm5lckExUGFyZW50OiB1bmRlZmluZWQsXG5cdFx0XHRpbm5lckEyUGFyZW50OiB1bmRlZmluZWQsXG5cdFx0XHRpbm5lckIxUGFyZW50OiAndG9vbHVfcGFyZW50X2InLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkcmFpbkZvcmVncm91bmRTcGF3bnM6IHJldHVybnMgYW5kIHJlbW92ZXMgb25seSBmb3JlZ3JvdW5kIHNwYXduczsgYmFja2dyb3VuZCBzcGF3bnMgc3Vydml2ZTsgaW5uZXItZWRnZSBlbnRyaWVzIHBvaW50aW5nIGF0IGRyYWluZWQgc3Bhd25zIGFyZSBldmljdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdHJlZ2lzdHJ5LnJlY29yZFNwYXduKCd0b29sdV9mZ18xJyk7XG5cdFx0Y29uc3QgYmcgPSByZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfYmcnKTtcblx0XHRiZy5iYWNrZ3JvdW5kID0gdHJ1ZTtcblx0XHRyZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfZmdfMicpO1xuXHRcdHJlZ2lzdHJ5Lm5vdGVJbm5lclRvb2woJ3Rvb2x1X2lubmVyX2ZnMScsICd0b29sdV9mZ18xJyk7XG5cdFx0cmVnaXN0cnkubm90ZUlubmVyVG9vbCgndG9vbHVfaW5uZXJfYmcnLCAndG9vbHVfYmcnKTtcblxuXHRcdGNvbnN0IGRyYWluZWQgPSByZWdpc3RyeS5kcmFpbkZvcmVncm91bmRTcGF3bnMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZHJhaW5lZElkczogZHJhaW5lZC5tYXAocyA9PiBzLnRvb2xVc2VJZCkuc29ydCgpLFxuXHRcdFx0c3Vydml2ZWRGZzE6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9mZ18xJyksXG5cdFx0XHRzdXJ2aXZlZEZnMjogcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X2ZnXzInKSxcblx0XHRcdHN1cnZpdmVkQmc6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9iZycpPy50b29sVXNlSWQsXG5cdFx0XHRmZ0lubmVyRXZpY3RlZDogcmVnaXN0cnkuZ2V0UGFyZW50U3Bhd24oJ3Rvb2x1X2lubmVyX2ZnMScpLFxuXHRcdFx0YmdJbm5lclN1cnZpdmVkOiByZWdpc3RyeS5nZXRQYXJlbnRTcGF3bigndG9vbHVfaW5uZXJfYmcnKT8udG9vbFVzZUlkLFxuXHRcdH0sIHtcblx0XHRcdGRyYWluZWRJZHM6IFsndG9vbHVfZmdfMScsICd0b29sdV9mZ18yJ10sXG5cdFx0XHRzdXJ2aXZlZEZnMTogdW5kZWZpbmVkLFxuXHRcdFx0c3Vydml2ZWRGZzI6IHVuZGVmaW5lZCxcblx0XHRcdHN1cnZpdmVkQmc6ICd0b29sdV9iZycsXG5cdFx0XHRmZ0lubmVyRXZpY3RlZDogdW5kZWZpbmVkLFxuXHRcdFx0YmdJbm5lclN1cnZpdmVkOiAndG9vbHVfYmcnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmltZUZyb21UcmFuc2NyaXB0IHNjYW5zIFRhc2sgdG9vbF9yZXN1bHQgdGV4dCBibG9ja3MgZm9yIGFnZW50SWQgc3VmZml4IGFuZCByZWNvcmRzIGVhY2ggcGFpciAoaWRlbXBvdGVudCBhZ2FpbnN0IHJlcGVhdCBjYWxscyknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSByKCk7XG5cdFx0Y29uc3QgdHJhbnNjcmlwdDogcmVhZG9ubHkgVHVybltdID0gW1xuXHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV9hJywgeyBzdWZmaXhUZXh0OiAnYWdlbnRJZDogYWdlbnRhYWFcXG4odXNlIFNlbmRNZXNzYWdlIHdpdGggdG86IFxcJ2FnZW50YWFhXFwnKScgfSksXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X2InLCB7IHN1ZmZpeFRleHQ6ICdubyBzdWZmaXggaGVyZScgfSksXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X2MnLCB7IHN1ZmZpeFRleHQ6ICdhZ2VudElkOiBhZ2VudGNjYycgfSksXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X2QnLCB7IHN1ZmZpeFRleHQ6ICdhZ2VudElkOiBhZ2VudGRkZCcsIHRvb2xOYW1lOiAnUmVhZCcgfSksIC8vIG5vdCBhIHN1YmFnZW50IHRvb2xcblx0XHRdO1xuXG5cdFx0cmVnaXN0cnkucHJpbWVGcm9tVHJhbnNjcmlwdCh0cmFuc2NyaXB0KTtcblx0XHRyZWdpc3RyeS5wcmltZUZyb21UcmFuc2NyaXB0KHRyYW5zY3JpcHQpOyAvLyBpZGVtcG90ZW50XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGE6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9hJyk/LmFnZW50SWQsXG5cdFx0XHRiOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfYicpLFxuXHRcdFx0YzogcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X2MnKT8uYWdlbnRJZCxcblx0XHRcdGQ6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9kJyksXG5cdFx0fSwge1xuXHRcdFx0YTogJ2FnZW50YWFhJyxcblx0XHRcdGI6IHVuZGVmaW5lZCxcblx0XHRcdGM6ICdhZ2VudGNjYycsXG5cdFx0XHRkOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgY2xlYXJzIHNwYXducyArIGlubmVyLWVkZ2UgbWFwcyBzbyBhIHN0cmF5IHJlZmVyZW5jZSBjYW5ub3QgcmVzdXJyZWN0IHN0YWxlIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IFN1YmFnZW50UmVnaXN0cnkoKTtcblx0XHRyZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfeCcsIHsgYWdlbnRJZDogJ2FnZW50LXgnIH0pO1xuXHRcdHJlZ2lzdHJ5Lm5vdGVJbm5lclRvb2woJ3Rvb2x1X2lubmVyJywgJ3Rvb2x1X3gnKTtcblxuXHRcdHJlZ2lzdHJ5LmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3Bhd246IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV94JyksXG5cdFx0XHRpbm5lclBhcmVudDogcmVnaXN0cnkuZ2V0UGFyZW50U3Bhd24oJ3Rvb2x1X2lubmVyJyksXG5cdFx0fSwge1xuXHRcdFx0c3Bhd246IHVuZGVmaW5lZCxcblx0XHRcdGlubmVyUGFyZW50OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdTVUJBR0VOVF9JRF9TVUZGSVhfUkVHRVggKyBzY2FuVHJhbnNjcmlwdEZvckFnZW50SWRzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlZ2V4IG1hdGNoZXMgY2Fub25pY2FsIGFuZCBkcmlmdGVkIGZvcm1hdHM7IHJlamVjdHMgdW5yZWxhdGVkIHRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2hlcyA9IFtcblx0XHRcdCdhZ2VudElkOiBhYmMxMjMgKHVzZSBTZW5kTWVzc2FnZSB3aXRoIHRvOiBcXCdhYmMxMjNcXCcpIC4uLicsXG5cdFx0XHQnYWdlbnRJZDogICBhYmMxMjNcXG4nLFxuXHRcdFx0JyAgYWdlbnRJZDogYWJjMTIzJyxcblx0XHRcdCdBZ2VudElkOiBBQkMxMjMnLFxuXHRcdFx0J25vaXNlXFxuYWdlbnRJZDogeHl6Nzg5IHRyYWlsaW5nJyxcblx0XHRdO1xuXHRcdGNvbnN0IG5vbk1hdGNoZXMgPSBbXG5cdFx0XHQnbm8gYWdlbnQgaGVyZScsXG5cdFx0XHQnYWdlbnQtSWQ6IG5vcGUnLFxuXHRcdFx0J2FnZW50aWQgYWJjIG5vIGNvbG9uJyxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtYXRjaGVzOiBtYXRjaGVzLm1hcCh0ID0+IFNVQkFHRU5UX0lEX1NVRkZJWF9SRUdFWC5leGVjKHQpPy5bMV0pLFxuXHRcdFx0bm9uTWF0Y2hlczogbm9uTWF0Y2hlcy5tYXAodCA9PiBTVUJBR0VOVF9JRF9TVUZGSVhfUkVHRVguZXhlYyh0KSksXG5cdFx0fSwge1xuXHRcdFx0bWF0Y2hlczogWydhYmMxMjMnLCAnYWJjMTIzJywgJ2FiYzEyMycsICdBQkMxMjMnLCAneHl6Nzg5J10sXG5cdFx0XHRub25NYXRjaGVzOiBbbnVsbCwgbnVsbCwgbnVsbF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NjYW5UcmFuc2NyaXB0Rm9yQWdlbnRJZHMgcmV0dXJucyBvbmx5IHRoZSAodG9vbENhbGxJZCBcdTIxOTIgYWdlbnRJZCkgcGFpcnMgZnJvbSB0ZXJtaW5hbCBUYXNrL0FnZW50IHRvb2xfcmVzdWx0IHRleHQgYmxvY2tzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyYW5zY3JpcHQ6IHJlYWRvbmx5IFR1cm5bXSA9IFtcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfbWF0Y2gnLCB7IHN1ZmZpeFRleHQ6ICdhZ2VudElkOiBhZ2VudG1hdGNoJyB9KSxcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfc3RyZWFtaW5nJywgeyBzdWZmaXhUZXh0OiAnYWdlbnRJZDogYWdlbnRzdHJlYW0nLCBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyB9KSxcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfbm9fc3VmZml4JywgeyBzdWZmaXhUZXh0OiAnanVzdCB0ZXh0JyB9KSxcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfd3JvbmdfdG9vbCcsIHsgc3VmZml4VGV4dDogJ2FnZW50SWQ6IGFnZW50eCcsIHRvb2xOYW1lOiAnUmVhZCcgfSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHBhaXJzID0gc2NhblRyYW5zY3JpcHRGb3JBZ2VudElkcyh0cmFuc2NyaXB0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShwYWlycy5lbnRyaWVzKCkpLnNvcnQoKSwgW1xuXHRcdFx0Wyd0b29sdV9tYXRjaCcsICdhZ2VudG1hdGNoJ10sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhLGtCQUFrQiw0QkFBNEIsZ0JBQWdCLDZCQUF3QztBQUM1SCxTQUFTLDJCQUEyQiwwQkFBMEIsa0JBQWtC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QUFFL0MsYUFBUyxRQUFRO0FBRWpCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTyxTQUFTLFNBQVMsU0FBUztBQUFBLE1BQ2xDLGFBQWEsU0FBUyxlQUFlLGFBQWE7QUFBQSxJQUNuRCxHQUFHO0FBQUEsTUFDRixPQUFPO0FBQUEsTUFDUCxhQUFhO0FBQUEsSUFDZCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sd0RBQXdELE1BQU07QUFFbkUsMENBQXdDO0FBRXhDLE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSxVQUFVO0FBQUEsTUFDZjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxhQUFhO0FBQUEsTUFDbEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFNBQVMsUUFBUSxJQUFJLE9BQUsseUJBQXlCLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUFBLE1BQy9ELFlBQVksV0FBVyxJQUFJLE9BQUsseUJBQXlCLEtBQUssQ0FBQyxDQUFDO0FBQUEsSUFDakUsR0FBRztBQUFBLE1BQ0YsU0FBUyxDQUFDLFVBQVUsVUFBVSxVQUFVLFVBQVUsUUFBUTtBQUFBLE1BQzFELFlBQVksQ0FBQyxNQUFNLE1BQU0sSUFBSTtBQUFBLElBQzlCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlJQUE0SCxNQUFNO0FBQ3RJLFVBQU0sYUFBOEI7QUFBQSxNQUNuQyxzQkFBc0IsZUFBZSxFQUFFLFlBQVksc0JBQXNCLENBQUM7QUFBQSxNQUMxRSxzQkFBc0IsbUJBQW1CLEVBQUUsWUFBWSx3QkFBd0IsUUFBUSxlQUFlLFVBQVUsQ0FBQztBQUFBLE1BQ2pILHNCQUFzQixtQkFBbUIsRUFBRSxZQUFZLFlBQVksQ0FBQztBQUFBLE1BQ3BFLHNCQUFzQixvQkFBb0IsRUFBRSxZQUFZLG1CQUFtQixVQUFVLE9BQU8sQ0FBQztBQUFBLElBQzlGO0FBRUEsVUFBTSxRQUFRLDBCQUEwQixVQUFVO0FBRWxELFdBQU8sZ0JBQWdCLE1BQU0sS0FBSyxNQUFNLFFBQVEsQ0FBQyxFQUFFLEtBQUssR0FBRztBQUFBLE1BQzFELENBQUMsZUFBZSxZQUFZO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
