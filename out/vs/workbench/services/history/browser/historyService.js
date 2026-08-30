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
import { localize } from "../../../../nls.js";
import { URI } from "../../../../base/common/uri.js";
import { EditorResourceAccessor, EditorsOrder, SideBySideEditor, isResourceEditorInput, isEditorInput, isSideBySideEditorInput, EditorCloseContext, EditorPaneSelectionCompareResult, EditorPaneSelectionChangeReason, isEditorPaneWithSelection, GroupModelChangeKind } from "../../../common/editor.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { GoFilter, GoScope, IHistoryService, MOUSE_BACK_FORWARD_NAVIGATION_SETTING } from "../common/history.js";
import { FileChangesEvent, IFileService, FileChangeType, FILES_EXCLUDE_CONFIG, FileOperationEvent, FileOperation } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Disposable, DisposableStore, DisposableMap } from "../../../../base/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEditorGroupsService } from "../../editor/common/editorGroupsService.js";
import { getExcludes, SEARCH_EXCLUDE_CONFIG } from "../../search/common/search.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkbenchLayoutService } from "../../layout/browser/layoutService.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { addDisposableListener, EventType, EventHelper, WindowIdleValue } from "../../../../base/browser/dom.js";
import { IWorkspacesService } from "../../../../platform/workspaces/common/workspaces.js";
import { Schemas } from "../../../../base/common/network.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { ResourceGlobMatcher } from "../../../common/resources.js";
import { IPathService } from "../../path/common/pathService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { ILogService, LogLevel } from "../../../../platform/log/common/log.js";
import { mainWindow } from "../../../../base/browser/window.js";
let HistoryService = class extends Disposable {
  constructor(editorService, editorGroupService, contextService, storageService, configurationService, fileService, workspacesService, instantiationService, layoutService, contextKeyService, logService) {
    super();
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.contextService = contextService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.workspacesService = workspacesService;
    this.instantiationService = instantiationService;
    this.layoutService = layoutService;
    this.contextKeyService = contextKeyService;
    this.logService = logService;
    this.activeEditorListeners = this._register(new DisposableStore());
    this.lastActiveEditor = void 0;
    //#endregion
    //#region Editor History Navigation (limit: 50)
    this._onDidChangeEditorNavigationStack = this._register(new Emitter());
    this.onDidChangeEditorNavigationStack = this._onDidChangeEditorNavigationStack.event;
    this.defaultScopedEditorNavigationStack = void 0;
    this.editorGroupScopedNavigationStacks = /* @__PURE__ */ new Map();
    this.editorScopedNavigationStacks = /* @__PURE__ */ new Map();
    this.editorNavigationScope = GoScope.DEFAULT;
    //#endregion
    //#region Navigation: Next/Previous Used Editor
    this.recentlyUsedEditorsStack = void 0;
    this.recentlyUsedEditorsStackIndex = 0;
    this.recentlyUsedEditorsInGroupStack = void 0;
    this.recentlyUsedEditorsInGroupStackIndex = 0;
    this.navigatingInRecentlyUsedEditorsStack = false;
    this.navigatingInRecentlyUsedEditorsInGroupStack = false;
    this.recentlyClosedEditors = [];
    this.ignoreEditorCloseEvent = false;
    this.recentlyClosedEditorsBatchId = 0;
    this.recentlyClosedEditorsBatchScheduled = false;
    this.history = void 0;
    this.editorHistoryListeners = this._register(new DisposableMap());
    this.resourceExcludeMatcher = this._register(new WindowIdleValue(mainWindow, () => {
      const matcher = this._register(this.instantiationService.createInstance(
        ResourceGlobMatcher,
        (root) => getExcludes(root ? this.configurationService.getValue({ resource: root }) : this.configurationService.getValue()) || /* @__PURE__ */ Object.create(null),
        (event) => event.affectsConfiguration(FILES_EXCLUDE_CONFIG) || event.affectsConfiguration(SEARCH_EXCLUDE_CONFIG)
      ));
      this._register(matcher.onExpressionChange(() => this.removeExcludedFromHistory()));
      return matcher;
    }));
    this.editorHelper = this.instantiationService.createInstance(EditorHelper);
    this.canNavigateBackContextKey = new RawContextKey("canNavigateBack", false, localize("canNavigateBack", "Whether it is possible to navigate back in editor history")).bindTo(this.contextKeyService);
    this.canNavigateForwardContextKey = new RawContextKey("canNavigateForward", false, localize("canNavigateForward", "Whether it is possible to navigate forward in editor history")).bindTo(this.contextKeyService);
    this.canNavigateBackInNavigationsContextKey = new RawContextKey("canNavigateBackInNavigationLocations", false, localize("canNavigateBackInNavigationLocations", "Whether it is possible to navigate back in editor navigation locations history")).bindTo(this.contextKeyService);
    this.canNavigateForwardInNavigationsContextKey = new RawContextKey("canNavigateForwardInNavigationLocations", false, localize("canNavigateForwardInNavigationLocations", "Whether it is possible to navigate forward in editor navigation locations history")).bindTo(this.contextKeyService);
    this.canNavigateToLastNavigationLocationContextKey = new RawContextKey("canNavigateToLastNavigationLocation", false, localize("canNavigateToLastNavigationLocation", "Whether it is possible to navigate to the last editor navigation location")).bindTo(this.contextKeyService);
    this.canNavigateBackInEditsContextKey = new RawContextKey("canNavigateBackInEditLocations", false, localize("canNavigateBackInEditLocations", "Whether it is possible to navigate back in editor edit locations history")).bindTo(this.contextKeyService);
    this.canNavigateForwardInEditsContextKey = new RawContextKey("canNavigateForwardInEditLocations", false, localize("canNavigateForwardInEditLocations", "Whether it is possible to navigate forward in editor edit locations history")).bindTo(this.contextKeyService);
    this.canNavigateToLastEditLocationContextKey = new RawContextKey("canNavigateToLastEditLocation", false, localize("canNavigateToLastEditLocation", "Whether it is possible to navigate to the last editor edit location")).bindTo(this.contextKeyService);
    this.canReopenClosedEditorContextKey = new RawContextKey("canReopenClosedEditor", false, localize("canReopenClosedEditor", "Whether it is possible to reopen the last closed editor")).bindTo(this.contextKeyService);
    this.registerListeners();
    if (this.editorService.activeEditorPane) {
      this.onDidActiveEditorChange();
    }
  }
  registerListeners() {
    this.registerMouseNavigationListener();
    this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
    this._register(this.editorService.onDidOpenEditorFail((event) => this.remove(event.editor)));
    this._register(this.editorService.onDidCloseEditor((event) => this.onDidCloseEditor(event)));
    this._register(this.editorService.onDidMostRecentlyActiveEditorsChange(() => this.handleEditorEventInRecentEditorsStack()));
    this._register(this.editorGroupService.onDidRemoveGroup((e) => this.onDidRemoveGroup(e)));
    this._register(this.fileService.onDidFilesChange((event) => this.onDidFilesChange(event)));
    this._register(this.fileService.onDidRunOperation((event) => this.onDidFilesChange(event)));
    this._register(this.storageService.onWillSaveState(() => this.saveState()));
    this.registerEditorNavigationScopeChangeListener();
    this._register(this.onDidChangeEditorNavigationStack(() => this.updateContextKeys()));
    this._register(this.editorGroupService.onDidChangeActiveGroup(() => this.updateContextKeys()));
  }
  onDidCloseEditor(e) {
    this.handleEditorCloseEventInHistory(e);
    this.handleEditorCloseEventInReopen(e);
  }
  registerMouseNavigationListener() {
    const mouseBackForwardSupportListener = this._register(new DisposableStore());
    const handleMouseBackForwardSupport = () => {
      mouseBackForwardSupportListener.clear();
      if (this.configurationService.getValue(MOUSE_BACK_FORWARD_NAVIGATION_SETTING)) {
        this._register(Event.runAndSubscribe(this.layoutService.onDidAddContainer, ({ container, disposables }) => {
          const eventDisposables = disposables.add(new DisposableStore());
          eventDisposables.add(addDisposableListener(container, EventType.MOUSE_DOWN, (e) => this.onMouseDownOrUp(e, true)));
          eventDisposables.add(addDisposableListener(container, EventType.MOUSE_UP, (e) => this.onMouseDownOrUp(e, false)));
          mouseBackForwardSupportListener.add(eventDisposables);
        }, { container: this.layoutService.mainContainer, disposables: this._store }));
      }
    };
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(MOUSE_BACK_FORWARD_NAVIGATION_SETTING)) {
        handleMouseBackForwardSupport();
      }
    }));
    handleMouseBackForwardSupport();
  }
  onMouseDownOrUp(event, isMouseDown) {
    switch (event.button) {
      case 3:
        EventHelper.stop(event);
        if (isMouseDown) {
          this.goBack();
        }
        break;
      case 4:
        EventHelper.stop(event);
        if (isMouseDown) {
          this.goForward();
        }
        break;
    }
  }
  onDidRemoveGroup(group) {
    this.handleEditorGroupRemoveInNavigationStacks(group);
  }
  onDidActiveEditorChange() {
    const activeEditorGroup = this.editorGroupService.activeGroup;
    const activeEditorPane = activeEditorGroup.activeEditorPane;
    if (this.lastActiveEditor && this.editorHelper.matchesEditorIdentifier(this.lastActiveEditor, activeEditorPane)) {
      return;
    }
    this.lastActiveEditor = activeEditorPane?.input ? { editor: activeEditorPane.input, groupId: activeEditorPane.group.id } : void 0;
    this.activeEditorListeners.clear();
    if (!activeEditorPane?.group.isTransient(activeEditorPane.input)) {
      this.handleActiveEditorChange(activeEditorGroup, activeEditorPane);
    } else {
      this.logService.trace(`[History]: ignoring transient editor change until becoming non-transient (editor: ${activeEditorPane.input?.resource?.toString()}})`);
      const transientListener = activeEditorGroup.onDidModelChange((e) => {
        if (e.kind === GroupModelChangeKind.EDITOR_TRANSIENT && e.editor === activeEditorPane.input && !activeEditorPane.group.isTransient(activeEditorPane.input)) {
          transientListener.dispose();
          this.handleActiveEditorChange(activeEditorGroup, activeEditorPane);
        }
      });
      this.activeEditorListeners.add(transientListener);
    }
    if (isEditorPaneWithSelection(activeEditorPane)) {
      this.activeEditorListeners.add(activeEditorPane.onDidChangeSelection((e) => {
        if (!activeEditorPane.group.isTransient(activeEditorPane.input)) {
          this.handleActiveEditorSelectionChangeEvent(activeEditorGroup, activeEditorPane, e);
        } else {
          this.logService.trace(`[History]: ignoring transient editor selection change (editor: ${activeEditorPane.input?.resource?.toString()}})`);
        }
      }));
    }
    this.updateContextKeys();
  }
  onDidFilesChange(event) {
    if (event instanceof FileChangesEvent) {
      if (event.gotDeleted()) {
        this.remove(event);
      }
    } else {
      if (event.isOperation(FileOperation.DELETE)) {
        this.remove(event);
      } else if (event.isOperation(FileOperation.MOVE) && event.target.isFile) {
        this.move(event);
      }
    }
  }
  handleActiveEditorChange(group, editorPane) {
    this.handleActiveEditorChangeInHistory(editorPane);
    this.handleActiveEditorChangeInNavigationStacks(group, editorPane);
  }
  handleActiveEditorSelectionChangeEvent(group, editorPane, event) {
    this.handleActiveEditorSelectionChangeInNavigationStacks(group, editorPane, event);
  }
  move(event) {
    this.moveInHistory(event);
    this.moveInEditorNavigationStacks(event);
  }
  remove(arg1) {
    this.removeFromHistory(arg1);
    this.removeFromEditorNavigationStacks(arg1);
    this.removeFromRecentlyClosedEditors(arg1);
    this.removeFromRecentlyOpened(arg1);
  }
  removeFromRecentlyOpened(arg1) {
    let resource = void 0;
    if (isEditorInput(arg1)) {
      resource = EditorResourceAccessor.getOriginalUri(arg1);
    } else if (arg1 instanceof FileChangesEvent) {
    } else {
      resource = arg1.resource;
    }
    if (resource) {
      this.workspacesService.removeRecentlyOpened([resource]);
    }
  }
  clear() {
    this.clearRecentlyOpened();
    this.clearEditorNavigationStacks();
    this.recentlyClosedEditors = [];
    this.updateContextKeys();
  }
  updateContextKeys() {
    this.contextKeyService.bufferChangeEvents(() => {
      const activeStack = this.getStack();
      this.canNavigateBackContextKey.set(activeStack.canGoBack(GoFilter.NONE));
      this.canNavigateForwardContextKey.set(activeStack.canGoForward(GoFilter.NONE));
      this.canNavigateBackInNavigationsContextKey.set(activeStack.canGoBack(GoFilter.NAVIGATION));
      this.canNavigateForwardInNavigationsContextKey.set(activeStack.canGoForward(GoFilter.NAVIGATION));
      this.canNavigateToLastNavigationLocationContextKey.set(activeStack.canGoLast(GoFilter.NAVIGATION));
      this.canNavigateBackInEditsContextKey.set(activeStack.canGoBack(GoFilter.EDITS));
      this.canNavigateForwardInEditsContextKey.set(activeStack.canGoForward(GoFilter.EDITS));
      this.canNavigateToLastEditLocationContextKey.set(activeStack.canGoLast(GoFilter.EDITS));
      this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
    });
  }
  registerEditorNavigationScopeChangeListener() {
    const handleEditorNavigationScopeChange = () => {
      this.disposeEditorNavigationStacks();
      const configuredScope = this.configurationService.getValue(HistoryService.NAVIGATION_SCOPE_SETTING);
      if (configuredScope === "editorGroup") {
        this.editorNavigationScope = GoScope.EDITOR_GROUP;
      } else if (configuredScope === "editor") {
        this.editorNavigationScope = GoScope.EDITOR;
      } else {
        this.editorNavigationScope = GoScope.DEFAULT;
      }
    };
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(HistoryService.NAVIGATION_SCOPE_SETTING)) {
        handleEditorNavigationScopeChange();
      }
    }));
    handleEditorNavigationScopeChange();
  }
  getStack(group = this.editorGroupService.activeGroup, editor = group.activeEditor) {
    switch (this.editorNavigationScope) {
      // Per Editor
      case GoScope.EDITOR: {
        if (!editor) {
          return new NoOpEditorNavigationStacks();
        }
        let stacksForGroup = this.editorScopedNavigationStacks.get(group.id);
        if (!stacksForGroup) {
          stacksForGroup = /* @__PURE__ */ new Map();
          this.editorScopedNavigationStacks.set(group.id, stacksForGroup);
        }
        let stack = stacksForGroup.get(editor)?.stack;
        if (!stack) {
          const disposable = new DisposableStore();
          stack = disposable.add(this.instantiationService.createInstance(EditorNavigationStacks, GoScope.EDITOR));
          disposable.add(stack.onDidChange(() => this._onDidChangeEditorNavigationStack.fire()));
          stacksForGroup.set(editor, { stack, disposable });
        }
        return stack;
      }
      // Per Editor Group
      case GoScope.EDITOR_GROUP: {
        let stack = this.editorGroupScopedNavigationStacks.get(group.id)?.stack;
        if (!stack) {
          const disposable = new DisposableStore();
          stack = disposable.add(this.instantiationService.createInstance(EditorNavigationStacks, GoScope.EDITOR_GROUP));
          disposable.add(stack.onDidChange(() => this._onDidChangeEditorNavigationStack.fire()));
          this.editorGroupScopedNavigationStacks.set(group.id, { stack, disposable });
        }
        return stack;
      }
      // Global
      case GoScope.DEFAULT: {
        if (!this.defaultScopedEditorNavigationStack) {
          this.defaultScopedEditorNavigationStack = this._register(this.instantiationService.createInstance(EditorNavigationStacks, GoScope.DEFAULT));
          this._register(this.defaultScopedEditorNavigationStack.onDidChange(() => this._onDidChangeEditorNavigationStack.fire()));
        }
        return this.defaultScopedEditorNavigationStack;
      }
    }
  }
  goForward(filter) {
    return this.getStack().goForward(filter);
  }
  goBack(filter) {
    return this.getStack().goBack(filter);
  }
  goPrevious(filter) {
    return this.getStack().goPrevious(filter);
  }
  goLast(filter) {
    return this.getStack().goLast(filter);
  }
  handleActiveEditorChangeInNavigationStacks(group, editorPane) {
    this.getStack(group, editorPane?.input).handleActiveEditorChange(editorPane);
  }
  handleActiveEditorSelectionChangeInNavigationStacks(group, editorPane, event) {
    this.getStack(group, editorPane.input).handleActiveEditorSelectionChange(editorPane, event);
  }
  handleEditorCloseEventInHistory(e) {
    const editors = this.editorScopedNavigationStacks.get(e.groupId);
    if (editors) {
      const editorStack = editors.get(e.editor);
      if (editorStack) {
        editorStack.disposable.dispose();
        editors.delete(e.editor);
      }
      if (editors.size === 0) {
        this.editorScopedNavigationStacks.delete(e.groupId);
      }
    }
  }
  handleEditorGroupRemoveInNavigationStacks(group) {
    this.defaultScopedEditorNavigationStack?.remove(group.id);
    const editorGroupStack = this.editorGroupScopedNavigationStacks.get(group.id);
    if (editorGroupStack) {
      editorGroupStack.disposable.dispose();
      this.editorGroupScopedNavigationStacks.delete(group.id);
    }
  }
  clearEditorNavigationStacks() {
    this.withEachEditorNavigationStack((stack) => stack.clear());
  }
  removeFromEditorNavigationStacks(arg1) {
    this.withEachEditorNavigationStack((stack) => stack.remove(arg1));
  }
  moveInEditorNavigationStacks(event) {
    this.withEachEditorNavigationStack((stack) => stack.move(event));
  }
  withEachEditorNavigationStack(fn) {
    if (this.defaultScopedEditorNavigationStack) {
      fn(this.defaultScopedEditorNavigationStack);
    }
    for (const [, entry] of this.editorGroupScopedNavigationStacks) {
      fn(entry.stack);
    }
    for (const [, entries] of this.editorScopedNavigationStacks) {
      for (const [, entry] of entries) {
        fn(entry.stack);
      }
    }
  }
  disposeEditorNavigationStacks() {
    this.defaultScopedEditorNavigationStack?.dispose();
    this.defaultScopedEditorNavigationStack = void 0;
    for (const [, stack] of this.editorGroupScopedNavigationStacks) {
      stack.disposable.dispose();
    }
    this.editorGroupScopedNavigationStacks.clear();
    for (const [, stacks] of this.editorScopedNavigationStacks) {
      for (const [, stack] of stacks) {
        stack.disposable.dispose();
      }
    }
    this.editorScopedNavigationStacks.clear();
  }
  openNextRecentlyUsedEditor(groupId) {
    const [stack, index] = this.ensureRecentlyUsedStack((index2) => index2 - 1, groupId);
    return this.doNavigateInRecentlyUsedEditorsStack(stack[index], groupId);
  }
  openPreviouslyUsedEditor(groupId) {
    const [stack, index] = this.ensureRecentlyUsedStack((index2) => index2 + 1, groupId);
    return this.doNavigateInRecentlyUsedEditorsStack(stack[index], groupId);
  }
  async doNavigateInRecentlyUsedEditorsStack(editorIdentifier, groupId) {
    if (editorIdentifier) {
      const acrossGroups = typeof groupId !== "number" || !this.editorGroupService.getGroup(groupId);
      if (acrossGroups) {
        this.navigatingInRecentlyUsedEditorsStack = true;
      } else {
        this.navigatingInRecentlyUsedEditorsInGroupStack = true;
      }
      const group = this.editorGroupService.getGroup(editorIdentifier.groupId) ?? this.editorGroupService.activeGroup;
      try {
        await group.openEditor(editorIdentifier.editor);
      } finally {
        if (acrossGroups) {
          this.navigatingInRecentlyUsedEditorsStack = false;
        } else {
          this.navigatingInRecentlyUsedEditorsInGroupStack = false;
        }
      }
    }
  }
  ensureRecentlyUsedStack(indexModifier, groupId) {
    let editors;
    let index;
    const group = typeof groupId === "number" ? this.editorGroupService.getGroup(groupId) : void 0;
    if (!group) {
      editors = this.recentlyUsedEditorsStack || this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
      index = this.recentlyUsedEditorsStackIndex;
    } else {
      editors = this.recentlyUsedEditorsInGroupStack || group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map((editor) => ({ groupId: group.id, editor }));
      index = this.recentlyUsedEditorsInGroupStackIndex;
    }
    let newIndex = indexModifier(index);
    if (newIndex < 0) {
      newIndex = 0;
    } else if (newIndex > editors.length - 1) {
      newIndex = editors.length - 1;
    }
    if (!group) {
      this.recentlyUsedEditorsStack = editors;
      this.recentlyUsedEditorsStackIndex = newIndex;
    } else {
      this.recentlyUsedEditorsInGroupStack = editors;
      this.recentlyUsedEditorsInGroupStackIndex = newIndex;
    }
    return [editors, newIndex];
  }
  handleEditorEventInRecentEditorsStack() {
    if (!this.navigatingInRecentlyUsedEditorsStack) {
      this.recentlyUsedEditorsStack = void 0;
      this.recentlyUsedEditorsStackIndex = 0;
    }
    if (!this.navigatingInRecentlyUsedEditorsInGroupStack) {
      this.recentlyUsedEditorsInGroupStack = void 0;
      this.recentlyUsedEditorsInGroupStackIndex = 0;
    }
  }
  handleEditorCloseEventInReopen(event) {
    if (this.ignoreEditorCloseEvent) {
      return;
    }
    const { editor, context } = event;
    if (context === EditorCloseContext.REPLACE || context === EditorCloseContext.MOVE) {
      return;
    }
    if (!editor.canReopen()) {
      return;
    }
    const untypedEditor = editor.toUntyped();
    if (!untypedEditor) {
      return;
    }
    const associatedResources = [];
    const editorResource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
    if (URI.isUri(editorResource)) {
      associatedResources.push(editorResource);
    } else if (editorResource) {
      associatedResources.push(...coalesce([editorResource.primary, editorResource.secondary]));
    }
    this.removeFromRecentlyClosedEditors(editor);
    this.recentlyClosedEditors.push({
      editorId: editor.editorId,
      editor: untypedEditor,
      resource: EditorResourceAccessor.getOriginalUri(editor),
      associatedResources,
      index: event.index,
      sticky: event.sticky,
      batchId: this.currentRecentlyClosedEditorsBatchId()
    });
    if (this.recentlyClosedEditors.length > HistoryService.MAX_RECENTLY_CLOSED_EDITORS) {
      this.recentlyClosedEditors.shift();
    }
    this.canReopenClosedEditorContextKey.set(true);
  }
  currentRecentlyClosedEditorsBatchId() {
    if (!this.recentlyClosedEditorsBatchScheduled) {
      this.recentlyClosedEditorsBatchScheduled = true;
      this.recentlyClosedEditorsBatchId++;
      queueMicrotask(() => this.recentlyClosedEditorsBatchScheduled = false);
    }
    return this.recentlyClosedEditorsBatchId;
  }
  async reopenLastClosedEditor() {
    const lastClosedEditors = this.takeLastClosedEditorsBatch();
    let reopenClosedEditorPromise = void 0;
    if (lastClosedEditors.length) {
      reopenClosedEditorPromise = this.doReopenLastClosedEditors(lastClosedEditors);
    }
    this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
    return reopenClosedEditorPromise;
  }
  takeLastClosedEditorsBatch() {
    const lastClosedEditor = this.recentlyClosedEditors.at(-1);
    if (!lastClosedEditor) {
      return [];
    }
    const batch = [];
    while (this.recentlyClosedEditors.length && this.recentlyClosedEditors[this.recentlyClosedEditors.length - 1].batchId === lastClosedEditor.batchId) {
      batch.unshift(this.recentlyClosedEditors.pop());
    }
    return batch;
  }
  async doReopenLastClosedEditors(lastClosedEditors) {
    let anyReopened = false;
    for (const lastClosedEditor of lastClosedEditors) {
      const editorPane = await this.doReopenLastClosedEditor(lastClosedEditor);
      if (editorPane) {
        anyReopened = true;
      }
    }
    if (!anyReopened && this.recentlyClosedEditors.length) {
      return this.reopenLastClosedEditor();
    }
  }
  async doReopenLastClosedEditor(lastClosedEditor) {
    const options = { pinned: true, sticky: lastClosedEditor.sticky, index: lastClosedEditor.index, ignoreError: true };
    if (lastClosedEditor.sticky && !this.editorGroupService.activeGroup.isSticky(lastClosedEditor.index) || !lastClosedEditor.sticky && this.editorGroupService.activeGroup.isSticky(lastClosedEditor.index)) {
      options.index = void 0;
    }
    let editorPane = void 0;
    if (!this.editorGroupService.activeGroup.contains(lastClosedEditor.editor)) {
      this.ignoreEditorCloseEvent = true;
      try {
        editorPane = await this.editorService.openEditor({
          ...lastClosedEditor.editor,
          options: {
            ...lastClosedEditor.editor.options,
            ...options
          }
        });
      } finally {
        this.ignoreEditorCloseEvent = false;
      }
    }
    return editorPane;
  }
  removeFromRecentlyClosedEditors(arg1) {
    this.recentlyClosedEditors = this.recentlyClosedEditors.filter((recentlyClosedEditor) => {
      if (isEditorInput(arg1) && recentlyClosedEditor.editorId !== arg1.editorId) {
        return true;
      }
      if (recentlyClosedEditor.resource && this.editorHelper.matchesFile(recentlyClosedEditor.resource, arg1)) {
        return false;
      }
      if (recentlyClosedEditor.associatedResources.some((associatedResource) => this.editorHelper.matchesFile(associatedResource, arg1))) {
        return false;
      }
      return true;
    });
    this.canReopenClosedEditorContextKey.set(this.recentlyClosedEditors.length > 0);
  }
  handleActiveEditorChangeInHistory(editorPane) {
    const editor = editorPane?.input;
    if (!editor || editor.isDisposed() || !this.includeInHistory(editor)) {
      return;
    }
    this.removeFromHistory(editor);
    this.addToHistory(editor);
  }
  addToHistory(editor, insertFirst = true) {
    this.ensureHistoryLoaded(this.history);
    const historyInput = this.editorHelper.preferResourceEditorInput(editor);
    if (!historyInput) {
      return;
    }
    if (insertFirst) {
      this.history.unshift(historyInput);
    } else {
      this.history.push(historyInput);
    }
    if (this.history.length > HistoryService.MAX_HISTORY_ITEMS) {
      this.editorHelper.clearOnEditorDispose(this.history.pop(), this.editorHistoryListeners);
    }
    if (isEditorInput(editor)) {
      this.editorHelper.onEditorDispose(editor, () => this.updateHistoryOnEditorDispose(historyInput), this.editorHistoryListeners);
    }
  }
  updateHistoryOnEditorDispose(editor) {
    if (isEditorInput(editor)) {
      if (!isSideBySideEditorInput(editor)) {
        this.removeFromHistory(editor);
      } else {
        const resourceInputs = [];
        const sideInputs = editor.primary.matches(editor.secondary) ? [editor.primary] : [editor.primary, editor.secondary];
        for (const sideInput of sideInputs) {
          const candidateResourceInput = this.editorHelper.preferResourceEditorInput(sideInput);
          if (isResourceEditorInput(candidateResourceInput) && this.includeInHistory(candidateResourceInput)) {
            resourceInputs.push(candidateResourceInput);
          }
        }
        this.replaceInHistory(editor, ...resourceInputs);
      }
    } else {
      if (!this.includeInHistory(editor)) {
        this.removeFromHistory(editor);
      }
    }
  }
  includeInHistory(editor) {
    if (isEditorInput(editor)) {
      return true;
    }
    return !this.resourceExcludeMatcher.value.matches(editor.resource);
  }
  removeExcludedFromHistory() {
    this.ensureHistoryLoaded(this.history);
    this.history = this.history.filter((entry) => {
      const include = this.includeInHistory(entry);
      if (!include) {
        this.editorHelper.clearOnEditorDispose(entry, this.editorHistoryListeners);
      }
      return include;
    });
  }
  moveInHistory(event) {
    if (event.isOperation(FileOperation.MOVE)) {
      const removed = this.removeFromHistory(event);
      if (removed) {
        this.addToHistory({ resource: event.target.resource });
      }
    }
  }
  removeFromHistory(arg1) {
    let removed = false;
    this.ensureHistoryLoaded(this.history);
    this.history = this.history.filter((entry) => {
      const matches = this.editorHelper.matchesEditor(arg1, entry);
      if (matches) {
        this.editorHelper.clearOnEditorDispose(arg1, this.editorHistoryListeners);
        removed = true;
      }
      return !matches;
    });
    return removed;
  }
  replaceInHistory(editor, ...replacements) {
    this.ensureHistoryLoaded(this.history);
    let replaced = false;
    const newHistory = [];
    for (const entry of this.history) {
      if (this.editorHelper.matchesEditor(editor, entry)) {
        this.editorHelper.clearOnEditorDispose(editor, this.editorHistoryListeners);
        if (!replaced) {
          newHistory.push(...replacements);
          replaced = true;
        }
      } else if (!replacements.some((replacement) => this.editorHelper.matchesEditor(replacement, entry))) {
        newHistory.push(entry);
      }
    }
    if (!replaced) {
      newHistory.push(...replacements);
    }
    this.history = newHistory;
  }
  clearRecentlyOpened() {
    this.history = [];
    this.editorHistoryListeners.clearAndDisposeAll();
  }
  getHistory() {
    this.ensureHistoryLoaded(this.history);
    return this.history;
  }
  ensureHistoryLoaded(history) {
    if (!this.history) {
      this.history = [];
      if (this.editorGroupService.isReady) {
        this.loadHistory();
      } else {
        (async () => {
          await this.editorGroupService.whenReady;
          this.loadHistory();
        })();
      }
    }
  }
  loadHistory() {
    this.history = [];
    const storedEditorHistory = this.loadHistoryFromStorage();
    const openedEditorsLru = [...this.editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)].reverse();
    const handledEditors = /* @__PURE__ */ new Set();
    for (const { editor } of openedEditorsLru) {
      if (!this.includeInHistory(editor)) {
        continue;
      }
      if (editor.resource) {
        const historyEntryId = `${editor.resource.toString()}/${editor.editorId}`;
        if (handledEditors.has(historyEntryId)) {
          continue;
        }
        handledEditors.add(historyEntryId);
      }
      this.addToHistory(editor);
    }
    for (const editor of storedEditorHistory) {
      const historyEntryId = `${editor.resource.toString()}/${editor.options?.override}`;
      if (!handledEditors.has(historyEntryId) && this.includeInHistory(editor)) {
        handledEditors.add(historyEntryId);
        this.addToHistory(
          editor,
          false
          /* at the end */
        );
      }
    }
  }
  loadHistoryFromStorage() {
    const entries = [];
    const entriesRaw = this.storageService.get(HistoryService.HISTORY_STORAGE_KEY, StorageScope.WORKSPACE);
    if (entriesRaw) {
      try {
        const entriesParsed = JSON.parse(entriesRaw);
        for (const entryParsed of entriesParsed) {
          if (!entryParsed.editor || !entryParsed.editor.resource) {
            continue;
          }
          try {
            entries.push({
              ...entryParsed.editor,
              resource: typeof entryParsed.editor.resource === "string" ? URI.parse(entryParsed.editor.resource) : (
                //  from 1.67.x: URI is stored efficiently as URI.toString()
                URI.from(entryParsed.editor.resource)
              )
              // until 1.66.x: URI was stored very verbose as URI.toJSON()
            });
          } catch (error) {
            onUnexpectedError(error);
          }
        }
      } catch (error) {
        onUnexpectedError(error);
      }
    }
    return entries;
  }
  saveState() {
    if (!this.history) {
      return;
    }
    const entries = [];
    for (const editor of this.history) {
      if (isEditorInput(editor) || !isResourceEditorInput(editor)) {
        continue;
      }
      entries.push({
        editor: {
          ...editor,
          resource: editor.resource.toString()
        }
      });
    }
    this.storageService.store(HistoryService.HISTORY_STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  //#endregion
  //#region Last Active Workspace/File
  getLastActiveWorkspaceRoot(schemeFilter, authorityFilter) {
    const folders = this.contextService.getWorkspace().folders;
    if (folders.length === 0) {
      return void 0;
    }
    if (folders.length === 1) {
      const resource = folders[0].uri;
      if ((!schemeFilter || resource.scheme === schemeFilter) && (!authorityFilter || resource.authority === authorityFilter)) {
        return resource;
      }
      return void 0;
    }
    for (const input of this.getHistory()) {
      if (isEditorInput(input)) {
        continue;
      }
      if (schemeFilter && input.resource.scheme !== schemeFilter) {
        continue;
      }
      if (authorityFilter && input.resource.authority !== authorityFilter) {
        continue;
      }
      const resourceWorkspace = this.contextService.getWorkspaceFolder(input.resource);
      if (resourceWorkspace) {
        return resourceWorkspace.uri;
      }
    }
    for (const folder of folders) {
      const resource = folder.uri;
      if ((!schemeFilter || resource.scheme === schemeFilter) && (!authorityFilter || resource.authority === authorityFilter)) {
        return resource;
      }
    }
    return void 0;
  }
  getLastActiveFile(filterByScheme, filterByAuthority) {
    for (const input of this.getHistory()) {
      let resource;
      if (isEditorInput(input)) {
        resource = EditorResourceAccessor.getOriginalUri(input, { filterByScheme });
      } else {
        resource = input.resource;
      }
      if (resource && resource.scheme === filterByScheme && (!filterByAuthority || resource.authority === filterByAuthority)) {
        return resource;
      }
    }
    return void 0;
  }
  //#endregion
  dispose() {
    super.dispose();
    for (const [, stack] of this.editorGroupScopedNavigationStacks) {
      stack.disposable.dispose();
    }
    for (const [, editors] of this.editorScopedNavigationStacks) {
      for (const [, stack] of editors) {
        stack.disposable.dispose();
      }
    }
    for (const [, listener] of this.editorHistoryListeners) {
      listener.dispose();
    }
  }
};
HistoryService.NAVIGATION_SCOPE_SETTING = "workbench.editor.navigationScope";
//#endregion
//#region File: Reopen Closed Editor (limit: 20)
HistoryService.MAX_RECENTLY_CLOSED_EDITORS = 20;
//#endregion
//#region Go to: Recently Opened Editor (limit: 200, persisted)
HistoryService.MAX_HISTORY_ITEMS = 200;
HistoryService.HISTORY_STORAGE_KEY = "history.entries";
HistoryService = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IWorkspacesService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, ILogService)
], HistoryService);
registerSingleton(IHistoryService, HistoryService, InstantiationType.Eager);
class EditorSelectionState {
  constructor(editorIdentifier, selection, reason) {
    this.editorIdentifier = editorIdentifier;
    this.selection = selection;
    this.reason = reason;
  }
  justifiesNewNavigationEntry(other) {
    if (this.editorIdentifier.groupId !== other.editorIdentifier.groupId) {
      return true;
    }
    if (!this.editorIdentifier.editor.matches(other.editorIdentifier.editor)) {
      return true;
    }
    if (!this.selection || !other.selection) {
      return true;
    }
    const result = this.selection.compare(other.selection);
    if (result === EditorPaneSelectionCompareResult.SIMILAR && (other.reason === EditorPaneSelectionChangeReason.NAVIGATION || other.reason === EditorPaneSelectionChangeReason.JUMP)) {
      return true;
    }
    return result === EditorPaneSelectionCompareResult.DIFFERENT;
  }
}
let EditorNavigationStacks = class extends Disposable {
  constructor(scope, instantiationService) {
    super();
    this.scope = scope;
    this.instantiationService = instantiationService;
    this.selectionsStack = this._register(this.instantiationService.createInstance(EditorNavigationStack, GoFilter.NONE, this.scope));
    this.editsStack = this._register(this.instantiationService.createInstance(EditorNavigationStack, GoFilter.EDITS, this.scope));
    this.navigationsStack = this._register(this.instantiationService.createInstance(EditorNavigationStack, GoFilter.NAVIGATION, this.scope));
    this.stacks = [
      this.selectionsStack,
      this.editsStack,
      this.navigationsStack
    ];
    this.onDidChange = Event.any(
      this.selectionsStack.onDidChange,
      this.editsStack.onDidChange,
      this.navigationsStack.onDidChange
    );
  }
  canGoForward(filter) {
    return this.getStack(filter).canGoForward();
  }
  goForward(filter) {
    return this.getStack(filter).goForward();
  }
  canGoBack(filter) {
    return this.getStack(filter).canGoBack();
  }
  goBack(filter) {
    return this.getStack(filter).goBack();
  }
  goPrevious(filter) {
    return this.getStack(filter).goPrevious();
  }
  canGoLast(filter) {
    return this.getStack(filter).canGoLast();
  }
  goLast(filter) {
    return this.getStack(filter).goLast();
  }
  getStack(filter = GoFilter.NONE) {
    switch (filter) {
      case GoFilter.NONE:
        return this.selectionsStack;
      case GoFilter.EDITS:
        return this.editsStack;
      case GoFilter.NAVIGATION:
        return this.navigationsStack;
    }
  }
  handleActiveEditorChange(editorPane) {
    this.selectionsStack.notifyNavigation(editorPane);
  }
  handleActiveEditorSelectionChange(editorPane, event) {
    const previous = this.selectionsStack.current;
    this.selectionsStack.notifyNavigation(editorPane, event);
    if (event.reason === EditorPaneSelectionChangeReason.EDIT) {
      this.editsStack.notifyNavigation(editorPane, event);
    } else if ((event.reason === EditorPaneSelectionChangeReason.NAVIGATION || event.reason === EditorPaneSelectionChangeReason.JUMP) && !this.selectionsStack.isNavigating()) {
      if (event.reason === EditorPaneSelectionChangeReason.JUMP && !this.navigationsStack.isNavigating()) {
        if (previous) {
          this.navigationsStack.addOrReplace(previous.groupId, previous.editor, previous.selection);
        }
      }
      this.navigationsStack.notifyNavigation(editorPane, event);
    }
  }
  clear() {
    for (const stack of this.stacks) {
      stack.clear();
    }
  }
  remove(arg1) {
    for (const stack of this.stacks) {
      stack.remove(arg1);
    }
  }
  move(event) {
    for (const stack of this.stacks) {
      stack.move(event);
    }
  }
};
EditorNavigationStacks = __decorateClass([
  __decorateParam(1, IInstantiationService)
], EditorNavigationStacks);
class NoOpEditorNavigationStacks {
  constructor() {
    this.onDidChange = Event.None;
  }
  canGoForward() {
    return false;
  }
  async goForward() {
  }
  canGoBack() {
    return false;
  }
  async goBack() {
  }
  async goPrevious() {
  }
  canGoLast() {
    return false;
  }
  async goLast() {
  }
  handleActiveEditorChange() {
  }
  handleActiveEditorSelectionChange() {
  }
  clear() {
  }
  remove() {
  }
  move() {
  }
  dispose() {
  }
}
let EditorNavigationStack = class extends Disposable {
  constructor(filter, scope, instantiationService, editorService, editorGroupService, logService) {
    super();
    this.filter = filter;
    this.scope = scope;
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.logService = logService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.mapEditorToDisposable = this._register(new DisposableMap());
    this.mapGroupToDisposable = this._register(new DisposableMap());
    this.stack = [];
    this.index = -1;
    this.previousIndex = -1;
    this.navigating = false;
    this.currentSelectionState = void 0;
    this.editorHelper = instantiationService.createInstance(EditorHelper);
    this.registerListeners();
  }
  get current() {
    return this.stack[this.index];
  }
  set current(entry) {
    if (entry) {
      this.stack[this.index] = entry;
    }
  }
  registerListeners() {
    this._register(this.onDidChange(() => this.traceStack()));
    this._register(this.logService.onDidChangeLogLevel(() => this.traceStack()));
    this._register(this.editorGroupService.onDidRemoveGroup((group) => {
      this.mapGroupToDisposable.deleteAndDispose(group.id);
    }));
  }
  traceStack() {
    if (this.logService.getLevel() !== LogLevel.Trace) {
      return;
    }
    const entryLabels = [];
    for (const entry of this.stack) {
      if (typeof entry.selection?.log === "function") {
        entryLabels.push(`- group: ${entry.groupId}, editor: ${entry.editor.resource?.toString()}, selection: ${entry.selection.log()}`);
      } else {
        entryLabels.push(`- group: ${entry.groupId}, editor: ${entry.editor.resource?.toString()}, selection: <none>`);
      }
    }
    if (entryLabels.length === 0) {
      this.trace(`index: ${this.index}, navigating: ${this.isNavigating()}: <empty>`);
    } else {
      this.trace(`index: ${this.index}, navigating: ${this.isNavigating()}
${entryLabels.join("\n")}
			`);
    }
  }
  trace(msg, editor = null, event) {
    if (this.logService.getLevel() !== LogLevel.Trace) {
      return;
    }
    let filterLabel;
    switch (this.filter) {
      case GoFilter.NONE:
        filterLabel = "global";
        break;
      case GoFilter.EDITS:
        filterLabel = "edits";
        break;
      case GoFilter.NAVIGATION:
        filterLabel = "navigation";
        break;
    }
    let scopeLabel;
    switch (this.scope) {
      case GoScope.DEFAULT:
        scopeLabel = "default";
        break;
      case GoScope.EDITOR_GROUP:
        scopeLabel = "editorGroup";
        break;
      case GoScope.EDITOR:
        scopeLabel = "editor";
        break;
    }
    if (editor !== null) {
      this.logService.trace(`[History stack ${filterLabel}-${scopeLabel}]: ${msg} (editor: ${editor?.resource?.toString()}, event: ${this.traceEvent(event)})`);
    } else {
      this.logService.trace(`[History stack ${filterLabel}-${scopeLabel}]: ${msg}`);
    }
  }
  traceEvent(event) {
    if (!event) {
      return "<none>";
    }
    switch (event.reason) {
      case EditorPaneSelectionChangeReason.EDIT:
        return "edit";
      case EditorPaneSelectionChangeReason.NAVIGATION:
        return "navigation";
      case EditorPaneSelectionChangeReason.JUMP:
        return "jump";
      case EditorPaneSelectionChangeReason.PROGRAMMATIC:
        return "programmatic";
      case EditorPaneSelectionChangeReason.USER:
        return "user";
    }
  }
  registerGroupListeners(groupId) {
    if (!this.mapGroupToDisposable.has(groupId)) {
      const group = this.editorGroupService.getGroup(groupId);
      if (group) {
        this.mapGroupToDisposable.set(groupId, group.onWillMoveEditor((e) => this.onWillMoveEditor(e)));
      }
    }
  }
  onWillMoveEditor(e) {
    this.trace("onWillMoveEditor()", e.editor);
    if (this.scope === GoScope.EDITOR_GROUP) {
      return;
    }
    for (const entry of this.stack) {
      if (entry.groupId !== e.groupId) {
        continue;
      }
      if (!this.editorHelper.matchesEditor(e.editor, entry.editor)) {
        continue;
      }
      entry.groupId = e.target;
    }
  }
  //#region Stack Mutation
  notifyNavigation(editorPane, event) {
    this.trace("notifyNavigation()", editorPane?.input, event);
    const isSelectionAwareEditorPane = isEditorPaneWithSelection(editorPane);
    const hasValidEditor = editorPane?.input && !editorPane.input.isDisposed();
    if (this.navigating) {
      this.trace(`notifyNavigation() ignoring (navigating)`, editorPane?.input, event);
      if (isSelectionAwareEditorPane && hasValidEditor) {
        this.trace("notifyNavigation() updating current selection state", editorPane?.input, event);
        this.currentSelectionState = new EditorSelectionState({ groupId: editorPane.group.id, editor: editorPane.input }, editorPane.getSelection(), event?.reason);
      } else {
        this.trace("notifyNavigation() dropping current selection state", editorPane?.input, event);
        this.currentSelectionState = void 0;
      }
    } else {
      this.trace(`notifyNavigation() not ignoring`, editorPane?.input, event);
      if (isSelectionAwareEditorPane && hasValidEditor) {
        this.onSelectionAwareEditorNavigation(editorPane.group.id, editorPane.input, editorPane.getSelection(), event);
      } else {
        this.currentSelectionState = void 0;
        if (hasValidEditor) {
          this.onNonSelectionAwareEditorNavigation(editorPane.group.id, editorPane.input);
        }
      }
    }
  }
  onSelectionAwareEditorNavigation(groupId, editor, selection, event) {
    if (this.current?.groupId === groupId && !selection && this.editorHelper.matchesEditor(this.current.editor, editor)) {
      return;
    }
    this.trace("onSelectionAwareEditorNavigation()", editor, event);
    const stateCandidate = new EditorSelectionState({ groupId, editor }, selection, event?.reason);
    if (!this.currentSelectionState || this.currentSelectionState.justifiesNewNavigationEntry(stateCandidate)) {
      this.doAdd(groupId, editor, stateCandidate.selection);
    } else {
      this.doReplace(groupId, editor, stateCandidate.selection);
    }
    this.currentSelectionState = stateCandidate;
  }
  onNonSelectionAwareEditorNavigation(groupId, editor) {
    if (this.current?.groupId === groupId && this.editorHelper.matchesEditor(this.current.editor, editor)) {
      return;
    }
    this.trace("onNonSelectionAwareEditorNavigation()", editor);
    this.doAdd(groupId, editor);
  }
  doAdd(groupId, editor, selection) {
    if (!this.navigating) {
      this.addOrReplace(groupId, editor, selection);
    }
  }
  doReplace(groupId, editor, selection) {
    if (!this.navigating) {
      this.addOrReplace(
        groupId,
        editor,
        selection,
        true
        /* force replace */
      );
    }
  }
  addOrReplace(groupId, editorCandidate, selection, forceReplace) {
    this.registerGroupListeners(groupId);
    let replace = false;
    if (this.current) {
      if (forceReplace) {
        replace = true;
      } else if (this.shouldReplaceStackEntry(this.current, { groupId, editor: editorCandidate, selection })) {
        replace = true;
      }
    }
    const editor = this.editorHelper.preferResourceEditorInput(editorCandidate);
    if (!editor) {
      return;
    }
    if (replace) {
      this.trace("replace()", editor);
    } else {
      this.trace("add()", editor);
    }
    const newStackEntry = { groupId, editor, selection };
    const removedEntries = [];
    if (replace) {
      if (this.current) {
        removedEntries.push(this.current);
      }
      this.current = newStackEntry;
    } else {
      if (this.stack.length > this.index + 1) {
        for (let i = this.index + 1; i < this.stack.length; i++) {
          removedEntries.push(this.stack[i]);
        }
        this.stack = this.stack.slice(0, this.index + 1);
      }
      this.stack.splice(this.index + 1, 0, newStackEntry);
      if (this.stack.length > EditorNavigationStack.MAX_STACK_SIZE) {
        removedEntries.push(this.stack.shift());
        if (this.previousIndex >= 0) {
          this.previousIndex--;
        }
      } else {
        this.setIndex(
          this.index + 1,
          true
          /* skip event, we fire it later */
        );
      }
    }
    for (const removedEntry of removedEntries) {
      this.editorHelper.clearOnEditorDispose(removedEntry.editor, this.mapEditorToDisposable);
    }
    if (isEditorInput(editor)) {
      this.editorHelper.onEditorDispose(editor, () => this.remove(editor), this.mapEditorToDisposable);
    }
    this._onDidChange.fire();
  }
  shouldReplaceStackEntry(entry, candidate) {
    if (entry.groupId !== candidate.groupId) {
      return false;
    }
    if (!this.editorHelper.matchesEditor(entry.editor, candidate.editor)) {
      return false;
    }
    if (!entry.selection) {
      return true;
    }
    if (!candidate.selection) {
      return false;
    }
    return entry.selection.compare(candidate.selection) === EditorPaneSelectionCompareResult.IDENTICAL;
  }
  move(event) {
    if (event.isOperation(FileOperation.MOVE)) {
      for (const entry of this.stack) {
        if (this.editorHelper.matchesEditor(event, entry.editor)) {
          entry.editor = { resource: event.target.resource };
        }
      }
    }
  }
  remove(arg1) {
    const previousStackSize = this.stack.length;
    this.stack = this.stack.filter((entry) => {
      const matches = typeof arg1 === "number" ? entry.groupId === arg1 : this.editorHelper.matchesEditor(arg1, entry.editor);
      if (matches) {
        this.editorHelper.clearOnEditorDispose(entry.editor, this.mapEditorToDisposable);
      }
      return !matches;
    });
    if (previousStackSize === this.stack.length) {
      return;
    }
    this.flatten();
    this.index = this.stack.length - 1;
    this.previousIndex = -1;
    if (typeof arg1 === "number") {
      this.mapGroupToDisposable.deleteAndDispose(arg1);
    }
    this._onDidChange.fire();
  }
  flatten() {
    const flattenedStack = [];
    let previousEntry = void 0;
    for (const entry of this.stack) {
      if (previousEntry && this.shouldReplaceStackEntry(entry, previousEntry)) {
        continue;
      }
      previousEntry = entry;
      flattenedStack.push(entry);
    }
    this.stack = flattenedStack;
  }
  clear() {
    this.index = -1;
    this.previousIndex = -1;
    this.stack.splice(0);
    this.mapEditorToDisposable.clearAndDisposeAll();
    this.mapGroupToDisposable.clearAndDisposeAll();
  }
  dispose() {
    this.clear();
    super.dispose();
  }
  //#endregion
  //#region Navigation
  canGoForward() {
    return this.stack.length > this.index + 1;
  }
  async goForward() {
    const navigated = await this.maybeGoCurrent();
    if (navigated) {
      return;
    }
    if (!this.canGoForward()) {
      return;
    }
    this.setIndex(this.index + 1);
    return this.navigate();
  }
  canGoBack() {
    return this.index > 0;
  }
  async goBack() {
    const navigated = await this.maybeGoCurrent();
    if (navigated) {
      return;
    }
    if (!this.canGoBack()) {
      return;
    }
    this.setIndex(this.index - 1);
    return this.navigate();
  }
  async goPrevious() {
    const navigated = await this.maybeGoCurrent();
    if (navigated) {
      return;
    }
    if (this.previousIndex === -1) {
      return this.goBack();
    }
    this.setIndex(this.previousIndex);
    return this.navigate();
  }
  canGoLast() {
    return this.stack.length > 0;
  }
  async goLast() {
    if (!this.canGoLast()) {
      return;
    }
    this.setIndex(this.stack.length - 1);
    return this.navigate();
  }
  async maybeGoCurrent() {
    if (this.filter === GoFilter.NONE) {
      return false;
    }
    if (this.isCurrentSelectionActive()) {
      return false;
    }
    await this.navigate();
    return true;
  }
  isCurrentSelectionActive() {
    if (!this.current?.selection) {
      return false;
    }
    const pane = this.editorService.activeEditorPane;
    if (!isEditorPaneWithSelection(pane)) {
      return false;
    }
    if (pane.group.id !== this.current.groupId) {
      return false;
    }
    if (!pane.input || !this.editorHelper.matchesEditor(pane.input, this.current.editor)) {
      return false;
    }
    const paneSelection = pane.getSelection();
    if (!paneSelection) {
      return false;
    }
    return paneSelection.compare(this.current.selection) === EditorPaneSelectionCompareResult.IDENTICAL;
  }
  setIndex(newIndex, skipEvent) {
    this.previousIndex = this.index;
    this.index = newIndex;
    if (!skipEvent) {
      this._onDidChange.fire();
    }
  }
  async navigate() {
    this.navigating = true;
    try {
      if (this.current) {
        await this.doNavigate(this.current);
      }
    } finally {
      this.navigating = false;
    }
  }
  doNavigate(location) {
    let options = /* @__PURE__ */ Object.create(null);
    if (location.selection) {
      options = location.selection.restore(options);
    }
    if (isEditorInput(location.editor)) {
      return this.editorService.openEditor(location.editor, options, location.groupId);
    }
    return this.editorService.openEditor({
      ...location.editor,
      options: {
        ...location.editor.options,
        ...options
      }
    }, location.groupId);
  }
  isNavigating() {
    return this.navigating;
  }
  //#endregion
};
EditorNavigationStack.MAX_STACK_SIZE = 50;
EditorNavigationStack = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, ILogService)
], EditorNavigationStack);
let EditorHelper = class {
  constructor(uriIdentityService, lifecycleService, fileService, pathService) {
    this.uriIdentityService = uriIdentityService;
    this.lifecycleService = lifecycleService;
    this.fileService = fileService;
    this.pathService = pathService;
  }
  preferResourceEditorInput(editor) {
    const resource = EditorResourceAccessor.getOriginalUri(editor);
    const hasValidResourceEditorInputScheme = resource?.scheme === Schemas.file || resource?.scheme === Schemas.vscodeRemote || resource?.scheme === Schemas.vscodeUserData || resource?.scheme === this.pathService.defaultUriScheme;
    if (hasValidResourceEditorInputScheme) {
      if (isEditorInput(editor)) {
        const untypedInput = editor.toUntyped();
        if (isResourceEditorInput(untypedInput)) {
          return untypedInput;
        }
      }
      return editor;
    } else {
      return isEditorInput(editor) ? editor : void 0;
    }
  }
  matchesEditor(arg1, inputB) {
    if (arg1 instanceof FileChangesEvent || arg1 instanceof FileOperationEvent) {
      if (isEditorInput(inputB)) {
        return false;
      }
      if (arg1 instanceof FileChangesEvent) {
        return arg1.contains(inputB.resource, FileChangeType.DELETED);
      }
      return this.matchesFile(inputB.resource, arg1);
    }
    if (isEditorInput(arg1)) {
      if (isEditorInput(inputB)) {
        return arg1.matches(inputB);
      }
      return this.matchesFile(inputB.resource, arg1);
    }
    if (isEditorInput(inputB)) {
      return this.matchesFile(arg1.resource, inputB);
    }
    return arg1 && inputB && this.uriIdentityService.extUri.isEqual(arg1.resource, inputB.resource);
  }
  matchesFile(resource, arg2) {
    if (arg2 instanceof FileChangesEvent) {
      return arg2.contains(resource, FileChangeType.DELETED);
    }
    if (arg2 instanceof FileOperationEvent) {
      return this.uriIdentityService.extUri.isEqualOrParent(resource, arg2.resource);
    }
    if (isEditorInput(arg2)) {
      const inputResource = arg2.resource;
      if (!inputResource) {
        return false;
      }
      if (this.lifecycleService.phase >= LifecyclePhase.Restored && !this.fileService.hasProvider(inputResource)) {
        return false;
      }
      return this.uriIdentityService.extUri.isEqual(inputResource, resource);
    }
    return this.uriIdentityService.extUri.isEqual(arg2?.resource, resource);
  }
  matchesEditorIdentifier(identifier, editorPane) {
    if (!editorPane?.group) {
      return false;
    }
    if (identifier.groupId !== editorPane.group.id) {
      return false;
    }
    return editorPane.input ? identifier.editor.matches(editorPane.input) : false;
  }
  onEditorDispose(editor, listener, mapEditorToDispose) {
    const toDispose = Event.once(editor.onWillDispose)(() => {
      mapEditorToDispose.deleteAndDispose(editor);
      listener();
    });
    let disposables = mapEditorToDispose.get(editor);
    if (!disposables) {
      disposables = new DisposableStore();
      mapEditorToDispose.set(editor, disposables);
    }
    disposables.add(toDispose);
  }
  clearOnEditorDispose(editor, mapEditorToDispose) {
    if (!isEditorInput(editor)) {
      return;
    }
    mapEditorToDispose.deleteAndDispose(editor);
  }
};
EditorHelper = __decorateClass([
  __decorateParam(0, IUriIdentityService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IPathService)
], EditorHelper);
export {
  EditorNavigationStack,
  HistoryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxoaXN0b3J5XFxicm93c2VyXFxoaXN0b3J5U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZSwgSUVkaXRvckNsb3NlRXZlbnQsIEVkaXRvclJlc291cmNlQWNjZXNzb3IsIElFZGl0b3JJZGVudGlmaWVyLCBHcm91cElkZW50aWZpZXIsIEVkaXRvcnNPcmRlciwgU2lkZUJ5U2lkZUVkaXRvciwgSVVudHlwZWRFZGl0b3JJbnB1dCwgaXNSZXNvdXJjZUVkaXRvcklucHV0LCBpc0VkaXRvcklucHV0LCBpc1NpZGVCeVNpZGVFZGl0b3JJbnB1dCwgRWRpdG9yQ2xvc2VDb250ZXh0LCBJRWRpdG9yUGFuZVNlbGVjdGlvbiwgRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQsIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24sIGlzRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24sIElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQsIElFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbiwgSUVkaXRvcldpbGxNb3ZlRXZlbnQsIEdyb3VwTW9kZWxDaGFuZ2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR29GaWx0ZXIsIEdvU2NvcGUsIElIaXN0b3J5U2VydmljZSwgTU9VU0VfQkFDS19GT1JXQVJEX05BVklHQVRJT05fU0VUVElORyB9IGZyb20gJy4uL2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VzRXZlbnQsIElGaWxlU2VydmljZSwgRmlsZUNoYW5nZVR5cGUsIEZJTEVTX0VYQ0xVREVfQ09ORklHLCBGaWxlT3BlcmF0aW9uRXZlbnQsIEZpbGVPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RXhjbHVkZXMsIElTZWFyY2hDb25maWd1cmF0aW9uLCBTRUFSQ0hfRVhDTFVERV9DT05GSUcgfSBmcm9tICcuLi8uLi9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvclNlcnZpY2VJbXBsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBFdmVudEhlbHBlciwgV2luZG93SWRsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFJlc291cmNlR2xvYk1hdGNoZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRFZGl0b3JIaXN0b3J5RW50cnkge1xuXHRyZWFkb25seSBlZGl0b3I6IE9taXQ8SVJlc291cmNlRWRpdG9ySW5wdXQsICdyZXNvdXJjZSc+ICYgeyByZXNvdXJjZTogc3RyaW5nIH07XG59XG5cbmludGVyZmFjZSBJUmVjZW50bHlDbG9zZWRFZGl0b3Ige1xuXHRyZWFkb25seSBlZGl0b3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBlZGl0b3I6IElVbnR5cGVkRWRpdG9ySW5wdXQ7XG5cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYXNzb2NpYXRlZFJlc291cmNlczogVVJJW107XG5cblx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgc3RpY2t5OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJZGVudGlmaWVzIHRoZSBiYXRjaCBvZiBlZGl0b3JzIHRoYXQgd2VyZSBjbG9zZWQgdG9nZXRoZXIgKGUuZy4gdmlhXG5cdCAqIFwiQ2xvc2UgQWxsIEVkaXRvcnNcIiBvciBcIkNsb3NlIE90aGVyc1wiKS4gRWRpdG9ycyBzaGFyaW5nIHRoZSBzYW1lIGJhdGNoXG5cdCAqIGlkZW50aWZpZXIgYXJlIHJlb3BlbmVkIHRvZ2V0aGVyIGJ5IFwiUmVvcGVuIENsb3NlZCBFZGl0b3JcIi5cblx0ICovXG5cdHJlYWRvbmx5IGJhdGNoSWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEhpc3RvcnlTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElIaXN0b3J5U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTkFWSUdBVElPTl9TQ09QRV9TRVRUSU5HID0gJ3dvcmtiZW5jaC5lZGl0b3IubmF2aWdhdGlvblNjb3BlJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZUVkaXRvckxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgbGFzdEFjdGl2ZUVkaXRvcjogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JIZWxwZXI6IEVkaXRvckhlbHBlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBFZGl0b3JTZXJ2aWNlSW1wbCxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VzU2VydmljZTogSVdvcmtzcGFjZXNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVkaXRvckhlbHBlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9ySGVscGVyKTtcblxuXHRcdHRoaXMuY2FuTmF2aWdhdGVCYWNrQ29udGV4dEtleSA9IChuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2FuTmF2aWdhdGVCYWNrJywgZmFsc2UsIGxvY2FsaXplKCdjYW5OYXZpZ2F0ZUJhY2snLCBcIldoZXRoZXIgaXQgaXMgcG9zc2libGUgdG8gbmF2aWdhdGUgYmFjayBpbiBlZGl0b3IgaGlzdG9yeVwiKSkpLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNhbk5hdmlnYXRlRm9yd2FyZENvbnRleHRLZXkgPSAobmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Nhbk5hdmlnYXRlRm9yd2FyZCcsIGZhbHNlLCBsb2NhbGl6ZSgnY2FuTmF2aWdhdGVGb3J3YXJkJywgXCJXaGV0aGVyIGl0IGlzIHBvc3NpYmxlIHRvIG5hdmlnYXRlIGZvcndhcmQgaW4gZWRpdG9yIGhpc3RvcnlcIikpKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmNhbk5hdmlnYXRlQmFja0luTmF2aWdhdGlvbnNDb250ZXh0S2V5ID0gKG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjYW5OYXZpZ2F0ZUJhY2tJbk5hdmlnYXRpb25Mb2NhdGlvbnMnLCBmYWxzZSwgbG9jYWxpemUoJ2Nhbk5hdmlnYXRlQmFja0luTmF2aWdhdGlvbkxvY2F0aW9ucycsIFwiV2hldGhlciBpdCBpcyBwb3NzaWJsZSB0byBuYXZpZ2F0ZSBiYWNrIGluIGVkaXRvciBuYXZpZ2F0aW9uIGxvY2F0aW9ucyBoaXN0b3J5XCIpKSkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY2FuTmF2aWdhdGVGb3J3YXJkSW5OYXZpZ2F0aW9uc0NvbnRleHRLZXkgPSAobmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Nhbk5hdmlnYXRlRm9yd2FyZEluTmF2aWdhdGlvbkxvY2F0aW9ucycsIGZhbHNlLCBsb2NhbGl6ZSgnY2FuTmF2aWdhdGVGb3J3YXJkSW5OYXZpZ2F0aW9uTG9jYXRpb25zJywgXCJXaGV0aGVyIGl0IGlzIHBvc3NpYmxlIHRvIG5hdmlnYXRlIGZvcndhcmQgaW4gZWRpdG9yIG5hdmlnYXRpb24gbG9jYXRpb25zIGhpc3RvcnlcIikpKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jYW5OYXZpZ2F0ZVRvTGFzdE5hdmlnYXRpb25Mb2NhdGlvbkNvbnRleHRLZXkgPSAobmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Nhbk5hdmlnYXRlVG9MYXN0TmF2aWdhdGlvbkxvY2F0aW9uJywgZmFsc2UsIGxvY2FsaXplKCdjYW5OYXZpZ2F0ZVRvTGFzdE5hdmlnYXRpb25Mb2NhdGlvbicsIFwiV2hldGhlciBpdCBpcyBwb3NzaWJsZSB0byBuYXZpZ2F0ZSB0byB0aGUgbGFzdCBlZGl0b3IgbmF2aWdhdGlvbiBsb2NhdGlvblwiKSkpLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuY2FuTmF2aWdhdGVCYWNrSW5FZGl0c0NvbnRleHRLZXkgPSAobmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Nhbk5hdmlnYXRlQmFja0luRWRpdExvY2F0aW9ucycsIGZhbHNlLCBsb2NhbGl6ZSgnY2FuTmF2aWdhdGVCYWNrSW5FZGl0TG9jYXRpb25zJywgXCJXaGV0aGVyIGl0IGlzIHBvc3NpYmxlIHRvIG5hdmlnYXRlIGJhY2sgaW4gZWRpdG9yIGVkaXQgbG9jYXRpb25zIGhpc3RvcnlcIikpKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jYW5OYXZpZ2F0ZUZvcndhcmRJbkVkaXRzQ29udGV4dEtleSA9IChuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2FuTmF2aWdhdGVGb3J3YXJkSW5FZGl0TG9jYXRpb25zJywgZmFsc2UsIGxvY2FsaXplKCdjYW5OYXZpZ2F0ZUZvcndhcmRJbkVkaXRMb2NhdGlvbnMnLCBcIldoZXRoZXIgaXQgaXMgcG9zc2libGUgdG8gbmF2aWdhdGUgZm9yd2FyZCBpbiBlZGl0b3IgZWRpdCBsb2NhdGlvbnMgaGlzdG9yeVwiKSkpLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNhbk5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uQ29udGV4dEtleSA9IChuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY2FuTmF2aWdhdGVUb0xhc3RFZGl0TG9jYXRpb24nLCBmYWxzZSwgbG9jYWxpemUoJ2Nhbk5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uJywgXCJXaGV0aGVyIGl0IGlzIHBvc3NpYmxlIHRvIG5hdmlnYXRlIHRvIHRoZSBsYXN0IGVkaXRvciBlZGl0IGxvY2F0aW9uXCIpKSkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jYW5SZW9wZW5DbG9zZWRFZGl0b3JDb250ZXh0S2V5ID0gKG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjYW5SZW9wZW5DbG9zZWRFZGl0b3InLCBmYWxzZSwgbG9jYWxpemUoJ2NhblJlb3BlbkNsb3NlZEVkaXRvcicsIFwiV2hldGhlciBpdCBpcyBwb3NzaWJsZSB0byByZW9wZW4gdGhlIGxhc3QgY2xvc2VkIGVkaXRvclwiKSkpLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblxuXHRcdC8vIGlmIHRoZSBzZXJ2aWNlIGlzIGNyZWF0ZWQgbGF0ZSBlbm91Z2ggdGhhdCBhbiBlZGl0b3IgaXMgYWxyZWFkeSBvcGVuZWRcblx0XHQvLyBtYWtlIHN1cmUgdG8gdHJpZ2dlciB0aGUgb25BY3RpdmVFZGl0b3JDaGFuZ2VkKCkgdG8gdHJhY2sgdGhlIGVkaXRvclxuXHRcdC8vIHByb3Blcmx5IChmaXhlcyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNTk5MDgpXG5cdFx0aWYgKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHR0aGlzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIE1vdXNlIGJhY2svZm9yd2FyZCBzdXBwb3J0XG5cdFx0dGhpcy5yZWdpc3Rlck1vdXNlTmF2aWdhdGlvbkxpc3RlbmVyKCk7XG5cblx0XHQvLyBFZGl0b3IgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB0aGlzLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRPcGVuRWRpdG9yRmFpbChldmVudCA9PiB0aGlzLnJlbW92ZShldmVudC5lZGl0b3IpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQ2xvc2VFZGl0b3IoZXZlbnQgPT4gdGhpcy5vbkRpZENsb3NlRWRpdG9yKGV2ZW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZE1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnNDaGFuZ2UoKCkgPT4gdGhpcy5oYW5kbGVFZGl0b3JFdmVudEluUmVjZW50RWRpdG9yc1N0YWNrKCkpKTtcblxuXHRcdC8vIEVkaXRvciBncm91cCBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uub25EaWRSZW1vdmVHcm91cChlID0+IHRoaXMub25EaWRSZW1vdmVHcm91cChlKSkpO1xuXG5cdFx0Ly8gRmlsZSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGV2ZW50ID0+IHRoaXMub25EaWRGaWxlc0NoYW5nZShldmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGV2ZW50ID0+IHRoaXMub25EaWRGaWxlc0NoYW5nZShldmVudCkpKTtcblxuXHRcdC8vIFN0b3JhZ2Vcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB0aGlzLnNhdmVTdGF0ZSgpKSk7XG5cblx0XHQvLyBDb25maWd1cmF0aW9uXG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvck5hdmlnYXRpb25TY29wZUNoYW5nZUxpc3RlbmVyKCk7XG5cblx0XHQvLyBDb250ZXh0IGtleXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yTmF2aWdhdGlvblN0YWNrKCgpID0+IHRoaXMudXBkYXRlQ29udGV4dEtleXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAoKCkgPT4gdGhpcy51cGRhdGVDb250ZXh0S2V5cygpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2xvc2VFZGl0b3IoZTogSUVkaXRvckNsb3NlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmhhbmRsZUVkaXRvckNsb3NlRXZlbnRJbkhpc3RvcnkoZSk7XG5cdFx0dGhpcy5oYW5kbGVFZGl0b3JDbG9zZUV2ZW50SW5SZW9wZW4oZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTW91c2VOYXZpZ2F0aW9uTGlzdGVuZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW91c2VCYWNrRm9yd2FyZFN1cHBvcnRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaGFuZGxlTW91c2VCYWNrRm9yd2FyZFN1cHBvcnQgPSAoKSA9PiB7XG5cdFx0XHRtb3VzZUJhY2tGb3J3YXJkU3VwcG9ydExpc3RlbmVyLmNsZWFyKCk7XG5cblx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE1PVVNFX0JBQ0tfRk9SV0FSRF9OQVZJR0FUSU9OX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLmxheW91dFNlcnZpY2Uub25EaWRBZGRDb250YWluZXIsICh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZXMgfSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV2ZW50RGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRcdFx0XHRldmVudERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgZSA9PiB0aGlzLm9uTW91c2VEb3duT3JVcChlLCB0cnVlKSkpO1xuXHRcdFx0XHRcdGV2ZW50RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9VUCwgZSA9PiB0aGlzLm9uTW91c2VEb3duT3JVcChlLCBmYWxzZSkpKTtcblxuXHRcdFx0XHRcdG1vdXNlQmFja0ZvcndhcmRTdXBwb3J0TGlzdGVuZXIuYWRkKGV2ZW50RGlzcG9zYWJsZXMpO1xuXHRcdFx0XHR9LCB7IGNvbnRhaW5lcjogdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIsIGRpc3Bvc2FibGVzOiB0aGlzLl9zdG9yZSB9KSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihNT1VTRV9CQUNLX0ZPUldBUkRfTkFWSUdBVElPTl9TRVRUSU5HKSkge1xuXHRcdFx0XHRoYW5kbGVNb3VzZUJhY2tGb3J3YXJkU3VwcG9ydCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGhhbmRsZU1vdXNlQmFja0ZvcndhcmRTdXBwb3J0KCk7XG5cdH1cblxuXHRwcml2YXRlIG9uTW91c2VEb3duT3JVcChldmVudDogTW91c2VFdmVudCwgaXNNb3VzZURvd246IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIFN1cHBvcnQgdG8gbmF2aWdhdGUgaW4gaGlzdG9yeSB3aGVuIG1vdXNlIGJ1dHRvbnMgNC81IGFyZSBwcmVzc2VkXG5cdFx0Ly8gV2Ugd2FudCB0byB0cmlnZ2VyIHRoaXMgb24gbW91c2UgZG93biBmb3IgYSBmYXN0ZXIgZXhwZXJpZW5jZVxuXHRcdC8vIGJ1dCB3ZSBhbHNvIG5lZWQgdG8gcHJldmVudCBtb3VzZSB1cCBmcm9tIHRyaWdnZXJpbmcgdGhlIGRlZmF1bHRcblx0XHQvLyB3aGljaCBpcyB0byBuYXZpZ2F0ZSBpbiB0aGUgYnJvd3NlciBoaXN0b3J5LlxuXG5cdFx0c3dpdGNoIChldmVudC5idXR0b24pIHtcblx0XHRcdGNhc2UgMzpcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChldmVudCk7XG5cdFx0XHRcdGlmIChpc01vdXNlRG93bikge1xuXHRcdFx0XHRcdHRoaXMuZ29CYWNrKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIDQ6XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZXZlbnQpO1xuXHRcdFx0XHRpZiAoaXNNb3VzZURvd24pIHtcblx0XHRcdFx0XHR0aGlzLmdvRm9yd2FyZCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFJlbW92ZUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXApOiB2b2lkIHtcblx0XHR0aGlzLmhhbmRsZUVkaXRvckdyb3VwUmVtb3ZlSW5OYXZpZ2F0aW9uU3RhY2tzKGdyb3VwKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yR3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gYWN0aXZlRWRpdG9yR3JvdXAuYWN0aXZlRWRpdG9yUGFuZTtcblxuXHRcdGlmICh0aGlzLmxhc3RBY3RpdmVFZGl0b3IgJiYgdGhpcy5lZGl0b3JIZWxwZXIubWF0Y2hlc0VkaXRvcklkZW50aWZpZXIodGhpcy5sYXN0QWN0aXZlRWRpdG9yLCBhY3RpdmVFZGl0b3JQYW5lKSkge1xuXHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gaWYgdGhlIGFjdGl2ZSBlZGl0b3IgaXMgc3RpbGwgdGhlIHNhbWVcblx0XHR9XG5cblx0XHQvLyBSZW1lbWJlciBhcyBsYXN0IGFjdGl2ZSBlZGl0b3IgKGNhbiBiZSB1bmRlZmluZWQgaWYgbm9uZSBvcGVuZWQpXG5cdFx0dGhpcy5sYXN0QWN0aXZlRWRpdG9yID0gYWN0aXZlRWRpdG9yUGFuZT8uaW5wdXQgPyB7IGVkaXRvcjogYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCwgZ3JvdXBJZDogYWN0aXZlRWRpdG9yUGFuZS5ncm91cC5pZCB9IDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRGlzcG9zZSBvbGQgbGlzdGVuZXJzXG5cdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuY2xlYXIoKTtcblxuXHRcdC8vIEhhbmRsZSBlZGl0b3IgY2hhbmdlIHVubGVzcyB0aGUgZWRpdG9yIGlzIHRyYW5zaWVudC4gSW4gdGhhdCBjYXNlXG5cdFx0Ly8gc2V0dXAgYSBsaXN0ZW5lciB0byBzZWUgaWYgdGhlIHRyYW5zaWVudCBlZGl0b3IgYmVjb21lcyBub24tdHJhbnNpZW50XG5cdFx0Ly8gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMTE3NjkpXG5cdFx0aWYgKCFhY3RpdmVFZGl0b3JQYW5lPy5ncm91cC5pc1RyYW5zaWVudChhY3RpdmVFZGl0b3JQYW5lLmlucHV0KSkge1xuXHRcdFx0dGhpcy5oYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2UoYWN0aXZlRWRpdG9yR3JvdXAsIGFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtIaXN0b3J5XTogaWdub3JpbmcgdHJhbnNpZW50IGVkaXRvciBjaGFuZ2UgdW50aWwgYmVjb21pbmcgbm9uLXRyYW5zaWVudCAoZWRpdG9yOiAke2FjdGl2ZUVkaXRvclBhbmUuaW5wdXQ/LnJlc291cmNlPy50b1N0cmluZygpfX0pYCk7XG5cblx0XHRcdGNvbnN0IHRyYW5zaWVudExpc3RlbmVyID0gYWN0aXZlRWRpdG9yR3JvdXAub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdFx0aWYgKGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1RSQU5TSUVOVCAmJiBlLmVkaXRvciA9PT0gYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCAmJiAhYWN0aXZlRWRpdG9yUGFuZS5ncm91cC5pc1RyYW5zaWVudChhY3RpdmVFZGl0b3JQYW5lLmlucHV0KSkge1xuXHRcdFx0XHRcdHRyYW5zaWVudExpc3RlbmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0XHRcdHRoaXMuaGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlKGFjdGl2ZUVkaXRvckdyb3VwLCBhY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZCh0cmFuc2llbnRMaXN0ZW5lcik7XG5cdFx0fVxuXG5cdFx0Ly8gTGlzdGVuIHRvIHNlbGVjdGlvbiBjaGFuZ2VzIHVubGVzcyB0aGUgZWRpdG9yIGlzIHRyYW5zaWVudFxuXHRcdGlmIChpc0VkaXRvclBhbmVXaXRoU2VsZWN0aW9uKGFjdGl2ZUVkaXRvclBhbmUpKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQoYWN0aXZlRWRpdG9yUGFuZS5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKCFhY3RpdmVFZGl0b3JQYW5lLmdyb3VwLmlzVHJhbnNpZW50KGFjdGl2ZUVkaXRvclBhbmUuaW5wdXQpKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVBY3RpdmVFZGl0b3JTZWxlY3Rpb25DaGFuZ2VFdmVudChhY3RpdmVFZGl0b3JHcm91cCwgYWN0aXZlRWRpdG9yUGFuZSwgZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbSGlzdG9yeV06IGlnbm9yaW5nIHRyYW5zaWVudCBlZGl0b3Igc2VsZWN0aW9uIGNoYW5nZSAoZWRpdG9yOiAke2FjdGl2ZUVkaXRvclBhbmUuaW5wdXQ/LnJlc291cmNlPy50b1N0cmluZygpfX0pYCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBDb250ZXh0IGtleXNcblx0XHR0aGlzLnVwZGF0ZUNvbnRleHRLZXlzKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRmlsZXNDaGFuZ2UoZXZlbnQ6IEZpbGVDaGFuZ2VzRXZlbnQgfCBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkIHtcblxuXHRcdC8vIEV4dGVybmFsIGZpbGUgY2hhbmdlcyAod2F0Y2hlcilcblx0XHRpZiAoZXZlbnQgaW5zdGFuY2VvZiBGaWxlQ2hhbmdlc0V2ZW50KSB7XG5cdFx0XHRpZiAoZXZlbnQuZ290RGVsZXRlZCgpKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbnRlcm5hbCBmaWxlIGNoYW5nZXMgKGUuZy4gZXhwbG9yZXIpXG5cdFx0ZWxzZSB7XG5cblx0XHRcdC8vIERlbGV0ZVxuXHRcdFx0aWYgKGV2ZW50LmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uREVMRVRFKSkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZShldmVudCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1vdmVcblx0XHRcdGVsc2UgaWYgKGV2ZW50LmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uTU9WRSkgJiYgZXZlbnQudGFyZ2V0LmlzRmlsZSkge1xuXHRcdFx0XHR0aGlzLm1vdmUoZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlKGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvclBhbmU/OiBJRWRpdG9yUGFuZSk6IHZvaWQge1xuXHRcdHRoaXMuaGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlSW5IaXN0b3J5KGVkaXRvclBhbmUpO1xuXHRcdHRoaXMuaGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlSW5OYXZpZ2F0aW9uU3RhY2tzKGdyb3VwLCBlZGl0b3JQYW5lKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQWN0aXZlRWRpdG9yU2VsZWN0aW9uQ2hhbmdlRXZlbnQoZ3JvdXA6IElFZGl0b3JHcm91cCwgZWRpdG9yUGFuZTogSUVkaXRvclBhbmVXaXRoU2VsZWN0aW9uLCBldmVudDogSUVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuaGFuZGxlQWN0aXZlRWRpdG9yU2VsZWN0aW9uQ2hhbmdlSW5OYXZpZ2F0aW9uU3RhY2tzKGdyb3VwLCBlZGl0b3JQYW5lLCBldmVudCk7XG5cdH1cblxuXHRwcml2YXRlIG1vdmUoZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudCk6IHZvaWQge1xuXHRcdHRoaXMubW92ZUluSGlzdG9yeShldmVudCk7XG5cdFx0dGhpcy5tb3ZlSW5FZGl0b3JOYXZpZ2F0aW9uU3RhY2tzKGV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkO1xuXHRwcml2YXRlIHJlbW92ZShldmVudDogRmlsZUNoYW5nZXNFdmVudCk6IHZvaWQ7XG5cdHByaXZhdGUgcmVtb3ZlKGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkO1xuXHRwcml2YXRlIHJlbW92ZShhcmcxOiBFZGl0b3JJbnB1dCB8IEZpbGVDaGFuZ2VzRXZlbnQgfCBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLnJlbW92ZUZyb21IaXN0b3J5KGFyZzEpO1xuXHRcdHRoaXMucmVtb3ZlRnJvbUVkaXRvck5hdmlnYXRpb25TdGFja3MoYXJnMSk7XG5cdFx0dGhpcy5yZW1vdmVGcm9tUmVjZW50bHlDbG9zZWRFZGl0b3JzKGFyZzEpO1xuXHRcdHRoaXMucmVtb3ZlRnJvbVJlY2VudGx5T3BlbmVkKGFyZzEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVGcm9tUmVjZW50bHlPcGVuZWQoYXJnMTogRWRpdG9ySW5wdXQgfCBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0bGV0IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzRWRpdG9ySW5wdXQoYXJnMSkpIHtcblx0XHRcdHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShhcmcxKTtcblx0XHR9IGVsc2UgaWYgKGFyZzEgaW5zdGFuY2VvZiBGaWxlQ2hhbmdlc0V2ZW50KSB7XG5cdFx0XHQvLyBJZ25vcmUgZm9yIG5vdyAocmVjZW50bHkgb3BlbmVkIGFyZSBtb3N0IG9mdGVuIG91dCBvZiB3b3Jrc3BhY2UgZmlsZXMgYW55d2F5IGZvciB3aGljaCB0aGVyZSBhcmUgbm8gZmlsZSBldmVudHMpXG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc291cmNlID0gYXJnMS5yZXNvdXJjZTtcblx0XHR9XG5cblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdHRoaXMud29ya3NwYWNlc1NlcnZpY2UucmVtb3ZlUmVjZW50bHlPcGVuZWQoW3Jlc291cmNlXSk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cblx0XHQvLyBIaXN0b3J5XG5cdFx0dGhpcy5jbGVhclJlY2VudGx5T3BlbmVkKCk7XG5cblx0XHQvLyBOYXZpZ2F0aW9uIChuZXh0LCBwcmV2aW91cylcblx0XHR0aGlzLmNsZWFyRWRpdG9yTmF2aWdhdGlvblN0YWNrcygpO1xuXG5cdFx0Ly8gUmVjZW50bHkgY2xvc2VkIGVkaXRvcnNcblx0XHR0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9ycyA9IFtdO1xuXG5cdFx0Ly8gQ29udGV4dCBLZXlzXG5cdFx0dGhpcy51cGRhdGVDb250ZXh0S2V5cygpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEhpc3RvcnkgQ29udGV4dCBLZXlzXG5cblx0cHJpdmF0ZSByZWFkb25seSBjYW5OYXZpZ2F0ZUJhY2tDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBjYW5OYXZpZ2F0ZUZvcndhcmRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNhbk5hdmlnYXRlQmFja0luTmF2aWdhdGlvbnNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBjYW5OYXZpZ2F0ZUZvcndhcmRJbk5hdmlnYXRpb25zQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgY2FuTmF2aWdhdGVUb0xhc3ROYXZpZ2F0aW9uTG9jYXRpb25Db250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNhbk5hdmlnYXRlQmFja0luRWRpdHNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBjYW5OYXZpZ2F0ZUZvcndhcmRJbkVkaXRzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgY2FuTmF2aWdhdGVUb0xhc3RFZGl0TG9jYXRpb25Db250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNhblJlb3BlbkNsb3NlZEVkaXRvckNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHVwZGF0ZUNvbnRleHRLZXlzKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVN0YWNrID0gdGhpcy5nZXRTdGFjaygpO1xuXG5cdFx0XHR0aGlzLmNhbk5hdmlnYXRlQmFja0NvbnRleHRLZXkuc2V0KGFjdGl2ZVN0YWNrLmNhbkdvQmFjayhHb0ZpbHRlci5OT05FKSk7XG5cdFx0XHR0aGlzLmNhbk5hdmlnYXRlRm9yd2FyZENvbnRleHRLZXkuc2V0KGFjdGl2ZVN0YWNrLmNhbkdvRm9yd2FyZChHb0ZpbHRlci5OT05FKSk7XG5cblx0XHRcdHRoaXMuY2FuTmF2aWdhdGVCYWNrSW5OYXZpZ2F0aW9uc0NvbnRleHRLZXkuc2V0KGFjdGl2ZVN0YWNrLmNhbkdvQmFjayhHb0ZpbHRlci5OQVZJR0FUSU9OKSk7XG5cdFx0XHR0aGlzLmNhbk5hdmlnYXRlRm9yd2FyZEluTmF2aWdhdGlvbnNDb250ZXh0S2V5LnNldChhY3RpdmVTdGFjay5jYW5Hb0ZvcndhcmQoR29GaWx0ZXIuTkFWSUdBVElPTikpO1xuXHRcdFx0dGhpcy5jYW5OYXZpZ2F0ZVRvTGFzdE5hdmlnYXRpb25Mb2NhdGlvbkNvbnRleHRLZXkuc2V0KGFjdGl2ZVN0YWNrLmNhbkdvTGFzdChHb0ZpbHRlci5OQVZJR0FUSU9OKSk7XG5cblx0XHRcdHRoaXMuY2FuTmF2aWdhdGVCYWNrSW5FZGl0c0NvbnRleHRLZXkuc2V0KGFjdGl2ZVN0YWNrLmNhbkdvQmFjayhHb0ZpbHRlci5FRElUUykpO1xuXHRcdFx0dGhpcy5jYW5OYXZpZ2F0ZUZvcndhcmRJbkVkaXRzQ29udGV4dEtleS5zZXQoYWN0aXZlU3RhY2suY2FuR29Gb3J3YXJkKEdvRmlsdGVyLkVESVRTKSk7XG5cdFx0XHR0aGlzLmNhbk5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uQ29udGV4dEtleS5zZXQoYWN0aXZlU3RhY2suY2FuR29MYXN0KEdvRmlsdGVyLkVESVRTKSk7XG5cblx0XHRcdHRoaXMuY2FuUmVvcGVuQ2xvc2VkRWRpdG9yQ29udGV4dEtleS5zZXQodGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMubGVuZ3RoID4gMCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRWRpdG9yIEhpc3RvcnkgTmF2aWdhdGlvbiAobGltaXQ6IDUwKVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRWRpdG9yTmF2aWdhdGlvblN0YWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRWRpdG9yTmF2aWdhdGlvblN0YWNrID0gdGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JOYXZpZ2F0aW9uU3RhY2suZXZlbnQ7XG5cblx0cHJpdmF0ZSBkZWZhdWx0U2NvcGVkRWRpdG9yTmF2aWdhdGlvblN0YWNrOiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrcyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNjb3BlZE5hdmlnYXRpb25TdGFja3MgPSBuZXcgTWFwPEdyb3VwSWRlbnRpZmllciwgeyBzdGFjazogSUVkaXRvck5hdmlnYXRpb25TdGFja3M7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2NvcGVkTmF2aWdhdGlvblN0YWNrcyA9IG5ldyBNYXA8R3JvdXBJZGVudGlmaWVyLCBNYXA8RWRpdG9ySW5wdXQsIHsgc3RhY2s6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzOyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9Pj4oKTtcblxuXHRwcml2YXRlIGVkaXRvck5hdmlnYXRpb25TY29wZSA9IEdvU2NvcGUuREVGQVVMVDtcblxuXHRwcml2YXRlIHJlZ2lzdGVyRWRpdG9yTmF2aWdhdGlvblNjb3BlQ2hhbmdlTGlzdGVuZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgaGFuZGxlRWRpdG9yTmF2aWdhdGlvblNjb3BlQ2hhbmdlID0gKCkgPT4ge1xuXG5cdFx0XHQvLyBFbnN1cmUgdG8gc3RhcnQgZnJlc2ggd2hlbiBzZXR0aW5nIGNoYW5nZXNcblx0XHRcdHRoaXMuZGlzcG9zZUVkaXRvck5hdmlnYXRpb25TdGFja3MoKTtcblxuXHRcdFx0Ly8gVXBkYXRlIHNjb3BlXG5cdFx0XHRjb25zdCBjb25maWd1cmVkU2NvcGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEhpc3RvcnlTZXJ2aWNlLk5BVklHQVRJT05fU0NPUEVfU0VUVElORyk7XG5cdFx0XHRpZiAoY29uZmlndXJlZFNjb3BlID09PSAnZWRpdG9yR3JvdXAnKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yTmF2aWdhdGlvblNjb3BlID0gR29TY29wZS5FRElUT1JfR1JPVVA7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbmZpZ3VyZWRTY29wZSA9PT0gJ2VkaXRvcicpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JOYXZpZ2F0aW9uU2NvcGUgPSBHb1Njb3BlLkVESVRPUjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yTmF2aWdhdGlvblNjb3BlID0gR29TY29wZS5ERUZBVUxUO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oSGlzdG9yeVNlcnZpY2UuTkFWSUdBVElPTl9TQ09QRV9TRVRUSU5HKSkge1xuXHRcdFx0XHRoYW5kbGVFZGl0b3JOYXZpZ2F0aW9uU2NvcGVDaGFuZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRoYW5kbGVFZGl0b3JOYXZpZ2F0aW9uU2NvcGVDaGFuZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RhY2soZ3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cCwgZWRpdG9yID0gZ3JvdXAuYWN0aXZlRWRpdG9yKTogSUVkaXRvck5hdmlnYXRpb25TdGFja3Mge1xuXHRcdHN3aXRjaCAodGhpcy5lZGl0b3JOYXZpZ2F0aW9uU2NvcGUpIHtcblxuXHRcdFx0Ly8gUGVyIEVkaXRvclxuXHRcdFx0Y2FzZSBHb1Njb3BlLkVESVRPUjoge1xuXHRcdFx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgTm9PcEVkaXRvck5hdmlnYXRpb25TdGFja3MoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBzdGFja3NGb3JHcm91cCA9IHRoaXMuZWRpdG9yU2NvcGVkTmF2aWdhdGlvblN0YWNrcy5nZXQoZ3JvdXAuaWQpO1xuXHRcdFx0XHRpZiAoIXN0YWNrc0Zvckdyb3VwKSB7XG5cdFx0XHRcdFx0c3RhY2tzRm9yR3JvdXAgPSBuZXcgTWFwPEVkaXRvcklucHV0LCB7IHN0YWNrOiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrczsgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfT4oKTtcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNjb3BlZE5hdmlnYXRpb25TdGFja3Muc2V0KGdyb3VwLmlkLCBzdGFja3NGb3JHcm91cCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgc3RhY2sgPSBzdGFja3NGb3JHcm91cC5nZXQoZWRpdG9yKT8uc3RhY2s7XG5cdFx0XHRcdGlmICghc3RhY2spIHtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRcdFx0c3RhY2sgPSBkaXNwb3NhYmxlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvck5hdmlnYXRpb25TdGFja3MsIEdvU2NvcGUuRURJVE9SKSk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5hZGQoc3RhY2sub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JOYXZpZ2F0aW9uU3RhY2suZmlyZSgpKSk7XG5cblx0XHRcdFx0XHRzdGFja3NGb3JHcm91cC5zZXQoZWRpdG9yLCB7IHN0YWNrLCBkaXNwb3NhYmxlIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHN0YWNrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQZXIgRWRpdG9yIEdyb3VwXG5cdFx0XHRjYXNlIEdvU2NvcGUuRURJVE9SX0dST1VQOiB7XG5cdFx0XHRcdGxldCBzdGFjayA9IHRoaXMuZWRpdG9yR3JvdXBTY29wZWROYXZpZ2F0aW9uU3RhY2tzLmdldChncm91cC5pZCk/LnN0YWNrO1xuXHRcdFx0XHRpZiAoIXN0YWNrKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0XHRcdHN0YWNrID0gZGlzcG9zYWJsZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzLCBHb1Njb3BlLkVESVRPUl9HUk9VUCkpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuYWRkKHN0YWNrLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yTmF2aWdhdGlvblN0YWNrLmZpcmUoKSkpO1xuXG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cFNjb3BlZE5hdmlnYXRpb25TdGFja3Muc2V0KGdyb3VwLmlkLCB7IHN0YWNrLCBkaXNwb3NhYmxlIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHN0YWNrO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBHbG9iYWxcblx0XHRcdGNhc2UgR29TY29wZS5ERUZBVUxUOiB7XG5cdFx0XHRcdGlmICghdGhpcy5kZWZhdWx0U2NvcGVkRWRpdG9yTmF2aWdhdGlvblN0YWNrKSB7XG5cdFx0XHRcdFx0dGhpcy5kZWZhdWx0U2NvcGVkRWRpdG9yTmF2aWdhdGlvblN0YWNrID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzLCBHb1Njb3BlLkRFRkFVTFQpKTtcblxuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVmYXVsdFNjb3BlZEVkaXRvck5hdmlnYXRpb25TdGFjay5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUVkaXRvck5hdmlnYXRpb25TdGFjay5maXJlKCkpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRTY29wZWRFZGl0b3JOYXZpZ2F0aW9uU3RhY2s7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z29Gb3J3YXJkKGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RhY2soKS5nb0ZvcndhcmQoZmlsdGVyKTtcblx0fVxuXG5cdGdvQmFjayhmaWx0ZXI/OiBHb0ZpbHRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFN0YWNrKCkuZ29CYWNrKGZpbHRlcik7XG5cdH1cblxuXHRnb1ByZXZpb3VzKGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RhY2soKS5nb1ByZXZpb3VzKGZpbHRlcik7XG5cdH1cblxuXHRnb0xhc3QoZmlsdGVyPzogR29GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdGFjaygpLmdvTGFzdChmaWx0ZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2VJbk5hdmlnYXRpb25TdGFja3MoZ3JvdXA6IElFZGl0b3JHcm91cCwgZWRpdG9yUGFuZT86IElFZGl0b3JQYW5lKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRTdGFjayhncm91cCwgZWRpdG9yUGFuZT8uaW5wdXQpLmhhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZShlZGl0b3JQYW5lKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQWN0aXZlRWRpdG9yU2VsZWN0aW9uQ2hhbmdlSW5OYXZpZ2F0aW9uU3RhY2tzKGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvclBhbmU6IElFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbiwgZXZlbnQ6IElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmdldFN0YWNrKGdyb3VwLCBlZGl0b3JQYW5lLmlucHV0KS5oYW5kbGVBY3RpdmVFZGl0b3JTZWxlY3Rpb25DaGFuZ2UoZWRpdG9yUGFuZSwgZXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVFZGl0b3JDbG9zZUV2ZW50SW5IaXN0b3J5KGU6IElFZGl0b3JDbG9zZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuZWRpdG9yU2NvcGVkTmF2aWdhdGlvblN0YWNrcy5nZXQoZS5ncm91cElkKTtcblx0XHRpZiAoZWRpdG9ycykge1xuXHRcdFx0Y29uc3QgZWRpdG9yU3RhY2sgPSBlZGl0b3JzLmdldChlLmVkaXRvcik7XG5cdFx0XHRpZiAoZWRpdG9yU3RhY2spIHtcblx0XHRcdFx0ZWRpdG9yU3RhY2suZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdGVkaXRvcnMuZGVsZXRlKGUuZWRpdG9yKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVkaXRvcnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmVkaXRvclNjb3BlZE5hdmlnYXRpb25TdGFja3MuZGVsZXRlKGUuZ3JvdXBJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVFZGl0b3JHcm91cFJlbW92ZUluTmF2aWdhdGlvblN0YWNrcyhncm91cDogSUVkaXRvckdyb3VwKTogdm9pZCB7XG5cblx0XHQvLyBHbG9iYWxcblx0XHR0aGlzLmRlZmF1bHRTY29wZWRFZGl0b3JOYXZpZ2F0aW9uU3RhY2s/LnJlbW92ZShncm91cC5pZCk7XG5cblx0XHQvLyBFZGl0b3IgZ3JvdXBzXG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBTdGFjayA9IHRoaXMuZWRpdG9yR3JvdXBTY29wZWROYXZpZ2F0aW9uU3RhY2tzLmdldChncm91cC5pZCk7XG5cdFx0aWYgKGVkaXRvckdyb3VwU3RhY2spIHtcblx0XHRcdGVkaXRvckdyb3VwU3RhY2suZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmVkaXRvckdyb3VwU2NvcGVkTmF2aWdhdGlvblN0YWNrcy5kZWxldGUoZ3JvdXAuaWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXJFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzKCk6IHZvaWQge1xuXHRcdHRoaXMud2l0aEVhY2hFZGl0b3JOYXZpZ2F0aW9uU3RhY2soc3RhY2sgPT4gc3RhY2suY2xlYXIoKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUZyb21FZGl0b3JOYXZpZ2F0aW9uU3RhY2tzKGFyZzE6IEVkaXRvcklucHV0IHwgRmlsZUNoYW5nZXNFdmVudCB8IEZpbGVPcGVyYXRpb25FdmVudCk6IHZvaWQge1xuXHRcdHRoaXMud2l0aEVhY2hFZGl0b3JOYXZpZ2F0aW9uU3RhY2soc3RhY2sgPT4gc3RhY2sucmVtb3ZlKGFyZzEpKTtcblx0fVxuXG5cdHByaXZhdGUgbW92ZUluRWRpdG9yTmF2aWdhdGlvblN0YWNrcyhldmVudDogRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy53aXRoRWFjaEVkaXRvck5hdmlnYXRpb25TdGFjayhzdGFjayA9PiBzdGFjay5tb3ZlKGV2ZW50KSk7XG5cdH1cblxuXHRwcml2YXRlIHdpdGhFYWNoRWRpdG9yTmF2aWdhdGlvblN0YWNrKGZuOiAoc3RhY2s6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzKSA9PiB2b2lkKTogdm9pZCB7XG5cblx0XHQvLyBHbG9iYWxcblx0XHRpZiAodGhpcy5kZWZhdWx0U2NvcGVkRWRpdG9yTmF2aWdhdGlvblN0YWNrKSB7XG5cdFx0XHRmbih0aGlzLmRlZmF1bHRTY29wZWRFZGl0b3JOYXZpZ2F0aW9uU3RhY2spO1xuXHRcdH1cblxuXHRcdC8vIFBlciBlZGl0b3IgZ3JvdXBcblx0XHRmb3IgKGNvbnN0IFssIGVudHJ5XSBvZiB0aGlzLmVkaXRvckdyb3VwU2NvcGVkTmF2aWdhdGlvblN0YWNrcykge1xuXHRcdFx0Zm4oZW50cnkuc3RhY2spO1xuXHRcdH1cblxuXHRcdC8vIFBlciBlZGl0b3Jcblx0XHRmb3IgKGNvbnN0IFssIGVudHJpZXNdIG9mIHRoaXMuZWRpdG9yU2NvcGVkTmF2aWdhdGlvblN0YWNrcykge1xuXHRcdFx0Zm9yIChjb25zdCBbLCBlbnRyeV0gb2YgZW50cmllcykge1xuXHRcdFx0XHRmbihlbnRyeS5zdGFjayk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkaXNwb3NlRWRpdG9yTmF2aWdhdGlvblN0YWNrcygpOiB2b2lkIHtcblxuXHRcdC8vIEdsb2JhbFxuXHRcdHRoaXMuZGVmYXVsdFNjb3BlZEVkaXRvck5hdmlnYXRpb25TdGFjaz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGVmYXVsdFNjb3BlZEVkaXRvck5hdmlnYXRpb25TdGFjayA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIFBlciBFZGl0b3IgZ3JvdXBcblx0XHRmb3IgKGNvbnN0IFssIHN0YWNrXSBvZiB0aGlzLmVkaXRvckdyb3VwU2NvcGVkTmF2aWdhdGlvblN0YWNrcykge1xuXHRcdFx0c3RhY2suZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuZWRpdG9yR3JvdXBTY29wZWROYXZpZ2F0aW9uU3RhY2tzLmNsZWFyKCk7XG5cblx0XHQvLyBQZXIgRWRpdG9yXG5cdFx0Zm9yIChjb25zdCBbLCBzdGFja3NdIG9mIHRoaXMuZWRpdG9yU2NvcGVkTmF2aWdhdGlvblN0YWNrcykge1xuXHRcdFx0Zm9yIChjb25zdCBbLCBzdGFja10gb2Ygc3RhY2tzKSB7XG5cdFx0XHRcdHN0YWNrLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmVkaXRvclNjb3BlZE5hdmlnYXRpb25TdGFja3MuY2xlYXIoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBOYXZpZ2F0aW9uOiBOZXh0L1ByZXZpb3VzIFVzZWQgRWRpdG9yXG5cblx0cHJpdmF0ZSByZWNlbnRseVVzZWRFZGl0b3JzU3RhY2s6IHJlYWRvbmx5IElFZGl0b3JJZGVudGlmaWVyW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVjZW50bHlVc2VkRWRpdG9yc1N0YWNrSW5kZXggPSAwO1xuXG5cdHByaXZhdGUgcmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFjazogcmVhZG9ubHkgSUVkaXRvcklkZW50aWZpZXJbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWNlbnRseVVzZWRFZGl0b3JzSW5Hcm91cFN0YWNrSW5kZXggPSAwO1xuXG5cdHByaXZhdGUgbmF2aWdhdGluZ0luUmVjZW50bHlVc2VkRWRpdG9yc1N0YWNrID0gZmFsc2U7XG5cdHByaXZhdGUgbmF2aWdhdGluZ0luUmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFjayA9IGZhbHNlO1xuXG5cdG9wZW5OZXh0UmVjZW50bHlVc2VkRWRpdG9yKGdyb3VwSWQ/OiBHcm91cElkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBbc3RhY2ssIGluZGV4XSA9IHRoaXMuZW5zdXJlUmVjZW50bHlVc2VkU3RhY2soaW5kZXggPT4gaW5kZXggLSAxLCBncm91cElkKTtcblxuXHRcdHJldHVybiB0aGlzLmRvTmF2aWdhdGVJblJlY2VudGx5VXNlZEVkaXRvcnNTdGFjayhzdGFja1tpbmRleF0sIGdyb3VwSWQpO1xuXHR9XG5cblx0b3BlblByZXZpb3VzbHlVc2VkRWRpdG9yKGdyb3VwSWQ/OiBHcm91cElkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBbc3RhY2ssIGluZGV4XSA9IHRoaXMuZW5zdXJlUmVjZW50bHlVc2VkU3RhY2soaW5kZXggPT4gaW5kZXggKyAxLCBncm91cElkKTtcblxuXHRcdHJldHVybiB0aGlzLmRvTmF2aWdhdGVJblJlY2VudGx5VXNlZEVkaXRvcnNTdGFjayhzdGFja1tpbmRleF0sIGdyb3VwSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb05hdmlnYXRlSW5SZWNlbnRseVVzZWRFZGl0b3JzU3RhY2soZWRpdG9ySWRlbnRpZmllcjogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQsIGdyb3VwSWQ/OiBHcm91cElkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZWRpdG9ySWRlbnRpZmllcikge1xuXHRcdFx0Y29uc3QgYWNyb3NzR3JvdXBzID0gdHlwZW9mIGdyb3VwSWQgIT09ICdudW1iZXInIHx8ICF0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChncm91cElkKTtcblxuXHRcdFx0aWYgKGFjcm9zc0dyb3Vwcykge1xuXHRcdFx0XHR0aGlzLm5hdmlnYXRpbmdJblJlY2VudGx5VXNlZEVkaXRvcnNTdGFjayA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm5hdmlnYXRpbmdJblJlY2VudGx5VXNlZEVkaXRvcnNJbkdyb3VwU3RhY2sgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBncm91cCA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdldEdyb3VwKGVkaXRvcklkZW50aWZpZXIuZ3JvdXBJZCkgPz8gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXA7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBncm91cC5vcGVuRWRpdG9yKGVkaXRvcklkZW50aWZpZXIuZWRpdG9yKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGlmIChhY3Jvc3NHcm91cHMpIHtcblx0XHRcdFx0XHR0aGlzLm5hdmlnYXRpbmdJblJlY2VudGx5VXNlZEVkaXRvcnNTdGFjayA9IGZhbHNlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubmF2aWdhdGluZ0luUmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFjayA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVSZWNlbnRseVVzZWRTdGFjayhpbmRleE1vZGlmaWVyOiAoaW5kZXg6IG51bWJlcikgPT4gbnVtYmVyLCBncm91cElkPzogR3JvdXBJZGVudGlmaWVyKTogW3JlYWRvbmx5IElFZGl0b3JJZGVudGlmaWVyW10sIG51bWJlcl0ge1xuXHRcdGxldCBlZGl0b3JzOiByZWFkb25seSBJRWRpdG9ySWRlbnRpZmllcltdO1xuXHRcdGxldCBpbmRleDogbnVtYmVyO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSB0eXBlb2YgZ3JvdXBJZCA9PT0gJ251bWJlcicgPyB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChncm91cElkKSA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIEFjcm9zcyBncm91cHNcblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRlZGl0b3JzID0gdGhpcy5yZWNlbnRseVVzZWRFZGl0b3JzU3RhY2sgfHwgdGhpcy5lZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKTtcblx0XHRcdGluZGV4ID0gdGhpcy5yZWNlbnRseVVzZWRFZGl0b3JzU3RhY2tJbmRleDtcblx0XHR9XG5cblx0XHQvLyBXaXRoaW4gZ3JvdXBcblx0XHRlbHNlIHtcblx0XHRcdGVkaXRvcnMgPSB0aGlzLnJlY2VudGx5VXNlZEVkaXRvcnNJbkdyb3VwU3RhY2sgfHwgZ3JvdXAuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpLm1hcChlZGl0b3IgPT4gKHsgZ3JvdXBJZDogZ3JvdXAuaWQsIGVkaXRvciB9KSk7XG5cdFx0XHRpbmRleCA9IHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFja0luZGV4O1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCBpbmRleFxuXHRcdGxldCBuZXdJbmRleCA9IGluZGV4TW9kaWZpZXIoaW5kZXgpO1xuXHRcdGlmIChuZXdJbmRleCA8IDApIHtcblx0XHRcdG5ld0luZGV4ID0gMDtcblx0XHR9IGVsc2UgaWYgKG5ld0luZGV4ID4gZWRpdG9ycy5sZW5ndGggLSAxKSB7XG5cdFx0XHRuZXdJbmRleCA9IGVkaXRvcnMubGVuZ3RoIC0gMTtcblx0XHR9XG5cblx0XHQvLyBSZW1lbWJlciBpbmRleCBhbmQgZWRpdG9yc1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc1N0YWNrID0gZWRpdG9ycztcblx0XHRcdHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc1N0YWNrSW5kZXggPSBuZXdJbmRleDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZWNlbnRseVVzZWRFZGl0b3JzSW5Hcm91cFN0YWNrID0gZWRpdG9ycztcblx0XHRcdHRoaXMucmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFja0luZGV4ID0gbmV3SW5kZXg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtlZGl0b3JzLCBuZXdJbmRleF07XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUVkaXRvckV2ZW50SW5SZWNlbnRFZGl0b3JzU3RhY2soKTogdm9pZCB7XG5cblx0XHQvLyBEcm9wIGFsbC1lZGl0b3JzIHN0YWNrIHVubGVzcyBuYXZpZ2F0aW5nIGluIGFsbCBlZGl0b3JzXG5cdFx0aWYgKCF0aGlzLm5hdmlnYXRpbmdJblJlY2VudGx5VXNlZEVkaXRvcnNTdGFjaykge1xuXHRcdFx0dGhpcy5yZWNlbnRseVVzZWRFZGl0b3JzU3RhY2sgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnJlY2VudGx5VXNlZEVkaXRvcnNTdGFja0luZGV4ID0gMDtcblx0XHR9XG5cblx0XHQvLyBEcm9wIGluLWdyb3VwLWVkaXRvcnMgc3RhY2sgdW5sZXNzIG5hdmlnYXRpbmcgaW4gZ3JvdXBcblx0XHRpZiAoIXRoaXMubmF2aWdhdGluZ0luUmVjZW50bHlVc2VkRWRpdG9yc0luR3JvdXBTdGFjaykge1xuXHRcdFx0dGhpcy5yZWNlbnRseVVzZWRFZGl0b3JzSW5Hcm91cFN0YWNrID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5yZWNlbnRseVVzZWRFZGl0b3JzSW5Hcm91cFN0YWNrSW5kZXggPSAwO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBGaWxlOiBSZW9wZW4gQ2xvc2VkIEVkaXRvciAobGltaXQ6IDIwKVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9SRUNFTlRMWV9DTE9TRURfRURJVE9SUyA9IDIwO1xuXG5cdHByaXZhdGUgcmVjZW50bHlDbG9zZWRFZGl0b3JzOiBJUmVjZW50bHlDbG9zZWRFZGl0b3JbXSA9IFtdO1xuXHRwcml2YXRlIGlnbm9yZUVkaXRvckNsb3NlRXZlbnQgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlY2VudGx5Q2xvc2VkRWRpdG9yc0JhdGNoSWQgPSAwO1xuXHRwcml2YXRlIHJlY2VudGx5Q2xvc2VkRWRpdG9yc0JhdGNoU2NoZWR1bGVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBoYW5kbGVFZGl0b3JDbG9zZUV2ZW50SW5SZW9wZW4oZXZlbnQ6IElFZGl0b3JDbG9zZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaWdub3JlRWRpdG9yQ2xvc2VFdmVudCkge1xuXHRcdFx0cmV0dXJuOyAvLyBibG9ja2VkXG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBlZGl0b3IsIGNvbnRleHQgfSA9IGV2ZW50O1xuXHRcdGlmIChjb250ZXh0ID09PSBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSB8fCBjb250ZXh0ID09PSBFZGl0b3JDbG9zZUNvbnRleHQuTU9WRSkge1xuXHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgaWYgZWRpdG9yIHdhcyByZXBsYWNlZCBvciBtb3ZlZFxuXHRcdH1cblxuXHRcdGlmICghZWRpdG9yLmNhblJlb3BlbigpKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgZWRpdG9ycyB0aGF0IGNhbiBiZSByZW9wZW5lZFxuXHRcdH1cblxuXHRcdGNvbnN0IHVudHlwZWRFZGl0b3IgPSBlZGl0b3IudG9VbnR5cGVkKCk7XG5cdFx0aWYgKCF1bnR5cGVkRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47IC8vIHdlIG5lZWQgYSB1bnR5cGVkIGVkaXRvciB0byByZXN0b3JlIGZyb20gZ29pbmcgZm9yd2FyZFxuXHRcdH1cblxuXHRcdGNvbnN0IGFzc29jaWF0ZWRSZXNvdXJjZXM6IFVSSVtdID0gW107XG5cdFx0Y29uc3QgZWRpdG9yUmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pO1xuXHRcdGlmIChVUkkuaXNVcmkoZWRpdG9yUmVzb3VyY2UpKSB7XG5cdFx0XHRhc3NvY2lhdGVkUmVzb3VyY2VzLnB1c2goZWRpdG9yUmVzb3VyY2UpO1xuXHRcdH0gZWxzZSBpZiAoZWRpdG9yUmVzb3VyY2UpIHtcblx0XHRcdGFzc29jaWF0ZWRSZXNvdXJjZXMucHVzaCguLi5jb2FsZXNjZShbZWRpdG9yUmVzb3VyY2UucHJpbWFyeSwgZWRpdG9yUmVzb3VyY2Uuc2Vjb25kYXJ5XSkpO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBmcm9tIGxpc3Qgb2YgcmVjZW50bHkgY2xvc2VkIGJlZm9yZS4uLlxuXHRcdHRoaXMucmVtb3ZlRnJvbVJlY2VudGx5Q2xvc2VkRWRpdG9ycyhlZGl0b3IpO1xuXG5cdFx0Ly8gLi4uYWRkaW5nIGl0IGFzIGxhc3QgcmVjZW50bHkgY2xvc2VkXG5cdFx0dGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMucHVzaCh7XG5cdFx0XHRlZGl0b3JJZDogZWRpdG9yLmVkaXRvcklkLFxuXHRcdFx0ZWRpdG9yOiB1bnR5cGVkRWRpdG9yLFxuXHRcdFx0cmVzb3VyY2U6IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yKSxcblx0XHRcdGFzc29jaWF0ZWRSZXNvdXJjZXMsXG5cdFx0XHRpbmRleDogZXZlbnQuaW5kZXgsXG5cdFx0XHRzdGlja3k6IGV2ZW50LnN0aWNreSxcblx0XHRcdGJhdGNoSWQ6IHRoaXMuY3VycmVudFJlY2VudGx5Q2xvc2VkRWRpdG9yc0JhdGNoSWQoKVxuXHRcdH0pO1xuXG5cdFx0Ly8gQm91bmRpbmdcblx0XHRpZiAodGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMubGVuZ3RoID4gSGlzdG9yeVNlcnZpY2UuTUFYX1JFQ0VOVExZX0NMT1NFRF9FRElUT1JTKSB7XG5cdFx0XHR0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9ycy5zaGlmdCgpO1xuXHRcdH1cblxuXHRcdC8vIENvbnRleHRcblx0XHR0aGlzLmNhblJlb3BlbkNsb3NlZEVkaXRvckNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBjdXJyZW50UmVjZW50bHlDbG9zZWRFZGl0b3JzQmF0Y2hJZCgpOiBudW1iZXIge1xuXG5cdFx0Ly8gQWxsIGVkaXRvcnMgdGhhdCBhcmUgY2xvc2VkIHdpdGhpbiB0aGUgc2FtZSBzeW5jaHJvbm91cyB0dXJuXG5cdFx0Ly8gKGUuZy4gXCJDbG9zZSBBbGwgRWRpdG9yc1wiIG9yIFwiQ2xvc2UgT3RoZXJzXCIpIHNoYXJlIHRoZSBzYW1lIGJhdGNoXG5cdFx0Ly8gaWRlbnRpZmllciBzbyB0aGF0IHRoZXkgYXJlIHJlb3BlbmVkIHRvZ2V0aGVyLiBXZSBvcGVuIGEgbmV3IGJhdGNoXG5cdFx0Ly8gb24gdGhlIGZpcnN0IGNsb3NlIGV2ZW50IGFuZCByZXNldCBpdCBvbiB0aGUgbmV4dCBtaWNyb3Rhc2ssIGFmdGVyXG5cdFx0Ly8gYWxsIHN5bmNocm9ub3VzbHkgZmlyZWQgY2xvc2UgZXZlbnRzIGhhdmUgYmVlbiBoYW5kbGVkLlxuXHRcdGlmICghdGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnNCYXRjaFNjaGVkdWxlZCkge1xuXHRcdFx0dGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnNCYXRjaFNjaGVkdWxlZCA9IHRydWU7XG5cdFx0XHR0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9yc0JhdGNoSWQrKztcblx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzQmF0Y2hTY2hlZHVsZWQgPSBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzQmF0Y2hJZDtcblx0fVxuXG5cdGFzeW5jIHJlb3Blbkxhc3RDbG9zZWRFZGl0b3IoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBSZW9wZW4gdGhlIGxhc3QgYmF0Y2ggb2YgZWRpdG9ycyB0aGF0IHdlcmUgY2xvc2VkIHRvZ2V0aGVyXG5cdFx0Y29uc3QgbGFzdENsb3NlZEVkaXRvcnMgPSB0aGlzLnRha2VMYXN0Q2xvc2VkRWRpdG9yc0JhdGNoKCk7XG5cdFx0bGV0IHJlb3BlbkNsb3NlZEVkaXRvclByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGxhc3RDbG9zZWRFZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0cmVvcGVuQ2xvc2VkRWRpdG9yUHJvbWlzZSA9IHRoaXMuZG9SZW9wZW5MYXN0Q2xvc2VkRWRpdG9ycyhsYXN0Q2xvc2VkRWRpdG9ycyk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGNvbnRleHRcblx0XHR0aGlzLmNhblJlb3BlbkNsb3NlZEVkaXRvckNvbnRleHRLZXkuc2V0KHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzLmxlbmd0aCA+IDApO1xuXG5cdFx0cmV0dXJuIHJlb3BlbkNsb3NlZEVkaXRvclByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIHRha2VMYXN0Q2xvc2VkRWRpdG9yc0JhdGNoKCk6IElSZWNlbnRseUNsb3NlZEVkaXRvcltdIHtcblx0XHRjb25zdCBsYXN0Q2xvc2VkRWRpdG9yID0gdGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMuYXQoLTEpO1xuXHRcdGlmICghbGFzdENsb3NlZEVkaXRvcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIENvbGxlY3QgYWxsIHRyYWlsaW5nIGVkaXRvcnMgdGhhdCBiZWxvbmcgdG8gdGhlIHNhbWUgYmF0Y2guIFRoZXkgYXJlXG5cdFx0Ly8gY29udGlndW91cyBhdCB0aGUgZW5kIG9mIHRoZSBsaXN0IGJlY2F1c2UgZWRpdG9ycyBhcmUgYXBwZW5kZWQgaW4gdGhlXG5cdFx0Ly8gb3JkZXIgdGhleSBhcmUgY2xvc2VkLlxuXHRcdGNvbnN0IGJhdGNoOiBJUmVjZW50bHlDbG9zZWRFZGl0b3JbXSA9IFtdO1xuXHRcdHdoaWxlICh0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9ycy5sZW5ndGggJiYgdGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnNbdGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMubGVuZ3RoIC0gMV0uYmF0Y2hJZCA9PT0gbGFzdENsb3NlZEVkaXRvci5iYXRjaElkKSB7XG5cdFx0XHRiYXRjaC51bnNoaWZ0KHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzLnBvcCgpISk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJhdGNoO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Jlb3Blbkxhc3RDbG9zZWRFZGl0b3JzKGxhc3RDbG9zZWRFZGl0b3JzOiBJUmVjZW50bHlDbG9zZWRFZGl0b3JbXSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gUmVvcGVuIGFsbCBlZGl0b3JzIG9mIHRoZSBiYXRjaCBpbiB0aGUgb3JkZXIgdGhleSB3ZXJlIG9yaWdpbmFsbHkgY2xvc2VkXG5cdFx0bGV0IGFueVJlb3BlbmVkID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBsYXN0Q2xvc2VkRWRpdG9yIG9mIGxhc3RDbG9zZWRFZGl0b3JzKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JQYW5lID0gYXdhaXQgdGhpcy5kb1Jlb3Blbkxhc3RDbG9zZWRFZGl0b3IobGFzdENsb3NlZEVkaXRvcik7XG5cdFx0XHRpZiAoZWRpdG9yUGFuZSkge1xuXHRcdFx0XHRhbnlSZW9wZW5lZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRml4IGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNjc4ODJcblx0XHQvLyBJZiBub25lIG9mIHRoZSBlZGl0b3JzIGluIHRoZSBiYXRjaCBjb3VsZCBiZSByZW9wZW5lZCwgbWFrZSBzdXJlIHRvXG5cdFx0Ly8gdHJ5IHRoZSBwcmV2aW91cyBiYXRjaC4gVGhlIGZhaWxpbmcgZWRpdG9ycyBoYXZlIGFscmVhZHkgYmVlbiByZW1vdmVkXG5cdFx0Ly8gZnJvbSB0aGUgbGlzdCBvZiByZWNlbnRseSBjbG9zZWQgZWRpdG9ycyB0byBwcmV2ZW50IGVuZGxlc3MgbG9vcHMuXG5cdFx0aWYgKCFhbnlSZW9wZW5lZCAmJiB0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlb3Blbkxhc3RDbG9zZWRFZGl0b3IoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVvcGVuTGFzdENsb3NlZEVkaXRvcihsYXN0Q2xvc2VkRWRpdG9yOiBJUmVjZW50bHlDbG9zZWRFZGl0b3IpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSB7IHBpbm5lZDogdHJ1ZSwgc3RpY2t5OiBsYXN0Q2xvc2VkRWRpdG9yLnN0aWNreSwgaW5kZXg6IGxhc3RDbG9zZWRFZGl0b3IuaW5kZXgsIGlnbm9yZUVycm9yOiB0cnVlIH07XG5cblx0XHQvLyBTcGVjaWFsIHN0aWNreSBoYW5kbGluZzogcmVtb3ZlIHRoZSBpbmRleCBwcm9wZXJ0eSBmcm9tIG9wdGlvbnNcblx0XHQvLyBpZiB0aGF0IHdvdWxkIHJlc3VsdCBpbiBzdGlja3kgc3RhdGUgdG8gbm90IHByZXNlcnZlIG9yIGFwcGx5XG5cdFx0Ly8gd3JvbmdseS5cblx0XHRpZiAoXG5cdFx0XHQobGFzdENsb3NlZEVkaXRvci5zdGlja3kgJiYgIXRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmlzU3RpY2t5KGxhc3RDbG9zZWRFZGl0b3IuaW5kZXgpKSB8fFxuXHRcdFx0KCFsYXN0Q2xvc2VkRWRpdG9yLnN0aWNreSAmJiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5pc1N0aWNreShsYXN0Q2xvc2VkRWRpdG9yLmluZGV4KSlcblx0XHQpIHtcblx0XHRcdG9wdGlvbnMuaW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmUtb3BlbiBlZGl0b3IgdW5sZXNzIGFscmVhZHkgb3BlbmVkXG5cdFx0bGV0IGVkaXRvclBhbmU6IElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICghdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAuY29udGFpbnMobGFzdENsb3NlZEVkaXRvci5lZGl0b3IpKSB7XG5cblx0XHRcdC8vIEZpeCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwNzg1MFxuXHRcdFx0Ly8gSWYgb3BlbmluZyBhbiBlZGl0b3IgZmFpbHMsIGl0IGlzIHBvc3NpYmxlIHRoYXQgd2UgZ2V0XG5cdFx0XHQvLyBhbm90aGVyIGVkaXRvci1jbG9zZSBldmVudCBhcyBhIHJlc3VsdC4gQnV0IHdlIHJlYWxseSBkb1xuXHRcdFx0Ly8gd2FudCB0byBpZ25vcmUgdGhhdCBpbiBvdXIgbGlzdCBvZiByZWNlbnRseSBjbG9zZWQgZWRpdG9yc1xuXHRcdFx0Ly8gIHRvIHByZXZlbnQgZW5kbGVzcyBsb29wcy5cblxuXHRcdFx0dGhpcy5pZ25vcmVFZGl0b3JDbG9zZUV2ZW50ID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGVkaXRvclBhbmUgPSBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0Li4ubGFzdENsb3NlZEVkaXRvci5lZGl0b3IsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0Li4ubGFzdENsb3NlZEVkaXRvci5lZGl0b3Iub3B0aW9ucyxcblx0XHRcdFx0XHRcdC4uLm9wdGlvbnNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5pZ25vcmVFZGl0b3JDbG9zZUV2ZW50ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvclBhbmU7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUZyb21SZWNlbnRseUNsb3NlZEVkaXRvcnMoYXJnMTogRWRpdG9ySW5wdXQgfCBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5yZWNlbnRseUNsb3NlZEVkaXRvcnMgPSB0aGlzLnJlY2VudGx5Q2xvc2VkRWRpdG9ycy5maWx0ZXIocmVjZW50bHlDbG9zZWRFZGl0b3IgPT4ge1xuXHRcdFx0aWYgKGlzRWRpdG9ySW5wdXQoYXJnMSkgJiYgcmVjZW50bHlDbG9zZWRFZGl0b3IuZWRpdG9ySWQgIT09IGFyZzEuZWRpdG9ySWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIGtlZXA6IGRpZmZlcmVudCBlZGl0b3IgaWRlbnRpZmllcnNcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlY2VudGx5Q2xvc2VkRWRpdG9yLnJlc291cmNlICYmIHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNGaWxlKHJlY2VudGx5Q2xvc2VkRWRpdG9yLnJlc291cmNlLCBhcmcxKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHJlbW92ZTogZWRpdG9yIG1hdGNoZXMgZGlyZWN0bHlcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlY2VudGx5Q2xvc2VkRWRpdG9yLmFzc29jaWF0ZWRSZXNvdXJjZXMuc29tZShhc3NvY2lhdGVkUmVzb3VyY2UgPT4gdGhpcy5lZGl0b3JIZWxwZXIubWF0Y2hlc0ZpbGUoYXNzb2NpYXRlZFJlc291cmNlLCBhcmcxKSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyByZW1vdmU6IGFuIGFzc29jaWF0ZWQgcmVzb3VyY2UgbWF0Y2hlc1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8ga2VlcFxuXHRcdH0pO1xuXG5cdFx0Ly8gVXBkYXRlIGNvbnRleHRcblx0XHR0aGlzLmNhblJlb3BlbkNsb3NlZEVkaXRvckNvbnRleHRLZXkuc2V0KHRoaXMucmVjZW50bHlDbG9zZWRFZGl0b3JzLmxlbmd0aCA+IDApO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEdvIHRvOiBSZWNlbnRseSBPcGVuZWQgRWRpdG9yIChsaW1pdDogMjAwLCBwZXJzaXN0ZWQpXG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0hJU1RPUllfSVRFTVMgPSAyMDA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJU1RPUllfU1RPUkFHRV9LRVkgPSAnaGlzdG9yeS5lbnRyaWVzJztcblxuXHRwcml2YXRlIGhpc3Rvcnk6IEFycmF5PEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9ySGlzdG9yeUxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPEVkaXRvcklucHV0LCBEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVzb3VyY2VFeGNsdWRlTWF0Y2hlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBXaW5kb3dJZGxlVmFsdWUobWFpbldpbmRvdywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0UmVzb3VyY2VHbG9iTWF0Y2hlcixcblx0XHRcdHJvb3QgPT4gZ2V0RXhjbHVkZXMocm9vdCA/IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KHsgcmVzb3VyY2U6IHJvb3QgfSkgOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uPigpKSB8fCBPYmplY3QuY3JlYXRlKG51bGwpLFxuXHRcdFx0ZXZlbnQgPT4gZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oRklMRVNfRVhDTFVERV9DT05GSUcpIHx8IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKFNFQVJDSF9FWENMVURFX0NPTkZJRylcblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1hdGNoZXIub25FeHByZXNzaW9uQ2hhbmdlKCgpID0+IHRoaXMucmVtb3ZlRXhjbHVkZWRGcm9tSGlzdG9yeSgpKSk7XG5cblx0XHRyZXR1cm4gbWF0Y2hlcjtcblx0fSkpO1xuXG5cdHByaXZhdGUgaGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlSW5IaXN0b3J5KGVkaXRvclBhbmU/OiBJRWRpdG9yUGFuZSk6IHZvaWQge1xuXG5cdFx0Ly8gRW5zdXJlIHdlIGhhdmUgbm90IGNvbmZpZ3VyZWQgdG8gZXhjbHVkZSBpbnB1dCBhbmQgZG9uJ3QgdHJhY2sgaW52YWxpZCBpbnB1dHNcblx0XHRjb25zdCBlZGl0b3IgPSBlZGl0b3JQYW5lPy5pbnB1dDtcblx0XHRpZiAoIWVkaXRvciB8fCBlZGl0b3IuaXNEaXNwb3NlZCgpIHx8ICF0aGlzLmluY2x1ZGVJbkhpc3RvcnkoZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBhbnkgZXhpc3RpbmcgZW50cnkgYW5kIGFkZCB0byB0aGUgYmVnaW5uaW5nXG5cdFx0dGhpcy5yZW1vdmVGcm9tSGlzdG9yeShlZGl0b3IpO1xuXHRcdHRoaXMuYWRkVG9IaXN0b3J5KGVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIGFkZFRvSGlzdG9yeShlZGl0b3I6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQsIGluc2VydEZpcnN0ID0gdHJ1ZSk6IHZvaWQge1xuXHRcdHRoaXMuZW5zdXJlSGlzdG9yeUxvYWRlZCh0aGlzLmhpc3RvcnkpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeUlucHV0ID0gdGhpcy5lZGl0b3JIZWxwZXIucHJlZmVyUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3IpO1xuXHRcdGlmICghaGlzdG9yeUlucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSW5zZXJ0IGJhc2VkIG9uIHByZWZlcmVuY2Vcblx0XHRpZiAoaW5zZXJ0Rmlyc3QpIHtcblx0XHRcdHRoaXMuaGlzdG9yeS51bnNoaWZ0KGhpc3RvcnlJbnB1dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaGlzdG9yeS5wdXNoKGhpc3RvcnlJbnB1dCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzcGVjdCBtYXggZW50cmllcyBzZXR0aW5nXG5cdFx0aWYgKHRoaXMuaGlzdG9yeS5sZW5ndGggPiBIaXN0b3J5U2VydmljZS5NQVhfSElTVE9SWV9JVEVNUykge1xuXHRcdFx0dGhpcy5lZGl0b3JIZWxwZXIuY2xlYXJPbkVkaXRvckRpc3Bvc2UodGhpcy5oaXN0b3J5LnBvcCgpISwgdGhpcy5lZGl0b3JIaXN0b3J5TGlzdGVuZXJzKTtcblx0XHR9XG5cblx0XHQvLyBSZWFjdCB0byBlZGl0b3IgaW5wdXQgZGlzcG9zaW5nXG5cdFx0aWYgKGlzRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0dGhpcy5lZGl0b3JIZWxwZXIub25FZGl0b3JEaXNwb3NlKGVkaXRvciwgKCkgPT4gdGhpcy51cGRhdGVIaXN0b3J5T25FZGl0b3JEaXNwb3NlKGhpc3RvcnlJbnB1dCksIHRoaXMuZWRpdG9ySGlzdG9yeUxpc3RlbmVycyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVIaXN0b3J5T25FZGl0b3JEaXNwb3NlKGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdGlmIChpc0VkaXRvcklucHV0KGVkaXRvcikpIHtcblxuXHRcdFx0Ly8gQW55IG5vbiBzaWRlLWJ5LXNpZGUgZWRpdG9yIGlucHV0IGdldHMgcmVtb3ZlZCBkaXJlY3RseSBvbiBkaXNwb3NlXG5cdFx0XHRpZiAoIWlzU2lkZUJ5U2lkZUVkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVGcm9tSGlzdG9yeShlZGl0b3IpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaWRlLWJ5LXNpZGUgZWRpdG9ycyBnZXQgc3BlY2lhbCB0cmVhdG1lbnQ6IHdlIHRyeSB0byBkaXN0aWxsIHRoZVxuXHRcdFx0Ly8gcG9zc2libHkgdW50eXBlZCByZXNvdXJjZSBpbnB1dHMgZnJvbSBib3RoIHNpZGVzIHRvIGJlIGFibGUgdG9cblx0XHRcdC8vIG9mZmVyIHRoZXNlIGVudHJpZXMgZnJvbSB0aGUgaGlzdG9yeSB0byB0aGUgdXNlciBzdGlsbCB1bmxlc3Ncblx0XHRcdC8vIHRoZXkgYXJlIGV4Y2x1ZGVkLlxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlSW5wdXRzOiBJUmVzb3VyY2VFZGl0b3JJbnB1dFtdID0gW107XG5cdFx0XHRcdGNvbnN0IHNpZGVJbnB1dHMgPSBlZGl0b3IucHJpbWFyeS5tYXRjaGVzKGVkaXRvci5zZWNvbmRhcnkpID8gW2VkaXRvci5wcmltYXJ5XSA6IFtlZGl0b3IucHJpbWFyeSwgZWRpdG9yLnNlY29uZGFyeV07XG5cdFx0XHRcdGZvciAoY29uc3Qgc2lkZUlucHV0IG9mIHNpZGVJbnB1dHMpIHtcblx0XHRcdFx0XHRjb25zdCBjYW5kaWRhdGVSZXNvdXJjZUlucHV0ID0gdGhpcy5lZGl0b3JIZWxwZXIucHJlZmVyUmVzb3VyY2VFZGl0b3JJbnB1dChzaWRlSW5wdXQpO1xuXHRcdFx0XHRcdGlmIChpc1Jlc291cmNlRWRpdG9ySW5wdXQoY2FuZGlkYXRlUmVzb3VyY2VJbnB1dCkgJiYgdGhpcy5pbmNsdWRlSW5IaXN0b3J5KGNhbmRpZGF0ZVJlc291cmNlSW5wdXQpKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZUlucHV0cy5wdXNoKGNhbmRpZGF0ZVJlc291cmNlSW5wdXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEluc2VydCB0aGUgdW50eXBlZCByZXNvdXJjZSBpbnB1dHMgd2hlcmUgb3VyIGRpc3Bvc2VkXG5cdFx0XHRcdC8vIHNpZGUtYnktc2lkZSBlZGl0b3IgaW5wdXQgaXMgaW4gdGhlIGhpc3Rvcnkgc3RhY2tcblx0XHRcdFx0dGhpcy5yZXBsYWNlSW5IaXN0b3J5KGVkaXRvciwgLi4ucmVzb3VyY2VJbnB1dHMpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cblx0XHRcdC8vIFJlbW92ZSBhbnkgZWRpdG9yIHRoYXQgc2hvdWxkIG5vdCBiZSBpbmNsdWRlZCBpbiBoaXN0b3J5XG5cdFx0XHRpZiAoIXRoaXMuaW5jbHVkZUluSGlzdG9yeShlZGl0b3IpKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRnJvbUhpc3RvcnkoZWRpdG9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluY2x1ZGVJbkhpc3RvcnkoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGluY2x1ZGUgYW55IG5vbiBmaWxlc1xuXHRcdH1cblxuXHRcdHJldHVybiAhdGhpcy5yZXNvdXJjZUV4Y2x1ZGVNYXRjaGVyLnZhbHVlLm1hdGNoZXMoZWRpdG9yLnJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlRXhjbHVkZWRGcm9tSGlzdG9yeSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuc3VyZUhpc3RvcnlMb2FkZWQodGhpcy5oaXN0b3J5KTtcblxuXHRcdHRoaXMuaGlzdG9yeSA9IHRoaXMuaGlzdG9yeS5maWx0ZXIoZW50cnkgPT4ge1xuXHRcdFx0Y29uc3QgaW5jbHVkZSA9IHRoaXMuaW5jbHVkZUluSGlzdG9yeShlbnRyeSk7XG5cblx0XHRcdC8vIENsZWFudXAgYW55IGxpc3RlbmVycyBhc3NvY2lhdGVkIHdpdGggdGhlIGlucHV0IHdoZW4gcmVtb3ZpbmcgZnJvbSBoaXN0b3J5XG5cdFx0XHRpZiAoIWluY2x1ZGUpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JIZWxwZXIuY2xlYXJPbkVkaXRvckRpc3Bvc2UoZW50cnksIHRoaXMuZWRpdG9ySGlzdG9yeUxpc3RlbmVycyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBpbmNsdWRlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBtb3ZlSW5IaXN0b3J5KGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZXZlbnQuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5NT1ZFKSkge1xuXHRcdFx0Y29uc3QgcmVtb3ZlZCA9IHRoaXMucmVtb3ZlRnJvbUhpc3RvcnkoZXZlbnQpO1xuXHRcdFx0aWYgKHJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5hZGRUb0hpc3RvcnkoeyByZXNvdXJjZTogZXZlbnQudGFyZ2V0LnJlc291cmNlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlbW92ZUZyb21IaXN0b3J5KGFyZzE6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQgfCBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50KTogYm9vbGVhbiB7XG5cdFx0bGV0IHJlbW92ZWQgPSBmYWxzZTtcblxuXHRcdHRoaXMuZW5zdXJlSGlzdG9yeUxvYWRlZCh0aGlzLmhpc3RvcnkpO1xuXG5cdFx0dGhpcy5oaXN0b3J5ID0gdGhpcy5oaXN0b3J5LmZpbHRlcihlbnRyeSA9PiB7XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gdGhpcy5lZGl0b3JIZWxwZXIubWF0Y2hlc0VkaXRvcihhcmcxLCBlbnRyeSk7XG5cblx0XHRcdC8vIENsZWFudXAgYW55IGxpc3RlbmVycyBhc3NvY2lhdGVkIHdpdGggdGhlIGlucHV0IHdoZW4gcmVtb3ZpbmcgZnJvbSBoaXN0b3J5XG5cdFx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0XHR0aGlzLmVkaXRvckhlbHBlci5jbGVhck9uRWRpdG9yRGlzcG9zZShhcmcxLCB0aGlzLmVkaXRvckhpc3RvcnlMaXN0ZW5lcnMpO1xuXHRcdFx0XHRyZW1vdmVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuICFtYXRjaGVzO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlbW92ZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlcGxhY2VJbkhpc3RvcnkoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0LCAuLi5yZXBsYWNlbWVudHM6IFJlYWRvbmx5QXJyYXk8RWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dD4pOiB2b2lkIHtcblx0XHR0aGlzLmVuc3VyZUhpc3RvcnlMb2FkZWQodGhpcy5oaXN0b3J5KTtcblxuXHRcdGxldCByZXBsYWNlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgbmV3SGlzdG9yeTogQXJyYXk8RWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dD4gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuaGlzdG9yeSkge1xuXG5cdFx0XHQvLyBFbnRyeSBtYXRjaGVzIGFuZCBpcyBnb2luZyB0byBiZSBkaXNwb3NlZCArIHJlcGxhY2VkXG5cdFx0XHRpZiAodGhpcy5lZGl0b3JIZWxwZXIubWF0Y2hlc0VkaXRvcihlZGl0b3IsIGVudHJ5KSkge1xuXG5cdFx0XHRcdC8vIENsZWFudXAgYW55IGxpc3RlbmVycyBhc3NvY2lhdGVkIHdpdGggdGhlIGlucHV0IHdoZW4gcmVwbGFjaW5nIGZyb20gaGlzdG9yeVxuXHRcdFx0XHR0aGlzLmVkaXRvckhlbHBlci5jbGVhck9uRWRpdG9yRGlzcG9zZShlZGl0b3IsIHRoaXMuZWRpdG9ySGlzdG9yeUxpc3RlbmVycyk7XG5cblx0XHRcdFx0Ly8gSW5zZXJ0IHJlcGxhY2VtZW50cyBidXQgb25seSBvbmNlXG5cdFx0XHRcdGlmICghcmVwbGFjZWQpIHtcblx0XHRcdFx0XHRuZXdIaXN0b3J5LnB1c2goLi4ucmVwbGFjZW1lbnRzKTtcblx0XHRcdFx0XHRyZXBsYWNlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRW50cnkgZG9lcyBub3QgbWF0Y2gsIGJ1dCBvbmx5IGFkZCBpdCBpZiBpdCBkaWRuJ3QgbWF0Y2hcblx0XHRcdC8vIG91ciByZXBsYWNlbWVudHMgYWxyZWFkeVxuXHRcdFx0ZWxzZSBpZiAoIXJlcGxhY2VtZW50cy5zb21lKHJlcGxhY2VtZW50ID0+IHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNFZGl0b3IocmVwbGFjZW1lbnQsIGVudHJ5KSkpIHtcblx0XHRcdFx0bmV3SGlzdG9yeS5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgdGFyZ2V0IGVkaXRvciB0byByZXBsYWNlIHdhcyBub3QgZm91bmQsIG1ha2Ugc3VyZSB0b1xuXHRcdC8vIGluc2VydCB0aGUgcmVwbGFjZW1lbnRzIHRvIHRoZSBlbmQgdG8gZW5zdXJlIHdlIGdvdCB0aGVtXG5cdFx0aWYgKCFyZXBsYWNlZCkge1xuXHRcdFx0bmV3SGlzdG9yeS5wdXNoKC4uLnJlcGxhY2VtZW50cyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5oaXN0b3J5ID0gbmV3SGlzdG9yeTtcblx0fVxuXG5cdGNsZWFyUmVjZW50bHlPcGVuZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5oaXN0b3J5ID0gW107XG5cblx0XHR0aGlzLmVkaXRvckhpc3RvcnlMaXN0ZW5lcnMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdH1cblxuXHRnZXRIaXN0b3J5KCk6IHJlYWRvbmx5IChFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0KVtdIHtcblx0XHR0aGlzLmVuc3VyZUhpc3RvcnlMb2FkZWQodGhpcy5oaXN0b3J5KTtcblxuXHRcdHJldHVybiB0aGlzLmhpc3Rvcnk7XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZUhpc3RvcnlMb2FkZWQoaGlzdG9yeTogQXJyYXk8RWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dD4gfCB1bmRlZmluZWQpOiBhc3NlcnRzIGhpc3Rvcnkge1xuXHRcdGlmICghdGhpcy5oaXN0b3J5KSB7XG5cblx0XHRcdC8vIFVudGlsIGhpc3RvcnkgaXMgbG9hZGVkLCBpdCBpcyBqdXN0IGVtcHR5XG5cdFx0XHR0aGlzLmhpc3RvcnkgPSBbXTtcblxuXHRcdFx0Ly8gV2Ugd2FudCB0byBzZWVkIGhpc3RvcnkgZnJvbSBvcGVuZWQgZWRpdG9yc1xuXHRcdFx0Ly8gdG9vIGFzIHdlbGwgYXMgcHJldmlvdXMgc3RvcmVkIHN0YXRlLCBzbyB3ZVxuXHRcdFx0Ly8gbmVlZCB0byB3YWl0IGZvciB0aGUgZWRpdG9yIGdyb3VwcyBiZWluZyByZWFkeVxuXHRcdFx0aWYgKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmlzUmVhZHkpIHtcblx0XHRcdFx0dGhpcy5sb2FkSGlzdG9yeSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvckdyb3VwU2VydmljZS53aGVuUmVhZHk7XG5cblx0XHRcdFx0XHR0aGlzLmxvYWRIaXN0b3J5KCk7XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2FkSGlzdG9yeSgpOiB2b2lkIHtcblxuXHRcdC8vIEluaXQgYXMgZW1wdHkgYmVmb3JlIGFkZGluZyAtIHNpbmNlIHdlIGFyZSBhYm91dCB0b1xuXHRcdC8vIHBvcHVsYXRlIHRoZSBoaXN0b3J5IGZyb20gb3BlbmVkIGVkaXRvcnMsIHdlIGNhcHR1cmVcblx0XHQvLyB0aGUgcmlnaHQgb3JkZXIgaGVyZS5cblx0XHR0aGlzLmhpc3RvcnkgPSBbXTtcblxuXHRcdC8vIEFsbCBzdG9yZWQgZWRpdG9ycyBmcm9tIHByZXZpb3VzIHNlc3Npb25cblx0XHRjb25zdCBzdG9yZWRFZGl0b3JIaXN0b3J5ID0gdGhpcy5sb2FkSGlzdG9yeUZyb21TdG9yYWdlKCk7XG5cblx0XHQvLyBBbGwgcmVzdG9yZWQgZWRpdG9ycyBmcm9tIHByZXZpb3VzIHNlc3Npb25cblx0XHQvLyBpbiByZXZlcnNlIGVkaXRvciBmcm9tIGxlYXN0IHRvIG1vc3QgcmVjZW50bHlcblx0XHQvLyB1c2VkLlxuXHRcdGNvbnN0IG9wZW5lZEVkaXRvcnNMcnUgPSBbLi4udGhpcy5lZGl0b3JTZXJ2aWNlLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKV0ucmV2ZXJzZSgpO1xuXG5cdFx0Ly8gV2Ugd2FudCB0byBtZXJnZSB0aGUgb3BlbmVkIGVkaXRvcnMgZnJvbSB0aGUgbGFzdFxuXHRcdC8vIHNlc3Npb24gd2l0aCB0aGUgc3RvcmVkIGVkaXRvcnMgZnJvbSB0aGUgbGFzdFxuXHRcdC8vIHNlc3Npb24uIEJlY2F1c2Ugbm90IGFsbCBlZGl0b3JzIGNhbiBiZSBzZXJpYWxpc2VkXG5cdFx0Ly8gd2Ugd2FudCB0byBtYWtlIHN1cmUgdG8gaW5jbHVkZSBhbGwgb3BlbmVkIGVkaXRvcnNcblx0XHQvLyB0b28uXG5cdFx0Ly8gT3BlbmVkIGVkaXRvcnMgc2hvdWxkIGFsd2F5cyBiZSBmaXJzdCBpbiB0aGUgaGlzdG9yeVxuXG5cdFx0Y29uc3QgaGFuZGxlZEVkaXRvcnMgPSBuZXcgU2V0PHN0cmluZyAvKiByZXNvdXJjZSArIGVkaXRvcklkICovPigpO1xuXG5cdFx0Ly8gQWRkIGFsbCBvcGVuZWQgZWRpdG9ycyBmaXJzdFxuXHRcdGZvciAoY29uc3QgeyBlZGl0b3IgfSBvZiBvcGVuZWRFZGl0b3JzTHJ1KSB7XG5cdFx0XHRpZiAoIXRoaXMuaW5jbHVkZUluSGlzdG9yeShlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdG8gc2tpcCBkdXBsaWNhdGVzIGZyb20gdGhlIGVkaXRvcnMgTFJVXG5cdFx0XHRpZiAoZWRpdG9yLnJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlFbnRyeUlkID0gYCR7ZWRpdG9yLnJlc291cmNlLnRvU3RyaW5nKCl9LyR7ZWRpdG9yLmVkaXRvcklkfWA7XG5cdFx0XHRcdGlmIChoYW5kbGVkRWRpdG9ycy5oYXMoaGlzdG9yeUVudHJ5SWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIGFscmVhZHkgYWRkZWRcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGhhbmRsZWRFZGl0b3JzLmFkZChoaXN0b3J5RW50cnlJZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFkZCBpbnRvIGhpc3Rvcnlcblx0XHRcdHRoaXMuYWRkVG9IaXN0b3J5KGVkaXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHJlbWFpbmluZyBmcm9tIHN0b3JhZ2UgaWYgbm90IHRoZXJlIGFscmVhZHlcblx0XHQvLyBXZSBjaGVjayBvbiByZXNvdXJjZSBhbmQgYGVkaXRvcklkYCAoZnJvbSBgb3ZlcnJpZGVgKVxuXHRcdC8vIHRvIGZpZ3VyZSBvdXQgaWYgdGhlIGVkaXRvciBoYXMgYmVlbiBhbHJlYWR5IGFkZGVkLlxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHN0b3JlZEVkaXRvckhpc3RvcnkpIHtcblx0XHRcdGNvbnN0IGhpc3RvcnlFbnRyeUlkID0gYCR7ZWRpdG9yLnJlc291cmNlLnRvU3RyaW5nKCl9LyR7ZWRpdG9yLm9wdGlvbnM/Lm92ZXJyaWRlfWA7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdCFoYW5kbGVkRWRpdG9ycy5oYXMoaGlzdG9yeUVudHJ5SWQpICYmXG5cdFx0XHRcdHRoaXMuaW5jbHVkZUluSGlzdG9yeShlZGl0b3IpXG5cdFx0XHQpIHtcblx0XHRcdFx0aGFuZGxlZEVkaXRvcnMuYWRkKGhpc3RvcnlFbnRyeUlkKTtcblx0XHRcdFx0dGhpcy5hZGRUb0hpc3RvcnkoZWRpdG9yLCBmYWxzZSAvKiBhdCB0aGUgZW5kICovKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGxvYWRIaXN0b3J5RnJvbVN0b3JhZ2UoKTogQXJyYXk8SVJlc291cmNlRWRpdG9ySW5wdXQ+IHtcblx0XHRjb25zdCBlbnRyaWVzOiBJUmVzb3VyY2VFZGl0b3JJbnB1dFtdID0gW107XG5cblx0XHRjb25zdCBlbnRyaWVzUmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoSGlzdG9yeVNlcnZpY2UuSElTVE9SWV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKGVudHJpZXNSYXcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGVudHJpZXNQYXJzZWQ6IElTZXJpYWxpemVkRWRpdG9ySGlzdG9yeUVudHJ5W10gPSBKU09OLnBhcnNlKGVudHJpZXNSYXcpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5UGFyc2VkIG9mIGVudHJpZXNQYXJzZWQpIHtcblx0XHRcdFx0XHRpZiAoIWVudHJ5UGFyc2VkLmVkaXRvciB8fCAhZW50cnlQYXJzZWQuZWRpdG9yLnJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTsgLy8gdW5leHBlY3RlZCBkYXRhIGZvcm1hdFxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHQuLi5lbnRyeVBhcnNlZC5lZGl0b3IsXG5cdFx0XHRcdFx0XHRcdHJlc291cmNlOiB0eXBlb2YgZW50cnlQYXJzZWQuZWRpdG9yLnJlc291cmNlID09PSAnc3RyaW5nJyA/XG5cdFx0XHRcdFx0XHRcdFx0VVJJLnBhcnNlKGVudHJ5UGFyc2VkLmVkaXRvci5yZXNvdXJjZSkgOiAgXHQvLyAgZnJvbSAxLjY3Lng6IFVSSSBpcyBzdG9yZWQgZWZmaWNpZW50bHkgYXMgVVJJLnRvU3RyaW5nKClcblx0XHRcdFx0XHRcdFx0XHRVUkkuZnJvbShlbnRyeVBhcnNlZC5lZGl0b3IucmVzb3VyY2UpXHRcdC8vIHVudGlsIDEuNjYueDogVVJJIHdhcyBzdG9yZWQgdmVyeSB2ZXJib3NlIGFzIFVSSS50b0pTT04oKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTsgLy8gZG8gbm90IGZhaWwgZW50aXJlIGhpc3Rvcnkgd2hlbiBvbmUgZW50cnkgZmFpbHNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTsgLy8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk5MDc1XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVudHJpZXM7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaGlzdG9yeSkge1xuXHRcdFx0cmV0dXJuOyAvLyBub3RoaW5nIHRvIHNhdmUgYmVjYXVzZSBoaXN0b3J5IHdhcyBub3QgdXNlZFxuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJpZXM6IElTZXJpYWxpemVkRWRpdG9ySGlzdG9yeUVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiB0aGlzLmhpc3RvcnkpIHtcblx0XHRcdGlmIChpc0VkaXRvcklucHV0KGVkaXRvcikgfHwgIWlzUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBvbmx5IHNhdmUgcmVzb3VyY2UgZWRpdG9yIGlucHV0c1xuXHRcdFx0fVxuXG5cdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRlZGl0b3I6IHtcblx0XHRcdFx0XHQuLi5lZGl0b3IsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IGVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoSGlzdG9yeVNlcnZpY2UuSElTVE9SWV9TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkoZW50cmllcyksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTGFzdCBBY3RpdmUgV29ya3NwYWNlL0ZpbGVcblxuXHRnZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdChzY2hlbWVGaWx0ZXI/OiBzdHJpbmcsIGF1dGhvcml0eUZpbHRlcj86IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyBObyBGb2xkZXI6IHJldHVybiBlYXJseVxuXHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0aWYgKGZvbGRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFNpbmdsZSBGb2xkZXI6IHJldHVybiBlYXJseVxuXHRcdGlmIChmb2xkZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBmb2xkZXJzWzBdLnVyaTtcblx0XHRcdGlmICgoIXNjaGVtZUZpbHRlciB8fCByZXNvdXJjZS5zY2hlbWUgPT09IHNjaGVtZUZpbHRlcikgJiYgKCFhdXRob3JpdHlGaWx0ZXIgfHwgcmVzb3VyY2UuYXV0aG9yaXR5ID09PSBhdXRob3JpdHlGaWx0ZXIpKSB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBNdWx0aXBsZSBmb2xkZXJzOiBmaW5kIHRoZSBsYXN0IGFjdGl2ZSBvbmVcblx0XHRmb3IgKGNvbnN0IGlucHV0IG9mIHRoaXMuZ2V0SGlzdG9yeSgpKSB7XG5cdFx0XHRpZiAoaXNFZGl0b3JJbnB1dChpbnB1dCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzY2hlbWVGaWx0ZXIgJiYgaW5wdXQucmVzb3VyY2Uuc2NoZW1lICE9PSBzY2hlbWVGaWx0ZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhdXRob3JpdHlGaWx0ZXIgJiYgaW5wdXQucmVzb3VyY2UuYXV0aG9yaXR5ICE9PSBhdXRob3JpdHlGaWx0ZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc291cmNlV29ya3NwYWNlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoaW5wdXQucmVzb3VyY2UpO1xuXHRcdFx0aWYgKHJlc291cmNlV29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZVdvcmtzcGFjZS51cmk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbGJhY2sgdG8gZmlyc3Qgd29ya3NwYWNlIG1hdGNoaW5nIHNjaGVtZSBmaWx0ZXIgaWYgYW55XG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgZm9sZGVycykge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBmb2xkZXIudXJpO1xuXHRcdFx0aWYgKCghc2NoZW1lRmlsdGVyIHx8IHJlc291cmNlLnNjaGVtZSA9PT0gc2NoZW1lRmlsdGVyKSAmJiAoIWF1dGhvcml0eUZpbHRlciB8fCByZXNvdXJjZS5hdXRob3JpdHkgPT09IGF1dGhvcml0eUZpbHRlcikpIHtcblx0XHRcdFx0cmV0dXJuIHJlc291cmNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRMYXN0QWN0aXZlRmlsZShmaWx0ZXJCeVNjaGVtZTogc3RyaW5nLCBmaWx0ZXJCeUF1dGhvcml0eT86IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBpbnB1dCBvZiB0aGlzLmdldEhpc3RvcnkoKSkge1xuXHRcdFx0bGV0IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXNFZGl0b3JJbnB1dChpbnB1dCkpIHtcblx0XHRcdFx0cmVzb3VyY2UgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGlucHV0LCB7IGZpbHRlckJ5U2NoZW1lIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb3VyY2UgPSBpbnB1dC5yZXNvdXJjZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc291cmNlICYmIHJlc291cmNlLnNjaGVtZSA9PT0gZmlsdGVyQnlTY2hlbWUgJiYgKCFmaWx0ZXJCeUF1dGhvcml0eSB8fCByZXNvdXJjZS5hdXRob3JpdHkgPT09IGZpbHRlckJ5QXV0aG9yaXR5KSkge1xuXHRcdFx0XHRyZXR1cm4gcmVzb3VyY2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBbLCBzdGFja10gb2YgdGhpcy5lZGl0b3JHcm91cFNjb3BlZE5hdmlnYXRpb25TdGFja3MpIHtcblx0XHRcdHN0YWNrLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgWywgZWRpdG9yc10gb2YgdGhpcy5lZGl0b3JTY29wZWROYXZpZ2F0aW9uU3RhY2tzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFssIHN0YWNrXSBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdHN0YWNrLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgWywgbGlzdGVuZXJdIG9mIHRoaXMuZWRpdG9ySGlzdG9yeUxpc3RlbmVycykge1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJSGlzdG9yeVNlcnZpY2UsIEhpc3RvcnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5cbmNsYXNzIEVkaXRvclNlbGVjdGlvblN0YXRlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcklkZW50aWZpZXI6IElFZGl0b3JJZGVudGlmaWVyLFxuXHRcdHJlYWRvbmx5IHNlbGVjdGlvbjogSUVkaXRvclBhbmVTZWxlY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZWFzb246IEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24gfCB1bmRlZmluZWRcblx0KSB7IH1cblxuXHRqdXN0aWZpZXNOZXdOYXZpZ2F0aW9uRW50cnkob3RoZXI6IEVkaXRvclNlbGVjdGlvblN0YXRlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuZWRpdG9ySWRlbnRpZmllci5ncm91cElkICE9PSBvdGhlci5lZGl0b3JJZGVudGlmaWVyLmdyb3VwSWQpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBkaWZmZXJlbnQgZ3JvdXBcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZWRpdG9ySWRlbnRpZmllci5lZGl0b3IubWF0Y2hlcyhvdGhlci5lZGl0b3JJZGVudGlmaWVyLmVkaXRvcikpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBkaWZmZXJlbnQgZWRpdG9yXG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnNlbGVjdGlvbiB8fCAhb3RoZXIuc2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gdW5rbm93biBzZWxlY3Rpb25zXG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5zZWxlY3Rpb24uY29tcGFyZShvdGhlci5zZWxlY3Rpb24pO1xuXG5cdFx0aWYgKHJlc3VsdCA9PT0gRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQuU0lNSUxBUiAmJiAob3RoZXIucmVhc29uID09PSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLk5BVklHQVRJT04gfHwgb3RoZXIucmVhc29uID09PSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkpVTVApKSB7XG5cdFx0XHQvLyBsZXQgbmF2aWdhdGlvbiBzb3VyY2VzIHdpbiBldmVuIGlmIHRoZSBzZWxlY3Rpb24gaXMgYFNJTUlMQVJgXG5cdFx0XHQvLyAoZS5nLiBcIkdvIHRvIGRlZmluaXRpb25cIiBzaG91bGQgYWRkIGEgaGlzdG9yeSBlbnRyeSlcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQgPT09IEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LkRJRkZFUkVOVDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUVkaXRvck5hdmlnYXRpb25TdGFja3MgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcblxuXHRjYW5Hb0ZvcndhcmQoZmlsdGVyPzogR29GaWx0ZXIpOiBib29sZWFuO1xuXHRnb0ZvcndhcmQoZmlsdGVyPzogR29GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRjYW5Hb0JhY2soZmlsdGVyPzogR29GaWx0ZXIpOiBib29sZWFuO1xuXHRnb0JhY2soZmlsdGVyPzogR29GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRnb1ByZXZpb3VzKGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPjtcblx0Y2FuR29MYXN0KGZpbHRlcj86IEdvRmlsdGVyKTogYm9vbGVhbjtcblx0Z29MYXN0KGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPjtcblxuXHRoYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2UoZWRpdG9yUGFuZT86IElFZGl0b3JQYW5lKTogdm9pZDtcblx0aGFuZGxlQWN0aXZlRWRpdG9yU2VsZWN0aW9uQ2hhbmdlKGVkaXRvclBhbmU6IElFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbiwgZXZlbnQ6IElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkO1xuXG5cdGNsZWFyKCk6IHZvaWQ7XG5cdHJlbW92ZShhcmcxOiBFZGl0b3JJbnB1dCB8IEZpbGVDaGFuZ2VzRXZlbnQgfCBGaWxlT3BlcmF0aW9uRXZlbnQgfCBHcm91cElkZW50aWZpZXIpOiB2b2lkO1xuXHRtb3ZlKGV2ZW50OiBGaWxlT3BlcmF0aW9uRXZlbnQpOiB2b2lkO1xufVxuXG5jbGFzcyBFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNlbGVjdGlvbnNTdGFjazogRWRpdG9yTmF2aWdhdGlvblN0YWNrO1xuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRzU3RhY2s6IEVkaXRvck5hdmlnYXRpb25TdGFjaztcblx0cHJpdmF0ZSByZWFkb25seSBuYXZpZ2F0aW9uc1N0YWNrOiBFZGl0b3JOYXZpZ2F0aW9uU3RhY2s7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdGFja3M6IEVkaXRvck5hdmlnYXRpb25TdGFja1tdO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNjb3BlOiBHb1Njb3BlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnNlbGVjdGlvbnNTdGFjayA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yTmF2aWdhdGlvblN0YWNrLCBHb0ZpbHRlci5OT05FLCB0aGlzLnNjb3BlKSk7XG5cdFx0dGhpcy5lZGl0c1N0YWNrID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JOYXZpZ2F0aW9uU3RhY2ssIEdvRmlsdGVyLkVESVRTLCB0aGlzLnNjb3BlKSk7XG5cdFx0dGhpcy5uYXZpZ2F0aW9uc1N0YWNrID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JOYXZpZ2F0aW9uU3RhY2ssIEdvRmlsdGVyLk5BVklHQVRJT04sIHRoaXMuc2NvcGUpKTtcblxuXHRcdHRoaXMuc3RhY2tzID0gW1xuXHRcdFx0dGhpcy5zZWxlY3Rpb25zU3RhY2ssXG5cdFx0XHR0aGlzLmVkaXRzU3RhY2ssXG5cdFx0XHR0aGlzLm5hdmlnYXRpb25zU3RhY2tcblx0XHRdO1xuXG5cdFx0dGhpcy5vbkRpZENoYW5nZSA9IEV2ZW50LmFueShcblx0XHRcdHRoaXMuc2VsZWN0aW9uc1N0YWNrLm9uRGlkQ2hhbmdlLFxuXHRcdFx0dGhpcy5lZGl0c1N0YWNrLm9uRGlkQ2hhbmdlLFxuXHRcdFx0dGhpcy5uYXZpZ2F0aW9uc1N0YWNrLm9uRGlkQ2hhbmdlXG5cdFx0KTtcblx0fVxuXG5cdGNhbkdvRm9yd2FyZChmaWx0ZXI/OiBHb0ZpbHRlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdldFN0YWNrKGZpbHRlcikuY2FuR29Gb3J3YXJkKCk7XG5cdH1cblxuXHRnb0ZvcndhcmQoZmlsdGVyPzogR29GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdGFjayhmaWx0ZXIpLmdvRm9yd2FyZCgpO1xuXHR9XG5cblx0Y2FuR29CYWNrKGZpbHRlcj86IEdvRmlsdGVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RhY2soZmlsdGVyKS5jYW5Hb0JhY2soKTtcblx0fVxuXG5cdGdvQmFjayhmaWx0ZXI/OiBHb0ZpbHRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFN0YWNrKGZpbHRlcikuZ29CYWNrKCk7XG5cdH1cblxuXHRnb1ByZXZpb3VzKGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RhY2soZmlsdGVyKS5nb1ByZXZpb3VzKCk7XG5cdH1cblxuXHRjYW5Hb0xhc3QoZmlsdGVyPzogR29GaWx0ZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdGFjayhmaWx0ZXIpLmNhbkdvTGFzdCgpO1xuXHR9XG5cblx0Z29MYXN0KGZpbHRlcj86IEdvRmlsdGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RhY2soZmlsdGVyKS5nb0xhc3QoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RhY2soZmlsdGVyID0gR29GaWx0ZXIuTk9ORSk6IEVkaXRvck5hdmlnYXRpb25TdGFjayB7XG5cdFx0c3dpdGNoIChmaWx0ZXIpIHtcblx0XHRcdGNhc2UgR29GaWx0ZXIuTk9ORTogcmV0dXJuIHRoaXMuc2VsZWN0aW9uc1N0YWNrO1xuXHRcdFx0Y2FzZSBHb0ZpbHRlci5FRElUUzogcmV0dXJuIHRoaXMuZWRpdHNTdGFjaztcblx0XHRcdGNhc2UgR29GaWx0ZXIuTkFWSUdBVElPTjogcmV0dXJuIHRoaXMubmF2aWdhdGlvbnNTdGFjaztcblx0XHR9XG5cdH1cblxuXHRoYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2UoZWRpdG9yUGFuZT86IElFZGl0b3JQYW5lKTogdm9pZCB7XG5cblx0XHQvLyBBbHdheXMgc2VuZCB0byBzZWxlY3Rpb25zIG5hdmlnYXRpb24gc3RhY2tcblx0XHR0aGlzLnNlbGVjdGlvbnNTdGFjay5ub3RpZnlOYXZpZ2F0aW9uKGVkaXRvclBhbmUpO1xuXHR9XG5cblx0aGFuZGxlQWN0aXZlRWRpdG9yU2VsZWN0aW9uQ2hhbmdlKGVkaXRvclBhbmU6IElFZGl0b3JQYW5lV2l0aFNlbGVjdGlvbiwgZXZlbnQ6IElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuc2VsZWN0aW9uc1N0YWNrLmN1cnJlbnQ7XG5cblx0XHQvLyBBbHdheXMgc2VuZCB0byBzZWxlY3Rpb25zIG5hdmlnYXRpb24gc3RhY2tcblx0XHR0aGlzLnNlbGVjdGlvbnNTdGFjay5ub3RpZnlOYXZpZ2F0aW9uKGVkaXRvclBhbmUsIGV2ZW50KTtcblxuXHRcdC8vIENoZWNrIGZvciBlZGl0c1xuXHRcdGlmIChldmVudC5yZWFzb24gPT09IEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uRURJVCkge1xuXHRcdFx0dGhpcy5lZGl0c1N0YWNrLm5vdGlmeU5hdmlnYXRpb24oZWRpdG9yUGFuZSwgZXZlbnQpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBuYXZpZ2F0aW9uc1xuXHRcdC8vXG5cdFx0Ly8gTm90ZTogaWdub3JlIGlmIHNlbGVjdGlvbnMgbmF2aWdhdGlvbiBzdGFjayBpcyBuYXZpZ2F0aW5nIGJlY2F1c2Vcblx0XHQvLyBpbiB0aGF0IGNhc2Ugd2UgZG8gbm90IHdhbnQgdG8gcmVjZWl2ZSByZXBlYXRlZCBlbnRyaWVzIGluXG5cdFx0Ly8gdGhlIG5hdmlnYXRpb24gc3RhY2suXG5cdFx0ZWxzZSBpZiAoXG5cdFx0XHQoZXZlbnQucmVhc29uID09PSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLk5BVklHQVRJT04gfHwgZXZlbnQucmVhc29uID09PSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkpVTVApICYmXG5cdFx0XHQhdGhpcy5zZWxlY3Rpb25zU3RhY2suaXNOYXZpZ2F0aW5nKClcblx0XHQpIHtcblxuXHRcdFx0Ly8gQSBcIkpVTVBcIiBuYXZpZ2F0aW9uIHNlbGVjdGlvbiBjaGFuZ2UgYWx3YXlzIGhhcyBhIHNvdXJjZSBhbmRcblx0XHRcdC8vIHRhcmdldC4gQXMgc3VjaCwgd2UgYWRkIHRoZSBwcmV2aW91cyBlbnRyeSBvZiB0aGUgc2VsZWN0aW9uc1xuXHRcdFx0Ly8gbmF2aWdhdGlvbiBzdGFjayBzbyB0aGF0IG91ciBuYXZpZ2F0aW9uIHN0YWNrIHJlY2VpdmVzIGJvdGhcblx0XHRcdC8vIGVudHJpZXMgdW5sZXNzIHRoZSB1c2VyIGlzIGN1cnJlbnRseSBuYXZpZ2F0aW5nLlxuXG5cdFx0XHRpZiAoZXZlbnQucmVhc29uID09PSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkpVTVAgJiYgIXRoaXMubmF2aWdhdGlvbnNTdGFjay5pc05hdmlnYXRpbmcoKSkge1xuXHRcdFx0XHRpZiAocHJldmlvdXMpIHtcblx0XHRcdFx0XHR0aGlzLm5hdmlnYXRpb25zU3RhY2suYWRkT3JSZXBsYWNlKHByZXZpb3VzLmdyb3VwSWQsIHByZXZpb3VzLmVkaXRvciwgcHJldmlvdXMuc2VsZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm5hdmlnYXRpb25zU3RhY2subm90aWZ5TmF2aWdhdGlvbihlZGl0b3JQYW5lLCBldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzdGFjayBvZiB0aGlzLnN0YWNrcykge1xuXHRcdFx0c3RhY2suY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmUoYXJnMTogRWRpdG9ySW5wdXQgfCBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50IHwgR3JvdXBJZGVudGlmaWVyKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzdGFjayBvZiB0aGlzLnN0YWNrcykge1xuXHRcdFx0c3RhY2sucmVtb3ZlKGFyZzEpO1xuXHRcdH1cblx0fVxuXG5cdG1vdmUoZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc3RhY2sgb2YgdGhpcy5zdGFja3MpIHtcblx0XHRcdHN0YWNrLm1vdmUoZXZlbnQpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBOb09wRWRpdG9yTmF2aWdhdGlvblN0YWNrcyBpbXBsZW1lbnRzIElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tzIHtcblx0b25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXG5cdGNhbkdvRm9yd2FyZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIGdvRm9yd2FyZCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRjYW5Hb0JhY2soKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBnb0JhY2soKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZ29QcmV2aW91cygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRjYW5Hb0xhc3QoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBnb0xhc3QoKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRoYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2UoKTogdm9pZCB7IH1cblx0aGFuZGxlQWN0aXZlRWRpdG9yU2VsZWN0aW9uQ2hhbmdlKCk6IHZvaWQgeyB9XG5cblx0Y2xlYXIoKTogdm9pZCB7IH1cblx0cmVtb3ZlKCk6IHZvaWQgeyB9XG5cdG1vdmUoKTogdm9pZCB7IH1cblxuXHRkaXNwb3NlKCk6IHZvaWQgeyB9XG59XG5cbmludGVyZmFjZSBJRWRpdG9yTmF2aWdhdGlvblN0YWNrRW50cnkge1xuXHRncm91cElkOiBHcm91cElkZW50aWZpZXI7XG5cdGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dDtcblx0c2VsZWN0aW9uPzogSUVkaXRvclBhbmVTZWxlY3Rpb247XG59XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JOYXZpZ2F0aW9uU3RhY2sgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfU1RBQ0tfU0laRSA9IDUwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXBFZGl0b3JUb0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxFZGl0b3JJbnB1dCwgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBtYXBHcm91cFRvRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPEdyb3VwSWRlbnRpZmllciwgSURpc3Bvc2FibGU+KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckhlbHBlcjogRWRpdG9ySGVscGVyO1xuXG5cdHByaXZhdGUgc3RhY2s6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tFbnRyeVtdID0gW107XG5cblx0cHJpdmF0ZSBpbmRleCA9IC0xO1xuXHRwcml2YXRlIHByZXZpb3VzSW5kZXggPSAtMTtcblxuXHRwcml2YXRlIG5hdmlnYXRpbmcgPSBmYWxzZTtcblxuXHRwcml2YXRlIGN1cnJlbnRTZWxlY3Rpb25TdGF0ZTogRWRpdG9yU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Z2V0IGN1cnJlbnQoKTogSUVkaXRvck5hdmlnYXRpb25TdGFja0VudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zdGFja1t0aGlzLmluZGV4XTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IGN1cnJlbnQoZW50cnk6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tFbnRyeSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0dGhpcy5zdGFja1t0aGlzLmluZGV4XSA9IGVudHJ5O1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyOiBHb0ZpbHRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNjb3BlOiBHb1Njb3BlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVkaXRvckhlbHBlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvckhlbHBlcik7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy50cmFjZVN0YWNrKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxvZ1NlcnZpY2Uub25EaWRDaGFuZ2VMb2dMZXZlbCgoKSA9PiB0aGlzLnRyYWNlU3RhY2soKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkUmVtb3ZlR3JvdXAoZ3JvdXAgPT4ge1xuXHRcdFx0dGhpcy5tYXBHcm91cFRvRGlzcG9zYWJsZS5kZWxldGVBbmREaXNwb3NlKGdyb3VwLmlkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHRyYWNlU3RhY2soKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubG9nU2VydmljZS5nZXRMZXZlbCgpICE9PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5TGFiZWxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5zdGFjaykge1xuXHRcdFx0aWYgKHR5cGVvZiBlbnRyeS5zZWxlY3Rpb24/LmxvZyA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRlbnRyeUxhYmVscy5wdXNoKGAtIGdyb3VwOiAke2VudHJ5Lmdyb3VwSWR9LCBlZGl0b3I6ICR7ZW50cnkuZWRpdG9yLnJlc291cmNlPy50b1N0cmluZygpfSwgc2VsZWN0aW9uOiAke2VudHJ5LnNlbGVjdGlvbi5sb2coKX1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVudHJ5TGFiZWxzLnB1c2goYC0gZ3JvdXA6ICR7ZW50cnkuZ3JvdXBJZH0sIGVkaXRvcjogJHtlbnRyeS5lZGl0b3IucmVzb3VyY2U/LnRvU3RyaW5nKCl9LCBzZWxlY3Rpb246IDxub25lPmApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlbnRyeUxhYmVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMudHJhY2UoYGluZGV4OiAke3RoaXMuaW5kZXh9LCBuYXZpZ2F0aW5nOiAke3RoaXMuaXNOYXZpZ2F0aW5nKCl9OiA8ZW1wdHk+YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJhY2UoYGluZGV4OiAke3RoaXMuaW5kZXh9LCBuYXZpZ2F0aW5nOiAke3RoaXMuaXNOYXZpZ2F0aW5nKCl9XG4ke2VudHJ5TGFiZWxzLmpvaW4oJ1xcbicpfVxuXHRcdFx0YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0cmFjZShtc2c6IHN0cmluZywgZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHwgbnVsbCA9IG51bGwsIGV2ZW50PzogSUVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSAhPT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZmlsdGVyTGFiZWw6IHN0cmluZztcblx0XHRzd2l0Y2ggKHRoaXMuZmlsdGVyKSB7XG5cdFx0XHRjYXNlIEdvRmlsdGVyLk5PTkU6IGZpbHRlckxhYmVsID0gJ2dsb2JhbCc7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBHb0ZpbHRlci5FRElUUzogZmlsdGVyTGFiZWwgPSAnZWRpdHMnO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR29GaWx0ZXIuTkFWSUdBVElPTjogZmlsdGVyTGFiZWwgPSAnbmF2aWdhdGlvbic7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGxldCBzY29wZUxhYmVsOiBzdHJpbmc7XG5cdFx0c3dpdGNoICh0aGlzLnNjb3BlKSB7XG5cdFx0XHRjYXNlIEdvU2NvcGUuREVGQVVMVDogc2NvcGVMYWJlbCA9ICdkZWZhdWx0Jztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdvU2NvcGUuRURJVE9SX0dST1VQOiBzY29wZUxhYmVsID0gJ2VkaXRvckdyb3VwJztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdvU2NvcGUuRURJVE9SOiBzY29wZUxhYmVsID0gJ2VkaXRvcic7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3IgIT09IG51bGwpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0hpc3Rvcnkgc3RhY2sgJHtmaWx0ZXJMYWJlbH0tJHtzY29wZUxhYmVsfV06ICR7bXNnfSAoZWRpdG9yOiAke2VkaXRvcj8ucmVzb3VyY2U/LnRvU3RyaW5nKCl9LCBldmVudDogJHt0aGlzLnRyYWNlRXZlbnQoZXZlbnQpfSlgKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbSGlzdG9yeSBzdGFjayAke2ZpbHRlckxhYmVsfS0ke3Njb3BlTGFiZWx9XTogJHttc2d9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0cmFjZUV2ZW50KGV2ZW50PzogSUVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VFdmVudCk6IHN0cmluZyB7XG5cdFx0aWYgKCFldmVudCkge1xuXHRcdFx0cmV0dXJuICc8bm9uZT4nO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoZXZlbnQucmVhc29uKSB7XG5cdFx0XHRjYXNlIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uRURJVDogcmV0dXJuICdlZGl0Jztcblx0XHRcdGNhc2UgRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZVJlYXNvbi5OQVZJR0FUSU9OOiByZXR1cm4gJ25hdmlnYXRpb24nO1xuXHRcdFx0Y2FzZSBFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlUmVhc29uLkpVTVA6IHJldHVybiAnanVtcCc7XG5cdFx0XHRjYXNlIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uUFJPR1JBTU1BVElDOiByZXR1cm4gJ3Byb2dyYW1tYXRpYyc7XG5cdFx0XHRjYXNlIEVkaXRvclBhbmVTZWxlY3Rpb25DaGFuZ2VSZWFzb24uVVNFUjogcmV0dXJuICd1c2VyJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyR3JvdXBMaXN0ZW5lcnMoZ3JvdXBJZDogR3JvdXBJZGVudGlmaWVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1hcEdyb3VwVG9EaXNwb3NhYmxlLmhhcyhncm91cElkKSkge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChncm91cElkKTtcblx0XHRcdGlmIChncm91cCkge1xuXHRcdFx0XHR0aGlzLm1hcEdyb3VwVG9EaXNwb3NhYmxlLnNldChncm91cElkLCBncm91cC5vbldpbGxNb3ZlRWRpdG9yKGUgPT4gdGhpcy5vbldpbGxNb3ZlRWRpdG9yKGUpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbldpbGxNb3ZlRWRpdG9yKGU6IElFZGl0b3JXaWxsTW92ZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy50cmFjZSgnb25XaWxsTW92ZUVkaXRvcigpJywgZS5lZGl0b3IpO1xuXG5cdFx0aWYgKHRoaXMuc2NvcGUgPT09IEdvU2NvcGUuRURJVE9SX0dST1VQKSB7XG5cdFx0XHRyZXR1cm47IC8vIGlnbm9yZSBtb3ZlIGV2ZW50cyBpZiBvdXIgc2NvcGUgaXMgZ3JvdXAgYmFzZWRcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuc3RhY2spIHtcblx0XHRcdGlmIChlbnRyeS5ncm91cElkICE9PSBlLmdyb3VwSWQpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIG5vdCBpbiB0aGUgZ3JvdXAgdGhhdCByZXBvcnRlZCB0aGUgZXZlbnRcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLmVkaXRvckhlbHBlci5tYXRjaGVzRWRpdG9yKGUuZWRpdG9yLCBlbnRyeS5lZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBub3QgdGhlIGVkaXRvciB0aGlzIGV2ZW50IGlzIGFib3V0XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSB0byB0YXJnZXQgZ3JvdXBcblx0XHRcdGVudHJ5Lmdyb3VwSWQgPSBlLnRhcmdldDtcblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gU3RhY2sgTXV0YXRpb25cblxuXHRub3RpZnlOYXZpZ2F0aW9uKGVkaXRvclBhbmU6IElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkLCBldmVudD86IElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNlKCdub3RpZnlOYXZpZ2F0aW9uKCknLCBlZGl0b3JQYW5lPy5pbnB1dCwgZXZlbnQpO1xuXG5cdFx0Y29uc3QgaXNTZWxlY3Rpb25Bd2FyZUVkaXRvclBhbmUgPSBpc0VkaXRvclBhbmVXaXRoU2VsZWN0aW9uKGVkaXRvclBhbmUpO1xuXHRcdGNvbnN0IGhhc1ZhbGlkRWRpdG9yID0gZWRpdG9yUGFuZT8uaW5wdXQgJiYgIWVkaXRvclBhbmUuaW5wdXQuaXNEaXNwb3NlZCgpO1xuXG5cdFx0Ly8gVHJlYXQgZWRpdG9yIGNoYW5nZXMgdGhhdCBoYXBwZW4gYXMgcGFydCBvZiBzdGFjayBuYXZpZ2F0aW9uIHNwZWNpYWxseVxuXHRcdC8vIHdlIGRvIG5vdCB3YW50IHRvIGFkZCBhIG5ldyBzdGFjayBlbnRyeSBhcyBhIG1hdHRlciBvZiBuYXZpZ2F0aW5nIHRoZVxuXHRcdC8vIHN0YWNrIGJ1dCB3ZSBuZWVkIHRvIGtlZXAgb3VyIGN1cnJlbnRFZGl0b3JTZWxlY3Rpb25TdGF0ZSB1cCB0byBkYXRlXG5cdFx0Ly8gd2l0aCB0aGUgbmF2aWd0aW9uIHRoYXQgb2NjdXJzLlxuXHRcdGlmICh0aGlzLm5hdmlnYXRpbmcpIHtcblx0XHRcdHRoaXMudHJhY2UoYG5vdGlmeU5hdmlnYXRpb24oKSBpZ25vcmluZyAobmF2aWdhdGluZylgLCBlZGl0b3JQYW5lPy5pbnB1dCwgZXZlbnQpO1xuXG5cdFx0XHRpZiAoaXNTZWxlY3Rpb25Bd2FyZUVkaXRvclBhbmUgJiYgaGFzVmFsaWRFZGl0b3IpIHtcblx0XHRcdFx0dGhpcy50cmFjZSgnbm90aWZ5TmF2aWdhdGlvbigpIHVwZGF0aW5nIGN1cnJlbnQgc2VsZWN0aW9uIHN0YXRlJywgZWRpdG9yUGFuZT8uaW5wdXQsIGV2ZW50KTtcblxuXHRcdFx0XHR0aGlzLmN1cnJlbnRTZWxlY3Rpb25TdGF0ZSA9IG5ldyBFZGl0b3JTZWxlY3Rpb25TdGF0ZSh7IGdyb3VwSWQ6IGVkaXRvclBhbmUuZ3JvdXAuaWQsIGVkaXRvcjogZWRpdG9yUGFuZS5pbnB1dCB9LCBlZGl0b3JQYW5lLmdldFNlbGVjdGlvbigpLCBldmVudD8ucmVhc29uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoJ25vdGlmeU5hdmlnYXRpb24oKSBkcm9wcGluZyBjdXJyZW50IHNlbGVjdGlvbiBzdGF0ZScsIGVkaXRvclBhbmU/LmlucHV0LCBldmVudCk7XG5cblx0XHRcdFx0dGhpcy5jdXJyZW50U2VsZWN0aW9uU3RhdGUgPSB1bmRlZmluZWQ7IC8vIHdlIG5hdmlnYXRlZCB0byBhIG5vbi1zZWxlY3Rpb24gYXdhcmUgb3IgZGlzcG9zZWQgZWRpdG9yXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTm9ybWFsIG5hdmlnYXRpb24gbm90IHBhcnQgb2Ygc3RhY2sgbmF2aWdhdGlvblxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy50cmFjZShgbm90aWZ5TmF2aWdhdGlvbigpIG5vdCBpZ25vcmluZ2AsIGVkaXRvclBhbmU/LmlucHV0LCBldmVudCk7XG5cblx0XHRcdC8vIE5hdmlnYXRpb24gaW5zaWRlIHNlbGVjdGlvbiBhd2FyZSBlZGl0b3Jcblx0XHRcdGlmIChpc1NlbGVjdGlvbkF3YXJlRWRpdG9yUGFuZSAmJiBoYXNWYWxpZEVkaXRvcikge1xuXHRcdFx0XHR0aGlzLm9uU2VsZWN0aW9uQXdhcmVFZGl0b3JOYXZpZ2F0aW9uKGVkaXRvclBhbmUuZ3JvdXAuaWQsIGVkaXRvclBhbmUuaW5wdXQsIGVkaXRvclBhbmUuZ2V0U2VsZWN0aW9uKCksIGV2ZW50KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTmF2aWdhdGlvbiB0byBub24tc2VsZWN0aW9uIGF3YXJlIG9yIGRpc3Bvc2VkIGVkaXRvclxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMuY3VycmVudFNlbGVjdGlvblN0YXRlID0gdW5kZWZpbmVkOyAvLyBhdCB0aGlzIHRpbWUgd2UgaGF2ZSBubyBhY3RpdmUgc2VsZWN0aW9uIGF3YXJlIGVkaXRvclxuXG5cdFx0XHRcdGlmIChoYXNWYWxpZEVkaXRvcikge1xuXHRcdFx0XHRcdHRoaXMub25Ob25TZWxlY3Rpb25Bd2FyZUVkaXRvck5hdmlnYXRpb24oZWRpdG9yUGFuZS5ncm91cC5pZCwgZWRpdG9yUGFuZS5pbnB1dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uU2VsZWN0aW9uQXdhcmVFZGl0b3JOYXZpZ2F0aW9uKGdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgZWRpdG9yOiBFZGl0b3JJbnB1dCwgc2VsZWN0aW9uOiBJRWRpdG9yUGFuZVNlbGVjdGlvbiB8IHVuZGVmaW5lZCwgZXZlbnQ/OiBJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3VycmVudD8uZ3JvdXBJZCA9PT0gZ3JvdXBJZCAmJiAhc2VsZWN0aW9uICYmIHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNFZGl0b3IodGhpcy5jdXJyZW50LmVkaXRvciwgZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBkbyBub3QgcHVzaCBzYW1lIGVkaXRvciBpbnB1dCBhZ2FpbiBvZiBzYW1lIGdyb3VwIGlmIHdlIGhhdmUgbm8gdmFsaWQgc2VsZWN0aW9uXG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZSgnb25TZWxlY3Rpb25Bd2FyZUVkaXRvck5hdmlnYXRpb24oKScsIGVkaXRvciwgZXZlbnQpO1xuXG5cdFx0Y29uc3Qgc3RhdGVDYW5kaWRhdGUgPSBuZXcgRWRpdG9yU2VsZWN0aW9uU3RhdGUoeyBncm91cElkLCBlZGl0b3IgfSwgc2VsZWN0aW9uLCBldmVudD8ucmVhc29uKTtcblxuXHRcdC8vIEFkZCB0byBzdGFjayBpZiB3ZSBkb250IGhhdmUgYSBjdXJyZW50IHN0YXRlIG9yIHRoaXMgbmV3IHN0YXRlIGp1c3RpZmllcyBhIHB1c2hcblx0XHRpZiAoIXRoaXMuY3VycmVudFNlbGVjdGlvblN0YXRlIHx8IHRoaXMuY3VycmVudFNlbGVjdGlvblN0YXRlLmp1c3RpZmllc05ld05hdmlnYXRpb25FbnRyeShzdGF0ZUNhbmRpZGF0ZSkpIHtcblx0XHRcdHRoaXMuZG9BZGQoZ3JvdXBJZCwgZWRpdG9yLCBzdGF0ZUNhbmRpZGF0ZS5zZWxlY3Rpb24pO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSB3ZSByZXBsYWNlIHRoZSBjdXJyZW50IHN0YWNrIGVudHJ5IHdpdGggdGhpcyBvbmVcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuZG9SZXBsYWNlKGdyb3VwSWQsIGVkaXRvciwgc3RhdGVDYW5kaWRhdGUuc2VsZWN0aW9uKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgb3VyIGN1cnJlbnQgbmF2aWdhdGlvbiBlZGl0b3Igc3RhdGVcblx0XHR0aGlzLmN1cnJlbnRTZWxlY3Rpb25TdGF0ZSA9IHN0YXRlQ2FuZGlkYXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk5vblNlbGVjdGlvbkF3YXJlRWRpdG9yTmF2aWdhdGlvbihncm91cElkOiBHcm91cElkZW50aWZpZXIsIGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50Py5ncm91cElkID09PSBncm91cElkICYmIHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNFZGl0b3IodGhpcy5jdXJyZW50LmVkaXRvciwgZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBkbyBub3QgcHVzaCBzYW1lIGVkaXRvciBpbnB1dCBhZ2FpbiBvZiBzYW1lIGdyb3VwXG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZSgnb25Ob25TZWxlY3Rpb25Bd2FyZUVkaXRvck5hdmlnYXRpb24oKScsIGVkaXRvcik7XG5cblx0XHR0aGlzLmRvQWRkKGdyb3VwSWQsIGVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIGRvQWRkKGdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0LCBzZWxlY3Rpb24/OiBJRWRpdG9yUGFuZVNlbGVjdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5uYXZpZ2F0aW5nKSB7XG5cdFx0XHR0aGlzLmFkZE9yUmVwbGFjZShncm91cElkLCBlZGl0b3IsIHNlbGVjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1JlcGxhY2UoZ3JvdXBJZDogR3JvdXBJZGVudGlmaWVyLCBlZGl0b3I6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQsIHNlbGVjdGlvbj86IElFZGl0b3JQYW5lU2VsZWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm5hdmlnYXRpbmcpIHtcblx0XHRcdHRoaXMuYWRkT3JSZXBsYWNlKGdyb3VwSWQsIGVkaXRvciwgc2VsZWN0aW9uLCB0cnVlIC8qIGZvcmNlIHJlcGxhY2UgKi8pO1xuXHRcdH1cblx0fVxuXG5cdGFkZE9yUmVwbGFjZShncm91cElkOiBHcm91cElkZW50aWZpZXIsIGVkaXRvckNhbmRpZGF0ZTogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgc2VsZWN0aW9uPzogSUVkaXRvclBhbmVTZWxlY3Rpb24sIGZvcmNlUmVwbGFjZT86IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIEVuc3VyZSB3ZSBsaXN0ZW4gdG8gY2hhbmdlcyBpbiBncm91cFxuXHRcdHRoaXMucmVnaXN0ZXJHcm91cExpc3RlbmVycyhncm91cElkKTtcblxuXHRcdC8vIENoZWNrIHdoZXRoZXIgdG8gcmVwbGFjZSBhbiBleGlzdGluZyBlbnRyeSBvciBub3Rcblx0XHRsZXQgcmVwbGFjZSA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLmN1cnJlbnQpIHtcblx0XHRcdGlmIChmb3JjZVJlcGxhY2UpIHtcblx0XHRcdFx0cmVwbGFjZSA9IHRydWU7IC8vIHJlcGxhY2UgaWYgd2UgYXJlIGZvcmNlZCB0b1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnNob3VsZFJlcGxhY2VTdGFja0VudHJ5KHRoaXMuY3VycmVudCwgeyBncm91cElkLCBlZGl0b3I6IGVkaXRvckNhbmRpZGF0ZSwgc2VsZWN0aW9uIH0pKSB7XG5cdFx0XHRcdHJlcGxhY2UgPSB0cnVlOyAvLyByZXBsYWNlIGlmIHRoZSBncm91cCAmIGlucHV0IGlzIHRoZSBzYW1lIGFuZCBzZWxlY3Rpb24gaW5kaWNhdGVzIGFzIHN1Y2hcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmVkaXRvckhlbHBlci5wcmVmZXJSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvckNhbmRpZGF0ZSk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocmVwbGFjZSkge1xuXHRcdFx0dGhpcy50cmFjZSgncmVwbGFjZSgpJywgZWRpdG9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmFjZSgnYWRkKCknLCBlZGl0b3IpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1N0YWNrRW50cnk6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tFbnRyeSA9IHsgZ3JvdXBJZCwgZWRpdG9yLCBzZWxlY3Rpb24gfTtcblxuXHRcdC8vIFJlcGxhY2UgYXQgY3VycmVudCBwb3NpdGlvblxuXHRcdGNvbnN0IHJlbW92ZWRFbnRyaWVzOiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrRW50cnlbXSA9IFtdO1xuXHRcdGlmIChyZXBsYWNlKSB7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50KSB7XG5cdFx0XHRcdHJlbW92ZWRFbnRyaWVzLnB1c2godGhpcy5jdXJyZW50KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY3VycmVudCA9IG5ld1N0YWNrRW50cnk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHRvIHN0YWNrIGF0IGN1cnJlbnQgcG9zaXRpb25cblx0XHRlbHNlIHtcblxuXHRcdFx0Ly8gSWYgd2UgYXJlIG5vdCBhdCB0aGUgZW5kIG9mIGhpc3RvcnksIHdlIHJlbW92ZSBhbnl0aGluZyBhZnRlclxuXHRcdFx0aWYgKHRoaXMuc3RhY2subGVuZ3RoID4gdGhpcy5pbmRleCArIDEpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IHRoaXMuaW5kZXggKyAxOyBpIDwgdGhpcy5zdGFjay5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHJlbW92ZWRFbnRyaWVzLnB1c2godGhpcy5zdGFja1tpXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnN0YWNrID0gdGhpcy5zdGFjay5zbGljZSgwLCB0aGlzLmluZGV4ICsgMSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluc2VydCBlbnRyeSBhdCBpbmRleFxuXHRcdFx0dGhpcy5zdGFjay5zcGxpY2UodGhpcy5pbmRleCArIDEsIDAsIG5ld1N0YWNrRW50cnkpO1xuXG5cdFx0XHQvLyBDaGVjayBmb3IgbGltaXRcblx0XHRcdGlmICh0aGlzLnN0YWNrLmxlbmd0aCA+IEVkaXRvck5hdmlnYXRpb25TdGFjay5NQVhfU1RBQ0tfU0laRSkge1xuXHRcdFx0XHRyZW1vdmVkRW50cmllcy5wdXNoKHRoaXMuc3RhY2suc2hpZnQoKSEpOyAvLyByZW1vdmUgZmlyc3Rcblx0XHRcdFx0aWYgKHRoaXMucHJldmlvdXNJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5wcmV2aW91c0luZGV4LS07XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2V0SW5kZXgodGhpcy5pbmRleCArIDEsIHRydWUgLyogc2tpcCBldmVudCwgd2UgZmlyZSBpdCBsYXRlciAqLyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgZWRpdG9yIGxpc3RlbmVycyBmcm9tIHJlbW92ZWQgZW50cmllc1xuXHRcdGZvciAoY29uc3QgcmVtb3ZlZEVudHJ5IG9mIHJlbW92ZWRFbnRyaWVzKSB7XG5cdFx0XHR0aGlzLmVkaXRvckhlbHBlci5jbGVhck9uRWRpdG9yRGlzcG9zZShyZW1vdmVkRW50cnkuZWRpdG9yLCB0aGlzLm1hcEVkaXRvclRvRGlzcG9zYWJsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHRoaXMgZnJvbSB0aGUgc3RhY2sgdW5sZXNzIHRoZSBzdGFjayBpbnB1dCBpcyBhIHJlc291cmNlXG5cdFx0Ly8gdGhhdCBjYW4gZWFzaWx5IGJlIHJlc3RvcmVkIGV2ZW4gd2hlbiB0aGUgaW5wdXQgZ2V0cyBkaXNwb3NlZFxuXHRcdGlmIChpc0VkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdHRoaXMuZWRpdG9ySGVscGVyLm9uRWRpdG9yRGlzcG9zZShlZGl0b3IsICgpID0+IHRoaXMucmVtb3ZlKGVkaXRvciksIHRoaXMubWFwRWRpdG9yVG9EaXNwb3NhYmxlKTtcblx0XHR9XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkUmVwbGFjZVN0YWNrRW50cnkoZW50cnk6IElFZGl0b3JOYXZpZ2F0aW9uU3RhY2tFbnRyeSwgY2FuZGlkYXRlOiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrRW50cnkpOiBib29sZWFuIHtcblx0XHRpZiAoZW50cnkuZ3JvdXBJZCAhPT0gY2FuZGlkYXRlLmdyb3VwSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gZGlmZmVyZW50IGdyb3VwXG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmVkaXRvckhlbHBlci5tYXRjaGVzRWRpdG9yKGVudHJ5LmVkaXRvciwgY2FuZGlkYXRlLmVkaXRvcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gZGlmZmVyZW50IGVkaXRvclxuXHRcdH1cblxuXHRcdGlmICghZW50cnkuc2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gYWx3YXlzIHJlcGxhY2Ugd2hlbiB3ZSBoYXZlIG5vIHNwZWNpZmljIHNlbGVjdGlvbiB5ZXRcblx0XHR9XG5cblx0XHRpZiAoIWNhbmRpZGF0ZS5zZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gb3RoZXJ3aXNlLCBwcmVmZXIgdG8ga2VlcCBleGlzdGluZyBzcGVjaWZpYyBzZWxlY3Rpb24gb3ZlciBuZXcgdW5zcGVjaWZpYyBvbmVcblx0XHR9XG5cblx0XHQvLyBGaW5hbGx5LCByZXBsYWNlIHdoZW4gc2VsZWN0aW9ucyBhcmUgY29uc2lkZXJlZCBpZGVudGljYWxcblx0XHRyZXR1cm4gZW50cnkuc2VsZWN0aW9uLmNvbXBhcmUoY2FuZGlkYXRlLnNlbGVjdGlvbikgPT09IEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LklERU5USUNBTDtcblx0fVxuXG5cdG1vdmUoZXZlbnQ6IEZpbGVPcGVyYXRpb25FdmVudCk6IHZvaWQge1xuXHRcdGlmIChldmVudC5pc09wZXJhdGlvbihGaWxlT3BlcmF0aW9uLk1PVkUpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuc3RhY2spIHtcblx0XHRcdFx0aWYgKHRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNFZGl0b3IoZXZlbnQsIGVudHJ5LmVkaXRvcikpIHtcblx0XHRcdFx0XHRlbnRyeS5lZGl0b3IgPSB7IHJlc291cmNlOiBldmVudC50YXJnZXQucmVzb3VyY2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlbW92ZShhcmcxOiBFZGl0b3JJbnB1dCB8IEZpbGVDaGFuZ2VzRXZlbnQgfCBGaWxlT3BlcmF0aW9uRXZlbnQgfCBHcm91cElkZW50aWZpZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c1N0YWNrU2l6ZSA9IHRoaXMuc3RhY2subGVuZ3RoO1xuXG5cdFx0Ly8gUmVtb3ZlIGFsbCBzdGFjayBlbnRyaWVzIHRoYXQgbWF0Y2ggYGFyZzFgXG5cdFx0dGhpcy5zdGFjayA9IHRoaXMuc3RhY2suZmlsdGVyKGVudHJ5ID0+IHtcblx0XHRcdGNvbnN0IG1hdGNoZXMgPSB0eXBlb2YgYXJnMSA9PT0gJ251bWJlcicgPyBlbnRyeS5ncm91cElkID09PSBhcmcxIDogdGhpcy5lZGl0b3JIZWxwZXIubWF0Y2hlc0VkaXRvcihhcmcxLCBlbnRyeS5lZGl0b3IpO1xuXG5cdFx0XHQvLyBDbGVhbnVwIGFueSBsaXN0ZW5lcnMgYXNzb2NpYXRlZCB3aXRoIHRoZSBpbnB1dCB3aGVuIHJlbW92aW5nXG5cdFx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0XHR0aGlzLmVkaXRvckhlbHBlci5jbGVhck9uRWRpdG9yRGlzcG9zZShlbnRyeS5lZGl0b3IsIHRoaXMubWFwRWRpdG9yVG9EaXNwb3NhYmxlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuICFtYXRjaGVzO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHByZXZpb3VzU3RhY2tTaXplID09PSB0aGlzLnN0YWNrLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuOyAvLyBub3RoaW5nIHJlbW92ZWRcblx0XHR9XG5cblx0XHQvLyBHaXZlbiB3ZSBqdXN0IHJlbW92ZWQgZW50cmllcywgd2UgbmVlZCB0byBtYWtlIHN1cmVcblx0XHQvLyB0byByZW1vdmUgZW50cmllcyB0aGF0IGFyZSBub3cgaWRlbnRpY2FsIGFuZCBuZXh0XG5cdFx0Ly8gdG8gZWFjaCBvdGhlciB0byBwcmV2ZW50IG5vLW9wIG5hdmlnYXRpb25zLlxuXHRcdHRoaXMuZmxhdHRlbigpO1xuXG5cdFx0Ly8gUmVzZXQgaW5kZWNlc1xuXHRcdHRoaXMuaW5kZXggPSB0aGlzLnN0YWNrLmxlbmd0aCAtIDE7XG5cdFx0dGhpcy5wcmV2aW91c0luZGV4ID0gLTE7XG5cblx0XHQvLyBDbGVhciBncm91cCBsaXN0ZW5lclxuXHRcdGlmICh0eXBlb2YgYXJnMSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMubWFwR3JvdXBUb0Rpc3Bvc2FibGUuZGVsZXRlQW5kRGlzcG9zZShhcmcxKTtcblx0XHR9XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgZmxhdHRlbigpOiB2b2lkIHtcblx0XHRjb25zdCBmbGF0dGVuZWRTdGFjazogSUVkaXRvck5hdmlnYXRpb25TdGFja0VudHJ5W10gPSBbXTtcblxuXHRcdGxldCBwcmV2aW91c0VudHJ5OiBJRWRpdG9yTmF2aWdhdGlvblN0YWNrRW50cnkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLnN0YWNrKSB7XG5cdFx0XHRpZiAocHJldmlvdXNFbnRyeSAmJiB0aGlzLnNob3VsZFJlcGxhY2VTdGFja0VudHJ5KGVudHJ5LCBwcmV2aW91c0VudHJ5KSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gc2tpcCBvdmVyIGVudHJ5IHdoZW4gaXQgaXMgY29uc2lkZXJlZCB0aGUgc2FtZVxuXHRcdFx0fVxuXG5cdFx0XHRwcmV2aW91c0VudHJ5ID0gZW50cnk7XG5cdFx0XHRmbGF0dGVuZWRTdGFjay5wdXNoKGVudHJ5KTtcblx0XHR9XG5cblx0XHR0aGlzLnN0YWNrID0gZmxhdHRlbmVkU3RhY2s7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmluZGV4ID0gLTE7XG5cdFx0dGhpcy5wcmV2aW91c0luZGV4ID0gLTE7XG5cdFx0dGhpcy5zdGFjay5zcGxpY2UoMCk7XG5cblx0XHR0aGlzLm1hcEVkaXRvclRvRGlzcG9zYWJsZS5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHR0aGlzLm1hcEdyb3VwVG9EaXNwb3NhYmxlLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTmF2aWdhdGlvblxuXG5cdGNhbkdvRm9yd2FyZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdGFjay5sZW5ndGggPiB0aGlzLmluZGV4ICsgMTtcblx0fVxuXG5cdGFzeW5jIGdvRm9yd2FyZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuYXZpZ2F0ZWQgPSBhd2FpdCB0aGlzLm1heWJlR29DdXJyZW50KCk7XG5cdFx0aWYgKG5hdmlnYXRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jYW5Hb0ZvcndhcmQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0SW5kZXgodGhpcy5pbmRleCArIDEpO1xuXHRcdHJldHVybiB0aGlzLm5hdmlnYXRlKCk7XG5cdH1cblxuXHRjYW5Hb0JhY2soKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5kZXggPiAwO1xuXHR9XG5cblx0YXN5bmMgZ29CYWNrKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5hdmlnYXRlZCA9IGF3YWl0IHRoaXMubWF5YmVHb0N1cnJlbnQoKTtcblx0XHRpZiAobmF2aWdhdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmNhbkdvQmFjaygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRJbmRleCh0aGlzLmluZGV4IC0gMSk7XG5cdFx0cmV0dXJuIHRoaXMubmF2aWdhdGUoKTtcblx0fVxuXG5cdGFzeW5jIGdvUHJldmlvdXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmF2aWdhdGVkID0gYXdhaXQgdGhpcy5tYXliZUdvQ3VycmVudCgpO1xuXHRcdGlmIChuYXZpZ2F0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBuZXZlciBuYXZpZ2F0ZWQsIGp1c3QgZ28gYmFja1xuXHRcdGlmICh0aGlzLnByZXZpb3VzSW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nb0JhY2soKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UganVtcCB0byBwcmV2aW91cyBzdGFjayBlbnRyeVxuXHRcdHRoaXMuc2V0SW5kZXgodGhpcy5wcmV2aW91c0luZGV4KTtcblx0XHRyZXR1cm4gdGhpcy5uYXZpZ2F0ZSgpO1xuXHR9XG5cblx0Y2FuR29MYXN0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0YWNrLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRhc3luYyBnb0xhc3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmNhbkdvTGFzdCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRJbmRleCh0aGlzLnN0YWNrLmxlbmd0aCAtIDEpO1xuXHRcdHJldHVybiB0aGlzLm5hdmlnYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1heWJlR29DdXJyZW50KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gV2hlbiB0aGlzIG5hdmlnYXRpb24gc3RhY2sgd29ya3Mgd2l0aCBhIHNwZWNpZmljXG5cdFx0Ly8gZmlsdGVyIHdoZXJlIG5vdCBldmVyeSBzZWxlY3Rpb24gY2hhbmdlIGlzIGFkZGVkXG5cdFx0Ly8gdG8gdGhlIHN0YWNrLCB3ZSB3YW50IHRvIGZpcnN0IHJldmVhbCB0aGUgY3VycmVudFxuXHRcdC8vIHNlbGVjdGlvbiBiZWZvcmUgYXR0ZW1wdGluZyB0byBuYXZpZ2F0ZSBpbiB0aGVcblx0XHQvLyBzdGFjay5cblxuXHRcdGlmICh0aGlzLmZpbHRlciA9PT0gR29GaWx0ZXIuTk9ORSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBvbmx5IGFwcGxpZXMgd2hlbiAgd2UgYXJlIGEgZmlsdGVyZCBzdGFja1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzQ3VycmVudFNlbGVjdGlvbkFjdGl2ZSgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHdlIGFyZSBhdCB0aGUgY3VycmVudCBuYXZpZ2F0aW9uIHN0b3Bcblx0XHR9XG5cblx0XHQvLyBHbyB0byBjdXJyZW50IHNlbGVjdGlvblxuXHRcdGF3YWl0IHRoaXMubmF2aWdhdGUoKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0N1cnJlbnRTZWxlY3Rpb25BY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnQ/LnNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyB3ZSBuZWVkIGEgY3VycmVudCBzZWxlY3Rpb25cblx0XHR9XG5cblx0XHRjb25zdCBwYW5lID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKCFpc0VkaXRvclBhbmVXaXRoU2VsZWN0aW9uKHBhbmUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHdlIG5lZWQgYW4gYWN0aXZlIGVkaXRvciBwYW5lIHdpdGggc2VsZWN0aW9uIHN1cHBvcnRcblx0XHR9XG5cblx0XHRpZiAocGFuZS5ncm91cC5pZCAhPT0gdGhpcy5jdXJyZW50Lmdyb3VwSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gd2UgbmVlZCBtYXRjaGluZyBncm91cHNcblx0XHR9XG5cblx0XHRpZiAoIXBhbmUuaW5wdXQgfHwgIXRoaXMuZWRpdG9ySGVscGVyLm1hdGNoZXNFZGl0b3IocGFuZS5pbnB1dCwgdGhpcy5jdXJyZW50LmVkaXRvcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gd2UgbmVlZCBtYXRjaGluZyBlZGl0b3JzXG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFuZVNlbGVjdGlvbiA9IHBhbmUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKCFwYW5lU2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIHdlIG5lZWQgYSBzZWxlY3Rpb24gdG8gY29tcGFyZSB3aXRoXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhbmVTZWxlY3Rpb24uY29tcGFyZSh0aGlzLmN1cnJlbnQuc2VsZWN0aW9uKSA9PT0gRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQuSURFTlRJQ0FMO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRJbmRleChuZXdJbmRleDogbnVtYmVyLCBza2lwRXZlbnQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5wcmV2aW91c0luZGV4ID0gdGhpcy5pbmRleDtcblx0XHR0aGlzLmluZGV4ID0gbmV3SW5kZXg7XG5cblx0XHQvLyBFdmVudFxuXHRcdGlmICghc2tpcEV2ZW50KSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBuYXZpZ2F0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm5hdmlnYXRpbmcgPSB0cnVlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb05hdmlnYXRlKHRoaXMuY3VycmVudCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMubmF2aWdhdGluZyA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9OYXZpZ2F0ZShsb2NhdGlvbjogSUVkaXRvck5hdmlnYXRpb25TdGFja0VudHJ5KTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHQvLyBBcHBseSBzZWxlY3Rpb24gaWYgYW55XG5cdFx0aWYgKGxvY2F0aW9uLnNlbGVjdGlvbikge1xuXHRcdFx0b3B0aW9ucyA9IGxvY2F0aW9uLnNlbGVjdGlvbi5yZXN0b3JlKG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGlmIChpc0VkaXRvcklucHV0KGxvY2F0aW9uLmVkaXRvcikpIHtcblx0XHRcdHJldHVybiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihsb2NhdGlvbi5lZGl0b3IsIG9wdGlvbnMsIGxvY2F0aW9uLmdyb3VwSWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHQuLi5sb2NhdGlvbi5lZGl0b3IsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdC4uLmxvY2F0aW9uLmVkaXRvci5vcHRpb25zLFxuXHRcdFx0XHQuLi5vcHRpb25zXG5cdFx0XHR9XG5cdFx0fSwgbG9jYXRpb24uZ3JvdXBJZCk7XG5cdH1cblxuXHRpc05hdmlnYXRpbmcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubmF2aWdhdGluZztcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5jbGFzcyBFZGl0b3JIZWxwZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlXG5cdCkgeyB9XG5cblx0cHJlZmVyUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3I6IEVkaXRvcklucHV0KTogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dDtcblx0cHJlZmVyUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0KTogSVJlc291cmNlRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdHByZWZlclJlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0KTogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0cHJlZmVyUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3I6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQpOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yKTtcblxuXHRcdC8vIEZvciBub3csIG9ubHkgcHJlZmVyIHdlbGwga25vd24gc2NoZW1lcyB0aGF0IHdlIGNvbnRyb2wgdG8gcHJldmVudFxuXHRcdC8vIGlzc3VlcyBzdWNoIGFzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy84NTIwNFxuXHRcdC8vIGZyb20gYmVpbmcgdXNlZCBhcyByZXNvdXJjZSBpbnB1dHNcblx0XHQvLyByZXNvdXJjZSBpbnB1dHMgc3Vydml2ZSBlZGl0b3IgZGlzcG9zYWwgYW5kIGFzIHN1Y2ggYXJlIGEgbG90IG1vcmVcblx0XHQvLyBkdXJhYmxlIGFjcm9zcyBlZGl0b3IgY2hhbmdlcyBhbmQgcmVzdGFydHNcblx0XHRjb25zdCBoYXNWYWxpZFJlc291cmNlRWRpdG9ySW5wdXRTY2hlbWUgPVxuXHRcdFx0cmVzb3VyY2U/LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlIHx8XG5cdFx0XHRyZXNvdXJjZT8uc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZSB8fFxuXHRcdFx0cmVzb3VyY2U/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVVc2VyRGF0YSB8fFxuXHRcdFx0cmVzb3VyY2U/LnNjaGVtZSA9PT0gdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lO1xuXG5cdFx0Ly8gU2NoZW1lIGlzIHZhbGlkOiBwcmVmZXIgdGhlIHVudHlwZWQgaW5wdXRcblx0XHQvLyBvdmVyIHRoZSB0eXBlZCBpbnB1dCBpZiBwb3NzaWJsZSB0byBrZWVwXG5cdFx0Ly8gdGhlIGVudHJ5IGFjcm9zcyByZXN0YXJ0c1xuXHRcdGlmIChoYXNWYWxpZFJlc291cmNlRWRpdG9ySW5wdXRTY2hlbWUpIHtcblx0XHRcdGlmIChpc0VkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdFx0Y29uc3QgdW50eXBlZElucHV0ID0gZWRpdG9yLnRvVW50eXBlZCgpO1xuXHRcdFx0XHRpZiAoaXNSZXNvdXJjZUVkaXRvcklucHV0KHVudHlwZWRJbnB1dCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW50eXBlZElucHV0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBlZGl0b3I7XG5cdFx0fVxuXG5cdFx0Ly8gU2NoZW1lIGlzIGludmFsaWQ6IGFsbG93IHRoZSBlZGl0b3IgaW5wdXRcblx0XHQvLyBmb3IgYXMgbG9uZyBhcyBpdCBpcyBub3QgZGlzcG9zZWRcblx0XHRlbHNlIHtcblx0XHRcdHJldHVybiBpc0VkaXRvcklucHV0KGVkaXRvcikgPyBlZGl0b3IgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0bWF0Y2hlc0VkaXRvcihhcmcxOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0IHwgRmlsZUNoYW5nZXNFdmVudCB8IEZpbGVPcGVyYXRpb25FdmVudCwgaW5wdXRCOiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKGFyZzEgaW5zdGFuY2VvZiBGaWxlQ2hhbmdlc0V2ZW50IHx8IGFyZzEgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXZlbnQpIHtcblx0XHRcdGlmIChpc0VkaXRvcklucHV0KGlucHV0QikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyB3ZSBvbmx5IHN1cHBvcnQgdGhpcyBmb3IgYElSZXNvdXJjZUVkaXRvcklucHV0c2AgdGhhdCBhcmUgZmlsZSBiYXNlZFxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYXJnMSBpbnN0YW5jZW9mIEZpbGVDaGFuZ2VzRXZlbnQpIHtcblx0XHRcdFx0cmV0dXJuIGFyZzEuY29udGFpbnMoaW5wdXRCLnJlc291cmNlLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMubWF0Y2hlc0ZpbGUoaW5wdXRCLnJlc291cmNlLCBhcmcxKTtcblx0XHR9XG5cblx0XHRpZiAoaXNFZGl0b3JJbnB1dChhcmcxKSkge1xuXHRcdFx0aWYgKGlzRWRpdG9ySW5wdXQoaW5wdXRCKSkge1xuXHRcdFx0XHRyZXR1cm4gYXJnMS5tYXRjaGVzKGlucHV0Qik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLm1hdGNoZXNGaWxlKGlucHV0Qi5yZXNvdXJjZSwgYXJnMSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRWRpdG9ySW5wdXQoaW5wdXRCKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMubWF0Y2hlc0ZpbGUoYXJnMS5yZXNvdXJjZSwgaW5wdXRCKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJnMSAmJiBpbnB1dEIgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoYXJnMS5yZXNvdXJjZSwgaW5wdXRCLnJlc291cmNlKTtcblx0fVxuXG5cdG1hdGNoZXNGaWxlKHJlc291cmNlOiBVUkksIGFyZzI6IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQgfCBGaWxlQ2hhbmdlc0V2ZW50IHwgRmlsZU9wZXJhdGlvbkV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGFyZzIgaW5zdGFuY2VvZiBGaWxlQ2hhbmdlc0V2ZW50KSB7XG5cdFx0XHRyZXR1cm4gYXJnMi5jb250YWlucyhyZXNvdXJjZSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCk7XG5cdFx0fVxuXG5cdFx0aWYgKGFyZzIgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXZlbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCBhcmcyLnJlc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAoaXNFZGl0b3JJbnB1dChhcmcyKSkge1xuXHRcdFx0Y29uc3QgaW5wdXRSZXNvdXJjZSA9IGFyZzIucmVzb3VyY2U7XG5cdFx0XHRpZiAoIWlucHV0UmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5saWZlY3ljbGVTZXJ2aWNlLnBoYXNlID49IExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkICYmICF0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKGlucHV0UmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gbWFrZSBzdXJlIHRvIG9ubHkgY2hlY2sgdGhpcyB3aGVuIHdvcmtiZW5jaCBoYXMgcmVzdG9yZWQgKGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDgyNzUpXG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChpbnB1dFJlc291cmNlLCByZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGFyZzI/LnJlc291cmNlLCByZXNvdXJjZSk7XG5cdH1cblxuXHRtYXRjaGVzRWRpdG9ySWRlbnRpZmllcihpZGVudGlmaWVyOiBJRWRpdG9ySWRlbnRpZmllciwgZWRpdG9yUGFuZT86IElFZGl0b3JQYW5lKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFlZGl0b3JQYW5lPy5ncm91cCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChpZGVudGlmaWVyLmdyb3VwSWQgIT09IGVkaXRvclBhbmUuZ3JvdXAuaWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yUGFuZS5pbnB1dCA/IGlkZW50aWZpZXIuZWRpdG9yLm1hdGNoZXMoZWRpdG9yUGFuZS5pbnB1dCkgOiBmYWxzZTtcblx0fVxuXG5cdG9uRWRpdG9yRGlzcG9zZShlZGl0b3I6IEVkaXRvcklucHV0LCBsaXN0ZW5lcjogRnVuY3Rpb24sIG1hcEVkaXRvclRvRGlzcG9zZTogRGlzcG9zYWJsZU1hcDxFZGl0b3JJbnB1dCwgRGlzcG9zYWJsZVN0b3JlPik6IHZvaWQge1xuXHRcdGNvbnN0IHRvRGlzcG9zZSA9IEV2ZW50Lm9uY2UoZWRpdG9yLm9uV2lsbERpc3Bvc2UpKCgpID0+IHtcblx0XHRcdG1hcEVkaXRvclRvRGlzcG9zZS5kZWxldGVBbmREaXNwb3NlKGVkaXRvcik7XG5cdFx0XHRsaXN0ZW5lcigpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGRpc3Bvc2FibGVzID0gbWFwRWRpdG9yVG9EaXNwb3NlLmdldChlZGl0b3IpO1xuXHRcdGlmICghZGlzcG9zYWJsZXMpIHtcblx0XHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0bWFwRWRpdG9yVG9EaXNwb3NlLnNldChlZGl0b3IsIGRpc3Bvc2FibGVzKTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NlKTtcblx0fVxuXG5cdGNsZWFyT25FZGl0b3JEaXNwb3NlKGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCB8IEZpbGVDaGFuZ2VzRXZlbnQgfCBGaWxlT3BlcmF0aW9uRXZlbnQsIG1hcEVkaXRvclRvRGlzcG9zZTogRGlzcG9zYWJsZU1hcDxFZGl0b3JJbnB1dCwgRGlzcG9zYWJsZVN0b3JlPik6IHZvaWQge1xuXHRcdGlmICghaXNFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47IC8vIG9ubHkgc3VwcG9ydGVkIHdoZW4gcGFzc2luZyBpbiBhbiBhY3R1YWwgZWRpdG9yIGlucHV0XG5cdFx0fVxuXG5cdFx0bWFwRWRpdG9yVG9EaXNwb3NlLmRlbGV0ZUFuZERpc3Bvc2UoZWRpdG9yKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFFcEIsU0FBeUMsd0JBQTRELGNBQWMsa0JBQXVDLHVCQUF1QixlQUFlLHlCQUF5QixvQkFBMEMsa0NBQWtDLGlDQUFpQywyQkFBNEcsNEJBQTRCO0FBRTljLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsVUFBVSxTQUFTLGlCQUFpQiw2Q0FBNkM7QUFDMUYsU0FBUyxrQkFBa0IsY0FBYyxnQkFBZ0Isc0JBQXNCLG9CQUFvQixxQkFBcUI7QUFDeEgsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxZQUFZLGlCQUE4QixxQkFBcUI7QUFDeEUsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBdUIsNEJBQTRCO0FBQ25ELFNBQVMsYUFBbUMsNkJBQTZCO0FBQ3pFLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFDL0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCLFdBQVcsYUFBYSx1QkFBdUI7QUFDL0UsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CLHNCQUFzQjtBQUNsRCxTQUFTLGFBQWEsZ0JBQWdCO0FBQ3RDLFNBQVMsa0JBQWtCO0FBd0JwQixJQUFNLGlCQUFOLGNBQTZCLFdBQXNDO0FBQUEsRUFXekUsWUFDa0MsZUFDTSxvQkFDSSxnQkFDVCxnQkFDTSxzQkFDVCxhQUNNLG1CQUNHLHNCQUNFLGVBQ0wsbUJBQ1AsWUFDN0I7QUFDRCxVQUFNO0FBWjJCO0FBQ007QUFDSTtBQUNUO0FBQ007QUFDVDtBQUNNO0FBQ0c7QUFDRTtBQUNMO0FBQ1A7QUFoQi9CLFNBQWlCLHdCQUF3QixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUM3RSxTQUFRLG1CQUFrRDtBQXVTMUQ7QUFBQTtBQUFBLFNBQWlCLG9DQUFvQyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDdkYsU0FBUyxtQ0FBbUMsS0FBSyxrQ0FBa0M7QUFFbkYsU0FBUSxxQ0FBMEU7QUFDbEYsU0FBaUIsb0NBQW9DLG9CQUFJLElBQWtGO0FBQzNJLFNBQWlCLCtCQUErQixvQkFBSSxJQUFvRztBQUV4SixTQUFRLHdCQUF3QixRQUFRO0FBaU14QztBQUFBO0FBQUEsU0FBUSwyQkFBcUU7QUFDN0UsU0FBUSxnQ0FBZ0M7QUFFeEMsU0FBUSxrQ0FBNEU7QUFDcEYsU0FBUSx1Q0FBdUM7QUFFL0MsU0FBUSx1Q0FBdUM7QUFDL0MsU0FBUSw4Q0FBOEM7QUFnR3RELFNBQVEsd0JBQWlELENBQUM7QUFDMUQsU0FBUSx5QkFBeUI7QUFFakMsU0FBUSwrQkFBK0I7QUFDdkMsU0FBUSxzQ0FBc0M7QUE0TDlDLFNBQVEsVUFBaUU7QUFFekUsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLGNBQTRDLENBQUM7QUFFMUcsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixZQUFZLE1BQU07QUFDOUYsWUFBTSxVQUFVLEtBQUssVUFBVSxLQUFLLHFCQUFxQjtBQUFBLFFBQ3hEO0FBQUEsUUFDQSxVQUFRLFlBQVksT0FBTyxLQUFLLHFCQUFxQixTQUErQixFQUFFLFVBQVUsS0FBSyxDQUFDLElBQUksS0FBSyxxQkFBcUIsU0FBK0IsQ0FBQyxLQUFLLHVCQUFPLE9BQU8sSUFBSTtBQUFBLFFBQzNMLFdBQVMsTUFBTSxxQkFBcUIsb0JBQW9CLEtBQUssTUFBTSxxQkFBcUIscUJBQXFCO0FBQUEsTUFDOUcsQ0FBQztBQUVELFdBQUssVUFBVSxRQUFRLG1CQUFtQixNQUFNLEtBQUssMEJBQTBCLENBQUMsQ0FBQztBQUVqRixhQUFPO0FBQUEsSUFDUixDQUFDLENBQUM7QUFqeEJELFNBQUssZUFBZSxLQUFLLHFCQUFxQixlQUFlLFlBQVk7QUFFekUsU0FBSyw0QkFBNkIsSUFBSSxjQUF1QixtQkFBbUIsT0FBTyxTQUFTLG1CQUFtQiwyREFBMkQsQ0FBQyxFQUFHLE9BQU8sS0FBSyxpQkFBaUI7QUFDL00sU0FBSywrQkFBZ0MsSUFBSSxjQUF1QixzQkFBc0IsT0FBTyxTQUFTLHNCQUFzQiw4REFBOEQsQ0FBQyxFQUFHLE9BQU8sS0FBSyxpQkFBaUI7QUFFM04sU0FBSyx5Q0FBMEMsSUFBSSxjQUF1Qix3Q0FBd0MsT0FBTyxTQUFTLHdDQUF3QyxnRkFBZ0YsQ0FBQyxFQUFHLE9BQU8sS0FBSyxpQkFBaUI7QUFDM1IsU0FBSyw0Q0FBNkMsSUFBSSxjQUF1QiwyQ0FBMkMsT0FBTyxTQUFTLDJDQUEyQyxtRkFBbUYsQ0FBQyxFQUFHLE9BQU8sS0FBSyxpQkFBaUI7QUFDdlMsU0FBSyxnREFBaUQsSUFBSSxjQUF1Qix1Q0FBdUMsT0FBTyxTQUFTLHVDQUF1QywyRUFBMkUsQ0FBQyxFQUFHLE9BQU8sS0FBSyxpQkFBaUI7QUFFM1IsU0FBSyxtQ0FBb0MsSUFBSSxjQUF1QixrQ0FBa0MsT0FBTyxTQUFTLGtDQUFrQywwRUFBMEUsQ0FBQyxFQUFHLE9BQU8sS0FBSyxpQkFBaUI7QUFDblEsU0FBSyxzQ0FBdUMsSUFBSSxjQUF1QixxQ0FBcUMsT0FBTyxTQUFTLHFDQUFxQyw2RUFBNkUsQ0FBQyxFQUFHLE9BQU8sS0FBSyxpQkFBaUI7QUFDL1EsU0FBSywwQ0FBMkMsSUFBSSxjQUF1QixpQ0FBaUMsT0FBTyxTQUFTLGlDQUFpQyxxRUFBcUUsQ0FBQyxFQUFHLE9BQU8sS0FBSyxpQkFBaUI7QUFFblEsU0FBSyxrQ0FBbUMsSUFBSSxjQUF1Qix5QkFBeUIsT0FBTyxTQUFTLHlCQUF5Qix5REFBeUQsQ0FBQyxFQUFHLE9BQU8sS0FBSyxpQkFBaUI7QUFFL04sU0FBSyxrQkFBa0I7QUFLdkIsUUFBSSxLQUFLLGNBQWMsa0JBQWtCO0FBQ3hDLFdBQUssd0JBQXdCO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQUEsRUFFUSxvQkFBMEI7QUFHakMsU0FBSyxnQ0FBZ0M7QUFHckMsU0FBSyxVQUFVLEtBQUssY0FBYyx3QkFBd0IsTUFBTSxLQUFLLHdCQUF3QixDQUFDLENBQUM7QUFDL0YsU0FBSyxVQUFVLEtBQUssY0FBYyxvQkFBb0IsV0FBUyxLQUFLLE9BQU8sTUFBTSxNQUFNLENBQUMsQ0FBQztBQUN6RixTQUFLLFVBQVUsS0FBSyxjQUFjLGlCQUFpQixXQUFTLEtBQUssaUJBQWlCLEtBQUssQ0FBQyxDQUFDO0FBQ3pGLFNBQUssVUFBVSxLQUFLLGNBQWMscUNBQXFDLE1BQU0sS0FBSyxzQ0FBc0MsQ0FBQyxDQUFDO0FBRzFILFNBQUssVUFBVSxLQUFLLG1CQUFtQixpQkFBaUIsT0FBSyxLQUFLLGlCQUFpQixDQUFDLENBQUMsQ0FBQztBQUd0RixTQUFLLFVBQVUsS0FBSyxZQUFZLGlCQUFpQixXQUFTLEtBQUssaUJBQWlCLEtBQUssQ0FBQyxDQUFDO0FBQ3ZGLFNBQUssVUFBVSxLQUFLLFlBQVksa0JBQWtCLFdBQVMsS0FBSyxpQkFBaUIsS0FBSyxDQUFDLENBQUM7QUFHeEYsU0FBSyxVQUFVLEtBQUssZUFBZSxnQkFBZ0IsTUFBTSxLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBRzFFLFNBQUssNENBQTRDO0FBR2pELFNBQUssVUFBVSxLQUFLLGlDQUFpQyxNQUFNLEtBQUssa0JBQWtCLENBQUMsQ0FBQztBQUNwRixTQUFLLFVBQVUsS0FBSyxtQkFBbUIsdUJBQXVCLE1BQU0sS0FBSyxrQkFBa0IsQ0FBQyxDQUFDO0FBQUEsRUFDOUY7QUFBQSxFQUVRLGlCQUFpQixHQUE0QjtBQUNwRCxTQUFLLGdDQUFnQyxDQUFDO0FBQ3RDLFNBQUssK0JBQStCLENBQUM7QUFBQSxFQUN0QztBQUFBLEVBRVEsa0NBQXdDO0FBQy9DLFVBQU0sa0NBQWtDLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQzVFLFVBQU0sZ0NBQWdDLE1BQU07QUFDM0Msc0NBQWdDLE1BQU07QUFFdEMsVUFBSSxLQUFLLHFCQUFxQixTQUFTLHFDQUFxQyxHQUFHO0FBQzlFLGFBQUssVUFBVSxNQUFNLGdCQUFnQixLQUFLLGNBQWMsbUJBQW1CLENBQUMsRUFBRSxXQUFXLFlBQVksTUFBTTtBQUMxRyxnQkFBTSxtQkFBbUIsWUFBWSxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFDOUQsMkJBQWlCLElBQUksc0JBQXNCLFdBQVcsVUFBVSxZQUFZLE9BQUssS0FBSyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsQ0FBQztBQUMvRywyQkFBaUIsSUFBSSxzQkFBc0IsV0FBVyxVQUFVLFVBQVUsT0FBSyxLQUFLLGdCQUFnQixHQUFHLEtBQUssQ0FBQyxDQUFDO0FBRTlHLDBDQUFnQyxJQUFJLGdCQUFnQjtBQUFBLFFBQ3JELEdBQUcsRUFBRSxXQUFXLEtBQUssY0FBYyxlQUFlLGFBQWEsS0FBSyxPQUFPLENBQUMsQ0FBQztBQUFBLE1BQzlFO0FBQUEsSUFDRDtBQUVBLFNBQUssVUFBVSxLQUFLLHFCQUFxQix5QkFBeUIsV0FBUztBQUMxRSxVQUFJLE1BQU0scUJBQXFCLHFDQUFxQyxHQUFHO0FBQ3RFLHNDQUE4QjtBQUFBLE1BQy9CO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixrQ0FBOEI7QUFBQSxFQUMvQjtBQUFBLEVBRVEsZ0JBQWdCLE9BQW1CLGFBQTRCO0FBT3RFLFlBQVEsTUFBTSxRQUFRO0FBQUEsTUFDckIsS0FBSztBQUNKLG9CQUFZLEtBQUssS0FBSztBQUN0QixZQUFJLGFBQWE7QUFDaEIsZUFBSyxPQUFPO0FBQUEsUUFDYjtBQUNBO0FBQUEsTUFDRCxLQUFLO0FBQ0osb0JBQVksS0FBSyxLQUFLO0FBQ3RCLFlBQUksYUFBYTtBQUNoQixlQUFLLFVBQVU7QUFBQSxRQUNoQjtBQUVBO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlCQUFpQixPQUEyQjtBQUNuRCxTQUFLLDBDQUEwQyxLQUFLO0FBQUEsRUFDckQ7QUFBQSxFQUVRLDBCQUFnQztBQUN2QyxVQUFNLG9CQUFvQixLQUFLLG1CQUFtQjtBQUNsRCxVQUFNLG1CQUFtQixrQkFBa0I7QUFFM0MsUUFBSSxLQUFLLG9CQUFvQixLQUFLLGFBQWEsd0JBQXdCLEtBQUssa0JBQWtCLGdCQUFnQixHQUFHO0FBQ2hIO0FBQUEsSUFDRDtBQUdBLFNBQUssbUJBQW1CLGtCQUFrQixRQUFRLEVBQUUsUUFBUSxpQkFBaUIsT0FBTyxTQUFTLGlCQUFpQixNQUFNLEdBQUcsSUFBSTtBQUczSCxTQUFLLHNCQUFzQixNQUFNO0FBS2pDLFFBQUksQ0FBQyxrQkFBa0IsTUFBTSxZQUFZLGlCQUFpQixLQUFLLEdBQUc7QUFDakUsV0FBSyx5QkFBeUIsbUJBQW1CLGdCQUFnQjtBQUFBLElBQ2xFLE9BQU87QUFDTixXQUFLLFdBQVcsTUFBTSxxRkFBcUYsaUJBQWlCLE9BQU8sVUFBVSxTQUFTLENBQUMsSUFBSTtBQUUzSixZQUFNLG9CQUFvQixrQkFBa0IsaUJBQWlCLE9BQUs7QUFDakUsWUFBSSxFQUFFLFNBQVMscUJBQXFCLG9CQUFvQixFQUFFLFdBQVcsaUJBQWlCLFNBQVMsQ0FBQyxpQkFBaUIsTUFBTSxZQUFZLGlCQUFpQixLQUFLLEdBQUc7QUFDM0osNEJBQWtCLFFBQVE7QUFFMUIsZUFBSyx5QkFBeUIsbUJBQW1CLGdCQUFnQjtBQUFBLFFBQ2xFO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxzQkFBc0IsSUFBSSxpQkFBaUI7QUFBQSxJQUNqRDtBQUdBLFFBQUksMEJBQTBCLGdCQUFnQixHQUFHO0FBQ2hELFdBQUssc0JBQXNCLElBQUksaUJBQWlCLHFCQUFxQixPQUFLO0FBQ3pFLFlBQUksQ0FBQyxpQkFBaUIsTUFBTSxZQUFZLGlCQUFpQixLQUFLLEdBQUc7QUFDaEUsZUFBSyx1Q0FBdUMsbUJBQW1CLGtCQUFrQixDQUFDO0FBQUEsUUFDbkYsT0FBTztBQUNOLGVBQUssV0FBVyxNQUFNLGtFQUFrRSxpQkFBaUIsT0FBTyxVQUFVLFNBQVMsQ0FBQyxJQUFJO0FBQUEsUUFDekk7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFHQSxTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQUEsRUFFUSxpQkFBaUIsT0FBb0Q7QUFHNUUsUUFBSSxpQkFBaUIsa0JBQWtCO0FBQ3RDLFVBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsYUFBSyxPQUFPLEtBQUs7QUFBQSxNQUNsQjtBQUFBLElBQ0QsT0FHSztBQUdKLFVBQUksTUFBTSxZQUFZLGNBQWMsTUFBTSxHQUFHO0FBQzVDLGFBQUssT0FBTyxLQUFLO0FBQUEsTUFDbEIsV0FHUyxNQUFNLFlBQVksY0FBYyxJQUFJLEtBQUssTUFBTSxPQUFPLFFBQVE7QUFDdEUsYUFBSyxLQUFLLEtBQUs7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSx5QkFBeUIsT0FBcUIsWUFBZ0M7QUFDckYsU0FBSyxrQ0FBa0MsVUFBVTtBQUNqRCxTQUFLLDJDQUEyQyxPQUFPLFVBQVU7QUFBQSxFQUNsRTtBQUFBLEVBRVEsdUNBQXVDLE9BQXFCLFlBQXNDLE9BQThDO0FBQ3ZKLFNBQUssb0RBQW9ELE9BQU8sWUFBWSxLQUFLO0FBQUEsRUFDbEY7QUFBQSxFQUVRLEtBQUssT0FBaUM7QUFDN0MsU0FBSyxjQUFjLEtBQUs7QUFDeEIsU0FBSyw2QkFBNkIsS0FBSztBQUFBLEVBQ3hDO0FBQUEsRUFLUSxPQUFPLE1BQWlFO0FBQy9FLFNBQUssa0JBQWtCLElBQUk7QUFDM0IsU0FBSyxpQ0FBaUMsSUFBSTtBQUMxQyxTQUFLLGdDQUFnQyxJQUFJO0FBQ3pDLFNBQUsseUJBQXlCLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRVEseUJBQXlCLE1BQWlFO0FBQ2pHLFFBQUksV0FBNEI7QUFDaEMsUUFBSSxjQUFjLElBQUksR0FBRztBQUN4QixpQkFBVyx1QkFBdUIsZUFBZSxJQUFJO0FBQUEsSUFDdEQsV0FBVyxnQkFBZ0Isa0JBQWtCO0FBQUEsSUFFN0MsT0FBTztBQUNOLGlCQUFXLEtBQUs7QUFBQSxJQUNqQjtBQUVBLFFBQUksVUFBVTtBQUNiLFdBQUssa0JBQWtCLHFCQUFxQixDQUFDLFFBQVEsQ0FBQztBQUFBLElBQ3ZEO0FBQUEsRUFDRDtBQUFBLEVBRUEsUUFBYztBQUdiLFNBQUssb0JBQW9CO0FBR3pCLFNBQUssNEJBQTRCO0FBR2pDLFNBQUssd0JBQXdCLENBQUM7QUFHOUIsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBaUJBLG9CQUEwQjtBQUN6QixTQUFLLGtCQUFrQixtQkFBbUIsTUFBTTtBQUMvQyxZQUFNLGNBQWMsS0FBSyxTQUFTO0FBRWxDLFdBQUssMEJBQTBCLElBQUksWUFBWSxVQUFVLFNBQVMsSUFBSSxDQUFDO0FBQ3ZFLFdBQUssNkJBQTZCLElBQUksWUFBWSxhQUFhLFNBQVMsSUFBSSxDQUFDO0FBRTdFLFdBQUssdUNBQXVDLElBQUksWUFBWSxVQUFVLFNBQVMsVUFBVSxDQUFDO0FBQzFGLFdBQUssMENBQTBDLElBQUksWUFBWSxhQUFhLFNBQVMsVUFBVSxDQUFDO0FBQ2hHLFdBQUssOENBQThDLElBQUksWUFBWSxVQUFVLFNBQVMsVUFBVSxDQUFDO0FBRWpHLFdBQUssaUNBQWlDLElBQUksWUFBWSxVQUFVLFNBQVMsS0FBSyxDQUFDO0FBQy9FLFdBQUssb0NBQW9DLElBQUksWUFBWSxhQUFhLFNBQVMsS0FBSyxDQUFDO0FBQ3JGLFdBQUssd0NBQXdDLElBQUksWUFBWSxVQUFVLFNBQVMsS0FBSyxDQUFDO0FBRXRGLFdBQUssZ0NBQWdDLElBQUksS0FBSyxzQkFBc0IsU0FBUyxDQUFDO0FBQUEsSUFDL0UsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQWVRLDhDQUFvRDtBQUMzRCxVQUFNLG9DQUFvQyxNQUFNO0FBRy9DLFdBQUssOEJBQThCO0FBR25DLFlBQU0sa0JBQWtCLEtBQUsscUJBQXFCLFNBQVMsZUFBZSx3QkFBd0I7QUFDbEcsVUFBSSxvQkFBb0IsZUFBZTtBQUN0QyxhQUFLLHdCQUF3QixRQUFRO0FBQUEsTUFDdEMsV0FBVyxvQkFBb0IsVUFBVTtBQUN4QyxhQUFLLHdCQUF3QixRQUFRO0FBQUEsTUFDdEMsT0FBTztBQUNOLGFBQUssd0JBQXdCLFFBQVE7QUFBQSxNQUN0QztBQUFBLElBQ0Q7QUFFQSxTQUFLLFVBQVUsS0FBSyxxQkFBcUIseUJBQXlCLFdBQVM7QUFDMUUsVUFBSSxNQUFNLHFCQUFxQixlQUFlLHdCQUF3QixHQUFHO0FBQ3hFLDBDQUFrQztBQUFBLE1BQ25DO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixzQ0FBa0M7QUFBQSxFQUNuQztBQUFBLEVBRVEsU0FBUyxRQUFRLEtBQUssbUJBQW1CLGFBQWEsU0FBUyxNQUFNLGNBQXVDO0FBQ25ILFlBQVEsS0FBSyx1QkFBdUI7QUFBQTtBQUFBLE1BR25DLEtBQUssUUFBUSxRQUFRO0FBQ3BCLFlBQUksQ0FBQyxRQUFRO0FBQ1osaUJBQU8sSUFBSSwyQkFBMkI7QUFBQSxRQUN2QztBQUVBLFlBQUksaUJBQWlCLEtBQUssNkJBQTZCLElBQUksTUFBTSxFQUFFO0FBQ25FLFlBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsMkJBQWlCLG9CQUFJLElBQThFO0FBQ25HLGVBQUssNkJBQTZCLElBQUksTUFBTSxJQUFJLGNBQWM7QUFBQSxRQUMvRDtBQUVBLFlBQUksUUFBUSxlQUFlLElBQUksTUFBTSxHQUFHO0FBQ3hDLFlBQUksQ0FBQyxPQUFPO0FBQ1gsZ0JBQU0sYUFBYSxJQUFJLGdCQUFnQjtBQUV2QyxrQkFBUSxXQUFXLElBQUksS0FBSyxxQkFBcUIsZUFBZSx3QkFBd0IsUUFBUSxNQUFNLENBQUM7QUFDdkcscUJBQVcsSUFBSSxNQUFNLFlBQVksTUFBTSxLQUFLLGtDQUFrQyxLQUFLLENBQUMsQ0FBQztBQUVyRix5QkFBZSxJQUFJLFFBQVEsRUFBRSxPQUFPLFdBQVcsQ0FBQztBQUFBLFFBQ2pEO0FBRUEsZUFBTztBQUFBLE1BQ1I7QUFBQTtBQUFBLE1BR0EsS0FBSyxRQUFRLGNBQWM7QUFDMUIsWUFBSSxRQUFRLEtBQUssa0NBQWtDLElBQUksTUFBTSxFQUFFLEdBQUc7QUFDbEUsWUFBSSxDQUFDLE9BQU87QUFDWCxnQkFBTSxhQUFhLElBQUksZ0JBQWdCO0FBRXZDLGtCQUFRLFdBQVcsSUFBSSxLQUFLLHFCQUFxQixlQUFlLHdCQUF3QixRQUFRLFlBQVksQ0FBQztBQUM3RyxxQkFBVyxJQUFJLE1BQU0sWUFBWSxNQUFNLEtBQUssa0NBQWtDLEtBQUssQ0FBQyxDQUFDO0FBRXJGLGVBQUssa0NBQWtDLElBQUksTUFBTSxJQUFJLEVBQUUsT0FBTyxXQUFXLENBQUM7QUFBQSxRQUMzRTtBQUVBLGVBQU87QUFBQSxNQUNSO0FBQUE7QUFBQSxNQUdBLEtBQUssUUFBUSxTQUFTO0FBQ3JCLFlBQUksQ0FBQyxLQUFLLG9DQUFvQztBQUM3QyxlQUFLLHFDQUFxQyxLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSx3QkFBd0IsUUFBUSxPQUFPLENBQUM7QUFFMUksZUFBSyxVQUFVLEtBQUssbUNBQW1DLFlBQVksTUFBTSxLQUFLLGtDQUFrQyxLQUFLLENBQUMsQ0FBQztBQUFBLFFBQ3hIO0FBRUEsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxVQUFVLFFBQWtDO0FBQzNDLFdBQU8sS0FBSyxTQUFTLEVBQUUsVUFBVSxNQUFNO0FBQUEsRUFDeEM7QUFBQSxFQUVBLE9BQU8sUUFBa0M7QUFDeEMsV0FBTyxLQUFLLFNBQVMsRUFBRSxPQUFPLE1BQU07QUFBQSxFQUNyQztBQUFBLEVBRUEsV0FBVyxRQUFrQztBQUM1QyxXQUFPLEtBQUssU0FBUyxFQUFFLFdBQVcsTUFBTTtBQUFBLEVBQ3pDO0FBQUEsRUFFQSxPQUFPLFFBQWtDO0FBQ3hDLFdBQU8sS0FBSyxTQUFTLEVBQUUsT0FBTyxNQUFNO0FBQUEsRUFDckM7QUFBQSxFQUVRLDJDQUEyQyxPQUFxQixZQUFnQztBQUN2RyxTQUFLLFNBQVMsT0FBTyxZQUFZLEtBQUssRUFBRSx5QkFBeUIsVUFBVTtBQUFBLEVBQzVFO0FBQUEsRUFFUSxvREFBb0QsT0FBcUIsWUFBc0MsT0FBOEM7QUFDcEssU0FBSyxTQUFTLE9BQU8sV0FBVyxLQUFLLEVBQUUsa0NBQWtDLFlBQVksS0FBSztBQUFBLEVBQzNGO0FBQUEsRUFFUSxnQ0FBZ0MsR0FBNEI7QUFDbkUsVUFBTSxVQUFVLEtBQUssNkJBQTZCLElBQUksRUFBRSxPQUFPO0FBQy9ELFFBQUksU0FBUztBQUNaLFlBQU0sY0FBYyxRQUFRLElBQUksRUFBRSxNQUFNO0FBQ3hDLFVBQUksYUFBYTtBQUNoQixvQkFBWSxXQUFXLFFBQVE7QUFDL0IsZ0JBQVEsT0FBTyxFQUFFLE1BQU07QUFBQSxNQUN4QjtBQUVBLFVBQUksUUFBUSxTQUFTLEdBQUc7QUFDdkIsYUFBSyw2QkFBNkIsT0FBTyxFQUFFLE9BQU87QUFBQSxNQUNuRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSwwQ0FBMEMsT0FBMkI7QUFHNUUsU0FBSyxvQ0FBb0MsT0FBTyxNQUFNLEVBQUU7QUFHeEQsVUFBTSxtQkFBbUIsS0FBSyxrQ0FBa0MsSUFBSSxNQUFNLEVBQUU7QUFDNUUsUUFBSSxrQkFBa0I7QUFDckIsdUJBQWlCLFdBQVcsUUFBUTtBQUNwQyxXQUFLLGtDQUFrQyxPQUFPLE1BQU0sRUFBRTtBQUFBLElBQ3ZEO0FBQUEsRUFDRDtBQUFBLEVBRVEsOEJBQW9DO0FBQzNDLFNBQUssOEJBQThCLFdBQVMsTUFBTSxNQUFNLENBQUM7QUFBQSxFQUMxRDtBQUFBLEVBRVEsaUNBQWlDLE1BQWlFO0FBQ3pHLFNBQUssOEJBQThCLFdBQVMsTUFBTSxPQUFPLElBQUksQ0FBQztBQUFBLEVBQy9EO0FBQUEsRUFFUSw2QkFBNkIsT0FBaUM7QUFDckUsU0FBSyw4QkFBOEIsV0FBUyxNQUFNLEtBQUssS0FBSyxDQUFDO0FBQUEsRUFDOUQ7QUFBQSxFQUVRLDhCQUE4QixJQUFvRDtBQUd6RixRQUFJLEtBQUssb0NBQW9DO0FBQzVDLFNBQUcsS0FBSyxrQ0FBa0M7QUFBQSxJQUMzQztBQUdBLGVBQVcsQ0FBQyxFQUFFLEtBQUssS0FBSyxLQUFLLG1DQUFtQztBQUMvRCxTQUFHLE1BQU0sS0FBSztBQUFBLElBQ2Y7QUFHQSxlQUFXLENBQUMsRUFBRSxPQUFPLEtBQUssS0FBSyw4QkFBOEI7QUFDNUQsaUJBQVcsQ0FBQyxFQUFFLEtBQUssS0FBSyxTQUFTO0FBQ2hDLFdBQUcsTUFBTSxLQUFLO0FBQUEsTUFDZjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQ0FBc0M7QUFHN0MsU0FBSyxvQ0FBb0MsUUFBUTtBQUNqRCxTQUFLLHFDQUFxQztBQUcxQyxlQUFXLENBQUMsRUFBRSxLQUFLLEtBQUssS0FBSyxtQ0FBbUM7QUFDL0QsWUFBTSxXQUFXLFFBQVE7QUFBQSxJQUMxQjtBQUNBLFNBQUssa0NBQWtDLE1BQU07QUFHN0MsZUFBVyxDQUFDLEVBQUUsTUFBTSxLQUFLLEtBQUssOEJBQThCO0FBQzNELGlCQUFXLENBQUMsRUFBRSxLQUFLLEtBQUssUUFBUTtBQUMvQixjQUFNLFdBQVcsUUFBUTtBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUNBLFNBQUssNkJBQTZCLE1BQU07QUFBQSxFQUN6QztBQUFBLEVBZUEsMkJBQTJCLFNBQTBDO0FBQ3BFLFVBQU0sQ0FBQyxPQUFPLEtBQUssSUFBSSxLQUFLLHdCQUF3QixDQUFBQSxXQUFTQSxTQUFRLEdBQUcsT0FBTztBQUUvRSxXQUFPLEtBQUsscUNBQXFDLE1BQU0sS0FBSyxHQUFHLE9BQU87QUFBQSxFQUN2RTtBQUFBLEVBRUEseUJBQXlCLFNBQTBDO0FBQ2xFLFVBQU0sQ0FBQyxPQUFPLEtBQUssSUFBSSxLQUFLLHdCQUF3QixDQUFBQSxXQUFTQSxTQUFRLEdBQUcsT0FBTztBQUUvRSxXQUFPLEtBQUsscUNBQXFDLE1BQU0sS0FBSyxHQUFHLE9BQU87QUFBQSxFQUN2RTtBQUFBLEVBRUEsTUFBYyxxQ0FBcUMsa0JBQWlELFNBQTBDO0FBQzdJLFFBQUksa0JBQWtCO0FBQ3JCLFlBQU0sZUFBZSxPQUFPLFlBQVksWUFBWSxDQUFDLEtBQUssbUJBQW1CLFNBQVMsT0FBTztBQUU3RixVQUFJLGNBQWM7QUFDakIsYUFBSyx1Q0FBdUM7QUFBQSxNQUM3QyxPQUFPO0FBQ04sYUFBSyw4Q0FBOEM7QUFBQSxNQUNwRDtBQUVBLFlBQU0sUUFBUSxLQUFLLG1CQUFtQixTQUFTLGlCQUFpQixPQUFPLEtBQUssS0FBSyxtQkFBbUI7QUFDcEcsVUFBSTtBQUNILGNBQU0sTUFBTSxXQUFXLGlCQUFpQixNQUFNO0FBQUEsTUFDL0MsVUFBRTtBQUNELFlBQUksY0FBYztBQUNqQixlQUFLLHVDQUF1QztBQUFBLFFBQzdDLE9BQU87QUFDTixlQUFLLDhDQUE4QztBQUFBLFFBQ3BEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBd0IsZUFBMEMsU0FBbUU7QUFDNUksUUFBSTtBQUNKLFFBQUk7QUFFSixVQUFNLFFBQVEsT0FBTyxZQUFZLFdBQVcsS0FBSyxtQkFBbUIsU0FBUyxPQUFPLElBQUk7QUFHeEYsUUFBSSxDQUFDLE9BQU87QUFDWCxnQkFBVSxLQUFLLDRCQUE0QixLQUFLLGNBQWMsV0FBVyxhQUFhLG9CQUFvQjtBQUMxRyxjQUFRLEtBQUs7QUFBQSxJQUNkLE9BR0s7QUFDSixnQkFBVSxLQUFLLG1DQUFtQyxNQUFNLFdBQVcsYUFBYSxvQkFBb0IsRUFBRSxJQUFJLGFBQVcsRUFBRSxTQUFTLE1BQU0sSUFBSSxPQUFPLEVBQUU7QUFDbkosY0FBUSxLQUFLO0FBQUEsSUFDZDtBQUdBLFFBQUksV0FBVyxjQUFjLEtBQUs7QUFDbEMsUUFBSSxXQUFXLEdBQUc7QUFDakIsaUJBQVc7QUFBQSxJQUNaLFdBQVcsV0FBVyxRQUFRLFNBQVMsR0FBRztBQUN6QyxpQkFBVyxRQUFRLFNBQVM7QUFBQSxJQUM3QjtBQUdBLFFBQUksQ0FBQyxPQUFPO0FBQ1gsV0FBSywyQkFBMkI7QUFDaEMsV0FBSyxnQ0FBZ0M7QUFBQSxJQUN0QyxPQUFPO0FBQ04sV0FBSyxrQ0FBa0M7QUFDdkMsV0FBSyx1Q0FBdUM7QUFBQSxJQUM3QztBQUVBLFdBQU8sQ0FBQyxTQUFTLFFBQVE7QUFBQSxFQUMxQjtBQUFBLEVBRVEsd0NBQThDO0FBR3JELFFBQUksQ0FBQyxLQUFLLHNDQUFzQztBQUMvQyxXQUFLLDJCQUEyQjtBQUNoQyxXQUFLLGdDQUFnQztBQUFBLElBQ3RDO0FBR0EsUUFBSSxDQUFDLEtBQUssNkNBQTZDO0FBQ3RELFdBQUssa0NBQWtDO0FBQ3ZDLFdBQUssdUNBQXVDO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBQUEsRUFjUSwrQkFBK0IsT0FBZ0M7QUFDdEUsUUFBSSxLQUFLLHdCQUF3QjtBQUNoQztBQUFBLElBQ0Q7QUFFQSxVQUFNLEVBQUUsUUFBUSxRQUFRLElBQUk7QUFDNUIsUUFBSSxZQUFZLG1CQUFtQixXQUFXLFlBQVksbUJBQW1CLE1BQU07QUFDbEY7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLE9BQU8sVUFBVSxHQUFHO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFVBQU0sZ0JBQWdCLE9BQU8sVUFBVTtBQUN2QyxRQUFJLENBQUMsZUFBZTtBQUNuQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLHNCQUE2QixDQUFDO0FBQ3BDLFVBQU0saUJBQWlCLHVCQUF1QixlQUFlLFFBQVEsRUFBRSxtQkFBbUIsaUJBQWlCLEtBQUssQ0FBQztBQUNqSCxRQUFJLElBQUksTUFBTSxjQUFjLEdBQUc7QUFDOUIsMEJBQW9CLEtBQUssY0FBYztBQUFBLElBQ3hDLFdBQVcsZ0JBQWdCO0FBQzFCLDBCQUFvQixLQUFLLEdBQUcsU0FBUyxDQUFDLGVBQWUsU0FBUyxlQUFlLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDekY7QUFHQSxTQUFLLGdDQUFnQyxNQUFNO0FBRzNDLFNBQUssc0JBQXNCLEtBQUs7QUFBQSxNQUMvQixVQUFVLE9BQU87QUFBQSxNQUNqQixRQUFRO0FBQUEsTUFDUixVQUFVLHVCQUF1QixlQUFlLE1BQU07QUFBQSxNQUN0RDtBQUFBLE1BQ0EsT0FBTyxNQUFNO0FBQUEsTUFDYixRQUFRLE1BQU07QUFBQSxNQUNkLFNBQVMsS0FBSyxvQ0FBb0M7QUFBQSxJQUNuRCxDQUFDO0FBR0QsUUFBSSxLQUFLLHNCQUFzQixTQUFTLGVBQWUsNkJBQTZCO0FBQ25GLFdBQUssc0JBQXNCLE1BQU07QUFBQSxJQUNsQztBQUdBLFNBQUssZ0NBQWdDLElBQUksSUFBSTtBQUFBLEVBQzlDO0FBQUEsRUFFUSxzQ0FBOEM7QUFPckQsUUFBSSxDQUFDLEtBQUsscUNBQXFDO0FBQzlDLFdBQUssc0NBQXNDO0FBQzNDLFdBQUs7QUFDTCxxQkFBZSxNQUFNLEtBQUssc0NBQXNDLEtBQUs7QUFBQSxJQUN0RTtBQUVBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQU0seUJBQXdDO0FBRzdDLFVBQU0sb0JBQW9CLEtBQUssMkJBQTJCO0FBQzFELFFBQUksNEJBQXVEO0FBQzNELFFBQUksa0JBQWtCLFFBQVE7QUFDN0Isa0NBQTRCLEtBQUssMEJBQTBCLGlCQUFpQjtBQUFBLElBQzdFO0FBR0EsU0FBSyxnQ0FBZ0MsSUFBSSxLQUFLLHNCQUFzQixTQUFTLENBQUM7QUFFOUUsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDZCQUFzRDtBQUM3RCxVQUFNLG1CQUFtQixLQUFLLHNCQUFzQixHQUFHLEVBQUU7QUFDekQsUUFBSSxDQUFDLGtCQUFrQjtBQUN0QixhQUFPLENBQUM7QUFBQSxJQUNUO0FBS0EsVUFBTSxRQUFpQyxDQUFDO0FBQ3hDLFdBQU8sS0FBSyxzQkFBc0IsVUFBVSxLQUFLLHNCQUFzQixLQUFLLHNCQUFzQixTQUFTLENBQUMsRUFBRSxZQUFZLGlCQUFpQixTQUFTO0FBQ25KLFlBQU0sUUFBUSxLQUFLLHNCQUFzQixJQUFJLENBQUU7QUFBQSxJQUNoRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLDBCQUEwQixtQkFBMkQ7QUFHbEcsUUFBSSxjQUFjO0FBQ2xCLGVBQVcsb0JBQW9CLG1CQUFtQjtBQUNqRCxZQUFNLGFBQWEsTUFBTSxLQUFLLHlCQUF5QixnQkFBZ0I7QUFDdkUsVUFBSSxZQUFZO0FBQ2Ysc0JBQWM7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQU1BLFFBQUksQ0FBQyxlQUFlLEtBQUssc0JBQXNCLFFBQVE7QUFDdEQsYUFBTyxLQUFLLHVCQUF1QjtBQUFBLElBQ3BDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyx5QkFBeUIsa0JBQTJFO0FBQ2pILFVBQU0sVUFBMEIsRUFBRSxRQUFRLE1BQU0sUUFBUSxpQkFBaUIsUUFBUSxPQUFPLGlCQUFpQixPQUFPLGFBQWEsS0FBSztBQUtsSSxRQUNFLGlCQUFpQixVQUFVLENBQUMsS0FBSyxtQkFBbUIsWUFBWSxTQUFTLGlCQUFpQixLQUFLLEtBQy9GLENBQUMsaUJBQWlCLFVBQVUsS0FBSyxtQkFBbUIsWUFBWSxTQUFTLGlCQUFpQixLQUFLLEdBQy9GO0FBQ0QsY0FBUSxRQUFRO0FBQUEsSUFDakI7QUFHQSxRQUFJLGFBQXNDO0FBQzFDLFFBQUksQ0FBQyxLQUFLLG1CQUFtQixZQUFZLFNBQVMsaUJBQWlCLE1BQU0sR0FBRztBQVEzRSxXQUFLLHlCQUF5QjtBQUM5QixVQUFJO0FBQ0gscUJBQWEsTUFBTSxLQUFLLGNBQWMsV0FBVztBQUFBLFVBQ2hELEdBQUcsaUJBQWlCO0FBQUEsVUFDcEIsU0FBUztBQUFBLFlBQ1IsR0FBRyxpQkFBaUIsT0FBTztBQUFBLFlBQzNCLEdBQUc7QUFBQSxVQUNKO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRixVQUFFO0FBQ0QsYUFBSyx5QkFBeUI7QUFBQSxNQUMvQjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0NBQWdDLE1BQWlFO0FBQ3hHLFNBQUssd0JBQXdCLEtBQUssc0JBQXNCLE9BQU8sMEJBQXdCO0FBQ3RGLFVBQUksY0FBYyxJQUFJLEtBQUsscUJBQXFCLGFBQWEsS0FBSyxVQUFVO0FBQzNFLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxxQkFBcUIsWUFBWSxLQUFLLGFBQWEsWUFBWSxxQkFBcUIsVUFBVSxJQUFJLEdBQUc7QUFDeEcsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLHFCQUFxQixvQkFBb0IsS0FBSyx3QkFBc0IsS0FBSyxhQUFhLFlBQVksb0JBQW9CLElBQUksQ0FBQyxHQUFHO0FBQ2pJLGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUdELFNBQUssZ0NBQWdDLElBQUksS0FBSyxzQkFBc0IsU0FBUyxDQUFDO0FBQUEsRUFDL0U7QUFBQSxFQXlCUSxrQ0FBa0MsWUFBZ0M7QUFHekUsVUFBTSxTQUFTLFlBQVk7QUFDM0IsUUFBSSxDQUFDLFVBQVUsT0FBTyxXQUFXLEtBQUssQ0FBQyxLQUFLLGlCQUFpQixNQUFNLEdBQUc7QUFDckU7QUFBQSxJQUNEO0FBR0EsU0FBSyxrQkFBa0IsTUFBTTtBQUM3QixTQUFLLGFBQWEsTUFBTTtBQUFBLEVBQ3pCO0FBQUEsRUFFUSxhQUFhLFFBQTRDLGNBQWMsTUFBWTtBQUMxRixTQUFLLG9CQUFvQixLQUFLLE9BQU87QUFFckMsVUFBTSxlQUFlLEtBQUssYUFBYSwwQkFBMEIsTUFBTTtBQUN2RSxRQUFJLENBQUMsY0FBYztBQUNsQjtBQUFBLElBQ0Q7QUFHQSxRQUFJLGFBQWE7QUFDaEIsV0FBSyxRQUFRLFFBQVEsWUFBWTtBQUFBLElBQ2xDLE9BQU87QUFDTixXQUFLLFFBQVEsS0FBSyxZQUFZO0FBQUEsSUFDL0I7QUFHQSxRQUFJLEtBQUssUUFBUSxTQUFTLGVBQWUsbUJBQW1CO0FBQzNELFdBQUssYUFBYSxxQkFBcUIsS0FBSyxRQUFRLElBQUksR0FBSSxLQUFLLHNCQUFzQjtBQUFBLElBQ3hGO0FBR0EsUUFBSSxjQUFjLE1BQU0sR0FBRztBQUMxQixXQUFLLGFBQWEsZ0JBQWdCLFFBQVEsTUFBTSxLQUFLLDZCQUE2QixZQUFZLEdBQUcsS0FBSyxzQkFBc0I7QUFBQSxJQUM3SDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDZCQUE2QixRQUFrRDtBQUN0RixRQUFJLGNBQWMsTUFBTSxHQUFHO0FBRzFCLFVBQUksQ0FBQyx3QkFBd0IsTUFBTSxHQUFHO0FBQ3JDLGFBQUssa0JBQWtCLE1BQU07QUFBQSxNQUM5QixPQU1LO0FBQ0osY0FBTSxpQkFBeUMsQ0FBQztBQUNoRCxjQUFNLGFBQWEsT0FBTyxRQUFRLFFBQVEsT0FBTyxTQUFTLElBQUksQ0FBQyxPQUFPLE9BQU8sSUFBSSxDQUFDLE9BQU8sU0FBUyxPQUFPLFNBQVM7QUFDbEgsbUJBQVcsYUFBYSxZQUFZO0FBQ25DLGdCQUFNLHlCQUF5QixLQUFLLGFBQWEsMEJBQTBCLFNBQVM7QUFDcEYsY0FBSSxzQkFBc0Isc0JBQXNCLEtBQUssS0FBSyxpQkFBaUIsc0JBQXNCLEdBQUc7QUFDbkcsMkJBQWUsS0FBSyxzQkFBc0I7QUFBQSxVQUMzQztBQUFBLFFBQ0Q7QUFJQSxhQUFLLGlCQUFpQixRQUFRLEdBQUcsY0FBYztBQUFBLE1BQ2hEO0FBQUEsSUFDRCxPQUFPO0FBR04sVUFBSSxDQUFDLEtBQUssaUJBQWlCLE1BQU0sR0FBRztBQUNuQyxhQUFLLGtCQUFrQixNQUFNO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLFFBQXFEO0FBQzdFLFFBQUksY0FBYyxNQUFNLEdBQUc7QUFDMUIsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLENBQUMsS0FBSyx1QkFBdUIsTUFBTSxRQUFRLE9BQU8sUUFBUTtBQUFBLEVBQ2xFO0FBQUEsRUFFUSw0QkFBa0M7QUFDekMsU0FBSyxvQkFBb0IsS0FBSyxPQUFPO0FBRXJDLFNBQUssVUFBVSxLQUFLLFFBQVEsT0FBTyxXQUFTO0FBQzNDLFlBQU0sVUFBVSxLQUFLLGlCQUFpQixLQUFLO0FBRzNDLFVBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBSyxhQUFhLHFCQUFxQixPQUFPLEtBQUssc0JBQXNCO0FBQUEsTUFDMUU7QUFFQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsY0FBYyxPQUFpQztBQUN0RCxRQUFJLE1BQU0sWUFBWSxjQUFjLElBQUksR0FBRztBQUMxQyxZQUFNLFVBQVUsS0FBSyxrQkFBa0IsS0FBSztBQUM1QyxVQUFJLFNBQVM7QUFDWixhQUFLLGFBQWEsRUFBRSxVQUFVLE1BQU0sT0FBTyxTQUFTLENBQUM7QUFBQSxNQUN0RDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxrQkFBa0IsTUFBMkY7QUFDNUcsUUFBSSxVQUFVO0FBRWQsU0FBSyxvQkFBb0IsS0FBSyxPQUFPO0FBRXJDLFNBQUssVUFBVSxLQUFLLFFBQVEsT0FBTyxXQUFTO0FBQzNDLFlBQU0sVUFBVSxLQUFLLGFBQWEsY0FBYyxNQUFNLEtBQUs7QUFHM0QsVUFBSSxTQUFTO0FBQ1osYUFBSyxhQUFhLHFCQUFxQixNQUFNLEtBQUssc0JBQXNCO0FBQ3hFLGtCQUFVO0FBQUEsTUFDWDtBQUVBLGFBQU8sQ0FBQztBQUFBLElBQ1QsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxpQkFBaUIsV0FBK0MsY0FBdUU7QUFDOUksU0FBSyxvQkFBb0IsS0FBSyxPQUFPO0FBRXJDLFFBQUksV0FBVztBQUVmLFVBQU0sYUFBd0QsQ0FBQztBQUMvRCxlQUFXLFNBQVMsS0FBSyxTQUFTO0FBR2pDLFVBQUksS0FBSyxhQUFhLGNBQWMsUUFBUSxLQUFLLEdBQUc7QUFHbkQsYUFBSyxhQUFhLHFCQUFxQixRQUFRLEtBQUssc0JBQXNCO0FBRzFFLFlBQUksQ0FBQyxVQUFVO0FBQ2QscUJBQVcsS0FBSyxHQUFHLFlBQVk7QUFDL0IscUJBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxXQUlTLENBQUMsYUFBYSxLQUFLLGlCQUFlLEtBQUssYUFBYSxjQUFjLGFBQWEsS0FBSyxDQUFDLEdBQUc7QUFDaEcsbUJBQVcsS0FBSyxLQUFLO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBSUEsUUFBSSxDQUFDLFVBQVU7QUFDZCxpQkFBVyxLQUFLLEdBQUcsWUFBWTtBQUFBLElBQ2hDO0FBRUEsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUVBLHNCQUE0QjtBQUMzQixTQUFLLFVBQVUsQ0FBQztBQUVoQixTQUFLLHVCQUF1QixtQkFBbUI7QUFBQSxFQUNoRDtBQUFBLEVBRUEsYUFBOEQ7QUFDN0QsU0FBSyxvQkFBb0IsS0FBSyxPQUFPO0FBRXJDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVRLG9CQUFvQixTQUFpRjtBQUM1RyxRQUFJLENBQUMsS0FBSyxTQUFTO0FBR2xCLFdBQUssVUFBVSxDQUFDO0FBS2hCLFVBQUksS0FBSyxtQkFBbUIsU0FBUztBQUNwQyxhQUFLLFlBQVk7QUFBQSxNQUNsQixPQUFPO0FBQ04sU0FBQyxZQUFZO0FBQ1osZ0JBQU0sS0FBSyxtQkFBbUI7QUFFOUIsZUFBSyxZQUFZO0FBQUEsUUFDbEIsR0FBRztBQUFBLE1BQ0o7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsY0FBb0I7QUFLM0IsU0FBSyxVQUFVLENBQUM7QUFHaEIsVUFBTSxzQkFBc0IsS0FBSyx1QkFBdUI7QUFLeEQsVUFBTSxtQkFBbUIsQ0FBQyxHQUFHLEtBQUssY0FBYyxXQUFXLGFBQWEsb0JBQW9CLENBQUMsRUFBRSxRQUFRO0FBU3ZHLFVBQU0saUJBQWlCLG9CQUFJLElBQXNDO0FBR2pFLGVBQVcsRUFBRSxPQUFPLEtBQUssa0JBQWtCO0FBQzFDLFVBQUksQ0FBQyxLQUFLLGlCQUFpQixNQUFNLEdBQUc7QUFDbkM7QUFBQSxNQUNEO0FBR0EsVUFBSSxPQUFPLFVBQVU7QUFDcEIsY0FBTSxpQkFBaUIsR0FBRyxPQUFPLFNBQVMsU0FBUyxDQUFDLElBQUksT0FBTyxRQUFRO0FBQ3ZFLFlBQUksZUFBZSxJQUFJLGNBQWMsR0FBRztBQUN2QztBQUFBLFFBQ0Q7QUFFQSx1QkFBZSxJQUFJLGNBQWM7QUFBQSxNQUNsQztBQUdBLFdBQUssYUFBYSxNQUFNO0FBQUEsSUFDekI7QUFLQSxlQUFXLFVBQVUscUJBQXFCO0FBQ3pDLFlBQU0saUJBQWlCLEdBQUcsT0FBTyxTQUFTLFNBQVMsQ0FBQyxJQUFJLE9BQU8sU0FBUyxRQUFRO0FBQ2hGLFVBQ0MsQ0FBQyxlQUFlLElBQUksY0FBYyxLQUNsQyxLQUFLLGlCQUFpQixNQUFNLEdBQzNCO0FBQ0QsdUJBQWUsSUFBSSxjQUFjO0FBQ2pDLGFBQUs7QUFBQSxVQUFhO0FBQUEsVUFBUTtBQUFBO0FBQUEsUUFBc0I7QUFBQSxNQUNqRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSx5QkFBc0Q7QUFDN0QsVUFBTSxVQUFrQyxDQUFDO0FBRXpDLFVBQU0sYUFBYSxLQUFLLGVBQWUsSUFBSSxlQUFlLHFCQUFxQixhQUFhLFNBQVM7QUFDckcsUUFBSSxZQUFZO0FBQ2YsVUFBSTtBQUNILGNBQU0sZ0JBQWlELEtBQUssTUFBTSxVQUFVO0FBQzVFLG1CQUFXLGVBQWUsZUFBZTtBQUN4QyxjQUFJLENBQUMsWUFBWSxVQUFVLENBQUMsWUFBWSxPQUFPLFVBQVU7QUFDeEQ7QUFBQSxVQUNEO0FBRUEsY0FBSTtBQUNILG9CQUFRLEtBQUs7QUFBQSxjQUNaLEdBQUcsWUFBWTtBQUFBLGNBQ2YsVUFBVSxPQUFPLFlBQVksT0FBTyxhQUFhLFdBQ2hELElBQUksTUFBTSxZQUFZLE9BQU8sUUFBUTtBQUFBO0FBQUEsZ0JBQ3JDLElBQUksS0FBSyxZQUFZLE9BQU8sUUFBUTtBQUFBO0FBQUE7QUFBQSxZQUN0QyxDQUFDO0FBQUEsVUFDRixTQUFTLE9BQU87QUFDZiw4QkFBa0IsS0FBSztBQUFBLFVBQ3hCO0FBQUEsUUFDRDtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsMEJBQWtCLEtBQUs7QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsWUFBa0I7QUFDekIsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQTJDLENBQUM7QUFDbEQsZUFBVyxVQUFVLEtBQUssU0FBUztBQUNsQyxVQUFJLGNBQWMsTUFBTSxLQUFLLENBQUMsc0JBQXNCLE1BQU0sR0FBRztBQUM1RDtBQUFBLE1BQ0Q7QUFFQSxjQUFRLEtBQUs7QUFBQSxRQUNaLFFBQVE7QUFBQSxVQUNQLEdBQUc7QUFBQSxVQUNILFVBQVUsT0FBTyxTQUFTLFNBQVM7QUFBQSxRQUNwQztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFFQSxTQUFLLGVBQWUsTUFBTSxlQUFlLHFCQUFxQixLQUFLLFVBQVUsT0FBTyxHQUFHLGFBQWEsV0FBVyxjQUFjLE9BQU87QUFBQSxFQUNySTtBQUFBO0FBQUE7QUFBQSxFQU1BLDJCQUEyQixjQUF1QixpQkFBMkM7QUFHNUYsVUFBTSxVQUFVLEtBQUssZUFBZSxhQUFhLEVBQUU7QUFDbkQsUUFBSSxRQUFRLFdBQVcsR0FBRztBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUdBLFFBQUksUUFBUSxXQUFXLEdBQUc7QUFDekIsWUFBTSxXQUFXLFFBQVEsQ0FBQyxFQUFFO0FBQzVCLFdBQUssQ0FBQyxnQkFBZ0IsU0FBUyxXQUFXLGtCQUFrQixDQUFDLG1CQUFtQixTQUFTLGNBQWMsa0JBQWtCO0FBQ3hILGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFHQSxlQUFXLFNBQVMsS0FBSyxXQUFXLEdBQUc7QUFDdEMsVUFBSSxjQUFjLEtBQUssR0FBRztBQUN6QjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLGdCQUFnQixNQUFNLFNBQVMsV0FBVyxjQUFjO0FBQzNEO0FBQUEsTUFDRDtBQUVBLFVBQUksbUJBQW1CLE1BQU0sU0FBUyxjQUFjLGlCQUFpQjtBQUNwRTtBQUFBLE1BQ0Q7QUFFQSxZQUFNLG9CQUFvQixLQUFLLGVBQWUsbUJBQW1CLE1BQU0sUUFBUTtBQUMvRSxVQUFJLG1CQUFtQjtBQUN0QixlQUFPLGtCQUFrQjtBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUdBLGVBQVcsVUFBVSxTQUFTO0FBQzdCLFlBQU0sV0FBVyxPQUFPO0FBQ3hCLFdBQUssQ0FBQyxnQkFBZ0IsU0FBUyxXQUFXLGtCQUFrQixDQUFDLG1CQUFtQixTQUFTLGNBQWMsa0JBQWtCO0FBQ3hILGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxrQkFBa0IsZ0JBQXdCLG1CQUE2QztBQUN0RixlQUFXLFNBQVMsS0FBSyxXQUFXLEdBQUc7QUFDdEMsVUFBSTtBQUNKLFVBQUksY0FBYyxLQUFLLEdBQUc7QUFDekIsbUJBQVcsdUJBQXVCLGVBQWUsT0FBTyxFQUFFLGVBQWUsQ0FBQztBQUFBLE1BQzNFLE9BQU87QUFDTixtQkFBVyxNQUFNO0FBQUEsTUFDbEI7QUFFQSxVQUFJLFlBQVksU0FBUyxXQUFXLG1CQUFtQixDQUFDLHFCQUFxQixTQUFTLGNBQWMsb0JBQW9CO0FBQ3ZILGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUlTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUVkLGVBQVcsQ0FBQyxFQUFFLEtBQUssS0FBSyxLQUFLLG1DQUFtQztBQUMvRCxZQUFNLFdBQVcsUUFBUTtBQUFBLElBQzFCO0FBRUEsZUFBVyxDQUFDLEVBQUUsT0FBTyxLQUFLLEtBQUssOEJBQThCO0FBQzVELGlCQUFXLENBQUMsRUFBRSxLQUFLLEtBQUssU0FBUztBQUNoQyxjQUFNLFdBQVcsUUFBUTtBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUVBLGVBQVcsQ0FBQyxFQUFFLFFBQVEsS0FBSyxLQUFLLHdCQUF3QjtBQUN2RCxlQUFTLFFBQVE7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFDRDtBQTFyQ2EsZUFJWSwyQkFBMkI7QUFBQTtBQUFBO0FBSnZDLGVBMmxCWSw4QkFBOEI7QUFBQTtBQUFBO0FBM2xCMUMsZUEweEJZLG9CQUFvQjtBQTF4QmhDLGVBMnhCWSxzQkFBc0I7QUEzeEJsQyxpQkFBTjtBQUFBLEVBWUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F0QlU7QUE0ckNiLGtCQUFrQixpQkFBaUIsZ0JBQWdCLGtCQUFrQixLQUFLO0FBRTFFLE1BQU0scUJBQXFCO0FBQUEsRUFFMUIsWUFDa0Isa0JBQ1IsV0FDUSxRQUNoQjtBQUhnQjtBQUNSO0FBQ1E7QUFBQSxFQUNkO0FBQUEsRUFFSiw0QkFBNEIsT0FBc0M7QUFDakUsUUFBSSxLQUFLLGlCQUFpQixZQUFZLE1BQU0saUJBQWlCLFNBQVM7QUFDckUsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLENBQUMsS0FBSyxpQkFBaUIsT0FBTyxRQUFRLE1BQU0saUJBQWlCLE1BQU0sR0FBRztBQUN6RSxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksQ0FBQyxLQUFLLGFBQWEsQ0FBQyxNQUFNLFdBQVc7QUFDeEMsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQVMsS0FBSyxVQUFVLFFBQVEsTUFBTSxTQUFTO0FBRXJELFFBQUksV0FBVyxpQ0FBaUMsWUFBWSxNQUFNLFdBQVcsZ0NBQWdDLGNBQWMsTUFBTSxXQUFXLGdDQUFnQyxPQUFPO0FBR2xMLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxXQUFXLGlDQUFpQztBQUFBLEVBQ3BEO0FBQ0Q7QUFxQkEsSUFBTSx5QkFBTixjQUFxQyxXQUE4QztBQUFBLEVBVWxGLFlBQ2tCLE9BQ3VCLHNCQUN2QztBQUNELFVBQU07QUFIVztBQUN1QjtBQUl4QyxTQUFLLGtCQUFrQixLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSx1QkFBdUIsU0FBUyxNQUFNLEtBQUssS0FBSyxDQUFDO0FBQ2hJLFNBQUssYUFBYSxLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSx1QkFBdUIsU0FBUyxPQUFPLEtBQUssS0FBSyxDQUFDO0FBQzVILFNBQUssbUJBQW1CLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLHVCQUF1QixTQUFTLFlBQVksS0FBSyxLQUFLLENBQUM7QUFFdkksU0FBSyxTQUFTO0FBQUEsTUFDYixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsSUFDTjtBQUVBLFNBQUssY0FBYyxNQUFNO0FBQUEsTUFDeEIsS0FBSyxnQkFBZ0I7QUFBQSxNQUNyQixLQUFLLFdBQVc7QUFBQSxNQUNoQixLQUFLLGlCQUFpQjtBQUFBLElBQ3ZCO0FBQUEsRUFDRDtBQUFBLEVBRUEsYUFBYSxRQUE0QjtBQUN4QyxXQUFPLEtBQUssU0FBUyxNQUFNLEVBQUUsYUFBYTtBQUFBLEVBQzNDO0FBQUEsRUFFQSxVQUFVLFFBQWtDO0FBQzNDLFdBQU8sS0FBSyxTQUFTLE1BQU0sRUFBRSxVQUFVO0FBQUEsRUFDeEM7QUFBQSxFQUVBLFVBQVUsUUFBNEI7QUFDckMsV0FBTyxLQUFLLFNBQVMsTUFBTSxFQUFFLFVBQVU7QUFBQSxFQUN4QztBQUFBLEVBRUEsT0FBTyxRQUFrQztBQUN4QyxXQUFPLEtBQUssU0FBUyxNQUFNLEVBQUUsT0FBTztBQUFBLEVBQ3JDO0FBQUEsRUFFQSxXQUFXLFFBQWtDO0FBQzVDLFdBQU8sS0FBSyxTQUFTLE1BQU0sRUFBRSxXQUFXO0FBQUEsRUFDekM7QUFBQSxFQUVBLFVBQVUsUUFBNEI7QUFDckMsV0FBTyxLQUFLLFNBQVMsTUFBTSxFQUFFLFVBQVU7QUFBQSxFQUN4QztBQUFBLEVBRUEsT0FBTyxRQUFrQztBQUN4QyxXQUFPLEtBQUssU0FBUyxNQUFNLEVBQUUsT0FBTztBQUFBLEVBQ3JDO0FBQUEsRUFFUSxTQUFTLFNBQVMsU0FBUyxNQUE2QjtBQUMvRCxZQUFRLFFBQVE7QUFBQSxNQUNmLEtBQUssU0FBUztBQUFNLGVBQU8sS0FBSztBQUFBLE1BQ2hDLEtBQUssU0FBUztBQUFPLGVBQU8sS0FBSztBQUFBLE1BQ2pDLEtBQUssU0FBUztBQUFZLGVBQU8sS0FBSztBQUFBLElBQ3ZDO0FBQUEsRUFDRDtBQUFBLEVBRUEseUJBQXlCLFlBQWdDO0FBR3hELFNBQUssZ0JBQWdCLGlCQUFpQixVQUFVO0FBQUEsRUFDakQ7QUFBQSxFQUVBLGtDQUFrQyxZQUFzQyxPQUE4QztBQUNySCxVQUFNLFdBQVcsS0FBSyxnQkFBZ0I7QUFHdEMsU0FBSyxnQkFBZ0IsaUJBQWlCLFlBQVksS0FBSztBQUd2RCxRQUFJLE1BQU0sV0FBVyxnQ0FBZ0MsTUFBTTtBQUMxRCxXQUFLLFdBQVcsaUJBQWlCLFlBQVksS0FBSztBQUFBLElBQ25ELFlBUUUsTUFBTSxXQUFXLGdDQUFnQyxjQUFjLE1BQU0sV0FBVyxnQ0FBZ0MsU0FDakgsQ0FBQyxLQUFLLGdCQUFnQixhQUFhLEdBQ2xDO0FBT0QsVUFBSSxNQUFNLFdBQVcsZ0NBQWdDLFFBQVEsQ0FBQyxLQUFLLGlCQUFpQixhQUFhLEdBQUc7QUFDbkcsWUFBSSxVQUFVO0FBQ2IsZUFBSyxpQkFBaUIsYUFBYSxTQUFTLFNBQVMsU0FBUyxRQUFRLFNBQVMsU0FBUztBQUFBLFFBQ3pGO0FBQUEsTUFDRDtBQUVBLFdBQUssaUJBQWlCLGlCQUFpQixZQUFZLEtBQUs7QUFBQSxJQUN6RDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFFBQWM7QUFDYixlQUFXLFNBQVMsS0FBSyxRQUFRO0FBQ2hDLFlBQU0sTUFBTTtBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFPLE1BQW1GO0FBQ3pGLGVBQVcsU0FBUyxLQUFLLFFBQVE7QUFDaEMsWUFBTSxPQUFPLElBQUk7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLEtBQUssT0FBaUM7QUFDckMsZUFBVyxTQUFTLEtBQUssUUFBUTtBQUNoQyxZQUFNLEtBQUssS0FBSztBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQUNEO0FBaElNLHlCQUFOO0FBQUEsRUFZRztBQUFBLEdBWkc7QUFrSU4sTUFBTSwyQkFBOEQ7QUFBQSxFQUFwRTtBQUNDLHVCQUFjLE1BQU07QUFBQTtBQUFBLEVBRXBCLGVBQXdCO0FBQUUsV0FBTztBQUFBLEVBQU87QUFBQSxFQUN4QyxNQUFNLFlBQTJCO0FBQUEsRUFBRTtBQUFBLEVBQ25DLFlBQXFCO0FBQUUsV0FBTztBQUFBLEVBQU87QUFBQSxFQUNyQyxNQUFNLFNBQXdCO0FBQUEsRUFBRTtBQUFBLEVBQ2hDLE1BQU0sYUFBNEI7QUFBQSxFQUFFO0FBQUEsRUFDcEMsWUFBcUI7QUFBRSxXQUFPO0FBQUEsRUFBTztBQUFBLEVBQ3JDLE1BQU0sU0FBd0I7QUFBQSxFQUFFO0FBQUEsRUFFaEMsMkJBQWlDO0FBQUEsRUFBRTtBQUFBLEVBQ25DLG9DQUEwQztBQUFBLEVBQUU7QUFBQSxFQUU1QyxRQUFjO0FBQUEsRUFBRTtBQUFBLEVBQ2hCLFNBQWU7QUFBQSxFQUFFO0FBQUEsRUFDakIsT0FBYTtBQUFBLEVBQUU7QUFBQSxFQUVmLFVBQWdCO0FBQUEsRUFBRTtBQUNuQjtBQVFPLElBQU0sd0JBQU4sY0FBb0MsV0FBVztBQUFBLEVBK0JyRCxZQUNrQixRQUNBLE9BQ00sc0JBQ1UsZUFDTSxvQkFDVCxZQUM3QjtBQUNELFVBQU07QUFQVztBQUNBO0FBRWdCO0FBQ007QUFDVDtBQWpDL0IsU0FBaUIsZUFBZSxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDbEUsU0FBUyxjQUFjLEtBQUssYUFBYTtBQUV6QyxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksY0FBNEMsQ0FBQztBQUN6RyxTQUFpQix1QkFBdUIsS0FBSyxVQUFVLElBQUksZUFBMkM7QUFJdEcsU0FBUSxRQUF1QyxDQUFDO0FBRWhELFNBQVEsUUFBUTtBQUNoQixTQUFRLGdCQUFnQjtBQUV4QixTQUFRLGFBQWE7QUFFckIsU0FBUSx3QkFBMEQ7QUFzQmpFLFNBQUssZUFBZSxxQkFBcUIsZUFBZSxZQUFZO0FBRXBFLFNBQUssa0JBQWtCO0FBQUEsRUFDeEI7QUFBQSxFQXZCQSxJQUFJLFVBQW1EO0FBQ3RELFdBQU8sS0FBSyxNQUFNLEtBQUssS0FBSztBQUFBLEVBQzdCO0FBQUEsRUFFQSxJQUFZLFFBQVEsT0FBZ0Q7QUFDbkUsUUFBSSxPQUFPO0FBQ1YsV0FBSyxNQUFNLEtBQUssS0FBSyxJQUFJO0FBQUEsSUFDMUI7QUFBQSxFQUNEO0FBQUEsRUFpQlEsb0JBQTBCO0FBQ2pDLFNBQUssVUFBVSxLQUFLLFlBQVksTUFBTSxLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQ3hELFNBQUssVUFBVSxLQUFLLFdBQVcsb0JBQW9CLE1BQU0sS0FBSyxXQUFXLENBQUMsQ0FBQztBQUMzRSxTQUFLLFVBQVUsS0FBSyxtQkFBbUIsaUJBQWlCLFdBQVM7QUFDaEUsV0FBSyxxQkFBcUIsaUJBQWlCLE1BQU0sRUFBRTtBQUFBLElBQ3BELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLGFBQW1CO0FBQzFCLFFBQUksS0FBSyxXQUFXLFNBQVMsTUFBTSxTQUFTLE9BQU87QUFDbEQ7QUFBQSxJQUNEO0FBRUEsVUFBTSxjQUF3QixDQUFDO0FBQy9CLGVBQVcsU0FBUyxLQUFLLE9BQU87QUFDL0IsVUFBSSxPQUFPLE1BQU0sV0FBVyxRQUFRLFlBQVk7QUFDL0Msb0JBQVksS0FBSyxZQUFZLE1BQU0sT0FBTyxhQUFhLE1BQU0sT0FBTyxVQUFVLFNBQVMsQ0FBQyxnQkFBZ0IsTUFBTSxVQUFVLElBQUksQ0FBQyxFQUFFO0FBQUEsTUFDaEksT0FBTztBQUNOLG9CQUFZLEtBQUssWUFBWSxNQUFNLE9BQU8sYUFBYSxNQUFNLE9BQU8sVUFBVSxTQUFTLENBQUMscUJBQXFCO0FBQUEsTUFDOUc7QUFBQSxJQUNEO0FBRUEsUUFBSSxZQUFZLFdBQVcsR0FBRztBQUM3QixXQUFLLE1BQU0sVUFBVSxLQUFLLEtBQUssaUJBQWlCLEtBQUssYUFBYSxDQUFDLFdBQVc7QUFBQSxJQUMvRSxPQUFPO0FBQ04sV0FBSyxNQUFNLFVBQVUsS0FBSyxLQUFLLGlCQUFpQixLQUFLLGFBQWEsQ0FBQztBQUFBLEVBQ3BFLFlBQVksS0FBSyxJQUFJLENBQUM7QUFBQSxJQUNwQjtBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFUSxNQUFNLEtBQWEsU0FBZ0UsTUFBTSxPQUErQztBQUMvSSxRQUFJLEtBQUssV0FBVyxTQUFTLE1BQU0sU0FBUyxPQUFPO0FBQ2xEO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSixZQUFRLEtBQUssUUFBUTtBQUFBLE1BQ3BCLEtBQUssU0FBUztBQUFNLHNCQUFjO0FBQ2pDO0FBQUEsTUFDRCxLQUFLLFNBQVM7QUFBTyxzQkFBYztBQUNsQztBQUFBLE1BQ0QsS0FBSyxTQUFTO0FBQVksc0JBQWM7QUFDdkM7QUFBQSxJQUNGO0FBRUEsUUFBSTtBQUNKLFlBQVEsS0FBSyxPQUFPO0FBQUEsTUFDbkIsS0FBSyxRQUFRO0FBQVMscUJBQWE7QUFDbEM7QUFBQSxNQUNELEtBQUssUUFBUTtBQUFjLHFCQUFhO0FBQ3ZDO0FBQUEsTUFDRCxLQUFLLFFBQVE7QUFBUSxxQkFBYTtBQUNqQztBQUFBLElBQ0Y7QUFFQSxRQUFJLFdBQVcsTUFBTTtBQUNwQixXQUFLLFdBQVcsTUFBTSxrQkFBa0IsV0FBVyxJQUFJLFVBQVUsTUFBTSxHQUFHLGFBQWEsUUFBUSxVQUFVLFNBQVMsQ0FBQyxZQUFZLEtBQUssV0FBVyxLQUFLLENBQUMsR0FBRztBQUFBLElBQ3pKLE9BQU87QUFDTixXQUFLLFdBQVcsTUFBTSxrQkFBa0IsV0FBVyxJQUFJLFVBQVUsTUFBTSxHQUFHLEVBQUU7QUFBQSxJQUM3RTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFdBQVcsT0FBaUQ7QUFDbkUsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUVBLFlBQVEsTUFBTSxRQUFRO0FBQUEsTUFDckIsS0FBSyxnQ0FBZ0M7QUFBTSxlQUFPO0FBQUEsTUFDbEQsS0FBSyxnQ0FBZ0M7QUFBWSxlQUFPO0FBQUEsTUFDeEQsS0FBSyxnQ0FBZ0M7QUFBTSxlQUFPO0FBQUEsTUFDbEQsS0FBSyxnQ0FBZ0M7QUFBYyxlQUFPO0FBQUEsTUFDMUQsS0FBSyxnQ0FBZ0M7QUFBTSxlQUFPO0FBQUEsSUFDbkQ7QUFBQSxFQUNEO0FBQUEsRUFFUSx1QkFBdUIsU0FBZ0M7QUFDOUQsUUFBSSxDQUFDLEtBQUsscUJBQXFCLElBQUksT0FBTyxHQUFHO0FBQzVDLFlBQU0sUUFBUSxLQUFLLG1CQUFtQixTQUFTLE9BQU87QUFDdEQsVUFBSSxPQUFPO0FBQ1YsYUFBSyxxQkFBcUIsSUFBSSxTQUFTLE1BQU0saUJBQWlCLE9BQUssS0FBSyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUM3RjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxpQkFBaUIsR0FBK0I7QUFDdkQsU0FBSyxNQUFNLHNCQUFzQixFQUFFLE1BQU07QUFFekMsUUFBSSxLQUFLLFVBQVUsUUFBUSxjQUFjO0FBQ3hDO0FBQUEsSUFDRDtBQUVBLGVBQVcsU0FBUyxLQUFLLE9BQU87QUFDL0IsVUFBSSxNQUFNLFlBQVksRUFBRSxTQUFTO0FBQ2hDO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxLQUFLLGFBQWEsY0FBYyxFQUFFLFFBQVEsTUFBTSxNQUFNLEdBQUc7QUFDN0Q7QUFBQSxNQUNEO0FBR0EsWUFBTSxVQUFVLEVBQUU7QUFBQSxJQUNuQjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBSUEsaUJBQWlCLFlBQXFDLE9BQStDO0FBQ3BHLFNBQUssTUFBTSxzQkFBc0IsWUFBWSxPQUFPLEtBQUs7QUFFekQsVUFBTSw2QkFBNkIsMEJBQTBCLFVBQVU7QUFDdkUsVUFBTSxpQkFBaUIsWUFBWSxTQUFTLENBQUMsV0FBVyxNQUFNLFdBQVc7QUFNekUsUUFBSSxLQUFLLFlBQVk7QUFDcEIsV0FBSyxNQUFNLDRDQUE0QyxZQUFZLE9BQU8sS0FBSztBQUUvRSxVQUFJLDhCQUE4QixnQkFBZ0I7QUFDakQsYUFBSyxNQUFNLHVEQUF1RCxZQUFZLE9BQU8sS0FBSztBQUUxRixhQUFLLHdCQUF3QixJQUFJLHFCQUFxQixFQUFFLFNBQVMsV0FBVyxNQUFNLElBQUksUUFBUSxXQUFXLE1BQU0sR0FBRyxXQUFXLGFBQWEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUMzSixPQUFPO0FBQ04sYUFBSyxNQUFNLHVEQUF1RCxZQUFZLE9BQU8sS0FBSztBQUUxRixhQUFLLHdCQUF3QjtBQUFBLE1BQzlCO0FBQUEsSUFDRCxPQUdLO0FBQ0osV0FBSyxNQUFNLG1DQUFtQyxZQUFZLE9BQU8sS0FBSztBQUd0RSxVQUFJLDhCQUE4QixnQkFBZ0I7QUFDakQsYUFBSyxpQ0FBaUMsV0FBVyxNQUFNLElBQUksV0FBVyxPQUFPLFdBQVcsYUFBYSxHQUFHLEtBQUs7QUFBQSxNQUM5RyxPQUdLO0FBQ0osYUFBSyx3QkFBd0I7QUFFN0IsWUFBSSxnQkFBZ0I7QUFDbkIsZUFBSyxvQ0FBb0MsV0FBVyxNQUFNLElBQUksV0FBVyxLQUFLO0FBQUEsUUFDL0U7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlDQUFpQyxTQUEwQixRQUFxQixXQUE2QyxPQUErQztBQUNuTCxRQUFJLEtBQUssU0FBUyxZQUFZLFdBQVcsQ0FBQyxhQUFhLEtBQUssYUFBYSxjQUFjLEtBQUssUUFBUSxRQUFRLE1BQU0sR0FBRztBQUNwSDtBQUFBLElBQ0Q7QUFFQSxTQUFLLE1BQU0sc0NBQXNDLFFBQVEsS0FBSztBQUU5RCxVQUFNLGlCQUFpQixJQUFJLHFCQUFxQixFQUFFLFNBQVMsT0FBTyxHQUFHLFdBQVcsT0FBTyxNQUFNO0FBRzdGLFFBQUksQ0FBQyxLQUFLLHlCQUF5QixLQUFLLHNCQUFzQiw0QkFBNEIsY0FBYyxHQUFHO0FBQzFHLFdBQUssTUFBTSxTQUFTLFFBQVEsZUFBZSxTQUFTO0FBQUEsSUFDckQsT0FHSztBQUNKLFdBQUssVUFBVSxTQUFTLFFBQVEsZUFBZSxTQUFTO0FBQUEsSUFDekQ7QUFHQSxTQUFLLHdCQUF3QjtBQUFBLEVBQzlCO0FBQUEsRUFFUSxvQ0FBb0MsU0FBMEIsUUFBMkI7QUFDaEcsUUFBSSxLQUFLLFNBQVMsWUFBWSxXQUFXLEtBQUssYUFBYSxjQUFjLEtBQUssUUFBUSxRQUFRLE1BQU0sR0FBRztBQUN0RztBQUFBLElBQ0Q7QUFFQSxTQUFLLE1BQU0seUNBQXlDLE1BQU07QUFFMUQsU0FBSyxNQUFNLFNBQVMsTUFBTTtBQUFBLEVBQzNCO0FBQUEsRUFFUSxNQUFNLFNBQTBCLFFBQTRDLFdBQXdDO0FBQzNILFFBQUksQ0FBQyxLQUFLLFlBQVk7QUFDckIsV0FBSyxhQUFhLFNBQVMsUUFBUSxTQUFTO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBQUEsRUFFUSxVQUFVLFNBQTBCLFFBQTRDLFdBQXdDO0FBQy9ILFFBQUksQ0FBQyxLQUFLLFlBQVk7QUFDckIsV0FBSztBQUFBLFFBQWE7QUFBQSxRQUFTO0FBQUEsUUFBUTtBQUFBLFFBQVc7QUFBQTtBQUFBLE1BQXdCO0FBQUEsSUFDdkU7QUFBQSxFQUNEO0FBQUEsRUFFQSxhQUFhLFNBQTBCLGlCQUFxRCxXQUFrQyxjQUE4QjtBQUczSixTQUFLLHVCQUF1QixPQUFPO0FBR25DLFFBQUksVUFBVTtBQUNkLFFBQUksS0FBSyxTQUFTO0FBQ2pCLFVBQUksY0FBYztBQUNqQixrQkFBVTtBQUFBLE1BQ1gsV0FBVyxLQUFLLHdCQUF3QixLQUFLLFNBQVMsRUFBRSxTQUFTLFFBQVEsaUJBQWlCLFVBQVUsQ0FBQyxHQUFHO0FBQ3ZHLGtCQUFVO0FBQUEsTUFDWDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsS0FBSyxhQUFhLDBCQUEwQixlQUFlO0FBQzFFLFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBRUEsUUFBSSxTQUFTO0FBQ1osV0FBSyxNQUFNLGFBQWEsTUFBTTtBQUFBLElBQy9CLE9BQU87QUFDTixXQUFLLE1BQU0sU0FBUyxNQUFNO0FBQUEsSUFDM0I7QUFFQSxVQUFNLGdCQUE2QyxFQUFFLFNBQVMsUUFBUSxVQUFVO0FBR2hGLFVBQU0saUJBQWdELENBQUM7QUFDdkQsUUFBSSxTQUFTO0FBQ1osVUFBSSxLQUFLLFNBQVM7QUFDakIsdUJBQWUsS0FBSyxLQUFLLE9BQU87QUFBQSxNQUNqQztBQUNBLFdBQUssVUFBVTtBQUFBLElBQ2hCLE9BR0s7QUFHSixVQUFJLEtBQUssTUFBTSxTQUFTLEtBQUssUUFBUSxHQUFHO0FBQ3ZDLGlCQUFTLElBQUksS0FBSyxRQUFRLEdBQUcsSUFBSSxLQUFLLE1BQU0sUUFBUSxLQUFLO0FBQ3hELHlCQUFlLEtBQUssS0FBSyxNQUFNLENBQUMsQ0FBQztBQUFBLFFBQ2xDO0FBRUEsYUFBSyxRQUFRLEtBQUssTUFBTSxNQUFNLEdBQUcsS0FBSyxRQUFRLENBQUM7QUFBQSxNQUNoRDtBQUdBLFdBQUssTUFBTSxPQUFPLEtBQUssUUFBUSxHQUFHLEdBQUcsYUFBYTtBQUdsRCxVQUFJLEtBQUssTUFBTSxTQUFTLHNCQUFzQixnQkFBZ0I7QUFDN0QsdUJBQWUsS0FBSyxLQUFLLE1BQU0sTUFBTSxDQUFFO0FBQ3ZDLFlBQUksS0FBSyxpQkFBaUIsR0FBRztBQUM1QixlQUFLO0FBQUEsUUFDTjtBQUFBLE1BQ0QsT0FBTztBQUNOLGFBQUs7QUFBQSxVQUFTLEtBQUssUUFBUTtBQUFBLFVBQUc7QUFBQTtBQUFBLFFBQXVDO0FBQUEsTUFDdEU7QUFBQSxJQUNEO0FBR0EsZUFBVyxnQkFBZ0IsZ0JBQWdCO0FBQzFDLFdBQUssYUFBYSxxQkFBcUIsYUFBYSxRQUFRLEtBQUsscUJBQXFCO0FBQUEsSUFDdkY7QUFJQSxRQUFJLGNBQWMsTUFBTSxHQUFHO0FBQzFCLFdBQUssYUFBYSxnQkFBZ0IsUUFBUSxNQUFNLEtBQUssT0FBTyxNQUFNLEdBQUcsS0FBSyxxQkFBcUI7QUFBQSxJQUNoRztBQUdBLFNBQUssYUFBYSxLQUFLO0FBQUEsRUFDeEI7QUFBQSxFQUVRLHdCQUF3QixPQUFvQyxXQUFpRDtBQUNwSCxRQUFJLE1BQU0sWUFBWSxVQUFVLFNBQVM7QUFDeEMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLENBQUMsS0FBSyxhQUFhLGNBQWMsTUFBTSxRQUFRLFVBQVUsTUFBTSxHQUFHO0FBQ3JFLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxDQUFDLE1BQU0sV0FBVztBQUNyQixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksQ0FBQyxVQUFVLFdBQVc7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFHQSxXQUFPLE1BQU0sVUFBVSxRQUFRLFVBQVUsU0FBUyxNQUFNLGlDQUFpQztBQUFBLEVBQzFGO0FBQUEsRUFFQSxLQUFLLE9BQWlDO0FBQ3JDLFFBQUksTUFBTSxZQUFZLGNBQWMsSUFBSSxHQUFHO0FBQzFDLGlCQUFXLFNBQVMsS0FBSyxPQUFPO0FBQy9CLFlBQUksS0FBSyxhQUFhLGNBQWMsT0FBTyxNQUFNLE1BQU0sR0FBRztBQUN6RCxnQkFBTSxTQUFTLEVBQUUsVUFBVSxNQUFNLE9BQU8sU0FBUztBQUFBLFFBQ2xEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFPLE1BQW1GO0FBQ3pGLFVBQU0sb0JBQW9CLEtBQUssTUFBTTtBQUdyQyxTQUFLLFFBQVEsS0FBSyxNQUFNLE9BQU8sV0FBUztBQUN2QyxZQUFNLFVBQVUsT0FBTyxTQUFTLFdBQVcsTUFBTSxZQUFZLE9BQU8sS0FBSyxhQUFhLGNBQWMsTUFBTSxNQUFNLE1BQU07QUFHdEgsVUFBSSxTQUFTO0FBQ1osYUFBSyxhQUFhLHFCQUFxQixNQUFNLFFBQVEsS0FBSyxxQkFBcUI7QUFBQSxNQUNoRjtBQUVBLGFBQU8sQ0FBQztBQUFBLElBQ1QsQ0FBQztBQUVELFFBQUksc0JBQXNCLEtBQUssTUFBTSxRQUFRO0FBQzVDO0FBQUEsSUFDRDtBQUtBLFNBQUssUUFBUTtBQUdiLFNBQUssUUFBUSxLQUFLLE1BQU0sU0FBUztBQUNqQyxTQUFLLGdCQUFnQjtBQUdyQixRQUFJLE9BQU8sU0FBUyxVQUFVO0FBQzdCLFdBQUsscUJBQXFCLGlCQUFpQixJQUFJO0FBQUEsSUFDaEQ7QUFHQSxTQUFLLGFBQWEsS0FBSztBQUFBLEVBQ3hCO0FBQUEsRUFFUSxVQUFnQjtBQUN2QixVQUFNLGlCQUFnRCxDQUFDO0FBRXZELFFBQUksZ0JBQXlEO0FBQzdELGVBQVcsU0FBUyxLQUFLLE9BQU87QUFDL0IsVUFBSSxpQkFBaUIsS0FBSyx3QkFBd0IsT0FBTyxhQUFhLEdBQUc7QUFDeEU7QUFBQSxNQUNEO0FBRUEsc0JBQWdCO0FBQ2hCLHFCQUFlLEtBQUssS0FBSztBQUFBLElBQzFCO0FBRUEsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssUUFBUTtBQUNiLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssTUFBTSxPQUFPLENBQUM7QUFFbkIsU0FBSyxzQkFBc0IsbUJBQW1CO0FBQzlDLFNBQUsscUJBQXFCLG1CQUFtQjtBQUFBLEVBQzlDO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLE1BQU07QUFFWCxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQUE7QUFBQTtBQUFBLEVBTUEsZUFBd0I7QUFDdkIsV0FBTyxLQUFLLE1BQU0sU0FBUyxLQUFLLFFBQVE7QUFBQSxFQUN6QztBQUFBLEVBRUEsTUFBTSxZQUEyQjtBQUNoQyxVQUFNLFlBQVksTUFBTSxLQUFLLGVBQWU7QUFDNUMsUUFBSSxXQUFXO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssYUFBYSxHQUFHO0FBQ3pCO0FBQUEsSUFDRDtBQUVBLFNBQUssU0FBUyxLQUFLLFFBQVEsQ0FBQztBQUM1QixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxZQUFxQjtBQUNwQixXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxNQUFNLFNBQXdCO0FBQzdCLFVBQU0sWUFBWSxNQUFNLEtBQUssZUFBZTtBQUM1QyxRQUFJLFdBQVc7QUFDZDtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsS0FBSyxVQUFVLEdBQUc7QUFDdEI7QUFBQSxJQUNEO0FBRUEsU0FBSyxTQUFTLEtBQUssUUFBUSxDQUFDO0FBQzVCLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFDdEI7QUFBQSxFQUVBLE1BQU0sYUFBNEI7QUFDakMsVUFBTSxZQUFZLE1BQU0sS0FBSyxlQUFlO0FBQzVDLFFBQUksV0FBVztBQUNkO0FBQUEsSUFDRDtBQUdBLFFBQUksS0FBSyxrQkFBa0IsSUFBSTtBQUM5QixhQUFPLEtBQUssT0FBTztBQUFBLElBQ3BCO0FBR0EsU0FBSyxTQUFTLEtBQUssYUFBYTtBQUNoQyxXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxZQUFxQjtBQUNwQixXQUFPLEtBQUssTUFBTSxTQUFTO0FBQUEsRUFDNUI7QUFBQSxFQUVBLE1BQU0sU0FBd0I7QUFDN0IsUUFBSSxDQUFDLEtBQUssVUFBVSxHQUFHO0FBQ3RCO0FBQUEsSUFDRDtBQUVBLFNBQUssU0FBUyxLQUFLLE1BQU0sU0FBUyxDQUFDO0FBQ25DLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFDdEI7QUFBQSxFQUVBLE1BQWMsaUJBQW1DO0FBUWhELFFBQUksS0FBSyxXQUFXLFNBQVMsTUFBTTtBQUNsQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksS0FBSyx5QkFBeUIsR0FBRztBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sS0FBSyxTQUFTO0FBRXBCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSwyQkFBb0M7QUFDM0MsUUFBSSxDQUFDLEtBQUssU0FBUyxXQUFXO0FBQzdCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxPQUFPLEtBQUssY0FBYztBQUNoQyxRQUFJLENBQUMsMEJBQTBCLElBQUksR0FBRztBQUNyQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksS0FBSyxNQUFNLE9BQU8sS0FBSyxRQUFRLFNBQVM7QUFDM0MsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLENBQUMsS0FBSyxTQUFTLENBQUMsS0FBSyxhQUFhLGNBQWMsS0FBSyxPQUFPLEtBQUssUUFBUSxNQUFNLEdBQUc7QUFDckYsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGdCQUFnQixLQUFLLGFBQWE7QUFDeEMsUUFBSSxDQUFDLGVBQWU7QUFDbkIsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLGNBQWMsUUFBUSxLQUFLLFFBQVEsU0FBUyxNQUFNLGlDQUFpQztBQUFBLEVBQzNGO0FBQUEsRUFFUSxTQUFTLFVBQWtCLFdBQTJCO0FBQzdELFNBQUssZ0JBQWdCLEtBQUs7QUFDMUIsU0FBSyxRQUFRO0FBR2IsUUFBSSxDQUFDLFdBQVc7QUFDZixXQUFLLGFBQWEsS0FBSztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxXQUEwQjtBQUN2QyxTQUFLLGFBQWE7QUFFbEIsUUFBSTtBQUNILFVBQUksS0FBSyxTQUFTO0FBQ2pCLGNBQU0sS0FBSyxXQUFXLEtBQUssT0FBTztBQUFBLE1BQ25DO0FBQUEsSUFDRCxVQUFFO0FBQ0QsV0FBSyxhQUFhO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBQUEsRUFFUSxXQUFXLFVBQXlFO0FBQzNGLFFBQUksVUFBMEIsdUJBQU8sT0FBTyxJQUFJO0FBR2hELFFBQUksU0FBUyxXQUFXO0FBQ3ZCLGdCQUFVLFNBQVMsVUFBVSxRQUFRLE9BQU87QUFBQSxJQUM3QztBQUVBLFFBQUksY0FBYyxTQUFTLE1BQU0sR0FBRztBQUNuQyxhQUFPLEtBQUssY0FBYyxXQUFXLFNBQVMsUUFBUSxTQUFTLFNBQVMsT0FBTztBQUFBLElBQ2hGO0FBRUEsV0FBTyxLQUFLLGNBQWMsV0FBVztBQUFBLE1BQ3BDLEdBQUcsU0FBUztBQUFBLE1BQ1osU0FBUztBQUFBLFFBQ1IsR0FBRyxTQUFTLE9BQU87QUFBQSxRQUNuQixHQUFHO0FBQUEsTUFDSjtBQUFBLElBQ0QsR0FBRyxTQUFTLE9BQU87QUFBQSxFQUNwQjtBQUFBLEVBRUEsZUFBd0I7QUFDdkIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBR0Q7QUExa0JhLHNCQUVZLGlCQUFpQjtBQUY3Qix3QkFBTjtBQUFBLEVBa0NKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FyQ1U7QUE0a0JiLElBQU0sZUFBTixNQUFtQjtBQUFBLEVBRWxCLFlBQ3VDLG9CQUNGLGtCQUNMLGFBQ0EsYUFDOUI7QUFKcUM7QUFDRjtBQUNMO0FBQ0E7QUFBQSxFQUM1QjtBQUFBLEVBS0osMEJBQTBCLFFBQTRGO0FBQ3JILFVBQU0sV0FBVyx1QkFBdUIsZUFBZSxNQUFNO0FBTzdELFVBQU0sb0NBQ0wsVUFBVSxXQUFXLFFBQVEsUUFDN0IsVUFBVSxXQUFXLFFBQVEsZ0JBQzdCLFVBQVUsV0FBVyxRQUFRLGtCQUM3QixVQUFVLFdBQVcsS0FBSyxZQUFZO0FBS3ZDLFFBQUksbUNBQW1DO0FBQ3RDLFVBQUksY0FBYyxNQUFNLEdBQUc7QUFDMUIsY0FBTSxlQUFlLE9BQU8sVUFBVTtBQUN0QyxZQUFJLHNCQUFzQixZQUFZLEdBQUc7QUFDeEMsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxJQUNSLE9BSUs7QUFDSixhQUFPLGNBQWMsTUFBTSxJQUFJLFNBQVM7QUFBQSxJQUN6QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLGNBQWMsTUFBa0YsUUFBcUQ7QUFDcEosUUFBSSxnQkFBZ0Isb0JBQW9CLGdCQUFnQixvQkFBb0I7QUFDM0UsVUFBSSxjQUFjLE1BQU0sR0FBRztBQUMxQixlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksZ0JBQWdCLGtCQUFrQjtBQUNyQyxlQUFPLEtBQUssU0FBUyxPQUFPLFVBQVUsZUFBZSxPQUFPO0FBQUEsTUFDN0Q7QUFFQSxhQUFPLEtBQUssWUFBWSxPQUFPLFVBQVUsSUFBSTtBQUFBLElBQzlDO0FBRUEsUUFBSSxjQUFjLElBQUksR0FBRztBQUN4QixVQUFJLGNBQWMsTUFBTSxHQUFHO0FBQzFCLGVBQU8sS0FBSyxRQUFRLE1BQU07QUFBQSxNQUMzQjtBQUVBLGFBQU8sS0FBSyxZQUFZLE9BQU8sVUFBVSxJQUFJO0FBQUEsSUFDOUM7QUFFQSxRQUFJLGNBQWMsTUFBTSxHQUFHO0FBQzFCLGFBQU8sS0FBSyxZQUFZLEtBQUssVUFBVSxNQUFNO0FBQUEsSUFDOUM7QUFFQSxXQUFPLFFBQVEsVUFBVSxLQUFLLG1CQUFtQixPQUFPLFFBQVEsS0FBSyxVQUFVLE9BQU8sUUFBUTtBQUFBLEVBQy9GO0FBQUEsRUFFQSxZQUFZLFVBQWUsTUFBMkY7QUFDckgsUUFBSSxnQkFBZ0Isa0JBQWtCO0FBQ3JDLGFBQU8sS0FBSyxTQUFTLFVBQVUsZUFBZSxPQUFPO0FBQUEsSUFDdEQ7QUFFQSxRQUFJLGdCQUFnQixvQkFBb0I7QUFDdkMsYUFBTyxLQUFLLG1CQUFtQixPQUFPLGdCQUFnQixVQUFVLEtBQUssUUFBUTtBQUFBLElBQzlFO0FBRUEsUUFBSSxjQUFjLElBQUksR0FBRztBQUN4QixZQUFNLGdCQUFnQixLQUFLO0FBQzNCLFVBQUksQ0FBQyxlQUFlO0FBQ25CLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxLQUFLLGlCQUFpQixTQUFTLGVBQWUsWUFBWSxDQUFDLEtBQUssWUFBWSxZQUFZLGFBQWEsR0FBRztBQUMzRyxlQUFPO0FBQUEsTUFDUjtBQUVBLGFBQU8sS0FBSyxtQkFBbUIsT0FBTyxRQUFRLGVBQWUsUUFBUTtBQUFBLElBQ3RFO0FBRUEsV0FBTyxLQUFLLG1CQUFtQixPQUFPLFFBQVEsTUFBTSxVQUFVLFFBQVE7QUFBQSxFQUN2RTtBQUFBLEVBRUEsd0JBQXdCLFlBQStCLFlBQW1DO0FBQ3pGLFFBQUksQ0FBQyxZQUFZLE9BQU87QUFDdkIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFdBQVcsWUFBWSxXQUFXLE1BQU0sSUFBSTtBQUMvQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sV0FBVyxRQUFRLFdBQVcsT0FBTyxRQUFRLFdBQVcsS0FBSyxJQUFJO0FBQUEsRUFDekU7QUFBQSxFQUVBLGdCQUFnQixRQUFxQixVQUFvQixvQkFBdUU7QUFDL0gsVUFBTSxZQUFZLE1BQU0sS0FBSyxPQUFPLGFBQWEsRUFBRSxNQUFNO0FBQ3hELHlCQUFtQixpQkFBaUIsTUFBTTtBQUMxQyxlQUFTO0FBQUEsSUFDVixDQUFDO0FBRUQsUUFBSSxjQUFjLG1CQUFtQixJQUFJLE1BQU07QUFDL0MsUUFBSSxDQUFDLGFBQWE7QUFDakIsb0JBQWMsSUFBSSxnQkFBZ0I7QUFDbEMseUJBQW1CLElBQUksUUFBUSxXQUFXO0FBQUEsSUFDM0M7QUFFQSxnQkFBWSxJQUFJLFNBQVM7QUFBQSxFQUMxQjtBQUFBLEVBRUEscUJBQXFCLFFBQW9GLG9CQUF1RTtBQUMvSyxRQUFJLENBQUMsY0FBYyxNQUFNLEdBQUc7QUFDM0I7QUFBQSxJQUNEO0FBRUEsdUJBQW1CLGlCQUFpQixNQUFNO0FBQUEsRUFDM0M7QUFDRDtBQXRJTSxlQUFOO0FBQUEsRUFHRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTkc7IiwKICAibmFtZXMiOiBbImluZGV4Il0KfQo=
