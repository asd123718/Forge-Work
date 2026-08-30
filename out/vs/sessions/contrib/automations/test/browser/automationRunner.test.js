import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { observableValue, waitForState } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { createAutomationService } from "./automationTestUtils.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { AutomationRunner } from "../../browser/automationRunner.js";
function hourly() {
  return { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}
const FOLDER_A = URI.parse("file:///workspace/a");
const FOLDER_B = URI.parse("file:///workspace/b");
function workspaceTarget(folderUri = FOLDER_A, options) {
  return {
    kind: "workspace",
    folderUri,
    providerId: options?.providerId,
    sessionTypeId: options?.sessionTypeId,
    isolation: options?.isolation ?? { kind: "default" }
  };
}
class FakeSessionsManagementService extends mock() {
  constructor() {
    super(...arguments);
    this.calls = [];
    this.workspaceTargetAvailable = true;
    this.quickChatTargetAvailable = true;
  }
  isNewSessionTargetAvailable() {
    return this.workspaceTargetAvailable;
  }
  isQuickChatTargetAvailable() {
    return this.quickChatTargetAvailable;
  }
  async createAndSendNewChatRequest(folderUri, options, createOptions, token = CancellationToken.None) {
    this.calls.push({ isQuickChat: false, folderUri, options, createOptions, token });
    if (this.onSendHook) {
      await this.onSendHook();
    }
    if (this.nextError) {
      throw this.nextError;
    }
    return this.nextSession;
  }
  async createAndSendQuickChatRequest(options, createOptions, token = CancellationToken.None) {
    this.calls.push({ isQuickChat: true, options, createOptions, token });
    if (this.onSendHook) {
      await this.onSendHook();
    }
    if (this.nextError) {
      throw this.nextError;
    }
    return this.nextSession;
  }
}
class RecordingNotificationService extends TestNotificationService {
  constructor() {
    super(...arguments);
    this.infos = [];
  }
  info(message) {
    this.infos.push(message);
    return super.info(message);
  }
}
function fakeSession(id, status = observableValue(`status-${id}`, SessionStatus.Completed), chatStatus = status) {
  return upcastPartial({
    sessionId: id,
    resource: URI.from({ scheme: "vscode-chat-session", authority: "test", path: `/${id}` }),
    status,
    mainChat: observableValue(`main-chat-${id}`, upcastPartial({ status: chatStatus }))
  });
}
suite("AutomationRunner", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  function setup() {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    const sessionsMgmt = new FakeSessionsManagementService();
    const notifications = new RecordingNotificationService();
    const runner = new AutomationRunner(service, sessionsMgmt, log, NullTelemetryService, notifications);
    return { service, sessionsMgmt, runner, notifications };
  }
  test("creates a session for the automation prompt and marks the run completed", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({ name: "A", prompt: "do the thing", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 99).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.strictEqual(sessionsMgmt.calls[0].folderUri?.toString(), FOLDER_A.toString());
    assert.strictEqual(sessionsMgmt.calls[0].options.query, "do the thing");
    assert.strictEqual(sessionsMgmt.calls[0].options.background, true);
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "completed");
    assert.strictEqual(runs[0].sessionResource?.toString(), "vscode-chat-session://test/s1");
    assert.strictEqual(runs[0].trigger, "schedule");
    assert.strictEqual(runs[0].leaderWindowId, 99);
  });
  test("keeps the run active through NeedsInput and records the session before completion", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const status = observableValue("status-s1", SessionStatus.InProgress);
    sessionsMgmt.nextSession = fakeSession("s1", status);
    const a = await service.createAutomation({ name: "A", prompt: "do the thing", schedule: hourly(), target: workspaceTarget() });
    let settled = false;
    const operation = runner.runOnce(a, "schedule", 99);
    let dispatched = false;
    const dispatchPromise = operation.whenDispatched.finally(() => dispatched = true);
    const runPromise = operation.whenCompleted.finally(() => settled = true);
    await dispatchPromise;
    assert.deepStrictEqual(service.runs.get().map((run) => ({
      status: run.status,
      sessionResource: run.sessionResource?.toString(),
      completedAt: run.completedAt
    })), [{
      status: "running",
      sessionResource: "vscode-chat-session://test/s1",
      completedAt: void 0
    }]);
    assert.strictEqual(dispatched, true);
    status.set(SessionStatus.NeedsInput, void 0);
    await Promise.resolve();
    assert.deepStrictEqual({
      settled,
      status: service.runs.get()[0].status,
      completedAt: service.runs.get()[0].completedAt
    }, {
      settled: false,
      status: "running",
      completedAt: void 0
    });
    status.set(SessionStatus.Completed, void 0);
    await runPromise;
    assert.strictEqual(service.runs.get()[0].status, "completed");
  });
  test("completes the run when the main chat stops while the aggregate session remains active", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const sessionStatus = observableValue("status-s1", SessionStatus.InProgress);
    const chatStatus = observableValue("chat-status-s1", SessionStatus.InProgress);
    sessionsMgmt.nextSession = fakeSession("s1", sessionStatus, chatStatus);
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const operation = runner.runOnce(automation, "manual", 1);
    await operation.whenDispatched;
    chatStatus.set(SessionStatus.Completed, void 0);
    await operation.whenCompleted;
    assert.deepStrictEqual({
      sessionStatus: sessionStatus.get(),
      runStatus: service.runs.get()[0].status
    }, {
      sessionStatus: SessionStatus.InProgress,
      runStatus: "completed"
    });
  });
  test("marks the run failed when the session reports an error", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const status = observableValue("status-s1", SessionStatus.InProgress);
    sessionsMgmt.nextSession = fakeSession("s1", status);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const runPromise = runner.runOnce(a, "schedule", 1).whenCompleted;
    await waitForState(service.runs, (runs) => runs[0]?.sessionResource !== void 0);
    status.set(SessionStatus.Error, void 0);
    await runPromise;
    const run = service.runs.get()[0];
    assert.deepStrictEqual({
      status: run.status,
      sessionResource: run.sessionResource?.toString(),
      errorMessage: run.errorMessage,
      hasCompletedAt: run.completedAt !== void 0
    }, {
      status: "failed",
      sessionResource: "vscode-chat-session://test/s1",
      errorMessage: "Agent session failed.",
      hasCompletedAt: true
    });
  });
  test("always uses the automation folder regardless of the current workspace", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(FOLDER_B)
    });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls[0].folderUri?.toString(), FOLDER_B.toString());
  });
  test("creates a workspace-less quick chat without folder or repository configuration", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("quick");
    const automation = await service.createAutomation({
      name: "Quick",
      prompt: "p",
      schedule: hourly(),
      target: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    });
    await runner.runOnce(automation, "schedule", 1).whenCompleted;
    assert.deepStrictEqual(sessionsMgmt.calls.map((call) => ({
      isQuickChat: call.isQuickChat,
      folderUri: call.folderUri,
      createOptions: call.createOptions
    })), [{
      isQuickChat: true,
      folderUri: void 0,
      createOptions: {
        providerId: "local-agent-host",
        sessionTypeId: "copilotcli",
        modelId: void 0,
        modeId: void 0,
        permissionLevel: void 0,
        isolationMode: void 0,
        branch: void 0
      }
    }]);
  });
  test("truncates the session title to 100 characters", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const longName = "A".repeat(150);
    const a = await service.createAutomation({ name: longName, prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "manual", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls[0].options.title, "A".repeat(100));
  });
  test("marks the run failed when createAndSendNewChatRequest throws", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextError = new Error("provider offline");
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "failed");
    assert.strictEqual(runs[0].errorMessage, "provider offline");
  });
  test("defers a scheduled run without advancing its schedule when the target is unavailable", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.workspaceTargetAvailable = false;
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(automation, "schedule", 1).whenCompleted;
    const updated = service.getAutomation(automation.id);
    assert.deepStrictEqual({
      calls: sessionsMgmt.calls.length,
      runs: service.runs.get(),
      lastRunAt: updated?.lastRunAt,
      nextRunAt: updated?.nextRunAt
    }, {
      calls: 0,
      runs: [],
      lastRunAt: void 0,
      nextRunAt: automation.nextRunAt
    });
  });
  test("reports an unavailable target for a manual run without recording a failure", async () => {
    const { service, sessionsMgmt, runner, notifications } = setup();
    sessionsMgmt.quickChatTargetAvailable = false;
    const automation = await service.createAutomation({
      name: "Unavailable",
      prompt: "p",
      schedule: hourly(),
      target: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    });
    await runner.runOnce(automation, "manual", 1).whenCompleted;
    assert.deepStrictEqual({
      calls: sessionsMgmt.calls.length,
      runs: service.runs.get(),
      notifications: notifications.infos
    }, {
      calls: 0,
      runs: [],
      notifications: ["Automation 'Unavailable' cannot start until its agent becomes available."]
    });
  });
  test("skips when another active run exists for the same automation", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await service.recordRunStart(a.id, "manual", 1);
    await runner.runOnce(a, "schedule", 2).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 0);
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "pending");
  });
  test("marks the run failed when the cancellation token is already cancelled", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const cts = new CancellationTokenSource();
    cts.cancel();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1, cts.token).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 0);
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "failed");
    assert.strictEqual(runs[0].errorMessage, "Cancelled");
    cts.dispose();
  });
  test("marks the run cancelled when the token is cancelled mid-flight", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const cts = new CancellationTokenSource();
    sessionsMgmt.nextSession = fakeSession("s-mid");
    sessionsMgmt.onSendHook = () => {
      cts.cancel();
    };
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1, cts.token).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.strictEqual(sessionsMgmt.calls[0].token, cts.token);
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "failed");
    assert.strictEqual(runs[0].errorMessage, "Cancelled");
    assert.strictEqual(runs[0].sessionResource?.toString(), "vscode-chat-session://test/s-mid");
    cts.dispose();
  });
  test("cancels while waiting for the session to finish", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const cts = new CancellationTokenSource();
    const status = observableValue("status-s-waiting", SessionStatus.InProgress);
    sessionsMgmt.nextSession = fakeSession("s-waiting", status);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const runPromise = runner.runOnce(a, "schedule", 1, cts.token).whenCompleted;
    await waitForState(service.runs, (runs) => runs[0]?.sessionResource !== void 0);
    cts.cancel();
    await runPromise;
    const run = service.runs.get()[0];
    assert.deepStrictEqual({
      status: run.status,
      sessionResource: run.sessionResource?.toString(),
      errorMessage: run.errorMessage
    }, {
      status: "failed",
      sessionResource: "vscode-chat-session://test/s-waiting",
      errorMessage: "Cancelled"
    });
    cts.dispose();
  });
  test("does not overwrite a terminal failure when cancelled", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const cts = new CancellationTokenSource();
    const status = observableValue("status-s-timeout", SessionStatus.InProgress);
    sessionsMgmt.nextSession = fakeSession("s-timeout", status);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const runPromise = runner.runOnce(a, "schedule", 1, cts.token).whenCompleted;
    const run = await waitForState(service.runs.map((runs) => runs[0]), (run2) => run2?.sessionResource !== void 0);
    await service.updateRun(run.id, {
      status: "failed",
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      errorMessage: "Timed out"
    });
    cts.cancel();
    await runPromise;
    assert.deepStrictEqual({
      status: service.runs.get()[0].status,
      errorMessage: service.runs.get()[0].errorMessage
    }, {
      status: "failed",
      errorMessage: "Timed out"
    });
    cts.dispose();
  });
  test("completes the run even when the service returns undefined", async () => {
    const { service, runner } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1, CancellationToken.None).whenCompleted;
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "completed");
    assert.strictEqual(runs[0].sessionResource, void 0);
  });
  test("passes the captured providerId and sessionTypeId through to createAndSendNewChatRequest", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(FOLDER_A, { providerId: "local-agent-host", sessionTypeId: "agent-host-copilotcli" })
    });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.deepStrictEqual(sessionsMgmt.calls[0].createOptions, {
      providerId: "local-agent-host",
      sessionTypeId: "agent-host-copilotcli",
      modelId: void 0,
      modeId: void 0,
      permissionLevel: void 0,
      isolationMode: void 0,
      branch: void 0
    });
  });
  test("passes captured mode and permission level through to createAndSendNewChatRequest", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(),
      mode: "agent",
      permissionLevel: "autopilot"
    });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.deepStrictEqual(sessionsMgmt.calls[0].createOptions, {
      providerId: void 0,
      sessionTypeId: void 0,
      modelId: void 0,
      modeId: "agent",
      permissionLevel: "autopilot",
      isolationMode: void 0,
      branch: void 0
    });
  });
  test("passes a branch only for Worktree isolation", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const worktree = await service.createAutomation({
      name: "Worktree",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(FOLDER_A, { isolation: { kind: "worktree", branch: "feature/worktree" } })
    });
    const folder = await service.createAutomation({
      name: "Folder",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(FOLDER_B, { isolation: { kind: "folder" } })
    });
    await runner.runOnce(worktree, "schedule", 1).whenCompleted;
    await runner.runOnce(folder, "schedule", 1).whenCompleted;
    assert.deepStrictEqual(sessionsMgmt.calls.map((call) => call.createOptions), [
      {
        providerId: void 0,
        sessionTypeId: void 0,
        modelId: void 0,
        modeId: void 0,
        permissionLevel: void 0,
        isolationMode: "worktree",
        branch: "feature/worktree"
      },
      {
        providerId: void 0,
        sessionTypeId: void 0,
        modelId: void 0,
        modeId: void 0,
        permissionLevel: void 0,
        isolationMode: "workspace",
        branch: void 0
      }
    ]);
  });
  test("omits createOptions entirely when no provider/sessionType is captured", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.strictEqual(sessionsMgmt.calls[0].createOptions, void 0);
  });
  test("does not throw if the automation is deleted mid-run", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await service.deleteAutomation(a.id);
    await runner.runOnce(a, "manual", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 0);
    assert.deepStrictEqual(service.runs.get(), []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXHRlc3RcXGJyb3dzZXJcXGF1dG9tYXRpb25SdW5uZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUsIHdhaXRGb3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2ssIHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4vYXV0b21hdGlvblRlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uVGFyZ2V0LCBBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uLCBJQXV0b21hdGlvblNjaGVkdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMsIElTZW5kUmVxdWVzdE9wdGlvbnMsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uUnVubmVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uUnVubmVyLmpzJztcblxuZnVuY3Rpb24gaG91cmx5KCk6IElBdXRvbWF0aW9uU2NoZWR1bGUge1xuXHRyZXR1cm4geyBpbnRlcnZhbDogJ2hvdXJseScsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH07XG59XG5cbmNvbnN0IEZPTERFUl9BID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS9hJyk7XG5jb25zdCBGT0xERVJfQiA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvYicpO1xuXG5mdW5jdGlvbiB3b3Jrc3BhY2VUYXJnZXQoZm9sZGVyVXJpID0gRk9MREVSX0EsIG9wdGlvbnM/OiB7IHJlYWRvbmx5IHByb3ZpZGVySWQ/OiBzdHJpbmc7IHJlYWRvbmx5IHNlc3Npb25UeXBlSWQ/OiBzdHJpbmc7IHJlYWRvbmx5IGlzb2xhdGlvbj86IEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24gfSk6IEF1dG9tYXRpb25UYXJnZXQge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICd3b3Jrc3BhY2UnLFxuXHRcdGZvbGRlclVyaSxcblx0XHRwcm92aWRlcklkOiBvcHRpb25zPy5wcm92aWRlcklkLFxuXHRcdHNlc3Npb25UeXBlSWQ6IG9wdGlvbnM/LnNlc3Npb25UeXBlSWQsXG5cdFx0aXNvbGF0aW9uOiBvcHRpb25zPy5pc29sYXRpb24gPz8geyBraW5kOiAnZGVmYXVsdCcgfSxcblx0fTtcbn1cblxuaW50ZXJmYWNlIElSZWNvcmRlZENhbGwge1xuXHRyZWFkb25seSBpc1F1aWNrQ2hhdDogYm9vbGVhbjtcblx0cmVhZG9ubHkgZm9sZGVyVXJpPzogVVJJO1xuXHRyZWFkb25seSBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zO1xuXHRyZWFkb25seSBjcmVhdGVPcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zO1xuXHRyZWFkb25seSB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW47XG59XG5cbmNsYXNzIEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cblx0cmVhZG9ubHkgY2FsbHM6IElSZWNvcmRlZENhbGxbXSA9IFtdO1xuXHR3b3Jrc3BhY2VUYXJnZXRBdmFpbGFibGUgPSB0cnVlO1xuXHRxdWlja0NoYXRUYXJnZXRBdmFpbGFibGUgPSB0cnVlO1xuXG5cdC8qKiBDb25maWd1cmUgaG93IHRoZSBuZXh0IGNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCBiZWhhdmVzLiAqL1xuXHRuZXh0U2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdG5leHRFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdC8qKiBPcHRpb25hbCBob29rIGZpcmVkIGFmdGVyIHRoZSBjYWxsIGlzIHJlY29yZGVkLCBiZWZvcmUgcmV0dXJuaW5nL3Rocm93aW5nLiAqL1xuXHRvblNlbmRIb29rOiAoKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIGlzTmV3U2Vzc2lvblRhcmdldEF2YWlsYWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VUYXJnZXRBdmFpbGFibGU7XG5cdH1cblxuXHRvdmVycmlkZSBpc1F1aWNrQ2hhdFRhcmdldEF2YWlsYWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5xdWlja0NoYXRUYXJnZXRBdmFpbGFibGU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QoXG5cdFx0Zm9sZGVyVXJpOiBVUkksXG5cdFx0b3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyxcblx0XHRjcmVhdGVPcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdCk6IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmNhbGxzLnB1c2goeyBpc1F1aWNrQ2hhdDogZmFsc2UsIGZvbGRlclVyaSwgb3B0aW9ucywgY3JlYXRlT3B0aW9ucywgdG9rZW4gfSk7XG5cdFx0aWYgKHRoaXMub25TZW5kSG9vaykge1xuXHRcdFx0YXdhaXQgdGhpcy5vblNlbmRIb29rKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm5leHRFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5uZXh0RXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5leHRTZXNzaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlQW5kU2VuZFF1aWNrQ2hhdFJlcXVlc3QoXG5cdFx0b3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyxcblx0XHRjcmVhdGVPcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdCk6IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmNhbGxzLnB1c2goeyBpc1F1aWNrQ2hhdDogdHJ1ZSwgb3B0aW9ucywgY3JlYXRlT3B0aW9ucywgdG9rZW4gfSk7XG5cdFx0aWYgKHRoaXMub25TZW5kSG9vaykge1xuXHRcdFx0YXdhaXQgdGhpcy5vblNlbmRIb29rKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm5leHRFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5uZXh0RXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm5leHRTZXNzaW9uO1xuXHR9XG59XG5cbmNsYXNzIFJlY29yZGluZ05vdGlmaWNhdGlvblNlcnZpY2UgZXh0ZW5kcyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSB7XG5cdHJlYWRvbmx5IGluZm9zOiBzdHJpbmdbXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGluZm8obWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5pbmZvcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdHJldHVybiBzdXBlci5pbmZvKG1lc3NhZ2UpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZha2VTZXNzaW9uKGlkOiBzdHJpbmcsIHN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZShgc3RhdHVzLSR7aWR9YCwgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLCBjaGF0U3RhdHVzID0gc3RhdHVzKTogSVNlc3Npb24ge1xuXHRyZXR1cm4gdXBjYXN0UGFydGlhbDxJU2Vzc2lvbj4oe1xuXHRcdHNlc3Npb25JZDogaWQsXG5cdFx0cmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLWNoYXQtc2Vzc2lvbicsIGF1dGhvcml0eTogJ3Rlc3QnLCBwYXRoOiBgLyR7aWR9YCB9KSxcblx0XHRzdGF0dXMsXG5cdFx0bWFpbkNoYXQ6IG9ic2VydmFibGVWYWx1ZShgbWFpbi1jaGF0LSR7aWR9YCwgdXBjYXN0UGFydGlhbDxJQ2hhdD4oeyBzdGF0dXM6IGNoYXRTdGF0dXMgfSkpLFxuXHR9KTtcbn1cblxuc3VpdGUoJ0F1dG9tYXRpb25SdW5uZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgdGVhcmRvd24gPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzZXR1cCgpIHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbG9nLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHNlc3Npb25zTWdtdCA9IG5ldyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSgpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnMgPSBuZXcgUmVjb3JkaW5nTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBBdXRvbWF0aW9uUnVubmVyKHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgbG9nLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgbm90aWZpY2F0aW9ucyk7XG5cdFx0cmV0dXJuIHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIsIG5vdGlmaWNhdGlvbnMgfTtcblx0fVxuXG5cdHRlc3QoJ2NyZWF0ZXMgYSBzZXNzaW9uIGZvciB0aGUgYXV0b21hdGlvbiBwcm9tcHQgYW5kIG1hcmtzIHRoZSBydW4gY29tcGxldGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3MxJyk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdkbyB0aGUgdGhpbmcnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYSwgJ3NjaGVkdWxlJywgOTkpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxsc1swXS5mb2xkZXJVcmk/LnRvU3RyaW5nKCksIEZPTERFUl9BLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHNbMF0ub3B0aW9ucy5xdWVyeSwgJ2RvIHRoZSB0aGluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHNbMF0ub3B0aW9ucy5iYWNrZ3JvdW5kLCB0cnVlKTtcblxuXHRcdGNvbnN0IHJ1bnMgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5zdGF0dXMsICdjb21wbGV0ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5zZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCksICd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vdGVzdC9zMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5zWzBdLnRyaWdnZXIsICdzY2hlZHVsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5zWzBdLmxlYWRlcldpbmRvd0lkLCA5OSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHRoZSBydW4gYWN0aXZlIHRocm91Z2ggTmVlZHNJbnB1dCBhbmQgcmVjb3JkcyB0aGUgc2Vzc2lvbiBiZWZvcmUgY29tcGxldGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IHN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdHVzLXMxJywgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dFNlc3Npb24gPSBmYWtlU2Vzc2lvbignczEnLCBzdGF0dXMpO1xuXG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAnZG8gdGhlIHRoaW5nJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uID0gcnVubmVyLnJ1bk9uY2UoYSwgJ3NjaGVkdWxlJywgOTkpO1xuXHRcdGxldCBkaXNwYXRjaGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZGlzcGF0Y2hQcm9taXNlID0gb3BlcmF0aW9uLndoZW5EaXNwYXRjaGVkLmZpbmFsbHkoKCkgPT4gZGlzcGF0Y2hlZCA9IHRydWUpO1xuXHRcdGNvbnN0IHJ1blByb21pc2UgPSBvcGVyYXRpb24ud2hlbkNvbXBsZXRlZC5maW5hbGx5KCgpID0+IHNldHRsZWQgPSB0cnVlKTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoUHJvbWlzZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UucnVucy5nZXQoKS5tYXAocnVuID0+ICh7XG5cdFx0XHRzdGF0dXM6IHJ1bi5zdGF0dXMsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJ1bi5zZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCksXG5cdFx0XHRjb21wbGV0ZWRBdDogcnVuLmNvbXBsZXRlZEF0LFxuXHRcdH0pKSwgW3tcblx0XHRcdHN0YXR1czogJ3J1bm5pbmcnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiAndnNjb2RlLWNoYXQtc2Vzc2lvbjovL3Rlc3QvczEnLFxuXHRcdFx0Y29tcGxldGVkQXQ6IHVuZGVmaW5lZCxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3BhdGNoZWQsIHRydWUpO1xuXG5cdFx0c3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXR0bGVkLFxuXHRcdFx0c3RhdHVzOiBzZXJ2aWNlLnJ1bnMuZ2V0KClbMF0uc3RhdHVzLFxuXHRcdFx0Y29tcGxldGVkQXQ6IHNlcnZpY2UucnVucy5nZXQoKVswXS5jb21wbGV0ZWRBdCxcblx0XHR9LCB7XG5cdFx0XHRzZXR0bGVkOiBmYWxzZSxcblx0XHRcdHN0YXR1czogJ3J1bm5pbmcnLFxuXHRcdFx0Y29tcGxldGVkQXQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdHN0YXR1cy5zZXQoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgcnVuUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5ydW5zLmdldCgpWzBdLnN0YXR1cywgJ2NvbXBsZXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wbGV0ZXMgdGhlIHJ1biB3aGVuIHRoZSBtYWluIGNoYXQgc3RvcHMgd2hpbGUgdGhlIGFnZ3JlZ2F0ZSBzZXNzaW9uIHJlbWFpbnMgYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdHVzLXMxJywgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRjb25zdCBjaGF0U3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKCdjaGF0LXN0YXR1cy1zMScsIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3MxJywgc2Vzc2lvblN0YXR1cywgY2hhdFN0YXR1cyk7XG5cblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IHJ1bm5lci5ydW5PbmNlKGF1dG9tYXRpb24sICdtYW51YWwnLCAxKTtcblx0XHRhd2FpdCBvcGVyYXRpb24ud2hlbkRpc3BhdGNoZWQ7XG5cblx0XHRjaGF0U3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBvcGVyYXRpb24ud2hlbkNvbXBsZXRlZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2Vzc2lvblN0YXR1czogc2Vzc2lvblN0YXR1cy5nZXQoKSxcblx0XHRcdHJ1blN0YXR1czogc2VydmljZS5ydW5zLmdldCgpWzBdLnN0YXR1cyxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uU3RhdHVzOiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRydW5TdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB0aGUgcnVuIGZhaWxlZCB3aGVuIHRoZSBzZXNzaW9uIHJlcG9ydHMgYW4gZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBzdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXR1cy1zMScsIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3MxJywgc3RhdHVzKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgcnVuUHJvbWlzZSA9IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEpLndoZW5Db21wbGV0ZWQ7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHNlcnZpY2UucnVucywgcnVucyA9PiBydW5zWzBdPy5zZXNzaW9uUmVzb3VyY2UgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRzdGF0dXMuc2V0KFNlc3Npb25TdGF0dXMuRXJyb3IsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgcnVuUHJvbWlzZTtcblxuXHRcdGNvbnN0IHJ1biA9IHNlcnZpY2UucnVucy5nZXQoKVswXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogcnVuLnN0YXR1cyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogcnVuLnNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKSxcblx0XHRcdGVycm9yTWVzc2FnZTogcnVuLmVycm9yTWVzc2FnZSxcblx0XHRcdGhhc0NvbXBsZXRlZEF0OiBydW4uY29tcGxldGVkQXQgIT09IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6ICdmYWlsZWQnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiAndnNjb2RlLWNoYXQtc2Vzc2lvbjovL3Rlc3QvczEnLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiAnQWdlbnQgc2Vzc2lvbiBmYWlsZWQuJyxcblx0XHRcdGhhc0NvbXBsZXRlZEF0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbHdheXMgdXNlcyB0aGUgYXV0b21hdGlvbiBmb2xkZXIgcmVnYXJkbGVzcyBvZiB0aGUgY3VycmVudCB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dFNlc3Npb24gPSBmYWtlU2Vzc2lvbignczEnKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0EnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogaG91cmx5KCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVJfQiksXG5cdFx0fSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYSwgJ3NjaGVkdWxlJywgMSkud2hlbkNvbXBsZXRlZDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHNbMF0uZm9sZGVyVXJpPy50b1N0cmluZygpLCBGT0xERVJfQi50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlcyBhIHdvcmtzcGFjZS1sZXNzIHF1aWNrIGNoYXQgd2l0aG91dCBmb2xkZXIgb3IgcmVwb3NpdG9yeSBjb25maWd1cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3F1aWNrJyk7XG5cblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdRdWljaycsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBob3VybHkoKSxcblx0XHRcdHRhcmdldDogeyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSxcblx0XHR9KTtcblx0XHRhd2FpdCBydW5uZXIucnVuT25jZShhdXRvbWF0aW9uLCAnc2NoZWR1bGUnLCAxKS53aGVuQ29tcGxldGVkO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHMubWFwKGNhbGwgPT4gKHtcblx0XHRcdGlzUXVpY2tDaGF0OiBjYWxsLmlzUXVpY2tDaGF0LFxuXHRcdFx0Zm9sZGVyVXJpOiBjYWxsLmZvbGRlclVyaSxcblx0XHRcdGNyZWF0ZU9wdGlvbnM6IGNhbGwuY3JlYXRlT3B0aW9ucyxcblx0XHR9KSksIFt7XG5cdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdGZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0Y3JlYXRlT3B0aW9uczoge1xuXHRcdFx0XHRwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsXG5cdFx0XHRcdHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzb2xhdGlvbk1vZGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0YnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndHJ1bmNhdGVzIHRoZSBzZXNzaW9uIHRpdGxlIHRvIDEwMCBjaGFyYWN0ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3MxJyk7XG5cblx0XHRjb25zdCBsb25nTmFtZSA9ICdBJy5yZXBlYXQoMTUwKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogbG9uZ05hbWUsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYSwgJ21hbnVhbCcsIDEpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzWzBdLm9wdGlvbnMudGl0bGUsICdBJy5yZXBlYXQoMTAwKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIHRoZSBydW4gZmFpbGVkIHdoZW4gY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdHNlc3Npb25zTWdtdC5uZXh0RXJyb3IgPSBuZXcgRXJyb3IoJ3Byb3ZpZGVyIG9mZmxpbmUnKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYSwgJ3NjaGVkdWxlJywgMSkud2hlbkNvbXBsZXRlZDtcblxuXHRcdGNvbnN0IHJ1bnMgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5zdGF0dXMsICdmYWlsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5lcnJvck1lc3NhZ2UsICdwcm92aWRlciBvZmZsaW5lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZmVycyBhIHNjaGVkdWxlZCBydW4gd2l0aG91dCBhZHZhbmNpbmcgaXRzIHNjaGVkdWxlIHdoZW4gdGhlIHRhcmdldCBpcyB1bmF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdHNlc3Npb25zTWdtdC53b3Jrc3BhY2VUYXJnZXRBdmFpbGFibGUgPSBmYWxzZTtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYXV0b21hdGlvbiwgJ3NjaGVkdWxlJywgMSkud2hlbkNvbXBsZXRlZDtcblxuXHRcdGNvbnN0IHVwZGF0ZWQgPSBzZXJ2aWNlLmdldEF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjYWxsczogc2Vzc2lvbnNNZ210LmNhbGxzLmxlbmd0aCxcblx0XHRcdHJ1bnM6IHNlcnZpY2UucnVucy5nZXQoKSxcblx0XHRcdGxhc3RSdW5BdDogdXBkYXRlZD8ubGFzdFJ1bkF0LFxuXHRcdFx0bmV4dFJ1bkF0OiB1cGRhdGVkPy5uZXh0UnVuQXQsXG5cdFx0fSwge1xuXHRcdFx0Y2FsbHM6IDAsXG5cdFx0XHRydW5zOiBbXSxcblx0XHRcdGxhc3RSdW5BdDogdW5kZWZpbmVkLFxuXHRcdFx0bmV4dFJ1bkF0OiBhdXRvbWF0aW9uLm5leHRSdW5BdCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBhbiB1bmF2YWlsYWJsZSB0YXJnZXQgZm9yIGEgbWFudWFsIHJ1biB3aXRob3V0IHJlY29yZGluZyBhIGZhaWx1cmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciwgbm90aWZpY2F0aW9ucyB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01nbXQucXVpY2tDaGF0VGFyZ2V0QXZhaWxhYmxlID0gZmFsc2U7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnVW5hdmFpbGFibGUnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogaG91cmx5KCksXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3F1aWNrQ2hhdCcsIHByb3ZpZGVySWQ6ICdsb2NhbC1hZ2VudC1ob3N0Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3RjbGknIH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBydW5uZXIucnVuT25jZShhdXRvbWF0aW9uLCAnbWFudWFsJywgMSkud2hlbkNvbXBsZXRlZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FsbHM6IHNlc3Npb25zTWdtdC5jYWxscy5sZW5ndGgsXG5cdFx0XHRydW5zOiBzZXJ2aWNlLnJ1bnMuZ2V0KCksXG5cdFx0XHRub3RpZmljYXRpb25zOiBub3RpZmljYXRpb25zLmluZm9zLFxuXHRcdH0sIHtcblx0XHRcdGNhbGxzOiAwLFxuXHRcdFx0cnVuczogW10sXG5cdFx0XHRub3RpZmljYXRpb25zOiBbJ0F1dG9tYXRpb24gXFwnVW5hdmFpbGFibGVcXCcgY2Fubm90IHN0YXJ0IHVudGlsIGl0cyBhZ2VudCBiZWNvbWVzIGF2YWlsYWJsZS4nXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgd2hlbiBhbm90aGVyIGFjdGl2ZSBydW4gZXhpc3RzIGZvciB0aGUgc2FtZSBhdXRvbWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkUnVuU3RhcnQoYS5pZCwgJ21hbnVhbCcsIDEpO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDIpLndoZW5Db21wbGV0ZWQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxscy5sZW5ndGgsIDApO1xuXHRcdGNvbnN0IHJ1bnMgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5zdGF0dXMsICdwZW5kaW5nJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIHRoZSBydW4gZmFpbGVkIHdoZW4gdGhlIGNhbmNlbGxhdGlvbiB0b2tlbiBpcyBhbHJlYWR5IGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYSwgJ3NjaGVkdWxlJywgMSwgY3RzLnRva2VuKS53aGVuQ29tcGxldGVkO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxscy5sZW5ndGgsIDApO1xuXHRcdGNvbnN0IHJ1bnMgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5zdGF0dXMsICdmYWlsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5lcnJvck1lc3NhZ2UsICdDYW5jZWxsZWQnKTtcblx0XHRjdHMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB0aGUgcnVuIGNhbmNlbGxlZCB3aGVuIHRoZSB0b2tlbiBpcyBjYW5jZWxsZWQgbWlkLWZsaWdodCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHNlc3Npb25zTWdtdC5uZXh0U2Vzc2lvbiA9IGZha2VTZXNzaW9uKCdzLW1pZCcpO1xuXHRcdHNlc3Npb25zTWdtdC5vblNlbmRIb29rID0gKCkgPT4ge1xuXHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdH07XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEsIGN0cy50b2tlbikud2hlbkNvbXBsZXRlZDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzWzBdLnRva2VuLCBjdHMudG9rZW4pO1xuXHRcdGNvbnN0IHJ1bnMgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5zdGF0dXMsICdmYWlsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5lcnJvck1lc3NhZ2UsICdDYW5jZWxsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5zZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCksICd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vdGVzdC9zLW1pZCcpO1xuXHRcdGN0cy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbHMgd2hpbGUgd2FpdGluZyBmb3IgdGhlIHNlc3Npb24gdG8gZmluaXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3Qgc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0dXMtcy13YWl0aW5nJywgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dFNlc3Npb24gPSBmYWtlU2Vzc2lvbigncy13YWl0aW5nJywgc3RhdHVzKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgcnVuUHJvbWlzZSA9IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEsIGN0cy50b2tlbikud2hlbkNvbXBsZXRlZDtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc2VydmljZS5ydW5zLCBydW5zID0+IHJ1bnNbMF0/LnNlc3Npb25SZXNvdXJjZSAhPT0gdW5kZWZpbmVkKTtcblxuXHRcdGN0cy5jYW5jZWwoKTtcblx0XHRhd2FpdCBydW5Qcm9taXNlO1xuXG5cdFx0Y29uc3QgcnVuID0gc2VydmljZS5ydW5zLmdldCgpWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBydW4uc3RhdHVzLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBydW4uc2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiBydW4uZXJyb3JNZXNzYWdlLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6ICd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vdGVzdC9zLXdhaXRpbmcnLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiAnQ2FuY2VsbGVkJyxcblx0XHR9KTtcblx0XHRjdHMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBvdmVyd3JpdGUgYSB0ZXJtaW5hbCBmYWlsdXJlIHdoZW4gY2FuY2VsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3Qgc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0dXMtcy10aW1lb3V0JywgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dFNlc3Npb24gPSBmYWtlU2Vzc2lvbigncy10aW1lb3V0Jywgc3RhdHVzKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgcnVuUHJvbWlzZSA9IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEsIGN0cy50b2tlbikud2hlbkNvbXBsZXRlZDtcblx0XHRjb25zdCBydW4gPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc2VydmljZS5ydW5zLm1hcChydW5zID0+IHJ1bnNbMF0pLCBydW4gPT4gcnVuPy5zZXNzaW9uUmVzb3VyY2UgIT09IHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2VydmljZS51cGRhdGVSdW4ocnVuLmlkLCB7XG5cdFx0XHRzdGF0dXM6ICdmYWlsZWQnLFxuXHRcdFx0Y29tcGxldGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdGVycm9yTWVzc2FnZTogJ1RpbWVkIG91dCcsXG5cdFx0fSk7XG5cblx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0YXdhaXQgcnVuUHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBzZXJ2aWNlLnJ1bnMuZ2V0KClbMF0uc3RhdHVzLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiBzZXJ2aWNlLnJ1bnMuZ2V0KClbMF0uZXJyb3JNZXNzYWdlLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXG5cdFx0XHRlcnJvck1lc3NhZ2U6ICdUaW1lZCBvdXQnLFxuXHRcdH0pO1xuXHRcdGN0cy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBsZXRlcyB0aGUgcnVuIGV2ZW4gd2hlbiB0aGUgc2VydmljZSByZXR1cm5zIHVuZGVmaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYSwgJ3NjaGVkdWxlJywgMSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkud2hlbkNvbXBsZXRlZDtcblxuXHRcdGNvbnN0IHJ1bnMgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5zdGF0dXMsICdjb21wbGV0ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5zZXNzaW9uUmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bhc3NlcyB0aGUgY2FwdHVyZWQgcHJvdmlkZXJJZCBhbmQgc2Vzc2lvblR5cGVJZCB0aHJvdWdoIHRvIGNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdHNlc3Npb25zTWdtdC5uZXh0U2Vzc2lvbiA9IGZha2VTZXNzaW9uKCdzMScpO1xuXG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnQScsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBob3VybHkoKSxcblx0XHRcdHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KEZPTERFUl9BLCB7IHByb3ZpZGVySWQ6ICdsb2NhbC1hZ2VudC1ob3N0Jywgc2Vzc2lvblR5cGVJZDogJ2FnZW50LWhvc3QtY29waWxvdGNsaScgfSksXG5cdFx0fSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYSwgJ3NjaGVkdWxlJywgMSkud2hlbkNvbXBsZXRlZDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxsc1swXS5jcmVhdGVPcHRpb25zLCB7XG5cdFx0XHRwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsXG5cdFx0XHRzZXNzaW9uVHlwZUlkOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyxcblx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdG1vZGVJZDogdW5kZWZpbmVkLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0XHRpc29sYXRpb25Nb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGFzc2VzIGNhcHR1cmVkIG1vZGUgYW5kIHBlcm1pc3Npb24gbGV2ZWwgdGhyb3VnaCB0byBjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dFNlc3Npb24gPSBmYWtlU2Vzc2lvbignczEnKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0EnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogaG91cmx5KCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpLFxuXHRcdFx0bW9kZTogJ2FnZW50Jyxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogJ2F1dG9waWxvdCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYSwgJ3NjaGVkdWxlJywgMSkud2hlbkNvbXBsZXRlZDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxsc1swXS5jcmVhdGVPcHRpb25zLCB7XG5cdFx0XHRwcm92aWRlcklkOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uVHlwZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6ICdhdXRvcGlsb3QnLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogdW5kZWZpbmVkLFxuXHRcdFx0YnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bhc3NlcyBhIGJyYW5jaCBvbmx5IGZvciBXb3JrdHJlZSBpc29sYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dFNlc3Npb24gPSBmYWtlU2Vzc2lvbignczEnKTtcblxuXHRcdGNvbnN0IHdvcmt0cmVlID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdXb3JrdHJlZScsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBob3VybHkoKSxcblx0XHRcdHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KEZPTERFUl9BLCB7IGlzb2xhdGlvbjogeyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2g6ICdmZWF0dXJlL3dvcmt0cmVlJyB9IH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnRm9sZGVyJyxcblx0XHRcdHByb21wdDogJ3AnLFxuXHRcdFx0c2NoZWR1bGU6IGhvdXJseSgpLFxuXHRcdFx0dGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoRk9MREVSX0IsIHsgaXNvbGF0aW9uOiB7IGtpbmQ6ICdmb2xkZXInIH0gfSksXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBydW5uZXIucnVuT25jZSh3b3JrdHJlZSwgJ3NjaGVkdWxlJywgMSkud2hlbkNvbXBsZXRlZDtcblx0XHRhd2FpdCBydW5uZXIucnVuT25jZShmb2xkZXIsICdzY2hlZHVsZScsIDEpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxscy5tYXAoY2FsbCA9PiBjYWxsLmNyZWF0ZU9wdGlvbnMpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHByb3ZpZGVySWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Vzc2lvblR5cGVJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGVJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdFx0YnJhbmNoOiAnZmVhdHVyZS93b3JrdHJlZScsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwcm92aWRlcklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlc3Npb25UeXBlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzb2xhdGlvbk1vZGU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIGNyZWF0ZU9wdGlvbnMgZW50aXJlbHkgd2hlbiBubyBwcm92aWRlci9zZXNzaW9uVHlwZSBpcyBjYXB0dXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdHNlc3Npb25zTWdtdC5uZXh0U2Vzc2lvbiA9IGZha2VTZXNzaW9uKCdzMScpO1xuXG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRhd2FpdCBydW5uZXIucnVuT25jZShhLCAnc2NoZWR1bGUnLCAxKS53aGVuQ29tcGxldGVkO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHNbMF0uY3JlYXRlT3B0aW9ucywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgdGhyb3cgaWYgdGhlIGF1dG9tYXRpb24gaXMgZGVsZXRlZCBtaWQtcnVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZUF1dG9tYXRpb24oYS5pZCk7XG5cdFx0Ly8gVGhlIHJ1bm5lciBkZXRlY3RzIHRoZSBkZWxldGlvbiB2aWEgZ2V0QXV0b21hdGlvbiBiZWZvcmUgYXR0ZW1wdGluZ1xuXHRcdC8vIHJlY29yZFJ1blN0YXJ0LCBiYWlscyBlYXJseSwgYW5kIHByb2R1Y2VzIG5vIHJ1biByb3dzLlxuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdtYW51YWwnLCAxKS53aGVuQ29tcGxldGVkO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UucnVucy5nZXQoKSwgW10pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsTUFBTSxxQkFBcUI7QUFDcEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywrQkFBK0I7QUFFeEMsU0FBMEIscUJBQXFCO0FBRS9DLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsU0FBOEI7QUFDdEMsU0FBTyxFQUFFLFVBQVUsVUFBVSxjQUFjLEdBQUcsZ0JBQWdCLEdBQUcsYUFBYSxFQUFFO0FBQ2pGO0FBRUEsTUFBTSxXQUFXLElBQUksTUFBTSxxQkFBcUI7QUFDaEQsTUFBTSxXQUFXLElBQUksTUFBTSxxQkFBcUI7QUFFaEQsU0FBUyxnQkFBZ0IsWUFBWSxVQUFVLFNBQWtKO0FBQ2hNLFNBQU87QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOO0FBQUEsSUFDQSxZQUFZLFNB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
