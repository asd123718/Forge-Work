import assert from "assert";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { derived } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { EmptyFileEditorInput } from "../../../editor/browser/emptyFileEditorInput.js";
import { SinglePaneDetailPanelCoordinator } from "../../browser/singlePane/singlePaneDetailPanelCoordinator.js";
import { SinglePaneExistingSessionStrategy } from "../../browser/singlePane/singlePaneExistingSessionStrategy.js";
import { SinglePaneNewSessionStrategy } from "../../browser/singlePane/singlePaneNewSessionStrategy.js";
import { SinglePaneQuickChatStrategy } from "../../browser/singlePane/singlePaneQuickChatStrategy.js";
import { SessionVisibilityProfile, SinglePaneVisibilityProfileStore } from "../../browser/singlePane/singlePaneVisibilityProfileStore.js";
import { createTestHarness, makeSession, TestStubEditorInput } from "./layoutControllerTestUtils.js";
function createStrategyTestContext(store, harness) {
  const onDidEndSessionLayoutRestore = store.add(new Emitter());
  const savedWorkingSets = /* @__PURE__ */ new Set();
  const state = {
    isRestoringSessionLayout: false,
    togglingSidePane: false,
    setHasSavedWorkingSet: (sessionResource, hasSavedWorkingSet) => {
      const key = sessionResource.toString();
      if (hasSavedWorkingSet) {
        savedWorkingSets.add(key);
      } else {
        savedWorkingSets.delete(key);
      }
    },
    endSessionLayoutRestore: () => onDidEndSessionLayoutRestore.fire()
  };
  const ctx = {
    get isRestoringSessionLayout() {
      return state.isRestoringSessionLayout;
    },
    withSessionLayoutRestore: (work) => {
      const wasRestoring = state.isRestoringSessionLayout;
      state.isRestoringSessionLayout = true;
      const done = () => {
        state.isRestoringSessionLayout = wasRestoring;
        onDidEndSessionLayoutRestore.fire();
      };
      try {
        const result = work();
        if (result instanceof Promise) {
          void result.finally(done);
        } else {
          done();
        }
      } catch (error) {
        done();
        throw error;
      }
    },
    onDidEndSessionLayoutRestore: onDidEndSessionLayoutRestore.event,
    get togglingSidePane() {
      return state.togglingSidePane;
    },
    multipleSessionsVisibleObs: derived((reader) => harness.visibleSessionsObs.read(reader).length > 1),
    activeSessionResourceObs: derived((reader) => harness.activeSessionObs.read(reader)?.resource),
    hasSavedWorkingSet: (sessionResource) => savedWorkingSets.has(sessionResource.toString())
  };
  return { ctx, state };
}
suite("SinglePane layout strategies", () => {
  const store = new DisposableStore();
  let harness;
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function setup(options = {}) {
    harness = createTestHarness(store, options);
    return createStrategyTestContext(store, harness).ctx;
  }
  function activate(session) {
    harness.activeSessionObs.set(session, void 0);
    harness.visibleSessionsObs.set(session ? [session] : [], void 0);
  }
  function createDetailPanel() {
    return store.add(harness.instaService.createInstance(SinglePaneDetailPanelCoordinator));
  }
  function createVisibilityStore() {
    return harness.instaService.createInstance(SinglePaneVisibilityProfileStore);
  }
  test("Existing Session toggles only the detail panel", () => {
    const ctx = setup();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    const strategy = store.add(harness.instaService.createInstance(
      SinglePaneExistingSessionStrategy,
      ctx,
      harness.instaService.createInstance(SinglePaneVisibilityProfileStore),
      createDetailPanel()
    ));
    harness.setPartHiddenCalls.length = 0;
    const nowVisible = strategy.toggleDetails();
    assert.deepStrictEqual({ nowVisible, calls: harness.setPartHiddenCalls }, {
      nowVisible: true,
      calls: [{ hidden: false, part: Parts.AUXILIARYBAR_PART }]
    });
  });
  test("New Session entry hides Editor when Empty Files is the only input", () => {
    const ctx = setup();
    const session = makeSession(URI.parse("session:/new"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeGroupEditors.push(store.add(harness.instaService.createInstance(EmptyFileEditorInput, session.workspace.get())));
    store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel()));
    harness.setPartHiddenCalls.length = 0;
    activate(session);
    assert.deepStrictEqual(harness.setPartHiddenCalls.filter((call) => call.part === Parts.EDITOR_PART), [
      { hidden: true, part: Parts.EDITOR_PART }
    ]);
  });
  test("New Session close fallback replaces the last file and opens Details", async () => {
    const ctx = setup();
    const session = makeSession(URI.parse("session:/new"), { status: SessionStatus.Untitled, isCreated: false });
    const editor = store.add(new TestStubEditorInput(URI.file("/repo/file.ts")));
    harness.activeGroupEditors.push(editor);
    store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel()));
    activate(session);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.activeGroupEditors.length = 0;
    harness.editorGroupsHaveContent = false;
    harness.onDidCloseEditor.fire({ editor, groupId: 1 });
    const replacementDuringClose = harness.activeGroupEditors.find((input) => input instanceof EmptyFileEditorInput);
    harness.onDidEditorsChange.fire();
    await Promise.resolve();
    assert.deepStrictEqual({
      replacementPreservedAfterClose: replacementDuringClose === harness.activeGroupEditors[0],
      editorsAfterCloseCompleted: harness.activeGroupEditors.map((input) => input.typeId),
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, {
      replacementPreservedAfterClose: true,
      editorsAfterCloseCompleted: [EmptyFileEditorInput.ID],
      editorVisible: true,
      auxiliaryBarVisible: true
    });
  });
  test("New Session closes the side pane when Empty Files is closed", () => {
    const ctx = setup();
    const session = makeSession(URI.parse("session:/new"), { status: SessionStatus.Untitled, isCreated: false });
    const editor = store.add(harness.instaService.createInstance(EmptyFileEditorInput, session.workspace.get()));
    harness.activeGroupEditors.push(editor);
    store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel()));
    activate(session);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.activeGroupEditors.length = 0;
    harness.editorGroupsHaveContent = false;
    harness.onDidCloseEditor.fire({ editor, groupId: 1 });
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, {
      editorVisible: false,
      auxiliaryBarVisible: false
    });
  });
  test("New Session rules are inert outside the New Session view", async () => {
    const ctx = setup();
    const session = makeSession(URI.parse("session:/existing"));
    const editor = store.add(new TestStubEditorInput(URI.file("/repo/file.ts")));
    harness.activeGroupEditors.push(editor);
    store.add(harness.instaService.createInstance(SinglePaneNewSessionStrategy, ctx, createDetailPanel()));
    activate(session);
    harness.setPartHiddenCalls.length = 0;
    harness.openedViewContainers.length = 0;
    harness.activeGroupEditors.length = 0;
    harness.editorGroupsHaveContent = false;
    harness.onDidCloseEditor.fire({ editor, groupId: 1 });
    harness.onDidToggleSidePane.fire({
      before: { editor: false, auxiliaryBar: false },
      after: { editor: true, auxiliaryBar: false }
    });
    harness.onWillOpenEditor.fire({ editor, groupId: 1 });
    await Promise.resolve();
    assert.deepStrictEqual({
      hasEmptyFiles: harness.activeGroupEditors.some((input) => input instanceof EmptyFileEditorInput),
      partVisibilityChanges: harness.setPartHiddenCalls,
      openedViewContainers: harness.openedViewContainers
    }, {
      hasEmptyFiles: false,
      partVisibilityChanges: [],
      openedViewContainers: []
    });
  });
  test("Existing Session closes the side pane when its last editor closes", async () => {
    const ctx = setup();
    const session = makeSession(URI.parse("session:/existing"));
    const editor = store.add(new TestStubEditorInput(URI.file("/repo/file.ts")));
    harness.activeGroupEditors.push(editor);
    store.add(harness.instaService.createInstance(
      SinglePaneExistingSessionStrategy,
      ctx,
      harness.instaService.createInstance(SinglePaneVisibilityProfileStore),
      createDetailPanel()
    ));
    activate(session);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.activeGroupEditors.length = 0;
    harness.editorGroupsHaveContent = false;
    harness.onDidCloseEditor.fire({ editor, groupId: 1 });
    harness.onDidEditorsChange.fire();
    await Promise.resolve();
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, {
      editorVisible: false,
      auxiliaryBarVisible: false
    });
  });
  test("Existing Session keeps the side pane open when multiple sessions are visible", async () => {
    const ctx = setup();
    const session = makeSession(URI.parse("session:/existing"));
    const otherSession = makeSession(URI.parse("session:/other"));
    const editor = store.add(new TestStubEditorInput(URI.file("/repo/file.ts")));
    harness.activeGroupEditors.push(editor);
    store.add(harness.instaService.createInstance(
      SinglePaneExistingSessionStrategy,
      ctx,
      harness.instaService.createInstance(SinglePaneVisibilityProfileStore),
      createDetailPanel()
    ));
    harness.activeSessionObs.set(session, void 0);
    harness.visibleSessionsObs.set([session, otherSession], void 0);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls.length = 0;
    harness.activeGroupEditors.length = 0;
    harness.editorGroupsHaveContent = false;
    harness.onDidCloseEditor.fire({ editor, groupId: 1 });
    harness.onDidEditorsChange.fire();
    await Promise.resolve();
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      visibilityChanges: harness.setPartHiddenCalls
    }, {
      editorVisible: true,
      auxiliaryBarVisible: true,
      visibilityChanges: []
    });
  });
  test("Quick Chat hides the side pane once on entry", async () => {
    const ctx = setup();
    const editor = store.add(new TestStubEditorInput(URI.parse("search-editor://outgoing")));
    harness.activeGroupEditors.push(editor);
    harness.editorGroupsHaveContent = true;
    harness.activeEditorInput = editor;
    store.add(harness.instaService.createInstance(SinglePaneQuickChatStrategy, ctx, createDetailPanel(), createVisibilityStore()));
    activate(makeSession(URI.parse("session:/workspace")));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls.length = 0;
    activate(makeSession(URI.parse("session:/quick"), { isQuickChat: true }));
    await Promise.resolve();
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      hideOrder: harness.setPartHiddenCalls.filter((call) => call.hidden)
    }, {
      editorVisible: false,
      auxiliaryBarVisible: false,
      hideOrder: [
        { part: Parts.EDITOR_PART, hidden: true },
        { part: Parts.AUXILIARYBAR_PART, hidden: true }
      ]
    });
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.setPartHiddenCalls.length = 0;
    harness.onDidEditorsChange.fire();
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      visibilityChanges: harness.setPartHiddenCalls
    }, {
      editorVisible: true,
      visibilityChanges: []
    });
  });
  test("Quick Chat reveals its restored editors after layout restoration settles", () => {
    harness = createTestHarness(store);
    const { ctx, state } = createStrategyTestContext(store, harness);
    const quickChat = makeSession(URI.parse("session:/quick"), { isQuickChat: true });
    state.setHasSavedWorkingSet(quickChat.resource, true);
    const visibilityStore = createVisibilityStore();
    visibilityStore.set(SessionVisibilityProfile.Existing, { editorVisible: false, auxiliaryBarVisible: false });
    store.add(harness.instaService.createInstance(SinglePaneQuickChatStrategy, ctx, createDetailPanel(), visibilityStore));
    activate(makeSession(URI.parse("session:/workspace")));
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    activate(quickChat);
    const restoredEditor = store.add(new TestStubEditorInput(URI.parse("browser://restored")));
    harness.activeGroupEditors.push(restoredEditor);
    harness.editorGroupsHaveContent = true;
    harness.activeEditorInput = restoredEditor;
    harness.setPartHiddenCalls.length = 0;
    state.endSessionLayoutRestore();
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      visibilityChanges: harness.setPartHiddenCalls
    }, {
      editorVisible: false,
      auxiliaryBarVisible: false,
      visibilityChanges: []
    });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.setPartHiddenCalls.length = 0;
    state.endSessionLayoutRestore();
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      visibilityChanges: harness.setPartHiddenCalls
    }, {
      editorVisible: false,
      visibilityChanges: []
    });
  });
  test("Quick Chat records a newly opened editor before its first switch", () => {
    harness = createTestHarness(store);
    const { ctx, state } = createStrategyTestContext(store, harness);
    const newQuickChat = makeSession(URI.parse("session:/new-quick"), { isQuickChat: true });
    const restoredQuickChat = makeSession(URI.parse("session:/restored-quick"), { isQuickChat: true });
    state.setHasSavedWorkingSet(restoredQuickChat.resource, true);
    const visibilityStore = createVisibilityStore();
    visibilityStore.set(SessionVisibilityProfile.Existing, { editorVisible: false, auxiliaryBarVisible: false });
    store.add(harness.instaService.createInstance(SinglePaneQuickChatStrategy, ctx, createDetailPanel(), visibilityStore));
    activate(newQuickChat);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    const openedEditor = store.add(new TestStubEditorInput(URI.parse("browser://new")));
    harness.activeGroupEditors.push(openedEditor);
    harness.editorGroupsHaveContent = true;
    harness.activeEditorInput = openedEditor;
    harness.onDidEditorsChange.fire();
    activate(restoredQuickChat);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      sharedVisibility: visibilityStore.get(SessionVisibilityProfile.Existing)
    }, {
      editorVisible: true,
      auxiliaryBarVisible: false,
      sharedVisibility: { editorVisible: true, auxiliaryBarVisible: false }
    });
  });
  test("Quick Chat shares side-pane visibility without persisting an editorless hide", () => {
    harness = createTestHarness(store);
    const { ctx, state } = createStrategyTestContext(store, harness);
    const emptyQuickChat = makeSession(URI.parse("session:/empty-quick"), { isQuickChat: true });
    const editorQuickChat = makeSession(URI.parse("session:/editor-quick"), { isQuickChat: true });
    state.setHasSavedWorkingSet(editorQuickChat.resource, true);
    const visibilityStore = createVisibilityStore();
    visibilityStore.set(SessionVisibilityProfile.Existing, { editorVisible: false, auxiliaryBarVisible: true });
    store.add(harness.instaService.createInstance(SinglePaneQuickChatStrategy, ctx, createDetailPanel(), visibilityStore));
    activate(makeSession(URI.parse("session:/workspace")));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls.length = 0;
    activate(emptyQuickChat);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      sharedVisibility: visibilityStore.get(SessionVisibilityProfile.Existing)
    }, {
      editorVisible: false,
      auxiliaryBarVisible: false,
      sharedVisibility: { editorVisible: false, auxiliaryBarVisible: true }
    });
    activate(editorQuickChat);
    const restoredEditor = store.add(new TestStubEditorInput(URI.parse("browser://restored")));
    harness.activeGroupEditors.push(restoredEditor);
    harness.editorGroupsHaveContent = true;
    harness.activeEditorInput = restoredEditor;
    harness.setPartHiddenCalls.length = 0;
    state.endSessionLayoutRestore();
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      visibilityChanges: harness.setPartHiddenCalls,
      sharedVisibility: visibilityStore.get(SessionVisibilityProfile.Existing)
    }, {
      editorVisible: true,
      auxiliaryBarVisible: false,
      visibilityChanges: [],
      sharedVisibility: { editorVisible: false, auxiliaryBarVisible: true }
    });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    assert.deepStrictEqual(visibilityStore.get(SessionVisibilityProfile.Existing), {
      editorVisible: false,
      auxiliaryBarVisible: false
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcbGF5b3V0XFx0ZXN0XFxicm93c2VyXFxzaW5nbGVQYW5lU3RyYXRlZ2llcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgRW1wdHlGaWxlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lbXB0eUZpbGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaW5nbGVQYW5lRGV0YWlsUGFuZWxDb29yZGluYXRvciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2luZ2xlUGFuZS9zaW5nbGVQYW5lRGV0YWlsUGFuZWxDb29yZGluYXRvci5qcyc7XG5pbXBvcnQgeyBTaW5nbGVQYW5lRXhpc3RpbmdTZXNzaW9uU3RyYXRlZ3kgfSBmcm9tICcuLi8uLi9icm93c2VyL3NpbmdsZVBhbmUvc2luZ2xlUGFuZUV4aXN0aW5nU2Vzc2lvblN0cmF0ZWd5LmpzJztcbmltcG9ydCB7IElTaW5nbGVQYW5lTGF5b3V0Q29udGV4dCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2luZ2xlUGFuZS9zaW5nbGVQYW5lTGF5b3V0U3RyYXRlZ3kuanMnO1xuaW1wb3J0IHsgU2luZ2xlUGFuZU5ld1Nlc3Npb25TdHJhdGVneSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2luZ2xlUGFuZS9zaW5nbGVQYW5lTmV3U2Vzc2lvblN0cmF0ZWd5LmpzJztcbmltcG9ydCB7IFNpbmdsZVBhbmVRdWlja0NoYXRTdHJhdGVneSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2luZ2xlUGFuZS9zaW5nbGVQYW5lUXVpY2tDaGF0U3RyYXRlZ3kuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblZpc2liaWxpdHlQcm9maWxlLCBTaW5nbGVQYW5lVmlzaWJpbGl0eVByb2ZpbGVTdG9yZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2luZ2xlUGFuZS9zaW5nbGVQYW5lVmlzaWJpbGl0eVByb2ZpbGVTdG9yZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXN0SGFybmVzcywgSUNyZWF0ZU9wdGlvbnMsIElUZXN0TGF5b3V0SGFybmVzcywgbWFrZVNlc3Npb24sIFRlc3RTdHViRWRpdG9ySW5wdXQgfSBmcm9tICcuL2xheW91dENvbnRyb2xsZXJUZXN0VXRpbHMuanMnO1xuXG5pbnRlcmZhY2UgSVRlc3RDb250ZXh0U3RhdGUge1xuXHRpc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXQ6IGJvb2xlYW47XG5cdHRvZ2dsaW5nU2lkZVBhbmU6IGJvb2xlYW47XG5cdHNldEhhc1NhdmVkV29ya2luZ1NldChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgaGFzU2F2ZWRXb3JraW5nU2V0OiBib29sZWFuKTogdm9pZDtcblx0ZW5kU2Vzc2lvbkxheW91dFJlc3RvcmUoKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU3RyYXRlZ3lUZXN0Q29udGV4dChzdG9yZTogRGlzcG9zYWJsZVN0b3JlLCBoYXJuZXNzOiBJVGVzdExheW91dEhhcm5lc3MpOiB7IHJlYWRvbmx5IGN0eDogSVNpbmdsZVBhbmVMYXlvdXRDb250ZXh0OyByZWFkb25seSBzdGF0ZTogSVRlc3RDb250ZXh0U3RhdGUgfSB7XG5cdGNvbnN0IG9uRGlkRW5kU2Vzc2lvbkxheW91dFJlc3RvcmUgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGNvbnN0IHNhdmVkV29ya2luZ1NldHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3Qgc3RhdGU6IElUZXN0Q29udGV4dFN0YXRlID0ge1xuXHRcdGlzUmVzdG9yaW5nU2Vzc2lvbkxheW91dDogZmFsc2UsXG5cdFx0dG9nZ2xpbmdTaWRlUGFuZTogZmFsc2UsXG5cdFx0c2V0SGFzU2F2ZWRXb3JraW5nU2V0OiAoc2Vzc2lvblJlc291cmNlLCBoYXNTYXZlZFdvcmtpbmdTZXQpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0aWYgKGhhc1NhdmVkV29ya2luZ1NldCkge1xuXHRcdFx0XHRzYXZlZFdvcmtpbmdTZXRzLmFkZChrZXkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2F2ZWRXb3JraW5nU2V0cy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGVuZFNlc3Npb25MYXlvdXRSZXN0b3JlOiAoKSA9PiBvbkRpZEVuZFNlc3Npb25MYXlvdXRSZXN0b3JlLmZpcmUoKSxcblx0fTtcblx0Y29uc3QgY3R4OiBJU2luZ2xlUGFuZUxheW91dENvbnRleHQgPSB7XG5cdFx0Z2V0IGlzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCgpIHsgcmV0dXJuIHN0YXRlLmlzUmVzdG9yaW5nU2Vzc2lvbkxheW91dDsgfSxcblx0XHR3aXRoU2Vzc2lvbkxheW91dFJlc3RvcmU6IHdvcmsgPT4ge1xuXHRcdFx0Y29uc3Qgd2FzUmVzdG9yaW5nID0gc3RhdGUuaXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0O1xuXHRcdFx0c3RhdGUuaXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0ID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGRvbmUgPSAoKSA9PiB7XG5cdFx0XHRcdHN0YXRlLmlzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCA9IHdhc1Jlc3RvcmluZztcblx0XHRcdFx0b25EaWRFbmRTZXNzaW9uTGF5b3V0UmVzdG9yZS5maXJlKCk7XG5cdFx0XHR9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gd29yaygpO1xuXHRcdFx0XHRpZiAocmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0XHRcdHZvaWQgcmVzdWx0LmZpbmFsbHkoZG9uZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25EaWRFbmRTZXNzaW9uTGF5b3V0UmVzdG9yZTogb25EaWRFbmRTZXNzaW9uTGF5b3V0UmVzdG9yZS5ldmVudCxcblx0XHRnZXQgdG9nZ2xpbmdTaWRlUGFuZSgpIHsgcmV0dXJuIHN0YXRlLnRvZ2dsaW5nU2lkZVBhbmU7IH0sXG5cdFx0bXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnM6IGRlcml2ZWQocmVhZGVyID0+IGhhcm5lc3MudmlzaWJsZVNlc3Npb25zT2JzLnJlYWQocmVhZGVyKS5sZW5ndGggPiAxKSxcblx0XHRhY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnM6IGRlcml2ZWQocmVhZGVyID0+IGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5yZWFkKHJlYWRlcik/LnJlc291cmNlKSxcblx0XHRoYXNTYXZlZFdvcmtpbmdTZXQ6IHNlc3Npb25SZXNvdXJjZSA9PiBzYXZlZFdvcmtpbmdTZXRzLmhhcyhzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdH07XG5cdHJldHVybiB7IGN0eCwgc3RhdGUgfTtcbn1cblxuc3VpdGUoJ1NpbmdsZVBhbmUgbGF5b3V0IHN0cmF0ZWdpZXMnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBoYXJuZXNzOiBJVGVzdExheW91dEhhcm5lc3M7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHNldHVwKG9wdGlvbnM6IElDcmVhdGVPcHRpb25zID0ge30pOiBJU2luZ2xlUGFuZUxheW91dENvbnRleHQge1xuXHRcdGhhcm5lc3MgPSBjcmVhdGVUZXN0SGFybmVzcyhzdG9yZSwgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIGNyZWF0ZVN0cmF0ZWd5VGVzdENvbnRleHQoc3RvcmUsIGhhcm5lc3MpLmN0eDtcblx0fVxuXG5cdGZ1bmN0aW9uIGFjdGl2YXRlKHNlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MudmlzaWJsZVNlc3Npb25zT2JzLnNldChzZXNzaW9uID8gW3Nlc3Npb25dIDogW10sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVEZXRhaWxQYW5lbCgpOiBTaW5nbGVQYW5lRGV0YWlsUGFuZWxDb29yZGluYXRvciB7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChoYXJuZXNzLmluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW5nbGVQYW5lRGV0YWlsUGFuZWxDb29yZGluYXRvcikpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlVmlzaWJpbGl0eVN0b3JlKCk6IFNpbmdsZVBhbmVWaXNpYmlsaXR5UHJvZmlsZVN0b3JlIHtcblx0XHRyZXR1cm4gaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZVZpc2liaWxpdHlQcm9maWxlU3RvcmUpO1xuXHR9XG5cblx0dGVzdCgnRXhpc3RpbmcgU2Vzc2lvbiB0b2dnbGVzIG9ubHkgdGhlIGRldGFpbCBwYW5lbCcsICgpID0+IHtcblx0XHRjb25zdCBjdHggPSBzZXR1cCgpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuU0lERUJBUl9QQVJULCB0cnVlKTtcblx0XHRjb25zdCBzdHJhdGVneSA9IHN0b3JlLmFkZChoYXJuZXNzLmluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFNpbmdsZVBhbmVFeGlzdGluZ1Nlc3Npb25TdHJhdGVneSxcblx0XHRcdGN0eCxcblx0XHRcdGhhcm5lc3MuaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpbmdsZVBhbmVWaXNpYmlsaXR5UHJvZmlsZVN0b3JlKSxcblx0XHRcdGNyZWF0ZURldGFpbFBhbmVsKClcblx0XHQpKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3Qgbm93VmlzaWJsZSA9IHN0cmF0ZWd5LnRvZ2dsZURldGFpbHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBub3dWaXNpYmxlLCBjYWxsczogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgfSwge1xuXHRcdFx0bm93VmlzaWJsZTogdHJ1ZSxcblx0XHRcdGNhbGxzOiBbeyBoaWRkZW46IGZhbHNlLCBwYXJ0OiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTmV3IFNlc3Npb24gZW50cnkgaGlkZXMgRWRpdG9yIHdoZW4gRW1wdHkgRmlsZXMgaXMgdGhlIG9ubHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY3R4ID0gc2V0dXAoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOi9uZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW1wdHlGaWxlRWRpdG9ySW5wdXQsIHNlc3Npb24ud29ya3NwYWNlLmdldCgpKSkpO1xuXHRcdHN0b3JlLmFkZChoYXJuZXNzLmluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW5nbGVQYW5lTmV3U2Vzc2lvblN0cmF0ZWd5LCBjdHgsIGNyZWF0ZURldGFpbFBhbmVsKCkpKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0YWN0aXZhdGUoc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQpLCBbXG5cdFx0XHR7IGhpZGRlbjogdHJ1ZSwgcGFydDogUGFydHMuRURJVE9SX1BBUlQgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnTmV3IFNlc3Npb24gY2xvc2UgZmFsbGJhY2sgcmVwbGFjZXMgdGhlIGxhc3QgZmlsZSBhbmQgb3BlbnMgRGV0YWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdHggPSBzZXR1cCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246L25ldycpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRjb25zdCBlZGl0b3IgPSBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoVVJJLmZpbGUoJy9yZXBvL2ZpbGUudHMnKSkpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHRzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZU5ld1Nlc3Npb25TdHJhdGVneSwgY3R4LCBjcmVhdGVEZXRhaWxQYW5lbCgpKSk7XG5cdFx0YWN0aXZhdGUoc2Vzc2lvbik7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGggPSAwO1xuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSBmYWxzZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvciwgZ3JvdXBJZDogMSB9KTtcblx0XHRjb25zdCByZXBsYWNlbWVudER1cmluZ0Nsb3NlID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChpbnB1dCA9PiBpbnB1dCBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcGxhY2VtZW50UHJlc2VydmVkQWZ0ZXJDbG9zZTogcmVwbGFjZW1lbnREdXJpbmdDbG9zZSA9PT0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnNbMF0sXG5cdFx0XHRlZGl0b3JzQWZ0ZXJDbG9zZUNvbXBsZXRlZDogaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubWFwKGlucHV0ID0+IGlucHV0LnR5cGVJZCksXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0fSwge1xuXHRcdFx0cmVwbGFjZW1lbnRQcmVzZXJ2ZWRBZnRlckNsb3NlOiB0cnVlLFxuXHRcdFx0ZWRpdG9yc0FmdGVyQ2xvc2VDb21wbGV0ZWQ6IFtFbXB0eUZpbGVFZGl0b3JJbnB1dC5JRF0sXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTmV3IFNlc3Npb24gY2xvc2VzIHRoZSBzaWRlIHBhbmUgd2hlbiBFbXB0eSBGaWxlcyBpcyBjbG9zZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY3R4ID0gc2V0dXAoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOi9uZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gc3RvcmUuYWRkKGhhcm5lc3MuaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVtcHR5RmlsZUVkaXRvcklucHV0LCBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKSkpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHRzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZU5ld1Nlc3Npb25TdHJhdGVneSwgY3R4LCBjcmVhdGVEZXRhaWxQYW5lbCgpKSk7XG5cdFx0YWN0aXZhdGUoc2Vzc2lvbik7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmxlbmd0aCA9IDA7XG5cdFx0aGFybmVzcy5lZGl0b3JHcm91cHNIYXZlQ29udGVudCA9IGZhbHNlO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yLCBncm91cElkOiAxIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTmV3IFNlc3Npb24gcnVsZXMgYXJlIGluZXJ0IG91dHNpZGUgdGhlIE5ldyBTZXNzaW9uIHZpZXcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3R4ID0gc2V0dXAoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOi9leGlzdGluZycpKTtcblx0XHRjb25zdCBlZGl0b3IgPSBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoVVJJLmZpbGUoJy9yZXBvL2ZpbGUudHMnKSkpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHRzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZU5ld1Nlc3Npb25TdHJhdGVneSwgY3R4LCBjcmVhdGVEZXRhaWxQYW5lbCgpKSk7XG5cdFx0YWN0aXZhdGUoc2Vzc2lvbik7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMubGVuZ3RoID0gMDtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmxlbmd0aCA9IDA7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGggPSAwO1xuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSBmYWxzZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvciwgZ3JvdXBJZDogMSB9KTtcblx0XHRoYXJuZXNzLm9uRGlkVG9nZ2xlU2lkZVBhbmUuZmlyZSh7XG5cdFx0XHRiZWZvcmU6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9LFxuXHRcdFx0YWZ0ZXI6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0sXG5cdFx0fSk7XG5cdFx0aGFybmVzcy5vbldpbGxPcGVuRWRpdG9yLmZpcmUoeyBlZGl0b3IsIGdyb3VwSWQ6IDEgfSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0VtcHR5RmlsZXM6IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNvbWUoaW5wdXQgPT4gaW5wdXQgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCksXG5cdFx0XHRwYXJ0VmlzaWJpbGl0eUNoYW5nZXM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLFxuXHRcdFx0b3BlbmVkVmlld0NvbnRhaW5lcnM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMsXG5cdFx0fSwge1xuXHRcdFx0aGFzRW1wdHlGaWxlczogZmFsc2UsXG5cdFx0XHRwYXJ0VmlzaWJpbGl0eUNoYW5nZXM6IFtdLFxuXHRcdFx0b3BlbmVkVmlld0NvbnRhaW5lcnM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFeGlzdGluZyBTZXNzaW9uIGNsb3NlcyB0aGUgc2lkZSBwYW5lIHdoZW4gaXRzIGxhc3QgZWRpdG9yIGNsb3NlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdHggPSBzZXR1cCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246L2V4aXN0aW5nJykpO1xuXHRcdGNvbnN0IGVkaXRvciA9IHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChVUkkuZmlsZSgnL3JlcG8vZmlsZS50cycpKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdHN0b3JlLmFkZChoYXJuZXNzLmluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFNpbmdsZVBhbmVFeGlzdGluZ1Nlc3Npb25TdHJhdGVneSxcblx0XHRcdGN0eCxcblx0XHRcdGhhcm5lc3MuaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpbmdsZVBhbmVWaXNpYmlsaXR5UHJvZmlsZVN0b3JlKSxcblx0XHRcdGNyZWF0ZURldGFpbFBhbmVsKClcblx0XHQpKTtcblx0XHRhY3RpdmF0ZShzZXNzaW9uKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoID0gMDtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gZmFsc2U7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3IsIGdyb3VwSWQ6IDEgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRXhpc3RpbmcgU2Vzc2lvbiBrZWVwcyB0aGUgc2lkZSBwYW5lIG9wZW4gd2hlbiBtdWx0aXBsZSBzZXNzaW9ucyBhcmUgdmlzaWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjdHggPSBzZXR1cCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246L2V4aXN0aW5nJykpO1xuXHRcdGNvbnN0IG90aGVyU2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjovb3RoZXInKSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KFVSSS5maWxlKCcvcmVwby9maWxlLnRzJykpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5wdXNoKGVkaXRvcik7XG5cdFx0c3RvcmUuYWRkKGhhcm5lc3MuaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0U2luZ2xlUGFuZUV4aXN0aW5nU2Vzc2lvblN0cmF0ZWd5LFxuXHRcdFx0Y3R4LFxuXHRcdFx0aGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZVZpc2liaWxpdHlQcm9maWxlU3RvcmUpLFxuXHRcdFx0Y3JlYXRlRGV0YWlsUGFuZWwoKVxuXHRcdCkpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW3Nlc3Npb24sIG90aGVyU2Vzc2lvbl0sIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoID0gMDtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gZmFsc2U7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3IsIGdyb3VwSWQ6IDEgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1F1aWNrIENoYXQgaGlkZXMgdGhlIHNpZGUgcGFuZSBvbmNlIG9uIGVudHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN0eCA9IHNldHVwKCk7XG5cdFx0Y29uc3QgZWRpdG9yID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KFVSSS5wYXJzZSgnc2VhcmNoLWVkaXRvcjovL291dGdvaW5nJykpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5wdXNoKGVkaXRvcik7XG5cdFx0aGFybmVzcy5lZGl0b3JHcm91cHNIYXZlQ29udGVudCA9IHRydWU7XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IGVkaXRvcjtcblx0XHRzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZVF1aWNrQ2hhdFN0cmF0ZWd5LCBjdHgsIGNyZWF0ZURldGFpbFBhbmVsKCksIGNyZWF0ZVZpc2liaWxpdHlTdG9yZSgpKSk7XG5cdFx0YWN0aXZhdGUobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOi93b3Jrc3BhY2UnKSkpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdGFjdGl2YXRlKG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjovcXVpY2snKSwgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdGhpZGVPcmRlcjogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGNhbGwgPT4gY2FsbC5oaWRkZW4pLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRoaWRlT3JkZXI6IFtcblx0XHRcdFx0eyBwYXJ0OiBQYXJ0cy5FRElUT1JfUEFSVCwgaGlkZGVuOiB0cnVlIH0sXG5cdFx0XHRcdHsgcGFydDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGhpZGRlbjogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5sZW5ndGggPSAwO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1F1aWNrIENoYXQgcmV2ZWFscyBpdHMgcmVzdG9yZWQgZWRpdG9ycyBhZnRlciBsYXlvdXQgcmVzdG9yYXRpb24gc2V0dGxlcycsICgpID0+IHtcblx0XHRoYXJuZXNzID0gY3JlYXRlVGVzdEhhcm5lc3Moc3RvcmUpO1xuXHRcdGNvbnN0IHsgY3R4LCBzdGF0ZSB9ID0gY3JlYXRlU3RyYXRlZ3lUZXN0Q29udGV4dChzdG9yZSwgaGFybmVzcyk7XG5cdFx0Y29uc3QgcXVpY2tDaGF0ID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOi9xdWljaycpLCB7IGlzUXVpY2tDaGF0OiB0cnVlIH0pO1xuXHRcdHN0YXRlLnNldEhhc1NhdmVkV29ya2luZ1NldChxdWlja0NoYXQucmVzb3VyY2UsIHRydWUpO1xuXHRcdGNvbnN0IHZpc2liaWxpdHlTdG9yZSA9IGNyZWF0ZVZpc2liaWxpdHlTdG9yZSgpO1xuXHRcdHZpc2liaWxpdHlTdG9yZS5zZXQoU2Vzc2lvblZpc2liaWxpdHlQcm9maWxlLkV4aXN0aW5nLCB7IGVkaXRvclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSB9KTtcblx0XHRzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZVF1aWNrQ2hhdFN0cmF0ZWd5LCBjdHgsIGNyZWF0ZURldGFpbFBhbmVsKCksIHZpc2liaWxpdHlTdG9yZSkpO1xuXG5cdFx0YWN0aXZhdGUobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOi93b3Jrc3BhY2UnKSkpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRhY3RpdmF0ZShxdWlja0NoYXQpO1xuXHRcdGNvbnN0IHJlc3RvcmVkRWRpdG9yID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KFVSSS5wYXJzZSgnYnJvd3NlcjovL3Jlc3RvcmVkJykpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5wdXNoKHJlc3RvcmVkRWRpdG9yKTtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gdHJ1ZTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gcmVzdG9yZWRFZGl0b3I7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdHN0YXRlLmVuZFNlc3Npb25MYXlvdXRSZXN0b3JlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IFtdLFxuXHRcdH0pO1xuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5sZW5ndGggPSAwO1xuXHRcdHN0YXRlLmVuZFNlc3Npb25MYXlvdXRSZXN0b3JlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUXVpY2sgQ2hhdCByZWNvcmRzIGEgbmV3bHkgb3BlbmVkIGVkaXRvciBiZWZvcmUgaXRzIGZpcnN0IHN3aXRjaCcsICgpID0+IHtcblx0XHRoYXJuZXNzID0gY3JlYXRlVGVzdEhhcm5lc3Moc3RvcmUpO1xuXHRcdGNvbnN0IHsgY3R4LCBzdGF0ZSB9ID0gY3JlYXRlU3RyYXRlZ3lUZXN0Q29udGV4dChzdG9yZSwgaGFybmVzcyk7XG5cdFx0Y29uc3QgbmV3UXVpY2tDaGF0ID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOi9uZXctcXVpY2snKSwgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KTtcblx0XHRjb25zdCByZXN0b3JlZFF1aWNrQ2hhdCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjovcmVzdG9yZWQtcXVpY2snKSwgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KTtcblx0XHRzdGF0ZS5zZXRIYXNTYXZlZFdvcmtpbmdTZXQocmVzdG9yZWRRdWlja0NoYXQucmVzb3VyY2UsIHRydWUpO1xuXHRcdGNvbnN0IHZpc2liaWxpdHlTdG9yZSA9IGNyZWF0ZVZpc2liaWxpdHlTdG9yZSgpO1xuXHRcdHZpc2liaWxpdHlTdG9yZS5zZXQoU2Vzc2lvblZpc2liaWxpdHlQcm9maWxlLkV4aXN0aW5nLCB7IGVkaXRvclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSB9KTtcblx0XHRzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZVF1aWNrQ2hhdFN0cmF0ZWd5LCBjdHgsIGNyZWF0ZURldGFpbFBhbmVsKCksIHZpc2liaWxpdHlTdG9yZSkpO1xuXG5cdFx0YWN0aXZhdGUobmV3UXVpY2tDaGF0KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGNvbnN0IG9wZW5lZEVkaXRvciA9IHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChVUkkucGFyc2UoJ2Jyb3dzZXI6Ly9uZXcnKSkpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2gob3BlbmVkRWRpdG9yKTtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gdHJ1ZTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gb3BlbmVkRWRpdG9yO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblxuXHRcdGFjdGl2YXRlKHJlc3RvcmVkUXVpY2tDaGF0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLFxuXHRcdFx0c2hhcmVkVmlzaWJpbGl0eTogdmlzaWJpbGl0eVN0b3JlLmdldChTZXNzaW9uVmlzaWJpbGl0eVByb2ZpbGUuRXhpc3RpbmcpLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdHNoYXJlZFZpc2liaWxpdHk6IHsgZWRpdG9yVmlzaWJsZTogdHJ1ZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUXVpY2sgQ2hhdCBzaGFyZXMgc2lkZS1wYW5lIHZpc2liaWxpdHkgd2l0aG91dCBwZXJzaXN0aW5nIGFuIGVkaXRvcmxlc3MgaGlkZScsICgpID0+IHtcblx0XHRoYXJuZXNzID0gY3JlYXRlVGVzdEhhcm5lc3Moc3RvcmUpO1xuXHRcdGNvbnN0IHsgY3R4LCBzdGF0ZSB9ID0gY3JlYXRlU3RyYXRlZ3lUZXN0Q29udGV4dChzdG9yZSwgaGFybmVzcyk7XG5cdFx0Y29uc3QgZW1wdHlRdWlja0NoYXQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246L2VtcHR5LXF1aWNrJyksIHsgaXNRdWlja0NoYXQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgZWRpdG9yUXVpY2tDaGF0ID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOi9lZGl0b3ItcXVpY2snKSwgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KTtcblx0XHRzdGF0ZS5zZXRIYXNTYXZlZFdvcmtpbmdTZXQoZWRpdG9yUXVpY2tDaGF0LnJlc291cmNlLCB0cnVlKTtcblx0XHRjb25zdCB2aXNpYmlsaXR5U3RvcmUgPSBjcmVhdGVWaXNpYmlsaXR5U3RvcmUoKTtcblx0XHR2aXNpYmlsaXR5U3RvcmUuc2V0KFNlc3Npb25WaXNpYmlsaXR5UHJvZmlsZS5FeGlzdGluZywgeyBlZGl0b3JWaXNpYmxlOiBmYWxzZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlUGFuZVF1aWNrQ2hhdFN0cmF0ZWd5LCBjdHgsIGNyZWF0ZURldGFpbFBhbmVsKCksIHZpc2liaWxpdHlTdG9yZSkpO1xuXG5cdFx0YWN0aXZhdGUobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOi93b3Jrc3BhY2UnKSkpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdGFjdGl2YXRlKGVtcHR5UXVpY2tDaGF0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLFxuXHRcdFx0c2hhcmVkVmlzaWJpbGl0eTogdmlzaWJpbGl0eVN0b3JlLmdldChTZXNzaW9uVmlzaWJpbGl0eVByb2ZpbGUuRXhpc3RpbmcpLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRzaGFyZWRWaXNpYmlsaXR5OiB7IGVkaXRvclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlIH0sXG5cdFx0fSk7XG5cblx0XHRhY3RpdmF0ZShlZGl0b3JRdWlja0NoYXQpO1xuXHRcdGNvbnN0IHJlc3RvcmVkRWRpdG9yID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KFVSSS5wYXJzZSgnYnJvd3NlcjovL3Jlc3RvcmVkJykpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5wdXNoKHJlc3RvcmVkRWRpdG9yKTtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gdHJ1ZTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gcmVzdG9yZWRFZGl0b3I7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdHN0YXRlLmVuZFNlc3Npb25MYXlvdXRSZXN0b3JlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyxcblx0XHRcdHNoYXJlZFZpc2liaWxpdHk6IHZpc2liaWxpdHlTdG9yZS5nZXQoU2Vzc2lvblZpc2liaWxpdHlQcm9maWxlLkV4aXN0aW5nKSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW10sXG5cdFx0XHRzaGFyZWRWaXNpYmlsaXR5OiB7IGVkaXRvclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlIH0sXG5cdFx0fSk7XG5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpc2liaWxpdHlTdG9yZS5nZXQoU2Vzc2lvblZpc2liaWxpdHlQcm9maWxlLkV4aXN0aW5nKSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWE7QUFFdEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyx5Q0FBeUM7QUFFbEQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywwQkFBMEIsd0NBQXdDO0FBQzNFLFNBQVMsbUJBQXVELGFBQWEsMkJBQTJCO0FBU3hHLFNBQVMsMEJBQTBCLE9BQXdCLFNBQTRHO0FBQ3RLLFFBQU0sK0JBQStCLE1BQU0sSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUNsRSxRQUFNLG1CQUFtQixvQkFBSSxJQUFZO0FBQ3pDLFFBQU0sUUFBMkI7QUFBQSxJQUNoQywwQkFBMEI7QUFBQSxJQUMxQixrQkFBa0I7QUFBQSxJQUNsQix1QkFBdUIsQ0FBQyxpQkFBaUIsdUJBQXVCO0FBQy9ELFlBQU0sTUFBTSxnQkFBZ0IsU0FBUztBQUNyQyxVQUFJLG9CQUFvQjtBQUN2Qix5QkFBaUIsSUFBSSxHQUFHO0FB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
