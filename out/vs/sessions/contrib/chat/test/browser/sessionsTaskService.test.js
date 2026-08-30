import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { InMemoryStorageService, IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IJSONEditingService } from "../../../../../workbench/services/configuration/common/jsonEditing.js";
import { IPreferencesService } from "../../../../../workbench/services/preferences/common/preferences.js";
import { SessionsTasksService } from "../../browser/sessionsTasksService.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { ChatInteractivity, SessionStatus } from "../../../../services/sessions/common/session.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ISessionTaskRunnerRegistry, SessionTaskRunnerRegistry } from "../../browser/sessionTaskRunner.js";
function makeSession(opts = {}) {
  const workspace = opts.repository ? {
    uri: opts.repository,
    label: "test",
    icon: Codicon.folder,
    folders: [{
      root: opts.repository,
      workingDirectory: opts.worktree ?? opts.repository,
      name: "test",
      description: void 0,
      gitRepository: { uri: opts.repository, workTreeUri: opts.worktree, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
    }],
    requiresWorkspaceTrust: false
  } : void 0;
  const chat = {
    resource: URI.parse("file:///session"),
    createdAt: /* @__PURE__ */ new Date(),
    title: observableValue("title", "session"),
    updatedAt: observableValue("updatedAt", /* @__PURE__ */ new Date()),
    status: observableValue("status", SessionStatus.Untitled),
    changes: observableValue("changes", []),
    modelId: observableValue("modelId", void 0),
    mode: observableValue("mode", void 0),
    isArchived: observableValue("isArchived", false),
    isRead: observableValue("isRead", true),
    interactivity: observableValue("interactivity", ChatInteractivity.Full),
    checkpoints: observableValue("checkpoints", void 0),
    lastTurnEnd: observableValue("lastTurnEnd", void 0),
    description: observableValue("description", void 0)
  };
  const session = {
    sessionId: "test:session",
    resource: chat.resource,
    providerId: "test",
    sessionType: "background",
    icon: Codicon.copilot,
    createdAt: chat.createdAt,
    workspace: observableValue("workspace", workspace),
    title: chat.title,
    updatedAt: chat.updatedAt,
    status: chat.status,
    changesets: constObservable([]),
    changes: chat.changes,
    modelId: chat.modelId,
    mode: chat.mode,
    loading: observableValue("loading", false),
    isArchived: chat.isArchived,
    isRead: chat.isRead,
    lastTurnEnd: chat.lastTurnEnd,
    description: chat.description,
    chats: observableValue("chats", [chat]),
    mainChat: constObservable(chat),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
  return session;
}
function makeTask(label, command, inAgents) {
  return { label, type: "shell", command: command ?? label, inAgents };
}
function makeNpmTask(label, script, inAgents) {
  return { label, type: "npm", script, inAgents };
}
function makeUnsupportedTask(label, inAgents) {
  return { label, type: "gulp", command: label, inAgents };
}
function tasksJsonContent(tasks) {
  return JSON.stringify({ version: "2.0.0", tasks });
}
suite("SessionsTasksService", () => {
  const store = new DisposableStore();
  let service;
  let fileContents;
  let jsonEdits;
  let ranTasks;
  let storageService;
  let readFileCalls;
  let runnerCanRun;
  let preferencesService;
  const userSettingsUri = URI.parse("file:///user/settings.json");
  const repoUri = URI.parse("file:///repo");
  const worktreeUri = URI.parse("file:///worktree");
  setup(() => {
    fileContents = /* @__PURE__ */ new Map();
    jsonEdits = [];
    ranTasks = [];
    readFileCalls = [];
    runnerCanRun = () => true;
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IFileService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidFilesChange = () => ({ dispose() {
        } });
      }
      async readFile(resource) {
        readFileCalls.push(resource);
        const content = fileContents.get(resource.toString());
        if (content === void 0) {
          throw new Error("file not found");
        }
        return { value: VSBuffer.fromString(content) };
      }
      watch() {
        return { dispose() {
        } };
      }
    }());
    instantiationService.stub(IJSONEditingService, new class extends mock() {
      async write(resource, values, _save) {
        jsonEdits.push({ uri: resource, values });
      }
    }());
    preferencesService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.userSettingsResource = userSettingsUri;
      }
    }();
    instantiationService.stub(IPreferencesService, preferencesService);
    const registry = new SessionTaskRunnerRegistry();
    const fakeRunner = {
      id: "fake",
      priority: 0,
      canRun: (session) => runnerCanRun(session),
      runTask: async (task, session) => {
        ranTasks.push({ label: task.label, session });
      }
    };
    store.add(registry.register(fakeRunner));
    instantiationService.stub(ISessionTaskRunnerRegistry, registry);
    storageService = store.add(new InMemoryStorageService());
    instantiationService.stub(IStorageService, storageService);
    service = store.add(instantiationService.createInstance(SessionsTasksService));
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getSessionTasks returns tasks with inAgents: true from worktree", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build", true),
      makeTask("lint", "npm run lint", false),
      makeTask("test", "npm test", true),
      makeNpmTask("watch", "watch", true),
      makeUnsupportedTask("gulp-task", true)
    ]));
    const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: "/user/tasks.json" });
    fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    const obs = service.getSessionTasks(session);
    await new Promise((r) => setTimeout(r, 10));
    const tasks = obs.get();
    assert.deepStrictEqual(tasks.map((t) => t.task.label), ["build", "test", "watch", "gulp-task"]);
  });
  test("getSessionTasks returns empty array when no worktree", async () => {
    const session = makeSession({ repository: repoUri });
    const obs = service.getSessionTasks(session);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(obs.get(), []);
  });
  test("getSessionTasks reads from repository when no worktree", async () => {
    const repoTasksUri = URI.parse("file:///repo/.vscode/tasks.json");
    fileContents.set(repoTasksUri.toString(), tasksJsonContent([
      makeTask("serve", "npm run serve", true),
      makeTask("lint", "npm run lint", false)
    ]));
    const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: "/user/tasks.json" });
    fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
    const session = makeSession({ repository: repoUri });
    const obs = service.getSessionTasks(session);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(obs.get().map((t) => t.task.label), ["serve"]);
  });
  test("getSessionTasks does not re-read files on repeated calls for the same folder", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: "/user/tasks.json" });
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build", true)
    ]));
    fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    service.getSessionTasks(session);
    service.getSessionTasks(session);
    service.getSessionTasks(session);
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(readFileCalls.length, 2, "should read files only once (no duplicate refresh)");
  });
  test("getSessionTasks skips workspace tasks when repository URI has no path", async () => {
    const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: "/user/tasks.json" });
    fileContents.set(userTasksUri.toString(), tasksJsonContent([
      makeTask("userTask", "npm run user", true)
    ]));
    const session = makeSession({ repository: URI.parse("unknown://workspace") });
    const obs = service.getSessionTasks(session);
    await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(obs.get(), [{ task: makeTask("userTask", "npm run user", true), target: "user" }]);
  });
  test("getNonSessionTasks returns only tasks without inAgents", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build", true),
      makeTask("lint", "npm run lint", false),
      makeTask("test", "npm test"),
      makeNpmTask("watch", "watch", false),
      makeUnsupportedTask("gulp-task", false)
    ]));
    const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: "/user/tasks.json" });
    fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    const nonSessionTasks = await service.getNonSessionTasks(session);
    assert.deepStrictEqual(nonSessionTasks.map((t) => t.task.label), ["lint", "test", "watch", "gulp-task"]);
  });
  test("getNonSessionTasks reads from repository when no worktree", async () => {
    const repoTasksUri = URI.parse("file:///repo/.vscode/tasks.json");
    fileContents.set(repoTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build", true),
      makeTask("lint", "npm run lint", false)
    ]));
    const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: "/user/tasks.json" });
    fileContents.set(userTasksUri.toString(), tasksJsonContent([]));
    const session = makeSession({ repository: repoUri });
    const nonSessionTasks = await service.getNonSessionTasks(session);
    assert.deepStrictEqual(nonSessionTasks.map((t) => t.task.label), ["lint"]);
  });
  test("getNonSessionTasks preserves the source target for workspace and user tasks", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: "/user/tasks.json" });
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("workspaceTask", "npm run workspace")
    ]));
    fileContents.set(userTasksUri.toString(), tasksJsonContent([
      makeTask("userTask", "npm run user")
    ]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    const nonSessionTasks = await service.getNonSessionTasks(session);
    assert.deepStrictEqual(nonSessionTasks, [
      { task: { label: "workspaceTask", type: "shell", command: "npm run workspace" }, target: "workspace" },
      { task: { label: "userTask", type: "shell", command: "npm run user" }, target: "user" }
    ]);
  });
  test("getNonSessionTasks skips workspace tasks when repository URI has no path", async () => {
    const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: "/user/tasks.json" });
    fileContents.set(userTasksUri.toString(), tasksJsonContent([
      makeTask("userTask", "npm run user")
    ]));
    const session = makeSession({ repository: URI.parse("unknown://workspace") });
    const nonSessionTasks = await service.getNonSessionTasks(session);
    assert.deepStrictEqual(nonSessionTasks, [
      { task: { label: "userTask", type: "shell", command: "npm run user" }, target: "user" }
    ]);
  });
  test("user task operations are skipped when user settings URI has no path", async () => {
    preferencesService.userSettingsResource = URI.parse("test://settings");
    const session = makeSession({ repository: repoUri });
    const task = await service.createAndAddTask(void 0, "npm run dev", session, "user");
    const nonSessionTasks = await service.getNonSessionTasks(session);
    assert.deepStrictEqual({ task, nonSessionTasks, jsonEdits }, { task: void 0, nonSessionTasks: [], jsonEdits: [] });
  });
  test("addTaskToSessions writes inAgents: true to the matching task index", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build"),
      makeTask("test", "npm test")
    ]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    const task = makeTask("test", "npm test");
    await service.addTaskToSessions(task, session, "workspace");
    assert.strictEqual(jsonEdits.length, 1);
    assert.deepStrictEqual(jsonEdits[0].values, [{ path: ["tasks", 1, "inAgents"], value: true }]);
  });
  test("addTaskToSessions does nothing when task label not found", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build")
    ]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.addTaskToSessions(makeTask("nonexistent"), session, "workspace");
    assert.strictEqual(jsonEdits.length, 0);
  });
  test("addTaskToSessions writes to repository and does not commit when no worktree", async () => {
    const repoTasksUri = URI.parse("file:///repo/.vscode/tasks.json");
    fileContents.set(repoTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build"),
      makeTask("test", "npm test")
    ]));
    const session = makeSession({ repository: repoUri });
    await service.addTaskToSessions(makeTask("test", "npm test"), session, "workspace");
    assert.strictEqual(jsonEdits.length, 1);
    assert.strictEqual(jsonEdits[0].uri.toString(), repoTasksUri.toString());
    assert.deepStrictEqual(jsonEdits[0].values, [{ path: ["tasks", 1, "inAgents"], value: true }]);
  });
  test("addTaskToSessions updates runOptions when provided", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build")
    ]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.addTaskToSessions(makeTask("build", "npm run build"), session, "workspace", { runOn: "worktreeCreated" });
    assert.deepStrictEqual(jsonEdits[0].values, [
      { path: ["tasks", 0, "inAgents"], value: true },
      { path: ["tasks", 0, "runOptions"], value: { runOn: "worktreeCreated" } }
    ]);
  });
  test("addTaskToSessions clears runOptions when default is requested", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      { ...makeTask("build", "npm run build"), runOptions: { runOn: "worktreeCreated" } }
    ]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.addTaskToSessions(makeTask("build", "npm run build"), session, "workspace", { runOn: "default" });
    assert.deepStrictEqual(jsonEdits[0].values, [
      { path: ["tasks", 0, "inAgents"], value: true },
      { path: ["tasks", 0, "runOptions"], value: void 0 }
    ]);
  });
  test("createAndAddTask writes new task with inAgents: true", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("existing", "echo hi")
    ]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.createAndAddTask(void 0, "npm run dev", session, "workspace");
    assert.strictEqual(jsonEdits.length, 1);
    const edit = jsonEdits[0];
    assert.strictEqual(edit.uri.toString(), worktreeTasksUri.toString());
    const tasksValue = edit.values.find((v) => v.path[0] === "tasks");
    assert.ok(tasksValue);
    const tasks = tasksValue.value;
    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks[1].label, "npm run dev");
    assert.strictEqual(tasks[1].inAgents, true);
  });
  test("createAndAddTask writes to repository and does not commit when no worktree", async () => {
    const repoTasksUri = URI.parse("file:///repo/.vscode/tasks.json");
    fileContents.set(repoTasksUri.toString(), tasksJsonContent([
      makeTask("existing", "echo hi")
    ]));
    const session = makeSession({ repository: repoUri });
    await service.createAndAddTask(void 0, "npm run dev", session, "workspace");
    assert.strictEqual(jsonEdits.length, 1);
    assert.strictEqual(jsonEdits[0].uri.toString(), repoTasksUri.toString());
    const tasksValue = jsonEdits[0].values.find((v) => v.path[0] === "tasks");
    assert.ok(tasksValue);
    const tasks = tasksValue.value;
    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks[1].label, "npm run dev");
    assert.strictEqual(tasks[1].inAgents, true);
  });
  test("createAndAddTask writes worktreeCreated run option when requested", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.createAndAddTask(void 0, "npm run dev", session, "workspace", { runOn: "worktreeCreated" });
    assert.strictEqual(jsonEdits.length, 1);
    const tasksValue = jsonEdits[0].values.find((v) => v.path[0] === "tasks");
    assert.ok(tasksValue);
    const tasks = tasksValue.value;
    assert.deepStrictEqual(tasks[0].runOptions, { runOn: "worktreeCreated" });
  });
  test("createAndAddTask writes a custom label when provided", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.createAndAddTask("Start Dev Server", "npm run dev", session, "workspace");
    assert.strictEqual(jsonEdits.length, 1);
    const tasksValue = jsonEdits[0].values.find((v) => v.path[0] === "tasks");
    assert.ok(tasksValue);
    const tasks = tasksValue.value;
    assert.strictEqual(tasks[0].label, "Start Dev Server");
    assert.strictEqual(tasks[0].command, "npm run dev");
  });
  test("removeTask deletes the matching task entry", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build", true),
      makeTask("test", "npm test", true),
      makeTask("lint", "npm run lint")
    ]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.removeTask("test", session, "workspace");
    assert.strictEqual(jsonEdits.length, 1);
    assert.deepStrictEqual(jsonEdits[0].values, [{
      path: ["tasks"],
      value: [
        makeTask("build", "npm run build", true),
        { label: "lint", type: "shell", command: "npm run lint" }
      ]
    }]);
  });
  test("updateTask replaces an existing task in place", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build", true),
      makeTask("test", "npm test", true)
    ]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.updateTask("test", {
      label: "Test Changed",
      type: "shell",
      command: "pnpm test",
      inAgents: true,
      runOptions: { runOn: "worktreeCreated" }
    }, session, "workspace", "workspace");
    assert.strictEqual(jsonEdits.length, 1);
    assert.deepStrictEqual(jsonEdits[0].values, [{
      path: ["tasks"],
      value: [
        makeTask("build", "npm run build", true),
        {
          label: "Test Changed",
          type: "shell",
          command: "pnpm test",
          inAgents: true,
          runOptions: { runOn: "worktreeCreated" }
        }
      ]
    }]);
  });
  test("updateTask moves a task between workspace and user storage", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    const userTasksUri = URI.from({ scheme: userSettingsUri.scheme, path: "/user/tasks.json" });
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build", true)
    ]));
    fileContents.set(userTasksUri.toString(), tasksJsonContent([
      makeTask("userExisting", "npm run user", true)
    ]));
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.updateTask("build", {
      label: "Build Changed",
      type: "shell",
      command: "pnpm build",
      inAgents: true
    }, session, "workspace", "user");
    assert.strictEqual(jsonEdits.length, 2);
    assert.deepStrictEqual(jsonEdits[0], {
      uri: worktreeTasksUri,
      values: [{
        path: ["tasks"],
        value: []
      }]
    });
    assert.deepStrictEqual(jsonEdits[1], {
      uri: userTasksUri,
      values: [
        { path: ["version"], value: "2.0.0" },
        {
          path: ["tasks"],
          value: [
            makeTask("userExisting", "npm run user", true),
            {
              label: "Build Changed",
              type: "shell",
              command: "pnpm build",
              inAgents: true
            }
          ]
        }
      ]
    });
  });
  test("getPinnedTaskLabel returns undefined when no task is pinned", () => {
    const obs = service.getPinnedTaskLabel(repoUri);
    assert.strictEqual(obs.get(), void 0);
  });
  test("setPinnedTaskLabel stores and clears the pinned task label", () => {
    const obs = service.getPinnedTaskLabel(repoUri);
    service.setPinnedTaskLabel(repoUri, "build");
    assert.strictEqual(obs.get(), "build");
    service.setPinnedTaskLabel(repoUri, void 0);
    assert.strictEqual(obs.get(), void 0);
  });
  test("updateTask keeps the pinned task in sync when the label changes", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build", true)
    ]));
    service.setPinnedTaskLabel(repoUri, "build");
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.updateTask("build", {
      label: "build:watch",
      type: "shell",
      command: "npm run watch",
      inAgents: true
    }, session, "workspace", "workspace");
    assert.strictEqual(service.getPinnedTaskLabel(repoUri).get(), "build:watch");
  });
  test("removeTask clears the pinned task when deleting the pinned entry", async () => {
    const worktreeTasksUri = URI.parse("file:///worktree/.vscode/tasks.json");
    fileContents.set(worktreeTasksUri.toString(), tasksJsonContent([
      makeTask("build", "npm run build", true)
    ]));
    service.setPinnedTaskLabel(repoUri, "build");
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.removeTask("build", session, "workspace");
    assert.strictEqual(service.getPinnedTaskLabel(repoUri).get(), void 0);
  });
  test("runTask delegates to the registry runner", async () => {
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.runTask(makeTask("build", "npm run build"), session);
    assert.strictEqual(ranTasks.length, 1);
    assert.strictEqual(ranTasks[0].label, "build");
    assert.strictEqual(ranTasks[0].session, session);
  });
  test("runTask is a no-op when no runner claims the session", async () => {
    runnerCanRun = () => false;
    const session = makeSession({ worktree: worktreeUri, repository: repoUri });
    await service.runTask(makeTask("build", "npm run build"), session);
    assert.strictEqual(ranTasks.length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvbnNUYXNrU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJSlNPTkVkaXRpbmdTZXJ2aWNlLCBJSlNPTlZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2pzb25FZGl0aW5nLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElOb25TZXNzaW9uVGFza0VudHJ5LCBJU2Vzc2lvbnNUYXNrc1NlcnZpY2UsIFNlc3Npb25zVGFza3NTZXJ2aWNlLCBJVGFza0VudHJ5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uc1Rhc2tzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIElDaGF0LCBJU2Vzc2lvbiwgSVNlc3Npb25Gb2xkZXIsIElTZXNzaW9uV29ya3NwYWNlLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElTZXNzaW9uVGFza1J1bm5lciwgSVNlc3Npb25UYXNrUnVubmVyUmVnaXN0cnksIFNlc3Npb25UYXNrUnVubmVyUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25UYXNrUnVubmVyLmpzJztcblxuZnVuY3Rpb24gbWFrZVNlc3Npb24ob3B0czogeyByZXBvc2l0b3J5PzogVVJJOyB3b3JrdHJlZT86IFVSSSB9ID0ge30pOiBJU2Vzc2lvbiB7XG5cdGNvbnN0IHdvcmtzcGFjZSA9IG9wdHMucmVwb3NpdG9yeSA/IHtcblx0XHR1cmk6IG9wdHMucmVwb3NpdG9yeSxcblx0XHRsYWJlbDogJ3Rlc3QnLFxuXHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdGZvbGRlcnM6IFt7XG5cdFx0XHRyb290OiBvcHRzLnJlcG9zaXRvcnksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBvcHRzLndvcmt0cmVlID8/IG9wdHMucmVwb3NpdG9yeSxcblx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRnaXRSZXBvc2l0b3J5OiB7IHVyaTogb3B0cy5yZXBvc2l0b3J5LCB3b3JrVHJlZVVyaTogb3B0cy53b3JrdHJlZSwgYmFzZUJyYW5jaE5hbWU6IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkgfSxcblx0XHR9IHNhdGlzZmllcyBJU2Vzc2lvbkZvbGRlcl0sXG5cdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdH0gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGNoYXQ6IElDaGF0ID0ge1xuXHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vc2Vzc2lvbicpLFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcblx0XHR0aXRsZTogb2JzZXJ2YWJsZVZhbHVlKCd0aXRsZScsICdzZXNzaW9uJyksXG5cdFx0dXBkYXRlZEF0OiBvYnNlcnZhYmxlVmFsdWUoJ3VwZGF0ZWRBdCcsIG5ldyBEYXRlKCkpLFxuXHRcdHN0YXR1czogb2JzZXJ2YWJsZVZhbHVlKCdzdGF0dXMnLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSxcblx0XHRjaGFuZ2VzOiBvYnNlcnZhYmxlVmFsdWUoJ2NoYW5nZXMnLCBbXSksXG5cdFx0bW9kZWxJZDogb2JzZXJ2YWJsZVZhbHVlKCdtb2RlbElkJywgdW5kZWZpbmVkKSxcblx0XHRtb2RlOiBvYnNlcnZhYmxlVmFsdWUoJ21vZGUnLCB1bmRlZmluZWQpLFxuXHRcdGlzQXJjaGl2ZWQ6IG9ic2VydmFibGVWYWx1ZSgnaXNBcmNoaXZlZCcsIGZhbHNlKSxcblx0XHRpc1JlYWQ6IG9ic2VydmFibGVWYWx1ZSgnaXNSZWFkJywgdHJ1ZSksXG5cdFx0aW50ZXJhY3Rpdml0eTogb2JzZXJ2YWJsZVZhbHVlKCdpbnRlcmFjdGl2aXR5JywgQ2hhdEludGVyYWN0aXZpdHkuRnVsbCksXG5cdFx0Y2hlY2twb2ludHM6IG9ic2VydmFibGVWYWx1ZSgnY2hlY2twb2ludHMnLCB1bmRlZmluZWQpLFxuXHRcdGxhc3RUdXJuRW5kOiBvYnNlcnZhYmxlVmFsdWUoJ2xhc3RUdXJuRW5kJywgdW5kZWZpbmVkKSxcblx0XHRkZXNjcmlwdGlvbjogb2JzZXJ2YWJsZVZhbHVlKCdkZXNjcmlwdGlvbicsIHVuZGVmaW5lZCksXG5cdH0gc2F0aXNmaWVzIElDaGF0O1xuXHRjb25zdCBzZXNzaW9uID0ge1xuXHRcdHNlc3Npb25JZDogJ3Rlc3Q6c2Vzc2lvbicsXG5cdFx0cmVzb3VyY2U6IGNoYXQucmVzb3VyY2UsXG5cdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdHNlc3Npb25UeXBlOiAnYmFja2dyb3VuZCcsXG5cdFx0aWNvbjogQ29kaWNvbi5jb3BpbG90LFxuXHRcdGNyZWF0ZWRBdDogY2hhdC5jcmVhdGVkQXQsXG5cdFx0d29ya3NwYWNlOiBvYnNlcnZhYmxlVmFsdWUoJ3dvcmtzcGFjZScsIHdvcmtzcGFjZSBhcyBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZCksXG5cdFx0dGl0bGU6IGNoYXQudGl0bGUsXG5cdFx0dXBkYXRlZEF0OiBjaGF0LnVwZGF0ZWRBdCxcblx0XHRzdGF0dXM6IGNoYXQuc3RhdHVzLFxuXHRcdGNoYW5nZXNldHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0Y2hhbmdlczogY2hhdC5jaGFuZ2VzLFxuXHRcdG1vZGVsSWQ6IGNoYXQubW9kZWxJZCxcblx0XHRtb2RlOiBjaGF0Lm1vZGUsXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKCdsb2FkaW5nJywgZmFsc2UpLFxuXHRcdGlzQXJjaGl2ZWQ6IGNoYXQuaXNBcmNoaXZlZCxcblx0XHRpc1JlYWQ6IGNoYXQuaXNSZWFkLFxuXHRcdGxhc3RUdXJuRW5kOiBjaGF0Lmxhc3RUdXJuRW5kLFxuXHRcdGRlc2NyaXB0aW9uOiBjaGF0LmRlc2NyaXB0aW9uLFxuXHRcdGNoYXRzOiBvYnNlcnZhYmxlVmFsdWUoJ2NoYXRzJywgW2NoYXRdKSxcblx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSB9KSxcblx0fSBzYXRpc2ZpZXMgSVNlc3Npb247XG5cdHJldHVybiBzZXNzaW9uO1xufVxuXG5mdW5jdGlvbiBtYWtlVGFzayhsYWJlbDogc3RyaW5nLCBjb21tYW5kPzogc3RyaW5nLCBpbkFnZW50cz86IGJvb2xlYW4pOiBJVGFza0VudHJ5IHtcblx0cmV0dXJuIHsgbGFiZWwsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6IGNvbW1hbmQgPz8gbGFiZWwsIGluQWdlbnRzIH07XG59XG5cbmZ1bmN0aW9uIG1ha2VOcG1UYXNrKGxhYmVsOiBzdHJpbmcsIHNjcmlwdDogc3RyaW5nLCBpbkFnZW50cz86IGJvb2xlYW4pOiBJVGFza0VudHJ5IHtcblx0cmV0dXJuIHsgbGFiZWwsIHR5cGU6ICducG0nLCBzY3JpcHQsIGluQWdlbnRzIH07XG59XG5cbmZ1bmN0aW9uIG1ha2VVbnN1cHBvcnRlZFRhc2sobGFiZWw6IHN0cmluZywgaW5BZ2VudHM/OiBib29sZWFuKTogSVRhc2tFbnRyeSB7XG5cdHJldHVybiB7IGxhYmVsLCB0eXBlOiAnZ3VscCcsIGNvbW1hbmQ6IGxhYmVsLCBpbkFnZW50cyB9O1xufVxuXG5mdW5jdGlvbiB0YXNrc0pzb25Db250ZW50KHRhc2tzOiBJVGFza0VudHJ5W10pOiBzdHJpbmcge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyB2ZXJzaW9uOiAnMi4wLjAnLCB0YXNrcyB9KTtcbn1cblxuc3VpdGUoJ1Nlc3Npb25zVGFza3NTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgc2VydmljZTogSVNlc3Npb25zVGFza3NTZXJ2aWNlO1xuXHRsZXQgZmlsZUNvbnRlbnRzOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHRsZXQganNvbkVkaXRzOiB7IHVyaTogVVJJOyB2YWx1ZXM6IElKU09OVmFsdWVbXSB9W107XG5cdGxldCByYW5UYXNrczogeyBsYWJlbDogc3RyaW5nOyBzZXNzaW9uOiBJU2Vzc2lvbiB9W107XG5cdGxldCBzdG9yYWdlU2VydmljZTogSW5NZW1vcnlTdG9yYWdlU2VydmljZTtcblx0bGV0IHJlYWRGaWxlQ2FsbHM6IFVSSVtdO1xuXHRsZXQgcnVubmVyQ2FuUnVuOiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IGJvb2xlYW47XG5cdGxldCBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UgJiB7IHVzZXJTZXR0aW5nc1Jlc291cmNlOiBVUkkgfTtcblxuXHRjb25zdCB1c2VyU2V0dGluZ3NVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdXNlci9zZXR0aW5ncy5qc29uJyk7XG5cdGNvbnN0IHJlcG9VcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcmVwbycpO1xuXHRjb25zdCB3b3JrdHJlZVVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3JrdHJlZScpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmaWxlQ29udGVudHMgPSBuZXcgTWFwKCk7XG5cdFx0anNvbkVkaXRzID0gW107XG5cdFx0cmFuVGFza3MgPSBbXTtcblx0XHRyZWFkRmlsZUNhbGxzID0gW107XG5cdFx0cnVubmVyQ2FuUnVuID0gKCkgPT4gdHJ1ZTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRmlsZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRyZWFkRmlsZUNhbGxzLnB1c2gocmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gZmlsZUNvbnRlbnRzLmdldChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKGNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignZmlsZSBub3QgZm91bmQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSB9IGFzIElGaWxlQ29udGVudDtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIHdhdGNoKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0XHRcdG92ZXJyaWRlIG9uRGlkRmlsZXNDaGFuZ2U6IGFueSA9ICgpID0+ICh7IGRpc3Bvc2UoKSB7IH0gfSk7XG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElKU09ORWRpdGluZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUpTT05FZGl0aW5nU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyB3cml0ZShyZXNvdXJjZTogVVJJLCB2YWx1ZXM6IElKU09OVmFsdWVbXSwgX3NhdmU6IGJvb2xlYW4pIHtcblx0XHRcdFx0anNvbkVkaXRzLnB1c2goeyB1cmk6IHJlc291cmNlLCB2YWx1ZXMgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRwcmVmZXJlbmNlc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcmVmZXJlbmNlc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgdXNlclNldHRpbmdzUmVzb3VyY2UgPSB1c2VyU2V0dGluZ3NVcmk7XG5cdFx0fTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcmVmZXJlbmNlc1NlcnZpY2UsIHByZWZlcmVuY2VzU2VydmljZSk7XG5cblx0XHQvLyBSZWFsIHJlZ2lzdHJ5IHdpdGggYSByZWNvcmRpbmcgZmFrZSBydW5uZXIgc28gd2UgZXhlcmNpc2UgdGhlXG5cdFx0Ly8gZGlzcGF0Y2ggcGF0aCBpbiBTZXNzaW9uc1Rhc2tzU2VydmljZS5ydW5UYXNrIHdpdGhvdXQgcHVsbGluZyBpbiB0aGVcblx0XHQvLyB3b3JrYmVuY2ggcnVubmVyJ3MgZGVwZW5kZW5jaWVzLlxuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IFNlc3Npb25UYXNrUnVubmVyUmVnaXN0cnkoKTtcblx0XHRjb25zdCBmYWtlUnVubmVyOiBJU2Vzc2lvblRhc2tSdW5uZXIgPSB7XG5cdFx0XHRpZDogJ2Zha2UnLFxuXHRcdFx0cHJpb3JpdHk6IDAsXG5cdFx0XHRjYW5SdW46IHNlc3Npb24gPT4gcnVubmVyQ2FuUnVuKHNlc3Npb24pLFxuXHRcdFx0cnVuVGFzazogYXN5bmMgKHRhc2ssIHNlc3Npb24pID0+IHsgcmFuVGFza3MucHVzaCh7IGxhYmVsOiB0YXNrLmxhYmVsLCBzZXNzaW9uIH0pOyB9LFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHJlZ2lzdHJ5LnJlZ2lzdGVyKGZha2VSdW5uZXIpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uVGFza1J1bm5lclJlZ2lzdHJ5LCByZWdpc3RyeSk7XG5cblx0XHRzdG9yYWdlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0c2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc1Rhc2tzU2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tIGdldFNlc3Npb25UYXNrcyAtLS1cblxuXHR0ZXN0KCdnZXRTZXNzaW9uVGFza3MgcmV0dXJucyB0YXNrcyB3aXRoIGluQWdlbnRzOiB0cnVlIGZyb20gd29ya3RyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVUYXNrc1VyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3JrdHJlZS8udnNjb2RlL3Rhc2tzLmpzb24nKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHdvcmt0cmVlVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcsIHRydWUpLFxuXHRcdFx0bWFrZVRhc2soJ2xpbnQnLCAnbnBtIHJ1biBsaW50JywgZmFsc2UpLFxuXHRcdFx0bWFrZVRhc2soJ3Rlc3QnLCAnbnBtIHRlc3QnLCB0cnVlKSxcblx0XHRcdG1ha2VOcG1UYXNrKCd3YXRjaCcsICd3YXRjaCcsIHRydWUpLFxuXHRcdFx0bWFrZVVuc3VwcG9ydGVkVGFzaygnZ3VscC10YXNrJywgdHJ1ZSksXG5cdFx0XSkpO1xuXHRcdC8vIHVzZXIgdGFza3MuanNvbiBcdTIwMTQgZW1wdHlcblx0XHRjb25zdCB1c2VyVGFza3NVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogdXNlclNldHRpbmdzVXJpLnNjaGVtZSwgcGF0aDogJy91c2VyL3Rhc2tzLmpzb24nIH0pO1xuXHRcdGZpbGVDb250ZW50cy5zZXQodXNlclRhc2tzVXJpLnRvU3RyaW5nKCksIHRhc2tzSnNvbkNvbnRlbnQoW10pKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcmVwb3NpdG9yeTogcmVwb1VyaSB9KTtcblx0XHRjb25zdCBvYnMgPSBzZXJ2aWNlLmdldFNlc3Npb25UYXNrcyhzZXNzaW9uKTtcblxuXHRcdC8vIExldCBhc3luYyByZWZyZXNoIHNldHRsZVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXHRcdGNvbnN0IHRhc2tzID0gb2JzLmdldCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXNrcy5tYXAodCA9PiB0LnRhc2subGFiZWwpLCBbJ2J1aWxkJywgJ3Rlc3QnLCAnd2F0Y2gnLCAnZ3VscC10YXNrJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9uVGFza3MgcmV0dXJucyBlbXB0eSBhcnJheSB3aGVuIG5vIHdvcmt0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHJlcG9zaXRvcnk6IHJlcG9VcmkgfSk7XG5cdFx0Y29uc3Qgb2JzID0gc2VydmljZS5nZXRTZXNzaW9uVGFza3Moc2Vzc2lvbik7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9icy5nZXQoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9uVGFza3MgcmVhZHMgZnJvbSByZXBvc2l0b3J5IHdoZW4gbm8gd29ya3RyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVwb1Rhc2tzVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8vLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldChyZXBvVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygnc2VydmUnLCAnbnBtIHJ1biBzZXJ2ZScsIHRydWUpLFxuXHRcdFx0bWFrZVRhc2soJ2xpbnQnLCAnbnBtIHJ1biBsaW50JywgZmFsc2UpLFxuXHRcdF0pKTtcblx0XHRjb25zdCB1c2VyVGFza3NVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogdXNlclNldHRpbmdzVXJpLnNjaGVtZSwgcGF0aDogJy91c2VyL3Rhc2tzLmpzb24nIH0pO1xuXHRcdGZpbGVDb250ZW50cy5zZXQodXNlclRhc2tzVXJpLnRvU3RyaW5nKCksIHRhc2tzSnNvbkNvbnRlbnQoW10pKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHJlcG9zaXRvcnk6IHJlcG9VcmkgfSk7XG5cdFx0Y29uc3Qgb2JzID0gc2VydmljZS5nZXRTZXNzaW9uVGFza3Moc2Vzc2lvbik7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9icy5nZXQoKS5tYXAodCA9PiB0LnRhc2subGFiZWwpLCBbJ3NlcnZlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9uVGFza3MgZG9lcyBub3QgcmUtcmVhZCBmaWxlcyBvbiByZXBlYXRlZCBjYWxscyBmb3IgdGhlIHNhbWUgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVGFza3NVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3RyZWUvLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0Y29uc3QgdXNlclRhc2tzVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IHVzZXJTZXR0aW5nc1VyaS5zY2hlbWUsIHBhdGg6ICcvdXNlci90YXNrcy5qc29uJyB9KTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHdvcmt0cmVlVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcsIHRydWUpLFxuXHRcdF0pKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHVzZXJUYXNrc1VyaS50b1N0cmluZygpLCB0YXNrc0pzb25Db250ZW50KFtdKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oeyB3b3JrdHJlZTogd29ya3RyZWVVcmksIHJlcG9zaXRvcnk6IHJlcG9VcmkgfSk7XG5cblx0XHQvLyBDYWxsIGdldFNlc3Npb25UYXNrcyBtdWx0aXBsZSB0aW1lcyBmb3IgdGhlIHNhbWUgc2Vzc2lvbi9mb2xkZXJcblx0XHRzZXJ2aWNlLmdldFNlc3Npb25UYXNrcyhzZXNzaW9uKTtcblx0XHRzZXJ2aWNlLmdldFNlc3Npb25UYXNrcyhzZXNzaW9uKTtcblx0XHRzZXJ2aWNlLmdldFNlc3Npb25UYXNrcyhzZXNzaW9uKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0Ly8gX3JlZnJlc2hTZXNzaW9uVGFza3MgcmVhZHMgdHdvIGZpbGVzICh3b3Jrc3BhY2UgKyB1c2VyIHRhc2tzLmpzb24pLlxuXHRcdC8vIElmIHJlZnJlc2ggdHJpZ2dlcmVkIG1vcmUgdGhhbiBvbmNlLCB3ZSdkIHNlZSA+IDIgcmVhZHMuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlQ2FsbHMubGVuZ3RoLCAyLCAnc2hvdWxkIHJlYWQgZmlsZXMgb25seSBvbmNlIChubyBkdXBsaWNhdGUgcmVmcmVzaCknKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U2Vzc2lvblRhc2tzIHNraXBzIHdvcmtzcGFjZSB0YXNrcyB3aGVuIHJlcG9zaXRvcnkgVVJJIGhhcyBubyBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVzZXJUYXNrc1VyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiB1c2VyU2V0dGluZ3NVcmkuc2NoZW1lLCBwYXRoOiAnL3VzZXIvdGFza3MuanNvbicgfSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh1c2VyVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygndXNlclRhc2snLCAnbnBtIHJ1biB1c2VyJywgdHJ1ZSksXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgcmVwb3NpdG9yeTogVVJJLnBhcnNlKCd1bmtub3duOi8vd29ya3NwYWNlJykgfSk7XG5cdFx0Y29uc3Qgb2JzID0gc2VydmljZS5nZXRTZXNzaW9uVGFza3Moc2Vzc2lvbik7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9icy5nZXQoKSwgW3sgdGFzazogbWFrZVRhc2soJ3VzZXJUYXNrJywgJ25wbSBydW4gdXNlcicsIHRydWUpLCB0YXJnZXQ6ICd1c2VyJyB9XSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBnZXROb25TZXNzaW9uVGFza3MgLS0tXG5cblx0dGVzdCgnZ2V0Tm9uU2Vzc2lvblRhc2tzIHJldHVybnMgb25seSB0YXNrcyB3aXRob3V0IGluQWdlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVGFza3NVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3RyZWUvLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh3b3JrdHJlZVRhc2tzVXJpLnRvU3RyaW5nKCksIHRhc2tzSnNvbkNvbnRlbnQoW1xuXHRcdFx0bWFrZVRhc2soJ2J1aWxkJywgJ25wbSBydW4gYnVpbGQnLCB0cnVlKSxcblx0XHRcdG1ha2VUYXNrKCdsaW50JywgJ25wbSBydW4gbGludCcsIGZhbHNlKSxcblx0XHRcdG1ha2VUYXNrKCd0ZXN0JywgJ25wbSB0ZXN0JyksXG5cdFx0XHRtYWtlTnBtVGFzaygnd2F0Y2gnLCAnd2F0Y2gnLCBmYWxzZSksXG5cdFx0XHRtYWtlVW5zdXBwb3J0ZWRUYXNrKCdndWxwLXRhc2snLCBmYWxzZSksXG5cdFx0XSkpO1xuXHRcdGNvbnN0IHVzZXJUYXNrc1VyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiB1c2VyU2V0dGluZ3NVcmkuc2NoZW1lLCBwYXRoOiAnL3VzZXIvdGFza3MuanNvbicgfSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh1c2VyVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCByZXBvc2l0b3J5OiByZXBvVXJpIH0pO1xuXHRcdGNvbnN0IG5vblNlc3Npb25UYXNrcyA9IGF3YWl0IHNlcnZpY2UuZ2V0Tm9uU2Vzc2lvblRhc2tzKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub25TZXNzaW9uVGFza3MubWFwKHQgPT4gdC50YXNrLmxhYmVsKSwgWydsaW50JywgJ3Rlc3QnLCAnd2F0Y2gnLCAnZ3VscC10YXNrJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXROb25TZXNzaW9uVGFza3MgcmVhZHMgZnJvbSByZXBvc2l0b3J5IHdoZW4gbm8gd29ya3RyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVwb1Rhc2tzVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8vLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldChyZXBvVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcsIHRydWUpLFxuXHRcdFx0bWFrZVRhc2soJ2xpbnQnLCAnbnBtIHJ1biBsaW50JywgZmFsc2UpLFxuXHRcdF0pKTtcblx0XHRjb25zdCB1c2VyVGFza3NVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogdXNlclNldHRpbmdzVXJpLnNjaGVtZSwgcGF0aDogJy91c2VyL3Rhc2tzLmpzb24nIH0pO1xuXHRcdGZpbGVDb250ZW50cy5zZXQodXNlclRhc2tzVXJpLnRvU3RyaW5nKCksIHRhc2tzSnNvbkNvbnRlbnQoW10pKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHJlcG9zaXRvcnk6IHJlcG9VcmkgfSk7XG5cdFx0Y29uc3Qgbm9uU2Vzc2lvblRhc2tzID0gYXdhaXQgc2VydmljZS5nZXROb25TZXNzaW9uVGFza3Moc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vblNlc3Npb25UYXNrcy5tYXAodCA9PiB0LnRhc2subGFiZWwpLCBbJ2xpbnQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE5vblNlc3Npb25UYXNrcyBwcmVzZXJ2ZXMgdGhlIHNvdXJjZSB0YXJnZXQgZm9yIHdvcmtzcGFjZSBhbmQgdXNlciB0YXNrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVRhc2tzVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmt0cmVlLy52c2NvZGUvdGFza3MuanNvbicpO1xuXHRcdGNvbnN0IHVzZXJUYXNrc1VyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiB1c2VyU2V0dGluZ3NVcmkuc2NoZW1lLCBwYXRoOiAnL3VzZXIvdGFza3MuanNvbicgfSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh3b3JrdHJlZVRhc2tzVXJpLnRvU3RyaW5nKCksIHRhc2tzSnNvbkNvbnRlbnQoW1xuXHRcdFx0bWFrZVRhc2soJ3dvcmtzcGFjZVRhc2snLCAnbnBtIHJ1biB3b3Jrc3BhY2UnKSxcblx0XHRdKSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh1c2VyVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygndXNlclRhc2snLCAnbnBtIHJ1biB1c2VyJyksXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCByZXBvc2l0b3J5OiByZXBvVXJpIH0pO1xuXHRcdGNvbnN0IG5vblNlc3Npb25UYXNrcyA9IGF3YWl0IHNlcnZpY2UuZ2V0Tm9uU2Vzc2lvblRhc2tzKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub25TZXNzaW9uVGFza3MsIFtcblx0XHRcdHsgdGFzazogeyBsYWJlbDogJ3dvcmtzcGFjZVRhc2snLCB0eXBlOiAnc2hlbGwnLCBjb21tYW5kOiAnbnBtIHJ1biB3b3Jrc3BhY2UnIH0sIHRhcmdldDogJ3dvcmtzcGFjZScgfSxcblx0XHRcdHsgdGFzazogeyBsYWJlbDogJ3VzZXJUYXNrJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ25wbSBydW4gdXNlcicgfSwgdGFyZ2V0OiAndXNlcicgfSxcblx0XHRdIHNhdGlzZmllcyBJTm9uU2Vzc2lvblRhc2tFbnRyeVtdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Tm9uU2Vzc2lvblRhc2tzIHNraXBzIHdvcmtzcGFjZSB0YXNrcyB3aGVuIHJlcG9zaXRvcnkgVVJJIGhhcyBubyBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVzZXJUYXNrc1VyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiB1c2VyU2V0dGluZ3NVcmkuc2NoZW1lLCBwYXRoOiAnL3VzZXIvdGFza3MuanNvbicgfSk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh1c2VyVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygndXNlclRhc2snLCAnbnBtIHJ1biB1c2VyJyksXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgcmVwb3NpdG9yeTogVVJJLnBhcnNlKCd1bmtub3duOi8vd29ya3NwYWNlJykgfSk7XG5cdFx0Y29uc3Qgbm9uU2Vzc2lvblRhc2tzID0gYXdhaXQgc2VydmljZS5nZXROb25TZXNzaW9uVGFza3Moc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vblNlc3Npb25UYXNrcywgW1xuXHRcdFx0eyB0YXNrOiB7IGxhYmVsOiAndXNlclRhc2snLCB0eXBlOiAnc2hlbGwnLCBjb21tYW5kOiAnbnBtIHJ1biB1c2VyJyB9LCB0YXJnZXQ6ICd1c2VyJyB9LFxuXHRcdF0gc2F0aXNmaWVzIElOb25TZXNzaW9uVGFza0VudHJ5W10pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VyIHRhc2sgb3BlcmF0aW9ucyBhcmUgc2tpcHBlZCB3aGVuIHVzZXIgc2V0dGluZ3MgVVJJIGhhcyBubyBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdHByZWZlcmVuY2VzU2VydmljZS51c2VyU2V0dGluZ3NSZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdDovL3NldHRpbmdzJyk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oeyByZXBvc2l0b3J5OiByZXBvVXJpIH0pO1xuXHRcdGNvbnN0IHRhc2sgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUFuZEFkZFRhc2sodW5kZWZpbmVkLCAnbnBtIHJ1biBkZXYnLCBzZXNzaW9uLCAndXNlcicpO1xuXHRcdGNvbnN0IG5vblNlc3Npb25UYXNrcyA9IGF3YWl0IHNlcnZpY2UuZ2V0Tm9uU2Vzc2lvblRhc2tzKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHRhc2ssIG5vblNlc3Npb25UYXNrcywganNvbkVkaXRzIH0sIHsgdGFzazogdW5kZWZpbmVkLCBub25TZXNzaW9uVGFza3M6IFtdLCBqc29uRWRpdHM6IFtdIH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gYWRkVGFza1RvU2Vzc2lvbnMgLS0tXG5cblx0dGVzdCgnYWRkVGFza1RvU2Vzc2lvbnMgd3JpdGVzIGluQWdlbnRzOiB0cnVlIHRvIHRoZSBtYXRjaGluZyB0YXNrIGluZGV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVGFza3NVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3RyZWUvLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh3b3JrdHJlZVRhc2tzVXJpLnRvU3RyaW5nKCksIHRhc2tzSnNvbkNvbnRlbnQoW1xuXHRcdFx0bWFrZVRhc2soJ2J1aWxkJywgJ25wbSBydW4gYnVpbGQnKSxcblx0XHRcdG1ha2VUYXNrKCd0ZXN0JywgJ25wbSB0ZXN0JyksXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCByZXBvc2l0b3J5OiByZXBvVXJpIH0pO1xuXHRcdGNvbnN0IHRhc2sgPSBtYWtlVGFzaygndGVzdCcsICducG0gdGVzdCcpO1xuXHRcdGF3YWl0IHNlcnZpY2UuYWRkVGFza1RvU2Vzc2lvbnModGFzaywgc2Vzc2lvbiwgJ3dvcmtzcGFjZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpzb25FZGl0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbkVkaXRzWzBdLnZhbHVlcywgW3sgcGF0aDogWyd0YXNrcycsIDEsICdpbkFnZW50cyddLCB2YWx1ZTogdHJ1ZSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFRhc2tUb1Nlc3Npb25zIGRvZXMgbm90aGluZyB3aGVuIHRhc2sgbGFiZWwgbm90IGZvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVGFza3NVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3RyZWUvLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh3b3JrdHJlZVRhc2tzVXJpLnRvU3RyaW5nKCksIHRhc2tzSnNvbkNvbnRlbnQoW1xuXHRcdFx0bWFrZVRhc2soJ2J1aWxkJywgJ25wbSBydW4gYnVpbGQnKSxcblx0XHRdKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oeyB3b3JrdHJlZTogd29ya3RyZWVVcmksIHJlcG9zaXRvcnk6IHJlcG9VcmkgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5hZGRUYXNrVG9TZXNzaW9ucyhtYWtlVGFzaygnbm9uZXhpc3RlbnQnKSwgc2Vzc2lvbiwgJ3dvcmtzcGFjZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpzb25FZGl0cy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRUYXNrVG9TZXNzaW9ucyB3cml0ZXMgdG8gcmVwb3NpdG9yeSBhbmQgZG9lcyBub3QgY29tbWl0IHdoZW4gbm8gd29ya3RyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVwb1Rhc2tzVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8vLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldChyZXBvVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcpLFxuXHRcdFx0bWFrZVRhc2soJ3Rlc3QnLCAnbnBtIHRlc3QnKSxcblx0XHRdKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oeyByZXBvc2l0b3J5OiByZXBvVXJpIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuYWRkVGFza1RvU2Vzc2lvbnMobWFrZVRhc2soJ3Rlc3QnLCAnbnBtIHRlc3QnKSwgc2Vzc2lvbiwgJ3dvcmtzcGFjZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpzb25FZGl0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChqc29uRWRpdHNbMF0udXJpLnRvU3RyaW5nKCksIHJlcG9UYXNrc1VyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGpzb25FZGl0c1swXS52YWx1ZXMsIFt7IHBhdGg6IFsndGFza3MnLCAxLCAnaW5BZ2VudHMnXSwgdmFsdWU6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRUYXNrVG9TZXNzaW9ucyB1cGRhdGVzIHJ1bk9wdGlvbnMgd2hlbiBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVRhc2tzVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmt0cmVlLy52c2NvZGUvdGFza3MuanNvbicpO1xuXHRcdGZpbGVDb250ZW50cy5zZXQod29ya3RyZWVUYXNrc1VyaS50b1N0cmluZygpLCB0YXNrc0pzb25Db250ZW50KFtcblx0XHRcdG1ha2VUYXNrKCdidWlsZCcsICducG0gcnVuIGJ1aWxkJyksXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCByZXBvc2l0b3J5OiByZXBvVXJpIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuYWRkVGFza1RvU2Vzc2lvbnMobWFrZVRhc2soJ2J1aWxkJywgJ25wbSBydW4gYnVpbGQnKSwgc2Vzc2lvbiwgJ3dvcmtzcGFjZScsIHsgcnVuT246ICd3b3JrdHJlZUNyZWF0ZWQnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uRWRpdHNbMF0udmFsdWVzLCBbXG5cdFx0XHR7IHBhdGg6IFsndGFza3MnLCAwLCAnaW5BZ2VudHMnXSwgdmFsdWU6IHRydWUgfSxcblx0XHRcdHsgcGF0aDogWyd0YXNrcycsIDAsICdydW5PcHRpb25zJ10sIHZhbHVlOiB7IHJ1bk9uOiAnd29ya3RyZWVDcmVhdGVkJyB9IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZFRhc2tUb1Nlc3Npb25zIGNsZWFycyBydW5PcHRpb25zIHdoZW4gZGVmYXVsdCBpcyByZXF1ZXN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVUYXNrc1VyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3JrdHJlZS8udnNjb2RlL3Rhc2tzLmpzb24nKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHdvcmt0cmVlVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHR7IC4uLm1ha2VUYXNrKCdidWlsZCcsICducG0gcnVuIGJ1aWxkJyksIHJ1bk9wdGlvbnM6IHsgcnVuT246ICd3b3JrdHJlZUNyZWF0ZWQnIH0gfSxcblx0XHRdKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oeyB3b3JrdHJlZTogd29ya3RyZWVVcmksIHJlcG9zaXRvcnk6IHJlcG9VcmkgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5hZGRUYXNrVG9TZXNzaW9ucyhtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcpLCBzZXNzaW9uLCAnd29ya3NwYWNlJywgeyBydW5PbjogJ2RlZmF1bHQnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uRWRpdHNbMF0udmFsdWVzLCBbXG5cdFx0XHR7IHBhdGg6IFsndGFza3MnLCAwLCAnaW5BZ2VudHMnXSwgdmFsdWU6IHRydWUgfSxcblx0XHRcdHsgcGF0aDogWyd0YXNrcycsIDAsICdydW5PcHRpb25zJ10sIHZhbHVlOiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0Ly8gLS0tIGNyZWF0ZUFuZEFkZFRhc2sgLS0tXG5cblx0dGVzdCgnY3JlYXRlQW5kQWRkVGFzayB3cml0ZXMgbmV3IHRhc2sgd2l0aCBpbkFnZW50czogdHJ1ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZVRhc2tzVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmt0cmVlLy52c2NvZGUvdGFza3MuanNvbicpO1xuXHRcdGZpbGVDb250ZW50cy5zZXQod29ya3RyZWVUYXNrc1VyaS50b1N0cmluZygpLCB0YXNrc0pzb25Db250ZW50KFtcblx0XHRcdG1ha2VUYXNrKCdleGlzdGluZycsICdlY2hvIGhpJyksXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCByZXBvc2l0b3J5OiByZXBvVXJpIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQW5kQWRkVGFzayh1bmRlZmluZWQsICducG0gcnVuIGRldicsIHNlc3Npb24sICd3b3Jrc3BhY2UnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChqc29uRWRpdHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBlZGl0ID0ganNvbkVkaXRzWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0LnVyaS50b1N0cmluZygpLCB3b3JrdHJlZVRhc2tzVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IHRhc2tzVmFsdWUgPSBlZGl0LnZhbHVlcy5maW5kKHYgPT4gdi5wYXRoWzBdID09PSAndGFza3MnKTtcblx0XHRhc3NlcnQub2sodGFza3NWYWx1ZSk7XG5cdFx0Y29uc3QgdGFza3MgPSB0YXNrc1ZhbHVlIS52YWx1ZSBhcyBJVGFza0VudHJ5W107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhc2tzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhc2tzWzFdLmxhYmVsLCAnbnBtIHJ1biBkZXYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFza3NbMV0uaW5BZ2VudHMsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRBZGRUYXNrIHdyaXRlcyB0byByZXBvc2l0b3J5IGFuZCBkb2VzIG5vdCBjb21taXQgd2hlbiBubyB3b3JrdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXBvVGFza3NVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vcmVwby8udnNjb2RlL3Rhc2tzLmpzb24nKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHJlcG9UYXNrc1VyaS50b1N0cmluZygpLCB0YXNrc0pzb25Db250ZW50KFtcblx0XHRcdG1ha2VUYXNrKCdleGlzdGluZycsICdlY2hvIGhpJyksXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgcmVwb3NpdG9yeTogcmVwb1VyaSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUFuZEFkZFRhc2sodW5kZWZpbmVkLCAnbnBtIHJ1biBkZXYnLCBzZXNzaW9uLCAnd29ya3NwYWNlJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoanNvbkVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpzb25FZGl0c1swXS51cmkudG9TdHJpbmcoKSwgcmVwb1Rhc2tzVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IHRhc2tzVmFsdWUgPSBqc29uRWRpdHNbMF0udmFsdWVzLmZpbmQodiA9PiB2LnBhdGhbMF0gPT09ICd0YXNrcycpO1xuXHRcdGFzc2VydC5vayh0YXNrc1ZhbHVlKTtcblx0XHRjb25zdCB0YXNrcyA9IHRhc2tzVmFsdWUhLnZhbHVlIGFzIElUYXNrRW50cnlbXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFza3MubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFza3NbMV0ubGFiZWwsICducG0gcnVuIGRldicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXNrc1sxXS5pbkFnZW50cywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZEFkZFRhc2sgd3JpdGVzIHdvcmt0cmVlQ3JlYXRlZCBydW4gb3B0aW9uIHdoZW4gcmVxdWVzdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVGFza3NVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3RyZWUvLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh3b3JrdHJlZVRhc2tzVXJpLnRvU3RyaW5nKCksIHRhc2tzSnNvbkNvbnRlbnQoW10pKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcmVwb3NpdG9yeTogcmVwb1VyaSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUFuZEFkZFRhc2sodW5kZWZpbmVkLCAnbnBtIHJ1biBkZXYnLCBzZXNzaW9uLCAnd29ya3NwYWNlJywgeyBydW5PbjogJ3dvcmt0cmVlQ3JlYXRlZCcgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoanNvbkVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgdGFza3NWYWx1ZSA9IGpzb25FZGl0c1swXS52YWx1ZXMuZmluZCh2ID0+IHYucGF0aFswXSA9PT0gJ3Rhc2tzJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhc2tzVmFsdWUpO1xuXHRcdGNvbnN0IHRhc2tzID0gdGFza3NWYWx1ZSEudmFsdWUgYXMgSVRhc2tFbnRyeVtdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFza3NbMF0ucnVuT3B0aW9ucywgeyBydW5PbjogJ3dvcmt0cmVlQ3JlYXRlZCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZEFkZFRhc2sgd3JpdGVzIGEgY3VzdG9tIGxhYmVsIHdoZW4gcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVUYXNrc1VyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3JrdHJlZS8udnNjb2RlL3Rhc2tzLmpzb24nKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHdvcmt0cmVlVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCByZXBvc2l0b3J5OiByZXBvVXJpIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQW5kQWRkVGFzaygnU3RhcnQgRGV2IFNlcnZlcicsICducG0gcnVuIGRldicsIHNlc3Npb24sICd3b3Jrc3BhY2UnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChqc29uRWRpdHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCB0YXNrc1ZhbHVlID0ganNvbkVkaXRzWzBdLnZhbHVlcy5maW5kKHYgPT4gdi5wYXRoWzBdID09PSAndGFza3MnKTtcblx0XHRhc3NlcnQub2sodGFza3NWYWx1ZSk7XG5cdFx0Y29uc3QgdGFza3MgPSB0YXNrc1ZhbHVlIS52YWx1ZSBhcyBJVGFza0VudHJ5W107XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhc2tzWzBdLmxhYmVsLCAnU3RhcnQgRGV2IFNlcnZlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXNrc1swXS5jb21tYW5kLCAnbnBtIHJ1biBkZXYnKTtcblx0fSk7XG5cblx0Ly8gLS0tIHJlbW92ZVRhc2sgLS0tXG5cblx0dGVzdCgncmVtb3ZlVGFzayBkZWxldGVzIHRoZSBtYXRjaGluZyB0YXNrIGVudHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVGFza3NVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3RyZWUvLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0ZmlsZUNvbnRlbnRzLnNldCh3b3JrdHJlZVRhc2tzVXJpLnRvU3RyaW5nKCksIHRhc2tzSnNvbkNvbnRlbnQoW1xuXHRcdFx0bWFrZVRhc2soJ2J1aWxkJywgJ25wbSBydW4gYnVpbGQnLCB0cnVlKSxcblx0XHRcdG1ha2VUYXNrKCd0ZXN0JywgJ25wbSB0ZXN0JywgdHJ1ZSksXG5cdFx0XHRtYWtlVGFzaygnbGludCcsICducG0gcnVuIGxpbnQnKSxcblx0XHRdKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oeyB3b3JrdHJlZTogd29ya3RyZWVVcmksIHJlcG9zaXRvcnk6IHJlcG9VcmkgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZW1vdmVUYXNrKCd0ZXN0Jywgc2Vzc2lvbiwgJ3dvcmtzcGFjZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpzb25FZGl0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbkVkaXRzWzBdLnZhbHVlcywgW3tcblx0XHRcdHBhdGg6IFsndGFza3MnXSxcblx0XHRcdHZhbHVlOiBbXG5cdFx0XHRcdG1ha2VUYXNrKCdidWlsZCcsICducG0gcnVuIGJ1aWxkJywgdHJ1ZSksXG5cdFx0XHRcdHsgbGFiZWw6ICdsaW50JywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ25wbSBydW4gbGludCcgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHQvLyAtLS0gdXBkYXRlVGFzayAtLS1cblxuXHR0ZXN0KCd1cGRhdGVUYXNrIHJlcGxhY2VzIGFuIGV4aXN0aW5nIHRhc2sgaW4gcGxhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVUYXNrc1VyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3JrdHJlZS8udnNjb2RlL3Rhc2tzLmpzb24nKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHdvcmt0cmVlVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcsIHRydWUpLFxuXHRcdFx0bWFrZVRhc2soJ3Rlc3QnLCAnbnBtIHRlc3QnLCB0cnVlKSxcblx0XHRdKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oeyB3b3JrdHJlZTogd29ya3RyZWVVcmksIHJlcG9zaXRvcnk6IHJlcG9VcmkgfSk7XG5cdFx0YXdhaXQgc2VydmljZS51cGRhdGVUYXNrKCd0ZXN0Jywge1xuXHRcdFx0bGFiZWw6ICdUZXN0IENoYW5nZWQnLFxuXHRcdFx0dHlwZTogJ3NoZWxsJyxcblx0XHRcdGNvbW1hbmQ6ICdwbnBtIHRlc3QnLFxuXHRcdFx0aW5BZ2VudHM6IHRydWUsXG5cdFx0XHRydW5PcHRpb25zOiB7IHJ1bk9uOiAnd29ya3RyZWVDcmVhdGVkJyB9XG5cdFx0fSwgc2Vzc2lvbiwgJ3dvcmtzcGFjZScsICd3b3Jrc3BhY2UnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChqc29uRWRpdHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGpzb25FZGl0c1swXS52YWx1ZXMsIFt7XG5cdFx0XHRwYXRoOiBbJ3Rhc2tzJ10sXG5cdFx0XHR2YWx1ZTogW1xuXHRcdFx0XHRtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcsIHRydWUpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdUZXN0IENoYW5nZWQnLFxuXHRcdFx0XHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3BucG0gdGVzdCcsXG5cdFx0XHRcdFx0aW5BZ2VudHM6IHRydWUsXG5cdFx0XHRcdFx0cnVuT3B0aW9uczogeyBydW5PbjogJ3dvcmt0cmVlQ3JlYXRlZCcgfVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVUYXNrIG1vdmVzIGEgdGFzayBiZXR3ZWVuIHdvcmtzcGFjZSBhbmQgdXNlciBzdG9yYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlVGFza3NVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3RyZWUvLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0Y29uc3QgdXNlclRhc2tzVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IHVzZXJTZXR0aW5nc1VyaS5zY2hlbWUsIHBhdGg6ICcvdXNlci90YXNrcy5qc29uJyB9KTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHdvcmt0cmVlVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcsIHRydWUpLFxuXHRcdF0pKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHVzZXJUYXNrc1VyaS50b1N0cmluZygpLCB0YXNrc0pzb25Db250ZW50KFtcblx0XHRcdG1ha2VUYXNrKCd1c2VyRXhpc3RpbmcnLCAnbnBtIHJ1biB1c2VyJywgdHJ1ZSksXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgd29ya3RyZWU6IHdvcmt0cmVlVXJpLCByZXBvc2l0b3J5OiByZXBvVXJpIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlVGFzaygnYnVpbGQnLCB7XG5cdFx0XHRsYWJlbDogJ0J1aWxkIENoYW5nZWQnLFxuXHRcdFx0dHlwZTogJ3NoZWxsJyxcblx0XHRcdGNvbW1hbmQ6ICdwbnBtIGJ1aWxkJyxcblx0XHRcdGluQWdlbnRzOiB0cnVlLFxuXHRcdH0sIHNlc3Npb24sICd3b3Jrc3BhY2UnLCAndXNlcicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpzb25FZGl0cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbkVkaXRzWzBdLCB7XG5cdFx0XHR1cmk6IHdvcmt0cmVlVGFza3NVcmksXG5cdFx0XHR2YWx1ZXM6IFt7XG5cdFx0XHRcdHBhdGg6IFsndGFza3MnXSxcblx0XHRcdFx0dmFsdWU6IFtdXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbkVkaXRzWzFdLCB7XG5cdFx0XHR1cmk6IHVzZXJUYXNrc1VyaSxcblx0XHRcdHZhbHVlczogW1xuXHRcdFx0XHR7IHBhdGg6IFsndmVyc2lvbiddLCB2YWx1ZTogJzIuMC4wJyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogWyd0YXNrcyddLFxuXHRcdFx0XHRcdHZhbHVlOiBbXG5cdFx0XHRcdFx0XHRtYWtlVGFzaygndXNlckV4aXN0aW5nJywgJ25wbSBydW4gdXNlcicsIHRydWUpLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogJ0J1aWxkIENoYW5nZWQnLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiAncG5wbSBidWlsZCcsXG5cdFx0XHRcdFx0XHRcdGluQWdlbnRzOiB0cnVlLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gcGlubmVkIHRhc2sgLS0tXG5cblx0dGVzdCgnZ2V0UGlubmVkVGFza0xhYmVsIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gdGFzayBpcyBwaW5uZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb2JzID0gc2VydmljZS5nZXRQaW5uZWRUYXNrTGFiZWwocmVwb1VyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9icy5nZXQoKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0UGlubmVkVGFza0xhYmVsIHN0b3JlcyBhbmQgY2xlYXJzIHRoZSBwaW5uZWQgdGFzayBsYWJlbCcsICgpID0+IHtcblx0XHRjb25zdCBvYnMgPSBzZXJ2aWNlLmdldFBpbm5lZFRhc2tMYWJlbChyZXBvVXJpKTtcblxuXHRcdHNlcnZpY2Uuc2V0UGlubmVkVGFza0xhYmVsKHJlcG9VcmksICdidWlsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvYnMuZ2V0KCksICdidWlsZCcpO1xuXG5cdFx0c2VydmljZS5zZXRQaW5uZWRUYXNrTGFiZWwocmVwb1VyaSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob2JzLmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVUYXNrIGtlZXBzIHRoZSBwaW5uZWQgdGFzayBpbiBzeW5jIHdoZW4gdGhlIGxhYmVsIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVUYXNrc1VyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3JrdHJlZS8udnNjb2RlL3Rhc2tzLmpzb24nKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHdvcmt0cmVlVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcsIHRydWUpLFxuXHRcdF0pKTtcblx0XHRzZXJ2aWNlLnNldFBpbm5lZFRhc2tMYWJlbChyZXBvVXJpLCAnYnVpbGQnKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcmVwb3NpdG9yeTogcmVwb1VyaSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZVRhc2soJ2J1aWxkJywge1xuXHRcdFx0bGFiZWw6ICdidWlsZDp3YXRjaCcsXG5cdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0Y29tbWFuZDogJ25wbSBydW4gd2F0Y2gnLFxuXHRcdFx0aW5BZ2VudHM6IHRydWUsXG5cdFx0fSwgc2Vzc2lvbiwgJ3dvcmtzcGFjZScsICd3b3Jrc3BhY2UnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFBpbm5lZFRhc2tMYWJlbChyZXBvVXJpKS5nZXQoKSwgJ2J1aWxkOndhdGNoJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVRhc2sgY2xlYXJzIHRoZSBwaW5uZWQgdGFzayB3aGVuIGRlbGV0aW5nIHRoZSBwaW5uZWQgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3RyZWVUYXNrc1VyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3JrdHJlZS8udnNjb2RlL3Rhc2tzLmpzb24nKTtcblx0XHRmaWxlQ29udGVudHMuc2V0KHdvcmt0cmVlVGFza3NVcmkudG9TdHJpbmcoKSwgdGFza3NKc29uQ29udGVudChbXG5cdFx0XHRtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcsIHRydWUpLFxuXHRcdF0pKTtcblx0XHRzZXJ2aWNlLnNldFBpbm5lZFRhc2tMYWJlbChyZXBvVXJpLCAnYnVpbGQnKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcmVwb3NpdG9yeTogcmVwb1VyaSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlbW92ZVRhc2soJ2J1aWxkJywgc2Vzc2lvbiwgJ3dvcmtzcGFjZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0UGlubmVkVGFza0xhYmVsKHJlcG9VcmkpLmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHQvLyAtLS0gcnVuVGFzayAtLS1cblxuXHR0ZXN0KCdydW5UYXNrIGRlbGVnYXRlcyB0byB0aGUgcmVnaXN0cnkgcnVubmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcmVwb3NpdG9yeTogcmVwb1VyaSB9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucnVuVGFzayhtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcpLCBzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5UYXNrcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5UYXNrc1swXS5sYWJlbCwgJ2J1aWxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhblRhc2tzWzBdLnNlc3Npb24sIHNlc3Npb24pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5UYXNrIGlzIGEgbm8tb3Agd2hlbiBubyBydW5uZXIgY2xhaW1zIHRoZSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJ1bm5lckNhblJ1biA9ICgpID0+IGZhbHNlO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHdvcmt0cmVlOiB3b3JrdHJlZVVyaSwgcmVwb3NpdG9yeTogcmVwb1VyaSB9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucnVuVGFzayhtYWtlVGFzaygnYnVpbGQnLCAnbnBtIHJ1biBidWlsZCcpLCBzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5UYXNrcy5sZW5ndGgsIDApO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLFlBQVk7QUFDckIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBdUIsb0JBQW9CO0FBQzNDLFNBQVMsd0JBQXdCLHVCQUF1QjtBQUN4RCxTQUFTLDJCQUF1QztBQUNoRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFzRCw0QkFBd0M7QUFDOUYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQ2pELFNBQVMsbUJBQXVFLHFCQUFxQjtBQUNyRyxTQUFTLGVBQWU7QUFDeEIsU0FBNkIsNEJBQTRCLGlDQUFpQztBQUUxRixTQUFTLFlBQVksT0FBNkMsQ0FBQyxHQUFhO0FBQy9FLFFBQU0sWUFBWSxLQUFLLGFBQWE7QUFBQSxJQUNuQyxLQUFLLEtBQUs7QUFBQSxJQUNWLE9BQU87QUFBQSxJQUNQLE1BQU0sUUFBUTtBQUFBLElBQ2QsU0FBUyxDQUFDO0FBQUEsTUFDVCxNQUFNLEtBQUs7QUFBQSxNQUNYLGtCQUFrQixLQUFLLFlBQVksS0FBSztBQUFBLE1BQ3hDLE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxNQUNiLGVBQWUsRUFBRSxLQUFLLEtBQUssWUFBWSxhQUFhLEtBQUssVUFBVSxnQkFBZ0IsUUFBVyxZQUFZLGdCQUFnQixNQUFTLEVBQUU7QUFBQSxJQUN0SSxDQUEwQjtBQUFBLElBQzFCLHdCQUF3QjtBQUFBLEVBQ3pCLElBQUk7QUFDSixRQUFNLE9BQWM7QUFBQSxJQUNuQixVQUFVLElBQUksTUFBTSxpQkFBaUI7QUFBQSxJQUNyQyxXQUFXLG9CQUFJLEtBQUs7QUFBQSxJQUNwQixPQUFP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
