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
import "./media/sessionsPart.css";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { agentsPanelBorder } from "../../common/theme.js";
import { Parts } from "../../../workbench/services/layout/browser/layoutService.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { LayoutPriority } from "../../../base/browser/ui/splitview/splitview.js";
import { Direction, SerializableGrid, Sizing } from "../../../base/browser/ui/grid/grid.js";
import { Part } from "../../../workbench/browser/part.js";
import { ActiveSessionsContext, MultipleSessionsVisibleContext, SessionsFocusContext } from "../../common/contextkeys.js";
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, isAncestor, trackFocus } from "../../../base/browser/dom.js";
import { SessionView } from "./sessionView.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { Color } from "../../../base/common/color.js";
import { contrastBorder } from "../../../platform/theme/common/colorRegistry.js";
import { SessionDropTarget } from "./sessionDropTarget.js";
import { ProgressBar } from "../../../base/browser/ui/progressbar/progressbar.js";
import { defaultProgressBarStyles } from "../../../platform/theme/browser/defaultStyles.js";
import { AbstractProgressScope, ScopedProgressIndicator } from "../../../workbench/services/progress/browser/progressIndicator.js";
import { observableValue } from "../../../base/common/observable.js";
import { IWorkbenchAssignmentService } from "../../../workbench/services/assignment/common/assignmentService.js";
import { IAgentWorkbenchLayoutService } from "../workbench.js";
import { applyAgentsPartCardStyles, getAgentsPartCardContentSize } from "./agentsPartCard.js";
const HARNESS_PICKER_IN_CONTROLS_TREATMENT = "agentSessionsHarnessPickerInControls";
let SessionsPart = class extends Part {
  constructor(themeService, storageService, agentWorkbenchLayoutService, contextKeyService, instantiationService, assignmentService) {
    super(
      Parts.SESSIONS_PART,
      { hasTitle: false, borderWidth: () => 0 },
      themeService,
      storageService,
      agentWorkbenchLayoutService
    );
    this.agentWorkbenchLayoutService = agentWorkbenchLayoutService;
    this.instantiationService = instantiationService;
    this.assignmentService = assignmentService;
    this.minimumWidth = 300;
    this.maximumWidth = Number.POSITIVE_INFINITY;
    this.minimumHeight = 0;
    this.maximumHeight = Number.POSITIVE_INFINITY;
    /**
     * Session views mounted in the grid, in display order (left-to-right). Slots
     * are reused across reconciliations: only the slot count changes with the
     * number of visible sessions; each slot is rebound to its session by position
     * via {@link SessionView.openSession}. There is always at least one slot — a
     * new-session placeholder (`boundSessionId === undefined`) when no sessions
     * are visible.
     */
    this._slots = [];
    this._onDidFocusSession = this._register(new Emitter());
    /** Fired when a session view in the grid receives keyboard focus. */
    this.onDidFocusSession = this._onDidFocusSession.event;
    /**
     * Whether the part itself is visible in the workbench grid. Starts `true`
     * because the workbench grid only calls {@link setVisible} on change.
     */
    this._isPartVisible = true;
    /**
     * Whether the session type ("harness") picker should be rendered below the
     * input (in the controls) instead of next to the workspace picker. Backed
     * by the {@link HARNESS_PICKER_IN_CONTROLS_TREATMENT} A/B experiment, which
     * is resolved asynchronously and updates this observable once it is known.
     * Passed down to new-chat views, which snapshot it at creation time.
     */
    this._renderSessionTypePickerInControls = observableValue(this, false);
    this.priority = LayoutPriority.High;
    ActiveSessionsContext.bindTo(contextKeyService);
    this._sessionsFocusKey = SessionsFocusContext.bindTo(contextKeyService);
    this._multipleSessionsVisibleKey = MultipleSessionsVisibleContext.bindTo(contextKeyService);
  }
  get snap() {
    return false;
  }
  get preferredHeight() {
    return this.layoutService.mainContainerDimension.height * 0.4;
  }
  /**
   * Resolve the harness-picker placement treatment now and whenever the
   * assignment service refetches. New-chat views snapshot the value when they
   * are created, so views mounted before the treatment resolves keep the
   * default placement until they are recreated.
   */
  _trackOptions() {
    const store = new DisposableStore();
    const updateHarnessPickerPlacement = async () => {
      const value = await this.assignmentService.getTreatment(HARNESS_PICKER_IN_CONTROLS_TREATMENT);
      this._renderSessionTypePickerInControls.set(value === true, void 0);
    };
    store.add(this.assignmentService.onDidRefetchAssignments(() => updateHarnessPickerPlacement()));
    updateHarnessPickerPlacement();
    return store;
  }
  create(parent) {
    this.element = parent;
    parent.classList.add("sessionspart");
    this._register(this._trackOptions());
    super.create(parent);
  }
  createContentArea(parent) {
    const contentArea = $(".content");
    parent.appendChild(contentArea);
    const focusTracker = this._register(trackFocus(contentArea));
    this._register(focusTracker.onDidFocus(() => this._sessionsFocusKey.set(true)));
    this._register(focusTracker.onDidBlur(() => this._sessionsFocusKey.set(false)));
    this._progressBar = this._register(new ProgressBar(contentArea, defaultProgressBarStyles));
    this._progressBar.hide();
    const placeholder = this._createSlot();
    this._gridWidget = this._register(new SerializableGrid(placeholder.view, { styles: { separatorBorder: this._gridSeparatorBorder } }));
    this._slots.push(placeholder);
    contentArea.appendChild(this._gridWidget.element);
    this._register(this._gridWidget.onDidChangeViewMaximized(() => this._updateMaximizedState()));
    const dropDelegate = {
      findTargetView: (child) => this._findTargetView(child)
    };
    this._register(this.instantiationService.createInstance(SessionDropTarget, contentArea, dropDelegate));
    return contentArea;
  }
  _findTargetView(child) {
    for (const slot of this._slots) {
      if (slot.boundSessionId === void 0) {
        continue;
      }
      if (isAncestor(child, slot.view.element)) {
        return { sessionId: slot.boundSessionId, element: slot.view.element };
      }
    }
    return void 0;
  }
  /**
   * Reconcile the grid with the desired set of visible sessions. Reuses the
   * existing {@link SessionView} slots, growing or shrinking the pool only when
   * the number of visible sessions changes, and rebinds each slot to its
   * session by position via {@link SessionView.openSession}.
   */
  updateVisibleSessions(visible, active) {
    if (!this._gridWidget) {
      return;
    }
    const desiredCount = Math.max(visible.length, 1);
    while (this._slots.length < desiredCount) {
      const slot = this._createSlot();
      const reference = this._slots[this._slots.length - 1].view;
      this._gridWidget.addView(slot.view, Sizing.Distribute, reference, Direction.Right);
      this._slots.push(slot);
    }
    while (this._slots.length > desiredCount) {
      const slot = this._slots.pop();
      this._gridWidget.removeView(slot.view, Sizing.Distribute);
      slot.disposables.dispose();
    }
    for (let i = 0; i < this._slots.length; i++) {
      const slot = this._slots[i];
      const session = visible[i];
      slot.boundSessionId = session?.sessionId;
      slot.view.openSession(session, { renderSessionTypePickerInControls: this._renderSessionTypePickerInControls });
    }
    const activeId = active?.sessionId;
    for (const slot of this._slots) {
      const isActive = slot.boundSessionId !== void 0 && slot.boundSessionId === activeId || this._slots.length === 1;
      slot.view.element.classList.toggle("is-active", isActive);
      slot.view.setActive(isActive);
    }
    if (this._gridWidget.hasMaximizedView()) {
      const maximizedSlot = this._slots.find((s) => this._gridWidget.isViewMaximized(s.view));
      if (maximizedSlot && maximizedSlot.boundSessionId !== activeId) {
        this._gridWidget.exitMaximizedView();
      }
    }
    this._updateContextKeys(visible);
  }
  _updateContextKeys(visible) {
    this._multipleSessionsVisibleKey.set(visible.length > 1);
  }
  /**
   * Pushes the grid's current maximized state into each {@link SessionView} so
   * its scoped `sessionIsMaximized` context key (used by toolbar actions) is
   * accurate. Called whenever the grid emits a maximize change.
   */
  _updateMaximizedState() {
    if (!this._gridWidget) {
      return;
    }
    for (const slot of this._slots) {
      slot.view.setMaximized(this._gridWidget.isViewMaximized(slot.view));
    }
  }
  /**
   * Toggles the maximized state of the session view hosting the given session.
   * If the view is already maximized, exits maximized state. Otherwise maximizes
   * it (no-op if fewer than two non-placeholder views are present).
   *
   * Returns the view's maximized state after the toggle, or `undefined` when
   * the call was a no-op.
   */
  toggleMaximizeSession(sessionId) {
    if (!this._gridWidget) {
      return void 0;
    }
    const slot = this._slots.find((s) => s.boundSessionId === sessionId);
    if (!slot) {
      return void 0;
    }
    if (this._gridWidget.isViewMaximized(slot.view)) {
      this._gridWidget.exitMaximizedView();
      return false;
    } else if (this._slots.filter((s) => s.boundSessionId !== void 0).length >= 2) {
      this._gridWidget.maximizeView(slot.view);
      slot.view.focus();
      return true;
    }
    return void 0;
  }
  /**
   * Returns the {@link SessionView} currently hosting the given session id, or
   * the placeholder (new-session) view when `sessionId` is `undefined`. Returns
   * `undefined` if no matching slot exists in the grid.
   */
  getSessionView(sessionId) {
    return this._slots.find((s) => s.boundSessionId === sessionId)?.view;
  }
  /**
   * Moves keyboard focus into the session view hosting the given session id (or
   * the placeholder view when `sessionId` is `undefined`), first revealing it in
   * the grid when it is only partially visible. No-op if no matching slot exists.
   */
  focusSession(sessionId) {
    const slot = this._slots.find((s) => s.boundSessionId === sessionId);
    if (!slot) {
      return;
    }
    this._revealView(slot.view);
    slot.view.focus();
  }
  /**
   * Ensures the given view is fully visible within the grid. The grid clips its
   * leaves (`overflow: hidden`) and lays them out side by side; when there are
   * more sessions than fit, the grid's split view overflows horizontally and
   * becomes scrollable, leaving views near the edges partially hidden. When the
   * target view is not fully visible, scroll it into view.
   */
  _revealView(view) {
    if (!this._gridWidget) {
      return;
    }
    const containerRect = this._gridWidget.element.getBoundingClientRect();
    const viewRect = view.element.getBoundingClientRect();
    const isFullyVisible = viewRect.left >= containerRect.left - 1 && viewRect.right <= containerRect.right + 1;
    if (!isFullyVisible) {
      view.element.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
  /**
   * Returns the progress indicator for the part. Drives the progress bar shown
   * at the top of the content area. Indicator state is scoped to the part's
   * visibility, mirroring how view panes manage their own progress indicators.
   */
  getProgressIndicator() {
    if (!this._progressIndicator) {
      const progressBar = assertReturnsDefined(this._progressBar);
      const scopeId = Parts.SESSIONS_PART;
      const isVisible = this.layoutService.isVisible(scopeId);
      const onDidVisibilityChange = this.onDidVisibilityChange;
      const scope = this._register(new class extends AbstractProgressScope {
        constructor() {
          super(scopeId, isVisible);
          this._register(onDidVisibilityChange((visible) => visible ? this.onScopeOpened(scopeId) : this.onScopeClosed(scopeId)));
        }
      }());
      this._progressIndicator = this._register(new ScopedProgressIndicator(progressBar, scope));
    }
    return this._progressIndicator;
  }
  _createSlot() {
    const disposables = new DisposableStore();
    const view = disposables.add(this.instantiationService.createInstance(SessionView));
    view.setPartVisible(this._isPartVisible);
    const slot = { view, disposables, boundSessionId: void 0 };
    const fireFocus = () => {
      if (slot.boundSessionId !== void 0) {
        this._restoreSessionOnActivation(view);
        this._onDidFocusSession.fire(slot.boundSessionId);
      }
    };
    disposables.add(addDisposableListener(view.element, EventType.FOCUS_IN, fireFocus, true));
    disposables.add(addDisposableGenericMouseDownListener(view.element, fireFocus, true));
    return slot;
  }
  _restoreSessionOnActivation(view) {
    if (!this._gridWidget) {
      return;
    }
    const viewSize = this._gridWidget.getViewSize(view);
    if (viewSize.width === view.minimumWidth) {
      this._gridWidget.expandView(view);
    }
  }
  get _gridSeparatorBorder() {
    return this.theme.getColor(agentsPanelBorder) || this.theme.getColor(contrastBorder) || Color.transparent;
  }
  updateStyles() {
    super.updateStyles();
    const container = assertReturnsDefined(this.getContainer());
    applyAgentsPartCardStyles(container, this.theme);
    this._gridWidget?.style({ separatorBorder: this._gridSeparatorBorder });
  }
  setVisible(visible) {
    if (this._isPartVisible !== visible) {
      this._isPartVisible = visible;
      for (const slot of this._slots) {
        slot.view.setPartVisible(visible);
      }
    }
    super.setVisible(visible);
  }
  layout(width, height, top, left) {
    if (!this.layoutService.isVisible(Parts.SESSIONS_PART)) {
      return;
    }
    this._lastLayout = { width, height, top, left };
    const cardSize = getAgentsPartCardContentSize(width, height, this.agentWorkbenchLayoutService.isEditorPaneVisible());
    const { contentSize } = this.layoutContents(cardSize.width, cardSize.height);
    this._gridWidget?.layout(contentSize.width, contentSize.height, top, left);
    super.layout(width, height, top, left);
  }
  dispose() {
    for (const slot of this._slots) {
      slot.disposables.dispose();
    }
    this._slots.length = 0;
    super.dispose();
  }
  toJSON() {
    return {
      type: Parts.SESSIONS_PART
    };
  }
};
/** Border width on the card (1px each side) */
SessionsPart.BORDER_WIDTH = 1;
SessionsPart = __decorateClass([
  __decorateParam(0, IThemeService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IAgentWorkbenchLayoutService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IWorkbenchAssignmentService)
], SessionsPart);
export {
  SessionsPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXHNlc3Npb25zUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9zZXNzaW9uc1BhcnQuY3NzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBhZ2VudHNQYW5lbEJvcmRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgTGF5b3V0UHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc3BsaXR2aWV3L3NwbGl0dmlldy5qcyc7XG5pbXBvcnQgeyBEaXJlY3Rpb24sIFNlcmlhbGl6YWJsZUdyaWQsIFNpemluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ncmlkL2dyaWQuanMnO1xuaW1wb3J0IHsgUGFydCB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnQuanMnO1xuaW1wb3J0IHsgQWN0aXZlU2Vzc2lvbnNDb250ZXh0LCBNdWx0aXBsZVNlc3Npb25zVmlzaWJsZUNvbnRleHQsIFNlc3Npb25zRm9jdXNDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBpc0FuY2VzdG9yLCB0cmFja0ZvY3VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblZpZXcgfSBmcm9tICcuL3Nlc3Npb25WaWV3LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IGNvbnRyYXN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkRyb3BUYXJnZXQsIElTZXNzaW9uRHJvcFRhcmdldERlbGVnYXRlIH0gZnJvbSAnLi9zZXNzaW9uRHJvcFRhcmdldC5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzc0JhciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzSW5kaWNhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IEFic3RyYWN0UHJvZ3Jlc3NTY29wZSwgU2NvcGVkUHJvZ3Jlc3NJbmRpY2F0b3IgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcHJvZ3Jlc3MvYnJvd3Nlci9wcm9ncmVzc0luZGljYXRvci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vd29ya2JlbmNoLmpzJztcbmltcG9ydCB7IGFwcGx5QWdlbnRzUGFydENhcmRTdHlsZXMsIGdldEFnZW50c1BhcnRDYXJkQ29udGVudFNpemUgfSBmcm9tICcuL2FnZW50c1BhcnRDYXJkLmpzJztcblxuLyoqXG4gKiBFeFAgdHJlYXRtZW50IHRoYXQsIHdoZW4gZW5hYmxlZCwgbW92ZXMgdGhlIHNlc3Npb24gdHlwZSAoXCJoYXJuZXNzXCIpIHBpY2tlclxuICogZnJvbSBpdHMgZGVmYXVsdCBzcG90IG5leHQgdG8gdGhlIHdvcmtzcGFjZSBwaWNrZXIgZG93biBpbnRvIHRoZSBib3R0b20gaW5wdXRcbiAqIGNvbnRyb2xzIChhbmQgZHJvcHMgdGhlIFwid2l0aFwiIGNvbm5lY3RvciBsYWJlbCkuIFJlc29sdmVkIG9uY2UgdmlhIHRoZVxuICoge0BsaW5rIElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZX0gYW5kIHN1cmZhY2VkIHRvIG5ldy1jaGF0IHZpZXdzIHRocm91Z2hcbiAqIHRoZSBuZXctY2hhdCB2aWV3IG9wdGlvbnMuXG4gKi9cbmNvbnN0IEhBUk5FU1NfUElDS0VSX0lOX0NPTlRST0xTX1RSRUFUTUVOVCA9ICdhZ2VudFNlc3Npb25zSGFybmVzc1BpY2tlckluQ29udHJvbHMnO1xuXG5pbnRlcmZhY2UgSUdyaWRTbG90IHtcblx0cmVhZG9ubHkgdmlldzogU2Vzc2lvblZpZXc7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdC8qKiBTZXNzaW9uIGN1cnJlbnRseSBib3VuZCB0byB0aGlzIHNsb3QsIG9yIGB1bmRlZmluZWRgIGZvciB0aGUgbmV3LXNlc3Npb24gcGxhY2Vob2xkZXIuICovXG5cdGJvdW5kU2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBTZXNzaW9uc1BhcnQgZXh0ZW5kcyBQYXJ0IHtcblxuXHRvdmVycmlkZSByZWFkb25seSBtaW5pbXVtV2lkdGg6IG51bWJlciA9IDMwMDtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgbWF4aW11bVdpZHRoOiBudW1iZXIgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG1pbmltdW1IZWlnaHQ6IG51bWJlciA9IDA7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG1heGltdW1IZWlnaHQ6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblx0Z2V0IHNuYXAoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXG5cdC8qKiBCb3JkZXIgd2lkdGggb24gdGhlIGNhcmQgKDFweCBlYWNoIHNpZGUpICovXG5cdHN0YXRpYyByZWFkb25seSBCT1JERVJfV0lEVEggPSAxO1xuXG5cdC8qKiBJbnRlcm5hbCBncmlkIHRoYXQgaG9zdHMgdGhlIHBhcnQncyBzZXNzaW9uIHZpZXdzLiAqL1xuXHRwcm90ZWN0ZWQgX2dyaWRXaWRnZXQ6IFNlcmlhbGl6YWJsZUdyaWQ8U2Vzc2lvblZpZXc+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBMYXppbHktY3JlYXRlZCBwcm9ncmVzcyBiYXIgc2hvd24gYXQgdGhlIHRvcCBvZiB0aGUgY29udGVudCBhcmVhLiAqL1xuXHRwcml2YXRlIF9wcm9ncmVzc0JhcjogUHJvZ3Jlc3NCYXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Byb2dyZXNzSW5kaWNhdG9yOiBJUHJvZ3Jlc3NJbmRpY2F0b3IgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNlc3Npb24gdmlld3MgbW91bnRlZCBpbiB0aGUgZ3JpZCwgaW4gZGlzcGxheSBvcmRlciAobGVmdC10by1yaWdodCkuIFNsb3RzXG5cdCAqIGFyZSByZXVzZWQgYWNyb3NzIHJlY29uY2lsaWF0aW9uczogb25seSB0aGUgc2xvdCBjb3VudCBjaGFuZ2VzIHdpdGggdGhlXG5cdCAqIG51bWJlciBvZiB2aXNpYmxlIHNlc3Npb25zOyBlYWNoIHNsb3QgaXMgcmVib3VuZCB0byBpdHMgc2Vzc2lvbiBieSBwb3NpdGlvblxuXHQgKiB2aWEge0BsaW5rIFNlc3Npb25WaWV3Lm9wZW5TZXNzaW9ufS4gVGhlcmUgaXMgYWx3YXlzIGF0IGxlYXN0IG9uZSBzbG90IFx1MjAxNCBhXG5cdCAqIG5ldy1zZXNzaW9uIHBsYWNlaG9sZGVyIChgYm91bmRTZXNzaW9uSWQgPT09IHVuZGVmaW5lZGApIHdoZW4gbm8gc2Vzc2lvbnNcblx0ICogYXJlIHZpc2libGUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbG90czogSUdyaWRTbG90W10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdC8qKiBGaXJlZCB3aGVuIGEgc2Vzc2lvbiB2aWV3IGluIHRoZSBncmlkIHJlY2VpdmVzIGtleWJvYXJkIGZvY3VzLiAqL1xuXHRyZWFkb25seSBvbkRpZEZvY3VzU2Vzc2lvbjogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkRm9jdXNTZXNzaW9uLmV2ZW50O1xuXG5cdHByb3RlY3RlZCBfbGFzdExheW91dDogeyByZWFkb25seSB3aWR0aDogbnVtYmVyOyByZWFkb25seSBoZWlnaHQ6IG51bWJlcjsgcmVhZG9ubHkgdG9wOiBudW1iZXI7IHJlYWRvbmx5IGxlZnQ6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX211bHRpcGxlU2Vzc2lvbnNWaXNpYmxlS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNGb2N1c0tleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHBhcnQgaXRzZWxmIGlzIHZpc2libGUgaW4gdGhlIHdvcmtiZW5jaCBncmlkLiBTdGFydHMgYHRydWVgXG5cdCAqIGJlY2F1c2UgdGhlIHdvcmtiZW5jaCBncmlkIG9ubHkgY2FsbHMge0BsaW5rIHNldFZpc2libGV9IG9uIGNoYW5nZS5cblx0ICovXG5cdHByaXZhdGUgX2lzUGFydFZpc2libGUgPSB0cnVlO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBzZXNzaW9uIHR5cGUgKFwiaGFybmVzc1wiKSBwaWNrZXIgc2hvdWxkIGJlIHJlbmRlcmVkIGJlbG93IHRoZVxuXHQgKiBpbnB1dCAoaW4gdGhlIGNvbnRyb2xzKSBpbnN0ZWFkIG9mIG5leHQgdG8gdGhlIHdvcmtzcGFjZSBwaWNrZXIuIEJhY2tlZFxuXHQgKiBieSB0aGUge0BsaW5rIEhBUk5FU1NfUElDS0VSX0lOX0NPTlRST0xTX1RSRUFUTUVOVH0gQS9CIGV4cGVyaW1lbnQsIHdoaWNoXG5cdCAqIGlzIHJlc29sdmVkIGFzeW5jaHJvbm91c2x5IGFuZCB1cGRhdGVzIHRoaXMgb2JzZXJ2YWJsZSBvbmNlIGl0IGlzIGtub3duLlxuXHQgKiBQYXNzZWQgZG93biB0byBuZXctY2hhdCB2aWV3cywgd2hpY2ggc25hcHNob3QgaXQgYXQgY3JlYXRpb24gdGltZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlclNlc3Npb25UeXBlUGlja2VySW5Db250cm9scyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPih0aGlzLCBmYWxzZSk7XG5cblx0Z2V0IHByZWZlcnJlZEhlaWdodCgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lckRpbWVuc2lvbi5oZWlnaHQgKiAwLjQ7XG5cdH1cblxuXHRyZWFkb25seSBwcmlvcml0eSA9IExheW91dFByaW9yaXR5LkhpZ2g7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZTogSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFzc2lnbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0UGFydHMuU0VTU0lPTlNfUEFSVCxcblx0XHRcdHsgaGFzVGl0bGU6IGZhbHNlLCBib3JkZXJXaWR0aDogKCkgPT4gMCB9LFxuXHRcdFx0dGhlbWVTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRhZ2VudFdvcmtiZW5jaExheW91dFNlcnZpY2Vcblx0XHQpO1xuXG5cdFx0Ly8gQmluZCBjb250ZXh0IGtleXMgZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBleGlzdGluZyB3aGVuLWNsYXVzZXNcblx0XHRBY3RpdmVTZXNzaW9uc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9zZXNzaW9uc0ZvY3VzS2V5ID0gU2Vzc2lvbnNGb2N1c0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9tdWx0aXBsZVNlc3Npb25zVmlzaWJsZUtleSA9IE11bHRpcGxlU2Vzc2lvbnNWaXNpYmxlQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIGhhcm5lc3MtcGlja2VyIHBsYWNlbWVudCB0cmVhdG1lbnQgbm93IGFuZCB3aGVuZXZlciB0aGVcblx0ICogYXNzaWdubWVudCBzZXJ2aWNlIHJlZmV0Y2hlcy4gTmV3LWNoYXQgdmlld3Mgc25hcHNob3QgdGhlIHZhbHVlIHdoZW4gdGhleVxuXHQgKiBhcmUgY3JlYXRlZCwgc28gdmlld3MgbW91bnRlZCBiZWZvcmUgdGhlIHRyZWF0bWVudCByZXNvbHZlcyBrZWVwIHRoZVxuXHQgKiBkZWZhdWx0IHBsYWNlbWVudCB1bnRpbCB0aGV5IGFyZSByZWNyZWF0ZWQuXG5cdCAqL1xuXHRwcml2YXRlIF90cmFja09wdGlvbnMoKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gSGFybmVzcyBwaWNrZXIgcGxhY2VtZW50XG5cdFx0Y29uc3QgdXBkYXRlSGFybmVzc1BpY2tlclBsYWNlbWVudCA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5hc3NpZ25tZW50U2VydmljZS5nZXRUcmVhdG1lbnQ8Ym9vbGVhbj4oSEFSTkVTU19QSUNLRVJfSU5fQ09OVFJPTFNfVFJFQVRNRU5UKTtcblx0XHRcdHRoaXMuX3JlbmRlclNlc3Npb25UeXBlUGlja2VySW5Db250cm9scy5zZXQodmFsdWUgPT09IHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0fTtcblx0XHRzdG9yZS5hZGQodGhpcy5hc3NpZ25tZW50U2VydmljZS5vbkRpZFJlZmV0Y2hBc3NpZ25tZW50cygoKSA9PiB1cGRhdGVIYXJuZXNzUGlja2VyUGxhY2VtZW50KCkpKTtcblx0XHR1cGRhdGVIYXJuZXNzUGlja2VyUGxhY2VtZW50KCk7XG5cblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudCA9IHBhcmVudDtcblx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCgnc2Vzc2lvbnNwYXJ0Jyk7XG5cblx0XHQvLyBSZXNvbHZlIHRyZWF0bWVudHMgaGVyZSByYXRoZXIgdGhhbiBpbiB0aGUgY29uc3RydWN0b3I6IHRvdWNoaW5nIHRoZVxuXHRcdC8vIGFzc2lnbm1lbnQgc2VydmljZSBmb3JjZXMgaXQgKGFuZCBpdHMgZWFnZXJseS1jb25zdHJ1Y3RlZCBmaWx0ZXJcblx0XHQvLyBwcm92aWRlcnMpIHRvIGluc3RhbnRpYXRlLiBEb2luZyB0aGF0IGR1cmluZyB0aGUgcGFydCdzIGNvbnN0cnVjdGlvbiBcdTIwMTRcblx0XHQvLyB3aGljaCBydW5zIHdoaWxlIHRoZSB3b3JrYmVuY2ggbGF5b3V0IGlzIGJlaW5nIGluaXRpYWxpemVkIFx1MjAxNCBoYXMgYmVlblxuXHRcdC8vIG9ic2VydmVkIHRvIHRyaWdnZXIgcmUtZW50cmFuY3kgaXNzdWVzIGluIGVudGl0bGVtZW50LWRlcGVuZGVudCBmaWx0ZXJcblx0XHQvLyBwcm92aWRlcnMuIGBjcmVhdGUoKWAgcnVucyBsYXRlciwgb25jZSBsYXlvdXQgaW5pdCBoYXMgc2V0dGxlZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmFja09wdGlvbnMoKSk7XG5cblx0XHRzdXBlci5jcmVhdGUocGFyZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVDb250ZW50QXJlYShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGNvbnRlbnRBcmVhID0gJCgnLmNvbnRlbnQnKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQoY29udGVudEFyZWEpO1xuXG5cdFx0Ly8gVHJhY2sga2V5Ym9hcmQgZm9jdXMgd2l0aGluIHRoZSBzZXNzaW9ucyBjb250ZW50IHNvIHRoZSBgc2Vzc2lvbnNGb2N1c2Bcblx0XHQvLyBjb250ZXh0IGtleSByZWZsZWN0cyB3aGV0aGVyIGEgc2Vzc2lvbiAoaXRzIGNoYXQgdmlldykgY3VycmVudGx5IGhhcyBmb2N1cy5cblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcih0cmFja0ZvY3VzKGNvbnRlbnRBcmVhKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5fc2Vzc2lvbnNGb2N1c0tleS5zZXQodHJ1ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHRoaXMuX3Nlc3Npb25zRm9jdXNLZXkuc2V0KGZhbHNlKSkpO1xuXG5cdFx0Ly8gUHJvZ3Jlc3MgYmFyIHBpbm5lZCB0byB0aGUgdG9wIG9mIHRoZSBjb250ZW50IGFyZWEgKHNlZSBzZXNzaW9uc1BhcnQuY3NzXG5cdFx0Ly8gcnVsZSBgLnBhcnQuc2Vzc2lvbnNwYXJ0ID4gLmNvbnRlbnQgPiAubW9uYWNvLXByb2dyZXNzLWNvbnRhaW5lcmApLlxuXHRcdHRoaXMuX3Byb2dyZXNzQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2dyZXNzQmFyKGNvbnRlbnRBcmVhLCBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMpKTtcblx0XHR0aGlzLl9wcm9ncmVzc0Jhci5oaWRlKCk7XG5cblx0XHQvLyBTZWVkIHRoZSBncmlkIHdpdGggYSBwbGFjZWhvbGRlciBzbG90IHNvIFNlcmlhbGl6YWJsZUdyaWQgYWx3YXlzIGhhc1xuXHRcdC8vIGF0IGxlYXN0IG9uZSBsZWFmLiBSZWJvdW5kIHRvIGEgc2Vzc2lvbiB3aGVuIHZpc2libGUgc2Vzc2lvbnMgYXBwZWFyLlxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gdGhpcy5fY3JlYXRlU2xvdCgpO1xuXHRcdHRoaXMuX2dyaWRXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2VyaWFsaXphYmxlR3JpZChwbGFjZWhvbGRlci52aWV3LCB7IHN0eWxlczogeyBzZXBhcmF0b3JCb3JkZXI6IHRoaXMuX2dyaWRTZXBhcmF0b3JCb3JkZXIgfSB9KSk7XG5cdFx0dGhpcy5fc2xvdHMucHVzaChwbGFjZWhvbGRlcik7XG5cdFx0Y29udGVudEFyZWEuYXBwZW5kQ2hpbGQodGhpcy5fZ3JpZFdpZGdldC5lbGVtZW50KTtcblxuXHRcdC8vIFByb3BhZ2F0ZSB0aGUgZ3JpZCdzIG1heGltaXplZC12aWV3IHN0YXRlIHRvIGVhY2ggc2Vzc2lvbiB2aWV3IHNvIHRoZVxuXHRcdC8vIHBlci12aWV3IHRvb2xiYXJzIGNhbiByZW5kZXIgdGhlIG1heGltaXplIGFjdGlvbiBpbiBpdHMgdG9nZ2xlZCBzdGF0ZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ncmlkV2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01heGltaXplZCgoKSA9PiB0aGlzLl91cGRhdGVNYXhpbWl6ZWRTdGF0ZSgpKSk7XG5cblx0XHQvLyBEcm9wIHRhcmdldCBmb3IgcmVjZWl2aW5nIHNlc3Npb25zIGRyYWdnZWQgZnJvbSB0aGUgc2Vzc2lvbnMgbGlzdC5cblx0XHRjb25zdCBkcm9wRGVsZWdhdGU6IElTZXNzaW9uRHJvcFRhcmdldERlbGVnYXRlID0ge1xuXHRcdFx0ZmluZFRhcmdldFZpZXc6IChjaGlsZDogSFRNTEVsZW1lbnQpID0+IHRoaXMuX2ZpbmRUYXJnZXRWaWV3KGNoaWxkKSxcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkRyb3BUYXJnZXQsIGNvbnRlbnRBcmVhLCBkcm9wRGVsZWdhdGUpKTtcblxuXHRcdHJldHVybiBjb250ZW50QXJlYTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRUYXJnZXRWaWV3KGNoaWxkOiBIVE1MRWxlbWVudCk6IHsgcmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7IHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50IH0gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3Qgc2xvdCBvZiB0aGlzLl9zbG90cykge1xuXHRcdFx0aWYgKHNsb3QuYm91bmRTZXNzaW9uSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FuY2VzdG9yKGNoaWxkLCBzbG90LnZpZXcuZWxlbWVudCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgc2Vzc2lvbklkOiBzbG90LmJvdW5kU2Vzc2lvbklkLCBlbGVtZW50OiBzbG90LnZpZXcuZWxlbWVudCB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29uY2lsZSB0aGUgZ3JpZCB3aXRoIHRoZSBkZXNpcmVkIHNldCBvZiB2aXNpYmxlIHNlc3Npb25zLiBSZXVzZXMgdGhlXG5cdCAqIGV4aXN0aW5nIHtAbGluayBTZXNzaW9uVmlld30gc2xvdHMsIGdyb3dpbmcgb3Igc2hyaW5raW5nIHRoZSBwb29sIG9ubHkgd2hlblxuXHQgKiB0aGUgbnVtYmVyIG9mIHZpc2libGUgc2Vzc2lvbnMgY2hhbmdlcywgYW5kIHJlYmluZHMgZWFjaCBzbG90IHRvIGl0c1xuXHQgKiBzZXNzaW9uIGJ5IHBvc2l0aW9uIHZpYSB7QGxpbmsgU2Vzc2lvblZpZXcub3BlblNlc3Npb259LlxuXHQgKi9cblx0dXBkYXRlVmlzaWJsZVNlc3Npb25zKHZpc2libGU6IHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXSwgYWN0aXZlOiBJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZ3JpZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFsd2F5cyBrZWVwIGF0IGxlYXN0IG9uZSBzbG90IChhIHBsYWNlaG9sZGVyIHdoZW4gbm8gc2Vzc2lvbnMgYXJlIHZpc2libGUpLlxuXHRcdGNvbnN0IGRlc2lyZWRDb3VudCA9IE1hdGgubWF4KHZpc2libGUubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEdyb3cgdGhlIHBvb2wgYnkgYXBwZW5kaW5nIG5ldyBzbG90cyB0byB0aGUgcmlnaHQuXG5cdFx0d2hpbGUgKHRoaXMuX3Nsb3RzLmxlbmd0aCA8IGRlc2lyZWRDb3VudCkge1xuXHRcdFx0Y29uc3Qgc2xvdCA9IHRoaXMuX2NyZWF0ZVNsb3QoKTtcblx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IHRoaXMuX3Nsb3RzW3RoaXMuX3Nsb3RzLmxlbmd0aCAtIDFdLnZpZXc7XG5cdFx0XHR0aGlzLl9ncmlkV2lkZ2V0LmFkZFZpZXcoc2xvdC52aWV3LCBTaXppbmcuRGlzdHJpYnV0ZSwgcmVmZXJlbmNlLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdFx0dGhpcy5fc2xvdHMucHVzaChzbG90KTtcblx0XHR9XG5cblx0XHQvLyBTaHJpbmsgdGhlIHBvb2wgYnkgcmVtb3ZpbmcgdHJhaWxpbmcgc2xvdHMgKGFsd2F5cyBsZWF2ZXMgYXQgbGVhc3Qgb25lKS5cblx0XHR3aGlsZSAodGhpcy5fc2xvdHMubGVuZ3RoID4gZGVzaXJlZENvdW50KSB7XG5cdFx0XHRjb25zdCBzbG90ID0gdGhpcy5fc2xvdHMucG9wKCkhO1xuXHRcdFx0dGhpcy5fZ3JpZFdpZGdldC5yZW1vdmVWaWV3KHNsb3QudmlldywgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXHRcdFx0c2xvdC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmViaW5kIGVhY2ggc2xvdCB0byBpdHMgc2Vzc2lvbiBieSBwb3NpdGlvbiAob3IgdG8gdW5kZWZpbmVkIHBsYWNlaG9sZGVyKS5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3Nsb3RzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzbG90ID0gdGhpcy5fc2xvdHNbaV07XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdmlzaWJsZVtpXTtcblx0XHRcdHNsb3QuYm91bmRTZXNzaW9uSWQgPSBzZXNzaW9uPy5zZXNzaW9uSWQ7XG5cdFx0XHRzbG90LnZpZXcub3BlblNlc3Npb24oc2Vzc2lvbiwgeyByZW5kZXJTZXNzaW9uVHlwZVBpY2tlckluQ29udHJvbHM6IHRoaXMuX3JlbmRlclNlc3Npb25UeXBlUGlja2VySW5Db250cm9scyB9KTtcblx0XHR9XG5cblx0XHQvLyBNYXJrIHRoZSBhY3RpdmUgc2Vzc2lvbidzIGVsZW1lbnQgZm9yIHN0eWxpbmcvZm9jdXMgaW5kaWNhdGlvbi5cblx0XHRjb25zdCBhY3RpdmVJZCA9IGFjdGl2ZT8uc2Vzc2lvbklkO1xuXHRcdGZvciAoY29uc3Qgc2xvdCBvZiB0aGlzLl9zbG90cykge1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSAoc2xvdC5ib3VuZFNlc3Npb25JZCAhPT0gdW5kZWZpbmVkICYmIHNsb3QuYm91bmRTZXNzaW9uSWQgPT09IGFjdGl2ZUlkKSB8fCB0aGlzLl9zbG90cy5sZW5ndGggPT09IDE7XG5cdFx0XHRzbG90LnZpZXcuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdpcy1hY3RpdmUnLCBpc0FjdGl2ZSk7XG5cdFx0XHRzbG90LnZpZXcuc2V0QWN0aXZlKGlzQWN0aXZlKTtcblx0XHR9XG5cblx0XHQvLyBFeGl0IHRoZSBncmlkJ3MgbWF4aW1pemVkIHN0YXRlIHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uIGxhbmRzIGluIGFcblx0XHQvLyBkaWZmZXJlbnQgc2xvdCB0aGFuIHRoZSBtYXhpbWl6ZWQgb25lLiBPcGVuaW5nIGEgc2Vzc2lvbiBpbnRvIHRoZVxuXHRcdC8vIGN1cnJlbnRseS1tYXhpbWl6ZWQgc2xvdCBwcmVzZXJ2ZXMgdGhlIG1heGltaXplZCBzdGF0ZS5cblx0XHRpZiAodGhpcy5fZ3JpZFdpZGdldC5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdGNvbnN0IG1heGltaXplZFNsb3QgPSB0aGlzLl9zbG90cy5maW5kKHMgPT4gdGhpcy5fZ3JpZFdpZGdldCEuaXNWaWV3TWF4aW1pemVkKHMudmlldykpO1xuXHRcdFx0aWYgKG1heGltaXplZFNsb3QgJiYgbWF4aW1pemVkU2xvdC5ib3VuZFNlc3Npb25JZCAhPT0gYWN0aXZlSWQpIHtcblx0XHRcdFx0dGhpcy5fZ3JpZFdpZGdldC5leGl0TWF4aW1pemVkVmlldygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3VwZGF0ZUNvbnRleHRLZXlzKHZpc2libGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29udGV4dEtleXModmlzaWJsZTogcmVhZG9ubHkgKElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkKVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fbXVsdGlwbGVTZXNzaW9uc1Zpc2libGVLZXkuc2V0KHZpc2libGUubGVuZ3RoID4gMSk7XG5cdH1cblxuXHQvKipcblx0ICogUHVzaGVzIHRoZSBncmlkJ3MgY3VycmVudCBtYXhpbWl6ZWQgc3RhdGUgaW50byBlYWNoIHtAbGluayBTZXNzaW9uVmlld30gc29cblx0ICogaXRzIHNjb3BlZCBgc2Vzc2lvbklzTWF4aW1pemVkYCBjb250ZXh0IGtleSAodXNlZCBieSB0b29sYmFyIGFjdGlvbnMpIGlzXG5cdCAqIGFjY3VyYXRlLiBDYWxsZWQgd2hlbmV2ZXIgdGhlIGdyaWQgZW1pdHMgYSBtYXhpbWl6ZSBjaGFuZ2UuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVNYXhpbWl6ZWRTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2dyaWRXaWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzbG90IG9mIHRoaXMuX3Nsb3RzKSB7XG5cdFx0XHRzbG90LnZpZXcuc2V0TWF4aW1pemVkKHRoaXMuX2dyaWRXaWRnZXQuaXNWaWV3TWF4aW1pemVkKHNsb3QudmlldykpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGVzIHRoZSBtYXhpbWl6ZWQgc3RhdGUgb2YgdGhlIHNlc3Npb24gdmlldyBob3N0aW5nIHRoZSBnaXZlbiBzZXNzaW9uLlxuXHQgKiBJZiB0aGUgdmlldyBpcyBhbHJlYWR5IG1heGltaXplZCwgZXhpdHMgbWF4aW1pemVkIHN0YXRlLiBPdGhlcndpc2UgbWF4aW1pemVzXG5cdCAqIGl0IChuby1vcCBpZiBmZXdlciB0aGFuIHR3byBub24tcGxhY2Vob2xkZXIgdmlld3MgYXJlIHByZXNlbnQpLlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRoZSB2aWV3J3MgbWF4aW1pemVkIHN0YXRlIGFmdGVyIHRoZSB0b2dnbGUsIG9yIGB1bmRlZmluZWRgIHdoZW5cblx0ICogdGhlIGNhbGwgd2FzIGEgbm8tb3AuXG5cdCAqL1xuXHR0b2dnbGVNYXhpbWl6ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2dyaWRXaWRnZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNsb3QgPSB0aGlzLl9zbG90cy5maW5kKHMgPT4gcy5ib3VuZFNlc3Npb25JZCA9PT0gc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNsb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9ncmlkV2lkZ2V0LmlzVmlld01heGltaXplZChzbG90LnZpZXcpKSB7XG5cdFx0XHR0aGlzLl9ncmlkV2lkZ2V0LmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9zbG90cy5maWx0ZXIocyA9PiBzLmJvdW5kU2Vzc2lvbklkICE9PSB1bmRlZmluZWQpLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHR0aGlzLl9ncmlkV2lkZ2V0Lm1heGltaXplVmlldyhzbG90LnZpZXcpO1xuXHRcdFx0c2xvdC52aWV3LmZvY3VzKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB7QGxpbmsgU2Vzc2lvblZpZXd9IGN1cnJlbnRseSBob3N0aW5nIHRoZSBnaXZlbiBzZXNzaW9uIGlkLCBvclxuXHQgKiB0aGUgcGxhY2Vob2xkZXIgKG5ldy1zZXNzaW9uKSB2aWV3IHdoZW4gYHNlc3Npb25JZGAgaXMgYHVuZGVmaW5lZGAuIFJldHVybnNcblx0ICogYHVuZGVmaW5lZGAgaWYgbm8gbWF0Y2hpbmcgc2xvdCBleGlzdHMgaW4gdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXRTZXNzaW9uVmlldyhzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFNlc3Npb25WaWV3IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2xvdHMuZmluZChzID0+IHMuYm91bmRTZXNzaW9uSWQgPT09IHNlc3Npb25JZCk/LnZpZXc7XG5cdH1cblxuXHQvKipcblx0ICogTW92ZXMga2V5Ym9hcmQgZm9jdXMgaW50byB0aGUgc2Vzc2lvbiB2aWV3IGhvc3RpbmcgdGhlIGdpdmVuIHNlc3Npb24gaWQgKG9yXG5cdCAqIHRoZSBwbGFjZWhvbGRlciB2aWV3IHdoZW4gYHNlc3Npb25JZGAgaXMgYHVuZGVmaW5lZGApLCBmaXJzdCByZXZlYWxpbmcgaXQgaW5cblx0ICogdGhlIGdyaWQgd2hlbiBpdCBpcyBvbmx5IHBhcnRpYWxseSB2aXNpYmxlLiBOby1vcCBpZiBubyBtYXRjaGluZyBzbG90IGV4aXN0cy5cblx0ICovXG5cdGZvY3VzU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHNsb3QgPSB0aGlzLl9zbG90cy5maW5kKHMgPT4gcy5ib3VuZFNlc3Npb25JZCA9PT0gc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNsb3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmV2ZWFsVmlldyhzbG90LnZpZXcpO1xuXHRcdHNsb3Qudmlldy5mb2N1cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuc3VyZXMgdGhlIGdpdmVuIHZpZXcgaXMgZnVsbHkgdmlzaWJsZSB3aXRoaW4gdGhlIGdyaWQuIFRoZSBncmlkIGNsaXBzIGl0c1xuXHQgKiBsZWF2ZXMgKGBvdmVyZmxvdzogaGlkZGVuYCkgYW5kIGxheXMgdGhlbSBvdXQgc2lkZSBieSBzaWRlOyB3aGVuIHRoZXJlIGFyZVxuXHQgKiBtb3JlIHNlc3Npb25zIHRoYW4gZml0LCB0aGUgZ3JpZCdzIHNwbGl0IHZpZXcgb3ZlcmZsb3dzIGhvcml6b250YWxseSBhbmRcblx0ICogYmVjb21lcyBzY3JvbGxhYmxlLCBsZWF2aW5nIHZpZXdzIG5lYXIgdGhlIGVkZ2VzIHBhcnRpYWxseSBoaWRkZW4uIFdoZW4gdGhlXG5cdCAqIHRhcmdldCB2aWV3IGlzIG5vdCBmdWxseSB2aXNpYmxlLCBzY3JvbGwgaXQgaW50byB2aWV3LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmV2ZWFsVmlldyh2aWV3OiBTZXNzaW9uVmlldyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZ3JpZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb250YWluZXJSZWN0ID0gdGhpcy5fZ3JpZFdpZGdldC5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHZpZXdSZWN0ID0gdmlldy5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IGlzRnVsbHlWaXNpYmxlID0gdmlld1JlY3QubGVmdCA+PSBjb250YWluZXJSZWN0LmxlZnQgLSAxICYmIHZpZXdSZWN0LnJpZ2h0IDw9IGNvbnRhaW5lclJlY3QucmlnaHQgKyAxO1xuXHRcdGlmICghaXNGdWxseVZpc2libGUpIHtcblx0XHRcdHZpZXcuZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGlubGluZTogJ25lYXJlc3QnIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBwcm9ncmVzcyBpbmRpY2F0b3IgZm9yIHRoZSBwYXJ0LiBEcml2ZXMgdGhlIHByb2dyZXNzIGJhciBzaG93blxuXHQgKiBhdCB0aGUgdG9wIG9mIHRoZSBjb250ZW50IGFyZWEuIEluZGljYXRvciBzdGF0ZSBpcyBzY29wZWQgdG8gdGhlIHBhcnQnc1xuXHQgKiB2aXNpYmlsaXR5LCBtaXJyb3JpbmcgaG93IHZpZXcgcGFuZXMgbWFuYWdlIHRoZWlyIG93biBwcm9ncmVzcyBpbmRpY2F0b3JzLlxuXHQgKi9cblx0Z2V0UHJvZ3Jlc3NJbmRpY2F0b3IoKTogSVByb2dyZXNzSW5kaWNhdG9yIHtcblx0XHRpZiAoIXRoaXMuX3Byb2dyZXNzSW5kaWNhdG9yKSB7XG5cdFx0XHRjb25zdCBwcm9ncmVzc0JhciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuX3Byb2dyZXNzQmFyKTtcblx0XHRcdGNvbnN0IHNjb3BlSWQgPSBQYXJ0cy5TRVNTSU9OU19QQVJUO1xuXHRcdFx0Y29uc3QgaXNWaXNpYmxlID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShzY29wZUlkKTtcblx0XHRcdGNvbnN0IG9uRGlkVmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMub25EaWRWaXNpYmlsaXR5Q2hhbmdlO1xuXHRcdFx0Y29uc3Qgc2NvcGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgY2xhc3MgZXh0ZW5kcyBBYnN0cmFjdFByb2dyZXNzU2NvcGUge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcihzY29wZUlkLCBpc1Zpc2libGUpO1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkVmlzaWJpbGl0eUNoYW5nZSh2aXNpYmxlID0+IHZpc2libGUgPyB0aGlzLm9uU2NvcGVPcGVuZWQoc2NvcGVJZCkgOiB0aGlzLm9uU2NvcGVDbG9zZWQoc2NvcGVJZCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSgpKTtcblx0XHRcdHRoaXMuX3Byb2dyZXNzSW5kaWNhdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNjb3BlZFByb2dyZXNzSW5kaWNhdG9yKHByb2dyZXNzQmFyLCBzY29wZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJvZ3Jlc3NJbmRpY2F0b3I7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVTbG90KCk6IElHcmlkU2xvdCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdmlldyA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25WaWV3KSk7XG5cdFx0dmlldy5zZXRQYXJ0VmlzaWJsZSh0aGlzLl9pc1BhcnRWaXNpYmxlKTtcblx0XHRjb25zdCBzbG90OiBJR3JpZFNsb3QgPSB7IHZpZXcsIGRpc3Bvc2FibGVzLCBib3VuZFNlc3Npb25JZDogdW5kZWZpbmVkIH07XG5cdFx0Ly8gUHJvbW90ZSBhIHZpc2libGUgc2Vzc2lvbiB0byB0aGUgYWN0aXZlIHNlc3Npb24gd2hlbiBpdHMgdmlldyByZWNlaXZlc1xuXHRcdC8vIGZvY3VzIG9yIGlzIGNsaWNrZWQuIFBvaW50ZXItZG93biBjb3ZlcnMgY2xpY2tzIG9uIG5vbi1mb2N1c2FibGUgY2hyb21lXG5cdFx0Ly8gKGUuZy4gdGhlIG5ldyBjaGF0IHdpZGdldCdzIHdvcmtzcGFjZSBwaWNrZXIgYXJlYSkgd2hlcmUgZm9jdXMgd291bGRcblx0XHQvLyBub3Qgb3RoZXJ3aXNlIG1vdmUgaW50byB0aGUgdmlldy4gVGhlIHBsYWNlaG9sZGVyIHNsb3QgKG5vIGJvdW5kXG5cdFx0Ly8gc2Vzc2lvbikgaGFzIG5vdGhpbmcgdG8gYWN0aXZhdGUuXG5cdFx0Y29uc3QgZmlyZUZvY3VzID0gKCkgPT4ge1xuXHRcdFx0aWYgKHNsb3QuYm91bmRTZXNzaW9uSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9yZXN0b3JlU2Vzc2lvbk9uQWN0aXZhdGlvbih2aWV3KTtcblx0XHRcdFx0dGhpcy5fb25EaWRGb2N1c1Nlc3Npb24uZmlyZShzbG90LmJvdW5kU2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodmlldy5lbGVtZW50LCBFdmVudFR5cGUuRk9DVVNfSU4sIGZpcmVGb2N1cywgdHJ1ZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHZpZXcuZWxlbWVudCwgZmlyZUZvY3VzLCB0cnVlKSk7XG5cdFx0cmV0dXJuIHNsb3Q7XG5cdH1cblxuXHRwcml2YXRlIF9yZXN0b3JlU2Vzc2lvbk9uQWN0aXZhdGlvbih2aWV3OiBTZXNzaW9uVmlldyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZ3JpZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdTaXplID0gdGhpcy5fZ3JpZFdpZGdldC5nZXRWaWV3U2l6ZSh2aWV3KTtcblx0XHRpZiAodmlld1NpemUud2lkdGggPT09IHZpZXcubWluaW11bVdpZHRoKSB7XG5cdFx0XHR0aGlzLl9ncmlkV2lkZ2V0LmV4cGFuZFZpZXcodmlldyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2dyaWRTZXBhcmF0b3JCb3JkZXIoKTogQ29sb3Ige1xuXHRcdHJldHVybiB0aGlzLnRoZW1lLmdldENvbG9yKGFnZW50c1BhbmVsQm9yZGVyKSB8fCB0aGlzLnRoZW1lLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKSB8fCBDb2xvci50cmFuc3BhcmVudDtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ2V0Q29udGFpbmVyKCkpO1xuXG5cdFx0YXBwbHlBZ2VudHNQYXJ0Q2FyZFN0eWxlcyhjb250YWluZXIsIHRoaXMudGhlbWUpO1xuXG5cdFx0dGhpcy5fZ3JpZFdpZGdldD8uc3R5bGUoeyBzZXBhcmF0b3JCb3JkZXI6IHRoaXMuX2dyaWRTZXBhcmF0b3JCb3JkZXIgfSk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNQYXJ0VmlzaWJsZSAhPT0gdmlzaWJsZSkge1xuXHRcdFx0Ly8gVXBkYXRlIGJlZm9yZSBgc3VwZXJgLCB3aG9zZSBldmVudCByZS1lbnRlcnMgdGhpcyBtZXRob2QuXG5cdFx0XHR0aGlzLl9pc1BhcnRWaXNpYmxlID0gdmlzaWJsZTtcblx0XHRcdGZvciAoY29uc3Qgc2xvdCBvZiB0aGlzLl9zbG90cykge1xuXHRcdFx0XHRzbG90LnZpZXcuc2V0UGFydFZpc2libGUodmlzaWJsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3VwZXIuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5TRVNTSU9OU19QQVJUKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RMYXlvdXQgPSB7IHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCB9O1xuXG5cdFx0Y29uc3QgY2FyZFNpemUgPSBnZXRBZ2VudHNQYXJ0Q2FyZENvbnRlbnRTaXplKHdpZHRoLCBoZWlnaHQsIHRoaXMuYWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLmlzRWRpdG9yUGFuZVZpc2libGUoKSk7XG5cblx0XHQvLyBTaXplIHRoZSBjb250ZW50IGFyZWEgd2l0aCB0aGUgcmVkdWNlZCBkaW1lbnNpb25zLlxuXHRcdGNvbnN0IHsgY29udGVudFNpemUgfSA9IHRoaXMubGF5b3V0Q29udGVudHMoY2FyZFNpemUud2lkdGgsIGNhcmRTaXplLmhlaWdodCk7XG5cblx0XHQvLyBMYXlvdXQgdGhlIGludGVybmFsIGdyaWQgd2lkZ2V0IHdpdGhpbiB0aGUgY29udGVudCBhcmVhLlxuXHRcdHRoaXMuX2dyaWRXaWRnZXQ/LmxheW91dChjb250ZW50U2l6ZS53aWR0aCwgY29udGVudFNpemUuaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXG5cdFx0Ly8gU3RvcmUgdGhlIGZ1bGwgZ3JpZC1hbGxvY2F0ZWQgZGltZW5zaW9ucyBzbyB0aGF0IFBhcnQucmVsYXlvdXQoKSB3b3JrcyBjb3JyZWN0bHkuXG5cdFx0c3VwZXIubGF5b3V0KHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2xvdCBvZiB0aGlzLl9zbG90cykge1xuXHRcdFx0c2xvdC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Nsb3RzLmxlbmd0aCA9IDA7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IFBhcnRzLlNFU1NJT05TX1BBUlRcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVyxrQkFBa0IsY0FBYztBQUNwRCxTQUFTLFlBQVk7QUFDckIsU0FBUyx1QkFBdUIsZ0NBQWdDLDRCQUE0QjtBQUM1RixTQUFTLEdBQUcsdUNBQXVDLHVCQUF1QixXQUFXLFlBQVksa0JBQWtCO0FBRW5ILFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQW9DO0FBQzdDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXFEO0FBQzlELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsdUJBQXVCLCtCQUErQjtBQUMvRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG9D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
