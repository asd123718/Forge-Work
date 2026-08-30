import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { Emitter } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { AutomationSchedulerCore, CRASH_RECOVERY_REASON, RUN_TIMEOUT_REASON_PREFIX } from "../../browser/automationScheduler.js";
import { AutomationService } from "../../browser/automationService.js";
import { createAutomationService, TestAutomationStorageService } from "./automationTestUtils.js";
const FOLDER = URI.parse("file:///workspace");
const TARGET = { kind: "workspace", folderUri: FOLDER, isolation: { kind: "default" } };
const SESSION_RESOURCE = URI.parse("vscode-chat-session://copilot/sess-1");
class FakeLeaderElection {
  constructor(initial = true) {
    this.instanceId = "fake-leader-window";
    this._isLeader = observableValue(this, initial);
    this.isLeader = this._isLeader;
  }
  set(value) {
    this._isLeader.set(value, void 0);
  }
  evaluateForTesting() {
  }
  dispose() {
  }
}
class RecordingRecoveryAutomationService extends AutomationService {
  constructor() {
    super(...arguments);
    this.recoveryLifecycle = [];
  }
  async startStaleRunRecovery(reason) {
    this.recoveryLifecycle.push(`start:${reason}`);
    await super.startStaleRunRecovery(reason);
  }
  stopStaleRunRecovery() {
    this.recoveryLifecycle.push("stop");
    super.stopStaleRunRecovery();
  }
}
class RecordingRunner {
  constructor(service) {
    this.service = service;
    this.runs = [];
  }
  runOnce(automation, trigger, leaderWindowId, _token) {
    this.runs.push({ automationId: automation.id, trigger });
    const operation = (async () => {
      const claim = await this.service.recordRunStart(automation.id, trigger, leaderWindowId);
      if (!claim.claimed) {
        return { kind: "alreadyRunning", activeRun: claim.run };
      }
      const run = await this.service.updateRun(claim.run.id, { status: "completed" }) ?? claim.run;
      return { kind: "started", run, sessionResource: SESSION_RESOURCE };
    })();
    return {
      whenDispatched: operation,
      whenCompleted: operation.then(() => void 0)
    };
  }
}
class SkippingRunner {
  constructor() {
    this.runs = [];
  }
  runOnce(automation, trigger) {
    this.runs.push({ automationId: automation.id, trigger });
    return {
      whenDispatched: Promise.resolve({ kind: "notStarted", reason: "targetUnavailable" }),
      whenCompleted: Promise.resolve()
    };
  }
}
function hourly() {
  return { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}
const T0 = /* @__PURE__ */ new Date("2025-06-01T00:00:00Z");
const T_PAST_DUE = /* @__PURE__ */ new Date("2025-06-01T02:00:00Z");
const T_TOMORROW = /* @__PURE__ */ new Date("2025-06-02T04:00:00Z");
suite("AutomationSchedulerCore", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  function setup() {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    const runner = new RecordingRunner(service);
    const leader = new FakeLeaderElection(false);
    let now = T0;
    service.setClockForTesting(() => now);
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => now
    }));
    return {
      service,
      runner,
      leader,
      core,
      setNow: (d) => {
        now = d;
      }
    };
  }
  test("does not run anything if there are no automations", async () => {
    const { core, runner, leader } = setup();
    leader.set(true);
    await core.waitForPendingRuns();
    await core.tickForTesting();
    assert.deepStrictEqual(runner.runs, []);
  });
  test("on becoming leader, runs catch-up for due automations exactly once", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 1);
    assert.strictEqual(runner.runs[0].automationId, a.id);
    assert.strictEqual(runner.runs[0].trigger, "catch_up");
  });
  test("delayed scheduled ticks use trigger=schedule", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 1, "first run should be catch-up");
    setNow(T_TOMORROW);
    await core.tickForTesting();
    assert.strictEqual(runner.runs.length, 2);
    assert.strictEqual(runner.runs[1].trigger, "schedule");
  });
  test("disabled automations are not dispatched", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    await service.updateAutomation(a.id, { enabled: false });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    await core.tickForTesting();
    assert.deepStrictEqual(runner.runs, []);
  });
  test("advances nextRunAt so the same automation is not picked up again on the next tick", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 1);
    await core.tickForTesting();
    assert.strictEqual(runner.runs.length, 1);
    const updated = service.getAutomation(a.id);
    assert.ok(updated?.nextRunAt);
    const next = Date.parse(updated.nextRunAt);
    assert.ok(next > T_PAST_DUE.getTime(), "nextRunAt should be after the tick that just fired");
  });
  test("does not report a run until the runner records its claim", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    service.setClockForTesting(() => T0);
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const leader = new FakeLeaderElection(false);
    const runner = new SkippingRunner();
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => T_PAST_DUE
    }));
    leader.set(true);
    await core.waitForPendingRuns();
    assert.deepStrictEqual({
      dispatches: runner.runs.length,
      lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
      nextRunAt: service.getAutomation(automation.id)?.nextRunAt,
      runCount: service.runs.get().length
    }, {
      dispatches: 1,
      lastRunAt: void 0,
      nextRunAt: automation.nextRunAt,
      runCount: 0
    });
  });
  test("retries a still-due automation when target availability changes", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    service.setClockForTesting(() => T0);
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const runner = new SkippingRunner();
    const leader = new FakeLeaderElection(false);
    const onDidChangeTargetAvailability = teardown.add(new Emitter());
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => T_PAST_DUE,
      onDidChangeTargetAvailability: onDidChangeTargetAvailability.event
    }));
    leader.set(true);
    await core.waitForPendingRuns();
    onDidChangeTargetAvailability.fire();
    await core.waitForPendingRuns();
    assert.deepStrictEqual({
      dispatches: runner.runs,
      lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
      nextRunAt: service.getAutomation(automation.id)?.nextRunAt
    }, {
      dispatches: [
        { automationId: automation.id, trigger: "catch_up" },
        { automationId: automation.id, trigger: "schedule" }
      ],
      lastRunAt: void 0,
      nextRunAt: automation.nextRunAt
    });
  });
  test("does nothing while not leader", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    await core.waitForPendingRuns();
    await core.tickForTesting();
    assert.strictEqual(runner.runs.length, 0);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 1);
    assert.strictEqual(runner.runs[0].trigger, "catch_up");
  });
  test("on becoming leader, fails any leftover pending/running runs as crash recovery", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const firstService = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    firstService.setClockForTesting(() => T0);
    const a = await firstService.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const run = (await firstService.recordRunStart(a.id, "manual", 1)).run;
    firstService.dispose();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    service.setClockForTesting(() => T0);
    const runner = new RecordingRunner(service);
    const leader = new FakeLeaderElection(true);
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => T0
    }));
    await core.waitForPendingRuns();
    const recovered = service.runs.get().find((r) => r.id === run.id);
    assert.strictEqual(recovered?.status, "failed");
    assert.strictEqual(recovered?.errorMessage, CRASH_RECOVERY_REASON);
  });
  test("losing then regaining leadership re-runs catch-up", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs[0].trigger, "catch_up");
    leader.set(false);
    await core.waitForPendingRuns();
    setNow(T_TOMORROW);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 2);
    assert.strictEqual(runner.runs[1].trigger, "catch_up");
  });
  test("leadership transitions activate and deactivate stale-run recovery", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(new RecordingRecoveryAutomationService(storage, log, NullTelemetryService, new TestAutomationStorageService(storage)));
    const leader = new FakeLeaderElection(false);
    const core = teardown.add(new AutomationSchedulerCore(service, new RecordingRunner(service), storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => T0
    }));
    leader.set(true);
    await core.waitForPendingRuns();
    leader.set(false);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.deepStrictEqual(service.recoveryLifecycle, [
      "stop",
      `start:${CRASH_RECOVERY_REASON}`,
      "stop",
      `start:${CRASH_RECOVERY_REASON}`
    ]);
  });
  test("toggling the feature setting off then on does not crash-recover in-progress runs", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    service.setClockForTesting(() => T0);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const inFlight = (await service.recordRunStart(a.id, "schedule", 1)).run;
    const runner = new RecordingRunner(service);
    const leader = new FakeLeaderElection(true);
    let enabled = true;
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => T0,
      isFeatureEnabled: () => enabled
    }));
    await core.waitForPendingRuns();
    await service.updateRun(inFlight.id, { status: "running" });
    enabled = false;
    await core.tickForTesting();
    enabled = true;
    await core.tickForTesting();
    const after = service.runs.get().find((r) => r.id === inFlight.id);
    assert.strictEqual(after?.status, "running", "feature-toggle off/on must not fail in-flight runs");
  });
  test("runOneWithTimeout: a hung run is cancelled, marked failed, and the next due automation still fires", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    let now = T0;
    service.setClockForTesting(() => now);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const b = await service.createAutomation({ name: "B", prompt: "q", schedule: hourly(), target: TARGET });
    let hungAutomationId;
    class HangingRunner {
      constructor() {
        this.hung = new DeferredPromise();
        this.calls = 0;
        this.cancelObserved = false;
      }
      runOnce(automation, trigger, leaderWindowId, token) {
        this.calls++;
        const whenCompleted = this._run(automation, trigger, leaderWindowId, token);
        return {
          whenDispatched: Promise.resolve({ kind: "notStarted", reason: "error" }),
          whenCompleted
        };
      }
      async _run(automation, trigger, leaderWindowId, token) {
        if (this.calls === 1) {
          hungAutomationId = automation.id;
          await service.recordRunStart(automation.id, trigger, leaderWindowId);
          const listener = token?.onCancellationRequested(() => {
            this.cancelObserved = true;
            const active = service.getActiveRunFor(automation.id);
            if (active) {
              void service.updateRun(active.id, {
                status: "failed",
                errorMessage: "Cancelled"
              });
            }
            this.hung.complete();
          });
          try {
            await this.hung.p;
          } finally {
            listener?.dispose();
          }
          return;
        }
        await service.recordRunStart(automation.id, trigger, leaderWindowId);
      }
    }
    const runner = new HangingRunner();
    const leader = new FakeLeaderElection(false);
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => now,
      getRunTimeoutMs: () => 50
    }));
    now = T_PAST_DUE;
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.calls, 2, "both A and B should have been dispatched");
    assert.strictEqual(runner.cancelObserved, true, "runner should observe cancellation on timeout");
    assert.ok(hungAutomationId, "runner should have recorded a hung automation id");
    const otherId = hungAutomationId === a.id ? b.id : a.id;
    const hungRun = service.runs.get().find((r) => r.automationId === hungAutomationId);
    assert.strictEqual(hungRun?.status, "failed");
    assert.ok(hungRun?.errorMessage?.startsWith(RUN_TIMEOUT_REASON_PREFIX), `expected timeout marker, got: ${hungRun?.errorMessage}`);
    const otherRun = service.runs.get().find((r) => r.automationId === otherId);
    assert.notStrictEqual(otherRun?.status, "failed");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXHRlc3RcXGJyb3dzZXJcXGF1dG9tYXRpb25TY2hlZHVsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbkxlYWRlckVsZWN0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uTGVhZGVyRWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25SdW5EaXNwYXRjaCwgSUF1dG9tYXRpb25SdW5uZXIsIElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblJ1bm5lci5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uU2NoZWR1bGVyQ29yZSwgQ1JBU0hfUkVDT1ZFUllfUkVBU09OLCBSVU5fVElNRU9VVF9SRUFTT05fUFJFRklYIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uUnVuVHJpZ2dlciwgQXV0b21hdGlvblRhcmdldCwgSUF1dG9tYXRpb25EZXNjcmlwdG9yLCBJQXV0b21hdGlvblNjaGVkdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBdXRvbWF0aW9uU2VydmljZSwgVGVzdEF1dG9tYXRpb25TdG9yYWdlU2VydmljZSB9IGZyb20gJy4vYXV0b21hdGlvblRlc3RVdGlscy5qcyc7XG5cbmNvbnN0IEZPTERFUiA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UnKTtcbmNvbnN0IFRBUkdFVDogQXV0b21hdGlvblRhcmdldCA9IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfTtcbmNvbnN0IFNFU1NJT05fUkVTT1VSQ0UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9jb3BpbG90L3Nlc3MtMScpO1xuXG5jbGFzcyBGYWtlTGVhZGVyRWxlY3Rpb24gaW1wbGVtZW50cyBJQXV0b21hdGlvbkxlYWRlckVsZWN0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNMZWFkZXI6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGlzTGVhZGVyOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgaW5zdGFuY2VJZCA9ICdmYWtlLWxlYWRlci13aW5kb3cnO1xuXG5cdGNvbnN0cnVjdG9yKGluaXRpYWwgPSB0cnVlKSB7XG5cdFx0dGhpcy5faXNMZWFkZXIgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgaW5pdGlhbCk7XG5cdFx0dGhpcy5pc0xlYWRlciA9IHRoaXMuX2lzTGVhZGVyO1xuXHR9XG5cblx0c2V0KHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faXNMZWFkZXIuc2V0KHZhbHVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0ZXZhbHVhdGVGb3JUZXN0aW5nKCk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdGRpc3Bvc2UoKTogdm9pZCB7IC8qIG5vLW9wICovIH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nUmVjb3ZlcnlBdXRvbWF0aW9uU2VydmljZSBleHRlbmRzIEF1dG9tYXRpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgcmVjb3ZlcnlMaWZlY3ljbGU6IHN0cmluZ1tdID0gW107XG5cblx0b3ZlcnJpZGUgYXN5bmMgc3RhcnRTdGFsZVJ1blJlY292ZXJ5KHJlYXNvbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5yZWNvdmVyeUxpZmVjeWNsZS5wdXNoKGBzdGFydDoke3JlYXNvbn1gKTtcblx0XHRhd2FpdCBzdXBlci5zdGFydFN0YWxlUnVuUmVjb3ZlcnkocmVhc29uKTtcblx0fVxuXG5cdG92ZXJyaWRlIHN0b3BTdGFsZVJ1blJlY292ZXJ5KCk6IHZvaWQge1xuXHRcdHRoaXMucmVjb3ZlcnlMaWZlY3ljbGUucHVzaCgnc3RvcCcpO1xuXHRcdHN1cGVyLnN0b3BTdGFsZVJ1blJlY292ZXJ5KCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIFJlY29yZGVkUnVuIHtcblx0cmVhZG9ubHkgYXV0b21hdGlvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyO1xufVxuXG5jbGFzcyBSZWNvcmRpbmdSdW5uZXIgaW1wbGVtZW50cyBJQXV0b21hdGlvblJ1bm5lciB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHJ1bnM6IFJlY29yZGVkUnVuW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHNlcnZpY2U6IEF1dG9tYXRpb25TZXJ2aWNlKSB7IH1cblxuXHRydW5PbmNlKFxuXHRcdGF1dG9tYXRpb246IElBdXRvbWF0aW9uRGVzY3JpcHRvcixcblx0XHR0cmlnZ2VyOiBBdXRvbWF0aW9uUnVuVHJpZ2dlcixcblx0XHRsZWFkZXJXaW5kb3dJZDogbnVtYmVyLFxuXHRcdF90b2tlbj86IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBJQXV0b21hdGlvblJ1bk9wZXJhdGlvbiB7XG5cdFx0dGhpcy5ydW5zLnB1c2goeyBhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQsIHRyaWdnZXIgfSk7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNsYWltID0gYXdhaXQgdGhpcy5zZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb24uaWQsIHRyaWdnZXIsIGxlYWRlcldpbmRvd0lkKTtcblx0XHRcdGlmICghY2xhaW0uY2xhaW1lZCkge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWxyZWFkeVJ1bm5pbmcnLCBhY3RpdmVSdW46IGNsYWltLnJ1biB9IHNhdGlzZmllcyBJQXV0b21hdGlvblJ1bkRpc3BhdGNoO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcnVuID0gYXdhaXQgdGhpcy5zZXJ2aWNlLnVwZGF0ZVJ1bihjbGFpbS5ydW4uaWQsIHsgc3RhdHVzOiAnY29tcGxldGVkJyB9KSA/PyBjbGFpbS5ydW47XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnc3RhcnRlZCcsIHJ1biwgc2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFIH0gc2F0aXNmaWVzIElBdXRvbWF0aW9uUnVuRGlzcGF0Y2g7XG5cdFx0fSkoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d2hlbkRpc3BhdGNoZWQ6IG9wZXJhdGlvbixcblx0XHRcdHdoZW5Db21wbGV0ZWQ6IG9wZXJhdGlvbi50aGVuKCgpID0+IHVuZGVmaW5lZCksXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBTa2lwcGluZ1J1bm5lciBpbXBsZW1lbnRzIElBdXRvbWF0aW9uUnVubmVyIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgcnVuczogUmVjb3JkZWRSdW5bXSA9IFtdO1xuXG5cdHJ1bk9uY2UoYXV0b21hdGlvbjogSUF1dG9tYXRpb25EZXNjcmlwdG9yLCB0cmlnZ2VyOiBBdXRvbWF0aW9uUnVuVHJpZ2dlcik6IElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIHtcblx0XHR0aGlzLnJ1bnMucHVzaCh7IGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCwgdHJpZ2dlciB9KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d2hlbkRpc3BhdGNoZWQ6IFByb21pc2UucmVzb2x2ZSh7IGtpbmQ6ICdub3RTdGFydGVkJywgcmVhc29uOiAndGFyZ2V0VW5hdmFpbGFibGUnIH0pLFxuXHRcdFx0d2hlbkNvbXBsZXRlZDogUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiBob3VybHkoKTogSUF1dG9tYXRpb25TY2hlZHVsZSB7XG5cdHJldHVybiB7IGludGVydmFsOiAnaG91cmx5Jywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfTtcbn1cblxuY29uc3QgVDAgPSBuZXcgRGF0ZSgnMjAyNS0wNi0wMVQwMDowMDowMFonKTtcbmNvbnN0IFRfUEFTVF9EVUUgPSBuZXcgRGF0ZSgnMjAyNS0wNi0wMVQwMjowMDowMFonKTtcbmNvbnN0IFRfVE9NT1JST1cgPSBuZXcgRGF0ZSgnMjAyNS0wNi0wMlQwNDowMDowMFonKTtcblxuc3VpdGUoJ0F1dG9tYXRpb25TY2hlZHVsZXJDb3JlJywgKCkgPT4ge1xuXG5cdGNvbnN0IHRlYXJkb3duID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gc2V0dXAoKSB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIGxvZywgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCBydW5uZXIgPSBuZXcgUmVjb3JkaW5nUnVubmVyKHNlcnZpY2UpO1xuXHRcdC8vIFN0YXJ0IGFzIG5vbi1sZWFkZXIgc28gaW5kaXZpZHVhbCB0ZXN0cyBjYW4gc2VlZCBhdXRvbWF0aW9uc1xuXHRcdC8vIGJlZm9yZSB0cmlnZ2VyaW5nIHRoZSBsZWFkZXIncyBjYXRjaC11cCBwYXNzLlxuXHRcdGNvbnN0IGxlYWRlciA9IG5ldyBGYWtlTGVhZGVyRWxlY3Rpb24oZmFsc2UpO1xuXG5cdFx0bGV0IG5vdyA9IFQwO1xuXHRcdHNlcnZpY2Uuc2V0Q2xvY2tGb3JUZXN0aW5nKCgpID0+IG5vdyk7XG5cdFx0Y29uc3QgY29yZSA9IHRlYXJkb3duLmFkZChuZXcgQXV0b21hdGlvblNjaGVkdWxlckNvcmUoc2VydmljZSwgcnVubmVyLCBzdG9yYWdlLCBsb2csIHtcblx0XHRcdGxlYWRlckVsZWN0aW9uOiBsZWFkZXIsXG5cdFx0XHRkaXNhYmxlQXV0b1RpY2s6IHRydWUsXG5cdFx0XHRub3c6ICgpID0+IG5vdyxcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2VydmljZSwgcnVubmVyLCBsZWFkZXIsIGNvcmUsXG5cdFx0XHRzZXROb3c6IChkOiBEYXRlKSA9PiB7IG5vdyA9IGQ7IH0sXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ2RvZXMgbm90IHJ1biBhbnl0aGluZyBpZiB0aGVyZSBhcmUgbm8gYXV0b21hdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb3JlLCBydW5uZXIsIGxlYWRlciB9ID0gc2V0dXAoKTtcblx0XHRsZWFkZXIuc2V0KHRydWUpO1xuXHRcdGF3YWl0IGNvcmUud2FpdEZvclBlbmRpbmdSdW5zKCk7XG5cdFx0YXdhaXQgY29yZS50aWNrRm9yVGVzdGluZygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVubmVyLnJ1bnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnb24gYmVjb21pbmcgbGVhZGVyLCBydW5zIGNhdGNoLXVwIGZvciBkdWUgYXV0b21hdGlvbnMgZXhhY3RseSBvbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29yZSwgcnVubmVyLCBzZXJ2aWNlLCBsZWFkZXIsIHNldE5vdyB9ID0gc2V0dXAoKTtcblx0XHRzZXROb3coVDApO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogVEFSR0VUIH0pO1xuXHRcdC8vIG5leHRSdW5BdCBpcyBUMCsxaDsgYWR2YW5jZSB0aGUgY2xvY2sgcGFzdCBpdCBzbyB0aGUgcm93IGlzIGR1ZS5cblx0XHRzZXROb3coVF9QQVNUX0RVRSk7XG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zWzBdLmF1dG9tYXRpb25JZCwgYS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zWzBdLnRyaWdnZXIsICdjYXRjaF91cCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxheWVkIHNjaGVkdWxlZCB0aWNrcyB1c2UgdHJpZ2dlcj1zY2hlZHVsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvcmUsIHJ1bm5lciwgc2VydmljZSwgbGVhZGVyLCBzZXROb3cgfSA9IHNldHVwKCk7XG5cdFx0c2V0Tm93KFQwKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogVEFSR0VUIH0pO1xuXHRcdHNldE5vdyhUX1BBU1RfRFVFKTtcblx0XHRsZWFkZXIuc2V0KHRydWUpO1xuXHRcdGF3YWl0IGNvcmUud2FpdEZvclBlbmRpbmdSdW5zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zLmxlbmd0aCwgMSwgJ2ZpcnN0IHJ1biBzaG91bGQgYmUgY2F0Y2gtdXAnKTtcblxuXHRcdHNldE5vdyhUX1RPTU9SUk9XKTtcblx0XHRhd2FpdCBjb3JlLnRpY2tGb3JUZXN0aW5nKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLnJ1bnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLnJ1bnNbMV0udHJpZ2dlciwgJ3NjaGVkdWxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2FibGVkIGF1dG9tYXRpb25zIGFyZSBub3QgZGlzcGF0Y2hlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvcmUsIHJ1bm5lciwgc2VydmljZSwgbGVhZGVyLCBzZXROb3cgfSA9IHNldHVwKCk7XG5cdFx0c2V0Tm93KFQwKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IFRBUkdFVCB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb24oYS5pZCwgeyBlbmFibGVkOiBmYWxzZSB9KTtcblx0XHRzZXROb3coVF9QQVNUX0RVRSk7XG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXHRcdGF3YWl0IGNvcmUudGlja0ZvclRlc3RpbmcoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bm5lci5ydW5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkdmFuY2VzIG5leHRSdW5BdCBzbyB0aGUgc2FtZSBhdXRvbWF0aW9uIGlzIG5vdCBwaWNrZWQgdXAgYWdhaW4gb24gdGhlIG5leHQgdGljaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvcmUsIHJ1bm5lciwgc2VydmljZSwgbGVhZGVyLCBzZXROb3cgfSA9IHNldHVwKCk7XG5cdFx0c2V0Tm93KFQwKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IFRBUkdFVCB9KTtcblx0XHRzZXROb3coVF9QQVNUX0RVRSk7XG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIucnVucy5sZW5ndGgsIDEpO1xuXG5cdFx0Ly8gVGljayBhZ2FpbiBpbW1lZGlhdGVseSAtIG5leHRSdW5BdCB3YXMgYWR2YW5jZWQsIHNvIHRoZVxuXHRcdC8vIGF1dG9tYXRpb24gaXMgbm8gbG9uZ2VyIGR1ZSBhdCB0aGUgc2FtZSBgbm93YC5cblx0XHRhd2FpdCBjb3JlLnRpY2tGb3JUZXN0aW5nKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCB1cGRhdGVkID0gc2VydmljZS5nZXRBdXRvbWF0aW9uKGEuaWQpO1xuXHRcdGFzc2VydC5vayh1cGRhdGVkPy5uZXh0UnVuQXQpO1xuXHRcdGNvbnN0IG5leHQgPSBEYXRlLnBhcnNlKHVwZGF0ZWQhLm5leHRSdW5BdCEpO1xuXHRcdGFzc2VydC5vayhuZXh0ID4gVF9QQVNUX0RVRS5nZXRUaW1lKCksICduZXh0UnVuQXQgc2hvdWxkIGJlIGFmdGVyIHRoZSB0aWNrIHRoYXQganVzdCBmaXJlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXBvcnQgYSBydW4gdW50aWwgdGhlIHJ1bm5lciByZWNvcmRzIGl0cyBjbGFpbScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbG9nLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdHNlcnZpY2Uuc2V0Q2xvY2tGb3JUZXN0aW5nKCgpID0+IFQwKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IFRBUkdFVCB9KTtcblx0XHRjb25zdCBsZWFkZXIgPSBuZXcgRmFrZUxlYWRlckVsZWN0aW9uKGZhbHNlKTtcblx0XHRjb25zdCBydW5uZXIgPSBuZXcgU2tpcHBpbmdSdW5uZXIoKTtcblx0XHRjb25zdCBjb3JlID0gdGVhcmRvd24uYWRkKG5ldyBBdXRvbWF0aW9uU2NoZWR1bGVyQ29yZShzZXJ2aWNlLCBydW5uZXIsIHN0b3JhZ2UsIGxvZywge1xuXHRcdFx0bGVhZGVyRWxlY3Rpb246IGxlYWRlcixcblx0XHRcdGRpc2FibGVBdXRvVGljazogdHJ1ZSxcblx0XHRcdG5vdzogKCkgPT4gVF9QQVNUX0RVRSxcblx0XHR9KSk7XG5cblx0XHRsZWFkZXIuc2V0KHRydWUpO1xuXHRcdGF3YWl0IGNvcmUud2FpdEZvclBlbmRpbmdSdW5zKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc3BhdGNoZXM6IHJ1bm5lci5ydW5zLmxlbmd0aCxcblx0XHRcdGxhc3RSdW5BdDogc2VydmljZS5nZXRBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQpPy5sYXN0UnVuQXQsXG5cdFx0XHRuZXh0UnVuQXQ6IHNlcnZpY2UuZ2V0QXV0b21hdGlvbihhdXRvbWF0aW9uLmlkKT8ubmV4dFJ1bkF0LFxuXHRcdFx0cnVuQ291bnQ6IHNlcnZpY2UucnVucy5nZXQoKS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0ZGlzcGF0Y2hlczogMSxcblx0XHRcdGxhc3RSdW5BdDogdW5kZWZpbmVkLFxuXHRcdFx0bmV4dFJ1bkF0OiBhdXRvbWF0aW9uLm5leHRSdW5BdCxcblx0XHRcdHJ1bkNvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRyaWVzIGEgc3RpbGwtZHVlIGF1dG9tYXRpb24gd2hlbiB0YXJnZXQgYXZhaWxhYmlsaXR5IGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIGxvZywgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlLnNldENsb2NrRm9yVGVzdGluZygoKSA9PiBUMCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiBUQVJHRVQgfSk7XG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IFNraXBwaW5nUnVubmVyKCk7XG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXJFbGVjdGlvbihmYWxzZSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VUYXJnZXRBdmFpbGFiaWxpdHkgPSB0ZWFyZG93bi5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3QgY29yZSA9IHRlYXJkb3duLmFkZChuZXcgQXV0b21hdGlvblNjaGVkdWxlckNvcmUoc2VydmljZSwgcnVubmVyLCBzdG9yYWdlLCBsb2csIHtcblx0XHRcdGxlYWRlckVsZWN0aW9uOiBsZWFkZXIsXG5cdFx0XHRkaXNhYmxlQXV0b1RpY2s6IHRydWUsXG5cdFx0XHRub3c6ICgpID0+IFRfUEFTVF9EVUUsXG5cdFx0XHRvbkRpZENoYW5nZVRhcmdldEF2YWlsYWJpbGl0eTogb25EaWRDaGFuZ2VUYXJnZXRBdmFpbGFiaWxpdHkuZXZlbnQsXG5cdFx0fSkpO1xuXG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXHRcdG9uRGlkQ2hhbmdlVGFyZ2V0QXZhaWxhYmlsaXR5LmZpcmUoKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNwYXRjaGVzOiBydW5uZXIucnVucyxcblx0XHRcdGxhc3RSdW5BdDogc2VydmljZS5nZXRBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQpPy5sYXN0UnVuQXQsXG5cdFx0XHRuZXh0UnVuQXQ6IHNlcnZpY2UuZ2V0QXV0b21hdGlvbihhdXRvbWF0aW9uLmlkKT8ubmV4dFJ1bkF0LFxuXHRcdH0sIHtcblx0XHRcdGRpc3BhdGNoZXM6IFtcblx0XHRcdFx0eyBhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQsIHRyaWdnZXI6ICdjYXRjaF91cCcgfSxcblx0XHRcdFx0eyBhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQsIHRyaWdnZXI6ICdzY2hlZHVsZScgfSxcblx0XHRcdF0sXG5cdFx0XHRsYXN0UnVuQXQ6IHVuZGVmaW5lZCxcblx0XHRcdG5leHRSdW5BdDogYXV0b21hdGlvbi5uZXh0UnVuQXQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90aGluZyB3aGlsZSBub3QgbGVhZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29yZSwgcnVubmVyLCBzZXJ2aWNlLCBsZWFkZXIsIHNldE5vdyB9ID0gc2V0dXAoKTtcblx0XHRzZXROb3coVDApO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiBUQVJHRVQgfSk7XG5cdFx0c2V0Tm93KFRfUEFTVF9EVUUpO1xuXHRcdGF3YWl0IGNvcmUud2FpdEZvclBlbmRpbmdSdW5zKCk7XG5cdFx0YXdhaXQgY29yZS50aWNrRm9yVGVzdGluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIucnVucy5sZW5ndGgsIDApO1xuXG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIucnVucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIucnVuc1swXS50cmlnZ2VyLCAnY2F0Y2hfdXAnKTtcblx0fSk7XG5cblx0dGVzdCgnb24gYmVjb21pbmcgbGVhZGVyLCBmYWlscyBhbnkgbGVmdG92ZXIgcGVuZGluZy9ydW5uaW5nIHJ1bnMgYXMgY3Jhc2ggcmVjb3ZlcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBmaXJzdFNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbG9nLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGZpcnN0U2VydmljZS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gVDApO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBmaXJzdFNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiBUQVJHRVQgfSk7XG5cdFx0Y29uc3QgcnVuID0gKGF3YWl0IGZpcnN0U2VydmljZS5yZWNvcmRSdW5TdGFydChhLmlkLCAnbWFudWFsJywgMSkpLnJ1bjtcblx0XHRmaXJzdFNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBsb2csIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0c2VydmljZS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gVDApO1xuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBSZWNvcmRpbmdSdW5uZXIoc2VydmljZSk7XG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXJFbGVjdGlvbih0cnVlKTtcblx0XHRjb25zdCBjb3JlID0gdGVhcmRvd24uYWRkKG5ldyBBdXRvbWF0aW9uU2NoZWR1bGVyQ29yZShzZXJ2aWNlLCBydW5uZXIsIHN0b3JhZ2UsIGxvZywge1xuXHRcdFx0bGVhZGVyRWxlY3Rpb246IGxlYWRlcixcblx0XHRcdGRpc2FibGVBdXRvVGljazogdHJ1ZSxcblx0XHRcdG5vdzogKCkgPT4gVDAsXG5cdFx0fSkpO1xuXHRcdGF3YWl0IGNvcmUud2FpdEZvclBlbmRpbmdSdW5zKCk7XG5cblx0XHRjb25zdCByZWNvdmVyZWQgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCkuZmluZChyID0+IHIuaWQgPT09IHJ1bi5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY292ZXJlZD8uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY292ZXJlZD8uZXJyb3JNZXNzYWdlLCBDUkFTSF9SRUNPVkVSWV9SRUFTT04pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb3NpbmcgdGhlbiByZWdhaW5pbmcgbGVhZGVyc2hpcCByZS1ydW5zIGNhdGNoLXVwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29yZSwgcnVubmVyLCBzZXJ2aWNlLCBsZWFkZXIsIHNldE5vdyB9ID0gc2V0dXAoKTtcblx0XHRzZXROb3coVDApO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiBUQVJHRVQgfSk7XG5cdFx0c2V0Tm93KFRfUEFTVF9EVUUpO1xuXHRcdGxlYWRlci5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLnJ1bnNbMF0udHJpZ2dlciwgJ2NhdGNoX3VwJyk7XG5cblx0XHQvLyBMb3NlIGxlYWRlcnNoaXAuXG5cdFx0bGVhZGVyLnNldChmYWxzZSk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblxuXHRcdC8vIE1ha2UgdGhlIHJvdyBkdWUgYWdhaW4uXG5cdFx0c2V0Tm93KFRfVE9NT1JST1cpO1xuXG5cdFx0Ly8gUmVnYWluIGl0IC0gd2Ugc2hvdWxkIHNlZSBhbm90aGVyIGNhdGNoLXVwLlxuXHRcdGxlYWRlci5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLnJ1bnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLnJ1bnNbMV0udHJpZ2dlciwgJ2NhdGNoX3VwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYWRlcnNoaXAgdHJhbnNpdGlvbnMgYWN0aXZhdGUgYW5kIGRlYWN0aXZhdGUgc3RhbGUtcnVuIHJlY292ZXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChuZXcgUmVjb3JkaW5nUmVjb3ZlcnlBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBsb2csIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBuZXcgVGVzdEF1dG9tYXRpb25TdG9yYWdlU2VydmljZShzdG9yYWdlKSkpO1xuXHRcdGNvbnN0IGxlYWRlciA9IG5ldyBGYWtlTGVhZGVyRWxlY3Rpb24oZmFsc2UpO1xuXHRcdGNvbnN0IGNvcmUgPSB0ZWFyZG93bi5hZGQobmV3IEF1dG9tYXRpb25TY2hlZHVsZXJDb3JlKHNlcnZpY2UsIG5ldyBSZWNvcmRpbmdSdW5uZXIoc2VydmljZSksIHN0b3JhZ2UsIGxvZywge1xuXHRcdFx0bGVhZGVyRWxlY3Rpb246IGxlYWRlcixcblx0XHRcdGRpc2FibGVBdXRvVGljazogdHJ1ZSxcblx0XHRcdG5vdzogKCkgPT4gVDAsXG5cdFx0fSkpO1xuXG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXHRcdGxlYWRlci5zZXQoZmFsc2UpO1xuXHRcdGxlYWRlci5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5yZWNvdmVyeUxpZmVjeWNsZSwgW1xuXHRcdFx0J3N0b3AnLFxuXHRcdFx0YHN0YXJ0OiR7Q1JBU0hfUkVDT1ZFUllfUkVBU09OfWAsXG5cdFx0XHQnc3RvcCcsXG5cdFx0XHRgc3RhcnQ6JHtDUkFTSF9SRUNPVkVSWV9SRUFTT059YCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndG9nZ2xpbmcgdGhlIGZlYXR1cmUgc2V0dGluZyBvZmYgdGhlbiBvbiBkb2VzIG5vdCBjcmFzaC1yZWNvdmVyIGluLXByb2dyZXNzIHJ1bnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVwcm9kdWNlIHRoZSBidWcgd2hlcmUgZGlzYWJsaW5nIHRoZSBmZWF0dXJlIHJlc2V0IHRoZVxuXHRcdC8vIHBlci1sZWFkZXJzaGlwIHN0YXJ0dXAgZmxhZywgY2F1c2luZyBhIHN1YnNlcXVlbnQgcmUtZW5hYmxlXG5cdFx0Ly8gdGljayB0byBjYWxsIG1hcmtTdGFsZVJ1bnNGYWlsZWQgYW5kIGluY29ycmVjdGx5IGZhaWwgYW55XG5cdFx0Ly8gcnVucyB0aGF0IHdlcmUgYWN0aXZlIGFjcm9zcyB0aGUgdG9nZ2xlLlxuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBsb2csIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0c2VydmljZS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gVDApO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogVEFSR0VUIH0pO1xuXHRcdGNvbnN0IGluRmxpZ2h0ID0gKGF3YWl0IHNlcnZpY2UucmVjb3JkUnVuU3RhcnQoYS5pZCwgJ3NjaGVkdWxlJywgMSkpLnJ1bjtcblxuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBSZWNvcmRpbmdSdW5uZXIoc2VydmljZSk7XG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXJFbGVjdGlvbih0cnVlKTtcblx0XHRsZXQgZW5hYmxlZCA9IHRydWU7XG5cdFx0Y29uc3QgY29yZSA9IHRlYXJkb3duLmFkZChuZXcgQXV0b21hdGlvblNjaGVkdWxlckNvcmUoc2VydmljZSwgcnVubmVyLCBzdG9yYWdlLCBsb2csIHtcblx0XHRcdGxlYWRlckVsZWN0aW9uOiBsZWFkZXIsXG5cdFx0XHRkaXNhYmxlQXV0b1RpY2s6IHRydWUsXG5cdFx0XHRub3c6ICgpID0+IFQwLFxuXHRcdFx0aXNGZWF0dXJlRW5hYmxlZDogKCkgPT4gZW5hYmxlZCxcblx0XHR9KSk7XG5cdFx0Ly8gRmlyc3QgdGljayAoYXMgbGVhZGVyLCBmZWF0dXJlIE9OKSBkb2VzIHN0YXJ0dXAgcmVjb3ZlcnksXG5cdFx0Ly8gd2hpY2ggYnkgZGVzaWduIGZhaWxzIHRoZSBpbi1mbGlnaHQgcm93LiBUZXN0cyBiZWxvdyBvbmx5XG5cdFx0Ly8gY2FyZSB0aGF0IHRoZSAqbmV4dCogZW5hYmxlXHUyMTkyZGlzYWJsZVx1MjE5MmVuYWJsZSBjeWNsZSBkb2VzIG5vdFxuXHRcdC8vIHJlcGVhdCB0aGF0IHJlY292ZXJ5LlxuXHRcdGF3YWl0IGNvcmUud2FpdEZvclBlbmRpbmdSdW5zKCk7XG5cdFx0Ly8gUmVzZXQgdGhlIHJvdyBiYWNrIHRvIHJ1bm5pbmcgc28gd2UgY2FuIG9ic2VydmUgd2hldGhlciB0aGVcblx0XHQvLyB0b2dnbGUgcmUtdHJpZ2dlcnMgcmVjb3ZlcnkuIE5vdGU6IHVwZGF0ZVJ1bidzIHBhdGNoXG5cdFx0Ly8gc2VtYW50aWNzIHRyZWF0IHVuZGVmaW5lZCBmaWVsZHMgYXMgXCJubyBjaGFuZ2VcIiwgc28gd2Vcblx0XHQvLyBjYW5ub3QgY2xlYXIgZXJyb3JNZXNzYWdlIGZyb20gaGVyZTsgYXNzZXJ0IG9ubHkgb24gc3RhdHVzLlxuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUnVuKGluRmxpZ2h0LmlkLCB7IHN0YXR1czogJ3J1bm5pbmcnIH0pO1xuXG5cdFx0ZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGF3YWl0IGNvcmUudGlja0ZvclRlc3RpbmcoKTtcblx0XHRlbmFibGVkID0gdHJ1ZTtcblx0XHRhd2FpdCBjb3JlLnRpY2tGb3JUZXN0aW5nKCk7XG5cblx0XHQvLyBUaGUgaW4tZmxpZ2h0IHJ1biBtdXN0IHN0aWxsIGJlIHJ1bm5pbmcuIFRoZSBmZWF0dXJlIHRvZ2dsZVxuXHRcdC8vIG11c3QgTk9UIGhhdmUgcmUtdHJpZ2dlcmVkIGNyYXNoIHJlY292ZXJ5LlxuXHRcdGNvbnN0IGFmdGVyID0gc2VydmljZS5ydW5zLmdldCgpLmZpbmQociA9PiByLmlkID09PSBpbkZsaWdodC5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFmdGVyPy5zdGF0dXMsICdydW5uaW5nJywgJ2ZlYXR1cmUtdG9nZ2xlIG9mZi9vbiBtdXN0IG5vdCBmYWlsIGluLWZsaWdodCBydW5zJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bk9uZVdpdGhUaW1lb3V0OiBhIGh1bmcgcnVuIGlzIGNhbmNlbGxlZCwgbWFya2VkIGZhaWxlZCwgYW5kIHRoZSBuZXh0IGR1ZSBhdXRvbWF0aW9uIHN0aWxsIGZpcmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBsb2csIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHRsZXQgbm93ID0gVDA7XG5cdFx0c2VydmljZS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gbm93KTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IFRBUkdFVCB9KTtcblx0XHRjb25zdCBiID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0InLCBwcm9tcHQ6ICdxJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IFRBUkdFVCB9KTtcblxuXHRcdC8vIFRoZSBmaXJzdCBydW4gaGFuZ3MgdW50aWwgY2FuY2VsbGF0aW9uIGFuZCB0cmllcyB0byByZWNvcmQgYENhbmNlbGxlZGAsXG5cdFx0Ly8gbWF0Y2hpbmcgdGhlIHJlYWwgcnVubmVyJ3MgdGltZW91dCBiZWhhdmlvci5cblx0XHRsZXQgaHVuZ0F1dG9tYXRpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNsYXNzIEhhbmdpbmdSdW5uZXIgaW1wbGVtZW50cyBJQXV0b21hdGlvblJ1bm5lciB7XG5cdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdHJlYWRvbmx5IGh1bmcgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjYWxscyA9IDA7XG5cdFx0XHRjYW5jZWxPYnNlcnZlZCA9IGZhbHNlO1xuXHRcdFx0cnVuT25jZShhdXRvbWF0aW9uOiBJQXV0b21hdGlvbkRlc2NyaXB0b3IsIHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyLCBsZWFkZXJXaW5kb3dJZDogbnVtYmVyLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogSUF1dG9tYXRpb25SdW5PcGVyYXRpb24ge1xuXHRcdFx0XHR0aGlzLmNhbGxzKys7XG5cdFx0XHRcdGNvbnN0IHdoZW5Db21wbGV0ZWQgPSB0aGlzLl9ydW4oYXV0b21hdGlvbiwgdHJpZ2dlciwgbGVhZGVyV2luZG93SWQsIHRva2VuKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR3aGVuRGlzcGF0Y2hlZDogUHJvbWlzZS5yZXNvbHZlKHsga2luZDogJ25vdFN0YXJ0ZWQnLCByZWFzb246ICdlcnJvcicgfSksXG5cdFx0XHRcdFx0d2hlbkNvbXBsZXRlZCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cHJpdmF0ZSBhc3luYyBfcnVuKGF1dG9tYXRpb246IElBdXRvbWF0aW9uRGVzY3JpcHRvciwgdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsIGxlYWRlcldpbmRvd0lkOiBudW1iZXIsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0aWYgKHRoaXMuY2FsbHMgPT09IDEpIHtcblx0XHRcdFx0XHRodW5nQXV0b21hdGlvbklkID0gYXV0b21hdGlvbi5pZDtcblx0XHRcdFx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb24uaWQsIHRyaWdnZXIsIGxlYWRlcldpbmRvd0lkKTtcblx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRva2VuPy5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmNhbmNlbE9ic2VydmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvbnN0IGFjdGl2ZSA9IHNlcnZpY2UuZ2V0QWN0aXZlUnVuRm9yKGF1dG9tYXRpb24uaWQpO1xuXHRcdFx0XHRcdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0XHRcdFx0XHR2b2lkIHNlcnZpY2UudXBkYXRlUnVuKGFjdGl2ZS5pZCwge1xuXHRcdFx0XHRcdFx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXG5cdFx0XHRcdFx0XHRcdFx0ZXJyb3JNZXNzYWdlOiAnQ2FuY2VsbGVkJyxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLmh1bmcuY29tcGxldGUoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5odW5nLnA7XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdGxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb24uaWQsIHRyaWdnZXIsIGxlYWRlcldpbmRvd0lkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IEhhbmdpbmdSdW5uZXIoKTtcblx0XHRjb25zdCBsZWFkZXIgPSBuZXcgRmFrZUxlYWRlckVsZWN0aW9uKGZhbHNlKTtcblxuXHRcdC8vIFVzZSBhIHZlcnkgc2hvcnQgdGltZW91dCBzbyB0aGUgdGVzdCBmaW5pc2hlcyBxdWlja2x5LlxuXHRcdGNvbnN0IGNvcmUgPSB0ZWFyZG93bi5hZGQobmV3IEF1dG9tYXRpb25TY2hlZHVsZXJDb3JlKHNlcnZpY2UsIHJ1bm5lciwgc3RvcmFnZSwgbG9nLCB7XG5cdFx0XHRsZWFkZXJFbGVjdGlvbjogbGVhZGVyLFxuXHRcdFx0ZGlzYWJsZUF1dG9UaWNrOiB0cnVlLFxuXHRcdFx0bm93OiAoKSA9PiBub3csXG5cdFx0XHRnZXRSdW5UaW1lb3V0TXM6ICgpID0+IDUwLFxuXHRcdH0pKTtcblxuXHRcdG5vdyA9IFRfUEFTVF9EVUU7XG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXG5cdFx0Ly8gQm90aCBBIGFuZCBCIHNob3VsZCBoYXZlIGJlZW4gZGlzcGF0Y2hlZCAodGhlIHNlY29uZCB3YXNcblx0XHQvLyBub3QgYmxvY2tlZCBieSB0aGUgZmlyc3QncyBoYW5nKS4gVGhlIGh1bmcgYXV0b21hdGlvbidzIHJ1blxuXHRcdC8vIHJvdyBtdXN0IGJlIGZhaWxlZCB3aXRoIHRoZSB0aW1lb3V0IHJlYXNvbjsgdGhlIHJ1bm5lciBtdXN0XG5cdFx0Ly8gaGF2ZSBvYnNlcnZlZCBjYW5jZWxsYXRpb24uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5jYWxscywgMiwgJ2JvdGggQSBhbmQgQiBzaG91bGQgaGF2ZSBiZWVuIGRpc3BhdGNoZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLmNhbmNlbE9ic2VydmVkLCB0cnVlLCAncnVubmVyIHNob3VsZCBvYnNlcnZlIGNhbmNlbGxhdGlvbiBvbiB0aW1lb3V0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGh1bmdBdXRvbWF0aW9uSWQsICdydW5uZXIgc2hvdWxkIGhhdmUgcmVjb3JkZWQgYSBodW5nIGF1dG9tYXRpb24gaWQnKTtcblx0XHRjb25zdCBvdGhlcklkID0gaHVuZ0F1dG9tYXRpb25JZCA9PT0gYS5pZCA/IGIuaWQgOiBhLmlkO1xuXHRcdGNvbnN0IGh1bmdSdW4gPSBzZXJ2aWNlLnJ1bnMuZ2V0KCkuZmluZChyID0+IHIuYXV0b21hdGlvbklkID09PSBodW5nQXV0b21hdGlvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHVuZ1J1bj8uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKGh1bmdSdW4/LmVycm9yTWVzc2FnZT8uc3RhcnRzV2l0aChSVU5fVElNRU9VVF9SRUFTT05fUFJFRklYKSwgYGV4cGVjdGVkIHRpbWVvdXQgbWFya2VyLCBnb3Q6ICR7aHVuZ1J1bj8uZXJyb3JNZXNzYWdlfWApO1xuXHRcdC8vIFRoZSBub24taHVuZyBhdXRvbWF0aW9uJ3Mgcm93IHNob3VsZCBOT1QgaGF2ZSBiZWVuIHRvdWNoZWRcblx0XHQvLyBieSB0aGUgdGltZW91dCBwYXRoLlxuXHRcdGNvbnN0IG90aGVyUnVuID0gc2VydmljZS5ydW5zLmdldCgpLmZpbmQociA9PiByLmF1dG9tYXRpb25JZCA9PT0gb3RoZXJJZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKG90aGVyUnVuPy5zdGF0dXMsICdmYWlsZWQnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBMkMsdUJBQXVCO0FBQ2xFLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDRCQUE0QjtBQUdyQyxTQUFTLHlCQUF5Qix1QkFBdUIsaUNBQWlDO0FBQzFGLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMseUJBQXlCLG9DQUFvQztBQUV0RSxNQUFNLFNBQVMsSUFBSSxNQUFNLG1CQUFtQjtBQUM1QyxNQUFNLFNBQTJC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
