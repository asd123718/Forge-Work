import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { getTelemetryChatSessionId } from "../../common/agentTelemetryCorrelation.js";
import { AgentSession } from "../../common/agent.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from "../../common/agentHostTelemetry.js";
import { readAgentErrorTelemetryMeta } from "../../common/meta/agentErrorMeta.js";
import { buildChatUri, buildSubagentSessionUri } from "../../common/state/sessionState.js";
import { classifyCopilotClientFailure, createCopilotFailureCorrelation, normalizeCopilotApiEndpoint, reportCopilotModelCallFailure } from "../../node/copilot/copilotFailureTelemetry.js";
class CapturingTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.USAGE;
    this.sessionId = "test-session";
    this.machineId = "test-machine";
    this.sqmId = "test-sqm";
    this.devDeviceId = "test-dev-device";
    this.firstSessionDate = "test-first-session-date";
    this.sendErrorTelemetry = true;
    this.events = [];
  }
  publicLog() {
  }
  publicLog2() {
  }
  publicLogError() {
  }
  publicLogError2(eventName, data) {
    this.events.push({ eventName, data });
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite("CopilotFailureTelemetry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("classifies only known client lifecycle failures", () => {
    assert.deepStrictEqual([
      classifyCopilotClientFailure(new Error("Connection is closed.")),
      classifyCopilotClientFailure(new Error("Connection is disposed.")),
      classifyCopilotClientFailure(new Error("Client not connected")),
      classifyCopilotClientFailure(new Error("The in-process runtime connection is closed.")),
      classifyCopilotClientFailure(new Error("Failed to start CLI server: spawn failed")),
      classifyCopilotClientFailure(new Error("CLI server exited with code 1")),
      classifyCopilotClientFailure(new Error("CLI server exited unexpectedly with code 1")),
      classifyCopilotClientFailure(new Error("Timeout waiting for CLI server to start")),
      classifyCopilotClientFailure(new Error("429 too many requests"))
    ], [
      "connectionClosed",
      "connectionDisposed",
      "clientNotConnected",
      "runtimeConnectionClosed",
      "startupFailed",
      "startupFailed",
      "startupFailed",
      "startupFailed",
      void 0
    ]);
  });
  test("builds the Agent Host and SDK correlation tuple", () => {
    const session = AgentSession.uri("copilotcli", "agent-session-id");
    const chat = URI.parse(buildChatUri(session, "peer-chat-id"));
    assert.deepStrictEqual(createCopilotFailureCorrelation(session, chat, "turn-id", "sdk-session-id", {
      clientType: AgentHostClientType.EditorWindow,
      connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
      transportKind: AgentHostTransportKind.MessagePort,
      hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
      machineId: "client-machine-id",
      devDeviceId: "client-dev-device-id"
    }), {
      initiatorClientType: "editor_window",
      initiatorConnectionKind: "remote_extension_host",
      initiatorTransportKind: "message_port",
      hostLaunchKind: "vscode_main_process",
      initiatorMachineId: "client-machine-id",
      initiatorDevDeviceId: "client-dev-device-id",
      agentSessionId: "agent-session-id",
      chatSessionId: getTelemetryChatSessionId(chat),
      turnId: "turn-id",
      sdkSessionId: "sdk-session-id"
    });
  });
  test("hashes subagent chat IDs without path-like telemetry values", () => {
    const session = AgentSession.uri("copilotcli", "agent-session-id");
    const subagent = URI.parse(buildSubagentSessionUri(session, "tool-call-id"));
    const value = getTelemetryChatSessionId(subagent);
    assert.strictEqual(value, String(Number(value)));
    assert.strictEqual(value.includes("/"), false);
  });
  test("normalizes only allowlisted Copilot API endpoints", () => {
    assert.deepStrictEqual([
      normalizeCopilotApiEndpoint("/chat/completions"),
      normalizeCopilotApiEndpoint("/responses"),
      normalizeCopilotApiEndpoint("/v1/messages"),
      normalizeCopilotApiEndpoint("ws:/responses"),
      normalizeCopilotApiEndpoint("https://api.githubcopilot.com/responses"),
      normalizeCopilotApiEndpoint("https://contoso.example/private/deployment"),
      normalizeCopilotApiEndpoint(void 0)
    ], [
      "chatCompletions",
      "responses",
      "anthropicMessages",
      "responsesWebSocket",
      "responses",
      "other",
      void 0
    ]);
  });
  test("reports bounded model call endpoint categories instead of raw endpoints", () => {
    const telemetryService = new CapturingTelemetryService();
    const session = AgentSession.uri("copilotcli", "agent-session-id");
    const chat = URI.parse(buildChatUri(session, "peer-chat-id"));
    const correlation = createCopilotFailureCorrelation(session, chat, "turn-id", "sdk-session-id");
    const event = {
      type: "model.call_failure",
      id: "event-1",
      parentId: "parent-1",
      agentId: "agent-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      ephemeral: true,
      data: {
        source: "top_level",
        failureKind: "api",
        transport: "http",
        apiEndpoint: "/responses",
        statusCode: 500,
        durationMs: 42,
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
        isAuto: false,
        isByok: false,
        rte: true,
        badRequestKind: void 0,
        apiCallId: "api-call-id",
        providerCallId: "provider-call-id",
        serviceRequestId: "service-request-id",
        requestFingerprint: void 0
      }
    };
    reportCopilotModelCallFailure(telemetryService, event, correlation);
    assert.deepStrictEqual(telemetryService.events, [{
      eventName: "agentHost.copilotModelCallFailure",
      data: {
        agentSessionId: "agent-session-id",
        chatSessionId: getTelemetryChatSessionId(chat),
        turnId: "turn-id",
        sdkSessionId: "sdk-session-id",
        sdkEventId: "event-1",
        sdkParentEventId: "parent-1",
        sdkAgentId: "agent-1",
        failureKind: "api",
        source: "top_level",
        transport: "http",
        apiEndpoint: "responses",
        statusCode: 500,
        durationMs: 42,
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
        isAuto: false,
        isByok: false,
        rte: true,
        badRequestKind: void 0,
        apiCallId: "api-call-id",
        providerCallId: "provider-call-id",
        serviceRequestId: "service-request-id",
        messageCount: void 0,
        toolCallCount: void 0,
        toolResultMessageCount: void 0,
        namelessToolCallCount: void 0,
        imagePartCount: void 0,
        imagePartsMissingMediaType: void 0
      }
    }]);
  });
  test("drops empty provider request identifiers", () => {
    assert.deepStrictEqual(readAgentErrorTelemetryMeta({
      errorType: "test",
      message: "failed",
      _meta: {
        chatError: {
          fetchError: {
            requestId: "",
            serverRequestId: ""
          }
        }
      }
    }), {
      providerCallId: void 0,
      serviceRequestId: void 0
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90RmFpbHVyZVRlbGVtZXRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBTZXNzaW9uRXZlbnRQYXlsb2FkIH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBnZXRUZWxlbWV0cnlDaGF0U2Vzc2lvbklkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50VGVsZW1ldHJ5Q29ycmVsYXRpb24uanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZCwgQWdlbnRIb3N0TGF1bmNoS2luZCwgQWdlbnRIb3N0VHJhbnNwb3J0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgcmVhZEFnZW50RXJyb3JUZWxlbWV0cnlNZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRFcnJvck1ldGEuanMnO1xuaW1wb3J0IHsgYnVpbGRDaGF0VXJpLCBidWlsZFN1YmFnZW50U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgY2xhc3NpZnlDb3BpbG90Q2xpZW50RmFpbHVyZSwgY3JlYXRlQ29waWxvdEZhaWx1cmVDb3JyZWxhdGlvbiwgbm9ybWFsaXplQ29waWxvdEFwaUVuZHBvaW50LCByZXBvcnRDb3BpbG90TW9kZWxDYWxsRmFpbHVyZSB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90RmFpbHVyZVRlbGVtZXRyeS5qcyc7XG5cbmNsYXNzIENhcHR1cmluZ1RlbGVtZXRyeVNlcnZpY2UgaW1wbGVtZW50cyBJVGVsZW1ldHJ5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRyZWFkb25seSBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uJztcblx0cmVhZG9ubHkgbWFjaGluZUlkID0gJ3Rlc3QtbWFjaGluZSc7XG5cdHJlYWRvbmx5IHNxbUlkID0gJ3Rlc3Qtc3FtJztcblx0cmVhZG9ubHkgZGV2RGV2aWNlSWQgPSAndGVzdC1kZXYtZGV2aWNlJztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZSA9ICd0ZXN0LWZpcnN0LXNlc3Npb24tZGF0ZSc7XG5cdHJlYWRvbmx5IHNlbmRFcnJvclRlbGVtZXRyeSA9IHRydWU7XG5cdHJlYWRvbmx5IGV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQgfVtdID0gW107XG5cblx0cHVibGljTG9nKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZzIoKTogdm9pZCB7IH1cblx0cHVibGljTG9nRXJyb3IoKTogdm9pZCB7IH1cblx0cHVibGljTG9nRXJyb3IyKGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHR9XG5cdHNldEV4cGVyaW1lbnRQcm9wZXJ0eSgpOiB2b2lkIHsgfVxuXHRzZXRDb21tb25Qcm9wZXJ0eSgpOiB2b2lkIHsgfVxufVxuXG5zdWl0ZSgnQ29waWxvdEZhaWx1cmVUZWxlbWV0cnknLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NsYXNzaWZpZXMgb25seSBrbm93biBjbGllbnQgbGlmZWN5Y2xlIGZhaWx1cmVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Y2xhc3NpZnlDb3BpbG90Q2xpZW50RmFpbHVyZShuZXcgRXJyb3IoJ0Nvbm5lY3Rpb24gaXMgY2xvc2VkLicpKSxcblx0XHRcdGNsYXNzaWZ5Q29waWxvdENsaWVudEZhaWx1cmUobmV3IEVycm9yKCdDb25uZWN0aW9uIGlzIGRpc3Bvc2VkLicpKSxcblx0XHRcdGNsYXNzaWZ5Q29waWxvdENsaWVudEZhaWx1cmUobmV3IEVycm9yKCdDbGllbnQgbm90IGNvbm5lY3RlZCcpKSxcblx0XHRcdGNsYXNzaWZ5Q29waWxvdENsaWVudEZhaWx1cmUobmV3IEVycm9yKCdUaGUgaW4tcHJvY2VzcyBydW50aW1lIGNvbm5lY3Rpb24gaXMgY2xvc2VkLicpKSxcblx0XHRcdGNsYXNzaWZ5Q29waWxvdENsaWVudEZhaWx1cmUobmV3IEVycm9yKCdGYWlsZWQgdG8gc3RhcnQgQ0xJIHNlcnZlcjogc3Bhd24gZmFpbGVkJykpLFxuXHRcdFx0Y2xhc3NpZnlDb3BpbG90Q2xpZW50RmFpbHVyZShuZXcgRXJyb3IoJ0NMSSBzZXJ2ZXIgZXhpdGVkIHdpdGggY29kZSAxJykpLFxuXHRcdFx0Y2xhc3NpZnlDb3BpbG90Q2xpZW50RmFpbHVyZShuZXcgRXJyb3IoJ0NMSSBzZXJ2ZXIgZXhpdGVkIHVuZXhwZWN0ZWRseSB3aXRoIGNvZGUgMScpKSxcblx0XHRcdGNsYXNzaWZ5Q29waWxvdENsaWVudEZhaWx1cmUobmV3IEVycm9yKCdUaW1lb3V0IHdhaXRpbmcgZm9yIENMSSBzZXJ2ZXIgdG8gc3RhcnQnKSksXG5cdFx0XHRjbGFzc2lmeUNvcGlsb3RDbGllbnRGYWlsdXJlKG5ldyBFcnJvcignNDI5IHRvbyBtYW55IHJlcXVlc3RzJykpLFxuXHRcdF0sIFtcblx0XHRcdCdjb25uZWN0aW9uQ2xvc2VkJyxcblx0XHRcdCdjb25uZWN0aW9uRGlzcG9zZWQnLFxuXHRcdFx0J2NsaWVudE5vdENvbm5lY3RlZCcsXG5cdFx0XHQncnVudGltZUNvbm5lY3Rpb25DbG9zZWQnLFxuXHRcdFx0J3N0YXJ0dXBGYWlsZWQnLFxuXHRcdFx0J3N0YXJ0dXBGYWlsZWQnLFxuXHRcdFx0J3N0YXJ0dXBGYWlsZWQnLFxuXHRcdFx0J3N0YXJ0dXBGYWlsZWQnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZHMgdGhlIEFnZW50IEhvc3QgYW5kIFNESyBjb3JyZWxhdGlvbiB0dXBsZScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdhZ2VudC1zZXNzaW9uLWlkJyk7XG5cdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvbiwgJ3BlZXItY2hhdC1pZCcpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3JlYXRlQ29waWxvdEZhaWx1cmVDb3JyZWxhdGlvbihzZXNzaW9uLCBjaGF0LCAndHVybi1pZCcsICdzZGstc2Vzc2lvbi1pZCcsIHtcblx0XHRcdGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LFxuXHRcdFx0Y29ubmVjdGlvbktpbmQ6IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLlJlbW90ZUV4dGVuc2lvbkhvc3QsXG5cdFx0XHR0cmFuc3BvcnRLaW5kOiBBZ2VudEhvc3RUcmFuc3BvcnRLaW5kLk1lc3NhZ2VQb3J0LFxuXHRcdFx0aG9zdExhdW5jaEtpbmQ6IEFnZW50SG9zdExhdW5jaEtpbmQuVlNDb2RlTWFpblByb2Nlc3MsXG5cdFx0XHRtYWNoaW5lSWQ6ICdjbGllbnQtbWFjaGluZS1pZCcsXG5cdFx0XHRkZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHR9KSwge1xuXHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ2VkaXRvcl93aW5kb3cnLFxuXHRcdFx0aW5pdGlhdG9yQ29ubmVjdGlvbktpbmQ6ICdyZW1vdGVfZXh0ZW5zaW9uX2hvc3QnLFxuXHRcdFx0aW5pdGlhdG9yVHJhbnNwb3J0S2luZDogJ21lc3NhZ2VfcG9ydCcsXG5cdFx0XHRob3N0TGF1bmNoS2luZDogJ3ZzY29kZV9tYWluX3Byb2Nlc3MnLFxuXHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0aW5pdGlhdG9yRGV2RGV2aWNlSWQ6ICdjbGllbnQtZGV2LWRldmljZS1pZCcsXG5cdFx0XHRhZ2VudFNlc3Npb25JZDogJ2FnZW50LXNlc3Npb24taWQnLFxuXHRcdFx0Y2hhdFNlc3Npb25JZDogZ2V0VGVsZW1ldHJ5Q2hhdFNlc3Npb25JZChjaGF0KSxcblx0XHRcdHR1cm5JZDogJ3R1cm4taWQnLFxuXHRcdFx0c2RrU2Vzc2lvbklkOiAnc2RrLXNlc3Npb24taWQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNoZXMgc3ViYWdlbnQgY2hhdCBJRHMgd2l0aG91dCBwYXRoLWxpa2UgdGVsZW1ldHJ5IHZhbHVlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdhZ2VudC1zZXNzaW9uLWlkJyk7XG5cdFx0Y29uc3Qgc3ViYWdlbnQgPSBVUkkucGFyc2UoYnVpbGRTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvbiwgJ3Rvb2wtY2FsbC1pZCcpKTtcblx0XHRjb25zdCB2YWx1ZSA9IGdldFRlbGVtZXRyeUNoYXRTZXNzaW9uSWQoc3ViYWdlbnQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCBTdHJpbmcoTnVtYmVyKHZhbHVlKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5pbmNsdWRlcygnLycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgb25seSBhbGxvd2xpc3RlZCBDb3BpbG90IEFQSSBlbmRwb2ludHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRub3JtYWxpemVDb3BpbG90QXBpRW5kcG9pbnQoJy9jaGF0L2NvbXBsZXRpb25zJyksXG5cdFx0XHRub3JtYWxpemVDb3BpbG90QXBpRW5kcG9pbnQoJy9yZXNwb25zZXMnKSxcblx0XHRcdG5vcm1hbGl6ZUNvcGlsb3RBcGlFbmRwb2ludCgnL3YxL21lc3NhZ2VzJyksXG5cdFx0XHRub3JtYWxpemVDb3BpbG90QXBpRW5kcG9pbnQoJ3dzOi9yZXNwb25zZXMnKSxcblx0XHRcdG5vcm1hbGl6ZUNvcGlsb3RBcGlFbmRwb2ludCgnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20vcmVzcG9uc2VzJyksXG5cdFx0XHRub3JtYWxpemVDb3BpbG90QXBpRW5kcG9pbnQoJ2h0dHBzOi8vY29udG9zby5leGFtcGxlL3ByaXZhdGUvZGVwbG95bWVudCcpLFxuXHRcdFx0bm9ybWFsaXplQ29waWxvdEFwaUVuZHBvaW50KHVuZGVmaW5lZCksXG5cdFx0XSwgW1xuXHRcdFx0J2NoYXRDb21wbGV0aW9ucycsXG5cdFx0XHQncmVzcG9uc2VzJyxcblx0XHRcdCdhbnRocm9waWNNZXNzYWdlcycsXG5cdFx0XHQncmVzcG9uc2VzV2ViU29ja2V0Jyxcblx0XHRcdCdyZXNwb25zZXMnLFxuXHRcdFx0J290aGVyJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBib3VuZGVkIG1vZGVsIGNhbGwgZW5kcG9pbnQgY2F0ZWdvcmllcyBpbnN0ZWFkIG9mIHJhdyBlbmRwb2ludHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnYWdlbnQtc2Vzc2lvbi1pZCcpO1xuXHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKHNlc3Npb24sICdwZWVyLWNoYXQtaWQnKSk7XG5cdFx0Y29uc3QgY29ycmVsYXRpb24gPSBjcmVhdGVDb3BpbG90RmFpbHVyZUNvcnJlbGF0aW9uKHNlc3Npb24sIGNoYXQsICd0dXJuLWlkJywgJ3Nkay1zZXNzaW9uLWlkJyk7XG5cdFx0Y29uc3QgZXZlbnQ6IFNlc3Npb25FdmVudFBheWxvYWQ8J21vZGVsLmNhbGxfZmFpbHVyZSc+ID0ge1xuXHRcdFx0dHlwZTogJ21vZGVsLmNhbGxfZmFpbHVyZScsXG5cdFx0XHRpZDogJ2V2ZW50LTEnLFxuXHRcdFx0cGFyZW50SWQ6ICdwYXJlbnQtMScsXG5cdFx0XHRhZ2VudElkOiAnYWdlbnQtMScsXG5cdFx0XHR0aW1lc3RhbXA6ICcyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0ZXBoZW1lcmFsOiB0cnVlLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRzb3VyY2U6ICd0b3BfbGV2ZWwnLFxuXHRcdFx0XHRmYWlsdXJlS2luZDogJ2FwaScsXG5cdFx0XHRcdHRyYW5zcG9ydDogJ2h0dHAnLFxuXHRcdFx0XHRhcGlFbmRwb2ludDogJy9yZXNwb25zZXMnLFxuXHRcdFx0XHRzdGF0dXNDb2RlOiA1MDAsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IDQyLFxuXHRcdFx0XHRtb2RlbDogJ2dwdC01LjYtc29sJyxcblx0XHRcdFx0cmVhc29uaW5nRWZmb3J0OiAnaGlnaCcsXG5cdFx0XHRcdGlzQXV0bzogZmFsc2UsXG5cdFx0XHRcdGlzQnlvazogZmFsc2UsXG5cdFx0XHRcdHJ0ZTogdHJ1ZSxcblx0XHRcdFx0YmFkUmVxdWVzdEtpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0YXBpQ2FsbElkOiAnYXBpLWNhbGwtaWQnLFxuXHRcdFx0XHRwcm92aWRlckNhbGxJZDogJ3Byb3ZpZGVyLWNhbGwtaWQnLFxuXHRcdFx0XHRzZXJ2aWNlUmVxdWVzdElkOiAnc2VydmljZS1yZXF1ZXN0LWlkJyxcblx0XHRcdFx0cmVxdWVzdEZpbmdlcnByaW50OiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRyZXBvcnRDb3BpbG90TW9kZWxDYWxsRmFpbHVyZSh0ZWxlbWV0cnlTZXJ2aWNlLCBldmVudCwgY29ycmVsYXRpb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cywgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2FnZW50SG9zdC5jb3BpbG90TW9kZWxDYWxsRmFpbHVyZScsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiAnYWdlbnQtc2Vzc2lvbi1pZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IGdldFRlbGVtZXRyeUNoYXRTZXNzaW9uSWQoY2hhdCksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4taWQnLFxuXHRcdFx0XHRzZGtTZXNzaW9uSWQ6ICdzZGstc2Vzc2lvbi1pZCcsXG5cdFx0XHRcdHNka0V2ZW50SWQ6ICdldmVudC0xJyxcblx0XHRcdFx0c2RrUGFyZW50RXZlbnRJZDogJ3BhcmVudC0xJyxcblx0XHRcdFx0c2RrQWdlbnRJZDogJ2FnZW50LTEnLFxuXHRcdFx0XHRmYWlsdXJlS2luZDogJ2FwaScsXG5cdFx0XHRcdHNvdXJjZTogJ3RvcF9sZXZlbCcsXG5cdFx0XHRcdHRyYW5zcG9ydDogJ2h0dHAnLFxuXHRcdFx0XHRhcGlFbmRwb2ludDogJ3Jlc3BvbnNlcycsXG5cdFx0XHRcdHN0YXR1c0NvZGU6IDUwMCxcblx0XHRcdFx0ZHVyYXRpb25NczogNDIsXG5cdFx0XHRcdG1vZGVsOiAnZ3B0LTUuNi1zb2wnLFxuXHRcdFx0XHRyZWFzb25pbmdFZmZvcnQ6ICdoaWdoJyxcblx0XHRcdFx0aXNBdXRvOiBmYWxzZSxcblx0XHRcdFx0aXNCeW9rOiBmYWxzZSxcblx0XHRcdFx0cnRlOiB0cnVlLFxuXHRcdFx0XHRiYWRSZXF1ZXN0S2luZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRhcGlDYWxsSWQ6ICdhcGktY2FsbC1pZCcsXG5cdFx0XHRcdHByb3ZpZGVyQ2FsbElkOiAncHJvdmlkZXItY2FsbC1pZCcsXG5cdFx0XHRcdHNlcnZpY2VSZXF1ZXN0SWQ6ICdzZXJ2aWNlLXJlcXVlc3QtaWQnLFxuXHRcdFx0XHRtZXNzYWdlQ291bnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbENhbGxDb3VudDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZUNvdW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdG5hbWVsZXNzVG9vbENhbGxDb3VudDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbWFnZVBhcnRDb3VudDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbWFnZVBhcnRzTWlzc2luZ01lZGlhVHlwZTogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Ryb3BzIGVtcHR5IHByb3ZpZGVyIHJlcXVlc3QgaWRlbnRpZmllcnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkQWdlbnRFcnJvclRlbGVtZXRyeU1ldGEoe1xuXHRcdFx0ZXJyb3JUeXBlOiAndGVzdCcsXG5cdFx0XHRtZXNzYWdlOiAnZmFpbGVkJyxcblx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdGNoYXRFcnJvcjoge1xuXHRcdFx0XHRcdGZldGNoRXJyb3I6IHtcblx0XHRcdFx0XHRcdHJlcXVlc3RJZDogJycsXG5cdFx0XHRcdFx0XHRzZXJ2ZXJSZXF1ZXN0SWQ6ICcnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pLCB7XG5cdFx0XHRwcm92aWRlckNhbGxJZDogdW5kZWZpbmVkLFxuXHRcdFx0c2VydmljZVJlcXVlc3RJZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUE0QixzQkFBc0I7QUFDbEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQkFBK0IscUJBQXFCLDhCQUE4QjtBQUMzRixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGNBQWMsK0JBQStCO0FBQ3RELFNBQVMsOEJBQThCLGlDQUFpQyw2QkFBNkIscUNBQXFDO0FBRTFJLE1BQU0sMEJBQXVEO0FBQUEsRUFBN0Q7QUFFQyxTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQVk7QUFD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
