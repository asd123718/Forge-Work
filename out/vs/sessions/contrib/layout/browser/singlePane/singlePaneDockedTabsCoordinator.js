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
import { mainWindow } from "../../../../../base/browser/window.js";
import { Sequencer } from "../../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { autorun, observableSignalFromEvent } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { EditorActivation } from "../../../../../platform/editor/common/editor.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../../workbench/common/editor.js";
import { IEditorGroupsService } from "../../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IAgentWorkbenchLayoutService } from "../../../../browser/workbench.js";
import { SinglePaneChangesTabAvailableContext, SinglePaneChangesTabMissingContext, SinglePaneFilesTabAvailableContext, SinglePaneFilesTabMissingContext } from "../../../../common/contextkeys.js";
import { DockedEditorInput } from "../../../../common/dockedEditorInput.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { SessionChangesEditorInput } from "../../../changes/browser/sessionChangesEditorInput.js";
import { ISessionChangesService } from "../../../changes/browser/sessionChangesService.js";
import { IChangesViewService } from "../../../changes/common/changesViewService.js";
import { EmptyFileEditorInput } from "../../../editor/browser/emptyFileEditorInput.js";
const CHANGES_TAB_OPTIONS = { pinned: true, index: 0, inactive: true, preserveFocus: true, activation: EditorActivation.PRESERVE, isExplicit: false };
const CHANGES_TAB_ACTIVE_OPTIONS = { pinned: true, index: 0, preserveFocus: true, isExplicit: false };
const FILES_TAB_OPTIONS = { pinned: true, inactive: true, preserveFocus: true, activation: EditorActivation.PRESERVE, isExplicit: false };
function mergeTriggers(a, b) {
  return {
    openDefaultsIfEmpty: a.openDefaultsIfEmpty || b.openDefaultsIfEmpty,
    ensureChanges: a.ensureChanges || b.ensureChanges,
    ensureChangesActive: a.ensureChangesActive || b.ensureChangesActive,
    workingSetRestored: a.workingSetRestored || b.workingSetRestored
  };
}
let SinglePaneDockedTabsCoordinator = class extends Disposable {
  constructor(_ctx, _layoutService, _sessionsService, _editorService, _editorGroupsService, _sessionChangesService, _changesViewService, contextKeyService, _instantiationService) {
    super();
    this._ctx = _ctx;
    this._layoutService = _layoutService;
    this._sessionsService = _sessionsService;
    this._editorService = _editorService;
    this._editorGroupsService = _editorGroupsService;
    this._sessionChangesService = _sessionChangesService;
    this._changesViewService = _changesViewService;
    this._instantiationService = _instantiationService;
    this._sequencer = new Sequencer();
    this._generation = 0;
    this._filesTabDismissed = false;
    this._changingFilesInternally = false;
    this._changesTabMissingContext = SinglePaneChangesTabMissingContext.bindTo(contextKeyService);
    this._filesTabMissingContext = SinglePaneFilesTabMissingContext.bindTo(contextKeyService);
    this._changesTabAvailableContext = SinglePaneChangesTabAvailableContext.bindTo(contextKeyService);
    this._filesTabAvailableContext = SinglePaneFilesTabAvailableContext.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      const target = this._readTarget(reader);
      if (!target.wantsChangesTab) {
        this._filesTabDismissed = false;
      }
      this.queueReconcile(target, { openDefaultsIfEmpty: true });
    }));
    this._register(this._layoutService.onDidRevealSidePane(() => {
      this.queueReconcile(this._readTarget(void 0), { openDefaultsIfEmpty: true });
    }));
    const partVisibilityChangedSignal = observableSignalFromEvent(this, this._layoutService.onDidChangePartVisibility);
    const editorsChangedSignal = observableSignalFromEvent(this, Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange));
    this._register(autorun((reader) => {
      partVisibilityChangedSignal.read(reader);
      editorsChangedSignal.read(reader);
      this.queueReconcile(this._readTarget(void 0), {});
    }));
    this._register(this._ctx.onDidEndSessionLayoutRestore(() => {
      const session = this._sessionsService.activeSession.get();
      const target = this._readTarget(void 0);
      const ensureChanges = target.wantsChangesTab && session?.isCreated.get() === false;
      this.queueReconcile(target, { openDefaultsIfEmpty: true, ensureChanges, workingSetRestored: true });
    }));
    this._register(this._editorService.onWillOpenEditor((e) => {
      if (e.editor instanceof EmptyFileEditorInput && !this._changingFilesInternally && !this._ctx.isRestoringSessionLayout) {
        this._filesTabDismissed = false;
      }
      if (this._ctx.isRestoringSessionLayout || !this._isWorkspaceFileEditor(e.editor)) {
        return;
      }
      const group = this._editorGroupsService.mainPart.getGroup(e.groupId);
      if (!group || group.contains(e.editor)) {
        return;
      }
      void this._sequencer.queue(() => this._removeFilesTab(this._editorGroupsService.mainPart.activeGroup)).catch(onUnexpectedError);
    }));
    this._register(this._editorService.onDidCloseEditor((e) => {
      if (e.editor instanceof EmptyFileEditorInput && !this._changingFilesInternally && !this._ctx.isRestoringSessionLayout && !this._layoutService.isEditorPartAutoVisibilitySuppressed() && this._readTarget(void 0).wantsChangesTab) {
        this._filesTabDismissed = true;
      }
    }));
    const editorAreaVisibleObs = observableSignalFromEvent(this, this._layoutService.onDidChangePartVisibility);
    this._register(autorun((reader) => {
      editorAreaVisibleObs.read(reader);
      const visible = this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
      if (this._editorAreaVisible === void 0) {
        this._editorAreaVisible = visible;
        return;
      }
      if (visible === this._editorAreaVisible) {
        return;
      }
      this._editorAreaVisible = visible;
      if (this._ctx.isRestoringSessionLayout) {
        return;
      }
      if (visible) {
        void this._sequencer.queue(() => this._restoreCollapsedTabs()).catch(onUnexpectedError);
        return;
      }
      if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
        void this._sequencer.queue(() => this._collapseNonManagedTabs()).catch(onUnexpectedError);
      }
    }));
    this._register(this._ctx.onDidEndSessionLayoutRestore(() => this._queueCollapseIfDetailsOnly()));
    this._register(this._editorService.onDidEditorsChange(() => {
      if (!this._ctx.isRestoringSessionLayout) {
        this._queueCollapseIfDetailsOnly();
      }
    }));
  }
  /** The resource this managed Changes editor input shows, if it is one. */
  getChangesEditorResource(editor) {
    const resource = editor.resource;
    return resource && this._sessionChangesService.getSessionResource(resource) ? resource : void 0;
  }
  prepareWorkingSetRestore(hasSavedWorkingSet) {
    const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
    this._preserveMissingFilesForSessionKey = hasSavedWorkingSet && this._filesTabDismissed ? sessionKey : void 0;
  }
  // --- Trigger plumbing (called by the New/Existing lifecycle strategies) -----------------
  /** Reads the current managed-tabs target for the active session (or for `reader`'s transaction, if given). */
  readTarget(reader) {
    return this._readTarget(reader);
  }
  /** Queues a reconcile for the active session, merging `trigger` with any not-yet-applied pending intents for that session. */
  queueReconcile(target, trigger) {
    const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
    const mergedTrigger = this._pending && this._pending.sessionKey === sessionKey ? mergeTriggers(this._pending.trigger, trigger) : trigger;
    this._pending = { sessionKey, target, trigger: mergedTrigger };
    const generation = ++this._generation;
    void this._sequencer.queue(() => this._reconcile(generation)).catch(onUnexpectedError);
  }
  _readTarget(reader) {
    const read = (obs) => reader ? obs.read(reader) : obs.get();
    const session = read(this._sessionsService.activeSession);
    const isQuickChat = session?.isQuickChat ? read(session.isQuickChat) : false;
    const workspace = session ? read(session.workspace) : void 0;
    if (!session || isQuickChat || !workspace) {
      return { changesSessionResource: void 0, workspace: void 0, wantsChangesTab: false, wantsFilesTab: false };
    }
    const isCreated = read(session.isCreated);
    return { changesSessionResource: isCreated ? session.resource : void 0, workspace, wantsChangesTab: isCreated, wantsFilesTab: true };
  }
  // --- Reconcile --------------------------------------------------------
  async _reconcile(generation) {
    if (generation !== this._generation || !this._pending) {
      return;
    }
    const pending = this._pending;
    this._pending = void 0;
    try {
      await this._reconcileCore(pending.target, pending.trigger, generation);
    } finally {
      const successor = this._pending;
      if (generation !== this._generation && successor && successor.sessionKey === pending.sessionKey) {
        this._pending = { ...successor, trigger: mergeTriggers(successor.trigger, pending.trigger) };
      }
    }
  }
  async _reconcileCore(target, trigger, generation) {
    const group = this._editorGroupsService.mainPart.activeGroup;
    this._resetCollapsedEditorsOnSessionChange();
    const changesResource = target.changesSessionResource ? this._sessionChangesService.getChangesEditorResource(target.changesSessionResource) : void 0;
    const suppression = this._layoutService.suppressEditorPartAutoVisibility();
    try {
      await this._reconcileForeignChangesEditors(group, changesResource);
      if (generation !== this._generation) {
        return;
      }
      this._updateFilesEditors(group, target.workspace);
      const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
      const preserveMissingFiles = !!trigger.workingSetRestored && this._preserveMissingFilesForSessionKey === sessionKey;
      if (preserveMissingFiles) {
        await this._removeFilesTab(group);
        if (generation !== this._generation) {
          return;
        }
      }
      const openIntoEmpty = !!trigger.openDefaultsIfEmpty && group.editors.length === 0;
      const changesPresent = !!changesResource && !!this._findChangesEditor(group, changesResource);
      const filesPresent = group.editors.some((editor) => editor instanceof EmptyFileEditorInput);
      const activeChangesResource = this._editorService.activeEditor && this.getChangesEditorResource(this._editorService.activeEditor);
      const activateChanges = !!trigger.ensureChangesActive && !!changesResource && (!activeChangesResource || !isEqual(activeChangesResource, changesResource));
      const ensureAllInputs = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART) && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
      const openChanges = target.wantsChangesTab && !!changesResource && (activateChanges || !changesPresent && (openIntoEmpty || ensureAllInputs || trigger.ensureChanges));
      const openFiles = target.wantsFilesTab && !filesPresent && !preserveMissingFiles && (openIntoEmpty || ensureAllInputs);
      const isCreated = this._sessionsService.activeSession.get()?.isCreated.get() ?? false;
      const openFilesFirst = openChanges && openFiles && !isCreated && group.editors.length === 0;
      if (openFilesFirst) {
        await this._openFilesTab(group, target.workspace);
        if (generation !== this._generation) {
          return;
        }
      }
      if (openChanges && changesResource) {
        if (!await this._openChangesTab(target.changesSessionResource, changesResource, group, generation, activateChanges)) {
          return;
        }
      }
      if (openFiles && !openFilesFirst) {
        await this._openFilesTab(group, target.workspace);
        if (generation !== this._generation) {
          return;
        }
      }
    } finally {
      suppression.dispose();
      if (generation === this._generation) {
        if (trigger.workingSetRestored) {
          this._preserveMissingFilesForSessionKey = void 0;
        }
        this._updateAddTabContexts(target);
      }
    }
  }
  /** On a session change, drop editors captured while the previous session's editor area was hidden so they are not reopened here. */
  _resetCollapsedEditorsOnSessionChange() {
    const sessionKey = this._sessionsService.activeSession.get()?.resource.toString();
    if (sessionKey !== this._lastSyncedSessionKey) {
      this._collapsedEditors = void 0;
      this._lastSyncedSessionKey = sessionKey;
    }
  }
  // --- Tab operations ---------------------------------------------------
  /** Opens the Changes editor pinned first (active on submit). Returns `false` if a newer reconcile superseded this one mid-open. */
  async _openChangesTab(sessionResource, changesResource, group, generation, active) {
    this._changesViewService.setChangesetId(void 0);
    await this._sessionChangesService.openChangesEditor(sessionResource, active ? CHANGES_TAB_ACTIVE_OPTIONS : CHANGES_TAB_OPTIONS, group);
    if (generation !== this._generation) {
      return false;
    }
    const changesEditor = this._findChangesEditor(group, changesResource);
    if (changesEditor) {
      this._pinFirst(group, changesEditor);
    }
    return true;
  }
  async _openFilesTab(group, workspace) {
    const suppression = this._layoutService.suppressEditorPartAutoVisibility();
    this._changingFilesInternally = true;
    try {
      await this._editorService.openEditor(this._instantiationService.createInstance(EmptyFileEditorInput, workspace), FILES_TAB_OPTIONS, group);
      this._filesTabDismissed = false;
    } finally {
      this._changingFilesInternally = false;
      suppression.dispose();
    }
  }
  async _removeFilesTab(group) {
    const placeholder = group.editors.find((editor) => editor instanceof EmptyFileEditorInput);
    if (placeholder) {
      this._changingFilesInternally = true;
      try {
        await this._closeManagedEditors(group, [placeholder]);
      } finally {
        this._changingFilesInternally = false;
      }
    }
  }
  async _reconcileForeignChangesEditors(group, activeChangesResource) {
    const foreign = group.editors.filter((editor) => {
      const resource = this.getChangesEditorResource(editor);
      return resource && (!activeChangesResource || !isEqual(resource, activeChangesResource));
    });
    if (foreign.length === 0) {
      return;
    }
    if (!activeChangesResource) {
      await this._closeManagedEditors(group, foreign);
      return;
    }
    const [editorToReplace, ...editorsToClose] = foreign;
    const wasActive = group.activeEditor === editorToReplace;
    await group.replaceEditors([{
      editor: editorToReplace,
      replacement: this._instantiationService.createInstance(SessionChangesEditorInput, activeChangesResource),
      options: wasActive ? CHANGES_TAB_ACTIVE_OPTIONS : CHANGES_TAB_OPTIONS
    }]);
    if (editorsToClose.length > 0) {
      await this._closeManagedEditors(group, editorsToClose);
    }
  }
  _updateFilesEditors(group, workspace) {
    for (const editor of group.editors) {
      if (editor instanceof EmptyFileEditorInput) {
        editor.setWorkspace(workspace);
      }
    }
  }
  /** Closes editors we own, preserving focus so a transient close never steals it. */
  async _closeManagedEditors(group, editors) {
    await this._editorService.closeEditors(editors.map((editor) => ({ groupId: group.id, editor })), { preserveFocus: true, force: true });
  }
  _pinFirst(group, editor) {
    if (!group.isPinned(editor)) {
      group.pinEditor(editor);
    }
    if (group.getIndexOfEditor(editor) !== 0) {
      group.moveEditor(editor, group, CHANGES_TAB_OPTIONS);
    }
  }
  // --- Queries ----------------------------------------------------------
  _findChangesEditor(group, changesResource) {
    return group.editors.find((editor) => {
      const resource = this.getChangesEditorResource(editor);
      return !!resource && isEqual(resource, changesResource);
    });
  }
  /** Whether the editor shows a workspace file (a file-system resource), excluding managed docked placeholders. */
  _isWorkspaceFileEditor(editor) {
    if (editor instanceof DockedEditorInput) {
      return false;
    }
    const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    return resource?.scheme === Schemas.file || resource?.scheme === Schemas.vscodeRemote;
  }
  /** Offer the `+` "Changes"/"Files" entries when the session supports them but their tabs are closed. */
  _updateAddTabContexts(target) {
    const group = this._editorGroupsService.mainPart.activeGroup;
    const changesPresent = group.editors.some((editor) => this.getChangesEditorResource(editor) !== void 0);
    const filesPresent = group.editors.some((editor) => editor instanceof EmptyFileEditorInput);
    this._changesTabAvailableContext.set(target.wantsChangesTab);
    this._filesTabAvailableContext.set(target.wantsFilesTab);
    this._changesTabMissingContext.set(target.wantsChangesTab && !changesPresent);
    this._filesTabMissingContext.set(target.wantsFilesTab && !filesPresent);
  }
  // --- Editor-area collapse ----------------------------------------------
  _queueCollapseIfDetailsOnly() {
    if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) && this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
      void this._sequencer.queue(() => this._collapseNonManagedTabs()).catch(onUnexpectedError);
    }
  }
  async _collapseNonManagedTabs() {
    const group = this._editorGroupsService.mainPart.activeGroup;
    const captured = [...this._collapsedEditors ?? []];
    const toClose = [];
    group.editors.forEach((editor, index) => {
      if (editor instanceof DockedEditorInput || this.getChangesEditorResource(editor)) {
        return;
      }
      const untyped = editor.toUntyped();
      if (untyped) {
        captured.push({ editor: untyped, index });
      }
      toClose.push(editor);
    });
    if (toClose.length === 0) {
      return;
    }
    this._collapsedEditors = captured;
    const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
    try {
      await this._editorService.closeEditors(toClose.map((editor) => ({ groupId: group.id, editor })), { preserveFocus: true });
    } finally {
      suppressEditorPartAutoVisibility.dispose();
    }
  }
  async _restoreCollapsedTabs() {
    const captured = this._collapsedEditors;
    this._collapsedEditors = void 0;
    if (!captured || captured.length === 0) {
      return;
    }
    const group = this._editorGroupsService.mainPart.activeGroup;
    const suppressEditorPartAutoVisibility = this._layoutService.suppressEditorPartAutoVisibility();
    try {
      await this._editorService.openEditors(
        [...captured].sort((a, b) => a.index - b.index).map(({ editor, index }) => ({ ...editor, options: { ...editor.options, index, inactive: true, preserveFocus: true, pinned: true } })),
        group
      );
    } finally {
      suppressEditorPartAutoVisibility.dispose();
    }
  }
};
SinglePaneDockedTabsCoordinator = __decorateClass([
  __decorateParam(1, IAgentWorkbenchLayoutService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, ISessionChangesService),
  __decorateParam(6, IChangesViewService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IInstantiationService)
], SinglePaneDockedTabsCoordinator);
export {
  SinglePaneDockedTabsCoordinator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcbGF5b3V0XFxicm93c2VyXFxzaW5nbGVQYW5lXFxzaW5nbGVQYW5lRG9ja2VkVGFic0Nvb3JkaW5hdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgU2VxdWVuY2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3RpdmF0aW9uLCBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBJVW50eXBlZEVkaXRvcklucHV0LCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcbmltcG9ydCB7IFNpbmdsZVBhbmVDaGFuZ2VzVGFiQXZhaWxhYmxlQ29udGV4dCwgU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dCwgU2luZ2xlUGFuZUZpbGVzVGFiQXZhaWxhYmxlQ29udGV4dCwgU2luZ2xlUGFuZUZpbGVzVGFiTWlzc2luZ0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgRG9ja2VkRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZG9ja2VkRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jaGFuZ2VzL2Jyb3dzZXIvc2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhbmdlcy9icm93c2VyL3Nlc3Npb25DaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhbmdlcy9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtcHR5RmlsZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZW1wdHlGaWxlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Xb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlUGFuZUxheW91dENvbnRleHQgfSBmcm9tICcuL3NpbmdsZVBhbmVMYXlvdXRTdHJhdGVneS5qcyc7XG5cbi8qKiBPcHRpb25zIHRvIG9wZW4gdGhlIENoYW5nZXMgdGFiIHBpbm5lZCBmaXJzdCwgaW5hY3RpdmUgKHRoZSB3b3JrYmVuY2ggYXV0by1hY3RpdmF0ZXMgaXQgb25seSB3aGVuIHRoZSBncm91cCBpcyBlbXB0eSkuICovXG5jb25zdCBDSEFOR0VTX1RBQl9PUFRJT05TOiBJRWRpdG9yT3B0aW9ucyA9IHsgcGlubmVkOiB0cnVlLCBpbmRleDogMCwgaW5hY3RpdmU6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUsIGFjdGl2YXRpb246IEVkaXRvckFjdGl2YXRpb24uUFJFU0VSVkUsIGlzRXhwbGljaXQ6IGZhbHNlIH07XG5cbi8qKiBPcHRpb25zIHRvIG9wZW4gdGhlIENoYW5nZXMgdGFiIHBpbm5lZCBmaXJzdCAqYW5kIGFjdGl2ZSogKHVzZWQgb24gc3VibWl0LCB3aGVyZSB0aGUgZ3JvdXAgYWxyZWFkeSBob2xkcyB0aGUgRmlsZXMgdGFiIHNvIGl0IHdvdWxkIG90aGVyd2lzZSBzdGF5IGluYWN0aXZlKS4gS2VlcHMgYHByZXNlcnZlRm9jdXNgIHNvIGFjdGl2YXRpbmcgdGhlIHRhYiBmb3IgZGV0YWlsIG1hcHBpbmcgbmV2ZXIgc3RlYWxzIGZvY3VzIGZyb20gdGhlIGp1c3Qtc3VibWl0dGVkIGNoYXQuICovXG5jb25zdCBDSEFOR0VTX1RBQl9BQ1RJVkVfT1BUSU9OUzogSUVkaXRvck9wdGlvbnMgPSB7IHBpbm5lZDogdHJ1ZSwgaW5kZXg6IDAsIHByZXNlcnZlRm9jdXM6IHRydWUsIGlzRXhwbGljaXQ6IGZhbHNlIH07XG5cbi8qKiBPcHRpb25zIHRvIG9wZW4gdGhlIEZpbGVzIHBsYWNlaG9sZGVyIHRhYiwgcGlubmVkIGFuZCBpbmFjdGl2ZS4gKi9cbmNvbnN0IEZJTEVTX1RBQl9PUFRJT05TOiBJRWRpdG9yT3B0aW9ucyA9IHsgcGlubmVkOiB0cnVlLCBpbmFjdGl2ZTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgYWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5QUkVTRVJWRSwgaXNFeHBsaWNpdDogZmFsc2UgfTtcblxuLyoqXG4gKiBXaGF0IHRoZSBhY3RpdmUgc2Vzc2lvbiB3YW50cyBmcm9tIGl0cyBtYW5hZ2VkIGRvY2tlZCB0YWJzLlxuICogIC0gYGNoYW5nZXNTZXNzaW9uUmVzb3VyY2VgOiBzZXQgZm9yIGEgY3JlYXRlZCB3b3Jrc3BhY2Ugc2Vzc2lvbiAodGhlIENoYW5nZXMgbXVsdGktZGlmZiB0YWIpLiBgdW5kZWZpbmVkYCBvdGhlcndpc2UuXG4gKiAgLSBgd2FudHNDaGFuZ2VzVGFiYDogYHRydWVgIGZvciBhIGNyZWF0ZWQgd29ya3NwYWNlIHNlc3Npb24uXG4gKiAgLSBgd2FudHNGaWxlc1RhYmA6IGB0cnVlYCBmb3IgYW55IHdvcmtzcGFjZSwgbm9uLXF1aWNrLWNoYXQgc2Vzc2lvbiAodGhlIGVtcHR5IEZpbGVzIHBsYWNlaG9sZGVyIHRhYikuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU1hbmFnZWRUYWJzVGFyZ2V0IHtcblx0cmVhZG9ubHkgY2hhbmdlc1Nlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB3YW50c0NoYW5nZXNUYWI6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdhbnRzRmlsZXNUYWI6IGJvb2xlYW47XG59XG5cbi8qKlxuICogV2h5IGEgcmVjb25jaWxlIHdhcyBxdWV1ZWQgXHUyMDE0IHdoaWNoIFwiZW5zdXJlXCIgYWN0aW9ucyBpdCBtYXkgdGFrZS4gQWxsIGRlZmF1bHQgdG9cbiAqIGBmYWxzZWA7IGVhY2ggaXMgc2V0IGJ5IGV4YWN0bHkgb25lIGNhbGxlciAodGhlIE5ldy9FeGlzdGluZyBsaWZlY3ljbGUgc3RyYXRlZ2llcywgb3Igb25lXG4gKiBvZiB0aGlzIGNvb3JkaW5hdG9yJ3Mgb3duIGFtYmllbnQgdHJpZ2dlcnMpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElSZWNvbmNpbGVUcmlnZ2VyIHtcblx0LyoqIE9wZW4gdGhlIGRlZmF1bHQgZG9ja2VkIHRhYnMgKmlmIHRoZSBncm91cCBpcyBlbXB0eSogXHUyMDE0IGEgc2Vzc2lvbiBzd2l0Y2gsIGEgc2lkZS1wYW5lIHJldmVhbCwgb3IgYSBzZXR0bGVkIGxheW91dCByZXN0b3JlLiAqL1xuXHRyZWFkb25seSBvcGVuRGVmYXVsdHNJZkVtcHR5PzogYm9vbGVhbjtcblx0LyoqIEVuc3VyZSB0aGUgQ2hhbmdlcyB0YWIsIGluYWN0aXZlLCB3aGVuIGEgbmV3LXNlc3Npb24gdmlldyBiZWNvbWVzIGVsaWdpYmxlIG9yIGZpbmlzaGVzIHJlc3RvcmluZy4gKi9cblx0cmVhZG9ubHkgZW5zdXJlQ2hhbmdlcz86IGJvb2xlYW47XG5cdC8qKiBFbnN1cmUgdGhlIENoYW5nZXMgdGFiLCBvcGVuZWQgKiphY3RpdmUqKiwgZXZlbiBpbiBhIG5vbi1lbXB0eSBncm91cCBcdTIwMTQgbmV3LXNlc3Npb24gc3VibWl0IChzbyB0aGUgZGV0YWlsIHBhbmVsIG1hcHMgdG8gQ2hhbmdlcyByYXRoZXIgdGhhbiB0aGUgc3RpbGwtcHJlc2VudCBGaWxlcyBwbGFjZWhvbGRlcikuICovXG5cdHJlYWRvbmx5IGVuc3VyZUNoYW5nZXNBY3RpdmU/OiBib29sZWFuO1xuXHQvKiogQSBzYXZlZCB3b3JraW5nIHNldCBmaW5pc2hlZCByZXN0b3JpbmcgZm9yIHRoZSBhY3RpdmUgc2Vzc2lvbi4gKi9cblx0cmVhZG9ubHkgd29ya2luZ1NldFJlc3RvcmVkPzogYm9vbGVhbjtcbn1cblxuLyoqIE9SLWNvbWJpbmVzIHR3byB0cmlnZ2VycyBzbyBhY2N1bXVsYXRlZCBpbnRlbnRzIGFyZSBuZXZlciBkcm9wcGVkIHdoZW4gcmVjb25jaWxlcyBhcmUgY29hbGVzY2VkLiAqL1xuZnVuY3Rpb24gbWVyZ2VUcmlnZ2VycyhhOiBJUmVjb25jaWxlVHJpZ2dlciwgYjogSVJlY29uY2lsZVRyaWdnZXIpOiBJUmVjb25jaWxlVHJpZ2dlciB7XG5cdHJldHVybiB7XG5cdFx0b3BlbkRlZmF1bHRzSWZFbXB0eTogYS5vcGVuRGVmYXVsdHNJZkVtcHR5IHx8IGIub3BlbkRlZmF1bHRzSWZFbXB0eSxcblx0XHRlbnN1cmVDaGFuZ2VzOiBhLmVuc3VyZUNoYW5nZXMgfHwgYi5lbnN1cmVDaGFuZ2VzLFxuXHRcdGVuc3VyZUNoYW5nZXNBY3RpdmU6IGEuZW5zdXJlQ2hhbmdlc0FjdGl2ZSB8fCBiLmVuc3VyZUNoYW5nZXNBY3RpdmUsXG5cdFx0d29ya2luZ1NldFJlc3RvcmVkOiBhLndvcmtpbmdTZXRSZXN0b3JlZCB8fCBiLndvcmtpbmdTZXRSZXN0b3JlZCxcblx0fTtcbn1cblxuLyoqIEFjY3VtdWxhdGVkIHJlY29uY2lsZSBpbnRlbnRzIHNjb3BlZCB0byB0aGUgc2Vzc2lvbiAoYHNlc3Npb25LZXlgKSB0aGV5IHdlcmUgcXVldWVkIGZvci4gKi9cbmludGVyZmFjZSBJUGVuZGluZ1JlY29uY2lsZSB7XG5cdHJlYWRvbmx5IHNlc3Npb25LZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdGFyZ2V0OiBJTWFuYWdlZFRhYnNUYXJnZXQ7XG5cdHJlYWRvbmx5IHRyaWdnZXI6IElSZWNvbmNpbGVUcmlnZ2VyO1xufVxuXG4vKipcbiAqIE93bnMgdGhlIHR3byBtYW5hZ2VkIGRvY2tlZCB0YWJzICh0aGUgcGlubmVkIENoYW5nZXMgbXVsdGktZGlmZiB0YWIgYW5kIHRoZSBlbXB0eSBGaWxlc1xuICogcGxhY2Vob2xkZXIgdGFiIGZvciB3b3Jrc3BhY2Ugc2Vzc2lvbnMpIGFuZCB0aGUgZGV0YWlsLW9ubHkgZWRpdG9yLWFyZWEgY29sbGFwc2UuIFNoYXJlZFxuICogKG5vdCBhIHN0cmF0ZWd5KSBiZWNhdXNlIGJvdGggYmVsb25nIHRvIG9uZSByZWNvbmNpbGUgcGlwZWxpbmUgdGhhdCBtdXN0IHN0YXkgc2luZ2xlLWluc3RhbmNlXG4gKiBhY3Jvc3MgdGhlIE5ld1x1MjE5MkV4aXN0aW5nIHN1Ym1pdCB0cmFuc2l0aW9uIFx1MjAxNCBzZWUgYFNpbmdsZVBhbmVMYXlvdXRTdHJhdGVneWAncyBkb2MgY29tbWVudC5cbiAqIE93bmVkIGFuZCBkaXNwb3NlZCBieSB7QGxpbmsgaW1wb3J0KCcuL3NpbmdsZVBhbmVFeGlzdGluZ1Nlc3Npb25TdHJhdGVneS5qcycpLlNpbmdsZVBhbmVFeGlzdGluZ1Nlc3Npb25TdHJhdGVneX0uXG4gKiBgU2luZ2xlUGFuZU5ld1Nlc3Npb25TdHJhdGVneWAgc3VwcGxpZXMgaXRzIG93biBzdXBwbGVtZW50YXJ5IHJlY29uY2lsZSBpbnRlbnRzIHZpYVxuICoge0BsaW5rIHF1ZXVlUmVjb25jaWxlfTsgYFNpbmdsZVBhbmVRdWlja0NoYXRTdHJhdGVneWAgbmV2ZXIgd2FudHMgbWFuYWdlZCB0YWJzLCBzbyBpdCBuZXZlclxuICogY2FsbHMgaW4gXHUyMDE0IHRoZSBhbWJpZW50IHNlc3Npb24tY2hhbmdlIHRyaWdnZXIgYmVsb3cgcmVjb25jaWxlcyB0aGVtIGF3YXkgb24gaXRzIG93bi5cbiAqXG4gKiBTZWUgYFNJTkdMRV9QQU5FX1NDRU5BUklPUy5tZGAgZm9yIHRoZSBmdWxsIHJlY29uY2lsZSBydWxlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFNpbmdsZVBhbmVEb2NrZWRUYWJzQ29vcmRpbmF0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKiogTm9uLWRvY2tlZCBlZGl0b3JzIGNsb3NlZCAoYXMgcmVvcGVuYWJsZSBpbnB1dHMgKyB0YWIgaW5kZXgpIHdoaWxlIHRoZSBlZGl0b3IgYXJlYSBpcyBoaWRkZW4uICovXG5cdHByaXZhdGUgX2NvbGxhcHNlZEVkaXRvcnM6IHsgcmVhZG9ubHkgZWRpdG9yOiBJVW50eXBlZEVkaXRvcklucHV0OyByZWFkb25seSBpbmRleDogbnVtYmVyIH1bXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXG5cdHByaXZhdGUgX2dlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIF9sYXN0U3luY2VkU2Vzc2lvbktleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcmVzZXJ2ZU1pc3NpbmdGaWxlc0ZvclNlc3Npb25LZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZmlsZXNUYWJEaXNtaXNzZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY2hhbmdpbmdGaWxlc0ludGVybmFsbHkgPSBmYWxzZTtcblxuXHQvLyBUaGUgcGVuZGluZyByZWNvbmNpbGUgaW50ZW50cywgKipzY29wZWQgdG8gdGhlIHNlc3Npb24gdGhleSB3ZXJlIHF1ZXVlZCBmb3IqKi4gTXVsdGlwbGVcblx0Ly8gdHJpZ2dlcnMgY2FuIGZpcmUgZm9yIG9uZSBsb2dpY2FsIGV2ZW50IG9uIHRoZSBzYW1lIHNlc3Npb24gKGUuZy4gc3VibWl0IGZpcmVzIHRoZVxuXHQvLyBhbWJpZW50IHNlc3Npb24tY2hhbmdlIHRyaWdnZXIgYW5kLCB2aWEgdGhlIHN1Ym1pdCByZXN0b3JlLCB0aGUgc2V0dGxlZC1yZXN0b3JlIHRyaWdnZXIpO1xuXHQvLyB0aGVpciBpbnRlbnRzIGFyZSBhY2N1bXVsYXRlZCBzbyB0aGUgc2luZ2xlIHN1cnZpdmluZyAobGF0ZXN0LWdlbmVyYXRpb24pIHJlY29uY2lsZVxuXHQvLyBhcHBsaWVzIGFsbCBvZiB0aGVtLiBTY29waW5nIHRvIGBzZXNzaW9uS2V5YCBlbnN1cmVzIGEgdHJpZ2dlciBxdWV1ZWQgZm9yIG9uZSBzZXNzaW9uIGlzXG5cdC8vIG5ldmVyIG1lcmdlZCBpbnRvIFx1MjAxNCBub3IgYXBwbGllZCB0byBcdTIwMTQgYSBkaWZmZXJlbnQgc2Vzc2lvbiBpdCB3YXMgc3VwZXJzZWRlZCBieSAoYSBzZXNzaW9uXG5cdC8vIHN3aXRjaCBkcm9wcyB0aGUgc3RhbGUgaW50ZW50cykuXG5cdHByaXZhdGUgX3BlbmRpbmc6IElQZW5kaW5nUmVjb25jaWxlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNUYWJNaXNzaW5nQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVzVGFiTWlzc2luZ0NvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzVGFiQXZhaWxhYmxlQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVzVGFiQXZhaWxhYmxlQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0LyoqIExhc3Qgb2JzZXJ2ZWQgZWRpdG9yLWFyZWEgdmlzaWJpbGl0eSwgdG8gYWN0IG9ubHkgb24gdHJhbnNpdGlvbnMuICovXG5cdHByaXZhdGUgX2VkaXRvckFyZWFWaXNpYmxlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2N0eDogSVNpbmdsZVBhbmVMYXlvdXRDb250ZXh0LFxuXHRcdEBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlOiBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLFxuXHRcdEBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fY2hhbmdlc1RhYk1pc3NpbmdDb250ZXh0ID0gU2luZ2xlUGFuZUNoYW5nZXNUYWJNaXNzaW5nQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2ZpbGVzVGFiTWlzc2luZ0NvbnRleHQgPSBTaW5nbGVQYW5lRmlsZXNUYWJNaXNzaW5nQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NoYW5nZXNUYWJBdmFpbGFibGVDb250ZXh0ID0gU2luZ2xlUGFuZUNoYW5nZXNUYWJBdmFpbGFibGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZmlsZXNUYWJBdmFpbGFibGVDb250ZXh0ID0gU2luZ2xlUGFuZUZpbGVzVGFiQXZhaWxhYmxlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gW0FtYmllbnQgdHJpZ2dlcl0gU2Vzc2lvbiBzd2l0Y2ggLyBjcmVhdGVkIHRyYW5zaXRpb24sIGtpbmQtYWdub3N0aWMgKGZpcmVzIGZvciBOZXcsXG5cdFx0Ly8gRXhpc3RpbmcsIGFuZCBRdWljayBDaGF0IGFsaWtlIFx1MjAxNCBhIHF1aWNrIGNoYXQncyB0YXJnZXQgd2FudHMgbmVpdGhlciB0YWIsIHNvIHRoaXNcblx0XHQvLyByZWNvbmNpbGVzIGFueSBzdHJheSBtYW5hZ2VkIHRhYnMgYXdheSkuIFRoZSBOZXcvRXhpc3Rpbmctc3BlY2lmaWMgXCJlbnN1cmUgdGhlXG5cdFx0Ly8gQ2hhbmdlcyB0YWJcIiBudWFuY2VzIGFyZSBzdXBwbGllZCBieSB0aG9zZSBzdHJhdGVnaWVzIHZpYSBgcXVldWVSZWNvbmNpbGVgLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3JlYWRUYXJnZXQocmVhZGVyKTtcblx0XHRcdGlmICghdGFyZ2V0LndhbnRzQ2hhbmdlc1RhYikge1xuXHRcdFx0XHR0aGlzLl9maWxlc1RhYkRpc21pc3NlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5xdWV1ZVJlY29uY2lsZSh0YXJnZXQsIHsgb3BlbkRlZmF1bHRzSWZFbXB0eTogdHJ1ZSB9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBbQW1iaWVudCB0cmlnZ2VyXSBUaGUgdXNlciBvcGVuZWQgdGhlIHNpZGUgcGFuZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkUmV2ZWFsU2lkZVBhbmUoKCkgPT4ge1xuXHRcdFx0dGhpcy5xdWV1ZVJlY29uY2lsZSh0aGlzLl9yZWFkVGFyZ2V0KHVuZGVmaW5lZCksIHsgb3BlbkRlZmF1bHRzSWZFbXB0eTogdHJ1ZSB9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBbQW1iaWVudCB0cmlnZ2VyXSBFZGl0b3IgbGlzdCAvIHNpZGUtcGFuZSB2aXNpYmlsaXR5IGNoYW5nZS4gVGhpcyB0aWRpZXMgdGhlIHRhYnNcblx0XHQvLyAocmVtb3ZpbmcgdGhlIHJlZHVuZGFudCBGaWxlcyBwbGFjZWhvbGRlciB3aGlsZSBhIHJlYWwgZmlsZSBpcyBvcGVuKSBidXQgbXVzdCBub3Rcblx0XHQvLyBvcGVuIHRoZSBkZWZhdWx0cyBcdTIwMTQgYSB1c2VyIGZpbGUgb3Blbi9jbG9zZSBpcyBub3QgYSB2aWV3LW9wZW4gbW9tZW50LCBzbyBjbG9zaW5nIHRoZVxuXHRcdC8vIGxhc3QgdGFiIHN0aWxsIGNsb3NlcyB0aGUgc2lkZSBwYW5lLiBUaGUgbGF5b3V0LWRyaXZlbiBhZGQgKGEgd29ya2luZy1zZXQgYXBwbHlcblx0XHQvLyBkdXJpbmcgYSBzd2l0Y2gsIHdoaWNoIGVtcHRpZXMgdGhlIGdyb3VwKSBpcyBoYW5kbGVkIGJ5IHRoZSBzZXR0bGVkLXJlc3RvcmUgdHJpZ2dlclxuXHRcdC8vIGJlbG93LCBub3QgaGVyZSBcdTIwMTQgdGhlIGVkaXRvciBjaGFuZ2UgZmlyZXMgKmR1cmluZyogdGhlIGFzeW5jIGFwcGx5LCByYWNpbmcgdGhlIGVtcHR5XG5cdFx0Ly8gc3RhdGUuXG5cdFx0Y29uc3QgcGFydFZpc2liaWxpdHlDaGFuZ2VkU2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCB0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkpO1xuXHRcdGNvbnN0IGVkaXRvcnNDaGFuZ2VkU2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCBFdmVudC5hbnkodGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgdGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZEVkaXRvcnNDaGFuZ2UpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRwYXJ0VmlzaWJpbGl0eUNoYW5nZWRTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdFx0ZWRpdG9yc0NoYW5nZWRTaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5xdWV1ZVJlY29uY2lsZSh0aGlzLl9yZWFkVGFyZ2V0KHVuZGVmaW5lZCksIHt9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBbQW1iaWVudCB0cmlnZ2VyXSBSZWNvbmNpbGUgYWZ0ZXIgdGhlIHNlc3Npb24tc3dpdGNoIHdvcmtpbmcgc2V0IGhhcyBmdWxseSBzZXR0bGVkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2N0eC5vbkRpZEVuZFNlc3Npb25MYXlvdXRSZXN0b3JlKCgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3JlYWRUYXJnZXQodW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGVuc3VyZUNoYW5nZXMgPSB0YXJnZXQud2FudHNDaGFuZ2VzVGFiICYmIHNlc3Npb24/LmlzQ3JlYXRlZC5nZXQoKSA9PT0gZmFsc2U7XG5cdFx0XHR0aGlzLnF1ZXVlUmVjb25jaWxlKHRhcmdldCwgeyBvcGVuRGVmYXVsdHNJZkVtcHR5OiB0cnVlLCBlbnN1cmVDaGFuZ2VzLCB3b3JraW5nU2V0UmVzdG9yZWQ6IHRydWUgfSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gW1RpZHkgc3RyaXBdIE9wZW5pbmcgYSByZWFsIHdvcmtzcGFjZSBmaWxlIG1ha2VzIHRoZSBlbXB0eSBGaWxlcyBwbGFjZWhvbGRlclxuXHRcdC8vIHJlZHVuZGFudCwgc28gcmVtb3ZlIGl0IChhIHRpZHkgYFtDaGFuZ2VzXVtmaWxlXWAgc3RyaXApLiBUaGlzIGlzIGEgKipvbmUtc2hvdFxuXHRcdC8vIHJlYWN0aW9uIHRvIGEgZ2VudWluZWx5IG5ldyBmaWxlIG9wZW4qKiwgbm90IGEgc3RhbmRpbmcgcnVsZTogdGhlIHVzZXIgY2FuIHN0aWxsIGFkZFxuXHRcdC8vIHRoZSBGaWxlcyB0YWIgdmlhIGArYCB3aGlsZSBhIGZpbGUgaXMgb3BlbiAodGhhdCBvcGVucyBhbiBFbXB0eUZpbGVFZGl0b3JJbnB1dCwgbm90IGFcblx0XHQvLyByZWFsIGZpbGUsIHNvIGl0IGlzIG5vdCByZW1vdmVkKS4gU2tpcHBlZCB3aGVuIHRoZSBlZGl0b3IgaXMgbWVyZWx5ICpyZS1hY3RpdmF0ZWQqXG5cdFx0Ly8gKHNlbGVjdGluZyBhbiBhbHJlYWR5LW9wZW4gZmlsZSwgb3IgYSBjbG9zZSByZXZlYWxpbmcgdGhlIG5leHQgZWRpdG9yIFx1MjAxNCBib3RoIGZpcmVcblx0XHQvLyBgb25XaWxsT3BlbkVkaXRvcmAgd2hpbGUgdGhlIGVkaXRvciBpcyBhbHJlYWR5IGluIHRoZSBncm91cCksIHdoZW4gaXQgdGFyZ2V0cyBhXG5cdFx0Ly8gbm9uLW1haW4tcGFydCBncm91cCwgb3IgZHVyaW5nIGEgcmVzdG9yZS1kcml2ZW4gb3Blbi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uV2lsbE9wZW5FZGl0b3IoZSA9PiB7XG5cdFx0XHRpZiAoZS5lZGl0b3IgaW5zdGFuY2VvZiBFbXB0eUZpbGVFZGl0b3JJbnB1dCAmJiAhdGhpcy5fY2hhbmdpbmdGaWxlc0ludGVybmFsbHkgJiYgIXRoaXMuX2N0eC5pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXQpIHtcblx0XHRcdFx0dGhpcy5fZmlsZXNUYWJEaXNtaXNzZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jdHguaXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0IHx8ICF0aGlzLl9pc1dvcmtzcGFjZUZpbGVFZGl0b3IoZS5lZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5tYWluUGFydC5nZXRHcm91cChlLmdyb3VwSWQpO1xuXHRcdFx0aWYgKCFncm91cCB8fCBncm91cC5jb250YWlucyhlLmVkaXRvcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dm9pZCB0aGlzLl9zZXF1ZW5jZXIucXVldWUoKCkgPT4gdGhpcy5fcmVtb3ZlRmlsZXNUYWIodGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5tYWluUGFydC5hY3RpdmVHcm91cCkpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZENsb3NlRWRpdG9yKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWRpdG9yIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXRcblx0XHRcdFx0JiYgIXRoaXMuX2NoYW5naW5nRmlsZXNJbnRlcm5hbGx5XG5cdFx0XHRcdCYmICF0aGlzLl9jdHguaXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0XG5cdFx0XHRcdCYmICF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3NlZCgpXG5cdFx0XHRcdCYmIHRoaXMuX3JlYWRUYXJnZXQodW5kZWZpbmVkKS53YW50c0NoYW5nZXNUYWIpIHtcblx0XHRcdFx0dGhpcy5fZmlsZXNUYWJEaXNtaXNzZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFtFZGl0b3ItYXJlYSBjb2xsYXBzZV0gV2hlbiB0aGUgZWRpdG9yIGFyZWEgaXMgaGlkZGVuICoqd2hpbGUgdGhlIGRldGFpbCBwYW5lbCAoYXV4XG5cdFx0Ly8gYmFyKSBzdGF5cyBvcGVuKiogXHUyMDE0IGEgZGV0YWlsLW9ubHkgY29sbGFwc2UgXHUyMDE0IGNsb3NlIGV2ZXJ5IG5vbi1kb2NrZWQgZWRpdG9yIHNvIG9ubHlcblx0XHQvLyB0aGUgZG9ja2VkIENoYW5nZXMvRmlsZXMgdGFicyByZW1haW4uIENsb3NpbmcgdGhlICoqd2hvbGUgc2lkZSBwYW5lKiogKGJvdGggdGhlXG5cdFx0Ly8gZWRpdG9yIGFyZWEgYW5kIHRoZSBhdXggYmFyKSBpcyAqbm90KiBhIGNvbGxhcHNlIFx1MjAxNCBlZGl0b3JzIGFyZSBsZWZ0IHVudG91Y2hlZCBzbyB0aGV5XG5cdFx0Ly8gYXJlIHN0aWxsIHRoZXJlIHdoZW4gdGhlIHNpZGUgcGFuZSBpcyByZW9wZW5lZC4gS2luZC1hZ25vc3RpYzogYXBwbGllcyB0aGUgc2FtZSB3YXlcblx0XHQvLyB3aGV0aGVyIHRoZSBkZXRhaWwtb25seSBzdGF0ZSBiZWxvbmdzIHRvIGEgTmV3IFNlc3Npb24gb3IgYW4gRXhpc3RpbmcgU2Vzc2lvbi5cblx0XHRjb25zdCBlZGl0b3JBcmVhVmlzaWJsZU9icyA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQodGhpcywgdGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5KTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRlZGl0b3JBcmVhVmlzaWJsZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2aXNpYmxlID0gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpO1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvckFyZWFWaXNpYmxlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yQXJlYVZpc2libGUgPSB2aXNpYmxlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodmlzaWJsZSA9PT0gdGhpcy5fZWRpdG9yQXJlYVZpc2libGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZWRpdG9yQXJlYVZpc2libGUgPSB2aXNpYmxlO1xuXG5cdFx0XHQvLyBTZXNzaW9uLXN3aXRjaCByZXN0b3JlcyB0b2dnbGUgZWRpdG9yLWFyZWEgdmlzaWJpbGl0eSBhcyBhIHNpZGUgZWZmZWN0OyB0aG9zZVxuXHRcdFx0Ly8gYXJlIGxheW91dC1kcml2ZW4sIG5vdCBhIHVzZXIgaGlkZS9zaG93LCBzbyBza2lwIHRoZW0uXG5cdFx0XHRpZiAodGhpcy5fY3R4LmlzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuX3Jlc3RvcmVDb2xsYXBzZWRUYWJzKCkpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbmx5IGNvbGxhcHNlIG9uIGEgKipkZXRhaWwtb25seSoqIGhpZGUgKGVkaXRvciBjbG9zZWQsIGRldGFpbCBrZXB0KS4gQ2xvc2luZyB0aGVcblx0XHRcdC8vIHdob2xlIHNpZGUgcGFuZSBoaWRlcyB0aGUgYXV4IGJhciB0b28gKHRoZSB0b2dnbGUgaGlkZXMgaXQgKmJlZm9yZSogdGhlIGVkaXRvcixcblx0XHRcdC8vIHNvIGl0IGlzIGFscmVhZHkgaGlkZGVuIGhlcmUpIFx1MjAxNCBsZWF2ZSB0aGUgZWRpdG9ycyBvcGVuIHNvIHRoZXkgcmV0dXJuIHdoZW4gdGhlXG5cdFx0XHQvLyBzaWRlIHBhbmUgaXMgcmVvcGVuZWQuXG5cdFx0XHRpZiAodGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuX2NvbGxhcHNlTm9uTWFuYWdlZFRhYnMoKSkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2N0eC5vbkRpZEVuZFNlc3Npb25MYXlvdXRSZXN0b3JlKCgpID0+IHRoaXMuX3F1ZXVlQ29sbGFwc2VJZkRldGFpbHNPbmx5KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkRWRpdG9yc0NoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2N0eC5pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXQpIHtcblx0XHRcdFx0dGhpcy5fcXVldWVDb2xsYXBzZUlmRGV0YWlsc09ubHkoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKiogVGhlIHJlc291cmNlIHRoaXMgbWFuYWdlZCBDaGFuZ2VzIGVkaXRvciBpbnB1dCBzaG93cywgaWYgaXQgaXMgb25lLiAqL1xuXHRnZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2UoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBlZGl0b3IucmVzb3VyY2U7XG5cdFx0cmV0dXJuIHJlc291cmNlICYmIHRoaXMuX3Nlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRTZXNzaW9uUmVzb3VyY2UocmVzb3VyY2UpID8gcmVzb3VyY2UgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcmVwYXJlV29ya2luZ1NldFJlc3RvcmUoaGFzU2F2ZWRXb3JraW5nU2V0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpPy5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRoaXMuX3ByZXNlcnZlTWlzc2luZ0ZpbGVzRm9yU2Vzc2lvbktleSA9IGhhc1NhdmVkV29ya2luZ1NldCAmJiB0aGlzLl9maWxlc1RhYkRpc21pc3NlZCA/IHNlc3Npb25LZXkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyAtLS0gVHJpZ2dlciBwbHVtYmluZyAoY2FsbGVkIGJ5IHRoZSBOZXcvRXhpc3RpbmcgbGlmZWN5Y2xlIHN0cmF0ZWdpZXMpIC0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqIFJlYWRzIHRoZSBjdXJyZW50IG1hbmFnZWQtdGFicyB0YXJnZXQgZm9yIHRoZSBhY3RpdmUgc2Vzc2lvbiAob3IgZm9yIGByZWFkZXJgJ3MgdHJhbnNhY3Rpb24sIGlmIGdpdmVuKS4gKi9cblx0cmVhZFRhcmdldChyZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBJTWFuYWdlZFRhYnNUYXJnZXQge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkVGFyZ2V0KHJlYWRlcik7XG5cdH1cblxuXHQvKiogUXVldWVzIGEgcmVjb25jaWxlIGZvciB0aGUgYWN0aXZlIHNlc3Npb24sIG1lcmdpbmcgYHRyaWdnZXJgIHdpdGggYW55IG5vdC15ZXQtYXBwbGllZCBwZW5kaW5nIGludGVudHMgZm9yIHRoYXQgc2Vzc2lvbi4gKi9cblx0cXVldWVSZWNvbmNpbGUodGFyZ2V0OiBJTWFuYWdlZFRhYnNUYXJnZXQsIHRyaWdnZXI6IElSZWNvbmNpbGVUcmlnZ2VyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpPy5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdC8vIEFjY3VtdWxhdGUgaW50ZW50cyBvbmx5IHdpdGhpbiB0aGUgc2FtZSBzZXNzaW9uOyBhIHNlc3Npb24gc3dpdGNoIGRyb3BzIHRoZSBwcmV2aW91c1xuXHRcdC8vIHNlc3Npb24ncyBwZW5kaW5nIGludGVudHMgKGFuZCB0YWtlcyB0aGUgbGF0ZXN0IHRhcmdldCkuXG5cdFx0Y29uc3QgbWVyZ2VkVHJpZ2dlciA9IHRoaXMuX3BlbmRpbmcgJiYgdGhpcy5fcGVuZGluZy5zZXNzaW9uS2V5ID09PSBzZXNzaW9uS2V5XG5cdFx0XHQ/IG1lcmdlVHJpZ2dlcnModGhpcy5fcGVuZGluZy50cmlnZ2VyLCB0cmlnZ2VyKVxuXHRcdFx0OiB0cmlnZ2VyO1xuXHRcdHRoaXMuX3BlbmRpbmcgPSB7IHNlc3Npb25LZXksIHRhcmdldCwgdHJpZ2dlcjogbWVyZ2VkVHJpZ2dlciB9O1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSArK3RoaXMuX2dlbmVyYXRpb247XG5cdFx0dm9pZCB0aGlzLl9zZXF1ZW5jZXIucXVldWUoKCkgPT4gdGhpcy5fcmVjb25jaWxlKGdlbmVyYXRpb24pKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkVGFyZ2V0KHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCk6IElNYW5hZ2VkVGFic1RhcmdldCB7XG5cdFx0Y29uc3QgcmVhZCA9IDxUPihvYnM6IElPYnNlcnZhYmxlPFQ+KTogVCA9PiByZWFkZXIgPyBvYnMucmVhZChyZWFkZXIpIDogb2JzLmdldCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSByZWFkKHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uKTtcblx0XHRjb25zdCBpc1F1aWNrQ2hhdCA9IHNlc3Npb24/LmlzUXVpY2tDaGF0ID8gcmVhZChzZXNzaW9uLmlzUXVpY2tDaGF0KSA6IGZhbHNlO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHNlc3Npb24gPyByZWFkKHNlc3Npb24ud29ya3NwYWNlKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXNlc3Npb24gfHwgaXNRdWlja0NoYXQgfHwgIXdvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIHsgY2hhbmdlc1Nlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkLCB3b3Jrc3BhY2U6IHVuZGVmaW5lZCwgd2FudHNDaGFuZ2VzVGFiOiBmYWxzZSwgd2FudHNGaWxlc1RhYjogZmFsc2UgfTtcblx0XHR9XG5cdFx0Y29uc3QgaXNDcmVhdGVkID0gcmVhZChzZXNzaW9uLmlzQ3JlYXRlZCk7XG5cdFx0cmV0dXJuIHsgY2hhbmdlc1Nlc3Npb25SZXNvdXJjZTogaXNDcmVhdGVkID8gc2Vzc2lvbi5yZXNvdXJjZSA6IHVuZGVmaW5lZCwgd29ya3NwYWNlLCB3YW50c0NoYW5nZXNUYWI6IGlzQ3JlYXRlZCwgd2FudHNGaWxlc1RhYjogdHJ1ZSB9O1xuXHR9XG5cblx0Ly8gLS0tIFJlY29uY2lsZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY29uY2lsZShnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5fZ2VuZXJhdGlvbiB8fCAhdGhpcy5fcGVuZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvbnN1bWUgdGhlIGFjY3VtdWxhdGVkIGludGVudHMuIElmIHRoaXMgcmVjb25jaWxlIGlzIHN1cGVyc2VkZWQgbWlkLXJ1biwgdGhlIGZpbmFsbHlcblx0XHQvLyBibG9jayBoYW5kcyB0aGVtIGJhY2sgXHUyMDE0IGJ1dCBvbmx5IGlmIHRoZSBzdWNjZXNzb3IgaXMgZm9yIHRoZSAqc2FtZSogc2Vzc2lvbiwgc29cblx0XHQvLyBpbnRlbnRzIG5ldmVyIGxlYWsgYWNyb3NzIGEgc2Vzc2lvbiBzd2l0Y2guXG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmc7XG5cdFx0dGhpcy5fcGVuZGluZyA9IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVjb25jaWxlQ29yZShwZW5kaW5nLnRhcmdldCwgcGVuZGluZy50cmlnZ2VyLCBnZW5lcmF0aW9uKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gSWYgYSBuZXdlciByZWNvbmNpbGUgc3VwZXJzZWRlZCB0aGlzIG9uZSwgaGFuZCBvdXIgaW50ZW50cyB0byBpdCBcdTIwMTQgYnV0IG9ubHkgd2hlblxuXHRcdFx0Ly8gaXQgdGFyZ2V0cyB0aGUgc2FtZSBzZXNzaW9uLCBzbyBpbnRlbnRzIG5ldmVyIGxlYWsgYWNyb3NzIGEgc2Vzc2lvbiBzd2l0Y2guXG5cdFx0XHRjb25zdCBzdWNjZXNzb3IgPSB0aGlzLl9wZW5kaW5nIGFzIElQZW5kaW5nUmVjb25jaWxlIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMuX2dlbmVyYXRpb24gJiYgc3VjY2Vzc29yICYmIHN1Y2Nlc3Nvci5zZXNzaW9uS2V5ID09PSBwZW5kaW5nLnNlc3Npb25LZXkpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZyA9IHsgLi4uc3VjY2Vzc29yLCB0cmlnZ2VyOiBtZXJnZVRyaWdnZXJzKHN1Y2Nlc3Nvci50cmlnZ2VyLCBwZW5kaW5nLnRyaWdnZXIpIH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25jaWxlQ29yZSh0YXJnZXQ6IElNYW5hZ2VkVGFic1RhcmdldCwgdHJpZ2dlcjogSVJlY29uY2lsZVRyaWdnZXIsIGdlbmVyYXRpb246IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5tYWluUGFydC5hY3RpdmVHcm91cDtcblx0XHR0aGlzLl9yZXNldENvbGxhcHNlZEVkaXRvcnNPblNlc3Npb25DaGFuZ2UoKTtcblxuXHRcdGNvbnN0IGNoYW5nZXNSZXNvdXJjZSA9IHRhcmdldC5jaGFuZ2VzU2Vzc2lvblJlc291cmNlID8gdGhpcy5fc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZSh0YXJnZXQuY2hhbmdlc1Nlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cblx0XHQvLyBSZWNvbmNpbGluZyBjYW4gdHJhbnNpZW50bHkgZW1wdHkgdGhlIGdyb3VwIChlLmcuIGNsb3NpbmcgYSBzdGFsZSBDaGFuZ2VzIHRhYikuXG5cdFx0Ly8gU3VwcHJlc3MgZWRpdG9yLXBhcnQgYXV0by12aXNpYmlsaXR5IGFjcm9zcyB0aGUgd2hvbGUgb3BlcmF0aW9uIHNvIGEgdHJhbnNpZW50IGVtcHR5XG5cdFx0Ly8gZ3JvdXAgaXMgbmV2ZXIgbWlzdGFrZW4gZm9yIHRoZSB1c2VyIGNsb3NpbmcgYWxsIHRhYnMgKHdoaWNoIHdvdWxkIGNsb3NlIHRoZSBzaWRlIHBhbmUpLlxuXHRcdGNvbnN0IHN1cHByZXNzaW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5zdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBbMV0gUmVwbGFjZSBhbiBvdXRnb2luZyBzZXNzaW9uJ3MgQ2hhbmdlcyB0YWIgaW4gcGxhY2Ugd2hlbiB0aGUgaW5jb21pbmdcblx0XHRcdC8vIHNlc3Npb24gYWxzbyB3YW50cyBDaGFuZ2VzOyBjbG9zZSBvbmx5IGFkZGl0aW9uYWwgc3RhbGUgdGFicy5cblx0XHRcdGF3YWl0IHRoaXMuX3JlY29uY2lsZUZvcmVpZ25DaGFuZ2VzRWRpdG9ycyhncm91cCwgY2hhbmdlc1Jlc291cmNlKTtcblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3VwZGF0ZUZpbGVzRWRpdG9ycyhncm91cCwgdGFyZ2V0LndvcmtzcGFjZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBwcmVzZXJ2ZU1pc3NpbmdGaWxlcyA9ICEhdHJpZ2dlci53b3JraW5nU2V0UmVzdG9yZWQgJiYgdGhpcy5fcHJlc2VydmVNaXNzaW5nRmlsZXNGb3JTZXNzaW9uS2V5ID09PSBzZXNzaW9uS2V5O1xuXHRcdFx0aWYgKHByZXNlcnZlTWlzc2luZ0ZpbGVzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3JlbW92ZUZpbGVzVGFiKGdyb3VwKTtcblx0XHRcdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMuX2dlbmVyYXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gWzJdIERlY2lkZSB3aGljaCBkb2NrZWQgaW5wdXRzIHRvIG9wZW4sIGZyb20gdGhlIHRyaWdnZXIgKyBncm91cCBzdGF0ZS5cblx0XHRcdGNvbnN0IG9wZW5JbnRvRW1wdHkgPSAhIXRyaWdnZXIub3BlbkRlZmF1bHRzSWZFbXB0eSAmJiBncm91cC5lZGl0b3JzLmxlbmd0aCA9PT0gMDtcblx0XHRcdGNvbnN0IGNoYW5nZXNQcmVzZW50ID0gISFjaGFuZ2VzUmVzb3VyY2UgJiYgISF0aGlzLl9maW5kQ2hhbmdlc0VkaXRvcihncm91cCwgY2hhbmdlc1Jlc291cmNlKTtcblx0XHRcdGNvbnN0IGZpbGVzUHJlc2VudCA9IGdyb3VwLmVkaXRvcnMuc29tZShlZGl0b3IgPT4gZWRpdG9yIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpO1xuXHRcdFx0Y29uc3QgYWN0aXZlQ2hhbmdlc1Jlc291cmNlID0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IgJiYgdGhpcy5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2UodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IpO1xuXHRcdFx0Y29uc3QgYWN0aXZhdGVDaGFuZ2VzID0gISF0cmlnZ2VyLmVuc3VyZUNoYW5nZXNBY3RpdmUgJiYgISFjaGFuZ2VzUmVzb3VyY2UgJiYgKCFhY3RpdmVDaGFuZ2VzUmVzb3VyY2UgfHwgIWlzRXF1YWwoYWN0aXZlQ2hhbmdlc1Jlc291cmNlLCBjaGFuZ2VzUmVzb3VyY2UpKTtcblx0XHRcdGNvbnN0IGVuc3VyZUFsbElucHV0cyA9IHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKVxuXHRcdFx0XHQmJiAhdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpO1xuXG5cdFx0XHRjb25zdCBvcGVuQ2hhbmdlcyA9IHRhcmdldC53YW50c0NoYW5nZXNUYWIgJiYgISFjaGFuZ2VzUmVzb3VyY2UgJiYgKGFjdGl2YXRlQ2hhbmdlcyB8fCAoIWNoYW5nZXNQcmVzZW50ICYmIChvcGVuSW50b0VtcHR5IHx8IGVuc3VyZUFsbElucHV0cyB8fCB0cmlnZ2VyLmVuc3VyZUNoYW5nZXMpKSk7XG5cdFx0XHRjb25zdCBvcGVuRmlsZXMgPSB0YXJnZXQud2FudHNGaWxlc1RhYiAmJiAhZmlsZXNQcmVzZW50ICYmICFwcmVzZXJ2ZU1pc3NpbmdGaWxlcyAmJiAob3BlbkludG9FbXB0eSB8fCBlbnN1cmVBbGxJbnB1dHMpO1xuXHRcdFx0Y29uc3QgaXNDcmVhdGVkID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk/LmlzQ3JlYXRlZC5nZXQoKSA/PyBmYWxzZTtcblx0XHRcdGNvbnN0IG9wZW5GaWxlc0ZpcnN0ID0gb3BlbkNoYW5nZXMgJiYgb3BlbkZpbGVzICYmICFpc0NyZWF0ZWQgJiYgZ3JvdXAuZWRpdG9ycy5sZW5ndGggPT09IDA7XG5cblx0XHRcdC8vIFszXSBLZWVwIEZpbGVzIGFjdGl2ZSBieSBkZWZhdWx0IGZvciBhIG5ldy1zZXNzaW9uIHZpZXcuXG5cdFx0XHRpZiAob3BlbkZpbGVzRmlyc3QpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fb3BlbkZpbGVzVGFiKGdyb3VwLCB0YXJnZXQud29ya3NwYWNlKTtcblx0XHRcdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMuX2dlbmVyYXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gWzRdIE9wZW4gQ2hhbmdlcyAoYWN0aXZlIG9uIHN1Ym1pdCBzbyB0aGUgZGV0YWlsIHBhbmVsIG1hcHMgdG8gaXQpLlxuXHRcdFx0aWYgKG9wZW5DaGFuZ2VzICYmIGNoYW5nZXNSZXNvdXJjZSkge1xuXHRcdFx0XHRpZiAoIWF3YWl0IHRoaXMuX29wZW5DaGFuZ2VzVGFiKHRhcmdldC5jaGFuZ2VzU2Vzc2lvblJlc291cmNlISwgY2hhbmdlc1Jlc291cmNlLCBncm91cCwgZ2VuZXJhdGlvbiwgYWN0aXZhdGVDaGFuZ2VzKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBbNV0gT3BlbiB0aGUgRmlsZXMgcGxhY2Vob2xkZXIgYWZ0ZXIgQ2hhbmdlcyBmb3IgY3JlYXRlZCBzZXNzaW9ucy5cblx0XHRcdGlmIChvcGVuRmlsZXMgJiYgIW9wZW5GaWxlc0ZpcnN0KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX29wZW5GaWxlc1RhYihncm91cCwgdGFyZ2V0LndvcmtzcGFjZSk7XG5cdFx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN1cHByZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRcdGlmIChnZW5lcmF0aW9uID09PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdGlmICh0cmlnZ2VyLndvcmtpbmdTZXRSZXN0b3JlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3ByZXNlcnZlTWlzc2luZ0ZpbGVzRm9yU2Vzc2lvbktleSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl91cGRhdGVBZGRUYWJDb250ZXh0cyh0YXJnZXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBPbiBhIHNlc3Npb24gY2hhbmdlLCBkcm9wIGVkaXRvcnMgY2FwdHVyZWQgd2hpbGUgdGhlIHByZXZpb3VzIHNlc3Npb24ncyBlZGl0b3IgYXJlYSB3YXMgaGlkZGVuIHNvIHRoZXkgYXJlIG5vdCByZW9wZW5lZCBoZXJlLiAqL1xuXHRwcml2YXRlIF9yZXNldENvbGxhcHNlZEVkaXRvcnNPblNlc3Npb25DaGFuZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpPy5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmIChzZXNzaW9uS2V5ICE9PSB0aGlzLl9sYXN0U3luY2VkU2Vzc2lvbktleSkge1xuXHRcdFx0dGhpcy5fY29sbGFwc2VkRWRpdG9ycyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2xhc3RTeW5jZWRTZXNzaW9uS2V5ID0gc2Vzc2lvbktleTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gVGFiIG9wZXJhdGlvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqIE9wZW5zIHRoZSBDaGFuZ2VzIGVkaXRvciBwaW5uZWQgZmlyc3QgKGFjdGl2ZSBvbiBzdWJtaXQpLiBSZXR1cm5zIGBmYWxzZWAgaWYgYSBuZXdlciByZWNvbmNpbGUgc3VwZXJzZWRlZCB0aGlzIG9uZSBtaWQtb3Blbi4gKi9cblx0cHJpdmF0ZSBhc3luYyBfb3BlbkNoYW5nZXNUYWIoc2Vzc2lvblJlc291cmNlOiBVUkksIGNoYW5nZXNSZXNvdXJjZTogVVJJLCBncm91cDogSUVkaXRvckdyb3VwLCBnZW5lcmF0aW9uOiBudW1iZXIsIGFjdGl2ZTogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuX2NoYW5nZXNWaWV3U2VydmljZS5zZXRDaGFuZ2VzZXRJZCh1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25DaGFuZ2VzU2VydmljZS5vcGVuQ2hhbmdlc0VkaXRvcihzZXNzaW9uUmVzb3VyY2UsIGFjdGl2ZSA/IENIQU5HRVNfVEFCX0FDVElWRV9PUFRJT05TIDogQ0hBTkdFU19UQUJfT1BUSU9OUywgZ3JvdXApO1xuXHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYW5nZXNFZGl0b3IgPSB0aGlzLl9maW5kQ2hhbmdlc0VkaXRvcihncm91cCwgY2hhbmdlc1Jlc291cmNlKTtcblx0XHRpZiAoY2hhbmdlc0VkaXRvcikge1xuXHRcdFx0dGhpcy5fcGluRmlyc3QoZ3JvdXAsIGNoYW5nZXNFZGl0b3IpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29wZW5GaWxlc1RhYihncm91cDogSUVkaXRvckdyb3VwLCB3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc3VwcHJlc3Npb24gPSB0aGlzLl9sYXlvdXRTZXJ2aWNlLnN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk7XG5cdFx0dGhpcy5fY2hhbmdpbmdGaWxlc0ludGVybmFsbHkgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW1wdHlGaWxlRWRpdG9ySW5wdXQsIHdvcmtzcGFjZSksIEZJTEVTX1RBQl9PUFRJT05TLCBncm91cCk7XG5cdFx0XHR0aGlzLl9maWxlc1RhYkRpc21pc3NlZCA9IGZhbHNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9jaGFuZ2luZ0ZpbGVzSW50ZXJuYWxseSA9IGZhbHNlO1xuXHRcdFx0c3VwcHJlc3Npb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlbW92ZUZpbGVzVGFiKGdyb3VwOiBJRWRpdG9yR3JvdXApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwbGFjZWhvbGRlciA9IGdyb3VwLmVkaXRvcnMuZmluZCgoZWRpdG9yKTogZWRpdG9yIGlzIEVtcHR5RmlsZUVkaXRvcklucHV0ID0+IGVkaXRvciBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KTtcblx0XHRpZiAocGxhY2Vob2xkZXIpIHtcblx0XHRcdHRoaXMuX2NoYW5naW5nRmlsZXNJbnRlcm5hbGx5ID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Nsb3NlTWFuYWdlZEVkaXRvcnMoZ3JvdXAsIFtwbGFjZWhvbGRlcl0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5fY2hhbmdpbmdGaWxlc0ludGVybmFsbHkgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvbmNpbGVGb3JlaWduQ2hhbmdlc0VkaXRvcnMoZ3JvdXA6IElFZGl0b3JHcm91cCwgYWN0aXZlQ2hhbmdlc1Jlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmb3JlaWduID0gZ3JvdXAuZWRpdG9ycy5maWx0ZXIoZWRpdG9yID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2UoZWRpdG9yKTtcblx0XHRcdHJldHVybiByZXNvdXJjZSAmJiAoIWFjdGl2ZUNoYW5nZXNSZXNvdXJjZSB8fCAhaXNFcXVhbChyZXNvdXJjZSwgYWN0aXZlQ2hhbmdlc1Jlc291cmNlKSk7XG5cdFx0fSk7XG5cdFx0aWYgKGZvcmVpZ24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFhY3RpdmVDaGFuZ2VzUmVzb3VyY2UpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Nsb3NlTWFuYWdlZEVkaXRvcnMoZ3JvdXAsIGZvcmVpZ24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtlZGl0b3JUb1JlcGxhY2UsIC4uLmVkaXRvcnNUb0Nsb3NlXSA9IGZvcmVpZ247XG5cdFx0Y29uc3Qgd2FzQWN0aXZlID0gZ3JvdXAuYWN0aXZlRWRpdG9yID09PSBlZGl0b3JUb1JlcGxhY2U7XG5cdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3tcblx0XHRcdGVkaXRvcjogZWRpdG9yVG9SZXBsYWNlLFxuXHRcdFx0cmVwbGFjZW1lbnQ6IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQsIGFjdGl2ZUNoYW5nZXNSZXNvdXJjZSksXG5cdFx0XHRvcHRpb25zOiB3YXNBY3RpdmUgPyBDSEFOR0VTX1RBQl9BQ1RJVkVfT1BUSU9OUyA6IENIQU5HRVNfVEFCX09QVElPTlMsXG5cdFx0fV0pO1xuXHRcdGlmIChlZGl0b3JzVG9DbG9zZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jbG9zZU1hbmFnZWRFZGl0b3JzKGdyb3VwLCBlZGl0b3JzVG9DbG9zZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRmlsZXNFZGl0b3JzKGdyb3VwOiBJRWRpdG9yR3JvdXAsIHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5lZGl0b3JzKSB7XG5cdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgRW1wdHlGaWxlRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0ZWRpdG9yLnNldFdvcmtzcGFjZSh3b3Jrc3BhY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBDbG9zZXMgZWRpdG9ycyB3ZSBvd24sIHByZXNlcnZpbmcgZm9jdXMgc28gYSB0cmFuc2llbnQgY2xvc2UgbmV2ZXIgc3RlYWxzIGl0LiAqL1xuXHRwcml2YXRlIGFzeW5jIF9jbG9zZU1hbmFnZWRFZGl0b3JzKGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvcnM6IEVkaXRvcklucHV0W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLmNsb3NlRWRpdG9ycyhlZGl0b3JzLm1hcChlZGl0b3IgPT4gKHsgZ3JvdXBJZDogZ3JvdXAuaWQsIGVkaXRvciB9KSksIHsgcHJlc2VydmVGb2N1czogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9waW5GaXJzdChncm91cDogSUVkaXRvckdyb3VwLCBlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0aWYgKCFncm91cC5pc1Bpbm5lZChlZGl0b3IpKSB7XG5cdFx0XHRncm91cC5waW5FZGl0b3IoZWRpdG9yKTtcblx0XHR9XG5cdFx0aWYgKGdyb3VwLmdldEluZGV4T2ZFZGl0b3IoZWRpdG9yKSAhPT0gMCkge1xuXHRcdFx0Z3JvdXAubW92ZUVkaXRvcihlZGl0b3IsIGdyb3VwLCBDSEFOR0VTX1RBQl9PUFRJT05TKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gUXVlcmllcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfZmluZENoYW5nZXNFZGl0b3IoZ3JvdXA6IElFZGl0b3JHcm91cCwgY2hhbmdlc1Jlc291cmNlOiBVUkkpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdyb3VwLmVkaXRvcnMuZmluZChlZGl0b3IgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShlZGl0b3IpO1xuXHRcdFx0cmV0dXJuICEhcmVzb3VyY2UgJiYgaXNFcXVhbChyZXNvdXJjZSwgY2hhbmdlc1Jlc291cmNlKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIHRoZSBlZGl0b3Igc2hvd3MgYSB3b3Jrc3BhY2UgZmlsZSAoYSBmaWxlLXN5c3RlbSByZXNvdXJjZSksIGV4Y2x1ZGluZyBtYW5hZ2VkIGRvY2tlZCBwbGFjZWhvbGRlcnMuICovXG5cdHByaXZhdGUgX2lzV29ya3NwYWNlRmlsZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIERvY2tlZEVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0cmV0dXJuIHJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSB8fCByZXNvdXJjZT8uc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0fVxuXG5cdC8qKiBPZmZlciB0aGUgYCtgIFwiQ2hhbmdlc1wiL1wiRmlsZXNcIiBlbnRyaWVzIHdoZW4gdGhlIHNlc3Npb24gc3VwcG9ydHMgdGhlbSBidXQgdGhlaXIgdGFicyBhcmUgY2xvc2VkLiAqL1xuXHRwcml2YXRlIF91cGRhdGVBZGRUYWJDb250ZXh0cyh0YXJnZXQ6IElNYW5hZ2VkVGFic1RhcmdldCk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5tYWluUGFydC5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBjaGFuZ2VzUHJlc2VudCA9IGdyb3VwLmVkaXRvcnMuc29tZShlZGl0b3IgPT4gdGhpcy5nZXRDaGFuZ2VzRWRpdG9yUmVzb3VyY2UoZWRpdG9yKSAhPT0gdW5kZWZpbmVkKTtcblx0XHRjb25zdCBmaWxlc1ByZXNlbnQgPSBncm91cC5lZGl0b3JzLnNvbWUoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIEVtcHR5RmlsZUVkaXRvcklucHV0KTtcblx0XHR0aGlzLl9jaGFuZ2VzVGFiQXZhaWxhYmxlQ29udGV4dC5zZXQodGFyZ2V0LndhbnRzQ2hhbmdlc1RhYik7XG5cdFx0dGhpcy5fZmlsZXNUYWJBdmFpbGFibGVDb250ZXh0LnNldCh0YXJnZXQud2FudHNGaWxlc1RhYik7XG5cdFx0dGhpcy5fY2hhbmdlc1RhYk1pc3NpbmdDb250ZXh0LnNldCh0YXJnZXQud2FudHNDaGFuZ2VzVGFiICYmICFjaGFuZ2VzUHJlc2VudCk7XG5cdFx0dGhpcy5fZmlsZXNUYWJNaXNzaW5nQ29udGV4dC5zZXQodGFyZ2V0LndhbnRzRmlsZXNUYWIgJiYgIWZpbGVzUHJlc2VudCk7XG5cdH1cblxuXHQvLyAtLS0gRWRpdG9yLWFyZWEgY29sbGFwc2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3F1ZXVlQ29sbGFwc2VJZkRldGFpbHNPbmx5KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpICYmIHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSkge1xuXHRcdFx0dm9pZCB0aGlzLl9zZXF1ZW5jZXIucXVldWUoKCkgPT4gdGhpcy5fY29sbGFwc2VOb25NYW5hZ2VkVGFicygpKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29sbGFwc2VOb25NYW5hZ2VkVGFicygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UubWFpblBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0Y29uc3QgY2FwdHVyZWQ6IHsgZWRpdG9yOiBJVW50eXBlZEVkaXRvcklucHV0OyBpbmRleDogbnVtYmVyIH1bXSA9IFsuLi4odGhpcy5fY29sbGFwc2VkRWRpdG9ycyA/PyBbXSldO1xuXHRcdGNvbnN0IHRvQ2xvc2U6IEVkaXRvcklucHV0W10gPSBbXTtcblx0XHRncm91cC5lZGl0b3JzLmZvckVhY2goKGVkaXRvciwgaW5kZXgpID0+IHtcblx0XHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBEb2NrZWRFZGl0b3JJbnB1dCB8fCB0aGlzLmdldENoYW5nZXNFZGl0b3JSZXNvdXJjZShlZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIENhcHR1cmUgZWRpdG9ycyB0aGF0IGNhbiBiZSByZW9wZW5lZCBzbyB0aGV5IGFyZSByZXN0b3JlZCB3aGVuIHRoZSBlZGl0b3IgYXJlYSBpc1xuXHRcdFx0Ly8gc2hvd24gYWdhaW47IHRoZSByZXN0IGFyZSBzdGlsbCBjbG9zZWQgYnV0IG5vdCByZXN0b3JlZC5cblx0XHRcdGNvbnN0IHVudHlwZWQgPSBlZGl0b3IudG9VbnR5cGVkKCk7XG5cdFx0XHRpZiAodW50eXBlZCkge1xuXHRcdFx0XHRjYXB0dXJlZC5wdXNoKHsgZWRpdG9yOiB1bnR5cGVkLCBpbmRleCB9KTtcblx0XHRcdH1cblx0XHRcdHRvQ2xvc2UucHVzaChlZGl0b3IpO1xuXHRcdH0pO1xuXHRcdGlmICh0b0Nsb3NlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbGxhcHNlZEVkaXRvcnMgPSBjYXB0dXJlZDtcblx0XHRjb25zdCBzdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSA9IHRoaXMuX2xheW91dFNlcnZpY2Uuc3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHkoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5jbG9zZUVkaXRvcnModG9DbG9zZS5tYXAoZWRpdG9yID0+ICh7IGdyb3VwSWQ6IGdyb3VwLmlkLCBlZGl0b3IgfSkpLCB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXN0b3JlQ29sbGFwc2VkVGFicygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjYXB0dXJlZCA9IHRoaXMuX2NvbGxhcHNlZEVkaXRvcnM7XG5cdFx0dGhpcy5fY29sbGFwc2VkRWRpdG9ycyA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIWNhcHR1cmVkIHx8IGNhcHR1cmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5tYWluUGFydC5hY3RpdmVHcm91cDtcblx0XHRjb25zdCBzdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSA9IHRoaXMuX2xheW91dFNlcnZpY2Uuc3VwcHJlc3NFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHkoKTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gUmVvcGVuIGluIGFzY2VuZGluZyBpbmRleCBvcmRlciwgZWFjaCBhdCBpdHMgb3JpZ2luYWwgdGFiIHBvc2l0aW9uLCBzbyB0aGUgdGFic1xuXHRcdFx0Ly8gcmV0dXJuIHRvIHdoZXJlIHRoZXkgd2VyZSBiZWZvcmUgdGhlIGVkaXRvciBhcmVhIHdhcyBoaWRkZW4uXG5cdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3JzKFxuXHRcdFx0XHRbLi4uY2FwdHVyZWRdXG5cdFx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KVxuXHRcdFx0XHRcdC5tYXAoKHsgZWRpdG9yLCBpbmRleCB9KSA9PiAoeyAuLi5lZGl0b3IsIG9wdGlvbnM6IHsgLi4uZWRpdG9yLm9wdGlvbnMsIGluZGV4LCBpbmFjdGl2ZTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdHJ1ZSwgcGlubmVkOiB0cnVlIH0gfSkpLFxuXHRcdFx0XHRncm91cCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQStCLGlDQUFpQztBQUN6RSxTQUFTLGVBQWU7QUFFeEIsU0FBUyx3QkFBd0M7QUFDakQsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsd0JBQTZDLHdCQUF3QjtBQUM5RSxTQUF1Qiw0QkFBNEI7QUFDbkQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsc0NBQXNDLG9D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
