import { Emitter, Event } from "../../../../../base/common/event.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../../workbench/common/views.js";
import { IEditorGroupsService } from "../../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { IWorkbenchLayoutService, Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IPaneCompositePartService } from "../../../../../workbench/services/panecomposite/browser/panecomposite.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { EditorInput } from "../../../../../workbench/common/editor/editorInput.js";
import { isResourceEditorInput } from "../../../../../workbench/common/editor.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ChatInteractivity, SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionChangesService, SessionChangesService } from "../../../changes/browser/sessionChangesService.js";
import { CHANGES_VIEW_CONTAINER_ID } from "../../../changes/common/changes.js";
import { SESSIONS_FILES_CONTAINER_ID } from "../../../files/browser/files.contribution.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TestStorageService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { ILifecycleService } from "../../../../../workbench/services/lifecycle/common/lifecycle.js";
import { IChangesViewService } from "../../../changes/common/changesViewService.js";
function makeChange(filePath) {
  return { uri: URI.file(filePath), insertions: 1, deletions: 0 };
}
class TestStubEditorInput extends EditorInput {
  constructor(_resource, _options) {
    super();
    this._resource = _resource;
    this._options = _options;
  }
  get typeId() {
    return "test.stubEditor";
  }
  get resource() {
    return this._resource;
  }
  isDirty() {
    return this._options?.dirty ?? false;
  }
  toUntyped() {
    return this._options?.nonRestorable ? void 0 : { resource: this._resource };
  }
}
function makeSession(resource, opts) {
  const status = observableValue("status", opts?.status ?? SessionStatus.Completed);
  const chat = {
    resource,
    createdAt: /* @__PURE__ */ new Date(),
    title: observableValue("title", "Test"),
    updatedAt: observableValue("updatedAt", /* @__PURE__ */ new Date()),
    status,
    checkpoints: observableValue("checkpoints", void 0),
    changes: observableValue("changes", opts?.changes ?? []),
    modelId: observableValue("modelId", void 0),
    mode: observableValue("mode", void 0),
    isArchived: observableValue("isArchived", false),
    isRead: observableValue("isRead", true),
    interactivity: observableValue("interactivity", ChatInteractivity.Full),
    lastTurnEnd: observableValue("lastTurnEnd", void 0),
    description: observableValue("description", void 0)
  };
  return {
    sessionId: `test:${resource.toString()}`,
    resource,
    providerId: "test",
    sessionType: "local",
    icon: Codicon.copilot,
    createdAt: chat.createdAt,
    workspace: observableValue("workspace", opts?.workspace ?? {
      uri: URI.file("/repo"),
      label: "test",
      icon: Codicon.repo,
      folders: [{
        root: URI.file("/repo"),
        workingDirectory: URI.file("/repo"),
        name: "repo",
        description: void 0,
        gitRepository: void 0
      }],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    }),
    title: chat.title,
    updatedAt: chat.updatedAt,
    status: chat.status,
    changesets: constObservable([]),
    changes: chat.changes,
    modelId: chat.modelId,
    mode: chat.mode,
    loading: observableValue("loading", false),
    isArchived: chat.isArchived,
    isRead: chat.isRead,
    lastTurnEnd: chat.lastTurnEnd,
    description: chat.description,
    chats: observableValue("chats", [chat]),
    activeChat: observableValue("activeChat", chat),
    mainChat: constObservable(chat),
    capabilities: constObservable({ supportsMultipleChats: false }),
    isCreated: opts?.isCreated === void 0 ? status.map((status2) => status2 !== SessionStatus.Untitled) : observableValue("isCreated", opts.isCreated),
    sticky: observableValue("sticky", false),
    openChats: observableValue("openChats", [chat]),
    closedChats: constObservable([]),
    lastClosedChat: void 0,
    visibleChatTabs: constObservable([chat]),
    shouldShowChatTabs: constObservable(false),
    isQuickChat: constObservable(opts?.isQuickChat ?? false)
  };
}
function createTestHarness(store, options = {}) {
  const instaService = store.add(new TestInstantiationService());
  const storageService = store.add(new TestStorageService());
  if (options.layoutState) {
    const raw = JSON.stringify(options.layoutState);
    storageService.store("sessions.layoutState", raw, StorageScope.WORKSPACE, 0);
    storageService.store("sessions.singlePane.layoutState", raw, StorageScope.WORKSPACE, 0);
  }
  if (options.sidePaneVisibilityState) {
    storageService.store("sessions.singlePane.sidePaneVisibility", JSON.stringify(options.sidePaneVisibilityState), StorageScope.WORKSPACE, 0);
  }
  if (options.newSessionViewState) {
    const raw = JSON.stringify(options.newSessionViewState);
    storageService.store("sessions.newSessionViewState", raw, StorageScope.WORKSPACE, 0);
    storageService.store("sessions.singlePane.newSessionViewState", raw, StorageScope.WORKSPACE, 0);
  }
  if (options.newSessionViewStateRaw !== void 0) {
    storageService.store("sessions.newSessionViewState", options.newSessionViewStateRaw, StorageScope.WORKSPACE, 0);
    storageService.store("sessions.singlePane.newSessionViewState", options.newSessionViewStateRaw, StorageScope.WORKSPACE, 0);
  }
  instaService.stub(IStorageService, storageService);
  const configService = new TestConfigurationService();
  configService.setUserConfiguration("workbench.editor.useModal", options.useModal ?? "all");
  configService.setUserConfiguration("sessions.layout.autoCollapseSessionsSidebar", options.responsiveSidebar ?? true);
  instaService.stub(IConfigurationService, configService);
  const contextKeyService = store.add(new MockContextKeyService());
  instaService.stub(IContextKeyService, contextKeyService);
  instaService.stub(ITelemetryService, new class extends mock() {
    publicLog2() {
    }
  }());
  const harness = {
    instaService,
    get layoutService() {
      return layoutService;
    },
    storageService,
    activeSessionObs: observableValue("activeSession", void 0),
    visibleSessionsObs: observableValue("visibleSessions", []),
    onDidChangeSessions: store.add(new Emitter()),
    onDidReplaceSession: store.add(new Emitter()),
    onDidChangePartVisibility: store.add(new Emitter()),
    onWillToggleSidePane: store.add(new Emitter()),
    onDidToggleSidePane: store.add(new Emitter()),
    onDidRevealSidePane: store.add(new Emitter()),
    onDidChangeEditorMaximized: store.add(new Emitter()),
    onDidActiveEditorChange: store.add(new Emitter()),
    onWillOpenEditor: store.add(new Emitter()),
    onWillCloseEditor: store.add(new Emitter()),
    onDidCloseEditor: store.add(new Emitter()),
    onDidEditorsChange: store.add(new Emitter()),
    onDidLayoutMainContainer: store.add(new Emitter()),
    onDidChangeViewContainerVisibility: store.add(new Emitter()),
    onDidChangeActiveViewDescriptors: store.add(new Emitter()),
    activeAuxViewContainerIds: options.activeAuxViewContainerIds ? [...options.activeAuxViewContainerIds] : [CHANGES_VIEW_CONTAINER_ID, SESSIONS_FILES_CONTAINER_ID],
    mainContainerWidth: options.mainContainerWidth ?? 2e3,
    editorMaximized: false,
    setEditorMaximizedCalls: [],
    toggleSidePaneCalls: 0,
    sidePaneStateBeforeHide: void 0,
    partVisibility: new Map([
      [Parts.AUXILIARYBAR_PART, true],
      [Parts.PANEL_PART, false],
      [Parts.EDITOR_PART, true],
      [Parts.CUSTOM_VIEW_GRID_PART, false],
      ...options.initialPartVisibility ?? []
    ]),
    openedViewContainers: [],
    openedViews: [],
    setPartHiddenCalls: [],
    editorRevealedExplicitly: false,
    editorPartAutoVisibilitySuppressionDepth: 0,
    activateAux: options.activateAux ?? false,
    activeGroupEditors: [],
    closedEditors: [],
    openedEditors: [],
    closeSuppressionFlags: [],
    closeForceFlags: [],
    activePaneCompositeId: void 0,
    pinnedAuxiliaryBarContainerIds: [SESSIONS_FILES_CONTAINER_ID, CHANGES_VIEW_CONTAINER_ID],
    visibleEditorsList: [],
    activeEditorResource: void 0,
    activeEditorInput: void 0,
    editorGroupsHaveContent: true,
    applyWorkingSetCalls: [],
    saveWorkingSetCalls: [],
    openChangesEditorCalls: [],
    sessionChangesService: new SessionChangesService(new class extends mock() {
    }(), instaService, new class extends mock() {
      get isSinglePaneLayoutEnabled() {
        return options.singlePaneLayoutEnabled ?? false;
      }
    }(), new class extends mock() {
    }()),
    contextKeyService
  };
  const testActiveGroup = new class extends mock() {
    constructor() {
      super(...arguments);
      this.id = 1;
      this.onWillCloseEditor = harness.onWillCloseEditor.event;
    }
    get editors() {
      return harness.activeGroupEditors;
    }
    get count() {
      return harness.activeGroupEditors.length;
    }
    get isEmpty() {
      return harness.activeGroupEditors.length === 0;
    }
    get activeEditor() {
      return harness.activeEditorInput ?? null;
    }
    contains(editor) {
      return harness.activeGroupEditors.includes(editor);
    }
    isPinned() {
      return true;
    }
    pinEditor() {
    }
    getIndexOfEditor(editor) {
      return harness.activeGroupEditors.indexOf(editor);
    }
    async replaceEditors(replacements) {
      await harness.onReplaceEditors?.();
      for (const replacement of replacements) {
        const index = harness.activeGroupEditors.indexOf(replacement.editor);
        if (index === -1) {
          continue;
        }
        harness.activeGroupEditors.splice(index, 1, store.add(replacement.replacement));
        if (harness.activeEditorInput === replacement.editor) {
          harness.activeEditorInput = replacement.replacement;
        }
      }
      harness.onDidEditorsChange.fire();
    }
    moveEditor(editor, _target, options2) {
      const currentIndex = harness.activeGroupEditors.indexOf(editor);
      if (currentIndex === -1) {
        return false;
      }
      harness.activeGroupEditors.splice(currentIndex, 1);
      const targetIndex = Math.max(0, Math.min(options2?.index ?? harness.activeGroupEditors.length, harness.activeGroupEditors.length));
      harness.activeGroupEditors.splice(targetIndex, 0, editor);
      return true;
    }
  }();
  instaService.stub(ISessionsManagementService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeSessions = harness.onDidChangeSessions.event;
      this.onDidReplaceSession = harness.onDidReplaceSession.event;
    }
    getSessions() {
      return [];
    }
  }());
  instaService.stub(ISessionsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSession = harness.activeSessionObs;
      this.visibleSessions = harness.visibleSessionsObs;
    }
  }());
  instaService.stub(ISessionChangesService, new class extends mock() {
    getChangesEditorResource(sessionResource) {
      return harness.sessionChangesService.getChangesEditorResource(sessionResource);
    }
    getSessionResource(editorResource) {
      return harness.sessionChangesService.getSessionResource(editorResource);
    }
    async openChangesEditor(sessionResource, options2) {
      harness.openChangesEditorCalls.push({ sessionResource, active: !options2?.inactive });
      if (harness.onOpenChangesEditor) {
        await harness.onOpenChangesEditor();
      }
      const resource = harness.sessionChangesService.getChangesEditorResource(sessionResource);
      let editor = harness.activeGroupEditors.find((e) => e.resource && isEqual(e.resource, resource));
      if (!editor) {
        editor = store.add(new TestStubEditorInput(resource));
        const index = options2?.index;
        if (typeof index === "number" && index >= 0 && index <= harness.activeGroupEditors.length) {
          harness.activeGroupEditors.splice(index, 0, editor);
        } else {
          harness.activeGroupEditors.push(editor);
        }
      }
      if (!options2?.inactive) {
        harness.activeEditorInput = editor;
        harness.onDidActiveEditorChange.fire();
      }
      return testActiveGroup;
    }
  }());
  instaService.stub(IChangesViewService, new class extends mock() {
    setChangesetId() {
    }
  }());
  instaService.stub(ILifecycleService, new class extends mock() {
    // Resolves only when a test opts in via `activateAux`, so the single-pane
    // managed-tab / detail-panel behaviour is not spun up otherwise.
    when() {
      return harness.activateAux ? Promise.resolve() : new Promise(() => {
      });
    }
  }());
  const layoutService = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangePartVisibility = harness.onDidChangePartVisibility.event;
      this.onWillToggleSidePane = harness.onWillToggleSidePane.event;
      this.onDidToggleSidePane = harness.onDidToggleSidePane.event;
      this.onDidRevealSidePane = harness.onDidRevealSidePane.event;
      this.onDidChangeEditorMaximized = harness.onDidChangeEditorMaximized.event;
      this.onDidLayoutMainContainer = harness.onDidLayoutMainContainer.event;
    }
    isVisible(part) {
      return harness.partVisibility.get(part) ?? true;
    }
    setPartHidden(hidden, part, skipSidePaneReveal = false) {
      harness.setPartHiddenCalls.push({ hidden, part });
      const wasVisible = harness.partVisibility.get(part) ?? true;
      const sidePaneWasClosed = !(harness.partVisibility.get(Parts.EDITOR_PART) ?? true) && !(harness.partVisibility.get(Parts.AUXILIARYBAR_PART) ?? true);
      harness.partVisibility.set(part, !hidden);
      if (wasVisible === hidden) {
        harness.onDidChangePartVisibility.fire({ partId: part, visible: !hidden });
        if (!skipSidePaneReveal && !hidden && sidePaneWasClosed && (part === Parts.EDITOR_PART || part === Parts.AUXILIARYBAR_PART)) {
          harness.onDidRevealSidePane.fire();
        }
      }
    }
    hasFocus(_part) {
      return false;
    }
    suppressEditorPartAutoVisibility() {
      harness.editorPartAutoVisibilitySuppressionDepth++;
      return toDisposable(() => harness.editorPartAutoVisibilitySuppressionDepth--);
    }
    isEditorPartAutoVisibilitySuppressed() {
      return harness.editorPartAutoVisibilitySuppressionDepth > 0;
    }
    setAuxiliaryBarHiddenForResize(hidden) {
      const wasVisible = harness.partVisibility.get(Parts.AUXILIARYBAR_PART) ?? true;
      harness.setPartHiddenCalls.push({ hidden, part: Parts.AUXILIARYBAR_PART });
      harness.partVisibility.set(Parts.AUXILIARYBAR_PART, !hidden);
      if (wasVisible === hidden) {
        harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: !hidden, source: "resize" });
      }
    }
    isEditorRevealedExplicitly() {
      return harness.editorRevealedExplicitly;
    }
    revealEditorPartExplicitly() {
      harness.editorRevealedExplicitly = true;
      this.setPartHidden(false, Parts.EDITOR_PART);
    }
    isEditorMaximized() {
      return harness.editorMaximized;
    }
    setEditorMaximized(maximized) {
      harness.setEditorMaximizedCalls.push(maximized);
      harness.editorMaximized = maximized;
    }
    isSidePaneVisible() {
      return (harness.partVisibility.get(Parts.EDITOR_PART) ?? true) || (harness.partVisibility.get(Parts.AUXILIARYBAR_PART) ?? true);
    }
    hideSidePane() {
      if (this.isSidePaneVisible()) {
        this.toggleSidePane();
      }
    }
    toggleSidePane() {
      harness.toggleSidePaneCalls++;
      const getState = () => {
        const editor = this.isVisible(Parts.EDITOR_PART);
        const auxiliaryBar = this.isVisible(Parts.AUXILIARYBAR_PART);
        return { editor, auxiliaryBar };
      };
      const before = getState();
      const sidePaneWasVisible = before.editor || before.auxiliaryBar;
      harness.onWillToggleSidePane.fire();
      try {
        const singlePane = options.singlePaneLayoutEnabled ?? false;
        if (singlePane && harness.editorMaximized) {
          this.setEditorMaximized(false);
        }
        const visible = !this.isSidePaneVisible();
        const suppression = this.suppressEditorPartAutoVisibility();
        try {
          if (visible) {
            const restore = harness.sidePaneStateBeforeHide ?? (singlePane ? { editor: true, auxiliaryBar: false } : { editor: true, auxiliaryBar: true });
            this.setPartHidden(!restore.editor, Parts.EDITOR_PART, true);
            this.setPartHidden(!restore.auxiliaryBar, Parts.AUXILIARYBAR_PART, true);
          } else {
            harness.sidePaneStateBeforeHide = getState();
            this.setPartHidden(true, Parts.EDITOR_PART);
            this.setPartHidden(true, Parts.AUXILIARYBAR_PART);
          }
        } finally {
          suppression.dispose();
        }
        if (!sidePaneWasVisible && this.isSidePaneVisible()) {
          harness.onDidRevealSidePane.fire();
        }
      } finally {
        harness.onDidToggleSidePane.fire({ before, after: getState() });
      }
      return this.isSidePaneVisible();
    }
    get isSinglePaneLayoutEnabled() {
      return options.singlePaneLayoutEnabled ?? false;
    }
    get mainContainerDimension() {
      return { width: harness.mainContainerWidth, height: 1e3 };
    }
  }();
  instaService.stub(IWorkbenchLayoutService, layoutService);
  instaService.stub(IViewsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeViewContainerVisibility = harness.onDidChangeViewContainerVisibility.event;
    }
    isViewContainerActive(id) {
      return harness.activeAuxViewContainerIds.includes(id);
    }
    async openViewContainer(id) {
      harness.openedViewContainers.push(id);
      revealAuxiliaryBar();
      return null;
    }
    closeViewContainer() {
    }
    async openView(id) {
      harness.openedViews.push(id);
      revealAuxiliaryBar();
      return null;
    }
  }());
  instaService.stub(IViewDescriptorService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeViewContainers = Event.None;
      this.onDidChangeContainerLocation = Event.None;
    }
    getViewContainersByLocation(location) {
      if (location !== ViewContainerLocation.AuxiliaryBar) {
        return [];
      }
      return [CHANGES_VIEW_CONTAINER_ID, SESSIONS_FILES_CONTAINER_ID].map((id) => {
        const container = { id };
        return container;
      });
    }
    getViewContainerModel(_container) {
      const model = { onDidChangeActiveViewDescriptors: harness.onDidChangeActiveViewDescriptors.event };
      return model;
    }
  }());
  function revealAuxiliaryBar() {
    if (!options.revealAuxiliaryBarOnOpen || harness.partVisibility.get(Parts.AUXILIARYBAR_PART) === true) {
      return;
    }
    const sidePaneWasClosed = !(harness.partVisibility.get(Parts.EDITOR_PART) ?? true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    if (sidePaneWasClosed) {
      harness.onDidRevealSidePane.fire();
    }
  }
  instaService.stub(IPaneCompositePartService, new class extends mock() {
    getActivePaneComposite(_location) {
      if (harness.activePaneCompositeId) {
        return new class extends mock() {
          getId() {
            return harness.activePaneCompositeId;
          }
        }();
      }
      return void 0;
    }
    getPinnedPaneCompositeIds(_location) {
      return [...harness.pinnedAuxiliaryBarContainerIds];
    }
  }());
  instaService.stub(IEditorService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidActiveEditorChange = harness.onDidActiveEditorChange.event;
      this.onWillOpenEditor = harness.onWillOpenEditor.event;
      this.onDidCloseEditor = harness.onDidCloseEditor.event;
      this.onDidEditorsChange = harness.onDidEditorsChange.event;
    }
    get visibleEditors() {
      return harness.visibleEditorsList;
    }
    get activeEditor() {
      if (harness.activeEditorInput) {
        return harness.activeEditorInput;
      }
      if (!harness.activeEditorResource) {
        return void 0;
      }
      const editor = { resource: harness.activeEditorResource };
      return editor;
    }
    async openEditor(...args) {
      const editor = args[0];
      if (editor instanceof EditorInput && !harness.activeGroupEditors.includes(editor)) {
        const options2 = args[1];
        const index = options2?.index;
        if (typeof index === "number" && index >= 0 && index <= harness.activeGroupEditors.length) {
          harness.activeGroupEditors.splice(index, 0, store.add(editor));
        } else {
          harness.activeGroupEditors.push(store.add(editor));
        }
        harness.onDidEditorsChange.fire();
      }
      return void 0;
    }
    async openEditors(editors) {
      for (const editor of editors) {
        harness.openedEditors.push(editor);
        const resource = isResourceEditorInput(editor) ? editor.resource : void 0;
        if (resource) {
          const stub = store.add(new TestStubEditorInput(resource));
          const index = editor.options?.index;
          if (typeof index === "number" && index >= 0 && index <= harness.activeGroupEditors.length) {
            harness.activeGroupEditors.splice(index, 0, stub);
          } else {
            harness.activeGroupEditors.push(stub);
          }
        }
      }
      return [];
    }
    async closeEditors(editors, options2) {
      await harness.onCloseEditors?.();
      let didClose = false;
      for (const { editor } of editors) {
        const index = harness.activeGroupEditors.indexOf(editor);
        if (index !== -1) {
          didClose = true;
          harness.onWillCloseEditor.fire({ editor });
          harness.closeSuppressionFlags.push(harness.editorPartAutoVisibilitySuppressionDepth > 0);
          harness.closeForceFlags.push(options2?.force === true);
          harness.activeGroupEditors.splice(index, 1);
          harness.closedEditors.push(editor);
          harness.onDidCloseEditor.fire({ editor, groupId: 1 });
        }
      }
      if (didClose) {
        harness.onDidEditorsChange.fire();
      }
    }
  }());
  instaService.stub(IEditorGroupsService, new class extends mock() {
    get mainPart() {
      const groups = this.groups;
      return new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidAddGroup = Event.None;
        }
        get groups() {
          return groups;
        }
        get activeGroup() {
          return testActiveGroup;
        }
        getGroup(id) {
          return id === testActiveGroup.id ? testActiveGroup : void 0;
        }
      }();
    }
    get groups() {
      return [{
        id: 1,
        isEmpty: !harness.editorGroupsHaveContent,
        editors: harness.activeGroupEditors,
        onWillCloseEditor: harness.onWillCloseEditor.event
      }];
    }
    saveWorkingSet(name) {
      harness.saveWorkingSetCalls.push(name);
      return { id: name, name };
    }
    async applyWorkingSet(workingSet) {
      harness.applyWorkingSetCalls.push(workingSet);
      harness.onApplyWorkingSet?.(workingSet);
      return true;
    }
    deleteWorkingSet() {
    }
  }());
  instaService.stub(IWorkspaceContextService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeWorkspaceFolders = Event.None;
    }
    getWorkspace() {
      return { id: "test", folders: options.workspaceFolders ?? [] };
    }
  }());
  return harness;
}
export {
  TestStubEditorInput,
  createTestHarness,
  makeChange,
  makeSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcbGF5b3V0XFx0ZXN0XFxicm93c2VyXFxsYXlvdXRDb250cm9sbGVyVGVzdFV0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVmlld0NvbnRhaW5lck1vZGVsLCBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElDbG9zZUVkaXRvck9wdGlvbnMsIElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JSZXBsYWNlbWVudCwgSUVkaXRvcldvcmtpbmdTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudCwgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV2lsbE9wZW5FdmVudCwgSVVudHlwZWRFZGl0b3JJbnB1dCwgaXNSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UsIElTaWRlUGFuZVRvZ2dsZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIElDaGF0LCBJU2Vzc2lvbiwgSVNlc3Npb25GaWxlQ2hhbmdlLCBJU2Vzc2lvbldvcmtzcGFjZSwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UsIFNlc3Npb25DaGFuZ2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYW5nZXMvYnJvd3Nlci9zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCB9IGZyb20gJy4uLy4uLy4uL2NoYW5nZXMvY29tbW9uL2NoYW5nZXMuanMnO1xuaW1wb3J0IHsgU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvYnJvd3Nlci9maWxlcy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhbmdlcy9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcblxudHlwZSBTaWRlUGFuZUNvbXBvc2l0aW9uID0geyByZWFkb25seSBlZGl0b3I6IGJvb2xlYW47IHJlYWRvbmx5IGF1eGlsaWFyeUJhcjogYm9vbGVhbiB9O1xuXG5leHBvcnQgZnVuY3Rpb24gbWFrZUNoYW5nZShmaWxlUGF0aDogc3RyaW5nKTogSVNlc3Npb25GaWxlQ2hhbmdlIHtcblx0cmV0dXJuIHsgdXJpOiBVUkkuZmlsZShmaWxlUGF0aCksIGluc2VydGlvbnM6IDEsIGRlbGV0aW9uczogMCB9O1xufVxuXG4vKiogQSBtaW5pbWFsIGVkaXRvciBpbnB1dCBmb3IgdGVzdHMsIGlkZW50aWZpZWQgb25seSBieSBpdHMgcmVzb3VyY2UuICovXG5leHBvcnQgY2xhc3MgVGVzdFN0dWJFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2U6IFVSSSwgcHJpdmF0ZSByZWFkb25seSBfb3B0aW9ucz86IHsgcmVhZG9ubHkgZGlydHk/OiBib29sZWFuOyByZWFkb25seSBub25SZXN0b3JhYmxlPzogYm9vbGVhbiB9KSB7IHN1cGVyKCk7IH1cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gJ3Rlc3Quc3R1YkVkaXRvcic7IH1cblx0b3ZlcnJpZGUgZ2V0IHJlc291cmNlKCk6IFVSSSB7IHJldHVybiB0aGlzLl9yZXNvdXJjZTsgfVxuXHRvdmVycmlkZSBpc0RpcnR5KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fb3B0aW9ucz8uZGlydHkgPz8gZmFsc2U7IH1cblx0b3ZlcnJpZGUgdG9VbnR5cGVkKCk6IElVbnR5cGVkRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fb3B0aW9ucz8ubm9uUmVzdG9yYWJsZSA/IHVuZGVmaW5lZCA6IHsgcmVzb3VyY2U6IHRoaXMuX3Jlc291cmNlIH07IH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VTZXNzaW9uKHJlc291cmNlOiBVUkksIG9wdHM/OiB7XG5cdHN0YXR1cz86IFNlc3Npb25TdGF0dXM7XG5cdGlzQ3JlYXRlZD86IGJvb2xlYW47XG5cdGNoYW5nZXM/OiByZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXTtcblx0d29ya3NwYWNlPzogSVNlc3Npb25Xb3Jrc3BhY2U7XG5cdGlzUXVpY2tDaGF0PzogYm9vbGVhbjtcbn0pOiBJQWN0aXZlU2Vzc2lvbiB7XG5cdGNvbnN0IHN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdHVzJywgb3B0cz8uc3RhdHVzID8/IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKTtcblx0Y29uc3QgY2hhdDogSUNoYXQgPSB7XG5cdFx0cmVzb3VyY2UsXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuXHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoJ3RpdGxlJywgJ1Rlc3QnKSxcblx0XHR1cGRhdGVkQXQ6IG9ic2VydmFibGVWYWx1ZSgndXBkYXRlZEF0JywgbmV3IERhdGUoKSksXG5cdFx0c3RhdHVzLFxuXHRcdGNoZWNrcG9pbnRzOiBvYnNlcnZhYmxlVmFsdWUoJ2NoZWNrcG9pbnRzJywgdW5kZWZpbmVkKSxcblx0XHRjaGFuZ2VzOiBvYnNlcnZhYmxlVmFsdWUoJ2NoYW5nZXMnLCBvcHRzPy5jaGFuZ2VzID8/IFtdKSxcblx0XHRtb2RlbElkOiBvYnNlcnZhYmxlVmFsdWUoJ21vZGVsSWQnLCB1bmRlZmluZWQpLFxuXHRcdG1vZGU6IG9ic2VydmFibGVWYWx1ZSgnbW9kZScsIHVuZGVmaW5lZCksXG5cdFx0aXNBcmNoaXZlZDogb2JzZXJ2YWJsZVZhbHVlKCdpc0FyY2hpdmVkJywgZmFsc2UpLFxuXHRcdGlzUmVhZDogb2JzZXJ2YWJsZVZhbHVlKCdpc1JlYWQnLCB0cnVlKSxcblx0XHRpbnRlcmFjdGl2aXR5OiBvYnNlcnZhYmxlVmFsdWUoJ2ludGVyYWN0aXZpdHknLCBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsKSxcblx0XHRsYXN0VHVybkVuZDogb2JzZXJ2YWJsZVZhbHVlKCdsYXN0VHVybkVuZCcsIHVuZGVmaW5lZCksXG5cdFx0ZGVzY3JpcHRpb246IG9ic2VydmFibGVWYWx1ZSgnZGVzY3JpcHRpb24nLCB1bmRlZmluZWQpLFxuXHR9O1xuXG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbklkOiBgdGVzdDoke3Jlc291cmNlLnRvU3RyaW5nKCl9YCxcblx0XHRyZXNvdXJjZSxcblx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0c2Vzc2lvblR5cGU6ICdsb2NhbCcsXG5cdFx0aWNvbjogQ29kaWNvbi5jb3BpbG90LFxuXHRcdGNyZWF0ZWRBdDogY2hhdC5jcmVhdGVkQXQsXG5cdFx0d29ya3NwYWNlOiBvYnNlcnZhYmxlVmFsdWUoJ3dvcmtzcGFjZScsIG9wdHM/LndvcmtzcGFjZSA/PyB7XG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvcmVwbycpLFxuXHRcdFx0bGFiZWw6ICd0ZXN0Jyxcblx0XHRcdGljb246IENvZGljb24ucmVwbyxcblx0XHRcdGZvbGRlcnM6IFt7XG5cdFx0XHRcdHJvb3Q6IFVSSS5maWxlKCcvcmVwbycpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3JlcG8nKSxcblx0XHRcdFx0bmFtZTogJ3JlcG8nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRnaXRSZXBvc2l0b3J5OiB1bmRlZmluZWQsXG5cdFx0XHR9XSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHR9KSxcblx0XHR0aXRsZTogY2hhdC50aXRsZSxcblx0XHR1cGRhdGVkQXQ6IGNoYXQudXBkYXRlZEF0LFxuXHRcdHN0YXR1czogY2hhdC5zdGF0dXMsXG5cdFx0Y2hhbmdlc2V0czogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRjaGFuZ2VzOiBjaGF0LmNoYW5nZXMsXG5cdFx0bW9kZWxJZDogY2hhdC5tb2RlbElkLFxuXHRcdG1vZGU6IGNoYXQubW9kZSxcblx0XHRsb2FkaW5nOiBvYnNlcnZhYmxlVmFsdWUoJ2xvYWRpbmcnLCBmYWxzZSksXG5cdFx0aXNBcmNoaXZlZDogY2hhdC5pc0FyY2hpdmVkLFxuXHRcdGlzUmVhZDogY2hhdC5pc1JlYWQsXG5cdFx0bGFzdFR1cm5FbmQ6IGNoYXQubGFzdFR1cm5FbmQsXG5cdFx0ZGVzY3JpcHRpb246IGNoYXQuZGVzY3JpcHRpb24sXG5cdFx0Y2hhdHM6IG9ic2VydmFibGVWYWx1ZSgnY2hhdHMnLCBbY2hhdF0pLFxuXHRcdGFjdGl2ZUNoYXQ6IG9ic2VydmFibGVWYWx1ZSgnYWN0aXZlQ2hhdCcsIGNoYXQpLFxuXHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdCksXG5cdFx0Y2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlIH0pLFxuXHRcdGlzQ3JlYXRlZDogb3B0cz8uaXNDcmVhdGVkID09PSB1bmRlZmluZWRcblx0XHRcdD8gc3RhdHVzLm1hcChzdGF0dXMgPT4gc3RhdHVzICE9PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKVxuXHRcdFx0OiBvYnNlcnZhYmxlVmFsdWUoJ2lzQ3JlYXRlZCcsIG9wdHMuaXNDcmVhdGVkKSxcblx0XHRzdGlja3k6IG9ic2VydmFibGVWYWx1ZSgnc3RpY2t5JywgZmFsc2UpLFxuXHRcdG9wZW5DaGF0czogb2JzZXJ2YWJsZVZhbHVlKCdvcGVuQ2hhdHMnLCBbY2hhdF0pLFxuXHRcdGNsb3NlZENoYXRzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdGxhc3RDbG9zZWRDaGF0OiB1bmRlZmluZWQsXG5cdFx0dmlzaWJsZUNoYXRUYWJzOiBjb25zdE9ic2VydmFibGUoW2NoYXRdKSxcblx0XHRzaG91bGRTaG93Q2hhdFRhYnM6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0aXNRdWlja0NoYXQ6IGNvbnN0T2JzZXJ2YWJsZShvcHRzPy5pc1F1aWNrQ2hhdCA/PyBmYWxzZSksXG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNyZWF0ZU9wdGlvbnMge1xuXHRyZWFkb25seSB1c2VNb2RhbD86ICdvZmYnIHwgJ3NvbWUnIHwgJ2FsbCc7XG5cdHJlYWRvbmx5IHdvcmtzcGFjZUZvbGRlcnM/OiByZWFkb25seSB7IHJlYWRvbmx5IHVyaTogVVJJIH1bXTtcblx0cmVhZG9ubHkgbGF5b3V0U3RhdGU/OiByZWFkb25seSBvYmplY3RbXTtcblx0cmVhZG9ubHkgc2lkZVBhbmVWaXNpYmlsaXR5U3RhdGU/OiB7XG5cdFx0cmVhZG9ubHkgZWRpdG9yVmlzaWJsZTogYm9vbGVhbjtcblx0XHRyZWFkb25seSBhdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuO1xuXHR9IHwge1xuXHRcdHJlYWRvbmx5IG5ld1Nlc3Npb246IHsgcmVhZG9ubHkgZWRpdG9yVmlzaWJsZTogYm9vbGVhbjsgcmVhZG9ubHkgYXV4aWxpYXJ5QmFyVmlzaWJsZTogYm9vbGVhbiB9O1xuXHRcdHJlYWRvbmx5IGV4aXN0aW5nU2Vzc2lvbjogeyByZWFkb25seSBlZGl0b3JWaXNpYmxlOiBib29sZWFuOyByZWFkb25seSBhdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuIH07XG5cdH07XG5cdHJlYWRvbmx5IG5ld1Nlc3Npb25WaWV3U3RhdGU/OiB7IHJlYWRvbmx5IGF1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW4gfTtcblx0cmVhZG9ubHkgbmV3U2Vzc2lvblZpZXdTdGF0ZVJhdz86IHN0cmluZztcblx0LyoqIFtEN10gVmFsdWUgZm9yIGBzZXNzaW9ucy5sYXlvdXQuYXV0b0NvbGxhcHNlU2Vzc2lvbnNTaWRlYmFyYCAoZGVmYXVsdHMgdG8gZW5hYmxlZCkuICovXG5cdHJlYWRvbmx5IHJlc3BvbnNpdmVTaWRlYmFyPzogYm9vbGVhbjtcblx0LyoqIFtEN10gV2hlbiBzZXQsIGBvcGVuVmlld2AvYG9wZW5WaWV3Q29udGFpbmVyYCByZXZlYWwgdGhlIGF1eGlsaWFyeSBiYXIgKG1pcnJvcmluZyBwcm9kdWN0aW9uKSBzbyBuYXZpZ2F0aW9uIHJldmVhbHMgY2FuIGJlIGV4ZXJjaXNlZC4gKi9cblx0cmVhZG9ubHkgcmV2ZWFsQXV4aWxpYXJ5QmFyT25PcGVuPzogYm9vbGVhbjtcblx0LyoqIEluaXRpYWwgbWFpbiBjb250YWluZXIgd2lkdGggKGRlZmF1bHRzIHRvIDIwMDApLiBTZXQgYmVsb3cgYFNNQUxMX1dJTkRPV19NQVhfV0lEVEhgIHRvIHN0YXJ0IHNwYWNlLWNvbnN0cmFpbmVkLiAqL1xuXHRyZWFkb25seSBtYWluQ29udGFpbmVyV2lkdGg/OiBudW1iZXI7XG5cdC8qKiBJbml0aWFsIHBhcnQgdmlzaWJpbGl0eSBvdmVycmlkZXMgYXBwbGllZCBiZWZvcmUgdGhlIGNvbnRyb2xsZXIgaXMgY29uc3RydWN0ZWQgKG1pcnJvcnMgcmVzdG9yZWQgbGF5b3V0IGFmdGVyIGEgcmVsb2FkKS4gKi9cblx0cmVhZG9ubHkgaW5pdGlhbFBhcnRWaXNpYmlsaXR5PzogUmVhZG9ubHlNYXA8UGFydHMsIGJvb2xlYW4+O1xuXHQvKiogSURzIG9mIGF1eC1iYXIgdmlldyBjb250YWluZXJzIGFjdGl2ZSBhdCBjb25zdHJ1Y3Rpb24gKGRlZmF1bHRzIHRvIENoYW5nZXMgKyBGaWxlcykuIEVtcHR5IFx1MjFEMiBubyBhY3RpdmUgYXV4IGNvbnRhaW5lcnMgKGUuZy4gYSBxdWljayBjaGF0KS4gKi9cblx0cmVhZG9ubHkgYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHQvKiogV2hlbiBzZXQsIHJlc29sdmVzIHRoZSBsaWZlY3ljbGUgYFJlc3RvcmVkYCBwaGFzZSBzbyBhIHNpbmdsZS1wYW5lIGNvbnRyb2xsZXIncyBtYW5hZ2VkLXRhYiAvIGRldGFpbC1wYW5lbCBiZWhhdmlvdXIgYWN0aXZhdGVzLiAqL1xuXHRyZWFkb25seSBhY3RpdmF0ZUF1eD86IGJvb2xlYW47XG5cdC8qKiBXaGVuIHRydWUsIHRoZSBsYXlvdXQgc2VydmljZSByZXBvcnRzIHNpbmdsZS1wYW5lIGxheW91dCBlbmFibGVkIChkcml2ZXMgYmFzZSBzaW5nbGUtcGFuZSBicmFuY2hlcykuICovXG5cdHJlYWRvbmx5IHNpbmdsZVBhbmVMYXlvdXRFbmFibGVkPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBNdXRhYmxlIHRlc3QgaGFybmVzcyBzaGFyZWQgYnkgdGhlIGJhc2UgLyBkZXNrdG9wIC8gbW9iaWxlIGNvbnRyb2xsZXIgdGVzdFxuICogc3VpdGVzLiBNb2NrcyByZWFkIHRoZSBtdXRhYmxlIGZpZWxkcyBvbiBlYWNoIGNhbGwsIHNvIGEgdGVzdCBjYW4gcmVhc3NpZ25cbiAqIChlLmcuIGBoYXJuZXNzLm9wZW5lZFZpZXdzID0gW11gKSBvciBtdXRhdGUgdGhlbSBiZXR3ZWVuIGFjdGlvbnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RMYXlvdXRIYXJuZXNzIHtcblx0cmVhZG9ubHkgaW5zdGFTZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2U7XG5cdHN0b3JhZ2VTZXJ2aWNlOiBUZXN0U3RvcmFnZVNlcnZpY2U7XG5cdGFjdGl2ZVNlc3Npb25PYnM6IElTZXR0YWJsZU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXHR2aXNpYmxlU2Vzc2lvbnNPYnM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPjtcblx0b25EaWRDaGFuZ2VTZXNzaW9uczogRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD47XG5cdG9uRGlkUmVwbGFjZVNlc3Npb246IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+O1xuXHRvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5OiBFbWl0dGVyPElQYXJ0VmlzaWJpbGl0eUNoYW5nZUV2ZW50Pjtcblx0b25XaWxsVG9nZ2xlU2lkZVBhbmU6IEVtaXR0ZXI8dm9pZD47XG5cdG9uRGlkVG9nZ2xlU2lkZVBhbmU6IEVtaXR0ZXI8SVNpZGVQYW5lVG9nZ2xlRXZlbnQ+O1xuXHRvbkRpZFJldmVhbFNpZGVQYW5lOiBFbWl0dGVyPHZvaWQ+O1xuXHRvbkRpZENoYW5nZUVkaXRvck1heGltaXplZDogRW1pdHRlcjx2b2lkPjtcblx0b25EaWRBY3RpdmVFZGl0b3JDaGFuZ2U6IEVtaXR0ZXI8dm9pZD47XG5cdG9uV2lsbE9wZW5FZGl0b3I6IEVtaXR0ZXI8SUVkaXRvcldpbGxPcGVuRXZlbnQ+O1xuXHRvbldpbGxDbG9zZUVkaXRvcjogRW1pdHRlcjx7IGVkaXRvcjogRWRpdG9ySW5wdXQgfT47XG5cdG9uRGlkQ2xvc2VFZGl0b3I6IEVtaXR0ZXI8eyBlZGl0b3I6IEVkaXRvcklucHV0OyBncm91cElkPzogbnVtYmVyIH0+O1xuXHRvbkRpZEVkaXRvcnNDaGFuZ2U6IEVtaXR0ZXI8dm9pZD47XG5cdG9uRGlkTGF5b3V0TWFpbkNvbnRhaW5lcjogRW1pdHRlcjxJRGltZW5zaW9uPjtcblx0b25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eTogRW1pdHRlcjx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW47IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfT47XG5cdG9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzOiBFbWl0dGVyPHZvaWQ+O1xuXHQvKiogSURzIG9mIGF1eC1iYXIgdmlldyBjb250YWluZXJzIHRoYXQgYXJlIGN1cnJlbnRseSBhY3RpdmUgKHNob3duIGFzIGEgdGFiKS4gKi9cblx0YWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogc3RyaW5nW107XG5cdG1haW5Db250YWluZXJXaWR0aDogbnVtYmVyO1xuXHRlZGl0b3JNYXhpbWl6ZWQ6IGJvb2xlYW47XG5cdHNldEVkaXRvck1heGltaXplZENhbGxzOiBib29sZWFuW107XG5cdHRvZ2dsZVNpZGVQYW5lQ2FsbHM6IG51bWJlcjtcblx0c2lkZVBhbmVTdGF0ZUJlZm9yZUhpZGU6IFNpZGVQYW5lQ29tcG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cdHBhcnRWaXNpYmlsaXR5OiBNYXA8UGFydHMsIGJvb2xlYW4+O1xuXHRvcGVuZWRWaWV3Q29udGFpbmVyczogc3RyaW5nW107XG5cdG9wZW5lZFZpZXdzOiBzdHJpbmdbXTtcblx0c2V0UGFydEhpZGRlbkNhbGxzOiB7IGhpZGRlbjogYm9vbGVhbjsgcGFydDogUGFydHMgfVtdO1xuXHQvKiogVmFsdWUgcmV0dXJuZWQgYnkgdGhlIGxheW91dCBzZXJ2aWNlJ3MgYGlzRWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5KClgIG1vY2suICovXG5cdGVkaXRvclJldmVhbGVkRXhwbGljaXRseTogYm9vbGVhbjtcblx0LyoqIEN1cnJlbnQgc3VwcHJlc3Npb24gZGVwdGggZm9yIGBzdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpYC4gKi9cblx0ZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25EZXB0aDogbnVtYmVyO1xuXHQvKiogV2hldGhlciB0aGUgbGlmZWN5Y2xlIGBSZXN0b3JlZGAgcGhhc2UgaGFzIHJlc29sdmVkIChhY3RpdmF0ZXMgc2luZ2xlLXBhbmUgbWFuYWdlZC10YWIgLyBkZXRhaWwtcGFuZWwgYmVoYXZpb3VyKS4gKi9cblx0YWN0aXZhdGVBdXg6IGJvb2xlYW47XG5cdC8qKiBFZGl0b3JzIGluIHRoZSBtYWluIHBhcnQncyBhY3RpdmUgZ3JvdXAgKGRyaXZlcyB0aGUgc2luZ2xlLXBhbmUgbWFuYWdlZC10YWIgbG9naWMpLiAqL1xuXHRhY3RpdmVHcm91cEVkaXRvcnM6IEVkaXRvcklucHV0W107XG5cdC8qKiBSZWNvcmRzIGVkaXRvcnMgY2xvc2VkIHZpYSBgSUVkaXRvclNlcnZpY2UuY2xvc2VFZGl0b3JzYC4gKi9cblx0Y2xvc2VkRWRpdG9yczogRWRpdG9ySW5wdXRbXTtcblx0LyoqIFJlY29yZHMgdW50eXBlZCBlZGl0b3JzIHJlb3BlbmVkIHZpYSBgSUVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnNgLiAqL1xuXHRvcGVuZWRFZGl0b3JzOiBJVW50eXBlZEVkaXRvcklucHV0W107XG5cdC8qKiBSZWNvcmRzIHRoZSBkZXB0aC1hdC1jbG9zZSBmb3IgZWFjaCBgY2xvc2VFZGl0b3JzYCBjYWxsLCB0byBhc3NlcnQgbGF5b3V0LWRyaXZlbiBjbG9zZXMgaGFwcGVuIHdoaWxlIHN1cHByZXNzZWQuICovXG5cdGNsb3NlU3VwcHJlc3Npb25GbGFnczogYm9vbGVhbltdO1xuXHQvKiogUmVjb3JkcyB3aGV0aGVyIGVhY2ggYGNsb3NlRWRpdG9yc2AgY2FsbCBmb3JjZXMgbGlmZWN5Y2xlIGNsZWFudXAuICovXG5cdGNsb3NlRm9yY2VGbGFnczogYm9vbGVhbltdO1xuXHRhY3RpdmVQYW5lQ29tcG9zaXRlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cGlubmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVySWRzOiBzdHJpbmdbXTtcblx0dmlzaWJsZUVkaXRvcnNMaXN0OiByZWFkb25seSB1bmtub3duW107XG5cdGFjdGl2ZUVkaXRvclJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKiBXaGV0aGVyIHRoZSBlZGl0b3IgZ3JvdXBzIGhhdmUgY29udGVudCAoZHJpdmVzIGBoYXNFZGl0b3JzYCBpbiBgdG9nZ2xlU2lkZVBhbmVgKS4gKi9cblx0ZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQ6IGJvb2xlYW47XG5cdC8qKiBSZWNvcmRzIGV2ZXJ5IGBhcHBseVdvcmtpbmdTZXRgIGNhbGwgbWFkZSBieSB0aGUgY29udHJvbGxlci4gKi9cblx0YXBwbHlXb3JraW5nU2V0Q2FsbHM6IChJRWRpdG9yV29ya2luZ1NldCB8ICdlbXB0eScpW107XG5cdC8qKiBSZWNvcmRzIHRoZSBuYW1lIG9mIGV2ZXJ5IGBzYXZlV29ya2luZ1NldGAgY2FsbCBtYWRlIGJ5IHRoZSBjb250cm9sbGVyLiAqL1xuXHRzYXZlV29ya2luZ1NldENhbGxzOiBzdHJpbmdbXTtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGNhbGxiYWNrIGludm9rZWQgc3luY2hyb25vdXNseSBkdXJpbmcgYGFwcGx5V29ya2luZ1NldGAsIGFsbG93aW5nXG5cdCAqIHRlc3RzIHRvIHNpbXVsYXRlIGV4dGVybmFsIHZpc2liaWxpdHkgY2hhbmdlcyAoZS5nLiB0aGUgc2luZ2xlLXBhbmUgZGV0YWlsXG5cdCAqIHBhbmVsKSB3aGlsZSBgX2lzUmVzdG9yaW5nU2Vzc2lvbkxheW91dGAgaXMgdHJ1ZS5cblx0ICovXG5cdG9uQXBwbHlXb3JraW5nU2V0PzogKHdvcmtpbmdTZXQ6IElFZGl0b3JXb3JraW5nU2V0IHwgJ2VtcHR5JykgPT4gdm9pZDtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGFzeW5jIGhvb2sgYXdhaXRlZCBhdCB0aGUgc3RhcnQgb2YgYG9wZW5DaGFuZ2VzRWRpdG9yYCwgbGV0dGluZyBhXG5cdCAqIHRlc3QgcGF1c2UgYSBtYW5hZ2VkLXRhYiByZWNvbmNpbGUgbWlkLW9wZW4gKGUuZy4gdG8gc3dpdGNoIHNlc3Npb25zIGFuZFxuXHQgKiBhc3NlcnQgdGhlIHN1cGVyc2VkZWQgcmVjb25jaWxlJ3MgaW50ZW50cyBkbyBub3QgbGVhaykuXG5cdCAqL1xuXHRvbk9wZW5DaGFuZ2VzRWRpdG9yPzogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQ7XG5cdC8qKiBPcHRpb25hbCBhc3luYyBob29rIGF3YWl0ZWQgYmVmb3JlIGBjbG9zZUVkaXRvcnNgIG11dGF0ZXMgdGhlIGdyb3VwLiAqL1xuXHRvbkNsb3NlRWRpdG9ycz86ICgpID0+IFByb21pc2U8dm9pZD4gfCB2b2lkO1xuXHQvKiogT3B0aW9uYWwgYXN5bmMgaG9vayBhd2FpdGVkIGJlZm9yZSBgcmVwbGFjZUVkaXRvcnNgIG11dGF0ZXMgdGhlIGdyb3VwLiAqL1xuXHRvblJlcGxhY2VFZGl0b3JzPzogKCkgPT4gUHJvbWlzZTx2b2lkPiB8IHZvaWQ7XG5cdC8qKiBSZWNvcmRzIGV2ZXJ5IGBvcGVuQ2hhbmdlc0VkaXRvcmAgY2FsbCBmb3IgYXNzZXJ0aW9ucyAoc2Vzc2lvbiArIHdoZXRoZXIgYWN0aXZlKS4gKi9cblx0b3BlbkNoYW5nZXNFZGl0b3JDYWxsczogeyBzZXNzaW9uUmVzb3VyY2U6IFVSSTsgYWN0aXZlOiBib29sZWFuIH1bXTtcblx0cmVhZG9ubHkgc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlOiBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlO1xuXHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogTW9ja0NvbnRleHRLZXlTZXJ2aWNlO1xuXHRhY3RpdmVFZGl0b3JJbnB1dD86IEVkaXRvcklucHV0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGVzdEhhcm5lc3Moc3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgb3B0aW9uczogSUNyZWF0ZU9wdGlvbnMgPSB7fSk6IElUZXN0TGF5b3V0SGFybmVzcyB7XG5cdGNvbnN0IGluc3RhU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdGlmIChvcHRpb25zLmxheW91dFN0YXRlKSB7XG5cdFx0Y29uc3QgcmF3ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5sYXlvdXRTdGF0ZSk7XG5cdFx0Ly8gU2VlZCBib3RoIHRoZSBjbGFzc2ljIGRlc2t0b3Aga2V5IGFuZCB0aGUgZnJlc2ggc2luZ2xlLXBhbmUga2V5IHNvIHRoZVxuXHRcdC8vIHNhbWUgaGFybmVzcyBzZXJ2ZXMgYm90aCB0aGUgTGF5b3V0Q29udHJvbGxlciBhbmQgU2luZ2xlUGFuZUxheW91dENvbnRyb2xsZXIgdGVzdHMuXG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3Nlc3Npb25zLmxheW91dFN0YXRlJywgcmF3LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAwKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnc2Vzc2lvbnMuc2luZ2xlUGFuZS5sYXlvdXRTdGF0ZScsIHJhdywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgMCk7XG5cdH1cblx0aWYgKG9wdGlvbnMuc2lkZVBhbmVWaXNpYmlsaXR5U3RhdGUpIHtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnc2Vzc2lvbnMuc2luZ2xlUGFuZS5zaWRlUGFuZVZpc2liaWxpdHknLCBKU09OLnN0cmluZ2lmeShvcHRpb25zLnNpZGVQYW5lVmlzaWJpbGl0eVN0YXRlKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgMCk7XG5cdH1cblx0aWYgKG9wdGlvbnMubmV3U2Vzc2lvblZpZXdTdGF0ZSkge1xuXHRcdGNvbnN0IHJhdyA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMubmV3U2Vzc2lvblZpZXdTdGF0ZSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3Nlc3Npb25zLm5ld1Nlc3Npb25WaWV3U3RhdGUnLCByYXcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIDApO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzZXNzaW9ucy5zaW5nbGVQYW5lLm5ld1Nlc3Npb25WaWV3U3RhdGUnLCByYXcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIDApO1xuXHR9XG5cdGlmIChvcHRpb25zLm5ld1Nlc3Npb25WaWV3U3RhdGVSYXcgIT09IHVuZGVmaW5lZCkge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzZXNzaW9ucy5uZXdTZXNzaW9uVmlld1N0YXRlJywgb3B0aW9ucy5uZXdTZXNzaW9uVmlld1N0YXRlUmF3LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAwKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnc2Vzc2lvbnMuc2luZ2xlUGFuZS5uZXdTZXNzaW9uVmlld1N0YXRlJywgb3B0aW9ucy5uZXdTZXNzaW9uVmlld1N0YXRlUmF3LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAwKTtcblx0fVxuXHRpbnN0YVNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsJywgb3B0aW9ucy51c2VNb2RhbCA/PyAnYWxsJyk7XG5cdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Nlc3Npb25zLmxheW91dC5hdXRvQ29sbGFwc2VTZXNzaW9uc1NpZGViYXInLCBvcHRpb25zLnJlc3BvbnNpdmVTaWRlYmFyID8/IHRydWUpO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHN0b3JlLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0aW5zdGFTZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRlbGVtZXRyeVNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHB1YmxpY0xvZzIoKTogdm9pZCB7IH1cblx0fSk7XG5cblx0Y29uc3QgaGFybmVzczogSVRlc3RMYXlvdXRIYXJuZXNzID0ge1xuXHRcdGluc3RhU2VydmljZSxcblx0XHRnZXQgbGF5b3V0U2VydmljZSgpIHsgcmV0dXJuIGxheW91dFNlcnZpY2U7IH0sXG5cdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0YWN0aXZlU2Vzc2lvbk9iczogb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCksXG5cdFx0dmlzaWJsZVNlc3Npb25zT2JzOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdPigndmlzaWJsZVNlc3Npb25zJywgW10pLFxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD4oKSksXG5cdFx0b25EaWRSZXBsYWNlU2Vzc2lvbjogc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgZnJvbTogSVNlc3Npb247IHJlYWRvbmx5IHRvOiBJU2Vzc2lvbiB9PigpKSxcblx0XHRvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5OiBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SVBhcnRWaXNpYmlsaXR5Q2hhbmdlRXZlbnQ+KCkpLFxuXHRcdG9uV2lsbFRvZ2dsZVNpZGVQYW5lOiBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSksXG5cdFx0b25EaWRUb2dnbGVTaWRlUGFuZTogc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElTaWRlUGFuZVRvZ2dsZUV2ZW50PigpKSxcblx0XHRvbkRpZFJldmVhbFNpZGVQYW5lOiBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSksXG5cdFx0b25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQ6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKSxcblx0XHRvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZTogc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpLFxuXHRcdG9uV2lsbE9wZW5FZGl0b3I6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJRWRpdG9yV2lsbE9wZW5FdmVudD4oKSksXG5cdFx0b25XaWxsQ2xvc2VFZGl0b3I6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IGVkaXRvcjogRWRpdG9ySW5wdXQgfT4oKSksXG5cdFx0b25EaWRDbG9zZUVkaXRvcjogc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgZWRpdG9yOiBFZGl0b3JJbnB1dDsgZ3JvdXBJZD86IG51bWJlciB9PigpKSxcblx0XHRvbkRpZEVkaXRvcnNDaGFuZ2U6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKSxcblx0XHRvbkRpZExheW91dE1haW5Db250YWluZXI6IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJRGltZW5zaW9uPigpKSxcblx0XHRvbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5OiBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuOyBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIH0+KCkpLFxuXHRcdG9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzOiBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSksXG5cdFx0YWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogb3B0aW9ucy5hY3RpdmVBdXhWaWV3Q29udGFpbmVySWRzID8gWy4uLm9wdGlvbnMuYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkc10gOiBbQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCwgU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEXSxcblx0XHRtYWluQ29udGFpbmVyV2lkdGg6IG9wdGlvbnMubWFpbkNvbnRhaW5lcldpZHRoID8/IDIwMDAsXG5cdFx0ZWRpdG9yTWF4aW1pemVkOiBmYWxzZSxcblx0XHRzZXRFZGl0b3JNYXhpbWl6ZWRDYWxsczogW10sXG5cdFx0dG9nZ2xlU2lkZVBhbmVDYWxsczogMCxcblx0XHRzaWRlUGFuZVN0YXRlQmVmb3JlSGlkZTogdW5kZWZpbmVkLFxuXHRcdHBhcnRWaXNpYmlsaXR5OiBuZXcgTWFwPFBhcnRzLCBib29sZWFuPihbXG5cdFx0XHRbUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWVdLFxuXHRcdFx0W1BhcnRzLlBBTkVMX1BBUlQsIGZhbHNlXSxcblx0XHRcdFtQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZV0sXG5cdFx0XHRbUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJULCBmYWxzZV0sXG5cdFx0XHQuLi4ob3B0aW9ucy5pbml0aWFsUGFydFZpc2liaWxpdHkgPz8gW10pLFxuXHRcdF0pLFxuXHRcdG9wZW5lZFZpZXdDb250YWluZXJzOiBbXSxcblx0XHRvcGVuZWRWaWV3czogW10sXG5cdFx0c2V0UGFydEhpZGRlbkNhbGxzOiBbXSxcblx0XHRlZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHk6IGZhbHNlLFxuXHRcdGVkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uRGVwdGg6IDAsXG5cdFx0YWN0aXZhdGVBdXg6IG9wdGlvbnMuYWN0aXZhdGVBdXggPz8gZmFsc2UsXG5cdFx0YWN0aXZlR3JvdXBFZGl0b3JzOiBbXSxcblx0XHRjbG9zZWRFZGl0b3JzOiBbXSxcblx0XHRvcGVuZWRFZGl0b3JzOiBbXSxcblx0XHRjbG9zZVN1cHByZXNzaW9uRmxhZ3M6IFtdLFxuXHRcdGNsb3NlRm9yY2VGbGFnczogW10sXG5cdFx0YWN0aXZlUGFuZUNvbXBvc2l0ZUlkOiB1bmRlZmluZWQsXG5cdFx0cGlubmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVySWRzOiBbU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lELCBDSEFOR0VTX1ZJRVdfQ09OVEFJTkVSX0lEXSxcblx0XHR2aXNpYmxlRWRpdG9yc0xpc3Q6IFtdLFxuXHRcdGFjdGl2ZUVkaXRvclJlc291cmNlOiB1bmRlZmluZWQsXG5cdFx0YWN0aXZlRWRpdG9ySW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRlZGl0b3JHcm91cHNIYXZlQ29udGVudDogdHJ1ZSxcblx0XHRhcHBseVdvcmtpbmdTZXRDYWxsczogW10sXG5cdFx0c2F2ZVdvcmtpbmdTZXRDYWxsczogW10sXG5cdFx0b3BlbkNoYW5nZXNFZGl0b3JDYWxsczogW10sXG5cdFx0c2Vzc2lvbkNoYW5nZXNTZXJ2aWNlOiBuZXcgU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlKG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkgeyB9LCBpbnN0YVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXQgaXNTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZCgpOiBib29sZWFuIHsgcmV0dXJuIG9wdGlvbnMuc2luZ2xlUGFuZUxheW91dEVuYWJsZWQgPz8gZmFsc2U7IH1cblx0XHR9LCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGFuZ2VzVmlld1NlcnZpY2U+KCkgeyB9KSxcblx0XHRjb250ZXh0S2V5U2VydmljZSxcblx0fTtcblxuXHRjb25zdCB0ZXN0QWN0aXZlR3JvdXA6IElFZGl0b3JHcm91cCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvckdyb3VwPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9IDE7XG5cdFx0b3ZlcnJpZGUgZ2V0IGVkaXRvcnMoKSB7IHJldHVybiBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycyBhcyBJRWRpdG9yR3JvdXBbJ2VkaXRvcnMnXTsgfVxuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uV2lsbENsb3NlRWRpdG9yID0gaGFybmVzcy5vbldpbGxDbG9zZUVkaXRvci5ldmVudCBhcyBJRWRpdG9yR3JvdXBbJ29uV2lsbENsb3NlRWRpdG9yJ107XG5cdFx0b3ZlcnJpZGUgZ2V0IGNvdW50KCkgeyByZXR1cm4gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGlzRW1wdHkoKSB7IHJldHVybiBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGggPT09IDA7IH1cblx0XHRvdmVycmlkZSBnZXQgYWN0aXZlRWRpdG9yKCkgeyByZXR1cm4gaGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA/PyBudWxsOyB9XG5cdFx0b3ZlcnJpZGUgY29udGFpbnMoZWRpdG9yOiBFZGl0b3JJbnB1dCkgeyByZXR1cm4gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5jbHVkZXMoZWRpdG9yIGFzIEVkaXRvcklucHV0KTsgfVxuXHRcdG92ZXJyaWRlIGlzUGlubmVkKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdG92ZXJyaWRlIHBpbkVkaXRvcigpIHsgfVxuXHRcdG92ZXJyaWRlIGdldEluZGV4T2ZFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCkgeyByZXR1cm4gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihlZGl0b3IpOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmVwbGFjZUVkaXRvcnMocmVwbGFjZW1lbnRzOiBJRWRpdG9yUmVwbGFjZW1lbnRbXSkge1xuXHRcdFx0YXdhaXQgaGFybmVzcy5vblJlcGxhY2VFZGl0b3JzPy4oKTtcblx0XHRcdGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihyZXBsYWNlbWVudC5lZGl0b3IpO1xuXHRcdFx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGluZGV4LCAxLCBzdG9yZS5hZGQocmVwbGFjZW1lbnQucmVwbGFjZW1lbnQpKTtcblx0XHRcdFx0aWYgKGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPT09IHJlcGxhY2VtZW50LmVkaXRvcikge1xuXHRcdFx0XHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSByZXBsYWNlbWVudC5yZXBsYWNlbWVudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0XHRvdmVycmlkZSBtb3ZlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIF90YXJnZXQ6IElFZGl0b3JHcm91cCwgb3B0aW9ucz86IHsgaW5kZXg/OiBudW1iZXIgfSkge1xuXHRcdFx0Y29uc3QgY3VycmVudEluZGV4ID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihlZGl0b3IpO1xuXHRcdFx0aWYgKGN1cnJlbnRJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGN1cnJlbnRJbmRleCwgMSk7XG5cdFx0XHRjb25zdCB0YXJnZXRJbmRleCA9IE1hdGgubWF4KDAsIE1hdGgubWluKG9wdGlvbnM/LmluZGV4ID8/IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmxlbmd0aCwgaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoKSk7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UodGFyZ2V0SW5kZXgsIDAsIGVkaXRvcik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH07XG5cblx0aW5zdGFTZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSBoYXJuZXNzLm9uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZXBsYWNlU2Vzc2lvbiA9IGhhcm5lc3Mub25EaWRSZXBsYWNlU2Vzc2lvbi5ldmVudDtcblx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpIHsgcmV0dXJuIFtdOyB9XG5cdH0pO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnM7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlzaWJsZVNlc3Npb25zID0gaGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnM7XG5cdH0pO1xuXG5cdGluc3RhU2VydmljZS5zdHViKElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25DaGFuZ2VzU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHsgcmV0dXJuIGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvblJlc291cmNlKGVkaXRvclJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQgeyByZXR1cm4gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0U2Vzc2lvblJlc291cmNlKGVkaXRvclJlc291cmNlKTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5DaGFuZ2VzRWRpdG9yKHNlc3Npb25SZXNvdXJjZTogVVJJLCBvcHRpb25zPzogeyBpbmRleD86IG51bWJlcjsgaW5hY3RpdmU/OiBib29sZWFuIH0pOiBQcm9taXNlPElFZGl0b3JHcm91cD4ge1xuXHRcdFx0aGFybmVzcy5vcGVuQ2hhbmdlc0VkaXRvckNhbGxzLnB1c2goeyBzZXNzaW9uUmVzb3VyY2UsIGFjdGl2ZTogIW9wdGlvbnM/LmluYWN0aXZlIH0pO1xuXHRcdFx0aWYgKGhhcm5lc3Mub25PcGVuQ2hhbmdlc0VkaXRvcikge1xuXHRcdFx0XHRhd2FpdCBoYXJuZXNzLm9uT3BlbkNoYW5nZXNFZGl0b3IoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRsZXQgZWRpdG9yID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+IGUucmVzb3VyY2UgJiYgaXNFcXVhbChlLnJlc291cmNlLCByZXNvdXJjZSkpO1xuXHRcdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdFx0ZWRpdG9yID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KHJlc291cmNlKSk7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gb3B0aW9ucz8uaW5kZXg7XG5cdFx0XHRcdGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInICYmIGluZGV4ID49IDAgJiYgaW5kZXggPD0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGluZGV4LCAwLCBlZGl0b3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gTWlycm9yIHRoZSB3b3JrYmVuY2g6IGEgbm9uLWluYWN0aXZlIG9wZW4gbWFrZXMgdGhlIGVkaXRvciBhY3RpdmUuXG5cdFx0XHRpZiAoIW9wdGlvbnM/LmluYWN0aXZlKSB7XG5cdFx0XHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBlZGl0b3I7XG5cdFx0XHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRlc3RBY3RpdmVHcm91cDtcblx0XHR9XG5cdH0pO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJQ2hhbmdlc1ZpZXdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGFuZ2VzVmlld1NlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHNldENoYW5nZXNldElkKCk6IHZvaWQgeyB9XG5cdH0pO1xuXHRpbnN0YVNlcnZpY2Uuc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGlmZWN5Y2xlU2VydmljZT4oKSB7XG5cdFx0Ly8gUmVzb2x2ZXMgb25seSB3aGVuIGEgdGVzdCBvcHRzIGluIHZpYSBgYWN0aXZhdGVBdXhgLCBzbyB0aGUgc2luZ2xlLXBhbmVcblx0XHQvLyBtYW5hZ2VkLXRhYiAvIGRldGFpbC1wYW5lbCBiZWhhdmlvdXIgaXMgbm90IHNwdW4gdXAgb3RoZXJ3aXNlLlxuXHRcdG92ZXJyaWRlIHdoZW4oKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBoYXJuZXNzLmFjdGl2YXRlQXV4ID8gUHJvbWlzZS5yZXNvbHZlKCkgOiBuZXcgUHJvbWlzZTx2b2lkPigoKSA9PiB7IH0pOyB9XG5cdH0pO1xuXG5cdGNvbnN0IGxheW91dFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBpc1Zpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChwYXJ0KSA/PyB0cnVlO1xuXHRcdH1cblx0XHRvdmVycmlkZSBzZXRQYXJ0SGlkZGVuKGhpZGRlbjogYm9vbGVhbiwgcGFydDogUGFydHMsIHNraXBTaWRlUGFuZVJldmVhbDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5wdXNoKHsgaGlkZGVuLCBwYXJ0IH0pO1xuXHRcdFx0Y29uc3Qgd2FzVmlzaWJsZSA9IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KHBhcnQpID8/IHRydWU7XG5cdFx0XHRjb25zdCBzaWRlUGFuZVdhc0Nsb3NlZCA9ICEoaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpID8/IHRydWUpICYmICEoaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpID8/IHRydWUpO1xuXHRcdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQocGFydCwgIWhpZGRlbik7XG5cdFx0XHQvLyBNaXJyb3IgcHJvZHVjdGlvbjogZmlyZSB0aGUgdmlzaWJpbGl0eSBjaGFuZ2Ugc3luY2hyb25vdXNseSB3aGVuIGl0IGFjdHVhbGx5IGNoYW5nZXNcblx0XHRcdGlmICh3YXNWaXNpYmxlID09PSBoaWRkZW4pIHtcblx0XHRcdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IHBhcnQsIHZpc2libGU6ICFoaWRkZW4gfSk7XG5cdFx0XHRcdGlmICghc2tpcFNpZGVQYW5lUmV2ZWFsICYmICFoaWRkZW4gJiYgc2lkZVBhbmVXYXNDbG9zZWQgJiYgKHBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUIHx8IHBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSkge1xuXHRcdFx0XHRcdGhhcm5lc3Mub25EaWRSZXZlYWxTaWRlUGFuZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0b3ZlcnJpZGUgaGFzRm9jdXMoX3BhcnQ6IFBhcnRzKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRcdHN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk6IElEaXNwb3NhYmxlIHtcblx0XHRcdGhhcm5lc3MuZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25EZXB0aCsrO1xuXHRcdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiBoYXJuZXNzLmVkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uRGVwdGgtLSk7XG5cdFx0fVxuXHRcdGlzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3NlZCgpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiBoYXJuZXNzLmVkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uRGVwdGggPiAwO1xuXHRcdH1cblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW5Gb3JSZXNpemUoaGlkZGVuOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRjb25zdCB3YXNWaXNpYmxlID0gaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpID8/IHRydWU7XG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5wdXNoKHsgaGlkZGVuLCBwYXJ0OiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCB9KTtcblx0XHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCAhaGlkZGVuKTtcblx0XHRcdGlmICh3YXNWaXNpYmxlID09PSBoaWRkZW4pIHtcblx0XHRcdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiAhaGlkZGVuLCBzb3VyY2U6ICdyZXNpemUnIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpc0VkaXRvclJldmVhbGVkRXhwbGljaXRseSgpOiBib29sZWFuIHsgcmV0dXJuIGhhcm5lc3MuZWRpdG9yUmV2ZWFsZWRFeHBsaWNpdGx5OyB9XG5cdFx0cmV2ZWFsRWRpdG9yUGFydEV4cGxpY2l0bHkoKTogdm9pZCB7XG5cdFx0XHRoYXJuZXNzLmVkaXRvclJldmVhbGVkRXhwbGljaXRseSA9IHRydWU7XG5cdFx0XHR0aGlzLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSA9IGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5ldmVudDtcblx0XHRyZWFkb25seSBvbldpbGxUb2dnbGVTaWRlUGFuZSA9IGhhcm5lc3Mub25XaWxsVG9nZ2xlU2lkZVBhbmUuZXZlbnQ7XG5cdFx0cmVhZG9ubHkgb25EaWRUb2dnbGVTaWRlUGFuZSA9IGhhcm5lc3Mub25EaWRUb2dnbGVTaWRlUGFuZS5ldmVudDtcblx0XHRyZWFkb25seSBvbkRpZFJldmVhbFNpZGVQYW5lID0gaGFybmVzcy5vbkRpZFJldmVhbFNpZGVQYW5lLmV2ZW50O1xuXHRcdGlzRWRpdG9yTWF4aW1pemVkKCk6IGJvb2xlYW4geyByZXR1cm4gaGFybmVzcy5lZGl0b3JNYXhpbWl6ZWQ7IH1cblx0XHRzZXRFZGl0b3JNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRoYXJuZXNzLnNldEVkaXRvck1heGltaXplZENhbGxzLnB1c2gobWF4aW1pemVkKTtcblx0XHRcdGhhcm5lc3MuZWRpdG9yTWF4aW1pemVkID0gbWF4aW1pemVkO1xuXHRcdH1cblx0XHRpc1NpZGVQYW5lVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRcdHJldHVybiAoaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpID8/IHRydWUpIHx8IChoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkgPz8gdHJ1ZSk7XG5cdFx0fVxuXHRcdGhpZGVTaWRlUGFuZSgpOiB2b2lkIHtcblx0XHRcdGlmICh0aGlzLmlzU2lkZVBhbmVWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy50b2dnbGVTaWRlUGFuZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0b2dnbGVTaWRlUGFuZSgpOiBib29sZWFuIHtcblx0XHRcdGhhcm5lc3MudG9nZ2xlU2lkZVBhbmVDYWxscysrO1xuXHRcdFx0Y29uc3QgZ2V0U3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJUKTtcblx0XHRcdFx0Y29uc3QgYXV4aWxpYXJ5QmFyID0gdGhpcy5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdFx0XHRyZXR1cm4geyBlZGl0b3IsIGF1eGlsaWFyeUJhciB9O1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGJlZm9yZSA9IGdldFN0YXRlKCk7XG5cdFx0XHRjb25zdCBzaWRlUGFuZVdhc1Zpc2libGUgPSBiZWZvcmUuZWRpdG9yIHx8IGJlZm9yZS5hdXhpbGlhcnlCYXI7XG5cdFx0XHRoYXJuZXNzLm9uV2lsbFRvZ2dsZVNpZGVQYW5lLmZpcmUoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNpbmdsZVBhbmUgPSBvcHRpb25zLnNpbmdsZVBhbmVMYXlvdXRFbmFibGVkID8/IGZhbHNlO1xuXHRcdFx0XHQvLyBNaXJyb3IgU2luZ2xlUGFuZVdvcmtiZW5jaDogdW4tbWF4aW1pemUgYmVmb3JlIHRvZ2dsaW5nIGJvdGggcGFydHMuXG5cdFx0XHRcdGlmIChzaW5nbGVQYW5lICYmIGhhcm5lc3MuZWRpdG9yTWF4aW1pemVkKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRFZGl0b3JNYXhpbWl6ZWQoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHZpc2libGUgPSAhdGhpcy5pc1NpZGVQYW5lVmlzaWJsZSgpO1xuXHRcdFx0XHRjb25zdCBzdXBwcmVzc2lvbiA9IHRoaXMuc3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHkoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdG9yZSA9IGhhcm5lc3Muc2lkZVBhbmVTdGF0ZUJlZm9yZUhpZGUgPz8gKHNpbmdsZVBhbmVcblx0XHRcdFx0XHRcdFx0PyB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9XG5cdFx0XHRcdFx0XHRcdDogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdHRoaXMuc2V0UGFydEhpZGRlbighcmVzdG9yZS5lZGl0b3IsIFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRcdFx0XHRcdHRoaXMuc2V0UGFydEhpZGRlbighcmVzdG9yZS5hdXhpbGlhcnlCYXIsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aGFybmVzcy5zaWRlUGFuZVN0YXRlQmVmb3JlSGlkZSA9IGdldFN0YXRlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0c3VwcHJlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghc2lkZVBhbmVXYXNWaXNpYmxlICYmIHRoaXMuaXNTaWRlUGFuZVZpc2libGUoKSkge1xuXHRcdFx0XHRcdGhhcm5lc3Mub25EaWRSZXZlYWxTaWRlUGFuZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhcm5lc3Mub25EaWRUb2dnbGVTaWRlUGFuZS5maXJlKHsgYmVmb3JlLCBhZnRlcjogZ2V0U3RhdGUoKSB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmlzU2lkZVBhbmVWaXNpYmxlKCk7XG5cdFx0fVxuXHRcdGdldCBpc1NpbmdsZVBhbmVMYXlvdXRFbmFibGVkKCk6IGJvb2xlYW4geyByZXR1cm4gb3B0aW9ucy5zaW5nbGVQYW5lTGF5b3V0RW5hYmxlZCA/PyBmYWxzZTsgfVxuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkID0gaGFybmVzcy5vbkRpZENoYW5nZUVkaXRvck1heGltaXplZC5ldmVudDtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZExheW91dE1haW5Db250YWluZXIgPSBoYXJuZXNzLm9uRGlkTGF5b3V0TWFpbkNvbnRhaW5lci5ldmVudDtcblx0XHRvdmVycmlkZSBnZXQgbWFpbkNvbnRhaW5lckRpbWVuc2lvbigpOiBJRGltZW5zaW9uIHsgcmV0dXJuIHsgd2lkdGg6IGhhcm5lc3MubWFpbkNvbnRhaW5lcldpZHRoLCBoZWlnaHQ6IDEwMDAgfTsgfVxuXHR9IGFzIHVua25vd24gYXMgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZTtcblx0aW5zdGFTZXJ2aWNlLnN0dWIoSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdGluc3RhU2VydmljZS5zdHViKElWaWV3c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdzU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eSA9IGhhcm5lc3Mub25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eS5ldmVudDtcblx0XHRvdmVycmlkZSBpc1ZpZXdDb250YWluZXJBY3RpdmUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIGhhcm5lc3MuYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkcy5pbmNsdWRlcyhpZCk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5WaWV3Q29udGFpbmVyKGlkOiBzdHJpbmcpIHtcblx0XHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMucHVzaChpZCk7XG5cdFx0XHRyZXZlYWxBdXhpbGlhcnlCYXIoKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRvdmVycmlkZSBjbG9zZVZpZXdDb250YWluZXIoKSB7IH1cblx0XHRvdmVycmlkZSBhc3luYyBvcGVuVmlldyhpZDogc3RyaW5nKSB7XG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzLnB1c2goaWQpO1xuXHRcdFx0cmV2ZWFsQXV4aWxpYXJ5QmFyKCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdH0pO1xuXG5cdGluc3RhU2VydmljZS5zdHViKElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdEZXNjcmlwdG9yU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3Q29udGFpbmVycyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDb250YWluZXJMb2NhdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0Vmlld0NvbnRhaW5lcnNCeUxvY2F0aW9uKGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBWaWV3Q29udGFpbmVyW10ge1xuXHRcdFx0aWYgKGxvY2F0aW9uICE9PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCwgU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEXS5tYXAoaWQgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250YWluZXI6IFBhcnRpYWw8Vmlld0NvbnRhaW5lcj4gPSB7IGlkIH07XG5cdFx0XHRcdHJldHVybiBjb250YWluZXIgYXMgVmlld0NvbnRhaW5lcjtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRvdmVycmlkZSBnZXRWaWV3Q29udGFpbmVyTW9kZWwoX2NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IElWaWV3Q29udGFpbmVyTW9kZWwge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB7IG9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzOiBoYXJuZXNzLm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzLmV2ZW50IH07XG5cdFx0XHRyZXR1cm4gbW9kZWwgYXMgdW5rbm93biBhcyBJVmlld0NvbnRhaW5lck1vZGVsO1xuXHRcdH1cblx0fSk7XG5cblx0ZnVuY3Rpb24gcmV2ZWFsQXV4aWxpYXJ5QmFyKCk6IHZvaWQge1xuXHRcdGlmICghb3B0aW9ucy5yZXZlYWxBdXhpbGlhcnlCYXJPbk9wZW4gfHwgaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNpZGVQYW5lV2FzQ2xvc2VkID0gIShoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCkgPz8gdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRpZiAoc2lkZVBhbmVXYXNDbG9zZWQpIHtcblx0XHRcdGhhcm5lc3Mub25EaWRSZXZlYWxTaWRlUGFuZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0aW5zdGFTZXJ2aWNlLnN0dWIoSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRBY3RpdmVQYW5lQ29tcG9zaXRlKF9sb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogSVBhbmVDb21wb3NpdGUgfCB1bmRlZmluZWQge1xuXHRcdFx0aWYgKGhhcm5lc3MuYWN0aXZlUGFuZUNvbXBvc2l0ZUlkKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQYW5lQ29tcG9zaXRlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBnZXRJZCgpIHsgcmV0dXJuIGhhcm5lc3MuYWN0aXZlUGFuZUNvbXBvc2l0ZUlkITsgfVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcyhfbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IHN0cmluZ1tdIHtcblx0XHRcdHJldHVybiBbLi4uaGFybmVzcy5waW5uZWRBdXhpbGlhcnlCYXJDb250YWluZXJJZHNdO1xuXHRcdH1cblx0fSk7XG5cblx0aW5zdGFTZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldCB2aXNpYmxlRWRpdG9ycygpIHsgcmV0dXJuIGhhcm5lc3MudmlzaWJsZUVkaXRvcnNMaXN0IGFzIElFZGl0b3JTZXJ2aWNlWyd2aXNpYmxlRWRpdG9ycyddOyB9XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UgPSBoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmV2ZW50O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uV2lsbE9wZW5FZGl0b3IgPSBoYXJuZXNzLm9uV2lsbE9wZW5FZGl0b3IuZXZlbnQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDbG9zZUVkaXRvciA9IGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5ldmVudCBhcyB1bmtub3duIGFzIElFZGl0b3JTZXJ2aWNlWydvbkRpZENsb3NlRWRpdG9yJ107XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRFZGl0b3JzQ2hhbmdlID0gaGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZXZlbnQgYXMgdW5rbm93biBhcyBJRWRpdG9yU2VydmljZVsnb25EaWRFZGl0b3JzQ2hhbmdlJ107XG5cdFx0b3ZlcnJpZGUgZ2V0IGFjdGl2ZUVkaXRvcigpIHtcblx0XHRcdGlmIChoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybiBoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0IGFzIElFZGl0b3JTZXJ2aWNlWydhY3RpdmVFZGl0b3InXTtcblx0XHRcdH1cblx0XHRcdGlmICghaGFybmVzcy5hY3RpdmVFZGl0b3JSZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWRpdG9yID0geyByZXNvdXJjZTogaGFybmVzcy5hY3RpdmVFZGl0b3JSZXNvdXJjZSB9O1xuXHRcdFx0cmV0dXJuIGVkaXRvciBhcyBJRWRpdG9yU2VydmljZVsnYWN0aXZlRWRpdG9yJ107XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5FZGl0b3IoLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGFyZ3NbMF07XG5cdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRWRpdG9ySW5wdXQgJiYgIWhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluY2x1ZGVzKGVkaXRvcikpIHtcblx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IGFyZ3NbMV0gYXMgeyBpbmRleD86IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IG9wdGlvbnM/LmluZGV4O1xuXHRcdFx0XHRpZiAodHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJyAmJiBpbmRleCA+PSAwICYmIGluZGV4IDw9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShpbmRleCwgMCwgc3RvcmUuYWRkKGVkaXRvcikpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goc3RvcmUuYWRkKGVkaXRvcikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5FZGl0b3JzKGVkaXRvcnM6IHJlYWRvbmx5IElVbnR5cGVkRWRpdG9ySW5wdXRbXSk6IFByb21pc2U8bmV2ZXJbXT4ge1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0XHRoYXJuZXNzLm9wZW5lZEVkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGlzUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3IpID8gZWRpdG9yLnJlc291cmNlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRjb25zdCBzdHViID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KHJlc291cmNlKSk7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBlZGl0b3Iub3B0aW9ucz8uaW5kZXg7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ251bWJlcicgJiYgaW5kZXggPj0gMCAmJiBpbmRleCA8PSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShpbmRleCwgMCwgc3R1Yik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goc3R1Yik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIGNsb3NlRWRpdG9ycyhlZGl0b3JzOiByZWFkb25seSB7IGVkaXRvcjogRWRpdG9ySW5wdXQgfVtdLCBvcHRpb25zPzogSUNsb3NlRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0YXdhaXQgaGFybmVzcy5vbkNsb3NlRWRpdG9ycz8uKCk7XG5cdFx0XHRsZXQgZGlkQ2xvc2UgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgeyBlZGl0b3IgfSBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihlZGl0b3IpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0ZGlkQ2xvc2UgPSB0cnVlO1xuXHRcdFx0XHRcdGhhcm5lc3Mub25XaWxsQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvciB9KTtcblx0XHRcdFx0XHRoYXJuZXNzLmNsb3NlU3VwcHJlc3Npb25GbGFncy5wdXNoKGhhcm5lc3MuZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25EZXB0aCA+IDApO1xuXHRcdFx0XHRcdGhhcm5lc3MuY2xvc2VGb3JjZUZsYWdzLnB1c2gob3B0aW9ucz8uZm9yY2UgPT09IHRydWUpO1xuXHRcdFx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdFx0aGFybmVzcy5jbG9zZWRFZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHRcdFx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvciwgZ3JvdXBJZDogMSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGRpZENsb3NlKSB7XG5cdFx0XHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdGluc3RhU2VydmljZS5zdHViKElFZGl0b3JHcm91cHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cHNTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXQgbWFpblBhcnQoKSB7XG5cdFx0XHRjb25zdCBncm91cHMgPSB0aGlzLmdyb3Vwcztcblx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cHNTZXJ2aWNlWydtYWluUGFydCddPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0IGdyb3VwcygpIHsgcmV0dXJuIGdyb3VwczsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXQgYWN0aXZlR3JvdXAoKSB7IHJldHVybiB0ZXN0QWN0aXZlR3JvdXA7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0R3JvdXAoaWQ6IG51bWJlcikgeyByZXR1cm4gaWQgPT09IHRlc3RBY3RpdmVHcm91cC5pZCA/IHRlc3RBY3RpdmVHcm91cCA6IHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFkZEdyb3VwID0gRXZlbnQuTm9uZTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldCBncm91cHMoKSB7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0aWQ6IDEsXG5cdFx0XHRcdGlzRW1wdHk6ICFoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50LFxuXHRcdFx0XHRlZGl0b3JzOiBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycyxcblx0XHRcdFx0b25XaWxsQ2xvc2VFZGl0b3I6IGhhcm5lc3Mub25XaWxsQ2xvc2VFZGl0b3IuZXZlbnQsXG5cdFx0XHR9XSBhcyB1bmtub3duIGFzIElFZGl0b3JHcm91cHNTZXJ2aWNlWydncm91cHMnXTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgc2F2ZVdvcmtpbmdTZXQobmFtZTogc3RyaW5nKTogSUVkaXRvcldvcmtpbmdTZXQgeyBoYXJuZXNzLnNhdmVXb3JraW5nU2V0Q2FsbHMucHVzaChuYW1lKTsgcmV0dXJuIHsgaWQ6IG5hbWUsIG5hbWUgfTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGFwcGx5V29ya2luZ1NldCh3b3JraW5nU2V0OiBJRWRpdG9yV29ya2luZ1NldCB8ICdlbXB0eScpIHtcblx0XHRcdGhhcm5lc3MuYXBwbHlXb3JraW5nU2V0Q2FsbHMucHVzaCh3b3JraW5nU2V0KTtcblx0XHRcdGhhcm5lc3Mub25BcHBseVdvcmtpbmdTZXQ/Lih3b3JraW5nU2V0KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRvdmVycmlkZSBkZWxldGVXb3JraW5nU2V0KCkgeyB9XG5cdH0pO1xuXG5cdGluc3RhU2VydmljZS5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgZ2V0V29ya3NwYWNlKCk6IElXb3Jrc3BhY2UgeyByZXR1cm4geyBpZDogJ3Rlc3QnLCBmb2xkZXJzOiAob3B0aW9ucy53b3Jrc3BhY2VGb2xkZXJzID8/IFtdKSBhcyBJV29ya3NwYWNlWydmb2xkZXJzJ10gfTsgfVxuXHR9KTtcblxuXHRyZXR1cm4gaGFybmVzcztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNB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
