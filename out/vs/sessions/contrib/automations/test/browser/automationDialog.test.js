import assert from "assert";
import * as DOM from "../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Action } from "../../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ResultKind } from "../../../../../platform/keybinding/common/keybindingResolver.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { createWorkbenchDialogOptions } from "../../../../../workbench/browser/parts/dialogs/dialog.js";
import { GitRefType, IGitService } from "../../../../../workbench/contrib/git/common/gitService.js";
import { SessionTypeAuthRequirement } from "../../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { AutomationIsolationGroupActionViewItem, AutomationSessionDraftSynchronizer, canSelectAutomationWorkspace, isAutomationDialogEditCommand, isAutomationDialogPopupTarget, registerAutomationDialogKeyboardNavigation, resolveAutomationModelIdentifier, updateSaveButtonState } from "../../browser/automationDialog.js";
import { AutomationIsolationModel } from "../../common/isolationGroupModel.js";
const FOLDER = URI.file("/workspace");
function dispatchKey(target, type, key, shiftKey = false) {
  const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true, shiftKey });
  target.dispatchEvent(event);
  return event;
}
function dispatchAutomationDialogCommand(target, commandId) {
  const options = createWorkbenchDialogOptions(
    {},
    upcastPartial({
      softDispatch: () => ({ kind: ResultKind.KbFound, commandId, commandArgs: void 0, isBubble: false })
    }),
    upcastPartial({ activeContainer: document.body }),
    upcastPartial({}),
    /* @__PURE__ */ new Set(),
    (id, event) => isAutomationDialogEditCommand(id, event.target)
  );
  target.addEventListener("keydown", (event) => options.keyEventProcessor?.(new StandardKeyboardEvent(event)), { once: true });
  return dispatchKey(target, "keydown", "z");
}
class RecordingActionWidgetService extends mock() {
  constructor() {
    super(...arguments);
    this.isVisible = false;
    this.labels = [];
    this.details = [];
    this.ariaLabels = [];
  }
  show(_user, _supportsPreview, items, delegate, _anchor, _container, _actionBarActions, accessibilityProvider, _listOptions) {
    this.isVisible = true;
    this.labels = items.map((item) => item.label ?? "");
    this.details = items.map((item) => item.detail);
    this.ariaLabels = items.map((item) => {
      const label = accessibilityProvider?.getAriaLabel?.(item);
      return typeof label === "string" ? label : label?.get() ?? "";
    });
    this.selectItem = (label) => {
      const item = items.find((candidate) => candidate.label === label)?.item;
      if (item) {
        delegate.onSelect(item);
      }
    };
    this.hideWidget = delegate.onHide;
  }
  updateItems(items, _focusItemId) {
    this.labels = items.map((item) => item.label ?? "");
  }
  focusItemById(_itemId) {
  }
  hide(didCancel) {
    if (!this.isVisible) {
      return;
    }
    this.isVisible = false;
    const onHide = this.hideWidget;
    this.hideWidget = void 0;
    onHide?.(didCancel);
  }
  select(label) {
    this.selectItem?.(label);
  }
}
function createFormState(overrides) {
  return {
    name: "Automation",
    interval: "daily",
    hour: 9,
    minute: 0,
    day: 1,
    isQuickChat: false,
    folderUri: FOLDER,
    providerId: "default-copilot",
    sessionTypeId: "copilotcli",
    isolationMode: "worktree",
    branch: void 0,
    enabled: true,
    ...overrides
  };
}
function createWorkspace(requiresWorkspaceTrust) {
  return {
    uri: FOLDER,
    label: "Workspace",
    icon: Codicon.folder,
    folders: [{ root: FOLDER, workingDirectory: FOLDER, name: "Workspace", description: void 0 }],
    requiresWorkspaceTrust,
    isVirtualWorkspace: false
  };
}
function createAutomationDraftService() {
  const automationSession = observableValue("automationSession", void 0);
  const created = [];
  const discarded = [];
  let nextId = 1;
  const createDraft = (kind, providerId, sessionTypeId, folderUri) => {
    const previous = automationSession.get();
    if (previous) {
      discarded.push(previous.sessionId);
    }
    const session = upcastPartial({
      sessionId: `automation-${nextId++}`,
      providerId: providerId ?? "resolved-provider",
      sessionType: sessionTypeId
    });
    created.push({ kind, providerId, sessionTypeId, folderUri: folderUri?.toString() });
    automationSession.set(session, void 0);
    return session;
  };
  const service = upcastPartial({
    automationSession,
    createAutomationSession: (folderUri, options) => createDraft("workspace", options?.providerId, options?.sessionTypeId ?? "default", folderUri),
    createAutomationQuickChat: (options) => createDraft("quickChat", options?.providerId, options?.sessionTypeId ?? "default"),
    discardAutomationSession: (session) => {
      const current = automationSession.get();
      if (!current || session && session.sessionId !== current.sessionId) {
        return;
      }
      discarded.push(current.sessionId);
      automationSession.set(void 0, void 0);
    }
  });
  return { service, created, discarded };
}
suite("Automation session draft synchronization", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("tracks target changes without recreating an equal workspace target", async () => {
    const { service, created, discarded } = createAutomationDraftService();
    let errorCount = 0;
    const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async () => true, () => errorCount++));
    synchronizer.update({ kind: "workspace", folderUri: URI.parse("file:///workspace"), providerId: "provider-a", sessionTypeId: "type-a" });
    await synchronizer.waitForSync();
    synchronizer.update({ kind: "workspace", folderUri: URI.parse("file:///workspace"), providerId: "provider-a", sessionTypeId: "type-a" });
    await synchronizer.waitForSync();
    service.discardAutomationSession();
    synchronizer.update({ kind: "workspace", folderUri: URI.parse("file:///workspace"), providerId: "provider-a", sessionTypeId: "type-a" });
    await synchronizer.waitForSync();
    synchronizer.update({ kind: "workspace", folderUri: URI.parse("file:///workspace"), providerId: "provider-b", sessionTypeId: "type-b" });
    await synchronizer.waitForSync();
    synchronizer.update({ kind: "quickChat", providerId: "provider-b", sessionTypeId: "type-b" });
    await synchronizer.waitForSync();
    synchronizer.update(void 0);
    await synchronizer.waitForSync();
    assert.deepStrictEqual({
      created,
      discarded,
      currentSession: service.automationSession.get()?.sessionId,
      errorCount
    }, {
      created: [
        { kind: "workspace", providerId: "provider-a", sessionTypeId: "type-a", folderUri: "file:///workspace" },
        { kind: "workspace", providerId: "provider-a", sessionTypeId: "type-a", folderUri: "file:///workspace" },
        { kind: "workspace", providerId: "provider-b", sessionTypeId: "type-b", folderUri: "file:///workspace" },
        { kind: "quickChat", providerId: "provider-b", sessionTypeId: "type-b", folderUri: void 0 }
      ],
      discarded: ["automation-1", "automation-2", "automation-3", "automation-4"],
      currentSession: void 0,
      errorCount: 0
    });
  });
  test("ignores stale workspace validation", async () => {
    const { service, created } = createAutomationDraftService();
    const firstWorkspaceValidation = new DeferredPromise();
    const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(
      service,
      (folderUri) => folderUri.path === "/first" ? firstWorkspaceValidation.p : Promise.resolve(true),
      () => {
      }
    ));
    synchronizer.update({ kind: "workspace", folderUri: URI.parse("file:///first"), providerId: "provider", sessionTypeId: "type" });
    await Promise.resolve();
    synchronizer.update({ kind: "workspace", folderUri: URI.parse("file:///second"), providerId: "provider", sessionTypeId: "type" });
    await synchronizer.waitForSync();
    firstWorkspaceValidation.complete(true);
    await Promise.resolve();
    assert.deepStrictEqual(created, [
      { kind: "workspace", providerId: "provider", sessionTypeId: "type", folderUri: "file:///second" }
    ]);
  });
  test("surfaces workspace validation failures without creating a draft", async () => {
    const { service, created } = createAutomationDraftService();
    let errorCount = 0;
    const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(
      service,
      () => Promise.reject(new Error("validation failed")),
      () => errorCount++
    ));
    synchronizer.update({ kind: "workspace", folderUri: URI.parse("file:///workspace"), providerId: "provider", sessionTypeId: "type" });
    await synchronizer.waitForSync();
    assert.deepStrictEqual({
      created,
      currentSession: service.automationSession.get()?.sessionId,
      errorCount
    }, {
      created: [],
      currentSession: void 0,
      errorCount: 1
    });
  });
  test("retries an unchanged target after draft creation fails", async () => {
    const automationSession = observableValue("automationSession", void 0);
    let createCount = 0;
    let errorCount = 0;
    const service = upcastPartial({
      automationSession,
      createAutomationSession: (_folderUri, options) => {
        if (createCount++ === 0) {
          throw new Error("provider unavailable");
        }
        const session = upcastPartial({
          sessionId: "automation-retry",
          providerId: options?.providerId ?? "provider",
          sessionType: options?.sessionTypeId ?? "type"
        });
        automationSession.set(session, void 0);
        return session;
      },
      discardAutomationSession: () => automationSession.set(void 0, void 0)
    });
    const synchronizer = disposables.add(new AutomationSessionDraftSynchronizer(service, async () => true, () => errorCount++));
    const target = { kind: "workspace", folderUri: URI.parse("file:///workspace"), providerId: "provider", sessionTypeId: "type" };
    synchronizer.update(target);
    await synchronizer.waitForSync();
    synchronizer.update(target);
    await synchronizer.waitForSync();
    assert.deepStrictEqual({
      createCount,
      errorCount,
      sessionId: automationSession.get()?.sessionId
    }, {
      createCount: 2,
      errorCount: 1,
      sessionId: "automation-retry"
    });
  });
});
suite("Automation workspace trust", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("rejects an unresolved workspace using the preferred provider", async () => {
    const resolveRequests = [];
    const trustRequests = [];
    const result = await canSelectAutomationWorkspace(
      FOLDER,
      "preferred",
      upcastPartial({
        resolveWorkspace: (folderUri, preferredProviderId) => {
          resolveRequests.push({ folderUri: folderUri.toString(), preferredProviderId });
          return void 0;
        }
      }),
      upcastPartial({
        requestResourcesTrust: async (options) => {
          trustRequests.push(options);
          return true;
        }
      })
    );
    assert.deepStrictEqual({
      result,
      resolveRequests,
      trustRequestCount: trustRequests.length
    }, {
      result: false,
      resolveRequests: [{ folderUri: FOLDER.toString(), preferredProviderId: "preferred" }],
      trustRequestCount: 0
    });
  });
  test("accepts a workspace that does not require trust without prompting", async () => {
    const trustRequests = [];
    const result = await canSelectAutomationWorkspace(
      FOLDER,
      "preferred",
      upcastPartial({
        resolveWorkspace: () => ({ providerId: "preferred", workspace: createWorkspace(false) })
      }),
      upcastPartial({
        requestResourcesTrust: async (options) => {
          trustRequests.push(options);
          return false;
        }
      })
    );
    assert.deepStrictEqual({
      result,
      trustRequestCount: trustRequests.length
    }, {
      result: true,
      trustRequestCount: 0
    });
  });
  for (const trustResult of [true, false, void 0]) {
    test(`returns ${trustResult === true ? "true when trust is granted" : "false when trust is " + (trustResult === false ? "declined" : "cancelled")}`, async () => {
      const trustRequests = [];
      const result = await canSelectAutomationWorkspace(
        FOLDER,
        "preferred",
        upcastPartial({
          resolveWorkspace: () => ({ providerId: "preferred", workspace: createWorkspace(true) })
        }),
        upcastPartial({
          requestResourcesTrust: async (options) => {
            trustRequests.push(options);
            return trustResult;
          }
        })
      );
      assert.deepStrictEqual({
        result,
        trustRequests: trustRequests.map((request) => ({
          uri: request.uri.toString(),
          message: request.message
        }))
      }, {
        result: trustResult === true,
        trustRequests: [{
          uri: FOLDER.toString(),
          message: "An agent session will be able to read files, run commands, and make changes in this folder."
        }]
      });
    });
  }
});
suite("Automation branch picker", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createItem(options) {
    const state = options?.state ?? createFormState();
    const model = new AutomationIsolationModel(state);
    const repositoryState = observableValue("repositoryState", {
      HEAD: { type: GitRefType.Head, name: "main", commit: "abc123" },
      remotes: [],
      mergeChanges: [],
      indexChanges: [],
      workingTreeChanges: [],
      untrackedChanges: []
    });
    const repository = upcastPartial({
      rootUri: FOLDER,
      state: repositoryState,
      getRefs: options?.getRefs ?? (async () => [
        { type: GitRefType.Head, name: "feature/z" },
        { type: GitRefType.Head, name: "main" },
        { type: GitRefType.Head, name: "feature/a" },
        { type: GitRefType.Head, name: "copilot-worktree-generated" }
      ])
    });
    const actionWidgetService = new RecordingActionWidgetService();
    const visible = observableValue("repositoryControlsVisible", options?.visible ?? true);
    let openRepositoryAttempts = 0;
    let providerAvailable = !options?.providerInitiallyUnavailable;
    const sessionTypesChanged = disposables.add(new Emitter());
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IActionWidgetService, actionWidgetService);
    instantiationService.stub(IGitService, upcastPartial({
      openRepository: async () => {
        openRepositoryAttempts++;
        if (options?.failOpenRepositoryOnce && openRepositoryAttempts === 1) {
          throw new Error("failed to open repository");
        }
        return repository;
      }
    }));
    instantiationService.stub(ISessionsManagementService, upcastPartial({
      onDidChangeSessionTypes: sessionTypesChanged.event,
      getSessionTypesForFolder: () => providerAvailable ? [{
        providerId: state.providerId ?? "default-copilot",
        sessionType: {
          id: state.sessionTypeId ?? "copilotcli",
          label: "Copilot",
          icon: Codicon.copilot,
          supportsWorktreeConfiguration: state.sessionTypeId === "copilotcli",
          authRequirement: SessionTypeAuthRequirement.GitHub
        }
      }] : []
    }));
    instantiationService.stub(ILogService, new NullLogService());
    const action = disposables.add(new Action("test.automationIsolation", "Automation Isolation"));
    const item = disposables.add(instantiationService.createInstance(
      AutomationIsolationGroupActionViewItem,
      action,
      state,
      model,
      model.folderUriObs,
      Event.None,
      options?.revalidate ?? (() => {
      }),
      void 0,
      visible
    ));
    const container = document.createElement("div");
    item.render(container);
    return {
      container,
      state,
      model,
      actionWidgetService,
      getOpenRepositoryAttempts: () => openRepositoryAttempts,
      setProviderAvailable: () => {
        providerAvailable = true;
        sessionTypesChanged.fire();
      }
    };
  }
  test("opens sorted local branches and persists the selected Worktree branch", async () => {
    const { container, model, actionWidgetService } = createItem();
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual(actionWidgetService.labels, ["feature/a", "feature/z", "main"]);
    actionWidgetService.select("feature/z");
    assert.deepStrictEqual({
      branch: model.persistedBranch,
      expanded: trigger.getAttribute("aria-expanded"),
      disabled: trigger.getAttribute("aria-disabled"),
      role: trigger.getAttribute("role"),
      hasPopup: trigger.getAttribute("aria-haspopup")
    }, {
      branch: "feature/z",
      expanded: "false",
      disabled: "false",
      role: "button",
      hasPopup: "listbox"
    });
  });
  test("keeps an edited branch that is no longer available locally", async () => {
    const { container, model, actionWidgetService } = createItem({
      state: createFormState({ branch: "feature/deleted" })
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual({
      label: trigger.querySelector(".automation-form-branch-name")?.textContent,
      persistedBranch: model.persistedBranch,
      pickerItems: actionWidgetService.labels,
      ariaLabels: actionWidgetService.ariaLabels
    }, {
      label: "feature/deleted",
      persistedBranch: "feature/deleted",
      pickerItems: ["feature/deleted", "feature/a", "feature/z", "main"],
      ariaLabels: ["feature/deleted, unavailable locally", "feature/a", "feature/z", "main"]
    });
  });
  test("keeps Folder branch status read-only", async () => {
    const { container, actionWidgetService } = createItem({
      state: createFormState({ isolationMode: "workspace", branch: "stale-head" })
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual({
      label: trigger.querySelector(".automation-form-branch-name")?.textContent,
      disabled: trigger.getAttribute("aria-disabled"),
      hasChevron: !!trigger.querySelector(".codicon-chevron-down"),
      pickerVisible: actionWidgetService.isVisible,
      role: trigger.getAttribute("role"),
      hasPopup: trigger.getAttribute("aria-haspopup"),
      tabIndex: trigger.tabIndex
    }, {
      label: "main",
      disabled: "true",
      hasChevron: false,
      pickerVisible: false,
      role: null,
      hasPopup: null,
      tabIndex: -1
    });
  });
  test("offers retry after a branch load failure", async () => {
    let attempts = 0;
    const { container, actionWidgetService } = createItem({
      getRefs: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("failed");
        }
        return [{ type: GitRefType.Head, name: "main" }];
      }
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual(actionWidgetService.labels, ["Retry Loading Branches"]);
    actionWidgetService.select("Retry Loading Branches");
    await timeout(0);
    trigger.click();
    assert.deepStrictEqual({
      attempts,
      labels: actionWidgetService.labels
    }, {
      attempts: 2,
      labels: ["main"]
    });
  });
  test("keeps the picker disabled while branches load and enables it when ready", async () => {
    const refs = new DeferredPromise();
    const { container, actionWidgetService } = createItem({
      getRefs: async () => refs.p
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual({
      disabled: trigger.getAttribute("aria-disabled"),
      pickerVisible: actionWidgetService.isVisible
    }, {
      disabled: "true",
      pickerVisible: false
    });
    await refs.complete([{ type: GitRefType.Head, name: "main" }]);
    await timeout(0);
    trigger.click();
    assert.deepStrictEqual({
      disabled: trigger.getAttribute("aria-disabled"),
      labels: actionWidgetService.labels
    }, {
      disabled: "false",
      labels: ["main"]
    });
  });
  test("explains that Worktree is unavailable while branches load", async () => {
    const refs = new DeferredPromise();
    const { container } = createItem({
      state: createFormState({ isolationMode: "workspace" }),
      getRefs: async () => refs.p
    });
    await timeout(0);
    const checkbox = container.querySelector(".sessions-chat-isolation-checkbox .monaco-checkbox");
    assert.ok(checkbox);
    assert.deepStrictEqual({
      checked: checkbox.getAttribute("aria-checked"),
      disabled: checkbox.getAttribute("aria-disabled")
    }, {
      checked: "false",
      disabled: "true"
    });
    await refs.complete([{ type: GitRefType.Head, name: "main" }]);
  });
  test("offers retry when opening the repository fails in Folder mode", async () => {
    const { container, actionWidgetService, getOpenRepositoryAttempts } = createItem({
      state: createFormState({ isolationMode: "workspace" }),
      failOpenRepositoryOnce: true
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    trigger.click();
    assert.deepStrictEqual(actionWidgetService.labels, ["Retry Loading Branches"]);
    actionWidgetService.select("Retry Loading Branches");
    await timeout(0);
    assert.deepStrictEqual({
      attempts: getOpenRepositoryAttempts(),
      label: trigger.querySelector(".automation-form-branch-name")?.textContent
    }, {
      attempts: 2,
      label: "main"
    });
  });
  test("resolves providerless session-type picks before gating Worktree configuration", async () => {
    const { container } = createItem({
      state: createFormState({ providerId: void 0 })
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    assert.deepStrictEqual({
      disabled: trigger.getAttribute("aria-disabled"),
      label: trigger.querySelector(".automation-form-branch-name")?.textContent
    }, {
      disabled: "false",
      label: "main"
    });
  });
  test("normalizes unsupported Worktree targets back to Folder mode", async () => {
    const { container, model } = createItem({
      state: createFormState({ sessionTypeId: "claude", branch: "feature/saved" })
    });
    await timeout(0);
    const checkbox = container.querySelector(".sessions-chat-isolation-checkbox .monaco-checkbox");
    assert.ok(checkbox);
    assert.deepStrictEqual({
      mode: model.isolationMode,
      branch: model.persistedBranch,
      checked: checkbox.getAttribute("aria-checked")
    }, {
      mode: "workspace",
      branch: void 0,
      checked: "false"
    });
  });
  test("enables Worktree branches for agent-host Copilot CLI", async () => {
    const { container } = createItem({
      state: createFormState({ providerId: "local-agent-host", sessionTypeId: "copilotcli" })
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    assert.deepStrictEqual({
      disabled: trigger.getAttribute("aria-disabled"),
      label: trigger.querySelector(".automation-form-branch-name")?.textContent
    }, {
      disabled: "false",
      label: "main"
    });
  });
  test("preserves Worktree intent while the provider is discovered late", async () => {
    const { container, model, setProviderAvailable } = createItem({
      state: createFormState({ branch: "feature/saved" }),
      providerInitiallyUnavailable: true
    });
    await timeout(0);
    const trigger = container.querySelector(".automation-form-branch-slot");
    assert.ok(trigger);
    assert.deepStrictEqual({
      mode: model.isolationMode,
      selectedBranch: model.selectedBranch,
      persistedBranch: model.persistedBranch,
      reason: trigger.getAttribute("aria-label")
    }, {
      mode: "worktree",
      selectedBranch: "feature/saved",
      persistedBranch: void 0,
      reason: "feature/saved. Session capabilities are loading."
    });
    setProviderAvailable();
    assert.deepStrictEqual({
      mode: model.isolationMode,
      persistedBranch: model.persistedBranch,
      disabled: trigger.getAttribute("aria-disabled")
    }, {
      mode: "worktree",
      persistedBranch: "feature/saved",
      disabled: "false"
    });
  });
  test("requires a branch before saving Worktree isolation", () => {
    const state = createFormState({ branch: void 0 });
    const validation = {
      nameError: void 0,
      promptError: void 0,
      folderError: void 0,
      sessionTypeError: void 0,
      branchError: void 0
    };
    const form = document.createElement("form");
    updateSaveButtonState(void 0, state, validation, form, () => "prompt", () => void 0);
    assert.strictEqual(validation.branchError, "A branch is required for Worktree isolation.");
    updateSaveButtonState(void 0, state, validation, form, () => "prompt", () => "main");
    assert.strictEqual(validation.branchError, void 0);
  });
  test("allows a workspace-less target without a folder and still requires a session type", () => {
    const state = createFormState({ isQuickChat: true, folderUri: void 0, isolationMode: void 0, branch: void 0 });
    const validation = {
      nameError: void 0,
      promptError: void 0,
      folderError: void 0,
      sessionTypeError: void 0,
      branchError: void 0
    };
    const form = document.createElement("form");
    updateSaveButtonState(void 0, state, validation, form, () => "prompt", () => void 0);
    const validTarget = { ...validation };
    state.providerId = void 0;
    state.sessionTypeId = void 0;
    updateSaveButtonState(void 0, state, validation, form, () => "prompt", () => void 0);
    assert.deepStrictEqual({
      validTarget,
      missingTarget: validation
    }, {
      validTarget: {
        nameError: void 0,
        promptError: void 0,
        folderError: void 0,
        sessionTypeError: void 0,
        branchError: void 0
      },
      missingTarget: {
        nameError: void 0,
        promptError: void 0,
        folderError: void 0,
        sessionTypeError: "Session type is required.",
        branchError: void 0
      }
    });
  });
  test("allows workspace-backed legacy targets without a provider id", () => {
    const state = createFormState({ providerId: void 0, isolationMode: "workspace" });
    const validation = {
      nameError: void 0,
      promptError: void 0,
      folderError: void 0,
      sessionTypeError: void 0,
      branchError: void 0
    };
    updateSaveButtonState(void 0, state, validation, document.createElement("form"), () => "prompt", () => void 0);
    assert.deepStrictEqual(validation, {
      nameError: void 0,
      promptError: void 0,
      folderError: void 0,
      sessionTypeError: void 0,
      branchError: void 0
    });
  });
  test("hides repository controls for workspace-less targets", async () => {
    const state = createFormState({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: "worktree",
      branch: "feature/stale"
    });
    const { container, model } = createItem({ state, visible: false });
    await timeout(0);
    assert.deepStrictEqual({
      display: container.style.display,
      ariaHidden: container.getAttribute("aria-hidden"),
      folderUri: model.folderUri,
      isolationMode: state.isolationMode,
      branch: model.persistedBranch
    }, {
      display: "none",
      ariaHidden: "true",
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
  });
  test("reloads repository state when returning to workspace mode", async () => {
    const state = createFormState({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    const { container, model, getOpenRepositoryAttempts } = createItem({ state, visible: true });
    await timeout(0);
    assert.strictEqual(getOpenRepositoryAttempts(), 0);
    model.setQuickChat(false, FOLDER);
    await timeout(0);
    assert.deepStrictEqual({
      attempts: getOpenRepositoryAttempts(),
      folderUri: model.folderUri?.toString(),
      branch: container.querySelector(".automation-form-branch-name")?.textContent,
      supportsWorktreeConfiguration: model.supportsWorktreeConfiguration
    }, {
      attempts: 1,
      folderUri: FOLDER.toString(),
      branch: "main",
      supportsWorktreeConfiguration: true
    });
  });
  test("allows focus in mobile picker sheets", () => {
    const sheet = document.createElement("div");
    sheet.classList.add("mobile-picker-sheet");
    const item = sheet.appendChild(document.createElement("button"));
    assert.strictEqual(isAutomationDialogPopupTarget(item), true);
  });
  test("resolves a legacy model identifier to the selected concrete target", () => {
    const legacyIdentifier = "copilotcli/gpt-5.6-sol";
    const concreteIdentifier = "agent-host-copilotcli:gpt-5.6-sol";
    const unrelatedIdentifier = "other/gpt-5.6-sol";
    const modelIds = [legacyIdentifier, unrelatedIdentifier];
    const models = /* @__PURE__ */ new Map([
      [legacyIdentifier, upcastPartial({ id: "gpt-5.6-sol", targetChatSessionType: "copilotcli" })],
      [concreteIdentifier, upcastPartial({ id: "gpt-5.6-sol", targetChatSessionType: "agent-host-copilotcli" })],
      [unrelatedIdentifier, upcastPartial({ id: "gpt-5.6-sol", targetChatSessionType: "other" })]
    ]);
    const languageModelsService = upcastPartial({
      getLanguageModelIds: () => modelIds,
      lookupLanguageModel: (identifier) => models.get(identifier)
    });
    const beforeConcreteTargetArrives = resolveAutomationModelIdentifier(languageModelsService, legacyIdentifier, "copilotcli", "agent-host-copilotcli");
    modelIds.push(concreteIdentifier);
    assert.deepStrictEqual({
      beforeConcreteTargetArrives,
      afterConcreteTargetArrives: resolveAutomationModelIdentifier(languageModelsService, legacyIdentifier, "copilotcli", "agent-host-copilotcli"),
      alreadyConcrete: resolveAutomationModelIdentifier(languageModelsService, concreteIdentifier, "copilotcli", "agent-host-copilotcli"),
      unrelated: resolveAutomationModelIdentifier(languageModelsService, unrelatedIdentifier, "copilotcli", "agent-host-copilotcli")
    }, {
      beforeConcreteTargetArrives: legacyIdentifier,
      afterConcreteTargetArrives: concreteIdentifier,
      alreadyConcrete: concreteIdentifier,
      unrelated: unrelatedIdentifier
    });
  });
});
suite("Automation dialog keyboard navigation", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("allows undo and redo only for editable controls", () => {
    const prompt = document.createElement("textarea");
    const button = document.createElement("button");
    assert.deepStrictEqual({
      undoPromptPrevented: dispatchAutomationDialogCommand(prompt, "undo").defaultPrevented,
      redoPromptPrevented: dispatchAutomationDialogCommand(prompt, "redo").defaultPrevented,
      undoButtonPrevented: dispatchAutomationDialogCommand(button, "undo").defaultPrevented,
      unrelatedPromptPrevented: dispatchAutomationDialogCommand(prompt, "workbench.action.files.save").defaultPrevented
    }, {
      undoPromptPrevented: false,
      redoPromptPrevented: false,
      undoButtonPrevented: true,
      unrelatedPromptPrevented: true
    });
  });
  test("cycles through visible dialog controls", () => {
    const container = document.createElement("div");
    document.body.append(container);
    disposables.add({ dispose: () => container.remove() });
    const targetWindow = DOM.getWindow(container);
    const first = container.appendChild(document.createElement("input"));
    const hiddenContainer = container.appendChild(document.createElement("div"));
    hiddenContainer.style.display = "none";
    const hidden = hiddenContainer.appendChild(document.createElement("input"));
    const wrapper = container.appendChild(document.createElement("div"));
    wrapper.tabIndex = 0;
    const second = wrapper.appendChild(document.createElement("button"));
    const third = container.appendChild(document.createElement("button"));
    const navigation = disposables.add(registerAutomationDialogKeyboardNavigation(
      targetWindow,
      () => [first, hidden, wrapper, second, third],
      () => false
    ));
    let downstreamKeyDowns = 0;
    disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, () => downstreamKeyDowns++, true));
    navigation.focusFirst();
    dispatchKey(first, "keydown", "Tab");
    second.focus();
    dispatchKey(second, "keydown", "Tab");
    assert.deepStrictEqual({
      activeElement: document.activeElement,
      downstreamKeyDowns
    }, {
      activeElement: third,
      downstreamKeyDowns: 0
    });
  });
  test("leaves popup keydown handling active and suppresses its Escape keyup", () => {
    const container = document.createElement("div");
    document.body.append(container);
    disposables.add({ dispose: () => container.remove() });
    const targetWindow = DOM.getWindow(container);
    const trigger = container.appendChild(document.createElement("button"));
    const popup = container.appendChild(document.createElement("div"));
    const popupInput = popup.appendChild(document.createElement("input"));
    disposables.add(registerAutomationDialogKeyboardNavigation(
      targetWindow,
      () => [trigger],
      (target) => popup.contains(target)
    ));
    let downstreamKeyDowns = 0;
    let downstreamKeyUps = 0;
    disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_DOWN, () => downstreamKeyDowns++, true));
    disposables.add(DOM.addDisposableListener(targetWindow, DOM.EventType.KEY_UP, () => downstreamKeyUps++, true));
    popupInput.focus();
    dispatchKey(popupInput, "keydown", "Escape");
    trigger.focus();
    dispatchKey(trigger, "keyup", "Escape");
    dispatchKey(trigger, "keydown", "Escape");
    dispatchKey(trigger, "keyup", "Escape");
    assert.deepStrictEqual({
      downstreamKeyDowns,
      downstreamKeyUps
    }, {
      downstreamKeyDowns: 2,
      downstreamKeyUps: 1
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYXV0b21hdGlvbnNcXHRlc3RcXGJyb3dzZXJcXGF1dG9tYXRpb25EaWFsb2cudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jaywgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSwgSUFjdGlvbkxpc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFJlc3VsdEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBSZXNvdXJjZVRydXN0UmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9kaWFsb2dzL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IEdpdFJlZlR5cGUsIElHaXRSZXBvc2l0b3J5LCBJR2l0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2dpdC9jb21tb24vZ2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIElTZXNzaW9uV29ya3NwYWNlLCBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uSXNvbGF0aW9uR3JvdXBBY3Rpb25WaWV3SXRlbSwgQXV0b21hdGlvblNlc3Npb25EcmFmdFN5bmNocm9uaXplciwgY2FuU2VsZWN0QXV0b21hdGlvbldvcmtzcGFjZSwgSUZvcm1TdGF0ZSwgSVZhbGlkYXRpb25TdGF0ZSwgaXNBdXRvbWF0aW9uRGlhbG9nRWRpdENvbW1hbmQsIGlzQXV0b21hdGlvbkRpYWxvZ1BvcHVwVGFyZ2V0LCByZWdpc3RlckF1dG9tYXRpb25EaWFsb2dLZXlib2FyZE5hdmlnYXRpb24sIHJlc29sdmVBdXRvbWF0aW9uTW9kZWxJZGVudGlmaWVyLCB1cGRhdGVTYXZlQnV0dG9uU3RhdGUgfSBmcm9tICcuLi8uLi9icm93c2VyL2F1dG9tYXRpb25EaWFsb2cuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbklzb2xhdGlvbk1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2lzb2xhdGlvbkdyb3VwTW9kZWwuanMnO1xuXG5jb25zdCBGT0xERVIgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXG5mdW5jdGlvbiBkaXNwYXRjaEtleSh0YXJnZXQ6IEhUTUxFbGVtZW50LCB0eXBlOiAna2V5ZG93bicgfCAna2V5dXAnLCBrZXk6IHN0cmluZywgc2hpZnRLZXkgPSBmYWxzZSk6IEtleWJvYXJkRXZlbnQge1xuXHRjb25zdCBldmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KHR5cGUsIHsga2V5LCBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlLCBzaGlmdEtleSB9KTtcblx0dGFyZ2V0LmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuXHRyZXR1cm4gZXZlbnQ7XG59XG5cbmZ1bmN0aW9uIGRpc3BhdGNoQXV0b21hdGlvbkRpYWxvZ0NvbW1hbmQodGFyZ2V0OiBIVE1MRWxlbWVudCwgY29tbWFuZElkOiBzdHJpbmcpOiBLZXlib2FyZEV2ZW50IHtcblx0Y29uc3Qgb3B0aW9ucyA9IGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMoXG5cdFx0e30sXG5cdFx0dXBjYXN0UGFydGlhbDxJS2V5YmluZGluZ1NlcnZpY2U+KHtcblx0XHRcdHNvZnREaXNwYXRjaDogKCkgPT4gKHsga2luZDogUmVzdWx0S2luZC5LYkZvdW5kLCBjb21tYW5kSWQsIGNvbW1hbmRBcmdzOiB1bmRlZmluZWQsIGlzQnViYmxlOiBmYWxzZSB9KSxcblx0XHR9KSxcblx0XHR1cGNhc3RQYXJ0aWFsPElMYXlvdXRTZXJ2aWNlPih7IGFjdGl2ZUNvbnRhaW5lcjogZG9jdW1lbnQuYm9keSB9KSxcblx0XHR1cGNhc3RQYXJ0aWFsPElIb3N0U2VydmljZT4oe30pLFxuXHRcdG5ldyBTZXQoKSxcblx0XHQoaWQsIGV2ZW50KSA9PiBpc0F1dG9tYXRpb25EaWFsb2dFZGl0Q29tbWFuZChpZCwgZXZlbnQudGFyZ2V0KSxcblx0KTtcblx0dGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBldmVudCA9PiBvcHRpb25zLmtleUV2ZW50UHJvY2Vzc29yPy4obmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChldmVudCkpLCB7IG9uY2U6IHRydWUgfSk7XG5cdHJldHVybiBkaXNwYXRjaEtleSh0YXJnZXQsICdrZXlkb3duJywgJ3onKTtcbn1cblxuY2xhc3MgUmVjb3JkaW5nQWN0aW9uV2lkZ2V0U2VydmljZSBleHRlbmRzIG1vY2s8SUFjdGlvbldpZGdldFNlcnZpY2U+KCkge1xuXHRvdmVycmlkZSBpc1Zpc2libGUgPSBmYWxzZTtcblx0bGFiZWxzOiByZWFkb25seSBzdHJpbmdbXSA9IFtdO1xuXHRkZXRhaWxzOiBSZWFkb25seUFycmF5PElBY3Rpb25MaXN0SXRlbTx1bmtub3duPlsnZGV0YWlsJ10+ID0gW107XG5cdGFyaWFMYWJlbHM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgc2VsZWN0SXRlbTogKChsYWJlbDogc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBoaWRlV2lkZ2V0OiAoKGRpZENhbmNlbD86IGJvb2xlYW4pID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIHNob3c8VD4oXG5cdFx0X3VzZXI6IHN0cmluZyxcblx0XHRfc3VwcG9ydHNQcmV2aWV3OiBib29sZWFuLFxuXHRcdGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSxcblx0XHRkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxUPixcblx0XHRfYW5jaG9yOiBIVE1MRWxlbWVudCB8IFN0YW5kYXJkTW91c2VFdmVudCB8IElBbmNob3IsXG5cdFx0X2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0X2FjdGlvbkJhckFjdGlvbnM6IHJlYWRvbmx5IElBY3Rpb25bXSxcblx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/OiBQYXJ0aWFsPElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElBY3Rpb25MaXN0SXRlbTxUPj4+LFxuXHRcdF9saXN0T3B0aW9ucz86IElBY3Rpb25MaXN0T3B0aW9ucyxcblx0KTogdm9pZCB7XG5cdFx0dGhpcy5pc1Zpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMubGFiZWxzID0gaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5sYWJlbCA/PyAnJyk7XG5cdFx0dGhpcy5kZXRhaWxzID0gaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5kZXRhaWwpO1xuXHRcdHRoaXMuYXJpYUxhYmVscyA9IGl0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRcdGNvbnN0IGxhYmVsID0gYWNjZXNzaWJpbGl0eVByb3ZpZGVyPy5nZXRBcmlhTGFiZWw/LihpdGVtKTtcblx0XHRcdHJldHVybiB0eXBlb2YgbGFiZWwgPT09ICdzdHJpbmcnID8gbGFiZWwgOiBsYWJlbD8uZ2V0KCkgPz8gJyc7XG5cdFx0fSk7XG5cdFx0dGhpcy5zZWxlY3RJdGVtID0gbGFiZWwgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGl0ZW1zLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5sYWJlbCA9PT0gbGFiZWwpPy5pdGVtO1xuXHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0ZGVsZWdhdGUub25TZWxlY3QoaXRlbSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLmhpZGVXaWRnZXQgPSBkZWxlZ2F0ZS5vbkhpZGU7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVJdGVtczxUPihpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPFQ+W10sIF9mb2N1c0l0ZW1JZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubGFiZWxzID0gaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5sYWJlbCA/PyAnJyk7XG5cdH1cblx0b3ZlcnJpZGUgZm9jdXNJdGVtQnlJZChfaXRlbUlkOiBzdHJpbmcpOiB2b2lkIHsgfVxuXG5cdG92ZXJyaWRlIGhpZGUoZGlkQ2FuY2VsPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5pc1Zpc2libGUgPSBmYWxzZTtcblx0XHRjb25zdCBvbkhpZGUgPSB0aGlzLmhpZGVXaWRnZXQ7XG5cdFx0dGhpcy5oaWRlV2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdG9uSGlkZT8uKGRpZENhbmNlbCk7XG5cdH1cblxuXHRzZWxlY3QobGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc2VsZWN0SXRlbT8uKGxhYmVsKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVGb3JtU3RhdGUob3ZlcnJpZGVzPzogUGFydGlhbDxJRm9ybVN0YXRlPik6IElGb3JtU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdG5hbWU6ICdBdXRvbWF0aW9uJyxcblx0XHRpbnRlcnZhbDogJ2RhaWx5Jyxcblx0XHRob3VyOiA5LFxuXHRcdG1pbnV0ZTogMCxcblx0XHRkYXk6IDEsXG5cdFx0aXNRdWlja0NoYXQ6IGZhbHNlLFxuXHRcdGZvbGRlclVyaTogRk9MREVSLFxuXHRcdHByb3ZpZGVySWQ6ICdkZWZhdWx0LWNvcGlsb3QnLFxuXHRcdHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyxcblx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3RyZWUnLFxuXHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVXb3Jrc3BhY2UocmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogYm9vbGVhbik6IElTZXNzaW9uV29ya3NwYWNlIHtcblx0cmV0dXJuIHtcblx0XHR1cmk6IEZPTERFUixcblx0XHRsYWJlbDogJ1dvcmtzcGFjZScsXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0Zm9sZGVyczogW3sgcm9vdDogRk9MREVSLCB3b3JraW5nRGlyZWN0b3J5OiBGT0xERVIsIG5hbWU6ICdXb3Jrc3BhY2UnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH1dLFxuXHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3QsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQXV0b21hdGlvbkRyYWZ0U2VydmljZSgpIHtcblx0Y29uc3QgYXV0b21hdGlvblNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhdXRvbWF0aW9uU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdGNvbnN0IGNyZWF0ZWQ6IEFycmF5PHsga2luZDogJ3dvcmtzcGFjZScgfCAncXVpY2tDaGF0JzsgcHJvdmlkZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkOyBzZXNzaW9uVHlwZUlkOiBzdHJpbmc7IGZvbGRlclVyaT86IHN0cmluZyB9PiA9IFtdO1xuXHRjb25zdCBkaXNjYXJkZWQ6IHN0cmluZ1tdID0gW107XG5cdGxldCBuZXh0SWQgPSAxO1xuXHRjb25zdCBjcmVhdGVEcmFmdCA9IChraW5kOiAnd29ya3NwYWNlJyB8ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHNlc3Npb25UeXBlSWQ6IHN0cmluZywgZm9sZGVyVXJpPzogVVJJKTogSVNlc3Npb24gPT4ge1xuXHRcdGNvbnN0IHByZXZpb3VzID0gYXV0b21hdGlvblNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHRkaXNjYXJkZWQucHVzaChwcmV2aW91cy5zZXNzaW9uSWQpO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdXBjYXN0UGFydGlhbDxJU2Vzc2lvbj4oe1xuXHRcdFx0c2Vzc2lvbklkOiBgYXV0b21hdGlvbi0ke25leHRJZCsrfWAsXG5cdFx0XHRwcm92aWRlcklkOiBwcm92aWRlcklkID8/ICdyZXNvbHZlZC1wcm92aWRlcicsXG5cdFx0XHRzZXNzaW9uVHlwZTogc2Vzc2lvblR5cGVJZCxcblx0XHR9KTtcblx0XHRjcmVhdGVkLnB1c2goeyBraW5kLCBwcm92aWRlcklkLCBzZXNzaW9uVHlwZUlkLCBmb2xkZXJVcmk6IGZvbGRlclVyaT8udG9TdHJpbmcoKSB9KTtcblx0XHRhdXRvbWF0aW9uU2Vzc2lvbi5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fTtcblx0Y29uc3Qgc2VydmljZSA9IHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KHtcblx0XHRhdXRvbWF0aW9uU2Vzc2lvbixcblx0XHRjcmVhdGVBdXRvbWF0aW9uU2Vzc2lvbjogKGZvbGRlclVyaSwgb3B0aW9ucykgPT4gY3JlYXRlRHJhZnQoJ3dvcmtzcGFjZScsIG9wdGlvbnM/LnByb3ZpZGVySWQsIG9wdGlvbnM/LnNlc3Npb25UeXBlSWQgPz8gJ2RlZmF1bHQnLCBmb2xkZXJVcmkpLFxuXHRcdGNyZWF0ZUF1dG9tYXRpb25RdWlja0NoYXQ6IG9wdGlvbnMgPT4gY3JlYXRlRHJhZnQoJ3F1aWNrQ2hhdCcsIG9wdGlvbnM/LnByb3ZpZGVySWQsIG9wdGlvbnM/LnNlc3Npb25UeXBlSWQgPz8gJ2RlZmF1bHQnKSxcblx0XHRkaXNjYXJkQXV0b21hdGlvblNlc3Npb246IHNlc3Npb24gPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGF1dG9tYXRpb25TZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKCFjdXJyZW50IHx8IChzZXNzaW9uICYmIHNlc3Npb24uc2Vzc2lvbklkICE9PSBjdXJyZW50LnNlc3Npb25JZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZGlzY2FyZGVkLnB1c2goY3VycmVudC5zZXNzaW9uSWQpO1xuXHRcdFx0YXV0b21hdGlvblNlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9LFxuXHR9KTtcblx0cmV0dXJuIHsgc2VydmljZSwgY3JlYXRlZCwgZGlzY2FyZGVkIH07XG59XG5cbnN1aXRlKCdBdXRvbWF0aW9uIHNlc3Npb24gZHJhZnQgc3luY2hyb25pemF0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3RyYWNrcyB0YXJnZXQgY2hhbmdlcyB3aXRob3V0IHJlY3JlYXRpbmcgYW4gZXF1YWwgd29ya3NwYWNlIHRhcmdldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGNyZWF0ZWQsIGRpc2NhcmRlZCB9ID0gY3JlYXRlQXV0b21hdGlvbkRyYWZ0U2VydmljZSgpO1xuXHRcdGxldCBlcnJvckNvdW50ID0gMDtcblx0XHRjb25zdCBzeW5jaHJvbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEF1dG9tYXRpb25TZXNzaW9uRHJhZnRTeW5jaHJvbml6ZXIoc2VydmljZSwgYXN5bmMgKCkgPT4gdHJ1ZSwgKCkgPT4gZXJyb3JDb3VudCsrKSk7XG5cblx0XHRzeW5jaHJvbml6ZXIudXBkYXRlKHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpLCBwcm92aWRlcklkOiAncHJvdmlkZXItYScsIHNlc3Npb25UeXBlSWQ6ICd0eXBlLWEnIH0pO1xuXHRcdGF3YWl0IHN5bmNocm9uaXplci53YWl0Rm9yU3luYygpO1xuXHRcdHN5bmNocm9uaXplci51cGRhdGUoeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlJyksIHByb3ZpZGVySWQ6ICdwcm92aWRlci1hJywgc2Vzc2lvblR5cGVJZDogJ3R5cGUtYScgfSk7XG5cdFx0YXdhaXQgc3luY2hyb25pemVyLndhaXRGb3JTeW5jKCk7XG5cdFx0c2VydmljZS5kaXNjYXJkQXV0b21hdGlvblNlc3Npb24oKTtcblx0XHRzeW5jaHJvbml6ZXIudXBkYXRlKHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpLCBwcm92aWRlcklkOiAncHJvdmlkZXItYScsIHNlc3Npb25UeXBlSWQ6ICd0eXBlLWEnIH0pO1xuXHRcdGF3YWl0IHN5bmNocm9uaXplci53YWl0Rm9yU3luYygpO1xuXHRcdHN5bmNocm9uaXplci51cGRhdGUoeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlJyksIHByb3ZpZGVySWQ6ICdwcm92aWRlci1iJywgc2Vzc2lvblR5cGVJZDogJ3R5cGUtYicgfSk7XG5cdFx0YXdhaXQgc3luY2hyb25pemVyLndhaXRGb3JTeW5jKCk7XG5cdFx0c3luY2hyb25pemVyLnVwZGF0ZSh7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiAncHJvdmlkZXItYicsIHNlc3Npb25UeXBlSWQ6ICd0eXBlLWInIH0pO1xuXHRcdGF3YWl0IHN5bmNocm9uaXplci53YWl0Rm9yU3luYygpO1xuXHRcdHN5bmNocm9uaXplci51cGRhdGUodW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzeW5jaHJvbml6ZXIud2FpdEZvclN5bmMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlZCxcblx0XHRcdGRpc2NhcmRlZCxcblx0XHRcdGN1cnJlbnRTZXNzaW9uOiBzZXJ2aWNlLmF1dG9tYXRpb25TZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsXG5cdFx0XHRlcnJvckNvdW50LFxuXHRcdH0sIHtcblx0XHRcdGNyZWF0ZWQ6IFtcblx0XHRcdFx0eyBraW5kOiAnd29ya3NwYWNlJywgcHJvdmlkZXJJZDogJ3Byb3ZpZGVyLWEnLCBzZXNzaW9uVHlwZUlkOiAndHlwZS1hJywgZm9sZGVyVXJpOiAnZmlsZTovLy93b3Jrc3BhY2UnIH0sXG5cdFx0XHRcdHsga2luZDogJ3dvcmtzcGFjZScsIHByb3ZpZGVySWQ6ICdwcm92aWRlci1hJywgc2Vzc2lvblR5cGVJZDogJ3R5cGUtYScsIGZvbGRlclVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGtpbmQ6ICd3b3Jrc3BhY2UnLCBwcm92aWRlcklkOiAncHJvdmlkZXItYicsIHNlc3Npb25UeXBlSWQ6ICd0eXBlLWInLCBmb2xkZXJVcmk6ICdmaWxlOi8vL3dvcmtzcGFjZScgfSxcblx0XHRcdFx0eyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogJ3Byb3ZpZGVyLWInLCBzZXNzaW9uVHlwZUlkOiAndHlwZS1iJywgZm9sZGVyVXJpOiB1bmRlZmluZWQgfSxcblx0XHRcdF0sXG5cdFx0XHRkaXNjYXJkZWQ6IFsnYXV0b21hdGlvbi0xJywgJ2F1dG9tYXRpb24tMicsICdhdXRvbWF0aW9uLTMnLCAnYXV0b21hdGlvbi00J10sXG5cdFx0XHRjdXJyZW50U2Vzc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0ZXJyb3JDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBzdGFsZSB3b3Jrc3BhY2UgdmFsaWRhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGNyZWF0ZWQgfSA9IGNyZWF0ZUF1dG9tYXRpb25EcmFmdFNlcnZpY2UoKTtcblx0XHRjb25zdCBmaXJzdFdvcmtzcGFjZVZhbGlkYXRpb24gPSBuZXcgRGVmZXJyZWRQcm9taXNlPGJvb2xlYW4+KCk7XG5cdFx0Y29uc3Qgc3luY2hyb25pemVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBdXRvbWF0aW9uU2Vzc2lvbkRyYWZ0U3luY2hyb25pemVyKFxuXHRcdFx0c2VydmljZSxcblx0XHRcdGZvbGRlclVyaSA9PiBmb2xkZXJVcmkucGF0aCA9PT0gJy9maXJzdCcgPyBmaXJzdFdvcmtzcGFjZVZhbGlkYXRpb24ucCA6IFByb21pc2UucmVzb2x2ZSh0cnVlKSxcblx0XHRcdCgpID0+IHsgfSxcblx0XHQpKTtcblxuXHRcdHN5bmNocm9uaXplci51cGRhdGUoeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vZmlyc3QnKSwgcHJvdmlkZXJJZDogJ3Byb3ZpZGVyJywgc2Vzc2lvblR5cGVJZDogJ3R5cGUnIH0pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdHN5bmNocm9uaXplci51cGRhdGUoeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vc2Vjb25kJyksIHByb3ZpZGVySWQ6ICdwcm92aWRlcicsIHNlc3Npb25UeXBlSWQ6ICd0eXBlJyB9KTtcblx0XHRhd2FpdCBzeW5jaHJvbml6ZXIud2FpdEZvclN5bmMoKTtcblx0XHRmaXJzdFdvcmtzcGFjZVZhbGlkYXRpb24uY29tcGxldGUodHJ1ZSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNyZWF0ZWQsIFtcblx0XHRcdHsga2luZDogJ3dvcmtzcGFjZScsIHByb3ZpZGVySWQ6ICdwcm92aWRlcicsIHNlc3Npb25UeXBlSWQ6ICd0eXBlJywgZm9sZGVyVXJpOiAnZmlsZTovLy9zZWNvbmQnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1cmZhY2VzIHdvcmtzcGFjZSB2YWxpZGF0aW9uIGZhaWx1cmVzIHdpdGhvdXQgY3JlYXRpbmcgYSBkcmFmdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGNyZWF0ZWQgfSA9IGNyZWF0ZUF1dG9tYXRpb25EcmFmdFNlcnZpY2UoKTtcblx0XHRsZXQgZXJyb3JDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc3luY2hyb25pemVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBdXRvbWF0aW9uU2Vzc2lvbkRyYWZ0U3luY2hyb25pemVyKFxuXHRcdFx0c2VydmljZSxcblx0XHRcdCgpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcigndmFsaWRhdGlvbiBmYWlsZWQnKSksXG5cdFx0XHQoKSA9PiBlcnJvckNvdW50KyssXG5cdFx0KSk7XG5cblx0XHRzeW5jaHJvbml6ZXIudXBkYXRlKHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpLCBwcm92aWRlcklkOiAncHJvdmlkZXInLCBzZXNzaW9uVHlwZUlkOiAndHlwZScgfSk7XG5cdFx0YXdhaXQgc3luY2hyb25pemVyLndhaXRGb3JTeW5jKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZWQsXG5cdFx0XHRjdXJyZW50U2Vzc2lvbjogc2VydmljZS5hdXRvbWF0aW9uU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLFxuXHRcdFx0ZXJyb3JDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkOiBbXSxcblx0XHRcdGN1cnJlbnRTZXNzaW9uOiB1bmRlZmluZWQsXG5cdFx0XHRlcnJvckNvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRyaWVzIGFuIHVuY2hhbmdlZCB0YXJnZXQgYWZ0ZXIgZHJhZnQgY3JlYXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhdXRvbWF0aW9uU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0bGV0IGNyZWF0ZUNvdW50ID0gMDtcblx0XHRsZXQgZXJyb3JDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KHtcblx0XHRcdGF1dG9tYXRpb25TZXNzaW9uLFxuXHRcdFx0Y3JlYXRlQXV0b21hdGlvblNlc3Npb246IChfZm9sZGVyVXJpLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChjcmVhdGVDb3VudCsrID09PSAwKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdwcm92aWRlciB1bmF2YWlsYWJsZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uPih7XG5cdFx0XHRcdFx0c2Vzc2lvbklkOiAnYXV0b21hdGlvbi1yZXRyeScsXG5cdFx0XHRcdFx0cHJvdmlkZXJJZDogb3B0aW9ucz8ucHJvdmlkZXJJZCA/PyAncHJvdmlkZXInLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlOiBvcHRpb25zPy5zZXNzaW9uVHlwZUlkID8/ICd0eXBlJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF1dG9tYXRpb25TZXNzaW9uLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH0sXG5cdFx0XHRkaXNjYXJkQXV0b21hdGlvblNlc3Npb246ICgpID0+IGF1dG9tYXRpb25TZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCksXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3luY2hyb25pemVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBdXRvbWF0aW9uU2Vzc2lvbkRyYWZ0U3luY2hyb25pemVyKHNlcnZpY2UsIGFzeW5jICgpID0+IHRydWUsICgpID0+IGVycm9yQ291bnQrKykpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpLCBwcm92aWRlcklkOiAncHJvdmlkZXInLCBzZXNzaW9uVHlwZUlkOiAndHlwZScgfSBhcyBjb25zdDtcblxuXHRcdHN5bmNocm9uaXplci51cGRhdGUodGFyZ2V0KTtcblx0XHRhd2FpdCBzeW5jaHJvbml6ZXIud2FpdEZvclN5bmMoKTtcblx0XHRzeW5jaHJvbml6ZXIudXBkYXRlKHRhcmdldCk7XG5cdFx0YXdhaXQgc3luY2hyb25pemVyLndhaXRGb3JTeW5jKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZUNvdW50LFxuXHRcdFx0ZXJyb3JDb3VudCxcblx0XHRcdHNlc3Npb25JZDogYXV0b21hdGlvblNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVDb3VudDogMixcblx0XHRcdGVycm9yQ291bnQ6IDEsXG5cdFx0XHRzZXNzaW9uSWQ6ICdhdXRvbWF0aW9uLXJldHJ5Jyxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0F1dG9tYXRpb24gd29ya3NwYWNlIHRydXN0JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZWplY3RzIGFuIHVucmVzb2x2ZWQgd29ya3NwYWNlIHVzaW5nIHRoZSBwcmVmZXJyZWQgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb2x2ZVJlcXVlc3RzOiBBcnJheTx7IGZvbGRlclVyaTogc3RyaW5nOyBwcmVmZXJyZWRQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQgfT4gPSBbXTtcblx0XHRjb25zdCB0cnVzdFJlcXVlc3RzOiBSZXNvdXJjZVRydXN0UmVxdWVzdE9wdGlvbnNbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNhblNlbGVjdEF1dG9tYXRpb25Xb3Jrc3BhY2UoXG5cdFx0XHRGT0xERVIsXG5cdFx0XHQncHJlZmVycmVkJyxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KHtcblx0XHRcdFx0cmVzb2x2ZVdvcmtzcGFjZTogKGZvbGRlclVyaSwgcHJlZmVycmVkUHJvdmlkZXJJZCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmVSZXF1ZXN0cy5wdXNoKHsgZm9sZGVyVXJpOiBmb2xkZXJVcmkudG9TdHJpbmcoKSwgcHJlZmVycmVkUHJvdmlkZXJJZCB9KTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHR1cGNhc3RQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlPih7XG5cdFx0XHRcdHJlcXVlc3RSZXNvdXJjZXNUcnVzdDogYXN5bmMgb3B0aW9ucyA9PiB7XG5cdFx0XHRcdFx0dHJ1c3RSZXF1ZXN0cy5wdXNoKG9wdGlvbnMpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0LFxuXHRcdFx0cmVzb2x2ZVJlcXVlc3RzLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0Q291bnQ6IHRydXN0UmVxdWVzdHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogZmFsc2UsXG5cdFx0XHRyZXNvbHZlUmVxdWVzdHM6IFt7IGZvbGRlclVyaTogRk9MREVSLnRvU3RyaW5nKCksIHByZWZlcnJlZFByb3ZpZGVySWQ6ICdwcmVmZXJyZWQnIH1dLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0Q291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2VwdHMgYSB3b3Jrc3BhY2UgdGhhdCBkb2VzIG5vdCByZXF1aXJlIHRydXN0IHdpdGhvdXQgcHJvbXB0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRydXN0UmVxdWVzdHM6IFJlc291cmNlVHJ1c3RSZXF1ZXN0T3B0aW9uc1tdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2FuU2VsZWN0QXV0b21hdGlvbldvcmtzcGFjZShcblx0XHRcdEZPTERFUixcblx0XHRcdCdwcmVmZXJyZWQnLFxuXHRcdFx0dXBjYXN0UGFydGlhbDxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oe1xuXHRcdFx0XHRyZXNvbHZlV29ya3NwYWNlOiAoKSA9PiAoeyBwcm92aWRlcklkOiAncHJlZmVycmVkJywgd29ya3NwYWNlOiBjcmVhdGVXb3Jrc3BhY2UoZmFsc2UpIH0pLFxuXHRcdFx0fSksXG5cdFx0XHR1cGNhc3RQYXJ0aWFsPElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlPih7XG5cdFx0XHRcdHJlcXVlc3RSZXNvdXJjZXNUcnVzdDogYXN5bmMgb3B0aW9ucyA9PiB7XG5cdFx0XHRcdFx0dHJ1c3RSZXF1ZXN0cy5wdXNoKG9wdGlvbnMpO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdCxcblx0XHRcdHRydXN0UmVxdWVzdENvdW50OiB0cnVzdFJlcXVlc3RzLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHRydWUsXG5cdFx0XHR0cnVzdFJlcXVlc3RDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0Zm9yIChjb25zdCB0cnVzdFJlc3VsdCBvZiBbdHJ1ZSwgZmFsc2UsIHVuZGVmaW5lZF0pIHtcblx0XHR0ZXN0KGByZXR1cm5zICR7dHJ1c3RSZXN1bHQgPT09IHRydWUgPyAndHJ1ZSB3aGVuIHRydXN0IGlzIGdyYW50ZWQnIDogJ2ZhbHNlIHdoZW4gdHJ1c3QgaXMgJyArICh0cnVzdFJlc3VsdCA9PT0gZmFsc2UgPyAnZGVjbGluZWQnIDogJ2NhbmNlbGxlZCcpfWAsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRydXN0UmVxdWVzdHM6IFJlc291cmNlVHJ1c3RSZXF1ZXN0T3B0aW9uc1tdID0gW107XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjYW5TZWxlY3RBdXRvbWF0aW9uV29ya3NwYWNlKFxuXHRcdFx0XHRGT0xERVIsXG5cdFx0XHRcdCdwcmVmZXJyZWQnLFxuXHRcdFx0XHR1cGNhc3RQYXJ0aWFsPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPih7XG5cdFx0XHRcdFx0cmVzb2x2ZVdvcmtzcGFjZTogKCkgPT4gKHsgcHJvdmlkZXJJZDogJ3ByZWZlcnJlZCcsIHdvcmtzcGFjZTogY3JlYXRlV29ya3NwYWNlKHRydWUpIH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0dXBjYXN0UGFydGlhbDxJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZT4oe1xuXHRcdFx0XHRcdHJlcXVlc3RSZXNvdXJjZXNUcnVzdDogYXN5bmMgb3B0aW9ucyA9PiB7XG5cdFx0XHRcdFx0XHR0cnVzdFJlcXVlc3RzLnB1c2gob3B0aW9ucyk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1c3RSZXN1bHQ7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHR0cnVzdFJlcXVlc3RzOiB0cnVzdFJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+ICh7XG5cdFx0XHRcdFx0dXJpOiByZXF1ZXN0LnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHJlcXVlc3QubWVzc2FnZSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IHRydXN0UmVzdWx0ID09PSB0cnVlLFxuXHRcdFx0XHR0cnVzdFJlcXVlc3RzOiBbe1xuXHRcdFx0XHRcdHVyaTogRk9MREVSLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bWVzc2FnZTogJ0FuIGFnZW50IHNlc3Npb24gd2lsbCBiZSBhYmxlIHRvIHJlYWQgZmlsZXMsIHJ1biBjb21tYW5kcywgYW5kIG1ha2UgY2hhbmdlcyBpbiB0aGlzIGZvbGRlci4nLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuc3VpdGUoJ0F1dG9tYXRpb24gYnJhbmNoIHBpY2tlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVJdGVtKG9wdGlvbnM/OiB7XG5cdFx0cmVhZG9ubHkgc3RhdGU/OiBJRm9ybVN0YXRlO1xuXHRcdHJlYWRvbmx5IGdldFJlZnM/OiBJR2l0UmVwb3NpdG9yeVsnZ2V0UmVmcyddO1xuXHRcdHJlYWRvbmx5IGZhaWxPcGVuUmVwb3NpdG9yeU9uY2U/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IHByb3ZpZGVySW5pdGlhbGx5VW5hdmFpbGFibGU/OiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IHJldmFsaWRhdGU/OiAoKSA9PiB2b2lkO1xuXHRcdHJlYWRvbmx5IHZpc2libGU/OiBib29sZWFuO1xuXHR9KToge1xuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdFx0cmVhZG9ubHkgc3RhdGU6IElGb3JtU3RhdGU7XG5cdFx0cmVhZG9ubHkgbW9kZWw6IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbDtcblx0XHRyZWFkb25seSBhY3Rpb25XaWRnZXRTZXJ2aWNlOiBSZWNvcmRpbmdBY3Rpb25XaWRnZXRTZXJ2aWNlO1xuXHRcdHJlYWRvbmx5IGdldE9wZW5SZXBvc2l0b3J5QXR0ZW1wdHM6ICgpID0+IG51bWJlcjtcblx0XHRyZWFkb25seSBzZXRQcm92aWRlckF2YWlsYWJsZTogKCkgPT4gdm9pZDtcblx0fSB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBvcHRpb25zPy5zdGF0ZSA/PyBjcmVhdGVGb3JtU3RhdGUoKTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoc3RhdGUpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSgncmVwb3NpdG9yeVN0YXRlJywge1xuXHRcdFx0SEVBRDogeyB0eXBlOiBHaXRSZWZUeXBlLkhlYWQsIG5hbWU6ICdtYWluJywgY29tbWl0OiAnYWJjMTIzJyB9LFxuXHRcdFx0cmVtb3RlczogW10sXG5cdFx0XHRtZXJnZUNoYW5nZXM6IFtdLFxuXHRcdFx0aW5kZXhDaGFuZ2VzOiBbXSxcblx0XHRcdHdvcmtpbmdUcmVlQ2hhbmdlczogW10sXG5cdFx0XHR1bnRyYWNrZWRDaGFuZ2VzOiBbXSxcblx0XHR9KTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdXBjYXN0UGFydGlhbDxJR2l0UmVwb3NpdG9yeT4oe1xuXHRcdFx0cm9vdFVyaTogRk9MREVSLFxuXHRcdFx0c3RhdGU6IHJlcG9zaXRvcnlTdGF0ZSxcblx0XHRcdGdldFJlZnM6IG9wdGlvbnM/LmdldFJlZnMgPz8gKGFzeW5jICgpID0+IFtcblx0XHRcdFx0eyB0eXBlOiBHaXRSZWZUeXBlLkhlYWQsIG5hbWU6ICdmZWF0dXJlL3onIH0sXG5cdFx0XHRcdHsgdHlwZTogR2l0UmVmVHlwZS5IZWFkLCBuYW1lOiAnbWFpbicgfSxcblx0XHRcdFx0eyB0eXBlOiBHaXRSZWZUeXBlLkhlYWQsIG5hbWU6ICdmZWF0dXJlL2EnIH0sXG5cdFx0XHRcdHsgdHlwZTogR2l0UmVmVHlwZS5IZWFkLCBuYW1lOiAnY29waWxvdC13b3JrdHJlZS1nZW5lcmF0ZWQnIH0sXG5cdFx0XHRdKSxcblx0XHR9KTtcblx0XHRjb25zdCBhY3Rpb25XaWRnZXRTZXJ2aWNlID0gbmV3IFJlY29yZGluZ0FjdGlvbldpZGdldFNlcnZpY2UoKTtcblx0XHRjb25zdCB2aXNpYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdyZXBvc2l0b3J5Q29udHJvbHNWaXNpYmxlJywgb3B0aW9ucz8udmlzaWJsZSA/PyB0cnVlKTtcblx0XHRsZXQgb3BlblJlcG9zaXRvcnlBdHRlbXB0cyA9IDA7XG5cdFx0bGV0IHByb3ZpZGVyQXZhaWxhYmxlID0gIW9wdGlvbnM/LnByb3ZpZGVySW5pdGlhbGx5VW5hdmFpbGFibGU7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVzQ2hhbmdlZCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFjdGlvbldpZGdldFNlcnZpY2UsIGFjdGlvbldpZGdldFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUdpdFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SUdpdFNlcnZpY2U+KHtcblx0XHRcdG9wZW5SZXBvc2l0b3J5OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG9wZW5SZXBvc2l0b3J5QXR0ZW1wdHMrKztcblx0XHRcdFx0aWYgKG9wdGlvbnM/LmZhaWxPcGVuUmVwb3NpdG9yeU9uY2UgJiYgb3BlblJlcG9zaXRvcnlBdHRlbXB0cyA9PT0gMSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignZmFpbGVkIHRvIG9wZW4gcmVwb3NpdG9yeScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXBvc2l0b3J5O1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgdXBjYXN0UGFydGlhbDxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oe1xuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uVHlwZXM6IHNlc3Npb25UeXBlc0NoYW5nZWQuZXZlbnQsXG5cdFx0XHRnZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXI6ICgpID0+IHByb3ZpZGVyQXZhaWxhYmxlID8gW3tcblx0XHRcdFx0cHJvdmlkZXJJZDogc3RhdGUucHJvdmlkZXJJZCA/PyAnZGVmYXVsdC1jb3BpbG90Jyxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IHtcblx0XHRcdFx0XHRpZDogc3RhdGUuc2Vzc2lvblR5cGVJZCA/PyAnY29waWxvdGNsaScsXG5cdFx0XHRcdFx0bGFiZWw6ICdDb3BpbG90Jyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmNvcGlsb3QsXG5cdFx0XHRcdFx0c3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb246IHN0YXRlLnNlc3Npb25UeXBlSWQgPT09ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0XHRhdXRoUmVxdWlyZW1lbnQ6IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50LkdpdEh1Yixcblx0XHRcdFx0fSxcblx0XHRcdH1dIDogW10sXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IGFjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKCd0ZXN0LmF1dG9tYXRpb25Jc29sYXRpb24nLCAnQXV0b21hdGlvbiBJc29sYXRpb24nKSk7XG5cdFx0Y29uc3QgaXRlbSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEF1dG9tYXRpb25Jc29sYXRpb25Hcm91cEFjdGlvblZpZXdJdGVtLFxuXHRcdFx0YWN0aW9uLFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRtb2RlbCxcblx0XHRcdG1vZGVsLmZvbGRlclVyaU9icyxcblx0XHRcdEV2ZW50Lk5vbmUsXG5cdFx0XHRvcHRpb25zPy5yZXZhbGlkYXRlID8/ICgoKSA9PiB7IH0pLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dmlzaWJsZSxcblx0XHQpKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRpdGVtLnJlbmRlcihjb250YWluZXIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdG1vZGVsLFxuXHRcdFx0YWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRcdGdldE9wZW5SZXBvc2l0b3J5QXR0ZW1wdHM6ICgpID0+IG9wZW5SZXBvc2l0b3J5QXR0ZW1wdHMsXG5cdFx0XHRzZXRQcm92aWRlckF2YWlsYWJsZTogKCkgPT4ge1xuXHRcdFx0XHRwcm92aWRlckF2YWlsYWJsZSA9IHRydWU7XG5cdFx0XHRcdHNlc3Npb25UeXBlc0NoYW5nZWQuZmlyZSgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnb3BlbnMgc29ydGVkIGxvY2FsIGJyYW5jaGVzIGFuZCBwZXJzaXN0cyB0aGUgc2VsZWN0ZWQgV29ya3RyZWUgYnJhbmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBtb2RlbCwgYWN0aW9uV2lkZ2V0U2VydmljZSB9ID0gY3JlYXRlSXRlbSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgdHJpZ2dlciA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmF1dG9tYXRpb24tZm9ybS1icmFuY2gtc2xvdCcpO1xuXHRcdGFzc2VydC5vayh0cmlnZ2VyKTtcblxuXHRcdHRyaWdnZXIuY2xpY2soKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbldpZGdldFNlcnZpY2UubGFiZWxzLCBbJ2ZlYXR1cmUvYScsICdmZWF0dXJlL3onLCAnbWFpbiddKTtcblx0XHRhY3Rpb25XaWRnZXRTZXJ2aWNlLnNlbGVjdCgnZmVhdHVyZS96Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdFx0ZXhwYW5kZWQ6IHRyaWdnZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyksXG5cdFx0XHRkaXNhYmxlZDogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHRcdHJvbGU6IHRyaWdnZXIuZ2V0QXR0cmlidXRlKCdyb2xlJyksXG5cdFx0XHRoYXNQb3B1cDogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnKSxcblx0XHR9LCB7XG5cdFx0XHRicmFuY2g6ICdmZWF0dXJlL3onLFxuXHRcdFx0ZXhwYW5kZWQ6ICdmYWxzZScsXG5cdFx0XHRkaXNhYmxlZDogJ2ZhbHNlJyxcblx0XHRcdHJvbGU6ICdidXR0b24nLFxuXHRcdFx0aGFzUG9wdXA6ICdsaXN0Ym94Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYW4gZWRpdGVkIGJyYW5jaCB0aGF0IGlzIG5vIGxvbmdlciBhdmFpbGFibGUgbG9jYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRhaW5lciwgbW9kZWwsIGFjdGlvbldpZGdldFNlcnZpY2UgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0c3RhdGU6IGNyZWF0ZUZvcm1TdGF0ZSh7IGJyYW5jaDogJ2ZlYXR1cmUvZGVsZXRlZCcgfSksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCB0cmlnZ2VyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1zbG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRyaWdnZXIpO1xuXG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogdHJpZ2dlci5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1uYW1lJyk/LnRleHRDb250ZW50LFxuXHRcdFx0cGVyc2lzdGVkQnJhbmNoOiBtb2RlbC5wZXJzaXN0ZWRCcmFuY2gsXG5cdFx0XHRwaWNrZXJJdGVtczogYWN0aW9uV2lkZ2V0U2VydmljZS5sYWJlbHMsXG5cdFx0XHRhcmlhTGFiZWxzOiBhY3Rpb25XaWRnZXRTZXJ2aWNlLmFyaWFMYWJlbHMsXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdmZWF0dXJlL2RlbGV0ZWQnLFxuXHRcdFx0cGVyc2lzdGVkQnJhbmNoOiAnZmVhdHVyZS9kZWxldGVkJyxcblx0XHRcdHBpY2tlckl0ZW1zOiBbJ2ZlYXR1cmUvZGVsZXRlZCcsICdmZWF0dXJlL2EnLCAnZmVhdHVyZS96JywgJ21haW4nXSxcblx0XHRcdGFyaWFMYWJlbHM6IFsnZmVhdHVyZS9kZWxldGVkLCB1bmF2YWlsYWJsZSBsb2NhbGx5JywgJ2ZlYXR1cmUvYScsICdmZWF0dXJlL3onLCAnbWFpbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBGb2xkZXIgYnJhbmNoIHN0YXR1cyByZWFkLW9ubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250YWluZXIsIGFjdGlvbldpZGdldFNlcnZpY2UgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0c3RhdGU6IGNyZWF0ZUZvcm1TdGF0ZSh7IGlzb2xhdGlvbk1vZGU6ICd3b3Jrc3BhY2UnLCBicmFuY2g6ICdzdGFsZS1oZWFkJyB9KSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLXNsb3QnKTtcblx0XHRhc3NlcnQub2sodHJpZ2dlcik7XG5cblx0XHR0cmlnZ2VyLmNsaWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxhYmVsOiB0cmlnZ2VyLnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLW5hbWUnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRkaXNhYmxlZDogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHRcdGhhc0NoZXZyb246ICEhdHJpZ2dlci5xdWVyeVNlbGVjdG9yKCcuY29kaWNvbi1jaGV2cm9uLWRvd24nKSxcblx0XHRcdHBpY2tlclZpc2libGU6IGFjdGlvbldpZGdldFNlcnZpY2UuaXNWaXNpYmxlLFxuXHRcdFx0cm9sZTogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSxcblx0XHRcdGhhc1BvcHVwOiB0cmlnZ2VyLmdldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcpLFxuXHRcdFx0dGFiSW5kZXg6IHRyaWdnZXIudGFiSW5kZXgsXG5cdFx0fSwge1xuXHRcdFx0bGFiZWw6ICdtYWluJyxcblx0XHRcdGRpc2FibGVkOiAndHJ1ZScsXG5cdFx0XHRoYXNDaGV2cm9uOiBmYWxzZSxcblx0XHRcdHBpY2tlclZpc2libGU6IGZhbHNlLFxuXHRcdFx0cm9sZTogbnVsbCxcblx0XHRcdGhhc1BvcHVwOiBudWxsLFxuXHRcdFx0dGFiSW5kZXg6IC0xLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvZmZlcnMgcmV0cnkgYWZ0ZXIgYSBicmFuY2ggbG9hZCBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhdHRlbXB0cyA9IDA7XG5cdFx0Y29uc3QgeyBjb250YWluZXIsIGFjdGlvbldpZGdldFNlcnZpY2UgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0Z2V0UmVmczogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhdHRlbXB0cysrO1xuXHRcdFx0XHRpZiAoYXR0ZW1wdHMgPT09IDEpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbeyB0eXBlOiBHaXRSZWZUeXBlLkhlYWQsIG5hbWU6ICdtYWluJyB9XTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCB0cmlnZ2VyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1zbG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRyaWdnZXIpO1xuXG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9uV2lkZ2V0U2VydmljZS5sYWJlbHMsIFsnUmV0cnkgTG9hZGluZyBCcmFuY2hlcyddKTtcblx0XHRhY3Rpb25XaWRnZXRTZXJ2aWNlLnNlbGVjdCgnUmV0cnkgTG9hZGluZyBCcmFuY2hlcycpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdHRlbXB0cyxcblx0XHRcdGxhYmVsczogYWN0aW9uV2lkZ2V0U2VydmljZS5sYWJlbHMsXG5cdFx0fSwge1xuXHRcdFx0YXR0ZW1wdHM6IDIsXG5cdFx0XHRsYWJlbHM6IFsnbWFpbiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgcGlja2VyIGRpc2FibGVkIHdoaWxlIGJyYW5jaGVzIGxvYWQgYW5kIGVuYWJsZXMgaXQgd2hlbiByZWFkeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWZzID0gbmV3IERlZmVycmVkUHJvbWlzZTxBd2FpdGVkPFJldHVyblR5cGU8SUdpdFJlcG9zaXRvcnlbJ2dldFJlZnMnXT4+PigpO1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBhY3Rpb25XaWRnZXRTZXJ2aWNlIH0gPSBjcmVhdGVJdGVtKHtcblx0XHRcdGdldFJlZnM6IGFzeW5jICgpID0+IHJlZnMucCxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLXNsb3QnKTtcblx0XHRhc3NlcnQub2sodHJpZ2dlcik7XG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzYWJsZWQ6IHRyaWdnZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyksXG5cdFx0XHRwaWNrZXJWaXNpYmxlOiBhY3Rpb25XaWRnZXRTZXJ2aWNlLmlzVmlzaWJsZSxcblx0XHR9LCB7XG5cdFx0XHRkaXNhYmxlZDogJ3RydWUnLFxuXHRcdFx0cGlja2VyVmlzaWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRhd2FpdCByZWZzLmNvbXBsZXRlKFt7IHR5cGU6IEdpdFJlZlR5cGUuSGVhZCwgbmFtZTogJ21haW4nIH1dKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHRyaWdnZXIuY2xpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzYWJsZWQ6IHRyaWdnZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyksXG5cdFx0XHRsYWJlbHM6IGFjdGlvbldpZGdldFNlcnZpY2UubGFiZWxzLFxuXHRcdH0sIHtcblx0XHRcdGRpc2FibGVkOiAnZmFsc2UnLFxuXHRcdFx0bGFiZWxzOiBbJ21haW4nXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhwbGFpbnMgdGhhdCBXb3JrdHJlZSBpcyB1bmF2YWlsYWJsZSB3aGlsZSBicmFuY2hlcyBsb2FkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZnMgPSBuZXcgRGVmZXJyZWRQcm9taXNlPEF3YWl0ZWQ8UmV0dXJuVHlwZTxJR2l0UmVwb3NpdG9yeVsnZ2V0UmVmcyddPj4+KCk7XG5cdFx0Y29uc3QgeyBjb250YWluZXIgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0c3RhdGU6IGNyZWF0ZUZvcm1TdGF0ZSh7IGlzb2xhdGlvbk1vZGU6ICd3b3Jrc3BhY2UnIH0pLFxuXHRcdFx0Z2V0UmVmczogYXN5bmMgKCkgPT4gcmVmcy5wLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgY2hlY2tib3ggPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5zZXNzaW9ucy1jaGF0LWlzb2xhdGlvbi1jaGVja2JveCAubW9uYWNvLWNoZWNrYm94Jyk7XG5cdFx0YXNzZXJ0Lm9rKGNoZWNrYm94KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hlY2tlZDogY2hlY2tib3guZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSxcblx0XHRcdGRpc2FibGVkOiBjaGVja2JveC5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHR9LCB7XG5cdFx0XHRjaGVja2VkOiAnZmFsc2UnLFxuXHRcdFx0ZGlzYWJsZWQ6ICd0cnVlJyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHJlZnMuY29tcGxldGUoW3sgdHlwZTogR2l0UmVmVHlwZS5IZWFkLCBuYW1lOiAnbWFpbicgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvZmZlcnMgcmV0cnkgd2hlbiBvcGVuaW5nIHRoZSByZXBvc2l0b3J5IGZhaWxzIGluIEZvbGRlciBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCBnZXRPcGVuUmVwb3NpdG9yeUF0dGVtcHRzIH0gPSBjcmVhdGVJdGVtKHtcblx0XHRcdHN0YXRlOiBjcmVhdGVGb3JtU3RhdGUoeyBpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyB9KSxcblx0XHRcdGZhaWxPcGVuUmVwb3NpdG9yeU9uY2U6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCB0cmlnZ2VyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1zbG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRyaWdnZXIpO1xuXG5cdFx0dHJpZ2dlci5jbGljaygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9uV2lkZ2V0U2VydmljZS5sYWJlbHMsIFsnUmV0cnkgTG9hZGluZyBCcmFuY2hlcyddKTtcblx0XHRhY3Rpb25XaWRnZXRTZXJ2aWNlLnNlbGVjdCgnUmV0cnkgTG9hZGluZyBCcmFuY2hlcycpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF0dGVtcHRzOiBnZXRPcGVuUmVwb3NpdG9yeUF0dGVtcHRzKCksXG5cdFx0XHRsYWJlbDogdHJpZ2dlci5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1uYW1lJyk/LnRleHRDb250ZW50LFxuXHRcdH0sIHtcblx0XHRcdGF0dGVtcHRzOiAyLFxuXHRcdFx0bGFiZWw6ICdtYWluJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgcHJvdmlkZXJsZXNzIHNlc3Npb24tdHlwZSBwaWNrcyBiZWZvcmUgZ2F0aW5nIFdvcmt0cmVlIGNvbmZpZ3VyYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250YWluZXIgfSA9IGNyZWF0ZUl0ZW0oe1xuXHRcdFx0c3RhdGU6IGNyZWF0ZUZvcm1TdGF0ZSh7IHByb3ZpZGVySWQ6IHVuZGVmaW5lZCB9KSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLXNsb3QnKTtcblx0XHRhc3NlcnQub2sodHJpZ2dlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc2FibGVkOiB0cmlnZ2VyLmdldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpLFxuXHRcdFx0bGFiZWw6IHRyaWdnZXIucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb24tZm9ybS1icmFuY2gtbmFtZScpPy50ZXh0Q29udGVudCxcblx0XHR9LCB7XG5cdFx0XHRkaXNhYmxlZDogJ2ZhbHNlJyxcblx0XHRcdGxhYmVsOiAnbWFpbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgdW5zdXBwb3J0ZWQgV29ya3RyZWUgdGFyZ2V0cyBiYWNrIHRvIEZvbGRlciBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBtb2RlbCB9ID0gY3JlYXRlSXRlbSh7XG5cdFx0XHRzdGF0ZTogY3JlYXRlRm9ybVN0YXRlKHsgc2Vzc2lvblR5cGVJZDogJ2NsYXVkZScsIGJyYW5jaDogJ2ZlYXR1cmUvc2F2ZWQnIH0pLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBjaGVja2JveCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnNlc3Npb25zLWNoYXQtaXNvbGF0aW9uLWNoZWNrYm94IC5tb25hY28tY2hlY2tib3gnKTtcblx0XHRhc3NlcnQub2soY2hlY2tib3gpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW9kZTogbW9kZWwuaXNvbGF0aW9uTW9kZSxcblx0XHRcdGJyYW5jaDogbW9kZWwucGVyc2lzdGVkQnJhbmNoLFxuXHRcdFx0Y2hlY2tlZDogY2hlY2tib3guZ2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnKSxcblx0XHR9LCB7XG5cdFx0XHRtb2RlOiAnd29ya3NwYWNlJyxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hlY2tlZDogJ2ZhbHNlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW5hYmxlcyBXb3JrdHJlZSBicmFuY2hlcyBmb3IgYWdlbnQtaG9zdCBDb3BpbG90IENMSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvbnRhaW5lciB9ID0gY3JlYXRlSXRlbSh7XG5cdFx0XHRzdGF0ZTogY3JlYXRlRm9ybVN0YXRlKHsgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCB0cmlnZ2VyID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYXV0b21hdGlvbi1mb3JtLWJyYW5jaC1zbG90Jyk7XG5cdFx0YXNzZXJ0Lm9rKHRyaWdnZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNhYmxlZDogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnKSxcblx0XHRcdGxhYmVsOiB0cmlnZ2VyLnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLW5hbWUnKT8udGV4dENvbnRlbnQsXG5cdFx0fSwge1xuXHRcdFx0ZGlzYWJsZWQ6ICdmYWxzZScsXG5cdFx0XHRsYWJlbDogJ21haW4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgV29ya3RyZWUgaW50ZW50IHdoaWxlIHRoZSBwcm92aWRlciBpcyBkaXNjb3ZlcmVkIGxhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb250YWluZXIsIG1vZGVsLCBzZXRQcm92aWRlckF2YWlsYWJsZSB9ID0gY3JlYXRlSXRlbSh7XG5cdFx0XHRzdGF0ZTogY3JlYXRlRm9ybVN0YXRlKHsgYnJhbmNoOiAnZmVhdHVyZS9zYXZlZCcgfSksXG5cdFx0XHRwcm92aWRlckluaXRpYWxseVVuYXZhaWxhYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgdHJpZ2dlciA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmF1dG9tYXRpb24tZm9ybS1icmFuY2gtc2xvdCcpO1xuXHRcdGFzc2VydC5vayh0cmlnZ2VyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vZGU6IG1vZGVsLmlzb2xhdGlvbk1vZGUsXG5cdFx0XHRzZWxlY3RlZEJyYW5jaDogbW9kZWwuc2VsZWN0ZWRCcmFuY2gsXG5cdFx0XHRwZXJzaXN0ZWRCcmFuY2g6IG1vZGVsLnBlcnNpc3RlZEJyYW5jaCxcblx0XHRcdHJlYXNvbjogdHJpZ2dlci5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSxcblx0XHR9LCB7XG5cdFx0XHRtb2RlOiAnd29ya3RyZWUnLFxuXHRcdFx0c2VsZWN0ZWRCcmFuY2g6ICdmZWF0dXJlL3NhdmVkJyxcblx0XHRcdHBlcnNpc3RlZEJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdFx0cmVhc29uOiAnZmVhdHVyZS9zYXZlZC4gU2Vzc2lvbiBjYXBhYmlsaXRpZXMgYXJlIGxvYWRpbmcuJyxcblx0XHR9KTtcblxuXHRcdHNldFByb3ZpZGVyQXZhaWxhYmxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1vZGU6IG1vZGVsLmlzb2xhdGlvbk1vZGUsXG5cdFx0XHRwZXJzaXN0ZWRCcmFuY2g6IG1vZGVsLnBlcnNpc3RlZEJyYW5jaCxcblx0XHRcdGRpc2FibGVkOiB0cmlnZ2VyLmdldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpLFxuXHRcdH0sIHtcblx0XHRcdG1vZGU6ICd3b3JrdHJlZScsXG5cdFx0XHRwZXJzaXN0ZWRCcmFuY2g6ICdmZWF0dXJlL3NhdmVkJyxcblx0XHRcdGRpc2FibGVkOiAnZmFsc2UnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1aXJlcyBhIGJyYW5jaCBiZWZvcmUgc2F2aW5nIFdvcmt0cmVlIGlzb2xhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUZvcm1TdGF0ZSh7IGJyYW5jaDogdW5kZWZpbmVkIH0pO1xuXHRcdGNvbnN0IHZhbGlkYXRpb246IElWYWxpZGF0aW9uU3RhdGUgPSB7XG5cdFx0XHRuYW1lRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHByb21wdEVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRmb2xkZXJFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblR5cGVFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0YnJhbmNoRXJyb3I6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGZvcm0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdmb3JtJyk7XG5cblx0XHR1cGRhdGVTYXZlQnV0dG9uU3RhdGUodW5kZWZpbmVkLCBzdGF0ZSwgdmFsaWRhdGlvbiwgZm9ybSwgKCkgPT4gJ3Byb21wdCcsICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbGlkYXRpb24uYnJhbmNoRXJyb3IsICdBIGJyYW5jaCBpcyByZXF1aXJlZCBmb3IgV29ya3RyZWUgaXNvbGF0aW9uLicpO1xuXG5cdFx0dXBkYXRlU2F2ZUJ1dHRvblN0YXRlKHVuZGVmaW5lZCwgc3RhdGUsIHZhbGlkYXRpb24sIGZvcm0sICgpID0+ICdwcm9tcHQnLCAoKSA9PiAnbWFpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWxpZGF0aW9uLmJyYW5jaEVycm9yLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd3MgYSB3b3Jrc3BhY2UtbGVzcyB0YXJnZXQgd2l0aG91dCBhIGZvbGRlciBhbmQgc3RpbGwgcmVxdWlyZXMgYSBzZXNzaW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVGb3JtU3RhdGUoeyBpc1F1aWNrQ2hhdDogdHJ1ZSwgZm9sZGVyVXJpOiB1bmRlZmluZWQsIGlzb2xhdGlvbk1vZGU6IHVuZGVmaW5lZCwgYnJhbmNoOiB1bmRlZmluZWQgfSk7XG5cdFx0Y29uc3QgdmFsaWRhdGlvbjogSVZhbGlkYXRpb25TdGF0ZSA9IHtcblx0XHRcdG5hbWVFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cHJvbXB0RXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdGZvbGRlckVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uVHlwZUVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRicmFuY2hFcnJvcjogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgZm9ybSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Zvcm0nKTtcblxuXHRcdHVwZGF0ZVNhdmVCdXR0b25TdGF0ZSh1bmRlZmluZWQsIHN0YXRlLCB2YWxpZGF0aW9uLCBmb3JtLCAoKSA9PiAncHJvbXB0JywgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRjb25zdCB2YWxpZFRhcmdldCA9IHsgLi4udmFsaWRhdGlvbiB9O1xuXHRcdHN0YXRlLnByb3ZpZGVySWQgPSB1bmRlZmluZWQ7XG5cdFx0c3RhdGUuc2Vzc2lvblR5cGVJZCA9IHVuZGVmaW5lZDtcblx0XHR1cGRhdGVTYXZlQnV0dG9uU3RhdGUodW5kZWZpbmVkLCBzdGF0ZSwgdmFsaWRhdGlvbiwgZm9ybSwgKCkgPT4gJ3Byb21wdCcsICgpID0+IHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHZhbGlkVGFyZ2V0LFxuXHRcdFx0bWlzc2luZ1RhcmdldDogdmFsaWRhdGlvbixcblx0XHR9LCB7XG5cdFx0XHR2YWxpZFRhcmdldDoge1xuXHRcdFx0XHRuYW1lRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJvbXB0RXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0Zm9sZGVyRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Vzc2lvblR5cGVFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRicmFuY2hFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdG1pc3NpbmdUYXJnZXQ6IHtcblx0XHRcdFx0bmFtZUVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByb21wdEVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdGZvbGRlckVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlc3Npb25UeXBlRXJyb3I6ICdTZXNzaW9uIHR5cGUgaXMgcmVxdWlyZWQuJyxcblx0XHRcdFx0YnJhbmNoRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyB3b3Jrc3BhY2UtYmFja2VkIGxlZ2FjeSB0YXJnZXRzIHdpdGhvdXQgYSBwcm92aWRlciBpZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUZvcm1TdGF0ZSh7IHByb3ZpZGVySWQ6IHVuZGVmaW5lZCwgaXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScgfSk7XG5cdFx0Y29uc3QgdmFsaWRhdGlvbjogSVZhbGlkYXRpb25TdGF0ZSA9IHtcblx0XHRcdG5hbWVFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cHJvbXB0RXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdGZvbGRlckVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uVHlwZUVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRicmFuY2hFcnJvcjogdW5kZWZpbmVkLFxuXHRcdH07XG5cblx0XHR1cGRhdGVTYXZlQnV0dG9uU3RhdGUodW5kZWZpbmVkLCBzdGF0ZSwgdmFsaWRhdGlvbiwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZm9ybScpLCAoKSA9PiAncHJvbXB0JywgKCkgPT4gdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsaWRhdGlvbiwge1xuXHRcdFx0bmFtZUVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRwcm9tcHRFcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0Zm9sZGVyRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHNlc3Npb25UeXBlRXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaEVycm9yOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIHJlcG9zaXRvcnkgY29udHJvbHMgZm9yIHdvcmtzcGFjZS1sZXNzIHRhcmdldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVGb3JtU3RhdGUoe1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGlzb2xhdGlvbk1vZGU6ICd3b3JrdHJlZScsXG5cdFx0XHRicmFuY2g6ICdmZWF0dXJlL3N0YWxlJyxcblx0XHR9KTtcblx0XHRjb25zdCB7IGNvbnRhaW5lciwgbW9kZWwgfSA9IGNyZWF0ZUl0ZW0oeyBzdGF0ZSwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzcGxheTogY29udGFpbmVyLnN0eWxlLmRpc3BsYXksXG5cdFx0XHRhcmlhSGlkZGVuOiBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicpLFxuXHRcdFx0Zm9sZGVyVXJpOiBtb2RlbC5mb2xkZXJVcmksXG5cdFx0XHRpc29sYXRpb25Nb2RlOiBzdGF0ZS5pc29sYXRpb25Nb2RlLFxuXHRcdFx0YnJhbmNoOiBtb2RlbC5wZXJzaXN0ZWRCcmFuY2gsXG5cdFx0fSwge1xuXHRcdFx0ZGlzcGxheTogJ25vbmUnLFxuXHRcdFx0YXJpYUhpZGRlbjogJ3RydWUnLFxuXHRcdFx0Zm9sZGVyVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRpc29sYXRpb25Nb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVsb2FkcyByZXBvc2l0b3J5IHN0YXRlIHdoZW4gcmV0dXJuaW5nIHRvIHdvcmtzcGFjZSBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlRm9ybVN0YXRlKHtcblx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdFx0Zm9sZGVyVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRpc29sYXRpb25Nb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRjb25zdCB7IGNvbnRhaW5lciwgbW9kZWwsIGdldE9wZW5SZXBvc2l0b3J5QXR0ZW1wdHMgfSA9IGNyZWF0ZUl0ZW0oeyBzdGF0ZSwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE9wZW5SZXBvc2l0b3J5QXR0ZW1wdHMoKSwgMCk7XG5cdFx0bW9kZWwuc2V0UXVpY2tDaGF0KGZhbHNlLCBGT0xERVIpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF0dGVtcHRzOiBnZXRPcGVuUmVwb3NpdG9yeUF0dGVtcHRzKCksXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaT8udG9TdHJpbmcoKSxcblx0XHRcdGJyYW5jaDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9uLWZvcm0tYnJhbmNoLW5hbWUnKT8udGV4dENvbnRlbnQsXG5cdFx0XHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogbW9kZWwuc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24sXG5cdFx0fSwge1xuXHRcdFx0YXR0ZW1wdHM6IDEsXG5cdFx0XHRmb2xkZXJVcmk6IEZPTERFUi50b1N0cmluZygpLFxuXHRcdFx0YnJhbmNoOiAnbWFpbicsXG5cdFx0XHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWxsb3dzIGZvY3VzIGluIG1vYmlsZSBwaWNrZXIgc2hlZXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNoZWV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0c2hlZXQuY2xhc3NMaXN0LmFkZCgnbW9iaWxlLXBpY2tlci1zaGVldCcpO1xuXHRcdGNvbnN0IGl0ZW0gPSBzaGVldC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBdXRvbWF0aW9uRGlhbG9nUG9wdXBUYXJnZXQoaXRlbSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBhIGxlZ2FjeSBtb2RlbCBpZGVudGlmaWVyIHRvIHRoZSBzZWxlY3RlZCBjb25jcmV0ZSB0YXJnZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGVnYWN5SWRlbnRpZmllciA9ICdjb3BpbG90Y2xpL2dwdC01LjYtc29sJztcblx0XHRjb25zdCBjb25jcmV0ZUlkZW50aWZpZXIgPSAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmdwdC01LjYtc29sJztcblx0XHRjb25zdCB1bnJlbGF0ZWRJZGVudGlmaWVyID0gJ290aGVyL2dwdC01LjYtc29sJztcblx0XHRjb25zdCBtb2RlbElkcyA9IFtsZWdhY3lJZGVudGlmaWVyLCB1bnJlbGF0ZWRJZGVudGlmaWVyXTtcblx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KFtcblx0XHRcdFtsZWdhY3lJZGVudGlmaWVyLCB1cGNhc3RQYXJ0aWFsPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPih7IGlkOiAnZ3B0LTUuNi1zb2wnLCB0YXJnZXRDaGF0U2Vzc2lvblR5cGU6ICdjb3BpbG90Y2xpJyB9KV0sXG5cdFx0XHRbY29uY3JldGVJZGVudGlmaWVyLCB1cGNhc3RQYXJ0aWFsPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPih7IGlkOiAnZ3B0LTUuNi1zb2wnLCB0YXJnZXRDaGF0U2Vzc2lvblR5cGU6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknIH0pXSxcblx0XHRcdFt1bnJlbGF0ZWRJZGVudGlmaWVyLCB1cGNhc3RQYXJ0aWFsPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPih7IGlkOiAnZ3B0LTUuNi1zb2wnLCB0YXJnZXRDaGF0U2Vzc2lvblR5cGU6ICdvdGhlcicgfSldLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IHVwY2FzdFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oe1xuXHRcdFx0Z2V0TGFuZ3VhZ2VNb2RlbElkczogKCkgPT4gbW9kZWxJZHMsXG5cdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiBpZGVudGlmaWVyID0+IG1vZGVscy5nZXQoaWRlbnRpZmllciksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBiZWZvcmVDb25jcmV0ZVRhcmdldEFycml2ZXMgPSByZXNvbHZlQXV0b21hdGlvbk1vZGVsSWRlbnRpZmllcihsYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGxlZ2FjeUlkZW50aWZpZXIsICdjb3BpbG90Y2xpJywgJ2FnZW50LWhvc3QtY29waWxvdGNsaScpO1xuXHRcdG1vZGVsSWRzLnB1c2goY29uY3JldGVJZGVudGlmaWVyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YmVmb3JlQ29uY3JldGVUYXJnZXRBcnJpdmVzLFxuXHRcdFx0YWZ0ZXJDb25jcmV0ZVRhcmdldEFycml2ZXM6IHJlc29sdmVBdXRvbWF0aW9uTW9kZWxJZGVudGlmaWVyKGxhbmd1YWdlTW9kZWxzU2VydmljZSwgbGVnYWN5SWRlbnRpZmllciwgJ2NvcGlsb3RjbGknLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyksXG5cdFx0XHRhbHJlYWR5Q29uY3JldGU6IHJlc29sdmVBdXRvbWF0aW9uTW9kZWxJZGVudGlmaWVyKGxhbmd1YWdlTW9kZWxzU2VydmljZSwgY29uY3JldGVJZGVudGlmaWVyLCAnY29waWxvdGNsaScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknKSxcblx0XHRcdHVucmVsYXRlZDogcmVzb2x2ZUF1dG9tYXRpb25Nb2RlbElkZW50aWZpZXIobGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB1bnJlbGF0ZWRJZGVudGlmaWVyLCAnY29waWxvdGNsaScsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknKSxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVDb25jcmV0ZVRhcmdldEFycml2ZXM6IGxlZ2FjeUlkZW50aWZpZXIsXG5cdFx0XHRhZnRlckNvbmNyZXRlVGFyZ2V0QXJyaXZlczogY29uY3JldGVJZGVudGlmaWVyLFxuXHRcdFx0YWxyZWFkeUNvbmNyZXRlOiBjb25jcmV0ZUlkZW50aWZpZXIsXG5cdFx0XHR1bnJlbGF0ZWQ6IHVucmVsYXRlZElkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBdXRvbWF0aW9uIGRpYWxvZyBrZXlib2FyZCBuYXZpZ2F0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FsbG93cyB1bmRvIGFuZCByZWRvIG9ubHkgZm9yIGVkaXRhYmxlIGNvbnRyb2xzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb21wdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RleHRhcmVhJyk7XG5cdFx0Y29uc3QgYnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVuZG9Qcm9tcHRQcmV2ZW50ZWQ6IGRpc3BhdGNoQXV0b21hdGlvbkRpYWxvZ0NvbW1hbmQocHJvbXB0LCAndW5kbycpLmRlZmF1bHRQcmV2ZW50ZWQsXG5cdFx0XHRyZWRvUHJvbXB0UHJldmVudGVkOiBkaXNwYXRjaEF1dG9tYXRpb25EaWFsb2dDb21tYW5kKHByb21wdCwgJ3JlZG8nKS5kZWZhdWx0UHJldmVudGVkLFxuXHRcdFx0dW5kb0J1dHRvblByZXZlbnRlZDogZGlzcGF0Y2hBdXRvbWF0aW9uRGlhbG9nQ29tbWFuZChidXR0b24sICd1bmRvJykuZGVmYXVsdFByZXZlbnRlZCxcblx0XHRcdHVucmVsYXRlZFByb21wdFByZXZlbnRlZDogZGlzcGF0Y2hBdXRvbWF0aW9uRGlhbG9nQ29tbWFuZChwcm9tcHQsICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnNhdmUnKS5kZWZhdWx0UHJldmVudGVkLFxuXHRcdH0sIHtcblx0XHRcdHVuZG9Qcm9tcHRQcmV2ZW50ZWQ6IGZhbHNlLFxuXHRcdFx0cmVkb1Byb21wdFByZXZlbnRlZDogZmFsc2UsXG5cdFx0XHR1bmRvQnV0dG9uUHJldmVudGVkOiB0cnVlLFxuXHRcdFx0dW5yZWxhdGVkUHJvbXB0UHJldmVudGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjeWNsZXMgdGhyb3VnaCB2aXNpYmxlIGRpYWxvZyBjb250cm9scycsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZChjb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSB9KTtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBET00uZ2V0V2luZG93KGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgZmlyc3QgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKSk7XG5cdFx0Y29uc3QgaGlkZGVuQ29udGFpbmVyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRoaWRkZW5Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRjb25zdCBoaWRkZW4gPSBoaWRkZW5Db250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKSk7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0d3JhcHBlci50YWJJbmRleCA9IDA7XG5cdFx0Y29uc3Qgc2Vjb25kID0gd3JhcHBlci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKSk7XG5cdFx0Y29uc3QgdGhpcmQgPSBjb250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJykpO1xuXHRcdGNvbnN0IG5hdmlnYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJBdXRvbWF0aW9uRGlhbG9nS2V5Ym9hcmROYXZpZ2F0aW9uKFxuXHRcdFx0dGFyZ2V0V2luZG93LFxuXHRcdFx0KCkgPT4gW2ZpcnN0LCBoaWRkZW4sIHdyYXBwZXIsIHNlY29uZCwgdGhpcmRdLFxuXHRcdFx0KCkgPT4gZmFsc2UsXG5cdFx0KSk7XG5cdFx0bGV0IGRvd25zdHJlYW1LZXlEb3ducyA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoKSA9PiBkb3duc3RyZWFtS2V5RG93bnMrKywgdHJ1ZSkpO1xuXG5cdFx0bmF2aWdhdGlvbi5mb2N1c0ZpcnN0KCk7XG5cdFx0ZGlzcGF0Y2hLZXkoZmlyc3QsICdrZXlkb3duJywgJ1RhYicpO1xuXHRcdHNlY29uZC5mb2N1cygpO1xuXHRcdGRpc3BhdGNoS2V5KHNlY29uZCwgJ2tleWRvd24nLCAnVGFiJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQ6IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQsXG5cdFx0XHRkb3duc3RyZWFtS2V5RG93bnMsXG5cdFx0fSwge1xuXHRcdFx0YWN0aXZlRWxlbWVudDogdGhpcmQsXG5cdFx0XHRkb3duc3RyZWFtS2V5RG93bnM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyBwb3B1cCBrZXlkb3duIGhhbmRsaW5nIGFjdGl2ZSBhbmQgc3VwcHJlc3NlcyBpdHMgRXNjYXBlIGtleXVwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kKGNvbnRhaW5lcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gY29udGFpbmVyLnJlbW92ZSgpIH0pO1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IERPTS5nZXRXaW5kb3coY29udGFpbmVyKTtcblx0XHRjb25zdCB0cmlnZ2VyID0gY29udGFpbmVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2J1dHRvbicpKTtcblx0XHRjb25zdCBwb3B1cCA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0Y29uc3QgcG9wdXBJbnB1dCA9IHBvcHVwLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0JykpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlckF1dG9tYXRpb25EaWFsb2dLZXlib2FyZE5hdmlnYXRpb24oXG5cdFx0XHR0YXJnZXRXaW5kb3csXG5cdFx0XHQoKSA9PiBbdHJpZ2dlcl0sXG5cdFx0XHR0YXJnZXQgPT4gcG9wdXAuY29udGFpbnModGFyZ2V0KSxcblx0XHQpKTtcblx0XHRsZXQgZG93bnN0cmVhbUtleURvd25zID0gMDtcblx0XHRsZXQgZG93bnN0cmVhbUtleVVwcyA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0V2luZG93LCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoKSA9PiBkb3duc3RyZWFtS2V5RG93bnMrKywgdHJ1ZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgRE9NLkV2ZW50VHlwZS5LRVlfVVAsICgpID0+IGRvd25zdHJlYW1LZXlVcHMrKywgdHJ1ZSkpO1xuXG5cdFx0cG9wdXBJbnB1dC5mb2N1cygpO1xuXHRcdGRpc3BhdGNoS2V5KHBvcHVwSW5wdXQsICdrZXlkb3duJywgJ0VzY2FwZScpO1xuXHRcdHRyaWdnZXIuZm9jdXMoKTtcblx0XHRkaXNwYXRjaEtleSh0cmlnZ2VyLCAna2V5dXAnLCAnRXNjYXBlJyk7XG5cdFx0ZGlzcGF0Y2hLZXkodHJpZ2dlciwgJ2tleWRvd24nLCAnRXNjYXBlJyk7XG5cdFx0ZGlzcGF0Y2hLZXkodHJpZ2dlciwgJ2tleXVwJywgJ0VzY2FwZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkb3duc3RyZWFtS2V5RG93bnMsXG5cdFx0XHRkb3duc3RyZWFtS2V5VXBzLFxuXHRcdH0sIHtcblx0XHRcdGRvd25zdHJlYW1LZXlEb3duczogMixcblx0XHRcdGRvd25zdHJlYW1LZXlVcHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCLGVBQWU7QUFFekMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBdUI7QUFDaEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BC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
