import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { readToolCallMeta, toToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { readAgentCustomizationMeta, toAgentCustomizationMeta } from "../../common/meta/agentCustomizationMeta.js";
import { getCommandArgumentHint, getCompletionAction, readCompletionAttachmentMeta, toCommandCompletionAttachmentMeta, toSkillCompletionAttachmentMeta } from "../../common/meta/agentCompletionAttachmentMeta.js";
import { CustomizationType, MessageAttachmentKind, ToolCallStatus, hasReportedUsage, readUsageInfoMeta } from "../../common/state/sessionState.js";
import { createAgentModelByokMeta, readAgentModelByokIdentifier } from "../../common/agentModelByokMeta.js";
import { createAgentModelSourceMeta, readAgentModelSourceId } from "../../common/agentModelSource.js";
function toolCall(meta) {
  return { status: ToolCallStatus.Streaming, toolCallId: "t", toolName: "n", displayName: "d", _meta: meta };
}
function agentCustomization(meta) {
  return { type: CustomizationType.Agent, id: "a", uri: "file:///a", name: "n", _meta: meta };
}
function attachment(meta) {
  return { type: MessageAttachmentKind.Simple, label: "l", _meta: meta };
}
suite("Agent host _meta readers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("readToolCallMeta", () => {
    test("returns empty when no _meta", () => {
      assert.deepStrictEqual(readToolCallMeta(toolCall(void 0)), {});
    });
    test("reads valid keys and drops wrong-typed / unknown keys", () => {
      const result = readToolCallMeta(toolCall({
        toolKind: "terminal",
        language: "bash",
        subagentDescription: "Find files",
        subagentAgentName: "explore",
        mcpServerName: "srv",
        mcpToolName: "tool",
        autoApproveBySetting: true,
        ui: { resourceUri: "ui://app", channel: "mcp://c" },
        language2: 123,
        // unknown key, ignored
        somethingElse: 5
        // unknown key, ignored
      }));
      assert.deepStrictEqual(result, {
        toolKind: "terminal",
        language: "bash",
        subagentDescription: "Find files",
        subagentAgentName: "explore",
        mcpServerName: "srv",
        mcpToolName: "tool",
        autoApproveBySetting: true,
        ui: { resourceUri: "ui://app", channel: "mcp://c" }
      });
    });
    test("drops an invalid toolKind and a malformed ui bag", () => {
      const result = readToolCallMeta(toolCall({ toolKind: "nope", ui: { channel: "mcp://c" } }));
      assert.deepStrictEqual(result, {});
    });
    test("reads valid tool-search candidates and drops malformed corpora", () => {
      const candidates = [{ name: "everything-get-sum", description: "Adds numbers" }];
      assert.deepStrictEqual(readToolCallMeta(toolCall({ toolSearchCandidates: candidates })), { toolSearchCandidates: candidates });
      assert.deepStrictEqual(readToolCallMeta(toolCall({ toolSearchCandidates: [{ name: 1, description: "bad" }] })), {});
      assert.deepStrictEqual(readToolCallMeta(toolCall({ toolSearchCandidates: "bad" })), {});
    });
    test("toToolCallMeta round-trips and returns undefined when empty", () => {
      assert.strictEqual(toToolCallMeta({}), void 0);
      const wire = toToolCallMeta({ toolKind: "search", language: void 0 });
      assert.deepStrictEqual(wire, { toolKind: "search" });
      assert.deepStrictEqual(readToolCallMeta(toolCall(wire)), { toolKind: "search" });
    });
  });
  suite("readAgentCustomizationMeta", () => {
    test("reads userInvocable, ignores garbage, round-trips", () => {
      assert.deepStrictEqual(readAgentCustomizationMeta(agentCustomization(void 0)), {});
      assert.deepStrictEqual(readAgentCustomizationMeta(agentCustomization({ userInvocable: "yes" })), {});
      assert.deepStrictEqual(readAgentCustomizationMeta(agentCustomization({ userInvocable: false })), { userInvocable: false });
      assert.deepStrictEqual(readAgentCustomizationMeta({ ...agentCustomization({ userInvocable: true }), disableUserInvocation: true }), { userInvocable: false });
      assert.strictEqual(toAgentCustomizationMeta({}), void 0);
      assert.deepStrictEqual(toAgentCustomizationMeta({ userInvocable: true }), { userInvocable: true });
    });
  });
  suite("readCompletionAttachmentMeta", () => {
    test("classifies a command bag", () => {
      assert.deepStrictEqual(
        readCompletionAttachmentMeta(attachment({ command: "rename", description: "Rename this chat", argumentHint: "New name" })),
        { kind: "command", command: "rename", description: "Rename this chat", argumentHint: "New name" }
      );
    });
    test("classifies a skill bag, dropping wrong-typed optional fields", () => {
      assert.deepStrictEqual(
        readCompletionAttachmentMeta(attachment({ uri: "file:///s/SKILL.md", name: "mon", displayName: "mon", description: 5 })),
        { kind: "skill", uri: "file:///s/SKILL.md", name: "mon", displayName: "mon" }
      );
    });
    test("returns undefined for an unrecognized or empty bag", () => {
      assert.strictEqual(readCompletionAttachmentMeta(attachment(void 0)), void 0);
      assert.strictEqual(readCompletionAttachmentMeta(attachment({ foo: "bar" })), void 0);
      assert.strictEqual(readCompletionAttachmentMeta(attachment({ command: 5 })), void 0);
    });
    test("builders produce wire bags that round-trip", () => {
      const cmd = toCommandCompletionAttachmentMeta({ command: "rename" });
      assert.deepStrictEqual(cmd, { command: "rename" });
      assert.deepStrictEqual(readCompletionAttachmentMeta(attachment(cmd)), { kind: "command", command: "rename" });
      const cmdWithHint = toCommandCompletionAttachmentMeta({ command: "rename", argumentHint: "New name", description: void 0 });
      assert.deepStrictEqual(cmdWithHint, { command: "rename", argumentHint: "New name" });
      assert.deepStrictEqual(readCompletionAttachmentMeta(attachment(cmdWithHint)), { kind: "command", command: "rename", argumentHint: "New name" });
      const skill = toSkillCompletionAttachmentMeta({ uri: "file:///s/SKILL.md", name: "mon", displayName: "mon", description: void 0 });
      assert.deepStrictEqual(skill, { uri: "file:///s/SKILL.md", name: "mon", displayName: "mon" });
      assert.deepStrictEqual(readCompletionAttachmentMeta(attachment(skill)), { kind: "skill", uri: "file:///s/SKILL.md", name: "mon", displayName: "mon" });
    });
    test("getCommandArgumentHint reads the hint and ignores wrong-typed / absent bags", () => {
      assert.strictEqual(getCommandArgumentHint({ argumentHint: "New name" }), "New name");
      assert.strictEqual(getCommandArgumentHint({ argumentHint: 5 }), void 0);
      assert.strictEqual(getCommandArgumentHint({ command: "rename" }), void 0);
      assert.strictEqual(getCommandArgumentHint(void 0), void 0);
    });
    test("classifies a command bag carrying an action and round-trips it", () => {
      const wire = toCommandCompletionAttachmentMeta({
        command: "autopilot",
        description: "Run this request in Autopilot mode",
        argumentHint: "prompt",
        action: { applyConfig: { mode: "autopilot" } }
      });
      assert.deepStrictEqual(wire, {
        command: "autopilot",
        description: "Run this request in Autopilot mode",
        argumentHint: "prompt",
        action: { applyConfig: { mode: "autopilot" } }
      });
      assert.deepStrictEqual(readCompletionAttachmentMeta(attachment(wire)), {
        kind: "command",
        command: "autopilot",
        description: "Run this request in Autopilot mode",
        argumentHint: "prompt",
        action: { applyConfig: { mode: "autopilot" } }
      });
    });
    test("getCompletionAction reads the action, dropping wrong-typed sub-fields and empty bags", () => {
      assert.deepStrictEqual(getCompletionAction({ action: { applyConfig: { autoApprove: "autoApprove", bad: 5 } } }), { applyConfig: { autoApprove: "autoApprove" } });
      assert.strictEqual(getCompletionAction({ action: { applyConfig: {} } }), void 0);
      assert.strictEqual(getCompletionAction({ command: "yolo" }), void 0);
      assert.strictEqual(getCompletionAction(void 0), void 0);
    });
  });
  suite("agent model BYOK identifier meta", () => {
    function model(meta) {
      return { id: "m", provider: "p", name: "n", _meta: meta };
    }
    test("round-trips a model identifier through _meta", () => {
      const meta = createAgentModelByokMeta("openrouter/OpenRouter 2/aion-labs/aion-3.0");
      assert.deepStrictEqual(meta, { byokModelIdentifier: "openrouter/OpenRouter 2/aion-labs/aion-3.0" });
      assert.strictEqual(readAgentModelByokIdentifier(model(meta)), "openrouter/OpenRouter 2/aion-labs/aion-3.0");
    });
    test("omits the bag entirely when there is no identifier", () => {
      assert.strictEqual(createAgentModelByokMeta(void 0), void 0);
      assert.strictEqual(readAgentModelByokIdentifier(model(void 0)), void 0);
      assert.strictEqual(readAgentModelByokIdentifier(model({})), void 0);
    });
    test("ignores a wrong-typed identifier value", () => {
      assert.strictEqual(readAgentModelByokIdentifier(model({ byokModelIdentifier: 42 })), void 0);
    });
  });
  suite("agent model source meta", () => {
    function model(meta) {
      return { id: "m", provider: "p", name: "n", _meta: meta };
    }
    test("round-trips a source id through _meta", () => {
      const meta = createAgentModelSourceMeta("chatgptSubscription");
      assert.deepStrictEqual(meta, { modelSourceId: "chatgptSubscription" });
      assert.strictEqual(readAgentModelSourceId(model(meta)), "chatgptSubscription");
    });
    test("omits unknown sources and ignores invalid values", () => {
      assert.strictEqual(createAgentModelSourceMeta(void 0), void 0);
      assert.strictEqual(readAgentModelSourceId(model(void 0)), void 0);
      assert.strictEqual(readAgentModelSourceId(model({ modelSourceId: 42 })), void 0);
      assert.strictEqual(readAgentModelSourceId(model({ modelSourceId: "" })), void 0);
    });
  });
  suite("usage info turn token totals", () => {
    function usage(meta) {
      return { _meta: meta };
    }
    test("reads well-formed per-model totals", () => {
      const totals = [
        { model: "gpt-5", inputTokens: 1200, cachedTokens: 800, outputTokens: 340 },
        { model: "claude-sonnet-4.6", inputTokens: 40, cachedTokens: 0, outputTokens: 12 }
      ];
      assert.deepStrictEqual(readUsageInfoMeta(usage({ turnTokenTotals: totals })).turnTokenTotals, totals);
    });
    test("drops rows that are not fully formed, and reports nothing when none survive", () => {
      const meta = readUsageInfoMeta(usage({
        turnTokenTotals: [
          null,
          "nope",
          { inputTokens: 1, cachedTokens: 0, outputTokens: 1 },
          { model: "", inputTokens: 1, cachedTokens: 0, outputTokens: 1 },
          { model: "gpt-5", inputTokens: "bad", cachedTokens: 0, outputTokens: 1 },
          { model: "gpt-5", inputTokens: -1, cachedTokens: 0, outputTokens: 1 },
          { model: "gpt-5", inputTokens: 1.5, cachedTokens: 0, outputTokens: 1 },
          { model: "gpt-5", cachedTokens: 0, outputTokens: 1 },
          { model: "gpt-5", inputTokens: 7, cachedTokens: 0, outputTokens: 3 }
        ]
      }));
      assert.deepStrictEqual(meta.turnTokenTotals, [{ model: "gpt-5", inputTokens: 7, cachedTokens: 0, outputTokens: 3 }]);
      assert.strictEqual(readUsageInfoMeta(usage({ turnTokenTotals: [{ model: "gpt-5" }] })).turnTokenTotals, void 0);
      assert.strictEqual(readUsageInfoMeta(usage({ turnTokenTotals: "nope" })).turnTokenTotals, void 0);
      assert.strictEqual(readUsageInfoMeta(usage({})).turnTokenTotals, void 0);
    });
    test("totals alone do not make a usage report count as reported consumption", () => {
      assert.strictEqual(hasReportedUsage(usage({ turnTokenTotals: [{ model: "gpt-5", inputTokens: 7, cachedTokens: 0, outputTokens: 3 }] })), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGFnZW50TWV0YVJlYWRlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcmVhZFRvb2xDYWxsTWV0YSwgdG9Ub29sQ2FsbE1ldGEgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQgeyByZWFkQWdlbnRDdXN0b21pemF0aW9uTWV0YSwgdG9BZ2VudEN1c3RvbWl6YXRpb25NZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRDdXN0b21pemF0aW9uTWV0YS5qcyc7XG5pbXBvcnQgeyBnZXRDb21tYW5kQXJndW1lbnRIaW50LCBnZXRDb21wbGV0aW9uQWN0aW9uLCByZWFkQ29tcGxldGlvbkF0dGFjaG1lbnRNZXRhLCB0b0NvbW1hbmRDb21wbGV0aW9uQXR0YWNobWVudE1ldGEsIHRvU2tpbGxDb21wbGV0aW9uQXR0YWNobWVudE1ldGEgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudENvbXBsZXRpb25BdHRhY2htZW50TWV0YS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCBUb29sQ2FsbFN0YXR1cywgaGFzUmVwb3J0ZWRVc2FnZSwgcmVhZFVzYWdlSW5mb01ldGEsIHR5cGUgQWdlbnRDdXN0b21pemF0aW9uLCB0eXBlIFRvb2xDYWxsU3RhdGUsIHR5cGUgVXNhZ2VJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFNlc3Npb25Nb2RlbEluZm8sIFNpbXBsZU1lc3NhZ2VBdHRhY2htZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFnZW50TW9kZWxCeW9rTWV0YSwgcmVhZEFnZW50TW9kZWxCeW9rSWRlbnRpZmllciB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudE1vZGVsQnlva01ldGEuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWdlbnRNb2RlbFNvdXJjZU1ldGEsIHJlYWRBZ2VudE1vZGVsU291cmNlSWQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRNb2RlbFNvdXJjZS5qcyc7XG5cbi8qKiBXcmFwcyBhIGBfbWV0YWAgYmFnIGluIGEgbWluaW1hbCB7QGxpbmsgVG9vbENhbGxTdGF0ZX0gc28gdGhlIHJlYWRlciBzZWVzIHRoZSByaWdodCBzb3VyY2UgdHlwZS4gKi9cbmZ1bmN0aW9uIHRvb2xDYWxsKG1ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogVG9vbENhbGxTdGF0ZSB7XG5cdHJldHVybiB7IHN0YXR1czogVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nLCB0b29sQ2FsbElkOiAndCcsIHRvb2xOYW1lOiAnbicsIGRpc3BsYXlOYW1lOiAnZCcsIF9tZXRhOiBtZXRhIH07XG59XG5cbi8qKiBXcmFwcyBhIGBfbWV0YWAgYmFnIGluIGEgbWluaW1hbCB7QGxpbmsgQWdlbnRDdXN0b21pemF0aW9ufS4gKi9cbmZ1bmN0aW9uIGFnZW50Q3VzdG9taXphdGlvbihtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IEFnZW50Q3VzdG9taXphdGlvbiB7XG5cdHJldHVybiB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2EnLCB1cmk6ICdmaWxlOi8vL2EnLCBuYW1lOiAnbicsIF9tZXRhOiBtZXRhIH07XG59XG5cbi8qKiBXcmFwcyBhIGBfbWV0YWAgYmFnIGluIGEgbWluaW1hbCB7QGxpbmsgU2ltcGxlTWVzc2FnZUF0dGFjaG1lbnR9LiAqL1xuZnVuY3Rpb24gYXR0YWNobWVudChtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IFNpbXBsZU1lc3NhZ2VBdHRhY2htZW50IHtcblx0cmV0dXJuIHsgdHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSwgbGFiZWw6ICdsJywgX21ldGE6IG1ldGEgfTtcbn1cblxuc3VpdGUoJ0FnZW50IGhvc3QgX21ldGEgcmVhZGVycycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncmVhZFRvb2xDYWxsTWV0YScsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IHdoZW4gbm8gX21ldGEnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRUb29sQ2FsbE1ldGEodG9vbENhbGwodW5kZWZpbmVkKSksIHt9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRzIHZhbGlkIGtleXMgYW5kIGRyb3BzIHdyb25nLXR5cGVkIC8gdW5rbm93biBrZXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVhZFRvb2xDYWxsTWV0YSh0b29sQ2FsbCh7XG5cdFx0XHRcdHRvb2xLaW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRsYW5ndWFnZTogJ2Jhc2gnLFxuXHRcdFx0XHRzdWJhZ2VudERlc2NyaXB0aW9uOiAnRmluZCBmaWxlcycsXG5cdFx0XHRcdHN1YmFnZW50QWdlbnROYW1lOiAnZXhwbG9yZScsXG5cdFx0XHRcdG1jcFNlcnZlck5hbWU6ICdzcnYnLFxuXHRcdFx0XHRtY3BUb29sTmFtZTogJ3Rvb2wnLFxuXHRcdFx0XHRhdXRvQXBwcm92ZUJ5U2V0dGluZzogdHJ1ZSxcblx0XHRcdFx0dWk6IHsgcmVzb3VyY2VVcmk6ICd1aTovL2FwcCcsIGNoYW5uZWw6ICdtY3A6Ly9jJyB9LFxuXHRcdFx0XHRsYW5ndWFnZTI6IDEyMywgICAgICAgICAgICAvLyB1bmtub3duIGtleSwgaWdub3JlZFxuXHRcdFx0XHRzb21ldGhpbmdFbHNlOiA1LCAgICAgICAgICAvLyB1bmtub3duIGtleSwgaWdub3JlZFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0dG9vbEtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdGxhbmd1YWdlOiAnYmFzaCcsXG5cdFx0XHRcdHN1YmFnZW50RGVzY3JpcHRpb246ICdGaW5kIGZpbGVzJyxcblx0XHRcdFx0c3ViYWdlbnRBZ2VudE5hbWU6ICdleHBsb3JlJyxcblx0XHRcdFx0bWNwU2VydmVyTmFtZTogJ3NydicsXG5cdFx0XHRcdG1jcFRvb2xOYW1lOiAndG9vbCcsXG5cdFx0XHRcdGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlLFxuXHRcdFx0XHR1aTogeyByZXNvdXJjZVVyaTogJ3VpOi8vYXBwJywgY2hhbm5lbDogJ21jcDovL2MnIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BzIGFuIGludmFsaWQgdG9vbEtpbmQgYW5kIGEgbWFsZm9ybWVkIHVpIGJhZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlYWRUb29sQ2FsbE1ldGEodG9vbENhbGwoeyB0b29sS2luZDogJ25vcGUnLCB1aTogeyBjaGFubmVsOiAnbWNwOi8vYycgfSB9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge30pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhZHMgdmFsaWQgdG9vbC1zZWFyY2ggY2FuZGlkYXRlcyBhbmQgZHJvcHMgbWFsZm9ybWVkIGNvcnBvcmEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVzID0gW3sgbmFtZTogJ2V2ZXJ5dGhpbmctZ2V0LXN1bScsIGRlc2NyaXB0aW9uOiAnQWRkcyBudW1iZXJzJyB9XTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZFRvb2xDYWxsTWV0YSh0b29sQ2FsbCh7IHRvb2xTZWFyY2hDYW5kaWRhdGVzOiBjYW5kaWRhdGVzIH0pKSwgeyB0b29sU2VhcmNoQ2FuZGlkYXRlczogY2FuZGlkYXRlcyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZFRvb2xDYWxsTWV0YSh0b29sQ2FsbCh7IHRvb2xTZWFyY2hDYW5kaWRhdGVzOiBbeyBuYW1lOiAxLCBkZXNjcmlwdGlvbjogJ2JhZCcgfV0gfSkpLCB7fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRUb29sQ2FsbE1ldGEodG9vbENhbGwoeyB0b29sU2VhcmNoQ2FuZGlkYXRlczogJ2JhZCcgfSkpLCB7fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b1Rvb2xDYWxsTWV0YSByb3VuZC10cmlwcyBhbmQgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBlbXB0eScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b1Rvb2xDYWxsTWV0YSh7fSksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB3aXJlID0gdG9Ub29sQ2FsbE1ldGEoeyB0b29sS2luZDogJ3NlYXJjaCcsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdpcmUsIHsgdG9vbEtpbmQ6ICdzZWFyY2gnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkVG9vbENhbGxNZXRhKHRvb2xDYWxsKHdpcmUpKSwgeyB0b29sS2luZDogJ3NlYXJjaCcgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZWFkQWdlbnRDdXN0b21pemF0aW9uTWV0YScsICgpID0+IHtcblx0XHR0ZXN0KCdyZWFkcyB1c2VySW52b2NhYmxlLCBpZ25vcmVzIGdhcmJhZ2UsIHJvdW5kLXRyaXBzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkQWdlbnRDdXN0b21pemF0aW9uTWV0YShhZ2VudEN1c3RvbWl6YXRpb24odW5kZWZpbmVkKSksIHt9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZEFnZW50Q3VzdG9taXphdGlvbk1ldGEoYWdlbnRDdXN0b21pemF0aW9uKHsgdXNlckludm9jYWJsZTogJ3llcycgfSkpLCB7fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRBZ2VudEN1c3RvbWl6YXRpb25NZXRhKGFnZW50Q3VzdG9taXphdGlvbih7IHVzZXJJbnZvY2FibGU6IGZhbHNlIH0pKSwgeyB1c2VySW52b2NhYmxlOiBmYWxzZSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZEFnZW50Q3VzdG9taXphdGlvbk1ldGEoeyAuLi5hZ2VudEN1c3RvbWl6YXRpb24oeyB1c2VySW52b2NhYmxlOiB0cnVlIH0pLCBkaXNhYmxlVXNlckludm9jYXRpb246IHRydWUgfSksIHsgdXNlckludm9jYWJsZTogZmFsc2UgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9BZ2VudEN1c3RvbWl6YXRpb25NZXRhKHt9KSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BZ2VudEN1c3RvbWl6YXRpb25NZXRhKHsgdXNlckludm9jYWJsZTogdHJ1ZSB9KSwgeyB1c2VySW52b2NhYmxlOiB0cnVlIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVhZENvbXBsZXRpb25BdHRhY2htZW50TWV0YScsICgpID0+IHtcblx0XHR0ZXN0KCdjbGFzc2lmaWVzIGEgY29tbWFuZCBiYWcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWFkQ29tcGxldGlvbkF0dGFjaG1lbnRNZXRhKGF0dGFjaG1lbnQoeyBjb21tYW5kOiAncmVuYW1lJywgZGVzY3JpcHRpb246ICdSZW5hbWUgdGhpcyBjaGF0JywgYXJndW1lbnRIaW50OiAnTmV3IG5hbWUnIH0pKSxcblx0XHRcdFx0eyBraW5kOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdyZW5hbWUnLCBkZXNjcmlwdGlvbjogJ1JlbmFtZSB0aGlzIGNoYXQnLCBhcmd1bWVudEhpbnQ6ICdOZXcgbmFtZScgfVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsYXNzaWZpZXMgYSBza2lsbCBiYWcsIGRyb3BwaW5nIHdyb25nLXR5cGVkIG9wdGlvbmFsIGZpZWxkcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlYWRDb21wbGV0aW9uQXR0YWNobWVudE1ldGEoYXR0YWNobWVudCh7IHVyaTogJ2ZpbGU6Ly8vcy9TS0lMTC5tZCcsIG5hbWU6ICdtb24nLCBkaXNwbGF5TmFtZTogJ21vbicsIGRlc2NyaXB0aW9uOiA1IH0pKSxcblx0XHRcdFx0eyBraW5kOiAnc2tpbGwnLCB1cmk6ICdmaWxlOi8vL3MvU0tJTEwubWQnLCBuYW1lOiAnbW9uJywgZGlzcGxheU5hbWU6ICdtb24nIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYW4gdW5yZWNvZ25pemVkIG9yIGVtcHR5IGJhZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkQ29tcGxldGlvbkF0dGFjaG1lbnRNZXRhKGF0dGFjaG1lbnQodW5kZWZpbmVkKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZENvbXBsZXRpb25BdHRhY2htZW50TWV0YShhdHRhY2htZW50KHsgZm9vOiAnYmFyJyB9KSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZENvbXBsZXRpb25BdHRhY2htZW50TWV0YShhdHRhY2htZW50KHsgY29tbWFuZDogNSB9KSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdidWlsZGVycyBwcm9kdWNlIHdpcmUgYmFncyB0aGF0IHJvdW5kLXRyaXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbWQgPSB0b0NvbW1hbmRDb21wbGV0aW9uQXR0YWNobWVudE1ldGEoeyBjb21tYW5kOiAncmVuYW1lJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY21kLCB7IGNvbW1hbmQ6ICdyZW5hbWUnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkQ29tcGxldGlvbkF0dGFjaG1lbnRNZXRhKGF0dGFjaG1lbnQoY21kKSksIHsga2luZDogJ2NvbW1hbmQnLCBjb21tYW5kOiAncmVuYW1lJyB9KTtcblxuXHRcdFx0Y29uc3QgY21kV2l0aEhpbnQgPSB0b0NvbW1hbmRDb21wbGV0aW9uQXR0YWNobWVudE1ldGEoeyBjb21tYW5kOiAncmVuYW1lJywgYXJndW1lbnRIaW50OiAnTmV3IG5hbWUnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbWRXaXRoSGludCwgeyBjb21tYW5kOiAncmVuYW1lJywgYXJndW1lbnRIaW50OiAnTmV3IG5hbWUnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkQ29tcGxldGlvbkF0dGFjaG1lbnRNZXRhKGF0dGFjaG1lbnQoY21kV2l0aEhpbnQpKSwgeyBraW5kOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdyZW5hbWUnLCBhcmd1bWVudEhpbnQ6ICdOZXcgbmFtZScgfSk7XG5cblx0XHRcdGNvbnN0IHNraWxsID0gdG9Ta2lsbENvbXBsZXRpb25BdHRhY2htZW50TWV0YSh7IHVyaTogJ2ZpbGU6Ly8vcy9TS0lMTC5tZCcsIG5hbWU6ICdtb24nLCBkaXNwbGF5TmFtZTogJ21vbicsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNraWxsLCB7IHVyaTogJ2ZpbGU6Ly8vcy9TS0lMTC5tZCcsIG5hbWU6ICdtb24nLCBkaXNwbGF5TmFtZTogJ21vbicgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRDb21wbGV0aW9uQXR0YWNobWVudE1ldGEoYXR0YWNobWVudChza2lsbCkpLCB7IGtpbmQ6ICdza2lsbCcsIHVyaTogJ2ZpbGU6Ly8vcy9TS0lMTC5tZCcsIG5hbWU6ICdtb24nLCBkaXNwbGF5TmFtZTogJ21vbicgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRDb21tYW5kQXJndW1lbnRIaW50IHJlYWRzIHRoZSBoaW50IGFuZCBpZ25vcmVzIHdyb25nLXR5cGVkIC8gYWJzZW50IGJhZ3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q29tbWFuZEFyZ3VtZW50SGludCh7IGFyZ3VtZW50SGludDogJ05ldyBuYW1lJyB9KSwgJ05ldyBuYW1lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q29tbWFuZEFyZ3VtZW50SGludCh7IGFyZ3VtZW50SGludDogNSB9KSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDb21tYW5kQXJndW1lbnRIaW50KHsgY29tbWFuZDogJ3JlbmFtZScgfSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q29tbWFuZEFyZ3VtZW50SGludCh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xhc3NpZmllcyBhIGNvbW1hbmQgYmFnIGNhcnJ5aW5nIGFuIGFjdGlvbiBhbmQgcm91bmQtdHJpcHMgaXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3aXJlID0gdG9Db21tYW5kQ29tcGxldGlvbkF0dGFjaG1lbnRNZXRhKHtcblx0XHRcdFx0Y29tbWFuZDogJ2F1dG9waWxvdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVuIHRoaXMgcmVxdWVzdCBpbiBBdXRvcGlsb3QgbW9kZScsXG5cdFx0XHRcdGFyZ3VtZW50SGludDogJ3Byb21wdCcsXG5cdFx0XHRcdGFjdGlvbjogeyBhcHBseUNvbmZpZzogeyBtb2RlOiAnYXV0b3BpbG90JyB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2lyZSwge1xuXHRcdFx0XHRjb21tYW5kOiAnYXV0b3BpbG90Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW4gdGhpcyByZXF1ZXN0IGluIEF1dG9waWxvdCBtb2RlJyxcblx0XHRcdFx0YXJndW1lbnRIaW50OiAncHJvbXB0Jyxcblx0XHRcdFx0YWN0aW9uOiB7IGFwcGx5Q29uZmlnOiB7IG1vZGU6ICdhdXRvcGlsb3QnIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkQ29tcGxldGlvbkF0dGFjaG1lbnRNZXRhKGF0dGFjaG1lbnQod2lyZSkpLCB7XG5cdFx0XHRcdGtpbmQ6ICdjb21tYW5kJyxcblx0XHRcdFx0Y29tbWFuZDogJ2F1dG9waWxvdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUnVuIHRoaXMgcmVxdWVzdCBpbiBBdXRvcGlsb3QgbW9kZScsXG5cdFx0XHRcdGFyZ3VtZW50SGludDogJ3Byb21wdCcsXG5cdFx0XHRcdGFjdGlvbjogeyBhcHBseUNvbmZpZzogeyBtb2RlOiAnYXV0b3BpbG90JyB9IH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldENvbXBsZXRpb25BY3Rpb24gcmVhZHMgdGhlIGFjdGlvbiwgZHJvcHBpbmcgd3JvbmctdHlwZWQgc3ViLWZpZWxkcyBhbmQgZW1wdHkgYmFncycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q29tcGxldGlvbkFjdGlvbih7IGFjdGlvbjogeyBhcHBseUNvbmZpZzogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJywgYmFkOiA1IH0gfSB9KSwgeyBhcHBseUNvbmZpZzogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyB9IH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENvbXBsZXRpb25BY3Rpb24oeyBhY3Rpb246IHsgYXBwbHlDb25maWc6IHt9IH0gfSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q29tcGxldGlvbkFjdGlvbih7IGNvbW1hbmQ6ICd5b2xvJyB9KSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDb21wbGV0aW9uQWN0aW9uKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhZ2VudCBtb2RlbCBCWU9LIGlkZW50aWZpZXIgbWV0YScsICgpID0+IHtcblx0XHQvKiogV3JhcHMgYSBgX21ldGFgIGJhZyBpbiBhIG1pbmltYWwge0BsaW5rIFNlc3Npb25Nb2RlbEluZm99LiAqL1xuXHRcdGZ1bmN0aW9uIG1vZGVsKG1ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogU2Vzc2lvbk1vZGVsSW5mbyB7XG5cdFx0XHRyZXR1cm4geyBpZDogJ20nLCBwcm92aWRlcjogJ3AnLCBuYW1lOiAnbicsIF9tZXRhOiBtZXRhIH07XG5cdFx0fVxuXG5cdFx0dGVzdCgncm91bmQtdHJpcHMgYSBtb2RlbCBpZGVudGlmaWVyIHRocm91Z2ggX21ldGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZXRhID0gY3JlYXRlQWdlbnRNb2RlbEJ5b2tNZXRhKCdvcGVucm91dGVyL09wZW5Sb3V0ZXIgMi9haW9uLWxhYnMvYWlvbi0zLjAnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWV0YSwgeyBieW9rTW9kZWxJZGVudGlmaWVyOiAnb3BlbnJvdXRlci9PcGVuUm91dGVyIDIvYWlvbi1sYWJzL2Fpb24tMy4wJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkQWdlbnRNb2RlbEJ5b2tJZGVudGlmaWVyKG1vZGVsKG1ldGEpKSwgJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2Fpb24tbGFicy9haW9uLTMuMCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgdGhlIGJhZyBlbnRpcmVseSB3aGVuIHRoZXJlIGlzIG5vIGlkZW50aWZpZXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlQWdlbnRNb2RlbEJ5b2tNZXRhKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEFnZW50TW9kZWxCeW9rSWRlbnRpZmllcihtb2RlbCh1bmRlZmluZWQpKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkQWdlbnRNb2RlbEJ5b2tJZGVudGlmaWVyKG1vZGVsKHt9KSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIGEgd3JvbmctdHlwZWQgaWRlbnRpZmllciB2YWx1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkQWdlbnRNb2RlbEJ5b2tJZGVudGlmaWVyKG1vZGVsKHsgYnlva01vZGVsSWRlbnRpZmllcjogNDIgfSkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYWdlbnQgbW9kZWwgc291cmNlIG1ldGEnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gbW9kZWwobWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBTZXNzaW9uTW9kZWxJbmZvIHtcblx0XHRcdHJldHVybiB7IGlkOiAnbScsIHByb3ZpZGVyOiAncCcsIG5hbWU6ICduJywgX21ldGE6IG1ldGEgfTtcblx0XHR9XG5cblx0XHR0ZXN0KCdyb3VuZC10cmlwcyBhIHNvdXJjZSBpZCB0aHJvdWdoIF9tZXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWV0YSA9IGNyZWF0ZUFnZW50TW9kZWxTb3VyY2VNZXRhKCdjaGF0Z3B0U3Vic2NyaXB0aW9uJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1ldGEsIHsgbW9kZWxTb3VyY2VJZDogJ2NoYXRncHRTdWJzY3JpcHRpb24nIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRBZ2VudE1vZGVsU291cmNlSWQobW9kZWwobWV0YSkpLCAnY2hhdGdwdFN1YnNjcmlwdGlvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgdW5rbm93biBzb3VyY2VzIGFuZCBpZ25vcmVzIGludmFsaWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZUFnZW50TW9kZWxTb3VyY2VNZXRhKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEFnZW50TW9kZWxTb3VyY2VJZChtb2RlbCh1bmRlZmluZWQpKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkQWdlbnRNb2RlbFNvdXJjZUlkKG1vZGVsKHsgbW9kZWxTb3VyY2VJZDogNDIgfSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRBZ2VudE1vZGVsU291cmNlSWQobW9kZWwoeyBtb2RlbFNvdXJjZUlkOiAnJyB9KSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd1c2FnZSBpbmZvIHR1cm4gdG9rZW4gdG90YWxzJywgKCkgPT4ge1xuXHRcdC8qKiBXcmFwcyBhIGBfbWV0YWAgYmFnIGluIGEgbWluaW1hbCB7QGxpbmsgVXNhZ2VJbmZvfS4gKi9cblx0XHRmdW5jdGlvbiB1c2FnZShtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IFVzYWdlSW5mbyB7XG5cdFx0XHRyZXR1cm4geyBfbWV0YTogbWV0YSB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JlYWRzIHdlbGwtZm9ybWVkIHBlci1tb2RlbCB0b3RhbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b3RhbHMgPSBbXG5cdFx0XHRcdHsgbW9kZWw6ICdncHQtNScsIGlucHV0VG9rZW5zOiAxMjAwLCBjYWNoZWRUb2tlbnM6IDgwMCwgb3V0cHV0VG9rZW5zOiAzNDAgfSxcblx0XHRcdFx0eyBtb2RlbDogJ2NsYXVkZS1zb25uZXQtNC42JywgaW5wdXRUb2tlbnM6IDQwLCBjYWNoZWRUb2tlbnM6IDAsIG91dHB1dFRva2VuczogMTIgfSxcblx0XHRcdF07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRVc2FnZUluZm9NZXRhKHVzYWdlKHsgdHVyblRva2VuVG90YWxzOiB0b3RhbHMgfSkpLnR1cm5Ub2tlblRvdGFscywgdG90YWxzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BzIHJvd3MgdGhhdCBhcmUgbm90IGZ1bGx5IGZvcm1lZCwgYW5kIHJlcG9ydHMgbm90aGluZyB3aGVuIG5vbmUgc3Vydml2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1ldGEgPSByZWFkVXNhZ2VJbmZvTWV0YSh1c2FnZSh7XG5cdFx0XHRcdHR1cm5Ub2tlblRvdGFsczogW1xuXHRcdFx0XHRcdG51bGwsXG5cdFx0XHRcdFx0J25vcGUnLFxuXHRcdFx0XHRcdHsgaW5wdXRUb2tlbnM6IDEsIGNhY2hlZFRva2VuczogMCwgb3V0cHV0VG9rZW5zOiAxIH0sXG5cdFx0XHRcdFx0eyBtb2RlbDogJycsIGlucHV0VG9rZW5zOiAxLCBjYWNoZWRUb2tlbnM6IDAsIG91dHB1dFRva2VuczogMSB9LFxuXHRcdFx0XHRcdHsgbW9kZWw6ICdncHQtNScsIGlucHV0VG9rZW5zOiAnYmFkJywgY2FjaGVkVG9rZW5zOiAwLCBvdXRwdXRUb2tlbnM6IDEgfSxcblx0XHRcdFx0XHR7IG1vZGVsOiAnZ3B0LTUnLCBpbnB1dFRva2VuczogLTEsIGNhY2hlZFRva2VuczogMCwgb3V0cHV0VG9rZW5zOiAxIH0sXG5cdFx0XHRcdFx0eyBtb2RlbDogJ2dwdC01JywgaW5wdXRUb2tlbnM6IDEuNSwgY2FjaGVkVG9rZW5zOiAwLCBvdXRwdXRUb2tlbnM6IDEgfSxcblx0XHRcdFx0XHR7IG1vZGVsOiAnZ3B0LTUnLCBjYWNoZWRUb2tlbnM6IDAsIG91dHB1dFRva2VuczogMSB9LFxuXHRcdFx0XHRcdHsgbW9kZWw6ICdncHQtNScsIGlucHV0VG9rZW5zOiA3LCBjYWNoZWRUb2tlbnM6IDAsIG91dHB1dFRva2VuczogMyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXRhLnR1cm5Ub2tlblRvdGFscywgW3sgbW9kZWw6ICdncHQtNScsIGlucHV0VG9rZW5zOiA3LCBjYWNoZWRUb2tlbnM6IDAsIG91dHB1dFRva2VuczogMyB9XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZFVzYWdlSW5mb01ldGEodXNhZ2UoeyB0dXJuVG9rZW5Ub3RhbHM6IFt7IG1vZGVsOiAnZ3B0LTUnIH1dIH0pKS50dXJuVG9rZW5Ub3RhbHMsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZFVzYWdlSW5mb01ldGEodXNhZ2UoeyB0dXJuVG9rZW5Ub3RhbHM6ICdub3BlJyB9KSkudHVyblRva2VuVG90YWxzLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRVc2FnZUluZm9NZXRhKHVzYWdlKHt9KSkudHVyblRva2VuVG90YWxzLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG90YWxzIGFsb25lIGRvIG5vdCBtYWtlIGEgdXNhZ2UgcmVwb3J0IGNvdW50IGFzIHJlcG9ydGVkIGNvbnN1bXB0aW9uJywgKCkgPT4ge1xuXHRcdFx0Ly8gVG90YWxzIGFsd2F5cyBhY2NvbXBhbnkgcGVyLWNhbGwgdG9rZW5zIG9yIGNyZWRpdHMsIGFuZCB0cmVhdGluZyB0aGVtIGFzXG5cdFx0XHQvLyBjb25zdW1wdGlvbiBvbiB0aGVpciBvd24gd291bGQgbWFrZSB0aGUgcmVzdG9yZSBwYXRoIHNraXAgbWVyZ2luZyB0aGVcblx0XHRcdC8vIHJpY2hlciBwZXJzaXN0ZWQgdXNhZ2Ugb3ZlciBhIHRva2VuLWxlc3Mgc3R1Yi5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNSZXBvcnRlZFVzYWdlKHVzYWdlKHsgdHVyblRva2VuVG90YWxzOiBbeyBtb2RlbDogJ2dwdC01JywgaW5wdXRUb2tlbnM6IDcsIGNhY2hlZFRva2VuczogMCwgb3V0cHV0VG9rZW5zOiAzIH1dIH0pKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCLHNCQUFzQjtBQUNqRCxTQUFTLDRCQUE0QixnQ0FBZ0M7QUFDckUsU0FBUyx3QkFBd0IscUJBQXFCLDhCQUE4QixtQ0FBbUMsdUNBQXVDO0FBQzlKLFNBQVMsbUJBQW1CLHVCQUF1QixnQkFBZ0Isa0JBQWtCLHlCQUFzRjtBQUUzSyxTQUFTLDBCQUEwQixvQ0FBb0M7QUFDdkUsU0FBUyw0QkFBNEIsOEJBQThCO0FBR25FLFNBQVMsU0FBUyxNQUEwRDtBQUMzRSxTQUFPLEVBQUUsUUFBUSxlQUFlLFdBQVcsWUFBWSxLQUFLLFVBQVUsS0FBSyxhQUFhLEtBQUssT0FB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
