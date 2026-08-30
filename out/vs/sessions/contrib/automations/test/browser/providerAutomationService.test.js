import assert from "assert";
import { Emitter } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { AutomationStore } from "../../browser/automationService.js";
import { ProviderAutomationService } from "../../browser/providerAutomationService.js";
import { AUTOMATION_STORAGE_KEY, IAutomationStorageService, providerAutomationStorageKey } from "../../common/automationStorageService.js";
import { TestAutomationStorageService } from "./automationTestUtils.js";
const FOLDER = URI.parse("file:///workspace");
const PROVIDER_ID = "local-agent-host";
const SESSION_TYPE_ID = "copilotcli";
class FailingStaleRunRecoveryAutomationStore extends AutomationStore {
  async markStaleRunsFailed() {
    throw new Error("Provider unavailable.");
  }
}
class PartiallyFailingMigrationAutomationStore extends AutomationStore {
  async importAutomationSnapshot(snapshot) {
    if (snapshot.automation.id === "automation-1") {
      throw new Error("Import failed.");
    }
    return super.importAutomationSnapshot(snapshot);
  }
}
class FailingTransferAutomationStore extends AutomationStore {
  async upsertAutomationSnapshot() {
    throw new Error("Transfer failed.");
  }
}
class ConcurrentlyMutatingMigrationAutomationStore extends AutomationStore {
  constructor() {
    super(...arguments);
    this.didMutate = false;
    this.updateCount = 0;
  }
  async importAutomationSnapshot(snapshot) {
    const result = await super.importAutomationSnapshot(snapshot);
    if (this.mutation === "continuousUpdate") {
      await this.legacyWriter.updateAutomation(snapshot.automation.id, { name: `Concurrent update ${++this.updateCount}` });
    } else if (!this.didMutate) {
      this.didMutate = true;
      if (this.mutation === "update") {
        await this.legacyWriter.updateAutomation(snapshot.automation.id, { name: "Concurrent update" });
      } else if (this.mutation === "delete") {
        await this.legacyWriter.deleteAutomation(snapshot.automation.id);
      } else {
        await this.legacyWriter.recordRunStart(snapshot.automation.id, "manual", 1);
      }
    }
    return result;
  }
}
class ConcurrentlyMutatingTransferAutomationStore extends AutomationStore {
  constructor() {
    super(...arguments);
    this.didMutate = false;
  }
  async upsertAutomationSnapshot(snapshot) {
    await super.upsertAutomationSnapshot(snapshot);
    if (!this.didMutate) {
      this.didMutate = true;
      await this.legacyWriter.recordRunStart(snapshot.automation.id, "manual", 1);
    }
  }
}
class DestinationDeletingTransferAutomationStore extends AutomationStore {
  constructor() {
    super(...arguments);
    this.didMutate = false;
  }
  async removeAutomationSnapshotIfUnchanged(expected) {
    if (!this.didMutate) {
      this.didMutate = true;
      await this.updateAutomation(expected.automation.id, { name: "Concurrent source update" });
      await this.destinationStore.deleteAutomation(expected.automation.id);
    }
    return super.removeAutomationSnapshotIfUnchanged(expected);
  }
}
suite("ProviderAutomationService", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  function createService(legacyRaw, providerRaw, providerFailure) {
    const storage = teardown.add(new InMemoryStorageService());
    if (legacyRaw) {
      storage.store(AUTOMATION_STORAGE_KEY, legacyRaw, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    if (providerRaw) {
      storage.store(providerAutomationStorageKey(PROVIDER_ID), providerRaw, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    const automationStorage = new TestAutomationStorageService(storage);
    const storageKey = providerAutomationStorageKey(PROVIDER_ID);
    let providerStore;
    switch (providerFailure) {
      case "staleRunRecovery":
        providerStore = new FailingStaleRunRecoveryAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
        break;
      case "migration":
        providerStore = new PartiallyFailingMigrationAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
        break;
      case "transfer":
        providerStore = new FailingTransferAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
        break;
      case "concurrentMigrationUpdate":
      case "concurrentMigrationDelete":
      case "concurrentMigrationRun":
      case "continuousMigrationUpdate": {
        const mutatingStore = new ConcurrentlyMutatingMigrationAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
        mutatingStore.legacyWriter = teardown.add(new AutomationStore(AUTOMATION_STORAGE_KEY, storage, new NullLogService(), NullTelemetryService, automationStorage));
        if (providerFailure === "concurrentMigrationUpdate") {
          mutatingStore.mutation = "update";
        } else if (providerFailure === "concurrentMigrationDelete") {
          mutatingStore.mutation = "delete";
        } else if (providerFailure === "continuousMigrationUpdate") {
          mutatingStore.mutation = "continuousUpdate";
        } else {
          mutatingStore.mutation = "run";
        }
        providerStore = mutatingStore;
        break;
      }
      case "concurrentTransferRun": {
        const mutatingStore = new ConcurrentlyMutatingTransferAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
        mutatingStore.legacyWriter = teardown.add(new AutomationStore(AUTOMATION_STORAGE_KEY, storage, new NullLogService(), NullTelemetryService, automationStorage));
        providerStore = mutatingStore;
        break;
      }
      case "destinationDeleteDuringRollback": {
        const deletingStore = new DestinationDeletingTransferAutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
        deletingStore.destinationStore = teardown.add(new AutomationStore(AUTOMATION_STORAGE_KEY, storage, new NullLogService(), NullTelemetryService, automationStorage));
        providerStore = deletingStore;
        break;
      }
      default:
        providerStore = new AutomationStore(storageKey, storage, new NullLogService(), NullTelemetryService, automationStorage);
    }
    teardown.add(providerStore);
    const provider = upcastPartial({
      id: PROVIDER_ID,
      order: 0,
      automations: providerStore
    });
    const registeredProviders = [provider];
    const providersChanged = teardown.add(new Emitter());
    const providers = upcastPartial({
      onDidChangeProviders: providersChanged.event,
      getProviders: () => [...registeredProviders],
      getProvider: (providerId) => registeredProviders.find((candidate) => candidate.id === providerId)
    });
    const instantiationService = teardown.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IAutomationStorageService, automationStorage);
    instantiationService.stub(ISessionsProvidersService, providers);
    instantiationService.stub(IInstantiationService, instantiationService);
    const service = teardown.add(instantiationService.createInstance(ProviderAutomationService));
    return {
      service,
      providerStore,
      storage,
      automationStorage,
      addProvider: (addedProvider) => {
        registeredProviders.push(addedProvider);
        providersChanged.fire({ added: [addedProvider], removed: [] });
      }
    };
  }
  test("routes new Automations to their provider store", async () => {
    const { service, providerStore, storage } = createService();
    await service.createAutomation({
      name: "Provider owned",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
      modelId: "model",
      mode: "agent",
      permissionLevel: "autopilot"
    });
    assert.deepStrictEqual({
      aggregate: service.automations.get().map((automation) => automation.name),
      provider: providerStore.automations.get().map((automation) => automation.name),
      legacy: storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)
    }, {
      aggregate: ["Provider owned"],
      provider: ["Provider owned"],
      legacy: void 0
    });
  });
  test("transfers Automations and runs when updates change store ownership", async () => {
    const { service, providerStore, storage } = createService();
    const legacyTarget = { kind: "workspace", folderUri: FOLDER, providerId: "provider-without-storage", sessionTypeId: "other", isolation: { kind: "default" } };
    const providerTarget = { kind: "workspace", folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } };
    const created = await service.createAutomation({
      name: "Transferred",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: legacyTarget
    });
    const claim = await service.recordRunStart(created.id, "manual", 1);
    const transferToProvider = await service.updateAutomationIfUnchanged(created.id, { target: providerTarget }, created);
    const afterProviderTransfer = {
      result: transferToProvider.kind,
      providerTarget: providerStore.getAutomation(created.id)?.target,
      providerRunIds: providerStore.runs.get().map((run) => run.id),
      legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)).automations.map((automation) => automation.id)
    };
    await service.updateAutomation(created.id, { target: legacyTarget });
    const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
    assert.deepStrictEqual({
      claimRunId: claim.run.id,
      afterProviderTransfer,
      finalProviderAutomation: providerStore.getAutomation(created.id),
      finalProviderRunIds: providerStore.runs.get().map((run) => run.id),
      finalLegacyTarget: legacyLedger.automations.find((automation) => automation.id === created.id)?.target,
      finalLegacyRunIds: legacyLedger.runs.map((run) => run.id)
    }, {
      claimRunId: claim.run.id,
      afterProviderTransfer: {
        result: "updated",
        providerTarget,
        providerRunIds: [claim.run.id],
        legacyAutomationIds: []
      },
      finalProviderAutomation: void 0,
      finalProviderRunIds: [],
      finalLegacyTarget: {
        kind: "workspace",
        folderUri: FOLDER.toJSON(),
        providerId: "provider-without-storage",
        sessionTypeId: "other",
        isolation: { kind: "default" }
      },
      finalLegacyRunIds: [claim.run.id]
    });
  });
  test("does not transfer an Automation when a guarded update conflicts", async () => {
    const { service, providerStore, storage } = createService();
    const created = await service.createAutomation({
      name: "Provider owned",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } }
    });
    const result = await service.updateAutomationIfUnchanged(created.id, {
      target: { kind: "workspace", folderUri: FOLDER, providerId: "provider-without-storage", sessionTypeId: "other", isolation: { kind: "default" } }
    }, { ...created, name: "Stale" });
    assert.deepStrictEqual({
      result: result.kind,
      providerAutomationId: providerStore.getAutomation(created.id)?.id,
      legacy: storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)
    }, {
      result: "conflict",
      providerAutomationId: created.id,
      legacy: void 0
    });
  });
  test("retains the source Automation when ownership transfer fails", async () => {
    const { service, providerStore, storage } = createService(void 0, void 0, "transfer");
    const created = await service.createAutomation({
      name: "Legacy",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER, providerId: "provider-without-storage", sessionTypeId: "other", isolation: { kind: "default" } }
    });
    await assert.rejects(service.updateAutomation(created.id, {
      target: { kind: "workspace", folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } }
    }), /Transfer failed/);
    const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
    assert.deepStrictEqual({
      providerAutomation: providerStore.getAutomation(created.id),
      legacyAutomationIds: legacyLedger.automations.map((automation) => automation.id)
    }, {
      providerAutomation: void 0,
      legacyAutomationIds: [created.id]
    });
  });
  test("retries ownership transfer when a run is added concurrently", async () => {
    const { service, providerStore, storage } = createService(void 0, void 0, "concurrentTransferRun");
    const created = await service.createAutomation({
      name: "Legacy",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER, providerId: "provider-without-storage", sessionTypeId: "other", isolation: { kind: "default" } }
    });
    await service.updateAutomation(created.id, {
      target: { kind: "workspace", folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } }
    });
    assert.deepStrictEqual({
      providerRunAutomationIds: providerStore.runs.get().map((run) => run.automationId),
      legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)).automations.map((automation) => automation.id)
    }, {
      providerRunAutomationIds: [created.id],
      legacyAutomationIds: []
    });
  });
  test("does not recreate a destination deleted during rollback", async () => {
    const { service, providerStore, storage } = createService(void 0, void 0, "destinationDeleteDuringRollback");
    const created = await service.createAutomation({
      name: "Provider owned",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } }
    });
    await service.updateAutomation(created.id, {
      target: { kind: "workspace", folderUri: FOLDER, providerId: "provider-without-storage", sessionTypeId: "other", isolation: { kind: "default" } }
    });
    const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
    assert.deepStrictEqual({
      sourceName: providerStore.getAutomation(created.id)?.name,
      legacyAutomationIds: legacyLedger.automations.map((automation) => automation.id)
    }, {
      sourceName: "Concurrent source update",
      legacyAutomationIds: []
    });
  });
  test("does not re-run the mutation guard after the source update commits", async () => {
    const { service, providerStore } = createService();
    const created = await service.createAutomation({
      name: "Legacy",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER, providerId: "provider-without-storage", sessionTypeId: "other", isolation: { kind: "default" } }
    });
    let guardCalls = 0;
    const result = await service.updateAutomationIfUnchanged(created.id, {
      target: { kind: "workspace", folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } }
    }, created, () => {
      guardCalls++;
      if (guardCalls > 1) {
        throw new Error("Guard called after commit.");
      }
    });
    assert.deepStrictEqual({
      result: result.kind,
      guardCalls,
      providerAutomationId: providerStore.getAutomation(created.id)?.id
    }, {
      result: "updated",
      guardCalls: 1,
      providerAutomationId: created.id
    });
  });
  test("migrates legacy Automations and runs unchanged into the provider store", async () => {
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name: "Legacy",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        modelId: "model",
        mode: "agent",
        permissionLevel: "autopilot",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: [{
        id: "run-1",
        automationId: "automation-1",
        status: "completed",
        trigger: "manual",
        startedAt: "2026-01-01T00:00:00.000Z",
        leaderWindowId: 1
      }]
    });
    const { service, providerStore, storage } = createService(legacy);
    await service.waitForMigrationForTesting();
    assert.deepStrictEqual({
      automation: providerStore.getAutomation("automation-1"),
      runIds: providerStore.runs.get().map((run) => run.id),
      legacy: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION))
    }, {
      automation: {
        id: "automation-1",
        name: "Legacy",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER, providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        modelId: "model",
        mode: "agent",
        permissionLevel: "autopilot",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastRunAt: void 0,
        nextRunAt: void 0
      },
      runIds: ["run-1"],
      legacy: { schemaVersion: 3, revision: 2, automations: [], runs: [] }
    });
  });
  test("retries migration when the legacy Automation changes during import", async () => {
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name: "Original",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: []
    });
    const { service, providerStore, storage } = createService(legacy, void 0, "concurrentMigrationUpdate");
    await service.waitForMigrationForTesting();
    assert.deepStrictEqual({
      providerName: providerStore.getAutomation("automation-1")?.name,
      legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)).automations.map((automation) => automation.id)
    }, {
      providerName: "Concurrent update",
      legacyAutomationIds: []
    });
  });
  test("rolls back migration when the legacy Automation is deleted during import", async () => {
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name: "Deleted concurrently",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: []
    });
    const { service, providerStore, storage } = createService(legacy, void 0, "concurrentMigrationDelete");
    await service.waitForMigrationForTesting();
    assert.deepStrictEqual({
      providerAutomation: providerStore.getAutomation("automation-1"),
      legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)).automations.map((automation) => automation.id)
    }, {
      providerAutomation: void 0,
      legacyAutomationIds: []
    });
  });
  test("retries migration when a run is added during import", async () => {
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name: "Concurrent run",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: []
    });
    const { service, providerStore, storage } = createService(legacy, void 0, "concurrentMigrationRun");
    await service.waitForMigrationForTesting();
    assert.deepStrictEqual({
      providerRunCount: providerStore.runs.get().length,
      providerRunAutomationIds: providerStore.runs.get().map((run) => run.automationId),
      legacyRunIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)).runs.map((run) => run.id)
    }, {
      providerRunCount: 1,
      providerRunAutomationIds: ["automation-1"],
      legacyRunIds: []
    });
  });
  test("bounds migration retries and leaves a continuously changing source in legacy storage", async () => {
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name: "Original",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: []
    });
    const { service, providerStore, storage } = createService(legacy, void 0, "continuousMigrationUpdate");
    await service.waitForMigrationForTesting();
    const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
    assert.deepStrictEqual({
      providerAutomation: providerStore.getAutomation("automation-1"),
      legacyAutomationIds: legacyLedger.automations.map((automation) => automation.id),
      legacyName: legacyLedger.automations[0]?.name
    }, {
      providerAutomation: void 0,
      legacyAutomationIds: ["automation-1"],
      legacyName: "Concurrent update 3"
    });
  });
  test("deduplicates overlapping provider and legacy entries during migration", () => {
    const ledger = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name: "Shared",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: [{
        id: "run-1",
        automationId: "automation-1",
        status: "completed",
        trigger: "manual",
        startedAt: "2026-01-01T00:00:00.000Z",
        leaderWindowId: 1
      }]
    });
    const { service } = createService(ledger, ledger);
    assert.deepStrictEqual({
      automationIds: service.automations.get().map((automation) => automation.id),
      runIds: service.runs.get().map((run) => run.id)
    }, {
      automationIds: ["automation-1"],
      runIds: ["run-1"]
    });
  });
  test("retains legacy data when the provider Automation payload diverges", async () => {
    const createLedger = (name) => JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name,
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: []
    });
    const { service, providerStore, storage } = createService(createLedger("Legacy"), createLedger("Provider"));
    await service.waitForMigrationForTesting();
    const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
    assert.deepStrictEqual({
      providerName: providerStore.getAutomation("automation-1")?.name,
      legacyNames: legacyLedger.automations.map((automation) => automation.name)
    }, {
      providerName: "Provider",
      legacyNames: ["Legacy"]
    });
  });
  test("retains legacy data when a same-ID run payload diverges", async () => {
    const automation = {
      id: "automation-1",
      name: "Shared",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    const createLedger = (status) => JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [automation],
      runs: [{
        id: "run-1",
        automationId: automation.id,
        status,
        trigger: "manual",
        startedAt: "2026-01-01T00:00:00.000Z",
        leaderWindowId: 1
      }]
    });
    const { service, providerStore, storage } = createService(createLedger("failed"), createLedger("completed"));
    await service.waitForMigrationForTesting();
    const legacyLedger = JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
    assert.deepStrictEqual({
      providerStatuses: providerStore.runs.get().map((run) => run.status),
      legacyStatuses: legacyLedger.runs.map((run) => run.status)
    }, {
      providerStatuses: ["completed"],
      legacyStatuses: ["failed"]
    });
  });
  test("retains legacy data when provider run history diverges", async () => {
    const automation = {
      id: "automation-1",
      name: "Shared",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [automation],
      runs: [{
        id: "legacy-run",
        automationId: automation.id,
        status: "completed",
        trigger: "manual",
        startedAt: "2026-01-02T00:00:00.000Z",
        leaderWindowId: 1
      }]
    });
    const provider = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [automation],
      runs: [{
        id: "provider-run",
        automationId: automation.id,
        status: "completed",
        trigger: "manual",
        startedAt: "2026-01-01T00:00:00.000Z",
        leaderWindowId: 1
      }]
    });
    const { service, providerStore, storage } = createService(legacy, provider);
    await service.waitForMigrationForTesting();
    assert.deepStrictEqual({
      providerRunIds: providerStore.runs.get().map((run) => run.id),
      legacy: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION))
    }, {
      providerRunIds: ["provider-run"],
      legacy: {
        schemaVersion: 3,
        revision: 1,
        automations: [automation],
        runs: [{
          id: "legacy-run",
          automationId: automation.id,
          status: "completed",
          trigger: "manual",
          startedAt: "2026-01-02T00:00:00.000Z",
          leaderWindowId: 1
        }]
      }
    });
  });
  test("recovers active runs after migration completes", async () => {
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name: "Legacy",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: [{
        id: "run-1",
        automationId: "automation-1",
        status: "running",
        trigger: "manual",
        startedAt: "2026-01-01T00:00:00.000Z",
        leaderWindowId: 1
      }]
    });
    const { service, providerStore } = createService(legacy);
    await service.markStaleRunsFailed("Recovered after restart.");
    assert.deepStrictEqual(providerStore.runs.get().map((run) => ({
      id: run.id,
      status: run.status,
      errorMessage: run.errorMessage
    })), [{
      id: "run-1",
      status: "failed",
      errorMessage: "Recovered after restart."
    }]);
  });
  test("recovers stale runs for providers added only while leader-scoped recovery is active", async () => {
    const { service, storage, automationStorage, addProvider } = createService();
    await service.startStaleRunRecovery("Recovered after restart.");
    const activeProviderId = "late-active-provider";
    const activeStore = teardown.add(new AutomationStore(providerAutomationStorageKey(activeProviderId), storage, new NullLogService(), NullTelemetryService, automationStorage));
    const activeAutomation = await activeStore.createAutomation({
      name: "Active recovery",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER, providerId: activeProviderId, sessionTypeId: "late", isolation: { kind: "default" } }
    });
    await activeStore.recordRunStart(activeAutomation.id, "manual", 1);
    addProvider(upcastPartial({ id: activeProviderId, order: 1, automations: activeStore }));
    await service.waitForMigrationForTesting();
    service.stopStaleRunRecovery();
    const inactiveProviderId = "late-inactive-provider";
    const inactiveStore = teardown.add(new AutomationStore(providerAutomationStorageKey(inactiveProviderId), storage, new NullLogService(), NullTelemetryService, automationStorage));
    const inactiveAutomation = await inactiveStore.createAutomation({
      name: "Inactive recovery",
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER, providerId: inactiveProviderId, sessionTypeId: "late", isolation: { kind: "default" } }
    });
    await inactiveStore.recordRunStart(inactiveAutomation.id, "manual", 1);
    addProvider(upcastPartial({ id: inactiveProviderId, order: 2, automations: inactiveStore }));
    await service.waitForMigrationForTesting();
    assert.deepStrictEqual({
      activeStatuses: activeStore.runs.get().map((run) => run.status),
      inactiveStatuses: inactiveStore.runs.get().map((run) => run.status)
    }, {
      activeStatuses: ["failed"],
      inactiveStatuses: ["pending"]
    });
  });
  test("migrates before recovering a provider added while initial recovery is queued", async () => {
    const lateProviderId = "late-provider";
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name: "Late provider",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: lateProviderId, sessionTypeId: "late", isolation: { kind: "default" } },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: [{
        id: "run-1",
        automationId: "automation-1",
        status: "running",
        trigger: "manual",
        startedAt: "2026-01-01T00:00:00.000Z",
        leaderWindowId: 1
      }]
    });
    const { service, storage, automationStorage, addProvider } = createService(legacy);
    const recovery = service.startStaleRunRecovery("Recovered after restart.");
    const lateStore = teardown.add(new AutomationStore(providerAutomationStorageKey(lateProviderId), storage, new NullLogService(), NullTelemetryService, automationStorage));
    addProvider(upcastPartial({ id: lateProviderId, order: 1, automations: lateStore }));
    await recovery;
    await service.waitForMigrationForTesting();
    assert.deepStrictEqual(lateStore.runs.get().map((run) => ({
      id: run.id,
      status: run.status,
      errorMessage: run.errorMessage
    })), [{
      id: "run-1",
      status: "failed",
      errorMessage: "Recovered after restart."
    }]);
  });
  test("continues stale-run recovery when a provider store fails", async () => {
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [{
        id: "automation-1",
        name: "Legacy",
        prompt: "prompt",
        schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
        target: { kind: "workspace", folderUri: FOLDER.toJSON(), sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      runs: [{
        id: "run-1",
        automationId: "automation-1",
        status: "running",
        trigger: "manual",
        startedAt: "2026-01-01T00:00:00.000Z",
        leaderWindowId: 1
      }]
    });
    const { service } = createService(legacy, void 0, "staleRunRecovery");
    await service.markStaleRunsFailed("Recovered after restart.");
    assert.deepStrictEqual(service.runs.get().map((run) => ({
      id: run.id,
      status: run.status,
      errorMessage: run.errorMessage
    })), [{
      id: "run-1",
      status: "failed",
      errorMessage: "Recovered after restart."
    }]);
  });
  test("continues migrating after an Automation import fails", async () => {
    const createAutomation = (id) => ({
      id,
      name: id,
      prompt: "prompt",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "workspace", folderUri: FOLDER.toJSON(), providerId: PROVIDER_ID, sessionTypeId: SESSION_TYPE_ID, isolation: { kind: "default" } },
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });
    const legacy = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [createAutomation("automation-1"), createAutomation("automation-2")],
      runs: []
    });
    const { service, providerStore, storage } = createService(legacy, void 0, "migration");
    await service.waitForMigrationForTesting();
    assert.deepStrictEqual({
      providerAutomationIds: providerStore.automations.get().map((automation) => automation.id),
      legacyAutomationIds: JSON.parse(storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION)).automations.map((automation) => automation.id)
    }, {
      providerAutomationIds: ["automation-2"],
      legacyAutomationIds: ["automation-1"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXHRlc3RcXGJyb3dzZXJcXHByb3ZpZGVyQXV0b21hdGlvblNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb24sIElBdXRvbWF0aW9uU25hcHNob3RJbXBvcnRSZXN1bHQsIElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvblN0b3JlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm92aWRlckF1dG9tYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wcm92aWRlckF1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFVVE9NQVRJT05fU1RPUkFHRV9LRVksIElBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UsIHByb3ZpZGVyQXV0b21hdGlvblN0b3JhZ2VLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuL2F1dG9tYXRpb25UZXN0VXRpbHMuanMnO1xuXG5jb25zdCBGT0xERVIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlJyk7XG5jb25zdCBQUk9WSURFUl9JRCA9ICdsb2NhbC1hZ2VudC1ob3N0JztcbmNvbnN0IFNFU1NJT05fVFlQRV9JRCA9ICdjb3BpbG90Y2xpJztcblxuY2xhc3MgRmFpbGluZ1N0YWxlUnVuUmVjb3ZlcnlBdXRvbWF0aW9uU3RvcmUgZXh0ZW5kcyBBdXRvbWF0aW9uU3RvcmUge1xuXHRvdmVycmlkZSBhc3luYyBtYXJrU3RhbGVSdW5zRmFpbGVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignUHJvdmlkZXIgdW5hdmFpbGFibGUuJyk7XG5cdH1cbn1cblxuY2xhc3MgUGFydGlhbGx5RmFpbGluZ01pZ3JhdGlvbkF1dG9tYXRpb25TdG9yZSBleHRlbmRzIEF1dG9tYXRpb25TdG9yZSB7XG5cdG92ZXJyaWRlIGFzeW5jIGltcG9ydEF1dG9tYXRpb25TbmFwc2hvdChzbmFwc2hvdDogSUF1dG9tYXRpb24pOiBQcm9taXNlPElBdXRvbWF0aW9uU25hcHNob3RJbXBvcnRSZXN1bHQ+IHtcblx0XHRpZiAoc25hcHNob3QuYXV0b21hdGlvbi5pZCA9PT0gJ2F1dG9tYXRpb24tMScpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW1wb3J0IGZhaWxlZC4nKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmltcG9ydEF1dG9tYXRpb25TbmFwc2hvdChzbmFwc2hvdCk7XG5cdH1cbn1cblxuY2xhc3MgRmFpbGluZ1RyYW5zZmVyQXV0b21hdGlvblN0b3JlIGV4dGVuZHMgQXV0b21hdGlvblN0b3JlIHtcblx0b3ZlcnJpZGUgYXN5bmMgdXBzZXJ0QXV0b21hdGlvblNuYXBzaG90KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignVHJhbnNmZXIgZmFpbGVkLicpO1xuXHR9XG59XG5cbmNsYXNzIENvbmN1cnJlbnRseU11dGF0aW5nTWlncmF0aW9uQXV0b21hdGlvblN0b3JlIGV4dGVuZHMgQXV0b21hdGlvblN0b3JlIHtcblx0bGVnYWN5V3JpdGVyITogQXV0b21hdGlvblN0b3JlO1xuXHRtdXRhdGlvbiE6ICd1cGRhdGUnIHwgJ2RlbGV0ZScgfCAncnVuJyB8ICdjb250aW51b3VzVXBkYXRlJztcblx0cHJpdmF0ZSBkaWRNdXRhdGUgPSBmYWxzZTtcblx0cHJpdmF0ZSB1cGRhdGVDb3VudCA9IDA7XG5cblx0b3ZlcnJpZGUgYXN5bmMgaW1wb3J0QXV0b21hdGlvblNuYXBzaG90KHNuYXBzaG90OiBJQXV0b21hdGlvbik6IFByb21pc2U8SUF1dG9tYXRpb25TbmFwc2hvdEltcG9ydFJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN1cGVyLmltcG9ydEF1dG9tYXRpb25TbmFwc2hvdChzbmFwc2hvdCk7XG5cdFx0aWYgKHRoaXMubXV0YXRpb24gPT09ICdjb250aW51b3VzVXBkYXRlJykge1xuXHRcdFx0YXdhaXQgdGhpcy5sZWdhY3lXcml0ZXIudXBkYXRlQXV0b21hdGlvbihzbmFwc2hvdC5hdXRvbWF0aW9uLmlkLCB7IG5hbWU6IGBDb25jdXJyZW50IHVwZGF0ZSAkeysrdGhpcy51cGRhdGVDb3VudH1gIH0pO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuZGlkTXV0YXRlKSB7XG5cdFx0XHR0aGlzLmRpZE11dGF0ZSA9IHRydWU7XG5cdFx0XHRpZiAodGhpcy5tdXRhdGlvbiA9PT0gJ3VwZGF0ZScpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5sZWdhY3lXcml0ZXIudXBkYXRlQXV0b21hdGlvbihzbmFwc2hvdC5hdXRvbWF0aW9uLmlkLCB7IG5hbWU6ICdDb25jdXJyZW50IHVwZGF0ZScgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMubXV0YXRpb24gPT09ICdkZWxldGUnKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubGVnYWN5V3JpdGVyLmRlbGV0ZUF1dG9tYXRpb24oc25hcHNob3QuYXV0b21hdGlvbi5pZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmxlZ2FjeVdyaXRlci5yZWNvcmRSdW5TdGFydChzbmFwc2hvdC5hdXRvbWF0aW9uLmlkLCAnbWFudWFsJywgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgQ29uY3VycmVudGx5TXV0YXRpbmdUcmFuc2ZlckF1dG9tYXRpb25TdG9yZSBleHRlbmRzIEF1dG9tYXRpb25TdG9yZSB7XG5cdGxlZ2FjeVdyaXRlciE6IEF1dG9tYXRpb25TdG9yZTtcblx0cHJpdmF0ZSBkaWRNdXRhdGUgPSBmYWxzZTtcblxuXHRvdmVycmlkZSBhc3luYyB1cHNlcnRBdXRvbWF0aW9uU25hcHNob3Qoc25hcHNob3Q6IElBdXRvbWF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIudXBzZXJ0QXV0b21hdGlvblNuYXBzaG90KHNuYXBzaG90KTtcblx0XHRpZiAoIXRoaXMuZGlkTXV0YXRlKSB7XG5cdFx0XHR0aGlzLmRpZE11dGF0ZSA9IHRydWU7XG5cdFx0XHRhd2FpdCB0aGlzLmxlZ2FjeVdyaXRlci5yZWNvcmRSdW5TdGFydChzbmFwc2hvdC5hdXRvbWF0aW9uLmlkLCAnbWFudWFsJywgMSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIERlc3RpbmF0aW9uRGVsZXRpbmdUcmFuc2ZlckF1dG9tYXRpb25TdG9yZSBleHRlbmRzIEF1dG9tYXRpb25TdG9yZSB7XG5cdGRlc3RpbmF0aW9uU3RvcmUhOiBBdXRvbWF0aW9uU3RvcmU7XG5cdHByaXZhdGUgZGlkTXV0YXRlID0gZmFsc2U7XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVtb3ZlQXV0b21hdGlvblNuYXBzaG90SWZVbmNoYW5nZWQoZXhwZWN0ZWQ6IElBdXRvbWF0aW9uKSB7XG5cdFx0aWYgKCF0aGlzLmRpZE11dGF0ZSkge1xuXHRcdFx0dGhpcy5kaWRNdXRhdGUgPSB0cnVlO1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVBdXRvbWF0aW9uKGV4cGVjdGVkLmF1dG9tYXRpb24uaWQsIHsgbmFtZTogJ0NvbmN1cnJlbnQgc291cmNlIHVwZGF0ZScgfSk7XG5cdFx0XHRhd2FpdCB0aGlzLmRlc3RpbmF0aW9uU3RvcmUuZGVsZXRlQXV0b21hdGlvbihleHBlY3RlZC5hdXRvbWF0aW9uLmlkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLnJlbW92ZUF1dG9tYXRpb25TbmFwc2hvdElmVW5jaGFuZ2VkKGV4cGVjdGVkKTtcblx0fVxufVxuXG5zdWl0ZSgnUHJvdmlkZXJBdXRvbWF0aW9uU2VydmljZScsICgpID0+IHtcblx0Y29uc3QgdGVhcmRvd24gPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKGxlZ2FjeVJhdz86IHN0cmluZywgcHJvdmlkZXJSYXc/OiBzdHJpbmcsIHByb3ZpZGVyRmFpbHVyZT86ICdzdGFsZVJ1blJlY292ZXJ5JyB8ICdtaWdyYXRpb24nIHwgJ3RyYW5zZmVyJyB8ICdjb25jdXJyZW50TWlncmF0aW9uVXBkYXRlJyB8ICdjb25jdXJyZW50TWlncmF0aW9uRGVsZXRlJyB8ICdjb25jdXJyZW50TWlncmF0aW9uUnVuJyB8ICdjb250aW51b3VzTWlncmF0aW9uVXBkYXRlJyB8ICdjb25jdXJyZW50VHJhbnNmZXJSdW4nIHwgJ2Rlc3RpbmF0aW9uRGVsZXRlRHVyaW5nUm9sbGJhY2snKToge1xuXHRcdHJlYWRvbmx5IHNlcnZpY2U6IFByb3ZpZGVyQXV0b21hdGlvblNlcnZpY2U7XG5cdFx0cmVhZG9ubHkgcHJvdmlkZXJTdG9yZTogQXV0b21hdGlvblN0b3JlO1xuXHRcdHJlYWRvbmx5IHN0b3JhZ2U6IEluTWVtb3J5U3RvcmFnZVNlcnZpY2U7XG5cdFx0cmVhZG9ubHkgYXV0b21hdGlvblN0b3JhZ2U6IFRlc3RBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2U7XG5cdFx0cmVhZG9ubHkgYWRkUHJvdmlkZXI6IChwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIpID0+IHZvaWQ7XG5cdH0ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0aWYgKGxlZ2FjeVJhdykge1xuXHRcdFx0c3RvcmFnZS5zdG9yZShBVVRPTUFUSU9OX1NUT1JBR0VfS0VZLCBsZWdhY3lSYXcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdFx0aWYgKHByb3ZpZGVyUmF3KSB7XG5cdFx0XHRzdG9yYWdlLnN0b3JlKHByb3ZpZGVyQXV0b21hdGlvblN0b3JhZ2VLZXkoUFJPVklERVJfSUQpLCBwcm92aWRlclJhdywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHRjb25zdCBhdXRvbWF0aW9uU3RvcmFnZSA9IG5ldyBUZXN0QXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlKHN0b3JhZ2UpO1xuXHRcdGNvbnN0IHN0b3JhZ2VLZXkgPSBwcm92aWRlckF1dG9tYXRpb25TdG9yYWdlS2V5KFBST1ZJREVSX0lEKTtcblx0XHRsZXQgcHJvdmlkZXJTdG9yZTogQXV0b21hdGlvblN0b3JlO1xuXHRcdHN3aXRjaCAocHJvdmlkZXJGYWlsdXJlKSB7XG5cdFx0XHRjYXNlICdzdGFsZVJ1blJlY292ZXJ5Jzpcblx0XHRcdFx0cHJvdmlkZXJTdG9yZSA9IG5ldyBGYWlsaW5nU3RhbGVSdW5SZWNvdmVyeUF1dG9tYXRpb25TdG9yZShzdG9yYWdlS2V5LCBzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGF1dG9tYXRpb25TdG9yYWdlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdtaWdyYXRpb24nOlxuXHRcdFx0XHRwcm92aWRlclN0b3JlID0gbmV3IFBhcnRpYWxseUZhaWxpbmdNaWdyYXRpb25BdXRvbWF0aW9uU3RvcmUoc3RvcmFnZUtleSwgc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBhdXRvbWF0aW9uU3RvcmFnZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAndHJhbnNmZXInOlxuXHRcdFx0XHRwcm92aWRlclN0b3JlID0gbmV3IEZhaWxpbmdUcmFuc2ZlckF1dG9tYXRpb25TdG9yZShzdG9yYWdlS2V5LCBzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGF1dG9tYXRpb25TdG9yYWdlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdjb25jdXJyZW50TWlncmF0aW9uVXBkYXRlJzpcblx0XHRcdGNhc2UgJ2NvbmN1cnJlbnRNaWdyYXRpb25EZWxldGUnOlxuXHRcdFx0Y2FzZSAnY29uY3VycmVudE1pZ3JhdGlvblJ1bic6XG5cdFx0XHRjYXNlICdjb250aW51b3VzTWlncmF0aW9uVXBkYXRlJzoge1xuXHRcdFx0XHRjb25zdCBtdXRhdGluZ1N0b3JlID0gbmV3IENvbmN1cnJlbnRseU11dGF0aW5nTWlncmF0aW9uQXV0b21hdGlvblN0b3JlKHN0b3JhZ2VLZXksIHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgYXV0b21hdGlvblN0b3JhZ2UpO1xuXHRcdFx0XHRtdXRhdGluZ1N0b3JlLmxlZ2FjeVdyaXRlciA9IHRlYXJkb3duLmFkZChuZXcgQXV0b21hdGlvblN0b3JlKEFVVE9NQVRJT05fU1RPUkFHRV9LRVksIHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgYXV0b21hdGlvblN0b3JhZ2UpKTtcblx0XHRcdFx0aWYgKHByb3ZpZGVyRmFpbHVyZSA9PT0gJ2NvbmN1cnJlbnRNaWdyYXRpb25VcGRhdGUnKSB7XG5cdFx0XHRcdFx0bXV0YXRpbmdTdG9yZS5tdXRhdGlvbiA9ICd1cGRhdGUnO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByb3ZpZGVyRmFpbHVyZSA9PT0gJ2NvbmN1cnJlbnRNaWdyYXRpb25EZWxldGUnKSB7XG5cdFx0XHRcdFx0bXV0YXRpbmdTdG9yZS5tdXRhdGlvbiA9ICdkZWxldGUnO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByb3ZpZGVyRmFpbHVyZSA9PT0gJ2NvbnRpbnVvdXNNaWdyYXRpb25VcGRhdGUnKSB7XG5cdFx0XHRcdFx0bXV0YXRpbmdTdG9yZS5tdXRhdGlvbiA9ICdjb250aW51b3VzVXBkYXRlJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtdXRhdGluZ1N0b3JlLm11dGF0aW9uID0gJ3J1bic7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJvdmlkZXJTdG9yZSA9IG11dGF0aW5nU3RvcmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnY29uY3VycmVudFRyYW5zZmVyUnVuJzoge1xuXHRcdFx0XHRjb25zdCBtdXRhdGluZ1N0b3JlID0gbmV3IENvbmN1cnJlbnRseU11dGF0aW5nVHJhbnNmZXJBdXRvbWF0aW9uU3RvcmUoc3RvcmFnZUtleSwgc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBhdXRvbWF0aW9uU3RvcmFnZSk7XG5cdFx0XHRcdG11dGF0aW5nU3RvcmUubGVnYWN5V3JpdGVyID0gdGVhcmRvd24uYWRkKG5ldyBBdXRvbWF0aW9uU3RvcmUoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBhdXRvbWF0aW9uU3RvcmFnZSkpO1xuXHRcdFx0XHRwcm92aWRlclN0b3JlID0gbXV0YXRpbmdTdG9yZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdkZXN0aW5hdGlvbkRlbGV0ZUR1cmluZ1JvbGxiYWNrJzoge1xuXHRcdFx0XHRjb25zdCBkZWxldGluZ1N0b3JlID0gbmV3IERlc3RpbmF0aW9uRGVsZXRpbmdUcmFuc2ZlckF1dG9tYXRpb25TdG9yZShzdG9yYWdlS2V5LCBzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGF1dG9tYXRpb25TdG9yYWdlKTtcblx0XHRcdFx0ZGVsZXRpbmdTdG9yZS5kZXN0aW5hdGlvblN0b3JlID0gdGVhcmRvd24uYWRkKG5ldyBBdXRvbWF0aW9uU3RvcmUoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBhdXRvbWF0aW9uU3RvcmFnZSkpO1xuXHRcdFx0XHRwcm92aWRlclN0b3JlID0gZGVsZXRpbmdTdG9yZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRwcm92aWRlclN0b3JlID0gbmV3IEF1dG9tYXRpb25TdG9yZShzdG9yYWdlS2V5LCBzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGF1dG9tYXRpb25TdG9yYWdlKTtcblx0XHR9XG5cdFx0dGVhcmRvd24uYWRkKHByb3ZpZGVyU3RvcmUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdXBjYXN0UGFydGlhbDxJU2Vzc2lvbnNQcm92aWRlcj4oe1xuXHRcdFx0aWQ6IFBST1ZJREVSX0lELFxuXHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRhdXRvbWF0aW9uczogcHJvdmlkZXJTdG9yZSxcblx0XHR9KTtcblx0XHRjb25zdCByZWdpc3RlcmVkUHJvdmlkZXJzOiBJU2Vzc2lvbnNQcm92aWRlcltdID0gW3Byb3ZpZGVyXTtcblx0XHRjb25zdCBwcm92aWRlcnNDaGFuZ2VkID0gdGVhcmRvd24uYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50PigpKTtcblx0XHRjb25zdCBwcm92aWRlcnMgPSB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U+KHtcblx0XHRcdG9uRGlkQ2hhbmdlUHJvdmlkZXJzOiBwcm92aWRlcnNDaGFuZ2VkLmV2ZW50LFxuXHRcdFx0Z2V0UHJvdmlkZXJzOiAoKSA9PiBbLi4ucmVnaXN0ZXJlZFByb3ZpZGVyc10sXG5cdFx0XHRnZXRQcm92aWRlcjogPFQgZXh0ZW5kcyBJU2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZDogc3RyaW5nKSA9PiByZWdpc3RlcmVkUHJvdmlkZXJzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gcHJvdmlkZXJJZCkgYXMgVCB8IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlYXJkb3duLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSwgYXV0b21hdGlvblN0b3JhZ2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgcHJvdmlkZXJzKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElJbnN0YW50aWF0aW9uU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvdmlkZXJBdXRvbWF0aW9uU2VydmljZSkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXJ2aWNlLFxuXHRcdFx0cHJvdmlkZXJTdG9yZSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRhdXRvbWF0aW9uU3RvcmFnZSxcblx0XHRcdGFkZFByb3ZpZGVyOiBhZGRlZFByb3ZpZGVyID0+IHtcblx0XHRcdFx0cmVnaXN0ZXJlZFByb3ZpZGVycy5wdXNoKGFkZGVkUHJvdmlkZXIpO1xuXHRcdFx0XHRwcm92aWRlcnNDaGFuZ2VkLmZpcmUoeyBhZGRlZDogW2FkZGVkUHJvdmlkZXJdLCByZW1vdmVkOiBbXSB9KTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ3JvdXRlcyBuZXcgQXV0b21hdGlvbnMgdG8gdGhlaXIgcHJvdmlkZXIgc3RvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBwcm92aWRlclN0b3JlLCBzdG9yYWdlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdQcm92aWRlciBvd25lZCcsXG5cdFx0XHRwcm9tcHQ6ICdwcm9tcHQnLFxuXHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUiwgcHJvdmlkZXJJZDogUFJPVklERVJfSUQsIHNlc3Npb25UeXBlSWQ6IFNFU1NJT05fVFlQRV9JRCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0bW9kZTogJ2FnZW50Jyxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogJ2F1dG9waWxvdCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFnZ3JlZ2F0ZTogc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKS5tYXAoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0cHJvdmlkZXI6IHByb3ZpZGVyU3RvcmUuYXV0b21hdGlvbnMuZ2V0KCkubWFwKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5uYW1lKSxcblx0XHRcdGxlZ2FjeTogc3RvcmFnZS5nZXQoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSxcblx0XHR9LCB7XG5cdFx0XHRhZ2dyZWdhdGU6IFsnUHJvdmlkZXIgb3duZWQnXSxcblx0XHRcdHByb3ZpZGVyOiBbJ1Byb3ZpZGVyIG93bmVkJ10sXG5cdFx0XHRsZWdhY3k6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJhbnNmZXJzIEF1dG9tYXRpb25zIGFuZCBydW5zIHdoZW4gdXBkYXRlcyBjaGFuZ2Ugc3RvcmUgb3duZXJzaGlwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgcHJvdmlkZXJTdG9yZSwgc3RvcmFnZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGxlZ2FjeVRhcmdldCA9IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLCBwcm92aWRlcklkOiAncHJvdmlkZXItd2l0aG91dC1zdG9yYWdlJywgc2Vzc2lvblR5cGVJZDogJ290aGVyJywgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0gYXMgY29uc3Q7XG5cdFx0Y29uc3QgcHJvdmlkZXJUYXJnZXQgPSB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUiwgcHJvdmlkZXJJZDogUFJPVklERVJfSUQsIHNlc3Npb25UeXBlSWQ6IFNFU1NJT05fVFlQRV9JRCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0gYXMgY29uc3Q7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnVHJhbnNmZXJyZWQnLFxuXHRcdFx0cHJvbXB0OiAncHJvbXB0Jyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdHRhcmdldDogbGVnYWN5VGFyZ2V0LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNsYWltID0gYXdhaXQgc2VydmljZS5yZWNvcmRSdW5TdGFydChjcmVhdGVkLmlkLCAnbWFudWFsJywgMSk7XG5cblx0XHRjb25zdCB0cmFuc2ZlclRvUHJvdmlkZXIgPSBhd2FpdCBzZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb25JZlVuY2hhbmdlZChjcmVhdGVkLmlkLCB7IHRhcmdldDogcHJvdmlkZXJUYXJnZXQgfSwgY3JlYXRlZCk7XG5cdFx0Y29uc3QgYWZ0ZXJQcm92aWRlclRyYW5zZmVyID0ge1xuXHRcdFx0cmVzdWx0OiB0cmFuc2ZlclRvUHJvdmlkZXIua2luZCxcblx0XHRcdHByb3ZpZGVyVGFyZ2V0OiBwcm92aWRlclN0b3JlLmdldEF1dG9tYXRpb24oY3JlYXRlZC5pZCk/LnRhcmdldCxcblx0XHRcdHByb3ZpZGVyUnVuSWRzOiBwcm92aWRlclN0b3JlLnJ1bnMuZ2V0KCkubWFwKHJ1biA9PiBydW4uaWQpLFxuXHRcdFx0bGVnYWN5QXV0b21hdGlvbklkczogSlNPTi5wYXJzZShzdG9yYWdlLmdldChBVVRPTUFUSU9OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pISkuYXV0b21hdGlvbnMubWFwKChhdXRvbWF0aW9uOiB7IGlkOiBzdHJpbmcgfSkgPT4gYXV0b21hdGlvbi5pZCksXG5cdFx0fTtcblxuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihjcmVhdGVkLmlkLCB7IHRhcmdldDogbGVnYWN5VGFyZ2V0IH0pO1xuXHRcdGNvbnN0IGxlZ2FjeUxlZGdlciA9IEpTT04ucGFyc2Uoc3RvcmFnZS5nZXQoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjbGFpbVJ1bklkOiBjbGFpbS5ydW4uaWQsXG5cdFx0XHRhZnRlclByb3ZpZGVyVHJhbnNmZXIsXG5cdFx0XHRmaW5hbFByb3ZpZGVyQXV0b21hdGlvbjogcHJvdmlkZXJTdG9yZS5nZXRBdXRvbWF0aW9uKGNyZWF0ZWQuaWQpLFxuXHRcdFx0ZmluYWxQcm92aWRlclJ1bklkczogcHJvdmlkZXJTdG9yZS5ydW5zLmdldCgpLm1hcChydW4gPT4gcnVuLmlkKSxcblx0XHRcdGZpbmFsTGVnYWN5VGFyZ2V0OiBsZWdhY3lMZWRnZXIuYXV0b21hdGlvbnMuZmluZCgoYXV0b21hdGlvbjogeyBpZDogc3RyaW5nIH0pID0+IGF1dG9tYXRpb24uaWQgPT09IGNyZWF0ZWQuaWQpPy50YXJnZXQsXG5cdFx0XHRmaW5hbExlZ2FjeVJ1bklkczogbGVnYWN5TGVkZ2VyLnJ1bnMubWFwKChydW46IHsgaWQ6IHN0cmluZyB9KSA9PiBydW4uaWQpLFxuXHRcdH0sIHtcblx0XHRcdGNsYWltUnVuSWQ6IGNsYWltLnJ1bi5pZCxcblx0XHRcdGFmdGVyUHJvdmlkZXJUcmFuc2Zlcjoge1xuXHRcdFx0XHRyZXN1bHQ6ICd1cGRhdGVkJyxcblx0XHRcdFx0cHJvdmlkZXJUYXJnZXQsXG5cdFx0XHRcdHByb3ZpZGVyUnVuSWRzOiBbY2xhaW0ucnVuLmlkXSxcblx0XHRcdFx0bGVnYWN5QXV0b21hdGlvbklkczogW10sXG5cdFx0XHR9LFxuXHRcdFx0ZmluYWxQcm92aWRlckF1dG9tYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGZpbmFsUHJvdmlkZXJSdW5JZHM6IFtdLFxuXHRcdFx0ZmluYWxMZWdhY3lUYXJnZXQ6IHtcblx0XHRcdFx0a2luZDogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLFxuXHRcdFx0XHRwcm92aWRlcklkOiAncHJvdmlkZXItd2l0aG91dC1zdG9yYWdlJyxcblx0XHRcdFx0c2Vzc2lvblR5cGVJZDogJ290aGVyJyxcblx0XHRcdFx0aXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9LFxuXHRcdFx0fSxcblx0XHRcdGZpbmFsTGVnYWN5UnVuSWRzOiBbY2xhaW0ucnVuLmlkXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgdHJhbnNmZXIgYW4gQXV0b21hdGlvbiB3aGVuIGEgZ3VhcmRlZCB1cGRhdGUgY29uZmxpY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgcHJvdmlkZXJTdG9yZSwgc3RvcmFnZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ1Byb3ZpZGVyIG93bmVkJyxcblx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLCBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvblR5cGVJZDogU0VTU0lPTl9UWVBFX0lELCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbklmVW5jaGFuZ2VkKGNyZWF0ZWQuaWQsIHtcblx0XHRcdHRhcmdldDogeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBGT0xERVIsIHByb3ZpZGVySWQ6ICdwcm92aWRlci13aXRob3V0LXN0b3JhZ2UnLCBzZXNzaW9uVHlwZUlkOiAnb3RoZXInLCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHR9LCB7IC4uLmNyZWF0ZWQsIG5hbWU6ICdTdGFsZScgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdDogcmVzdWx0LmtpbmQsXG5cdFx0XHRwcm92aWRlckF1dG9tYXRpb25JZDogcHJvdmlkZXJTdG9yZS5nZXRBdXRvbWF0aW9uKGNyZWF0ZWQuaWQpPy5pZCxcblx0XHRcdGxlZ2FjeTogc3RvcmFnZS5nZXQoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6ICdjb25mbGljdCcsXG5cdFx0XHRwcm92aWRlckF1dG9tYXRpb25JZDogY3JlYXRlZC5pZCxcblx0XHRcdGxlZ2FjeTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRhaW5zIHRoZSBzb3VyY2UgQXV0b21hdGlvbiB3aGVuIG93bmVyc2hpcCB0cmFuc2ZlciBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHByb3ZpZGVyU3RvcmUsIHN0b3JhZ2UgfSA9IGNyZWF0ZVNlcnZpY2UodW5kZWZpbmVkLCB1bmRlZmluZWQsICd0cmFuc2ZlcicpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0xlZ2FjeScsXG5cdFx0XHRwcm9tcHQ6ICdwcm9tcHQnLFxuXHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUiwgcHJvdmlkZXJJZDogJ3Byb3ZpZGVyLXdpdGhvdXQtc3RvcmFnZScsIHNlc3Npb25UeXBlSWQ6ICdvdGhlcicsIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoc2VydmljZS51cGRhdGVBdXRvbWF0aW9uKGNyZWF0ZWQuaWQsIHtcblx0XHRcdHRhcmdldDogeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBGT0xERVIsIHByb3ZpZGVySWQ6IFBST1ZJREVSX0lELCBzZXNzaW9uVHlwZUlkOiBTRVNTSU9OX1RZUEVfSUQsIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9LFxuXHRcdH0pLCAvVHJhbnNmZXIgZmFpbGVkLyk7XG5cdFx0Y29uc3QgbGVnYWN5TGVkZ2VyID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldChBVVRPTUFUSU9OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pISk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3ZpZGVyQXV0b21hdGlvbjogcHJvdmlkZXJTdG9yZS5nZXRBdXRvbWF0aW9uKGNyZWF0ZWQuaWQpLFxuXHRcdFx0bGVnYWN5QXV0b21hdGlvbklkczogbGVnYWN5TGVkZ2VyLmF1dG9tYXRpb25zLm1hcCgoYXV0b21hdGlvbjogeyBpZDogc3RyaW5nIH0pID0+IGF1dG9tYXRpb24uaWQpLFxuXHRcdH0sIHtcblx0XHRcdHByb3ZpZGVyQXV0b21hdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0bGVnYWN5QXV0b21hdGlvbklkczogW2NyZWF0ZWQuaWRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRyaWVzIG93bmVyc2hpcCB0cmFuc2ZlciB3aGVuIGEgcnVuIGlzIGFkZGVkIGNvbmN1cnJlbnRseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHByb3ZpZGVyU3RvcmUsIHN0b3JhZ2UgfSA9IGNyZWF0ZVNlcnZpY2UodW5kZWZpbmVkLCB1bmRlZmluZWQsICdjb25jdXJyZW50VHJhbnNmZXJSdW4nKTtcblx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdMZWdhY3knLFxuXHRcdFx0cHJvbXB0OiAncHJvbXB0Jyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdHRhcmdldDogeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBGT0xERVIsIHByb3ZpZGVySWQ6ICdwcm92aWRlci13aXRob3V0LXN0b3JhZ2UnLCBzZXNzaW9uVHlwZUlkOiAnb3RoZXInLCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihjcmVhdGVkLmlkLCB7XG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLCBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvblR5cGVJZDogU0VTU0lPTl9UWVBFX0lELCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXJSdW5BdXRvbWF0aW9uSWRzOiBwcm92aWRlclN0b3JlLnJ1bnMuZ2V0KCkubWFwKHJ1biA9PiBydW4uYXV0b21hdGlvbklkKSxcblx0XHRcdGxlZ2FjeUF1dG9tYXRpb25JZHM6IEpTT04ucGFyc2Uoc3RvcmFnZS5nZXQoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSEpLmF1dG9tYXRpb25zLm1hcCgoYXV0b21hdGlvbjogeyBpZDogc3RyaW5nIH0pID0+IGF1dG9tYXRpb24uaWQpLFxuXHRcdH0sIHtcblx0XHRcdHByb3ZpZGVyUnVuQXV0b21hdGlvbklkczogW2NyZWF0ZWQuaWRdLFxuXHRcdFx0bGVnYWN5QXV0b21hdGlvbklkczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlY3JlYXRlIGEgZGVzdGluYXRpb24gZGVsZXRlZCBkdXJpbmcgcm9sbGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBwcm92aWRlclN0b3JlLCBzdG9yYWdlIH0gPSBjcmVhdGVTZXJ2aWNlKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnZGVzdGluYXRpb25EZWxldGVEdXJpbmdSb2xsYmFjaycpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ1Byb3ZpZGVyIG93bmVkJyxcblx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLCBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvblR5cGVJZDogU0VTU0lPTl9UWVBFX0lELCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihjcmVhdGVkLmlkLCB7XG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLCBwcm92aWRlcklkOiAncHJvdmlkZXItd2l0aG91dC1zdG9yYWdlJywgc2Vzc2lvblR5cGVJZDogJ290aGVyJywgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgbGVnYWN5TGVkZ2VyID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldChBVVRPTUFUSU9OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pISk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNvdXJjZU5hbWU6IHByb3ZpZGVyU3RvcmUuZ2V0QXV0b21hdGlvbihjcmVhdGVkLmlkKT8ubmFtZSxcblx0XHRcdGxlZ2FjeUF1dG9tYXRpb25JZHM6IGxlZ2FjeUxlZGdlci5hdXRvbWF0aW9ucy5tYXAoKGF1dG9tYXRpb246IHsgaWQ6IHN0cmluZyB9KSA9PiBhdXRvbWF0aW9uLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRzb3VyY2VOYW1lOiAnQ29uY3VycmVudCBzb3VyY2UgdXBkYXRlJyxcblx0XHRcdGxlZ2FjeUF1dG9tYXRpb25JZHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZS1ydW4gdGhlIG11dGF0aW9uIGd1YXJkIGFmdGVyIHRoZSBzb3VyY2UgdXBkYXRlIGNvbW1pdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBwcm92aWRlclN0b3JlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnTGVnYWN5Jyxcblx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLCBwcm92aWRlcklkOiAncHJvdmlkZXItd2l0aG91dC1zdG9yYWdlJywgc2Vzc2lvblR5cGVJZDogJ290aGVyJywgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0fSk7XG5cdFx0bGV0IGd1YXJkQ2FsbHMgPSAwO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS51cGRhdGVBdXRvbWF0aW9uSWZVbmNoYW5nZWQoY3JlYXRlZC5pZCwge1xuXHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUiwgcHJvdmlkZXJJZDogUFJPVklERVJfSUQsIHNlc3Npb25UeXBlSWQ6IFNFU1NJT05fVFlQRV9JRCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0fSwgY3JlYXRlZCwgKCkgPT4ge1xuXHRcdFx0Z3VhcmRDYWxscysrO1xuXHRcdFx0aWYgKGd1YXJkQ2FsbHMgPiAxKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignR3VhcmQgY2FsbGVkIGFmdGVyIGNvbW1pdC4nKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiByZXN1bHQua2luZCxcblx0XHRcdGd1YXJkQ2FsbHMsXG5cdFx0XHRwcm92aWRlckF1dG9tYXRpb25JZDogcHJvdmlkZXJTdG9yZS5nZXRBdXRvbWF0aW9uKGNyZWF0ZWQuaWQpPy5pZCxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6ICd1cGRhdGVkJyxcblx0XHRcdGd1YXJkQ2FsbHM6IDEsXG5cdFx0XHRwcm92aWRlckF1dG9tYXRpb25JZDogY3JlYXRlZC5pZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWlncmF0ZXMgbGVnYWN5IEF1dG9tYXRpb25zIGFuZCBydW5zIHVuY2hhbmdlZCBpbnRvIHRoZSBwcm92aWRlciBzdG9yZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsZWdhY3kgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzY2hlbWFWZXJzaW9uOiAzLFxuXHRcdFx0cmV2aXNpb246IDEsXG5cdFx0XHRhdXRvbWF0aW9uczogW3tcblx0XHRcdFx0aWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRuYW1lOiAnTGVnYWN5Jyxcblx0XHRcdFx0cHJvbXB0OiAncHJvbXB0Jyxcblx0XHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvblR5cGVJZDogU0VTU0lPTl9UWVBFX0lELCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdFx0bW9kZTogJ2FnZW50Jyxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiAnYXV0b3BpbG90Jyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdH1dLFxuXHRcdFx0cnVuczogW3tcblx0XHRcdFx0aWQ6ICdydW4tMScsXG5cdFx0XHRcdGF1dG9tYXRpb25JZDogJ2F1dG9tYXRpb24tMScsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdHRyaWdnZXI6ICdtYW51YWwnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRsZWFkZXJXaW5kb3dJZDogMSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgcHJvdmlkZXJTdG9yZSwgc3RvcmFnZSB9ID0gY3JlYXRlU2VydmljZShsZWdhY3kpO1xuXG5cdFx0YXdhaXQgc2VydmljZS53YWl0Rm9yTWlncmF0aW9uRm9yVGVzdGluZygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXRvbWF0aW9uOiBwcm92aWRlclN0b3JlLmdldEF1dG9tYXRpb24oJ2F1dG9tYXRpb24tMScpLFxuXHRcdFx0cnVuSWRzOiBwcm92aWRlclN0b3JlLnJ1bnMuZ2V0KCkubWFwKHJ1biA9PiBydW4uaWQpLFxuXHRcdFx0bGVnYWN5OiBKU09OLnBhcnNlKHN0b3JhZ2UuZ2V0KEFVVE9NQVRJT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikhKSxcblx0XHR9LCB7XG5cdFx0XHRhdXRvbWF0aW9uOiB7XG5cdFx0XHRcdGlkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0bmFtZTogJ0xlZ2FjeScsXG5cdFx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUiwgcHJvdmlkZXJJZDogUFJPVklERVJfSUQsIHNlc3Npb25UeXBlSWQ6IFNFU1NJT05fVFlQRV9JRCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogJ2F1dG9waWxvdCcsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdGxhc3RSdW5BdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRuZXh0UnVuQXQ6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHRydW5JZHM6IFsncnVuLTEnXSxcblx0XHRcdGxlZ2FjeTogeyBzY2hlbWFWZXJzaW9uOiAzLCByZXZpc2lvbjogMiwgYXV0b21hdGlvbnM6IFtdLCBydW5zOiBbXSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRyaWVzIG1pZ3JhdGlvbiB3aGVuIHRoZSBsZWdhY3kgQXV0b21hdGlvbiBjaGFuZ2VzIGR1cmluZyBpbXBvcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGVnYWN5ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFt7XG5cdFx0XHRcdGlkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0bmFtZTogJ09yaWdpbmFsJyxcblx0XHRcdFx0cHJvbXB0OiAncHJvbXB0Jyxcblx0XHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvblR5cGVJZDogU0VTU0lPTl9UWVBFX0lELCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdH1dLFxuXHRcdFx0cnVuczogW10sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBwcm92aWRlclN0b3JlLCBzdG9yYWdlIH0gPSBjcmVhdGVTZXJ2aWNlKGxlZ2FjeSwgdW5kZWZpbmVkLCAnY29uY3VycmVudE1pZ3JhdGlvblVwZGF0ZScpO1xuXG5cdFx0YXdhaXQgc2VydmljZS53YWl0Rm9yTWlncmF0aW9uRm9yVGVzdGluZygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm92aWRlck5hbWU6IHByb3ZpZGVyU3RvcmUuZ2V0QXV0b21hdGlvbignYXV0b21hdGlvbi0xJyk/Lm5hbWUsXG5cdFx0XHRsZWdhY3lBdXRvbWF0aW9uSWRzOiBKU09OLnBhcnNlKHN0b3JhZ2UuZ2V0KEFVVE9NQVRJT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikhKS5hdXRvbWF0aW9ucy5tYXAoKGF1dG9tYXRpb246IHsgaWQ6IHN0cmluZyB9KSA9PiBhdXRvbWF0aW9uLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRwcm92aWRlck5hbWU6ICdDb25jdXJyZW50IHVwZGF0ZScsXG5cdFx0XHRsZWdhY3lBdXRvbWF0aW9uSWRzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncm9sbHMgYmFjayBtaWdyYXRpb24gd2hlbiB0aGUgbGVnYWN5IEF1dG9tYXRpb24gaXMgZGVsZXRlZCBkdXJpbmcgaW1wb3J0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxlZ2FjeSA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNjaGVtYVZlcnNpb246IDMsXG5cdFx0XHRyZXZpc2lvbjogMSxcblx0XHRcdGF1dG9tYXRpb25zOiBbe1xuXHRcdFx0XHRpZDogJ2F1dG9tYXRpb24tMScsXG5cdFx0XHRcdG5hbWU6ICdEZWxldGVkIGNvbmN1cnJlbnRseScsXG5cdFx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUi50b0pTT04oKSwgcHJvdmlkZXJJZDogUFJPVklERVJfSUQsIHNlc3Npb25UeXBlSWQ6IFNFU1NJT05fVFlQRV9JRCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHR9XSxcblx0XHRcdHJ1bnM6IFtdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgcHJvdmlkZXJTdG9yZSwgc3RvcmFnZSB9ID0gY3JlYXRlU2VydmljZShsZWdhY3ksIHVuZGVmaW5lZCwgJ2NvbmN1cnJlbnRNaWdyYXRpb25EZWxldGUnKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud2FpdEZvck1pZ3JhdGlvbkZvclRlc3RpbmcoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXJBdXRvbWF0aW9uOiBwcm92aWRlclN0b3JlLmdldEF1dG9tYXRpb24oJ2F1dG9tYXRpb24tMScpLFxuXHRcdFx0bGVnYWN5QXV0b21hdGlvbklkczogSlNPTi5wYXJzZShzdG9yYWdlLmdldChBVVRPTUFUSU9OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pISkuYXV0b21hdGlvbnMubWFwKChhdXRvbWF0aW9uOiB7IGlkOiBzdHJpbmcgfSkgPT4gYXV0b21hdGlvbi5pZCksXG5cdFx0fSwge1xuXHRcdFx0cHJvdmlkZXJBdXRvbWF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRsZWdhY3lBdXRvbWF0aW9uSWRzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0cmllcyBtaWdyYXRpb24gd2hlbiBhIHJ1biBpcyBhZGRlZCBkdXJpbmcgaW1wb3J0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxlZ2FjeSA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNjaGVtYVZlcnNpb246IDMsXG5cdFx0XHRyZXZpc2lvbjogMSxcblx0XHRcdGF1dG9tYXRpb25zOiBbe1xuXHRcdFx0XHRpZDogJ2F1dG9tYXRpb24tMScsXG5cdFx0XHRcdG5hbWU6ICdDb25jdXJyZW50IHJ1bicsXG5cdFx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUi50b0pTT04oKSwgcHJvdmlkZXJJZDogUFJPVklERVJfSUQsIHNlc3Npb25UeXBlSWQ6IFNFU1NJT05fVFlQRV9JRCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHR9XSxcblx0XHRcdHJ1bnM6IFtdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgcHJvdmlkZXJTdG9yZSwgc3RvcmFnZSB9ID0gY3JlYXRlU2VydmljZShsZWdhY3ksIHVuZGVmaW5lZCwgJ2NvbmN1cnJlbnRNaWdyYXRpb25SdW4nKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud2FpdEZvck1pZ3JhdGlvbkZvclRlc3RpbmcoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXJSdW5Db3VudDogcHJvdmlkZXJTdG9yZS5ydW5zLmdldCgpLmxlbmd0aCxcblx0XHRcdHByb3ZpZGVyUnVuQXV0b21hdGlvbklkczogcHJvdmlkZXJTdG9yZS5ydW5zLmdldCgpLm1hcChydW4gPT4gcnVuLmF1dG9tYXRpb25JZCksXG5cdFx0XHRsZWdhY3lSdW5JZHM6IEpTT04ucGFyc2Uoc3RvcmFnZS5nZXQoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSEpLnJ1bnMubWFwKChydW46IHsgaWQ6IHN0cmluZyB9KSA9PiBydW4uaWQpLFxuXHRcdH0sIHtcblx0XHRcdHByb3ZpZGVyUnVuQ291bnQ6IDEsXG5cdFx0XHRwcm92aWRlclJ1bkF1dG9tYXRpb25JZHM6IFsnYXV0b21hdGlvbi0xJ10sXG5cdFx0XHRsZWdhY3lSdW5JZHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdib3VuZHMgbWlncmF0aW9uIHJldHJpZXMgYW5kIGxlYXZlcyBhIGNvbnRpbnVvdXNseSBjaGFuZ2luZyBzb3VyY2UgaW4gbGVnYWN5IHN0b3JhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGVnYWN5ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFt7XG5cdFx0XHRcdGlkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0bmFtZTogJ09yaWdpbmFsJyxcblx0XHRcdFx0cHJvbXB0OiAncHJvbXB0Jyxcblx0XHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvblR5cGVJZDogU0VTU0lPTl9UWVBFX0lELCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdH1dLFxuXHRcdFx0cnVuczogW10sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBwcm92aWRlclN0b3JlLCBzdG9yYWdlIH0gPSBjcmVhdGVTZXJ2aWNlKGxlZ2FjeSwgdW5kZWZpbmVkLCAnY29udGludW91c01pZ3JhdGlvblVwZGF0ZScpO1xuXG5cdFx0YXdhaXQgc2VydmljZS53YWl0Rm9yTWlncmF0aW9uRm9yVGVzdGluZygpO1xuXHRcdGNvbnN0IGxlZ2FjeUxlZGdlciA9IEpTT04ucGFyc2Uoc3RvcmFnZS5nZXQoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm92aWRlckF1dG9tYXRpb246IHByb3ZpZGVyU3RvcmUuZ2V0QXV0b21hdGlvbignYXV0b21hdGlvbi0xJyksXG5cdFx0XHRsZWdhY3lBdXRvbWF0aW9uSWRzOiBsZWdhY3lMZWRnZXIuYXV0b21hdGlvbnMubWFwKChhdXRvbWF0aW9uOiB7IGlkOiBzdHJpbmcgfSkgPT4gYXV0b21hdGlvbi5pZCksXG5cdFx0XHRsZWdhY3lOYW1lOiBsZWdhY3lMZWRnZXIuYXV0b21hdGlvbnNbMF0/Lm5hbWUsXG5cdFx0fSwge1xuXHRcdFx0cHJvdmlkZXJBdXRvbWF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRsZWdhY3lBdXRvbWF0aW9uSWRzOiBbJ2F1dG9tYXRpb24tMSddLFxuXHRcdFx0bGVnYWN5TmFtZTogJ0NvbmN1cnJlbnQgdXBkYXRlIDMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWR1cGxpY2F0ZXMgb3ZlcmxhcHBpbmcgcHJvdmlkZXIgYW5kIGxlZ2FjeSBlbnRyaWVzIGR1cmluZyBtaWdyYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGVkZ2VyID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFt7XG5cdFx0XHRcdGlkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0bmFtZTogJ1NoYXJlZCcsXG5cdFx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUi50b0pTT04oKSwgcHJvdmlkZXJJZDogUFJPVklERVJfSUQsIHNlc3Npb25UeXBlSWQ6IFNFU1NJT05fVFlQRV9JRCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHR9XSxcblx0XHRcdHJ1bnM6IFt7XG5cdFx0XHRcdGlkOiAncnVuLTEnLFxuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHR0cmlnZ2VyOiAnbWFudWFsJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bGVhZGVyV2luZG93SWQ6IDEsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UobGVkZ2VyLCBsZWRnZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXRvbWF0aW9uSWRzOiBzZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLm1hcChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQpLFxuXHRcdFx0cnVuSWRzOiBzZXJ2aWNlLnJ1bnMuZ2V0KCkubWFwKHJ1biA9PiBydW4uaWQpLFxuXHRcdH0sIHtcblx0XHRcdGF1dG9tYXRpb25JZHM6IFsnYXV0b21hdGlvbi0xJ10sXG5cdFx0XHRydW5JZHM6IFsncnVuLTEnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0YWlucyBsZWdhY3kgZGF0YSB3aGVuIHRoZSBwcm92aWRlciBBdXRvbWF0aW9uIHBheWxvYWQgZGl2ZXJnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3JlYXRlTGVkZ2VyID0gKG5hbWU6IHN0cmluZykgPT4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFt7XG5cdFx0XHRcdGlkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0cHJvbXB0OiAncHJvbXB0Jyxcblx0XHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvblR5cGVJZDogU0VTU0lPTl9UWVBFX0lELCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdH1dLFxuXHRcdFx0cnVuczogW10sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBwcm92aWRlclN0b3JlLCBzdG9yYWdlIH0gPSBjcmVhdGVTZXJ2aWNlKGNyZWF0ZUxlZGdlcignTGVnYWN5JyksIGNyZWF0ZUxlZGdlcignUHJvdmlkZXInKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLndhaXRGb3JNaWdyYXRpb25Gb3JUZXN0aW5nKCk7XG5cdFx0Y29uc3QgbGVnYWN5TGVkZ2VyID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldChBVVRPTUFUSU9OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pISk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3ZpZGVyTmFtZTogcHJvdmlkZXJTdG9yZS5nZXRBdXRvbWF0aW9uKCdhdXRvbWF0aW9uLTEnKT8ubmFtZSxcblx0XHRcdGxlZ2FjeU5hbWVzOiBsZWdhY3lMZWRnZXIuYXV0b21hdGlvbnMubWFwKChhdXRvbWF0aW9uOiB7IG5hbWU6IHN0cmluZyB9KSA9PiBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdH0sIHtcblx0XHRcdHByb3ZpZGVyTmFtZTogJ1Byb3ZpZGVyJyxcblx0XHRcdGxlZ2FjeU5hbWVzOiBbJ0xlZ2FjeSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRhaW5zIGxlZ2FjeSBkYXRhIHdoZW4gYSBzYW1lLUlEIHJ1biBwYXlsb2FkIGRpdmVyZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSB7XG5cdFx0XHRpZDogJ2F1dG9tYXRpb24tMScsXG5cdFx0XHRuYW1lOiAnU2hhcmVkJyxcblx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvblR5cGVJZDogU0VTU0lPTl9UWVBFX0lELCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjcmVhdGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHR9O1xuXHRcdGNvbnN0IGNyZWF0ZUxlZGdlciA9IChzdGF0dXM6ICdjb21wbGV0ZWQnIHwgJ2ZhaWxlZCcpID0+IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNjaGVtYVZlcnNpb246IDMsXG5cdFx0XHRyZXZpc2lvbjogMSxcblx0XHRcdGF1dG9tYXRpb25zOiBbYXV0b21hdGlvbl0sXG5cdFx0XHRydW5zOiBbe1xuXHRcdFx0XHRpZDogJ3J1bi0xJyxcblx0XHRcdFx0YXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkLFxuXHRcdFx0XHRzdGF0dXMsXG5cdFx0XHRcdHRyaWdnZXI6ICdtYW51YWwnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRsZWFkZXJXaW5kb3dJZDogMSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgcHJvdmlkZXJTdG9yZSwgc3RvcmFnZSB9ID0gY3JlYXRlU2VydmljZShjcmVhdGVMZWRnZXIoJ2ZhaWxlZCcpLCBjcmVhdGVMZWRnZXIoJ2NvbXBsZXRlZCcpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud2FpdEZvck1pZ3JhdGlvbkZvclRlc3RpbmcoKTtcblx0XHRjb25zdCBsZWdhY3lMZWRnZXIgPSBKU09OLnBhcnNlKHN0b3JhZ2UuZ2V0KEFVVE9NQVRJT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikhKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXJTdGF0dXNlczogcHJvdmlkZXJTdG9yZS5ydW5zLmdldCgpLm1hcChydW4gPT4gcnVuLnN0YXR1cyksXG5cdFx0XHRsZWdhY3lTdGF0dXNlczogbGVnYWN5TGVkZ2VyLnJ1bnMubWFwKChydW46IHsgc3RhdHVzOiBzdHJpbmcgfSkgPT4gcnVuLnN0YXR1cyksXG5cdFx0fSwge1xuXHRcdFx0cHJvdmlkZXJTdGF0dXNlczogWydjb21wbGV0ZWQnXSxcblx0XHRcdGxlZ2FjeVN0YXR1c2VzOiBbJ2ZhaWxlZCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRhaW5zIGxlZ2FjeSBkYXRhIHdoZW4gcHJvdmlkZXIgcnVuIGhpc3RvcnkgZGl2ZXJnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IHtcblx0XHRcdGlkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdG5hbWU6ICdTaGFyZWQnLFxuXHRcdFx0cHJvbXB0OiAncHJvbXB0Jyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdHRhcmdldDogeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBGT0xERVIudG9KU09OKCksIHByb3ZpZGVySWQ6IFBST1ZJREVSX0lELCBzZXNzaW9uVHlwZUlkOiBTRVNTSU9OX1RZUEVfSUQsIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9LFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHR1cGRhdGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdH07XG5cdFx0Y29uc3QgbGVnYWN5ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFthdXRvbWF0aW9uXSxcblx0XHRcdHJ1bnM6IFt7XG5cdFx0XHRcdGlkOiAnbGVnYWN5LXJ1bicsXG5cdFx0XHRcdGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCxcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHRcdFx0dHJpZ2dlcjogJ21hbnVhbCcsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjYtMDEtMDJUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdGxlYWRlcldpbmRvd0lkOiAxLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzY2hlbWFWZXJzaW9uOiAzLFxuXHRcdFx0cmV2aXNpb246IDEsXG5cdFx0XHRhdXRvbWF0aW9uczogW2F1dG9tYXRpb25dLFxuXHRcdFx0cnVuczogW3tcblx0XHRcdFx0aWQ6ICdwcm92aWRlci1ydW4nLFxuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdHRyaWdnZXI6ICdtYW51YWwnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRsZWFkZXJXaW5kb3dJZDogMSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgcHJvdmlkZXJTdG9yZSwgc3RvcmFnZSB9ID0gY3JlYXRlU2VydmljZShsZWdhY3ksIHByb3ZpZGVyKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud2FpdEZvck1pZ3JhdGlvbkZvclRlc3RpbmcoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXJSdW5JZHM6IHByb3ZpZGVyU3RvcmUucnVucy5nZXQoKS5tYXAocnVuID0+IHJ1bi5pZCksXG5cdFx0XHRsZWdhY3k6IEpTT04ucGFyc2Uoc3RvcmFnZS5nZXQoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSEpLFxuXHRcdH0sIHtcblx0XHRcdHByb3ZpZGVyUnVuSWRzOiBbJ3Byb3ZpZGVyLXJ1biddLFxuXHRcdFx0bGVnYWN5OiB7XG5cdFx0XHRcdHNjaGVtYVZlcnNpb246IDMsIHJldmlzaW9uOiAxLCBhdXRvbWF0aW9uczogW2F1dG9tYXRpb25dLCBydW5zOiBbe1xuXHRcdFx0XHRcdGlkOiAnbGVnYWN5LXJ1bicsXG5cdFx0XHRcdFx0YXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkLFxuXHRcdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdFx0dHJpZ2dlcjogJ21hbnVhbCcsXG5cdFx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNi0wMS0wMlQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0XHRsZWFkZXJXaW5kb3dJZDogMSxcblx0XHRcdFx0fV1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY292ZXJzIGFjdGl2ZSBydW5zIGFmdGVyIG1pZ3JhdGlvbiBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGVnYWN5ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFt7XG5cdFx0XHRcdGlkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0bmFtZTogJ0xlZ2FjeScsXG5cdFx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUi50b0pTT04oKSwgcHJvdmlkZXJJZDogUFJPVklERVJfSUQsIHNlc3Npb25UeXBlSWQ6IFNFU1NJT05fVFlQRV9JRCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHR9XSxcblx0XHRcdHJ1bnM6IFt7XG5cdFx0XHRcdGlkOiAncnVuLTEnLFxuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRzdGF0dXM6ICdydW5uaW5nJyxcblx0XHRcdFx0dHJpZ2dlcjogJ21hbnVhbCcsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdGxlYWRlcldpbmRvd0lkOiAxLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBwcm92aWRlclN0b3JlIH0gPSBjcmVhdGVTZXJ2aWNlKGxlZ2FjeSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLm1hcmtTdGFsZVJ1bnNGYWlsZWQoJ1JlY292ZXJlZCBhZnRlciByZXN0YXJ0LicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlclN0b3JlLnJ1bnMuZ2V0KCkubWFwKHJ1biA9PiAoe1xuXHRcdFx0aWQ6IHJ1bi5pZCxcblx0XHRcdHN0YXR1czogcnVuLnN0YXR1cyxcblx0XHRcdGVycm9yTWVzc2FnZTogcnVuLmVycm9yTWVzc2FnZSxcblx0XHR9KSksIFt7XG5cdFx0XHRpZDogJ3J1bi0xJyxcblx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXG5cdFx0XHRlcnJvck1lc3NhZ2U6ICdSZWNvdmVyZWQgYWZ0ZXIgcmVzdGFydC4nLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3ZlcnMgc3RhbGUgcnVucyBmb3IgcHJvdmlkZXJzIGFkZGVkIG9ubHkgd2hpbGUgbGVhZGVyLXNjb3BlZCByZWNvdmVyeSBpcyBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdG9yYWdlLCBhdXRvbWF0aW9uU3RvcmFnZSwgYWRkUHJvdmlkZXIgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnN0YXJ0U3RhbGVSdW5SZWNvdmVyeSgnUmVjb3ZlcmVkIGFmdGVyIHJlc3RhcnQuJyk7XG5cblx0XHRjb25zdCBhY3RpdmVQcm92aWRlcklkID0gJ2xhdGUtYWN0aXZlLXByb3ZpZGVyJztcblx0XHRjb25zdCBhY3RpdmVTdG9yZSA9IHRlYXJkb3duLmFkZChuZXcgQXV0b21hdGlvblN0b3JlKHByb3ZpZGVyQXV0b21hdGlvblN0b3JhZ2VLZXkoYWN0aXZlUHJvdmlkZXJJZCksIHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgYXV0b21hdGlvblN0b3JhZ2UpKTtcblx0XHRjb25zdCBhY3RpdmVBdXRvbWF0aW9uID0gYXdhaXQgYWN0aXZlU3RvcmUuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnQWN0aXZlIHJlY292ZXJ5Jyxcblx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLCBwcm92aWRlcklkOiBhY3RpdmVQcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkOiAnbGF0ZScsIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGFjdGl2ZVN0b3JlLnJlY29yZFJ1blN0YXJ0KGFjdGl2ZUF1dG9tYXRpb24uaWQsICdtYW51YWwnLCAxKTtcblx0XHRhZGRQcm92aWRlcih1cGNhc3RQYXJ0aWFsPElTZXNzaW9uc1Byb3ZpZGVyPih7IGlkOiBhY3RpdmVQcm92aWRlcklkLCBvcmRlcjogMSwgYXV0b21hdGlvbnM6IGFjdGl2ZVN0b3JlIH0pKTtcblx0XHRhd2FpdCBzZXJ2aWNlLndhaXRGb3JNaWdyYXRpb25Gb3JUZXN0aW5nKCk7XG5cblx0XHRzZXJ2aWNlLnN0b3BTdGFsZVJ1blJlY292ZXJ5KCk7XG5cdFx0Y29uc3QgaW5hY3RpdmVQcm92aWRlcklkID0gJ2xhdGUtaW5hY3RpdmUtcHJvdmlkZXInO1xuXHRcdGNvbnN0IGluYWN0aXZlU3RvcmUgPSB0ZWFyZG93bi5hZGQobmV3IEF1dG9tYXRpb25TdG9yZShwcm92aWRlckF1dG9tYXRpb25TdG9yYWdlS2V5KGluYWN0aXZlUHJvdmlkZXJJZCksIHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgYXV0b21hdGlvblN0b3JhZ2UpKTtcblx0XHRjb25zdCBpbmFjdGl2ZUF1dG9tYXRpb24gPSBhd2FpdCBpbmFjdGl2ZVN0b3JlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0luYWN0aXZlIHJlY292ZXJ5Jyxcblx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLCBwcm92aWRlcklkOiBpbmFjdGl2ZVByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6ICdsYXRlJywgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgaW5hY3RpdmVTdG9yZS5yZWNvcmRSdW5TdGFydChpbmFjdGl2ZUF1dG9tYXRpb24uaWQsICdtYW51YWwnLCAxKTtcblx0XHRhZGRQcm92aWRlcih1cGNhc3RQYXJ0aWFsPElTZXNzaW9uc1Byb3ZpZGVyPih7IGlkOiBpbmFjdGl2ZVByb3ZpZGVySWQsIG9yZGVyOiAyLCBhdXRvbWF0aW9uczogaW5hY3RpdmVTdG9yZSB9KSk7XG5cdFx0YXdhaXQgc2VydmljZS53YWl0Rm9yTWlncmF0aW9uRm9yVGVzdGluZygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY3RpdmVTdGF0dXNlczogYWN0aXZlU3RvcmUucnVucy5nZXQoKS5tYXAocnVuID0+IHJ1bi5zdGF0dXMpLFxuXHRcdFx0aW5hY3RpdmVTdGF0dXNlczogaW5hY3RpdmVTdG9yZS5ydW5zLmdldCgpLm1hcChydW4gPT4gcnVuLnN0YXR1cyksXG5cdFx0fSwge1xuXHRcdFx0YWN0aXZlU3RhdHVzZXM6IFsnZmFpbGVkJ10sXG5cdFx0XHRpbmFjdGl2ZVN0YXR1c2VzOiBbJ3BlbmRpbmcnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWlncmF0ZXMgYmVmb3JlIHJlY292ZXJpbmcgYSBwcm92aWRlciBhZGRlZCB3aGlsZSBpbml0aWFsIHJlY292ZXJ5IGlzIHF1ZXVlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsYXRlUHJvdmlkZXJJZCA9ICdsYXRlLXByb3ZpZGVyJztcblx0XHRjb25zdCBsZWdhY3kgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzY2hlbWFWZXJzaW9uOiAzLFxuXHRcdFx0cmV2aXNpb246IDEsXG5cdFx0XHRhdXRvbWF0aW9uczogW3tcblx0XHRcdFx0aWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRuYW1lOiAnTGF0ZSBwcm92aWRlcicsXG5cdFx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfSxcblx0XHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUi50b0pTT04oKSwgcHJvdmlkZXJJZDogbGF0ZVByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQ6ICdsYXRlJywgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHR9XSxcblx0XHRcdHJ1bnM6IFt7XG5cdFx0XHRcdGlkOiAncnVuLTEnLFxuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRzdGF0dXM6ICdydW5uaW5nJyxcblx0XHRcdFx0dHJpZ2dlcjogJ21hbnVhbCcsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdGxlYWRlcldpbmRvd0lkOiAxLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzdG9yYWdlLCBhdXRvbWF0aW9uU3RvcmFnZSwgYWRkUHJvdmlkZXIgfSA9IGNyZWF0ZVNlcnZpY2UobGVnYWN5KTtcblx0XHRjb25zdCByZWNvdmVyeSA9IHNlcnZpY2Uuc3RhcnRTdGFsZVJ1blJlY292ZXJ5KCdSZWNvdmVyZWQgYWZ0ZXIgcmVzdGFydC4nKTtcblx0XHRjb25zdCBsYXRlU3RvcmUgPSB0ZWFyZG93bi5hZGQobmV3IEF1dG9tYXRpb25TdG9yZShwcm92aWRlckF1dG9tYXRpb25TdG9yYWdlS2V5KGxhdGVQcm92aWRlcklkKSwgc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBhdXRvbWF0aW9uU3RvcmFnZSkpO1xuXHRcdGFkZFByb3ZpZGVyKHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zUHJvdmlkZXI+KHsgaWQ6IGxhdGVQcm92aWRlcklkLCBvcmRlcjogMSwgYXV0b21hdGlvbnM6IGxhdGVTdG9yZSB9KSk7XG5cblx0XHRhd2FpdCByZWNvdmVyeTtcblx0XHRhd2FpdCBzZXJ2aWNlLndhaXRGb3JNaWdyYXRpb25Gb3JUZXN0aW5nKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhdGVTdG9yZS5ydW5zLmdldCgpLm1hcChydW4gPT4gKHtcblx0XHRcdGlkOiBydW4uaWQsXG5cdFx0XHRzdGF0dXM6IHJ1bi5zdGF0dXMsXG5cdFx0XHRlcnJvck1lc3NhZ2U6IHJ1bi5lcnJvck1lc3NhZ2UsXG5cdFx0fSkpLCBbe1xuXHRcdFx0aWQ6ICdydW4tMScsXG5cdFx0XHRzdGF0dXM6ICdmYWlsZWQnLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiAnUmVjb3ZlcmVkIGFmdGVyIHJlc3RhcnQuJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRpbnVlcyBzdGFsZS1ydW4gcmVjb3Zlcnkgd2hlbiBhIHByb3ZpZGVyIHN0b3JlIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxlZ2FjeSA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNjaGVtYVZlcnNpb246IDMsXG5cdFx0XHRyZXZpc2lvbjogMSxcblx0XHRcdGF1dG9tYXRpb25zOiBbe1xuXHRcdFx0XHRpZDogJ2F1dG9tYXRpb24tMScsXG5cdFx0XHRcdG5hbWU6ICdMZWdhY3knLFxuXHRcdFx0XHRwcm9tcHQ6ICdwcm9tcHQnLFxuXHRcdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHRcdHRhcmdldDogeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBGT0xERVIudG9KU09OKCksIHNlc3Npb25UeXBlSWQ6IFNFU1NJT05fVFlQRV9JRCwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHR9XSxcblx0XHRcdHJ1bnM6IFt7XG5cdFx0XHRcdGlkOiAncnVuLTEnLFxuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHRzdGF0dXM6ICdydW5uaW5nJyxcblx0XHRcdFx0dHJpZ2dlcjogJ21hbnVhbCcsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdGxlYWRlcldpbmRvd0lkOiAxLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKGxlZ2FjeSwgdW5kZWZpbmVkLCAnc3RhbGVSdW5SZWNvdmVyeScpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5tYXJrU3RhbGVSdW5zRmFpbGVkKCdSZWNvdmVyZWQgYWZ0ZXIgcmVzdGFydC4nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5ydW5zLmdldCgpLm1hcChydW4gPT4gKHtcblx0XHRcdGlkOiBydW4uaWQsXG5cdFx0XHRzdGF0dXM6IHJ1bi5zdGF0dXMsXG5cdFx0XHRlcnJvck1lc3NhZ2U6IHJ1bi5lcnJvck1lc3NhZ2UsXG5cdFx0fSkpLCBbe1xuXHRcdFx0aWQ6ICdydW4tMScsXG5cdFx0XHRzdGF0dXM6ICdmYWlsZWQnLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiAnUmVjb3ZlcmVkIGFmdGVyIHJlc3RhcnQuJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRpbnVlcyBtaWdyYXRpbmcgYWZ0ZXIgYW4gQXV0b21hdGlvbiBpbXBvcnQgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3JlYXRlQXV0b21hdGlvbiA9IChpZDogc3RyaW5nKSA9PiAoe1xuXHRcdFx0aWQsXG5cdFx0XHRuYW1lOiBpZCxcblx0XHRcdHByb21wdDogJ3Byb21wdCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBwcm92aWRlcklkOiBQUk9WSURFUl9JRCwgc2Vzc2lvblR5cGVJZDogU0VTU0lPTl9UWVBFX0lELCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjcmVhdGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHR9KTtcblx0XHRjb25zdCBsZWdhY3kgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzY2hlbWFWZXJzaW9uOiAzLFxuXHRcdFx0cmV2aXNpb246IDEsXG5cdFx0XHRhdXRvbWF0aW9uczogW2NyZWF0ZUF1dG9tYXRpb24oJ2F1dG9tYXRpb24tMScpLCBjcmVhdGVBdXRvbWF0aW9uKCdhdXRvbWF0aW9uLTInKV0sXG5cdFx0XHRydW5zOiBbXSxcblx0XHR9KTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHByb3ZpZGVyU3RvcmUsIHN0b3JhZ2UgfSA9IGNyZWF0ZVNlcnZpY2UobGVnYWN5LCB1bmRlZmluZWQsICdtaWdyYXRpb24nKTtcblxuXHRcdGF3YWl0IHNlcnZpY2Uud2FpdEZvck1pZ3JhdGlvbkZvclRlc3RpbmcoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXJBdXRvbWF0aW9uSWRzOiBwcm92aWRlclN0b3JlLmF1dG9tYXRpb25zLmdldCgpLm1hcChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQpLFxuXHRcdFx0bGVnYWN5QXV0b21hdGlvbklkczogSlNPTi5wYXJzZShzdG9yYWdlLmdldChBVVRPTUFUSU9OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pISkuYXV0b21hdGlvbnMubWFwKChhdXRvbWF0aW9uOiB7IGlkOiBzdHJpbmcgfSkgPT4gYXV0b21hdGlvbi5pZCksXG5cdFx0fSwge1xuXHRcdFx0cHJvdmlkZXJBdXRvbWF0aW9uSWRzOiBbJ2F1dG9tYXRpb24tMiddLFxuXHRcdFx0bGVnYWN5QXV0b21hdGlvbklkczogWydhdXRvbWF0aW9uLTEnXSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx3QkFBd0IsaUJBQWlCLGNBQWMscUJBQXFCO0FBQ3JGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQXdDLGlDQUFpQztBQUV6RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHdCQUF3QiwyQkFBMkIsb0NBQW9DO0FBQ2hHLFNBQVMsb0NBQW9DO0FBRTdDLE1BQU0sU0FBUyxJQUFJLE1BQU0sbUJBQW1CO0FBQzVDLE1BQU0sY0FBYztBQUNwQixNQUFNLGtCQUFrQjtBQUV4QixNQUFNLCtDQUErQyxnQkFBZ0I7QUFBQSxFQUNwRSxNQUFlLHNCQUFx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
