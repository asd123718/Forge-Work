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
import { mainWindow } from "../../../../base/browser/window.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { isThenable, Sequencer } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { autorun, derived, derivedObservableWithCache, derivedOpts, observableFromEvent, runOnChange } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { URI } from "../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILifecycleService } from "../../../../workbench/services/lifecycle/common/lifecycle.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { AuxiliaryBarVisibleContext, IsAuxiliaryWindowContext, MainEditorAreaVisibleContext } from "../../../../workbench/common/contextkeys.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../workbench/common/views.js";
import { IEditorGroupsService } from "../../../../workbench/services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { IPaneCompositePartService } from "../../../../workbench/services/panecomposite/browser/panecomposite.js";
import { IViewsService } from "../../../../workbench/services/views/common/viewsService.js";
import { IAgentWorkbenchLayoutService } from "../../../browser/workbench.js";
import { Menus } from "../../../browser/menus.js";
import { SessionsWelcomeVisibleContext, CustomViewVisibleContext, IsQuickChatSessionContext, SinglePaneLayoutEnabledContext } from "../../../common/contextkeys.js";
import { logSidePanelToggle } from "../../../common/sessionsTelemetry.js";
import { ISessionChangesService } from "../../changes/browser/sessionChangesService.js";
import { IChangesViewService } from "../../changes/common/changesViewService.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
const secondarySidebarToggleClosedIcon = registerIcon("agent-secondary-sidebar-toggle-closed", Codicon.layoutSidebarRightOff, localize("agentSecondarySidebarToggleClosedIcon", "Icon for the sessions secondary sidebar when closed."));
const secondarySidebarToggleOpenIcon = registerIcon("agent-secondary-sidebar-toggle-open", Codicon.layoutSidebarRight, localize("agentSecondarySidebarToggleOpenIcon", "Icon for the sessions secondary sidebar when open."));
const SESSION_LAYOUT_STATE_KEY = "sessions.layoutState";
const WORKING_SETS_STORAGE_KEY = "sessions.workingSets";
let BaseLayoutController = class extends Disposable {
  constructor(_layoutService, _sessionManagementService, _sessionsService, _viewsService, _paneCompositePartService, _storageService, _configurationService, _editorService, _editorGroupsService, _workspaceContextService, _sessionChangesService, _changesViewService, _viewDescriptorService, _contextKeyService, _instantiationService, _lifecycleService) {
    super();
    this._layoutService = _layoutService;
    this._sessionManagementService = _sessionManagementService;
    this._sessionsService = _sessionsService;
    this._viewsService = _viewsService;
    this._paneCompositePartService = _paneCompositePartService;
    this._storageService = _storageService;
    this._configurationService = _configurationService;
    this._editorService = _editorService;
    this._editorGroupsService = _editorGroupsService;
    this._workspaceContextService = _workspaceContextService;
    this._sessionChangesService = _sessionChangesService;
    this._changesViewService = _changesViewService;
    this._viewDescriptorService = _viewDescriptorService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._lifecycleService = _lifecycleService;
    // [B3] Per-session state, keyed by session resource and persisted to storage.
    this._panelVisibilityBySession = new ResourceMap();
    this._viewStateBySession = new ResourceMap();
    this._workingSets = new ResourceMap();
    /**
     * [B2] Whether the editor part was hidden (e.g. the user closed the Side
     * Panel while keeping editors open) for a session, captured on switch-away so
     * restoring the session's working set does not force the editor part open.
     */
    this._editorPartHiddenBySession = new ResourceMap();
    this._workingSetSequencer = new Sequencer();
    /**
     * `> 0` while the controller is restoring a session's layout on a session
     * switch (editor working set and/or auxiliary bar). Subclasses can use this to
     * re-baseline responsive behaviour instead of reacting to the restore-driven
     * part-visibility changes (see the desktop controller's [D7] sidebar logic).
     */
    this._restoringSessionLayoutDepth = 0;
    /**
     * Fires when a session-switch layout restore fully settles (the restore depth
     * returns to 0, after the — possibly async — working-set apply and aux-bar
     * restore complete). Subclasses reconcile off this instead of reacting to the
     * transient part/editor changes *during* the restore, which race the settled
     * state (e.g. a new session's empty working set closing the docked tabs).
     */
    this._onDidEndSessionLayoutRestore = this._register(new Emitter());
    this.onDidEndSessionLayoutRestore = this._onDidEndSessionLayoutRestore.event;
    /**
     * [D9] `true` between the layout service's side-pane will/did toggle events.
     * The per-session aux-bar capture skips this window, so toggling the whole
     * side pane is never recorded as an explicit aux-bar choice.
     */
    this._togglingSidePane = false;
    this._loadState();
    this._register(this._storageService.onWillSaveState(() => this._saveState()));
    this.activeSessionResourceObs = derivedOpts({
      equalsFn: isEqual
    }, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return activeSession?.resource;
    });
    this.multipleSessionsVisibleObs = derived((reader) => {
      return this._sessionsService.visibleSessions.read(reader).length > 1;
    });
    this._register(autorun((reader) => {
      const visibleSessions = this._sessionsService.visibleSessions.read(reader);
      if (visibleSessions.length <= 1) {
        return;
      }
      for (const session of visibleSessions) {
        if (!session) {
          continue;
        }
        if (this._isViewStatePerSession) {
          this._viewStateBySession.delete(session.resource);
        }
        this._panelVisibilityBySession.delete(session.resource);
      }
    }));
    this._register(autorun((reader) => {
      const activeSessionResource = this.activeSessionResourceObs.read(reader);
      if (this.multipleSessionsVisibleObs.read(reader)) {
        return;
      }
      this._syncPanelVisibility(activeSessionResource);
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId !== Parts.PANEL_PART) {
        return;
      }
      if (this.multipleSessionsVisibleObs.get() || this._isCustomViewVisible()) {
        return;
      }
      const activeSession = this._sessionsService.activeSession.get();
      if (activeSession) {
        this._panelVisibilityBySession.set(activeSession.resource, e.visible);
      }
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (!this._isEditorPartVisibilityPerSession || e.partId !== Parts.EDITOR_PART || this._isRestoringSessionLayout) {
        return;
      }
      if (this.multipleSessionsVisibleObs.get() || this._isCustomViewVisible()) {
        return;
      }
      const activeSession = this._sessionsService.activeSession.get();
      if (activeSession) {
        this._editorPartHiddenBySession.set(activeSession.resource, !e.visible);
      }
    }));
    this._useModalConfigObs = observableConfigValue("workbench.editor.useModal", "all", this._configurationService);
    const workspaceFoldersObs = observableFromEvent(
      this._workspaceContextService.onDidChangeWorkspaceFolders,
      () => this._workspaceContextService.getWorkspace().folders
    );
    const activeSessionForWorkingSet = derivedObservableWithCache(this, (reader, lastValue) => {
      const workspaceFolders = workspaceFoldersObs.read(reader);
      const activeSession = this._sessionsService.activeSession.read(reader);
      const activeSessionWorkspaceUri = activeSession?.workspace.read(reader)?.folders[0]?.workingDirectory;
      if (activeSessionWorkspaceUri && !workspaceFolders.some((folder) => isEqual(folder.uri, activeSessionWorkspaceUri))) {
        return lastValue;
      }
      if (isEqual(activeSession?.resource, lastValue?.resource)) {
        return lastValue;
      }
      return activeSession;
    });
    this._register(runOnChange(this._sessionsService.activeSession, (session, previousSession) => {
      if (previousSession && !isEqual(previousSession.resource, session?.resource) && previousSession.status.read(void 0) !== SessionStatus.Untitled && !this._isRestoringSessionLayout) {
        this._saveWorkingSet(previousSession.resource);
      }
    }));
    this._register(runOnChange(activeSessionForWorkingSet, (session, previousSession) => {
      if (previousSession || session && this._workingSets.has(session.resource)) {
        this._withSessionLayoutRestore(() => this._applyWorkingSet(session?.resource, { isInitialRestore: !previousSession }));
      }
    }));
    this._register(this._sessionManagementService.onDidChangeSessions((e) => {
      const archivedSessions = e.changed.filter((session) => session.isArchived.read(void 0));
      for (const session of [...e.removed, ...archivedSessions]) {
        this._deleteWorkingSet(session.resource);
        this._viewStateBySession.delete(session.resource);
        this._editorPartHiddenBySession.delete(session.resource);
      }
    }));
    this._register(this._sessionManagementService.onDidReplaceSession(({ from, to }) => this._onSessionReplaced(from, to)));
    this._register(this._layoutService.onWillToggleSidePane(() => {
      this._togglingSidePane = true;
    }));
    this._register(this._layoutService.onDidToggleSidePane(({ before, after }) => {
      try {
        const wasVisible = before.editor || before.auxiliaryBar;
        const visible = after.editor || after.auxiliaryBar;
        this._onSidePaneToggled(wasVisible && !visible, before.auxiliaryBar, after.auxiliaryBar);
      } finally {
        this._togglingSidePane = false;
      }
    }));
    this._register(this._registerSidePaneToggleAction());
    this._registerViewStateManagement();
    this._registerAuxiliaryControllers();
  }
  get _isRestoringSessionLayout() {
    return this._restoringSessionLayoutDepth > 0;
  }
  /**
   * Storage key for this controller's per-session layout state. Overridable so a
   * sibling controller (e.g. single-pane) persists to a fresh key instead of
   * sharing the classic desktop state.
   */
  get _layoutStateStorageKey() {
    return SESSION_LAYOUT_STATE_KEY;
  }
  /**
   * Legacy key migrated on first load, or `undefined` to skip migration (a fresh
   * sibling controller has no legacy state to migrate).
   */
  get _legacyWorkingSetsStorageKey() {
    return WORKING_SETS_STORAGE_KEY;
  }
  get _isEditorPartVisibilityPerSession() {
    return true;
  }
  get _isViewStatePerSession() {
    return true;
  }
  /**
   * Hook for a layout controller to create and own its auxiliary controllers.
   * The base implementation does nothing.
   */
  _registerAuxiliaryControllers() {
  }
  /**
   * Whether a custom view currently replaces the sessions grid. The parts it
   * covers are force-hidden, so those transitions must not be captured as the
   * active session's layout preference.
   */
  _isCustomViewVisible() {
    return this._layoutService.isVisible(Parts.CUSTOM_VIEW_GRID_PART);
  }
  /**
   * Registers the `Toggle Side Panel` action (menu item, keybinding, and
   * command-palette entry). The command calls the workbench layout service
   * directly; this controller observes the service's toggle lifecycle events.
   */
  _registerSidePaneToggleAction() {
    return registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.agentToggleSidePanel",
          title: localize2("toggleSecondarySidebar", "Toggle Side Panel"),
          icon: secondarySidebarToggleClosedIcon,
          toggled: {
            condition: ContextKeyExpr.or(AuxiliaryBarVisibleContext, MainEditorAreaVisibleContext),
            icon: secondarySidebarToggleOpenIcon
          },
          metadata: {
            description: localize("openAndCloseSidePanel", "Open/Show and Close/Hide the Side Panel (editor area and auxiliary bar)")
          },
          category: Categories.View,
          f1: true,
          precondition: ContextKeyExpr.and(
            ContextKeyExpr.or(IsQuickChatSessionContext.negate(), SinglePaneLayoutEnabledContext),
            CustomViewVisibleContext.negate()
          ),
          keybinding: {
            weight: KeybindingWeight.SessionsContrib,
            primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB
          },
          menu: [
            {
              id: Menus.TitleBarSessionMenu,
              group: "navigation",
              order: 11,
              // After Open in VS Code (7), Run Script (8), and Toggle Panel (10)
              when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated())
            }
          ]
        });
      }
      run(accessor) {
        const nowVisible = accessor.get(IAgentWorkbenchLayoutService).toggleSidePane();
        logSidePanelToggle(accessor.get(ITelemetryService), nowVisible);
        alert(nowVisible ? localize("sidePanelVisible", "Side Panel shown") : localize("sidePanelHidden", "Side Panel hidden"));
      }
    });
  }
  /**
   * Hook for subclasses to register platform-specific auxiliary bar
   * view-state management. Runs at the end of the base constructor. The base
   * implementation does nothing.
   */
  _registerViewStateManagement() {
  }
  _onSessionReplaced(from, to) {
    if (!this._isEditorPartVisibilityPerSession) {
      return;
    }
    const activeSession = this._sessionsService.activeSession.get();
    const replacedSessionIsActive = isEqual(activeSession?.resource, from.resource) || isEqual(activeSession?.resource, to.resource);
    const editorPartHidden = this._editorPartHiddenBySession.get(from.resource) ?? (replacedSessionIsActive ? !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow) : void 0);
    if (editorPartHidden !== void 0) {
      this._editorPartHiddenBySession.set(to.resource, editorPartHidden);
    }
  }
  /**
   * Whether the auxiliary bar currently has at least one active view container
   * (shown as a tab). Mirrors the workbench's own container-visibility rule
   * (`!hideIfEmpty || isViewContainerActive`, folded into `isViewContainerActive`).
   */
  _hasActiveAuxViewContainers() {
    return this._viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar).some((container) => this._viewsService.isViewContainerActive(container.id));
  }
  /**
   * Records a completed whole-side-pane toggle from the did event's before/after
   * state while {@link _togglingSidePane} is still set.
   */
  _onSidePaneToggled(_collapsed, _previousAuxiliaryBarVisible, _auxiliaryBarVisible) {
  }
  /**
   * [B4] Hook that lets a subclass snapshot the active session's view state when
   * state is about to be persisted. The base implementation does nothing.
   */
  _captureActiveSessionViewState(_sessionResource) {
  }
  /**
   * Runs a session-switch layout restore with {@link _isRestoringSessionLayout}
   * held until the (possibly async) work settles, so part-visibility changes the
   * restore causes can be re-baselined rather than reacted to.
   */
  _withSessionLayoutRestore(work) {
    this._restoringSessionLayoutDepth++;
    const suppression = this._suppressEditorVisibilityDuringRestore();
    let settledSync = true;
    try {
      const result = work();
      if (isThenable(result)) {
        settledSync = false;
        Promise.resolve(result).catch(() => void 0).finally(() => {
          this._endSessionLayoutRestore(suppression);
        });
      }
    } finally {
      if (settledSync) {
        this._endSessionLayoutRestore(suppression);
      }
    }
  }
  _endSessionLayoutRestore(suppression) {
    this._restoringSessionLayoutDepth--;
    suppression?.dispose();
    if (this._restoringSessionLayoutDepth === 0) {
      this._onDidEndSessionLayoutRestore.fire();
    }
  }
  /**
   * Hook to suppress editor-part auto-visibility for the whole session-switch
   * restore. The base restore causes no layout-driven editor closes, so it
   * returns `undefined`.
   */
  _suppressEditorVisibilityDuringRestore() {
    return void 0;
  }
  /**
   * Hook deciding whether {@link _applyWorkingSet} reveals the editor part when
   * restoring a non-empty working set.
   */
  _shouldRevealEditorPartOnApply(editorPartHidden, isModal) {
    return !editorPartHidden && !isModal;
  }
  /**
   * Hook deciding whether {@link _applyWorkingSet} reveals the editor part for an
   * empty working set. The base never reveals in this case.
   */
  _shouldRevealEditorPartForEmptyWorkingSet(_revealEditorPart) {
    return false;
  }
  /**
   * Hook deciding whether {@link _applyWorkingSet} actively hides the editor part
   * when restoring a session that had it hidden. The base never hides (in the
   * classic layout the editor part visibility is not a per-session choice); the
   * single-pane layout restores its docked editor part both ways.
   */
  _shouldHideEditorPartOnApply(_editorPartHidden) {
    return false;
  }
  /** Hook invoked before a session working set is queued for application. */
  _onWillApplyWorkingSet(_workingSet) {
  }
  // --- Editor part reveal ---
  /**
   * Reveals the editor part. Editor working sets are restored into the shared
   * editor area on session switch, which requires the editor part to be visible.
   */
  _revealEditorPartForWorkingSet() {
    this._layoutService.setPartHidden(false, Parts.EDITOR_PART);
  }
  /** Hides the editor part to restore a session that had its docked editor closed. */
  _hideEditorPartForWorkingSet() {
    this._layoutService.setPartHidden(true, Parts.EDITOR_PART);
  }
  // --- Persistence [B3] ---
  _loadState() {
    const raw = this._storageService.get(this._layoutStateStorageKey, StorageScope.WORKSPACE);
    if (raw) {
      try {
        for (const entry of JSON.parse(raw)) {
          const resource = URI.parse(entry.sessionResource);
          if (entry.editorWorkingSet) {
            this._workingSets.set(resource, entry.editorWorkingSet);
          }
          if (this._isEditorPartVisibilityPerSession && entry.editorPartHidden !== void 0) {
            this._editorPartHiddenBySession.set(resource, entry.editorPartHidden);
          }
          if (this._isViewStatePerSession && entry.viewState) {
            this._viewStateBySession.set(resource, entry.viewState);
          }
        }
        return;
      } catch {
        this._storageService.remove(this._layoutStateStorageKey, StorageScope.WORKSPACE);
      }
    }
    const legacyKey = this._legacyWorkingSetsStorageKey;
    if (!legacyKey) {
      return;
    }
    const legacyRaw = this._storageService.get(legacyKey, StorageScope.WORKSPACE);
    if (legacyRaw) {
      try {
        for (const entry of JSON.parse(legacyRaw)) {
          const resource = URI.parse(entry.sessionResource);
          if (entry.editorWorkingSet) {
            this._workingSets.set(resource, entry.editorWorkingSet);
          }
          if (entry.auxiliaryBarState) {
            this._viewStateBySession.set(resource, {
              auxiliaryBarVisible: entry.auxiliaryBarState.visible,
              auxiliaryBarActiveViewContainerId: entry.auxiliaryBarState.activeViewContainerId
            });
          }
        }
      } catch {
      }
      this._storageService.remove(legacyKey, StorageScope.WORKSPACE);
    }
  }
  _saveState() {
    const activeSession = this._sessionsService.activeSession.get();
    const multipleVisible = this._sessionsService.visibleSessions.get().length > 1;
    if (activeSession && !multipleVisible && activeSession.status.read(void 0) !== SessionStatus.Untitled) {
      this._captureActiveSessionViewState(activeSession.resource);
    }
    if (activeSession && activeSession.status.read(void 0) !== SessionStatus.Untitled) {
      this._saveWorkingSet(activeSession.resource);
    }
    const allResources = new ResourceMap();
    this._workingSets.forEach((_, r) => allResources.set(r, true));
    if (this._isViewStatePerSession) {
      this._viewStateBySession.forEach((_, r) => allResources.set(r, true));
    }
    if (this._isEditorPartVisibilityPerSession) {
      this._editorPartHiddenBySession.forEach((_, r) => allResources.set(r, true));
    }
    if (allResources.size === 0) {
      this._storageService.remove(this._layoutStateStorageKey, StorageScope.WORKSPACE);
      return;
    }
    const entries = [];
    allResources.forEach((_, resource) => {
      entries.push({
        sessionResource: resource.toString(),
        editorWorkingSet: this._workingSets.get(resource),
        viewState: this._isViewStatePerSession ? this._viewStateBySession.get(resource) : void 0,
        editorPartHidden: this._isEditorPartVisibilityPerSession ? this._editorPartHiddenBySession.get(resource) : void 0
      });
    });
    this._storageService.store(this._layoutStateStorageKey, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  // --- Panel [B1] ---
  _syncPanelVisibility(sessionResource) {
    if (!sessionResource) {
      this._layoutService.setPartHidden(true, Parts.PANEL_PART);
      return;
    }
    const wasVisible = this._panelVisibilityBySession.get(sessionResource);
    this._layoutService.setPartHidden(wasVisible !== true, Parts.PANEL_PART);
  }
  // --- Editor working sets [B2] ---
  async _applyWorkingSet(sessionResource, options) {
    const preserveFocus = true;
    const workingSet = sessionResource ? this._workingSets.get(sessionResource) ?? "empty" : "empty";
    this._onWillApplyWorkingSet(workingSet);
    return this._workingSetSequencer.queue(async () => {
      if (this._sessionsService.visibleSessions.get().length > 1) {
        const suppression = this._layoutService.suppressEditorPartAutoVisibility();
        try {
          await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
        } finally {
          suppression.dispose();
        }
        return;
      }
      const isModal = this._useModalConfigObs.get() === "all";
      const editorPartHidden = this._isEditorPartVisibilityPerSession && sessionResource ? this._editorPartHiddenBySession.get(sessionResource) === true : false;
      const revealEditorPart = !options?.isInitialRestore && this._shouldRevealEditorPartOnApply(editorPartHidden, isModal);
      const hideEditorPart = !options?.isInitialRestore && !revealEditorPart && this._shouldHideEditorPartOnApply(editorPartHidden);
      if (workingSet === "empty") {
        await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
        if (this._shouldRevealEditorPartForEmptyWorkingSet(revealEditorPart) && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
          this._revealEditorPartForWorkingSet();
        } else if (hideEditorPart && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
          this._hideEditorPartForWorkingSet();
        }
        return;
      }
      if (options?.isInitialRestore) {
        const suppression = this._layoutService.suppressEditorPartAutoVisibility();
        try {
          await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
        } finally {
          suppression.dispose();
        }
        if (this._shouldHideEditorPartOnApply(editorPartHidden) && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
          this._hideEditorPartForWorkingSet();
        }
        return;
      }
      if (revealEditorPart && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._revealEditorPartForWorkingSet();
      } else if (hideEditorPart && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._hideEditorPartForWorkingSet();
      }
      const result = await this._editorGroupsService.applyWorkingSet(workingSet, { preserveFocus });
      if (revealEditorPart && result && !this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._revealEditorPartForWorkingSet();
      } else if (hideEditorPart && this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
        this._hideEditorPartForWorkingSet();
      }
    });
  }
  _saveWorkingSet(sessionResource) {
    this._deleteWorkingSet(sessionResource);
    if (this._editorService.visibleEditors.length > 0) {
      const workingSetName = `session-working-set:${sessionResource.toString()}`;
      const workingSet = this._editorGroupsService.saveWorkingSet(workingSetName);
      this._workingSets.set(sessionResource, workingSet);
    }
  }
  _deleteWorkingSet(sessionResource) {
    const existingWorkingSet = this._workingSets.get(sessionResource);
    if (!existingWorkingSet) {
      return;
    }
    this._editorGroupsService.deleteWorkingSet(existingWorkingSet);
    this._workingSets.delete(sessionResource);
  }
};
BaseLayoutController = __decorateClass([
  __decorateParam(0, IAgentWorkbenchLayoutService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IViewsService),
  __decorateParam(4, IPaneCompositePartService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IEditorGroupsService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, ISessionChangesService),
  __decorateParam(11, IChangesViewService),
  __decorateParam(12, IViewDescriptorService),
  __decorateParam(13, IContextKeyService),
  __decorateParam(14, IInstantiationService),
  __decorateParam(15, ILifecycleService)
], BaseLayoutController);
export {
  BaseLayoutController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcbGF5b3V0XFxicm93c2VyXFxiYXNlU2Vzc2lvbkxheW91dENvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgaXNUaGVuYWJsZSwgU2VxdWVuY2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUsIGRlcml2ZWRPcHRzLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBydW5PbkNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQXV4aWxpYXJ5QmFyVmlzaWJsZUNvbnRleHQsIElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgTWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSwgSUVkaXRvcldvcmtpbmdTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dvcmtiZW5jaC5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQsIEN1c3RvbVZpZXdWaXNpYmxlQ29udGV4dCwgSXNRdWlja0NoYXRTZXNzaW9uQ29udGV4dCwgU2luZ2xlUGFuZUxheW91dEVuYWJsZWRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IGxvZ1NpZGVQYW5lbFRvZ2dsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uc1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhbmdlcy9icm93c2VyL3Nlc3Npb25DaGFuZ2VzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhbmdlcy9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuXG5jb25zdCBzZWNvbmRhcnlTaWRlYmFyVG9nZ2xlQ2xvc2VkSWNvbiA9IHJlZ2lzdGVySWNvbignYWdlbnQtc2Vjb25kYXJ5LXNpZGViYXItdG9nZ2xlLWNsb3NlZCcsIENvZGljb24ubGF5b3V0U2lkZWJhclJpZ2h0T2ZmLCBsb2NhbGl6ZSgnYWdlbnRTZWNvbmRhcnlTaWRlYmFyVG9nZ2xlQ2xvc2VkSWNvbicsIFwiSWNvbiBmb3IgdGhlIHNlc3Npb25zIHNlY29uZGFyeSBzaWRlYmFyIHdoZW4gY2xvc2VkLlwiKSk7XG5jb25zdCBzZWNvbmRhcnlTaWRlYmFyVG9nZ2xlT3Blbkljb24gPSByZWdpc3Rlckljb24oJ2FnZW50LXNlY29uZGFyeS1zaWRlYmFyLXRvZ2dsZS1vcGVuJywgQ29kaWNvbi5sYXlvdXRTaWRlYmFyUmlnaHQsIGxvY2FsaXplKCdhZ2VudFNlY29uZGFyeVNpZGViYXJUb2dnbGVPcGVuSWNvbicsIFwiSWNvbiBmb3IgdGhlIHNlc3Npb25zIHNlY29uZGFyeSBzaWRlYmFyIHdoZW4gb3Blbi5cIikpO1xuXG4vKipcbiAqIFBlci1zZXNzaW9uIHZpZXcgc3RhdGU6IGF1eGlsaWFyeSBiYXIgdmlzaWJpbGl0eSBhbmQgYWN0aXZlIHZpZXcgY29udGFpbmVyLlxuICogVHJlYXRlZCBhcyBvcGFxdWUgcGVyc2lzdGVkIGRhdGEgYnkgdGhlIGJhc2UgY29udHJvbGxlcjsgb25seSB0aGUgZGVza3RvcFxuICogY29udHJvbGxlciBpbnRlcnByZXRzIGl0IChzZWUgYGRlc2t0b3BTZXNzaW9uTGF5b3V0Q29udHJvbGxlci5tZGApLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uVmlld1N0YXRlIHtcblx0cmVhZG9ubHkgYXV4aWxpYXJ5QmFyVmlzaWJsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgYXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBbRDldIE1hcmtzIGFuIGF1eC1iYXIgaGlkZSBjYXVzZWQgb25seSBieSBjb2xsYXBzaW5nIHRoZSB3aG9sZSBzaWRlIHBhbmUuICovXG5cdHJlYWRvbmx5IGF1eGlsaWFyeUJhckhpZGRlbkJ5Q29sbGFwc2U/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEZ1bGwgcGVyLXNlc3Npb24gbGF5b3V0IHN0YXRlIHBlcnNpc3RlZCB0byBzdG9yYWdlLlxuICovXG5pbnRlcmZhY2UgSVNlc3Npb25MYXlvdXRFbnRyeSB7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogc3RyaW5nO1xuXHRyZWFkb25seSB2aWV3U3RhdGU/OiBJU2Vzc2lvblZpZXdTdGF0ZTtcblx0cmVhZG9ubHkgZWRpdG9yV29ya2luZ1NldD86IElFZGl0b3JXb3JraW5nU2V0O1xuXHRyZWFkb25seSBlZGl0b3JQYXJ0SGlkZGVuPzogYm9vbGVhbjtcbn1cblxuLyoqIE5ldyB1bmlmaWVkIHN0b3JhZ2Uga2V5IGZvciBhbGwgcGVyLXNlc3Npb24gbGF5b3V0IHN0YXRlLiAqL1xuY29uc3QgU0VTU0lPTl9MQVlPVVRfU1RBVEVfS0VZID0gJ3Nlc3Npb25zLmxheW91dFN0YXRlJztcbi8qKiBMZWdhY3kga2V5IFx1MjAxNCByZWFkIG9uIHN0YXJ0dXAgZm9yIG1pZ3JhdGlvbiBvbmx5LiAqL1xuY29uc3QgV09SS0lOR19TRVRTX1NUT1JBR0VfS0VZID0gJ3Nlc3Npb25zLndvcmtpbmdTZXRzJztcblxuLyoqXG4gKiBTaGFyZWQsIHBsYXRmb3JtLWFnbm9zdGljIHBlci1zZXNzaW9uIGxheW91dCBzdGF0ZSBtYW5hZ2VtZW50LiBUaGUgYmVoYXZpb3VyXG4gKiBzcGVjaWZpZWQgaGVyZSBpcyBlbnVtZXJhdGVkIGFzIHJ1bGVzICoqQjEtQjUqKiBpblxuICogW2Jhc2VTZXNzaW9uTGF5b3V0Q29udHJvbGxlci5tZF0oLi9iYXNlU2Vzc2lvbkxheW91dENvbnRyb2xsZXIubWQpLlxuICpcbiAqIEl0IG93bnMgdGhlIHBhbmVsIHZpc2liaWxpdHksIGVkaXRvciB3b3JraW5nIHNldHMsIHBlcnNpc3RlbmNlLCBhbmQgdGhlXG4gKiBtdWx0aS1zZXNzaW9uIHN1cHByZXNzaW9uIHRoYXQgZXZlcnkgbGF5b3V0IG5lZWRzLiBBdXhpbGlhcnkgYmFyIG1hbmFnZW1lbnRcbiAqIGlzIHBsYXRmb3JtLXNwZWNpZmljIGFuZCBzdXBwbGllZCBieSBzdWJjbGFzc2VzIHRocm91Z2hcbiAqIHtAbGluayBfcmVnaXN0ZXJWaWV3U3RhdGVNYW5hZ2VtZW50fSAoc2VlIHRoZSBkZXNrdG9wIC8gbW9iaWxlIGNvbnRyb2xsZXJzKS5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VMYXlvdXRDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Ly8gW0IzXSBQZXItc2Vzc2lvbiBzdGF0ZSwga2V5ZWQgYnkgc2Vzc2lvbiByZXNvdXJjZSBhbmQgcGVyc2lzdGVkIHRvIHN0b3JhZ2UuXG5cdHByb3RlY3RlZCByZWFkb25seSBfcGFuZWxWaXNpYmlsaXR5QnlTZXNzaW9uID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfdmlld1N0YXRlQnlTZXNzaW9uID0gbmV3IFJlc291cmNlTWFwPElTZXNzaW9uVmlld1N0YXRlPigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3dvcmtpbmdTZXRzID0gbmV3IFJlc291cmNlTWFwPElFZGl0b3JXb3JraW5nU2V0PigpO1xuXHQvKipcblx0ICogW0IyXSBXaGV0aGVyIHRoZSBlZGl0b3IgcGFydCB3YXMgaGlkZGVuIChlLmcuIHRoZSB1c2VyIGNsb3NlZCB0aGUgU2lkZVxuXHQgKiBQYW5lbCB3aGlsZSBrZWVwaW5nIGVkaXRvcnMgb3BlbikgZm9yIGEgc2Vzc2lvbiwgY2FwdHVyZWQgb24gc3dpdGNoLWF3YXkgc29cblx0ICogcmVzdG9yaW5nIHRoZSBzZXNzaW9uJ3Mgd29ya2luZyBzZXQgZG9lcyBub3QgZm9yY2UgdGhlIGVkaXRvciBwYXJ0IG9wZW4uXG5cdCAqL1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2VkaXRvclBhcnRIaWRkZW5CeVNlc3Npb24gPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya2luZ1NldFNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgbXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnM7XG5cblx0LyoqXG5cdCAqIGA+IDBgIHdoaWxlIHRoZSBjb250cm9sbGVyIGlzIHJlc3RvcmluZyBhIHNlc3Npb24ncyBsYXlvdXQgb24gYSBzZXNzaW9uXG5cdCAqIHN3aXRjaCAoZWRpdG9yIHdvcmtpbmcgc2V0IGFuZC9vciBhdXhpbGlhcnkgYmFyKS4gU3ViY2xhc3NlcyBjYW4gdXNlIHRoaXMgdG9cblx0ICogcmUtYmFzZWxpbmUgcmVzcG9uc2l2ZSBiZWhhdmlvdXIgaW5zdGVhZCBvZiByZWFjdGluZyB0byB0aGUgcmVzdG9yZS1kcml2ZW5cblx0ICogcGFydC12aXNpYmlsaXR5IGNoYW5nZXMgKHNlZSB0aGUgZGVza3RvcCBjb250cm9sbGVyJ3MgW0Q3XSBzaWRlYmFyIGxvZ2ljKS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc3RvcmluZ1Nlc3Npb25MYXlvdXREZXB0aCA9IDA7XG5cblx0cHJvdGVjdGVkIGdldCBfaXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXN0b3JpbmdTZXNzaW9uTGF5b3V0RGVwdGggPiAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gYSBzZXNzaW9uLXN3aXRjaCBsYXlvdXQgcmVzdG9yZSBmdWxseSBzZXR0bGVzICh0aGUgcmVzdG9yZSBkZXB0aFxuXHQgKiByZXR1cm5zIHRvIDAsIGFmdGVyIHRoZSBcdTIwMTQgcG9zc2libHkgYXN5bmMgXHUyMDE0IHdvcmtpbmctc2V0IGFwcGx5IGFuZCBhdXgtYmFyXG5cdCAqIHJlc3RvcmUgY29tcGxldGUpLiBTdWJjbGFzc2VzIHJlY29uY2lsZSBvZmYgdGhpcyBpbnN0ZWFkIG9mIHJlYWN0aW5nIHRvIHRoZVxuXHQgKiB0cmFuc2llbnQgcGFydC9lZGl0b3IgY2hhbmdlcyAqZHVyaW5nKiB0aGUgcmVzdG9yZSwgd2hpY2ggcmFjZSB0aGUgc2V0dGxlZFxuXHQgKiBzdGF0ZSAoZS5nLiBhIG5ldyBzZXNzaW9uJ3MgZW1wdHkgd29ya2luZyBzZXQgY2xvc2luZyB0aGUgZG9ja2VkIHRhYnMpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbmRTZXNzaW9uTGF5b3V0UmVzdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgb25EaWRFbmRTZXNzaW9uTGF5b3V0UmVzdG9yZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEVuZFNlc3Npb25MYXlvdXRSZXN0b3JlLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBbRDldIGB0cnVlYCBiZXR3ZWVuIHRoZSBsYXlvdXQgc2VydmljZSdzIHNpZGUtcGFuZSB3aWxsL2RpZCB0b2dnbGUgZXZlbnRzLlxuXHQgKiBUaGUgcGVyLXNlc3Npb24gYXV4LWJhciBjYXB0dXJlIHNraXBzIHRoaXMgd2luZG93LCBzbyB0b2dnbGluZyB0aGUgd2hvbGVcblx0ICogc2lkZSBwYW5lIGlzIG5ldmVyIHJlY29yZGVkIGFzIGFuIGV4cGxpY2l0IGF1eC1iYXIgY2hvaWNlLlxuXHQgKi9cblx0cHJvdGVjdGVkIF90b2dnbGluZ1NpZGVQYW5lID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdXNlTW9kYWxDb25maWdPYnM7XG5cblx0LyoqXG5cdCAqIFN0b3JhZ2Uga2V5IGZvciB0aGlzIGNvbnRyb2xsZXIncyBwZXItc2Vzc2lvbiBsYXlvdXQgc3RhdGUuIE92ZXJyaWRhYmxlIHNvIGFcblx0ICogc2libGluZyBjb250cm9sbGVyIChlLmcuIHNpbmdsZS1wYW5lKSBwZXJzaXN0cyB0byBhIGZyZXNoIGtleSBpbnN0ZWFkIG9mXG5cdCAqIHNoYXJpbmcgdGhlIGNsYXNzaWMgZGVza3RvcCBzdGF0ZS5cblx0ICovXG5cdHByb3RlY3RlZCBnZXQgX2xheW91dFN0YXRlU3RvcmFnZUtleSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBTRVNTSU9OX0xBWU9VVF9TVEFURV9LRVk7XG5cdH1cblxuXHQvKipcblx0ICogTGVnYWN5IGtleSBtaWdyYXRlZCBvbiBmaXJzdCBsb2FkLCBvciBgdW5kZWZpbmVkYCB0byBza2lwIG1pZ3JhdGlvbiAoYSBmcmVzaFxuXHQgKiBzaWJsaW5nIGNvbnRyb2xsZXIgaGFzIG5vIGxlZ2FjeSBzdGF0ZSB0byBtaWdyYXRlKS5cblx0ICovXG5cdHByb3RlY3RlZCBnZXQgX2xlZ2FjeVdvcmtpbmdTZXRzU3RvcmFnZUtleSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBXT1JLSU5HX1NFVFNfU1RPUkFHRV9LRVk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IF9pc0VkaXRvclBhcnRWaXNpYmlsaXR5UGVyU2Vzc2lvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgX2lzVmlld1N0YXRlUGVyU2Vzc2lvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXG5cdFx0QElBZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlOiBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2VkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVNlc3Npb25DaGFuZ2VzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3Nlc3Npb25DaGFuZ2VzU2VydmljZTogSVNlc3Npb25DaGFuZ2VzU2VydmljZSxcblx0XHRASUNoYW5nZXNWaWV3U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2NoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3ZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9saWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFtCM10gUmVzdG9yZSBwZXJzaXN0ZWQgc3RhdGUgKHdpdGggb25lLXRpbWUgbGVnYWN5IG1pZ3JhdGlvbikuXG5cdFx0dGhpcy5fbG9hZFN0YXRlKCk7XG5cblx0XHQvLyBbQjRdIFBlcnNpc3Qgb24gc2h1dGRvd24uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHRoaXMuX3NhdmVTdGF0ZSgpKSk7XG5cblx0XHQvLyBBbGwgc2Vzc2lvbi1zd2l0Y2ggbG9naWMgaXMgb2JzZXJ2YWJsZS1kcml2ZW4uXG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uUmVzb3VyY2VPYnMgPSBkZXJpdmVkT3B0czxVUkkgfCB1bmRlZmluZWQ+KHtcblx0XHRcdGVxdWFsc0ZuOiBpc0VxdWFsXG5cdFx0fSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbj8ucmVzb3VyY2U7XG5cdFx0fSk7XG5cblx0XHR0aGlzLm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzID0gZGVyaXZlZDxib29sZWFuPihyZWFkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMucmVhZChyZWFkZXIpLmxlbmd0aCA+IDE7XG5cdFx0fSk7XG5cblx0XHQvLyBbQjVdIFdoZW4gbXVsdGlwbGUgc2Vzc2lvbnMgYXJlIHZpc2libGUsIGRyb3AgcGVyLXNlc3Npb24gdmlldy9wYW5lbCBzdGF0ZVxuXHRcdC8vIGZvciBlYWNoIHZpc2libGUgc2Vzc2lvbiAoZWRpdG9yIHdvcmtpbmcgc2V0cyBhcmUgcHJlc2VydmVkKS4gVGhpcyBlbnN1cmVzXG5cdFx0Ly8gdGhlIGRlZmF1bHQgdmlzaWJpbGl0eSBsb2dpYyBydW5zIGFnYWluIGFmdGVyIGNvbGxhcHNpbmcgYmFjayB0byBvbmUgc2Vzc2lvbi5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2aXNpYmxlU2Vzc2lvbnMgPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UudmlzaWJsZVNlc3Npb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh2aXNpYmxlU2Vzc2lvbnMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHZpc2libGVTZXNzaW9ucykge1xuXHRcdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5faXNWaWV3U3RhdGVQZXJTZXNzaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLmRlbGV0ZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wYW5lbFZpc2liaWxpdHlCeVNlc3Npb24uZGVsZXRlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFtCMV0gU3dpdGNoIGJldHdlZW4gc2Vzc2lvbnMgXHUyMDE0IHN5bmMgcGFuZWwgdmlzaWJpbGl0eVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IHRoaXMuYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh0aGlzLm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zeW5jUGFuZWxWaXNpYmlsaXR5KGFjdGl2ZVNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gW0IxXSBUcmFjayBwYW5lbCB2aXNpYmlsaXR5IGNoYW5nZXMgYnkgdGhlIHVzZXJcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkoZSA9PiB7XG5cdFx0XHRpZiAoZS5wYXJ0SWQgIT09IFBhcnRzLlBBTkVMX1BBUlQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMubXVsdGlwbGVTZXNzaW9uc1Zpc2libGVPYnMuZ2V0KCkgfHwgdGhpcy5faXNDdXN0b21WaWV3VmlzaWJsZSgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRcdGlmIChhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuX3BhbmVsVmlzaWJpbGl0eUJ5U2Vzc2lvbi5zZXQoYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSwgZS52aXNpYmxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBbQjJdIFRyYWNrIGVkaXRvci1wYXJ0IChkb2NrZWQgc2lkZS1wYW5lKSB2aXNpYmlsaXR5IGNoYW5nZXMgYnkgdGhlIHVzZXJcblx0XHQvLyBzbyBhIHNlc3Npb24ncyBjbG9zZWQvb3BlbiBlZGl0b3Igc3RhdGUgaXMgY2FwdHVyZWQgYXQgdGhlIG1vbWVudCBpdFxuXHRcdC8vIGNoYW5nZXMgXHUyMDE0IG5vdCBsYXppbHkgcmUtcmVhZCBhdCBzd2l0Y2gtYXdheSB0aW1lLCB3aGljaCByYWNlcyB3aXRoIHRoZVxuXHRcdC8vIGluY29taW5nIHNlc3Npb24ncyBhc3luYyBsYXlvdXQgcmVzdG9yZSAodGhlIHN3aXRjaCBkZXJpdmUgbGFncyBiZWhpbmRcblx0XHQvLyB0aGUgcmF3IGFjdGl2ZS1zZXNzaW9uIGNoYW5nZSwgc28gYnkgdGhlIHRpbWUgdGhlIHByZXZpb3VzIHNlc3Npb24gaXNcblx0XHQvLyBzYXZlZCB0aGUgZWRpdG9yIHBhcnQgbWF5IGFscmVhZHkgcmVmbGVjdCB0aGUgbmV3IHNlc3Npb24pLiBTa2lwcGVkXG5cdFx0Ly8gd2hpbGUgbXVsdGlwbGUgc2Vzc2lvbnMgYXJlIHZpc2libGUgKHRoZSBlZGl0b3IgYXJlYSBpcyBzaGFyZWQpIGFuZFxuXHRcdC8vIGR1cmluZyBhIHNlc3Npb24tc3dpdGNoIHJlc3RvcmUgKHRob3NlIGNoYW5nZXMgYXJlIGxheW91dC1kcml2ZW4sIG5vdFxuXHRcdC8vIHVzZXIgY2hvaWNlcykuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0VkaXRvclBhcnRWaXNpYmlsaXR5UGVyU2Vzc2lvbiB8fCBlLnBhcnRJZCAhPT0gUGFydHMuRURJVE9SX1BBUlQgfHwgdGhpcy5faXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzLmdldCgpIHx8IHRoaXMuX2lzQ3VzdG9tVmlld1Zpc2libGUoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0XHRpZiAoYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JQYXJ0SGlkZGVuQnlTZXNzaW9uLnNldChhY3RpdmVTZXNzaW9uLnJlc291cmNlLCAhZS52aXNpYmxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBbQjJdIEVkaXRvciB3b3JraW5nIHNldHNcblxuXHRcdHRoaXMuX3VzZU1vZGFsQ29uZmlnT2JzID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPCdvZmYnIHwgJ3NvbWUnIHwgJ2FsbCc+KCd3b3JrYmVuY2guZWRpdG9yLnVzZU1vZGFsJywgJ2FsbCcsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdC8vIFdvcmtzcGFjZSBmb2xkZXJzIFx1MjAxNCB1c2VkIHRvIGRlZmVyIHNlc3Npb24gc3dpdGNoIHVudGlsIHdvcmtzcGFjZSBpcyByZWFkeVxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnNPYnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KFxuXHRcdFx0dGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLFxuXHRcdFx0KCkgPT4gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycyk7XG5cblx0XHQvLyBbQjJdIFRoZSBhY3RpdmUgc2Vzc2lvbiB1cGRhdGVzIGJlZm9yZSB0aGUgd29ya3NwYWNlIGZvbGRlcnMgZG87IGhvbGQgYmFja1xuXHRcdC8vIHRoZSBuZXcgc2Vzc2lvbiB1bnRpbCB0aGUgZm9sZGVycyByZWZsZWN0IGl0cyB3b3JraW5nIGRpcmVjdG9yeS5cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uRm9yV29ya2luZ1NldCA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPih0aGlzLCAocmVhZGVyLCBsYXN0VmFsdWUpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB3b3Jrc3BhY2VGb2xkZXJzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uV29ya3NwYWNlVXJpID0gYWN0aXZlU2Vzc2lvbj8ud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVyc1swXT8ud29ya2luZ0RpcmVjdG9yeTtcblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRhY3RpdmVTZXNzaW9uV29ya3NwYWNlVXJpICYmXG5cdFx0XHRcdCF3b3Jrc3BhY2VGb2xkZXJzLnNvbWUoZm9sZGVyID0+IGlzRXF1YWwoZm9sZGVyLnVyaSwgYWN0aXZlU2Vzc2lvbldvcmtzcGFjZVVyaSkpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RWYWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzRXF1YWwoYWN0aXZlU2Vzc2lvbj8ucmVzb3VyY2UsIGxhc3RWYWx1ZT8ucmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0VmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uO1xuXHRcdH0pO1xuXG5cdFx0Ly8gV29ya2luZyBzZXRzIGFyZSBhbHdheXMgYWN0aXZlOiBicm93c2VyIGVkaXRvcnMgZG9jayBpbiB0aGUgc2hhcmVkIGdyaWRcblx0XHQvLyBlZGl0b3IgcGFydCBldmVuIHdoZW4gYHdvcmtiZW5jaC5lZGl0b3IudXNlTW9kYWxgIGlzIGAnYWxsJ2AgKHRoZXlcblx0XHQvLyBkZWxpYmVyYXRlbHkgZXhjZXB0IHRoZW1zZWx2ZXMgZnJvbSB0aGUgbW9kYWwgcGFydCksIHNvIHRoZWlyIHRhYnNcblx0XHQvLyBzdGlsbCBuZWVkIHRvIGJlIGNhcHR1cmVkL3Jlc3RvcmVkIHBlciBzZXNzaW9uIGluIHRoYXQgbW9kZS5cblxuXHRcdC8vIFtCMl0gU2F2ZSB0aGUgb3V0Z29pbmcgc2Vzc2lvbidzIHdvcmtpbmcgc2V0IGVhZ2VybHkgb24gdGhlIHJhdyBhY3RpdmVcblx0XHQvLyBzZXNzaW9uIGNoYW5nZSwgbm90IG9uIHRoZSB3b3Jrc3BhY2UtZ2F0ZWQgYGFjdGl2ZVNlc3Npb25Gb3JXb3JraW5nU2V0YFxuXHRcdC8vIGRlcml2ZSBiZWxvdy4gVGhlIGRlcml2ZSBsYWdzIHdoaWxlIHRoZSBpbmNvbWluZyBzZXNzaW9uJ3Mgd29ya3NwYWNlXG5cdFx0Ly8gcmVzb2x2ZXMsIGFuZCBhdXRvcnVucyBkcml2ZW4gYnkgdGhlIHJhdyBhY3RpdmUgc2Vzc2lvbiAoZS5nLiB0aGVcblx0XHQvLyBzaW5nbGUtcGFuZSBtYW5hZ2VkLXRhYnMgc3luYykgYXN5bmMtY2xvc2UgdGhlIG91dGdvaW5nIHNlc3Npb24ncyBkb2NrZWRcblx0XHQvLyBlZGl0b3JzIGR1cmluZyB0aGF0IHdpbmRvdy4gU2F2aW5nIGhlcmUgc3luY2hyb25vdXNseSBcdTIwMTQgYmVmb3JlIHRob3NlXG5cdFx0Ly8gY2xvc2VzIHJ1biBcdTIwMTQgY2FwdHVyZXMgd2hpY2ggZWRpdG9yIHdhcyBhY3RpdmUgKGUuZy4gdGhlIENoYW5nZXMgdGFiKSBzbyBpdFxuXHRcdC8vIGlzIHJlc3RvcmVkIGFjdGl2ZSBvbiByZXR1cm4uXG5cdFx0dGhpcy5fcmVnaXN0ZXIocnVuT25DaGFuZ2UodGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24sIChzZXNzaW9uLCBwcmV2aW91c1Nlc3Npb24pID0+IHtcblx0XHRcdGlmIChcblx0XHRcdFx0cHJldmlvdXNTZXNzaW9uXG5cdFx0XHRcdCYmICFpc0VxdWFsKHByZXZpb3VzU2Vzc2lvbi5yZXNvdXJjZSwgc2Vzc2lvbj8ucmVzb3VyY2UpXG5cdFx0XHRcdCYmIHByZXZpb3VzU2Vzc2lvbi5zdGF0dXMucmVhZCh1bmRlZmluZWQpICE9PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkXG5cdFx0XHRcdCYmICF0aGlzLl9pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXRcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLl9zYXZlV29ya2luZ1NldChwcmV2aW91c1Nlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFtCMl0gU2Vzc2lvbiBjaGFuZ2VkIChhcHBseSlcblx0XHR0aGlzLl9yZWdpc3RlcihydW5PbkNoYW5nZShhY3RpdmVTZXNzaW9uRm9yV29ya2luZ1NldCwgKHNlc3Npb24sIHByZXZpb3VzU2Vzc2lvbikgPT4ge1xuXHRcdFx0Ly8gQXBwbHkgd29ya2luZyBzZXQgZm9yIGN1cnJlbnQgc2Vzc2lvbi5cblx0XHRcdC8vIE9uIGluaXRpYWwgbG9hZCAobm8gcHJldmlvdXMgc2Vzc2lvbiksIG9ubHkgYXBwbHkgaWYgd2UgaGF2ZSBhIHNhdmVkIHdvcmtpbmcgc2V0IFx1MjAxNFxuXHRcdFx0Ly8gc2tpcCBhcHBseWluZyAnZW1wdHknIHRvIGF2b2lkIGNsb3NpbmcgZWRpdG9ycyB0aGF0IGFyZSBiZWluZyByZXN0b3JlZC5cblx0XHRcdGlmIChwcmV2aW91c1Nlc3Npb24gfHwgKHNlc3Npb24gJiYgdGhpcy5fd29ya2luZ1NldHMuaGFzKHNlc3Npb24ucmVzb3VyY2UpKSkge1xuXHRcdFx0XHR0aGlzLl93aXRoU2Vzc2lvbkxheW91dFJlc3RvcmUoKCkgPT4gdGhpcy5fYXBwbHlXb3JraW5nU2V0KHNlc3Npb24/LnJlc291cmNlLCB7IGlzSW5pdGlhbFJlc3RvcmU6ICFwcmV2aW91c1Nlc3Npb24gfSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFtCMl0gU2Vzc2lvbiBzdGF0ZSBjaGFuZ2VkIChhcmNoaXZlLCBkZWxldGUpXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiB7XG5cdFx0XHRjb25zdCBhcmNoaXZlZFNlc3Npb25zID0gZS5jaGFuZ2VkLmZpbHRlcihzZXNzaW9uID0+IHNlc3Npb24uaXNBcmNoaXZlZC5yZWFkKHVuZGVmaW5lZCkpO1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIFsuLi5lLnJlbW92ZWQsIC4uLmFyY2hpdmVkU2Vzc2lvbnNdKSB7XG5cdFx0XHRcdHRoaXMuX2RlbGV0ZVdvcmtpbmdTZXQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5kZWxldGUoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvclBhcnRIaWRkZW5CeVNlc3Npb24uZGVsZXRlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRSZXBsYWNlU2Vzc2lvbigoeyBmcm9tLCB0byB9KSA9PiB0aGlzLl9vblNlc3Npb25SZXBsYWNlZChmcm9tLCB0bykpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xheW91dFNlcnZpY2Uub25XaWxsVG9nZ2xlU2lkZVBhbmUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdG9nZ2xpbmdTaWRlUGFuZSA9IHRydWU7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRUb2dnbGVTaWRlUGFuZSgoeyBiZWZvcmUsIGFmdGVyIH0pID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHdhc1Zpc2libGUgPSBiZWZvcmUuZWRpdG9yIHx8IGJlZm9yZS5hdXhpbGlhcnlCYXI7XG5cdFx0XHRcdGNvbnN0IHZpc2libGUgPSBhZnRlci5lZGl0b3IgfHwgYWZ0ZXIuYXV4aWxpYXJ5QmFyO1xuXHRcdFx0XHR0aGlzLl9vblNpZGVQYW5lVG9nZ2xlZCh3YXNWaXNpYmxlICYmICF2aXNpYmxlLCBiZWZvcmUuYXV4aWxpYXJ5QmFyLCBhZnRlci5hdXhpbGlhcnlCYXIpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5fdG9nZ2xpbmdTaWRlUGFuZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNpZGUtcGFuZSB0b2dnbGUgVUkgKG1lbnUgaXRlbSwga2V5YmluZGluZywgY29tbWFuZC1wYWxldHRlIGVudHJ5KS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZWdpc3RlclNpZGVQYW5lVG9nZ2xlQWN0aW9uKCkpO1xuXG5cdFx0Ly8gUGxhdGZvcm0tc3BlY2lmaWMgYXV4aWxpYXJ5IGJhciAvIHZpZXctc3RhdGUgbWFuYWdlbWVudC5cblx0XHR0aGlzLl9yZWdpc3RlclZpZXdTdGF0ZU1hbmFnZW1lbnQoKTtcblxuXHRcdC8vIExheW91dC1zcGVjaWZpYyBhdXhpbGlhcnkgY29udHJvbGxlcnMgKGUuZy4gc2luZ2xlLXBhbmUgZGV0YWlsL3RhYlxuXHRcdC8vIGNvbnRyb2xsZXJzKSwgY3JlYXRlZCBhbmQgb3duZWQgYnkgdGhlIGxheW91dCBjb250cm9sbGVyIHNvIHRoZXkgc2hhcmVcblx0XHQvLyBpdHMgbGlmZWN5Y2xlIGFuZCBjb29yZGluYXRlIHRocm91Z2ggaXQuXG5cdFx0dGhpcy5fcmVnaXN0ZXJBdXhpbGlhcnlDb250cm9sbGVycygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhvb2sgZm9yIGEgbGF5b3V0IGNvbnRyb2xsZXIgdG8gY3JlYXRlIGFuZCBvd24gaXRzIGF1eGlsaWFyeSBjb250cm9sbGVycy5cblx0ICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gZG9lcyBub3RoaW5nLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9yZWdpc3RlckF1eGlsaWFyeUNvbnRyb2xsZXJzKCk6IHZvaWQgeyB9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYSBjdXN0b20gdmlldyBjdXJyZW50bHkgcmVwbGFjZXMgdGhlIHNlc3Npb25zIGdyaWQuIFRoZSBwYXJ0cyBpdFxuXHQgKiBjb3ZlcnMgYXJlIGZvcmNlLWhpZGRlbiwgc28gdGhvc2UgdHJhbnNpdGlvbnMgbXVzdCBub3QgYmUgY2FwdHVyZWQgYXMgdGhlXG5cdCAqIGFjdGl2ZSBzZXNzaW9uJ3MgbGF5b3V0IHByZWZlcmVuY2UuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2lzQ3VzdG9tVmlld1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIHRoZSBgVG9nZ2xlIFNpZGUgUGFuZWxgIGFjdGlvbiAobWVudSBpdGVtLCBrZXliaW5kaW5nLCBhbmRcblx0ICogY29tbWFuZC1wYWxldHRlIGVudHJ5KS4gVGhlIGNvbW1hbmQgY2FsbHMgdGhlIHdvcmtiZW5jaCBsYXlvdXQgc2VydmljZVxuXHQgKiBkaXJlY3RseTsgdGhpcyBjb250cm9sbGVyIG9ic2VydmVzIHRoZSBzZXJ2aWNlJ3MgdG9nZ2xlIGxpZmVjeWNsZSBldmVudHMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3RlclNpZGVQYW5lVG9nZ2xlQWN0aW9uKCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFRvZ2dsZVNpZGVQYW5lbCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlU2Vjb25kYXJ5U2lkZWJhcicsICdUb2dnbGUgU2lkZSBQYW5lbCcpLFxuXHRcdFx0XHRcdGljb246IHNlY29uZGFyeVNpZGViYXJUb2dnbGVDbG9zZWRJY29uLFxuXHRcdFx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0XHRcdGNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoQXV4aWxpYXJ5QmFyVmlzaWJsZUNvbnRleHQsIE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQpISxcblx0XHRcdFx0XHRcdGljb246IHNlY29uZGFyeVNpZGViYXJUb2dnbGVPcGVuSWNvbixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ29wZW5BbmRDbG9zZVNpZGVQYW5lbCcsICdPcGVuL1Nob3cgYW5kIENsb3NlL0hpZGUgdGhlIFNpZGUgUGFuZWwgKGVkaXRvciBhcmVhIGFuZCBhdXhpbGlhcnkgYmFyKScpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKElzUXVpY2tDaGF0U2Vzc2lvbkNvbnRleHQubmVnYXRlKCksIFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dCksXG5cdFx0XHRcdFx0XHRDdXN0b21WaWV3VmlzaWJsZUNvbnRleHQubmVnYXRlKClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5TZXNzaW9uc0NvbnRyaWIsXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUJcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1lbnU6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVzLlRpdGxlQmFyU2Vzc2lvbk1lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAxMSwgLy8gQWZ0ZXIgT3BlbiBpbiBWUyBDb2RlICg3KSwgUnVuIFNjcmlwdCAoOCksIGFuZCBUb2dnbGUgUGFuZWwgKDEwKVxuXHRcdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dC50b05lZ2F0ZWQoKSlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0Y29uc3Qgbm93VmlzaWJsZSA9IGFjY2Vzc29yLmdldChJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKS50b2dnbGVTaWRlUGFuZSgpO1xuXG5cdFx0XHRcdGxvZ1NpZGVQYW5lbFRvZ2dsZShhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpLCBub3dWaXNpYmxlKTtcblxuXHRcdFx0XHQvLyBBbm5vdW5jZSB2aXNpYmlsaXR5IGNoYW5nZSB0byBzY3JlZW4gcmVhZGVyc1xuXHRcdFx0XHRhbGVydChub3dWaXNpYmxlXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnc2lkZVBhbmVsVmlzaWJsZScsIFwiU2lkZSBQYW5lbCBzaG93blwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ3NpZGVQYW5lbEhpZGRlbicsIFwiU2lkZSBQYW5lbCBoaWRkZW5cIikpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhvb2sgZm9yIHN1YmNsYXNzZXMgdG8gcmVnaXN0ZXIgcGxhdGZvcm0tc3BlY2lmaWMgYXV4aWxpYXJ5IGJhclxuXHQgKiB2aWV3LXN0YXRlIG1hbmFnZW1lbnQuIFJ1bnMgYXQgdGhlIGVuZCBvZiB0aGUgYmFzZSBjb25zdHJ1Y3Rvci4gVGhlIGJhc2Vcblx0ICogaW1wbGVtZW50YXRpb24gZG9lcyBub3RoaW5nLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9yZWdpc3RlclZpZXdTdGF0ZU1hbmFnZW1lbnQoKTogdm9pZCB7IH1cblxuXHRwcm90ZWN0ZWQgX29uU2Vzc2lvblJlcGxhY2VkKGZyb206IElTZXNzaW9uLCB0bzogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzRWRpdG9yUGFydFZpc2liaWxpdHlQZXJTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIGBvbkRpZFJlcGxhY2VTZXNzaW9uYCBmaXJlcyBvbmx5IHdoZW4gYW4gdW50aXRsZWQgZHJhZnQgaXMgYXRvbWljYWxseVxuXHRcdC8vIHJlcGxhY2VkIGJ5IGl0cyBjb21taXR0ZWQgc2Vzc2lvbiBvbiBzdWJtaXQsIHNvIGl0IGFsd2F5cyBtZWFucyBcInRoZVxuXHRcdC8vIGNvbW1pdHRlZCBzZXNzaW9uIGluaGVyaXRzIHRoZSBkcmFmdCdzIG9uLXNjcmVlbiBzaWRlLXBhbmUgbGF5b3V0XCIuXG5cdFx0Ly8gUGVyc2lzdCB0aGUgZHJhZnQncyBsaXZlIGVkaXRvci1wYXJ0IHZpc2liaWxpdHkgb250byB0aGUgY29tbWl0dGVkXG5cdFx0Ly8gc2Vzc2lvbiBzbyB0aGUgZGVsYXllZCB3b3JraW5nLXNldCBhcHBseSByZXN0b3JlcyBpdCBhcy1sZWZ0IChpbnN0ZWFkIG9mXG5cdFx0Ly8gdGhlIGNyZWF0ZWQtc2Vzc2lvbiBkZWZhdWx0LCB3aGljaCB3b3VsZCByZXZlYWwgdGhlIGRvY2tlZCBlZGl0b3IpIGFuZCBpdFxuXHRcdC8vIGFsc28gc3Vydml2ZXMgYSByZWxvYWQuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IHJlcGxhY2VkU2Vzc2lvbklzQWN0aXZlID0gaXNFcXVhbChhY3RpdmVTZXNzaW9uPy5yZXNvdXJjZSwgZnJvbS5yZXNvdXJjZSkgfHwgaXNFcXVhbChhY3RpdmVTZXNzaW9uPy5yZXNvdXJjZSwgdG8ucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGVkaXRvclBhcnRIaWRkZW4gPSB0aGlzLl9lZGl0b3JQYXJ0SGlkZGVuQnlTZXNzaW9uLmdldChmcm9tLnJlc291cmNlKVxuXHRcdFx0Pz8gKHJlcGxhY2VkU2Vzc2lvbklzQWN0aXZlID8gIXRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKGVkaXRvclBhcnRIaWRkZW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZWRpdG9yUGFydEhpZGRlbkJ5U2Vzc2lvbi5zZXQodG8ucmVzb3VyY2UsIGVkaXRvclBhcnRIaWRkZW4pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBhdXhpbGlhcnkgYmFyIGN1cnJlbnRseSBoYXMgYXQgbGVhc3Qgb25lIGFjdGl2ZSB2aWV3IGNvbnRhaW5lclxuXHQgKiAoc2hvd24gYXMgYSB0YWIpLiBNaXJyb3JzIHRoZSB3b3JrYmVuY2gncyBvd24gY29udGFpbmVyLXZpc2liaWxpdHkgcnVsZVxuXHQgKiAoYCFoaWRlSWZFbXB0eSB8fCBpc1ZpZXdDb250YWluZXJBY3RpdmVgLCBmb2xkZWQgaW50byBgaXNWaWV3Q29udGFpbmVyQWN0aXZlYCkuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2hhc0FjdGl2ZUF1eFZpZXdDb250YWluZXJzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl92aWV3RGVzY3JpcHRvclNlcnZpY2Vcblx0XHRcdC5nZXRWaWV3Q29udGFpbmVyc0J5TG9jYXRpb24oVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcilcblx0XHRcdC5zb21lKGNvbnRhaW5lciA9PiB0aGlzLl92aWV3c1NlcnZpY2UuaXNWaWV3Q29udGFpbmVyQWN0aXZlKGNvbnRhaW5lci5pZCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29yZHMgYSBjb21wbGV0ZWQgd2hvbGUtc2lkZS1wYW5lIHRvZ2dsZSBmcm9tIHRoZSBkaWQgZXZlbnQncyBiZWZvcmUvYWZ0ZXJcblx0ICogc3RhdGUgd2hpbGUge0BsaW5rIF90b2dnbGluZ1NpZGVQYW5lfSBpcyBzdGlsbCBzZXQuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX29uU2lkZVBhbmVUb2dnbGVkKF9jb2xsYXBzZWQ6IGJvb2xlYW4sIF9wcmV2aW91c0F1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW4sIF9hdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuKTogdm9pZCB7IH1cblxuXHQvKipcblx0ICogW0I0XSBIb29rIHRoYXQgbGV0cyBhIHN1YmNsYXNzIHNuYXBzaG90IHRoZSBhY3RpdmUgc2Vzc2lvbidzIHZpZXcgc3RhdGUgd2hlblxuXHQgKiBzdGF0ZSBpcyBhYm91dCB0byBiZSBwZXJzaXN0ZWQuIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIGRvZXMgbm90aGluZy5cblx0ICovXG5cdHByb3RlY3RlZCBfY2FwdHVyZUFjdGl2ZVNlc3Npb25WaWV3U3RhdGUoX3Nlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7IH1cblxuXHQvKipcblx0ICogUnVucyBhIHNlc3Npb24tc3dpdGNoIGxheW91dCByZXN0b3JlIHdpdGgge0BsaW5rIF9pc1Jlc3RvcmluZ1Nlc3Npb25MYXlvdXR9XG5cdCAqIGhlbGQgdW50aWwgdGhlIChwb3NzaWJseSBhc3luYykgd29yayBzZXR0bGVzLCBzbyBwYXJ0LXZpc2liaWxpdHkgY2hhbmdlcyB0aGVcblx0ICogcmVzdG9yZSBjYXVzZXMgY2FuIGJlIHJlLWJhc2VsaW5lZCByYXRoZXIgdGhhbiByZWFjdGVkIHRvLlxuXHQgKi9cblx0cHJvdGVjdGVkIF93aXRoU2Vzc2lvbkxheW91dFJlc3RvcmUod29yazogKCkgPT4gdm9pZCB8IFByb21pc2U8dW5rbm93bj4pOiB2b2lkIHtcblx0XHR0aGlzLl9yZXN0b3JpbmdTZXNzaW9uTGF5b3V0RGVwdGgrKztcblx0XHRjb25zdCBzdXBwcmVzc2lvbiA9IHRoaXMuX3N1cHByZXNzRWRpdG9yVmlzaWJpbGl0eUR1cmluZ1Jlc3RvcmUoKTtcblx0XHRsZXQgc2V0dGxlZFN5bmMgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB3b3JrKCk7XG5cdFx0XHRpZiAoaXNUaGVuYWJsZShyZXN1bHQpKSB7XG5cdFx0XHRcdHNldHRsZWRTeW5jID0gZmFsc2U7XG5cdFx0XHRcdFByb21pc2UucmVzb2x2ZShyZXN1bHQpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZW5kU2Vzc2lvbkxheW91dFJlc3RvcmUoc3VwcHJlc3Npb24pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHNldHRsZWRTeW5jKSB7XG5cdFx0XHRcdHRoaXMuX2VuZFNlc3Npb25MYXlvdXRSZXN0b3JlKHN1cHByZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbmRTZXNzaW9uTGF5b3V0UmVzdG9yZShzdXBwcmVzc2lvbjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXN0b3JpbmdTZXNzaW9uTGF5b3V0RGVwdGgtLTtcblx0XHRzdXBwcmVzc2lvbj8uZGlzcG9zZSgpO1xuXHRcdGlmICh0aGlzLl9yZXN0b3JpbmdTZXNzaW9uTGF5b3V0RGVwdGggPT09IDApIHtcblx0XHRcdHRoaXMuX29uRGlkRW5kU2Vzc2lvbkxheW91dFJlc3RvcmUuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIb29rIHRvIHN1cHByZXNzIGVkaXRvci1wYXJ0IGF1dG8tdmlzaWJpbGl0eSBmb3IgdGhlIHdob2xlIHNlc3Npb24tc3dpdGNoXG5cdCAqIHJlc3RvcmUuIFRoZSBiYXNlIHJlc3RvcmUgY2F1c2VzIG5vIGxheW91dC1kcml2ZW4gZWRpdG9yIGNsb3Nlcywgc28gaXRcblx0ICogcmV0dXJucyBgdW5kZWZpbmVkYC5cblx0ICovXG5cdHByb3RlY3RlZCBfc3VwcHJlc3NFZGl0b3JWaXNpYmlsaXR5RHVyaW5nUmVzdG9yZSgpOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBIb29rIGRlY2lkaW5nIHdoZXRoZXIge0BsaW5rIF9hcHBseVdvcmtpbmdTZXR9IHJldmVhbHMgdGhlIGVkaXRvciBwYXJ0IHdoZW5cblx0ICogcmVzdG9yaW5nIGEgbm9uLWVtcHR5IHdvcmtpbmcgc2V0LlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zaG91bGRSZXZlYWxFZGl0b3JQYXJ0T25BcHBseShlZGl0b3JQYXJ0SGlkZGVuOiBib29sZWFuLCBpc01vZGFsOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFlZGl0b3JQYXJ0SGlkZGVuICYmICFpc01vZGFsO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhvb2sgZGVjaWRpbmcgd2hldGhlciB7QGxpbmsgX2FwcGx5V29ya2luZ1NldH0gcmV2ZWFscyB0aGUgZWRpdG9yIHBhcnQgZm9yIGFuXG5cdCAqIGVtcHR5IHdvcmtpbmcgc2V0LiBUaGUgYmFzZSBuZXZlciByZXZlYWxzIGluIHRoaXMgY2FzZS5cblx0ICovXG5cdHByb3RlY3RlZCBfc2hvdWxkUmV2ZWFsRWRpdG9yUGFydEZvckVtcHR5V29ya2luZ1NldChfcmV2ZWFsRWRpdG9yUGFydDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIb29rIGRlY2lkaW5nIHdoZXRoZXIge0BsaW5rIF9hcHBseVdvcmtpbmdTZXR9IGFjdGl2ZWx5IGhpZGVzIHRoZSBlZGl0b3IgcGFydFxuXHQgKiB3aGVuIHJlc3RvcmluZyBhIHNlc3Npb24gdGhhdCBoYWQgaXQgaGlkZGVuLiBUaGUgYmFzZSBuZXZlciBoaWRlcyAoaW4gdGhlXG5cdCAqIGNsYXNzaWMgbGF5b3V0IHRoZSBlZGl0b3IgcGFydCB2aXNpYmlsaXR5IGlzIG5vdCBhIHBlci1zZXNzaW9uIGNob2ljZSk7IHRoZVxuXHQgKiBzaW5nbGUtcGFuZSBsYXlvdXQgcmVzdG9yZXMgaXRzIGRvY2tlZCBlZGl0b3IgcGFydCBib3RoIHdheXMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3Nob3VsZEhpZGVFZGl0b3JQYXJ0T25BcHBseShfZWRpdG9yUGFydEhpZGRlbjogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKiBIb29rIGludm9rZWQgYmVmb3JlIGEgc2Vzc2lvbiB3b3JraW5nIHNldCBpcyBxdWV1ZWQgZm9yIGFwcGxpY2F0aW9uLiAqL1xuXHRwcm90ZWN0ZWQgX29uV2lsbEFwcGx5V29ya2luZ1NldChfd29ya2luZ1NldDogSUVkaXRvcldvcmtpbmdTZXQgfCAnZW1wdHknKTogdm9pZCB7IH1cblxuXHQvLyAtLS0gRWRpdG9yIHBhcnQgcmV2ZWFsIC0tLVxuXG5cdC8qKlxuXHQgKiBSZXZlYWxzIHRoZSBlZGl0b3IgcGFydC4gRWRpdG9yIHdvcmtpbmcgc2V0cyBhcmUgcmVzdG9yZWQgaW50byB0aGUgc2hhcmVkXG5cdCAqIGVkaXRvciBhcmVhIG9uIHNlc3Npb24gc3dpdGNoLCB3aGljaCByZXF1aXJlcyB0aGUgZWRpdG9yIHBhcnQgdG8gYmUgdmlzaWJsZS5cblx0ICovXG5cdHByaXZhdGUgX3JldmVhbEVkaXRvclBhcnRGb3JXb3JraW5nU2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHR9XG5cblx0LyoqIEhpZGVzIHRoZSBlZGl0b3IgcGFydCB0byByZXN0b3JlIGEgc2Vzc2lvbiB0aGF0IGhhZCBpdHMgZG9ja2VkIGVkaXRvciBjbG9zZWQuICovXG5cdHByaXZhdGUgX2hpZGVFZGl0b3JQYXJ0Rm9yV29ya2luZ1NldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHR9XG5cblx0Ly8gLS0tIFBlcnNpc3RlbmNlIFtCM10gLS0tXG5cblx0cHJpdmF0ZSBfbG9hZFN0YXRlKCk6IHZvaWQge1xuXHRcdC8vIExvYWQgZnJvbSBuZXcga2V5IGZpcnN0XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuX2xheW91dFN0YXRlU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBKU09OLnBhcnNlKHJhdykgYXMgSVNlc3Npb25MYXlvdXRFbnRyeVtdKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoZW50cnkuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAoZW50cnkuZWRpdG9yV29ya2luZ1NldCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fd29ya2luZ1NldHMuc2V0KHJlc291cmNlLCBlbnRyeS5lZGl0b3JXb3JraW5nU2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzRWRpdG9yUGFydFZpc2liaWxpdHlQZXJTZXNzaW9uICYmIGVudHJ5LmVkaXRvclBhcnRIaWRkZW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdG9yUGFydEhpZGRlbkJ5U2Vzc2lvbi5zZXQocmVzb3VyY2UsIGVudHJ5LmVkaXRvclBhcnRIaWRkZW4pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5faXNWaWV3U3RhdGVQZXJTZXNzaW9uICYmIGVudHJ5LnZpZXdTdGF0ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLnNldChyZXNvdXJjZSwgZW50cnkudmlld1N0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIENvcnJ1cHRlZCBkYXRhIFx1MjAxNCByZW1vdmUgdGhlIGJhZCBrZXkgc28gd2UgZG9uJ3Qga2VlcCBmYWlsaW5nLCB0aGVuIGZhbGwgdGhyb3VnaCB0byBsZWdhY3kgbWlncmF0aW9uXG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZSh0aGlzLl9sYXlvdXRTdGF0ZVN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1pZ3JhdGUgZnJvbSBsZWdhY3kga2V5IChzZXNzaW9ucy53b3JraW5nU2V0cylcblx0XHRjb25zdCBsZWdhY3lLZXkgPSB0aGlzLl9sZWdhY3lXb3JraW5nU2V0c1N0b3JhZ2VLZXk7XG5cdFx0aWYgKCFsZWdhY3lLZXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGVnYWN5UmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KGxlZ2FjeUtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKGxlZ2FjeVJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dHlwZSBMZWdhY3lFbnRyeSA9IHsgc2Vzc2lvblJlc291cmNlOiBzdHJpbmc7IGVkaXRvcldvcmtpbmdTZXQ/OiBJRWRpdG9yV29ya2luZ1NldDsgYXV4aWxpYXJ5QmFyU3RhdGU/OiB7IHZpc2libGU6IGJvb2xlYW47IGFjdGl2ZVZpZXdDb250YWluZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfTtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBKU09OLnBhcnNlKGxlZ2FjeVJhdykgYXMgTGVnYWN5RW50cnlbXSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKGVudHJ5LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKGVudHJ5LmVkaXRvcldvcmtpbmdTZXQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3dvcmtpbmdTZXRzLnNldChyZXNvdXJjZSwgZW50cnkuZWRpdG9yV29ya2luZ1NldCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlbnRyeS5hdXhpbGlhcnlCYXJTdGF0ZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLnNldChyZXNvdXJjZSwge1xuXHRcdFx0XHRcdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBlbnRyeS5hdXhpbGlhcnlCYXJTdGF0ZS52aXNpYmxlLFxuXHRcdFx0XHRcdFx0XHRhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IGVudHJ5LmF1eGlsaWFyeUJhclN0YXRlLmFjdGl2ZVZpZXdDb250YWluZXJJZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBjb3JydXB0ZWQgZGF0YVxuXHRcdFx0fVxuXHRcdFx0Ly8gUmVtb3ZlIGxlZ2FjeSBrZXkgYWZ0ZXIgbWlncmF0aW9uXG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUobGVnYWN5S2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IG11bHRpcGxlVmlzaWJsZSA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMuZ2V0KCkubGVuZ3RoID4gMTtcblxuXHRcdC8vIFtCNF0gQ2FwdHVyZSBjdXJyZW50IHN0YXRlIGZvciB0aGUgYWN0aXZlIHNlc3Npb24gKHNraXAgbXVsdGlwbGUtdmlzaWJsZSBhbmQgdW50aXRsZWQpLlxuXHRcdGlmIChhY3RpdmVTZXNzaW9uICYmICFtdWx0aXBsZVZpc2libGUgJiYgYWN0aXZlU2Vzc2lvbi5zdGF0dXMucmVhZCh1bmRlZmluZWQpICE9PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSB7XG5cdFx0XHR0aGlzLl9jYXB0dXJlQWN0aXZlU2Vzc2lvblZpZXdTdGF0ZShhY3RpdmVTZXNzaW9uLnJlc291cmNlKTtcblx0XHR9XG5cblx0XHQvLyBbQjRdIENhcHR1cmUgd29ya2luZyBzZXQgZm9yIHRoZSBhY3RpdmUgc2Vzc2lvbiAoc2tpcCB1bnRpdGxlZClcblx0XHRpZiAoYWN0aXZlU2Vzc2lvbiAmJiBhY3RpdmVTZXNzaW9uLnN0YXR1cy5yZWFkKHVuZGVmaW5lZCkgIT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdHRoaXMuX3NhdmVXb3JraW5nU2V0KGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdC8vIENvbGxlY3QgYWxsIHNlc3Npb24gcmVzb3VyY2VzIGFjcm9zcyBhbGwgbWFwc1xuXHRcdGNvbnN0IGFsbFJlc291cmNlcyA9IG5ldyBSZXNvdXJjZU1hcDx0cnVlPigpO1xuXHRcdHRoaXMuX3dvcmtpbmdTZXRzLmZvckVhY2goKF8sIHIpID0+IGFsbFJlc291cmNlcy5zZXQociwgdHJ1ZSkpO1xuXHRcdGlmICh0aGlzLl9pc1ZpZXdTdGF0ZVBlclNlc3Npb24pIHtcblx0XHRcdHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5mb3JFYWNoKChfLCByKSA9PiBhbGxSZXNvdXJjZXMuc2V0KHIsIHRydWUpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzRWRpdG9yUGFydFZpc2liaWxpdHlQZXJTZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3JQYXJ0SGlkZGVuQnlTZXNzaW9uLmZvckVhY2goKF8sIHIpID0+IGFsbFJlc291cmNlcy5zZXQociwgdHJ1ZSkpO1xuXHRcdH1cblxuXHRcdGlmIChhbGxSZXNvdXJjZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKHRoaXMuX2xheW91dFN0YXRlU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllczogSVNlc3Npb25MYXlvdXRFbnRyeVtdID0gW107XG5cdFx0YWxsUmVzb3VyY2VzLmZvckVhY2goKF8sIHJlc291cmNlKSA9PiB7XG5cdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGVkaXRvcldvcmtpbmdTZXQ6IHRoaXMuX3dvcmtpbmdTZXRzLmdldChyZXNvdXJjZSksXG5cdFx0XHRcdHZpZXdTdGF0ZTogdGhpcy5faXNWaWV3U3RhdGVQZXJTZXNzaW9uID8gdGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLmdldChyZXNvdXJjZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVkaXRvclBhcnRIaWRkZW46IHRoaXMuX2lzRWRpdG9yUGFydFZpc2liaWxpdHlQZXJTZXNzaW9uID8gdGhpcy5fZWRpdG9yUGFydEhpZGRlbkJ5U2Vzc2lvbi5nZXQocmVzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy5fbGF5b3V0U3RhdGVTdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShlbnRyaWVzKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdC8vIC0tLSBQYW5lbCBbQjFdIC0tLVxuXG5cdHByaXZhdGUgX3N5bmNQYW5lbFZpc2liaWxpdHkoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhc1Zpc2libGUgPSB0aGlzLl9wYW5lbFZpc2liaWxpdHlCeVNlc3Npb24uZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Ly8gRGVmYXVsdCB0byBoaWRkZW4gaWYgd2UgaGF2ZSBubyByZWNvcmQgZm9yIHRoaXMgc2Vzc2lvblxuXHRcdHRoaXMuX2xheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih3YXNWaXNpYmxlICE9PSB0cnVlLCBQYXJ0cy5QQU5FTF9QQVJUKTtcblx0fVxuXG5cdC8vIC0tLSBFZGl0b3Igd29ya2luZyBzZXRzIFtCMl0gLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlXb3JraW5nU2V0KHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogeyByZWFkb25seSBpc0luaXRpYWxSZXN0b3JlPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gUmVzdG9yaW5nIGEgc2Vzc2lvbidzIGVkaXRvciB3b3JraW5nIHNldCBtdXN0IG5ldmVyIHB1bGwga2V5Ym9hcmQgZm9jdXNcblx0XHQvLyBpbnRvIHRoZSBlZGl0b3IgYXJlYS4gRm9jdXMgZHVyaW5nIGEgc2Vzc2lvbiBzd2l0Y2ggaXMgb3duZWQgYnkgdGhlXG5cdFx0Ly8gc3dpdGNoIGl0c2VsZiAoaXQgbW92ZXMgZm9jdXMgaW50byB0aGUgYWN0aXZlIHNlc3Npb24ncyBjaGF0IGlucHV0LCBvclxuXHRcdC8vIGxlYXZlcyBpdCBvbiB0aGUgcGFuZWwpOyBsZXR0aW5nIHRoZSBlZGl0b3IgcmVzdG9yZSBncmFiIGZvY3VzIHdvdWxkXG5cdFx0Ly8gc3RlYWwgaXQgZnJvbSB0aGUgY2hhdCBpbnB1dCB3aGVuZXZlciB0aGUgdGFyZ2V0IHNlc3Npb24gaGFzIGVkaXRvcnNcblx0XHQvLyBvcGVuLlxuXHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSB0cnVlO1xuXHRcdGNvbnN0IHdvcmtpbmdTZXQ6IElFZGl0b3JXb3JraW5nU2V0IHwgJ2VtcHR5JyA9IHNlc3Npb25SZXNvdXJjZVxuXHRcdFx0PyAodGhpcy5fd29ya2luZ1NldHMuZ2V0KHNlc3Npb25SZXNvdXJjZSkgPz8gJ2VtcHR5Jylcblx0XHRcdDogJ2VtcHR5Jztcblx0XHR0aGlzLl9vbldpbGxBcHBseVdvcmtpbmdTZXQod29ya2luZ1NldCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fd29ya2luZ1NldFNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBXaGVuIG11bHRpcGxlIHNlc3Npb25zIGFyZSB2aXNpYmxlLCBhcHBseWluZyBhIHdvcmtpbmcgc2V0IG11c3QgbmV2ZXJcblx0XHRcdC8vIGNoYW5nZSB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgZWRpdG9yIHBhcnQ6IHRoZSBlZGl0b3IgYXJlYSBpcyBzaGFyZWRcblx0XHRcdC8vIGFjcm9zcyB0aGUgdmlzaWJsZSBzZXNzaW9ucyBhbmQgaXRzIHZpc2liaWxpdHkgaXMgY29udHJvbGxlZCBieSB0aGVcblx0XHRcdC8vIHVzZXIgKGFuZCBieSBkaXJlY3QgZWRpdG9yIG9wZW4vY2xvc2UgZXZlbnRzIG91dHNpZGUgdGhpcyBwYXRoKS5cblx0XHRcdGlmICh0aGlzLl9zZXNzaW9uc1NlcnZpY2UudmlzaWJsZVNlc3Npb25zLmdldCgpLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Y29uc3Qgc3VwcHJlc3Npb24gPSB0aGlzLl9sYXlvdXRTZXJ2aWNlLnN1cHByZXNzRWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5KCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5hcHBseVdvcmtpbmdTZXQod29ya2luZ1NldCwgeyBwcmVzZXJ2ZUZvY3VzIH0pO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHN1cHByZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlzTW9kYWwgPSB0aGlzLl91c2VNb2RhbENvbmZpZ09icy5nZXQoKSA9PT0gJ2FsbCc7XG5cdFx0XHQvLyBUaGUgdXNlciBtYXkgaGF2ZSBoaWRkZW4gdGhlIGVkaXRvciBwYXJ0IGZvciB0aGlzIHNlc3Npb24gKGUuZy4gYnlcblx0XHRcdC8vIGNsb3NpbmcgdGhlIFNpZGUgUGFuZWwgd2hpbGUga2VlcGluZyBlZGl0b3JzIG9wZW4pLiBSZXN0b3JlIGl0IGFzXG5cdFx0XHQvLyBsZWZ0IGluc3RlYWQgb2YgZm9yY2luZyB0aGUgZWRpdG9yIHBhcnQgYmFjayBvcGVuIG9uIHN3aXRjaC4gQVxuXHRcdFx0Ly8gZHJhZnRcdTIxOTJjb21taXR0ZWQgc3VibWl0IHJlY29yZHMgdGhlIGRyYWZ0J3MgZWRpdG9yLXBhcnQgdmlzaWJpbGl0eSBvbnRvXG5cdFx0XHQvLyB0aGUgY29tbWl0dGVkIHNlc3Npb24gKHNlZSBgX29uU2Vzc2lvblJlcGxhY2VkYCksIHNvIHRoaXMgcmVzdG9yZXMgdGhlXG5cdFx0XHQvLyBzdWJtaXR0ZWQgbGF5b3V0IHRvby5cblx0XHRcdGNvbnN0IGVkaXRvclBhcnRIaWRkZW4gPSB0aGlzLl9pc0VkaXRvclBhcnRWaXNpYmlsaXR5UGVyU2Vzc2lvbiAmJiBzZXNzaW9uUmVzb3VyY2Vcblx0XHRcdFx0PyB0aGlzLl9lZGl0b3JQYXJ0SGlkZGVuQnlTZXNzaW9uLmdldChzZXNzaW9uUmVzb3VyY2UpID09PSB0cnVlXG5cdFx0XHRcdDogZmFsc2U7XG5cdFx0XHRjb25zdCByZXZlYWxFZGl0b3JQYXJ0ID0gIW9wdGlvbnM/LmlzSW5pdGlhbFJlc3RvcmVcblx0XHRcdFx0JiYgdGhpcy5fc2hvdWxkUmV2ZWFsRWRpdG9yUGFydE9uQXBwbHkoZWRpdG9yUGFydEhpZGRlbiwgaXNNb2RhbCk7XG5cdFx0XHQvLyBSZXN0b3JlIGEgc2Vzc2lvbiB0aGF0IGhhZCBpdHMgKGRvY2tlZCkgZWRpdG9yIHBhcnQgY2xvc2VkIGJ5IGFjdGl2ZWx5XG5cdFx0XHQvLyBoaWRpbmcgaXQsIHNvIHJldHVybmluZyBmcm9tIGEgc2Vzc2lvbiB0aGF0IGhhZCBpdCBvcGVuIGRvZXMgbm90IGxlYXZlXG5cdFx0XHQvLyBpdCB2aXNpYmxlLiBNdXR1YWxseSBleGNsdXNpdmUgd2l0aCByZXZlYWxpbmcuXG5cdFx0XHRjb25zdCBoaWRlRWRpdG9yUGFydCA9ICFvcHRpb25zPy5pc0luaXRpYWxSZXN0b3JlXG5cdFx0XHRcdCYmICFyZXZlYWxFZGl0b3JQYXJ0XG5cdFx0XHRcdCYmIHRoaXMuX3Nob3VsZEhpZGVFZGl0b3JQYXJ0T25BcHBseShlZGl0b3JQYXJ0SGlkZGVuKTtcblxuXHRcdFx0aWYgKHdvcmtpbmdTZXQgPT09ICdlbXB0eScpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5hcHBseVdvcmtpbmdTZXQod29ya2luZ1NldCwgeyBwcmVzZXJ2ZUZvY3VzIH0pO1xuXHRcdFx0XHRpZiAodGhpcy5fc2hvdWxkUmV2ZWFsRWRpdG9yUGFydEZvckVtcHR5V29ya2luZ1NldChyZXZlYWxFZGl0b3JQYXJ0KSAmJiAhdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmV2ZWFsRWRpdG9yUGFydEZvcldvcmtpbmdTZXQoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChoaWRlRWRpdG9yUGFydCAmJiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0XHR0aGlzLl9oaWRlRWRpdG9yUGFydEZvcldvcmtpbmdTZXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9uIHRoZSBpbml0aWFsIHJlc3RvcmUgYWZ0ZXIgYSByZWxvYWQsIHByZXNlcnZlIHRoZSBlZGl0b3IgcGFydFxuXHRcdFx0Ly8gdmlzaWJpbGl0eSB0aGF0IHRoZSB3b3JrYmVuY2ggYWxyZWFkeSByZXN0b3JlZC4gU2luZ2xlLXBhbmUgaXMgdGhlXG5cdFx0XHQvLyBMYXlvdXRzIG1heSBvcHQgaW50byBhbiBhdXRob3JpdGF0aXZlIGVkaXRvci1oaWRkZW4gcmVzdG9yZSB0aHJvdWdoXG5cdFx0XHQvLyBgX3Nob3VsZEhpZGVFZGl0b3JQYXJ0T25BcHBseWA7IHRoZSBjbGFzc2ljIGFuZCBzaW5nbGUtcGFuZSBsYXlvdXRzIGRvIG5vdC5cblx0XHRcdGlmIChvcHRpb25zPy5pc0luaXRpYWxSZXN0b3JlKSB7XG5cdFx0XHRcdGNvbnN0IHN1cHByZXNzaW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5zdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuYXBwbHlXb3JraW5nU2V0KHdvcmtpbmdTZXQsIHsgcHJlc2VydmVGb2N1cyB9KTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRzdXBwcmVzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX3Nob3VsZEhpZGVFZGl0b3JQYXJ0T25BcHBseShlZGl0b3JQYXJ0SGlkZGVuKSAmJiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0XHR0aGlzLl9oaWRlRWRpdG9yUGFydEZvcldvcmtpbmdTZXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXZlYWxFZGl0b3JQYXJ0ICYmICF0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0dGhpcy5fcmV2ZWFsRWRpdG9yUGFydEZvcldvcmtpbmdTZXQoKTtcblx0XHRcdH0gZWxzZSBpZiAoaGlkZUVkaXRvclBhcnQgJiYgdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdHRoaXMuX2hpZGVFZGl0b3JQYXJ0Rm9yV29ya2luZ1NldCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmFwcGx5V29ya2luZ1NldCh3b3JraW5nU2V0LCB7IHByZXNlcnZlRm9jdXMgfSk7XG5cdFx0XHRpZiAocmV2ZWFsRWRpdG9yUGFydCAmJiByZXN1bHQgJiYgIXRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSkge1xuXHRcdFx0XHR0aGlzLl9yZXZlYWxFZGl0b3JQYXJ0Rm9yV29ya2luZ1NldCgpO1xuXHRcdFx0fSBlbHNlIGlmIChoaWRlRWRpdG9yUGFydCAmJiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdykpIHtcblx0XHRcdFx0dGhpcy5faGlkZUVkaXRvclBhcnRGb3JXb3JraW5nU2V0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zYXZlV29ya2luZ1NldChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX2RlbGV0ZVdvcmtpbmdTZXQoc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIE5vdGU6IHRoZSBlZGl0b3IgcGFydCdzIGhpZGRlbiBzdGF0ZSBpcyBjYXB0dXJlZCBlYWdlcmx5IGJ5IHRoZSBbQjJdXG5cdFx0Ly8gcGFydC12aXNpYmlsaXR5IGxpc3RlbmVyIGF0IHRoZSBtb21lbnQgdGhlIHVzZXIgY2hhbmdlcyBpdCwgbm90IGhlcmUgXHUyMDE0XG5cdFx0Ly8gcmUtcmVhZGluZyBpdCBsYXppbHkgYXQgc3dpdGNoLWF3YXkgdGltZSByYWNlcyB3aXRoIHRoZSBpbmNvbWluZ1xuXHRcdC8vIHNlc3Npb24ncyBhc3luYyBsYXlvdXQgcmVzdG9yZSBhbmQgY291bGQgcmVjb3JkIHRoZSB3cm9uZyB2YWx1ZS5cblxuXHRcdGlmICh0aGlzLl9lZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHdvcmtpbmdTZXROYW1lID0gYHNlc3Npb24td29ya2luZy1zZXQ6JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gO1xuXHRcdFx0Y29uc3Qgd29ya2luZ1NldCA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2Uuc2F2ZVdvcmtpbmdTZXQod29ya2luZ1NldE5hbWUpO1xuXHRcdFx0dGhpcy5fd29ya2luZ1NldHMuc2V0KHNlc3Npb25SZXNvdXJjZSwgd29ya2luZ1NldCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVsZXRlV29ya2luZ1NldChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4aXN0aW5nV29ya2luZ1NldCA9IHRoaXMuX3dvcmtpbmdTZXRzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghZXhpc3RpbmdXb3JraW5nU2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yR3JvdXBzU2VydmljZS5kZWxldGVXb3JraW5nU2V0KGV4aXN0aW5nV29ya2luZ1NldCk7XG5cdFx0dGhpcy5fd29ya2luZ1NldHMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxpQkFBaUI7QUFDdEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxTQUFTLFNBQVMsNEJBQTRCLGFBQWEscUJBQXFCLG1CQUFtQjtBQUM1RyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBNEIsMEJBQTBCLG9DQUFvQztBQUNuRyxTQUFTLHdCQUF3Qiw2QkFBNkI7QUFDOUQsU0FBUyw0QkFBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsYUFBYTtBQUN0QixTQUFTLCtCQUErQiwwQkFBMEIsMkJBQTJCLHNDQUFz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
