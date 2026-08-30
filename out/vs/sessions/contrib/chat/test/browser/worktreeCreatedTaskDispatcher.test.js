import assert from "assert";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../../common/agentHostSessionsProvider.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsTasksService } from "../../browser/sessionsTasksService.js";
import { AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING, WorktreeCreatedTaskDispatcher } from "../../browser/worktreeCreatedTaskDispatcher.js";
function makeWorkspace(hasWorktree) {
  const root = URI.parse("file:///repo");
  const workTreeUri = hasWorktree ? URI.parse("file:///repo-worktree") : void 0;
  return {
    uri: root,
    label: "repo",
    icon: Codicon.folder,
    folders: [{
      root,
      workingDirectory: workTreeUri ?? root,
      name: "repo",
      description: void 0,
      gitRepository: { uri: root, workTreeUri, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
    }],
    requiresWorkspaceTrust: true,
    isVirtualWorkspace: false
  };
}
function makeSession(opts = {}) {
  const loading = observableValue("loading", opts.loading ?? false);
  const status = observableValue("status", opts.status ?? SessionStatus.InProgress);
  const workspace = observableValue("workspace", makeWorkspace(opts.hasWorktree ?? true));
  const isArchived = observableValue("isArchived", false);
  const chat = { resource: URI.parse("file:///session") };
  const session = {
    sessionId: opts.id ?? "test:session",
    resource: chat.resource,
    providerId: opts.providerId ?? "test",
    sessionType: "background",
    icon: Codicon.copilot,
    createdAt: /* @__PURE__ */ new Date(),
    workspace,
    title: observableValue("title", "session"),
    updatedAt: observableValue("updatedAt", /* @__PURE__ */ new Date()),
    status,
    changesets: constObservable([]),
    changes: constObservable([]),
    modelId: observableValue("modelId", void 0),
    mode: observableValue("mode", void 0),
    loading,
    isArchived,
    isRead: observableValue("isRead", true),
    lastTurnEnd: observableValue("lastTurnEnd", void 0),
    description: observableValue("description", void 0),
    chats: observableValue("chats", [chat]),
    mainChat: constObservable(chat),
    capabilities: constObservable({ supportsMultipleChats: false, runsWorktreeCreatedTasks: opts.runsWorktreeCreatedTasks })
  };
  return { session, loading, status, workspace, isArchived };
}
function entry(label, runOn) {
  const task = {
    label,
    type: "shell",
    command: label,
    runOptions: runOn ? { runOn } : void 0
  };
  return { task, target: "workspace" };
}
class FakeSessionsTasksService {
  constructor() {
    this.ranTasks = [];
    this.stoppedTasks = [];
    this._tasks = /* @__PURE__ */ new Map();
    this.runTaskFails = false;
  }
  setTasks(sessionId, tasks) {
    this._tasks.set(sessionId, tasks);
  }
  async getSessionTasksOnce(session) {
    return this._tasks.get(session.sessionId) ?? [];
  }
  async runTask(task, session) {
    this.ranTasks.push({ label: task.label, sessionId: session.sessionId });
    if (this.runTaskFails) {
      throw new Error("simulated launch failure");
    }
    return toDisposable(() => this.stoppedTasks.push({ label: task.label, sessionId: session.sessionId }));
  }
}
class FakeSessionsManagementService {
  constructor() {
    this.sessionStartedEmitter = new Emitter();
    this.sessionsChangedEmitter = new Emitter();
    this.onDidStartSession = this.sessionStartedEmitter.event;
    this.onDidChangeSessions = this.sessionsChangedEmitter.event;
  }
  getSessions() {
    return [];
  }
}
suite("WorktreeCreatedTaskDispatcher", () => {
  const store = new DisposableStore();
  let tasks;
  let mgmt;
  let configurationService;
  function createDispatcher() {
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(ISessionsTasksService, tasks);
    instantiationService.stub(ISessionsManagementService, mgmt);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(ILogService, new NullLogService());
    return store.add(instantiationService.createInstance(WorktreeCreatedTaskDispatcher));
  }
  setup(() => {
    tasks = new FakeSessionsTasksService();
    mgmt = new FakeSessionsManagementService();
    configurationService = new TestConfigurationService();
  });
  teardown(() => {
    mgmt.sessionStartedEmitter.dispose();
    mgmt.sessionsChangedEmitter.dispose();
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  async function settle() {
    await new Promise((r) => setTimeout(r, 0));
  }
  test("runs worktreeCreated tasks once for a newly started session", async () => {
    createDispatcher();
    const { session, workspace } = makeSession({ id: "a", hasWorktree: false });
    tasks.setTasks(session.sessionId, [
      entry("setup", "worktreeCreated"),
      entry("lint")
    ]);
    mgmt.sessionStartedEmitter.fire(session);
    await settle();
    workspace.set(makeWorkspace(true), void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, [{ label: "setup", sessionId: "a" }]);
  });
  test("does not run for sessions only reported via onDidChangeSessions.added", async () => {
    createDispatcher();
    const { session } = makeSession({ id: "restored" });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionsChangedEmitter.fire({ added: [session], removed: [], changed: [] });
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, []);
  });
  test("runTask failures are logged but do not abort the loop", async () => {
    createDispatcher();
    tasks.runTaskFails = true;
    const { session, workspace } = makeSession({ id: "a", hasWorktree: false });
    tasks.setTasks(session.sessionId, [
      entry("setup-a", "worktreeCreated"),
      entry("setup-b", "worktreeCreated")
    ]);
    mgmt.sessionStartedEmitter.fire(session);
    workspace.set(makeWorkspace(true), void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, [
      { label: "setup-a", sessionId: "a" },
      { label: "setup-b", sessionId: "a" }
    ]);
  });
  test("does not re-dispatch when loading flickers", async () => {
    createDispatcher();
    const { session, loading } = makeSession({ id: "a", loading: true });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    await settle();
    loading.set(false, void 0);
    await settle();
    loading.set(true, void 0);
    await settle();
    loading.set(false, void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, [{ label: "setup", sessionId: "a" }]);
  });
  test("waits for untitled sessions to start before running", async () => {
    createDispatcher();
    const { session, status } = makeSession({ id: "a", status: SessionStatus.Untitled });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, []);
    status.set(SessionStatus.InProgress, void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, [{ label: "setup", sessionId: "a" }]);
  });
  test("tears down subscription when a started session is removed", async () => {
    createDispatcher();
    const { session, workspace } = makeSession({ id: "a", hasWorktree: false });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    mgmt.sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });
    workspace.set(makeWorkspace(true), void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, []);
  });
  test("skips sessions whose runtime already runs worktreeCreated tasks", async () => {
    createDispatcher();
    const { session } = makeSession({ id: "a", runsWorktreeCreatedTasks: true });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, []);
  });
  test("skips agent host sessions when the setting is disabled", async () => {
    await configurationService.setUserConfiguration(AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING, false);
    createDispatcher();
    const { session, workspace } = makeSession({ id: "a", providerId: LOCAL_AGENT_HOST_PROVIDER_ID, hasWorktree: false });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    workspace.set(makeWorkspace(true), void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, []);
  });
  test("runs agent host sessions when the setting is enabled", async () => {
    await configurationService.setUserConfiguration(AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING, true);
    createDispatcher();
    const { session, workspace } = makeSession({ id: "a", providerId: LOCAL_AGENT_HOST_PROVIDER_ID, hasWorktree: false });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    workspace.set(makeWorkspace(true), void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, [{ label: "setup", sessionId: "a" }]);
  });
  test("does not gate non-agent-host sessions on the agent host setting", async () => {
    createDispatcher();
    const { session, workspace } = makeSession({ id: "a", providerId: "non-agent-host", hasWorktree: false });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    workspace.set(makeWorkspace(true), void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, [{ label: "setup", sessionId: "a" }]);
  });
  test("stops dispatched tasks when the session is marked done (archived)", async () => {
    createDispatcher();
    const { session, workspace, isArchived } = makeSession({ id: "a", hasWorktree: false });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    workspace.set(makeWorkspace(true), void 0);
    await settle();
    assert.deepStrictEqual(tasks.stoppedTasks, []);
    isArchived.set(true, void 0);
    await settle();
    assert.deepStrictEqual(tasks.stoppedTasks, [{ label: "setup", sessionId: "a" }]);
  });
  test("stops dispatched tasks when a started session is removed", async () => {
    createDispatcher();
    const { session, workspace } = makeSession({ id: "a", hasWorktree: false });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    workspace.set(makeWorkspace(true), void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, [{ label: "setup", sessionId: "a" }]);
    mgmt.sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });
    await settle();
    assert.deepStrictEqual(tasks.stoppedTasks, [{ label: "setup", sessionId: "a" }]);
  });
  test("stops a task that finishes launching after the session is archived", async () => {
    createDispatcher();
    const { session, workspace, isArchived } = makeSession({ id: "a", hasWorktree: false });
    tasks.setTasks(session.sessionId, [entry("setup", "worktreeCreated")]);
    mgmt.sessionStartedEmitter.fire(session);
    isArchived.set(true, void 0);
    workspace.set(makeWorkspace(true), void 0);
    await settle();
    assert.deepStrictEqual(tasks.ranTasks, [{ label: "setup", sessionId: "a" }]);
    assert.deepStrictEqual(tasks.stoppedTasks, [{ label: "setup", sessionId: "a" }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcd29ya3RyZWVDcmVhdGVkVGFza0Rpc3BhdGNoZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIElTZXNzaW9uV29ya3NwYWNlLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zQ2hhbmdlRXZlbnQsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNUYXNrc1NlcnZpY2UsIElTZXNzaW9uVGFza1dpdGhUYXJnZXQsIElUYXNrRW50cnkgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25zVGFza3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfUlVOX1dPUktUUkVFX0NSRUFURURfVEFTS1NfU0VUVElORywgV29ya3RyZWVDcmVhdGVkVGFza0Rpc3BhdGNoZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3dvcmt0cmVlQ3JlYXRlZFRhc2tEaXNwYXRjaGVyLmpzJztcblxuaW50ZXJmYWNlIElUZXN0U2Vzc2lvbiB7XG5cdHJlYWRvbmx5IHNlc3Npb246IElTZXNzaW9uO1xuXHRyZWFkb25seSBsb2FkaW5nOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4+O1xuXHRyZWFkb25seSBzdGF0dXM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPj47XG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGlzQXJjaGl2ZWQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxib29sZWFuPj47XG59XG5cbmZ1bmN0aW9uIG1ha2VXb3Jrc3BhY2UoaGFzV29ya3RyZWU6IGJvb2xlYW4pOiBJU2Vzc2lvbldvcmtzcGFjZSB7XG5cdGNvbnN0IHJvb3QgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcmVwbycpO1xuXHRjb25zdCB3b3JrVHJlZVVyaSA9IGhhc1dvcmt0cmVlID8gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8td29ya3RyZWUnKSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIHtcblx0XHR1cmk6IHJvb3QsXG5cdFx0bGFiZWw6ICdyZXBvJyxcblx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0cm9vdCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtUcmVlVXJpID8/IHJvb3QsXG5cdFx0XHRuYW1lOiAncmVwbycsXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0Z2l0UmVwb3NpdG9yeTogeyB1cmk6IHJvb3QsIHdvcmtUcmVlVXJpLCBiYXNlQnJhbmNoTmFtZTogdW5kZWZpbmVkLCBnaXRIdWJJbmZvOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSB9LFxuXHRcdH1dLFxuXHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IHRydWUsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZVNlc3Npb24ob3B0czogeyBpZD86IHN0cmluZzsgcHJvdmlkZXJJZD86IHN0cmluZzsgcnVuc1dvcmt0cmVlQ3JlYXRlZFRhc2tzPzogYm9vbGVhbjsgbG9hZGluZz86IGJvb2xlYW47IHN0YXR1cz86IFNlc3Npb25TdGF0dXM7IGhhc1dvcmt0cmVlPzogYm9vbGVhbiB9ID0ge30pOiBJVGVzdFNlc3Npb24ge1xuXHRjb25zdCBsb2FkaW5nID0gb2JzZXJ2YWJsZVZhbHVlKCdsb2FkaW5nJywgb3B0cy5sb2FkaW5nID8/IGZhbHNlKTtcblx0Y29uc3Qgc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0dXMnLCBvcHRzLnN0YXR1cyA/PyBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRjb25zdCB3b3Jrc3BhY2UgPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQ+KCd3b3Jrc3BhY2UnLCBtYWtlV29ya3NwYWNlKG9wdHMuaGFzV29ya3RyZWUgPz8gdHJ1ZSkpO1xuXHRjb25zdCBpc0FyY2hpdmVkID0gb2JzZXJ2YWJsZVZhbHVlKCdpc0FyY2hpdmVkJywgZmFsc2UpO1xuXHRjb25zdCBjaGF0ID0geyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Nlc3Npb24nKSB9IGFzIElDaGF0O1xuXHRjb25zdCBzZXNzaW9uOiBJU2Vzc2lvbiA9IHtcblx0XHRzZXNzaW9uSWQ6IG9wdHMuaWQgPz8gJ3Rlc3Q6c2Vzc2lvbicsXG5cdFx0cmVzb3VyY2U6IGNoYXQucmVzb3VyY2UsXG5cdFx0cHJvdmlkZXJJZDogb3B0cy5wcm92aWRlcklkID8/ICd0ZXN0Jyxcblx0XHRzZXNzaW9uVHlwZTogJ2JhY2tncm91bmQnLFxuXHRcdGljb246IENvZGljb24uY29waWxvdCxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG5cdFx0d29ya3NwYWNlLFxuXHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoJ3RpdGxlJywgJ3Nlc3Npb24nKSxcblx0XHR1cGRhdGVkQXQ6IG9ic2VydmFibGVWYWx1ZSgndXBkYXRlZEF0JywgbmV3IERhdGUoKSksXG5cdFx0c3RhdHVzLFxuXHRcdGNoYW5nZXNldHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0Y2hhbmdlczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRtb2RlbElkOiBvYnNlcnZhYmxlVmFsdWUoJ21vZGVsSWQnLCB1bmRlZmluZWQpLFxuXHRcdG1vZGU6IG9ic2VydmFibGVWYWx1ZSgnbW9kZScsIHVuZGVmaW5lZCksXG5cdFx0bG9hZGluZyxcblx0XHRpc0FyY2hpdmVkLFxuXHRcdGlzUmVhZDogb2JzZXJ2YWJsZVZhbHVlKCdpc1JlYWQnLCB0cnVlKSxcblx0XHRsYXN0VHVybkVuZDogb2JzZXJ2YWJsZVZhbHVlKCdsYXN0VHVybkVuZCcsIHVuZGVmaW5lZCksXG5cdFx0ZGVzY3JpcHRpb246IG9ic2VydmFibGVWYWx1ZSgnZGVzY3JpcHRpb24nLCB1bmRlZmluZWQpLFxuXHRcdGNoYXRzOiBvYnNlcnZhYmxlVmFsdWUoJ2NoYXRzJywgW2NoYXRdKSxcblx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSwgcnVuc1dvcmt0cmVlQ3JlYXRlZFRhc2tzOiBvcHRzLnJ1bnNXb3JrdHJlZUNyZWF0ZWRUYXNrcyB9KSxcblx0fTtcblx0cmV0dXJuIHsgc2Vzc2lvbiwgbG9hZGluZywgc3RhdHVzLCB3b3Jrc3BhY2UsIGlzQXJjaGl2ZWQgfTtcbn1cblxuZnVuY3Rpb24gZW50cnkobGFiZWw6IHN0cmluZywgcnVuT24/OiAnd29ya3RyZWVDcmVhdGVkJyB8ICdmb2xkZXJPcGVuJyB8ICdkZWZhdWx0Jyk6IElTZXNzaW9uVGFza1dpdGhUYXJnZXQge1xuXHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0ge1xuXHRcdGxhYmVsLFxuXHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0Y29tbWFuZDogbGFiZWwsXG5cdFx0cnVuT3B0aW9uczogcnVuT24gPyB7IHJ1bk9uIH0gOiB1bmRlZmluZWQsXG5cdH07XG5cdHJldHVybiB7IHRhc2ssIHRhcmdldDogJ3dvcmtzcGFjZScgfTtcbn1cblxuY2xhc3MgRmFrZVNlc3Npb25zVGFza3NTZXJ2aWNlIGltcGxlbWVudHMgUGFydGlhbDxJU2Vzc2lvbnNUYXNrc1NlcnZpY2U+IHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJhblRhc2tzOiB7IGxhYmVsOiBzdHJpbmc7IHNlc3Npb25JZDogc3RyaW5nIH1bXSA9IFtdO1xuXHRyZWFkb25seSBzdG9wcGVkVGFza3M6IHsgbGFiZWw6IHN0cmluZzsgc2Vzc2lvbklkOiBzdHJpbmcgfVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rhc2tzID0gbmV3IE1hcDxzdHJpbmcsIHJlYWRvbmx5IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXT4oKTtcblx0cnVuVGFza0ZhaWxzID0gZmFsc2U7XG5cblx0c2V0VGFza3Moc2Vzc2lvbklkOiBzdHJpbmcsIHRhc2tzOiByZWFkb25seSBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0W10pOiB2b2lkIHtcblx0XHR0aGlzLl90YXNrcy5zZXQoc2Vzc2lvbklkLCB0YXNrcyk7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9uVGFza3NPbmNlKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0W10+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGFza3MuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKSA/PyBbXTtcblx0fVxuXG5cdGFzeW5jIHJ1blRhc2sodGFzazogSVRhc2tFbnRyeSwgc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5yYW5UYXNrcy5wdXNoKHsgbGFiZWw6IHRhc2subGFiZWwsIHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQgfSk7XG5cdFx0aWYgKHRoaXMucnVuVGFza0ZhaWxzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3NpbXVsYXRlZCBsYXVuY2ggZmFpbHVyZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuc3RvcHBlZFRhc2tzLnB1c2goeyBsYWJlbDogdGFzay5sYWJlbCwgc2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCB9KSk7XG5cdH1cbn1cblxuY2xhc3MgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBQYXJ0aWFsPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPiB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzZXNzaW9uU3RhcnRlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKTtcblx0cmVhZG9ubHkgc2Vzc2lvbnNDaGFuZ2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPElTZXNzaW9uc0NoYW5nZUV2ZW50PigpO1xuXHRyZWFkb25seSBvbkRpZFN0YXJ0U2Vzc2lvbiA9IHRoaXMuc2Vzc2lvblN0YXJ0ZWRFbWl0dGVyLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5zZXNzaW9uc0NoYW5nZWRFbWl0dGVyLmV2ZW50O1xuXHRnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtdOyB9XG59XG5cbnN1aXRlKCdXb3JrdHJlZUNyZWF0ZWRUYXNrRGlzcGF0Y2hlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHRhc2tzOiBGYWtlU2Vzc2lvbnNUYXNrc1NlcnZpY2U7XG5cdGxldCBtZ210OiBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0ZnVuY3Rpb24gY3JlYXRlRGlzcGF0Y2hlcigpOiBXb3JrdHJlZUNyZWF0ZWRUYXNrRGlzcGF0Y2hlciB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Rhc2tzU2VydmljZSwgdGFza3MgYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNUYXNrc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIG1nbXQgYXMgdW5rbm93biBhcyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrdHJlZUNyZWF0ZWRUYXNrRGlzcGF0Y2hlcikpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRhc2tzID0gbmV3IEZha2VTZXNzaW9uc1Rhc2tzU2VydmljZSgpO1xuXHRcdG1nbXQgPSBuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdG1nbXQuc2Vzc2lvblN0YXJ0ZWRFbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHRtZ210LnNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHNldHRsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXHR9XG5cblx0dGVzdCgncnVucyB3b3JrdHJlZUNyZWF0ZWQgdGFza3Mgb25jZSBmb3IgYSBuZXdseSBzdGFydGVkIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlRGlzcGF0Y2hlcigpO1xuXHRcdGNvbnN0IHsgc2Vzc2lvbiwgd29ya3NwYWNlIH0gPSBtYWtlU2Vzc2lvbih7IGlkOiAnYScsIGhhc1dvcmt0cmVlOiBmYWxzZSB9KTtcblx0XHR0YXNrcy5zZXRUYXNrcyhzZXNzaW9uLnNlc3Npb25JZCwgW1xuXHRcdFx0ZW50cnkoJ3NldHVwJywgJ3dvcmt0cmVlQ3JlYXRlZCcpLFxuXHRcdFx0ZW50cnkoJ2xpbnQnKSxcblx0XHRdKTtcblxuXHRcdG1nbXQuc2Vzc2lvblN0YXJ0ZWRFbWl0dGVyLmZpcmUoc2Vzc2lvbik7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0d29ya3NwYWNlLnNldChtYWtlV29ya3NwYWNlKHRydWUpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXNrcy5yYW5UYXNrcywgW3sgbGFiZWw6ICdzZXR1cCcsIHNlc3Npb25JZDogJ2EnIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcnVuIGZvciBzZXNzaW9ucyBvbmx5IHJlcG9ydGVkIHZpYSBvbkRpZENoYW5nZVNlc3Npb25zLmFkZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZURpc3BhdGNoZXIoKTtcblx0XHRjb25zdCB7IHNlc3Npb24gfSA9IG1ha2VTZXNzaW9uKHsgaWQ6ICdyZXN0b3JlZCcgfSk7XG5cdFx0dGFza3Muc2V0VGFza3Moc2Vzc2lvbi5zZXNzaW9uSWQsIFtlbnRyeSgnc2V0dXAnLCAnd29ya3RyZWVDcmVhdGVkJyldKTtcblxuXHRcdG1nbXQuc2Vzc2lvbnNDaGFuZ2VkRW1pdHRlci5maXJlKHsgYWRkZWQ6IFtzZXNzaW9uXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXNrcy5yYW5UYXNrcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5UYXNrIGZhaWx1cmVzIGFyZSBsb2dnZWQgYnV0IGRvIG5vdCBhYm9ydCB0aGUgbG9vcCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVEaXNwYXRjaGVyKCk7XG5cdFx0dGFza3MucnVuVGFza0ZhaWxzID0gdHJ1ZTtcblx0XHRjb25zdCB7IHNlc3Npb24sIHdvcmtzcGFjZSB9ID0gbWFrZVNlc3Npb24oeyBpZDogJ2EnLCBoYXNXb3JrdHJlZTogZmFsc2UgfSk7XG5cdFx0dGFza3Muc2V0VGFza3Moc2Vzc2lvbi5zZXNzaW9uSWQsIFtcblx0XHRcdGVudHJ5KCdzZXR1cC1hJywgJ3dvcmt0cmVlQ3JlYXRlZCcpLFxuXHRcdFx0ZW50cnkoJ3NldHVwLWInLCAnd29ya3RyZWVDcmVhdGVkJyksXG5cdFx0XSk7XG5cblx0XHRtZ210LnNlc3Npb25TdGFydGVkRW1pdHRlci5maXJlKHNlc3Npb24pO1xuXHRcdHdvcmtzcGFjZS5zZXQobWFrZVdvcmtzcGFjZSh0cnVlKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFza3MucmFuVGFza3MsIFtcblx0XHRcdHsgbGFiZWw6ICdzZXR1cC1hJywgc2Vzc2lvbklkOiAnYScgfSxcblx0XHRcdHsgbGFiZWw6ICdzZXR1cC1iJywgc2Vzc2lvbklkOiAnYScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmUtZGlzcGF0Y2ggd2hlbiBsb2FkaW5nIGZsaWNrZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZURpc3BhdGNoZXIoKTtcblx0XHRjb25zdCB7IHNlc3Npb24sIGxvYWRpbmcgfSA9IG1ha2VTZXNzaW9uKHsgaWQ6ICdhJywgbG9hZGluZzogdHJ1ZSB9KTtcblx0XHR0YXNrcy5zZXRUYXNrcyhzZXNzaW9uLnNlc3Npb25JZCwgW2VudHJ5KCdzZXR1cCcsICd3b3JrdHJlZUNyZWF0ZWQnKV0pO1xuXG5cdFx0bWdtdC5zZXNzaW9uU3RhcnRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGxvYWRpbmcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXHRcdGxvYWRpbmcuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cdFx0bG9hZGluZy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhc2tzLnJhblRhc2tzLCBbeyBsYWJlbDogJ3NldHVwJywgc2Vzc2lvbklkOiAnYScgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgdW50aXRsZWQgc2Vzc2lvbnMgdG8gc3RhcnQgYmVmb3JlIHJ1bm5pbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlRGlzcGF0Y2hlcigpO1xuXHRcdGNvbnN0IHsgc2Vzc2lvbiwgc3RhdHVzIH0gPSBtYWtlU2Vzc2lvbih7IGlkOiAnYScsIHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB9KTtcblx0XHR0YXNrcy5zZXRUYXNrcyhzZXNzaW9uLnNlc3Npb25JZCwgW2VudHJ5KCdzZXR1cCcsICd3b3JrdHJlZUNyZWF0ZWQnKV0pO1xuXG5cdFx0bWdtdC5zZXNzaW9uU3RhcnRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhc2tzLnJhblRhc2tzLCBbXSk7XG5cblx0XHRzdGF0dXMuc2V0KFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhc2tzLnJhblRhc2tzLCBbeyBsYWJlbDogJ3NldHVwJywgc2Vzc2lvbklkOiAnYScgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZWFycyBkb3duIHN1YnNjcmlwdGlvbiB3aGVuIGEgc3RhcnRlZCBzZXNzaW9uIGlzIHJlbW92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlRGlzcGF0Y2hlcigpO1xuXHRcdGNvbnN0IHsgc2Vzc2lvbiwgd29ya3NwYWNlIH0gPSBtYWtlU2Vzc2lvbih7IGlkOiAnYScsIGhhc1dvcmt0cmVlOiBmYWxzZSB9KTtcblx0XHR0YXNrcy5zZXRUYXNrcyhzZXNzaW9uLnNlc3Npb25JZCwgW2VudHJ5KCdzZXR1cCcsICd3b3JrdHJlZUNyZWF0ZWQnKV0pO1xuXG5cdFx0bWdtdC5zZXNzaW9uU3RhcnRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblx0XHRtZ210LnNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW3Nlc3Npb25dLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHR3b3Jrc3BhY2Uuc2V0KG1ha2VXb3Jrc3BhY2UodHJ1ZSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhc2tzLnJhblRhc2tzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIHNlc3Npb25zIHdob3NlIHJ1bnRpbWUgYWxyZWFkeSBydW5zIHdvcmt0cmVlQ3JlYXRlZCB0YXNrcycsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVEaXNwYXRjaGVyKCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBtYWtlU2Vzc2lvbih7IGlkOiAnYScsIHJ1bnNXb3JrdHJlZUNyZWF0ZWRUYXNrczogdHJ1ZSB9KTtcblx0XHR0YXNrcy5zZXRUYXNrcyhzZXNzaW9uLnNlc3Npb25JZCwgW2VudHJ5KCdzZXR1cCcsICd3b3JrdHJlZUNyZWF0ZWQnKV0pO1xuXG5cdFx0bWdtdC5zZXNzaW9uU3RhcnRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFza3MucmFuVGFza3MsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgYWdlbnQgaG9zdCBzZXNzaW9ucyB3aGVuIHRoZSBzZXR0aW5nIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFHRU5UX0hPU1RfUlVOX1dPUktUUkVFX0NSRUFURURfVEFTS1NfU0VUVElORywgZmFsc2UpO1xuXHRcdGNyZWF0ZURpc3BhdGNoZXIoKTtcblx0XHRjb25zdCB7IHNlc3Npb24sIHdvcmtzcGFjZSB9ID0gbWFrZVNlc3Npb24oeyBpZDogJ2EnLCBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBoYXNXb3JrdHJlZTogZmFsc2UgfSk7XG5cdFx0dGFza3Muc2V0VGFza3Moc2Vzc2lvbi5zZXNzaW9uSWQsIFtlbnRyeSgnc2V0dXAnLCAnd29ya3RyZWVDcmVhdGVkJyldKTtcblxuXHRcdG1nbXQuc2Vzc2lvblN0YXJ0ZWRFbWl0dGVyLmZpcmUoc2Vzc2lvbik7XG5cdFx0d29ya3NwYWNlLnNldChtYWtlV29ya3NwYWNlKHRydWUpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNldHRsZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXNrcy5yYW5UYXNrcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5zIGFnZW50IGhvc3Qgc2Vzc2lvbnMgd2hlbiB0aGUgc2V0dGluZyBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFHRU5UX0hPU1RfUlVOX1dPUktUUkVFX0NSRUFURURfVEFTS1NfU0VUVElORywgdHJ1ZSk7XG5cdFx0Y3JlYXRlRGlzcGF0Y2hlcigpO1xuXHRcdGNvbnN0IHsgc2Vzc2lvbiwgd29ya3NwYWNlIH0gPSBtYWtlU2Vzc2lvbih7IGlkOiAnYScsIHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQsIGhhc1dvcmt0cmVlOiBmYWxzZSB9KTtcblx0XHR0YXNrcy5zZXRUYXNrcyhzZXNzaW9uLnNlc3Npb25JZCwgW2VudHJ5KCdzZXR1cCcsICd3b3JrdHJlZUNyZWF0ZWQnKV0pO1xuXG5cdFx0bWdtdC5zZXNzaW9uU3RhcnRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblx0XHR3b3Jrc3BhY2Uuc2V0KG1ha2VXb3Jrc3BhY2UodHJ1ZSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhc2tzLnJhblRhc2tzLCBbeyBsYWJlbDogJ3NldHVwJywgc2Vzc2lvbklkOiAnYScgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBnYXRlIG5vbi1hZ2VudC1ob3N0IHNlc3Npb25zIG9uIHRoZSBhZ2VudCBob3N0IHNldHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y3JlYXRlRGlzcGF0Y2hlcigpO1xuXHRcdGNvbnN0IHsgc2Vzc2lvbiwgd29ya3NwYWNlIH0gPSBtYWtlU2Vzc2lvbih7IGlkOiAnYScsIHByb3ZpZGVySWQ6ICdub24tYWdlbnQtaG9zdCcsIGhhc1dvcmt0cmVlOiBmYWxzZSB9KTtcblx0XHR0YXNrcy5zZXRUYXNrcyhzZXNzaW9uLnNlc3Npb25JZCwgW2VudHJ5KCdzZXR1cCcsICd3b3JrdHJlZUNyZWF0ZWQnKV0pO1xuXG5cdFx0bWdtdC5zZXNzaW9uU3RhcnRlZEVtaXR0ZXIuZmlyZShzZXNzaW9uKTtcblx0XHR3b3Jrc3BhY2Uuc2V0KG1ha2VXb3Jrc3BhY2UodHJ1ZSksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhc2tzLnJhblRhc2tzLCBbeyBsYWJlbDogJ3NldHVwJywgc2Vzc2lvbklkOiAnYScgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9wcyBkaXNwYXRjaGVkIHRhc2tzIHdoZW4gdGhlIHNlc3Npb24gaXMgbWFya2VkIGRvbmUgKGFyY2hpdmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVEaXNwYXRjaGVyKCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uLCB3b3Jrc3BhY2UsIGlzQXJjaGl2ZWQgfSA9IG1ha2VTZXNzaW9uKHsgaWQ6ICdhJywgaGFzV29ya3RyZWU6IGZhbHNlIH0pO1xuXHRcdHRhc2tzLnNldFRhc2tzKHNlc3Npb24uc2Vzc2lvbklkLCBbZW50cnkoJ3NldHVwJywgJ3dvcmt0cmVlQ3JlYXRlZCcpXSk7XG5cblx0XHRtZ210LnNlc3Npb25TdGFydGVkRW1pdHRlci5maXJlKHNlc3Npb24pO1xuXHRcdHdvcmtzcGFjZS5zZXQobWFrZVdvcmtzcGFjZSh0cnVlKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhc2tzLnN0b3BwZWRUYXNrcywgW10pO1xuXG5cdFx0aXNBcmNoaXZlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFza3Muc3RvcHBlZFRhc2tzLCBbeyBsYWJlbDogJ3NldHVwJywgc2Vzc2lvbklkOiAnYScgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9wcyBkaXNwYXRjaGVkIHRhc2tzIHdoZW4gYSBzdGFydGVkIHNlc3Npb24gaXMgcmVtb3ZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjcmVhdGVEaXNwYXRjaGVyKCk7XG5cdFx0Y29uc3QgeyBzZXNzaW9uLCB3b3Jrc3BhY2UgfSA9IG1ha2VTZXNzaW9uKHsgaWQ6ICdhJywgaGFzV29ya3RyZWU6IGZhbHNlIH0pO1xuXHRcdHRhc2tzLnNldFRhc2tzKHNlc3Npb24uc2Vzc2lvbklkLCBbZW50cnkoJ3NldHVwJywgJ3dvcmt0cmVlQ3JlYXRlZCcpXSk7XG5cblx0XHRtZ210LnNlc3Npb25TdGFydGVkRW1pdHRlci5maXJlKHNlc3Npb24pO1xuXHRcdHdvcmtzcGFjZS5zZXQobWFrZVdvcmtzcGFjZSh0cnVlKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhc2tzLnJhblRhc2tzLCBbeyBsYWJlbDogJ3NldHVwJywgc2Vzc2lvbklkOiAnYScgfV0pO1xuXG5cdFx0bWdtdC5zZXNzaW9uc0NoYW5nZWRFbWl0dGVyLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtzZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0YXdhaXQgc2V0dGxlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhc2tzLnN0b3BwZWRUYXNrcywgW3sgbGFiZWw6ICdzZXR1cCcsIHNlc3Npb25JZDogJ2EnIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcHMgYSB0YXNrIHRoYXQgZmluaXNoZXMgbGF1bmNoaW5nIGFmdGVyIHRoZSBzZXNzaW9uIGlzIGFyY2hpdmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNyZWF0ZURpc3BhdGNoZXIoKTtcblx0XHRjb25zdCB7IHNlc3Npb24sIHdvcmtzcGFjZSwgaXNBcmNoaXZlZCB9ID0gbWFrZVNlc3Npb24oeyBpZDogJ2EnLCBoYXNXb3JrdHJlZTogZmFsc2UgfSk7XG5cdFx0dGFza3Muc2V0VGFza3Moc2Vzc2lvbi5zZXNzaW9uSWQsIFtlbnRyeSgnc2V0dXAnLCAnd29ya3RyZWVDcmVhdGVkJyldKTtcblxuXHRcdG1nbXQuc2Vzc2lvblN0YXJ0ZWRFbWl0dGVyLmZpcmUoc2Vzc2lvbik7XG5cdFx0Ly8gQXJjaGl2ZSBiZWZvcmUgdGhlIHdvcmt0cmVlIGFwcGVhcnMgc28gdGhlIHRhc2sgaXMgbGF1bmNoZWQgYWdhaW5zdCBhblxuXHRcdC8vIGFscmVhZHktYXJjaGl2ZWQgc2Vzc2lvbi5cblx0XHRpc0FyY2hpdmVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdHdvcmtzcGFjZS5zZXQobWFrZVdvcmtzcGFjZSh0cnVlKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBzZXR0bGUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFza3MucmFuVGFza3MsIFt7IGxhYmVsOiAnc2V0dXAnLCBzZXNzaW9uSWQ6ICdhJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXNrcy5zdG9wcGVkVGFza3MsIFt7IGxhYmVsOiAnc2V0dXAnLCBzZXNzaW9uSWQ6ICdhJyB9XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLGlC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
