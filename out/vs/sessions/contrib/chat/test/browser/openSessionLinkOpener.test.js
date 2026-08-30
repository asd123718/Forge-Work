import * as assert from "assert";
import { autorun, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { readSessionState } from "../../browser/openSessionLinkOpener.contribution.js";
suite("OpenSessionLinkOpenerContribution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("reactively reads the targeted chat state", () => {
    const chatStatus = observableValue("chatStatus", SessionStatus.Completed);
    const chat = {
      resource: URI.parse("agent-host-copilotcli:/session?unused=true#peer"),
      title: observableValue("chatTitle", "Peer chat"),
      status: chatStatus
    };
    const chats = observableValue("chats", []);
    const session = {
      title: observableValue("sessionTitle", "Parent session"),
      description: observableValue("sessionDescription", { value: "Session details" }),
      status: observableValue("sessionStatus", SessionStatus.InProgress),
      chats
    };
    const values = [];
    store.add(autorun((reader) => {
      values.push(readSessionState(session, "peer", reader));
    }));
    chats.set([chat], void 0);
    chatStatus.set(SessionStatus.NeedsInput, void 0);
    assert.deepStrictEqual(values, [
      {
        kind: "session",
        title: "Parent session",
        detail: "Session details",
        status: { kind: "pending", label: "Working" },
        tooltip: "Parent session \xB7 Working",
        ariaLabel: "Agent session Parent session, Working"
      },
      {
        kind: "session",
        title: "Peer chat",
        detail: "Session details",
        status: { kind: "success", label: "Completed" },
        tooltip: "Peer chat \xB7 Completed",
        ariaLabel: "Agent session Peer chat, Completed"
      },
      {
        kind: "session",
        title: "Peer chat",
        detail: "Session details",
        status: { kind: "warning", label: "Needs input" },
        tooltip: "Peer chat \xB7 Needs input",
        ariaLabel: "Agent session Peer chat, Needs input"
      }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcb3BlblNlc3Npb25MaW5rT3BlbmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uTGlua0NoYXRTdGF0ZSwgSVNlc3Npb25MaW5rU3RhdGUsIHJlYWRTZXNzaW9uU3RhdGUgfSBmcm9tICcuLi8uLi9icm93c2VyL29wZW5TZXNzaW9uTGlua09wZW5lci5jb250cmlidXRpb24uanMnO1xuXG5zdWl0ZSgnT3BlblNlc3Npb25MaW5rT3BlbmVyQ29udHJpYnV0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlYWN0aXZlbHkgcmVhZHMgdGhlIHRhcmdldGVkIGNoYXQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdFN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZSgnY2hhdFN0YXR1cycsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0XHRjb25zdCBjaGF0OiBJU2Vzc2lvbkxpbmtDaGF0U3RhdGUgPSB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6L3Nlc3Npb24/dW51c2VkPXRydWUjcGVlcicpLFxuXHRcdFx0dGl0bGU6IG9ic2VydmFibGVWYWx1ZSgnY2hhdFRpdGxlJywgJ1BlZXIgY2hhdCcpLFxuXHRcdFx0c3RhdHVzOiBjaGF0U3RhdHVzLFxuXHRcdH07XG5cdFx0Y29uc3QgY2hhdHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSVNlc3Npb25MaW5rQ2hhdFN0YXRlW10+KCdjaGF0cycsIFtdKTtcblx0XHRjb25zdCBzZXNzaW9uOiBJU2Vzc2lvbkxpbmtTdGF0ZSA9IHtcblx0XHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoJ3Nlc3Npb25UaXRsZScsICdQYXJlbnQgc2Vzc2lvbicpLFxuXHRcdFx0ZGVzY3JpcHRpb246IG9ic2VydmFibGVWYWx1ZSgnc2Vzc2lvbkRlc2NyaXB0aW9uJywgeyB2YWx1ZTogJ1Nlc3Npb24gZGV0YWlscycgfSksXG5cdFx0XHRzdGF0dXM6IG9ic2VydmFibGVWYWx1ZSgnc2Vzc2lvblN0YXR1cycsIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyksXG5cdFx0XHRjaGF0cyxcblx0XHR9O1xuXHRcdGNvbnN0IHZhbHVlczogdW5rbm93bltdID0gW107XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHZhbHVlcy5wdXNoKHJlYWRTZXNzaW9uU3RhdGUoc2Vzc2lvbiwgJ3BlZXInLCByZWFkZXIpKTtcblx0XHR9KSk7XG5cblx0XHRjaGF0cy5zZXQoW2NoYXRdLCB1bmRlZmluZWQpO1xuXHRcdGNoYXRTdGF0dXMuc2V0KFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdzZXNzaW9uJyxcblx0XHRcdFx0dGl0bGU6ICdQYXJlbnQgc2Vzc2lvbicsXG5cdFx0XHRcdGRldGFpbDogJ1Nlc3Npb24gZGV0YWlscycsXG5cdFx0XHRcdHN0YXR1czogeyBraW5kOiAncGVuZGluZycsIGxhYmVsOiAnV29ya2luZycgfSxcblx0XHRcdFx0dG9vbHRpcDogJ1BhcmVudCBzZXNzaW9uIFx1MDBCNyBXb3JraW5nJyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQWdlbnQgc2Vzc2lvbiBQYXJlbnQgc2Vzc2lvbiwgV29ya2luZycsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnc2Vzc2lvbicsXG5cdFx0XHRcdHRpdGxlOiAnUGVlciBjaGF0Jyxcblx0XHRcdFx0ZGV0YWlsOiAnU2Vzc2lvbiBkZXRhaWxzJyxcblx0XHRcdFx0c3RhdHVzOiB7IGtpbmQ6ICdzdWNjZXNzJywgbGFiZWw6ICdDb21wbGV0ZWQnIH0sXG5cdFx0XHRcdHRvb2x0aXA6ICdQZWVyIGNoYXQgXHUwMEI3IENvbXBsZXRlZCcsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0FnZW50IHNlc3Npb24gUGVlciBjaGF0LCBDb21wbGV0ZWQnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ3Nlc3Npb24nLFxuXHRcdFx0XHR0aXRsZTogJ1BlZXIgY2hhdCcsXG5cdFx0XHRcdGRldGFpbDogJ1Nlc3Npb24gZGV0YWlscycsXG5cdFx0XHRcdHN0YXR1czogeyBraW5kOiAnd2FybmluZycsIGxhYmVsOiAnTmVlZHMgaW5wdXQnIH0sXG5cdFx0XHRcdHRvb2x0aXA6ICdQZWVyIGNoYXQgXHUwMEI3IE5lZWRzIGlucHV0Jyxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQWdlbnQgc2Vzc2lvbiBQZWVyIGNoYXQsIE5lZWRzIGlucHV0Jyxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBbUQsd0JBQXdCO0FBRTNFLE1BQU0scUNBQXFDLE1BQU07QUFDaEQsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLDRDQUE0QyxNQUFNO0FBQ3RELFVBQU0sYUFBYSxnQkFBZ0IsY0FBYyxjQUFjLFNBQVM7QUFDeEUsVUFBTSxPQUE4QjtBQUFBLE1BQ25DLFVBQVUsSUFBSSxNQUFNLGlEQUFpRDtBQUFBLE1BQ3JFLE9BQU8sZ0JBQWdCLGFBQWEsV0FBVztBQUFBLE1BQy9DLFFBQVE7QUFBQSxJQUNUO0FBQ0EsVUFBTSxRQUFRLGdCQUFrRCxTQUFTLENBQUMsQ0FBQztBQUMzRSxVQUFNLFVBQTZCO0FBQUEsTUFDbEMsT0FBTyxnQkFBZ0IsZ0JBQWdCLGdCQUFnQjtBQUFBLE1BQ3ZELGFBQWEsZ0JBQWdCLHNCQUFzQixFQUFFLE9BQU8sa0JBQWtCLENBQUM7QUFBQSxNQUMvRSxRQUFRLGdCQUFnQixpQkFBaUIsY0FBYyxVQUFVO0FBQUEsTUFDakU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxTQUFvQixDQUFDO0FBQzNCLFVBQU0sSUFBSSxRQUFRLFlBQVU7QUFDM0IsYUFBTyxLQUFLLGlCQUFpQixTQUFTLFFBQVEsTUFBTSxDQUFDO0FBQUEsSUFDdEQsQ0FBQyxDQUFDO0FBRUYsVUFBTSxJQUFJLENBQUMsSUFBSSxHQUFHLE1BQVM7QUFDM0IsZUFBVyxJQUFJLGNBQWMsWUFBWSxNQUFTO0FBRWxELFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QjtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sT0FBTztBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsUUFBUSxFQUFFLE1BQU0sV0FBVyxPQUFPLFVBQVU7QUFBQSxRQUM1QyxTQUFTO0FBQUEsUUFDVCxXQUFXO0FBQUEsTUFDWjtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUNSLFFBQVEsRUFBRSxNQUFNLFdBQVcsT0FBTyxZQUFZO0FBQUEsUUFDOUMsU0FBUztBQUFBLFFBQ1QsV0FBVztBQUFBLE1BQ1o7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixRQUFRLEVBQUUsTUFBTSxXQUFXLE9BQU8sY0FBYztBQUFBLFFBQ2hELFNBQVM7QUFBQSxRQUNULFdBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
