import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { RemoteAgentHostConnectionStatus } from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IsSessionsWindowContext } from "../../../../../../workbench/common/contextkeys.js";
import { OpenCopilotCliStateFileAction } from "../../../../../../workbench/contrib/chat/browser/actions/openCopilotCliStateFileAction.js";
import { ChatContextKeys } from "../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { buildLocalCopilotLogsUri, buildRemoteCopilotLogsUri, getCopilotCliSessionRawId, resolveEventsUri } from "../../../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js";
import { IsAgentHostSession } from "../../browser/agentHostSkillButtons.js";
import { OpenSessionEventsFileAction } from "../../browser/openSessionEventsFileActions.js";
suite("openSessionEventsFile resolveEventsUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const userHome = URI.file("/home/me");
  function makeRemoteConn(address, defaultDirectory) {
    return {
      address,
      name: address,
      clientId: "client-1",
      defaultDirectory,
      status: RemoteAgentHostConnectionStatus.connected
    };
  }
  function context(values) {
    return {
      getValue: (key) => values[key]
    };
  }
  test("workbench command is disabled in the Agents window", () => {
    const workbenchPrecondition = new OpenCopilotCliStateFileAction().desc.precondition;
    const sessionsPrecondition = new OpenSessionEventsFileAction().desc.precondition;
    assert.deepStrictEqual({
      workbenchVSCodeWindow: workbenchPrecondition?.evaluate(context({
        [ChatContextKeys.enabled.key]: true,
        [IsSessionsWindowContext.key]: false
      })),
      workbenchAgentsWindow: workbenchPrecondition?.evaluate(context({
        [ChatContextKeys.enabled.key]: true,
        [IsSessionsWindowContext.key]: true
      })),
      sessionsCopilotCliSession: sessionsPrecondition?.evaluate(context({
        [ChatContextKeys.enabled.key]: true,
        [IsAgentHostSession.key]: false
      })),
      sessionsAgentHostSession: sessionsPrecondition?.evaluate(context({
        [ChatContextKeys.enabled.key]: true,
        [IsAgentHostSession.key]: true
      }))
    }, {
      workbenchVSCodeWindow: true,
      workbenchAgentsWindow: false,
      sessionsCopilotCliSession: false,
      sessionsAgentHostSession: true
    });
  });
  test("local AH copilotcli session resolves to ~/.copilot/session-state/<id>/events.jsonl", () => {
    const result = resolveEventsUri(URI.parse("agent-host-copilotcli:/abc"), userHome, () => void 0);
    assert.deepStrictEqual(
      { kind: result.kind, resource: result.kind === "ok" ? result.resource.toString() : void 0 },
      { kind: "ok", resource: "file:///home/me/.copilot/session-state/abc/events.jsonl" }
    );
  });
  test("local AH copilotcli session resolves from COPILOT_HOME", () => {
    const result = resolveEventsUri(
      URI.parse("agent-host-copilotcli:/abc"),
      userHome,
      () => void 0,
      { COPILOT_HOME: "/custom/copilot" }
    );
    assert.deepStrictEqual(
      { kind: result.kind, resource: result.kind === "ok" ? result.resource.toString() : void 0 },
      { kind: "ok", resource: "file:///custom/copilot/session-state/abc/events.jsonl" }
    );
  });
  test("copilot log roots resolve beside session-state", () => {
    const conn = makeRemoteConn("localhost:4321", "/home/remote");
    const remoteLogs = buildRemoteCopilotLogsUri(conn);
    assert.deepStrictEqual({
      rawId: getCopilotCliSessionRawId(URI.parse("agent-host-copilotcli:/abc")),
      nonCopilotRawId: getCopilotCliSessionRawId(URI.parse("agent-host-copilot:/abc")),
      localLogs: buildLocalCopilotLogsUri(userHome).toString(),
      remoteLogs: remoteLogs ? {
        scheme: remoteLogs.scheme,
        authority: remoteLogs.authority,
        isLogsPath: remoteLogs.path.endsWith("/home/remote/.copilot/logs")
      } : void 0
    }, {
      rawId: "abc",
      nonCopilotRawId: void 0,
      localLogs: "file:///home/me/.copilot/logs",
      remoteLogs: {
        scheme: "vscode-agent-host",
        authority: "localhost__4321",
        isLogsPath: true
      }
    });
  });
  test("local copilot log root resolves from COPILOT_HOME", () => {
    assert.strictEqual(
      buildLocalCopilotLogsUri(userHome, { COPILOT_HOME: "/custom/copilot" }).toString(),
      "file:///custom/copilot/logs"
    );
  });
  test("EH CLI copilotcli session resolves to ~/.copilot/session-state/<id>/events.jsonl", () => {
    const result = resolveEventsUri(URI.parse("copilotcli:/abc"), userHome, () => void 0);
    assert.deepStrictEqual(
      { kind: result.kind, resource: result.kind === "ok" ? result.resource.toString() : void 0 },
      { kind: "ok", resource: "file:///home/me/.copilot/session-state/abc/events.jsonl" }
    );
  });
  test("remote copilotcli session wraps host events.jsonl in vscode-agent-host URI", () => {
    const conn = makeRemoteConn("localhost:4321", "/home/remote");
    const result = resolveEventsUri(
      URI.parse("remote-localhost__4321-copilotcli:/xyz"),
      userHome,
      (authority) => authority === "localhost__4321" ? conn : void 0
    );
    assert.deepStrictEqual(
      { kind: result.kind, resource: result.kind === "ok" ? result.resource.toString() : void 0 },
      { kind: "ok", resource: "vscode-agent-host://localhost__4321/home/remote/.copilot/session-state/xyz/events.jsonl?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0" }
    );
  });
  test("remote scheme without an active connection returns remote-not-connected", () => {
    const result = resolveEventsUri(
      URI.parse("remote-myhost-copilotcli:/abc"),
      userHome,
      () => void 0
    );
    assert.deepStrictEqual(result, { kind: "remote-not-connected", authority: "myhost" });
  });
  test("remote scheme without a defaultDirectory returns remote-no-home", () => {
    const conn = makeRemoteConn("myhost", void 0);
    const result = resolveEventsUri(
      URI.parse("remote-myhost-copilotcli:/abc"),
      userHome,
      (authority) => authority === "myhost" ? conn : void 0
    );
    assert.deepStrictEqual(result, { kind: "remote-no-home", authority: "myhost" });
  });
  test("unknown scheme returns unsupported-scheme", () => {
    const result = resolveEventsUri(URI.parse("claude:/abc"), userHome, () => void 0);
    assert.deepStrictEqual(result, { kind: "unsupported-scheme", scheme: "claude" });
  });
  test("missing session resource returns no-session", () => {
    const result = resolveEventsUri(void 0, userHome, () => void 0);
    assert.deepStrictEqual(result, { kind: "no-session" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXG9wZW5TZXNzaW9uRXZlbnRzRmlsZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0S2V5VmFsdWUsIElDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkluZm8sIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IE9wZW5Db3BpbG90Q2xpU3RhdGVGaWxlQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvb3BlbkNvcGlsb3RDbGlTdGF0ZUZpbGVBY3Rpb24uanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgYnVpbGRMb2NhbENvcGlsb3RMb2dzVXJpLCBidWlsZFJlbW90ZUNvcGlsb3RMb2dzVXJpLCBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkLCByZXNvbHZlRXZlbnRzVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NvcGlsb3RDbGlFdmVudHNVcmkuanMnO1xuaW1wb3J0IHsgSXNBZ2VudEhvc3RTZXNzaW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hZ2VudEhvc3RTa2lsbEJ1dHRvbnMuanMnO1xuaW1wb3J0IHsgT3BlblNlc3Npb25FdmVudHNGaWxlQWN0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9vcGVuU2Vzc2lvbkV2ZW50c0ZpbGVBY3Rpb25zLmpzJztcblxuc3VpdGUoJ29wZW5TZXNzaW9uRXZlbnRzRmlsZSByZXNvbHZlRXZlbnRzVXJpJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB1c2VySG9tZSA9IFVSSS5maWxlKCcvaG9tZS9tZScpO1xuXG5cdGZ1bmN0aW9uIG1ha2VSZW1vdGVDb25uKGFkZHJlc3M6IHN0cmluZywgZGVmYXVsdERpcmVjdG9yeTogc3RyaW5nIHwgdW5kZWZpbmVkKTogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YWRkcmVzcyxcblx0XHRcdG5hbWU6IGFkZHJlc3MsXG5cdFx0XHRjbGllbnRJZDogJ2NsaWVudC0xJyxcblx0XHRcdGRlZmF1bHREaXJlY3RvcnksXG5cdFx0XHRzdGF0dXM6IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGVkLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjb250ZXh0KHZhbHVlczogUmVjb3JkPHN0cmluZywgQ29udGV4dEtleVZhbHVlPik6IElDb250ZXh0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0VmFsdWU6IDxUIGV4dGVuZHMgQ29udGV4dEtleVZhbHVlID0gQ29udGV4dEtleVZhbHVlPihrZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQgPT4gdmFsdWVzW2tleV0gYXMgVCB8IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnd29ya2JlbmNoIGNvbW1hbmQgaXMgZGlzYWJsZWQgaW4gdGhlIEFnZW50cyB3aW5kb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya2JlbmNoUHJlY29uZGl0aW9uID0gbmV3IE9wZW5Db3BpbG90Q2xpU3RhdGVGaWxlQWN0aW9uKCkuZGVzYy5wcmVjb25kaXRpb247XG5cdFx0Y29uc3Qgc2Vzc2lvbnNQcmVjb25kaXRpb24gPSBuZXcgT3BlblNlc3Npb25FdmVudHNGaWxlQWN0aW9uKCkuZGVzYy5wcmVjb25kaXRpb247XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmtiZW5jaFZTQ29kZVdpbmRvdzogd29ya2JlbmNoUHJlY29uZGl0aW9uPy5ldmFsdWF0ZShjb250ZXh0KHtcblx0XHRcdFx0W0NoYXRDb250ZXh0S2V5cy5lbmFibGVkLmtleV06IHRydWUsXG5cdFx0XHRcdFtJc1Nlc3Npb25zV2luZG93Q29udGV4dC5rZXldOiBmYWxzZSxcblx0XHRcdH0pKSxcblx0XHRcdHdvcmtiZW5jaEFnZW50c1dpbmRvdzogd29ya2JlbmNoUHJlY29uZGl0aW9uPy5ldmFsdWF0ZShjb250ZXh0KHtcblx0XHRcdFx0W0NoYXRDb250ZXh0S2V5cy5lbmFibGVkLmtleV06IHRydWUsXG5cdFx0XHRcdFtJc1Nlc3Npb25zV2luZG93Q29udGV4dC5rZXldOiB0cnVlLFxuXHRcdFx0fSkpLFxuXHRcdFx0c2Vzc2lvbnNDb3BpbG90Q2xpU2Vzc2lvbjogc2Vzc2lvbnNQcmVjb25kaXRpb24/LmV2YWx1YXRlKGNvbnRleHQoe1xuXHRcdFx0XHRbQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQua2V5XTogdHJ1ZSxcblx0XHRcdFx0W0lzQWdlbnRIb3N0U2Vzc2lvbi5rZXldOiBmYWxzZSxcblx0XHRcdH0pKSxcblx0XHRcdHNlc3Npb25zQWdlbnRIb3N0U2Vzc2lvbjogc2Vzc2lvbnNQcmVjb25kaXRpb24/LmV2YWx1YXRlKGNvbnRleHQoe1xuXHRcdFx0XHRbQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQua2V5XTogdHJ1ZSxcblx0XHRcdFx0W0lzQWdlbnRIb3N0U2Vzc2lvbi5rZXldOiB0cnVlLFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdHdvcmtiZW5jaFZTQ29kZVdpbmRvdzogdHJ1ZSxcblx0XHRcdHdvcmtiZW5jaEFnZW50c1dpbmRvdzogZmFsc2UsXG5cdFx0XHRzZXNzaW9uc0NvcGlsb3RDbGlTZXNzaW9uOiBmYWxzZSxcblx0XHRcdHNlc3Npb25zQWdlbnRIb3N0U2Vzc2lvbjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbG9jYWwgQUggY29waWxvdGNsaSBzZXNzaW9uIHJlc29sdmVzIHRvIH4vLmNvcGlsb3Qvc2Vzc2lvbi1zdGF0ZS88aWQ+L2V2ZW50cy5qc29ubCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlRXZlbnRzVXJpKFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9hYmMnKSwgdXNlckhvbWUsICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsga2luZDogcmVzdWx0LmtpbmQsIHJlc291cmNlOiByZXN1bHQua2luZCA9PT0gJ29rJyA/IHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpIDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGtpbmQ6ICdvaycsIHJlc291cmNlOiAnZmlsZTovLy9ob21lL21lLy5jb3BpbG90L3Nlc3Npb24tc3RhdGUvYWJjL2V2ZW50cy5qc29ubCcgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBBSCBjb3BpbG90Y2xpIHNlc3Npb24gcmVzb2x2ZXMgZnJvbSBDT1BJTE9UX0hPTUUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUV2ZW50c1VyaShcblx0XHRcdFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi9hYmMnKSxcblx0XHRcdHVzZXJIb21lLFxuXHRcdFx0KCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0eyBDT1BJTE9UX0hPTUU6ICcvY3VzdG9tL2NvcGlsb3QnIH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBraW5kOiByZXN1bHQua2luZCwgcmVzb3VyY2U6IHJlc3VsdC5raW5kID09PSAnb2snID8gcmVzdWx0LnJlc291cmNlLnRvU3RyaW5nKCkgOiB1bmRlZmluZWQgfSxcblx0XHRcdHsga2luZDogJ29rJywgcmVzb3VyY2U6ICdmaWxlOi8vL2N1c3RvbS9jb3BpbG90L3Nlc3Npb24tc3RhdGUvYWJjL2V2ZW50cy5qc29ubCcgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3BpbG90IGxvZyByb290cyByZXNvbHZlIGJlc2lkZSBzZXNzaW9uLXN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm4gPSBtYWtlUmVtb3RlQ29ubignbG9jYWxob3N0OjQzMjEnLCAnL2hvbWUvcmVtb3RlJyk7XG5cdFx0Y29uc3QgcmVtb3RlTG9ncyA9IGJ1aWxkUmVtb3RlQ29waWxvdExvZ3NVcmkoY29ubik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyYXdJZDogZ2V0Q29waWxvdENsaVNlc3Npb25SYXdJZChVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdGNsaTovYWJjJykpLFxuXHRcdFx0bm9uQ29waWxvdFJhd0lkOiBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkKFVSSS5wYXJzZSgnYWdlbnQtaG9zdC1jb3BpbG90Oi9hYmMnKSksXG5cdFx0XHRsb2NhbExvZ3M6IGJ1aWxkTG9jYWxDb3BpbG90TG9nc1VyaSh1c2VySG9tZSkudG9TdHJpbmcoKSxcblx0XHRcdHJlbW90ZUxvZ3M6IHJlbW90ZUxvZ3MgPyB7XG5cdFx0XHRcdHNjaGVtZTogcmVtb3RlTG9ncy5zY2hlbWUsXG5cdFx0XHRcdGF1dGhvcml0eTogcmVtb3RlTG9ncy5hdXRob3JpdHksXG5cdFx0XHRcdGlzTG9nc1BhdGg6IHJlbW90ZUxvZ3MucGF0aC5lbmRzV2l0aCgnL2hvbWUvcmVtb3RlLy5jb3BpbG90L2xvZ3MnKSxcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0cmF3SWQ6ICdhYmMnLFxuXHRcdFx0bm9uQ29waWxvdFJhd0lkOiB1bmRlZmluZWQsXG5cdFx0XHRsb2NhbExvZ3M6ICdmaWxlOi8vL2hvbWUvbWUvLmNvcGlsb3QvbG9ncycsXG5cdFx0XHRyZW1vdGVMb2dzOiB7XG5cdFx0XHRcdHNjaGVtZTogJ3ZzY29kZS1hZ2VudC1ob3N0Jyxcblx0XHRcdFx0YXV0aG9yaXR5OiAnbG9jYWxob3N0X180MzIxJyxcblx0XHRcdFx0aXNMb2dzUGF0aDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvY2FsIGNvcGlsb3QgbG9nIHJvb3QgcmVzb2x2ZXMgZnJvbSBDT1BJTE9UX0hPTUUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YnVpbGRMb2NhbENvcGlsb3RMb2dzVXJpKHVzZXJIb21lLCB7IENPUElMT1RfSE9NRTogJy9jdXN0b20vY29waWxvdCcgfSkudG9TdHJpbmcoKSxcblx0XHRcdCdmaWxlOi8vL2N1c3RvbS9jb3BpbG90L2xvZ3MnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VIIENMSSBjb3BpbG90Y2xpIHNlc3Npb24gcmVzb2x2ZXMgdG8gfi8uY29waWxvdC9zZXNzaW9uLXN0YXRlLzxpZD4vZXZlbnRzLmpzb25sJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVFdmVudHNVcmkoVVJJLnBhcnNlKCdjb3BpbG90Y2xpOi9hYmMnKSwgdXNlckhvbWUsICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsga2luZDogcmVzdWx0LmtpbmQsIHJlc291cmNlOiByZXN1bHQua2luZCA9PT0gJ29rJyA/IHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpIDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGtpbmQ6ICdvaycsIHJlc291cmNlOiAnZmlsZTovLy9ob21lL21lLy5jb3BpbG90L3Nlc3Npb24tc3RhdGUvYWJjL2V2ZW50cy5qc29ubCcgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdGUgY29waWxvdGNsaSBzZXNzaW9uIHdyYXBzIGhvc3QgZXZlbnRzLmpzb25sIGluIHZzY29kZS1hZ2VudC1ob3N0IFVSSScsICgpID0+IHtcblx0XHRjb25zdCBjb25uID0gbWFrZVJlbW90ZUNvbm4oJ2xvY2FsaG9zdDo0MzIxJywgJy9ob21lL3JlbW90ZScpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVFdmVudHNVcmkoXG5cdFx0XHRVUkkucGFyc2UoJ3JlbW90ZS1sb2NhbGhvc3RfXzQzMjEtY29waWxvdGNsaToveHl6JyksXG5cdFx0XHR1c2VySG9tZSxcblx0XHRcdGF1dGhvcml0eSA9PiBhdXRob3JpdHkgPT09ICdsb2NhbGhvc3RfXzQzMjEnID8gY29ubiA6IHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGtpbmQ6IHJlc3VsdC5raW5kLCByZXNvdXJjZTogcmVzdWx0LmtpbmQgPT09ICdvaycgPyByZXN1bHQucmVzb3VyY2UudG9TdHJpbmcoKSA6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBraW5kOiAnb2snLCByZXNvdXJjZTogJ3ZzY29kZS1hZ2VudC1ob3N0Oi8vbG9jYWxob3N0X180MzIxL2hvbWUvcmVtb3RlLy5jb3BpbG90L3Nlc3Npb24tc3RhdGUveHl6L2V2ZW50cy5qc29ubD9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCcgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdGUgc2NoZW1lIHdpdGhvdXQgYW4gYWN0aXZlIGNvbm5lY3Rpb24gcmV0dXJucyByZW1vdGUtbm90LWNvbm5lY3RlZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlRXZlbnRzVXJpKFxuXHRcdFx0VVJJLnBhcnNlKCdyZW1vdGUtbXlob3N0LWNvcGlsb3RjbGk6L2FiYycpLFxuXHRcdFx0dXNlckhvbWUsXG5cdFx0XHQoKSA9PiB1bmRlZmluZWQsXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAncmVtb3RlLW5vdC1jb25uZWN0ZWQnLCBhdXRob3JpdHk6ICdteWhvc3QnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdGUgc2NoZW1lIHdpdGhvdXQgYSBkZWZhdWx0RGlyZWN0b3J5IHJldHVybnMgcmVtb3RlLW5vLWhvbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29ubiA9IG1ha2VSZW1vdGVDb25uKCdteWhvc3QnLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVFdmVudHNVcmkoXG5cdFx0XHRVUkkucGFyc2UoJ3JlbW90ZS1teWhvc3QtY29waWxvdGNsaTovYWJjJyksXG5cdFx0XHR1c2VySG9tZSxcblx0XHRcdGF1dGhvcml0eSA9PiBhdXRob3JpdHkgPT09ICdteWhvc3QnID8gY29ubiA6IHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6ICdyZW1vdGUtbm8taG9tZScsIGF1dGhvcml0eTogJ215aG9zdCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vua25vd24gc2NoZW1lIHJldHVybnMgdW5zdXBwb3J0ZWQtc2NoZW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVFdmVudHNVcmkoVVJJLnBhcnNlKCdjbGF1ZGU6L2FiYycpLCB1c2VySG9tZSwgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAndW5zdXBwb3J0ZWQtc2NoZW1lJywgc2NoZW1lOiAnY2xhdWRlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnbWlzc2luZyBzZXNzaW9uIHJlc291cmNlIHJldHVybnMgbm8tc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlRXZlbnRzVXJpKHVuZGVmaW5lZCwgdXNlckhvbWUsICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ25vLXNlc3Npb24nIH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxTQUF5Qyx1Q0FBdUM7QUFDaEYsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1QkFB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
