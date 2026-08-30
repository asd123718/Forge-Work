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
import { Event } from "../../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { autorun, observableFromEvent } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { localize2 } from "../../../../../nls.js";
import { Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from "../../../../../workbench/common/contextkeys.js";
import { BrowserEditorInput } from "../../../../../workbench/contrib/browserView/common/browserEditorInput.js";
import { IEditorGroupsService } from "../../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../../workbench/services/editor/common/editorService.js";
import { Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { Menus } from "../../../../browser/menus.js";
import { IAgentWorkbenchLayoutService } from "../../../../browser/workbench.js";
import { HasDockedDetailsContext, SinglePaneLayoutEnabledContext } from "../../../../common/contextkeys.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionChangesService } from "../../../changes/browser/sessionChangesService.js";
import { DetailPanelTarget } from "./singlePaneDetailPanelCoordinator.js";
import { isChangesEditorInput, isFileEditorInput, isMainPartEmpty } from "./singlePaneSharedHelpers.js";
import { SinglePaneLayoutStrategy } from "./singlePaneLayoutStrategy.js";
import { SessionVisibilityProfile } from "./singlePaneVisibilityProfileStore.js";
const TOGGLE_DETAILS_COMMAND_ID = "workbench.action.agentSessions.toggleDetails";
const singlePaneHeaderToggleDetailsOrder = 10;
let SinglePaneExistingSessionStrategy = class extends SinglePaneLayoutStrategy {
  constructor(ctx, _visibilityStore, _detailPanel, _layoutService, _sessionsService, _editorService, _editorGroupsService, _sessionChangesService) {
    super(ctx);
    this._visibilityStore = _visibilityStore;
    this._detailPanel = _detailPanel;
    this._layoutService = _layoutService;
    this._sessionsService = _sessionsService;
    this._editorService = _editorService;
    this._editorGroupsService = _editorGroupsService;
    this._sessionChangesService = _sessionChangesService;
    this._detailHiddenTransiently = false;
    this._changingDetailTransiently = false;
    this._registerVisibility();
    this._registerEmptyGroupClose();
    this._registerDetailPanel();
    this._register(this._registerToggleDetailsAction());
  }
  /** Toggle the detail panel and return whether it is now visible. */
  toggleDetails() {
    const nowVisible = !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
    this._layoutService.setPartHidden(!nowVisible, Parts.AUXILIARYBAR_PART);
    return nowVisible;
  }
  _registerEmptyGroupClose() {
    this._register(this._editorService.onDidCloseEditor(() => {
      const session = this._sessionsService.activeSession.get();
      if (this._ctx.isRestoringSessionLayout || this._ctx.multipleSessionsVisibleObs.get() || this._layoutService.isEditorPartAutoVisibilitySuppressed() || !session || session.isQuickChat?.get() || !session.isCreated.get() || !session.workspace.get() || !isMainPartEmpty(this._editorGroupsService)) {
        return;
      }
      this._layoutService.hideSidePane();
    }));
  }
  /**
   * Constructs and owns the shared managed-tabs coordinator, and registers this strategy's
   * "activate Changes on submit" supplement to it. Deferred to `LifecyclePhase.Restored` by
   * the controller (mirrors the original managed-tabs/editor-collapse strategies' timing) so
   * the reconcile pipeline only starts once the workbench's restored editor group exists.
   */
  registerManagedTabs(managedTabs) {
    this._managedTabs = managedTabs;
    this._registerManagedTabsSupplement();
  }
  get managedTabs() {
    if (!this._managedTabs) {
      throw new Error("SinglePaneExistingSessionStrategy: managed tabs accessed before registerManagedTabs()");
    }
    return this._managedTabs;
  }
  // --- Side-pane visibility ------------------------------------------------------------
  _registerVisibility() {
    let initialized = false;
    let wasExistingActive = false;
    let wasQuickChatActive = false;
    let previousIsCreated;
    let previousSession;
    this._register(autorun((reader) => {
      const multipleSessionsVisible = this._ctx.multipleSessionsVisibleObs.read(reader);
      if (multipleSessionsVisible) {
        const activeSession2 = this._sessionsService.activeSession.read(reader);
        const isQuickChat2 = activeSession2?.isQuickChat?.read(reader) ?? false;
        const workspace = activeSession2?.workspace.read(reader);
        const isCreated2 = activeSession2?.isCreated.read(reader);
        if (activeSession2 && !isQuickChat2 && workspace && isCreated2 === true) {
          this._ctx.withSessionLayoutRestore(() => this._reveal(this._visibilityStore.get(SessionVisibilityProfile.Existing)));
        }
        wasExistingActive = false;
        return;
      }
      const activeSession = this._sessionsService.activeSession.read(reader);
      if (!activeSession) {
        return;
      }
      const isQuickChat = activeSession.isQuickChat?.read(reader) ?? false;
      if (isQuickChat) {
        wasQuickChatActive = true;
        wasExistingActive = false;
        return;
      }
      const isCreated = activeSession.isCreated.read(reader);
      const sessionChanged = previousSession !== void 0 && !isEqual(previousSession.resource, activeSession.resource);
      const isSubmit = !wasQuickChatActive && previousIsCreated === false && isCreated && (previousSession === activeSession || previousSession?.isCreated.read(void 0) === true);
      if (isSubmit) {
        this._captureExistingProfile();
      }
      if (isCreated) {
        if (!isSubmit && (!initialized || !wasExistingActive || wasQuickChatActive || sessionChanged)) {
          this._ctx.withSessionLayoutRestore(() => this._apply(this._visibilityStore.get(SessionVisibilityProfile.Existing)));
        }
        wasExistingActive = true;
      } else {
        wasExistingActive = false;
      }
      previousIsCreated = isCreated;
      previousSession = activeSession;
      wasQuickChatActive = false;
      initialized = true;
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId !== Parts.EDITOR_PART && e.partId !== Parts.AUXILIARYBAR_PART) {
        return;
      }
      if (e.partId === Parts.AUXILIARYBAR_PART && this._changingDetailTransiently) {
        return;
      }
      if (this._ctx.isRestoringSessionLayout) {
        return;
      }
      if (this._ctx.multipleSessionsVisibleObs.get()) {
        return;
      }
      const activeSession = this._sessionsService.activeSession.get();
      if (!activeSession || activeSession.isQuickChat?.get() || !activeSession.isCreated.get() || this._layoutService.isEditorMaximized() || this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART)) {
        return;
      }
      this._visibilityStore.set(SessionVisibilityProfile.Existing, {
        editorVisible: this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
        auxiliaryBarVisible: this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)
      });
    }));
  }
  /** On submit, seed the Existing profile from the current on-screen composition so the view never jumps. */
  _captureExistingProfile() {
    const state = {
      editorVisible: this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow),
      auxiliaryBarVisible: this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)
    };
    this._visibilityStore.set(SessionVisibilityProfile.Existing, state);
  }
  _apply(state) {
    const suppression = this._layoutService.suppressEditorPartAutoVisibility();
    try {
      if (!state.editorVisible && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
      }
      if (!state.auxiliaryBarVisible && this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
        this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
      }
      if (state.auxiliaryBarVisible && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
        this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
      }
      if (state.editorVisible && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
      }
    } finally {
      suppression.dispose();
    }
  }
  _reveal(state) {
    const suppression = this._layoutService.suppressEditorPartAutoVisibility();
    try {
      if (state.auxiliaryBarVisible && !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
        this._layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
      }
      if (state.editorVisible && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
      }
    } finally {
      suppression.dispose();
    }
  }
  // --- Detail panel ----------------------------------------------------------------------
  _registerDetailPanel() {
    const activeEditorObs = observableFromEvent(this, this._editorService.onDidActiveEditorChange, () => this._editorService.activeEditor);
    const mainPartEmptyObs = observableFromEvent(this, Event.any(this._editorService.onDidActiveEditorChange, this._editorService.onDidEditorsChange, this._editorService.onDidCloseEditor), () => isMainPartEmpty(this._editorGroupsService));
    const editorPartVisibleObs = observableFromEvent(this, this._layoutService.onDidChangePartVisibility, () => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow));
    const editorMaximizedObs = observableFromEvent(this, this._layoutService.onDidChangeEditorMaximized, () => this._layoutService.isEditorMaximized());
    let initialized = false;
    let wasExistingActive = false;
    let activeSessionKey;
    let pendingSessionKey;
    let pendingOutgoingEditor;
    const sync = (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      if (!activeSession || (activeSession.isQuickChat?.read(reader) ?? false) || !activeSession.workspace.read(reader) || !activeSession.isCreated.read(reader)) {
        wasExistingActive = false;
        return;
      }
      const sessionKey = activeSession.resource.toString();
      const sessionChanged = activeSessionKey !== void 0 && activeSessionKey !== sessionKey;
      if (!wasExistingActive || sessionChanged) {
        activeSessionKey = sessionKey;
        wasExistingActive = true;
        if (initialized) {
          pendingSessionKey = sessionKey;
          pendingOutgoingEditor = this._editorService.activeEditor;
        }
        initialized = true;
      }
      const activeEditor = activeEditorObs.read(reader);
      const mainPartEmpty = mainPartEmptyObs.read(reader);
      const editorMaximized = editorMaximizedObs.read(reader);
      const editorPartVisible = editorPartVisibleObs.read(reader);
      if (pendingSessionKey && activeEditor && activeEditor !== pendingOutgoingEditor) {
        pendingSessionKey = void 0;
        pendingOutgoingEditor = void 0;
      }
      if (pendingSessionKey) {
        return;
      }
      const target = this._computeTarget(activeEditor, mainPartEmpty, editorMaximized, editorPartVisible);
      const revealOnly = this._ctx.multipleSessionsVisibleObs.read(reader);
      this._syncDetailVisibility(target, revealOnly);
      this._detailPanel.sync(target);
    };
    this._register(autorun(sync));
    this._register(this._ctx.onDidEndSessionLayoutRestore(() => {
      const activeSession = this._sessionsService.activeSession.get();
      if (!activeSession || activeSession.resource.toString() !== pendingSessionKey) {
        return;
      }
      pendingSessionKey = void 0;
      pendingOutgoingEditor = void 0;
      sync(void 0);
    }));
    this._register(this._layoutService.onDidChangePartVisibility((event) => {
      if (event.partId === Parts.AUXILIARYBAR_PART && event.source !== "resize") {
        this._detailHiddenTransiently = false;
      }
    }));
  }
  _syncDetailVisibility(target, revealOnly) {
    if (this._ctx.isRestoringSessionLayout || target === DetailPanelTarget.Preserve) {
      return;
    }
    const detailVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
    if (target === DetailPanelTarget.Hidden || target === DetailPanelTarget.BrowserHidden) {
      if (!revealOnly && detailVisible) {
        this._detailHiddenTransiently = true;
        this._setDetailHiddenTransiently(true);
      }
      return;
    }
    if (!this._detailHiddenTransiently || revealOnly || !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
      return;
    }
    this._detailHiddenTransiently = false;
    this._setDetailHiddenTransiently(false);
  }
  _setDetailHiddenTransiently(hidden) {
    this._changingDetailTransiently = true;
    try {
      this._layoutService.setAuxiliaryBarHiddenForResize(hidden);
    } finally {
      this._changingDetailTransiently = false;
    }
  }
  _computeTarget(activeEditor, mainPartEmpty, editorMaximized, editorPartVisible) {
    if (mainPartEmpty) {
      return this._ctx.isRestoringSessionLayout ? DetailPanelTarget.Preserve : DetailPanelTarget.Hidden;
    }
    if (editorMaximized) {
      return DetailPanelTarget.Changes;
    }
    if (!activeEditor) {
      return DetailPanelTarget.Changes;
    }
    if (activeEditor instanceof BrowserEditorInput) {
      if (editorPartVisible) {
        return DetailPanelTarget.BrowserHidden;
      }
      return DetailPanelTarget.Changes;
    }
    if (isChangesEditorInput(activeEditor, this._sessionChangesService)) {
      return DetailPanelTarget.ChangesForced;
    }
    if (isFileEditorInput(activeEditor)) {
      return DetailPanelTarget.FilesForced;
    }
    return DetailPanelTarget.Preserve;
  }
  // --- Managed-tabs supplement (submit "activate Changes" nuance) ------------------------
  _registerManagedTabsSupplement() {
    let previousSessionKey;
    let previousIsCreated;
    let previousSession;
    let changesActivationPendingForSession;
    this._register(autorun((reader) => {
      const session = this._sessionsService.activeSession.read(reader);
      const isQuickChat = session?.isQuickChat?.read(reader) ?? false;
      const isCreated = session && !isQuickChat ? session.isCreated.read(reader) : false;
      const sessionKey = session?.resource.toString();
      const isSubmit = !isQuickChat && previousIsCreated === false && isCreated && (previousSession === session || previousSession?.isCreated.read(void 0) === true);
      if (isSubmit) {
        changesActivationPendingForSession = sessionKey;
      } else if (sessionKey !== previousSessionKey) {
        changesActivationPendingForSession = void 0;
      }
      if (session && !isQuickChat && isCreated) {
        const target = this.managedTabs.readTarget(reader);
        const hasChanges = (session.changes.read(reader).length ?? 0) > 0;
        const ensureChangesActive = changesActivationPendingForSession === sessionKey && hasChanges;
        if (ensureChangesActive) {
          changesActivationPendingForSession = void 0;
        }
        if (isSubmit || ensureChangesActive) {
          this.managedTabs.queueReconcile(target, { openDefaultsIfEmpty: isSubmit, ensureChangesActive });
        }
      }
      previousIsCreated = session && !isQuickChat ? isCreated : void 0;
      previousSession = session;
      previousSessionKey = sessionKey;
    }));
  }
  _registerToggleDetailsAction() {
    const that = this;
    return registerAction2(class extends Action2 {
      constructor() {
        super({
          id: TOGGLE_DETAILS_COMMAND_ID,
          title: localize2("toggleDetails", "Toggle Details"),
          icon: Codicon.listSelection,
          f1: false,
          toggled: AuxiliaryBarVisibleContext,
          keybinding: {
            weight: KeybindingWeight.SessionsContrib,
            primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL,
            when: ContextKeyExpr.and(
              IsSessionsWindowContext,
              IsAuxiliaryWindowContext.toNegated(),
              SinglePaneLayoutEnabledContext
            )
          },
          menu: {
            id: Menus.SessionsEditorHeaderLayout,
            group: "navigation",
            order: singlePaneHeaderToggleDetailsOrder,
            // Not every tab type has a detail panel to show/hide (e.g. browser and
            // search tabs), so only surface the toggle for tab types that do.
            when: ContextKeyExpr.and(
              IsSessionsWindowContext,
              IsAuxiliaryWindowContext.toNegated(),
              IsTopRightEditorGroupContext,
              SinglePaneLayoutEnabledContext,
              MainEditorAreaVisibleContext,
              HasDockedDetailsContext
            )
          }
        });
      }
      run() {
        that.toggleDetails();
      }
    });
  }
};
SinglePaneExistingSessionStrategy = __decorateClass([
  __decorateParam(3, IAgentWorkbenchLayoutService),
  __decorateParam(4, ISessionsService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IEditorGroupsService),
  __decorateParam(7, ISessionChangesService)
], SinglePaneExistingSessionStrategy);
export {
  SinglePaneExistingSessionStrategy,
  TOGGLE_DETAILS_COMMAND_ID
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcbGF5b3V0XFxicm93c2VyXFxzaW5nbGVQYW5lXFxzaW5nbGVQYW5lRXhpc3RpbmdTZXNzaW9uU3RyYXRlZ3kudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBdXhpbGlhcnlCYXJWaXNpYmxlQ29udGV4dCwgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dCwgTWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9icm93c2VyVmlldy9jb21tb24vYnJvd3NlckVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcbmltcG9ydCB7IEhhc0RvY2tlZERldGFpbHNDb250ZXh0LCBTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhbmdlcy9icm93c2VyL3Nlc3Npb25DaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEZXRhaWxQYW5lbFRhcmdldCwgU2luZ2xlUGFuZURldGFpbFBhbmVsQ29vcmRpbmF0b3IgfSBmcm9tICcuL3NpbmdsZVBhbmVEZXRhaWxQYW5lbENvb3JkaW5hdG9yLmpzJztcbmltcG9ydCB7IFNpbmdsZVBhbmVEb2NrZWRUYWJzQ29vcmRpbmF0b3IgfSBmcm9tICcuL3NpbmdsZVBhbmVEb2NrZWRUYWJzQ29vcmRpbmF0b3IuanMnO1xuaW1wb3J0IHsgaXNDaGFuZ2VzRWRpdG9ySW5wdXQsIGlzRmlsZUVkaXRvcklucHV0LCBpc01haW5QYXJ0RW1wdHkgfSBmcm9tICcuL3NpbmdsZVBhbmVTaGFyZWRIZWxwZXJzLmpzJztcbmltcG9ydCB7IElTaW5nbGVQYW5lTGF5b3V0Q29udGV4dCwgU2luZ2xlUGFuZUxheW91dFN0cmF0ZWd5IH0gZnJvbSAnLi9zaW5nbGVQYW5lTGF5b3V0U3RyYXRlZ3kuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblZpc2liaWxpdHlQcm9maWxlLCBTaW5nbGVQYW5lVmlzaWJpbGl0eVByb2ZpbGVTdG9yZSB9IGZyb20gJy4vc2luZ2xlUGFuZVZpc2liaWxpdHlQcm9maWxlU3RvcmUuanMnO1xuXG4vKiogQ29tbWFuZCB0aGF0IHRvZ2dsZXMgdGhlIHNpbmdsZS1wYW5lIGRldGFpbCBwYW5lbCAoYXV4aWxpYXJ5IGJhcikgZnJvbSB0aGUgZWRpdG9yIGhlYWRlci4gKi9cbmV4cG9ydCBjb25zdCBUT0dHTEVfREVUQUlMU19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy50b2dnbGVEZXRhaWxzJztcbmNvbnN0IHNpbmdsZVBhbmVIZWFkZXJUb2dnbGVEZXRhaWxzT3JkZXIgPSAxMDtcblxuLyoqXG4gKiBCZWhhdmlvdXIgZm9yIHRoZSAqKkV4aXN0aW5nIFNlc3Npb24qKiBsaWZlY3ljbGUgc3RhZ2UgXHUyMDE0IGEgY3JlYXRlZCwgd29ya3NwYWNlLWJhY2tlZFxuICogc2Vzc2lvbjpcbiAqICAtIHRoZSBzaGFyZWQgRXhpc3RpbmcgU2Vzc2lvbiBFZGl0b3IgdmlzaWJpbGl0eSBwcm9maWxlLCBhcHBsaWVkIG9uIGVudHJ5IGFuZCBjYXB0dXJlZFxuICogICAgd2hpbGUgdGhlIHVzZXIgYWRqdXN0cyBpdDtcbiAqICAtIGRldGVjdGluZyBhIE5ld1x1MjE5MkV4aXN0aW5nIHN1Ym1pdCBhbmQsIGF0IHRoYXQgbW9tZW50LCBjYXB0dXJpbmcgdGhlICpjdXJyZW50KiBvbi1zY3JlZW5cbiAqICAgIGNvbXBvc2l0aW9uIGludG8gKipib3RoKiogdGhlIE5ldyBhbmQgRXhpc3RpbmcgcHJvZmlsZXMgc28gdGhlIHZpZXcgbmV2ZXIganVtcHM7XG4gKiAgLSB0aGUgZGV0YWlsLXBhbmVsIG1hcHBpbmcgd2hpbGUgYW4gRXhpc3RpbmcgU2Vzc2lvbiBpcyBhY3RpdmU7XG4gKiAgLSB0aGUgVG9nZ2xlIERldGFpbHMgY29tbWFuZCAoa2luZC1hZ25vc3RpYyBcdTIwMTQgaXQgYWxzbyBhcHBsaWVzIHdoaWxlIGEgTmV3IFNlc3Npb24ncyBkb2NrZWRcbiAqICAgIHRhYnMgYXJlIHZpc2libGUgXHUyMDE0IGhvc3RlZCBoZXJlIHNpbmNlIEV4aXN0aW5nIGlzIHRoZSBzdGVhZHktc3RhdGUgZGVmYXVsdCk7XG4gKiAgLSBvd25pbmcgKGNvbnN0cnVjdGluZy9kaXNwb3NpbmcpIHRoZSBzaGFyZWQge0BsaW5rIFNpbmdsZVBhbmVEb2NrZWRUYWJzQ29vcmRpbmF0b3J9LCB3aG9zZVxuICogICAgbWFuYWdlZC10YWJzIHJlY29uY2lsZSBwaXBlbGluZSBhbmQgZGV0YWlsLW9ubHkgZWRpdG9yLWFyZWEgY29sbGFwc2UgbXVzdCBzdGF5XG4gKiAgICBzaW5nbGUtaW5zdGFuY2UgYWNyb3NzIHRoZSBOZXdcdTIxOTJFeGlzdGluZyBzdWJtaXQgdHJhbnNpdGlvbiBcdTIwMTQgc2VlIGl0cyBkb2MgY29tbWVudC5cbiAqL1xuZXhwb3J0IGNsYXNzIFNpbmdsZVBhbmVFeGlzdGluZ1Nlc3Npb25TdHJhdGVneSBleHRlbmRzIFNpbmdsZVBhbmVMYXlvdXRTdHJhdGVneSB7XG5cblx0cHJpdmF0ZSBfbWFuYWdlZFRhYnM6IFNpbmdsZVBhbmVEb2NrZWRUYWJzQ29vcmRpbmF0b3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RldGFpbEhpZGRlblRyYW5zaWVudGx5ID0gZmFsc2U7XG5cdHByaXZhdGUgX2NoYW5naW5nRGV0YWlsVHJhbnNpZW50bHkgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjdHg6IElTaW5nbGVQYW5lTGF5b3V0Q29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmlsaXR5U3RvcmU6IFNpbmdsZVBhbmVWaXNpYmlsaXR5UHJvZmlsZVN0b3JlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RldGFpbFBhbmVsOiBTaW5nbGVQYW5lRGV0YWlsUGFuZWxDb29yZGluYXRvcixcblx0XHRASUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25DaGFuZ2VzU2VydmljZTogSVNlc3Npb25DaGFuZ2VzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY3R4KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyVmlzaWJpbGl0eSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyRW1wdHlHcm91cENsb3NlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJEZXRhaWxQYW5lbCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZ2lzdGVyVG9nZ2xlRGV0YWlsc0FjdGlvbigpKTtcblx0fVxuXG5cdC8qKiBUb2dnbGUgdGhlIGRldGFpbCBwYW5lbCBhbmQgcmV0dXJuIHdoZXRoZXIgaXQgaXMgbm93IHZpc2libGUuICovXG5cdHRvZ2dsZURldGFpbHMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgbm93VmlzaWJsZSA9ICF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKCFub3dWaXNpYmxlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0cmV0dXJuIG5vd1Zpc2libGU7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckVtcHR5R3JvdXBDbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQ2xvc2VFZGl0b3IoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKHRoaXMuX2N0eC5pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXRcblx0XHRcdFx0fHwgdGhpcy5fY3R4Lm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzLmdldCgpXG5cdFx0XHRcdHx8IHRoaXMuX2xheW91dFNlcnZpY2UuaXNFZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2VkKClcblx0XHRcdFx0fHwgIXNlc3Npb25cblx0XHRcdFx0fHwgc2Vzc2lvbi5pc1F1aWNrQ2hhdD8uZ2V0KClcblx0XHRcdFx0fHwgIXNlc3Npb24uaXNDcmVhdGVkLmdldCgpXG5cdFx0XHRcdHx8ICFzZXNzaW9uLndvcmtzcGFjZS5nZXQoKVxuXHRcdFx0XHR8fCAhaXNNYWluUGFydEVtcHR5KHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5oaWRlU2lkZVBhbmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29uc3RydWN0cyBhbmQgb3ducyB0aGUgc2hhcmVkIG1hbmFnZWQtdGFicyBjb29yZGluYXRvciwgYW5kIHJlZ2lzdGVycyB0aGlzIHN0cmF0ZWd5J3Ncblx0ICogXCJhY3RpdmF0ZSBDaGFuZ2VzIG9uIHN1Ym1pdFwiIHN1cHBsZW1lbnQgdG8gaXQuIERlZmVycmVkIHRvIGBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZGAgYnlcblx0ICogdGhlIGNvbnRyb2xsZXIgKG1pcnJvcnMgdGhlIG9yaWdpbmFsIG1hbmFnZWQtdGFicy9lZGl0b3ItY29sbGFwc2Ugc3RyYXRlZ2llcycgdGltaW5nKSBzb1xuXHQgKiB0aGUgcmVjb25jaWxlIHBpcGVsaW5lIG9ubHkgc3RhcnRzIG9uY2UgdGhlIHdvcmtiZW5jaCdzIHJlc3RvcmVkIGVkaXRvciBncm91cCBleGlzdHMuXG5cdCAqL1xuXHRyZWdpc3Rlck1hbmFnZWRUYWJzKG1hbmFnZWRUYWJzOiBTaW5nbGVQYW5lRG9ja2VkVGFic0Nvb3JkaW5hdG9yKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFuYWdlZFRhYnMgPSBtYW5hZ2VkVGFicztcblx0XHR0aGlzLl9yZWdpc3Rlck1hbmFnZWRUYWJzU3VwcGxlbWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgbWFuYWdlZFRhYnMoKTogU2luZ2xlUGFuZURvY2tlZFRhYnNDb29yZGluYXRvciB7XG5cdFx0aWYgKCF0aGlzLl9tYW5hZ2VkVGFicykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTaW5nbGVQYW5lRXhpc3RpbmdTZXNzaW9uU3RyYXRlZ3k6IG1hbmFnZWQgdGFicyBhY2Nlc3NlZCBiZWZvcmUgcmVnaXN0ZXJNYW5hZ2VkVGFicygpJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tYW5hZ2VkVGFicztcblx0fVxuXG5cdC8vIC0tLSBTaWRlLXBhbmUgdmlzaWJpbGl0eSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9yZWdpc3RlclZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0bGV0IGluaXRpYWxpemVkID0gZmFsc2U7XG5cdFx0bGV0IHdhc0V4aXN0aW5nQWN0aXZlID0gZmFsc2U7XG5cdFx0bGV0IHdhc1F1aWNrQ2hhdEFjdGl2ZSA9IGZhbHNlO1xuXHRcdGxldCBwcmV2aW91c0lzQ3JlYXRlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJldmlvdXNTZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlID0gdGhpcy5fY3R4Lm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChtdWx0aXBsZVNlc3Npb25zVmlzaWJsZSkge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBpc1F1aWNrQ2hhdCA9IGFjdGl2ZVNlc3Npb24/LmlzUXVpY2tDaGF0Py5yZWFkKHJlYWRlcikgPz8gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGFjdGl2ZVNlc3Npb24/LndvcmtzcGFjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGlzQ3JlYXRlZCA9IGFjdGl2ZVNlc3Npb24/LmlzQ3JlYXRlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChhY3RpdmVTZXNzaW9uICYmICFpc1F1aWNrQ2hhdCAmJiB3b3Jrc3BhY2UgJiYgaXNDcmVhdGVkID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fY3R4LndpdGhTZXNzaW9uTGF5b3V0UmVzdG9yZSgoKSA9PiB0aGlzLl9yZXZlYWwodGhpcy5fdmlzaWJpbGl0eVN0b3JlLmdldChTZXNzaW9uVmlzaWJpbGl0eVByb2ZpbGUuRXhpc3RpbmcpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0d2FzRXhpc3RpbmdBY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNRdWlja0NoYXQgPSBhY3RpdmVTZXNzaW9uLmlzUXVpY2tDaGF0Py5yZWFkKHJlYWRlcikgPz8gZmFsc2U7XG5cdFx0XHRpZiAoaXNRdWlja0NoYXQpIHtcblx0XHRcdFx0d2FzUXVpY2tDaGF0QWN0aXZlID0gdHJ1ZTtcblx0XHRcdFx0d2FzRXhpc3RpbmdBY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0NyZWF0ZWQgPSBhY3RpdmVTZXNzaW9uLmlzQ3JlYXRlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ2hhbmdlZCA9IHByZXZpb3VzU2Vzc2lvbiAhPT0gdW5kZWZpbmVkICYmICFpc0VxdWFsKHByZXZpb3VzU2Vzc2lvbi5yZXNvdXJjZSwgYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBpc1N1Ym1pdCA9ICF3YXNRdWlja0NoYXRBY3RpdmUgJiYgcHJldmlvdXNJc0NyZWF0ZWQgPT09IGZhbHNlICYmIGlzQ3JlYXRlZFxuXHRcdFx0XHQmJiAocHJldmlvdXNTZXNzaW9uID09PSBhY3RpdmVTZXNzaW9uIHx8IHByZXZpb3VzU2Vzc2lvbj8uaXNDcmVhdGVkLnJlYWQodW5kZWZpbmVkKSA9PT0gdHJ1ZSk7XG5cdFx0XHRpZiAoaXNTdWJtaXQpIHtcblx0XHRcdFx0dGhpcy5fY2FwdHVyZUV4aXN0aW5nUHJvZmlsZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNDcmVhdGVkKSB7XG5cdFx0XHRcdGlmICghaXNTdWJtaXQgJiYgKCFpbml0aWFsaXplZCB8fCAhd2FzRXhpc3RpbmdBY3RpdmUgfHwgd2FzUXVpY2tDaGF0QWN0aXZlIHx8IHNlc3Npb25DaGFuZ2VkKSkge1xuXHRcdFx0XHRcdHRoaXMuX2N0eC53aXRoU2Vzc2lvbkxheW91dFJlc3RvcmUoKCkgPT4gdGhpcy5fYXBwbHkodGhpcy5fdmlzaWJpbGl0eVN0b3JlLmdldChTZXNzaW9uVmlzaWJpbGl0eVByb2ZpbGUuRXhpc3RpbmcpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0d2FzRXhpc3RpbmdBY3RpdmUgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0d2FzRXhpc3RpbmdBY3RpdmUgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cHJldmlvdXNJc0NyZWF0ZWQgPSBpc0NyZWF0ZWQ7XG5cdFx0XHRwcmV2aW91c1Nlc3Npb24gPSBhY3RpdmVTZXNzaW9uO1xuXHRcdFx0d2FzUXVpY2tDaGF0QWN0aXZlID0gZmFsc2U7XG5cdFx0XHRpbml0aWFsaXplZCA9IHRydWU7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0aWYgKGUucGFydElkICE9PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBlLnBhcnRJZCAhPT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUucGFydElkID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiB0aGlzLl9jaGFuZ2luZ0RldGFpbFRyYW5zaWVudGx5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jdHguaXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jdHgubXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnMuZ2V0KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uIHx8IGFjdGl2ZVNlc3Npb24uaXNRdWlja0NoYXQ/LmdldCgpIHx8ICFhY3RpdmVTZXNzaW9uLmlzQ3JlYXRlZC5nZXQoKVxuXHRcdFx0XHR8fCB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzRWRpdG9yTWF4aW1pemVkKCkgfHwgdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl92aXNpYmlsaXR5U3RvcmUuc2V0KFNlc3Npb25WaXNpYmlsaXR5UHJvZmlsZS5FeGlzdGluZywge1xuXHRcdFx0XHRlZGl0b3JWaXNpYmxlOiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdyksXG5cdFx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBPbiBzdWJtaXQsIHNlZWQgdGhlIEV4aXN0aW5nIHByb2ZpbGUgZnJvbSB0aGUgY3VycmVudCBvbi1zY3JlZW4gY29tcG9zaXRpb24gc28gdGhlIHZpZXcgbmV2ZXIganVtcHMuICovXG5cdHByaXZhdGUgX2NhcHR1cmVFeGlzdGluZ1Byb2ZpbGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdyksXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0fTtcblx0XHR0aGlzLl92aXNpYmlsaXR5U3RvcmUuc2V0KFNlc3Npb25WaXNpYmlsaXR5UHJvZmlsZS5FeGlzdGluZywgc3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHkoc3RhdGU6IHsgcmVhZG9ubHkgZWRpdG9yVmlzaWJsZTogYm9vbGVhbjsgcmVhZG9ubHkgYXV4aWxpYXJ5QmFyVmlzaWJsZTogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VwcHJlc3Npb24gPSB0aGlzLl9sYXlvdXRTZXJ2aWNlLnN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghc3RhdGUuZWRpdG9yVmlzaWJsZSAmJiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0XHRcdH1cblx0XHRcdGlmICghc3RhdGUuYXV4aWxpYXJ5QmFyVmlzaWJsZSAmJiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpIHtcblx0XHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZS5hdXhpbGlhcnlCYXJWaXNpYmxlICYmICF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpIHtcblx0XHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGUuZWRpdG9yVmlzaWJsZSAmJiAhdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdXBwcmVzc2lvbi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsKHN0YXRlOiB7IHJlYWRvbmx5IGVkaXRvclZpc2libGU6IGJvb2xlYW47IHJlYWRvbmx5IGF1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IHN1cHByZXNzaW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5zdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoc3RhdGUuYXV4aWxpYXJ5QmFyVmlzaWJsZSAmJiAhdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSB7XG5cdFx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXRlLmVkaXRvclZpc2libGUgJiYgIXRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSkge1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3VwcHJlc3Npb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBEZXRhaWwgcGFuZWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyRGV0YWlsUGFuZWwoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlLCAoKSA9PiB0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcik7XG5cdFx0Y29uc3QgbWFpblBhcnRFbXB0eU9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgRXZlbnQuYW55KHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsIHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRFZGl0b3JzQ2hhbmdlLCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQ2xvc2VFZGl0b3IpLCAoKSA9PiBpc01haW5QYXJ0RW1wdHkodGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZSkpO1xuXHRcdGNvbnN0IGVkaXRvclBhcnRWaXNpYmxlT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHksICgpID0+IHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSk7XG5cdFx0Y29uc3QgZWRpdG9yTWF4aW1pemVkT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkLCAoKSA9PiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzRWRpdG9yTWF4aW1pemVkKCkpO1xuXHRcdGxldCBpbml0aWFsaXplZCA9IGZhbHNlO1xuXHRcdGxldCB3YXNFeGlzdGluZ0FjdGl2ZSA9IGZhbHNlO1xuXHRcdGxldCBhY3RpdmVTZXNzaW9uS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHBlbmRpbmdTZXNzaW9uS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHBlbmRpbmdPdXRnb2luZ0VkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBzeW5jID0gKHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghYWN0aXZlU2Vzc2lvblxuXHRcdFx0XHR8fCAoYWN0aXZlU2Vzc2lvbi5pc1F1aWNrQ2hhdD8ucmVhZChyZWFkZXIpID8/IGZhbHNlKVxuXHRcdFx0XHR8fCAhYWN0aXZlU2Vzc2lvbi53b3Jrc3BhY2UucmVhZChyZWFkZXIpXG5cdFx0XHRcdHx8ICFhY3RpdmVTZXNzaW9uLmlzQ3JlYXRlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0d2FzRXhpc3RpbmdBY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkNoYW5nZWQgPSBhY3RpdmVTZXNzaW9uS2V5ICE9PSB1bmRlZmluZWQgJiYgYWN0aXZlU2Vzc2lvbktleSAhPT0gc2Vzc2lvbktleTtcblx0XHRcdGlmICghd2FzRXhpc3RpbmdBY3RpdmUgfHwgc2Vzc2lvbkNoYW5nZWQpIHtcblx0XHRcdFx0YWN0aXZlU2Vzc2lvbktleSA9IHNlc3Npb25LZXk7XG5cdFx0XHRcdHdhc0V4aXN0aW5nQWN0aXZlID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGluaXRpYWxpemVkKSB7XG5cdFx0XHRcdFx0cGVuZGluZ1Nlc3Npb25LZXkgPSBzZXNzaW9uS2V5O1xuXHRcdFx0XHRcdHBlbmRpbmdPdXRnb2luZ0VkaXRvciA9IHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gYWN0aXZlRWRpdG9yT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1haW5QYXJ0RW1wdHkgPSBtYWluUGFydEVtcHR5T2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVkaXRvck1heGltaXplZCA9IGVkaXRvck1heGltaXplZE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBlZGl0b3JQYXJ0VmlzaWJsZSA9IGVkaXRvclBhcnRWaXNpYmxlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChwZW5kaW5nU2Vzc2lvbktleSAmJiBhY3RpdmVFZGl0b3IgJiYgYWN0aXZlRWRpdG9yICE9PSBwZW5kaW5nT3V0Z29pbmdFZGl0b3IpIHtcblx0XHRcdFx0cGVuZGluZ1Nlc3Npb25LZXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHBlbmRpbmdPdXRnb2luZ0VkaXRvciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChwZW5kaW5nU2Vzc2lvbktleSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2NvbXB1dGVUYXJnZXQoYWN0aXZlRWRpdG9yLCBtYWluUGFydEVtcHR5LCBlZGl0b3JNYXhpbWl6ZWQsIGVkaXRvclBhcnRWaXNpYmxlKTtcblx0XHRcdGNvbnN0IHJldmVhbE9ubHkgPSB0aGlzLl9jdHgubXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fc3luY0RldGFpbFZpc2liaWxpdHkodGFyZ2V0LCByZXZlYWxPbmx5KTtcblx0XHRcdHRoaXMuX2RldGFpbFBhbmVsLnN5bmModGFyZ2V0KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihzeW5jKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY3R4Lm9uRGlkRW5kU2Vzc2lvbkxheW91dFJlc3RvcmUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uIHx8IGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gcGVuZGluZ1Nlc3Npb25LZXkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cGVuZGluZ1Nlc3Npb25LZXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRwZW5kaW5nT3V0Z29pbmdFZGl0b3IgPSB1bmRlZmluZWQ7XG5cdFx0XHRzeW5jKHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQucGFydElkID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBldmVudC5zb3VyY2UgIT09ICdyZXNpemUnKSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbEhpZGRlblRyYW5zaWVudGx5ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3luY0RldGFpbFZpc2liaWxpdHkodGFyZ2V0OiBEZXRhaWxQYW5lbFRhcmdldCwgcmV2ZWFsT25seTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdHguaXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0IHx8IHRhcmdldCA9PT0gRGV0YWlsUGFuZWxUYXJnZXQuUHJlc2VydmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZXRhaWxWaXNpYmxlID0gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGlmICh0YXJnZXQgPT09IERldGFpbFBhbmVsVGFyZ2V0LkhpZGRlbiB8fCB0YXJnZXQgPT09IERldGFpbFBhbmVsVGFyZ2V0LkJyb3dzZXJIaWRkZW4pIHtcblx0XHRcdGlmICghcmV2ZWFsT25seSAmJiBkZXRhaWxWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbEhpZGRlblRyYW5zaWVudGx5ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fc2V0RGV0YWlsSGlkZGVuVHJhbnNpZW50bHkodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9kZXRhaWxIaWRkZW5UcmFuc2llbnRseSB8fCByZXZlYWxPbmx5IHx8ICF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGV0YWlsSGlkZGVuVHJhbnNpZW50bHkgPSBmYWxzZTtcblx0XHR0aGlzLl9zZXREZXRhaWxIaWRkZW5UcmFuc2llbnRseShmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXREZXRhaWxIaWRkZW5UcmFuc2llbnRseShoaWRkZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jaGFuZ2luZ0RldGFpbFRyYW5zaWVudGx5ID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRBdXhpbGlhcnlCYXJIaWRkZW5Gb3JSZXNpemUoaGlkZGVuKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fY2hhbmdpbmdEZXRhaWxUcmFuc2llbnRseSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVUYXJnZXQoYWN0aXZlRWRpdG9yOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCwgbWFpblBhcnRFbXB0eTogYm9vbGVhbiwgZWRpdG9yTWF4aW1pemVkOiBib29sZWFuLCBlZGl0b3JQYXJ0VmlzaWJsZTogYm9vbGVhbik6IERldGFpbFBhbmVsVGFyZ2V0IHtcblx0XHQvLyBGb3IgYSBjcmVhdGVkIHNlc3Npb24gYW4gZW1wdHkgZWRpdG9yIGdyb3VwIG1lYW5zIHRoZSB3aG9sZSBzaWRlIHBhbmUgd2FzIGNsb3NlZCwgc29cblx0XHQvLyBoaWRlIHRoZSBkZXRhaWwuIER1cmluZyBhIHNlc3Npb24tc3dpdGNoIC8gc3VibWl0IHJlc3RvcmUgdGhlIHdvcmtpbmctc2V0IGFwcGx5XG5cdFx0Ly8gdHJhbnNpZW50bHkgZW1wdGllcyB0aGUgZ3JvdXAgYmVmb3JlIHRoZSBtYW5hZ2VkIENoYW5nZXMvRmlsZXMgdGFicyBhcmUgcmUtZW5zdXJlZCxcblx0XHQvLyBzbyBsZWF2ZSBpdCBhcy1pcyAoUHJlc2VydmUpIGluc3RlYWQgXHUyMDE0IHRoZSBkZXRhaWwgdGhlbiBmb2xsb3dzIHRoZSBhY3RpdmUgZWRpdG9yIG9uY2Vcblx0XHQvLyB0aGUgbWFuYWdlZCB0YWJzIHNldHRsZS5cblx0XHRpZiAobWFpblBhcnRFbXB0eSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2N0eC5pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXQgPyBEZXRhaWxQYW5lbFRhcmdldC5QcmVzZXJ2ZSA6IERldGFpbFBhbmVsVGFyZ2V0LkhpZGRlbjtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yTWF4aW1pemVkKSB7XG5cdFx0XHRyZXR1cm4gRGV0YWlsUGFuZWxUYXJnZXQuQ2hhbmdlcztcblx0XHR9XG5cblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuIERldGFpbFBhbmVsVGFyZ2V0LkNoYW5nZXM7XG5cdFx0fVxuXG5cdFx0aWYgKGFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCkge1xuXHRcdFx0Ly8gQnJvd3NlciBoYXMgbm8gZGV0YWlsIG9mIGl0cyBvd24sIHNvIGl0IG9ubHkgaGlkZXMgdGhlIHBhbmVsIHdoaWxlIHRoZSBlZGl0b3Jcblx0XHRcdC8vIGFyZWEgaXMgdmlzaWJsZTsgb25jZSBoaWRkZW4sIGZhbGwgYmFjayB0byBDaGFuZ2VzIGluc3RlYWQgb2YgbGVhdmluZyBpdCBibGFuay5cblx0XHRcdGlmIChlZGl0b3JQYXJ0VmlzaWJsZSkge1xuXHRcdFx0XHRyZXR1cm4gRGV0YWlsUGFuZWxUYXJnZXQuQnJvd3NlckhpZGRlbjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBEZXRhaWxQYW5lbFRhcmdldC5DaGFuZ2VzO1xuXHRcdH1cblxuXHRcdGlmIChpc0NoYW5nZXNFZGl0b3JJbnB1dChhY3RpdmVFZGl0b3IsIHRoaXMuX3Nlc3Npb25DaGFuZ2VzU2VydmljZSkpIHtcblx0XHRcdHJldHVybiBEZXRhaWxQYW5lbFRhcmdldC5DaGFuZ2VzRm9yY2VkO1xuXHRcdH1cblxuXHRcdGlmIChpc0ZpbGVFZGl0b3JJbnB1dChhY3RpdmVFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gRGV0YWlsUGFuZWxUYXJnZXQuRmlsZXNGb3JjZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIERldGFpbFBhbmVsVGFyZ2V0LlByZXNlcnZlO1xuXHR9XG5cblx0Ly8gLS0tIE1hbmFnZWQtdGFicyBzdXBwbGVtZW50IChzdWJtaXQgXCJhY3RpdmF0ZSBDaGFuZ2VzXCIgbnVhbmNlKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck1hbmFnZWRUYWJzU3VwcGxlbWVudCgpOiB2b2lkIHtcblx0XHRsZXQgcHJldmlvdXNTZXNzaW9uS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHByZXZpb3VzSXNDcmVhdGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcmV2aW91c1Nlc3Npb246IElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjaGFuZ2VzQWN0aXZhdGlvblBlbmRpbmdGb3JTZXNzaW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNRdWlja0NoYXQgPSBzZXNzaW9uPy5pc1F1aWNrQ2hhdD8ucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXHRcdFx0Y29uc3QgaXNDcmVhdGVkID0gc2Vzc2lvbiAmJiAhaXNRdWlja0NoYXQgPyBzZXNzaW9uLmlzQ3JlYXRlZC5yZWFkKHJlYWRlcikgOiBmYWxzZTtcblx0XHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uPy5yZXNvdXJjZS50b1N0cmluZygpO1xuXG5cdFx0XHRjb25zdCBpc1N1Ym1pdCA9ICFpc1F1aWNrQ2hhdCAmJiBwcmV2aW91c0lzQ3JlYXRlZCA9PT0gZmFsc2UgJiYgaXNDcmVhdGVkXG5cdFx0XHRcdCYmIChwcmV2aW91c1Nlc3Npb24gPT09IHNlc3Npb24gfHwgcHJldmlvdXNTZXNzaW9uPy5pc0NyZWF0ZWQucmVhZCh1bmRlZmluZWQpID09PSB0cnVlKTtcblx0XHRcdGlmIChpc1N1Ym1pdCkge1xuXHRcdFx0XHRjaGFuZ2VzQWN0aXZhdGlvblBlbmRpbmdGb3JTZXNzaW9uID0gc2Vzc2lvbktleTtcblx0XHRcdH0gZWxzZSBpZiAoc2Vzc2lvbktleSAhPT0gcHJldmlvdXNTZXNzaW9uS2V5KSB7XG5cdFx0XHRcdGNoYW5nZXNBY3RpdmF0aW9uUGVuZGluZ0ZvclNlc3Npb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9uICYmICFpc1F1aWNrQ2hhdCAmJiBpc0NyZWF0ZWQpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5tYW5hZ2VkVGFicy5yZWFkVGFyZ2V0KHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGhhc0NoYW5nZXMgPSAoc2Vzc2lvbi5jaGFuZ2VzLnJlYWQocmVhZGVyKS5sZW5ndGggPz8gMCkgPiAwO1xuXHRcdFx0XHRjb25zdCBlbnN1cmVDaGFuZ2VzQWN0aXZlID0gY2hhbmdlc0FjdGl2YXRpb25QZW5kaW5nRm9yU2Vzc2lvbiA9PT0gc2Vzc2lvbktleSAmJiBoYXNDaGFuZ2VzO1xuXHRcdFx0XHRpZiAoZW5zdXJlQ2hhbmdlc0FjdGl2ZSkge1xuXHRcdFx0XHRcdGNoYW5nZXNBY3RpdmF0aW9uUGVuZGluZ0ZvclNlc3Npb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGlzU3VibWl0IHx8IGVuc3VyZUNoYW5nZXNBY3RpdmUpIHtcblx0XHRcdFx0XHR0aGlzLm1hbmFnZWRUYWJzLnF1ZXVlUmVjb25jaWxlKHRhcmdldCwgeyBvcGVuRGVmYXVsdHNJZkVtcHR5OiBpc1N1Ym1pdCwgZW5zdXJlQ2hhbmdlc0FjdGl2ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRwcmV2aW91c0lzQ3JlYXRlZCA9IHNlc3Npb24gJiYgIWlzUXVpY2tDaGF0ID8gaXNDcmVhdGVkIDogdW5kZWZpbmVkO1xuXHRcdFx0cHJldmlvdXNTZXNzaW9uID0gc2Vzc2lvbjtcblx0XHRcdHByZXZpb3VzU2Vzc2lvbktleSA9IHNlc3Npb25LZXk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJUb2dnbGVEZXRhaWxzQWN0aW9uKCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBUT0dHTEVfREVUQUlMU19DT01NQU5EX0lELFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZURldGFpbHMnLCBcIlRvZ2dsZSBEZXRhaWxzXCIpLFxuXHRcdFx0XHRcdGljb246IENvZGljb24ubGlzdFNlbGVjdGlvbixcblx0XHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdFx0dG9nZ2xlZDogQXV4aWxpYXJ5QmFyVmlzaWJsZUNvbnRleHQsXG5cdFx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LlNlc3Npb25zQ29udHJpYixcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5TCxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsXG5cdFx0XHRcdFx0XHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRcdFx0U2luZ2xlUGFuZUxheW91dEVuYWJsZWRDb250ZXh0KVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyTGF5b3V0LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiBzaW5nbGVQYW5lSGVhZGVyVG9nZ2xlRGV0YWlsc09yZGVyLFxuXHRcdFx0XHRcdFx0Ly8gTm90IGV2ZXJ5IHRhYiB0eXBlIGhhcyBhIGRldGFpbCBwYW5lbCB0byBzaG93L2hpZGUgKGUuZy4gYnJvd3NlciBhbmRcblx0XHRcdFx0XHRcdC8vIHNlYXJjaCB0YWJzKSwgc28gb25seSBzdXJmYWNlIHRoZSB0b2dnbGUgZm9yIHRhYiB0eXBlcyB0aGF0IGRvLlxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdFx0XHRcdFx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0XHRJc1RvcFJpZ2h0RWRpdG9yR3JvdXBDb250ZXh0LFxuXHRcdFx0XHRcdFx0XHRTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZENvbnRleHQsXG5cdFx0XHRcdFx0XHRcdE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQsXG5cdFx0XHRcdFx0XHRcdEhhc0RvY2tlZERldGFpbHNDb250ZXh0KVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bigpOiB2b2lkIHtcblx0XHRcdFx0dGhhdC50b2dnbGVEZXRhaWxzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsZUFBZTtBQUV4QixTQUFTLFNBQWtCLDJCQUEyQjtBQUN0RCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDRCQUE0QiwwQkFBMEIseUJBQXlCLDhCQUE4QixvQ0FBb0M7QUFFMUosU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHlCQUF5QixzQ0FBc0M7QUFDeEUsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx5QkFBMkQ7QUFFcEUsU0FBUyxzQkFBc0IsbUJBQW1CLHVCQUF1QjtBQUN6RSxTQUFtQyxnQ0FBZ0M7QUFDbkUsU0FBUyxnQ0FBa0U7QUFHcEUsTUFBTSw0QkFBNEI7QUFDekMsTUFBTSxxQ0FBcUM7QUFnQnBDLElBQU0sb0NBQU4sY0FBZ0QseUJBQXlCO0FBQUEsRUFNL0UsWUFDQyxLQUNpQixrQkFDQSxjQUM4QixnQkFDWixrQkFD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
