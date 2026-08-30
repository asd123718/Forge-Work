import { deepStrictEqual, ok, strictEqual } from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { OperatingSystem } from "../../../../base/common/platform.js";
import { arch } from "../../../../base/common/process.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IFileService } from "../../../files/common/files.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { AgentNetworkDomainSettingId } from "../../../networkFilter/common/settings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../common/settings.js";
import { TerminalSandboxEngine } from "../../common/terminalSandboxEngine.js";
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from "../../common/terminalSandboxMxcRuntime.js";
import { TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from "../../common/terminalSandboxService.js";
suite("TerminalSandboxEngine", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let sandboxSettings;
  let sandboxSettingsEmitter;
  let fileService;
  let createdFiles;
  let createFileCount;
  let createdFolders;
  function setSandboxSetting(key, value) {
    sandboxSettings.set(key, value);
    sandboxSettingsEmitter.fire();
  }
  class MockFileService {
    constructor() {
      this._realpaths = /* @__PURE__ */ new Map();
    }
    setRealpath(path, realpath) {
      this._realpaths.set(path, realpath);
    }
    async realpath(uri) {
      const realpath = this._realpaths.get(uri.path);
      return realpath ? uri.with({ path: realpath }) : void 0;
    }
    async createFile(uri, content) {
      createFileCount++;
      const contentString = content.toString();
      createdFiles.set(uri.path, contentString);
      createdFiles.set(uri.fsPath, contentString);
      if (/^\/[a-zA-Z]:/.test(uri.path)) {
        createdFiles.set(uri.path.slice(1).replace(/\//g, "\\"), contentString);
      }
      return {};
    }
    async createFolder(uri) {
      createdFolders.push(uri.path);
      return {};
    }
    async del(_uri) {
    }
  }
  function buildMockWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName = "vscode-terminal-sandbox", containment = "process") {
    const clearPolicy = policy.filesystem?.clearPolicyOnExit ?? true;
    const network = {
      defaultPolicy: policy.network?.allowOutbound ? "allow" : "block",
      ...policy.network?.allowLocalNetwork !== void 0 ? { allowLocalNetwork: policy.network.allowLocalNetwork } : {},
      ...policy.network ? { enforcementMode: "capabilities" } : {}
    };
    return {
      version: policy.version,
      containerId: containerName,
      containment,
      lifecycle: {
        destroyOnExit: true,
        preservePolicy: !clearPolicy
      },
      process: {
        commandLine,
        cwd: workingDirectory,
        timeout: policy.timeoutMs ?? 0
      },
      processContainer: {
        leastPrivilege: false,
        capabilities: policy.network?.allowOutbound ? ["internetClient"] : [],
        ui: {
          isolation: "container",
          desktopSystemControl: false,
          systemSettings: "none",
          ime: false
        }
      },
      filesystem: {
        readwritePaths: [...policy.filesystem?.readwritePaths ?? []],
        readonlyPaths: [...policy.filesystem?.readonlyPaths ?? []],
        deniedPaths: [...policy.filesystem?.deniedPaths ?? []]
      },
      network,
      ui: {
        disable: !(policy.ui?.allowWindows ?? false),
        clipboard: policy.ui?.clipboard ?? "none",
        injection: policy.ui?.allowInputInjection ?? false
      }
    };
  }
  function createHost(overrides = {}) {
    const rootsEmitter = new Emitter();
    const defaultRuntime = {
      appRoot: "/app",
      execPath: "/app/node",
      runAsNode: false
    };
    const host = {
      getOS: () => Promise.resolve(OperatingSystem.Linux),
      getRuntimeInfo: () => Promise.resolve(defaultRuntime),
      getUserHome: () => Promise.resolve(URI.file("/home/user")),
      getSandboxTempDir: () => Promise.resolve(URI.file("/home/user/.test-data/tmp")),
      getWorkspaceStorageReadRoot: () => Promise.resolve(void 0),
      getWriteRoots: () => [URI.file("/workspace")],
      onDidChangeRoots: rootsEmitter.event,
      checkSandboxDependencies: () => Promise.resolve({ bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true }),
      getWindowsMxcFilesystemPolicy: () => Promise.resolve(void 0),
      getWindowsMxcEnvironment: () => Promise.resolve(void 0),
      buildWindowsMxcSandboxPayload: (commandLine, policy, workingDirectory, containerName, containment) => Promise.resolve(buildMockWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment)),
      getSandboxSetting: (settingId) => sandboxSettings.has(settingId) ? sandboxSettings.get(settingId) : void 0,
      onDidChangeSandboxSettings: sandboxSettingsEmitter.event,
      ...overrides
    };
    return Object.assign(host, { rootsEmitter });
  }
  function createWindowsHost(overrides = {}) {
    return createHost({
      getOS: () => Promise.resolve(OperatingSystem.Windows),
      getRuntimeInfo: () => Promise.resolve({ appRoot: "C:\\app", arch: "x64" }),
      getUserHome: () => Promise.resolve(URI.from({ scheme: "file", path: "/c:/Users/user" })),
      getSandboxTempDir: () => Promise.resolve(URI.from({ scheme: "file", path: "/c:/Users/user/.test-data/tmp" })),
      getWorkspaceStorageReadRoot: () => Promise.resolve(URI.from({ scheme: "file", path: "/c:/Users/user/workspaceStorage/workspace-id" })),
      getWriteRoots: () => [URI.from({ scheme: "file", path: "/c:/workspace" })],
      getWindowsMxcFilesystemPolicy: () => Promise.resolve({ readonlyPaths: ["C:\\tools\\node", "C:\\tools\\python", "C:\\Users\\user\\AppData\\Local\\Programs\\Git"], readwritePaths: ["C:\\Users\\user\\AppData\\Local\\Temp"] }),
      getWindowsMxcEnvironment: () => Promise.resolve([
        "SystemRoot=C:\\Windows",
        "PATH=C:\\tools\\node;C:\\Windows\\System32",
        "ComSpec=C:\\Windows\\System32\\cmd.exe",
        "PATHEXT=.COM;.EXE;.BAT;.CMD;.PS1",
        "PSModulePath=C:\\Users\\user\\Documents\\PowerShell\\Modules;C:\\Program Files\\PowerShell\\Modules",
        "USERPROFILE=C:\\Users\\user",
        "APPDATA=C:\\Users\\user\\AppData\\Roaming",
        "LOCALAPPDATA=C:\\Users\\user\\AppData\\Local",
        "PSHOME=C:\\Program Files\\PowerShell\\7"
      ]),
      ...overrides
    });
  }
  function normalizeWindowsPathForAssert(path) {
    return path.replace(/\\/g, "/").toLowerCase();
  }
  function enableWindowsSandbox() {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsEnabled, AgentSandboxEnabledValue.On);
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork, true);
  }
  setup(() => {
    createdFiles = /* @__PURE__ */ new Map();
    createFileCount = 0;
    createdFolders = [];
    instantiationService = store.add(new TestInstantiationService());
    sandboxSettings = /* @__PURE__ */ new Map();
    sandboxSettingsEmitter = store.add(new Emitter());
    fileService = new MockFileService();
    sandboxSettings.set(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
    sandboxSettings.set(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
  });
  test("runAsNode=true prefixes the wrapped command with ELECTRON_RUN_AS_NODE=1", async () => {
    const host = createHost({
      getRuntimeInfo: () => Promise.resolve({ appRoot: "/app", execPath: "/app/electron", runAsNode: true })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.getSandboxConfigPath();
    const wrapped = await engine.wrapCommand("echo hi");
    strictEqual(wrapped.isSandboxWrapped, true);
    ok(wrapped.command.startsWith("ELECTRON_RUN_AS_NODE=1 "), `Expected ELECTRON_RUN_AS_NODE=1 prefix. Actual: ${wrapped.command}`);
  });
  test("runAsNode=false omits the ELECTRON_RUN_AS_NODE=1 prefix", async () => {
    const host = createHost({
      getRuntimeInfo: () => Promise.resolve({ appRoot: "/app", execPath: "/app/node", runAsNode: false })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.getSandboxConfigPath();
    const wrapped = await engine.wrapCommand("echo hi");
    strictEqual(wrapped.isSandboxWrapped, true);
    ok(!wrapped.command.startsWith("ELECTRON_RUN_AS_NODE="), `Did not expect ELECTRON_RUN_AS_NODE prefix. Actual: ${wrapped.command}`);
  });
  test("wrapCommand adds ripgrep-universal platform-arch bin directory to PATH", async () => {
    const host = createHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.getSandboxConfigPath();
    const wrapped = await engine.wrapCommand("echo hi");
    ok(wrapped.command.includes(`/app/node_modules/@vscode/ripgrep-universal/bin/linux-${arch}`), `Expected ripgrep-universal platform-arch path in command. Actual: ${wrapped.command}`);
  });
  test("sandbox config enables PTY access by default on macOS", async () => {
    const host = createHost({ getOS: () => Promise.resolve(OperatingSystem.Macintosh) });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(config.allowPty, true);
  });
  test("sandbox config does not enable PTY access by default on Linux", async () => {
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(Object.prototype.hasOwnProperty.call(config, "allowPty"), false);
  });
  test("sandbox config respects explicitly disabled PTY access on macOS", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime, { allowPty: false });
    const host = createHost({ getOS: () => Promise.resolve(OperatingSystem.Macintosh) });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(config.allowPty, false);
  });
  test("sandbox config preserves advanced runtime network settings when allowNetwork is enabled", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork, true);
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime, {
      network: {
        allowAllUnixSockets: true,
        enabled: true
      }
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    deepStrictEqual(config.network, {
      allowedDomains: [],
      deniedDomains: [],
      enabled: false,
      allowAllUnixSockets: true
    });
  });
  test("requestAllowNetwork keeps the command sandboxed and refreshes its network config", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const wrapped = await engine.wrapCommand("curl https://example.com", false, "bash", void 0, void 0, true);
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const unrestrictedConfig = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.isSandboxWrapped, true);
    strictEqual(wrapped.requiresAllowNetworkConfirmation, true);
    deepStrictEqual(unrestrictedConfig.network, { allowedDomains: [], deniedDomains: [], enabled: false });
    await engine.wrapCommand("echo restricted again");
    const restrictedConfig = JSON.parse(createdFiles.get(configPath));
    deepStrictEqual(restrictedConfig.network, { allowedDomains: [], deniedDomains: [] });
  });
  test("requestAllowNetwork does not relax network access when per-command requests are disabled", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, false);
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const wrapped = await engine.wrapCommand("curl https://example.com", false, "bash", void 0, void 0, true);
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.isSandboxWrapped, true);
    strictEqual(wrapped.requiresAllowNetworkConfirmation, void 0);
    deepStrictEqual(config.network, { allowedDomains: [], deniedDomains: [] });
  });
  test("unsandboxed retry preserves the original working directory on Linux", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    await engine.getSandboxConfigPath();
    const wrapped = await engine.wrapCommand("pwd", true, "bash", URI.file("/workspace/with spaces"));
    strictEqual(wrapped.isSandboxWrapped, false);
    ok(wrapped.command.includes(`/workspace/with spaces`), `Expected the unsandboxed command to include cwd. Actual: ${wrapped.command}`);
    ok(wrapped.command.includes(`&& pwd`), `Expected the unsandboxed command to change to cwd before execution. Actual: ${wrapped.command}`);
  });
  test("blocked domains request sandboxed network access before execution when enabled", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
    setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ["example.com"]);
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const wrapped = await engine.wrapCommand("curl https://example.com", false, "bash");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.isSandboxWrapped, true);
    strictEqual(wrapped.requiresAllowNetworkConfirmation, true);
    deepStrictEqual(wrapped.blockedDomains, ["example.com"]);
    deepStrictEqual(wrapped.deniedDomains, ["example.com"]);
    deepStrictEqual(config.network, { allowedDomains: [], deniedDomains: [], enabled: false });
  });
  test("onDidChangeRoots triggers a sandbox config rewrite on the next wrap", async () => {
    let writeRoots = [URI.file("/workspace-a")];
    const host = createHost({
      getWriteRoots: () => writeRoots
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.getSandboxConfigPath();
    await engine.wrapCommand("echo a");
    const initialWriteCount = createFileCount;
    writeRoots = [URI.file("/workspace-b")];
    host.rootsEmitter.fire();
    await engine.wrapCommand("echo b");
    ok(createFileCount > initialWriteCount, `Expected sandbox config to be rewritten after onDidChangeRoots (initial=${initialWriteCount}, after=${createFileCount})`);
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    ok(config.filesystem.allowWrite.includes("/workspace-b"), "Refreshed config should include the new write root");
    ok(!config.filesystem.allowWrite.includes("/workspace-a"), "Refreshed config should drop the old write root");
  });
  test("always denies reads of the sandbox config file on Linux and macOS", async () => {
    for (const os of [OperatingSystem.Linux, OperatingSystem.Macintosh]) {
      const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost({
        getOS: () => Promise.resolve(os)
      })));
      const configPath = await engine.getSandboxConfigPath();
      ok(configPath, "Config path should be defined");
      const tempDirPath = engine.getTempDir()?.path;
      ok(tempDirPath, "Temp dir path should be defined");
      const config = JSON.parse(createdFiles.get(configPath));
      deepStrictEqual({
        denyRead: config.filesystem.denyRead.includes(configPath),
        configAllowWrite: config.filesystem.allowWrite.includes(configPath),
        tempDirAllowWrite: config.filesystem.allowWrite.includes(tempDirPath)
      }, {
        denyRead: true,
        configAllowWrite: false,
        tempDirAllowWrite: true
      });
    }
  });
  test("preserves filesystem symlink paths and resolves their targets on Linux when writing the config", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowRead: ["~/read-link"],
      allowWrite: ["/write-link"],
      denyRead: ["~/deny-read-link"],
      denyWrite: ["/deny-write-link"]
    });
    fileService.setRealpath("/workspace-link", "/real/workspace");
    fileService.setRealpath("/write-link", "/real/write");
    fileService.setRealpath("/home/user/read-link", "/real/read");
    fileService.setRealpath("/home/user/deny-read-link", "/real/deny-read");
    fileService.setRealpath("/deny-write-link", "/real/deny-write");
    fileService.setRealpath("/home/user/.gnupg", "/real/gnupg");
    const host = createHost({
      getWriteRoots: () => [URI.file("/workspace-link")]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("git commit -S", false, void 0, void 0, [{ keyword: "git", args: ["commit", "-S"] }]);
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    ok(config.filesystem.allowWrite.includes("/workspace-link"), "Workspace write root symlink should be preserved");
    ok(config.filesystem.allowWrite.includes("/real/workspace"), "Workspace write root symlink target should be included");
    ok(config.filesystem.allowWrite.includes("/write-link"), "Configured allowWrite symlink should be preserved");
    ok(config.filesystem.allowWrite.includes("/real/write"), "Configured allowWrite symlink target should be included");
    ok(config.filesystem.allowRead.includes("/home/user/read-link"), "Configured allowRead should expand ~ and preserve the symlink");
    ok(config.filesystem.allowRead.includes("/real/read"), "Configured allowRead symlink target should be included");
    ok(config.filesystem.allowRead.includes("/home/user/.gnupg"), "Command runtime allowRead symlink should be preserved");
    ok(config.filesystem.allowRead.includes("/real/gnupg"), "Command runtime allowRead symlink target should be included");
    ok(config.filesystem.allowWrite.includes("/home/user/.gnupg"), "Command runtime allowWrite symlink should be preserved");
    ok(config.filesystem.allowWrite.includes("/real/gnupg"), "Command runtime allowWrite symlink target should be included");
    ok(config.filesystem.denyRead.includes("/home/user/deny-read-link"), "Configured denyRead should expand ~ and preserve the symlink");
    ok(config.filesystem.denyRead.includes("/real/deny-read"), "Configured denyRead symlink target should be included");
    ok(config.filesystem.denyWrite.includes("/deny-write-link"), "Configured denyWrite symlink should be preserved");
    ok(config.filesystem.denyWrite.includes("/real/deny-write"), "Configured denyWrite symlink target should be included");
  });
  test("keeps filesystem paths without symlinks when writing the config", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowRead: ["~/read-plain"],
      allowWrite: ["/write-plain"],
      denyRead: ["~/deny-read-plain"],
      denyWrite: ["/deny-write-plain"]
    });
    const host = createHost({
      getWriteRoots: () => [URI.file("/workspace-plain")]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    ok(config.filesystem.allowWrite.includes("/workspace-plain"), "Workspace write root without symlink should be preserved");
    ok(config.filesystem.allowWrite.includes("/write-plain"), "Configured allowWrite without symlink should be preserved");
    ok(config.filesystem.allowRead.includes("/home/user/read-plain"), "Configured allowRead without symlink should expand ~ and be preserved");
    ok(config.filesystem.denyRead.includes("/home/user/deny-read-plain"), "Configured denyRead without symlink should expand ~ and be preserved");
    ok(config.filesystem.denyWrite.includes("/deny-write-plain"), "Configured denyWrite without symlink should be preserved");
  });
  test("checkFileAccess validates write paths against allowWrite and denyWrite on Linux", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowWrite: ["/configured/write", "/glob/**/*.ts"],
      denyWrite: ["/workspace/blocked"]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const result = await engine.checkFileAccess("write", [
      "/workspace/file.txt",
      "/configured/write/file.txt",
      "/glob/nested/file.ts",
      "/outside/file.txt",
      "/workspace/blocked/file.txt"
    ]);
    deepStrictEqual(result, {
      allowed: false,
      denied: ["/outside/file.txt", "/workspace/blocked/file.txt"]
    });
  });
  test("checkFileAccess validates read paths against denyRead and allowRead on Linux", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowRead: ["~/.allowed-read"],
      allowWrite: ["~/.allowed-write"]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const result = await engine.checkFileAccess("read", [
      "/home/user/private.txt",
      "/home/user/.allowed-read/config.json",
      "/home/user/.allowed-write/file.txt",
      "/etc/hosts"
    ]);
    deepStrictEqual(result, {
      allowed: false,
      denied: ["/home/user/private.txt"]
    });
  });
  test("checkFileAccess preserves symlink source and target permissions on Linux", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowWrite: ["/write-link"]
    });
    fileService.setRealpath("/write-link", "/real/write");
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    deepStrictEqual(await engine.checkFileAccess("write", ["/write-link/file.txt", "/real/write/file.txt"]), {
      allowed: true,
      denied: []
    });
  });
  test("cleanupTempDir is a no-op when no temp dir was ever created", async () => {
    const host = createHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
    strictEqual(engine.getTempDir(), void 0);
    await engine.cleanupTempDir();
  });
  test("precheck inputs can disable sandboxing when default approval permission is disabled", async () => {
    const host = createHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    strictEqual(await engine.isEnabled({ isDefaultApprovalPermissionEnabled: true }), true);
    strictEqual(await engine.isEnabled({ isDefaultApprovalPermissionEnabled: false }), false);
    strictEqual(await engine.isSandboxAllowNetworkEnabled({ isDefaultApprovalPermissionEnabled: false }), false);
    strictEqual(await engine.getSandboxConfigPath(false, { isDefaultApprovalPermissionEnabled: false }), void 0);
    deepStrictEqual(await engine.checkForSandboxingPrereqs(false, { isDefaultApprovalPermissionEnabled: false }), {
      enabled: false,
      sandboxConfigPath: void 0,
      failedCheck: void 0
    });
    strictEqual(createFileCount, 0, "Disabled sandbox precheck should not create sandbox config files");
  });
  test("isEnabled returns false on Windows when Windows sandbox setting is disabled by default", async () => {
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    strictEqual(await engine.isEnabled(), false);
    strictEqual(await engine.isSandboxAllowNetworkEnabled(), false);
    strictEqual(await engine.getSandboxConfigPath(), void 0);
  });
  test("isEnabled returns true on Windows when Windows sandbox setting is enabled even if global sandboxing is off", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
    enableWindowsSandbox();
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    strictEqual(await engine.isEnabled(), true);
    strictEqual(await engine.isSandboxAllowNetworkEnabled(), true);
  });
  test("enabledWindows on value does not enable allowNetwork on Windows", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsEnabled, AgentSandboxEnabledValue.On);
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    strictEqual(await engine.isEnabled(), true);
    strictEqual(await engine.isSandboxAllowNetworkEnabled(), false);
  });
  test("wrapCommand uses MXC executable and writes MXC config on Windows", async () => {
    enableWindowsSandbox();
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const wrapped = await engine.wrapCommand("echo hello", false, "C:\\Program Files\\PowerShell\\7\\pwsh.exe", URI.from({ scheme: "file", path: "/c:/workspace" }));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.isSandboxWrapped, true);
    ok(wrapped.command.startsWith(`& 'C:\\app\\node_modules\\@microsoft\\mxc-sdk\\bin\\x64\\wxc-exec.exe'`), `Expected MXC executable. Actual: ${wrapped.command}`);
    ok(wrapped.command.includes(` '${configPath}'`), `Expected wrapped command to pass the MXC config path. Actual: ${wrapped.command}`);
    strictEqual(config.version, "0.6.0-alpha");
    strictEqual(config.containment, "process");
    strictEqual(config.process.commandLine, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -Command "echo hello"');
    strictEqual(normalizeWindowsPathForAssert(config.process.cwd), "c:/workspace");
    strictEqual(config.ui.disable, false);
    ok(config.process.env.includes("SystemRoot=C:\\Windows"), "SystemRoot should be injected into the MXC process env");
    ok(config.process.env.includes("PATH=C:\\tools\\node;C:\\Windows\\System32"), "PATH should be injected into the MXC process env");
    ok(config.process.env.includes("ComSpec=C:\\Windows\\System32\\cmd.exe"), "ComSpec should be injected into the MXC process env");
    ok(config.process.env.includes("PATHEXT=.COM;.EXE;.BAT;.CMD;.PS1"), "PATHEXT should be injected into the MXC process env");
    ok(config.process.env.includes("PSModulePath=C:\\Users\\user\\Documents\\PowerShell\\Modules;C:\\Program Files\\PowerShell\\Modules"), "PSModulePath should be injected into the MXC process env");
    ok(config.process.env.includes("USERPROFILE=C:\\Users\\user"), "USERPROFILE should be injected into the MXC process env");
    ok(config.process.env.includes("APPDATA=C:\\Users\\user\\AppData\\Roaming"), "APPDATA should be injected into the MXC process env");
    ok(config.process.env.includes("LOCALAPPDATA=C:\\Users\\user\\AppData\\Local"), "LOCALAPPDATA should be injected into the MXC process env");
    ok(config.process.env.includes("PSHOME=C:\\Program Files\\PowerShell\\7"), "PSHOME should be injected into the MXC process env");
    deepStrictEqual(config.network, { defaultPolicy: "allow", enforcementMode: "capabilities" });
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/workspace"), "Workspace should be writable");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path).endsWith("/.test-data/tmp")), "Sandbox temp dir should be writable");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user/appdata/local/temp"), "MXC temporary files policy should add host temp path to writable paths");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path).endsWith("/.test-data/tmp")), "Sandbox temp dir should be readable through readonly paths");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/tools/node"), "MXC available tools policy should add tool paths to readonly paths");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/program files/powershell/7"), "Resolved PowerShell executable directory should be readable");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user/appdata/local/programs/git"), "MXC user profile policy should add user profile paths to readonly paths");
    ok(!config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user"), "User home should not be denied by default on Windows");
  });
  test("wrapCommand applies Windows filesystem setting to MXC config", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem, {
      allowWrite: ["C:/configured/write"],
      allowRead: ["C:/configured/read"],
      denyRead: ["C:/configured/secret"]
    });
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const serializedConfig = createdFiles.get(configPath);
    const config = JSON.parse(serializedConfig);
    ok(serializedConfig.includes("C:\\\\configured\\\\write"), "Configured Windows allowWrite path should be escaped in the serialized MXC config");
    ok(serializedConfig.includes("C:\\\\configured\\\\read"), "Configured Windows allowRead path should be escaped in the serialized MXC config");
    ok(serializedConfig.includes("C:\\\\configured\\\\secret"), "Configured Windows denyRead path should be escaped in the serialized MXC config");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/write"), "Configured Windows allowWrite path should be writable");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/read"), "Configured Windows allowRead path should be readonly");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user/appdata/local/temp"), "Host temp path from Windows policy should be writable");
    ok(config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/secret"), "Configured Windows denyRead path should be denied");
    ok(!config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user"), "User home should not be denied by default on Windows");
  });
  test("deduplicates Windows filesystem paths regardless of case or separator", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem, {
      allowWrite: ["C:/configured/write"],
      allowRead: ["C:\\configured\\read"],
      denyRead: ["C:/configured/secret", "c:\\configured\\secret"]
    });
    const host = createWindowsHost({
      getWindowsMxcFilesystemPolicy: () => Promise.resolve({
        readwritePaths: ["c:\\configured\\write"],
        readonlyPaths: ["c:/configured/read"]
      })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    const matchingPaths = (paths, expectedPath) => paths.filter((path) => normalizeWindowsPathForAssert(path) === expectedPath);
    deepStrictEqual({
      readwrite: matchingPaths(config.filesystem.readwritePaths, "c:/configured/write"),
      readonly: matchingPaths(config.filesystem.readonlyPaths, "c:/configured/read"),
      denied: matchingPaths(config.filesystem.deniedPaths, "c:/configured/secret")
    }, {
      readwrite: ["C:\\configured\\write"],
      readonly: ["C:\\configured\\read"],
      denied: ["C:\\configured\\secret"]
    });
  });
  test("deduplicates resolved Windows paths regardless of case or separator", async () => {
    enableWindowsSandbox();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createWindowsHost()));
    await engine.getOS();
    const resolveFileSystemPaths = engine._resolveFileSystemPaths.bind(engine);
    deepStrictEqual(await resolveFileSystemPaths([
      "C:/configured/path",
      "c:\\configured\\path",
      "C:\\configured\\other-path"
    ]), [
      "C:/configured/path",
      "C:\\configured\\other-path"
    ]);
  });
  test("wrapCommand applies configured Windows MXC schema version", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion, "0.5.0-alpha");
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createWindowsHost()));
    await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(config.version, "0.5.0-alpha");
  });
  test("preserves Windows filesystem symlink paths and resolves their targets when writing MXC config", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem, {
      allowWrite: ["C:\\configured\\write-link"],
      allowRead: ["C:\\configured\\read-link"],
      denyRead: ["C:\\configured\\secret-link"]
    });
    fileService.setRealpath("/c:/workspace-link", "/c:/real/workspace");
    fileService.setRealpath("/c:/configured/write-link", "/c:/real/configured-write");
    fileService.setRealpath("/c:/configured/read-link", "/c:/real/configured-read");
    fileService.setRealpath("/c:/configured/secret-link", "/c:/real/configured-secret");
    fileService.setRealpath("/c:/tools/node", "/c:/real/tools-node");
    const host = createWindowsHost({
      getWriteRoots: () => [URI.from({ scheme: "file", path: "/c:/workspace-link" })]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/workspace-link"), "Workspace write root symlink should be preserved on Windows");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/workspace"), "Workspace write root symlink target should be included on Windows");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/write-link"), "Configured Windows allowWrite symlink should be preserved");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/configured-write"), "Configured Windows allowWrite symlink target should be included");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/read-link"), "Configured Windows allowRead symlink should be preserved");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/configured-read"), "Configured Windows allowRead symlink target should be included");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/tools/node"), "Windows policy readonly symlink should be preserved");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/tools-node"), "Windows policy readonly symlink target should be included");
    ok(config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/secret-link"), "Configured Windows denyRead symlink should be preserved");
    ok(config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/configured-secret"), "Configured Windows denyRead symlink target should be included");
  });
  test("wrapCommand uses arm64 MXC executable on Windows arm64", async () => {
    enableWindowsSandbox();
    const host = createWindowsHost({
      getRuntimeInfo: () => Promise.resolve({ appRoot: "C:\\app", arch: "arm64" })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const wrapped = await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.command, `& 'C:\\app\\node_modules\\@microsoft\\mxc-sdk\\bin\\arm64\\wxc-exec.exe' '${configPath}'`);
    strictEqual(normalizeWindowsPathForAssert(config.process.cwd), "c:/workspace");
  });
  test("wrapCommand rewrites MXC config when Windows command changes", async () => {
    enableWindowsSandbox();
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("echo first", false, "C:\\Program Files\\PowerShell\\7\\pwsh.exe");
    let configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const firstCommandLine = JSON.parse(createdFiles.get(configPath)).process.commandLine;
    strictEqual(firstCommandLine, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -Command "echo first"');
    await engine.wrapCommand("echo second", false, "C:\\Program Files\\PowerShell\\7\\pwsh.exe");
    configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const secondCommandLine = JSON.parse(createdFiles.get(configPath)).process.commandLine;
    strictEqual(secondCommandLine, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -Command "echo second"');
  });
  test("allowNetwork maps to MXC allow network config on Windows", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsEnabled, AgentSandboxEnabledValue.On);
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork, true);
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("curl https://example.com", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    deepStrictEqual(config.network, { defaultPolicy: "allow", enforcementMode: "capabilities" });
  });
  test("Windows MXC config ignores unsupported network host lists", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentNetworkDomainSettingId.AllowedNetworkDomains, ["example.com"]);
    setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ["blocked.example.com"]);
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("curl https://example.com", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    deepStrictEqual(config.network, { defaultPolicy: "allow", enforcementMode: "capabilities" });
  });
  test("uses OS-specific filesystem absolute path detection", async () => {
    const linuxEngine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    await linuxEngine.getOS();
    const isLinuxAbsolutePath = linuxEngine._isAbsoluteFileSystemPath.bind(linuxEngine);
    strictEqual(isLinuxAbsolutePath("/home/user"), true);
    strictEqual(isLinuxAbsolutePath("relative/path"), false);
    strictEqual(isLinuxAbsolutePath("C:\\Users\\user"), false);
    const windowsEngine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost({ getOS: () => Promise.resolve(OperatingSystem.Windows) })));
    await windowsEngine.getOS();
    const isWindowsAbsolutePath = windowsEngine._isAbsoluteFileSystemPath.bind(windowsEngine);
    strictEqual(isWindowsAbsolutePath("/Users/user"), true);
    strictEqual(isWindowsAbsolutePath("C:\\Users\\user"), true);
    strictEqual(isWindowsAbsolutePath("C:/Users/user"), true);
    strictEqual(isWindowsAbsolutePath("\\\\server\\share"), true);
    strictEqual(isWindowsAbsolutePath("relative\\path"), false);
  });
  test("checkForSandboxingPrereqs reports missing dependencies", async () => {
    let status = { bubblewrapInstalled: false, bubblewrapUsable: false, socatInstalled: true, dependencyInstallCommand: "sudo pacman -S --needed --noconfirm" };
    const host = createHost({
      checkSandboxDependencies: () => Promise.resolve(status)
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const result = await engine.checkForSandboxingPrereqs();
    strictEqual(result.enabled, true);
    strictEqual(result.failedCheck, "dependencies");
    strictEqual(result.missingDependencies?.[0], "bubblewrap");
    strictEqual(result.canInstallMissingDependencies, true);
    status = { bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true };
    const result2 = await engine.checkForSandboxingPrereqs(true);
    strictEqual(result2.failedCheck, void 0);
  });
  test("checkForSandboxingPrereqs caches missing dependencies until force refresh", async () => {
    let callCount = 0;
    let status = { bubblewrapInstalled: false, bubblewrapUsable: false, socatInstalled: true };
    const host = createHost({
      checkSandboxDependencies: () => {
        callCount++;
        return Promise.resolve(status);
      }
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const first = await engine.checkForSandboxingPrereqs();
    const second = await engine.checkForSandboxingPrereqs();
    strictEqual(first.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies);
    strictEqual(second.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies);
    strictEqual(callCount, 1, "Missing dependencies should be checked once and cached");
    status = { bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true };
    const cached = await engine.checkForSandboxingPrereqs();
    strictEqual(cached.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies, "Non-forced checks should keep using the cached missing status");
    strictEqual(callCount, 1);
    const refreshed = await engine.checkForSandboxingPrereqs(true);
    strictEqual(refreshed.failedCheck, void 0);
    strictEqual(callCount, 2, "Force refresh should re-check dependencies after install or repair");
  });
  test("checkForSandboxingPrereqs reports remediation when bubblewrap is unusable", async () => {
    const host = createHost({
      checkSandboxDependencies: () => Promise.resolve({
        bubblewrapInstalled: true,
        bubblewrapUsable: false,
        bubblewrapError: "Creating new namespace failed",
        socatInstalled: true,
        apparmorRestrictsUnprivilegedUserNamespaces: true
      })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const result = await engine.checkForSandboxingPrereqs();
    strictEqual(result.failedCheck, TerminalSandboxPrerequisiteCheck.Bubblewrap);
    deepStrictEqual(result.remediations, [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]);
    strictEqual(result.detail, "Creating new namespace failed");
    strictEqual(result.missingDependencies, void 0);
  });
  test("checkForSandboxingPrereqs enables weaker nested sandbox when AppArmor is not restricting user namespaces", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime, { allowPty: false });
    const host = createHost({
      checkSandboxDependencies: () => Promise.resolve({
        bubblewrapInstalled: true,
        bubblewrapUsable: false,
        socatInstalled: true,
        apparmorRestrictsUnprivilegedUserNamespaces: false
      })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const result = await engine.checkForSandboxingPrereqs();
    const configPath = await engine.getSandboxConfigPath();
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(result.failedCheck, void 0);
    strictEqual(config.enableWeakerNestedSandbox, true);
    strictEqual(config.allowPty, false);
  });
  test("checkForSandboxingPrereqs enables weaker nested sandbox after AppArmor remediation does not fix bubblewrap", async () => {
    const host = createHost({
      checkSandboxDependencies: () => Promise.resolve({
        bubblewrapInstalled: true,
        bubblewrapUsable: false,
        socatInstalled: true,
        apparmorRestrictsUnprivilegedUserNamespaces: true
      })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const beforeRemediation = await engine.checkForSandboxingPrereqs();
    const afterRemediation = await engine.checkForSandboxingPrereqs(true);
    const config = JSON.parse(createdFiles.get(afterRemediation.sandboxConfigPath));
    strictEqual(beforeRemediation.failedCheck, TerminalSandboxPrerequisiteCheck.Bubblewrap);
    strictEqual(afterRemediation.failedCheck, void 0);
    strictEqual(config.enableWeakerNestedSandbox, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc2FuZGJveFxcdGVzdFxcY29tbW9uXFx0ZXJtaW5hbFNhbmRib3hFbmdpbmUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBhcmNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vbmV0d29ya0ZpbHRlci9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHR5cGUgeyBJU2FuZGJveERlcGVuZGVuY3lTdGF0dXMsIElXaW5kb3dzTXhjQ29uZmlnLCBJV2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3ksIElXaW5kb3dzTXhjUG9saWN5Q29udGFpbm1lbnQsIElXaW5kb3dzTXhjU2FuZGJveFBvbGljeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zYW5kYm94SGVscGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUsIEFnZW50U2FuZGJveFNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTYW5kYm94RW5naW5lSG9zdCwgSVRlcm1pbmFsU2FuZGJveFJ1bnRpbWVJbmZvLCBUZXJtaW5hbFNhbmRib3hFbmdpbmUgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxTYW5kYm94RW5naW5lLmpzJztcbmltcG9ydCB7IElXaW5kb3dzTXhjVGVybWluYWxTYW5kYm94UnVudGltZSwgV2luZG93c014Y1Rlcm1pbmFsU2FuZGJveFJ1bnRpbWUgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxTYW5kYm94TXhjUnVudGltZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjaywgVGVybWluYWxTYW5kYm94UHJlQ2hlY2tSZW1lZGlhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ1Rlcm1pbmFsU2FuZGJveEVuZ2luZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHNhbmRib3hTZXR0aW5nczogTWFwPHN0cmluZywgdW5rbm93bj47XG5cdGxldCBzYW5kYm94U2V0dGluZ3NFbWl0dGVyOiBFbWl0dGVyPHZvaWQ+O1xuXHRsZXQgZmlsZVNlcnZpY2U6IE1vY2tGaWxlU2VydmljZTtcblx0bGV0IGNyZWF0ZWRGaWxlczogTWFwPHN0cmluZywgc3RyaW5nPjtcblx0bGV0IGNyZWF0ZUZpbGVDb3VudDogbnVtYmVyO1xuXHRsZXQgY3JlYXRlZEZvbGRlcnM6IHN0cmluZ1tdO1xuXG5cdGZ1bmN0aW9uIHNldFNhbmRib3hTZXR0aW5nKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQge1xuXHRcdHNhbmRib3hTZXR0aW5ncy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0c2FuZGJveFNldHRpbmdzRW1pdHRlci5maXJlKCk7XG5cdH1cblxuXHRjbGFzcyBNb2NrRmlsZVNlcnZpY2Uge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlYWxwYXRocyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0XHRzZXRSZWFscGF0aChwYXRoOiBzdHJpbmcsIHJlYWxwYXRoOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdHRoaXMuX3JlYWxwYXRocy5zZXQocGF0aCwgcmVhbHBhdGgpO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJlYWxwYXRoKHVyaTogVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRcdGNvbnN0IHJlYWxwYXRoID0gdGhpcy5fcmVhbHBhdGhzLmdldCh1cmkucGF0aCk7XG5cdFx0XHRyZXR1cm4gcmVhbHBhdGggPyB1cmkud2l0aCh7IHBhdGg6IHJlYWxwYXRoIH0pIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGFzeW5jIGNyZWF0ZUZpbGUodXJpOiBVUkksIGNvbnRlbnQ6IFZTQnVmZmVyKTogUHJvbWlzZTxhbnk+IHtcblx0XHRcdGNyZWF0ZUZpbGVDb3VudCsrO1xuXHRcdFx0Y29uc3QgY29udGVudFN0cmluZyA9IGNvbnRlbnQudG9TdHJpbmcoKTtcblx0XHRcdGNyZWF0ZWRGaWxlcy5zZXQodXJpLnBhdGgsIGNvbnRlbnRTdHJpbmcpO1xuXHRcdFx0Y3JlYXRlZEZpbGVzLnNldCh1cmkuZnNQYXRoLCBjb250ZW50U3RyaW5nKTtcblx0XHRcdGlmICgvXlxcL1thLXpBLVpdOi8udGVzdCh1cmkucGF0aCkpIHtcblx0XHRcdFx0Y3JlYXRlZEZpbGVzLnNldCh1cmkucGF0aC5zbGljZSgxKS5yZXBsYWNlKC9cXC8vZywgJ1xcXFwnKSwgY29udGVudFN0cmluZyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGFzeW5jIGNyZWF0ZUZvbGRlcih1cmk6IFVSSSk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRjcmVhdGVkRm9sZGVycy5wdXNoKHVyaS5wYXRoKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0YXN5bmMgZGVsKF91cmk6IFVSSSk6IFByb21pc2U8dm9pZD4geyB9XG5cdH1cblxuXHRmdW5jdGlvbiBidWlsZE1vY2tXaW5kb3dzTXhjU2FuZGJveFBheWxvYWQoY29tbWFuZExpbmU6IHN0cmluZywgcG9saWN5OiBJV2luZG93c014Y1NhbmRib3hQb2xpY3ksIHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcsIGNvbnRhaW5lck5hbWU6IHN0cmluZyA9ICd2c2NvZGUtdGVybWluYWwtc2FuZGJveCcsIGNvbnRhaW5tZW50OiBJV2luZG93c014Y1BvbGljeUNvbnRhaW5tZW50ID0gJ3Byb2Nlc3MnKTogSVdpbmRvd3NNeGNDb25maWcge1xuXHRcdGNvbnN0IGNsZWFyUG9saWN5ID0gcG9saWN5LmZpbGVzeXN0ZW0/LmNsZWFyUG9saWN5T25FeGl0ID8/IHRydWU7XG5cdFx0Y29uc3QgbmV0d29yayA9IHtcblx0XHRcdGRlZmF1bHRQb2xpY3k6IHBvbGljeS5uZXR3b3JrPy5hbGxvd091dGJvdW5kID8gJ2FsbG93JyA6ICdibG9jaycgYXMgJ2FsbG93JyB8ICdibG9jaycsXG5cdFx0XHQuLi4ocG9saWN5Lm5ldHdvcms/LmFsbG93TG9jYWxOZXR3b3JrICE9PSB1bmRlZmluZWQgPyB7IGFsbG93TG9jYWxOZXR3b3JrOiBwb2xpY3kubmV0d29yay5hbGxvd0xvY2FsTmV0d29yayB9IDoge30pLFxuXHRcdFx0Li4uKHBvbGljeS5uZXR3b3JrID8geyBlbmZvcmNlbWVudE1vZGU6ICdjYXBhYmlsaXRpZXMnIGFzIGNvbnN0IH0gOiB7fSksXG5cdFx0fTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dmVyc2lvbjogcG9saWN5LnZlcnNpb24sXG5cdFx0XHRjb250YWluZXJJZDogY29udGFpbmVyTmFtZSxcblx0XHRcdGNvbnRhaW5tZW50LFxuXHRcdFx0bGlmZWN5Y2xlOiB7XG5cdFx0XHRcdGRlc3Ryb3lPbkV4aXQ6IHRydWUsXG5cdFx0XHRcdHByZXNlcnZlUG9saWN5OiAhY2xlYXJQb2xpY3ksXG5cdFx0XHR9LFxuXHRcdFx0cHJvY2Vzczoge1xuXHRcdFx0XHRjb21tYW5kTGluZSxcblx0XHRcdFx0Y3dkOiB3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHR0aW1lb3V0OiBwb2xpY3kudGltZW91dE1zID8/IDAsXG5cdFx0XHR9LFxuXHRcdFx0cHJvY2Vzc0NvbnRhaW5lcjoge1xuXHRcdFx0XHRsZWFzdFByaXZpbGVnZTogZmFsc2UsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogcG9saWN5Lm5ldHdvcms/LmFsbG93T3V0Ym91bmQgPyBbJ2ludGVybmV0Q2xpZW50J10gOiBbXSxcblx0XHRcdFx0dWk6IHtcblx0XHRcdFx0XHRpc29sYXRpb246ICdjb250YWluZXInLFxuXHRcdFx0XHRcdGRlc2t0b3BTeXN0ZW1Db250cm9sOiBmYWxzZSxcblx0XHRcdFx0XHRzeXN0ZW1TZXR0aW5nczogJ25vbmUnLFxuXHRcdFx0XHRcdGltZTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZmlsZXN5c3RlbToge1xuXHRcdFx0XHRyZWFkd3JpdGVQYXRoczogWy4uLihwb2xpY3kuZmlsZXN5c3RlbT8ucmVhZHdyaXRlUGF0aHMgPz8gW10pXSxcblx0XHRcdFx0cmVhZG9ubHlQYXRoczogWy4uLihwb2xpY3kuZmlsZXN5c3RlbT8ucmVhZG9ubHlQYXRocyA/PyBbXSldLFxuXHRcdFx0XHRkZW5pZWRQYXRoczogWy4uLihwb2xpY3kuZmlsZXN5c3RlbT8uZGVuaWVkUGF0aHMgPz8gW10pXSxcblx0XHRcdH0sXG5cdFx0XHRuZXR3b3JrLFxuXHRcdFx0dWk6IHtcblx0XHRcdFx0ZGlzYWJsZTogIShwb2xpY3kudWk/LmFsbG93V2luZG93cyA/PyBmYWxzZSksXG5cdFx0XHRcdGNsaXBib2FyZDogcG9saWN5LnVpPy5jbGlwYm9hcmQgPz8gJ25vbmUnLFxuXHRcdFx0XHRpbmplY3Rpb246IHBvbGljeS51aT8uYWxsb3dJbnB1dEluamVjdGlvbiA/PyBmYWxzZSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUhvc3Qob3ZlcnJpZGVzOiBQYXJ0aWFsPElUZXJtaW5hbFNhbmRib3hFbmdpbmVIb3N0PiA9IHt9KTogSVRlcm1pbmFsU2FuZGJveEVuZ2luZUhvc3QgJiB7IHJvb3RzRW1pdHRlcjogRW1pdHRlcjx2b2lkPiB9IHtcblx0XHRjb25zdCByb290c0VtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdGNvbnN0IGRlZmF1bHRSdW50aW1lOiBJVGVybWluYWxTYW5kYm94UnVudGltZUluZm8gPSB7XG5cdFx0XHRhcHBSb290OiAnL2FwcCcsXG5cdFx0XHRleGVjUGF0aDogJy9hcHAvbm9kZScsXG5cdFx0XHRydW5Bc05vZGU6IGZhbHNlLFxuXHRcdH07XG5cdFx0Y29uc3QgaG9zdDogSVRlcm1pbmFsU2FuZGJveEVuZ2luZUhvc3QgPSB7XG5cdFx0XHRnZXRPUzogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKE9wZXJhdGluZ1N5c3RlbS5MaW51eCksXG5cdFx0XHRnZXRSdW50aW1lSW5mbzogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKGRlZmF1bHRSdW50aW1lKSxcblx0XHRcdGdldFVzZXJIb21lOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoVVJJLmZpbGUoJy9ob21lL3VzZXInKSksXG5cdFx0XHRnZXRTYW5kYm94VGVtcERpcjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFVSSS5maWxlKCcvaG9tZS91c2VyLy50ZXN0LWRhdGEvdG1wJykpLFxuXHRcdFx0Z2V0V29ya3NwYWNlU3RvcmFnZVJlYWRSb290OiAoKSA9PiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHRcdGdldFdyaXRlUm9vdHM6ICgpID0+IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpXSxcblx0XHRcdG9uRGlkQ2hhbmdlUm9vdHM6IHJvb3RzRW1pdHRlci5ldmVudCxcblx0XHRcdGNoZWNrU2FuZGJveERlcGVuZGVuY2llczogKCk6IFByb21pc2U8SVNhbmRib3hEZXBlbmRlbmN5U3RhdHVzIHwgdW5kZWZpbmVkPiA9PiBQcm9taXNlLnJlc29sdmUoeyBidWJibGV3cmFwSW5zdGFsbGVkOiB0cnVlLCBidWJibGV3cmFwVXNhYmxlOiB0cnVlLCBzb2NhdEluc3RhbGxlZDogdHJ1ZSB9KSxcblx0XHRcdGdldFdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5OiAoKTogUHJvbWlzZTxJV2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3kgfCB1bmRlZmluZWQ+ID0+IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpLFxuXHRcdFx0Z2V0V2luZG93c014Y0Vudmlyb25tZW50OiAoKTogUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4gPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCksXG5cdFx0XHRidWlsZFdpbmRvd3NNeGNTYW5kYm94UGF5bG9hZDogKGNvbW1hbmRMaW5lLCBwb2xpY3ksIHdvcmtpbmdEaXJlY3RvcnksIGNvbnRhaW5lck5hbWUsIGNvbnRhaW5tZW50KTogUHJvbWlzZTxJV2luZG93c014Y0NvbmZpZyB8IHVuZGVmaW5lZD4gPT4gUHJvbWlzZS5yZXNvbHZlKGJ1aWxkTW9ja1dpbmRvd3NNeGNTYW5kYm94UGF5bG9hZChjb21tYW5kTGluZSwgcG9saWN5LCB3b3JraW5nRGlyZWN0b3J5LCBjb250YWluZXJOYW1lLCBjb250YWlubWVudCkpLFxuXHRcdFx0Z2V0U2FuZGJveFNldHRpbmc6IDxUPihzZXR0aW5nSWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQgPT4gc2FuZGJveFNldHRpbmdzLmhhcyhzZXR0aW5nSWQpID8gc2FuZGJveFNldHRpbmdzLmdldChzZXR0aW5nSWQpIGFzIFQgOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZENoYW5nZVNhbmRib3hTZXR0aW5nczogc2FuZGJveFNldHRpbmdzRW1pdHRlci5ldmVudCxcblx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHR9O1xuXHRcdHJldHVybiBPYmplY3QuYXNzaWduKGhvc3QsIHsgcm9vdHNFbWl0dGVyIH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlV2luZG93c0hvc3Qob3ZlcnJpZGVzOiBQYXJ0aWFsPElUZXJtaW5hbFNhbmRib3hFbmdpbmVIb3N0PiA9IHt9KTogSVRlcm1pbmFsU2FuZGJveEVuZ2luZUhvc3QgJiB7IHJvb3RzRW1pdHRlcjogRW1pdHRlcjx2b2lkPiB9IHtcblx0XHRyZXR1cm4gY3JlYXRlSG9zdCh7XG5cdFx0XHRnZXRPUzogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSxcblx0XHRcdGdldFJ1bnRpbWVJbmZvOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoeyBhcHBSb290OiAnQzpcXFxcYXBwJywgYXJjaDogJ3g2NCcgfSksXG5cdFx0XHRnZXRVc2VySG9tZTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvYzovVXNlcnMvdXNlcicgfSkpLFxuXHRcdFx0Z2V0U2FuZGJveFRlbXBEaXI6ICgpID0+IFByb21pc2UucmVzb2x2ZShVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiAnL2M6L1VzZXJzL3VzZXIvLnRlc3QtZGF0YS90bXAnIH0pKSxcblx0XHRcdGdldFdvcmtzcGFjZVN0b3JhZ2VSZWFkUm9vdDogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvYzovVXNlcnMvdXNlci93b3Jrc3BhY2VTdG9yYWdlL3dvcmtzcGFjZS1pZCcgfSkpLFxuXHRcdFx0Z2V0V3JpdGVSb290czogKCkgPT4gW1VSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvYzovd29ya3NwYWNlJyB9KV0sXG5cdFx0XHRnZXRXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHsgcmVhZG9ubHlQYXRoczogWydDOlxcXFx0b29sc1xcXFxub2RlJywgJ0M6XFxcXHRvb2xzXFxcXHB5dGhvbicsICdDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXEFwcERhdGFcXFxcTG9jYWxcXFxcUHJvZ3JhbXNcXFxcR2l0J10sIHJlYWR3cml0ZVBhdGhzOiBbJ0M6XFxcXFVzZXJzXFxcXHVzZXJcXFxcQXBwRGF0YVxcXFxMb2NhbFxcXFxUZW1wJ10gfSksXG5cdFx0XHRnZXRXaW5kb3dzTXhjRW52aXJvbm1lbnQ6ICgpID0+IFByb21pc2UucmVzb2x2ZShbXG5cdFx0XHRcdCdTeXN0ZW1Sb290PUM6XFxcXFdpbmRvd3MnLFxuXHRcdFx0XHQnUEFUSD1DOlxcXFx0b29sc1xcXFxub2RlO0M6XFxcXFdpbmRvd3NcXFxcU3lzdGVtMzInLFxuXHRcdFx0XHQnQ29tU3BlYz1DOlxcXFxXaW5kb3dzXFxcXFN5c3RlbTMyXFxcXGNtZC5leGUnLFxuXHRcdFx0XHQnUEFUSEVYVD0uQ09NOy5FWEU7LkJBVDsuQ01EOy5QUzEnLFxuXHRcdFx0XHQnUFNNb2R1bGVQYXRoPUM6XFxcXFVzZXJzXFxcXHVzZXJcXFxcRG9jdW1lbnRzXFxcXFBvd2VyU2hlbGxcXFxcTW9kdWxlcztDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFBvd2VyU2hlbGxcXFxcTW9kdWxlcycsXG5cdFx0XHRcdCdVU0VSUFJPRklMRT1DOlxcXFxVc2Vyc1xcXFx1c2VyJyxcblx0XHRcdFx0J0FQUERBVEE9QzpcXFxcVXNlcnNcXFxcdXNlclxcXFxBcHBEYXRhXFxcXFJvYW1pbmcnLFxuXHRcdFx0XHQnTE9DQUxBUFBEQVRBPUM6XFxcXFVzZXJzXFxcXHVzZXJcXFxcQXBwRGF0YVxcXFxMb2NhbCcsXG5cdFx0XHRcdCdQU0hPTUU9QzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDcnXG5cdFx0XHRdKSxcblx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpLnRvTG93ZXJDYXNlKCk7XG5cdH1cblxuXHRmdW5jdGlvbiBlbmFibGVXaW5kb3dzU2FuZGJveCgpOiB2b2lkIHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0VuYWJsZWQsIEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbik7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29yaywgdHJ1ZSk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y3JlYXRlZEZpbGVzID0gbmV3IE1hcCgpO1xuXHRcdGNyZWF0ZUZpbGVDb3VudCA9IDA7XG5cdFx0Y3JlYXRlZEZvbGRlcnMgPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdHNhbmRib3hTZXR0aW5ncyA9IG5ldyBNYXAoKTtcblx0XHRzYW5kYm94U2V0dGluZ3NFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGZpbGVTZXJ2aWNlID0gbmV3IE1vY2tGaWxlU2VydmljZSgpO1xuXG5cdFx0c2FuZGJveFNldHRpbmdzLnNldChBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZCwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uKTtcblx0XHRzYW5kYm94U2V0dGluZ3Muc2V0KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgdHJ1ZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXaW5kb3dzTXhjVGVybWluYWxTYW5kYm94UnVudGltZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV2luZG93c014Y1Rlcm1pbmFsU2FuZGJveFJ1bnRpbWUpKTtcblx0fSk7XG5cblx0dGVzdCgncnVuQXNOb2RlPXRydWUgcHJlZml4ZXMgdGhlIHdyYXBwZWQgY29tbWFuZCB3aXRoIEVMRUNUUk9OX1JVTl9BU19OT0RFPTEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoe1xuXHRcdFx0Z2V0UnVudGltZUluZm86ICgpID0+IFByb21pc2UucmVzb2x2ZSh7IGFwcFJvb3Q6ICcvYXBwJywgZXhlY1BhdGg6ICcvYXBwL2VsZWN0cm9uJywgcnVuQXNOb2RlOiB0cnVlIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblx0XHRhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblxuXHRcdGNvbnN0IHdyYXBwZWQgPSBhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gaGknKTtcblxuXHRcdHN0cmljdEVxdWFsKHdyYXBwZWQuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cdFx0b2sod3JhcHBlZC5jb21tYW5kLnN0YXJ0c1dpdGgoJ0VMRUNUUk9OX1JVTl9BU19OT0RFPTEgJyksIGBFeHBlY3RlZCBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIHByZWZpeC4gQWN0dWFsOiAke3dyYXBwZWQuY29tbWFuZH1gKTtcblx0fSk7XG5cblx0dGVzdCgncnVuQXNOb2RlPWZhbHNlIG9taXRzIHRoZSBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIHByZWZpeCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7XG5cdFx0XHRnZXRSdW50aW1lSW5mbzogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHsgYXBwUm9vdDogJy9hcHAnLCBleGVjUGF0aDogJy9hcHAvbm9kZScsIHJ1bkFzTm9kZTogZmFsc2UgfSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXHRcdGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnZWNobyBoaScpO1xuXG5cdFx0c3RyaWN0RXF1YWwod3JhcHBlZC5pc1NhbmRib3hXcmFwcGVkLCB0cnVlKTtcblx0XHRvayghd3JhcHBlZC5jb21tYW5kLnN0YXJ0c1dpdGgoJ0VMRUNUUk9OX1JVTl9BU19OT0RFPScpLCBgRGlkIG5vdCBleHBlY3QgRUxFQ1RST05fUlVOX0FTX05PREUgcHJlZml4LiBBY3R1YWw6ICR7d3JhcHBlZC5jb21tYW5kfWApO1xuXHR9KTtcblxuXHR0ZXN0KCd3cmFwQ29tbWFuZCBhZGRzIHJpcGdyZXAtdW5pdmVyc2FsIHBsYXRmb3JtLWFyY2ggYmluIGRpcmVjdG9yeSB0byBQQVRIJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KCk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXHRcdGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnZWNobyBoaScpO1xuXG5cdFx0b2sod3JhcHBlZC5jb21tYW5kLmluY2x1ZGVzKGAvYXBwL25vZGVfbW9kdWxlcy9AdnNjb2RlL3JpcGdyZXAtdW5pdmVyc2FsL2Jpbi9saW51eC0ke2FyY2h9YCksIGBFeHBlY3RlZCByaXBncmVwLXVuaXZlcnNhbCBwbGF0Zm9ybS1hcmNoIHBhdGggaW4gY29tbWFuZC4gQWN0dWFsOiAke3dyYXBwZWQuY29tbWFuZH1gKTtcblx0fSk7XG5cblx0dGVzdCgnc2FuZGJveCBjb25maWcgZW5hYmxlcyBQVFkgYWNjZXNzIGJ5IGRlZmF1bHQgb24gbWFjT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBnZXRPUzogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpIH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdHN0cmljdEVxdWFsKGNvbmZpZy5hbGxvd1B0eSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhbmRib3ggY29uZmlnIGRvZXMgbm90IGVuYWJsZSBQVFkgYWNjZXNzIGJ5IGRlZmF1bHQgb24gTGludXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgY3JlYXRlSG9zdCgpKSk7XG5cblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRzdHJpY3RFcXVhbChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoY29uZmlnLCAnYWxsb3dQdHknKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYW5kYm94IGNvbmZpZyByZXNwZWN0cyBleHBsaWNpdGx5IGRpc2FibGVkIFBUWSBhY2Nlc3Mgb24gbWFjT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFkdmFuY2VkUnVudGltZSwgeyBhbGxvd1B0eTogZmFsc2UgfSk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBnZXRPUzogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpIH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdHN0cmljdEVxdWFsKGNvbmZpZy5hbGxvd1B0eSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYW5kYm94IGNvbmZpZyBwcmVzZXJ2ZXMgYWR2YW5jZWQgcnVudGltZSBuZXR3b3JrIHNldHRpbmdzIHdoZW4gYWxsb3dOZXR3b3JrIGlzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29yaywgdHJ1ZSk7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFkdmFuY2VkUnVudGltZSwge1xuXHRcdFx0bmV0d29yazoge1xuXHRcdFx0XHRhbGxvd0FsbFVuaXhTb2NrZXRzOiB0cnVlLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVIb3N0KCkpKTtcblxuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbChjb25maWcubmV0d29yaywge1xuXHRcdFx0YWxsb3dlZERvbWFpbnM6IFtdLFxuXHRcdFx0ZGVuaWVkRG9tYWluczogW10sXG5cdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdGFsbG93QWxsVW5peFNvY2tldHM6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3RBbGxvd05ldHdvcmsga2VlcHMgdGhlIGNvbW1hbmQgc2FuZGJveGVkIGFuZCByZWZyZXNoZXMgaXRzIG5ldHdvcmsgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgdHJ1ZSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgY3JlYXRlSG9zdCgpKSk7XG5cblx0XHRjb25zdCB3cmFwcGVkID0gYXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nLCBmYWxzZSwgJ2Jhc2gnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IHVucmVzdHJpY3RlZENvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXG5cdFx0c3RyaWN0RXF1YWwod3JhcHBlZC5pc1NhbmRib3hXcmFwcGVkLCB0cnVlKTtcblx0XHRzdHJpY3RFcXVhbCh3cmFwcGVkLnJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uLCB0cnVlKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwodW5yZXN0cmljdGVkQ29uZmlnLm5ldHdvcmssIHsgYWxsb3dlZERvbWFpbnM6IFtdLCBkZW5pZWREb21haW5zOiBbXSwgZW5hYmxlZDogZmFsc2UgfSk7XG5cblx0XHRhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gcmVzdHJpY3RlZCBhZ2FpbicpO1xuXHRcdGNvbnN0IHJlc3RyaWN0ZWRDb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdHJpY3RlZENvbmZpZy5uZXR3b3JrLCB7IGFsbG93ZWREb21haW5zOiBbXSwgZGVuaWVkRG9tYWluczogW10gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3RBbGxvd05ldHdvcmsgZG9lcyBub3QgcmVsYXggbmV0d29yayBhY2Nlc3Mgd2hlbiBwZXItY29tbWFuZCByZXF1ZXN0cyBhcmUgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzLCBmYWxzZSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgY3JlYXRlSG9zdCgpKSk7XG5cblx0XHRjb25zdCB3cmFwcGVkID0gYXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nLCBmYWxzZSwgJ2Jhc2gnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXG5cdFx0c3RyaWN0RXF1YWwod3JhcHBlZC5pc1NhbmRib3hXcmFwcGVkLCB0cnVlKTtcblx0XHRzdHJpY3RFcXVhbCh3cmFwcGVkLnJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uLCB1bmRlZmluZWQpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChjb25maWcubmV0d29yaywgeyBhbGxvd2VkRG9tYWluczogW10sIGRlbmllZERvbWFpbnM6IFtdIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnNhbmRib3hlZCByZXRyeSBwcmVzZXJ2ZXMgdGhlIG9yaWdpbmFsIHdvcmtpbmcgZGlyZWN0b3J5IG9uIExpbnV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsIHRydWUpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGNyZWF0ZUhvc3QoKSkpO1xuXHRcdGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgncHdkJywgdHJ1ZSwgJ2Jhc2gnLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS93aXRoIHNwYWNlcycpKTtcblxuXHRcdHN0cmljdEVxdWFsKHdyYXBwZWQuaXNTYW5kYm94V3JhcHBlZCwgZmFsc2UpO1xuXHRcdG9rKHdyYXBwZWQuY29tbWFuZC5pbmNsdWRlcyhgL3dvcmtzcGFjZS93aXRoIHNwYWNlc2ApLCBgRXhwZWN0ZWQgdGhlIHVuc2FuZGJveGVkIGNvbW1hbmQgdG8gaW5jbHVkZSBjd2QuIEFjdHVhbDogJHt3cmFwcGVkLmNvbW1hbmR9YCk7XG5cdFx0b2sod3JhcHBlZC5jb21tYW5kLmluY2x1ZGVzKGAmJiBwd2RgKSwgYEV4cGVjdGVkIHRoZSB1bnNhbmRib3hlZCBjb21tYW5kIHRvIGNoYW5nZSB0byBjd2QgYmVmb3JlIGV4ZWN1dGlvbi4gQWN0dWFsOiAke3dyYXBwZWQuY29tbWFuZH1gKTtcblx0fSk7XG5cblx0dGVzdCgnYmxvY2tlZCBkb21haW5zIHJlcXVlc3Qgc2FuZGJveGVkIG5ldHdvcmsgYWNjZXNzIGJlZm9yZSBleGVjdXRpb24gd2hlbiBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgdHJ1ZSk7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLkRlbmllZE5ldHdvcmtEb21haW5zLCBbJ2V4YW1wbGUuY29tJ10pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGNyZWF0ZUhvc3QoKSkpO1xuXG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnY3VybCBodHRwczovL2V4YW1wbGUuY29tJywgZmFsc2UsICdiYXNoJyk7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXG5cdFx0c3RyaWN0RXF1YWwod3JhcHBlZC5pc1NhbmRib3hXcmFwcGVkLCB0cnVlKTtcblx0XHRzdHJpY3RFcXVhbCh3cmFwcGVkLnJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uLCB0cnVlKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwod3JhcHBlZC5ibG9ja2VkRG9tYWlucywgWydleGFtcGxlLmNvbSddKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwod3JhcHBlZC5kZW5pZWREb21haW5zLCBbJ2V4YW1wbGUuY29tJ10pO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChjb25maWcubmV0d29yaywgeyBhbGxvd2VkRG9tYWluczogW10sIGRlbmllZERvbWFpbnM6IFtdLCBlbmFibGVkOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VSb290cyB0cmlnZ2VycyBhIHNhbmRib3ggY29uZmlnIHJld3JpdGUgb24gdGhlIG5leHQgd3JhcCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgd3JpdGVSb290czogVVJJW10gPSBbVVJJLmZpbGUoJy93b3Jrc3BhY2UtYScpXTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7XG5cdFx0XHRnZXRXcml0ZVJvb3RzOiAoKSA9PiB3cml0ZVJvb3RzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblx0XHRhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gYScpO1xuXHRcdGNvbnN0IGluaXRpYWxXcml0ZUNvdW50ID0gY3JlYXRlRmlsZUNvdW50O1xuXG5cdFx0d3JpdGVSb290cyA9IFtVUkkuZmlsZSgnL3dvcmtzcGFjZS1iJyldO1xuXHRcdGhvc3Qucm9vdHNFbWl0dGVyLmZpcmUoKTtcblx0XHRhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gYicpO1xuXG5cdFx0b2soY3JlYXRlRmlsZUNvdW50ID4gaW5pdGlhbFdyaXRlQ291bnQsIGBFeHBlY3RlZCBzYW5kYm94IGNvbmZpZyB0byBiZSByZXdyaXR0ZW4gYWZ0ZXIgb25EaWRDaGFuZ2VSb290cyAoaW5pdGlhbD0ke2luaXRpYWxXcml0ZUNvdW50fSwgYWZ0ZXI9JHtjcmVhdGVGaWxlQ291bnR9KWApO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCEpISk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcygnL3dvcmtzcGFjZS1iJyksICdSZWZyZXNoZWQgY29uZmlnIHNob3VsZCBpbmNsdWRlIHRoZSBuZXcgd3JpdGUgcm9vdCcpO1xuXHRcdG9rKCFjb25maWcuZmlsZXN5c3RlbS5hbGxvd1dyaXRlLmluY2x1ZGVzKCcvd29ya3NwYWNlLWEnKSwgJ1JlZnJlc2hlZCBjb25maWcgc2hvdWxkIGRyb3AgdGhlIG9sZCB3cml0ZSByb290Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fsd2F5cyBkZW5pZXMgcmVhZHMgb2YgdGhlIHNhbmRib3ggY29uZmlnIGZpbGUgb24gTGludXggYW5kIG1hY09TJywgYXN5bmMgKCkgPT4ge1xuXHRcdGZvciAoY29uc3Qgb3Mgb2YgW09wZXJhdGluZ1N5c3RlbS5MaW51eCwgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaF0pIHtcblx0XHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGNyZWF0ZUhvc3Qoe1xuXHRcdFx0XHRnZXRPUzogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKG9zKSxcblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdFx0Y29uc3QgdGVtcERpclBhdGggPSBlbmdpbmUuZ2V0VGVtcERpcigpPy5wYXRoO1xuXHRcdFx0b2sodGVtcERpclBhdGgsICdUZW1wIGRpciBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZGVueVJlYWQ6IGNvbmZpZy5maWxlc3lzdGVtLmRlbnlSZWFkLmluY2x1ZGVzKGNvbmZpZ1BhdGgpLFxuXHRcdFx0XHRjb25maWdBbGxvd1dyaXRlOiBjb25maWcuZmlsZXN5c3RlbS5hbGxvd1dyaXRlLmluY2x1ZGVzKGNvbmZpZ1BhdGgpLFxuXHRcdFx0XHR0ZW1wRGlyQWxsb3dXcml0ZTogY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcyh0ZW1wRGlyUGF0aCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGRlbnlSZWFkOiB0cnVlLFxuXHRcdFx0XHRjb25maWdBbGxvd1dyaXRlOiBmYWxzZSxcblx0XHRcdFx0dGVtcERpckFsbG93V3JpdGU6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBmaWxlc3lzdGVtIHN5bWxpbmsgcGF0aHMgYW5kIHJlc29sdmVzIHRoZWlyIHRhcmdldHMgb24gTGludXggd2hlbiB3cml0aW5nIHRoZSBjb25maWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveExpbnV4RmlsZVN5c3RlbSwge1xuXHRcdFx0YWxsb3dSZWFkOiBbJ34vcmVhZC1saW5rJ10sXG5cdFx0XHRhbGxvd1dyaXRlOiBbJy93cml0ZS1saW5rJ10sXG5cdFx0XHRkZW55UmVhZDogWyd+L2RlbnktcmVhZC1saW5rJ10sXG5cdFx0XHRkZW55V3JpdGU6IFsnL2Rlbnktd3JpdGUtbGluayddLFxuXHRcdH0pO1xuXHRcdGZpbGVTZXJ2aWNlLnNldFJlYWxwYXRoKCcvd29ya3NwYWNlLWxpbmsnLCAnL3JlYWwvd29ya3NwYWNlJyk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0UmVhbHBhdGgoJy93cml0ZS1saW5rJywgJy9yZWFsL3dyaXRlJyk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0UmVhbHBhdGgoJy9ob21lL3VzZXIvcmVhZC1saW5rJywgJy9yZWFsL3JlYWQnKTtcblx0XHRmaWxlU2VydmljZS5zZXRSZWFscGF0aCgnL2hvbWUvdXNlci9kZW55LXJlYWQtbGluaycsICcvcmVhbC9kZW55LXJlYWQnKTtcblx0XHRmaWxlU2VydmljZS5zZXRSZWFscGF0aCgnL2Rlbnktd3JpdGUtbGluaycsICcvcmVhbC9kZW55LXdyaXRlJyk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0UmVhbHBhdGgoJy9ob21lL3VzZXIvLmdudXBnJywgJy9yZWFsL2dudXBnJyk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoe1xuXHRcdFx0Z2V0V3JpdGVSb290czogKCkgPT4gW1VSSS5maWxlKCcvd29ya3NwYWNlLWxpbmsnKV0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0YXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdnaXQgY29tbWl0IC1TJywgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBbeyBrZXl3b3JkOiAnZ2l0JywgYXJnczogWydjb21taXQnLCAnLVMnXSB9XSk7XG5cblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcygnL3dvcmtzcGFjZS1saW5rJyksICdXb3Jrc3BhY2Ugd3JpdGUgcm9vdCBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5hbGxvd1dyaXRlLmluY2x1ZGVzKCcvcmVhbC93b3Jrc3BhY2UnKSwgJ1dvcmtzcGFjZSB3cml0ZSByb290IHN5bWxpbmsgdGFyZ2V0IHNob3VsZCBiZSBpbmNsdWRlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93V3JpdGUuaW5jbHVkZXMoJy93cml0ZS1saW5rJyksICdDb25maWd1cmVkIGFsbG93V3JpdGUgc3ltbGluayBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcygnL3JlYWwvd3JpdGUnKSwgJ0NvbmZpZ3VyZWQgYWxsb3dXcml0ZSBzeW1saW5rIHRhcmdldCBzaG91bGQgYmUgaW5jbHVkZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5hbGxvd1JlYWQuaW5jbHVkZXMoJy9ob21lL3VzZXIvcmVhZC1saW5rJyksICdDb25maWd1cmVkIGFsbG93UmVhZCBzaG91bGQgZXhwYW5kIH4gYW5kIHByZXNlcnZlIHRoZSBzeW1saW5rJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dSZWFkLmluY2x1ZGVzKCcvcmVhbC9yZWFkJyksICdDb25maWd1cmVkIGFsbG93UmVhZCBzeW1saW5rIHRhcmdldCBzaG91bGQgYmUgaW5jbHVkZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5hbGxvd1JlYWQuaW5jbHVkZXMoJy9ob21lL3VzZXIvLmdudXBnJyksICdDb21tYW5kIHJ1bnRpbWUgYWxsb3dSZWFkIHN5bWxpbmsgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93UmVhZC5pbmNsdWRlcygnL3JlYWwvZ251cGcnKSwgJ0NvbW1hbmQgcnVudGltZSBhbGxvd1JlYWQgc3ltbGluayB0YXJnZXQgc2hvdWxkIGJlIGluY2x1ZGVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcygnL2hvbWUvdXNlci8uZ251cGcnKSwgJ0NvbW1hbmQgcnVudGltZSBhbGxvd1dyaXRlIHN5bWxpbmsgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93V3JpdGUuaW5jbHVkZXMoJy9yZWFsL2dudXBnJyksICdDb21tYW5kIHJ1bnRpbWUgYWxsb3dXcml0ZSBzeW1saW5rIHRhcmdldCBzaG91bGQgYmUgaW5jbHVkZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5kZW55UmVhZC5pbmNsdWRlcygnL2hvbWUvdXNlci9kZW55LXJlYWQtbGluaycpLCAnQ29uZmlndXJlZCBkZW55UmVhZCBzaG91bGQgZXhwYW5kIH4gYW5kIHByZXNlcnZlIHRoZSBzeW1saW5rJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uZGVueVJlYWQuaW5jbHVkZXMoJy9yZWFsL2RlbnktcmVhZCcpLCAnQ29uZmlndXJlZCBkZW55UmVhZCBzeW1saW5rIHRhcmdldCBzaG91bGQgYmUgaW5jbHVkZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5kZW55V3JpdGUuaW5jbHVkZXMoJy9kZW55LXdyaXRlLWxpbmsnKSwgJ0NvbmZpZ3VyZWQgZGVueVdyaXRlIHN5bWxpbmsgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmRlbnlXcml0ZS5pbmNsdWRlcygnL3JlYWwvZGVueS13cml0ZScpLCAnQ29uZmlndXJlZCBkZW55V3JpdGUgc3ltbGluayB0YXJnZXQgc2hvdWxkIGJlIGluY2x1ZGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGZpbGVzeXN0ZW0gcGF0aHMgd2l0aG91dCBzeW1saW5rcyB3aGVuIHdyaXRpbmcgdGhlIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94TGludXhGaWxlU3lzdGVtLCB7XG5cdFx0XHRhbGxvd1JlYWQ6IFsnfi9yZWFkLXBsYWluJ10sXG5cdFx0XHRhbGxvd1dyaXRlOiBbJy93cml0ZS1wbGFpbiddLFxuXHRcdFx0ZGVueVJlYWQ6IFsnfi9kZW55LXJlYWQtcGxhaW4nXSxcblx0XHRcdGRlbnlXcml0ZTogWycvZGVueS13cml0ZS1wbGFpbiddLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHtcblx0XHRcdGdldFdyaXRlUm9vdHM6ICgpID0+IFtVUkkuZmlsZSgnL3dvcmtzcGFjZS1wbGFpbicpXSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcygnL3dvcmtzcGFjZS1wbGFpbicpLCAnV29ya3NwYWNlIHdyaXRlIHJvb3Qgd2l0aG91dCBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5hbGxvd1dyaXRlLmluY2x1ZGVzKCcvd3JpdGUtcGxhaW4nKSwgJ0NvbmZpZ3VyZWQgYWxsb3dXcml0ZSB3aXRob3V0IHN5bWxpbmsgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93UmVhZC5pbmNsdWRlcygnL2hvbWUvdXNlci9yZWFkLXBsYWluJyksICdDb25maWd1cmVkIGFsbG93UmVhZCB3aXRob3V0IHN5bWxpbmsgc2hvdWxkIGV4cGFuZCB+IGFuZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5kZW55UmVhZC5pbmNsdWRlcygnL2hvbWUvdXNlci9kZW55LXJlYWQtcGxhaW4nKSwgJ0NvbmZpZ3VyZWQgZGVueVJlYWQgd2l0aG91dCBzeW1saW5rIHNob3VsZCBleHBhbmQgfiBhbmQgYmUgcHJlc2VydmVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uZGVueVdyaXRlLmluY2x1ZGVzKCcvZGVueS13cml0ZS1wbGFpbicpLCAnQ29uZmlndXJlZCBkZW55V3JpdGUgd2l0aG91dCBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2tGaWxlQWNjZXNzIHZhbGlkYXRlcyB3cml0ZSBwYXRocyBhZ2FpbnN0IGFsbG93V3JpdGUgYW5kIGRlbnlXcml0ZSBvbiBMaW51eCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94TGludXhGaWxlU3lzdGVtLCB7XG5cdFx0XHRhbGxvd1dyaXRlOiBbJy9jb25maWd1cmVkL3dyaXRlJywgJy9nbG9iLyoqLyoudHMnXSxcblx0XHRcdGRlbnlXcml0ZTogWycvd29ya3NwYWNlL2Jsb2NrZWQnXSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVIb3N0KCkpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZS5jaGVja0ZpbGVBY2Nlc3MoJ3dyaXRlJywgW1xuXHRcdFx0Jy93b3Jrc3BhY2UvZmlsZS50eHQnLFxuXHRcdFx0Jy9jb25maWd1cmVkL3dyaXRlL2ZpbGUudHh0Jyxcblx0XHRcdCcvZ2xvYi9uZXN0ZWQvZmlsZS50cycsXG5cdFx0XHQnL291dHNpZGUvZmlsZS50eHQnLFxuXHRcdFx0Jy93b3Jrc3BhY2UvYmxvY2tlZC9maWxlLnR4dCcsXG5cdFx0XSk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRhbGxvd2VkOiBmYWxzZSxcblx0XHRcdGRlbmllZDogWycvb3V0c2lkZS9maWxlLnR4dCcsICcvd29ya3NwYWNlL2Jsb2NrZWQvZmlsZS50eHQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2tGaWxlQWNjZXNzIHZhbGlkYXRlcyByZWFkIHBhdGhzIGFnYWluc3QgZGVueVJlYWQgYW5kIGFsbG93UmVhZCBvbiBMaW51eCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94TGludXhGaWxlU3lzdGVtLCB7XG5cdFx0XHRhbGxvd1JlYWQ6IFsnfi8uYWxsb3dlZC1yZWFkJ10sXG5cdFx0XHRhbGxvd1dyaXRlOiBbJ34vLmFsbG93ZWQtd3JpdGUnXSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVIb3N0KCkpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZS5jaGVja0ZpbGVBY2Nlc3MoJ3JlYWQnLCBbXG5cdFx0XHQnL2hvbWUvdXNlci9wcml2YXRlLnR4dCcsXG5cdFx0XHQnL2hvbWUvdXNlci8uYWxsb3dlZC1yZWFkL2NvbmZpZy5qc29uJyxcblx0XHRcdCcvaG9tZS91c2VyLy5hbGxvd2VkLXdyaXRlL2ZpbGUudHh0Jyxcblx0XHRcdCcvZXRjL2hvc3RzJyxcblx0XHRdKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdGFsbG93ZWQ6IGZhbHNlLFxuXHRcdFx0ZGVuaWVkOiBbJy9ob21lL3VzZXIvcHJpdmF0ZS50eHQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2tGaWxlQWNjZXNzIHByZXNlcnZlcyBzeW1saW5rIHNvdXJjZSBhbmQgdGFyZ2V0IHBlcm1pc3Npb25zIG9uIExpbnV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hMaW51eEZpbGVTeXN0ZW0sIHtcblx0XHRcdGFsbG93V3JpdGU6IFsnL3dyaXRlLWxpbmsnXSxcblx0XHR9KTtcblx0XHRmaWxlU2VydmljZS5zZXRSZWFscGF0aCgnL3dyaXRlLWxpbmsnLCAnL3JlYWwvd3JpdGUnKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVIb3N0KCkpKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbChhd2FpdCBlbmdpbmUuY2hlY2tGaWxlQWNjZXNzKCd3cml0ZScsIFsnL3dyaXRlLWxpbmsvZmlsZS50eHQnLCAnL3JlYWwvd3JpdGUvZmlsZS50eHQnXSksIHtcblx0XHRcdGFsbG93ZWQ6IHRydWUsXG5cdFx0XHRkZW5pZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhbnVwVGVtcERpciBpcyBhIG5vLW9wIHdoZW4gbm8gdGVtcCBkaXIgd2FzIGV2ZXIgY3JlYXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCgpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdC8vIERpc2FibGUgdGhlIHNhbmRib3ggc28gdGhlIGVuZ2luZSBuZXZlciBjcmVhdGVzIGEgdGVtcCBkaXIuXG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQsIEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYpO1xuXG5cdFx0c3RyaWN0RXF1YWwoZW5naW5lLmdldFRlbXBEaXIoKSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBlbmdpbmUuY2xlYW51cFRlbXBEaXIoKTsgLy8gbXVzdCBub3QgdGhyb3dcblx0fSk7XG5cblx0dGVzdCgncHJlY2hlY2sgaW5wdXRzIGNhbiBkaXNhYmxlIHNhbmRib3hpbmcgd2hlbiBkZWZhdWx0IGFwcHJvdmFsIHBlcm1pc3Npb24gaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRzdHJpY3RFcXVhbChhd2FpdCBlbmdpbmUuaXNFbmFibGVkKHsgaXNEZWZhdWx0QXBwcm92YWxQZXJtaXNzaW9uRW5hYmxlZDogdHJ1ZSB9KSwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwoYXdhaXQgZW5naW5lLmlzRW5hYmxlZCh7IGlzRGVmYXVsdEFwcHJvdmFsUGVybWlzc2lvbkVuYWJsZWQ6IGZhbHNlIH0pLCBmYWxzZSk7XG5cdFx0c3RyaWN0RXF1YWwoYXdhaXQgZW5naW5lLmlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQoeyBpc0RlZmF1bHRBcHByb3ZhbFBlcm1pc3Npb25FbmFibGVkOiBmYWxzZSB9KSwgZmFsc2UpO1xuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aChmYWxzZSwgeyBpc0RlZmF1bHRBcHByb3ZhbFBlcm1pc3Npb25FbmFibGVkOiBmYWxzZSB9KSwgdW5kZWZpbmVkKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbChhd2FpdCBlbmdpbmUuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcyhmYWxzZSwgeyBpc0RlZmF1bHRBcHByb3ZhbFBlcm1pc3Npb25FbmFibGVkOiBmYWxzZSB9KSwge1xuXHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdHN0cmljdEVxdWFsKGNyZWF0ZUZpbGVDb3VudCwgMCwgJ0Rpc2FibGVkIHNhbmRib3ggcHJlY2hlY2sgc2hvdWxkIG5vdCBjcmVhdGUgc2FuZGJveCBjb25maWcgZmlsZXMnKTtcblx0fSk7XG5cblx0dGVzdCgnaXNFbmFibGVkIHJldHVybnMgZmFsc2Ugb24gV2luZG93cyB3aGVuIFdpbmRvd3Mgc2FuZGJveCBzZXR0aW5nIGlzIGRpc2FibGVkIGJ5IGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZVdpbmRvd3NIb3N0KCk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0c3RyaWN0RXF1YWwoYXdhaXQgZW5naW5lLmlzRW5hYmxlZCgpLCBmYWxzZSk7XG5cdFx0c3RyaWN0RXF1YWwoYXdhaXQgZW5naW5lLmlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQoKSwgZmFsc2UpO1xuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0VuYWJsZWQgcmV0dXJucyB0cnVlIG9uIFdpbmRvd3Mgd2hlbiBXaW5kb3dzIHNhbmRib3ggc2V0dGluZyBpcyBlbmFibGVkIGV2ZW4gaWYgZ2xvYmFsIHNhbmRib3hpbmcgaXMgb2ZmJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmKTtcblx0XHRlbmFibGVXaW5kb3dzU2FuZGJveCgpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVXaW5kb3dzSG9zdCgpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5pc0VuYWJsZWQoKSwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwoYXdhaXQgZW5naW5lLmlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VuYWJsZWRXaW5kb3dzIG9uIHZhbHVlIGRvZXMgbm90IGVuYWJsZSBhbGxvd05ldHdvcmsgb24gV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZCwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZik7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NFbmFibGVkLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24pO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVXaW5kb3dzSG9zdCgpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5pc0VuYWJsZWQoKSwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwoYXdhaXQgZW5naW5lLmlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cmFwQ29tbWFuZCB1c2VzIE1YQyBleGVjdXRhYmxlIGFuZCB3cml0ZXMgTVhDIGNvbmZpZyBvbiBXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGVuYWJsZVdpbmRvd3NTYW5kYm94KCk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZVdpbmRvd3NIb3N0KCk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnZWNobyBoZWxsbycsIGZhbHNlLCAnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGUnLCBVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiAnL2M6L3dvcmtzcGFjZScgfSkpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdHN0cmljdEVxdWFsKHdyYXBwZWQuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cdFx0b2sod3JhcHBlZC5jb21tYW5kLnN0YXJ0c1dpdGgoYCYgJ0M6XFxcXGFwcFxcXFxub2RlX21vZHVsZXNcXFxcQG1pY3Jvc29mdFxcXFxteGMtc2RrXFxcXGJpblxcXFx4NjRcXFxcd3hjLWV4ZWMuZXhlJ2ApLCBgRXhwZWN0ZWQgTVhDIGV4ZWN1dGFibGUuIEFjdHVhbDogJHt3cmFwcGVkLmNvbW1hbmR9YCk7XG5cdFx0b2sod3JhcHBlZC5jb21tYW5kLmluY2x1ZGVzKGAgJyR7Y29uZmlnUGF0aH0nYCksIGBFeHBlY3RlZCB3cmFwcGVkIGNvbW1hbmQgdG8gcGFzcyB0aGUgTVhDIGNvbmZpZyBwYXRoLiBBY3R1YWw6ICR7d3JhcHBlZC5jb21tYW5kfWApO1xuXHRcdHN0cmljdEVxdWFsKGNvbmZpZy52ZXJzaW9uLCAnMC42LjAtYWxwaGEnKTtcblx0XHRzdHJpY3RFcXVhbChjb25maWcuY29udGFpbm1lbnQsICdwcm9jZXNzJyk7XG5cdFx0c3RyaWN0RXF1YWwoY29uZmlnLnByb2Nlc3MuY29tbWFuZExpbmUsICdcIkM6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlXCIgLU5vUHJvZmlsZSAtQ29tbWFuZCBcImVjaG8gaGVsbG9cIicpO1xuXHRcdHN0cmljdEVxdWFsKG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KGNvbmZpZy5wcm9jZXNzLmN3ZCksICdjOi93b3Jrc3BhY2UnKTtcblx0XHRzdHJpY3RFcXVhbChjb25maWcudWkuZGlzYWJsZSwgZmFsc2UpO1xuXHRcdG9rKGNvbmZpZy5wcm9jZXNzLmVudi5pbmNsdWRlcygnU3lzdGVtUm9vdD1DOlxcXFxXaW5kb3dzJyksICdTeXN0ZW1Sb290IHNob3VsZCBiZSBpbmplY3RlZCBpbnRvIHRoZSBNWEMgcHJvY2VzcyBlbnYnKTtcblx0XHRvayhjb25maWcucHJvY2Vzcy5lbnYuaW5jbHVkZXMoJ1BBVEg9QzpcXFxcdG9vbHNcXFxcbm9kZTtDOlxcXFxXaW5kb3dzXFxcXFN5c3RlbTMyJyksICdQQVRIIHNob3VsZCBiZSBpbmplY3RlZCBpbnRvIHRoZSBNWEMgcHJvY2VzcyBlbnYnKTtcblx0XHRvayhjb25maWcucHJvY2Vzcy5lbnYuaW5jbHVkZXMoJ0NvbVNwZWM9QzpcXFxcV2luZG93c1xcXFxTeXN0ZW0zMlxcXFxjbWQuZXhlJyksICdDb21TcGVjIHNob3VsZCBiZSBpbmplY3RlZCBpbnRvIHRoZSBNWEMgcHJvY2VzcyBlbnYnKTtcblx0XHRvayhjb25maWcucHJvY2Vzcy5lbnYuaW5jbHVkZXMoJ1BBVEhFWFQ9LkNPTTsuRVhFOy5CQVQ7LkNNRDsuUFMxJyksICdQQVRIRVhUIHNob3VsZCBiZSBpbmplY3RlZCBpbnRvIHRoZSBNWEMgcHJvY2VzcyBlbnYnKTtcblx0XHRvayhjb25maWcucHJvY2Vzcy5lbnYuaW5jbHVkZXMoJ1BTTW9kdWxlUGF0aD1DOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvY3VtZW50c1xcXFxQb3dlclNoZWxsXFxcXE1vZHVsZXM7QzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXE1vZHVsZXMnKSwgJ1BTTW9kdWxlUGF0aCBzaG91bGQgYmUgaW5qZWN0ZWQgaW50byB0aGUgTVhDIHByb2Nlc3MgZW52Jyk7XG5cdFx0b2soY29uZmlnLnByb2Nlc3MuZW52LmluY2x1ZGVzKCdVU0VSUFJPRklMRT1DOlxcXFxVc2Vyc1xcXFx1c2VyJyksICdVU0VSUFJPRklMRSBzaG91bGQgYmUgaW5qZWN0ZWQgaW50byB0aGUgTVhDIHByb2Nlc3MgZW52Jyk7XG5cdFx0b2soY29uZmlnLnByb2Nlc3MuZW52LmluY2x1ZGVzKCdBUFBEQVRBPUM6XFxcXFVzZXJzXFxcXHVzZXJcXFxcQXBwRGF0YVxcXFxSb2FtaW5nJyksICdBUFBEQVRBIHNob3VsZCBiZSBpbmplY3RlZCBpbnRvIHRoZSBNWEMgcHJvY2VzcyBlbnYnKTtcblx0XHRvayhjb25maWcucHJvY2Vzcy5lbnYuaW5jbHVkZXMoJ0xPQ0FMQVBQREFUQT1DOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXEFwcERhdGFcXFxcTG9jYWwnKSwgJ0xPQ0FMQVBQREFUQSBzaG91bGQgYmUgaW5qZWN0ZWQgaW50byB0aGUgTVhDIHByb2Nlc3MgZW52Jyk7XG5cdFx0b2soY29uZmlnLnByb2Nlc3MuZW52LmluY2x1ZGVzKCdQU0hPTUU9QzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDcnKSwgJ1BTSE9NRSBzaG91bGQgYmUgaW5qZWN0ZWQgaW50byB0aGUgTVhDIHByb2Nlc3MgZW52Jyk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKGNvbmZpZy5uZXR3b3JrLCB7IGRlZmF1bHRQb2xpY3k6ICdhbGxvdycsIGVuZm9yY2VtZW50TW9kZTogJ2NhcGFiaWxpdGllcycgfSk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZHdyaXRlUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3dvcmtzcGFjZScpLCAnV29ya3NwYWNlIHNob3VsZCBiZSB3cml0YWJsZScpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkuZW5kc1dpdGgoJy8udGVzdC1kYXRhL3RtcCcpKSwgJ1NhbmRib3ggdGVtcCBkaXIgc2hvdWxkIGJlIHdyaXRhYmxlJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZHdyaXRlUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3VzZXJzL3VzZXIvYXBwZGF0YS9sb2NhbC90ZW1wJyksICdNWEMgdGVtcG9yYXJ5IGZpbGVzIHBvbGljeSBzaG91bGQgYWRkIGhvc3QgdGVtcCBwYXRoIHRvIHdyaXRhYmxlIHBhdGhzJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZG9ubHlQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpLmVuZHNXaXRoKCcvLnRlc3QtZGF0YS90bXAnKSksICdTYW5kYm94IHRlbXAgZGlyIHNob3VsZCBiZSByZWFkYWJsZSB0aHJvdWdoIHJlYWRvbmx5IHBhdGhzJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZG9ubHlQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovdG9vbHMvbm9kZScpLCAnTVhDIGF2YWlsYWJsZSB0b29scyBwb2xpY3kgc2hvdWxkIGFkZCB0b29sIHBhdGhzIHRvIHJlYWRvbmx5IHBhdGhzJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZG9ubHlQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovcHJvZ3JhbSBmaWxlcy9wb3dlcnNoZWxsLzcnKSwgJ1Jlc29sdmVkIFBvd2VyU2hlbGwgZXhlY3V0YWJsZSBkaXJlY3Rvcnkgc2hvdWxkIGJlIHJlYWRhYmxlJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZG9ubHlQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovdXNlcnMvdXNlci9hcHBkYXRhL2xvY2FsL3Byb2dyYW1zL2dpdCcpLCAnTVhDIHVzZXIgcHJvZmlsZSBwb2xpY3kgc2hvdWxkIGFkZCB1c2VyIHByb2ZpbGUgcGF0aHMgdG8gcmVhZG9ubHkgcGF0aHMnKTtcblx0XHRvayghY29uZmlnLmZpbGVzeXN0ZW0uZGVuaWVkUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3VzZXJzL3VzZXInKSwgJ1VzZXIgaG9tZSBzaG91bGQgbm90IGJlIGRlbmllZCBieSBkZWZhdWx0IG9uIFdpbmRvd3MnKTtcblx0fSk7XG5cblx0dGVzdCgnd3JhcENvbW1hbmQgYXBwbGllcyBXaW5kb3dzIGZpbGVzeXN0ZW0gc2V0dGluZyB0byBNWEMgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdGVuYWJsZVdpbmRvd3NTYW5kYm94KCk7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NGaWxlU3lzdGVtLCB7XG5cdFx0XHRhbGxvd1dyaXRlOiBbJ0M6L2NvbmZpZ3VyZWQvd3JpdGUnXSxcblx0XHRcdGFsbG93UmVhZDogWydDOi9jb25maWd1cmVkL3JlYWQnXSxcblx0XHRcdGRlbnlSZWFkOiBbJ0M6L2NvbmZpZ3VyZWQvc2VjcmV0J10sXG5cdFx0fSk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZVdpbmRvd3NIb3N0KCk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0YXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdlY2hvIGhlbGxvJywgZmFsc2UsICdwd3NoJyk7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWRDb25maWcgPSBjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpITtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKHNlcmlhbGl6ZWRDb25maWcpO1xuXG5cdFx0b2soc2VyaWFsaXplZENvbmZpZy5pbmNsdWRlcygnQzpcXFxcXFxcXGNvbmZpZ3VyZWRcXFxcXFxcXHdyaXRlJyksICdDb25maWd1cmVkIFdpbmRvd3MgYWxsb3dXcml0ZSBwYXRoIHNob3VsZCBiZSBlc2NhcGVkIGluIHRoZSBzZXJpYWxpemVkIE1YQyBjb25maWcnKTtcblx0XHRvayhzZXJpYWxpemVkQ29uZmlnLmluY2x1ZGVzKCdDOlxcXFxcXFxcY29uZmlndXJlZFxcXFxcXFxccmVhZCcpLCAnQ29uZmlndXJlZCBXaW5kb3dzIGFsbG93UmVhZCBwYXRoIHNob3VsZCBiZSBlc2NhcGVkIGluIHRoZSBzZXJpYWxpemVkIE1YQyBjb25maWcnKTtcblx0XHRvayhzZXJpYWxpemVkQ29uZmlnLmluY2x1ZGVzKCdDOlxcXFxcXFxcY29uZmlndXJlZFxcXFxcXFxcc2VjcmV0JyksICdDb25maWd1cmVkIFdpbmRvd3MgZGVueVJlYWQgcGF0aCBzaG91bGQgYmUgZXNjYXBlZCBpbiB0aGUgc2VyaWFsaXplZCBNWEMgY29uZmlnJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZHdyaXRlUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L2NvbmZpZ3VyZWQvd3JpdGUnKSwgJ0NvbmZpZ3VyZWQgV2luZG93cyBhbGxvd1dyaXRlIHBhdGggc2hvdWxkIGJlIHdyaXRhYmxlJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZG9ubHlQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovY29uZmlndXJlZC9yZWFkJyksICdDb25maWd1cmVkIFdpbmRvd3MgYWxsb3dSZWFkIHBhdGggc2hvdWxkIGJlIHJlYWRvbmx5Jyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZHdyaXRlUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3VzZXJzL3VzZXIvYXBwZGF0YS9sb2NhbC90ZW1wJyksICdIb3N0IHRlbXAgcGF0aCBmcm9tIFdpbmRvd3MgcG9saWN5IHNob3VsZCBiZSB3cml0YWJsZScpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmRlbmllZFBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi9jb25maWd1cmVkL3NlY3JldCcpLCAnQ29uZmlndXJlZCBXaW5kb3dzIGRlbnlSZWFkIHBhdGggc2hvdWxkIGJlIGRlbmllZCcpO1xuXHRcdG9rKCFjb25maWcuZmlsZXN5c3RlbS5kZW5pZWRQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovdXNlcnMvdXNlcicpLCAnVXNlciBob21lIHNob3VsZCBub3QgYmUgZGVuaWVkIGJ5IGRlZmF1bHQgb24gV2luZG93cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWR1cGxpY2F0ZXMgV2luZG93cyBmaWxlc3lzdGVtIHBhdGhzIHJlZ2FyZGxlc3Mgb2YgY2FzZSBvciBzZXBhcmF0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0ZW5hYmxlV2luZG93c1NhbmRib3goKTtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0ZpbGVTeXN0ZW0sIHtcblx0XHRcdGFsbG93V3JpdGU6IFsnQzovY29uZmlndXJlZC93cml0ZSddLFxuXHRcdFx0YWxsb3dSZWFkOiBbJ0M6XFxcXGNvbmZpZ3VyZWRcXFxccmVhZCddLFxuXHRcdFx0ZGVueVJlYWQ6IFsnQzovY29uZmlndXJlZC9zZWNyZXQnLCAnYzpcXFxcY29uZmlndXJlZFxcXFxzZWNyZXQnXSxcblx0XHR9KTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2luZG93c0hvc3Qoe1xuXHRcdFx0Z2V0V2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3k6ICgpID0+IFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdHJlYWR3cml0ZVBhdGhzOiBbJ2M6XFxcXGNvbmZpZ3VyZWRcXFxcd3JpdGUnXSxcblx0XHRcdFx0cmVhZG9ubHlQYXRoczogWydjOi9jb25maWd1cmVkL3JlYWQnXSxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnZWNobyBoZWxsbycsIGZhbHNlLCAncHdzaCcpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblx0XHRjb25zdCBtYXRjaGluZ1BhdGhzID0gKHBhdGhzOiBzdHJpbmdbXSwgZXhwZWN0ZWRQYXRoOiBzdHJpbmcpID0+IHBhdGhzLmZpbHRlcihwYXRoID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSBleHBlY3RlZFBhdGgpO1xuXG5cdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlYWR3cml0ZTogbWF0Y2hpbmdQYXRocyhjb25maWcuZmlsZXN5c3RlbS5yZWFkd3JpdGVQYXRocywgJ2M6L2NvbmZpZ3VyZWQvd3JpdGUnKSxcblx0XHRcdHJlYWRvbmx5OiBtYXRjaGluZ1BhdGhzKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMsICdjOi9jb25maWd1cmVkL3JlYWQnKSxcblx0XHRcdGRlbmllZDogbWF0Y2hpbmdQYXRocyhjb25maWcuZmlsZXN5c3RlbS5kZW5pZWRQYXRocywgJ2M6L2NvbmZpZ3VyZWQvc2VjcmV0JyksXG5cdFx0fSwge1xuXHRcdFx0cmVhZHdyaXRlOiBbJ0M6XFxcXGNvbmZpZ3VyZWRcXFxcd3JpdGUnXSxcblx0XHRcdHJlYWRvbmx5OiBbJ0M6XFxcXGNvbmZpZ3VyZWRcXFxccmVhZCddLFxuXHRcdFx0ZGVuaWVkOiBbJ0M6XFxcXGNvbmZpZ3VyZWRcXFxcc2VjcmV0J10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZHVwbGljYXRlcyByZXNvbHZlZCBXaW5kb3dzIHBhdGhzIHJlZ2FyZGxlc3Mgb2YgY2FzZSBvciBzZXBhcmF0b3InLCBhc3luYyAoKSA9PiB7XG5cdFx0ZW5hYmxlV2luZG93c1NhbmRib3goKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVXaW5kb3dzSG9zdCgpKSk7XG5cdFx0YXdhaXQgZW5naW5lLmdldE9TKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyA9IChlbmdpbmUgYXMgdW5rbm93biBhcyB7IF9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKHBhdGhzOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IH0pLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzLmJpbmQoZW5naW5lKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlRmlsZVN5c3RlbVBhdGhzKFtcblx0XHRcdCdDOi9jb25maWd1cmVkL3BhdGgnLFxuXHRcdFx0J2M6XFxcXGNvbmZpZ3VyZWRcXFxccGF0aCcsXG5cdFx0XHQnQzpcXFxcY29uZmlndXJlZFxcXFxvdGhlci1wYXRoJyxcblx0XHRdKSwgW1xuXHRcdFx0J0M6L2NvbmZpZ3VyZWQvcGF0aCcsXG5cdFx0XHQnQzpcXFxcY29uZmlndXJlZFxcXFxvdGhlci1wYXRoJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnd3JhcENvbW1hbmQgYXBwbGllcyBjb25maWd1cmVkIFdpbmRvd3MgTVhDIHNjaGVtYSB2ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGVuYWJsZVdpbmRvd3NTYW5kYm94KCk7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NTY2hlbWFWZXJzaW9uLCAnMC41LjAtYWxwaGEnKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVXaW5kb3dzSG9zdCgpKSk7XG5cblx0XHRhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gaGVsbG8nLCBmYWxzZSwgJ3B3c2gnKTtcblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRzdHJpY3RFcXVhbChjb25maWcudmVyc2lvbiwgJzAuNS4wLWFscGhhJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBXaW5kb3dzIGZpbGVzeXN0ZW0gc3ltbGluayBwYXRocyBhbmQgcmVzb2x2ZXMgdGhlaXIgdGFyZ2V0cyB3aGVuIHdyaXRpbmcgTVhDIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRlbmFibGVXaW5kb3dzU2FuZGJveCgpO1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hXaW5kb3dzRmlsZVN5c3RlbSwge1xuXHRcdFx0YWxsb3dXcml0ZTogWydDOlxcXFxjb25maWd1cmVkXFxcXHdyaXRlLWxpbmsnXSxcblx0XHRcdGFsbG93UmVhZDogWydDOlxcXFxjb25maWd1cmVkXFxcXHJlYWQtbGluayddLFxuXHRcdFx0ZGVueVJlYWQ6IFsnQzpcXFxcY29uZmlndXJlZFxcXFxzZWNyZXQtbGluayddLFxuXHRcdH0pO1xuXHRcdGZpbGVTZXJ2aWNlLnNldFJlYWxwYXRoKCcvYzovd29ya3NwYWNlLWxpbmsnLCAnL2M6L3JlYWwvd29ya3NwYWNlJyk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0UmVhbHBhdGgoJy9jOi9jb25maWd1cmVkL3dyaXRlLWxpbmsnLCAnL2M6L3JlYWwvY29uZmlndXJlZC13cml0ZScpO1xuXHRcdGZpbGVTZXJ2aWNlLnNldFJlYWxwYXRoKCcvYzovY29uZmlndXJlZC9yZWFkLWxpbmsnLCAnL2M6L3JlYWwvY29uZmlndXJlZC1yZWFkJyk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0UmVhbHBhdGgoJy9jOi9jb25maWd1cmVkL3NlY3JldC1saW5rJywgJy9jOi9yZWFsL2NvbmZpZ3VyZWQtc2VjcmV0Jyk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0UmVhbHBhdGgoJy9jOi90b29scy9ub2RlJywgJy9jOi9yZWFsL3Rvb2xzLW5vZGUnKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2luZG93c0hvc3Qoe1xuXHRcdFx0Z2V0V3JpdGVSb290czogKCkgPT4gW1VSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvYzovd29ya3NwYWNlLWxpbmsnIH0pXSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gaGVsbG8nLCBmYWxzZSwgJ3B3c2gnKTtcblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5yZWFkd3JpdGVQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovd29ya3NwYWNlLWxpbmsnKSwgJ1dvcmtzcGFjZSB3cml0ZSByb290IHN5bWxpbmsgc2hvdWxkIGJlIHByZXNlcnZlZCBvbiBXaW5kb3dzJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZHdyaXRlUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3JlYWwvd29ya3NwYWNlJyksICdXb3Jrc3BhY2Ugd3JpdGUgcm9vdCBzeW1saW5rIHRhcmdldCBzaG91bGQgYmUgaW5jbHVkZWQgb24gV2luZG93cycpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi9jb25maWd1cmVkL3dyaXRlLWxpbmsnKSwgJ0NvbmZpZ3VyZWQgV2luZG93cyBhbGxvd1dyaXRlIHN5bWxpbmsgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi9yZWFsL2NvbmZpZ3VyZWQtd3JpdGUnKSwgJ0NvbmZpZ3VyZWQgV2luZG93cyBhbGxvd1dyaXRlIHN5bWxpbmsgdGFyZ2V0IHNob3VsZCBiZSBpbmNsdWRlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L2NvbmZpZ3VyZWQvcmVhZC1saW5rJyksICdDb25maWd1cmVkIFdpbmRvd3MgYWxsb3dSZWFkIHN5bWxpbmsgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3JlYWwvY29uZmlndXJlZC1yZWFkJyksICdDb25maWd1cmVkIFdpbmRvd3MgYWxsb3dSZWFkIHN5bWxpbmsgdGFyZ2V0IHNob3VsZCBiZSBpbmNsdWRlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3Rvb2xzL25vZGUnKSwgJ1dpbmRvd3MgcG9saWN5IHJlYWRvbmx5IHN5bWxpbmsgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3JlYWwvdG9vbHMtbm9kZScpLCAnV2luZG93cyBwb2xpY3kgcmVhZG9ubHkgc3ltbGluayB0YXJnZXQgc2hvdWxkIGJlIGluY2x1ZGVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uZGVuaWVkUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L2NvbmZpZ3VyZWQvc2VjcmV0LWxpbmsnKSwgJ0NvbmZpZ3VyZWQgV2luZG93cyBkZW55UmVhZCBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5kZW5pZWRQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovcmVhbC9jb25maWd1cmVkLXNlY3JldCcpLCAnQ29uZmlndXJlZCBXaW5kb3dzIGRlbnlSZWFkIHN5bWxpbmsgdGFyZ2V0IHNob3VsZCBiZSBpbmNsdWRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cmFwQ29tbWFuZCB1c2VzIGFybTY0IE1YQyBleGVjdXRhYmxlIG9uIFdpbmRvd3MgYXJtNjQnLCBhc3luYyAoKSA9PiB7XG5cdFx0ZW5hYmxlV2luZG93c1NhbmRib3goKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2luZG93c0hvc3Qoe1xuXHRcdFx0Z2V0UnVudGltZUluZm86ICgpID0+IFByb21pc2UucmVzb2x2ZSh7IGFwcFJvb3Q6ICdDOlxcXFxhcHAnLCBhcmNoOiAnYXJtNjQnIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGNvbnN0IHdyYXBwZWQgPSBhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gaGVsbG8nLCBmYWxzZSwgJ3B3c2gnKTtcblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRzdHJpY3RFcXVhbCh3cmFwcGVkLmNvbW1hbmQsIGAmICdDOlxcXFxhcHBcXFxcbm9kZV9tb2R1bGVzXFxcXEBtaWNyb3NvZnRcXFxcbXhjLXNka1xcXFxiaW5cXFxcYXJtNjRcXFxcd3hjLWV4ZWMuZXhlJyAnJHtjb25maWdQYXRofSdgKTtcblx0XHRzdHJpY3RFcXVhbChub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChjb25maWcucHJvY2Vzcy5jd2QpLCAnYzovd29ya3NwYWNlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyYXBDb21tYW5kIHJld3JpdGVzIE1YQyBjb25maWcgd2hlbiBXaW5kb3dzIGNvbW1hbmQgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRlbmFibGVXaW5kb3dzU2FuZGJveCgpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVXaW5kb3dzSG9zdCgpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnZWNobyBmaXJzdCcsIGZhbHNlLCAnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGUnKTtcblx0XHRsZXQgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGZpcnN0Q29tbWFuZExpbmUgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKS5wcm9jZXNzLmNvbW1hbmRMaW5lO1xuXHRcdHN0cmljdEVxdWFsKGZpcnN0Q29tbWFuZExpbmUsICdcIkM6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlXCIgLU5vUHJvZmlsZSAtQ29tbWFuZCBcImVjaG8gZmlyc3RcIicpO1xuXG5cdFx0YXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdlY2hvIHNlY29uZCcsIGZhbHNlLCAnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGUnKTtcblx0XHRjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3Qgc2Vjb25kQ29tbWFuZExpbmUgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKS5wcm9jZXNzLmNvbW1hbmRMaW5lO1xuXHRcdHN0cmljdEVxdWFsKHNlY29uZENvbW1hbmRMaW5lLCAnXCJDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFBvd2VyU2hlbGxcXFxcN1xcXFxwd3NoLmV4ZVwiIC1Ob1Byb2ZpbGUgLUNvbW1hbmQgXCJlY2hvIHNlY29uZFwiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FsbG93TmV0d29yayBtYXBzIHRvIE1YQyBhbGxvdyBuZXR3b3JrIGNvbmZpZyBvbiBXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hXaW5kb3dzRW5hYmxlZCwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uKTtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrLCB0cnVlKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2luZG93c0hvc3QoKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2N1cmwgaHR0cHM6Ly9leGFtcGxlLmNvbScsIGZhbHNlLCAncHdzaCcpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbChjb25maWcubmV0d29yaywgeyBkZWZhdWx0UG9saWN5OiAnYWxsb3cnLCBlbmZvcmNlbWVudE1vZGU6ICdjYXBhYmlsaXRpZXMnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdXaW5kb3dzIE1YQyBjb25maWcgaWdub3JlcyB1bnN1cHBvcnRlZCBuZXR3b3JrIGhvc3QgbGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0ZW5hYmxlV2luZG93c1NhbmRib3goKTtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuQWxsb3dlZE5ldHdvcmtEb21haW5zLCBbJ2V4YW1wbGUuY29tJ10pO1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5EZW5pZWROZXR3b3JrRG9tYWlucywgWydibG9ja2VkLmV4YW1wbGUuY29tJ10pO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVXaW5kb3dzSG9zdCgpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnY3VybCBodHRwczovL2V4YW1wbGUuY29tJywgZmFsc2UsICdwd3NoJyk7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXG5cdFx0ZGVlcFN0cmljdEVxdWFsKGNvbmZpZy5uZXR3b3JrLCB7IGRlZmF1bHRQb2xpY3k6ICdhbGxvdycsIGVuZm9yY2VtZW50TW9kZTogJ2NhcGFiaWxpdGllcycgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgT1Mtc3BlY2lmaWMgZmlsZXN5c3RlbSBhYnNvbHV0ZSBwYXRoIGRldGVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW51eEVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGNyZWF0ZUhvc3QoKSkpO1xuXHRcdGF3YWl0IGxpbnV4RW5naW5lLmdldE9TKCk7XG5cdFx0Y29uc3QgaXNMaW51eEFic29sdXRlUGF0aCA9IChsaW51eEVuZ2luZSBhcyB1bmtub3duIGFzIHsgX2lzQWJzb2x1dGVGaWxlU3lzdGVtUGF0aChwYXRoOiBzdHJpbmcpOiBib29sZWFuIH0pLl9pc0Fic29sdXRlRmlsZVN5c3RlbVBhdGguYmluZChsaW51eEVuZ2luZSk7XG5cblx0XHRzdHJpY3RFcXVhbChpc0xpbnV4QWJzb2x1dGVQYXRoKCcvaG9tZS91c2VyJyksIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKGlzTGludXhBYnNvbHV0ZVBhdGgoJ3JlbGF0aXZlL3BhdGgnKSwgZmFsc2UpO1xuXHRcdHN0cmljdEVxdWFsKGlzTGludXhBYnNvbHV0ZVBhdGgoJ0M6XFxcXFVzZXJzXFxcXHVzZXInKSwgZmFsc2UpO1xuXG5cdFx0Y29uc3Qgd2luZG93c0VuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGNyZWF0ZUhvc3QoeyBnZXRPUzogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB9KSkpO1xuXHRcdGF3YWl0IHdpbmRvd3NFbmdpbmUuZ2V0T1MoKTtcblx0XHRjb25zdCBpc1dpbmRvd3NBYnNvbHV0ZVBhdGggPSAod2luZG93c0VuZ2luZSBhcyB1bmtub3duIGFzIHsgX2lzQWJzb2x1dGVGaWxlU3lzdGVtUGF0aChwYXRoOiBzdHJpbmcpOiBib29sZWFuIH0pLl9pc0Fic29sdXRlRmlsZVN5c3RlbVBhdGguYmluZCh3aW5kb3dzRW5naW5lKTtcblxuXHRcdHN0cmljdEVxdWFsKGlzV2luZG93c0Fic29sdXRlUGF0aCgnL1VzZXJzL3VzZXInKSwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwoaXNXaW5kb3dzQWJzb2x1dGVQYXRoKCdDOlxcXFxVc2Vyc1xcXFx1c2VyJyksIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKGlzV2luZG93c0Fic29sdXRlUGF0aCgnQzovVXNlcnMvdXNlcicpLCB0cnVlKTtcblx0XHRzdHJpY3RFcXVhbChpc1dpbmRvd3NBYnNvbHV0ZVBhdGgoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlJyksIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKGlzV2luZG93c0Fic29sdXRlUGF0aCgncmVsYXRpdmVcXFxccGF0aCcpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMgcmVwb3J0cyBtaXNzaW5nIGRlcGVuZGVuY2llcycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc3RhdHVzOiBJU2FuZGJveERlcGVuZGVuY3lTdGF0dXMgPSB7IGJ1YmJsZXdyYXBJbnN0YWxsZWQ6IGZhbHNlLCBidWJibGV3cmFwVXNhYmxlOiBmYWxzZSwgc29jYXRJbnN0YWxsZWQ6IHRydWUsIGRlcGVuZGVuY3lJbnN0YWxsQ29tbWFuZDogJ3N1ZG8gcGFjbWFuIC1TIC0tbmVlZGVkIC0tbm9jb25maXJtJyB9O1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHtcblx0XHRcdGNoZWNrU2FuZGJveERlcGVuZGVuY2llczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHN0YXR1cyksXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZW5naW5lLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMoKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuZW5hYmxlZCwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmZhaWxlZENoZWNrLCAnZGVwZW5kZW5jaWVzJyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lm1pc3NpbmdEZXBlbmRlbmNpZXM/LlswXSwgJ2J1YmJsZXdyYXAnKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuY2FuSW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXMsIHRydWUpO1xuXG5cdFx0c3RhdHVzID0geyBidWJibGV3cmFwSW5zdGFsbGVkOiB0cnVlLCBidWJibGV3cmFwVXNhYmxlOiB0cnVlLCBzb2NhdEluc3RhbGxlZDogdHJ1ZSB9O1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBlbmdpbmUuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcyh0cnVlKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQyLmZhaWxlZENoZWNrLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzIGNhY2hlcyBtaXNzaW5nIGRlcGVuZGVuY2llcyB1bnRpbCBmb3JjZSByZWZyZXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBjYWxsQ291bnQgPSAwO1xuXHRcdGxldCBzdGF0dXM6IElTYW5kYm94RGVwZW5kZW5jeVN0YXR1cyA9IHsgYnViYmxld3JhcEluc3RhbGxlZDogZmFsc2UsIGJ1YmJsZXdyYXBVc2FibGU6IGZhbHNlLCBzb2NhdEluc3RhbGxlZDogdHJ1ZSB9O1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHtcblx0XHRcdGNoZWNrU2FuZGJveERlcGVuZGVuY2llczogKCkgPT4ge1xuXHRcdFx0XHRjYWxsQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShzdGF0dXMpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IGVuZ2luZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKCk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgZW5naW5lLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMoKTtcblxuXHRcdHN0cmljdEVxdWFsKGZpcnN0LmZhaWxlZENoZWNrLCBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5EZXBlbmRlbmNpZXMpO1xuXHRcdHN0cmljdEVxdWFsKHNlY29uZC5mYWlsZWRDaGVjaywgVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suRGVwZW5kZW5jaWVzKTtcblx0XHRzdHJpY3RFcXVhbChjYWxsQ291bnQsIDEsICdNaXNzaW5nIGRlcGVuZGVuY2llcyBzaG91bGQgYmUgY2hlY2tlZCBvbmNlIGFuZCBjYWNoZWQnKTtcblxuXHRcdHN0YXR1cyA9IHsgYnViYmxld3JhcEluc3RhbGxlZDogdHJ1ZSwgYnViYmxld3JhcFVzYWJsZTogdHJ1ZSwgc29jYXRJbnN0YWxsZWQ6IHRydWUgfTtcblx0XHRjb25zdCBjYWNoZWQgPSBhd2FpdCBlbmdpbmUuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcygpO1xuXHRcdHN0cmljdEVxdWFsKGNhY2hlZC5mYWlsZWRDaGVjaywgVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suRGVwZW5kZW5jaWVzLCAnTm9uLWZvcmNlZCBjaGVja3Mgc2hvdWxkIGtlZXAgdXNpbmcgdGhlIGNhY2hlZCBtaXNzaW5nIHN0YXR1cycpO1xuXHRcdHN0cmljdEVxdWFsKGNhbGxDb3VudCwgMSk7XG5cblx0XHRjb25zdCByZWZyZXNoZWQgPSBhd2FpdCBlbmdpbmUuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcyh0cnVlKTtcblx0XHRzdHJpY3RFcXVhbChyZWZyZXNoZWQuZmFpbGVkQ2hlY2ssIHVuZGVmaW5lZCk7XG5cdFx0c3RyaWN0RXF1YWwoY2FsbENvdW50LCAyLCAnRm9yY2UgcmVmcmVzaCBzaG91bGQgcmUtY2hlY2sgZGVwZW5kZW5jaWVzIGFmdGVyIGluc3RhbGwgb3IgcmVwYWlyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMgcmVwb3J0cyByZW1lZGlhdGlvbiB3aGVuIGJ1YmJsZXdyYXAgaXMgdW51c2FibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoe1xuXHRcdFx0Y2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0XHRidWJibGV3cmFwSW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0XHRidWJibGV3cmFwVXNhYmxlOiBmYWxzZSxcblx0XHRcdFx0YnViYmxld3JhcEVycm9yOiAnQ3JlYXRpbmcgbmV3IG5hbWVzcGFjZSBmYWlsZWQnLFxuXHRcdFx0XHRzb2NhdEluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdFx0YXBwYXJtb3JSZXN0cmljdHNVbnByaXZpbGVnZWRVc2VyTmFtZXNwYWNlczogdHJ1ZSxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKCk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuZmFpbGVkQ2hlY2ssIFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkJ1YmJsZXdyYXApO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChyZXN1bHQucmVtZWRpYXRpb25zLCBbVGVybWluYWxTYW5kYm94UHJlQ2hlY2tSZW1lZGlhdGlvbi5EaXNhYmxlVW5wcml2aWxhZ2VkdXNlcm5hbWVzcGFjZVJlc3RyaWN0aW9uXSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmRldGFpbCwgJ0NyZWF0aW5nIG5ldyBuYW1lc3BhY2UgZmFpbGVkJyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lm1pc3NpbmdEZXBlbmRlbmNpZXMsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMgZW5hYmxlcyB3ZWFrZXIgbmVzdGVkIHNhbmRib3ggd2hlbiBBcHBBcm1vciBpcyBub3QgcmVzdHJpY3RpbmcgdXNlciBuYW1lc3BhY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBZHZhbmNlZFJ1bnRpbWUsIHsgYWxsb3dQdHk6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHtcblx0XHRcdGNoZWNrU2FuZGJveERlcGVuZGVuY2llczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0YnViYmxld3JhcEluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdFx0YnViYmxld3JhcFVzYWJsZTogZmFsc2UsXG5cdFx0XHRcdHNvY2F0SW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0XHRhcHBhcm1vclJlc3RyaWN0c1VucHJpdmlsZWdlZFVzZXJOYW1lc3BhY2VzOiBmYWxzZSxcblx0XHRcdH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKCk7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoISkhKTtcblxuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5mYWlsZWRDaGVjaywgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChjb25maWcuZW5hYmxlV2Vha2VyTmVzdGVkU2FuZGJveCwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwoY29uZmlnLmFsbG93UHR5LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMgZW5hYmxlcyB3ZWFrZXIgbmVzdGVkIHNhbmRib3ggYWZ0ZXIgQXBwQXJtb3IgcmVtZWRpYXRpb24gZG9lcyBub3QgZml4IGJ1YmJsZXdyYXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoe1xuXHRcdFx0Y2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0XHRidWJibGV3cmFwSW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0XHRidWJibGV3cmFwVXNhYmxlOiBmYWxzZSxcblx0XHRcdFx0c29jYXRJbnN0YWxsZWQ6IHRydWUsXG5cdFx0XHRcdGFwcGFybW9yUmVzdHJpY3RzVW5wcml2aWxlZ2VkVXNlck5hbWVzcGFjZXM6IHRydWUsXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRjb25zdCBiZWZvcmVSZW1lZGlhdGlvbiA9IGF3YWl0IGVuZ2luZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKCk7XG5cdFx0Y29uc3QgYWZ0ZXJSZW1lZGlhdGlvbiA9IGF3YWl0IGVuZ2luZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKHRydWUpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChhZnRlclJlbWVkaWF0aW9uLnNhbmRib3hDb25maWdQYXRoISkhKTtcblxuXHRcdHN0cmljdEVxdWFsKGJlZm9yZVJlbWVkaWF0aW9uLmZhaWxlZENoZWNrLCBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5CdWJibGV3cmFwKTtcblx0XHRzdHJpY3RFcXVhbChhZnRlclJlbWVkaWF0aW9uLmZhaWxlZENoZWNrLCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKGNvbmZpZy5lbmFibGVXZWFrZXJOZXN0ZWRTYW5kYm94LCB0cnVlKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsSUFBSSxtQkFBbUI7QUFFakQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLG1DQUFtQztBQUU1QyxTQUFTLDBCQUEwQiw2QkFBNkI7QUFDaEUsU0FBa0UsNkJBQTZCO0FBQy9GLFNBQVMsbUNBQW1DLHdDQUF3QztBQUNwRixTQUFTLGtDQUFrQywwQ0FBMEM7QUFFckYsTUFBTSx5QkFBeUIsTUFBTTtBQUNwQyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixXQUFTLGtCQUFrQixLQUFhLE9BQXNCO0FBQzdELG9CQUFnQixJQUFJLEtBQUssS0FBSztBQUM5QiwyQkFBdUIsS0FBSztBQUFBLEVBQzdCO0FBQUEsRUFFQSxNQUFNLGdCQUFnQjtBQUFBLElBQXRCO0FBQ0MsV0FBaUIsYUFBYSxvQkFBSSxJQUFvQjtBQUFBO0FBQUEsSUFFdEQsWUFBWSxNQUFjLFVBQXdCO0FBQ2pELFdBQUssV0FBVyxJQUFJLE1BQU0sUUFBUTtBQUFBLElBQ25DO0FBQUEsSUFFQSxNQUFNLFNBQVMsS0FBb0M7QUFDbEQsWUFBTSxXQUFXLEtBQUssV0FBVyxJQUFJLElBQUksSUFBSTtBQUM3QyxhQUFPLFdBQVcsSUFBSSxLQUFLLEVBQUUsTUFBTSxTQUFTLENBQUMsSUFBSTtBQUFBLElBQ2xEO0FBQUEsSUFFQSxNQUFNLFdBQVcsS0FBVSxTQUFpQztBQUMzRDtBQUNBLFlBQU0sZ0JBQWdCLFFBQVEsU0FBUztBQUN2QyxtQkFBYSxJQUFJLElBQUksTUFBTSxhQUFhO0FBQ3hDLG1CQUFhLElBQUksSUFBSSxRQUFRLGFBQWE7QUFDMUMsVUFBSSxlQUFlLEtBQUssSUFBSSxJQUFJLEdBQUc7QUFDbEMscUJBQWEsSUFBSSxJQUFJLEtBQUssTUFBTSxDQUFDLEVBQUUsUUFBUSxPQUFPLElBQUksR0FBRyxhQUFhO0FBQUEsTUFDdkU7QUFDQSxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQUEsSUFDQSxNQUFNLGFBQWEsS0FBd0I7QUFDMUMscUJBQWUsS0FBSyxJQUFJLElBQUk7QUFDNUIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUFBLElBQ0EsTUFBTSxJQUFJLE1BQTBCO0FBQUEsSUFBRTtBQUFBLEVBQ3ZDO0FBRUEsV0FBUyxrQ0FBa0MsYUFBcUIsUUFBa0Msa0JBQTJCLGdCQUF3QiwyQkFBMkIsY0FBNEMsV0FBOEI7QUFDelAsVUFBTSxjQUFjLE9BQU8sWUFBWSxxQkFBcUI7QUFDNUQsVUFBTSxVQUFVO0FBQUEsTUFDZixlQUFlLE9BQU8sU0FBUyxnQkFBZ0IsVUFBVTtBQUFBLE1BQ3pELEdBQUksT0FBTyxTQUFTLHNCQUFzQixTQUFZLEVBQUUsbUJBQW1CLE9BQU8sUUFBUSxrQkFBa0IsSUFBSSxDQUFDO0FBQUEsTUFDakgsR0FBSSxPQUFPLFVBQVUsRUFBRSxpQkFBaUIsZUFBd0IsSUFBSSxDQUFDO0FBQUEsSUFDdEU7QUFDQSxXQUFPO0FBQUEsTUFDTixTQUFTLE9BQU87QUFBQSxNQUNoQixhQUFhO0FBQUEsTUFDYjtBQUFBLE1BQ0EsV0FBVztBQUFBLFFBQ1YsZUFBZTtBQUFBLFFBQ2YsZ0JBQWdCLENBQUM7QUFBQSxNQUNsQjtBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1I7QUFBQSxRQUNBLEtBQUs7QUFBQSxRQUNMLFNBQVMsT0FBTyxhQUFhO0FBQUEsTUFDOUI7QUFBQSxNQUNBLGtCQUFrQjtBQUFBLFFBQ2pCLGdCQUFnQjtBQUFBLFFBQ2hCLGNBQWMsT0FBTyxTQUFTLGdCQUFnQixDQUFDLGdCQUFnQixJQUFJLENBQUM7QUFBQSxRQUNwRSxJQUFJO0FBQUEsVUFDSCxXQUFXO0FBQUEsVUFDWCxzQkFBc0I7QUFBQSxVQUN0QixnQkFBZ0I7QUFBQSxVQUNoQixLQUFLO0FBQUEsUUFDTjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFlBQVk7QUFBQSxRQUNYLGdCQUFnQixDQUFDLEdBQUksT0FBTyxZQUFZLGtCQUFrQixDQUFDLENBQUU7QUFBQSxRQUM3RCxlQUFlLENBQUMsR0FBSSxPQUFPLFlBQVksaUJBQWlCLENBQUMsQ0FBRTtBQUFBLFFBQzNELGFBQWEsQ0FBQyxHQUFJLE9BQU8sWUFBWSxlQUFlLENBQUMsQ0FBRTtBQUFBLE1BQ3hEO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSTtBQUFBLFFBQ0gsU0FBUyxFQUFFLE9BQU8sSUFBSSxnQkFBZ0I7QUFBQSxRQUN0QyxXQUFXLE9BQU8sSUFBSSxhQUFhO0FBQUEsUUFDbkMsV0FBVyxPQUFPLElBQUksdUJBQXVCO0FBQUEsTUFDOUM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFdBQVMsV0FBVyxZQUFpRCxDQUFDLEdBQWlFO0FBQ3RJLFVBQU0sZUFBZSxJQUFJLFFBQWM7QUFDdkMsVUFBTSxpQkFBOEM7QUFBQSxNQUNuRCxTQUFTO0FBQUEsTUFDVCxVQUFVO0FBQUEsTUFDVixXQUFXO0FBQUEsSUFDWjtBQUNBLFVBQU0sT0FBbUM7QUFBQSxNQUN4QyxPQUFPLE1BQU0sUUFBUSxRQUFRLGdCQUFnQixLQUFLO0FBQUEsTUFDbEQsZ0JBQWdCLE1BQU0sUUFBUSxRQUFRLGNBQWM7QUFBQSxNQUNwRCxhQUFhLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxZQUFZLENBQUM7QUFBQSxNQUN6RCxtQkFBbUIsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLDJCQUEyQixDQUFDO0FBQUEsTUFDOUUsNkJBQTZCLE1BQU0sUUFBUSxRQUFRLE1BQVM7QUFBQSxNQUM1RCxlQUFlLE1BQU0sQ0FBQyxJQUFJLEtBQUssWUFBWSxDQUFDO0FBQUEsTUFDNUMsa0JBQWtCLGFBQWE7QUFBQSxNQUMvQiwwQkFBMEIsTUFBcUQsUUFBUSxRQUFRLEVBQUUscUJBQXFCLE1BQU0sa0JBQWtCLE1BQU0sZ0JBQWdCLEtBQUssQ0FBQztBQUFBLE1BQzFLLCtCQUErQixNQUF3RCxRQUFRLFFBQVEsTUFBUztBQUFBLE1BQ2hILDBCQUEwQixNQUFxQyxRQUFRLFFBQVEsTUFBUztBQUFBLE1BQ3hGLCtCQUErQixDQUFDLGFBQWEsUUFBUSxrQkFBa0IsZUFBZSxnQkFBd0QsUUFBUSxRQUFRLGtDQUFrQyxhQUFhLFFBQVEsa0JBQWtCLGVBQWUsV0FBVyxDQUFDO0FBQUEsTUFDbFEsbUJBQW1CLENBQUksY0FBcUMsZ0JBQWdCLElBQUksU0FBUyxJQUFJLGdCQUFnQixJQUFJLFNBQVMsSUFBUztBQUFBLE1BQ25JLDRCQUE0Qix1QkFBdUI7QUFBQSxNQUNuRCxHQUFHO0FBQUEsSUFDSjtBQUNBLFdBQU8sT0FBTyxPQUFPLE1BQU0sRUFBRSxhQUFhLENBQUM7QUFBQSxFQUM1QztBQUVBLFdBQVMsa0JBQWtCLFlBQWlELENBQUMsR0FBaUU7QUFDN0ksV0FBTyxXQUFXO0FBQUEsTUFDakIsT0FBTyxNQUFNLFFBQVEsUUFBUSxnQkFBZ0IsT0FBTztBQUFBLE1BQ3BELGdCQUFnQixNQUFNLFFBQVEsUUFBUSxFQUFFLFNBQVMsV0FBVyxNQUFNLE1BQU0sQ0FBQztBQUFBLE1BQ3pFLGFBQWEsTUFBTSxRQUFRLFFBQVEsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLE1BQU0saUJBQWlCLENBQUMsQ0FBQztBQUFBLE1BQ3ZGLG1CQUFtQixNQUFNLFFBQVEsUUFBUSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsTUFBTSxnQ0FBZ0MsQ0FBQyxDQUFDO0FBQUEsTUFDNUcsNkJBQTZCLE1BQU0sUUFBUSxRQUFRLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxNQUFNLCtDQUErQyxDQUFDLENBQUM7QUFBQSxNQUNySSxlQUFlLE1BQU0sQ0FBQyxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsTUFDekUsK0JBQStCLE1BQU0sUUFBUSxRQUFRLEVBQUUsZUFBZSxDQUFDLG1CQUFtQixxQkFBcUIsZ0RBQWdELEdBQUcsZ0JBQWdCLENBQUMsdUNBQXVDLEVBQUUsQ0FBQztBQUFBLE1BQzdOLDBCQUEwQixNQUFNLFFBQVEsUUFBUTtBQUFBLFFBQy9DO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFBQSxNQUNELEdBQUc7QUFBQSxJQUNKLENBQUM7QUFBQSxFQUNGO0FBRUEsV0FBUyw4QkFBOEIsTUFBc0I7QUFDNUQsV0FBTyxLQUFLLFFBQVEsT0FBTyxHQUFHLEVBQUUsWUFBWTtBQUFBLEVBQzdDO0FBRUEsV0FBUyx1QkFBNkI7QUFDckMsc0JBQWtCLHNCQUFzQiw0QkFBNEIseUJBQXlCLEVBQUU7QUFDL0Ysc0JBQWtCLHNCQUFzQiwwQkFBMEIsSUFBSTtBQUFBLEVBQ3ZFO0FBRUEsUUFBTSxNQUFNO0FBQ1gsbUJBQWUsb0JBQUksSUFBSTtBQUN2QixzQkFBa0I7QUFDbEIscUJBQWlCLENBQUM7QUFDbEIsMkJBQXVCLE1BQU0sSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQy9ELHNCQUFrQixvQkFBSSxJQUFJO0FBQzFCLDZCQUF5QixNQUFNLElBQUksSUFBSSxRQUFjLENBQUM7QUFDdEQsa0JBQWMsSUFBSSxnQkFBZ0I7QUFFbEMsb0JBQWdCLElBQUksc0JBQXNCLHFCQUFxQix5QkFBeUIsRUFBRTtBQUMxRixvQkFBZ0IsSUFBSSxzQkFBc0IsMkNBQTJDLElBQUk7QUFFekYseUJBQXFCLEtBQUssY0FBYyxXQUFXO0FBQ25ELHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QseUJBQXFCLEtBQUssbUNBQW1DLHFCQUFxQixlQUFlLGdDQUFnQyxDQUFDO0FBQUEsRUFDbkksQ0FBQztBQUVELE9BQUssMkVBQTJFLFlBQVk7QUFDM0YsVUFBTSxPQUFPLFdBQVc7QUFBQSxNQUN2QixnQkFBZ0IsTUFBTSxRQUFRLFFBQVEsRUFBRSxTQUFTLFFBQVEsVUFBVSxpQkFBaUIsV0FBVyxLQUFLLENBQUM7QUFBQSxJQUN0RyxDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBQ3pGLFVBQU0sT0FBTyxxQkFBcUI7QUFFbEMsVUFBTSxVQUFVLE1BQU0sT0FBTyxZQUFZLFNBQVM7QUFFbEQsZ0JBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUMxQyxPQUFHLFFBQVEsUUFBUSxXQUFXLHlCQUF5QixHQUFHLG1EQUFtRCxRQUFRLE9BQU8sRUFBRTtBQUFBLEVBQy9ILENBQUM7QUFFRCxPQUFLLDJEQUEyRCxZQUFZO0FBQzNFLFVBQU0sT0FBTyxXQUFXO0FBQUEsTUFDdkIsZ0JBQWdCLE1BQU0sUUFBUSxRQUFRLEVBQUUsU0FBUyxRQUFRLFVBQVUsYUFBYSxXQUFXLE1BQU0sQ0FBQztBQUFBLElBQ25HLENBQUM7QUFDRCxVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixJQUFJLENBQUM7QUFDekYsVUFBTSxPQUFPLHFCQUFxQjtBQUVsQyxVQUFNLFVBQVUsTUFBTSxPQUFPLFlBQVksU0FBUztBQUVsRCxnQkFBWSxRQUFRLGtCQUFrQixJQUFJO0FBQzFDLE9BQUcsQ0FBQyxRQUFRLFFBQVEsV0FBVyx1QkFBdUIsR0FBRyx1REFBdUQsUUFBUSxPQUFPLEVBQUU7QUFBQSxFQUNsSSxDQUFDO0FBRUQsT0FBSywwRUFBMEUsWUFBWTtBQUMxRixVQUFNLE9BQU8sV0FBVztBQUN4QixVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixJQUFJLENBQUM7QUFDekYsVUFBTSxPQUFPLHFCQUFxQjtBQUVsQyxVQUFNLFVBQVUsTUFBTSxPQUFPLFlBQVksU0FBUztBQUVsRCxPQUFHLFFBQVEsUUFBUSxTQUFTLHlEQUF5RCxJQUFJLEVBQUUsR0FBRyxxRUFBcUUsUUFBUSxPQUFPLEVBQUU7QUFBQSxFQUNyTCxDQUFDO0FBRUQsT0FBSyx5REFBeUQsWUFBWTtBQUN6RSxVQUFNLE9BQU8sV0FBVyxFQUFFLE9BQU8sTUFBTSxRQUFRLFFBQVEsZ0JBQWdCLFNBQVMsRUFBRSxDQUFDO0FBQ25GLFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLElBQUksQ0FBQztBQUV6RixVQUFNLGFBQWEsTUFBTSxPQUFPLHFCQUFxQjtBQUNyRCxPQUFHLFlBQVksK0JBQStCO0FBQzlDLFVBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYSxJQUFJLFVBQVUsQ0FBRTtBQUV2RCxnQkFBWSxPQUFPLFVBQVUsSUFBSTtBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxZQUFZO0FBQ2pGLFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLFdBQVcsQ0FBQyxDQUFDO0FBRWpHLFVBQU0sYUFBYSxNQUFNLE9BQU8scUJBQXFCO0FBQ3JELE9BQUcsWUFBWSwrQkFBK0I7QUFDOUMsVUFBTSxTQUFTLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFO0FBRXZELGdCQUFZLE9BQU8sVUFBVSxlQUFlLEtBQUssUUFBUSxVQUFVLEdBQUcsS0FBSztBQUFBLEVBQzVFLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxZQUFZO0FBQ25GLHNCQUFrQixzQkFBc0IsNkJBQTZCLEVBQUUsVUFBVSxNQUFNLENBQUM7QUFDeEYsVUFBTSxPQUFPLFdBQVcsRUFBRSxPQUFPLE1BQU0sUUFBUSxRQUFRLGdCQUFnQixTQUFTLEVBQUUsQ0FBQztBQUNuRixVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixJQUFJLENBQUM7QUFFekYsVUFBTSxhQUFhLE1BQU0sT0FBTyxxQkFBcUI7QUFDckQsT0FBRyxZQUFZLCtCQUErQjtBQUM5QyxVQUFNLFNBQVMsS0FBSyxNQUFNLGFBQWEsSUFBSSxVQUFVLENBQUU7QUFFdkQsZ0JBQVksT0FBTyxVQUFVLEtBQUs7QUFBQSxFQUNuQyxDQUFDO0FBRUQsT0FBSywyRkFBMkYsWUFBWTtBQUMzRyxzQkFBa0Isc0JBQXNCLDBCQUEwQixJQUFJO0FBQ3RFLHNCQUFrQixzQkFBc0IsNkJBQTZCO0FBQUEsTUFDcEUsU0FBUztBQUFBLFFBQ1IscUJBQXFCO0FBQUEsUUFDckIsU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixXQUFXLENBQUMsQ0FBQztBQUVqRyxVQUFNLGFBQWEsTUFBTSxPQUFPLHFCQUFxQjtBQUNyRCxPQUFHLFlBQVksK0JBQStCO0FBQzlDLFVBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYSxJQUFJLFVBQVUsQ0FBRTtBQUV2RCxvQkFBZ0IsT0FBTyxTQUFTO0FBQUEsTUFDL0IsZ0JBQWdCLENBQUM7QUFBQSxNQUNqQixlQUFlLENBQUM7QUFBQSxNQUNoQixTQUFTO0FBQUEsTUFDVCxxQkFBcUI7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvRkFBb0YsWUFBWTtBQUNwRyxzQkFBa0Isc0JBQXNCLDJDQUEyQyxJQUFJO0FBQ3ZGLFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLFdBQVcsQ0FBQyxDQUFDO0FBRWpHLFVBQU0sVUFBVSxNQUFNLE9BQU8sWUFBWSw0QkFBNEIsT0FBTyxRQUFRLFFBQVcsUUFBVyxJQUFJO0FBQzlHLFVBQU0sYUFBYSxNQUFNLE9BQU8scUJBQXFCO0FBQ3JELE9BQUcsWUFBWSwrQkFBK0I7QUFDOUMsVUFBTSxxQkFBcUIsS0FBSyxNQUFNLGFBQWEsSUFBSSxVQUFVLENBQUU7QUFFbkUsZ0JBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUMxQyxnQkFBWSxRQUFRLGtDQUFrQyxJQUFJO0FBQzFELG9CQUFnQixtQkFBbUIsU0FBUyxFQUFFLGdCQUFnQixDQUFDLEdBQUcsZUFBZSxDQUFDLEdBQUcsU0FBUyxNQUFNLENBQUM7QUFFckcsVUFBTSxPQUFPLFlBQVksdUJBQXVCO0FBQ2hELFVBQU0sbUJBQW1CLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFO0FBQ2pFLG9CQUFnQixpQkFBaUIsU0FBUyxFQUFFLGdCQUFnQixDQUFDLEdBQUcsZUFBZSxDQUFDLEVBQUUsQ0FBQztBQUFBLEVBQ3BGLENBQUM7QUFFRCxPQUFLLDRGQUE0RixZQUFZO0FBQzVHLHNCQUFrQixzQkFBc0IsMkNBQTJDLEtBQUs7QUFDeEYsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsV0FBVyxDQUFDLENBQUM7QUFFakcsVUFBTSxVQUFVLE1BQU0sT0FBTyxZQUFZLDRCQUE0QixPQUFPLFFBQVEsUUFBVyxRQUFXLElBQUk7QUFDOUcsVUFBTSxhQUFhLE1BQU0sT0FBTyxxQkFBcUI7QUFDckQsT0FBRyxZQUFZLCtCQUErQjtBQUM5QyxVQUFNLFNBQVMsS0FBSyxNQUFNLGFBQWEsSUFBSSxVQUFVLENBQUU7QUFFdkQsZ0JBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUMxQyxnQkFBWSxRQUFRLGtDQUFrQyxNQUFTO0FBQy9ELG9CQUFnQixPQUFPLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLGVBQWUsQ0FBQyxFQUFFLENBQUM7QUFBQSxFQUMxRSxDQUFDO0FBRUQsT0FBSyx1RUFBdUUsWUFBWTtBQUN2RixzQkFBa0Isc0JBQXNCLHNDQUFzQyxJQUFJO0FBQ2xGLFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pHLFVBQU0sT0FBTyxxQkFBcUI7QUFFbEMsVUFBTSxVQUFVLE1BQU0sT0FBTyxZQUFZLE9BQU8sTUFBTSxRQUFRLElBQUksS0FBSyx3QkFBd0IsQ0FBQztBQUVoRyxnQkFBWSxRQUFRLGtCQUFrQixLQUFLO0FBQzNDLE9BQUcsUUFBUSxRQUFRLFNBQVMsd0JBQXdCLEdBQUcsNERBQTRELFFBQVEsT0FBTyxFQUFFO0FBQ3BJLE9BQUcsUUFBUSxRQUFRLFNBQVMsUUFBUSxHQUFHLCtFQUErRSxRQUFRLE9BQU8sRUFBRTtBQUFBLEVBQ3hJLENBQUM7QUFFRCxPQUFLLGtGQUFrRixZQUFZO0FBQ2xHLHNCQUFrQixzQkFBc0IsMkNBQTJDLElBQUk7QUFDdkYsc0JBQWtCLDRCQUE0QixzQkFBc0IsQ0FBQyxhQUFhLENBQUM7QUFDbkYsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsV0FBVyxDQUFDLENBQUM7QUFFakcsVUFBTSxVQUFVLE1BQU0sT0FBTyxZQUFZLDRCQUE0QixPQUFPLE1BQU07QUFDbEYsVUFBTSxhQUFhLE1BQU0sT0FBTyxxQkFBcUI7QUFDckQsT0FBRyxZQUFZLCtCQUErQjtBQUM5QyxVQUFNLFNBQVMsS0FBSyxNQUFNLGFBQWEsSUFBSSxVQUFVLENBQUU7QUFFdkQsZ0JBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUMxQyxnQkFBWSxRQUFRLGtDQUFrQyxJQUFJO0FBQzFELG9CQUFnQixRQUFRLGdCQUFnQixDQUFDLGFBQWEsQ0FBQztBQUN2RCxvQkFBZ0IsUUFBUSxlQUFlLENBQUMsYUFBYSxDQUFDO0FBQ3RELG9CQUFnQixPQUFPLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLGVBQWUsQ0FBQyxHQUFHLFNBQVMsTUFBTSxDQUFDO0FBQUEsRUFDMUYsQ0FBQztBQUVELE9BQUssdUVBQXVFLFlBQVk7QUFDdkYsUUFBSSxhQUFvQixDQUFDLElBQUksS0FBSyxjQUFjLENBQUM7QUFDakQsVUFBTSxPQUFPLFdBQVc7QUFBQSxNQUN2QixlQUFlLE1BQU07QUFBQSxJQUN0QixDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBQ3pGLFVBQU0sT0FBTyxxQkFBcUI7QUFDbEMsVUFBTSxPQUFPLFlBQVksUUFBUTtBQUNqQyxVQUFNLG9CQUFvQjtBQUUxQixpQkFBYSxDQUFDLElBQUksS0FBSyxjQUFjLENBQUM7QUFDdEMsU0FBSyxhQUFhLEtBQUs7QUFDdkIsVUFBTSxPQUFPLFlBQVksUUFBUTtBQUVqQyxPQUFHLGtCQUFrQixtQkFBbUIsMkVBQTJFLGlCQUFpQixXQUFXLGVBQWUsR0FBRztBQUNqSyxVQUFNLGFBQWEsTUFBTSxPQUFPLHFCQUFxQjtBQUNyRCxPQUFHLFlBQVksK0JBQStCO0FBQzlDLFVBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYSxJQUFJLFVBQVcsQ0FBRTtBQUN4RCxPQUFHLE9BQU8sV0FBVyxXQUFXLFNBQVMsY0FBYyxHQUFHLG9EQUFvRDtBQUM5RyxPQUFHLENBQUMsT0FBTyxXQUFXLFdBQVcsU0FBUyxjQUFjLEdBQUcsaURBQWlEO0FBQUEsRUFDN0csQ0FBQztBQUVELE9BQUsscUVBQXFFLFlBQVk7QUFDckYsZUFBVyxNQUFNLENBQUMsZ0JBQWdCLE9BQU8sZ0JBQWdCLFNBQVMsR0FBRztBQUNwRSxZQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixXQUFXO0FBQUEsUUFDOUYsT0FBTyxNQUFNLFFBQVEsUUFBUSxFQUFFO0FBQUEsTUFDaEMsQ0FBQyxDQUFDLENBQUM7QUFFSCxZQUFNLGFBQWEsTUFBTSxPQUFPLHFCQUFxQjtBQUNyRCxTQUFHLFlBQVksK0JBQStCO0FBQzlDLFlBQU0sY0FBYyxPQUFPLFdBQVcsR0FBRztBQUN6QyxTQUFHLGFBQWEsaUNBQWlDO0FBQ2pELFlBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYSxJQUFJLFVBQVUsQ0FBRTtBQUV2RCxzQkFBZ0I7QUFBQSxRQUNmLFVBQVUsT0FBTyxXQUFXLFNBQVMsU0FBUyxVQUFVO0FBQUEsUUFDeEQsa0JBQWtCLE9BQU8sV0FBVyxXQUFXLFNBQVMsVUFBVTtBQUFBLFFBQ2xFLG1CQUFtQixPQUFPLFdBQVcsV0FBVyxTQUFTLFdBQVc7QUFBQSxNQUNyRSxHQUFHO0FBQUEsUUFDRixVQUFVO0FBQUEsUUFDVixrQkFBa0I7QUFBQSxRQUNsQixtQkFBbUI7QUFBQSxNQUNwQixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0dBQWtHLFlBQVk7QUFDbEgsc0JBQWtCLHNCQUFzQiw2QkFBNkI7QUFBQSxNQUNwRSxXQUFXLENBQUMsYUFBYTtBQUFBLE1BQ3pCLFlBQVksQ0FBQyxhQUFhO0FBQUEsTUFDMUIsVUFBVSxDQUFDLGtCQUFrQjtBQUFBLE1BQzdCLFdBQVcsQ0FBQyxrQkFBa0I7QUFBQSxJQUMvQixDQUFDO0FBQ0QsZ0JBQVksWUFBWSxtQkFBbUIsaUJBQWlCO0FBQzVELGdCQUFZLFlBQVksZUFBZSxhQUFhO0FBQ3BELGdCQUFZLFlBQVksd0JBQXdCLFlBQVk7QUFDNUQsZ0JBQVksWUFBWSw2QkFBNkIsaUJBQWlCO0FBQ3RFLGdCQUFZLFlBQVksb0JBQW9CLGtCQUFrQjtBQUM5RCxnQkFBWSxZQUFZLHFCQUFxQixhQUFhO0FBQzFELFVBQU0sT0FBTyxXQUFXO0FBQUEsTUFDdkIsZUFBZSxNQUFNLENBQUMsSUFBSSxLQUFLLGlCQUFpQixDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUNELFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLElBQUksQ0FBQztBQUV6RixVQUFNLE9BQU8sWUFBWSxpQkFBaUIsT0FBTyxRQUFXLFFBQVcsQ0FBQyxFQUFFLFNBQVMsT0FBTyxNQUFNLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBRW5ILFVBQU0sYUFBYSxNQUFNLE9BQU8scUJBQXFCO0FBQ3JELE9BQUcsWUFBWSwrQkFBK0I7QUFDOUMsVUFBTSxTQUFTLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFO0FBQ3ZELE9BQUcsT0FBTyxXQUFXLFdBQVcsU0FBUyxpQkFBaUIsR0FBRyxrREFBa0Q7QUFDL0csT0FBRyxPQUFPLFdBQVcsV0FBVyxTQUFTLGlCQUFpQixHQUFHLHdEQUF3RDtBQUNySCxPQUFHLE9BQU8sV0FBVyxXQUFXLFNBQVMsYUFBYSxHQUFHLG1EQUFtRDtBQUM1RyxPQUFHLE9BQU8sV0FBVyxXQUFXLFNBQVMsYUFBYSxHQUFHLHlEQUF5RDtBQUNsSCxPQUFHLE9BQU8sV0FBVyxVQUFVLFNBQVMsc0JBQXNCLEdBQUcsK0RBQStEO0FBQ2hJLE9BQUcsT0FBTyxXQUFXLFVBQVUsU0FBUyxZQUFZLEdBQUcsd0RBQXdEO0FBQy9HLE9BQUcsT0FBTyxXQUFXLFVBQVUsU0FBUyxtQkFBbUIsR0FBRyx1REFBdUQ7QUFDckgsT0FBRyxPQUFPLFdBQVcsVUFBVSxTQUFTLGFBQWEsR0FBRyw2REFBNkQ7QUFDckgsT0FBRyxPQUFPLFdBQVcsV0FBVyxTQUFTLG1CQUFtQixHQUFHLHdEQUF3RDtBQUN2SCxPQUFHLE9BQU8sV0FBVyxXQUFXLFNBQVMsYUFBYSxHQUFHLDhEQUE4RDtBQUN2SCxPQUFHLE9BQU8sV0FBVyxTQUFTLFNBQVMsMkJBQTJCLEdBQUcsOERBQThEO0FBQ25JLE9BQUcsT0FBTyxXQUFXLFNBQVMsU0FBUyxpQkFBaUIsR0FBRyx1REFBdUQ7QUFDbEgsT0FBRyxPQUFPLFdBQVcsVUFBVSxTQUFTLGtCQUFrQixHQUFHLGtEQUFrRDtBQUMvRyxPQUFHLE9BQU8sV0FBVyxVQUFVLFNBQVMsa0JBQWtCLEdBQUcsd0RBQXdEO0FBQUEsRUFDdEgsQ0FBQztBQUVELE9BQUssbUVBQW1FLFlBQVk7QUFDbkYsc0JBQWtCLHNCQUFzQiw2QkFBNkI7QUFBQSxNQUNwRSxXQUFXLENBQUMsY0FBYztBQUFBLE1BQzFCLFlBQVksQ0FBQyxjQUFjO0FBQUEsTUFDM0IsVUFBVSxDQUFDLG1CQUFtQjtBQUFBLE1BQzlCLFdBQVcsQ0FBQyxtQkFBbUI7QUFBQSxJQUNoQyxDQUFDO0FBQ0QsVUFBTSxPQUFPLFdBQVc7QUFBQSxNQUN2QixlQUFlLE1BQU0sQ0FBQyxJQUFJLEtBQUssa0JBQWtCLENBQUM7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBRXpGLFVBQU0sYUFBYSxNQUFNLE9BQU8scUJBQXFCO0FBQ3JELE9BQUcsWUFBWSwrQkFBK0I7QUFDOUMsVUFBTSxTQUFTLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFO0FBQ3ZELE9BQUcsT0FBTyxXQUFXLFdBQVcsU0FBUyxrQkFBa0IsR0FBRywwREFBMEQ7QUFDeEgsT0FBRyxPQUFPLFdBQVcsV0FBVyxTQUFTLGNBQWMsR0FBRywyREFBMkQ7QUFDckgsT0FBRyxPQUFPLFdBQVcsVUFBVSxTQUFTLHVCQUF1QixHQUFHLHVFQUF1RTtBQUN6SSxPQUFHLE9BQU8sV0FBVyxTQUFTLFNBQVMsNEJBQTRCLEdBQUcsc0VBQXNFO0FBQzVJLE9BQUcsT0FBTyxXQUFXLFVBQVUsU0FBUyxtQkFBbUIsR0FBRywwREFBMEQ7QUFBQSxFQUN6SCxDQUFDO0FBRUQsT0FBSyxtRkFBbUYsWUFBWTtBQUNuRyxzQkFBa0Isc0JBQXNCLDZCQUE2QjtBQUFBLE1BQ3BFLFlBQVksQ0FBQyxxQkFBcUIsZUFBZTtBQUFBLE1BQ2pELFdBQVcsQ0FBQyxvQkFBb0I7QUFBQSxJQUNqQyxDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsV0FBVyxDQUFDLENBQUM7QUFFakcsVUFBTSxTQUFTLE1BQU0sT0FBTyxnQkFBZ0IsU0FBUztBQUFBLE1BQ3BEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELG9CQUFnQixRQUFRO0FBQUEsTUFDdkIsU0FBUztBQUFBLE1BQ1QsUUFBUSxDQUFDLHFCQUFxQiw2QkFBNkI7QUFBQSxJQUM1RCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsWUFBWTtBQUNoRyxzQkFBa0Isc0JBQXNCLDZCQUE2QjtBQUFBLE1BQ3BFLFdBQVcsQ0FBQyxpQkFBaUI7QUFBQSxNQUM3QixZQUFZLENBQUMsa0JBQWtCO0FBQUEsSUFDaEMsQ0FBQztBQUNELFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLFdBQVcsQ0FBQyxDQUFDO0FBRWpHLFVBQU0sU0FBUyxNQUFNLE9BQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUNuRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELG9CQUFnQixRQUFRO0FBQUEsTUFDdkIsU0FBUztBQUFBLE1BQ1QsUUFBUSxDQUFDLHdCQUF3QjtBQUFBLElBQ2xDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxZQUFZO0FBQzVGLHNCQUFrQixzQkFBc0IsNkJBQTZCO0FBQUEsTUFDcEUsWUFBWSxDQUFDLGFBQWE7QUFBQSxJQUMzQixDQUFDO0FBQ0QsZ0JBQVksWUFBWSxlQUFlLGFBQWE7QUFDcEQsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsV0FBVyxDQUFDLENBQUM7QUFFakcsb0JBQWdCLE1BQU0sT0FBTyxnQkFBZ0IsU0FBUyxDQUFDLHdCQUF3QixzQkFBc0IsQ0FBQyxHQUFHO0FBQUEsTUFDeEcsU0FBUztBQUFBLE1BQ1QsUUFBUSxDQUFDO0FBQUEsSUFDVixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrREFBK0QsWUFBWTtBQUMvRSxVQUFNLE9BQU8sV0FBVztBQUN4QixVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixJQUFJLENBQUM7QUFHekYsc0JBQWtCLHNCQUFzQixxQkFBcUIseUJBQXlCLEdBQUc7QUFFekYsZ0JBQVksT0FBTyxXQUFXLEdBQUcsTUFBUztBQUMxQyxVQUFNLE9BQU8sZUFBZTtBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLHVGQUF1RixZQUFZO0FBQ3ZHLFVBQU0sT0FBTyxXQUFXO0FBQ3hCLFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLElBQUksQ0FBQztBQUV6RixnQkFBWSxNQUFNLE9BQU8sVUFBVSxFQUFFLG9DQUFvQyxLQUFLLENBQUMsR0FBRyxJQUFJO0FBQ3RGLGdCQUFZLE1BQU0sT0FBTyxVQUFVLEVBQUUsb0NBQW9DLE1BQU0sQ0FBQyxHQUFHLEtBQUs7QUFDeEYsZ0JBQVksTUFBTSxPQUFPLDZCQUE2QixFQUFFLG9DQUFvQyxNQUFNLENBQUMsR0FBRyxLQUFLO0FBQzNHLGdCQUFZLE1BQU0sT0FBTyxxQkFBcUIsT0FBTyxFQUFFLG9DQUFvQyxNQUFNLENBQUMsR0FBRyxNQUFTO0FBRTlHLG9CQUFnQixNQUFNLE9BQU8sMEJBQTBCLE9BQU8sRUFBRSxvQ0FBb0MsTUFBTSxDQUFDLEdBQUc7QUFBQSxNQUM3RyxTQUFTO0FBQUEsTUFDVCxtQkFBbUI7QUFBQSxNQUNuQixhQUFhO0FBQUEsSUFDZCxDQUFDO0FBRUQsZ0JBQVksaUJBQWlCLEdBQUcsa0VBQWtFO0FBQUEsRUFDbkcsQ0FBQztBQUVELE9BQUssMEZBQTBGLFlBQVk7QUFDMUcsVUFBTSxPQUFPLGtCQUFrQjtBQUMvQixVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixJQUFJLENBQUM7QUFFekYsZ0JBQVksTUFBTSxPQUFPLFVBQVUsR0FBRyxLQUFLO0FBQzNDLGdCQUFZLE1BQU0sT0FBTyw2QkFBNkIsR0FBRyxLQUFLO0FBQzlELGdCQUFZLE1BQU0sT0FBTyxxQkFBcUIsR0FBRyxNQUFTO0FBQUEsRUFDM0QsQ0FBQztBQUVELE9BQUssOEdBQThHLFlBQVk7QUFDOUgsc0JBQWtCLHNCQUFzQixxQkFBcUIseUJBQXlCLEdBQUc7QUFDekYseUJBQXFCO0FBQ3JCLFVBQU0sT0FBTyxrQkFBa0I7QUFDL0IsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBRXpGLGdCQUFZLE1BQU0sT0FBTyxVQUFVLEdBQUcsSUFBSTtBQUMxQyxnQkFBWSxNQUFNLE9BQU8sNkJBQTZCLEdBQUcsSUFBSTtBQUFBLEVBQzlELENBQUM7QUFFRCxPQUFLLG1FQUFtRSxZQUFZO0FBQ25GLHNCQUFrQixzQkFBc0IscUJBQXFCLHlCQUF5QixHQUFHO0FBQ3pGLHNCQUFrQixzQkFBc0IsNEJBQTRCLHlCQUF5QixFQUFFO0FBQy9GLFVBQU0sT0FBTyxrQkFBa0I7QUFDL0IsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBRXpGLGdCQUFZLE1BQU0sT0FBTyxVQUFVLEdBQUcsSUFBSTtBQUMxQyxnQkFBWSxNQUFNLE9BQU8sNkJBQTZCLEdBQUcsS0FBSztBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLHlCQUFxQjtBQUNyQixVQUFNLE9BQU8sa0JBQWtCO0FBQy9CLFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLElBQUksQ0FBQztBQUV6RixVQUFNLFVBQVUsTUFBTSxPQUFPLFlBQVksY0FBYyxPQUFPLDhDQUE4QyxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQy9KLFVBQU0sYUFBYSxNQUFNLE9BQU8scUJBQXFCO0FBQ3JELE9BQUcsWUFBWSwrQkFBK0I7QUFDOUMsVUFBTSxTQUFTLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFO0FBRXZELGdCQUFZLFFBQVEsa0JBQWtCLElBQUk7QUFDMUMsT0FBRyxRQUFRLFFBQVEsV0FBVyx3RUFBd0UsR0FBRyxvQ0FBb0MsUUFBUSxPQUFPLEVBQUU7QUFDOUosT0FBRyxRQUFRLFFBQVEsU0FBUyxLQUFLLFVBQVUsR0FBRyxHQUFHLGlFQUFpRSxRQUFRLE9BQU8sRUFBRTtBQUNuSSxnQkFBWSxPQUFPLFNBQVMsYUFBYTtBQUN6QyxnQkFBWSxPQUFPLGFBQWEsU0FBUztBQUN6QyxnQkFBWSxPQUFPLFFBQVEsYUFBYSwrRUFBK0U7QUFDdkgsZ0JBQVksOEJBQThCLE9BQU8sUUFBUSxHQUFHLEdBQUcsY0FBYztBQUM3RSxnQkFBWSxPQUFPLEdBQUcsU0FBUyxLQUFLO0FBQ3BDLE9BQUcsT0FBTyxRQUFRLElBQUksU0FBUyx3QkFBd0IsR0FBRyx3REFBd0Q7QUFDbEgsT0FBRyxPQUFPLFFBQVEsSUFBSSxTQUFTLDRDQUE0QyxHQUFHLGtEQUFrRDtBQUNoSSxPQUFHLE9BQU8sUUFBUSxJQUFJLFNBQVMsd0NBQXdDLEdBQUcscURBQXFEO0FBQy9ILE9BQUcsT0FBTyxRQUFRLElBQUksU0FBUyxrQ0FBa0MsR0FBRyxxREFBcUQ7QUFDekgsT0FBRyxPQUFPLFFBQVEsSUFBSSxTQUFTLHFHQUFxRyxHQUFHLDBEQUEwRDtBQUNqTSxPQUFHLE9BQU8sUUFBUSxJQUFJLFNBQVMsNkJBQTZCLEdBQUcseURBQXlEO0FBQ3hILE9BQUcsT0FBTyxRQUFRLElBQUksU0FBUywyQ0FBMkMsR0FBRyxxREFBcUQ7QUFDbEksT0FBRyxPQUFPLFFBQVEsSUFBSSxTQUFTLDhDQUE4QyxHQUFHLDBEQUEwRDtBQUMxSSxPQUFHLE9BQU8sUUFBUSxJQUFJLFNBQVMseUNBQXlDLEdBQUcsb0RBQW9EO0FBQy9ILG9CQUFnQixPQUFPLFNBQVMsRUFBRSxlQUFlLFNBQVMsaUJBQWlCLGVBQWUsQ0FBQztBQUMzRixPQUFHLE9BQU8sV0FBVyxlQUFlLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLGNBQWMsR0FBRyw4QkFBOEI7QUFDbEosT0FBRyxPQUFPLFdBQVcsZUFBZSxLQUFLLENBQUMsU0FBaUIsOEJBQThCLElBQUksRUFBRSxTQUFTLGlCQUFpQixDQUFDLEdBQUcscUNBQXFDO0FBQ2xLLE9BQUcsT0FBTyxXQUFXLGVBQWUsS0FBSyxDQUFDLFNBQWlCLDhCQUE4QixJQUFJLE1BQU0sa0NBQWtDLEdBQUcsd0VBQXdFO0FBQ2hOLE9BQUcsT0FBTyxXQUFXLGNBQWMsS0FBSyxDQUFDLFNBQWlCLDhCQUE4QixJQUFJLEVBQUUsU0FBUyxpQkFBaUIsQ0FBQyxHQUFHLDREQUE0RDtBQUN4TCxPQUFHLE9BQU8sV0FBVyxjQUFjLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLGVBQWUsR0FBRyxvRUFBb0U7QUFDeEwsT0FBRyxPQUFPLFdBQVcsY0FBYyxLQUFLLENBQUMsU0FBaUIsOEJBQThCLElBQUksTUFBTSwrQkFBK0IsR0FBRyw2REFBNkQ7QUFDak0sT0FBRyxPQUFPLFdBQVcsY0FBYyxLQUFLLENBQUMsU0FBaUIsOEJBQThCLElBQUksTUFBTSwwQ0FBMEMsR0FBRyx5RUFBeUU7QUFDeE4sT0FBRyxDQUFDLE9BQU8sV0FBVyxZQUFZLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLGVBQWUsR0FBRyxzREFBc0Q7QUFBQSxFQUMxSyxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsWUFBWTtBQUNoRix5QkFBcUI7QUFDckIsc0JBQWtCLHNCQUFzQiwrQkFBK0I7QUFBQSxNQUN0RSxZQUFZLENBQUMscUJBQXFCO0FBQUEsTUFDbEMsV0FBVyxDQUFDLG9CQUFvQjtBQUFBLE1BQ2hDLFVBQVUsQ0FBQyxzQkFBc0I7QUFBQSxJQUNsQyxDQUFDO0FBQ0QsVUFBTSxPQUFPLGtCQUFrQjtBQUMvQixVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixJQUFJLENBQUM7QUFFekYsVUFBTSxPQUFPLFlBQVksY0FBYyxPQUFPLE1BQU07QUFDcEQsVUFBTSxhQUFhLE1BQU0sT0FBTyxxQkFBcUI7QUFDckQsT0FBRyxZQUFZLCtCQUErQjtBQUM5QyxVQUFNLG1CQUFtQixhQUFhLElBQUksVUFBVTtBQUNwRCxVQUFNLFNBQVMsS0FBSyxNQUFNLGdCQUFnQjtBQUUxQyxPQUFHLGlCQUFpQixTQUFTLDJCQUEyQixHQUFHLG1GQUFtRjtBQUM5SSxPQUFHLGlCQUFpQixTQUFTLDBCQUEwQixHQUFHLGtGQUFrRjtBQUM1SSxPQUFHLGlCQUFpQixTQUFTLDRCQUE0QixHQUFHLGlGQUFpRjtBQUM3SSxPQUFHLE9BQU8sV0FBVyxlQUFlLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLHFCQUFxQixHQUFHLHVEQUF1RDtBQUNsTCxPQUFHLE9BQU8sV0FBVyxjQUFjLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLG9CQUFvQixHQUFHLHNEQUFzRDtBQUMvSyxPQUFHLE9BQU8sV0FBVyxlQUFlLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLGtDQUFrQyxHQUFHLHVEQUF1RDtBQUMvTCxPQUFHLE9BQU8sV0FBVyxZQUFZLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLHNCQUFzQixHQUFHLG1EQUFtRDtBQUM1SyxPQUFHLENBQUMsT0FBTyxXQUFXLFlBQVksS0FBSyxDQUFDLFNBQWlCLDhCQUE4QixJQUFJLE1BQU0sZUFBZSxHQUFHLHNEQUFzRDtBQUFBLEVBQzFLLENBQUM7QUFFRCxPQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLHlCQUFxQjtBQUNyQixzQkFBa0Isc0JBQXNCLCtCQUErQjtBQUFBLE1BQ3RFLFlBQVksQ0FBQyxxQkFBcUI7QUFBQSxNQUNsQyxXQUFXLENBQUMsc0JBQXNCO0FBQUEsTUFDbEMsVUFBVSxDQUFDLHdCQUF3Qix3QkFBd0I7QUFBQSxJQUM1RCxDQUFDO0FBQ0QsVUFBTSxPQUFPLGtCQUFrQjtBQUFBLE1BQzlCLCtCQUErQixNQUFNLFFBQVEsUUFBUTtBQUFBLFFBQ3BELGdCQUFnQixDQUFDLHVCQUF1QjtBQUFBLFFBQ3hDLGVBQWUsQ0FBQyxvQkFBb0I7QUFBQSxNQUNyQyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBRXpGLFVBQU0sT0FBTyxZQUFZLGNBQWMsT0FBTyxNQUFNO0FBQ3BELFVBQU0sYUFBYSxNQUFNLE9BQU8scUJBQXFCO0FBQ3JELE9BQUcsWUFBWSwrQkFBK0I7QUFDOUMsVUFBTSxTQUFTLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFO0FBQ3ZELFVBQU0sZ0JBQWdCLENBQUMsT0FBaUIsaUJBQXlCLE1BQU0sT0FBTyxVQUFRLDhCQUE4QixJQUFJLE1BQU0sWUFBWTtBQUUxSSxvQkFBZ0I7QUFBQSxNQUNmLFdBQVcsY0FBYyxPQUFPLFdBQVcsZ0JBQWdCLHFCQUFxQjtBQUFBLE1BQ2hGLFVBQVUsY0FBYyxPQUFPLFdBQVcsZUFBZSxvQkFBb0I7QUFBQSxNQUM3RSxRQUFRLGNBQWMsT0FBTyxXQUFXLGFBQWEsc0JBQXNCO0FBQUEsSUFDNUUsR0FBRztBQUFBLE1BQ0YsV0FBVyxDQUFDLHVCQUF1QjtBQUFBLE1BQ25DLFVBQVUsQ0FBQyxzQkFBc0I7QUFBQSxNQUNqQyxRQUFRLENBQUMsd0JBQXdCO0FBQUEsSUFDbEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUVBQXVFLFlBQVk7QUFDdkYseUJBQXFCO0FBQ3JCLFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLGtCQUFrQixDQUFDLENBQUM7QUFDeEcsVUFBTSxPQUFPLE1BQU07QUFDbkIsVUFBTSx5QkFBMEIsT0FBc0Ysd0JBQXdCLEtBQUssTUFBTTtBQUV6SixvQkFBZ0IsTUFBTSx1QkFBdUI7QUFBQSxNQUM1QztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDLEdBQUc7QUFBQSxNQUNIO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkRBQTZELFlBQVk7QUFDN0UseUJBQXFCO0FBQ3JCLHNCQUFrQixzQkFBc0Isa0NBQWtDLGFBQWE7QUFDdkYsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsa0JBQWtCLENBQUMsQ0FBQztBQUV4RyxVQUFNLE9BQU8sWUFBWSxjQUFjLE9BQU8sTUFBTTtBQUNwRCxVQUFNLGFBQWEsTUFBTSxPQUFPLHFCQUFxQjtBQUNyRCxPQUFHLFlBQVksK0JBQStCO0FBQzlDLFVBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYSxJQUFJLFVBQVUsQ0FBRTtBQUV2RCxnQkFBWSxPQUFPLFNBQVMsYUFBYTtBQUFBLEVBQzFDLENBQUM7QUFFRCxPQUFLLGlHQUFpRyxZQUFZO0FBQ2pILHlCQUFxQjtBQUNyQixzQkFBa0Isc0JBQXNCLCtCQUErQjtBQUFBLE1BQ3RFLFlBQVksQ0FBQyw0QkFBNEI7QUFBQSxNQUN6QyxXQUFXLENBQUMsMkJBQTJCO0FBQUEsTUFDdkMsVUFBVSxDQUFDLDZCQUE2QjtBQUFBLElBQ3pDLENBQUM7QUFDRCxnQkFBWSxZQUFZLHNCQUFzQixvQkFBb0I7QUFDbEUsZ0JBQVksWUFBWSw2QkFBNkIsMkJBQTJCO0FBQ2hGLGdCQUFZLFlBQVksNEJBQTRCLDBCQUEwQjtBQUM5RSxnQkFBWSxZQUFZLDhCQUE4Qiw0QkFBNEI7QUFDbEYsZ0JBQVksWUFBWSxrQkFBa0IscUJBQXFCO0FBQy9ELFVBQU0sT0FBTyxrQkFBa0I7QUFBQSxNQUM5QixlQUFlLE1BQU0sQ0FBQyxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsTUFBTSxxQkFBcUIsQ0FBQyxDQUFDO0FBQUEsSUFDL0UsQ0FBQztBQUNELFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLElBQUksQ0FBQztBQUV6RixVQUFNLE9BQU8sWUFBWSxjQUFjLE9BQU8sTUFBTTtBQUNwRCxVQUFNLGFBQWEsTUFBTSxPQUFPLHFCQUFxQjtBQUNyRCxPQUFHLFlBQVksK0JBQStCO0FBQzlDLFVBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYSxJQUFJLFVBQVUsQ0FBRTtBQUV2RCxPQUFHLE9BQU8sV0FBVyxlQUFlLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLG1CQUFtQixHQUFHLDZEQUE2RDtBQUN0TCxPQUFHLE9BQU8sV0FBVyxlQUFlLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLG1CQUFtQixHQUFHLG1FQUFtRTtBQUM1TCxPQUFHLE9BQU8sV0FBVyxlQUFlLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLDBCQUEwQixHQUFHLDJEQUEyRDtBQUMzTCxPQUFHLE9BQU8sV0FBVyxlQUFlLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLDBCQUEwQixHQUFHLGlFQUFpRTtBQUNqTSxPQUFHLE9BQU8sV0FBVyxjQUFjLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLHlCQUF5QixHQUFHLDBEQUEwRDtBQUN4TCxPQUFHLE9BQU8sV0FBVyxjQUFjLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLHlCQUF5QixHQUFHLGdFQUFnRTtBQUM5TCxPQUFHLE9BQU8sV0FBVyxjQUFjLEtBQUssQ0FBQyxTQUFpQiw4QkFBOEIsSUFBSSxNQUFNLGVBQWUsR0FBRyxxREFBcUQ7QUFDekssT0FBRyxPQUFPLFdBQVcsY0FBYyxLQUFLLENBQUMsU0FBaUIsOEJBQThCLElBQUksTUFBTSxvQkFBb0IsR0FBRywyREFBMkQ7QUFDcEwsT0FBRyxPQUFPLFdBQVcsWUFBWSxLQUFLLENBQUMsU0FBaUIsOEJBQThCLElBQUksTUFBTSwyQkFBMkIsR0FBRyx5REFBeUQ7QUFDdkwsT0FBRyxPQUFPLFdBQVcsWUFBWSxLQUFLLENBQUMsU0FBaUIsOEJBQThCLElBQUksTUFBTSwyQkFBMkIsR0FBRywrREFBK0Q7QUFBQSxFQUM5TCxDQUFDO0FBRUQsT0FBSywwREFBMEQsWUFBWTtBQUMxRSx5QkFBcUI7QUFDckIsVUFBTSxPQUFPLGtCQUFrQjtBQUFBLE1BQzlCLGdCQUFnQixNQUFNLFFBQVEsUUFBUSxFQUFFLFNBQVMsV0FBVyxNQUFNLFFBQVEsQ0FBQztBQUFBLElBQzVFLENBQUM7QUFDRCxVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixJQUFJLENBQUM7QUFFekYsVUFBTSxVQUFVLE1BQU0sT0FBTyxZQUFZLGNBQWMsT0FBTyxNQUFNO0FBQ3BFLFVBQU0sYUFBYSxNQUFNLE9BQU8scUJBQXFCO0FBQ3JELE9BQUcsWUFBWSwrQkFBK0I7QUFDOUMsVUFBTSxTQUFTLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFO0FBRXZELGdCQUFZLFFBQVEsU0FBUyw2RUFBNkUsVUFBVSxHQUFHO0FBQ3ZILGdCQUFZLDhCQUE4QixPQUFPLFFBQVEsR0FBRyxHQUFHLGNBQWM7QUFBQSxFQUM5RSxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsWUFBWTtBQUNoRix5QkFBcUI7QUFDckIsVUFBTSxPQUFPLGtCQUFrQjtBQUMvQixVQUFNLFNBQVMsTUFBTSxJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixJQUFJLENBQUM7QUFFekYsVUFBTSxPQUFPLFlBQVksY0FBYyxPQUFPLDRDQUE0QztBQUMxRixRQUFJLGFBQWEsTUFBTSxPQUFPLHFCQUFxQjtBQUNuRCxPQUFHLFlBQVksK0JBQStCO0FBQzlDLFVBQU0sbUJBQW1CLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFLEVBQUUsUUFBUTtBQUMzRSxnQkFBWSxrQkFBa0IsK0VBQStFO0FBRTdHLFVBQU0sT0FBTyxZQUFZLGVBQWUsT0FBTyw0Q0FBNEM7QUFDM0YsaUJBQWEsTUFBTSxPQUFPLHFCQUFxQjtBQUMvQyxPQUFHLFlBQVksK0JBQStCO0FBQzlDLFVBQU0sb0JBQW9CLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFLEVBQUUsUUFBUTtBQUM1RSxnQkFBWSxtQkFBbUIsZ0ZBQWdGO0FBQUEsRUFDaEgsQ0FBQztBQUVELE9BQUssNERBQTRELFlBQVk7QUFDNUUsc0JBQWtCLHNCQUFzQiw0QkFBNEIseUJBQXlCLEVBQUU7QUFDL0Ysc0JBQWtCLHNCQUFzQiwwQkFBMEIsSUFBSTtBQUN0RSxVQUFNLE9BQU8sa0JBQWtCO0FBQy9CLFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLElBQUksQ0FBQztBQUV6RixVQUFNLE9BQU8sWUFBWSw0QkFBNEIsT0FBTyxNQUFNO0FBQ2xFLFVBQU0sYUFBYSxNQUFNLE9BQU8scUJBQXFCO0FBQ3JELE9BQUcsWUFBWSwrQkFBK0I7QUFDOUMsVUFBTSxTQUFTLEtBQUssTUFBTSxhQUFhLElBQUksVUFBVSxDQUFFO0FBRXZELG9CQUFnQixPQUFPLFNBQVMsRUFBRSxlQUFlLFNBQVMsaUJBQWlCLGVBQWUsQ0FBQztBQUFBLEVBQzVGLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxZQUFZO0FBQzdFLHlCQUFxQjtBQUNyQixzQkFBa0IsNEJBQTRCLHVCQUF1QixDQUFDLGFBQWEsQ0FBQztBQUNwRixzQkFBa0IsNEJBQTRCLHNCQUFzQixDQUFDLHFCQUFxQixDQUFDO0FBQzNGLFVBQU0sT0FBTyxrQkFBa0I7QUFDL0IsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBRXpGLFVBQU0sT0FBTyxZQUFZLDRCQUE0QixPQUFPLE1BQU07QUFDbEUsVUFBTSxhQUFhLE1BQU0sT0FBTyxxQkFBcUI7QUFDckQsT0FBRyxZQUFZLCtCQUErQjtBQUM5QyxVQUFNLFNBQVMsS0FBSyxNQUFNLGFBQWEsSUFBSSxVQUFVLENBQUU7QUFFdkQsb0JBQWdCLE9BQU8sU0FBUyxFQUFFLGVBQWUsU0FBUyxpQkFBaUIsZUFBZSxDQUFDO0FBQUEsRUFDNUYsQ0FBQztBQUVELE9BQUssdURBQXVELFlBQVk7QUFDdkUsVUFBTSxjQUFjLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsV0FBVyxDQUFDLENBQUM7QUFDdEcsVUFBTSxZQUFZLE1BQU07QUFDeEIsVUFBTSxzQkFBdUIsWUFBZ0YsMEJBQTBCLEtBQUssV0FBVztBQUV2SixnQkFBWSxvQkFBb0IsWUFBWSxHQUFHLElBQUk7QUFDbkQsZ0JBQVksb0JBQW9CLGVBQWUsR0FBRyxLQUFLO0FBQ3ZELGdCQUFZLG9CQUFvQixpQkFBaUIsR0FBRyxLQUFLO0FBRXpELFVBQU0sZ0JBQWdCLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsV0FBVyxFQUFFLE9BQU8sTUFBTSxRQUFRLFFBQVEsZ0JBQWdCLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNqSyxVQUFNLGNBQWMsTUFBTTtBQUMxQixVQUFNLHdCQUF5QixjQUFrRiwwQkFBMEIsS0FBSyxhQUFhO0FBRTdKLGdCQUFZLHNCQUFzQixhQUFhLEdBQUcsSUFBSTtBQUN0RCxnQkFBWSxzQkFBc0IsaUJBQWlCLEdBQUcsSUFBSTtBQUMxRCxnQkFBWSxzQkFBc0IsZUFBZSxHQUFHLElBQUk7QUFDeEQsZ0JBQVksc0JBQXNCLG1CQUFtQixHQUFHLElBQUk7QUFDNUQsZ0JBQVksc0JBQXNCLGdCQUFnQixHQUFHLEtBQUs7QUFBQSxFQUMzRCxDQUFDO0FBRUQsT0FBSywwREFBMEQsWUFBWTtBQUMxRSxRQUFJLFNBQW1DLEVBQUUscUJBQXFCLE9BQU8sa0JBQWtCLE9BQU8sZ0JBQWdCLE1BQU0sMEJBQTBCLHNDQUFzQztBQUNwTCxVQUFNLE9BQU8sV0FBVztBQUFBLE1BQ3ZCLDBCQUEwQixNQUFNLFFBQVEsUUFBUSxNQUFNO0FBQUEsSUFDdkQsQ0FBQztBQUNELFVBQU0sU0FBUyxNQUFNLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLElBQUksQ0FBQztBQUV6RixVQUFNLFNBQVMsTUFBTSxPQUFPLDBCQUEwQjtBQUN0RCxnQkFBWSxPQUFPLFNBQVMsSUFBSTtBQUNoQyxnQkFBWSxPQUFPLGFBQWEsY0FBYztBQUM5QyxnQkFBWSxPQUFPLHNCQUFzQixDQUFDLEdBQUcsWUFBWTtBQUN6RCxnQkFBWSxPQUFPLCtCQUErQixJQUFJO0FBRXRELGFBQVMsRUFBRSxxQkFBcUIsTUFBTSxrQkFBa0IsTUFBTSxnQkFBZ0IsS0FBSztBQUNuRixVQUFNLFVBQVUsTUFBTSxPQUFPLDBCQUEwQixJQUFJO0FBQzNELGdCQUFZLFFBQVEsYUFBYSxNQUFTO0FBQUEsRUFDM0MsQ0FBQztBQUVELE9BQUssNkVBQTZFLFlBQVk7QUFDN0YsUUFBSSxZQUFZO0FBQ2hCLFFBQUksU0FBbUMsRUFBRSxxQkFBcUIsT0FBTyxrQkFBa0IsT0FBTyxnQkFBZ0IsS0FBSztBQUNuSCxVQUFNLE9BQU8sV0FBVztBQUFBLE1BQ3ZCLDBCQUEwQixNQUFNO0FBQy9CO0FBQ0EsZUFBTyxRQUFRLFFBQVEsTUFBTTtBQUFBLE1BQzlCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBRXpGLFVBQU0sUUFBUSxNQUFNLE9BQU8sMEJBQTBCO0FBQ3JELFVBQU0sU0FBUyxNQUFNLE9BQU8sMEJBQTBCO0FBRXRELGdCQUFZLE1BQU0sYUFBYSxpQ0FBaUMsWUFBWTtBQUM1RSxnQkFBWSxPQUFPLGFBQWEsaUNBQWlDLFlBQVk7QUFDN0UsZ0JBQVksV0FBVyxHQUFHLHdEQUF3RDtBQUVsRixhQUFTLEVBQUUscUJBQXFCLE1BQU0sa0JBQWtCLE1BQU0sZ0JBQWdCLEtBQUs7QUFDbkYsVUFBTSxTQUFTLE1BQU0sT0FBTywwQkFBMEI7QUFDdEQsZ0JBQVksT0FBTyxhQUFhLGlDQUFpQyxjQUFjLCtEQUErRDtBQUM5SSxnQkFBWSxXQUFXLENBQUM7QUFFeEIsVUFBTSxZQUFZLE1BQU0sT0FBTywwQkFBMEIsSUFBSTtBQUM3RCxnQkFBWSxVQUFVLGFBQWEsTUFBUztBQUM1QyxnQkFBWSxXQUFXLEdBQUcsb0VBQW9FO0FBQUEsRUFDL0YsQ0FBQztBQUVELE9BQUssNkVBQTZFLFlBQVk7QUFDN0YsVUFBTSxPQUFPLFdBQVc7QUFBQSxNQUN2QiwwQkFBMEIsTUFBTSxRQUFRLFFBQVE7QUFBQSxRQUMvQyxxQkFBcUI7QUFBQSxRQUNyQixrQkFBa0I7QUFBQSxRQUNsQixpQkFBaUI7QUFBQSxRQUNqQixnQkFBZ0I7QUFBQSxRQUNoQiw2Q0FBNkM7QUFBQSxNQUM5QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBRXpGLFVBQU0sU0FBUyxNQUFNLE9BQU8sMEJBQTBCO0FBRXRELGdCQUFZLE9BQU8sYUFBYSxpQ0FBaUMsVUFBVTtBQUMzRSxvQkFBZ0IsT0FBTyxjQUFjLENBQUMsbUNBQW1DLDJDQUEyQyxDQUFDO0FBQ3JILGdCQUFZLE9BQU8sUUFBUSwrQkFBK0I7QUFDMUQsZ0JBQVksT0FBTyxxQkFBcUIsTUFBUztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLDRHQUE0RyxZQUFZO0FBQzVILHNCQUFrQixzQkFBc0IsNkJBQTZCLEVBQUUsVUFBVSxNQUFNLENBQUM7QUFDeEYsVUFBTSxPQUFPLFdBQVc7QUFBQSxNQUN2QiwwQkFBMEIsTUFBTSxRQUFRLFFBQVE7QUFBQSxRQUMvQyxxQkFBcUI7QUFBQSxRQUNyQixrQkFBa0I7QUFBQSxRQUNsQixnQkFBZ0I7QUFBQSxRQUNoQiw2Q0FBNkM7QUFBQSxNQUM5QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBRXpGLFVBQU0sU0FBUyxNQUFNLE9BQU8sMEJBQTBCO0FBQ3RELFVBQU0sYUFBYSxNQUFNLE9BQU8scUJBQXFCO0FBQ3JELFVBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYSxJQUFJLFVBQVcsQ0FBRTtBQUV4RCxnQkFBWSxPQUFPLGFBQWEsTUFBUztBQUN6QyxnQkFBWSxPQUFPLDJCQUEyQixJQUFJO0FBQ2xELGdCQUFZLE9BQU8sVUFBVSxLQUFLO0FBQUEsRUFDbkMsQ0FBQztBQUVELE9BQUssOEdBQThHLFlBQVk7QUFDOUgsVUFBTSxPQUFPLFdBQVc7QUFBQSxNQUN2QiwwQkFBMEIsTUFBTSxRQUFRLFFBQVE7QUFBQSxRQUMvQyxxQkFBcUI7QUFBQSxRQUNyQixrQkFBa0I7QUFBQSxRQUNsQixnQkFBZ0I7QUFBQSxRQUNoQiw2Q0FBNkM7QUFBQSxNQUM5QyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsSUFBSSxDQUFDO0FBRXpGLFVBQU0sb0JBQW9CLE1BQU0sT0FBTywwQkFBMEI7QUFDakUsVUFBTSxtQkFBbUIsTUFBTSxPQUFPLDBCQUEwQixJQUFJO0FBQ3BFLFVBQU0sU0FBUyxLQUFLLE1BQU0sYUFBYSxJQUFJLGlCQUFpQixpQkFBa0IsQ0FBRTtBQUVoRixnQkFBWSxrQkFBa0IsYUFBYSxpQ0FBaUMsVUFBVTtBQUN0RixnQkFBWSxpQkFBaUIsYUFBYSxNQUFTO0FBQ25ELGdCQUFZLE9BQU8sMkJBQTJCLElBQUk7QUFBQSxFQUNuRCxDQUFDO0FBRUYsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
