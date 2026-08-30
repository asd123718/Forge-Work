import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CustomizationEnablementKind, CustomizationLoadStatus, CustomizationType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { getEffectiveAgents, getEffectiveClientAgents } from "../../../../../../platform/agentHost/common/customAgents.js";
function sc(uri, children, enabled = true) {
  return {
    type: CustomizationType.Plugin,
    id: uri,
    uri,
    name: uri,
    ...enabled ? {} : {
      // TODO: Step 2 selects the persisted enablement scope.
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
    },
    load: { kind: CustomizationLoadStatus.Loaded },
    ...children ? { children } : {}
  };
}
function agent(uri, name, description) {
  return {
    type: CustomizationType.Agent,
    id: uri,
    uri,
    name,
    ...description ? { description } : {}
  };
}
function clientPlugin(uri, enabled = true) {
  return {
    type: CustomizationType.Plugin,
    id: uri,
    uri,
    name: uri,
    ...enabled ? {} : {
      enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
    }
  };
}
suite("getEffectiveAgents", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns an empty list when no customizations contribute agents", () => {
    assert.deepStrictEqual(getEffectiveAgents(void 0), []);
    assert.deepStrictEqual(getEffectiveAgents([sc("plugin://a"), sc("plugin://b", [])]), []);
  });
  test("treats undefined `children` as unknown and empty array as no agents", () => {
    const result = getEffectiveAgents([
      sc("plugin://a", [agent("agent://review", "review")]),
      sc("plugin://b", [])
    ]);
    assert.deepStrictEqual(result, [agent("agent://review", "review")]);
  });
  test("skips disabled session customizations", () => {
    const result = getEffectiveAgents([
      sc("plugin://a", [agent("agent://a", "a")], false),
      sc("plugin://b", [agent("agent://b", "b")])
    ]);
    assert.deepStrictEqual(result, [agent("agent://b", "b")]);
  });
  test("de-dupes by uri (first-seen wins)", () => {
    const result = getEffectiveAgents([
      sc("plugin://a", [
        agent("agent://shared", "shared", "from a"),
        agent("agent://only-a", "only-a")
      ]),
      sc("plugin://b", [
        agent("agent://shared", "shared", "from b"),
        agent("agent://only-b", "only-b")
      ])
    ]);
    assert.deepStrictEqual(result, [
      agent("agent://only-a", "only-a"),
      agent("agent://only-b", "only-b"),
      agent("agent://shared", "shared", "from a")
    ]);
  });
  test("sorts by name, breaking ties by uri", () => {
    const result = getEffectiveAgents([
      sc("plugin://a", [
        agent("agent://z", "beta"),
        agent("agent://x", "beta"),
        agent("agent://y", "alpha")
      ])
    ]);
    assert.deepStrictEqual(result.map((a) => a.uri), ["agent://y", "agent://x", "agent://z"]);
  });
  test("filters draft agents by plugin enablement without dropping unmatched agents", () => {
    const disabledPlugin = clientPlugin("file:///plugins/disabled", false);
    const enabledPlugin = clientPlugin("file:///plugins/enabled");
    const draftAgents = [
      agent("file:///plugins/disabled/agents/shared.agent.md", "disabled"),
      agent("file:///plugins/enabled/agents/enabled.agent.md", "enabled"),
      agent("file:///workspace/.github/agents/loose.agent.md", "loose")
    ];
    assert.deepStrictEqual({
      disabled: getEffectiveClientAgents([disabledPlugin, enabledPlugin], draftAgents).map((agent2) => agent2.name),
      reenabled: getEffectiveClientAgents([enabledPlugin], draftAgents).map((agent2) => agent2.name)
    }, {
      disabled: ["enabled", "loose"],
      reenabled: ["disabled", "enabled", "loose"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdEFnZW50cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQsIEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBDdXN0b21pemF0aW9uVHlwZSwgdHlwZSBBZ2VudEN1c3RvbWl6YXRpb24sIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBnZXRFZmZlY3RpdmVBZ2VudHMsIGdldEVmZmVjdGl2ZUNsaWVudEFnZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY3VzdG9tQWdlbnRzLmpzJztcblxuZnVuY3Rpb24gc2ModXJpOiBzdHJpbmcsIGNoaWxkcmVuPzogQWdlbnRDdXN0b21pemF0aW9uW10sIGVuYWJsZWQgPSB0cnVlKTogQ3VzdG9taXphdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdGlkOiB1cmksXG5cdFx0dXJpLFxuXHRcdG5hbWU6IHVyaSxcblx0XHQuLi4oZW5hYmxlZCA/IHt9IDoge1xuXHRcdFx0Ly8gVE9ETzogU3RlcCAyIHNlbGVjdHMgdGhlIHBlcnNpc3RlZCBlbmFibGVtZW50IHNjb3BlLlxuXHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0fSksXG5cdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHQuLi4oY2hpbGRyZW4gPyB7IGNoaWxkcmVuIH0gOiB7fSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGFnZW50KHVyaTogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogQWdlbnRDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCxcblx0XHRpZDogdXJpLFxuXHRcdHVyaSxcblx0XHRuYW1lLFxuXHRcdC4uLihkZXNjcmlwdGlvbiA/IHsgZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY2xpZW50UGx1Z2luKHVyaTogc3RyaW5nLCBlbmFibGVkID0gdHJ1ZSk6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24ge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRpZDogdXJpLFxuXHRcdHVyaSxcblx0XHRuYW1lOiB1cmksXG5cdFx0Li4uKGVuYWJsZWQgPyB7fSA6IHtcblx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdH0pLFxuXHR9O1xufVxuXG5zdWl0ZSgnZ2V0RWZmZWN0aXZlQWdlbnRzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXR1cm5zIGFuIGVtcHR5IGxpc3Qgd2hlbiBubyBjdXN0b21pemF0aW9ucyBjb250cmlidXRlIGFnZW50cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVmZmVjdGl2ZUFnZW50cyh1bmRlZmluZWQpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFZmZlY3RpdmVBZ2VudHMoW3NjKCdwbHVnaW46Ly9hJyksIHNjKCdwbHVnaW46Ly9iJywgW10pXSksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndHJlYXRzIHVuZGVmaW5lZCBgY2hpbGRyZW5gIGFzIHVua25vd24gYW5kIGVtcHR5IGFycmF5IGFzIG5vIGFnZW50cycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRFZmZlY3RpdmVBZ2VudHMoW1xuXHRcdFx0c2MoJ3BsdWdpbjovL2EnLCBbYWdlbnQoJ2FnZW50Oi8vcmV2aWV3JywgJ3JldmlldycpXSksXG5cdFx0XHRzYygncGx1Z2luOi8vYicsIFtdKSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW2FnZW50KCdhZ2VudDovL3JldmlldycsICdyZXZpZXcnKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBkaXNhYmxlZCBzZXNzaW9uIGN1c3RvbWl6YXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEVmZmVjdGl2ZUFnZW50cyhbXG5cdFx0XHRzYygncGx1Z2luOi8vYScsIFthZ2VudCgnYWdlbnQ6Ly9hJywgJ2EnKV0sIGZhbHNlKSxcblx0XHRcdHNjKCdwbHVnaW46Ly9iJywgW2FnZW50KCdhZ2VudDovL2InLCAnYicpXSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFthZ2VudCgnYWdlbnQ6Ly9iJywgJ2InKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZS1kdXBlcyBieSB1cmkgKGZpcnN0LXNlZW4gd2lucyknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0RWZmZWN0aXZlQWdlbnRzKFtcblx0XHRcdHNjKCdwbHVnaW46Ly9hJywgW1xuXHRcdFx0XHRhZ2VudCgnYWdlbnQ6Ly9zaGFyZWQnLCAnc2hhcmVkJywgJ2Zyb20gYScpLFxuXHRcdFx0XHRhZ2VudCgnYWdlbnQ6Ly9vbmx5LWEnLCAnb25seS1hJyksXG5cdFx0XHRdKSxcblx0XHRcdHNjKCdwbHVnaW46Ly9iJywgW1xuXHRcdFx0XHRhZ2VudCgnYWdlbnQ6Ly9zaGFyZWQnLCAnc2hhcmVkJywgJ2Zyb20gYicpLFxuXHRcdFx0XHRhZ2VudCgnYWdlbnQ6Ly9vbmx5LWInLCAnb25seS1iJyksXG5cdFx0XHRdKSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW1xuXHRcdFx0YWdlbnQoJ2FnZW50Oi8vb25seS1hJywgJ29ubHktYScpLFxuXHRcdFx0YWdlbnQoJ2FnZW50Oi8vb25seS1iJywgJ29ubHktYicpLFxuXHRcdFx0YWdlbnQoJ2FnZW50Oi8vc2hhcmVkJywgJ3NoYXJlZCcsICdmcm9tIGEnKSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc29ydHMgYnkgbmFtZSwgYnJlYWtpbmcgdGllcyBieSB1cmknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0RWZmZWN0aXZlQWdlbnRzKFtcblx0XHRcdHNjKCdwbHVnaW46Ly9hJywgW1xuXHRcdFx0XHRhZ2VudCgnYWdlbnQ6Ly96JywgJ2JldGEnKSxcblx0XHRcdFx0YWdlbnQoJ2FnZW50Oi8veCcsICdiZXRhJyksXG5cdFx0XHRcdGFnZW50KCdhZ2VudDovL3knLCAnYWxwaGEnKSxcblx0XHRcdF0pLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChhID0+IGEudXJpKSwgWydhZ2VudDovL3knLCAnYWdlbnQ6Ly94JywgJ2FnZW50Oi8veiddKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsdGVycyBkcmFmdCBhZ2VudHMgYnkgcGx1Z2luIGVuYWJsZW1lbnQgd2l0aG91dCBkcm9wcGluZyB1bm1hdGNoZWQgYWdlbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc2FibGVkUGx1Z2luID0gY2xpZW50UGx1Z2luKCdmaWxlOi8vL3BsdWdpbnMvZGlzYWJsZWQnLCBmYWxzZSk7XG5cdFx0Y29uc3QgZW5hYmxlZFBsdWdpbiA9IGNsaWVudFBsdWdpbignZmlsZTovLy9wbHVnaW5zL2VuYWJsZWQnKTtcblx0XHRjb25zdCBkcmFmdEFnZW50cyA9IFtcblx0XHRcdGFnZW50KCdmaWxlOi8vL3BsdWdpbnMvZGlzYWJsZWQvYWdlbnRzL3NoYXJlZC5hZ2VudC5tZCcsICdkaXNhYmxlZCcpLFxuXHRcdFx0YWdlbnQoJ2ZpbGU6Ly8vcGx1Z2lucy9lbmFibGVkL2FnZW50cy9lbmFibGVkLmFnZW50Lm1kJywgJ2VuYWJsZWQnKSxcblx0XHRcdGFnZW50KCdmaWxlOi8vL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9sb29zZS5hZ2VudC5tZCcsICdsb29zZScpLFxuXHRcdF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc2FibGVkOiBnZXRFZmZlY3RpdmVDbGllbnRBZ2VudHMoW2Rpc2FibGVkUGx1Z2luLCBlbmFibGVkUGx1Z2luXSwgZHJhZnRBZ2VudHMpLm1hcChhZ2VudCA9PiBhZ2VudC5uYW1lKSxcblx0XHRcdHJlZW5hYmxlZDogZ2V0RWZmZWN0aXZlQ2xpZW50QWdlbnRzKFtlbmFibGVkUGx1Z2luXSwgZHJhZnRBZ2VudHMpLm1hcChhZ2VudCA9PiBhZ2VudC5uYW1lKSxcblx0XHR9LCB7XG5cdFx0XHRkaXNhYmxlZDogWydlbmFibGVkJywgJ2xvb3NlJ10sXG5cdFx0XHRyZWVuYWJsZWQ6IFsnZGlzYWJsZWQnLCAnZW5hYmxlZCcsICdsb29zZSddLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCLHlCQUF5Qix5QkFBc0c7QUFDckssU0FBUyxvQkFBb0IsZ0NBQWdDO0FBRTdELFNBQVMsR0FBRyxLQUFhLFVBQWlDLFVBQVUsTUFBcUI7QUFDeEYsU0FBTztBQUFBLElBQ04sTUFBTSxrQkFBa0I7QUFBQSxJQUN4QixJQUFJO0FBQUEsSUFDSjtBQUFBLElBQ0EsTUFBTTtBQUFBLElBQ04sR0FBSSxVQUFVLENBQUMsSUFBSTtBQUFBO0FBQUEsTUFFbEIsWUFBWSxDQUFDLEVBQUUsTUFBTSw0QkFBNEIsUUFBUSxTQUFTLE1BQU0sQ0FBQztBQUFBLElBQzFFO0FBQUEsSUFDQSxNQUFNLEVBQUUsTUFBTSx3QkFBd0IsT0FBTztBQUFBLElBQzdDLEdBQUksV0FBVyxFQUFFLFNBQVMsSUFBSSxDQUFDO0FBQUEsRUFDaEM7QUFDRDtBQUVBLFNBQVMsTUFBTSxLQUFhLE1BQWMsYUFBMEM7QUFDbkYsU0FBTztBQUFBLElBQ04sTUFBTSxrQkFBa0I7QUFBQSxJQUN4QixJQUFJO0FBQUEsSUFDSjtBQUFBLElBQ0E7QUFBQSxJQUNBLEdBQUksY0FBYyxFQUFFLFlBQVksSUFBSSxDQUFDO0FBQUEsRUFDdEM7QUFDRDtBQUVBLFNBQVMsYUFBYSxLQUFhLFVBQVUsTUFBaUM7QUFDN0UsU0FBTztBQUFBLElBQ04sTUFBTSxrQkFBa0I7QUFBQSxJQUN4QixJQUFJO0FBQUEsSUFDSjtBQUFBLElBQ0EsTUFBTTtBQUFBLElBQ04sR0FBSSxVQUFVLENBQUMsSUFBSTtBQUFBLE1BQ2xCLFlBQVksQ0FBQyxFQUFFLE1BQU0sNEJBQTRCLFFBQVEsU0FBUyxNQUFNLENBQUM7QUFBQSxJQUMxRTtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sc0JBQXNCLE1BQU07QUFDakMsMENBQXdDO0FBRXhDLE9BQUssa0VBQWtFLE1BQU07QUFDNUUsV0FBTyxnQkFBZ0IsbUJBQW1CLE1BQVMsR0FBRyxDQUFDLENBQUM7QUFDeEQsV0FBTyxnQkFBZ0IsbUJBQW1CLENBQUMsR0FBRyxZQUFZLEdBQUcsR0FBRyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUN4RixDQUFDO0FBRUQsT0FBSyx1RUFBdUUsTUFBTTtBQUNqRixVQUFNLFNBQVMsbUJBQW1CO0FBQUEsTUFDakMsR0FBRyxjQUFjLENBQUMsTUFBTSxrQkFBa0IsUUFBUSxDQUFDLENBQUM7QUFBQSxNQUNwRCxHQUFHLGNBQWMsQ0FBQyxDQUFDO0FBQUEsSUFDcEIsQ0FBQztBQUNELFdBQU8sZ0JBQWdCLFFBQVEsQ0FBQyxNQUFNLGtCQUFrQixRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ25FLENBQUM7QUFFRCxPQUFLLHlDQUF5QyxNQUFNO0FBQ25ELFVBQU0sU0FBUyxtQkFBbUI7QUFBQSxNQUNqQyxHQUFHLGNBQWMsQ0FBQyxNQUFNLGFBQWEsR0FBRyxDQUFDLEdBQUcsS0FBSztBQUFBLE1BQ2pELEdBQUcsY0FBYyxDQUFDLE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzNDLENBQUM7QUFDRCxXQUFPLGdCQUFnQixRQUFRLENBQUMsTUFBTSxhQUFhLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDekQsQ0FBQztBQUVELE9BQUsscUNBQXFDLE1BQU07QUFDL0MsVUFBTSxTQUFTLG1CQUFtQjtBQUFBLE1BQ2pDLEdBQUcsY0FBYztBQUFBLFFBQ2hCLE1BQU0sa0JBQWtCLFVBQVUsUUFBUTtBQUFBLFFBQzFDLE1BQU0sa0JBQWtCLFFBQVE7QUFBQSxNQUNqQyxDQUFDO0FBQUEsTUFDRCxHQUFHLGNBQWM7QUFBQSxRQUNoQixNQUFNLGtCQUFrQixVQUFVLFFBQVE7QUFBQSxRQUMxQyxNQUFNLGtCQUFrQixRQUFRO0FBQUEsTUFDakMsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixNQUFNLGtCQUFrQixRQUFRO0FBQUEsTUFDaEMsTUFBTSxrQkFBa0IsUUFBUTtBQUFBLE1BQ2hDLE1BQU0sa0JBQWtCLFVBQVUsUUFBUTtBQUFBLElBQzNDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVDQUF1QyxNQUFNO0FBQ2pELFVBQU0sU0FBUyxtQkFBbUI7QUFBQSxNQUNqQyxHQUFHLGNBQWM7QUFBQSxRQUNoQixNQUFNLGFBQWEsTUFBTTtBQUFBLFFBQ3pCLE1BQU0sYUFBYSxNQUFNO0FBQUEsUUFDekIsTUFBTSxhQUFhLE9BQU87QUFBQSxNQUMzQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsT0FBTyxJQUFJLE9BQUssRUFBRSxHQUFHLEdBQUcsQ0FBQyxhQUFhLGFBQWEsV0FBVyxDQUFDO0FBQUEsRUFDdkYsQ0FBQztBQUVELE9BQUssK0VBQStFLE1BQU07QUFDekYsVUFBTSxpQkFBaUIsYUFBYSw0QkFBNEIsS0FBSztBQUNyRSxVQUFNLGdCQUFnQixhQUFhLHlCQUF5QjtBQUM1RCxVQUFNLGNBQWM7QUFBQSxNQUNuQixNQUFNLG1EQUFtRCxVQUFVO0FBQUEsTUFDbkUsTUFBTSxtREFBbUQsU0FBUztBQUFBLE1BQ2xFLE1BQU0sbURBQW1ELE9BQU87QUFBQSxJQUNqRTtBQUVBLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsVUFBVSx5QkFBeUIsQ0FBQyxnQkFBZ0IsYUFBYSxHQUFHLFdBQVcsRUFBRSxJQUFJLENBQUFBLFdBQVNBLE9BQU0sSUFBSTtBQUFBLE1BQ3hHLFdBQVcseUJBQXlCLENBQUMsYUFBYSxHQUFHLFdBQVcsRUFBRSxJQUFJLENBQUFBLFdBQVNBLE9BQU0sSUFBSTtBQUFBLElBQzFGLEdBQUc7QUFBQSxNQUNGLFVBQVUsQ0FBQyxXQUFXLE9BQU87QUFBQSxNQUM3QixXQUFXLENBQUMsWUFBWSxXQUFXLE9BQU87QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiYWdlbnQiXQp9Cg==
