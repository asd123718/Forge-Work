import assert from "assert";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { buildCustomAgentHandoffsInfo, getHandoffId } from "../../common/chatModes.js";
import { ChatModeKind } from "../../common/constants.js";
import { Target } from "../../common/promptSyntax/promptTypes.js";
function createMockMode(overrides) {
  return {
    name: constObservable(overrides.id),
    label: constObservable(overrides.id),
    icon: constObservable(void 0),
    description: constObservable(void 0),
    isBuiltin: overrides.isBuiltin ?? false,
    target: constObservable(Target.Undefined),
    ...overrides
  };
}
suite("getHandoffId", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should generate a stable id from agent and label", () => {
    const handoff = { agent: "agent", label: "Start Implementation", prompt: "go" };
    assert.strictEqual(getHandoffId(handoff), "agent:start-implementation");
  });
  test("should handle special characters in label", () => {
    const handoff = { agent: "edit", label: "Open in Editor!", prompt: "" };
    assert.strictEqual(getHandoffId(handoff), "edit:open-in-editor");
  });
  test("should handle single-word label", () => {
    const handoff = { agent: "agent", label: "Continue", prompt: "" };
    assert.strictEqual(getHandoffId(handoff), "agent:continue");
  });
});
suite("buildCustomAgentHandoffsInfo", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should return empty handoffs for modes without handOffs", () => {
    const mode = createMockMode({
      id: "ask",
      kind: ChatModeKind.Ask,
      isBuiltin: true
    });
    const result = buildCustomAgentHandoffsInfo([mode]);
    assert.deepStrictEqual(result, [{
      id: "ask",
      name: "ask",
      isBuiltin: true,
      visibility: { userInvocable: true, agentInvocable: true },
      handoffs: []
    }]);
  });
  test("should map handoffs with all fields", () => {
    const handoffs = [
      { agent: "agent", label: "Start Implementation", prompt: "Start implementation", send: true, model: "gpt-4o" },
      { agent: "agent", label: "Open in Editor", prompt: "Open the plan", showContinueOn: false }
    ];
    const mode = createMockMode({
      id: "plan-mode",
      kind: ChatModeKind.Agent,
      handOffs: observableValue("handOffs", handoffs),
      visibility: observableValue("visibility", { userInvocable: true, agentInvocable: false })
    });
    const result = buildCustomAgentHandoffsInfo([mode]);
    assert.deepStrictEqual(result, [{
      id: "plan-mode",
      name: "plan-mode",
      isBuiltin: false,
      visibility: { userInvocable: true, agentInvocable: false },
      handoffs: [
        { id: "agent:start-implementation", label: "Start Implementation", agent: "agent", prompt: "Start implementation", send: true, model: "gpt-4o" },
        { id: "agent:open-in-editor", label: "Open in Editor", agent: "agent", prompt: "Open the plan", showContinueOn: false }
      ]
    }]);
  });
  test("should handle multiple modes", () => {
    const askMode = createMockMode({ id: "ask", kind: ChatModeKind.Ask, isBuiltin: true });
    const agentMode = createMockMode({ id: "agent", kind: ChatModeKind.Agent, isBuiltin: true });
    const result = buildCustomAgentHandoffsInfo([askMode, agentMode]);
    assert.deepStrictEqual(result, [
      {
        id: "ask",
        name: "ask",
        isBuiltin: true,
        visibility: { userInvocable: true, agentInvocable: true },
        handoffs: []
      },
      {
        id: "agent",
        name: "agent",
        isBuiltin: true,
        visibility: { userInvocable: true, agentInvocable: true },
        handoffs: []
      }
    ]);
  });
  test("should omit optional handoff fields when undefined", () => {
    const handoffs = [
      { agent: "agent", label: "Go", prompt: "do it" }
    ];
    const mode = createMockMode({
      id: "test",
      kind: ChatModeKind.Agent,
      handOffs: observableValue("handOffs", handoffs)
    });
    const result = buildCustomAgentHandoffsInfo([mode]);
    const info = result[0].handoffs[0];
    assert.strictEqual(info.id, "agent:go");
    assert.strictEqual(info.send, void 0);
    assert.strictEqual(info.showContinueOn, void 0);
    assert.strictEqual(info.model, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY2hhdEhhbmRvZmZzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBidWlsZEN1c3RvbUFnZW50SGFuZG9mZnNJbmZvLCBnZXRIYW5kb2ZmSWQsIElDaGF0TW9kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJSGFuZE9mZiB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBUYXJnZXQgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlTW9ja01vZGUob3ZlcnJpZGVzOiBQYXJ0aWFsPElDaGF0TW9kZT4gJiB7IGlkOiBzdHJpbmc7IGtpbmQ6IENoYXRNb2RlS2luZCB9KTogSUNoYXRNb2RlIHtcblx0cmV0dXJuIHtcblx0XHRuYW1lOiBjb25zdE9ic2VydmFibGUob3ZlcnJpZGVzLmlkKSxcblx0XHRsYWJlbDogY29uc3RPYnNlcnZhYmxlKG92ZXJyaWRlcy5pZCksXG5cdFx0aWNvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0ZGVzY3JpcHRpb246IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGlzQnVpbHRpbjogb3ZlcnJpZGVzLmlzQnVpbHRpbiA/PyBmYWxzZSxcblx0XHR0YXJnZXQ6IGNvbnN0T2JzZXJ2YWJsZShUYXJnZXQuVW5kZWZpbmVkKSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH0gYXMgSUNoYXRNb2RlO1xufVxuXG5zdWl0ZSgnZ2V0SGFuZG9mZklkJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzaG91bGQgZ2VuZXJhdGUgYSBzdGFibGUgaWQgZnJvbSBhZ2VudCBhbmQgbGFiZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZG9mZjogSUhhbmRPZmYgPSB7IGFnZW50OiAnYWdlbnQnLCBsYWJlbDogJ1N0YXJ0IEltcGxlbWVudGF0aW9uJywgcHJvbXB0OiAnZ28nIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEhhbmRvZmZJZChoYW5kb2ZmKSwgJ2FnZW50OnN0YXJ0LWltcGxlbWVudGF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc3BlY2lhbCBjaGFyYWN0ZXJzIGluIGxhYmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRvZmY6IElIYW5kT2ZmID0geyBhZ2VudDogJ2VkaXQnLCBsYWJlbDogJ09wZW4gaW4gRWRpdG9yIScsIHByb21wdDogJycgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0SGFuZG9mZklkKGhhbmRvZmYpLCAnZWRpdDpvcGVuLWluLWVkaXRvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNpbmdsZS13b3JkIGxhYmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRvZmY6IElIYW5kT2ZmID0geyBhZ2VudDogJ2FnZW50JywgbGFiZWw6ICdDb250aW51ZScsIHByb21wdDogJycgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0SGFuZG9mZklkKGhhbmRvZmYpLCAnYWdlbnQ6Y29udGludWUnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2J1aWxkQ3VzdG9tQWdlbnRIYW5kb2Zmc0luZm8nLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gZW1wdHkgaGFuZG9mZnMgZm9yIG1vZGVzIHdpdGhvdXQgaGFuZE9mZnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZSA9IGNyZWF0ZU1vY2tNb2RlKHtcblx0XHRcdGlkOiAnYXNrJyxcblx0XHRcdGtpbmQ6IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRpc0J1aWx0aW46IHRydWUsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBidWlsZEN1c3RvbUFnZW50SGFuZG9mZnNJbmZvKFttb2RlXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRpZDogJ2FzaycsXG5cdFx0XHRuYW1lOiAnYXNrJyxcblx0XHRcdGlzQnVpbHRpbjogdHJ1ZSxcblx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdGhhbmRvZmZzOiBbXSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBtYXAgaGFuZG9mZnMgd2l0aCBhbGwgZmllbGRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRvZmZzOiBJSGFuZE9mZltdID0gW1xuXHRcdFx0eyBhZ2VudDogJ2FnZW50JywgbGFiZWw6ICdTdGFydCBJbXBsZW1lbnRhdGlvbicsIHByb21wdDogJ1N0YXJ0IGltcGxlbWVudGF0aW9uJywgc2VuZDogdHJ1ZSwgbW9kZWw6ICdncHQtNG8nIH0sXG5cdFx0XHR7IGFnZW50OiAnYWdlbnQnLCBsYWJlbDogJ09wZW4gaW4gRWRpdG9yJywgcHJvbXB0OiAnT3BlbiB0aGUgcGxhbicsIHNob3dDb250aW51ZU9uOiBmYWxzZSB9LFxuXHRcdF07XG5cdFx0Y29uc3QgbW9kZSA9IGNyZWF0ZU1vY2tNb2RlKHtcblx0XHRcdGlkOiAncGxhbi1tb2RlJyxcblx0XHRcdGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdGhhbmRPZmZzOiBvYnNlcnZhYmxlVmFsdWUoJ2hhbmRPZmZzJywgaGFuZG9mZnMpLFxuXHRcdFx0dmlzaWJpbGl0eTogb2JzZXJ2YWJsZVZhbHVlKCd2aXNpYmlsaXR5JywgeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogZmFsc2UgfSksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBidWlsZEN1c3RvbUFnZW50SGFuZG9mZnNJbmZvKFttb2RlXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRpZDogJ3BsYW4tbW9kZScsXG5cdFx0XHRuYW1lOiAncGxhbi1tb2RlJyxcblx0XHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiBmYWxzZSB9LFxuXHRcdFx0aGFuZG9mZnM6IFtcblx0XHRcdFx0eyBpZDogJ2FnZW50OnN0YXJ0LWltcGxlbWVudGF0aW9uJywgbGFiZWw6ICdTdGFydCBJbXBsZW1lbnRhdGlvbicsIGFnZW50OiAnYWdlbnQnLCBwcm9tcHQ6ICdTdGFydCBpbXBsZW1lbnRhdGlvbicsIHNlbmQ6IHRydWUsIG1vZGVsOiAnZ3B0LTRvJyB9LFxuXHRcdFx0XHR7IGlkOiAnYWdlbnQ6b3Blbi1pbi1lZGl0b3InLCBsYWJlbDogJ09wZW4gaW4gRWRpdG9yJywgYWdlbnQ6ICdhZ2VudCcsIHByb21wdDogJ09wZW4gdGhlIHBsYW4nLCBzaG93Q29udGludWVPbjogZmFsc2UgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIG1vZGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFza01vZGUgPSBjcmVhdGVNb2NrTW9kZSh7IGlkOiAnYXNrJywga2luZDogQ2hhdE1vZGVLaW5kLkFzaywgaXNCdWlsdGluOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGFnZW50TW9kZSA9IGNyZWF0ZU1vY2tNb2RlKHsgaWQ6ICdhZ2VudCcsIGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCwgaXNCdWlsdGluOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRDdXN0b21BZ2VudEhhbmRvZmZzSW5mbyhbYXNrTW9kZSwgYWdlbnRNb2RlXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdhc2snLFxuXHRcdFx0XHRuYW1lOiAnYXNrJyxcblx0XHRcdFx0aXNCdWlsdGluOiB0cnVlLFxuXHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdGhhbmRvZmZzOiBbXSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnYWdlbnQnLFxuXHRcdFx0XHRuYW1lOiAnYWdlbnQnLFxuXHRcdFx0XHRpc0J1aWx0aW46IHRydWUsXG5cdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0aGFuZG9mZnM6IFtdLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG9taXQgb3B0aW9uYWwgaGFuZG9mZiBmaWVsZHMgd2hlbiB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZG9mZnM6IElIYW5kT2ZmW10gPSBbXG5cdFx0XHR7IGFnZW50OiAnYWdlbnQnLCBsYWJlbDogJ0dvJywgcHJvbXB0OiAnZG8gaXQnIH0sXG5cdFx0XTtcblx0XHRjb25zdCBtb2RlID0gY3JlYXRlTW9ja01vZGUoe1xuXHRcdFx0aWQ6ICd0ZXN0Jyxcblx0XHRcdGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCxcblx0XHRcdGhhbmRPZmZzOiBvYnNlcnZhYmxlVmFsdWUoJ2hhbmRPZmZzJywgaGFuZG9mZnMpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRDdXN0b21BZ2VudEhhbmRvZmZzSW5mbyhbbW9kZV0pO1xuXHRcdGNvbnN0IGluZm8gPSByZXN1bHRbMF0uaGFuZG9mZnNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm8uaWQsICdhZ2VudDpnbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvLnNlbmQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm8uc2hvd0NvbnRpbnVlT24sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm8ubW9kZWwsIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQ2pELFNBQVMsK0NBQStDO0FBQ3hELFNB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
