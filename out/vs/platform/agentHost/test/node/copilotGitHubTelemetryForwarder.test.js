import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { CopilotGitHubTelemetryForwarder } from "../../node/copilot/copilotGitHubTelemetryForwarder.js";
class TestTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.USAGE;
    this.sendErrorTelemetry = true;
    this.sessionId = "sessionId";
    this.machineId = "machineId";
    this.sqmId = "sqmId";
    this.devDeviceId = "devDeviceId";
    this.firstSessionDate = "firstSessionDate";
    this.events = [];
  }
  publicLog(eventName, data) {
    this.events.push({ eventName, data });
  }
  publicLogError() {
  }
  publicLog2() {
  }
  publicLogError2() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite("CopilotGitHubTelemetryForwarder", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("forwards a standard event to VS Code telemetry", () => {
    const telemetryService = new TestTelemetryService();
    const forwarder = new CopilotGitHubTelemetryForwarder(() => false, () => void 0, telemetryService);
    forwarder.forward({
      sessionId: "notification-session",
      restricted: false,
      event: {
        kind: "tool_call_executed",
        created_at: "2026-07-10T12:00:00Z",
        model_call_id: "model-call",
        properties: { tool_name: "grep" },
        metrics: { duration_ms: 42 },
        exp_assignment_context: "experiment",
        features: { featureA: "enabled" },
        copilot_tracking_id: "tracking-id",
        client: {
          cli_version: "1.0.69",
          os_platform: "win32",
          os_version: "11",
          os_arch: "x64",
          node_version: "24.0.0",
          is_staff: true
        }
      }
    });
    assert.deepStrictEqual(telemetryService.events, [{
      eventName: "copilotSdk/tool_call_executed",
      data: {
        cli_version: "1.0.69",
        os_platform: "win32",
        os_version: "11",
        os_arch: "x64",
        node_version: "24.0.0",
        is_staff: true,
        tool_name: "grep",
        duration_ms: 42,
        created_at: "2026-07-10T12:00:00Z",
        model_call_id: "model-call",
        exp_assignment_context: "experiment",
        session_id: "notification-session",
        sdk_session_id: "notification-session",
        copilot_tracking_id: "tracking-id",
        kind: "tool_call_executed",
        restricted: false,
        "feature.featureA": "enabled"
      }
    }]);
  });
  test("gates restricted events on the restricted telemetry option", () => {
    const telemetryService = new TestTelemetryService();
    let restrictedTelemetryEnabled = false;
    const forwarder = new CopilotGitHubTelemetryForwarder(() => restrictedTelemetryEnabled, () => void 0, telemetryService);
    const notification = {
      sessionId: "session",
      restricted: true,
      event: {
        kind: "restricted_event",
        properties: {},
        metrics: {}
      }
    };
    forwarder.forward(notification);
    restrictedTelemetryEnabled = true;
    forwarder.forward(notification);
    assert.deepStrictEqual(telemetryService.events, [{
      eventName: "copilotSdk/restricted_event",
      data: {
        created_at: void 0,
        model_call_id: void 0,
        exp_assignment_context: void 0,
        session_id: "session",
        sdk_session_id: "session",
        copilot_tracking_id: void 0,
        kind: "restricted_event",
        restricted: true
      }
    }]);
  });
  test("stamps VS Code assignment context independently of the runtime context", () => {
    const telemetryService = new TestTelemetryService();
    const forwarder = new CopilotGitHubTelemetryForwarder(() => false, () => "experiment:1;experiment:2", telemetryService);
    forwarder.forward({
      sessionId: "session",
      restricted: false,
      event: {
        kind: "response.success",
        properties: {},
        metrics: {},
        exp_assignment_context: "runtime-context"
      }
    });
    assert.deepStrictEqual(telemetryService.events, [{
      eventName: "copilotSdk/response.success",
      data: {
        created_at: void 0,
        model_call_id: void 0,
        exp_assignment_context: "runtime-context",
        session_id: "session",
        sdk_session_id: "session",
        copilot_tracking_id: void 0,
        kind: "response.success",
        restricted: false,
        "abexp.assignmentcontext": "experiment:1;experiment:2"
      }
    }]);
  });
  test("adds Agent Host turn correlation only to response events", () => {
    const telemetryService = new TestTelemetryService();
    const forwarder = new CopilotGitHubTelemetryForwarder(() => false, () => void 0, telemetryService);
    const notification = (kind, properties = {}, metrics = {}) => ({
      sessionId: "session",
      restricted: false,
      event: {
        kind,
        properties,
        metrics
      }
    });
    forwarder.forward(notification("response.success", { turnId: "runtime-turn" }), "turn-1");
    forwarder.forward(notification("response.error", {}, { turnId: 42 }));
    forwarder.forward(notification("tool_call_executed", { turnId: "runtime-turn" }), "turn-1");
    forwarder.forward(notification("response.success", { turnId: "runtime-turn" }));
    assert.deepStrictEqual(telemetryService.events.map((event) => ({
      eventName: event.eventName,
      turnId: event.data?.turnId
    })), [
      { eventName: "copilotSdk/response.success", turnId: "turn-1" },
      { eventName: "copilotSdk/response.error", turnId: void 0 },
      { eventName: "copilotSdk/tool_call_executed", turnId: "runtime-turn" },
      { eventName: "copilotSdk/response.success", turnId: void 0 }
    ]);
  });
  test("forwards tool_call_executed outcome and token-count columns", () => {
    const telemetryService = new TestTelemetryService();
    const forwarder = new CopilotGitHubTelemetryForwarder(() => false, () => void 0, telemetryService);
    forwarder.forward({
      sessionId: "session",
      restricted: false,
      event: {
        kind: "tool_call_executed",
        properties: {
          tool_name: "grep",
          result_type: "SUCCESS",
          invoke_outcome: "success",
          model: "gpt-5.5",
          tool_call_id: "call-1"
        },
        metrics: {
          duration_ms: 12,
          result_token_count: 34
        }
      }
    });
    const event = telemetryService.events[0];
    assert.strictEqual(event.eventName, "copilotSdk/tool_call_executed");
    assert.strictEqual(event.data?.invoke_outcome, "success");
    assert.strictEqual(event.data?.result_type, "SUCCESS");
    assert.strictEqual(event.data?.result_token_count, 34);
    assert.strictEqual(event.data?.duration_ms, 12);
    assert.strictEqual(event.data?.tool_call_id, "call-1");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IEdpdEh1YlRlbGVtZXRyeU5vdGlmaWNhdGlvbiB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5RGF0YSwgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ29waWxvdEdpdEh1YlRlbGVtZXRyeUZvcndhcmRlciB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyLmpzJztcblxuaW50ZXJmYWNlIENhcHR1cmVkRXZlbnQge1xuXHRldmVudE5hbWU6IHN0cmluZztcblx0ZGF0YTogSVRlbGVtZXRyeURhdGEgfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIFRlc3RUZWxlbWV0cnlTZXJ2aWNlIGltcGxlbWVudHMgSVRlbGVtZXRyeVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSB0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRyZWFkb25seSBzZW5kRXJyb3JUZWxlbWV0cnkgPSB0cnVlO1xuXHRyZWFkb25seSBzZXNzaW9uSWQgPSAnc2Vzc2lvbklkJztcblx0cmVhZG9ubHkgbWFjaGluZUlkID0gJ21hY2hpbmVJZCc7XG5cdHJlYWRvbmx5IHNxbUlkID0gJ3NxbUlkJztcblx0cmVhZG9ubHkgZGV2RGV2aWNlSWQgPSAnZGV2RGV2aWNlSWQnO1xuXHRyZWFkb25seSBmaXJzdFNlc3Npb25EYXRlID0gJ2ZpcnN0U2Vzc2lvbkRhdGUnO1xuXHRyZWFkb25seSBldmVudHM6IENhcHR1cmVkRXZlbnRbXSA9IFtdO1xuXG5cdHB1YmxpY0xvZyhldmVudE5hbWU6IHN0cmluZywgZGF0YT86IElUZWxlbWV0cnlEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0fVxuXHRwdWJsaWNMb2dFcnJvcigpOiB2b2lkIHsgfVxuXHRwdWJsaWNMb2cyKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZ0Vycm9yMigpOiB2b2lkIHsgfVxuXHRzZXRFeHBlcmltZW50UHJvcGVydHkoKTogdm9pZCB7IH1cblx0c2V0Q29tbW9uUHJvcGVydHkoKTogdm9pZCB7IH1cbn1cblxuc3VpdGUoJ0NvcGlsb3RHaXRIdWJUZWxlbWV0cnlGb3J3YXJkZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGEgc3RhbmRhcmQgZXZlbnQgdG8gVlMgQ29kZSB0ZWxlbWV0cnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IGZvcndhcmRlciA9IG5ldyBDb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyKCgpID0+IGZhbHNlLCAoKSA9PiB1bmRlZmluZWQsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Zm9yd2FyZGVyLmZvcndhcmQoe1xuXHRcdFx0c2Vzc2lvbklkOiAnbm90aWZpY2F0aW9uLXNlc3Npb24nLFxuXHRcdFx0cmVzdHJpY3RlZDogZmFsc2UsXG5cdFx0XHRldmVudDoge1xuXHRcdFx0XHRraW5kOiAndG9vbF9jYWxsX2V4ZWN1dGVkJyxcblx0XHRcdFx0Y3JlYXRlZF9hdDogJzIwMjYtMDctMTBUMTI6MDA6MDBaJyxcblx0XHRcdFx0bW9kZWxfY2FsbF9pZDogJ21vZGVsLWNhbGwnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7IHRvb2xfbmFtZTogJ2dyZXAnIH0sXG5cdFx0XHRcdG1ldHJpY3M6IHsgZHVyYXRpb25fbXM6IDQyIH0sXG5cdFx0XHRcdGV4cF9hc3NpZ25tZW50X2NvbnRleHQ6ICdleHBlcmltZW50Jyxcblx0XHRcdFx0ZmVhdHVyZXM6IHsgZmVhdHVyZUE6ICdlbmFibGVkJyB9LFxuXHRcdFx0XHRjb3BpbG90X3RyYWNraW5nX2lkOiAndHJhY2tpbmctaWQnLFxuXHRcdFx0XHRjbGllbnQ6IHtcblx0XHRcdFx0XHRjbGlfdmVyc2lvbjogJzEuMC42OScsXG5cdFx0XHRcdFx0b3NfcGxhdGZvcm06ICd3aW4zMicsXG5cdFx0XHRcdFx0b3NfdmVyc2lvbjogJzExJyxcblx0XHRcdFx0XHRvc19hcmNoOiAneDY0Jyxcblx0XHRcdFx0XHRub2RlX3ZlcnNpb246ICcyNC4wLjAnLFxuXHRcdFx0XHRcdGlzX3N0YWZmOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVsZW1ldHJ5U2VydmljZS5ldmVudHMsIFt7XG5cdFx0XHRldmVudE5hbWU6ICdjb3BpbG90U2RrL3Rvb2xfY2FsbF9leGVjdXRlZCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGNsaV92ZXJzaW9uOiAnMS4wLjY5Jyxcblx0XHRcdFx0b3NfcGxhdGZvcm06ICd3aW4zMicsXG5cdFx0XHRcdG9zX3ZlcnNpb246ICcxMScsXG5cdFx0XHRcdG9zX2FyY2g6ICd4NjQnLFxuXHRcdFx0XHRub2RlX3ZlcnNpb246ICcyNC4wLjAnLFxuXHRcdFx0XHRpc19zdGFmZjogdHJ1ZSxcblx0XHRcdFx0dG9vbF9uYW1lOiAnZ3JlcCcsXG5cdFx0XHRcdGR1cmF0aW9uX21zOiA0Mixcblx0XHRcdFx0Y3JlYXRlZF9hdDogJzIwMjYtMDctMTBUMTI6MDA6MDBaJyxcblx0XHRcdFx0bW9kZWxfY2FsbF9pZDogJ21vZGVsLWNhbGwnLFxuXHRcdFx0XHRleHBfYXNzaWdubWVudF9jb250ZXh0OiAnZXhwZXJpbWVudCcsXG5cdFx0XHRcdHNlc3Npb25faWQ6ICdub3RpZmljYXRpb24tc2Vzc2lvbicsXG5cdFx0XHRcdHNka19zZXNzaW9uX2lkOiAnbm90aWZpY2F0aW9uLXNlc3Npb24nLFxuXHRcdFx0XHRjb3BpbG90X3RyYWNraW5nX2lkOiAndHJhY2tpbmctaWQnLFxuXHRcdFx0XHRraW5kOiAndG9vbF9jYWxsX2V4ZWN1dGVkJyxcblx0XHRcdFx0cmVzdHJpY3RlZDogZmFsc2UsXG5cdFx0XHRcdCdmZWF0dXJlLmZlYXR1cmVBJzogJ2VuYWJsZWQnLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dhdGVzIHJlc3RyaWN0ZWQgZXZlbnRzIG9uIHRoZSByZXN0cmljdGVkIHRlbGVtZXRyeSBvcHRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGxldCByZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGZvcndhcmRlciA9IG5ldyBDb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyKCgpID0+IHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkLCAoKSA9PiB1bmRlZmluZWQsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbjogR2l0SHViVGVsZW1ldHJ5Tm90aWZpY2F0aW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbicsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZXZlbnQ6IHtcblx0XHRcdFx0a2luZDogJ3Jlc3RyaWN0ZWRfZXZlbnQnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7fSxcblx0XHRcdFx0bWV0cmljczoge30sXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRmb3J3YXJkZXIuZm9yd2FyZChub3RpZmljYXRpb24pO1xuXHRcdHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkID0gdHJ1ZTtcblx0XHRmb3J3YXJkZXIuZm9yd2FyZChub3RpZmljYXRpb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cywgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2NvcGlsb3RTZGsvcmVzdHJpY3RlZF9ldmVudCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGNyZWF0ZWRfYXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZWxfY2FsbF9pZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRleHBfYXNzaWdubWVudF9jb250ZXh0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlc3Npb25faWQ6ICdzZXNzaW9uJyxcblx0XHRcdFx0c2RrX3Nlc3Npb25faWQ6ICdzZXNzaW9uJyxcblx0XHRcdFx0Y29waWxvdF90cmFja2luZ19pZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRraW5kOiAncmVzdHJpY3RlZF9ldmVudCcsXG5cdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhbXBzIFZTIENvZGUgYXNzaWdubWVudCBjb250ZXh0IGluZGVwZW5kZW50bHkgb2YgdGhlIHJ1bnRpbWUgY29udGV4dCcsICgpID0+IHtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZm9yd2FyZGVyID0gbmV3IENvcGlsb3RHaXRIdWJUZWxlbWV0cnlGb3J3YXJkZXIoKCkgPT4gZmFsc2UsICgpID0+ICdleHBlcmltZW50OjE7ZXhwZXJpbWVudDoyJywgdGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRmb3J3YXJkZXIuZm9yd2FyZCh7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uJyxcblx0XHRcdHJlc3RyaWN0ZWQ6IGZhbHNlLFxuXHRcdFx0ZXZlbnQ6IHtcblx0XHRcdFx0a2luZDogJ3Jlc3BvbnNlLnN1Y2Nlc3MnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7fSxcblx0XHRcdFx0bWV0cmljczoge30sXG5cdFx0XHRcdGV4cF9hc3NpZ25tZW50X2NvbnRleHQ6ICdydW50aW1lLWNvbnRleHQnLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVsZW1ldHJ5U2VydmljZS5ldmVudHMsIFt7XG5cdFx0XHRldmVudE5hbWU6ICdjb3BpbG90U2RrL3Jlc3BvbnNlLnN1Y2Nlc3MnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRjcmVhdGVkX2F0OiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGVsX2NhbGxfaWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXhwX2Fzc2lnbm1lbnRfY29udGV4dDogJ3J1bnRpbWUtY29udGV4dCcsXG5cdFx0XHRcdHNlc3Npb25faWQ6ICdzZXNzaW9uJyxcblx0XHRcdFx0c2RrX3Nlc3Npb25faWQ6ICdzZXNzaW9uJyxcblx0XHRcdFx0Y29waWxvdF90cmFja2luZ19pZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRraW5kOiAncmVzcG9uc2Uuc3VjY2VzcycsXG5cdFx0XHRcdHJlc3RyaWN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHQnYWJleHAuYXNzaWdubWVudGNvbnRleHQnOiAnZXhwZXJpbWVudDoxO2V4cGVyaW1lbnQ6MicsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkcyBBZ2VudCBIb3N0IHR1cm4gY29ycmVsYXRpb24gb25seSB0byByZXNwb25zZSBldmVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IGZvcndhcmRlciA9IG5ldyBDb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyKCgpID0+IGZhbHNlLCAoKSA9PiB1bmRlZmluZWQsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IChraW5kOiBzdHJpbmcsIHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fSwgbWV0cmljczogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9KTogR2l0SHViVGVsZW1ldHJ5Tm90aWZpY2F0aW9uID0+ICh7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uJyxcblx0XHRcdHJlc3RyaWN0ZWQ6IGZhbHNlLFxuXHRcdFx0ZXZlbnQ6IHtcblx0XHRcdFx0a2luZCxcblx0XHRcdFx0cHJvcGVydGllcyxcblx0XHRcdFx0bWV0cmljcyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRmb3J3YXJkZXIuZm9yd2FyZChub3RpZmljYXRpb24oJ3Jlc3BvbnNlLnN1Y2Nlc3MnLCB7IHR1cm5JZDogJ3J1bnRpbWUtdHVybicgfSksICd0dXJuLTEnKTtcblx0XHRmb3J3YXJkZXIuZm9yd2FyZChub3RpZmljYXRpb24oJ3Jlc3BvbnNlLmVycm9yJywge30sIHsgdHVybklkOiA0MiB9KSk7XG5cdFx0Zm9yd2FyZGVyLmZvcndhcmQobm90aWZpY2F0aW9uKCd0b29sX2NhbGxfZXhlY3V0ZWQnLCB7IHR1cm5JZDogJ3J1bnRpbWUtdHVybicgfSksICd0dXJuLTEnKTtcblx0XHRmb3J3YXJkZXIuZm9yd2FyZChub3RpZmljYXRpb24oJ3Jlc3BvbnNlLnN1Y2Nlc3MnLCB7IHR1cm5JZDogJ3J1bnRpbWUtdHVybicgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdGV2ZW50TmFtZTogZXZlbnQuZXZlbnROYW1lLFxuXHRcdFx0dHVybklkOiBldmVudC5kYXRhPy50dXJuSWQsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IGV2ZW50TmFtZTogJ2NvcGlsb3RTZGsvcmVzcG9uc2Uuc3VjY2VzcycsIHR1cm5JZDogJ3R1cm4tMScgfSxcblx0XHRcdHsgZXZlbnROYW1lOiAnY29waWxvdFNkay9yZXNwb25zZS5lcnJvcicsIHR1cm5JZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGV2ZW50TmFtZTogJ2NvcGlsb3RTZGsvdG9vbF9jYWxsX2V4ZWN1dGVkJywgdHVybklkOiAncnVudGltZS10dXJuJyB9LFxuXHRcdFx0eyBldmVudE5hbWU6ICdjb3BpbG90U2RrL3Jlc3BvbnNlLnN1Y2Nlc3MnLCB0dXJuSWQ6IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyB0b29sX2NhbGxfZXhlY3V0ZWQgb3V0Y29tZSBhbmQgdG9rZW4tY291bnQgY29sdW1ucycsICgpID0+IHtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZm9yd2FyZGVyID0gbmV3IENvcGlsb3RHaXRIdWJUZWxlbWV0cnlGb3J3YXJkZXIoKCkgPT4gZmFsc2UsICgpID0+IHVuZGVmaW5lZCwgdGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRmb3J3YXJkZXIuZm9yd2FyZCh7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uJyxcblx0XHRcdHJlc3RyaWN0ZWQ6IGZhbHNlLFxuXHRcdFx0ZXZlbnQ6IHtcblx0XHRcdFx0a2luZDogJ3Rvb2xfY2FsbF9leGVjdXRlZCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHR0b29sX25hbWU6ICdncmVwJyxcblx0XHRcdFx0XHRyZXN1bHRfdHlwZTogJ1NVQ0NFU1MnLFxuXHRcdFx0XHRcdGludm9rZV9vdXRjb21lOiAnc3VjY2VzcycsXG5cdFx0XHRcdFx0bW9kZWw6ICdncHQtNS41Jyxcblx0XHRcdFx0XHR0b29sX2NhbGxfaWQ6ICdjYWxsLTEnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZXRyaWNzOiB7XG5cdFx0XHRcdFx0ZHVyYXRpb25fbXM6IDEyLFxuXHRcdFx0XHRcdHJlc3VsdF90b2tlbl9jb3VudDogMzQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSB0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50c1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuZXZlbnROYW1lLCAnY29waWxvdFNkay90b29sX2NhbGxfZXhlY3V0ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuZGF0YT8uaW52b2tlX291dGNvbWUsICdzdWNjZXNzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmRhdGE/LnJlc3VsdF90eXBlLCAnU1VDQ0VTUycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5kYXRhPy5yZXN1bHRfdG9rZW5fY291bnQsIDM0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuZGF0YT8uZHVyYXRpb25fbXMsIDEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuZGF0YT8u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
