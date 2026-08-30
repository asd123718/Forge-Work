import { mainWindow } from "../../../../base/browser/window.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import product from "../../../../platform/product/common/product.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ViewContainerLocation } from "../../../../workbench/common/views.js";
import { Parts } from "../../../../workbench/services/layout/browser/layoutService.js";
import { sessionHasChanges } from "../../../services/sessions/common/session.js";
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID } from "../../changes/common/changes.js";
import { SESSIONS_FILES_CONTAINER_ID } from "../../files/browser/files.contribution.js";
import { BaseLayoutController } from "./baseSessionLayoutController.js";
const NEW_SESSION_VIEW_STATE_KEY = "sessions.newSessionViewState";
const SMALL_WINDOW_MAX_WIDTH = 1800;
const RESPONSIVE_SIDEBAR_SETTING = "sessions.layout.autoCollapseSessionsSidebar";
class LayoutController extends BaseLayoutController {
  constructor() {
    super(...arguments);
    /** [D7] `true` while the sidebar is hidden because the controller auto-hid it; only such hides are auto-reverted. */
    this._sidebarAutoHidden = false;
    /** [D7] Guards the manual-toggle listener while the controller itself toggles the sidebar. */
    this._applyingAutoSidebar = false;
    /** [D7] Last computed space-constrained state, so the autorun only acts on real transitions. */
    this._previousSpaceConstrained = false;
    /** [D2/D8] `true` while the controller hides the side pane to restore a session's remembered state, so the hide isn't captured as a user choice. */
    this._hidingAuxiliaryBarForRestore = false;
  }
  _registerViewStateManagement() {
    this._loadNewSessionViewState();
    const activeSessionIsCreatedObs = derived((reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return activeSession?.isCreated.read(reader) ?? false;
    });
    const activeSessionHasWorkspaceObs = derived((reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      return activeSession?.workspace.read(reader)?.folders?.[0]?.root !== void 0;
    });
    const editorMaximizedObs = observableFromEvent(
      this,
      this._layoutService.onDidChangeEditorMaximized,
      () => this._layoutService.isEditorMaximized()
    );
    let previousSessionResource;
    let previousIsCreated = false;
    this._register(autorun((reader) => {
      const editorMaximized = editorMaximizedObs.read(reader);
      const activeSessionResource = this.activeSessionResourceObs.read(reader);
      const isCreated = activeSessionIsCreatedObs.read(reader);
      if (editorMaximized) {
        previousSessionResource = activeSessionResource;
        previousIsCreated = isCreated;
        void this._viewsService.openView(CHANGES_VIEW_ID, false);
        return;
      }
      const activeSessionHasWorkspace = activeSessionHasWorkspaceObs.read(reader);
      const multipleVisible = this.multipleSessionsVisibleObs.read(reader);
      if (multipleVisible) {
        previousSessionResource = activeSessionResource;
        previousIsCreated = isCreated;
        return;
      }
      const isSessionSwitch = previousSessionResource !== void 0 && !isEqual(previousSessionResource, activeSessionResource);
      if (isSessionSwitch) {
        this._captureViewState(previousSessionResource);
      }
      const isSubmit = previousSessionResource !== void 0 && !isSessionSwitch && !previousIsCreated && isCreated && activeSessionResource !== void 0;
      previousSessionResource = activeSessionResource;
      previousIsCreated = isCreated;
      if (isSubmit) {
        this._withSessionLayoutRestore(() => this._onNewSessionSubmitted(activeSessionResource));
        return;
      }
      this._withSessionLayoutRestore(
        () => this._syncAuxiliaryBarVisibility(activeSessionResource, activeSessionHasWorkspace, isCreated)
      );
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId !== Parts.AUXILIARYBAR_PART) {
        return;
      }
      if (this._togglingSidePane) {
        return;
      }
      if (this._hidingAuxiliaryBarForRestore) {
        return;
      }
      if (this._isRestoringSessionLayout) {
        return;
      }
      if (this.multipleSessionsVisibleObs.get()) {
        return;
      }
      if (this._layoutService.isEditorMaximized()) {
        return;
      }
      const activeSession = this._sessionsService.activeSession.get();
      if (!activeSession) {
        return;
      }
      if (!activeSession.isCreated.get()) {
        this._setNewSessionViewState({ auxiliaryBarVisible: e.visible });
      } else {
        if (e.visible && this._restoreSavedAuxiliaryBarContainerOnReveal(activeSession.resource)) {
          return;
        }
        this._captureViewState(activeSession.resource);
      }
    }));
    this._registerChangesAutoReveal();
    this._registerResponsiveSidebar();
    this._registerAuxiliaryBarPartVisibility();
    this._registerNewSessionRules();
  }
  _registerChangesAutoReveal() {
    this._register(this._editorService.onDidActiveEditorChange(() => this._revealChangesViewOnFirstOpen()));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId === Parts.EDITOR_PART && e.visible) {
        this._revealChangesViewOnFirstOpen();
      }
    }));
  }
  _registerNewSessionRules() {
  }
  _onSessionReplaced(from, to) {
    super._onSessionReplaced(from, to);
    const activeSession = this._sessionsService.activeSession.get();
    const replacedSessionIsActive = isEqual(activeSession?.resource, from.resource) || isEqual(activeSession?.resource, to.resource);
    const auxiliaryBarVisible = replacedSessionIsActive ? this._layoutService.isVisible(Parts.AUXILIARYBAR_PART) : this._newSessionViewState?.auxiliaryBarVisible;
    if (auxiliaryBarVisible === void 0) {
      return;
    }
    this._viewStateBySession.set(to.resource, {
      auxiliaryBarVisible,
      auxiliaryBarActiveViewContainerId: replacedSessionIsActive && auxiliaryBarVisible ? this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId() : void 0
    });
  }
  /**
   * [D10] Keep the auxiliary-bar part hidden when it has no active view
   * containers (e.g. a workspace-less quick chat where Changes+Files are gated
   * off), so an empty column is never shown. Re-checks on container add/remove,
   * location moves, active-view-descriptor changes (the gating signal), and
   * aux-bar visibility changes. Only ever hides — reveals stay with [D3]/[D8].
   */
  _registerAuxiliaryBarPartVisibility() {
    const modelListeners = this._register(new DisposableStore());
    const rewire = () => {
      modelListeners.clear();
      for (const container of this._viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar)) {
        modelListeners.add(this._viewDescriptorService.getViewContainerModel(container).onDidChangeActiveViewDescriptors(() => this._syncAuxiliaryBarPartVisibility()));
      }
      this._syncAuxiliaryBarPartVisibility();
    };
    this._register(this._viewDescriptorService.onDidChangeViewContainers(rewire));
    this._register(this._viewDescriptorService.onDidChangeContainerLocation(rewire));
    this._register(this._viewsService.onDidChangeViewContainerVisibility((e) => {
      if (e.location === ViewContainerLocation.AuxiliaryBar) {
        this._syncAuxiliaryBarPartVisibility();
      }
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId === Parts.AUXILIARYBAR_PART && e.visible) {
        this._syncAuxiliaryBarPartVisibility();
      }
    }));
    rewire();
  }
  /** [D10] Hide the aux-bar part when it has no active view containers; never reveals it. */
  _syncAuxiliaryBarPartVisibility() {
    if (this._layoutService.isSinglePaneLayoutEnabled) {
      return;
    }
    if (this._hasActiveAuxViewContainers()) {
      return;
    }
    const activeSession = this._sessionsService.activeSession.get();
    if (activeSession?.isQuickChat?.get() !== true) {
      return;
    }
    if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
      const suppression = this._layoutService.suppressEditorPartAutoVisibility();
      try {
        this._hideAuxiliaryBarForRestore();
      } finally {
        suppression.dispose();
      }
    }
  }
  /**
   * [D8] When a Changes (multi-diff) editor is opened (becomes active, or its
   * editor part is re-revealed) for an existing session, show the Changes view
   * in the side pane unless the user explicitly hid the aux bar for that
   * session. This reveals it the first time (no remembered choice) and again
   * after the whole side pane was closed (D9, which keeps the remembered choice
   * "open"), but respects an explicit aux-bar-hidden choice. The reveal is
   * captured by [D2]. Skipped while a side-pane toggle is in progress (so the
   * toggle restores exactly the remembered parts, D9), while the editor is
   * maximized (D5) or while multiple sessions are visible, where the side pane
   * is managed by other rules.
   */
  _revealChangesViewOnFirstOpen() {
    if (this._togglingSidePane) {
      return;
    }
    const activeEditorResource = this._editorService.activeEditor?.resource;
    if (!activeEditorResource) {
      return;
    }
    const changesSessionResource = this._sessionChangesService.getSessionResource(activeEditorResource);
    if (!changesSessionResource) {
      return;
    }
    if (this.multipleSessionsVisibleObs.get() || this._layoutService.isEditorMaximized()) {
      return;
    }
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession || !isEqual(activeSession.resource, changesSessionResource)) {
      return;
    }
    if (!activeSession.isCreated.get()) {
      return;
    }
    if (!this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)) {
      return;
    }
    const savedState = this._viewStateBySession.get(changesSessionResource);
    if (savedState) {
      if (this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
        return;
      }
      if (!savedState.auxiliaryBarVisible && !savedState.auxiliaryBarHiddenByCollapse) {
        return;
      }
    }
    void this._viewsService.openView(CHANGES_VIEW_ID, false);
  }
  /**
   * On a small window, auto-hide the sessions sidebar while both the editor and
   * auxiliary bar are open and auto-show it again once either closes — unless the
   * user closed the sidebar themselves. Disabled while multiple sessions are
   * visible and never triggered by session navigation. Gated by the experimental
   * `sessions.layout.autoCollapseSessionsSidebar` setting.
   */
  _registerResponsiveSidebar() {
    const enabledObs = observableConfigValue(RESPONSIVE_SIDEBAR_SETTING, product.quality !== "stable", this._configurationService);
    const smallWindowObs = observableFromEvent(
      this,
      this._layoutService.onDidLayoutMainContainer,
      () => this._layoutService.mainContainerDimension.width <= SMALL_WINDOW_MAX_WIDTH
    );
    const editorVisibleObs = observableFromEvent(
      this,
      this._layoutService.onDidChangePartVisibility,
      () => this._layoutService.isVisible(Parts.EDITOR_PART, mainWindow)
    );
    const auxiliaryBarVisibleObs = observableFromEvent(
      this,
      this._layoutService.onDidChangePartVisibility,
      () => this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)
    );
    const editorMaximizedObs = observableFromEvent(
      this,
      this._layoutService.onDidChangeEditorMaximized,
      () => this._layoutService.isEditorMaximized()
    );
    const spaceConstrainedObs = derived((reader) => enabledObs.read(reader) && !this.multipleSessionsVisibleObs.read(reader) && smallWindowObs.read(reader) && editorVisibleObs.read(reader) && auxiliaryBarVisibleObs.read(reader));
    this._previousSpaceConstrained = spaceConstrainedObs.get();
    this._register(autorun((reader) => {
      if (editorMaximizedObs.read(reader)) {
        return;
      }
      const constrained = spaceConstrainedObs.read(reader);
      if (this._isRestoringSessionLayout) {
        this._previousSpaceConstrained = constrained;
        return;
      }
      if (constrained === this._previousSpaceConstrained) {
        return;
      }
      this._previousSpaceConstrained = constrained;
      if (constrained) {
        if (this._setSidebarAutoHidden(true)) {
          this._sidebarAutoHidden = true;
        }
      } else if (this._sidebarAutoHidden) {
        this._setSidebarAutoHidden(false);
        this._sidebarAutoHidden = false;
      }
    }));
    this._register(this._layoutService.onDidChangePartVisibility((e) => {
      if (e.partId !== Parts.SIDEBAR_PART || this._applyingAutoSidebar) {
        return;
      }
      this._sidebarAutoHidden = false;
    }));
  }
  /** Returns `true` when the sidebar visibility was actually changed. */
  _setSidebarAutoHidden(hidden) {
    if (this._layoutService.isVisible(Parts.SIDEBAR_PART) === !hidden) {
      return false;
    }
    this._applyingAutoSidebar = true;
    try {
      this._layoutService.setPartHidden(hidden, Parts.SIDEBAR_PART);
    } finally {
      this._applyingAutoSidebar = false;
    }
    return true;
  }
  // [B4] Snapshot the active session's aux-bar state when persisting.
  _captureActiveSessionViewState(sessionResource) {
    this._captureViewState(sessionResource);
  }
  /**
   * [D9b] Records a whole-side-pane toggle for the active session. For an
   * uncreated session it updates the shared new-session choice. For a created
   * session, only a full collapse of a previously-visible aux bar is marked as a
   * collapse-driven hide (so opening Changes later re-reveals it); any other
   * outcome just captures the resulting state, preserving an explicit aux-bar
   * hide. See `desktopSessionLayoutController.md`.
   */
  _onSidePaneToggled(collapsed, previousAuxiliaryBarVisible, auxiliaryBarVisible) {
    if (this.multipleSessionsVisibleObs.get()) {
      return;
    }
    const activeSession = this._sessionsService.activeSession.get();
    if (!activeSession) {
      return;
    }
    if (!activeSession.isCreated.get()) {
      this._setNewSessionViewState({ auxiliaryBarVisible });
      return;
    }
    if (collapsed && previousAuxiliaryBarVisible) {
      const activeViewContainerId = this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId();
      this._viewStateBySession.set(activeSession.resource, {
        auxiliaryBarVisible: false,
        auxiliaryBarActiveViewContainerId: activeViewContainerId,
        auxiliaryBarHiddenByCollapse: true
      });
      return;
    }
    this._captureViewState(activeSession.resource);
  }
  // --- Auxiliary bar [D1] ---
  _captureViewState(sessionResource) {
    const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
    const activeViewContainerId = this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId();
    const previous = this._viewStateBySession.get(sessionResource);
    const auxiliaryBarHiddenByCollapse = !auxiliaryBarVisible && previous?.auxiliaryBarHiddenByCollapse === true;
    this._viewStateBySession.set(sessionResource, {
      auxiliaryBarVisible,
      auxiliaryBarActiveViewContainerId: activeViewContainerId,
      ...auxiliaryBarHiddenByCollapse ? { auxiliaryBarHiddenByCollapse: true } : {}
    });
  }
  _setNewSessionViewState(state) {
    this._newSessionViewState = state;
    this._storageService.store(NEW_SESSION_VIEW_STATE_KEY, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  /**
   * [D4] When a new (uncreated) session is submitted it becomes a real session
   * while staying active. Keep the auxiliary bar exactly as the user left it: if
   * open, keep it open on the container it is already showing; if closed, keep it
   * closed and record no container so opening the side pane later picks the
   * default for the session's change state at that time ([D3d]). The resulting
   * state is persisted so later syncs don't fall back to hidden.
   */
  _onNewSessionSubmitted(sessionResource) {
    const auxiliaryBarVisible = this._layoutService.isVisible(Parts.AUXILIARYBAR_PART);
    this._viewStateBySession.set(sessionResource, {
      auxiliaryBarVisible,
      auxiliaryBarActiveViewContainerId: auxiliaryBarVisible ? this._paneCompositePartService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.getId() : void 0
    });
  }
  // [D3] Restore the auxiliary bar in strict priority order.
  // Note: This method is intentionally synchronous (void return). View-opening calls are
  // fire-and-forget so that _isRestoringSessionLayout ends immediately after sync operations.
  // This allows D2 to capture user actions that happen after the sync restore but before
  // working-set apply, while still skipping single-pane detail-panel reveals during working-set apply.
  _syncAuxiliaryBarVisibility(sessionResource, hasWorkspace, isCreated) {
    if (!sessionResource || !hasWorkspace) {
      return;
    }
    if (!isCreated) {
      if (this._newSessionViewState && !this._newSessionViewState.auxiliaryBarVisible) {
        this._hideAuxiliaryBarForRestore();
        return;
      }
      void this._openDefaultAuxiliaryBarContainer();
      return;
    }
    const savedState = this._viewStateBySession.get(sessionResource);
    if (!savedState || !savedState.auxiliaryBarVisible) {
      this._hideAuxiliaryBarForRestore();
      return;
    }
    const savedContainerId = savedState.auxiliaryBarActiveViewContainerId;
    if (savedContainerId && this._isAuxiliaryBarContainerPinned(savedContainerId)) {
      void this._viewsService.openViewContainer(savedContainerId, false);
      return;
    }
    void this._openDefaultAuxiliaryBarContainer();
  }
  /**
   * [D3d] The container the side pane defaults to for the active session:
   * Changes once the session has produced at least one change (in any of its
   * chats), Files until then. Falls back to Changes when the user has unpinned
   * the Files pane, since there is nothing else to show.
   *
   * Read untracked on purpose: the default is evaluated at the moment the side
   * pane is opened, so a change landing later never switches a pane the user is
   * already looking at.
   */
  _defaultAuxiliaryBarContainerId() {
    if (!this._isAuxiliaryBarContainerPinned(SESSIONS_FILES_CONTAINER_ID)) {
      return CHANGES_VIEW_CONTAINER_ID;
    }
    const activeSession = this._sessionsService.activeSession.get();
    return activeSession && sessionHasChanges(activeSession, void 0) ? CHANGES_VIEW_CONTAINER_ID : SESSIONS_FILES_CONTAINER_ID;
  }
  /** [D3d] Opens the container chosen by {@link _defaultAuxiliaryBarContainerId}. */
  _openDefaultAuxiliaryBarContainer(containerId = this._defaultAuxiliaryBarContainerId()) {
    if (containerId === CHANGES_VIEW_CONTAINER_ID) {
      return this._viewsService.openView(CHANGES_VIEW_ID, false);
    }
    return this._viewsService.openViewContainer(containerId, false);
  }
  _restoreSavedAuxiliaryBarContainerOnReveal(sessionResource) {
    const savedState = this._viewStateBySession.get(sessionResource);
    if (!savedState || savedState.auxiliaryBarVisible) {
      return false;
    }
    const savedContainerId = savedState.auxiliaryBarActiveViewContainerId;
    if (savedContainerId && this._isAuxiliaryBarContainerPinned(savedContainerId)) {
      this._viewStateBySession.set(sessionResource, { ...savedState, auxiliaryBarVisible: true });
      void this._viewsService.openViewContainer(savedContainerId, false);
    } else {
      const defaultContainerId = this._defaultAuxiliaryBarContainerId();
      this._viewStateBySession.set(sessionResource, {
        auxiliaryBarVisible: true,
        auxiliaryBarActiveViewContainerId: defaultContainerId
      });
      void this._openDefaultAuxiliaryBarContainer(defaultContainerId);
    }
    return true;
  }
  /**
   * [D2/D8] Hide the side pane as part of restoring a session's remembered
   * state. The synchronous guard makes the [D2] listener ignore the resulting
   * visibility change so a restore-driven hide is never recorded as a new
   * per-session choice.
   */
  _hideAuxiliaryBarForRestore() {
    this._hidingAuxiliaryBarForRestore = true;
    try {
      this._layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    } finally {
      this._hidingAuxiliaryBarForRestore = false;
    }
  }
  _isAuxiliaryBarContainerPinned(containerId) {
    return this._paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.AuxiliaryBar).includes(containerId);
  }
  _loadNewSessionViewState() {
    const newSessionRaw = this._storageService.get(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
    if (!newSessionRaw) {
      return;
    }
    try {
      const parsed = JSON.parse(newSessionRaw);
      if (parsed && typeof parsed.auxiliaryBarVisible === "boolean") {
        this._newSessionViewState = { auxiliaryBarVisible: parsed.auxiliaryBarVisible };
      } else {
        this._storageService.remove(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
      }
    } catch {
      this._storageService.remove(NEW_SESSION_VIEW_STATE_KEY, StorageScope.WORKSPACE);
    }
  }
}
LayoutController.ID = "workbench.contrib.sessionsLayoutController";
export {
  LayoutController,
  RESPONSIVE_SIDEBAR_SETTING
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcbGF5b3V0XFxicm93c2VyXFxkZXNrdG9wU2Vzc2lvbkxheW91dENvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgc2Vzc2lvbkhhc0NoYW5nZXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBDSEFOR0VTX1ZJRVdfQ09OVEFJTkVSX0lELCBDSEFOR0VTX1ZJRVdfSUQgfSBmcm9tICcuLi8uLi9jaGFuZ2VzL2NvbW1vbi9jaGFuZ2VzLmpzJztcbmltcG9ydCB7IFNFU1NJT05TX0ZJTEVTX0NPTlRBSU5FUl9JRCB9IGZyb20gJy4uLy4uL2ZpbGVzL2Jyb3dzZXIvZmlsZXMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IEJhc2VMYXlvdXRDb250cm9sbGVyIH0gZnJvbSAnLi9iYXNlU2Vzc2lvbkxheW91dENvbnRyb2xsZXIuanMnO1xuXG4vKipcbiAqIFNoYXJlZCBsYXlvdXQgc3RhdGUgZm9yIHRoZSBuZXctc2Vzc2lvbiAodW50aXRsZWQpIHZpZXcuIFVudGl0bGVkIHNlc3Npb25zXG4gKiBlYWNoIGhhdmUgYSBkaXN0aW5jdCByZXNvdXJjZSwgc28gYSBzaW5nbGUgdmFsdWUgY2FycmllcyB0aGUgdXNlcidzIGNob2ljZXNcbiAqIGFjcm9zcyBuZXcgc2Vzc2lvbnMuXG4gKi9cbmludGVyZmFjZSBJTmV3U2Vzc2lvblZpZXdTdGF0ZSB7XG5cdHJlYWRvbmx5IGF1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW47XG59XG5cbi8qKiBTaGFyZWQgbGF5b3V0IHN0YXRlIGZvciB0aGUgbmV3LXNlc3Npb24gKHVudGl0bGVkKSB2aWV3LiAqL1xuY29uc3QgTkVXX1NFU1NJT05fVklFV19TVEFURV9LRVkgPSAnc2Vzc2lvbnMubmV3U2Vzc2lvblZpZXdTdGF0ZSc7XG5cbi8qKlxuICogW0Q3XSBCZWxvdyB0aGlzIG1haW4tY29udGFpbmVyIHdpZHRoIHRoZSBzZXNzaW9ucyBzaWRlYmFyIGlzIGF1dG8tbWFuYWdlZFxuICogYWdhaW5zdCB0aGUgZWRpdG9yICsgYXV4aWxpYXJ5IGJhciB2aXNpYmlsaXR5IHNvIGFsbCB0aHJlZSBkb24ndCBjb21wZXRlIGZvclxuICogYSBjcmFtcGVkIGhvcml6b250YWwgbGF5b3V0LlxuICovXG5jb25zdCBTTUFMTF9XSU5ET1dfTUFYX1dJRFRIID0gMTgwMDtcblxuLyoqIFtEN10gRXhwZXJpbWVudGFsIHNldHRpbmcgZ2F0aW5nIHRoZSByZXNwb25zaXZlIHNlc3Npb25zIHNpZGViYXIuICovXG5leHBvcnQgY29uc3QgUkVTUE9OU0lWRV9TSURFQkFSX1NFVFRJTkcgPSAnc2Vzc2lvbnMubGF5b3V0LmF1dG9Db2xsYXBzZVNlc3Npb25zU2lkZWJhcic7XG5cbi8qKlxuICogRnVsbCBsYXlvdXQgY29udHJvbGxlciB1c2VkIG9uIGRlc2t0b3AgYW5kIG9uIHRoZSB3ZWIgZGVza3RvcCBsYXlvdXQuIEluXG4gKiBhZGRpdGlvbiB0byB0aGUgc2hhcmVkIHBhbmVsIC8gd29ya2luZy1zZXQgLyBzdGF0ZSBtYW5hZ2VtZW50IG9mXG4gKiB7QGxpbmsgQmFzZUxheW91dENvbnRyb2xsZXJ9LCBpdCBtYW5hZ2VzIHRoZSBwZXItc2Vzc2lvbiBhdXhpbGlhcnkgYmFyXG4gKiB2aXNpYmlsaXR5IGFuZCBhY3RpdmUgdmlldyBjb250YWluZXIuXG4gKlxuICogSXRzIGJlaGF2aW91ciBpcyBlbnVtZXJhdGVkIGFzIHJ1bGVzICoqRDEtRDExKiogaW5cbiAqIFtkZXNrdG9wU2Vzc2lvbkxheW91dENvbnRyb2xsZXIubWRdKC4vZGVza3RvcFNlc3Npb25MYXlvdXRDb250cm9sbGVyLm1kKS5cbiAqL1xuZXhwb3J0IGNsYXNzIExheW91dENvbnRyb2xsZXIgZXh0ZW5kcyBCYXNlTGF5b3V0Q29udHJvbGxlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zTGF5b3V0Q29udHJvbGxlcic7XG5cblx0LyoqXG5cdCAqIFNoYXJlZCBsYXlvdXQgc3RhdGUgZm9yIHRoZSBuZXctc2Vzc2lvbiB2aWV3LCBwZXJzaXN0ZWQgYWNyb3NzIHJlbG9hZHMuXG5cdCAqIGB1bmRlZmluZWRgIG1lYW5zIG5vIGV4cGxpY2l0IGNob2ljZSB5ZXQgKGF1eCBiYXIgZGVmYXVsdHMgdG8gdmlzaWJsZSkuXG5cdCAqL1xuXHRwcml2YXRlIF9uZXdTZXNzaW9uVmlld1N0YXRlOiBJTmV3U2Vzc2lvblZpZXdTdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHQvKiogW0Q3XSBgdHJ1ZWAgd2hpbGUgdGhlIHNpZGViYXIgaXMgaGlkZGVuIGJlY2F1c2UgdGhlIGNvbnRyb2xsZXIgYXV0by1oaWQgaXQ7IG9ubHkgc3VjaCBoaWRlcyBhcmUgYXV0by1yZXZlcnRlZC4gKi9cblx0cHJvdGVjdGVkIF9zaWRlYmFyQXV0b0hpZGRlbiA9IGZhbHNlO1xuXHQvKiogW0Q3XSBHdWFyZHMgdGhlIG1hbnVhbC10b2dnbGUgbGlzdGVuZXIgd2hpbGUgdGhlIGNvbnRyb2xsZXIgaXRzZWxmIHRvZ2dsZXMgdGhlIHNpZGViYXIuICovXG5cdHByb3RlY3RlZCBfYXBwbHlpbmdBdXRvU2lkZWJhciA9IGZhbHNlO1xuXHQvKiogW0Q3XSBMYXN0IGNvbXB1dGVkIHNwYWNlLWNvbnN0cmFpbmVkIHN0YXRlLCBzbyB0aGUgYXV0b3J1biBvbmx5IGFjdHMgb24gcmVhbCB0cmFuc2l0aW9ucy4gKi9cblx0cHJpdmF0ZSBfcHJldmlvdXNTcGFjZUNvbnN0cmFpbmVkID0gZmFsc2U7XG5cblx0LyoqIFtEMi9EOF0gYHRydWVgIHdoaWxlIHRoZSBjb250cm9sbGVyIGhpZGVzIHRoZSBzaWRlIHBhbmUgdG8gcmVzdG9yZSBhIHNlc3Npb24ncyByZW1lbWJlcmVkIHN0YXRlLCBzbyB0aGUgaGlkZSBpc24ndCBjYXB0dXJlZCBhcyBhIHVzZXIgY2hvaWNlLiAqL1xuXHRwcml2YXRlIF9oaWRpbmdBdXhpbGlhcnlCYXJGb3JSZXN0b3JlID0gZmFsc2U7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZWdpc3RlclZpZXdTdGF0ZU1hbmFnZW1lbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9hZE5ld1Nlc3Npb25WaWV3U3RhdGUoKTtcblxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25Jc0NyZWF0ZWRPYnMgPSBkZXJpdmVkPGJvb2xlYW4+KHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGFjdGl2ZVNlc3Npb24/LmlzQ3JlYXRlZC5yZWFkKHJlYWRlcikgPz8gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uSGFzV29ya3NwYWNlT2JzID0gZGVyaXZlZDxib29sZWFuPihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBhY3RpdmVTZXNzaW9uPy53b3Jrc3BhY2UucmVhZChyZWFkZXIpPy5mb2xkZXJzPy5bMF0/LnJvb3QgIT09IHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVkaXRvck1heGltaXplZE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQsXG5cdFx0XHQoKSA9PiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzRWRpdG9yTWF4aW1pemVkKCkpO1xuXG5cdFx0Ly8gU3dpdGNoIGJldHdlZW4gc2Vzc2lvbnMgXHUyMDE0IHN5bmMgYXV4aWxpYXJ5IGJhclxuXHRcdGxldCBwcmV2aW91c1Nlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcmV2aW91c0lzQ3JlYXRlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvck1heGltaXplZCA9IGVkaXRvck1heGltaXplZE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmFjdGl2ZVNlc3Npb25SZXNvdXJjZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc0NyZWF0ZWQgPSBhY3RpdmVTZXNzaW9uSXNDcmVhdGVkT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gW0Q1XSBXaGlsZSB0aGUgZWRpdG9yIGFyZWEgaXMgbWF4aW1pemVkLCBhbHdheXMgc2hvdyB0aGUgQ2hhbmdlcyB2aWV3XG5cdFx0XHQvLyByZWdhcmRsZXNzIG9mIHRoZSBzZXNzaW9uJ3Mgc2F2ZWQvcHJldmlvdXMgc3RhdGUuIFRoZSBmb3JjZWQgdmlzaWJpbGl0eVxuXHRcdFx0Ly8gaXMgbmV2ZXIgY2FwdHVyZWQgKFtEMl0gbGlzdGVuZXIgc2tpcHMgd2hpbGUgbWF4aW1pemVkKSwgc28gdW4tbWF4aW1pemluZ1xuXHRcdFx0Ly8gcmUtcnVucyB0aGlzIGF1dG9ydW4gYW5kIHJlc3RvcmVzIHRoZSBzZXNzaW9uJ3MgcmVhbCBzdGF0ZS5cblx0XHRcdGlmIChlZGl0b3JNYXhpbWl6ZWQpIHtcblx0XHRcdFx0cHJldmlvdXNTZXNzaW9uUmVzb3VyY2UgPSBhY3RpdmVTZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdHByZXZpb3VzSXNDcmVhdGVkID0gaXNDcmVhdGVkO1xuXHRcdFx0XHR2b2lkIHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlldyhDSEFOR0VTX1ZJRVdfSUQsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uSGFzV29ya3NwYWNlID0gYWN0aXZlU2Vzc2lvbkhhc1dvcmtzcGFjZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBtdWx0aXBsZVZpc2libGUgPSB0aGlzLm11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0aWYgKG11bHRpcGxlVmlzaWJsZSkge1xuXHRcdFx0XHRwcmV2aW91c1Nlc3Npb25SZXNvdXJjZSA9IGFjdGl2ZVNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0cHJldmlvdXNJc0NyZWF0ZWQgPSBpc0NyZWF0ZWQ7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gW0QxXSBTYXZlIGF1eGlsaWFyeSBiYXIgc3RhdGUgZm9yIHRoZSBzZXNzaW9uIHdlJ3JlIHN3aXRjaGluZyBhd2F5IGZyb21cblx0XHRcdGNvbnN0IGlzU2Vzc2lvblN3aXRjaCA9IHByZXZpb3VzU2Vzc2lvblJlc291cmNlICE9PSB1bmRlZmluZWQgJiYgIWlzRXF1YWwocHJldmlvdXNTZXNzaW9uUmVzb3VyY2UsIGFjdGl2ZVNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoaXNTZXNzaW9uU3dpdGNoKSB7XG5cdFx0XHRcdHRoaXMuX2NhcHR1cmVWaWV3U3RhdGUocHJldmlvdXNTZXNzaW9uUmVzb3VyY2UhKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gW0Q0XSBTdWJtaXQ6IHRoZSBzYW1lIHNlc3Npb24gdHJhbnNpdGlvbnMgZnJvbSBuZXcgKHVuY3JlYXRlZCkgdG8gcmVhbC5cblx0XHRcdGNvbnN0IGlzU3VibWl0ID0gcHJldmlvdXNTZXNzaW9uUmVzb3VyY2UgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQmJiAhaXNTZXNzaW9uU3dpdGNoXG5cdFx0XHRcdCYmICFwcmV2aW91c0lzQ3JlYXRlZFxuXHRcdFx0XHQmJiBpc0NyZWF0ZWRcblx0XHRcdFx0JiYgYWN0aXZlU2Vzc2lvblJlc291cmNlICE9PSB1bmRlZmluZWQ7XG5cblx0XHRcdHByZXZpb3VzU2Vzc2lvblJlc291cmNlID0gYWN0aXZlU2Vzc2lvblJlc291cmNlO1xuXHRcdFx0cHJldmlvdXNJc0NyZWF0ZWQgPSBpc0NyZWF0ZWQ7XG5cblx0XHRcdGlmIChpc1N1Ym1pdCkge1xuXHRcdFx0XHR0aGlzLl93aXRoU2Vzc2lvbkxheW91dFJlc3RvcmUoKCkgPT4gdGhpcy5fb25OZXdTZXNzaW9uU3VibWl0dGVkKGFjdGl2ZVNlc3Npb25SZXNvdXJjZSEpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBbRDNdIFJlc3RvcmUgdGhlIHNlc3Npb24ncyBhdXhpbGlhcnkgYmFyIHN0YXRlLlxuXHRcdFx0dGhpcy5fd2l0aFNlc3Npb25MYXlvdXRSZXN0b3JlKCgpID0+XG5cdFx0XHRcdHRoaXMuX3N5bmNBdXhpbGlhcnlCYXJWaXNpYmlsaXR5KGFjdGl2ZVNlc3Npb25SZXNvdXJjZSwgYWN0aXZlU2Vzc2lvbkhhc1dvcmtzcGFjZSwgaXNDcmVhdGVkKVxuXHRcdFx0KTtcblx0XHR9KSk7XG5cblx0XHQvLyBbRDJdIFRyYWNrIGF1eGlsaWFyeSBiYXIgdmlzaWJpbGl0eSBjaGFuZ2VzIGJ5IHRoZSB1c2VyIHNvIHRoYXQgaGlkaW5nIHRoZVxuXHRcdC8vIFNpZGUgUGFuZWwgZm9yIGEgc2Vzc2lvbiBpcyByZW1lbWJlcmVkIGltbWVkaWF0ZWx5IChub3Qgb25seSBvbiBzd2l0Y2gpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShlID0+IHtcblx0XHRcdGlmIChlLnBhcnRJZCAhPT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gW0Q5XSBUb2dnbGluZyB0aGUgd2hvbGUgc2lkZSBwYW5lIChlZGl0b3IgKyBhdXggYmFyIHRvZ2V0aGVyKSBoaWRlcyBvclxuXHRcdFx0Ly8gc2hvd3MgdGhlIGF1eCBiYXIgYXMgYSBzaWRlIGVmZmVjdCwgbm90IGFzIGEgcGVyLXNlc3Npb24gY2hvaWNlLCBzb1xuXHRcdFx0Ly8gZG9uJ3QgcmVjb3JkIGl0LlxuXHRcdFx0aWYgKHRoaXMuX3RvZ2dsaW5nU2lkZVBhbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQSByZXN0b3JlLWRyaXZlbiBoaWRlIHJlcGxheXMgdGhlIHJlbWVtYmVyZWQgc3RhdGUgcmF0aGVyIHRoYW5cblx0XHRcdC8vIHJlYWN0aW5nIHRvIGEgdXNlciBhY3Rpb24sIHNvIGRvbid0IHJlY29yZCBpdCBhcyBhIG5ldyBwZXItc2Vzc2lvblxuXHRcdFx0Ly8gY2hvaWNlICh0aGlzIGtlZXBzIFwibm8gcmVtZW1iZXJlZCBjaG9pY2UgeWV0XCIgbWVhbmluZ2Z1bCBmb3IgdGhlXG5cdFx0XHQvLyBmaXJzdC10aW1lIENoYW5nZXMgcmV2ZWFsLCBEOCkuXG5cdFx0XHRpZiAodGhpcy5faGlkaW5nQXV4aWxpYXJ5QmFyRm9yUmVzdG9yZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBXaGlsZSByZXN0b3JpbmcgYSBzZXNzaW9uJ3MgbGF5b3V0IChlLmcuLCB3b3JraW5nLXNldCBhcHBseSBpbiBwcm9ncmVzcyksXG5cdFx0XHQvLyB2aXNpYmlsaXR5IGNoYW5nZXMgdHJpZ2dlcmVkIGJ5IHRoZSBzaW5nbGUtcGFuZSBkZXRhaWwtcGFuZWwgbG9naWMgbXVzdFxuXHRcdFx0Ly8gbm90IG92ZXJ3cml0ZSB0aGUgc2Vzc2lvbidzIGludGVuZGVkIHN0YXRlLlxuXHRcdFx0aWYgKHRoaXMuX2lzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5tdWx0aXBsZVNlc3Npb25zVmlzaWJsZU9icy5nZXQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBbRDVdIFdoaWxlIG1heGltaXplZCB0aGUgYXV4IGJhciBpcyBmb3JjZWQgdmlzaWJsZSwgc28gaXRzIHZpc2liaWxpdHlcblx0XHRcdC8vIG11c3Qgbm90IGJlIGNhcHR1cmVkIGFzIHRoZSBzZXNzaW9uJ3MgcGVyLXNlc3Npb24gcHJlZmVyZW5jZS5cblx0XHRcdGlmICh0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzRWRpdG9yTWF4aW1pemVkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghYWN0aXZlU2Vzc2lvbi5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fc2V0TmV3U2Vzc2lvblZpZXdTdGF0ZSh7IGF1eGlsaWFyeUJhclZpc2libGU6IGUudmlzaWJsZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChlLnZpc2libGUgJiYgdGhpcy5fcmVzdG9yZVNhdmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVyT25SZXZlYWwoYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY2FwdHVyZVZpZXdTdGF0ZShhY3RpdmVTZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlckNoYW5nZXNBdXRvUmV2ZWFsKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlclJlc3BvbnNpdmVTaWRlYmFyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJBdXhpbGlhcnlCYXJQYXJ0VmlzaWJpbGl0eSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyTmV3U2Vzc2lvblJ1bGVzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3JlZ2lzdGVyQ2hhbmdlc0F1dG9SZXZlYWwoKTogdm9pZCB7XG5cdFx0Ly8gW0Q4XSBSZXZlYWwgdGhlIENoYW5nZXMgdmlldyBpbiB0aGUgc2lkZSBwYW5lIHRoZSBmaXJzdCB0aW1lIGEgQ2hhbmdlc1xuXHRcdC8vIGVkaXRvciBpcyBvcGVuZWQgZm9yIGFuIGV4aXN0aW5nIHNlc3Npb247IGFmdGVyd2FyZHMgcmVzcGVjdCB0aGVcblx0XHQvLyByZW1lbWJlcmVkIHBlci1zZXNzaW9uIGNob2ljZSAoRDEvRDIvRDMpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4gdGhpcy5fcmV2ZWFsQ2hhbmdlc1ZpZXdPbkZpcnN0T3BlbigpKSk7XG5cblx0XHQvLyBbRDhdIFJlLW9wZW5pbmcgdGhlIENoYW5nZXMgZWRpdG9yIHdoaWxlIGl0IGlzIGFscmVhZHkgdGhlIGFjdGl2ZSBlZGl0b3Jcblx0XHQvLyAoZS5nLiBhZnRlciB0aGUgd2hvbGUgc2lkZSBwYW5lIHdhcyBjbG9zZWQsIHdoaWNoIG9ubHkgaGlkZXMgdGhlIGVkaXRvclxuXHRcdC8vIHBhcnQpIHJlLXJldmVhbHMgdGhlIGVkaXRvciBwYXJ0IHdpdGhvdXQgZmlyaW5nIGFuIGFjdGl2ZS1lZGl0b3IgY2hhbmdlLFxuXHRcdC8vIHNvIGFsc28gcmVhY3QgdG8gdGhlIGVkaXRvciBwYXJ0IGJlY29taW5nIHZpc2libGUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0aWYgKGUucGFydElkID09PSBQYXJ0cy5FRElUT1JfUEFSVCAmJiBlLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fcmV2ZWFsQ2hhbmdlc1ZpZXdPbkZpcnN0T3BlbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVnaXN0ZXJOZXdTZXNzaW9uUnVsZXMoKTogdm9pZCB7IH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX29uU2Vzc2lvblJlcGxhY2VkKGZyb206IElTZXNzaW9uLCB0bzogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRzdXBlci5fb25TZXNzaW9uUmVwbGFjZWQoZnJvbSwgdG8pO1xuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IHJlcGxhY2VkU2Vzc2lvbklzQWN0aXZlID0gaXNFcXVhbChhY3RpdmVTZXNzaW9uPy5yZXNvdXJjZSwgZnJvbS5yZXNvdXJjZSkgfHwgaXNFcXVhbChhY3RpdmVTZXNzaW9uPy5yZXNvdXJjZSwgdG8ucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclZpc2libGUgPSByZXBsYWNlZFNlc3Npb25Jc0FjdGl2ZVxuXHRcdFx0PyB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVClcblx0XHRcdDogdGhpcy5fbmV3U2Vzc2lvblZpZXdTdGF0ZT8uYXV4aWxpYXJ5QmFyVmlzaWJsZTtcblx0XHRpZiAoYXV4aWxpYXJ5QmFyVmlzaWJsZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gW0Q0XSBQcmVzZXJ2ZSB0aGUgZHJhZnQncyB2aXNpYmxlIGNvbnRhaW5lcjsgYSBoaWRkZW4gcGFuZSB1c2VzIHRoZSByZXZlYWwtdGltZSBkZWZhdWx0LlxuXHRcdHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5zZXQodG8ucmVzb3VyY2UsIHtcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGUsXG5cdFx0XHRhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IHJlcGxhY2VkU2Vzc2lvbklzQWN0aXZlICYmIGF1eGlsaWFyeUJhclZpc2libGVcblx0XHRcdFx0PyB0aGlzLl9wYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKT8uZ2V0SWQoKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBbRDEwXSBLZWVwIHRoZSBhdXhpbGlhcnktYmFyIHBhcnQgaGlkZGVuIHdoZW4gaXQgaGFzIG5vIGFjdGl2ZSB2aWV3XG5cdCAqIGNvbnRhaW5lcnMgKGUuZy4gYSB3b3Jrc3BhY2UtbGVzcyBxdWljayBjaGF0IHdoZXJlIENoYW5nZXMrRmlsZXMgYXJlIGdhdGVkXG5cdCAqIG9mZiksIHNvIGFuIGVtcHR5IGNvbHVtbiBpcyBuZXZlciBzaG93bi4gUmUtY2hlY2tzIG9uIGNvbnRhaW5lciBhZGQvcmVtb3ZlLFxuXHQgKiBsb2NhdGlvbiBtb3ZlcywgYWN0aXZlLXZpZXctZGVzY3JpcHRvciBjaGFuZ2VzICh0aGUgZ2F0aW5nIHNpZ25hbCksIGFuZFxuXHQgKiBhdXgtYmFyIHZpc2liaWxpdHkgY2hhbmdlcy4gT25seSBldmVyIGhpZGVzIFx1MjAxNCByZXZlYWxzIHN0YXkgd2l0aCBbRDNdL1tEOF0uXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3RlckF1eGlsaWFyeUJhclBhcnRWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCByZXdpcmUgPSAoKTogdm9pZCA9PiB7XG5cdFx0XHRtb2RlbExpc3RlbmVycy5jbGVhcigpO1xuXHRcdFx0Zm9yIChjb25zdCBjb250YWluZXIgb2YgdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJzQnlMb2NhdGlvbihWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSkge1xuXHRcdFx0XHRtb2RlbExpc3RlbmVycy5hZGQodGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpXG5cdFx0XHRcdFx0Lm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzKCgpID0+IHRoaXMuX3N5bmNBdXhpbGlhcnlCYXJQYXJ0VmlzaWJpbGl0eSgpKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zeW5jQXV4aWxpYXJ5QmFyUGFydFZpc2liaWxpdHkoKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5vbkRpZENoYW5nZVZpZXdDb250YWluZXJzKHJld2lyZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5vbkRpZENoYW5nZUNvbnRhaW5lckxvY2F0aW9uKHJld2lyZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3ZpZXdzU2VydmljZS5vbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0aWYgKGUubG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0dGhpcy5fc3luY0F1eGlsaWFyeUJhclBhcnRWaXNpYmlsaXR5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdC8vIFRoZSBhdXggcGFydCBjYW4gYmVjb21lIHZpc2libGUgd2l0aG91dCBhbnkgY29udGFpbmVyLS9kZXNjcmlwdG9yLWNoYW5nZVxuXHRcdC8vIHNpZ25hbCBmaXJpbmcgKGUuZy4gYSBiYXJlIGRldGFpbCB0b2dnbGUgdGhhdCBzaG93cyB0aGUgcGFydCBiZWZvcmUgYW55XG5cdFx0Ly8gY29udGFpbmVyIGlzIG9wZW5lZCwgb3IgYSByZXN0b3JlIHRoYXQgc2hvd3MgaXQgd2hpbGUgaXRzIGNvbnRhaW5lcnMgYXJlXG5cdFx0Ly8gZ2F0ZWQgb2ZmKS4gUmVhY3QgdG8gdGhlIHBhcnQgaXRzZWxmIGJlY29taW5nIHZpc2libGUgc28gYW4gZW1wdHkgY29sdW1uXG5cdFx0Ly8gaXMgcmVjb25jaWxlZCBhd2F5IGFuZCB0aGUgdG9nZ2xlIG5ldmVyIHJlYWRzIFwib25cIiBvdmVyIGEgYmxhbmsgcGFuZWwuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5KGUgPT4ge1xuXHRcdFx0aWYgKGUucGFydElkID09PSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCAmJiBlLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fc3luY0F1eGlsaWFyeUJhclBhcnRWaXNpYmlsaXR5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJld2lyZSgpO1xuXHR9XG5cblx0LyoqIFtEMTBdIEhpZGUgdGhlIGF1eC1iYXIgcGFydCB3aGVuIGl0IGhhcyBubyBhY3RpdmUgdmlldyBjb250YWluZXJzOyBuZXZlciByZXZlYWxzIGl0LiAqL1xuXHRwcml2YXRlIF9zeW5jQXV4aWxpYXJ5QmFyUGFydFZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xheW91dFNlcnZpY2UuaXNTaW5nbGVQYW5lTGF5b3V0RW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faGFzQWN0aXZlQXV4Vmlld0NvbnRhaW5lcnMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBObyBhY3RpdmUgYXV4IHZpZXcgY29udGFpbmVycy4gVGhpcyBpcyBvbmx5IGEgZ2VudWluZSBcImVtcHR5IGNvbHVtblwiIGZvciBhXG5cdFx0Ly8gd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdCAoQ2hhbmdlcytGaWxlcyBwZXJtYW5lbnRseSBnYXRlZCBvZmYpLiBGb3IgYVxuXHRcdC8vIHdvcmtzcGFjZS1iYWNrZWQgc2Vzc2lvbiBpdCBpcyBhIHRyYW5zaWVudCBzdGFydHVwL2FjdGl2YXRpb24gc3RhdGUgKHRoZVxuXHRcdC8vIEZpbGVzL0NoYW5nZXMgdmlld3MgZ2F0ZSBvbiBgU2Vzc2lvbkhhc1dvcmtzcGFjZUNvbnRleHRgLCBzZXQgYXN5bmMgYWZ0ZXJcblx0XHQvLyB0aGUgc2Vzc2lvbiBhY3RpdmF0ZXMpLCBhbmQgZHVyaW5nIGVhcmx5IHJlbG9hZCB0aGVyZSBpcyBubyBhY3RpdmUgc2Vzc2lvblxuXHRcdC8vIHlldCBhdCBhbGwuIEhpZGluZyBpbiB0aG9zZSB0cmFuc2llbnQgY2FzZXMgY29sbGFwc2VzIHRoZSByZXN0b3JlZC12aXNpYmxlXG5cdFx0Ly8gc2lkZSBwYW5lIGFuZCwgc2luY2UgdGhpcyBtZXRob2Qgb25seSBldmVyIGhpZGVzLCBpdCBzdGF5cyBjbG9zZWQgXHUyMDE0IHRoZVxuXHRcdC8vIHJlbG9hZCBmbGlja2VyIChvcGVucyB0aGVuIGNsb3NlcykgYW5kIFwiRmlsZXMgbm90IHNob3duXCIuIFNvIGhpZGUgT05MWSBmb3Jcblx0XHQvLyBhbiBhY3R1YWwgcXVpY2sgY2hhdDsgYSByZWFsIHF1aWNrLWNoYXQgc3dpdGNoIHN0aWxsIGZpcmVzXG5cdFx0Ly8gYG9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzYCwgd2hpY2ggcmUtcnVucyB0aGlzIGFuZCBoaWRlcyB0aGVuLlxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoYWN0aXZlU2Vzc2lvbj8uaXNRdWlja0NoYXQ/LmdldCgpICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkpIHtcblx0XHRcdC8vIFJlbW92aW5nIGFuIGVtcHR5IGNvbHVtbiBtdXN0IG5vdCwgYXMgYSBzaWRlIGVmZmVjdCwgcG9wIHRoZSBlZGl0b3Jcblx0XHRcdC8vIG9wZW46IHRoZSBlZGl0b3IncyB2aXNpYmlsaXR5IGlzIGdvdmVybmVkIGJ5IGl0cyBvd24gcnVsZXMgKFtEM10vW0Q4XSksXG5cdFx0XHQvLyBub3QgYnkgdGhpcyBjbGVhbnVwLiBTdXBwcmVzcyB0aGUgZG9ja2VkIHN3YXAtcmV2ZWFsIGZvciB0aGUgaGlkZS5cblx0XHRcdGNvbnN0IHN1cHByZXNzaW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5zdXBwcmVzc0VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5faGlkZUF1eGlsaWFyeUJhckZvclJlc3RvcmUoKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHN1cHByZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogW0Q4XSBXaGVuIGEgQ2hhbmdlcyAobXVsdGktZGlmZikgZWRpdG9yIGlzIG9wZW5lZCAoYmVjb21lcyBhY3RpdmUsIG9yIGl0c1xuXHQgKiBlZGl0b3IgcGFydCBpcyByZS1yZXZlYWxlZCkgZm9yIGFuIGV4aXN0aW5nIHNlc3Npb24sIHNob3cgdGhlIENoYW5nZXMgdmlld1xuXHQgKiBpbiB0aGUgc2lkZSBwYW5lIHVubGVzcyB0aGUgdXNlciBleHBsaWNpdGx5IGhpZCB0aGUgYXV4IGJhciBmb3IgdGhhdFxuXHQgKiBzZXNzaW9uLiBUaGlzIHJldmVhbHMgaXQgdGhlIGZpcnN0IHRpbWUgKG5vIHJlbWVtYmVyZWQgY2hvaWNlKSBhbmQgYWdhaW5cblx0ICogYWZ0ZXIgdGhlIHdob2xlIHNpZGUgcGFuZSB3YXMgY2xvc2VkIChEOSwgd2hpY2gga2VlcHMgdGhlIHJlbWVtYmVyZWQgY2hvaWNlXG5cdCAqIFwib3BlblwiKSwgYnV0IHJlc3BlY3RzIGFuIGV4cGxpY2l0IGF1eC1iYXItaGlkZGVuIGNob2ljZS4gVGhlIHJldmVhbCBpc1xuXHQgKiBjYXB0dXJlZCBieSBbRDJdLiBTa2lwcGVkIHdoaWxlIGEgc2lkZS1wYW5lIHRvZ2dsZSBpcyBpbiBwcm9ncmVzcyAoc28gdGhlXG5cdCAqIHRvZ2dsZSByZXN0b3JlcyBleGFjdGx5IHRoZSByZW1lbWJlcmVkIHBhcnRzLCBEOSksIHdoaWxlIHRoZSBlZGl0b3IgaXNcblx0ICogbWF4aW1pemVkIChENSkgb3Igd2hpbGUgbXVsdGlwbGUgc2Vzc2lvbnMgYXJlIHZpc2libGUsIHdoZXJlIHRoZSBzaWRlIHBhbmVcblx0ICogaXMgbWFuYWdlZCBieSBvdGhlciBydWxlcy5cblx0ICovXG5cdHByaXZhdGUgX3JldmVhbENoYW5nZXNWaWV3T25GaXJzdE9wZW4oKTogdm9pZCB7XG5cdFx0Ly8gQSBzaWRlLXBhbmUgdG9nZ2xlIHJlc3RvcmVzIGV4YWN0bHkgdGhlIHJlbWVtYmVyZWQgcGFydHM7IGRvbid0IGxldCB0aGVcblx0XHQvLyBlZGl0b3IgcGFydCBpdCByZXZlYWxzIGZvcmNlIHRoZSBDaGFuZ2VzIHZpZXcgb3BlbiAoRDkpLlxuXHRcdGlmICh0aGlzLl90b2dnbGluZ1NpZGVQYW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclJlc291cmNlID0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I/LnJlc291cmNlO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2hhbmdlc1Nlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3Nlc3Npb25DaGFuZ2VzU2VydmljZS5nZXRTZXNzaW9uUmVzb3VyY2UoYWN0aXZlRWRpdG9yUmVzb3VyY2UpO1xuXHRcdGlmICghY2hhbmdlc1Nlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tdWx0aXBsZVNlc3Npb25zVmlzaWJsZU9icy5nZXQoKSB8fCB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzRWRpdG9yTWF4aW1pemVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghYWN0aXZlU2Vzc2lvbiB8fCAhaXNFcXVhbChhY3RpdmVTZXNzaW9uLnJlc291cmNlLCBjaGFuZ2VzU2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBVbmNyZWF0ZWQgKHVudGl0bGVkKSBzZXNzaW9ucyBzaGFyZSB0aGUgbmV3LXNlc3Npb24gc2lkZS1wYW5lIHN0YXRlIChEM2IvRDQpLlxuXHRcdGlmICghYWN0aXZlU2Vzc2lvbi5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQSByZXN0b3JlZCBDaGFuZ2VzIGVkaXRvciBjYW4gYmVjb21lIGFjdGl2ZSB3aGlsZSB0aGUgZWRpdG9yIHBhcnQgaXNcblx0XHQvLyBzdGlsbCBoaWRkZW4gKGUuZy4gaXRzIHdvcmtpbmcgc2V0IGlzIHJlc3RvcmVkIG9uIHJlbG9hZCkuIE9ubHkgcmV2ZWFsXG5cdFx0Ly8gdGhlIHNpZGUgcGFuZSB3aGVuIHRoZSB1c2VyIGFjdHVhbGx5IG9wZW5lZCB0aGUgZWRpdG9yIChwYXJ0IHZpc2libGUpLlxuXHRcdGlmICghdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuRURJVE9SX1BBUlQsIG1haW5XaW5kb3cpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNhdmVkU3RhdGUgPSB0aGlzLl92aWV3U3RhdGVCeVNlc3Npb24uZ2V0KGNoYW5nZXNTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChzYXZlZFN0YXRlKSB7XG5cdFx0XHQvLyBbRDhdIEFscmVhZHkgb3Blbiwgb3IgYW4gZXhwbGljaXQgYXV4LWJhciBoaWRlIChub3QgYSBEOSBjb2xsYXBzZSkuXG5cdFx0XHRpZiAodGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghc2F2ZWRTdGF0ZS5hdXhpbGlhcnlCYXJWaXNpYmxlICYmICFzYXZlZFN0YXRlLmF1eGlsaWFyeUJhckhpZGRlbkJ5Q29sbGFwc2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR2b2lkIHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlldyhDSEFOR0VTX1ZJRVdfSUQsIGZhbHNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPbiBhIHNtYWxsIHdpbmRvdywgYXV0by1oaWRlIHRoZSBzZXNzaW9ucyBzaWRlYmFyIHdoaWxlIGJvdGggdGhlIGVkaXRvciBhbmRcblx0ICogYXV4aWxpYXJ5IGJhciBhcmUgb3BlbiBhbmQgYXV0by1zaG93IGl0IGFnYWluIG9uY2UgZWl0aGVyIGNsb3NlcyBcdTIwMTQgdW5sZXNzIHRoZVxuXHQgKiB1c2VyIGNsb3NlZCB0aGUgc2lkZWJhciB0aGVtc2VsdmVzLiBEaXNhYmxlZCB3aGlsZSBtdWx0aXBsZSBzZXNzaW9ucyBhcmVcblx0ICogdmlzaWJsZSBhbmQgbmV2ZXIgdHJpZ2dlcmVkIGJ5IHNlc3Npb24gbmF2aWdhdGlvbi4gR2F0ZWQgYnkgdGhlIGV4cGVyaW1lbnRhbFxuXHQgKiBgc2Vzc2lvbnMubGF5b3V0LmF1dG9Db2xsYXBzZVNlc3Npb25zU2lkZWJhcmAgc2V0dGluZy5cblx0ICovXG5cdHByb3RlY3RlZCBfcmVnaXN0ZXJSZXNwb25zaXZlU2lkZWJhcigpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVkT2JzID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPGJvb2xlYW4+KFJFU1BPTlNJVkVfU0lERUJBUl9TRVRUSU5HLCBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBzbWFsbFdpbmRvd09icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRMYXlvdXRNYWluQ29udGFpbmVyLFxuXHRcdFx0KCkgPT4gdGhpcy5fbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyRGltZW5zaW9uLndpZHRoIDw9IFNNQUxMX1dJTkRPV19NQVhfV0lEVEgpO1xuXG5cdFx0Y29uc3QgZWRpdG9yVmlzaWJsZU9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eSxcblx0XHRcdCgpID0+IHRoaXMuX2xheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkVESVRPUl9QQVJULCBtYWluV2luZG93KSk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlCYXJWaXNpYmxlT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5vbkRpZENoYW5nZVBhcnRWaXNpYmlsaXR5LFxuXHRcdFx0KCkgPT4gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKTtcblxuXHRcdGNvbnN0IGVkaXRvck1heGltaXplZE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VFZGl0b3JNYXhpbWl6ZWQsXG5cdFx0XHQoKSA9PiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzRWRpdG9yTWF4aW1pemVkKCkpO1xuXG5cdFx0Ly8gW0Q3XSBEaXNhYmxlZCB3aGlsZSBtdWx0aXBsZSBzZXNzaW9ucyBhcmUgdmlzaWJsZS5cblx0XHRjb25zdCBzcGFjZUNvbnN0cmFpbmVkT2JzID0gZGVyaXZlZDxib29sZWFuPihyZWFkZXIgPT5cblx0XHRcdGVuYWJsZWRPYnMucmVhZChyZWFkZXIpICYmXG5cdFx0XHQhdGhpcy5tdWx0aXBsZVNlc3Npb25zVmlzaWJsZU9icy5yZWFkKHJlYWRlcikgJiZcblx0XHRcdHNtYWxsV2luZG93T2JzLnJlYWQocmVhZGVyKSAmJlxuXHRcdFx0ZWRpdG9yVmlzaWJsZU9icy5yZWFkKHJlYWRlcikgJiZcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGVPYnMucmVhZChyZWFkZXIpKTtcblxuXHRcdHRoaXMuX3ByZXZpb3VzU3BhY2VDb25zdHJhaW5lZCA9IHNwYWNlQ29uc3RyYWluZWRPYnMuZ2V0KCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvLyBXaGlsZSB0aGUgZWRpdG9yIGlzIG1heGltaXplZCB0aGUgc2lkZSBsYXlvdXQgaXMgZm9yY2VkIChENSk7IGxlYXZlIHRoZVxuXHRcdFx0Ly8gc2lkZWJhciB0byB0aGUgbWF4aW1pemUvcmVzdG9yZSBsb2dpYyBhbmQgcmUtZXZhbHVhdGUgb24gdW4tbWF4aW1pemUuXG5cdFx0XHRpZiAoZWRpdG9yTWF4aW1pemVkT2JzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnN0cmFpbmVkID0gc3BhY2VDb25zdHJhaW5lZE9icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIFtEN10gV2hpbGUgdGhlIGNvbnRyb2xsZXIgcmVzdG9yZXMgYSBzZXNzaW9uJ3MgbGF5b3V0IChlLmcuIHN3aXRjaGluZ1xuXHRcdFx0Ly8gc2Vzc2lvbnMgcmV2ZWFscyB0aGUgc2F2ZWQgc2lkZSBwYW5lbCksIHJlLWJhc2VsaW5lIGluc3RlYWQgb2YgcmVhY3Rpbmdcblx0XHRcdC8vIHNvIG5hdmlnYXRpb24gbmV2ZXIgYXV0by1oaWRlcyB0aGUgc2lkZWJhciBcdTIwMTQgb25seSBpbi1zZXNzaW9uIGNoYW5nZXMgZG8uXG5cdFx0XHRpZiAodGhpcy5faXNSZXN0b3JpbmdTZXNzaW9uTGF5b3V0KSB7XG5cdFx0XHRcdHRoaXMuX3ByZXZpb3VzU3BhY2VDb25zdHJhaW5lZCA9IGNvbnN0cmFpbmVkO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25zdHJhaW5lZCA9PT0gdGhpcy5fcHJldmlvdXNTcGFjZUNvbnN0cmFpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3ByZXZpb3VzU3BhY2VDb25zdHJhaW5lZCA9IGNvbnN0cmFpbmVkO1xuXG5cdFx0XHRpZiAoY29uc3RyYWluZWQpIHtcblx0XHRcdFx0Ly8gT25seSByZW1lbWJlciBhbiBhdXRvLWhpZGUgd2hlbiB3ZSBhY3R1YWxseSBoaWQgYSB2aXNpYmxlIHNpZGViYXI7IGFcblx0XHRcdFx0Ly8gc2lkZWJhciB0aGF0IHdhcyBhbHJlYWR5IGNsb3NlZCAoZS5nLiBieSB0aGUgdXNlciwgaW5jbHVkaW5nIGJlZm9yZSBhXG5cdFx0XHRcdC8vIHJlbG9hZCkgbXVzdCBub3QgYmUgYXV0by1yZXZlYWxlZCB3aGVuIHNwYWNlIGlzIG5vIGxvbmdlciBjb25zdHJhaW5lZC5cblx0XHRcdFx0aWYgKHRoaXMuX3NldFNpZGViYXJBdXRvSGlkZGVuKHRydWUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2lkZWJhckF1dG9IaWRkZW4gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3NpZGViYXJBdXRvSGlkZGVuKSB7XG5cdFx0XHRcdHRoaXMuX3NldFNpZGViYXJBdXRvSGlkZGVuKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fc2lkZWJhckF1dG9IaWRkZW4gPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBIG1hbnVhbCBzaWRlYmFyIHRvZ2dsZSBoYW5kcyBjb250cm9sIGJhY2sgdG8gdGhlIHVzZXI6IHN0b3AgdHJhY2tpbmcgdGhlXG5cdFx0Ly8gc2lkZWJhciBhcyBhdXRvLWhpZGRlbiBzbyBhIGxhdGVyIHVuLWNvbnN0cmFpbiBuZWl0aGVyIHJlb3BlbnMgYSBzaWRlYmFyIHRoZVxuXHRcdC8vIHVzZXIgY2xvc2VkIG5vciByZS1oaWRlcyBvbmUgdGhleSBvcGVuZWQuIE1heGltaXplIHRvZ2dsZXMgdGhlIHNpZGViYXIgdG9vLFxuXHRcdC8vIGJ1dCBpdHMgZW50ZXIvcmVzdG9yZSBwYWlyIHNlbGYtY2FuY2VscyBoZXJlLCBzbyBpdCBuZWVkcyBubyBzcGVjaWFsIGhhbmRsaW5nLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xheW91dFNlcnZpY2Uub25EaWRDaGFuZ2VQYXJ0VmlzaWJpbGl0eShlID0+IHtcblx0XHRcdGlmIChlLnBhcnRJZCAhPT0gUGFydHMuU0lERUJBUl9QQVJUIHx8IHRoaXMuX2FwcGx5aW5nQXV0b1NpZGViYXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2lkZWJhckF1dG9IaWRkZW4gPSBmYWxzZTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKiogUmV0dXJucyBgdHJ1ZWAgd2hlbiB0aGUgc2lkZWJhciB2aXNpYmlsaXR5IHdhcyBhY3R1YWxseSBjaGFuZ2VkLiAqL1xuXHRwcm90ZWN0ZWQgX3NldFNpZGViYXJBdXRvSGlkZGVuKGhpZGRlbjogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpID09PSAhaGlkZGVuKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2FwcGx5aW5nQXV0b1NpZGViYXIgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oaGlkZGVuLCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9hcHBseWluZ0F1dG9TaWRlYmFyID0gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gW0I0XSBTbmFwc2hvdCB0aGUgYWN0aXZlIHNlc3Npb24ncyBhdXgtYmFyIHN0YXRlIHdoZW4gcGVyc2lzdGluZy5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9jYXB0dXJlQWN0aXZlU2Vzc2lvblZpZXdTdGF0ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX2NhcHR1cmVWaWV3U3RhdGUoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBbRDliXSBSZWNvcmRzIGEgd2hvbGUtc2lkZS1wYW5lIHRvZ2dsZSBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uLiBGb3IgYW5cblx0ICogdW5jcmVhdGVkIHNlc3Npb24gaXQgdXBkYXRlcyB0aGUgc2hhcmVkIG5ldy1zZXNzaW9uIGNob2ljZS4gRm9yIGEgY3JlYXRlZFxuXHQgKiBzZXNzaW9uLCBvbmx5IGEgZnVsbCBjb2xsYXBzZSBvZiBhIHByZXZpb3VzbHktdmlzaWJsZSBhdXggYmFyIGlzIG1hcmtlZCBhcyBhXG5cdCAqIGNvbGxhcHNlLWRyaXZlbiBoaWRlIChzbyBvcGVuaW5nIENoYW5nZXMgbGF0ZXIgcmUtcmV2ZWFscyBpdCk7IGFueSBvdGhlclxuXHQgKiBvdXRjb21lIGp1c3QgY2FwdHVyZXMgdGhlIHJlc3VsdGluZyBzdGF0ZSwgcHJlc2VydmluZyBhbiBleHBsaWNpdCBhdXgtYmFyXG5cdCAqIGhpZGUuIFNlZSBgZGVza3RvcFNlc3Npb25MYXlvdXRDb250cm9sbGVyLm1kYC5cblx0ICovXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25TaWRlUGFuZVRvZ2dsZWQoY29sbGFwc2VkOiBib29sZWFuLCBwcmV2aW91c0F1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW4sIGF1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tdWx0aXBsZVNlc3Npb25zVmlzaWJsZU9icy5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghYWN0aXZlU2Vzc2lvbi5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX3NldE5ld1Nlc3Npb25WaWV3U3RhdGUoeyBhdXhpbGlhcnlCYXJWaXNpYmxlIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY29sbGFwc2VkICYmIHByZXZpb3VzQXV4aWxpYXJ5QmFyVmlzaWJsZSkge1xuXHRcdFx0Y29uc3QgYWN0aXZlVmlld0NvbnRhaW5lcklkID0gdGhpcy5fcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmdldElkKCk7XG5cdFx0XHR0aGlzLl92aWV3U3RhdGVCeVNlc3Npb24uc2V0KGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UsIHtcblx0XHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRcdGF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDogYWN0aXZlVmlld0NvbnRhaW5lcklkLFxuXHRcdFx0XHRhdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFJlLW9wZW5lZCwgb3IgY29sbGFwc2VkIGFuIGFscmVhZHktaGlkZGVuIGF1eCBiYXI6IGNhcHR1cmUgdGhlIHJlc3VsdGluZ1xuXHRcdC8vIHN0YXRlIHdpdGhvdXQgZmFicmljYXRpbmcgYSBjb2xsYXBzZSBtYXJrZXIgKHByZXNlcnZpbmcgZXhwbGljaXQgaGlkZXMpLlxuXHRcdHRoaXMuX2NhcHR1cmVWaWV3U3RhdGUoYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSk7XG5cdH1cblxuXHQvLyAtLS0gQXV4aWxpYXJ5IGJhciBbRDFdIC0tLVxuXG5cdHByaXZhdGUgX2NhcHR1cmVWaWV3U3RhdGUoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJWaXNpYmxlID0gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdGNvbnN0IGFjdGl2ZVZpZXdDb250YWluZXJJZCA9IHRoaXMuX3BhbmVDb21wb3NpdGVQYXJ0U2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpPy5nZXRJZCgpO1xuXHRcdC8vIFtEOV0gUHJlc2VydmUgYSBjb2xsYXBzZSBtYXJrZXIgd2hpbGUgdGhlIGF1eCBiYXIgc3RheXMgaGlkZGVuOyB0aGVcblx0XHQvLyBtYXJrZXIgaXMgb25seSBldmVyIHNldCBieSBgX29uU2lkZVBhbmVUb2dnbGVkYCBmb3IgdGhlIHNlc3Npb24gdGhhdCB3YXNcblx0XHQvLyBjb2xsYXBzZWQsIHNvIGFuIGV4cGxpY2l0IGF1eC1iYXIgaGlkZSBpcyBuZXZlciBtaXN0YWtlbiBmb3IgYSBjb2xsYXBzZS5cblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlID0gIWF1eGlsaWFyeUJhclZpc2libGUgJiYgcHJldmlvdXM/LmF1eGlsaWFyeUJhckhpZGRlbkJ5Q29sbGFwc2UgPT09IHRydWU7XG5cdFx0dGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLnNldChzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGUsXG5cdFx0XHRhdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ6IGFjdGl2ZVZpZXdDb250YWluZXJJZCxcblx0XHRcdC4uLihhdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlID8geyBhdXhpbGlhcnlCYXJIaWRkZW5CeUNvbGxhcHNlOiB0cnVlIH0gOiB7fSksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXROZXdTZXNzaW9uVmlld1N0YXRlKHN0YXRlOiBJTmV3U2Vzc2lvblZpZXdTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX25ld1Nlc3Npb25WaWV3U3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShORVdfU0VTU0lPTl9WSUVXX1NUQVRFX0tFWSwgSlNPTi5zdHJpbmdpZnkoc3RhdGUpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFtENF0gV2hlbiBhIG5ldyAodW5jcmVhdGVkKSBzZXNzaW9uIGlzIHN1Ym1pdHRlZCBpdCBiZWNvbWVzIGEgcmVhbCBzZXNzaW9uXG5cdCAqIHdoaWxlIHN0YXlpbmcgYWN0aXZlLiBLZWVwIHRoZSBhdXhpbGlhcnkgYmFyIGV4YWN0bHkgYXMgdGhlIHVzZXIgbGVmdCBpdDogaWZcblx0ICogb3Blbiwga2VlcCBpdCBvcGVuIG9uIHRoZSBjb250YWluZXIgaXQgaXMgYWxyZWFkeSBzaG93aW5nOyBpZiBjbG9zZWQsIGtlZXAgaXRcblx0ICogY2xvc2VkIGFuZCByZWNvcmQgbm8gY29udGFpbmVyIHNvIG9wZW5pbmcgdGhlIHNpZGUgcGFuZSBsYXRlciBwaWNrcyB0aGVcblx0ICogZGVmYXVsdCBmb3IgdGhlIHNlc3Npb24ncyBjaGFuZ2Ugc3RhdGUgYXQgdGhhdCB0aW1lIChbRDNkXSkuIFRoZSByZXN1bHRpbmdcblx0ICogc3RhdGUgaXMgcGVyc2lzdGVkIHNvIGxhdGVyIHN5bmNzIGRvbid0IGZhbGwgYmFjayB0byBoaWRkZW4uXG5cdCAqL1xuXHRwcml2YXRlIF9vbk5ld1Nlc3Npb25TdWJtaXR0ZWQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBhdXhpbGlhcnlCYXJWaXNpYmxlID0gdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5zZXQoc2Vzc2lvblJlc291cmNlLCB7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiBhdXhpbGlhcnlCYXJWaXNpYmxlXG5cdFx0XHRcdD8gdGhpcy5fcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik/LmdldElkKClcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBbRDNdIFJlc3RvcmUgdGhlIGF1eGlsaWFyeSBiYXIgaW4gc3RyaWN0IHByaW9yaXR5IG9yZGVyLlxuXHQvLyBOb3RlOiBUaGlzIG1ldGhvZCBpcyBpbnRlbnRpb25hbGx5IHN5bmNocm9ub3VzICh2b2lkIHJldHVybikuIFZpZXctb3BlbmluZyBjYWxscyBhcmVcblx0Ly8gZmlyZS1hbmQtZm9yZ2V0IHNvIHRoYXQgX2lzUmVzdG9yaW5nU2Vzc2lvbkxheW91dCBlbmRzIGltbWVkaWF0ZWx5IGFmdGVyIHN5bmMgb3BlcmF0aW9ucy5cblx0Ly8gVGhpcyBhbGxvd3MgRDIgdG8gY2FwdHVyZSB1c2VyIGFjdGlvbnMgdGhhdCBoYXBwZW4gYWZ0ZXIgdGhlIHN5bmMgcmVzdG9yZSBidXQgYmVmb3JlXG5cdC8vIHdvcmtpbmctc2V0IGFwcGx5LCB3aGlsZSBzdGlsbCBza2lwcGluZyBzaW5nbGUtcGFuZSBkZXRhaWwtcGFuZWwgcmV2ZWFscyBkdXJpbmcgd29ya2luZy1zZXQgYXBwbHkuXG5cdHByaXZhdGUgX3N5bmNBdXhpbGlhcnlCYXJWaXNpYmlsaXR5KHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBoYXNXb3Jrc3BhY2U6IGJvb2xlYW4sIGlzQ3JlYXRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIFtEM2FdIE5vIHJlc291cmNlIC8gbm8gd29ya3NwYWNlIFx1MjE5MiBkbyBub3RoaW5nLlxuXHRcdGlmICghc2Vzc2lvblJlc291cmNlIHx8ICFoYXNXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBbRDNiXSBOZXctc2Vzc2lvbiB2aWV3OiBhbGwgdW5jcmVhdGVkIHNlc3Npb25zIHNoYXJlIG9uZSBzdGF0ZS5cblx0XHRpZiAoIWlzQ3JlYXRlZCkge1xuXHRcdFx0aWYgKHRoaXMuX25ld1Nlc3Npb25WaWV3U3RhdGUgJiYgIXRoaXMuX25ld1Nlc3Npb25WaWV3U3RhdGUuYXV4aWxpYXJ5QmFyVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9oaWRlQXV4aWxpYXJ5QmFyRm9yUmVzdG9yZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR2b2lkIHRoaXMuX29wZW5EZWZhdWx0QXV4aWxpYXJ5QmFyQ29udGFpbmVyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZWRTdGF0ZSA9IHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5nZXQoc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIFtEM2NdIEV4aXN0aW5nIHNlc3Npb25zIGFyZSBuZXZlciBhdXRvLW9wZW5lZDogaGlkZSB1bmxlc3MgZXhwbGljaXRseSBsZWZ0IHZpc2libGUuXG5cdFx0aWYgKCFzYXZlZFN0YXRlIHx8ICFzYXZlZFN0YXRlLmF1eGlsaWFyeUJhclZpc2libGUpIHtcblx0XHRcdHRoaXMuX2hpZGVBdXhpbGlhcnlCYXJGb3JSZXN0b3JlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gW0QzY10gUmVzdG9yZSB0aGUgdXNlcidzIGxhc3QgZXhwbGljaXQgY2hvaWNlLCBidXQgb25seSBpZiB0aGF0IHBhbmUgaXMgc3RpbGwgcGlubmVkLlxuXHRcdGNvbnN0IHNhdmVkQ29udGFpbmVySWQgPSBzYXZlZFN0YXRlLmF1eGlsaWFyeUJhckFjdGl2ZVZpZXdDb250YWluZXJJZDtcblx0XHRpZiAoc2F2ZWRDb250YWluZXJJZCAmJiB0aGlzLl9pc0F1eGlsaWFyeUJhckNvbnRhaW5lclBpbm5lZChzYXZlZENvbnRhaW5lcklkKSkge1xuXHRcdFx0dm9pZCB0aGlzLl92aWV3c1NlcnZpY2Uub3BlblZpZXdDb250YWluZXIoc2F2ZWRDb250YWluZXJJZCwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZvaWQgdGhpcy5fb3BlbkRlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBbRDNkXSBUaGUgY29udGFpbmVyIHRoZSBzaWRlIHBhbmUgZGVmYXVsdHMgdG8gZm9yIHRoZSBhY3RpdmUgc2Vzc2lvbjpcblx0ICogQ2hhbmdlcyBvbmNlIHRoZSBzZXNzaW9uIGhhcyBwcm9kdWNlZCBhdCBsZWFzdCBvbmUgY2hhbmdlIChpbiBhbnkgb2YgaXRzXG5cdCAqIGNoYXRzKSwgRmlsZXMgdW50aWwgdGhlbi4gRmFsbHMgYmFjayB0byBDaGFuZ2VzIHdoZW4gdGhlIHVzZXIgaGFzIHVucGlubmVkXG5cdCAqIHRoZSBGaWxlcyBwYW5lLCBzaW5jZSB0aGVyZSBpcyBub3RoaW5nIGVsc2UgdG8gc2hvdy5cblx0ICpcblx0ICogUmVhZCB1bnRyYWNrZWQgb24gcHVycG9zZTogdGhlIGRlZmF1bHQgaXMgZXZhbHVhdGVkIGF0IHRoZSBtb21lbnQgdGhlIHNpZGVcblx0ICogcGFuZSBpcyBvcGVuZWQsIHNvIGEgY2hhbmdlIGxhbmRpbmcgbGF0ZXIgbmV2ZXIgc3dpdGNoZXMgYSBwYW5lIHRoZSB1c2VyIGlzXG5cdCAqIGFscmVhZHkgbG9va2luZyBhdC5cblx0ICovXG5cdHByaXZhdGUgX2RlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXJJZCgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5faXNBdXhpbGlhcnlCYXJDb250YWluZXJQaW5uZWQoU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEKSkge1xuXHRcdFx0cmV0dXJuIENIQU5HRVNfVklFV19DT05UQUlORVJfSUQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLl9zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRyZXR1cm4gYWN0aXZlU2Vzc2lvbiAmJiBzZXNzaW9uSGFzQ2hhbmdlcyhhY3RpdmVTZXNzaW9uLCB1bmRlZmluZWQpXG5cdFx0XHQ/IENIQU5HRVNfVklFV19DT05UQUlORVJfSURcblx0XHRcdDogU0VTU0lPTlNfRklMRVNfQ09OVEFJTkVSX0lEO1xuXHR9XG5cblx0LyoqIFtEM2RdIE9wZW5zIHRoZSBjb250YWluZXIgY2hvc2VuIGJ5IHtAbGluayBfZGVmYXVsdEF1eGlsaWFyeUJhckNvbnRhaW5lcklkfS4gKi9cblx0cHJpdmF0ZSBfb3BlbkRlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXIoY29udGFpbmVySWQ6IHN0cmluZyA9IHRoaXMuX2RlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXJJZCgpKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Ly8gQ2hhbmdlcyBpcyBvcGVuZWQgdGhyb3VnaCBpdHMgdmlldyBzbyB0aGUgdmlldyBpcyByZXZlYWxlZCBpbnNpZGUgdGhlXG5cdFx0Ly8gY29udGFpbmVyIHJhdGhlciB0aGFuIGxlYXZpbmcgdGhlIGNvbnRhaW5lciBvbiBhIHN0YWxlIHN1Yi12aWV3LlxuXHRcdGlmIChjb250YWluZXJJZCA9PT0gQ0hBTkdFU19WSUVXX0NPTlRBSU5FUl9JRCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlldyhDSEFOR0VTX1ZJRVdfSUQsIGZhbHNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcihjb250YWluZXJJZCwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZVNhdmVkQXV4aWxpYXJ5QmFyQ29udGFpbmVyT25SZXZlYWwoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCBzYXZlZFN0YXRlID0gdGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghc2F2ZWRTdGF0ZSB8fCBzYXZlZFN0YXRlLmF1eGlsaWFyeUJhclZpc2libGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzYXZlZENvbnRhaW5lcklkID0gc2F2ZWRTdGF0ZS5hdXhpbGlhcnlCYXJBY3RpdmVWaWV3Q29udGFpbmVySWQ7XG5cdFx0aWYgKHNhdmVkQ29udGFpbmVySWQgJiYgdGhpcy5faXNBdXhpbGlhcnlCYXJDb250YWluZXJQaW5uZWQoc2F2ZWRDb250YWluZXJJZCkpIHtcblx0XHRcdHRoaXMuX3ZpZXdTdGF0ZUJ5U2Vzc2lvbi5zZXQoc2Vzc2lvblJlc291cmNlLCB7IC4uLnNhdmVkU3RhdGUsIGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUgfSk7XG5cdFx0XHR2b2lkIHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcihzYXZlZENvbnRhaW5lcklkLCBmYWxzZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRDb250YWluZXJJZCA9IHRoaXMuX2RlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXJJZCgpO1xuXHRcdFx0dGhpcy5fdmlld1N0YXRlQnlTZXNzaW9uLnNldChzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHRcdFx0YXV4aWxpYXJ5QmFyQWN0aXZlVmlld0NvbnRhaW5lcklkOiBkZWZhdWx0Q29udGFpbmVySWQsXG5cdFx0XHR9KTtcblx0XHRcdHZvaWQgdGhpcy5fb3BlbkRlZmF1bHRBdXhpbGlhcnlCYXJDb250YWluZXIoZGVmYXVsdENvbnRhaW5lcklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogW0QyL0Q4XSBIaWRlIHRoZSBzaWRlIHBhbmUgYXMgcGFydCBvZiByZXN0b3JpbmcgYSBzZXNzaW9uJ3MgcmVtZW1iZXJlZFxuXHQgKiBzdGF0ZS4gVGhlIHN5bmNocm9ub3VzIGd1YXJkIG1ha2VzIHRoZSBbRDJdIGxpc3RlbmVyIGlnbm9yZSB0aGUgcmVzdWx0aW5nXG5cdCAqIHZpc2liaWxpdHkgY2hhbmdlIHNvIGEgcmVzdG9yZS1kcml2ZW4gaGlkZSBpcyBuZXZlciByZWNvcmRlZCBhcyBhIG5ld1xuXHQgKiBwZXItc2Vzc2lvbiBjaG9pY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9oaWRlQXV4aWxpYXJ5QmFyRm9yUmVzdG9yZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9oaWRpbmdBdXhpbGlhcnlCYXJGb3JSZXN0b3JlID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faGlkaW5nQXV4aWxpYXJ5QmFyRm9yUmVzdG9yZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzQXV4aWxpYXJ5QmFyQ29udGFpbmVyUGlubmVkKGNvbnRhaW5lcklkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlXG5cdFx0XHQuZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcyhWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKVxuXHRcdFx0LmluY2x1ZGVzKGNvbnRhaW5lcklkKTtcblx0fVxuXG5cdHByaXZhdGUgX2xvYWROZXdTZXNzaW9uVmlld1N0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1Nlc3Npb25SYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoTkVXX1NFU1NJT05fVklFV19TVEFURV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmICghbmV3U2Vzc2lvblJhdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShuZXdTZXNzaW9uUmF3KTtcblx0XHRcdGlmIChwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZC5hdXhpbGlhcnlCYXJWaXNpYmxlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0dGhpcy5fbmV3U2Vzc2lvblZpZXdTdGF0ZSA9IHsgYXV4aWxpYXJ5QmFyVmlzaWJsZTogcGFyc2VkLmF1eGlsaWFyeUJhclZpc2libGUgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShORVdfU0VTU0lPTl9WSUVXX1NUQVRFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoTkVXX1NFU1NJT05fVklFV19TVEFURV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxTQUFTLFNBQVMsMkJBQTJCO0FBQ3RELFNBQVMsZUFBZTtBQUV4QixTQUFTLDZCQUE2QjtBQUN0QyxPQUFPLGFBQWE7QUFDcEIsU0FBUyxjQUFjLHFCQUFxQjtBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWE7QUFDdEIsU0FBbUIseUJBQXlCO0FBQzVDLFNBQVMsMkJBQTJCLHVCQUF1QjtBQUMzRCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDRCQUE0QjtBQVlyQyxNQUFNLDZCQUE2QjtBQU9uQyxNQUFNLHlCQUF5QjtBQUd4QixNQUFNLDZCQUE2QjtBQVduQyxNQUFNLHlCQUF5QixxQkFBcUI7QUFBQSxFQUFwRDtBQUFBO0FBV047QUFBQSxTQUFVLHFCQUFxQjtBQUUvQjtBQUFBLFNBQVUsdUJBQXVCO0FBRWpDO0FBQUEsU0FBUSw0QkFBNEI7QUFH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QUFjLFdBQVcscUJBQXFCO0FBQ2xELGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxtQkFBbUIsV0FBVztBQUNwQyxRQUFJLG9CQUFvQixLQUFLLCtCQUErQixnQkFBZ0IsR0FBRztBQUM5RSxXQUFLLG9CQUFvQixJQUFJLGlCQUFpQixFQUFFLEdBQUcsWUFBWSxxQkFBcUIsS0FBSyxDQUFDO0FBQzFGLFdBQUssS0FBSyxjQUFjLGtCQUFrQixrQkFBa0IsS0FBSztBQUFBLElBQ2xFLE9BQU87QUFDTixZQUFNLHFCQUFxQixLQUFLLGdDQUFnQztBQUNoRSxXQUFLLG9CQUFvQixJQUFJLGlCQUFpQjtBQUFBLFFBQzdDLHFCQUFxQjtBQUFBLFFBQ3JCLG1DQUFtQztBQUFBLE1BQ3BDLENBQUM7QUFDRCxXQUFLLEtBQUssa0NBQWtDLGtCQUFrQjtBQUFBLElBQy9EO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLDhCQUFvQztBQUMzQyxTQUFLLGdDQUFnQztBQUNyQyxRQUFJO0FBQ0gsV0FBSyxlQUFlLGNBQWMsTUFBTSxNQUFNLGlCQUFpQjtBQUFBLElBQ2hFLFVBQUU7QUFDRCxXQUFLLGdDQUFnQztBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUFBLEVBRVEsK0JBQStCLGFBQThCO0FBQ3BFLFdBQU8sS0FBSywwQkFDViwwQkFBMEIsc0JBQXNCLFlBQVksRUFDNUQsU0FBUyxXQUFXO0FBQUEsRUFDdkI7QUFBQSxFQUVRLDJCQUFpQztBQUN4QyxVQUFNLGdCQUFnQixLQUFLLGdCQUFnQixJQUFJLDRCQUE0QixhQUFhLFNBQVM7QUFDakcsUUFBSSxDQUFDLGVBQWU7QUFDbkI7QUFBQSxJQUNEO0FBQ0EsUUFBSTtBQUNILFlBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYTtBQUN2QyxVQUFJLFVBQVUsT0FBTyxPQUFPLHdCQUF3QixXQUFXO0FBQzlELGFBQUssdUJBQXVCLEVBQUUscUJBQXFCLE9BQU8sb0JBQW9CO0FBQUEsTUFDL0UsT0FBTztBQUNOLGFBQUssZ0JBQWdCLE9BQU8sNEJBQTRCLGFBQWEsU0FBUztBQUFBLE1BQy9FO0FBQUEsSUFDRCxRQUFRO0FBQ1AsV0FBSyxnQkFBZ0IsT0FBTyw0QkFBNEIsYUFBYSxTQUFTO0FBQUEsSUFDL0U7QUFBQSxFQUNEO0FBQ0Q7QUF6bUJhLGlCQUVJLEtBQUs7IiwKICAibmFtZXMiOiBbXQp9Cg==
