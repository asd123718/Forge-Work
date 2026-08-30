import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { transaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isIMenuItem, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { MainEditorAreaVisibleContext } from "../../../../../workbench/common/contextkeys.js";
import { StorageScope, WillSaveStateReason } from "../../../../../platform/storage/common/storage.js";
import { Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { ViewContainerLocation } from "../../../../../workbench/common/views.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { SinglePaneChangesTabAvailableContext, SinglePaneChangesTabMissingContext, HasDockedDetailsContext, SinglePaneFilesTabAvailableContext, SinglePaneFilesTabMissingContext } from "../../../../common/contextkeys.js";
import { Menus } from "../../../../browser/menus.js";
import { BrowserEditorInput } from "../../../../../workbench/contrib/browserView/common/browserEditorInput.js";
import { FileEditorInput } from "../../../../../workbench/contrib/files/browser/editors/fileEditorInput.js";
import { MultiDiffEditorInput } from "../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js";
import { WebviewInput } from "../../../../../workbench/contrib/webviewPanel/browser/webviewEditorInput.js";
import { EmptyFileEditorInput } from "../../../editor/browser/emptyFileEditorInput.js";
import { DiffEditorInput } from "../../../../../workbench/common/editor/diffEditorInput.js";
import { isResourceEditorInput } from "../../../../../workbench/common/editor.js";
import { LayoutController } from "../../browser/desktopSessionLayoutController.js";
import { SinglePaneLayoutController, TOGGLE_DETAILS_COMMAND_ID } from "../../browser/singlePaneLayoutController.js";
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from "../../../changes/common/changes.js";
import "../../../changes/browser/changesActions.js";
import { SESSIONS_FILES_CONTAINER_ID } from "../../../files/browser/files.contribution.js";
import { NewChangesTabAction, NewFileTabAction } from "../../../editor/browser/addTabActions.js";
import { createTestHarness, makeChange, makeSession, TestStubEditorInput } from "./layoutControllerTestUtils.js";
suite("LayoutController (desktop)", () => {
  const store = new DisposableStore();
  let harness;
  class TestLayoutController extends LayoutController {
    constructor() {
      super(...arguments);
      this.sidePaneToggles = [];
    }
    get isTogglingSidePane() {
      return this._togglingSidePane;
    }
    _onSidePaneToggled(collapsed, previousAuxiliaryBarVisible, auxiliaryBarVisible) {
      this.sidePaneToggles.push({ collapsed, previousAuxiliaryBarVisible, auxiliaryBarVisible });
      super._onSidePaneToggled(collapsed, previousAuxiliaryBarVisible, auxiliaryBarVisible);
    }
    getViewState(sessionResource) {
      return this._viewStateBySession.get(sessionResource);
    }
    getEditorPartHidden(sessionResource) {
      return this._editorPartHiddenBySession.get(sessionResource);
    }
    runWithRestore(work) {
      this._withSessionLayoutRestore(work);
    }
  }
  class TestSinglePaneController extends SinglePaneLayoutController {
    /** Runs `work` while a session-switch layout restore is held (see `_withSessionLayoutRestore`). */
    runWithRestore(work) {
      this._withSessionLayoutRestore(work);
    }
    getViewState(sessionResource) {
      return this._viewStateBySession.get(sessionResource);
    }
    getEditorPartHidden(sessionResource) {
      return this._editorPartHiddenBySession.get(sessionResource);
    }
  }
  function createController(options = {}) {
    harness = createTestHarness(store, options);
    return store.add(harness.instaService.createInstance(TestLayoutController));
  }
  function createSinglePaneController(options = {}) {
    harness = createTestHarness(store, options);
    return store.add(harness.instaService.createInstance(TestSinglePaneController));
  }
  function makeFileEditor(path = "/repo/package.json") {
    const fileEditor = Object.create(FileEditorInput.prototype);
    Object.defineProperty(fileEditor, "resource", { value: URI.file(path) });
    return fileEditor;
  }
  function makeDiffEditor() {
    return Object.create(DiffEditorInput.prototype);
  }
  function makeMultiDiffEditor() {
    return Object.create(MultiDiffEditorInput.prototype);
  }
  function makeWebviewEditor(viewType, providerId) {
    const editor = Object.create(WebviewInput.prototype);
    Object.defineProperty(editor, "viewType", { value: viewType });
    Object.defineProperty(editor, "providerId", { value: providerId });
    return editor;
  }
  function openEditor(editor) {
    const event = { groupId: 1, editor };
    harness.onWillOpenEditor.fire(event);
  }
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("[D3c] hides side pane for existing session without saved state", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "side pane should be hidden"
    );
    assert.ok(!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID), "should not auto-open the Files view");
  });
  test("[D6] does not auto-open side pane for existing session with changes", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), {
      changes: [makeChange("/file.ts")]
    });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "side pane should be hidden"
    );
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), "should not auto-open the Changes view");
  });
  test("[D3b] shows files view for untitled session", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
  });
  test("[D3d] defaults to Files while the session has no changes", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(session, void 0);
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: true,
      openedChanges: false
    });
  });
  test("[D3d] defaults to Changes once one of the session chats has a change", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), {
      status: SessionStatus.Untitled,
      changes: [makeChange("/file.ts")]
    });
    harness.activeSessionObs.set(session, void 0);
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: false,
      openedChanges: true
    });
  });
  test("[D3d] does not switch a side pane that is already showing Files when a change lands", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(session, void 0);
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.openedViews = [];
    harness.openedViewContainers = [];
    session.changes.set([makeChange("/file.ts")], void 0);
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: false,
      openedChanges: false
    });
  });
  test("[D3d] does not force-open Files when the Files pane is hidden", () => {
    createController();
    harness.pinnedAuxiliaryBarContainerIds = [CHANGES_VIEW_CONTAINER_ID];
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not open the hidden Files pane"
    );
    assert.ok(
      harness.openedViews.includes(CHANGES_VIEW_ID),
      "should fall back to Changes when Files is hidden"
    );
  });
  test("[D3a] does not open views when session has no workspace", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), {
      workspace: { uri: URI.file("/repo"), label: "test", icon: Codicon.repo, folders: [], requiresWorkspaceTrust: false, isVirtualWorkspace: false }
    });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID));
  });
  test("[D1] remembers aux bar hidden state on session switch", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.activeSessionObs.set(session2, void 0);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(session1, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should be hidden when returning to session 1"
    );
  });
  test("[D1] remembers active view container on session switch", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    harness.activePaneCompositeId = "some.custom.view";
    harness.pinnedAuxiliaryBarContainerIds = [...harness.pinnedAuxiliaryBarContainerIds, "some.custom.view"];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.activeSessionObs.set(session2, void 0);
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(session1, void 0);
    assert.ok(
      harness.openedViewContainers.includes("some.custom.view"),
      "should restore active view container when returning to session 1"
    );
  });
  test("[D3c] restores an explicit Files choice on session switch even when the session has changes", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"), { changes: [makeChange("/file.ts")] });
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.activeSessionObs.set(session2, void 0);
    harness.openedViewContainers = [];
    harness.openedViews = [];
    harness.activeSessionObs.set(session1, void 0);
    assert.ok(
      harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should restore the user's explicit Files choice"
    );
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID),
      "should not override the explicit Files choice with Changes"
    );
  });
  test("[single-pane] keeps editor and detail visibility unchanged when switching sessions", async () => {
    createSinglePaneController();
    const sessionA = makeSession(URI.parse("session:a"));
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionA, void 0);
    harness.visibleSessionsObs.set([sessionA], void 0);
    await timeout(0);
    harness.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(sessionB, void 0);
    harness.visibleSessionsObs.set([sessionB], void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      visibilityRestores: harness.setPartHiddenCalls.filter((call) => call.part === Parts.EDITOR_PART || call.part === Parts.AUXILIARYBAR_PART)
    }, {
      editorVisible: true,
      detailVisible: false,
      visibilityRestores: []
    });
  });
  test("[single-pane] restores the detail panel after a browser tab hides it", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const hasDockedDetails = () => harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key);
    assert.strictEqual(hasDockedDetails(), false, "hidden target should clear the editor chevron context");
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.strictEqual(hasDockedDetails(), true, "changes target should enable the editor chevron context");
    const browserEditor = Object.create(BrowserEditorInput.prototype);
    Object.defineProperty(browserEditor, "resource", { value: URI.parse("browser://test") });
    harness.activeEditorInput = browserEditor;
    harness.onDidActiveEditorChange.fire();
    assert.strictEqual(hasDockedDetails(), false, "browser target should clear the editor chevron context");
    await timeout(0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "browser tabs should hide the detail panel"
    );
    harness.activeSessionObs.set(makeSession(URI.parse("session:2")), void 0);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeEditorInput = store.add(new EmptyFileEditorInput(void 0, harness.layoutService));
    harness.onDidActiveEditorChange.fire();
    assert.strictEqual(hasDockedDetails(), true, "files target should enable the editor chevron context");
    await timeout(0);
    assert.strictEqual(
      harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      true,
      "file tabs should leave the restored detail panel visible"
    );
    assert.ok(
      harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "file tabs should reopen the Files container after browser hides it"
    );
    harness.activeEditorInput = store.add(new TestStubEditorInput(URI.parse("search-editor://test")));
    harness.onDidActiveEditorChange.fire();
    assert.strictEqual(hasDockedDetails(), false, "search target should clear the editor chevron context");
  });
  test("[single-pane] clears docked-details context when no session is active", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await timeout(0);
    assert.strictEqual(harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key), true);
    harness.activeSessionObs.set(void 0, void 0);
    await timeout(0);
    assert.strictEqual(harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key), false);
  });
  test("[single-pane] Hide Editor while a Browser tab is active shows the Changes/Files fallback instead of hiding it again", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const hasDockedDetails = () => harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    const browserEditor = Object.create(BrowserEditorInput.prototype);
    Object.defineProperty(browserEditor, "resource", { value: URI.parse("browser://test") });
    harness.activeEditorInput = browserEditor;
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.strictEqual(harness.partVisibility.get(Parts.AUXILIARYBAR_PART), false, "browser tab should hide the detail panel while the editor area is visible");
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
    harness.layoutService.setPartHidden(true, Parts.EDITOR_PART);
    await timeout(0);
    assert.strictEqual(harness.partVisibility.get(Parts.AUXILIARYBAR_PART), true, "the detail panel must stay revealed once the editor area is hidden, not be forced shut again");
    assert.strictEqual(hasDockedDetails(), true, "the Changes/Files fallback should enable the editor chevron context");
    assert.ok(harness.openedViewContainers.includes(CHANGES_VIEW_CONTAINER_ID), "a created session should fall back to the Changes container");
    harness.setPartHiddenCalls = [];
    harness.layoutService.setPartHidden(false, Parts.EDITOR_PART);
    await timeout(0);
    assert.strictEqual(harness.partVisibility.get(Parts.AUXILIARYBAR_PART), false, "the detail panel should hide again once Browser is active with the editor area visible");
  });
  test("[single-pane] hides the detail panel when the main editor part is empty and keeps it closed on tab open", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const hasDockedDetails = () => harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    assert.strictEqual(hasDockedDetails(), true, "non-empty no-active-editor fallback should keep contextual detail active");
    harness.setPartHiddenCalls = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.editorGroupsHaveContent = false;
    harness.activeEditorInput = void 0;
    harness.onDidEditorsChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      hasDockedDetails: hasDockedDetails(),
      hiddenCalls: harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true).length
    }, {
      hasDockedDetails: false,
      hiddenCalls: 1
    });
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.editorGroupsHaveContent = true;
    harness.activeEditorInput = makeFileEditor();
    harness.onDidEditorsChange.fire();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      hasDockedDetails: hasDockedDetails(),
      reveals: harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID)
    }, {
      hasDockedDetails: true,
      reveals: 1,
      openedFiles: true
    });
  });
  test("[cmd+n] keeps the detail panel visible for a new-session view with a transiently empty editor group", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.editorGroupsHaveContent = false;
    harness.activeEditorInput = void 0;
    harness.onDidEditorsChange.fire();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true).length,
      0
    );
  });
  test("[single-pane] keeps the detail panel closed by default when a file/changes editor is active", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeEditorInput = makeFileEditor();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      reveals: harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID)
    }, {
      reveals: 0,
      openedFiles: false
    });
  });
  test("[single-pane] maps all diff editors to Changes and all file editors to Files", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    await timeout(0);
    const openedContainers = [];
    for (const editor of [makeDiffEditor(), makeMultiDiffEditor(), makeFileEditor("/outside/repo.txt")]) {
      harness.openedViewContainers = [];
      harness.activeEditorInput = editor;
      harness.onDidActiveEditorChange.fire();
      await timeout(0);
      openedContainers.push(harness.openedViewContainers[harness.openedViewContainers.length - 1]);
    }
    assert.deepStrictEqual(openedContainers, [
      CHANGES_VIEW_CONTAINER_ID,
      CHANGES_VIEW_CONTAINER_ID,
      SESSIONS_FILES_CONTAINER_ID
    ]);
  });
  test("[single-pane] applies the active editor detail when the hidden detail panel is reopened", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.activeEditorInput = makeFileEditor();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    harness.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    harness.openedViewContainers = [];
    harness.activeEditorInput = makeDiffEditor();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    const openedWhileHidden = [...harness.openedViewContainers];
    harness.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
    await timeout(0);
    assert.deepStrictEqual({
      openedWhileHidden,
      openedAfterReveal: harness.openedViewContainers
    }, {
      openedWhileHidden: [],
      openedAfterReveal: [CHANGES_VIEW_CONTAINER_ID]
    });
  });
  test("[single-pane] maps Markdown preview editors to Files", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    await timeout(0);
    const openedContainers = [];
    for (const [viewType, providerId] of [
      ["mainThreadWebview-markdown.preview", "markdown.preview"],
      ["vscode.markdown.editor", void 0],
      ["vscode.markdown.preview.editor", void 0]
    ]) {
      harness.openedViewContainers = [];
      harness.activeEditorInput = makeWebviewEditor(viewType, providerId);
      harness.onDidActiveEditorChange.fire();
      await timeout(0);
      openedContainers.push(harness.openedViewContainers[harness.openedViewContainers.length - 1]);
    }
    assert.deepStrictEqual(openedContainers, [
      SESSIONS_FILES_CONTAINER_ID,
      SESSIONS_FILES_CONTAINER_ID,
      SESSIONS_FILES_CONTAINER_ID
    ]);
  });
  test("[single-pane] does not force-reveal the detail on editor activation, during or after a restore", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    await timeout(0);
    let releaseRestore;
    const restoreGate = new Promise((resolve) => {
      releaseRestore = resolve;
    });
    controller.runWithRestore(() => restoreGate);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeEditorInput = makeFileEditor();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      0,
      "the detail must stay closed during a session-switch restore"
    );
    releaseRestore();
    await restoreGate;
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.activeEditorInput = makeFileEditor();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      0,
      "the detail stays closed by default after the restore"
    );
  });
  test("[Scenario C] does not re-reveal the detail on reload when the whole side pane was closed", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeEditorInput = store.add(new EmptyFileEditorInput(void 0, harness.layoutService));
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.strictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false).length,
      0
    );
  });
  test("[single-pane] carries an open side pane to the next session instead of restoring stale session state", async () => {
    createSinglePaneController({ activateAux: true, revealAuxiliaryBarOnOpen: true, workspaceFolders: [{ uri: URI.file("/repo") }] });
    await timeout(0);
    const sessionA = makeSession(URI.parse("session:a"));
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionA, void 0);
    harness.visibleSessionsObs.set([sessionA], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(sessionB, void 0);
    harness.visibleSessionsObs.set([sessionB], void 0);
    await timeout(0);
    assert.deepStrictEqual({
      aux: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      editor: harness.partVisibility.get(Parts.EDITOR_PART)
    }, {
      aux: true,
      editor: true
    });
  });
  test("[single-pane] retains the shared Existing profile through transient editor restoration on Existing-to-Existing navigation", async () => {
    const controller = createSinglePaneController({
      activateAux: true,
      workspaceFolders: [{ uri: URI.file("/repo") }],
      sidePaneVisibilityState: {
        newSession: { editorVisible: false, auxiliaryBarVisible: true },
        existingSession: { editorVisible: true, auxiliaryBarVisible: true }
      }
    });
    await timeout(0);
    const sessionA = makeSession(URI.parse("session:a"));
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionA, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onApplyWorkingSet = () => {
      harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
      harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
      harness.editorGroupsHaveContent = false;
      harness.onDidEditorsChange.fire();
    };
    harness.activeSessionObs.set(sessionB, void 0);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.editorGroupsHaveContent = true;
    harness.onDidEditorsChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      auxiliaryBarReveals: harness.setPartHiddenCalls.filter((call) => call.part === Parts.AUXILIARYBAR_PART && !call.hidden).length,
      perSessionViewState: controller.getViewState(sessionB.resource)
    }, {
      editorVisible: true,
      auxiliaryBarVisible: false,
      auxiliaryBarReveals: 0,
      perSessionViewState: void 0
    });
  });
  test("[single-pane] switches Existing detail content only after the incoming editor restore settles", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await settle();
    const sessionA = makeSession(URI.parse("session:a"));
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionA, void 0);
    harness.activeEditorInput = makeFileEditor();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onDidActiveEditorChange.fire();
    await settle();
    let releaseRestore;
    const restoreGate = new Promise((resolve) => releaseRestore = resolve);
    controller.runWithRestore(() => restoreGate);
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(sessionB, void 0);
    harness.activeEditorInput = store.add(new TestStubEditorInput(harness.sessionChangesService.getChangesEditorResource(sessionB.resource)));
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual(
      harness.openedViewContainers,
      [CHANGES_VIEW_CONTAINER_ID],
      "a concrete incoming editor may select its content before restore-end without opening outgoing Files"
    );
    releaseRestore();
    await restoreGate;
    await settle();
    assert.ok(!harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    assert.strictEqual(harness.openedViewContainers.at(-1), CHANGES_VIEW_CONTAINER_ID);
  });
  test("[single-pane] persists resize-driven Details visibility for Existing Sessions", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    harness.activeSessionObs.set(makeSession(URI.parse("session:existing")), void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false, source: "resize" });
    assert.deepStrictEqual(
      JSON.parse(harness.storageService.get("sessions.singlePane.sidePaneVisibility", StorageScope.WORKSPACE) ?? ""),
      {
        newSession: { editorVisible: false, auxiliaryBarVisible: true },
        existingSession: { editorVisible: true, auxiliaryBarVisible: false }
      }
    );
  });
  test("[B2] captures editor-part hidden state eagerly when the user closes the side pane", () => {
    const controller = createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    setPartVisible(Parts.EDITOR_PART, false);
    assert.strictEqual(
      controller.getEditorPartHidden(session.resource),
      true,
      "editor-part hidden must be captured at the moment the user closes it"
    );
    setPartVisible(Parts.EDITOR_PART, true);
    assert.strictEqual(
      controller.getEditorPartHidden(session.resource),
      false,
      "editor-part hidden must update when the user reopens it"
    );
  });
  test("[B2] a later transient editor reveal does not overwrite a session's captured closed state during a switch", () => {
    const controller = createController();
    const sessionA = makeSession(URI.parse("session:a"));
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionA, void 0);
    setPartVisible(Parts.EDITOR_PART, false);
    assert.strictEqual(controller.getEditorPartHidden(sessionA.resource), true);
    controller.runWithRestore(() => {
      harness.activeSessionObs.set(sessionB, void 0);
      setPartVisible(Parts.EDITOR_PART, true);
    });
    assert.strictEqual(
      controller.getEditorPartHidden(sessionA.resource),
      true,
      "a restore-driven editor reveal must not overwrite session A's captured closed state"
    );
  });
  test("[D4] keeps the open side pane on its current view when a new session is submitted", () => {
    const controller = createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.setPartHiddenCalls = [];
    harness.openedViews = [];
    session.isCreated.set(true, void 0);
    assert.deepStrictEqual({
      hidden: harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
      viewState: controller.getViewState(session.resource)
    }, {
      hidden: false,
      openedChanges: false,
      viewState: {
        auxiliaryBarVisible: true,
        auxiliaryBarActiveViewContainerId: SESSIONS_FILES_CONTAINER_ID
      }
    });
  });
  test("[D4] keeps the side pane closed when a new session is submitted with the aux bar hidden", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.setPartHiddenCalls = [];
    harness.openedViews = [];
    session.isCreated.set(true, void 0);
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
      "side pane should stay closed after the new session is submitted"
    );
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID),
      "Changes view should not be shown when the aux bar is hidden"
    );
  });
  test("[D4] shows Files when a hidden side pane is opened after a change-free session is submitted", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    session.isCreated.set(true, void 0);
    harness.openedViewContainers = [];
    harness.openedViews = [];
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: true,
      openedChanges: false
    });
  });
  test("[D4] shows Changes when a hidden side pane is opened after the session produced a change", () => {
    createController();
    const session = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    session.isCreated.set(true, void 0);
    session.changes.set([makeChange("/file.ts")], void 0);
    harness.openedViewContainers = [];
    harness.openedViews = [];
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: false,
      openedChanges: true
    });
  });
  test("[D4] records Files when a change-free session falls back from an invalid saved container", () => {
    const session = makeSession(URI.parse("session:1"));
    const controller = createController({
      layoutState: [{
        sessionResource: session.resource.toString(),
        viewState: {
          auxiliaryBarVisible: false,
          auxiliaryBarActiveViewContainerId: "missing.view"
        }
      }]
    });
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      viewState: controller.getViewState(session.resource)
    }, {
      openedFiles: true,
      viewState: {
        auxiliaryBarVisible: true,
        auxiliaryBarActiveViewContainerId: SESSIONS_FILES_CONTAINER_ID
      }
    });
  });
  test("[D4] records Changes when a session with changes falls back from an invalid saved container", () => {
    const session = makeSession(URI.parse("session:1"), { changes: [makeChange("/file.ts")] });
    const controller = createController({
      layoutState: [{
        sessionResource: session.resource.toString(),
        viewState: {
          auxiliaryBarVisible: false,
          auxiliaryBarActiveViewContainerId: "missing.view"
        }
      }]
    });
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual({
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID),
      viewState: controller.getViewState(session.resource)
    }, {
      openedChanges: true,
      viewState: {
        auxiliaryBarVisible: true,
        auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID
      }
    });
  });
  test("[D4] remembers Files when the user chooses it after the session is submitted", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"), { status: SessionStatus.Untitled, isCreated: false });
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    session1.isCreated.set(true, void 0);
    harness.activePaneCompositeId = SESSIONS_FILES_CONTAINER_ID;
    harness.activeSessionObs.set(session2, void 0);
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(session1, void 0);
    assert.deepStrictEqual({
      openedFiles: harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      openedChanges: harness.openedViews.includes(CHANGES_VIEW_ID)
    }, {
      openedFiles: true,
      openedChanges: false
    });
  });
  test("[D2] remembers hidden aux bar across new (untitled) sessions", () => {
    createController();
    const untitled1 = makeSession(URI.parse("session:untitled1"), { status: SessionStatus.Untitled });
    const existing = makeSession(URI.parse("session:existing"));
    const untitled2 = makeSession(URI.parse("session:untitled2"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled1, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.activeSessionObs.set(existing, void 0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(untitled2, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should stay hidden on the next new session"
    );
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not re-open the Files view on the next new session"
    );
  });
  test("[D2] persists hidden new-session aux bar to storage and restores it after reload", () => {
    createController();
    const untitled1 = makeSession(URI.parse("session:untitled1"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled1, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    assert.deepStrictEqual(
      JSON.parse(harness.storageService.get("sessions.newSessionViewState", StorageScope.WORKSPACE) ?? ""),
      { auxiliaryBarVisible: false },
      "state should be persisted to storage"
    );
    store.clear();
    createController({ newSessionViewState: { auxiliaryBarVisible: false } });
    const untitled2 = makeSession(URI.parse("session:untitled2"), { status: SessionStatus.Untitled });
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(untitled2, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should stay hidden after reload"
    );
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not re-open the Files view after reload"
    );
  });
  test("[D3b] ignores malformed persisted new-session state and does not force-hide the aux bar", () => {
    createController({ newSessionViewStateRaw: JSON.stringify({ foo: "bar" }) });
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled, void 0);
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "malformed state must not force-hide the aux bar"
    );
    assert.ok(
      harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should fall back to the default Files view"
    );
    assert.strictEqual(
      harness.storageService.get("sessions.newSessionViewState", StorageScope.WORKSPACE),
      void 0,
      "malformed state should be removed from storage"
    );
  });
  test("[D6] does not re-reveal aux bar after user hides it when session changes state updates", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.setPartHiddenCalls = [];
    session.changes.set([makeChange("/file.ts")], void 0);
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID) && !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "aux bar must stay hidden after the user hid it, even when changes appear"
    );
  });
  test("[D9] Toggle Side Panel command calls the workbench layout service directly", async () => {
    createController();
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    const handler = CommandsRegistry.getCommand("workbench.action.agentToggleSidePanel")?.handler;
    assert.ok(handler, "Toggle Side Panel command should be registered");
    await handler(harness.instaService);
    assert.deepStrictEqual({
      toggleSidePaneCalls: harness.toggleSidePaneCalls,
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, {
      toggleSidePaneCalls: 1,
      editorVisible: false,
      auxiliaryBarVisible: false
    });
  });
  test("[D9] controller derives the toggling state from workbench events", () => {
    const controller = createController();
    const togglingStates = [];
    store.add(harness.onDidChangePartVisibility.event(() => togglingStates.push(controller.isTogglingSidePane)));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.layoutService.toggleSidePane();
    assert.deepStrictEqual({
      togglingStates,
      afterToggle: controller.isTogglingSidePane
    }, {
      togglingStates: [true, true],
      afterToggle: false
    });
  });
  test("[D9b] closing the whole side pane on a new session keeps it closed for the next new session", () => {
    createController();
    const untitled1 = makeSession(URI.parse("session:untitled1"), { status: SessionStatus.Untitled });
    const existing = makeSession(URI.parse("session:existing"));
    const untitled2 = makeSession(URI.parse("session:untitled2"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled1, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.layoutService.toggleSidePane();
    assert.deepStrictEqual(
      JSON.parse(harness.storageService.get("sessions.newSessionViewState", StorageScope.WORKSPACE) ?? ""),
      { auxiliaryBarVisible: false },
      "closing the whole side pane on a new session should record the closed choice"
    );
    harness.activeSessionObs.set(existing, void 0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(untitled2, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should stay hidden on the next new session"
    );
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not re-open the Files view on the next new session"
    );
  });
  test("[D9b] closing the whole side pane while composing a new session does not reopen it when the session re-syncs", () => {
    createController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled });
    const other = makeSession(URI.parse("session:other"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled, void 0);
    assert.ok(harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.layoutService.toggleSidePane();
    harness.visibleSessionsObs.set([untitled, other], void 0);
    harness.setPartHiddenCalls = [];
    harness.openedViewContainers = [];
    harness.visibleSessionsObs.set([untitled], void 0);
    assert.ok(
      !harness.openedViewContainers.includes(SESSIONS_FILES_CONTAINER_ID),
      "should not reopen the Files view when the same new session re-syncs"
    );
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should stay hidden when the same new session re-syncs"
    );
  });
  test("[D8] reveals the Changes view the first time a Changes editor is opened, then remembers the choice", () => {
    createController({ revealAuxiliaryBarOnOpen: true });
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    harness.onDidActiveEditorChange.fire();
    assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), "first Changes open should reveal the Changes view");
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.openedViews = [];
    harness.onDidActiveEditorChange.fire();
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), "later Changes opens should not re-reveal the side pane");
  });
  test("[D9] closing the whole side pane is not remembered, so reopening Changes reveals it again", () => {
    createController({ revealAuxiliaryBarOnOpen: true });
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidActiveEditorChange.fire();
    assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), "first Changes open should reveal the Changes view");
    harness.layoutService.toggleSidePane();
    harness.openedViews = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    assert.ok(harness.openedViews.includes(CHANGES_VIEW_ID), "reopening Changes after closing the whole side pane should reveal the Changes view again");
  });
  test("[D9] reopening the side pane restores the parts that were visible when it was closed", () => {
    createController();
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    const visibleAfterClose = harness.layoutService.toggleSidePane();
    assert.strictEqual(visibleAfterClose, false, "side pane should be hidden after closing");
    assert.ok(harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true), "aux bar should be hidden");
    assert.ok(harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === true), "editor should be hidden");
    harness.setPartHiddenCalls.length = 0;
    const visibleAfterOpen = harness.layoutService.toggleSidePane();
    assert.strictEqual(visibleAfterOpen, true, "side pane should be visible after reopening");
    assert.ok(harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false), "editor should be restored");
    assert.ok(harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false), "aux bar should be restored");
  });
  test("[D9] reopening reports the resulting auxiliary bar visibility", () => {
    const controller = createController();
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.layoutService.toggleSidePane();
    assert.deepStrictEqual(controller.sidePaneToggles, [{
      collapsed: false,
      previousAuxiliaryBarVisible: false,
      auxiliaryBarVisible: true
    }]);
  });
  test("[D9] closing a maximized single-pane exits maximize and hides both parts", () => {
    createSinglePaneController({ singlePaneLayoutEnabled: true });
    harness.editorMaximized = true;
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.layoutService.toggleSidePane();
    assert.deepStrictEqual({
      setEditorMaximizedCalls: harness.setEditorMaximizedCalls,
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, {
      setEditorMaximizedCalls: [false],
      editorVisible: false,
      auxiliaryBarVisible: false
    });
  });
  test("[reopen default single-pane] a created session opens the side pane to the editor with the detail closed", () => {
    createSinglePaneController({ singlePaneLayoutEnabled: true });
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    harness.editorGroupsHaveContent = true;
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.layoutService.toggleSidePane();
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, { editorVisible: true, detailVisible: false });
  });
  test("[reopen default single-pane] a new-session view restores the Files detail from remembered parts", () => {
    createSinglePaneController({ singlePaneLayoutEnabled: true });
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    harness.editorGroupsHaveContent = true;
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.layoutService.toggleSidePane();
    harness.setPartHiddenCalls = [];
    harness.layoutService.toggleSidePane();
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, { editorVisible: false, detailVisible: true });
  });
  test("[D8] does not reveal the Changes view for an untitled session", () => {
    createController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled });
    harness.activeSessionObs.set(untitled, void 0);
    harness.openedViews = [];
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(untitled.resource);
    harness.onDidActiveEditorChange.fire();
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), "untitled sessions are governed by D3b/D4, not D8");
  });
  test("[single-pane] entering a new-session view hides only Editor when Empty Files is the only input", async () => {
    createSinglePaneController({ activateAux: true });
    await timeout(0);
    const existing = makeSession(URI.parse("session:existing"));
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(existing, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      visibilityRestores: harness.setPartHiddenCalls.filter((call) => call.part === Parts.EDITOR_PART || call.part === Parts.AUXILIARYBAR_PART)
    }, {
      editorVisible: false,
      detailVisible: false,
      visibilityRestores: [
        { part: Parts.EDITOR_PART, hidden: true }
      ]
    });
  });
  test("[single-pane] New Session opening rule does not re-run after a real editor opens", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    assert.strictEqual(harness.partVisibility.get(Parts.EDITOR_PART), false);
    const realEditor = store.add(new TestStubEditorInput(URI.file("/repo/a.ts")));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    openEditor(realEditor);
    harness.activeGroupEditors.push(realEditor);
    harness.onDidEditorsChange.fire();
    await settle();
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(realEditor), 1);
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(harness.partVisibility.get(Parts.EDITOR_PART), true);
  });
  test("[single-pane] reopening the side pane after closing Empty Files restores dock-only Files", async () => {
    createSinglePaneController({ activateAux: true, singlePaneLayoutEnabled: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    const filesTab = harness.activeGroupEditors.find((editor) => editor instanceof EmptyFileEditorInput);
    assert.ok(filesTab);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(filesTab), 1);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidCloseEditor.fire({ editor: filesTab });
    harness.onDidEditorsChange.fire();
    harness.layoutService.toggleSidePane();
    await settle();
    assert.deepStrictEqual({
      hasFilesTab: hasFilesTab(),
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, {
      hasFilesTab: true,
      editorVisible: false,
      auxiliaryBarVisible: true
    });
  });
  test("[single-pane] closing the last non-Empty editor while Editor is hidden opens Empty Files", async () => {
    createSinglePaneController({ activateAux: true, singlePaneLayoutEnabled: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    const lastEditor = store.add(new TestStubEditorInput(URI.parse("search-editor://last")));
    harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length, lastEditor);
    harness.activeEditorInput = lastEditor;
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
    harness.editorGroupsHaveContent = false;
    harness.onDidCloseEditor.fire({ editor: lastEditor, groupId: 1 });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      hasFilesTab: hasFilesTab(),
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, {
      hasFilesTab: true,
      editorVisible: false,
      auxiliaryBarVisible: true
    });
  });
  test("[single-pane] closing the last visible file editor opens Empty Files and keeps Editor visible", async () => {
    createSinglePaneController({ activateAux: true, singlePaneLayoutEnabled: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    const lastEditor = store.add(new TestStubEditorInput(URI.file("/repo/last.ts")));
    harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length, lastEditor);
    harness.activeEditorInput = lastEditor;
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
    harness.editorGroupsHaveContent = false;
    harness.onDidCloseEditor.fire({ editor: lastEditor, groupId: 1 });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      hasFilesTab: hasFilesTab(),
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, {
      hasFilesTab: true,
      editorVisible: true,
      auxiliaryBarVisible: true
    });
  });
  test("[D3b] standard controller does not hide the editor on new-session side-pane reveal", async () => {
    createController();
    const untitled = makeSession(URI.parse("session:untitled"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden),
      []
    );
  });
  test("[D8] does not reveal the Changes view while multiple sessions are visible", () => {
    createController();
    const a = makeSession(URI.parse("session:a"));
    const b = makeSession(URI.parse("session:b"));
    harness.visibleSessionsObs.set([a, b], void 0);
    harness.activeSessionObs.set(a, void 0);
    harness.openedViews = [];
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(a.resource);
    harness.onDidActiveEditorChange.fire();
    assert.ok(!harness.openedViews.includes(CHANGES_VIEW_ID), "multi-session mode manages the side pane separately");
  });
  test("[D5] shows the Changes view when the editor area is maximized", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.openedViews = [];
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    assert.ok(
      harness.openedViews.includes(CHANGES_VIEW_ID),
      "Changes view should be shown when the editor is maximized"
    );
  });
  test("[D5] restores the previous aux bar visibility when the editor is un-maximized", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    harness.setPartHiddenCalls = [];
    harness.editorMaximized = false;
    harness.onDidChangeEditorMaximized.fire();
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should be restored to hidden after un-maximizing"
    );
  });
  test("[D5] does not capture forced aux bar visibility while the editor is maximized", () => {
    createController();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.editorMaximized = false;
    harness.onDidChangeEditorMaximized.fire();
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session2, void 0);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(session, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should remain hidden for the session after the editor was maximized"
    );
  });
  test("[D5] keeps the Changes view shown while maximized regardless of the session state", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session1, void 0);
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    harness.setPartHiddenCalls = [];
    harness.openedViews = [];
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session2, void 0);
    assert.ok(
      harness.openedViews.includes(CHANGES_VIEW_ID),
      "Changes view should stay shown while maximized"
    );
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should not be hidden while the editor is maximized"
    );
  });
  test("[D1] does not force auxiliary bar visible when restoring editor working set on session switch", async () => {
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    createController({
      useModal: "some",
      workspaceFolders: [{ uri: URI.file("/repo") }],
      layoutState: [{
        sessionResource: "session:1",
        editorWorkingSet: { id: "ws-1", name: "ws-1" },
        viewState: { auxiliaryBarVisible: false, auxiliaryBarActiveViewContainerId: void 0 }
      }]
    });
    harness.activeSessionObs.set(session2, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(session1, void 0);
    await timeout(0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      "editor part should be revealed by the working set restore"
    );
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
      "auxiliary bar must not be forced visible during working set restore"
    );
  });
  test("[single-pane] working-set restore does not change global editor visibility", async () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
    const first = makeSession(URI.parse("session:first"));
    const existing = makeSession(URI.parse("session:existing"));
    harness.activeSessionObs.set(first, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(existing, void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      editorVisibilityChanges: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART)
    }, {
      editorVisible: false,
      editorVisibilityChanges: []
    });
  });
  test("[single-pane] preserves current visibility when a draft is replaced on submit", async () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    createSinglePaneController({ singlePaneLayoutEnabled: true, workspaceFolders });
    const draft = makeSession(URI.parse("session:draft"), { status: SessionStatus.Untitled, isCreated: false });
    const created = makeSession(URI.parse("session:created"));
    harness.activeSessionObs.set(draft, void 0);
    harness.visibleSessionsObs.set([draft], void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    harness.setPartHiddenCalls = [];
    transaction((tx) => {
      draft.isCreated.set(true, tx);
      harness.activeSessionObs.set(created, tx);
    });
    harness.onDidReplaceSession.fire({ from: draft, to: created });
    harness.visibleSessionsObs.set([created], void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorReveals: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden === false).length,
      editorHides: harness.setPartHiddenCalls.filter((c) => c.part === Parts.EDITOR_PART && c.hidden === true).length,
      detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART)
    }, {
      editorReveals: 0,
      editorHides: 0,
      detailVisible: true,
      editorVisible: false
    });
  });
  test("[single-pane] does not reveal the editor part for a created quick chat on switch", async () => {
    createSinglePaneController({ singlePaneLayoutEnabled: true });
    const untitled = makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false });
    const quickChat = makeSession(URI.parse("session:qc"), { isQuickChat: true });
    harness.activeSessionObs.set(untitled, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(quickChat, void 0);
    await timeout(0);
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      "the editor part must not be revealed for a quick chat"
    );
  });
  test("[single-pane] keeps the side pane visible when a quick chat is active among multiple sessions", async () => {
    createSinglePaneController({ singlePaneLayoutEnabled: true, activateAux: true });
    const workspaceSession = makeSession(URI.parse("session:workspace"));
    const quickChat = makeSession(URI.parse("session:quick"), { isQuickChat: true });
    harness.activeSessionObs.set(workspaceSession, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    transaction((tx) => {
      harness.visibleSessionsObs.set([workspaceSession, quickChat], tx);
      harness.activeSessionObs.set(quickChat, tx);
    });
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      hideCalls: harness.setPartHiddenCalls.filter((call) => call.hidden)
    }, {
      editorVisible: true,
      auxiliaryBarVisible: true,
      hideCalls: []
    });
  });
  test("[single-pane] restores open side-pane parts when an existing session is opened to the side", async () => {
    createSinglePaneController({
      singlePaneLayoutEnabled: true,
      activateAux: true,
      sidePaneVisibilityState: {
        newSession: { editorVisible: false, auxiliaryBarVisible: true },
        existingSession: { editorVisible: true, auxiliaryBarVisible: true }
      }
    });
    const quickChat = makeSession(URI.parse("session:quick"), { isQuickChat: true });
    const existingSession = makeSession(URI.parse("session:existing"));
    harness.activeSessionObs.set(quickChat, void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.setPartHiddenCalls = [];
    transaction((tx) => {
      harness.visibleSessionsObs.set([quickChat, existingSession], tx);
      harness.activeSessionObs.set(existingSession, tx);
    });
    await timeout(0);
    harness.activeEditorInput = makeFileEditor();
    harness.onDidActiveEditorChange.fire();
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      hasDockedDetails: harness.contextKeyService.getContextKeyValue(HasDockedDetailsContext.key),
      revealCalls: harness.setPartHiddenCalls.filter((call) => !call.hidden)
    }, {
      editorVisible: true,
      auxiliaryBarVisible: true,
      hasDockedDetails: true,
      revealCalls: [
        { part: Parts.AUXILIARYBAR_PART, hidden: false },
        { part: Parts.EDITOR_PART, hidden: false }
      ]
    });
  });
  test("[single-pane] hides the side pane once when switching to Quick Chat", async () => {
    createSinglePaneController({ singlePaneLayoutEnabled: true, activateAux: true });
    await timeout(0);
    harness.activeSessionObs.set(makeSession(URI.parse("session:workspace")), void 0);
    await timeout(0);
    const outgoingEditor = store.add(new TestStubEditorInput(URI.parse("search-editor://outgoing")));
    harness.activeGroupEditors.push(outgoingEditor);
    harness.activeEditorInput = outgoingEditor;
    harness.editorGroupsHaveContent = true;
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      hideOrder: harness.setPartHiddenCalls.filter((call) => call.hidden && (call.part === Parts.EDITOR_PART || call.part === Parts.AUXILIARYBAR_PART))
    }, {
      editorVisible: false,
      auxiliaryBarVisible: false,
      hideOrder: [
        { part: Parts.EDITOR_PART, hidden: true },
        { part: Parts.AUXILIARYBAR_PART, hidden: true }
      ]
    });
  });
  test("[single-pane] restores the existing-session side pane profile after leaving a quick chat before managed tabs settle", async () => {
    createSinglePaneController({ singlePaneLayoutEnabled: true, activateAux: true });
    await timeout(0);
    const workspaceSession = makeSession(URI.parse("session:workspace"));
    const quickChat = makeSession(URI.parse("session:qc"), { isQuickChat: true });
    harness.activeSessionObs.set(workspaceSession, void 0);
    await timeout(0);
    harness.editorGroupsHaveContent = false;
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.activeSessionObs.set(quickChat, void 0);
    await timeout(0);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(workspaceSession, void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    }, {
      editorVisible: true,
      detailVisible: false
    });
  });
  test("[single-pane] New Sessions ignore the stored New visibility profile", async () => {
    createSinglePaneController({
      singlePaneLayoutEnabled: true,
      sidePaneVisibilityState: {
        newSession: { editorVisible: false, auxiliaryBarVisible: true },
        existingSession: { editorVisible: true, auxiliaryBarVisible: false }
      }
    });
    const existing = makeSession(URI.parse("session:existing"));
    const draft = makeSession(URI.parse("session:draft"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(existing, void 0);
    await timeout(0);
    const existingState = {
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    };
    harness.activeSessionObs.set(draft, void 0);
    await timeout(0);
    const newState = {
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
    };
    harness.activeSessionObs.set(existing, void 0);
    await timeout(0);
    assert.deepStrictEqual({
      existingState,
      newState,
      restoredExistingState: {
        editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
        detailVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART)
      }
    }, {
      existingState: { editorVisible: true, detailVisible: false },
      newState: { editorVisible: true, detailVisible: false },
      restoredExistingState: { editorVisible: true, detailVisible: false }
    });
  });
  test("[single-pane] background submit during Quick Chat does not overwrite visibility profiles", async () => {
    createSinglePaneController({
      sidePaneVisibilityState: {
        newSession: { editorVisible: false, auxiliaryBarVisible: true },
        existingSession: { editorVisible: true, auxiliaryBarVisible: true }
      }
    });
    const draft = makeSession(URI.parse("session:draft"), { status: SessionStatus.Untitled, isCreated: false });
    const quickChat = makeSession(URI.parse("session:quick"), { isQuickChat: true });
    const committed = makeSession(URI.parse("session:committed"), { isCreated: true });
    harness.activeSessionObs.set(draft, void 0);
    await timeout(0);
    harness.activeSessionObs.set(quickChat, void 0);
    await timeout(0);
    draft.isCreated.set(true, void 0);
    harness.activeSessionObs.set(committed, void 0);
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      profiles: JSON.parse(harness.storageService.get("sessions.singlePane.sidePaneVisibility", StorageScope.WORKSPACE) ?? "")
    }, {
      editorVisible: true,
      auxiliaryBarVisible: true,
      profiles: {
        newSession: { editorVisible: false, auxiliaryBarVisible: true },
        existingSession: { editorVisible: true, auxiliaryBarVisible: true }
      }
    });
  });
  test("[B4] persists aux-bar view state to sessions.layoutState key", () => {
    createController();
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session1, void 0);
    harness.activePaneCompositeId = "custom.view";
    harness.activeSessionObs.set(session2, void 0);
    harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
    const stored = harness.storageService.get("sessions.layoutState", StorageScope.WORKSPACE);
    assert.ok(stored, "state should be persisted");
    const parsed = JSON.parse(stored);
    const session1Entry = parsed.find((e) => e.sessionResource === "session:1");
    assert.ok(session1Entry, "session 1 entry should exist");
    assert.deepStrictEqual(session1Entry.viewState, {
      auxiliaryBarVisible: false,
      auxiliaryBarActiveViewContainerId: "custom.view"
    });
  });
  test("[D1] keeps aux bar hidden after reload when a session with editors closes both editor and aux bar", () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    createController({ useModal: "some", workspaceFolders });
    const session1 = makeSession(URI.parse("session:1"));
    const session2 = makeSession(URI.parse("session:2"));
    harness.visibleEditorsList = [{}];
    harness.activeSessionObs.set(session1, void 0);
    harness.activeSessionObs.set(session2, void 0);
    harness.activeSessionObs.set(session1, void 0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.visibleEditorsList = [];
    harness.activeSessionObs.set(session2, void 0);
    harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
    const stored = harness.storageService.get("sessions.layoutState", StorageScope.WORKSPACE);
    assert.ok(stored, "state should be persisted");
    store.clear();
    createController({ useModal: "some", workspaceFolders, layoutState: JSON.parse(stored) });
    const reloadedSession1 = makeSession(URI.parse("session:1"));
    harness.setPartHiddenCalls = [];
    harness.openedViews = [];
    harness.openedViewContainers = [];
    harness.activeSessionObs.set(reloadedSession1, void 0);
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux bar should remain hidden after reload"
    );
  });
  function reloadWithSidePaneToggledClosed() {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    const controller = createController({ useModal: "some", workspaceFolders, revealAuxiliaryBarOnOpen: true });
    const session = makeSession(URI.parse("session:1"));
    harness.visibleEditorsList = [{}];
    harness.activeSessionObs.set(session, void 0);
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    assert.deepStrictEqual(controller.getViewState(session.resource)?.auxiliaryBarVisible, true);
    harness.layoutService.toggleSidePane();
    harness.storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
    const stored = harness.storageService.get("sessions.layoutState", StorageScope.WORKSPACE);
    assert.ok(stored, "state should be persisted");
    store.clear();
    createController({ useModal: "some", workspaceFolders, layoutState: JSON.parse(stored), revealAuxiliaryBarOnOpen: true });
    const reloadedSession = makeSession(URI.parse("session:1"));
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.activeSessionObs.set(reloadedSession, void 0);
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(reloadedSession.resource);
  }
  test("[D9] does not auto-reveal the side pane when the Changes editor is restored on reload", () => {
    reloadWithSidePaneToggledClosed();
    harness.openedViews = [];
    harness.onDidActiveEditorChange.fire();
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID),
      "restoring the Changes editor on reload must not auto-reveal the side pane"
    );
  });
  test("[D9] reveals the Changes view when opening Changes after reloading a session whose side pane was toggled closed", () => {
    reloadWithSidePaneToggledClosed();
    harness.openedViews = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    assert.ok(
      harness.openedViews.includes(CHANGES_VIEW_ID),
      "opening Changes after reload should reveal the Changes view"
    );
  });
  test("[D9] does not turn an explicit aux-bar hide into a collapse when another session is collapsed", () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    const controller = createController({ useModal: "some", workspaceFolders, revealAuxiliaryBarOnOpen: true });
    const sessionExplicit = makeSession(URI.parse("session:explicit"));
    const sessionCollapse = makeSession(URI.parse("session:collapse"));
    harness.visibleEditorsList = [{}];
    harness.activeSessionObs.set(sessionExplicit, void 0);
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(sessionExplicit.resource);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    assert.strictEqual(controller.getViewState(sessionExplicit.resource)?.auxiliaryBarHiddenByCollapse, void 0);
    harness.activeSessionObs.set(sessionCollapse, void 0);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.layoutService.toggleSidePane();
    assert.strictEqual(controller.getViewState(sessionCollapse.resource)?.auxiliaryBarHiddenByCollapse, true);
    harness.activeSessionObs.set(sessionExplicit, void 0);
    harness.activeSessionObs.set(sessionCollapse, void 0);
    assert.strictEqual(controller.getViewState(sessionExplicit.resource)?.auxiliaryBarHiddenByCollapse, void 0);
  });
  test("[D9] re-opening the side pane to editor-only does not mark an explicit aux-bar hide as a collapse", () => {
    const workspaceFolders = [{ uri: URI.file("/repo") }];
    const controller = createController({ useModal: "some", workspaceFolders, revealAuxiliaryBarOnOpen: true });
    const session = makeSession(URI.parse("session:1"));
    harness.visibleEditorsList = [{}];
    harness.activeSessionObs.set(session, void 0);
    harness.activeEditorResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    assert.strictEqual(controller.getViewState(session.resource)?.auxiliaryBarHiddenByCollapse, void 0);
    harness.layoutService.toggleSidePane();
    harness.layoutService.toggleSidePane();
    assert.strictEqual(controller.getViewState(session.resource)?.auxiliaryBarHiddenByCollapse, void 0);
    harness.openedViews = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidActiveEditorChange.fire();
    assert.ok(
      !harness.openedViews.includes(CHANGES_VIEW_ID),
      "an explicit aux-bar hide must not re-reveal after a collapse + editor-only re-open"
    );
  });
  function setPartVisible(part, visible) {
    harness.partVisibility.set(part, visible);
    harness.onDidChangePartVisibility.fire({ partId: part, visible });
  }
  function resizeWindow(width) {
    harness.mainContainerWidth = width;
    harness.onDidLayoutMainContainer.fire({ width, height: 1e3 });
  }
  function sidebarHiddenCalls() {
    return harness.setPartHiddenCalls.filter((c) => c.part === Parts.SIDEBAR_PART).map((c) => c.hidden);
  }
  test("[D7] hides the sidebar on a small window when editor and aux bar are both open", () => {
    createController();
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    assert.deepStrictEqual(sidebarHiddenCalls(), [true]);
  });
  test("[D7] does not touch the sidebar on a large window", () => {
    createController();
    harness.setPartHiddenCalls = [];
    resizeWindow(2e3);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] shows the sidebar again once the aux bar closes", () => {
    createController();
    resizeWindow(800);
    harness.setPartHiddenCalls = [];
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
  });
  test("[D7] shows the sidebar again once the window grows back", () => {
    createController();
    resizeWindow(800);
    harness.setPartHiddenCalls = [];
    resizeWindow(2e3);
    assert.deepStrictEqual(sidebarHiddenCalls(), [false]);
  });
  test("[D7] does not auto-show the sidebar after the user closed it manually", () => {
    createController();
    setPartVisible(Parts.SIDEBAR_PART, false);
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    assert.ok(
      !sidebarHiddenCalls().includes(false),
      "sidebar must not be auto-shown while the user-closed preference holds"
    );
  });
  test("[D7] resumes auto-management after the user opens the sidebar again", () => {
    createController();
    setPartVisible(Parts.SIDEBAR_PART, false);
    setPartVisible(Parts.SIDEBAR_PART, true);
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    assert.deepStrictEqual(sidebarHiddenCalls(), [true, false]);
  });
  test("[D7] does not auto-show the sidebar the user closed before reloading", () => {
    createController({
      mainContainerWidth: 800,
      initialPartVisibility: /* @__PURE__ */ new Map([
        [Parts.SIDEBAR_PART, false],
        [Parts.EDITOR_PART, false],
        [Parts.AUXILIARYBAR_PART, false]
      ])
    });
    harness.setPartHiddenCalls = [];
    harness.layoutService.toggleSidePane();
    harness.layoutService.toggleSidePane();
    assert.ok(
      !sidebarHiddenCalls().includes(false),
      "sidebar must not be auto-shown when it was closed before the reload"
    );
  });
  test("[D7] does not manage the sidebar while the editor is maximized", () => {
    createController();
    harness.editorMaximized = true;
    harness.onDidChangeEditorMaximized.fire();
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] does not manage the sidebar when the experimental setting is disabled", () => {
    createController({ responsiveSidebar: false });
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] does not hide the sidebar when navigating to a session that restores the side panel", () => {
    const sessionB = URI.parse("session:2");
    createController({
      revealAuxiliaryBarOnOpen: true,
      layoutState: [{
        sessionResource: sessionB.toString(),
        viewState: { auxiliaryBarVisible: true, auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID }
      }]
    });
    setPartVisible(Parts.AUXILIARYBAR_PART, false);
    resizeWindow(800);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(makeSession(sessionB), void 0);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] does not hide the sidebar when navigating to a session whose working set reveals the editor", async () => {
    const session1 = URI.parse("session:1");
    const session2 = URI.parse("session:2");
    createController({
      useModal: "some",
      workspaceFolders: [{ uri: URI.file("/repo") }],
      layoutState: [{
        sessionResource: session1.toString(),
        editorWorkingSet: { id: "ws-1", name: "ws-1" },
        viewState: { auxiliaryBarVisible: true, auxiliaryBarActiveViewContainerId: CHANGES_VIEW_CONTAINER_ID }
      }]
    });
    harness.activeSessionObs.set(makeSession(session2), void 0);
    await timeout(0);
    setPartVisible(Parts.AUXILIARYBAR_PART, true);
    setPartVisible(Parts.EDITOR_PART, false);
    resizeWindow(800);
    harness.setPartHiddenCalls = [];
    harness.activeSessionObs.set(makeSession(session1), void 0);
    await timeout(0);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[D7] does not manage the sidebar while multiple sessions are visible", () => {
    createController();
    harness.visibleSessionsObs.set([
      makeSession(URI.parse("session:1")),
      makeSession(URI.parse("session:2"))
    ], void 0);
    harness.setPartHiddenCalls = [];
    resizeWindow(800);
    assert.deepStrictEqual(sidebarHiddenCalls(), []);
  });
  test("[single-pane] opening details does not hide the sessions list", () => {
    const controller = createSinglePaneController({ mainContainerWidth: 800 });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.partVisibility.set(Parts.SIDEBAR_PART, true);
    harness.setPartHiddenCalls = [];
    controller.toggleDetails();
    assert.deepStrictEqual({
      detailsVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      sidebarHiddenCalls: sidebarHiddenCalls()
    }, {
      detailsVisible: true,
      sidebarHiddenCalls: []
    });
  });
  test("[single-pane] closing details does not show a manually hidden sessions list", () => {
    const controller = createSinglePaneController({ mainContainerWidth: 800 });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.partVisibility.set(Parts.SIDEBAR_PART, false);
    harness.setPartHiddenCalls = [];
    controller.toggleDetails();
    assert.deepStrictEqual({
      detailsVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      sidebarHiddenCalls: sidebarHiddenCalls()
    }, {
      detailsVisible: false,
      sidebarHiddenCalls: []
    });
  });
  test("[D7 single-pane] contributes Toggle Details in the trailing editor header group", () => {
    createSinglePaneController();
    const items = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderLayout).filter(isIMenuItem).filter((item) => item.command.id === TOGGLE_DETAILS_COMMAND_ID);
    assert.strictEqual(items.length, 1, "exactly one Toggle Details item on the editor header");
    const when = items[0].when?.serialize() ?? "";
    assert.deepStrictEqual({
      group: items[0].group,
      icon: ThemeIcon.isThemeIcon(items[0].command.icon) ? items[0].command.icon.id : void 0,
      order: items[0].order,
      hasToggled: !!items[0].command.toggled,
      gatedOnEditorArea: when.includes(MainEditorAreaVisibleContext.key),
      gatedOnDockedDetails: when.includes(HasDockedDetailsContext.key)
    }, {
      group: "navigation",
      icon: Codicon.listSelection.id,
      order: 10,
      hasToggled: true,
      gatedOnEditorArea: true,
      gatedOnDockedDetails: true
    });
  });
  test("[D10] hides the aux-bar part for a quick chat when its view containers are gated off", async () => {
    createController();
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    harness.activeAuxViewContainerIds = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux-bar part should hide when a quick chat has no active view containers"
    );
  });
  test("[D10] does not hide the aux bar during early reload when there is no active session yet", () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      [],
      "aux-bar part must not be hidden by D10 while there is no active session"
    );
  });
  test("[single-pane reload] preserves Aux-only layout while the active session is still restoring", async () => {
    createSinglePaneController({
      activateAux: true,
      initialPartVisibility: /* @__PURE__ */ new Map([
        [Parts.EDITOR_PART, false],
        [Parts.AUXILIARYBAR_PART, true]
      ])
    });
    await timeout(0);
    assert.deepStrictEqual({
      editorVisible: harness.partVisibility.get(Parts.EDITOR_PART),
      auxiliaryBarVisible: harness.partVisibility.get(Parts.AUXILIARYBAR_PART),
      editorReveals: harness.setPartHiddenCalls.filter((call) => call.part === Parts.EDITOR_PART && !call.hidden).length,
      auxiliaryBarHides: harness.setPartHiddenCalls.filter((call) => call.part === Parts.AUXILIARYBAR_PART && call.hidden).length
    }, {
      editorVisible: false,
      auxiliaryBarVisible: true,
      editorReveals: 0,
      auxiliaryBarHides: 0
    });
  });
  test("[D10] does not hide the aux bar for a workspace session with transiently empty containers", async () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.activeSessionObs.set(makeSession(URI.parse("session:ws")), void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      [],
      "aux-bar part must not be hidden by D10 for a workspace session with transiently empty containers"
    );
  });
  test("[D10] never reveals an empty aux-bar part", async () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.setPartHiddenCalls = [];
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.ok(
      !harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === false),
      "aux-bar part should never be revealed when it has no active view containers"
    );
  });
  test("[D10] re-hides the aux-bar part if a switch to a quick chat left it visible with no containers", async () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangeViewContainerVisibility.fire({ id: CHANGES_VIEW_CONTAINER_ID, visible: false, location: ViewContainerLocation.AuxiliaryBar });
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux-bar part should be hidden reactively when a quick chat has no active view containers"
    );
  });
  test("[D10] leaves the aux-bar part alone when it has active view containers", () => {
    createController();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangeActiveViewDescriptors.fire();
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART),
      [],
      "aux-bar part should be left as-is while it has active view containers"
    );
  });
  test("[D10] hides the aux-bar part when a quick chat becomes visible with no active containers", async () => {
    createController({ activeAuxViewContainerIds: [] });
    harness.activeSessionObs.set(makeSession(URI.parse("session:qc"), { isQuickChat: true }), void 0);
    await timeout(0);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.ok(
      harness.setPartHiddenCalls.some((c) => c.part === Parts.AUXILIARYBAR_PART && c.hidden === true),
      "aux-bar part should hide when a quick chat becomes visible with no active view containers"
    );
  });
  test("[D10] leaves the aux-bar part visible when it becomes visible with active containers", () => {
    createController();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.setPartHiddenCalls = [];
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    assert.deepStrictEqual(
      harness.setPartHiddenCalls.filter((c) => c.part === Parts.AUXILIARYBAR_PART),
      [],
      "aux-bar part should stay visible when it becomes visible with active view containers"
    );
  });
  async function settle() {
    for (let i = 0; i < 6; i++) {
      await timeout(0);
    }
  }
  function hasFilesTab() {
    return harness.activeGroupEditors.some((e) => e instanceof EmptyFileEditorInput);
  }
  function hasChangesTab() {
    return harness.activeGroupEditors.some((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
  }
  test("[managed tabs] ensures the Changes and Files tabs for a created session under suppression", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const filesTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      filesResource: filesTab?.resource?.toString()
    }, {
      hasChangesTab: true,
      filesResource: URI.file("/repo").toString()
    });
  });
  test("[managed tabs] updates the Files root when the active session changes", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const first = makeSession(URI.parse("session:1"), {
      workspace: {
        uri: URI.file("/repo/first"),
        label: "first",
        icon: Codicon.repo,
        folders: [{ root: URI.file("/repo"), workingDirectory: URI.file("/repo/first"), name: "first", description: void 0 }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      }
    });
    const second = makeSession(URI.parse("session:2"), {
      workspace: {
        uri: URI.file("/repo/second"),
        label: "second",
        icon: Codicon.repo,
        folders: [{ root: URI.file("/repo"), workingDirectory: URI.file("/repo/second"), name: "second", description: void 0 }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      }
    });
    harness.activeSessionObs.set(first, void 0);
    await settle();
    harness.activeSessionObs.set(second, void 0);
    await settle();
    const filesTabs = harness.activeGroupEditors.filter((e) => e instanceof EmptyFileEditorInput);
    assert.deepStrictEqual(filesTabs.map((editor) => editor.resource?.toString()), [URI.file("/repo/second").toString()]);
  });
  test("[managed tabs / Changes pill] reveals the editor area before opening the managed Changes editor", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await settle();
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.setPartHiddenCalls = [];
    const handler = CommandsRegistry.getCommand("workbench.agentSessions.action.viewChanges")?.handler;
    assert.ok(handler, "Changes pill command should be registered");
    await handler(harness.instaService, session);
    await settle();
    assert.deepStrictEqual({
      editorRevealed: harness.setPartHiddenCalls.some((c) => c.part === Parts.EDITOR_PART && c.hidden === false),
      hasChangesTab: hasChangesTab()
    }, {
      editorRevealed: true,
      hasChangesTab: true
    });
  });
  test("[managed tabs / Scenario 9] shows only Files for a new-session view", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      hasFilesTab: hasFilesTab(),
      changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key)
    }, {
      hasChangesTab: false,
      hasFilesTab: true,
      changesTabMissing: false
    });
  });
  test("[managed tabs / new session] keeps Changes unavailable after a delayed different-folder restore", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:created")), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    harness.activeSessionObs.set(void 0, void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
    const filesTab = harness.activeGroupEditors.find((editor) => editor instanceof EmptyFileEditorInput);
    assert.ok(filesTab);
    controller.runWithRestore(() => {
      harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length, filesTab);
      harness.activeEditorInput = filesTab;
      harness.onDidEditorsChange.fire();
    });
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
  });
  test("[managed tabs / submit] activates Changes only after a submitted session reports changes", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(session, void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
    harness.activeEditorInput = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    session.isCreated.set(true, void 0);
    await settle();
    const changesResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    const changesActiveBeforeChanges = !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource);
    session.changes.set([makeChange("/file.ts")], void 0);
    await settle();
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      hasFilesTab: hasFilesTab(),
      changesActiveBeforeChanges,
      changesActive: !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource)
    }, { hasChangesTab: true, hasFilesTab: true, changesActiveBeforeChanges: false, changesActive: true });
  });
  test("[managed tabs / submit] activates Changes after changes arrive on a resource-replace submit", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const draft = makeSession(URI.parse("session:draft"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(draft, void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
    const committedResource = URI.parse("session:committed");
    const committed = makeSession(committedResource, { isCreated: true });
    transaction((tx) => {
      draft.isCreated.set(true, tx);
      harness.activeSessionObs.set(committed, tx);
    });
    await settle();
    const changesResource = harness.sessionChangesService.getChangesEditorResource(committedResource);
    const changesActiveBeforeChanges = !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource);
    committed.changes.set([makeChange("/file.ts")], void 0);
    await settle();
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      hasFilesTab: hasFilesTab(),
      changesActiveBeforeChanges,
      changesActive: !!harness.activeEditorInput?.resource && isEqual(harness.activeEditorInput.resource, changesResource)
    }, { hasChangesTab: true, hasFilesTab: true, changesActiveBeforeChanges: false, changesActive: true });
  });
  test(`[managed tabs / session switch] does not leak a superseded submit's "activate Changes" intent onto the switched-to session`, async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const sessionA = makeSession(URI.parse("session:a"), { status: SessionStatus.Untitled, isCreated: false });
    harness.activeSessionObs.set(sessionA, void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
    let releaseChangesOpen;
    const changesOpenGate = new Promise((resolve) => {
      releaseChangesOpen = resolve;
    });
    let gateArmed = true;
    harness.onOpenChangesEditor = () => {
      if (gateArmed) {
        gateArmed = false;
        return changesOpenGate;
      }
      return void 0;
    };
    sessionA.isCreated.set(true, void 0);
    sessionA.changes.set([makeChange("/file.ts")], void 0);
    await settle();
    const aActiveCalls = harness.openChangesEditorCalls.filter((c) => isEqual(c.sessionResource, sessionA.resource) && c.active);
    assert.strictEqual(aActiveCalls.length, 1, "A's submit should open its Changes tab active (and stall on the gate)");
    const sessionB = makeSession(URI.parse("session:b"), { isCreated: true });
    harness.activeSessionObs.set(sessionB, void 0);
    await settle();
    releaseChangesOpen();
    await settle();
    const bActiveCalls = harness.openChangesEditorCalls.filter((c) => isEqual(c.sessionResource, sessionB.resource) && c.active);
    assert.deepStrictEqual({ bChangesOpenedActive: bActiveCalls.length }, { bChangesOpenedActive: 0 });
  });
  test("[managed tabs / session switch] does not publish workspace from a superseded reconcile", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const sessionA = makeSession(URI.parse("session:a"), {
      workspace: {
        uri: URI.file("/repo/a"),
        label: "a",
        icon: Codicon.repo,
        folders: [{ root: URI.file("/repo/a"), workingDirectory: URI.file("/repo/a"), name: "a", description: void 0 }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      }
    });
    harness.activeSessionObs.set(sessionA, void 0);
    await settle();
    const filesTab = harness.activeGroupEditors.find((editor) => editor instanceof EmptyFileEditorInput);
    const publishedWorkspaces = [];
    store.add(filesTab.onDidChangeLabel(() => {
      const label = filesTab.workspace?.label;
      if (label) {
        publishedWorkspaces.push(label);
      }
    }));
    let releaseClose;
    const closeGate = new Promise((resolve) => {
      releaseClose = resolve;
    });
    let gateArmed = true;
    harness.onReplaceEditors = () => {
      if (gateArmed) {
        gateArmed = false;
        return closeGate;
      }
      return void 0;
    };
    const sessionB = makeSession(URI.parse("session:b"), {
      workspace: {
        uri: URI.file("/repo/b"),
        label: "b",
        icon: Codicon.repo,
        folders: [{ root: URI.file("/repo/b"), workingDirectory: URI.file("/repo/b"), name: "b", description: void 0 }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      }
    });
    harness.activeSessionObs.set(sessionB, void 0);
    await settle();
    const sessionC = makeSession(URI.parse("session:c"), {
      workspace: {
        uri: URI.file("/repo/c"),
        label: "c",
        icon: Codicon.repo,
        folders: [{ root: URI.file("/repo/c"), workingDirectory: URI.file("/repo/c"), name: "c", description: void 0 }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      }
    });
    harness.activeSessionObs.set(sessionC, void 0);
    releaseClose();
    await settle();
    assert.deepStrictEqual(publishedWorkspaces, ["c"]);
  });
  test("[managed tabs / details-only] always restores both docked inputs while only details are visible", async () => {
    createSinglePaneController({
      activateAux: true,
      initialPartVisibility: /* @__PURE__ */ new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]),
      sidePaneVisibilityState: {
        newSession: { editorVisible: false, auxiliaryBarVisible: true },
        existingSession: { editorVisible: false, auxiliaryBarVisible: true }
      }
    });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    const changesTab = harness.activeGroupEditors.find((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
    harness.onDidCloseEditor.fire({ editor: changesTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
  });
  test("[managed tabs / details-only] restores Files when the editor area hides without an editor change", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await settle();
    assert.strictEqual(hasFilesTab(), true);
  });
  test("[managed tabs / details-only] an editor reveal does NOT force back a closed managed tab", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    harness.onDidRevealSidePane.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: false });
  });
  test("[managed tabs / new session] re-opens Files when a working-set apply empties the group during the switch", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:created")), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    controller.runWithRestore(() => {
      harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
      harness.onDidEditorsChange.fire();
    });
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
  });
  test("[managed tabs / new session] re-opens Files on restore-end even if no editor-change fires during the restore", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:created")), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    controller.runWithRestore(() => {
      harness.activeGroupEditors.splice(0, harness.activeGroupEditors.length);
    });
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: true });
  });
  test("[managed tabs / Scenario 9] removes the Files tab while a real editor is open and does not re-add it when that file closes", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    assert.strictEqual(hasFilesTab(), true);
    const realEditor = store.add(new TestStubEditorInput(URI.file("/repo/a.ts")));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    openEditor(realEditor);
    harness.activeGroupEditors.push(realEditor);
    harness.onDidEditorsChange.fire();
    await settle();
    const filesRemoved = !hasFilesTab();
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(realEditor), 1);
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      filesRemoved,
      filesReadded: hasFilesTab()
    }, {
      filesRemoved: true,
      filesReadded: false
    });
  });
  test("[managed tabs / Scenario 9] keeps a Files tab the user adds via `+` while a real file is open", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const realEditor = store.add(new TestStubEditorInput(URI.file("/repo/a.ts")));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    openEditor(realEditor);
    harness.activeGroupEditors.push(realEditor);
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    const userFilesTab = store.add(new EmptyFileEditorInput(void 0, harness.layoutService));
    openEditor(userFilesTab);
    harness.activeGroupEditors.push(userFilesTab);
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), true, "a user-added Files tab stays while a real file is open");
    openEditor(realEditor);
    harness.onDidActiveEditorChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), true, "re-activating an open file must not tidy the user-added Files tab");
  });
  test("[managed tabs / Scenario 9] keeps the Files tab when a non-file editor (e.g. the browser) opens", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    assert.strictEqual(hasFilesTab(), true);
    const browserEditor = store.add(new TestStubEditorInput(URI.parse("browserView://host/page")));
    harness.activeGroupEditors.push(browserEditor);
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    openEditor(browserEditor);
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), true, "a non-file editor must not remove the Files tab");
  });
  test("[single-pane] closes non-managed tabs when the editor area hides and reopens them when shown", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileResource = URI.file("/repo/a.ts");
    harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    const originalIndex = harness.activeGroupEditors.findIndex((e) => e.resource && isEqual(e.resource, fileResource));
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await settle();
    const closedFile = harness.closedEditors.some((e) => isEqual(e.resource, fileResource));
    const filesTabKept = hasFilesTab();
    const fileTabGone = !harness.activeGroupEditors.some((e) => e.resource && isEqual(e.resource, fileResource));
    harness.openedEditors = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    assert.deepStrictEqual({
      closedFile,
      filesTabKept,
      fileTabGone,
      reopenedFile: harness.openedEditors.some((e) => isResourceEditorInput(e) && isEqual(e.resource, fileResource)),
      restoredAtOriginalIndex: harness.activeGroupEditors.findIndex((e) => e.resource && isEqual(e.resource, fileResource)) === originalIndex
    }, {
      closedFile: true,
      filesTabKept: true,
      fileTabGone: true,
      reopenedFile: true,
      restoredAtOriginalIndex: true
    });
  });
  test("[single-pane] closes non-managed tabs restored while only details are visible", async () => {
    const controller = createSinglePaneController({
      activateAux: true,
      initialPartVisibility: /* @__PURE__ */ new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]),
      sidePaneVisibilityState: {
        newSession: { editorVisible: false, auxiliaryBarVisible: true },
        existingSession: { editorVisible: false, auxiliaryBarVisible: true }
      }
    });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileResource = URI.file("/repo/restored.ts");
    controller.runWithRestore(() => {
      harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
      harness.onDidEditorsChange.fire();
    });
    await settle();
    assert.deepStrictEqual({
      closedFile: harness.closedEditors.some((editor) => editor.resource && isEqual(editor.resource, fileResource)),
      fileTabVisible: harness.activeGroupEditors.some((editor) => editor.resource && isEqual(editor.resource, fileResource)),
      filesTabVisible: hasFilesTab()
    }, {
      closedFile: true,
      fileTabVisible: false,
      filesTabVisible: true
    });
  });
  test("[single-pane] closes and reopens non-managed tabs added while only details are visible", async () => {
    createSinglePaneController({
      activateAux: true,
      initialPartVisibility: /* @__PURE__ */ new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]),
      sidePaneVisibilityState: {
        newSession: { editorVisible: false, auxiliaryBarVisible: true },
        existingSession: { editorVisible: false, auxiliaryBarVisible: true }
      }
    });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileResource = URI.file("/repo/added.ts");
    harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
    harness.onDidEditorsChange.fire();
    await settle();
    const fileTabVisibleWhileDetailsOnly = harness.activeGroupEditors.some((editor) => editor.resource && isEqual(editor.resource, fileResource));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    assert.deepStrictEqual({
      closedFile: harness.closedEditors.some((editor) => editor.resource && isEqual(editor.resource, fileResource)),
      fileTabVisibleWhileDetailsOnly,
      reopenedFile: harness.openedEditors.some((editor) => isResourceEditorInput(editor) && isEqual(editor.resource, fileResource))
    }, {
      closedFile: true,
      fileTabVisibleWhileDetailsOnly: false,
      reopenedFile: true
    });
  });
  test("[single-pane] closes a non-restorable non-docked tab (e.g. untitled Search) when the editor area hides, without restoring it", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const searchResource = URI.parse("search-editor:/Untitled-1");
    harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(searchResource, { dirty: true, nonRestorable: true })));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await settle();
    const closedSearch = harness.closedEditors.some((e) => isEqual(e.resource, searchResource));
    const searchTabGone = !harness.activeGroupEditors.some((e) => e.resource && isEqual(e.resource, searchResource));
    harness.openedEditors = [];
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    assert.deepStrictEqual({
      closedSearch,
      searchTabGone,
      filesTabKept: hasFilesTab(),
      reopenedSearch: harness.openedEditors.some((e) => isResourceEditorInput(e) && isEqual(e.resource, searchResource))
    }, {
      closedSearch: true,
      searchTabGone: true,
      filesTabKept: true,
      reopenedSearch: false
    });
  });
  test("[single-pane] does NOT close editors when the whole side pane is closed (editor + aux hidden)", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileResource = URI.file("/repo/a.ts");
    harness.activeGroupEditors.splice(1, 0, store.add(new TestStubEditorInput(fileResource)));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    await settle();
    harness.closedEditors = [];
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    await settle();
    assert.deepStrictEqual({
      anyEditorClosed: harness.closedEditors.length > 0,
      fileStillPresent: harness.activeGroupEditors.some((e) => e.resource && isEqual(e.resource, fileResource))
    }, {
      anyEditorClosed: false,
      fileStillPresent: true
    });
  });
  test("[managed tabs / lifecycle removal] does not re-open a missing managed tab while the group stays non-empty", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    assert.ok(fileTab);
    const index = harness.activeGroupEditors.indexOf(fileTab);
    harness.activeGroupEditors.splice(index, 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false, "the closed Files tab stays closed");
  });
  test("[managed tabs / close] re-opens the default tabs for the new session after switching (empty group)", async () => {
    const controller = createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    const index = harness.activeGroupEditors.indexOf(fileTab);
    harness.activeGroupEditors.splice(index, 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    harness.activeSessionObs.set(makeSession(URI.parse("session:2")), void 0);
    controller.runWithRestore(() => {
      harness.activeGroupEditors.length = 0;
      harness.activeEditorInput = void 0;
      harness.onDidEditorsChange.fire();
    });
    await settle();
    assert.strictEqual(hasFilesTab(), true, "the default tabs are opened for the new session");
  });
  test("[managed tabs / session switch] preserves a dismissed Files tab while replacing Changes in place", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session1 = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session1, void 0);
    await settle();
    const filesTab = harness.activeGroupEditors.find((editor) => editor instanceof EmptyFileEditorInput);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(filesTab), 1);
    harness.onDidCloseEditor.fire({ editor: filesTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: false });
    const session2 = makeSession(URI.parse("session:2"));
    harness.activeSessionObs.set(session2, void 0);
    await settle();
    const incomingChangesResource = harness.sessionChangesService.getChangesEditorResource(session2.resource);
    assert.deepStrictEqual({
      hasIncomingChangesTab: harness.activeGroupEditors.some((editor) => editor.resource && isEqual(editor.resource, incomingChangesResource)),
      hasFilesTab: hasFilesTab(),
      editorCount: harness.activeGroupEditors.length
    }, {
      hasIncomingChangesTab: true,
      hasFilesTab: false,
      editorCount: 1
    });
  });
  test("[managed tabs / session switch] removes a dismissed Files tab restored by a previously visited session", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const sessionA = makeSession(URI.parse("session:a"));
    harness.activeSessionObs.set(sessionA, void 0);
    await settle();
    const sessionB = makeSession(URI.parse("session:b"));
    harness.activeSessionObs.set(sessionB, void 0);
    await settle();
    const filesTab = harness.activeGroupEditors.find((editor) => editor instanceof EmptyFileEditorInput);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(filesTab), 1);
    harness.onDidCloseEditor.fire({ editor: filesTab });
    harness.onDidEditorsChange.fire();
    await settle();
    harness.onApplyWorkingSet = (workingSet) => {
      if (workingSet === "empty" || workingSet.name !== `session-working-set:${sessionA.resource.toString()}`) {
        return;
      }
      harness.activeGroupEditors.push(store.add(harness.instaService.createInstance(EmptyFileEditorInput, sessionA.workspace.get())));
      harness.onDidEditorsChange.fire();
    };
    harness.activeSessionObs.set(sessionA, void 0);
    await settle();
    const incomingChangesResource = harness.sessionChangesService.getChangesEditorResource(sessionA.resource);
    assert.deepStrictEqual({
      hasIncomingChangesTab: harness.activeGroupEditors.some((editor) => editor.resource && isEqual(editor.resource, incomingChangesResource)),
      hasFilesTab: hasFilesTab()
    }, {
      hasIncomingChangesTab: true,
      hasFilesTab: false
    });
  });
  test("[managed tabs / session switch] keeps restored Files after a transiently empty group", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const sessionA = makeSession(URI.parse("session:a"));
    harness.activeSessionObs.set(sessionA, void 0);
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:b")), void 0);
    await settle();
    harness.activeGroupEditors.length = 0;
    harness.activeEditorInput = void 0;
    harness.onDidEditorsChange.fire();
    harness.onApplyWorkingSet = (workingSet) => {
      if (workingSet === "empty" || workingSet.name !== `session-working-set:${sessionA.resource.toString()}`) {
        return;
      }
      harness.activeGroupEditors.push(store.add(harness.instaService.createInstance(EmptyFileEditorInput, sessionA.workspace.get())));
      harness.onDidEditorsChange.fire();
    };
    harness.activeSessionObs.set(sessionA, void 0);
    await settle();
    assert.strictEqual(hasFilesTab(), true);
  });
  test("[managed tabs / add-tab] a missing Changes tab flips SinglePaneChangesTabMissingContext", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const changesTab = harness.activeGroupEditors.find((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
    assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key), false);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
    harness.onDidCloseEditor.fire({ editor: changesTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      changesTabAvailable: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabAvailableContext.key),
      changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key)
    }, { hasChangesTab: false, changesTabAvailable: true, changesTabMissing: true });
  });
  test("[managed tabs / add-tab] a missing Files tab flips SinglePaneFilesTabMissingContext", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:1")), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabMissingContext.key), false);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      hasFilesTab: hasFilesTab(),
      filesTabAvailable: harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabAvailableContext.key),
      filesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneFilesTabMissingContext.key)
    }, { hasFilesTab: false, filesTabAvailable: true, filesTabMissing: true });
  });
  test("[managed tabs / add-tab] reopening the Changes tab clears the missing context and is retained", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = URI.parse("session:1");
    harness.activeSessionObs.set(makeSession(session), void 0);
    await settle();
    const changesTab = harness.activeGroupEditors.find((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
    harness.onDidCloseEditor.fire({ editor: changesTab });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.strictEqual(harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key), true);
    const changesResource = harness.sessionChangesService.getChangesEditorResource(session);
    harness.activeGroupEditors.push(store.add(new TestStubEditorInput(changesResource)));
    harness.onDidEditorsChange.fire();
    await settle();
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({
      hasChangesTab: hasChangesTab(),
      changesTabMissing: harness.contextKeyService.getContextKeyValue(SinglePaneChangesTabMissingContext.key)
    }, { hasChangesTab: true, changesTabMissing: false });
  });
  test("[managed tabs / add-tab] reopening managed tabs from the plus menu adds them at the end", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = URI.parse("session:1");
    harness.activeSessionObs.set(makeSession(session), void 0);
    await settle();
    const changesTab = harness.activeGroupEditors.find((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
    const filesTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    const extraEditor = store.add(new TestStubEditorInput(URI.file("/repo/extra.ts")));
    harness.activeGroupEditors.push(extraEditor);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(changesTab), 1);
    harness.onDidCloseEditor.fire({ editor: changesTab });
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(filesTab), 1);
    harness.onDidCloseEditor.fire({ editor: filesTab });
    harness.onDidEditorsChange.fire();
    await settle();
    await new NewChangesTabAction().run(harness.instaService);
    await new NewFileTabAction().run(harness.instaService);
    assert.deepStrictEqual(harness.activeGroupEditors.map((editor) => {
      if (editor === extraEditor) {
        return "extra";
      }
      if (editor instanceof EmptyFileEditorInput) {
        return "files";
      }
      if (editor.resource && isEqual(editor.resource, harness.sessionChangesService.getChangesEditorResource(session))) {
        return "changes";
      }
      return "other";
    }), ["extra", "changes", "files"]);
  });
  test("[managed tabs / session switch] replaces a stale Changes tab in place", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const staleChangesResource = harness.sessionChangesService.getChangesEditorResource(URI.parse("session:stale"));
    harness.activeGroupEditors.push(store.add(new TestStubEditorInput(staleChangesResource)));
    const session = makeSession(URI.parse("session:1"));
    harness.activeSessionObs.set(session, void 0);
    await settle();
    const staleClosed = harness.closedEditors.some((e) => e.resource && isEqual(e.resource, staleChangesResource));
    const incomingChangesResource = harness.sessionChangesService.getChangesEditorResource(session.resource);
    const incomingPresent = harness.activeGroupEditors.some((editor) => editor.resource && isEqual(editor.resource, incomingChangesResource));
    assert.deepStrictEqual({ staleClosed, incomingPresent, editorCount: harness.activeGroupEditors.length }, {
      staleClosed: false,
      incomingPresent: true,
      editorCount: 1
    });
  });
  test("[managed tabs / Issue 1] re-ensures the Files tab when the side pane is reopened via the aux bar alone", async () => {
    createSinglePaneController({ activateAux: true, initialPartVisibility: /* @__PURE__ */ new Map([[Parts.EDITOR_PART, false], [Parts.AUXILIARYBAR_PART, true]]) });
    await settle();
    harness.activeSessionObs.set(makeSession(URI.parse("session:new"), { status: SessionStatus.Untitled, isCreated: false }), void 0);
    await settle();
    const fileTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    assert.ok(fileTab);
    harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(fileTab), 1);
    harness.onDidCloseEditor.fire({ editor: fileTab });
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    await settle();
    assert.strictEqual(hasFilesTab(), false);
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: true });
    harness.onDidRevealSidePane.fire();
    await settle();
    assert.strictEqual(hasFilesTab(), true, "reopening via the aux bar re-ensures the Files tab");
  });
  test("[managed tabs / Issue 2] opening a file after the side pane was closed does not re-force the managed tabs", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = URI.parse("session:1");
    harness.activeSessionObs.set(makeSession(session), void 0);
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
    const changesTab = harness.activeGroupEditors.find((e) => !(e instanceof EmptyFileEditorInput) && e.resource !== void 0);
    const filesTab = harness.activeGroupEditors.find((e) => e instanceof EmptyFileEditorInput);
    for (const tab of [changesTab, filesTab]) {
      harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(tab), 1);
      harness.onDidCloseEditor.fire({ editor: tab });
    }
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: false });
    const changesResource = harness.sessionChangesService.getChangesEditorResource(session);
    harness.activeGroupEditors.push(store.add(new TestStubEditorInput(URI.file("/repo/opened.ts"))));
    harness.partVisibility.set(Parts.EDITOR_PART, true);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    harness.onDidRevealSidePane.fire();
    harness.onDidActiveEditorChange.fire();
    harness.onDidEditorsChange.fire();
    await settle();
    const hasManagedChangesTab = harness.activeGroupEditors.some((e) => e.resource && isEqual(e.resource, changesResource));
    assert.deepStrictEqual({ hasManagedChangesTab, hasFilesTab: hasFilesTab() }, { hasManagedChangesTab: false, hasFilesTab: false });
  });
  test("[managed tabs / Issue 2] toggling the empty side pane open re-populates the default managed tabs", async () => {
    createSinglePaneController({ activateAux: true });
    await settle();
    const session = URI.parse("session:1");
    harness.activeSessionObs.set(makeSession(session), void 0);
    await settle();
    for (const tab of [...harness.activeGroupEditors]) {
      harness.activeGroupEditors.splice(harness.activeGroupEditors.indexOf(tab), 1);
      harness.onDidCloseEditor.fire({ editor: tab });
    }
    harness.partVisibility.set(Parts.AUXILIARYBAR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.AUXILIARYBAR_PART, visible: false });
    harness.partVisibility.set(Parts.EDITOR_PART, false);
    harness.onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: false });
    harness.onDidEditorsChange.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: false, hasFilesTab: false });
    harness.onDidRevealSidePane.fire();
    await settle();
    assert.deepStrictEqual({ hasChangesTab: hasChangesTab(), hasFilesTab: hasFilesTab() }, { hasChangesTab: true, hasFilesTab: true });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcbGF5b3V0XFx0ZXN0XFxicm93c2VyXFxkZXNrdG9wU2Vzc2lvbkxheW91dENvbnRyb2xsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU2V0dGFibGVPYnNlcnZhYmxlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0lNZW51SXRlbSwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSwgV2lsbFNhdmVTdGF0ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRmlsZUNoYW5nZSwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IFNpbmdsZVBhbmVDaGFuZ2VzVGFiQXZhaWxhYmxlQ29udGV4dCwgU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dCwgSGFzRG9ja2VkRGV0YWlsc0NvbnRleHQsIFNpbmdsZVBhbmVGaWxlc1RhYkF2YWlsYWJsZUNvbnRleHQsIFNpbmdsZVBhbmVGaWxlc1RhYk1pc3NpbmdDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlckVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEZpbGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZWRpdG9ycy9maWxlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgTXVsdGlEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3SW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi93ZWJ2aWV3UGFuZWwvYnJvd3Nlci93ZWJ2aWV3RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRW1wdHlGaWxlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lbXB0eUZpbGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vZWRpdG9yL2RpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV2lsbE9wZW5FdmVudCwgaXNSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgTGF5b3V0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZGVza3RvcFNlc3Npb25MYXlvdXRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFNpbmdsZVBhbmVMYXlvdXRDb250cm9sbGVyLCBUT0dHTEVfREVUQUlMU19DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zaW5nbGVQYW5lTGF5b3V0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBDSEFOR0VTX1ZJRVdfQ09OVEFJTkVSX0lELCBDSEFOR0VTX1ZJRVdfSUQgfSBmcm9tICcuLi8uLi8uLi9jaGFuZ2VzL2NvbW1vbi9jaGFuZ2VzLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vY2hhbmdlcy9icm93c2VyL2NoYW5nZXNBY3Rpb25zLmpzJztcbmltcG9ydCB7IFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2Jyb3dzZXIvZmlsZXMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IE5ld0NoYW5nZXNUYWJBY3Rpb24sIE5ld0ZpbGVUYWJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9hZGRUYWJBY3Rpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RIYXJuZXNzLCBJQ3JlYXRlT3B0aW9ucywgSVRlc3RMYXlvdXRIYXJuZXNzLCBtYWtlQ2hhbmdlLCBtYWtlU2Vzc2lvbiwgVGVzdFN0dWJFZGl0b3JJbnB1dCB9IGZyb20gJy4vbGF5b3V0Q29udHJvbGxlclRlc3RVdGlscy5qcyc7XG5cbnN1aXRlKCdMYXlvdXRDb250cm9sbGVyIChkZXNrdG9wKScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGhhcm5lc3M6IElUZXN0TGF5b3V0SGFybmVzcztcblxuXHRjbGFzcyBUZXN0TGF5b3V0Q29udHJvbGxlciBleHRlbmRzIExheW91dENvbnRyb2xsZXIge1xuXHRcdHJlYWRvbmx5IHNpZGVQYW5lVG9nZ2xlczogeyBjb2xsYXBzZWQ6IGJvb2xlYW47IHByZXZpb3VzQXV4aWxpYXJ5QmFyVmlzaWJsZTogYm9vbGVhbjsgYXV4aWxpYXJ5QmFyVmlzaWJsZTogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRnZXQgaXNUb2dnbGluZ1NpZGVQYW5lKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fdG9nZ2xpbmdTaWRlUGFuZTsgfVxuXHRcdHByb3RlY3RlZCBvdmVycmlkZSBfb25TaWRlUGFuZVRvZ2dsZWQoY29sbGFwc2VkOiBib29sZWFuLCBwcmV2aW91c0F1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW4sIGF1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdHRoaXMuc2lkZVBhbmVUb2dnbGVzLnB1c2goeyBjb2xsYXBzZWQsIHByZXZpb3VzQXV4aWxpYXJ5QmFyVmlzaWJsZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZSB9KTtcblx0XHRcdHN1cGVyLl9vblNpZGVQYW5lVG9nZ2xlZChjb2xsYXBzZWQsIHByZXZpb3VzQXV4aWxpYXJ5QmFyVmlzaWJsZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZSk7XG5cdFx0fVxuXHRcdGdldFZpZXdTdGF0ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdFx0Z2V0RWRpdG9yUGFydEhpZGRlbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VkaXRvclBhcnRIaWRkZW5CeVNlc3Npb24uZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHJ1bldpdGhSZXN0b3JlKHdvcms6ICgpID0+IHZvaWQgfCBQcm9taXNlPHVua25vd24+KTogdm9pZCB7XG5cdFx0XHR0aGlzLl93aXRoU2Vzc2lvbkxheW91dFJlc3RvcmUod29yayk7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgVGVzdFNpbmdsZVBhbmVDb250cm9sbGVyIGV4dGVuZHMgU2luZ2xlUGFuZUxheW91dENvbnRyb2xsZXIge1xuXHRcdC8qKiBSdW5zIGB3b3JrYCB3aGlsZSBhIHNlc3Npb24tc3dpdGNoIGxheW91dCByZXN0b3JlIGlzIGhlbGQgKHNlZSBgX3dpdGhTZXNzaW9uTGF5b3V0UmVzdG9yZWApLiAqL1xuXHRcdHJ1bldpdGhSZXN0b3JlKHdvcms6ICgpID0+IHZvaWQgfCBQcm9taXNlPHVua25vd24+KTogdm9pZCB7XG5cdFx0XHR0aGlzLl93aXRoU2Vzc2lvbkxheW91dFJlc3RvcmUod29yayk7XG5cdFx0fVxuXHRcdGdldFZpZXdTdGF0ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdFx0Z2V0RWRpdG9yUGFydEhpZGRlbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VkaXRvclBhcnRIaWRkZW5CeVNlc3Npb24uZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ29udHJvbGxlcihvcHRpb25zOiBJQ3JlYXRlT3B0aW9ucyA9IHt9KTogVGVzdExheW91dENvbnRyb2xsZXIge1xuXHRcdGhhcm5lc3MgPSBjcmVhdGVUZXN0SGFybmVzcyhzdG9yZSwgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChoYXJuZXNzLmluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0TGF5b3V0Q29udHJvbGxlcikpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIob3B0aW9uczogSUNyZWF0ZU9wdGlvbnMgPSB7fSk6IFRlc3RTaW5nbGVQYW5lQ29udHJvbGxlciB7XG5cdFx0aGFybmVzcyA9IGNyZWF0ZVRlc3RIYXJuZXNzKHN0b3JlLCBvcHRpb25zKTtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKGhhcm5lc3MuaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RTaW5nbGVQYW5lQ29udHJvbGxlcikpO1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZUZpbGVFZGl0b3IocGF0aDogc3RyaW5nID0gJy9yZXBvL3BhY2thZ2UuanNvbicpOiBGaWxlRWRpdG9ySW5wdXQge1xuXHRcdGNvbnN0IGZpbGVFZGl0b3IgPSBPYmplY3QuY3JlYXRlKEZpbGVFZGl0b3JJbnB1dC5wcm90b3R5cGUpIGFzIEZpbGVFZGl0b3JJbnB1dDtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZmlsZUVkaXRvciwgJ3Jlc291cmNlJywgeyB2YWx1ZTogVVJJLmZpbGUocGF0aCkgfSk7XG5cdFx0cmV0dXJuIGZpbGVFZGl0b3I7XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlRGlmZkVkaXRvcigpOiBEaWZmRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBPYmplY3QuY3JlYXRlKERpZmZFZGl0b3JJbnB1dC5wcm90b3R5cGUpIGFzIERpZmZFZGl0b3JJbnB1dDtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VNdWx0aURpZmZFZGl0b3IoKTogTXVsdGlEaWZmRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBPYmplY3QuY3JlYXRlKE11bHRpRGlmZkVkaXRvcklucHV0LnByb3RvdHlwZSkgYXMgTXVsdGlEaWZmRWRpdG9ySW5wdXQ7XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlV2Vidmlld0VkaXRvcih2aWV3VHlwZTogc3RyaW5nLCBwcm92aWRlcklkPzogc3RyaW5nKTogV2Vidmlld0lucHV0IHtcblx0XHRjb25zdCBlZGl0b3IgPSBPYmplY3QuY3JlYXRlKFdlYnZpZXdJbnB1dC5wcm90b3R5cGUpIGFzIFdlYnZpZXdJbnB1dDtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZWRpdG9yLCAndmlld1R5cGUnLCB7IHZhbHVlOiB2aWV3VHlwZSB9KTtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZWRpdG9yLCAncHJvdmlkZXJJZCcsIHsgdmFsdWU6IHByb3ZpZGVySWQgfSk7XG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdGZ1bmN0aW9uIG9wZW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdGNvbnN0IGV2ZW50OiBJRWRpdG9yV2lsbE9wZW5FdmVudCA9IHsgZ3JvdXBJZDogMSwgZWRpdG9yIH07XG5cdFx0aGFybmVzcy5vbldpbGxPcGVuRWRpdG9yLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLSBbRDNdIEF1eGlsaWFyeSBiYXIgcmVzdG9yZSAtLS1cblxuXHR0ZXN0KCdbRDNjXSBoaWRlcyBzaWRlIHBhbmUgZm9yIGV4aXN0aW5nIHNlc3Npb24gd2l0aG91dCBzYXZlZCBzdGF0ZScsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdzaWRlIHBhbmUgc2hvdWxkIGJlIGhpZGRlbidcblx0XHQpO1xuXHRcdGFzc2VydC5vayghaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLCAnc2hvdWxkIG5vdCBhdXRvLW9wZW4gdGhlIEZpbGVzIHZpZXcnKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q2XSBkb2VzIG5vdCBhdXRvLW9wZW4gc2lkZSBwYW5lIGZvciBleGlzdGluZyBzZXNzaW9uIHdpdGggY2hhbmdlcycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHtcblx0XHRcdGNoYW5nZXM6IFttYWtlQ2hhbmdlKCcvZmlsZS50cycpXSxcblx0XHR9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHQnc2lkZSBwYW5lIHNob3VsZCBiZSBoaWRkZW4nXG5cdFx0KTtcblx0XHRhc3NlcnQub2soIWhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSwgJ3Nob3VsZCBub3QgYXV0by1vcGVuIHRoZSBDaGFuZ2VzIHZpZXcnKTtcblx0fSk7XG5cblx0dGVzdCgnW0QzYl0gc2hvd3MgZmlsZXMgdmlldyBmb3IgdW50aXRsZWQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDNkXSBkZWZhdWx0cyB0byBGaWxlcyB3aGlsZSB0aGUgc2Vzc2lvbiBoYXMgbm8gY2hhbmdlcycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHR9LCB7XG5cdFx0XHRvcGVuZWRGaWxlczogdHJ1ZSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDNkXSBkZWZhdWx0cyB0byBDaGFuZ2VzIG9uY2Ugb25lIG9mIHRoZSBzZXNzaW9uIGNoYXRzIGhhcyBhIGNoYW5nZScsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHtcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCxcblx0XHRcdGNoYW5nZXM6IFttYWtlQ2hhbmdlKCcvZmlsZS50cycpXSxcblx0XHR9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG9wZW5lZEZpbGVzOiBoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiBoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0fSwge1xuXHRcdFx0b3BlbmVkRmlsZXM6IGZhbHNlLFxuXHRcdFx0b3BlbmVkQ2hhbmdlczogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0QzZF0gZG9lcyBub3Qgc3dpdGNoIGEgc2lkZSBwYW5lIHRoYXQgaXMgYWxyZWFkeSBzaG93aW5nIEZpbGVzIHdoZW4gYSBjaGFuZ2UgbGFuZHMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5hY3RpdmVQYW5lQ29tcG9zaXRlSWQgPSBTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQ7XG5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdChzZXNzaW9uLmNoYW5nZXMgYXMgSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4pLnNldChbbWFrZUNoYW5nZSgnL2ZpbGUudHMnKV0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG9wZW5lZEZpbGVzOiBoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiBoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0fSwge1xuXHRcdFx0b3BlbmVkRmlsZXM6IGZhbHNlLFxuXHRcdFx0b3BlbmVkQ2hhbmdlczogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEM2RdIGRvZXMgbm90IGZvcmNlLW9wZW4gRmlsZXMgd2hlbiB0aGUgRmlsZXMgcGFuZSBpcyBoaWRkZW4nLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdC8vIFVzZXIgaGFzIGhpZGRlbiAvIHVucGlubmVkIHRoZSBGaWxlcyBwYW5lLlxuXHRcdGhhcm5lc3MucGlubmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVySWRzID0gW0NIQU5HRVNfVklFV19DT05UQUlORVJfSURdO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB9KTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHQnc2hvdWxkIG5vdCBvcGVuIHRoZSBoaWRkZW4gRmlsZXMgcGFuZSdcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHRcdCdzaG91bGQgZmFsbCBiYWNrIHRvIENoYW5nZXMgd2hlbiBGaWxlcyBpcyBoaWRkZW4nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0QzYV0gZG9lcyBub3Qgb3BlbiB2aWV3cyB3aGVuIHNlc3Npb24gaGFzIG5vIHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHtcblx0XHRcdHdvcmtzcGFjZTogeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpLCBsYWJlbDogJ3Rlc3QnLCBpY29uOiBDb2RpY29uLnJlcG8sIGZvbGRlcnM6IFtdLCByZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSwgaXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSB9LFxuXHRcdH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayghaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpKTtcblx0XHRhc3NlcnQub2soIWhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBbRDFdIENhcHR1cmUgLyByZXN0b3JlIG9uIHN3aXRjaCAtLS1cblxuXHR0ZXN0KCdbRDFdIHJlbWVtYmVycyBhdXggYmFyIGhpZGRlbiBzdGF0ZSBvbiBzZXNzaW9uIHN3aXRjaCcsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRjb25zdCBzZXNzaW9uMiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMiwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdhdXggYmFyIHNob3VsZCBiZSBoaWRkZW4gd2hlbiByZXR1cm5pbmcgdG8gc2Vzc2lvbiAxJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEMV0gcmVtZW1iZXJzIGFjdGl2ZSB2aWV3IGNvbnRhaW5lciBvbiBzZXNzaW9uIHN3aXRjaCcsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRjb25zdCBzZXNzaW9uMiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVBhbmVDb21wb3NpdGVJZCA9ICdzb21lLmN1c3RvbS52aWV3Jztcblx0XHRoYXJuZXNzLnBpbm5lZEF1eGlsaWFyeUJhckNvbnRhaW5lcklkcyA9IFsuLi5oYXJuZXNzLnBpbm5lZEF1eGlsaWFyeUJhckNvbnRhaW5lcklkcywgJ3NvbWUuY3VzdG9tLnZpZXcnXTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMiwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcygnc29tZS5jdXN0b20udmlldycpLFxuXHRcdFx0J3Nob3VsZCByZXN0b3JlIGFjdGl2ZSB2aWV3IGNvbnRhaW5lciB3aGVuIHJldHVybmluZyB0byBzZXNzaW9uIDEnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0QzY10gcmVzdG9yZXMgYW4gZXhwbGljaXQgRmlsZXMgY2hvaWNlIG9uIHNlc3Npb24gc3dpdGNoIGV2ZW4gd2hlbiB0aGUgc2Vzc2lvbiBoYXMgY2hhbmdlcycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpLCB7IGNoYW5nZXM6IFttYWtlQ2hhbmdlKCcvZmlsZS50cycpXSB9KTtcblx0XHRjb25zdCBzZXNzaW9uMiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpO1xuXG5cdFx0Ly8gVGhlIHVzZXIgZXhwbGljaXRseSBvcGVucyB0aGUgKHBpbm5lZCkgRmlsZXMgcGFuZSBmb3Igc2Vzc2lvbiAxLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5hY3RpdmVQYW5lQ29tcG9zaXRlSWQgPSBTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQ7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24yLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLFxuXHRcdFx0J3Nob3VsZCByZXN0b3JlIHRoZSB1c2VyXFwncyBleHBsaWNpdCBGaWxlcyBjaG9pY2UnXG5cdFx0KTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdFx0J3Nob3VsZCBub3Qgb3ZlcnJpZGUgdGhlIGV4cGxpY2l0IEZpbGVzIGNob2ljZSB3aXRoIENoYW5nZXMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBrZWVwcyBlZGl0b3IgYW5kIGRldGFpbCB2aXNpYmlsaXR5IHVuY2hhbmdlZCB3aGVuIHN3aXRjaGluZyBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHNlc3Npb25BID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmEnKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YicpKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtzZXNzaW9uQV0sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQiwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW3Nlc3Npb25CXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRkZXRhaWxWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHR2aXNpYmlsaXR5UmVzdG9yZXM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjYWxsID0+XG5cdFx0XHRcdGNhbGwucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgfHwgY2FsbC5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGRldGFpbFZpc2libGU6IGZhbHNlLFxuXHRcdFx0dmlzaWJpbGl0eVJlc3RvcmVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSByZXN0b3JlcyB0aGUgZGV0YWlsIHBhbmVsIGFmdGVyIGEgYnJvd3NlciB0YWIgaGlkZXMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGhhc0RvY2tlZERldGFpbHMgPSAoKSA9PiBoYXJuZXNzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShIYXNEb2NrZWREZXRhaWxzQ29udGV4dC5rZXkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0RvY2tlZERldGFpbHMoKSwgZmFsc2UsICdoaWRkZW4gdGFyZ2V0IHNob3VsZCBjbGVhciB0aGUgZWRpdG9yIGNoZXZyb24gY29udGV4dCcpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNEb2NrZWREZXRhaWxzKCksIHRydWUsICdjaGFuZ2VzIHRhcmdldCBzaG91bGQgZW5hYmxlIHRoZSBlZGl0b3IgY2hldnJvbiBjb250ZXh0Jyk7XG5cblx0XHRjb25zdCBicm93c2VyRWRpdG9yID0gT2JqZWN0LmNyZWF0ZShCcm93c2VyRWRpdG9ySW5wdXQucHJvdG90eXBlKSBhcyBCcm93c2VyRWRpdG9ySW5wdXQ7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGJyb3dzZXJFZGl0b3IsICdyZXNvdXJjZScsIHsgdmFsdWU6IFVSSS5wYXJzZSgnYnJvd3NlcjovL3Rlc3QnKSB9KTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBicm93c2VyRWRpdG9yO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNEb2NrZWREZXRhaWxzKCksIGZhbHNlLCAnYnJvd3NlciB0YXJnZXQgc2hvdWxkIGNsZWFyIHRoZSBlZGl0b3IgY2hldnJvbiBjb250ZXh0Jyk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdicm93c2VyIHRhYnMgc2hvdWxkIGhpZGUgdGhlIGRldGFpbCBwYW5lbCdcblx0XHQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBzdG9yZS5hZGQobmV3IEVtcHR5RmlsZUVkaXRvcklucHV0KHVuZGVmaW5lZCwgaGFybmVzcy5sYXlvdXRTZXJ2aWNlKSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0RvY2tlZERldGFpbHMoKSwgdHJ1ZSwgJ2ZpbGVzIHRhcmdldCBzaG91bGQgZW5hYmxlIHRoZSBlZGl0b3IgY2hldnJvbiBjb250ZXh0Jyk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksIHRydWUsXG5cdFx0XHQnZmlsZSB0YWJzIHNob3VsZCBsZWF2ZSB0aGUgcmVzdG9yZWQgZGV0YWlsIHBhbmVsIHZpc2libGUnKTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHQnZmlsZSB0YWJzIHNob3VsZCByZW9wZW4gdGhlIEZpbGVzIGNvbnRhaW5lciBhZnRlciBicm93c2VyIGhpZGVzIGl0J1xuXHRcdCk7XG5cblx0XHQvLyBBIHNlYXJjaCB0YWIgKGFueSBub24tY2hhbmdlcy9ub24tZmlsZSBlZGl0b3IpIGhhcyBubyBkZXRhaWwgcGFuZWwsIHNvXG5cdFx0Ly8gdGhlIGNoZXZyb24gY29udGV4dCBtdXN0IGNsZWFyIGp1c3QgbGlrZSB0aGUgYnJvd3NlciB0YWIgZG9lcy5cblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KFVSSS5wYXJzZSgnc2VhcmNoLWVkaXRvcjovL3Rlc3QnKSkpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNEb2NrZWREZXRhaWxzKCksIGZhbHNlLCAnc2VhcmNoIHRhcmdldCBzaG91bGQgY2xlYXIgdGhlIGVkaXRvciBjaGV2cm9uIGNvbnRleHQnKTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBjbGVhcnMgZG9ja2VkLWRldGFpbHMgY29udGV4dCB3aGVuIG5vIHNlc3Npb24gaXMgYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFybmVzcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoSGFzRG9ja2VkRGV0YWlsc0NvbnRleHQua2V5KSwgdHJ1ZSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhcm5lc3MuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKEhhc0RvY2tlZERldGFpbHNDb250ZXh0LmtleSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBIaWRlIEVkaXRvciB3aGlsZSBhIEJyb3dzZXIgdGFiIGlzIGFjdGl2ZSBzaG93cyB0aGUgQ2hhbmdlcy9GaWxlcyBmYWxsYmFjayBpbnN0ZWFkIG9mIGhpZGluZyBpdCBhZ2FpbicsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgaGFzRG9ja2VkRGV0YWlscyA9ICgpID0+IGhhcm5lc3MuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKEhhc0RvY2tlZERldGFpbHNDb250ZXh0LmtleSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cblx0XHRjb25zdCBicm93c2VyRWRpdG9yID0gT2JqZWN0LmNyZWF0ZShCcm93c2VyRWRpdG9ySW5wdXQucHJvdG90eXBlKSBhcyBCcm93c2VyRWRpdG9ySW5wdXQ7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGJyb3dzZXJFZGl0b3IsICdyZXNvdXJjZScsIHsgdmFsdWU6IFVSSS5wYXJzZSgnYnJvd3NlcjovL3Rlc3QnKSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gYnJvd3NlckVkaXRvcjtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksIGZhbHNlLCAnYnJvd3NlciB0YWIgc2hvdWxkIGhpZGUgdGhlIGRldGFpbCBwYW5lbCB3aGlsZSB0aGUgZWRpdG9yIGFyZWEgaXMgdmlzaWJsZScpO1xuXG5cdFx0Ly8gTWlycm9yIEhpZGVNYWluRWRpdG9yUGFydEFjdGlvbi5ydW4oKTogcmV2ZWFsIHRoZSBhdXhpbGlhcnkgYmFyLCB0aGVuIGhpZGUgdGhlIGVkaXRvciBwYXJ0LlxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MubGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0aGFybmVzcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLCB0cnVlLCAndGhlIGRldGFpbCBwYW5lbCBtdXN0IHN0YXkgcmV2ZWFsZWQgb25jZSB0aGUgZWRpdG9yIGFyZWEgaXMgaGlkZGVuLCBub3QgYmUgZm9yY2VkIHNodXQgYWdhaW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRG9ja2VkRGV0YWlscygpLCB0cnVlLCAndGhlIENoYW5nZXMvRmlsZXMgZmFsbGJhY2sgc2hvdWxkIGVuYWJsZSB0aGUgZWRpdG9yIGNoZXZyb24gY29udGV4dCcpO1xuXHRcdGFzc2VydC5vayhoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKENIQU5HRVNfVklFV19DT05UQUlORVJfSUQpLCAnYSBjcmVhdGVkIHNlc3Npb24gc2hvdWxkIGZhbGwgYmFjayB0byB0aGUgQ2hhbmdlcyBjb250YWluZXInKTtcblxuXHRcdC8vIFNob3cgRWRpdG9yIHdoaWxlIHN0aWxsIG9uIEJyb3dzZXIgbXVzdCByZXN0b3JlIHRoZSBcIkJyb3dzZXIgaGlkZXMgdGhlIGRldGFpbFwiIGludmFyaWFudC5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3MubGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCBQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLCBmYWxzZSwgJ3RoZSBkZXRhaWwgcGFuZWwgc2hvdWxkIGhpZGUgYWdhaW4gb25jZSBCcm93c2VyIGlzIGFjdGl2ZSB3aXRoIHRoZSBlZGl0b3IgYXJlYSB2aXNpYmxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gaGlkZXMgdGhlIGRldGFpbCBwYW5lbCB3aGVuIHRoZSBtYWluIGVkaXRvciBwYXJ0IGlzIGVtcHR5IGFuZCBrZWVwcyBpdCBjbG9zZWQgb24gdGFiIG9wZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGhhc0RvY2tlZERldGFpbHMgPSAoKSA9PiBoYXJuZXNzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShIYXNEb2NrZWREZXRhaWxzQ29udGV4dC5rZXkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNEb2NrZWREZXRhaWxzKCksIHRydWUsICdub24tZW1wdHkgbm8tYWN0aXZlLWVkaXRvciBmYWxsYmFjayBzaG91bGQga2VlcCBjb250ZXh0dWFsIGRldGFpbCBhY3RpdmUnKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gZmFsc2U7XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzRG9ja2VkRGV0YWlsczogaGFzRG9ja2VkRGV0YWlscygpLFxuXHRcdFx0aGlkZGVuQ2FsbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRoYXNEb2NrZWREZXRhaWxzOiBmYWxzZSxcblx0XHRcdGhpZGRlbkNhbGxzOiAxLFxuXHRcdH0pO1xuXG5cdFx0Ly8gQSByZWFsIGZpbGUgdGFiIHJlLW9wZW5zOiB0aGUgY29udGV4dCBrZXkgZmxpcHMgYmFjayBvbiBhbmQgRGV0YWlscyBpcyByZXN0b3JlZC5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gdHJ1ZTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gbWFrZUZpbGVFZGl0b3IoKTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzRG9ja2VkRGV0YWlsczogaGFzRG9ja2VkRGV0YWlscygpLFxuXHRcdFx0cmV2ZWFsczogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLmxlbmd0aCxcblx0XHRcdG9wZW5lZEZpbGVzOiBoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0fSwge1xuXHRcdFx0aGFzRG9ja2VkRGV0YWlsczogdHJ1ZSxcblx0XHRcdHJldmVhbHM6IDEsXG5cdFx0XHRvcGVuZWRGaWxlczogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW2NtZCtuXSBrZWVwcyB0aGUgZGV0YWlsIHBhbmVsIHZpc2libGUgZm9yIGEgbmV3LXNlc3Npb24gdmlldyB3aXRoIGEgdHJhbnNpZW50bHkgZW1wdHkgZWRpdG9yIGdyb3VwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0Ly8gVGhlIEZpbGVzIHRhYiBpcyBiZWluZyAocmUpZW5zdXJlZCwgc28gdGhlIGVkaXRvciBncm91cCBpcyB0cmFuc2llbnRseSBlbXB0eS5cblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gZmFsc2U7XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFRoZSBkZXRhaWwgbXVzdCBOT1QgYmUgaGlkZGVuIGZvciB0aGUgbmV3LXNlc3Npb24gdmlldyAodW5saWtlIGEgY3JlYXRlZFxuXHRcdC8vIHNlc3Npb24sIHdoZXJlIGFuIGVtcHR5IGdyb3VwIG1lYW5zIHRoZSB3aG9sZSBzaWRlIHBhbmUgd2FzIGNsb3NlZCkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSkubGVuZ3RoLFxuXHRcdFx0MCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0ga2VlcHMgdGhlIGRldGFpbCBwYW5lbCBjbG9zZWQgYnkgZGVmYXVsdCB3aGVuIGEgZmlsZS9jaGFuZ2VzIGVkaXRvciBpcyBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gRGV0YWlsIGNsb3NlZCBieSB0aGUgZ2xvYmFsIHZpc2liaWxpdHkgY2hvaWNlLCBub3QgYSBicm93c2VyLXRhYiBoaWRlLlxuXHRcdGhhcm5lc3MubGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gQSBmaWxlIHRhYiBiZWNvbWVzIGFjdGl2ZTogdGhlIGRldGFpbCBtdXN0IHN0YXkgY2xvc2VkIChubyBmb3JjZS1yZXZlYWwpLlxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBtYWtlRmlsZUVkaXRvcigpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJldmVhbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKS5sZW5ndGgsXG5cdFx0XHRvcGVuZWRGaWxlczogaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLFxuXHRcdH0sIHtcblx0XHRcdHJldmVhbHM6IDAsXG5cdFx0XHRvcGVuZWRGaWxlczogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gbWFwcyBhbGwgZGlmZiBlZGl0b3JzIHRvIENoYW5nZXMgYW5kIGFsbCBmaWxlIGVkaXRvcnMgdG8gRmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBvcGVuZWRDb250YWluZXJzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgW21ha2VEaWZmRWRpdG9yKCksIG1ha2VNdWx0aURpZmZFZGl0b3IoKSwgbWFrZUZpbGVFZGl0b3IoJy9vdXRzaWRlL3JlcG8udHh0JyldKSB7XG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gZWRpdG9yO1xuXHRcdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0b3BlbmVkQ29udGFpbmVycy5wdXNoKGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnNbaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5sZW5ndGggLSAxXSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVuZWRDb250YWluZXJzLCBbXG5cdFx0XHRDSEFOR0VTX1ZJRVdfQ09OVEFJTkVSX0lELFxuXHRcdFx0Q0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCxcblx0XHRcdFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBhcHBsaWVzIHRoZSBhY3RpdmUgZWRpdG9yIGRldGFpbCB3aGVuIHRoZSBoaWRkZW4gZGV0YWlsIHBhbmVsIGlzIHJlb3BlbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gbWFrZUZpbGVFZGl0b3IoKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0aGFybmVzcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gbWFrZURpZmZFZGl0b3IoKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgb3BlbmVkV2hpbGVIaWRkZW4gPSBbLi4uaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVyc107XG5cdFx0aGFybmVzcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuZWRXaGlsZUhpZGRlbixcblx0XHRcdG9wZW5lZEFmdGVyUmV2ZWFsOiBoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLFxuXHRcdH0sIHtcblx0XHRcdG9wZW5lZFdoaWxlSGlkZGVuOiBbXSxcblx0XHRcdG9wZW5lZEFmdGVyUmV2ZWFsOiBbQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gbWFwcyBNYXJrZG93biBwcmV2aWV3IGVkaXRvcnMgdG8gRmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBvcGVuZWRDb250YWluZXJzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbdmlld1R5cGUsIHByb3ZpZGVySWRdIG9mIFtcblx0XHRcdFsnbWFpblRocmVhZFdlYnZpZXctbWFya2Rvd24ucHJldmlldycsICdtYXJrZG93bi5wcmV2aWV3J10sXG5cdFx0XHRbJ3ZzY29kZS5tYXJrZG93bi5lZGl0b3InLCB1bmRlZmluZWRdLFxuXHRcdFx0Wyd2c2NvZGUubWFya2Rvd24ucHJldmlldy5lZGl0b3InLCB1bmRlZmluZWRdLFxuXHRcdF0gYXMgY29uc3QpIHtcblx0XHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBtYWtlV2Vidmlld0VkaXRvcih2aWV3VHlwZSwgcHJvdmlkZXJJZCk7XG5cdFx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRvcGVuZWRDb250YWluZXJzLnB1c2goaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVyc1toYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmxlbmd0aCAtIDFdKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZW5lZENvbnRhaW5lcnMsIFtcblx0XHRcdFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCxcblx0XHRcdFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCxcblx0XHRcdFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBkb2VzIG5vdCBmb3JjZS1yZXZlYWwgdGhlIGRldGFpbCBvbiBlZGl0b3IgYWN0aXZhdGlvbiwgZHVyaW5nIG9yIGFmdGVyIGEgcmVzdG9yZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gVGhlIGRldGFpbCBpcyBoaWRkZW4gd2hpbGUgdGhlIGVkaXRvciByZW1haW5zIHZpc2libGUuXG5cdFx0aGFybmVzcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gSG9sZCBhIHNlc3Npb24tc3dpdGNoIHJlc3RvcmUgb3Blbi4gVGhlIHJlc3RvcmUgbWFrZXMgYSBmaWxlIGVkaXRvclxuXHRcdC8vIGFjdGl2ZTsgdGhhdCBlZGl0b3IgY2hhbmdlIG11c3QgTk9UIHJldmVhbCB0aGUgZGV0YWlsLlxuXHRcdGxldCByZWxlYXNlUmVzdG9yZSE6ICgpID0+IHZvaWQ7XG5cdFx0Y29uc3QgcmVzdG9yZUdhdGUgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgcmVsZWFzZVJlc3RvcmUgPSByZXNvbHZlOyB9KTtcblx0XHRjb250cm9sbGVyLnJ1bldpdGhSZXN0b3JlKCgpID0+IHJlc3RvcmVHYXRlKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBtYWtlRmlsZUVkaXRvcigpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSkubGVuZ3RoLFxuXHRcdFx0MCxcblx0XHRcdCd0aGUgZGV0YWlsIG11c3Qgc3RheSBjbG9zZWQgZHVyaW5nIGEgc2Vzc2lvbi1zd2l0Y2ggcmVzdG9yZScpO1xuXG5cdFx0Ly8gQWZ0ZXIgdGhlIHJlc3RvcmUgZW5kcywgYSBwbGFpbiBlZGl0b3IgYWN0aXZhdGlvbiBzdGlsbCBkb2VzIG5vdCByZXZlYWxcblx0XHQvLyB0aGUgZ2xvYmFsbHkgaGlkZGVuIGRldGFpbC5cblx0XHRyZWxlYXNlUmVzdG9yZSgpO1xuXHRcdGF3YWl0IHJlc3RvcmVHYXRlO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBtYWtlRmlsZUVkaXRvcigpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSkubGVuZ3RoLFxuXHRcdFx0MCxcblx0XHRcdCd0aGUgZGV0YWlsIHN0YXlzIGNsb3NlZCBieSBkZWZhdWx0IGFmdGVyIHRoZSByZXN0b3JlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tTY2VuYXJpbyBDXSBkb2VzIG5vdCByZS1yZXZlYWwgdGhlIGRldGFpbCBvbiByZWxvYWQgd2hlbiB0aGUgd2hvbGUgc2lkZSBwYW5lIHdhcyBjbG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gV2hvbGUgc2lkZSBwYW5lIGNsb3NlZCAoYXMgcGVyc2lzdGVkIGFjcm9zcyBhIHJlbG9hZCk6IGJvdGggdGhlIGVkaXRvclxuXHRcdC8vIGNvbnRlbnQgYW5kIHRoZSBkZXRhaWwgYXJlIGhpZGRlbi5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblxuXHRcdC8vIFRoZSByZXN0b3JlZCBtYW5hZ2VkIHRhYiBiZWNvbWVzIGFjdGl2ZTsgdGhlIGRldGFpbCBtdXN0IE5PVCByZS1yZXZlYWwuXG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IHN0b3JlLmFkZChuZXcgRW1wdHlGaWxlRWRpdG9ySW5wdXQodW5kZWZpbmVkLCBoYXJuZXNzLmxheW91dFNlcnZpY2UpKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLmxlbmd0aCxcblx0XHRcdDApO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIGNhcnJpZXMgYW4gb3BlbiBzaWRlIHBhbmUgdG8gdGhlIG5leHQgc2Vzc2lvbiBpbnN0ZWFkIG9mIHJlc3RvcmluZyBzdGFsZSBzZXNzaW9uIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUsIHJldmVhbEF1eGlsaWFyeUJhck9uT3BlbjogdHJ1ZSwgd29ya3NwYWNlRm9sZGVyczogW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSB9XSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb25BID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmEnKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YicpKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtzZXNzaW9uQV0sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQiwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW3Nlc3Npb25CXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXg6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdGVkaXRvcjogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdH0sIHtcblx0XHRcdGF1eDogdHJ1ZSxcblx0XHRcdGVkaXRvcjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSByZXRhaW5zIHRoZSBzaGFyZWQgRXhpc3RpbmcgcHJvZmlsZSB0aHJvdWdoIHRyYW5zaWVudCBlZGl0b3IgcmVzdG9yYXRpb24gb24gRXhpc3RpbmctdG8tRXhpc3RpbmcgbmF2aWdhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoe1xuXHRcdFx0YWN0aXZhdGVBdXg6IHRydWUsXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXJzOiBbeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpIH1dLFxuXHRcdFx0c2lkZVBhbmVWaXNpYmlsaXR5U3RhdGU6IHtcblx0XHRcdFx0bmV3U2Vzc2lvbjogeyBlZGl0b3JWaXNpYmxlOiBmYWxzZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRleGlzdGluZ1Nlc3Npb246IHsgZWRpdG9yVmlzaWJsZTogdHJ1ZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb25BID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmEnKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YicpKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cblx0XHRoYXJuZXNzLm9uQXBwbHlXb3JraW5nU2V0ID0gKCkgPT4ge1xuXHRcdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gZmFsc2U7XG5cdFx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0fTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25CLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSB0cnVlO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJSZXZlYWxzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoY2FsbCA9PiBjYWxsLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmICFjYWxsLmhpZGRlbikubGVuZ3RoLFxuXHRcdFx0cGVyU2Vzc2lvblZpZXdTdGF0ZTogY29udHJvbGxlci5nZXRWaWV3U3RhdGUoc2Vzc2lvbkIucmVzb3VyY2UpLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGF1eGlsaWFyeUJhclJldmVhbHM6IDAsXG5cdFx0XHRwZXJTZXNzaW9uVmlld1N0YXRlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gc3dpdGNoZXMgRXhpc3RpbmcgZGV0YWlsIGNvbnRlbnQgb25seSBhZnRlciB0aGUgaW5jb21pbmcgZWRpdG9yIHJlc3RvcmUgc2V0dGxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBzZXNzaW9uQSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjphJykpO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmInKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gbWFrZUZpbGVFZGl0b3IoKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0bGV0IHJlbGVhc2VSZXN0b3JlITogKCkgPT4gdm9pZDtcblx0XHRjb25zdCByZXN0b3JlR2F0ZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gcmVsZWFzZVJlc3RvcmUgPSByZXNvbHZlKTtcblx0XHRjb250cm9sbGVyLnJ1bldpdGhSZXN0b3JlKCgpID0+IHJlc3RvcmVHYXRlKTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQiwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShzZXNzaW9uQi5yZXNvdXJjZSkpKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLCBbQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRF0sXG5cdFx0XHQnYSBjb25jcmV0ZSBpbmNvbWluZyBlZGl0b3IgbWF5IHNlbGVjdCBpdHMgY29udGVudCBiZWZvcmUgcmVzdG9yZS1lbmQgd2l0aG91dCBvcGVuaW5nIG91dGdvaW5nIEZpbGVzJyk7XG5cblx0XHRyZWxlYXNlUmVzdG9yZSgpO1xuXHRcdGF3YWl0IHJlc3RvcmVHYXRlO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmF0KC0xKSwgQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gcGVyc2lzdHMgcmVzaXplLWRyaXZlbiBEZXRhaWxzIHZpc2liaWxpdHkgZm9yIEV4aXN0aW5nIFNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpleGlzdGluZycpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlLCBzb3VyY2U6ICdyZXNpemUnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdEpTT04ucGFyc2UoaGFybmVzcy5zdG9yYWdlU2VydmljZS5nZXQoJ3Nlc3Npb25zLnNpbmdsZVBhbmUuc2lkZVBhbmVWaXNpYmlsaXR5JywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgPz8gJycpLFxuXHRcdFx0e1xuXHRcdFx0XHRuZXdTZXNzaW9uOiB7IGVkaXRvclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlIH0sXG5cdFx0XHRcdGV4aXN0aW5nU2Vzc2lvbjogeyBlZGl0b3JWaXNpYmxlOiB0cnVlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tCMl0gY2FwdHVyZXMgZWRpdG9yLXBhcnQgaGlkZGVuIHN0YXRlIGVhZ2VybHkgd2hlbiB0aGUgdXNlciBjbG9zZXMgdGhlIHNpZGUgcGFuZScsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBVc2VyIGNsb3NlcyB0aGUgc2lkZSBwYW5lIChlZGl0b3IgcGFydCBoaWRkZW4pIHdoaWxlIG9uIHRoZSBzZXNzaW9uLlxuXHRcdHNldFBhcnRWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5nZXRFZGl0b3JQYXJ0SGlkZGVuKHNlc3Npb24ucmVzb3VyY2UpLCB0cnVlLFxuXHRcdFx0J2VkaXRvci1wYXJ0IGhpZGRlbiBtdXN0IGJlIGNhcHR1cmVkIGF0IHRoZSBtb21lbnQgdGhlIHVzZXIgY2xvc2VzIGl0Jyk7XG5cblx0XHQvLyBVc2VyIHJlb3BlbnMgaXQuXG5cdFx0c2V0UGFydFZpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmdldEVkaXRvclBhcnRIaWRkZW4oc2Vzc2lvbi5yZXNvdXJjZSksIGZhbHNlLFxuXHRcdFx0J2VkaXRvci1wYXJ0IGhpZGRlbiBtdXN0IHVwZGF0ZSB3aGVuIHRoZSB1c2VyIHJlb3BlbnMgaXQnKTtcblx0fSk7XG5cblx0dGVzdCgnW0IyXSBhIGxhdGVyIHRyYW5zaWVudCBlZGl0b3IgcmV2ZWFsIGRvZXMgbm90IG92ZXJ3cml0ZSBhIHNlc3Npb25cXCdzIGNhcHR1cmVkIGNsb3NlZCBzdGF0ZSBkdXJpbmcgYSBzd2l0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uQSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjphJykpO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmInKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uQSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEE6IHVzZXIgY2xvc2VzIHRoZSBlZGl0b3IgcGFydCAtPiBjYXB0dXJlZCBoaWRkZW4uXG5cdFx0c2V0UGFydFZpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5nZXRFZGl0b3JQYXJ0SGlkZGVuKHNlc3Npb25BLnJlc291cmNlKSwgdHJ1ZSk7XG5cblx0XHQvLyBTaW11bGF0ZSB0aGUgc3dpdGNoLXRpbWUgcmFjZTogd2hpbGUgc3dpdGNoaW5nIHRvIEIgdGhlIGVkaXRvciBwYXJ0IGlzXG5cdFx0Ly8gcmV2ZWFsZWQgYnkgQidzIGxheW91dCByZXN0b3JlICh0aGUgY2FwdHVyZSBsaXN0ZW5lciBpZ25vcmVzIGNoYW5nZXNcblx0XHQvLyBkdXJpbmcgYSByZXN0b3JlKS4gQSdzIGNhcHR1cmVkIGNsb3NlZCBzdGF0ZSBtdXN0IGJlIHByZXNlcnZlZC5cblx0XHRjb250cm9sbGVyLnJ1bldpdGhSZXN0b3JlKCgpID0+IHtcblx0XHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkIsIHVuZGVmaW5lZCk7XG5cdFx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udHJvbGxlci5nZXRFZGl0b3JQYXJ0SGlkZGVuKHNlc3Npb25BLnJlc291cmNlKSwgdHJ1ZSxcblx0XHRcdCdhIHJlc3RvcmUtZHJpdmVuIGVkaXRvciByZXZlYWwgbXVzdCBub3Qgb3ZlcndyaXRlIHNlc3Npb24gQVxcJ3MgY2FwdHVyZWQgY2xvc2VkIHN0YXRlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENF0ga2VlcHMgdGhlIG9wZW4gc2lkZSBwYW5lIG9uIGl0cyBjdXJyZW50IHZpZXcgd2hlbiBhIG5ldyBzZXNzaW9uIGlzIHN1Ym1pdHRlZCcsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpKTtcblxuXHRcdC8vIEF1eCBiYXIgaXMgb3BlbiBvbiB0aGUgbmV3LXNlc3Npb24gdmlldywgc2hvd2luZyBGaWxlcy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5hY3RpdmVQYW5lQ29tcG9zaXRlSWQgPSBTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQ7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0KHNlc3Npb24uaXNDcmVhdGVkIGFzIElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoaWRkZW46IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHRcdHZpZXdTdGF0ZTogY29udHJvbGxlci5nZXRWaWV3U3RhdGUoc2Vzc2lvbi5yZXNvdXJjZSksXG5cdFx0fSwge1xuXHRcdFx0aGlkZGVuOiBmYWxzZSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IGZhbHNlLFxuXHRcdFx0dmlld1N0YXRlOiB7XG5cdFx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUsXG5cdFx0XHRcdGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lELFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q0XSBrZWVwcyB0aGUgc2lkZSBwYW5lIGNsb3NlZCB3aGVuIGEgbmV3IHNlc3Npb24gaXMgc3VibWl0dGVkIHdpdGggdGhlIGF1eCBiYXIgaGlkZGVuJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVXNlciBoaWRlcyB0aGUgYXV4IGJhciBvbiB0aGUgbmV3LXNlc3Npb24gdmlldy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHQoc2Vzc2lvbi5pc0NyZWF0ZWQgYXMgSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPikuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSxcblx0XHRcdCdzaWRlIHBhbmUgc2hvdWxkIHN0YXkgY2xvc2VkIGFmdGVyIHRoZSBuZXcgc2Vzc2lvbiBpcyBzdWJtaXR0ZWQnXG5cdFx0KTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdFx0J0NoYW5nZXMgdmlldyBzaG91bGQgbm90IGJlIHNob3duIHdoZW4gdGhlIGF1eCBiYXIgaXMgaGlkZGVuJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENF0gc2hvd3MgRmlsZXMgd2hlbiBhIGhpZGRlbiBzaWRlIHBhbmUgaXMgb3BlbmVkIGFmdGVyIGEgY2hhbmdlLWZyZWUgc2Vzc2lvbiBpcyBzdWJtaXR0ZWQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cblx0XHQoc2Vzc2lvbi5pc0NyZWF0ZWQgYXMgSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPikuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlUGFuZUNvbXBvc2l0ZUlkID0gU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG9wZW5lZEZpbGVzOiBoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiBoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0fSwge1xuXHRcdFx0b3BlbmVkRmlsZXM6IHRydWUsXG5cdFx0XHRvcGVuZWRDaGFuZ2VzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q0XSBzaG93cyBDaGFuZ2VzIHdoZW4gYSBoaWRkZW4gc2lkZSBwYW5lIGlzIG9wZW5lZCBhZnRlciB0aGUgc2Vzc2lvbiBwcm9kdWNlZCBhIGNoYW5nZScsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblxuXHRcdChzZXNzaW9uLmlzQ3JlYXRlZCBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHQoc2Vzc2lvbi5jaGFuZ2VzIGFzIElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+KS5zZXQoW21ha2VDaGFuZ2UoJy9maWxlLnRzJyldLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZVBhbmVDb21wb3NpdGVJZCA9IFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRDtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuZWRGaWxlczogaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLFxuXHRcdFx0b3BlbmVkQ2hhbmdlczogaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdH0sIHtcblx0XHRcdG9wZW5lZEZpbGVzOiBmYWxzZSxcblx0XHRcdG9wZW5lZENoYW5nZXM6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENF0gcmVjb3JkcyBGaWxlcyB3aGVuIGEgY2hhbmdlLWZyZWUgc2Vzc2lvbiBmYWxscyBiYWNrIGZyb20gYW4gaW52YWxpZCBzYXZlZCBjb250YWluZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHtcblx0XHRcdGxheW91dFN0YXRlOiBbe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0dmlld1N0YXRlOiB7XG5cdFx0XHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRcdFx0YXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiAnbWlzc2luZy52aWV3Jyxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3BlbmVkRmlsZXM6IGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdHZpZXdTdGF0ZTogY29udHJvbGxlci5nZXRWaWV3U3RhdGUoc2Vzc2lvbi5yZXNvdXJjZSksXG5cdFx0fSwge1xuXHRcdFx0b3BlbmVkRmlsZXM6IHRydWUsXG5cdFx0XHR2aWV3U3RhdGU6IHtcblx0XHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHRcdFx0YXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiBTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDRdIHJlY29yZHMgQ2hhbmdlcyB3aGVuIGEgc2Vzc2lvbiB3aXRoIGNoYW5nZXMgZmFsbHMgYmFjayBmcm9tIGFuIGludmFsaWQgc2F2ZWQgY29udGFpbmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpLCB7IGNoYW5nZXM6IFttYWtlQ2hhbmdlKCcvZmlsZS50cycpXSB9KTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcih7XG5cdFx0XHRsYXlvdXRTdGF0ZTogW3tcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdHZpZXdTdGF0ZToge1xuXHRcdFx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlLFxuXHRcdFx0XHRcdGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogJ21pc3NpbmcudmlldycsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG9wZW5lZENoYW5nZXM6IGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHRcdHZpZXdTdGF0ZTogY29udHJvbGxlci5nZXRWaWV3U3RhdGUoc2Vzc2lvbi5yZXNvdXJjZSksXG5cdFx0fSwge1xuXHRcdFx0b3BlbmVkQ2hhbmdlczogdHJ1ZSxcblx0XHRcdHZpZXdTdGF0ZToge1xuXHRcdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLFxuXHRcdFx0XHRhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IENIQU5HRVNfVklFV19DT05UQUlORVJfSUQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDRdIHJlbWVtYmVycyBGaWxlcyB3aGVuIHRoZSB1c2VyIGNob29zZXMgaXQgYWZ0ZXIgdGhlIHNlc3Npb24gaXMgc3VibWl0dGVkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblxuXHRcdChzZXNzaW9uMS5pc0NyZWF0ZWQgYXMgSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPikuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5hY3RpdmVQYW5lQ29tcG9zaXRlSWQgPSBTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQ7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24yLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuZWRGaWxlczogaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLFxuXHRcdFx0b3BlbmVkQ2hhbmdlczogaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdH0sIHtcblx0XHRcdG9wZW5lZEZpbGVzOiB0cnVlLFxuXHRcdFx0b3BlbmVkQ2hhbmdlczogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBbRDJdIExpdmUgdmlzaWJpbGl0eSB0cmFja2luZyAobmV3LXNlc3Npb24gc2hhcmVkIHN0YXRlKSAtLS1cblxuXHR0ZXN0KCdbRDJdIHJlbWVtYmVycyBoaWRkZW4gYXV4IGJhciBhY3Jvc3MgbmV3ICh1bnRpdGxlZCkgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHVudGl0bGVkMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp1bnRpdGxlZDEnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfSk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246ZXhpc3RpbmcnKSk7XG5cdFx0Y29uc3QgdW50aXRsZWQyID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkMicpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB9KTtcblxuXHRcdC8vIE9wZW4gYSBuZXcgKHVudGl0bGVkKSBzZXNzaW9uIFx1MjAxNCBhdXggYmFyIHNob3dzIHRoZSBGaWxlcyB2aWV3LlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQxLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCkpO1xuXG5cdFx0Ly8gVXNlciBoaWRlcyB0aGUgYXV4IGJhciBvbiB0aGUgbmV3LXNlc3Npb24gdmlldy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cblx0XHQvLyBTd2l0Y2ggdG8gYW4gZXhpc3Rpbmcgc2Vzc2lvbiBhbmQgYmFjayB0byBhIGJyYW5kIG5ldyAodW50aXRsZWQpIHNlc3Npb24uXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChleGlzdGluZywgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQyLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eCBiYXIgc2hvdWxkIHN0YXkgaGlkZGVuIG9uIHRoZSBuZXh0IG5ldyBzZXNzaW9uJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdCdzaG91bGQgbm90IHJlLW9wZW4gdGhlIEZpbGVzIHZpZXcgb24gdGhlIG5leHQgbmV3IHNlc3Npb24nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0QyXSBwZXJzaXN0cyBoaWRkZW4gbmV3LXNlc3Npb24gYXV4IGJhciB0byBzdG9yYWdlIGFuZCByZXN0b3JlcyBpdCBhZnRlciByZWxvYWQnLCAoKSA9PiB7XG5cdFx0Ly8gRmlyc3QgbGlmZXRpbWU6IHVzZXIgaGlkZXMgdGhlIGF1eCBiYXIgb24gdGhlIG5ldy1zZXNzaW9uIHZpZXcuXG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHVudGl0bGVkMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp1bnRpdGxlZDEnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZDEsIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0SlNPTi5wYXJzZShoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLmdldCgnc2Vzc2lvbnMubmV3U2Vzc2lvblZpZXdTdGF0ZScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpID8/ICcnKSxcblx0XHRcdHsgYXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UgfSxcblx0XHRcdCdzdGF0ZSBzaG91bGQgYmUgcGVyc2lzdGVkIHRvIHN0b3JhZ2UnXG5cdFx0KTtcblxuXHRcdHN0b3JlLmNsZWFyKCk7XG5cblx0XHQvLyBTZWNvbmQgbGlmZXRpbWUgKHJlbG9hZCk6IGEgZnJlc2ggY29udHJvbGxlciB3aXRoIHRoZSBwZXJzaXN0ZWQgc3RhdGUuXG5cdFx0Y3JlYXRlQ29udHJvbGxlcih7IG5ld1Nlc3Npb25WaWV3U3RhdGU6IHsgYXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UgfSB9KTtcblx0XHRjb25zdCB1bnRpdGxlZDIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQyJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZDIsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHQnYXV4IGJhciBzaG91bGQgc3RheSBoaWRkZW4gYWZ0ZXIgcmVsb2FkJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdCdzaG91bGQgbm90IHJlLW9wZW4gdGhlIEZpbGVzIHZpZXcgYWZ0ZXIgcmVsb2FkJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEM2JdIGlnbm9yZXMgbWFsZm9ybWVkIHBlcnNpc3RlZCBuZXctc2Vzc2lvbiBzdGF0ZSBhbmQgZG9lcyBub3QgZm9yY2UtaGlkZSB0aGUgYXV4IGJhcicsICgpID0+IHtcblx0XHQvLyBQZXJzaXN0ZWQgb2JqZWN0IGlzIG1pc3NpbmcgdGhlIGBhdXhpbGlhcnlCYXJWaXNpYmxlYCBib29sZWFuLlxuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoeyBuZXdTZXNzaW9uVmlld1N0YXRlUmF3OiBKU09OLnN0cmluZ2lmeSh7IGZvbzogJ2JhcicgfSkgfSk7XG5cdFx0Y29uc3QgdW50aXRsZWQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdtYWxmb3JtZWQgc3RhdGUgbXVzdCBub3QgZm9yY2UtaGlkZSB0aGUgYXV4IGJhcidcblx0XHQpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSxcblx0XHRcdCdzaG91bGQgZmFsbCBiYWNrIHRvIHRoZSBkZWZhdWx0IEZpbGVzIHZpZXcnXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLmdldCgnc2Vzc2lvbnMubmV3U2Vzc2lvblZpZXdTdGF0ZScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0J21hbGZvcm1lZCBzdGF0ZSBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIHN0b3JhZ2UnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q2XSBkb2VzIG5vdCByZS1yZXZlYWwgYXV4IGJhciBhZnRlciB1c2VyIGhpZGVzIGl0IHdoZW4gc2Vzc2lvbiBjaGFuZ2VzIHN0YXRlIHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBVc2VyIGhpZGVzIHRoZSBhdXggYmFyIChTaWRlIFBhbmVsKSB3aXRob3V0IHN3aXRjaGluZyBzZXNzaW9ucy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycyA9IFtdO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBDaGFuZ2VzIGFwcGVhciwgd2hpY2ggcmUtdHJpZ2dlcnMgdGhlIGF1eCBiYXIgc3luYyBhdXRvcnVuLlxuXHRcdChzZXNzaW9uLmNoYW5nZXMgYXMgSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4pLnNldChbbWFrZUNoYW5nZSgnL2ZpbGUudHMnKV0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpICYmICFoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzLmluY2x1ZGVzKFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCksXG5cdFx0XHQnYXV4IGJhciBtdXN0IHN0YXkgaGlkZGVuIGFmdGVyIHRoZSB1c2VyIGhpZCBpdCwgZXZlbiB3aGVuIGNoYW5nZXMgYXBwZWFyJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEOV0gVG9nZ2xlIFNpZGUgUGFuZWwgY29tbWFuZCBjYWxscyB0aGUgd29ya2JlbmNoIGxheW91dCBzZXJ2aWNlIGRpcmVjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFRvZ2dsZVNpZGVQYW5lbCcpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyLCAnVG9nZ2xlIFNpZGUgUGFuZWwgY29tbWFuZCBzaG91bGQgYmUgcmVnaXN0ZXJlZCcpO1xuXG5cdFx0YXdhaXQgaGFuZGxlcihoYXJuZXNzLmluc3RhU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvZ2dsZVNpZGVQYW5lQ2FsbHM6IGhhcm5lc3MudG9nZ2xlU2lkZVBhbmVDYWxscyxcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHR9LCB7XG5cdFx0XHR0b2dnbGVTaWRlUGFuZUNhbGxzOiAxLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q5XSBjb250cm9sbGVyIGRlcml2ZXMgdGhlIHRvZ2dsaW5nIHN0YXRlIGZyb20gd29ya2JlbmNoIGV2ZW50cycsICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHRvZ2dsaW5nU3RhdGVzOiBib29sZWFuW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoaGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmV2ZW50KCgpID0+IHRvZ2dsaW5nU3RhdGVzLnB1c2goY29udHJvbGxlci5pc1RvZ2dsaW5nU2lkZVBhbmUpKSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblxuXHRcdGhhcm5lc3MubGF5b3V0U2VydmljZS50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0b2dnbGluZ1N0YXRlcyxcblx0XHRcdGFmdGVyVG9nZ2xlOiBjb250cm9sbGVyLmlzVG9nZ2xpbmdTaWRlUGFuZSxcblx0XHR9LCB7XG5cdFx0XHR0b2dnbGluZ1N0YXRlczogW3RydWUsIHRydWVdLFxuXHRcdFx0YWZ0ZXJUb2dnbGU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gW0Q5Yl0gQ2xvc2luZyB0aGUgd2hvbGUgc2lkZSBwYW5lIG9uIGEgbmV3ICh1bmNyZWF0ZWQpIHNlc3Npb24gLS0tXG5cblx0dGVzdCgnW0Q5Yl0gY2xvc2luZyB0aGUgd2hvbGUgc2lkZSBwYW5lIG9uIGEgbmV3IHNlc3Npb24ga2VlcHMgaXQgY2xvc2VkIGZvciB0aGUgbmV4dCBuZXcgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgdW50aXRsZWQxID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkMScpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB9KTtcblx0XHRjb25zdCBleGlzdGluZyA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpleGlzdGluZycpKTtcblx0XHRjb25zdCB1bnRpdGxlZDIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQyJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXG5cdFx0Ly8gT3BlbiBhIG5ldyAodW50aXRsZWQpIHNlc3Npb24gXHUyMDE0IGF1eCBiYXIgc2hvd3MgdGhlIEZpbGVzIHZpZXcuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZDEsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSk7XG5cblx0XHQvLyBVc2VyIGNsb3NlcyB0aGUgd2hvbGUgc2lkZSBwYW5lIChlZGl0b3IgKyBhdXggYmFyKSB2aWEgdGhlIHRvZ2dsZS5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MubGF5b3V0U2VydmljZS50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0Ly8gVGhlIGNsb3NlZCBzdGF0ZSBpcyByZWNvcmRlZCBmb3IgdGhlIHNoYXJlZCBuZXctc2Vzc2lvbiB2aWV3LlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRKU09OLnBhcnNlKGhhcm5lc3Muc3RvcmFnZVNlcnZpY2UuZ2V0KCdzZXNzaW9ucy5uZXdTZXNzaW9uVmlld1N0YXRlJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgPz8gJycpLFxuXHRcdFx0eyBhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0J2Nsb3NpbmcgdGhlIHdob2xlIHNpZGUgcGFuZSBvbiBhIG5ldyBzZXNzaW9uIHNob3VsZCByZWNvcmQgdGhlIGNsb3NlZCBjaG9pY2UnXG5cdFx0KTtcblxuXHRcdC8vIFN3aXRjaCB2aWEgYW4gZXhpc3Rpbmcgc2Vzc2lvbiB0byB0aGUgbmV4dCBuZXcgKHVudGl0bGVkKSBzZXNzaW9uLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoZXhpc3RpbmcsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bnRpdGxlZDIsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHQnYXV4IGJhciBzaG91bGQgc3RheSBoaWRkZW4gb24gdGhlIG5leHQgbmV3IHNlc3Npb24nXG5cdFx0KTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLFxuXHRcdFx0J3Nob3VsZCBub3QgcmUtb3BlbiB0aGUgRmlsZXMgdmlldyBvbiB0aGUgbmV4dCBuZXcgc2Vzc2lvbidcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDliXSBjbG9zaW5nIHRoZSB3aG9sZSBzaWRlIHBhbmUgd2hpbGUgY29tcG9zaW5nIGEgbmV3IHNlc3Npb24gZG9lcyBub3QgcmVvcGVuIGl0IHdoZW4gdGhlIHNlc3Npb24gcmUtc3luY3MnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHVudGl0bGVkID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnVudGl0bGVkJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXHRcdGNvbnN0IG90aGVyID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOm90aGVyJyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIH0pO1xuXG5cdFx0Ly8gQ29tcG9zZSBhIG5ldyBzZXNzaW9uIFx1MjAxNCBhdXggYmFyIHNob3dzIHRoZSBGaWxlcyB2aWV3LlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGhhcm5lc3Mub3BlbmVkVmlld0NvbnRhaW5lcnMuaW5jbHVkZXMoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSk7XG5cblx0XHQvLyBVc2VyIGNsb3NlcyB0aGUgd2hvbGUgc2lkZSBwYW5lIHdoaWxlIHN0aWxsIGNvbXBvc2luZyB0aGUgbmV3IHNlc3Npb24uXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLmxheW91dFNlcnZpY2UudG9nZ2xlU2lkZVBhbmUoKTtcblxuXHRcdC8vIFRoZSBzYW1lIHVuY3JlYXRlZCBzZXNzaW9uIHJlLXN5bmNzIChlLmcuIGEgbXVsdGktc2Vzc2lvbiB2aWV3IGNvbGxhcHNlc1xuXHRcdC8vIGJhY2sgdG8gaXQpLiBUaGlzIG11c3Qgbm90IHJlb3BlbiB0aGUgYXV4IGJhciB0aGUgdXNlciBqdXN0IGNsb3NlZC5cblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW3VudGl0bGVkLCBvdGhlcl0sIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFt1bnRpdGxlZF0sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5vcGVuZWRWaWV3Q29udGFpbmVycy5pbmNsdWRlcyhTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQpLFxuXHRcdFx0J3Nob3VsZCBub3QgcmVvcGVuIHRoZSBGaWxlcyB2aWV3IHdoZW4gdGhlIHNhbWUgbmV3IHNlc3Npb24gcmUtc3luY3MnXG5cdFx0KTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHQnYXV4IGJhciBzaG91bGQgc3RheSBoaWRkZW4gd2hlbiB0aGUgc2FtZSBuZXcgc2Vzc2lvbiByZS1zeW5jcydcblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0gW0Q4XSBGaXJzdCBDaGFuZ2VzIGVkaXRvciBvcGVuIC0tLVxuXG5cdHRlc3QoJ1tEOF0gcmV2ZWFscyB0aGUgQ2hhbmdlcyB2aWV3IHRoZSBmaXJzdCB0aW1lIGEgQ2hhbmdlcyBlZGl0b3IgaXMgb3BlbmVkLCB0aGVuIHJlbWVtYmVycyB0aGUgY2hvaWNlJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoeyByZXZlYWxBdXhpbGlhcnlCYXJPbk9wZW46IHRydWUgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEZpcnN0IG9wZW4gb2YgdGhlIENoYW5nZXMgZWRpdG9yIHJldmVhbHMgdGhlIENoYW5nZXMgdmlldyBpbiB0aGUgc2lkZSBwYW5lLlxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvclJlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHRcdGFzc2VydC5vayhoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksICdmaXJzdCBDaGFuZ2VzIG9wZW4gc2hvdWxkIHJldmVhbCB0aGUgQ2hhbmdlcyB2aWV3Jyk7XG5cblx0XHQvLyBVc2VyIGhpZGVzIG9ubHkgdGhlIHNpZGUgcGFuZSAoYXV4IGJhcikgd2hpbGUgdGhlIGVkaXRvciBzdGF5cyBvcGVuOyB0aGUgY2hvaWNlIGlzIHJlbWVtYmVyZWQuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gT3BlbmluZyB0aGUgQ2hhbmdlcyBlZGl0b3IgYWdhaW4gcmVzcGVjdHMgdGhlIHJlbWVtYmVyZWQgY2xvc2VkIGNob2ljZS5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXNzZXJ0Lm9rKCFoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksICdsYXRlciBDaGFuZ2VzIG9wZW5zIHNob3VsZCBub3QgcmUtcmV2ZWFsIHRoZSBzaWRlIHBhbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q5XSBjbG9zaW5nIHRoZSB3aG9sZSBzaWRlIHBhbmUgaXMgbm90IHJlbWVtYmVyZWQsIHNvIHJlb3BlbmluZyBDaGFuZ2VzIHJldmVhbHMgaXQgYWdhaW4nLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcih7IHJldmVhbEF1eGlsaWFyeUJhck9uT3BlbjogdHJ1ZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVGhlIGZpcnN0IENoYW5nZXMgb3BlbiByZXZlYWxzIHRoZSBzaWRlIHBhbmUgKGNhcHR1cmVkIGFzIG9wZW4pLlxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvclJlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0YXNzZXJ0Lm9rKGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSwgJ2ZpcnN0IENoYW5nZXMgb3BlbiBzaG91bGQgcmV2ZWFsIHRoZSBDaGFuZ2VzIHZpZXcnKTtcblxuXHRcdC8vIFVzZXIgY2xvc2VzIHRoZSB3aG9sZSBzaWRlIHBhbmUgdmlhIHRoZSBjb250cm9sbGVyLW93bmVkIHRvZ2dsZSwgd2hpY2hcblx0XHQvLyBoaWRlcyB0aGUgZWRpdG9yIGFuZCBhdXggYmFyIHRvZ2V0aGVyLiBUaGlzIG11c3Qgbm90IGJlIHJlbWVtYmVyZWQgYXMgYVxuXHRcdC8vIHBlci1zZXNzaW9uIGF1eC1iYXIgY2hvaWNlLlxuXHRcdGhhcm5lc3MubGF5b3V0U2VydmljZS50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0Ly8gUmUtY2xpY2tpbmcgQ2hhbmdlcyByZS1yZXZlYWxzIHRoZSAoc3RpbGwtYWN0aXZlLCBqdXN0IGhpZGRlbikgZWRpdG9yIHBhcnRcblx0XHQvLyB3aXRob3V0IGZpcmluZyBhbiBhY3RpdmUtZWRpdG9yIGNoYW5nZTsgdGhlIHNpZGUgcGFuZSBvcGVucyBhZ2FpbiAodGhlXG5cdFx0Ly8gY2xvc2Ugd2FzIG5vdCByZW1lbWJlcmVkIGFzIGFuIGF1eC1iYXIgY2hvaWNlKS5cblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLCAncmVvcGVuaW5nIENoYW5nZXMgYWZ0ZXIgY2xvc2luZyB0aGUgd2hvbGUgc2lkZSBwYW5lIHNob3VsZCByZXZlYWwgdGhlIENoYW5nZXMgdmlldyBhZ2FpbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDldIHJlb3BlbmluZyB0aGUgc2lkZSBwYW5lIHJlc3RvcmVzIHRoZSBwYXJ0cyB0aGF0IHdlcmUgdmlzaWJsZSB3aGVuIGl0IHdhcyBjbG9zZWQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cblx0XHQvLyBDbG9zaW5nIGhpZGVzIGJvdGggcGFydHMuXG5cdFx0Y29uc3QgdmlzaWJsZUFmdGVyQ2xvc2UgPSBoYXJuZXNzLmxheW91dFNlcnZpY2UudG9nZ2xlU2lkZVBhbmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZUFmdGVyQ2xvc2UsIGZhbHNlLCAnc2lkZSBwYW5lIHNob3VsZCBiZSBoaWRkZW4gYWZ0ZXIgY2xvc2luZycpO1xuXHRcdGFzc2VydC5vayhoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksICdhdXggYmFyIHNob3VsZCBiZSBoaWRkZW4nKTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLCAnZWRpdG9yIHNob3VsZCBiZSBoaWRkZW4nKTtcblxuXHRcdC8vIFJlb3BlbmluZyByZXN0b3JlcyBib3RoIHBhcnRzIHRoYXQgd2VyZSB2aXNpYmxlIGJlZm9yZS5cblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5sZW5ndGggPSAwO1xuXHRcdGNvbnN0IHZpc2libGVBZnRlck9wZW4gPSBoYXJuZXNzLmxheW91dFNlcnZpY2UudG9nZ2xlU2lkZVBhbmUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlzaWJsZUFmdGVyT3BlbiwgdHJ1ZSwgJ3NpZGUgcGFuZSBzaG91bGQgYmUgdmlzaWJsZSBhZnRlciByZW9wZW5pbmcnKTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSwgJ2VkaXRvciBzaG91bGQgYmUgcmVzdG9yZWQnKTtcblx0XHRhc3NlcnQub2soaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSwgJ2F1eCBiYXIgc2hvdWxkIGJlIHJlc3RvcmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEOV0gcmVvcGVuaW5nIHJlcG9ydHMgdGhlIHJlc3VsdGluZyBhdXhpbGlhcnkgYmFyIHZpc2liaWxpdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cblx0XHRoYXJuZXNzLmxheW91dFNlcnZpY2UudG9nZ2xlU2lkZVBhbmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udHJvbGxlci5zaWRlUGFuZVRvZ2dsZXMsIFt7XG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0cHJldmlvdXNBdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDldIGNsb3NpbmcgYSBtYXhpbWl6ZWQgc2luZ2xlLXBhbmUgZXhpdHMgbWF4aW1pemUgYW5kIGhpZGVzIGJvdGggcGFydHMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBzaW5nbGVQYW5lTGF5b3V0RW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLmVkaXRvck1heGltaXplZCA9IHRydWU7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblxuXHRcdGhhcm5lc3MubGF5b3V0U2VydmljZS50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXRFZGl0b3JNYXhpbWl6ZWRDYWxsczogaGFybmVzcy5zZXRFZGl0b3JNYXhpbWl6ZWRDYWxscyxcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHR9LCB7XG5cdFx0XHRzZXRFZGl0b3JNYXhpbWl6ZWRDYWxsczogW2ZhbHNlXSxcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tyZW9wZW4gZGVmYXVsdCBzaW5nbGUtcGFuZV0gYSBjcmVhdGVkIHNlc3Npb24gb3BlbnMgdGhlIHNpZGUgcGFuZSB0byB0aGUgZWRpdG9yIHdpdGggdGhlIGRldGFpbCBjbG9zZWQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBzaW5nbGVQYW5lTGF5b3V0RW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSB0cnVlO1xuXG5cdFx0Ly8gVGhlIHNpZGUgcGFuZSBzdGFydHMgZnVsbHkgY2xvc2VkIHdpdGggbm8gcmVtZW1iZXJlZCBwYXJ0cyAoZS5nLiBhZnRlciBhIHJlbG9hZCkuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRoYXJuZXNzLmxheW91dFNlcnZpY2UudG9nZ2xlU2lkZVBhbmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLFxuXHRcdH0sIHsgZWRpdG9yVmlzaWJsZTogdHJ1ZSwgZGV0YWlsVmlzaWJsZTogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tyZW9wZW4gZGVmYXVsdCBzaW5nbGUtcGFuZV0gYSBuZXctc2Vzc2lvbiB2aWV3IHJlc3RvcmVzIHRoZSBGaWxlcyBkZXRhaWwgZnJvbSByZW1lbWJlcmVkIHBhcnRzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgc2luZ2xlUGFuZUxheW91dEVuYWJsZWQ6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246bmV3JyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSB0cnVlO1xuXG5cdFx0Ly8gVGhlIHdvcmtiZW5jaCByZW1lbWJlcnMgdGhpcyBkZXRhaWwtb25seSBjb21wb3NpdGlvbi5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblxuXHRcdC8vIENsb3NpbmcgcmVtZW1iZXJzIHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gLi4uXG5cdFx0aGFybmVzcy5sYXlvdXRTZXJ2aWNlLnRvZ2dsZVNpZGVQYW5lKCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHQvLyAuLi4gc28gcmVvcGVuaW5nIHJlc3RvcmVzIGV4YWN0bHkgdGhlIEZpbGVzIGRldGFpbCAobm90IHRoZSBsYXlvdXQgZGVmYXVsdCkuXG5cdFx0aGFybmVzcy5sYXlvdXRTZXJ2aWNlLnRvZ2dsZVNpZGVQYW5lKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGRldGFpbFZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHR9LCB7IGVkaXRvclZpc2libGU6IGZhbHNlLCBkZXRhaWxWaXNpYmxlOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDhdIGRvZXMgbm90IHJldmVhbCB0aGUgQ2hhbmdlcyB2aWV3IGZvciBhbiB1bnRpdGxlZCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCB1bnRpdGxlZCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp1bnRpdGxlZCcpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9yUmVzb3VyY2UgPSBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2UodW50aXRsZWQucmVzb3VyY2UpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksICd1bnRpdGxlZCBzZXNzaW9ucyBhcmUgZ292ZXJuZWQgYnkgRDNiL0Q0LCBub3QgRDgnKTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBlbnRlcmluZyBhIG5ldy1zZXNzaW9uIHZpZXcgaGlkZXMgb25seSBFZGl0b3Igd2hlbiBFbXB0eSBGaWxlcyBpcyB0aGUgb25seSBpbnB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246ZXhpc3RpbmcnKSk7XG5cdFx0Y29uc3QgdW50aXRsZWQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246dW50aXRsZWQnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChleGlzdGluZywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGRldGFpbFZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdHZpc2liaWxpdHlSZXN0b3JlczogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGNhbGwgPT5cblx0XHRcdFx0Y2FsbC5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCB8fCBjYWxsLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGRldGFpbFZpc2libGU6IGZhbHNlLFxuXHRcdFx0dmlzaWJpbGl0eVJlc3RvcmVzOiBbXG5cdFx0XHRcdHsgcGFydDogUGFydHMuRURJVE9SX1BBUlQsIGhpZGRlbjogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBOZXcgU2Vzc2lvbiBvcGVuaW5nIHJ1bGUgZG9lcyBub3QgcmUtcnVuIGFmdGVyIGEgcmVhbCBlZGl0b3Igb3BlbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpuZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgcmVhbEVkaXRvciA9IHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChVUkkuZmlsZSgnL3JlcG8vYS50cycpKSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRvcGVuRWRpdG9yKHJlYWxFZGl0b3IpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2gocmVhbEVkaXRvcik7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YocmVhbEVkaXRvciksIDEpO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIHJlb3BlbmluZyB0aGUgc2lkZSBwYW5lIGFmdGVyIGNsb3NpbmcgRW1wdHkgRmlsZXMgcmVzdG9yZXMgZG9jay1vbmx5IEZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUsIHNpbmdsZVBhbmVMYXlvdXRFbmFibGVkOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOm5ldycpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBmaWxlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KTtcblx0XHRhc3NlcnQub2soZmlsZXNUYWIpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGZpbGVzVGFiKSwgMSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiBmaWxlc1RhYiB9KTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cblx0XHRoYXJuZXNzLmxheW91dFNlcnZpY2UudG9nZ2xlU2lkZVBhbmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCksXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0fSwge1xuXHRcdFx0aGFzRmlsZXNUYWI6IHRydWUsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gY2xvc2luZyB0aGUgbGFzdCBub24tRW1wdHkgZWRpdG9yIHdoaWxlIEVkaXRvciBpcyBoaWRkZW4gb3BlbnMgRW1wdHkgRmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSwgc2luZ2xlUGFuZUxheW91dEVuYWJsZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246bmV3JyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgbGFzdEVkaXRvciA9IHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChVUkkucGFyc2UoJ3NlYXJjaC1lZGl0b3I6Ly9sYXN0JykpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoMCwgaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoLCBsYXN0RWRpdG9yKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gbGFzdEVkaXRvcjtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZSgwLCBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGgpO1xuXHRcdGhhcm5lc3MuZWRpdG9yR3JvdXBzSGF2ZUNvbnRlbnQgPSBmYWxzZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvcjogbGFzdEVkaXRvciwgZ3JvdXBJZDogMSB9KTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLFxuXHRcdH0sIHtcblx0XHRcdGhhc0ZpbGVzVGFiOiB0cnVlLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIGNsb3NpbmcgdGhlIGxhc3QgdmlzaWJsZSBmaWxlIGVkaXRvciBvcGVucyBFbXB0eSBGaWxlcyBhbmQga2VlcHMgRWRpdG9yIHZpc2libGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSwgc2luZ2xlUGFuZUxheW91dEVuYWJsZWQ6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246bmV3JyksIHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBpc0NyZWF0ZWQ6IGZhbHNlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgbGFzdEVkaXRvciA9IHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChVUkkuZmlsZSgnL3JlcG8vbGFzdC50cycpKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKDAsIGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmxlbmd0aCwgbGFzdEVkaXRvcik7XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dCA9IGxhc3RFZGl0b3I7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoMCwgaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoKTtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gZmFsc2U7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGxhc3RFZGl0b3IsIGdyb3VwSWQ6IDEgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSxcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHR9LCB7XG5cdFx0XHRoYXNGaWxlc1RhYjogdHJ1ZSxcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDNiXSBzdGFuZGFyZCBjb250cm9sbGVyIGRvZXMgbm90IGhpZGUgdGhlIGVkaXRvciBvbiBuZXctc2Vzc2lvbiBzaWRlLXBhbmUgcmV2ZWFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCB1bnRpdGxlZCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp1bnRpdGxlZCcpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQodW50aXRsZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuKSxcblx0XHRcdFtdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q4XSBkb2VzIG5vdCByZXZlYWwgdGhlIENoYW5nZXMgdmlldyB3aGlsZSBtdWx0aXBsZSBzZXNzaW9ucyBhcmUgdmlzaWJsZScsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Y29uc3QgYSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjphJykpO1xuXHRcdGNvbnN0IGIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YicpKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW2EsIGJdLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoYSwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvclJlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKGEucmVzb3VyY2UpO1xuXHRcdGhhcm5lc3Mub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksICdtdWx0aS1zZXNzaW9uIG1vZGUgbWFuYWdlcyB0aGUgc2lkZSBwYW5lIHNlcGFyYXRlbHknKTtcblx0fSk7XG5cblx0Ly8gLS0tIFtENV0gRWRpdG9yIG1heGltaXplZCAtLS1cblxuXHR0ZXN0KCdbRDVdIHNob3dzIHRoZSBDaGFuZ2VzIHZpZXcgd2hlbiB0aGUgZWRpdG9yIGFyZWEgaXMgbWF4aW1pemVkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXG5cdFx0Ly8gTWF4aW1pemUgdGhlIGVkaXRvciBhcmVhLlxuXHRcdGhhcm5lc3MuZWRpdG9yTWF4aW1pemVkID0gdHJ1ZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLmZpcmUoKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHRcdCdDaGFuZ2VzIHZpZXcgc2hvdWxkIGJlIHNob3duIHdoZW4gdGhlIGVkaXRvciBpcyBtYXhpbWl6ZWQnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q1XSByZXN0b3JlcyB0aGUgcHJldmlvdXMgYXV4IGJhciB2aXNpYmlsaXR5IHdoZW4gdGhlIGVkaXRvciBpcyB1bi1tYXhpbWl6ZWQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBBdXggYmFyIGhpZGRlbiBiZWZvcmUgbWF4aW1pemluZy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXG5cdFx0Ly8gTWF4aW1pemUgXHUyMDE0IENoYW5nZXMgdmlldyBzaG93biAoYXV4IGJhciByZXZlYWxlZCkuXG5cdFx0aGFybmVzcy5lZGl0b3JNYXhpbWl6ZWQgPSB0cnVlO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQuZmlyZSgpO1xuXG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIFJlc3RvcmUgXHUyMDE0IGF1eCBiYXIgc2hvdWxkIGJlIGhpZGRlbiBhZ2Fpbi5cblx0XHRoYXJuZXNzLmVkaXRvck1heGltaXplZCA9IGZhbHNlO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eCBiYXIgc2hvdWxkIGJlIHJlc3RvcmVkIHRvIGhpZGRlbiBhZnRlciB1bi1tYXhpbWl6aW5nJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tENV0gZG9lcyBub3QgY2FwdHVyZSBmb3JjZWQgYXV4IGJhciB2aXNpYmlsaXR5IHdoaWxlIHRoZSBlZGl0b3IgaXMgbWF4aW1pemVkJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQXV4IGJhciBoaWRkZW4gYmVmb3JlIG1heGltaXppbmcuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblxuXHRcdGhhcm5lc3MuZWRpdG9yTWF4aW1pemVkID0gdHJ1ZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLmZpcmUoKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSBhdXggYmFyIGJlaW5nIHJldmVhbGVkIHdoaWxlIG1heGltaXplZC5cblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cblx0XHQvLyBTd2l0Y2hpbmcgYXdheSBmcm9tIHRoZSBzZXNzaW9uIHNob3VsZCBub3QgaGF2ZSByZW1lbWJlcmVkIHRoZSBmb3JjZWRcblx0XHQvLyB2aXNpYmxlIHN0YXRlOiBzd2l0Y2hpbmcgYmFjayBrZWVwcyB0aGUgYXV4IGJhciBoaWRkZW4uXG5cdFx0aGFybmVzcy5lZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLmZpcmUoKTtcblxuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMiwgdW5kZWZpbmVkKTtcblxuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eCBiYXIgc2hvdWxkIHJlbWFpbiBoaWRkZW4gZm9yIHRoZSBzZXNzaW9uIGFmdGVyIHRoZSBlZGl0b3Igd2FzIG1heGltaXplZCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDVdIGtlZXBzIHRoZSBDaGFuZ2VzIHZpZXcgc2hvd24gd2hpbGUgbWF4aW1pemVkIHJlZ2FyZGxlc3Mgb2YgdGhlIHNlc3Npb24gc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGNvbnN0IHNlc3Npb24xID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIE1heGltaXplIFx1MjAxNCBDaGFuZ2VzIHZpZXcgc2hvd24uXG5cdFx0aGFybmVzcy5lZGl0b3JNYXhpbWl6ZWQgPSB0cnVlO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQuZmlyZSgpO1xuXG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzID0gW107XG5cblx0XHQvLyBXaGlsZSBzdGlsbCBtYXhpbWl6ZWQsIHN3aXRjaCB0byBhbm90aGVyIGV4aXN0aW5nIHNlc3Npb24gdGhhdCB3b3VsZFxuXHRcdC8vIG5vcm1hbGx5IGtlZXAgdGhlIGF1eCBiYXIgaGlkZGVuLiBJdCBtdXN0IHN0YXkgc2hvd2luZyB0aGUgQ2hhbmdlcyB2aWV3LlxuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMiwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Mub3BlbmVkVmlld3MuaW5jbHVkZXMoQ0hBTkdFU19WSUVXX0lEKSxcblx0XHRcdCdDaGFuZ2VzIHZpZXcgc2hvdWxkIHN0YXkgc2hvd24gd2hpbGUgbWF4aW1pemVkJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdhdXggYmFyIHNob3VsZCBub3QgYmUgaGlkZGVuIHdoaWxlIHRoZSBlZGl0b3IgaXMgbWF4aW1pemVkJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBbRDFdICsgW0IyXSBFZGl0b3IgLyBhdXhpbGlhcnkgYmFyIGludmFyaWFudCAtLS1cblxuXHR0ZXN0KCdbRDFdIGRvZXMgbm90IGZvcmNlIGF1eGlsaWFyeSBiYXIgdmlzaWJsZSB3aGVuIHJlc3RvcmluZyBlZGl0b3Igd29ya2luZyBzZXQgb24gc2Vzc2lvbiBzd2l0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbjEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRjb25zdCBzZXNzaW9uMiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoyJykpO1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoe1xuXHRcdFx0dXNlTW9kYWw6ICdzb21lJyxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcnM6IFt7IHVyaTogVVJJLmZpbGUoJy9yZXBvJykgfV0sXG5cdFx0XHRsYXlvdXRTdGF0ZTogW3tcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiAnc2Vzc2lvbjoxJyxcblx0XHRcdFx0ZWRpdG9yV29ya2luZ1NldDogeyBpZDogJ3dzLTEnLCBuYW1lOiAnd3MtMScgfSxcblx0XHRcdFx0dmlld1N0YXRlOiB7IGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cblx0XHQvLyBTdGFydCBvbiBhIGRpZmZlcmVudCBzZXNzaW9uLCB0aGVuIHN3aXRjaCB0byB0aGUgb25lIHdpdGggYSBzYXZlZCB3b3JraW5nIHNldC5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24yLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cdFx0Ly8gRmx1c2ggdGhlIHdvcmtpbmctc2V0IHNlcXVlbmNlciAocXVldWVkIG1pY3JvdGFza3MpXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSksXG5cdFx0XHQnZWRpdG9yIHBhcnQgc2hvdWxkIGJlIHJldmVhbGVkIGJ5IHRoZSB3b3JraW5nIHNldCByZXN0b3JlJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IWhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSBmYWxzZSksXG5cdFx0XHQnYXV4aWxpYXJ5IGJhciBtdXN0IG5vdCBiZSBmb3JjZWQgdmlzaWJsZSBkdXJpbmcgd29ya2luZyBzZXQgcmVzdG9yZSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIHdvcmtpbmctc2V0IHJlc3RvcmUgZG9lcyBub3QgY2hhbmdlIGdsb2JhbCBlZGl0b3IgdmlzaWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSB9XTtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IHNpbmdsZVBhbmVMYXlvdXRFbmFibGVkOiB0cnVlLCB3b3Jrc3BhY2VGb2xkZXJzIH0pO1xuXHRcdGNvbnN0IGZpcnN0ID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmZpcnN0JykpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmV4aXN0aW5nJykpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChmaXJzdCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChleGlzdGluZywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRlZGl0b3JWaXNpYmlsaXR5Q2hhbmdlczogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRlZGl0b3JWaXNpYmlsaXR5Q2hhbmdlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gcHJlc2VydmVzIGN1cnJlbnQgdmlzaWJpbGl0eSB3aGVuIGEgZHJhZnQgaXMgcmVwbGFjZWQgb24gc3VibWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSBbeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpIH1dO1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgc2luZ2xlUGFuZUxheW91dEVuYWJsZWQ6IHRydWUsIHdvcmtzcGFjZUZvbGRlcnMgfSk7XG5cdFx0Y29uc3QgZHJhZnQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246ZHJhZnQnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpjcmVhdGVkJykpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChkcmFmdCwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW2RyYWZ0XSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQoZHJhZnQuaXNDcmVhdGVkIGFzIElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4pLnNldCh0cnVlLCB0eCk7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGNyZWF0ZWQsIHR4KTtcblx0XHR9KTtcblx0XHRoYXJuZXNzLm9uRGlkUmVwbGFjZVNlc3Npb24uZmlyZSh7IGZyb206IGRyYWZ0LCB0bzogY3JlYXRlZCB9KTtcblx0XHRoYXJuZXNzLnZpc2libGVTZXNzaW9uc09icy5zZXQoW2NyZWF0ZWRdLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclJldmVhbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKS5sZW5ndGgsXG5cdFx0XHRlZGl0b3JIaWRlczogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSkubGVuZ3RoLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclJldmVhbHM6IDAsXG5cdFx0XHRlZGl0b3JIaWRlczogMCxcblx0XHRcdGRldGFpbFZpc2libGU6IHRydWUsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBkb2VzIG5vdCByZXZlYWwgdGhlIGVkaXRvciBwYXJ0IGZvciBhIGNyZWF0ZWQgcXVpY2sgY2hhdCBvbiBzd2l0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBzaW5nbGVQYW5lTGF5b3V0RW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRjb25zdCB1bnRpdGxlZCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpuZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgcXVpY2tDaGF0ID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOnFjJyksIHsgaXNRdWlja0NoYXQ6IHRydWUgfSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHVudGl0bGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gQSBxdWljayBjaGF0IGhhcyBubyBzaWRlIHBhbmUsIHNvIHN3aXRjaGluZyB0byBpdCBtdXN0IG5ldmVyIGF1dG8tcmV2ZWFsXG5cdFx0Ly8gdGhlIGVkaXRvciBwYXJ0IGV2ZW4gdGhvdWdoIHRoZSBzZXNzaW9uIGlzIGNyZWF0ZWQuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChxdWlja0NoYXQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBjLmhpZGRlbiA9PT0gZmFsc2UpLFxuXHRcdFx0J3RoZSBlZGl0b3IgcGFydCBtdXN0IG5vdCBiZSByZXZlYWxlZCBmb3IgYSBxdWljayBjaGF0J1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0ga2VlcHMgdGhlIHNpZGUgcGFuZSB2aXNpYmxlIHdoZW4gYSBxdWljayBjaGF0IGlzIGFjdGl2ZSBhbW9uZyBtdWx0aXBsZSBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IHNpbmdsZVBhbmVMYXlvdXRFbmFibGVkOiB0cnVlLCBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOndvcmtzcGFjZScpKTtcblx0XHRjb25zdCBxdWlja0NoYXQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246cXVpY2snKSwgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQod29ya3NwYWNlU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdGhhcm5lc3MudmlzaWJsZVNlc3Npb25zT2JzLnNldChbd29ya3NwYWNlU2Vzc2lvbiwgcXVpY2tDaGF0XSwgdHgpO1xuXHRcdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChxdWlja0NoYXQsIHR4KTtcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHRoaWRlQ2FsbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjYWxsID0+IGNhbGwuaGlkZGVuKSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGhpZGVDYWxsczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gcmVzdG9yZXMgb3BlbiBzaWRlLXBhbmUgcGFydHMgd2hlbiBhbiBleGlzdGluZyBzZXNzaW9uIGlzIG9wZW5lZCB0byB0aGUgc2lkZScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7XG5cdFx0XHRzaW5nbGVQYW5lTGF5b3V0RW5hYmxlZDogdHJ1ZSxcblx0XHRcdGFjdGl2YXRlQXV4OiB0cnVlLFxuXHRcdFx0c2lkZVBhbmVWaXNpYmlsaXR5U3RhdGU6IHtcblx0XHRcdFx0bmV3U2Vzc2lvbjogeyBlZGl0b3JWaXNpYmxlOiBmYWxzZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRleGlzdGluZ1Nlc3Npb246IHsgZWRpdG9yVmlzaWJsZTogdHJ1ZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBxdWlja0NoYXQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246cXVpY2snKSwgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KTtcblx0XHRjb25zdCBleGlzdGluZ1Nlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246ZXhpc3RpbmcnKSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHF1aWNrQ2hhdCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtxdWlja0NoYXQsIGV4aXN0aW5nU2Vzc2lvbl0sIHR4KTtcblx0XHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoZXhpc3RpbmdTZXNzaW9uLCB0eCk7XG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gbWFrZUZpbGVFZGl0b3IoKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHRoYXNEb2NrZWREZXRhaWxzOiBoYXJuZXNzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShIYXNEb2NrZWREZXRhaWxzQ29udGV4dC5rZXkpLFxuXHRcdFx0cmV2ZWFsQ2FsbHM6IGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjYWxsID0+ICFjYWxsLmhpZGRlbiksXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUsXG5cdFx0XHRoYXNEb2NrZWREZXRhaWxzOiB0cnVlLFxuXHRcdFx0cmV2ZWFsQ2FsbHM6IFtcblx0XHRcdFx0eyBwYXJ0OiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgaGlkZGVuOiBmYWxzZSB9LFxuXHRcdFx0XHR7IHBhcnQ6IFBhcnRzLkVESVRPUl9QQVJULCBoaWRkZW46IGZhbHNlIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIGhpZGVzIHRoZSBzaWRlIHBhbmUgb25jZSB3aGVuIHN3aXRjaGluZyB0byBRdWljayBDaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgc2luZ2xlUGFuZUxheW91dEVuYWJsZWQ6IHRydWUsIGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246d29ya3NwYWNlJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgb3V0Z29pbmdFZGl0b3IgPSBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdzZWFyY2gtZWRpdG9yOi8vb3V0Z29pbmcnKSkpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2gob3V0Z29pbmdFZGl0b3IpO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBvdXRnb2luZ0VkaXRvcjtcblx0XHRoYXJuZXNzLmVkaXRvckdyb3Vwc0hhdmVDb250ZW50ID0gdHJ1ZTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpxYycpLCB7IGlzUXVpY2tDaGF0OiB0cnVlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdGhpZGVPcmRlcjogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGNhbGwgPT5cblx0XHRcdFx0Y2FsbC5oaWRkZW4gJiYgKGNhbGwucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgfHwgY2FsbC5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRoaWRlT3JkZXI6IFtcblx0XHRcdFx0eyBwYXJ0OiBQYXJ0cy5FRElUT1JfUEFSVCwgaGlkZGVuOiB0cnVlIH0sXG5cdFx0XHRcdHsgcGFydDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGhpZGRlbjogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSByZXN0b3JlcyB0aGUgZXhpc3Rpbmctc2Vzc2lvbiBzaWRlIHBhbmUgcHJvZmlsZSBhZnRlciBsZWF2aW5nIGEgcXVpY2sgY2hhdCBiZWZvcmUgbWFuYWdlZCB0YWJzIHNldHRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IHNpbmdsZVBhbmVMYXlvdXRFbmFibGVkOiB0cnVlLCBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246d29ya3NwYWNlJykpO1xuXHRcdGNvbnN0IHF1aWNrQ2hhdCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpxYycpLCB7IGlzUXVpY2tDaGF0OiB0cnVlIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh3b3Jrc3BhY2VTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5lZGl0b3JHcm91cHNIYXZlQ29udGVudCA9IGZhbHNlO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChxdWlja0NoYXQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh3b3Jrc3BhY2VTZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdGRldGFpbFZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gTmV3IFNlc3Npb25zIGlnbm9yZSB0aGUgc3RvcmVkIE5ldyB2aXNpYmlsaXR5IHByb2ZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoe1xuXHRcdFx0c2luZ2xlUGFuZUxheW91dEVuYWJsZWQ6IHRydWUsXG5cdFx0XHRzaWRlUGFuZVZpc2liaWxpdHlTdGF0ZToge1xuXHRcdFx0XHRuZXdTZXNzaW9uOiB7IGVkaXRvclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlIH0sXG5cdFx0XHRcdGV4aXN0aW5nU2Vzc2lvbjogeyBlZGl0b3JWaXNpYmxlOiB0cnVlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBleGlzdGluZyA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpleGlzdGluZycpKTtcblx0XHRjb25zdCBkcmFmdCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpkcmFmdCcpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoZXhpc3RpbmcsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBleGlzdGluZ1N0YXRlID0ge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLFxuXHRcdH07XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGRyYWZ0LCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgbmV3U3RhdGUgPSB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRkZXRhaWxWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0fTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoZXhpc3RpbmcsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXhpc3RpbmdTdGF0ZSxcblx0XHRcdG5ld1N0YXRlLFxuXHRcdFx0cmVzdG9yZWRFeGlzdGluZ1N0YXRlOiB7XG5cdFx0XHRcdGVkaXRvclZpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkVESVRPUl9QQVJUKSxcblx0XHRcdFx0ZGV0YWlsVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRleGlzdGluZ1N0YXRlOiB7IGVkaXRvclZpc2libGU6IHRydWUsIGRldGFpbFZpc2libGU6IGZhbHNlIH0sXG5cdFx0XHRuZXdTdGF0ZTogeyBlZGl0b3JWaXNpYmxlOiB0cnVlLCBkZXRhaWxWaXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0cmVzdG9yZWRFeGlzdGluZ1N0YXRlOiB7IGVkaXRvclZpc2libGU6IHRydWUsIGRldGFpbFZpc2libGU6IGZhbHNlIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gYmFja2dyb3VuZCBzdWJtaXQgZHVyaW5nIFF1aWNrIENoYXQgZG9lcyBub3Qgb3ZlcndyaXRlIHZpc2liaWxpdHkgcHJvZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoe1xuXHRcdFx0c2lkZVBhbmVWaXNpYmlsaXR5U3RhdGU6IHtcblx0XHRcdFx0bmV3U2Vzc2lvbjogeyBlZGl0b3JWaXNpYmxlOiBmYWxzZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRleGlzdGluZ1Nlc3Npb246IHsgZWRpdG9yVmlzaWJsZTogdHJ1ZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBkcmFmdCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpkcmFmdCcpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRjb25zdCBxdWlja0NoYXQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246cXVpY2snKSwgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KTtcblx0XHRjb25zdCBjb21taXR0ZWQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246Y29tbWl0dGVkJyksIHsgaXNDcmVhdGVkOiB0cnVlIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChkcmFmdCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQocXVpY2tDaGF0LCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0KGRyYWZ0LmlzQ3JlYXRlZCBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+KS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGNvbW1pdHRlZCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmdldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHRwcm9maWxlczogSlNPTi5wYXJzZShoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLmdldCgnc2Vzc2lvbnMuc2luZ2xlUGFuZS5zaWRlUGFuZVZpc2liaWxpdHknLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA/PyAnJyksXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUsXG5cdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHRuZXdTZXNzaW9uOiB7IGVkaXRvclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlIH0sXG5cdFx0XHRcdGV4aXN0aW5nU2Vzc2lvbjogeyBlZGl0b3JWaXNpYmxlOiB0cnVlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gW0I0XSArIFtEMV0gUGVyc2lzdGVuY2UgLS0tXG5cblx0dGVzdCgnW0I0XSBwZXJzaXN0cyBhdXgtYmFyIHZpZXcgc3RhdGUgdG8gc2Vzc2lvbnMubGF5b3V0U3RhdGUga2V5JywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uMSA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlUGFuZUNvbXBvc2l0ZUlkID0gJ2N1c3RvbS52aWV3JztcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5zdG9yYWdlU2VydmljZS50ZXN0RW1pdFdpbGxTYXZlU3RhdGUoV2lsbFNhdmVTdGF0ZVJlYXNvbi5TSFVURE9XTik7XG5cblx0XHRjb25zdCBzdG9yZWQgPSBoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLmdldCgnc2Vzc2lvbnMubGF5b3V0U3RhdGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRhc3NlcnQub2soc3RvcmVkLCAnc3RhdGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShzdG9yZWQhKTtcblx0XHRjb25zdCBzZXNzaW9uMUVudHJ5ID0gcGFyc2VkLmZpbmQoKGU6IGFueSkgPT4gZS5zZXNzaW9uUmVzb3VyY2UgPT09ICdzZXNzaW9uOjEnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbjFFbnRyeSwgJ3Nlc3Npb24gMSBlbnRyeSBzaG91bGQgZXhpc3QnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24xRW50cnkudmlld1N0YXRlLCB7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogJ2N1c3RvbS52aWV3Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0QxXSBrZWVwcyBhdXggYmFyIGhpZGRlbiBhZnRlciByZWxvYWQgd2hlbiBhIHNlc3Npb24gd2l0aCBlZGl0b3JzIGNsb3NlcyBib3RoIGVkaXRvciBhbmQgYXV4IGJhcicsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSB9XTtcblx0XHRjcmVhdGVDb250cm9sbGVyKHsgdXNlTW9kYWw6ICdzb21lJywgd29ya3NwYWNlRm9sZGVycyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24xID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MicpKTtcblxuXHRcdC8vIFNlc3Npb24gMSBhY3RpdmUgd2l0aCBhbiBlZGl0b3Igb3BlbiBzbyBhIHdvcmtpbmcgc2V0IGlzIHNhdmVkIG9uIHN3aXRjaC1hd2F5LlxuXHRcdGhhcm5lc3MudmlzaWJsZUVkaXRvcnNMaXN0ID0gW3t9XTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24xLCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBCYWNrIHRvIHNlc3Npb24gMSBhbmQgaGlkZSB0aGUgYXV4IGJhciAoY2FwdHVyZWQgaW1tZWRpYXRlbHkgYXMgaGlkZGVuIHZpZXcgc3RhdGUpLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjEsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gQ2xvc2UgYWxsIGVkaXRvcnMsIHRoZW4gc3dpdGNoIGF3YXkgc28gdGhlIG5vdy1lbXB0eSB3b3JraW5nIHNldCBpcyBzYXZlZC5cblx0XHRoYXJuZXNzLnZpc2libGVFZGl0b3JzTGlzdCA9IFtdO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbjIsIHVuZGVmaW5lZCk7XG5cblx0XHRoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLnRlc3RFbWl0V2lsbFNhdmVTdGF0ZShXaWxsU2F2ZVN0YXRlUmVhc29uLlNIVVRET1dOKTtcblx0XHRjb25zdCBzdG9yZWQgPSBoYXJuZXNzLnN0b3JhZ2VTZXJ2aWNlLmdldCgnc2Vzc2lvbnMubGF5b3V0U3RhdGUnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRhc3NlcnQub2soc3RvcmVkLCAnc3RhdGUgc2hvdWxkIGJlIHBlcnNpc3RlZCcpO1xuXG5cdFx0Ly8gUmVsb2FkOiBhIGZyZXNoIGNvbnRyb2xsZXIgcmVzdG9yZXMgZnJvbSB0aGUgcGVyc2lzdGVkIHN0YXRlLlxuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcih7IHVzZU1vZGFsOiAnc29tZScsIHdvcmtzcGFjZUZvbGRlcnMsIGxheW91dFN0YXRlOiBKU09OLnBhcnNlKHN0b3JlZCEpIH0pO1xuXHRcdGNvbnN0IHJlbG9hZGVkU2Vzc2lvbjEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLm9wZW5lZFZpZXdDb250YWluZXJzID0gW107XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChyZWxvYWRlZFNlc3Npb24xLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eCBiYXIgc2hvdWxkIHJlbWFpbiBoaWRkZW4gYWZ0ZXIgcmVsb2FkJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHJlbG9hZFdpdGhTaWRlUGFuZVRvZ2dsZWRDbG9zZWQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IFt7IHVyaTogVVJJLmZpbGUoJy9yZXBvJykgfV07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZUNvbnRyb2xsZXIoeyB1c2VNb2RhbDogJ3NvbWUnLCB3b3Jrc3BhY2VGb2xkZXJzLCByZXZlYWxBdXhpbGlhcnlCYXJPbk9wZW46IHRydWUgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MudmlzaWJsZUVkaXRvcnNMaXN0ID0gW3t9XTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBPcGVuIHRoZSBDaGFuZ2VzIGVkaXRvciBzbyB0aGUgZWRpdG9yICsgYXV4IGJhciBhcmUgYm90aCB2aXNpYmxlIGFuZCB0aGVcblx0XHQvLyBzZXNzaW9uJ3MgYXV4LWJhciB2aXNpYmxlIGNob2ljZSBpcyBjYXB0dXJlZC5cblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvclJlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb24ucmVzb3VyY2UpPy5hdXhpbGlhcnlCYXJWaXNpYmxlLCB0cnVlKTtcblxuXHRcdC8vIFVzZXIgY2xvc2VzIHRoZSB3aG9sZSBzaWRlIHBhbmUgKGVkaXRvciArIGF1eCBiYXIpIHZpYSB0aGUgdG9nZ2xlLCB0aGVuIHJlbG9hZHMuXG5cdFx0aGFybmVzcy5sYXlvdXRTZXJ2aWNlLnRvZ2dsZVNpZGVQYW5lKCk7XG5cdFx0aGFybmVzcy5zdG9yYWdlU2VydmljZS50ZXN0RW1pdFdpbGxTYXZlU3RhdGUoV2lsbFNhdmVTdGF0ZVJlYXNvbi5TSFVURE9XTik7XG5cdFx0Y29uc3Qgc3RvcmVkID0gaGFybmVzcy5zdG9yYWdlU2VydmljZS5nZXQoJ3Nlc3Npb25zLmxheW91dFN0YXRlJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0YXNzZXJ0Lm9rKHN0b3JlZCwgJ3N0YXRlIHNob3VsZCBiZSBwZXJzaXN0ZWQnKTtcblxuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcih7IHVzZU1vZGFsOiAnc29tZScsIHdvcmtzcGFjZUZvbGRlcnMsIGxheW91dFN0YXRlOiBKU09OLnBhcnNlKHN0b3JlZCEpLCByZXZlYWxBdXhpbGlhcnlCYXJPbk9wZW46IHRydWUgfSk7XG5cdFx0Y29uc3QgcmVsb2FkZWRTZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cblx0XHQvLyBSZWxvYWQgcmVzdG9yZXMgdGhlIHNpZGUgcGFuZSBjbG9zZWQgKGJvdGggcGFydHMgaGlkZGVuKS5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChyZWxvYWRlZFNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JSZXNvdXJjZSA9IGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShyZWxvYWRlZFNlc3Npb24ucmVzb3VyY2UpO1xuXHR9XG5cblx0dGVzdCgnW0Q5XSBkb2VzIG5vdCBhdXRvLXJldmVhbCB0aGUgc2lkZSBwYW5lIHdoZW4gdGhlIENoYW5nZXMgZWRpdG9yIGlzIHJlc3RvcmVkIG9uIHJlbG9hZCcsICgpID0+IHtcblx0XHRyZWxvYWRXaXRoU2lkZVBhbmVUb2dnbGVkQ2xvc2VkKCk7XG5cblx0XHQvLyBUaGUgd29ya2luZyBzZXQgcmVzdG9yZSBjYW4gbWFrZSB0aGUgQ2hhbmdlcyBlZGl0b3IgYWN0aXZlIGFnYWluIHdoaWxlXG5cdFx0Ly8gdGhlIGVkaXRvciBwYXJ0IGlzIHN0aWxsIGhpZGRlbiBcdTIwMTQgdGhpcyBtdXN0IE5PVCBhdXRvLXJldmVhbCB0aGUgc2lkZSBwYW5lLlxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0XHQncmVzdG9yaW5nIHRoZSBDaGFuZ2VzIGVkaXRvciBvbiByZWxvYWQgbXVzdCBub3QgYXV0by1yZXZlYWwgdGhlIHNpZGUgcGFuZSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDldIHJldmVhbHMgdGhlIENoYW5nZXMgdmlldyB3aGVuIG9wZW5pbmcgQ2hhbmdlcyBhZnRlciByZWxvYWRpbmcgYSBzZXNzaW9uIHdob3NlIHNpZGUgcGFuZSB3YXMgdG9nZ2xlZCBjbG9zZWQnLCAoKSA9PiB7XG5cdFx0cmVsb2FkV2l0aFNpZGVQYW5lVG9nZ2xlZENsb3NlZCgpO1xuXG5cdFx0Ly8gQ2xpY2tpbmcgT3BlbiBDaGFuZ2VzIG9wZW5zIHRoZSBDaGFuZ2VzIGVkaXRvciAocmV2ZWFsaW5nIHRoZSBlZGl0b3Jcblx0XHQvLyBwYXJ0KTsgdGhlIGF1eCBiYXIgbXVzdCBiZSByZXZlYWxlZCB0b28gYmVjYXVzZSB0aGUgd2hvbGUtcGFuZSBjb2xsYXBzZVxuXHRcdC8vIHdhcyBub3QgYW4gZXhwbGljaXQgYXV4LWJhci1oaWRkZW4gY2hvaWNlLlxuXHRcdGhhcm5lc3Mub3BlbmVkVmlld3MgPSBbXTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLm9wZW5lZFZpZXdzLmluY2x1ZGVzKENIQU5HRVNfVklFV19JRCksXG5cdFx0XHQnb3BlbmluZyBDaGFuZ2VzIGFmdGVyIHJlbG9hZCBzaG91bGQgcmV2ZWFsIHRoZSBDaGFuZ2VzIHZpZXcnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q5XSBkb2VzIG5vdCB0dXJuIGFuIGV4cGxpY2l0IGF1eC1iYXIgaGlkZSBpbnRvIGEgY29sbGFwc2Ugd2hlbiBhbm90aGVyIHNlc3Npb24gaXMgY29sbGFwc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSBbeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpIH1dO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHsgdXNlTW9kYWw6ICdzb21lJywgd29ya3NwYWNlRm9sZGVycywgcmV2ZWFsQXV4aWxpYXJ5QmFyT25PcGVuOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25FeHBsaWNpdCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpleHBsaWNpdCcpKTtcblx0XHRjb25zdCBzZXNzaW9uQ29sbGFwc2UgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246Y29sbGFwc2UnKSk7XG5cdFx0aGFybmVzcy52aXNpYmxlRWRpdG9yc0xpc3QgPSBbe31dO1xuXG5cdFx0Ly8gU2Vzc2lvbiBBOiBvcGVuIENoYW5nZXMgKGVkaXRvciArIGF1eCB2aXNpYmxlKSwgdGhlbiBleHBsaWNpdGx5IGhpZGUganVzdFxuXHRcdC8vIHRoZSBhdXggYmFyIHdoaWxlIHRoZSBlZGl0b3Igc3RheXMgb3BlbiBcdTIwMTQgYW4gZXhwbGljaXQgYXV4LWJhciBjaG9pY2UuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uRXhwbGljaXQsIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JSZXNvdXJjZSA9IGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShzZXNzaW9uRXhwbGljaXQucmVzb3VyY2UpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb25FeHBsaWNpdC5yZXNvdXJjZSk/LmF1eGlsaWFyeUJhckhpZGRlbkJ5Q29sbGFwc2UsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBTZXNzaW9uIEI6IGNvbGxhcHNlIHRoZSB3aG9sZSBzaWRlIHBhbmUgKG1hcmtzIEIgYXMgY29sbGFwc2UtaGlkZGVuKS5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25Db2xsYXBzZSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MubGF5b3V0U2VydmljZS50b2dnbGVTaWRlUGFuZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmdldFZpZXdTdGF0ZShzZXNzaW9uQ29sbGFwc2UucmVzb3VyY2UpPy5hdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlLCB0cnVlKTtcblxuXHRcdC8vIFN3aXRjaGluZyBiYWNrIHRvIEEgY2FwdHVyZXMgaXQgYWdhaW4gXHUyMDE0IGl0cyBleHBsaWNpdCBoaWRlIG11c3QgcmVtYWluXG5cdFx0Ly8gZXhwbGljaXQgKG5vIGNvbGxhcHNlIG1hcmtlciBsZWFraW5nIGZyb20gc2Vzc2lvbiBCJ3MgY29sbGFwc2UpLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkV4cGxpY2l0LCB1bmRlZmluZWQpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkNvbGxhcHNlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmdldFZpZXdTdGF0ZShzZXNzaW9uRXhwbGljaXQucmVzb3VyY2UpPy5hdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDldIHJlLW9wZW5pbmcgdGhlIHNpZGUgcGFuZSB0byBlZGl0b3Itb25seSBkb2VzIG5vdCBtYXJrIGFuIGV4cGxpY2l0IGF1eC1iYXIgaGlkZSBhcyBhIGNvbGxhcHNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSBbeyB1cmk6IFVSSS5maWxlKCcvcmVwbycpIH1dO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVDb250cm9sbGVyKHsgdXNlTW9kYWw6ICdzb21lJywgd29ya3NwYWNlRm9sZGVycywgcmV2ZWFsQXV4aWxpYXJ5QmFyT25PcGVuOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKTtcblx0XHRoYXJuZXNzLnZpc2libGVFZGl0b3JzTGlzdCA9IFt7fV07XG5cblx0XHQvLyBPcGVuIENoYW5nZXMgKGVkaXRvciArIGF1eCB2aXNpYmxlKSwgdGhlbiBleHBsaWNpdGx5IGhpZGUganVzdCB0aGUgYXV4IGJhci5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0aGFybmVzcy5hY3RpdmVFZGl0b3JSZXNvdXJjZSA9IGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZS5maXJlKCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250cm9sbGVyLmdldFZpZXdTdGF0ZShzZXNzaW9uLnJlc291cmNlKT8uYXV4aWxpYXJ5QmFySGlkZGVuQnlDb2xsYXBzZSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIENvbGxhcHNlIHRoZSB3aG9sZSBzaWRlIHBhbmUsIHRoZW4gcmUtb3BlbiBpdDogaXQgcmVzdG9yZXMgdGhlIGVkaXRvci1vbmx5XG5cdFx0Ly8gc3RhdGUgKGF1eCBiYXIgc3RheXMgaGlkZGVuIGJlY2F1c2UgaXQgd2FzIGV4cGxpY2l0bHkgaGlkZGVuIGJlZm9yZSkuXG5cdFx0aGFybmVzcy5sYXlvdXRTZXJ2aWNlLnRvZ2dsZVNpZGVQYW5lKCk7XG5cdFx0aGFybmVzcy5sYXlvdXRTZXJ2aWNlLnRvZ2dsZVNpZGVQYW5lKCk7XG5cblx0XHQvLyBUaGUgZXhwbGljaXQgYXV4LWJhciBoaWRlIG11c3Qgbm90IGhhdmUgYmVjb21lIGEgY29sbGFwc2UtZHJpdmVuIGhpZGUuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRyb2xsZXIuZ2V0Vmlld1N0YXRlKHNlc3Npb24ucmVzb3VyY2UpPy5hdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gT3BlbmluZyBDaGFuZ2VzIG11c3QgdGhlcmVmb3JlIG5vdCByZS1yZXZlYWwgdGhlIGF1eCBiYXIuXG5cdFx0aGFybmVzcy5vcGVuZWRWaWV3cyA9IFtdO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5vcGVuZWRWaWV3cy5pbmNsdWRlcyhDSEFOR0VTX1ZJRVdfSUQpLFxuXHRcdFx0J2FuIGV4cGxpY2l0IGF1eC1iYXIgaGlkZSBtdXN0IG5vdCByZS1yZXZlYWwgYWZ0ZXIgYSBjb2xsYXBzZSArIGVkaXRvci1vbmx5IHJlLW9wZW4nXG5cdFx0KTtcblx0fSk7XG5cblx0Ly8gLS0tIFtEN10gUmVzcG9uc2l2ZSBzZXNzaW9ucyBzaWRlYmFyIC0tLVxuXG5cdGZ1bmN0aW9uIHNldFBhcnRWaXNpYmxlKHBhcnQ6IFBhcnRzLCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQocGFydCwgdmlzaWJsZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IHBhcnQsIHZpc2libGUgfSk7XG5cdH1cblxuXHRmdW5jdGlvbiByZXNpemVXaW5kb3cod2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGhhcm5lc3MubWFpbkNvbnRhaW5lcldpZHRoID0gd2lkdGg7XG5cdFx0aGFybmVzcy5vbkRpZExheW91dE1haW5Db250YWluZXIuZmlyZSh7IHdpZHRoLCBoZWlnaHQ6IDEwMDAgfSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzaWRlYmFySGlkZGVuQ2FsbHMoKTogYm9vbGVhbltdIHtcblx0XHRyZXR1cm4gaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5TSURFQkFSX1BBUlQpLm1hcChjID0+IGMuaGlkZGVuKTtcblx0fVxuXG5cdHRlc3QoJ1tEN10gaGlkZXMgdGhlIHNpZGViYXIgb24gYSBzbWFsbCB3aW5kb3cgd2hlbiBlZGl0b3IgYW5kIGF1eCBiYXIgYXJlIGJvdGggb3BlbicsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdHJlc2l6ZVdpbmRvdyg4MDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW3RydWVdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSBkb2VzIG5vdCB0b3VjaCB0aGUgc2lkZWJhciBvbiBhIGxhcmdlIHdpbmRvdycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdHJlc2l6ZVdpbmRvdygyMDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSBzaG93cyB0aGUgc2lkZWJhciBhZ2FpbiBvbmNlIHRoZSBhdXggYmFyIGNsb3NlcycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0cmVzaXplV2luZG93KDgwMCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdHNldFBhcnRWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbZmFsc2VdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSBzaG93cyB0aGUgc2lkZWJhciBhZ2FpbiBvbmNlIHRoZSB3aW5kb3cgZ3Jvd3MgYmFjaycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0cmVzaXplV2luZG93KDgwMCk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdHJlc2l6ZVdpbmRvdygyMDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFtmYWxzZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDddIGRvZXMgbm90IGF1dG8tc2hvdyB0aGUgc2lkZWJhciBhZnRlciB0aGUgdXNlciBjbG9zZWQgaXQgbWFudWFsbHknLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdC8vIFVzZXIgbWFudWFsbHkgY2xvc2VzIHRoZSBzaWRlYmFyIG9uIGEgbGFyZ2Ugd2luZG93LlxuXHRcdHNldFBhcnRWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBCZWNvbWUgc3BhY2UgY29uc3RyYWluZWQsIHRoZW4gcmVsaWV2ZSB0aGUgY29uc3RyYWludC5cblx0XHRyZXNpemVXaW5kb3coODAwKTtcblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IXNpZGViYXJIaWRkZW5DYWxscygpLmluY2x1ZGVzKGZhbHNlKSxcblx0XHRcdCdzaWRlYmFyIG11c3Qgbm90IGJlIGF1dG8tc2hvd24gd2hpbGUgdGhlIHVzZXItY2xvc2VkIHByZWZlcmVuY2UgaG9sZHMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSByZXN1bWVzIGF1dG8tbWFuYWdlbWVudCBhZnRlciB0aGUgdXNlciBvcGVucyB0aGUgc2lkZWJhciBhZ2FpbicsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0Ly8gVXNlciBtYW51YWxseSBjbG9zZXMsIHRoZW4gcmUtb3BlbnMgdGhlIHNpZGViYXIgXHUyMDE0IGF1dG8tbWFuYWdlbWVudCByZXN1bWVzLlxuXHRcdHNldFBhcnRWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdHNldFBhcnRWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdC8vIEEgY29uc3RyYWluIFx1MjE5MiB1bi1jb25zdHJhaW4gY3ljbGUgc2hvdWxkIG5vdyBhdXRvLWhpZGUgdGhlbiBhdXRvLXNob3cgYWdhaW4uXG5cdFx0cmVzaXplV2luZG93KDgwMCk7XG5cdFx0c2V0UGFydFZpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFt0cnVlLCBmYWxzZV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDddIGRvZXMgbm90IGF1dG8tc2hvdyB0aGUgc2lkZWJhciB0aGUgdXNlciBjbG9zZWQgYmVmb3JlIHJlbG9hZGluZycsICgpID0+IHtcblx0XHQvLyBTaW11bGF0ZSB0aGUgcmVzdG9yZWQgc3RhdGUgYWZ0ZXIgYSByZWxvYWQ6IHRoZSBzaWRlYmFyIGFuZCB0aGUgd2hvbGUgc2lkZVxuXHRcdC8vIHBhbmUgKGVkaXRvciArIGF1eCBiYXIpIGFyZSBoaWRkZW4sIG9uIGEgc21hbGwgd2luZG93LiBUaGUgY29udHJvbGxlciBvbmx5XG5cdFx0Ly8gYXV0by1yZXZlYWxzIGEgc2lkZWJhciBpdCBhdXRvLWhpZCwgc28gYSBzaWRlYmFyIHRoZSB1c2VyIGNsb3NlZCBiZWZvcmUgdGhlXG5cdFx0Ly8gcmVsb2FkIChhbHJlYWR5IGhpZGRlbiBoZXJlKSBtdXN0IHN0YXkgY2xvc2VkLlxuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoe1xuXHRcdFx0bWFpbkNvbnRhaW5lcldpZHRoOiA4MDAsXG5cdFx0XHRpbml0aWFsUGFydFZpc2liaWxpdHk6IG5ldyBNYXA8UGFydHMsIGJvb2xlYW4+KFtcblx0XHRcdFx0W1BhcnRzLlNJREVCQVJfUEFSVCwgZmFsc2VdLFxuXHRcdFx0XHRbUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlXSxcblx0XHRcdFx0W1BhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZV0sXG5cdFx0XHRdKSxcblx0XHR9KTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gT3BlbiB0aGUgc2lkZSBwYW5lIChiZWNvbWVzIHNwYWNlIGNvbnN0cmFpbmVkKSwgdGhlbiBjbG9zZSBpdCBhZ2Fpbi5cblx0XHRoYXJuZXNzLmxheW91dFNlcnZpY2UudG9nZ2xlU2lkZVBhbmUoKTtcblx0XHRoYXJuZXNzLmxheW91dFNlcnZpY2UudG9nZ2xlU2lkZVBhbmUoKTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdCFzaWRlYmFySGlkZGVuQ2FsbHMoKS5pbmNsdWRlcyhmYWxzZSksXG5cdFx0XHQnc2lkZWJhciBtdXN0IG5vdCBiZSBhdXRvLXNob3duIHdoZW4gaXQgd2FzIGNsb3NlZCBiZWZvcmUgdGhlIHJlbG9hZCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDddIGRvZXMgbm90IG1hbmFnZSB0aGUgc2lkZWJhciB3aGlsZSB0aGUgZWRpdG9yIGlzIG1heGltaXplZCcsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0aGFybmVzcy5lZGl0b3JNYXhpbWl6ZWQgPSB0cnVlO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQuZmlyZSgpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRyZXNpemVXaW5kb3coODAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSBkb2VzIG5vdCBtYW5hZ2UgdGhlIHNpZGViYXIgd2hlbiB0aGUgZXhwZXJpbWVudGFsIHNldHRpbmcgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcih7IHJlc3BvbnNpdmVTaWRlYmFyOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0cmVzaXplV2luZG93KDgwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEN10gZG9lcyBub3QgaGlkZSB0aGUgc2lkZWJhciB3aGVuIG5hdmlnYXRpbmcgdG8gYSBzZXNzaW9uIHRoYXQgcmVzdG9yZXMgdGhlIHNpZGUgcGFuZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkIgPSBVUkkucGFyc2UoJ3Nlc3Npb246MicpO1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoe1xuXHRcdFx0cmV2ZWFsQXV4aWxpYXJ5QmFyT25PcGVuOiB0cnVlLFxuXHRcdFx0bGF5b3V0U3RhdGU6IFt7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbkIudG9TdHJpbmcoKSxcblx0XHRcdFx0dmlld1N0YXRlOiB7IGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUsIGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCB9LFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0Ly8gU21hbGwgd2luZG93IHdpdGggdGhlIHNpZGUgcGFuZWwgY2xvc2VkOiB0aGUgc2lkZWJhciBpcyBzaG93biAobm90IGNvbnN0cmFpbmVkKS5cblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdHJlc2l6ZVdpbmRvdyg4MDApO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBhIHNlc3Npb24gd2hvc2UgcmVzdG9yZSByZS1vcGVucyB0aGUgc2lkZSBwYW5lbC5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKHNlc3Npb25CKSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lkZWJhckhpZGRlbkNhbGxzKCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3XSBkb2VzIG5vdCBoaWRlIHRoZSBzaWRlYmFyIHdoZW4gbmF2aWdhdGluZyB0byBhIHNlc3Npb24gd2hvc2Ugd29ya2luZyBzZXQgcmV2ZWFscyB0aGUgZWRpdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24xID0gVVJJLnBhcnNlKCdzZXNzaW9uOjEnKTtcblx0XHRjb25zdCBzZXNzaW9uMiA9IFVSSS5wYXJzZSgnc2Vzc2lvbjoyJyk7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcih7XG5cdFx0XHR1c2VNb2RhbDogJ3NvbWUnLFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyczogW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSB9XSxcblx0XHRcdGxheW91dFN0YXRlOiBbe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb24xLnRvU3RyaW5nKCksXG5cdFx0XHRcdGVkaXRvcldvcmtpbmdTZXQ6IHsgaWQ6ICd3cy0xJywgbmFtZTogJ3dzLTEnIH0sXG5cdFx0XHRcdHZpZXdTdGF0ZTogeyBhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLCBhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IENIQU5HRVNfVklFV19DT05UQUlORVJfSUQgfSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXG5cdFx0Ly8gU3RhcnQgb24gYSBzZXNzaW9uIHdpdGhvdXQgYSB3b3JraW5nIHNldC5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKHNlc3Npb24yKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gU21hbGwgd2luZG93LCBhdXggYmFyIG9wZW4sIGVkaXRvciBjbG9zZWQ6IG5vdCBjb25zdHJhaW5lZCB5ZXQgKGVkaXRvciBoaWRkZW4pLlxuXHRcdHNldFBhcnRWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRzZXRQYXJ0VmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdHJlc2l6ZVdpbmRvdyg4MDApO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byB0aGUgc2Vzc2lvbiB3aG9zZSB3b3JraW5nIHNldCByZXZlYWxzIHRoZSBlZGl0b3IgKGFzeW5jKS5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKHNlc3Npb24xKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFySGlkZGVuQ2FsbHMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDddIGRvZXMgbm90IG1hbmFnZSB0aGUgc2lkZWJhciB3aGlsZSBtdWx0aXBsZSBzZXNzaW9ucyBhcmUgdmlzaWJsZScsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0aGFybmVzcy52aXNpYmxlU2Vzc2lvbnNPYnMuc2V0KFtcblx0XHRcdG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLFxuXHRcdFx0bWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSksXG5cdFx0XSwgdW5kZWZpbmVkKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0cmVzaXplV2luZG93KDgwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJIaWRkZW5DYWxscygpLCBbXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBTaW5nbGUtcGFuZSBUb2dnbGUgRGV0YWlscyBsZWF2ZXMgdGhlIFNlc3Npb25zIHNpZGViYXIgdW50b3VjaGVkIC0tLVxuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gb3BlbmluZyBkZXRhaWxzIGRvZXMgbm90IGhpZGUgdGhlIHNlc3Npb25zIGxpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgbWFpbkNvbnRhaW5lcldpZHRoOiA4MDAgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5TSURFQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRjb250cm9sbGVyLnRvZ2dsZURldGFpbHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGV0YWlsc1Zpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdHNpZGViYXJIaWRkZW5DYWxsczogc2lkZWJhckhpZGRlbkNhbGxzKCksXG5cdFx0fSwge1xuXHRcdFx0ZGV0YWlsc1Zpc2libGU6IHRydWUsXG5cdFx0XHRzaWRlYmFySGlkZGVuQ2FsbHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIGNsb3NpbmcgZGV0YWlscyBkb2VzIG5vdCBzaG93IGEgbWFudWFsbHkgaGlkZGVuIHNlc3Npb25zIGxpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgbWFpbkNvbnRhaW5lcldpZHRoOiA4MDAgfSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLlNJREVCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHRjb250cm9sbGVyLnRvZ2dsZURldGFpbHMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGV0YWlsc1Zpc2libGU6IGhhcm5lc3MucGFydFZpc2liaWxpdHkuZ2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdHNpZGViYXJIaWRkZW5DYWxsczogc2lkZWJhckhpZGRlbkNhbGxzKCksXG5cdFx0fSwge1xuXHRcdFx0ZGV0YWlsc1Zpc2libGU6IGZhbHNlLFxuXHRcdFx0c2lkZWJhckhpZGRlbkNhbGxzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW0Q3IHNpbmdsZS1wYW5lXSBjb250cmlidXRlcyBUb2dnbGUgRGV0YWlscyBpbiB0aGUgdHJhaWxpbmcgZWRpdG9yIGhlYWRlciBncm91cCcsICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcigpO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyTGF5b3V0KVxuXHRcdFx0LmZpbHRlcihpc0lNZW51SXRlbSlcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpdGVtLmNvbW1hbmQuaWQgPT09IFRPR0dMRV9ERVRBSUxTX0NPTU1BTkRfSUQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMSwgJ2V4YWN0bHkgb25lIFRvZ2dsZSBEZXRhaWxzIGl0ZW0gb24gdGhlIGVkaXRvciBoZWFkZXInKTtcblx0XHRjb25zdCB3aGVuID0gaXRlbXNbMF0ud2hlbj8uc2VyaWFsaXplKCkgPz8gJyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRncm91cDogaXRlbXNbMF0uZ3JvdXAsXG5cdFx0XHRpY29uOiBUaGVtZUljb24uaXNUaGVtZUljb24oaXRlbXNbMF0uY29tbWFuZC5pY29uKSA/IGl0ZW1zWzBdLmNvbW1hbmQuaWNvbi5pZCA6IHVuZGVmaW5lZCxcblx0XHRcdG9yZGVyOiBpdGVtc1swXS5vcmRlcixcblx0XHRcdGhhc1RvZ2dsZWQ6ICEhaXRlbXNbMF0uY29tbWFuZC50b2dnbGVkLFxuXHRcdFx0Z2F0ZWRPbkVkaXRvckFyZWE6IHdoZW4uaW5jbHVkZXMoTWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dC5rZXkpLFxuXHRcdFx0Z2F0ZWRPbkRvY2tlZERldGFpbHM6IHdoZW4uaW5jbHVkZXMoSGFzRG9ja2VkRGV0YWlsc0NvbnRleHQua2V5KSxcblx0XHR9LCB7XG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5saXN0U2VsZWN0aW9uLmlkLFxuXHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0aGFzVG9nZ2xlZDogdHJ1ZSxcblx0XHRcdGdhdGVkT25FZGl0b3JBcmVhOiB0cnVlLFxuXHRcdFx0Z2F0ZWRPbkRvY2tlZERldGFpbHM6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBbRDEwXSBBdXhpbGlhcnkgYmFyIHBhcnQgaGlkZGVuIHdoZW4gaXQgaGFzIG5vIGFjdGl2ZSB2aWV3IGNvbnRhaW5lcnMgLS0tXG5cblx0dGVzdCgnW0QxMF0gaGlkZXMgdGhlIGF1eC1iYXIgcGFydCBmb3IgYSBxdWljayBjaGF0IHdoZW4gaXRzIHZpZXcgY29udGFpbmVycyBhcmUgZ2F0ZWQgb2ZmJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpxYycpLCB7IGlzUXVpY2tDaGF0OiB0cnVlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5hY3RpdmVBdXhWaWV3Q29udGFpbmVySWRzID0gW107XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBBIHF1aWNrIGNoYXQgZ2F0ZXMgb2ZmIENoYW5nZXMgKyBGaWxlcywgc28gdGhlIGF1eCBiYXIgaGFzIG5vIGFjdGl2ZVxuXHRcdC8vIHZpZXcgY29udGFpbmVycyBcdTIwMTQgdGhlIHBhcnQgbXVzdCBoaWRlIGluc3RlYWQgb2Ygc2hvd2luZyBhbiBlbXB0eSBjb2x1bW4uXG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5maXJlKCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5zb21lKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBjLmhpZGRlbiA9PT0gdHJ1ZSksXG5cdFx0XHQnYXV4LWJhciBwYXJ0IHNob3VsZCBoaWRlIHdoZW4gYSBxdWljayBjaGF0IGhhcyBubyBhY3RpdmUgdmlldyBjb250YWluZXJzJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEMTBdIGRvZXMgbm90IGhpZGUgdGhlIGF1eCBiYXIgZHVyaW5nIGVhcmx5IHJlbG9hZCB3aGVuIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uIHlldCcsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKHsgYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogW10gfSk7XG5cdFx0Ly8gU3RhcnR1cC9yZWxvYWQ6IGF1eCByZXN0b3JlZCB2aXNpYmxlIChwZXJzaXN0ZWQpIGJ1dCBubyBhY3RpdmUgc2Vzc2lvbiB5ZXQ7XG5cdFx0Ly8gaXRzIGNvbnRhaW5lcnMgYXJlIHRyYW5zaWVudGx5IGluYWN0aXZlLiBIaWRpbmcgaGVyZSBpcyB0aGUgcmVsb2FkIGZsaWNrZXJcblx0XHQvLyAob3BlbnMgdGhlbiBjbG9zZXMpIFx1MjAxNCBEMTAgbXVzdCBsZWF2ZSBpdCBhbG9uZSB1bnRpbCBhIHNlc3Npb24gc2V0dGxlcy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzLmZpcmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdFtdLFxuXHRcdFx0J2F1eC1iYXIgcGFydCBtdXN0IG5vdCBiZSBoaWRkZW4gYnkgRDEwIHdoaWxlIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZSByZWxvYWRdIHByZXNlcnZlcyBBdXgtb25seSBsYXlvdXQgd2hpbGUgdGhlIGFjdGl2ZSBzZXNzaW9uIGlzIHN0aWxsIHJlc3RvcmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7XG5cdFx0XHRhY3RpdmF0ZUF1eDogdHJ1ZSxcblx0XHRcdGluaXRpYWxQYXJ0VmlzaWJpbGl0eTogbmV3IE1hcChbXG5cdFx0XHRcdFtQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2VdLFxuXHRcdFx0XHRbUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWVdLFxuXHRcdFx0XSksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5nZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLFxuXHRcdFx0ZWRpdG9yUmV2ZWFsczogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGNhbGwgPT4gY2FsbC5wYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiAhY2FsbC5oaWRkZW4pLmxlbmd0aCxcblx0XHRcdGF1eGlsaWFyeUJhckhpZGVzOiBoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscy5maWx0ZXIoY2FsbCA9PiBjYWxsLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGNhbGwuaGlkZGVuKS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZWRpdG9yUmV2ZWFsczogMCxcblx0XHRcdGF1eGlsaWFyeUJhckhpZGVzOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDEwXSBkb2VzIG5vdCBoaWRlIHRoZSBhdXggYmFyIGZvciBhIHdvcmtzcGFjZSBzZXNzaW9uIHdpdGggdHJhbnNpZW50bHkgZW1wdHkgY29udGFpbmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKHsgYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogW10gfSk7XG5cdFx0Ly8gQSByZWFsIHdvcmtzcGFjZSBzZXNzaW9uIHdob3NlIEZpbGVzL0NoYW5nZXMgY29udGV4dCBrZXlzIGhhdmUgbm90IHNldHRsZWRcblx0XHQvLyB5ZXQgKGNvbnRhaW5lcnMgdHJhbnNpZW50bHkgaW5hY3RpdmUpLiBEMTAgbXVzdCBub3QgY29sbGFwc2UgaXRzIHNpZGUgcGFuZS5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjp3cycpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VBY3RpdmVWaWV3RGVzY3JpcHRvcnMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0W10sXG5cdFx0XHQnYXV4LWJhciBwYXJ0IG11c3Qgbm90IGJlIGhpZGRlbiBieSBEMTAgZm9yIGEgd29ya3NwYWNlIHNlc3Npb24gd2l0aCB0cmFuc2llbnRseSBlbXB0eSBjb250YWluZXJzJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tEMTBdIG5ldmVyIHJldmVhbHMgYW4gZW1wdHkgYXV4LWJhciBwYXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyb2xsZXIoeyBhY3RpdmVBdXhWaWV3Q29udGFpbmVySWRzOiBbXSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpxYycpLCB7IGlzUXVpY2tDaGF0OiB0cnVlIH0pLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5maXJlKCk7XG5cblx0XHRhc3NlcnQub2soXG5cdFx0XHQhaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSxcblx0XHRcdCdhdXgtYmFyIHBhcnQgc2hvdWxkIG5ldmVyIGJlIHJldmVhbGVkIHdoZW4gaXQgaGFzIG5vIGFjdGl2ZSB2aWV3IGNvbnRhaW5lcnMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0QxMF0gcmUtaGlkZXMgdGhlIGF1eC1iYXIgcGFydCBpZiBhIHN3aXRjaCB0byBhIHF1aWNrIGNoYXQgbGVmdCBpdCB2aXNpYmxlIHdpdGggbm8gY29udGFpbmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKHsgYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogW10gfSk7XG5cdFx0Ly8gTWlycm9yIGEgc3dpdGNoIHRvIGEgd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdCB3aGVyZSBEM2EgcmV0dXJuZWQgZWFybHlcblx0XHQvLyAobm8gd29ya3NwYWNlKSBhbmQgbGVmdCBhIHByZXZpb3VzbHktdmlzaWJsZSBhdXggYmFyIHNob3dpbmcuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246cWMnKSwgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5LmZpcmUoeyBpZDogQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCwgdmlzaWJsZTogZmFsc2UsIGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgYy5oaWRkZW4gPT09IHRydWUpLFxuXHRcdFx0J2F1eC1iYXIgcGFydCBzaG91bGQgYmUgaGlkZGVuIHJlYWN0aXZlbHkgd2hlbiBhIHF1aWNrIGNoYXQgaGFzIG5vIGFjdGl2ZSB2aWV3IGNvbnRhaW5lcnMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0QxMF0gbGVhdmVzIHRoZSBhdXgtYmFyIHBhcnQgYWxvbmUgd2hlbiBpdCBoYXMgYWN0aXZlIHZpZXcgY29udGFpbmVycycsICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKCk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzID0gW107XG5cblx0XHQvLyBDaGFuZ2VzICsgRmlsZXMgc3RpbGwgYWN0aXZlIChkZWZhdWx0KSBcdTIwMTQgdGhlIHJlYWN0aXZlIHN5bmMgbXVzdCBub3QgdG91Y2ggdGhlIHBhcnQuXG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZUFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5maXJlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuZmlsdGVyKGMgPT4gYy5wYXJ0ID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHRbXSxcblx0XHRcdCdhdXgtYmFyIHBhcnQgc2hvdWxkIGJlIGxlZnQgYXMtaXMgd2hpbGUgaXQgaGFzIGFjdGl2ZSB2aWV3IGNvbnRhaW5lcnMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnW0QxMF0gaGlkZXMgdGhlIGF1eC1iYXIgcGFydCB3aGVuIGEgcXVpY2sgY2hhdCBiZWNvbWVzIHZpc2libGUgd2l0aCBubyBhY3RpdmUgY29udGFpbmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVDb250cm9sbGVyKHsgYWN0aXZlQXV4Vmlld0NvbnRhaW5lcklkczogW10gfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246cWMnKSwgeyBpc1F1aWNrQ2hhdDogdHJ1ZSB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0Ly8gVGhlIHBhcnQgYmVjYW1lIHZpc2libGUgKGUuZy4gYSBiYXJlIGRldGFpbCB0b2dnbGUgdGhhdCBzaG93cyB0aGUgY29sdW1uXG5cdFx0Ly8gYmVmb3JlIGFueSBjb250YWluZXIgaXMgb3BlbmVkKSB3aXRob3V0IGFueSBjb250YWluZXItL2Rlc2NyaXB0b3ItY2hhbmdlXG5cdFx0Ly8gc2lnbmFsIGZpcmluZy4gRm9yIGEgcXVpY2sgY2hhdCBEMTAgbXVzdCBzdGlsbCByZWNvbmNpbGUgdGhlIGVtcHR5IGNvbHVtblxuXHRcdC8vIGF3YXkgc28gdGhlIHRvZ2dsZS9jb250ZXh0IGtleSBuZXZlciByZWFkcyBcIm9uXCIgb3ZlciBhIGJsYW5rIHBhbmVsLlxuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5vayhcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLnNvbWUoYyA9PiBjLnBhcnQgPT09IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUICYmIGMuaGlkZGVuID09PSB0cnVlKSxcblx0XHRcdCdhdXgtYmFyIHBhcnQgc2hvdWxkIGhpZGUgd2hlbiBhIHF1aWNrIGNoYXQgYmVjb21lcyB2aXNpYmxlIHdpdGggbm8gYWN0aXZlIHZpZXcgY29udGFpbmVycydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdbRDEwXSBsZWF2ZXMgdGhlIGF1eC1iYXIgcGFydCB2aXNpYmxlIHdoZW4gaXQgYmVjb21lcyB2aXNpYmxlIHdpdGggYWN0aXZlIGNvbnRhaW5lcnMnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJvbGxlcigpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLnNldFBhcnRIaWRkZW5DYWxscyA9IFtdO1xuXG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGhhcm5lc3Muc2V0UGFydEhpZGRlbkNhbGxzLmZpbHRlcihjID0+IGMucGFydCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpLFxuXHRcdFx0W10sXG5cdFx0XHQnYXV4LWJhciBwYXJ0IHNob3VsZCBzdGF5IHZpc2libGUgd2hlbiBpdCBiZWNvbWVzIHZpc2libGUgd2l0aCBhY3RpdmUgdmlldyBjb250YWluZXJzJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBbRDEwXSBUb2dnbGUgU2lkZSBQYW5lbCB3aXRoIGFuIGVtcHR5IGF1eCBiYXIgLS0tXG5cblxuXHQvLyAtLS0gU2luZ2xlLXBhbmUgbWFuYWdlZCBkb2NrZWQgdGFicyAoQ2hhbmdlcyArIEZpbGVzIHBsYWNlaG9sZGVyKSAtLS1cblxuXHRhc3luYyBmdW5jdGlvbiBzZXR0bGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA2OyBpKyspIHtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gaGFzRmlsZXNUYWIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNvbWUoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gaGFzQ2hhbmdlc1RhYigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc29tZShlID0+ICEoZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSAmJiBlLnJlc291cmNlICE9PSB1bmRlZmluZWQpO1xuXHR9XG5cblx0dGVzdCgnW21hbmFnZWQgdGFic10gZW5zdXJlcyB0aGUgQ2hhbmdlcyBhbmQgRmlsZXMgdGFicyBmb3IgYSBjcmVhdGVkIHNlc3Npb24gdW5kZXIgc3VwcHJlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRjb25zdCBmaWxlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLFxuXHRcdFx0ZmlsZXNSZXNvdXJjZTogZmlsZXNUYWI/LnJlc291cmNlPy50b1N0cmluZygpXG5cdFx0fSwge1xuXHRcdFx0aGFzQ2hhbmdlc1RhYjogdHJ1ZSxcblx0XHRcdGZpbGVzUmVzb3VyY2U6IFVSSS5maWxlKCcvcmVwbycpLnRvU3RyaW5nKClcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFic10gdXBkYXRlcyB0aGUgRmlsZXMgcm9vdCB3aGVuIHRoZSBhY3RpdmUgc2Vzc2lvbiBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRjb25zdCBmaXJzdCA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyksIHtcblx0XHRcdHdvcmtzcGFjZToge1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcmVwby9maXJzdCcpLFxuXHRcdFx0XHRsYWJlbDogJ2ZpcnN0Jyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZXBvLFxuXHRcdFx0XHRmb2xkZXJzOiBbeyByb290OiBVUkkuZmlsZSgnL3JlcG8nKSwgd29ya2luZ0RpcmVjdG9yeTogVVJJLmZpbGUoJy9yZXBvL2ZpcnN0JyksIG5hbWU6ICdmaXJzdCcsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjInKSwge1xuXHRcdFx0d29ya3NwYWNlOiB7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9yZXBvL3NlY29uZCcpLFxuXHRcdFx0XHRsYWJlbDogJ3NlY29uZCcsXG5cdFx0XHRcdGljb246IENvZGljb24ucmVwbyxcblx0XHRcdFx0Zm9sZGVyczogW3sgcm9vdDogVVJJLmZpbGUoJy9yZXBvJyksIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKCcvcmVwby9zZWNvbmQnKSwgbmFtZTogJ3NlY29uZCcsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGZpcnN0LCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vjb25kLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgZmlsZXNUYWJzID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmlsdGVyKGUgPT4gZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVzVGFicy5tYXAoZWRpdG9yID0+IGVkaXRvci5yZXNvdXJjZT8udG9TdHJpbmcoKSksIFtVUkkuZmlsZSgnL3JlcG8vc2Vjb25kJykudG9TdHJpbmcoKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gQ2hhbmdlcyBwaWxsXSByZXZlYWxzIHRoZSBlZGl0b3IgYXJlYSBiZWZvcmUgb3BlbmluZyB0aGUgbWFuYWdlZCBDaGFuZ2VzIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMgPSBbXTtcblxuXHRcdGNvbnN0IGhhbmRsZXIgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3dvcmtiZW5jaC5hZ2VudFNlc3Npb25zLmFjdGlvbi52aWV3Q2hhbmdlcycpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhoYW5kbGVyLCAnQ2hhbmdlcyBwaWxsIGNvbW1hbmQgc2hvdWxkIGJlIHJlZ2lzdGVyZWQnKTtcblxuXHRcdGF3YWl0IGhhbmRsZXIoaGFybmVzcy5pbnN0YVNlcnZpY2UsIHNlc3Npb24pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JSZXZlYWxlZDogaGFybmVzcy5zZXRQYXJ0SGlkZGVuQ2FsbHMuc29tZShjID0+IGMucGFydCA9PT0gUGFydHMuRURJVE9SX1BBUlQgJiYgYy5oaWRkZW4gPT09IGZhbHNlKSxcblx0XHRcdGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JSZXZlYWxlZDogdHJ1ZSxcblx0XHRcdGhhc0NoYW5nZXNUYWI6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBTY2VuYXJpbyA5XSBzaG93cyBvbmx5IEZpbGVzIGZvciBhIG5ldy1zZXNzaW9uIHZpZXcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOm5ldycpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLFxuXHRcdFx0aGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCksXG5cdFx0XHRjaGFuZ2VzVGFiTWlzc2luZzogaGFybmVzcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dC5rZXkpLFxuXHRcdH0sIHtcblx0XHRcdGhhc0NoYW5nZXNUYWI6IGZhbHNlLFxuXHRcdFx0aGFzRmlsZXNUYWI6IHRydWUsXG5cdFx0XHRjaGFuZ2VzVGFiTWlzc2luZzogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBuZXcgc2Vzc2lvbl0ga2VlcHMgQ2hhbmdlcyB1bmF2YWlsYWJsZSBhZnRlciBhIGRlbGF5ZWQgZGlmZmVyZW50LWZvbGRlciByZXN0b3JlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246Y3JlYXRlZCcpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc0NoYW5nZXNUYWI6IHRydWUsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiBmYWxzZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpuZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiBmYWxzZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHQvLyBBIGRpZmZlcmVudCBkZWZhdWx0IGZvbGRlciBkZWxheXMgdGhpcyByZXN0b3JlIHVudGlsIGFmdGVyIHRoZSBkcmFmdCByZWNvbmNpbGUuXG5cdFx0Y29uc3QgZmlsZXNUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGVkaXRvciA9PiBlZGl0b3IgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0YXNzZXJ0Lm9rKGZpbGVzVGFiKTtcblx0XHRjb250cm9sbGVyLnJ1bldpdGhSZXN0b3JlKCgpID0+IHtcblx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZSgwLCBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGgsIGZpbGVzVGFiKTtcblx0XHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSBmaWxlc1RhYjtcblx0XHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHR9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogZmFsc2UsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gc3VibWl0XSBhY3RpdmF0ZXMgQ2hhbmdlcyBvbmx5IGFmdGVyIGEgc3VibWl0dGVkIHNlc3Npb24gcmVwb3J0cyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOm5ldycpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiBmYWxzZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHQvLyBTdWJtaXQgZnJvbSB0aGUgRmlsZXMgdGFiOiB2aXNpYmlsaXR5IGFuZCB0aGUgYWN0aXZlIHRhYiBzdGF5IHVuY2hhbmdlZC5cblx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+IGUgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCk7XG5cdFx0KHNlc3Npb24uaXNDcmVhdGVkIGFzIElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgY2hhbmdlc1Jlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNoYW5nZXNBY3RpdmVCZWZvcmVDaGFuZ2VzID0gISFoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0Py5yZXNvdXJjZSAmJiBpc0VxdWFsKGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQucmVzb3VyY2UsIGNoYW5nZXNSZXNvdXJjZSk7XG5cdFx0KHNlc3Npb24uY2hhbmdlcyBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPikuc2V0KFttYWtlQ2hhbmdlKCcvZmlsZS50cycpXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLFxuXHRcdFx0aGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCksXG5cdFx0XHRjaGFuZ2VzQWN0aXZlQmVmb3JlQ2hhbmdlcyxcblx0XHRcdGNoYW5nZXNBY3RpdmU6ICEhaGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dD8ucmVzb3VyY2UgJiYgaXNFcXVhbChoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0LnJlc291cmNlLCBjaGFuZ2VzUmVzb3VyY2UpLFxuXHRcdH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUsIGNoYW5nZXNBY3RpdmVCZWZvcmVDaGFuZ2VzOiBmYWxzZSwgY2hhbmdlc0FjdGl2ZTogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIHN1Ym1pdF0gYWN0aXZhdGVzIENoYW5nZXMgYWZ0ZXIgY2hhbmdlcyBhcnJpdmUgb24gYSByZXNvdXJjZS1yZXBsYWNlIHN1Ym1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gTmV3LXNlc3Npb24gZHJhZnQgYWN0aXZlOiBvbmx5IEZpbGVzIGlzIHByZXNlbnQuXG5cdFx0Y29uc3QgZHJhZnQgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246ZHJhZnQnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChkcmFmdCwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc0NoYW5nZXNUYWI6IGZhbHNlLCBoYXNGaWxlc1RhYjogdHJ1ZSB9KTtcblxuXHRcdC8vIFRoZSBwcm92aWRlciBjb21taXRzIHRoZSBkcmFmdCBieSByZXBsYWNpbmcgaXQgd2l0aCBhIG5ldyBjcmVhdGVkIHJlc291cmNlLlxuXHRcdGNvbnN0IGNvbW1pdHRlZFJlc291cmNlID0gVVJJLnBhcnNlKCdzZXNzaW9uOmNvbW1pdHRlZCcpO1xuXHRcdGNvbnN0IGNvbW1pdHRlZCA9IG1ha2VTZXNzaW9uKGNvbW1pdHRlZFJlc291cmNlLCB7IGlzQ3JlYXRlZDogdHJ1ZSB9KTtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQoZHJhZnQuaXNDcmVhdGVkIGFzIElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4pLnNldCh0cnVlLCB0eCk7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KGNvbW1pdHRlZCwgdHgpO1xuXHRcdH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgY2hhbmdlc1Jlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKGNvbW1pdHRlZFJlc291cmNlKTtcblx0XHRjb25zdCBjaGFuZ2VzQWN0aXZlQmVmb3JlQ2hhbmdlcyA9ICEhaGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dD8ucmVzb3VyY2UgJiYgaXNFcXVhbChoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0LnJlc291cmNlLCBjaGFuZ2VzUmVzb3VyY2UpO1xuXHRcdChjb21taXR0ZWQuY2hhbmdlcyBhcyBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPikuc2V0KFttYWtlQ2hhbmdlKCcvZmlsZS50cycpXSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLFxuXHRcdFx0aGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCksXG5cdFx0XHRjaGFuZ2VzQWN0aXZlQmVmb3JlQ2hhbmdlcyxcblx0XHRcdGNoYW5nZXNBY3RpdmU6ICEhaGFybmVzcy5hY3RpdmVFZGl0b3JJbnB1dD8ucmVzb3VyY2UgJiYgaXNFcXVhbChoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0LnJlc291cmNlLCBjaGFuZ2VzUmVzb3VyY2UpLFxuXHRcdH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUsIGNoYW5nZXNBY3RpdmVCZWZvcmVDaGFuZ2VzOiBmYWxzZSwgY2hhbmdlc0FjdGl2ZTogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIHNlc3Npb24gc3dpdGNoXSBkb2VzIG5vdCBsZWFrIGEgc3VwZXJzZWRlZCBzdWJtaXRcXCdzIFwiYWN0aXZhdGUgQ2hhbmdlc1wiIGludGVudCBvbnRvIHRoZSBzd2l0Y2hlZC10byBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHQvLyBTZXNzaW9uIEEgaXMgYSBuZXctc2Vzc2lvbiBkcmFmdCB3aXRoIG9ubHkgRmlsZXMuXG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YScpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25BLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogZmFsc2UsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXG5cdFx0Ly8gUGF1c2UgdGhlIHZlcnkgbmV4dCBDaGFuZ2VzIG9wZW4gc28gQSdzIHN1Ym1pdCByZWNvbmNpbGUgc3RhbGxzIG1pZC1vcGVuLlxuXHRcdGxldCByZWxlYXNlQ2hhbmdlc09wZW4hOiAoKSA9PiB2b2lkO1xuXHRcdGNvbnN0IGNoYW5nZXNPcGVuR2F0ZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4geyByZWxlYXNlQ2hhbmdlc09wZW4gPSByZXNvbHZlOyB9KTtcblx0XHRsZXQgZ2F0ZUFybWVkID0gdHJ1ZTtcblx0XHRoYXJuZXNzLm9uT3BlbkNoYW5nZXNFZGl0b3IgPSAoKSA9PiB7XG5cdFx0XHRpZiAoZ2F0ZUFybWVkKSB7XG5cdFx0XHRcdGdhdGVBcm1lZCA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4gY2hhbmdlc09wZW5HYXRlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0Ly8gU3VibWl0IEE6IHRoaXMgcXVldWVzIGEgcmVjb25jaWxlIHRoYXQgb3BlbnMgdGhlIENoYW5nZXMgdGFiICphY3RpdmUqOyBpdFxuXHRcdC8vIHN0YWxscyBhd2FpdGluZyB0aGUgZ2F0ZWQgb3Blbi5cblx0XHQoc2Vzc2lvbkEuaXNDcmVhdGVkIGFzIElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4pLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdChzZXNzaW9uQS5jaGFuZ2VzIGFzIElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW10+KS5zZXQoW21ha2VDaGFuZ2UoJy9maWxlLnRzJyldLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGNvbnN0IGFBY3RpdmVDYWxscyA9IGhhcm5lc3Mub3BlbkNoYW5nZXNFZGl0b3JDYWxscy5maWx0ZXIoYyA9PiBpc0VxdWFsKGMuc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uQS5yZXNvdXJjZSkgJiYgYy5hY3RpdmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhQWN0aXZlQ2FsbHMubGVuZ3RoLCAxLCAnQVxcJ3Mgc3VibWl0IHNob3VsZCBvcGVuIGl0cyBDaGFuZ2VzIHRhYiBhY3RpdmUgKGFuZCBzdGFsbCBvbiB0aGUgZ2F0ZSknKTtcblxuXHRcdC8vIFdoaWxlIEFcXCdzIHN1Ym1pdCByZWNvbmNpbGUgaXMgc3RhbGxlZCwgc3dpdGNoIHRvIGEgZGlmZmVyZW50IGNyZWF0ZWRcblx0XHQvLyBzZXNzaW9uIEIgKGEgcGxhaW4gc3dpdGNoIFx1MjAxNCBuZXZlciBhIHN1Ym1pdCkuXG5cdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YicpLCB7IGlzQ3JlYXRlZDogdHJ1ZSB9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25CLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gUmVsZWFzZSB0aGUgZ2F0ZTogQVxcJ3MgcmVjb25jaWxlIHJlc3VtZXMsIGZpbmRzIGl0c2VsZiBzdXBlcnNlZGVkLCBhbmQgbXVzdFxuXHRcdC8vIE5PVCBoYW5kIGl0cyBcImFjdGl2YXRlIENoYW5nZXNcIiBpbnRlbnQgdG8gQi5cblx0XHRyZWxlYXNlQ2hhbmdlc09wZW4oKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEIsIGJlaW5nIGEgcGxhaW4gc3dpdGNoLCBtdXN0IG5ldmVyIGhhdmUgaXRzIENoYW5nZXMgdGFiIG9wZW5lZCAqYWN0aXZlKi5cblx0XHRjb25zdCBiQWN0aXZlQ2FsbHMgPSBoYXJuZXNzLm9wZW5DaGFuZ2VzRWRpdG9yQ2FsbHMuZmlsdGVyKGMgPT4gaXNFcXVhbChjLnNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvbkIucmVzb3VyY2UpICYmIGMuYWN0aXZlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYkNoYW5nZXNPcGVuZWRBY3RpdmU6IGJBY3RpdmVDYWxscy5sZW5ndGggfSwgeyBiQ2hhbmdlc09wZW5lZEFjdGl2ZTogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIHNlc3Npb24gc3dpdGNoXSBkb2VzIG5vdCBwdWJsaXNoIHdvcmtzcGFjZSBmcm9tIGEgc3VwZXJzZWRlZCByZWNvbmNpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGNvbnN0IHNlc3Npb25BID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmEnKSwge1xuXHRcdFx0d29ya3NwYWNlOiB7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9yZXBvL2EnKSxcblx0XHRcdFx0bGFiZWw6ICdhJyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZXBvLFxuXHRcdFx0XHRmb2xkZXJzOiBbeyByb290OiBVUkkuZmlsZSgnL3JlcG8vYScpLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3JlcG8vYScpLCBuYW1lOiAnYScsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRjb25zdCBmaWxlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0Y29uc3QgcHVibGlzaGVkV29ya3NwYWNlczogc3RyaW5nW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoZmlsZXNUYWIub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGZpbGVzVGFiLndvcmtzcGFjZT8ubGFiZWw7XG5cdFx0XHRpZiAobGFiZWwpIHtcblx0XHRcdFx0cHVibGlzaGVkV29ya3NwYWNlcy5wdXNoKGxhYmVsKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgcmVsZWFzZUNsb3NlITogKCkgPT4gdm9pZDtcblx0XHRjb25zdCBjbG9zZUdhdGUgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgcmVsZWFzZUNsb3NlID0gcmVzb2x2ZTsgfSk7XG5cdFx0bGV0IGdhdGVBcm1lZCA9IHRydWU7XG5cdFx0aGFybmVzcy5vblJlcGxhY2VFZGl0b3JzID0gKCkgPT4ge1xuXHRcdFx0aWYgKGdhdGVBcm1lZCkge1xuXHRcdFx0XHRnYXRlQXJtZWQgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIGNsb3NlR2F0ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlc3Npb25CID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmInKSwge1xuXHRcdFx0d29ya3NwYWNlOiB7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9yZXBvL2InKSxcblx0XHRcdFx0bGFiZWw6ICdiJyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZXBvLFxuXHRcdFx0XHRmb2xkZXJzOiBbeyByb290OiBVUkkuZmlsZSgnL3JlcG8vYicpLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3JlcG8vYicpLCBuYW1lOiAnYicsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkIsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRjb25zdCBzZXNzaW9uQyA9IG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpjJyksIHtcblx0XHRcdHdvcmtzcGFjZToge1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcmVwby9jJyksXG5cdFx0XHRcdGxhYmVsOiAnYycsXG5cdFx0XHRcdGljb246IENvZGljb24ucmVwbyxcblx0XHRcdFx0Zm9sZGVyczogW3sgcm9vdDogVVJJLmZpbGUoJy9yZXBvL2MnKSwgd29ya2luZ0RpcmVjdG9yeTogVVJJLmZpbGUoJy9yZXBvL2MnKSwgbmFtZTogJ2MnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH1dLFxuXHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdH1cblx0XHR9KTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25DLCB1bmRlZmluZWQpO1xuXHRcdHJlbGVhc2VDbG9zZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwdWJsaXNoZWRXb3Jrc3BhY2VzLCBbJ2MnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBkZXRhaWxzLW9ubHldIGFsd2F5cyByZXN0b3JlcyBib3RoIGRvY2tlZCBpbnB1dHMgd2hpbGUgb25seSBkZXRhaWxzIGFyZSB2aXNpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHtcblx0XHRcdGFjdGl2YXRlQXV4OiB0cnVlLFxuXHRcdFx0aW5pdGlhbFBhcnRWaXNpYmlsaXR5OiBuZXcgTWFwKFtbUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlXSwgW1BhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlXV0pLFxuXHRcdFx0c2lkZVBhbmVWaXNpYmlsaXR5U3RhdGU6IHtcblx0XHRcdFx0bmV3U2Vzc2lvbjogeyBlZGl0b3JWaXNpYmxlOiBmYWxzZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRleGlzdGluZ1Nlc3Npb246IHsgZWRpdG9yVmlzaWJsZTogZmFsc2UsIGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHQvLyBTaW11bGF0ZSBsaWZlY3ljbGUgcmVtb3ZhbCBvZiBGaWxlcyB3aGlsZSBDaGFuZ2VzIGtlZXBzIHRoZSBncm91cCBub24tZW1wdHkuXG5cdFx0Y29uc3QgZmlsZVRhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpITtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihmaWxlVGFiKSwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGZpbGVUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHRjb25zdCBjaGFuZ2VzVGFiID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+ICEoZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSAmJiBlLnJlc291cmNlICE9PSB1bmRlZmluZWQpITtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihjaGFuZ2VzVGFiKSwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGNoYW5nZXNUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiB0cnVlLCBoYXNGaWxlc1RhYjogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIGRldGFpbHMtb25seV0gcmVzdG9yZXMgRmlsZXMgd2hlbiB0aGUgZWRpdG9yIGFyZWEgaGlkZXMgd2l0aG91dCBhbiBlZGl0b3IgY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGNvbnN0IGZpbGVUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGUgPT4gZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YoZmlsZVRhYiksIDEpO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiBmaWxlVGFiIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgZmFsc2UpO1xuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0ZpbGVzVGFiKCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gZGV0YWlscy1vbmx5XSBhbiBlZGl0b3IgcmV2ZWFsIGRvZXMgTk9UIGZvcmNlIGJhY2sgYSBjbG9zZWQgbWFuYWdlZCB0YWInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBsaWZlY3ljbGUgcmVtb3ZhbCBvZiBGaWxlcyB3aGlsZSBDaGFuZ2VzIHJlbWFpbnMuXG5cdFx0Y29uc3QgZmlsZVRhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpITtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihmaWxlVGFiKSwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGZpbGVUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNGaWxlc1RhYigpLCBmYWxzZSk7XG5cblx0XHQvLyBSZW9wZW4gdGhlIHNpZGUgcGFuZSB3aXRoIHRoZSBlZGl0b3IgYXJlYSB2aXNpYmxlIChub3QgZGV0YWlscy1vbmx5KTogdGhlXG5cdFx0Ly8gY2xvc2UgaXMgcmVzcGVjdGVkLCBzbyBGaWxlcyBpcyBub3QgZm9yY2VkIGJhY2suXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5vbkRpZFJldmVhbFNpZGVQYW5lLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gbmV3IHNlc3Npb25dIHJlLW9wZW5zIEZpbGVzIHdoZW4gYSB3b3JraW5nLXNldCBhcHBseSBlbXB0aWVzIHRoZSBncm91cCBkdXJpbmcgdGhlIHN3aXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEEgY3JlYXRlZCBzZXNzaW9uIHdpdGggaXRzIGRvY2tlZCB0YWJzLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmNyZWF0ZWQnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiB0cnVlLCBoYXNGaWxlc1RhYjogdHJ1ZSB9KTtcblxuXHRcdC8vIFN3aXRjaCB0byBhIG5ldyAodW5jcmVhdGVkKSBzZXNzaW9uLiBJdHMgZW1wdHkgd29ya2luZyBzZXQgY2xvc2VzIHRoZVxuXHRcdC8vIHByZXZpb3VzIHNlc3Npb24ncyBkb2NrZWQgdGFicywgZW1wdHlpbmcgdGhlIGdyb3VwIFx1MjAxNCB0aGlzIGhhcHBlbnMgdW5kZXIgYVxuXHRcdC8vIGxheW91dCByZXN0b3JlLCBub3QgYSB1c2VyIGNsb3NlLlxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOm5ldycpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KSwgdW5kZWZpbmVkKTtcblx0XHRjb250cm9sbGVyLnJ1bldpdGhSZXN0b3JlKCgpID0+IHtcblx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZSgwLCBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGgpO1xuXHRcdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gT25seSBGaWxlcyBpcyByZXN0b3JlZCBmb3IgdGhlIHVuY3JlYXRlZCBzZXNzaW9uLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogZmFsc2UsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gbmV3IHNlc3Npb25dIHJlLW9wZW5zIEZpbGVzIG9uIHJlc3RvcmUtZW5kIGV2ZW4gaWYgbm8gZWRpdG9yLWNoYW5nZSBmaXJlcyBkdXJpbmcgdGhlIHJlc3RvcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpjcmVhdGVkJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IHRydWUgfSk7XG5cblx0XHQvLyBTd2l0Y2ggdG8gYSBuZXcgKHVuY3JlYXRlZCkgc2Vzc2lvbjsgdGhlIHdvcmtpbmctc2V0IGFwcGx5IGVtcHRpZXMgdGhlXG5cdFx0Ly8gZ3JvdXAgZHVyaW5nIHRoZSByZXN0b3JlIGJ1dCB0aGUgdHJhbnNpZW50IGVkaXRvci1jaGFuZ2UgaXMgTk9UIG9ic2VydmVkXG5cdFx0Ly8gKGl0IHJhY2VzIHRoZSBhc3luYyBjbG9zZSkuIE9ubHkgdGhlIHNldHRsZWQgcmVzdG9yZS1lbmQgbXVzdCByZS1vcGVuIHRoZVxuXHRcdC8vIEZpbGVzIHRhYi5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjpuZXcnKSwgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGlzQ3JlYXRlZDogZmFsc2UgfSksIHVuZGVmaW5lZCk7XG5cdFx0Y29udHJvbGxlci5ydW5XaXRoUmVzdG9yZSgoKSA9PiB7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoMCwgaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMubGVuZ3RoKTtcblx0XHR9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogZmFsc2UsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gU2NlbmFyaW8gOV0gcmVtb3ZlcyB0aGUgRmlsZXMgdGFiIHdoaWxlIGEgcmVhbCBlZGl0b3IgaXMgb3BlbiBhbmQgZG9lcyBub3QgcmUtYWRkIGl0IHdoZW4gdGhhdCBmaWxlIGNsb3NlcycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSk7XG5cblx0XHQvLyBBIHJlYWwgZmlsZSBvcGVucyBpbnRvIGEgdmlzaWJsZSBlZGl0b3IgYXJlYS4gUHJvZHVjdGlvbiBmaXJlc1xuXHRcdC8vIG9uV2lsbE9wZW5FZGl0b3IgKmJlZm9yZSogdGhlIGVkaXRvciBpcyBhZGRlZCB0byB0aGUgZ3JvdXAuXG5cdFx0Y29uc3QgcmVhbEVkaXRvciA9IHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChVUkkuZmlsZSgnL3JlcG8vYS50cycpKSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdG9wZW5FZGl0b3IocmVhbEVkaXRvcik7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChyZWFsRWRpdG9yKTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0Y29uc3QgZmlsZXNSZW1vdmVkID0gIWhhc0ZpbGVzVGFiKCk7XG5cblx0XHQvLyBDbG9zaW5nIHRoZSBmaWxlIGxlYXZlcyB0aGUgQ2hhbmdlcyB0YWIgKGdyb3VwIG5vbi1lbXB0eSksIHNvIHRoZSBGaWxlc1xuXHRcdC8vIHBsYWNlaG9sZGVyIGlzIE5PVCByZS1hZGRlZCBcdTIwMTQgdGhlIGRlZmF1bHRzIHJldHVybiBvbmx5IHdoZW4gdGhlIGdyb3VwXG5cdFx0Ly8gZW1wdGllcyBhbmQgdGhlIHNpZGUgcGFuZSBpcyByZW9wZW5lZC5cblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihyZWFsRWRpdG9yKSwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaWxlc1JlbW92ZWQsXG5cdFx0XHRmaWxlc1JlYWRkZWQ6IGhhc0ZpbGVzVGFiKCksXG5cdFx0fSwge1xuXHRcdFx0ZmlsZXNSZW1vdmVkOiB0cnVlLFxuXHRcdFx0ZmlsZXNSZWFkZGVkOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIFNjZW5hcmlvIDldIGtlZXBzIGEgRmlsZXMgdGFiIHRoZSB1c2VyIGFkZHMgdmlhIGArYCB3aGlsZSBhIHJlYWwgZmlsZSBpcyBvcGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gQSByZWFsIGZpbGUgb3BlbnMgYW5kIHRpZGllcyBhd2F5IHRoZSBhdXRvIEZpbGVzIHBsYWNlaG9sZGVyLiBQcm9kdWN0aW9uXG5cdFx0Ly8gZmlyZXMgb25XaWxsT3BlbkVkaXRvciAqYmVmb3JlKiB0aGUgZWRpdG9yIGlzIGFkZGVkIHRvIHRoZSBncm91cC5cblx0XHRjb25zdCByZWFsRWRpdG9yID0gc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KFVSSS5maWxlKCcvcmVwby9hLnRzJykpKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0b3BlbkVkaXRvcihyZWFsRWRpdG9yKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5wdXNoKHJlYWxFZGl0b3IpO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gVGhlIHVzZXIgZXhwbGljaXRseSBhZGRzIHRoZSBGaWxlcyB0YWIgdmlhIGArYCAob3BlbnMgYW4gRW1wdHlGaWxlRWRpdG9ySW5wdXQpLlxuXHRcdGNvbnN0IHVzZXJGaWxlc1RhYiA9IHN0b3JlLmFkZChuZXcgRW1wdHlGaWxlRWRpdG9ySW5wdXQodW5kZWZpbmVkLCBoYXJuZXNzLmxheW91dFNlcnZpY2UpKTtcblx0XHRvcGVuRWRpdG9yKHVzZXJGaWxlc1RhYik7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaCh1c2VyRmlsZXNUYWIpO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEl0IG11c3QgTk9UIGJlIHRpZGllZCBhd2F5IFx1MjAxNCB0aGUgYCtgIGFkZCBpcyBub3QgYSByZWFsLWZpbGUgb3Blbi5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSwgJ2EgdXNlci1hZGRlZCBGaWxlcyB0YWIgc3RheXMgd2hpbGUgYSByZWFsIGZpbGUgaXMgb3BlbicpO1xuXG5cdFx0Ly8gUmUtYWN0aXZhdGluZyB0aGUgYWxyZWFkeS1vcGVuIHJlYWwgZmlsZSAoZS5nLiBzZWxlY3RpbmcgaXRzIHRhYikgZmlyZXNcblx0XHQvLyBvbldpbGxPcGVuRWRpdG9yIHdoaWxlIGl0IGlzIHN0aWxsIGluIHRoZSBncm91cDsgdGhlIGd1YXJkIG11c3QgdHJlYXQgdGhpc1xuXHRcdC8vIGFzIGFuIGFjdGl2YXRpb24sIG5vdCBhIG5ldyBvcGVuLCBzbyB0aGUgdXNlci1hZGRlZCBGaWxlcyB0YWIgc3Vydml2ZXMuXG5cdFx0b3BlbkVkaXRvcihyZWFsRWRpdG9yKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSwgJ3JlLWFjdGl2YXRpbmcgYW4gb3BlbiBmaWxlIG11c3Qgbm90IHRpZHkgdGhlIHVzZXItYWRkZWQgRmlsZXMgdGFiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBTY2VuYXJpbyA5XSBrZWVwcyB0aGUgRmlsZXMgdGFiIHdoZW4gYSBub24tZmlsZSBlZGl0b3IgKGUuZy4gdGhlIGJyb3dzZXIpIG9wZW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNGaWxlc1RhYigpLCB0cnVlKTtcblxuXHRcdC8vIEEgbm9uLWZpbGUgZWRpdG9yICh0aGUgaW50ZWdyYXRlZCBicm93c2VyIHVzZXMgdGhlIGJyb3dzZXJWaWV3IHNjaGVtZSkgb3BlbnNcblx0XHQvLyBpbnRvIGEgdmlzaWJsZSBlZGl0b3IgYXJlYS4gSXQgbXVzdCBOT1QgY29sbGFwc2UgdGhlIEZpbGVzIHBsYWNlaG9sZGVyLlxuXHRcdGNvbnN0IGJyb3dzZXJFZGl0b3IgPSBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoVVJJLnBhcnNlKCdicm93c2VyVmlldzovL2hvc3QvcGFnZScpKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChicm93c2VyRWRpdG9yKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0b3BlbkVkaXRvcihicm93c2VyRWRpdG9yKTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSwgJ2Egbm9uLWZpbGUgZWRpdG9yIG11c3Qgbm90IHJlbW92ZSB0aGUgRmlsZXMgdGFiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gY2xvc2VzIG5vbi1tYW5hZ2VkIHRhYnMgd2hlbiB0aGUgZWRpdG9yIGFyZWEgaGlkZXMgYW5kIHJlb3BlbnMgdGhlbSB3aGVuIHNob3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gQSByZWFsIGZpbGUgb3BlbnMgYmV0d2VlbiB0aGUgbWFuYWdlZCB0YWJzIHdoaWxlIHRoZSBlZGl0b3IgYXJlYSBpcyB2aXNpYmxlLlxuXHRcdGNvbnN0IGZpbGVSZXNvdXJjZSA9IFVSSS5maWxlKCcvcmVwby9hLnRzJyk7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKDEsIDAsIHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChmaWxlUmVzb3VyY2UpKSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBvcmlnaW5hbEluZGV4ID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZEluZGV4KGUgPT4gZS5yZXNvdXJjZSAmJiBpc0VxdWFsKGUucmVzb3VyY2UsIGZpbGVSZXNvdXJjZSkpO1xuXG5cdFx0Ly8gSGlkZSB0aGUgZWRpdG9yIGFyZWEgd2hpbGUgdGhlIGRldGFpbCAoYXV4IGJhcikgc3RheXMgb3BlbiBcdTIwMTQgYSBkZXRhaWwtb25seVxuXHRcdC8vIGNvbGxhcHNlLiBUaGUgcmVhbCBmaWxlIHRhYiBjbG9zZXMsIHRoZSBtYW5hZ2VkIEZpbGVzIHRhYiBzdGF5cy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgY2xvc2VkRmlsZSA9IGhhcm5lc3MuY2xvc2VkRWRpdG9ycy5zb21lKGUgPT4gaXNFcXVhbChlLnJlc291cmNlISwgZmlsZVJlc291cmNlKSk7XG5cdFx0Y29uc3QgZmlsZXNUYWJLZXB0ID0gaGFzRmlsZXNUYWIoKTtcblx0XHRjb25zdCBmaWxlVGFiR29uZSA9ICFoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zb21lKGUgPT4gZS5yZXNvdXJjZSAmJiBpc0VxdWFsKGUucmVzb3VyY2UsIGZpbGVSZXNvdXJjZSkpO1xuXG5cdFx0Ly8gU2hvdyB0aGUgZWRpdG9yIGFyZWEgYWdhaW46IHRoZSBmaWxlIHRhYiBpcyByZW9wZW5lZCBhdCBpdHMgb3JpZ2luYWwgcG9zaXRpb24uXG5cdFx0aGFybmVzcy5vcGVuZWRFZGl0b3JzID0gW107XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xvc2VkRmlsZSxcblx0XHRcdGZpbGVzVGFiS2VwdCxcblx0XHRcdGZpbGVUYWJHb25lLFxuXHRcdFx0cmVvcGVuZWRGaWxlOiBoYXJuZXNzLm9wZW5lZEVkaXRvcnMuc29tZShlID0+IGlzUmVzb3VyY2VFZGl0b3JJbnB1dChlKSAmJiBpc0VxdWFsKGUucmVzb3VyY2UsIGZpbGVSZXNvdXJjZSkpLFxuXHRcdFx0cmVzdG9yZWRBdE9yaWdpbmFsSW5kZXg6IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmRJbmRleChlID0+IGUucmVzb3VyY2UgJiYgaXNFcXVhbChlLnJlc291cmNlLCBmaWxlUmVzb3VyY2UpKSA9PT0gb3JpZ2luYWxJbmRleCxcblx0XHR9LCB7XG5cdFx0XHRjbG9zZWRGaWxlOiB0cnVlLFxuXHRcdFx0ZmlsZXNUYWJLZXB0OiB0cnVlLFxuXHRcdFx0ZmlsZVRhYkdvbmU6IHRydWUsXG5cdFx0XHRyZW9wZW5lZEZpbGU6IHRydWUsXG5cdFx0XHRyZXN0b3JlZEF0T3JpZ2luYWxJbmRleDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBjbG9zZXMgbm9uLW1hbmFnZWQgdGFicyByZXN0b3JlZCB3aGlsZSBvbmx5IGRldGFpbHMgYXJlIHZpc2libGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHtcblx0XHRcdGFjdGl2YXRlQXV4OiB0cnVlLFxuXHRcdFx0aW5pdGlhbFBhcnRWaXNpYmlsaXR5OiBuZXcgTWFwKFtbUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlXSwgW1BhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB0cnVlXV0pLFxuXHRcdFx0c2lkZVBhbmVWaXNpYmlsaXR5U3RhdGU6IHtcblx0XHRcdFx0bmV3U2Vzc2lvbjogeyBlZGl0b3JWaXNpYmxlOiBmYWxzZSwgYXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRleGlzdGluZ1Nlc3Npb246IHsgZWRpdG9yVmlzaWJsZTogZmFsc2UsIGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgZmlsZVJlc291cmNlID0gVVJJLmZpbGUoJy9yZXBvL3Jlc3RvcmVkLnRzJyk7XG5cdFx0Y29udHJvbGxlci5ydW5XaXRoUmVzdG9yZSgoKSA9PiB7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoMSwgMCwgc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KGZpbGVSZXNvdXJjZSkpKTtcblx0XHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHR9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xvc2VkRmlsZTogaGFybmVzcy5jbG9zZWRFZGl0b3JzLnNvbWUoZWRpdG9yID0+IGVkaXRvci5yZXNvdXJjZSAmJiBpc0VxdWFsKGVkaXRvci5yZXNvdXJjZSwgZmlsZVJlc291cmNlKSksXG5cdFx0XHRmaWxlVGFiVmlzaWJsZTogaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc29tZShlZGl0b3IgPT4gZWRpdG9yLnJlc291cmNlICYmIGlzRXF1YWwoZWRpdG9yLnJlc291cmNlLCBmaWxlUmVzb3VyY2UpKSxcblx0XHRcdGZpbGVzVGFiVmlzaWJsZTogaGFzRmlsZXNUYWIoKSxcblx0XHR9LCB7XG5cdFx0XHRjbG9zZWRGaWxlOiB0cnVlLFxuXHRcdFx0ZmlsZVRhYlZpc2libGU6IGZhbHNlLFxuXHRcdFx0ZmlsZXNUYWJWaXNpYmxlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbc2luZ2xlLXBhbmVdIGNsb3NlcyBhbmQgcmVvcGVucyBub24tbWFuYWdlZCB0YWJzIGFkZGVkIHdoaWxlIG9ubHkgZGV0YWlscyBhcmUgdmlzaWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7XG5cdFx0XHRhY3RpdmF0ZUF1eDogdHJ1ZSxcblx0XHRcdGluaXRpYWxQYXJ0VmlzaWJpbGl0eTogbmV3IE1hcChbW1BhcnRzLkVESVRPUl9QQVJULCBmYWxzZV0sIFtQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZV1dKSxcblx0XHRcdHNpZGVQYW5lVmlzaWJpbGl0eVN0YXRlOiB7XG5cdFx0XHRcdG5ld1Nlc3Npb246IHsgZWRpdG9yVmlzaWJsZTogZmFsc2UsIGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUgfSxcblx0XHRcdFx0ZXhpc3RpbmdTZXNzaW9uOiB7IGVkaXRvclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGNvbnN0IGZpbGVSZXNvdXJjZSA9IFVSSS5maWxlKCcvcmVwby9hZGRlZC50cycpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZSgxLCAwLCBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoZmlsZVJlc291cmNlKSkpO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGNvbnN0IGZpbGVUYWJWaXNpYmxlV2hpbGVEZXRhaWxzT25seSA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNvbWUoZWRpdG9yID0+IGVkaXRvci5yZXNvdXJjZSAmJiBpc0VxdWFsKGVkaXRvci5yZXNvdXJjZSwgZmlsZVJlc291cmNlKSk7XG5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjbG9zZWRGaWxlOiBoYXJuZXNzLmNsb3NlZEVkaXRvcnMuc29tZShlZGl0b3IgPT4gZWRpdG9yLnJlc291cmNlICYmIGlzRXF1YWwoZWRpdG9yLnJlc291cmNlLCBmaWxlUmVzb3VyY2UpKSxcblx0XHRcdGZpbGVUYWJWaXNpYmxlV2hpbGVEZXRhaWxzT25seSxcblx0XHRcdHJlb3BlbmVkRmlsZTogaGFybmVzcy5vcGVuZWRFZGl0b3JzLnNvbWUoZWRpdG9yID0+IGlzUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3IpICYmIGlzRXF1YWwoZWRpdG9yLnJlc291cmNlLCBmaWxlUmVzb3VyY2UpKSxcblx0XHR9LCB7XG5cdFx0XHRjbG9zZWRGaWxlOiB0cnVlLFxuXHRcdFx0ZmlsZVRhYlZpc2libGVXaGlsZURldGFpbHNPbmx5OiBmYWxzZSxcblx0XHRcdHJlb3BlbmVkRmlsZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW3NpbmdsZS1wYW5lXSBjbG9zZXMgYSBub24tcmVzdG9yYWJsZSBub24tZG9ja2VkIHRhYiAoZS5nLiB1bnRpdGxlZCBTZWFyY2gpIHdoZW4gdGhlIGVkaXRvciBhcmVhIGhpZGVzLCB3aXRob3V0IHJlc3RvcmluZyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEEgZGlydHksIG5vbi1yZXN0b3JhYmxlIGVkaXRvciAobGlrZSBhbiB1bnRpdGxlZCBTZWFyY2ggZWRpdG9yKSBvcGVuc1xuXHRcdC8vIGJldHdlZW4gdGhlIG1hbmFnZWQgdGFicyB3aGlsZSB0aGUgZWRpdG9yIGFyZWEgaXMgdmlzaWJsZS5cblx0XHRjb25zdCBzZWFyY2hSZXNvdXJjZSA9IFVSSS5wYXJzZSgnc2VhcmNoLWVkaXRvcjovVW50aXRsZWQtMScpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZSgxLCAwLCBzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoc2VhcmNoUmVzb3VyY2UsIHsgZGlydHk6IHRydWUsIG5vblJlc3RvcmFibGU6IHRydWUgfSkpKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gSGlkZSB0aGUgZWRpdG9yIGFyZWEgd2hpbGUgdGhlIGRldGFpbCAoYXV4IGJhcikgc3RheXMgb3BlbiBcdTIwMTQgYSBkZXRhaWwtb25seVxuXHRcdC8vIGNvbGxhcHNlLiBUaGUgbm9uLWRvY2tlZCB0YWIgY2xvc2VzIGV2ZW4gdGhvdWdoIGl0IGlzIGRpcnR5IGFuZCBjYW5ub3QgYmVcblx0XHQvLyBjYXB0dXJlZDsgb25seSB0aGUgbWFuYWdlZCBGaWxlcyB0YWIgcmVtYWlucy5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuRURJVE9SX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgY2xvc2VkU2VhcmNoID0gaGFybmVzcy5jbG9zZWRFZGl0b3JzLnNvbWUoZSA9PiBpc0VxdWFsKGUucmVzb3VyY2UhLCBzZWFyY2hSZXNvdXJjZSkpO1xuXHRcdGNvbnN0IHNlYXJjaFRhYkdvbmUgPSAhaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc29tZShlID0+IGUucmVzb3VyY2UgJiYgaXNFcXVhbChlLnJlc291cmNlLCBzZWFyY2hSZXNvdXJjZSkpO1xuXG5cdFx0Ly8gU2hvdyB0aGUgZWRpdG9yIGFyZWEgYWdhaW46IHRoZSBub24tcmVzdG9yYWJsZSB0YWIgaXMgTk9UIHJlb3BlbmVkLlxuXHRcdGhhcm5lc3Mub3BlbmVkRWRpdG9ycyA9IFtdO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNsb3NlZFNlYXJjaCxcblx0XHRcdHNlYXJjaFRhYkdvbmUsXG5cdFx0XHRmaWxlc1RhYktlcHQ6IGhhc0ZpbGVzVGFiKCksXG5cdFx0XHRyZW9wZW5lZFNlYXJjaDogaGFybmVzcy5vcGVuZWRFZGl0b3JzLnNvbWUoZSA9PiBpc1Jlc291cmNlRWRpdG9ySW5wdXQoZSkgJiYgaXNFcXVhbChlLnJlc291cmNlLCBzZWFyY2hSZXNvdXJjZSkpLFxuXHRcdH0sIHtcblx0XHRcdGNsb3NlZFNlYXJjaDogdHJ1ZSxcblx0XHRcdHNlYXJjaFRhYkdvbmU6IHRydWUsXG5cdFx0XHRmaWxlc1RhYktlcHQ6IHRydWUsXG5cdFx0XHRyZW9wZW5lZFNlYXJjaDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1tzaW5nbGUtcGFuZV0gZG9lcyBOT1QgY2xvc2UgZWRpdG9ycyB3aGVuIHRoZSB3aG9sZSBzaWRlIHBhbmUgaXMgY2xvc2VkIChlZGl0b3IgKyBhdXggaGlkZGVuKScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEEgcmVhbCBmaWxlIGlzIG9wZW4gYmV0d2VlbiB0aGUgbWFuYWdlZCB0YWJzLCBib3RoIHBhcnRzIHZpc2libGUuXG5cdFx0Y29uc3QgZmlsZVJlc291cmNlID0gVVJJLmZpbGUoJy9yZXBvL2EudHMnKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoMSwgMCwgc3RvcmUuYWRkKG5ldyBUZXN0U3R1YkVkaXRvcklucHV0KGZpbGVSZXNvdXJjZSkpKTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHRydWUpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRoYXJuZXNzLmNsb3NlZEVkaXRvcnMgPSBbXTtcblxuXHRcdC8vIENsb3NlIHRoZSB3aG9sZSBzaWRlIHBhbmU6IHRoZSBhdXggYmFyIGlzIGhpZGRlbiBmaXJzdCwgdGhlbiB0aGUgZWRpdG9yXG5cdFx0Ly8gYXJlYSAobWF0Y2hpbmcgdG9nZ2xlU2lkZVBhbmUncyBvcmRlcikuIE5vIGVkaXRvcnMgbXVzdCBiZSBjbG9zZWQuXG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YW55RWRpdG9yQ2xvc2VkOiBoYXJuZXNzLmNsb3NlZEVkaXRvcnMubGVuZ3RoID4gMCxcblx0XHRcdGZpbGVTdGlsbFByZXNlbnQ6IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNvbWUoZSA9PiBlLnJlc291cmNlICYmIGlzRXF1YWwoZS5yZXNvdXJjZSwgZmlsZVJlc291cmNlKSksXG5cdFx0fSwge1xuXHRcdFx0YW55RWRpdG9yQ2xvc2VkOiBmYWxzZSxcblx0XHRcdGZpbGVTdGlsbFByZXNlbnQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBsaWZlY3ljbGUgcmVtb3ZhbF0gZG9lcyBub3QgcmUtb3BlbiBhIG1pc3NpbmcgbWFuYWdlZCB0YWIgd2hpbGUgdGhlIGdyb3VwIHN0YXlzIG5vbi1lbXB0eScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBmaWxlVGFiID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+IGUgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkhO1xuXHRcdGFzc2VydC5vayhmaWxlVGFiKTtcblxuXHRcdC8vIFNpbXVsYXRlIGxpZmVjeWNsZSByZW1vdmFsIG9mIHRoZSBub24tY2xvc2VhYmxlIEZpbGVzIHRhYi5cblx0XHRjb25zdCBpbmRleCA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YoZmlsZVRhYik7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvcjogZmlsZVRhYiB9KTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgZmFsc2UsICd0aGUgY2xvc2VkIEZpbGVzIHRhYiBzdGF5cyBjbG9zZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIGNsb3NlXSByZS1vcGVucyB0aGUgZGVmYXVsdCB0YWJzIGZvciB0aGUgbmV3IHNlc3Npb24gYWZ0ZXIgc3dpdGNoaW5nIChlbXB0eSBncm91cCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KG1ha2VTZXNzaW9uKFVSSS5wYXJzZSgnc2Vzc2lvbjoxJykpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGNvbnN0IGZpbGVUYWIgPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5maW5kKGUgPT4gZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0Y29uc3QgaW5kZXggPSBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGZpbGVUYWIpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGZpbGVUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNGaWxlc1RhYigpLCBmYWxzZSk7XG5cblx0XHQvLyBUaGUgc3dpdGNoZWQtdG8gc2Vzc2lvbidzIHdvcmtpbmcgc2V0IGNsb3NlcyB0aGUgcHJldmlvdXMgc2Vzc2lvbidzIHRhYnMsXG5cdFx0Ly8gbGVhdmluZyBhbiBlbXB0eSBncm91cCB3aGVuIHRoZSByZXN0b3JlIHNldHRsZXMuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MicpKSwgdW5kZWZpbmVkKTtcblx0XHRjb250cm9sbGVyLnJ1bldpdGhSZXN0b3JlKCgpID0+IHtcblx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmxlbmd0aCA9IDA7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZUVkaXRvcklucHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0ZpbGVzVGFiKCksIHRydWUsICd0aGUgZGVmYXVsdCB0YWJzIGFyZSBvcGVuZWQgZm9yIHRoZSBuZXcgc2Vzc2lvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gc2Vzc2lvbiBzd2l0Y2hdIHByZXNlcnZlcyBhIGRpc21pc3NlZCBGaWxlcyB0YWIgd2hpbGUgcmVwbGFjaW5nIENoYW5nZXMgaW4gcGxhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGNvbnN0IHNlc3Npb24xID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uMSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBmaWxlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSE7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YoZmlsZXNUYWIpLCAxKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvcjogZmlsZXNUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgaGFzRmlsZXNUYWI6IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbjIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MicpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb24yLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgaW5jb21pbmdDaGFuZ2VzUmVzb3VyY2UgPSBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2Uoc2Vzc2lvbjIucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzSW5jb21pbmdDaGFuZ2VzVGFiOiBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zb21lKGVkaXRvciA9PiBlZGl0b3IucmVzb3VyY2UgJiYgaXNFcXVhbChlZGl0b3IucmVzb3VyY2UsIGluY29taW5nQ2hhbmdlc1Jlc291cmNlKSksXG5cdFx0XHRoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSxcblx0XHRcdGVkaXRvckNvdW50OiBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0aGFzSW5jb21pbmdDaGFuZ2VzVGFiOiB0cnVlLFxuXHRcdFx0aGFzRmlsZXNUYWI6IGZhbHNlLFxuXHRcdFx0ZWRpdG9yQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBzZXNzaW9uIHN3aXRjaF0gcmVtb3ZlcyBhIGRpc21pc3NlZCBGaWxlcyB0YWIgcmVzdG9yZWQgYnkgYSBwcmV2aW91c2x5IHZpc2l0ZWQgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25BLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YicpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25CLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGNvbnN0IGZpbGVzVGFiID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlZGl0b3IgPT4gZWRpdG9yIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpITtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihmaWxlc1RhYiksIDEpO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiBmaWxlc1RhYiB9KTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLm9uQXBwbHlXb3JraW5nU2V0ID0gd29ya2luZ1NldCA9PiB7XG5cdFx0XHRpZiAod29ya2luZ1NldCA9PT0gJ2VtcHR5JyB8fCB3b3JraW5nU2V0Lm5hbWUgIT09IGBzZXNzaW9uLXdvcmtpbmctc2V0OiR7c2Vzc2lvbkEucmVzb3VyY2UudG9TdHJpbmcoKX1gKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goc3RvcmUuYWRkKGhhcm5lc3MuaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVtcHR5RmlsZUVkaXRvcklucHV0LCBzZXNzaW9uQS53b3Jrc3BhY2UuZ2V0KCkpKSk7XG5cdFx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0fTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25BLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3QgaW5jb21pbmdDaGFuZ2VzUmVzb3VyY2UgPSBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2Uoc2Vzc2lvbkEucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzSW5jb21pbmdDaGFuZ2VzVGFiOiBoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zb21lKGVkaXRvciA9PiBlZGl0b3IucmVzb3VyY2UgJiYgaXNFcXVhbChlZGl0b3IucmVzb3VyY2UsIGluY29taW5nQ2hhbmdlc1Jlc291cmNlKSksXG5cdFx0XHRoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSxcblx0XHR9LCB7XG5cdFx0XHRoYXNJbmNvbWluZ0NoYW5nZXNUYWI6IHRydWUsXG5cdFx0XHRoYXNGaWxlc1RhYjogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBzZXNzaW9uIHN3aXRjaF0ga2VlcHMgcmVzdG9yZWQgRmlsZXMgYWZ0ZXIgYSB0cmFuc2llbnRseSBlbXB0eSBncm91cCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246YScpKTtcblx0XHRoYXJuZXNzLmFjdGl2ZVNlc3Npb25PYnMuc2V0KHNlc3Npb25BLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOmInKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5sZW5ndGggPSAwO1xuXHRcdGhhcm5lc3MuYWN0aXZlRWRpdG9ySW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGhhcm5lc3Mub25BcHBseVdvcmtpbmdTZXQgPSB3b3JraW5nU2V0ID0+IHtcblx0XHRcdGlmICh3b3JraW5nU2V0ID09PSAnZW1wdHknIHx8IHdvcmtpbmdTZXQubmFtZSAhPT0gYHNlc3Npb24td29ya2luZy1zZXQ6JHtzZXNzaW9uQS5yZXNvdXJjZS50b1N0cmluZygpfWApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChzdG9yZS5hZGQoaGFybmVzcy5pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW1wdHlGaWxlRWRpdG9ySW5wdXQsIHNlc3Npb25BLndvcmtzcGFjZS5nZXQoKSkpKTtcblx0XHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHR9O1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbkEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBhZGQtdGFiXSBhIG1pc3NpbmcgQ2hhbmdlcyB0YWIgZmxpcHMgU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihVUkkucGFyc2UoJ3Nlc3Npb246MScpKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBjaGFuZ2VzVGFiID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+ICEoZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSAmJiBlLnJlc291cmNlICE9PSB1bmRlZmluZWQpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFybmVzcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dC5rZXkpLCBmYWxzZSk7XG5cblx0XHQvLyBTaW11bGF0ZSBhbiBpbnRlcm5hbCBsaWZlY3ljbGUgcmVtb3ZhbCBvZiB0aGUgbm9uLWNsb3NlYWJsZSBDaGFuZ2VzIHRhYi5cblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihjaGFuZ2VzVGFiKSwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGNoYW5nZXNUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksXG5cdFx0XHRjaGFuZ2VzVGFiQXZhaWxhYmxlOiBoYXJuZXNzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShTaW5nbGVQYW5lQ2hhbmdlc1RhYkF2YWlsYWJsZUNvbnRleHQua2V5KSxcblx0XHRcdGNoYW5nZXNUYWJNaXNzaW5nOiBoYXJuZXNzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShTaW5nbGVQYW5lQ2hhbmdlc1RhYk1pc3NpbmdDb250ZXh0LmtleSlcblx0XHR9LCB7IGhhc0NoYW5nZXNUYWI6IGZhbHNlLCBjaGFuZ2VzVGFiQXZhaWxhYmxlOiB0cnVlLCBjaGFuZ2VzVGFiTWlzc2luZzogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIGFkZC10YWJdIGEgbWlzc2luZyBGaWxlcyB0YWIgZmxpcHMgU2luZ2xlUGFuZUZpbGVzVGFiTWlzc2luZ0NvbnRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0Y29uc3QgZmlsZVRhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFybmVzcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoU2luZ2xlUGFuZUZpbGVzVGFiTWlzc2luZ0NvbnRleHQua2V5KSwgZmFsc2UpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgbGlmZWN5Y2xlIHJlbW92YWwgb2YgdGhlIG5vbi1jbG9zZWFibGUgRmlsZXMgdGFiLlxuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGZpbGVUYWIpLCAxKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvcjogZmlsZVRhYiB9KTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpLFxuXHRcdFx0ZmlsZXNUYWJBdmFpbGFibGU6IGhhcm5lc3MuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKFNpbmdsZVBhbmVGaWxlc1RhYkF2YWlsYWJsZUNvbnRleHQua2V5KSxcblx0XHRcdGZpbGVzVGFiTWlzc2luZzogaGFybmVzcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoU2luZ2xlUGFuZUZpbGVzVGFiTWlzc2luZ0NvbnRleHQua2V5KVxuXHRcdH0sIHsgaGFzRmlsZXNUYWI6IGZhbHNlLCBmaWxlc1RhYkF2YWlsYWJsZTogdHJ1ZSwgZmlsZXNUYWJNaXNzaW5nOiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gYWRkLXRhYl0gcmVvcGVuaW5nIHRoZSBDaGFuZ2VzIHRhYiBjbGVhcnMgdGhlIG1pc3NpbmcgY29udGV4dCBhbmQgaXMgcmV0YWluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBVUkkucGFyc2UoJ3Nlc3Npb246MScpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oc2Vzc2lvbiksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0Y29uc3QgY2hhbmdlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiAhKGUgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkgJiYgZS5yZXNvdXJjZSAhPT0gdW5kZWZpbmVkKSE7XG5cblx0XHQvLyBTaW11bGF0ZSBhbiBpbnRlcm5hbCBsaWZlY3ljbGUgcmVtb3ZhbCBvZiB0aGUgbm9uLWNsb3NlYWJsZSBDaGFuZ2VzIHRhYi5cblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZihjaGFuZ2VzVGFiKSwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGNoYW5nZXNUYWIgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXJuZXNzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZShTaW5nbGVQYW5lQ2hhbmdlc1RhYk1pc3NpbmdDb250ZXh0LmtleSksIHRydWUpO1xuXG5cdFx0Ly8gUmVvcGVuIGl0IChhcyB0aGUgYCtgIFwiQ2hhbmdlc1wiIGVudHJ5IGRvZXMpOiB0aGUgQ2hhbmdlcyBlZGl0b3IgcmVhcHBlYXJzLlxuXHRcdGNvbnN0IGNoYW5nZXNSZXNvdXJjZSA9IGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShzZXNzaW9uKTtcblx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5wdXNoKHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChjaGFuZ2VzUmVzb3VyY2UpKSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Ly8gVGhlIHJlLWFkZGVkIHRhYiBtYWtlcyB0aGUgZ3JvdXAgbm9uLWVtcHR5LCBzbyBhIGxhdGVyIHJvdXRpbmUgc3luY1xuXHRcdC8vIHJldGFpbnMgaXQgYW5kIHRoZSBtaXNzaW5nIGNvbnRleHQgc3RheXMgZmFsc2UuXG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLFxuXHRcdFx0Y2hhbmdlc1RhYk1pc3Npbmc6IGhhcm5lc3MuY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlKFNpbmdsZVBhbmVDaGFuZ2VzVGFiTWlzc2luZ0NvbnRleHQua2V5KVxuXHRcdH0sIHsgaGFzQ2hhbmdlc1RhYjogdHJ1ZSwgY2hhbmdlc1RhYk1pc3Npbmc6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gYWRkLXRhYl0gcmVvcGVuaW5nIG1hbmFnZWQgdGFicyBmcm9tIHRoZSBwbHVzIG1lbnUgYWRkcyB0aGVtIGF0IHRoZSBlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBVUkkucGFyc2UoJ3Nlc3Npb246MScpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oc2Vzc2lvbiksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzVGFiID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+ICEoZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSAmJiBlLnJlc291cmNlICE9PSB1bmRlZmluZWQpITtcblx0XHRjb25zdCBmaWxlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpITtcblx0XHRjb25zdCBleHRyYUVkaXRvciA9IHN0b3JlLmFkZChuZXcgVGVzdFN0dWJFZGl0b3JJbnB1dChVUkkuZmlsZSgnL3JlcG8vZXh0cmEudHMnKSkpO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnB1c2goZXh0cmFFZGl0b3IpO1xuXG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuc3BsaWNlKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmluZGV4T2YoY2hhbmdlc1RhYiksIDEpO1xuXHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiBjaGFuZ2VzVGFiIH0pO1xuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGZpbGVzVGFiKSwgMSk7XG5cdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IGZpbGVzVGFiIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGF3YWl0IG5ldyBOZXdDaGFuZ2VzVGFiQWN0aW9uKCkucnVuKGhhcm5lc3MuaW5zdGFTZXJ2aWNlKTtcblx0XHRhd2FpdCBuZXcgTmV3RmlsZVRhYkFjdGlvbigpLnJ1bihoYXJuZXNzLmluc3RhU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLm1hcChlZGl0b3IgPT4ge1xuXHRcdFx0aWYgKGVkaXRvciA9PT0gZXh0cmFFZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuICdleHRyYSc7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuICdmaWxlcyc7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWRpdG9yLnJlc291cmNlICYmIGlzRXF1YWwoZWRpdG9yLnJlc291cmNlLCBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2Uoc2Vzc2lvbikpKSB7XG5cdFx0XHRcdHJldHVybiAnY2hhbmdlcyc7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gJ290aGVyJztcblx0XHR9KSwgWydleHRyYScsICdjaGFuZ2VzJywgJ2ZpbGVzJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gc2Vzc2lvbiBzd2l0Y2hdIHJlcGxhY2VzIGEgc3RhbGUgQ2hhbmdlcyB0YWIgaW4gcGxhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdC8vIEEgc3RhbGUgQ2hhbmdlcyB0YWIgZm9yIGEgcHJldmlvdXMgc2Vzc2lvbiBpcyByZXN0b3JlZCBpbnRvIHRoZSBncm91cC5cblx0XHRjb25zdCBzdGFsZUNoYW5nZXNSZXNvdXJjZSA9IGhhcm5lc3Muc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShVUkkucGFyc2UoJ3Nlc3Npb246c3RhbGUnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoc3RhbGVDaGFuZ2VzUmVzb3VyY2UpKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOjEnKSk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc3RhbGVDbG9zZWQgPSBoYXJuZXNzLmNsb3NlZEVkaXRvcnMuc29tZShlID0+IGUucmVzb3VyY2UgJiYgaXNFcXVhbChlLnJlc291cmNlLCBzdGFsZUNoYW5nZXNSZXNvdXJjZSkpO1xuXHRcdGNvbnN0IGluY29taW5nQ2hhbmdlc1Jlc291cmNlID0gaGFybmVzcy5zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuZ2V0Q2hhbmdlc0VkaXRvclJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGluY29taW5nUHJlc2VudCA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNvbWUoZWRpdG9yID0+IGVkaXRvci5yZXNvdXJjZSAmJiBpc0VxdWFsKGVkaXRvci5yZXNvdXJjZSwgaW5jb21pbmdDaGFuZ2VzUmVzb3VyY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3RhbGVDbG9zZWQsIGluY29taW5nUHJlc2VudCwgZWRpdG9yQ291bnQ6IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmxlbmd0aCB9LCB7XG5cdFx0XHRzdGFsZUNsb3NlZDogZmFsc2UsXG5cdFx0XHRpbmNvbWluZ1ByZXNlbnQ6IHRydWUsXG5cdFx0XHRlZGl0b3JDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnW21hbmFnZWQgdGFicyAvIElzc3VlIDFdIHJlLWVuc3VyZXMgdGhlIEZpbGVzIHRhYiB3aGVuIHRoZSBzaWRlIHBhbmUgaXMgcmVvcGVuZWQgdmlhIHRoZSBhdXggYmFyIGFsb25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZVNpbmdsZVBhbmVDb250cm9sbGVyKHsgYWN0aXZhdGVBdXg6IHRydWUsIGluaXRpYWxQYXJ0VmlzaWJpbGl0eTogbmV3IE1hcChbW1BhcnRzLkVESVRPUl9QQVJULCBmYWxzZV0sIFtQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZV1dKSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oVVJJLnBhcnNlKCdzZXNzaW9uOm5ldycpLCB7IHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgaXNDcmVhdGVkOiBmYWxzZSB9KSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRjb25zdCBmaWxlVGFiID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+IGUgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCkhO1xuXHRcdGFzc2VydC5vayhmaWxlVGFiKTtcblxuXHRcdC8vIFNpbXVsYXRlIGxpZmVjeWNsZSByZW1vdmFsIG9mIEZpbGVzIGZvbGxvd2VkIGJ5IHRoZSBzaWRlIHBhbmUgaGlkaW5nLlxuXHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKGZpbGVUYWIpLCAxKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2xvc2VFZGl0b3IuZmlyZSh7IGVkaXRvcjogZmlsZVRhYiB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc0ZpbGVzVGFiKCksIGZhbHNlKTtcblxuXHRcdC8vIFJlb3BlbiB0aGUgc2lkZSBwYW5lIGJ5IHJldmVhbGluZyBPTkxZIHRoZSBhdXggYmFyIChlZGl0b3Igc3RheXMgaGlkZGVuKS5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdHJ1ZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXHRcdGhhcm5lc3Mub25EaWRSZXZlYWxTaWRlUGFuZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzRmlsZXNUYWIoKSwgdHJ1ZSwgJ3Jlb3BlbmluZyB2aWEgdGhlIGF1eCBiYXIgcmUtZW5zdXJlcyB0aGUgRmlsZXMgdGFiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1ttYW5hZ2VkIHRhYnMgLyBJc3N1ZSAyXSBvcGVuaW5nIGEgZmlsZSBhZnRlciB0aGUgc2lkZSBwYW5lIHdhcyBjbG9zZWQgZG9lcyBub3QgcmUtZm9yY2UgdGhlIG1hbmFnZWQgdGFicycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVTaW5nbGVQYW5lQ29udHJvbGxlcih7IGFjdGl2YXRlQXV4OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnc2Vzc2lvbjoxJyk7XG5cdFx0aGFybmVzcy5hY3RpdmVTZXNzaW9uT2JzLnNldChtYWtlU2Vzc2lvbihzZXNzaW9uKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgaGFzQ2hhbmdlc1RhYjogaGFzQ2hhbmdlc1RhYigpLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc0NoYW5nZXNUYWI6IHRydWUsIGhhc0ZpbGVzVGFiOiB0cnVlIH0pO1xuXG5cdFx0Ly8gU2ltdWxhdGUgbGlmZWN5Y2xlIGNsZWFudXAgcmVtb3ZpbmcgYm90aCBtYW5hZ2VkIHRhYnMgYW5kIGNsb3NpbmcgdGhlIHNpZGUgcGFuZS5cblx0XHRjb25zdCBjaGFuZ2VzVGFiID0gaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuZmluZChlID0+ICEoZSBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KSAmJiBlLnJlc291cmNlICE9PSB1bmRlZmluZWQpITtcblx0XHRjb25zdCBmaWxlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLmZpbmQoZSA9PiBlIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpITtcblx0XHRmb3IgKGNvbnN0IHRhYiBvZiBbY2hhbmdlc1RhYiwgZmlsZXNUYWJdKSB7XG5cdFx0XHRoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5zcGxpY2UoaGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMuaW5kZXhPZih0YWIpLCAxKTtcblx0XHRcdGhhcm5lc3Mub25EaWRDbG9zZUVkaXRvci5maXJlKHsgZWRpdG9yOiB0YWIgfSk7XG5cdFx0fVxuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNldChQYXJ0cy5FRElUT1JfUEFSVCwgZmFsc2UpO1xuXHRcdGhhcm5lc3Mub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eS5maXJlKHsgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSk7XG5cdFx0aGFybmVzcy5vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzVGFiOiBoYXNDaGFuZ2VzVGFiKCksIGhhc0ZpbGVzVGFiOiBoYXNGaWxlc1RhYigpIH0sIHsgaGFzQ2hhbmdlc1RhYjogZmFsc2UsIGhhc0ZpbGVzVGFiOiBmYWxzZSB9KTtcblxuXHRcdC8vIFRoZSB1c2VyIG9wZW5zIGEgZmlsZTogdGhlIHNpZGUgcGFuZSBvcGVucyAoZWRpdG9yIHBhcnQgcmV2ZWFsZWQpIGFuZCBhXG5cdFx0Ly8gcmVhbCBlZGl0b3IgaXMgYWRkZWQuIFByb2R1Y3Rpb24gZmlyZXMgb25EaWRSZXZlYWxTaWRlUGFuZSBvbiB0aGUgcmV2ZWFsLFxuXHRcdC8vIGJ1dCB0aGUgZmlsZSBpcyBhIHJlYWwgZWRpdG9yIHNvIHRoZSBtYW5hZ2VkIENoYW5nZXMvRmlsZXMgdGFicyBtdXN0IE5PVFxuXHRcdC8vIGJlIHJlLWZvcmNlZC5cblx0XHRjb25zdCBjaGFuZ2VzUmVzb3VyY2UgPSBoYXJuZXNzLnNlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2Uoc2Vzc2lvbik7XG5cdFx0aGFybmVzcy5hY3RpdmVHcm91cEVkaXRvcnMucHVzaChzdG9yZS5hZGQobmV3IFRlc3RTdHViRWRpdG9ySW5wdXQoVVJJLmZpbGUoJy9yZXBvL29wZW5lZC50cycpKSkpO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCB0cnVlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuRURJVE9SX1BBUlQsIHZpc2libGU6IHRydWUgfSk7XG5cdFx0aGFybmVzcy5vbkRpZFJldmVhbFNpZGVQYW5lLmZpcmUoKTtcblx0XHRoYXJuZXNzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLmZpcmUoKTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRjb25zdCBoYXNNYW5hZ2VkQ2hhbmdlc1RhYiA9IGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNvbWUoZSA9PiBlLnJlc291cmNlICYmIGlzRXF1YWwoZS5yZXNvdXJjZSwgY2hhbmdlc1Jlc291cmNlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc01hbmFnZWRDaGFuZ2VzVGFiLCBoYXNGaWxlc1RhYjogaGFzRmlsZXNUYWIoKSB9LCB7IGhhc01hbmFnZWRDaGFuZ2VzVGFiOiBmYWxzZSwgaGFzRmlsZXNUYWI6IGZhbHNlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbbWFuYWdlZCB0YWJzIC8gSXNzdWUgMl0gdG9nZ2xpbmcgdGhlIGVtcHR5IHNpZGUgcGFuZSBvcGVuIHJlLXBvcHVsYXRlcyB0aGUgZGVmYXVsdCBtYW5hZ2VkIHRhYnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlU2luZ2xlUGFuZUNvbnRyb2xsZXIoeyBhY3RpdmF0ZUF1eDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBVUkkucGFyc2UoJ3Nlc3Npb246MScpO1xuXHRcdGhhcm5lc3MuYWN0aXZlU2Vzc2lvbk9icy5zZXQobWFrZVNlc3Npb24oc2Vzc2lvbiksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHQvLyBTaW11bGF0ZSBsaWZlY3ljbGUgY2xlYW51cCByZW1vdmluZyBib3RoIG1hbmFnZWQgdGFicyBhbmQgY2xvc2luZyB0aGUgc2lkZSBwYW5lLlxuXHRcdGZvciAoY29uc3QgdGFiIG9mIFsuLi5oYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9yc10pIHtcblx0XHRcdGhhcm5lc3MuYWN0aXZlR3JvdXBFZGl0b3JzLnNwbGljZShoYXJuZXNzLmFjdGl2ZUdyb3VwRWRpdG9ycy5pbmRleE9mKHRhYiksIDEpO1xuXHRcdFx0aGFybmVzcy5vbkRpZENsb3NlRWRpdG9yLmZpcmUoeyBlZGl0b3I6IHRhYiB9KTtcblx0XHR9XG5cdFx0aGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zZXQoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIGZhbHNlKTtcblx0XHRoYXJuZXNzLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZmlyZSh7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0pO1xuXHRcdGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2V0KFBhcnRzLkVESVRPUl9QQVJULCBmYWxzZSk7XG5cdFx0aGFybmVzcy5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9KTtcblx0XHRoYXJuZXNzLm9uRGlkRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiBmYWxzZSwgaGFzRmlsZXNUYWI6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gVGhlIHVzZXIgcmVvcGVucyB0aGUgc2lkZSBwYW5lIHZpYSB0aGUgdG9nZ2xlIGFjdGlvbiB3aGlsZSB0aGUgZWRpdG9yXG5cdFx0Ly8gZ3JvdXAgaXMgZW1wdHk6IHRoZSBkZWZhdWx0IG1hbmFnZWQgdGFicyBtdXN0IGJlIHJlLXBvcHVsYXRlZC5cblx0XHRoYXJuZXNzLm9uRGlkUmV2ZWFsU2lkZVBhbmUuZmlyZSgpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhc0NoYW5nZXNUYWI6IGhhc0NoYW5nZXNUYWIoKSwgaGFzRmlsZXNUYWI6IGhhc0ZpbGVzVGFiKCkgfSwgeyBoYXNDaGFuZ2VzVGFiOiB0cnVlLCBoYXNGaWxlc1RhYjogdHJ1ZSB9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQThCLG1CQUFtQjtBQUNqRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsYUFBYSxvQkFBb0I7QUFDMUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxjQUFjLDJCQUEyQjtBQUNsRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBNkIscUJBQXFCO0FBQ2xELFNBQVMsc0NBQXNDLG9DQUFvQyx5QkFBeUIsb0NBQW9DLHdDQUF3QztBQUN4TCxTQUFTLGFBQWE7QUFDdEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBK0IsNkJBQTZCO0FBQzVELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNEJBQTRCLGlDQUFpQztBQUN0RSxTQUFTLDJCQUEyQix1QkFBdUI7QUFDM0QsT0FBTztBQUNQLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLG1CQUF1RCxZQUFZLGFBQWEsMkJBQTJCO0FBRXBILE1BQU0sOEJBQThCLE1BQU07QUFFekMsUUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLE1BQUk7QUFBQSxFQUVKLE1BQU0sNkJBQTZCLGlCQUFpQjtBQUFBLElBQXBEO0FBQUE7QUFDQyxXQUFTLGtCQUFnSCxDQUFDO0FBQUE7QUFBQSxJQUMxSCxJQUFJLHFCQUE4QjtBQUFFLGFBQU8sS0FBSztBQUFBLElBQW1CO0FBQUEsSUFD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
