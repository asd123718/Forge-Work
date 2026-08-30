import * as assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { McpServerStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { countRunningMcpServersInOtherSessions, getActiveAgentHostMcpSessionResource } from "../../common/mcpEditorAffordanceState.js";
suite("MCP Editor Affordance State", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("tracks session switching across agent host sessions", () => {
    const first = URI.parse("agent-host-copilotcli:/session-1");
    const second = URI.parse("agent-host-claude:/session-2");
    assert.deepStrictEqual([
      getActiveAgentHostMcpSessionResource(first)?.toString(),
      getActiveAgentHostMcpSessionResource(second)?.toString()
    ], [
      first.toString(),
      second.toString()
    ]);
  });
  test("treats provisional agent host sessions as active MCP sessions", () => {
    const provisional = URI.parse("agent-host-copilotcli:/untitled-123");
    assert.strictEqual(getActiveAgentHostMcpSessionResource(provisional)?.toString(), provisional.toString());
  });
  test("falls back to local state for non-agent-host sessions", () => {
    assert.deepStrictEqual([
      getActiveAgentHostMcpSessionResource(URI.parse("vscode-local-chat://local/session")),
      getActiveAgentHostMcpSessionResource(URI.parse("file:///workspace/mcp.json")),
      getActiveAgentHostMcpSessionResource(void 0)
    ], [
      void 0,
      void 0,
      void 0
    ]);
  });
  test("counts running servers in other sessions", () => {
    const current = URI.parse("agent-host-copilotcli:/current");
    const sessions = [
      {
        resource: current,
        servers: [
          { name: "db", enabled: true, status: McpServerStatus.Ready },
          { name: "search", enabled: true, status: McpServerStatus.Ready }
        ]
      },
      {
        resource: URI.parse("agent-host-copilotcli:/other-1"),
        servers: [
          { name: "db", enabled: true, status: McpServerStatus.Ready },
          { name: "db", enabled: true, status: McpServerStatus.Ready },
          { name: "search", enabled: false, status: McpServerStatus.Ready }
        ]
      },
      {
        resource: URI.parse("agent-host-claude:/other-2"),
        servers: [
          { name: "db", enabled: true, status: McpServerStatus.Ready },
          { name: "search", enabled: true, status: McpServerStatus.Stopped }
        ]
      }
    ];
    assert.deepStrictEqual([...countRunningMcpServersInOtherSessions(current, sessions)], [["db", 2]]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcdGVzdFxcY29tbW9uXFxtY3BFZGl0b3JBZmZvcmRhbmNlU3RhdGUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBjb3VudFJ1bm5pbmdNY3BTZXJ2ZXJzSW5PdGhlclNlc3Npb25zLCBnZXRBY3RpdmVBZ2VudEhvc3RNY3BTZXNzaW9uUmVzb3VyY2UsIHR5cGUgSU1jcEVkaXRvckFnZW50SG9zdFNlc3Npb25TZXJ2ZXJzIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcEVkaXRvckFmZm9yZGFuY2VTdGF0ZS5qcyc7XG5cbnN1aXRlKCdNQ1AgRWRpdG9yIEFmZm9yZGFuY2UgU3RhdGUnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3RyYWNrcyBzZXNzaW9uIHN3aXRjaGluZyBhY3Jvc3MgYWdlbnQgaG9zdCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBmaXJzdCA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9zZXNzaW9uLTEnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY2xhdWRlOi9zZXNzaW9uLTInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Z2V0QWN0aXZlQWdlbnRIb3N0TWNwU2Vzc2lvblJlc291cmNlKGZpcnN0KT8udG9TdHJpbmcoKSxcblx0XHRcdGdldEFjdGl2ZUFnZW50SG9zdE1jcFNlc3Npb25SZXNvdXJjZShzZWNvbmQpPy50b1N0cmluZygpLFxuXHRcdF0sIFtcblx0XHRcdGZpcnN0LnRvU3RyaW5nKCksXG5cdFx0XHRzZWNvbmQudG9TdHJpbmcoKSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndHJlYXRzIHByb3Zpc2lvbmFsIGFnZW50IGhvc3Qgc2Vzc2lvbnMgYXMgYWN0aXZlIE1DUCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aXNpb25hbCA9IFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi91bnRpdGxlZC0xMjMnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRBY3RpdmVBZ2VudEhvc3RNY3BTZXNzaW9uUmVzb3VyY2UocHJvdmlzaW9uYWwpPy50b1N0cmluZygpLCBwcm92aXNpb25hbC50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBsb2NhbCBzdGF0ZSBmb3Igbm9uLWFnZW50LWhvc3Qgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRnZXRBY3RpdmVBZ2VudEhvc3RNY3BTZXNzaW9uUmVzb3VyY2UoVVJJLnBhcnNlKCd2c2NvZGUtbG9jYWwtY2hhdDovL2xvY2FsL3Nlc3Npb24nKSksXG5cdFx0XHRnZXRBY3RpdmVBZ2VudEhvc3RNY3BTZXNzaW9uUmVzb3VyY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS9tY3AuanNvbicpKSxcblx0XHRcdGdldEFjdGl2ZUFnZW50SG9zdE1jcFNlc3Npb25SZXNvdXJjZSh1bmRlZmluZWQpLFxuXHRcdF0sIFtcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnY291bnRzIHJ1bm5pbmcgc2VydmVycyBpbiBvdGhlciBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjdXJyZW50ID0gVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L2N1cnJlbnQnKTtcblx0XHRjb25zdCBzZXNzaW9uczogSU1jcEVkaXRvckFnZW50SG9zdFNlc3Npb25TZXJ2ZXJzW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdHJlc291cmNlOiBjdXJyZW50LFxuXHRcdFx0XHRzZXJ2ZXJzOiBbXG5cdFx0XHRcdFx0eyBuYW1lOiAnZGInLCBlbmFibGVkOiB0cnVlLCBzdGF0dXM6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ3NlYXJjaCcsIGVuYWJsZWQ6IHRydWUsIHN0YXR1czogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L290aGVyLTEnKSxcblx0XHRcdFx0c2VydmVyczogW1xuXHRcdFx0XHRcdHsgbmFtZTogJ2RiJywgZW5hYmxlZDogdHJ1ZSwgc3RhdHVzOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdkYicsIGVuYWJsZWQ6IHRydWUsIHN0YXR1czogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnc2VhcmNoJywgZW5hYmxlZDogZmFsc2UsIHN0YXR1czogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNsYXVkZTovb3RoZXItMicpLFxuXHRcdFx0XHRzZXJ2ZXJzOiBbXG5cdFx0XHRcdFx0eyBuYW1lOiAnZGInLCBlbmFibGVkOiB0cnVlLCBzdGF0dXM6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ3NlYXJjaCcsIGVuYWJsZWQ6IHRydWUsIHN0YXR1czogTWNwU2VydmVyU3RhdHVzLlN0b3BwZWQgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNvdW50UnVubmluZ01jcFNlcnZlcnNJbk90aGVyU2Vzc2lvbnMoY3VycmVudCwgc2Vzc2lvbnMpXSwgW1snZGInLCAyXV0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVDQUF1Qyw0Q0FBb0Y7QUFFcEksTUFBTSwrQkFBK0IsTUFBTTtBQUMxQywwQ0FBd0M7QUFFeEMsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxVQUFNLFFBQVEsSUFBSSxNQUFNLGtDQUFrQztBQUMxRCxVQUFNLFNBQVMsSUFBSSxNQUFNLDhCQUE4QjtBQUV2RCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLHFDQUFxQyxLQUFLLEdBQUcsU0FBUztBQUFBLE1BQ3RELHFDQUFxQyxNQUFNLEdBQUcsU0FBUztBQUFBLElBQ3hELEdBQUc7QUFBQSxNQUNGLE1BQU0sU0FBUztBQUFBLE1BQ2YsT0FBTyxTQUFTO0FBQUEsSUFDakIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUVBQWlFLE1BQU07QUFDM0UsVUFBTSxjQUFjLElBQUksTUFBTSxxQ0FBcUM7QUFFbkUsV0FBTyxZQUFZLHFDQUFxQyxXQUFXLEdBQUcsU0FBUyxHQUFHLFlBQVksU0FBUyxDQUFDO0FBQUEsRUFDekcsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixxQ0FBcUMsSUFBSSxNQUFNLG1DQUFtQyxDQUFDO0FBQUEsTUFDbkYscUNBQXFDLElBQUksTUFBTSw0QkFBNEIsQ0FBQztBQUFBLE1BQzVFLHFDQUFxQyxNQUFTO0FBQUEsSUFDL0MsR0FBRztBQUFBLE1BQ0Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNENBQTRDLE1BQU07QUFDdEQsVUFBTSxVQUFVLElBQUksTUFBTSxnQ0FBZ0M7QUFDMUQsVUFBTSxXQUFnRDtBQUFBLE1BQ3JEO0FBQUEsUUFDQyxVQUFVO0FBQUEsUUFDVixTQUFTO0FBQUEsVUFDUixFQUFFLE1BQU0sTUFBTSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0IsTUFBTTtBQUFBLFVBQzNELEVBQUUsTUFBTSxVQUFVLFNBQVMsTUFBTSxRQUFRLGdCQUFnQixNQUFNO0FBQUEsUUFDaEU7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsVUFBVSxJQUFJLE1BQU0sZ0NBQWdDO0FBQUEsUUFDcEQsU0FBUztBQUFBLFVBQ1IsRUFBRSxNQUFNLE1BQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLE1BQU07QUFBQSxVQUMzRCxFQUFFLE1BQU0sTUFBTSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0IsTUFBTTtBQUFBLFVBQzNELEVBQUUsTUFBTSxVQUFVLFNBQVMsT0FBTyxRQUFRLGdCQUFnQixNQUFNO0FBQUEsUUFDakU7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsVUFBVSxJQUFJLE1BQU0sNEJBQTRCO0FBQUEsUUFDaEQsU0FBUztBQUFBLFVBQ1IsRUFBRSxNQUFNLE1BQU0sU0FBUyxNQUFNLFFBQVEsZ0JBQWdCLE1BQU07QUFBQSxVQUMzRCxFQUFFLE1BQU0sVUFBVSxTQUFTLE1BQU0sUUFBUSxnQkFBZ0IsUUFBUTtBQUFBLFFBQ2xFO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLGdCQUFnQixDQUFDLEdBQUcsc0NBQXNDLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNsRyxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
