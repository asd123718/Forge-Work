import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { URI } from "../../../../base/common/uri.js";
import * as platform from "../../../../base/common/platform.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { IFileService } from "../../../files/common/files.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { ISandboxHelperService } from "../../../sandbox/common/sandboxHelperService.js";
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from "../../../sandbox/common/terminalSandboxMxcRuntime.js";
import { AgentHostSandboxConfigKey, AgentHostSandboxKey } from "../../common/sandboxConfigSchema.js";
import { AgentSandboxEnabledValue } from "../../../sandbox/common/settings.js";
import { TerminalClaimKind } from "../../common/state/protocol/state.js";
import { formatTerminalText, IAgentHostTerminalManager } from "../../node/agentHostTerminalManager.js";
import { createShellTools, isMultilineCommand, ShellManager, prefixForHistorySuppression, shellTypeForExecutable } from "../../node/copilot/copilotShellTools.js";
class TestAgentHostTerminalManager {
  constructor() {
    this.defaultShell = "/bin/bash";
    this.created = [];
    this.writes = [];
    this.sentTexts = [];
    this.existingTerminalUris = /* @__PURE__ */ new Set();
    this.commandDetectionSupported = false;
    this.commandFinishedListenerRegistered = new DeferredPromise();
    this._onCommandFinished = new Emitter();
    this._onData = new Emitter();
    this._onExit = new Emitter();
    this._onClaimChanged = new Emitter();
    this._onDidSendText = new Emitter();
    this.onDidSendText = this._onDidSendText.event;
    this._altBufferPromises = [];
  }
  async createTerminal(params, options) {
    this.created.push({ params, options: { ...options, shell: options?.shell ?? this.defaultShell } });
  }
  writeInput(uri, data) {
    this.writes.push({ uri, data });
  }
  async sendText(uri, data, options) {
    this.sentTexts.push({ uri, data, options });
    this.writeInput(uri, formatTerminalText(data, options));
    this._onDidSendText.fire();
  }
  onData(_uri, cb) {
    return this._onData.event(cb);
  }
  onExit(_uri, cb) {
    return this._onExit.event(cb);
  }
  onClaimChanged(_uri, cb) {
    return this._onClaimChanged.event(cb);
  }
  onCommandFinished(_uri, cb) {
    this.commandFinishedListenerRegistered.complete();
    return this._onCommandFinished.event(cb);
  }
  createAltBufferPromise(_uri, store) {
    const deferred = new DeferredPromise();
    this._altBufferPromises.push(deferred);
    store.add({
      dispose: () => {
        const index = this._altBufferPromises.indexOf(deferred);
        if (index !== -1) {
          this._altBufferPromises.splice(index, 1);
        }
      }
    });
    return deferred.p;
  }
  getContent() {
    return this._content;
  }
  getClaim() {
    return void 0;
  }
  hasTerminal(uri) {
    return this.existingTerminalUris.has(uri);
  }
  getExitCode() {
    return void 0;
  }
  supportsCommandDetection() {
    return this.commandDetectionSupported;
  }
  disposeTerminal() {
  }
  getTerminalInfos() {
    return [];
  }
  getTerminalState() {
    return void 0;
  }
  async getDefaultShell() {
    return this.defaultShell;
  }
  createOutputTerminal() {
  }
  appendOutputTerminalData() {
  }
  resetOutputTerminal() {
  }
  finalizeOutputTerminal() {
  }
  fireCommandFinished(event) {
    this._onCommandFinished.fire(event);
  }
  fireData(data) {
    this._onData.fire(data);
  }
  fireExit(exitCode) {
    this._onExit.fire(exitCode);
  }
  fireClaimChanged(claim) {
    this._onClaimChanged.fire(claim);
  }
  setContent(content) {
    this._content = content;
  }
  fireDidEnterAltBuffer() {
    for (const promise of [...this._altBufferPromises]) {
      promise.complete();
    }
  }
}
suite("CopilotShellTools", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function createFakeAgentConfigurationService(initialSandbox) {
    const sandbox = { ...initialSandbox };
    const configValues = { [AgentHostSandboxConfigKey.Sandbox]: sandbox };
    const emitter = disposables.add(new Emitter());
    const workingDirectoryPendingEmitter = disposables.add(new Emitter());
    const service = {
      _serviceBrand: void 0,
      onDidRootConfigChange: emitter.event,
      onDidSessionConfigChange: Event.None,
      onDidChangeWorkingDirectoryPending: workingDirectoryPendingEmitter.event,
      getEffectiveValue: () => void 0,
      getEffectiveWorkingDirectories: () => void 0,
      isWorkingDirectoryPending: () => false,
      resolveWorkingDirectoryForResume: async (_session, workingDirectory) => workingDirectory,
      getSessionConfigValues: () => void 0,
      updateSessionConfig: () => {
      },
      getRootValue: ((_schema, key) => configValues[key]),
      updateRootConfig: () => {
      },
      persistRootConfig: () => {
      },
      whenIdle: async () => {
      }
    };
    return {
      service,
      setSandboxValue(key, value) {
        sandbox[key] = value;
        emitter.fire();
      }
    };
  }
  function createStubSandboxHelperService() {
    return {
      _serviceBrand: void 0,
      checkSandboxDependencies: async () => void 0,
      getWindowsMxcFilesystemPolicy: async () => ({ readonlyPaths: [], readwritePaths: [] }),
      getWindowsMxcEnvironment: async () => [],
      buildWindowsMxcSandboxPayload: async (commandLine, policy, workingDirectory, containerName = "vscode-terminal-sandbox", containment = "process") => ({
        version: policy.version,
        containerId: containerName,
        containment,
        lifecycle: { destroyOnExit: true, preservePolicy: false },
        process: { commandLine, cwd: workingDirectory, timeout: policy.timeoutMs ?? 0 },
        filesystem: {
          readwritePaths: [...policy.filesystem?.readwritePaths ?? []],
          readonlyPaths: [...policy.filesystem?.readonlyPaths ?? []],
          deniedPaths: [...policy.filesystem?.deniedPaths ?? []]
        },
        network: { defaultPolicy: policy.network?.allowOutbound ? "allow" : "block" },
        ui: { disable: !(policy.ui?.allowWindows ?? false), clipboard: policy.ui?.clipboard ?? "none", injection: policy.ui?.allowInputInjection ?? false }
      })
    };
  }
  function createServices(options) {
    const terminalManager = new TestAgentHostTerminalManager();
    const initialSandboxValues = {};
    if (options?.sandboxEnabled) {
      initialSandboxValues[AgentHostSandboxKey.Enabled] = AgentSandboxEnabledValue.On;
      initialSandboxValues[AgentHostSandboxKey.WindowsEnabled] = AgentSandboxEnabledValue.On;
    }
    const agentConfigurationService = createFakeAgentConfigurationService(initialSandboxValues);
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IAgentHostTerminalManager, terminalManager);
    services.set(IAgentConfigurationService, agentConfigurationService.service);
    services.set(IFileService, {
      createFile: async (uri, content) => {
        if (options?.createdFiles) {
          options.createdFiles.set(uri.path, content.toString());
        }
        return {};
      },
      createFolder: async () => ({}),
      del: async (uri) => {
        options?.deletedFolders?.push(uri.path);
      },
      realpath: async () => void 0
    });
    services.set(IEnvironmentService, {
      userHome: URI.file("/home/test-user")
    });
    services.set(IProductService, { dataFolderName: ".test-data" });
    services.set(ISandboxHelperService, createStubSandboxHelperService());
    const instantiationService = disposables.add(new InstantiationService(services));
    services.set(IInstantiationService, instantiationService);
    services.set(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
    return { instantiationService, terminalManager, agentConfigurationService };
  }
  async function waitForSentTexts(terminalManager, count) {
    while (terminalManager.sentTexts.length < count) {
      const didTimeOut = await new Promise((resolve) => {
        const disposables2 = new DisposableStore();
        const listener = Event.once(terminalManager.onDidSendText)(() => {
          disposables2.dispose();
          resolve(false);
        });
        disposables2.add(listener);
        const handle = setTimeout(() => {
          disposables2.dispose();
          resolve(true);
        }, 1e3);
        disposables2.add({ dispose: () => clearTimeout(handle) });
      });
      if (didTimeOut) {
        assert.fail(`Timed out waiting for ${count} sendText calls; saw ${terminalManager.sentTexts.length}`);
      }
    }
  }
  function markCreatedTerminalsExist(terminalManager) {
    for (const created of terminalManager.created) {
      terminalManager.existingTerminalUris.add(created.params.channel);
    }
  }
  test("uses session working directory for created shells", async () => {
    const { instantiationService, terminalManager } = createServices();
    const worktreePath = URI.file("/workspace/worktree").fsPath;
    const explicitCwd = URI.file("/explicit/cwd").fsPath;
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), URI.file(worktreePath)));
    (await shellManager.getOrCreateShell("bash", "turn-1", "tool-1")).dispose();
    (await shellManager.getOrCreateShell("bash", "turn-2", "tool-2", explicitCwd)).dispose();
    assert.deepStrictEqual(terminalManager.created.map((c) => c.params.cwd), [
      worktreePath,
      explicitCwd
    ]);
  });
  test("opts every managed shell into shell-history suppression and non-interactive mode", async () => {
    const { instantiationService, terminalManager } = createServices();
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    await shellManager.getOrCreateShell("bash", "turn-1", "tool-1");
    assert.strictEqual(terminalManager.created.length, 1);
    assert.strictEqual(terminalManager.created[0].options?.preventShellHistory, true);
    assert.strictEqual(terminalManager.created[0].options?.nonInteractive, true);
  });
  test("uses the executable resolved by the terminal manager", async () => {
    const { instantiationService, terminalManager } = createServices();
    terminalManager.defaultShell = "/custom/path/to/pwsh";
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    await shellManager.getOrCreateShell("powershell", "turn-1", "tool-1");
    assert.strictEqual(terminalManager.created[0].options?.shell, "/custom/path/to/pwsh");
  });
  test("prefixForHistorySuppression prepends a space for POSIX shells, no-op for PowerShell", () => {
    assert.strictEqual(prefixForHistorySuppression("bash"), " ");
    assert.strictEqual(prefixForHistorySuppression("powershell"), "");
  });
  test("shellTypeForExecutable maps known shell basenames and falls back to platform default", () => {
    assert.deepStrictEqual([
      shellTypeForExecutable("C:\\Program Files\\PowerShell\\7\\pwsh.exe"),
      shellTypeForExecutable("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"),
      shellTypeForExecutable("/usr/bin/bash"),
      shellTypeForExecutable("/usr/bin/zsh"),
      shellTypeForExecutable("/bin/sh")
    ], ["powershell", "powershell", "bash", "bash", "bash"]);
    const unknownDefault = shellTypeForExecutable("C:\\Windows\\System32\\cmd.exe");
    assert.ok(unknownDefault === "bash" || unknownDefault === "powershell");
  });
  test("zsh executable keeps bash tool name but uses zsh-specific guidance", async () => {
    const { instantiationService, terminalManager } = createServices();
    terminalManager.defaultShell = "/bin/zsh";
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    assert.strictEqual(bashTool.name, "bash");
    assert.ok(bashTool.description);
    const description = bashTool.description;
    assert.match(description, /persistent zsh terminal session/);
    assert.match(description, /zsh globbing features/);
    assert.match(description, /bare == or ===/);
    assert.match(description, /status as a variable name/);
    assert.doesNotMatch(description, /bang history/);
    assert.doesNotMatch(description, /# comments/);
  });
  test("getOrCreateShell reuses an idle shell after the reference is disposed", async () => {
    const terminalManager = new TestAgentHostTerminalManager();
    terminalManager.hasTerminal = () => true;
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IAgentHostTerminalManager, terminalManager);
    services.set(ISandboxHelperService, createStubSandboxHelperService());
    const instantiationService = disposables.add(new InstantiationService(services));
    services.set(IInstantiationService, instantiationService);
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const first = await shellManager.getOrCreateShell("bash", "turn-1", "tool-1");
    first.dispose();
    const second = await shellManager.getOrCreateShell("bash", "turn-2", "tool-2");
    assert.strictEqual(second.object.id, first.object.id, "should reuse idle shell");
    assert.strictEqual(terminalManager.created.length, 1);
    second.dispose();
  });
  test("getOrCreateShell creates a new shell when the existing reference is still held", async () => {
    const terminalManager = new TestAgentHostTerminalManager();
    terminalManager.hasTerminal = () => true;
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IAgentHostTerminalManager, terminalManager);
    services.set(ISandboxHelperService, createStubSandboxHelperService());
    const instantiationService = disposables.add(new InstantiationService(services));
    services.set(IInstantiationService, instantiationService);
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const first = await shellManager.getOrCreateShell("bash", "turn-1", "tool-1");
    const second = await shellManager.getOrCreateShell("bash", "turn-2", "tool-2");
    assert.notStrictEqual(second.object.id, first.object.id, "should create a new shell when existing is busy");
    assert.strictEqual(terminalManager.created.length, 2);
    first.dispose();
    second.dispose();
  });
  test("shell helper tools (read/write/shutdown/list/redirect) are registered with skipPermission: true", async () => {
    const { instantiationService, terminalManager } = createServices();
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const skipPermissionByName = Object.fromEntries(tools.map((t) => [t.name, t.skipPermission ?? false]));
    assert.deepStrictEqual(skipPermissionByName, {
      bash: false,
      read_bash: true,
      write_bash: true,
      bash_shutdown: true,
      list_bash: true,
      powershell: true
    });
  });
  test("primary shell tool normalizes multiline command input", async () => {
    const { instantiationService, terminalManager } = createServices();
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "echo first\necho second", timeout: 1 }
    };
    const result = await bashTool.handler({ command: "echo first\necho second", timeout: 1 }, invocation);
    assert.strictEqual(result.resultType, "failure");
    assert.strictEqual(terminalManager.sentTexts[0].options.bracketedPasteMode, true);
    assert.strictEqual(terminalManager.sentTexts[1].options.bracketedPasteMode, void 0);
    assert.strictEqual(terminalManager.writes[0].data, " echo first\recho second\r");
    assert.match(terminalManager.writes[1].data, /^echo "<<<COPILOT_SENTINEL_[a-f0-9]+_EXIT_\$\?>>>"\r$/);
  });
  test("primary shell tool ignores echoed sentinel command text", async () => {
    const { instantiationService, terminalManager } = createServices();
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "echo MOCKED_AGENT_HOST_SANDBOX_RESPONSE", timeout: 1e3 }
    };
    const resultPromise = bashTool.handler({ command: "echo MOCKED_AGENT_HOST_SANDBOX_RESPONSE", timeout: 1e3 }, invocation);
    await waitForSentTexts(terminalManager, 2);
    const sentinelMatch = terminalManager.writes[1].data.match(/<<<COPILOT_SENTINEL_([a-f0-9]+)_EXIT_\$\?>>/);
    assert.ok(sentinelMatch, "sentinel marker should be present");
    const sentinelId = sentinelMatch[1];
    const content = [
      " echo MOCKED_AGENT_HOST_SANDBOX_RESPONSE",
      "MOCKED_AGENT_HOST_SANDBOX_RESPONSE",
      `echo "<<<COPILOT_SENTINEL_${sentinelId}_EXIT_$?>>>"`,
      `<<<COPILOT_SENTINEL_${sentinelId}_EXIT_0>>>`
    ].join("\r\n");
    terminalManager.setContent(content);
    terminalManager.fireData(content);
    const result = await resultPromise;
    assert.strictEqual(result.resultType, "success");
    assert.match(result.textResultForLlm, /Exit code: 0/);
    assert.match(result.textResultForLlm, /MOCKED_AGENT_HOST_SANDBOX_RESPONSE/);
  });
  test("primary shell tool forces bracketed paste with shell integration", async () => {
    const { instantiationService, terminalManager } = createServices();
    terminalManager.commandDetectionSupported = true;
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "echo first\necho second", timeout: 1e3 }
    };
    const resultPromise = bashTool.handler({ command: "echo first\necho second", timeout: 1e3 }, invocation);
    await terminalManager.commandFinishedListenerRegistered.p;
    terminalManager.fireCommandFinished({ commandId: "cmd-1", exitCode: 0, command: "echo first\necho second", output: "first\nsecond" });
    const result = await resultPromise;
    assert.strictEqual(result.resultType, "success");
    assert.strictEqual(terminalManager.sentTexts.length, 1);
    assert.strictEqual(terminalManager.sentTexts[0].options.bracketedPasteMode, true);
    assert.strictEqual(terminalManager.writes[0].data, " echo first\recho second\r");
  });
  test("primary shell tool returns alternateBuffer when shell integration enters alt buffer", async () => {
    const { instantiationService, terminalManager } = createServices();
    terminalManager.commandDetectionSupported = true;
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "vim README.md", timeout: 1e3 }
    };
    const resultPromise = bashTool.handler({ command: "vim README.md", timeout: 1e3 }, invocation);
    await waitForSentTexts(terminalManager, 1);
    terminalManager.fireDidEnterAltBuffer();
    const result = await resultPromise;
    assert.strictEqual(result.resultType, "failure");
    assert.strictEqual(result.error, "alternateBuffer");
    assert.match(result.textResultForLlm, /opened the alternate buffer/);
  });
  test("primary shell tool returns alternateBuffer when sentinel fallback enters alt buffer", async () => {
    const { instantiationService, terminalManager } = createServices();
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "vim README.md", timeout: 1e3 }
    };
    const resultPromise = bashTool.handler({ command: "vim README.md", timeout: 1e3 }, invocation);
    await waitForSentTexts(terminalManager, 2);
    terminalManager.fireDidEnterAltBuffer();
    const result = await resultPromise;
    assert.strictEqual(result.resultType, "failure");
    assert.strictEqual(result.error, "alternateBuffer");
    assert.match(result.textResultForLlm, /opened the alternate buffer/);
  });
  test("alt-buffer shell is released when command finishes", async () => {
    const { instantiationService, terminalManager } = createServices();
    terminalManager.commandDetectionSupported = true;
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "vim README.md", timeout: 1e3 }
    };
    const resultPromise = bashTool.handler({ command: "vim README.md", timeout: 1e3 }, invocation);
    await waitForSentTexts(terminalManager, 1);
    terminalManager.fireDidEnterAltBuffer();
    const result = await resultPromise;
    assert.strictEqual(result.error, "alternateBuffer");
    markCreatedTerminalsExist(terminalManager);
    const shell = shellManager.listShells()[0];
    terminalManager.fireCommandFinished({ commandId: "cmd-1", exitCode: 0, command: "vim README.md", output: "" });
    const next = await shellManager.getOrCreateShell("bash", "turn-2", "tool-2");
    assert.strictEqual(next.object.id, shell.id);
    assert.strictEqual(terminalManager.created.length, 1);
    next.dispose();
  });
  test("alt-buffer shell is not immediately reused", async () => {
    const { instantiationService, terminalManager } = createServices();
    terminalManager.commandDetectionSupported = true;
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "vim README.md", timeout: 1e3 }
    };
    const resultPromise = bashTool.handler({ command: "vim README.md", timeout: 1e3 }, invocation);
    await waitForSentTexts(terminalManager, 1);
    terminalManager.fireDidEnterAltBuffer();
    const result = await resultPromise;
    assert.strictEqual(result.error, "alternateBuffer");
    markCreatedTerminalsExist(terminalManager);
    const shell = shellManager.listShells()[0];
    const next = await shellManager.getOrCreateShell("bash", "turn-2", "tool-2");
    assert.notStrictEqual(next.object.id, shell.id);
    assert.strictEqual(terminalManager.created.length, 2);
    next.dispose();
  });
  test("backgrounded shell is not immediately reused", async () => {
    const { instantiationService, terminalManager } = createServices();
    terminalManager.commandDetectionSupported = true;
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "sleep 100", timeout: 1e3 }
    };
    const resultPromise = bashTool.handler({ command: "sleep 100", timeout: 1e3 }, invocation);
    await waitForSentTexts(terminalManager, 1);
    terminalManager.fireClaimChanged({ kind: TerminalClaimKind.Session, session: "copilot:/session-1", turnId: "turn-1" });
    const result = await resultPromise;
    assert.strictEqual(result.resultType, "success");
    assert.match(result.textResultForLlm, /continue this command in the background/);
    markCreatedTerminalsExist(terminalManager);
    const shell = shellManager.listShells()[0];
    const next = await shellManager.getOrCreateShell("bash", "turn-2", "tool-2");
    assert.notStrictEqual(next.object.id, shell.id);
    assert.strictEqual(terminalManager.created.length, 2);
    next.dispose();
  });
  test("backgrounded shell is released when command finishes", async () => {
    const { instantiationService, terminalManager } = createServices();
    terminalManager.commandDetectionSupported = true;
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "sleep 100", timeout: 1e3 }
    };
    const resultPromise = bashTool.handler({ command: "sleep 100", timeout: 1e3 }, invocation);
    await waitForSentTexts(terminalManager, 1);
    terminalManager.fireClaimChanged({ kind: TerminalClaimKind.Session, session: "copilot:/session-1", turnId: "turn-1" });
    const result = await resultPromise;
    assert.strictEqual(result.resultType, "success");
    markCreatedTerminalsExist(terminalManager);
    const shell = shellManager.listShells()[0];
    terminalManager.fireCommandFinished({ commandId: "cmd-1", exitCode: 0, command: "sleep 100", output: "" });
    const next = await shellManager.getOrCreateShell("bash", "turn-2", "tool-2");
    assert.strictEqual(next.object.id, shell.id);
    assert.strictEqual(terminalManager.created.length, 1);
    next.dispose();
  });
  test("backgrounded shell is released when terminal exits", async () => {
    const { instantiationService, terminalManager } = createServices();
    terminalManager.commandDetectionSupported = true;
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "sleep 100", timeout: 1e3 }
    };
    const resultPromise = bashTool.handler({ command: "sleep 100", timeout: 1e3 }, invocation);
    await waitForSentTexts(terminalManager, 1);
    terminalManager.fireClaimChanged({ kind: TerminalClaimKind.Session, session: "copilot:/session-1", turnId: "turn-1" });
    const result = await resultPromise;
    assert.strictEqual(result.resultType, "success");
    markCreatedTerminalsExist(terminalManager);
    const shell = shellManager.listShells()[0];
    terminalManager.fireExit(0);
    const next = await shellManager.getOrCreateShell("bash", "turn-2", "tool-2");
    assert.strictEqual(next.object.id, shell.id);
    assert.strictEqual(terminalManager.created.length, 1);
    next.dispose();
  });
  test("primary shell tool only forces bracketed paste for single-line commands on macOS", async () => {
    const { instantiationService, terminalManager } = createServices();
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "echo first", timeout: 1 }
    };
    const result = await bashTool.handler({ command: "echo first", timeout: 1 }, invocation);
    assert.strictEqual(result.resultType, "failure");
    assert.strictEqual(terminalManager.sentTexts[0].options.bracketedPasteMode, platform.isMacintosh);
    assert.strictEqual(terminalManager.sentTexts[1].options.bracketedPasteMode, void 0);
  });
  test("detects multiline commands like the workbench terminal tool", () => {
    assert.strictEqual(isMultilineCommand("echo first\necho second"), true);
    assert.strictEqual(isMultilineCommand("echo first\r\necho second"), true);
    assert.strictEqual(isMultilineCommand("echo first\\\necho second"), false);
  });
  test("write shell tool normalizes input without appending enter", async () => {
    const { instantiationService, terminalManager } = createServices();
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const shellRef = await shellManager.getOrCreateShell("bash", "turn-1", "tool-1");
    terminalManager.existingTerminalUris.add(shellRef.object.terminalUri);
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const writeTool = tools.find((tool) => tool.name === "write_bash");
    assert.ok(writeTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-2",
      toolName: "write_bash",
      arguments: { command: "answer\n" }
    };
    const result = await writeTool.handler({ command: "answer\n" }, invocation);
    assert.strictEqual(result.resultType, "success");
    assert.strictEqual(terminalManager.sentTexts[0].options.bracketedPasteMode, void 0);
    assert.strictEqual(terminalManager.writes[0].uri, shellRef.object.terminalUri);
    assert.strictEqual(terminalManager.writes[0].data, "answer\r");
    shellRef.dispose();
  });
  test("getOrCreateSandboxEngine returns the same engine across calls", async () => {
    const { instantiationService } = createServices();
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const engineA = shellManager.getOrCreateSandboxEngine();
    const engineB = shellManager.getOrCreateSandboxEngine();
    assert.strictEqual(engineA, engineB, "Sandbox engine should be cached across calls");
  });
  test("primary shell tool schema only exposes requestUnsandboxedExecution params when the sandbox is enabled", async () => {
    const enabled = createServices({ sandboxEnabled: true });
    const enabledShell = disposables.add(enabled.instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-enabled"), void 0));
    const enabledTools = await createShellTools(enabledShell, enabled.terminalManager, new NullLogService());
    const enabledPrimary = enabledTools[0];
    const enabledSchema = enabledPrimary.parameters;
    const enabledPropertyNames = Object.keys(enabledSchema.properties);
    assert.ok(enabledPropertyNames.includes("requestUnsandboxedExecution"), "Sandbox-enabled schema should expose requestUnsandboxedExecution");
    assert.ok(enabledPropertyNames.includes("requestUnsandboxedExecutionReason"), "Sandbox-enabled schema should expose requestUnsandboxedExecutionReason");
    const disabled = createServices();
    const disabledShell = disposables.add(disabled.instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-disabled"), void 0));
    const disabledTools = await createShellTools(disabledShell, disabled.terminalManager, new NullLogService());
    const disabledPrimary = disabledTools[0];
    const disabledSchema = disabledPrimary.parameters;
    const disabledPropertyNames = Object.keys(disabledSchema.properties);
    assert.ok(!disabledPropertyNames.includes("requestUnsandboxedExecution"), "Sandbox-disabled schema should not expose requestUnsandboxedExecution");
    assert.ok(!disabledPropertyNames.includes("requestUnsandboxedExecutionReason"), "Sandbox-disabled schema should not expose requestUnsandboxedExecutionReason");
  });
  test("primary shell tool sends commands unwrapped when the sandbox is disabled", async () => {
    const { instantiationService, terminalManager } = createServices();
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "echo hello", timeout: 1 }
    };
    await bashTool.handler({ command: "echo hello", timeout: 1 }, invocation);
    const sentCommand = terminalManager.sentTexts[0]?.data ?? "";
    assert.ok(sentCommand.includes("echo hello"), `Expected the raw command to be sent. Sent: ${sentCommand}`);
    assert.ok(!sentCommand.includes("sandbox-runtime"), `Sandbox wrapper should not be applied when sandbox is disabled. Sent: ${sentCommand}`);
  });
  test("primary shell tool wraps commands through the sandbox engine when the sandbox is enabled", async function() {
    const { instantiationService, terminalManager } = createServices({ sandboxEnabled: true });
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "echo hello", timeout: 1 }
    };
    await bashTool.handler({ command: "echo hello", timeout: 1 }, invocation);
    const sentCommand = terminalManager.sentTexts[0]?.data ?? "";
    if (platform.isWindows) {
      assert.ok(sentCommand.includes("wxc-exec"), `Expected the command to be wrapped by the MXC runtime. Sent: ${sentCommand}`);
    } else {
      assert.ok(sentCommand.includes("sandbox-runtime"), `Expected the command to be wrapped by the sandbox runtime. Sent: ${sentCommand}`);
      assert.ok(sentCommand.includes("echo hello"), `Wrapped command should still contain the user command. Sent: ${sentCommand}`);
    }
  });
  test("primary shell tool writes a sandbox config exposing the working directory as writable", async () => {
    const createdFiles = /* @__PURE__ */ new Map();
    const workingDirectory = URI.file("/workspace/test-workspace");
    const { instantiationService, terminalManager } = createServices({ sandboxEnabled: true, createdFiles });
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), workingDirectory));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "echo hello", timeout: 1 }
    };
    await bashTool.handler({ command: "echo hello", timeout: 1 }, invocation);
    const sandboxConfigEntry = [...createdFiles.entries()].find(([path]) => /vscode-sandbox-settings-.*\.json$/.test(path));
    assert.ok(sandboxConfigEntry, `Expected a sandbox config file to be written. Files: ${[...createdFiles.keys()].join(", ")}`);
    const config = JSON.parse(sandboxConfigEntry[1]);
    const writablePaths = platform.isWindows ? config.filesystem.readwritePaths : config.filesystem.allowWrite;
    assert.ok(Array.isArray(writablePaths), `Expected writable paths array. Got: ${JSON.stringify(config.filesystem)}`);
    const expectedPath = platform.isWindows ? "\\workspace\\test-workspace" : "/workspace/test-workspace";
    assert.ok(writablePaths.includes(expectedPath), `Expected working directory in writable paths. Got: ${JSON.stringify(writablePaths)}`);
  });
  test("primary shell tool merges configured filesystem allowRead paths into the sandbox config", async () => {
    const createdFiles = /* @__PURE__ */ new Map();
    const configuredReadPath = platform.isWindows ? "C:\\tools\\custom" : "/tools/custom";
    const fileSystemKey = platform.isWindows ? AgentHostSandboxKey.WindowsFileSystem : platform.isMacintosh ? AgentHostSandboxKey.MacFileSystem : AgentHostSandboxKey.LinuxFileSystem;
    const { instantiationService, terminalManager, agentConfigurationService } = createServices({ sandboxEnabled: true, createdFiles });
    agentConfigurationService.setSandboxValue(fileSystemKey, { allowRead: [configuredReadPath] });
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), URI.file("/workspace/test-workspace")));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService());
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "echo hello", timeout: 1 }
    };
    await bashTool.handler({ command: "echo hello", timeout: 1 }, invocation);
    const sandboxConfigEntry = [...createdFiles.entries()].find(([path]) => /vscode-sandbox-settings-.*\.json$/.test(path));
    assert.ok(sandboxConfigEntry, `Expected a sandbox config file to be written. Files: ${[...createdFiles.keys()].join(", ")}`);
    const config = JSON.parse(sandboxConfigEntry[1]);
    const readablePaths = platform.isWindows ? config.filesystem.readonlyPaths : config.filesystem.allowRead;
    assert.ok(Array.isArray(readablePaths), `Expected readable paths array. Got: ${JSON.stringify(config.filesystem)}`);
    assert.ok(readablePaths.includes(configuredReadPath), `Expected configured read path in readable paths. Got: ${JSON.stringify(readablePaths)}`);
  });
  test("primary shell tool requests confirmation before rerunning outside the sandbox", async function() {
    if (platform.isWindows) {
      this.skip();
    }
    const { instantiationService, terminalManager, agentConfigurationService } = createServices({ sandboxEnabled: true });
    agentConfigurationService.setSandboxValue(AgentHostSandboxKey.AllowUnsandboxedCommands, true);
    terminalManager.commandDetectionSupported = true;
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const confirmationRequests = [];
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService(), async (request) => {
      confirmationRequests.push(request);
      return true;
    });
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "curl https://example.com" }
    };
    const resultPromise = bashTool.handler({ command: "curl https://example.com" }, invocation);
    await terminalManager.commandFinishedListenerRegistered.p;
    terminalManager.fireCommandFinished({
      commandId: "cmd-1",
      exitCode: 0,
      command: "curl https://example.com",
      output: ""
    });
    const result = await resultPromise;
    assert.strictEqual(confirmationRequests.length, 1);
    assert.deepStrictEqual(confirmationRequests[0]?.blockedDomains, ["example.com"]);
    assert.ok(terminalManager.sentTexts.length >= 1, "Approved command should be sent to the terminal unsandboxed");
    assert.ok(terminalManager.sentTexts.every((entry) => !entry.data.includes("sandbox-runtime")), "No wrapped sandbox-runtime command should be sent after approval");
    assert.strictEqual(result.resultType, "success");
  });
  test("primary shell tool returns sandbox_blocked when user declines unsandboxed rerun", async function() {
    if (platform.isWindows) {
      this.skip();
    }
    const { instantiationService, terminalManager, agentConfigurationService } = createServices({ sandboxEnabled: true });
    agentConfigurationService.setSandboxValue(AgentHostSandboxKey.AllowUnsandboxedCommands, true);
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService(), async () => false);
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: { command: "curl https://example.com" }
    };
    const result = await bashTool.handler({ command: "curl https://example.com" }, invocation);
    assert.strictEqual(result.resultType, "failure");
    assert.strictEqual(result.error, "sandbox_blocked");
    assert.match(result.textResultForLlm ?? "", /declined/i);
    assert.strictEqual(terminalManager.sentTexts.length, 0);
  });
  test("primary shell tool asks for confirmation when requestUnsandboxedExecution is explicitly set", async function() {
    const { instantiationService, terminalManager, agentConfigurationService } = createServices({ sandboxEnabled: true });
    agentConfigurationService.setSandboxValue(AgentHostSandboxKey.AllowUnsandboxedCommands, true);
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const confirmationRequests = [];
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService(), async (request) => {
      confirmationRequests.push(request);
      return false;
    });
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: {
        command: "echo hello",
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "sandbox blocked required syscall"
      }
    };
    const result = await bashTool.handler({
      command: "echo hello",
      requestUnsandboxedExecution: true,
      requestUnsandboxedExecutionReason: "sandbox blocked required syscall"
    }, invocation);
    assert.strictEqual(confirmationRequests.length, 1);
    assert.strictEqual(confirmationRequests[0]?.reason, "sandbox blocked required syscall");
    assert.strictEqual(result.resultType, "failure");
    assert.strictEqual(result.error, "sandbox_blocked");
    assert.match(result.textResultForLlm ?? "", /declined/i);
    assert.strictEqual(terminalManager.sentTexts.length, 0);
  });
  test("primary shell tool returns unsandboxed_disabled when allowUnsandboxedCommands is off", async function() {
    const { instantiationService, terminalManager } = createServices({ sandboxEnabled: true });
    const shellManager = disposables.add(instantiationService.createInstance(ShellManager, URI.parse("copilot:/session-1"), void 0));
    const confirmationRequests = [];
    const tools = await createShellTools(shellManager, terminalManager, new NullLogService(), async (request) => {
      confirmationRequests.push(request);
      return true;
    });
    const bashTool = tools.find((tool) => tool.name === "bash");
    assert.ok(bashTool);
    const invocation = {
      sessionId: "session-1",
      toolCallId: "tool-1",
      toolName: "bash",
      arguments: {
        command: "echo hello",
        requestUnsandboxedExecution: true,
        requestUnsandboxedExecutionReason: "sandbox blocked required syscall"
      }
    };
    const result = await bashTool.handler({
      command: "echo hello",
      requestUnsandboxedExecution: true,
      requestUnsandboxedExecutionReason: "sandbox blocked required syscall"
    }, invocation);
    assert.strictEqual(result.resultType, "failure");
    assert.strictEqual(result.error, "unsandboxed_disabled");
    assert.match(result.textResultForLlm ?? "", /allowUnsandboxedCommands/);
    assert.strictEqual(confirmationRequests.length, 0, "No confirmation should have been requested");
    assert.strictEqual(terminalManager.sentTexts.length, 0, "Disallowed command should not be sent to the terminal");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90U2hlbGxUb29scy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBUb29sLCBUb29sSW52b2NhdGlvbiwgVG9vbFJlc3VsdE9iamVjdCB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0eXBlIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNhbmRib3hIZWxwZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2FuZGJveC9jb21tb24vc2FuZGJveEhlbHBlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lLCBXaW5kb3dzTXhjVGVybWluYWxTYW5kYm94UnVudGltZSB9IGZyb20gJy4uLy4uLy4uL3NhbmRib3gvY29tbW9uL3Rlcm1pbmFsU2FuZGJveE14Y1J1bnRpbWUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleSwgQWdlbnRIb3N0U2FuZGJveEtleSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zYW5kYm94Q29uZmlnU2NoZW1hLmpzJztcbmltcG9ydCB7IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL3NhbmRib3gvY29tbW9uL3NldHRpbmdzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB0eXBlIHsgQ3JlYXRlVGVybWluYWxQYXJhbXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDbGFpbUtpbmQsIHR5cGUgVGVybWluYWxDbGFpbSwgdHlwZSBUZXJtaW5hbEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgZm9ybWF0VGVybWluYWxUZXh0LCBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLCB0eXBlIElDb21tYW5kRmluaXNoZWRFdmVudCwgdHlwZSBJU2VuZFRleHRPcHRpb25zIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2hlbGxUb29scywgdHlwZSBJVW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uUmVxdWVzdCwgaXNNdWx0aWxpbmVDb21tYW5kLCBTaGVsbE1hbmFnZXIsIHByZWZpeEZvckhpc3RvcnlTdXBwcmVzc2lvbiwgc2hlbGxUeXBlRm9yRXhlY3V0YWJsZSB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90U2hlbGxUb29scy5qcyc7XG5cbmNsYXNzIFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgaW1wbGVtZW50cyBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0ZGVmYXVsdFNoZWxsID0gJy9iaW4vYmFzaCc7XG5cdHJlYWRvbmx5IGNyZWF0ZWQ6IHsgcGFyYW1zOiBDcmVhdGVUZXJtaW5hbFBhcmFtczsgb3B0aW9ucz86IHsgc2hlbGw/OiBzdHJpbmc7IHByZXZlbnRTaGVsbEhpc3Rvcnk/OiBib29sZWFuOyBub25JbnRlcmFjdGl2ZT86IGJvb2xlYW4gfSB9W10gPSBbXTtcblx0cmVhZG9ubHkgd3JpdGVzOiB7IHVyaTogc3RyaW5nOyBkYXRhOiBzdHJpbmcgfVtdID0gW107XG5cdHJlYWRvbmx5IHNlbnRUZXh0czogeyB1cmk6IHN0cmluZzsgZGF0YTogc3RyaW5nOyBvcHRpb25zOiBJU2VuZFRleHRPcHRpb25zIH1bXSA9IFtdO1xuXHRyZWFkb25seSBleGlzdGluZ1Rlcm1pbmFsVXJpcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb21tYW5kRGV0ZWN0aW9uU3VwcG9ydGVkID0gZmFsc2U7XG5cdHJlYWRvbmx5IGNvbW1hbmRGaW5pc2hlZExpc3RlbmVyUmVnaXN0ZXJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Db21tYW5kRmluaXNoZWQgPSBuZXcgRW1pdHRlcjxJQ29tbWFuZEZpbmlzaGVkRXZlbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGF0YSA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25FeGl0ID0gbmV3IEVtaXR0ZXI8bnVtYmVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNsYWltQ2hhbmdlZCA9IG5ldyBFbWl0dGVyPFRlcm1pbmFsQ2xhaW0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VuZFRleHQgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZFNlbmRUZXh0ID0gdGhpcy5fb25EaWRTZW5kVGV4dC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfYWx0QnVmZmVyUHJvbWlzZXM6IERlZmVycmVkUHJvbWlzZTx2b2lkPltdID0gW107XG5cdHByaXZhdGUgX2NvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRhc3luYyBjcmVhdGVUZXJtaW5hbChwYXJhbXM6IENyZWF0ZVRlcm1pbmFsUGFyYW1zLCBvcHRpb25zPzogeyBzaGVsbD86IHN0cmluZzsgcHJldmVudFNoZWxsSGlzdG9yeT86IGJvb2xlYW47IG5vbkludGVyYWN0aXZlPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jcmVhdGVkLnB1c2goeyBwYXJhbXMsIG9wdGlvbnM6IHsgLi4ub3B0aW9ucywgc2hlbGw6IG9wdGlvbnM/LnNoZWxsID8/IHRoaXMuZGVmYXVsdFNoZWxsIH0gfSk7XG5cdH1cblx0d3JpdGVJbnB1dCh1cmk6IHN0cmluZywgZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy53cml0ZXMucHVzaCh7IHVyaSwgZGF0YSB9KTtcblx0fVxuXHRhc3luYyBzZW5kVGV4dCh1cmk6IHN0cmluZywgZGF0YTogc3RyaW5nLCBvcHRpb25zOiBJU2VuZFRleHRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZW50VGV4dHMucHVzaCh7IHVyaSwgZGF0YSwgb3B0aW9ucyB9KTtcblx0XHR0aGlzLndyaXRlSW5wdXQodXJpLCBmb3JtYXRUZXJtaW5hbFRleHQoZGF0YSwgb3B0aW9ucykpO1xuXHRcdHRoaXMuX29uRGlkU2VuZFRleHQuZmlyZSgpO1xuXHR9XG5cdG9uRGF0YShfdXJpOiBzdHJpbmcsIGNiOiAoZGF0YTogc3RyaW5nKSA9PiB2b2lkKTogSURpc3Bvc2FibGUgeyByZXR1cm4gdGhpcy5fb25EYXRhLmV2ZW50KGNiKTsgfVxuXHRvbkV4aXQoX3VyaTogc3RyaW5nLCBjYjogKGV4aXRDb2RlOiBudW1iZXIpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7IHJldHVybiB0aGlzLl9vbkV4aXQuZXZlbnQoY2IpOyB9XG5cdG9uQ2xhaW1DaGFuZ2VkKF91cmk6IHN0cmluZywgY2I6IChjbGFpbTogVGVybWluYWxDbGFpbSkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIHRoaXMuX29uQ2xhaW1DaGFuZ2VkLmV2ZW50KGNiKTsgfVxuXHRvbkNvbW1hbmRGaW5pc2hlZChfdXJpOiBzdHJpbmcsIGNiOiAoZXZlbnQ6IElDb21tYW5kRmluaXNoZWRFdmVudCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLmNvbW1hbmRGaW5pc2hlZExpc3RlbmVyUmVnaXN0ZXJlZC5jb21wbGV0ZSgpO1xuXHRcdHJldHVybiB0aGlzLl9vbkNvbW1hbmRGaW5pc2hlZC5ldmVudChjYik7XG5cdH1cblx0Y3JlYXRlQWx0QnVmZmVyUHJvbWlzZShfdXJpOiBzdHJpbmcsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHR0aGlzLl9hbHRCdWZmZXJQcm9taXNlcy5wdXNoKGRlZmVycmVkKTtcblx0XHRzdG9yZS5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2FsdEJ1ZmZlclByb21pc2VzLmluZGV4T2YoZGVmZXJyZWQpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWx0QnVmZmVyUHJvbWlzZXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBkZWZlcnJlZC5wO1xuXHR9XG5cdGdldENvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NvbnRlbnQ7IH1cblx0Z2V0Q2xhaW0oKTogVGVybWluYWxDbGFpbSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0aGFzVGVybWluYWwodXJpOiBzdHJpbmcpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuZXhpc3RpbmdUZXJtaW5hbFVyaXMuaGFzKHVyaSk7IH1cblx0Z2V0RXhpdENvZGUoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRzdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24oKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmNvbW1hbmREZXRlY3Rpb25TdXBwb3J0ZWQ7IH1cblx0ZGlzcG9zZVRlcm1pbmFsKCk6IHZvaWQgeyB9XG5cdGdldFRlcm1pbmFsSW5mb3MoKTogVGVybWluYWxJbmZvW10geyByZXR1cm4gW107IH1cblx0Z2V0VGVybWluYWxTdGF0ZSgpOiB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldERlZmF1bHRTaGVsbCgpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gdGhpcy5kZWZhdWx0U2hlbGw7IH1cblx0Y3JlYXRlT3V0cHV0VGVybWluYWwoKTogdm9pZCB7IH1cblx0YXBwZW5kT3V0cHV0VGVybWluYWxEYXRhKCk6IHZvaWQgeyB9XG5cdHJlc2V0T3V0cHV0VGVybWluYWwoKTogdm9pZCB7IH1cblx0ZmluYWxpemVPdXRwdXRUZXJtaW5hbCgpOiB2b2lkIHsgfVxuXHRmaXJlQ29tbWFuZEZpbmlzaGVkKGV2ZW50OiBJQ29tbWFuZEZpbmlzaGVkRXZlbnQpOiB2b2lkIHsgdGhpcy5fb25Db21tYW5kRmluaXNoZWQuZmlyZShldmVudCk7IH1cblx0ZmlyZURhdGEoZGF0YTogc3RyaW5nKTogdm9pZCB7IHRoaXMuX29uRGF0YS5maXJlKGRhdGEpOyB9XG5cdGZpcmVFeGl0KGV4aXRDb2RlOiBudW1iZXIpOiB2b2lkIHsgdGhpcy5fb25FeGl0LmZpcmUoZXhpdENvZGUpOyB9XG5cdGZpcmVDbGFpbUNoYW5nZWQoY2xhaW06IFRlcm1pbmFsQ2xhaW0pOiB2b2lkIHsgdGhpcy5fb25DbGFpbUNoYW5nZWQuZmlyZShjbGFpbSk7IH1cblx0c2V0Q29udGVudChjb250ZW50OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHsgdGhpcy5fY29udGVudCA9IGNvbnRlbnQ7IH1cblx0ZmlyZURpZEVudGVyQWx0QnVmZmVyKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcHJvbWlzZSBvZiBbLi4udGhpcy5fYWx0QnVmZmVyUHJvbWlzZXNdKSB7XG5cdFx0XHRwcm9taXNlLmNvbXBsZXRlKCk7XG5cdFx0fVxuXHR9XG59XG5cbnN1aXRlKCdDb3BpbG90U2hlbGxUb29scycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0aW50ZXJmYWNlIElGYWtlQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0cmVhZG9ubHkgc2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0c2V0U2FuZGJveFZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVGYWtlQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShpbml0aWFsU2FuZGJveD86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogSUZha2VBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0XHRjb25zdCBzYW5kYm94OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgLi4uaW5pdGlhbFNhbmRib3ggfTtcblx0XHRjb25zdCBjb25maWdWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyBbQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XTogc2FuZGJveCB9O1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeVBlbmRpbmdFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3Qgc2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZFJvb3RDb25maWdDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRvbkRpZFNlc3Npb25Db25maWdDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZENoYW5nZVdvcmtpbmdEaXJlY3RvcnlQZW5kaW5nOiB3b3JraW5nRGlyZWN0b3J5UGVuZGluZ0VtaXR0ZXIuZXZlbnQsXG5cdFx0XHRnZXRFZmZlY3RpdmVWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0Z2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRpc1dvcmtpbmdEaXJlY3RvcnlQZW5kaW5nOiAoKSA9PiBmYWxzZSxcblx0XHRcdHJlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lOiBhc3luYyAoX3Nlc3Npb24sIHdvcmtpbmdEaXJlY3RvcnkpID0+IHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRnZXRTZXNzaW9uQ29uZmlnVmFsdWVzOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHR1cGRhdGVTZXNzaW9uQ29uZmlnOiAoKSA9PiB7IC8qIG5vLW9wICovIH0sXG5cdFx0XHRnZXRSb290VmFsdWU6ICgoX3NjaGVtYTogdW5rbm93biwga2V5OiBzdHJpbmcpID0+IGNvbmZpZ1ZhbHVlc1trZXldKSBhcyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZVsnZ2V0Um9vdFZhbHVlJ10sXG5cdFx0XHR1cGRhdGVSb290Q29uZmlnOiAoKSA9PiB7IC8qIG5vLW9wICovIH0sXG5cdFx0XHRwZXJzaXN0Um9vdENvbmZpZzogKCkgPT4geyAvKiBuby1vcCAqLyB9LFxuXHRcdFx0d2hlbklkbGU6IGFzeW5jICgpID0+IHsgLyogbm8tb3AgKi8gfSxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXJ2aWNlLFxuXHRcdFx0c2V0U2FuZGJveFZhbHVlKGtleSwgdmFsdWUpIHtcblx0XHRcdFx0c2FuZGJveFtrZXldID0gdmFsdWU7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU3R1YlNhbmRib3hIZWxwZXJTZXJ2aWNlKCk6IElTYW5kYm94SGVscGVyU2VydmljZSB7XG5cdFx0Ly8gU3R1YiB1c2VkIGJ5IGV2ZXJ5IHRlc3QgdGhhdCBjb25zdHJ1Y3RzIGEgYFNoZWxsTWFuYWdlcmAuIEF2b2lkcyBsb2FkaW5nXG5cdFx0Ly8gdGhlIHJlYWwgbm9kZS1vbmx5IGBTYW5kYm94SGVscGVyU2VydmljZWAsIHdoaWNoIGR5bmFtaWNhbGx5IGltcG9ydHNcblx0XHQvLyBgQG1pY3Jvc29mdC9teGMtc2RrYCBhbmQgZmFpbHMgdG8gcmVzb2x2ZSBpbiB0aGUgZWxlY3Ryb24gcmVuZGVyZXIgdGVzdFxuXHRcdC8vIHJ1bm5lciB1c2VkIGJ5IGBzY3JpcHRzL3Rlc3QuYmF0YC5cblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRnZXRXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeTogYXN5bmMgKCkgPT4gKHsgcmVhZG9ubHlQYXRoczogW10sIHJlYWR3cml0ZVBhdGhzOiBbXSB9KSxcblx0XHRcdGdldFdpbmRvd3NNeGNFbnZpcm9ubWVudDogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRidWlsZFdpbmRvd3NNeGNTYW5kYm94UGF5bG9hZDogYXN5bmMgKGNvbW1hbmRMaW5lLCBwb2xpY3ksIHdvcmtpbmdEaXJlY3RvcnksIGNvbnRhaW5lck5hbWUgPSAndnNjb2RlLXRlcm1pbmFsLXNhbmRib3gnLCBjb250YWlubWVudCA9ICdwcm9jZXNzJykgPT4gKHtcblx0XHRcdFx0dmVyc2lvbjogcG9saWN5LnZlcnNpb24sXG5cdFx0XHRcdGNvbnRhaW5lcklkOiBjb250YWluZXJOYW1lLFxuXHRcdFx0XHRjb250YWlubWVudCxcblx0XHRcdFx0bGlmZWN5Y2xlOiB7IGRlc3Ryb3lPbkV4aXQ6IHRydWUsIHByZXNlcnZlUG9saWN5OiBmYWxzZSB9LFxuXHRcdFx0XHRwcm9jZXNzOiB7IGNvbW1hbmRMaW5lLCBjd2Q6IHdvcmtpbmdEaXJlY3RvcnksIHRpbWVvdXQ6IHBvbGljeS50aW1lb3V0TXMgPz8gMCB9LFxuXHRcdFx0XHRmaWxlc3lzdGVtOiB7XG5cdFx0XHRcdFx0cmVhZHdyaXRlUGF0aHM6IFsuLi4ocG9saWN5LmZpbGVzeXN0ZW0/LnJlYWR3cml0ZVBhdGhzID8/IFtdKV0sXG5cdFx0XHRcdFx0cmVhZG9ubHlQYXRoczogWy4uLihwb2xpY3kuZmlsZXN5c3RlbT8ucmVhZG9ubHlQYXRocyA/PyBbXSldLFxuXHRcdFx0XHRcdGRlbmllZFBhdGhzOiBbLi4uKHBvbGljeS5maWxlc3lzdGVtPy5kZW5pZWRQYXRocyA/PyBbXSldLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRuZXR3b3JrOiB7IGRlZmF1bHRQb2xpY3k6IHBvbGljeS5uZXR3b3JrPy5hbGxvd091dGJvdW5kID8gJ2FsbG93JyA6ICdibG9jaycgfSxcblx0XHRcdFx0dWk6IHsgZGlzYWJsZTogIShwb2xpY3kudWk/LmFsbG93V2luZG93cyA/PyBmYWxzZSksIGNsaXBib2FyZDogcG9saWN5LnVpPy5jbGlwYm9hcmQgPz8gJ25vbmUnLCBpbmplY3Rpb246IHBvbGljeS51aT8uYWxsb3dJbnB1dEluamVjdGlvbiA/PyBmYWxzZSB9LFxuXHRcdFx0fSksXG5cdFx0fSBzYXRpc2ZpZXMgSVNhbmRib3hIZWxwZXJTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZXMob3B0aW9ucz86IHsgc2FuZGJveEVuYWJsZWQ/OiBib29sZWFuOyBkZWxldGVkRm9sZGVycz86IHN0cmluZ1tdOyBjcmVhdGVkRmlsZXM/OiBNYXA8c3RyaW5nLCBzdHJpbmc+IH0pOiB7IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7IHRlcm1pbmFsTWFuYWdlcjogVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcjsgYWdlbnRDb25maWd1cmF0aW9uU2VydmljZTogSUZha2VBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0ge1xuXHRcdGNvbnN0IHRlcm1pbmFsTWFuYWdlciA9IG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCk7XG5cdFx0Y29uc3QgaW5pdGlhbFNhbmRib3hWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0aWYgKG9wdGlvbnM/LnNhbmRib3hFbmFibGVkKSB7XG5cdFx0XHRpbml0aWFsU2FuZGJveFZhbHVlc1tBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdID0gQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uO1xuXHRcdFx0Ly8gV2luZG93cyB1c2VzIGEgc2VwYXJhdGUgZW5hYmxlIGtleTsgdGhlIGVuZ2luZSB0cmVhdHNcblx0XHRcdC8vIGBFbmFibGVkPU9uYCBvbiBub24tV2luZG93cyBhbmQgYFdpbmRvd3NFbmFibGVkPU9uYFxuXHRcdFx0Ly8gb24gV2luZG93cyBhcyBcInNhbmRib3ggYWN0aXZlXCIuIFNldCBib3RoIHNvIHRlc3RzIGV4ZXJjaXNlXG5cdFx0XHQvLyB0aGUgc2FuZGJveCBwYXRoIG9uIGV2ZXJ5IE9TLlxuXHRcdFx0aW5pdGlhbFNhbmRib3hWYWx1ZXNbQWdlbnRIb3N0U2FuZGJveEtleS5XaW5kb3dzRW5hYmxlZF0gPSBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT247XG5cdFx0fVxuXHRcdGNvbnN0IGFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVGYWtlQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShpbml0aWFsU2FuZGJveFZhbHVlcyk7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uuc2VydmljZSk7XG5cdFx0c2VydmljZXMuc2V0KElGaWxlU2VydmljZSwge1xuXHRcdFx0Y3JlYXRlRmlsZTogYXN5bmMgKHVyaTogVVJJLCBjb250ZW50OiBWU0J1ZmZlcikgPT4ge1xuXHRcdFx0XHRpZiAob3B0aW9ucz8uY3JlYXRlZEZpbGVzKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5jcmVhdGVkRmlsZXMuc2V0KHVyaS5wYXRoLCBjb250ZW50LnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAoe30gYXMgbmV2ZXIpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUZvbGRlcjogYXN5bmMgKCkgPT4gKHt9IGFzIG5ldmVyKSxcblx0XHRcdGRlbDogYXN5bmMgKHVyaTogVVJJKSA9PiB7IG9wdGlvbnM/LmRlbGV0ZWRGb2xkZXJzPy5wdXNoKHVyaS5wYXRoKTsgfSxcblx0XHRcdHJlYWxwYXRoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyBQYXJ0aWFsPElGaWxlU2VydmljZT4gYXMgSUZpbGVTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVudmlyb25tZW50U2VydmljZSwge1xuXHRcdFx0dXNlckhvbWU6IFVSSS5maWxlKCcvaG9tZS90ZXN0LXVzZXInKSxcblx0XHR9IGFzIFBhcnRpYWw8SUVudmlyb25tZW50U2VydmljZT4gJiB7IHVzZXJIb21lOiBVUkkgfSBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVByb2R1Y3RTZXJ2aWNlLCB7IGRhdGFGb2xkZXJOYW1lOiAnLnRlc3QtZGF0YScgfSBhcyBQYXJ0aWFsPElQcm9kdWN0U2VydmljZT4gYXMgSVByb2R1Y3RTZXJ2aWNlKTtcblx0XHQvLyBTdHViIHRoZSBzYW5kYm94IGhlbHBlciBzbyB0aGUgZW5naW5lIG5ldmVyIGltcG9ydHMgYEBtaWNyb3NvZnQvbXhjLXNka2Bcblx0XHQvLyAoYSBub2RlLW9ubHkgZHluYW1pYyBpbXBvcnQgdGhhdCBmYWlscyB0byByZXNvbHZlIGluIHRoZSBlbGVjdHJvblxuXHRcdC8vIHJlbmRlcmVyIHRlc3QgcnVubmVyIHVzZWQgYnkgYHNjcmlwdHMvdGVzdC5iYXRgIG9uIFdpbmRvd3MgQ0kpLlxuXHRcdHNlcnZpY2VzLnNldChJU2FuZGJveEhlbHBlclNlcnZpY2UsIGNyZWF0ZVN0dWJTYW5kYm94SGVscGVyU2VydmljZSgpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdHNlcnZpY2VzLnNldChJSW5zdGFudGlhdGlvblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXaW5kb3dzTXhjVGVybWluYWxTYW5kYm94UnVudGltZSkpO1xuXHRcdHJldHVybiB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXJtaW5hbE1hbmFnZXIsIGFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JTZW50VGV4dHModGVybWluYWxNYW5hZ2VyOiBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLCBjb3VudDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0d2hpbGUgKHRlcm1pbmFsTWFuYWdlci5zZW50VGV4dHMubGVuZ3RoIDwgY291bnQpIHtcblx0XHRcdGNvbnN0IGRpZFRpbWVPdXQgPSBhd2FpdCBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gRXZlbnQub25jZSh0ZXJtaW5hbE1hbmFnZXIub25EaWRTZW5kVGV4dCkoKCkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKGZhbHNlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChsaXN0ZW5lcik7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKHRydWUpO1xuXHRcdFx0XHR9LCAxMDAwKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gY2xlYXJUaW1lb3V0KGhhbmRsZSkgfSk7XG5cdFx0XHR9KTtcblx0XHRcdGlmIChkaWRUaW1lT3V0KSB7XG5cdFx0XHRcdGFzc2VydC5mYWlsKGBUaW1lZCBvdXQgd2FpdGluZyBmb3IgJHtjb3VudH0gc2VuZFRleHQgY2FsbHM7IHNhdyAke3Rlcm1pbmFsTWFuYWdlci5zZW50VGV4dHMubGVuZ3RofWApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIG1hcmtDcmVhdGVkVGVybWluYWxzRXhpc3QodGVybWluYWxNYW5hZ2VyOiBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjcmVhdGVkIG9mIHRlcm1pbmFsTWFuYWdlci5jcmVhdGVkKSB7XG5cdFx0XHR0ZXJtaW5hbE1hbmFnZXIuZXhpc3RpbmdUZXJtaW5hbFVyaXMuYWRkKGNyZWF0ZWQucGFyYW1zLmNoYW5uZWwpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ3VzZXMgc2Vzc2lvbiB3b3JraW5nIGRpcmVjdG9yeSBmb3IgY3JlYXRlZCBzaGVsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVybWluYWxNYW5hZ2VyIH0gPSBjcmVhdGVTZXJ2aWNlcygpO1xuXHRcdGNvbnN0IHdvcmt0cmVlUGF0aCA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3dvcmt0cmVlJykuZnNQYXRoO1xuXHRcdGNvbnN0IGV4cGxpY2l0Q3dkID0gVVJJLmZpbGUoJy9leHBsaWNpdC9jd2QnKS5mc1BhdGg7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgVVJJLmZpbGUod29ya3RyZWVQYXRoKSkpO1xuXG5cdFx0KGF3YWl0IHNoZWxsTWFuYWdlci5nZXRPckNyZWF0ZVNoZWxsKCdiYXNoJywgJ3R1cm4tMScsICd0b29sLTEnKSkuZGlzcG9zZSgpO1xuXHRcdChhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTaGVsbCgnYmFzaCcsICd0dXJuLTInLCAndG9vbC0yJywgZXhwbGljaXRDd2QpKS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlcm1pbmFsTWFuYWdlci5jcmVhdGVkLm1hcChjID0+IGMucGFyYW1zLmN3ZCksIFtcblx0XHRcdHdvcmt0cmVlUGF0aCxcblx0XHRcdGV4cGxpY2l0Q3dkLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcHRzIGV2ZXJ5IG1hbmFnZWQgc2hlbGwgaW50byBzaGVsbC1oaXN0b3J5IHN1cHByZXNzaW9uIGFuZCBub24taW50ZXJhY3RpdmUgbW9kZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXJtaW5hbE1hbmFnZXIgfSA9IGNyZWF0ZVNlcnZpY2VzKCk7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTaGVsbCgnYmFzaCcsICd0dXJuLTEnLCAndG9vbC0xJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWRbMF0ub3B0aW9ucz8ucHJldmVudFNoZWxsSGlzdG9yeSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1pbmFsTWFuYWdlci5jcmVhdGVkWzBdLm9wdGlvbnM/Lm5vbkludGVyYWN0aXZlLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgZXhlY3V0YWJsZSByZXNvbHZlZCBieSB0aGUgdGVybWluYWwgbWFuYWdlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXJtaW5hbE1hbmFnZXIgfSA9IGNyZWF0ZVNlcnZpY2VzKCk7XG5cdFx0dGVybWluYWxNYW5hZ2VyLmRlZmF1bHRTaGVsbCA9ICcvY3VzdG9tL3BhdGgvdG8vcHdzaCc7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTaGVsbCgncG93ZXJzaGVsbCcsICd0dXJuLTEnLCAndG9vbC0xJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWRbMF0ub3B0aW9ucz8uc2hlbGwsICcvY3VzdG9tL3BhdGgvdG8vcHdzaCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmaXhGb3JIaXN0b3J5U3VwcHJlc3Npb24gcHJlcGVuZHMgYSBzcGFjZSBmb3IgUE9TSVggc2hlbGxzLCBuby1vcCBmb3IgUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlZml4Rm9ySGlzdG9yeVN1cHByZXNzaW9uKCdiYXNoJyksICcgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZWZpeEZvckhpc3RvcnlTdXBwcmVzc2lvbigncG93ZXJzaGVsbCcpLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoZWxsVHlwZUZvckV4ZWN1dGFibGUgbWFwcyBrbm93biBzaGVsbCBiYXNlbmFtZXMgYW5kIGZhbGxzIGJhY2sgdG8gcGxhdGZvcm0gZGVmYXVsdCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHNoZWxsVHlwZUZvckV4ZWN1dGFibGUoJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlJyksXG5cdFx0XHRzaGVsbFR5cGVGb3JFeGVjdXRhYmxlKCdDOlxcXFxXaW5kb3dzXFxcXFN5c3RlbTMyXFxcXFdpbmRvd3NQb3dlclNoZWxsXFxcXHYxLjBcXFxccG93ZXJzaGVsbC5leGUnKSxcblx0XHRcdHNoZWxsVHlwZUZvckV4ZWN1dGFibGUoJy91c3IvYmluL2Jhc2gnKSxcblx0XHRcdHNoZWxsVHlwZUZvckV4ZWN1dGFibGUoJy91c3IvYmluL3pzaCcpLFxuXHRcdFx0c2hlbGxUeXBlRm9yRXhlY3V0YWJsZSgnL2Jpbi9zaCcpLFxuXHRcdF0sIFsncG93ZXJzaGVsbCcsICdwb3dlcnNoZWxsJywgJ2Jhc2gnLCAnYmFzaCcsICdiYXNoJ10pO1xuXG5cdFx0Ly8gVW5rbm93biBzaGVsbHMgZmFsbCB0aHJvdWdoIHRvIHRoZSBwbGF0Zm9ybSBkZWZhdWx0IFx1MjAxNCBqdXN0IGFzc2VydCBpdCdzIG9uZSBvZiB0aGUga25vd24gdHlwZXMuXG5cdFx0Y29uc3QgdW5rbm93bkRlZmF1bHQgPSBzaGVsbFR5cGVGb3JFeGVjdXRhYmxlKCdDOlxcXFxXaW5kb3dzXFxcXFN5c3RlbTMyXFxcXGNtZC5leGUnKTtcblx0XHRhc3NlcnQub2sodW5rbm93bkRlZmF1bHQgPT09ICdiYXNoJyB8fCB1bmtub3duRGVmYXVsdCA9PT0gJ3Bvd2Vyc2hlbGwnKTtcblx0fSk7XG5cblx0dGVzdCgnenNoIGV4ZWN1dGFibGUga2VlcHMgYmFzaCB0b29sIG5hbWUgYnV0IHVzZXMgenNoLXNwZWNpZmljIGd1aWRhbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRlcm1pbmFsTWFuYWdlciB9ID0gY3JlYXRlU2VydmljZXMoKTtcblx0XHR0ZXJtaW5hbE1hbmFnZXIuZGVmYXVsdFNoZWxsID0gJy9iaW4venNoJztcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0b29scyA9IGF3YWl0IGNyZWF0ZVNoZWxsVG9vbHMoc2hlbGxNYW5hZ2VyLCB0ZXJtaW5hbE1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBiYXNoVG9vbCA9IHRvb2xzLmZpbmQodG9vbCA9PiB0b29sLm5hbWUgPT09ICdiYXNoJyk7XG5cblx0XHRhc3NlcnQub2soYmFzaFRvb2wpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNoVG9vbC5uYW1lLCAnYmFzaCcpO1xuXHRcdGFzc2VydC5vayhiYXNoVG9vbC5kZXNjcmlwdGlvbik7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBiYXNoVG9vbC5kZXNjcmlwdGlvbjtcblx0XHRhc3NlcnQubWF0Y2goZGVzY3JpcHRpb24sIC9wZXJzaXN0ZW50IHpzaCB0ZXJtaW5hbCBzZXNzaW9uLyk7XG5cdFx0YXNzZXJ0Lm1hdGNoKGRlc2NyaXB0aW9uLCAvenNoIGdsb2JiaW5nIGZlYXR1cmVzLyk7XG5cdFx0YXNzZXJ0Lm1hdGNoKGRlc2NyaXB0aW9uLCAvYmFyZSA9PSBvciA9PT0vKTtcblx0XHRhc3NlcnQubWF0Y2goZGVzY3JpcHRpb24sIC9zdGF0dXMgYXMgYSB2YXJpYWJsZSBuYW1lLyk7XG5cdFx0YXNzZXJ0LmRvZXNOb3RNYXRjaChkZXNjcmlwdGlvbiwgL2JhbmcgaGlzdG9yeS8pO1xuXHRcdGFzc2VydC5kb2VzTm90TWF0Y2goZGVzY3JpcHRpb24sIC8jIGNvbW1lbnRzLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE9yQ3JlYXRlU2hlbGwgcmV1c2VzIGFuIGlkbGUgc2hlbGwgYWZ0ZXIgdGhlIHJlZmVyZW5jZSBpcyBkaXNwb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXJtaW5hbE1hbmFnZXIgPSBuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpO1xuXHRcdC8vIFByZXRlbmQgY3JlYXRlZCB0ZXJtaW5hbHMgZXhpc3QgYW5kIGFyZSBzdGlsbCBydW5uaW5nLlxuXHRcdCh0ZXJtaW5hbE1hbmFnZXIgYXMgdW5rbm93biBhcyB7IGhhc1Rlcm1pbmFsOiAoKSA9PiBib29sZWFuIH0pLmhhc1Rlcm1pbmFsID0gKCkgPT4gdHJ1ZTtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdHNlcnZpY2VzLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLCB0ZXJtaW5hbE1hbmFnZXIpO1xuXHRcdHNlcnZpY2VzLnNldChJU2FuZGJveEhlbHBlclNlcnZpY2UsIGNyZWF0ZVN0dWJTYW5kYm94SGVscGVyU2VydmljZSgpKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdHNlcnZpY2VzLnNldChJSW5zdGFudGlhdGlvblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgc2hlbGxNYW5hZ2VyLmdldE9yQ3JlYXRlU2hlbGwoJ2Jhc2gnLCAndHVybi0xJywgJ3Rvb2wtMScpO1xuXHRcdGZpcnN0LmRpc3Bvc2UoKTtcblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTaGVsbCgnYmFzaCcsICd0dXJuLTInLCAndG9vbC0yJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLm9iamVjdC5pZCwgZmlyc3Qub2JqZWN0LmlkLCAnc2hvdWxkIHJldXNlIGlkbGUgc2hlbGwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWQubGVuZ3RoLCAxKTtcblx0XHRzZWNvbmQuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRPckNyZWF0ZVNoZWxsIGNyZWF0ZXMgYSBuZXcgc2hlbGwgd2hlbiB0aGUgZXhpc3RpbmcgcmVmZXJlbmNlIGlzIHN0aWxsIGhlbGQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVybWluYWxNYW5hZ2VyID0gbmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoKTtcblx0XHQodGVybWluYWxNYW5hZ2VyIGFzIHVua25vd24gYXMgeyBoYXNUZXJtaW5hbDogKCkgPT4gYm9vbGVhbiB9KS5oYXNUZXJtaW5hbCA9ICgpID0+IHRydWU7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyKTtcblx0XHRzZXJ2aWNlcy5zZXQoSVNhbmRib3hIZWxwZXJTZXJ2aWNlLCBjcmVhdGVTdHViU2FuZGJveEhlbHBlclNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKSk7XG5cblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IHNoZWxsTWFuYWdlci5nZXRPckNyZWF0ZVNoZWxsKCdiYXNoJywgJ3R1cm4tMScsICd0b29sLTEnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTaGVsbCgnYmFzaCcsICd0dXJuLTInLCAndG9vbC0yJyk7XG5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc2Vjb25kLm9iamVjdC5pZCwgZmlyc3Qub2JqZWN0LmlkLCAnc2hvdWxkIGNyZWF0ZSBhIG5ldyBzaGVsbCB3aGVuIGV4aXN0aW5nIGlzIGJ1c3knKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWQubGVuZ3RoLCAyKTtcblx0XHRmaXJzdC5kaXNwb3NlKCk7XG5cdFx0c2Vjb25kLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2hlbGwgaGVscGVyIHRvb2xzIChyZWFkL3dyaXRlL3NodXRkb3duL2xpc3QvcmVkaXJlY3QpIGFyZSByZWdpc3RlcmVkIHdpdGggc2tpcFBlcm1pc3Npb246IHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiBndWFyZDogdGhlIFNESydzIGJ1aWx0LWluIHNoZWxsIGhlbHBlcnMgbmV2ZXIgY2FsbFxuXHRcdC8vIGBwZXJtaXNzaW9ucy5yZXF1ZXN0YC4gT3VyIFBUWS1iYWNrZWQgb3ZlcnJpZGVzIG11c3QgbWlycm9yIHRoYXRcblx0XHQvLyBvciB0aGUgYWdlbnQgaG9zdCB3aWxsIHN1cmZhY2UgYSBwZXJtaXNzaW9uIHByb21wdCBmb3IgZXZlcnlcblx0XHQvLyBgd3JpdGVfYmFzaGAgLyBgcmVhZF9iYXNoYCAvIGBiYXNoX3NodXRkb3duYCAvIGBsaXN0X2Jhc2hgIGNhbGwsXG5cdFx0Ly8gd2hpY2ggYnJlYWtzIGludGVyYWN0aXZlIHNoZWxsIGZsb3dzLlxuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRlcm1pbmFsTWFuYWdlciB9ID0gY3JlYXRlU2VydmljZXMoKTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0b29scyA9IGF3YWl0IGNyZWF0ZVNoZWxsVG9vbHMoc2hlbGxNYW5hZ2VyLCB0ZXJtaW5hbE1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHNraXBQZXJtaXNzaW9uQnlOYW1lID0gT2JqZWN0LmZyb21FbnRyaWVzKHRvb2xzLm1hcCh0ID0+IFt0Lm5hbWUsIHQuc2tpcFBlcm1pc3Npb24gPz8gZmFsc2VdKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChza2lwUGVybWlzc2lvbkJ5TmFtZSwge1xuXHRcdFx0YmFzaDogZmFsc2UsXG5cdFx0XHRyZWFkX2Jhc2g6IHRydWUsXG5cdFx0XHR3cml0ZV9iYXNoOiB0cnVlLFxuXHRcdFx0YmFzaF9zaHV0ZG93bjogdHJ1ZSxcblx0XHRcdGxpc3RfYmFzaDogdHJ1ZSxcblx0XHRcdHBvd2Vyc2hlbGw6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW1hcnkgc2hlbGwgdG9vbCBub3JtYWxpemVzIG11bHRpbGluZSBjb21tYW5kIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRlcm1pbmFsTWFuYWdlciB9ID0gY3JlYXRlU2VydmljZXMoKTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0b29scyA9IGF3YWl0IGNyZWF0ZVNoZWxsVG9vbHMoc2hlbGxNYW5hZ2VyLCB0ZXJtaW5hbE1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBiYXNoVG9vbCA9IHRvb2xzLmZpbmQodG9vbCA9PiB0b29sLm5hbWUgPT09ICdiYXNoJyk7XG5cdFx0YXNzZXJ0Lm9rKGJhc2hUb29sKTtcblxuXHRcdGNvbnN0IGludm9jYXRpb246IFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdGFyZ3VtZW50czogeyBjb21tYW5kOiAnZWNobyBmaXJzdFxcbmVjaG8gc2Vjb25kJywgdGltZW91dDogMSB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYmFzaFRvb2wuaGFuZGxlciEoeyBjb21tYW5kOiAnZWNobyBmaXJzdFxcbmVjaG8gc2Vjb25kJywgdGltZW91dDogMSB9LCBpbnZvY2F0aW9uKSBhcyBUb29sUmVzdWx0T2JqZWN0O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXN1bHRUeXBlLCAnZmFpbHVyZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtaW5hbE1hbmFnZXIuc2VudFRleHRzWzBdLm9wdGlvbnMuYnJhY2tldGVkUGFzdGVNb2RlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLnNlbnRUZXh0c1sxXS5vcHRpb25zLmJyYWNrZXRlZFBhc3RlTW9kZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLndyaXRlc1swXS5kYXRhLCAnIGVjaG8gZmlyc3RcXHJlY2hvIHNlY29uZFxccicpO1xuXHRcdGFzc2VydC5tYXRjaCh0ZXJtaW5hbE1hbmFnZXIud3JpdGVzWzFdLmRhdGEsIC9eZWNobyBcIjw8PENPUElMT1RfU0VOVElORUxfW2EtZjAtOV0rX0VYSVRfXFwkXFw/Pj4+XCJcXHIkLyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW1hcnkgc2hlbGwgdG9vbCBpZ25vcmVzIGVjaG9lZCBzZW50aW5lbCBjb21tYW5kIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVybWluYWxNYW5hZ2VyIH0gPSBjcmVhdGVTZXJ2aWNlcygpO1xuXG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbHMgPSBhd2FpdCBjcmVhdGVTaGVsbFRvb2xzKHNoZWxsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgYmFzaFRvb2wgPSB0b29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSAnYmFzaCcpO1xuXHRcdGFzc2VydC5vayhiYXNoVG9vbCk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uOiBUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRhcmd1bWVudHM6IHsgY29tbWFuZDogJ2VjaG8gTU9DS0VEX0FHRU5UX0hPU1RfU0FOREJPWF9SRVNQT05TRScsIHRpbWVvdXQ6IDEwMDAgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBiYXNoVG9vbC5oYW5kbGVyISh7IGNvbW1hbmQ6ICdlY2hvIE1PQ0tFRF9BR0VOVF9IT1NUX1NBTkRCT1hfUkVTUE9OU0UnLCB0aW1lb3V0OiAxMDAwIH0sIGludm9jYXRpb24pIGFzIFByb21pc2U8VG9vbFJlc3VsdE9iamVjdD47XG5cdFx0YXdhaXQgd2FpdEZvclNlbnRUZXh0cyh0ZXJtaW5hbE1hbmFnZXIsIDIpO1xuXG5cdFx0Y29uc3Qgc2VudGluZWxNYXRjaCA9IHRlcm1pbmFsTWFuYWdlci53cml0ZXNbMV0uZGF0YS5tYXRjaCgvPDw8Q09QSUxPVF9TRU5USU5FTF8oW2EtZjAtOV0rKV9FWElUX1xcJFxcPz4+Lyk7XG5cdFx0YXNzZXJ0Lm9rKHNlbnRpbmVsTWF0Y2gsICdzZW50aW5lbCBtYXJrZXIgc2hvdWxkIGJlIHByZXNlbnQnKTtcblx0XHRjb25zdCBzZW50aW5lbElkID0gc2VudGluZWxNYXRjaFsxXTtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0JyBlY2hvIE1PQ0tFRF9BR0VOVF9IT1NUX1NBTkRCT1hfUkVTUE9OU0UnLFxuXHRcdFx0J01PQ0tFRF9BR0VOVF9IT1NUX1NBTkRCT1hfUkVTUE9OU0UnLFxuXHRcdFx0YGVjaG8gXCI8PDxDT1BJTE9UX1NFTlRJTkVMXyR7c2VudGluZWxJZH1fRVhJVF8kPz4+PlwiYCxcblx0XHRcdGA8PDxDT1BJTE9UX1NFTlRJTkVMXyR7c2VudGluZWxJZH1fRVhJVF8wPj4+YCxcblx0XHRdLmpvaW4oJ1xcclxcbicpO1xuXHRcdHRlcm1pbmFsTWFuYWdlci5zZXRDb250ZW50KGNvbnRlbnQpO1xuXHRcdHRlcm1pbmFsTWFuYWdlci5maXJlRGF0YShjb250ZW50KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXN1bHRUeXBlLCAnc3VjY2VzcycpO1xuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQudGV4dFJlc3VsdEZvckxsbSwgL0V4aXQgY29kZTogMC8pO1xuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQudGV4dFJlc3VsdEZvckxsbSwgL01PQ0tFRF9BR0VOVF9IT1NUX1NBTkRCT1hfUkVTUE9OU0UvKTtcblx0fSk7XG5cblx0dGVzdCgncHJpbWFyeSBzaGVsbCB0b29sIGZvcmNlcyBicmFja2V0ZWQgcGFzdGUgd2l0aCBzaGVsbCBpbnRlZ3JhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXJtaW5hbE1hbmFnZXIgfSA9IGNyZWF0ZVNlcnZpY2VzKCk7XG5cdFx0dGVybWluYWxNYW5hZ2VyLmNvbW1hbmREZXRlY3Rpb25TdXBwb3J0ZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIFVSSS5wYXJzZSgnY29waWxvdDovc2Vzc2lvbi0xJyksIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhzaGVsbE1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGJhc2hUb29sID0gdG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gJ2Jhc2gnKTtcblx0XHRhc3NlcnQub2soYmFzaFRvb2wpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbjogVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0YXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdlY2hvIGZpcnN0XFxuZWNobyBzZWNvbmQnLCB0aW1lb3V0OiAxMDAwIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gYmFzaFRvb2wuaGFuZGxlciEoeyBjb21tYW5kOiAnZWNobyBmaXJzdFxcbmVjaG8gc2Vjb25kJywgdGltZW91dDogMTAwMCB9LCBpbnZvY2F0aW9uKSBhcyBQcm9taXNlPFRvb2xSZXN1bHRPYmplY3Q+O1xuXHRcdGF3YWl0IHRlcm1pbmFsTWFuYWdlci5jb21tYW5kRmluaXNoZWRMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHR0ZXJtaW5hbE1hbmFnZXIuZmlyZUNvbW1hbmRGaW5pc2hlZCh7IGNvbW1hbmRJZDogJ2NtZC0xJywgZXhpdENvZGU6IDAsIGNvbW1hbmQ6ICdlY2hvIGZpcnN0XFxuZWNobyBzZWNvbmQnLCBvdXRwdXQ6ICdmaXJzdFxcbnNlY29uZCcgfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzdWx0VHlwZSwgJ3N1Y2Nlc3MnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLnNlbnRUZXh0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtaW5hbE1hbmFnZXIuc2VudFRleHRzWzBdLm9wdGlvbnMuYnJhY2tldGVkUGFzdGVNb2RlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLndyaXRlc1swXS5kYXRhLCAnIGVjaG8gZmlyc3RcXHJlY2hvIHNlY29uZFxccicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmltYXJ5IHNoZWxsIHRvb2wgcmV0dXJucyBhbHRlcm5hdGVCdWZmZXIgd2hlbiBzaGVsbCBpbnRlZ3JhdGlvbiBlbnRlcnMgYWx0IGJ1ZmZlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXJtaW5hbE1hbmFnZXIgfSA9IGNyZWF0ZVNlcnZpY2VzKCk7XG5cdFx0dGVybWluYWxNYW5hZ2VyLmNvbW1hbmREZXRlY3Rpb25TdXBwb3J0ZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIFVSSS5wYXJzZSgnY29waWxvdDovc2Vzc2lvbi0xJyksIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhzaGVsbE1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGJhc2hUb29sID0gdG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gJ2Jhc2gnKTtcblx0XHRhc3NlcnQub2soYmFzaFRvb2wpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbjogVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0YXJndW1lbnRzOiB7IGNvbW1hbmQ6ICd2aW0gUkVBRE1FLm1kJywgdGltZW91dDogMTAwMCB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGJhc2hUb29sLmhhbmRsZXIhKHsgY29tbWFuZDogJ3ZpbSBSRUFETUUubWQnLCB0aW1lb3V0OiAxMDAwIH0sIGludm9jYXRpb24pIGFzIFByb21pc2U8VG9vbFJlc3VsdE9iamVjdD47XG5cdFx0YXdhaXQgd2FpdEZvclNlbnRUZXh0cyh0ZXJtaW5hbE1hbmFnZXIsIDEpO1xuXHRcdHRlcm1pbmFsTWFuYWdlci5maXJlRGlkRW50ZXJBbHRCdWZmZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXN1bHRUeXBlLCAnZmFpbHVyZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3IsICdhbHRlcm5hdGVCdWZmZXInKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnRleHRSZXN1bHRGb3JMbG0sIC9vcGVuZWQgdGhlIGFsdGVybmF0ZSBidWZmZXIvKTtcblx0fSk7XG5cblx0dGVzdCgncHJpbWFyeSBzaGVsbCB0b29sIHJldHVybnMgYWx0ZXJuYXRlQnVmZmVyIHdoZW4gc2VudGluZWwgZmFsbGJhY2sgZW50ZXJzIGFsdCBidWZmZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVybWluYWxNYW5hZ2VyIH0gPSBjcmVhdGVTZXJ2aWNlcygpO1xuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIFVSSS5wYXJzZSgnY29waWxvdDovc2Vzc2lvbi0xJyksIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhzaGVsbE1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGJhc2hUb29sID0gdG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gJ2Jhc2gnKTtcblx0XHRhc3NlcnQub2soYmFzaFRvb2wpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbjogVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0YXJndW1lbnRzOiB7IGNvbW1hbmQ6ICd2aW0gUkVBRE1FLm1kJywgdGltZW91dDogMTAwMCB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGJhc2hUb29sLmhhbmRsZXIhKHsgY29tbWFuZDogJ3ZpbSBSRUFETUUubWQnLCB0aW1lb3V0OiAxMDAwIH0sIGludm9jYXRpb24pIGFzIFByb21pc2U8VG9vbFJlc3VsdE9iamVjdD47XG5cdFx0YXdhaXQgd2FpdEZvclNlbnRUZXh0cyh0ZXJtaW5hbE1hbmFnZXIsIDIpO1xuXHRcdHRlcm1pbmFsTWFuYWdlci5maXJlRGlkRW50ZXJBbHRCdWZmZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXN1bHRUeXBlLCAnZmFpbHVyZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZXJyb3IsICdhbHRlcm5hdGVCdWZmZXInKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnRleHRSZXN1bHRGb3JMbG0sIC9vcGVuZWQgdGhlIGFsdGVybmF0ZSBidWZmZXIvKTtcblx0fSk7XG5cblx0dGVzdCgnYWx0LWJ1ZmZlciBzaGVsbCBpcyByZWxlYXNlZCB3aGVuIGNvbW1hbmQgZmluaXNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVybWluYWxNYW5hZ2VyIH0gPSBjcmVhdGVTZXJ2aWNlcygpO1xuXHRcdHRlcm1pbmFsTWFuYWdlci5jb21tYW5kRGV0ZWN0aW9uU3VwcG9ydGVkID0gdHJ1ZTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0b29scyA9IGF3YWl0IGNyZWF0ZVNoZWxsVG9vbHMoc2hlbGxNYW5hZ2VyLCB0ZXJtaW5hbE1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBiYXNoVG9vbCA9IHRvb2xzLmZpbmQodG9vbCA9PiB0b29sLm5hbWUgPT09ICdiYXNoJyk7XG5cdFx0YXNzZXJ0Lm9rKGJhc2hUb29sKTtcblxuXHRcdGNvbnN0IGludm9jYXRpb246IFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdGFyZ3VtZW50czogeyBjb21tYW5kOiAndmltIFJFQURNRS5tZCcsIHRpbWVvdXQ6IDEwMDAgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBiYXNoVG9vbC5oYW5kbGVyISh7IGNvbW1hbmQ6ICd2aW0gUkVBRE1FLm1kJywgdGltZW91dDogMTAwMCB9LCBpbnZvY2F0aW9uKSBhcyBQcm9taXNlPFRvb2xSZXN1bHRPYmplY3Q+O1xuXHRcdGF3YWl0IHdhaXRGb3JTZW50VGV4dHModGVybWluYWxNYW5hZ2VyLCAxKTtcblx0XHR0ZXJtaW5hbE1hbmFnZXIuZmlyZURpZEVudGVyQWx0QnVmZmVyKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9yLCAnYWx0ZXJuYXRlQnVmZmVyJyk7XG5cdFx0bWFya0NyZWF0ZWRUZXJtaW5hbHNFeGlzdCh0ZXJtaW5hbE1hbmFnZXIpO1xuXHRcdGNvbnN0IHNoZWxsID0gc2hlbGxNYW5hZ2VyLmxpc3RTaGVsbHMoKVswXTtcblxuXHRcdHRlcm1pbmFsTWFuYWdlci5maXJlQ29tbWFuZEZpbmlzaGVkKHsgY29tbWFuZElkOiAnY21kLTEnLCBleGl0Q29kZTogMCwgY29tbWFuZDogJ3ZpbSBSRUFETUUubWQnLCBvdXRwdXQ6ICcnIH0pO1xuXHRcdGNvbnN0IG5leHQgPSBhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTaGVsbCgnYmFzaCcsICd0dXJuLTInLCAndG9vbC0yJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV4dC5vYmplY3QuaWQsIHNoZWxsLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWQubGVuZ3RoLCAxKTtcblx0XHRuZXh0LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYWx0LWJ1ZmZlciBzaGVsbCBpcyBub3QgaW1tZWRpYXRlbHkgcmV1c2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRlcm1pbmFsTWFuYWdlciB9ID0gY3JlYXRlU2VydmljZXMoKTtcblx0XHR0ZXJtaW5hbE1hbmFnZXIuY29tbWFuZERldGVjdGlvblN1cHBvcnRlZCA9IHRydWU7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbHMgPSBhd2FpdCBjcmVhdGVTaGVsbFRvb2xzKHNoZWxsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgYmFzaFRvb2wgPSB0b29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSAnYmFzaCcpO1xuXHRcdGFzc2VydC5vayhiYXNoVG9vbCk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uOiBUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRhcmd1bWVudHM6IHsgY29tbWFuZDogJ3ZpbSBSRUFETUUubWQnLCB0aW1lb3V0OiAxMDAwIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gYmFzaFRvb2wuaGFuZGxlciEoeyBjb21tYW5kOiAndmltIFJFQURNRS5tZCcsIHRpbWVvdXQ6IDEwMDAgfSwgaW52b2NhdGlvbikgYXMgUHJvbWlzZTxUb29sUmVzdWx0T2JqZWN0Pjtcblx0XHRhd2FpdCB3YWl0Rm9yU2VudFRleHRzKHRlcm1pbmFsTWFuYWdlciwgMSk7XG5cdFx0dGVybWluYWxNYW5hZ2VyLmZpcmVEaWRFbnRlckFsdEJ1ZmZlcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvciwgJ2FsdGVybmF0ZUJ1ZmZlcicpO1xuXHRcdG1hcmtDcmVhdGVkVGVybWluYWxzRXhpc3QodGVybWluYWxNYW5hZ2VyKTtcblx0XHRjb25zdCBzaGVsbCA9IHNoZWxsTWFuYWdlci5saXN0U2hlbGxzKClbMF07XG5cblx0XHRjb25zdCBuZXh0ID0gYXdhaXQgc2hlbGxNYW5hZ2VyLmdldE9yQ3JlYXRlU2hlbGwoJ2Jhc2gnLCAndHVybi0yJywgJ3Rvb2wtMicpO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKG5leHQub2JqZWN0LmlkLCBzaGVsbC5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1pbmFsTWFuYWdlci5jcmVhdGVkLmxlbmd0aCwgMik7XG5cdFx0bmV4dC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JhY2tncm91bmRlZCBzaGVsbCBpcyBub3QgaW1tZWRpYXRlbHkgcmV1c2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRlcm1pbmFsTWFuYWdlciB9ID0gY3JlYXRlU2VydmljZXMoKTtcblx0XHR0ZXJtaW5hbE1hbmFnZXIuY29tbWFuZERldGVjdGlvblN1cHBvcnRlZCA9IHRydWU7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbHMgPSBhd2FpdCBjcmVhdGVTaGVsbFRvb2xzKHNoZWxsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgYmFzaFRvb2wgPSB0b29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSAnYmFzaCcpO1xuXHRcdGFzc2VydC5vayhiYXNoVG9vbCk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uOiBUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRhcmd1bWVudHM6IHsgY29tbWFuZDogJ3NsZWVwIDEwMCcsIHRpbWVvdXQ6IDEwMDAgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBiYXNoVG9vbC5oYW5kbGVyISh7IGNvbW1hbmQ6ICdzbGVlcCAxMDAnLCB0aW1lb3V0OiAxMDAwIH0sIGludm9jYXRpb24pIGFzIFByb21pc2U8VG9vbFJlc3VsdE9iamVjdD47XG5cdFx0YXdhaXQgd2FpdEZvclNlbnRUZXh0cyh0ZXJtaW5hbE1hbmFnZXIsIDEpO1xuXHRcdHRlcm1pbmFsTWFuYWdlci5maXJlQ2xhaW1DaGFuZ2VkKHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuU2Vzc2lvbiwgc2Vzc2lvbjogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsIHR1cm5JZDogJ3R1cm4tMScgfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlc3VsdFR5cGUsICdzdWNjZXNzJyk7XG5cdFx0YXNzZXJ0Lm1hdGNoKHJlc3VsdC50ZXh0UmVzdWx0Rm9yTGxtLCAvY29udGludWUgdGhpcyBjb21tYW5kIGluIHRoZSBiYWNrZ3JvdW5kLyk7XG5cdFx0bWFya0NyZWF0ZWRUZXJtaW5hbHNFeGlzdCh0ZXJtaW5hbE1hbmFnZXIpO1xuXHRcdGNvbnN0IHNoZWxsID0gc2hlbGxNYW5hZ2VyLmxpc3RTaGVsbHMoKVswXTtcblxuXHRcdGNvbnN0IG5leHQgPSBhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTaGVsbCgnYmFzaCcsICd0dXJuLTInLCAndG9vbC0yJyk7XG5cblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwobmV4dC5vYmplY3QuaWQsIHNoZWxsLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWQubGVuZ3RoLCAyKTtcblx0XHRuZXh0LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYmFja2dyb3VuZGVkIHNoZWxsIGlzIHJlbGVhc2VkIHdoZW4gY29tbWFuZCBmaW5pc2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXJtaW5hbE1hbmFnZXIgfSA9IGNyZWF0ZVNlcnZpY2VzKCk7XG5cdFx0dGVybWluYWxNYW5hZ2VyLmNvbW1hbmREZXRlY3Rpb25TdXBwb3J0ZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIFVSSS5wYXJzZSgnY29waWxvdDovc2Vzc2lvbi0xJyksIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhzaGVsbE1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGJhc2hUb29sID0gdG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gJ2Jhc2gnKTtcblx0XHRhc3NlcnQub2soYmFzaFRvb2wpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbjogVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0YXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdzbGVlcCAxMDAnLCB0aW1lb3V0OiAxMDAwIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gYmFzaFRvb2wuaGFuZGxlciEoeyBjb21tYW5kOiAnc2xlZXAgMTAwJywgdGltZW91dDogMTAwMCB9LCBpbnZvY2F0aW9uKSBhcyBQcm9taXNlPFRvb2xSZXN1bHRPYmplY3Q+O1xuXHRcdGF3YWl0IHdhaXRGb3JTZW50VGV4dHModGVybWluYWxNYW5hZ2VyLCAxKTtcblx0XHR0ZXJtaW5hbE1hbmFnZXIuZmlyZUNsYWltQ2hhbmdlZCh7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLlNlc3Npb24sIHNlc3Npb246ICdjb3BpbG90Oi9zZXNzaW9uLTEnLCB0dXJuSWQ6ICd0dXJuLTEnIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3VsdFByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXN1bHRUeXBlLCAnc3VjY2VzcycpO1xuXHRcdG1hcmtDcmVhdGVkVGVybWluYWxzRXhpc3QodGVybWluYWxNYW5hZ2VyKTtcblx0XHRjb25zdCBzaGVsbCA9IHNoZWxsTWFuYWdlci5saXN0U2hlbGxzKClbMF07XG5cblx0XHR0ZXJtaW5hbE1hbmFnZXIuZmlyZUNvbW1hbmRGaW5pc2hlZCh7IGNvbW1hbmRJZDogJ2NtZC0xJywgZXhpdENvZGU6IDAsIGNvbW1hbmQ6ICdzbGVlcCAxMDAnLCBvdXRwdXQ6ICcnIH0pO1xuXHRcdGNvbnN0IG5leHQgPSBhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTaGVsbCgnYmFzaCcsICd0dXJuLTInLCAndG9vbC0yJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV4dC5vYmplY3QuaWQsIHNoZWxsLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWQubGVuZ3RoLCAxKTtcblx0XHRuZXh0LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYmFja2dyb3VuZGVkIHNoZWxsIGlzIHJlbGVhc2VkIHdoZW4gdGVybWluYWwgZXhpdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVybWluYWxNYW5hZ2VyIH0gPSBjcmVhdGVTZXJ2aWNlcygpO1xuXHRcdHRlcm1pbmFsTWFuYWdlci5jb21tYW5kRGV0ZWN0aW9uU3VwcG9ydGVkID0gdHJ1ZTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCB0b29scyA9IGF3YWl0IGNyZWF0ZVNoZWxsVG9vbHMoc2hlbGxNYW5hZ2VyLCB0ZXJtaW5hbE1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBiYXNoVG9vbCA9IHRvb2xzLmZpbmQodG9vbCA9PiB0b29sLm5hbWUgPT09ICdiYXNoJyk7XG5cdFx0YXNzZXJ0Lm9rKGJhc2hUb29sKTtcblxuXHRcdGNvbnN0IGludm9jYXRpb246IFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdGFyZ3VtZW50czogeyBjb21tYW5kOiAnc2xlZXAgMTAwJywgdGltZW91dDogMTAwMCB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0UHJvbWlzZSA9IGJhc2hUb29sLmhhbmRsZXIhKHsgY29tbWFuZDogJ3NsZWVwIDEwMCcsIHRpbWVvdXQ6IDEwMDAgfSwgaW52b2NhdGlvbikgYXMgUHJvbWlzZTxUb29sUmVzdWx0T2JqZWN0Pjtcblx0XHRhd2FpdCB3YWl0Rm9yU2VudFRleHRzKHRlcm1pbmFsTWFuYWdlciwgMSk7XG5cdFx0dGVybWluYWxNYW5hZ2VyLmZpcmVDbGFpbUNoYW5nZWQoeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5TZXNzaW9uLCBzZXNzaW9uOiAnY29waWxvdDovc2Vzc2lvbi0xJywgdHVybklkOiAndHVybi0xJyB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzdWx0VHlwZSwgJ3N1Y2Nlc3MnKTtcblx0XHRtYXJrQ3JlYXRlZFRlcm1pbmFsc0V4aXN0KHRlcm1pbmFsTWFuYWdlcik7XG5cdFx0Y29uc3Qgc2hlbGwgPSBzaGVsbE1hbmFnZXIubGlzdFNoZWxscygpWzBdO1xuXG5cdFx0dGVybWluYWxNYW5hZ2VyLmZpcmVFeGl0KDApO1xuXHRcdGNvbnN0IG5leHQgPSBhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTaGVsbCgnYmFzaCcsICd0dXJuLTInLCAndG9vbC0yJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV4dC5vYmplY3QuaWQsIHNoZWxsLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWQubGVuZ3RoLCAxKTtcblx0XHRuZXh0LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncHJpbWFyeSBzaGVsbCB0b29sIG9ubHkgZm9yY2VzIGJyYWNrZXRlZCBwYXN0ZSBmb3Igc2luZ2xlLWxpbmUgY29tbWFuZHMgb24gbWFjT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVybWluYWxNYW5hZ2VyIH0gPSBjcmVhdGVTZXJ2aWNlcygpO1xuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIFVSSS5wYXJzZSgnY29waWxvdDovc2Vzc2lvbi0xJyksIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhzaGVsbE1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGJhc2hUb29sID0gdG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gJ2Jhc2gnKTtcblx0XHRhc3NlcnQub2soYmFzaFRvb2wpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbjogVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0YXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdlY2hvIGZpcnN0JywgdGltZW91dDogMSB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYmFzaFRvb2wuaGFuZGxlciEoeyBjb21tYW5kOiAnZWNobyBmaXJzdCcsIHRpbWVvdXQ6IDEgfSwgaW52b2NhdGlvbikgYXMgVG9vbFJlc3VsdE9iamVjdDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzdWx0VHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLnNlbnRUZXh0c1swXS5vcHRpb25zLmJyYWNrZXRlZFBhc3RlTW9kZSwgcGxhdGZvcm0uaXNNYWNpbnRvc2gpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtaW5hbE1hbmFnZXIuc2VudFRleHRzWzFdLm9wdGlvbnMuYnJhY2tldGVkUGFzdGVNb2RlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIG11bHRpbGluZSBjb21tYW5kcyBsaWtlIHRoZSB3b3JrYmVuY2ggdGVybWluYWwgdG9vbCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNdWx0aWxpbmVDb21tYW5kKCdlY2hvIGZpcnN0XFxuZWNobyBzZWNvbmQnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTXVsdGlsaW5lQ29tbWFuZCgnZWNobyBmaXJzdFxcclxcbmVjaG8gc2Vjb25kJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc011bHRpbGluZUNvbW1hbmQoJ2VjaG8gZmlyc3RcXFxcXFxuZWNobyBzZWNvbmQnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZSBzaGVsbCB0b29sIG5vcm1hbGl6ZXMgaW5wdXQgd2l0aG91dCBhcHBlbmRpbmcgZW50ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVybWluYWxNYW5hZ2VyIH0gPSBjcmVhdGVTZXJ2aWNlcygpO1xuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIFVSSS5wYXJzZSgnY29waWxvdDovc2Vzc2lvbi0xJyksIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHNoZWxsUmVmID0gYXdhaXQgc2hlbGxNYW5hZ2VyLmdldE9yQ3JlYXRlU2hlbGwoJ2Jhc2gnLCAndHVybi0xJywgJ3Rvb2wtMScpO1xuXHRcdHRlcm1pbmFsTWFuYWdlci5leGlzdGluZ1Rlcm1pbmFsVXJpcy5hZGQoc2hlbGxSZWYub2JqZWN0LnRlcm1pbmFsVXJpKTtcblx0XHRjb25zdCB0b29scyA9IGF3YWl0IGNyZWF0ZVNoZWxsVG9vbHMoc2hlbGxNYW5hZ2VyLCB0ZXJtaW5hbE1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCB3cml0ZVRvb2wgPSB0b29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSAnd3JpdGVfYmFzaCcpO1xuXHRcdGFzc2VydC5vayh3cml0ZVRvb2wpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbjogVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHR0b29sTmFtZTogJ3dyaXRlX2Jhc2gnLFxuXHRcdFx0YXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdhbnN3ZXJcXG4nIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB3cml0ZVRvb2wuaGFuZGxlciEoeyBjb21tYW5kOiAnYW5zd2VyXFxuJyB9LCBpbnZvY2F0aW9uKSBhcyBUb29sUmVzdWx0T2JqZWN0O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXN1bHRUeXBlLCAnc3VjY2VzcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtaW5hbE1hbmFnZXIuc2VudFRleHRzWzBdLm9wdGlvbnMuYnJhY2tldGVkUGFzdGVNb2RlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtaW5hbE1hbmFnZXIud3JpdGVzWzBdLnVyaSwgc2hlbGxSZWYub2JqZWN0LnRlcm1pbmFsVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLndyaXRlc1swXS5kYXRhLCAnYW5zd2VyXFxyJyk7XG5cdFx0c2hlbGxSZWYuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRPckNyZWF0ZVNhbmRib3hFbmdpbmUgcmV0dXJucyB0aGUgc2FtZSBlbmdpbmUgYWNyb3NzIGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2VzKCk7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKSk7XG5cblx0XHRjb25zdCBlbmdpbmVBID0gc2hlbGxNYW5hZ2VyLmdldE9yQ3JlYXRlU2FuZGJveEVuZ2luZSgpO1xuXHRcdGNvbnN0IGVuZ2luZUIgPSBzaGVsbE1hbmFnZXIuZ2V0T3JDcmVhdGVTYW5kYm94RW5naW5lKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5naW5lQSwgZW5naW5lQiwgJ1NhbmRib3ggZW5naW5lIHNob3VsZCBiZSBjYWNoZWQgYWNyb3NzIGNhbGxzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW1hcnkgc2hlbGwgdG9vbCBzY2hlbWEgb25seSBleHBvc2VzIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiBwYXJhbXMgd2hlbiB0aGUgc2FuZGJveCBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSBjcmVhdGVTZXJ2aWNlcyh7IHNhbmRib3hFbmFibGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGVuYWJsZWRTaGVsbCA9IGRpc3Bvc2FibGVzLmFkZChlbmFibGVkLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLWVuYWJsZWQnKSwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgZW5hYmxlZFRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhlbmFibGVkU2hlbGwsIGVuYWJsZWQudGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZW5hYmxlZFByaW1hcnkgPSBlbmFibGVkVG9vbHNbMF0gYXMgVG9vbDx1bmtub3duPjtcblx0XHRjb25zdCBlbmFibGVkU2NoZW1hID0gZW5hYmxlZFByaW1hcnkucGFyYW1ldGVycyBhcyB7IHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH07XG5cdFx0Y29uc3QgZW5hYmxlZFByb3BlcnR5TmFtZXMgPSBPYmplY3Qua2V5cyhlbmFibGVkU2NoZW1hLnByb3BlcnRpZXMpO1xuXG5cdFx0YXNzZXJ0Lm9rKGVuYWJsZWRQcm9wZXJ0eU5hbWVzLmluY2x1ZGVzKCdyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24nKSwgJ1NhbmRib3gtZW5hYmxlZCBzY2hlbWEgc2hvdWxkIGV4cG9zZSByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24nKTtcblx0XHRhc3NlcnQub2soZW5hYmxlZFByb3BlcnR5TmFtZXMuaW5jbHVkZXMoJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbicpLCAnU2FuZGJveC1lbmFibGVkIHNjaGVtYSBzaG91bGQgZXhwb3NlIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbicpO1xuXG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBjcmVhdGVTZXJ2aWNlcygpO1xuXHRcdGNvbnN0IGRpc2FibGVkU2hlbGwgPSBkaXNwb3NhYmxlcy5hZGQoZGlzYWJsZWQuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tZGlzYWJsZWQnKSwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRUb29scyA9IGF3YWl0IGNyZWF0ZVNoZWxsVG9vbHMoZGlzYWJsZWRTaGVsbCwgZGlzYWJsZWQudGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRQcmltYXJ5ID0gZGlzYWJsZWRUb29sc1swXSBhcyBUb29sPHVua25vd24+O1xuXHRcdGNvbnN0IGRpc2FibGVkU2NoZW1hID0gZGlzYWJsZWRQcmltYXJ5LnBhcmFtZXRlcnMgYXMgeyBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9O1xuXHRcdGNvbnN0IGRpc2FibGVkUHJvcGVydHlOYW1lcyA9IE9iamVjdC5rZXlzKGRpc2FibGVkU2NoZW1hLnByb3BlcnRpZXMpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFkaXNhYmxlZFByb3BlcnR5TmFtZXMuaW5jbHVkZXMoJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbicpLCAnU2FuZGJveC1kaXNhYmxlZCBzY2hlbWEgc2hvdWxkIG5vdCBleHBvc2UgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKCFkaXNhYmxlZFByb3BlcnR5TmFtZXMuaW5jbHVkZXMoJ3JlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbicpLCAnU2FuZGJveC1kaXNhYmxlZCBzY2hlbWEgc2hvdWxkIG5vdCBleHBvc2UgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW1hcnkgc2hlbGwgdG9vbCBzZW5kcyBjb21tYW5kcyB1bndyYXBwZWQgd2hlbiB0aGUgc2FuZGJveCBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXJtaW5hbE1hbmFnZXIgfSA9IGNyZWF0ZVNlcnZpY2VzKCk7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbHMgPSBhd2FpdCBjcmVhdGVTaGVsbFRvb2xzKHNoZWxsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgYmFzaFRvb2wgPSB0b29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSAnYmFzaCcpO1xuXHRcdGFzc2VydC5vayhiYXNoVG9vbCk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uOiBUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRhcmd1bWVudHM6IHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nLCB0aW1lb3V0OiAxIH0sXG5cdFx0fTtcblx0XHRhd2FpdCBiYXNoVG9vbC5oYW5kbGVyISh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJywgdGltZW91dDogMSB9LCBpbnZvY2F0aW9uKTtcblxuXHRcdGNvbnN0IHNlbnRDb21tYW5kID0gdGVybWluYWxNYW5hZ2VyLnNlbnRUZXh0c1swXT8uZGF0YSA/PyAnJztcblx0XHRhc3NlcnQub2soc2VudENvbW1hbmQuaW5jbHVkZXMoJ2VjaG8gaGVsbG8nKSwgYEV4cGVjdGVkIHRoZSByYXcgY29tbWFuZCB0byBiZSBzZW50LiBTZW50OiAke3NlbnRDb21tYW5kfWApO1xuXHRcdGFzc2VydC5vayghc2VudENvbW1hbmQuaW5jbHVkZXMoJ3NhbmRib3gtcnVudGltZScpLCBgU2FuZGJveCB3cmFwcGVyIHNob3VsZCBub3QgYmUgYXBwbGllZCB3aGVuIHNhbmRib3ggaXMgZGlzYWJsZWQuIFNlbnQ6ICR7c2VudENvbW1hbmR9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW1hcnkgc2hlbGwgdG9vbCB3cmFwcyBjb21tYW5kcyB0aHJvdWdoIHRoZSBzYW5kYm94IGVuZ2luZSB3aGVuIHRoZSBzYW5kYm94IGlzIGVuYWJsZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVybWluYWxNYW5hZ2VyIH0gPSBjcmVhdGVTZXJ2aWNlcyh7IHNhbmRib3hFbmFibGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIFVSSS5wYXJzZSgnY29waWxvdDovc2Vzc2lvbi0xJyksIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhzaGVsbE1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGJhc2hUb29sID0gdG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gJ2Jhc2gnKTtcblx0XHRhc3NlcnQub2soYmFzaFRvb2wpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbjogVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0YXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJywgdGltZW91dDogMSB9LFxuXHRcdH07XG5cdFx0YXdhaXQgYmFzaFRvb2wuaGFuZGxlciEoeyBjb21tYW5kOiAnZWNobyBoZWxsbycsIHRpbWVvdXQ6IDEgfSwgaW52b2NhdGlvbik7XG5cblx0XHRjb25zdCBzZW50Q29tbWFuZCA9IHRlcm1pbmFsTWFuYWdlci5zZW50VGV4dHNbMF0/LmRhdGEgPz8gJyc7XG5cdFx0Ly8gUE9TSVggd3JhcHMgdmlhIGBzYW5kYm94LXJ1bnRpbWVgIGFuZCBlbWJlZHMgdGhlIHVzZXIgY29tbWFuZDtcblx0XHQvLyBXaW5kb3dzIHdyYXBzIHZpYSB0aGUgTVhDIGV4ZWN1dGFibGUgYW5kIGNhcnJpZXMgdGhlIHVzZXIgY29tbWFuZFxuXHRcdC8vIGluIHRoZSBKU09OIGNvbmZpZyBmaWxlIHJlZmVyZW5jZWQgYnkgdGhlIHdyYXBwZXIuXG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0Lm9rKHNlbnRDb21tYW5kLmluY2x1ZGVzKCd3eGMtZXhlYycpLCBgRXhwZWN0ZWQgdGhlIGNvbW1hbmQgdG8gYmUgd3JhcHBlZCBieSB0aGUgTVhDIHJ1bnRpbWUuIFNlbnQ6ICR7c2VudENvbW1hbmR9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5vayhzZW50Q29tbWFuZC5pbmNsdWRlcygnc2FuZGJveC1ydW50aW1lJyksIGBFeHBlY3RlZCB0aGUgY29tbWFuZCB0byBiZSB3cmFwcGVkIGJ5IHRoZSBzYW5kYm94IHJ1bnRpbWUuIFNlbnQ6ICR7c2VudENvbW1hbmR9YCk7XG5cdFx0XHRhc3NlcnQub2soc2VudENvbW1hbmQuaW5jbHVkZXMoJ2VjaG8gaGVsbG8nKSwgYFdyYXBwZWQgY29tbWFuZCBzaG91bGQgc3RpbGwgY29udGFpbiB0aGUgdXNlciBjb21tYW5kLiBTZW50OiAke3NlbnRDb21tYW5kfWApO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncHJpbWFyeSBzaGVsbCB0b29sIHdyaXRlcyBhIHNhbmRib3ggY29uZmlnIGV4cG9zaW5nIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBhcyB3cml0YWJsZScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBDcm9zcy1wbGF0Zm9ybSBzbW9rZSB0ZXN0OiBlbmFibGluZyB0aGUgc2FuZGJveCBzaG91bGQgcmVzdWx0IGluIGEgc2FuZGJveCBjb25maWcgZmlsZVxuXHRcdC8vIGJlaW5nIHdyaXR0ZW4sIGFuZCB0aGUgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3J5IHNob3VsZCBiZSBhIHdyaXRhYmxlIHBhdGggaW4gdGhhdFxuXHRcdC8vIGNvbmZpZy4gVGhlIEpTT04gc2hhcGUgZGlmZmVycyBiZXR3ZWVuIFBPU0lYIChgZmlsZXN5c3RlbS5hbGxvd1dyaXRlYCkgYW5kIHRoZSBXaW5kb3dzXG5cdFx0Ly8gTVhDIHJ1bnRpbWUgKGBmaWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzYCkuXG5cdFx0Y29uc3QgY3JlYXRlZEZpbGVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC13b3Jrc3BhY2UnKTtcblx0XHRjb25zdCB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXJtaW5hbE1hbmFnZXIgfSA9IGNyZWF0ZVNlcnZpY2VzKHsgc2FuZGJveEVuYWJsZWQ6IHRydWUsIGNyZWF0ZWRGaWxlcyB9KTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0Y29uc3QgdG9vbHMgPSBhd2FpdCBjcmVhdGVTaGVsbFRvb2xzKHNoZWxsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgYmFzaFRvb2wgPSB0b29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSAnYmFzaCcpO1xuXHRcdGFzc2VydC5vayhiYXNoVG9vbCk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uOiBUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRhcmd1bWVudHM6IHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nLCB0aW1lb3V0OiAxIH0sXG5cdFx0fTtcblx0XHRhd2FpdCBiYXNoVG9vbC5oYW5kbGVyISh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJywgdGltZW91dDogMSB9LCBpbnZvY2F0aW9uKTtcblxuXHRcdGNvbnN0IHNhbmRib3hDb25maWdFbnRyeSA9IFsuLi5jcmVhdGVkRmlsZXMuZW50cmllcygpXS5maW5kKChbcGF0aF0pID0+IC92c2NvZGUtc2FuZGJveC1zZXR0aW5ncy0uKlxcLmpzb24kLy50ZXN0KHBhdGgpKTtcblx0XHRhc3NlcnQub2soc2FuZGJveENvbmZpZ0VudHJ5LCBgRXhwZWN0ZWQgYSBzYW5kYm94IGNvbmZpZyBmaWxlIHRvIGJlIHdyaXR0ZW4uIEZpbGVzOiAke1suLi5jcmVhdGVkRmlsZXMua2V5cygpXS5qb2luKCcsICcpfWApO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2Uoc2FuZGJveENvbmZpZ0VudHJ5WzFdKTtcblx0XHRjb25zdCB3cml0YWJsZVBhdGhzOiBzdHJpbmdbXSA9IHBsYXRmb3JtLmlzV2luZG93cyA/IGNvbmZpZy5maWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzIDogY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZTtcblx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheSh3cml0YWJsZVBhdGhzKSwgYEV4cGVjdGVkIHdyaXRhYmxlIHBhdGhzIGFycmF5LiBHb3Q6ICR7SlNPTi5zdHJpbmdpZnkoY29uZmlnLmZpbGVzeXN0ZW0pfWApO1xuXHRcdGNvbnN0IGV4cGVjdGVkUGF0aCA9IHBsYXRmb3JtLmlzV2luZG93cyA/ICdcXFxcd29ya3NwYWNlXFxcXHRlc3Qtd29ya3NwYWNlJyA6ICcvd29ya3NwYWNlL3Rlc3Qtd29ya3NwYWNlJztcblx0XHRhc3NlcnQub2sod3JpdGFibGVQYXRocy5pbmNsdWRlcyhleHBlY3RlZFBhdGgpLCBgRXhwZWN0ZWQgd29ya2luZyBkaXJlY3RvcnkgaW4gd3JpdGFibGUgcGF0aHMuIEdvdDogJHtKU09OLnN0cmluZ2lmeSh3cml0YWJsZVBhdGhzKX1gKTtcblx0fSk7XG5cblx0dGVzdCgncHJpbWFyeSBzaGVsbCB0b29sIG1lcmdlcyBjb25maWd1cmVkIGZpbGVzeXN0ZW0gYWxsb3dSZWFkIHBhdGhzIGludG8gdGhlIHNhbmRib3ggY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIENyb3NzLXBsYXRmb3JtOiBwaWNrIHRoZSBPUy1zcGVjaWZpYyBmaWxlc3lzdGVtIHNldHRpbmcga2V5IGFuZCB2ZXJpZnkgdGhlIGNvbmZpZ3VyZWRcblx0XHQvLyBhbGxvd1JlYWQgcGF0aCBsYW5kcyBpbiB0aGUgcmVuZGVyZWQgc2FuZGJveCBjb25maWcgKFBPU0lYIGBmaWxlc3lzdGVtLmFsbG93UmVhZGAgL1xuXHRcdC8vIFdpbmRvd3MgTVhDIGBmaWxlc3lzdGVtLnJlYWRvbmx5UGF0aHNgKS5cblx0XHRjb25zdCBjcmVhdGVkRmlsZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRSZWFkUGF0aCA9IHBsYXRmb3JtLmlzV2luZG93cyA/ICdDOlxcXFx0b29sc1xcXFxjdXN0b20nIDogJy90b29scy9jdXN0b20nO1xuXHRcdGNvbnN0IGZpbGVTeXN0ZW1LZXkgPSBwbGF0Zm9ybS5pc1dpbmRvd3Ncblx0XHRcdD8gQWdlbnRIb3N0U2FuZGJveEtleS5XaW5kb3dzRmlsZVN5c3RlbVxuXHRcdFx0OiBwbGF0Zm9ybS5pc01hY2ludG9zaCA/IEFnZW50SG9zdFNhbmRib3hLZXkuTWFjRmlsZVN5c3RlbSA6IEFnZW50SG9zdFNhbmRib3hLZXkuTGludXhGaWxlU3lzdGVtO1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRlcm1pbmFsTWFuYWdlciwgYWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlU2VydmljZXMoeyBzYW5kYm94RW5hYmxlZDogdHJ1ZSwgY3JlYXRlZEZpbGVzIH0pO1xuXHRcdGFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uuc2V0U2FuZGJveFZhbHVlKGZpbGVTeXN0ZW1LZXksIHsgYWxsb3dSZWFkOiBbY29uZmlndXJlZFJlYWRQYXRoXSB9KTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LXdvcmtzcGFjZScpKSk7XG5cdFx0Y29uc3QgdG9vbHMgPSBhd2FpdCBjcmVhdGVTaGVsbFRvb2xzKHNoZWxsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgYmFzaFRvb2wgPSB0b29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSAnYmFzaCcpO1xuXHRcdGFzc2VydC5vayhiYXNoVG9vbCk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uOiBUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRhcmd1bWVudHM6IHsgY29tbWFuZDogJ2VjaG8gaGVsbG8nLCB0aW1lb3V0OiAxIH0sXG5cdFx0fTtcblx0XHRhd2FpdCBiYXNoVG9vbC5oYW5kbGVyISh7IGNvbW1hbmQ6ICdlY2hvIGhlbGxvJywgdGltZW91dDogMSB9LCBpbnZvY2F0aW9uKTtcblxuXHRcdGNvbnN0IHNhbmRib3hDb25maWdFbnRyeSA9IFsuLi5jcmVhdGVkRmlsZXMuZW50cmllcygpXS5maW5kKChbcGF0aF0pID0+IC92c2NvZGUtc2FuZGJveC1zZXR0aW5ncy0uKlxcLmpzb24kLy50ZXN0KHBhdGgpKTtcblx0XHRhc3NlcnQub2soc2FuZGJveENvbmZpZ0VudHJ5LCBgRXhwZWN0ZWQgYSBzYW5kYm94IGNvbmZpZyBmaWxlIHRvIGJlIHdyaXR0ZW4uIEZpbGVzOiAke1suLi5jcmVhdGVkRmlsZXMua2V5cygpXS5qb2luKCcsICcpfWApO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2Uoc2FuZGJveENvbmZpZ0VudHJ5WzFdKTtcblx0XHRjb25zdCByZWFkYWJsZVBhdGhzOiBzdHJpbmdbXSA9IHBsYXRmb3JtLmlzV2luZG93cyA/IGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMgOiBjb25maWcuZmlsZXN5c3RlbS5hbGxvd1JlYWQ7XG5cdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocmVhZGFibGVQYXRocyksIGBFeHBlY3RlZCByZWFkYWJsZSBwYXRocyBhcnJheS4gR290OiAke0pTT04uc3RyaW5naWZ5KGNvbmZpZy5maWxlc3lzdGVtKX1gKTtcblx0XHRhc3NlcnQub2socmVhZGFibGVQYXRocy5pbmNsdWRlcyhjb25maWd1cmVkUmVhZFBhdGgpLCBgRXhwZWN0ZWQgY29uZmlndXJlZCByZWFkIHBhdGggaW4gcmVhZGFibGUgcGF0aHMuIEdvdDogJHtKU09OLnN0cmluZ2lmeShyZWFkYWJsZVBhdGhzKX1gKTtcblx0fSk7XG5cblx0dGVzdCgncHJpbWFyeSBzaGVsbCB0b29sIHJlcXVlc3RzIGNvbmZpcm1hdGlvbiBiZWZvcmUgcmVydW5uaW5nIG91dHNpZGUgdGhlIHNhbmRib3gnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gVGhlIFdpbmRvd3Mgc2FuZGJveCBvbmx5IGV4cG9zZXMgT2ZmL0FsbG93TmV0d29yayBcdTIwMTQgdGhlcmUgaXMgbm8gXCJlbmFibGVkIGJ1dCBuZXR3b3JrLWJsb2NrZWRcIlxuXHRcdC8vIHN0YXRlLCBzbyBgcmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb25gIGlzIHVucmVhY2hhYmxlIG9uIFdpbmRvd3MuXG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0dGhpcy5za2lwKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRlcm1pbmFsTWFuYWdlciwgYWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlU2VydmljZXMoeyBzYW5kYm94RW5hYmxlZDogdHJ1ZSB9KTtcblx0XHQvLyBgcmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb25gIG9ubHkgZmlyZXMgd2hlbiB1bnNhbmRib3hlZCBjb21tYW5kcyBhcmUgYWxsb3dlZCBBTkQgYVxuXHRcdC8vIGJsb2NrZWQgZG9tYWluIGlzIGRldGVjdGVkIFx1MjAxNCBvdGhlcndpc2UgdGhlIGVuZ2luZSBrZWVwcyB0aGUgY29tbWFuZCBzYW5kYm94ZWQuXG5cdFx0YWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5zZXRTYW5kYm94VmFsdWUoQWdlbnRIb3N0U2FuZGJveEtleS5BbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIHRydWUpO1xuXHRcdHRlcm1pbmFsTWFuYWdlci5jb21tYW5kRGV0ZWN0aW9uU3VwcG9ydGVkID0gdHJ1ZTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCBjb25maXJtYXRpb25SZXF1ZXN0czogSVVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvblJlcXVlc3RbXSA9IFtdO1xuXHRcdGNvbnN0IHRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhzaGVsbE1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGFzeW5jIHJlcXVlc3QgPT4ge1xuXHRcdFx0Y29uZmlybWF0aW9uUmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGJhc2hUb29sID0gdG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gJ2Jhc2gnKTtcblx0XHRhc3NlcnQub2soYmFzaFRvb2wpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbjogVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0YXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gYmFzaFRvb2wuaGFuZGxlciEoeyBjb21tYW5kOiAnY3VybCBodHRwczovL2V4YW1wbGUuY29tJyB9LCBpbnZvY2F0aW9uKTtcblx0XHRhd2FpdCB0ZXJtaW5hbE1hbmFnZXIuY29tbWFuZEZpbmlzaGVkTGlzdGVuZXJSZWdpc3RlcmVkLnA7XG5cdFx0dGVybWluYWxNYW5hZ2VyLmZpcmVDb21tYW5kRmluaXNoZWQoe1xuXHRcdFx0Y29tbWFuZElkOiAnY21kLTEnLFxuXHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHRjb21tYW5kOiAnY3VybCBodHRwczovL2V4YW1wbGUuY29tJyxcblx0XHRcdG91dHB1dDogJycsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZSBhcyBUb29sUmVzdWx0T2JqZWN0O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpcm1hdGlvblJlcXVlc3RzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maXJtYXRpb25SZXF1ZXN0c1swXT8uYmxvY2tlZERvbWFpbnMsIFsnZXhhbXBsZS5jb20nXSk7XG5cdFx0YXNzZXJ0Lm9rKHRlcm1pbmFsTWFuYWdlci5zZW50VGV4dHMubGVuZ3RoID49IDEsICdBcHByb3ZlZCBjb21tYW5kIHNob3VsZCBiZSBzZW50IHRvIHRoZSB0ZXJtaW5hbCB1bnNhbmRib3hlZCcpO1xuXHRcdGFzc2VydC5vayh0ZXJtaW5hbE1hbmFnZXIuc2VudFRleHRzLmV2ZXJ5KGVudHJ5ID0+ICFlbnRyeS5kYXRhLmluY2x1ZGVzKCdzYW5kYm94LXJ1bnRpbWUnKSksICdObyB3cmFwcGVkIHNhbmRib3gtcnVudGltZSBjb21tYW5kIHNob3VsZCBiZSBzZW50IGFmdGVyIGFwcHJvdmFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXN1bHRUeXBlLCAnc3VjY2VzcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmltYXJ5IHNoZWxsIHRvb2wgcmV0dXJucyBzYW5kYm94X2Jsb2NrZWQgd2hlbiB1c2VyIGRlY2xpbmVzIHVuc2FuZGJveGVkIHJlcnVuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdC8vIFNlZSBhYm92ZTogdGhlIFdpbmRvd3Mgc2FuZGJveCBuZXZlciByZXBvcnRzIGJsb2NrZWQgZG9tYWlucywgc28gdGhpcyBjb25maXJtYXRpb24gZmxvd1xuXHRcdC8vIGlzIHVucmVhY2hhYmxlIG9uIFdpbmRvd3MuXG5cdFx0aWYgKHBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0dGhpcy5za2lwKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRlcm1pbmFsTWFuYWdlciwgYWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlU2VydmljZXMoeyBzYW5kYm94RW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRhZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFNhbmRib3hWYWx1ZShBZ2VudEhvc3RTYW5kYm94S2V5LkFsbG93VW5zYW5kYm94ZWRDb21tYW5kcywgdHJ1ZSk7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgVVJJLnBhcnNlKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKSk7XG5cdFx0Y29uc3QgdG9vbHMgPSBhd2FpdCBjcmVhdGVTaGVsbFRvb2xzKHNoZWxsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgYXN5bmMgKCkgPT4gZmFsc2UpO1xuXHRcdGNvbnN0IGJhc2hUb29sID0gdG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gJ2Jhc2gnKTtcblx0XHRhc3NlcnQub2soYmFzaFRvb2wpO1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbjogVG9vbEludm9jYXRpb24gPSB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0YXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nIH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBiYXNoVG9vbC5oYW5kbGVyISh7IGNvbW1hbmQ6ICdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nIH0sIGludm9jYXRpb24pIGFzIFRvb2xSZXN1bHRPYmplY3Q7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnJlc3VsdFR5cGUsICdmYWlsdXJlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5lcnJvciwgJ3NhbmRib3hfYmxvY2tlZCcpO1xuXHRcdGFzc2VydC5tYXRjaChyZXN1bHQudGV4dFJlc3VsdEZvckxsbSA/PyAnJywgL2RlY2xpbmVkL2kpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtaW5hbE1hbmFnZXIuc2VudFRleHRzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByaW1hcnkgc2hlbGwgdG9vbCBhc2tzIGZvciBjb25maXJtYXRpb24gd2hlbiByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gaXMgZXhwbGljaXRseSBzZXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBpbnN0YW50aWF0aW9uU2VydmljZSwgdGVybWluYWxNYW5hZ2VyLCBhZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlcyh7IHNhbmRib3hFbmFibGVkOiB0cnVlIH0pO1xuXHRcdGFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uuc2V0U2FuZGJveFZhbHVlKEFnZW50SG9zdFNhbmRib3hLZXkuQWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLCB0cnVlKTtcblx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBVUkkucGFyc2UoJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCBjb25maXJtYXRpb25SZXF1ZXN0czogSVVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvblJlcXVlc3RbXSA9IFtdO1xuXHRcdGNvbnN0IHRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhzaGVsbE1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGFzeW5jIHJlcXVlc3QgPT4ge1xuXHRcdFx0Y29uZmlybWF0aW9uUmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0XHRjb25zdCBiYXNoVG9vbCA9IHRvb2xzLmZpbmQodG9vbCA9PiB0b29sLm5hbWUgPT09ICdiYXNoJyk7XG5cdFx0YXNzZXJ0Lm9rKGJhc2hUb29sKTtcblxuXHRcdGNvbnN0IGludm9jYXRpb246IFRvb2xJbnZvY2F0aW9uID0ge1xuXHRcdFx0c2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdGFyZ3VtZW50czoge1xuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdHJ1ZSxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiAnc2FuZGJveCBibG9ja2VkIHJlcXVpcmVkIHN5c2NhbGwnLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJhc2hUb29sLmhhbmRsZXIhKHtcblx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdHJ1ZSxcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjogJ3NhbmRib3ggYmxvY2tlZCByZXF1aXJlZCBzeXNjYWxsJyxcblx0XHR9LCBpbnZvY2F0aW9uKSBhcyBUb29sUmVzdWx0T2JqZWN0O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpcm1hdGlvblJlcXVlc3RzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpcm1hdGlvblJlcXVlc3RzWzBdPy5yZWFzb24sICdzYW5kYm94IGJsb2NrZWQgcmVxdWlyZWQgc3lzY2FsbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzdWx0VHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9yLCAnc2FuZGJveF9ibG9ja2VkJyk7XG5cdFx0YXNzZXJ0Lm1hdGNoKHJlc3VsdC50ZXh0UmVzdWx0Rm9yTGxtID8/ICcnLCAvZGVjbGluZWQvaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1pbmFsTWFuYWdlci5zZW50VGV4dHMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncHJpbWFyeSBzaGVsbCB0b29sIHJldHVybnMgdW5zYW5kYm94ZWRfZGlzYWJsZWQgd2hlbiBhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMgaXMgb2ZmJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRlcm1pbmFsTWFuYWdlciB9ID0gY3JlYXRlU2VydmljZXMoeyBzYW5kYm94RW5hYmxlZDogdHJ1ZSB9KTtcblx0XHQvLyBgY2hhdC5hZ2VudC5zYW5kYm94LmFsbG93VW5zYW5kYm94ZWRDb21tYW5kc2AgaXMgaW50ZW50aW9uYWxseSBub3Qgc2V0LFxuXHRcdC8vIHNvIHRoZSBlbmdpbmUgd291bGQgc2lsZW50bHkgcmUtc2FuZGJveCB0aGUgY29tbWFuZC4gVGhlIHNoZWxsIHRvb2xcblx0XHQvLyBtdXN0IHN1cmZhY2UgYSBkZWRpY2F0ZWQgZmFpbHVyZSBpbnN0ZWFkLlxuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIFVSSS5wYXJzZSgnY29waWxvdDovc2Vzc2lvbi0xJyksIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IGNvbmZpcm1hdGlvblJlcXVlc3RzOiBJVW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uUmVxdWVzdFtdID0gW107XG5cdFx0Y29uc3QgdG9vbHMgPSBhd2FpdCBjcmVhdGVTaGVsbFRvb2xzKHNoZWxsTWFuYWdlciwgdGVybWluYWxNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgYXN5bmMgcmVxdWVzdCA9PiB7XG5cdFx0XHRjb25maXJtYXRpb25SZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0Y29uc3QgYmFzaFRvb2wgPSB0b29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSAnYmFzaCcpO1xuXHRcdGFzc2VydC5vayhiYXNoVG9vbCk7XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uOiBUb29sSW52b2NhdGlvbiA9IHtcblx0XHRcdHNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRhcmd1bWVudHM6IHtcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHRydWUsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjogJ3NhbmRib3ggYmxvY2tlZCByZXF1aXJlZCBzeXNjYWxsJyxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBiYXNoVG9vbC5oYW5kbGVyISh7XG5cdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHRydWUsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb246ICdzYW5kYm94IGJsb2NrZWQgcmVxdWlyZWQgc3lzY2FsbCcsXG5cdFx0fSwgaW52b2NhdGlvbikgYXMgVG9vbFJlc3VsdE9iamVjdDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVzdWx0VHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9yLCAndW5zYW5kYm94ZWRfZGlzYWJsZWQnKTtcblx0XHRhc3NlcnQubWF0Y2gocmVzdWx0LnRleHRSZXN1bHRGb3JMbG0gPz8gJycsIC9hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlybWF0aW9uUmVxdWVzdHMubGVuZ3RoLCAwLCAnTm8gY29uZmlybWF0aW9uIHNob3VsZCBoYXZlIGJlZW4gcmVxdWVzdGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1pbmFsTWFuYWdlci5zZW50VGV4dHMubGVuZ3RoLCAwLCAnRGlzYWxsb3dlZCBjb21tYW5kIHNob3VsZCBub3QgYmUgc2VudCB0byB0aGUgdGVybWluYWwnKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixZQUFZLGNBQWM7QUFDMUIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBeUM7QUFDbEQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1DQUFtQyx3Q0FBd0M7QUFDcEYsU0FBUywyQkFBMkIsMkJBQTJCO0FBQy9ELFNBQVMsZ0NBQWdDO0FBR3pDLFNBQVMseUJBQWdFO0FBQ3pFLFNBQVMsb0JBQW9CLGlDQUFvRjtBQUNqSCxTQUFTLGtCQUErRCxvQkFBb0IsY0FBYyw2QkFBNkIsOEJBQThCO0FBRXJLLE1BQU0sNkJBQWtFO0FBQUEsRUFBeEU7QUFHQyx3QkFBZTtBQUNmLFNBQVMsVUFBcUksQ0FBQztBQUMvSSxTQUFTLFNBQTBDLENBQUM7QUFDcEQsU0FBUyxZ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
