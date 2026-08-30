import assert from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { extUriBiasedIgnorePathCase } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { buildDefaultChatUri, createDefaultChatSummary, createSessionState, SessionLifecycle, SessionStatus, withSessionMultiRootMetadata } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { AgentHostSessionWorkingDirectorySynchronizer } from "../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectorySynchronizer.js";
class MutableSessionSubscription extends Disposable {
  constructor(_verifiedState) {
    super();
    this._verifiedState = _verifiedState;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._onWillApplyAction = this._register(new Emitter());
    this.onWillApplyAction = this._onWillApplyAction.event;
    this._onDidApplyAction = this._register(new Emitter());
    this.onDidApplyAction = this._onDidApplyAction.event;
    this._state = _verifiedState;
  }
  get value() {
    return this._state;
  }
  get verifiedValue() {
    return this._verifiedState;
  }
  refresh(value) {
    this._verifiedState = value;
    this._state = value;
    this._onDidChange.fire(value);
  }
  applyOptimistic(action) {
    const state = this._state;
    if (!state) {
      return;
    }
    const workingDirectories = state.workingDirectories ?? [];
    this._state = {
      ...state,
      workingDirectories: action.type === ActionType.SessionWorkingDirectorySet ? [...workingDirectories, action.directory] : workingDirectories.filter((directory) => directory !== action.directory)
    };
    this._onDidChange.fire(this._state);
  }
  reject(action) {
    const envelope = {
      channel: "copilot:/session",
      action,
      serverSeq: 1,
      origin: { clientId: "test", clientSeq: 1 },
      rejectionReason: "rejected"
    };
    this._onWillApplyAction.fire(envelope);
    this._state = this._verifiedState;
    if (this._state) {
      this._onDidChange.fire(this._state);
    }
    this._onDidApplyAction.fire(envelope);
  }
}
class TestConnection extends mock() {
  constructor(subscription, provider = "claude", protocolVersion = "0.7.0", immutablePrimary = true) {
    super();
    this.subscription = subscription;
    this.dispatched = [];
    this.initializeResult = observableValue(this, protocolVersion ? { protocolVersion } : void 0);
    this.rootState = {
      value: {
        agents: [{
          provider,
          displayName: provider,
          description: "",
          models: [],
          capabilities: immutablePrimary ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}
        }]
      },
      verifiedValue: void 0,
      onDidChange: Event.None,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
  }
  setProtocolVersion(protocolVersion) {
    this.initializeResult.set({ protocolVersion }, void 0);
  }
  dispatch(_channel, action) {
    if (action.type === ActionType.SessionWorkingDirectorySet || action.type === ActionType.SessionWorkingDirectoryRemoved) {
      this.dispatched.push(action);
      this.subscription.applyOptimistic(action);
    }
  }
}
suite("AgentHostSessionWorkingDirectorySynchronizer", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const session = URI.parse("copilot:/session");
  const primary = URI.file("/workspace/primary");
  const retained = URI.file("/workspace/retained");
  const stale = URI.file("/workspace/stale");
  const added = URI.file("/workspace/added");
  const workspaceFile = URI.file("/workspace/demo.code-workspace");
  function createSynchronizer(trusted = true, folders = [retained, added], onDidChangeWorkspaceFolders = Event.None, onDidChangeTrustedFolders = Event.None) {
    const workspaceContextService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders;
      }
      getWorkspace() {
        return {
          id: "workspace",
          configuration: workspaceFile,
          folders: folders.map((uri, index) => ({ uri, index, name: uri.path, toResource: (path) => URI.joinPath(uri, path) }))
        };
      }
    }();
    const trustService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeTrust = Event.None;
        this.onDidChangeTrustedFolders = onDidChangeTrustedFolders;
      }
      async getUriTrustInfo(uri) {
        return { uri, trusted: await (typeof trusted === "function" ? trusted() : trusted) };
      }
    }();
    const environmentService = { isSessionsWindow: false, remoteAuthority: void 0 };
    const uriIdentityService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.extUri = extUriBiasedIgnorePathCase;
      }
    }();
    return disposables.add(new AgentHostSessionWorkingDirectorySynchronizer(
      workspaceContextService,
      trustService,
      environmentService,
      uriIdentityService,
      new NullLogService()
    ));
  }
  function createSubscription(hydrated = true) {
    const summary = {
      resource: session.toString(),
      provider: "copilot",
      title: "Session",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      workingDirectories: [primary.toString(), retained.toString(), stale.toString()],
      _meta: withSessionMultiRootMetadata(void 0, { workspaceFile: workspaceFile.toString() })
    };
    const defaultChat = buildDefaultChatUri(session.toString());
    const state = {
      ...createSessionState(summary),
      lifecycle: SessionLifecycle.Ready,
      chats: [createDefaultChatSummary(summary, defaultChat)],
      defaultChat
    };
    return disposables.add(new MutableSessionSubscription(hydrated ? state : void 0));
  }
  test("uses ordinary optimistic dispatch and pending state suppresses duplicate deltas", async () => {
    const synchronizer = createSynchronizer();
    const subscription = createSubscription();
    const connection = new TestConnection(subscription);
    disposables.add(synchronizer.register({ session, provider: "claude", connection, subscription }));
    await synchronizer.reconcile(session, CancellationToken.None);
    await synchronizer.reconcile(session, CancellationToken.None);
    assert.deepStrictEqual({
      actions: connection.dispatched,
      effective: subscription.value?.workingDirectories,
      confirmed: subscription.verifiedValue?.workingDirectories
    }, {
      actions: [
        { type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
        { type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() }
      ],
      effective: [primary.toString(), retained.toString(), added.toString()],
      confirmed: [primary.toString(), retained.toString(), stale.toString()]
    });
  });
  test("does not remove the immutable primary when it leaves the workspace", async () => {
    const synchronizer = createSynchronizer(true, [retained]);
    const subscription = createSubscription();
    const connection = new TestConnection(subscription);
    disposables.add(synchronizer.register({ session, provider: "claude", connection, subscription }));
    await synchronizer.reconcile(session, CancellationToken.None);
    assert.deepStrictEqual(connection.dispatched, [
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() }
    ]);
  });
  test("does not reconcile without the immutable-primary capability", async () => {
    const synchronizer = createSynchronizer();
    const subscription = createSubscription();
    const connection = new TestConnection(subscription, "claude", "0.7.0", false);
    disposables.add(synchronizer.register({ session, provider: "claude", connection, subscription }));
    await synchronizer.reconcile(session, CancellationToken.None);
    assert.deepStrictEqual(connection.dispatched, []);
  });
  test("subscription refresh converges without another workspace event or user send", async () => {
    const synchronizer = createSynchronizer();
    const subscription = createSubscription(false);
    const state = createSubscription().verifiedValue;
    const connection = new TestConnection(subscription);
    disposables.add(synchronizer.register({ session, provider: "claude", connection, subscription }));
    subscription.refresh(state);
    await timeout(0);
    assert.deepStrictEqual(connection.dispatched, [
      { type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() }
    ]);
  });
  test("registration and workspace changes schedule reconciliation", async () => {
    const folders = [retained];
    const onDidChangeWorkspaceFolders = disposables.add(new Emitter());
    const synchronizer = createSynchronizer(true, folders, onDidChangeWorkspaceFolders.event);
    const subscription = createSubscription();
    const connection = new TestConnection(subscription);
    disposables.add(synchronizer.register({ session, provider: "claude", connection, subscription }));
    await timeout(0);
    assert.deepStrictEqual(connection.dispatched, [
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() }
    ]);
    folders.push(added);
    onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
    await timeout(0);
    assert.deepStrictEqual(connection.dispatched, [
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
      { type: ActionType.SessionWorkingDirectorySet, directory: added.toString() }
    ]);
  });
  test("does not dispatch working-directory actions to a pre-0.7 host", async () => {
    const synchronizer = createSynchronizer();
    const subscription = createSubscription();
    const connection = new TestConnection(subscription, "claude", "0.5.2");
    disposables.add(synchronizer.register({ session, provider: "claude", connection, subscription }));
    await synchronizer.reconcile(session, CancellationToken.None);
    assert.deepStrictEqual(connection.dispatched, []);
  });
  test("reconciles when a compatible protocol version finishes initializing", async () => {
    const synchronizer = createSynchronizer();
    const subscription = createSubscription();
    const connection = new TestConnection(subscription, "claude", null);
    disposables.add(synchronizer.register({ session, provider: "claude", connection, subscription }));
    await timeout(0);
    assert.deepStrictEqual(connection.dispatched, []);
    connection.setProtocolVersion("0.7.0");
    await timeout(0);
    assert.deepStrictEqual(connection.dispatched, [
      { type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() }
    ]);
  });
  test("rejects untrusted additions but still dispatches safe removals", async () => {
    let trusted = false;
    const onDidChangeTrustedFolders = disposables.add(new Emitter());
    const synchronizer = createSynchronizer(() => trusted, void 0, void 0, onDidChangeTrustedFolders.event);
    const subscription = createSubscription();
    const connection = new TestConnection(subscription);
    disposables.add(synchronizer.register({ session, provider: "claude", connection, subscription }));
    await assert.rejects(synchronizer.reconcile(session, CancellationToken.None), /is not trusted/);
    assert.deepStrictEqual(connection.dispatched, [
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() }
    ]);
    trusted = true;
    onDidChangeTrustedFolders.fire();
    await timeout(0);
    assert.deepStrictEqual(connection.dispatched, [
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() },
      { type: ActionType.SessionWorkingDirectorySet, directory: added.toString() }
    ]);
  });
  test("does not dispatch through a registration disposed while folder trust is pending", async () => {
    let releaseTrust;
    const trustPending = new Promise((resolve) => releaseTrust = resolve);
    let reportTrustStarted;
    const trustStarted = new Promise((resolve) => reportTrustStarted = resolve);
    const synchronizer = createSynchronizer(async () => {
      reportTrustStarted();
      await trustPending;
      return true;
    });
    const subscription = createSubscription();
    const connection = new TestConnection(subscription);
    const registration = synchronizer.register({ session, provider: "claude", connection, subscription });
    await trustStarted;
    registration.dispose();
    const queuedReconcile = synchronizer.reconcile(session, CancellationToken.None);
    releaseTrust();
    await queuedReconcile;
    assert.deepStrictEqual(connection.dispatched, []);
  });
  test("does not immediately redispatch an action rejected by the host", async () => {
    const synchronizer = createSynchronizer();
    const subscription = createSubscription();
    const connection = new TestConnection(subscription);
    disposables.add(synchronizer.register({ session, provider: "claude", connection, subscription }));
    await synchronizer.reconcile(session, CancellationToken.None);
    subscription.reject(connection.dispatched[0]);
    await timeout(0);
    assert.strictEqual(connection.dispatched.length, 2);
  });
  test("reconciles Copilot sessions through the provider-neutral capability", async () => {
    const synchronizer = createSynchronizer();
    const subscription = createSubscription();
    const connection = new TestConnection(subscription, "copilotcli");
    disposables.add(synchronizer.register({ session, provider: "copilotcli", connection, subscription }));
    await synchronizer.reconcile(session, CancellationToken.None);
    assert.deepStrictEqual(connection.dispatched, [
      { type: ActionType.SessionWorkingDirectorySet, directory: added.toString() },
      { type: ActionType.SessionWorkingDirectoryRemoved, directory: stale.toString() }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U3luY2hyb25pemVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEluaXRpYWxpemVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFjdGlvbkVudmVsb3BlLCBBY3Rpb25UeXBlLCBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgY3JlYXRlRGVmYXVsdENoYXRTdW1tYXJ5LCBjcmVhdGVTZXNzaW9uU3RhdGUsIFJvb3RTdGF0ZSwgU2Vzc2lvbkxpZmVjeWNsZSwgU2Vzc2lvblN0YXRlLCBTZXNzaW9uU3RhdHVzLCB3aXRoU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVN5bmNocm9uaXplciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTeW5jaHJvbml6ZXIuanMnO1xuXG5jbGFzcyBNdXRhYmxlU2Vzc2lvblN1YnNjcmlwdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2Vzc2lvblN0YXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQXBwbHlBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbEFwcGx5QWN0aW9uID0gdGhpcy5fb25XaWxsQXBwbHlBY3Rpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQXBwbHlBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQXBwbHlBY3Rpb24gPSB0aGlzLl9vbkRpZEFwcGx5QWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX3N0YXRlOiBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfdmVyaWZpZWRTdGF0ZTogU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zdGF0ZSA9IF92ZXJpZmllZFN0YXRlO1xuXHR9XG5cblx0Z2V0IHZhbHVlKCk6IFNlc3Npb25TdGF0ZSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zdGF0ZTsgfVxuXHRnZXQgdmVyaWZpZWRWYWx1ZSgpOiBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fdmVyaWZpZWRTdGF0ZTsgfVxuXG5cdHJlZnJlc2godmFsdWU6IFNlc3Npb25TdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3ZlcmlmaWVkU3RhdGUgPSB2YWx1ZTtcblx0XHR0aGlzLl9zdGF0ZSA9IHZhbHVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodmFsdWUpO1xuXHR9XG5cblx0YXBwbHlPcHRpbWlzdGljKGFjdGlvbjogU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlBY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzID8/IFtdO1xuXHRcdHRoaXMuX3N0YXRlID0ge1xuXHRcdFx0Li4uc3RhdGUsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0XG5cdFx0XHRcdD8gWy4uLndvcmtpbmdEaXJlY3RvcmllcywgYWN0aW9uLmRpcmVjdG9yeV1cblx0XHRcdFx0OiB3b3JraW5nRGlyZWN0b3JpZXMuZmlsdGVyKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkgIT09IGFjdGlvbi5kaXJlY3RvcnkpLFxuXHRcdH07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh0aGlzLl9zdGF0ZSk7XG5cdH1cblxuXHRyZWplY3QoYWN0aW9uOiBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeUFjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSA9IHtcblx0XHRcdGNoYW5uZWw6ICdjb3BpbG90Oi9zZXNzaW9uJyxcblx0XHRcdGFjdGlvbixcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSxcblx0XHRcdHJlamVjdGlvblJlYXNvbjogJ3JlamVjdGVkJyxcblx0XHR9O1xuXHRcdHRoaXMuX29uV2lsbEFwcGx5QWN0aW9uLmZpcmUoZW52ZWxvcGUpO1xuXHRcdHRoaXMuX3N0YXRlID0gdGhpcy5fdmVyaWZpZWRTdGF0ZTtcblx0XHRpZiAodGhpcy5fc3RhdGUpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy5fc3RhdGUpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZEFwcGx5QWN0aW9uLmZpcmUoZW52ZWxvcGUpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RDb25uZWN0aW9uIGV4dGVuZHMgbW9jazxJQWdlbnRDb25uZWN0aW9uPigpIHtcblx0cmVhZG9ubHkgZGlzcGF0Y2hlZDogU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlBY3Rpb25bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IHJvb3RTdGF0ZTogSUFnZW50U3Vic2NyaXB0aW9uPFJvb3RTdGF0ZT47XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGluaXRpYWxpemVSZXN1bHQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzdWJzY3JpcHRpb246IE11dGFibGVTZXNzaW9uU3Vic2NyaXB0aW9uLCBwcm92aWRlciA9ICdjbGF1ZGUnLCBwcm90b2NvbFZlcnNpb246IHN0cmluZyB8IG51bGwgPSAnMC43LjAnLCBpbW11dGFibGVQcmltYXJ5ID0gdHJ1ZSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5pbml0aWFsaXplUmVzdWx0ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHByb3RvY29sVmVyc2lvbiA/IHsgcHJvdG9jb2xWZXJzaW9uIH0gYXMgSW5pdGlhbGl6ZVJlc3VsdCA6IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5yb290U3RhdGUgPSB7XG5cdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRhZ2VudHM6IFt7XG5cdFx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6IHByb3ZpZGVyLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0XHRtb2RlbHM6IFtdLFxuXHRcdFx0XHRcdGNhcGFiaWxpdGllczogaW1tdXRhYmxlUHJpbWFyeSA/IHsgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXM6IHsgaW1tdXRhYmxlUHJpbWFyeTogdHJ1ZSB9IH0gOiB7fSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9IGFzIHVua25vd24gYXMgUm9vdFN0YXRlLFxuXHRcdFx0dmVyaWZpZWRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0fVxuXG5cdHNldFByb3RvY29sVmVyc2lvbihwcm90b2NvbFZlcnNpb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuaW5pdGlhbGl6ZVJlc3VsdC5zZXQoeyBwcm90b2NvbFZlcnNpb24gfSBhcyBJbml0aWFsaXplUmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcGF0Y2goX2NoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBQYXJhbWV0ZXJzPElBZ2VudENvbm5lY3Rpb25bJ2Rpc3BhdGNoJ10+WzFdKTogdm9pZCB7XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0IHx8IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCkge1xuXHRcdFx0dGhpcy5kaXNwYXRjaGVkLnB1c2goYWN0aW9uKTtcblx0XHRcdHRoaXMuc3Vic2NyaXB0aW9uLmFwcGx5T3B0aW1pc3RpYyhhY3Rpb24pO1xuXHRcdH1cblx0fVxufVxuXG5zdWl0ZSgnQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTeW5jaHJvbml6ZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnY29waWxvdDovc2Vzc2lvbicpO1xuXHRjb25zdCBwcmltYXJ5ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvcHJpbWFyeScpO1xuXHRjb25zdCByZXRhaW5lZCA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3JldGFpbmVkJyk7XG5cdGNvbnN0IHN0YWxlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3RhbGUnKTtcblx0Y29uc3QgYWRkZWQgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hZGRlZCcpO1xuXHRjb25zdCB3b3Jrc3BhY2VGaWxlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZGVtby5jb2RlLXdvcmtzcGFjZScpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVN5bmNocm9uaXplcihcblx0XHR0cnVzdGVkOiBib29sZWFuIHwgKCgpID0+IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+KSA9IHRydWUsXG5cdFx0Zm9sZGVycyA9IFtyZXRhaW5lZCwgYWRkZWRdLFxuXHRcdG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVyczogRXZlbnQ8SVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudD4gPSBFdmVudC5Ob25lLFxuXHRcdG9uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnM6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZSxcblx0KSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VDb250ZXh0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnM7XG5cdFx0XHRvdmVycmlkZSBnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb246IHdvcmtzcGFjZUZpbGUsXG5cdFx0XHRcdFx0Zm9sZGVyczogZm9sZGVycy5tYXAoKHVyaSwgaW5kZXgpID0+ICh7IHVyaSwgaW5kZXgsIG5hbWU6IHVyaS5wYXRoLCB0b1Jlc291cmNlOiBwYXRoID0+IFVSSS5qb2luUGF0aCh1cmksIHBhdGgpIH0gYXMgSVdvcmtzcGFjZUZvbGRlcikpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgdHJ1c3RTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVRydXN0ID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMgPSBvbkRpZENoYW5nZVRydXN0ZWRGb2xkZXJzO1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0VXJpVHJ1c3RJbmZvKHVyaTogVVJJKSB7IHJldHVybiB7IHVyaSwgdHJ1c3RlZDogYXdhaXQgKHR5cGVvZiB0cnVzdGVkID09PSAnZnVuY3Rpb24nID8gdHJ1c3RlZCgpIDogdHJ1c3RlZCkgfTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0geyBpc1Nlc3Npb25zV2luZG93OiBmYWxzZSwgcmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWQgfSBhcyBQYXJ0aWFsPElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U+IGFzIElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U7XG5cdFx0Y29uc3QgdXJpSWRlbnRpdHlTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVXJpSWRlbnRpdHlTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGV4dFVyaSA9IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlO1xuXHRcdH07XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTeW5jaHJvbml6ZXIoXG5cdFx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRcdHRydXN0U2VydmljZSxcblx0XHRcdGVudmlyb25tZW50U2VydmljZSxcblx0XHRcdHVyaUlkZW50aXR5U2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU3Vic2NyaXB0aW9uKGh5ZHJhdGVkID0gdHJ1ZSk6IE11dGFibGVTZXNzaW9uU3Vic2NyaXB0aW9uIHtcblx0XHRjb25zdCBzdW1tYXJ5ID0ge1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHR0aXRsZTogJ1Nlc3Npb24nLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW3ByaW1hcnkudG9TdHJpbmcoKSwgcmV0YWluZWQudG9TdHJpbmcoKSwgc3RhbGUudG9TdHJpbmcoKV0sXG5cdFx0XHRfbWV0YTogd2l0aFNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YSh1bmRlZmluZWQsIHsgd29ya3NwYWNlRmlsZTogd29ya3NwYWNlRmlsZS50b1N0cmluZygpIH0pLFxuXHRcdH07XG5cdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3Qgc3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdC4uLmNyZWF0ZVNlc3Npb25TdGF0ZShzdW1tYXJ5KSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGNoYXRzOiBbY3JlYXRlRGVmYXVsdENoYXRTdW1tYXJ5KHN1bW1hcnksIGRlZmF1bHRDaGF0KV0sXG5cdFx0XHRkZWZhdWx0Q2hhdCxcblx0XHR9O1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVTZXNzaW9uU3Vic2NyaXB0aW9uKGh5ZHJhdGVkID8gc3RhdGUgOiB1bmRlZmluZWQpKTtcblx0fVxuXG5cdHRlc3QoJ3VzZXMgb3JkaW5hcnkgb3B0aW1pc3RpYyBkaXNwYXRjaCBhbmQgcGVuZGluZyBzdGF0ZSBzdXBwcmVzc2VzIGR1cGxpY2F0ZSBkZWx0YXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3luY2hyb25pemVyID0gY3JlYXRlU3luY2hyb25pemVyKCk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gY3JlYXRlU3Vic2NyaXB0aW9uKCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IG5ldyBUZXN0Q29ubmVjdGlvbihzdWJzY3JpcHRpb24pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzeW5jaHJvbml6ZXIucmVnaXN0ZXIoeyBzZXNzaW9uLCBwcm92aWRlcjogJ2NsYXVkZScsIGNvbm5lY3Rpb24sIHN1YnNjcmlwdGlvbiB9KSk7XG5cblx0XHRhd2FpdCBzeW5jaHJvbml6ZXIucmVjb25jaWxlKHNlc3Npb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IHN5bmNocm9uaXplci5yZWNvbmNpbGUoc2Vzc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGlvbnM6IGNvbm5lY3Rpb24uZGlzcGF0Y2hlZCxcblx0XHRcdGVmZmVjdGl2ZTogc3Vic2NyaXB0aW9uLnZhbHVlPy53b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHRjb25maXJtZWQ6IHN1YnNjcmlwdGlvbi52ZXJpZmllZFZhbHVlPy53b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0fSwge1xuXHRcdFx0YWN0aW9uczogW1xuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogYWRkZWQudG9TdHJpbmcoKSB9LFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBkaXJlY3Rvcnk6IHN0YWxlLnRvU3RyaW5nKCkgfSxcblx0XHRcdF0sXG5cdFx0XHRlZmZlY3RpdmU6IFtwcmltYXJ5LnRvU3RyaW5nKCksIHJldGFpbmVkLnRvU3RyaW5nKCksIGFkZGVkLnRvU3RyaW5nKCldLFxuXHRcdFx0Y29uZmlybWVkOiBbcHJpbWFyeS50b1N0cmluZygpLCByZXRhaW5lZC50b1N0cmluZygpLCBzdGFsZS50b1N0cmluZygpXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVtb3ZlIHRoZSBpbW11dGFibGUgcHJpbWFyeSB3aGVuIGl0IGxlYXZlcyB0aGUgd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN5bmNocm9uaXplciA9IGNyZWF0ZVN5bmNocm9uaXplcih0cnVlLCBbcmV0YWluZWRdKTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBjcmVhdGVTdWJzY3JpcHRpb24oKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gbmV3IFRlc3RDb25uZWN0aW9uKHN1YnNjcmlwdGlvbik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN5bmNocm9uaXplci5yZWdpc3Rlcih7IHNlc3Npb24sIHByb3ZpZGVyOiAnY2xhdWRlJywgY29ubmVjdGlvbiwgc3Vic2NyaXB0aW9uIH0pKTtcblxuXHRcdGF3YWl0IHN5bmNocm9uaXplci5yZWNvbmNpbGUoc2Vzc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZCwgW1xuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5OiBzdGFsZS50b1N0cmluZygpIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlY29uY2lsZSB3aXRob3V0IHRoZSBpbW11dGFibGUtcHJpbWFyeSBjYXBhYmlsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN5bmNocm9uaXplciA9IGNyZWF0ZVN5bmNocm9uaXplcigpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IGNyZWF0ZVN1YnNjcmlwdGlvbigpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBuZXcgVGVzdENvbm5lY3Rpb24oc3Vic2NyaXB0aW9uLCAnY2xhdWRlJywgJzAuNy4wJywgZmFsc2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzeW5jaHJvbml6ZXIucmVnaXN0ZXIoeyBzZXNzaW9uLCBwcm92aWRlcjogJ2NsYXVkZScsIGNvbm5lY3Rpb24sIHN1YnNjcmlwdGlvbiB9KSk7XG5cblx0XHRhd2FpdCBzeW5jaHJvbml6ZXIucmVjb25jaWxlKHNlc3Npb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc3Vic2NyaXB0aW9uIHJlZnJlc2ggY29udmVyZ2VzIHdpdGhvdXQgYW5vdGhlciB3b3Jrc3BhY2UgZXZlbnQgb3IgdXNlciBzZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN5bmNocm9uaXplciA9IGNyZWF0ZVN5bmNocm9uaXplcigpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IGNyZWF0ZVN1YnNjcmlwdGlvbihmYWxzZSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVTdWJzY3JpcHRpb24oKS52ZXJpZmllZFZhbHVlITtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gbmV3IFRlc3RDb25uZWN0aW9uKHN1YnNjcmlwdGlvbik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN5bmNocm9uaXplci5yZWdpc3Rlcih7IHNlc3Npb24sIHByb3ZpZGVyOiAnY2xhdWRlJywgY29ubmVjdGlvbiwgc3Vic2NyaXB0aW9uIH0pKTtcblxuXHRcdHN1YnNjcmlwdGlvbi5yZWZyZXNoKHN0YXRlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWQsIFtcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCwgZGlyZWN0b3J5OiBhZGRlZC50b1N0cmluZygpIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBkaXJlY3Rvcnk6IHN0YWxlLnRvU3RyaW5nKCkgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0cmF0aW9uIGFuZCB3b3Jrc3BhY2UgY2hhbmdlcyBzY2hlZHVsZSByZWNvbmNpbGlhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXJzID0gW3JldGFpbmVkXTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudD4oKSk7XG5cdFx0Y29uc3Qgc3luY2hyb25pemVyID0gY3JlYXRlU3luY2hyb25pemVyKHRydWUsIGZvbGRlcnMsIG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5ldmVudCk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gY3JlYXRlU3Vic2NyaXB0aW9uKCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IG5ldyBUZXN0Q29ubmVjdGlvbihzdWJzY3JpcHRpb24pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzeW5jaHJvbml6ZXIucmVnaXN0ZXIoeyBzZXNzaW9uLCBwcm92aWRlcjogJ2NsYXVkZScsIGNvbm5lY3Rpb24sIHN1YnNjcmlwdGlvbiB9KSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkLCBbXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBkaXJlY3Rvcnk6IHN0YWxlLnRvU3RyaW5nKCkgfSxcblx0XHRdKTtcblxuXHRcdGZvbGRlcnMucHVzaChhZGRlZCk7XG5cdFx0b25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkLCBbXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZW1vdmVkLCBkaXJlY3Rvcnk6IHN0YWxlLnRvU3RyaW5nKCkgfSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCwgZGlyZWN0b3J5OiBhZGRlZC50b1N0cmluZygpIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGRpc3BhdGNoIHdvcmtpbmctZGlyZWN0b3J5IGFjdGlvbnMgdG8gYSBwcmUtMC43IGhvc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3luY2hyb25pemVyID0gY3JlYXRlU3luY2hyb25pemVyKCk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gY3JlYXRlU3Vic2NyaXB0aW9uKCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IG5ldyBUZXN0Q29ubmVjdGlvbihzdWJzY3JpcHRpb24sICdjbGF1ZGUnLCAnMC41LjInKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3luY2hyb25pemVyLnJlZ2lzdGVyKHsgc2Vzc2lvbiwgcHJvdmlkZXI6ICdjbGF1ZGUnLCBjb25uZWN0aW9uLCBzdWJzY3JpcHRpb24gfSkpO1xuXG5cdFx0YXdhaXQgc3luY2hyb25pemVyLnJlY29uY2lsZShzZXNzaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29uY2lsZXMgd2hlbiBhIGNvbXBhdGlibGUgcHJvdG9jb2wgdmVyc2lvbiBmaW5pc2hlcyBpbml0aWFsaXppbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3luY2hyb25pemVyID0gY3JlYXRlU3luY2hyb25pemVyKCk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gY3JlYXRlU3Vic2NyaXB0aW9uKCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IG5ldyBUZXN0Q29ubmVjdGlvbihzdWJzY3JpcHRpb24sICdjbGF1ZGUnLCBudWxsKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3luY2hyb25pemVyLnJlZ2lzdGVyKHsgc2Vzc2lvbiwgcHJvdmlkZXI6ICdjbGF1ZGUnLCBjb25uZWN0aW9uLCBzdWJzY3JpcHRpb24gfSkpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZCwgW10pO1xuXG5cdFx0Y29ubmVjdGlvbi5zZXRQcm90b2NvbFZlcnNpb24oJzAuNy4wJyk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkLCBbXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogYWRkZWQudG9TdHJpbmcoKSB9LFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5OiBzdGFsZS50b1N0cmluZygpIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgdW50cnVzdGVkIGFkZGl0aW9ucyBidXQgc3RpbGwgZGlzcGF0Y2hlcyBzYWZlIHJlbW92YWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCB0cnVzdGVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBzeW5jaHJvbml6ZXIgPSBjcmVhdGVTeW5jaHJvbml6ZXIoKCkgPT4gdHJ1c3RlZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG9uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMuZXZlbnQpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IGNyZWF0ZVN1YnNjcmlwdGlvbigpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBuZXcgVGVzdENvbm5lY3Rpb24oc3Vic2NyaXB0aW9uKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3luY2hyb25pemVyLnJlZ2lzdGVyKHsgc2Vzc2lvbiwgcHJvdmlkZXI6ICdjbGF1ZGUnLCBjb25uZWN0aW9uLCBzdWJzY3JpcHRpb24gfSkpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoc3luY2hyb25pemVyLnJlY29uY2lsZShzZXNzaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSwgL2lzIG5vdCB0cnVzdGVkLyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWQsIFtcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlbW92ZWQsIGRpcmVjdG9yeTogc3RhbGUudG9TdHJpbmcoKSB9LFxuXHRcdF0pO1xuXG5cdFx0dHJ1c3RlZCA9IHRydWU7XG5cdFx0b25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycy5maXJlKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZCwgW1xuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5OiBzdGFsZS50b1N0cmluZygpIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogYWRkZWQudG9TdHJpbmcoKSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkaXNwYXRjaCB0aHJvdWdoIGEgcmVnaXN0cmF0aW9uIGRpc3Bvc2VkIHdoaWxlIGZvbGRlciB0cnVzdCBpcyBwZW5kaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCByZWxlYXNlVHJ1c3QhOiAoKSA9PiB2b2lkO1xuXHRcdGNvbnN0IHRydXN0UGVuZGluZyA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gcmVsZWFzZVRydXN0ID0gcmVzb2x2ZSk7XG5cdFx0bGV0IHJlcG9ydFRydXN0U3RhcnRlZCE6ICgpID0+IHZvaWQ7XG5cdFx0Y29uc3QgdHJ1c3RTdGFydGVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiByZXBvcnRUcnVzdFN0YXJ0ZWQgPSByZXNvbHZlKTtcblx0XHRjb25zdCBzeW5jaHJvbml6ZXIgPSBjcmVhdGVTeW5jaHJvbml6ZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVwb3J0VHJ1c3RTdGFydGVkKCk7XG5cdFx0XHRhd2FpdCB0cnVzdFBlbmRpbmc7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBjcmVhdGVTdWJzY3JpcHRpb24oKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gbmV3IFRlc3RDb25uZWN0aW9uKHN1YnNjcmlwdGlvbik7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gc3luY2hyb25pemVyLnJlZ2lzdGVyKHsgc2Vzc2lvbiwgcHJvdmlkZXI6ICdjbGF1ZGUnLCBjb25uZWN0aW9uLCBzdWJzY3JpcHRpb24gfSk7XG5cblx0XHRhd2FpdCB0cnVzdFN0YXJ0ZWQ7XG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRjb25zdCBxdWV1ZWRSZWNvbmNpbGUgPSBzeW5jaHJvbml6ZXIucmVjb25jaWxlKHNlc3Npb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdHJlbGVhc2VUcnVzdCgpO1xuXHRcdGF3YWl0IHF1ZXVlZFJlY29uY2lsZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5kaXNwYXRjaGVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGltbWVkaWF0ZWx5IHJlZGlzcGF0Y2ggYW4gYWN0aW9uIHJlamVjdGVkIGJ5IHRoZSBob3N0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN5bmNocm9uaXplciA9IGNyZWF0ZVN5bmNocm9uaXplcigpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IGNyZWF0ZVN1YnNjcmlwdGlvbigpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBuZXcgVGVzdENvbm5lY3Rpb24oc3Vic2NyaXB0aW9uKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3luY2hyb25pemVyLnJlZ2lzdGVyKHsgc2Vzc2lvbiwgcHJvdmlkZXI6ICdjbGF1ZGUnLCBjb25uZWN0aW9uLCBzdWJzY3JpcHRpb24gfSkpO1xuXG5cdFx0YXdhaXQgc3luY2hyb25pemVyLnJlY29uY2lsZShzZXNzaW9uLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRzdWJzY3JpcHRpb24ucmVqZWN0KGNvbm5lY3Rpb24uZGlzcGF0Y2hlZFswXSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmRpc3BhdGNoZWQubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb25jaWxlcyBDb3BpbG90IHNlc3Npb25zIHRocm91Z2ggdGhlIHByb3ZpZGVyLW5ldXRyYWwgY2FwYWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzeW5jaHJvbml6ZXIgPSBjcmVhdGVTeW5jaHJvbml6ZXIoKTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBjcmVhdGVTdWJzY3JpcHRpb24oKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gbmV3IFRlc3RDb25uZWN0aW9uKHN1YnNjcmlwdGlvbiwgJ2NvcGlsb3RjbGknKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3luY2hyb25pemVyLnJlZ2lzdGVyKHsgc2Vzc2lvbiwgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgY29ubmVjdGlvbiwgc3Vic2NyaXB0aW9uIH0pKTtcblxuXHRcdGF3YWl0IHN5bmNocm9uaXplci5yZWNvbmNpbGUoc2Vzc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24uZGlzcGF0Y2hlZCwgW1xuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6IGFkZGVkLnRvU3RyaW5nKCkgfSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlbW92ZWQsIGRpcmVjdG9yeTogc3RhbGUudG9TdHJpbmcoKSB9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBSXhELFNBQXlCLGtCQUFpRDtBQUMxRSxTQUFTLHFCQUFxQiwwQkFBMEIsb0JBQStCLGtCQUFnQyxlQUFlLG9DQUFvQztBQUMxSyxTQUFTLHNCQUFzQjtBQUsvQixTQUFTLG9EQUFvRDtBQUU3RCxNQUFNLG1DQUFtQyxXQUF1RDtBQUFBLEVBVS9GLFlBQW9CLGdCQUEwQztBQUM3RCxVQUFNO0FBRGE7QUFUcEIsU0FBaUIsZUFBZSxLQUFLLFVBQVUsSUFBSSxRQUFzQixDQUFDO0FBQzFFLFNBQVMsY0FBYyxLQUFLLGFBQWE7QUFDekMsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQXdCLENBQUM7QUFDbEYsU0FBUyxvQkFBb0IsS0FBSyxtQkFBbUI7QUFDckQsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQXdCLENBQUM7QUFDakYsU0FBUyxtQkFBbUIsS0FBSyxrQkFBa0I7QUFNbEQsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRUEsSUFBSSxRQUFrQztBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVE7QUFBQSxFQUM1RCxJQUFJLGdCQUEwQztBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWdCO0FBQUEsRUFFNUUsUUFBUSxPQUEyQjtBQUNsQyxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLFNBQVM7QUFDZCxTQUFLLGFBQWEsS0FBSyxLQUFLO0FBQUEsRUFDN0I7QUFBQSxFQUVBLGdCQUFnQixRQUE2QztBQUM1RCxVQUFNLFFBQVEsS0FBSztBQUNuQixRQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsSUFDRDtBQUNBLFVBQU0scUJBQXFCLE1BQU0sc0JBQXNCLENBQUM7QUFDeEQsU0FBSyxTQUFTO0FBQUEsTUFDYixHQUFHO0FBQUEsTUFDSCxvQkFBb0IsT0FBTyxTQUFTLFdBQVcsNkJBQzVDLENBQUMsR0FBRyxvQkFBb0IsT0FBTyxTQUFTLElBQ3hDLG1CQUFtQixPQUFPLGVBQWEsY0FBYyxPQUFPLFNBQVM7QUFBQSxJQUN6RTtBQUNBLFNBQUssYUFBYSxLQUFLLEtBQUssTUFBTTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxPQUFPLFFBQTZDO0FBQ25ELFVBQU0sV0FBMkI7QUFBQSxNQUNoQyxTQUFTO0FBQUEsTUFDVDtBQUFBLE1BQ0EsV0FBVztBQUFBLE1BQ1gsUUFBUSxFQUFFLFVBQVUsUUFBUSxXQUFXLEVBQUU7QUFBQSxNQUN6QyxpQkFBaUI7QUFBQSxJQUNsQjtBQUNBLFNBQUssbUJBQW1CLEtBQUssUUFBUTtBQUNyQyxTQUFLLFNBQVMsS0FBSztBQUNuQixRQUFJLEtBQUssUUFBUTtBQUNoQixXQUFLLGFBQWEsS0FBSyxLQUFLLE1BQU07QUFBQSxJQUNuQztBQUNBLFNBQUssa0JBQWtCLEtBQUssUUFBUTtBQUFBLEVBQ3JDO0FBQ0Q7QUFFQSxNQUFNLHVCQUF1QixLQUF1QixFQUFFO0FBQUEsRUFNckQsWUFBNkIsY0FBMEMsV0FBVyxVQUFVLGtCQUFpQyxTQUFTLG1CQUFtQixNQUFNO0FBQzlKLFVBQU07QUFEc0I7QUFMN0IsU0FBUyxhQUE4QyxDQUFDO0FBT3ZELFNBQUssbUJBQW1CLGdCQUFnQixNQUFNLGtCQUFrQixFQUFFLGdCQUFnQixJQUF3QixNQUFTO0FBQ25ILFNBQUssWUFBWTtBQUFBLE1BQ2hCLE9BQU87QUFBQSxRQUNOLFFBQVEsQ0FBQztBQUFBLFVBQ1I7QUFBQSxVQUNBLGFBQWE7QUFBQSxVQUNiLGFBQWE7QUFBQSxVQUNiLFFBQVEsQ0FBQztBQUFBLFVBQ1QsY0FBYyxtQkFBbUIsRUFBRSw0QkFBNEIsRUFBRSxrQkFBa0IsS0FBSyxFQUFFLElBQUksQ0FBQztBQUFBLFFBQ2hHLENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxlQUFlO0FBQUEsTUFDZixhQUFhLE1BQU07QUFBQSxNQUNuQixtQkFBbUIsTUFBTTtBQUFBLE1BQ3pCLGtCQUFrQixNQUFNO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQUEsRUFFQSxtQkFBbUIsaUJBQStCO0FBQ2pELFNBQUssaUJBQWlCLElBQUksRUFBRSxnQkFBZ0IsR0FBdUIsTUFBUztBQUFBLEVBQzdFO0FBQUEsRUFFUyxTQUFTLFVBQWtCLFFBQTJEO0FBQzlGLFFBQUksT0FBTyxTQUFTLFdBQVcsOEJBQThCLE9BQU8sU0FBUyxXQUFXLGdDQUFnQztBQUN2SCxXQUFLLFdBQVcsS0FBSyxNQUFNO0FBQzNCLFdBQUssYUFBYSxnQkFBZ0IsTUFBTTtBQUFBLElBQ3pDO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxnREFBZ0QsTUFBTTtBQUMzRCxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELFFBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCO0FBQzVDLFFBQU0sVUFBVSxJQUFJLEtBQUssb0JBQW9CO0FBQzdDLFFBQU0sV0FBVyxJQUFJLEtBQUsscUJBQXFCO0FBQy9DLFFBQU0sUUFBUSxJQUFJLEtBQUssa0JBQWtCO0FBQ3pDLFFBQU0sUUFBUSxJQUFJLEtBQUssa0JBQWtCO0FBQ3pDLFFBQU0sZ0JBQWdCLElBQUksS0FBSyxnQ0FBZ0M7QUFFL0QsV0FBUyxtQkFDUixVQUF3RCxNQUN4RCxVQUFVLENBQUMsVUFBVSxLQUFLLEdBQzFCLDhCQUFtRSxNQUFNLE1BQ3pFLDRCQUF5QyxNQUFNLE1BQzlDO0FBQ0QsVUFBTSwwQkFBMEIsSUFBSSxjQUFjLEtBQStCLEVBQUU7QUFBQSxNQUEvQztBQUFBO0FBQ25DLGFBQWtCLDhCQUE4QjtBQUFBO0FBQUEsTUFDdkMsZUFBMkI7QUFDbkMsZUFBTztBQUFBLFVBQ04sSUFBSTtBQUFBLFVBQ0osZUFBZTtBQUFBLFVBQ2YsU0FBUyxRQUFRLElBQUksQ0FBQyxLQUFLLFdBQVcsRUFBRSxLQUFLLE9BQU8sTUFBTSxJQUFJLE1BQU0sWUFBWSxVQUFRLElBQUksU0FBUyxLQUFLLElBQUksRUFBRSxFQUFzQjtBQUFBLFFBQ3ZJO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxVQUFNLGVBQWUsSUFBSSxjQUFjLEtBQXVDLEVBQUU7QUFBQSxNQUF2RDtBQUFBO0FBQ3hCLGFBQWtCLG1CQUFtQixNQUFNO0FBQzNDLGFBQWtCLDRCQUE0QjtBQUFBO0FBQUEsTUFDOUMsTUFBZSxnQkFBZ0IsS0FBVTtBQUFFLGVBQU8sRUFBRSxLQUFLLFNBQVMsT0FBTyxPQUFPLFlBQVksYUFBYSxRQUFRLElBQUksU0FBUztBQUFBLE1BQUc7QUFBQSxJQUNsSTtBQUNBLFVBQU0scUJBQXFCLEVBQUUsa0JBQWtCLE9BQU8saUJBQWlCLE9BQVU7QUFDakYsVUFBTSxxQkFBcUIsSUFBSSxjQUFjLEtBQTBCLEVBQUU7QUFBQSxNQUExQztBQUFBO0FBQzlCLGFBQWtCLFNBQVM7QUFBQTtBQUFBLElBQzVCO0FBQ0EsV0FBTyxZQUFZLElBQUksSUFBSTtBQUFBLE1BQzFCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLGVBQWU7QUFBQSxJQUNwQixDQUFDO0FBQUEsRUFDRjtBQUVBLFdBQVMsbUJBQW1CLFdBQVcsTUFBa0M7QUFDeEUsVUFBTSxVQUFVO0FBQUEsTUFDZixVQUFVLFFBQVEsU0FBUztBQUFBLE1BQzNCLFVBQVU7QUFBQSxNQUNWLE9BQU87QUFBQSxNQUNQLFFBQVEsY0FBYztBQUFBLE1BQ3RCLFlBQVcsb0JBQUksS0FBSyxHQUFFLFlBQVk7QUFBQSxNQUNsQyxhQUFZLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQUEsTUFDbkMsb0JBQW9CLENBQUMsUUFBUSxTQUFTLEdBQUcsU0FBUyxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFBQSxNQUM5RSxPQUFPLDZCQUE2QixRQUFXLEVBQUUsZUFBZSxjQUFjLFNBQVMsRUFBRSxDQUFDO0FBQUEsSUFDM0Y7QUFDQSxVQUFNLGNBQWMsb0JBQW9CLFFBQVEsU0FBUyxDQUFDO0FBQzFELFVBQU0sUUFBc0I7QUFBQSxNQUMzQixHQUFHLG1CQUFtQixPQUFPO0FBQUEsTUFDN0IsV0FBVyxpQkFBaUI7QUFBQSxNQUM1QixPQUFPLENBQUMseUJBQXlCLFNBQVMsV0FBVyxDQUFDO0FBQUEsTUFDdEQ7QUFBQSxJQUNEO0FBQ0EsV0FBTyxZQUFZLElBQUksSUFBSSwyQkFBMkIsV0FBVyxRQUFRLE1BQVMsQ0FBQztBQUFBLEVBQ3BGO0FBRUEsT0FBSyxtRkFBbUYsWUFBWTtBQUNuRyxVQUFNLGVBQWUsbUJBQW1CO0FBQ3hDLFVBQU0sZUFBZSxtQkFBbUI7QUFDeEMsVUFBTSxhQUFhLElBQUksZUFBZSxZQUFZO0FBQ2xELGdCQUFZLElBQUksYUFBYSxTQUFTLEVBQUUsU0FBUyxVQUFVLFVBQVUsWUFBWSxhQUFhLENBQUMsQ0FBQztBQUVoRyxVQUFNLGFBQWEsVUFBVSxTQUFTLGtCQUFrQixJQUFJO0FBQzVELFVBQU0sYUFBYSxVQUFVLFNBQVMsa0JBQWtCLElBQUk7QUFFNUQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixTQUFTLFdBQVc7QUFBQSxNQUNwQixXQUFXLGFBQWEsT0FBTztBQUFBLE1BQy9CLFdBQVcsYUFBYSxlQUFlO0FBQUEsSUFDeEMsR0FBRztBQUFBLE1BQ0YsU0FBUztBQUFBLFFBQ1IsRUFBRSxNQUFNLFdBQVcsNEJBQTRCLFdBQVcsTUFBTSxTQUFTLEVBQUU7QUFBQSxRQUMzRSxFQUFFLE1BQU0sV0FBVyxnQ0FBZ0MsV0FBVyxNQUFNLFNBQVMsRUFBRTtBQUFBLE1BQ2hGO0FBQUEsTUFDQSxXQUFXLENBQUMsUUFBUSxTQUFTLEdBQUcsU0FBUyxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFBQSxNQUNyRSxXQUFXLENBQUMsUUFBUSxTQUFTLEdBQUcsU0FBUyxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFBQSxJQUN0RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLGVBQWUsbUJBQW1CLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFDeEQsVUFBTSxlQUFlLG1CQUFtQjtBQUN4QyxVQUFNLGFBQWEsSUFBSSxlQUFlLFlBQVk7QUFDbEQsZ0JBQVksSUFBSSxhQUFhLFNBQVMsRUFBRSxTQUFTLFVBQVUsVUFBVSxZQUFZLGFBQWEsQ0FBQyxDQUFDO0FBRWhHLFVBQU0sYUFBYSxVQUFVLFNBQVMsa0JBQWtCLElBQUk7QUFFNUQsV0FBTyxnQkFBZ0IsV0FBVyxZQUFZO0FBQUEsTUFDN0MsRUFBRSxNQUFNLFdBQVcsZ0NBQWdDLFdBQVcsTUFBTSxTQUFTLEVBQUU7QUFBQSxJQUNoRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrREFBK0QsWUFBWTtBQUMvRSxVQUFNLGVBQWUsbUJBQW1CO0FBQ3hDLFVBQU0sZUFBZSxtQkFBbUI7QUFDeEMsVUFBTSxhQUFhLElBQUksZUFBZSxjQUFjLFVBQVUsU0FBUyxLQUFLO0FBQzVFLGdCQUFZLElBQUksYUFBYSxTQUFTLEVBQUUsU0FBUyxVQUFVLFVBQVUsWUFBWSxhQUFhLENBQUMsQ0FBQztBQUVoRyxVQUFNLGFBQWEsVUFBVSxTQUFTLGtCQUFrQixJQUFJO0FBRTVELFdBQU8sZ0JBQWdCLFdBQVcsWUFBWSxDQUFDLENBQUM7QUFBQSxFQUNqRCxDQUFDO0FBRUQsT0FBSywrRUFBK0UsWUFBWTtBQUMvRixVQUFNLGVBQWUsbUJBQW1CO0FBQ3hDLFVBQU0sZUFBZSxtQkFBbUIsS0FBSztBQUM3QyxVQUFNLFFBQVEsbUJBQW1CLEVBQUU7QUFDbkMsVUFBTSxhQUFhLElBQUksZUFBZSxZQUFZO0FBQ2xELGdCQUFZLElBQUksYUFBYSxTQUFTLEVBQUUsU0FBUyxVQUFVLFVBQVUsWUFBWSxhQUFhLENBQUMsQ0FBQztBQUVoRyxpQkFBYSxRQUFRLEtBQUs7QUFDMUIsVUFBTSxRQUFRLENBQUM7QUFFZixXQUFPLGdCQUFnQixXQUFXLFlBQVk7QUFBQSxNQUM3QyxFQUFFLE1BQU0sV0FBVyw0QkFBNEIsV0FBVyxNQUFNLFNBQVMsRUFBRTtBQUFBLE1BQzNFLEVBQUUsTUFBTSxXQUFXLGdDQUFnQyxXQUFXLE1BQU0sU0FBUyxFQUFFO0FBQUEsSUFDaEYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOERBQThELFlBQVk7QUFDOUUsVUFBTSxVQUFVLENBQUMsUUFBUTtBQUN6QixVQUFNLDhCQUE4QixZQUFZLElBQUksSUFBSSxRQUFzQyxDQUFDO0FBQy9GLFVBQU0sZUFBZSxtQkFBbUIsTUFBTSxTQUFTLDRCQUE0QixLQUFLO0FBQ3hGLFVBQU0sZUFBZSxtQkFBbUI7QUFDeEMsVUFBTSxhQUFhLElBQUksZUFBZSxZQUFZO0FBQ2xELGdCQUFZLElBQUksYUFBYSxTQUFTLEVBQUUsU0FBUyxVQUFVLFVBQVUsWUFBWSxhQUFhLENBQUMsQ0FBQztBQUVoRyxVQUFNLFFBQVEsQ0FBQztBQUNmLFdBQU8sZ0JBQWdCLFdBQVcsWUFBWTtBQUFBLE1BQzdDLEVBQUUsTUFBTSxXQUFXLGdDQUFnQyxXQUFXLE1BQU0sU0FBUyxFQUFFO0FBQUEsSUFDaEYsQ0FBQztBQUVELFlBQVEsS0FBSyxLQUFLO0FBQ2xCLGdDQUE0QixLQUFLLEVBQUUsT0FBTyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDLEVBQUUsQ0FBQztBQUN4RSxVQUFNLFFBQVEsQ0FBQztBQUNmLFdBQU8sZ0JBQWdCLFdBQVcsWUFBWTtBQUFBLE1BQzdDLEVBQUUsTUFBTSxXQUFXLGdDQUFnQyxXQUFXLE1BQU0sU0FBUyxFQUFFO0FBQUEsTUFDL0UsRUFBRSxNQUFNLFdBQVcsNEJBQTRCLFdBQVcsTUFBTSxTQUFTLEVBQUU7QUFBQSxJQUM1RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpRUFBaUUsWUFBWTtBQUNqRixVQUFNLGVBQWUsbUJBQW1CO0FBQ3hDLFVBQU0sZUFBZSxtQkFBbUI7QUFDeEMsVUFBTSxhQUFhLElBQUksZUFBZSxjQUFjLFVBQVUsT0FBTztBQUNyRSxnQkFBWSxJQUFJLGFBQWEsU0FBUyxFQUFFLFNBQVMsVUFBVSxVQUFVLFlBQVksYUFBYSxDQUFDLENBQUM7QUFFaEcsVUFBTSxhQUFhLFVBQVUsU0FBUyxrQkFBa0IsSUFBSTtBQUU1RCxXQUFPLGdCQUFnQixXQUFXLFlBQVksQ0FBQyxDQUFDO0FBQUEsRUFDakQsQ0FBQztBQUVELE9BQUssdUVBQXVFLFlBQVk7QUFDdkYsVUFBTSxlQUFlLG1CQUFtQjtBQUN4QyxVQUFNLGVBQWUsbUJBQW1CO0FBQ3hDLFVBQU0sYUFBYSxJQUFJLGVBQWUsY0FBYyxVQUFVLElBQUk7QUFDbEUsZ0JBQVksSUFBSSxhQUFhLFNBQVMsRUFBRSxTQUFTLFVBQVUsVUFBVSxZQUFZLGFBQWEsQ0FBQyxDQUFDO0FBRWhHLFVBQU0sUUFBUSxDQUFDO0FBQ2YsV0FBTyxnQkFBZ0IsV0FBVyxZQUFZLENBQUMsQ0FBQztBQUVoRCxlQUFXLG1CQUFtQixPQUFPO0FBQ3JDLFVBQU0sUUFBUSxDQUFDO0FBRWYsV0FBTyxnQkFBZ0IsV0FBVyxZQUFZO0FBQUEsTUFDN0MsRUFBRSxNQUFNLFdBQVcsNEJBQTRCLFdBQVcsTUFBTSxTQUFTLEVBQUU7QUFBQSxNQUMzRSxFQUFFLE1BQU0sV0FBVyxnQ0FBZ0MsV0FBVyxNQUFNLFNBQVMsRUFBRTtBQUFBLElBQ2hGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtFQUFrRSxZQUFZO0FBQ2xGLFFBQUksVUFBVTtBQUNkLFVBQU0sNEJBQTRCLFlBQVksSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUNyRSxVQUFNLGVBQWUsbUJBQW1CLE1BQU0sU0FBUyxRQUFXLFFBQVcsMEJBQTBCLEtBQUs7QUFDNUcsVUFBTSxlQUFlLG1CQUFtQjtBQUN4QyxVQUFNLGFBQWEsSUFBSSxlQUFlLFlBQVk7QUFDbEQsZ0JBQVksSUFBSSxhQUFhLFNBQVMsRUFBRSxTQUFTLFVBQVUsVUFBVSxZQUFZLGFBQWEsQ0FBQyxDQUFDO0FBRWhHLFVBQU0sT0FBTyxRQUFRLGFBQWEsVUFBVSxTQUFTLGtCQUFrQixJQUFJLEdBQUcsZ0JBQWdCO0FBQzlGLFdBQU8sZ0JBQWdCLFdBQVcsWUFBWTtBQUFBLE1BQzdDLEVBQUUsTUFBTSxXQUFXLGdDQUFnQyxXQUFXLE1BQU0sU0FBUyxFQUFFO0FBQUEsSUFDaEYsQ0FBQztBQUVELGNBQVU7QUFDViw4QkFBMEIsS0FBSztBQUMvQixVQUFNLFFBQVEsQ0FBQztBQUNmLFdBQU8sZ0JBQWdCLFdBQVcsWUFBWTtBQUFBLE1BQzdDLEVBQUUsTUFBTSxXQUFXLGdDQUFnQyxXQUFXLE1BQU0sU0FBUyxFQUFFO0FBQUEsTUFDL0UsRUFBRSxNQUFNLFdBQVcsNEJBQTRCLFdBQVcsTUFBTSxTQUFTLEVBQUU7QUFBQSxJQUM1RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtRkFBbUYsWUFBWTtBQUNuRyxRQUFJO0FBQ0osVUFBTSxlQUFlLElBQUksUUFBYyxhQUFXLGVBQWUsT0FBTztBQUN4RSxRQUFJO0FBQ0osVUFBTSxlQUFlLElBQUksUUFBYyxhQUFXLHFCQUFxQixPQUFPO0FBQzlFLFVBQU0sZUFBZSxtQkFBbUIsWUFBWTtBQUNuRCx5QkFBbUI7QUFDbkIsWUFBTTtBQUNOLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxVQUFNLGVBQWUsbUJBQW1CO0FBQ3hDLFVBQU0sYUFBYSxJQUFJLGVBQWUsWUFBWTtBQUNsRCxVQUFNLGVBQWUsYUFBYSxTQUFTLEVBQUUsU0FBUyxVQUFVLFVBQVUsWUFBWSxhQUFhLENBQUM7QUFFcEcsVUFBTTtBQUNOLGlCQUFhLFFBQVE7QUFDckIsVUFBTSxrQkFBa0IsYUFBYSxVQUFVLFNBQVMsa0JBQWtCLElBQUk7QUFDOUUsaUJBQWE7QUFDYixVQUFNO0FBRU4sV0FBTyxnQkFBZ0IsV0FBVyxZQUFZLENBQUMsQ0FBQztBQUFBLEVBQ2pELENBQUM7QUFFRCxPQUFLLGtFQUFrRSxZQUFZO0FBQ2xGLFVBQU0sZUFBZSxtQkFBbUI7QUFDeEMsVUFBTSxlQUFlLG1CQUFtQjtBQUN4QyxVQUFNLGFBQWEsSUFBSSxlQUFlLFlBQVk7QUFDbEQsZ0JBQVksSUFBSSxhQUFhLFNBQVMsRUFBRSxTQUFTLFVBQVUsVUFBVSxZQUFZLGFBQWEsQ0FBQyxDQUFDO0FBRWhHLFVBQU0sYUFBYSxVQUFVLFNBQVMsa0JBQWtCLElBQUk7QUFDNUQsaUJBQWEsT0FBTyxXQUFXLFdBQVcsQ0FBQyxDQUFDO0FBQzVDLFVBQU0sUUFBUSxDQUFDO0FBRWYsV0FBTyxZQUFZLFdBQVcsV0FBVyxRQUFRLENBQUM7QUFBQSxFQUNuRCxDQUFDO0FBRUQsT0FBSyx1RUFBdUUsWUFBWTtBQUN2RixVQUFNLGVBQWUsbUJBQW1CO0FBQ3hDLFVBQU0sZUFBZSxtQkFBbUI7QUFDeEMsVUFBTSxhQUFhLElBQUksZUFBZSxjQUFjLFlBQVk7QUFDaEUsZ0JBQVksSUFBSSxhQUFhLFNBQVMsRUFBRSxTQUFTLFVBQVUsY0FBYyxZQUFZLGFBQWEsQ0FBQyxDQUFDO0FBRXBHLFVBQU0sYUFBYSxVQUFVLFNBQVMsa0JBQWtCLElBQUk7QUFFNUQsV0FBTyxnQkFBZ0IsV0FBVyxZQUFZO0FBQUEsTUFDN0MsRUFBRSxNQUFNLFdBQVcsNEJBQTRCLFdBQVcsTUFBTSxTQUFTLEVBQUU7QUFBQSxNQUMzRSxFQUFFLE1BQU0sV0FBVyxnQ0FBZ0MsV0FBVyxNQUFNLFNBQVMsRUFBRTtBQUFBLElBQ2hGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
