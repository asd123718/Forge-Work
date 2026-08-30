import assert from "assert";
import { hash } from "../../../../../base/common/hash.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { ChatMode, CustomChatMode } from "../../common/chatModes.js";
import { reportChatModeChange } from "../../common/chatModeTelemetry.js";
import { Target } from "../../common/promptSyntax/promptTypes.js";
import { PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
class TestTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName, data) {
    if (eventName) {
      this.events.push({ name: eventName, data });
    }
  }
}
suite("ChatModeTelemetry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("reports custom agent selections with their picker metadata", () => {
    const telemetryService = new TestTelemetryService();
    const targetMode = new CustomChatMode({
      id: "reviewer",
      uri: URI.file("/workspace/.claude/agents/reviewer.md"),
      name: "Reviewer",
      agentInstructions: { content: "", toolReferences: [] },
      source: { storage: PromptsStorage.local },
      target: Target.Undefined,
      visibility: { userInvocable: true, agentInvocable: true },
      enabled: true,
      tools: ["read", "search"]
    });
    reportChatModeChange(telemetryService, ChatMode.Agent, targetMode, 4);
    assert.deepStrictEqual(telemetryService.events, [{
      name: "chat.modeChange",
      data: {
        fromMode: "agent",
        mode: String(hash("Reviewer")),
        requestCount: 4,
        storage: "local",
        extensionId: void 0,
        toolsCount: 2,
        handoffsCount: 0,
        isClaudeAgent: true
      }
    }]);
  });
  test("does not report selecting the current mode", () => {
    const telemetryService = new TestTelemetryService();
    reportChatModeChange(telemetryService, ChatMode.Agent, ChatMode.Agent, 0);
    assert.deepStrictEqual(telemetryService.events, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY2hhdE1vZGVUZWxlbWV0cnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlLCBDdXN0b21DaGF0TW9kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgcmVwb3J0Q2hhdE1vZGVDaGFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdE1vZGVUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5cbmNsYXNzIFRlc3RUZWxlbWV0cnlTZXJ2aWNlIGV4dGVuZHMgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB7XG5cdHJlYWRvbmx5IGV2ZW50czogeyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGRhdGE6IHVua25vd24gfVtdID0gW107XG5cblx0b3ZlcnJpZGUgcHVibGljTG9nMihldmVudE5hbWU/OiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50TmFtZSkge1xuXHRcdFx0dGhpcy5ldmVudHMucHVzaCh7IG5hbWU6IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0XHR9XG5cdH1cbn1cblxuc3VpdGUoJ0NoYXRNb2RlVGVsZW1ldHJ5JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXBvcnRzIGN1c3RvbSBhZ2VudCBzZWxlY3Rpb25zIHdpdGggdGhlaXIgcGlja2VyIG1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCB0YXJnZXRNb2RlID0gbmV3IEN1c3RvbUNoYXRNb2RlKHtcblx0XHRcdGlkOiAncmV2aWV3ZXInLFxuXHRcdFx0dXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL2FnZW50cy9yZXZpZXdlci5tZCcpLFxuXHRcdFx0bmFtZTogJ1Jldmlld2VyJyxcblx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7IGNvbnRlbnQ6ICcnLCB0b29sUmVmZXJlbmNlczogW10gfSxcblx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHRvb2xzOiBbJ3JlYWQnLCAnc2VhcmNoJ10sXG5cdFx0fSk7XG5cblx0XHRyZXBvcnRDaGF0TW9kZUNoYW5nZSh0ZWxlbWV0cnlTZXJ2aWNlLCBDaGF0TW9kZS5BZ2VudCwgdGFyZ2V0TW9kZSwgNCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbe1xuXHRcdFx0bmFtZTogJ2NoYXQubW9kZUNoYW5nZScsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGZyb21Nb2RlOiAnYWdlbnQnLFxuXHRcdFx0XHRtb2RlOiBTdHJpbmcoaGFzaCgnUmV2aWV3ZXInKSksXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogNCxcblx0XHRcdFx0c3RvcmFnZTogJ2xvY2FsJyxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbHNDb3VudDogMixcblx0XHRcdFx0aGFuZG9mZnNDb3VudDogMCxcblx0XHRcdFx0aXNDbGF1ZGVBZ2VudDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXBvcnQgc2VsZWN0aW5nIHRoZSBjdXJyZW50IG1vZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXG5cdFx0cmVwb3J0Q2hhdE1vZGVDaGFuZ2UodGVsZW1ldHJ5U2VydmljZSwgQ2hhdE1vZGUuQWdlbnQsIENoYXRNb2RlLkFnZW50LCAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVsZW1ldHJ5U2VydmljZS5ldmVudHMsIFtdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsVUFBVSxzQkFBc0I7QUFDekMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0sNkJBQTZCLDBCQUEwQjtBQUFBLEVBQTdEO0FBQUE7QUFDQyxTQUFTLFNBQThELENBQUM7QUFBQTtBQUFBLEVBRS9ELFdBQVcsV0FBb0IsTUFBc0I7QUFDN0QsUUFBSSxXQUFXO0FBQ2QsV0FBSyxPQUFPLEtBQUssRUFBRSxNQUFNLFdBQVcsS0FBSyxDQUFDO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLDBDQUF3QztBQUV4QyxPQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLFVBQU0sbUJBQW1CLElBQUkscUJBQXFCO0FBQ2xELFVBQU0sYUFBYSxJQUFJLGVBQWU7QUFBQSxNQUNyQyxJQUFJO0FBQUEsTUFDSixLQUFLLElBQUksS0FBSyx1Q0FBdUM7QUFBQSxNQUNyRCxNQUFNO0FBQUEsTUFDTixtQkFBbUIsRUFBRSxTQUFTLElBQUksZ0JBQWdCLENBQUMsRUFBRTtBQUFBLE1BQ3JELFFBQVEsRUFBRSxTQUFTLGVBQWUsTUFBTTtBQUFBLE1BQ3hDLFFBQVEsT0FBTztBQUFBLE1BQ2YsWUFBWSxFQUFFLGVBQWUsTUFBTSxnQkFBZ0IsS0FBSztBQUFBLE1BQ3hELFNBQVM7QUFBQSxNQUNULE9BQU8sQ0FBQyxRQUFRLFFBQVE7QUFBQSxJQUN6QixDQUFDO0FBRUQseUJBQXFCLGtCQUFrQixTQUFTLE9BQU8sWUFBWSxDQUFDO0FBRXBFLFdBQU8sZ0JBQWdCLGlCQUFpQixRQUFRLENBQUM7QUFBQSxNQUNoRCxNQUFNO0FBQUEsTUFDTixNQUFNO0FBQUEsUUFDTCxVQUFVO0FBQUEsUUFDVixNQUFNLE9BQU8sS0FBSyxVQUFVLENBQUM7QUFBQSxRQUM3QixjQUFjO0FBQUEsUUFDZCxTQUFTO0FBQUEsUUFDVCxhQUFhO0FBQUEsUUFDYixZQUFZO0FBQUEsUUFDWixlQUFlO0FBQUEsUUFDZixlQUFlO0FBQUEsTUFDaEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsVUFBTSxtQkFBbUIsSUFBSSxxQkFBcUI7QUFFbEQseUJBQXFCLGtCQUFrQixTQUFTLE9BQU8sU0FBUyxPQUFPLENBQUM7QUFFeEUsV0FBTyxnQkFBZ0IsaUJBQWlCLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDbkQsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
