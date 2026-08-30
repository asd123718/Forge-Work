import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { AgentsWindowOpenSource } from "../../../../../platform/window/common/window.js";
import { TestLifecycleService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { ShutdownReason } from "../../../../../workbench/services/lifecycle/common/lifecycle.js";
import { FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS, SessionsWindowOpenTelemetry, SessionsWindowSessionStartTelemetry } from "../../browser/sessionsWindowOpenTelemetry.js";
function isTelemetryData(data) {
  return typeof data === "object" && data !== null;
}
class TestTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName, data) {
    if (eventName && isTelemetryData(data)) {
      this.events.push({ name: eventName, data });
    }
  }
}
suite("SessionsWindowOpenTelemetry", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("emits one window session start when initialized", () => {
    const telemetryService = new TestTelemetryService();
    new SessionsWindowSessionStartTelemetry(AgentsWindowOpenSource.TitleBar, false, telemetryService);
    assert.deepStrictEqual(telemetryService.events, [{
      name: "agents/windowSessionStart",
      data: { sessionStart: true, source: "titleBar", hasPreviouslyStartedSession: false }
    }]);
  });
  test("emits captured initial state and close duration for a quick close", async () => {
    await runWithFakedTimers({ useFakeTimers: true, startTime: 1e4 }, async () => {
      const lifecycleService = disposables.add(new TestLifecycleService());
      const telemetryService = new TestTelemetryService();
      let workspacePreselected = true;
      let workspacePreselectionSource = "existingSessions";
      const tracker = disposables.add(new SessionsWindowOpenTelemetry(
        AgentsWindowOpenSource.TitleBar,
        () => true,
        () => ({ workspacePreselected, workspacePreselectionSource }),
        telemetryService,
        lifecycleService
      ));
      tracker.captureInitialViewState();
      workspacePreselected = false;
      workspacePreselectionSource = "none";
      await timeout(4e3);
      lifecycleService.fireShutdown(ShutdownReason.CLOSE);
      assert.deepStrictEqual(telemetryService.events, [{
        name: "agents/firstTimeWindowOpen",
        data: {
          source: "titleBar",
          signInDialogShown: true,
          workspacePreselected: true,
          workspacePreselectionSource: "existingSessions",
          windowCloseDurationMs: 4e3,
          emissionReason: "close"
        }
      }]);
      tracker.dispose();
      lifecycleService.dispose();
    });
  });
  test("emits once after three minutes without a close duration", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const lifecycleService = disposables.add(new TestLifecycleService());
      const telemetryService = new TestTelemetryService();
      const tracker = disposables.add(new SessionsWindowOpenTelemetry(
        AgentsWindowOpenSource.CommandPalette,
        () => false,
        () => ({ workspacePreselected: void 0, workspacePreselectionSource: void 0 }),
        telemetryService,
        lifecycleService
      ));
      await timeout(FIRST_TIME_WINDOW_OPEN_DURATION_LIMIT_MS);
      lifecycleService.fireShutdown(ShutdownReason.CLOSE);
      assert.deepStrictEqual(telemetryService.events, [{
        name: "agents/firstTimeWindowOpen",
        data: {
          source: "commandPalette",
          signInDialogShown: false,
          workspacePreselected: void 0,
          workspacePreselectionSource: void 0,
          windowCloseDurationMs: void 0,
          emissionReason: "timer"
        }
      }]);
      tracker.dispose();
      lifecycleService.dispose();
    });
  });
  test("records lifecycle shutdown reasons exactly once", () => {
    const reasons = [
      [ShutdownReason.QUIT, "quit"],
      [ShutdownReason.RELOAD, "reload"],
      [ShutdownReason.LOAD, "otherShutdown"]
    ];
    for (const [shutdownReason, emissionReason] of reasons) {
      const lifecycleService = disposables.add(new TestLifecycleService());
      const telemetryService = new TestTelemetryService();
      const tracker = disposables.add(new SessionsWindowOpenTelemetry(
        AgentsWindowOpenSource.CommandPalette,
        () => false,
        () => ({ workspacePreselected: void 0, workspacePreselectionSource: void 0 }),
        telemetryService,
        lifecycleService
      ));
      lifecycleService.fireShutdown(shutdownReason);
      lifecycleService.fireShutdown(ShutdownReason.CLOSE);
      assert.strictEqual(telemetryService.events.length, 1);
      const event = telemetryService.events[0];
      assert.deepStrictEqual({
        name: event.name,
        source: Reflect.get(event.data, "source"),
        signInDialogShown: Reflect.get(event.data, "signInDialogShown"),
        workspacePreselected: Reflect.get(event.data, "workspacePreselected"),
        workspacePreselectionSource: Reflect.get(event.data, "workspacePreselectionSource"),
        emissionReason: Reflect.get(event.data, "emissionReason")
      }, {
        name: "agents/firstTimeWindowOpen",
        source: "commandPalette",
        signInDialogShown: false,
        workspacePreselected: void 0,
        workspacePreselectionSource: void 0,
        emissionReason
      });
      assert.strictEqual(
        typeof Reflect.get(event.data, "windowCloseDurationMs"),
        shutdownReason === ShutdownReason.QUIT ? "number" : "undefined"
      );
      tracker.dispose();
      lifecycleService.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXHRlc3RcXGJyb3dzZXJcXHNlc3Npb25zV2luZG93T3BlblRlbGVtZXRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBUZXN0TGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgU2h1dGRvd25SZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRklSU1RfVElNRV9XSU5ET1dfT1BFTl9EVVJBVElPTl9MSU1JVF9NUywgU2Vzc2lvbnNXaW5kb3dPcGVuVGVsZW1ldHJ5LCBTZXNzaW9uc1dpbmRvd1Nlc3Npb25TdGFydFRlbGVtZXRyeSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2Vzc2lvbnNXaW5kb3dPcGVuVGVsZW1ldHJ5LmpzJztcblxuZnVuY3Rpb24gaXNUZWxlbWV0cnlEYXRhKGRhdGE6IHVua25vd24pOiBkYXRhIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0cmV0dXJuIHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiBkYXRhICE9PSBudWxsO1xufVxuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBldmVudHM6IHsgcmVhZG9ubHkgbmFtZTogc3RyaW5nOyByZWFkb25seSBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9W10gPSBbXTtcblxuXHRvdmVycmlkZSBwdWJsaWNMb2cyKGV2ZW50TmFtZT86IHN0cmluZywgZGF0YT86IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAoZXZlbnROYW1lICYmIGlzVGVsZW1ldHJ5RGF0YShkYXRhKSkge1xuXHRcdFx0dGhpcy5ldmVudHMucHVzaCh7IG5hbWU6IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0XHR9XG5cdH1cbn1cblxuc3VpdGUoJ1Nlc3Npb25zV2luZG93T3BlblRlbGVtZXRyeScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2VtaXRzIG9uZSB3aW5kb3cgc2Vzc2lvbiBzdGFydCB3aGVuIGluaXRpYWxpemVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgVGVzdFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRuZXcgU2Vzc2lvbnNXaW5kb3dTZXNzaW9uU3RhcnRUZWxlbWV0cnkoQWdlbnRzV2luZG93T3BlblNvdXJjZS5UaXRsZUJhciwgZmFsc2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cywgW3tcblx0XHRcdG5hbWU6ICdhZ2VudHMvd2luZG93U2Vzc2lvblN0YXJ0Jyxcblx0XHRcdGRhdGE6IHsgc2Vzc2lvblN0YXJ0OiB0cnVlLCBzb3VyY2U6ICd0aXRsZUJhcicsIGhhc1ByZXZpb3VzbHlTdGFydGVkU2Vzc2lvbjogZmFsc2UgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIGNhcHR1cmVkIGluaXRpYWwgc3RhdGUgYW5kIGNsb3NlIGR1cmF0aW9uIGZvciBhIHF1aWNrIGNsb3NlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUsIHN0YXJ0VGltZTogMTBfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpZmVjeWNsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdFx0bGV0IHdvcmtzcGFjZVByZXNlbGVjdGVkID0gdHJ1ZTtcblx0XHRcdGxldCB3b3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UgPSAnZXhpc3RpbmdTZXNzaW9ucyc7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uc1dpbmRvd09wZW5UZWxlbWV0cnkoXG5cdFx0XHRcdEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuVGl0bGVCYXIsXG5cdFx0XHRcdCgpID0+IHRydWUsXG5cdFx0XHRcdCgpID0+ICh7IHdvcmtzcGFjZVByZXNlbGVjdGVkLCB3b3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UgfSksXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRcdGxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0XHQpKTtcblxuXHRcdFx0dHJhY2tlci5jYXB0dXJlSW5pdGlhbFZpZXdTdGF0ZSgpO1xuXHRcdFx0d29ya3NwYWNlUHJlc2VsZWN0ZWQgPSBmYWxzZTtcblx0XHRcdHdvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZSA9ICdub25lJztcblx0XHRcdGF3YWl0IHRpbWVvdXQoNF8wMDApO1xuXHRcdFx0bGlmZWN5Y2xlU2VydmljZS5maXJlU2h1dGRvd24oU2h1dGRvd25SZWFzb24uQ0xPU0UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbe1xuXHRcdFx0XHRuYW1lOiAnYWdlbnRzL2ZpcnN0VGltZVdpbmRvd09wZW4nLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0c291cmNlOiAndGl0bGVCYXInLFxuXHRcdFx0XHRcdHNpZ25JbkRpYWxvZ1Nob3duOiB0cnVlLFxuXHRcdFx0XHRcdHdvcmtzcGFjZVByZXNlbGVjdGVkOiB0cnVlLFxuXHRcdFx0XHRcdHdvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZTogJ2V4aXN0aW5nU2Vzc2lvbnMnLFxuXHRcdFx0XHRcdHdpbmRvd0Nsb3NlRHVyYXRpb25NczogNF8wMDAsXG5cdFx0XHRcdFx0ZW1pc3Npb25SZWFzb246ICdjbG9zZScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSk7XG5cdFx0XHR0cmFja2VyLmRpc3Bvc2UoKTtcblx0XHRcdGxpZmVjeWNsZVNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBvbmNlIGFmdGVyIHRocmVlIG1pbnV0ZXMgd2l0aG91dCBhIGNsb3NlIGR1cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGlmZWN5Y2xlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uc1dpbmRvd09wZW5UZWxlbWV0cnkoXG5cdFx0XHRcdEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdCgpID0+IGZhbHNlLFxuXHRcdFx0XHQoKSA9PiAoeyB3b3Jrc3BhY2VQcmVzZWxlY3RlZDogdW5kZWZpbmVkLCB3b3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2U6IHVuZGVmaW5lZCB9KSxcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdFx0bGlmZWN5Y2xlU2VydmljZSxcblx0XHRcdCkpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KEZJUlNUX1RJTUVfV0lORE9XX09QRU5fRFVSQVRJT05fTElNSVRfTVMpO1xuXHRcdFx0bGlmZWN5Y2xlU2VydmljZS5maXJlU2h1dGRvd24oU2h1dGRvd25SZWFzb24uQ0xPU0UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbe1xuXHRcdFx0XHRuYW1lOiAnYWdlbnRzL2ZpcnN0VGltZVdpbmRvd09wZW4nLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0c291cmNlOiAnY29tbWFuZFBhbGV0dGUnLFxuXHRcdFx0XHRcdHNpZ25JbkRpYWxvZ1Nob3duOiBmYWxzZSxcblx0XHRcdFx0XHR3b3Jrc3BhY2VQcmVzZWxlY3RlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHdvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHdpbmRvd0Nsb3NlRHVyYXRpb25NczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVtaXNzaW9uUmVhc29uOiAndGltZXInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pO1xuXHRcdFx0dHJhY2tlci5kaXNwb3NlKCk7XG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkcyBsaWZlY3ljbGUgc2h1dGRvd24gcmVhc29ucyBleGFjdGx5IG9uY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVhc29uczogcmVhZG9ubHkgW1NodXRkb3duUmVhc29uLCAncXVpdCcgfCAncmVsb2FkJyB8ICdvdGhlclNodXRkb3duJ11bXSA9IFtcblx0XHRcdFtTaHV0ZG93blJlYXNvbi5RVUlULCAncXVpdCddLFxuXHRcdFx0W1NodXRkb3duUmVhc29uLlJFTE9BRCwgJ3JlbG9hZCddLFxuXHRcdFx0W1NodXRkb3duUmVhc29uLkxPQUQsICdvdGhlclNodXRkb3duJ10sXG5cdFx0XTtcblxuXHRcdGZvciAoY29uc3QgW3NodXRkb3duUmVhc29uLCBlbWlzc2lvblJlYXNvbl0gb2YgcmVhc29ucykge1xuXHRcdFx0Y29uc3QgbGlmZWN5Y2xlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExpZmVjeWNsZVNlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IFRlc3RUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB0cmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uc1dpbmRvd09wZW5UZWxlbWV0cnkoXG5cdFx0XHRcdEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdCgpID0+IGZhbHNlLFxuXHRcdFx0XHQoKSA9PiAoeyB3b3Jrc3BhY2VQcmVzZWxlY3RlZDogdW5kZWZpbmVkLCB3b3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2U6IHVuZGVmaW5lZCB9KSxcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdFx0bGlmZWN5Y2xlU2VydmljZSxcblx0XHRcdCkpO1xuXG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLmZpcmVTaHV0ZG93bihzaHV0ZG93blJlYXNvbik7XG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLmZpcmVTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5DTE9TRSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSB0ZWxlbWV0cnlTZXJ2aWNlLmV2ZW50c1swXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRuYW1lOiBldmVudC5uYW1lLFxuXHRcdFx0XHRzb3VyY2U6IFJlZmxlY3QuZ2V0KGV2ZW50LmRhdGEsICdzb3VyY2UnKSxcblx0XHRcdFx0c2lnbkluRGlhbG9nU2hvd246IFJlZmxlY3QuZ2V0KGV2ZW50LmRhdGEsICdzaWduSW5EaWFsb2dTaG93bicpLFxuXHRcdFx0XHR3b3Jrc3BhY2VQcmVzZWxlY3RlZDogUmVmbGVjdC5nZXQoZXZlbnQuZGF0YSwgJ3dvcmtzcGFjZVByZXNlbGVjdGVkJyksXG5cdFx0XHRcdHdvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZTogUmVmbGVjdC5nZXQoZXZlbnQuZGF0YSwgJ3dvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZScpLFxuXHRcdFx0XHRlbWlzc2lvblJlYXNvbjogUmVmbGVjdC5nZXQoZXZlbnQuZGF0YSwgJ2VtaXNzaW9uUmVhc29uJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG5hbWU6ICdhZ2VudHMvZmlyc3RUaW1lV2luZG93T3BlbicsXG5cdFx0XHRcdHNvdXJjZTogJ2NvbW1hbmRQYWxldHRlJyxcblx0XHRcdFx0c2lnbkluRGlhbG9nU2hvd246IGZhbHNlLFxuXHRcdFx0XHR3b3Jrc3BhY2VQcmVzZWxlY3RlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR3b3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW1pc3Npb25SZWFzb24sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dHlwZW9mIFJlZmxlY3QuZ2V0KGV2ZW50LmRhdGEsICd3aW5kb3dDbG9zZUR1cmF0aW9uTXMnKSxcblx0XHRcdFx0c2h1dGRvd25SZWFzb24gPT09IFNodXRkb3duUmVhc29uLlFVSVQgPyAnbnVtYmVyJyA6ICd1bmRlZmluZWQnLFxuXHRcdFx0KTtcblx0XHRcdHRyYWNrZXIuZGlzcG9zZSgpO1xuXHRcdFx0bGlmZWN5Y2xlU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBDQUEwQyw2QkFBNkIsMkNBQTJDO0FBRTNILFNBQVMsZ0JBQWdCLE1BQWdEO0FBQ3hFLFNBQU8sT0FBTyxTQUFTLFlBQVks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
