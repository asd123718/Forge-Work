import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { OS } from "../../../../../base/common/platform.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { NullLogService, ILogService } from "../../../../../platform/log/common/log.js";
import { AGENT_HOST_SCHEME, toAgentHostUri } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { IAgentHostTerminalService } from "../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js";
import { ITerminalGroupService, ITerminalService } from "../../../../../workbench/contrib/terminal/browser/terminal.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_PREFIX } from "../../../../common/agentHostSessionsProvider.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { IConfigurationResolverService } from "../../../../../workbench/services/configurationResolver/common/configurationResolver.js";
import { ISessionsTasksService } from "../../../chat/browser/sessionsTasksService.js";
import { osToTaskTargetOS } from "../../../chat/browser/taskCommand.js";
import { AgentHostSessionTaskRunner } from "../../browser/agentHostSessionTaskRunner.js";
function makeSession(opts) {
  const folder = opts.cwd ? {
    root: opts.cwd,
    workingDirectory: opts.cwd,
    name: "test",
    description: void 0,
    gitRepository: { uri: opts.cwd, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
  } : void 0;
  const workspace = folder ? {
    uri: opts.cwd,
    label: "test",
    icon: Codicon.folder,
    folders: [folder],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: false
  } : void 0;
  const chat = { resource: URI.parse("file:///session") };
  return {
    sessionId: `${opts.providerId}:session`,
    resource: chat.resource,
    providerId: opts.providerId,
    sessionType: "background",
    icon: Codicon.copilot,
    createdAt: /* @__PURE__ */ new Date(),
    workspace: observableValue("workspace", workspace),
    title: observableValue("title", "session"),
    updatedAt: observableValue("updatedAt", /* @__PURE__ */ new Date()),
    status: observableValue("status", SessionStatus.Untitled),
    changesets: constObservable([]),
    changes: constObservable([]),
    modelId: observableValue("modelId", void 0),
    mode: observableValue("mode", void 0),
    loading: observableValue("loading", false),
    isArchived: observableValue("isArchived", false),
    isRead: observableValue("isRead", true),
    lastTurnEnd: observableValue("lastTurnEnd", void 0),
    description: observableValue("description", void 0),
    chats: observableValue("chats", [chat]),
    mainChat: constObservable(chat),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
}
suite("AgentHostSessionTaskRunner", () => {
  const store = new DisposableStore();
  let runner;
  let createdTerminals;
  let sentText;
  let disposedTerminals;
  let allTasks;
  let resolverCalls;
  const fakeInstance = {
    sendText: async (text, shouldExecute) => {
      sentText.push({ text, shouldExecute });
    },
    dispose: () => {
      disposedTerminals.push(fakeInstance);
    }
  };
  setup(() => {
    createdTerminals = [];
    sentText = [];
    disposedTerminals = [];
    allTasks = [];
    resolverCalls = [];
    const instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IAgentHostTerminalService, new class extends mock() {
      async createTerminalForEntry(address, options) {
        createdTerminals.push({ address, options });
        return fakeInstance;
      }
    }());
    instantiationService.stub(ISessionsTasksService, new class extends mock() {
      async getAllTasks() {
        return allTasks;
      }
    }());
    instantiationService.stub(ISessionsProvidersService, new class extends mock() {
      getProvider(id) {
        if (id === LOCAL_AGENT_HOST_PROVIDER_ID || id.startsWith(REMOTE_AGENT_HOST_PROVIDER_PREFIX)) {
          return new class extends mock() {
            constructor() {
              super(...arguments);
              this.id = id;
              this.remoteAddress = id === LOCAL_AGENT_HOST_PROVIDER_ID ? void 0 : `remote-${id}`;
            }
          }();
        }
        return void 0;
      }
    }());
    instantiationService.stub(ITerminalService, new class extends mock() {
      setActiveInstance() {
      }
    }());
    instantiationService.stub(ITerminalGroupService, new class extends mock() {
      async showPanel() {
      }
    }());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IConfigurationResolverService, new class extends mock() {
      resolveAsync(folder, value) {
        resolverCalls.push(String(value));
        return Promise.resolve(
          typeof value === "string" && folder ? value.replaceAll("${workspaceFolder}", folder.uri.path) : value
        );
      }
    }());
    runner = instantiationService.createInstance(AgentHostSessionTaskRunner);
    void Event;
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function shellTask() {
    return { label: "build", type: "shell", command: "echo", args: ["hi"] };
  }
  test("canRun: false for non-agent-host providers", () => {
    assert.strictEqual(runner.canRun(makeSession({ providerId: "copilot-chat-sessions" })), false);
  });
  test("canRun: true for local agent host", () => {
    assert.strictEqual(runner.canRun(makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID })), true);
  });
  test("canRun: true for remote agent host", () => {
    assert.strictEqual(runner.canRun(makeSession({ providerId: "agenthost-myhost" })), true);
  });
  test("local agent-host sessions pass through file: cwd", async () => {
    const cwd = URI.parse("file:///path/to/worktree");
    const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd });
    (await runner.runTask(shellTask(), session))?.dispose();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].address, "__local__");
    assert.deepStrictEqual(createdTerminals[0].options?.cwd?.toString(), cwd.toString());
    assert.deepStrictEqual(sentText, [{ text: "echo hi", shouldExecute: true }]);
  });
  test("returned handle stops the task by disposing its terminal", async () => {
    const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse("file:///x") });
    const handle = await runner.runTask(shellTask(), session);
    assert.deepStrictEqual(disposedTerminals, []);
    handle?.dispose();
    assert.deepStrictEqual(disposedTerminals, [fakeInstance]);
  });
  test("agent-host scheme cwds are unwrapped to their original URI", async () => {
    const innerCwd = URI.parse("file:///remote/path");
    const wrapped = toAgentHostUri(innerCwd, "remote");
    assert.strictEqual(wrapped.scheme, AGENT_HOST_SCHEME, "precondition: wrapped uri");
    const session = makeSession({ providerId: "agenthost-myhost", cwd: wrapped });
    (await runner.runTask(shellTask(), session))?.dispose();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].options?.cwd?.toString(), innerCwd.toString());
  });
  test("unknown scheme cwds are omitted (host uses default)", async () => {
    const session = makeSession({ providerId: "agenthost-myhost", cwd: URI.parse("vscode-vfs://github/owner/repo") });
    (await runner.runTask(shellTask(), session))?.dispose();
    assert.strictEqual(createdTerminals.length, 1);
    assert.strictEqual(createdTerminals[0].options?.cwd, void 0);
  });
  test("skips when no command can be resolved from the task", async () => {
    const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse("file:///x") });
    (await runner.runTask({ label: "empty" }, session))?.dispose();
    assert.deepStrictEqual(createdTerminals, []);
  });
  test("resolves dependsOn chains against the full tasks.json", async () => {
    const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse("file:///x") });
    const transpile = { label: "Transpile Client", type: "shell", command: "npm", args: ["run", "transpile"] };
    const runDev = { label: "Run Dev", type: "shell", command: "npm", args: ["run", "dev"] };
    const top = {
      label: "Run and Compile Code - OSS",
      dependsOn: ["Transpile Client", "Run Dev"],
      dependsOrder: "sequence",
      inAgents: true
    };
    allTasks = [
      { task: transpile, target: "workspace" },
      { task: runDev, target: "workspace" },
      { task: top, target: "workspace" }
    ];
    (await runner.runTask(top, session))?.dispose();
    assert.deepStrictEqual(sentText, [{ text: "npm run transpile && npm run dev", shouldExecute: true }]);
  });
  test("local agent-host sessions apply OS-specific command overrides", async () => {
    const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd: URI.parse("file:///x") });
    const task = {
      label: "Run Dev Agents",
      type: "shell",
      command: "./scripts/code.sh",
      windows: { command: ".\\scripts\\code.bat" },
      args: ["--agents"]
    };
    (await runner.runTask(task, session))?.dispose();
    const expectedCommand = osToTaskTargetOS(OS) === "windows" ? ".\\scripts\\code.bat" : "./scripts/code.sh";
    assert.deepStrictEqual(sentText, [{ text: `${expectedCommand} --agents`, shouldExecute: true }]);
  });
  test("expands ${workspaceFolder} to the session working directory", async () => {
    const cwd = URI.file("/path/to/worktree");
    const session = makeSession({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, cwd });
    const task = {
      label: "Run Client",
      type: "shell",
      command: "./scripts/code.sh",
      args: ["--user-data-dir=${workspaceFolder}/.profile-oss"]
    };
    (await runner.runTask(task, session))?.dispose();
    assert.deepStrictEqual(sentText, [{
      text: `./scripts/code.sh --user-data-dir=${cwd.path}/.profile-oss`,
      shouldExecute: true
    }]);
    assert.deepStrictEqual(resolverCalls, ["./scripts/code.sh", "--user-data-dir=${workspaceFolder}/.profile-oss"]);
  });
  test("remote agent-host sessions expand ${workspaceFolder} from the POSIX host path without the renderer resolver", async () => {
    const innerCwd = URI.file("/remote/worktree");
    const session = makeSession({ providerId: "agenthost-myhost", cwd: toAgentHostUri(innerCwd, "remote") });
    const task = {
      label: "Run Client",
      type: "shell",
      command: "./scripts/code.sh",
      args: ["--user-data-dir=${workspaceFolder}/.profile-oss"]
    };
    (await runner.runTask(task, session))?.dispose();
    assert.deepStrictEqual(sentText, [{
      text: `./scripts/code.sh --user-data-dir=${innerCwd.path}/.profile-oss`,
      shouldExecute: true
    }]);
    assert.deepStrictEqual(resolverCalls, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcdGVybWluYWxcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdFNlc3Npb25UYXNrUnVubmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSwgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX1NDSEVNRSwgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxDcmVhdGVPcHRpb25zLCBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwgTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCwgUkVNT1RFX0FHRU5UX0hPU1RfUFJPVklERVJfUFJFRklYIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUNoYXQsIElTZXNzaW9uLCBJU2Vzc2lvbkZvbGRlciwgSVNlc3Npb25Xb3Jrc3BhY2UsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlckRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVGFza0VudHJ5LCBJU2Vzc2lvbnNUYXNrc1NlcnZpY2UsIElTZXNzaW9uVGFza1dpdGhUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvc2Vzc2lvbnNUYXNrc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgb3NUb1Rhc2tUYXJnZXRPUyB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci90YXNrQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uVGFza1J1bm5lciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYWdlbnRIb3N0U2Vzc2lvblRhc2tSdW5uZXIuanMnO1xuXG5mdW5jdGlvbiBtYWtlU2Vzc2lvbihvcHRzOiB7IHByb3ZpZGVySWQ6IHN0cmluZzsgY3dkPzogVVJJIH0pOiBJU2Vzc2lvbiB7XG5cdGNvbnN0IGZvbGRlcjogSVNlc3Npb25Gb2xkZXIgfCB1bmRlZmluZWQgPSBvcHRzLmN3ZCA/IHtcblx0XHRyb290OiBvcHRzLmN3ZCxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiBvcHRzLmN3ZCxcblx0XHRuYW1lOiAndGVzdCcsXG5cdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRnaXRSZXBvc2l0b3J5OiB7IHVyaTogb3B0cy5jd2QsIHdvcmtUcmVlVXJpOiB1bmRlZmluZWQsIGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsIGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpIH0sXG5cdH0gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UgfCB1bmRlZmluZWQgPSBmb2xkZXIgPyB7XG5cdFx0dXJpOiBvcHRzLmN3ZCEsXG5cdFx0bGFiZWw6ICd0ZXN0Jyxcblx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRmb2xkZXJzOiBbZm9sZGVyXSxcblx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHR9IDogdW5kZWZpbmVkO1xuXHRjb25zdCBjaGF0ID0geyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Nlc3Npb24nKSB9IGFzIElDaGF0O1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25JZDogYCR7b3B0cy5wcm92aWRlcklkfTpzZXNzaW9uYCxcblx0XHRyZXNvdXJjZTogY2hhdC5yZXNvdXJjZSxcblx0XHRwcm92aWRlcklkOiBvcHRzLnByb3ZpZGVySWQsXG5cdFx0c2Vzc2lvblR5cGU6ICdiYWNrZ3JvdW5kJyxcblx0XHRpY29uOiBDb2RpY29uLmNvcGlsb3QsXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuXHRcdHdvcmtzcGFjZTogb2JzZXJ2YWJsZVZhbHVlKCd3b3Jrc3BhY2UnLCB3b3Jrc3BhY2UpLFxuXHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoJ3RpdGxlJywgJ3Nlc3Npb24nKSxcblx0XHR1cGRhdGVkQXQ6IG9ic2VydmFibGVWYWx1ZSgndXBkYXRlZEF0JywgbmV3IERhdGUoKSksXG5cdFx0c3RhdHVzOiBvYnNlcnZhYmxlVmFsdWUoJ3N0YXR1cycsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpLFxuXHRcdGNoYW5nZXNldHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0Y2hhbmdlczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRtb2RlbElkOiBvYnNlcnZhYmxlVmFsdWUoJ21vZGVsSWQnLCB1bmRlZmluZWQpLFxuXHRcdG1vZGU6IG9ic2VydmFibGVWYWx1ZSgnbW9kZScsIHVuZGVmaW5lZCksXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKCdsb2FkaW5nJywgZmFsc2UpLFxuXHRcdGlzQXJjaGl2ZWQ6IG9ic2VydmFibGVWYWx1ZSgnaXNBcmNoaXZlZCcsIGZhbHNlKSxcblx0XHRpc1JlYWQ6IG9ic2VydmFibGVWYWx1ZSgnaXNSZWFkJywgdHJ1ZSksXG5cdFx0bGFzdFR1cm5FbmQ6IG9ic2VydmFibGVWYWx1ZSgnbGFzdFR1cm5FbmQnLCB1bmRlZmluZWQpLFxuXHRcdGRlc2NyaXB0aW9uOiBvYnNlcnZhYmxlVmFsdWUoJ2Rlc2NyaXB0aW9uJywgdW5kZWZpbmVkKSxcblx0XHRjaGF0czogb2JzZXJ2YWJsZVZhbHVlKCdjaGF0cycsIFtjaGF0XSksXG5cdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdH07XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RTZXNzaW9uVGFza1J1bm5lcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHJ1bm5lcjogQWdlbnRIb3N0U2Vzc2lvblRhc2tSdW5uZXI7XG5cdGxldCBjcmVhdGVkVGVybWluYWxzOiB7IGFkZHJlc3M6IHN0cmluZzsgb3B0aW9ucz86IElBZ2VudEhvc3RUZXJtaW5hbENyZWF0ZU9wdGlvbnMgfVtdO1xuXHRsZXQgc2VudFRleHQ6IHsgdGV4dDogc3RyaW5nOyBzaG91bGRFeGVjdXRlOiBib29sZWFuIH1bXTtcblx0bGV0IGRpc3Bvc2VkVGVybWluYWxzOiBJVGVybWluYWxJbnN0YW5jZVtdO1xuXHRsZXQgYWxsVGFza3M6IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXTtcblx0bGV0IHJlc29sdmVyQ2FsbHM6IHN0cmluZ1tdO1xuXHRjb25zdCBmYWtlSW5zdGFuY2UgPSB7XG5cdFx0c2VuZFRleHQ6IGFzeW5jICh0ZXh0OiBzdHJpbmcsIHNob3VsZEV4ZWN1dGU6IGJvb2xlYW4pID0+IHsgc2VudFRleHQucHVzaCh7IHRleHQsIHNob3VsZEV4ZWN1dGUgfSk7IH0sXG5cdFx0ZGlzcG9zZTogKCkgPT4geyBkaXNwb3NlZFRlcm1pbmFscy5wdXNoKGZha2VJbnN0YW5jZSk7IH0sXG5cdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y3JlYXRlZFRlcm1pbmFscyA9IFtdO1xuXHRcdHNlbnRUZXh0ID0gW107XG5cdFx0ZGlzcG9zZWRUZXJtaW5hbHMgPSBbXTtcblx0XHRhbGxUYXNrcyA9IFtdO1xuXHRcdHJlc29sdmVyQ2FsbHMgPSBbXTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdFRlcm1pbmFsU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVUZXJtaW5hbEZvckVudHJ5KGFkZHJlc3M6IHN0cmluZywgb3B0aW9ucz86IElBZ2VudEhvc3RUZXJtaW5hbENyZWF0ZU9wdGlvbnMpIHtcblx0XHRcdFx0Y3JlYXRlZFRlcm1pbmFscy5wdXNoKHsgYWRkcmVzcywgb3B0aW9ucyB9KTtcblx0XHRcdFx0cmV0dXJuIGZha2VJbnN0YW5jZTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zVGFza3NTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Rhc2tzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBnZXRBbGxUYXNrcygpIHtcblx0XHRcdFx0cmV0dXJuIGFsbFRhc2tzO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0UHJvdmlkZXI8VCBleHRlbmRzIElTZXNzaW9uc1Byb3ZpZGVyPihpZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdGlmIChpZCA9PT0gTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCB8fCBpZC5zdGFydHNXaXRoKFJFTU9URV9BR0VOVF9IT1NUX1BST1ZJREVSX1BSRUZJWCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBpZCA9IGlkO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVtb3RlQWRkcmVzcyA9IGlkID09PSBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lEID8gdW5kZWZpbmVkIDogYHJlbW90ZS0ke2lkfWA7XG5cdFx0XHRcdFx0fSBhcyB1bmtub3duIGFzIFQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGVybWluYWxTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHNldEFjdGl2ZUluc3RhbmNlKCkgeyAvKiBuby1vcCAqLyB9XG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbEdyb3VwU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGVybWluYWxHcm91cFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2hvd1BhbmVsKCkgeyAvKiBuby1vcCAqLyB9XG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlQXN5bmMoZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB8IHVuZGVmaW5lZCwgdmFsdWU6IGFueSk6IGFueSB7XG5cdFx0XHRcdHJlc29sdmVyQ2FsbHMucHVzaChTdHJpbmcodmFsdWUpKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShcblx0XHRcdFx0XHR0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIGZvbGRlclxuXHRcdFx0XHRcdFx0PyB2YWx1ZS5yZXBsYWNlQWxsKCcke3dvcmtzcGFjZUZvbGRlcn0nLCBmb2xkZXIudXJpLnBhdGgpXG5cdFx0XHRcdFx0XHQ6IHZhbHVlXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRydW5uZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RTZXNzaW9uVGFza1J1bm5lcik7XG5cdFx0Ly8gUmVmZXJlbmNlIHVudXNlZCBpbXBvcnRzIHRvIGtlZXAgdGhlbSBpbiB0aGUgYnVuZGxlIGFuZCBzaWxlbmNlIGxpbnRlcnMuXG5cdFx0dm9pZCBFdmVudDtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gc2hlbGxUYXNrKCk6IElUYXNrRW50cnkge1xuXHRcdHJldHVybiB7IGxhYmVsOiAnYnVpbGQnLCB0eXBlOiAnc2hlbGwnLCBjb21tYW5kOiAnZWNobycsIGFyZ3M6IFsnaGknXSB9O1xuXHR9XG5cblx0dGVzdCgnY2FuUnVuOiBmYWxzZSBmb3Igbm9uLWFnZW50LWhvc3QgcHJvdmlkZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIuY2FuUnVuKG1ha2VTZXNzaW9uKHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QtY2hhdC1zZXNzaW9ucycgfSkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhblJ1bjogdHJ1ZSBmb3IgbG9jYWwgYWdlbnQgaG9zdCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLmNhblJ1bihtYWtlU2Vzc2lvbih7IHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQgfSkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuUnVuOiB0cnVlIGZvciByZW1vdGUgYWdlbnQgaG9zdCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLmNhblJ1bihtYWtlU2Vzc2lvbih7IHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtbXlob3N0JyB9KSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBhZ2VudC1ob3N0IHNlc3Npb25zIHBhc3MgdGhyb3VnaCBmaWxlOiBjd2QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3dkID0gVVJJLnBhcnNlKCdmaWxlOi8vL3BhdGgvdG8vd29ya3RyZWUnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oeyBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBjd2QgfSk7XG5cblx0XHQoYXdhaXQgcnVubmVyLnJ1blRhc2soc2hlbGxUYXNrKCksIHNlc3Npb24pKT8uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFsc1swXS5hZGRyZXNzLCAnX19sb2NhbF9fJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzWzBdLm9wdGlvbnM/LmN3ZD8udG9TdHJpbmcoKSwgY3dkLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VudFRleHQsIFt7IHRleHQ6ICdlY2hvIGhpJywgc2hvdWxkRXhlY3V0ZTogdHJ1ZSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybmVkIGhhbmRsZSBzdG9wcyB0aGUgdGFzayBieSBkaXNwb3NpbmcgaXRzIHRlcm1pbmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQsIGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3gnKSB9KTtcblxuXHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHJ1bm5lci5ydW5UYXNrKHNoZWxsVGFzaygpLCBzZXNzaW9uKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpc3Bvc2VkVGVybWluYWxzLCBbXSk7XG5cblx0XHRoYW5kbGU/LmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlzcG9zZWRUZXJtaW5hbHMsIFtmYWtlSW5zdGFuY2VdKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnQtaG9zdCBzY2hlbWUgY3dkcyBhcmUgdW53cmFwcGVkIHRvIHRoZWlyIG9yaWdpbmFsIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbm5lckN3ZCA9IFVSSS5wYXJzZSgnZmlsZTovLy9yZW1vdGUvcGF0aCcpO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSB0b0FnZW50SG9zdFVyaShpbm5lckN3ZCwgJ3JlbW90ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3cmFwcGVkLnNjaGVtZSwgQUdFTlRfSE9TVF9TQ0hFTUUsICdwcmVjb25kaXRpb246IHdyYXBwZWQgdXJpJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgcHJvdmlkZXJJZDogJ2FnZW50aG9zdC1teWhvc3QnLCBjd2Q6IHdyYXBwZWQgfSk7XG5cblx0XHQoYXdhaXQgcnVubmVyLnJ1blRhc2soc2hlbGxUYXNrKCksIHNlc3Npb24pKT8uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFsc1swXS5vcHRpb25zPy5jd2Q/LnRvU3RyaW5nKCksIGlubmVyQ3dkLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmtub3duIHNjaGVtZSBjd2RzIGFyZSBvbWl0dGVkIChob3N0IHVzZXMgZGVmYXVsdCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgcHJvdmlkZXJJZDogJ2FnZW50aG9zdC1teWhvc3QnLCBjd2Q6IFVSSS5wYXJzZSgndnNjb2RlLXZmczovL2dpdGh1Yi9vd25lci9yZXBvJykgfSk7XG5cblx0XHQoYXdhaXQgcnVubmVyLnJ1blRhc2soc2hlbGxUYXNrKCksIHNlc3Npb24pKT8uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRUZXJtaW5hbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlZFRlcm1pbmFsc1swXS5vcHRpb25zPy5jd2QsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIHdoZW4gbm8gY29tbWFuZCBjYW4gYmUgcmVzb2x2ZWQgZnJvbSB0aGUgdGFzaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gbWFrZVNlc3Npb24oeyBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy94JykgfSk7XG5cdFx0KGF3YWl0IHJ1bm5lci5ydW5UYXNrKHsgbGFiZWw6ICdlbXB0eScgfSwgc2Vzc2lvbikpPy5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjcmVhdGVkVGVybWluYWxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIGRlcGVuZHNPbiBjaGFpbnMgYWdhaW5zdCB0aGUgZnVsbCB0YXNrcy5qc29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQsIGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3gnKSB9KTtcblx0XHRjb25zdCB0cmFuc3BpbGU6IElUYXNrRW50cnkgPSB7IGxhYmVsOiAnVHJhbnNwaWxlIENsaWVudCcsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6ICducG0nLCBhcmdzOiBbJ3J1bicsICd0cmFuc3BpbGUnXSB9O1xuXHRcdGNvbnN0IHJ1bkRldjogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdSdW4gRGV2JywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ25wbScsIGFyZ3M6IFsncnVuJywgJ2RldiddIH07XG5cdFx0Y29uc3QgdG9wOiBJVGFza0VudHJ5ID0ge1xuXHRcdFx0bGFiZWw6ICdSdW4gYW5kIENvbXBpbGUgQ29kZSAtIE9TUycsXG5cdFx0XHRkZXBlbmRzT246IFsnVHJhbnNwaWxlIENsaWVudCcsICdSdW4gRGV2J10sXG5cdFx0XHRkZXBlbmRzT3JkZXI6ICdzZXF1ZW5jZScsXG5cdFx0XHRpbkFnZW50czogdHJ1ZSxcblx0XHR9O1xuXHRcdGFsbFRhc2tzID0gW1xuXHRcdFx0eyB0YXNrOiB0cmFuc3BpbGUsIHRhcmdldDogJ3dvcmtzcGFjZScgfSxcblx0XHRcdHsgdGFzazogcnVuRGV2LCB0YXJnZXQ6ICd3b3Jrc3BhY2UnIH0sXG5cdFx0XHR7IHRhc2s6IHRvcCwgdGFyZ2V0OiAnd29ya3NwYWNlJyB9LFxuXHRcdF07XG5cblx0XHQoYXdhaXQgcnVubmVyLnJ1blRhc2sodG9wLCBzZXNzaW9uKSk/LmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VudFRleHQsIFt7IHRleHQ6ICducG0gcnVuIHRyYW5zcGlsZSAmJiBucG0gcnVuIGRldicsIHNob3VsZEV4ZWN1dGU6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBhZ2VudC1ob3N0IHNlc3Npb25zIGFwcGx5IE9TLXNwZWNpZmljIGNvbW1hbmQgb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQsIGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3gnKSB9KTtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0ge1xuXHRcdFx0bGFiZWw6ICdSdW4gRGV2IEFnZW50cycsXG5cdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0Y29tbWFuZDogJy4vc2NyaXB0cy9jb2RlLnNoJyxcblx0XHRcdHdpbmRvd3M6IHsgY29tbWFuZDogJy5cXFxcc2NyaXB0c1xcXFxjb2RlLmJhdCcgfSxcblx0XHRcdGFyZ3M6IFsnLS1hZ2VudHMnXSxcblx0XHR9O1xuXG5cdFx0KGF3YWl0IHJ1bm5lci5ydW5UYXNrKHRhc2ssIHNlc3Npb24pKT8uZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRDb21tYW5kID0gb3NUb1Rhc2tUYXJnZXRPUyhPUykgPT09ICd3aW5kb3dzJyA/ICcuXFxcXHNjcmlwdHNcXFxcY29kZS5iYXQnIDogJy4vc2NyaXB0cy9jb2RlLnNoJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnRUZXh0LCBbeyB0ZXh0OiBgJHtleHBlY3RlZENvbW1hbmR9IC0tYWdlbnRzYCwgc2hvdWxkRXhlY3V0ZTogdHJ1ZSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGFuZHMgJHt3b3Jrc3BhY2VGb2xkZXJ9IHRvIHRoZSBzZXNzaW9uIHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvcGF0aC90by93b3JrdHJlZScpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtYWtlU2Vzc2lvbih7IHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQsIGN3ZCB9KTtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0ge1xuXHRcdFx0bGFiZWw6ICdSdW4gQ2xpZW50Jyxcblx0XHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0XHRjb21tYW5kOiAnLi9zY3JpcHRzL2NvZGUuc2gnLFxuXHRcdFx0YXJnczogWyctLXVzZXItZGF0YS1kaXI9JHt3b3Jrc3BhY2VGb2xkZXJ9Ly5wcm9maWxlLW9zcyddLFxuXHRcdH07XG5cblx0XHQoYXdhaXQgcnVubmVyLnJ1blRhc2sodGFzaywgc2Vzc2lvbikpPy5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnRUZXh0LCBbe1xuXHRcdFx0dGV4dDogYC4vc2NyaXB0cy9jb2RlLnNoIC0tdXNlci1kYXRhLWRpcj0ke2N3ZC5wYXRofS8ucHJvZmlsZS1vc3NgLFxuXHRcdFx0c2hvdWxkRXhlY3V0ZTogdHJ1ZSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlckNhbGxzLCBbJy4vc2NyaXB0cy9jb2RlLnNoJywgJy0tdXNlci1kYXRhLWRpcj0ke3dvcmtzcGFjZUZvbGRlcn0vLnByb2ZpbGUtb3NzJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdGUgYWdlbnQtaG9zdCBzZXNzaW9ucyBleHBhbmQgJHt3b3Jrc3BhY2VGb2xkZXJ9IGZyb20gdGhlIFBPU0lYIGhvc3QgcGF0aCB3aXRob3V0IHRoZSByZW5kZXJlciByZXNvbHZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbm5lckN3ZCA9IFVSSS5maWxlKCcvcmVtb3RlL3dvcmt0cmVlJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG1ha2VTZXNzaW9uKHsgcHJvdmlkZXJJZDogJ2FnZW50aG9zdC1teWhvc3QnLCBjd2Q6IHRvQWdlbnRIb3N0VXJpKGlubmVyQ3dkLCAncmVtb3RlJykgfSk7XG5cdFx0Y29uc3QgdGFzazogSVRhc2tFbnRyeSA9IHtcblx0XHRcdGxhYmVsOiAnUnVuIENsaWVudCcsXG5cdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0Y29tbWFuZDogJy4vc2NyaXB0cy9jb2RlLnNoJyxcblx0XHRcdGFyZ3M6IFsnLS11c2VyLWRhdGEtZGlyPSR7d29ya3NwYWNlRm9sZGVyfS8ucHJvZmlsZS1vc3MnXSxcblx0XHR9O1xuXG5cdFx0KGF3YWl0IHJ1bm5lci5ydW5UYXNrKHRhc2ssIHNlc3Npb24pKT8uZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZW50VGV4dCwgW3tcblx0XHRcdHRleHQ6IGAuL3NjcmlwdHMvY29kZS5zaCAtLXVzZXItZGF0YS1kaXI9JHtpbm5lckN3ZC5wYXRofS8ucHJvZmlsZS1vc3NgLFxuXHRcdFx0c2hvdWxkRXhlY3V0ZTogdHJ1ZSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlckNhbGxzLCBbXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQix1QkFBdUI7QUFDakQsU0FBUyxVQUFVO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQkFBZ0IsbUJBQW1CO0FBQzVDLFNBQVMsbUJBQW1CLHNCQUFzQjtBQUNsRCxTQUEwQyxpQ0FBaUM7QUFDM0UsU0FBUyx1QkFBMEMsd0JBQXdCO0FBRTNFLFNBQXFDLDhCQUE4Qix5Q0FBeUM7QUFDNUcsU0FBNkQscUJBQXFCO0FBQ2xGLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMscUNBQXFDO0FBRTlDLFNBQXFCLDZCQUFxRDtBQUMxRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtDQUFrQztBQUUzQyxTQUFTLFlBQVksTUFBbUQ7QUFDdkUsUUFBTSxTQUFxQyxLQUFLLE1BQU07QUFBQSxJQUNyRCxNQUFNLEtBQUs7QUFBQSxJQUNYLGtCQUFrQixLQUFLO0FBQUEsSUFDdkIsTUFBTTtBQUFBLElBQ04sYUFBYTtBQUFBLElBQ2IsZUFBZSxFQUFFLEtBQUssS0FBSyxLQUFLLGFBQWEsUUFBVyxnQkFBZ0IsUUFBVyxZQUFZLGdCQUFnQixNQUFTLEVBQUU7QUFBQSxFQUMzSCxJQUFJO0FBQ0osUUFBTSxZQUEyQyxTQUFTO0FBQUEsSUFDekQsS0FBSyxLQUFLO0FBQUEs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
