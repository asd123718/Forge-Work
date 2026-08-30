import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { BrowserElementSelectionMode } from "../common/browserView.js";
import { BrowserViewFrameInspector } from "./browserViewFrameInspector.js";
import { localize } from "../../../nls.js";
const localizedStrings = {
  addComment: localize("browserView.addComment", "Add Comment"),
  addCommentPlaceholder: localize("browserView.addCommentPlaceholder", "Add a comment"),
  commentOnSelectedElement: localize("browserView.commentOnSelectedElement", "Comment on selected element"),
  elementComment: localize("browserView.elementComment", "Element comment {0}"),
  elementCommentWithBody: localize("browserView.elementCommentWithBody", "Element comment {0}: {1}"),
  emptyElementComment: localize("browserView.emptyElementComment", "Empty element comment {0}"),
  removeComment: localize("browserView.removeComment", "Remove Comment"),
  removeElementComment: localize("browserView.removeElementComment", "Remove element comment")
};
var BrowserViewInspectElementId = /* @__PURE__ */ ((BrowserViewInspectElementId2) => {
  BrowserViewInspectElementId2["Active"] = "active";
  BrowserViewInspectElementId2["ContextMenuTarget"] = "context-menu-target";
  return BrowserViewInspectElementId2;
})(BrowserViewInspectElementId || {});
class BrowserViewInspector extends Disposable {
  constructor(browser) {
    super();
    this.browser = browser;
    this._onDidSelectElement = this._register(new Emitter());
    this.onDidSelectElement = this._onDidSelectElement.event;
    this._onDidRemoveElementComment = this._register(new Emitter());
    this.onDidRemoveElementComment = this._onDidRemoveElementComment.event;
    this._onDidChangeElementSelectionState = this._register(new Emitter());
    this.onDidChangeElementSelectionState = this._onDidChangeElementSelectionState.event;
    this._elementSelectionActive = false;
    this._activeSelection = this._register(new MutableDisposable());
    this._inspectionOperation = Promise.resolve();
    this._theme = {};
    // Area selection — drag-to-select a rectangle on the top frame.
    // `onDidPickArea` fires exactly once per session, terminating it.
    // The rectangle is undefined when the picker is cancelled (ESC, zero-area drag,
    // external toggle off, navigation, or supersession by element selection).
    // Consumers should listen to this single event instead of trying to reconcile
    // rect vs. activation events across the IPC boundary — those two events travel
    // through separate channels and can be delivered out of order.
    this._onDidPickArea = this._register(new Emitter());
    this.onDidPickArea = this._onDidPickArea.event;
    this._onDidChangeAreaSelectionActive = this._register(new Emitter());
    this.onDidChangeAreaSelectionActive = this._onDidChangeAreaSelectionActive.event;
    this._areaSelectionActive = false;
    this._activeAreaSelection = this._register(new MutableDisposable());
    this._registry = this._register(new FrameInspectorRegistry());
    const webContents = this.browser.webContents;
    this._register(this._registry.onDidAdopt((inspector) => this._onInspectorAdopted(inspector)));
    const onNavigated = () => {
      this._activeSelection.clear();
      this._activeAreaSelection.clear();
    };
    webContents.on("did-navigate", onNavigated);
    this._register({ dispose: () => webContents.removeListener("did-navigate", onNavigated) });
    const onIpcMessage = (_event, channel, ...args) => {
      const senderFrame = _event.senderFrame;
      if (channel === "vscode:browserView:preloadReady") {
        if (!senderFrame) {
          return;
        }
        const frameToken = args[0];
        if (!frameToken) {
          return;
        }
        senderFrame.postMessage("vscode:browserView:setTheme", this._theme);
        senderFrame.postMessage("vscode:browserView:setLocalizedStrings", localizedStrings);
        this._registry.notifyFrameReady(senderFrame, frameToken);
        if (senderFrame === webContents.mainFrame && this._activeAreaSelection.value) {
          try {
            senderFrame.postMessage("vscode:browserView:startAreaPicker", void 0);
          } catch {
          }
        }
      } else if (channel === "vscode:browserView:areaPicked") {
        if (senderFrame !== webContents.mainFrame) {
          return;
        }
        const rect = args[0];
        const validRect = rect && rect.width > 0 && rect.height > 0 ? rect : void 0;
        this._finishAreaPick(validRect);
      } else if (channel === "vscode:browserView:areaPickStopped") {
        if (senderFrame !== webContents.mainFrame) {
          return;
        }
        this._finishAreaPick(void 0);
      }
    };
    webContents.on("ipc-message", onIpcMessage);
    this._register({ dispose: () => webContents.removeListener("ipc-message", onIpcMessage) });
    this._register(this.browser.debugger.onTargetDiscovered(async ({ targetId, type }) => {
      if (type === "iframe") {
        try {
          const session = await this.browser.debugger.attachToTarget(targetId);
          this._watchSession(session);
        } catch {
          return;
        }
      }
    }));
    this.browser.debugger.attach().then((conn) => this._watchSession(conn)).catch(() => {
    });
  }
  get isElementSelectionActive() {
    return this._elementSelectionActive;
  }
  get elementSelectionState() {
    return {
      active: this._elementSelectionActive,
      options: this._activeSelection.value?.options ?? {}
    };
  }
  get isAreaSelectionActive() {
    return this._areaSelectionActive;
  }
  /**
   * Watch a CDP session for execution contexts. When a default context appears,
   * probes for the preload token and correlates with the pending WebFrameMain.
   *
   * Called for every session: the main page session (sees same-origin frames)
   * and each cross-origin target session (sees only its own frame).
   */
  _watchSession(session) {
    this._register(session.onEvent(async (event) => {
      if (event.method === "Runtime.executionContextCreated") {
        const context = event.params.context;
        if (!context?.auxData?.isDefault || !context.auxData.frameId) {
          return;
        }
        const frameId = context.auxData.frameId;
        const uniqueContextId = context.uniqueId;
        try {
          const { result } = await session.sendCommand("Runtime.evaluate", {
            expression: "window.__vscode_helpers?.getFrameToken?.()",
            returnByValue: true,
            uniqueContextId
          });
          const token = result.value;
          if (!token) {
            return;
          }
          this._registry.notifyContextDiscovered(session, uniqueContextId, frameId, token);
        } catch {
        }
      } else if (event.method === "Page.frameDetached") {
        const frameId = event.params?.frameId;
        if (frameId) {
          this._registry.disposeByFrameId(frameId);
        }
      } else if (event.method === "Runtime.executionContextsCleared") {
        this._registry.disposeBySession(session);
      }
    }));
    Event.once(session.onClose)(() => {
      this._registry.disposeBySession(session);
    });
    session.sendCommand("Runtime.enable").catch(() => {
    });
    session.sendCommand("Page.enable").catch(() => {
    });
  }
  /**
   * Called by the registry when a frame inspector is fully adopted.
   * Wires its events to this orchestrator.
   */
  _onInspectorAdopted(inspector) {
    inspector.onDidInspectElement(async (nodeData) => {
      if (!this._activeSelection.value?.options?.continuous) {
        this._activeSelection.clear();
      }
      try {
        const offset = await this._getFrameOffsetInPage(inspector.frame);
        nodeData = this._offsetElementData(nodeData, offset);
      } catch {
      }
      this._onDidSelectElement.fire(nodeData);
    });
    inspector.onDidRemoveElementComment((elementId) => this._onDidRemoveElementComment.fire(elementId));
    inspector.onDidStopPicking(() => {
      this._activeSelection.clear();
    });
    if (this._activeSelection.value) {
      void this._queueInspectionOperation(async () => {
        const activeSelection = this._activeSelection.value;
        if (activeSelection) {
          await inspector.startInspection(activeSelection.options);
        }
      }).catch(() => {
      });
    }
    inspector.setTheme(this._theme);
  }
  setTheme(theme) {
    this._theme = theme;
    for (const inspector of this._registry.inspectors) {
      inspector.setTheme(theme);
    }
  }
  /**
   * Toggle element selection mode across all frames.
   */
  async toggleElementSelection(enabled, options = {}) {
    const newEnabled = enabled ?? !this._elementSelectionActive;
    if (!newEnabled) {
      this._activeSelection.clear();
      return;
    }
    this._activeAreaSelection.clear();
    const activeSelection = this._activeSelection.value;
    const updatedOptions = activeSelection ? { ...activeSelection.options, ...options } : { mode: BrowserElementSelectionMode.Select, ...options };
    if (activeSelection) {
      activeSelection.options = updatedOptions;
      try {
        if (await this._startInspection(activeSelection, updatedOptions)) {
          this._elementSelectionActive = true;
          this._onDidChangeElementSelectionState.fire({ active: true, options: updatedOptions });
        }
      } catch {
        if (this._activeSelection.value === activeSelection && activeSelection.options === updatedOptions) {
          this._activeSelection.clear();
        }
      }
      return;
    }
    const selection = {
      options: updatedOptions,
      dispose: () => {
        if (this._activeSelection.value === selection) {
          this._elementSelectionActive = false;
          this._onDidChangeElementSelectionState.fire({ active: false, options: selection.options });
          this._activeSelection.clearAndLeak();
          void this._queueInspectionOperation(async () => {
            await Promise.all([...this._registry.inspectors].map((i) => i.stopInspection()));
          }).catch(() => {
          });
        }
      }
    };
    this._activeSelection.value = selection;
    try {
      if (await this._startInspection(selection, updatedOptions)) {
        this._elementSelectionActive = true;
        this._onDidChangeElementSelectionState.fire({ active: true, options: updatedOptions });
      }
    } catch {
      if (this._activeSelection.value === selection && selection.options === updatedOptions) {
        this._activeSelection.clear();
      }
    }
  }
  async _startInspection(selection, options) {
    await this._queueInspectionOperation(async () => {
      if (this._activeSelection.value !== selection || selection.options !== options) {
        return;
      }
      await Promise.all([...this._registry.inspectors].map((i) => i.startInspection(options)));
    });
    return this._activeSelection.value === selection && selection.options === options;
  }
  _queueInspectionOperation(operation) {
    const result = this._inspectionOperation.then(operation);
    this._inspectionOperation = result.catch(() => {
    });
    return result;
  }
  setElementComments(update) {
    for (const inspector of this._registry.inspectors) {
      inspector.setElementComments(update);
    }
  }
  /**
   * Toggle drag-to-select area picking on the top frame only.
   * The picker reports the literal user-drawn rectangle (or `undefined` on cancellation)
   * via {@link onDidPickArea}; no DOM elements are inspected.
   */
  async toggleAreaSelection(enabled) {
    const newEnabled = enabled ?? !this._areaSelectionActive;
    if (newEnabled === this._areaSelectionActive) {
      return;
    }
    if (!newEnabled) {
      this._activeAreaSelection.clear();
      return;
    }
    this._activeSelection.clear();
    const mainFrame = this.browser.webContents.mainFrame;
    const start = () => {
      mainFrame.postMessage("vscode:browserView:startAreaPicker", void 0);
    };
    const stop = () => {
      try {
        mainFrame.postMessage("vscode:browserView:stopAreaPicker", void 0);
      } catch {
      }
    };
    const selection = {
      dispose: () => {
        stop();
        this._finishAreaPick(void 0);
      }
    };
    this._activeAreaSelection.value = selection;
    try {
      start();
      if (this._activeAreaSelection.value === selection) {
        this._areaSelectionActive = true;
        this._onDidChangeAreaSelectionActive.fire(true);
      }
    } catch {
      this._activeAreaSelection.clear();
    }
  }
  /**
   * Terminate the current area-pick session, firing `onDidPickArea` exactly once.
   * No-op if no session is active. Uses `clearAndLeak` to avoid recursing into
   * the IActiveSelection.dispose path.
   */
  _finishAreaPick(rect) {
    if (!this._areaSelectionActive && !this._activeAreaSelection.value) {
      return;
    }
    const wasActive = this._areaSelectionActive;
    this._areaSelectionActive = false;
    this._activeAreaSelection.clearAndLeak();
    this._onDidPickArea.fire(rect);
    if (wasActive) {
      this._onDidChangeAreaSelectionActive.fire(false);
    }
  }
  /**
   * Resolve a handle to an element. Routes to the correct frame inspector.
   */
  getElementHandle(id, frame) {
    const handle = this._registry.getByFrame(frame)?.getElementHandle(id);
    if (!handle) {
      return void 0;
    }
    let commentRequested = false;
    return {
      addToChat: () => handle.addToChat(),
      addComment: () => {
        if (commentRequested) {
          return;
        }
        commentRequested = true;
        setTimeout(() => {
          this._activeAreaSelection.clear();
          this._activeSelection.clear();
          void this._queueInspectionOperation(async () => {
            if (!this.browser.webContents.isDestroyed()) {
              this.browser.webContents.focus();
              handle.addComment();
            }
          });
        }, 0);
      },
      highlight: () => handle.highlight(),
      hideHighlight: () => handle.hideHighlight(),
      dispose: () => {
        if (!commentRequested) {
          handle.dispose();
        }
      }
    };
  }
  async getVisualViewportScale(frame = this.browser.webContents.mainFrame) {
    return this._registry.getByFrame(frame)?.getVisualViewportScale() ?? 1;
  }
  /**
   * Compute the cumulative offset of a frame relative to the top-level page.
   * Walks up the frame hierarchy using the parent's CDP session to query the
   * iframe element's box model via `DOM.getFrameOwner` + `DOM.getBoxModel`.
   * Works for both same-origin and cross-origin frames.
   */
  async _getFrameOffsetInPage(frame) {
    const mainFrame = this.browser.webContents.mainFrame;
    let x = 0;
    let y = 0;
    let current = frame;
    while (current !== mainFrame) {
      const parent = current.parent;
      if (!parent) {
        break;
      }
      const childInspector = this._registry.getByFrame(current);
      const parentInspector = this._registry.getByFrame(parent);
      if (!childInspector || !parentInspector) {
        break;
      }
      try {
        const childFrameId = childInspector.frameId;
        const frameOwner = await parentInspector.connection.sendCommand("DOM.getFrameOwner", {
          frameId: childFrameId
        });
        const boxModel = await parentInspector.connection.sendCommand("DOM.getBoxModel", {
          backendNodeId: frameOwner.backendNodeId
        });
        const content = boxModel.model.content;
        x += content[0];
        y += content[1];
      } catch {
        break;
      }
      current = parent;
    }
    return { x, y };
  }
  /**
   * Offset element data bounds by a frame offset.
   */
  _offsetElementData(data, offset) {
    if (offset.x === 0 && offset.y === 0) {
      return data;
    }
    return {
      ...data,
      bounds: {
        x: data.bounds.x + offset.x,
        y: data.bounds.y + offset.y,
        width: data.bounds.width,
        height: data.bounds.height
      }
    };
  }
}
class FrameInspectorRegistry extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidAdopt = this._register(new Emitter());
    this.onDidAdopt = this._onDidAdopt.event;
    /** Pending halves waiting for their counterpart. */
    this._pendingFrames = /* @__PURE__ */ new Map();
    this._pendingSessions = /* @__PURE__ */ new Map();
    /** Adopted inspectors indexed multiple ways. */
    this._all = /* @__PURE__ */ new Set();
    this._byFrame = /* @__PURE__ */ new WeakMap();
    this._byFrameId = /* @__PURE__ */ new Map();
    this._bySession = /* @__PURE__ */ new Map();
  }
  get inspectors() {
    return this._all;
  }
  getByFrame(frame) {
    return this._byFrame.get(frame);
  }
  /**
   * Called when a preload script signals readiness with a token.
   * If a matching CDP context was already discovered, adopts immediately.
   */
  notifyFrameReady(frame, token) {
    const pending = this._pendingSessions.get(token);
    if (pending) {
      this._pendingSessions.delete(token);
      this._adopt(pending.session, pending.uniqueContextId, pending.frameId, frame);
    } else {
      this._pendingFrames.set(token, frame);
    }
  }
  /**
   * Called when a CDP execution context is discovered and its preload token probed.
   * If a matching WebFrameMain was already registered, adopts immediately.
   */
  notifyContextDiscovered(session, uniqueContextId, frameId, token) {
    const frame = this._pendingFrames.get(token);
    if (frame) {
      this._pendingFrames.delete(token);
      this._adopt(session, uniqueContextId, frameId, frame);
    } else {
      this._pendingSessions.set(token, { session, uniqueContextId, frameId });
    }
  }
  /** Dispose the inspector owning the given CDP frameId, if any. Also cleans pending entries. */
  disposeByFrameId(frameId) {
    this._byFrameId.get(frameId)?.dispose();
    for (const [token, pending] of this._pendingSessions) {
      if (pending.frameId === frameId) {
        this._pendingSessions.delete(token);
      }
    }
    for (const [token, frame] of this._pendingFrames) {
      if (frame.detached || frame.isDestroyed()) {
        this._pendingFrames.delete(token);
      }
    }
  }
  /** Dispose all inspectors whose connection is the given session and clear related pending state. */
  disposeBySession(session) {
    const set = this._bySession.get(session);
    if (set) {
      for (const inspector of [...set]) {
        inspector.dispose();
      }
    }
    for (const [token, pending] of this._pendingSessions) {
      if (pending.session === session) {
        this._pendingSessions.delete(token);
      }
    }
  }
  _adopt(session, uniqueContextId, frameId, frame) {
    if (frame.detached || frame.isDestroyed()) {
      return;
    }
    const inspector = new BrowserViewFrameInspector(session, frame, uniqueContextId, frameId);
    this._all.add(inspector);
    this._byFrame.set(frame, inspector);
    this._byFrameId.set(frameId, inspector);
    let sessionSet = this._bySession.get(session);
    if (!sessionSet) {
      sessionSet = /* @__PURE__ */ new Set();
      this._bySession.set(session, sessionSet);
    }
    sessionSet.add(inspector);
    inspector.onWillDispose(() => {
      this._all.delete(inspector);
      this._byFrame.delete(frame);
      this._byFrameId.delete(frameId);
      const s = this._bySession.get(session);
      if (s) {
        s.delete(inspector);
        if (s.size === 0) {
          this._bySession.delete(session);
        }
      }
    });
    this._onDidAdopt.fire(inspector);
  }
  dispose() {
    for (const inspector of [...this._all]) {
      inspector.dispose();
    }
    this._pendingFrames.clear();
    this._pendingSessions.clear();
    super.dispose();
  }
}
export {
  BrowserViewInspectElementId,
  BrowserViewInspector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXGVsZWN0cm9uLW1haW5cXGJyb3dzZXJWaWV3SW5zcGVjdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLCBJQnJvd3NlckVsZW1lbnRDb21tZW50c1VwZGF0ZSwgSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucywgSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uU3RhdGUsIElFbGVtZW50RGF0YSwgSUJyb3dzZXJWaWV3VGhlbWUsIElCcm93c2VyVmlld1JlY3QsIElCcm93c2VyVmlld1ByZWxvYWRMb2NhbGl6ZWRTdHJpbmdzIH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElDRFBDb25uZWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NkcC90eXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IEJyb3dzZXJWaWV3IH0gZnJvbSAnLi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld0ZyYW1lSW5zcGVjdG9yIH0gZnJvbSAnLi9icm93c2VyVmlld0ZyYW1lSW5zcGVjdG9yLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcblxuY29uc3QgbG9jYWxpemVkU3RyaW5nczogSUJyb3dzZXJWaWV3UHJlbG9hZExvY2FsaXplZFN0cmluZ3MgPSB7XG5cdGFkZENvbW1lbnQ6IGxvY2FsaXplKCdicm93c2VyVmlldy5hZGRDb21tZW50JywgXCJBZGQgQ29tbWVudFwiKSxcblx0YWRkQ29tbWVudFBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnYnJvd3NlclZpZXcuYWRkQ29tbWVudFBsYWNlaG9sZGVyJywgXCJBZGQgYSBjb21tZW50XCIpLFxuXHRjb21tZW50T25TZWxlY3RlZEVsZW1lbnQ6IGxvY2FsaXplKCdicm93c2VyVmlldy5jb21tZW50T25TZWxlY3RlZEVsZW1lbnQnLCBcIkNvbW1lbnQgb24gc2VsZWN0ZWQgZWxlbWVudFwiKSxcblx0ZWxlbWVudENvbW1lbnQ6IGxvY2FsaXplKCdicm93c2VyVmlldy5lbGVtZW50Q29tbWVudCcsIFwiRWxlbWVudCBjb21tZW50IHswfVwiKSxcblx0ZWxlbWVudENvbW1lbnRXaXRoQm9keTogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LmVsZW1lbnRDb21tZW50V2l0aEJvZHknLCBcIkVsZW1lbnQgY29tbWVudCB7MH06IHsxfVwiKSxcblx0ZW1wdHlFbGVtZW50Q29tbWVudDogbG9jYWxpemUoJ2Jyb3dzZXJWaWV3LmVtcHR5RWxlbWVudENvbW1lbnQnLCBcIkVtcHR5IGVsZW1lbnQgY29tbWVudCB7MH1cIiksXG5cdHJlbW92ZUNvbW1lbnQ6IGxvY2FsaXplKCdicm93c2VyVmlldy5yZW1vdmVDb21tZW50JywgXCJSZW1vdmUgQ29tbWVudFwiKSxcblx0cmVtb3ZlRWxlbWVudENvbW1lbnQ6IGxvY2FsaXplKCdicm93c2VyVmlldy5yZW1vdmVFbGVtZW50Q29tbWVudCcsIFwiUmVtb3ZlIGVsZW1lbnQgY29tbWVudFwiKSxcbn07XG5cbmludGVyZmFjZSBJQWN0aXZlU2VsZWN0aW9uIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRvcHRpb25zOiBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25PcHRpb25zO1xufVxuXG5pbnRlcmZhY2UgSUFjdGl2ZUFyZWFTZWxlY3Rpb24gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7IH1cblxuZXhwb3J0IGludGVyZmFjZSBJRWxlbWVudEhhbmRsZSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0YWRkVG9DaGF0KCk6IFByb21pc2U8dm9pZD47XG5cdGFkZENvbW1lbnQoKTogdm9pZDtcblx0aGlnaGxpZ2h0KCk6IFByb21pc2U8dm9pZD47XG5cdGhpZGVIaWdobGlnaHQoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuLyoqXG4gKiBXZWxsLWtub3duIGlkcyB1bmRlcnN0b29kIGJ5IGBfX3ZzY29kZV9oZWxwZXJzLmdldEVsZW1lbnQoaWQpYCBpblxuICogYHByZWxvYWQtYnJvd3NlclZpZXcudHNgLiBBbnkgb3RoZXIgc3RyaW5nIGlzIHRyZWF0ZWQgYXMgdGhlIGlkIG9mIGFcbiAqIGR5bmFtaWNhbGx5IHRyYWNrZWQgZWxlbWVudC5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gQnJvd3NlclZpZXdJbnNwZWN0RWxlbWVudElkIHtcblx0LyoqIFRoZSBwYWdlJ3MgYGRvY3VtZW50LmFjdGl2ZUVsZW1lbnRgLiAqL1xuXHRBY3RpdmUgPSAnYWN0aXZlJyxcblx0LyoqIFRoZSBlbGVtZW50IHRhcmdldGVkIGJ5IHRoZSBtb3N0IHJlY2VudCBgY29udGV4dG1lbnVgIGV2ZW50LiAqL1xuXHRDb250ZXh0TWVudVRhcmdldCA9ICdjb250ZXh0LW1lbnUtdGFyZ2V0Jyxcbn1cblxuLyoqXG4gKiBNYW5hZ2VzIGVsZW1lbnQgaW5zcGVjdGlvbiBhY3Jvc3MgYWxsIGZyYW1lcyBpbiBhIGJyb3dzZXIgdmlldy5cbiAqXG4gKiBDcmVhdGVzIGEge0BsaW5rIEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3J9IGZvciB0aGUgbWFpbiBmcmFtZSBhbmRcbiAqIGF1dG9tYXRpY2FsbHkgZGlzY292ZXJzIGlmcmFtZSBDRFAgdGFyZ2V0cyB2aWEgYXV0by1hdHRhY2gsIG1hdGNoaW5nXG4gKiB0aGVtIHRvIHRoZWlyIGNvcnJlc3BvbmRpbmcgYFdlYkZyYW1lTWFpbmAgaW5zdGFuY2VzIHVzaW5nIGFuIG9wYXF1ZVxuICogdG9rZW4gZ2VuZXJhdGVkIGJ5IHRoZSBwcmVsb2FkIHNjcmlwdC5cbiAqXG4gKiBUaGlzIGNsYXNzIGlzIGEgdGhpbiBvcmNoZXN0cmF0b3IgXHUyMDE0IGFsbCBwZXItZnJhbWUgQ0RQIGxvZ2ljIChkb21haW5cbiAqIGluaXRpYWxpemF0aW9uLCBlbGVtZW50IGV4dHJhY3Rpb24sIENEUCBpbnNwZWN0IG1vZGUpIGxpdmVzIGluXG4gKiB7QGxpbmsgQnJvd3NlclZpZXdGcmFtZUluc3BlY3Rvcn0uXG4gKi9cbmV4cG9ydCBjbGFzcyBCcm93c2VyVmlld0luc3BlY3RvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VsZWN0RWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFbGVtZW50RGF0YT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0RWxlbWVudDogRXZlbnQ8SUVsZW1lbnREYXRhPiA9IHRoaXMuX29uRGlkU2VsZWN0RWxlbWVudC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW1vdmVFbGVtZW50Q29tbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQgPSB0aGlzLl9vbkRpZFJlbW92ZUVsZW1lbnRDb21tZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRWxlbWVudFNlbGVjdGlvblN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uU3RhdGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVsZW1lbnRTZWxlY3Rpb25TdGF0ZTogRXZlbnQ8SUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uU3RhdGU+ID0gdGhpcy5fb25EaWRDaGFuZ2VFbGVtZW50U2VsZWN0aW9uU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfZWxlbWVudFNlbGVjdGlvbkFjdGl2ZSA9IGZhbHNlO1xuXHRnZXQgaXNFbGVtZW50U2VsZWN0aW9uQWN0aXZlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fZWxlbWVudFNlbGVjdGlvbkFjdGl2ZTsgfVxuXHRnZXQgZWxlbWVudFNlbGVjdGlvblN0YXRlKCk6IElCcm93c2VyRWxlbWVudFNlbGVjdGlvblN0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YWN0aXZlOiB0aGlzLl9lbGVtZW50U2VsZWN0aW9uQWN0aXZlLFxuXHRcdFx0b3B0aW9uczogdGhpcy5fYWN0aXZlU2VsZWN0aW9uLnZhbHVlPy5vcHRpb25zID8/IHt9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVNlbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJQWN0aXZlU2VsZWN0aW9uPigpKTtcblx0cHJpdmF0ZSBfaW5zcGVjdGlvbk9wZXJhdGlvbjogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwcml2YXRlIF90aGVtZTogSUJyb3dzZXJWaWV3VGhlbWUgPSB7fTtcblxuXHQvLyBBcmVhIHNlbGVjdGlvbiBcdTIwMTQgZHJhZy10by1zZWxlY3QgYSByZWN0YW5nbGUgb24gdGhlIHRvcCBmcmFtZS5cblx0Ly8gYG9uRGlkUGlja0FyZWFgIGZpcmVzIGV4YWN0bHkgb25jZSBwZXIgc2Vzc2lvbiwgdGVybWluYXRpbmcgaXQuXG5cdC8vIFRoZSByZWN0YW5nbGUgaXMgdW5kZWZpbmVkIHdoZW4gdGhlIHBpY2tlciBpcyBjYW5jZWxsZWQgKEVTQywgemVyby1hcmVhIGRyYWcsXG5cdC8vIGV4dGVybmFsIHRvZ2dsZSBvZmYsIG5hdmlnYXRpb24sIG9yIHN1cGVyc2Vzc2lvbiBieSBlbGVtZW50IHNlbGVjdGlvbikuXG5cdC8vIENvbnN1bWVycyBzaG91bGQgbGlzdGVuIHRvIHRoaXMgc2luZ2xlIGV2ZW50IGluc3RlYWQgb2YgdHJ5aW5nIHRvIHJlY29uY2lsZVxuXHQvLyByZWN0IHZzLiBhY3RpdmF0aW9uIGV2ZW50cyBhY3Jvc3MgdGhlIElQQyBib3VuZGFyeSBcdTIwMTQgdGhvc2UgdHdvIGV2ZW50cyB0cmF2ZWxcblx0Ly8gdGhyb3VnaCBzZXBhcmF0ZSBjaGFubmVscyBhbmQgY2FuIGJlIGRlbGl2ZXJlZCBvdXQgb2Ygb3JkZXIuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUGlja0FyZWEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQnJvd3NlclZpZXdSZWN0IHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRQaWNrQXJlYTogRXZlbnQ8SUJyb3dzZXJWaWV3UmVjdCB8IHVuZGVmaW5lZD4gPSB0aGlzLl9vbkRpZFBpY2tBcmVhLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQXJlYVNlbGVjdGlvbkFjdGl2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFyZWFTZWxlY3Rpb25BY3RpdmU6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25EaWRDaGFuZ2VBcmVhU2VsZWN0aW9uQWN0aXZlLmV2ZW50O1xuXG5cdHByaXZhdGUgX2FyZWFTZWxlY3Rpb25BY3RpdmUgPSBmYWxzZTtcblx0Z2V0IGlzQXJlYVNlbGVjdGlvbkFjdGl2ZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2FyZWFTZWxlY3Rpb25BY3RpdmU7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVBcmVhU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElBY3RpdmVBcmVhU2VsZWN0aW9uPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBGcmFtZUluc3BlY3RvclJlZ2lzdHJ5KCkpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlcjogQnJvd3NlclZpZXcpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgd2ViQ29udGVudHMgPSB0aGlzLmJyb3dzZXIud2ViQ29udGVudHM7XG5cblx0XHQvLyBXaXJlIHVwIGluc3BlY3RvciBhZG9wdGlvbiBmcm9tIHRoZSByZWdpc3RyeVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZ2lzdHJ5Lm9uRGlkQWRvcHQoaW5zcGVjdG9yID0+IHRoaXMuX29uSW5zcGVjdG9yQWRvcHRlZChpbnNwZWN0b3IpKSk7XG5cblx0XHQvLyBOYXZpZ2F0aW9uIGRlc3Ryb3lzIHByZWxvYWQgb3ZlcmxheXMgYW5kIENEUCBzdGF0ZVxuXHRcdGNvbnN0IG9uTmF2aWdhdGVkID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fYWN0aXZlU2VsZWN0aW9uLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVBcmVhU2VsZWN0aW9uLmNsZWFyKCk7XG5cdFx0fTtcblx0XHR3ZWJDb250ZW50cy5vbignZGlkLW5hdmlnYXRlJywgb25OYXZpZ2F0ZWQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gd2ViQ29udGVudHMucmVtb3ZlTGlzdGVuZXIoJ2RpZC1uYXZpZ2F0ZScsIG9uTmF2aWdhdGVkKSB9KTtcblxuXHRcdC8vIFByZWxvYWQgcmVhZHkgXHUyMDE0IHRoZSBrZXkgY29ycmVsYXRpb24gcG9pbnQgYmV0d2VlbiBXZWJGcmFtZU1haW4gYW5kIENEUCB0YXJnZXRcblx0XHRjb25zdCBvbklwY01lc3NhZ2UgPSAoX2V2ZW50OiBFbGVjdHJvbi5FdmVudCwgY2hhbm5lbDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdGNvbnN0IHNlbmRlckZyYW1lID0gKF9ldmVudCBhcyB7IHNlbmRlckZyYW1lPzogRWxlY3Ryb24uV2ViRnJhbWVNYWluIH0pLnNlbmRlckZyYW1lO1xuXHRcdFx0aWYgKGNoYW5uZWwgPT09ICd2c2NvZGU6YnJvd3NlclZpZXc6cHJlbG9hZFJlYWR5Jykge1xuXHRcdFx0XHRpZiAoIXNlbmRlckZyYW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGZyYW1lVG9rZW4gPSBhcmdzWzBdIGFzIHN0cmluZztcblx0XHRcdFx0aWYgKCFmcmFtZVRva2VuKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQXBwbHkgdGhlbWUgaW1tZWRpYXRlbHkgcmVnYXJkbGVzcyBvZiBpbnNwZWN0b3Igc3RhdGVcblx0XHRcdFx0c2VuZGVyRnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpzZXRUaGVtZScsIHRoaXMuX3RoZW1lKTtcblx0XHRcdFx0c2VuZGVyRnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpzZXRMb2NhbGl6ZWRTdHJpbmdzJywgbG9jYWxpemVkU3RyaW5ncyk7XG5cblx0XHRcdFx0dGhpcy5fcmVnaXN0cnkubm90aWZ5RnJhbWVSZWFkeShzZW5kZXJGcmFtZSwgZnJhbWVUb2tlbik7XG5cblx0XHRcdFx0Ly8gSWYgYXJlYSBzZWxlY3Rpb24gd2FzIGFjdGl2YXRlZCBiZWZvcmUgdGhlIG1haW4tZnJhbWUgcHJlbG9hZFxuXHRcdFx0XHQvLyBmaW5pc2hlZCB3aXJpbmcgdXAgaXRzIElQQyBsaXN0ZW5lcnMgKGUuZy4gcmlnaHQgYWZ0ZXIgYVxuXHRcdFx0XHQvLyBuYXZpZ2F0aW9uKSwgdGhlIG9yaWdpbmFsIGBzdGFydEFyZWFQaWNrZXJgIHBvc3RNZXNzYWdlIHdhc1xuXHRcdFx0XHQvLyBkcm9wcGVkLiBSZXBsYXkgaXQgbm93IHNvIHRoZSBwaWNrZXIgYWN0dWFsbHkgYXBwZWFycyBpbnN0ZWFkXG5cdFx0XHRcdC8vIG9mIGxlYXZpbmcgdGhlIG1vZGVsIHJlcG9ydGluZyBhY3RpdmUgd2l0aCBubyB2aXNpYmxlIG92ZXJsYXkuXG5cdFx0XHRcdGlmIChzZW5kZXJGcmFtZSA9PT0gd2ViQ29udGVudHMubWFpbkZyYW1lICYmIHRoaXMuX2FjdGl2ZUFyZWFTZWxlY3Rpb24udmFsdWUpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0c2VuZGVyRnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpzdGFydEFyZWFQaWNrZXInLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0Ly8gRnJhbWUgbWF5IGJlIGdvbmUgXHUyMDE0IGlnbm9yZS5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoY2hhbm5lbCA9PT0gJ3ZzY29kZTpicm93c2VyVmlldzphcmVhUGlja2VkJykge1xuXHRcdFx0XHQvLyBBcmVhIHNlbGVjdGlvbiBpcyBzY29wZWQgdG8gdGhlIHRvcCBmcmFtZSBcdTIwMTQgdGhlIHVzZXItZHJhd25cblx0XHRcdFx0Ly8gcmVjdGFuZ2xlIGlzIGluIG1haW4tZnJhbWUgdmlld3BvcnQgY29vcmRpbmF0ZXMuXG5cdFx0XHRcdGlmIChzZW5kZXJGcmFtZSAhPT0gd2ViQ29udGVudHMubWFpbkZyYW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlY3QgPSBhcmdzWzBdIGFzIElCcm93c2VyVmlld1JlY3QgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHZhbGlkUmVjdCA9IHJlY3QgJiYgcmVjdC53aWR0aCA+IDAgJiYgcmVjdC5oZWlnaHQgPiAwID8gcmVjdCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fZmluaXNoQXJlYVBpY2sodmFsaWRSZWN0KTtcblx0XHRcdH0gZWxzZSBpZiAoY2hhbm5lbCA9PT0gJ3ZzY29kZTpicm93c2VyVmlldzphcmVhUGlja1N0b3BwZWQnKSB7XG5cdFx0XHRcdGlmIChzZW5kZXJGcmFtZSAhPT0gd2ViQ29udGVudHMubWFpbkZyYW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaEFyZWFQaWNrKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR3ZWJDb250ZW50cy5vbignaXBjLW1lc3NhZ2UnLCBvbklwY01lc3NhZ2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gd2ViQ29udGVudHMucmVtb3ZlTGlzdGVuZXIoJ2lwYy1tZXNzYWdlJywgb25JcGNNZXNzYWdlKSB9KTtcblxuXHRcdC8vIENyb3NzLW9yaWdpbiAoT09QSUYpIHRhcmdldHMgZ2V0IHRoZWlyIG93biBzZXNzaW9uIFx1MjAxNCB3YXRjaCBpdCBmb3IgY29udGV4dHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmJyb3dzZXIuZGVidWdnZXIub25UYXJnZXREaXNjb3ZlcmVkKGFzeW5jICh7IHRhcmdldElkLCB0eXBlIH0pID0+IHtcblx0XHRcdGlmICh0eXBlID09PSAnaWZyYW1lJykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLmJyb3dzZXIuZGVidWdnZXIuYXR0YWNoVG9UYXJnZXQodGFyZ2V0SWQpO1xuXHRcdFx0XHRcdHRoaXMuX3dhdGNoU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQXR0YWNoIHRoZSBtYWluIGRlYnVnZ2VyIHNlc3Npb24gYW5kIHdhdGNoIGl0IGZvciBjb250ZXh0c1xuXHRcdHRoaXMuYnJvd3Nlci5kZWJ1Z2dlci5hdHRhY2goKS50aGVuKGNvbm4gPT4gdGhpcy5fd2F0Y2hTZXNzaW9uKGNvbm4pKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhdGNoIGEgQ0RQIHNlc3Npb24gZm9yIGV4ZWN1dGlvbiBjb250ZXh0cy4gV2hlbiBhIGRlZmF1bHQgY29udGV4dCBhcHBlYXJzLFxuXHQgKiBwcm9iZXMgZm9yIHRoZSBwcmVsb2FkIHRva2VuIGFuZCBjb3JyZWxhdGVzIHdpdGggdGhlIHBlbmRpbmcgV2ViRnJhbWVNYWluLlxuXHQgKlxuXHQgKiBDYWxsZWQgZm9yIGV2ZXJ5IHNlc3Npb246IHRoZSBtYWluIHBhZ2Ugc2Vzc2lvbiAoc2VlcyBzYW1lLW9yaWdpbiBmcmFtZXMpXG5cdCAqIGFuZCBlYWNoIGNyb3NzLW9yaWdpbiB0YXJnZXQgc2Vzc2lvbiAoc2VlcyBvbmx5IGl0cyBvd24gZnJhbWUpLlxuXHQgKi9cblx0cHJpdmF0ZSBfd2F0Y2hTZXNzaW9uKHNlc3Npb246IElDRFBDb25uZWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Vzc2lvbi5vbkV2ZW50KGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5tZXRob2QgPT09ICdSdW50aW1lLmV4ZWN1dGlvbkNvbnRleHRDcmVhdGVkJykge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0gKGV2ZW50LnBhcmFtcyBhcyB7XG5cdFx0XHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRcdFx0dW5pcXVlSWQ6IHN0cmluZztcblx0XHRcdFx0XHRcdGF1eERhdGE/OiB7IGlzRGVmYXVsdD86IGJvb2xlYW47IGZyYW1lSWQ/OiBzdHJpbmcgfTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KS5jb250ZXh0O1xuXG5cdFx0XHRcdGlmICghY29udGV4dD8uYXV4RGF0YT8uaXNEZWZhdWx0IHx8ICFjb250ZXh0LmF1eERhdGEuZnJhbWVJZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGZyYW1lSWQgPSBjb250ZXh0LmF1eERhdGEuZnJhbWVJZDtcblx0XHRcdFx0Y29uc3QgdW5pcXVlQ29udGV4dElkID0gY29udGV4dC51bmlxdWVJZDtcblxuXHRcdFx0XHQvLyBQcm9iZSBmb3IgdGhlIHByZWxvYWQgdG9rZW4gaW4gdGhpcyBjb250ZXh0XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHNlc3Npb24uc2VuZENvbW1hbmQoJ1J1bnRpbWUuZXZhbHVhdGUnLCB7XG5cdFx0XHRcdFx0XHRleHByZXNzaW9uOiAnd2luZG93Ll9fdnNjb2RlX2hlbHBlcnM/LmdldEZyYW1lVG9rZW4/LigpJyxcblx0XHRcdFx0XHRcdHJldHVybkJ5VmFsdWU6IHRydWUsXG5cdFx0XHRcdFx0XHR1bmlxdWVDb250ZXh0SWQsXG5cdFx0XHRcdFx0fSkgYXMgeyByZXN1bHQ6IHsgdmFsdWU/OiBzdHJpbmcgfSB9O1xuXG5cdFx0XHRcdFx0Y29uc3QgdG9rZW4gPSByZXN1bHQudmFsdWU7XG5cdFx0XHRcdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdHJ5Lm5vdGlmeUNvbnRleHREaXNjb3ZlcmVkKHNlc3Npb24sIHVuaXF1ZUNvbnRleHRJZCwgZnJhbWVJZCwgdG9rZW4pO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBDb250ZXh0IG1heSBoYXZlIGJlZW4gZGVzdHJveWVkIGJ5IG5vdyBcdTIwMTQgaWdub3JlLlxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50Lm1ldGhvZCA9PT0gJ1BhZ2UuZnJhbWVEZXRhY2hlZCcpIHtcblx0XHRcdFx0Y29uc3QgZnJhbWVJZCA9IChldmVudC5wYXJhbXMgYXMgeyBmcmFtZUlkPzogc3RyaW5nIH0pPy5mcmFtZUlkO1xuXHRcdFx0XHRpZiAoZnJhbWVJZCkge1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdHJ5LmRpc3Bvc2VCeUZyYW1lSWQoZnJhbWVJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQubWV0aG9kID09PSAnUnVudGltZS5leGVjdXRpb25Db250ZXh0c0NsZWFyZWQnKSB7XG5cdFx0XHRcdC8vIE5hdmlnYXRpb24gY2xlYXJlZCBhbGwgY29udGV4dHMgXHUyMDE0IGRpc3Bvc2UgaW5zcGVjdG9ycyBvd25lZCBieSB0aGlzIHNlc3Npb25cblx0XHRcdFx0dGhpcy5fcmVnaXN0cnkuZGlzcG9zZUJ5U2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRFdmVudC5vbmNlKHNlc3Npb24ub25DbG9zZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0cnkuZGlzcG9zZUJ5U2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9KTtcblxuXHRcdC8vIEVuYWJsZSBSdW50aW1lICsgUGFnZSB0byBzdGFydCByZWNlaXZpbmcgY29udGV4dCBhbmQgZnJhbWUgZXZlbnRzXG5cdFx0c2Vzc2lvbi5zZW5kQ29tbWFuZCgnUnVudGltZS5lbmFibGUnKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdHNlc3Npb24uc2VuZENvbW1hbmQoJ1BhZ2UuZW5hYmxlJykuY2F0Y2goKCkgPT4geyB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgYnkgdGhlIHJlZ2lzdHJ5IHdoZW4gYSBmcmFtZSBpbnNwZWN0b3IgaXMgZnVsbHkgYWRvcHRlZC5cblx0ICogV2lyZXMgaXRzIGV2ZW50cyB0byB0aGlzIG9yY2hlc3RyYXRvci5cblx0ICovXG5cdHByaXZhdGUgX29uSW5zcGVjdG9yQWRvcHRlZChpbnNwZWN0b3I6IEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3IpOiB2b2lkIHtcblx0XHRpbnNwZWN0b3Iub25EaWRJbnNwZWN0RWxlbWVudChhc3luYyBub2RlRGF0YSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2FjdGl2ZVNlbGVjdGlvbi52YWx1ZT8ub3B0aW9ucz8uY29udGludW91cykge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVTZWxlY3Rpb24uY2xlYXIoKTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG9mZnNldCA9IGF3YWl0IHRoaXMuX2dldEZyYW1lT2Zmc2V0SW5QYWdlKGluc3BlY3Rvci5mcmFtZSk7XG5cdFx0XHRcdG5vZGVEYXRhID0gdGhpcy5fb2Zmc2V0RWxlbWVudERhdGEobm9kZURhdGEsIG9mZnNldCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gQmVzdCBlZmZvcnQuXG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdEVsZW1lbnQuZmlyZShub2RlRGF0YSk7XG5cdFx0fSk7XG5cdFx0aW5zcGVjdG9yLm9uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQoZWxlbWVudElkID0+IHRoaXMuX29uRGlkUmVtb3ZlRWxlbWVudENvbW1lbnQuZmlyZShlbGVtZW50SWQpKTtcblxuXHRcdC8vIFdoZW4gYSBmcmFtZSdzIHByZWxvYWQgc3RvcHMgcGlja2luZywgc3RvcCBhbGwgb3RoZXIgZnJhbWVzIHRvb1xuXHRcdGluc3BlY3Rvci5vbkRpZFN0b3BQaWNraW5nKCgpID0+IHtcblx0XHRcdHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi5jbGVhcigpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gSWYgZWxlbWVudCBzZWxlY3Rpb24gaXMgY3VycmVudGx5IGFjdGl2ZSwgc3RhcnQgaXQgb24gdGhlIG5ldyBmcmFtZVxuXHRcdGlmICh0aGlzLl9hY3RpdmVTZWxlY3Rpb24udmFsdWUpIHtcblx0XHRcdHZvaWQgdGhpcy5fcXVldWVJbnNwZWN0aW9uT3BlcmF0aW9uKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlU2VsZWN0aW9uID0gdGhpcy5fYWN0aXZlU2VsZWN0aW9uLnZhbHVlO1xuXHRcdFx0XHRpZiAoYWN0aXZlU2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0YXdhaXQgaW5zcGVjdG9yLnN0YXJ0SW5zcGVjdGlvbihhY3RpdmVTZWxlY3Rpb24ub3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0fVxuXG5cdFx0aW5zcGVjdG9yLnNldFRoZW1lKHRoaXMuX3RoZW1lKTtcblx0fVxuXG5cdHNldFRoZW1lKHRoZW1lOiBJQnJvd3NlclZpZXdUaGVtZSk6IHZvaWQge1xuXHRcdHRoaXMuX3RoZW1lID0gdGhlbWU7XG5cdFx0Ly8gQnJvYWRjYXN0IHRvIGFsbCBrbm93biBpbnNwZWN0b3JzXG5cdFx0Zm9yIChjb25zdCBpbnNwZWN0b3Igb2YgdGhpcy5fcmVnaXN0cnkuaW5zcGVjdG9ycykge1xuXHRcdFx0aW5zcGVjdG9yLnNldFRoZW1lKHRoZW1lKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVG9nZ2xlIGVsZW1lbnQgc2VsZWN0aW9uIG1vZGUgYWNyb3NzIGFsbCBmcmFtZXMuXG5cdCAqL1xuXHRhc3luYyB0b2dnbGVFbGVtZW50U2VsZWN0aW9uKGVuYWJsZWQ/OiBib29sZWFuLCBvcHRpb25zOiBJQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25PcHRpb25zID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuZXdFbmFibGVkID0gZW5hYmxlZCA/PyAhdGhpcy5fZWxlbWVudFNlbGVjdGlvbkFjdGl2ZTtcblx0XHRpZiAoIW5ld0VuYWJsZWQpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBFbGVtZW50IGFuZCBhcmVhIHNlbGVjdGlvbiBhcmUgbXV0dWFsbHkgZXhjbHVzaXZlIFx1MjAxNCBlbmFibGluZyBvbmVcblx0XHQvLyBjYW5jZWxzIHRoZSBvdGhlciBzbyBib3RoIHBpY2tlcnMgbmV2ZXIgb3ZlcmxheSB0aGUgcGFnZSBhdCBvbmNlLlxuXHRcdHRoaXMuX2FjdGl2ZUFyZWFTZWxlY3Rpb24uY2xlYXIoKTtcblxuXHRcdGNvbnN0IGFjdGl2ZVNlbGVjdGlvbiA9IHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi52YWx1ZTtcblx0XHRjb25zdCB1cGRhdGVkT3B0aW9ucyA9IGFjdGl2ZVNlbGVjdGlvbiA/IHsgLi4uYWN0aXZlU2VsZWN0aW9uLm9wdGlvbnMsIC4uLm9wdGlvbnMgfSA6IHsgbW9kZTogQnJvd3NlckVsZW1lbnRTZWxlY3Rpb25Nb2RlLlNlbGVjdCwgLi4ub3B0aW9ucyB9O1xuXG5cdFx0aWYgKGFjdGl2ZVNlbGVjdGlvbikge1xuXHRcdFx0YWN0aXZlU2VsZWN0aW9uLm9wdGlvbnMgPSB1cGRhdGVkT3B0aW9ucztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLl9zdGFydEluc3BlY3Rpb24oYWN0aXZlU2VsZWN0aW9uLCB1cGRhdGVkT3B0aW9ucykpIHtcblx0XHRcdFx0XHR0aGlzLl9lbGVtZW50U2VsZWN0aW9uQWN0aXZlID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVsZW1lbnRTZWxlY3Rpb25TdGF0ZS5maXJlKHsgYWN0aXZlOiB0cnVlLCBvcHRpb25zOiB1cGRhdGVkT3B0aW9ucyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVTZWxlY3Rpb24udmFsdWUgPT09IGFjdGl2ZVNlbGVjdGlvbiAmJiBhY3RpdmVTZWxlY3Rpb24ub3B0aW9ucyA9PT0gdXBkYXRlZE9wdGlvbnMpIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVTZWxlY3Rpb24uY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbjogSUFjdGl2ZVNlbGVjdGlvbiA9IHtcblx0XHRcdG9wdGlvbnM6IHVwZGF0ZWRPcHRpb25zLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlU2VsZWN0aW9uLnZhbHVlID09PSBzZWxlY3Rpb24pIHtcblx0XHRcdFx0XHR0aGlzLl9lbGVtZW50U2VsZWN0aW9uQWN0aXZlID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFbGVtZW50U2VsZWN0aW9uU3RhdGUuZmlyZSh7IGFjdGl2ZTogZmFsc2UsIG9wdGlvbnM6IHNlbGVjdGlvbi5vcHRpb25zIH0pO1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi5jbGVhckFuZExlYWsoKTtcblx0XHRcdFx0XHR2b2lkIHRoaXMuX3F1ZXVlSW5zcGVjdGlvbk9wZXJhdGlvbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4udGhpcy5fcmVnaXN0cnkuaW5zcGVjdG9yc10ubWFwKGkgPT4gaS5zdG9wSW5zcGVjdGlvbigpKSk7XG5cdFx0XHRcdFx0fSkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fYWN0aXZlU2VsZWN0aW9uLnZhbHVlID0gc2VsZWN0aW9uO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fc3RhcnRJbnNwZWN0aW9uKHNlbGVjdGlvbiwgdXBkYXRlZE9wdGlvbnMpKSB7XG5cdFx0XHRcdHRoaXMuX2VsZW1lbnRTZWxlY3Rpb25BY3RpdmUgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVsZW1lbnRTZWxlY3Rpb25TdGF0ZS5maXJlKHsgYWN0aXZlOiB0cnVlLCBvcHRpb25zOiB1cGRhdGVkT3B0aW9ucyB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdGlmICh0aGlzLl9hY3RpdmVTZWxlY3Rpb24udmFsdWUgPT09IHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24ub3B0aW9ucyA9PT0gdXBkYXRlZE9wdGlvbnMpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlU2VsZWN0aW9uLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnRJbnNwZWN0aW9uKHNlbGVjdGlvbjogSUFjdGl2ZVNlbGVjdGlvbiwgb3B0aW9uczogSUJyb3dzZXJFbGVtZW50U2VsZWN0aW9uT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGF3YWl0IHRoaXMuX3F1ZXVlSW5zcGVjdGlvbk9wZXJhdGlvbihhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fYWN0aXZlU2VsZWN0aW9uLnZhbHVlICE9PSBzZWxlY3Rpb24gfHwgc2VsZWN0aW9uLm9wdGlvbnMgIT09IG9wdGlvbnMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoWy4uLnRoaXMuX3JlZ2lzdHJ5Lmluc3BlY3RvcnNdLm1hcChpID0+IGkuc3RhcnRJbnNwZWN0aW9uKG9wdGlvbnMpKSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi52YWx1ZSA9PT0gc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5vcHRpb25zID09PSBvcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfcXVldWVJbnNwZWN0aW9uT3BlcmF0aW9uKG9wZXJhdGlvbjogKCkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2luc3BlY3Rpb25PcGVyYXRpb24udGhlbihvcGVyYXRpb24pO1xuXHRcdHRoaXMuX2luc3BlY3Rpb25PcGVyYXRpb24gPSByZXN1bHQuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0c2V0RWxlbWVudENvbW1lbnRzKHVwZGF0ZTogSUJyb3dzZXJFbGVtZW50Q29tbWVudHNVcGRhdGUpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGluc3BlY3RvciBvZiB0aGlzLl9yZWdpc3RyeS5pbnNwZWN0b3JzKSB7XG5cdFx0XHRpbnNwZWN0b3Iuc2V0RWxlbWVudENvbW1lbnRzKHVwZGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRvZ2dsZSBkcmFnLXRvLXNlbGVjdCBhcmVhIHBpY2tpbmcgb24gdGhlIHRvcCBmcmFtZSBvbmx5LlxuXHQgKiBUaGUgcGlja2VyIHJlcG9ydHMgdGhlIGxpdGVyYWwgdXNlci1kcmF3biByZWN0YW5nbGUgKG9yIGB1bmRlZmluZWRgIG9uIGNhbmNlbGxhdGlvbilcblx0ICogdmlhIHtAbGluayBvbkRpZFBpY2tBcmVhfTsgbm8gRE9NIGVsZW1lbnRzIGFyZSBpbnNwZWN0ZWQuXG5cdCAqL1xuXHRhc3luYyB0b2dnbGVBcmVhU2VsZWN0aW9uKGVuYWJsZWQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmV3RW5hYmxlZCA9IGVuYWJsZWQgPz8gIXRoaXMuX2FyZWFTZWxlY3Rpb25BY3RpdmU7XG5cdFx0aWYgKG5ld0VuYWJsZWQgPT09IHRoaXMuX2FyZWFTZWxlY3Rpb25BY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIW5ld0VuYWJsZWQpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUFyZWFTZWxlY3Rpb24uY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBFbGVtZW50IGFuZCBhcmVhIHNlbGVjdGlvbiBhcmUgbXV0dWFsbHkgZXhjbHVzaXZlIFx1MjAxNCBlbmFibGluZyBvbmVcblx0XHQvLyBjYW5jZWxzIHRoZSBvdGhlciBzbyBib3RoIHBpY2tlcnMgbmV2ZXIgb3ZlcmxheSB0aGUgcGFnZSBhdCBvbmNlLlxuXHRcdHRoaXMuX2FjdGl2ZVNlbGVjdGlvbi5jbGVhcigpO1xuXG5cdFx0Y29uc3QgbWFpbkZyYW1lID0gdGhpcy5icm93c2VyLndlYkNvbnRlbnRzLm1haW5GcmFtZTtcblx0XHRjb25zdCBzdGFydCA9ICgpID0+IHsgbWFpbkZyYW1lLnBvc3RNZXNzYWdlKCd2c2NvZGU6YnJvd3NlclZpZXc6c3RhcnRBcmVhUGlja2VyJywgdW5kZWZpbmVkKTsgfTtcblx0XHRjb25zdCBzdG9wID0gKCkgPT4geyB0cnkgeyBtYWluRnJhbWUucG9zdE1lc3NhZ2UoJ3ZzY29kZTpicm93c2VyVmlldzpzdG9wQXJlYVBpY2tlcicsIHVuZGVmaW5lZCk7IH0gY2F0Y2ggeyAvKiBmcmFtZSBtYXkgYmUgZ29uZSAqLyB9IH07XG5cblx0XHRjb25zdCBzZWxlY3Rpb246IElBY3RpdmVBcmVhU2VsZWN0aW9uID0ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHQvLyBFeHRlcm5hbCBjYW5jZWxsYXRpb24gKHRvZ2dsZUFyZWFTZWxlY3Rpb24oZmFsc2UpLCBuYXZpZ2F0aW9uLCBlbGVtZW50XG5cdFx0XHRcdC8vIHNlbGVjdGlvbiB0YWtlb3ZlcikuIFRoZSBJUEMtZHJpdmVuIHRlcm1pbmF0aW9uIHBhdGhzIHVzZSBjbGVhckFuZExlYWtcblx0XHRcdFx0Ly8gaW5zaWRlIGBfZmluaXNoQXJlYVBpY2tgLCBzbyByZWFjaGluZyBoZXJlIG1lYW5zIHRoZSBwaWNrZXIgaXMgc3RpbGxcblx0XHRcdFx0Ly8gcnVubmluZyBpbiB0aGUgcGFnZSBhbmQgd2UgbmVlZCB0byB0ZWxsIGl0IHRvIHN0b3AuXG5cdFx0XHRcdHN0b3AoKTtcblx0XHRcdFx0dGhpcy5fZmluaXNoQXJlYVBpY2sodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX2FjdGl2ZUFyZWFTZWxlY3Rpb24udmFsdWUgPSBzZWxlY3Rpb247XG5cblx0XHR0cnkge1xuXHRcdFx0c3RhcnQoKTtcblx0XHRcdGlmICh0aGlzLl9hY3RpdmVBcmVhU2VsZWN0aW9uLnZhbHVlID09PSBzZWxlY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXJlYVNlbGVjdGlvbkFjdGl2ZS5maXJlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fYWN0aXZlQXJlYVNlbGVjdGlvbi5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUZXJtaW5hdGUgdGhlIGN1cnJlbnQgYXJlYS1waWNrIHNlc3Npb24sIGZpcmluZyBgb25EaWRQaWNrQXJlYWAgZXhhY3RseSBvbmNlLlxuXHQgKiBOby1vcCBpZiBubyBzZXNzaW9uIGlzIGFjdGl2ZS4gVXNlcyBgY2xlYXJBbmRMZWFrYCB0byBhdm9pZCByZWN1cnNpbmcgaW50b1xuXHQgKiB0aGUgSUFjdGl2ZVNlbGVjdGlvbi5kaXNwb3NlIHBhdGguXG5cdCAqL1xuXHRwcml2YXRlIF9maW5pc2hBcmVhUGljayhyZWN0OiBJQnJvd3NlclZpZXdSZWN0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hcmVhU2VsZWN0aW9uQWN0aXZlICYmICF0aGlzLl9hY3RpdmVBcmVhU2VsZWN0aW9uLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdhc0FjdGl2ZSA9IHRoaXMuX2FyZWFTZWxlY3Rpb25BY3RpdmU7XG5cdFx0dGhpcy5fYXJlYVNlbGVjdGlvbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2FjdGl2ZUFyZWFTZWxlY3Rpb24uY2xlYXJBbmRMZWFrKCk7XG5cdFx0dGhpcy5fb25EaWRQaWNrQXJlYS5maXJlKHJlY3QpO1xuXHRcdGlmICh3YXNBY3RpdmUpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXJlYVNlbGVjdGlvbkFjdGl2ZS5maXJlKGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSBhIGhhbmRsZSB0byBhbiBlbGVtZW50LiBSb3V0ZXMgdG8gdGhlIGNvcnJlY3QgZnJhbWUgaW5zcGVjdG9yLlxuXHQgKi9cblx0Z2V0RWxlbWVudEhhbmRsZShpZDogc3RyaW5nLCBmcmFtZTogRWxlY3Ryb24uV2ViRnJhbWVNYWluKTogSUVsZW1lbnRIYW5kbGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX3JlZ2lzdHJ5LmdldEJ5RnJhbWUoZnJhbWUpPy5nZXRFbGVtZW50SGFuZGxlKGlkKTtcblx0XHRpZiAoIWhhbmRsZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGNvbW1lbnRSZXF1ZXN0ZWQgPSBmYWxzZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YWRkVG9DaGF0OiAoKSA9PiBoYW5kbGUuYWRkVG9DaGF0KCksXG5cdFx0XHRhZGRDb21tZW50OiAoKSA9PiB7XG5cdFx0XHRcdGlmIChjb21tZW50UmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbW1lbnRSZXF1ZXN0ZWQgPSB0cnVlO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVBcmVhU2VsZWN0aW9uLmNsZWFyKCk7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlU2VsZWN0aW9uLmNsZWFyKCk7XG5cdFx0XHRcdFx0dm9pZCB0aGlzLl9xdWV1ZUluc3BlY3Rpb25PcGVyYXRpb24oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCF0aGlzLmJyb3dzZXIud2ViQ29udGVudHMuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmJyb3dzZXIud2ViQ29udGVudHMuZm9jdXMoKTtcblx0XHRcdFx0XHRcdFx0aGFuZGxlLmFkZENvbW1lbnQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSwgMCk7XG5cdFx0XHR9LFxuXHRcdFx0aGlnaGxpZ2h0OiAoKSA9PiBoYW5kbGUuaGlnaGxpZ2h0KCksXG5cdFx0XHRoaWRlSGlnaGxpZ2h0OiAoKSA9PiBoYW5kbGUuaGlkZUhpZ2hsaWdodCgpLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWNvbW1lbnRSZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGdldFZpc3VhbFZpZXdwb3J0U2NhbGUoZnJhbWU6IEVsZWN0cm9uLldlYkZyYW1lTWFpbiA9IHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5tYWluRnJhbWUpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWdpc3RyeS5nZXRCeUZyYW1lKGZyYW1lKT8uZ2V0VmlzdWFsVmlld3BvcnRTY2FsZSgpID8/IDE7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZSB0aGUgY3VtdWxhdGl2ZSBvZmZzZXQgb2YgYSBmcmFtZSByZWxhdGl2ZSB0byB0aGUgdG9wLWxldmVsIHBhZ2UuXG5cdCAqIFdhbGtzIHVwIHRoZSBmcmFtZSBoaWVyYXJjaHkgdXNpbmcgdGhlIHBhcmVudCdzIENEUCBzZXNzaW9uIHRvIHF1ZXJ5IHRoZVxuXHQgKiBpZnJhbWUgZWxlbWVudCdzIGJveCBtb2RlbCB2aWEgYERPTS5nZXRGcmFtZU93bmVyYCArIGBET00uZ2V0Qm94TW9kZWxgLlxuXHQgKiBXb3JrcyBmb3IgYm90aCBzYW1lLW9yaWdpbiBhbmQgY3Jvc3Mtb3JpZ2luIGZyYW1lcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dldEZyYW1lT2Zmc2V0SW5QYWdlKGZyYW1lOiBFbGVjdHJvbi5XZWJGcmFtZU1haW4pOiBQcm9taXNlPHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4ge1xuXHRcdGNvbnN0IG1haW5GcmFtZSA9IHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5tYWluRnJhbWU7XG5cdFx0bGV0IHggPSAwO1xuXHRcdGxldCB5ID0gMDtcblx0XHRsZXQgY3VycmVudCA9IGZyYW1lO1xuXG5cdFx0d2hpbGUgKGN1cnJlbnQgIT09IG1haW5GcmFtZSkge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gY3VycmVudC5wYXJlbnQ7XG5cdFx0XHRpZiAoIXBhcmVudCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hpbGRJbnNwZWN0b3IgPSB0aGlzLl9yZWdpc3RyeS5nZXRCeUZyYW1lKGN1cnJlbnQpO1xuXHRcdFx0Y29uc3QgcGFyZW50SW5zcGVjdG9yID0gdGhpcy5fcmVnaXN0cnkuZ2V0QnlGcmFtZShwYXJlbnQpO1xuXHRcdFx0aWYgKCFjaGlsZEluc3BlY3RvciB8fCAhcGFyZW50SW5zcGVjdG9yKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjaGlsZEZyYW1lSWQgPSBjaGlsZEluc3BlY3Rvci5mcmFtZUlkO1xuXG5cdFx0XHRcdC8vIEFzayB0aGUgcGFyZW50IHNlc3Npb24gZm9yIHRoZSBpZnJhbWUgZWxlbWVudCB0aGF0IG93bnMgdGhpcyBmcmFtZVxuXHRcdFx0XHRjb25zdCBmcmFtZU93bmVyID0gYXdhaXQgcGFyZW50SW5zcGVjdG9yLmNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ0RPTS5nZXRGcmFtZU93bmVyJywge1xuXHRcdFx0XHRcdGZyYW1lSWQ6IGNoaWxkRnJhbWVJZCxcblx0XHRcdFx0fSkgYXMgeyBiYWNrZW5kTm9kZUlkOiBudW1iZXIgfTtcblxuXHRcdFx0XHQvLyBHZXQgdGhlIGlmcmFtZSBlbGVtZW50J3MgYm94IG1vZGVsIGluIHRoZSBwYXJlbnQncyBjb29yZGluYXRlIHNwYWNlXG5cdFx0XHRcdGNvbnN0IGJveE1vZGVsID0gYXdhaXQgcGFyZW50SW5zcGVjdG9yLmNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ0RPTS5nZXRCb3hNb2RlbCcsIHtcblx0XHRcdFx0XHRiYWNrZW5kTm9kZUlkOiBmcmFtZU93bmVyLmJhY2tlbmROb2RlSWQsXG5cdFx0XHRcdH0pIGFzIHsgbW9kZWw6IHsgY29udGVudDogbnVtYmVyW10gfSB9O1xuXG5cdFx0XHRcdC8vIGNvbnRlbnQgcXVhZDogW3gxLHkxLCB4Mix5MiwgeDMseTMsIHg0LHk0XSBcdTIwMTQgdG9wLWxlZnQgaXMgZmlyc3QgcGFpclxuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYm94TW9kZWwubW9kZWwuY29udGVudDtcblx0XHRcdFx0eCArPSBjb250ZW50WzBdO1xuXHRcdFx0XHR5ICs9IGNvbnRlbnRbMV07XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGN1cnJlbnQgPSBwYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgeCwgeSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIE9mZnNldCBlbGVtZW50IGRhdGEgYm91bmRzIGJ5IGEgZnJhbWUgb2Zmc2V0LlxuXHQgKi9cblx0cHJpdmF0ZSBfb2Zmc2V0RWxlbWVudERhdGEoZGF0YTogSUVsZW1lbnREYXRhLCBvZmZzZXQ6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSk6IElFbGVtZW50RGF0YSB7XG5cdFx0aWYgKG9mZnNldC54ID09PSAwICYmIG9mZnNldC55ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZGF0YTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmRhdGEsXG5cdFx0XHRib3VuZHM6IHtcblx0XHRcdFx0eDogZGF0YS5ib3VuZHMueCArIG9mZnNldC54LFxuXHRcdFx0XHR5OiBkYXRhLmJvdW5kcy55ICsgb2Zmc2V0LnksXG5cdFx0XHRcdHdpZHRoOiBkYXRhLmJvdW5kcy53aWR0aCxcblx0XHRcdFx0aGVpZ2h0OiBkYXRhLmJvdW5kcy5oZWlnaHQsXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5cbmludGVyZmFjZSBJUGVuZGluZ0NvbnRleHQge1xuXHRyZWFkb25seSBzZXNzaW9uOiBJQ0RQQ29ubmVjdGlvbjtcblx0cmVhZG9ubHkgdW5pcXVlQ29udGV4dElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZyYW1lSWQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBUcmFja3MgdGhlIHR3by1zaWRlZCBjb3JyZWxhdGlvbiBiZXR3ZWVuIHByZWxvYWQgdG9rZW5zIChmcm9tIFdlYkZyYW1lTWFpbiBJUEMpXG4gKiBhbmQgQ0RQIGV4ZWN1dGlvbiBjb250ZXh0cywgYW5kIGluZGV4ZXMgYWRvcHRlZCBpbnNwZWN0b3JzIGZvciBPKDEpIGxvb2t1cCBieVxuICogZnJhbWUsIGZyYW1lSWQsIG9yIG93bmluZyBzZXNzaW9uLlxuICovXG5jbGFzcyBGcmFtZUluc3BlY3RvclJlZ2lzdHJ5IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZG9wdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3I+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFkb3B0OiBFdmVudDxCcm93c2VyVmlld0ZyYW1lSW5zcGVjdG9yPiA9IHRoaXMuX29uRGlkQWRvcHQuZXZlbnQ7XG5cblx0LyoqIFBlbmRpbmcgaGFsdmVzIHdhaXRpbmcgZm9yIHRoZWlyIGNvdW50ZXJwYXJ0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nRnJhbWVzID0gbmV3IE1hcDxzdHJpbmcsIEVsZWN0cm9uLldlYkZyYW1lTWFpbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Nlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIElQZW5kaW5nQ29udGV4dD4oKTtcblxuXHQvKiogQWRvcHRlZCBpbnNwZWN0b3JzIGluZGV4ZWQgbXVsdGlwbGUgd2F5cy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWxsID0gbmV3IFNldDxCcm93c2VyVmlld0ZyYW1lSW5zcGVjdG9yPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ieUZyYW1lID0gbmV3IFdlYWtNYXA8RWxlY3Ryb24uV2ViRnJhbWVNYWluLCBCcm93c2VyVmlld0ZyYW1lSW5zcGVjdG9yPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ieUZyYW1lSWQgPSBuZXcgTWFwPHN0cmluZywgQnJvd3NlclZpZXdGcmFtZUluc3BlY3Rvcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYnlTZXNzaW9uID0gbmV3IE1hcDxJQ0RQQ29ubmVjdGlvbiwgU2V0PEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3I+PigpO1xuXG5cdGdldCBpbnNwZWN0b3JzKCk6IEl0ZXJhYmxlPEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3I+IHsgcmV0dXJuIHRoaXMuX2FsbDsgfVxuXG5cdGdldEJ5RnJhbWUoZnJhbWU6IEVsZWN0cm9uLldlYkZyYW1lTWFpbik6IEJyb3dzZXJWaWV3RnJhbWVJbnNwZWN0b3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ieUZyYW1lLmdldChmcmFtZSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gYSBwcmVsb2FkIHNjcmlwdCBzaWduYWxzIHJlYWRpbmVzcyB3aXRoIGEgdG9rZW4uXG5cdCAqIElmIGEgbWF0Y2hpbmcgQ0RQIGNvbnRleHQgd2FzIGFscmVhZHkgZGlzY292ZXJlZCwgYWRvcHRzIGltbWVkaWF0ZWx5LlxuXHQgKi9cblx0bm90aWZ5RnJhbWVSZWFkeShmcmFtZTogRWxlY3Ryb24uV2ViRnJhbWVNYWluLCB0b2tlbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdTZXNzaW9ucy5nZXQodG9rZW4pO1xuXHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2Vzc2lvbnMuZGVsZXRlKHRva2VuKTtcblx0XHRcdHRoaXMuX2Fkb3B0KHBlbmRpbmcuc2Vzc2lvbiwgcGVuZGluZy51bmlxdWVDb250ZXh0SWQsIHBlbmRpbmcuZnJhbWVJZCwgZnJhbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nRnJhbWVzLnNldCh0b2tlbiwgZnJhbWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiBhIENEUCBleGVjdXRpb24gY29udGV4dCBpcyBkaXNjb3ZlcmVkIGFuZCBpdHMgcHJlbG9hZCB0b2tlbiBwcm9iZWQuXG5cdCAqIElmIGEgbWF0Y2hpbmcgV2ViRnJhbWVNYWluIHdhcyBhbHJlYWR5IHJlZ2lzdGVyZWQsIGFkb3B0cyBpbW1lZGlhdGVseS5cblx0ICovXG5cdG5vdGlmeUNvbnRleHREaXNjb3ZlcmVkKHNlc3Npb246IElDRFBDb25uZWN0aW9uLCB1bmlxdWVDb250ZXh0SWQ6IHN0cmluZywgZnJhbWVJZDogc3RyaW5nLCB0b2tlbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZnJhbWUgPSB0aGlzLl9wZW5kaW5nRnJhbWVzLmdldCh0b2tlbik7XG5cdFx0aWYgKGZyYW1lKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nRnJhbWVzLmRlbGV0ZSh0b2tlbik7XG5cdFx0XHR0aGlzLl9hZG9wdChzZXNzaW9uLCB1bmlxdWVDb250ZXh0SWQsIGZyYW1lSWQsIGZyYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Nlc3Npb25zLnNldCh0b2tlbiwgeyBzZXNzaW9uLCB1bmlxdWVDb250ZXh0SWQsIGZyYW1lSWQgfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIERpc3Bvc2UgdGhlIGluc3BlY3RvciBvd25pbmcgdGhlIGdpdmVuIENEUCBmcmFtZUlkLCBpZiBhbnkuIEFsc28gY2xlYW5zIHBlbmRpbmcgZW50cmllcy4gKi9cblx0ZGlzcG9zZUJ5RnJhbWVJZChmcmFtZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9ieUZyYW1lSWQuZ2V0KGZyYW1lSWQpPy5kaXNwb3NlKCk7XG5cdFx0Ly8gUmVtb3ZlIHBlbmRpbmcgc2Vzc2lvbiBlbnRyaWVzIHdob3NlIGZyYW1lSWQgbWF0Y2hlcyB0aGUgZGV0YWNoZWQgZnJhbWVcblx0XHRmb3IgKGNvbnN0IFt0b2tlbiwgcGVuZGluZ10gb2YgdGhpcy5fcGVuZGluZ1Nlc3Npb25zKSB7XG5cdFx0XHRpZiAocGVuZGluZy5mcmFtZUlkID09PSBmcmFtZUlkKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9ucy5kZWxldGUodG9rZW4pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBSZW1vdmUgYW55IHBlbmRpbmcgZnJhbWUgZW50cmllcyB3aG9zZSBmcmFtZSBpcyBub3cgZGV0YWNoZWQvZGVzdHJveWVkXG5cdFx0Zm9yIChjb25zdCBbdG9rZW4sIGZyYW1lXSBvZiB0aGlzLl9wZW5kaW5nRnJhbWVzKSB7XG5cdFx0XHRpZiAoZnJhbWUuZGV0YWNoZWQgfHwgZnJhbWUuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nRnJhbWVzLmRlbGV0ZSh0b2tlbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIERpc3Bvc2UgYWxsIGluc3BlY3RvcnMgd2hvc2UgY29ubmVjdGlvbiBpcyB0aGUgZ2l2ZW4gc2Vzc2lvbiBhbmQgY2xlYXIgcmVsYXRlZCBwZW5kaW5nIHN0YXRlLiAqL1xuXHRkaXNwb3NlQnlTZXNzaW9uKHNlc3Npb246IElDRFBDb25uZWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2V0ID0gdGhpcy5fYnlTZXNzaW9uLmdldChzZXNzaW9uKTtcblx0XHRpZiAoc2V0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGluc3BlY3RvciBvZiBbLi4uc2V0XSkge1xuXHRcdFx0XHRpbnNwZWN0b3IuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFt0b2tlbiwgcGVuZGluZ10gb2YgdGhpcy5fcGVuZGluZ1Nlc3Npb25zKSB7XG5cdFx0XHRpZiAocGVuZGluZy5zZXNzaW9uID09PSBzZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9ucy5kZWxldGUodG9rZW4pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Fkb3B0KFxuXHRcdHNlc3Npb246IElDRFBDb25uZWN0aW9uLFxuXHRcdHVuaXF1ZUNvbnRleHRJZDogc3RyaW5nLFxuXHRcdGZyYW1lSWQ6IHN0cmluZyxcblx0XHRmcmFtZTogRWxlY3Ryb24uV2ViRnJhbWVNYWluLFxuXHQpOiB2b2lkIHtcblx0XHQvLyBHdWFyZDogZnJhbWUgbWF5IGhhdmUgYmVlbiBkZXN0cm95ZWQgYmV0d2VlbiBJUEMgYW5kIGNvbnRleHQgbWF0Y2hcblx0XHRpZiAoZnJhbWUuZGV0YWNoZWQgfHwgZnJhbWUuaXNEZXN0cm95ZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3BlY3RvciA9IG5ldyBCcm93c2VyVmlld0ZyYW1lSW5zcGVjdG9yKHNlc3Npb24sIGZyYW1lLCB1bmlxdWVDb250ZXh0SWQsIGZyYW1lSWQpO1xuXG5cdFx0dGhpcy5fYWxsLmFkZChpbnNwZWN0b3IpO1xuXHRcdHRoaXMuX2J5RnJhbWUuc2V0KGZyYW1lLCBpbnNwZWN0b3IpO1xuXHRcdHRoaXMuX2J5RnJhbWVJZC5zZXQoZnJhbWVJZCwgaW5zcGVjdG9yKTtcblxuXHRcdGxldCBzZXNzaW9uU2V0ID0gdGhpcy5fYnlTZXNzaW9uLmdldChzZXNzaW9uKTtcblx0XHRpZiAoIXNlc3Npb25TZXQpIHtcblx0XHRcdHNlc3Npb25TZXQgPSBuZXcgU2V0KCk7XG5cdFx0XHR0aGlzLl9ieVNlc3Npb24uc2V0KHNlc3Npb24sIHNlc3Npb25TZXQpO1xuXHRcdH1cblx0XHRzZXNzaW9uU2V0LmFkZChpbnNwZWN0b3IpO1xuXG5cdFx0aW5zcGVjdG9yLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYWxsLmRlbGV0ZShpbnNwZWN0b3IpO1xuXHRcdFx0dGhpcy5fYnlGcmFtZS5kZWxldGUoZnJhbWUpO1xuXHRcdFx0dGhpcy5fYnlGcmFtZUlkLmRlbGV0ZShmcmFtZUlkKTtcblx0XHRcdGNvbnN0IHMgPSB0aGlzLl9ieVNlc3Npb24uZ2V0KHNlc3Npb24pO1xuXHRcdFx0aWYgKHMpIHtcblx0XHRcdFx0cy5kZWxldGUoaW5zcGVjdG9yKTtcblx0XHRcdFx0aWYgKHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2J5U2Vzc2lvbi5kZWxldGUoc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX29uRGlkQWRvcHQuZmlyZShpbnNwZWN0b3IpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGluc3BlY3RvciBvZiBbLi4udGhpcy5fYWxsXSkge1xuXHRcdFx0aW5zcGVjdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0ZyYW1lcy5jbGVhcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9ucy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUF5Qix5QkFBeUI7QUFDM0QsU0FBUyxtQ0FBME47QUFHbk8sU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxnQkFBZ0I7QUFFekIsTUFBTSxtQkFBd0Q7QUFBQSxFQUM3RCxZQUFZLFNBQVMsMEJBQTBCLGFBQWE7QUFBQSxFQUM1RCx1QkFBdUIsU0FBUyxxQ0FBcUMsZUFBZTtBQUFBLEVBQ3BGLDBCQUEwQixTQUFTLHdDQUF3Qyw2QkFBNkI7QUFBQSxFQUN4RyxnQkFBZ0IsU0FBUyw4QkFBOEIscUJBQXFCO0FBQUEsRUFDNUUsd0JBQXdCLFNBQVMsc0NBQXNDLDBCQUEwQjtBQUFBLEVBQ2pHLHFCQUFxQixTQUFTLG1DQUFtQywyQkFBMkI7QUFBQSxFQUM1RixlQUFlLFNBQVMsNkJBQTZCLGdCQUFnQjtBQUFBLEVBQ3JFLHNCQUFzQixTQUFTLG9DQUFvQyx3QkFBd0I7QUFDNUY7QUFvQk8sSUFBVyw4QkFBWCxrQkFBV0EsaUNBQVg7QUFFTixFQUFBQSw2QkFBQSxZQUFTO0FBRVQsRUFBQUEsNkJBQUEsdUJBQW9CO0FBSkgsU0FBQUE7QUFBQSxHQUFBO0FBbUJYLE1BQU0sNkJBQTZCLFdBQVc7QUFBQSxFQTJDcEQsWUFBNkIsU0FBc0I7QUFDbEQsVUFBTTtBQURzQjtBQXpDN0IsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXNCLENBQUM7QUFDakYsU0FBUyxxQkFBMEMsS0FBSyxvQkFB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
