import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ConfirmationOptionKind } from "../../../../../platform/agentHost/common/state/protocol/channels-chat/state.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { ChatContextKeys } from "../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING } from "../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { AutomationService } from "../../browser/automationService.js";
import { ConfigureAutomationTool, ConfigureAutomationToolId, DeleteAutomationTool, DeleteAutomationToolId, ListAutomationsTool, ListAutomationsToolId, RunAutomationTool, RunAutomationToolId } from "../../browser/automationTools.js";
import { AUTOMATION_STORAGE_KEY } from "../../common/automationStorageService.js";
const FOLDER = URI.parse("file:///workspace");
const SESSION_RESOURCE = URI.parse("agent-session://local/session");
const CHAT_RESOURCE = URI.parse("agent-chat://local/chat");
const NOW = "2026-01-01T00:00:00.000Z";
const progress = { report: () => {
} };
function createAutomation(overrides) {
  return {
    id: "automation-1",
    name: "Daily review",
    prompt: "Review the repository",
    schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
    target: {
      kind: "workspace",
      folderUri: FOLDER,
      providerId: "local-agent-host",
      sessionTypeId: "copilot",
      isolation: { kind: "default" }
    },
    modelId: "gpt-test",
    mode: "agent",
    permissionLevel: "default",
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    nextRunAt: "2026-01-02T09:00:00.000Z",
    ...overrides
  };
}
class FakeAutomationService extends mock() {
  constructor(automations = []) {
    super();
    this.automations = observableValue(this, []);
    this.runs = observableValue(this, []);
    this.created = [];
    this.updated = [];
    this.deleted = [];
    this.automations.set(automations, void 0);
  }
  getAutomation(id) {
    return this.automations.get().find((automation) => automation.id === id);
  }
  runsFor(automationId) {
    return constObservable(this.runs.get().filter((run) => run.automationId === automationId));
  }
  getActiveRunFor(automationId) {
    return this.runs.get().find((run) => run.automationId === automationId && (run.status === "pending" || run.status === "running"));
  }
  addRun(run) {
    this.runs.set([run, ...this.runs.get()], void 0);
  }
  async createAutomation(options) {
    this.created.push(options);
    return {
      ...options,
      id: "created-automation",
      enabled: options.enabled ?? true,
      createdAt: NOW,
      updatedAt: NOW
    };
  }
  async updateAutomation(id, patch) {
    this.updated.push({ id, patch });
    const existing = this.getAutomation(id);
    assert.ok(existing);
    return {
      ...existing,
      name: patch.name ?? existing.name,
      prompt: patch.prompt ?? existing.prompt,
      schedule: patch.schedule ?? existing.schedule,
      target: patch.target ?? existing.target,
      modelId: patch.modelId === null ? void 0 : patch.modelId ?? existing.modelId,
      mode: patch.mode === null ? void 0 : patch.mode ?? existing.mode,
      permissionLevel: patch.permissionLevel === null ? void 0 : patch.permissionLevel ?? existing.permissionLevel,
      enabled: patch.enabled ?? existing.enabled,
      updatedAt: NOW
    };
  }
  async updateAutomationIfUnchanged(id, patch, expected) {
    const current = this.getAutomation(id);
    if (!current || editableAutomationKey(current) !== editableAutomationKey(expected)) {
      return { kind: "conflict", current };
    }
    return { kind: "updated", automation: await this.updateAutomation(id, patch) };
  }
  async deleteAutomation(id) {
    this.deleted.push(id);
    this.automations.set(this.automations.get().filter((automation) => automation.id !== id), void 0);
  }
}
class RecordingAutomationRunner extends mock() {
  constructor(automationService) {
    super();
    this.automationService = automationService;
    this.calls = [];
    this.tokens = [];
    this.whenDispatched = Promise.resolve();
    this.whenCompleted = Promise.resolve();
    this.runStatus = "running";
  }
  runOnce(automation, trigger, leaderWindowId, token = CancellationToken.None) {
    this.calls.push({
      automationId: automation.id,
      trigger,
      leaderWindowId,
      cancelled: token.isCancellationRequested
    });
    this.tokens.push(token);
    const whenDispatched = this.whenDispatched.then(() => {
      const activeRun = this.automationService.getActiveRunFor(automation.id);
      if (activeRun) {
        return { kind: "alreadyRunning", activeRun };
      }
      if (this.notStarted) {
        return this.notStarted;
      }
      const sessionResource = SESSION_RESOURCE;
      const run = {
        id: "run-1",
        automationId: automation.id,
        status: this.runStatus,
        trigger,
        sessionResource,
        startedAt: NOW,
        leaderWindowId
      };
      this.automationService.addRun(run);
      return { kind: "started", run, sessionResource };
    });
    return {
      whenDispatched,
      whenCompleted: Promise.all([whenDispatched, this.whenCompleted]).then(() => void 0)
    };
  }
}
class ControllableAutomationStorageService {
  constructor(currentValue) {
    this.currentValue = currentValue;
    this.readStarted = new DeferredPromise();
    this.compareAndSwapCalls = 0;
  }
  get value() {
    return this.currentValue;
  }
  async read(_key) {
    await this.readStarted.complete();
    await this.readBarrier?.p;
    return this.currentValue;
  }
  async compareAndSwap(_key, expectedValue, newValue) {
    this.compareAndSwapCalls++;
    this.beforeCompareAndSwap?.();
    if (this.nextConflictValue !== void 0) {
      const currentValue = this.nextConflictValue;
      this.nextConflictValue = void 0;
      this.currentValue = currentValue;
      return { swapped: false, currentValue };
    }
    if (this.currentValue !== expectedValue) {
      return { swapped: false, currentValue: this.currentValue };
    }
    this.currentValue = newValue;
    return { swapped: true, currentValue: newValue };
  }
}
function editableAutomationKey(automation) {
  return JSON.stringify({
    name: automation.name,
    prompt: automation.prompt,
    schedule: automation.schedule,
    target: automation.target.kind === "workspace" ? { ...automation.target, folderUri: automation.target.folderUri.toString() } : automation.target,
    modelId: automation.modelId,
    mode: automation.mode,
    permissionLevel: automation.permissionLevel,
    enabled: automation.enabled
  });
}
function serializeAutomationLedger(automations, revision = 1) {
  return JSON.stringify({
    schemaVersion: 3,
    revision,
    automations: automations.map((automation) => ({
      ...automation,
      target: automation.target.kind === "workspace" ? { ...automation.target, folderUri: automation.target.folderUri.toJSON() } : automation.target
    })),
    runs: []
  });
}
class FakeSessionsManagementService extends mock() {
  constructor(session, resolveFromChatResource = false, folderSessionTypes = [], quickChatSessionTypes = []) {
    super();
    this.session = session;
    this.resolveFromChatResource = resolveFromChatResource;
    this.folderSessionTypes = folderSessionTypes;
    this.quickChatSessionTypes = quickChatSessionTypes;
  }
  getSession() {
    return this.resolveFromChatResource ? void 0 : this.session;
  }
  getSessionForChatResource() {
    return this.resolveFromChatResource && this.session ? { session: this.session, chat: upcastPartial({ resource: CHAT_RESOURCE }) } : void 0;
  }
  getSessionTypesForFolder() {
    this.beforeGetFolderSessionTypes?.();
    return [...this.folderSessionTypes];
  }
  getQuickChatSessionTypes() {
    return [...this.quickChatSessionTypes];
  }
}
function createConfigurationService(enabled = true) {
  const configurationService = new TestConfigurationService();
  configurationService.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, enabled);
  return configurationService;
}
function createSession(options) {
  const workspace = options?.workspace === void 0 ? void 0 : upcastPartial({ uri: options.workspace });
  return upcastPartial({
    resource: SESSION_RESOURCE,
    providerId: "local-agent-host",
    sessionType: "copilot",
    workspace: constObservable(workspace),
    isQuickChat: constObservable(options?.quickChat === true)
  });
}
function providerSessionType(providerId, sessionTypeId, supportsWorktreeConfiguration = false) {
  return {
    providerId,
    sessionType: upcastPartial({ id: sessionTypeId, supportsWorktreeConfiguration })
  };
}
async function invoke(tool, parameters, sessionResource = SESSION_RESOURCE, token = CancellationToken.None, selectedCustomButton, toolSpecificData) {
  return tool.invoke({
    callId: "call-1",
    toolId: "tool-1",
    parameters,
    context: { sessionResource },
    selectedCustomButton,
    toolSpecificData
  }, async () => 0, progress, token);
}
function getText(result) {
  const part = result.content[0];
  if (!part || part.kind !== "text") {
    assert.fail("Expected a text tool result.");
  }
  return part.value;
}
suite("AutomationTools", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  function createStorageBackedService(raw, automationStorageService) {
    const storageService = teardown.add(new InMemoryStorageService());
    if (raw !== void 0) {
      storageService.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    return teardown.add(new AutomationService(storageService, new NullLogService(), NullTelemetryService, automationStorageService));
  }
  test("tool data is gated by AI and Automations context keys", () => {
    const automationService = new FakeAutomationService();
    const configurationService = createConfigurationService();
    const runData = new RunAutomationTool(
      automationService,
      new RecordingAutomationRunner(automationService),
      configurationService
    ).getToolData();
    const listData = new ListAutomationsTool(automationService, configurationService).getToolData();
    const deleteData = new DeleteAutomationTool(automationService, configurationService).getToolData();
    const configureData = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      configurationService
    ).getToolData();
    const serialize = (tool) => tool.when?.serialize() ?? "";
    assert.deepStrictEqual([listData, configureData, runData, deleteData].map((tool) => ({
      id: tool.id,
      referenceName: tool.toolReferenceName,
      aiEnabledGate: serialize(tool).includes(ChatContextKeys.enabled.key),
      automationsEnabledGate: serialize(tool).includes(ChatAutomationsEnabledContext.key),
      runsInWorkspace: tool.runsInWorkspace
    })), [
      {
        id: ListAutomationsToolId,
        referenceName: "listAutomations",
        aiEnabledGate: true,
        automationsEnabledGate: true,
        runsInWorkspace: false
      },
      {
        id: ConfigureAutomationToolId,
        referenceName: "configureAutomation",
        aiEnabledGate: true,
        automationsEnabledGate: true,
        runsInWorkspace: false
      },
      {
        id: RunAutomationToolId,
        referenceName: "runAutomation",
        aiEnabledGate: true,
        automationsEnabledGate: true,
        runsInWorkspace: false
      },
      {
        id: DeleteAutomationToolId,
        referenceName: "deleteAutomation",
        aiEnabledGate: true,
        automationsEnabledGate: true,
        runsInWorkspace: false
      }
    ]);
  });
  test("listAutomations returns stable IDs and editable fields", async () => {
    const automation = createAutomation();
    const tool = new ListAutomationsTool(new FakeAutomationService([automation]), createConfigurationService());
    const result = await invoke(tool, {});
    assert.deepStrictEqual(JSON.parse(getText(result)), {
      automations: [{
        id: "automation-1",
        name: "Daily review",
        prompt: "Review the repository",
        schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
        target: {
          kind: "workspace",
          folderUri: "file:///workspace",
          providerId: "local-agent-host",
          sessionTypeId: "copilot",
          isolation: { kind: "default" }
        },
        modelId: "gpt-test",
        mode: "agent",
        permissionLevel: "default",
        enabled: true,
        createdAt: NOW,
        updatedAt: NOW,
        lastRunAt: null,
        nextRunAt: "2026-01-02T09:00:00.000Z"
      }]
    });
  });
  test("runAutomation confirms and starts a manual run", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const runner = new RecordingAutomationRunner(automationService);
    const tool = new RunAutomationTool(automationService, runner, createConfigurationService());
    const parameters = { automationId: automation.id };
    const invocationCancellation = new CancellationTokenSource();
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "call-1",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const message = prepared.confirmationMessages?.message;
    const result = await invoke(tool, parameters, SESSION_RESOURCE, invocationCancellation.token);
    invocationCancellation.cancel();
    const runTokenCancelledAfterDispatch = runner.tokens[0]?.isCancellationRequested;
    invocationCancellation.dispose();
    assert.deepStrictEqual({
      confirmationTitle: prepared.confirmationMessages?.title,
      confirmationMessage: typeof message === "string" ? message : message?.value,
      calls: runner.calls,
      runTokenCancelledAfterDispatch,
      result: JSON.parse(getText(result))
    }, {
      confirmationTitle: "Run Automation?",
      confirmationMessage: "Run **Daily review** (`automation-1`) now? This starts a new agent session using the automation's configured prompt and permissions.",
      calls: [{
        automationId: "automation-1",
        trigger: "manual",
        leaderWindowId: 0,
        cancelled: false
      }],
      runTokenCancelledAfterDispatch: false,
      result: {
        status: "started",
        automation: { id: "automation-1", name: "Daily review" },
        run: {
          id: "run-1",
          status: "running",
          sessionResource: SESSION_RESOURCE.toString()
        }
      }
    });
  });
  test("runAutomation reports the active run when the runner declines to claim it", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    automationService.addRun({
      id: "active-run",
      automationId: automation.id,
      status: "running",
      trigger: "manual",
      sessionResource: SESSION_RESOURCE,
      startedAt: NOW,
      leaderWindowId: 0
    });
    const runner = new RecordingAutomationRunner(automationService);
    const tool = new RunAutomationTool(automationService, runner, createConfigurationService());
    const parameters = { automationId: automation.id };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "call-1",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const result = await invoke(tool, parameters);
    assert.deepStrictEqual({
      confirmation: prepared.confirmationMessages,
      // The runner owns the claim, so the tool still dispatches and lets it decline.
      runsCreated: automationService.runs.get().length,
      result: JSON.parse(getText(result))
    }, {
      confirmation: void 0,
      runsCreated: 1,
      result: {
        status: "already_running",
        automation: { id: "automation-1", name: "Daily review" },
        run: {
          id: "active-run",
          status: "running",
          sessionResource: SESSION_RESOURCE.toString()
        }
      }
    });
  });
  test("runAutomation reports when dispatch does not start a run", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const runner = new RecordingAutomationRunner(automationService);
    runner.notStarted = { kind: "notStarted", reason: "targetUnavailable" };
    const tool = new RunAutomationTool(automationService, runner, createConfigurationService());
    const result = await invoke(tool, { automationId: automation.id });
    assert.deepStrictEqual({
      error: result.toolResultError,
      calls: runner.calls.length
    }, {
      error: 'Automation "automation-1" did not start. Its configured agent is unavailable.',
      calls: 1
    });
  });
  test("deleteAutomation provides Delete and Cancel confirmation options", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const parameters = { automationId: automation.id };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "call-1",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const message = prepared?.confirmationMessages?.message;
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, "delete");
    assert.deepStrictEqual({
      confirmationTitle: prepared?.confirmationMessages?.title,
      confirmationMessage: typeof message === "string" ? message : message?.value,
      allowAutoConfirm: prepared?.confirmationMessages?.allowAutoConfirm,
      options: prepared?.confirmationMessages?.customOptions,
      deleted: automationService.deleted,
      automations: automationService.automations.get(),
      result: JSON.parse(getText(result))
    }, {
      confirmationTitle: "Delete Automation?",
      confirmationMessage: "Delete **Daily review** (`automation-1`)? Its saved configuration and run history will be permanently removed. Runs already in flight will continue.",
      allowAutoConfirm: void 0,
      options: [
        { id: "delete", label: "Delete", kind: ConfirmationOptionKind.Approve },
        { id: "cancel", label: "Cancel", kind: ConfirmationOptionKind.Deny }
      ],
      deleted: ["automation-1"],
      automations: [],
      result: {
        status: "deleted",
        automation: { id: "automation-1", name: "Daily review" }
      }
    });
  });
  test("deleteAutomation rejects stale IDs before confirmation", async () => {
    const automationService = new FakeAutomationService();
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const parameters = { automationId: "missing" };
    await assert.rejects(
      tool.prepareToolInvocation({
        parameters,
        toolCallId: "call-1",
        chatSessionResource: SESSION_RESOURCE
      }, CancellationToken.None),
      /Automation "missing" does not exist/
    );
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, "delete");
    assert.deepStrictEqual({
      error: result.toolResultError,
      deleted: automationService.deleted
    }, {
      error: 'Automation "missing" does not exist. Call listAutomations to refresh the available IDs.',
      deleted: []
    });
  });
  test("deleteAutomation Cancel option makes no changes", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const result = await invoke(tool, { automationId: automation.id }, SESSION_RESOURCE, CancellationToken.None, "cancel");
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      deleted: automationService.deleted,
      automations: automationService.automations.get()
    }, {
      result: {
        status: "cancelled",
        message: "The automation was not deleted."
      },
      deleted: [],
      automations: [automation]
    });
  });
  test("deleteAutomation runs without a custom button after approval", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const result = await invoke(
      tool,
      { automationId: automation.id },
      SESSION_RESOURCE,
      CancellationToken.None
    );
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      deleted: automationService.deleted,
      automations: automationService.automations.get()
    }, {
      result: {
        status: "deleted",
        automation: { id: automation.id, name: automation.name }
      },
      deleted: [automation.id],
      automations: []
    });
  });
  test("deleteAutomation cancellation makes no changes", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const tokenSource = new CancellationTokenSource();
    tokenSource.cancel();
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const result = await invoke(tool, { automationId: automation.id }, SESSION_RESOURCE, tokenSource.token, "delete");
    tokenSource.dispose();
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      deleted: automationService.deleted,
      automations: automationService.automations.get()
    }, {
      result: {
        status: "cancelled",
        message: "The automation was not deleted."
      },
      deleted: [],
      automations: [automation]
    });
  });
  test("configureAutomation prepares normal create and update confirmations", async () => {
    const existing = createAutomation();
    const tool = new ConfigureAutomationTool(
      new FakeAutomationService([existing]),
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      createConfigurationService()
    );
    const createPrepared = await tool.prepareToolInvocation({
      parameters: {
        name: "Morning review",
        prompt: "Review open pull requests",
        schedule: { interval: "daily" }
      },
      toolCallId: "create-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const updatePrepared = await tool.prepareToolInvocation({
      parameters: { automationId: existing.id, name: "Updated review" },
      toolCallId: "update-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    assert.deepStrictEqual({
      create: {
        title: createPrepared.confirmationMessages?.title,
        message: typeof createPrepared.confirmationMessages?.message === "string" ? createPrepared.confirmationMessages.message : createPrepared.confirmationMessages?.message?.value,
        toolSpecificData: createPrepared.toolSpecificData
      },
      update: {
        title: updatePrepared.confirmationMessages?.title,
        message: typeof updatePrepared.confirmationMessages?.message === "string" ? updatePrepared.confirmationMessages.message : updatePrepared.confirmationMessages?.message?.value,
        expectedId: updatePrepared.toolSpecificData?.kind === "automationConfiguration" ? updatePrepared.toolSpecificData.expectedAutomationId : void 0
      }
    }, {
      create: {
        title: "Create Automation?",
        message: "Create the automation **Morning review**?",
        toolSpecificData: void 0
      },
      update: {
        title: "Update Automation?",
        message: "Apply the proposed changes to **Daily review** (`automation-1`)?",
        expectedId: existing.id
      }
    });
  });
  test("configureAutomation creates from the invoking chat target and returns clickable result data", async () => {
    const automationService = new FakeAutomationService();
    const target = {
      kind: "quickChat",
      providerId: "local-agent-host",
      sessionTypeId: "copilot"
    };
    const schedule = { interval: "daily", scheduleHour: 8, scheduleMinute: 30, scheduleDay: 1 };
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ quickChat: true }), true),
      createConfigurationService()
    );
    const result = await invoke(tool, {
      name: "Morning review",
      prompt: "Review open pull requests",
      schedule: { interval: "daily", scheduleHour: 8, scheduleMinute: 30 },
      enabled: true
    }, CHAT_RESOURCE);
    assert.deepStrictEqual({
      created: automationService.created,
      status: JSON.parse(getText(result)).status,
      toolSpecificData: result.toolSpecificData
    }, {
      created: [{
        name: "Morning review",
        prompt: "Review open pull requests",
        schedule,
        target,
        enabled: true
      }],
      status: "created",
      toolSpecificData: {
        kind: "automationConfigured",
        automationId: "created-automation",
        automationName: "Morning review",
        operation: "created"
      }
    });
  });
  test("configureAutomation applies a partial guarded update and returns clickable result data", async () => {
    const existing = createAutomation();
    const automationService = new FakeAutomationService([existing]);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      createConfigurationService()
    );
    const parameters = {
      automationId: existing.id,
      name: "Updated review",
      schedule: { scheduleMinute: 45 },
      modelId: null,
      mode: null,
      permissionLevel: null
    };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "update-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, void 0, prepared.toolSpecificData);
    assert.deepStrictEqual({
      updated: automationService.updated,
      status: JSON.parse(getText(result)).status,
      toolSpecificData: result.toolSpecificData
    }, {
      updated: [{
        id: existing.id,
        patch: {
          name: "Updated review",
          schedule: { ...existing.schedule, scheduleMinute: 45 },
          modelId: null,
          mode: null,
          permissionLevel: null
        }
      }],
      status: "updated",
      toolSpecificData: {
        kind: "automationConfigured",
        automationId: existing.id,
        automationName: "Updated review",
        operation: "updated"
      }
    });
  });
  test("configureAutomation rejects editable changes made while awaiting approval", async () => {
    const existing = createAutomation();
    const automationService = new FakeAutomationService([existing]);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      createConfigurationService()
    );
    const parameters = { automationId: existing.id, name: "Proposed name" };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "update-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    automationService.automations.set([
      { ...existing, prompt: "Changed in another window", updatedAt: "2026-01-01T00:01:00.000Z" }
    ], void 0);
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, void 0, prepared.toolSpecificData);
    assert.deepStrictEqual({
      error: result.toolResultError,
      updated: automationService.updated
    }, {
      error: 'Automation "automation-1" changed before the update was applied. Call listAutomations to refresh it before proposing new changes. No changes were made.',
      updated: []
    });
  });
  test("configureAutomation permits runtime metadata changes while awaiting approval", async () => {
    const existing = createAutomation();
    const automationService = new FakeAutomationService([existing]);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      createConfigurationService()
    );
    const parameters = { automationId: existing.id, name: "Proposed name" };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "update-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    automationService.automations.set([{
      ...existing,
      updatedAt: "2026-01-01T00:01:00.000Z",
      lastRunAt: "2026-01-01T00:01:00.000Z",
      nextRunAt: "2026-01-02T09:00:00.000Z"
    }], void 0);
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, void 0, prepared.toolSpecificData);
    assert.deepStrictEqual({
      status: JSON.parse(getText(result)).status,
      updated: automationService.updated
    }, {
      status: "updated",
      updated: [{ id: existing.id, patch: { name: "Proposed name" } }]
    });
  });
  test("configureAutomation validates explicit targets before writing", async () => {
    const automationService = new FakeAutomationService();
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(
        void 0,
        false,
        [providerSessionType("local-agent-host", "copilot", false)]
      ),
      createConfigurationService()
    );
    const result = await invoke(tool, {
      name: "Invalid worktree",
      prompt: "Do not save",
      schedule: { interval: "manual" },
      target: {
        kind: "workspace",
        folderUri: FOLDER.toString(),
        providerId: "local-agent-host",
        sessionTypeId: "copilot",
        isolation: "worktree",
        branch: "main"
      }
    });
    assert.deepStrictEqual({
      error: result.toolResultError,
      created: automationService.created
    }, {
      error: 'Session type "copilot" does not support worktree isolation.',
      created: []
    });
  });
  test("configureAutomation rechecks cancellation immediately before writing", async () => {
    const automationService = new FakeAutomationService();
    const tokenSource = new CancellationTokenSource();
    tokenSource.cancel();
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      createConfigurationService()
    );
    const result = await invoke(tool, {
      name: "Cancelled",
      prompt: "Do not save",
      schedule: { interval: "manual" }
    }, SESSION_RESOURCE, tokenSource.token);
    tokenSource.dispose();
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      created: automationService.created
    }, {
      result: {
        status: "cancelled",
        message: "The automation change was cancelled. No changes were made."
      },
      created: []
    });
  });
  test("configureAutomation rechecks the feature setting immediately before writing", async () => {
    const automationService = new FakeAutomationService();
    const configurationService = createConfigurationService();
    const sessionsManagementService = new FakeSessionsManagementService(
      void 0,
      false,
      [providerSessionType("local-agent-host", "copilot")]
    );
    sessionsManagementService.beforeGetFolderSessionTypes = () => configurationService.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, false);
    const tool = new ConfigureAutomationTool(automationService, sessionsManagementService, configurationService);
    const result = await invoke(tool, {
      name: "Disabled",
      prompt: "Do not save",
      schedule: { interval: "manual" },
      target: {
        kind: "workspace",
        folderUri: FOLDER.toString(),
        providerId: "local-agent-host",
        sessionTypeId: "copilot",
        isolation: "default"
      }
    });
    assert.deepStrictEqual({
      error: result.toolResultError,
      created: automationService.created
    }, {
      error: "Automations are disabled.",
      created: []
    });
  });
  test("configureAutomation cancellation during an authoritative read makes no changes", async () => {
    const automationStorageService = new ControllableAutomationStorageService(void 0);
    const readBarrier = new DeferredPromise();
    automationStorageService.readBarrier = readBarrier;
    const automationService = createStorageBackedService(void 0, automationStorageService);
    const tokenSource = teardown.add(new CancellationTokenSource());
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      createConfigurationService()
    );
    const resultPromise = invoke(tool, {
      name: "Cancelled",
      prompt: "Do not save",
      schedule: { interval: "manual" }
    }, SESSION_RESOURCE, tokenSource.token);
    await automationStorageService.readStarted.p;
    tokenSource.cancel();
    await readBarrier.complete();
    const result = await resultPromise;
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      compareAndSwapCalls: automationStorageService.compareAndSwapCalls,
      automations: automationService.automations.get()
    }, {
      result: {
        status: "cancelled",
        message: "The automation change was cancelled. No changes were made."
      },
      compareAndSwapCalls: 0,
      automations: []
    });
  });
  test("deleteAutomation cancellation during an authoritative read makes no changes", async () => {
    const automation = createAutomation();
    const raw = serializeAutomationLedger([automation]);
    const automationStorageService = new ControllableAutomationStorageService(raw);
    const readBarrier = new DeferredPromise();
    automationStorageService.readBarrier = readBarrier;
    const automationService = createStorageBackedService(raw, automationStorageService);
    const tokenSource = teardown.add(new CancellationTokenSource());
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const resultPromise = invoke(tool, { automationId: automation.id }, SESSION_RESOURCE, tokenSource.token, "delete");
    await automationStorageService.readStarted.p;
    tokenSource.cancel();
    await readBarrier.complete();
    const result = await resultPromise;
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      compareAndSwapCalls: automationStorageService.compareAndSwapCalls,
      automationIds: automationService.automations.get().map((candidate) => candidate.id)
    }, {
      result: {
        status: "cancelled",
        message: "The automation was not deleted."
      },
      compareAndSwapCalls: 0,
      automationIds: [automation.id]
    });
  });
  test("configureAutomation disablement during a CAS conflict stops before retrying", async () => {
    const automation = createAutomation();
    const raw = serializeAutomationLedger([automation]);
    const automationStorageService = new ControllableAutomationStorageService(raw);
    automationStorageService.nextConflictValue = serializeAutomationLedger([automation], 2);
    const configurationService = createConfigurationService();
    automationStorageService.beforeCompareAndSwap = () => configurationService.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, false);
    const automationService = createStorageBackedService(raw, automationStorageService);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      configurationService
    );
    const result = await invoke(tool, { automationId: automation.id, name: "Must not commit" });
    assert.deepStrictEqual({
      error: result.toolResultError,
      compareAndSwapCalls: automationStorageService.compareAndSwapCalls,
      automationName: automationService.getAutomation(automation.id)?.name
    }, {
      error: "Automations are disabled.",
      compareAndSwapCalls: 1,
      automationName: automation.name
    });
  });
  test("configureAutomation reports success when cancellation crosses a committed CAS boundary", async () => {
    const automationStorageService = new ControllableAutomationStorageService(void 0);
    const tokenSource = teardown.add(new CancellationTokenSource());
    automationStorageService.beforeCompareAndSwap = () => tokenSource.cancel();
    const automationService = createStorageBackedService(void 0, automationStorageService);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      createConfigurationService()
    );
    const result = await invoke(tool, {
      name: "Committed",
      prompt: "Save once CAS starts",
      schedule: { interval: "manual" }
    }, SESSION_RESOURCE, tokenSource.token);
    const persisted = JSON.parse(automationStorageService.value);
    assert.deepStrictEqual({
      status: JSON.parse(getText(result)).status,
      cancelled: tokenSource.token.isCancellationRequested,
      compareAndSwapCalls: automationStorageService.compareAndSwapCalls,
      inMemoryNames: automationService.automations.get().map((automation) => automation.name),
      persistedNames: persisted.automations.map((automation) => automation.name)
    }, {
      status: "created",
      cancelled: true,
      compareAndSwapCalls: 1,
      inMemoryNames: ["Committed"],
      persistedNames: ["Committed"]
    });
  });
  test("configureAutomation rejects stale IDs and malformed targets", async () => {
    const tool = new ConfigureAutomationTool(
      new FakeAutomationService(),
      new FakeSessionsManagementService(void 0),
      createConfigurationService()
    );
    const staleResult = await invoke(tool, { automationId: "missing", name: "Updated" });
    const malformedTargetResult = await invoke(tool, {
      name: "Invalid target",
      prompt: "Do not save",
      schedule: { interval: "weekly" },
      target: {
        kind: "workspace",
        folderUri: "not-an-absolute-uri",
        isolation: "worktree",
        branch: "main"
      }
    });
    assert.deepStrictEqual({
      staleError: staleResult.toolResultError,
      targetError: malformedTargetResult.toolResultError
    }, {
      staleError: 'Automation "missing" does not exist. Call listAutomations to refresh the available IDs.',
      targetError: '"target.folderUri" must be a valid absolute URI.'
    });
  });
  test("disabled Automations cannot be listed, configured, run, or deleted", async () => {
    const automationService = new FakeAutomationService([createAutomation()]);
    const configurationService = createConfigurationService(false);
    const runner = new RecordingAutomationRunner(automationService);
    const listResult = await invoke(new ListAutomationsTool(automationService, configurationService), {});
    const configureResult = await invoke(new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      configurationService
    ), {
      name: "Disabled",
      prompt: "Do not save",
      schedule: { interval: "manual" }
    });
    const runResult = await invoke(
      new RunAutomationTool(automationService, runner, configurationService),
      { automationId: "automation-1" }
    );
    const deleteResult = await invoke(
      new DeleteAutomationTool(automationService, configurationService),
      { automationId: "automation-1" },
      SESSION_RESOURCE,
      CancellationToken.None,
      "delete"
    );
    assert.deepStrictEqual({
      listError: listResult.toolResultError,
      configureError: configureResult.toolResultError,
      runError: runResult.toolResultError,
      deleteError: deleteResult.toolResultError,
      runCalls: runner.calls,
      deleted: automationService.deleted
    }, {
      listError: "Automations are disabled.",
      configureError: "Automations are disabled.",
      runError: "Automations are disabled.",
      deleteError: "Automations are disabled.",
      runCalls: [],
      deleted: []
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXHRlc3RcXGJyb3dzZXJcXGF1dG9tYXRpb25Ub29scy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jaywgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbmZpcm1hdGlvbk9wdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLWNoYXQvc3RhdGUuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uUnVuVHJpZ2dlciwgQXV0b21hdGlvblRhcmdldCwgSUF1dG9tYXRpb25EZXNjcmlwdG9yLCBJQXV0b21hdGlvblJ1biwgSUF1dG9tYXRpb25TY2hlZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb24uanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25SdW5EaXNwYXRjaCwgSUF1dG9tYXRpb25SdW5uZXIsIElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblJ1bm5lci5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblNlcnZpY2UsIElDcmVhdGVBdXRvbWF0aW9uT3B0aW9ucywgSUd1YXJkZWRBdXRvbWF0aW9uVXBkYXRlUmVzdWx0LCBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dCwgQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uc0VuYWJsZWQuanMnO1xuaW1wb3J0IHsgSVRvb2xJbXBsLCBJVG9vbEludm9jYXRpb24sIElUb29sUmVzdWx0LCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0LCBJU2Vzc2lvbiwgSVNlc3Npb25UeXBlLCBJU2Vzc2lvbldvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElQcm92aWRlclNlc3Npb25UeXBlLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sLCBDb25maWd1cmVBdXRvbWF0aW9uVG9vbElkLCBEZWxldGVBdXRvbWF0aW9uVG9vbCwgRGVsZXRlQXV0b21hdGlvblRvb2xJZCwgTGlzdEF1dG9tYXRpb25zVG9vbCwgTGlzdEF1dG9tYXRpb25zVG9vbElkLCBSdW5BdXRvbWF0aW9uVG9vbCwgUnVuQXV0b21hdGlvblRvb2xJZCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYXV0b21hdGlvblRvb2xzLmpzJztcbmltcG9ydCB7IEFVVE9NQVRJT05fU1RPUkFHRV9LRVksIElBdXRvbWF0aW9uU3RvcmFnZUNvbXBhcmVBbmRTd2FwUmVzdWx0LCBJQXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2F1dG9tYXRpb25TdG9yYWdlU2VydmljZS5qcyc7XG5cbmNvbnN0IEZPTERFUiA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UnKTtcbmNvbnN0IFNFU1NJT05fUkVTT1VSQ0UgPSBVUkkucGFyc2UoJ2FnZW50LXNlc3Npb246Ly9sb2NhbC9zZXNzaW9uJyk7XG5jb25zdCBDSEFUX1JFU09VUkNFID0gVVJJLnBhcnNlKCdhZ2VudC1jaGF0Oi8vbG9jYWwvY2hhdCcpO1xuY29uc3QgTk9XID0gJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWic7XG5jb25zdCBwcm9ncmVzczogVG9vbFByb2dyZXNzID0geyByZXBvcnQ6ICgpID0+IHsgfSB9O1xuXG5mdW5jdGlvbiBjcmVhdGVBdXRvbWF0aW9uKG92ZXJyaWRlcz86IFBhcnRpYWw8SUF1dG9tYXRpb25EZXNjcmlwdG9yPik6IElBdXRvbWF0aW9uRGVzY3JpcHRvciB7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdG5hbWU6ICdEYWlseSByZXZpZXcnLFxuXHRcdHByb21wdDogJ1JldmlldyB0aGUgcmVwb3NpdG9yeScsXG5cdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogOSwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAxIH0sXG5cdFx0dGFyZ2V0OiB7XG5cdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdGZvbGRlclVyaTogRk9MREVSLFxuXHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdFx0c2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QnLFxuXHRcdFx0aXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9LFxuXHRcdH0sXG5cdFx0bW9kZWxJZDogJ2dwdC10ZXN0Jyxcblx0XHRtb2RlOiAnYWdlbnQnLFxuXHRcdHBlcm1pc3Npb25MZXZlbDogJ2RlZmF1bHQnLFxuXHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0Y3JlYXRlZEF0OiBOT1csXG5cdFx0dXBkYXRlZEF0OiBOT1csXG5cdFx0bmV4dFJ1bkF0OiAnMjAyNi0wMS0wMlQwOTowMDowMC4wMDBaJyxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmNsYXNzIEZha2VBdXRvbWF0aW9uU2VydmljZSBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25TZXJ2aWNlPigpIHtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgYXV0b21hdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUF1dG9tYXRpb25EZXNjcmlwdG9yW10+KHRoaXMsIFtdKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgcnVucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPih0aGlzLCBbXSk7XG5cdHJlYWRvbmx5IGNyZWF0ZWQ6IElDcmVhdGVBdXRvbWF0aW9uT3B0aW9uc1tdID0gW107XG5cdHJlYWRvbmx5IHVwZGF0ZWQ6IEFycmF5PHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyB9PiA9IFtdO1xuXHRyZWFkb25seSBkZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKGF1dG9tYXRpb25zOiByZWFkb25seSBJQXV0b21hdGlvbkRlc2NyaXB0b3JbXSA9IFtdKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmF1dG9tYXRpb25zLnNldChhdXRvbWF0aW9ucywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEF1dG9tYXRpb24oaWQ6IHN0cmluZyk6IElBdXRvbWF0aW9uRGVzY3JpcHRvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYXV0b21hdGlvbnMuZ2V0KCkuZmluZChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQgPT09IGlkKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bnNGb3IoYXV0b21hdGlvbklkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKHRoaXMucnVucy5nZXQoKS5maWx0ZXIocnVuID0+IHJ1bi5hdXRvbWF0aW9uSWQgPT09IGF1dG9tYXRpb25JZCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QWN0aXZlUnVuRm9yKGF1dG9tYXRpb25JZDogc3RyaW5nKTogSUF1dG9tYXRpb25SdW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnJ1bnMuZ2V0KCkuZmluZChydW4gPT4gcnVuLmF1dG9tYXRpb25JZCA9PT0gYXV0b21hdGlvbklkICYmIChydW4uc3RhdHVzID09PSAncGVuZGluZycgfHwgcnVuLnN0YXR1cyA9PT0gJ3J1bm5pbmcnKSk7XG5cdH1cblxuXHRhZGRSdW4ocnVuOiBJQXV0b21hdGlvblJ1bik6IHZvaWQge1xuXHRcdHRoaXMucnVucy5zZXQoW3J1biwgLi4udGhpcy5ydW5zLmdldCgpXSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUF1dG9tYXRpb24ob3B0aW9uczogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zKTogUHJvbWlzZTxJQXV0b21hdGlvbkRlc2NyaXB0b3I+IHtcblx0XHR0aGlzLmNyZWF0ZWQucHVzaChvcHRpb25zKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGlkOiAnY3JlYXRlZC1hdXRvbWF0aW9uJyxcblx0XHRcdGVuYWJsZWQ6IG9wdGlvbnMuZW5hYmxlZCA/PyB0cnVlLFxuXHRcdFx0Y3JlYXRlZEF0OiBOT1csXG5cdFx0XHR1cGRhdGVkQXQ6IE5PVyxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgdXBkYXRlQXV0b21hdGlvbihpZDogc3RyaW5nLCBwYXRjaDogSVVwZGF0ZUF1dG9tYXRpb25PcHRpb25zKTogUHJvbWlzZTxJQXV0b21hdGlvbkRlc2NyaXB0b3I+IHtcblx0XHR0aGlzLnVwZGF0ZWQucHVzaCh7IGlkLCBwYXRjaCB9KTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuZ2V0QXV0b21hdGlvbihpZCk7XG5cdFx0YXNzZXJ0Lm9rKGV4aXN0aW5nKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uZXhpc3RpbmcsXG5cdFx0XHRuYW1lOiBwYXRjaC5uYW1lID8/IGV4aXN0aW5nLm5hbWUsXG5cdFx0XHRwcm9tcHQ6IHBhdGNoLnByb21wdCA/PyBleGlzdGluZy5wcm9tcHQsXG5cdFx0XHRzY2hlZHVsZTogcGF0Y2guc2NoZWR1bGUgPz8gZXhpc3Rpbmcuc2NoZWR1bGUsXG5cdFx0XHR0YXJnZXQ6IHBhdGNoLnRhcmdldCA/PyBleGlzdGluZy50YXJnZXQsXG5cdFx0XHRtb2RlbElkOiBwYXRjaC5tb2RlbElkID09PSBudWxsID8gdW5kZWZpbmVkIDogcGF0Y2gubW9kZWxJZCA/PyBleGlzdGluZy5tb2RlbElkLFxuXHRcdFx0bW9kZTogcGF0Y2gubW9kZSA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IHBhdGNoLm1vZGUgPz8gZXhpc3RpbmcubW9kZSxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogcGF0Y2gucGVybWlzc2lvbkxldmVsID09PSBudWxsID8gdW5kZWZpbmVkIDogcGF0Y2gucGVybWlzc2lvbkxldmVsID8/IGV4aXN0aW5nLnBlcm1pc3Npb25MZXZlbCxcblx0XHRcdGVuYWJsZWQ6IHBhdGNoLmVuYWJsZWQgPz8gZXhpc3RpbmcuZW5hYmxlZCxcblx0XHRcdHVwZGF0ZWRBdDogTk9XLFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyB1cGRhdGVBdXRvbWF0aW9uSWZVbmNoYW5nZWQoaWQ6IHN0cmluZywgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucywgZXhwZWN0ZWQ6IElBdXRvbWF0aW9uRGVzY3JpcHRvcik6IFByb21pc2U8SUd1YXJkZWRBdXRvbWF0aW9uVXBkYXRlUmVzdWx0PiB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuZ2V0QXV0b21hdGlvbihpZCk7XG5cdFx0aWYgKCFjdXJyZW50IHx8IGVkaXRhYmxlQXV0b21hdGlvbktleShjdXJyZW50KSAhPT0gZWRpdGFibGVBdXRvbWF0aW9uS2V5KGV4cGVjdGVkKSkge1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ2NvbmZsaWN0JywgY3VycmVudCB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBraW5kOiAndXBkYXRlZCcsIGF1dG9tYXRpb246IGF3YWl0IHRoaXMudXBkYXRlQXV0b21hdGlvbihpZCwgcGF0Y2gpIH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBkZWxldGVBdXRvbWF0aW9uKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRlbGV0ZWQucHVzaChpZCk7XG5cdFx0dGhpcy5hdXRvbWF0aW9ucy5zZXQodGhpcy5hdXRvbWF0aW9ucy5nZXQoKS5maWx0ZXIoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkICE9PSBpZCksIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nQXV0b21hdGlvblJ1bm5lciBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25SdW5uZXI+KCkge1xuXHRyZWFkb25seSBjYWxsczogQXJyYXk8e1xuXHRcdHJlYWRvbmx5IGF1dG9tYXRpb25JZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyO1xuXHRcdHJlYWRvbmx5IGxlYWRlcldpbmRvd0lkOiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgY2FuY2VsbGVkOiBib29sZWFuO1xuXHR9PiA9IFtdO1xuXHRyZWFkb25seSB0b2tlbnM6IENhbmNlbGxhdGlvblRva2VuW10gPSBbXTtcblx0d2hlbkRpc3BhdGNoZWQ6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0d2hlbkNvbXBsZXRlZDogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRydW5TdGF0dXM6IElBdXRvbWF0aW9uUnVuWydzdGF0dXMnXSA9ICdydW5uaW5nJztcblx0LyoqIFdoZW4gc2V0LCBkaXNwYXRjaCByZXBvcnRzIHRoaXMgb3V0Y29tZSBpbnN0ZWFkIG9mIHN0YXJ0aW5nIGEgc2Vzc2lvbi4gKi9cblx0bm90U3RhcnRlZDogKElBdXRvbWF0aW9uUnVuRGlzcGF0Y2ggJiB7IGtpbmQ6ICdub3RTdGFydGVkJyB9KSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBGYWtlQXV0b21hdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuT25jZShhdXRvbWF0aW9uOiBJQXV0b21hdGlvbkRlc2NyaXB0b3IsIHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyLCBsZWFkZXJXaW5kb3dJZDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogSUF1dG9tYXRpb25SdW5PcGVyYXRpb24ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCh7XG5cdFx0XHRhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQsXG5cdFx0XHR0cmlnZ2VyLFxuXHRcdFx0bGVhZGVyV2luZG93SWQsXG5cdFx0XHRjYW5jZWxsZWQ6IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLFxuXHRcdH0pO1xuXHRcdHRoaXMudG9rZW5zLnB1c2godG9rZW4pO1xuXHRcdGNvbnN0IHdoZW5EaXNwYXRjaGVkID0gdGhpcy53aGVuRGlzcGF0Y2hlZC50aGVuPElBdXRvbWF0aW9uUnVuRGlzcGF0Y2g+KCgpID0+IHtcblx0XHRcdC8vIE1pcnJvcnMgdGhlIHJlYWwgcnVubmVyOiB0aGUgYXRvbWljIGNsYWltIGRlY2lkZXMgd2hvIGdldHMgdG8gZGlzcGF0Y2guXG5cdFx0XHRjb25zdCBhY3RpdmVSdW4gPSB0aGlzLmF1dG9tYXRpb25TZXJ2aWNlLmdldEFjdGl2ZVJ1bkZvcihhdXRvbWF0aW9uLmlkKTtcblx0XHRcdGlmIChhY3RpdmVSdW4pIHtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2FscmVhZHlSdW5uaW5nJywgYWN0aXZlUnVuIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5ub3RTdGFydGVkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm5vdFN0YXJ0ZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBTRVNTSU9OX1JFU09VUkNFO1xuXHRcdFx0Y29uc3QgcnVuOiBJQXV0b21hdGlvblJ1biA9IHtcblx0XHRcdFx0aWQ6ICdydW4tMScsXG5cdFx0XHRcdGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCxcblx0XHRcdFx0c3RhdHVzOiB0aGlzLnJ1blN0YXR1cyxcblx0XHRcdFx0dHJpZ2dlcixcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRzdGFydGVkQXQ6IE5PVyxcblx0XHRcdFx0bGVhZGVyV2luZG93SWQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5hdXRvbWF0aW9uU2VydmljZS5hZGRSdW4ocnVuKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdzdGFydGVkJywgcnVuLCBzZXNzaW9uUmVzb3VyY2UgfTtcblx0XHR9KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d2hlbkRpc3BhdGNoZWQsXG5cdFx0XHR3aGVuQ29tcGxldGVkOiBQcm9taXNlLmFsbChbd2hlbkRpc3BhdGNoZWQsIHRoaXMud2hlbkNvbXBsZXRlZF0pLnRoZW4oKCkgPT4gdW5kZWZpbmVkKSxcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIENvbnRyb2xsYWJsZUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSBpbXBsZW1lbnRzIElBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHJlYWRTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRyZWFkQmFycmllcjogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRiZWZvcmVDb21wYXJlQW5kU3dhcDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRuZXh0Q29uZmxpY3RWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjb21wYXJlQW5kU3dhcENhbGxzID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGN1cnJlbnRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7IH1cblxuXHRnZXQgdmFsdWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50VmFsdWU7XG5cdH1cblxuXHRhc3luYyByZWFkKF9rZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0YXdhaXQgdGhpcy5yZWFkU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHRoaXMucmVhZEJhcnJpZXI/LnA7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudFZhbHVlO1xuXHR9XG5cblx0YXN5bmMgY29tcGFyZUFuZFN3YXAoX2tleTogc3RyaW5nLCBleHBlY3RlZFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsIG5ld1ZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPElBdXRvbWF0aW9uU3RvcmFnZUNvbXBhcmVBbmRTd2FwUmVzdWx0PiB7XG5cdFx0dGhpcy5jb21wYXJlQW5kU3dhcENhbGxzKys7XG5cdFx0dGhpcy5iZWZvcmVDb21wYXJlQW5kU3dhcD8uKCk7XG5cdFx0aWYgKHRoaXMubmV4dENvbmZsaWN0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgY3VycmVudFZhbHVlID0gdGhpcy5uZXh0Q29uZmxpY3RWYWx1ZTtcblx0XHRcdHRoaXMubmV4dENvbmZsaWN0VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmN1cnJlbnRWYWx1ZSA9IGN1cnJlbnRWYWx1ZTtcblx0XHRcdHJldHVybiB7IHN3YXBwZWQ6IGZhbHNlLCBjdXJyZW50VmFsdWUgfTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY3VycmVudFZhbHVlICE9PSBleHBlY3RlZFZhbHVlKSB7XG5cdFx0XHRyZXR1cm4geyBzd2FwcGVkOiBmYWxzZSwgY3VycmVudFZhbHVlOiB0aGlzLmN1cnJlbnRWYWx1ZSB9O1xuXHRcdH1cblx0XHR0aGlzLmN1cnJlbnRWYWx1ZSA9IG5ld1ZhbHVlO1xuXHRcdHJldHVybiB7IHN3YXBwZWQ6IHRydWUsIGN1cnJlbnRWYWx1ZTogbmV3VmFsdWUgfTtcblx0fVxufVxuXG5mdW5jdGlvbiBlZGl0YWJsZUF1dG9tYXRpb25LZXkoYXV0b21hdGlvbjogSUF1dG9tYXRpb25EZXNjcmlwdG9yKTogc3RyaW5nIHtcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHtcblx0XHRuYW1lOiBhdXRvbWF0aW9uLm5hbWUsXG5cdFx0cHJvbXB0OiBhdXRvbWF0aW9uLnByb21wdCxcblx0XHRzY2hlZHVsZTogYXV0b21hdGlvbi5zY2hlZHVsZSxcblx0XHR0YXJnZXQ6IGF1dG9tYXRpb24udGFyZ2V0LmtpbmQgPT09ICd3b3Jrc3BhY2UnXG5cdFx0XHQ/IHsgLi4uYXV0b21hdGlvbi50YXJnZXQsIGZvbGRlclVyaTogYXV0b21hdGlvbi50YXJnZXQuZm9sZGVyVXJpLnRvU3RyaW5nKCkgfVxuXHRcdFx0OiBhdXRvbWF0aW9uLnRhcmdldCxcblx0XHRtb2RlbElkOiBhdXRvbWF0aW9uLm1vZGVsSWQsXG5cdFx0bW9kZTogYXV0b21hdGlvbi5tb2RlLFxuXHRcdHBlcm1pc3Npb25MZXZlbDogYXV0b21hdGlvbi5wZXJtaXNzaW9uTGV2ZWwsXG5cdFx0ZW5hYmxlZDogYXV0b21hdGlvbi5lbmFibGVkLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplQXV0b21hdGlvbkxlZGdlcihhdXRvbWF0aW9uczogcmVhZG9ubHkgSUF1dG9tYXRpb25EZXNjcmlwdG9yW10sIHJldmlzaW9uID0gMSk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRyZXZpc2lvbixcblx0XHRhdXRvbWF0aW9uczogYXV0b21hdGlvbnMubWFwKGF1dG9tYXRpb24gPT4gKHtcblx0XHRcdC4uLmF1dG9tYXRpb24sXG5cdFx0XHR0YXJnZXQ6IGF1dG9tYXRpb24udGFyZ2V0LmtpbmQgPT09ICd3b3Jrc3BhY2UnXG5cdFx0XHRcdD8geyAuLi5hdXRvbWF0aW9uLnRhcmdldCwgZm9sZGVyVXJpOiBhdXRvbWF0aW9uLnRhcmdldC5mb2xkZXJVcmkudG9KU09OKCkgfVxuXHRcdFx0XHQ6IGF1dG9tYXRpb24udGFyZ2V0LFxuXHRcdH0pKSxcblx0XHRydW5zOiBbXSxcblx0fSk7XG59XG5cbmNsYXNzIEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdGJlZm9yZUdldEZvbGRlclNlc3Npb25UeXBlczogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZXNvbHZlRnJvbUNoYXRSZXNvdXJjZSA9IGZhbHNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZm9sZGVyU2Vzc2lvblR5cGVzOiByZWFkb25seSBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdID0gW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBxdWlja0NoYXRTZXNzaW9uVHlwZXM6IHJlYWRvbmx5IElQcm92aWRlclNlc3Npb25UeXBlW10gPSBbXSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFNlc3Npb24oKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnJlc29sdmVGcm9tQ2hhdFJlc291cmNlID8gdW5kZWZpbmVkIDogdGhpcy5zZXNzaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbkZvckNoYXRSZXNvdXJjZSgpOiB7IHNlc3Npb246IElTZXNzaW9uOyBjaGF0OiBJQ2hhdCB9IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRnJvbUNoYXRSZXNvdXJjZSAmJiB0aGlzLnNlc3Npb25cblx0XHRcdD8geyBzZXNzaW9uOiB0aGlzLnNlc3Npb24sIGNoYXQ6IHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHsgcmVzb3VyY2U6IENIQVRfUkVTT1VSQ0UgfSkgfVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoKTogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSB7XG5cdFx0dGhpcy5iZWZvcmVHZXRGb2xkZXJTZXNzaW9uVHlwZXM/LigpO1xuXHRcdHJldHVybiBbLi4udGhpcy5mb2xkZXJTZXNzaW9uVHlwZXNdO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzKCk6IElQcm92aWRlclNlc3Npb25UeXBlW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5xdWlja0NoYXRTZXNzaW9uVHlwZXNdO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKGVuYWJsZWQgPSB0cnVlKTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HLCBlbmFibGVkKTtcblx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uKG9wdGlvbnM/OiB7IHJlYWRvbmx5IHF1aWNrQ2hhdD86IGJvb2xlYW47IHJlYWRvbmx5IHdvcmtzcGFjZT86IFVSSSB9KTogSVNlc3Npb24ge1xuXHRjb25zdCB3b3Jrc3BhY2UgPSBvcHRpb25zPy53b3Jrc3BhY2UgPT09IHVuZGVmaW5lZFxuXHRcdD8gdW5kZWZpbmVkXG5cdFx0OiB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uV29ya3NwYWNlPih7IHVyaTogb3B0aW9ucy53b3Jrc3BhY2UgfSk7XG5cdHJldHVybiB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uPih7XG5cdFx0cmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdHNlc3Npb25UeXBlOiAnY29waWxvdCcsXG5cdFx0d29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUod29ya3NwYWNlKSxcblx0XHRpc1F1aWNrQ2hhdDogY29uc3RPYnNlcnZhYmxlKG9wdGlvbnM/LnF1aWNrQ2hhdCA9PT0gdHJ1ZSksXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBwcm92aWRlclNlc3Npb25UeXBlKHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvblR5cGVJZDogc3RyaW5nLCBzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbiA9IGZhbHNlKTogSVByb3ZpZGVyU2Vzc2lvblR5cGUge1xuXHRyZXR1cm4ge1xuXHRcdHByb3ZpZGVySWQsXG5cdFx0c2Vzc2lvblR5cGU6IHVwY2FzdFBhcnRpYWw8SVNlc3Npb25UeXBlPih7IGlkOiBzZXNzaW9uVHlwZUlkLCBzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbiB9KSxcblx0fTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW52b2tlKHRvb2w6IElUb29sSW1wbCwgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHNlc3Npb25SZXNvdXJjZSA9IFNFU1NJT05fUkVTT1VSQ0UsIHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgc2VsZWN0ZWRDdXN0b21CdXR0b24/OiBzdHJpbmcsIHRvb2xTcGVjaWZpY0RhdGE/OiBJVG9vbEludm9jYXRpb25bJ3Rvb2xTcGVjaWZpY0RhdGEnXSk6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0cmV0dXJuIHRvb2wuaW52b2tlKHtcblx0XHRjYWxsSWQ6ICdjYWxsLTEnLFxuXHRcdHRvb2xJZDogJ3Rvb2wtMScsXG5cdFx0cGFyYW1ldGVycyxcblx0XHRjb250ZXh0OiB7IHNlc3Npb25SZXNvdXJjZSB9LFxuXHRcdHNlbGVjdGVkQ3VzdG9tQnV0dG9uLFxuXHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdH0sIGFzeW5jICgpID0+IDAsIHByb2dyZXNzLCB0b2tlbik7XG59XG5cbmZ1bmN0aW9uIGdldFRleHQocmVzdWx0OiBJVG9vbFJlc3VsdCk6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnQgPSByZXN1bHQuY29udGVudFswXTtcblx0aWYgKCFwYXJ0IHx8IHBhcnQua2luZCAhPT0gJ3RleHQnKSB7XG5cdFx0YXNzZXJ0LmZhaWwoJ0V4cGVjdGVkIGEgdGV4dCB0b29sIHJlc3VsdC4nKTtcblx0fVxuXHRyZXR1cm4gcGFydC52YWx1ZTtcbn1cblxuc3VpdGUoJ0F1dG9tYXRpb25Ub29scycsICgpID0+IHtcblx0Y29uc3QgdGVhcmRvd24gPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTdG9yYWdlQmFja2VkU2VydmljZShyYXc6IHN0cmluZyB8IHVuZGVmaW5lZCwgYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlOiBJQXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlKTogQXV0b21hdGlvblNlcnZpY2Uge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGlmIChyYXcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgcmF3LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZWFyZG93bi5hZGQobmV3IEF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2VTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGF1dG9tYXRpb25TdG9yYWdlU2VydmljZSkpO1xuXHR9XG5cblx0dGVzdCgndG9vbCBkYXRhIGlzIGdhdGVkIGJ5IEFJIGFuZCBBdXRvbWF0aW9ucyBjb250ZXh0IGtleXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHJ1bkRhdGEgPSBuZXcgUnVuQXV0b21hdGlvblRvb2woXG5cdFx0XHRhdXRvbWF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBSZWNvcmRpbmdBdXRvbWF0aW9uUnVubmVyKGF1dG9tYXRpb25TZXJ2aWNlKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdCkuZ2V0VG9vbERhdGEoKTtcblx0XHRjb25zdCBsaXN0RGF0YSA9IG5ldyBMaXN0QXV0b21hdGlvbnNUb29sKGF1dG9tYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkuZ2V0VG9vbERhdGEoKTtcblx0XHRjb25zdCBkZWxldGVEYXRhID0gbmV3IERlbGV0ZUF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkuZ2V0VG9vbERhdGEoKTtcblx0XHRjb25zdCBjb25maWd1cmVEYXRhID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0YXV0b21hdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UodW5kZWZpbmVkKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdCkuZ2V0VG9vbERhdGEoKTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6ZSA9ICh0b29sOiB0eXBlb2YgbGlzdERhdGEpID0+IHRvb2wud2hlbj8uc2VyaWFsaXplKCkgPz8gJyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbbGlzdERhdGEsIGNvbmZpZ3VyZURhdGEsIHJ1bkRhdGEsIGRlbGV0ZURhdGFdLm1hcCh0b29sID0+ICh7XG5cdFx0XHRpZDogdG9vbC5pZCxcblx0XHRcdHJlZmVyZW5jZU5hbWU6IHRvb2wudG9vbFJlZmVyZW5jZU5hbWUsXG5cdFx0XHRhaUVuYWJsZWRHYXRlOiBzZXJpYWxpemUodG9vbCkuaW5jbHVkZXMoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQua2V5KSxcblx0XHRcdGF1dG9tYXRpb25zRW5hYmxlZEdhdGU6IHNlcmlhbGl6ZSh0b29sKS5pbmNsdWRlcyhDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dC5rZXkpLFxuXHRcdFx0cnVuc0luV29ya3NwYWNlOiB0b29sLnJ1bnNJbldvcmtzcGFjZSxcblx0XHR9KSksIFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IExpc3RBdXRvbWF0aW9uc1Rvb2xJZCxcblx0XHRcdFx0cmVmZXJlbmNlTmFtZTogJ2xpc3RBdXRvbWF0aW9ucycsXG5cdFx0XHRcdGFpRW5hYmxlZEdhdGU6IHRydWUsXG5cdFx0XHRcdGF1dG9tYXRpb25zRW5hYmxlZEdhdGU6IHRydWUsXG5cdFx0XHRcdHJ1bnNJbldvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogQ29uZmlndXJlQXV0b21hdGlvblRvb2xJZCxcblx0XHRcdFx0cmVmZXJlbmNlTmFtZTogJ2NvbmZpZ3VyZUF1dG9tYXRpb24nLFxuXHRcdFx0XHRhaUVuYWJsZWRHYXRlOiB0cnVlLFxuXHRcdFx0XHRhdXRvbWF0aW9uc0VuYWJsZWRHYXRlOiB0cnVlLFxuXHRcdFx0XHRydW5zSW5Xb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFJ1bkF1dG9tYXRpb25Ub29sSWQsXG5cdFx0XHRcdHJlZmVyZW5jZU5hbWU6ICdydW5BdXRvbWF0aW9uJyxcblx0XHRcdFx0YWlFbmFibGVkR2F0ZTogdHJ1ZSxcblx0XHRcdFx0YXV0b21hdGlvbnNFbmFibGVkR2F0ZTogdHJ1ZSxcblx0XHRcdFx0cnVuc0luV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBEZWxldGVBdXRvbWF0aW9uVG9vbElkLFxuXHRcdFx0XHRyZWZlcmVuY2VOYW1lOiAnZGVsZXRlQXV0b21hdGlvbicsXG5cdFx0XHRcdGFpRW5hYmxlZEdhdGU6IHRydWUsXG5cdFx0XHRcdGF1dG9tYXRpb25zRW5hYmxlZEdhdGU6IHRydWUsXG5cdFx0XHRcdHJ1bnNJbldvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0QXV0b21hdGlvbnMgcmV0dXJucyBzdGFibGUgSURzIGFuZCBlZGl0YWJsZSBmaWVsZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCB0b29sID0gbmV3IExpc3RBdXRvbWF0aW9uc1Rvb2wobmV3IEZha2VBdXRvbWF0aW9uU2VydmljZShbYXV0b21hdGlvbl0pLCBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKSwge1xuXHRcdFx0YXV0b21hdGlvbnM6IFt7XG5cdFx0XHRcdGlkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0bmFtZTogJ0RhaWx5IHJldmlldycsXG5cdFx0XHRcdHByb21wdDogJ1JldmlldyB0aGUgcmVwb3NpdG9yeScsXG5cdFx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnZGFpbHknLCBzY2hlZHVsZUhvdXI6IDksIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMSB9LFxuXHRcdFx0XHR0YXJnZXQ6IHtcblx0XHRcdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdFx0XHRmb2xkZXJVcmk6ICdmaWxlOi8vL3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Jyxcblx0XHRcdFx0XHRpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vZGVsSWQ6ICdncHQtdGVzdCcsXG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogJ2RlZmF1bHQnLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IE5PVyxcblx0XHRcdFx0dXBkYXRlZEF0OiBOT1csXG5cdFx0XHRcdGxhc3RSdW5BdDogbnVsbCxcblx0XHRcdFx0bmV4dFJ1bkF0OiAnMjAyNi0wMS0wMlQwOTowMDowMC4wMDBaJyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5BdXRvbWF0aW9uIGNvbmZpcm1zIGFuZCBzdGFydHMgYSBtYW51YWwgcnVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBjcmVhdGVBdXRvbWF0aW9uKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKFthdXRvbWF0aW9uXSk7XG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IFJlY29yZGluZ0F1dG9tYXRpb25SdW5uZXIoYXV0b21hdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgUnVuQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIHJ1bm5lciwgY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkIH07XG5cdFx0Y29uc3QgaW52b2NhdGlvbkNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbiEoe1xuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLTEnLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogU0VTU0lPTl9SRVNPVVJDRSxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBtZXNzYWdlID0gcHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2U7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHBhcmFtZXRlcnMsIFNFU1NJT05fUkVTT1VSQ0UsIGludm9jYXRpb25DYW5jZWxsYXRpb24udG9rZW4pO1xuXHRcdGludm9jYXRpb25DYW5jZWxsYXRpb24uY2FuY2VsKCk7XG5cdFx0Y29uc3QgcnVuVG9rZW5DYW5jZWxsZWRBZnRlckRpc3BhdGNoID0gcnVubmVyLnRva2Vuc1swXT8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdFx0aW52b2NhdGlvbkNhbmNlbGxhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiBwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlOiB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogbWVzc2FnZT8udmFsdWUsXG5cdFx0XHRjYWxsczogcnVubmVyLmNhbGxzLFxuXHRcdFx0cnVuVG9rZW5DYW5jZWxsZWRBZnRlckRpc3BhdGNoLFxuXHRcdFx0cmVzdWx0OiBKU09OLnBhcnNlKGdldFRleHQocmVzdWx0KSksXG5cdFx0fSwge1xuXHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gQXV0b21hdGlvbj8nLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZTogJ1J1biAqKkRhaWx5IHJldmlldyoqIChgYXV0b21hdGlvbi0xYCkgbm93PyBUaGlzIHN0YXJ0cyBhIG5ldyBhZ2VudCBzZXNzaW9uIHVzaW5nIHRoZSBhdXRvbWF0aW9uXFwncyBjb25maWd1cmVkIHByb21wdCBhbmQgcGVybWlzc2lvbnMuJyxcblx0XHRcdGNhbGxzOiBbe1xuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHR0cmlnZ2VyOiAnbWFudWFsJyxcblx0XHRcdFx0bGVhZGVyV2luZG93SWQ6IDAsXG5cdFx0XHRcdGNhbmNlbGxlZDogZmFsc2UsXG5cdFx0XHR9XSxcblx0XHRcdHJ1blRva2VuQ2FuY2VsbGVkQWZ0ZXJEaXNwYXRjaDogZmFsc2UsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnc3RhcnRlZCcsXG5cdFx0XHRcdGF1dG9tYXRpb246IHsgaWQ6ICdhdXRvbWF0aW9uLTEnLCBuYW1lOiAnRGFpbHkgcmV2aWV3JyB9LFxuXHRcdFx0XHRydW46IHtcblx0XHRcdFx0XHRpZDogJ3J1bi0xJyxcblx0XHRcdFx0XHRzdGF0dXM6ICdydW5uaW5nJyxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UudG9TdHJpbmcoKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bkF1dG9tYXRpb24gcmVwb3J0cyB0aGUgYWN0aXZlIHJ1biB3aGVuIHRoZSBydW5uZXIgZGVjbGluZXMgdG8gY2xhaW0gaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2F1dG9tYXRpb25dKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5hZGRSdW4oe1xuXHRcdFx0aWQ6ICdhY3RpdmUtcnVuJyxcblx0XHRcdGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCxcblx0XHRcdHN0YXR1czogJ3J1bm5pbmcnLFxuXHRcdFx0dHJpZ2dlcjogJ21hbnVhbCcsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0XHRzdGFydGVkQXQ6IE5PVyxcblx0XHRcdGxlYWRlcldpbmRvd0lkOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBSZWNvcmRpbmdBdXRvbWF0aW9uUnVubmVyKGF1dG9tYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB0b29sID0gbmV3IFJ1bkF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBydW5uZXIsIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSB7IGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCB9O1xuXG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbiEoe1xuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLTEnLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogU0VTU0lPTl9SRVNPVVJDRSxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwgcGFyYW1ldGVycyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbmZpcm1hdGlvbjogcHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHQvLyBUaGUgcnVubmVyIG93bnMgdGhlIGNsYWltLCBzbyB0aGUgdG9vbCBzdGlsbCBkaXNwYXRjaGVzIGFuZCBsZXRzIGl0IGRlY2xpbmUuXG5cdFx0XHRydW5zQ3JlYXRlZDogYXV0b21hdGlvblNlcnZpY2UucnVucy5nZXQoKS5sZW5ndGgsXG5cdFx0XHRyZXN1bHQ6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKSxcblx0XHR9LCB7XG5cdFx0XHRjb25maXJtYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHJ1bnNDcmVhdGVkOiAxLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN0YXR1czogJ2FscmVhZHlfcnVubmluZycsXG5cdFx0XHRcdGF1dG9tYXRpb246IHsgaWQ6ICdhdXRvbWF0aW9uLTEnLCBuYW1lOiAnRGFpbHkgcmV2aWV3JyB9LFxuXHRcdFx0XHRydW46IHtcblx0XHRcdFx0XHRpZDogJ2FjdGl2ZS1ydW4nLFxuXHRcdFx0XHRcdHN0YXR1czogJ3J1bm5pbmcnLFxuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogU0VTU0lPTl9SRVNPVVJDRS50b1N0cmluZygpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncnVuQXV0b21hdGlvbiByZXBvcnRzIHdoZW4gZGlzcGF0Y2ggZG9lcyBub3Qgc3RhcnQgYSBydW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2F1dG9tYXRpb25dKTtcblx0XHRjb25zdCBydW5uZXIgPSBuZXcgUmVjb3JkaW5nQXV0b21hdGlvblJ1bm5lcihhdXRvbWF0aW9uU2VydmljZSk7XG5cdFx0cnVubmVyLm5vdFN0YXJ0ZWQgPSB7IGtpbmQ6ICdub3RTdGFydGVkJywgcmVhc29uOiAndGFyZ2V0VW5hdmFpbGFibGUnIH07XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBSdW5BdXRvbWF0aW9uVG9vbChhdXRvbWF0aW9uU2VydmljZSwgcnVubmVyLCBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7IGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXJyb3I6IHJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0XHRjYWxsczogcnVubmVyLmNhbGxzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRlcnJvcjogJ0F1dG9tYXRpb24gXCJhdXRvbWF0aW9uLTFcIiBkaWQgbm90IHN0YXJ0LiBJdHMgY29uZmlndXJlZCBhZ2VudCBpcyB1bmF2YWlsYWJsZS4nLFxuXHRcdFx0Y2FsbHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUF1dG9tYXRpb24gcHJvdmlkZXMgRGVsZXRlIGFuZCBDYW5jZWwgY29uZmlybWF0aW9uIG9wdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2F1dG9tYXRpb25dKTtcblx0XHRjb25zdCB0b29sID0gbmV3IERlbGV0ZUF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0geyBhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQgfTtcblxuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24hKHtcblx0XHRcdHBhcmFtZXRlcnMsXG5cdFx0XHR0b29sQ2FsbElkOiAnY2FsbC0xJyxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHByZXBhcmVkPy5jb25maXJtYXRpb25NZXNzYWdlcz8ubWVzc2FnZTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwgcGFyYW1ldGVycywgU0VTU0lPTl9SRVNPVVJDRSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ2RlbGV0ZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb25maXJtYXRpb25UaXRsZTogcHJlcGFyZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2U6IHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyA/IG1lc3NhZ2UgOiBtZXNzYWdlPy52YWx1ZSxcblx0XHRcdGFsbG93QXV0b0NvbmZpcm06IHByZXBhcmVkPy5jb25maXJtYXRpb25NZXNzYWdlcz8uYWxsb3dBdXRvQ29uZmlybSxcblx0XHRcdG9wdGlvbnM6IHByZXBhcmVkPy5jb25maXJtYXRpb25NZXNzYWdlcz8uY3VzdG9tT3B0aW9ucyxcblx0XHRcdGRlbGV0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLmRlbGV0ZWQsXG5cdFx0XHRhdXRvbWF0aW9uczogYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksXG5cdFx0XHRyZXN1bHQ6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKSxcblx0XHR9LCB7XG5cdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ0RlbGV0ZSBBdXRvbWF0aW9uPycsXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlOiAnRGVsZXRlICoqRGFpbHkgcmV2aWV3KiogKGBhdXRvbWF0aW9uLTFgKT8gSXRzIHNhdmVkIGNvbmZpZ3VyYXRpb24gYW5kIHJ1biBoaXN0b3J5IHdpbGwgYmUgcGVybWFuZW50bHkgcmVtb3ZlZC4gUnVucyBhbHJlYWR5IGluIGZsaWdodCB3aWxsIGNvbnRpbnVlLicsXG5cdFx0XHRhbGxvd0F1dG9Db25maXJtOiB1bmRlZmluZWQsXG5cdFx0XHRvcHRpb25zOiBbXG5cdFx0XHRcdHsgaWQ6ICdkZWxldGUnLCBsYWJlbDogJ0RlbGV0ZScsIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuQXBwcm92ZSB9LFxuXHRcdFx0XHR7IGlkOiAnY2FuY2VsJywgbGFiZWw6ICdDYW5jZWwnLCBraW5kOiBDb25maXJtYXRpb25PcHRpb25LaW5kLkRlbnkgfSxcblx0XHRcdF0sXG5cdFx0XHRkZWxldGVkOiBbJ2F1dG9tYXRpb24tMSddLFxuXHRcdFx0YXV0b21hdGlvbnM6IFtdLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN0YXR1czogJ2RlbGV0ZWQnLFxuXHRcdFx0XHRhdXRvbWF0aW9uOiB7IGlkOiAnYXV0b21hdGlvbi0xJywgbmFtZTogJ0RhaWx5IHJldmlldycgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUF1dG9tYXRpb24gcmVqZWN0cyBzdGFsZSBJRHMgYmVmb3JlIGNvbmZpcm1hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCB0b29sID0gbmV3IERlbGV0ZUF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0geyBhdXRvbWF0aW9uSWQ6ICdtaXNzaW5nJyB9O1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHR0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbiEoe1xuXHRcdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2FsbC0xJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogU0VTU0lPTl9SRVNPVVJDRSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0L0F1dG9tYXRpb24gXCJtaXNzaW5nXCIgZG9lcyBub3QgZXhpc3QvLFxuXHRcdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHBhcmFtZXRlcnMsIFNFU1NJT05fUkVTT1VSQ0UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICdkZWxldGUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXJyb3I6IHJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0XHRkZWxldGVkOiBhdXRvbWF0aW9uU2VydmljZS5kZWxldGVkLFxuXHRcdH0sIHtcblx0XHRcdGVycm9yOiAnQXV0b21hdGlvbiBcIm1pc3NpbmdcIiBkb2VzIG5vdCBleGlzdC4gQ2FsbCBsaXN0QXV0b21hdGlvbnMgdG8gcmVmcmVzaCB0aGUgYXZhaWxhYmxlIElEcy4nLFxuXHRcdFx0ZGVsZXRlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUF1dG9tYXRpb24gQ2FuY2VsIG9wdGlvbiBtYWtlcyBubyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBjcmVhdGVBdXRvbWF0aW9uKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKFthdXRvbWF0aW9uXSk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBEZWxldGVBdXRvbWF0aW9uVG9vbChhdXRvbWF0aW9uU2VydmljZSwgY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwgeyBhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQgfSwgU0VTU0lPTl9SRVNPVVJDRSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ2NhbmNlbCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKSxcblx0XHRcdGRlbGV0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLmRlbGV0ZWQsXG5cdFx0XHRhdXRvbWF0aW9uczogYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN0YXR1czogJ2NhbmNlbGxlZCcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdUaGUgYXV0b21hdGlvbiB3YXMgbm90IGRlbGV0ZWQuJyxcblx0XHRcdH0sXG5cdFx0XHRkZWxldGVkOiBbXSxcblx0XHRcdGF1dG9tYXRpb25zOiBbYXV0b21hdGlvbl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUF1dG9tYXRpb24gcnVucyB3aXRob3V0IGEgY3VzdG9tIGJ1dHRvbiBhZnRlciBhcHByb3ZhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gY3JlYXRlQXV0b21hdGlvbigpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IEZha2VBdXRvbWF0aW9uU2VydmljZShbYXV0b21hdGlvbl0pO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRGVsZXRlQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKFxuXHRcdFx0dG9vbCxcblx0XHRcdHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkIH0sXG5cdFx0XHRTRVNTSU9OX1JFU09VUkNFLFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKSxcblx0XHRcdGRlbGV0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLmRlbGV0ZWQsXG5cdFx0XHRhdXRvbWF0aW9uczogYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN0YXR1czogJ2RlbGV0ZWQnLFxuXHRcdFx0XHRhdXRvbWF0aW9uOiB7IGlkOiBhdXRvbWF0aW9uLmlkLCBuYW1lOiBhdXRvbWF0aW9uLm5hbWUgfSxcblx0XHRcdH0sXG5cdFx0XHRkZWxldGVkOiBbYXV0b21hdGlvbi5pZF0sXG5cdFx0XHRhdXRvbWF0aW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUF1dG9tYXRpb24gY2FuY2VsbGF0aW9uIG1ha2VzIG5vIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2F1dG9tYXRpb25dKTtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRGVsZXRlQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkIH0sIFNFU1NJT05fUkVTT1VSQ0UsIHRva2VuU291cmNlLnRva2VuLCAnZGVsZXRlJyk7XG5cdFx0dG9rZW5Tb3VyY2UuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKSxcblx0XHRcdGRlbGV0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLmRlbGV0ZWQsXG5cdFx0XHRhdXRvbWF0aW9uczogYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN0YXR1czogJ2NhbmNlbGxlZCcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdUaGUgYXV0b21hdGlvbiB3YXMgbm90IGRlbGV0ZWQuJyxcblx0XHRcdH0sXG5cdFx0XHRkZWxldGVkOiBbXSxcblx0XHRcdGF1dG9tYXRpb25zOiBbYXV0b21hdGlvbl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyZUF1dG9tYXRpb24gcHJlcGFyZXMgbm9ybWFsIGNyZWF0ZSBhbmQgdXBkYXRlIGNvbmZpcm1hdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBjcmVhdGVBdXRvbWF0aW9uKCk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2V4aXN0aW5nXSksXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoY3JlYXRlU2Vzc2lvbih7IHdvcmtzcGFjZTogRk9MREVSIH0pKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0KTtcblx0XHRjb25zdCBjcmVhdGVQcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uISh7XG5cdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdG5hbWU6ICdNb3JuaW5nIHJldmlldycsXG5cdFx0XHRcdHByb21wdDogJ1JldmlldyBvcGVuIHB1bGwgcmVxdWVzdHMnLFxuXHRcdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ2RhaWx5JyB9LFxuXHRcdFx0fSxcblx0XHRcdHRvb2xDYWxsSWQ6ICdjcmVhdGUtY2FsbCcsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFLFxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHVwZGF0ZVByZXBhcmVkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24hKHtcblx0XHRcdHBhcmFtZXRlcnM6IHsgYXV0b21hdGlvbklkOiBleGlzdGluZy5pZCwgbmFtZTogJ1VwZGF0ZWQgcmV2aWV3JyB9LFxuXHRcdFx0dG9vbENhbGxJZDogJ3VwZGF0ZS1jYWxsJyxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZToge1xuXHRcdFx0XHR0aXRsZTogY3JlYXRlUHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLFxuXHRcdFx0XHRtZXNzYWdlOiB0eXBlb2YgY3JlYXRlUHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2UgPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0PyBjcmVhdGVQcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcy5tZXNzYWdlXG5cdFx0XHRcdFx0OiBjcmVhdGVQcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcz8ubWVzc2FnZT8udmFsdWUsXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IGNyZWF0ZVByZXBhcmVkLnRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHR9LFxuXHRcdFx0dXBkYXRlOiB7XG5cdFx0XHRcdHRpdGxlOiB1cGRhdGVQcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsXG5cdFx0XHRcdG1lc3NhZ2U6IHR5cGVvZiB1cGRhdGVQcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcz8ubWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHQ/IHVwZGF0ZVByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2Vcblx0XHRcdFx0XHQ6IHVwZGF0ZVByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5tZXNzYWdlPy52YWx1ZSxcblx0XHRcdFx0ZXhwZWN0ZWRJZDogdXBkYXRlUHJlcGFyZWQudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2F1dG9tYXRpb25Db25maWd1cmF0aW9uJ1xuXHRcdFx0XHRcdD8gdXBkYXRlUHJlcGFyZWQudG9vbFNwZWNpZmljRGF0YS5leHBlY3RlZEF1dG9tYXRpb25JZFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGU6IHtcblx0XHRcdFx0dGl0bGU6ICdDcmVhdGUgQXV0b21hdGlvbj8nLFxuXHRcdFx0XHRtZXNzYWdlOiAnQ3JlYXRlIHRoZSBhdXRvbWF0aW9uICoqTW9ybmluZyByZXZpZXcqKj8nLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0dXBkYXRlOiB7XG5cdFx0XHRcdHRpdGxlOiAnVXBkYXRlIEF1dG9tYXRpb24/Jyxcblx0XHRcdFx0bWVzc2FnZTogJ0FwcGx5IHRoZSBwcm9wb3NlZCBjaGFuZ2VzIHRvICoqRGFpbHkgcmV2aWV3KiogKGBhdXRvbWF0aW9uLTFgKT8nLFxuXHRcdFx0XHRleHBlY3RlZElkOiBleGlzdGluZy5pZCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyZUF1dG9tYXRpb24gY3JlYXRlcyBmcm9tIHRoZSBpbnZva2luZyBjaGF0IHRhcmdldCBhbmQgcmV0dXJucyBjbGlja2FibGUgcmVzdWx0IGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdGFyZ2V0OiBBdXRvbWF0aW9uVGFyZ2V0ID0ge1xuXHRcdFx0a2luZDogJ3F1aWNrQ2hhdCcsXG5cdFx0XHRwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsXG5cdFx0XHRzZXNzaW9uVHlwZUlkOiAnY29waWxvdCcsXG5cdFx0fTtcblx0XHRjb25zdCBzY2hlZHVsZTogSUF1dG9tYXRpb25TY2hlZHVsZSA9IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogOCwgc2NoZWR1bGVNaW51dGU6IDMwLCBzY2hlZHVsZURheTogMSB9O1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgQ29uZmlndXJlQXV0b21hdGlvblRvb2woXG5cdFx0XHRhdXRvbWF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShjcmVhdGVTZXNzaW9uKHsgcXVpY2tDaGF0OiB0cnVlIH0pLCB0cnVlKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7XG5cdFx0XHRuYW1lOiAnTW9ybmluZyByZXZpZXcnLFxuXHRcdFx0cHJvbXB0OiAnUmV2aWV3IG9wZW4gcHVsbCByZXF1ZXN0cycsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ2RhaWx5Jywgc2NoZWR1bGVIb3VyOiA4LCBzY2hlZHVsZU1pbnV0ZTogMzAgfSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0fSwgQ0hBVF9SRVNPVVJDRSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLmNyZWF0ZWQsXG5cdFx0XHRzdGF0dXM6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKS5zdGF0dXMsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiByZXN1bHQudG9vbFNwZWNpZmljRGF0YSxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkOiBbe1xuXHRcdFx0XHRuYW1lOiAnTW9ybmluZyByZXZpZXcnLFxuXHRcdFx0XHRwcm9tcHQ6ICdSZXZpZXcgb3BlbiBwdWxsIHJlcXVlc3RzJyxcblx0XHRcdFx0c2NoZWR1bGUsXG5cdFx0XHRcdHRhcmdldCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdH1dLFxuXHRcdFx0c3RhdHVzOiAnY3JlYXRlZCcsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdGtpbmQ6ICdhdXRvbWF0aW9uQ29uZmlndXJlZCcsXG5cdFx0XHRcdGF1dG9tYXRpb25JZDogJ2NyZWF0ZWQtYXV0b21hdGlvbicsXG5cdFx0XHRcdGF1dG9tYXRpb25OYW1lOiAnTW9ybmluZyByZXZpZXcnLFxuXHRcdFx0XHRvcGVyYXRpb246ICdjcmVhdGVkJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyZUF1dG9tYXRpb24gYXBwbGllcyBhIHBhcnRpYWwgZ3VhcmRlZCB1cGRhdGUgYW5kIHJldHVybnMgY2xpY2thYmxlIHJlc3VsdCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gY3JlYXRlQXV0b21hdGlvbigpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IEZha2VBdXRvbWF0aW9uU2VydmljZShbZXhpc3RpbmddKTtcblx0XHRjb25zdCB0b29sID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0YXV0b21hdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UodW5kZWZpbmVkKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0KTtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0ge1xuXHRcdFx0YXV0b21hdGlvbklkOiBleGlzdGluZy5pZCxcblx0XHRcdG5hbWU6ICdVcGRhdGVkIHJldmlldycsXG5cdFx0XHRzY2hlZHVsZTogeyBzY2hlZHVsZU1pbnV0ZTogNDUgfSxcblx0XHRcdG1vZGVsSWQ6IG51bGwsXG5cdFx0XHRtb2RlOiBudWxsLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsOiBudWxsLFxuXHRcdH07XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbiEoe1xuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd1cGRhdGUtY2FsbCcsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFLFxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHBhcmFtZXRlcnMsIFNFU1NJT05fUkVTT1VSQ0UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHVuZGVmaW5lZCwgcHJlcGFyZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVwZGF0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZWQsXG5cdFx0XHRzdGF0dXM6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKS5zdGF0dXMsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiByZXN1bHQudG9vbFNwZWNpZmljRGF0YSxcblx0XHR9LCB7XG5cdFx0XHR1cGRhdGVkOiBbe1xuXHRcdFx0XHRpZDogZXhpc3RpbmcuaWQsXG5cdFx0XHRcdHBhdGNoOiB7XG5cdFx0XHRcdFx0bmFtZTogJ1VwZGF0ZWQgcmV2aWV3Jyxcblx0XHRcdFx0XHRzY2hlZHVsZTogeyAuLi5leGlzdGluZy5zY2hlZHVsZSwgc2NoZWR1bGVNaW51dGU6IDQ1IH0sXG5cdFx0XHRcdFx0bW9kZWxJZDogbnVsbCxcblx0XHRcdFx0XHRtb2RlOiBudWxsLFxuXHRcdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogbnVsbCxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdFx0c3RhdHVzOiAndXBkYXRlZCcsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdGtpbmQ6ICdhdXRvbWF0aW9uQ29uZmlndXJlZCcsXG5cdFx0XHRcdGF1dG9tYXRpb25JZDogZXhpc3RpbmcuaWQsXG5cdFx0XHRcdGF1dG9tYXRpb25OYW1lOiAnVXBkYXRlZCByZXZpZXcnLFxuXHRcdFx0XHRvcGVyYXRpb246ICd1cGRhdGVkJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyZUF1dG9tYXRpb24gcmVqZWN0cyBlZGl0YWJsZSBjaGFuZ2VzIG1hZGUgd2hpbGUgYXdhaXRpbmcgYXBwcm92YWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBjcmVhdGVBdXRvbWF0aW9uKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKFtleGlzdGluZ10pO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgQ29uZmlndXJlQXV0b21hdGlvblRvb2woXG5cdFx0XHRhdXRvbWF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSh1bmRlZmluZWQpLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHQpO1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSB7IGF1dG9tYXRpb25JZDogZXhpc3RpbmcuaWQsIG5hbWU6ICdQcm9wb3NlZCBuYW1lJyB9O1xuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24hKHtcblx0XHRcdHBhcmFtZXRlcnMsXG5cdFx0XHR0b29sQ2FsbElkOiAndXBkYXRlLWNhbGwnLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogU0VTU0lPTl9SRVNPVVJDRSxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5zZXQoW1xuXHRcdFx0eyAuLi5leGlzdGluZywgcHJvbXB0OiAnQ2hhbmdlZCBpbiBhbm90aGVyIHdpbmRvdycsIHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDE6MDAuMDAwWicgfSxcblx0XHRdLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHBhcmFtZXRlcnMsIFNFU1NJT05fUkVTT1VSQ0UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHVuZGVmaW5lZCwgcHJlcGFyZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVycm9yOiByZXN1bHQudG9vbFJlc3VsdEVycm9yLFxuXHRcdFx0dXBkYXRlZDogYXV0b21hdGlvblNlcnZpY2UudXBkYXRlZCxcblx0XHR9LCB7XG5cdFx0XHRlcnJvcjogJ0F1dG9tYXRpb24gXCJhdXRvbWF0aW9uLTFcIiBjaGFuZ2VkIGJlZm9yZSB0aGUgdXBkYXRlIHdhcyBhcHBsaWVkLiBDYWxsIGxpc3RBdXRvbWF0aW9ucyB0byByZWZyZXNoIGl0IGJlZm9yZSBwcm9wb3NpbmcgbmV3IGNoYW5nZXMuIE5vIGNoYW5nZXMgd2VyZSBtYWRlLicsXG5cdFx0XHR1cGRhdGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiBwZXJtaXRzIHJ1bnRpbWUgbWV0YWRhdGEgY2hhbmdlcyB3aGlsZSBhd2FpdGluZyBhcHByb3ZhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2V4aXN0aW5nXSk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHVuZGVmaW5lZCksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdCk7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IHsgYXV0b21hdGlvbklkOiBleGlzdGluZy5pZCwgbmFtZTogJ1Byb3Bvc2VkIG5hbWUnIH07XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbiEoe1xuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd1cGRhdGUtY2FsbCcsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFLFxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLmF1dG9tYXRpb25zLnNldChbe1xuXHRcdFx0Li4uZXhpc3RpbmcsXG5cdFx0XHR1cGRhdGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAxOjAwLjAwMFonLFxuXHRcdFx0bGFzdFJ1bkF0OiAnMjAyNi0wMS0wMVQwMDowMTowMC4wMDBaJyxcblx0XHRcdG5leHRSdW5BdDogJzIwMjYtMDEtMDJUMDk6MDA6MDAuMDAwWicsXG5cdFx0fV0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwgcGFyYW1ldGVycywgU0VTU0lPTl9SRVNPVVJDRSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgdW5kZWZpbmVkLCBwcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBKU09OLnBhcnNlKGdldFRleHQocmVzdWx0KSkuc3RhdHVzLFxuXHRcdFx0dXBkYXRlZDogYXV0b21hdGlvblNlcnZpY2UudXBkYXRlZCxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6ICd1cGRhdGVkJyxcblx0XHRcdHVwZGF0ZWQ6IFt7IGlkOiBleGlzdGluZy5pZCwgcGF0Y2g6IHsgbmFtZTogJ1Byb3Bvc2VkIG5hbWUnIH0gfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyZUF1dG9tYXRpb24gdmFsaWRhdGVzIGV4cGxpY2l0IHRhcmdldHMgYmVmb3JlIHdyaXRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRbcHJvdmlkZXJTZXNzaW9uVHlwZSgnbG9jYWwtYWdlbnQtaG9zdCcsICdjb3BpbG90JywgZmFsc2UpXSxcblx0XHRcdCksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwge1xuXHRcdFx0bmFtZTogJ0ludmFsaWQgd29ya3RyZWUnLFxuXHRcdFx0cHJvbXB0OiAnRG8gbm90IHNhdmUnLFxuXHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnIH0sXG5cdFx0XHR0YXJnZXQ6IHtcblx0XHRcdFx0a2luZDogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdGZvbGRlclVyaTogRk9MREVSLnRvU3RyaW5nKCksXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICdsb2NhbC1hZ2VudC1ob3N0Jyxcblx0XHRcdFx0c2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QnLFxuXHRcdFx0XHRpc29sYXRpb246ICd3b3JrdHJlZScsXG5cdFx0XHRcdGJyYW5jaDogJ21haW4nLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXJyb3I6IHJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0XHRjcmVhdGVkOiBhdXRvbWF0aW9uU2VydmljZS5jcmVhdGVkLFxuXHRcdH0sIHtcblx0XHRcdGVycm9yOiAnU2Vzc2lvbiB0eXBlIFwiY29waWxvdFwiIGRvZXMgbm90IHN1cHBvcnQgd29ya3RyZWUgaXNvbGF0aW9uLicsXG5cdFx0XHRjcmVhdGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiByZWNoZWNrcyBjYW5jZWxsYXRpb24gaW1tZWRpYXRlbHkgYmVmb3JlIHdyaXRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgdG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRjb25zdCB0b29sID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0YXV0b21hdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoY3JlYXRlU2Vzc2lvbih7IHdvcmtzcGFjZTogRk9MREVSIH0pKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7XG5cdFx0XHRuYW1lOiAnQ2FuY2VsbGVkJyxcblx0XHRcdHByb21wdDogJ0RvIG5vdCBzYXZlJyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJyB9LFxuXHRcdH0sIFNFU1NJT05fUkVTT1VSQ0UsIHRva2VuU291cmNlLnRva2VuKTtcblx0XHR0b2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdDogSlNPTi5wYXJzZShnZXRUZXh0KHJlc3VsdCkpLFxuXHRcdFx0Y3JlYXRlZDogYXV0b21hdGlvblNlcnZpY2UuY3JlYXRlZCxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnY2FuY2VsbGVkJyxcblx0XHRcdFx0bWVzc2FnZTogJ1RoZSBhdXRvbWF0aW9uIGNoYW5nZSB3YXMgY2FuY2VsbGVkLiBObyBjaGFuZ2VzIHdlcmUgbWFkZS4nLFxuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmVBdXRvbWF0aW9uIHJlY2hlY2tzIHRoZSBmZWF0dXJlIHNldHRpbmcgaW1tZWRpYXRlbHkgYmVmb3JlIHdyaXRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmYWxzZSxcblx0XHRcdFtwcm92aWRlclNlc3Npb25UeXBlKCdsb2NhbC1hZ2VudC1ob3N0JywgJ2NvcGlsb3QnKV0sXG5cdFx0KTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmJlZm9yZUdldEZvbGRlclNlc3Npb25UeXBlcyA9ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HLCBmYWxzZSk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChhdXRvbWF0aW9uU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHtcblx0XHRcdG5hbWU6ICdEaXNhYmxlZCcsXG5cdFx0XHRwcm9tcHQ6ICdEbyBub3Qgc2F2ZScsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcgfSxcblx0XHRcdHRhcmdldDoge1xuXHRcdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdFx0Zm9sZGVyVXJpOiBGT0xERVIudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdFx0XHRzZXNzaW9uVHlwZUlkOiAnY29waWxvdCcsXG5cdFx0XHRcdGlzb2xhdGlvbjogJ2RlZmF1bHQnLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXJyb3I6IHJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0XHRjcmVhdGVkOiBhdXRvbWF0aW9uU2VydmljZS5jcmVhdGVkLFxuXHRcdH0sIHtcblx0XHRcdGVycm9yOiAnQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicsXG5cdFx0XHRjcmVhdGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiBjYW5jZWxsYXRpb24gZHVyaW5nIGFuIGF1dGhvcml0YXRpdmUgcmVhZCBtYWtlcyBubyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZSA9IG5ldyBDb250cm9sbGFibGVBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UodW5kZWZpbmVkKTtcblx0XHRjb25zdCByZWFkQmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UucmVhZEJhcnJpZXIgPSByZWFkQmFycmllcjtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IGNyZWF0ZVN0b3JhZ2VCYWNrZWRTZXJ2aWNlKHVuZGVmaW5lZCwgYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IHRlYXJkb3duLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGNyZWF0ZVNlc3Npb24oeyB3b3Jrc3BhY2U6IEZPTERFUiB9KSksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gaW52b2tlKHRvb2wsIHtcblx0XHRcdG5hbWU6ICdDYW5jZWxsZWQnLFxuXHRcdFx0cHJvbXB0OiAnRG8gbm90IHNhdmUnLFxuXHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnIH0sXG5cdFx0fSwgU0VTU0lPTl9SRVNPVVJDRSwgdG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdGF3YWl0IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZS5yZWFkU3RhcnRlZC5wO1xuXHRcdHRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdGF3YWl0IHJlYWRCYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiBKU09OLnBhcnNlKGdldFRleHQocmVzdWx0KSksXG5cdFx0XHRjb21wYXJlQW5kU3dhcENhbGxzOiBhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UuY29tcGFyZUFuZFN3YXBDYWxscyxcblx0XHRcdGF1dG9tYXRpb25zOiBhdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnY2FuY2VsbGVkJyxcblx0XHRcdFx0bWVzc2FnZTogJ1RoZSBhdXRvbWF0aW9uIGNoYW5nZSB3YXMgY2FuY2VsbGVkLiBObyBjaGFuZ2VzIHdlcmUgbWFkZS4nLFxuXHRcdFx0fSxcblx0XHRcdGNvbXBhcmVBbmRTd2FwQ2FsbHM6IDAsXG5cdFx0XHRhdXRvbWF0aW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUF1dG9tYXRpb24gY2FuY2VsbGF0aW9uIGR1cmluZyBhbiBhdXRob3JpdGF0aXZlIHJlYWQgbWFrZXMgbm8gY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gY3JlYXRlQXV0b21hdGlvbigpO1xuXHRcdGNvbnN0IHJhdyA9IHNlcmlhbGl6ZUF1dG9tYXRpb25MZWRnZXIoW2F1dG9tYXRpb25dKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UgPSBuZXcgQ29udHJvbGxhYmxlQXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlKHJhdyk7XG5cdFx0Y29uc3QgcmVhZEJhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0YXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLnJlYWRCYXJyaWVyID0gcmVhZEJhcnJpZXI7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBjcmVhdGVTdG9yYWdlQmFja2VkU2VydmljZShyYXcsIGF1dG9tYXRpb25TdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgdG9rZW5Tb3VyY2UgPSB0ZWFyZG93bi5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRGVsZXRlQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGludm9rZSh0b29sLCB7IGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCB9LCBTRVNTSU9OX1JFU09VUkNFLCB0b2tlblNvdXJjZS50b2tlbiwgJ2RlbGV0ZScpO1xuXHRcdGF3YWl0IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZS5yZWFkU3RhcnRlZC5wO1xuXHRcdHRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdGF3YWl0IHJlYWRCYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiBKU09OLnBhcnNlKGdldFRleHQocmVzdWx0KSksXG5cdFx0XHRjb21wYXJlQW5kU3dhcENhbGxzOiBhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UuY29tcGFyZUFuZFN3YXBDYWxscyxcblx0XHRcdGF1dG9tYXRpb25JZHM6IGF1dG9tYXRpb25TZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLm1hcChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnY2FuY2VsbGVkJyxcblx0XHRcdFx0bWVzc2FnZTogJ1RoZSBhdXRvbWF0aW9uIHdhcyBub3QgZGVsZXRlZC4nLFxuXHRcdFx0fSxcblx0XHRcdGNvbXBhcmVBbmRTd2FwQ2FsbHM6IDAsXG5cdFx0XHRhdXRvbWF0aW9uSWRzOiBbYXV0b21hdGlvbi5pZF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyZUF1dG9tYXRpb24gZGlzYWJsZW1lbnQgZHVyaW5nIGEgQ0FTIGNvbmZsaWN0IHN0b3BzIGJlZm9yZSByZXRyeWluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gY3JlYXRlQXV0b21hdGlvbigpO1xuXHRcdGNvbnN0IHJhdyA9IHNlcmlhbGl6ZUF1dG9tYXRpb25MZWRnZXIoW2F1dG9tYXRpb25dKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UgPSBuZXcgQ29udHJvbGxhYmxlQXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlKHJhdyk7XG5cdFx0YXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLm5leHRDb25mbGljdFZhbHVlID0gc2VyaWFsaXplQXV0b21hdGlvbkxlZGdlcihbYXV0b21hdGlvbl0sIDIpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UuYmVmb3JlQ29tcGFyZUFuZFN3YXAgPSAoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDSEFUX0FVVE9NQVRJT05TX0VOQUJMRURfU0VUVElORywgZmFsc2UpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gY3JlYXRlU3RvcmFnZUJhY2tlZFNlcnZpY2UocmF3LCBhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgQ29uZmlndXJlQXV0b21hdGlvblRvb2woXG5cdFx0XHRhdXRvbWF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSh1bmRlZmluZWQpLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7IGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCwgbmFtZTogJ011c3Qgbm90IGNvbW1pdCcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVycm9yOiByZXN1bHQudG9vbFJlc3VsdEVycm9yLFxuXHRcdFx0Y29tcGFyZUFuZFN3YXBDYWxsczogYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLmNvbXBhcmVBbmRTd2FwQ2FsbHMsXG5cdFx0XHRhdXRvbWF0aW9uTmFtZTogYXV0b21hdGlvblNlcnZpY2UuZ2V0QXV0b21hdGlvbihhdXRvbWF0aW9uLmlkKT8ubmFtZSxcblx0XHR9LCB7XG5cdFx0XHRlcnJvcjogJ0F1dG9tYXRpb25zIGFyZSBkaXNhYmxlZC4nLFxuXHRcdFx0Y29tcGFyZUFuZFN3YXBDYWxsczogMSxcblx0XHRcdGF1dG9tYXRpb25OYW1lOiBhdXRvbWF0aW9uLm5hbWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyZUF1dG9tYXRpb24gcmVwb3J0cyBzdWNjZXNzIHdoZW4gY2FuY2VsbGF0aW9uIGNyb3NzZXMgYSBjb21taXR0ZWQgQ0FTIGJvdW5kYXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZSA9IG5ldyBDb250cm9sbGFibGVBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UodW5kZWZpbmVkKTtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IHRlYXJkb3duLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0YXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLmJlZm9yZUNvbXBhcmVBbmRTd2FwID0gKCkgPT4gdG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBjcmVhdGVTdG9yYWdlQmFja2VkU2VydmljZSh1bmRlZmluZWQsIGF1dG9tYXRpb25TdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGNyZWF0ZVNlc3Npb24oeyB3b3Jrc3BhY2U6IEZPTERFUiB9KSksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwge1xuXHRcdFx0bmFtZTogJ0NvbW1pdHRlZCcsXG5cdFx0XHRwcm9tcHQ6ICdTYXZlIG9uY2UgQ0FTIHN0YXJ0cycsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcgfSxcblx0XHR9LCBTRVNTSU9OX1JFU09VUkNFLCB0b2tlblNvdXJjZS50b2tlbik7XG5cdFx0Y29uc3QgcGVyc2lzdGVkID0gSlNPTi5wYXJzZShhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UudmFsdWUhKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBKU09OLnBhcnNlKGdldFRleHQocmVzdWx0KSkuc3RhdHVzLFxuXHRcdFx0Y2FuY2VsbGVkOiB0b2tlblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCxcblx0XHRcdGNvbXBhcmVBbmRTd2FwQ2FsbHM6IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZS5jb21wYXJlQW5kU3dhcENhbGxzLFxuXHRcdFx0aW5NZW1vcnlOYW1lczogYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubWFwKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5uYW1lKSxcblx0XHRcdHBlcnNpc3RlZE5hbWVzOiBwZXJzaXN0ZWQuYXV0b21hdGlvbnMubWFwKChhdXRvbWF0aW9uOiB7IG5hbWU6IHN0cmluZyB9KSA9PiBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogJ2NyZWF0ZWQnLFxuXHRcdFx0Y2FuY2VsbGVkOiB0cnVlLFxuXHRcdFx0Y29tcGFyZUFuZFN3YXBDYWxsczogMSxcblx0XHRcdGluTWVtb3J5TmFtZXM6IFsnQ29tbWl0dGVkJ10sXG5cdFx0XHRwZXJzaXN0ZWROYW1lczogWydDb21taXR0ZWQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiByZWplY3RzIHN0YWxlIElEcyBhbmQgbWFsZm9ybWVkIHRhcmdldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoKSxcblx0XHRcdG5ldyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSh1bmRlZmluZWQpLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc3RhbGVSZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwgeyBhdXRvbWF0aW9uSWQ6ICdtaXNzaW5nJywgbmFtZTogJ1VwZGF0ZWQnIH0pO1xuXHRcdGNvbnN0IG1hbGZvcm1lZFRhcmdldFJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7XG5cdFx0XHRuYW1lOiAnSW52YWxpZCB0YXJnZXQnLFxuXHRcdFx0cHJvbXB0OiAnRG8gbm90IHNhdmUnLFxuXHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICd3ZWVrbHknIH0sXG5cdFx0XHR0YXJnZXQ6IHtcblx0XHRcdFx0a2luZDogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdGZvbGRlclVyaTogJ25vdC1hbi1hYnNvbHV0ZS11cmknLFxuXHRcdFx0XHRpc29sYXRpb246ICd3b3JrdHJlZScsXG5cdFx0XHRcdGJyYW5jaDogJ21haW4nLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhbGVFcnJvcjogc3RhbGVSZXN1bHQudG9vbFJlc3VsdEVycm9yLFxuXHRcdFx0dGFyZ2V0RXJyb3I6IG1hbGZvcm1lZFRhcmdldFJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0fSwge1xuXHRcdFx0c3RhbGVFcnJvcjogJ0F1dG9tYXRpb24gXCJtaXNzaW5nXCIgZG9lcyBub3QgZXhpc3QuIENhbGwgbGlzdEF1dG9tYXRpb25zIHRvIHJlZnJlc2ggdGhlIGF2YWlsYWJsZSBJRHMuJyxcblx0XHRcdHRhcmdldEVycm9yOiAnXCJ0YXJnZXQuZm9sZGVyVXJpXCIgbXVzdCBiZSBhIHZhbGlkIGFic29sdXRlIFVSSS4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxlZCBBdXRvbWF0aW9ucyBjYW5ub3QgYmUgbGlzdGVkLCBjb25maWd1cmVkLCBydW4sIG9yIGRlbGV0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKFtjcmVhdGVBdXRvbWF0aW9uKCldKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKGZhbHNlKTtcblx0XHRjb25zdCBydW5uZXIgPSBuZXcgUmVjb3JkaW5nQXV0b21hdGlvblJ1bm5lcihhdXRvbWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGlzdFJlc3VsdCA9IGF3YWl0IGludm9rZShuZXcgTGlzdEF1dG9tYXRpb25zVG9vbChhdXRvbWF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpLCB7fSk7XG5cdFx0Y29uc3QgY29uZmlndXJlUmVzdWx0ID0gYXdhaXQgaW52b2tlKG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGNyZWF0ZVNlc3Npb24oeyB3b3Jrc3BhY2U6IEZPTERFUiB9KSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHQpLCB7XG5cdFx0XHRuYW1lOiAnRGlzYWJsZWQnLFxuXHRcdFx0cHJvbXB0OiAnRG8gbm90IHNhdmUnLFxuXHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcnVuUmVzdWx0ID0gYXdhaXQgaW52b2tlKFxuXHRcdFx0bmV3IFJ1bkF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBydW5uZXIsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdHsgYXV0b21hdGlvbklkOiAnYXV0b21hdGlvbi0xJyB9LFxuXHRcdCk7XG5cdFx0Y29uc3QgZGVsZXRlUmVzdWx0ID0gYXdhaXQgaW52b2tlKFxuXHRcdFx0bmV3IERlbGV0ZUF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0XHR7IGF1dG9tYXRpb25JZDogJ2F1dG9tYXRpb24tMScgfSxcblx0XHRcdFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0J2RlbGV0ZScsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGlzdEVycm9yOiBsaXN0UmVzdWx0LnRvb2xSZXN1bHRFcnJvcixcblx0XHRcdGNvbmZpZ3VyZUVycm9yOiBjb25maWd1cmVSZXN1bHQudG9vbFJlc3VsdEVycm9yLFxuXHRcdFx0cnVuRXJyb3I6IHJ1blJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0XHRkZWxldGVFcnJvcjogZGVsZXRlUmVzdWx0LnRvb2xSZXN1bHRFcnJvcixcblx0XHRcdHJ1bkNhbGxzOiBydW5uZXIuY2FsbHMsXG5cdFx0XHRkZWxldGVkOiBhdXRvbWF0aW9uU2VydmljZS5kZWxldGVkLFxuXHRcdH0sIHtcblx0XHRcdGxpc3RFcnJvcjogJ0F1dG9tYXRpb25zIGFyZSBkaXNhYmxlZC4nLFxuXHRcdFx0Y29uZmlndXJlRXJyb3I6ICdBdXRvbWF0aW9ucyBhcmUgZGlzYWJsZWQuJyxcblx0XHRcdHJ1bkVycm9yOiAnQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicsXG5cdFx0XHRkZWxldGVFcnJvcjogJ0F1dG9tYXRpb25zIGFyZSBkaXNhYmxlZC4nLFxuXHRcdFx0cnVuQ2FsbHM6IFtdLFxuXHRcdFx0ZGVsZXRlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsaUJBQWlCLHVCQUF1QjtBQUNqRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxNQUFNLHFCQUFxQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3QixjQUFjLHFCQUFxQjtBQUNwRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QjtBQUloQyxTQUFTLCtCQUErQix3Q0FBd0M7QUFJaEYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUIsMkJBQTJCLHNCQUFzQix3QkFBd0IscUJBQXFCLHVCQUF1QixtQkFBbUIsMkJBQTJCO0FBQ3JNLFNBQVMsOEJBQWlHO0FBRTFHLE1BQU0sU0FBUyxJQUFJLE1BQU0sbUJBQW1CO0FBQzVDLE1BQU0sbUJBQW1CLElBQUksTUFBTSwrQkFBK0I7QUFDbEUsTUFBTSxnQkFBZ0IsSUFBSSxNQUFNLHlCQUF5QjtBQUN6RCxNQUFNLE1BQU07QUFDWixNQUFNLFdBQXlCLEVBQUUsUUFBUSxNQUFNO0FBQUUsRUFBRTtBQUVuRCxTQUFTLGlCQUFpQixXQUFtRTtBQUM1RixTQUFPO0FBQUEsSUFDTixJQUFJO0FBQUEsSUFDSixNQUFNO0FBQUEsSUFDTixRQUFRO0FBQUEsSUFDUixVQUFVLEVBQUUsVUFBVSxTQUFTLGNBQWMsR0FBRyxnQkFBZ0IsR0FBRyxhQUFhLEVBQUU7QUFBQSxJQUNsRixRQUFRO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixlQUFlO0FBQUEsTUFDZixXQUFXLEVBQUUsTUFBTSxVQUFVO0FBQUEsSUFDOUI7QUFBQSxJQUNBLFNBQVM7QUFBQSxJQUNULE1BQU07QUFBQSxJQUNOLGlCQUFpQjtBQUFBLElBQ2pCLFNBQVM7QUFBQSxJQUNULFdBQVc7QUFBQSxJQUNYLFdBQVc7QUFBQSxJQUNYLFdBQVc7QUFBQSxJQUNYLEdBQUc7QUFBQSxFQUNKO0FBQ0Q7QUFFQSxNQUFNLDhCQUE4QixLQUF5QixFQUFFO0FBQUEsRUFPOUQsWUFBWSxjQUFnRCxDQUFDLEdBQUc7QUFDL0QsVUFBTTtBQVBQLFNBQWtCLGNBQWMsZ0JBQWtELE1BQU0sQ0FBQyxDQUFDO0FBQzFGLFNBQWtCLE9BQU8sZ0JBQTJDLE1BQU0sQ0FBQyxDQUFDO0FBQzVFLFNBQVMsVUFBc0MsQ0FBQztBQUNoRCxTQUFTLFVBQW9GLENBQUM7QUFDOUYsU0FBUyxVQUFvQixDQUFDO0FBSTdCLFNBQUssWUFBWSxJQUFJLGFBQWEsTUFBUztBQUFBLEVBQzVDO0FBQUEsRUFFUyxjQUFjLElBQStDO0FBQ3JFLFdBQU8sS0FBSyxZQUFZLElBQUksRUFBRSxLQUFLLGdCQUFjLFdBQVcsT0FBTyxFQUFFO0FBQUEsRUFDdEU7QUFBQSxFQUVTLFFBQVEsY0FBc0I7QUFDdEMsV0FBTyxnQkFBZ0IsS0FBSyxLQUFLLElBQUksRUFBRSxPQUFPLFNBQU8sSUFBSSxpQkFBaUIsWUFBWSxDQUFDO0FBQUEsRUFDeEY7QUFBQSxFQUVTLGdCQUFnQixjQUFrRDtBQUMxRSxXQUFPLEtBQUssS0FBSyxJQUFJLEVBQUUsS0FBSyxTQUFPLElBQUksaUJBQWlCLGlCQUFpQixJQUFJLFdBQVcsYUFBYSxJQUFJLFdBQVcsVUFBVTtBQUFBLEVBQy9IO0FBQUEsRUFFQSxPQUFPLEtBQTJCO0FBQ2pDLFNBQUssS0FBSyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssS0FBSyxJQUFJLENBQUMsR0FBRyxNQUFTO0FBQUEsRUFDbkQ7QUFBQSxFQUVBLE1BQWUsaUJBQWlCLFNBQW1FO0FBQ2xHLFNBQUssUUFBUSxLQUFLLE9BQU87QUFDekIsV0FBTztBQUFBLE1BQ04sR0FBRztBQUFBLE1BQ0gsSUFBSTtBQUFBLE1BQ0osU0FBUyxRQUFRLFdBQVc7QUFBQSxNQUM1QixXQUFXO0FBQUEsTUFDWCxXQUFXO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWUsaUJBQWlCLElBQVksT0FBaUU7QUFDNUcsU0FBSyxRQUFRLEtBQUssRUFBRSxJQUFJLE1BQU0sQ0FBQztBQUMvQixVQUFNLFdBQVcsS0FBSyxjQUFjLEVBQUU7QUFDdEMsV0FBTyxHQUFHLFFBQVE7QUFDbEIsV0FBTztBQUFBLE1BQ04sR0FBRztBQUFBLE1BQ0gsTUFBTSxNQUFNLFFBQVEsU0FBUztBQUFBLE1BQzdCLFFBQVEsTUFBTSxVQUFVLFNBQVM7QUFBQSxNQUNqQyxVQUFVLE1BQU0sWUFBWSxTQUFTO0FBQUEsTUFDckMsUUFBUSxNQUFNLFVBQVUsU0FBUztBQUFBLE1BQ2pDLFNBQVMsTUFBTSxZQUFZLE9BQU8sU0FBWSxNQUFNLFdBQVcsU0FBUztBQUFBLE1BQ3hFLE1BQU0sTUFBTSxTQUFTLE9BQU8sU0FBWSxNQUFNLFFBQVEsU0FBUztBQUFBLE1BQy9ELGlCQUFpQixNQUFNLG9CQUFvQixPQUFPLFNBQVksTUFBTSxtQkFBbUIsU0FBUztBQUFBLE1BQ2hHLFNBQVMsTUFBTSxXQUFXLFNBQVM7QUFBQSxNQUNuQyxXQUFXO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWUsNEJBQTRCLElBQVksT0FBaUMsVUFBMEU7QUFDakssVUFBTSxVQUFVLEtBQUssY0FBYyxFQUFFO0FBQ3JDLFFBQUksQ0FBQyxXQUFXLHNCQUFzQixPQUFPLE1BQU0sc0JBQXNCLFFBQVEsR0FBRztBQUNuRixhQUFPLEVBQUUsTUFBTSxZQUFZLFFBQVE7QUFBQSxJQUNwQztBQUNBLFdBQU8sRUFBRSxNQUFNLFdBQVcsWUFBWSxNQUFNLEtBQUssaUJBQWlCLElBQUksS0FBSyxFQUFFO0FBQUEsRUFDOUU7QUFBQSxFQUVBLE1BQWUsaUJBQWlCLElBQTJCO0FBQzFELFNBQUssUUFBUSxLQUFLLEVBQUU7QUFDcEIsU0FBSyxZQUFZLElBQUksS0FBSyxZQUFZLElBQUksRUFBRSxPQUFPLGdCQUFjLFdBQVcsT0FBTyxFQUFFLEdBQUcsTUFBUztBQUFBLEVBQ2xHO0FBQ0Q7QUFFQSxNQUFNLGtDQUFrQyxLQUF3QixFQUFFO0FBQUEsRUFjakUsWUFBNkIsbUJBQTBDO0FBQ3RFLFVBQU07QUFEc0I7QUFiN0IsU0FBUyxRQUtKLENBQUM7QUFDTixTQUFTLFNBQThCLENBQUM7QUFDeEMsMEJBQWdDLFFBQVEsUUFBUTtBQUNoRCx5QkFBK0IsUUFBUSxRQUFRO0FBQy9DLHFCQUFzQztBQUFBLEVBTXRDO0FBQUEsRUFFUyxRQUFRLFlBQW1DLFNBQStCLGdCQUF3QixRQUEyQixrQkFBa0IsTUFBK0I7QUFDdEwsU0FBSyxNQUFNLEtBQUs7QUFBQSxNQUNmLGNBQWMsV0FBVztBQUFBLE1BQ3pCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsV0FBVyxNQUFNO0FBQUEsSUFDbEIsQ0FBQztBQUNELFNBQUssT0FBTyxLQUFLLEtBQUs7QUFDdEIsVUFBTSxpQkFBaUIsS0FBSyxlQUFlLEtBQTZCLE1BQU07QUFFN0UsWUFBTSxZQUFZLEtBQUssa0JBQWtCLGdCQUFnQixXQUFXLEVBQUU7QUFDdEUsVUFBSSxXQUFXO0FBQ2QsZUFBTyxFQUFFLE1BQU0sa0JBQWtCLFVBQVU7QUFBQSxNQUM1QztBQUNBLFVBQUksS0FBSyxZQUFZO0FBQ3BCLGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFDQSxZQUFNLGtCQUFrQjtBQUN4QixZQUFNLE1BQXNCO0FBQUEsUUFDM0IsSUFBSTtBQUFBLFFBQ0osY0FBYyxXQUFXO0FBQUEsUUFDekIsUUFBUSxLQUFLO0FBQUEsUUFDYjtBQUFBLFFBQ0E7QUFBQSxRQUNBLFdBQVc7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUNBLFdBQUssa0JBQWtCLE9BQU8sR0FBRztBQUNqQyxhQUFPLEVBQUUsTUFBTSxXQUFXLEtBQUssZ0JBQWdCO0FBQUEsSUFDaEQsQ0FBQztBQUNELFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxlQUFlLFFBQVEsSUFBSSxDQUFDLGdCQUFnQixLQUFLLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTSxNQUFTO0FBQUEsSUFDdEY7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLHFDQUEwRTtBQUFBLEVBVS9FLFlBQW9CLGNBQWtDO0FBQWxDO0FBTnBCLFNBQVMsY0FBYyxJQUFJLGdCQUFzQjtBQUlqRCwrQkFBc0I7QUFBQSxFQUVrQztBQUFBLEVBRXhELElBQUksUUFBNEI7QUFDL0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsTUFBTSxLQUFLLE1BQTJDO0FBQ3JELFVBQU0sS0FBSyxZQUFZLFNBQVM7QUFDaEMsVUFBTSxLQUFLLGFBQWE7QUFDeEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsTUFBTSxlQUFlLE1BQWMsZUFBbUMsVUFBbUU7QUFDeEksU0FBSztBQUNMLFNBQUssdUJBQXVCO0FBQzVCLFFBQUksS0FBSyxzQkFBc0IsUUFBVztBQUN6QyxZQUFNLGVBQWUsS0FBSztBQUMxQixXQUFLLG9CQUFvQjtBQUN6QixXQUFLLGVBQWU7QUFDcEIsYUFBTyxFQUFFLFNBQVMsT0FBTyxhQUFhO0FBQUEsSUFDdkM7QUFDQSxRQUFJLEtBQUssaUJBQWlCLGVBQWU7QUFDeEMsYUFBTyxFQUFFLFNBQVMsT0FBTyxjQUFjLEtBQUssYUFBYTtBQUFBLElBQzFEO0FBQ0EsU0FBSyxlQUFlO0FBQ3BCLFdBQU8sRUFBRSxTQUFTLE1BQU0sY0FBYyxTQUFTO0FBQUEsRUFDaEQ7QUFDRDtBQUVBLFNBQVMsc0JBQXNCLFlBQTJDO0FBQ3pFLFNBQU8sS0FBSyxVQUFVO0FBQUEsSUFDckIsTUFBTSxXQUFXO0FBQUEsSUFDakIsUUFBUSxXQUFXO0FBQUEsSUFDbkIsVUFBVSxXQUFXO0FBQUEsSUFDckIsUUFBUSxXQUFXLE9BQU8sU0FBUyxjQUNoQyxFQUFFLEdBQUcsV0FBVyxRQUFRLFdBQVcsV0FBVyxPQUFPLFVBQVUsU0FBUyxFQUFFLElBQzFFLFdBQVc7QUFBQSxJQUNkLFNBQVMsV0FBVztBQUFBLElBQ3BCLE1BQU0sV0FBVztBQUFBLElBQ2pCLGlCQUFpQixXQUFXO0FBQUEsSUFDNUIsU0FBUyxXQUFXO0FBQUEsRUFDckIsQ0FBQztBQUNGO0FBRUEsU0FBUywwQkFBMEIsYUFBK0MsV0FBVyxHQUFXO0FBQ3ZHLFNBQU8sS0FBSyxVQUFVO0FBQUEsSUFDckIsZUFBZTtBQUFBLElBQ2Y7QUFBQSxJQUNBLGFBQWEsWUFBWSxJQUFJLGlCQUFlO0FBQUEsTUFDM0MsR0FBRztBQUFBLE1BQ0gsUUFBUSxXQUFXLE9BQU8sU0FBUyxjQUNoQyxFQUFFLEdBQUcsV0FBVyxRQUFRLFdBQVcsV0FBVyxPQUFPLFVBQVUsT0FBTyxFQUFFLElBQ3hFLFdBQVc7QUFBQSxJQUNmLEVBQUU7QUFBQSxJQUNGLE1BQU0sQ0FBQztBQUFBLEVBQ1IsQ0FBQztBQUNGO0FBRUEsTUFBTSxzQ0FBc0MsS0FBaUMsRUFBRTtBQUFBLEVBRzlFLFlBQ2tCLFNBQ0EsMEJBQTBCLE9BQzFCLHFCQUFzRCxDQUFDLEdBQ3ZELHdCQUF5RCxDQUFDLEdBQzFFO0FBQ0QsVUFBTTtBQUxXO0FBQ0E7QUFDQTtBQUNBO0FBQUEsRUFHbEI7QUFBQSxFQUVTLGFBQW1DO0FBQzNDLFdBQU8sS0FBSywwQkFBMEIsU0FBWSxLQUFLO0FBQUEsRUFDeEQ7QUFBQSxFQUVTLDRCQUE0RTtBQUNwRixXQUFPLEtBQUssMkJBQTJCLEtBQUssVUFDekMsRUFBRSxTQUFTLEtBQUssU0FBUyxNQUFNLGNBQXFCLEVBQUUsVUFBVSxjQUFjLENBQUMsRUFBRSxJQUNqRjtBQUFBLEVBQ0o7QUFBQSxFQUVTLDJCQUFtRDtBQUMzRCxTQUFLLDhCQUE4QjtBQUNuQyxXQUFPLENBQUMsR0FBRyxLQUFLLGtCQUFrQjtBQUFBLEVBQ25DO0FBQUEsRUFFUywyQkFBbUQ7QUFDM0QsV0FBTyxDQUFDLEdBQUcsS0FBSyxxQkFBcUI7QUFBQSxFQUN0QztBQUNEO0FBRUEsU0FBUywyQkFBMkIsVUFBVSxNQUFnQztBQUM3RSxRQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUMxRCx1QkFBcUIscUJBQXFCLGtDQUFrQyxPQUFPO0FBQ25GLFNBQU87QUFDUjtBQUVBLFNBQVMsY0FBYyxTQUFnRjtBQUN0RyxRQUFNLFlBQVksU0FBUyxjQUFjLFNBQ3RDLFNBQ0EsY0FBaUMsRUFBRSxLQUFLLFFBQVEsVUFBVSxDQUFDO0FBQzlELFNBQU8sY0FBd0I7QUFBQSxJQUM5QixVQUFVO0FBQUEsSUFDVixZQUFZO0FBQUEsSUFDWixhQUFhO0FBQUEsSUFDYixXQUFXLGdCQUFnQixTQUFTO0FBQUEsSUFDcEMsYUFBYSxnQkFBZ0IsU0FBUyxjQUFjLElBQUk7QUFBQSxFQUN6RCxDQUFDO0FBQ0Y7QUFFQSxTQUFTLG9CQUFvQixZQUFvQixlQUF1QixnQ0FBZ0MsT0FBNkI7QUFDcEksU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLGFBQWEsY0FBNEIsRUFBRSxJQUFJLGVBQWUsOEJBQThCLENBQUM7QUFBQSxFQUM5RjtBQUNEO0FBRUEsZUFBZSxPQUFPLE1BQWlCLFlBQXFDLGtCQUFrQixrQkFBa0IsUUFBUSxrQkFBa0IsTUFBTSxzQkFBK0Isa0JBQThFO0FBQzVQLFNBQU8sS0FBSyxPQUFPO0FBQUEsSUFDbEIsUUFBUTtBQUFBLElBQ1IsUUFBUTtBQUFBLElBQ1I7QUFBQSxJQUNBLFNBQVMsRUFBRSxnQkFBZ0I7QUFBQSxJQUMzQjtBQUFBLElBQ0E7QUFBQSxFQUNELEdBQUcsWUFBWSxHQUFHLFVBQVUsS0FBSztBQUNsQztBQUVBLFNBQVMsUUFBUSxRQUE2QjtBQUM3QyxRQUFNLE9BQU8sT0FBTyxRQUFRLENBQUM7QUFDN0IsTUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTLFFBQVE7QUFDbEMsV0FBTyxLQUFLLDhCQUE4QjtBQUFBLEVBQzNDO0FBQ0EsU0FBTyxLQUFLO0FBQ2I7QUFFQSxNQUFNLG1CQUFtQixNQUFNO0FBQzlCLFFBQU0sV0FBVyx3Q0FBd0M7QUFFekQsV0FBUywyQkFBMkIsS0FBeUIsMEJBQXdFO0FBQ3BJLFVBQU0saUJBQWlCLFNBQVMsSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ2hFLFFBQUksUUFBUSxRQUFXO0FBQ3RCLHFCQUFlLE1BQU0sd0JBQXdCLEtBQUssYUFBYSxhQUFhLGNBQWMsT0FBTztBQUFBLElBQ2xHO0FBQ0EsV0FBTyxTQUFTLElBQUksSUFBSSxrQkFBa0IsZ0JBQWdCLElBQUksZUFBZSxHQUFHLHNCQUFzQix3QkFBd0IsQ0FBQztBQUFBLEVBQ2hJO0FBRUEsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxVQUFNLHVCQUF1QiwyQkFBMkI7QUFDeEQsVUFBTSxVQUFVLElBQUk7QUFBQSxNQUNuQjtBQUFBLE1BQ0EsSUFBSSwwQkFBMEIsaUJBQWlCO0FBQUEsTUFDL0M7QUFBQSxJQUNELEVBQUUsWUFBWTtBQUNkLFVBQU0sV0FBVyxJQUFJLG9CQUFvQixtQkFBbUIsb0JBQW9CLEVBQUUsWUFBWTtBQUM5RixVQUFNLGFBQWEsSUFBSSxxQkFBcUIsbUJBQW1CLG9CQUFvQixFQUFFLFlBQVk7QUFDakcsVUFBTSxnQkFBZ0IsSUFBSTtBQUFBLE1BQ3pCO0FBQUEsTUFDQSxJQUFJLDhCQUE4QixNQUFTO0FBQUEsTUFDM0M7QUFBQSxJQUNELEVBQUUsWUFBWTtBQUVkLFVBQU0sWUFBWSxDQUFDLFNBQTBCLEtBQUssTUFBTSxVQUFVLEtBQUs7QUFDdkUsV0FBTyxnQkFBZ0IsQ0FBQyxVQUFVLGVBQWUsU0FBUyxVQUFVLEVBQUUsSUFBSSxXQUFTO0FBQUEsTUFDbEYsSUFBSSxLQUFLO0FBQUEsTUFDVCxlQUFlLEtBQUs7QUFBQSxNQUNwQixlQUFlLFVBQVUsSUFBSSxFQUFFLFNBQVMsZ0JBQWdCLFFBQVEsR0FBRztBQUFBLE1BQ25FLHdCQUF3QixVQUFVLElBQUksRUFBRSxTQUFTLDhCQUE4QixHQUFHO0FBQUEsTUFDbEYsaUJBQWlCLEtBQUs7QUFBQSxJQUN2QixFQUFFLEdBQUc7QUFBQSxNQUNKO0FBQUEsUUFDQyxJQUFJO0FBQUEsUUFDSixlQUFlO0FBQUEsUUFDZixlQUFlO0FBQUEsUUFDZix3QkFBd0I7QUFBQSxRQUN4QixpQkFBaUI7QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQSxRQUNDLElBQUk7QUFBQSxRQUNKLGVBQWU7QUFBQSxRQUNmLGVBQWU7QUFBQSxRQUNmLHdCQUF3QjtBQUFBLFFBQ3hCLGlCQUFpQjtBQUFBLE1BQ2xCO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSTtBQUFBLFFBQ0osZUFBZTtBQUFBLFFBQ2YsZUFBZTtBQUFBLFFBQ2Ysd0JBQXdCO0FBQUEsUUFDeEIsaUJBQWlCO0FBQUEsTUFDbEI7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJO0FBQUEsUUFDSixlQUFlO0FBQUEsUUFDZixlQUFlO0FBQUEsUUFDZix3QkFBd0I7QUFBQSxRQUN4QixpQkFBaUI7QUFBQSxNQUNsQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMERBQTBELFlBQVk7QUFDMUUsVUFBTSxhQUFhLGlCQUFpQjtBQUNwQyxVQUFNLE9BQU8sSUFBSSxvQkFBb0IsSUFBSSxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsR0FBRywyQkFBMkIsQ0FBQztBQUUxRyxVQUFNLFNBQVMsTUFBTSxPQUFPLE1BQU0sQ0FBQyxDQUFDO0FBRXBDLFdBQU8sZ0JBQWdCLEtBQUssTUFBTSxRQUFRLE1BQU0sQ0FBQyxHQUFHO0FBQUEsTUFDbkQsYUFBYSxDQUFDO0FBQUEsUUFDYixJQUFJO0FBQUEsUUFDSixNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsUUFDUixVQUFVLEVBQUUsVUFBVSxTQUFTLGNBQWMsR0FBRyxnQkFBZ0IsR0FBRyxhQUFhLEVBQUU7QUFBQSxRQUNsRixRQUFRO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixXQUFXO0FBQUEsVUFDWCxZQUFZO0FBQUEsVUFDWixlQUFlO0FBQUEsVUFDZixXQUFXLEVBQUUsTUFBTSxVQUFVO0FBQUEsUUFDOUI7QUFBQSxRQUNBLFNBQVM7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLGlCQUFpQjtBQUFBLFFBQ2pCLFNBQVM7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxNQUNaLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtEQUFrRCxZQUFZO0FBQ2xFLFVBQU0sYUFBYSxpQkFBaUI7QUFDcEMsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0IsQ0FBQyxVQUFVLENBQUM7QUFDaEUsVUFBTSxTQUFTLElBQUksMEJBQTBCLGlCQUFpQjtBQUM5RCxVQUFNLE9BQU8sSUFBSSxrQkFBa0IsbUJBQW1CLFFBQVEsMkJBQTJCLENBQUM7QUFDMUYsVUFBTSxhQUFhLEVBQUUsY0FBYyxXQUFXLEdBQUc7QUFDakQsVUFBTSx5QkFBeUIsSUFBSSx3QkFBd0I7QUFFM0QsVUFBTSxXQUFXLE1BQU0sS0FBSyxzQkFBdUI7QUFBQSxNQUNsRDtBQUFBLE1BQ0EsWUFBWTtBQUFBLE1BQ1oscUJBQXFCO0FBQUEsSUFDdEIsR0FBRyxrQkFBa0IsSUFBSTtBQUN6QixVQUFNLFVBQVUsU0FBUyxzQkFBc0I7QUFDL0MsVUFBTSxTQUFTLE1BQU0sT0FBTyxNQUFNLFlBQVksa0JBQWtCLHVCQUF1QixLQUFLO0FBQzVGLDJCQUF1QixPQUFPO0FBQzlCLFVBQU0saUNBQWlDLE9BQU8sT0FBTyxDQUFDLEdBQUc7QUFDekQsMkJBQXVCLFFBQVE7QUFFL0IsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixtQkFBbUIsU0FBUyxzQkFBc0I7QUFBQSxNQUNsRCxxQkFBcUIsT0FBTyxZQUFZLFdBQVcsVUFBVSxTQUFTO0FBQUEsTUFDdEUsT0FBTyxPQUFPO0FBQUEsTUFDZDtBQUFBLE1BQ0EsUUFBUSxLQUFLLE1BQU0sUUFBUSxNQUFNLENBQUM7QUFBQSxJQUNuQyxHQUFHO0FBQUEsTUFDRixtQkFBbUI7QUFBQSxNQUNuQixxQkFBcUI7QUFBQSxNQUNyQixPQUFPLENBQUM7QUFBQSxRQUNQLGNBQWM7QUFBQSxRQUNkLFNBQVM7QUFBQSxRQUNULGdCQUFnQjtBQUFBLFFBQ2hCLFdBQVc7QUFBQSxNQUNaLENBQUM7QUFBQSxNQUNELGdDQUFnQztBQUFBLE1BQ2hDLFFBQVE7QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUNSLFlBQVksRUFBRSxJQUFJLGdCQUFnQixNQUFNLGVBQWU7QUFBQSxRQUN2RCxLQUFLO0FBQUEsVUFDSixJQUFJO0FBQUEsVUFDSixRQUFRO0FBQUEsVUFDUixpQkFBaUIsaUJBQWlCLFNBQVM7QUFBQSxRQUM1QztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZFQUE2RSxZQUFZO0FBQzdGLFVBQU0sYUFBYSxpQkFBaUI7QUFDcEMsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0IsQ0FBQyxVQUFVLENBQUM7QUFDaEUsc0JBQWtCLE9BQU87QUFBQSxNQUN4QixJQUFJO0FBQUEsTUFDSixjQUFjLFdBQVc7QUFBQSxNQUN6QixRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsTUFDVCxpQkFBaUI7QUFBQSxNQUNqQixXQUFXO0FBQUEsTUFDWCxnQkFBZ0I7QUFBQSxJQUNqQixDQUFDO0FBQ0QsVUFBTSxTQUFTLElBQUksMEJBQTBCLGlCQUFpQjtBQUM5RCxVQUFNLE9BQU8sSUFBSSxrQkFBa0IsbUJBQW1CLFFBQVEsMkJBQTJCLENBQUM7QUFDMUYsVUFBTSxhQUFhLEVBQUUsY0FBYyxXQUFXLEdBQUc7QUFFakQsVUFBTSxXQUFXLE1BQU0sS0FBSyxzQkFBdUI7QUFBQSxNQUNsRDtBQUFBLE1BQ0EsWUFBWTtBQUFBLE1BQ1oscUJBQXFCO0FBQUEsSUFDdEIsR0FBRyxrQkFBa0IsSUFBSTtBQUN6QixVQUFNLFNBQVMsTUFBTSxPQUFPLE1BQU0sVUFBVTtBQUU1QyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGNBQWMsU0FBUztBQUFBO0FBQUEsTUFFdkIsYUFBYSxrQkFBa0IsS0FBSyxJQUFJLEVBQUU7QUFBQSxNQUMxQyxRQUFRLEtBQUssTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUFBLElBQ25DLEdBQUc7QUFBQSxNQUNGLGNBQWM7QUFBQSxNQUNkLGFBQWE7QUFBQSxNQUNiLFFBQVE7QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUNSLFlBQVksRUFBRSxJQUFJLGdCQUFnQixNQUFNLGVBQWU7QUFBQSxRQUN2RCxLQUFLO0FBQUEsVUFDSixJQUFJO0FBQUEsVUFDSixRQUFRO0FBQUEsVUFDUixpQkFBaUIsaUJBQWlCLFNBQVM7QUFBQSxRQUM1QztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDREQUE0RCxZQUFZO0FBQzVFLFVBQU0sYUFBYSxpQkFBaUI7QUFDcEMsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0IsQ0FBQyxVQUFVLENBQUM7QUFDaEUsVUFBTSxTQUFTLElBQUksMEJBQTBCLGlCQUFpQjtBQUM5RCxXQUFPLGFBQWEsRUFBRSxNQUFNLGNBQWMsUUFBUSxvQkFBb0I7QUFDdEUsVUFBTSxPQUFPLElBQUksa0JBQWtCLG1CQUFtQixRQUFRLDJCQUEyQixDQUFDO0FBRTFGLFVBQU0sU0FBUyxNQUFNLE9BQU8sTUFBTSxFQUFFLGNBQWMsV0FBVyxHQUFHLENBQUM7QUFFakUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixPQUFPLE9BQU87QUFBQSxNQUNkLE9BQU8sT0FBTyxNQUFNO0FBQUEsSUFDckIsR0FBRztBQUFBLE1BQ0YsT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0VBQW9FLFlBQVk7QUFDcEYsVUFBTSxhQUFhLGlCQUFpQjtBQUNwQyxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDLFVBQVUsQ0FBQztBQUNoRSxVQUFNLE9BQU8sSUFBSSxxQkFBcUIsbUJBQW1CLDJCQUEyQixDQUFDO0FBQ3JGLFVBQU0sYUFBYSxFQUFFLGNBQWMsV0FBVyxHQUFHO0FBRWpELFVBQU0sV0FBVyxNQUFNLEtBQUssc0JBQXVCO0FBQUEsTUFDbEQ7QUFBQSxNQUNBLFlBQVk7QUFBQSxNQUNaLHFCQUFxQjtBQUFBLElBQ3RCLEdBQUcsa0JBQWtCLElBQUk7QUFDekIsVUFBTSxVQUFVLFVBQVUsc0JBQXNCO0FBQ2hELFVBQU0sU0FBUyxNQUFNLE9BQU8sTUFBTSxZQUFZLGtCQUFrQixrQkFBa0IsTUFBTSxRQUFRO0FBRWhHLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsbUJBQW1CLFVBQVUsc0JBQXNCO0FBQUEsTUFDbkQscUJBQXFCLE9BQU8sWUFBWSxXQUFXLFVBQVUsU0FBUztBQUFBLE1BQ3RFLGtCQUFrQixVQUFVLHNCQUFzQjtBQUFBLE1BQ2xELFNBQVMsVUFBVSxzQkFBc0I7QUFBQSxNQUN6QyxTQUFTLGtCQUFrQjtBQUFBLE1BQzNCLGFBQWEsa0JBQWtCLFlBQVksSUFBSTtBQUFBLE1BQy9DLFFBQVEsS0FBSyxNQUFNLFFBQVEsTUFBTSxDQUFDO0FBQUEsSUFDbkMsR0FBRztBQUFBLE1BQ0YsbUJBQW1CO0FBQUEsTUFDbkIscUJBQXFCO0FBQUEsTUFDckIsa0JBQWtCO0FBQUEsTUFDbEIsU0FBUztBQUFBLFFBQ1IsRUFBRSxJQUFJLFVBQVUsT0FBTyxVQUFVLE1BQU0sdUJBQXVCLFFBQVE7QUFBQSxRQUN0RSxFQUFFLElBQUksVUFBVSxPQUFPLFVBQVUsTUFBTSx1QkFBdUIsS0FBSztBQUFBLE1BQ3BFO0FBQUEsTUFDQSxTQUFTLENBQUMsY0FBYztBQUFBLE1BQ3hCLGFBQWEsQ0FBQztBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsWUFBWSxFQUFFLElBQUksZ0JBQWdCLE1BQU0sZUFBZTtBQUFBLE1BQ3hEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwREFBMEQsWUFBWTtBQUMxRSxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxVQUFNLE9BQU8sSUFBSSxxQkFBcUIsbUJBQW1CLDJCQUEyQixDQUFDO0FBQ3JGLFVBQU0sYUFBYSxFQUFFLGNBQWMsVUFBVTtBQUU3QyxVQUFNLE9BQU87QUFBQSxNQUNaLEtBQUssc0JBQXVCO0FBQUEsUUFDM0I7QUFBQSxRQUNBLFlBQVk7QUFBQSxRQUNaLHFCQUFxQjtBQUFBLE1BQ3RCLEdBQUcsa0JBQWtCLElBQUk7QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsTUFBTSxPQUFPLE1BQU0sWUFBWSxrQkFBa0Isa0JBQWtCLE1BQU0sUUFBUTtBQUVoRyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE9BQU8sT0FBTztBQUFBLE1BQ2QsU0FBUyxrQkFBa0I7QUFBQSxJQUM1QixHQUFHO0FBQUEsTUFDRixPQUFPO0FBQUEsTUFDUCxTQUFTLENBQUM7QUFBQSxJQUNYLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1EQUFtRCxZQUFZO0FBQ25FLFVBQU0sYUFBYSxpQkFBaUI7QUFDcEMsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0IsQ0FBQyxVQUFVLENBQUM7QUFDaEUsVUFBTSxPQUFPLElBQUkscUJBQXFCLG1CQUFtQiwyQkFBMkIsQ0FBQztBQUVyRixVQUFNLFNBQVMsTUFBTSxPQUFPLE1BQU0sRUFBRSxjQUFjLFdBQVcsR0FBRyxHQUFHLGtCQUFrQixrQkFBa0IsTUFBTSxRQUFRO0FBRXJILFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxLQUFLLE1BQU0sUUFBUSxNQUFNLENBQUM7QUFBQSxNQUNsQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzNCLGFBQWEsa0JBQWtCLFlBQVksSUFBSTtBQUFBLElBQ2hELEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxNQUNWO0FBQUEsTUFDQSxTQUFTLENBQUM7QUFBQSxNQUNWLGFBQWEsQ0FBQyxVQUFVO0FBQUEsSUFDekIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0VBQWdFLFlBQVk7QUFDaEYsVUFBTSxhQUFhLGlCQUFpQjtBQUNwQyxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDLFVBQVUsQ0FBQztBQUNoRSxVQUFNLE9BQU8sSUFBSSxxQkFBcUIsbUJBQW1CLDJCQUEyQixDQUFDO0FBRXJGLFVBQU0sU0FBUyxNQUFNO0FBQUEsTUFDcEI7QUFBQSxNQUNBLEVBQUUsY0FBYyxXQUFXLEdBQUc7QUFBQSxNQUM5QjtBQUFBLE1BQ0Esa0JBQWtCO0FBQUEsSUFDbkI7QUFFQSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFFBQVEsS0FBSyxNQUFNLFFBQVEsTUFBTSxDQUFDO0FBQUEsTUFDbEMsU0FBUyxrQkFBa0I7QUFBQSxNQUMzQixhQUFhLGtCQUFrQixZQUFZLElBQUk7QUFBQSxJQUNoRCxHQUFHO0FBQUEsTUFDRixRQUFRO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixZQUFZLEVBQUUsSUFBSSxXQUFXLElBQUksTUFBTSxXQUFXLEtBQUs7QUFBQSxNQUN4RDtBQUFBLE1BQ0EsU0FBUyxDQUFDLFdBQVcsRUFBRTtBQUFBLE1BQ3ZCLGFBQWEsQ0FBQztBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0RBQWtELFlBQVk7QUFDbEUsVUFBTSxhQUFhLGlCQUFpQjtBQUNwQyxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDLFVBQVUsQ0FBQztBQUNoRSxVQUFNLGNBQWMsSUFBSSx3QkFBd0I7QUFDaEQsZ0JBQVksT0FBTztBQUNuQixVQUFNLE9BQU8sSUFBSSxxQkFBcUIsbUJBQW1CLDJCQUEyQixDQUFDO0FBRXJGLFVBQU0sU0FBUyxNQUFNLE9BQU8sTUFBTSxFQUFFLGNBQWMsV0FBVyxHQUFHLEdBQUcsa0JBQWtCLFlBQVksT0FBTyxRQUFRO0FBQ2hILGdCQUFZLFFBQVE7QUFFcEIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixRQUFRLEtBQUssTUFBTSxRQUFRLE1BQU0sQ0FBQztBQUFBLE1BQ2xDLFNBQVMsa0JBQWtCO0FBQUEsTUFDM0IsYUFBYSxrQkFBa0IsWUFBWSxJQUFJO0FBQUEsSUFDaEQsR0FBRztBQUFBLE1BQ0YsUUFBUTtBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLE1BQ1Y7QUFBQSxNQUNBLFNBQVMsQ0FBQztBQUFBLE1BQ1YsYUFBYSxDQUFDLFVBQVU7QUFBQSxJQUN6QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1RUFBdUUsWUFBWTtBQUN2RixVQUFNLFdBQVcsaUJBQWlCO0FBQ2xDLFVBQU0sT0FBTyxJQUFJO0FBQUEsTUFDaEIsSUFBSSxzQkFBc0IsQ0FBQyxRQUFRLENBQUM7QUFBQSxNQUNwQyxJQUFJLDhCQUE4QixjQUFjLEVBQUUsV0FBVyxPQUFPLENBQUMsQ0FBQztBQUFBLE1BQ3RFLDJCQUEyQjtBQUFBLElBQzVCO0FBQ0EsVUFBTSxpQkFBaUIsTUFBTSxLQUFLLHNCQUF1QjtBQUFBLE1BQ3hELFlBQVk7QUFBQSxRQUNYLE1BQU07QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLFVBQVUsRUFBRSxVQUFVLFFBQVE7QUFBQSxNQUMvQjtBQUFBLE1BQ0EsWUFBWTtBQUFBLE1BQ1oscUJBQXFCO0FBQUEsSUFDdEIsR0FBRyxrQkFBa0IsSUFBSTtBQUN6QixVQUFNLGlCQUFpQixNQUFNLEtBQUssc0JBQXVCO0FBQUEsTUFDeEQsWUFBWSxFQUFFLGNBQWMsU0FBUyxJQUFJLE1BQU0saUJBQWlCO0FBQUEsTUFDaEUsWUFBWTtBQUFBLE1BQ1oscUJBQXFCO0FBQUEsSUFDdEIsR0FBRyxrQkFBa0IsSUFBSTtBQUV6QixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFFBQVE7QUFBQSxRQUNQLE9BQU8sZUFBZSxzQkFBc0I7QUFBQSxRQUM1QyxTQUFTLE9BQU8sZUFBZSxzQkFBc0IsWUFBWSxXQUM5RCxlQUFlLHFCQUFxQixVQUNwQyxlQUFlLHNCQUFzQixTQUFTO0FBQUEsUUFDakQsa0JBQWtCLGVBQWU7QUFBQSxNQUNsQztBQUFBLE1BQ0EsUUFBUTtBQUFBLFFBQ1AsT0FBTyxlQUFlLHNCQUFzQjtBQUFBLFFBQzVDLFNBQVMsT0FBTyxlQUFlLHNCQUFzQixZQUFZLFdBQzlELGVBQWUscUJBQXFCLFVBQ3BDLGVBQWUsc0JBQXNCLFNBQVM7QUFBQSxRQUNqRCxZQUFZLGVBQWUsa0JBQWtCLFNBQVMsNEJBQ25ELGVBQWUsaUJBQWlCLHVCQUNoQztBQUFBLE1BQ0o7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxRQUNQLE9BQU87QUFBQSxRQUNQLFNBQVM7QUFBQSxRQUNULGtCQUFrQjtBQUFBLE1BQ25CO0FBQUEsTUFDQSxRQUFRO0FBQUEsUUFDUCxPQUFPO0FBQUEsUUFDUCxTQUFTO0FBQUEsUUFDVCxZQUFZLFNBQVM7QUFBQSxNQUN0QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0ZBQStGLFlBQVk7QUFDL0csVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0I7QUFDcEQsVUFBTSxTQUEyQjtBQUFBLE1BQ2hDLE1BQU07QUFBQSxNQUNOLFlBQVk7QUFBQSxNQUNaLGVBQWU7QUFBQSxJQUNoQjtBQUNBLFVBQU0sV0FBZ0MsRUFBRSxVQUFVLFNBQVMsY0FBYyxHQUFHLGdCQUFnQixJQUFJLGFBQWEsRUFBRTtBQUMvRyxVQUFNLE9BQU8sSUFBSTtBQUFBLE1BQ2hCO0FBQUEsTUFDQSxJQUFJLDhCQUE4QixjQUFjLEVBQUUsV0FBVyxLQUFLLENBQUMsR0FBRyxJQUFJO0FBQUEsTUFDMUUsMkJBQTJCO0FBQUEsSUFDNUI7QUFFQSxVQUFNLFNBQVMsTUFBTSxPQUFPLE1BQU07QUFBQSxNQUNqQyxNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixVQUFVLEVBQUUsVUFBVSxTQUFTLGNBQWMsR0FBRyxnQkFBZ0IsR0FBRztBQUFBLE1BQ25FLFNBQVM7QUFBQSxJQUNWLEdBQUcsYUFBYTtBQUVoQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFNBQVMsa0JBQWtCO0FBQUEsTUFDM0IsUUFBUSxLQUFLLE1BQU0sUUFBUSxNQUFNLENBQUMsRUFBRTtBQUFBLE1BQ3BDLGtCQUFrQixPQUFPO0FBQUEsSUFDMUIsR0FBRztBQUFBLE1BQ0YsU0FBUyxDQUFDO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsUUFDUjtBQUFBLFFBQ0E7QUFBQSxRQUNBLFNBQVM7QUFBQSxNQUNWLENBQUM7QUFBQSxNQUNELFFBQVE7QUFBQSxNQUNSLGtCQUFrQjtBQUFBLFFBQ2pCLE1BQU07QUFBQSxRQUNOLGNBQWM7QUFBQSxRQUNkLGdCQUFnQjtBQUFBLFFBQ2hCLFdBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRkFBMEYsWUFBWTtBQUMxRyxVQUFNLFdBQVcsaUJBQWlCO0FBQ2xDLFVBQU0sb0JBQW9CLElBQUksc0JBQXNCLENBQUMsUUFBUSxDQUFDO0FBQzlELFVBQU0sT0FBTyxJQUFJO0FBQUEsTUFDaEI7QUFBQSxNQUNBLElBQUksOEJBQThCLE1BQVM7QUFBQSxNQUMzQywyQkFBMkI7QUFBQSxJQUM1QjtBQUNBLFVBQU0sYUFBYTtBQUFBLE1BQ2xCLGNBQWMsU0FBUztBQUFBLE1BQ3ZCLE1BQU07QUFBQSxNQUNOLFVBQVUsRUFBRSxnQkFBZ0IsR0FBRztBQUFBLE1BQy9CLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLGlCQUFpQjtBQUFBLElBQ2xCO0FBQ0EsVUFBTSxXQUFXLE1BQU0sS0FBSyxzQkFBdUI7QUFBQSxNQUNsRDtBQUFBLE1BQ0EsWUFBWTtBQUFBLE1BQ1oscUJBQXFCO0FBQUEsSUFDdEIsR0FBRyxrQkFBa0IsSUFBSTtBQUV6QixVQUFNLFNBQVMsTUFBTSxPQUFPLE1BQU0sWUFBWSxrQkFBa0Isa0JBQWtCLE1BQU0sUUFBVyxTQUFTLGdCQUFnQjtBQUU1SCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFNBQVMsa0JBQWtCO0FBQUEsTUFDM0IsUUFBUSxLQUFLLE1BQU0sUUFBUSxNQUFNLENBQUMsRUFBRTtBQUFBLE1BQ3BDLGtCQUFrQixPQUFPO0FBQUEsSUFDMUIsR0FBRztBQUFBLE1BQ0YsU0FBUyxDQUFDO0FBQUEsUUFDVCxJQUFJLFNBQVM7QUFBQSxRQUNiLE9BQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLFVBQVUsRUFBRSxHQUFHLFNBQVMsVUFBVSxnQkFBZ0IsR0FBRztBQUFBLFVBQ3JELFNBQVM7QUFBQSxVQUNULE1BQU07QUFBQSxVQUNOLGlCQUFpQjtBQUFBLFFBQ2xCO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxRQUFRO0FBQUEsTUFDUixrQkFBa0I7QUFBQSxRQUNqQixNQUFNO0FBQUEsUUFDTixjQUFjLFNBQVM7QUFBQSxRQUN2QixnQkFBZ0I7QUFBQSxRQUNoQixXQUFXO0FBQUEsTUFDWjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkVBQTZFLFlBQVk7QUFDN0YsVUFBTSxXQUFXLGlCQUFpQjtBQUNsQyxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDLFFBQVEsQ0FBQztBQUM5RCxVQUFNLE9BQU8sSUFBSTtBQUFBLE1BQ2hCO0FBQUEsTUFDQSxJQUFJLDhCQUE4QixNQUFTO0FBQUEsTUFDM0MsMkJBQTJCO0FBQUEsSUFDNUI7QUFDQSxVQUFNLGFBQWEsRUFBRSxjQUFjLFNBQVMsSUFBSSxNQUFNLGdCQUFnQjtBQUN0RSxVQUFNLFdBQVcsTUFBTSxLQUFLLHNCQUF1QjtBQUFBLE1BQ2xEO0FBQUEsTUFDQSxZQUFZO0FBQUEsTUFDWixxQkFBcUI7QUFBQSxJQUN0QixHQUFHLGtCQUFrQixJQUFJO0FBQ3pCLHNCQUFrQixZQUFZLElBQUk7QUFBQSxNQUNqQyxFQUFFLEdBQUcsVUFBVSxRQUFRLDZCQUE2QixXQUFXLDJCQUEyQjtBQUFBLElBQzNGLEdBQUcsTUFBUztBQUVaLFVBQU0sU0FBUyxNQUFNLE9BQU8sTUFBTSxZQUFZLGtCQUFrQixrQkFBa0IsTUFBTSxRQUFXLFNBQVMsZ0JBQWdCO0FBRTVILFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTyxPQUFPO0FBQUEsTUFDZCxTQUFTLGtCQUFrQjtBQUFBLElBQzVCLEdBQUc7QUFBQSxNQUNGLE9BQU87QUFBQSxNQUNQLFNBQVMsQ0FBQztBQUFBLElBQ1gsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0ZBQWdGLFlBQVk7QUFDaEcsVUFBTSxXQUFXLGlCQUFpQjtBQUNsQyxVQUFNLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDLFFBQVEsQ0FBQztBQUM5RCxVQUFNLE9BQU8sSUFBSTtBQUFBLE1BQ2hCO0FBQUEsTUFDQSxJQUFJLDhCQUE4QixNQUFTO0FBQUEsTUFDM0MsMkJBQTJCO0FBQUEsSUFDNUI7QUFDQSxVQUFNLGFBQWEsRUFBRSxjQUFjLFNBQVMsSUFBSSxNQUFNLGdCQUFnQjtBQUN0RSxVQUFNLFdBQVcsTUFBTSxLQUFLLHNCQUF1QjtBQUFBLE1BQ2xEO0FBQUEsTUFDQSxZQUFZO0FBQUEsTUFDWixxQkFBcUI7QUFBQSxJQUN0QixHQUFHLGtCQUFrQixJQUFJO0FBQ3pCLHNCQUFrQixZQUFZLElBQUksQ0FBQztBQUFBLE1BQ2xDLEdBQUc7QUFBQSxNQUNILFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxJQUNaLENBQUMsR0FBRyxNQUFTO0FBRWIsVUFBTSxTQUFTLE1BQU0sT0FBTyxNQUFNLFlBQVksa0JBQWtCLGtCQUFrQixNQUFNLFFBQVcsU0FBUyxnQkFBZ0I7QUFFNUgsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixRQUFRLEtBQUssTUFBTSxRQUFRLE1BQU0sQ0FBQyxFQUFFO0FBQUEsTUFDcEMsU0FBUyxrQkFBa0I7QUFBQSxJQUM1QixHQUFHO0FBQUEsTUFDRixRQUFRO0FBQUEsTUFDUixTQUFTLENBQUMsRUFBRSxJQUFJLFNBQVMsSUFBSSxPQUFPLEVBQUUsTUFBTSxnQkFBZ0IsRUFBRSxDQUFDO0FBQUEsSUFDaEUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUVBQWlFLFlBQVk7QUFDakYsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0I7QUFDcEQsVUFBTSxPQUFPLElBQUk7QUFBQSxNQUNoQjtBQUFBLE1BQ0EsSUFBSTtBQUFBLFFBQ0g7QUFBQSxRQUNBO0FBQUEsUUFDQSxDQUFDLG9CQUFvQixvQkFBb0IsV0FBVyxLQUFLLENBQUM7QUFBQSxNQUMzRDtBQUFBLE1BQ0EsMkJBQTJCO0FBQUEsSUFDNUI7QUFFQSxVQUFNLFNBQVMsTUFBTSxPQUFPLE1BQU07QUFBQSxNQUNqQyxNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixVQUFVLEVBQUUsVUFBVSxTQUFTO0FBQUEsTUFDL0IsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sV0FBVyxPQUFPLFNBQVM7QUFBQSxRQUMzQixZQUFZO0FBQUEsUUFDWixlQUFlO0FBQUEsUUFDZixXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsTUFDVDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTyxPQUFPO0FBQUEsTUFDZCxTQUFTLGtCQUFrQjtBQUFBLElBQzVCLEdBQUc7QUFBQSxNQUNGLE9BQU87QUFBQSxNQUNQLFNBQVMsQ0FBQztBQUFBLElBQ1gsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0VBQXdFLFlBQVk7QUFDeEYsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0I7QUFDcEQsVUFBTSxjQUFjLElBQUksd0JBQXdCO0FBQ2hELGdCQUFZLE9BQU87QUFDbkIsVUFBTSxPQUFPLElBQUk7QUFBQSxNQUNoQjtBQUFBLE1BQ0EsSUFBSSw4QkFBOEIsY0FBYyxFQUFFLFdBQVcsT0FBTyxDQUFDLENBQUM7QUFBQSxNQUN0RSwyQkFBMkI7QUFBQSxJQUM1QjtBQUVBLFVBQU0sU0FBUyxNQUFNLE9BQU8sTUFBTTtBQUFBLE1BQ2pDLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFVBQVUsRUFBRSxVQUFVLFNBQVM7QUFBQSxJQUNoQyxHQUFHLGtCQUFrQixZQUFZLEtBQUs7QUFDdEMsZ0JBQVksUUFBUTtBQUVwQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFFBQVEsS0FBSyxNQUFNLFFBQVEsTUFBTSxDQUFDO0FBQUEsTUFDbEMsU0FBUyxrQkFBa0I7QUFBQSxJQUM1QixHQUFHO0FBQUEsTUFDRixRQUFRO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsTUFDVjtBQUFBLE1BQ0EsU0FBUyxDQUFDO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrRUFBK0UsWUFBWTtBQUMvRixVQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxVQUFNLHVCQUF1QiwyQkFBMkI7QUFDeEQsVUFBTSw0QkFBNEIsSUFBSTtBQUFBLE1BQ3JDO0FBQUEsTUFDQTtBQUFBLE1BQ0EsQ0FBQyxvQkFBb0Isb0JBQW9CLFNBQVMsQ0FBQztBQUFBLElBQ3BEO0FBQ0EsOEJBQTBCLDhCQUE4QixNQUFNLHFCQUFxQixxQkFBcUIsa0NBQWtDLEtBQUs7QUFDL0ksVUFBTSxPQUFPLElBQUksd0JBQXdCLG1CQUFtQiwyQkFBMkIsb0JBQW9CO0FBRTNHLFVBQU0sU0FBUyxNQUFNLE9BQU8sTUFBTTtBQUFBLE1BQ2pDLE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFVBQVUsRUFBRSxVQUFVLFNBQVM7QUFBQSxNQUMvQixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixXQUFXLE9BQU8sU0FBUztBQUFBLFFBQzNCLFlBQVk7QUFBQSxRQUNaLGVBQWU7QUFBQSxRQUNmLFdBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixPQUFPLE9BQU87QUFBQSxNQUNkLFNBQVMsa0JBQWtCO0FBQUEsSUFDNUIsR0FBRztBQUFBLE1BQ0YsT0FBTztBQUFBLE1BQ1AsU0FBUyxDQUFDO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrRkFBa0YsWUFBWTtBQUNsRyxVQUFNLDJCQUEyQixJQUFJLHFDQUFxQyxNQUFTO0FBQ25GLFVBQU0sY0FBYyxJQUFJLGdCQUFzQjtBQUM5Qyw2QkFBeUIsY0FBYztBQUN2QyxVQUFNLG9CQUFvQiwyQkFBMkIsUUFBVyx3QkFBd0I7QUFDeEYsVUFBTSxjQUFjLFNBQVMsSUFBSSxJQUFJLHdCQUF3QixDQUFDO0FBQzlELFVBQU0sT0FBTyxJQUFJO0FBQUEsTUFDaEI7QUFBQSxNQUNBLElBQUksOEJBQThCLGNBQWMsRUFBRSxXQUFXLE9BQU8sQ0FBQyxDQUFDO0FBQUEsTUFDdEUsMkJBQTJCO0FBQUEsSUFDNUI7QUFFQSxVQUFNLGdCQUFnQixPQUFPLE1BQU07QUFBQSxNQUNsQyxNQUFNO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixVQUFVLEVBQUUsVUFBVSxTQUFTO0FBQUEsSUFDaEMsR0FBRyxrQkFBa0IsWUFBWSxLQUFLO0FBQ3RDLFVBQU0seUJBQXlCLFlBQVk7QUFDM0MsZ0JBQVksT0FBTztBQUNuQixVQUFNLFlBQVksU0FBUztBQUMzQixVQUFNLFNBQVMsTUFBTTtBQUVyQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFFBQVEsS0FBSyxNQUFNLFFBQVEsTUFBTSxDQUFDO0FBQUEsTUFDbEMscUJBQXFCLHlCQUF5QjtBQUFBLE1BQzlDLGFBQWEsa0JBQWtCLFlBQVksSUFBSTtBQUFBLElBQ2hELEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxNQUNWO0FBQUEsTUFDQSxxQkFBcUI7QUFBQSxNQUNyQixhQUFhLENBQUM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtFQUErRSxZQUFZO0FBQy9GLFVBQU0sYUFBYSxpQkFBaUI7QUFDcEMsVUFBTSxNQUFNLDBCQUEwQixDQUFDLFVBQVUsQ0FBQztBQUNsRCxVQUFNLDJCQUEyQixJQUFJLHFDQUFxQyxHQUFHO0FBQzdFLFVBQU0sY0FBYyxJQUFJLGdCQUFzQjtBQUM5Qyw2QkFBeUIsY0FBYztBQUN2QyxVQUFNLG9CQUFvQiwyQkFBMkIsS0FBSyx3QkFBd0I7QUFDbEYsVUFBTSxjQUFjLFNBQVMsSUFBSSxJQUFJLHdCQUF3QixDQUFDO0FBQzlELFVBQU0sT0FBTyxJQUFJLHFCQUFxQixtQkFBbUIsMkJBQTJCLENBQUM7QUFFckYsVUFBTSxnQkFBZ0IsT0FBTyxNQUFNLEVBQUUsY0FBYyxXQUFXLEdBQUcsR0FBRyxrQkFBa0IsWUFBWSxPQUFPLFFBQVE7QUFDakgsVUFBTSx5QkFBeUIsWUFBWTtBQUMzQyxnQkFBWSxPQUFPO0FBQ25CLFVBQU0sWUFBWSxTQUFTO0FBQzNCLFVBQU0sU0FBUyxNQUFNO0FBRXJCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxLQUFLLE1BQU0sUUFBUSxNQUFNLENBQUM7QUFBQSxNQUNsQyxxQkFBcUIseUJBQXlCO0FBQUEsTUFDOUMsZUFBZSxrQkFBa0IsWUFBWSxJQUFJLEVBQUUsSUFBSSxlQUFhLFVBQVUsRUFBRTtBQUFBLElBQ2pGLEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxNQUNWO0FBQUEsTUFDQSxxQkFBcUI7QUFBQSxNQUNyQixlQUFlLENBQUMsV0FBVyxFQUFFO0FBQUEsSUFDOUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0VBQStFLFlBQVk7QUFDL0YsVUFBTSxhQUFhLGlCQUFpQjtBQUNwQyxVQUFNLE1BQU0sMEJBQTBCLENBQUMsVUFBVSxDQUFDO0FBQ2xELFVBQU0sMkJBQTJCLElBQUkscUNBQXFDLEdBQUc7QUFDN0UsNkJBQXlCLG9CQUFvQiwwQkFBMEIsQ0FBQyxVQUFVLEdBQUcsQ0FBQztBQUN0RixVQUFNLHVCQUF1QiwyQkFBMkI7QUFDeEQsNkJBQXlCLHVCQUF1QixNQUFNLHFCQUFxQixxQkFBcUIsa0NBQWtDLEtBQUs7QUFDdkksVUFBTSxvQkFBb0IsMkJBQTJCLEtBQUssd0JBQXdCO0FBQ2xGLFVBQU0sT0FBTyxJQUFJO0FBQUEsTUFDaEI7QUFBQSxNQUNBLElBQUksOEJBQThCLE1BQVM7QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsTUFBTSxPQUFPLE1BQU0sRUFBRSxjQUFjLFdBQVcsSUFBSSxNQUFNLGtCQUFrQixDQUFDO0FBRTFGLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTyxPQUFPO0FBQUEsTUFDZCxxQkFBcUIseUJBQXlCO0FBQUEsTUFDOUMsZ0JBQWdCLGtCQUFrQixjQUFjLFdBQVcsRUFBRSxHQUFHO0FBQUEsSUFDakUsR0FBRztBQUFBLE1BQ0YsT0FBTztBQUFBLE1BQ1AscUJBQXFCO0FBQUEsTUFDckIsZ0JBQWdCLFdBQVc7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRkFBMEYsWUFBWTtBQUMxRyxVQUFNLDJCQUEyQixJQUFJLHFDQUFxQyxNQUFTO0FBQ25GLFVBQU0sY0FBYyxTQUFTLElBQUksSUFBSSx3QkFBd0IsQ0FBQztBQUM5RCw2QkFBeUIsdUJBQXVCLE1BQU0sWUFBWSxPQUFPO0FBQ3pFLFVBQU0sb0JBQW9CLDJCQUEyQixRQUFXLHdCQUF3QjtBQUN4RixVQUFNLE9BQU8sSUFBSTtBQUFBLE1BQ2hCO0FBQUEsTUFDQSxJQUFJLDhCQUE4QixjQUFjLEVBQUUsV0FBVyxPQUFPLENBQUMsQ0FBQztBQUFBLE1BQ3RFLDJCQUEyQjtBQUFBLElBQzVCO0FBRUEsVUFBTSxTQUFTLE1BQU0sT0FBTyxNQUFNO0FBQUEsTUFDakMsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsVUFBVSxFQUFFLFVBQVUsU0FBUztBQUFBLElBQ2hDLEdBQUcsa0JBQWtCLFlBQVksS0FBSztBQUN0QyxVQUFNLFlBQVksS0FBSyxNQUFNLHlCQUF5QixLQUFNO0FBRTVELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxLQUFLLE1BQU0sUUFBUSxNQUFNLENBQUMsRUFBRTtBQUFBLE1BQ3BDLFdBQVcsWUFBWSxNQUFNO0FBQUEsTUFDN0IscUJBQXFCLHlCQUF5QjtBQUFBLE1BQzlDLGVBQWUsa0JBQWtCLFlBQVksSUFBSSxFQUFFLElBQUksZ0JBQWMsV0FBVyxJQUFJO0FBQUEsTUFDcEYsZ0JBQWdCLFVBQVUsWUFBWSxJQUFJLENBQUMsZUFBaUMsV0FBVyxJQUFJO0FBQUEsSUFDNUYsR0FBRztBQUFBLE1BQ0YsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gscUJBQXFCO0FBQUEsTUFDckIsZUFBZSxDQUFDLFdBQVc7QUFBQSxNQUMzQixnQkFBZ0IsQ0FBQyxXQUFXO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0RBQStELFlBQVk7QUFDL0UsVUFBTSxPQUFPLElBQUk7QUFBQSxNQUNoQixJQUFJLHNCQUFzQjtBQUFBLE1BQzFCLElBQUksOEJBQThCLE1BQVM7QUFBQSxNQUMzQywyQkFBMkI7QUFBQSxJQUM1QjtBQUVBLFVBQU0sY0FBYyxNQUFNLE9BQU8sTUFBTSxFQUFFLGNBQWMsV0FBVyxNQUFNLFVBQVUsQ0FBQztBQUNuRixVQUFNLHdCQUF3QixNQUFNLE9BQU8sTUFBTTtBQUFBLE1BQ2hELE1BQU07QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLFVBQVUsRUFBRSxVQUFVLFNBQVM7QUFBQSxNQUMvQixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixXQUFXO0FBQUEsUUFDWCxXQUFXO0FBQUEsUUFDWCxRQUFRO0FBQUEsTUFDVDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsWUFBWSxZQUFZO0FBQUEsTUFDeEIsYUFBYSxzQkFBc0I7QUFBQSxJQUNwQyxHQUFHO0FBQUEsTUFDRixZQUFZO0FBQUEsTUFDWixhQUFhO0FBQUEsSUFDZCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFDeEUsVUFBTSx1QkFBdUIsMkJBQTJCLEtBQUs7QUFDN0QsVUFBTSxTQUFTLElBQUksMEJBQTBCLGlCQUFpQjtBQUM5RCxVQUFNLGFBQWEsTUFBTSxPQUFPLElBQUksb0JBQW9CLG1CQUFtQixvQkFBb0IsR0FBRyxDQUFDLENBQUM7QUFDcEcsVUFBTSxrQkFBa0IsTUFBTSxPQUFPLElBQUk7QUFBQSxNQUN4QztBQUFBLE1BQ0EsSUFBSSw4QkFBOEIsY0FBYyxFQUFFLFdBQVcsT0FBTyxDQUFDLENBQUM7QUFBQSxNQUN0RTtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsVUFBVSxFQUFFLFVBQVUsU0FBUztBQUFBLElBQ2hDLENBQUM7QUFDRCxVQUFNLFlBQVksTUFBTTtBQUFBLE1BQ3ZCLElBQUksa0JBQWtCLG1CQUFtQixRQUFRLG9CQUFvQjtBQUFBLE1BQ3JFLEVBQUUsY0FBYyxlQUFlO0FBQUEsSUFDaEM7QUFDQSxVQUFNLGVBQWUsTUFBTTtBQUFBLE1BQzFCLElBQUkscUJBQXFCLG1CQUFtQixvQkFBb0I7QUFBQSxNQUNoRSxFQUFFLGNBQWMsZUFBZTtBQUFBLE1BQy9CO0FBQUEsTUFDQSxrQkFBa0I7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFFQSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFdBQVcsV0FBVztBQUFBLE1BQ3RCLGdCQUFnQixnQkFBZ0I7QUFBQSxNQUNoQyxVQUFVLFVBQVU7QUFBQSxNQUNwQixhQUFhLGFBQWE7QUFBQSxNQUMxQixVQUFVLE9BQU87QUFBQSxNQUNqQixTQUFTLGtCQUFrQjtBQUFBLElBQzVCLEdBQUc7QUFBQSxNQUNGLFdBQVc7QUFBQSxNQUNYLGdCQUFnQjtBQUFBLE1BQ2hCLFVBQVU7QUFBQSxNQUNWLGFBQWE7QUFBQSxNQUNiLFVBQVUsQ0FBQztBQUFBLE1BQ1gsU0FBUyxDQUFDO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
