import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { CDPError, CDPErrorCode, CDPServerError, CDPMethodNotFoundError, CDPInvalidParamsError } from "./types.js";
class CDPBrowserProxy extends Disposable {
  constructor(browserTarget) {
    super();
    this.browserTarget = browserTarget;
    this.sessionId = `browser-session-${generateUuid()}`;
    // Browser session state
    this._isAttachedToBrowserTarget = false;
    this._autoAttach = false;
    this._discover = false;
    /**
     * All sessions known to this proxy, keyed by sessionId.
     * Includes sessions from explicit attach, proxy auto-attach,
     * and client auto-attach children.
     */
    this._sessions = this._register(new DisposableMap());
    this._targets = this._register(new DisposableMap());
    // Only auto-attach once per target.
    this._autoAttachments = /* @__PURE__ */ new WeakSet();
    // CDP method handlers map
    this._handlers = /* @__PURE__ */ new Map([
      // Browser.* methods (https://chromedevtools.github.io/devtools-protocol/tot/Browser/)
      ["Browser.addPrivacySandboxCoordinatorKeyConfig", () => ({})],
      ["Browser.addPrivacySandboxEnrollmentOverride", () => ({})],
      ["Browser.close", () => ({})],
      ["Browser.getVersion", () => this.browserTarget.getVersion()],
      ["Browser.resetPermissions", () => ({})],
      ["Browser.getWindowForTarget", (p, s) => this.handleBrowserGetWindowForTarget(p, s)],
      ["Browser.setDownloadBehavior", () => ({})],
      ["Browser.setWindowBounds", () => ({})],
      // Target.* methods (https://chromedevtools.github.io/devtools-protocol/tot/Target/)
      ["Target.activateTarget", (p) => this.handleTargetActivateTarget(p)],
      ["Target.attachToTarget", (p) => this.handleTargetAttachToTarget(p)],
      ["Target.closeTarget", (p) => this.handleTargetCloseTarget(p)],
      ["Target.createBrowserContext", () => this.handleTargetCreateBrowserContext()],
      ["Target.createTarget", (p) => this.handleTargetCreateTarget(p)],
      ["Target.detachFromTarget", (p) => this.handleTargetDetachFromTarget(p)],
      ["Target.disposeBrowserContext", (p) => this.handleTargetDisposeBrowserContext(p)],
      ["Target.getBrowserContexts", () => this.handleTargetGetBrowserContexts()],
      ["Target.getTargets", () => this.handleTargetGetTargets()],
      ["Target.setAutoAttach", (p, s) => this.handleTargetSetAutoAttach(p, s)],
      ["Target.setDiscoverTargets", (p) => this.handleTargetSetDiscoverTargets(p)],
      ["Target.attachToBrowserTarget", () => this.handleTargetAttachToBrowserTarget()],
      ["Target.getTargetInfo", (p) => this.handleTargetGetTargetInfo(p)]
    ]);
    // #region Public API
    // Events to external clients
    this._onEvent = this._register(new Emitter());
    this.onEvent = this._onEvent.event;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
  }
  get targetId() {
    return this.browserTarget.targetInfo.targetId;
  }
  registerTarget(target) {
    const targetInfo = target.targetInfo;
    if (this._targets.has(targetInfo.targetId)) {
      return;
    }
    this._targets.set(targetInfo.targetId, target);
    if (this._discover) {
      this.sendEvent("Target.targetCreated", {
        targetInfo: target.targetInfo
      });
    }
    if (this._autoAttach && !this._autoAttachments.has(target)) {
      this._autoAttachments.add(target);
      void target.attach();
    }
    target.onClose(() => {
      this._targets.deleteAndDispose(targetInfo.targetId);
      if (this._discover) {
        this.sendEvent("Target.targetDestroyed", { targetId: targetInfo.targetId });
      }
    });
    target.onTargetInfoChanged((info) => {
      if (this._discover) {
        this.sendEvent("Target.targetInfoChanged", { targetInfo: info });
      }
    });
    for (const [, session] of target.sessions) {
      this.registerSession(session, false);
    }
    target.onSessionCreated(({ session, waitingForDebugger }) => {
      this.registerSession(session, waitingForDebugger);
    });
  }
  notifySessionCreated(session, waitingForDebugger) {
    if (this._sessions.has(session.sessionId)) {
      return;
    }
    if (!session.parentSessionId) {
      return;
    }
    if (!this._sessions.has(session.parentSessionId)) {
      return;
    }
    const target = this._targets.get(session.targetId);
    if (!target) {
      return;
    }
    target.notifySessionCreated(session, waitingForDebugger);
  }
  registerSession(session, waitingForDebugger) {
    if (this._sessions.has(session.sessionId)) {
      return;
    }
    this._sessions.set(session.sessionId, session);
    const target = this._targets.get(session.targetId);
    if (!target) {
      throw new CDPServerError(`Unable to resolve target for session ${session.sessionId}`);
    }
    this.sendEvent("Target.attachedToTarget", {
      sessionId: session.sessionId,
      targetInfo: target.targetInfo,
      waitingForDebugger
    }, session.parentSessionId);
    session.onEvent((event) => {
      if (event.method.startsWith("Target.")) {
        return;
      }
      this.sendEvent(event.method, event.params, event.sessionId ?? session.sessionId);
    });
    session.onClose(() => {
      this._sessions.deleteAndDispose(session.sessionId);
      this.sendEvent("Target.detachedFromTarget", {
        sessionId: session.sessionId,
        targetId: session.targetId
      }, session.parentSessionId);
    });
  }
  /** Send a browser-level event to the client */
  sendEvent(method, params, sessionId) {
    sessionId ||= this._isAttachedToBrowserTarget ? this.sessionId : void 0;
    this._onMessage.fire({ method, params, sessionId });
    this._onEvent.fire({ method, params, sessionId });
  }
  /**
   * Send a CDP command and await the result.
   * Browser-level handlers (Browser.*, Target.*) are checked first.
   * Other commands are routed to the page session identified by sessionId.
   */
  async sendCommand(method, params = {}, sessionId) {
    try {
      if (!sessionId || sessionId === this.sessionId || method.startsWith("Browser.") || method.startsWith("Target.")) {
        const handler = this._handlers.get(method);
        if (!handler) {
          throw new CDPMethodNotFoundError(method);
        }
        return await handler(params, sessionId);
      }
      const connection = this._sessions.get(sessionId);
      if (!connection) {
        throw new CDPServerError(`Session not found: ${sessionId}`);
      }
      const result = await connection.sendCommand(method, params);
      return result ?? {};
    } catch (error) {
      if (error instanceof CDPError) {
        throw error;
      }
      throw new CDPServerError(error instanceof Error ? error.message : "Unknown error");
    }
  }
  /**
   * Accept a CDP request from a message-based transport (WebSocket, IPC, etc.), route it,
   * and deliver the response or error via {@link onMessage}.
   */
  async sendMessage({ id, method, params, sessionId }) {
    return this.sendCommand(method, params, sessionId).then((result) => {
      this._onMessage.fire({ id, result, sessionId });
    }).catch((error) => {
      this._onMessage.fire({
        id,
        error: {
          code: error instanceof CDPError ? error.code : CDPErrorCode.ServerError,
          message: error.message || "Unknown error"
        },
        sessionId
      });
    });
  }
  // #endregion
  // #region CDP Commands
  handleBrowserGetWindowForTarget({ targetId }, sessionId) {
    const resolvedTargetId = (sessionId && this._sessions.get(sessionId)?.targetId) ?? targetId;
    if (!resolvedTargetId) {
      throw new CDPServerError("Unable to resolve target");
    }
    const target = this._targets.get(resolvedTargetId);
    if (!target) {
      throw new CDPServerError("Unable to resolve target");
    }
    return this.browserTarget.getWindowForTarget(target);
  }
  handleTargetGetBrowserContexts() {
    return { browserContextIds: this.browserTarget.getBrowserContexts() };
  }
  async handleTargetCreateBrowserContext() {
    const browserContextId = await this.browserTarget.createBrowserContext();
    return { browserContextId };
  }
  async handleTargetDisposeBrowserContext({ browserContextId }) {
    await this.browserTarget.disposeBrowserContext(browserContextId);
    return {};
  }
  handleTargetAttachToBrowserTarget() {
    this.sendEvent("Target.attachedToTarget", {
      sessionId: this.sessionId,
      targetInfo: this.browserTarget.targetInfo,
      waitingForDebugger: false
    });
    this._isAttachedToBrowserTarget = true;
    return { sessionId: this.sessionId };
  }
  handleTargetActivateTarget({ targetId }) {
    const target = this._targets.get(targetId);
    if (!target) {
      throw new CDPServerError("Unable to resolve target");
    }
    return this.browserTarget.activateTarget(target);
  }
  async handleTargetSetAutoAttach(params, sessionId) {
    if (sessionId && sessionId !== this.sessionId) {
      const connection = this._sessions.get(sessionId);
      if (!connection) {
        throw new CDPServerError(`Session not found: ${sessionId}`);
      }
      return connection.sendCommand("Target.setAutoAttach", params);
    }
    if (!params.flatten) {
      throw new CDPInvalidParamsError("This implementation only supports auto-attach with flatten=true");
    }
    this._autoAttach = params.autoAttach ?? false;
    return {};
  }
  async handleTargetSetDiscoverTargets({ discover = false }) {
    if (discover !== this._discover) {
      this._discover = discover;
      if (this._discover) {
        for (const target of this._targets.values()) {
          this.sendEvent("Target.targetCreated", { targetInfo: target.targetInfo });
        }
      }
    }
    return {};
  }
  async handleTargetGetTargets() {
    return { targetInfos: Array.from(this._targets.values()).map((target) => target.targetInfo) };
  }
  async handleTargetGetTargetInfo({ targetId } = {}) {
    if (!targetId) {
      return { targetInfo: this.browserTarget.targetInfo };
    }
    const target = this._targets.get(targetId);
    if (!target) {
      throw new CDPServerError("Unable to resolve target");
    }
    return { targetInfo: target.targetInfo };
  }
  async handleTargetAttachToTarget({ targetId, flatten }) {
    if (!flatten) {
      throw new CDPInvalidParamsError("This implementation only supports attachToTarget with flatten=true");
    }
    const target = this._targets.get(targetId);
    if (!target) {
      throw new CDPServerError("Unable to resolve target");
    }
    const connection = await target.attach();
    return { sessionId: connection.sessionId };
  }
  async handleTargetDetachFromTarget({ sessionId }) {
    const connection = this._sessions.get(sessionId);
    if (!connection) {
      throw new CDPServerError(`Session not found: ${sessionId}`);
    }
    connection.dispose();
    return {};
  }
  async handleTargetCreateTarget({ url, browserContextId }) {
    const target = await this.browserTarget.createTarget(url || "about:blank", browserContextId);
    this.registerTarget(target);
    if (this._autoAttach && !this._autoAttachments.has(target)) {
      this._autoAttachments.add(target);
      await target.attach();
    }
    return { targetId: target.targetInfo.targetId };
  }
  async handleTargetCloseTarget({ targetId }) {
    try {
      const target = this._targets.get(targetId);
      if (!target) {
        throw new CDPServerError("Unable to resolve target");
      }
      await this.browserTarget.closeTarget(target);
      return { success: true };
    } catch {
      return { success: false };
    }
  }
  // #endregion
}
export {
  CDPBrowserProxy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXGNvbW1vblxcY2RwXFxwcm94eS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElDRFBUYXJnZXQsIENEUFJlcXVlc3QsIENEUFJlc3BvbnNlLCBDRFBFdmVudCwgQ0RQRXJyb3IsIENEUEVycm9yQ29kZSwgQ0RQU2VydmVyRXJyb3IsIENEUE1ldGhvZE5vdEZvdW5kRXJyb3IsIENEUEludmFsaWRQYXJhbXNFcnJvciwgSUNEUENvbm5lY3Rpb24sIElDRFBCcm93c2VyVGFyZ2V0IH0gZnJvbSAnLi90eXBlcy5qcyc7XG5cbi8qKlxuICogQ0RQIHByb3RvY29sIGhhbmRsZXIgZm9yIGJyb3dzZXItbGV2ZWwgY29ubmVjdGlvbnMuXG4gKiBNYW5hZ2VzIEJyb3dzZXIuKiBhbmQgVGFyZ2V0LiogZG9tYWlucywgcm91dGVzIHBhZ2UtbGV2ZWwgY29tbWFuZHNcbiAqIHRvIHRoZSBhcHByb3ByaWF0ZSBhdHRhY2hlZCBzZXNzaW9uIGJ5IHNlc3Npb25JZC5cbiAqL1xuZXhwb3J0IGNsYXNzIENEUEJyb3dzZXJQcm94eSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ0RQQ29ubmVjdGlvbiB7XG5cdHJlYWRvbmx5IHNlc3Npb25JZCA9IGBicm93c2VyLXNlc3Npb24tJHtnZW5lcmF0ZVV1aWQoKX1gO1xuXHRnZXQgdGFyZ2V0SWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlclRhcmdldC50YXJnZXRJbmZvLnRhcmdldElkO1xuXHR9XG5cblx0Ly8gQnJvd3NlciBzZXNzaW9uIHN0YXRlXG5cdHByaXZhdGUgX2lzQXR0YWNoZWRUb0Jyb3dzZXJUYXJnZXQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYXV0b0F0dGFjaCA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaXNjb3ZlciA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBBbGwgc2Vzc2lvbnMga25vd24gdG8gdGhpcyBwcm94eSwga2V5ZWQgYnkgc2Vzc2lvbklkLlxuXHQgKiBJbmNsdWRlcyBzZXNzaW9ucyBmcm9tIGV4cGxpY2l0IGF0dGFjaCwgcHJveHkgYXV0by1hdHRhY2gsXG5cdCAqIGFuZCBjbGllbnQgYXV0by1hdHRhY2ggY2hpbGRyZW4uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSUNEUENvbm5lY3Rpb24+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YXJnZXRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJQ0RQVGFyZ2V0PigpKTtcblxuXHQvLyBPbmx5IGF1dG8tYXR0YWNoIG9uY2UgcGVyIHRhcmdldC5cblx0cHJpdmF0ZSByZWFkb25seSBfYXV0b0F0dGFjaG1lbnRzID0gbmV3IFdlYWtTZXQ8SUNEUFRhcmdldD4oKTtcblxuXHQvLyBDRFAgbWV0aG9kIGhhbmRsZXJzIG1hcFxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGVycyA9IG5ldyBNYXA8c3RyaW5nLCAocGFyYW1zOiB1bmtub3duLCBzZXNzaW9uSWQ/OiBzdHJpbmcpID0+IFByb21pc2U8b2JqZWN0PiB8IG9iamVjdD4oW1xuXHRcdC8vIEJyb3dzZXIuKiBtZXRob2RzIChodHRwczovL2Nocm9tZWRldnRvb2xzLmdpdGh1Yi5pby9kZXZ0b29scy1wcm90b2NvbC90b3QvQnJvd3Nlci8pXG5cdFx0WydCcm93c2VyLmFkZFByaXZhY3lTYW5kYm94Q29vcmRpbmF0b3JLZXlDb25maWcnLCAoKSA9PiAoe30pXSxcblx0XHRbJ0Jyb3dzZXIuYWRkUHJpdmFjeVNhbmRib3hFbnJvbGxtZW50T3ZlcnJpZGUnLCAoKSA9PiAoe30pXSxcblx0XHRbJ0Jyb3dzZXIuY2xvc2UnLCAoKSA9PiAoe30pXSxcblx0XHRbJ0Jyb3dzZXIuZ2V0VmVyc2lvbicsICgpID0+IHRoaXMuYnJvd3NlclRhcmdldC5nZXRWZXJzaW9uKCldLFxuXHRcdFsnQnJvd3Nlci5yZXNldFBlcm1pc3Npb25zJywgKCkgPT4gKHt9KV0sXG5cdFx0WydCcm93c2VyLmdldFdpbmRvd0ZvclRhcmdldCcsIChwLCBzKSA9PiB0aGlzLmhhbmRsZUJyb3dzZXJHZXRXaW5kb3dGb3JUYXJnZXQocCBhcyB7IHRhcmdldElkPzogc3RyaW5nOyBzZXNzaW9uSWQ/OiBzdHJpbmcgfSwgcyldLFxuXHRcdFsnQnJvd3Nlci5zZXREb3dubG9hZEJlaGF2aW9yJywgKCkgPT4gKHt9KV0sXG5cdFx0WydCcm93c2VyLnNldFdpbmRvd0JvdW5kcycsICgpID0+ICh7fSldLFxuXHRcdC8vIFRhcmdldC4qIG1ldGhvZHMgKGh0dHBzOi8vY2hyb21lZGV2dG9vbHMuZ2l0aHViLmlvL2RldnRvb2xzLXByb3RvY29sL3RvdC9UYXJnZXQvKVxuXHRcdFsnVGFyZ2V0LmFjdGl2YXRlVGFyZ2V0JywgKHApID0+IHRoaXMuaGFuZGxlVGFyZ2V0QWN0aXZhdGVUYXJnZXQocCBhcyB7IHRhcmdldElkOiBzdHJpbmcgfSldLFxuXHRcdFsnVGFyZ2V0LmF0dGFjaFRvVGFyZ2V0JywgKHApID0+IHRoaXMuaGFuZGxlVGFyZ2V0QXR0YWNoVG9UYXJnZXQocCBhcyB7IHRhcmdldElkOiBzdHJpbmc7IGZsYXR0ZW4/OiBib29sZWFuIH0pXSxcblx0XHRbJ1RhcmdldC5jbG9zZVRhcmdldCcsIChwKSA9PiB0aGlzLmhhbmRsZVRhcmdldENsb3NlVGFyZ2V0KHAgYXMgeyB0YXJnZXRJZDogc3RyaW5nIH0pXSxcblx0XHRbJ1RhcmdldC5jcmVhdGVCcm93c2VyQ29udGV4dCcsICgpID0+IHRoaXMuaGFuZGxlVGFyZ2V0Q3JlYXRlQnJvd3NlckNvbnRleHQoKV0sXG5cdFx0WydUYXJnZXQuY3JlYXRlVGFyZ2V0JywgKHApID0+IHRoaXMuaGFuZGxlVGFyZ2V0Q3JlYXRlVGFyZ2V0KHAgYXMgeyB1cmw/OiBzdHJpbmc7IGJyb3dzZXJDb250ZXh0SWQ/OiBzdHJpbmcgfSldLFxuXHRcdFsnVGFyZ2V0LmRldGFjaEZyb21UYXJnZXQnLCAocCkgPT4gdGhpcy5oYW5kbGVUYXJnZXREZXRhY2hGcm9tVGFyZ2V0KHAgYXMgeyBzZXNzaW9uSWQ6IHN0cmluZyB9KV0sXG5cdFx0WydUYXJnZXQuZGlzcG9zZUJyb3dzZXJDb250ZXh0JywgKHApID0+IHRoaXMuaGFuZGxlVGFyZ2V0RGlzcG9zZUJyb3dzZXJDb250ZXh0KHAgYXMgeyBicm93c2VyQ29udGV4dElkOiBzdHJpbmcgfSldLFxuXHRcdFsnVGFyZ2V0LmdldEJyb3dzZXJDb250ZXh0cycsICgpID0+IHRoaXMuaGFuZGxlVGFyZ2V0R2V0QnJvd3NlckNvbnRleHRzKCldLFxuXHRcdFsnVGFyZ2V0LmdldFRhcmdldHMnLCAoKSA9PiB0aGlzLmhhbmRsZVRhcmdldEdldFRhcmdldHMoKV0sXG5cdFx0WydUYXJnZXQuc2V0QXV0b0F0dGFjaCcsIChwLCBzKSA9PiB0aGlzLmhhbmRsZVRhcmdldFNldEF1dG9BdHRhY2gocCBhcyB7IGF1dG9BdHRhY2g/OiBib29sZWFuOyBmbGF0dGVuPzogYm9vbGVhbiB9LCBzKV0sXG5cdFx0WydUYXJnZXQuc2V0RGlzY292ZXJUYXJnZXRzJywgKHApID0+IHRoaXMuaGFuZGxlVGFyZ2V0U2V0RGlzY292ZXJUYXJnZXRzKHAgYXMgeyBkaXNjb3Zlcj86IGJvb2xlYW4gfSldLFxuXHRcdFsnVGFyZ2V0LmF0dGFjaFRvQnJvd3NlclRhcmdldCcsICgpID0+IHRoaXMuaGFuZGxlVGFyZ2V0QXR0YWNoVG9Ccm93c2VyVGFyZ2V0KCldLFxuXHRcdFsnVGFyZ2V0LmdldFRhcmdldEluZm8nLCAocCkgPT4gdGhpcy5oYW5kbGVUYXJnZXRHZXRUYXJnZXRJbmZvKHAgYXMgeyB0YXJnZXRJZD86IHN0cmluZyB9IHwgdW5kZWZpbmVkKV0sXG5cdF0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYnJvd3NlclRhcmdldDogSUNEUEJyb3dzZXJUYXJnZXQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZWdpc3RlclRhcmdldCh0YXJnZXQ6IElDRFBUYXJnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRJbmZvID0gdGFyZ2V0LnRhcmdldEluZm87XG5cdFx0aWYgKHRoaXMuX3RhcmdldHMuaGFzKHRhcmdldEluZm8udGFyZ2V0SWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3RhcmdldHMuc2V0KHRhcmdldEluZm8udGFyZ2V0SWQsIHRhcmdldCk7XG5cblx0XHRpZiAodGhpcy5fZGlzY292ZXIpIHtcblx0XHRcdHRoaXMuc2VuZEV2ZW50KCdUYXJnZXQudGFyZ2V0Q3JlYXRlZCcsIHtcblx0XHRcdFx0dGFyZ2V0SW5mbzogdGFyZ2V0LnRhcmdldEluZm8sXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2F1dG9BdHRhY2ggJiYgIXRoaXMuX2F1dG9BdHRhY2htZW50cy5oYXModGFyZ2V0KSkge1xuXHRcdFx0dGhpcy5fYXV0b0F0dGFjaG1lbnRzLmFkZCh0YXJnZXQpO1xuXHRcdFx0dm9pZCB0YXJnZXQuYXR0YWNoKCk7XG5cdFx0fVxuXG5cdFx0dGFyZ2V0Lm9uQ2xvc2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdGFyZ2V0cy5kZWxldGVBbmREaXNwb3NlKHRhcmdldEluZm8udGFyZ2V0SWQpO1xuXHRcdFx0aWYgKHRoaXMuX2Rpc2NvdmVyKSB7XG5cdFx0XHRcdHRoaXMuc2VuZEV2ZW50KCdUYXJnZXQudGFyZ2V0RGVzdHJveWVkJywgeyB0YXJnZXRJZDogdGFyZ2V0SW5mby50YXJnZXRJZCB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRhcmdldC5vblRhcmdldEluZm9DaGFuZ2VkKGluZm8gPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2Rpc2NvdmVyKSB7XG5cdFx0XHRcdHRoaXMuc2VuZEV2ZW50KCdUYXJnZXQudGFyZ2V0SW5mb0NoYW5nZWQnLCB7IHRhcmdldEluZm86IGluZm8gfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRmb3IgKGNvbnN0IFssIHNlc3Npb25dIG9mIHRhcmdldC5zZXNzaW9ucykge1xuXHRcdFx0dGhpcy5yZWdpc3RlclNlc3Npb24oc2Vzc2lvbiwgZmFsc2UpO1xuXHRcdH1cblx0XHR0YXJnZXQub25TZXNzaW9uQ3JlYXRlZCgoeyBzZXNzaW9uLCB3YWl0aW5nRm9yRGVidWdnZXIgfSkgPT4ge1xuXHRcdFx0dGhpcy5yZWdpc3RlclNlc3Npb24oc2Vzc2lvbiwgd2FpdGluZ0ZvckRlYnVnZ2VyKTtcblx0XHR9KTtcblx0fVxuXG5cdG5vdGlmeVNlc3Npb25DcmVhdGVkKHNlc3Npb246IElDRFBDb25uZWN0aW9uLCB3YWl0aW5nRm9yRGVidWdnZXI6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbnMuaGFzKHNlc3Npb24uc2Vzc2lvbklkKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBXZSBhbHJlYWR5IGtub3cgYWJvdXQgaXQuXG5cdFx0fVxuXHRcdGlmICghc2Vzc2lvbi5wYXJlbnRTZXNzaW9uSWQpIHtcblx0XHRcdHJldHVybjsgLy8gQ3JlYXRlZCBnbG9iYWxseSAtLSB3ZSBkb24ndCBjYXJlIGFib3V0IGl0LlxuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25zLmhhcyhzZXNzaW9uLnBhcmVudFNlc3Npb25JZCkpIHtcblx0XHRcdHJldHVybjsgLy8gTm90IGZyb20gb25lIG9mIG91ciBzZXNzaW9ucyAtLSBpZ25vcmUgaXQuXG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3RhcmdldHMuZ2V0KHNlc3Npb24udGFyZ2V0SWQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47IC8vIFRhcmdldCBpc24ndCBrbm93biAtLSBpZ25vcmUgaXQuXG5cdFx0fVxuXHRcdHRhcmdldC5ub3RpZnlTZXNzaW9uQ3JlYXRlZChzZXNzaW9uLCB3YWl0aW5nRm9yRGVidWdnZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNlc3Npb24oc2Vzc2lvbjogSUNEUENvbm5lY3Rpb24sIHdhaXRpbmdGb3JEZWJ1Z2dlcjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zZXNzaW9ucy5oYXMoc2Vzc2lvbi5zZXNzaW9uSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25zLnNldChzZXNzaW9uLnNlc3Npb25JZCwgc2Vzc2lvbik7XG5cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl90YXJnZXRzLmdldChzZXNzaW9uLnRhcmdldElkKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhyb3cgbmV3IENEUFNlcnZlckVycm9yKGBVbmFibGUgdG8gcmVzb2x2ZSB0YXJnZXQgZm9yIHNlc3Npb24gJHtzZXNzaW9uLnNlc3Npb25JZH1gKTtcblx0XHR9XG5cblx0XHR0aGlzLnNlbmRFdmVudCgnVGFyZ2V0LmF0dGFjaGVkVG9UYXJnZXQnLCB7XG5cdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0dGFyZ2V0SW5mbzogdGFyZ2V0LnRhcmdldEluZm8sXG5cdFx0XHR3YWl0aW5nRm9yRGVidWdnZXJcblx0XHR9LCBzZXNzaW9uLnBhcmVudFNlc3Npb25JZCk7XG5cblx0XHQvLyBGb3J3YXJkIG5vbi1UYXJnZXQgZXZlbnRzIGZyb20gdGhlIHNlc3Npb24gdG8gdGhlIGV4dGVybmFsIGNsaWVudC5cblx0XHQvLyBUYXJnZXQgZG9tYWluIGV2ZW50cyBhcmUgc3VwcHJlc3NlZCBcdTIwMTQgdGhlIHByb3h5IGVtaXRzIGl0cyBvd25cblx0XHQvLyBsaWZlY3ljbGUgZXZlbnRzIChhdHRhY2hlZFRvVGFyZ2V0LCBkZXRhY2hlZEZyb21UYXJnZXQsIGV0Yy4pXG5cdFx0Ly8gdmlhIHJlZ2lzdGVyU2Vzc2lvbiAvIG9uQ2xvc2UgLyBzZW5kRXZlbnQuXG5cdFx0c2Vzc2lvbi5vbkV2ZW50KGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5tZXRob2Quc3RhcnRzV2l0aCgnVGFyZ2V0LicpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2VuZEV2ZW50KGV2ZW50Lm1ldGhvZCwgZXZlbnQucGFyYW1zLCBldmVudC5zZXNzaW9uSWQgPz8gc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdH0pO1xuXG5cdFx0c2Vzc2lvbi5vbkNsb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0XHR0aGlzLnNlbmRFdmVudCgnVGFyZ2V0LmRldGFjaGVkRnJvbVRhcmdldCcsIHtcblx0XHRcdFx0c2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdFx0dGFyZ2V0SWQ6IHNlc3Npb24udGFyZ2V0SWRcblx0XHRcdH0sIHNlc3Npb24ucGFyZW50U2Vzc2lvbklkKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBTZW5kIGEgYnJvd3Nlci1sZXZlbCBldmVudCB0byB0aGUgY2xpZW50ICovXG5cdHByaXZhdGUgc2VuZEV2ZW50KG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IHVua25vd24sIHNlc3Npb25JZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHNlc3Npb25JZCB8fD0gKHRoaXMuX2lzQXR0YWNoZWRUb0Jyb3dzZXJUYXJnZXQgPyB0aGlzLnNlc3Npb25JZCA6IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fb25NZXNzYWdlLmZpcmUoeyBtZXRob2QsIHBhcmFtcywgc2Vzc2lvbklkIH0pO1xuXHRcdHRoaXMuX29uRXZlbnQuZmlyZSh7IG1ldGhvZCwgcGFyYW1zLCBzZXNzaW9uSWQgfSk7XG5cdH1cblxuXHQvLyAjcmVnaW9uIFB1YmxpYyBBUElcblxuXHQvLyBFdmVudHMgdG8gZXh0ZXJuYWwgY2xpZW50c1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkV2ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q0RQRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkV2ZW50OiBFdmVudDxDRFBFdmVudD4gPSB0aGlzLl9vbkV2ZW50LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uQ2xvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25DbG9zZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25NZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q0RQUmVzcG9uc2UgfCBDRFBFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uTWVzc2FnZTogRXZlbnQ8Q0RQUmVzcG9uc2UgfCBDRFBFdmVudD4gPSB0aGlzLl9vbk1lc3NhZ2UuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIFNlbmQgYSBDRFAgY29tbWFuZCBhbmQgYXdhaXQgdGhlIHJlc3VsdC5cblx0ICogQnJvd3Nlci1sZXZlbCBoYW5kbGVycyAoQnJvd3Nlci4qLCBUYXJnZXQuKikgYXJlIGNoZWNrZWQgZmlyc3QuXG5cdCAqIE90aGVyIGNvbW1hbmRzIGFyZSByb3V0ZWQgdG8gdGhlIHBhZ2Ugc2Vzc2lvbiBpZGVudGlmaWVkIGJ5IHNlc3Npb25JZC5cblx0ICovXG5cdGFzeW5jIHNlbmRDb21tYW5kKG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IHVua25vd24gPSB7fSwgc2Vzc2lvbklkPzogc3RyaW5nKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEJyb3dzZXItbGV2ZWwgY29tbWFuZCBoYW5kbGluZ1xuXHRcdFx0aWYgKFxuXHRcdFx0XHQhc2Vzc2lvbklkIHx8XG5cdFx0XHRcdHNlc3Npb25JZCA9PT0gdGhpcy5zZXNzaW9uSWQgfHxcblx0XHRcdFx0bWV0aG9kLnN0YXJ0c1dpdGgoJ0Jyb3dzZXIuJykgfHxcblx0XHRcdFx0bWV0aG9kLnN0YXJ0c1dpdGgoJ1RhcmdldC4nKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVycy5nZXQobWV0aG9kKTtcblx0XHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENEUE1ldGhvZE5vdEZvdW5kRXJyb3IobWV0aG9kKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYXdhaXQgaGFuZGxlcihwYXJhbXMsIHNlc3Npb25JZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ0RQU2VydmVyRXJyb3IoYFNlc3Npb24gbm90IGZvdW5kOiAke3Nlc3Npb25JZH1gKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29ubmVjdGlvbi5zZW5kQ29tbWFuZChtZXRob2QsIHBhcmFtcyk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0ID8/IHt9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBDRFBFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBDRFBTZXJ2ZXJFcnJvcihlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFjY2VwdCBhIENEUCByZXF1ZXN0IGZyb20gYSBtZXNzYWdlLWJhc2VkIHRyYW5zcG9ydCAoV2ViU29ja2V0LCBJUEMsIGV0Yy4pLCByb3V0ZSBpdCxcblx0ICogYW5kIGRlbGl2ZXIgdGhlIHJlc3BvbnNlIG9yIGVycm9yIHZpYSB7QGxpbmsgb25NZXNzYWdlfS5cblx0ICovXG5cdGFzeW5jIHNlbmRNZXNzYWdlKHsgaWQsIG1ldGhvZCwgcGFyYW1zLCBzZXNzaW9uSWQgfTogQ0RQUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmRDb21tYW5kKG1ldGhvZCwgcGFyYW1zLCBzZXNzaW9uSWQpXG5cdFx0XHQudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbk1lc3NhZ2UuZmlyZSh7IGlkLCByZXN1bHQsIHNlc3Npb25JZCB9KTtcblx0XHRcdH0pXG5cdFx0XHQuY2F0Y2goKGVycm9yOiBFcnJvcikgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbk1lc3NhZ2UuZmlyZSh7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRcdGNvZGU6IGVycm9yIGluc3RhbmNlb2YgQ0RQRXJyb3IgPyBlcnJvci5jb2RlIDogQ0RQRXJyb3JDb2RlLlNlcnZlckVycm9yLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXJyb3IubWVzc2FnZSB8fCAnVW5rbm93biBlcnJvcidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHNlc3Npb25JZFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gQ0RQIENvbW1hbmRzXG5cblx0cHJpdmF0ZSBoYW5kbGVCcm93c2VyR2V0V2luZG93Rm9yVGFyZ2V0KHsgdGFyZ2V0SWQgfTogeyB0YXJnZXRJZD86IHN0cmluZyB9LCBzZXNzaW9uSWQ/OiBzdHJpbmcpIHtcblx0XHRjb25zdCByZXNvbHZlZFRhcmdldElkID0gKHNlc3Npb25JZCAmJiB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKT8udGFyZ2V0SWQpID8/IHRhcmdldElkO1xuXHRcdGlmICghcmVzb2x2ZWRUYXJnZXRJZCkge1xuXHRcdFx0dGhyb3cgbmV3IENEUFNlcnZlckVycm9yKCdVbmFibGUgdG8gcmVzb2x2ZSB0YXJnZXQnKTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl90YXJnZXRzLmdldChyZXNvbHZlZFRhcmdldElkKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhyb3cgbmV3IENEUFNlcnZlckVycm9yKCdVbmFibGUgdG8gcmVzb2x2ZSB0YXJnZXQnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5icm93c2VyVGFyZ2V0LmdldFdpbmRvd0ZvclRhcmdldCh0YXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVUYXJnZXRHZXRCcm93c2VyQ29udGV4dHMoKSB7XG5cdFx0cmV0dXJuIHsgYnJvd3NlckNvbnRleHRJZHM6IHRoaXMuYnJvd3NlclRhcmdldC5nZXRCcm93c2VyQ29udGV4dHMoKSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVUYXJnZXRDcmVhdGVCcm93c2VyQ29udGV4dCgpIHtcblx0XHRjb25zdCBicm93c2VyQ29udGV4dElkID0gYXdhaXQgdGhpcy5icm93c2VyVGFyZ2V0LmNyZWF0ZUJyb3dzZXJDb250ZXh0KCk7XG5cdFx0cmV0dXJuIHsgYnJvd3NlckNvbnRleHRJZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVUYXJnZXREaXNwb3NlQnJvd3NlckNvbnRleHQoeyBicm93c2VyQ29udGV4dElkIH06IHsgYnJvd3NlckNvbnRleHRJZDogc3RyaW5nIH0pIHtcblx0XHRhd2FpdCB0aGlzLmJyb3dzZXJUYXJnZXQuZGlzcG9zZUJyb3dzZXJDb250ZXh0KGJyb3dzZXJDb250ZXh0SWQpO1xuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlVGFyZ2V0QXR0YWNoVG9Ccm93c2VyVGFyZ2V0KCkge1xuXHRcdHRoaXMuc2VuZEV2ZW50KCdUYXJnZXQuYXR0YWNoZWRUb1RhcmdldCcsIHtcblx0XHRcdHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQsXG5cdFx0XHR0YXJnZXRJbmZvOiB0aGlzLmJyb3dzZXJUYXJnZXQudGFyZ2V0SW5mbyxcblx0XHRcdHdhaXRpbmdGb3JEZWJ1Z2dlcjogZmFsc2Vcblx0XHR9KTtcblx0XHR0aGlzLl9pc0F0dGFjaGVkVG9Ccm93c2VyVGFyZ2V0ID0gdHJ1ZTtcblx0XHRyZXR1cm4geyBzZXNzaW9uSWQ6IHRoaXMuc2Vzc2lvbklkIH07XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVRhcmdldEFjdGl2YXRlVGFyZ2V0KHsgdGFyZ2V0SWQgfTogeyB0YXJnZXRJZDogc3RyaW5nIH0pIHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl90YXJnZXRzLmdldCh0YXJnZXRJZCk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRocm93IG5ldyBDRFBTZXJ2ZXJFcnJvcignVW5hYmxlIHRvIHJlc29sdmUgdGFyZ2V0Jyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmJyb3dzZXJUYXJnZXQuYWN0aXZhdGVUYXJnZXQodGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVGFyZ2V0U2V0QXV0b0F0dGFjaChwYXJhbXM6IHsgYXV0b0F0dGFjaD86IGJvb2xlYW47IGZsYXR0ZW4/OiBib29sZWFuIH0sIHNlc3Npb25JZD86IHN0cmluZykge1xuXHRcdGlmIChzZXNzaW9uSWQgJiYgc2Vzc2lvbklkICE9PSB0aGlzLnNlc3Npb25JZCkge1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDRFBTZXJ2ZXJFcnJvcihgU2Vzc2lvbiBub3QgZm91bmQ6ICR7c2Vzc2lvbklkfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbm5lY3Rpb24uc2VuZENvbW1hbmQoJ1RhcmdldC5zZXRBdXRvQXR0YWNoJywgcGFyYW1zKTtcblx0XHR9XG5cblx0XHRpZiAoIXBhcmFtcy5mbGF0dGVuKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ0RQSW52YWxpZFBhcmFtc0Vycm9yKCdUaGlzIGltcGxlbWVudGF0aW9uIG9ubHkgc3VwcG9ydHMgYXV0by1hdHRhY2ggd2l0aCBmbGF0dGVuPXRydWUnKTtcblx0XHR9XG5cblx0XHQvLyBQcm94eS1sZXZlbCBhdXRvLWF0dGFjaDogYXR0YWNoIHRvIG5ldyB0YXJnZXRzIGFzIHRoZXkgYXJlIHJlZ2lzdGVyZWQuXG5cdFx0dGhpcy5fYXV0b0F0dGFjaCA9IHBhcmFtcy5hdXRvQXR0YWNoID8/IGZhbHNlO1xuXG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVUYXJnZXRTZXREaXNjb3ZlclRhcmdldHMoeyBkaXNjb3ZlciA9IGZhbHNlIH06IHsgZGlzY292ZXI/OiBib29sZWFuIH0pIHtcblx0XHRpZiAoZGlzY292ZXIgIT09IHRoaXMuX2Rpc2NvdmVyKSB7XG5cdFx0XHR0aGlzLl9kaXNjb3ZlciA9IGRpc2NvdmVyO1xuXG5cdFx0XHRpZiAodGhpcy5fZGlzY292ZXIpIHtcblx0XHRcdFx0Ly8gQW5ub3VuY2UgYWxsIGV4aXN0aW5nIHRhcmdldHNcblx0XHRcdFx0Zm9yIChjb25zdCB0YXJnZXQgb2YgdGhpcy5fdGFyZ2V0cy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuc2VuZEV2ZW50KCdUYXJnZXQudGFyZ2V0Q3JlYXRlZCcsIHsgdGFyZ2V0SW5mbzogdGFyZ2V0LnRhcmdldEluZm8gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVRhcmdldEdldFRhcmdldHMoKSB7XG5cdFx0cmV0dXJuIHsgdGFyZ2V0SW5mb3M6IEFycmF5LmZyb20odGhpcy5fdGFyZ2V0cy52YWx1ZXMoKSkubWFwKHRhcmdldCA9PiB0YXJnZXQudGFyZ2V0SW5mbykgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVGFyZ2V0R2V0VGFyZ2V0SW5mbyh7IHRhcmdldElkIH06IHsgdGFyZ2V0SWQ/OiBzdHJpbmcgfSA9IHt9KSB7XG5cdFx0aWYgKCF0YXJnZXRJZCkge1xuXHRcdFx0Ly8gTm8gdGFyZ2V0SWQgc3BlY2lmaWVkIC0tIHJldHVybiBpbmZvIGFib3V0IHRoZSBicm93c2VyIHRhcmdldCBpdHNlbGZcblx0XHRcdHJldHVybiB7IHRhcmdldEluZm86IHRoaXMuYnJvd3NlclRhcmdldC50YXJnZXRJbmZvIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fdGFyZ2V0cy5nZXQodGFyZ2V0SWQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHR0aHJvdyBuZXcgQ0RQU2VydmVyRXJyb3IoJ1VuYWJsZSB0byByZXNvbHZlIHRhcmdldCcpO1xuXHRcdH1cblx0XHRyZXR1cm4geyB0YXJnZXRJbmZvOiB0YXJnZXQudGFyZ2V0SW5mbyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVUYXJnZXRBdHRhY2hUb1RhcmdldCh7IHRhcmdldElkLCBmbGF0dGVuIH06IHsgdGFyZ2V0SWQ6IHN0cmluZzsgZmxhdHRlbj86IGJvb2xlYW4gfSkge1xuXHRcdGlmICghZmxhdHRlbikge1xuXHRcdFx0dGhyb3cgbmV3IENEUEludmFsaWRQYXJhbXNFcnJvcignVGhpcyBpbXBsZW1lbnRhdGlvbiBvbmx5IHN1cHBvcnRzIGF0dGFjaFRvVGFyZ2V0IHdpdGggZmxhdHRlbj10cnVlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fdGFyZ2V0cy5nZXQodGFyZ2V0SWQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHR0aHJvdyBuZXcgQ0RQU2VydmVyRXJyb3IoJ1VuYWJsZSB0byByZXNvbHZlIHRhcmdldCcpO1xuXHRcdH1cblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGFyZ2V0LmF0dGFjaCgpO1xuXHRcdHJldHVybiB7IHNlc3Npb25JZDogY29ubmVjdGlvbi5zZXNzaW9uSWQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVGFyZ2V0RGV0YWNoRnJvbVRhcmdldCh7IHNlc3Npb25JZCB9OiB7IHNlc3Npb25JZDogc3RyaW5nIH0pIHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ0RQU2VydmVyRXJyb3IoYFNlc3Npb24gbm90IGZvdW5kOiAke3Nlc3Npb25JZH1gKTtcblx0XHR9XG5cblx0XHRjb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVRhcmdldENyZWF0ZVRhcmdldCh7IHVybCwgYnJvd3NlckNvbnRleHRJZCB9OiB7IHVybD86IHN0cmluZzsgYnJvd3NlckNvbnRleHRJZD86IHN0cmluZyB9KSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5icm93c2VyVGFyZ2V0LmNyZWF0ZVRhcmdldCh1cmwgfHwgJ2Fib3V0OmJsYW5rJywgYnJvd3NlckNvbnRleHRJZCk7XG5cdFx0dGhpcy5yZWdpc3RlclRhcmdldCh0YXJnZXQpO1xuXG5cdFx0Ly8gUGxheXdyaWdodCBleHBlY3RzIHRoZSBhdHRhY2htZW50IHRvIGhhcHBlbiBiZWZvcmUgY3JlYXRlVGFyZ2V0IHJldHVybnMuXG5cdFx0aWYgKHRoaXMuX2F1dG9BdHRhY2ggJiYgIXRoaXMuX2F1dG9BdHRhY2htZW50cy5oYXModGFyZ2V0KSkge1xuXHRcdFx0dGhpcy5fYXV0b0F0dGFjaG1lbnRzLmFkZCh0YXJnZXQpO1xuXHRcdFx0YXdhaXQgdGFyZ2V0LmF0dGFjaCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHRhcmdldElkOiB0YXJnZXQudGFyZ2V0SW5mby50YXJnZXRJZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVUYXJnZXRDbG9zZVRhcmdldCh7IHRhcmdldElkIH06IHsgdGFyZ2V0SWQ6IHN0cmluZyB9KSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3RhcmdldHMuZ2V0KHRhcmdldElkKTtcblx0XHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBDRFBTZXJ2ZXJFcnJvcignVW5hYmxlIHRvIHJlc29sdmUgdGFyZ2V0Jyk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLmJyb3dzZXJUYXJnZXQuY2xvc2VUYXJnZXQodGFyZ2V0KTtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlIH07XG5cdFx0fVxuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxZQUFZLHFCQUFxQjtBQUMxQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQXdELFVBQVUsY0FBYyxnQkFBZ0Isd0JBQXdCLDZCQUFnRTtBQU9qTCxNQUFNLHdCQUF3QixXQUFxQztBQUFBLEVBaUR6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
