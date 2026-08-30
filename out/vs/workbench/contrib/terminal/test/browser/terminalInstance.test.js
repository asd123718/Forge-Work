import { deepStrictEqual, ok, strictEqual } from "assert";
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { isWindows, OperatingSystem } from "../../../../../base/common/platform.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ResultKind } from "../../../../../platform/keybinding/common/keybindingResolver.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalCapabilityStore } from "../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { GeneralShellType, PosixShellType, remoteResolverTerminal, TitleEventSource } from "../../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustRequestService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { Workspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { ITerminalConfigurationService, ITerminalInstanceService, ITerminalService } from "../../browser/terminal.js";
import { TerminalConfigurationService } from "../../browser/terminalConfigurationService.js";
import { parseExitResult, TerminalInstance, TerminalLabelComputer } from "../../browser/terminalInstance.js";
import { IEnvironmentVariableService } from "../../common/environmentVariable.js";
import { EnvironmentVariableService } from "../../common/environmentVariableService.js";
import { ITerminalProfileResolverService, ProcessState, DEFAULT_COMMANDS_TO_SKIP_SHELL } from "../../common/terminal.js";
import { TestViewDescriptorService } from "./xterm/xtermTerminal.test.js";
import { fixPath } from "../../../../services/search/test/browser/queryBuilder.test.js";
import { TestTerminalProfileResolverService, workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { TestContextService } from "../../../../test/common/workbenchTestServices.js";
const root1 = "/foo/root1";
const ROOT_1 = fixPath(root1);
const root2 = "/foo/root2";
const ROOT_2 = fixPath(root2);
class MockTerminalProfileResolverService extends TestTerminalProfileResolverService {
  async getDefaultProfile() {
    return {
      profileName: "my-sh",
      path: "/usr/bin/zsh",
      env: {
        TEST: "TEST"
      },
      isDefault: true,
      isUnsafePath: false,
      isFromPath: true,
      icon: {
        id: "terminal-linux"
      },
      color: "terminal.ansiYellow"
    };
  }
}
const terminalShellTypeContextKey = {
  set: () => {
  },
  reset: () => {
  },
  get: () => void 0
};
class TestTerminalChildProcess extends Disposable {
  constructor(shouldPersist) {
    super();
    this.shouldPersist = shouldPersist;
    this.id = 0;
    this.onDidChangeProperty = Event.None;
    this.onProcessData = Event.None;
    this.onProcessExit = Event.None;
    this.onProcessReady = Event.None;
    this.onProcessTitleChanged = Event.None;
    this.onProcessShellTypeChanged = Event.None;
  }
  get capabilities() {
    return [];
  }
  updateProperty(property, value) {
    throw new Error("Method not implemented.");
  }
  async start() {
    return void 0;
  }
  shutdown(immediate) {
  }
  input(data) {
  }
  sendSignal(signal) {
  }
  resize(cols, rows) {
  }
  clearBuffer() {
  }
  acknowledgeDataEvent(charCount) {
  }
  async setUnicodeVersion(version) {
  }
  async getInitialCwd() {
    return "";
  }
  async getCwd() {
    return "";
  }
  async processBinary(data) {
  }
  refreshProperty(property) {
    return Promise.resolve("");
  }
}
class TestTerminalInstanceService extends Disposable {
  constructor() {
    super();
    this.createProcessCount = 0;
    this._processCreatedPromise = new Promise((resolve) => this._resolveProcessCreated = resolve);
  }
  get processCreatedPromise() {
    return this._processCreatedPromise;
  }
  async getBackend() {
    return {
      onPtyHostExit: Event.None,
      onPtyHostUnresponsive: Event.None,
      onPtyHostResponsive: Event.None,
      onPtyHostRestart: Event.None,
      onDidMoveWindowInstance: Event.None,
      onDidRequestDetach: Event.None,
      getShellEnvironment: async () => ({}),
      createProcess: async (shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, options, shouldPersist) => {
        this.createProcessCount++;
        this._resolveProcessCreated();
        return this._register(new TestTerminalChildProcess(shouldPersist));
      },
      getLatency: () => Promise.resolve([])
    };
  }
}
class TestTerminalWorkspaceTrustRequestService extends mock() {
  constructor() {
    super(...arguments);
    this.requestCount = 0;
  }
  async requestWorkspaceTrust() {
    this.requestCount++;
    return false;
  }
}
suite("Workbench - TerminalInstance", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("TerminalInstance", () => {
    let terminalInstance;
    function createTerminalInstantiationService(terminalInstanceService, workspace, requestWorkspaceTrust = async () => true, workspaceTrustRequestService) {
      const instantiationService = workbenchInstantiationService({
        configurationService: () => new TestConfigurationService({
          files: {},
          terminal: {
            integrated: {
              fontFamily: "monospace",
              scrollback: 1e3,
              fastScrollSensitivity: 2,
              mouseWheelScrollSensitivity: 1,
              unicodeVersion: "6",
              commandsToSkipShell: [],
              shellIntegration: {
                enabled: true
              }
            }
          }
        })
      }, store);
      instantiationService.set(ITerminalProfileResolverService, new MockTerminalProfileResolverService());
      if (workspace) {
        instantiationService.stub(IWorkspaceContextService, new TestContextService(workspace));
      }
      instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
      instantiationService.stub(IEnvironmentVariableService, store.add(instantiationService.createInstance(EnvironmentVariableService)));
      instantiationService.stub(ITerminalInstanceService, terminalInstanceService ?? store.add(new TestTerminalInstanceService()));
      instantiationService.stub(ITerminalService, { setNextCommandId: async () => {
      } });
      instantiationService.stub(IWorkspaceTrustRequestService, workspaceTrustRequestService ?? { requestWorkspaceTrust });
      return instantiationService;
    }
    async function createTerminalInstance(terminalInstanceService, workspace, shellLaunchConfig = {}, workspaceTrustRequestService) {
      const instantiationService = createTerminalInstantiationService(terminalInstanceService, workspace, void 0, workspaceTrustRequestService);
      const instance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, shellLaunchConfig));
      await instance.xtermReadyPromise;
      return instance;
    }
    test("should create an instance of TerminalInstance with env from default profile", async () => {
      terminalInstance = await createTerminalInstance();
      await new Promise((resolve) => setTimeout(resolve, 100));
      deepStrictEqual(terminalInstance.shellLaunchConfig.env, { TEST: "TEST" });
    });
    test("marked remote resolver terminal bypasses workspace trust request", async () => {
      const workspaceTrustRequestService = new TestTerminalWorkspaceTrustRequestService();
      const instance = await createTerminalInstance(void 0, void 0, {
        executable: "/usr/bin/zsh",
        cwd: URI.file("/home/test"),
        [remoteResolverTerminal]: true,
        hideFromUser: true,
        isTransient: true
      }, workspaceTrustRequestService);
      await instance["_createProcess"]();
      deepStrictEqual({
        trustRequestCount: workspaceTrustRequestService.requestCount,
        persistedResolverFlag: instance.shellLaunchConfig[remoteResolverTerminal]
      }, {
        trustRequestCount: 0,
        persistedResolverFlag: void 0
      });
      instance.dispose();
    });
    test("unmarked terminal requests workspace trust", async () => {
      const workspaceTrustRequestService = new TestTerminalWorkspaceTrustRequestService();
      const instance = await createTerminalInstance(void 0, void 0, {
        executable: "/usr/bin/zsh",
        cwd: URI.file("/home/test"),
        isTransient: true
      }, workspaceTrustRequestService);
      await instance["_createProcess"]();
      strictEqual(workspaceTrustRequestService.requestCount, 1);
      instance.dispose();
    });
    test("should not create a process when workspace trust is denied", async () => {
      const terminalInstanceService = store.add(new TestTerminalInstanceService());
      let resolveTrust;
      const trustRequest = new Promise((resolve) => resolveTrust = resolve);
      const instantiationService = createTerminalInstantiationService(terminalInstanceService, void 0, () => trustRequest);
      const instance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {}));
      const exitPromise = Event.toPromise(instance.onExit);
      resolveTrust(false);
      await exitPromise;
      strictEqual(terminalInstanceService.createProcessCount, 0);
    });
    test("should not create a process with an unexpected cwd in an empty workspace", async () => {
      const terminalInstanceService = store.add(new TestTerminalInstanceService());
      const instance = await createTerminalInstance(terminalInstanceService, new Workspace("empty"));
      await terminalInstanceService.processCreatedPromise;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const testInstance = instance;
      const createProcess = () => instance["_createProcess"]();
      testInstance._cwd = "/unexpected";
      testInstance._userHome = "/home";
      const exitPromise = Event.toPromise(instance.onExit);
      await createProcess();
      const exitResult = await exitPromise;
      ok(exitResult && typeof exitResult === "object" && typeof exitResult.message === "string");
      strictEqual(terminalInstanceService.createProcessCount, 1);
    });
    test("should preserve title for task terminals", async () => {
      const instantiationService = createTerminalInstantiationService();
      const taskTerminal = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {
        type: "Task",
        name: "Test Task Name"
      }));
      await taskTerminal.rename("Test Task Name");
      strictEqual(taskTerminal.title, "Test Task Name");
      await taskTerminal.rename("some-process-name", TitleEventSource.Process);
      strictEqual(taskTerminal.title, "Test Task Name", "Task terminal should preserve API-set title");
    });
    test("should preserve agent shell type detected from sequence until the parent shell returns", async () => {
      const instance = await createTerminalInstance();
      const onTitleChange = (title) => instance["_onTitleChange"](title);
      const handleShellTypeChange = (shellType) => instance["_handleShellTypeChange"](shellType);
      strictEqual(instance.shellType, void 0);
      onTitleChange("Claude Code");
      strictEqual(instance.shellType, GeneralShellType.Claude);
      handleShellTypeChange(GeneralShellType.Node);
      strictEqual(instance.shellType, GeneralShellType.Claude);
      handleShellTypeChange(void 0);
      strictEqual(instance.shellType, GeneralShellType.Claude);
      handleShellTypeChange(PosixShellType.Zsh);
      strictEqual(instance.shellType, PosixShellType.Zsh);
    });
    test("should detect Command Code agent shell type from its OSC title", async () => {
      const instance = await createTerminalInstance();
      const onTitleChange = (title) => instance["_onTitleChange"](title);
      strictEqual(instance.shellType, void 0);
      onTitleChange("\u2733 Command Code \xB7 my-project");
      strictEqual(instance.shellType, GeneralShellType.CommandCode);
    });
    test("should fire onWillDispose before xterm disposal and onDisposed after xterm disposal", async () => {
      const instance = await createTerminalInstance();
      const xterm = await instance.xtermReadyPromise;
      const disposalOrder = [];
      store.add(instance.onWillDispose(() => disposalOrder.push("onWillDispose")));
      store.add(xterm.onDidDispose(() => disposalOrder.push("xterm")));
      store.add(instance.onDisposed(() => disposalOrder.push("onDisposed")));
      instance.dispose();
      deepStrictEqual(disposalOrder, ["onWillDispose", "xterm", "onDisposed"]);
    });
    test("should dispose contribution-owned xterm addons before xterm disposal", async () => {
      const instance = await createTerminalInstance();
      const xterm = await instance.xtermReadyPromise;
      const disposalOrder = [];
      let addonDisposeCount = 0;
      const addon = {
        activate: () => {
        },
        dispose: () => {
          addonDisposeCount++;
          disposalOrder.push("addon");
        }
      };
      xterm.raw.loadAddon(addon);
      store.add(instance.onWillDispose(() => {
        disposalOrder.push("onWillDispose");
        addon.dispose();
      }));
      store.add(xterm.onDidDispose(() => disposalOrder.push("xterm")));
      store.add(instance.onDisposed(() => disposalOrder.push("onDisposed")));
      instance.dispose();
      deepStrictEqual(
        { disposalOrder, addonDisposeCount },
        { disposalOrder: ["onWillDispose", "addon", "xterm", "onDisposed"], addonDisposeCount: 1 }
      );
    });
    test("custom key event handler should handle commands in DEFAULT_COMMANDS_TO_SKIP_SHELL in VS Code and not xterm when sendKeybindingsToShell is disabled", async () => {
      const instance = await createTerminalInstance();
      const keybindingService = instance["_keybindingService"];
      const originalSoftDispatch = keybindingService.softDispatch;
      keybindingService.softDispatch = () => ({ kind: ResultKind.KbFound, commandId: "workbench.action.zoomIn", commandArgs: void 0, isBubble: false });
      let capturedHandler;
      instance.xterm.raw.attachCustomKeyEventHandler = (handler) => {
        capturedHandler = handler;
      };
      const container = document.createElement("div");
      document.body.appendChild(container);
      instance.attachToElement(container);
      instance.setVisible(true);
      const event = new KeyboardEvent("keydown", { key: "=", cancelable: true });
      try {
        deepStrictEqual(
          { result: capturedHandler?.(event), defaultPrevented: event.defaultPrevented },
          { result: false, defaultPrevented: true }
        );
      } finally {
        keybindingService.softDispatch = originalSoftDispatch;
        container.remove();
      }
    });
    test("custom key event handler should intercept Meta-modified keys that resolve to a command when sendKeybindingsToShell is disabled", async () => {
      const instance = await createTerminalInstance();
      const keybindingService = instance["_keybindingService"];
      const originalSoftDispatch = keybindingService.softDispatch;
      strictEqual(DEFAULT_COMMANDS_TO_SKIP_SHELL.includes("test.metaKeyInterceptCommand"), false);
      keybindingService.softDispatch = () => ({ kind: ResultKind.KbFound, commandId: "test.metaKeyInterceptCommand", commandArgs: void 0, isBubble: false });
      let capturedHandler;
      instance.xterm.raw.attachCustomKeyEventHandler = (handler) => {
        capturedHandler = handler;
      };
      const container = document.createElement("div");
      document.body.appendChild(container);
      instance.attachToElement(container);
      instance.setVisible(true);
      const event = new KeyboardEvent("keydown", { key: "=", metaKey: true, cancelable: true });
      try {
        deepStrictEqual(
          { result: capturedHandler?.(event), defaultPrevented: event.defaultPrevented },
          { result: false, defaultPrevented: true }
        );
      } finally {
        keybindingService.softDispatch = originalSoftDispatch;
        container.remove();
      }
    });
  });
  suite("DEFAULT_COMMANDS_TO_SKIP_SHELL", () => {
    test("should include zoom commands so they are not consumed by kitty keyboard protocol", () => {
      deepStrictEqual(
        ["workbench.action.zoomIn", "workbench.action.zoomOut", "workbench.action.zoomReset"].every(
          (cmd) => DEFAULT_COMMANDS_TO_SKIP_SHELL.includes(cmd)
        ),
        true
      );
    });
  });
  suite("parseExitResult", () => {
    test("should return no message for exit code = undefined", () => {
      deepStrictEqual(
        parseExitResult(void 0, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: void 0, message: void 0 }
      );
      deepStrictEqual(
        parseExitResult(void 0, {}, ProcessState.KilledByUser, void 0),
        { code: void 0, message: void 0 }
      );
      deepStrictEqual(
        parseExitResult(void 0, {}, ProcessState.KilledByProcess, void 0),
        { code: void 0, message: void 0 }
      );
    });
    test("should return no message for exit code = 0", () => {
      deepStrictEqual(
        parseExitResult(0, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 0, message: void 0 }
      );
      deepStrictEqual(
        parseExitResult(0, {}, ProcessState.KilledByUser, void 0),
        { code: 0, message: void 0 }
      );
      deepStrictEqual(
        parseExitResult(0, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 0, message: void 0 }
      );
    });
    test("should return friendly message when executable is specified for non-zero exit codes", () => {
      deepStrictEqual(
        parseExitResult(1, { executable: "foo" }, ProcessState.KilledDuringLaunch, void 0),
        { code: 1, message: 'The terminal process "foo" failed to launch (exit code: 1).' }
      );
      deepStrictEqual(
        parseExitResult(1, { executable: "foo" }, ProcessState.KilledByUser, void 0),
        { code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' }
      );
      deepStrictEqual(
        parseExitResult(1, { executable: "foo" }, ProcessState.KilledByProcess, void 0),
        { code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' }
      );
    });
    test("should return friendly message when executable and args are specified for non-zero exit codes", () => {
      deepStrictEqual(
        parseExitResult(1, { executable: "foo", args: ["bar", "baz"] }, ProcessState.KilledDuringLaunch, void 0),
        { code: 1, message: `The terminal process "foo 'bar', 'baz'" failed to launch (exit code: 1).` }
      );
      deepStrictEqual(
        parseExitResult(1, { executable: "foo", args: ["bar", "baz"] }, ProcessState.KilledByUser, void 0),
        { code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` }
      );
      deepStrictEqual(
        parseExitResult(1, { executable: "foo", args: ["bar", "baz"] }, ProcessState.KilledByProcess, void 0),
        { code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` }
      );
    });
    test("should return friendly message when executable and arguments are omitted for non-zero exit codes", () => {
      deepStrictEqual(
        parseExitResult(1, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 1, message: `The terminal process failed to launch (exit code: 1).` }
      );
      deepStrictEqual(
        parseExitResult(1, {}, ProcessState.KilledByUser, void 0),
        { code: 1, message: `The terminal process terminated with exit code: 1.` }
      );
      deepStrictEqual(
        parseExitResult(1, {}, ProcessState.KilledByProcess, void 0),
        { code: 1, message: `The terminal process terminated with exit code: 1.` }
      );
    });
    test("should ignore pty host-related errors", () => {
      deepStrictEqual(
        parseExitResult({ message: "Could not find pty with id 16" }, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: void 0, message: void 0 }
      );
    });
    test("should format conpty failure code 5", () => {
      deepStrictEqual(
        parseExitResult({ code: 5, message: "A native exception occurred during launch (Cannot create process, error code: 5)" }, { executable: "foo" }, ProcessState.KilledDuringLaunch, void 0),
        { code: 5, message: `The terminal process failed to launch: Access was denied to the path containing your executable "foo". Manage and change your permissions to get this to work.` }
      );
    });
    test("should format conpty failure code 267", () => {
      deepStrictEqual(
        parseExitResult({ code: 267, message: "A native exception occurred during launch (Cannot create process, error code: 267)" }, {}, ProcessState.KilledDuringLaunch, "/foo"),
        { code: 267, message: `The terminal process failed to launch: Invalid starting directory "/foo", review your terminal.integrated.cwd setting.` }
      );
    });
    test("should format conpty failure code 1260", () => {
      deepStrictEqual(
        parseExitResult({ code: 1260, message: "A native exception occurred during launch (Cannot create process, error code: 1260)" }, { executable: "foo" }, ProcessState.KilledDuringLaunch, void 0),
        { code: 1260, message: `The terminal process failed to launch: Windows cannot open this program because it has been prevented by a software restriction policy. For more information, open Event Viewer or contact your system Administrator.` }
      );
    });
    test("should format conpty launch failure", () => {
      deepStrictEqual(
        parseExitResult({ message: "A native exception occurred during launch (Cannot launch conpty). Winpty has been removed, see https://code.visualstudio.com/updates/v1_109#_removal-of-winpty-support for more details. You can also try enabling the `terminal.integrated.windowsUseConptyDll` setting." }, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: void 0, message: `The terminal process failed to launch: A native exception occurred during launch (Cannot launch conpty). Winpty has been removed, see https://code.visualstudio.com/updates/v1_109#_removal-of-winpty-support for more details. You can also try enabling the \`terminal.integrated.windowsUseConptyDll\` setting..` }
      );
    });
    test("should format generic failures", () => {
      deepStrictEqual(
        parseExitResult({ code: 123, message: "A native exception occurred during launch (Cannot create process, error code: 123)" }, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 123, message: `The terminal process failed to launch: A native exception occurred during launch (Cannot create process, error code: 123).` }
      );
      deepStrictEqual(
        parseExitResult({ code: 123, message: "foo" }, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 123, message: `The terminal process failed to launch: foo.` }
      );
    });
  });
  suite("TerminalLabelComputer", () => {
    let instantiationService;
    let capabilities;
    function createInstance(partial) {
      const capabilities2 = store.add(new TerminalCapabilityStore());
      if (!isWindows) {
        capabilities2.add(TerminalCapability.NaiveCwdDetection, null);
      }
      return {
        shellLaunchConfig: {},
        shellType: GeneralShellType.PowerShell,
        cwd: "cwd",
        initialCwd: void 0,
        processName: "",
        sequence: void 0,
        workspaceFolder: void 0,
        staticTitle: void 0,
        capabilities: capabilities2,
        title: "",
        description: "",
        userHome: "/home/user",
        os: OperatingSystem.Linux,
        ...partial
      };
    }
    setup(async () => {
      instantiationService = workbenchInstantiationService(void 0, store);
      capabilities = store.add(new TerminalCapabilityStore());
      if (!isWindows) {
        capabilities.add(TerminalCapability.NaiveCwdDetection, null);
      }
    });
    function createLabelComputer(configuration) {
      instantiationService.set(IConfigurationService, new TestConfigurationService(configuration));
      instantiationService.set(ITerminalConfigurationService, store.add(instantiationService.createInstance(TerminalConfigurationService)));
      return store.add(instantiationService.createInstance(TerminalLabelComputer));
    }
    test('should resolve to "" when the template variables are empty', () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "", description: "" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "" }));
      strictEqual(terminalLabelComputer.title, "");
      strictEqual(terminalLabelComputer.description, "");
    });
    test("should resolve cwd when outside of userHome", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${cwd}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: ROOT_1 }));
      strictEqual(terminalLabelComputer.title, ROOT_1);
      strictEqual(terminalLabelComputer.description, ROOT_1);
    });
    test("should resolve cwd when under userHome", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${cwd}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: "/home/user/foo/bar" }));
      strictEqual(terminalLabelComputer.title, "~/foo/bar");
      strictEqual(terminalLabelComputer.description, "~/foo/bar");
    });
    test("should resolve cwd when exactly at userHome", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${cwd}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: "/home/user" }));
      strictEqual(terminalLabelComputer.title, "~");
      strictEqual(terminalLabelComputer.description, "~");
    });
    test("should not shorten cwd on Windows", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${cwd}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: "C:\\Users\\user", userHome: "C:\\Users\\user", os: OperatingSystem.Windows }));
      strictEqual(terminalLabelComputer.title, "C:\\Users\\user");
      strictEqual(terminalLabelComputer.description, "C:\\Users\\user");
    });
    test("should resolve workspaceFolder", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${workspaceFolder}", description: "${workspaceFolder}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: "folder" }) } }));
      strictEqual(terminalLabelComputer.title, "folder");
      strictEqual(terminalLabelComputer.description, "folder");
    });
    test("should resolve local", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${local}", description: "${local}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", shellLaunchConfig: { type: "Local" } }));
      strictEqual(terminalLabelComputer.title, "Local");
      strictEqual(terminalLabelComputer.description, "Local");
    });
    test("should resolve process", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${process}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh" }));
      strictEqual(terminalLabelComputer.title, "zsh");
      strictEqual(terminalLabelComputer.description, "zsh");
    });
    test("should resolve sequence", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${sequence}", description: "${sequence}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, sequence: "sequence" }));
      strictEqual(terminalLabelComputer.title, "sequence");
      strictEqual(terminalLabelComputer.description, "sequence");
    });
    test("should resolve empty sequence to process name", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${sequence}${separator}${process}", description: "${sequence}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", sequence: "" }));
      strictEqual(terminalLabelComputer.title, "zsh");
      strictEqual(terminalLabelComputer.description, "");
    });
    test("should resolve task", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}${separator}${task}", description: "${task}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", shellLaunchConfig: { type: "Task" } }));
      strictEqual(terminalLabelComputer.title, "zsh ~ Task");
      strictEqual(terminalLabelComputer.description, "Task");
    });
    test("should resolve separator", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${separator}", description: "${separator}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", shellLaunchConfig: { type: "Task" } }));
      strictEqual(terminalLabelComputer.title, "zsh");
      strictEqual(terminalLabelComputer.description, "");
    });
    test("should always return static title when specified", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}", description: "${workspaceFolder}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: "folder" }) }, staticTitle: "my-title" }));
      strictEqual(terminalLabelComputer.title, "my-title");
      strictEqual(terminalLabelComputer.description, "folder");
    });
    test("should use shellLaunchConfig.titleTemplate as template when set", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, sequence: "my-sequence", processName: "zsh", shellLaunchConfig: { titleTemplate: "${sequence}" } }));
      strictEqual(terminalLabelComputer.title, "my-sequence");
      strictEqual(terminalLabelComputer.description, "cwd");
    });
    test("should use ${sequence} for agent CLI shell types", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: true } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.Copilot, sequence: "Copilot Agent", processName: "copilot" }));
      strictEqual(terminalLabelComputer.title, "Copilot Agent");
    });
    test("should use ${sequence} for Gemini agent CLI shell type", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: true } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.Gemini, sequence: "Gemini - my-project", processName: "node" }));
      strictEqual(terminalLabelComputer.title, "Gemini - my-project");
    });
    test("should use ${sequence} for Command Code agent CLI shell type", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: true } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.CommandCode, sequence: "Fix Parser Bug", processName: "node" }));
      strictEqual(terminalLabelComputer.title, "Fix Parser Bug");
    });
    test("should prefer shellLaunchConfig.titleTemplate over agent CLI shell type override", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: true } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.Copilot, sequence: "Copilot Agent", processName: "copilot", shellLaunchConfig: { titleTemplate: "${process}" } }));
      strictEqual(terminalLabelComputer.title, "copilot");
    });
    test("should fall back to configured title when allowAgentCliTitle is disabled", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: false } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.Copilot, sequence: "Copilot Agent", processName: "copilot" }));
      strictEqual(terminalLabelComputer.title, "copilot");
    });
    test("should provide cwdFolder for all cwds only when in multi-root", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}${separator}${cwdFolder}", description: "${cwdFolder}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_1 }));
      strictEqual(terminalLabelComputer.title, "process");
      strictEqual(terminalLabelComputer.description, "");
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_2 }));
      if (isWindows) {
        strictEqual(terminalLabelComputer.title, "process");
        strictEqual(terminalLabelComputer.description, "");
      } else {
        strictEqual(terminalLabelComputer.title, "process ~ root2");
        strictEqual(terminalLabelComputer.description, "root2");
      }
    });
    test("should hide cwdFolder in single folder workspaces when cwd matches the workspace's default cwd even when slashes differ", async () => {
      let terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}${separator}${cwdFolder}", description: "${cwdFolder}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_1 }));
      strictEqual(terminalLabelComputer.title, "process");
      strictEqual(terminalLabelComputer.description, "");
      if (!isWindows) {
        terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}${separator}${cwdFolder}", description: "${cwdFolder}" } } } });
        terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_2 }));
        strictEqual(terminalLabelComputer.title, "process ~ root2");
        strictEqual(terminalLabelComputer.description, "root2");
      }
    });
  });
  suite("getCwdResource", () => {
    let mockFileService;
    let mockPathService;
    function createMockTerminalInstance(options) {
      const capabilities = store.add(new TerminalCapabilityStore());
      if (options.cwd) {
        const mockCwdDetection = {
          getCwd: () => options.cwd
        };
        capabilities.add(TerminalCapability.CwdDetection, mockCwdDetection);
      }
      mockFileService = {
        canHandleResource: async (_resource) => options.fileServiceCanHandle !== false,
        exists: async (resource) => options.fileExists !== false
      };
      mockPathService = {
        fileURI: async (path) => {
          if (options.remoteAuthority) {
            return URI.parse(`vscode-remote://${options.remoteAuthority}${path}`);
          }
          return URI.file(path);
        }
      };
      return {
        capabilities,
        remoteAuthority: options.remoteAuthority,
        async getCwdResource() {
          const cwd = this.capabilities.get(TerminalCapability.CwdDetection)?.getCwd();
          if (!cwd) {
            return void 0;
          }
          let resource;
          if (this.remoteAuthority) {
            resource = await mockPathService.fileURI(cwd);
          } else {
            resource = URI.file(cwd);
          }
          if (!await mockFileService.canHandleResource(resource)) {
            return void 0;
          }
          if (await mockFileService.exists(resource)) {
            return resource;
          }
          return void 0;
        }
      };
    }
    test("should return undefined when no CwdDetection capability", async () => {
      const instance = createMockTerminalInstance({});
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
    test("should return undefined when CwdDetection capability returns no cwd", async () => {
      const instance = createMockTerminalInstance({ cwd: void 0 });
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
    test("should return URI.file for local terminal when file exists", async () => {
      const testCwd = "/test/path";
      const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: true });
      const result = await instance.getCwdResource();
      strictEqual(result?.scheme, "file");
      strictEqual(result?.path, testCwd);
    });
    test("should return undefined when file does not exist", async () => {
      const testCwd = "/test/nonexistent";
      const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: false });
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
    test("should use pathService.fileURI for remote terminal", async () => {
      const testCwd = "/test/remote/path";
      const instance = createMockTerminalInstance({
        cwd: testCwd,
        remoteAuthority: "test-remote",
        fileExists: true
      });
      const result = await instance.getCwdResource();
      strictEqual(result?.scheme, "vscode-remote");
      strictEqual(result?.authority, "test-remote");
      strictEqual(result?.path, testCwd);
    });
    test("should handle Windows paths correctly", async () => {
      const testCwd = isWindows ? "C:\\test\\path" : "/test/path";
      const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: true });
      const result = await instance.getCwdResource();
      strictEqual(result?.scheme, "file");
      if (isWindows) {
        strictEqual(result?.path, "/C:/test/path");
      } else {
        strictEqual(result?.path, testCwd);
      }
    });
    test("should handle empty cwd string", async () => {
      const instance = createMockTerminalInstance({ cwd: "" });
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
    test("should return undefined when fileService cannot handle the resource (VS Code web ENOPRO scenario)", async () => {
      const testCwd = "/workspace/my-project";
      const instance = createMockTerminalInstance({
        cwd: testCwd,
        fileExists: true,
        fileServiceCanHandle: false
        // file:// provider absent
      });
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx0ZXJtaW5hbEluc3RhbmNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzLCBPcGVyYXRpbmdTeXN0ZW0sIHR5cGUgSVByb2Nlc3NFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBSZXN1bHRLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSwgdHlwZSBJQ3dkRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy90ZXJtaW5hbENhcGFiaWxpdHlTdG9yZS5qcyc7XG5pbXBvcnQgeyBHZW5lcmFsU2hlbGxUeXBlLCBJVGVybWluYWxDaGlsZFByb2Nlc3MsIElUZXJtaW5hbFByb2ZpbGUsIFBvc2l4U2hlbGxUeXBlLCByZW1vdGVSZXNvbHZlclRlcm1pbmFsLCBUaXRsZUV2ZW50U291cmNlLCB0eXBlIElTaGVsbExhdW5jaENvbmZpZywgdHlwZSBJVGVybWluYWxCYWNrZW5kLCB0eXBlIElUZXJtaW5hbFByb2Nlc3NPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvdGVzdC9jb21tb24vdGVzdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBhcnNlRXhpdFJlc3VsdCwgVGVybWluYWxJbnN0YW5jZSwgVGVybWluYWxMYWJlbENvbXB1dGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbEluc3RhbmNlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IEVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIFByb2Nlc3NTdGF0ZSwgREVGQVVMVF9DT01NQU5EU19UT19TS0lQX1NIRUxMIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlc3RWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuL3h0ZXJtL3h0ZXJtVGVybWluYWwudGVzdC5qcyc7XG5pbXBvcnQgeyBmaXhQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL3Rlc3QvYnJvd3Nlci9xdWVyeUJ1aWxkZXIudGVzdC5qcyc7XG5pbXBvcnQgeyBUZXN0VGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcblxuY29uc3Qgcm9vdDEgPSAnL2Zvby9yb290MSc7XG5jb25zdCBST09UXzEgPSBmaXhQYXRoKHJvb3QxKTtcbmNvbnN0IHJvb3QyID0gJy9mb28vcm9vdDInO1xuY29uc3QgUk9PVF8yID0gZml4UGF0aChyb290Mik7XG5cbmNsYXNzIE1vY2tUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgZXh0ZW5kcyBUZXN0VGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIHtcblx0b3ZlcnJpZGUgYXN5bmMgZ2V0RGVmYXVsdFByb2ZpbGUoKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb2ZpbGVOYW1lOiAnbXktc2gnLFxuXHRcdFx0cGF0aDogJy91c3IvYmluL3pzaCcsXG5cdFx0XHRlbnY6IHtcblx0XHRcdFx0VEVTVDogJ1RFU1QnLFxuXHRcdFx0fSxcblx0XHRcdGlzRGVmYXVsdDogdHJ1ZSxcblx0XHRcdGlzVW5zYWZlUGF0aDogZmFsc2UsXG5cdFx0XHRpc0Zyb21QYXRoOiB0cnVlLFxuXHRcdFx0aWNvbjoge1xuXHRcdFx0XHRpZDogJ3Rlcm1pbmFsLWxpbnV4Jyxcblx0XHRcdH0sXG5cdFx0XHRjb2xvcjogJ3Rlcm1pbmFsLmFuc2lZZWxsb3cnLFxuXHRcdH07XG5cdH1cbn1cblxuY29uc3QgdGVybWluYWxTaGVsbFR5cGVDb250ZXh0S2V5ID0ge1xuXHRzZXQ6ICgpID0+IHsgfSxcblx0cmVzZXQ6ICgpID0+IHsgfSxcblx0Z2V0OiAoKSA9PiB1bmRlZmluZWRcbn07XG5cbmNsYXNzIFRlc3RUZXJtaW5hbENoaWxkUHJvY2VzcyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxDaGlsZFByb2Nlc3Mge1xuXHRpZDogbnVtYmVyID0gMDtcblx0Z2V0IGNhcGFiaWxpdGllcygpIHsgcmV0dXJuIFtdOyB9XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNob3VsZFBlcnNpc3Q6IGJvb2xlYW5cblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXHR1cGRhdGVQcm9wZXJ0eShwcm9wZXJ0eTogYW55LCB2YWx1ZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0cmVhZG9ubHkgb25Qcm9jZXNzT3ZlcnJpZGVEaW1lbnNpb25zPzogRXZlbnQ8YW55PiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25Qcm9jZXNzUmVzb2x2ZWRTaGVsbExhdW5jaENvbmZpZz86IEV2ZW50PGFueT4gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGFzQ2hpbGRQcm9jZXNzZXM/OiBFdmVudDxhbnk+IHwgdW5kZWZpbmVkO1xuXG5cdG9uRGlkQ2hhbmdlUHJvcGVydHkgPSBFdmVudC5Ob25lO1xuXHRvblByb2Nlc3NEYXRhID0gRXZlbnQuTm9uZTtcblx0b25Qcm9jZXNzRXhpdCA9IEV2ZW50Lk5vbmU7XG5cdG9uUHJvY2Vzc1JlYWR5ID0gRXZlbnQuTm9uZTtcblx0b25Qcm9jZXNzVGl0bGVDaGFuZ2VkID0gRXZlbnQuTm9uZTtcblx0b25Qcm9jZXNzU2hlbGxUeXBlQ2hhbmdlZCA9IEV2ZW50Lk5vbmU7XG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0c2h1dGRvd24oaW1tZWRpYXRlOiBib29sZWFuKTogdm9pZCB7IH1cblx0aW5wdXQoZGF0YTogc3RyaW5nKTogdm9pZCB7IH1cblx0c2VuZFNpZ25hbChzaWduYWw6IHN0cmluZyk6IHZvaWQgeyB9XG5cdHJlc2l6ZShjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlcik6IHZvaWQgeyB9XG5cdGNsZWFyQnVmZmVyKCk6IHZvaWQgeyB9XG5cdGFja25vd2xlZGdlRGF0YUV2ZW50KGNoYXJDb3VudDogbnVtYmVyKTogdm9pZCB7IH1cblx0YXN5bmMgc2V0VW5pY29kZVZlcnNpb24odmVyc2lvbjogJzYnIHwgJzExJyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdldEluaXRpYWxDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuICcnOyB9XG5cdGFzeW5jIGdldEN3ZCgpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJyc7IH1cblx0YXN5bmMgcHJvY2Vzc0JpbmFyeShkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRyZWZyZXNoUHJvcGVydHkocHJvcGVydHk6IGFueSk6IFByb21pc2U8YW55PiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoJycpOyB9XG59XG5cbmNsYXNzIFRlc3RUZXJtaW5hbEluc3RhbmNlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBQYXJ0aWFsPElUZXJtaW5hbEluc3RhbmNlU2VydmljZT4ge1xuXHRjcmVhdGVQcm9jZXNzQ291bnQgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9jZXNzQ3JlYXRlZFByb21pc2U6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgX3Jlc29sdmVQcm9jZXNzQ3JlYXRlZCE6ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm9jZXNzQ3JlYXRlZFByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHRoaXMuX3Jlc29sdmVQcm9jZXNzQ3JlYXRlZCA9IHJlc29sdmUpO1xuXHR9XG5cblx0Z2V0IHByb2Nlc3NDcmVhdGVkUHJvbWlzZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvY2Vzc0NyZWF0ZWRQcm9taXNlO1xuXHR9XG5cblx0YXN5bmMgZ2V0QmFja2VuZCgpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25QdHlIb3N0RXhpdDogRXZlbnQuTm9uZSxcblx0XHRcdG9uUHR5SG9zdFVucmVzcG9uc2l2ZTogRXZlbnQuTm9uZSxcblx0XHRcdG9uUHR5SG9zdFJlc3BvbnNpdmU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvblB0eUhvc3RSZXN0YXJ0OiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRNb3ZlV2luZG93SW5zdGFuY2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZFJlcXVlc3REZXRhY2g6IEV2ZW50Lk5vbmUsXG5cdFx0XHRnZXRTaGVsbEVudmlyb25tZW50OiBhc3luYyAoKSA9PiAoe30pLFxuXHRcdFx0Y3JlYXRlUHJvY2VzczogYXN5bmMgKFxuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdFx0XHRjd2Q6IHN0cmluZyxcblx0XHRcdFx0Y29sczogbnVtYmVyLFxuXHRcdFx0XHRyb3dzOiBudW1iZXIsXG5cdFx0XHRcdHVuaWNvZGVWZXJzaW9uOiAnNicgfCAnMTEnLFxuXHRcdFx0XHRlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsXG5cdFx0XHRcdG9wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLFxuXHRcdFx0XHRzaG91bGRQZXJzaXN0OiBib29sZWFuXG5cdFx0XHQpID0+IHtcblx0XHRcdFx0dGhpcy5jcmVhdGVQcm9jZXNzQ291bnQrKztcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZVByb2Nlc3NDcmVhdGVkKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZWdpc3RlcihuZXcgVGVzdFRlcm1pbmFsQ2hpbGRQcm9jZXNzKHNob3VsZFBlcnNpc3QpKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRMYXRlbmN5OiAoKSA9PiBQcm9taXNlLnJlc29sdmUoW10pXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEJhY2tlbmQ7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFRlcm1pbmFsV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U+KCkge1xuXHRyZXF1ZXN0Q291bnQgPSAwO1xuXG5cdG92ZXJyaWRlIGFzeW5jIHJlcXVlc3RXb3Jrc3BhY2VUcnVzdCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLnJlcXVlc3RDb3VudCsrO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5zdWl0ZSgnV29ya2JlbmNoIC0gVGVybWluYWxJbnN0YW5jZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnVGVybWluYWxJbnN0YW5jZScsICgpID0+IHtcblx0XHRsZXQgdGVybWluYWxJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2U7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVUZXJtaW5hbEluc3RhbnRpYXRpb25TZXJ2aWNlKFxuXHRcdFx0dGVybWluYWxJbnN0YW5jZVNlcnZpY2U/OiBUZXN0VGVybWluYWxJbnN0YW5jZVNlcnZpY2UsXG5cdFx0XHR3b3Jrc3BhY2U/OiBXb3Jrc3BhY2UsXG5cdFx0XHRyZXF1ZXN0V29ya3NwYWNlVHJ1c3Q6ICgpID0+IFByb21pc2U8Ym9vbGVhbj4gPSBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdFx0d29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZT86IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlXG5cdFx0KSB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRcdGZpbGVzOiB7fSxcblx0XHRcdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRcdFx0XHRmb250RmFtaWx5OiAnbW9ub3NwYWNlJyxcblx0XHRcdFx0XHRcdFx0c2Nyb2xsYmFjazogMTAwMCxcblx0XHRcdFx0XHRcdFx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5OiAyLFxuXHRcdFx0XHRcdFx0XHRtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk6IDEsXG5cdFx0XHRcdFx0XHRcdHVuaWNvZGVWZXJzaW9uOiAnNicsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmRzVG9Ta2lwU2hlbGw6IFtdLFxuXHRcdFx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSlcblx0XHRcdH0sIHN0b3JlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBuZXcgTW9ja1Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSgpKTtcblx0XHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2Uod29ya3NwYWNlKSk7XG5cdFx0XHR9XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIG5ldyBUZXN0Vmlld0Rlc2NyaXB0b3JTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UsIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSkpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLCB0ZXJtaW5hbEluc3RhbmNlU2VydmljZSA/PyBzdG9yZS5hZGQobmV3IFRlc3RUZXJtaW5hbEluc3RhbmNlU2VydmljZSgpKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFNlcnZpY2UsIHsgc2V0TmV4dENvbW1hbmRJZDogYXN5bmMgKCkgPT4geyB9IH0gYXMgUGFydGlhbDxJVGVybWluYWxTZXJ2aWNlPik7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlID8/IHsgcmVxdWVzdFdvcmtzcGFjZVRydXN0IH0gYXMgUGFydGlhbDxJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZT4pO1xuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVRlcm1pbmFsSW5zdGFuY2UoXG5cdFx0XHR0ZXJtaW5hbEluc3RhbmNlU2VydmljZT86IFRlc3RUZXJtaW5hbEluc3RhbmNlU2VydmljZSxcblx0XHRcdHdvcmtzcGFjZT86IFdvcmtzcGFjZSxcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcgPSB7fSxcblx0XHRcdHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U/OiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZVxuXHRcdCk6IFByb21pc2U8VGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXJtaW5hbEluc3RhbnRpYXRpb25TZXJ2aWNlKHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIHVuZGVmaW5lZCwgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSk7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbEluc3RhbmNlLCB0ZXJtaW5hbFNoZWxsVHlwZUNvbnRleHRLZXksIHNoZWxsTGF1bmNoQ29uZmlnKSk7XG5cdFx0XHRhd2FpdCBpbnN0YW5jZS54dGVybVJlYWR5UHJvbWlzZTtcblx0XHRcdHJldHVybiBpbnN0YW5jZTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgY3JlYXRlIGFuIGluc3RhbmNlIG9mIFRlcm1pbmFsSW5zdGFuY2Ugd2l0aCBlbnYgZnJvbSBkZWZhdWx0IHByb2ZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXJtaW5hbEluc3RhbmNlID0gYXdhaXQgY3JlYXRlVGVybWluYWxJbnN0YW5jZSgpO1xuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHRlcm1pbmFsIGluc3RhbmNlIHRvIHJlc29sdmUgc2hlbGwgbGF1bmNoIGNvbmZpZyBlbnYuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwKSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwodGVybWluYWxJbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5lbnYsIHsgVEVTVDogJ1RFU1QnIH0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ21hcmtlZCByZW1vdGUgcmVzb2x2ZXIgdGVybWluYWwgYnlwYXNzZXMgd29ya3NwYWNlIHRydXN0IHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlID0gbmV3IFRlc3RUZXJtaW5hbFdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgY3JlYXRlVGVybWluYWxJbnN0YW5jZSh1bmRlZmluZWQsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRleGVjdXRhYmxlOiAnL3Vzci9iaW4venNoJyxcblx0XHRcdFx0Y3dkOiBVUkkuZmlsZSgnL2hvbWUvdGVzdCcpLFxuXHRcdFx0XHRbcmVtb3RlUmVzb2x2ZXJUZXJtaW5hbF06IHRydWUsXG5cdFx0XHRcdGhpZGVGcm9tVXNlcjogdHJ1ZSxcblx0XHRcdFx0aXNUcmFuc2llbnQ6IHRydWVcblx0XHRcdH0sIHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UpO1xuXG5cdFx0XHRhd2FpdCAoaW5zdGFuY2UgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCAoKSA9PiBQcm9taXNlPHZvaWQ+PilbJ19jcmVhdGVQcm9jZXNzJ10oKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dHJ1c3RSZXF1ZXN0Q291bnQ6IHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UucmVxdWVzdENvdW50LFxuXHRcdFx0XHRwZXJzaXN0ZWRSZXNvbHZlckZsYWc6IGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnW3JlbW90ZVJlc29sdmVyVGVybWluYWxdXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRydXN0UmVxdWVzdENvdW50OiAwLFxuXHRcdFx0XHRwZXJzaXN0ZWRSZXNvbHZlckZsYWc6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YW5jZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bm1hcmtlZCB0ZXJtaW5hbCByZXF1ZXN0cyB3b3Jrc3BhY2UgdHJ1c3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlID0gbmV3IFRlc3RUZXJtaW5hbFdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgY3JlYXRlVGVybWluYWxJbnN0YW5jZSh1bmRlZmluZWQsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRleGVjdXRhYmxlOiAnL3Vzci9iaW4venNoJyxcblx0XHRcdFx0Y3dkOiBVUkkuZmlsZSgnL2hvbWUvdGVzdCcpLFxuXHRcdFx0XHRpc1RyYW5zaWVudDogdHJ1ZVxuXHRcdFx0fSwgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSk7XG5cblx0XHRcdGF3YWl0IChpbnN0YW5jZSBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsICgpID0+IFByb21pc2U8dm9pZD4+KVsnX2NyZWF0ZVByb2Nlc3MnXSgpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbCh3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RDb3VudCwgMSk7XG5cdFx0XHRpbnN0YW5jZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGNyZWF0ZSBhIHByb2Nlc3Mgd2hlbiB3b3Jrc3BhY2UgdHJ1c3QgaXMgZGVuaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxJbnN0YW5jZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RUZXJtaW5hbEluc3RhbmNlU2VydmljZSgpKTtcblx0XHRcdGxldCByZXNvbHZlVHJ1c3QhOiAodHJ1c3RlZDogYm9vbGVhbikgPT4gdm9pZDtcblx0XHRcdGNvbnN0IHRydXN0UmVxdWVzdCA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gcmVzb2x2ZVRydXN0ID0gcmVzb2x2ZSk7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZVRlcm1pbmFsSW5zdGFudGlhdGlvblNlcnZpY2UodGVybWluYWxJbnN0YW5jZVNlcnZpY2UsIHVuZGVmaW5lZCwgKCkgPT4gdHJ1c3RSZXF1ZXN0KTtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsSW5zdGFuY2UsIHRlcm1pbmFsU2hlbGxUeXBlQ29udGV4dEtleSwge30pKTtcblx0XHRcdGNvbnN0IGV4aXRQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKGluc3RhbmNlLm9uRXhpdCk7XG5cdFx0XHRyZXNvbHZlVHJ1c3QoZmFsc2UpO1xuXHRcdFx0YXdhaXQgZXhpdFByb21pc2U7XG5cblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmNyZWF0ZVByb2Nlc3NDb3VudCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGNyZWF0ZSBhIHByb2Nlc3Mgd2l0aCBhbiB1bmV4cGVjdGVkIGN3ZCBpbiBhbiBlbXB0eSB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbEluc3RhbmNlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjcmVhdGVUZXJtaW5hbEluc3RhbmNlKHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLCBuZXcgV29ya3NwYWNlKCdlbXB0eScpKTtcblx0XHRcdGF3YWl0IHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLnByb2Nlc3NDcmVhdGVkUHJvbWlzZTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAwKSk7XG5cdFx0XHRjb25zdCB0ZXN0SW5zdGFuY2UgPSBpbnN0YW5jZSBhcyB1bmtub3duIGFzIHsgX2N3ZDogc3RyaW5nOyBfdXNlckhvbWU6IHN0cmluZyB9O1xuXHRcdFx0Y29uc3QgY3JlYXRlUHJvY2VzcyA9ICgpID0+IChpbnN0YW5jZSBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsICgpID0+IFByb21pc2U8dm9pZD4+KVsnX2NyZWF0ZVByb2Nlc3MnXSgpO1xuXHRcdFx0dGVzdEluc3RhbmNlLl9jd2QgPSAnL3VuZXhwZWN0ZWQnO1xuXHRcdFx0dGVzdEluc3RhbmNlLl91c2VySG9tZSA9ICcvaG9tZSc7XG5cdFx0XHRjb25zdCBleGl0UHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZShpbnN0YW5jZS5vbkV4aXQpO1xuXG5cdFx0XHRhd2FpdCBjcmVhdGVQcm9jZXNzKCk7XG5cdFx0XHRjb25zdCBleGl0UmVzdWx0ID0gYXdhaXQgZXhpdFByb21pc2U7XG5cblx0XHRcdG9rKGV4aXRSZXN1bHQgJiYgdHlwZW9mIGV4aXRSZXN1bHQgPT09ICdvYmplY3QnICYmIHR5cGVvZiBleGl0UmVzdWx0Lm1lc3NhZ2UgPT09ICdzdHJpbmcnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmNyZWF0ZVByb2Nlc3NDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgdGl0bGUgZm9yIHRhc2sgdGVybWluYWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVUZXJtaW5hbEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCB0YXNrVGVybWluYWwgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxJbnN0YW5jZSwgdGVybWluYWxTaGVsbFR5cGVDb250ZXh0S2V5LCB7XG5cdFx0XHRcdHR5cGU6ICdUYXNrJyxcblx0XHRcdFx0bmFtZTogJ1Rlc3QgVGFzayBOYW1lJ1xuXHRcdFx0fSkpO1xuXG5cblx0XHRcdC8vIFNpbXVsYXRlIHNldHRpbmcgdGhlIHRpdGxlIHZpYSBBUEkgKGFzIHRoZSB0YXNrIHN5c3RlbSB3b3VsZCBkbylcblx0XHRcdGF3YWl0IHRhc2tUZXJtaW5hbC5yZW5hbWUoJ1Rlc3QgVGFzayBOYW1lJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0YXNrVGVybWluYWwudGl0bGUsICdUZXN0IFRhc2sgTmFtZScpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBhIHByb2Nlc3MgdGl0bGUgY2hhbmdlICh3aGljaCBoYXBwZW5zIHdoZW4gdGFzayBjb21wbGV0ZXMpXG5cdFx0XHRhd2FpdCB0YXNrVGVybWluYWwucmVuYW1lKCdzb21lLXByb2Nlc3MtbmFtZScsIFRpdGxlRXZlbnRTb3VyY2UuUHJvY2Vzcyk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGF0IHRoZSB0YXNrIG5hbWUgaXMgcHJlc2VydmVkXG5cdFx0XHRzdHJpY3RFcXVhbCh0YXNrVGVybWluYWwudGl0bGUsICdUZXN0IFRhc2sgTmFtZScsICdUYXNrIHRlcm1pbmFsIHNob3VsZCBwcmVzZXJ2ZSBBUEktc2V0IHRpdGxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgYWdlbnQgc2hlbGwgdHlwZSBkZXRlY3RlZCBmcm9tIHNlcXVlbmNlIHVudGlsIHRoZSBwYXJlbnQgc2hlbGwgcmV0dXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgY3JlYXRlVGVybWluYWxJbnN0YW5jZSgpIGFzIFRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0XHRjb25zdCBvblRpdGxlQ2hhbmdlID0gKHRpdGxlOiBzdHJpbmcpID0+IChpbnN0YW5jZSBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkPilbJ19vblRpdGxlQ2hhbmdlJ10odGl0bGUpO1xuXHRcdFx0Y29uc3QgaGFuZGxlU2hlbGxUeXBlQ2hhbmdlID0gKHNoZWxsVHlwZTogR2VuZXJhbFNoZWxsVHlwZSB8IFBvc2l4U2hlbGxUeXBlIHwgdW5kZWZpbmVkKSA9PiAoaW5zdGFuY2UgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCAodmFsdWU6IEdlbmVyYWxTaGVsbFR5cGUgfCBQb3NpeFNoZWxsVHlwZSB8IHVuZGVmaW5lZCkgPT4gdm9pZD4pWydfaGFuZGxlU2hlbGxUeXBlQ2hhbmdlJ10oc2hlbGxUeXBlKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoaW5zdGFuY2Uuc2hlbGxUeXBlLCB1bmRlZmluZWQpO1xuXHRcdFx0b25UaXRsZUNoYW5nZSgnQ2xhdWRlIENvZGUnKTtcblx0XHRcdHN0cmljdEVxdWFsKGluc3RhbmNlLnNoZWxsVHlwZSwgR2VuZXJhbFNoZWxsVHlwZS5DbGF1ZGUpO1xuXG5cdFx0XHRoYW5kbGVTaGVsbFR5cGVDaGFuZ2UoR2VuZXJhbFNoZWxsVHlwZS5Ob2RlKTtcblx0XHRcdHN0cmljdEVxdWFsKGluc3RhbmNlLnNoZWxsVHlwZSwgR2VuZXJhbFNoZWxsVHlwZS5DbGF1ZGUpO1xuXG5cdFx0XHRoYW5kbGVTaGVsbFR5cGVDaGFuZ2UodW5kZWZpbmVkKTtcblx0XHRcdHN0cmljdEVxdWFsKGluc3RhbmNlLnNoZWxsVHlwZSwgR2VuZXJhbFNoZWxsVHlwZS5DbGF1ZGUpO1xuXG5cdFx0XHRoYW5kbGVTaGVsbFR5cGVDaGFuZ2UoUG9zaXhTaGVsbFR5cGUuWnNoKTtcblx0XHRcdHN0cmljdEVxdWFsKGluc3RhbmNlLnNoZWxsVHlwZSwgUG9zaXhTaGVsbFR5cGUuWnNoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgQ29tbWFuZCBDb2RlIGFnZW50IHNoZWxsIHR5cGUgZnJvbSBpdHMgT1NDIHRpdGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjcmVhdGVUZXJtaW5hbEluc3RhbmNlKCkgYXMgVGVybWluYWxJbnN0YW5jZTtcblx0XHRcdGNvbnN0IG9uVGl0bGVDaGFuZ2UgPSAodGl0bGU6IHN0cmluZykgPT4gKGluc3RhbmNlIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQ+KVsnX29uVGl0bGVDaGFuZ2UnXSh0aXRsZSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGluc3RhbmNlLnNoZWxsVHlwZSwgdW5kZWZpbmVkKTtcblx0XHRcdG9uVGl0bGVDaGFuZ2UoJ1xcdTI3MzMgQ29tbWFuZCBDb2RlIFxcdTAwYjcgbXktcHJvamVjdCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoaW5zdGFuY2Uuc2hlbGxUeXBlLCBHZW5lcmFsU2hlbGxUeXBlLkNvbW1hbmRDb2RlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIG9uV2lsbERpc3Bvc2UgYmVmb3JlIHh0ZXJtIGRpc3Bvc2FsIGFuZCBvbkRpc3Bvc2VkIGFmdGVyIHh0ZXJtIGRpc3Bvc2FsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCBjcmVhdGVUZXJtaW5hbEluc3RhbmNlKCk7XG5cdFx0XHRjb25zdCB4dGVybSA9IGF3YWl0IGluc3RhbmNlLnh0ZXJtUmVhZHlQcm9taXNlO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWxPcmRlcjogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0c3RvcmUuYWRkKGluc3RhbmNlLm9uV2lsbERpc3Bvc2UoKCkgPT4gZGlzcG9zYWxPcmRlci5wdXNoKCdvbldpbGxEaXNwb3NlJykpKTtcblx0XHRcdHN0b3JlLmFkZCh4dGVybSEub25EaWREaXNwb3NlKCgpID0+IGRpc3Bvc2FsT3JkZXIucHVzaCgneHRlcm0nKSkpO1xuXHRcdFx0c3RvcmUuYWRkKGluc3RhbmNlLm9uRGlzcG9zZWQoKCkgPT4gZGlzcG9zYWxPcmRlci5wdXNoKCdvbkRpc3Bvc2VkJykpKTtcblxuXHRcdFx0aW5zdGFuY2UuZGlzcG9zZSgpO1xuXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoZGlzcG9zYWxPcmRlciwgWydvbldpbGxEaXNwb3NlJywgJ3h0ZXJtJywgJ29uRGlzcG9zZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGlzcG9zZSBjb250cmlidXRpb24tb3duZWQgeHRlcm0gYWRkb25zIGJlZm9yZSB4dGVybSBkaXNwb3NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgY3JlYXRlVGVybWluYWxJbnN0YW5jZSgpO1xuXHRcdFx0Y29uc3QgeHRlcm0gPSBhd2FpdCBpbnN0YW5jZS54dGVybVJlYWR5UHJvbWlzZTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FsT3JkZXI6IHN0cmluZ1tdID0gW107XG5cdFx0XHRsZXQgYWRkb25EaXNwb3NlQ291bnQgPSAwO1xuXG5cdFx0XHRjb25zdCBhZGRvbiA9IHtcblx0XHRcdFx0YWN0aXZhdGU6ICgpID0+IHsgfSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdGFkZG9uRGlzcG9zZUNvdW50Kys7XG5cdFx0XHRcdFx0ZGlzcG9zYWxPcmRlci5wdXNoKCdhZGRvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0eHRlcm0hLnJhdy5sb2FkQWRkb24oYWRkb24pO1xuXHRcdFx0c3RvcmUuYWRkKGluc3RhbmNlLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhbE9yZGVyLnB1c2goJ29uV2lsbERpc3Bvc2UnKTtcblx0XHRcdFx0YWRkb24uZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKHh0ZXJtIS5vbkRpZERpc3Bvc2UoKCkgPT4gZGlzcG9zYWxPcmRlci5wdXNoKCd4dGVybScpKSk7XG5cdFx0XHRzdG9yZS5hZGQoaW5zdGFuY2Uub25EaXNwb3NlZCgoKSA9PiBkaXNwb3NhbE9yZGVyLnB1c2goJ29uRGlzcG9zZWQnKSkpO1xuXG5cdFx0XHRpbnN0YW5jZS5kaXNwb3NlKCk7XG5cblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBkaXNwb3NhbE9yZGVyLCBhZGRvbkRpc3Bvc2VDb3VudCB9LFxuXHRcdFx0XHR7IGRpc3Bvc2FsT3JkZXI6IFsnb25XaWxsRGlzcG9zZScsICdhZGRvbicsICd4dGVybScsICdvbkRpc3Bvc2VkJ10sIGFkZG9uRGlzcG9zZUNvdW50OiAxIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjdXN0b20ga2V5IGV2ZW50IGhhbmRsZXIgc2hvdWxkIGhhbmRsZSBjb21tYW5kcyBpbiBERUZBVUxUX0NPTU1BTkRTX1RPX1NLSVBfU0hFTEwgaW4gVlMgQ29kZSBhbmQgbm90IHh0ZXJtIHdoZW4gc2VuZEtleWJpbmRpbmdzVG9TaGVsbCBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgY3JlYXRlVGVybWluYWxJbnN0YW5jZSgpO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBpbnN0YW5jZVsnX2tleWJpbmRpbmdTZXJ2aWNlJ107XG5cdFx0XHRjb25zdCBvcmlnaW5hbFNvZnREaXNwYXRjaCA9IGtleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaDtcblx0XHRcdGtleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaCA9ICgpID0+ICh7IGtpbmQ6IFJlc3VsdEtpbmQuS2JGb3VuZCwgY29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi56b29tSW4nLCBjb21tYW5kQXJnczogdW5kZWZpbmVkLCBpc0J1YmJsZTogZmFsc2UgfSk7XG5cblx0XHRcdGxldCBjYXB0dXJlZEhhbmRsZXI6ICgoZTogS2V5Ym9hcmRFdmVudCkgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQ7XG5cdFx0XHRpbnN0YW5jZS54dGVybSEucmF3LmF0dGFjaEN1c3RvbUtleUV2ZW50SGFuZGxlciA9IGhhbmRsZXIgPT4geyBjYXB0dXJlZEhhbmRsZXIgPSBoYW5kbGVyOyB9O1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0XHRpbnN0YW5jZS5hdHRhY2hUb0VsZW1lbnQoY29udGFpbmVyKTtcblx0XHRcdGluc3RhbmNlLnNldFZpc2libGUodHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJz0nLCBjYW5jZWxhYmxlOiB0cnVlIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHsgcmVzdWx0OiBjYXB0dXJlZEhhbmRsZXI/LihldmVudCksIGRlZmF1bHRQcmV2ZW50ZWQ6IGV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQgfSxcblx0XHRcdFx0XHR7IHJlc3VsdDogZmFsc2UsIGRlZmF1bHRQcmV2ZW50ZWQ6IHRydWUgfVxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0a2V5YmluZGluZ1NlcnZpY2Uuc29mdERpc3BhdGNoID0gb3JpZ2luYWxTb2Z0RGlzcGF0Y2g7XG5cdFx0XHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2N1c3RvbSBrZXkgZXZlbnQgaGFuZGxlciBzaG91bGQgaW50ZXJjZXB0IE1ldGEtbW9kaWZpZWQga2V5cyB0aGF0IHJlc29sdmUgdG8gYSBjb21tYW5kIHdoZW4gc2VuZEtleWJpbmRpbmdzVG9TaGVsbCBpcyBkaXNhYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgY3JlYXRlVGVybWluYWxJbnN0YW5jZSgpO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBpbnN0YW5jZVsnX2tleWJpbmRpbmdTZXJ2aWNlJ107XG5cdFx0XHRjb25zdCBvcmlnaW5hbFNvZnREaXNwYXRjaCA9IGtleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaDtcblx0XHRcdHN0cmljdEVxdWFsKERFRkFVTFRfQ09NTUFORFNfVE9fU0tJUF9TSEVMTC5pbmNsdWRlcygndGVzdC5tZXRhS2V5SW50ZXJjZXB0Q29tbWFuZCcpLCBmYWxzZSk7XG5cdFx0XHRrZXliaW5kaW5nU2VydmljZS5zb2Z0RGlzcGF0Y2ggPSAoKSA9PiAoeyBraW5kOiBSZXN1bHRLaW5kLktiRm91bmQsIGNvbW1hbmRJZDogJ3Rlc3QubWV0YUtleUludGVyY2VwdENvbW1hbmQnLCBjb21tYW5kQXJnczogdW5kZWZpbmVkLCBpc0J1YmJsZTogZmFsc2UgfSk7XG5cblx0XHRcdGxldCBjYXB0dXJlZEhhbmRsZXI6ICgoZTogS2V5Ym9hcmRFdmVudCkgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQ7XG5cdFx0XHRpbnN0YW5jZS54dGVybSEucmF3LmF0dGFjaEN1c3RvbUtleUV2ZW50SGFuZGxlciA9IGhhbmRsZXIgPT4geyBjYXB0dXJlZEhhbmRsZXIgPSBoYW5kbGVyOyB9O1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0XHRpbnN0YW5jZS5hdHRhY2hUb0VsZW1lbnQoY29udGFpbmVyKTtcblx0XHRcdGluc3RhbmNlLnNldFZpc2libGUodHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGtleTogJz0nLCBtZXRhS2V5OiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHsgcmVzdWx0OiBjYXB0dXJlZEhhbmRsZXI/LihldmVudCksIGRlZmF1bHRQcmV2ZW50ZWQ6IGV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQgfSxcblx0XHRcdFx0XHR7IHJlc3VsdDogZmFsc2UsIGRlZmF1bHRQcmV2ZW50ZWQ6IHRydWUgfVxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0a2V5YmluZGluZ1NlcnZpY2Uuc29mdERpc3BhdGNoID0gb3JpZ2luYWxTb2Z0RGlzcGF0Y2g7XG5cdFx0XHRcdGNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdERUZBVUxUX0NPTU1BTkRTX1RPX1NLSVBfU0hFTEwnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgem9vbSBjb21tYW5kcyBzbyB0aGV5IGFyZSBub3QgY29uc3VtZWQgYnkga2l0dHkga2V5Ym9hcmQgcHJvdG9jb2wnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFsnd29ya2JlbmNoLmFjdGlvbi56b29tSW4nLCAnd29ya2JlbmNoLmFjdGlvbi56b29tT3V0JywgJ3dvcmtiZW5jaC5hY3Rpb24uem9vbVJlc2V0J10uZXZlcnkoXG5cdFx0XHRcdFx0Y21kID0+IERFRkFVTFRfQ09NTUFORFNfVE9fU0tJUF9TSEVMTC5pbmNsdWRlcyhjbWQpXG5cdFx0XHRcdCksXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgncGFyc2VFeGl0UmVzdWx0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gbm8gbWVzc2FnZSBmb3IgZXhpdCBjb2RlID0gdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQodW5kZWZpbmVkLCB7fSwgUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiB1bmRlZmluZWQsIG1lc3NhZ2U6IHVuZGVmaW5lZCB9XG5cdFx0XHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQodW5kZWZpbmVkLCB7fSwgUHJvY2Vzc1N0YXRlLktpbGxlZEJ5VXNlciwgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiB1bmRlZmluZWQsIG1lc3NhZ2U6IHVuZGVmaW5lZCB9XG5cdFx0XHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQodW5kZWZpbmVkLCB7fSwgUHJvY2Vzc1N0YXRlLktpbGxlZEJ5UHJvY2VzcywgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiB1bmRlZmluZWQsIG1lc3NhZ2U6IHVuZGVmaW5lZCB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gbm8gbWVzc2FnZSBmb3IgZXhpdCBjb2RlID0gMCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDAsIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDAsIG1lc3NhZ2U6IHVuZGVmaW5lZCB9XG5cdFx0XHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoMCwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVVzZXIsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMCwgbWVzc2FnZTogdW5kZWZpbmVkIH1cblx0XHRcdCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCgwLCB7fSwgUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiAwLCBtZXNzYWdlOiB1bmRlZmluZWQgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZyaWVuZGx5IG1lc3NhZ2Ugd2hlbiBleGVjdXRhYmxlIGlzIHNwZWNpZmllZCBmb3Igbm9uLXplcm8gZXhpdCBjb2RlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDEsIHsgZXhlY3V0YWJsZTogJ2ZvbycgfSwgUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiAxLCBtZXNzYWdlOiAnVGhlIHRlcm1pbmFsIHByb2Nlc3MgXCJmb29cIiBmYWlsZWQgdG8gbGF1bmNoIChleGl0IGNvZGU6IDEpLicgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDEsIHsgZXhlY3V0YWJsZTogJ2ZvbycgfSwgUHJvY2Vzc1N0YXRlLktpbGxlZEJ5VXNlciwgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiAxLCBtZXNzYWdlOiAnVGhlIHRlcm1pbmFsIHByb2Nlc3MgXCJmb29cIiB0ZXJtaW5hdGVkIHdpdGggZXhpdCBjb2RlOiAxLicgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDEsIHsgZXhlY3V0YWJsZTogJ2ZvbycgfSwgUHJvY2Vzc1N0YXRlLktpbGxlZEJ5UHJvY2VzcywgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiAxLCBtZXNzYWdlOiAnVGhlIHRlcm1pbmFsIHByb2Nlc3MgXCJmb29cIiB0ZXJtaW5hdGVkIHdpdGggZXhpdCBjb2RlOiAxLicgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZyaWVuZGx5IG1lc3NhZ2Ugd2hlbiBleGVjdXRhYmxlIGFuZCBhcmdzIGFyZSBzcGVjaWZpZWQgZm9yIG5vbi16ZXJvIGV4aXQgY29kZXMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCgxLCB7IGV4ZWN1dGFibGU6ICdmb28nLCBhcmdzOiBbJ2JhcicsICdiYXonXSB9LCBQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDEsIG1lc3NhZ2U6IGBUaGUgdGVybWluYWwgcHJvY2VzcyBcImZvbyAnYmFyJywgJ2JheidcIiBmYWlsZWQgdG8gbGF1bmNoIChleGl0IGNvZGU6IDEpLmAgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDEsIHsgZXhlY3V0YWJsZTogJ2ZvbycsIGFyZ3M6IFsnYmFyJywgJ2JheiddIH0sIFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVVzZXIsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMSwgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIFwiZm9vICdiYXInLCAnYmF6J1wiIHRlcm1pbmF0ZWQgd2l0aCBleGl0IGNvZGU6IDEuYCB9XG5cdFx0XHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoMSwgeyBleGVjdXRhYmxlOiAnZm9vJywgYXJnczogWydiYXInLCAnYmF6J10gfSwgUHJvY2Vzc1N0YXRlLktpbGxlZEJ5UHJvY2VzcywgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiAxLCBtZXNzYWdlOiBgVGhlIHRlcm1pbmFsIHByb2Nlc3MgXCJmb28gJ2JhcicsICdiYXonXCIgdGVybWluYXRlZCB3aXRoIGV4aXQgY29kZTogMS5gIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmcmllbmRseSBtZXNzYWdlIHdoZW4gZXhlY3V0YWJsZSBhbmQgYXJndW1lbnRzIGFyZSBvbWl0dGVkIGZvciBub24temVybyBleGl0IGNvZGVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoMSwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMSwgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIGZhaWxlZCB0byBsYXVuY2ggKGV4aXQgY29kZTogMSkuYCB9XG5cdFx0XHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoMSwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVVzZXIsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMSwgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIHRlcm1pbmF0ZWQgd2l0aCBleGl0IGNvZGU6IDEuYCB9XG5cdFx0XHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoMSwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVByb2Nlc3MsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMSwgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIHRlcm1pbmF0ZWQgd2l0aCBleGl0IGNvZGU6IDEuYCB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgcHR5IGhvc3QtcmVsYXRlZCBlcnJvcnMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCh7IG1lc3NhZ2U6ICdDb3VsZCBub3QgZmluZCBwdHkgd2l0aCBpZCAxNicgfSwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogdW5kZWZpbmVkLCBtZXNzYWdlOiB1bmRlZmluZWQgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgZm9ybWF0IGNvbnB0eSBmYWlsdXJlIGNvZGUgNScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KHsgY29kZTogNSwgbWVzc2FnZTogJ0EgbmF0aXZlIGV4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgbGF1bmNoIChDYW5ub3QgY3JlYXRlIHByb2Nlc3MsIGVycm9yIGNvZGU6IDUpJyB9LCB7IGV4ZWN1dGFibGU6ICdmb28nIH0sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogNSwgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIGZhaWxlZCB0byBsYXVuY2g6IEFjY2VzcyB3YXMgZGVuaWVkIHRvIHRoZSBwYXRoIGNvbnRhaW5pbmcgeW91ciBleGVjdXRhYmxlIFwiZm9vXCIuIE1hbmFnZSBhbmQgY2hhbmdlIHlvdXIgcGVybWlzc2lvbnMgdG8gZ2V0IHRoaXMgdG8gd29yay5gIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGZvcm1hdCBjb25wdHkgZmFpbHVyZSBjb2RlIDI2NycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KHsgY29kZTogMjY3LCBtZXNzYWdlOiAnQSBuYXRpdmUgZXhjZXB0aW9uIG9jY3VycmVkIGR1cmluZyBsYXVuY2ggKENhbm5vdCBjcmVhdGUgcHJvY2VzcywgZXJyb3IgY29kZTogMjY3KScgfSwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsICcvZm9vJyksXG5cdFx0XHRcdHsgY29kZTogMjY3LCBtZXNzYWdlOiBgVGhlIHRlcm1pbmFsIHByb2Nlc3MgZmFpbGVkIHRvIGxhdW5jaDogSW52YWxpZCBzdGFydGluZyBkaXJlY3RvcnkgXCIvZm9vXCIsIHJldmlldyB5b3VyIHRlcm1pbmFsLmludGVncmF0ZWQuY3dkIHNldHRpbmcuYCB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBmb3JtYXQgY29ucHR5IGZhaWx1cmUgY29kZSAxMjYwJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoeyBjb2RlOiAxMjYwLCBtZXNzYWdlOiAnQSBuYXRpdmUgZXhjZXB0aW9uIG9jY3VycmVkIGR1cmluZyBsYXVuY2ggKENhbm5vdCBjcmVhdGUgcHJvY2VzcywgZXJyb3IgY29kZTogMTI2MCknIH0sIHsgZXhlY3V0YWJsZTogJ2ZvbycgfSwgUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiAxMjYwLCBtZXNzYWdlOiBgVGhlIHRlcm1pbmFsIHByb2Nlc3MgZmFpbGVkIHRvIGxhdW5jaDogV2luZG93cyBjYW5ub3Qgb3BlbiB0aGlzIHByb2dyYW0gYmVjYXVzZSBpdCBoYXMgYmVlbiBwcmV2ZW50ZWQgYnkgYSBzb2Z0d2FyZSByZXN0cmljdGlvbiBwb2xpY3kuIEZvciBtb3JlIGluZm9ybWF0aW9uLCBvcGVuIEV2ZW50IFZpZXdlciBvciBjb250YWN0IHlvdXIgc3lzdGVtIEFkbWluaXN0cmF0b3IuYCB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBmb3JtYXQgY29ucHR5IGxhdW5jaCBmYWlsdXJlJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoeyBtZXNzYWdlOiAnQSBuYXRpdmUgZXhjZXB0aW9uIG9jY3VycmVkIGR1cmluZyBsYXVuY2ggKENhbm5vdCBsYXVuY2ggY29ucHR5KS4gV2lucHR5IGhhcyBiZWVuIHJlbW92ZWQsIHNlZSBodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS91cGRhdGVzL3YxXzEwOSNfcmVtb3ZhbC1vZi13aW5wdHktc3VwcG9ydCBmb3IgbW9yZSBkZXRhaWxzLiBZb3UgY2FuIGFsc28gdHJ5IGVuYWJsaW5nIHRoZSBgdGVybWluYWwuaW50ZWdyYXRlZC53aW5kb3dzVXNlQ29ucHR5RGxsYCBzZXR0aW5nLicgfSwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogdW5kZWZpbmVkLCBtZXNzYWdlOiBgVGhlIHRlcm1pbmFsIHByb2Nlc3MgZmFpbGVkIHRvIGxhdW5jaDogQSBuYXRpdmUgZXhjZXB0aW9uIG9jY3VycmVkIGR1cmluZyBsYXVuY2ggKENhbm5vdCBsYXVuY2ggY29ucHR5KS4gV2lucHR5IGhhcyBiZWVuIHJlbW92ZWQsIHNlZSBodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS91cGRhdGVzL3YxXzEwOSNfcmVtb3ZhbC1vZi13aW5wdHktc3VwcG9ydCBmb3IgbW9yZSBkZXRhaWxzLiBZb3UgY2FuIGFsc28gdHJ5IGVuYWJsaW5nIHRoZSBcXGB0ZXJtaW5hbC5pbnRlZ3JhdGVkLndpbmRvd3NVc2VDb25wdHlEbGxcXGAgc2V0dGluZy4uYCB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBmb3JtYXQgZ2VuZXJpYyBmYWlsdXJlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KHsgY29kZTogMTIzLCBtZXNzYWdlOiAnQSBuYXRpdmUgZXhjZXB0aW9uIG9jY3VycmVkIGR1cmluZyBsYXVuY2ggKENhbm5vdCBjcmVhdGUgcHJvY2VzcywgZXJyb3IgY29kZTogMTIzKScgfSwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMTIzLCBtZXNzYWdlOiBgVGhlIHRlcm1pbmFsIHByb2Nlc3MgZmFpbGVkIHRvIGxhdW5jaDogQSBuYXRpdmUgZXhjZXB0aW9uIG9jY3VycmVkIGR1cmluZyBsYXVuY2ggKENhbm5vdCBjcmVhdGUgcHJvY2VzcywgZXJyb3IgY29kZTogMTIzKS5gIH1cblx0XHRcdCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCh7IGNvZGU6IDEyMywgbWVzc2FnZTogJ2ZvbycgfSwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMTIzLCBtZXNzYWdlOiBgVGhlIHRlcm1pbmFsIHByb2Nlc3MgZmFpbGVkIHRvIGxhdW5jaDogZm9vLmAgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdUZXJtaW5hbExhYmVsQ29tcHV0ZXInLCAoKSA9PiB7XG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IGNhcGFiaWxpdGllczogVGVybWluYWxDYXBhYmlsaXR5U3RvcmU7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVJbnN0YW5jZShwYXJ0aWFsPzogUGFydGlhbDxJVGVybWluYWxJbnN0YW5jZT4pOiBQaWNrPElUZXJtaW5hbEluc3RhbmNlLCAnc2hlbGxMYXVuY2hDb25maWcnIHwgJ3NoZWxsVHlwZScgfCAndXNlckhvbWUnIHwgJ2N3ZCcgfCAnaW5pdGlhbEN3ZCcgfCAncHJvY2Vzc05hbWUnIHwgJ3NlcXVlbmNlJyB8ICd3b3Jrc3BhY2VGb2xkZXInIHwgJ3N0YXRpY1RpdGxlJyB8ICdjYXBhYmlsaXRpZXMnIHwgJ3RpdGxlJyB8ICdkZXNjcmlwdGlvbicgfCAnb3MnPiB7XG5cdFx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpO1xuXHRcdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuTmFpdmVDd2REZXRlY3Rpb24sIG51bGwhKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnOiB7fSxcblx0XHRcdFx0c2hlbGxUeXBlOiBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwsXG5cdFx0XHRcdGN3ZDogJ2N3ZCcsXG5cdFx0XHRcdGluaXRpYWxDd2Q6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJvY2Vzc05hbWU6ICcnLFxuXHRcdFx0XHRzZXF1ZW5jZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhdGljVGl0bGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzLFxuXHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdFx0dXNlckhvbWU6ICcvaG9tZS91c2VyJyxcblx0XHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eCxcblx0XHRcdFx0Li4ucGFydGlhbFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdFx0Y2FwYWJpbGl0aWVzID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblx0XHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRcdGNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5Lk5haXZlQ3dkRGV0ZWN0aW9uLCBudWxsISk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVMYWJlbENvbXB1dGVyKGNvbmZpZ3VyYXRpb246IGFueSkge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShjb25maWd1cmF0aW9uKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlKSkpO1xuXHRcdFx0cmV0dXJuIHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExhYmVsQ29tcHV0ZXIpKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSB0byBcIlwiIHdoZW4gdGhlIHRlbXBsYXRlIHZhcmlhYmxlcyBhcmUgZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJywgZGVzY3JpcHRpb246ICcnIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgcHJvY2Vzc05hbWU6ICcnIH0pKTtcblx0XHRcdC8vIFRPRE86XG5cdFx0XHQvLyB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIub25MYWJlbENoYW5nZWQoZSA9PiB7XG5cdFx0XHQvLyBcdHN0cmljdEVxdWFsKGUudGl0bGUsICcnKTtcblx0XHRcdC8vIFx0c3RyaWN0RXF1YWwoZS5kZXNjcmlwdGlvbiwgJycpO1xuXHRcdFx0Ly8gfSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICcnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci5kZXNjcmlwdGlvbiwgJycpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIGN3ZCB3aGVuIG91dHNpZGUgb2YgdXNlckhvbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJHtjd2R9JywgZGVzY3JpcHRpb246ICcke2N3ZH0nIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgY3dkOiBST09UXzEgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCBST09UXzEpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCBST09UXzEpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIGN3ZCB3aGVuIHVuZGVyIHVzZXJIb21lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7Y3dkfScsIGRlc2NyaXB0aW9uOiAnJHtjd2R9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIGN3ZDogJy9ob21lL3VzZXIvZm9vL2JhcicgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnfi9mb28vYmFyJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICd+L2Zvby9iYXInKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBjd2Qgd2hlbiBleGFjdGx5IGF0IHVzZXJIb21lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7Y3dkfScsIGRlc2NyaXB0aW9uOiAnJHtjd2R9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIGN3ZDogJy9ob21lL3VzZXInIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ34nKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci5kZXNjcmlwdGlvbiwgJ34nKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgbm90IHNob3J0ZW4gY3dkIG9uIFdpbmRvd3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJHtjd2R9JywgZGVzY3JpcHRpb246ICcke2N3ZH0nIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgY3dkOiAnQzpcXFxcVXNlcnNcXFxcdXNlcicsIHVzZXJIb21lOiAnQzpcXFxcVXNlcnNcXFxcdXNlcicsIG9zOiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdDOlxcXFxVc2Vyc1xcXFx1c2VyJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICdDOlxcXFxVc2Vyc1xcXFx1c2VyJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgd29ya3NwYWNlRm9sZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7d29ya3NwYWNlRm9sZGVyfScsIGRlc2NyaXB0aW9uOiAnJHt3b3Jrc3BhY2VGb2xkZXJ9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHByb2Nlc3NOYW1lOiAnenNoJywgd29ya3NwYWNlRm9sZGVyOiB7IHVyaTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJ2ZvbGRlcicgfSkgfSBhcyBJV29ya3NwYWNlRm9sZGVyIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ2ZvbGRlcicpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnZm9sZGVyJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgbG9jYWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJHtsb2NhbH0nLCBkZXNjcmlwdGlvbjogJyR7bG9jYWx9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHByb2Nlc3NOYW1lOiAnenNoJywgc2hlbGxMYXVuY2hDb25maWc6IHsgdHlwZTogJ0xvY2FsJyB9IH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ0xvY2FsJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICdMb2NhbCcpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIHByb2Nlc3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJHtwcm9jZXNzfScsIGRlc2NyaXB0aW9uOiAnJHtwcm9jZXNzfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3pzaCcgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnenNoJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICd6c2gnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBzZXF1ZW5jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIC0gJywgdGl0bGU6ICcke3NlcXVlbmNlfScsIGRlc2NyaXB0aW9uOiAnJHtzZXF1ZW5jZX0nIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgc2VxdWVuY2U6ICdzZXF1ZW5jZScgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnc2VxdWVuY2UnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci5kZXNjcmlwdGlvbiwgJ3NlcXVlbmNlJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgZW1wdHkgc2VxdWVuY2UgdG8gcHJvY2VzcyBuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7c2VxdWVuY2V9JHtzZXBhcmF0b3J9JHtwcm9jZXNzfScsIGRlc2NyaXB0aW9uOiAnJHtzZXF1ZW5jZX0nIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgcHJvY2Vzc05hbWU6ICd6c2gnLCBzZXF1ZW5jZTogJycgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnenNoJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICcnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSB0YXNrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgfiAnLCB0aXRsZTogJyR7cHJvY2Vzc30ke3NlcGFyYXRvcn0ke3Rhc2t9JywgZGVzY3JpcHRpb246ICcke3Rhc2t9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHByb2Nlc3NOYW1lOiAnenNoJywgc2hlbGxMYXVuY2hDb25maWc6IHsgdHlwZTogJ1Rhc2snIH0gfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnenNoIH4gVGFzaycpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnVGFzaycpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIHNlcGFyYXRvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIH4gJywgdGl0bGU6ICcke3NlcGFyYXRvcn0nLCBkZXNjcmlwdGlvbjogJyR7c2VwYXJhdG9yfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3pzaCcsIHNoZWxsTGF1bmNoQ29uZmlnOiB7IHR5cGU6ICdUYXNrJyB9IH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ3pzaCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGFsd2F5cyByZXR1cm4gc3RhdGljIHRpdGxlIHdoZW4gc3BlY2lmaWVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgfiAnLCB0aXRsZTogJyR7cHJvY2Vzc30nLCBkZXNjcmlwdGlvbjogJyR7d29ya3NwYWNlRm9sZGVyfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3Byb2Nlc3MnLCB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnZm9sZGVyJyB9KSB9IGFzIElXb3Jrc3BhY2VGb2xkZXIsIHN0YXRpY1RpdGxlOiAnbXktdGl0bGUnIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ215LXRpdGxlJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICdmb2xkZXInKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgdXNlIHNoZWxsTGF1bmNoQ29uZmlnLnRpdGxlVGVtcGxhdGUgYXMgdGVtcGxhdGUgd2hlbiBzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJHtwcm9jZXNzfScsIGRlc2NyaXB0aW9uOiAnJHtjd2R9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHNlcXVlbmNlOiAnbXktc2VxdWVuY2UnLCBwcm9jZXNzTmFtZTogJ3pzaCcsIHNoZWxsTGF1bmNoQ29uZmlnOiB7IHRpdGxlVGVtcGxhdGU6ICcke3NlcXVlbmNlfScgfSB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdteS1zZXF1ZW5jZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnY3dkJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHVzZSAke3NlcXVlbmNlfSBmb3IgYWdlbnQgQ0xJIHNoZWxsIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7cHJvY2Vzc30nLCBkZXNjcmlwdGlvbjogJyR7Y3dkfScsIGFsbG93QWdlbnRDbGlUaXRsZTogdHJ1ZSB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHNoZWxsVHlwZTogR2VuZXJhbFNoZWxsVHlwZS5Db3BpbG90LCBzZXF1ZW5jZTogJ0NvcGlsb3QgQWdlbnQnLCBwcm9jZXNzTmFtZTogJ2NvcGlsb3QnIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ0NvcGlsb3QgQWdlbnQnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgdXNlICR7c2VxdWVuY2V9IGZvciBHZW1pbmkgYWdlbnQgQ0xJIHNoZWxsIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJHtwcm9jZXNzfScsIGRlc2NyaXB0aW9uOiAnJHtjd2R9JywgYWxsb3dBZ2VudENsaVRpdGxlOiB0cnVlIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgc2hlbGxUeXBlOiBHZW5lcmFsU2hlbGxUeXBlLkdlbWluaSwgc2VxdWVuY2U6ICdHZW1pbmkgLSBteS1wcm9qZWN0JywgcHJvY2Vzc05hbWU6ICdub2RlJyB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdHZW1pbmkgLSBteS1wcm9qZWN0Jyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHVzZSAke3NlcXVlbmNlfSBmb3IgQ29tbWFuZCBDb2RlIGFnZW50IENMSSBzaGVsbCB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7cHJvY2Vzc30nLCBkZXNjcmlwdGlvbjogJyR7Y3dkfScsIGFsbG93QWdlbnRDbGlUaXRsZTogdHJ1ZSB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHNoZWxsVHlwZTogR2VuZXJhbFNoZWxsVHlwZS5Db21tYW5kQ29kZSwgc2VxdWVuY2U6ICdGaXggUGFyc2VyIEJ1ZycsIHByb2Nlc3NOYW1lOiAnbm9kZScgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnRml4IFBhcnNlciBCdWcnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcHJlZmVyIHNoZWxsTGF1bmNoQ29uZmlnLnRpdGxlVGVtcGxhdGUgb3ZlciBhZ2VudCBDTEkgc2hlbGwgdHlwZSBvdmVycmlkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIC0gJywgdGl0bGU6ICcke3Byb2Nlc3N9JywgZGVzY3JpcHRpb246ICcke2N3ZH0nLCBhbGxvd0FnZW50Q2xpVGl0bGU6IHRydWUgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBzaGVsbFR5cGU6IEdlbmVyYWxTaGVsbFR5cGUuQ29waWxvdCwgc2VxdWVuY2U6ICdDb3BpbG90IEFnZW50JywgcHJvY2Vzc05hbWU6ICdjb3BpbG90Jywgc2hlbGxMYXVuY2hDb25maWc6IHsgdGl0bGVUZW1wbGF0ZTogJyR7cHJvY2Vzc30nIH0gfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnY29waWxvdCcpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsIGJhY2sgdG8gY29uZmlndXJlZCB0aXRsZSB3aGVuIGFsbG93QWdlbnRDbGlUaXRsZSBpcyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIC0gJywgdGl0bGU6ICcke3Byb2Nlc3N9JywgZGVzY3JpcHRpb246ICcke2N3ZH0nLCBhbGxvd0FnZW50Q2xpVGl0bGU6IGZhbHNlIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgc2hlbGxUeXBlOiBHZW5lcmFsU2hlbGxUeXBlLkNvcGlsb3QsIHNlcXVlbmNlOiAnQ29waWxvdCBBZ2VudCcsIHByb2Nlc3NOYW1lOiAnY29waWxvdCcgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnY29waWxvdCcpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBwcm92aWRlIGN3ZEZvbGRlciBmb3IgYWxsIGN3ZHMgb25seSB3aGVuIGluIG11bHRpLXJvb3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyB+ICcsIHRpdGxlOiAnJHtwcm9jZXNzfSR7c2VwYXJhdG9yfSR7Y3dkRm9sZGVyfScsIGRlc2NyaXB0aW9uOiAnJHtjd2RGb2xkZXJ9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHByb2Nlc3NOYW1lOiAncHJvY2VzcycsIHdvcmtzcGFjZUZvbGRlcjogeyB1cmk6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6IFJPT1RfMSB9KSB9IGFzIElXb3Jrc3BhY2VGb2xkZXIsIGN3ZDogUk9PVF8xIH0pKTtcblx0XHRcdC8vIHNpbmdsZS1yb290LCBjd2QgaXMgc2FtZSBhcyByb290XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdwcm9jZXNzJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICcnKTtcblx0XHRcdC8vIG11bHRpLXJvb3Rcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHByb2Nlc3NOYW1lOiAncHJvY2VzcycsIHdvcmtzcGFjZUZvbGRlcjogeyB1cmk6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6IFJPT1RfMSB9KSB9IGFzIElXb3Jrc3BhY2VGb2xkZXIsIGN3ZDogUk9PVF8yIH0pKTtcblx0XHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAncHJvY2VzcycpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICcnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ3Byb2Nlc3MgfiByb290MicpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICdyb290MicpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBoaWRlIGN3ZEZvbGRlciBpbiBzaW5nbGUgZm9sZGVyIHdvcmtzcGFjZXMgd2hlbiBjd2QgbWF0Y2hlcyB0aGUgd29ya3NwYWNlXFwncyBkZWZhdWx0IGN3ZCBldmVuIHdoZW4gc2xhc2hlcyBkaWZmZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgfiAnLCB0aXRsZTogJyR7cHJvY2Vzc30ke3NlcGFyYXRvcn0ke2N3ZEZvbGRlcn0nLCBkZXNjcmlwdGlvbjogJyR7Y3dkRm9sZGVyfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3Byb2Nlc3MnLCB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiBST09UXzEgfSkgfSBhcyBJV29ya3NwYWNlRm9sZGVyLCBjd2Q6IFJPT1RfMSB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdwcm9jZXNzJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICcnKTtcblx0XHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIH4gJywgdGl0bGU6ICcke3Byb2Nlc3N9JHtzZXBhcmF0b3J9JHtjd2RGb2xkZXJ9JywgZGVzY3JpcHRpb246ICcke2N3ZEZvbGRlcn0nIH0gfSB9IH0pO1xuXHRcdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3Byb2Nlc3MnLCB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiBST09UXzEgfSkgfSBhcyBJV29ya3NwYWNlRm9sZGVyLCBjd2Q6IFJPT1RfMiB9KSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ3Byb2Nlc3MgfiByb290MicpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICdyb290MicpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0Q3dkUmVzb3VyY2UnLCAoKSA9PiB7XG5cdFx0bGV0IG1vY2tGaWxlU2VydmljZTogYW55O1xuXHRcdGxldCBtb2NrUGF0aFNlcnZpY2U6IGFueTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1vY2tUZXJtaW5hbEluc3RhbmNlKG9wdGlvbnM6IHtcblx0XHRcdGN3ZD86IHN0cmluZztcblx0XHRcdHJlbW90ZUF1dGhvcml0eT86IHN0cmluZztcblx0XHRcdGZpbGVFeGlzdHM/OiBib29sZWFuO1xuXHRcdFx0ZmlsZVNlcnZpY2VDYW5IYW5kbGU/OiBib29sZWFuO1xuXHRcdH0pOiBQaWNrPElUZXJtaW5hbEluc3RhbmNlLCAnZ2V0Q3dkUmVzb3VyY2UnIHwgJ2NhcGFiaWxpdGllcycgfCAncmVtb3RlQXV0aG9yaXR5Jz4ge1xuXHRcdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblxuXHRcdFx0aWYgKG9wdGlvbnMuY3dkKSB7XG5cdFx0XHRcdGNvbnN0IG1vY2tDd2REZXRlY3Rpb24gPSB7XG5cdFx0XHRcdFx0Z2V0Q3dkOiAoKSA9PiBvcHRpb25zLmN3ZFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24sIG1vY2tDd2REZXRlY3Rpb24gYXMgdW5rbm93biBhcyBJQ3dkRGV0ZWN0aW9uQ2FwYWJpbGl0eSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1vY2sgZmlsZSBzZXJ2aWNlXG5cdFx0XHRtb2NrRmlsZVNlcnZpY2UgPSB7XG5cdFx0XHRcdGNhbkhhbmRsZVJlc291cmNlOiBhc3luYyAoX3Jlc291cmNlOiBVUkkpID0+IG9wdGlvbnMuZmlsZVNlcnZpY2VDYW5IYW5kbGUgIT09IGZhbHNlLFxuXHRcdFx0XHRleGlzdHM6IGFzeW5jIChyZXNvdXJjZTogVVJJKSA9PiBvcHRpb25zLmZpbGVFeGlzdHMgIT09IGZhbHNlXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBNb2NrIHBhdGggc2VydmljZVxuXHRcdFx0bW9ja1BhdGhTZXJ2aWNlID0ge1xuXHRcdFx0XHRmaWxlVVJJOiBhc3luYyAocGF0aDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gVVJJLnBhcnNlKGB2c2NvZGUtcmVtb3RlOi8vJHtvcHRpb25zLnJlbW90ZUF1dGhvcml0eX0ke3BhdGh9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBVUkkuZmlsZShwYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzLFxuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0XHRhc3luYyBnZXRDd2RSZXNvdXJjZSgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRcdGNvbnN0IGN3ZCA9IHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKT8uZ2V0Q3dkKCk7XG5cdFx0XHRcdFx0aWYgKCFjd2QpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxldCByZXNvdXJjZTogVVJJO1xuXHRcdFx0XHRcdGlmICh0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2UgPSBhd2FpdCBtb2NrUGF0aFNlcnZpY2UuZmlsZVVSSShjd2QpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZSA9IFVSSS5maWxlKGN3ZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghYXdhaXQgbW9ja0ZpbGVTZXJ2aWNlLmNhbkhhbmRsZVJlc291cmNlKHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGF3YWl0IG1vY2tGaWxlU2VydmljZS5leGlzdHMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBubyBDd2REZXRlY3Rpb24gY2FwYWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gY3JlYXRlTW9ja1Rlcm1pbmFsSW5zdGFuY2Uoe30pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YW5jZS5nZXRDd2RSZXNvdXJjZSgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBDd2REZXRlY3Rpb24gY2FwYWJpbGl0eSByZXR1cm5zIG5vIGN3ZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gY3JlYXRlTW9ja1Rlcm1pbmFsSW5zdGFuY2UoeyBjd2Q6IHVuZGVmaW5lZCB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gVVJJLmZpbGUgZm9yIGxvY2FsIHRlcm1pbmFsIHdoZW4gZmlsZSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0Q3dkID0gJy90ZXN0L3BhdGgnO1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBjcmVhdGVNb2NrVGVybWluYWxJbnN0YW5jZSh7IGN3ZDogdGVzdEN3ZCwgZmlsZUV4aXN0czogdHJ1ZSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uc2NoZW1lLCAnZmlsZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5wYXRoLCB0ZXN0Q3dkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gZmlsZSBkb2VzIG5vdCBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RDd2QgPSAnL3Rlc3Qvbm9uZXhpc3RlbnQnO1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBjcmVhdGVNb2NrVGVybWluYWxJbnN0YW5jZSh7IGN3ZDogdGVzdEN3ZCwgZmlsZUV4aXN0czogZmFsc2UgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbmNlLmdldEN3ZFJlc291cmNlKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIHBhdGhTZXJ2aWNlLmZpbGVVUkkgZm9yIHJlbW90ZSB0ZXJtaW5hbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RDd2QgPSAnL3Rlc3QvcmVtb3RlL3BhdGgnO1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBjcmVhdGVNb2NrVGVybWluYWxJbnN0YW5jZSh7XG5cdFx0XHRcdGN3ZDogdGVzdEN3ZCxcblx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiAndGVzdC1yZW1vdGUnLFxuXHRcdFx0XHRmaWxlRXhpc3RzOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uc2NoZW1lLCAndnNjb2RlLXJlbW90ZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5hdXRob3JpdHksICd0ZXN0LXJlbW90ZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5wYXRoLCB0ZXN0Q3dkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgV2luZG93cyBwYXRocyBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0Q3dkID0gaXNXaW5kb3dzID8gJ0M6XFxcXHRlc3RcXFxccGF0aCcgOiAnL3Rlc3QvcGF0aCc7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGNyZWF0ZU1vY2tUZXJtaW5hbEluc3RhbmNlKHsgY3dkOiB0ZXN0Q3dkLCBmaWxlRXhpc3RzOiB0cnVlIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YW5jZS5nZXRDd2RSZXNvdXJjZSgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5zY2hlbWUsICdmaWxlJyk7XG5cdFx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8ucGF0aCwgJy9DOi90ZXN0L3BhdGgnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8ucGF0aCwgdGVzdEN3ZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IGN3ZCBzdHJpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGNyZWF0ZU1vY2tUZXJtaW5hbEluc3RhbmNlKHsgY3dkOiAnJyB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gZmlsZVNlcnZpY2UgY2Fubm90IGhhbmRsZSB0aGUgcmVzb3VyY2UgKFZTIENvZGUgd2ViIEVOT1BSTyBzY2VuYXJpbyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTaW11bGF0ZXMgc2VydmVyLWxpbnV4LXg2NC13ZWIgd2hlcmUgcmVtb3RlQXV0aG9yaXR5IGlzIGZhbHN5IGZyb20gdGhlXG5cdFx0XHQvLyB0ZXJtaW5hbCdzIHBlcnNwZWN0aXZlLCBzbyBVUkkuZmlsZSgpIGlzIHByb2R1Y2VkIGJ1dCB0aGUgYnJvd3NlclxuXHRcdFx0Ly8gRmlsZVNlcnZpY2UgaGFzIG5vIGZpbGU6Ly8gcHJvdmlkZXIgcmVnaXN0ZXJlZC5cblx0XHRcdGNvbnN0IHRlc3RDd2QgPSAnL3dvcmtzcGFjZS9teS1wcm9qZWN0Jztcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gY3JlYXRlTW9ja1Rlcm1pbmFsSW5zdGFuY2Uoe1xuXHRcdFx0XHRjd2Q6IHRlc3RDd2QsXG5cdFx0XHRcdGZpbGVFeGlzdHM6IHRydWUsXG5cdFx0XHRcdGZpbGVTZXJ2aWNlQ2FuSGFuZGxlOiBmYWxzZSAgLy8gZmlsZTovLyBwcm92aWRlciBhYnNlbnRcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YW5jZS5nZXRDd2RSZXNvdXJjZSgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDakQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVcsdUJBQWlEO0FBQ3JFLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywwQkFBd0Q7QUFDakUsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQkFBMkQsZ0JBQWdCLHdCQUF3Qix3QkFBc0c7QUFDbE4sU0FBUyxnQ0FBa0Q7QUFDM0QsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQkFBa0QsMEJBQTBCLHdCQUF3QjtBQUM3RyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGlCQUFpQixrQkFBa0IsNkJBQTZCO0FBQ3pFLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsaUNBQWlDLGNBQWMs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QUFNLFNBQVMsZUFBZTtBQUM3QyxrQkFBWSxRQUFRLFFBQVEsTUFBTTtBQUNsQyxrQkFBWSxRQUFRLE1BQU0sT0FBTztBQUFBLElBQ2xDLENBQUM7QUFFRCxTQUFLLG9EQUFvRCxZQUFZO0FBQ3BFLFlBQU0sVUFBVTtBQUNoQixZQUFNLFdBQVcsMkJBQTJCLEVBQUUsS0FBSyxTQUFTLFlBQVksTUFBTSxDQUFDO0FBRS9FLFlBQU0sU0FBUyxNQUFNLFNBQVMsZUFBZTtBQUM3QyxrQkFBWSxRQUFRLE1BQVM7QUFBQSxJQUM5QixDQUFDO0FBRUQsU0FBSyxzREFBc0QsWUFBWTtBQUN0RSxZQUFNLFVBQVU7QUFDaEIsWUFBTSxXQUFXLDJCQUEyQjtBQUFBLFFBQzNDLEtBQUs7QUFBQSxRQUNMLGlCQUFpQjtBQUFBLFFBQ2pCLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFFRCxZQUFNLFNBQVMsTUFBTSxTQUFTLGVBQWU7QUFDN0Msa0JBQVksUUFBUSxRQUFRLGVBQWU7QUFDM0Msa0JBQVksUUFBUSxXQUFXLGFBQWE7QUFDNUMsa0JBQVksUUFBUSxNQUFNLE9BQU87QUFBQSxJQUNsQyxDQUFDO0FBRUQsU0FBSyx5Q0FBeUMsWUFBWTtBQUN6RCxZQUFNLFVBQVUsWUFBWSxtQkFBbUI7QUFDL0MsWUFBTSxXQUFXLDJCQUEyQixFQUFFLEtBQUssU0FBUyxZQUFZLEtBQUssQ0FBQztBQUU5RSxZQUFNLFNBQVMsTUFBTSxTQUFTLGVBQWU7QUFDN0Msa0JBQVksUUFBUSxRQUFRLE1BQU07QUFDbEMsVUFBSSxXQUFXO0FBQ2Qsb0JBQVksUUFBUSxNQUFNLGVBQWU7QUFBQSxNQUMxQyxPQUFPO0FBQ04sb0JBQVksUUFBUSxNQUFNLE9BQU87QUFBQSxNQUNsQztBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssa0NBQWtDLFlBQVk7QUFDbEQsWUFBTSxXQUFXLDJCQUEyQixFQUFFLEtBQUssR0FBRyxDQUFDO0FBRXZELFlBQU0sU0FBUyxNQUFNLFNBQVMsZUFBZTtBQUM3QyxrQkFBWSxRQUFRLE1BQVM7QUFBQSxJQUM5QixDQUFDO0FBRUQsU0FBSyxxR0FBcUcsWUFBWTtBQUlySCxZQUFNLFVBQVU7QUFDaEIsWUFBTSxXQUFXLDJCQUEyQjtBQUFBLFFBQzNDLEtBQUs7QUFBQSxRQUNMLFlBQVk7QUFBQSxRQUNaLHNCQUFzQjtBQUFBO0FBQUEsTUFDdkIsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLFNBQVMsZUFBZTtBQUM3QyxrQkFBWSxRQUFRLE1BQVM7QUFBQSxJQUM5QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiY2FwYWJpbGl0aWVzIl0KfQo=
