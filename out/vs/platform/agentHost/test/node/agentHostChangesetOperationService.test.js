import assert from "assert";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { buildBranchChangesetUri, buildCompareTurnsChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri } from "../../common/changesetUri.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { JsonRpcErrorCodes } from "../../common/state/sessionProtocol.js";
import { ChangesetOperationScope, ChangesetOperationStatus, MessageKind, SessionStatus, buildDefaultChatUri } from "../../common/state/sessionState.js";
import { AgentHostChangesetOperationService } from "../../node/agentHostChangesetOperationService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostChangesetSubscriptionService } from "../../node/agentHostChangesetSubscriptionService.js";
const testOperationId = "test-operation";
class TestHandler {
  constructor() {
    this.calls = 0;
    this.pending = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }
  invoke(_params, _token) {
    this.calls++;
    return this.pending;
  }
  complete(result) {
    this._resolve?.(result);
  }
  fail(error) {
    this._reject?.(error);
  }
}
class TestContribution {
  constructor(handler) {
    this.handler = handler;
  }
  registerHandlers(registry) {
    const store = new DisposableStore();
    store.add(registry.registerChangesetOperationHandler(testOperationId, this.handler));
    return store;
  }
  getOperations(_context) {
    return void 0;
  }
  dispose() {
  }
}
class TestGitStateService {
  constructor() {
    this.onDidRefreshSessionGitState = Event.None;
    this.onDidChangeSessionGitHubState = Event.None;
  }
  async refreshSessionGitState(_sessionKey, _workingDirectory) {
  }
  async resolveSessionBaseBranchName() {
    return void 0;
  }
  async getSessionGitHubState(_sessionKey) {
    return void 0;
  }
  async setSessionGitHubState(_sessionKey, _state) {
  }
  async recordSessionMerge(_sessionKey, _commit) {
  }
  async attachSessionGitHubPullRequest(_sessionKey) {
  }
  async attachSessionGitHubReferences(_sessionKey, _text) {
  }
}
class TestConfigurationService {
  constructor(_workingDirectories) {
    this._workingDirectories = _workingDirectories;
    this.onDidRootConfigChange = Event.None;
    this.onDidSessionConfigChange = Event.None;
    this.onDidChangeWorkingDirectoryPending = Event.None;
  }
  setWorkingDirectories(workingDirectories) {
    this._workingDirectories = workingDirectories;
  }
  getEffectiveWorkingDirectories(_session) {
    return this._workingDirectories;
  }
  getEffectiveWorkingDirectory(_session) {
    return this._workingDirectories?.[0];
  }
  getEffectiveValue() {
    return void 0;
  }
  isWorkingDirectoryPending() {
    return false;
  }
  async resolveWorkingDirectoryForResume(_session, workingDirectory) {
    return workingDirectory;
  }
  updateSessionConfig() {
  }
  getSessionConfigValues() {
    return void 0;
  }
  getRootValue() {
    return void 0;
  }
  updateRootConfig() {
  }
  persistRootConfig() {
  }
  async whenIdle() {
  }
}
class OperationsContribution {
  constructor(operations) {
    this.operations = operations;
  }
  registerHandlers(_registry) {
    return Disposable.None;
  }
  getOperations(_context) {
    return this.operations;
  }
  dispose() {
  }
}
const sampleGitState = { branchName: "feature" };
const sampleOperations = [
  { id: testOperationId, label: "Commit", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }
];
suite("AgentHostChangesetOperationService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createService(stateManager, configurationService = new TestConfigurationService(void 0)) {
    return disposables.add(new AgentHostChangesetOperationService(
      stateManager,
      new TestGitStateService(),
      new AgentHostChangesetSubscriptionService(),
      configurationService
    ));
  }
  test("multi-folder session advertises no operations for a turn changeset", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const service = createService(stateManager, new TestConfigurationService(["file:///a", "file:///b"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const operations = service.getOperations(sessionKey, buildTurnChangesetUri(sessionKey, "turn-1"), sampleGitState);
    assert.deepStrictEqual(operations, []);
  });
  test("preserves contribution order when pull-request and merge operations coexist", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const service = createService(stateManager);
    disposables.add(service.registerContribution(new OperationsContribution([
      { id: "create-pr", label: "Create PR", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle },
      { id: "create-draft-pr", label: "Create Draft PR", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }
    ])));
    disposables.add(service.registerContribution(new OperationsContribution([
      { id: "merge", label: "Merge Changes", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }
    ])));
    const operations = service.getOperations(sessionKey, buildBranchChangesetUri(sessionKey), sampleGitState);
    assert.deepStrictEqual(operations.map((operation) => operation.id), ["create-pr", "create-draft-pr", "merge"]);
  });
  test("multi-folder session advertises no operations for a compare-turns changeset", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const service = createService(stateManager, new TestConfigurationService(["file:///a", "file:///b"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const operations = service.getOperations(sessionKey, buildCompareTurnsChangesetUri(sessionKey, "turn-1", "turn-2"), sampleGitState);
    assert.deepStrictEqual(operations, []);
  });
  test("multi-folder session dispatches empty operations for a turn changeset via updateOperations", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildTurnChangesetUri(sessionKey, "turn-1");
    stateManager.registerChangeset(changesetUri);
    const service = createService(stateManager, new TestConfigurationService(["file:///a", "file:///b"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
        dispatched.push(envelope.action.operations);
      }
    }));
    service.updateOperations(sessionKey, changesetUri, sampleGitState);
    assert.deepStrictEqual(dispatched, [[]]);
  });
  test("multi-folder session dispatches empty operations for a compare-turns changeset via updateOperations", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildCompareTurnsChangesetUri(sessionKey, "turn-1", "turn-2");
    stateManager.registerChangeset(changesetUri);
    const service = createService(stateManager, new TestConfigurationService(["file:///a", "file:///b"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
        dispatched.push(envelope.action.operations);
      }
    }));
    service.updateOperations(sessionKey, changesetUri, sampleGitState);
    assert.deepStrictEqual(dispatched, [[]]);
  });
  test("single-folder session advertises turn operations via updateOperations", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildTurnChangesetUri(sessionKey, "turn-1");
    stateManager.registerChangeset(changesetUri);
    const service = createService(stateManager, new TestConfigurationService(["file:///a"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
        dispatched.push(envelope.action.operations);
      }
    }));
    service.updateOperations(sessionKey, changesetUri, sampleGitState);
    assert.deepStrictEqual(dispatched, [sampleOperations]);
  });
  test("multi-folder session clears turn operations even when git state is absent", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildTurnChangesetUri(sessionKey, "turn-1");
    stateManager.registerChangeset(changesetUri);
    const service = createService(stateManager, new TestConfigurationService(["file:///a", "file:///b"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
        dispatched.push(envelope.action.operations);
      }
    }));
    service.updateOperations(sessionKey, changesetUri);
    assert.deepStrictEqual(dispatched, [[]]);
  });
  test("single-folder session with absent git state does not dispatch (no premature clear)", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildTurnChangesetUri(sessionKey, "turn-1");
    stateManager.registerChangeset(changesetUri);
    const service = createService(stateManager, new TestConfigurationService(["file:///a"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
        dispatched.push(envelope.action.operations);
      }
    }));
    service.updateOperations(sessionKey, changesetUri);
    assert.deepStrictEqual(dispatched, []);
  });
  test("multi-folder session with absent git state defers a non-suppressed changeset (no over-clear)", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildUncommittedChangesetUri(sessionKey);
    stateManager.registerChangeset(changesetUri);
    const service = createService(stateManager, new TestConfigurationService(["file:///a", "file:///b"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
        dispatched.push(envelope.action.operations);
      }
    }));
    service.updateOperations(sessionKey, changesetUri);
    assert.deepStrictEqual(dispatched, []);
  });
  test("turn changeset re-dispatches empty on entering multi-root and restores on returning to single-root", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildTurnChangesetUri(sessionKey, "turn-1");
    stateManager.registerChangeset(changesetUri);
    const configurationService = new TestConfigurationService(["file:///a"]);
    const service = createService(stateManager, configurationService);
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === changesetUri && envelope.action.type === ActionType.ChangesetOperationsChanged) {
        dispatched.push(envelope.action.operations);
      }
    }));
    service.updateOperations(sessionKey, changesetUri, sampleGitState);
    configurationService.setWorkingDirectories(["file:///a", "file:///b"]);
    service.updateOperations(sessionKey, changesetUri, sampleGitState);
    configurationService.setWorkingDirectories(["file:///a"]);
    service.updateOperations(sessionKey, changesetUri, sampleGitState);
    assert.deepStrictEqual(dispatched, [sampleOperations, [], sampleOperations]);
  });
  test("single-folder session keeps operations for turn and compare-turns changesets", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const service = createService(stateManager, new TestConfigurationService(["file:///a"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const turnOperations = service.getOperations(sessionKey, buildTurnChangesetUri(sessionKey, "turn-1"), sampleGitState);
    const compareOperations = service.getOperations(sessionKey, buildCompareTurnsChangesetUri(sessionKey, "turn-1", "turn-2"), sampleGitState);
    assert.deepStrictEqual(turnOperations, sampleOperations);
    assert.deepStrictEqual(compareOperations, sampleOperations);
  });
  test("multi-folder session keeps operations for branch and uncommitted changesets", () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const service = createService(stateManager, new TestConfigurationService(["file:///a", "file:///b"]));
    disposables.add(service.registerContribution(new OperationsContribution(sampleOperations)));
    const branchOperations = service.getOperations(sessionKey, buildBranchChangesetUri(sessionKey), sampleGitState);
    const uncommittedOperations = service.getOperations(sessionKey, buildUncommittedChangesetUri(sessionKey), sampleGitState);
    assert.deepStrictEqual(branchOperations, sampleOperations);
    assert.deepStrictEqual(uncommittedOperations, sampleOperations);
  });
  test("joins duplicate in-flight invocations for the same changeset operation", async () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildUncommittedChangesetUri(sessionKey);
    stateManager.registerChangeset(changesetUri);
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetOperationsChanged,
      operations: [{ id: testOperationId, label: "Commit", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }]
    });
    const service = createService(stateManager);
    const handler = new TestHandler();
    disposables.add(service.registerContribution(new TestContribution(handler)));
    const params = { channel: changesetUri, operationId: testOperationId };
    const first = service.invokeChangesetOperation(params);
    assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Running);
    const second = service.invokeChangesetOperation(params);
    handler.complete({ message: { markdown: "Committed" } });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.deepStrictEqual({ calls: handler.calls, firstResult, secondResult }, {
      calls: 1,
      firstResult: { message: { markdown: "Committed" } },
      secondResult: { message: { markdown: "Committed" } }
    });
  });
  test("publishes running and idle state around a successful changeset operation", async () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildUncommittedChangesetUri(sessionKey);
    stateManager.registerChangeset(changesetUri);
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetOperationsChanged,
      operations: [{ id: testOperationId, label: "Commit", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }]
    });
    const service = createService(stateManager);
    const handler = new TestHandler();
    disposables.add(service.registerContribution(new TestContribution(handler)));
    const invocation = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId });
    assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Running);
    handler.complete({ message: { markdown: "Committed" } });
    await invocation;
    assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Idle);
  });
  test("rejects invocation of a disabled changeset operation without calling the handler", async () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildUncommittedChangesetUri(sessionKey);
    stateManager.registerChangeset(changesetUri);
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetOperationsChanged,
      operations: [{ id: testOperationId, label: "Commit", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Disabled }]
    });
    const service = createService(stateManager);
    const handler = new TestHandler();
    disposables.add(service.registerContribution(new TestContribution(handler)));
    const error = await service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId }).then(void 0, (error2) => error2);
    assert.match(error.message, /is disabled/);
    assert.strictEqual(handler.calls, 0);
    assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Disabled);
  });
  test("rejects invocation while a turn is active even if the advertised status is idle", async () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildUncommittedChangesetUri(sessionKey);
    const summary = {
      resource: sessionKey,
      provider: "copilot",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    stateManager.createSession(summary);
    stateManager.registerChangeset(changesetUri);
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetOperationsChanged,
      operations: [{ id: testOperationId, label: "Commit", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }]
    });
    stateManager.dispatchServerAction(buildDefaultChatUri(sessionKey), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hi", origin: { kind: MessageKind.User } }
    });
    const service = createService(stateManager);
    const handler = new TestHandler();
    disposables.add(service.registerContribution(new TestContribution(handler)));
    const error = await service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId }).then(void 0, (error2) => error2);
    assert.match(error.message, /disabled while a turn is active/);
    assert.strictEqual(handler.calls, 0);
    assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Idle);
  });
  test("rejects invocation of a stale turn operation once the session is multi-root", async () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildTurnChangesetUri(sessionKey, "turn-1");
    stateManager.registerChangeset(changesetUri);
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetOperationsChanged,
      operations: [{ id: testOperationId, label: "Sync", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }]
    });
    const service = createService(stateManager, new TestConfigurationService(["file:///a", "file:///b"]));
    const handler = new TestHandler();
    disposables.add(service.registerContribution(new TestContribution(handler)));
    const error = await service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId }).then(void 0, (error2) => error2);
    assert.match(error.message, /multi-root session/);
    assert.strictEqual(error.code, JsonRpcErrorCodes.InvalidParams);
    assert.strictEqual(handler.calls, 0);
  });
  test("allows invocation of a turn operation in a single-root session", async () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildTurnChangesetUri(sessionKey, "turn-1");
    stateManager.registerChangeset(changesetUri);
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetOperationsChanged,
      operations: [{ id: testOperationId, label: "Sync", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }]
    });
    const service = createService(stateManager, new TestConfigurationService(["file:///a"]));
    const handler = new TestHandler();
    disposables.add(service.registerContribution(new TestContribution(handler)));
    const invocation = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId });
    handler.complete({ message: { markdown: "Synced" } });
    const result = await invocation;
    assert.deepStrictEqual({ calls: handler.calls, result }, { calls: 1, result: { message: { markdown: "Synced" } } });
  });
  test("allows invocation of an uncommitted operation while multi-root (only turn/compare are suppressed)", async () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildUncommittedChangesetUri(sessionKey);
    stateManager.registerChangeset(changesetUri);
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetOperationsChanged,
      operations: [{ id: testOperationId, label: "Commit", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }]
    });
    const service = createService(stateManager, new TestConfigurationService(["file:///a", "file:///b"]));
    const handler = new TestHandler();
    disposables.add(service.registerContribution(new TestContribution(handler)));
    const invocation = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId });
    handler.complete({ message: { markdown: "Committed" } });
    const result = await invocation;
    assert.deepStrictEqual({ calls: handler.calls, result }, { calls: 1, result: { message: { markdown: "Committed" } } });
  });
  test("publishes running and error state when a changeset operation fails", async () => {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const sessionKey = "agent:/session";
    const changesetUri = buildUncommittedChangesetUri(sessionKey);
    stateManager.registerChangeset(changesetUri);
    stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetOperationsChanged,
      operations: [{ id: testOperationId, label: "Commit", scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }]
    });
    const service = createService(stateManager);
    const handler = new TestHandler();
    disposables.add(service.registerContribution(new TestContribution(handler)));
    const invocation = service.invokeChangesetOperation({ channel: changesetUri, operationId: testOperationId });
    assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Running);
    const failure = invocation.then(void 0, (error2) => error2);
    handler.fail(new Error("Boom"));
    const error = await failure;
    assert.match(error.message, /Boom/);
    assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].status, ChangesetOperationStatus.Error);
    assert.strictEqual(stateManager.getChangesetState(changesetUri)?.operations?.[0].error?.message, "Boom");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHR5cGUgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ2hhbmdlc2V0T3BlcmF0aW9uQ29udHJpYnV0aW9uLCBJQ2hhbmdlc2V0T3BlcmF0aW9uQ29udGV4dCwgSUNoYW5nZXNldE9wZXJhdGlvbkhhbmRsZXIsIElDaGFuZ2VzZXRPcGVyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpLCBidWlsZENvbXBhcmVUdXJuc0NoYW5nZXNldFVyaSwgYnVpbGRUdXJuQ2hhbmdlc2V0VXJpLCBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IEludm9rZUNoYW5nZXNldE9wZXJhdGlvblBhcmFtcywgSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLWNoYW5nZXNldC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IEpzb25ScGNFcnJvckNvZGVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzZXRPcGVyYXRpb25TY29wZSwgQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLCBJU2Vzc2lvbkdpdEh1YlN0YXRlLCBJU2Vzc2lvbkdpdFN0YXRlLCBNZXNzYWdlS2luZCwgU2Vzc2lvblN0YXR1cywgYnVpbGREZWZhdWx0Q2hhdFVyaSwgdHlwZSBDaGFuZ2VzZXRPcGVyYXRpb24sIHR5cGUgU2Vzc2lvblN1bW1hcnkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuY29uc3QgdGVzdE9wZXJhdGlvbklkID0gJ3Rlc3Qtb3BlcmF0aW9uJztcblxuY2xhc3MgVGVzdEhhbmRsZXIgaW1wbGVtZW50cyBJQ2hhbmdlc2V0T3BlcmF0aW9uSGFuZGxlciB7XG5cdGNhbGxzID0gMDtcblx0cHJpdmF0ZSBfcmVzb2x2ZTogKCh2YWx1ZTogSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0KSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVqZWN0OiAoKHJlYXNvbj86IHVua25vd24pID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBwZW5kaW5nID0gbmV3IFByb21pc2U8SW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0dGhpcy5fcmVzb2x2ZSA9IHJlc29sdmU7XG5cdFx0dGhpcy5fcmVqZWN0ID0gcmVqZWN0O1xuXHR9KTtcblxuXHRpbnZva2UoX3BhcmFtczogSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQ+IHtcblx0XHR0aGlzLmNhbGxzKys7XG5cdFx0cmV0dXJuIHRoaXMucGVuZGluZztcblx0fVxuXG5cdGNvbXBsZXRlKHJlc3VsdDogSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzb2x2ZT8uKHJlc3VsdCk7XG5cdH1cblxuXHRmYWlsKGVycm9yOiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVqZWN0Py4oZXJyb3IpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RDb250cmlidXRpb24gaW1wbGVtZW50cyBJQ2hhbmdlc2V0T3BlcmF0aW9uQ29udHJpYnV0aW9uIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBoYW5kbGVyOiBJQ2hhbmdlc2V0T3BlcmF0aW9uSGFuZGxlcikgeyB9XG5cblx0cmVnaXN0ZXJIYW5kbGVycyhyZWdpc3RyeTogSUNoYW5nZXNldE9wZXJhdGlvblJlZ2lzdHJ5KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChyZWdpc3RyeS5yZWdpc3RlckNoYW5nZXNldE9wZXJhdGlvbkhhbmRsZXIodGVzdE9wZXJhdGlvbklkLCB0aGlzLmhhbmRsZXIpKTtcblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHRnZXRPcGVyYXRpb25zKF9jb250ZXh0OiBJQ2hhbmdlc2V0T3BlcmF0aW9uQ29udGV4dCk6IHJlYWRvbmx5IENoYW5nZXNldE9wZXJhdGlvbltdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxufVxuXG5jbGFzcyBUZXN0R2l0U3RhdGVTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50SG9zdEdpdFN0YXRlU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkUmVmcmVzaFNlc3Npb25HaXRTdGF0ZSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkdpdEh1YlN0YXRlID0gRXZlbnQuTm9uZTtcblxuXHRhc3luYyByZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKF9zZXNzaW9uS2V5OiBzdHJpbmcsIF93b3JraW5nRGlyZWN0b3J5PzogVVJJKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmVzb2x2ZVNlc3Npb25CYXNlQnJhbmNoTmFtZSgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbkdpdEh1YlN0YXRlKF9zZXNzaW9uS2V5OiBzdHJpbmcpOiBQcm9taXNlPElTZXNzaW9uR2l0SHViU3RhdGUgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgc2V0U2Vzc2lvbkdpdEh1YlN0YXRlKF9zZXNzaW9uS2V5OiBzdHJpbmcsIF9zdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0YXN5bmMgcmVjb3JkU2Vzc2lvbk1lcmdlKF9zZXNzaW9uS2V5OiBzdHJpbmcsIF9jb21taXQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGFzeW5jIGF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChfc2Vzc2lvbktleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgYXR0YWNoU2Vzc2lvbkdpdEh1YlJlZmVyZW5jZXMoX3Nlc3Npb25LZXk6IHN0cmluZywgX3RleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG59XG5cbi8qKlxuICogTWluaW1hbCB0eXBlZCB7QGxpbmsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2V9IHdob3NlIG9ubHkgbWVhbmluZ2Z1bFxuICogYmVoYXZpb3IgaXMgcmV0dXJuaW5nIGEgZml4ZWQgZWZmZWN0aXZlIHdvcmtpbmctZGlyZWN0b3J5IHNldCwgc28gdGVzdHMgY2FuXG4gKiBkcml2ZSB0aGUgbXVsdGktZm9sZGVyIGdhdGUgaW4ge0BsaW5rIEFnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2V9LlxuICovXG5jbGFzcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkUm9vdENvbmZpZ0NoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkU2Vzc2lvbkNvbmZpZ0NoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya2luZ0RpcmVjdG9yeVBlbmRpbmcgPSBFdmVudC5Ob25lO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX3dvcmtpbmdEaXJlY3Rvcmllczogc3RyaW5nW10gfCB1bmRlZmluZWQpIHsgfVxuXG5cdHNldFdvcmtpbmdEaXJlY3Rvcmllcyh3b3JraW5nRGlyZWN0b3JpZXM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzID0gd29ya2luZ0RpcmVjdG9yaWVzO1xuXHR9XG5cblx0Z2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKF9zZXNzaW9uOiBzdHJpbmcpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcztcblx0fVxuXG5cdGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcnkoX3Nlc3Npb246IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHR9XG5cblx0Z2V0RWZmZWN0aXZlVmFsdWUoKTogdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZShfc2Vzc2lvbjogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3J5O1xuXHR9XG5cblx0dXBkYXRlU2Vzc2lvbkNvbmZpZygpOiB2b2lkIHsgfVxuXG5cdGdldFNlc3Npb25Db25maWdWYWx1ZXMoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRSb290VmFsdWUoKTogdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0dXBkYXRlUm9vdENvbmZpZygpOiB2b2lkIHsgfVxuXG5cdHBlcnNpc3RSb290Q29uZmlnKCk6IHZvaWQgeyB9XG5cblx0YXN5bmMgd2hlbklkbGUoKTogUHJvbWlzZTx2b2lkPiB7IH1cbn1cblxuLyoqIENvbnRyaWJ1dGlvbiB0aGF0IGFkdmVydGlzZXMgYSBmaXhlZCBzZXQgb2Ygb3BlcmF0aW9ucyBmb3IgZXZlcnkgY2hhbmdlc2V0LiAqL1xuY2xhc3MgT3BlcmF0aW9uc0NvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElDaGFuZ2VzZXRPcGVyYXRpb25Db250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG9wZXJhdGlvbnM6IHJlYWRvbmx5IENoYW5nZXNldE9wZXJhdGlvbltdKSB7IH1cblxuXHRyZWdpc3RlckhhbmRsZXJzKF9yZWdpc3RyeTogSUNoYW5nZXNldE9wZXJhdGlvblJlZ2lzdHJ5KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHRnZXRPcGVyYXRpb25zKF9jb250ZXh0OiBJQ2hhbmdlc2V0T3BlcmF0aW9uQ29udGV4dCk6IHJlYWRvbmx5IENoYW5nZXNldE9wZXJhdGlvbltdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5vcGVyYXRpb25zO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxufVxuXG5jb25zdCBzYW1wbGVHaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnIH07XG5jb25zdCBzYW1wbGVPcGVyYXRpb25zOiByZWFkb25seSBDaGFuZ2VzZXRPcGVyYXRpb25bXSA9IFtcblx0eyBpZDogdGVzdE9wZXJhdGlvbklkLCBsYWJlbDogJ0NvbW1pdCcsIHNjb3BlczogW0NoYW5nZXNldE9wZXJhdGlvblNjb3BlLkNoYW5nZXNldF0sIHN0YXR1czogQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLklkbGUgfSxcbl07XG5cbnN1aXRlKCdBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2Uoc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UodW5kZWZpbmVkKSk6IEFnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2Uge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UoXG5cdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRuZXcgVGVzdEdpdFN0YXRlU2VydmljZSgpLFxuXHRcdFx0bmV3IEFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UoKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdCkpO1xuXHR9XG5cblx0dGVzdCgnbXVsdGktZm9sZGVyIHNlc3Npb24gYWR2ZXJ0aXNlcyBubyBvcGVyYXRpb25zIGZvciBhIHR1cm4gY2hhbmdlc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9ICdhZ2VudDovc2Vzc2lvbic7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKFsnZmlsZTovLy9hJywgJ2ZpbGU6Ly8vYiddKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IE9wZXJhdGlvbnNDb250cmlidXRpb24oc2FtcGxlT3BlcmF0aW9ucykpKTtcblxuXHRcdGNvbnN0IG9wZXJhdGlvbnMgPSBzZXJ2aWNlLmdldE9wZXJhdGlvbnMoc2Vzc2lvbktleSwgYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKHNlc3Npb25LZXksICd0dXJuLTEnKSwgc2FtcGxlR2l0U3RhdGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVyYXRpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBjb250cmlidXRpb24gb3JkZXIgd2hlbiBwdWxsLXJlcXVlc3QgYW5kIG1lcmdlIG9wZXJhdGlvbnMgY29leGlzdCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSAnYWdlbnQ6L3Nlc3Npb24nO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0YXRlTWFuYWdlcik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IE9wZXJhdGlvbnNDb250cmlidXRpb24oW1xuXHRcdFx0eyBpZDogJ2NyZWF0ZS1wcicsIGxhYmVsOiAnQ3JlYXRlIFBSJywgc2NvcGVzOiBbQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUuQ2hhbmdlc2V0XSwgc3RhdHVzOiBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuSWRsZSB9LFxuXHRcdFx0eyBpZDogJ2NyZWF0ZS1kcmFmdC1wcicsIGxhYmVsOiAnQ3JlYXRlIERyYWZ0IFBSJywgc2NvcGVzOiBbQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUuQ2hhbmdlc2V0XSwgc3RhdHVzOiBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuSWRsZSB9LFxuXHRcdF0pKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IE9wZXJhdGlvbnNDb250cmlidXRpb24oW1xuXHRcdFx0eyBpZDogJ21lcmdlJywgbGFiZWw6ICdNZXJnZSBDaGFuZ2VzJywgc2NvcGVzOiBbQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUuQ2hhbmdlc2V0XSwgc3RhdHVzOiBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuSWRsZSB9LFxuXHRcdF0pKSk7XG5cblx0XHRjb25zdCBvcGVyYXRpb25zID0gc2VydmljZS5nZXRPcGVyYXRpb25zKHNlc3Npb25LZXksIGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb25LZXkpLCBzYW1wbGVHaXRTdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZXJhdGlvbnMubWFwKG9wZXJhdGlvbiA9PiBvcGVyYXRpb24uaWQpLCBbJ2NyZWF0ZS1wcicsICdjcmVhdGUtZHJhZnQtcHInLCAnbWVyZ2UnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLWZvbGRlciBzZXNzaW9uIGFkdmVydGlzZXMgbm8gb3BlcmF0aW9ucyBmb3IgYSBjb21wYXJlLXR1cm5zIGNoYW5nZXNldCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSAnYWdlbnQ6L3Nlc3Npb24nO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShbJ2ZpbGU6Ly8vYScsICdmaWxlOi8vL2InXSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKG5ldyBPcGVyYXRpb25zQ29udHJpYnV0aW9uKHNhbXBsZU9wZXJhdGlvbnMpKSk7XG5cblx0XHRjb25zdCBvcGVyYXRpb25zID0gc2VydmljZS5nZXRPcGVyYXRpb25zKHNlc3Npb25LZXksIGJ1aWxkQ29tcGFyZVR1cm5zQ2hhbmdlc2V0VXJpKHNlc3Npb25LZXksICd0dXJuLTEnLCAndHVybi0yJyksIHNhbXBsZUdpdFN0YXRlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlcmF0aW9ucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aS1mb2xkZXIgc2Vzc2lvbiBkaXNwYXRjaGVzIGVtcHR5IG9wZXJhdGlvbnMgZm9yIGEgdHVybiBjaGFuZ2VzZXQgdmlhIHVwZGF0ZU9wZXJhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gJ2FnZW50Oi9zZXNzaW9uJztcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvbktleSwgJ3R1cm4tMScpO1xuXHRcdHN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChjaGFuZ2VzZXRVcmkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShbJ2ZpbGU6Ly8vYScsICdmaWxlOi8vL2InXSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKG5ldyBPcGVyYXRpb25zQ29udHJpYnV0aW9uKHNhbXBsZU9wZXJhdGlvbnMpKSk7XG5cblx0XHRjb25zdCBkaXNwYXRjaGVkOiAocmVhZG9ubHkgQ2hhbmdlc2V0T3BlcmF0aW9uW10gfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IHtcblx0XHRcdGlmIChlbnZlbG9wZS5jaGFubmVsID09PSBjaGFuZ2VzZXRVcmkgJiYgZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0T3BlcmF0aW9uc0NoYW5nZWQpIHtcblx0XHRcdFx0ZGlzcGF0Y2hlZC5wdXNoKGVudmVsb3BlLmFjdGlvbi5vcGVyYXRpb25zKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzZXJ2aWNlLnVwZGF0ZU9wZXJhdGlvbnMoc2Vzc2lvbktleSwgY2hhbmdlc2V0VXJpLCBzYW1wbGVHaXRTdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpc3BhdGNoZWQsIFtbXV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aS1mb2xkZXIgc2Vzc2lvbiBkaXNwYXRjaGVzIGVtcHR5IG9wZXJhdGlvbnMgZm9yIGEgY29tcGFyZS10dXJucyBjaGFuZ2VzZXQgdmlhIHVwZGF0ZU9wZXJhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gJ2FnZW50Oi9zZXNzaW9uJztcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBidWlsZENvbXBhcmVUdXJuc0NoYW5nZXNldFVyaShzZXNzaW9uS2V5LCAndHVybi0xJywgJ3R1cm4tMicpO1xuXHRcdHN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChjaGFuZ2VzZXRVcmkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShbJ2ZpbGU6Ly8vYScsICdmaWxlOi8vL2InXSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKG5ldyBPcGVyYXRpb25zQ29udHJpYnV0aW9uKHNhbXBsZU9wZXJhdGlvbnMpKSk7XG5cblx0XHRjb25zdCBkaXNwYXRjaGVkOiAocmVhZG9ubHkgQ2hhbmdlc2V0T3BlcmF0aW9uW10gfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IHtcblx0XHRcdGlmIChlbnZlbG9wZS5jaGFubmVsID09PSBjaGFuZ2VzZXRVcmkgJiYgZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0T3BlcmF0aW9uc0NoYW5nZWQpIHtcblx0XHRcdFx0ZGlzcGF0Y2hlZC5wdXNoKGVudmVsb3BlLmFjdGlvbi5vcGVyYXRpb25zKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRzZXJ2aWNlLnVwZGF0ZU9wZXJhdGlvbnMoc2Vzc2lvbktleSwgY2hhbmdlc2V0VXJpLCBzYW1wbGVHaXRTdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpc3BhdGNoZWQsIFtbXV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtZm9sZGVyIHNlc3Npb24gYWR2ZXJ0aXNlcyB0dXJuIG9wZXJhdGlvbnMgdmlhIHVwZGF0ZU9wZXJhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gJ2FnZW50Oi9zZXNzaW9uJztcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvbktleSwgJ3R1cm4tMScpO1xuXHRcdHN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChjaGFuZ2VzZXRVcmkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShbJ2ZpbGU6Ly8vYSddKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IE9wZXJhdGlvbnNDb250cmlidXRpb24oc2FtcGxlT3BlcmF0aW9ucykpKTtcblxuXHRcdGNvbnN0IGRpc3BhdGNoZWQ6IChyZWFkb25seSBDaGFuZ2VzZXRPcGVyYXRpb25bXSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0aWYgKGVudmVsb3BlLmNoYW5uZWwgPT09IGNoYW5nZXNldFVyaSAmJiBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRPcGVyYXRpb25zQ2hhbmdlZCkge1xuXHRcdFx0XHRkaXNwYXRjaGVkLnB1c2goZW52ZWxvcGUuYWN0aW9uLm9wZXJhdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHNlcnZpY2UudXBkYXRlT3BlcmF0aW9ucyhzZXNzaW9uS2V5LCBjaGFuZ2VzZXRVcmksIHNhbXBsZUdpdFN0YXRlKTtcblxuXHRcdC8vIFNpbmdsZS1yb290IGFkdmVydGlzZXMgdGhlIGNvbnRyaWJ1dGVkIG9wZXJhdGlvbnM7IGNvbWJpbmVkIHdpdGggdGhlXG5cdFx0Ly8gbXVsdGktZm9sZGVyLWVtcHRpZXMgdGVzdHMgYWJvdmUsIHRoaXMgY292ZXJzIHRoZSBlbnRlci9sZWF2ZSB0cmFuc2l0aW9uLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlzcGF0Y2hlZCwgW3NhbXBsZU9wZXJhdGlvbnNdKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGktZm9sZGVyIHNlc3Npb24gY2xlYXJzIHR1cm4gb3BlcmF0aW9ucyBldmVuIHdoZW4gZ2l0IHN0YXRlIGlzIGFic2VudCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSAnYWdlbnQ6L3Nlc3Npb24nO1xuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IGJ1aWxkVHVybkNoYW5nZXNldFVyaShzZXNzaW9uS2V5LCAndHVybi0xJyk7XG5cdFx0c3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGNoYW5nZXNldFVyaSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKFsnZmlsZTovLy9hJywgJ2ZpbGU6Ly8vYiddKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IE9wZXJhdGlvbnNDb250cmlidXRpb24oc2FtcGxlT3BlcmF0aW9ucykpKTtcblxuXHRcdGNvbnN0IGRpc3BhdGNoZWQ6IChyZWFkb25seSBDaGFuZ2VzZXRPcGVyYXRpb25bXSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0aWYgKGVudmVsb3BlLmNoYW5uZWwgPT09IGNoYW5nZXNldFVyaSAmJiBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRPcGVyYXRpb25zQ2hhbmdlZCkge1xuXHRcdFx0XHRkaXNwYXRjaGVkLnB1c2goZW52ZWxvcGUuYWN0aW9uLm9wZXJhdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIE5vIGdpdFN0YXRlIGFyZ3VtZW50IGFuZCBubyBnaXQgbWV0YSBvbiB0aGUgc2Vzc2lvbiBcdTIwMTQgdGhlIHJvb3QtdHJhbnNpdGlvblxuXHRcdC8vIHJlY29tcHV0ZSBwYXRoLiBCZWZvcmUgSXNzdWUgMTYgdGhlIGFic2VudC1naXQtc3RhdGUgZWFybHkgcmV0dXJuIHNraXBwZWRcblx0XHQvLyB0aGUgc3VwcHJlc3NlZCB0dXJuIGNoYW5nZXNldCwgbGVhdmluZyBpdHMgc3RhbGUgb3BlcmF0aW9ucyBhZHZlcnRpc2VkLlxuXHRcdHNlcnZpY2UudXBkYXRlT3BlcmF0aW9ucyhzZXNzaW9uS2V5LCBjaGFuZ2VzZXRVcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXNwYXRjaGVkLCBbW11dKTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlLWZvbGRlciBzZXNzaW9uIHdpdGggYWJzZW50IGdpdCBzdGF0ZSBkb2VzIG5vdCBkaXNwYXRjaCAobm8gcHJlbWF0dXJlIGNsZWFyKScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSAnYWdlbnQ6L3Nlc3Npb24nO1xuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IGJ1aWxkVHVybkNoYW5nZXNldFVyaShzZXNzaW9uS2V5LCAndHVybi0xJyk7XG5cdFx0c3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGNoYW5nZXNldFVyaSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKFsnZmlsZTovLy9hJ10pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGlvbihuZXcgT3BlcmF0aW9uc0NvbnRyaWJ1dGlvbihzYW1wbGVPcGVyYXRpb25zKSkpO1xuXG5cdFx0Y29uc3QgZGlzcGF0Y2hlZDogKHJlYWRvbmx5IENoYW5nZXNldE9wZXJhdGlvbltdIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlbnZlbG9wZSA9PiB7XG5cdFx0XHRpZiAoZW52ZWxvcGUuY2hhbm5lbCA9PT0gY2hhbmdlc2V0VXJpICYmIGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYW5nZXNldE9wZXJhdGlvbnNDaGFuZ2VkKSB7XG5cdFx0XHRcdGRpc3BhdGNoZWQucHVzaChlbnZlbG9wZS5hY3Rpb24ub3BlcmF0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQSBub24tc3VwcHJlc3NlZCBjaGFuZ2VzZXQgd2l0aCBubyByZXNvbHZhYmxlIGdpdCBzdGF0ZSBtdXN0IHN0aWxsIGRlZmVyXG5cdFx0Ly8gKGVhcmx5IHJldHVybikgXHUyMDE0IGNsZWFyaW5nIGlzIHNjb3BlZCB0byB0aGUgc3VwcHJlc3NlZCB0dXJuL2NvbXBhcmUga2luZHMuXG5cdFx0c2VydmljZS51cGRhdGVPcGVyYXRpb25zKHNlc3Npb25LZXksIGNoYW5nZXNldFVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpc3BhdGNoZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGktZm9sZGVyIHNlc3Npb24gd2l0aCBhYnNlbnQgZ2l0IHN0YXRlIGRlZmVycyBhIG5vbi1zdXBwcmVzc2VkIGNoYW5nZXNldCAobm8gb3Zlci1jbGVhciknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gJ2FnZW50Oi9zZXNzaW9uJztcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25LZXkpO1xuXHRcdHN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChjaGFuZ2VzZXRVcmkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShbJ2ZpbGU6Ly8vYScsICdmaWxlOi8vL2InXSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKG5ldyBPcGVyYXRpb25zQ29udHJpYnV0aW9uKHNhbXBsZU9wZXJhdGlvbnMpKSk7XG5cblx0XHRjb25zdCBkaXNwYXRjaGVkOiAocmVhZG9ubHkgQ2hhbmdlc2V0T3BlcmF0aW9uW10gfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IHtcblx0XHRcdGlmIChlbnZlbG9wZS5jaGFubmVsID09PSBjaGFuZ2VzZXRVcmkgJiYgZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0T3BlcmF0aW9uc0NoYW5nZWQpIHtcblx0XHRcdFx0ZGlzcGF0Y2hlZC5wdXNoKGVudmVsb3BlLmFjdGlvbi5vcGVyYXRpb25zKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBNdWx0aS1yb290LCBidXQgdGhlIGNoYW5nZXNldCBpcyB1bmNvbW1pdHRlZCAobm90IHR1cm4vY29tcGFyZSkgc28gaXQgaXNcblx0XHQvLyBOT1Qgc3VwcHJlc3NlZC4gV2l0aCBubyByZXNvbHZhYmxlIGdpdCBzdGF0ZSBpdCBtdXN0IGRlZmVyIGxpa2UgYW55IG90aGVyXG5cdFx0Ly8gbm9uLXN1cHByZXNzZWQgY2hhbmdlc2V0IFx1MjAxNCB0aGUgW10tY2xlYXIgaXMgc2NvcGVkIHRvIHN1cHByZXNzZWQga2luZHMgb25seSxcblx0XHQvLyBldmVuIGluIGEgbXVsdGktcm9vdCBzZXNzaW9uLlxuXHRcdHNlcnZpY2UudXBkYXRlT3BlcmF0aW9ucyhzZXNzaW9uS2V5LCBjaGFuZ2VzZXRVcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXNwYXRjaGVkLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm4gY2hhbmdlc2V0IHJlLWRpc3BhdGNoZXMgZW1wdHkgb24gZW50ZXJpbmcgbXVsdGktcm9vdCBhbmQgcmVzdG9yZXMgb24gcmV0dXJuaW5nIHRvIHNpbmdsZS1yb290JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9ICdhZ2VudDovc2Vzc2lvbic7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKHNlc3Npb25LZXksICd0dXJuLTEnKTtcblx0XHRzdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoWydmaWxlOi8vL2EnXSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IE9wZXJhdGlvbnNDb250cmlidXRpb24oc2FtcGxlT3BlcmF0aW9ucykpKTtcblxuXHRcdGNvbnN0IGRpc3BhdGNoZWQ6IChyZWFkb25seSBDaGFuZ2VzZXRPcGVyYXRpb25bXSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0aWYgKGVudmVsb3BlLmNoYW5uZWwgPT09IGNoYW5nZXNldFVyaSAmJiBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRPcGVyYXRpb25zQ2hhbmdlZCkge1xuXHRcdFx0XHRkaXNwYXRjaGVkLnB1c2goZW52ZWxvcGUuYWN0aW9uLm9wZXJhdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNpbmdsZS1yb290OiBhZHZlcnRpc2VzIHRoZSBjb250cmlidXRlZCBvcGVyYXRpb25zLlxuXHRcdHNlcnZpY2UudXBkYXRlT3BlcmF0aW9ucyhzZXNzaW9uS2V5LCBjaGFuZ2VzZXRVcmksIHNhbXBsZUdpdFN0YXRlKTtcblx0XHQvLyBBIHJvb3QgaXMgYWRkZWQgYXQgcnVudGltZSAtPiBtdWx0aS1yb290OiByZS1kaXNwYXRjaGVzIGFuIGVtcHR5IGxpc3QuXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0V29ya2luZ0RpcmVjdG9yaWVzKFsnZmlsZTovLy9hJywgJ2ZpbGU6Ly8vYiddKTtcblx0XHRzZXJ2aWNlLnVwZGF0ZU9wZXJhdGlvbnMoc2Vzc2lvbktleSwgY2hhbmdlc2V0VXJpLCBzYW1wbGVHaXRTdGF0ZSk7XG5cdFx0Ly8gVGhlIGV4dHJhIHJvb3QgaXMgcmVtb3ZlZCAtPiBzaW5nbGUtcm9vdCBhZ2FpbjogcmVzdG9yZXMgdGhlIG9wZXJhdGlvbnMuXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0V29ya2luZ0RpcmVjdG9yaWVzKFsnZmlsZTovLy9hJ10pO1xuXHRcdHNlcnZpY2UudXBkYXRlT3BlcmF0aW9ucyhzZXNzaW9uS2V5LCBjaGFuZ2VzZXRVcmksIHNhbXBsZUdpdFN0YXRlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlzcGF0Y2hlZCwgW3NhbXBsZU9wZXJhdGlvbnMsIFtdLCBzYW1wbGVPcGVyYXRpb25zXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1mb2xkZXIgc2Vzc2lvbiBrZWVwcyBvcGVyYXRpb25zIGZvciB0dXJuIGFuZCBjb21wYXJlLXR1cm5zIGNoYW5nZXNldHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gJ2FnZW50Oi9zZXNzaW9uJztcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShzdGF0ZU1hbmFnZXIsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoWydmaWxlOi8vL2EnXSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKG5ldyBPcGVyYXRpb25zQ29udHJpYnV0aW9uKHNhbXBsZU9wZXJhdGlvbnMpKSk7XG5cblx0XHRjb25zdCB0dXJuT3BlcmF0aW9ucyA9IHNlcnZpY2UuZ2V0T3BlcmF0aW9ucyhzZXNzaW9uS2V5LCBidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvbktleSwgJ3R1cm4tMScpLCBzYW1wbGVHaXRTdGF0ZSk7XG5cdFx0Y29uc3QgY29tcGFyZU9wZXJhdGlvbnMgPSBzZXJ2aWNlLmdldE9wZXJhdGlvbnMoc2Vzc2lvbktleSwgYnVpbGRDb21wYXJlVHVybnNDaGFuZ2VzZXRVcmkoc2Vzc2lvbktleSwgJ3R1cm4tMScsICd0dXJuLTInKSwgc2FtcGxlR2l0U3RhdGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJuT3BlcmF0aW9ucywgc2FtcGxlT3BlcmF0aW9ucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wYXJlT3BlcmF0aW9ucywgc2FtcGxlT3BlcmF0aW9ucyk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLWZvbGRlciBzZXNzaW9uIGtlZXBzIG9wZXJhdGlvbnMgZm9yIGJyYW5jaCBhbmQgdW5jb21taXR0ZWQgY2hhbmdlc2V0cycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSAnYWdlbnQ6L3Nlc3Npb24nO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShbJ2ZpbGU6Ly8vYScsICdmaWxlOi8vL2InXSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKG5ldyBPcGVyYXRpb25zQ29udHJpYnV0aW9uKHNhbXBsZU9wZXJhdGlvbnMpKSk7XG5cblx0XHRjb25zdCBicmFuY2hPcGVyYXRpb25zID0gc2VydmljZS5nZXRPcGVyYXRpb25zKHNlc3Npb25LZXksIGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb25LZXkpLCBzYW1wbGVHaXRTdGF0ZSk7XG5cdFx0Y29uc3QgdW5jb21taXR0ZWRPcGVyYXRpb25zID0gc2VydmljZS5nZXRPcGVyYXRpb25zKHNlc3Npb25LZXksIGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvbktleSksIHNhbXBsZUdpdFN0YXRlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnJhbmNoT3BlcmF0aW9ucywgc2FtcGxlT3BlcmF0aW9ucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1bmNvbW1pdHRlZE9wZXJhdGlvbnMsIHNhbXBsZU9wZXJhdGlvbnMpO1xuXHR9KTtcblxuXHR0ZXN0KCdqb2lucyBkdXBsaWNhdGUgaW4tZmxpZ2h0IGludm9jYXRpb25zIGZvciB0aGUgc2FtZSBjaGFuZ2VzZXQgb3BlcmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9ICdhZ2VudDovc2Vzc2lvbic7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uS2V5KTtcblx0XHRzdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldE9wZXJhdGlvbnNDaGFuZ2VkLFxuXHRcdFx0b3BlcmF0aW9uczogW3sgaWQ6IHRlc3RPcGVyYXRpb25JZCwgbGFiZWw6ICdDb21taXQnLCBzY29wZXM6IFtDaGFuZ2VzZXRPcGVyYXRpb25TY29wZS5DaGFuZ2VzZXRdLCBzdGF0dXM6IENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5JZGxlIH1dLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RhdGVNYW5hZ2VyKTtcblx0XHRjb25zdCBoYW5kbGVyID0gbmV3IFRlc3RIYW5kbGVyKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IFRlc3RDb250cmlidXRpb24oaGFuZGxlcikpKTtcblxuXHRcdGNvbnN0IHBhcmFtcyA9IHsgY2hhbm5lbDogY2hhbmdlc2V0VXJpLCBvcGVyYXRpb25JZDogdGVzdE9wZXJhdGlvbklkIH07XG5cdFx0Y29uc3QgZmlyc3QgPSBzZXJ2aWNlLmludm9rZUNoYW5nZXNldE9wZXJhdGlvbihwYXJhbXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0VXJpKT8ub3BlcmF0aW9ucz8uWzBdLnN0YXR1cywgQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLlJ1bm5pbmcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IHNlcnZpY2UuaW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uKHBhcmFtcyk7XG5cdFx0aGFuZGxlci5jb21wbGV0ZSh7IG1lc3NhZ2U6IHsgbWFya2Rvd246ICdDb21taXR0ZWQnIH0gfSk7XG5cblx0XHRjb25zdCBbZmlyc3RSZXN1bHQsIHNlY29uZFJlc3VsdF0gPSBhd2FpdCBQcm9taXNlLmFsbChbZmlyc3QsIHNlY29uZF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNhbGxzOiBoYW5kbGVyLmNhbGxzLCBmaXJzdFJlc3VsdCwgc2Vjb25kUmVzdWx0IH0sIHtcblx0XHRcdGNhbGxzOiAxLFxuXHRcdFx0Zmlyc3RSZXN1bHQ6IHsgbWVzc2FnZTogeyBtYXJrZG93bjogJ0NvbW1pdHRlZCcgfSB9LFxuXHRcdFx0c2Vjb25kUmVzdWx0OiB7IG1lc3NhZ2U6IHsgbWFya2Rvd246ICdDb21taXR0ZWQnIH0gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHVibGlzaGVzIHJ1bm5pbmcgYW5kIGlkbGUgc3RhdGUgYXJvdW5kIGEgc3VjY2Vzc2Z1bCBjaGFuZ2VzZXQgb3BlcmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9ICdhZ2VudDovc2Vzc2lvbic7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uS2V5KTtcblx0XHRzdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldE9wZXJhdGlvbnNDaGFuZ2VkLFxuXHRcdFx0b3BlcmF0aW9uczogW3sgaWQ6IHRlc3RPcGVyYXRpb25JZCwgbGFiZWw6ICdDb21taXQnLCBzY29wZXM6IFtDaGFuZ2VzZXRPcGVyYXRpb25TY29wZS5DaGFuZ2VzZXRdLCBzdGF0dXM6IENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5JZGxlIH1dLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RhdGVNYW5hZ2VyKTtcblx0XHRjb25zdCBoYW5kbGVyID0gbmV3IFRlc3RIYW5kbGVyKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IFRlc3RDb250cmlidXRpb24oaGFuZGxlcikpKTtcblxuXHRcdGNvbnN0IGludm9jYXRpb24gPSBzZXJ2aWNlLmludm9rZUNoYW5nZXNldE9wZXJhdGlvbih7IGNoYW5uZWw6IGNoYW5nZXNldFVyaSwgb3BlcmF0aW9uSWQ6IHRlc3RPcGVyYXRpb25JZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldFVyaSk/Lm9wZXJhdGlvbnM/LlswXS5zdGF0dXMsIENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5SdW5uaW5nKTtcblx0XHRoYW5kbGVyLmNvbXBsZXRlKHsgbWVzc2FnZTogeyBtYXJrZG93bjogJ0NvbW1pdHRlZCcgfSB9KTtcblx0XHRhd2FpdCBpbnZvY2F0aW9uO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0VXJpKT8ub3BlcmF0aW9ucz8uWzBdLnN0YXR1cywgQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLklkbGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGludm9jYXRpb24gb2YgYSBkaXNhYmxlZCBjaGFuZ2VzZXQgb3BlcmF0aW9uIHdpdGhvdXQgY2FsbGluZyB0aGUgaGFuZGxlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSAnYWdlbnQ6L3Nlc3Npb24nO1xuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvbktleSk7XG5cdFx0c3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGNoYW5nZXNldFVyaSk7XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRPcGVyYXRpb25zQ2hhbmdlZCxcblx0XHRcdG9wZXJhdGlvbnM6IFt7IGlkOiB0ZXN0T3BlcmF0aW9uSWQsIGxhYmVsOiAnQ29tbWl0Jywgc2NvcGVzOiBbQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUuQ2hhbmdlc2V0XSwgc3RhdHVzOiBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuRGlzYWJsZWQgfV0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShzdGF0ZU1hbmFnZXIpO1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBuZXcgVGVzdEhhbmRsZXIoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGlvbihuZXcgVGVzdENvbnRyaWJ1dGlvbihoYW5kbGVyKSkpO1xuXG5cdFx0Y29uc3QgZXJyb3IgPSBhd2FpdCBzZXJ2aWNlLmludm9rZUNoYW5nZXNldE9wZXJhdGlvbih7IGNoYW5uZWw6IGNoYW5nZXNldFVyaSwgb3BlcmF0aW9uSWQ6IHRlc3RPcGVyYXRpb25JZCB9KS50aGVuKHVuZGVmaW5lZCwgZXJyb3IgPT4gZXJyb3IpO1xuXG5cdFx0YXNzZXJ0Lm1hdGNoKGVycm9yLm1lc3NhZ2UsIC9pcyBkaXNhYmxlZC8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYW5kbGVyLmNhbGxzLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldFVyaSk/Lm9wZXJhdGlvbnM/LlswXS5zdGF0dXMsIENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5EaXNhYmxlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgaW52b2NhdGlvbiB3aGlsZSBhIHR1cm4gaXMgYWN0aXZlIGV2ZW4gaWYgdGhlIGFkdmVydGlzZWQgc3RhdHVzIGlzIGlkbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gJ2FnZW50Oi9zZXNzaW9uJztcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25LZXkpO1xuXHRcdGNvbnN0IHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5ID0ge1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb25LZXksXG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0fTtcblx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihzdW1tYXJ5KTtcblx0XHRzdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblx0XHQvLyBBZHZlcnRpc2UgdGhlIG9wZXJhdGlvbiBhcyBJZGxlIChlLmcuIGEgcHJldmlvdXMgb3BlcmF0aW9uIGZpbmlzaGVkIGFuZFxuXHRcdC8vIGEgQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzQ2hhbmdlZCByZXNldCB0aGUgc3RhdHVzKSAuLi5cblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldE9wZXJhdGlvbnNDaGFuZ2VkLFxuXHRcdFx0b3BlcmF0aW9uczogW3sgaWQ6IHRlc3RPcGVyYXRpb25JZCwgbGFiZWw6ICdDb21taXQnLCBzY29wZXM6IFtDaGFuZ2VzZXRPcGVyYXRpb25TY29wZS5DaGFuZ2VzZXRdLCBzdGF0dXM6IENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5JZGxlIH1dLFxuXHRcdH0pO1xuXHRcdC8vIC4uLiB3aGlsZSBhIGNoYXQgdHVybiBpcyBzdGlsbCBzdHJlYW1pbmcgb24gdGhlIHNlc3Npb24uXG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbktleSksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoaScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0YXRlTWFuYWdlcik7XG5cdFx0Y29uc3QgaGFuZGxlciA9IG5ldyBUZXN0SGFuZGxlcigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKG5ldyBUZXN0Q29udHJpYnV0aW9uKGhhbmRsZXIpKSk7XG5cblx0XHRjb25zdCBlcnJvciA9IGF3YWl0IHNlcnZpY2UuaW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uKHsgY2hhbm5lbDogY2hhbmdlc2V0VXJpLCBvcGVyYXRpb25JZDogdGVzdE9wZXJhdGlvbklkIH0pLnRoZW4odW5kZWZpbmVkLCBlcnJvciA9PiBlcnJvcik7XG5cblx0XHRhc3NlcnQubWF0Y2goZXJyb3IubWVzc2FnZSwgL2Rpc2FibGVkIHdoaWxlIGEgdHVybiBpcyBhY3RpdmUvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlci5jYWxscywgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShjaGFuZ2VzZXRVcmkpPy5vcGVyYXRpb25zPy5bMF0uc3RhdHVzLCBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuSWRsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgaW52b2NhdGlvbiBvZiBhIHN0YWxlIHR1cm4gb3BlcmF0aW9uIG9uY2UgdGhlIHNlc3Npb24gaXMgbXVsdGktcm9vdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSAnYWdlbnQ6L3Nlc3Npb24nO1xuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IGJ1aWxkVHVybkNoYW5nZXNldFVyaShzZXNzaW9uS2V5LCAndHVybi0xJyk7XG5cdFx0c3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGNoYW5nZXNldFVyaSk7XG5cdFx0Ly8gQSBzdGFsZSBvcGVyYXRpb24gYWR2ZXJ0aXNlZCB3aGlsZSB0aGUgc2Vzc2lvbiB3YXMgc2luZ2xlLXJvb3QuXG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRPcGVyYXRpb25zQ2hhbmdlZCxcblx0XHRcdG9wZXJhdGlvbnM6IFt7IGlkOiB0ZXN0T3BlcmF0aW9uSWQsIGxhYmVsOiAnU3luYycsIHNjb3BlczogW0NoYW5nZXNldE9wZXJhdGlvblNjb3BlLkNoYW5nZXNldF0sIHN0YXR1czogQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLklkbGUgfV0sXG5cdFx0fSk7XG5cblx0XHQvLyBUaGUgc2Vzc2lvbiBpcyBub3cgbXVsdGktcm9vdCwgc28gdGhlIGludm9jYXRpb24gbXVzdCBiZSByZS1zdXBwcmVzc2VkXG5cdFx0Ly8gcmVnYXJkbGVzcyBvZiB0aGUgc3RhbGUgYWR2ZXJ0aXNlZCBvcGVyYXRpb24uXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKFsnZmlsZTovLy9hJywgJ2ZpbGU6Ly8vYiddKSk7XG5cdFx0Y29uc3QgaGFuZGxlciA9IG5ldyBUZXN0SGFuZGxlcigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKG5ldyBUZXN0Q29udHJpYnV0aW9uKGhhbmRsZXIpKSk7XG5cblx0XHRjb25zdCBlcnJvciA9IGF3YWl0IHNlcnZpY2UuaW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uKHsgY2hhbm5lbDogY2hhbmdlc2V0VXJpLCBvcGVyYXRpb25JZDogdGVzdE9wZXJhdGlvbklkIH0pLnRoZW4odW5kZWZpbmVkLCBlcnJvciA9PiBlcnJvcik7XG5cblx0XHRhc3NlcnQubWF0Y2goZXJyb3IubWVzc2FnZSwgL211bHRpLXJvb3Qgc2Vzc2lvbi8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvci5jb2RlLCBKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlci5jYWxscywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyBpbnZvY2F0aW9uIG9mIGEgdHVybiBvcGVyYXRpb24gaW4gYSBzaW5nbGUtcm9vdCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9ICdhZ2VudDovc2Vzc2lvbic7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKHNlc3Npb25LZXksICd0dXJuLTEnKTtcblx0XHRzdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldE9wZXJhdGlvbnNDaGFuZ2VkLFxuXHRcdFx0b3BlcmF0aW9uczogW3sgaWQ6IHRlc3RPcGVyYXRpb25JZCwgbGFiZWw6ICdTeW5jJywgc2NvcGVzOiBbQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUuQ2hhbmdlc2V0XSwgc3RhdHVzOiBDaGFuZ2VzZXRPcGVyYXRpb25TdGF0dXMuSWRsZSB9XSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShbJ2ZpbGU6Ly8vYSddKSk7XG5cdFx0Y29uc3QgaGFuZGxlciA9IG5ldyBUZXN0SGFuZGxlcigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKG5ldyBUZXN0Q29udHJpYnV0aW9uKGhhbmRsZXIpKSk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uID0gc2VydmljZS5pbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24oeyBjaGFubmVsOiBjaGFuZ2VzZXRVcmksIG9wZXJhdGlvbklkOiB0ZXN0T3BlcmF0aW9uSWQgfSk7XG5cdFx0aGFuZGxlci5jb21wbGV0ZSh7IG1lc3NhZ2U6IHsgbWFya2Rvd246ICdTeW5jZWQnIH0gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2NhdGlvbjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjYWxsczogaGFuZGxlci5jYWxscywgcmVzdWx0IH0sIHsgY2FsbHM6IDEsIHJlc3VsdDogeyBtZXNzYWdlOiB7IG1hcmtkb3duOiAnU3luY2VkJyB9IH0gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93cyBpbnZvY2F0aW9uIG9mIGFuIHVuY29tbWl0dGVkIG9wZXJhdGlvbiB3aGlsZSBtdWx0aS1yb290IChvbmx5IHR1cm4vY29tcGFyZSBhcmUgc3VwcHJlc3NlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gJ2FnZW50Oi9zZXNzaW9uJztcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25LZXkpO1xuXHRcdHN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChjaGFuZ2VzZXRVcmkpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0T3BlcmF0aW9uc0NoYW5nZWQsXG5cdFx0XHRvcGVyYXRpb25zOiBbeyBpZDogdGVzdE9wZXJhdGlvbklkLCBsYWJlbDogJ0NvbW1pdCcsIHNjb3BlczogW0NoYW5nZXNldE9wZXJhdGlvblNjb3BlLkNoYW5nZXNldF0sIHN0YXR1czogQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLklkbGUgfV0sXG5cdFx0fSk7XG5cblx0XHQvLyBNdWx0aS1yb290OiB0aGUgaW52b2tlLXRpbWUgc3VwcHJlc3Npb24gdGFyZ2V0cyBvbmx5IHR1cm4vY29tcGFyZSwgc28gYW5cblx0XHQvLyB1bmNvbW1pdHRlZCAob3IgYnJhbmNoL3Nlc3Npb24pIG9wZXJhdGlvbiBtdXN0IHN0aWxsIGJlIGludm9jYWJsZS5cblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShzdGF0ZU1hbmFnZXIsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoWydmaWxlOi8vL2EnLCAnZmlsZTovLy9iJ10pKTtcblx0XHRjb25zdCBoYW5kbGVyID0gbmV3IFRlc3RIYW5kbGVyKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IFRlc3RDb250cmlidXRpb24oaGFuZGxlcikpKTtcblxuXHRcdGNvbnN0IGludm9jYXRpb24gPSBzZXJ2aWNlLmludm9rZUNoYW5nZXNldE9wZXJhdGlvbih7IGNoYW5uZWw6IGNoYW5nZXNldFVyaSwgb3BlcmF0aW9uSWQ6IHRlc3RPcGVyYXRpb25JZCB9KTtcblx0XHRoYW5kbGVyLmNvbXBsZXRlKHsgbWVzc2FnZTogeyBtYXJrZG93bjogJ0NvbW1pdHRlZCcgfSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZvY2F0aW9uO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNhbGxzOiBoYW5kbGVyLmNhbGxzLCByZXN1bHQgfSwgeyBjYWxsczogMSwgcmVzdWx0OiB7IG1lc3NhZ2U6IHsgbWFya2Rvd246ICdDb21taXR0ZWQnIH0gfSB9KTtcblx0fSk7XG5cblx0dGVzdCgncHVibGlzaGVzIHJ1bm5pbmcgYW5kIGVycm9yIHN0YXRlIHdoZW4gYSBjaGFuZ2VzZXQgb3BlcmF0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9ICdhZ2VudDovc2Vzc2lvbic7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uS2V5KTtcblx0XHRzdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldE9wZXJhdGlvbnNDaGFuZ2VkLFxuXHRcdFx0b3BlcmF0aW9uczogW3sgaWQ6IHRlc3RPcGVyYXRpb25JZCwgbGFiZWw6ICdDb21taXQnLCBzY29wZXM6IFtDaGFuZ2VzZXRPcGVyYXRpb25TY29wZS5DaGFuZ2VzZXRdLCBzdGF0dXM6IENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5JZGxlIH1dLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2Uoc3RhdGVNYW5hZ2VyKTtcblx0XHRjb25zdCBoYW5kbGVyID0gbmV3IFRlc3RIYW5kbGVyKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24obmV3IFRlc3RDb250cmlidXRpb24oaGFuZGxlcikpKTtcblxuXHRcdGNvbnN0IGludm9jYXRpb24gPSBzZXJ2aWNlLmludm9rZUNoYW5nZXNldE9wZXJhdGlvbih7IGNoYW5uZWw6IGNoYW5nZXNldFVyaSwgb3BlcmF0aW9uSWQ6IHRlc3RPcGVyYXRpb25JZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldFVyaSk/Lm9wZXJhdGlvbnM/LlswXS5zdGF0dXMsIENoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5SdW5uaW5nKTtcblx0XHRjb25zdCBmYWlsdXJlID0gaW52b2NhdGlvbi50aGVuKHVuZGVmaW5lZCwgZXJyb3IgPT4gZXJyb3IpO1xuXHRcdGhhbmRsZXIuZmFpbChuZXcgRXJyb3IoJ0Jvb20nKSk7XG5cdFx0Y29uc3QgZXJyb3IgPSBhd2FpdCBmYWlsdXJlO1xuXHRcdGFzc2VydC5tYXRjaChlcnJvci5tZXNzYWdlLCAvQm9vbS8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0VXJpKT8ub3BlcmF0aW9ucz8uWzBdLnN0YXR1cywgQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLkVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldFVyaSk/Lm9wZXJhdGlvbnM/LlswXS5lcnJvcj8ubWVzc2FnZSwgJ0Jvb20nKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLFlBQVksdUJBQXlDO0FBQzlELFNBQVMsYUFBYTtBQUN0QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHlC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
