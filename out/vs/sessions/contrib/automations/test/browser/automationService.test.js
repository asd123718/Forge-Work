import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { AutomationStore } from "../../browser/automationService.js";
import { createAutomationService, TestAutomationStorageService } from "./automationTestUtils.js";
const FOLDER = URI.parse("file:///workspace");
function workspaceTarget(folderUri = FOLDER, isolation = { kind: "default" }) {
  return { kind: "workspace", folderUri, isolation };
}
function dailySchedule(hour = 9, minute = 0) {
  return { interval: "daily", scheduleHour: hour, scheduleMinute: minute, scheduleDay: 0 };
}
function serializeLedgerAutomation(id, name) {
  return {
    id,
    name,
    prompt: "p",
    schedule: dailySchedule(),
    target: { kind: "workspace", folderUri: FOLDER.toJSON(), isolation: { kind: "default" } },
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
suite("AutomationService", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  async function claimRun(service, automationId, trigger, leaderWindowId = 1) {
    const claim = await service.recordRunStart(automationId, trigger, leaderWindowId);
    assert.ok(claim.claimed, "expected the run slot to be claimed");
    return claim.run;
  }
  async function recordCompletedRun(service, automationId, trigger = "manual") {
    const run = await claimRun(service, automationId, trigger);
    return await service.updateRun(run.id, { status: "completed" }) ?? run;
  }
  function createService(storage) {
    const sharedStorage = teardown.add(storage ?? new InMemoryStorageService());
    const service = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    return { service, storage: sharedStorage };
  }
  test("starts with an empty ledger when nothing is persisted", () => {
    const { service } = createService();
    assert.deepStrictEqual(service.automations.get(), []);
    assert.deepStrictEqual(service.runs.get(), []);
  });
  test("provider stores isolate ledgers by storage key", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const automationStorage = new TestAutomationStorageService(storage);
    const first = teardown.add(new AutomationStore("automations.first", storage, new NullLogService(), NullTelemetryService, automationStorage));
    const second = teardown.add(new AutomationStore("automations.second", storage, new NullLogService(), NullTelemetryService, automationStorage));
    await first.createAutomation({ name: "First", prompt: "first", schedule: dailySchedule(), target: workspaceTarget() });
    await second.createAutomation({ name: "Second", prompt: "second", schedule: dailySchedule(), target: workspaceTarget() });
    assert.deepStrictEqual({
      first: first.automations.get().map((automation) => automation.name),
      second: second.automations.get().map((automation) => automation.name),
      firstPersisted: JSON.parse(storage.get("automations.first", StorageScope.APPLICATION)).automations.map((automation) => automation.name),
      secondPersisted: JSON.parse(storage.get("automations.second", StorageScope.APPLICATION)).automations.map((automation) => automation.name)
    }, {
      first: ["First"],
      second: ["Second"],
      firstPersisted: ["First"],
      secondPersisted: ["Second"]
    });
  });
  test("createAutomation appends an entry and computes nextRunAt for non-manual schedules", async () => {
    const { service } = createService();
    const a = await service.createAutomation({
      name: "Daily review",
      prompt: "Summarize what changed",
      schedule: dailySchedule(),
      target: workspaceTarget()
    });
    assert.strictEqual(service.automations.get().length, 1);
    assert.strictEqual(service.automations.get()[0].id, a.id);
    assert.ok(a.nextRunAt, "daily schedule should produce a nextRunAt");
    assert.strictEqual(a.enabled, true);
  });
  test("createAutomation with manual schedule leaves nextRunAt undefined", async () => {
    const { service } = createService();
    const a = await service.createAutomation({
      name: "Manual",
      prompt: "p",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: workspaceTarget()
    });
    assert.strictEqual(a.nextRunAt, void 0);
  });
  test("createAutomation throws when folderUri is missing", async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.createAutomation({
        name: "X",
        prompt: "p",
        schedule: dailySchedule(),
        target: { kind: "workspace", folderUri: void 0, isolation: { kind: "default" } }
      }),
      /folderUri/
    );
  });
  test("creates a workspace-less automation only with an explicit quick-chat target", async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.createAutomation({
        name: "Missing target",
        prompt: "p",
        schedule: dailySchedule(),
        target: { kind: "quickChat", providerId: void 0, sessionTypeId: void 0 }
      }),
      /providerId and sessionTypeId/
    );
    const automation = await service.createAutomation({
      name: "Workspace-less",
      prompt: "p",
      schedule: dailySchedule(),
      target: {
        kind: "quickChat",
        providerId: "local-agent-host",
        sessionTypeId: "copilotcli",
        folderUri: FOLDER,
        isolation: { kind: "worktree", branch: "stale" }
      }
    });
    assert.deepStrictEqual(automation.target, {
      kind: "quickChat",
      providerId: "local-agent-host",
      sessionTypeId: "copilotcli"
    });
  });
  test("rejects malformed worktree targets without a branch", async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.createAutomation({
        name: "Worktree",
        prompt: "p",
        schedule: dailySchedule(),
        target: workspaceTarget(FOLDER, { kind: "worktree", branch: "" })
      }),
      /requires a branch/
    );
  });
  test("updateAutomation recomputes nextRunAt when the schedule changes", async () => {
    const { service } = createService();
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: dailySchedule(9, 0),
      target: workspaceTarget()
    });
    const before = a.nextRunAt;
    const b = await service.updateAutomation(a.id, { schedule: dailySchedule(10, 30) });
    assert.notStrictEqual(b.nextRunAt, before);
  });
  test("updateAutomation keeps nextRunAt when only the name changes", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.updateAutomation(a.id, { name: "B" });
    assert.strictEqual(b.nextRunAt, a.nextRunAt);
    assert.strictEqual(b.name, "B");
  });
  test("updateAutomation can clear modelId/mode/permissionLevel by passing null but keeps folderUri", async () => {
    const { service } = createService();
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: dailySchedule(),
      target: workspaceTarget(),
      modelId: "gpt-4",
      mode: "agent",
      permissionLevel: "autopilot"
    });
    const b = await service.updateAutomation(a.id, { modelId: null, mode: null, permissionLevel: null });
    assert.strictEqual(b.modelId, void 0);
    assert.strictEqual(b.mode, void 0);
    assert.strictEqual(b.permissionLevel, void 0);
    assert.strictEqual(b.target.kind === "workspace" ? b.target.folderUri.toString() : void 0, FOLDER.toString());
  });
  test("updateAutomation switches folder when a new folderUri is provided", async () => {
    const { service } = createService();
    const other = URI.parse("file:///other");
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.updateAutomation(a.id, { target: workspaceTarget(other) });
    assert.strictEqual(b.target.kind === "workspace" ? b.target.folderUri.toString() : void 0, other.toString());
  });
  test("updateAutomation rejects incomplete workspace-less targets", async () => {
    const { service } = createService();
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await assert.rejects(
      () => service.updateAutomation(automation.id, {
        target: { kind: "quickChat", providerId: void 0, sessionTypeId: void 0 }
      }),
      /providerId and sessionTypeId/
    );
  });
  test("deleteAutomation removes the entry and orphan runs are dropped on reload", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const a = await firstService.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await firstService.recordRunStart(a.id, "manual", 1);
    assert.strictEqual(firstService.runs.get().length, 1);
    await firstService.deleteAutomation(a.id);
    assert.deepStrictEqual(firstService.automations.get(), []);
    assert.strictEqual(firstService.runs.get().length, 0);
    firstService.dispose();
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(secondService.automations.get(), []);
    assert.strictEqual(secondService.runs.get().length, 0);
  });
  test("recordRunStart inserts a pending run; updateRun applies a patch", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const run = await claimRun(service, a.id, "schedule", 42);
    assert.strictEqual(run.status, "pending");
    assert.strictEqual(run.leaderWindowId, 42);
    const updated = await service.updateRun(run.id, { status: "completed", sessionResource: URI.parse("vscode-chat-session://copilot/sess-1"), completedAt: (/* @__PURE__ */ new Date()).toISOString() });
    assert.strictEqual(updated?.status, "completed");
    assert.strictEqual(updated?.sessionResource?.toString(), "vscode-chat-session://copilot/sess-1");
  });
  test("deleteRun removes only the matching history entry", async () => {
    const { service } = createService();
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const first = await claimRun(service, automation.id, "manual");
    await service.updateRun(first.id, { status: "completed" });
    const second = await claimRun(service, automation.id, "manual");
    await service.deleteRun(first.id);
    assert.deepStrictEqual(service.runs.get().map((run) => run.id), [second.id]);
  });
  test("recordRunStart updates lastRunAt and advances the next scheduled run", async () => {
    const { service } = createService();
    service.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T00:00:00Z"));
    const automation = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: workspaceTarget()
    });
    service.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T10:00:00Z"));
    const run = await claimRun(service, automation.id, "catch_up");
    assert.deepStrictEqual({
      startedAt: run.startedAt,
      lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
      nextRunAt: service.getAutomation(automation.id)?.nextRunAt
    }, {
      startedAt: "2025-06-01T10:00:00.000Z",
      lastRunAt: "2025-06-01T10:00:00.000Z",
      nextRunAt: "2025-06-01T11:00:00.000Z"
    });
  });
  test("recordRunStart leaves schedule timestamps unchanged for a manual run", async () => {
    const { service } = createService();
    service.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T00:00:00Z"));
    const automation = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: workspaceTarget()
    });
    service.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T00:30:00Z"));
    const run = await claimRun(service, automation.id, "manual");
    assert.deepStrictEqual({
      startedAt: run.startedAt,
      lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
      nextRunAt: service.getAutomation(automation.id)?.nextRunAt
    }, {
      startedAt: "2025-06-01T00:30:00.000Z",
      lastRunAt: void 0,
      nextRunAt: automation.nextRunAt
    });
  });
  test("getActiveRunFor returns the first pending or running run for an automation", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    assert.strictEqual(service.getActiveRunFor(a.id), void 0);
    const run = await claimRun(service, a.id, "schedule");
    assert.strictEqual(service.getActiveRunFor(a.id)?.id, run.id);
    await service.updateRun(run.id, { status: "completed" });
    assert.strictEqual(service.getActiveRunFor(a.id), void 0);
  });
  test("markStaleRunsFailed moves pending and running rows to failed", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const r1 = await claimRun(service, a.id, "schedule");
    const r2 = await claimRun(service, b.id, "schedule");
    await service.updateRun(r1.id, { status: "running" });
    await service.markStaleRunsFailed("Interrupted");
    const all = service.runs.get();
    assert.deepStrictEqual(all.find((r) => r.id === r1.id)?.status, "failed");
    assert.deepStrictEqual(all.find((r) => r.id === r2.id)?.status, "failed");
    assert.strictEqual(all.find((r) => r.id === r1.id)?.errorMessage, "Interrupted");
  });
  test("runsFor filters to a single automation", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await recordCompletedRun(service, a.id, "schedule");
    await recordCompletedRun(service, b.id, "schedule");
    await recordCompletedRun(service, a.id, "manual");
    assert.strictEqual(service.runsFor(a.id).get().length, 2);
    assert.strictEqual(service.runsFor(b.id).get().length, 1);
  });
  test("recordRunStart caps retained runs per automation", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    for (let i = 0; i < 60; i++) {
      await recordCompletedRun(service, a.id);
    }
    for (let i = 0; i < 5; i++) {
      await recordCompletedRun(service, b.id);
    }
    assert.strictEqual(service.runsFor(a.id).get().length, 50);
    assert.strictEqual(service.runsFor(b.id).get().length, 5);
  });
  test("recordRunStart declines a second claim while a run is active", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const first = await claimRun(service, a.id, "manual");
    await service.updateRun(first.id, { status: "running" });
    const second = await service.recordRunStart(a.id, "schedule", 2);
    assert.deepStrictEqual({
      claimed: second.claimed,
      runId: second.run.id,
      totalRuns: service.runsFor(a.id).get().length
    }, {
      claimed: false,
      runId: first.id,
      totalRuns: 1
    });
  });
  test("concurrent claims from two windows produce a single run", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const a = await windowA.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const [first, second] = await Promise.all([
      windowA.recordRunStart(a.id, "manual", 1),
      windowB.recordRunStart(a.id, "manual", 2)
    ]);
    assert.deepStrictEqual({
      claimCount: [first, second].filter((claim) => claim.claimed).length,
      agreeOnRun: first.run.id === second.run.id,
      totalRuns: windowA.runsFor(a.id).get().length
    }, {
      claimCount: 1,
      agreeOnRun: true,
      totalRuns: 1
    });
  });
  test("persists across service restarts via shared storage", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const a = await firstService.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await firstService.recordRunStart(a.id, "manual", 7);
    firstService.dispose();
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    assert.strictEqual(secondService.automations.get().length, 1);
    assert.strictEqual(secondService.automations.get()[0].id, a.id);
    assert.strictEqual(secondService.runs.get().length, 1);
  });
  test("round-trips and clears Worktree branch configuration", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const created = await firstService.createAutomation({
      name: "A",
      prompt: "p",
      schedule: dailySchedule(),
      target: workspaceTarget(FOLDER, { kind: "worktree", branch: "feature/saved" })
    });
    firstService.dispose();
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const restored = secondService.getAutomation(created.id);
    const updated = await secondService.updateAutomation(created.id, { target: workspaceTarget(FOLDER, { kind: "folder" }) });
    assert.deepStrictEqual({
      restoredTarget: restored?.target,
      updatedTarget: updated.target
    }, {
      restoredTarget: workspaceTarget(FOLDER, { kind: "worktree", branch: "feature/saved" }),
      updatedTarget: workspaceTarget(FOLDER, { kind: "folder" })
    });
  });
  test("round-trips target changes without carrying repository configuration into quick-chat mode", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const created = await firstService.createAutomation({
      name: "A",
      prompt: "p",
      schedule: dailySchedule(),
      target: workspaceTarget(FOLDER, { kind: "worktree", branch: "feature/saved" })
    });
    const quickChat = await firstService.updateAutomation(created.id, {
      target: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    });
    firstService.dispose();
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const restored = secondService.getAutomation(created.id);
    const workspace = await secondService.updateAutomation(created.id, {
      target: workspaceTarget(FOLDER, { kind: "worktree", branch: "main" })
    });
    assert.deepStrictEqual({
      quickChat: quickChat.target,
      restored: restored?.target,
      workspace: workspace.target
    }, {
      quickChat: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" },
      restored: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" },
      workspace: workspaceTarget(FOLDER, { kind: "worktree", branch: "main" })
    });
  });
  test("two services on the same storage stay in sync via onDidChangeValue", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(windowB.automations.get(), []);
    const created = await windowA.createAutomation({ name: "X", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    assert.strictEqual(windowB.automations.get().length, 1);
    assert.strictEqual(windowB.automations.get()[0].id, created.id);
  });
  test("mutations preserve unrelated application storage values", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    storage.store("unrelated", "sentinel", StorageScope.APPLICATION, StorageTarget.MACHINE);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await service.updateAutomation(automation.id, { name: "Updated" });
    await service.recordRunStart(automation.id, "manual", 1);
    await service.deleteAutomation(automation.id);
    assert.strictEqual(storage.get("unrelated", StorageScope.APPLICATION), "sentinel");
  });
  test("guarded update rejects a concurrent editable change", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const reviewed = await windowA.createAutomation({ name: "Original", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await windowB.updateAutomation(reviewed.id, { prompt: "concurrent edit" });
    const result = await windowA.updateAutomationIfUnchanged(reviewed.id, { name: "Reviewed edit" }, reviewed);
    assert.deepStrictEqual(result.kind === "conflict" ? {
      kind: result.kind,
      currentName: result.current?.name,
      currentPrompt: result.current?.prompt
    } : result, {
      kind: "conflict",
      currentName: "Original",
      currentPrompt: "concurrent edit"
    });
  });
  test("guarded update tolerates concurrent runtime metadata changes", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    windowA.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T00:00:00Z"));
    const reviewed = await windowA.createAutomation({ name: "Original", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    windowB.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T10:00:00Z"));
    const run = await claimRun(windowB, reviewed.id, "schedule", 2);
    const runtimeState = windowB.getAutomation(reviewed.id);
    const result = await windowA.updateAutomationIfUnchanged(reviewed.id, { name: "Reviewed edit" }, reviewed);
    assert.deepStrictEqual(result.kind === "updated" ? {
      kind: result.kind,
      name: result.automation.name,
      lastRunAt: result.automation.lastRunAt,
      nextRunAt: result.automation.nextRunAt,
      runIds: windowA.runs.get().map((candidate) => candidate.id)
    } : result, {
      kind: "updated",
      name: "Reviewed edit",
      lastRunAt: runtimeState?.lastRunAt,
      nextRunAt: runtimeState?.nextRunAt,
      runIds: [run.id]
    });
  });
  test("concurrent create, edit, run, and delete mutations converge without lost updates", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const edited = await windowA.createAutomation({ name: "Edit me", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const deleted = await windowA.createAutomation({ name: "Delete me", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const [, claim, , created] = await Promise.all([
      windowA.updateAutomation(edited.id, { name: "Edited" }),
      windowB.recordRunStart(edited.id, "schedule", 2),
      windowA.deleteAutomation(deleted.id),
      windowB.createAutomation({ name: "Created", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() })
    ]);
    assert.deepStrictEqual({
      automations: windowA.automations.get().map((automation) => ({ id: automation.id, name: automation.name })).sort((a, b) => a.name.localeCompare(b.name)),
      runs: windowA.runs.get().map((candidate) => ({ id: candidate.id, automationId: candidate.automationId }))
    }, {
      automations: [
        { id: created.id, name: "Created" },
        { id: edited.id, name: "Edited" }
      ],
      runs: [{ id: claim.run.id, automationId: edited.id }]
    });
  });
  test("reading a ledger with a future schema version freezes observables and refuses to write", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const futureLedger = JSON.stringify({ schemaVersion: 999, revision: 7, automations: [], runs: [] });
    storage.store("chat.automations.ledger", futureLedger, -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(service.automations.get(), []);
    assert.deepStrictEqual(service.runs.get(), []);
    await assert.rejects(
      () => service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() }),
      /newer version/
    );
    assert.deepStrictEqual(service.automations.get(), []);
    assert.strictEqual(storage.get("chat.automations.ledger", -1), futureLedger);
  });
  test("refreshFromStorage preserves in-memory state when storage flips to an unsupported schema", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    await service.createAutomation({ name: "Local", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    assert.strictEqual(service.automations.get().length, 1);
    storage.store("chat.automations.ledger", JSON.stringify({ schemaVersion: 999, revision: 99, automations: [], runs: [] }), -1, 1);
    assert.strictEqual(service.automations.get().length, 1);
  });
  test("persist bumps the revision counter on every write", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const rev1 = JSON.parse(storage.get("chat.automations.ledger", -1)).revision;
    await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const rev2 = JSON.parse(storage.get("chat.automations.ledger", -1)).revision;
    assert.strictEqual(typeof rev1, "number");
    assert.ok(rev2 > rev1, `expected ${rev2} > ${rev1}`);
  });
  test("persist absorbs a higher on-disk revision (concurrent-write detection)", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const baseline = JSON.parse(storage.get("chat.automations.ledger", -1));
    storage.store("chat.automations.ledger", JSON.stringify({ ...baseline, revision: 5e3 }), -1, 1);
    await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const after = JSON.parse(storage.get("chat.automations.ledger", -1));
    assert.ok(after.revision > 5e3, `expected revision > 5000, got ${after.revision}`);
  });
  test("successful CAS accepts a restored lower revision without accepting stale notifications", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    storage.store("chat.automations.ledger", JSON.stringify({
      schemaVersion: 3,
      revision: 40,
      automations: [serializeLedgerAutomation("newer", "Before restore")],
      runs: []
    }), -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    const restoredLedger = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [serializeLedgerAutomation("restored", "Restored")],
      runs: []
    });
    storage.store("chat.automations.ledger", restoredLedger, -1, 1);
    const created = await service.createAutomation({
      name: "After restore",
      prompt: "p",
      schedule: dailySchedule(),
      target: workspaceTarget()
    });
    const persisted = JSON.parse(storage.get("chat.automations.ledger", -1));
    storage.store("chat.automations.ledger", restoredLedger, -1, 1);
    assert.deepStrictEqual({
      createdName: created.name,
      persistedRevision: persisted.revision,
      persistedNames: persisted.automations.map((automation) => automation.name),
      inMemoryNames: service.automations.get().map((automation) => automation.name)
    }, {
      createdName: "After restore",
      persistedRevision: 2,
      persistedNames: ["After restore", "Restored"],
      inMemoryNames: ["After restore", "Restored"]
    });
  });
  test("reading a corrupt ledger leaves observables empty without throwing", () => {
    const storage = teardown.add(new InMemoryStorageService());
    storage.store("chat.automations.ledger", "not json", -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(service.automations.get(), []);
  });
  test("drops a malformed schema v3 row without discarding valid rows", () => {
    const storage = teardown.add(new InMemoryStorageService());
    storage.store("chat.automations.ledger", JSON.stringify({
      schemaVersion: 3,
      automations: [
        {
          id: "keep",
          name: "Valid",
          prompt: "p",
          schedule: dailySchedule(),
          target: { kind: "workspace", folderUri: FOLDER.toJSON(), isolation: { kind: "default" } },
          enabled: true,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z"
        },
        null
      ],
      runs: [
        { id: "r-keep", automationId: "keep", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 }
      ]
    }), -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual({
      automationIds: service.automations.get().map((automation) => automation.id),
      runIds: service.runs.get().map((run) => run.id)
    }, {
      automationIds: ["keep"],
      runIds: ["r-keep"]
    });
  });
  test("migrates valid schema v1 records to v3 while dropping malformed targets", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const ledger = {
      schemaVersion: 1,
      automations: [
        { id: "orphan", name: "Old", prompt: "p", schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, enabled: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
        { id: "orphan-quick", name: "Old Quick", prompt: "p", schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, isQuickChat: true, enabled: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
        { id: "keep", name: "Valid", prompt: "p", schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, folderUri: FOLDER.toJSON(), enabled: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
        { id: "quick", name: "Quick", prompt: "p", schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, isQuickChat: true, providerId: "local-agent-host", sessionTypeId: "copilotcli", enabled: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" }
      ],
      runs: [
        { id: "r-orphan", automationId: "orphan", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 },
        { id: "r-orphan-quick", automationId: "orphan-quick", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 },
        { id: "r-keep", automationId: "keep", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 },
        { id: "r-quick", automationId: "quick", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 }
      ]
    };
    storage.store("chat.automations.ledger", JSON.stringify(ledger), -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual({
      automations: service.automations.get().map((automation) => ({ id: automation.id, targetKind: automation.target.kind })),
      runs: service.runs.get().map((run) => run.id)
    }, {
      automations: [
        { id: "keep", targetKind: "workspace" },
        { id: "quick", targetKind: "quickChat" }
      ],
      runs: ["r-keep", "r-quick"]
    });
    await service.updateAutomation("keep", { name: "Updated" });
    const migrated = JSON.parse(storage.get("chat.automations.ledger", -1));
    assert.deepStrictEqual({
      schemaVersion: migrated.schemaVersion,
      automationIds: migrated.automations.map((automation) => automation.id),
      runIds: migrated.runs.map((run) => run.id)
    }, {
      schemaVersion: 3,
      automationIds: ["keep", "quick"],
      runIds: ["r-keep", "r-quick"]
    });
  });
  test("migrates schema v2 flat targets to schema v3 target unions", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const common = {
      prompt: "p",
      schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 },
      enabled: true,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z"
    };
    storage.store("chat.automations.ledger", JSON.stringify({
      schemaVersion: 2,
      automations: [
        { ...common, id: "workspace", name: "Workspace", folderUri: FOLDER.toJSON(), isolationMode: "worktree", branch: "feature/saved" },
        { ...common, id: "legacy-worktree", name: "Legacy Worktree", folderUri: FOLDER.toJSON(), isolationMode: "worktree" },
        { ...common, id: "quick", name: "Quick", isQuickChat: true, providerId: "local-agent-host", sessionTypeId: "copilotcli" }
      ],
      runs: []
    }), -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(service.automations.get().map((automation) => automation.target), [
      workspaceTarget(FOLDER, { kind: "worktree", branch: "feature/saved" }),
      workspaceTarget(FOLDER, { kind: "default" }),
      { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    ]);
    await service.updateAutomation("workspace", { name: "Updated" });
    const migrated = JSON.parse(storage.get("chat.automations.ledger", -1));
    assert.strictEqual(migrated.schemaVersion, 3);
  });
  test("round-trips a folderUri through persistence", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const uri = URI.parse("file:///workspace/project");
    await firstService.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget(uri) });
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const reloaded = secondService.automations.get()[0];
    assert.deepStrictEqual(reloaded.target, workspaceTarget(uri));
  });
  test("reads a string sessionResource as a URI and writes it back as a string", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const sessionResource = "vscode-chat-session://copilot/sess-42";
    storage.store("chat.automations.ledger", JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [serializeLedgerAutomation("a1", "A")],
      runs: [{
        id: "run-1",
        automationId: "a1",
        status: "running",
        trigger: "schedule",
        sessionResource,
        startedAt: "2026-01-01T00:00:00.000Z",
        leaderWindowId: 1
      }]
    }), -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    const loadedRun = service.runs.get()[0];
    await service.updateRun("run-1", { status: "completed", completedAt: "2026-01-01T00:01:00.000Z" });
    const persisted = JSON.parse(storage.get("chat.automations.ledger", -1));
    assert.deepStrictEqual({
      loadedIsUri: URI.isUri(loadedRun.sessionResource),
      loadedString: loadedRun.sessionResource?.toString(),
      persistedType: typeof persisted.runs[0].sessionResource,
      persistedString: persisted.runs[0].sessionResource
    }, {
      loadedIsUri: true,
      loadedString: sessionResource,
      persistedType: "string",
      persistedString: sessionResource
    });
  });
  test("disposal does not interfere with later in-store reads", () => {
    const store = new DisposableStore();
    const storage = store.add(new InMemoryStorageService());
    const service = store.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(service.automations.get(), []);
    store.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXHRlc3RcXGJyb3dzZXJcXGF1dG9tYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uU2VydmljZSwgQXV0b21hdGlvblN0b3JlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uUnVuVHJpZ2dlciwgQXV0b21hdGlvblRhcmdldCwgQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbiwgSUF1dG9tYXRpb25SdW4sIElBdXRvbWF0aW9uU2NoZWR1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlLCBUZXN0QXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi9hdXRvbWF0aW9uVGVzdFV0aWxzLmpzJztcblxuY29uc3QgRk9MREVSID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuXG5mdW5jdGlvbiB3b3Jrc3BhY2VUYXJnZXQoZm9sZGVyVXJpID0gRk9MREVSLCBpc29sYXRpb246IEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24gPSB7IGtpbmQ6ICdkZWZhdWx0JyB9KTogQXV0b21hdGlvblRhcmdldCB7XG5cdHJldHVybiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmksIGlzb2xhdGlvbiB9O1xufVxuXG5mdW5jdGlvbiBkYWlseVNjaGVkdWxlKGhvdXIgPSA5LCBtaW51dGUgPSAwKTogSUF1dG9tYXRpb25TY2hlZHVsZSB7XG5cdHJldHVybiB7IGludGVydmFsOiAnZGFpbHknLCBzY2hlZHVsZUhvdXI6IGhvdXIsIHNjaGVkdWxlTWludXRlOiBtaW51dGUsIHNjaGVkdWxlRGF5OiAwIH07XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUxlZGdlckF1dG9tYXRpb24oaWQ6IHN0cmluZywgbmFtZTogc3RyaW5nKSB7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0bmFtZSxcblx0XHRwcm9tcHQ6ICdwJyxcblx0XHRzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLFxuXHRcdHRhcmdldDogeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBGT0xERVIudG9KU09OKCksIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9LFxuXHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0Y3JlYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHR1cGRhdGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHR9O1xufVxuXG5zdWl0ZSgnQXV0b21hdGlvblNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgdGVhcmRvd24gPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvKiogUmVjb3JkcyBhIHJ1biwgYXNzZXJ0aW5nIHRoZSBhdXRvbWF0aW9uJ3MgYWN0aXZlLXJ1biBzbG90IHdhcyBmcmVlLiAqL1xuXHRhc3luYyBmdW5jdGlvbiBjbGFpbVJ1bihzZXJ2aWNlOiBBdXRvbWF0aW9uU2VydmljZSwgYXV0b21hdGlvbklkOiBzdHJpbmcsIHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyLCBsZWFkZXJXaW5kb3dJZCA9IDEpOiBQcm9taXNlPElBdXRvbWF0aW9uUnVuPiB7XG5cdFx0Y29uc3QgY2xhaW0gPSBhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb25JZCwgdHJpZ2dlciwgbGVhZGVyV2luZG93SWQpO1xuXHRcdGFzc2VydC5vayhjbGFpbS5jbGFpbWVkLCAnZXhwZWN0ZWQgdGhlIHJ1biBzbG90IHRvIGJlIGNsYWltZWQnKTtcblx0XHRyZXR1cm4gY2xhaW0ucnVuO1xuXHR9XG5cblx0LyoqIFJlY29yZHMgYSBydW4gYW5kIGNvbXBsZXRlcyBpdCBzbyB0aGUgYXV0b21hdGlvbidzIHNsb3QgaXMgZnJlZSBmb3IgdGhlIG5leHQgb25lLiAqL1xuXHRhc3luYyBmdW5jdGlvbiByZWNvcmRDb21wbGV0ZWRSdW4oc2VydmljZTogQXV0b21hdGlvblNlcnZpY2UsIGF1dG9tYXRpb25JZDogc3RyaW5nLCB0cmlnZ2VyOiBBdXRvbWF0aW9uUnVuVHJpZ2dlciA9ICdtYW51YWwnKTogUHJvbWlzZTxJQXV0b21hdGlvblJ1bj4ge1xuXHRcdGNvbnN0IHJ1biA9IGF3YWl0IGNsYWltUnVuKHNlcnZpY2UsIGF1dG9tYXRpb25JZCwgdHJpZ2dlcik7XG5cdFx0cmV0dXJuIGF3YWl0IHNlcnZpY2UudXBkYXRlUnVuKHJ1bi5pZCwgeyBzdGF0dXM6ICdjb21wbGV0ZWQnIH0pID8/IHJ1bjtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2Uoc3RvcmFnZT86IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UpOiB7IHNlcnZpY2U6IEF1dG9tYXRpb25TZXJ2aWNlOyBzdG9yYWdlOiBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlIH0ge1xuXHRcdGNvbnN0IHNoYXJlZFN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQoc3RvcmFnZSA/PyBuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdHJldHVybiB7IHNlcnZpY2UsIHN0b3JhZ2U6IHNoYXJlZFN0b3JhZ2UgfTtcblx0fVxuXG5cdHRlc3QoJ3N0YXJ0cyB3aXRoIGFuIGVtcHR5IGxlZGdlciB3aGVuIG5vdGhpbmcgaXMgcGVyc2lzdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5ydW5zLmdldCgpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3ZpZGVyIHN0b3JlcyBpc29sYXRlIGxlZGdlcnMgYnkgc3RvcmFnZSBrZXknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU3RvcmFnZSA9IG5ldyBUZXN0QXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlKHN0b3JhZ2UpO1xuXHRcdGNvbnN0IGZpcnN0ID0gdGVhcmRvd24uYWRkKG5ldyBBdXRvbWF0aW9uU3RvcmUoJ2F1dG9tYXRpb25zLmZpcnN0Jywgc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBhdXRvbWF0aW9uU3RvcmFnZSkpO1xuXHRcdGNvbnN0IHNlY29uZCA9IHRlYXJkb3duLmFkZChuZXcgQXV0b21hdGlvblN0b3JlKCdhdXRvbWF0aW9ucy5zZWNvbmQnLCBzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGF1dG9tYXRpb25TdG9yYWdlKSk7XG5cblx0XHRhd2FpdCBmaXJzdC5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0ZpcnN0JywgcHJvbXB0OiAnZmlyc3QnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHNlY29uZC5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ1NlY29uZCcsIHByb21wdDogJ3NlY29uZCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0OiBmaXJzdC5hdXRvbWF0aW9ucy5nZXQoKS5tYXAoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0c2Vjb25kOiBzZWNvbmQuYXV0b21hdGlvbnMuZ2V0KCkubWFwKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5uYW1lKSxcblx0XHRcdGZpcnN0UGVyc2lzdGVkOiBKU09OLnBhcnNlKHN0b3JhZ2UuZ2V0KCdhdXRvbWF0aW9ucy5maXJzdCcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikhKS5hdXRvbWF0aW9ucy5tYXAoKGF1dG9tYXRpb246IHsgbmFtZTogc3RyaW5nIH0pID0+IGF1dG9tYXRpb24ubmFtZSksXG5cdFx0XHRzZWNvbmRQZXJzaXN0ZWQ6IEpTT04ucGFyc2Uoc3RvcmFnZS5nZXQoJ2F1dG9tYXRpb25zLnNlY29uZCcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikhKS5hdXRvbWF0aW9ucy5tYXAoKGF1dG9tYXRpb246IHsgbmFtZTogc3RyaW5nIH0pID0+IGF1dG9tYXRpb24ubmFtZSksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3Q6IFsnRmlyc3QnXSxcblx0XHRcdHNlY29uZDogWydTZWNvbmQnXSxcblx0XHRcdGZpcnN0UGVyc2lzdGVkOiBbJ0ZpcnN0J10sXG5cdFx0XHRzZWNvbmRQZXJzaXN0ZWQ6IFsnU2Vjb25kJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUF1dG9tYXRpb24gYXBwZW5kcyBhbiBlbnRyeSBhbmQgY29tcHV0ZXMgbmV4dFJ1bkF0IGZvciBub24tbWFudWFsIHNjaGVkdWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdEYWlseSByZXZpZXcnLFxuXHRcdFx0cHJvbXB0OiAnU3VtbWFyaXplIHdoYXQgY2hhbmdlZCcsXG5cdFx0XHRzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLFxuXHRcdFx0dGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpWzBdLmlkLCBhLmlkKTtcblx0XHRhc3NlcnQub2soYS5uZXh0UnVuQXQsICdkYWlseSBzY2hlZHVsZSBzaG91bGQgcHJvZHVjZSBhIG5leHRSdW5BdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLmVuYWJsZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBdXRvbWF0aW9uIHdpdGggbWFudWFsIHNjaGVkdWxlIGxlYXZlcyBuZXh0UnVuQXQgdW5kZWZpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ01hbnVhbCcsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCksXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEubmV4dFJ1bkF0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBdXRvbWF0aW9uIHRocm93cyB3aGVuIGZvbGRlclVyaSBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdFx0bmFtZTogJ1gnLFxuXHRcdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdFx0c2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSxcblx0XHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IHVuZGVmaW5lZCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0gYXMgdW5rbm93biBhcyBBdXRvbWF0aW9uVGFyZ2V0LFxuXHRcdFx0fSksXG5cdFx0XHQvZm9sZGVyVXJpLyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIGEgd29ya3NwYWNlLWxlc3MgYXV0b21hdGlvbiBvbmx5IHdpdGggYW4gZXhwbGljaXQgcXVpY2stY2hhdCB0YXJnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0XHRuYW1lOiAnTWlzc2luZyB0YXJnZXQnLFxuXHRcdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdFx0c2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSxcblx0XHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiB1bmRlZmluZWQsIHNlc3Npb25UeXBlSWQ6IHVuZGVmaW5lZCB9IGFzIHVua25vd24gYXMgQXV0b21hdGlvblRhcmdldCxcblx0XHRcdH0pLFxuXHRcdFx0L3Byb3ZpZGVySWQgYW5kIHNlc3Npb25UeXBlSWQvLFxuXHRcdCk7XG5cblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdXb3Jrc3BhY2UtbGVzcycsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksXG5cdFx0XHR0YXJnZXQ6IHtcblx0XHRcdFx0a2luZDogJ3F1aWNrQ2hhdCcsXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICdsb2NhbC1hZ2VudC1ob3N0Jyxcblx0XHRcdFx0c2Vzc2lvblR5cGVJZDogJ2NvcGlsb3RjbGknLFxuXHRcdFx0XHRmb2xkZXJVcmk6IEZPTERFUixcblx0XHRcdFx0aXNvbGF0aW9uOiB7IGtpbmQ6ICd3b3JrdHJlZScsIGJyYW5jaDogJ3N0YWxlJyB9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIEF1dG9tYXRpb25UYXJnZXQsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF1dG9tYXRpb24udGFyZ2V0LCB7XG5cdFx0XHRraW5kOiAncXVpY2tDaGF0Jyxcblx0XHRcdHByb3ZpZGVySWQ6ICdsb2NhbC1hZ2VudC1ob3N0Jyxcblx0XHRcdHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBtYWxmb3JtZWQgd29ya3RyZWUgdGFyZ2V0cyB3aXRob3V0IGEgYnJhbmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdFx0bmFtZTogJ1dvcmt0cmVlJyxcblx0XHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRcdHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksXG5cdFx0XHRcdHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KEZPTERFUiwgeyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2g6ICcnIH0pLFxuXHRcdFx0fSksXG5cdFx0XHQvcmVxdWlyZXMgYSBicmFuY2gvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZUF1dG9tYXRpb24gcmVjb21wdXRlcyBuZXh0UnVuQXQgd2hlbiB0aGUgc2NoZWR1bGUgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdBJyxcblx0XHRcdHByb21wdDogJ3AnLFxuXHRcdFx0c2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoOSwgMCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGJlZm9yZSA9IGEubmV4dFJ1bkF0O1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBzZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb24oYS5pZCwgeyBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgxMCwgMzApIH0pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChiLm5leHRSdW5BdCwgYmVmb3JlKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlQXV0b21hdGlvbiBrZWVwcyBuZXh0UnVuQXQgd2hlbiBvbmx5IHRoZSBuYW1lIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgYiA9IGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihhLmlkLCB7IG5hbWU6ICdCJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5uZXh0UnVuQXQsIGEubmV4dFJ1bkF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5uYW1lLCAnQicpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVBdXRvbWF0aW9uIGNhbiBjbGVhciBtb2RlbElkL21vZGUvcGVybWlzc2lvbkxldmVsIGJ5IHBhc3NpbmcgbnVsbCBidXQga2VlcHMgZm9sZGVyVXJpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSxcblx0XHRcdHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCksXG5cdFx0XHRtb2RlbElkOiAnZ3B0LTQnLFxuXHRcdFx0bW9kZTogJ2FnZW50Jyxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogJ2F1dG9waWxvdCcsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYiA9IGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihhLmlkLCB7IG1vZGVsSWQ6IG51bGwsIG1vZGU6IG51bGwsIHBlcm1pc3Npb25MZXZlbDogbnVsbCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5tb2RlbElkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLm1vZGUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIucGVybWlzc2lvbkxldmVsLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnRhcmdldC5raW5kID09PSAnd29ya3NwYWNlJyA/IGIudGFyZ2V0LmZvbGRlclVyaS50b1N0cmluZygpIDogdW5kZWZpbmVkLCBGT0xERVIudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZUF1dG9tYXRpb24gc3dpdGNoZXMgZm9sZGVyIHdoZW4gYSBuZXcgZm9sZGVyVXJpIGlzIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IG90aGVyID0gVVJJLnBhcnNlKCdmaWxlOi8vL290aGVyJyk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgYiA9IGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihhLmlkLCB7IHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KG90aGVyKSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi50YXJnZXQua2luZCA9PT0gJ3dvcmtzcGFjZScgPyBiLnRhcmdldC5mb2xkZXJVcmkudG9TdHJpbmcoKSA6IHVuZGVmaW5lZCwgb3RoZXIudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZUF1dG9tYXRpb24gcmVqZWN0cyBpbmNvbXBsZXRlIHdvcmtzcGFjZS1sZXNzIHRhcmdldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihhdXRvbWF0aW9uLmlkLCB7XG5cdFx0XHRcdHRhcmdldDogeyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogdW5kZWZpbmVkLCBzZXNzaW9uVHlwZUlkOiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIEF1dG9tYXRpb25UYXJnZXQsXG5cdFx0XHR9KSxcblx0XHRcdC9wcm92aWRlcklkIGFuZCBzZXNzaW9uVHlwZUlkLyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVBdXRvbWF0aW9uIHJlbW92ZXMgdGhlIGVudHJ5IGFuZCBvcnBoYW4gcnVucyBhcmUgZHJvcHBlZCBvbiByZWxvYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hhcmVkU3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBmaXJzdFNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IGZpcnN0U2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRhd2FpdCBmaXJzdFNlcnZpY2UucmVjb3JkUnVuU3RhcnQoYS5pZCwgJ21hbnVhbCcsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFNlcnZpY2UucnVucy5nZXQoKS5sZW5ndGgsIDEpO1xuXHRcdGF3YWl0IGZpcnN0U2VydmljZS5kZWxldGVBdXRvbWF0aW9uKGEuaWQpO1xuXHRcdC8vIERlbGV0aW5nIGNvbW1pdHMgYSBuZXcgbGVkZ2VyLCB3aGljaCB0cmlnZ2VycyBhIHJlbG9hZCB0aGF0XG5cdFx0Ly8gZHJvcHMgdGhlIG5vdy1vcnBoYW5lZCBydW4gc28gdGhlIGxlZGdlciBkb2VzIG5vdCBncm93IGZvcmV2ZXIuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdFNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RTZXJ2aWNlLnJ1bnMuZ2V0KCkubGVuZ3RoLCAwKTtcblx0XHRmaXJzdFNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kU2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY29uZFNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kU2VydmljZS5ydW5zLmdldCgpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZFJ1blN0YXJ0IGluc2VydHMgYSBwZW5kaW5nIHJ1bjsgdXBkYXRlUnVuIGFwcGxpZXMgYSBwYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRjb25zdCBydW4gPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhLmlkLCAnc2NoZWR1bGUnLCA0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bi5zdGF0dXMsICdwZW5kaW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bi5sZWFkZXJXaW5kb3dJZCwgNDIpO1xuXHRcdGNvbnN0IHVwZGF0ZWQgPSBhd2FpdCBzZXJ2aWNlLnVwZGF0ZVJ1bihydW4uaWQsIHsgc3RhdHVzOiAnY29tcGxldGVkJywgc2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9jb3BpbG90L3Nlc3MtMScpLCBjb21wbGV0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVkPy5zdGF0dXMsICdjb21wbGV0ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXBkYXRlZD8uc2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpLCAndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2NvcGlsb3Qvc2Vzcy0xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVJ1biByZW1vdmVzIG9ubHkgdGhlIG1hdGNoaW5nIGhpc3RvcnkgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhdXRvbWF0aW9uLmlkLCAnbWFudWFsJyk7XG5cdFx0YXdhaXQgc2VydmljZS51cGRhdGVSdW4oZmlyc3QuaWQsIHsgc3RhdHVzOiAnY29tcGxldGVkJyB9KTtcblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhdXRvbWF0aW9uLmlkLCAnbWFudWFsJyk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZVJ1bihmaXJzdC5pZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UucnVucy5nZXQoKS5tYXAocnVuID0+IHJ1bi5pZCksIFtzZWNvbmQuaWRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkUnVuU3RhcnQgdXBkYXRlcyBsYXN0UnVuQXQgYW5kIGFkdmFuY2VzIHRoZSBuZXh0IHNjaGVkdWxlZCBydW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gbmV3IERhdGUoJzIwMjUtMDYtMDFUMDA6MDA6MDBaJykpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0EnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ2hvdXJseScsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpLFxuXHRcdH0pO1xuXG5cdFx0c2VydmljZS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gbmV3IERhdGUoJzIwMjUtMDYtMDFUMTA6MDA6MDBaJykpO1xuXHRcdGNvbnN0IHJ1biA9IGF3YWl0IGNsYWltUnVuKHNlcnZpY2UsIGF1dG9tYXRpb24uaWQsICdjYXRjaF91cCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydGVkQXQ6IHJ1bi5zdGFydGVkQXQsXG5cdFx0XHRsYXN0UnVuQXQ6IHNlcnZpY2UuZ2V0QXV0b21hdGlvbihhdXRvbWF0aW9uLmlkKT8ubGFzdFJ1bkF0LFxuXHRcdFx0bmV4dFJ1bkF0OiBzZXJ2aWNlLmdldEF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCk/Lm5leHRSdW5BdCxcblx0XHR9LCB7XG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTA2LTAxVDEwOjAwOjAwLjAwMFonLFxuXHRcdFx0bGFzdFJ1bkF0OiAnMjAyNS0wNi0wMVQxMDowMDowMC4wMDBaJyxcblx0XHRcdG5leHRSdW5BdDogJzIwMjUtMDYtMDFUMTE6MDA6MDAuMDAwWicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZFJ1blN0YXJ0IGxlYXZlcyBzY2hlZHVsZSB0aW1lc3RhbXBzIHVuY2hhbmdlZCBmb3IgYSBtYW51YWwgcnVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc2V0Q2xvY2tGb3JUZXN0aW5nKCgpID0+IG5ldyBEYXRlKCcyMDI1LTA2LTAxVDAwOjAwOjAwWicpKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdBJyxcblx0XHRcdHByb21wdDogJ3AnLFxuXHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdob3VybHknLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0dGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSxcblx0XHR9KTtcblxuXHRcdHNlcnZpY2Uuc2V0Q2xvY2tGb3JUZXN0aW5nKCgpID0+IG5ldyBEYXRlKCcyMDI1LTA2LTAxVDAwOjMwOjAwWicpKTtcblx0XHRjb25zdCBydW4gPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhdXRvbWF0aW9uLmlkLCAnbWFudWFsJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0ZWRBdDogcnVuLnN0YXJ0ZWRBdCxcblx0XHRcdGxhc3RSdW5BdDogc2VydmljZS5nZXRBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQpPy5sYXN0UnVuQXQsXG5cdFx0XHRuZXh0UnVuQXQ6IHNlcnZpY2UuZ2V0QXV0b21hdGlvbihhdXRvbWF0aW9uLmlkKT8ubmV4dFJ1bkF0LFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDYtMDFUMDA6MzA6MDAuMDAwWicsXG5cdFx0XHRsYXN0UnVuQXQ6IHVuZGVmaW5lZCxcblx0XHRcdG5leHRSdW5BdDogYXV0b21hdGlvbi5uZXh0UnVuQXQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFjdGl2ZVJ1bkZvciByZXR1cm5zIHRoZSBmaXJzdCBwZW5kaW5nIG9yIHJ1bm5pbmcgcnVuIGZvciBhbiBhdXRvbWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEFjdGl2ZVJ1bkZvcihhLmlkKSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBydW4gPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhLmlkLCAnc2NoZWR1bGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRBY3RpdmVSdW5Gb3IoYS5pZCk/LmlkLCBydW4uaWQpO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUnVuKHJ1bi5pZCwgeyBzdGF0dXM6ICdjb21wbGV0ZWQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEFjdGl2ZVJ1bkZvcihhLmlkKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya1N0YWxlUnVuc0ZhaWxlZCBtb3ZlcyBwZW5kaW5nIGFuZCBydW5uaW5nIHJvd3MgdG8gZmFpbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQicsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdC8vIE9uZSByb3cgcGVyIHN0YXRlOiBvbmx5IG9uZSBydW4gcGVyIGF1dG9tYXRpb24gY2FuIGJlIGFjdGl2ZSBhdCBhIHRpbWUuXG5cdFx0Y29uc3QgcjEgPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhLmlkLCAnc2NoZWR1bGUnKTtcblx0XHRjb25zdCByMiA9IGF3YWl0IGNsYWltUnVuKHNlcnZpY2UsIGIuaWQsICdzY2hlZHVsZScpO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUnVuKHIxLmlkLCB7IHN0YXR1czogJ3J1bm5pbmcnIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UubWFya1N0YWxlUnVuc0ZhaWxlZCgnSW50ZXJydXB0ZWQnKTtcblx0XHRjb25zdCBhbGwgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZmluZChyID0+IHIuaWQgPT09IHIxLmlkKT8uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZmluZChyID0+IHIuaWQgPT09IHIyLmlkKT8uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFsbC5maW5kKHIgPT4gci5pZCA9PT0gcjEuaWQpPy5lcnJvck1lc3NhZ2UsICdJbnRlcnJ1cHRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5zRm9yIGZpbHRlcnMgdG8gYSBzaW5nbGUgYXV0b21hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRjb25zdCBiID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0InLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRhd2FpdCByZWNvcmRDb21wbGV0ZWRSdW4oc2VydmljZSwgYS5pZCwgJ3NjaGVkdWxlJyk7XG5cdFx0YXdhaXQgcmVjb3JkQ29tcGxldGVkUnVuKHNlcnZpY2UsIGIuaWQsICdzY2hlZHVsZScpO1xuXHRcdGF3YWl0IHJlY29yZENvbXBsZXRlZFJ1bihzZXJ2aWNlLCBhLmlkLCAnbWFudWFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucnVuc0ZvcihhLmlkKS5nZXQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJ1bnNGb3IoYi5pZCkuZ2V0KCkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkUnVuU3RhcnQgY2FwcyByZXRhaW5lZCBydW5zIHBlciBhdXRvbWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQicsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdC8vIFB1c2ggNjAgcnVucyBmb3IgYSAoY2FwIGlzIDUwKSBhbmQgNSBmb3IgYi4gRWFjaCBhdXRvbWF0aW9uJ3Ncblx0XHQvLyBoaXN0b3J5IHNob3VsZCBiZSBib3VuZGVkIGluZGVwZW5kZW50bHkuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA2MDsgaSsrKSB7XG5cdFx0XHRhd2FpdCByZWNvcmRDb21wbGV0ZWRSdW4oc2VydmljZSwgYS5pZCk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0XHRhd2FpdCByZWNvcmRDb21wbGV0ZWRSdW4oc2VydmljZSwgYi5pZCk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJ1bnNGb3IoYS5pZCkuZ2V0KCkubGVuZ3RoLCA1MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucnVuc0ZvcihiLmlkKS5nZXQoKS5sZW5ndGgsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRSdW5TdGFydCBkZWNsaW5lcyBhIHNlY29uZCBjbGFpbSB3aGlsZSBhIHJ1biBpcyBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhLmlkLCAnbWFudWFsJyk7XG5cdFx0YXdhaXQgc2VydmljZS51cGRhdGVSdW4oZmlyc3QuaWQsIHsgc3RhdHVzOiAncnVubmluZycgfSk7XG5cblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGEuaWQsICdzY2hlZHVsZScsIDIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjbGFpbWVkOiBzZWNvbmQuY2xhaW1lZCxcblx0XHRcdHJ1bklkOiBzZWNvbmQucnVuLmlkLFxuXHRcdFx0dG90YWxSdW5zOiBzZXJ2aWNlLnJ1bnNGb3IoYS5pZCkuZ2V0KCkubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGNsYWltZWQ6IGZhbHNlLFxuXHRcdFx0cnVuSWQ6IGZpcnN0LmlkLFxuXHRcdFx0dG90YWxSdW5zOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25jdXJyZW50IGNsYWltcyBmcm9tIHR3byB3aW5kb3dzIHByb2R1Y2UgYSBzaW5nbGUgcnVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNoYXJlZFN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgd2luZG93QSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCB3aW5kb3dCID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCB3aW5kb3dBLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXG5cdFx0Ly8gTmVpdGhlciB3aW5kb3cgc2VlcyBhbiBhY3RpdmUgcnVuIHdoZW4gaXQgc3RhcnRzLCBzbyB0aGUgY2xhaW0gaGFzIHRvIGJlXG5cdFx0Ly8gc2V0dGxlZCBieSB0aGUgc3RvcmFnZSBjb21wYXJlLWFuZC1zd2FwIHJhdGhlciB0aGFuIGJ5IGEgcHJlLXJlYWQgY2hlY2suXG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0d2luZG93QS5yZWNvcmRSdW5TdGFydChhLmlkLCAnbWFudWFsJywgMSksXG5cdFx0XHR3aW5kb3dCLnJlY29yZFJ1blN0YXJ0KGEuaWQsICdtYW51YWwnLCAyKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xhaW1Db3VudDogW2ZpcnN0LCBzZWNvbmRdLmZpbHRlcihjbGFpbSA9PiBjbGFpbS5jbGFpbWVkKS5sZW5ndGgsXG5cdFx0XHRhZ3JlZU9uUnVuOiBmaXJzdC5ydW4uaWQgPT09IHNlY29uZC5ydW4uaWQsXG5cdFx0XHR0b3RhbFJ1bnM6IHdpbmRvd0EucnVuc0ZvcihhLmlkKS5nZXQoKS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0Y2xhaW1Db3VudDogMSxcblx0XHRcdGFncmVlT25SdW46IHRydWUsXG5cdFx0XHR0b3RhbFJ1bnM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIGFjcm9zcyBzZXJ2aWNlIHJlc3RhcnRzIHZpYSBzaGFyZWQgc3RvcmFnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzaGFyZWRTdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGZpcnN0U2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCBhID0gYXdhaXQgZmlyc3RTZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IGZpcnN0U2VydmljZS5yZWNvcmRSdW5TdGFydChhLmlkLCAnbWFudWFsJywgNyk7XG5cdFx0Zmlyc3RTZXJ2aWNlLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHNlY29uZFNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZFNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKVswXS5pZCwgYS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZFNlcnZpY2UucnVucy5nZXQoKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3VuZC10cmlwcyBhbmQgY2xlYXJzIFdvcmt0cmVlIGJyYW5jaCBjb25maWd1cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNoYXJlZFN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmlyc3RTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBmaXJzdFNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnQScsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS9zYXZlZCcgfSksXG5cdFx0fSk7XG5cdFx0Zmlyc3RTZXJ2aWNlLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHNlY29uZFNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBzZWNvbmRTZXJ2aWNlLmdldEF1dG9tYXRpb24oY3JlYXRlZC5pZCk7XG5cdFx0Y29uc3QgdXBkYXRlZCA9IGF3YWl0IHNlY29uZFNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihjcmVhdGVkLmlkLCB7IHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KEZPTERFUiwgeyBraW5kOiAnZm9sZGVyJyB9KSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdG9yZWRUYXJnZXQ6IHJlc3RvcmVkPy50YXJnZXQsXG5cdFx0XHR1cGRhdGVkVGFyZ2V0OiB1cGRhdGVkLnRhcmdldCxcblx0XHR9LCB7XG5cdFx0XHRyZXN0b3JlZFRhcmdldDogd29ya3NwYWNlVGFyZ2V0KEZPTERFUiwgeyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2g6ICdmZWF0dXJlL3NhdmVkJyB9KSxcblx0XHRcdHVwZGF0ZWRUYXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ2ZvbGRlcicgfSksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIHRhcmdldCBjaGFuZ2VzIHdpdGhvdXQgY2FycnlpbmcgcmVwb3NpdG9yeSBjb25maWd1cmF0aW9uIGludG8gcXVpY2stY2hhdCBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNoYXJlZFN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmlyc3RTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBmaXJzdFNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnQScsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS9zYXZlZCcgfSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgcXVpY2tDaGF0ID0gYXdhaXQgZmlyc3RTZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb24oY3JlYXRlZC5pZCwge1xuXHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdH0pO1xuXHRcdGZpcnN0U2VydmljZS5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBzZWNvbmRTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gc2Vjb25kU2VydmljZS5nZXRBdXRvbWF0aW9uKGNyZWF0ZWQuaWQpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IHNlY29uZFNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihjcmVhdGVkLmlkLCB7XG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSksXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHF1aWNrQ2hhdDogcXVpY2tDaGF0LnRhcmdldCxcblx0XHRcdHJlc3RvcmVkOiByZXN0b3JlZD8udGFyZ2V0LFxuXHRcdFx0d29ya3NwYWNlOiB3b3Jrc3BhY2UudGFyZ2V0LFxuXHRcdH0sIHtcblx0XHRcdHF1aWNrQ2hhdDogeyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSxcblx0XHRcdHJlc3RvcmVkOiB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdFx0d29ya3NwYWNlOiB3b3Jrc3BhY2VUYXJnZXQoRk9MREVSLCB7IGtpbmQ6ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0pLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gc2VydmljZXMgb24gdGhlIHNhbWUgc3RvcmFnZSBzdGF5IGluIHN5bmMgdmlhIG9uRGlkQ2hhbmdlVmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hhcmVkU3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3aW5kb3dBID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHdpbmRvd0IgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdpbmRvd0IuYXV0b21hdGlvbnMuZ2V0KCksIFtdKTtcblx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgd2luZG93QS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ1gnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdC8vIEluLW1lbW9yeSBzdG9yYWdlIGZpcmVzIG9uRGlkQ2hhbmdlVmFsdWUgc3luY2hyb25vdXNseSwgc28gd2luZG93QlxuXHRcdC8vIHNob3VsZCBhbHJlYWR5IHNlZSB0aGUgbmV3IGF1dG9tYXRpb24uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbmRvd0IuYXV0b21hdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2luZG93Qi5hdXRvbWF0aW9ucy5nZXQoKVswXS5pZCwgY3JlYXRlZC5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211dGF0aW9ucyBwcmVzZXJ2ZSB1bnJlbGF0ZWQgYXBwbGljYXRpb24gc3RvcmFnZSB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlLnN0b3JlKCd1bnJlbGF0ZWQnLCAnc2VudGluZWwnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihhdXRvbWF0aW9uLmlkLCB7IG5hbWU6ICdVcGRhdGVkJyB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb24uaWQsICdtYW51YWwnLCAxKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZUF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ3VucmVsYXRlZCcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiksICdzZW50aW5lbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdndWFyZGVkIHVwZGF0ZSByZWplY3RzIGEgY29uY3VycmVudCBlZGl0YWJsZSBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hhcmVkU3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3aW5kb3dBID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHdpbmRvd0IgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmV2aWV3ZWQgPSBhd2FpdCB3aW5kb3dBLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnT3JpZ2luYWwnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdGF3YWl0IHdpbmRvd0IudXBkYXRlQXV0b21hdGlvbihyZXZpZXdlZC5pZCwgeyBwcm9tcHQ6ICdjb25jdXJyZW50IGVkaXQnIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdpbmRvd0EudXBkYXRlQXV0b21hdGlvbklmVW5jaGFuZ2VkKHJldmlld2VkLmlkLCB7IG5hbWU6ICdSZXZpZXdlZCBlZGl0JyB9LCByZXZpZXdlZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5raW5kID09PSAnY29uZmxpY3QnID8ge1xuXHRcdFx0a2luZDogcmVzdWx0LmtpbmQsXG5cdFx0XHRjdXJyZW50TmFtZTogcmVzdWx0LmN1cnJlbnQ/Lm5hbWUsXG5cdFx0XHRjdXJyZW50UHJvbXB0OiByZXN1bHQuY3VycmVudD8ucHJvbXB0LFxuXHRcdH0gOiByZXN1bHQsIHtcblx0XHRcdGtpbmQ6ICdjb25mbGljdCcsXG5cdFx0XHRjdXJyZW50TmFtZTogJ09yaWdpbmFsJyxcblx0XHRcdGN1cnJlbnRQcm9tcHQ6ICdjb25jdXJyZW50IGVkaXQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdndWFyZGVkIHVwZGF0ZSB0b2xlcmF0ZXMgY29uY3VycmVudCBydW50aW1lIG1ldGFkYXRhIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hhcmVkU3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3aW5kb3dBID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHdpbmRvd0IgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0d2luZG93QS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gbmV3IERhdGUoJzIwMjUtMDYtMDFUMDA6MDA6MDBaJykpO1xuXHRcdGNvbnN0IHJldmlld2VkID0gYXdhaXQgd2luZG93QS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ09yaWdpbmFsJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHR3aW5kb3dCLnNldENsb2NrRm9yVGVzdGluZygoKSA9PiBuZXcgRGF0ZSgnMjAyNS0wNi0wMVQxMDowMDowMFonKSk7XG5cdFx0Y29uc3QgcnVuID0gYXdhaXQgY2xhaW1SdW4od2luZG93QiwgcmV2aWV3ZWQuaWQsICdzY2hlZHVsZScsIDIpO1xuXHRcdGNvbnN0IHJ1bnRpbWVTdGF0ZSA9IHdpbmRvd0IuZ2V0QXV0b21hdGlvbihyZXZpZXdlZC5pZCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgd2luZG93QS51cGRhdGVBdXRvbWF0aW9uSWZVbmNoYW5nZWQocmV2aWV3ZWQuaWQsIHsgbmFtZTogJ1Jldmlld2VkIGVkaXQnIH0sIHJldmlld2VkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmtpbmQgPT09ICd1cGRhdGVkJyA/IHtcblx0XHRcdGtpbmQ6IHJlc3VsdC5raW5kLFxuXHRcdFx0bmFtZTogcmVzdWx0LmF1dG9tYXRpb24ubmFtZSxcblx0XHRcdGxhc3RSdW5BdDogcmVzdWx0LmF1dG9tYXRpb24ubGFzdFJ1bkF0LFxuXHRcdFx0bmV4dFJ1bkF0OiByZXN1bHQuYXV0b21hdGlvbi5uZXh0UnVuQXQsXG5cdFx0XHRydW5JZHM6IHdpbmRvd0EucnVucy5nZXQoKS5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCksXG5cdFx0fSA6IHJlc3VsdCwge1xuXHRcdFx0a2luZDogJ3VwZGF0ZWQnLFxuXHRcdFx0bmFtZTogJ1Jldmlld2VkIGVkaXQnLFxuXHRcdFx0bGFzdFJ1bkF0OiBydW50aW1lU3RhdGU/Lmxhc3RSdW5BdCxcblx0XHRcdG5leHRSdW5BdDogcnVudGltZVN0YXRlPy5uZXh0UnVuQXQsXG5cdFx0XHRydW5JZHM6IFtydW4uaWRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25jdXJyZW50IGNyZWF0ZSwgZWRpdCwgcnVuLCBhbmQgZGVsZXRlIG11dGF0aW9ucyBjb252ZXJnZSB3aXRob3V0IGxvc3QgdXBkYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzaGFyZWRTdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHdpbmRvd0EgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgd2luZG93QiA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCBlZGl0ZWQgPSBhd2FpdCB3aW5kb3dBLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnRWRpdCBtZScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSBhd2FpdCB3aW5kb3dBLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnRGVsZXRlIG1lJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHRjb25zdCBbLCBjbGFpbSwgLCBjcmVhdGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHdpbmRvd0EudXBkYXRlQXV0b21hdGlvbihlZGl0ZWQuaWQsIHsgbmFtZTogJ0VkaXRlZCcgfSksXG5cdFx0XHR3aW5kb3dCLnJlY29yZFJ1blN0YXJ0KGVkaXRlZC5pZCwgJ3NjaGVkdWxlJywgMiksXG5cdFx0XHR3aW5kb3dBLmRlbGV0ZUF1dG9tYXRpb24oZGVsZXRlZC5pZCksXG5cdFx0XHR3aW5kb3dCLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQ3JlYXRlZCcsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXRvbWF0aW9uczogd2luZG93QS5hdXRvbWF0aW9ucy5nZXQoKVxuXHRcdFx0XHQubWFwKGF1dG9tYXRpb24gPT4gKHsgaWQ6IGF1dG9tYXRpb24uaWQsIG5hbWU6IGF1dG9tYXRpb24ubmFtZSB9KSlcblx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpLFxuXHRcdFx0cnVuczogd2luZG93QS5ydW5zLmdldCgpLm1hcChjYW5kaWRhdGUgPT4gKHsgaWQ6IGNhbmRpZGF0ZS5pZCwgYXV0b21hdGlvbklkOiBjYW5kaWRhdGUuYXV0b21hdGlvbklkIH0pKSxcblx0XHR9LCB7XG5cdFx0XHRhdXRvbWF0aW9uczogW1xuXHRcdFx0XHR7IGlkOiBjcmVhdGVkLmlkLCBuYW1lOiAnQ3JlYXRlZCcgfSxcblx0XHRcdFx0eyBpZDogZWRpdGVkLmlkLCBuYW1lOiAnRWRpdGVkJyB9LFxuXHRcdFx0XSxcblx0XHRcdHJ1bnM6IFt7IGlkOiBjbGFpbS5ydW4uaWQsIGF1dG9tYXRpb25JZDogZWRpdGVkLmlkIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkaW5nIGEgbGVkZ2VyIHdpdGggYSBmdXR1cmUgc2NoZW1hIHZlcnNpb24gZnJlZXplcyBvYnNlcnZhYmxlcyBhbmQgcmVmdXNlcyB0byB3cml0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGZ1dHVyZUxlZGdlciA9IEpTT04uc3RyaW5naWZ5KHsgc2NoZW1hVmVyc2lvbjogOTk5LCByZXZpc2lvbjogNywgYXV0b21hdGlvbnM6IFtdLCBydW5zOiBbXSB9KTtcblx0XHQvLyBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04gaXMgLTFcblx0XHRzdG9yYWdlLnN0b3JlKCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIGZ1dHVyZUxlZGdlciwgLTEsIDEpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHQvLyBPYnNlcnZhYmxlcyByZW1haW4gZW1wdHkgKG5vIHByaW9yIGluLW1lbW9yeSBzdGF0ZSB0byBwcmVzZXJ2ZSlcblx0XHQvLyBidXQgdGhlIHNlcnZpY2UgaXMgbm93IGluIHJlYWQtb25seSBtb2RlLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5ydW5zLmdldCgpLCBbXSk7XG5cblx0XHQvLyBBIHN1YnNlcXVlbnQgbXV0YXRpb24gbXVzdCBiZSByZWplY3RlZCAocmVhZC1vbmx5IG1vZGUpIGFuZCBtdXN0IG5vdFxuXHRcdC8vIGRlc3Ryb3kgdGhlIG9uLWRpc2sgbmV3ZXIgbGVkZ2VyLlxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KSxcblx0XHRcdC9uZXdlciB2ZXJzaW9uLyxcblx0XHQpO1xuXG5cdFx0Ly8gSW4tbWVtb3J5IHN0YXRlIGlzIGFsc28gdW5jaGFuZ2VkIGJlY2F1c2UgdGhlIG11dGF0aW9uIHdhcyByZWplY3RlZFxuXHRcdC8vIGJlZm9yZSBhbnkgY29tbWl0LlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSwgW10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIC0xKSwgZnV0dXJlTGVkZ2VyKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaEZyb21TdG9yYWdlIHByZXNlcnZlcyBpbi1tZW1vcnkgc3RhdGUgd2hlbiBzdG9yYWdlIGZsaXBzIHRvIGFuIHVuc3VwcG9ydGVkIHNjaGVtYScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0xvY2FsJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblxuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgSlNPTi5zdHJpbmdpZnkoeyBzY2hlbWFWZXJzaW9uOiA5OTksIHJldmlzaW9uOiA5OSwgYXV0b21hdGlvbnM6IFtdLCBydW5zOiBbXSB9KSwgLTEsIDEpO1xuXG5cdFx0Ly8gVGhlIG9uRGlkQ2hhbmdlVmFsdWUgcmVmcmVzaCBtdXN0IE5PVCBjbGVhciBvdXIgb2JzZXJ2YWJsZXMgdG9cblx0XHQvLyBlbXB0eS4gV2Uga2VlcCBkaXNwbGF5aW5nIHdoYXQgd2UgbGFzdCBrbmV3IGFib3V0LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3QgYnVtcHMgdGhlIHJldmlzaW9uIGNvdW50ZXIgb24gZXZlcnkgd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgcmV2MSA9IEpTT04ucGFyc2Uoc3RvcmFnZS5nZXQoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgLTEpISkucmV2aXNpb247XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0InLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRjb25zdCByZXYyID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldCgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAtMSkhKS5yZXZpc2lvbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJldjEsICdudW1iZXInKTtcblx0XHRhc3NlcnQub2socmV2MiA+IHJldjEsIGBleHBlY3RlZCAke3JldjJ9ID4gJHtyZXYxfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0IGFic29yYnMgYSBoaWdoZXIgb24tZGlzayByZXZpc2lvbiAoY29uY3VycmVudC13cml0ZSBkZXRlY3Rpb24pJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGJhc2VsaW5lID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldCgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAtMSkhKTtcblx0XHQvLyBTaW11bGF0ZSBhbm90aGVyIHdpbmRvdyBoYXZpbmcgYWR2YW5jZWQgdGhlIHJldmlzaW9uIGJlaGluZCBvdXJcblx0XHQvLyBiYWNrLiBUaGUgc2VydmljZSBtdXN0IG5vdCB3cml0ZSBhIHN0YWxlLW9yLWVxdWFsIHJldmlzaW9uLlxuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgSlNPTi5zdHJpbmdpZnkoeyAuLi5iYXNlbGluZSwgcmV2aXNpb246IDUwMDAgfSksIC0xLCAxKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQicsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGFmdGVyID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldCgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAtMSkhKTtcblx0XHRhc3NlcnQub2soYWZ0ZXIucmV2aXNpb24gPiA1MDAwLCBgZXhwZWN0ZWQgcmV2aXNpb24gPiA1MDAwLCBnb3QgJHthZnRlci5yZXZpc2lvbn1gKTtcblx0fSk7XG5cblx0dGVzdCgnc3VjY2Vzc2Z1bCBDQVMgYWNjZXB0cyBhIHJlc3RvcmVkIGxvd2VyIHJldmlzaW9uIHdpdGhvdXQgYWNjZXB0aW5nIHN0YWxlIG5vdGlmaWNhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlLnN0b3JlKCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNjaGVtYVZlcnNpb246IDMsXG5cdFx0XHRyZXZpc2lvbjogNDAsXG5cdFx0XHRhdXRvbWF0aW9uczogW3NlcmlhbGl6ZUxlZGdlckF1dG9tYXRpb24oJ25ld2VyJywgJ0JlZm9yZSByZXN0b3JlJyldLFxuXHRcdFx0cnVuczogW10sXG5cdFx0fSksIC0xLCAxKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3RvcmVkTGVkZ2VyID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFtzZXJpYWxpemVMZWRnZXJBdXRvbWF0aW9uKCdyZXN0b3JlZCcsICdSZXN0b3JlZCcpXSxcblx0XHRcdHJ1bnM6IFtdLFxuXHRcdH0pO1xuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgcmVzdG9yZWRMZWRnZXIsIC0xLCAxKTtcblxuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0FmdGVyIHJlc3RvcmUnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLFxuXHRcdFx0dGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSxcblx0XHR9KTtcblx0XHRjb25zdCBwZXJzaXN0ZWQgPSBKU09OLnBhcnNlKHN0b3JhZ2UuZ2V0KCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIC0xKSEpO1xuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgcmVzdG9yZWRMZWRnZXIsIC0xLCAxKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlZE5hbWU6IGNyZWF0ZWQubmFtZSxcblx0XHRcdHBlcnNpc3RlZFJldmlzaW9uOiBwZXJzaXN0ZWQucmV2aXNpb24sXG5cdFx0XHRwZXJzaXN0ZWROYW1lczogcGVyc2lzdGVkLmF1dG9tYXRpb25zLm1hcCgoYXV0b21hdGlvbjogeyBuYW1lOiBzdHJpbmcgfSkgPT4gYXV0b21hdGlvbi5uYW1lKSxcblx0XHRcdGluTWVtb3J5TmFtZXM6IHNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubWFwKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5uYW1lKSxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkTmFtZTogJ0FmdGVyIHJlc3RvcmUnLFxuXHRcdFx0cGVyc2lzdGVkUmV2aXNpb246IDIsXG5cdFx0XHRwZXJzaXN0ZWROYW1lczogWydBZnRlciByZXN0b3JlJywgJ1Jlc3RvcmVkJ10sXG5cdFx0XHRpbk1lbW9yeU5hbWVzOiBbJ0FmdGVyIHJlc3RvcmUnLCAnUmVzdG9yZWQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhZGluZyBhIGNvcnJ1cHQgbGVkZ2VyIGxlYXZlcyBvYnNlcnZhYmxlcyBlbXB0eSB3aXRob3V0IHRocm93aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmFnZS5zdG9yZSgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAnbm90IGpzb24nLCAtMSwgMSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHMgYSBtYWxmb3JtZWQgc2NoZW1hIHYzIHJvdyB3aXRob3V0IGRpc2NhcmRpbmcgdmFsaWQgcm93cycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdGF1dG9tYXRpb25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2tlZXAnLFxuXHRcdFx0XHRcdG5hbWU6ICdWYWxpZCcsXG5cdFx0XHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRcdFx0c2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSxcblx0XHRcdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHRcdFx0XHR1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRdLFxuXHRcdFx0cnVuczogW1xuXHRcdFx0XHR7IGlkOiAnci1rZWVwJywgYXV0b21hdGlvbklkOiAna2VlcCcsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHRyaWdnZXI6ICdtYW51YWwnLCBzdGFydGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIGxlYWRlcldpbmRvd0lkOiAxIH0sXG5cdFx0XHRdLFxuXHRcdH0pLCAtMSwgMSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXV0b21hdGlvbklkczogc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKS5tYXAoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkKSxcblx0XHRcdHJ1bklkczogc2VydmljZS5ydW5zLmdldCgpLm1hcChydW4gPT4gcnVuLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRhdXRvbWF0aW9uSWRzOiBbJ2tlZXAnXSxcblx0XHRcdHJ1bklkczogWydyLWtlZXAnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWlncmF0ZXMgdmFsaWQgc2NoZW1hIHYxIHJlY29yZHMgdG8gdjMgd2hpbGUgZHJvcHBpbmcgbWFsZm9ybWVkIHRhcmdldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsZWRnZXIgPSB7XG5cdFx0XHRzY2hlbWFWZXJzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ29ycGhhbicsIG5hbWU6ICdPbGQnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogOSwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sIGVuYWJsZWQ6IHRydWUsIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJywgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonIH0sXG5cdFx0XHRcdHsgaWQ6ICdvcnBoYW4tcXVpY2snLCBuYW1lOiAnT2xkIFF1aWNrJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiB7IGludGVydmFsOiAnZGFpbHknLCBzY2hlZHVsZUhvdXI6IDksIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LCBpc1F1aWNrQ2hhdDogdHJ1ZSwgZW5hYmxlZDogdHJ1ZSwgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLCB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicgfSxcblx0XHRcdFx0eyBpZDogJ2tlZXAnLCBuYW1lOiAnVmFsaWQnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogOSwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBlbmFibGVkOiB0cnVlLCBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyB9LFxuXHRcdFx0XHR7IGlkOiAncXVpY2snLCBuYW1lOiAnUXVpY2snLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogOSwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sIGlzUXVpY2tDaGF0OiB0cnVlLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJywgZW5hYmxlZDogdHJ1ZSwgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLCB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicgfSxcblx0XHRcdF0sXG5cdFx0XHRydW5zOiBbXG5cdFx0XHRcdHsgaWQ6ICdyLW9ycGhhbicsIGF1dG9tYXRpb25JZDogJ29ycGhhbicsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHRyaWdnZXI6ICdtYW51YWwnLCBzdGFydGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIGxlYWRlcldpbmRvd0lkOiAxIH0sXG5cdFx0XHRcdHsgaWQ6ICdyLW9ycGhhbi1xdWljaycsIGF1dG9tYXRpb25JZDogJ29ycGhhbi1xdWljaycsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHRyaWdnZXI6ICdtYW51YWwnLCBzdGFydGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIGxlYWRlcldpbmRvd0lkOiAxIH0sXG5cdFx0XHRcdHsgaWQ6ICdyLWtlZXAnLCBhdXRvbWF0aW9uSWQ6ICdrZWVwJywgc3RhdHVzOiAnY29tcGxldGVkJywgdHJpZ2dlcjogJ21hbnVhbCcsIHN0YXJ0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJywgbGVhZGVyV2luZG93SWQ6IDEgfSxcblx0XHRcdFx0eyBpZDogJ3ItcXVpY2snLCBhdXRvbWF0aW9uSWQ6ICdxdWljaycsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHRyaWdnZXI6ICdtYW51YWwnLCBzdGFydGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIGxlYWRlcldpbmRvd0lkOiAxIH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cdFx0c3RvcmFnZS5zdG9yZSgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCBKU09OLnN0cmluZ2lmeShsZWRnZXIpLCAtMSwgMSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF1dG9tYXRpb25zOiBzZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLm1hcChhdXRvbWF0aW9uID0+ICh7IGlkOiBhdXRvbWF0aW9uLmlkLCB0YXJnZXRLaW5kOiBhdXRvbWF0aW9uLnRhcmdldC5raW5kIH0pKSxcblx0XHRcdHJ1bnM6IHNlcnZpY2UucnVucy5nZXQoKS5tYXAocnVuID0+IHJ1bi5pZCksXG5cdFx0fSwge1xuXHRcdFx0YXV0b21hdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ2tlZXAnLCB0YXJnZXRLaW5kOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGlkOiAncXVpY2snLCB0YXJnZXRLaW5kOiAncXVpY2tDaGF0JyB9LFxuXHRcdFx0XSxcblx0XHRcdHJ1bnM6IFsnci1rZWVwJywgJ3ItcXVpY2snXSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbigna2VlcCcsIHsgbmFtZTogJ1VwZGF0ZWQnIH0pO1xuXHRcdGNvbnN0IG1pZ3JhdGVkID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldCgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAtMSkhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNjaGVtYVZlcnNpb246IG1pZ3JhdGVkLnNjaGVtYVZlcnNpb24sXG5cdFx0XHRhdXRvbWF0aW9uSWRzOiBtaWdyYXRlZC5hdXRvbWF0aW9ucy5tYXAoKGF1dG9tYXRpb246IHsgaWQ6IHN0cmluZyB9KSA9PiBhdXRvbWF0aW9uLmlkKSxcblx0XHRcdHJ1bklkczogbWlncmF0ZWQucnVucy5tYXAoKHJ1bjogeyBpZDogc3RyaW5nIH0pID0+IHJ1bi5pZCksXG5cdFx0fSwge1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdGF1dG9tYXRpb25JZHM6IFsna2VlcCcsICdxdWljayddLFxuXHRcdFx0cnVuSWRzOiBbJ3Ita2VlcCcsICdyLXF1aWNrJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pZ3JhdGVzIHNjaGVtYSB2MiBmbGF0IHRhcmdldHMgdG8gc2NoZW1hIHYzIHRhcmdldCB1bmlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBjb21tb24gPSB7XG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnZGFpbHknLCBzY2hlZHVsZUhvdXI6IDksIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHRcdHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHR9O1xuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMixcblx0XHRcdGF1dG9tYXRpb25zOiBbXG5cdFx0XHRcdHsgLi4uY29tbW9uLCBpZDogJ3dvcmtzcGFjZScsIG5hbWU6ICdXb3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUi50b0pTT04oKSwgaXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS9zYXZlZCcgfSxcblx0XHRcdFx0eyAuLi5jb21tb24sIGlkOiAnbGVnYWN5LXdvcmt0cmVlJywgbmFtZTogJ0xlZ2FjeSBXb3JrdHJlZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBpc29sYXRpb25Nb2RlOiAnd29ya3RyZWUnIH0sXG5cdFx0XHRcdHsgLi4uY29tbW9uLCBpZDogJ3F1aWNrJywgbmFtZTogJ1F1aWNrJywgaXNRdWlja0NoYXQ6IHRydWUsIHByb3ZpZGVySWQ6ICdsb2NhbC1hZ2VudC1ob3N0Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3RjbGknIH0sXG5cdFx0XHRdLFxuXHRcdFx0cnVuczogW10sXG5cdFx0fSksIC0xLCAxKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLm1hcChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24udGFyZ2V0KSwgW1xuXHRcdFx0d29ya3NwYWNlVGFyZ2V0KEZPTERFUiwgeyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2g6ICdmZWF0dXJlL3NhdmVkJyB9KSxcblx0XHRcdHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ2RlZmF1bHQnIH0pLFxuXHRcdFx0eyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbignd29ya3NwYWNlJywgeyBuYW1lOiAnVXBkYXRlZCcgfSk7XG5cdFx0Y29uc3QgbWlncmF0ZWQgPSBKU09OLnBhcnNlKHN0b3JhZ2UuZ2V0KCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIC0xKSEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWdyYXRlZC5zY2hlbWFWZXJzaW9uLCAzKTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYSBmb2xkZXJVcmkgdGhyb3VnaCBwZXJzaXN0ZW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzaGFyZWRTdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGZpcnN0U2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL3Byb2plY3QnKTtcblx0XHRhd2FpdCBmaXJzdFNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KHVyaSkgfSk7XG5cblx0XHRjb25zdCBzZWNvbmRTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHJlbG9hZGVkID0gc2Vjb25kU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKVswXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbG9hZGVkLnRhcmdldCwgd29ya3NwYWNlVGFyZ2V0KHVyaSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkcyBhIHN0cmluZyBzZXNzaW9uUmVzb3VyY2UgYXMgYSBVUkkgYW5kIHdyaXRlcyBpdCBiYWNrIGFzIGEgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9jb3BpbG90L3Nlc3MtNDInO1xuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFtzZXJpYWxpemVMZWRnZXJBdXRvbWF0aW9uKCdhMScsICdBJyldLFxuXHRcdFx0cnVuczogW3tcblx0XHRcdFx0aWQ6ICdydW4tMScsXG5cdFx0XHRcdGF1dG9tYXRpb25JZDogJ2ExJyxcblx0XHRcdFx0c3RhdHVzOiAncnVubmluZycsXG5cdFx0XHRcdHRyaWdnZXI6ICdzY2hlZHVsZScsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bGVhZGVyV2luZG93SWQ6IDEsXG5cdFx0XHR9XSxcblx0XHR9KSwgLTEsIDEpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBsb2FkZWRSdW4gPSBzZXJ2aWNlLnJ1bnMuZ2V0KClbMF07XG5cdFx0YXdhaXQgc2VydmljZS51cGRhdGVSdW4oJ3J1bi0xJywgeyBzdGF0dXM6ICdjb21wbGV0ZWQnLCBjb21wbGV0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDE6MDAuMDAwWicgfSk7XG5cdFx0Y29uc3QgcGVyc2lzdGVkID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldCgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAtMSkhKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9hZGVkSXNVcmk6IFVSSS5pc1VyaShsb2FkZWRSdW4uc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdGxvYWRlZFN0cmluZzogbG9hZGVkUnVuLnNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKSxcblx0XHRcdHBlcnNpc3RlZFR5cGU6IHR5cGVvZiBwZXJzaXN0ZWQucnVuc1swXS5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRwZXJzaXN0ZWRTdHJpbmc6IHBlcnNpc3RlZC5ydW5zWzBdLnNlc3Npb25SZXNvdXJjZSxcblx0XHR9LCB7XG5cdFx0XHRsb2FkZWRJc1VyaTogdHJ1ZSxcblx0XHRcdGxvYWRlZFN0cmluZzogc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0cGVyc2lzdGVkVHlwZTogJ3N0cmluZycsXG5cdFx0XHRwZXJzaXN0ZWRTdHJpbmc6IHNlc3Npb25SZXNvdXJjZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zYWwgZG9lcyBub3QgaW50ZXJmZXJlIHdpdGggbGF0ZXIgaW4tc3RvcmUgcmVhZHMnLCAoKSA9PiB7XG5cdFx0Ly8gSnVzdCB2ZXJpZmllcyB0aGUgbm8tbGVha2VkLWRpc3Bvc2FibGVzIGludmFyaWFudCBpbmRpcmVjdGx5OiBjcmVhdGVcblx0XHQvLyBhIHNlcnZpY2UgYW5kIGxldCB0ZWFyZG93biBjbGVhbiBpdCB1cC4gRmFpbHVyZSBzdXJmYWNlcyBhcyBhXG5cdFx0Ly8gbGVha2VkLWRpc3Bvc2FibGUgYXNzZXJ0aW9uIGF0IHN1aXRlIHRlYXJkb3duLlxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBzdG9yZS5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksIFtdKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCLGNBQWMscUJBQXFCO0FBQ3BFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQTRCLHVCQUF1QjtBQUVuRCxTQUFTLHlCQUF5QixvQ0FBb0M7QUFFdEUsTUFBTSxTQUFTLElBQUksTUFBTSxtQkFBbUI7QUFFNUMsU0FBUyxnQkFBZ0IsWUFBWSxRQUFRLFlBQTBDLEVBQUUsTUFBTSxVQUFVLEdBQXFCO0FBQzdILFNBQU8sRUFBRSxN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
