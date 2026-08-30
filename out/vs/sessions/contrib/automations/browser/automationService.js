var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, observableValue, transaction } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import {
  serializeAutomationEditableState
} from "../../../../workbench/contrib/chat/common/automations/automationService.js";
import { publishAutomationCreated, publishAutomationDeleted, publishAutomationUpdated } from "../../../../workbench/contrib/chat/common/automations/automationTelemetry.js";
import { computeNextRunAt } from "../../../../workbench/contrib/chat/common/automations/schedule.js";
import { ChatPermissionLevel, isChatPermissionLevel } from "../../../../workbench/contrib/chat/common/constants.js";
import { AUTOMATION_STORAGE_KEY, IAutomationStorageService } from "../common/automationStorageService.js";
const LEGACY_SCHEMA_VERSIONS = /* @__PURE__ */ new Set([1, 2]);
const CURRENT_SCHEMA_VERSION = 3;
const MAX_RUNS_PER_AUTOMATION = 50;
const EMPTY_LEDGER = Object.freeze({ automations: [], runs: [] });
let AutomationStore = class extends Disposable {
  constructor(storageKey, storageService, logService, telemetryService, automationStorageService) {
    super();
    this.storageKey = storageKey;
    this.storageService = storageService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.automationStorageService = automationStorageService;
    this._runsForCache = /* @__PURE__ */ new Map();
    this._lastSeenRevision = 0;
    this._now = () => /* @__PURE__ */ new Date();
    const result = this.readLedger(this.storageService.get(this.storageKey, StorageScope.APPLICATION));
    const initial = result.kind === "ledger" ? result.ledger : EMPTY_LEDGER;
    if (result.kind === "ledger") {
      this._lastSeenRevision = result.revision;
    }
    this._automations = observableValue(this, initial.automations);
    this._runs = observableValue(this, initial.runs);
    this.automations = this._automations;
    this.runs = this._runs;
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, this.storageKey, this._store)(() => {
      this.refreshFromStorage();
    }));
  }
  /** Test-only: swap in a deterministic clock used by create/update. */
  setClockForTesting(now) {
    this._now = now;
  }
  getAutomation(id) {
    return this._automations.get().find((a) => a.id === id);
  }
  runsFor(automationId) {
    let cached = this._runsForCache.get(automationId);
    if (!cached) {
      cached = derived(this, (reader) => this._runs.read(reader).filter((r) => r.automationId === automationId));
      this._runsForCache.set(automationId, cached);
    }
    return cached;
  }
  async createAutomation(options, mutationGuard) {
    const now = this._now();
    const nowIso = now.toISOString();
    const nextRun = computeNextRunAt(options.schedule, now);
    const automation = Object.freeze({
      id: generateUuid(),
      name: options.name,
      prompt: options.prompt,
      schedule: options.schedule,
      target: normalizeAutomationTarget(options.target),
      modelId: options.modelId,
      mode: options.mode,
      permissionLevel: isChatPermissionLevel(options.permissionLevel) ? options.permissionLevel : void 0,
      enabled: options.enabled ?? true,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastRunAt: void 0,
      nextRunAt: nextRun?.toISOString()
    });
    await this.mutateLedger((ledger) => ({
      kind: "commit",
      ledger: { automations: [automation, ...ledger.automations], runs: ledger.runs },
      result: void 0
    }), mutationGuard);
    publishAutomationCreated(this.telemetryService, automation);
    return automation;
  }
  async updateAutomation(id, patch) {
    const now = this._now();
    const result = await this.mutateLedger((ledger) => {
      const current = ledger.automations.find((automation) => automation.id === id);
      if (!current) {
        throw new Error(`Automation not found: ${id}`);
      }
      const updated = updateAutomation(current, patch, now);
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations.map((automation) => automation.id === id ? updated : automation),
          runs: ledger.runs
        },
        result: { current, updated }
      };
    });
    publishAutomationUpdated(this.telemetryService, result.current, result.updated);
    return result.updated;
  }
  async updateAutomationIfUnchanged(id, patch, expected, mutationGuard) {
    const now = this._now();
    let previous;
    const result = await this.mutateLedger((ledger) => {
      const current = ledger.automations.find((automation) => automation.id === id);
      if (!current || serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
        return {
          kind: "noChange",
          result: { kind: "conflict", current }
        };
      }
      const updated = updateAutomation(current, patch, now);
      previous = current;
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations.map((automation) => automation.id === id ? updated : automation),
          runs: ledger.runs
        },
        result: { kind: "updated", automation: updated }
      };
    }, mutationGuard);
    if (result.kind === "conflict" || !previous) {
      return result;
    }
    publishAutomationUpdated(this.telemetryService, previous, result.automation);
    return result;
  }
  async deleteAutomation(id, mutationGuard) {
    const existing = await this.mutateLedger((ledger) => {
      const automation = ledger.automations.find((automation2) => automation2.id === id);
      if (!automation) {
        return { kind: "noChange", result: void 0 };
      }
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations.filter((automation2) => automation2.id !== id),
          runs: ledger.runs.filter((run) => run.automationId !== id)
        },
        result: automation
      };
    }, mutationGuard);
    if (!existing) {
      return;
    }
    this._runsForCache.delete(id);
    publishAutomationDeleted(this.telemetryService, existing);
  }
  async importAutomationSnapshot(snapshot) {
    const { automation, runs } = snapshot;
    return this.mutateLedger((ledger) => {
      const existing = ledger.automations.find((candidate) => candidate.id === automation.id);
      if (existing) {
        const current = {
          automation: existing,
          runs: ledger.runs.filter((run) => run.automationId === automation.id)
        };
        return areAutomationSnapshotsEqual(current, snapshot) ? { kind: "noChange", result: { kind: "alreadyPresent" } } : { kind: "noChange", result: { kind: "conflict", current } };
      }
      return {
        kind: "commit",
        ledger: {
          automations: [automation, ...ledger.automations],
          runs: [...runs, ...ledger.runs]
        },
        result: { kind: "inserted" }
      };
    });
  }
  async upsertAutomationSnapshot(snapshot) {
    const { automation, runs } = snapshot;
    await this.mutateLedger((ledger) => {
      const existing = ledger.automations.find((candidate) => candidate.id === automation.id);
      const existingRunIds = new Set(ledger.runs.map((run) => run.id));
      const missingRuns = runs.filter((run) => !existingRunIds.has(run.id));
      if (existing && JSON.stringify(serializeAutomation(existing)) === JSON.stringify(serializeAutomation(automation)) && missingRuns.length === 0) {
        return { kind: "noChange", result: void 0 };
      }
      return {
        kind: "commit",
        ledger: {
          automations: existing ? ledger.automations.map((candidate) => candidate.id === automation.id ? automation : candidate) : [automation, ...ledger.automations],
          runs: [...missingRuns, ...ledger.runs]
        },
        result: void 0
      };
    });
  }
  async removeAutomationSnapshotIfUnchanged(expected) {
    const result = await this.mutateLedger((ledger) => {
      const current = ledger.automations.find((candidate) => candidate.id === expected.automation.id);
      if (!current) {
        return { kind: "noChange", result: { kind: "missing" } };
      }
      const currentRuns = ledger.runs.filter((run) => run.automationId === expected.automation.id);
      const currentSnapshot = { automation: current, runs: currentRuns };
      if (!areAutomationSnapshotsEqual(currentSnapshot, expected)) {
        return {
          kind: "noChange",
          result: { kind: "conflict", current: currentSnapshot }
        };
      }
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations.filter((candidate) => candidate.id !== expected.automation.id),
          runs: ledger.runs.filter((run) => run.automationId !== expected.automation.id)
        },
        result: { kind: "removed" }
      };
    });
    if (result.kind === "removed") {
      this._runsForCache.delete(expected.automation.id);
    }
    return result;
  }
  async recordRunStart(automationId, trigger, leaderWindowId) {
    const now = this._now();
    const startedAt = now.toISOString();
    const run = Object.freeze({
      id: generateUuid(),
      automationId,
      status: "pending",
      trigger,
      startedAt,
      leaderWindowId
    });
    return this.mutateLedger((ledger) => {
      const automation = ledger.automations.find((automation2) => automation2.id === automationId);
      if (!automation) {
        throw new Error(`Automation not found: ${automationId}`);
      }
      const activeRun = findActiveRun(ledger.runs, automationId);
      if (activeRun) {
        return { kind: "noChange", result: { claimed: false, run: activeRun } };
      }
      let automations = ledger.automations;
      if (trigger !== "manual") {
        const updatedAutomation = Object.freeze({
          ...automation,
          lastRunAt: startedAt,
          nextRunAt: computeNextRunAt(automation.schedule, now)?.toISOString(),
          updatedAt: startedAt
        });
        automations = automations.map((automation2) => automation2.id === automationId ? updatedAutomation : automation2);
      }
      return {
        kind: "commit",
        ledger: { automations, runs: [run, ...ledger.runs] },
        result: { claimed: true, run }
      };
    });
  }
  async updateRun(runId, patch) {
    return this.mutateLedger((ledger) => {
      const current = ledger.runs.find((run) => run.id === runId);
      if (!current) {
        return { kind: "noChange", result: void 0 };
      }
      const updated = Object.freeze({
        ...current,
        status: patch.status ?? current.status,
        sessionResource: patch.sessionResource ?? current.sessionResource,
        completedAt: patch.completedAt ?? current.completedAt,
        errorMessage: patch.errorMessage ?? current.errorMessage
      });
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations,
          runs: ledger.runs.map((run) => run.id === runId ? updated : run)
        },
        result: updated
      };
    });
  }
  async deleteRun(runId) {
    await this.mutateLedger((ledger) => {
      if (!ledger.runs.some((run) => run.id === runId)) {
        return { kind: "noChange", result: void 0 };
      }
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations,
          runs: ledger.runs.filter((run) => run.id !== runId)
        },
        result: void 0
      };
    });
  }
  getActiveRunFor(automationId) {
    return findActiveRun(this._runs.get(), automationId);
  }
  async markStaleRunsFailed(reason) {
    const completedAt = this._now().toISOString();
    await this.mutateLedger((ledger) => {
      let changed = false;
      const runs = ledger.runs.map((run) => {
        if (run.status === "pending" || run.status === "running") {
          changed = true;
          return Object.freeze({ ...run, status: "failed", completedAt, errorMessage: reason });
        }
        return run;
      });
      if (!changed) {
        return { kind: "noChange", result: void 0 };
      }
      return {
        kind: "commit",
        ledger: { automations: ledger.automations, runs },
        result: void 0
      };
    });
  }
  //#region Persistence
  async mutateLedger(mutate, mutationGuard) {
    let raw = await this.automationStorageService.read(this.storageKey);
    while (true) {
      const readResult = this.readLedger(raw);
      if (readResult.kind === "unsupportedSchema") {
        throw new Error("Cannot modify automations: storage was written by a newer version");
      }
      this.acceptLedger(readResult.ledger, readResult.revision);
      const mutation = mutate(readResult.ledger);
      if (mutation.kind === "noChange") {
        return mutation.result;
      }
      const ledger = {
        automations: mutation.ledger.automations,
        runs: trimRunsPerAutomation(mutation.ledger.runs, MAX_RUNS_PER_AUTOMATION)
      };
      const revision = readResult.revision + 1;
      const serialized = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        revision,
        automations: ledger.automations.map(serializeAutomation),
        runs: ledger.runs.map((run) => ({ ...run, sessionResource: run.sessionResource?.toString() }))
      };
      const newValue = JSON.stringify(serialized);
      mutationGuard?.();
      const writeResult = await this.automationStorageService.compareAndSwap(this.storageKey, raw, newValue);
      if (writeResult.swapped) {
        this.setLedger(ledger, revision);
        return mutation.result;
      }
      if (writeResult.currentValue === raw) {
        throw new Error("Automation storage rejected an unchanged compare-and-swap value.");
      }
      raw = writeResult.currentValue;
    }
  }
  acceptLedger(ledger, revision) {
    if (revision < this._lastSeenRevision) {
      return;
    }
    this.setLedger(ledger, revision);
  }
  setLedger(ledger, revision) {
    this._lastSeenRevision = revision;
    transaction((tx) => {
      this._automations.set(ledger.automations, tx);
      this._runs.set(ledger.runs, tx);
    });
  }
  refreshFromStorage() {
    const result = this.readLedger(this.storageService.get(this.storageKey, StorageScope.APPLICATION));
    if (result.kind === "unsupportedSchema") {
      return;
    }
    this.acceptLedger(result.ledger, result.revision);
  }
  readLedger(raw) {
    if (!raw) {
      return { kind: "ledger", ledger: EMPTY_LEDGER, revision: 0 };
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.schemaVersion === "number" && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
        this.logService.warn(`[AutomationService] Ledger has schema v${parsed.schemaVersion}; this build only supports v${CURRENT_SCHEMA_VERSION}. Entering read-only mode.`);
        return { kind: "unsupportedSchema" };
      }
      if (parsed?.schemaVersion !== CURRENT_SCHEMA_VERSION && !LEGACY_SCHEMA_VERSIONS.has(parsed?.schemaVersion)) {
        this.logService.warn(`[AutomationService] Unsupported ledger schema version ${parsed?.schemaVersion}; ignoring.`);
        return { kind: "ledger", ledger: EMPTY_LEDGER, revision: 0 };
      }
      const automations = [];
      if (parsed.schemaVersion === CURRENT_SCHEMA_VERSION) {
        const entries = Array.isArray(parsed.automations) ? parsed.automations : [];
        for (const entry of entries) {
          try {
            const automation = deserializeAutomation(entry);
            if (automation) {
              automations.push(automation);
            } else {
              this.logService.warn(`[AutomationService] Dropping persisted automation ${entry?.id} with an invalid target.`);
            }
          } catch (err) {
            this.logService.warn(`[AutomationService] Dropping malformed persisted automation ${entry?.id}.`, err);
          }
        }
      } else {
        const entries = Array.isArray(parsed.automations) ? parsed.automations : [];
        for (const entry of entries) {
          try {
            const automation = deserializeLegacyAutomation(entry);
            if (automation) {
              automations.push(automation);
            } else {
              this.logService.warn(`[AutomationService] Dropping persisted automation ${entry?.id} with an invalid legacy target.`);
            }
          } catch (err) {
            this.logService.warn(`[AutomationService] Dropping malformed persisted automation ${entry?.id}.`, err);
          }
        }
      }
      const validIds = new Set(automations.map((a) => a.id));
      const serializedRuns = Array.isArray(parsed.runs) ? parsed.runs : [];
      const runs = serializedRuns.filter((r) => !!r && typeof r === "object" && validIds.has(r.automationId)).map((r) => Object.freeze({ ...r, sessionResource: r.sessionResource ? URI.parse(r.sessionResource) : void 0 }));
      const revision = typeof parsed.revision === "number" ? parsed.revision : 0;
      return { kind: "ledger", ledger: { automations, runs: trimRunsPerAutomation(runs, MAX_RUNS_PER_AUTOMATION) }, revision };
    } catch (err) {
      this.logService.error("[AutomationService] Failed to parse automations ledger; resetting.", err);
      return { kind: "ledger", ledger: EMPTY_LEDGER, revision: 0 };
    }
  }
  //#endregion
};
AutomationStore = __decorateClass([
  __decorateParam(1, IStorageService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IAutomationStorageService)
], AutomationStore);
let AutomationService = class extends AutomationStore {
  constructor(storageService, logService, telemetryService, automationStorageService) {
    super(AUTOMATION_STORAGE_KEY, storageService, logService, telemetryService, automationStorageService);
  }
  startStaleRunRecovery(reason) {
    return this.markStaleRunsFailed(reason);
  }
  stopStaleRunRecovery() {
  }
};
AutomationService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, ILogService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IAutomationStorageService)
], AutomationService);
function serializeAutomation(a) {
  return {
    id: a.id,
    name: a.name,
    prompt: a.prompt,
    schedule: a.schedule,
    target: serializeAutomationTarget(a.target),
    modelId: a.modelId,
    mode: a.mode,
    permissionLevel: a.permissionLevel,
    enabled: a.enabled,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    lastRunAt: a.lastRunAt,
    nextRunAt: a.nextRunAt
  };
}
function areAutomationSnapshotsEqual(first, second) {
  const normalizeRuns = (runs) => runs.map((run) => ({ ...run, sessionResource: run.sessionResource?.toString() }));
  return JSON.stringify(serializeAutomation(first.automation)) === JSON.stringify(serializeAutomation(second.automation)) && JSON.stringify(normalizeRuns(first.runs)) === JSON.stringify(normalizeRuns(second.runs));
}
function deserializeAutomation(s) {
  const target = deserializeAutomationTarget(s.target);
  return target ? createAutomationFromSerialized(s, target) : void 0;
}
function deserializeLegacyAutomation(s) {
  let target;
  if (s.isQuickChat === true) {
    if (!s.providerId || !s.sessionTypeId) {
      return void 0;
    }
    target = createQuickChatAutomationTarget(s.providerId, s.sessionTypeId);
  } else {
    if (!s.folderUri) {
      return void 0;
    }
    target = createWorkspaceAutomationTarget(
      URI.revive(s.folderUri),
      s.providerId,
      s.sessionTypeId,
      deserializeLegacyIsolation(s.isolationMode, s.branch)
    );
  }
  return createAutomationFromSerialized(s, target);
}
function createAutomationFromSerialized(s, target) {
  const permissionLevel = isChatPermissionLevel(s.permissionLevel) ? s.permissionLevel : ChatPermissionLevel.Default;
  return Object.freeze({
    id: s.id,
    name: s.name,
    prompt: s.prompt,
    schedule: s.schedule,
    target,
    modelId: s.modelId,
    mode: s.mode,
    permissionLevel,
    enabled: s.enabled,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    lastRunAt: s.lastRunAt,
    nextRunAt: s.nextRunAt
  });
}
function updateAutomation(current, patch, now) {
  const merged = mergeAutomation(current, patch);
  const scheduleChanged = patch.schedule !== void 0;
  const enabledChanged = patch.enabled !== void 0;
  return Object.freeze({
    ...merged,
    updatedAt: now.toISOString(),
    nextRunAt: scheduleChanged || enabledChanged && merged.enabled ? computeNextRunAt(merged.schedule, now)?.toISOString() : merged.nextRunAt
  });
}
function mergeAutomation(current, patch) {
  return {
    ...current,
    name: patch.name ?? current.name,
    prompt: patch.prompt ?? current.prompt,
    schedule: patch.schedule ?? current.schedule,
    target: patch.target ? normalizeAutomationTarget(patch.target) : current.target,
    modelId: patch.modelId === null ? void 0 : patch.modelId ?? current.modelId,
    mode: patch.mode === null ? void 0 : patch.mode ?? current.mode,
    permissionLevel: patch.permissionLevel === null ? void 0 : patch.permissionLevel && isChatPermissionLevel(patch.permissionLevel) ? patch.permissionLevel : current.permissionLevel,
    enabled: patch.enabled ?? current.enabled
  };
}
function normalizeAutomationTarget(target) {
  if (target.kind === "quickChat") {
    if (!target.providerId || !target.sessionTypeId) {
      throw new Error("Workspace-less automation requires a providerId and sessionTypeId.");
    }
    return createQuickChatAutomationTarget(target.providerId, target.sessionTypeId);
  }
  if (!target.folderUri) {
    throw new Error("Workspace-backed automation requires a folderUri.");
  }
  return createWorkspaceAutomationTarget(
    target.folderUri,
    target.providerId,
    target.sessionTypeId,
    target.isolation
  );
}
function serializeAutomationTarget(target) {
  return target.kind === "quickChat" ? { kind: "quickChat", providerId: target.providerId, sessionTypeId: target.sessionTypeId } : {
    kind: "workspace",
    folderUri: target.folderUri.toJSON(),
    providerId: target.providerId,
    sessionTypeId: target.sessionTypeId,
    isolation: target.isolation
  };
}
function deserializeAutomationTarget(target) {
  if (target?.kind === "quickChat") {
    return target.providerId && target.sessionTypeId ? createQuickChatAutomationTarget(target.providerId, target.sessionTypeId) : void 0;
  }
  if (target?.kind !== "workspace" || !target.folderUri || !isAutomationWorkspaceIsolation(target.isolation)) {
    return void 0;
  }
  return createWorkspaceAutomationTarget(
    URI.revive(target.folderUri),
    target.providerId,
    target.sessionTypeId,
    target.isolation
  );
}
function deserializeLegacyIsolation(isolationMode, branch) {
  if (isolationMode === "worktree") {
    return branch ? { kind: "worktree", branch } : { kind: "default" };
  }
  return isolationMode === "workspace" ? { kind: "folder" } : { kind: "default" };
}
function normalizeAutomationWorkspaceIsolation(isolation) {
  if (isolation?.kind === "default") {
    return Object.freeze({ kind: "default" });
  }
  if (isolation?.kind === "folder") {
    return Object.freeze({ kind: "folder" });
  }
  if (isolation?.kind === "worktree" && isolation.branch) {
    return Object.freeze({ kind: "worktree", branch: isolation.branch });
  }
  if (isolation?.kind === "worktree") {
    throw new Error("Worktree automation requires a branch.");
  }
  throw new Error("Workspace-backed automation requires a valid isolation mode.");
}
function createQuickChatAutomationTarget(providerId, sessionTypeId) {
  return Object.freeze({ kind: "quickChat", providerId, sessionTypeId });
}
function createWorkspaceAutomationTarget(folderUri, providerId, sessionTypeId, isolation) {
  return Object.freeze({
    kind: "workspace",
    folderUri,
    ...providerId !== void 0 ? { providerId } : {},
    ...sessionTypeId !== void 0 ? { sessionTypeId } : {},
    isolation: normalizeAutomationWorkspaceIsolation(isolation)
  });
}
function isAutomationWorkspaceIsolation(value) {
  return value?.kind === "default" || value?.kind === "folder" || value?.kind === "worktree" && typeof value.branch === "string" && value.branch.length > 0;
}
function findActiveRun(runs, automationId) {
  return runs.find((run) => run.automationId === automationId && (run.status === "pending" || run.status === "running"));
}
function trimRunsPerAutomation(runs, max) {
  const counts = /* @__PURE__ */ new Map();
  const out = [];
  for (const run of runs) {
    const count = counts.get(run.automationId) ?? 0;
    if (count >= max) {
      continue;
    }
    counts.set(run.automationId, count + 1);
    out.push(run);
  }
  return out.length === runs.length ? runs : out;
}
export {
  AutomationService,
  AutomationStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXGJyb3dzZXJcXGF1dG9tYXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbiwgSUF1dG9tYXRpb25TbmFwc2hvdEltcG9ydFJlc3VsdCwgSUd1YXJkZWRBdXRvbWF0aW9uU25hcHNob3RSZW1vdmFsUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHtcblx0QXV0b21hdGlvblJ1blRyaWdnZXIsXG5cdEF1dG9tYXRpb25UYXJnZXQsXG5cdEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24sXG5cdElBdXRvbWF0aW9uRGVzY3JpcHRvcixcblx0SUF1dG9tYXRpb25SdW4sXG59IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb24uanMnO1xuaW1wb3J0IHtcblx0dHlwZSBBdXRvbWF0aW9uTXV0YXRpb25HdWFyZCxcblx0SUF1dG9tYXRpb25SdW5DbGFpbSxcblx0SUF1dG9tYXRpb25TZXJ2aWNlLFxuXHRJQ3JlYXRlQXV0b21hdGlvbk9wdGlvbnMsXG5cdElHdWFyZGVkQXV0b21hdGlvblVwZGF0ZVJlc3VsdCxcblx0c2VyaWFsaXplQXV0b21hdGlvbkVkaXRhYmxlU3RhdGUsXG5cdElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyxcblx0SUF1dG9tYXRpb25TdG9yZSxcblx0SVVwZGF0ZUF1dG9tYXRpb25SdW5PcHRpb25zLFxufSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBwdWJsaXNoQXV0b21hdGlvbkNyZWF0ZWQsIHB1Ymxpc2hBdXRvbWF0aW9uRGVsZXRlZCwgcHVibGlzaEF1dG9tYXRpb25VcGRhdGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlTmV4dFJ1bkF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvc2NoZWR1bGUuanMnO1xuaW1wb3J0IHsgQ2hhdFBlcm1pc3Npb25MZXZlbCwgaXNDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEFVVE9NQVRJT05fU1RPUkFHRV9LRVksIElBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLmpzJztcblxuY29uc3QgTEVHQUNZX1NDSEVNQV9WRVJTSU9OUyA9IG5ldyBTZXQoWzEsIDJdKTtcbmNvbnN0IENVUlJFTlRfU0NIRU1BX1ZFUlNJT04gPSAzO1xuXG5jb25zdCBNQVhfUlVOU19QRVJfQVVUT01BVElPTiA9IDUwO1xuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRBdXRvbWF0aW9uQmFzZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvbXB0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNjaGVkdWxlOiBJQXV0b21hdGlvbkRlc2NyaXB0b3JbJ3NjaGVkdWxlJ107XG5cdHJlYWRvbmx5IG1vZGVsSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBlcm1pc3Npb25MZXZlbD86IHN0cmluZztcblx0cmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVwZGF0ZWRBdDogc3RyaW5nO1xuXHRyZWFkb25seSBsYXN0UnVuQXQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5leHRSdW5BdD86IHN0cmluZztcbn1cblxudHlwZSBJU2VyaWFsaXplZEF1dG9tYXRpb25UYXJnZXQgPVxuXHR8IHtcblx0XHRyZWFkb25seSBraW5kOiAnd29ya3NwYWNlJztcblx0XHRyZWFkb25seSBmb2xkZXJVcmk6IFVyaUNvbXBvbmVudHM7XG5cdFx0cmVhZG9ubHkgcHJvdmlkZXJJZD86IHN0cmluZztcblx0XHRyZWFkb25seSBzZXNzaW9uVHlwZUlkPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGlzb2xhdGlvbjogQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbjtcblx0fVxuXHR8IHtcblx0XHRyZWFkb25seSBraW5kOiAncXVpY2tDaGF0Jztcblx0XHRyZWFkb25seSBwcm92aWRlcklkOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgc2Vzc2lvblR5cGVJZDogc3RyaW5nO1xuXHR9O1xuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRBdXRvbWF0aW9uIGV4dGVuZHMgSVNlcmlhbGl6ZWRBdXRvbWF0aW9uQmFzZSB7XG5cdHJlYWRvbmx5IHRhcmdldDogSVNlcmlhbGl6ZWRBdXRvbWF0aW9uVGFyZ2V0O1xufVxuXG5pbnRlcmZhY2UgSUxlZ2FjeVNlcmlhbGl6ZWRBdXRvbWF0aW9uIGV4dGVuZHMgSVNlcmlhbGl6ZWRBdXRvbWF0aW9uQmFzZSB7XG5cdHJlYWRvbmx5IGlzUXVpY2tDaGF0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZm9sZGVyVXJpPzogVXJpQ29tcG9uZW50cztcblx0cmVhZG9ubHkgcHJvdmlkZXJJZD86IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblR5cGVJZD86IHN0cmluZztcblx0cmVhZG9ubHkgaXNvbGF0aW9uTW9kZT86IHN0cmluZztcblx0cmVhZG9ubHkgYnJhbmNoPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRMZWRnZXIge1xuXHRyZWFkb25seSBzY2hlbWFWZXJzaW9uOiAzO1xuXHQvLyBPcHRpbWlzdGljLWNvbmN1cnJlbmN5IGNvdW50ZXIuIDAgZm9yIGxlZ2FjeSBibG9icyB3aXRob3V0IHRoaXMgZmllbGQuXG5cdHJlYWRvbmx5IHJldmlzaW9uPzogbnVtYmVyO1xuXHRyZWFkb25seSBhdXRvbWF0aW9uczogcmVhZG9ubHkgSVNlcmlhbGl6ZWRBdXRvbWF0aW9uW107XG5cdHJlYWRvbmx5IHJ1bnM6IHJlYWRvbmx5IChPbWl0PElBdXRvbWF0aW9uUnVuLCAnc2Vzc2lvblJlc291cmNlJz4gJiB7IHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZT86IHN0cmluZyB9KVtdO1xufVxuXG5pbnRlcmZhY2UgSUxlZ2FjeVNlcmlhbGl6ZWRMZWRnZXIge1xuXHRyZWFkb25seSBzY2hlbWFWZXJzaW9uOiAxIHwgMjtcblx0cmVhZG9ubHkgcmV2aXNpb24/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGF1dG9tYXRpb25zOiByZWFkb25seSBJTGVnYWN5U2VyaWFsaXplZEF1dG9tYXRpb25bXTtcblx0cmVhZG9ubHkgcnVuczogcmVhZG9ubHkgKE9taXQ8SUF1dG9tYXRpb25SdW4sICdzZXNzaW9uUmVzb3VyY2UnPiAmIHsgcmVhZG9ubHkgc2Vzc2lvblJlc291cmNlPzogc3RyaW5nIH0pW107XG59XG5cbmludGVyZmFjZSBJTGVkZ2VyIHtcblx0cmVhZG9ubHkgYXV0b21hdGlvbnM6IHJlYWRvbmx5IElBdXRvbWF0aW9uRGVzY3JpcHRvcltdO1xuXHRyZWFkb25seSBydW5zOiByZWFkb25seSBJQXV0b21hdGlvblJ1bltdO1xufVxuXG50eXBlIElMZWRnZXJNdXRhdGlvbjxUPiA9XG5cdHwgeyByZWFkb25seSBraW5kOiAnY29tbWl0JzsgcmVhZG9ubHkgbGVkZ2VyOiBJTGVkZ2VyOyByZWFkb25seSByZXN1bHQ6IFQgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ25vQ2hhbmdlJzsgcmVhZG9ubHkgcmVzdWx0OiBUIH07XG5cbmNvbnN0IEVNUFRZX0xFREdFUjogSUxlZGdlciA9IE9iamVjdC5mcmVlemUoeyBhdXRvbWF0aW9uczogW10sIHJ1bnM6IFtdIH0pO1xuXG50eXBlIFJlYWRMZWRnZXJSZXN1bHQgPVxuXHR8IHsga2luZDogJ2xlZGdlcic7IGxlZGdlcjogSUxlZGdlcjsgcmV2aXNpb246IG51bWJlciB9XG5cdHwgeyBraW5kOiAndW5zdXBwb3J0ZWRTY2hlbWEnIH07XG5cbmV4cG9ydCBjbGFzcyBBdXRvbWF0aW9uU3RvcmUgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUF1dG9tYXRpb25TdG9yZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXV0b21hdGlvbnM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSUF1dG9tYXRpb25EZXNjcmlwdG9yW10+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ydW5zOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+O1xuXHRwcml2YXRlIF9ub3c6ICgpID0+IERhdGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3J1bnNGb3JDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPj4oKTtcblxuXHRwcml2YXRlIF9sYXN0U2VlblJldmlzaW9uID0gMDtcblxuXHRyZWFkb25seSBhdXRvbWF0aW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUF1dG9tYXRpb25EZXNjcmlwdG9yW10+O1xuXHRyZWFkb25seSBydW5zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VLZXk6IHN0cmluZyxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZTogSUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX25vdyA9ICgpID0+IG5ldyBEYXRlKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnJlYWRMZWRnZXIodGhpcy5zdG9yYWdlU2VydmljZS5nZXQodGhpcy5zdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pKTtcblx0XHRjb25zdCBpbml0aWFsID0gcmVzdWx0LmtpbmQgPT09ICdsZWRnZXInID8gcmVzdWx0LmxlZGdlciA6IEVNUFRZX0xFREdFUjtcblx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdsZWRnZXInKSB7XG5cdFx0XHR0aGlzLl9sYXN0U2VlblJldmlzaW9uID0gcmVzdWx0LnJldmlzaW9uO1xuXHRcdH1cblx0XHR0aGlzLl9hdXRvbWF0aW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQXV0b21hdGlvbkRlc2NyaXB0b3JbXT4odGhpcywgaW5pdGlhbC5hdXRvbWF0aW9ucyk7XG5cdFx0dGhpcy5fcnVucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPih0aGlzLCBpbml0aWFsLnJ1bnMpO1xuXHRcdHRoaXMuYXV0b21hdGlvbnMgPSB0aGlzLl9hdXRvbWF0aW9ucztcblx0XHR0aGlzLnJ1bnMgPSB0aGlzLl9ydW5zO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgdGhpcy5zdG9yYWdlS2V5LCB0aGlzLl9zdG9yZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWZyZXNoRnJvbVN0b3JhZ2UoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKiogVGVzdC1vbmx5OiBzd2FwIGluIGEgZGV0ZXJtaW5pc3RpYyBjbG9jayB1c2VkIGJ5IGNyZWF0ZS91cGRhdGUuICovXG5cdHNldENsb2NrRm9yVGVzdGluZyhub3c6ICgpID0+IERhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl9ub3cgPSBub3c7XG5cdH1cblxuXHRnZXRBdXRvbWF0aW9uKGlkOiBzdHJpbmcpOiBJQXV0b21hdGlvbkRlc2NyaXB0b3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hdXRvbWF0aW9ucy5nZXQoKS5maW5kKGEgPT4gYS5pZCA9PT0gaWQpO1xuXHR9XG5cblx0cnVuc0ZvcihhdXRvbWF0aW9uSWQ6IHN0cmluZyk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+IHtcblx0XHRsZXQgY2FjaGVkID0gdGhpcy5fcnVuc0ZvckNhY2hlLmdldChhdXRvbWF0aW9uSWQpO1xuXHRcdGlmICghY2FjaGVkKSB7XG5cdFx0XHRjYWNoZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl9ydW5zLnJlYWQocmVhZGVyKS5maWx0ZXIociA9PiByLmF1dG9tYXRpb25JZCA9PT0gYXV0b21hdGlvbklkKSk7XG5cdFx0XHR0aGlzLl9ydW5zRm9yQ2FjaGUuc2V0KGF1dG9tYXRpb25JZCwgY2FjaGVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNhY2hlZDtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUF1dG9tYXRpb24ob3B0aW9uczogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zLCBtdXRhdGlvbkd1YXJkPzogQXV0b21hdGlvbk11dGF0aW9uR3VhcmQpOiBQcm9taXNlPElBdXRvbWF0aW9uRGVzY3JpcHRvcj4ge1xuXHRcdGNvbnN0IG5vdyA9IHRoaXMuX25vdygpO1xuXHRcdGNvbnN0IG5vd0lzbyA9IG5vdy50b0lTT1N0cmluZygpO1xuXHRcdGNvbnN0IG5leHRSdW4gPSBjb21wdXRlTmV4dFJ1bkF0KG9wdGlvbnMuc2NoZWR1bGUsIG5vdyk7XG5cdFx0Y29uc3QgYXV0b21hdGlvbjogSUF1dG9tYXRpb25EZXNjcmlwdG9yID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRuYW1lOiBvcHRpb25zLm5hbWUsXG5cdFx0XHRwcm9tcHQ6IG9wdGlvbnMucHJvbXB0LFxuXHRcdFx0c2NoZWR1bGU6IG9wdGlvbnMuc2NoZWR1bGUsXG5cdFx0XHR0YXJnZXQ6IG5vcm1hbGl6ZUF1dG9tYXRpb25UYXJnZXQob3B0aW9ucy50YXJnZXQpLFxuXHRcdFx0bW9kZWxJZDogb3B0aW9ucy5tb2RlbElkLFxuXHRcdFx0bW9kZTogb3B0aW9ucy5tb2RlLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsOiBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwob3B0aW9ucy5wZXJtaXNzaW9uTGV2ZWwpID8gb3B0aW9ucy5wZXJtaXNzaW9uTGV2ZWwgOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiBvcHRpb25zLmVuYWJsZWQgPz8gdHJ1ZSxcblx0XHRcdGNyZWF0ZWRBdDogbm93SXNvLFxuXHRcdFx0dXBkYXRlZEF0OiBub3dJc28sXG5cdFx0XHRsYXN0UnVuQXQ6IHVuZGVmaW5lZCxcblx0XHRcdG5leHRSdW5BdDogbmV4dFJ1bj8udG9JU09TdHJpbmcoKSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLm11dGF0ZUxlZGdlcihsZWRnZXIgPT4gKHtcblx0XHRcdGtpbmQ6ICdjb21taXQnLFxuXHRcdFx0bGVkZ2VyOiB7IGF1dG9tYXRpb25zOiBbYXV0b21hdGlvbiwgLi4ubGVkZ2VyLmF1dG9tYXRpb25zXSwgcnVuczogbGVkZ2VyLnJ1bnMgfSxcblx0XHRcdHJlc3VsdDogdW5kZWZpbmVkLFxuXHRcdH0pLCBtdXRhdGlvbkd1YXJkKTtcblx0XHRwdWJsaXNoQXV0b21hdGlvbkNyZWF0ZWQodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCBhdXRvbWF0aW9uKTtcblx0XHRyZXR1cm4gYXV0b21hdGlvbjtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUF1dG9tYXRpb24oaWQ6IHN0cmluZywgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyk6IFByb21pc2U8SUF1dG9tYXRpb25EZXNjcmlwdG9yPiB7XG5cdFx0Y29uc3Qgbm93ID0gdGhpcy5fbm93KCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tdXRhdGVMZWRnZXIobGVkZ2VyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBsZWRnZXIuYXV0b21hdGlvbnMuZmluZChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQgPT09IGlkKTtcblx0XHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEF1dG9tYXRpb24gbm90IGZvdW5kOiAke2lkfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IHVwZGF0ZUF1dG9tYXRpb24oY3VycmVudCwgcGF0Y2gsIG5vdyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnY29tbWl0Jyxcblx0XHRcdFx0bGVkZ2VyOiB7XG5cdFx0XHRcdFx0YXV0b21hdGlvbnM6IGxlZGdlci5hdXRvbWF0aW9ucy5tYXAoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkID09PSBpZCA/IHVwZGF0ZWQgOiBhdXRvbWF0aW9uKSxcblx0XHRcdFx0XHRydW5zOiBsZWRnZXIucnVucyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVzdWx0OiB7IGN1cnJlbnQsIHVwZGF0ZWQgfSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0cHVibGlzaEF1dG9tYXRpb25VcGRhdGVkKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgcmVzdWx0LmN1cnJlbnQsIHJlc3VsdC51cGRhdGVkKTtcblx0XHRyZXR1cm4gcmVzdWx0LnVwZGF0ZWQ7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVBdXRvbWF0aW9uSWZVbmNoYW5nZWQoaWQ6IHN0cmluZywgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucywgZXhwZWN0ZWQ6IElBdXRvbWF0aW9uRGVzY3JpcHRvciwgbXV0YXRpb25HdWFyZD86IEF1dG9tYXRpb25NdXRhdGlvbkd1YXJkKTogUHJvbWlzZTxJR3VhcmRlZEF1dG9tYXRpb25VcGRhdGVSZXN1bHQ+IHtcblx0XHRjb25zdCBub3cgPSB0aGlzLl9ub3coKTtcblx0XHRsZXQgcHJldmlvdXM6IElBdXRvbWF0aW9uRGVzY3JpcHRvciB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm11dGF0ZUxlZGdlcjxJR3VhcmRlZEF1dG9tYXRpb25VcGRhdGVSZXN1bHQ+KGxlZGdlciA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gbGVkZ2VyLmF1dG9tYXRpb25zLmZpbmQoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkID09PSBpZCk7XG5cdFx0XHRpZiAoIWN1cnJlbnQgfHwgc2VyaWFsaXplQXV0b21hdGlvbkVkaXRhYmxlU3RhdGUoY3VycmVudCkgIT09IHNlcmlhbGl6ZUF1dG9tYXRpb25FZGl0YWJsZVN0YXRlKGV4cGVjdGVkKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdub0NoYW5nZScsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IGtpbmQ6ICdjb25mbGljdCcsIGN1cnJlbnQgfSBhcyBjb25zdCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IHVwZGF0ZUF1dG9tYXRpb24oY3VycmVudCwgcGF0Y2gsIG5vdyk7XG5cdFx0XHRwcmV2aW91cyA9IGN1cnJlbnQ7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnY29tbWl0Jyxcblx0XHRcdFx0bGVkZ2VyOiB7XG5cdFx0XHRcdFx0YXV0b21hdGlvbnM6IGxlZGdlci5hdXRvbWF0aW9ucy5tYXAoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkID09PSBpZCA/IHVwZGF0ZWQgOiBhdXRvbWF0aW9uKSxcblx0XHRcdFx0XHRydW5zOiBsZWRnZXIucnVucyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVzdWx0OiB7IGtpbmQ6ICd1cGRhdGVkJywgYXV0b21hdGlvbjogdXBkYXRlZCB9IGFzIGNvbnN0LFxuXHRcdFx0fTtcblx0XHR9LCBtdXRhdGlvbkd1YXJkKTtcblx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdjb25mbGljdCcgfHwgIXByZXZpb3VzKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHB1Ymxpc2hBdXRvbWF0aW9uVXBkYXRlZCh0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIHByZXZpb3VzLCByZXN1bHQuYXV0b21hdGlvbik7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUF1dG9tYXRpb24oaWQ6IHN0cmluZywgbXV0YXRpb25HdWFyZD86IEF1dG9tYXRpb25NdXRhdGlvbkd1YXJkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBhd2FpdCB0aGlzLm11dGF0ZUxlZGdlcihsZWRnZXIgPT4ge1xuXHRcdFx0Y29uc3QgYXV0b21hdGlvbiA9IGxlZGdlci5hdXRvbWF0aW9ucy5maW5kKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5pZCA9PT0gaWQpO1xuXHRcdFx0aWYgKCFhdXRvbWF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdub0NoYW5nZScsIHJlc3VsdDogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnY29tbWl0Jyxcblx0XHRcdFx0bGVkZ2VyOiB7XG5cdFx0XHRcdFx0YXV0b21hdGlvbnM6IGxlZGdlci5hdXRvbWF0aW9ucy5maWx0ZXIoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkICE9PSBpZCksXG5cdFx0XHRcdFx0cnVuczogbGVkZ2VyLnJ1bnMuZmlsdGVyKHJ1biA9PiBydW4uYXV0b21hdGlvbklkICE9PSBpZCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc3VsdDogYXV0b21hdGlvbixcblx0XHRcdH07XG5cdFx0fSwgbXV0YXRpb25HdWFyZCk7XG5cdFx0aWYgKCFleGlzdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3J1bnNGb3JDYWNoZS5kZWxldGUoaWQpO1xuXHRcdHB1Ymxpc2hBdXRvbWF0aW9uRGVsZXRlZCh0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIGV4aXN0aW5nKTtcblx0fVxuXG5cdGFzeW5jIGltcG9ydEF1dG9tYXRpb25TbmFwc2hvdChzbmFwc2hvdDogSUF1dG9tYXRpb24pOiBQcm9taXNlPElBdXRvbWF0aW9uU25hcHNob3RJbXBvcnRSZXN1bHQ+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb24sIHJ1bnMgfSA9IHNuYXBzaG90O1xuXHRcdHJldHVybiB0aGlzLm11dGF0ZUxlZGdlcjxJQXV0b21hdGlvblNuYXBzaG90SW1wb3J0UmVzdWx0PihsZWRnZXIgPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBsZWRnZXIuYXV0b21hdGlvbnMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBhdXRvbWF0aW9uLmlkKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50OiBJQXV0b21hdGlvbiA9IHtcblx0XHRcdFx0XHRhdXRvbWF0aW9uOiBleGlzdGluZyxcblx0XHRcdFx0XHRydW5zOiBsZWRnZXIucnVucy5maWx0ZXIocnVuID0+IHJ1bi5hdXRvbWF0aW9uSWQgPT09IGF1dG9tYXRpb24uaWQpLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4gYXJlQXV0b21hdGlvblNuYXBzaG90c0VxdWFsKGN1cnJlbnQsIHNuYXBzaG90KVxuXHRcdFx0XHRcdD8geyBraW5kOiAnbm9DaGFuZ2UnLCByZXN1bHQ6IHsga2luZDogJ2FscmVhZHlQcmVzZW50JyB9IGFzIGNvbnN0IH1cblx0XHRcdFx0XHQ6IHsga2luZDogJ25vQ2hhbmdlJywgcmVzdWx0OiB7IGtpbmQ6ICdjb25mbGljdCcsIGN1cnJlbnQgfSBhcyBjb25zdCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2NvbW1pdCcsXG5cdFx0XHRcdGxlZGdlcjoge1xuXHRcdFx0XHRcdGF1dG9tYXRpb25zOiBbYXV0b21hdGlvbiwgLi4ubGVkZ2VyLmF1dG9tYXRpb25zXSxcblx0XHRcdFx0XHRydW5zOiBbLi4ucnVucywgLi4ubGVkZ2VyLnJ1bnNdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXN1bHQ6IHsga2luZDogJ2luc2VydGVkJyB9IGFzIGNvbnN0LFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHVwc2VydEF1dG9tYXRpb25TbmFwc2hvdChzbmFwc2hvdDogSUF1dG9tYXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb24sIHJ1bnMgfSA9IHNuYXBzaG90O1xuXHRcdGF3YWl0IHRoaXMubXV0YXRlTGVkZ2VyKGxlZGdlciA9PiB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGxlZGdlci5hdXRvbWF0aW9ucy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQgPT09IGF1dG9tYXRpb24uaWQpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdSdW5JZHMgPSBuZXcgU2V0KGxlZGdlci5ydW5zLm1hcChydW4gPT4gcnVuLmlkKSk7XG5cdFx0XHRjb25zdCBtaXNzaW5nUnVucyA9IHJ1bnMuZmlsdGVyKHJ1biA9PiAhZXhpc3RpbmdSdW5JZHMuaGFzKHJ1bi5pZCkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nICYmIEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZUF1dG9tYXRpb24oZXhpc3RpbmcpKSA9PT0gSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplQXV0b21hdGlvbihhdXRvbWF0aW9uKSkgJiYgbWlzc2luZ1J1bnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdub0NoYW5nZScsIHJlc3VsdDogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnY29tbWl0Jyxcblx0XHRcdFx0bGVkZ2VyOiB7XG5cdFx0XHRcdFx0YXV0b21hdGlvbnM6IGV4aXN0aW5nXG5cdFx0XHRcdFx0XHQ/IGxlZGdlci5hdXRvbWF0aW9ucy5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gYXV0b21hdGlvbi5pZCA/IGF1dG9tYXRpb24gOiBjYW5kaWRhdGUpXG5cdFx0XHRcdFx0XHQ6IFthdXRvbWF0aW9uLCAuLi5sZWRnZXIuYXV0b21hdGlvbnNdLFxuXHRcdFx0XHRcdHJ1bnM6IFsuLi5taXNzaW5nUnVucywgLi4ubGVkZ2VyLnJ1bnNdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyByZW1vdmVBdXRvbWF0aW9uU25hcHNob3RJZlVuY2hhbmdlZChleHBlY3RlZDogSUF1dG9tYXRpb24pOiBQcm9taXNlPElHdWFyZGVkQXV0b21hdGlvblNuYXBzaG90UmVtb3ZhbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMubXV0YXRlTGVkZ2VyPElHdWFyZGVkQXV0b21hdGlvblNuYXBzaG90UmVtb3ZhbFJlc3VsdD4obGVkZ2VyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBsZWRnZXIuYXV0b21hdGlvbnMuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBleHBlY3RlZC5hdXRvbWF0aW9uLmlkKTtcblx0XHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnbm9DaGFuZ2UnLCByZXN1bHQ6IHsga2luZDogJ21pc3NpbmcnIH0gfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnJlbnRSdW5zID0gbGVkZ2VyLnJ1bnMuZmlsdGVyKHJ1biA9PiBydW4uYXV0b21hdGlvbklkID09PSBleHBlY3RlZC5hdXRvbWF0aW9uLmlkKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRTbmFwc2hvdDogSUF1dG9tYXRpb24gPSB7IGF1dG9tYXRpb246IGN1cnJlbnQsIHJ1bnM6IGN1cnJlbnRSdW5zIH07XG5cdFx0XHRpZiAoIWFyZUF1dG9tYXRpb25TbmFwc2hvdHNFcXVhbChjdXJyZW50U25hcHNob3QsIGV4cGVjdGVkKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdub0NoYW5nZScsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IGtpbmQ6ICdjb25mbGljdCcsIGN1cnJlbnQ6IGN1cnJlbnRTbmFwc2hvdCB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2NvbW1pdCcsXG5cdFx0XHRcdGxlZGdlcjoge1xuXHRcdFx0XHRcdGF1dG9tYXRpb25zOiBsZWRnZXIuYXV0b21hdGlvbnMuZmlsdGVyKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQgIT09IGV4cGVjdGVkLmF1dG9tYXRpb24uaWQpLFxuXHRcdFx0XHRcdHJ1bnM6IGxlZGdlci5ydW5zLmZpbHRlcihydW4gPT4gcnVuLmF1dG9tYXRpb25JZCAhPT0gZXhwZWN0ZWQuYXV0b21hdGlvbi5pZCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc3VsdDogeyBraW5kOiAncmVtb3ZlZCcgfSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAncmVtb3ZlZCcpIHtcblx0XHRcdHRoaXMuX3J1bnNGb3JDYWNoZS5kZWxldGUoZXhwZWN0ZWQuYXV0b21hdGlvbi5pZCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyByZWNvcmRSdW5TdGFydChhdXRvbWF0aW9uSWQ6IHN0cmluZywgdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsIGxlYWRlcldpbmRvd0lkOiBudW1iZXIpOiBQcm9taXNlPElBdXRvbWF0aW9uUnVuQ2xhaW0+IHtcblx0XHRjb25zdCBub3cgPSB0aGlzLl9ub3coKTtcblx0XHRjb25zdCBzdGFydGVkQXQgPSBub3cudG9JU09TdHJpbmcoKTtcblx0XHRjb25zdCBydW46IElBdXRvbWF0aW9uUnVuID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRhdXRvbWF0aW9uSWQsXG5cdFx0XHRzdGF0dXM6ICdwZW5kaW5nJyxcblx0XHRcdHRyaWdnZXIsXG5cdFx0XHRzdGFydGVkQXQsXG5cdFx0XHRsZWFkZXJXaW5kb3dJZCxcblx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcy5tdXRhdGVMZWRnZXI8SUF1dG9tYXRpb25SdW5DbGFpbT4obGVkZ2VyID0+IHtcblx0XHRcdGNvbnN0IGF1dG9tYXRpb24gPSBsZWRnZXIuYXV0b21hdGlvbnMuZmluZChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQgPT09IGF1dG9tYXRpb25JZCk7XG5cdFx0XHRpZiAoIWF1dG9tYXRpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBdXRvbWF0aW9uIG5vdCBmb3VuZDogJHthdXRvbWF0aW9uSWR9YCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDbGFpbWluZyBpbnNpZGUgdGhlIGNvbXBhcmUtYW5kLXN3YXAga2VlcHMgYXQgbW9zdCBvbmUgYWN0aXZlIHJ1biBwZXJcblx0XHRcdC8vIGF1dG9tYXRpb24gZXZlbiB3aGVuIHdpbmRvd3Mgb3IgYWdlbnRzIHJhY2UgdG8gc3RhcnQgdGhlIHNhbWUgb25lLlxuXHRcdFx0Y29uc3QgYWN0aXZlUnVuID0gZmluZEFjdGl2ZVJ1bihsZWRnZXIucnVucywgYXV0b21hdGlvbklkKTtcblx0XHRcdGlmIChhY3RpdmVSdW4pIHtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ25vQ2hhbmdlJywgcmVzdWx0OiB7IGNsYWltZWQ6IGZhbHNlLCBydW46IGFjdGl2ZVJ1biB9IH07XG5cdFx0XHR9XG5cdFx0XHRsZXQgYXV0b21hdGlvbnMgPSBsZWRnZXIuYXV0b21hdGlvbnM7XG5cdFx0XHRpZiAodHJpZ2dlciAhPT0gJ21hbnVhbCcpIHtcblx0XHRcdFx0Y29uc3QgdXBkYXRlZEF1dG9tYXRpb246IElBdXRvbWF0aW9uRGVzY3JpcHRvciA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRcdC4uLmF1dG9tYXRpb24sXG5cdFx0XHRcdFx0bGFzdFJ1bkF0OiBzdGFydGVkQXQsXG5cdFx0XHRcdFx0bmV4dFJ1bkF0OiBjb21wdXRlTmV4dFJ1bkF0KGF1dG9tYXRpb24uc2NoZWR1bGUsIG5vdyk/LnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0dXBkYXRlZEF0OiBzdGFydGVkQXQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhdXRvbWF0aW9ucyA9IGF1dG9tYXRpb25zLm1hcChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQgPT09IGF1dG9tYXRpb25JZCA/IHVwZGF0ZWRBdXRvbWF0aW9uIDogYXV0b21hdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnY29tbWl0Jyxcblx0XHRcdFx0bGVkZ2VyOiB7IGF1dG9tYXRpb25zLCBydW5zOiBbcnVuLCAuLi5sZWRnZXIucnVuc10gfSxcblx0XHRcdFx0cmVzdWx0OiB7IGNsYWltZWQ6IHRydWUsIHJ1biB9LFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVJ1bihydW5JZDogc3RyaW5nLCBwYXRjaDogSVVwZGF0ZUF1dG9tYXRpb25SdW5PcHRpb25zKTogUHJvbWlzZTxJQXV0b21hdGlvblJ1biB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLm11dGF0ZUxlZGdlcihsZWRnZXIgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGxlZGdlci5ydW5zLmZpbmQocnVuID0+IHJ1bi5pZCA9PT0gcnVuSWQpO1xuXHRcdFx0aWYgKCFjdXJyZW50KSB7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdub0NoYW5nZScsIHJlc3VsdDogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVkOiBJQXV0b21hdGlvblJ1biA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHQuLi5jdXJyZW50LFxuXHRcdFx0XHRzdGF0dXM6IHBhdGNoLnN0YXR1cyA/PyBjdXJyZW50LnN0YXR1cyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBwYXRjaC5zZXNzaW9uUmVzb3VyY2UgPz8gY3VycmVudC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiBwYXRjaC5jb21wbGV0ZWRBdCA/PyBjdXJyZW50LmNvbXBsZXRlZEF0LFxuXHRcdFx0XHRlcnJvck1lc3NhZ2U6IHBhdGNoLmVycm9yTWVzc2FnZSA/PyBjdXJyZW50LmVycm9yTWVzc2FnZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2NvbW1pdCcsXG5cdFx0XHRcdGxlZGdlcjoge1xuXHRcdFx0XHRcdGF1dG9tYXRpb25zOiBsZWRnZXIuYXV0b21hdGlvbnMsXG5cdFx0XHRcdFx0cnVuczogbGVkZ2VyLnJ1bnMubWFwKHJ1biA9PiBydW4uaWQgPT09IHJ1bklkID8gdXBkYXRlZCA6IHJ1biksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc3VsdDogdXBkYXRlZCxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVSdW4ocnVuSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMubXV0YXRlTGVkZ2VyKGxlZGdlciA9PiB7XG5cdFx0XHRpZiAoIWxlZGdlci5ydW5zLnNvbWUocnVuID0+IHJ1bi5pZCA9PT0gcnVuSWQpKSB7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdub0NoYW5nZScsIHJlc3VsdDogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnY29tbWl0Jyxcblx0XHRcdFx0bGVkZ2VyOiB7XG5cdFx0XHRcdFx0YXV0b21hdGlvbnM6IGxlZGdlci5hdXRvbWF0aW9ucyxcblx0XHRcdFx0XHRydW5zOiBsZWRnZXIucnVucy5maWx0ZXIocnVuID0+IHJ1bi5pZCAhPT0gcnVuSWQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRnZXRBY3RpdmVSdW5Gb3IoYXV0b21hdGlvbklkOiBzdHJpbmcpOiBJQXV0b21hdGlvblJ1biB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZpbmRBY3RpdmVSdW4odGhpcy5fcnVucy5nZXQoKSwgYXV0b21hdGlvbklkKTtcblx0fVxuXG5cdGFzeW5jIG1hcmtTdGFsZVJ1bnNGYWlsZWQocmVhc29uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb21wbGV0ZWRBdCA9IHRoaXMuX25vdygpLnRvSVNPU3RyaW5nKCk7XG5cdFx0YXdhaXQgdGhpcy5tdXRhdGVMZWRnZXIobGVkZ2VyID0+IHtcblx0XHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBydW5zID0gbGVkZ2VyLnJ1bnMubWFwKHJ1biA9PiB7XG5cdFx0XHRcdGlmIChydW4uc3RhdHVzID09PSAncGVuZGluZycgfHwgcnVuLnN0YXR1cyA9PT0gJ3J1bm5pbmcnKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIE9iamVjdC5mcmVlemUoeyAuLi5ydW4sIHN0YXR1czogJ2ZhaWxlZCcgYXMgY29uc3QsIGNvbXBsZXRlZEF0LCBlcnJvck1lc3NhZ2U6IHJlYXNvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcnVuO1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIWNoYW5nZWQpIHtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ25vQ2hhbmdlJywgcmVzdWx0OiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdjb21taXQnLFxuXHRcdFx0XHRsZWRnZXI6IHsgYXV0b21hdGlvbnM6IGxlZGdlci5hdXRvbWF0aW9ucywgcnVucyB9LFxuXHRcdFx0XHRyZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHQvLyNyZWdpb24gUGVyc2lzdGVuY2VcblxuXHRwcml2YXRlIGFzeW5jIG11dGF0ZUxlZGdlcjxUPihtdXRhdGU6IChsZWRnZXI6IElMZWRnZXIpID0+IElMZWRnZXJNdXRhdGlvbjxUPiwgbXV0YXRpb25HdWFyZD86IEF1dG9tYXRpb25NdXRhdGlvbkd1YXJkKTogUHJvbWlzZTxUPiB7XG5cdFx0bGV0IHJhdyA9IGF3YWl0IHRoaXMuYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLnJlYWQodGhpcy5zdG9yYWdlS2V5KTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgcmVhZFJlc3VsdCA9IHRoaXMucmVhZExlZGdlcihyYXcpO1xuXHRcdFx0aWYgKHJlYWRSZXN1bHQua2luZCA9PT0gJ3Vuc3VwcG9ydGVkU2NoZW1hJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBtb2RpZnkgYXV0b21hdGlvbnM6IHN0b3JhZ2Ugd2FzIHdyaXR0ZW4gYnkgYSBuZXdlciB2ZXJzaW9uJyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuYWNjZXB0TGVkZ2VyKHJlYWRSZXN1bHQubGVkZ2VyLCByZWFkUmVzdWx0LnJldmlzaW9uKTtcblx0XHRcdGNvbnN0IG11dGF0aW9uID0gbXV0YXRlKHJlYWRSZXN1bHQubGVkZ2VyKTtcblx0XHRcdGlmIChtdXRhdGlvbi5raW5kID09PSAnbm9DaGFuZ2UnKSB7XG5cdFx0XHRcdHJldHVybiBtdXRhdGlvbi5yZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxlZGdlcjogSUxlZGdlciA9IHtcblx0XHRcdFx0YXV0b21hdGlvbnM6IG11dGF0aW9uLmxlZGdlci5hdXRvbWF0aW9ucyxcblx0XHRcdFx0cnVuczogdHJpbVJ1bnNQZXJBdXRvbWF0aW9uKG11dGF0aW9uLmxlZGdlci5ydW5zLCBNQVhfUlVOU19QRVJfQVVUT01BVElPTiksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmV2aXNpb24gPSByZWFkUmVzdWx0LnJldmlzaW9uICsgMTtcblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQ6IElTZXJpYWxpemVkTGVkZ2VyID0ge1xuXHRcdFx0XHRzY2hlbWFWZXJzaW9uOiBDVVJSRU5UX1NDSEVNQV9WRVJTSU9OLFxuXHRcdFx0XHRyZXZpc2lvbixcblx0XHRcdFx0YXV0b21hdGlvbnM6IGxlZGdlci5hdXRvbWF0aW9ucy5tYXAoc2VyaWFsaXplQXV0b21hdGlvbiksXG5cdFx0XHRcdHJ1bnM6IGxlZGdlci5ydW5zLm1hcChydW4gPT4gKHsgLi4ucnVuLCBzZXNzaW9uUmVzb3VyY2U6IHJ1bi5zZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCkgfSkpLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG5ld1ZhbHVlID0gSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplZCk7XG5cdFx0XHRtdXRhdGlvbkd1YXJkPy4oKTtcblx0XHRcdGNvbnN0IHdyaXRlUmVzdWx0ID0gYXdhaXQgdGhpcy5hdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UuY29tcGFyZUFuZFN3YXAodGhpcy5zdG9yYWdlS2V5LCByYXcsIG5ld1ZhbHVlKTtcblx0XHRcdGlmICh3cml0ZVJlc3VsdC5zd2FwcGVkKSB7XG5cdFx0XHRcdHRoaXMuc2V0TGVkZ2VyKGxlZGdlciwgcmV2aXNpb24pO1xuXHRcdFx0XHRyZXR1cm4gbXV0YXRpb24ucmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdyaXRlUmVzdWx0LmN1cnJlbnRWYWx1ZSA9PT0gcmF3KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQXV0b21hdGlvbiBzdG9yYWdlIHJlamVjdGVkIGFuIHVuY2hhbmdlZCBjb21wYXJlLWFuZC1zd2FwIHZhbHVlLicpO1xuXHRcdFx0fVxuXHRcdFx0cmF3ID0gd3JpdGVSZXN1bHQuY3VycmVudFZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWNjZXB0TGVkZ2VyKGxlZGdlcjogSUxlZGdlciwgcmV2aXNpb246IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChyZXZpc2lvbiA8IHRoaXMuX2xhc3RTZWVuUmV2aXNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zZXRMZWRnZXIobGVkZ2VyLCByZXZpc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIHNldExlZGdlcihsZWRnZXI6IElMZWRnZXIsIHJldmlzaW9uOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0U2VlblJldmlzaW9uID0gcmV2aXNpb247XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5fYXV0b21hdGlvbnMuc2V0KGxlZGdlci5hdXRvbWF0aW9ucywgdHgpO1xuXHRcdFx0dGhpcy5fcnVucy5zZXQobGVkZ2VyLnJ1bnMsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaEZyb21TdG9yYWdlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMucmVhZExlZGdlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldCh0aGlzLnN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikpO1xuXHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ3Vuc3VwcG9ydGVkU2NoZW1hJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuYWNjZXB0TGVkZ2VyKHJlc3VsdC5sZWRnZXIsIHJlc3VsdC5yZXZpc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRMZWRnZXIocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBSZWFkTGVkZ2VyUmVzdWx0IHtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ2xlZGdlcicsIGxlZGdlcjogRU1QVFlfTEVER0VSLCByZXZpc2lvbjogMCB9O1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIElTZXJpYWxpemVkTGVkZ2VyIHwgSUxlZ2FjeVNlcmlhbGl6ZWRMZWRnZXI7XG5cdFx0XHRpZiAodHlwZW9mIHBhcnNlZD8uc2NoZW1hVmVyc2lvbiA9PT0gJ251bWJlcicgJiYgcGFyc2VkLnNjaGVtYVZlcnNpb24gPiBDVVJSRU5UX1NDSEVNQV9WRVJTSU9OKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbQXV0b21hdGlvblNlcnZpY2VdIExlZGdlciBoYXMgc2NoZW1hIHYke3BhcnNlZC5zY2hlbWFWZXJzaW9ufTsgdGhpcyBidWlsZCBvbmx5IHN1cHBvcnRzIHYke0NVUlJFTlRfU0NIRU1BX1ZFUlNJT059LiBFbnRlcmluZyByZWFkLW9ubHkgbW9kZS5gKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3Vuc3VwcG9ydGVkU2NoZW1hJyB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhcnNlZD8uc2NoZW1hVmVyc2lvbiAhPT0gQ1VSUkVOVF9TQ0hFTUFfVkVSU0lPTiAmJiAhTEVHQUNZX1NDSEVNQV9WRVJTSU9OUy5oYXMocGFyc2VkPy5zY2hlbWFWZXJzaW9uKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25TZXJ2aWNlXSBVbnN1cHBvcnRlZCBsZWRnZXIgc2NoZW1hIHZlcnNpb24gJHtwYXJzZWQ/LnNjaGVtYVZlcnNpb259OyBpZ25vcmluZy5gKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2xlZGdlcicsIGxlZGdlcjogRU1QVFlfTEVER0VSLCByZXZpc2lvbjogMCB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXV0b21hdGlvbnM6IElBdXRvbWF0aW9uRGVzY3JpcHRvcltdID0gW107XG5cdFx0XHRpZiAocGFyc2VkLnNjaGVtYVZlcnNpb24gPT09IENVUlJFTlRfU0NIRU1BX1ZFUlNJT04pIHtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IEFycmF5LmlzQXJyYXkocGFyc2VkLmF1dG9tYXRpb25zKSA/IHBhcnNlZC5hdXRvbWF0aW9ucyA6IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYXV0b21hdGlvbiA9IGRlc2VyaWFsaXplQXV0b21hdGlvbihlbnRyeSk7XG5cdFx0XHRcdFx0XHRpZiAoYXV0b21hdGlvbikge1xuXHRcdFx0XHRcdFx0XHRhdXRvbWF0aW9ucy5wdXNoKGF1dG9tYXRpb24pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtBdXRvbWF0aW9uU2VydmljZV0gRHJvcHBpbmcgcGVyc2lzdGVkIGF1dG9tYXRpb24gJHtlbnRyeT8uaWR9IHdpdGggYW4gaW52YWxpZCB0YXJnZXQuYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25TZXJ2aWNlXSBEcm9wcGluZyBtYWxmb3JtZWQgcGVyc2lzdGVkIGF1dG9tYXRpb24gJHtlbnRyeT8uaWR9LmAsIGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gQXJyYXkuaXNBcnJheShwYXJzZWQuYXV0b21hdGlvbnMpID8gcGFyc2VkLmF1dG9tYXRpb25zIDogW107XG5cdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhdXRvbWF0aW9uID0gZGVzZXJpYWxpemVMZWdhY3lBdXRvbWF0aW9uKGVudHJ5KTtcblx0XHRcdFx0XHRcdGlmIChhdXRvbWF0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGF1dG9tYXRpb25zLnB1c2goYXV0b21hdGlvbik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25TZXJ2aWNlXSBEcm9wcGluZyBwZXJzaXN0ZWQgYXV0b21hdGlvbiAke2VudHJ5Py5pZH0gd2l0aCBhbiBpbnZhbGlkIGxlZ2FjeSB0YXJnZXQuYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25TZXJ2aWNlXSBEcm9wcGluZyBtYWxmb3JtZWQgcGVyc2lzdGVkIGF1dG9tYXRpb24gJHtlbnRyeT8uaWR9LmAsIGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YWxpZElkcyA9IG5ldyBTZXQoYXV0b21hdGlvbnMubWFwKGEgPT4gYS5pZCkpO1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZFJ1bnMgPSBBcnJheS5pc0FycmF5KHBhcnNlZC5ydW5zKSA/IHBhcnNlZC5ydW5zIDogW107XG5cdFx0XHRjb25zdCBydW5zID0gc2VyaWFsaXplZFJ1bnNcblx0XHRcdFx0LmZpbHRlcihyID0+ICEhciAmJiB0eXBlb2YgciA9PT0gJ29iamVjdCcgJiYgdmFsaWRJZHMuaGFzKHIuYXV0b21hdGlvbklkKSlcblx0XHRcdFx0Lm1hcChyID0+IE9iamVjdC5mcmVlemUoeyAuLi5yLCBzZXNzaW9uUmVzb3VyY2U6IHIuc2Vzc2lvblJlc291cmNlID8gVVJJLnBhcnNlKHIuc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZCB9KSk7XG5cdFx0XHRjb25zdCByZXZpc2lvbiA9IHR5cGVvZiBwYXJzZWQucmV2aXNpb24gPT09ICdudW1iZXInID8gcGFyc2VkLnJldmlzaW9uIDogMDtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdsZWRnZXInLCBsZWRnZXI6IHsgYXV0b21hdGlvbnMsIHJ1bnM6IHRyaW1SdW5zUGVyQXV0b21hdGlvbihydW5zLCBNQVhfUlVOU19QRVJfQVVUT01BVElPTikgfSwgcmV2aXNpb24gfTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0F1dG9tYXRpb25TZXJ2aWNlXSBGYWlsZWQgdG8gcGFyc2UgYXV0b21hdGlvbnMgbGVkZ2VyOyByZXNldHRpbmcuJywgZXJyKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdsZWRnZXInLCBsZWRnZXI6IEVNUFRZX0xFREdFUiwgcmV2aXNpb246IDAgfTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxuZXhwb3J0IGNsYXNzIEF1dG9tYXRpb25TZXJ2aWNlIGV4dGVuZHMgQXV0b21hdGlvblN0b3JlIGltcGxlbWVudHMgSUF1dG9tYXRpb25TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSBhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2U6IElBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEFVVE9NQVRJT05fU1RPUkFHRV9LRVksIHN0b3JhZ2VTZXJ2aWNlLCBsb2dTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UpO1xuXHR9XG5cblx0c3RhcnRTdGFsZVJ1blJlY292ZXJ5KHJlYXNvbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMubWFya1N0YWxlUnVuc0ZhaWxlZChyZWFzb24pO1xuXHR9XG5cblx0c3RvcFN0YWxlUnVuUmVjb3ZlcnkoKTogdm9pZCB7IH1cbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplQXV0b21hdGlvbihhOiBJQXV0b21hdGlvbkRlc2NyaXB0b3IpOiBJU2VyaWFsaXplZEF1dG9tYXRpb24ge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBhLmlkLFxuXHRcdG5hbWU6IGEubmFtZSxcblx0XHRwcm9tcHQ6IGEucHJvbXB0LFxuXHRcdHNjaGVkdWxlOiBhLnNjaGVkdWxlLFxuXHRcdHRhcmdldDogc2VyaWFsaXplQXV0b21hdGlvblRhcmdldChhLnRhcmdldCksXG5cdFx0bW9kZWxJZDogYS5tb2RlbElkLFxuXHRcdG1vZGU6IGEubW9kZSxcblx0XHRwZXJtaXNzaW9uTGV2ZWw6IGEucGVybWlzc2lvbkxldmVsLFxuXHRcdGVuYWJsZWQ6IGEuZW5hYmxlZCxcblx0XHRjcmVhdGVkQXQ6IGEuY3JlYXRlZEF0LFxuXHRcdHVwZGF0ZWRBdDogYS51cGRhdGVkQXQsXG5cdFx0bGFzdFJ1bkF0OiBhLmxhc3RSdW5BdCxcblx0XHRuZXh0UnVuQXQ6IGEubmV4dFJ1bkF0LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBhcmVBdXRvbWF0aW9uU25hcHNob3RzRXF1YWwoZmlyc3Q6IElBdXRvbWF0aW9uLCBzZWNvbmQ6IElBdXRvbWF0aW9uKTogYm9vbGVhbiB7XG5cdGNvbnN0IG5vcm1hbGl6ZVJ1bnMgPSAocnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSkgPT4gcnVucy5tYXAocnVuID0+ICh7IC4uLnJ1biwgc2Vzc2lvblJlc291cmNlOiBydW4uc2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpIH0pKTtcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZUF1dG9tYXRpb24oZmlyc3QuYXV0b21hdGlvbikpID09PSBKU09OLnN0cmluZ2lmeShzZXJpYWxpemVBdXRvbWF0aW9uKHNlY29uZC5hdXRvbWF0aW9uKSlcblx0XHQmJiBKU09OLnN0cmluZ2lmeShub3JtYWxpemVSdW5zKGZpcnN0LnJ1bnMpKSA9PT0gSlNPTi5zdHJpbmdpZnkobm9ybWFsaXplUnVucyhzZWNvbmQucnVucykpO1xufVxuXG5mdW5jdGlvbiBkZXNlcmlhbGl6ZUF1dG9tYXRpb24oczogSVNlcmlhbGl6ZWRBdXRvbWF0aW9uKTogSUF1dG9tYXRpb25EZXNjcmlwdG9yIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdGFyZ2V0ID0gZGVzZXJpYWxpemVBdXRvbWF0aW9uVGFyZ2V0KHMudGFyZ2V0KTtcblx0cmV0dXJuIHRhcmdldCA/IGNyZWF0ZUF1dG9tYXRpb25Gcm9tU2VyaWFsaXplZChzLCB0YXJnZXQpIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBkZXNlcmlhbGl6ZUxlZ2FjeUF1dG9tYXRpb24oczogSUxlZ2FjeVNlcmlhbGl6ZWRBdXRvbWF0aW9uKTogSUF1dG9tYXRpb25EZXNjcmlwdG9yIHwgdW5kZWZpbmVkIHtcblx0bGV0IHRhcmdldDogQXV0b21hdGlvblRhcmdldDtcblx0aWYgKHMuaXNRdWlja0NoYXQgPT09IHRydWUpIHtcblx0XHRpZiAoIXMucHJvdmlkZXJJZCB8fCAhcy5zZXNzaW9uVHlwZUlkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0YXJnZXQgPSBjcmVhdGVRdWlja0NoYXRBdXRvbWF0aW9uVGFyZ2V0KHMucHJvdmlkZXJJZCwgcy5zZXNzaW9uVHlwZUlkKTtcblx0fSBlbHNlIHtcblx0XHRpZiAoIXMuZm9sZGVyVXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0YXJnZXQgPSBjcmVhdGVXb3Jrc3BhY2VBdXRvbWF0aW9uVGFyZ2V0KFxuXHRcdFx0VVJJLnJldml2ZShzLmZvbGRlclVyaSksXG5cdFx0XHRzLnByb3ZpZGVySWQsXG5cdFx0XHRzLnNlc3Npb25UeXBlSWQsXG5cdFx0XHRkZXNlcmlhbGl6ZUxlZ2FjeUlzb2xhdGlvbihzLmlzb2xhdGlvbk1vZGUsIHMuYnJhbmNoKSxcblx0XHQpO1xuXHR9XG5cdHJldHVybiBjcmVhdGVBdXRvbWF0aW9uRnJvbVNlcmlhbGl6ZWQocywgdGFyZ2V0KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQXV0b21hdGlvbkZyb21TZXJpYWxpemVkKHM6IElTZXJpYWxpemVkQXV0b21hdGlvbkJhc2UsIHRhcmdldDogQXV0b21hdGlvblRhcmdldCk6IElBdXRvbWF0aW9uRGVzY3JpcHRvciB7XG5cdC8vIERlZmF1bHQgdG8gbW9zdCByZXN0cmljdGl2ZSBpZiB0aGUgcGVyc2lzdGVkIHZhbHVlIGlzIGludmFsaWQuXG5cdGNvbnN0IHBlcm1pc3Npb25MZXZlbCA9IGlzQ2hhdFBlcm1pc3Npb25MZXZlbChzLnBlcm1pc3Npb25MZXZlbClcblx0XHQ/IHMucGVybWlzc2lvbkxldmVsXG5cdFx0OiBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQ7XG5cblx0cmV0dXJuIE9iamVjdC5mcmVlemUoe1xuXHRcdGlkOiBzLmlkLFxuXHRcdG5hbWU6IHMubmFtZSxcblx0XHRwcm9tcHQ6IHMucHJvbXB0LFxuXHRcdHNjaGVkdWxlOiBzLnNjaGVkdWxlLFxuXHRcdHRhcmdldCxcblx0XHRtb2RlbElkOiBzLm1vZGVsSWQsXG5cdFx0bW9kZTogcy5tb2RlLFxuXHRcdHBlcm1pc3Npb25MZXZlbCxcblx0XHRlbmFibGVkOiBzLmVuYWJsZWQsXG5cdFx0Y3JlYXRlZEF0OiBzLmNyZWF0ZWRBdCxcblx0XHR1cGRhdGVkQXQ6IHMudXBkYXRlZEF0LFxuXHRcdGxhc3RSdW5BdDogcy5sYXN0UnVuQXQsXG5cdFx0bmV4dFJ1bkF0OiBzLm5leHRSdW5BdCxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUF1dG9tYXRpb24oY3VycmVudDogSUF1dG9tYXRpb25EZXNjcmlwdG9yLCBwYXRjaDogSVVwZGF0ZUF1dG9tYXRpb25PcHRpb25zLCBub3c6IERhdGUpOiBJQXV0b21hdGlvbkRlc2NyaXB0b3Ige1xuXHRjb25zdCBtZXJnZWQgPSBtZXJnZUF1dG9tYXRpb24oY3VycmVudCwgcGF0Y2gpO1xuXHRjb25zdCBzY2hlZHVsZUNoYW5nZWQgPSBwYXRjaC5zY2hlZHVsZSAhPT0gdW5kZWZpbmVkO1xuXHRjb25zdCBlbmFibGVkQ2hhbmdlZCA9IHBhdGNoLmVuYWJsZWQgIT09IHVuZGVmaW5lZDtcblx0cmV0dXJuIE9iamVjdC5mcmVlemUoe1xuXHRcdC4uLm1lcmdlZCxcblx0XHR1cGRhdGVkQXQ6IG5vdy50b0lTT1N0cmluZygpLFxuXHRcdG5leHRSdW5BdDogKHNjaGVkdWxlQ2hhbmdlZCB8fCAoZW5hYmxlZENoYW5nZWQgJiYgbWVyZ2VkLmVuYWJsZWQpKVxuXHRcdFx0PyBjb21wdXRlTmV4dFJ1bkF0KG1lcmdlZC5zY2hlZHVsZSwgbm93KT8udG9JU09TdHJpbmcoKVxuXHRcdFx0OiBtZXJnZWQubmV4dFJ1bkF0LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gbWVyZ2VBdXRvbWF0aW9uKGN1cnJlbnQ6IElBdXRvbWF0aW9uRGVzY3JpcHRvciwgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyk6IElBdXRvbWF0aW9uRGVzY3JpcHRvciB7XG5cdHJldHVybiB7XG5cdFx0Li4uY3VycmVudCxcblx0XHRuYW1lOiBwYXRjaC5uYW1lID8/IGN1cnJlbnQubmFtZSxcblx0XHRwcm9tcHQ6IHBhdGNoLnByb21wdCA/PyBjdXJyZW50LnByb21wdCxcblx0XHRzY2hlZHVsZTogcGF0Y2guc2NoZWR1bGUgPz8gY3VycmVudC5zY2hlZHVsZSxcblx0XHR0YXJnZXQ6IHBhdGNoLnRhcmdldCA/IG5vcm1hbGl6ZUF1dG9tYXRpb25UYXJnZXQocGF0Y2gudGFyZ2V0KSA6IGN1cnJlbnQudGFyZ2V0LFxuXHRcdG1vZGVsSWQ6IHBhdGNoLm1vZGVsSWQgPT09IG51bGwgPyB1bmRlZmluZWQgOiAocGF0Y2gubW9kZWxJZCA/PyBjdXJyZW50Lm1vZGVsSWQpLFxuXHRcdG1vZGU6IHBhdGNoLm1vZGUgPT09IG51bGwgPyB1bmRlZmluZWQgOiAocGF0Y2gubW9kZSA/PyBjdXJyZW50Lm1vZGUpLFxuXHRcdHBlcm1pc3Npb25MZXZlbDogcGF0Y2gucGVybWlzc2lvbkxldmVsID09PSBudWxsID8gdW5kZWZpbmVkIDogKHBhdGNoLnBlcm1pc3Npb25MZXZlbCAmJiBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwocGF0Y2gucGVybWlzc2lvbkxldmVsKSA/IHBhdGNoLnBlcm1pc3Npb25MZXZlbCA6IGN1cnJlbnQucGVybWlzc2lvbkxldmVsKSxcblx0XHRlbmFibGVkOiBwYXRjaC5lbmFibGVkID8/IGN1cnJlbnQuZW5hYmxlZCxcblx0fTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplQXV0b21hdGlvblRhcmdldCh0YXJnZXQ6IEF1dG9tYXRpb25UYXJnZXQpOiBBdXRvbWF0aW9uVGFyZ2V0IHtcblx0aWYgKHRhcmdldC5raW5kID09PSAncXVpY2tDaGF0Jykge1xuXHRcdGlmICghdGFyZ2V0LnByb3ZpZGVySWQgfHwgIXRhcmdldC5zZXNzaW9uVHlwZUlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1dvcmtzcGFjZS1sZXNzIGF1dG9tYXRpb24gcmVxdWlyZXMgYSBwcm92aWRlcklkIGFuZCBzZXNzaW9uVHlwZUlkLicpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3JlYXRlUXVpY2tDaGF0QXV0b21hdGlvblRhcmdldCh0YXJnZXQucHJvdmlkZXJJZCwgdGFyZ2V0LnNlc3Npb25UeXBlSWQpO1xuXHR9XG5cdGlmICghdGFyZ2V0LmZvbGRlclVyaSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignV29ya3NwYWNlLWJhY2tlZCBhdXRvbWF0aW9uIHJlcXVpcmVzIGEgZm9sZGVyVXJpLicpO1xuXHR9XG5cdHJldHVybiBjcmVhdGVXb3Jrc3BhY2VBdXRvbWF0aW9uVGFyZ2V0KFxuXHRcdHRhcmdldC5mb2xkZXJVcmksXG5cdFx0dGFyZ2V0LnByb3ZpZGVySWQsXG5cdFx0dGFyZ2V0LnNlc3Npb25UeXBlSWQsXG5cdFx0dGFyZ2V0Lmlzb2xhdGlvbixcblx0KTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplQXV0b21hdGlvblRhcmdldCh0YXJnZXQ6IEF1dG9tYXRpb25UYXJnZXQpOiBJU2VyaWFsaXplZEF1dG9tYXRpb25UYXJnZXQge1xuXHRyZXR1cm4gdGFyZ2V0LmtpbmQgPT09ICdxdWlja0NoYXQnXG5cdFx0PyB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiB0YXJnZXQucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogdGFyZ2V0LnNlc3Npb25UeXBlSWQgfVxuXHRcdDoge1xuXHRcdFx0a2luZDogJ3dvcmtzcGFjZScsXG5cdFx0XHRmb2xkZXJVcmk6IHRhcmdldC5mb2xkZXJVcmkudG9KU09OKCksXG5cdFx0XHRwcm92aWRlcklkOiB0YXJnZXQucHJvdmlkZXJJZCxcblx0XHRcdHNlc3Npb25UeXBlSWQ6IHRhcmdldC5zZXNzaW9uVHlwZUlkLFxuXHRcdFx0aXNvbGF0aW9uOiB0YXJnZXQuaXNvbGF0aW9uLFxuXHRcdH07XG59XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplQXV0b21hdGlvblRhcmdldCh0YXJnZXQ6IElTZXJpYWxpemVkQXV0b21hdGlvblRhcmdldCk6IEF1dG9tYXRpb25UYXJnZXQgfCB1bmRlZmluZWQge1xuXHRpZiAodGFyZ2V0Py5raW5kID09PSAncXVpY2tDaGF0Jykge1xuXHRcdHJldHVybiB0YXJnZXQucHJvdmlkZXJJZCAmJiB0YXJnZXQuc2Vzc2lvblR5cGVJZFxuXHRcdFx0PyBjcmVhdGVRdWlja0NoYXRBdXRvbWF0aW9uVGFyZ2V0KHRhcmdldC5wcm92aWRlcklkLCB0YXJnZXQuc2Vzc2lvblR5cGVJZClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0YXJnZXQ/LmtpbmQgIT09ICd3b3Jrc3BhY2UnIHx8ICF0YXJnZXQuZm9sZGVyVXJpIHx8ICFpc0F1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24odGFyZ2V0Lmlzb2xhdGlvbikpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBjcmVhdGVXb3Jrc3BhY2VBdXRvbWF0aW9uVGFyZ2V0KFxuXHRcdFVSSS5yZXZpdmUodGFyZ2V0LmZvbGRlclVyaSksXG5cdFx0dGFyZ2V0LnByb3ZpZGVySWQsXG5cdFx0dGFyZ2V0LnNlc3Npb25UeXBlSWQsXG5cdFx0dGFyZ2V0Lmlzb2xhdGlvbixcblx0KTtcbn1cblxuZnVuY3Rpb24gZGVzZXJpYWxpemVMZWdhY3lJc29sYXRpb24oaXNvbGF0aW9uTW9kZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBicmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCk6IEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24ge1xuXHRpZiAoaXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmt0cmVlJykge1xuXHRcdHJldHVybiBicmFuY2ggPyB7IGtpbmQ6ICd3b3JrdHJlZScsIGJyYW5jaCB9IDogeyBraW5kOiAnZGVmYXVsdCcgfTtcblx0fVxuXHRyZXR1cm4gaXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmtzcGFjZScgPyB7IGtpbmQ6ICdmb2xkZXInIH0gOiB7IGtpbmQ6ICdkZWZhdWx0JyB9O1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uKGlzb2xhdGlvbjogQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbik6IEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24ge1xuXHRpZiAoaXNvbGF0aW9uPy5raW5kID09PSAnZGVmYXVsdCcpIHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh7IGtpbmQ6ICdkZWZhdWx0JyB9KTtcblx0fVxuXHRpZiAoaXNvbGF0aW9uPy5raW5kID09PSAnZm9sZGVyJykge1xuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHsga2luZDogJ2ZvbGRlcicgfSk7XG5cdH1cblx0aWYgKGlzb2xhdGlvbj8ua2luZCA9PT0gJ3dvcmt0cmVlJyAmJiBpc29sYXRpb24uYnJhbmNoKSB7XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemUoeyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2g6IGlzb2xhdGlvbi5icmFuY2ggfSk7XG5cdH1cblx0aWYgKGlzb2xhdGlvbj8ua2luZCA9PT0gJ3dvcmt0cmVlJykge1xuXHRcdHRocm93IG5ldyBFcnJvcignV29ya3RyZWUgYXV0b21hdGlvbiByZXF1aXJlcyBhIGJyYW5jaC4nKTtcblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoJ1dvcmtzcGFjZS1iYWNrZWQgYXV0b21hdGlvbiByZXF1aXJlcyBhIHZhbGlkIGlzb2xhdGlvbiBtb2RlLicpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVRdWlja0NoYXRBdXRvbWF0aW9uVGFyZ2V0KHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogQXV0b21hdGlvblRhcmdldCB7XG5cdHJldHVybiBPYmplY3QuZnJlZXplKHsga2luZDogJ3F1aWNrQ2hhdCcsIHByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVdvcmtzcGFjZUF1dG9tYXRpb25UYXJnZXQoXG5cdGZvbGRlclVyaTogVVJJLFxuXHRwcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdHNlc3Npb25UeXBlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0aXNvbGF0aW9uOiBBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uLFxuKTogQXV0b21hdGlvblRhcmdldCB7XG5cdHJldHVybiBPYmplY3QuZnJlZXplKHtcblx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRmb2xkZXJVcmksXG5cdFx0Li4uKHByb3ZpZGVySWQgIT09IHVuZGVmaW5lZCA/IHsgcHJvdmlkZXJJZCB9IDoge30pLFxuXHRcdC4uLihzZXNzaW9uVHlwZUlkICE9PSB1bmRlZmluZWQgPyB7IHNlc3Npb25UeXBlSWQgfSA6IHt9KSxcblx0XHRpc29sYXRpb246IG5vcm1hbGl6ZUF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24oaXNvbGF0aW9uKSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGlzQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbih2YWx1ZTogQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbiB8IHVuZGVmaW5lZCk6IHZhbHVlIGlzIEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24ge1xuXHRyZXR1cm4gdmFsdWU/LmtpbmQgPT09ICdkZWZhdWx0J1xuXHRcdHx8IHZhbHVlPy5raW5kID09PSAnZm9sZGVyJ1xuXHRcdHx8ICh2YWx1ZT8ua2luZCA9PT0gJ3dvcmt0cmVlJyAmJiB0eXBlb2YgdmFsdWUuYnJhbmNoID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5icmFuY2gubGVuZ3RoID4gMCk7XG59XG5cbmZ1bmN0aW9uIGZpbmRBY3RpdmVSdW4ocnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSwgYXV0b21hdGlvbklkOiBzdHJpbmcpOiBJQXV0b21hdGlvblJ1biB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBydW5zLmZpbmQocnVuID0+IHJ1bi5hdXRvbWF0aW9uSWQgPT09IGF1dG9tYXRpb25JZCAmJiAocnVuLnN0YXR1cyA9PT0gJ3BlbmRpbmcnIHx8IHJ1bi5zdGF0dXMgPT09ICdydW5uaW5nJykpO1xufVxuXG5mdW5jdGlvbiB0cmltUnVuc1BlckF1dG9tYXRpb24ocnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSwgbWF4OiBudW1iZXIpOiByZWFkb25seSBJQXV0b21hdGlvblJ1bltdIHtcblx0Y29uc3QgY291bnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Y29uc3Qgb3V0OiBJQXV0b21hdGlvblJ1bltdID0gW107XG5cdGZvciAoY29uc3QgcnVuIG9mIHJ1bnMpIHtcblx0XHRjb25zdCBjb3VudCA9IGNvdW50cy5nZXQocnVuLmF1dG9tYXRpb25JZCkgPz8gMDtcblx0XHRpZiAoY291bnQgPj0gbWF4KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y291bnRzLnNldChydW4uYXV0b21hdGlvbklkLCBjb3VudCArIDEpO1xuXHRcdG91dC5wdXNoKHJ1bik7XG5cdH1cblx0cmV0dXJuIG91dC5sZW5ndGggPT09IHJ1bnMubGVuZ3RoID8gcnVucyA6IG91dDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUEyQyxpQkFBaUIsbUJBQW1CO0FBQ3hGLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMseUJBQXlCO0FBU2xDO0FBQUEsRUFNQztBQUFBLE9BSU07QUFDUCxTQUFTLDBCQUEwQiwwQkFBMEIsZ0NBQWdDO0FBQzdGLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLHdCQUF3QixpQ0FBaUM7QUFFbEUsTUFBTSx5QkFBeUIsb0JBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzdDLE1BQU0seUJBQXlCO0FBRS9CLE1BQU0sMEJBQTBCO0FBb0VoQyxNQUFNLGVBQXdCLE9BQU8sT0FBTyxFQUFFLGFBQWEsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFNbEUsSUFBTSxrQkFBTixjQUE4QixXQUF1QztBQUFBLEVBWTNFLFlBQ2tCLFlBQ2lCLGdCQUNKLFlBQ00sa0JBQ1EsMEJBQzNDO0FBQ0QsVUFBTTtBQU5XO0FBQ2lCO0FBQ0o7QUFDTTtBQUNRO0FBWjdDLFNBQWlCLGdCQUFnQixvQkFBSSxJQUFvRDtBQUV6RixTQUFRLG9CQUFvQjtBQWMzQixTQUFLLE9BQU8sTUFBTSxvQkFBSSxLQUFLO0FBRTNCLFVBQU0sU0FBUyxLQUFLLFdBQVcsS0FBSyxlQUFlLElBQUksS0FBSyxZQUFZLGFBQWEsV0FBVyxDQUFDO0FBQ2pHLFVBQU0sVUFBVSxPQUFPLFNBQVMsV0FBVyxPQUFPLFNBQVM7QUFDM0QsUUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixXQUFLLG9CQUFv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
