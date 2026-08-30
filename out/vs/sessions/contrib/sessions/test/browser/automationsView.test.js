import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { ModifierKeyEmitter } from "../../../../../base/browser/dom.js";
import { EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { NullHoverService } from "../../../../../platform/hover/test/browser/nullHoverService.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IAutomationDialogService } from "../../../../../workbench/contrib/chat/common/automations/automationDialogService.js";
import { ChatAutomationsEnabledContext } from "../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { IAutomationRunner } from "../../../../../workbench/contrib/chat/common/automations/automationRunner.js";
import { IAutomationService } from "../../../../../workbench/contrib/chat/common/automations/automationService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { ICustomViewService } from "../../../../services/customView/browser/customViewService.js";
import { AutomationsHasItemsContext } from "../../../../common/contextkeys.js";
import { buildAutomationsAccessibleContent } from "../../browser/views/automationsAccessibility.js";
import { AutomationsCardsWidget, AutomationsCustomViewContribution } from "../../browser/views/automationsView.js";
import { workbenchInstantiationService } from "../../../../../workbench/test/browser/workbenchTestServices.js";
import { ISessionsListModelService } from "../../../../services/sessions/browser/sessionsListModelService.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { IVoicePlaybackService } from "../../../../../workbench/contrib/chat/common/voicePlaybackService.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { MenuService } from "../../../../../platform/actions/common/menuService.js";
const AUTOMATION_ID = "automation-1";
const RUN_ID = "run-1";
const SESSION_RESOURCE = URI.parse("vscode-chat-session://test/session-1");
const SECOND_SESSION_RESOURCE = URI.parse("vscode-chat-session://test/session-2");
const FOLDER = URI.parse("file:///workspace");
const ITestAgentSessionsService = createDecorator("agentSessions");
function hourly() {
  return { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}
function workspaceTarget() {
  return { kind: "workspace", folderUri: FOLDER, isolation: { kind: "default" } };
}
function automation(overrides = {}) {
  return {
    id: AUTOMATION_ID,
    name: "Daily review",
    prompt: "Review the workspace",
    schedule: hourly(),
    target: workspaceTarget(),
    enabled: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...overrides
  };
}
function run(overrides = {}) {
  return {
    id: RUN_ID,
    automationId: AUTOMATION_ID,
    status: "completed",
    trigger: "manual",
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    leaderWindowId: 0,
    sessionResource: SESSION_RESOURCE,
    ...overrides
  };
}
function dispatchKeydown(element, init) {
  const event = new KeyboardEvent("keydown", { ...init, bubbles: true });
  Object.defineProperty(event, "keyCode", { get: () => init.keyCode });
  element.dispatchEvent(event);
}
async function waitForSessionActions() {
  await timeout(100);
}
class FakeAutomationService extends mock() {
  constructor() {
    super(...arguments);
    this.automationValue = observableValue(this, []);
    this.runValue = observableValue(this, []);
    this.automations = this.automationValue;
    this.runs = this.runValue;
    this.updateCalls = 0;
    this.deleteRunCalls = 0;
    this.deleteRunCompleted = new DeferredPromise();
  }
  setAutomations(value) {
    this.automationValue.set(value, void 0);
  }
  setRuns(value) {
    this.runValue.set(value, void 0);
  }
  getAutomation(id) {
    return this.automationValue.get().find((item) => item.id === id);
  }
  runsFor(automationId) {
    return constObservable(this.runValue.get().filter((item) => item.automationId === automationId));
  }
  async createAutomation(options, mutationGuard) {
    mutationGuard?.();
    const created = automation({
      id: AUTOMATION_ID,
      name: options.name,
      prompt: options.prompt,
      schedule: options.schedule,
      target: options.target,
      modelId: options.modelId ?? void 0,
      mode: options.mode ?? void 0,
      permissionLevel: options.permissionLevel ?? void 0,
      enabled: options.enabled ?? true
    });
    this.setAutomations([created, ...this.automationValue.get()]);
    return created;
  }
  async updateAutomation(id, patch) {
    const current = this.getAutomation(id);
    if (!current) {
      throw new Error("missing automation");
    }
    const updated = {
      ...current,
      name: patch.name ?? current.name,
      prompt: patch.prompt ?? current.prompt,
      schedule: patch.schedule ?? current.schedule,
      target: patch.target ?? current.target,
      modelId: patch.modelId === void 0 ? current.modelId : patch.modelId ?? void 0,
      mode: patch.mode === void 0 ? current.mode : patch.mode ?? void 0,
      permissionLevel: patch.permissionLevel === void 0 ? current.permissionLevel : patch.permissionLevel ?? void 0,
      enabled: patch.enabled ?? current.enabled,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.setAutomations(this.automationValue.get().map((item) => item.id === id ? updated : item));
    return updated;
  }
  async updateAutomationIfUnchanged(id, patch, _expected, mutationGuard) {
    this.updateCalls++;
    mutationGuard?.();
    return this.updateResult ?? { kind: "updated", automation: await this.updateAutomation(id, patch) };
  }
  async deleteAutomation(id, mutationGuard) {
    mutationGuard?.();
    this.setAutomations(this.automationValue.get().filter((item) => item.id !== id));
  }
  async recordRunStart() {
    return { claimed: true, run: run() };
  }
  async updateRun(_runId, _patch) {
    return void 0;
  }
  async deleteRun(runId) {
    this.deleteRunCalls++;
    this.setRuns(this.runValue.get().filter((run2) => run2.id !== runId));
    this.deleteRunCompleted.complete();
  }
}
class FakeAutomationDialogService extends mock() {
  constructor() {
    super(...arguments);
    this.showCalls = 0;
  }
  async showAutomationDialog(options) {
    this.showCalls++;
    this.lastOptions = options;
    if (this.error) {
      throw this.error;
    }
    this.beforeReturn?.();
    return this.result;
  }
}
class TestLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.errors = [];
  }
  error(message, ...args) {
    this.errors.push({ message, args });
  }
}
class FakeDialogService extends mock() {
  constructor() {
    super(...arguments);
    this.errors = [];
    this.infos = [];
    this.confirmations = [];
    this.errorCalled = new DeferredPromise();
    this.infoCalled = new DeferredPromise();
    this.confirmResult = { confirmed: false };
  }
  async confirm(confirmation) {
    this.confirmations.push(confirmation);
    return this.confirmResult;
  }
  async error(message, detail) {
    this.errors.push({ message, detail: detail ?? "" });
    this.errorCalled.complete();
  }
  async info(message) {
    this.infos.push(message);
    this.infoCalled.complete();
  }
}
class FakeRunner extends mock() {
  constructor() {
    super(...arguments);
    this.whenDispatched = Promise.resolve({ kind: "notStarted", reason: "targetUnavailable" });
    this.runCalls = 0;
  }
  runOnce(_automation, _trigger, _leaderWindowId, _token) {
    this.runCalls++;
    return { whenDispatched: this.whenDispatched, whenCompleted: Promise.resolve() };
  }
}
class FakeSessionsService extends mock() {
  constructor(onOpen) {
    super();
    this.onOpen = onOpen;
    this.visibleSessions = constObservable([]);
    this.activeSession = constObservable(void 0);
    this.openGate = new DeferredPromise();
    this.openCalls = 0;
  }
  async openSession() {
    this.openCalls++;
    await this.openGate.p;
    if (this.error) {
      throw this.error;
    }
    await this.onOpen();
  }
}
class FakeSessionsManagementService extends mock() {
  constructor() {
    super(...arguments);
    this.sessionDeletedEmitter = new Emitter();
    this.sessionsChangedEmitter = new Emitter();
    this.deletedSessionResources = /* @__PURE__ */ new Set();
    this.additionalSessions = /* @__PURE__ */ new Map();
    this.onDidDeleteSession = this.sessionDeletedEmitter.event;
    this.onDidChangeSessions = this.sessionsChangedEmitter.event;
    this.sessionExists = true;
    this.firstSessionCataloged = true;
    this.isRead = observableValue(this, false);
    this.secondIsRead = observableValue(this, false);
    this.sessionStatus = observableValue(this, SessionStatus.Completed);
    this.capabilities = observableValue(this, { supportsMultipleChats: false, supportsDelete: true });
    this.session = upcastPartial({
      resource: SESSION_RESOURCE,
      sessionId: "test/session-1",
      providerId: "test",
      sessionType: "test",
      icon: Codicon.account,
      createdAt: /* @__PURE__ */ new Date(),
      workspace: constObservable({
        uri: FOLDER,
        label: "workspace",
        icon: Codicon.folder,
        folders: [],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      }),
      isQuickChat: constObservable(false),
      title: constObservable("Daily review"),
      updatedAt: constObservable(/* @__PURE__ */ new Date()),
      isRead: this.isRead,
      capabilities: this.capabilities,
      status: this.sessionStatus,
      changesets: constObservable([]),
      changes: constObservable([]),
      modelId: constObservable(void 0),
      mode: constObservable(void 0),
      loading: constObservable(false),
      isArchived: constObservable(false),
      description: constObservable(void 0),
      lastTurnEnd: constObservable(void 0),
      chats: constObservable([]),
      mainChat: constObservable(new class extends mock() {
      }())
    });
    this.secondSession = upcastPartial({
      resource: SECOND_SESSION_RESOURCE,
      sessionId: "test/session-2",
      providerId: "test",
      sessionType: "test",
      icon: Codicon.account,
      createdAt: /* @__PURE__ */ new Date(),
      workspace: constObservable({
        uri: FOLDER,
        label: "workspace",
        icon: Codicon.folder,
        folders: [],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      }),
      isQuickChat: constObservable(false),
      title: constObservable("Second daily review"),
      updatedAt: constObservable(/* @__PURE__ */ new Date()),
      isRead: this.secondIsRead,
      capabilities: this.capabilities,
      status: this.sessionStatus,
      changesets: constObservable([]),
      changes: constObservable([]),
      modelId: constObservable(void 0),
      mode: constObservable(void 0),
      loading: constObservable(false),
      isArchived: constObservable(false),
      description: constObservable(void 0),
      lastTurnEnd: constObservable(void 0),
      chats: constObservable([]),
      mainChat: constObservable(new class extends mock() {
      }())
    });
    this.markAllReadCalls = 0;
    this.markAllReadSessionCount = 0;
    this.getSessionCalls = 0;
    this.deleteSessionCalls = 0;
    this.cancelCurrentRequestCalls = 0;
    this.markAllReadCompleted = new DeferredPromise();
  }
  getSessions() {
    if (!this.sessionExists) {
      return [];
    }
    return [...this.firstSessionCataloged ? [this.session] : [], this.secondSession, ...this.additionalSessions.values()].filter((session) => !this.deletedSessionResources.has(session.resource.toString()));
  }
  getSession(resource) {
    this.getSessionCalls++;
    if (!this.sessionExists) {
      return void 0;
    }
    if (this.deletedSessionResources.has(resource.toString())) {
      return void 0;
    }
    if (resource.toString() === SESSION_RESOURCE.toString()) {
      return this.session;
    }
    if (resource.toString() === SECOND_SESSION_RESOURCE.toString()) {
      return this.secondSession;
    }
    return this.additionalSessions.get(resource.toString());
  }
  async markRead(session) {
    if (session === this.session) {
      this.isRead.set(true, void 0);
    } else if (session === this.secondSession) {
      this.secondIsRead.set(true, void 0);
    }
  }
  async deleteSession(session) {
    this.deleteSessionCalls++;
    if (this.deleteError) {
      throw this.deleteError;
    }
    this.deletedSessionResources.add(session.resource.toString());
    this.sessionDeletedEmitter.fire(session);
  }
  async cancelCurrentRequest() {
    this.cancelCurrentRequestCalls++;
    if (this.cancelError) {
      throw this.cancelError;
    }
  }
  async markAllRead(sessions) {
    this.markAllReadCalls++;
    this.markAllReadSessionCount = sessions.length;
    for (const session of sessions) {
      await this.markRead(session);
    }
    this.markAllReadCompleted.complete();
  }
  setRead(isRead) {
    this.isRead.set(isRead, void 0);
  }
  setSupportsDelete(supportsDelete) {
    this.capabilities.set({ supportsMultipleChats: false, supportsDelete }, void 0);
  }
  addSession(resource, title) {
    this.additionalSessions.set(resource.toString(), upcastPartial({
      ...this.session,
      resource,
      sessionId: resource.path,
      title: constObservable(title),
      isRead: constObservable(true)
    }));
  }
  setFirstSessionCataloged(cataloged) {
    this.firstSessionCataloged = cataloged;
    this.sessionsChangedEmitter.fire({
      added: cataloged ? [this.session] : [],
      removed: cataloged ? [] : [this.session],
      changed: []
    });
  }
  dispose() {
    this.sessionDeletedEmitter.dispose();
    this.sessionsChangedEmitter.dispose();
  }
}
suite("AutomationsCardsWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function getSessionAction(widget, label) {
    return [...widget.element.querySelectorAll(".automations-run-session-list .action-label")].find((element) => element.getAttribute("aria-label") === label || element.title === label);
  }
  function isMarkAllReadVisible(widget) {
    const button = widget.element.querySelector(".automations-mark-all-read");
    return !!button && button.style.display !== "none";
  }
  function setup() {
    const automationService = new FakeAutomationService();
    const automationDialogService = new FakeAutomationDialogService();
    const dialogService = new FakeDialogService();
    const runner = new FakeRunner();
    const sessionsManagementService = disposables.add(new FakeSessionsManagementService());
    const sessionsService = new FakeSessionsService(() => sessionsManagementService.markRead(sessionsManagementService.session));
    const configurationService = new TestConfigurationService({ chat: { automations: { enabled: true } } });
    const logService = new TestLogService();
    const store = disposables.add(new DisposableStore());
    store.add(toDisposable(() => ModifierKeyEmitter.disposeInstance()));
    const instantiationService = workbenchInstantiationService(void 0, store);
    instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
      isMotionReduced() {
        return false;
      }
    }());
    instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
    instantiationService.stub(IAutomationService, automationService);
    instantiationService.stub(IAutomationDialogService, automationDialogService);
    instantiationService.stub(IDialogService, dialogService);
    instantiationService.stub(IAutomationRunner, runner);
    instantiationService.stub(ISessionsService, sessionsService);
    instantiationService.stub(ISessionsManagementService, sessionsManagementService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IContextKeyService, store.add(new ContextKeyService(configurationService)));
    instantiationService.stub(IHoverService, NullHoverService);
    instantiationService.stub(ILogService, logService);
    instantiationService.stub(ISessionsListModelService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChange = Event.None;
      }
      isSessionPinned() {
        return false;
      }
      getStatusIcon() {
        return Codicon.circleSmallFilled;
      }
    }());
    instantiationService.stub(ISessionsProvidersService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeProviders = Event.None;
      }
      getProviders() {
        return [];
      }
    }());
    instantiationService.stub(IVoicePlaybackService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.pendingResponseVersion = constObservable(0);
      }
      hasPendingResponse() {
        return false;
      }
    }());
    instantiationService.stub(ITestAgentSessionsService, {
      model: {
        observeSession: () => constObservable(void 0)
      }
    });
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.chatModels = constObservable([]);
      }
    }());
    instantiationService.stub(ICustomViewService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeCustomView = constObservable(void 0);
      }
      registerCustomView() {
        return { dispose() {
        } };
      }
      hideCustomView() {
      }
    }());
    disposables.add(instantiationService.createInstance(AutomationsCustomViewContribution));
    const widget = disposables.add(instantiationService.createInstance(AutomationsCardsWidget));
    document.body.append(widget.element);
    disposables.add(toDisposable(() => widget.element.remove()));
    return { automationService, automationDialogService, configurationService, dialogService, instantiationService, logService, runner, sessionsManagementService, sessionsService, widget };
  }
  test("renders localized schedules and shared session rows", () => {
    const { automationService, widget } = setup();
    const item = automation({ schedule: { interval: "daily", scheduleHour: 13, scheduleMinute: 5, scheduleDay: 0 } });
    automationService.setAutomations([item]);
    automationService.setRuns([run()]);
    const scheduleTime = new Date(Date.UTC(2e3, 0, 1, 13, 5));
    assert.deepStrictEqual({
      schedule: widget.element.querySelector(".automations-card-meta-item")?.textContent,
      sessionTitle: widget.element.querySelector(".automations-run-session-list .monaco-highlighted-label")?.textContent,
      fallbackRows: widget.element.querySelectorAll(".automations-run-card").length
    }, {
      schedule: `Daily at ${scheduleTime.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}`,
      sessionTitle: "Daily review",
      fallbackRows: 0
    });
  });
  test("preserves a temporary Working row until its session resolves", () => {
    const { automationService, widget } = setup();
    automationService.setAutomations([automation()]);
    const pendingRun = run({ status: "pending", sessionResource: void 0 });
    automationService.setRuns([pendingRun]);
    const temporaryRow = widget.element.querySelector(".automations-temporary-run");
    const spinner = widget.element.querySelector(".automations-temporary-run .session-icon .monaco-pixel-spinner");
    automationService.setRuns([{ ...pendingRun, status: "running" }]);
    const runningRow = widget.element.querySelector(".automations-temporary-run");
    const runningSpinner = widget.element.querySelector(".automations-temporary-run .session-icon .monaco-pixel-spinner");
    automationService.setRuns([{ ...pendingRun, status: "running", sessionResource: SESSION_RESOURCE }]);
    assert.deepStrictEqual({
      title: temporaryRow?.querySelector(".session-title")?.textContent,
      status: temporaryRow?.querySelector(".session-description")?.textContent,
      rowPreserved: runningRow === temporaryRow,
      spinnerPreserved: runningSpinner === spinner,
      spinnerUsesSharedIconSlot: spinner?.parentElement?.classList.contains("session-icon"),
      temporaryRowsAfterCommit: widget.element.querySelectorAll(".automations-temporary-run").length,
      sessionRowsAfterCommit: widget.element.querySelectorAll(".automations-run-session-list .session-item").length
    }, {
      title: "Daily review",
      status: "Working...",
      rowPreserved: true,
      spinnerPreserved: true,
      spinnerUsesSharedIconSlot: true,
      temporaryRowsAfterCommit: 0,
      sessionRowsAfterCommit: 1
    });
  });
  test("keeps a temporary row until a terminal run enters the committed session catalog", () => {
    const { automationService, sessionsManagementService, widget } = setup();
    automationService.setAutomations([automation()]);
    sessionsManagementService.setFirstSessionCataloged(false);
    const pendingRun = run({ status: "pending", sessionResource: void 0 });
    automationService.setRuns([pendingRun]);
    automationService.setRuns([{ ...pendingRun, status: "completed", sessionResource: SESSION_RESOURCE }]);
    const beforeCatalogCommit = {
      temporaryRows: widget.element.querySelectorAll(".automations-temporary-run").length,
      sessionRows: widget.element.querySelectorAll(".automations-run-session-list .session-item").length
    };
    sessionsManagementService.setFirstSessionCataloged(true);
    assert.deepStrictEqual({
      beforeCatalogCommit,
      temporaryRowsAfterCommit: widget.element.querySelectorAll(".automations-temporary-run").length,
      sessionRowsAfterCommit: widget.element.querySelectorAll(".automations-run-session-list .session-item").length
    }, {
      beforeCatalogCommit: {
        temporaryRows: 1,
        sessionRows: 0
      },
      temporaryRowsAfterCommit: 0,
      sessionRowsAfterCommit: 1
    });
  });
  test("removes a temporary row when the run fails before session creation", () => {
    const { automationService, widget } = setup();
    automationService.setAutomations([automation()]);
    const pendingRun = run({ status: "pending", sessionResource: void 0 });
    automationService.setRuns([pendingRun]);
    automationService.setRuns([{ ...pendingRun, status: "failed", errorMessage: "failed before session creation" }]);
    assert.deepStrictEqual({
      temporaryRows: widget.element.querySelectorAll(".automations-temporary-run").length,
      historyVisible: widget.element.querySelector(".automations-history")?.style.display !== "none"
    }, {
      temporaryRows: 0,
      historyVisible: false
    });
  });
  test("automation updates preserve card identity and focus", () => {
    const { automationService, widget } = setup();
    automationService.setAutomations([automation()]);
    const card = widget.element.querySelector(".automations-card");
    const editButton = widget.element.querySelector(".automations-card-main");
    editButton?.focus();
    automationService.setAutomations([automation({ prompt: "Updated prompt" })]);
    assert.deepStrictEqual({
      sameCard: widget.element.querySelector(".automations-card") === card,
      focusPreserved: document.activeElement === editButton,
      prompt: widget.element.querySelector(".automations-card-prompt")?.textContent
    }, {
      sameCard: true,
      focusPreserved: true,
      prompt: "Updated prompt"
    });
  });
  test("persistent history groups survive updates and dispose on removal", () => {
    const { automationService, widget } = setup();
    automationService.setAutomations([automation()]);
    const todayRun = run({ id: "run-today", startedAt: (/* @__PURE__ */ new Date()).toISOString() });
    automationService.setRuns([todayRun]);
    const todayGroup = widget.element.querySelector(".automations-history-group");
    const todayList = todayGroup?.querySelector(".automations-run-session-list");
    assert.ok(todayGroup, "today group should exist");
    assert.ok(todayList, "today group should have a session list");
    const todayRun2 = run({ id: "run-today-2", startedAt: (/* @__PURE__ */ new Date()).toISOString(), sessionResource: SECOND_SESSION_RESOURCE });
    automationService.setRuns([todayRun, todayRun2]);
    const todayGroupAfter = widget.element.querySelector(".automations-history-group");
    assert.deepStrictEqual({
      groupReused: todayGroupAfter === todayGroup,
      listReused: todayGroupAfter?.querySelector(".automations-run-session-list") === todayList,
      rowCount: todayGroupAfter?.querySelectorAll(".session-item").length
    }, {
      groupReused: true,
      listReused: true,
      rowCount: 2
    });
    automationService.setRuns([]);
    const remainingGroups = widget.element.querySelectorAll(".automations-history-group");
    assert.strictEqual(remainingGroups.length, 0, "groups should be removed when empty");
  });
  test("run button disables temporarily after click", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const { automationService, widget } = setup();
      automationService.setAutomations([automation()]);
      const runButton = widget.element.querySelector(".automations-card-run-button");
      assert.ok(runButton);
      assert.ok(runButton.querySelector(".codicon-play"));
      runButton.click();
      const runningState = {
        disabled: runButton.getAttribute("aria-disabled"),
        label: runButton.getAttribute("aria-label")
      };
      await timeout(1e4);
      assert.deepStrictEqual({
        runningState,
        restoredState: {
          disabled: runButton.getAttribute("aria-disabled"),
          label: runButton.getAttribute("aria-label")
        }
      }, {
        runningState: {
          disabled: "true",
          label: "Running"
        },
        restoredState: {
          disabled: "false",
          label: "Run now"
        }
      });
    });
  });
  test("focus targets the view without selecting an automation card", () => {
    const { automationService, widget } = setup();
    automationService.setAutomations([automation()]);
    widget.focus();
    assert.deepStrictEqual({
      activeElement: document.activeElement,
      cardFocused: widget.element.querySelector(".automations-card-main") === document.activeElement
    }, {
      activeElement: widget.element,
      cardFocused: false
    });
  });
  test("empty state is rendered once across repeated empty updates", () => {
    const { automationService, widget } = setup();
    automationService.setAutomations([]);
    automationService.setAutomations([]);
    assert.deepStrictEqual({
      titles: widget.element.querySelectorAll(".automations-cards-empty-title").length,
      descriptions: widget.element.querySelectorAll(".automations-cards-empty-description").length,
      buttons: widget.element.querySelectorAll(".automations-cards-create-button").length
    }, {
      titles: 1,
      descriptions: 1,
      buttons: 1
    });
  });
  test("clicking the card opens edit without intercepting action clicks", async () => {
    const { automationDialogService, automationService, runner, widget } = setup();
    const item = automation();
    automationService.setAutomations([item]);
    widget.element.querySelector(".automations-card")?.click();
    await Promise.resolve();
    const actionButton = widget.element.querySelector(".automations-card-action-button");
    assert.ok(actionButton);
    actionButton.click();
    await Promise.resolve();
    assert.deepStrictEqual({
      showCalls: automationDialogService.showCalls,
      existing: automationDialogService.lastOptions?.existing,
      runCalls: runner.runCalls
    }, {
      showCalls: 1,
      existing: item,
      runCalls: 1
    });
  });
  test("automation action buttons support arrow navigation and keyboard activation", async () => {
    const { automationService, runner, widget } = setup();
    automationService.setAutomations([automation()]);
    const buttons = widget.element.querySelectorAll(".automations-card-action-button");
    const runButton = buttons.item(0);
    const deleteButton = buttons.item(1);
    runButton.focus();
    dispatchKeydown(runButton, { key: "ArrowRight", code: "ArrowRight", keyCode: 39 });
    const movedRight = document.activeElement === deleteButton;
    dispatchKeydown(deleteButton, { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 });
    const movedLeft = document.activeElement === runButton;
    dispatchKeydown(runButton, { key: "Enter", code: "Enter", keyCode: 13 });
    dispatchKeydown(runButton, { key: " ", code: "Space", keyCode: 32 });
    await Promise.resolve();
    assert.deepStrictEqual({
      movedRight,
      movedLeft,
      runCalls: runner.runCalls
    }, {
      movedRight: true,
      movedLeft: true,
      runCalls: 1
    });
  });
  test("tapping the card opens edit without intercepting action taps", async () => {
    const { automationDialogService, automationService, runner, widget } = setup();
    const item = automation();
    automationService.setAutomations([item]);
    const card = widget.element.querySelector(".automations-card");
    const actionButton = widget.element.querySelector(".automations-card-action-button");
    assert.ok(card);
    assert.ok(actionButton);
    const tapEvent = new MouseEvent(TouchEventType.Tap, { cancelable: true });
    tapEvent.initialTarget = actionButton;
    actionButton.dispatchEvent(tapEvent);
    card.dispatchEvent(tapEvent);
    await Promise.resolve();
    const cardTapEvent = new MouseEvent(TouchEventType.Tap, { cancelable: true });
    cardTapEvent.initialTarget = card;
    card.dispatchEvent(cardTapEvent);
    await Promise.resolve();
    assert.deepStrictEqual({
      showCalls: automationDialogService.showCalls,
      existing: automationDialogService.lastOptions?.existing,
      runCalls: runner.runCalls
    }, {
      showCalls: 1,
      existing: item,
      runCalls: 1
    });
  });
  test("session row opens and becomes read only after open succeeds", async () => {
    const { automationService, sessionsManagementService, sessionsService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    const row = widget.element.querySelector(".automations-run-session-list .monaco-list-row");
    assert.ok(row);
    row.click();
    assert.deepStrictEqual({
      openCalls: sessionsService.openCalls,
      readBeforeOpen: sessionsManagementService.isRead.get()
    }, {
      openCalls: 1,
      readBeforeOpen: false
    });
    sessionsService.openGate.complete();
    await sessionsService.openGate.p;
    await Promise.resolve();
    assert.deepStrictEqual({
      isRead: sessionsManagementService.isRead.get(),
      unreadClass: widget.element.querySelector(".automations-run-session-list .session-item")?.classList.contains("unread")
    }, {
      isRead: true,
      unreadClass: false
    });
  });
  test("run remains unread when opening its session fails", async () => {
    const { automationService, dialogService, sessionsManagementService, sessionsService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    sessionsService.error = new Error("open failed");
    const row = widget.element.querySelector(".automations-run-session-list .monaco-list-row");
    assert.ok(row);
    row.click();
    sessionsService.openGate.complete();
    await dialogService.errorCalled.p;
    assert.deepStrictEqual({
      isRead: sessionsManagementService.isRead.get(),
      unreadClass: widget.element.querySelector(".automations-run-session-list .session-item")?.classList.contains("unread"),
      error: dialogService.errors
    }, {
      isRead: false,
      unreadClass: true,
      error: [{ message: "Failed to open automation run.", detail: "open failed" }]
    });
  });
  test("session read state reactively updates run history", () => {
    const { automationService, sessionsManagementService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    const unreadClass = widget.element.querySelector(".automations-run-session-list .session-item")?.classList.contains("unread");
    sessionsManagementService.setRead(true);
    const readClass = widget.element.querySelector(".automations-run-session-list .session-item")?.classList.contains("unread");
    assert.deepStrictEqual({
      unreadClass,
      readClass,
      markAllVisible: isMarkAllReadVisible(widget)
    }, {
      unreadClass: true,
      readClass: false,
      markAllVisible: false
    });
  });
  test("mark all as read delegates to session management", async () => {
    const { automationService, sessionsManagementService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run(), run({ id: "run-2" })]);
    widget.element.querySelector(".automations-mark-all-read")?.click();
    await sessionsManagementService.markAllReadCompleted.p;
    await Promise.resolve();
    assert.deepStrictEqual({
      isRead: sessionsManagementService.isRead.get(),
      markAllReadCalls: sessionsManagementService.markAllReadCalls,
      markAllReadSessionCount: sessionsManagementService.markAllReadSessionCount,
      markAllVisible: isMarkAllReadVisible(widget)
    }, {
      isRead: true,
      markAllReadCalls: 1,
      markAllReadSessionCount: 1,
      markAllVisible: false
    });
  });
  test("mark all as read coalesces history rendering", async () => {
    const { automationService, sessionsManagementService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([
      run(),
      run({ id: "run-2", sessionResource: SECOND_SESSION_RESOURCE })
    ]);
    const markAllButton = widget.element.querySelector(".automations-mark-all-read");
    assert.ok(markAllButton);
    markAllButton.click();
    const disabledWhileMarking = markAllButton.getAttribute("aria-disabled");
    await sessionsManagementService.markAllReadCompleted.p;
    await Promise.resolve();
    assert.deepStrictEqual({
      disabledWhileMarking,
      firstIsRead: sessionsManagementService.isRead.get(),
      secondIsRead: sessionsManagementService.secondIsRead.get()
    }, {
      disabledWhileMarking: "true",
      firstIsRead: true,
      secondIsRead: true
    });
  });
  test("omits runs without a resolvable session from run history", () => {
    const { automationService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([
      run({ id: "run-sessionless", sessionResource: void 0 }),
      run({ id: "run-stale", sessionResource: URI.parse("vscode-chat-session://test/stale") })
    ]);
    const hiddenWithoutSessions = widget.element.querySelector(".automations-history")?.style.display === "none";
    const emptyGroups = widget.element.querySelectorAll(".automations-history-group").length;
    automationService.setRuns([
      run(),
      run({ id: "run-sessionless", sessionResource: void 0 }),
      run({ id: "run-stale", sessionResource: URI.parse("vscode-chat-session://test/stale") }),
      run({ id: "run-b", sessionResource: SECOND_SESSION_RESOURCE })
    ]);
    const titles = [...widget.element.querySelectorAll(".automations-run-session-list .monaco-highlighted-label")].map((element) => element.textContent).sort();
    assert.deepStrictEqual({
      hiddenWithoutSessions,
      emptyGroups,
      lists: widget.element.querySelectorAll(".automations-run-session-list").length,
      rows: widget.element.querySelectorAll(".automations-run-session-list .session-item").length,
      fallbackRows: widget.element.querySelectorAll(".automations-run-card").length,
      titles
    }, {
      hiddenWithoutSessions: true,
      emptyGroups: 0,
      lists: 1,
      rows: 2,
      fallbackRows: 0,
      titles: ["Daily review", "Second daily review"]
    });
  });
  test("does not expose session deletion for an active run", async () => {
    const { automationService, sessionsManagementService, widget } = setup();
    sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, void 0);
    automationService.setAutomations([automation()]);
    automationService.setRuns([run({ status: "running" })]);
    await waitForSessionActions();
    assert.deepStrictEqual({
      deleteVisible: !!getSessionAction(widget, "Delete"),
      stopVisible: !!getSessionAction(widget, "Stop")
    }, {
      deleteVisible: false,
      stopVisible: true
    });
  });
  test("stops an active run without opening its session", async () => {
    const { automationService, sessionsManagementService, sessionsService, widget } = setup();
    sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, void 0);
    automationService.setAutomations([automation()]);
    automationService.setRuns([run({ status: "running" })]);
    await waitForSessionActions();
    const stopButton = getSessionAction(widget, "Stop");
    assert.ok(stopButton);
    stopButton.click();
    await Promise.resolve();
    assert.deepStrictEqual({
      label: stopButton.getAttribute("aria-label") ?? stopButton.title,
      cancelCurrentRequestCalls: sessionsManagementService.cancelCurrentRequestCalls,
      openCalls: sessionsService.openCalls,
      deleteButtonVisible: !!getSessionAction(widget, "Delete")
    }, {
      label: "Stop",
      cancelCurrentRequestCalls: 1,
      openCalls: 0,
      deleteButtonVisible: false
    });
  });
  test("re-enables Stop when cancellation fails", async () => {
    const { automationService, dialogService, sessionsManagementService, widget } = setup();
    sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, void 0);
    automationService.setAutomations([automation()]);
    automationService.setRuns([run({ status: "running" })]);
    sessionsManagementService.cancelError = new Error("stop failed");
    await waitForSessionActions();
    const stopButton = getSessionAction(widget, "Stop");
    assert.ok(stopButton);
    stopButton.click();
    await dialogService.errorCalled.p;
    assert.deepStrictEqual({
      enabled: !stopButton.classList.contains("disabled"),
      error: dialogService.errors
    }, {
      enabled: true,
      error: [{ message: "Failed to stop the automation run session.", detail: "stop failed" }]
    });
  });
  test("deleting a run session confirms the permanent deletion without opening it", async () => {
    const { automationService, dialogService, sessionsManagementService, sessionsService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    dialogService.confirmResult = { confirmed: true };
    await waitForSessionActions();
    const deleteButton = getSessionAction(widget, "Delete");
    assert.ok(deleteButton);
    deleteButton.click();
    await automationService.deleteRunCompleted.p;
    assert.deepStrictEqual({
      confirmation: dialogService.confirmations[0],
      deleteSessionCalls: sessionsManagementService.deleteSessionCalls,
      deleteRunCalls: automationService.deleteRunCalls,
      openCalls: sessionsService.openCalls,
      historyItemStillVisible: !!widget.element.querySelector(".automations-run-session-list .session-item")
    }, {
      confirmation: {
        message: 'Delete the session for "Daily review"?',
        detail: "This will permanently delete the session and remove this item from run history. This action cannot be undone.",
        primaryButton: "Delete"
      },
      deleteSessionCalls: 1,
      deleteRunCalls: 1,
      openCalls: 0,
      historyItemStillVisible: false
    });
  });
  test("deleting the focused run moves focus to the next run", async () => {
    const { automationService, dialogService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([
      run(),
      run({ id: "run-2", sessionResource: SECOND_SESSION_RESOURCE })
    ]);
    dialogService.confirmResult = { confirmed: true };
    await waitForSessionActions();
    const deleteButton = getSessionAction(widget, "Delete");
    assert.ok(deleteButton);
    const list = widget.element.querySelector(".automations-run-session-list .monaco-list");
    assert.ok(list);
    list.focus();
    deleteButton.click();
    await automationService.deleteRunCompleted.p;
    const remainingRow = widget.element.querySelector(".automations-run-session-list .monaco-list-row");
    assert.deepStrictEqual({
      historyItemCount: widget.element.querySelectorAll(".automations-run-session-list .session-item").length,
      focusedNextRun: remainingRow?.classList.contains("focused")
    }, {
      historyItemCount: 1,
      focusedNextRun: true
    });
  });
  test("canceling run session deletion keeps the session", async () => {
    const { automationService, dialogService, sessionsManagementService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    await waitForSessionActions();
    getSessionAction(widget, "Delete")?.click();
    await Promise.resolve();
    assert.deepStrictEqual({
      confirmations: dialogService.confirmations.length,
      deleteSessionCalls: sessionsManagementService.deleteSessionCalls,
      deleteButtonStillVisible: !!getSessionAction(widget, "Delete")
    }, {
      confirmations: 1,
      deleteSessionCalls: 0,
      deleteButtonStillVisible: true
    });
  });
  test("keeps run history when session deletion fails", async () => {
    const { automationService, dialogService, sessionsManagementService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    dialogService.confirmResult = { confirmed: true };
    sessionsManagementService.deleteError = new Error("delete failed");
    await waitForSessionActions();
    getSessionAction(widget, "Delete")?.click();
    await dialogService.errorCalled.p;
    assert.deepStrictEqual({
      deleteRunCalls: automationService.deleteRunCalls,
      historyItemStillVisible: !!widget.element.querySelector(".automations-run-session-list .session-item"),
      error: dialogService.errors
    }, {
      deleteRunCalls: 0,
      historyItemStillVisible: true,
      error: [{ message: "Failed to delete the automation run session.", detail: "delete failed" }]
    });
  });
  test("does not expose session deletion when the provider does not support it", async () => {
    const { automationService, sessionsManagementService, widget } = setup();
    sessionsManagementService.setSupportsDelete(false);
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    await waitForSessionActions();
    assert.strictEqual(getSessionAction(widget, "Delete"), void 0);
  });
  test("edit conflict is reported to the user", async () => {
    const { automationDialogService, automationService, dialogService, widget } = setup();
    const item = automation();
    automationService.setAutomations([item]);
    automationService.updateResult = { kind: "conflict", current: automation({ name: "Changed elsewhere" }) };
    automationDialogService.result = { kind: "update", id: item.id, value: { name: "Edited" } };
    widget.element.querySelector(".automations-card-main")?.click();
    await dialogService.errorCalled.p;
    assert.deepStrictEqual(dialogService.errors, [{
      message: "Failed to update automation.",
      detail: "This automation changed while the dialog was open. Reopen it to review the latest values."
    }]);
  });
  test("edit dialog failures are logged and reported to the user", async () => {
    const { automationDialogService, automationService, dialogService, logService, widget } = setup();
    const item = automation();
    automationService.setAutomations([item]);
    const error = new Error("dialog failed");
    automationDialogService.error = error;
    widget.element.querySelector(".automations-card-main")?.click();
    await dialogService.errorCalled.p;
    assert.deepStrictEqual({
      loggedErrors: logService.errors,
      dialogErrors: dialogService.errors
    }, {
      loggedErrors: [{
        message: "[AutomationsCards] Failed to update automation",
        args: [error]
      }],
      dialogErrors: [{
        message: "Failed to update automation.",
        detail: "dialog failed"
      }]
    });
  });
  test("run failures are reported to the user", async () => {
    const { automationService, dialogService, runner, widget } = setup();
    automationService.setAutomations([automation()]);
    runner.whenDispatched = Promise.reject(new Error("runner failed"));
    widget.element.querySelector(".automations-card-action-button")?.click();
    await dialogService.errorCalled.p;
    assert.deepStrictEqual(dialogService.errors, [{
      message: "Failed to run automation.",
      detail: "runner failed"
    }]);
  });
  test("disabling automations while the dialog is open prevents the update", async () => {
    const { automationDialogService, automationService, configurationService, dialogService, widget } = setup();
    const item = automation();
    automationService.setAutomations([item]);
    automationDialogService.result = { kind: "update", id: item.id, value: { name: "Edited" } };
    automationDialogService.beforeReturn = () => configurationService.setUserConfiguration("chat.automations.enabled", false);
    widget.element.querySelector(".automations-card-main")?.click();
    await dialogService.infoCalled.p;
    assert.deepStrictEqual({
      info: dialogService.infos,
      updateCalls: automationService.updateCalls
    }, {
      info: ["Automations are disabled."],
      updateCalls: 0
    });
  });
  test("accessible view includes automation and run content", () => {
    assert.strictEqual(
      buildAutomationsAccessibleContent([automation()], [run({ status: "failed", errorMessage: "boom" })]).includes("Daily review, Failed"),
      true
    );
  });
  test("running run shows needs-input indicator when session status transitions to NeedsInput", async () => {
    const { automationService, sessionsManagementService, widget } = setup();
    sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, void 0);
    automationService.setAutomations([automation()]);
    automationService.setRuns([run({ status: "running" })]);
    const card = widget.element.querySelector(".automations-run-session-list .session-item");
    assert.ok(card);
    assert.strictEqual(card.classList.contains("needs-input"), false);
    sessionsManagementService.sessionStatus.set(SessionStatus.NeedsInput, void 0);
    await waitForSessionActions();
    const updatedCard = widget.element.querySelector(".automations-run-session-list .session-item");
    assert.ok(updatedCard);
    assert.strictEqual(updatedCard.classList.contains("needs-input"), true);
    assert.ok(getSessionAction(widget, "Stop"));
  });
  test("needs-input indicator reverts when session status returns to InProgress", () => {
    const { automationService, sessionsManagementService, widget } = setup();
    sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, void 0);
    automationService.setAutomations([automation()]);
    automationService.setRuns([run({ status: "running" })]);
    sessionsManagementService.sessionStatus.set(SessionStatus.NeedsInput, void 0);
    assert.strictEqual(widget.element.querySelector(".automations-run-session-list .session-item")?.classList.contains("needs-input"), true);
    sessionsManagementService.sessionStatus.set(SessionStatus.InProgress, void 0);
    const card = widget.element.querySelector(".automations-run-session-list .session-item");
    assert.ok(card);
    assert.strictEqual(card.classList.contains("needs-input"), false);
  });
});
suite("AutomationsCustomViewContribution \u2014 context key", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function setup(automationsEnabled = true) {
    const automationService = new FakeAutomationService();
    const contextKeyService = new MockContextKeyService();
    ChatAutomationsEnabledContext.bindTo(contextKeyService).set(automationsEnabled);
    let restore;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAutomationService, automationService);
    instantiationService.stub(IContextKeyService, contextKeyService);
    instantiationService.stub(ICustomViewService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeCustomView = constObservable(void 0);
      }
      registerCustomView(_descriptor, options) {
        restore = options?.restore;
        return { dispose() {
        } };
      }
      hideCustomView() {
      }
    }());
    instantiationService.stub(IActionViewItemService, new class extends mock() {
      register() {
        return { dispose() {
        } };
      }
    }());
    const contribution = disposables.add(instantiationService.createInstance(AutomationsCustomViewContribution));
    return { automationService, contextKeyService, contribution, restore };
  }
  test("AutomationsHasItemsContext follows the automations observable (empty \u2192 non-empty \u2192 empty)", () => {
    const { automationService, contextKeyService } = setup();
    assert.strictEqual(contextKeyService.getContextKeyValue(AutomationsHasItemsContext.key), false, "initially false");
    automationService.setAutomations([automation()]);
    assert.strictEqual(contextKeyService.getContextKeyValue(AutomationsHasItemsContext.key), true, "true when non-empty");
    automationService.setAutomations([]);
    assert.strictEqual(contextKeyService.getContextKeyValue(AutomationsHasItemsContext.key), false, "false when empty again");
  });
  test("restores the Automations view only when the feature is enabled", () => {
    assert.deepStrictEqual({
      enabled: setup(true).restore,
      disabled: setup(false).restore
    }, {
      enabled: true,
      disabled: false
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXHRlc3RcXGJyb3dzZXJcXGF1dG9tYXRpb25zVmlldy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgTW9kaWZpZXJLZXlFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlRXZlbnQsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jaywgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IFRlc3RBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvdGVzdC9jb21tb24vdGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlybWF0aW9uLCBJQ29uZmlybWF0aW9uUmVzdWx0LCBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgTnVsbEhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL3Rlc3QvYnJvd3Nlci9udWxsSG92ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgTW9ja0NvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25EZXNjcmlwdG9yLCBJQXV0b21hdGlvblJ1biwgSUF1dG9tYXRpb25TY2hlZHVsZSwgQXV0b21hdGlvblJ1blRyaWdnZXIsIEF1dG9tYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uRGlhbG9nUmVzdWx0LCBJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UsIElTaG93QXV0b21hdGlvbkRpYWxvZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uRGlhbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25zRW5hYmxlZC5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblJ1bkRpc3BhdGNoLCBJQXV0b21hdGlvblJ1bm5lciwgSUF1dG9tYXRpb25SdW5PcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uUnVubmVyLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25NdXRhdGlvbkd1YXJkLCBJQXV0b21hdGlvblJ1bkNsYWltLCBJQXV0b21hdGlvblNlcnZpY2UsIElDcmVhdGVBdXRvbWF0aW9uT3B0aW9ucywgSUd1YXJkZWRBdXRvbWF0aW9uVXBkYXRlUmVzdWx0LCBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMsIElVcGRhdGVBdXRvbWF0aW9uUnVuT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21WaWV3RGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zQ2hhbmdlRXZlbnQsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tVmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jdXN0b21WaWV3L2Jyb3dzZXIvY3VzdG9tVmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbnNIYXNJdGVtc0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgYnVpbGRBdXRvbWF0aW9uc0FjY2Vzc2libGVDb250ZW50IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3cy9hdXRvbWF0aW9uc0FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbnNDYXJkc1dpZGdldCwgQXV0b21hdGlvbnNDdXN0b21WaWV3Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3cy9hdXRvbWF0aW9uc1ZpZXcuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWb2ljZVBsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3ZvaWNlUGxheWJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9tZW51U2VydmljZS5qcyc7XG5cblxuY29uc3QgQVVUT01BVElPTl9JRCA9ICdhdXRvbWF0aW9uLTEnO1xuY29uc3QgUlVOX0lEID0gJ3J1bi0xJztcbmNvbnN0IFNFU1NJT05fUkVTT1VSQ0UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24tMScpO1xuY29uc3QgU0VDT05EX1NFU1NJT05fUkVTT1VSQ0UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24tMicpO1xuY29uc3QgRk9MREVSID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuY29uc3QgSVRlc3RBZ2VudFNlc3Npb25zU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxvYmplY3Q+KCdhZ2VudFNlc3Npb25zJyk7XG5cbmZ1bmN0aW9uIGhvdXJseSgpOiBJQXV0b21hdGlvblNjaGVkdWxlIHtcblx0cmV0dXJuIHsgaW50ZXJ2YWw6ICdob3VybHknLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9O1xufVxuXG5mdW5jdGlvbiB3b3Jrc3BhY2VUYXJnZXQoKTogQXV0b21hdGlvblRhcmdldCB7XG5cdHJldHVybiB7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUiwgaXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9IH07XG59XG5cbmZ1bmN0aW9uIGF1dG9tYXRpb24ob3ZlcnJpZGVzOiBQYXJ0aWFsPElBdXRvbWF0aW9uRGVzY3JpcHRvcj4gPSB7fSk6IElBdXRvbWF0aW9uRGVzY3JpcHRvciB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IEFVVE9NQVRJT05fSUQsXG5cdFx0bmFtZTogJ0RhaWx5IHJldmlldycsXG5cdFx0cHJvbXB0OiAnUmV2aWV3IHRoZSB3b3Jrc3BhY2UnLFxuXHRcdHNjaGVkdWxlOiBob3VybHkoKSxcblx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpLFxuXHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0dXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBydW4ob3ZlcnJpZGVzOiBQYXJ0aWFsPElBdXRvbWF0aW9uUnVuPiA9IHt9KTogSUF1dG9tYXRpb25SdW4ge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBSVU5fSUQsXG5cdFx0YXV0b21hdGlvbklkOiBBVVRPTUFUSU9OX0lELFxuXHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0dHJpZ2dlcjogJ21hbnVhbCcsXG5cdFx0c3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0bGVhZGVyV2luZG93SWQ6IDAsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gZGlzcGF0Y2hLZXlkb3duKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpbml0OiBLZXlib2FyZEV2ZW50SW5pdCAmIHsga2V5Q29kZTogbnVtYmVyIH0pOiB2b2lkIHtcblx0Y29uc3QgZXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsgLi4uaW5pdCwgYnViYmxlczogdHJ1ZSB9KTtcblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV2ZW50LCAna2V5Q29kZScsIHsgZ2V0OiAoKSA9PiBpbml0LmtleUNvZGUgfSk7XG5cdGVsZW1lbnQuZGlzcGF0Y2hFdmVudChldmVudCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JTZXNzaW9uQWN0aW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgdGltZW91dCgxMDApO1xufVxuXG5jbGFzcyBGYWtlQXV0b21hdGlvblNlcnZpY2UgZXh0ZW5kcyBtb2NrPElBdXRvbWF0aW9uU2VydmljZT4oKSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgYXV0b21hdGlvblZhbHVlID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBdXRvbWF0aW9uRGVzY3JpcHRvcltdPih0aGlzLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcnVuVmFsdWUgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXT4odGhpcywgW10pO1xuXHRvdmVycmlkZSByZWFkb25seSBhdXRvbWF0aW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUF1dG9tYXRpb25EZXNjcmlwdG9yW10+ID0gdGhpcy5hdXRvbWF0aW9uVmFsdWU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHJ1bnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+ID0gdGhpcy5ydW5WYWx1ZTtcblx0dXBkYXRlUmVzdWx0OiBJR3VhcmRlZEF1dG9tYXRpb25VcGRhdGVSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdHVwZGF0ZUNhbGxzID0gMDtcblx0ZGVsZXRlUnVuQ2FsbHMgPSAwO1xuXHRyZWFkb25seSBkZWxldGVSdW5Db21wbGV0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0c2V0QXV0b21hdGlvbnModmFsdWU6IHJlYWRvbmx5IElBdXRvbWF0aW9uRGVzY3JpcHRvcltdKTogdm9pZCB7XG5cdFx0dGhpcy5hdXRvbWF0aW9uVmFsdWUuc2V0KHZhbHVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0UnVucyh2YWx1ZTogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSk6IHZvaWQge1xuXHRcdHRoaXMucnVuVmFsdWUuc2V0KHZhbHVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QXV0b21hdGlvbihpZDogc3RyaW5nKTogSUF1dG9tYXRpb25EZXNjcmlwdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5hdXRvbWF0aW9uVmFsdWUuZ2V0KCkuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IGlkKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bnNGb3IoYXV0b21hdGlvbklkOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPiB7XG5cdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh0aGlzLnJ1blZhbHVlLmdldCgpLmZpbHRlcihpdGVtID0+IGl0ZW0uYXV0b21hdGlvbklkID09PSBhdXRvbWF0aW9uSWQpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUF1dG9tYXRpb24ob3B0aW9uczogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zLCBtdXRhdGlvbkd1YXJkPzogQXV0b21hdGlvbk11dGF0aW9uR3VhcmQpOiBQcm9taXNlPElBdXRvbWF0aW9uRGVzY3JpcHRvcj4ge1xuXHRcdG11dGF0aW9uR3VhcmQ/LigpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhdXRvbWF0aW9uKHtcblx0XHRcdGlkOiBBVVRPTUFUSU9OX0lELFxuXHRcdFx0bmFtZTogb3B0aW9ucy5uYW1lLFxuXHRcdFx0cHJvbXB0OiBvcHRpb25zLnByb21wdCxcblx0XHRcdHNjaGVkdWxlOiBvcHRpb25zLnNjaGVkdWxlLFxuXHRcdFx0dGFyZ2V0OiBvcHRpb25zLnRhcmdldCxcblx0XHRcdG1vZGVsSWQ6IG9wdGlvbnMubW9kZWxJZCA/PyB1bmRlZmluZWQsXG5cdFx0XHRtb2RlOiBvcHRpb25zLm1vZGUgPz8gdW5kZWZpbmVkLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsOiBvcHRpb25zLnBlcm1pc3Npb25MZXZlbCA/PyB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiBvcHRpb25zLmVuYWJsZWQgPz8gdHJ1ZSxcblx0XHR9KTtcblx0XHR0aGlzLnNldEF1dG9tYXRpb25zKFtjcmVhdGVkLCAuLi50aGlzLmF1dG9tYXRpb25WYWx1ZS5nZXQoKV0pO1xuXHRcdHJldHVybiBjcmVhdGVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgdXBkYXRlQXV0b21hdGlvbihpZDogc3RyaW5nLCBwYXRjaDogSVVwZGF0ZUF1dG9tYXRpb25PcHRpb25zKTogUHJvbWlzZTxJQXV0b21hdGlvbkRlc2NyaXB0b3I+IHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5nZXRBdXRvbWF0aW9uKGlkKTtcblx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbWlzc2luZyBhdXRvbWF0aW9uJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHVwZGF0ZWQ6IElBdXRvbWF0aW9uRGVzY3JpcHRvciA9IHtcblx0XHRcdC4uLmN1cnJlbnQsXG5cdFx0XHRuYW1lOiBwYXRjaC5uYW1lID8/IGN1cnJlbnQubmFtZSxcblx0XHRcdHByb21wdDogcGF0Y2gucHJvbXB0ID8/IGN1cnJlbnQucHJvbXB0LFxuXHRcdFx0c2NoZWR1bGU6IHBhdGNoLnNjaGVkdWxlID8/IGN1cnJlbnQuc2NoZWR1bGUsXG5cdFx0XHR0YXJnZXQ6IHBhdGNoLnRhcmdldCA/PyBjdXJyZW50LnRhcmdldCxcblx0XHRcdG1vZGVsSWQ6IHBhdGNoLm1vZGVsSWQgPT09IHVuZGVmaW5lZCA/IGN1cnJlbnQubW9kZWxJZCA6IHBhdGNoLm1vZGVsSWQgPz8gdW5kZWZpbmVkLFxuXHRcdFx0bW9kZTogcGF0Y2gubW9kZSA9PT0gdW5kZWZpbmVkID8gY3VycmVudC5tb2RlIDogcGF0Y2gubW9kZSA/PyB1bmRlZmluZWQsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHBhdGNoLnBlcm1pc3Npb25MZXZlbCA9PT0gdW5kZWZpbmVkID8gY3VycmVudC5wZXJtaXNzaW9uTGV2ZWwgOiBwYXRjaC5wZXJtaXNzaW9uTGV2ZWwgPz8gdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogcGF0Y2guZW5hYmxlZCA/PyBjdXJyZW50LmVuYWJsZWQsXG5cdFx0XHR1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHR9O1xuXHRcdHRoaXMuc2V0QXV0b21hdGlvbnModGhpcy5hdXRvbWF0aW9uVmFsdWUuZ2V0KCkubWFwKGl0ZW0gPT4gaXRlbS5pZCA9PT0gaWQgPyB1cGRhdGVkIDogaXRlbSkpO1xuXHRcdHJldHVybiB1cGRhdGVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgdXBkYXRlQXV0b21hdGlvbklmVW5jaGFuZ2VkKGlkOiBzdHJpbmcsIHBhdGNoOiBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMsIF9leHBlY3RlZDogSUF1dG9tYXRpb25EZXNjcmlwdG9yLCBtdXRhdGlvbkd1YXJkPzogQXV0b21hdGlvbk11dGF0aW9uR3VhcmQpOiBQcm9taXNlPElHdWFyZGVkQXV0b21hdGlvblVwZGF0ZVJlc3VsdD4ge1xuXHRcdHRoaXMudXBkYXRlQ2FsbHMrKztcblx0XHRtdXRhdGlvbkd1YXJkPy4oKTtcblx0XHRyZXR1cm4gdGhpcy51cGRhdGVSZXN1bHQgPz8geyBraW5kOiAndXBkYXRlZCcsIGF1dG9tYXRpb246IGF3YWl0IHRoaXMudXBkYXRlQXV0b21hdGlvbihpZCwgcGF0Y2gpIH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBkZWxldGVBdXRvbWF0aW9uKGlkOiBzdHJpbmcsIG11dGF0aW9uR3VhcmQ/OiBBdXRvbWF0aW9uTXV0YXRpb25HdWFyZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdG11dGF0aW9uR3VhcmQ/LigpO1xuXHRcdHRoaXMuc2V0QXV0b21hdGlvbnModGhpcy5hdXRvbWF0aW9uVmFsdWUuZ2V0KCkuZmlsdGVyKGl0ZW0gPT4gaXRlbS5pZCAhPT0gaWQpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlY29yZFJ1blN0YXJ0KCk6IFByb21pc2U8SUF1dG9tYXRpb25SdW5DbGFpbT4ge1xuXHRcdHJldHVybiB7IGNsYWltZWQ6IHRydWUsIHJ1bjogcnVuKCkgfTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHVwZGF0ZVJ1bihfcnVuSWQ6IHN0cmluZywgX3BhdGNoOiBJVXBkYXRlQXV0b21hdGlvblJ1bk9wdGlvbnMpOiBQcm9taXNlPElBdXRvbWF0aW9uUnVuIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRlbGV0ZVJ1bihydW5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kZWxldGVSdW5DYWxscysrO1xuXHRcdHRoaXMuc2V0UnVucyh0aGlzLnJ1blZhbHVlLmdldCgpLmZpbHRlcihydW4gPT4gcnVuLmlkICE9PSBydW5JZCkpO1xuXHRcdHRoaXMuZGVsZXRlUnVuQ29tcGxldGVkLmNvbXBsZXRlKCk7XG5cdH1cbn1cblxuY2xhc3MgRmFrZUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2U+KCkge1xuXHRyZXN1bHQ6IElBdXRvbWF0aW9uRGlhbG9nUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdGJlZm9yZVJldHVybjogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRzaG93Q2FsbHMgPSAwO1xuXHRsYXN0T3B0aW9uczogSVNob3dBdXRvbWF0aW9uRGlhbG9nT3B0aW9ucyB8IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSBhc3luYyBzaG93QXV0b21hdGlvbkRpYWxvZyhvcHRpb25zOiBJU2hvd0F1dG9tYXRpb25EaWFsb2dPcHRpb25zKTogUHJvbWlzZTxJQXV0b21hdGlvbkRpYWxvZ1Jlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuc2hvd0NhbGxzKys7XG5cdFx0dGhpcy5sYXN0T3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0aWYgKHRoaXMuZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMuZXJyb3I7XG5cdFx0fVxuXHRcdHRoaXMuYmVmb3JlUmV0dXJuPy4oKTtcblx0XHRyZXR1cm4gdGhpcy5yZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgVGVzdExvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdHJlYWRvbmx5IGVycm9yczogeyBtZXNzYWdlOiBzdHJpbmcgfCBFcnJvcjsgYXJnczogcmVhZG9ubHkgdW5rbm93bltdIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGVycm9yKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLmVycm9ycy5wdXNoKHsgbWVzc2FnZSwgYXJncyB9KTtcblx0fVxufVxuXG5jbGFzcyBGYWtlRGlhbG9nU2VydmljZSBleHRlbmRzIG1vY2s8SURpYWxvZ1NlcnZpY2U+KCkge1xuXHRyZWFkb25seSBlcnJvcnM6IHsgbWVzc2FnZTogc3RyaW5nOyBkZXRhaWw6IHN0cmluZyB9W10gPSBbXTtcblx0cmVhZG9ubHkgaW5mb3M6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IGNvbmZpcm1hdGlvbnM6IElDb25maXJtYXRpb25bXSA9IFtdO1xuXHRyZWFkb25seSBlcnJvckNhbGxlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cmVhZG9ubHkgaW5mb0NhbGxlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0Y29uZmlybVJlc3VsdDogSUNvbmZpcm1hdGlvblJlc3VsdCA9IHsgY29uZmlybWVkOiBmYWxzZSB9O1xuXG5cdG92ZXJyaWRlIGFzeW5jIGNvbmZpcm0oY29uZmlybWF0aW9uOiBJQ29uZmlybWF0aW9uKTogUHJvbWlzZTxJQ29uZmlybWF0aW9uUmVzdWx0PiB7XG5cdFx0dGhpcy5jb25maXJtYXRpb25zLnB1c2goY29uZmlybWF0aW9uKTtcblx0XHRyZXR1cm4gdGhpcy5jb25maXJtUmVzdWx0O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZXJyb3IobWVzc2FnZTogc3RyaW5nLCBkZXRhaWw/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmVycm9ycy5wdXNoKHsgbWVzc2FnZSwgZGV0YWlsOiBkZXRhaWwgPz8gJycgfSk7XG5cdFx0dGhpcy5lcnJvckNhbGxlZC5jb21wbGV0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgaW5mbyhtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmluZm9zLnB1c2gobWVzc2FnZSk7XG5cdFx0dGhpcy5pbmZvQ2FsbGVkLmNvbXBsZXRlKCk7XG5cdH1cbn1cblxuY2xhc3MgRmFrZVJ1bm5lciBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25SdW5uZXI+KCkge1xuXHR3aGVuRGlzcGF0Y2hlZDogUHJvbWlzZTxJQXV0b21hdGlvblJ1bkRpc3BhdGNoPiA9IFByb21pc2UucmVzb2x2ZSh7IGtpbmQ6ICdub3RTdGFydGVkJywgcmVhc29uOiAndGFyZ2V0VW5hdmFpbGFibGUnIH0pO1xuXHRydW5DYWxscyA9IDA7XG5cblx0b3ZlcnJpZGUgcnVuT25jZShfYXV0b21hdGlvbjogSUF1dG9tYXRpb25EZXNjcmlwdG9yLCBfdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsIF9sZWFkZXJXaW5kb3dJZDogbnVtYmVyLCBfdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIHtcblx0XHR0aGlzLnJ1bkNhbGxzKys7XG5cdFx0cmV0dXJuIHsgd2hlbkRpc3BhdGNoZWQ6IHRoaXMud2hlbkRpc3BhdGNoZWQsIHdoZW5Db21wbGV0ZWQ6IFByb21pc2UucmVzb2x2ZSgpIH07XG5cdH1cbn1cblxuY2xhc3MgRmFrZVNlc3Npb25zU2VydmljZSBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHZpc2libGVTZXNzaW9ucyA9IGNvbnN0T2JzZXJ2YWJsZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+KFtdKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbiA9IGNvbnN0T2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4odW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgb3BlbkdhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdG9wZW5DYWxscyA9IDA7XG5cdGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG9uT3BlbjogKCkgPT4gUHJvbWlzZTx2b2lkPikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBvcGVuU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm9wZW5DYWxscysrO1xuXHRcdGF3YWl0IHRoaXMub3BlbkdhdGUucDtcblx0XHRpZiAodGhpcy5lcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5lcnJvcjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5vbk9wZW4oKTtcblx0fVxufVxuXG5jbGFzcyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbkRlbGV0ZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8SVNlc3Npb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNDaGFuZ2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPElTZXNzaW9uc0NoYW5nZUV2ZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlbGV0ZWRTZXNzaW9uUmVzb3VyY2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWRkaXRpb25hbFNlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIElTZXNzaW9uPigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZERlbGV0ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25EZWxldGVkRW1pdHRlci5ldmVudDtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuc2Vzc2lvbnNDaGFuZ2VkRW1pdHRlci5ldmVudDtcblx0c2Vzc2lvbkV4aXN0cyA9IHRydWU7XG5cdHByaXZhdGUgZmlyc3RTZXNzaW9uQ2F0YWxvZ2VkID0gdHJ1ZTtcblx0cmVhZG9ubHkgaXNSZWFkID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0cmVhZG9ubHkgc2Vjb25kSXNSZWFkID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0cmVhZG9ubHkgc2Vzc2lvblN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPih0aGlzLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllcyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UsIHN1cHBvcnRzRGVsZXRlOiB0cnVlIH0pO1xuXHRyZWFkb25seSBzZXNzaW9uID0gdXBjYXN0UGFydGlhbDxJU2Vzc2lvbj4oe1xuXHRcdHJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFLFxuXHRcdHNlc3Npb25JZDogJ3Rlc3Qvc2Vzc2lvbi0xJyxcblx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0c2Vzc2lvblR5cGU6ICd0ZXN0Jyxcblx0XHRpY29uOiBDb2RpY29uLmFjY291bnQsXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuXHRcdHdvcmtzcGFjZTogY29uc3RPYnNlcnZhYmxlKHtcblx0XHRcdHVyaTogRk9MREVSLFxuXHRcdFx0bGFiZWw6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRmb2xkZXJzOiBbXSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHR9KSxcblx0XHRpc1F1aWNrQ2hhdDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKCdEYWlseSByZXZpZXcnKSxcblx0XHR1cGRhdGVkQXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZSgpKSxcblx0XHRpc1JlYWQ6IHRoaXMuaXNSZWFkLFxuXHRcdGNhcGFiaWxpdGllczogdGhpcy5jYXBhYmlsaXRpZXMsXG5cdFx0c3RhdHVzOiB0aGlzLnNlc3Npb25TdGF0dXMsXG5cdFx0Y2hhbmdlc2V0czogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRjaGFuZ2VzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdG1vZGVsSWQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdG1vZGU6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGxvYWRpbmc6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRkZXNjcmlwdGlvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0bGFzdFR1cm5FbmQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRbXT4oW10pLFxuXHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdD4oKSB7IH0pLFxuXHR9KTtcblx0cmVhZG9ubHkgc2Vjb25kU2Vzc2lvbiA9IHVwY2FzdFBhcnRpYWw8SVNlc3Npb24+KHtcblx0XHRyZXNvdXJjZTogU0VDT05EX1NFU1NJT05fUkVTT1VSQ0UsXG5cdFx0c2Vzc2lvbklkOiAndGVzdC9zZXNzaW9uLTInLFxuXHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRzZXNzaW9uVHlwZTogJ3Rlc3QnLFxuXHRcdGljb246IENvZGljb24uYWNjb3VudCxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG5cdFx0d29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUoe1xuXHRcdFx0dXJpOiBGT0xERVIsXG5cdFx0XHRsYWJlbDogJ3dvcmtzcGFjZScsXG5cdFx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH0pLFxuXHRcdGlzUXVpY2tDaGF0OiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRcdHRpdGxlOiBjb25zdE9ic2VydmFibGUoJ1NlY29uZCBkYWlseSByZXZpZXcnKSxcblx0XHR1cGRhdGVkQXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZSgpKSxcblx0XHRpc1JlYWQ6IHRoaXMuc2Vjb25kSXNSZWFkLFxuXHRcdGNhcGFiaWxpdGllczogdGhpcy5jYXBhYmlsaXRpZXMsXG5cdFx0c3RhdHVzOiB0aGlzLnNlc3Npb25TdGF0dXMsXG5cdFx0Y2hhbmdlc2V0czogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRjaGFuZ2VzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdG1vZGVsSWQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdG1vZGU6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGxvYWRpbmc6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRkZXNjcmlwdGlvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0bGFzdFR1cm5FbmQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRbXT4oW10pLFxuXHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdD4oKSB7IH0pLFxuXHR9KTtcblx0bWFya0FsbFJlYWRDYWxscyA9IDA7XG5cdG1hcmtBbGxSZWFkU2Vzc2lvbkNvdW50ID0gMDtcblx0Z2V0U2Vzc2lvbkNhbGxzID0gMDtcblx0ZGVsZXRlU2Vzc2lvbkNhbGxzID0gMDtcblx0Y2FuY2VsQ3VycmVudFJlcXVlc3RDYWxscyA9IDA7XG5cdGRlbGV0ZUVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0Y2FuY2VsRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBtYXJrQWxsUmVhZENvbXBsZXRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblxuXHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHtcblx0XHRpZiAoIXRoaXMuc2Vzc2lvbkV4aXN0cykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gWy4uLih0aGlzLmZpcnN0U2Vzc2lvbkNhdGFsb2dlZCA/IFt0aGlzLnNlc3Npb25dIDogW10pLCB0aGlzLnNlY29uZFNlc3Npb24sIC4uLnRoaXMuYWRkaXRpb25hbFNlc3Npb25zLnZhbHVlcygpXVxuXHRcdFx0LmZpbHRlcihzZXNzaW9uID0+ICF0aGlzLmRlbGV0ZWRTZXNzaW9uUmVzb3VyY2VzLmhhcyhzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLmdldFNlc3Npb25DYWxscysrO1xuXHRcdGlmICghdGhpcy5zZXNzaW9uRXhpc3RzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5kZWxldGVkU2Vzc2lvblJlc291cmNlcy5oYXMocmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChyZXNvdXJjZS50b1N0cmluZygpID09PSBTRVNTSU9OX1JFU09VUkNFLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlc3Npb247XG5cdFx0fVxuXHRcdGlmIChyZXNvdXJjZS50b1N0cmluZygpID09PSBTRUNPTkRfU0VTU0lPTl9SRVNPVVJDRS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZWNvbmRTZXNzaW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5hZGRpdGlvbmFsU2Vzc2lvbnMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgbWFya1JlYWQoc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc2Vzc2lvbiA9PT0gdGhpcy5zZXNzaW9uKSB7XG5cdFx0XHR0aGlzLmlzUmVhZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2UgaWYgKHNlc3Npb24gPT09IHRoaXMuc2Vjb25kU2Vzc2lvbikge1xuXHRcdFx0dGhpcy5zZWNvbmRJc1JlYWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGVsZXRlU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGVsZXRlU2Vzc2lvbkNhbGxzKys7XG5cdFx0aWYgKHRoaXMuZGVsZXRlRXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMuZGVsZXRlRXJyb3I7XG5cdFx0fVxuXHRcdHRoaXMuZGVsZXRlZFNlc3Npb25SZXNvdXJjZXMuYWRkKHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5zZXNzaW9uRGVsZXRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNhbmNlbEN1cnJlbnRSZXF1ZXN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2FuY2VsQ3VycmVudFJlcXVlc3RDYWxscysrO1xuXHRcdGlmICh0aGlzLmNhbmNlbEVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmNhbmNlbEVycm9yO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIG1hcmtBbGxSZWFkKHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tYXJrQWxsUmVhZENhbGxzKys7XG5cdFx0dGhpcy5tYXJrQWxsUmVhZFNlc3Npb25Db3VudCA9IHNlc3Npb25zLmxlbmd0aDtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGF3YWl0IHRoaXMubWFya1JlYWQoc2Vzc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMubWFya0FsbFJlYWRDb21wbGV0ZWQuY29tcGxldGUoKTtcblx0fVxuXG5cdHNldFJlYWQoaXNSZWFkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5pc1JlYWQuc2V0KGlzUmVhZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFN1cHBvcnRzRGVsZXRlKHN1cHBvcnRzRGVsZXRlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5jYXBhYmlsaXRpZXMuc2V0KHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSwgc3VwcG9ydHNEZWxldGUgfSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGFkZFNlc3Npb24ocmVzb3VyY2U6IFVSSSwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuYWRkaXRpb25hbFNlc3Npb25zLnNldChyZXNvdXJjZS50b1N0cmluZygpLCB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uPih7XG5cdFx0XHQuLi50aGlzLnNlc3Npb24sXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHNlc3Npb25JZDogcmVzb3VyY2UucGF0aCxcblx0XHRcdHRpdGxlOiBjb25zdE9ic2VydmFibGUodGl0bGUpLFxuXHRcdFx0aXNSZWFkOiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0Rmlyc3RTZXNzaW9uQ2F0YWxvZ2VkKGNhdGFsb2dlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuZmlyc3RTZXNzaW9uQ2F0YWxvZ2VkID0gY2F0YWxvZ2VkO1xuXHRcdHRoaXMuc2Vzc2lvbnNDaGFuZ2VkRW1pdHRlci5maXJlKHtcblx0XHRcdGFkZGVkOiBjYXRhbG9nZWQgPyBbdGhpcy5zZXNzaW9uXSA6IFtdLFxuXHRcdFx0cmVtb3ZlZDogY2F0YWxvZ2VkID8gW10gOiBbdGhpcy5zZXNzaW9uXSxcblx0XHRcdGNoYW5nZWQ6IFtdLFxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb25EZWxldGVkRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zZXNzaW9uc0NoYW5nZWRFbWl0dGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5zdWl0ZSgnQXV0b21hdGlvbnNDYXJkc1dpZGdldCcsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBnZXRTZXNzaW9uQWN0aW9uKHdpZGdldDogQXV0b21hdGlvbnNDYXJkc1dpZGdldCwgbGFiZWw6IHN0cmluZyk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gWy4uLndpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtcnVuLXNlc3Npb24tbGlzdCAuYWN0aW9uLWxhYmVsJyldXG5cdFx0XHQuZmluZChlbGVtZW50ID0+IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJykgPT09IGxhYmVsIHx8IGVsZW1lbnQudGl0bGUgPT09IGxhYmVsKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzTWFya0FsbFJlYWRWaXNpYmxlKHdpZGdldDogQXV0b21hdGlvbnNDYXJkc1dpZGdldCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtbWFyay1hbGwtcmVhZCcpO1xuXHRcdHJldHVybiAhIWJ1dHRvbiAmJiBidXR0b24uc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXAoKSB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IG5ldyBGYWtlRGlhbG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBGYWtlUnVubmVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gbmV3IEZha2VTZXNzaW9uc1NlcnZpY2UoKCkgPT4gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrUmVhZChzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNlc3Npb24pKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBjaGF0OiB7IGF1dG9tYXRpb25zOiB7IGVuYWJsZWQ6IHRydWUgfSB9IH0pO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgVGVzdExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gTW9kaWZpZXJLZXlFbWl0dGVyLmRpc3Bvc2VJbnN0YW5jZSgpKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY2Nlc3NpYmlsaXR5U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGlzTW90aW9uUmVkdWNlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0fSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNZW51U2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVTZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dG9tYXRpb25TZXJ2aWNlLCBhdXRvbWF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UsIGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRvbWF0aW9uUnVubmVyLCBydW5uZXIpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUhvdmVyU2VydmljZSwgTnVsbEhvdmVyU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbG9nU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNMaXN0TW9kZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc0xpc3RNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgaXNTZXNzaW9uUGlubmVkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdG92ZXJyaWRlIGdldFN0YXR1c0ljb24oKSB7IHJldHVybiBDb2RpY29uLmNpcmNsZVNtYWxsRmlsbGVkOyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXJzKCkgeyByZXR1cm4gW107IH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElWb2ljZVBsYXliYWNrU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVm9pY2VQbGF5YmFja1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcGVuZGluZ1Jlc3BvbnNlVmVyc2lvbiA9IGNvbnN0T2JzZXJ2YWJsZSgwKTtcblx0XHRcdG92ZXJyaWRlIGhhc1BlbmRpbmdSZXNwb25zZSgpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVzdEFnZW50U2Vzc2lvbnNTZXJ2aWNlLCB7XG5cdFx0XHRtb2RlbDoge1xuXHRcdFx0XHRvYnNlcnZlU2Vzc2lvbjogKCkgPT4gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBjaGF0TW9kZWxzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDdXN0b21WaWV3U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9tVmlld1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlQ3VzdG9tVmlldyA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJDdXN0b21WaWV3KCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0XHRcdG92ZXJyaWRlIGhpZGVDdXN0b21WaWV3KCkgeyB9XG5cdFx0fSgpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQXV0b21hdGlvbnNDdXN0b21WaWV3Q29udHJpYnV0aW9uKSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEF1dG9tYXRpb25zQ2FyZHNXaWRnZXQpKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZCh3aWRnZXQuZWxlbWVudCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB3aWRnZXQuZWxlbWVudC5yZW1vdmUoKSkpO1xuXHRcdHJldHVybiB7IGF1dG9tYXRpb25TZXJ2aWNlLCBhdXRvbWF0aW9uRGlhbG9nU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBsb2dTZXJ2aWNlLCBydW5uZXIsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgd2lkZ2V0IH07XG5cdH1cblxuXHR0ZXN0KCdyZW5kZXJzIGxvY2FsaXplZCBzY2hlZHVsZXMgYW5kIHNoYXJlZCBzZXNzaW9uIHJvd3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGl0ZW0gPSBhdXRvbWF0aW9uKHsgc2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogMTMsIHNjaGVkdWxlTWludXRlOiA1LCBzY2hlZHVsZURheTogMCB9IH0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFtpdGVtXSk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbcnVuKCldKTtcblx0XHRjb25zdCBzY2hlZHVsZVRpbWUgPSBuZXcgRGF0ZShEYXRlLlVUQygyMDAwLCAwLCAxLCAxMywgNSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzY2hlZHVsZTogd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLWNhcmQtbWV0YS1pdGVtJyk/LnRleHRDb250ZW50LFxuXHRcdFx0c2Vzc2lvblRpdGxlOiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbnMtcnVuLXNlc3Npb24tbGlzdCAubW9uYWNvLWhpZ2hsaWdodGVkLWxhYmVsJyk/LnRleHRDb250ZW50LFxuXHRcdFx0ZmFsbGJhY2tSb3dzOiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuYXV0b21hdGlvbnMtcnVuLWNhcmQnKS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0c2NoZWR1bGU6IGBEYWlseSBhdCAke3NjaGVkdWxlVGltZS50b0xvY2FsZVRpbWVTdHJpbmcodW5kZWZpbmVkLCB7IGhvdXI6ICdudW1lcmljJywgbWludXRlOiAnMi1kaWdpdCcsIHRpbWVab25lOiAnVVRDJyB9KX1gLFxuXHRcdFx0c2Vzc2lvblRpdGxlOiAnRGFpbHkgcmV2aWV3Jyxcblx0XHRcdGZhbGxiYWNrUm93czogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGEgdGVtcG9yYXJ5IFdvcmtpbmcgcm93IHVudGlsIGl0cyBzZXNzaW9uIHJlc29sdmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0Y29uc3QgcGVuZGluZ1J1biA9IHJ1bih7IHN0YXR1czogJ3BlbmRpbmcnLCBzZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCB9KTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtwZW5kaW5nUnVuXSk7XG5cdFx0Y29uc3QgdGVtcG9yYXJ5Um93ID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXRlbXBvcmFyeS1ydW4nKTtcblx0XHRjb25zdCBzcGlubmVyID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXRlbXBvcmFyeS1ydW4gLnNlc3Npb24taWNvbiAubW9uYWNvLXBpeGVsLXNwaW5uZXInKTtcblxuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3sgLi4ucGVuZGluZ1J1biwgc3RhdHVzOiAncnVubmluZycgfV0pO1xuXHRcdGNvbnN0IHJ1bm5pbmdSb3cgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbnMtdGVtcG9yYXJ5LXJ1bicpO1xuXHRcdGNvbnN0IHJ1bm5pbmdTcGlubmVyID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXRlbXBvcmFyeS1ydW4gLnNlc3Npb24taWNvbiAubW9uYWNvLXBpeGVsLXNwaW5uZXInKTtcblxuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3sgLi4ucGVuZGluZ1J1biwgc3RhdHVzOiAncnVubmluZycsIHNlc3Npb25SZXNvdXJjZTogU0VTU0lPTl9SRVNPVVJDRSB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRpdGxlOiB0ZW1wb3JhcnlSb3c/LnF1ZXJ5U2VsZWN0b3IoJy5zZXNzaW9uLXRpdGxlJyk/LnRleHRDb250ZW50LFxuXHRcdFx0c3RhdHVzOiB0ZW1wb3JhcnlSb3c/LnF1ZXJ5U2VsZWN0b3IoJy5zZXNzaW9uLWRlc2NyaXB0aW9uJyk/LnRleHRDb250ZW50LFxuXHRcdFx0cm93UHJlc2VydmVkOiBydW5uaW5nUm93ID09PSB0ZW1wb3JhcnlSb3csXG5cdFx0XHRzcGlubmVyUHJlc2VydmVkOiBydW5uaW5nU3Bpbm5lciA9PT0gc3Bpbm5lcixcblx0XHRcdHNwaW5uZXJVc2VzU2hhcmVkSWNvblNsb3Q6IHNwaW5uZXI/LnBhcmVudEVsZW1lbnQ/LmNsYXNzTGlzdC5jb250YWlucygnc2Vzc2lvbi1pY29uJyksXG5cdFx0XHR0ZW1wb3JhcnlSb3dzQWZ0ZXJDb21taXQ6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdXRvbWF0aW9ucy10ZW1wb3JhcnktcnVuJykubGVuZ3RoLFxuXHRcdFx0c2Vzc2lvblJvd3NBZnRlckNvbW1pdDogd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QgLnNlc3Npb24taXRlbScpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZTogJ0RhaWx5IHJldmlldycsXG5cdFx0XHRzdGF0dXM6ICdXb3JraW5nLi4uJyxcblx0XHRcdHJvd1ByZXNlcnZlZDogdHJ1ZSxcblx0XHRcdHNwaW5uZXJQcmVzZXJ2ZWQ6IHRydWUsXG5cdFx0XHRzcGlubmVyVXNlc1NoYXJlZEljb25TbG90OiB0cnVlLFxuXHRcdFx0dGVtcG9yYXJ5Um93c0FmdGVyQ29tbWl0OiAwLFxuXHRcdFx0c2Vzc2lvblJvd3NBZnRlckNvbW1pdDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYSB0ZW1wb3Jhcnkgcm93IHVudGlsIGEgdGVybWluYWwgcnVuIGVudGVycyB0aGUgY29tbWl0dGVkIHNlc3Npb24gY2F0YWxvZycsICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uuc2V0Rmlyc3RTZXNzaW9uQ2F0YWxvZ2VkKGZhbHNlKTtcblx0XHRjb25zdCBwZW5kaW5nUnVuID0gcnVuKHsgc3RhdHVzOiAncGVuZGluZycsIHNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkIH0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3BlbmRpbmdSdW5dKTtcblxuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3sgLi4ucGVuZGluZ1J1biwgc3RhdHVzOiAnY29tcGxldGVkJywgc2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFIH1dKTtcblx0XHRjb25zdCBiZWZvcmVDYXRhbG9nQ29tbWl0ID0ge1xuXHRcdFx0dGVtcG9yYXJ5Um93czogd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmF1dG9tYXRpb25zLXRlbXBvcmFyeS1ydW4nKS5sZW5ndGgsXG5cdFx0XHRzZXNzaW9uUm93czogd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QgLnNlc3Npb24taXRlbScpLmxlbmd0aCxcblx0XHR9O1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uuc2V0Rmlyc3RTZXNzaW9uQ2F0YWxvZ2VkKHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVDYXRhbG9nQ29tbWl0LFxuXHRcdFx0dGVtcG9yYXJ5Um93c0FmdGVyQ29tbWl0OiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuYXV0b21hdGlvbnMtdGVtcG9yYXJ5LXJ1bicpLmxlbmd0aCxcblx0XHRcdHNlc3Npb25Sb3dzQWZ0ZXJDb21taXQ6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdXRvbWF0aW9ucy1ydW4tc2Vzc2lvbi1saXN0IC5zZXNzaW9uLWl0ZW0nKS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlQ2F0YWxvZ0NvbW1pdDoge1xuXHRcdFx0XHR0ZW1wb3JhcnlSb3dzOiAxLFxuXHRcdFx0XHRzZXNzaW9uUm93czogMCxcblx0XHRcdH0sXG5cdFx0XHR0ZW1wb3JhcnlSb3dzQWZ0ZXJDb21taXQ6IDAsXG5cdFx0XHRzZXNzaW9uUm93c0FmdGVyQ29tbWl0OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVzIGEgdGVtcG9yYXJ5IHJvdyB3aGVuIHRoZSBydW4gZmFpbHMgYmVmb3JlIHNlc3Npb24gY3JlYXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRjb25zdCBwZW5kaW5nUnVuID0gcnVuKHsgc3RhdHVzOiAncGVuZGluZycsIHNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkIH0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3BlbmRpbmdSdW5dKTtcblxuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3sgLi4ucGVuZGluZ1J1biwgc3RhdHVzOiAnZmFpbGVkJywgZXJyb3JNZXNzYWdlOiAnZmFpbGVkIGJlZm9yZSBzZXNzaW9uIGNyZWF0aW9uJyB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRlbXBvcmFyeVJvd3M6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdXRvbWF0aW9ucy10ZW1wb3JhcnktcnVuJykubGVuZ3RoLFxuXHRcdFx0aGlzdG9yeVZpc2libGU6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtaGlzdG9yeScpPy5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScsXG5cdFx0fSwge1xuXHRcdFx0dGVtcG9yYXJ5Um93czogMCxcblx0XHRcdGhpc3RvcnlWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b21hdGlvbiB1cGRhdGVzIHByZXNlcnZlIGNhcmQgaWRlbnRpdHkgYW5kIGZvY3VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0Y29uc3QgY2FyZCA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1jYXJkJyk7XG5cdFx0Y29uc3QgZWRpdEJ1dHRvbiA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtY2FyZC1tYWluJyk7XG5cdFx0ZWRpdEJ1dHRvbj8uZm9jdXMoKTtcblxuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKHsgcHJvbXB0OiAnVXBkYXRlZCBwcm9tcHQnIH0pXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhbWVDYXJkOiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbnMtY2FyZCcpID09PSBjYXJkLFxuXHRcdFx0Zm9jdXNQcmVzZXJ2ZWQ6IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGVkaXRCdXR0b24sXG5cdFx0XHRwcm9tcHQ6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1jYXJkLXByb21wdCcpPy50ZXh0Q29udGVudCxcblx0XHR9LCB7XG5cdFx0XHRzYW1lQ2FyZDogdHJ1ZSxcblx0XHRcdGZvY3VzUHJlc2VydmVkOiB0cnVlLFxuXHRcdFx0cHJvbXB0OiAnVXBkYXRlZCBwcm9tcHQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0ZW50IGhpc3RvcnkgZ3JvdXBzIHN1cnZpdmUgdXBkYXRlcyBhbmQgZGlzcG9zZSBvbiByZW1vdmFsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cblx0XHQvLyBDcmVhdGUgYSBydW4gaW4gXCJ0b2RheVwiIGJ1Y2tldFxuXHRcdGNvbnN0IHRvZGF5UnVuID0gcnVuKHsgaWQ6ICdydW4tdG9kYXknLCBzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSB9KTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFt0b2RheVJ1bl0pO1xuXG5cdFx0Y29uc3QgdG9kYXlHcm91cCA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1oaXN0b3J5LWdyb3VwJyk7XG5cdFx0Y29uc3QgdG9kYXlMaXN0ID0gdG9kYXlHcm91cD8ucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QnKTtcblx0XHRhc3NlcnQub2sodG9kYXlHcm91cCwgJ3RvZGF5IGdyb3VwIHNob3VsZCBleGlzdCcpO1xuXHRcdGFzc2VydC5vayh0b2RheUxpc3QsICd0b2RheSBncm91cCBzaG91bGQgaGF2ZSBhIHNlc3Npb24gbGlzdCcpO1xuXG5cdFx0Ly8gQWRkIGEgc2Vjb25kIHJ1biBpbiBzYW1lIGJ1Y2tldCBcdTIwMTQgZ3JvdXAgaWRlbnRpdHkgc2hvdWxkIGJlIHByZXNlcnZlZFxuXHRcdGNvbnN0IHRvZGF5UnVuMiA9IHJ1bih7IGlkOiAncnVuLXRvZGF5LTInLCBzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwgc2Vzc2lvblJlc291cmNlOiBTRUNPTkRfU0VTU0lPTl9SRVNPVVJDRSB9KTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFt0b2RheVJ1biwgdG9kYXlSdW4yXSk7XG5cblx0XHRjb25zdCB0b2RheUdyb3VwQWZ0ZXIgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbnMtaGlzdG9yeS1ncm91cCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z3JvdXBSZXVzZWQ6IHRvZGF5R3JvdXBBZnRlciA9PT0gdG9kYXlHcm91cCxcblx0XHRcdGxpc3RSZXVzZWQ6IHRvZGF5R3JvdXBBZnRlcj8ucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QnKSA9PT0gdG9kYXlMaXN0LFxuXHRcdFx0cm93Q291bnQ6IHRvZGF5R3JvdXBBZnRlcj8ucXVlcnlTZWxlY3RvckFsbCgnLnNlc3Npb24taXRlbScpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRncm91cFJldXNlZDogdHJ1ZSxcblx0XHRcdGxpc3RSZXVzZWQ6IHRydWUsXG5cdFx0XHRyb3dDb3VudDogMixcblx0XHR9KTtcblxuXHRcdC8vIFJlbW92ZSBhbGwgcnVucyBcdTIwMTQgZ3JvdXAgc2hvdWxkIGJlIGRpc3Bvc2VkIGFuZCByZW1vdmVkIGZyb20gRE9NXG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbXSk7XG5cdFx0Y29uc3QgcmVtYWluaW5nR3JvdXBzID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmF1dG9tYXRpb25zLWhpc3RvcnktZ3JvdXAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtYWluaW5nR3JvdXBzLmxlbmd0aCwgMCwgJ2dyb3VwcyBzaG91bGQgYmUgcmVtb3ZlZCB3aGVuIGVtcHR5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1biBidXR0b24gZGlzYWJsZXMgdGVtcG9yYXJpbHkgYWZ0ZXIgY2xpY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cblx0XHRcdGNvbnN0IHJ1bkJ1dHRvbiA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtY2FyZC1ydW4tYnV0dG9uJyk7XG5cdFx0XHRhc3NlcnQub2socnVuQnV0dG9uKTtcblx0XHRcdGFzc2VydC5vayhydW5CdXR0b24ucXVlcnlTZWxlY3RvcignLmNvZGljb24tcGxheScpKTtcblx0XHRcdHJ1bkJ1dHRvbi5jbGljaygpO1xuXG5cdFx0XHRjb25zdCBydW5uaW5nU3RhdGUgPSB7XG5cdFx0XHRcdGRpc2FibGVkOiBydW5CdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyksXG5cdFx0XHRcdGxhYmVsOiBydW5CdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMF8wMDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cnVubmluZ1N0YXRlLFxuXHRcdFx0XHRyZXN0b3JlZFN0YXRlOiB7XG5cdFx0XHRcdFx0ZGlzYWJsZWQ6IHJ1bkJ1dHRvbi5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHRcdFx0XHRsYWJlbDogcnVuQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRydW5uaW5nU3RhdGU6IHtcblx0XHRcdFx0XHRkaXNhYmxlZDogJ3RydWUnLFxuXHRcdFx0XHRcdGxhYmVsOiAnUnVubmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc3RvcmVkU3RhdGU6IHtcblx0XHRcdFx0XHRkaXNhYmxlZDogJ2ZhbHNlJyxcblx0XHRcdFx0XHRsYWJlbDogJ1J1biBub3cnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvY3VzIHRhcmdldHMgdGhlIHZpZXcgd2l0aG91dCBzZWxlY3RpbmcgYW4gYXV0b21hdGlvbiBjYXJkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cblx0XHR3aWRnZXQuZm9jdXMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0aXZlRWxlbWVudDogZG9jdW1lbnQuYWN0aXZlRWxlbWVudCxcblx0XHRcdGNhcmRGb2N1c2VkOiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbnMtY2FyZC1tYWluJykgPT09IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQsXG5cdFx0fSwge1xuXHRcdFx0YWN0aXZlRWxlbWVudDogd2lkZ2V0LmVsZW1lbnQsXG5cdFx0XHRjYXJkRm9jdXNlZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IHN0YXRlIGlzIHJlbmRlcmVkIG9uY2UgYWNyb3NzIHJlcGVhdGVkIGVtcHR5IHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW10pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGl0bGVzOiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuYXV0b21hdGlvbnMtY2FyZHMtZW1wdHktdGl0bGUnKS5sZW5ndGgsXG5cdFx0XHRkZXNjcmlwdGlvbnM6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdXRvbWF0aW9ucy1jYXJkcy1lbXB0eS1kZXNjcmlwdGlvbicpLmxlbmd0aCxcblx0XHRcdGJ1dHRvbnM6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdXRvbWF0aW9ucy1jYXJkcy1jcmVhdGUtYnV0dG9uJykubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlczogMSxcblx0XHRcdGRlc2NyaXB0aW9uczogMSxcblx0XHRcdGJ1dHRvbnM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsaWNraW5nIHRoZSBjYXJkIG9wZW5zIGVkaXQgd2l0aG91dCBpbnRlcmNlcHRpbmcgYWN0aW9uIGNsaWNrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLCBhdXRvbWF0aW9uU2VydmljZSwgcnVubmVyLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgaXRlbSA9IGF1dG9tYXRpb24oKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbaXRlbV0pO1xuXG5cdFx0d2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1jYXJkJyk/LmNsaWNrKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Y29uc3QgYWN0aW9uQnV0dG9uID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1jYXJkLWFjdGlvbi1idXR0b24nKTtcblx0XHRhc3NlcnQub2soYWN0aW9uQnV0dG9uKTtcblx0XHRhY3Rpb25CdXR0b24uY2xpY2soKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2hvd0NhbGxzOiBhdXRvbWF0aW9uRGlhbG9nU2VydmljZS5zaG93Q2FsbHMsXG5cdFx0XHRleGlzdGluZzogYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UubGFzdE9wdGlvbnM/LmV4aXN0aW5nLFxuXHRcdFx0cnVuQ2FsbHM6IHJ1bm5lci5ydW5DYWxscyxcblx0XHR9LCB7XG5cdFx0XHRzaG93Q2FsbHM6IDEsXG5cdFx0XHRleGlzdGluZzogaXRlbSxcblx0XHRcdHJ1bkNhbGxzOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvbWF0aW9uIGFjdGlvbiBidXR0b25zIHN1cHBvcnQgYXJyb3cgbmF2aWdhdGlvbiBhbmQga2V5Ym9hcmQgYWN0aXZhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCBydW5uZXIsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0Y29uc3QgYnV0dG9ucyA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtY2FyZC1hY3Rpb24tYnV0dG9uJyk7XG5cdFx0Y29uc3QgcnVuQnV0dG9uID0gYnV0dG9ucy5pdGVtKDApO1xuXHRcdGNvbnN0IGRlbGV0ZUJ1dHRvbiA9IGJ1dHRvbnMuaXRlbSgxKTtcblxuXHRcdHJ1bkJ1dHRvbi5mb2N1cygpO1xuXHRcdGRpc3BhdGNoS2V5ZG93bihydW5CdXR0b24sIHsga2V5OiAnQXJyb3dSaWdodCcsIGNvZGU6ICdBcnJvd1JpZ2h0Jywga2V5Q29kZTogMzkgfSk7XG5cdFx0Y29uc3QgbW92ZWRSaWdodCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGRlbGV0ZUJ1dHRvbjtcblx0XHRkaXNwYXRjaEtleWRvd24oZGVsZXRlQnV0dG9uLCB7IGtleTogJ0Fycm93TGVmdCcsIGNvZGU6ICdBcnJvd0xlZnQnLCBrZXlDb2RlOiAzNyB9KTtcblx0XHRjb25zdCBtb3ZlZExlZnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBydW5CdXR0b247XG5cdFx0ZGlzcGF0Y2hLZXlkb3duKHJ1bkJ1dHRvbiwgeyBrZXk6ICdFbnRlcicsIGNvZGU6ICdFbnRlcicsIGtleUNvZGU6IDEzIH0pO1xuXHRcdGRpc3BhdGNoS2V5ZG93bihydW5CdXR0b24sIHsga2V5OiAnICcsIGNvZGU6ICdTcGFjZScsIGtleUNvZGU6IDMyIH0pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb3ZlZFJpZ2h0LFxuXHRcdFx0bW92ZWRMZWZ0LFxuXHRcdFx0cnVuQ2FsbHM6IHJ1bm5lci5ydW5DYWxscyxcblx0XHR9LCB7XG5cdFx0XHRtb3ZlZFJpZ2h0OiB0cnVlLFxuXHRcdFx0bW92ZWRMZWZ0OiB0cnVlLFxuXHRcdFx0cnVuQ2FsbHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RhcHBpbmcgdGhlIGNhcmQgb3BlbnMgZWRpdCB3aXRob3V0IGludGVyY2VwdGluZyBhY3Rpb24gdGFwcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLCBhdXRvbWF0aW9uU2VydmljZSwgcnVubmVyLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgaXRlbSA9IGF1dG9tYXRpb24oKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbaXRlbV0pO1xuXHRcdGNvbnN0IGNhcmQgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmF1dG9tYXRpb25zLWNhcmQnKTtcblx0XHRjb25zdCBhY3Rpb25CdXR0b24gPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignLmF1dG9tYXRpb25zLWNhcmQtYWN0aW9uLWJ1dHRvbicpO1xuXHRcdGFzc2VydC5vayhjYXJkKTtcblx0XHRhc3NlcnQub2soYWN0aW9uQnV0dG9uKTtcblxuXHRcdGNvbnN0IHRhcEV2ZW50ID0gbmV3IE1vdXNlRXZlbnQoVG91Y2hFdmVudFR5cGUuVGFwLCB7IGNhbmNlbGFibGU6IHRydWUgfSkgYXMgR2VzdHVyZUV2ZW50O1xuXHRcdHRhcEV2ZW50LmluaXRpYWxUYXJnZXQgPSBhY3Rpb25CdXR0b247XG5cdFx0YWN0aW9uQnV0dG9uLmRpc3BhdGNoRXZlbnQodGFwRXZlbnQpO1xuXHRcdGNhcmQuZGlzcGF0Y2hFdmVudCh0YXBFdmVudCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRjb25zdCBjYXJkVGFwRXZlbnQgPSBuZXcgTW91c2VFdmVudChUb3VjaEV2ZW50VHlwZS5UYXAsIHsgY2FuY2VsYWJsZTogdHJ1ZSB9KSBhcyBHZXN0dXJlRXZlbnQ7XG5cdFx0Y2FyZFRhcEV2ZW50LmluaXRpYWxUYXJnZXQgPSBjYXJkO1xuXHRcdGNhcmQuZGlzcGF0Y2hFdmVudChjYXJkVGFwRXZlbnQpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzaG93Q2FsbHM6IGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLnNob3dDYWxscyxcblx0XHRcdGV4aXN0aW5nOiBhdXRvbWF0aW9uRGlhbG9nU2VydmljZS5sYXN0T3B0aW9ucz8uZXhpc3RpbmcsXG5cdFx0XHRydW5DYWxsczogcnVubmVyLnJ1bkNhbGxzLFxuXHRcdH0sIHtcblx0XHRcdHNob3dDYWxsczogMSxcblx0XHRcdGV4aXN0aW5nOiBpdGVtLFxuXHRcdFx0cnVuQ2FsbHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gcm93IG9wZW5zIGFuZCBiZWNvbWVzIHJlYWQgb25seSBhZnRlciBvcGVuIHN1Y2NlZWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtydW4oKV0pO1xuXHRcdGNvbnN0IHJvdyA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtcnVuLXNlc3Npb24tbGlzdCAubW9uYWNvLWxpc3Qtcm93Jyk7XG5cblx0XHRhc3NlcnQub2socm93KTtcblx0XHRyb3cuY2xpY2soKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG9wZW5DYWxsczogc2Vzc2lvbnNTZXJ2aWNlLm9wZW5DYWxscyxcblx0XHRcdHJlYWRCZWZvcmVPcGVuOiBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmlzUmVhZC5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRvcGVuQ2FsbHM6IDEsXG5cdFx0XHRyZWFkQmVmb3JlT3BlbjogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRzZXNzaW9uc1NlcnZpY2Uub3BlbkdhdGUuY29tcGxldGUoKTtcblx0XHRhd2FpdCBzZXNzaW9uc1NlcnZpY2Uub3BlbkdhdGUucDtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNSZWFkOiBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmlzUmVhZC5nZXQoKSxcblx0XHRcdHVucmVhZENsYXNzOiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbnMtcnVuLXNlc3Npb24tbGlzdCAuc2Vzc2lvbi1pdGVtJyk/LmNsYXNzTGlzdC5jb250YWlucygndW5yZWFkJyksXG5cdFx0fSwge1xuXHRcdFx0aXNSZWFkOiB0cnVlLFxuXHRcdFx0dW5yZWFkQ2xhc3M6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW4gcmVtYWlucyB1bnJlYWQgd2hlbiBvcGVuaW5nIGl0cyBzZXNzaW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtydW4oKV0pO1xuXHRcdHNlc3Npb25zU2VydmljZS5lcnJvciA9IG5ldyBFcnJvcignb3BlbiBmYWlsZWQnKTtcblx0XHRjb25zdCByb3cgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QgLm1vbmFjby1saXN0LXJvdycpO1xuXHRcdGFzc2VydC5vayhyb3cpO1xuXG5cdFx0cm93LmNsaWNrKCk7XG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLm9wZW5HYXRlLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgZGlhbG9nU2VydmljZS5lcnJvckNhbGxlZC5wO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1JlYWQ6IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuaXNSZWFkLmdldCgpLFxuXHRcdFx0dW5yZWFkQ2xhc3M6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1ydW4tc2Vzc2lvbi1saXN0IC5zZXNzaW9uLWl0ZW0nKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCd1bnJlYWQnKSxcblx0XHRcdGVycm9yOiBkaWFsb2dTZXJ2aWNlLmVycm9ycyxcblx0XHR9LCB7XG5cdFx0XHRpc1JlYWQ6IGZhbHNlLFxuXHRcdFx0dW5yZWFkQ2xhc3M6IHRydWUsXG5cdFx0XHRlcnJvcjogW3sgbWVzc2FnZTogJ0ZhaWxlZCB0byBvcGVuIGF1dG9tYXRpb24gcnVuLicsIGRldGFpbDogJ29wZW4gZmFpbGVkJyB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiByZWFkIHN0YXRlIHJlYWN0aXZlbHkgdXBkYXRlcyBydW4gaGlzdG9yeScsICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3J1bigpXSk7XG5cblx0XHRjb25zdCB1bnJlYWRDbGFzcyA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1ydW4tc2Vzc2lvbi1saXN0IC5zZXNzaW9uLWl0ZW0nKT8uY2xhc3NMaXN0LmNvbnRhaW5zKCd1bnJlYWQnKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNldFJlYWQodHJ1ZSk7XG5cdFx0Y29uc3QgcmVhZENsYXNzID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QgLnNlc3Npb24taXRlbScpPy5jbGFzc0xpc3QuY29udGFpbnMoJ3VucmVhZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1bnJlYWRDbGFzcyxcblx0XHRcdHJlYWRDbGFzcyxcblx0XHRcdG1hcmtBbGxWaXNpYmxlOiBpc01hcmtBbGxSZWFkVmlzaWJsZSh3aWRnZXQpLFxuXHRcdH0sIHtcblx0XHRcdHVucmVhZENsYXNzOiB0cnVlLFxuXHRcdFx0cmVhZENsYXNzOiBmYWxzZSxcblx0XHRcdG1hcmtBbGxWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFyayBhbGwgYXMgcmVhZCBkZWxlZ2F0ZXMgdG8gc2Vzc2lvbiBtYW5hZ2VtZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbcnVuKCksIHJ1bih7IGlkOiAncnVuLTInIH0pXSk7XG5cblx0XHR3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignLmF1dG9tYXRpb25zLW1hcmstYWxsLXJlYWQnKT8uY2xpY2soKTtcblx0XHRhd2FpdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtBbGxSZWFkQ29tcGxldGVkLnA7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzUmVhZDogc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5pc1JlYWQuZ2V0KCksXG5cdFx0XHRtYXJrQWxsUmVhZENhbGxzOiBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtBbGxSZWFkQ2FsbHMsXG5cdFx0XHRtYXJrQWxsUmVhZFNlc3Npb25Db3VudDogc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrQWxsUmVhZFNlc3Npb25Db3VudCxcblx0XHRcdG1hcmtBbGxWaXNpYmxlOiBpc01hcmtBbGxSZWFkVmlzaWJsZSh3aWRnZXQpLFxuXHRcdH0sIHtcblx0XHRcdGlzUmVhZDogdHJ1ZSxcblx0XHRcdG1hcmtBbGxSZWFkQ2FsbHM6IDEsXG5cdFx0XHRtYXJrQWxsUmVhZFNlc3Npb25Db3VudDogMSxcblx0XHRcdG1hcmtBbGxWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFyayBhbGwgYXMgcmVhZCBjb2FsZXNjZXMgaGlzdG9yeSByZW5kZXJpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtcblx0XHRcdHJ1bigpLFxuXHRcdFx0cnVuKHsgaWQ6ICdydW4tMicsIHNlc3Npb25SZXNvdXJjZTogU0VDT05EX1NFU1NJT05fUkVTT1VSQ0UgfSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBtYXJrQWxsQnV0dG9uID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1tYXJrLWFsbC1yZWFkJyk7XG5cdFx0YXNzZXJ0Lm9rKG1hcmtBbGxCdXR0b24pO1xuXHRcdG1hcmtBbGxCdXR0b24uY2xpY2soKTtcblx0XHRjb25zdCBkaXNhYmxlZFdoaWxlTWFya2luZyA9IG1hcmtBbGxCdXR0b24uZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyk7XG5cdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrQWxsUmVhZENvbXBsZXRlZC5wO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNhYmxlZFdoaWxlTWFya2luZyxcblx0XHRcdGZpcnN0SXNSZWFkOiBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmlzUmVhZC5nZXQoKSxcblx0XHRcdHNlY29uZElzUmVhZDogc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZWNvbmRJc1JlYWQuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0ZGlzYWJsZWRXaGlsZU1hcmtpbmc6ICd0cnVlJyxcblx0XHRcdGZpcnN0SXNSZWFkOiB0cnVlLFxuXHRcdFx0c2Vjb25kSXNSZWFkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyBydW5zIHdpdGhvdXQgYSByZXNvbHZhYmxlIHNlc3Npb24gZnJvbSBydW4gaGlzdG9yeScsICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW1xuXHRcdFx0cnVuKHsgaWQ6ICdydW4tc2Vzc2lvbmxlc3MnLCBzZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCB9KSxcblx0XHRcdHJ1bih7IGlkOiAncnVuLXN0YWxlJywgc2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly90ZXN0L3N0YWxlJykgfSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgaGlkZGVuV2l0aG91dFNlc3Npb25zID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1oaXN0b3J5Jyk/LnN0eWxlLmRpc3BsYXkgPT09ICdub25lJztcblx0XHRjb25zdCBlbXB0eUdyb3VwcyA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdXRvbWF0aW9ucy1oaXN0b3J5LWdyb3VwJykubGVuZ3RoO1xuXG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbXG5cdFx0XHRydW4oKSxcblx0XHRcdHJ1bih7IGlkOiAncnVuLXNlc3Npb25sZXNzJywgc2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQgfSksXG5cdFx0XHRydW4oeyBpZDogJ3J1bi1zdGFsZScsIHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vdGVzdC9zdGFsZScpIH0pLFxuXHRcdFx0cnVuKHsgaWQ6ICdydW4tYicsIHNlc3Npb25SZXNvdXJjZTogU0VDT05EX1NFU1NJT05fUkVTT1VSQ0UgfSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCB0aXRsZXMgPSBbLi4ud2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QgLm1vbmFjby1oaWdobGlnaHRlZC1sYWJlbCcpXVxuXHRcdFx0Lm1hcChlbGVtZW50ID0+IGVsZW1lbnQudGV4dENvbnRlbnQpXG5cdFx0XHQuc29ydCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoaWRkZW5XaXRob3V0U2Vzc2lvbnMsXG5cdFx0XHRlbXB0eUdyb3Vwcyxcblx0XHRcdGxpc3RzOiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuYXV0b21hdGlvbnMtcnVuLXNlc3Npb24tbGlzdCcpLmxlbmd0aCxcblx0XHRcdHJvd3M6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdXRvbWF0aW9ucy1ydW4tc2Vzc2lvbi1saXN0IC5zZXNzaW9uLWl0ZW0nKS5sZW5ndGgsXG5cdFx0XHRmYWxsYmFja1Jvd3M6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5hdXRvbWF0aW9ucy1ydW4tY2FyZCcpLmxlbmd0aCxcblx0XHRcdHRpdGxlcyxcblx0XHR9LCB7XG5cdFx0XHRoaWRkZW5XaXRob3V0U2Vzc2lvbnM6IHRydWUsXG5cdFx0XHRlbXB0eUdyb3VwczogMCxcblx0XHRcdGxpc3RzOiAxLFxuXHRcdFx0cm93czogMixcblx0XHRcdGZhbGxiYWNrUm93czogMCxcblx0XHRcdHRpdGxlczogWydEYWlseSByZXZpZXcnLCAnU2Vjb25kIGRhaWx5IHJldmlldyddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBleHBvc2Ugc2Vzc2lvbiBkZWxldGlvbiBmb3IgYW4gYWN0aXZlIHJ1bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZXNzaW9uU3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHVuZGVmaW5lZCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3J1bih7IHN0YXR1czogJ3J1bm5pbmcnIH0pXSk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25BY3Rpb25zKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlbGV0ZVZpc2libGU6ICEhZ2V0U2Vzc2lvbkFjdGlvbih3aWRnZXQsICdEZWxldGUnKSxcblx0XHRcdHN0b3BWaXNpYmxlOiAhIWdldFNlc3Npb25BY3Rpb24od2lkZ2V0LCAnU3RvcCcpLFxuXHRcdH0sIHtcblx0XHRcdGRlbGV0ZVZpc2libGU6IGZhbHNlLFxuXHRcdFx0c3RvcFZpc2libGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3BzIGFuIGFjdGl2ZSBydW4gd2l0aG91dCBvcGVuaW5nIGl0cyBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uuc2Vzc2lvblN0YXR1cy5zZXQoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCB1bmRlZmluZWQpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtydW4oeyBzdGF0dXM6ICdydW5uaW5nJyB9KV0pO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQWN0aW9ucygpO1xuXG5cdFx0Y29uc3Qgc3RvcEJ1dHRvbiA9IGdldFNlc3Npb25BY3Rpb24od2lkZ2V0LCAnU3RvcCcpO1xuXHRcdGFzc2VydC5vayhzdG9wQnV0dG9uKTtcblx0XHRzdG9wQnV0dG9uLmNsaWNrKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiBzdG9wQnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpID8/IHN0b3BCdXR0b24udGl0bGUsXG5cdFx0XHRjYW5jZWxDdXJyZW50UmVxdWVzdENhbGxzOiBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRvcGVuQ2FsbHM6IHNlc3Npb25zU2VydmljZS5vcGVuQ2FsbHMsXG5cdFx0XHRkZWxldGVCdXR0b25WaXNpYmxlOiAhIWdldFNlc3Npb25BY3Rpb24od2lkZ2V0LCAnRGVsZXRlJyksXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdTdG9wJyxcblx0XHRcdGNhbmNlbEN1cnJlbnRSZXF1ZXN0Q2FsbHM6IDEsXG5cdFx0XHRvcGVuQ2FsbHM6IDAsXG5cdFx0XHRkZWxldGVCdXR0b25WaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmUtZW5hYmxlcyBTdG9wIHdoZW4gY2FuY2VsbGF0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNlc3Npb25TdGF0dXMuc2V0KFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgdW5kZWZpbmVkKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbcnVuKHsgc3RhdHVzOiAncnVubmluZycgfSldKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmNhbmNlbEVycm9yID0gbmV3IEVycm9yKCdzdG9wIGZhaWxlZCcpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQWN0aW9ucygpO1xuXG5cdFx0Y29uc3Qgc3RvcEJ1dHRvbiA9IGdldFNlc3Npb25BY3Rpb24od2lkZ2V0LCAnU3RvcCcpO1xuXHRcdGFzc2VydC5vayhzdG9wQnV0dG9uKTtcblx0XHRzdG9wQnV0dG9uLmNsaWNrKCk7XG5cdFx0YXdhaXQgZGlhbG9nU2VydmljZS5lcnJvckNhbGxlZC5wO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlbmFibGVkOiAhc3RvcEJ1dHRvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJyksXG5cdFx0XHRlcnJvcjogZGlhbG9nU2VydmljZS5lcnJvcnMsXG5cdFx0fSwge1xuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGVycm9yOiBbeyBtZXNzYWdlOiAnRmFpbGVkIHRvIHN0b3AgdGhlIGF1dG9tYXRpb24gcnVuIHNlc3Npb24uJywgZGV0YWlsOiAnc3RvcCBmYWlsZWQnIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGluZyBhIHJ1biBzZXNzaW9uIGNvbmZpcm1zIHRoZSBwZXJtYW5lbnQgZGVsZXRpb24gd2l0aG91dCBvcGVuaW5nIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtydW4oKV0pO1xuXHRcdGRpYWxvZ1NlcnZpY2UuY29uZmlybVJlc3VsdCA9IHsgY29uZmlybWVkOiB0cnVlIH07XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25BY3Rpb25zKCk7XG5cblx0XHRjb25zdCBkZWxldGVCdXR0b24gPSBnZXRTZXNzaW9uQWN0aW9uKHdpZGdldCwgJ0RlbGV0ZScpO1xuXHRcdGFzc2VydC5vayhkZWxldGVCdXR0b24pO1xuXHRcdGRlbGV0ZUJ1dHRvbi5jbGljaygpO1xuXHRcdGF3YWl0IGF1dG9tYXRpb25TZXJ2aWNlLmRlbGV0ZVJ1bkNvbXBsZXRlZC5wO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb25maXJtYXRpb246IGRpYWxvZ1NlcnZpY2UuY29uZmlybWF0aW9uc1swXSxcblx0XHRcdGRlbGV0ZVNlc3Npb25DYWxsczogc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kZWxldGVTZXNzaW9uQ2FsbHMsXG5cdFx0XHRkZWxldGVSdW5DYWxsczogYXV0b21hdGlvblNlcnZpY2UuZGVsZXRlUnVuQ2FsbHMsXG5cdFx0XHRvcGVuQ2FsbHM6IHNlc3Npb25zU2VydmljZS5vcGVuQ2FsbHMsXG5cdFx0XHRoaXN0b3J5SXRlbVN0aWxsVmlzaWJsZTogISF3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbnMtcnVuLXNlc3Npb24tbGlzdCAuc2Vzc2lvbi1pdGVtJyksXG5cdFx0fSwge1xuXHRcdFx0Y29uZmlybWF0aW9uOiB7XG5cdFx0XHRcdG1lc3NhZ2U6ICdEZWxldGUgdGhlIHNlc3Npb24gZm9yIFwiRGFpbHkgcmV2aWV3XCI/Jyxcblx0XHRcdFx0ZGV0YWlsOiAnVGhpcyB3aWxsIHBlcm1hbmVudGx5IGRlbGV0ZSB0aGUgc2Vzc2lvbiBhbmQgcmVtb3ZlIHRoaXMgaXRlbSBmcm9tIHJ1biBoaXN0b3J5LiBUaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLicsXG5cdFx0XHRcdHByaW1hcnlCdXR0b246ICdEZWxldGUnLFxuXHRcdFx0fSxcblx0XHRcdGRlbGV0ZVNlc3Npb25DYWxsczogMSxcblx0XHRcdGRlbGV0ZVJ1bkNhbGxzOiAxLFxuXHRcdFx0b3BlbkNhbGxzOiAwLFxuXHRcdFx0aGlzdG9yeUl0ZW1TdGlsbFZpc2libGU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGluZyB0aGUgZm9jdXNlZCBydW4gbW92ZXMgZm9jdXMgdG8gdGhlIG5leHQgcnVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbXG5cdFx0XHRydW4oKSxcblx0XHRcdHJ1bih7IGlkOiAncnVuLTInLCBzZXNzaW9uUmVzb3VyY2U6IFNFQ09ORF9TRVNTSU9OX1JFU09VUkNFIH0pLFxuXHRcdF0pO1xuXHRcdGRpYWxvZ1NlcnZpY2UuY29uZmlybVJlc3VsdCA9IHsgY29uZmlybWVkOiB0cnVlIH07XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25BY3Rpb25zKCk7XG5cblx0XHRjb25zdCBkZWxldGVCdXR0b24gPSBnZXRTZXNzaW9uQWN0aW9uKHdpZGdldCwgJ0RlbGV0ZScpO1xuXHRcdGFzc2VydC5vayhkZWxldGVCdXR0b24pO1xuXHRcdGNvbnN0IGxpc3QgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QgLm1vbmFjby1saXN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGxpc3QpO1xuXHRcdGxpc3QuZm9jdXMoKTtcblx0XHRkZWxldGVCdXR0b24uY2xpY2soKTtcblx0XHRhd2FpdCBhdXRvbWF0aW9uU2VydmljZS5kZWxldGVSdW5Db21wbGV0ZWQucDtcblx0XHRjb25zdCByZW1haW5pbmdSb3cgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QgLm1vbmFjby1saXN0LXJvdycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoaXN0b3J5SXRlbUNvdW50OiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuYXV0b21hdGlvbnMtcnVuLXNlc3Npb24tbGlzdCAuc2Vzc2lvbi1pdGVtJykubGVuZ3RoLFxuXHRcdFx0Zm9jdXNlZE5leHRSdW46IHJlbWFpbmluZ1Jvdz8uY2xhc3NMaXN0LmNvbnRhaW5zKCdmb2N1c2VkJyksXG5cdFx0fSwge1xuXHRcdFx0aGlzdG9yeUl0ZW1Db3VudDogMSxcblx0XHRcdGZvY3VzZWROZXh0UnVuOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxpbmcgcnVuIHNlc3Npb24gZGVsZXRpb24ga2VlcHMgdGhlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgZGlhbG9nU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtydW4oKV0pO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQWN0aW9ucygpO1xuXG5cdFx0Z2V0U2Vzc2lvbkFjdGlvbih3aWRnZXQsICdEZWxldGUnKT8uY2xpY2soKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29uZmlybWF0aW9uczogZGlhbG9nU2VydmljZS5jb25maXJtYXRpb25zLmxlbmd0aCxcblx0XHRcdGRlbGV0ZVNlc3Npb25DYWxsczogc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kZWxldGVTZXNzaW9uQ2FsbHMsXG5cdFx0XHRkZWxldGVCdXR0b25TdGlsbFZpc2libGU6ICEhZ2V0U2Vzc2lvbkFjdGlvbih3aWRnZXQsICdEZWxldGUnKSxcblx0XHR9LCB7XG5cdFx0XHRjb25maXJtYXRpb25zOiAxLFxuXHRcdFx0ZGVsZXRlU2Vzc2lvbkNhbGxzOiAwLFxuXHRcdFx0ZGVsZXRlQnV0dG9uU3RpbGxWaXNpYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBydW4gaGlzdG9yeSB3aGVuIHNlc3Npb24gZGVsZXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgZGlhbG9nU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtydW4oKV0pO1xuXHRcdGRpYWxvZ1NlcnZpY2UuY29uZmlybVJlc3VsdCA9IHsgY29uZmlybWVkOiB0cnVlIH07XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kZWxldGVFcnJvciA9IG5ldyBFcnJvcignZGVsZXRlIGZhaWxlZCcpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQWN0aW9ucygpO1xuXG5cdFx0Z2V0U2Vzc2lvbkFjdGlvbih3aWRnZXQsICdEZWxldGUnKT8uY2xpY2soKTtcblx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmVycm9yQ2FsbGVkLnA7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlbGV0ZVJ1bkNhbGxzOiBhdXRvbWF0aW9uU2VydmljZS5kZWxldGVSdW5DYWxscyxcblx0XHRcdGhpc3RvcnlJdGVtU3RpbGxWaXNpYmxlOiAhIXdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1ydW4tc2Vzc2lvbi1saXN0IC5zZXNzaW9uLWl0ZW0nKSxcblx0XHRcdGVycm9yOiBkaWFsb2dTZXJ2aWNlLmVycm9ycyxcblx0XHR9LCB7XG5cdFx0XHRkZWxldGVSdW5DYWxsczogMCxcblx0XHRcdGhpc3RvcnlJdGVtU3RpbGxWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZXJyb3I6IFt7IG1lc3NhZ2U6ICdGYWlsZWQgdG8gZGVsZXRlIHRoZSBhdXRvbWF0aW9uIHJ1biBzZXNzaW9uLicsIGRldGFpbDogJ2RlbGV0ZSBmYWlsZWQnIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBleHBvc2Ugc2Vzc2lvbiBkZWxldGlvbiB3aGVuIHRoZSBwcm92aWRlciBkb2VzIG5vdCBzdXBwb3J0IGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNldFN1cHBvcnRzRGVsZXRlKGZhbHNlKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbcnVuKCldKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkFjdGlvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZXNzaW9uQWN0aW9uKHdpZGdldCwgJ0RlbGV0ZScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0IGNvbmZsaWN0IGlzIHJlcG9ydGVkIHRvIHRoZSB1c2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UsIGF1dG9tYXRpb25TZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgaXRlbSA9IGF1dG9tYXRpb24oKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbaXRlbV0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZVJlc3VsdCA9IHsga2luZDogJ2NvbmZsaWN0JywgY3VycmVudDogYXV0b21hdGlvbih7IG5hbWU6ICdDaGFuZ2VkIGVsc2V3aGVyZScgfSkgfTtcblx0XHRhdXRvbWF0aW9uRGlhbG9nU2VydmljZS5yZXN1bHQgPSB7IGtpbmQ6ICd1cGRhdGUnLCBpZDogaXRlbS5pZCwgdmFsdWU6IHsgbmFtZTogJ0VkaXRlZCcgfSB9O1xuXG5cdFx0d2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1jYXJkLW1haW4nKT8uY2xpY2soKTtcblx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmVycm9yQ2FsbGVkLnA7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpYWxvZ1NlcnZpY2UuZXJyb3JzLCBbe1xuXHRcdFx0bWVzc2FnZTogJ0ZhaWxlZCB0byB1cGRhdGUgYXV0b21hdGlvbi4nLFxuXHRcdFx0ZGV0YWlsOiAnVGhpcyBhdXRvbWF0aW9uIGNoYW5nZWQgd2hpbGUgdGhlIGRpYWxvZyB3YXMgb3Blbi4gUmVvcGVuIGl0IHRvIHJldmlldyB0aGUgbGF0ZXN0IHZhbHVlcy4nLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdCBkaWFsb2cgZmFpbHVyZXMgYXJlIGxvZ2dlZCBhbmQgcmVwb3J0ZWQgdG8gdGhlIHVzZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uRGlhbG9nU2VydmljZSwgYXV0b21hdGlvblNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIGxvZ1NlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBpdGVtID0gYXV0b21hdGlvbigpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFtpdGVtXSk7XG5cdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ2RpYWxvZyBmYWlsZWQnKTtcblx0XHRhdXRvbWF0aW9uRGlhbG9nU2VydmljZS5lcnJvciA9IGVycm9yO1xuXG5cdFx0d2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1jYXJkLW1haW4nKT8uY2xpY2soKTtcblx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmVycm9yQ2FsbGVkLnA7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxvZ2dlZEVycm9yczogbG9nU2VydmljZS5lcnJvcnMsXG5cdFx0XHRkaWFsb2dFcnJvcnM6IGRpYWxvZ1NlcnZpY2UuZXJyb3JzLFxuXHRcdH0sIHtcblx0XHRcdGxvZ2dlZEVycm9yczogW3tcblx0XHRcdFx0bWVzc2FnZTogJ1tBdXRvbWF0aW9uc0NhcmRzXSBGYWlsZWQgdG8gdXBkYXRlIGF1dG9tYXRpb24nLFxuXHRcdFx0XHRhcmdzOiBbZXJyb3JdLFxuXHRcdFx0fV0sXG5cdFx0XHRkaWFsb2dFcnJvcnM6IFt7XG5cdFx0XHRcdG1lc3NhZ2U6ICdGYWlsZWQgdG8gdXBkYXRlIGF1dG9tYXRpb24uJyxcblx0XHRcdFx0ZGV0YWlsOiAnZGlhbG9nIGZhaWxlZCcsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncnVuIGZhaWx1cmVzIGFyZSByZXBvcnRlZCB0byB0aGUgdXNlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCBydW5uZXIsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0cnVubmVyLndoZW5EaXNwYXRjaGVkID0gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdydW5uZXIgZmFpbGVkJykpO1xuXG5cdFx0d2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1jYXJkLWFjdGlvbi1idXR0b24nKT8uY2xpY2soKTtcblx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmVycm9yQ2FsbGVkLnA7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpYWxvZ1NlcnZpY2UuZXJyb3JzLCBbe1xuXHRcdFx0bWVzc2FnZTogJ0ZhaWxlZCB0byBydW4gYXV0b21hdGlvbi4nLFxuXHRcdFx0ZGV0YWlsOiAncnVubmVyIGZhaWxlZCcsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxpbmcgYXV0b21hdGlvbnMgd2hpbGUgdGhlIGRpYWxvZyBpcyBvcGVuIHByZXZlbnRzIHRoZSB1cGRhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uRGlhbG9nU2VydmljZSwgYXV0b21hdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBkaWFsb2dTZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgaXRlbSA9IGF1dG9tYXRpb24oKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbaXRlbV0pO1xuXHRcdGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLnJlc3VsdCA9IHsga2luZDogJ3VwZGF0ZScsIGlkOiBpdGVtLmlkLCB2YWx1ZTogeyBuYW1lOiAnRWRpdGVkJyB9IH07XG5cdFx0YXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UuYmVmb3JlUmV0dXJuID0gKCkgPT4gY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuYXV0b21hdGlvbnMuZW5hYmxlZCcsIGZhbHNlKTtcblxuXHRcdHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtY2FyZC1tYWluJyk/LmNsaWNrKCk7XG5cdFx0YXdhaXQgZGlhbG9nU2VydmljZS5pbmZvQ2FsbGVkLnA7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGluZm86IGRpYWxvZ1NlcnZpY2UuaW5mb3MsXG5cdFx0XHR1cGRhdGVDYWxsczogYXV0b21hdGlvblNlcnZpY2UudXBkYXRlQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0aW5mbzogWydBdXRvbWF0aW9ucyBhcmUgZGlzYWJsZWQuJ10sXG5cdFx0XHR1cGRhdGVDYWxsczogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWNjZXNzaWJsZSB2aWV3IGluY2x1ZGVzIGF1dG9tYXRpb24gYW5kIHJ1biBjb250ZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGJ1aWxkQXV0b21hdGlvbnNBY2Nlc3NpYmxlQ29udGVudChbYXV0b21hdGlvbigpXSwgW3J1bih7IHN0YXR1czogJ2ZhaWxlZCcsIGVycm9yTWVzc2FnZTogJ2Jvb20nIH0pXSkuaW5jbHVkZXMoJ0RhaWx5IHJldmlldywgRmFpbGVkJyksXG5cdFx0XHR0cnVlLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bm5pbmcgcnVuIHNob3dzIG5lZWRzLWlucHV0IGluZGljYXRvciB3aGVuIHNlc3Npb24gc3RhdHVzIHRyYW5zaXRpb25zIHRvIE5lZWRzSW5wdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uuc2Vzc2lvblN0YXR1cy5zZXQoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCB1bmRlZmluZWQpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtydW4oeyBzdGF0dXM6ICdydW5uaW5nJyB9KV0pO1xuXG5cdFx0Y29uc3QgY2FyZCA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtcnVuLXNlc3Npb24tbGlzdCAuc2Vzc2lvbi1pdGVtJyk7XG5cdFx0YXNzZXJ0Lm9rKGNhcmQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXJkLmNsYXNzTGlzdC5jb250YWlucygnbmVlZHMtaW5wdXQnKSwgZmFsc2UpO1xuXG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZXNzaW9uU3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25BY3Rpb25zKCk7XG5cblx0XHRjb25zdCB1cGRhdGVkQ2FyZCA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtcnVuLXNlc3Npb24tbGlzdCAuc2Vzc2lvbi1pdGVtJyk7XG5cdFx0YXNzZXJ0Lm9rKHVwZGF0ZWRDYXJkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXBkYXRlZENhcmQuY2xhc3NMaXN0LmNvbnRhaW5zKCduZWVkcy1pbnB1dCcpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soZ2V0U2Vzc2lvbkFjdGlvbih3aWRnZXQsICdTdG9wJykpO1xuXHR9KTtcblxuXHR0ZXN0KCduZWVkcy1pbnB1dCBpbmRpY2F0b3IgcmV2ZXJ0cyB3aGVuIHNlc3Npb24gc3RhdHVzIHJldHVybnMgdG8gSW5Qcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZXNzaW9uU3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHVuZGVmaW5lZCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3J1bih7IHN0YXR1czogJ3J1bm5pbmcnIH0pXSk7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZXNzaW9uU3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXJ1bi1zZXNzaW9uLWxpc3QgLnNlc3Npb24taXRlbScpPy5jbGFzc0xpc3QuY29udGFpbnMoJ25lZWRzLWlucHV0JyksIHRydWUpO1xuXG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZXNzaW9uU3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBjYXJkID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1ydW4tc2Vzc2lvbi1saXN0IC5zZXNzaW9uLWl0ZW0nKTtcblx0XHRhc3NlcnQub2soY2FyZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcmQuY2xhc3NMaXN0LmNvbnRhaW5zKCduZWVkcy1pbnB1dCcpLCBmYWxzZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBdXRvbWF0aW9uc0N1c3RvbVZpZXdDb250cmlidXRpb24gXHUyMDE0IGNvbnRleHQga2V5JywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHNldHVwKGF1dG9tYXRpb25zRW5hYmxlZCA9IHRydWUpIHtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKTtcblx0XHRDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldChhdXRvbWF0aW9uc0VuYWJsZWQpO1xuXHRcdGxldCByZXN0b3JlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0b21hdGlvblNlcnZpY2UsIGF1dG9tYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUN1c3RvbVZpZXdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDdXN0b21WaWV3U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVDdXN0b21WaWV3ID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0XHRvdmVycmlkZSByZWdpc3RlckN1c3RvbVZpZXcoX2Rlc2NyaXB0b3I6IElDdXN0b21WaWV3RGVzY3JpcHRvciwgb3B0aW9ucz86IHsgcmVhZG9ubHkgcmVzdG9yZT86IGJvb2xlYW4gfSkge1xuXHRcdFx0XHRyZXN0b3JlID0gb3B0aW9ucz8ucmVzdG9yZTtcblx0XHRcdFx0cmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgaGlkZUN1c3RvbVZpZXcoKSB7IH1cblx0XHR9KCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFjdGlvblZpZXdJdGVtU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlZ2lzdGVyKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0XHR9KCkpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXRvbWF0aW9uc0N1c3RvbVZpZXdDb250cmlidXRpb24pKTtcblx0XHRyZXR1cm4geyBhdXRvbWF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbnRyaWJ1dGlvbiwgcmVzdG9yZSB9O1xuXHR9XG5cblx0dGVzdCgnQXV0b21hdGlvbnNIYXNJdGVtc0NvbnRleHQgZm9sbG93cyB0aGUgYXV0b21hdGlvbnMgb2JzZXJ2YWJsZSAoZW1wdHkgXHUyMTkyIG5vbi1lbXB0eSBcdTIxOTIgZW1wdHkpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlIH0gPSBzZXR1cCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShBdXRvbWF0aW9uc0hhc0l0ZW1zQ29udGV4dC5rZXkpLCBmYWxzZSwgJ2luaXRpYWxseSBmYWxzZScpO1xuXG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoQXV0b21hdGlvbnNIYXNJdGVtc0NvbnRleHQua2V5KSwgdHJ1ZSwgJ3RydWUgd2hlbiBub24tZW1wdHknKTtcblxuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKEF1dG9tYXRpb25zSGFzSXRlbXNDb250ZXh0LmtleSksIGZhbHNlLCAnZmFsc2Ugd2hlbiBlbXB0eSBhZ2FpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyB0aGUgQXV0b21hdGlvbnMgdmlldyBvbmx5IHdoZW4gdGhlIGZlYXR1cmUgaXMgZW5hYmxlZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVuYWJsZWQ6IHNldHVwKHRydWUpLnJlc3RvcmUsXG5cdFx0XHRkaXNhYmxlZDogc2V0dXAoZmFsc2UpLnJlc3RvcmUsXG5cdFx0fSwge1xuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGRpc2FibGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXVCLGFBQWEsc0JBQXNCO0FBQzFELFNB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
