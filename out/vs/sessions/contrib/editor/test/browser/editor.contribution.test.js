import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { editorBackground } from "../../../../../platform/theme/common/colorRegistry.js";
import { Extensions as ThemeServiceExtensions } from "../../../../../platform/theme/common/themeService.js";
import { EditorInputCapabilities } from "../../../../../workbench/common/editor.js";
import { EditorInput } from "../../../../../workbench/common/editor/editorInput.js";
import { TAB_ACTIVE_BACKGROUND } from "../../../../../workbench/common/theme.js";
import { IWorkbenchLayoutService, Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../../../../workbench/services/editor/common/editorGroupsService.js";
import { generateColorThemeCSS } from "../../../../../workbench/services/themes/browser/colorThemeCss.js";
import { ColorThemeData } from "../../../../../workbench/services/themes/common/colorThemeData.js";
import { TERMINAL_VIEW_ID } from "../../../../../workbench/contrib/terminal/common/terminal.js";
import { openNewSearchEditor } from "../../../../../workbench/contrib/searchEditor/browser/searchEditorActions.js";
import { IAgentWorkbenchLayoutService } from "../../../../browser/workbench.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionChangesService } from "../../../changes/browser/sessionChangesService.js";
import { NewChangesTabAction, NewFileTabAction, NewSearchTabAction } from "../../browser/addTabActions.js";
import { EmptyFileEditorInput, EmptyFileEditorSerializer } from "../../browser/emptyFileEditorInput.js";
import { EditorTabsVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from "../../../../../workbench/common/contextkeys.js";
import { TestEnvironmentService } from "../../../../../workbench/test/browser/workbenchTestServices.js";
import { IsQuickChatSessionContext, SessionIsCreatedContext, SinglePaneChangesTabAvailableContext, SinglePaneChangesTabMissingContext, SinglePaneFilesTabAvailableContext, SinglePaneFilesTabMissingContext } from "../../../../common/contextkeys.js";
import "../../browser/editor.contribution.js";
suite("Sessions - Editor Contribution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("registers legacy Modern UI tab color customizations", () => {
    const theme = ColorThemeData.createUnloadedTheme("vs-dark", { [editorBackground]: "#000000" });
    theme.setCustomColors({ [TAB_ACTIVE_BACKGROUND]: "#123456" });
    const themingRegistry = Registry.as(ThemeServiceExtensions.ThemingContribution);
    const css = generateColorThemeCSS(theme, ".sessions-tab-customization-theme", themingRegistry.getThemingParticipants(), TestEnvironmentService).code;
    assert.strictEqual(css.includes("--modern-ui-editor-tab-active-background: #123456;"), true);
  });
  function stubEditorGroupCount(instantiationService, count) {
    instantiationService.stub(IEditorGroupsService, new class extends mock() {
      get mainPart() {
        return { activeGroup: { count } };
      }
    }());
  }
  function stubEditorVisibility(instantiationService, visible) {
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangePartVisibility = Event.None;
      }
      isVisible(part) {
        return part === Parts.EDITOR_PART && visible;
      }
    }();
    instantiationService.stub(IWorkbenchLayoutService, layoutService);
    return layoutService;
  }
  function createWorkspace(...workingDirectories) {
    return {
      uri: URI.file("/repo/workspace.code-workspace"),
      label: "workspace",
      icon: Codicon.rootFolder,
      folders: workingDirectories.map((workingDirectory) => ({
        root: workingDirectory,
        workingDirectory,
        name: workingDirectory.path,
        description: void 0
      })),
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    };
  }
  test("new file tab action opens pinned empty file editor", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const opened = [];
    const workspaceFolder = URI.file("/repo/worktree");
    const workspace = createWorkspace(workspaceFolder);
    stubEditorGroupCount(instantiationService, 7);
    stubEditorVisibility(instantiationService, true);
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable({
          workspace: constObservable(workspace)
        });
      }
    }());
    instantiationService.set(IEditorService, new class extends mock() {
      async openEditor(...args) {
        const editor = args[0];
        if (editor instanceof EditorInput) {
          opened.push({ editor: store.add(editor), options: args[1] });
        }
        return void 0;
      }
    }());
    await new NewFileTabAction().run(instantiationService);
    assert.deepStrictEqual(opened.map(({ editor, options }) => ({
      isEmptyFileEditor: editor instanceof EmptyFileEditorInput,
      resource: editor.resource?.toString(),
      pinned: options?.pinned,
      index: options?.index
    })), [{ isEmptyFileEditor: true, resource: workspaceFolder.toString(), pinned: true, index: 7 }]);
  });
  test("Add Tab menu stays available in dock-only mode", () => {
    const getWhen = (action) => {
      const menu = action.desc.menu;
      const item = Array.isArray(menu) ? menu[0] : menu;
      assert.ok(item?.when);
      return item.when;
    };
    const evaluate = (expression, values) => expression.evaluate({
      getValue: (key) => values[key]
    });
    const baseContext = {
      [IsSessionsWindowContext.key]: true,
      [IsAuxiliaryWindowContext.key]: false,
      [IsTopRightEditorGroupContext.key]: true,
      [SessionIsCreatedContext.key]: true
    };
    const scenarios = (availableKey, missingKey) => {
      const when = availableKey === SinglePaneFilesTabAvailableContext.key ? getWhen(new NewFileTabAction()) : getWhen(new NewChangesTabAction());
      return {
        singleTabAlreadyOpen: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: false, [availableKey]: true, [missingKey]: false }),
        multipleTabsAlreadyOpen: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: true, [availableKey]: true, [missingKey]: false }),
        multipleTabsMissing: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: true, [availableKey]: true, [missingKey]: true }),
        dockOnlyMissing: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: true, [availableKey]: true, [missingKey]: true }),
        unsupported: evaluate(when, { ...baseContext, [EditorTabsVisibleContext.key]: false, [availableKey]: false, [missingKey]: true })
      };
    };
    assert.deepStrictEqual({
      files: scenarios(SinglePaneFilesTabAvailableContext.key, SinglePaneFilesTabMissingContext.key),
      changes: scenarios(SinglePaneChangesTabAvailableContext.key, SinglePaneChangesTabMissingContext.key),
      searchInDockOnly: evaluate(getWhen(new NewSearchTabAction()), baseContext),
      searchInQuickChat: evaluate(getWhen(new NewSearchTabAction()), { ...baseContext, [IsQuickChatSessionContext.key]: true })
    }, {
      files: { singleTabAlreadyOpen: true, multipleTabsAlreadyOpen: false, multipleTabsMissing: true, dockOnlyMissing: true, unsupported: false },
      changes: { singleTabAlreadyOpen: true, multipleTabsAlreadyOpen: false, multipleTabsMissing: true, dockOnlyMissing: true, unsupported: false },
      searchInDockOnly: true,
      searchInQuickChat: false
    });
  });
  test("new changes tab action requires a created session with Changes available", () => {
    const action = new NewChangesTabAction();
    const precondition = action.desc.precondition?.serialize() ?? "";
    const keybinding = Array.isArray(action.desc.keybinding) ? action.desc.keybinding[0] : action.desc.keybinding;
    const when = keybinding?.when?.serialize() ?? "";
    assert.deepStrictEqual({
      preconditionHasCreated: precondition.includes(SessionIsCreatedContext.key),
      preconditionHasAvailability: precondition.includes(SinglePaneChangesTabAvailableContext.key),
      keybindingHasCreated: when.includes(SessionIsCreatedContext.key),
      keybindingHasAvailability: when.includes(SinglePaneChangesTabAvailableContext.key)
    }, {
      preconditionHasCreated: true,
      preconditionHasAvailability: true,
      keybindingHasCreated: true,
      keybindingHasAvailability: true
    });
  });
  test("new search tab action is unavailable for Quick Chats", () => {
    const action = new NewSearchTabAction();
    const keybinding = Array.isArray(action.desc.keybinding) ? action.desc.keybinding[0] : action.desc.keybinding;
    const evaluate = (expression, isQuickChat) => {
      const values = {
        [IsSessionsWindowContext.key]: true,
        [IsAuxiliaryWindowContext.key]: false,
        [IsQuickChatSessionContext.key]: isQuickChat
      };
      return expression?.evaluate({
        getValue: (key) => values[key]
      }) ?? false;
    };
    assert.deepStrictEqual({
      preconditionInQuickChat: evaluate(action.desc.precondition, true),
      keybindingInQuickChat: evaluate(keybinding?.when, true),
      preconditionInWorkspaceSession: evaluate(action.desc.precondition, false),
      keybindingInWorkspaceSession: evaluate(keybinding?.when, false)
    }, {
      preconditionInQuickChat: false,
      keybindingInQuickChat: false,
      preconditionInWorkspaceSession: true,
      keybindingInWorkspaceSession: true
    });
  });
  test("empty file editor updates its workspace", () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = stubEditorVisibility(instantiationService, true);
    const input = store.add(new EmptyFileEditorInput(createWorkspace(URI.file("/repo/first")), layoutService));
    const other = store.add(new EmptyFileEditorInput(void 0, layoutService));
    input.setWorkspace(createWorkspace(URI.file("/repo/other")));
    assert.deepStrictEqual({
      resource: input.resource?.toString(),
      matchesAnotherEmptyInput: input.matches(other)
    }, {
      resource: URI.file("/repo/other").toString(),
      matchesAnotherEmptyInput: true
    });
  });
  test("empty file editor updates managed Files capabilities with editor area visibility", () => {
    let editorVisible = false;
    const onDidChangePartVisibility = store.add(new Emitter());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangePartVisibility = onDidChangePartVisibility.event;
      }
      isVisible(part) {
        return part === Parts.EDITOR_PART && editorVisible;
      }
    }();
    const input = store.add(new EmptyFileEditorInput(void 0, layoutService));
    let capabilitiesChanges = 0;
    store.add(input.onDidChangeCapabilities(() => capabilitiesChanges++));
    const hiddenCapabilities = input.capabilities;
    editorVisible = true;
    onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    assert.deepStrictEqual({
      hiddenCapabilities,
      visibleCapabilities: input.capabilities,
      capabilitiesChanges
    }, {
      hiddenCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit | EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal | EditorInputCapabilities.CannotClose,
      visibleCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit | EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal,
      capabilitiesChanges: 1
    });
  });
  test("empty file editor exposes its breadcrumb resource only while the editor area is visible", () => {
    let editorVisible = false;
    const onDidChangePartVisibility = store.add(new Emitter());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangePartVisibility = onDidChangePartVisibility.event;
      }
      isVisible(part) {
        return part === Parts.EDITOR_PART && editorVisible;
      }
    }();
    const input = store.add(new EmptyFileEditorInput(createWorkspace(URI.file("/repo/worktree")), layoutService));
    let labelChanges = 0;
    store.add(input.onDidChangeLabel(() => labelChanges++));
    const hiddenResource = input.resource;
    editorVisible = true;
    onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });
    assert.deepStrictEqual({
      hiddenResource,
      visibleResource: input.resource?.toString(),
      labelChanges
    }, {
      hiddenResource: void 0,
      visibleResource: URI.file("/repo/worktree").toString(),
      labelChanges: 1
    });
  });
  test("empty file editor serializer preserves the workspace folders", () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = stubEditorVisibility(instantiationService, false);
    const serializer = new EmptyFileEditorSerializer();
    const input = store.add(new EmptyFileEditorInput(createWorkspace(URI.file("/repo/first"), URI.file("/repo/second")), layoutService));
    const restored = serializer.deserialize(instantiationService, serializer.serialize(input) ?? "");
    if (restored) {
      store.add(restored);
    }
    assert.deepStrictEqual(
      restored?.workspace?.folders.map((folder) => folder.workingDirectory.toString()),
      input.workspace?.folders.map((folder) => folder.workingDirectory.toString())
    );
  });
  test("new search tab action opens a new search editor", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const invoked = [];
    instantiationService.stub(IInstantiationService, new class extends mock() {
      invokeFunction(fn, ..._args) {
        invoked.push(fn);
        return void 0;
      }
    }());
    await new NewSearchTabAction().run(instantiationService);
    assert.deepStrictEqual(invoked, [openNewSearchEditor]);
  });
  test("new changes tab action opens the changes editor for the active session", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const resource = URI.parse("session:1");
    stubEditorGroupCount(instantiationService, 5);
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable({ resource, isCreated: constObservable(true) });
      }
    }());
    const opened = [];
    instantiationService.stub(ISessionChangesService, new class extends mock() {
      async openChangesEditor(sessionResource, options) {
        opened.push({ resource: sessionResource, index: options?.index });
        return void 0;
      }
    }());
    await new NewChangesTabAction().run(instantiationService);
    assert.deepStrictEqual(opened, [{ resource, index: 5 }]);
  });
  test("new changes tab action is a no-op for an uncreated session", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    stubEditorGroupCount(instantiationService, 0);
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable({ resource: URI.parse("session:new"), isCreated: constObservable(false) });
      }
    }());
    let opened = false;
    instantiationService.stub(ISessionChangesService, new class extends mock() {
      async openChangesEditor() {
        opened = true;
        return void 0;
      }
    }());
    await new NewChangesTabAction().run(instantiationService);
    assert.strictEqual(opened, false);
  });
  test("new changes tab action is a no-op when there is no active session", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    stubEditorGroupCount(instantiationService, 0);
    instantiationService.stub(ISessionsService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = constObservable(void 0);
      }
    }());
    let opened = false;
    instantiationService.stub(ISessionChangesService, new class extends mock() {
      async openChangesEditor() {
        opened = true;
        return void 0;
      }
    }());
    await new NewChangesTabAction().run(instantiationService);
    assert.strictEqual(opened, false);
  });
  test("maximize editor hides the terminal panel before maximizing", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.calls = [];
        this.hiddenParts = [];
        this.editorMaximized = false;
        this.panelVisible = true;
      }
      isVisible(part) {
        return part === Parts.PANEL_PART ? this.panelVisible : false;
      }
      setPartHidden(hidden, part) {
        if (part === Parts.PANEL_PART) {
          this.panelVisible = !hidden;
        }
        if (hidden && part === Parts.PANEL_PART) {
          this.calls.push("hidePanel");
          this.hiddenParts.push(part);
        }
      }
      setEditorMaximized(maximized) {
        this.calls.push(maximized ? "maximizeEditor" : "restoreEditor");
        this.editorMaximized = maximized;
      }
    }();
    instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
    instantiationService.set(IViewsService, new class extends mock() {
      isViewVisible(id) {
        return id === TERMINAL_VIEW_ID;
      }
    }());
    const handler = CommandsRegistry.getCommand("workbench.action.agentSessions.maximizeMainEditorPart")?.handler;
    assert.ok(handler, "Command handler should be registered");
    await handler(instantiationService);
    assert.deepStrictEqual(layoutService.calls, ["hidePanel", "maximizeEditor"]);
    assert.deepStrictEqual(layoutService.hiddenParts, [Parts.PANEL_PART]);
    assert.strictEqual(layoutService.editorMaximized, true);
  });
  test("maximize editor keeps non-terminal panels visible", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.hiddenParts = [];
        this.editorMaximized = false;
        this.panelVisible = true;
      }
      isVisible(part) {
        return part === Parts.PANEL_PART ? this.panelVisible : false;
      }
      setPartHidden(hidden, part) {
        if (part === Parts.PANEL_PART) {
          this.panelVisible = !hidden;
        }
        if (hidden && part === Parts.PANEL_PART) {
          this.hiddenParts.push(part);
        }
      }
      setEditorMaximized(maximized) {
        this.editorMaximized = maximized;
      }
    }();
    instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
    instantiationService.set(IViewsService, new class extends mock() {
      isViewVisible(_id) {
        return false;
      }
    }());
    const handler = CommandsRegistry.getCommand("workbench.action.agentSessions.maximizeMainEditorPart")?.handler;
    assert.ok(handler, "Command handler should be registered");
    await handler(instantiationService);
    assert.deepStrictEqual(layoutService.hiddenParts, []);
    assert.strictEqual(layoutService.editorMaximized, true);
  });
  test("restore editor reopens the terminal panel when maximize hid it", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.hiddenParts = [];
        this.shownParts = [];
        this.maximizedStates = [];
        this.panelVisible = true;
      }
      isVisible(part) {
        return part === Parts.PANEL_PART ? this.panelVisible : false;
      }
      setPartHidden(hidden, part) {
        if (part === Parts.PANEL_PART) {
          this.panelVisible = !hidden;
          if (hidden) {
            this.hiddenParts.push(part);
          } else {
            this.shownParts.push(part);
          }
        }
      }
      setEditorMaximized(maximized) {
        this.maximizedStates.push(maximized);
      }
    }();
    instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
    instantiationService.set(IViewsService, new class extends mock() {
      isViewVisible(id) {
        return id === TERMINAL_VIEW_ID;
      }
    }());
    const maximizeHandler = CommandsRegistry.getCommand("workbench.action.agentSessions.maximizeMainEditorPart")?.handler;
    const restoreHandler = CommandsRegistry.getCommand("workbench.action.agentSessions.restoreMainEditorPart")?.handler;
    assert.ok(maximizeHandler, "Maximize command handler should be registered");
    assert.ok(restoreHandler, "Restore command handler should be registered");
    await maximizeHandler(instantiationService);
    await restoreHandler(instantiationService);
    assert.deepStrictEqual(layoutService.hiddenParts, [Parts.PANEL_PART]);
    assert.deepStrictEqual(layoutService.shownParts, [Parts.PANEL_PART]);
    assert.deepStrictEqual(layoutService.maximizedStates, [true, false]);
    assert.strictEqual(layoutService.panelVisible, true);
  });
  test("restore editor does not reopen the panel when maximize left it visible", async () => {
    const instantiationService = store.add(new TestInstantiationService());
    const layoutService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.shownParts = [];
        this.maximizedStates = [];
        this.panelVisible = true;
      }
      isVisible(part) {
        return part === Parts.PANEL_PART ? this.panelVisible : false;
      }
      setPartHidden(hidden, part) {
        if (part === Parts.PANEL_PART) {
          this.panelVisible = !hidden;
          if (!hidden) {
            this.shownParts.push(part);
          }
        }
      }
      setEditorMaximized(maximized) {
        this.maximizedStates.push(maximized);
      }
    }();
    instantiationService.set(IAgentWorkbenchLayoutService, layoutService);
    instantiationService.set(IViewsService, new class extends mock() {
      isViewVisible(_id) {
        return false;
      }
    }());
    const maximizeHandler = CommandsRegistry.getCommand("workbench.action.agentSessions.maximizeMainEditorPart")?.handler;
    const restoreHandler = CommandsRegistry.getCommand("workbench.action.agentSessions.restoreMainEditorPart")?.handler;
    assert.ok(maximizeHandler, "Maximize command handler should be registered");
    assert.ok(restoreHandler, "Restore command handler should be registered");
    await maximizeHandler(instantiationService);
    await restoreHandler(instantiationService);
    assert.deepStrictEqual(layoutService.shownParts, []);
    assert.deepStrictEqual(layoutService.maximizedStates, [true, false]);
    assert.strictEqual(layoutService.panelVisible, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZWRpdG9yXFx0ZXN0XFxicm93c2VyXFxlZGl0b3IuY29udHJpYnV0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwcmVzc2lvbiwgQ29udGV4dEtleVZhbHVlLCBJQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFRoZW1lU2VydmljZUV4dGVuc2lvbnMsIElUaGVtaW5nUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBUQUJfQUNUSVZFX0JBQ0tHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElQYXJ0VmlzaWJpbGl0eUNoYW5nZUV2ZW50LCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlQ29sb3JUaGVtZUNTUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvYnJvd3Nlci9jb2xvclRoZW1lQ3NzLmpzJztcbmltcG9ydCB7IENvbG9yVGhlbWVEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vY29sb3JUaGVtZURhdGEuanMnO1xuaW1wb3J0IHsgVEVSTUlOQUxfVklFV19JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBvcGVuTmV3U2VhcmNoRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvc2VhcmNoRWRpdG9yL2Jyb3dzZXIvc2VhcmNoRWRpdG9yQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93b3JrYmVuY2guanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Xb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGFuZ2VzL2Jyb3dzZXIvc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5ld0NoYW5nZXNUYWJBY3Rpb24sIE5ld0ZpbGVUYWJBY3Rpb24sIE5ld1NlYXJjaFRhYkFjdGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWRkVGFiQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbXB0eUZpbGVFZGl0b3JJbnB1dCwgRW1wdHlGaWxlRWRpdG9yU2VyaWFsaXplciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZW1wdHlGaWxlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yVGFic1Zpc2libGVDb250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBJc1RvcFJpZ2h0RWRpdG9yR3JvdXBDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSXNRdWlja0NoYXRTZXNzaW9uQ29udGV4dCwgU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIFNpbmdsZVBhbmVDaGFuZ2VzVGFiQXZhaWxhYmxlQ29udGV4dCwgU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dCwgU2luZ2xlUGFuZUZpbGVzVGFiQXZhaWxhYmxlQ29udGV4dCwgU2luZ2xlUGFuZUZpbGVzVGFiTWlzc2luZ0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG4vLyBJbXBvcnQgZWRpdG9yIGNvbnRyaWJ1dGlvbiB0byB0cmlnZ2VyIGFjdGlvbiByZWdpc3RyYXRpb24uXG5pbXBvcnQgJy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmNvbnRyaWJ1dGlvbi5qcyc7XG5cbnN1aXRlKCdTZXNzaW9ucyAtIEVkaXRvciBDb250cmlidXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVnaXN0ZXJzIGxlZ2FjeSBNb2Rlcm4gVUkgdGFiIGNvbG9yIGN1c3RvbWl6YXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRoZW1lID0gQ29sb3JUaGVtZURhdGEuY3JlYXRlVW5sb2FkZWRUaGVtZSgndnMtZGFyaycsIHsgW2VkaXRvckJhY2tncm91bmRdOiAnIzAwMDAwMCcgfSk7XG5cdFx0dGhlbWUuc2V0Q3VzdG9tQ29sb3JzKHsgW1RBQl9BQ1RJVkVfQkFDS0dST1VORF06ICcjMTIzNDU2JyB9KTtcblx0XHRjb25zdCB0aGVtaW5nUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVGhlbWluZ1JlZ2lzdHJ5PihUaGVtZVNlcnZpY2VFeHRlbnNpb25zLlRoZW1pbmdDb250cmlidXRpb24pO1xuXHRcdGNvbnN0IGNzcyA9IGdlbmVyYXRlQ29sb3JUaGVtZUNTUyh0aGVtZSwgJy5zZXNzaW9ucy10YWItY3VzdG9taXphdGlvbi10aGVtZScsIHRoZW1pbmdSZWdpc3RyeS5nZXRUaGVtaW5nUGFydGljaXBhbnRzKCksIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UpLmNvZGU7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3NzLmluY2x1ZGVzKCctLW1vZGVybi11aS1lZGl0b3ItdGFiLWFjdGl2ZS1iYWNrZ3JvdW5kOiAjMTIzNDU2OycpLCB0cnVlKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gc3R1YkVkaXRvckdyb3VwQ291bnQoaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSwgY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvckdyb3Vwc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvckdyb3Vwc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0IG1haW5QYXJ0KCk6IElFZGl0b3JHcm91cHNTZXJ2aWNlWydtYWluUGFydCddIHtcblx0XHRcdFx0cmV0dXJuIHsgYWN0aXZlR3JvdXA6IHsgY291bnQgfSBhcyBJRWRpdG9yR3JvdXAgfSBhcyBJRWRpdG9yR3JvdXBzU2VydmljZVsnbWFpblBhcnQnXTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHN0dWJFZGl0b3JWaXNpYmlsaXR5KGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsIHZpc2libGU6IGJvb2xlYW4pOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSBpc1Zpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIHZpc2libGU7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlKTtcblx0XHRyZXR1cm4gbGF5b3V0U2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdvcmtzcGFjZSguLi53b3JraW5nRGlyZWN0b3JpZXM6IFVSSVtdKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvcmVwby93b3Jrc3BhY2UuY29kZS13b3Jrc3BhY2UnKSxcblx0XHRcdGxhYmVsOiAnd29ya3NwYWNlJyxcblx0XHRcdGljb246IENvZGljb24ucm9vdEZvbGRlcixcblx0XHRcdGZvbGRlcnM6IHdvcmtpbmdEaXJlY3Rvcmllcy5tYXAod29ya2luZ0RpcmVjdG9yeSA9PiAoe1xuXHRcdFx0XHRyb290OiB3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRuYW1lOiB3b3JraW5nRGlyZWN0b3J5LnBhdGgsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9KSksXG5cdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ25ldyBmaWxlIHRhYiBhY3Rpb24gb3BlbnMgcGlubmVkIGVtcHR5IGZpbGUgZWRpdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgb3BlbmVkOiB7IGVkaXRvcjogRWRpdG9ySW5wdXQ7IG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IFVSSS5maWxlKCcvcmVwby93b3JrdHJlZScpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGNyZWF0ZVdvcmtzcGFjZSh3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdHN0dWJFZGl0b3JHcm91cENvdW50KGluc3RhbnRpYXRpb25TZXJ2aWNlLCA3KTtcblx0XHRzdHViRWRpdG9yVmlzaWJpbGl0eShpbnN0YW50aWF0aW9uU2VydmljZSwgdHJ1ZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbiA9IGNvbnN0T2JzZXJ2YWJsZSh7XG5cdFx0XHRcdHdvcmtzcGFjZTogY29uc3RPYnNlcnZhYmxlKHdvcmtzcGFjZSlcblx0XHRcdH0gYXMgSUFjdGl2ZVNlc3Npb24pO1xuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5FZGl0b3IoLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXJnc1swXTtcblx0XHRcdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0b3BlbmVkLnB1c2goeyBlZGl0b3I6IHN0b3JlLmFkZChlZGl0b3IpLCBvcHRpb25zOiBhcmdzWzFdIGFzIElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBuZXcgTmV3RmlsZVRhYkFjdGlvbigpLnJ1bihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZW5lZC5tYXAoKHsgZWRpdG9yLCBvcHRpb25zIH0pID0+ICh7XG5cdFx0XHRpc0VtcHR5RmlsZUVkaXRvcjogZWRpdG9yIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQsXG5cdFx0XHRyZXNvdXJjZTogZWRpdG9yLnJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0cGlubmVkOiBvcHRpb25zPy5waW5uZWQsXG5cdFx0XHRpbmRleDogb3B0aW9ucz8uaW5kZXhcblx0XHR9KSksIFt7IGlzRW1wdHlGaWxlRWRpdG9yOiB0cnVlLCByZXNvdXJjZTogd29ya3NwYWNlRm9sZGVyLnRvU3RyaW5nKCksIHBpbm5lZDogdHJ1ZSwgaW5kZXg6IDcgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBZGQgVGFiIG1lbnUgc3RheXMgYXZhaWxhYmxlIGluIGRvY2stb25seSBtb2RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGdldFdoZW4gPSAoYWN0aW9uOiBOZXdGaWxlVGFiQWN0aW9uIHwgTmV3Q2hhbmdlc1RhYkFjdGlvbiB8IE5ld1NlYXJjaFRhYkFjdGlvbik6IENvbnRleHRLZXlFeHByZXNzaW9uID0+IHtcblx0XHRcdGNvbnN0IG1lbnUgPSBhY3Rpb24uZGVzYy5tZW51O1xuXHRcdFx0Y29uc3QgaXRlbSA9IEFycmF5LmlzQXJyYXkobWVudSkgPyBtZW51WzBdIDogbWVudTtcblx0XHRcdGFzc2VydC5vayhpdGVtPy53aGVuKTtcblx0XHRcdHJldHVybiBpdGVtLndoZW47XG5cdFx0fTtcblx0XHRjb25zdCBldmFsdWF0ZSA9IChleHByZXNzaW9uOiBDb250ZXh0S2V5RXhwcmVzc2lvbiwgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBDb250ZXh0S2V5VmFsdWU+KTogYm9vbGVhbiA9PiBleHByZXNzaW9uLmV2YWx1YXRlKHtcblx0XHRcdGdldFZhbHVlOiA8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4oa2V5OiBzdHJpbmcpID0+IHZhbHVlc1trZXldIGFzIFQgfCB1bmRlZmluZWRcblx0XHR9IHNhdGlzZmllcyBJQ29udGV4dCk7XG5cdFx0Y29uc3QgYmFzZUNvbnRleHQ6IFJlY29yZDxzdHJpbmcsIENvbnRleHRLZXlWYWx1ZT4gPSB7XG5cdFx0XHRbSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQua2V5XTogdHJ1ZSxcblx0XHRcdFtJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQua2V5XTogZmFsc2UsXG5cdFx0XHRbSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dC5rZXldOiB0cnVlLFxuXHRcdFx0W1Nlc3Npb25Jc0NyZWF0ZWRDb250ZXh0LmtleV06IHRydWUsXG5cdFx0fTtcblx0XHRjb25zdCBzY2VuYXJpb3MgPSAoYXZhaWxhYmxlS2V5OiBzdHJpbmcsIG1pc3NpbmdLZXk6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3Qgd2hlbiA9IGF2YWlsYWJsZUtleSA9PT0gU2luZ2xlUGFuZUZpbGVzVGFiQXZhaWxhYmxlQ29udGV4dC5rZXlcblx0XHRcdFx0PyBnZXRXaGVuKG5ldyBOZXdGaWxlVGFiQWN0aW9uKCkpXG5cdFx0XHRcdDogZ2V0V2hlbihuZXcgTmV3Q2hhbmdlc1RhYkFjdGlvbigpKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNpbmdsZVRhYkFscmVhZHlPcGVuOiBldmFsdWF0ZSh3aGVuLCB7IC4uLmJhc2VDb250ZXh0LCBbRWRpdG9yVGFic1Zpc2libGVDb250ZXh0LmtleV06IGZhbHNlLCBbYXZhaWxhYmxlS2V5XTogdHJ1ZSwgW21pc3NpbmdLZXldOiBmYWxzZSB9KSxcblx0XHRcdFx0bXVsdGlwbGVUYWJzQWxyZWFkeU9wZW46IGV2YWx1YXRlKHdoZW4sIHsgLi4uYmFzZUNvbnRleHQsIFtFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQua2V5XTogdHJ1ZSwgW2F2YWlsYWJsZUtleV06IHRydWUsIFttaXNzaW5nS2V5XTogZmFsc2UgfSksXG5cdFx0XHRcdG11bHRpcGxlVGFic01pc3Npbmc6IGV2YWx1YXRlKHdoZW4sIHsgLi4uYmFzZUNvbnRleHQsIFtFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQua2V5XTogdHJ1ZSwgW2F2YWlsYWJsZUtleV06IHRydWUsIFttaXNzaW5nS2V5XTogdHJ1ZSB9KSxcblx0XHRcdFx0ZG9ja09ubHlNaXNzaW5nOiBldmFsdWF0ZSh3aGVuLCB7IC4uLmJhc2VDb250ZXh0LCBbRWRpdG9yVGFic1Zpc2libGVDb250ZXh0LmtleV06IHRydWUsIFthdmFpbGFibGVLZXldOiB0cnVlLCBbbWlzc2luZ0tleV06IHRydWUgfSksXG5cdFx0XHRcdHVuc3VwcG9ydGVkOiBldmFsdWF0ZSh3aGVuLCB7IC4uLmJhc2VDb250ZXh0LCBbRWRpdG9yVGFic1Zpc2libGVDb250ZXh0LmtleV06IGZhbHNlLCBbYXZhaWxhYmxlS2V5XTogZmFsc2UsIFttaXNzaW5nS2V5XTogdHJ1ZSB9KSxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZmlsZXM6IHNjZW5hcmlvcyhTaW5nbGVQYW5lRmlsZXNUYWJBdmFpbGFibGVDb250ZXh0LmtleSwgU2luZ2xlUGFuZUZpbGVzVGFiTWlzc2luZ0NvbnRleHQua2V5KSxcblx0XHRcdGNoYW5nZXM6IHNjZW5hcmlvcyhTaW5nbGVQYW5lQ2hhbmdlc1RhYkF2YWlsYWJsZUNvbnRleHQua2V5LCBTaW5nbGVQYW5lQ2hhbmdlc1RhYk1pc3NpbmdDb250ZXh0LmtleSksXG5cdFx0XHRzZWFyY2hJbkRvY2tPbmx5OiBldmFsdWF0ZShnZXRXaGVuKG5ldyBOZXdTZWFyY2hUYWJBY3Rpb24oKSksIGJhc2VDb250ZXh0KSxcblx0XHRcdHNlYXJjaEluUXVpY2tDaGF0OiBldmFsdWF0ZShnZXRXaGVuKG5ldyBOZXdTZWFyY2hUYWJBY3Rpb24oKSksIHsgLi4uYmFzZUNvbnRleHQsIFtJc1F1aWNrQ2hhdFNlc3Npb25Db250ZXh0LmtleV06IHRydWUgfSksXG5cdFx0fSwge1xuXHRcdFx0ZmlsZXM6IHsgc2luZ2xlVGFiQWxyZWFkeU9wZW46IHRydWUsIG11bHRpcGxlVGFic0FscmVhZHlPcGVuOiBmYWxzZSwgbXVsdGlwbGVUYWJzTWlzc2luZzogdHJ1ZSwgZG9ja09ubHlNaXNzaW5nOiB0cnVlLCB1bnN1cHBvcnRlZDogZmFsc2UgfSxcblx0XHRcdGNoYW5nZXM6IHsgc2luZ2xlVGFiQWxyZWFkeU9wZW46IHRydWUsIG11bHRpcGxlVGFic0FscmVhZHlPcGVuOiBmYWxzZSwgbXVsdGlwbGVUYWJzTWlzc2luZzogdHJ1ZSwgZG9ja09ubHlNaXNzaW5nOiB0cnVlLCB1bnN1cHBvcnRlZDogZmFsc2UgfSxcblx0XHRcdHNlYXJjaEluRG9ja09ubHk6IHRydWUsXG5cdFx0XHRzZWFyY2hJblF1aWNrQ2hhdDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBjaGFuZ2VzIHRhYiBhY3Rpb24gcmVxdWlyZXMgYSBjcmVhdGVkIHNlc3Npb24gd2l0aCBDaGFuZ2VzIGF2YWlsYWJsZScsICgpID0+IHtcblx0XHRjb25zdCBhY3Rpb24gPSBuZXcgTmV3Q2hhbmdlc1RhYkFjdGlvbigpO1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IGFjdGlvbi5kZXNjLnByZWNvbmRpdGlvbj8uc2VyaWFsaXplKCkgPz8gJyc7XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IEFycmF5LmlzQXJyYXkoYWN0aW9uLmRlc2Mua2V5YmluZGluZykgPyBhY3Rpb24uZGVzYy5rZXliaW5kaW5nWzBdIDogYWN0aW9uLmRlc2Mua2V5YmluZGluZztcblx0XHRjb25zdCB3aGVuID0ga2V5YmluZGluZz8ud2hlbj8uc2VyaWFsaXplKCkgPz8gJyc7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByZWNvbmRpdGlvbkhhc0NyZWF0ZWQ6IHByZWNvbmRpdGlvbi5pbmNsdWRlcyhTZXNzaW9uSXNDcmVhdGVkQ29udGV4dC5rZXkpLFxuXHRcdFx0cHJlY29uZGl0aW9uSGFzQXZhaWxhYmlsaXR5OiBwcmVjb25kaXRpb24uaW5jbHVkZXMoU2luZ2xlUGFuZUNoYW5nZXNUYWJBdmFpbGFibGVDb250ZXh0LmtleSksXG5cdFx0XHRrZXliaW5kaW5nSGFzQ3JlYXRlZDogd2hlbi5pbmNsdWRlcyhTZXNzaW9uSXNDcmVhdGVkQ29udGV4dC5rZXkpLFxuXHRcdFx0a2V5YmluZGluZ0hhc0F2YWlsYWJpbGl0eTogd2hlbi5pbmNsdWRlcyhTaW5nbGVQYW5lQ2hhbmdlc1RhYkF2YWlsYWJsZUNvbnRleHQua2V5KSxcblx0XHR9LCB7XG5cdFx0XHRwcmVjb25kaXRpb25IYXNDcmVhdGVkOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uSGFzQXZhaWxhYmlsaXR5OiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZ0hhc0NyZWF0ZWQ6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nSGFzQXZhaWxhYmlsaXR5OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgc2VhcmNoIHRhYiBhY3Rpb24gaXMgdW5hdmFpbGFibGUgZm9yIFF1aWNrIENoYXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBOZXdTZWFyY2hUYWJBY3Rpb24oKTtcblx0XHRjb25zdCBrZXliaW5kaW5nID0gQXJyYXkuaXNBcnJheShhY3Rpb24uZGVzYy5rZXliaW5kaW5nKSA/IGFjdGlvbi5kZXNjLmtleWJpbmRpbmdbMF0gOiBhY3Rpb24uZGVzYy5rZXliaW5kaW5nO1xuXHRcdGNvbnN0IGV2YWx1YXRlID0gKGV4cHJlc3Npb246IENvbnRleHRLZXlFeHByZXNzaW9uIHwgbnVsbCB8IHVuZGVmaW5lZCwgaXNRdWlja0NoYXQ6IGJvb2xlYW4pOiBib29sZWFuID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlczogUmVjb3JkPHN0cmluZywgQ29udGV4dEtleVZhbHVlPiA9IHtcblx0XHRcdFx0W0lzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LmtleV06IHRydWUsXG5cdFx0XHRcdFtJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQua2V5XTogZmFsc2UsXG5cdFx0XHRcdFtJc1F1aWNrQ2hhdFNlc3Npb25Db250ZXh0LmtleV06IGlzUXVpY2tDaGF0LFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBleHByZXNzaW9uPy5ldmFsdWF0ZSh7XG5cdFx0XHRcdGdldFZhbHVlOiA8VCBleHRlbmRzIENvbnRleHRLZXlWYWx1ZT4oa2V5OiBzdHJpbmcpID0+IHZhbHVlc1trZXldIGFzIFQgfCB1bmRlZmluZWRcblx0XHRcdH0gc2F0aXNmaWVzIElDb250ZXh0KSA/PyBmYWxzZTtcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcmVjb25kaXRpb25JblF1aWNrQ2hhdDogZXZhbHVhdGUoYWN0aW9uLmRlc2MucHJlY29uZGl0aW9uLCB0cnVlKSxcblx0XHRcdGtleWJpbmRpbmdJblF1aWNrQ2hhdDogZXZhbHVhdGUoa2V5YmluZGluZz8ud2hlbiwgdHJ1ZSksXG5cdFx0XHRwcmVjb25kaXRpb25JbldvcmtzcGFjZVNlc3Npb246IGV2YWx1YXRlKGFjdGlvbi5kZXNjLnByZWNvbmRpdGlvbiwgZmFsc2UpLFxuXHRcdFx0a2V5YmluZGluZ0luV29ya3NwYWNlU2Vzc2lvbjogZXZhbHVhdGUoa2V5YmluZGluZz8ud2hlbiwgZmFsc2UpLFxuXHRcdH0sIHtcblx0XHRcdHByZWNvbmRpdGlvbkluUXVpY2tDaGF0OiBmYWxzZSxcblx0XHRcdGtleWJpbmRpbmdJblF1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb25JbldvcmtzcGFjZVNlc3Npb246IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nSW5Xb3Jrc3BhY2VTZXNzaW9uOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBmaWxlIGVkaXRvciB1cGRhdGVzIGl0cyB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gc3R1YkVkaXRvclZpc2liaWxpdHkoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRydWUpO1xuXHRcdGNvbnN0IGlucHV0ID0gc3RvcmUuYWRkKG5ldyBFbXB0eUZpbGVFZGl0b3JJbnB1dChjcmVhdGVXb3Jrc3BhY2UoVVJJLmZpbGUoJy9yZXBvL2ZpcnN0JykpLCBsYXlvdXRTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgb3RoZXIgPSBzdG9yZS5hZGQobmV3IEVtcHR5RmlsZUVkaXRvcklucHV0KHVuZGVmaW5lZCwgbGF5b3V0U2VydmljZSkpO1xuXHRcdGlucHV0LnNldFdvcmtzcGFjZShjcmVhdGVXb3Jrc3BhY2UoVVJJLmZpbGUoJy9yZXBvL290aGVyJykpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb3VyY2U6IGlucHV0LnJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0bWF0Y2hlc0Fub3RoZXJFbXB0eUlucHV0OiBpbnB1dC5tYXRjaGVzKG90aGVyKVxuXHRcdH0sIHtcblx0XHRcdHJlc291cmNlOiBVUkkuZmlsZSgnL3JlcG8vb3RoZXInKS50b1N0cmluZygpLFxuXHRcdFx0bWF0Y2hlc0Fub3RoZXJFbXB0eUlucHV0OiB0cnVlXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGZpbGUgZWRpdG9yIHVwZGF0ZXMgbWFuYWdlZCBGaWxlcyBjYXBhYmlsaXRpZXMgd2l0aCBlZGl0b3IgYXJlYSB2aXNpYmlsaXR5JywgKCkgPT4ge1xuXHRcdGxldCBlZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJUGFydFZpc2liaWxpdHlDaGFuZ2VFdmVudD4oKSk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSA9IG9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSBpc1Zpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHBhcnQgPT09IFBhcnRzLkVESVRPUl9QQVJUICYmIGVkaXRvclZpc2libGU7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBpbnB1dCA9IHN0b3JlLmFkZChuZXcgRW1wdHlGaWxlRWRpdG9ySW5wdXQodW5kZWZpbmVkLCBsYXlvdXRTZXJ2aWNlKSk7XG5cdFx0bGV0IGNhcGFiaWxpdGllc0NoYW5nZXMgPSAwO1xuXHRcdHN0b3JlLmFkZChpbnB1dC5vbkRpZENoYW5nZUNhcGFiaWxpdGllcygoKSA9PiBjYXBhYmlsaXRpZXNDaGFuZ2VzKyspKTtcblxuXHRcdGNvbnN0IGhpZGRlbkNhcGFiaWxpdGllcyA9IGlucHV0LmNhcGFiaWxpdGllcztcblx0XHRlZGl0b3JWaXNpYmxlID0gdHJ1ZTtcblx0XHRvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoaWRkZW5DYXBhYmlsaXRpZXMsXG5cdFx0XHR2aXNpYmxlQ2FwYWJpbGl0aWVzOiBpbnB1dC5jYXBhYmlsaXRpZXMsXG5cdFx0XHRjYXBhYmlsaXRpZXNDaGFuZ2VzXG5cdFx0fSwge1xuXHRcdFx0aGlkZGVuQ2FwYWJpbGl0aWVzOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5FeGNsdWRlRnJvbUVkaXRvckxpbWl0IHxcblx0XHRcdFx0RWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVhZG9ubHkgfFxuXHRcdFx0XHRFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TaW5nbGV0b24gfFxuXHRcdFx0XHRFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5Gb3JjZVJldmVhbCB8XG5cdFx0XHRcdEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkNhbm5vdENsb3NlLFxuXHRcdFx0dmlzaWJsZUNhcGFiaWxpdGllczogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuRXhjbHVkZUZyb21FZGl0b3JMaW1pdCB8XG5cdFx0XHRcdEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlYWRvbmx5IHxcblx0XHRcdFx0RWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuU2luZ2xldG9uIHxcblx0XHRcdFx0RWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuRm9yY2VSZXZlYWwsXG5cdFx0XHRjYXBhYmlsaXRpZXNDaGFuZ2VzOiAxXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGZpbGUgZWRpdG9yIGV4cG9zZXMgaXRzIGJyZWFkY3J1bWIgcmVzb3VyY2Ugb25seSB3aGlsZSB0aGUgZWRpdG9yIGFyZWEgaXMgdmlzaWJsZScsICgpID0+IHtcblx0XHRsZXQgZWRpdG9yVmlzaWJsZSA9IGZhbHNlO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SVBhcnRWaXNpYmlsaXR5Q2hhbmdlRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkgPSBvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgaXNWaXNpYmxlKHBhcnQ6IFBhcnRzKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiBwYXJ0ID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBlZGl0b3JWaXNpYmxlO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgaW5wdXQgPSBzdG9yZS5hZGQobmV3IEVtcHR5RmlsZUVkaXRvcklucHV0KGNyZWF0ZVdvcmtzcGFjZShVUkkuZmlsZSgnL3JlcG8vd29ya3RyZWUnKSksIGxheW91dFNlcnZpY2UpKTtcblx0XHRsZXQgbGFiZWxDaGFuZ2VzID0gMDtcblx0XHRzdG9yZS5hZGQoaW5wdXQub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiBsYWJlbENoYW5nZXMrKykpO1xuXG5cdFx0Y29uc3QgaGlkZGVuUmVzb3VyY2UgPSBpbnB1dC5yZXNvdXJjZTtcblx0XHRlZGl0b3JWaXNpYmxlID0gdHJ1ZTtcblx0XHRvbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LmZpcmUoeyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoaWRkZW5SZXNvdXJjZSxcblx0XHRcdHZpc2libGVSZXNvdXJjZTogaW5wdXQucmVzb3VyY2U/LnRvU3RyaW5nKCksXG5cdFx0XHRsYWJlbENoYW5nZXNcblx0XHR9LCB7XG5cdFx0XHRoaWRkZW5SZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0dmlzaWJsZVJlc291cmNlOiBVUkkuZmlsZSgnL3JlcG8vd29ya3RyZWUnKS50b1N0cmluZygpLFxuXHRcdFx0bGFiZWxDaGFuZ2VzOiAxXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGZpbGUgZWRpdG9yIHNlcmlhbGl6ZXIgcHJlc2VydmVzIHRoZSB3b3Jrc3BhY2UgZm9sZGVycycsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBzdHViRWRpdG9yVmlzaWJpbGl0eShpbnN0YW50aWF0aW9uU2VydmljZSwgZmFsc2UpO1xuXHRcdGNvbnN0IHNlcmlhbGl6ZXIgPSBuZXcgRW1wdHlGaWxlRWRpdG9yU2VyaWFsaXplcigpO1xuXHRcdGNvbnN0IGlucHV0ID0gc3RvcmUuYWRkKG5ldyBFbXB0eUZpbGVFZGl0b3JJbnB1dChjcmVhdGVXb3Jrc3BhY2UoVVJJLmZpbGUoJy9yZXBvL2ZpcnN0JyksIFVSSS5maWxlKCcvcmVwby9zZWNvbmQnKSksIGxheW91dFNlcnZpY2UpKTtcblx0XHRjb25zdCByZXN0b3JlZCA9IHNlcmlhbGl6ZXIuZGVzZXJpYWxpemUoaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcmlhbGl6ZXIuc2VyaWFsaXplKGlucHV0KSA/PyAnJyk7XG5cdFx0aWYgKHJlc3RvcmVkKSB7XG5cdFx0XHRzdG9yZS5hZGQocmVzdG9yZWQpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHQocmVzdG9yZWQgYXMgRW1wdHlGaWxlRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQpPy53b3Jrc3BhY2U/LmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIud29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpKSxcblx0XHRcdGlucHV0LndvcmtzcGFjZT8uZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci53b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCkpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbmV3IHNlYXJjaCB0YWIgYWN0aW9uIG9wZW5zIGEgbmV3IHNlYXJjaCBlZGl0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25zdCBpbnZva2VkOiB1bmtub3duW10gPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElJbnN0YW50aWF0aW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSW5zdGFudGlhdGlvblNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgaW52b2tlRnVuY3Rpb248UiwgVFMgZXh0ZW5kcyBhbnlbXSA9IFtdPihmbjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiBUUykgPT4gUiwgLi4uX2FyZ3M6IFRTKTogUiB7XG5cdFx0XHRcdGludm9rZWQucHVzaChmbik7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQgYXMgUjtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGF3YWl0IG5ldyBOZXdTZWFyY2hUYWJBY3Rpb24oKS5ydW4oaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnZva2VkLCBbb3Blbk5ld1NlYXJjaEVkaXRvcl0pO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgY2hhbmdlcyB0YWIgYWN0aW9uIG9wZW5zIHRoZSBjaGFuZ2VzIGVkaXRvciBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Nlc3Npb246MScpO1xuXHRcdHN0dWJFZGl0b3JHcm91cENvdW50KGluc3RhbnRpYXRpb25TZXJ2aWNlLCA1KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gY29uc3RPYnNlcnZhYmxlKHsgcmVzb3VyY2UsIGlzQ3JlYXRlZDogY29uc3RPYnNlcnZhYmxlKHRydWUpIH0gYXMgSUFjdGl2ZVNlc3Npb24pO1xuXHRcdH0pO1xuXHRcdGNvbnN0IG9wZW5lZDogeyByZXNvdXJjZTogVVJJOyBpbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25DaGFuZ2VzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5DaGFuZ2VzRWRpdG9yKHNlc3Npb25SZXNvdXJjZTogVVJJLCBvcHRpb25zPzogSUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRvcGVuZWQucHVzaCh7IHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsIGluZGV4OiBvcHRpb25zPy5pbmRleCB9KTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGF3YWl0IG5ldyBOZXdDaGFuZ2VzVGFiQWN0aW9uKCkucnVuKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkLCBbeyByZXNvdXJjZSwgaW5kZXg6IDUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgY2hhbmdlcyB0YWIgYWN0aW9uIGlzIGEgbm8tb3AgZm9yIGFuIHVuY3JlYXRlZCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0c3R1YkVkaXRvckdyb3VwQ291bnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIDApO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGUoeyByZXNvdXJjZTogVVJJLnBhcnNlKCdzZXNzaW9uOm5ldycpLCBpc0NyZWF0ZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSkgfSBhcyBJQWN0aXZlU2Vzc2lvbik7XG5cdFx0fSk7XG5cdFx0bGV0IG9wZW5lZCA9IGZhbHNlO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25DaGFuZ2VzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIG9wZW5DaGFuZ2VzRWRpdG9yKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0XHRcdG9wZW5lZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhd2FpdCBuZXcgTmV3Q2hhbmdlc1RhYkFjdGlvbigpLnJ1bihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlbmVkLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBjaGFuZ2VzIHRhYiBhY3Rpb24gaXMgYSBuby1vcCB3aGVuIHRoZXJlIGlzIG5vIGFjdGl2ZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0c3R1YkVkaXRvckdyb3VwQ291bnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIDApO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHR9KTtcblx0XHRsZXQgb3BlbmVkID0gZmFsc2U7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uQ2hhbmdlc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlbkNoYW5nZXNFZGl0b3IoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRcdFx0b3BlbmVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGF3YWl0IG5ldyBOZXdDaGFuZ2VzVGFiQWN0aW9uKCkucnVuKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvcGVuZWQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbWF4aW1pemUgZWRpdG9yIGhpZGVzIHRoZSB0ZXJtaW5hbCBwYW5lbCBiZWZvcmUgbWF4aW1pemluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0cmVhZG9ubHkgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRyZWFkb25seSBoaWRkZW5QYXJ0czogUGFydHNbXSA9IFtdO1xuXHRcdFx0ZWRpdG9yTWF4aW1pemVkID0gZmFsc2U7XG5cdFx0XHRwYW5lbFZpc2libGUgPSB0cnVlO1xuXG5cdFx0XHRvdmVycmlkZSBpc1Zpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQgPyB0aGlzLnBhbmVsVmlzaWJsZSA6IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBzZXRQYXJ0SGlkZGVuKGhpZGRlbjogYm9vbGVhbiwgcGFydDogUGFydHMpOiB2b2lkIHtcblx0XHRcdFx0aWYgKHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQpIHtcblx0XHRcdFx0XHR0aGlzLnBhbmVsVmlzaWJsZSA9ICFoaWRkZW47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaGlkZGVuICYmIHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQpIHtcblx0XHRcdFx0XHR0aGlzLmNhbGxzLnB1c2goJ2hpZGVQYW5lbCcpO1xuXHRcdFx0XHRcdHRoaXMuaGlkZGVuUGFydHMucHVzaChwYXJ0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBzZXRFZGl0b3JNYXhpbWl6ZWQobWF4aW1pemVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuY2FsbHMucHVzaChtYXhpbWl6ZWQgPyAnbWF4aW1pemVFZGl0b3InIDogJ3Jlc3RvcmVFZGl0b3InKTtcblx0XHRcdFx0dGhpcy5lZGl0b3JNYXhpbWl6ZWQgPSBtYXhpbWl6ZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElWaWV3c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpc1ZpZXdWaXNpYmxlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIGlkID09PSBURVJNSU5BTF9WSUVXX0lEO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLm1heGltaXplTWFpbkVkaXRvclBhcnQnKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlciwgJ0NvbW1hbmQgaGFuZGxlciBzaG91bGQgYmUgcmVnaXN0ZXJlZCcpO1xuXG5cdFx0YXdhaXQgaGFuZGxlcihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxheW91dFNlcnZpY2UuY2FsbHMsIFsnaGlkZVBhbmVsJywgJ21heGltaXplRWRpdG9yJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5oaWRkZW5QYXJ0cywgW1BhcnRzLlBBTkVMX1BBUlRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5lZGl0b3JNYXhpbWl6ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXhpbWl6ZSBlZGl0b3Iga2VlcHMgbm9uLXRlcm1pbmFsIHBhbmVscyB2aXNpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0XHRyZWFkb25seSBoaWRkZW5QYXJ0czogUGFydHNbXSA9IFtdO1xuXHRcdFx0ZWRpdG9yTWF4aW1pemVkID0gZmFsc2U7XG5cdFx0XHRwYW5lbFZpc2libGUgPSB0cnVlO1xuXG5cdFx0XHRvdmVycmlkZSBpc1Zpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQgPyB0aGlzLnBhbmVsVmlzaWJsZSA6IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBzZXRQYXJ0SGlkZGVuKGhpZGRlbjogYm9vbGVhbiwgcGFydDogUGFydHMpOiB2b2lkIHtcblx0XHRcdFx0aWYgKHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQpIHtcblx0XHRcdFx0XHR0aGlzLnBhbmVsVmlzaWJsZSA9ICFoaWRkZW47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaGlkZGVuICYmIHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQpIHtcblx0XHRcdFx0XHR0aGlzLmhpZGRlblBhcnRzLnB1c2gocGFydCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgc2V0RWRpdG9yTWF4aW1pemVkKG1heGltaXplZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0XHR0aGlzLmVkaXRvck1heGltaXplZCA9IG1heGltaXplZDtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVZpZXdzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVmlld3NTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGlzVmlld1Zpc2libGUoX2lkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgaGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLm1heGltaXplTWFpbkVkaXRvclBhcnQnKT8uaGFuZGxlcjtcblx0XHRhc3NlcnQub2soaGFuZGxlciwgJ0NvbW1hbmQgaGFuZGxlciBzaG91bGQgYmUgcmVnaXN0ZXJlZCcpO1xuXG5cdFx0YXdhaXQgaGFuZGxlcihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxheW91dFNlcnZpY2UuaGlkZGVuUGFydHMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5lZGl0b3JNYXhpbWl6ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlIGVkaXRvciByZW9wZW5zIHRoZSB0ZXJtaW5hbCBwYW5lbCB3aGVuIG1heGltaXplIGhpZCBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2U+KCkge1xuXHRcdFx0cmVhZG9ubHkgaGlkZGVuUGFydHM6IFBhcnRzW10gPSBbXTtcblx0XHRcdHJlYWRvbmx5IHNob3duUGFydHM6IFBhcnRzW10gPSBbXTtcblx0XHRcdHJlYWRvbmx5IG1heGltaXplZFN0YXRlczogYm9vbGVhbltdID0gW107XG5cdFx0XHRwYW5lbFZpc2libGUgPSB0cnVlO1xuXG5cdFx0XHRvdmVycmlkZSBpc1Zpc2libGUocGFydDogUGFydHMpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQgPyB0aGlzLnBhbmVsVmlzaWJsZSA6IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBzZXRQYXJ0SGlkZGVuKGhpZGRlbjogYm9vbGVhbiwgcGFydDogUGFydHMpOiB2b2lkIHtcblx0XHRcdFx0aWYgKHBhcnQgPT09IFBhcnRzLlBBTkVMX1BBUlQpIHtcblx0XHRcdFx0XHR0aGlzLnBhbmVsVmlzaWJsZSA9ICFoaWRkZW47XG5cdFx0XHRcdFx0aWYgKGhpZGRlbikge1xuXHRcdFx0XHRcdFx0dGhpcy5oaWRkZW5QYXJ0cy5wdXNoKHBhcnQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNob3duUGFydHMucHVzaChwYXJ0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgc2V0RWRpdG9yTWF4aW1pemVkKG1heGltaXplZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0XHR0aGlzLm1heGltaXplZFN0YXRlcy5wdXNoKG1heGltaXplZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElWaWV3c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpc1ZpZXdWaXNpYmxlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIGlkID09PSBURVJNSU5BTF9WSUVXX0lEO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbWF4aW1pemVIYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMubWF4aW1pemVNYWluRWRpdG9yUGFydCcpPy5oYW5kbGVyO1xuXHRcdGNvbnN0IHJlc3RvcmVIYW5kbGVyID0gQ29tbWFuZHNSZWdpc3RyeS5nZXRDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMucmVzdG9yZU1haW5FZGl0b3JQYXJ0Jyk/LmhhbmRsZXI7XG5cdFx0YXNzZXJ0Lm9rKG1heGltaXplSGFuZGxlciwgJ01heGltaXplIGNvbW1hbmQgaGFuZGxlciBzaG91bGQgYmUgcmVnaXN0ZXJlZCcpO1xuXHRcdGFzc2VydC5vayhyZXN0b3JlSGFuZGxlciwgJ1Jlc3RvcmUgY29tbWFuZCBoYW5kbGVyIHNob3VsZCBiZSByZWdpc3RlcmVkJyk7XG5cblx0XHRhd2FpdCBtYXhpbWl6ZUhhbmRsZXIoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGF3YWl0IHJlc3RvcmVIYW5kbGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5oaWRkZW5QYXJ0cywgW1BhcnRzLlBBTkVMX1BBUlRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxheW91dFNlcnZpY2Uuc2hvd25QYXJ0cywgW1BhcnRzLlBBTkVMX1BBUlRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxheW91dFNlcnZpY2UubWF4aW1pemVkU3RhdGVzLCBbdHJ1ZSwgZmFsc2VdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5wYW5lbFZpc2libGUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlIGVkaXRvciBkb2VzIG5vdCByZW9wZW4gdGhlIHBhbmVsIHdoZW4gbWF4aW1pemUgbGVmdCBpdCB2aXNpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0XHRyZWFkb25seSBzaG93blBhcnRzOiBQYXJ0c1tdID0gW107XG5cdFx0XHRyZWFkb25seSBtYXhpbWl6ZWRTdGF0ZXM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdFx0cGFuZWxWaXNpYmxlID0gdHJ1ZTtcblxuXHRcdFx0b3ZlcnJpZGUgaXNWaXNpYmxlKHBhcnQ6IFBhcnRzKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiBwYXJ0ID09PSBQYXJ0cy5QQU5FTF9QQVJUID8gdGhpcy5wYW5lbFZpc2libGUgOiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgc2V0UGFydEhpZGRlbihoaWRkZW46IGJvb2xlYW4sIHBhcnQ6IFBhcnRzKTogdm9pZCB7XG5cdFx0XHRcdGlmIChwYXJ0ID09PSBQYXJ0cy5QQU5FTF9QQVJUKSB7XG5cdFx0XHRcdFx0dGhpcy5wYW5lbFZpc2libGUgPSAhaGlkZGVuO1xuXHRcdFx0XHRcdGlmICghaGlkZGVuKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNob3duUGFydHMucHVzaChwYXJ0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgc2V0RWRpdG9yTWF4aW1pemVkKG1heGltaXplZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0XHR0aGlzLm1heGltaXplZFN0YXRlcy5wdXNoKG1heGltaXplZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElWaWV3c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVZpZXdzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpc1ZpZXdWaXNpYmxlKF9pZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IG1heGltaXplSGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLm1heGltaXplTWFpbkVkaXRvclBhcnQnKT8uaGFuZGxlcjtcblx0XHRjb25zdCByZXN0b3JlSGFuZGxlciA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLnJlc3RvcmVNYWluRWRpdG9yUGFydCcpPy5oYW5kbGVyO1xuXHRcdGFzc2VydC5vayhtYXhpbWl6ZUhhbmRsZXIsICdNYXhpbWl6ZSBjb21tYW5kIGhhbmRsZXIgc2hvdWxkIGJlIHJlZ2lzdGVyZWQnKTtcblx0XHRhc3NlcnQub2socmVzdG9yZUhhbmRsZXIsICdSZXN0b3JlIGNvbW1hbmQgaGFuZGxlciBzaG91bGQgYmUgcmVnaXN0ZXJlZCcpO1xuXG5cdFx0YXdhaXQgbWF4aW1pemVIYW5kbGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRhd2FpdCByZXN0b3JlSGFuZGxlcihpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxheW91dFNlcnZpY2Uuc2hvd25QYXJ0cywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGF5b3V0U2VydmljZS5tYXhpbWl6ZWRTdGF0ZXMsIFt0cnVlLCBmYWxzZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXlvdXRTZXJ2aWNlLnBhbmVsVmlzaWJsZSwgdHJ1ZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxjQUFjLDhCQUFnRDtBQUN2RSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFxQyx5QkFB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
