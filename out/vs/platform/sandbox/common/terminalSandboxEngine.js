var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { match as globMatch } from "../../../base/common/glob.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { posix, win32 } from "../../../base/common/path.js";
import { OperatingSystem, OS } from "../../../base/common/platform.js";
import { arch } from "../../../base/common/process.js";
import { ExtUri } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { matchesDomainPattern, normalizeDomain } from "../../networkFilter/common/domainMatcher.js";
import { AgentNetworkDomainSettingId } from "../../networkFilter/common/settings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from "./settings.js";
import { IWindowsMxcTerminalSandboxRuntime } from "./terminalSandboxMxcRuntime.js";
import { getTerminalSandboxReadAllowListForCommands } from "./terminalSandboxReadAllowList.js";
import { getTerminalSandboxRuntimeConfigurationForCommands } from "./terminalSandboxRuntimeConfigurationPerOperation.js";
import { TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from "./terminalSandboxService.js";
let TerminalSandboxEngine = class extends Disposable {
  constructor(_host, _fileService, _logService, _windowsMxcRuntime) {
    super();
    this._host = _host;
    this._fileService = _fileService;
    this._logService = _logService;
    this._windowsMxcRuntime = _windowsMxcRuntime;
    this._sandboxSettingsId = generateUuid();
    this._runtimeResolved = false;
    this._runAsNode = false;
    this._enableWeakerNestedSandbox = false;
    this._apparmorRemediationRequested = false;
    this._needsForceUpdateConfigFile = true;
    this._commandAllowListKeywords = [];
    this._commandAllowListCommandDetails = [];
    this._commandAllowNetwork = false;
    this._os = OS;
    this._defaultWritePaths = [];
    this._fileSystemPathExtUri = new ExtUri(() => this._os === OperatingSystem.Windows);
    this._buildSandboxPayload = (commandLine, policy, workingDirectory, containerName, containment) => {
      return this._host.buildWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment);
    };
    this._pathJoin = (...segments) => {
      const path = this._os === OperatingSystem.Windows ? win32 : posix;
      return path.join(...segments);
    };
    this._register(Event.runAndSubscribe(this._host.onDidChangeSandboxSettings, () => {
      this.setNeedsForceUpdateConfigFile();
    }));
    this._register(this._host.onDidChangeRoots(() => this.setNeedsForceUpdateConfigFile()));
  }
  async isEnabled(precheckInputs) {
    return this._isSandboxConfiguredEnabled(precheckInputs);
  }
  async isSandboxAllowNetworkEnabled(precheckInputs) {
    if (!await this._isSandboxConfiguredEnabled(precheckInputs)) {
      return false;
    }
    return this._isSandboxAllowNetworkConfigured();
  }
  areUnsandboxedCommandsAllowed() {
    return this._areUnsandboxedCommandsAllowed();
  }
  areRetryWithAllowNetworkRequestsAllowed() {
    return this._areRetryWithAllowNetworkRequestsAllowed();
  }
  async getOS() {
    this._os = await this._host.getOS();
    return this._os;
  }
  getTempDir() {
    return this._tempDir;
  }
  setNeedsForceUpdateConfigFile() {
    this._needsForceUpdateConfigFile = true;
  }
  getResolvedNetworkDomains() {
    const allowedDomains = this._host.getSandboxSetting(AgentNetworkDomainSettingId.AllowedNetworkDomains) ?? [];
    const deniedDomains = this._host.getSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains) ?? [];
    return { allowedDomains, deniedDomains };
  }
  async wrapCommand(command, requestUnsandboxedExecution, shell, cwd, commandDetails, requestAllowNetwork) {
    const allowUnsandboxedCommands = this._areUnsandboxedCommandsAllowed();
    const retryWithAllowNetworkRequests = this._areRetryWithAllowNetworkRequestsAllowed();
    const shouldInspectBlockedDomains = requestUnsandboxedExecution !== true && requestAllowNetwork !== true && (retryWithAllowNetworkRequests || allowUnsandboxedCommands);
    const blockedDomainResult = shouldInspectBlockedDomains ? this._getBlockedDomains(command) : { blockedDomains: [], deniedDomains: [] };
    const requiresPreflightAllowNetwork = retryWithAllowNetworkRequests && blockedDomainResult.blockedDomains.length > 0;
    const allowNetworkForCommand = requestUnsandboxedExecution !== true && (requestAllowNetwork === true && retryWithAllowNetworkRequests || requiresPreflightAllowNetwork);
    const normalizedCommandDetails = this._normalizeCommandDetails(commandDetails ?? []);
    const normalizedCommandKeywords = this._normalizeCommandKeywords(normalizedCommandDetails.map((c) => c.keyword));
    const currentReadAllowListPaths = getTerminalSandboxReadAllowListForCommands(this._os, this._commandAllowListKeywords, this._commandAllowListCommandDetails);
    const nextReadAllowListPaths = getTerminalSandboxReadAllowListForCommands(this._os, normalizedCommandKeywords, normalizedCommandDetails);
    const currentRuntimeConfiguration = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
    const nextRuntimeConfiguration = getTerminalSandboxRuntimeConfigurationForCommands(this._os, normalizedCommandDetails);
    const shouldRefreshConfig = this._commandAllowListKeywords.length === 0 || this._needsForceUpdateConfigFile || !this._areStringArraysEqual(this._commandAllowListKeywords, normalizedCommandKeywords) || !this._areStringArraysEqual(currentReadAllowListPaths, nextReadAllowListPaths) || !this._areObjectsEqual(currentRuntimeConfiguration, nextRuntimeConfiguration) || this._commandCwd?.toString() !== cwd?.toString() || this._commandAllowNetwork !== allowNetworkForCommand || this._os === OperatingSystem.Windows && (this._commandLine !== command || this._commandShell !== shell);
    if (shouldRefreshConfig) {
      this._commandAllowListKeywords = normalizedCommandKeywords;
      this._commandAllowListCommandDetails = normalizedCommandDetails;
      this._commandCwd = cwd;
      this._commandLine = command;
      this._commandShell = shell;
      this._commandAllowNetwork = allowNetworkForCommand;
      await this.getSandboxConfigPath(true);
    }
    if (!this._sandboxConfigPath || !this._tempDir) {
      throw new Error("Sandbox config path or temp dir not initialized");
    }
    if (!requestUnsandboxedExecution && !retryWithAllowNetworkRequests && allowUnsandboxedCommands && blockedDomainResult.blockedDomains.length > 0) {
      return {
        command: this._wrapUnsandboxedCommand(command, shell, cwd),
        isSandboxWrapped: false,
        blockedDomains: blockedDomainResult.blockedDomains,
        deniedDomains: blockedDomainResult.deniedDomains,
        requiresUnsandboxConfirmation: true
      };
    }
    if (requestUnsandboxedExecution && allowUnsandboxedCommands) {
      return {
        command: this._wrapUnsandboxedCommand(command, shell, cwd),
        isSandboxWrapped: false
      };
    }
    const allowNetworkConfirmationMetadata = requiresPreflightAllowNetwork ? {
      blockedDomains: blockedDomainResult.blockedDomains,
      deniedDomains: blockedDomainResult.deniedDomains
    } : void 0;
    if (this._os === OperatingSystem.Windows) {
      if (!this._mxcPath) {
        throw new Error("MXC executable path not resolved");
      }
      return {
        command: this._windowsMxcRuntime.wrapCommand(this._mxcPath, this._sandboxConfigPath),
        isSandboxWrapped: true,
        requiresAllowNetworkConfirmation: allowNetworkForCommand && !this._isSandboxAllowNetworkConfigured() ? true : void 0,
        ...allowNetworkConfirmationMetadata
      };
    }
    if (!this._execPath) {
      throw new Error("Executable path not set to run sandbox commands");
    }
    if (!this._srtPath) {
      throw new Error("Sandbox runtime path not resolved");
    }
    if (!this._rgPath) {
      throw new Error("Ripgrep path not resolved");
    }
    const commandToRunInSandbox = this._getSandboxCommandWithPreservedCwd(command, cwd);
    const sandboxRuntimeCommand = `PATH="$PATH:${this._pathDirname(this._rgPath)}" TMPDIR="${this._tempDir.path}" CLAUDE_TMPDIR="${this._tempDir.path}" "${this._execPath}" "${this._srtPath}" --settings "${this._sandboxConfigPath}" -c ${this._quoteShellArgument(commandToRunInSandbox)}`;
    if (this._runAsNode) {
      const nodeSandboxRuntimeCommand = `ELECTRON_RUN_AS_NODE=1 ${sandboxRuntimeCommand}`;
      return {
        command: this._wrapSandboxRuntimeCommandForLaunch(nodeSandboxRuntimeCommand, cwd),
        isSandboxWrapped: true,
        requiresAllowNetworkConfirmation: allowNetworkForCommand && !this._isSandboxAllowNetworkConfigured() ? true : void 0,
        ...allowNetworkConfirmationMetadata
      };
    }
    return {
      command: this._wrapSandboxRuntimeCommandForLaunch(sandboxRuntimeCommand, cwd),
      isSandboxWrapped: true,
      requiresAllowNetworkConfirmation: allowNetworkForCommand && !this._isSandboxAllowNetworkConfigured() ? true : void 0,
      ...allowNetworkConfirmationMetadata
    };
  }
  async checkForSandboxingPrereqs(forceRefresh = false, precheckInputs) {
    if (!await this._isSandboxConfiguredEnabled(precheckInputs)) {
      return {
        enabled: false,
        sandboxConfigPath: void 0,
        failedCheck: void 0
      };
    }
    const sandboxConfigPath = await this.getSandboxConfigPath(forceRefresh, precheckInputs);
    if (!sandboxConfigPath) {
      return {
        enabled: true,
        sandboxConfigPath,
        failedCheck: TerminalSandboxPrerequisiteCheck.Config
      };
    }
    if (!await this._checkSandboxDependencies(forceRefresh)) {
      const missingDependencies = await this.getMissingSandboxDependencies();
      if (missingDependencies.length === 0 && this._sandboxDependencyStatus?.bubblewrapUsable === false) {
        if (this._sandboxDependencyStatus.apparmorRestrictsUnprivilegedUserNamespaces !== true || forceRefresh && this._apparmorRemediationRequested) {
          if (!this._enableWeakerNestedSandbox) {
            this._enableWeakerNestedSandbox = true;
            await this.getSandboxConfigPath(true, precheckInputs);
          }
          return {
            enabled: true,
            sandboxConfigPath: this._sandboxConfigPath,
            failedCheck: void 0
          };
        }
        this._apparmorRemediationRequested = true;
        return {
          enabled: true,
          sandboxConfigPath,
          failedCheck: TerminalSandboxPrerequisiteCheck.Bubblewrap,
          remediations: this._getBubblewrapRemediations(),
          detail: this._sandboxDependencyStatus.bubblewrapError
        };
      }
      return {
        enabled: true,
        sandboxConfigPath,
        failedCheck: TerminalSandboxPrerequisiteCheck.Dependencies,
        missingDependencies,
        canInstallMissingDependencies: !!this._sandboxDependencyStatus?.dependencyInstallCommand
      };
    }
    return {
      enabled: true,
      sandboxConfigPath,
      failedCheck: void 0
    };
  }
  async checkFileAccess(permission, paths, precheckInputs) {
    if (!await this._isSandboxConfiguredEnabled(precheckInputs)) {
      return { allowed: true, denied: [] };
    }
    await this._resolveRuntimeInfo();
    if (!this._tempDir) {
      await this._initTempDir();
    }
    const configFilePath = this._tempDir ? this._getUriPath(URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`)) : void 0;
    const accessPaths = await this._getFileSystemAccessPaths(configFilePath);
    const denied = [];
    for (const path of paths) {
      if (!path || !await this._hasFileSystemAccess(permission, path, accessPaths)) {
        denied.push(path);
      }
    }
    return { allowed: denied.length === 0, denied };
  }
  async getSandboxConfigPath(forceRefresh = false, precheckInputs) {
    if (!await this._isSandboxConfiguredEnabled(precheckInputs)) {
      return void 0;
    }
    await this._resolveRuntimeInfo();
    if (!this._sandboxConfigPath || forceRefresh || this._needsForceUpdateConfigFile) {
      this._sandboxConfigPath = await this._createSandboxConfig();
      this._needsForceUpdateConfigFile = false;
    }
    return this._sandboxConfigPath;
  }
  async getMissingSandboxDependencies() {
    const os = await this.getOS();
    if (os === OperatingSystem.Windows) {
      return [];
    }
    if (!this._sandboxDependencyStatus) {
      this._sandboxDependencyStatus = await this._host.checkSandboxDependencies();
    }
    const missing = [];
    if (this._sandboxDependencyStatus && !this._sandboxDependencyStatus.bubblewrapInstalled) {
      missing.push("bubblewrap");
    }
    if (this._sandboxDependencyStatus && !this._sandboxDependencyStatus.socatInstalled) {
      missing.push("socat");
    }
    return missing;
  }
  /**
   * Deletes the sandbox temp directory if one was created. Hosts are expected
   * to invoke this from their shutdown / disposal path; the engine itself does
   * not delete the directory on `dispose()` because shutdown joiners need to
   * be coordinated externally.
   */
  async cleanupTempDir() {
    if (!this._tempDir) {
      return;
    }
    try {
      await this._fileService.del(this._tempDir, { recursive: true, useTrash: false });
    } catch (error) {
      this._logService.warn("TerminalSandboxEngine: Failed to delete sandbox temp dir", error);
    }
  }
  // ---- private helpers ----------------------------------------------------
  async _checkSandboxDependencies(forceRefresh = false) {
    const os = await this.getOS();
    if (os === OperatingSystem.Windows) {
      return true;
    }
    if (!forceRefresh && this._sandboxDependencyStatus) {
      return this._sandboxDependencyStatus.bubblewrapInstalled && this._sandboxDependencyStatus.bubblewrapUsable && this._sandboxDependencyStatus.socatInstalled;
    }
    const status = await this._host.checkSandboxDependencies();
    this._sandboxDependencyStatus = status;
    if (status && !status.bubblewrapInstalled) {
      this._logService.warn("TerminalSandboxEngine: bubblewrap (bwrap) is not installed");
    } else if (status && !status.bubblewrapUsable) {
      this._logService.warn("TerminalSandboxEngine: bubblewrap (bwrap) is installed but failed its capability check", status.bubblewrapError);
    }
    if (status && !status.socatInstalled) {
      this._logService.warn("TerminalSandboxEngine: socat is not installed");
    }
    return status ? status.bubblewrapInstalled && status.bubblewrapUsable && status.socatInstalled : true;
  }
  _getBubblewrapRemediations() {
    return [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction];
  }
  _quoteShellArgument(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
  _getSandboxCommandWithPreservedCwd(command, cwd) {
    if (this._os !== OperatingSystem.Linux || !cwd?.path || cwd.path === this._tempDir?.path) {
      return command;
    }
    return `cd ${this._quoteShellArgument(cwd.path)} && ${command}`;
  }
  _wrapSandboxRuntimeCommandForLaunch(sandboxRuntimeCommand, cwd) {
    const tempDirPath = this._tempDir?.path;
    return this._os === OperatingSystem.Linux && cwd?.path && tempDirPath && cwd.path !== tempDirPath ? `cd ${this._quoteShellArgument(tempDirPath)}; ${sandboxRuntimeCommand}` : sandboxRuntimeCommand;
  }
  _wrapUnsandboxedCommand(command, shell, cwd) {
    if (this._os === OperatingSystem.Windows) {
      return this._windowsMxcRuntime.wrapUnsandboxedCommand(command);
    }
    if (!this._tempDir?.path) {
      return command;
    }
    const commandWithPreservedCwd = this._getSandboxCommandWithPreservedCwd(command, cwd);
    if (!shell) {
      return `(TMPDIR="${this._tempDir.path}"; export TMPDIR; ${commandWithPreservedCwd})`;
    }
    return `env TMPDIR="${this._tempDir.path}" ${this._quoteShellArgument(shell)} -c ${this._quoteShellArgument(commandWithPreservedCwd)}`;
  }
  _getBlockedDomains(command) {
    if (this._isSandboxAllowNetworkConfigured()) {
      return { blockedDomains: [], deniedDomains: [] };
    }
    const domains = this._extractDomains(command);
    if (domains.length === 0) {
      return { blockedDomains: [], deniedDomains: [] };
    }
    const { allowedDomains, deniedDomains } = this.getResolvedNetworkDomains();
    const blockedDomains = /* @__PURE__ */ new Set();
    const explicitlyDeniedDomains = /* @__PURE__ */ new Set();
    for (const domain of domains) {
      if (deniedDomains.some((pattern) => matchesDomainPattern(domain, pattern))) {
        blockedDomains.add(domain);
        explicitlyDeniedDomains.add(domain);
        continue;
      }
      if (!allowedDomains.some((pattern) => matchesDomainPattern(domain, pattern))) {
        blockedDomains.add(domain);
      }
    }
    return {
      blockedDomains: [...blockedDomains],
      deniedDomains: [...explicitlyDeniedDomains]
    };
  }
  _extractDomains(command) {
    const domains = /* @__PURE__ */ new Set();
    let match;
    TerminalSandboxEngine._urlRegex.lastIndex = 0;
    while ((match = TerminalSandboxEngine._urlRegex.exec(command)) !== null) {
      const domain = this._extractDomainFromUrl(match[0]);
      if (domain) {
        domains.add(domain);
      }
    }
    TerminalSandboxEngine._sshRemoteRegex.lastIndex = 0;
    while ((match = TerminalSandboxEngine._sshRemoteRegex.exec(command)) !== null) {
      const domain = normalizeDomain(match[1], true);
      if (domain) {
        domains.add(domain);
      }
    }
    TerminalSandboxEngine._hostRegex.lastIndex = 0;
    while ((match = TerminalSandboxEngine._hostRegex.exec(command)) !== null) {
      const domain = normalizeDomain(match[1]);
      if (domain) {
        domains.add(domain);
      }
    }
    return [...domains];
  }
  _extractDomainFromUrl(value) {
    try {
      const authority = URI.parse(value).authority;
      return normalizeDomain(authority, true);
    } catch {
      return void 0;
    }
  }
  _normalizeCommandKeywords(commandKeywords) {
    return [...new Set(commandKeywords.map((keyword) => keyword.toLowerCase()))].sort();
  }
  _normalizeCommandDetails(commandDetails) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const command of commandDetails) {
      const normalizedCommand = { keyword: command.keyword.toLowerCase(), args: [...command.args] };
      const key = JSON.stringify(normalizedCommand);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(normalizedCommand);
      }
    }
    return result.sort((a, b) => a.keyword.localeCompare(b.keyword) || a.args.join("\0").localeCompare(b.args.join("\0")));
  }
  _areStringArraysEqual(a, b) {
    return a.length === b.length && a.every((keyword, index) => keyword === b[index]);
  }
  _areObjectsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  _isSandboxAllowedByPrecheckInputs(precheckInputs) {
    return precheckInputs?.isDefaultApprovalPermissionEnabled !== false;
  }
  async _isSandboxConfiguredEnabled(precheckInputs) {
    if (!this._isSandboxAllowedByPrecheckInputs(precheckInputs)) {
      return false;
    }
    await this.getOS();
    if (this._os === OperatingSystem.Windows) {
      const value2 = this._getSandboxConfiguredWindowsEnabledValue();
      return isAgentSandboxEnabledValue(value2);
    }
    const value = this._getSandboxConfiguredEnabledValue();
    return isAgentSandboxEnabledValue(value);
  }
  async _resolveRuntimeInfo() {
    if (this._runtimeResolved) {
      return;
    }
    this._runtimeResolved = true;
    const runtimeInfo = await this._host.getRuntimeInfo();
    this._appRoot = runtimeInfo.appRoot;
    this._execPath = runtimeInfo.execPath;
    this._runAsNode = runtimeInfo.runAsNode ?? false;
    this._userHome = await this._host.getUserHome();
    this._srtPath = this._pathJoin(this._appRoot, "node_modules", "@vscode", "sandbox-runtime", "dist", "cli.js");
    const nativeModulesDir = runtimeInfo.nativeModulesDir ?? "node_modules";
    const rgPlatform = this._os === OperatingSystem.Windows ? "win32" : this._os === OperatingSystem.Macintosh ? "darwin" : "linux";
    const rgBinary = this._os === OperatingSystem.Windows ? "rg.exe" : "rg";
    this._rgPath = this._pathJoin(this._appRoot, nativeModulesDir, "@vscode", "ripgrep-universal", "bin", `${rgPlatform}-${arch}`, rgBinary);
    this._mxcPath = this._windowsMxcRuntime.getExecutablePath(this._appRoot, nativeModulesDir, runtimeInfo.arch);
  }
  async _createSandboxConfig() {
    if (await this.isEnabled() && !this._tempDir) {
      await this._initTempDir();
    }
    if (!this._tempDir) {
      return void 0;
    }
    const allowNetwork = this._commandAllowNetwork || await this.isSandboxAllowNetworkEnabled();
    const linuxFileSystemSetting = this._os === OperatingSystem.Linux ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem) ?? {} : {};
    const macFileSystemSetting = this._os === OperatingSystem.Macintosh ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxMacFileSystem) ?? {} : {};
    const windowsFileSystemSetting = this._os === OperatingSystem.Windows ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem) ?? {} : {};
    const windowsSchemaVersion = this._os === OperatingSystem.Windows ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion) : void 0;
    const runtimeSetting = {
      ...this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime),
      ...this._enableWeakerNestedSandbox ? { enableWeakerNestedSandbox: true } : void 0
    };
    const commandRuntimeSetting = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
    const commandRuntimeAllowReadPaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, "allowRead");
    const commandRuntimeAllowWritePaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, "allowWrite");
    const configFileUri = URI.joinPath(this._tempDir, `vscode-sandbox-settings-${this._sandboxSettingsId}.json`);
    const configFilePath = this._getUriPath(configFileUri);
    let allowWritePaths = [];
    let allowReadPaths = [];
    let denyReadPaths = [];
    let denyWritePaths;
    if (this._os === OperatingSystem.Windows) {
      const filesystemPolicy = await this._getWindowsMxcFilesystemPolicy();
      const env = await this._getWindowsMxcEnvironment();
      allowWritePaths = await this._resolveFileSystemPaths([
        ...await this._updateAllowWritePathsWithWorkspaceFolders(windowsFileSystemSetting.allowWrite),
        ...filesystemPolicy.readwritePaths
      ]);
      allowReadPaths = await this._resolveFileSystemPaths([...windowsFileSystemSetting.allowRead ?? [], ...filesystemPolicy.readonlyPaths]);
      denyReadPaths = await this._resolveFileSystemPaths(windowsFileSystemSetting.denyRead ?? []);
      this._windowsMxcEnvironment = env;
    } else if (this._os === OperatingSystem.Macintosh) {
      allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter((path) => path !== configFilePath);
      allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(macFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
      denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...macFileSystemSetting.denyRead ?? [], configFilePath]));
      denyWritePaths = macFileSystemSetting.denyWrite ? await this._resolveFileSystemPaths(macFileSystemSetting.denyWrite) : void 0;
    } else if (this._os === OperatingSystem.Linux) {
      allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter((path) => path !== configFilePath);
      allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(linuxFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
      denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...linuxFileSystemSetting.denyRead ?? [], configFilePath]));
      denyWritePaths = await this._resolveFileSystemPaths(linuxFileSystemSetting.denyWrite);
    }
    const sandboxSettings = this._os === OperatingSystem.Windows ? await this._windowsMxcRuntime.createConfig({
      command: this._commandLine ?? "",
      shell: this._commandShell,
      cwd: this._commandCwd ?? this._getDefaultWindowsMxcCwd(),
      tempDir: this._tempDir,
      schemaVersion: windowsSchemaVersion,
      allowNetwork,
      allowReadPaths,
      allowWritePaths,
      denyReadPaths,
      env: this._windowsMxcEnvironment ?? []
    }, this._buildSandboxPayload) : {
      network: allowNetwork ? { allowedDomains: [], deniedDomains: [], enabled: false } : this.getResolvedNetworkDomains(),
      filesystem: {
        denyRead: denyReadPaths,
        allowRead: allowReadPaths,
        allowWrite: allowWritePaths,
        denyWrite: denyWritePaths
      }
    };
    if (this._os !== OperatingSystem.Windows) {
      const sandboxRuntimeSettings = sandboxSettings;
      this._mergeAdditionalSandboxConfigProperties(sandboxRuntimeSettings, runtimeSetting);
      this._mergeAdditionalSandboxConfigProperties(sandboxRuntimeSettings, commandRuntimeSetting);
      if (this._os === OperatingSystem.Macintosh) {
        sandboxRuntimeSettings.allowPty ??= true;
      }
    }
    this._sandboxConfigPath = configFilePath;
    await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(sandboxSettings, null, "	")), { overwrite: true });
    return this._sandboxConfigPath;
  }
  async _getFileSystemAccessPaths(configFilePath) {
    const linuxFileSystemSetting = this._os === OperatingSystem.Linux ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem) ?? {} : {};
    const macFileSystemSetting = this._os === OperatingSystem.Macintosh ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxMacFileSystem) ?? {} : {};
    const windowsFileSystemSetting = this._os === OperatingSystem.Windows ? this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem) ?? {} : {};
    const commandRuntimeSetting = getTerminalSandboxRuntimeConfigurationForCommands(this._os, this._commandAllowListCommandDetails);
    const commandRuntimeAllowReadPaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, "allowRead");
    const commandRuntimeAllowWritePaths = this._getCommandRuntimeFileSystemPaths(commandRuntimeSetting, "allowWrite");
    let allowWritePaths = [];
    let allowReadPaths = [];
    let denyReadPaths = [];
    let denyWritePaths;
    if (this._os === OperatingSystem.Windows) {
      const filesystemPolicy = await this._getWindowsMxcFilesystemPolicy();
      allowWritePaths = await this._resolveFileSystemPaths([
        ...await this._updateAllowWritePathsWithWorkspaceFolders(windowsFileSystemSetting.allowWrite),
        ...filesystemPolicy.readwritePaths
      ]);
      allowReadPaths = await this._resolveFileSystemPaths([...windowsFileSystemSetting.allowRead ?? [], ...filesystemPolicy.readonlyPaths]);
      denyReadPaths = await this._resolveFileSystemPaths(windowsFileSystemSetting.denyRead ?? []);
    } else if (this._os === OperatingSystem.Macintosh) {
      allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(macFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter((path) => path !== configFilePath);
      allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(macFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
      denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...macFileSystemSetting.denyRead ?? [], ...configFilePath ? [configFilePath] : []]));
      denyWritePaths = macFileSystemSetting.denyWrite ? await this._resolveFileSystemPaths(macFileSystemSetting.denyWrite) : void 0;
    } else if (this._os === OperatingSystem.Linux) {
      allowWritePaths = (await this._resolveFileSystemPaths(await this._updateAllowWritePathsWithWorkspaceFolders(linuxFileSystemSetting.allowWrite, commandRuntimeAllowWritePaths))).filter((path) => path !== configFilePath);
      allowReadPaths = await this._resolveFileSystemPaths(await this._updateAllowReadPathsWithAllowWrite(linuxFileSystemSetting.allowRead, allowWritePaths, commandRuntimeAllowReadPaths));
      denyReadPaths = await this._resolveFileSystemPaths(this._updateDenyReadPathsWithHome([...linuxFileSystemSetting.denyRead ?? [], ...configFilePath ? [configFilePath] : []]));
      denyWritePaths = await this._resolveFileSystemPaths(linuxFileSystemSetting.denyWrite);
    }
    return { allowReadPaths, allowWritePaths, denyReadPaths, denyWritePaths };
  }
  async _hasFileSystemAccess(permission, path, accessPaths) {
    const resolvedPaths = await this._resolveFileSystemPath(path);
    if (permission === "write") {
      if (this._os === OperatingSystem.Windows && this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.denyReadPaths)) {
        return false;
      }
      if (this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.denyWritePaths ?? [])) {
        return false;
      }
      return this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.allowWritePaths);
    }
    if (this._matchesAnyFileSystemPath(resolvedPaths, [...accessPaths.allowReadPaths, ...accessPaths.allowWritePaths])) {
      return true;
    }
    return !this._matchesAnyFileSystemPath(resolvedPaths, accessPaths.denyReadPaths);
  }
  _matchesAnyFileSystemPath(paths, matchers) {
    return paths.some((path) => matchers.some((matcher) => this._matchesFileSystemPath(path, matcher)));
  }
  /**
   * Returns whether a candidate filesystem path is covered by a sandbox allow/deny
   * matcher. Both values are normalized with the target sandbox OS semantics before
   * comparison. Non-glob matchers are treated as exact-or-parent matches; glob
   * matchers are evaluated with VS Code's glob matcher.
   *
   * Examples:
   * - Linux/macOS: `/workspace/project/src/file.ts` matches `/workspace/project`.
   * - Linux/macOS: `/workspace/project2/file.ts` does not match `/workspace/project`.
   * - Windows: `C:\Repo\src\file.ts` matches `c:/repo` because matching is
   *   case-insensitive and backslashes are normalized to `/`.
   * - Glob: `/workspace/project/package.json` matches `/workspace/project/*.json`.
   */
  _matchesFileSystemPath(path, matcher) {
    const normalizedPath = this._normalizeFileSystemAccessPath(path);
    const normalizedMatcher = this._normalizeFileSystemAccessPath(matcher, true);
    const ignoreCase = this._os === OperatingSystem.Windows;
    if (this._containsGlobPattern(normalizedMatcher)) {
      return globMatch(normalizedMatcher, normalizedPath, { ignoreCase });
    }
    return this._fileSystemPathExtUri.isEqualOrParent(this._toFileSystemAccessUri(normalizedPath), this._toFileSystemAccessUri(normalizedMatcher));
  }
  /**
   * Converts a normalized sandbox filesystem path into a pseudo URI so the common
   * `ExtUri.isEqualOrParent` comparer can be used instead of deprecated string
   * path helpers. A non-`file` scheme is intentional: it keeps comparison on the
   * URI path component and avoids converting through the host OS' native `fsPath`
   * rules, which may differ from the sandbox target OS.
   *
   * Examples:
   * - `/workspace/project` becomes `terminal-sandbox-path:/workspace/project`.
   * - `C:/Repo` becomes `terminal-sandbox-path:/C:/Repo` so Windows drive paths
   *   are still valid URI paths for comparison.
   */
  _toFileSystemAccessUri(path) {
    return URI.from({ scheme: "terminal-sandbox-path", path: path.startsWith("/") ? path : `/${path}` });
  }
  /**
   * Normalizes a path or matcher into the form used for sandbox access checks.
   * On Windows, backslashes are converted to `/` and URI-shaped drive paths like
   * `/C:/Users/me` are converted to `C:/Users/me`. Unless `preserveGlob` is true
   * for a glob matcher, the path is POSIX-normalized to remove redundant `.`/`..`
   * segments. Trailing slashes are removed except for filesystem roots.
   *
   * Examples:
   * - Linux/macOS: `/workspace/../workspace/app/` becomes `/workspace/app`.
   * - Windows: `C:\Users\me\project\` becomes `C:/Users/me/project`.
   * - Windows: `/C:/Users/me/project` becomes `C:/Users/me/project`.
   * - Glob with `preserveGlob=true`: `/workspace/project/*.json` keeps the glob
   *   pattern intact for `globMatch`.
   */
  _normalizeFileSystemAccessPath(path, preserveGlob = false) {
    let normalizedPath = this._os === OperatingSystem.Windows ? path.replace(/\\/g, "/") : path;
    if (this._os === OperatingSystem.Windows && /^\/[a-zA-Z]:($|\/)/.test(normalizedPath)) {
      normalizedPath = normalizedPath.slice(1);
    }
    if (!preserveGlob || !this._containsGlobPattern(normalizedPath)) {
      normalizedPath = posix.normalize(normalizedPath);
    }
    if (normalizedPath.length > 1 && normalizedPath.endsWith("/") && !/^[a-zA-Z]:\/$/.test(normalizedPath)) {
      normalizedPath = normalizedPath.replace(/\/+$/, "");
    }
    return normalizedPath;
  }
  _containsGlobPattern(path) {
    return /[*?{\[]/.test(path);
  }
  _getCommandRuntimeFileSystemPaths(runtimeSetting, key) {
    const filesystem = runtimeSetting.filesystem;
    if (!this._isObjectForSandboxConfigMerge(filesystem)) {
      return [];
    }
    const paths = filesystem[key];
    if (!Array.isArray(paths)) {
      return [];
    }
    return paths.filter((path) => typeof path === "string");
  }
  _mergeAdditionalSandboxConfigProperties(target, additional) {
    for (const [key, value] of Object.entries(additional)) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) {
        target[key] = value;
        continue;
      }
      const existingValue = target[key];
      if (this._isObjectForSandboxConfigMerge(existingValue) && this._isObjectForSandboxConfigMerge(value)) {
        this._mergeAdditionalSandboxConfigProperties(existingValue, value);
      }
    }
  }
  _isObjectForSandboxConfigMerge(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  async _getWindowsMxcFilesystemPolicy() {
    if (!this._windowsMxcFilesystemPolicy) {
      this._windowsMxcFilesystemPolicy = await this._host.getWindowsMxcFilesystemPolicy() ?? { readonlyPaths: [], readwritePaths: [] };
    }
    return this._windowsMxcFilesystemPolicy;
  }
  async _getWindowsMxcEnvironment() {
    if (!this._windowsMxcEnvironment) {
      this._windowsMxcEnvironment = await this._host.getWindowsMxcEnvironment() ?? [];
    }
    return this._windowsMxcEnvironment;
  }
  _pathDirname(path) {
    return (this._os === OperatingSystem.Windows ? win32 : posix).dirname(path);
  }
  _getUriPath(uri) {
    return this._os === OperatingSystem.Windows ? this._windowsMxcRuntime.toWindowsPath(uri) : uri.path;
  }
  async _initTempDir() {
    if (!await this.isEnabled()) {
      return;
    }
    this._needsForceUpdateConfigFile = true;
    this._tempDir = await this._host.getSandboxTempDir();
    if (this._tempDir) {
      await this._fileService.createFolder(this._tempDir);
      this._defaultWritePaths.push(this._getUriPath(this._tempDir));
    } else {
      this._logService.warn("TerminalSandboxEngine: Cannot create sandbox settings file because no tmpDir is available in this environment");
    }
  }
  async _updateAllowWritePathsWithWorkspaceFolders(configuredAllowWrite, commandRuntimeAllowWrite = []) {
    const writeRootPaths = this._host.getWriteRoots().map((folder) => this._getUriPath(folder));
    return [.../* @__PURE__ */ new Set([...writeRootPaths, ...this._defaultWritePaths, ...await this._getWorkspaceStorageReadPaths(), ...configuredAllowWrite ?? [], ...commandRuntimeAllowWrite])];
  }
  _updateDenyReadPathsWithHome(configuredDenyRead) {
    if (this._os === OperatingSystem.Windows) {
      return [...new Set(configuredDenyRead ?? [])];
    }
    const userHome = this._userHome ? this._getUriPath(this._userHome) : void 0;
    return [.../* @__PURE__ */ new Set([...configuredDenyRead ?? [], ...userHome ? [userHome] : []])];
  }
  async _updateAllowReadPathsWithAllowWrite(configuredAllowRead, allowWrite, commandRuntimeAllowRead = []) {
    return [.../* @__PURE__ */ new Set([...configuredAllowRead ?? [], ...getTerminalSandboxReadAllowListForCommands(this._os, this._commandAllowListKeywords, this._commandAllowListCommandDetails), ...commandRuntimeAllowRead, ...this._getSandboxRuntimeReadPaths(), ...await this._getWorkspaceStorageReadPaths(), ...allowWrite])];
  }
  async _resolveFileSystemPaths(paths) {
    const resolvedPaths = await Promise.all((paths ?? []).map((path) => this._resolveFileSystemPath(path)));
    const seenPaths = /* @__PURE__ */ new Set();
    return resolvedPaths.flat().filter((path) => {
      const comparisonKey = this._getFileSystemPathComparisonKey(path);
      if (seenPaths.has(comparisonKey)) {
        return false;
      }
      seenPaths.add(comparisonKey);
      return true;
    });
  }
  _getFileSystemPathComparisonKey(path) {
    return this._os === OperatingSystem.Windows ? path.replace(/\//g, "\\").toLowerCase() : path;
  }
  async _resolveFileSystemPath(path) {
    const expandedPath = this._os === OperatingSystem.Linux ? this._expandHomePath(path) : path;
    if (!this._isAbsoluteFileSystemPath(expandedPath)) {
      return [expandedPath];
    }
    try {
      const realpath = await this._fileService.realpath(this._toFileSystemResource(expandedPath));
      const resolvedPath = realpath ? this._getUriPath(realpath) : void 0;
      return resolvedPath && resolvedPath !== expandedPath ? [expandedPath, resolvedPath] : [expandedPath];
    } catch {
      return [expandedPath];
    }
  }
  _isAbsoluteFileSystemPath(path) {
    return (this._os === OperatingSystem.Windows ? win32 : posix).isAbsolute(path);
  }
  _toFileSystemResource(path) {
    if (this._os === OperatingSystem.Windows) {
      return this._toWindowsFileSystemResource(path);
    }
    return this._userHome?.with({ path }) ?? this._tempDir?.with({ path }) ?? this._host.getWriteRoots()[0]?.with({ path }) ?? URI.file(path);
  }
  _toWindowsFileSystemResource(path) {
    const normalizedPath = path.replace(/\\/g, "/");
    if (/^\/\/[^/]/.test(normalizedPath)) {
      const firstPathSeparator = normalizedPath.indexOf("/", 2);
      if (firstPathSeparator === -1) {
        return URI.from({ scheme: "file", authority: normalizedPath.slice(2), path: "/" });
      }
      return URI.from({ scheme: "file", authority: normalizedPath.slice(2, firstPathSeparator), path: normalizedPath.slice(firstPathSeparator) || "/" });
    }
    if (/^[a-zA-Z]:($|\/)/.test(normalizedPath)) {
      return URI.from({ scheme: "file", path: `/${normalizedPath[0].toLowerCase()}${normalizedPath.slice(1)}` });
    }
    if (/^\/[a-zA-Z]:($|\/)/.test(normalizedPath)) {
      return URI.from({ scheme: "file", path: `/${normalizedPath[1].toLowerCase()}${normalizedPath.slice(2)}` });
    }
    return URI.from({ scheme: "file", path: normalizedPath });
  }
  _expandHomePath(path) {
    const userHome = this._userHome?.path;
    if (!userHome) {
      return path;
    }
    if (path === "~") {
      return userHome;
    }
    if (path.startsWith("~/")) {
      return this._pathJoin(userHome, path.slice(2));
    }
    return path;
  }
  _getSandboxRuntimeReadPaths() {
    if (!this._appRoot) {
      return [];
    }
    if (this._os === OperatingSystem.Windows) {
      return this._windowsMxcRuntime.getRuntimeReadPaths(this._appRoot, this._mxcPath);
    }
    const paths = [this._appRoot];
    if (this._execPath) {
      for (const path of [this._execPath, this._pathDirname(this._execPath)]) {
        if (!this._isPathUnderAppRoot(path)) {
          paths.push(path);
        }
      }
    }
    return paths;
  }
  _isPathUnderAppRoot(path) {
    if (!this._appRoot) {
      return false;
    }
    return path === this._appRoot || path.startsWith(`${this._appRoot}${this._os === OperatingSystem.Windows ? win32.sep : posix.sep}`);
  }
  async _getWorkspaceStorageReadPaths() {
    const root = await this._host.getWorkspaceStorageReadRoot();
    return root ? [this._getUriPath(root)] : [];
  }
  _getDefaultWindowsMxcCwd() {
    return this._host.getWriteRoots()[0];
  }
  _getSandboxConfiguredEnabledValue() {
    return this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled) ?? AgentSandboxEnabledValue.Off;
  }
  _getSandboxConfiguredWindowsEnabledValue() {
    return this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsEnabled) ?? AgentSandboxEnabledValue.Off;
  }
  _isSandboxAllowNetworkConfigured() {
    return this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork) === true;
  }
  _areUnsandboxedCommandsAllowed() {
    return this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands) === true;
  }
  _areRetryWithAllowNetworkRequestsAllowed() {
    return this._host.getSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests) === true;
  }
};
TerminalSandboxEngine._urlRegex = /(?:https?|wss?):\/\/[^\s'"`|&;<>]+/gi;
TerminalSandboxEngine._sshRemoteRegex = /(?:^|[\s'"`])(?:[^\s@:'"`]+@)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::[^\s'"`|&;<>]+)(?=$|[\s'"`|&;<>])/gi;
TerminalSandboxEngine._hostRegex = /(?:^|[\s'"`(=])([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?::\d+)?(?=(?:\/[^\s'"`|&;<>]*)?(?:$|[\s'"`)\]|,;|&<>]))/gi;
TerminalSandboxEngine = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IWindowsMxcTerminalSandboxRuntime)
], TerminalSandboxEngine);
export {
  TerminalSandboxEngine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc2FuZGJveFxcY29tbW9uXFx0ZXJtaW5hbFNhbmRib3hFbmdpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG1hdGNoIGFzIGdsb2JNYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwb3NpeCwgd2luMzIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSwgT1MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBhcmNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBFeHRVcmkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgbWF0Y2hlc0RvbWFpblBhdHRlcm4sIG5vcm1hbGl6ZURvbWFpbiB9IGZyb20gJy4uLy4uL25ldHdvcmtGaWx0ZXIvY29tbW9uL2RvbWFpbk1hdGNoZXIuanMnO1xuaW1wb3J0IHsgQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vbmV0d29ya0ZpbHRlci9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgSVNhbmRib3hEZXBlbmRlbmN5U3RhdHVzLCB0eXBlIElXaW5kb3dzTXhjQ29uZmlnLCBJV2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3ksIHR5cGUgSVdpbmRvd3NNeGNQb2xpY3lDb250YWlubWVudCwgdHlwZSBJV2luZG93c014Y1NhbmRib3hQb2xpY3kgfSBmcm9tICcuL3NhbmRib3hIZWxwZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSwgQWdlbnRTYW5kYm94U2V0dGluZ0lkLCBpc0FnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSB9IGZyb20gJy4vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgSVdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lIH0gZnJvbSAnLi90ZXJtaW5hbFNhbmRib3hNeGNSdW50aW1lLmpzJztcbmltcG9ydCB7IGdldFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RGb3JDb21tYW5kcyB9IGZyb20gJy4vdGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdC5qcyc7XG5pbXBvcnQgeyBnZXRUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbkZvckNvbW1hbmRzIH0gZnJvbSAnLi90ZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvblBlck9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTYW5kYm94Q29tbWFuZCwgSVRlcm1pbmFsU2FuZGJveEZpbGVBY2Nlc3NDaGVja1Jlc3VsdCwgSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzLCBJVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2tSZXN1bHQsIElUZXJtaW5hbFNhbmRib3hSZXNvbHZlZE5ldHdvcmtEb21haW5zLCBJVGVybWluYWxTYW5kYm94V3JhcFJlc3VsdCwgVGVybWluYWxTYW5kYm94RmlsZUFjY2Vzc1Blcm1pc3Npb24sIFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLCBUZXJtaW5hbFNhbmRib3hQcmVDaGVja1JlbWVkaWF0aW9uIH0gZnJvbSAnLi90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIElUZXJtaW5hbFNhbmRib3hGaWxlU3lzdGVtU2V0dGluZyB7XG5cdGRlbnlSZWFkPzogc3RyaW5nW107XG5cdGFsbG93UmVhZD86IHN0cmluZ1tdO1xuXHRhbGxvd1dyaXRlPzogc3RyaW5nW107XG5cdGRlbnlXcml0ZT86IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgSVRlcm1pbmFsU2FuZGJveEZpbGVTeXN0ZW1BY2Nlc3NQYXRocyB7XG5cdGFsbG93UmVhZFBhdGhzOiBzdHJpbmdbXTtcblx0YWxsb3dXcml0ZVBhdGhzOiBzdHJpbmdbXTtcblx0ZGVueVJlYWRQYXRoczogc3RyaW5nW107XG5cdGRlbnlXcml0ZVBhdGhzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcbn1cblxuLyoqIFJ1bnRpbWUgaW5mb3JtYXRpb24gbmVlZGVkIHRvIGxhdW5jaCB0aGUgc2FuZGJveC1ydW50aW1lIENMSS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsU2FuZGJveFJ1bnRpbWVJbmZvIHtcblx0LyoqIERpcmVjdG9yeSB0aGF0IGNvbnRhaW5zIGBub2RlX21vZHVsZXMvQHZzY29kZS9zYW5kYm94LXJ1bnRpbWVgIGFuZCBgbm9kZV9tb2R1bGVzL0B2c2NvZGUvcmlwZ3JlcGAuICovXG5cdGFwcFJvb3Q6IHN0cmluZztcblx0LyoqXG5cdCAqIE5hbWUgb2YgdGhlIGRpcmVjdG9yeSAocmVsYXRpdmUgdG8ge0BsaW5rIGFwcFJvb3R9KSB0aGF0IGhvbGRzIHRoZSBuYXRpdmVcblx0ICogYmluYXJpZXMgYHJpcGdyZXAtdW5pdmVyc2FsYCBhbmQgYEBtaWNyb3NvZnQvbXhjLXNka2AuIEluIGEgcGFja2FnZWQgZGVza3RvcFxuXHQgKiBidWlsZCB0aGVzZSBhcmUgdW5wYWNrZWQgZnJvbSB0aGUgYXJjaGl2ZSBpbnRvIGBub2RlX21vZHVsZXMuYXNhci51bnBhY2tlZGA7XG5cdCAqIGluIGRldiBhbmQgb24gcmVtb3RlIHRoZXkgbGl2ZSBpbiBwbGFpbiBgbm9kZV9tb2R1bGVzYC4gRGVmYXVsdHMgdG9cblx0ICogYG5vZGVfbW9kdWxlc2AuIE5vdGUgdGhlIHNhbmRib3gtcnVudGltZSBDTEkgaXRzZWxmIGlzIGFsd2F5cyByZXNvbHZlZCBmcm9tXG5cdCAqIHBsYWluIGBub2RlX21vZHVsZXNgIChpdCBpcyBkdXBsaWNhdGVkIG91dCBvZiB0aGUgYXJjaGl2ZSkgYmVjYXVzZSBpdCBpc1xuXHQgKiBzcGF3bmVkIGFzIGEgc3RhbmRhbG9uZSBOb2RlIHN1YnByb2Nlc3Mgd2l0aG91dCB0aGUgQVNBUiByZXNvbHV0aW9uIGhvb2suXG5cdCAqL1xuXHRuYXRpdmVNb2R1bGVzRGlyPzogc3RyaW5nO1xuXHQvKiogUGF0aCBvZiB0aGUgbm9kZS9lbGVjdHJvbiBleGVjdXRhYmxlIHVzZWQgdG8gcnVuIHNhbmRib3gtcnVudGltZS4gKi9cblx0ZXhlY1BhdGg/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBXaGVuIHRydWUgdGhlIGVuZ2luZSBwcmVmaXhlcyB0aGUgd3JhcHBlZCBjb21tYW5kIHdpdGggYEVMRUNUUk9OX1JVTl9BU19OT0RFPTFgXG5cdCAqIHNvIHRoZSBFbGVjdHJvbiBiaW5hcnkgYWN0cyBhcyBhIE5vZGUuanMgZXhlY3V0YWJsZS4gU2V0IGJ5IGhvc3RzIHRoYXQgcmVzb2x2ZVxuXHQgKiBhbiBFbGVjdHJvbi1iYXNlZCBleGVjIHBhdGggKHRoZSBsb2NhbCB3b3JrYmVuY2gpOyBsZWF2ZSB1bmRlZmluZWQgLyBmYWxzZSB3aGVuXG5cdCAqIGBleGVjUGF0aGAgYWxyZWFkeSBwb2ludHMgYXQgYSByZWFsIGBub2RlYCBiaW5hcnkgKHJlbW90ZSwgYWdlbnQgaG9zdCkuXG5cdCAqL1xuXHRydW5Bc05vZGU/OiBib29sZWFuO1xuXHQvKiogQ1BVIGFyY2hpdGVjdHVyZSBvZiB0aGUgZW52aXJvbm1lbnQgdGhhdCBydW5zIHRoZSBzYW5kYm94IHJ1bnRpbWUuICovXG5cdGFyY2g/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogSG9zdCBhZGFwdGVyIHRoYXQgc3VwcGxpZXMgdGhlIGVuZ2luZSB3aXRoIGVudmlyb25tZW50L3dvcmtzcGFjZSBkYXRhIHRoZVxuICogcGxhdGZvcm0gbGF5ZXIgY2Fubm90IHJlc29sdmUgb24gaXRzIG93bi4gSG9zdHMgKHdvcmtiZW5jaCwgYWdlbnQgaG9zdClcbiAqIGltcGxlbWVudCB0aGlzIHRvIGJyaWRnZSB0aGVpciBwZXItZW52aXJvbm1lbnQgc2VydmljZXMgKGBJUmVtb3RlQWdlbnRTZXJ2aWNlYCxcbiAqIGBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2VgLCBgSUVudmlyb25tZW50U2VydmljZWAsIGBJUHJvZHVjdFNlcnZpY2VgLFxuICogYElTYW5kYm94SGVscGVyU2VydmljZWAsIFx1MjAyNikgaW50byB0aGUgZW5naW5lLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbFNhbmRib3hFbmdpbmVIb3N0IHtcblx0LyoqIEVmZmVjdGl2ZSBPUyB1c2VkIGJ5IHNhbmRib3ggZGVjaXNpb25zLiBNYXkgYmUgdGhlIHJlbW90ZSBPUyBpbiB3b3JrYmVuY2guICovXG5cdGdldE9TKCk6IFByb21pc2U8T3BlcmF0aW5nU3lzdGVtPjtcblx0LyoqIFJlc29sdmVzIGFwcCByb290ICsgbm9kZS9lbGVjdHJvbiBleGVjIHBhdGggKGFmdGVyIHRoZSByZW1vdGUgZW52IGlzIGtub3duLCBpZiBhcHBsaWNhYmxlKS4gKi9cblx0Z2V0UnVudGltZUluZm8oKTogUHJvbWlzZTxJVGVybWluYWxTYW5kYm94UnVudGltZUluZm8+O1xuXHQvKiogUmVzb2x2ZXMgdGhlIHVzZXIgaG9tZSB1c2VkIGZvciBgfmAtZXhwYW5zaW9uIGFuZCB0aGUgZGVmYXVsdCBkZW55LXJlYWQgZW50cnkuICovXG5cdGdldFVzZXJIb21lKCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPjtcblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBkaXJlY3RvcnkgdGhlIGVuZ2luZSBjcmVhdGVzIGFuZCB1c2VzIGFzIGl0cyBzYW5kYm94IHRlbXAgZGlyXG5cdCAqIChzYW5kYm94LXNldHRpbmdzIEpTT04gZmlsZSBsaXZlcyBoZXJlKS4gTWF5IHJldHVybiB1bmRlZmluZWQgd2hlbiBub1xuXHQgKiBzdWl0YWJsZSBsb2NhdGlvbiBleGlzdHMsIGluIHdoaWNoIGNhc2Ugc2FuZGJveGluZyBpcyBkaXNhYmxlZC5cblx0ICovXG5cdGdldFNhbmRib3hUZW1wRGlyKCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPjtcblx0LyoqIFBhdGggYWRkZWQgdG8gYGFsbG93UmVhZGAgYW5kIGBhbGxvd1dyaXRlYCBmb3IgdGhlIGVuZ2luZSdzIHdvcmtzcGFjZS9zZXNzaW9uIHN0b3JhZ2UgYXJlYS4gKi9cblx0Z2V0V29ya3NwYWNlU3RvcmFnZVJlYWRSb290KCk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPjtcblx0LyoqIFJvb3RzIHRoYXQgbXVzdCBiZSB3cml0YWJsZSBpbnNpZGUgdGhlIHNhbmRib3ggKHdvcmtzcGFjZSBmb2xkZXJzIC8gc2Vzc2lvbiBjd2RzKS4gKi9cblx0Z2V0V3JpdGVSb290cygpOiByZWFkb25seSBVUklbXTtcblx0LyoqIEZpcmVzIHdoZW4ge0BsaW5rIGdldFdyaXRlUm9vdHN9IG9yIHtAbGluayBnZXRXb3Jrc3BhY2VTdG9yYWdlUmVhZFJvb3R9IGNoYW5nZS4gKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSb290czogRXZlbnQ8dm9pZD47XG5cdC8qKiBSZXNvbHZlcyB0aGUgaW5zdGFsbGVkIHNhbmRib3gtZGVwZW5kZW5jeSBzdGF0dXMgKGJ1YmJsZXdyYXAsIHNvY2F0KS4gKi9cblx0Y2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzKCk6IFByb21pc2U8SVNhbmRib3hEZXBlbmRlbmN5U3RhdHVzIHwgdW5kZWZpbmVkPjtcblx0LyoqIFJlc29sdmVzIGhvc3QgZmlsZXN5c3RlbSBwb2xpY3kgZnJhZ21lbnRzIG5lZWRlZCBieSB0aGUgV2luZG93cyBNWEMgcHJvY2VzcyBjb250YWluZXIuICovXG5cdGdldFdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5KCk6IFByb21pc2U8SVdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5IHwgdW5kZWZpbmVkPjtcblx0LyoqIFJlc29sdmVzIGhvc3QgZW52aXJvbm1lbnQgdmFyaWFibGVzIG5lZWRlZCBieSB0aGUgV2luZG93cyBNWEMgcHJvY2VzcyBjb250YWluZXIuICovXG5cdGdldFdpbmRvd3NNeGNFbnZpcm9ubWVudCgpOiBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPjtcblx0LyoqIEJ1aWxkcyBhIFdpbmRvd3MgTVhDIHBheWxvYWQgZnJvbSBhIHRhcmdldC1lbnZpcm9ubWVudCBNWEMgc2FuZGJveCBwb2xpY3kuICovXG5cdGJ1aWxkV2luZG93c014Y1NhbmRib3hQYXlsb2FkKGNvbW1hbmRMaW5lOiBzdHJpbmcsIHBvbGljeTogSVdpbmRvd3NNeGNTYW5kYm94UG9saWN5LCB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nLCBjb250YWluZXJOYW1lPzogc3RyaW5nLCBjb250YWlubWVudD86IElXaW5kb3dzTXhjUG9saWN5Q29udGFpbm1lbnQpOiBQcm9taXNlPElXaW5kb3dzTXhjQ29uZmlnIHwgdW5kZWZpbmVkPjtcblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGVmZmVjdGl2ZSB2YWx1ZSBvZiBhIHNhbmRib3gtcmVsYXRlZCBjb25maWd1cmF0aW9uIHNldHRpbmcsXG5cdCAqIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhlIHNldHRpbmcgaXMgbm90IGNvbmZpZ3VyZWQuXG5cdCAqL1xuXHRnZXRTYW5kYm94U2V0dGluZzxUPihzZXR0aW5nSWQ6IEFnZW50U2FuZGJveFNldHRpbmdJZCB8IEFnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZCk6IFQgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGFueSB2YWx1ZSByZXR1cm5lZCBieSB7QGxpbmsgZ2V0U2FuZGJveFNldHRpbmd9IG1heSBoYXZlXG5cdCAqIGNoYW5nZWQuIFRoZSBlbmdpbmUgaW52YWxpZGF0ZXMgaXRzIHNhbmRib3gtY29uZmlnIGZpbGUgb24gZWFjaCBldmVudC5cblx0ICogSW1wbGVtZW50YXRpb25zIHNob3VsZCBwcmUtZmlsdGVyIHRvIHNhbmRib3gtcmVsZXZhbnQga2V5cy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2FuZGJveFNldHRpbmdzOiBFdmVudDx2b2lkPjtcbn1cblxuLyoqXG4gKiBDb3JlIHNhbmRib3ggZW5naW5lLiBFbmNhcHN1bGF0ZXMgdGhlIHBsYXRmb3JtLWFnbm9zdGljIGxvZ2ljIGZvciB3cmFwcGluZ1xuICogY29tbWFuZHMgaW4gYSBzYW5kYm94IHJ1bnRpbWU6IGVuYWJsZWRuZXNzIGNoZWNrcywgY29tbWFuZC1saW5lIHdyYXBwaW5nLFxuICogc2FuZGJveC1jb25maWcgZ2VuZXJhdGlvbiwgbmV0d29yay1kb21haW4gZXh0cmFjdGlvbiBhbmQgcHJlcmVxdWlzaXRlIGNoZWNrcy5cbiAqXG4gKiBIb3N0cyAod29ya2JlbmNoIC8gYWdlbnQgaG9zdCkgY29uc3RydWN0IGFuIGVuZ2luZSB3aXRoIGEgaG9zdCBhZGFwdGVyIHRoYXRcbiAqIHN1cHBsaWVzIHdvcmtzcGFjZS9yZW1vdGUtc3BlY2lmaWMgZGF0YSwgdGhlbiBmb3J3YXJkIHRoZWlyIHB1YmxpYyBzZXJ2aWNlXG4gKiBtZXRob2RzIHRvIHRoZSBlbmdpbmUgYW5kIGFkZCB0aGVpciBvd24gaG9zdC1zcGVjaWZpYyBjb25jZXJuc1xuICogKGNoYXQgZWxpY2l0YXRpb24sIGxpZmVjeWNsZSBob29rcywgXHUyMDI2KSBvbiB0b3AuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFNhbmRib3hFbmdpbmUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3VybFJlZ2V4ID0gLyg/Omh0dHBzP3x3c3M/KTpcXC9cXC9bXlxccydcImB8Jjs8Pl0rL2dpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfc3NoUmVtb3RlUmVnZXggPSAvKD86XnxbXFxzJ1wiYF0pKD86W15cXHNAOidcImBdK0ApPyhbYS16QS1aMC05Li1dK1xcLlthLXpBLVpdezIsfSkoPzo6W15cXHMnXCJgfCY7PD5dKykoPz0kfFtcXHMnXCJgfCY7PD5dKS9naTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2hvc3RSZWdleCA9IC8oPzpefFtcXHMnXCJgKD1dKShbYS16QS1aMC05Li1dK1xcLlthLXpBLVpdezIsfSkoPzo6XFxkKyk/KD89KD86XFwvW15cXHMnXCJgfCY7PD5dKik/KD86JHxbXFxzJ1wiYClcXF18LDt8Jjw+XSkpL2dpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NhbmRib3hTZXR0aW5nc0lkOiBzdHJpbmcgPSBnZW5lcmF0ZVV1aWQoKTtcblx0cHJpdmF0ZSBfcnVudGltZVJlc29sdmVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2FwcFJvb3Q6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZXhlY1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcnVuQXNOb2RlID0gZmFsc2U7XG5cdHByaXZhdGUgX3VzZXJIb21lOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NydFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmdQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX214Y1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3k6IElXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd2luZG93c014Y0Vudmlyb25tZW50OiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2FuZGJveENvbmZpZ1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2FuZGJveERlcGVuZGVuY3lTdGF0dXM6IElTYW5kYm94RGVwZW5kZW5jeVN0YXR1cyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZW5hYmxlV2Vha2VyTmVzdGVkU2FuZGJveCA9IGZhbHNlO1xuXHRwcml2YXRlIF9hcHBhcm1vclJlbWVkaWF0aW9uUmVxdWVzdGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX25lZWRzRm9yY2VVcGRhdGVDb25maWdGaWxlID0gdHJ1ZTtcblx0cHJpdmF0ZSBfdGVtcERpcjogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb21tYW5kQWxsb3dMaXN0S2V5d29yZHM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgX2NvbW1hbmRBbGxvd0xpc3RDb21tYW5kRGV0YWlsczogcmVhZG9ubHkgSVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXSA9IFtdO1xuXHRwcml2YXRlIF9jb21tYW5kQ3dkOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1hbmRMaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1hbmRTaGVsbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb21tYW5kQWxsb3dOZXR3b3JrID0gZmFsc2U7XG5cdHByaXZhdGUgX29zOiBPcGVyYXRpbmdTeXN0ZW0gPSBPUztcblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdFdyaXRlUGF0aHM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTeXN0ZW1QYXRoRXh0VXJpID0gbmV3IEV4dFVyaSgoKSA9PiB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvc3Q6IElUZXJtaW5hbFNhbmRib3hFbmdpbmVIb3N0LFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXaW5kb3dzTXhjVGVybWluYWxTYW5kYm94UnVudGltZSBwcml2YXRlIHJlYWRvbmx5IF93aW5kb3dzTXhjUnVudGltZTogSVdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLl9ob3N0Lm9uRGlkQ2hhbmdlU2FuZGJveFNldHRpbmdzLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnNldE5lZWRzRm9yY2VVcGRhdGVDb25maWdGaWxlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2hvc3Qub25EaWRDaGFuZ2VSb290cygoKSA9PiB0aGlzLnNldE5lZWRzRm9yY2VVcGRhdGVDb25maWdGaWxlKCkpKTtcblx0fVxuXG5cdGFzeW5jIGlzRW5hYmxlZChwcmVjaGVja0lucHV0cz86IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1NhbmRib3hDb25maWd1cmVkRW5hYmxlZChwcmVjaGVja0lucHV0cyk7XG5cdH1cblxuXHRhc3luYyBpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkKHByZWNoZWNrSW5wdXRzPzogSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5faXNTYW5kYm94Q29uZmlndXJlZEVuYWJsZWQocHJlY2hlY2tJbnB1dHMpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faXNTYW5kYm94QWxsb3dOZXR3b3JrQ29uZmlndXJlZCgpO1xuXHR9XG5cblx0YXJlVW5zYW5kYm94ZWRDb21tYW5kc0FsbG93ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FyZVVuc2FuZGJveGVkQ29tbWFuZHNBbGxvd2VkKCk7XG5cdH1cblxuXHRhcmVSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0c0FsbG93ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FyZVJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzQWxsb3dlZCgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0T1MoKTogUHJvbWlzZTxPcGVyYXRpbmdTeXN0ZW0+IHtcblx0XHR0aGlzLl9vcyA9IGF3YWl0IHRoaXMuX2hvc3QuZ2V0T1MoKTtcblx0XHRyZXR1cm4gdGhpcy5fb3M7XG5cdH1cblxuXHRnZXRUZW1wRGlyKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RlbXBEaXI7XG5cdH1cblxuXHRzZXROZWVkc0ZvcmNlVXBkYXRlQ29uZmlnRmlsZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9uZWVkc0ZvcmNlVXBkYXRlQ29uZmlnRmlsZSA9IHRydWU7XG5cdH1cblxuXHRnZXRSZXNvbHZlZE5ldHdvcmtEb21haW5zKCk6IElUZXJtaW5hbFNhbmRib3hSZXNvbHZlZE5ldHdvcmtEb21haW5zIHtcblx0XHRjb25zdCBhbGxvd2VkRG9tYWlucyA9IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8c3RyaW5nW10+KEFnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5BbGxvd2VkTmV0d29ya0RvbWFpbnMpID8/IFtdO1xuXHRcdGNvbnN0IGRlbmllZERvbWFpbnMgPSB0aGlzLl9ob3N0LmdldFNhbmRib3hTZXR0aW5nPHN0cmluZ1tdPihBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuRGVuaWVkTmV0d29ya0RvbWFpbnMpID8/IFtdO1xuXHRcdHJldHVybiB7IGFsbG93ZWREb21haW5zLCBkZW5pZWREb21haW5zIH07XG5cdH1cblxuXHRhc3luYyB3cmFwQ29tbWFuZChjb21tYW5kOiBzdHJpbmcsIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj86IGJvb2xlYW4sIHNoZWxsPzogc3RyaW5nLCBjd2Q/OiBVUkksIGNvbW1hbmREZXRhaWxzPzogcmVhZG9ubHkgSVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXSwgcmVxdWVzdEFsbG93TmV0d29yaz86IGJvb2xlYW4pOiBQcm9taXNlPElUZXJtaW5hbFNhbmRib3hXcmFwUmVzdWx0PiB7XG5cdFx0Y29uc3QgYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzID0gdGhpcy5fYXJlVW5zYW5kYm94ZWRDb21tYW5kc0FsbG93ZWQoKTtcblx0XHRjb25zdCByZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cyA9IHRoaXMuX2FyZVJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzQWxsb3dlZCgpO1xuXHRcdGNvbnN0IHNob3VsZEluc3BlY3RCbG9ja2VkRG9tYWlucyA9IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiAhPT0gdHJ1ZSAmJiByZXF1ZXN0QWxsb3dOZXR3b3JrICE9PSB0cnVlICYmIChyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cyB8fCBhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMpO1xuXHRcdGNvbnN0IGJsb2NrZWREb21haW5SZXN1bHQgPSBzaG91bGRJbnNwZWN0QmxvY2tlZERvbWFpbnMgPyB0aGlzLl9nZXRCbG9ja2VkRG9tYWlucyhjb21tYW5kKSA6IHsgYmxvY2tlZERvbWFpbnM6IFtdLCBkZW5pZWREb21haW5zOiBbXSB9O1xuXHRcdGNvbnN0IHJlcXVpcmVzUHJlZmxpZ2h0QWxsb3dOZXR3b3JrID0gcmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMgJiYgYmxvY2tlZERvbWFpblJlc3VsdC5ibG9ja2VkRG9tYWlucy5sZW5ndGggPiAwO1xuXHRcdGNvbnN0IGFsbG93TmV0d29ya0ZvckNvbW1hbmQgPSByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gIT09IHRydWUgJiYgKChyZXF1ZXN0QWxsb3dOZXR3b3JrID09PSB0cnVlICYmIHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzKSB8fCByZXF1aXJlc1ByZWZsaWdodEFsbG93TmV0d29yayk7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZENvbW1hbmREZXRhaWxzID0gdGhpcy5fbm9ybWFsaXplQ29tbWFuZERldGFpbHMoY29tbWFuZERldGFpbHMgPz8gW10pO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRDb21tYW5kS2V5d29yZHMgPSB0aGlzLl9ub3JtYWxpemVDb21tYW5kS2V5d29yZHMobm9ybWFsaXplZENvbW1hbmREZXRhaWxzLm1hcChjID0+IGMua2V5d29yZCkpO1xuXHRcdGNvbnN0IGN1cnJlbnRSZWFkQWxsb3dMaXN0UGF0aHMgPSBnZXRUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0Rm9yQ29tbWFuZHModGhpcy5fb3MsIHRoaXMuX2NvbW1hbmRBbGxvd0xpc3RLZXl3b3JkcywgdGhpcy5fY29tbWFuZEFsbG93TGlzdENvbW1hbmREZXRhaWxzKTtcblx0XHRjb25zdCBuZXh0UmVhZEFsbG93TGlzdFBhdGhzID0gZ2V0VGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdEZvckNvbW1hbmRzKHRoaXMuX29zLCBub3JtYWxpemVkQ29tbWFuZEtleXdvcmRzLCBub3JtYWxpemVkQ29tbWFuZERldGFpbHMpO1xuXHRcdGNvbnN0IGN1cnJlbnRSdW50aW1lQ29uZmlndXJhdGlvbiA9IGdldFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uRm9yQ29tbWFuZHModGhpcy5fb3MsIHRoaXMuX2NvbW1hbmRBbGxvd0xpc3RDb21tYW5kRGV0YWlscyk7XG5cdFx0Y29uc3QgbmV4dFJ1bnRpbWVDb25maWd1cmF0aW9uID0gZ2V0VGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25Gb3JDb21tYW5kcyh0aGlzLl9vcywgbm9ybWFsaXplZENvbW1hbmREZXRhaWxzKTtcblx0XHRjb25zdCBzaG91bGRSZWZyZXNoQ29uZmlnID0gdGhpcy5fY29tbWFuZEFsbG93TGlzdEtleXdvcmRzLmxlbmd0aCA9PT0gMFxuXHRcdFx0fHwgdGhpcy5fbmVlZHNGb3JjZVVwZGF0ZUNvbmZpZ0ZpbGVcblx0XHRcdHx8ICF0aGlzLl9hcmVTdHJpbmdBcnJheXNFcXVhbCh0aGlzLl9jb21tYW5kQWxsb3dMaXN0S2V5d29yZHMsIG5vcm1hbGl6ZWRDb21tYW5kS2V5d29yZHMpXG5cdFx0XHR8fCAhdGhpcy5fYXJlU3RyaW5nQXJyYXlzRXF1YWwoY3VycmVudFJlYWRBbGxvd0xpc3RQYXRocywgbmV4dFJlYWRBbGxvd0xpc3RQYXRocylcblx0XHRcdHx8ICF0aGlzLl9hcmVPYmplY3RzRXF1YWwoY3VycmVudFJ1bnRpbWVDb25maWd1cmF0aW9uLCBuZXh0UnVudGltZUNvbmZpZ3VyYXRpb24pXG5cdFx0XHR8fCB0aGlzLl9jb21tYW5kQ3dkPy50b1N0cmluZygpICE9PSBjd2Q/LnRvU3RyaW5nKClcblx0XHRcdHx8IHRoaXMuX2NvbW1hbmRBbGxvd05ldHdvcmsgIT09IGFsbG93TmV0d29ya0ZvckNvbW1hbmRcblx0XHRcdHx8ICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiYgKHRoaXMuX2NvbW1hbmRMaW5lICE9PSBjb21tYW5kIHx8IHRoaXMuX2NvbW1hbmRTaGVsbCAhPT0gc2hlbGwpKTtcblx0XHRpZiAoc2hvdWxkUmVmcmVzaENvbmZpZykge1xuXHRcdFx0dGhpcy5fY29tbWFuZEFsbG93TGlzdEtleXdvcmRzID0gbm9ybWFsaXplZENvbW1hbmRLZXl3b3Jkcztcblx0XHRcdHRoaXMuX2NvbW1hbmRBbGxvd0xpc3RDb21tYW5kRGV0YWlscyA9IG5vcm1hbGl6ZWRDb21tYW5kRGV0YWlscztcblx0XHRcdHRoaXMuX2NvbW1hbmRDd2QgPSBjd2Q7XG5cdFx0XHR0aGlzLl9jb21tYW5kTGluZSA9IGNvbW1hbmQ7XG5cdFx0XHR0aGlzLl9jb21tYW5kU2hlbGwgPSBzaGVsbDtcblx0XHRcdHRoaXMuX2NvbW1hbmRBbGxvd05ldHdvcmsgPSBhbGxvd05ldHdvcmtGb3JDb21tYW5kO1xuXHRcdFx0YXdhaXQgdGhpcy5nZXRTYW5kYm94Q29uZmlnUGF0aCh0cnVlKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3NhbmRib3hDb25maWdQYXRoIHx8ICF0aGlzLl90ZW1wRGlyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1NhbmRib3ggY29uZmlnIHBhdGggb3IgdGVtcCBkaXIgbm90IGluaXRpYWxpemVkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgcGVyLWNvbW1hbmQgbmV0d29yayByZWxheGF0aW9uIGlzIGRpc2FibGVkLCBwcmVzZXJ2ZSB0aGUgZXhpc3Rpbmdcblx0XHQvLyB1bnNhbmRib3ggZmFsbGJhY2sgZm9yIGNvbW1hbmRzIHdpdGggc3RhdGljYWxseS1kZXRlY3RlZCBibG9ja2VkIGRvbWFpbnMuXG5cdFx0aWYgKCFyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gJiYgIXJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzICYmIGFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyAmJiBibG9ja2VkRG9tYWluUmVzdWx0LmJsb2NrZWREb21haW5zLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbW1hbmQ6IHRoaXMuX3dyYXBVbnNhbmRib3hlZENvbW1hbmQoY29tbWFuZCwgc2hlbGwsIGN3ZCksXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IGZhbHNlLFxuXHRcdFx0XHRibG9ja2VkRG9tYWluczogYmxvY2tlZERvbWFpblJlc3VsdC5ibG9ja2VkRG9tYWlucyxcblx0XHRcdFx0ZGVuaWVkRG9tYWluczogYmxvY2tlZERvbWFpblJlc3VsdC5kZW5pZWREb21haW5zLFxuXHRcdFx0XHRyZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbjogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gSWYgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIGlzIHRydWUsIG5lZWQgdG8gZW5zdXJlIGVudiB2YXJpYWJsZXMgc2V0IGR1cmluZyBzYW5kYm94IHN0aWxsIGFwcGx5LlxuXHRcdGlmIChyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gJiYgYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb21tYW5kOiB0aGlzLl93cmFwVW5zYW5kYm94ZWRDb21tYW5kKGNvbW1hbmQsIHNoZWxsLCBjd2QpLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiBmYWxzZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uTWV0YWRhdGEgPSByZXF1aXJlc1ByZWZsaWdodEFsbG93TmV0d29yayA/IHtcblx0XHRcdGJsb2NrZWREb21haW5zOiBibG9ja2VkRG9tYWluUmVzdWx0LmJsb2NrZWREb21haW5zLFxuXHRcdFx0ZGVuaWVkRG9tYWluczogYmxvY2tlZERvbWFpblJlc3VsdC5kZW5pZWREb21haW5zLFxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRpZiAoIXRoaXMuX214Y1BhdGgpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNWEMgZXhlY3V0YWJsZSBwYXRoIG5vdCByZXNvbHZlZCcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29tbWFuZDogdGhpcy5fd2luZG93c014Y1J1bnRpbWUud3JhcENvbW1hbmQodGhpcy5fbXhjUGF0aCwgdGhpcy5fc2FuZGJveENvbmZpZ1BhdGgpLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiB0cnVlLFxuXHRcdFx0XHRyZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbjogYWxsb3dOZXR3b3JrRm9yQ29tbWFuZCAmJiAhdGhpcy5faXNTYW5kYm94QWxsb3dOZXR3b3JrQ29uZmlndXJlZCgpID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Li4uYWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uTWV0YWRhdGEsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZXhlY1BhdGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXhlY3V0YWJsZSBwYXRoIG5vdCBzZXQgdG8gcnVuIHNhbmRib3ggY29tbWFuZHMnKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9zcnRQYXRoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1NhbmRib3ggcnVudGltZSBwYXRoIG5vdCByZXNvbHZlZCcpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3JnUGF0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSaXBncmVwIHBhdGggbm90IHJlc29sdmVkJyk7XG5cdFx0fVxuXHRcdC8vIFVzZSBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIHRvIG1ha2UgRWxlY3Ryb24gZXhlY3V0YWJsZSBiZWhhdmUgYXMgTm9kZS5qc1xuXHRcdC8vIFRNUERJUiBtdXN0IGJlIHNldCBhcyBlbnZpcm9ubWVudCB2YXJpYWJsZSBiZWZvcmUgdGhlIGNvbW1hbmRcblx0XHQvLyBRdW90ZSBzaGVsbCBhcmd1bWVudHMgc28gdGhlIHdyYXBwZWQgY29tbWFuZCBjYW5ub3QgYnJlYWsgb3V0IG9mIHRoZSBvdXRlciBzaGVsbC5cblx0XHRjb25zdCBjb21tYW5kVG9SdW5JblNhbmRib3ggPSB0aGlzLl9nZXRTYW5kYm94Q29tbWFuZFdpdGhQcmVzZXJ2ZWRDd2QoY29tbWFuZCwgY3dkKTtcblx0XHRjb25zdCBzYW5kYm94UnVudGltZUNvbW1hbmQgPSBgUEFUSD1cIiRQQVRIOiR7dGhpcy5fcGF0aERpcm5hbWUodGhpcy5fcmdQYXRoKX1cIiBUTVBESVI9XCIke3RoaXMuX3RlbXBEaXIucGF0aH1cIiBDTEFVREVfVE1QRElSPVwiJHt0aGlzLl90ZW1wRGlyLnBhdGh9XCIgXCIke3RoaXMuX2V4ZWNQYXRofVwiIFwiJHt0aGlzLl9zcnRQYXRofVwiIC0tc2V0dGluZ3MgXCIke3RoaXMuX3NhbmRib3hDb25maWdQYXRofVwiIC1jICR7dGhpcy5fcXVvdGVTaGVsbEFyZ3VtZW50KGNvbW1hbmRUb1J1bkluU2FuZGJveCl9YDtcblx0XHQvLyBPbiB3b3JrYmVuY2ggRWxlY3Ryb24gYnVpbGRzIHRoZSBleGVjIHBhdGggcG9pbnRzIGF0IHRoZSBFbGVjdHJvbiBiaW5hcnksIHNvIHdlXG5cdFx0Ly8gcHJlZml4IGBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xYCB0byBtYWtlIGl0IGJlaGF2ZSBhcyBOb2RlLmpzLiBSZW1vdGUgd29ya2JlbmNoIGFuZFxuXHRcdC8vIHRoZSBhZ2VudCBob3N0IGFscmVhZHkgcmVzb2x2ZSBhIHJlYWwgYG5vZGVgIGJpbmFyeSBhbmQgdGhlIGhvc3QgY2xlYXJzIHRoZSBmbGFnLlxuXHRcdGlmICh0aGlzLl9ydW5Bc05vZGUpIHtcblx0XHRcdGNvbnN0IG5vZGVTYW5kYm94UnVudGltZUNvbW1hbmQgPSBgRUxFQ1RST05fUlVOX0FTX05PREU9MSAke3NhbmRib3hSdW50aW1lQ29tbWFuZH1gO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29tbWFuZDogdGhpcy5fd3JhcFNhbmRib3hSdW50aW1lQ29tbWFuZEZvckxhdW5jaChub2RlU2FuZGJveFJ1bnRpbWVDb21tYW5kLCBjd2QpLFxuXHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkOiB0cnVlLFxuXHRcdFx0XHRyZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbjogYWxsb3dOZXR3b3JrRm9yQ29tbWFuZCAmJiAhdGhpcy5faXNTYW5kYm94QWxsb3dOZXR3b3JrQ29uZmlndXJlZCgpID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Li4uYWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uTWV0YWRhdGEsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tbWFuZDogdGhpcy5fd3JhcFNhbmRib3hSdW50aW1lQ29tbWFuZEZvckxhdW5jaChzYW5kYm94UnVudGltZUNvbW1hbmQsIGN3ZCksXG5cdFx0XHRpc1NhbmRib3hXcmFwcGVkOiB0cnVlLFxuXHRcdFx0cmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb246IGFsbG93TmV0d29ya0ZvckNvbW1hbmQgJiYgIXRoaXMuX2lzU2FuZGJveEFsbG93TmV0d29ya0NvbmZpZ3VyZWQoKSA/IHRydWUgOiB1bmRlZmluZWQsXG5cdFx0XHQuLi5hbGxvd05ldHdvcmtDb25maXJtYXRpb25NZXRhZGF0YSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcyhmb3JjZVJlZnJlc2g6IGJvb2xlYW4gPSBmYWxzZSwgcHJlY2hlY2tJbnB1dHM/OiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMpOiBQcm9taXNlPElUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVja1Jlc3VsdD4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuX2lzU2FuZGJveENvbmZpZ3VyZWRFbmFibGVkKHByZWNoZWNrSW5wdXRzKSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBzYW5kYm94Q29uZmlnUGF0aCA9IGF3YWl0IHRoaXMuZ2V0U2FuZGJveENvbmZpZ1BhdGgoZm9yY2VSZWZyZXNoLCBwcmVjaGVja0lucHV0cyk7XG5cdFx0aWYgKCFzYW5kYm94Q29uZmlnUGF0aCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0c2FuZGJveENvbmZpZ1BhdGgsXG5cdFx0XHRcdGZhaWxlZENoZWNrOiBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5Db25maWcsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICghKGF3YWl0IHRoaXMuX2NoZWNrU2FuZGJveERlcGVuZGVuY2llcyhmb3JjZVJlZnJlc2gpKSkge1xuXHRcdFx0Y29uc3QgbWlzc2luZ0RlcGVuZGVuY2llcyA9IGF3YWl0IHRoaXMuZ2V0TWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXMoKTtcblx0XHRcdGlmIChtaXNzaW5nRGVwZW5kZW5jaWVzLmxlbmd0aCA9PT0gMCAmJiB0aGlzLl9zYW5kYm94RGVwZW5kZW5jeVN0YXR1cz8uYnViYmxld3JhcFVzYWJsZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzLmFwcGFybW9yUmVzdHJpY3RzVW5wcml2aWxlZ2VkVXNlck5hbWVzcGFjZXMgIT09IHRydWUgfHwgKGZvcmNlUmVmcmVzaCAmJiB0aGlzLl9hcHBhcm1vclJlbWVkaWF0aW9uUmVxdWVzdGVkKSkge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fZW5hYmxlV2Vha2VyTmVzdGVkU2FuZGJveCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZW5hYmxlV2Vha2VyTmVzdGVkU2FuZGJveCA9IHRydWU7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmdldFNhbmRib3hDb25maWdQYXRoKHRydWUsIHByZWNoZWNrSW5wdXRzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aDogdGhpcy5fc2FuZGJveENvbmZpZ1BhdGgsXG5cdFx0XHRcdFx0XHRmYWlsZWRDaGVjazogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYXBwYXJtb3JSZW1lZGlhdGlvblJlcXVlc3RlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRzYW5kYm94Q29uZmlnUGF0aCxcblx0XHRcdFx0XHRmYWlsZWRDaGVjazogVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suQnViYmxld3JhcCxcblx0XHRcdFx0XHRyZW1lZGlhdGlvbnM6IHRoaXMuX2dldEJ1YmJsZXdyYXBSZW1lZGlhdGlvbnMoKSxcblx0XHRcdFx0XHRkZXRhaWw6IHRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzLmJ1YmJsZXdyYXBFcnJvcixcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNhbmRib3hDb25maWdQYXRoLFxuXHRcdFx0XHRmYWlsZWRDaGVjazogVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suRGVwZW5kZW5jaWVzLFxuXHRcdFx0XHRtaXNzaW5nRGVwZW5kZW5jaWVzLFxuXHRcdFx0XHRjYW5JbnN0YWxsTWlzc2luZ0RlcGVuZGVuY2llczogISF0aGlzLl9zYW5kYm94RGVwZW5kZW5jeVN0YXR1cz8uZGVwZW5kZW5jeUluc3RhbGxDb21tYW5kLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHNhbmRib3hDb25maWdQYXRoLFxuXHRcdFx0ZmFpbGVkQ2hlY2s6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgY2hlY2tGaWxlQWNjZXNzKHBlcm1pc3Npb246IFRlcm1pbmFsU2FuZGJveEZpbGVBY2Nlc3NQZXJtaXNzaW9uLCBwYXRoczogcmVhZG9ubHkgc3RyaW5nW10sIHByZWNoZWNrSW5wdXRzPzogSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzKTogUHJvbWlzZTxJVGVybWluYWxTYW5kYm94RmlsZUFjY2Vzc0NoZWNrUmVzdWx0PiB7XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5faXNTYW5kYm94Q29uZmlndXJlZEVuYWJsZWQocHJlY2hlY2tJbnB1dHMpKSkge1xuXHRcdFx0cmV0dXJuIHsgYWxsb3dlZDogdHJ1ZSwgZGVuaWVkOiBbXSB9O1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVSdW50aW1lSW5mbygpO1xuXHRcdGlmICghdGhpcy5fdGVtcERpcikge1xuXHRcdFx0YXdhaXQgdGhpcy5faW5pdFRlbXBEaXIoKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWdGaWxlUGF0aCA9IHRoaXMuX3RlbXBEaXIgPyB0aGlzLl9nZXRVcmlQYXRoKFVSSS5qb2luUGF0aCh0aGlzLl90ZW1wRGlyLCBgdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MtJHt0aGlzLl9zYW5kYm94U2V0dGluZ3NJZH0uanNvbmApKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhY2Nlc3NQYXRocyA9IGF3YWl0IHRoaXMuX2dldEZpbGVTeXN0ZW1BY2Nlc3NQYXRocyhjb25maWdGaWxlUGF0aCk7XG5cdFx0Y29uc3QgZGVuaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcGF0aCBvZiBwYXRocykge1xuXHRcdFx0aWYgKCFwYXRoIHx8ICFhd2FpdCB0aGlzLl9oYXNGaWxlU3lzdGVtQWNjZXNzKHBlcm1pc3Npb24sIHBhdGgsIGFjY2Vzc1BhdGhzKSkge1xuXHRcdFx0XHRkZW5pZWQucHVzaChwYXRoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBhbGxvd2VkOiBkZW5pZWQubGVuZ3RoID09PSAwLCBkZW5pZWQgfTtcblx0fVxuXG5cdGFzeW5jIGdldFNhbmRib3hDb25maWdQYXRoKGZvcmNlUmVmcmVzaDogYm9vbGVhbiA9IGZhbHNlLCBwcmVjaGVja0lucHV0cz86IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5faXNTYW5kYm94Q29uZmlndXJlZEVuYWJsZWQocHJlY2hlY2tJbnB1dHMpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVJ1bnRpbWVJbmZvKCk7XG5cdFx0aWYgKCF0aGlzLl9zYW5kYm94Q29uZmlnUGF0aCB8fCBmb3JjZVJlZnJlc2ggfHwgdGhpcy5fbmVlZHNGb3JjZVVwZGF0ZUNvbmZpZ0ZpbGUpIHtcblx0XHRcdHRoaXMuX3NhbmRib3hDb25maWdQYXRoID0gYXdhaXQgdGhpcy5fY3JlYXRlU2FuZGJveENvbmZpZygpO1xuXHRcdFx0dGhpcy5fbmVlZHNGb3JjZVVwZGF0ZUNvbmZpZ0ZpbGUgPSBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NhbmRib3hDb25maWdQYXRoO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGNvbnN0IG9zID0gYXdhaXQgdGhpcy5nZXRPUygpO1xuXHRcdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzKSB7XG5cdFx0XHR0aGlzLl9zYW5kYm94RGVwZW5kZW5jeVN0YXR1cyA9IGF3YWl0IHRoaXMuX2hvc3QuY2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWlzc2luZzogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMgJiYgIXRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzLmJ1YmJsZXdyYXBJbnN0YWxsZWQpIHtcblx0XHRcdG1pc3NpbmcucHVzaCgnYnViYmxld3JhcCcpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMgJiYgIXRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzLnNvY2F0SW5zdGFsbGVkKSB7XG5cdFx0XHRtaXNzaW5nLnB1c2goJ3NvY2F0Jyk7XG5cdFx0fVxuXHRcdHJldHVybiBtaXNzaW5nO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlbGV0ZXMgdGhlIHNhbmRib3ggdGVtcCBkaXJlY3RvcnkgaWYgb25lIHdhcyBjcmVhdGVkLiBIb3N0cyBhcmUgZXhwZWN0ZWRcblx0ICogdG8gaW52b2tlIHRoaXMgZnJvbSB0aGVpciBzaHV0ZG93biAvIGRpc3Bvc2FsIHBhdGg7IHRoZSBlbmdpbmUgaXRzZWxmIGRvZXNcblx0ICogbm90IGRlbGV0ZSB0aGUgZGlyZWN0b3J5IG9uIGBkaXNwb3NlKClgIGJlY2F1c2Ugc2h1dGRvd24gam9pbmVycyBuZWVkIHRvXG5cdCAqIGJlIGNvb3JkaW5hdGVkIGV4dGVybmFsbHkuXG5cdCAqL1xuXHRhc3luYyBjbGVhbnVwVGVtcERpcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3RlbXBEaXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbCh0aGlzLl90ZW1wRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgdXNlVHJhc2g6IGZhbHNlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1Rlcm1pbmFsU2FuZGJveEVuZ2luZTogRmFpbGVkIHRvIGRlbGV0ZSBzYW5kYm94IHRlbXAgZGlyJywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gcHJpdmF0ZSBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIF9jaGVja1NhbmRib3hEZXBlbmRlbmNpZXMoZm9yY2VSZWZyZXNoID0gZmFsc2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBvcyA9IGF3YWl0IHRoaXMuZ2V0T1MoKTtcblx0XHRpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIWZvcmNlUmVmcmVzaCAmJiB0aGlzLl9zYW5kYm94RGVwZW5kZW5jeVN0YXR1cykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzLmJ1YmJsZXdyYXBJbnN0YWxsZWQgJiYgdGhpcy5fc2FuZGJveERlcGVuZGVuY3lTdGF0dXMuYnViYmxld3JhcFVzYWJsZSAmJiB0aGlzLl9zYW5kYm94RGVwZW5kZW5jeVN0YXR1cy5zb2NhdEluc3RhbGxlZDtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0dXMgPSBhd2FpdCB0aGlzLl9ob3N0LmNoZWNrU2FuZGJveERlcGVuZGVuY2llcygpO1xuXHRcdHRoaXMuX3NhbmRib3hEZXBlbmRlbmN5U3RhdHVzID0gc3RhdHVzO1xuXG5cdFx0aWYgKHN0YXR1cyAmJiAhc3RhdHVzLmJ1YmJsZXdyYXBJbnN0YWxsZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignVGVybWluYWxTYW5kYm94RW5naW5lOiBidWJibGV3cmFwIChid3JhcCkgaXMgbm90IGluc3RhbGxlZCcpO1xuXHRcdH0gZWxzZSBpZiAoc3RhdHVzICYmICFzdGF0dXMuYnViYmxld3JhcFVzYWJsZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdUZXJtaW5hbFNhbmRib3hFbmdpbmU6IGJ1YmJsZXdyYXAgKGJ3cmFwKSBpcyBpbnN0YWxsZWQgYnV0IGZhaWxlZCBpdHMgY2FwYWJpbGl0eSBjaGVjaycsIHN0YXR1cy5idWJibGV3cmFwRXJyb3IpO1xuXHRcdH1cblx0XHRpZiAoc3RhdHVzICYmICFzdGF0dXMuc29jYXRJbnN0YWxsZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignVGVybWluYWxTYW5kYm94RW5naW5lOiBzb2NhdCBpcyBub3QgaW5zdGFsbGVkJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXR1cyA/IHN0YXR1cy5idWJibGV3cmFwSW5zdGFsbGVkICYmIHN0YXR1cy5idWJibGV3cmFwVXNhYmxlICYmIHN0YXR1cy5zb2NhdEluc3RhbGxlZCA6IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRCdWJibGV3cmFwUmVtZWRpYXRpb25zKCk6IHJlYWRvbmx5IFRlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb25bXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIFtUZXJtaW5hbFNhbmRib3hQcmVDaGVja1JlbWVkaWF0aW9uLkRpc2FibGVVbnByaXZpbGFnZWR1c2VybmFtZXNwYWNlUmVzdHJpY3Rpb25dO1xuXHR9XG5cblx0cHJpdmF0ZSBfcXVvdGVTaGVsbEFyZ3VtZW50KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJyR7dmFsdWUucmVwbGFjZSgvJy9nLCBgJ1xcXFwnJ2ApfSdgO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2FuZGJveENvbW1hbmRXaXRoUHJlc2VydmVkQ3dkKGNvbW1hbmQ6IHN0cmluZywgY3dkOiBVUkkgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLl9vcyAhPT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4IHx8ICFjd2Q/LnBhdGggfHwgY3dkLnBhdGggPT09IHRoaXMuX3RlbXBEaXI/LnBhdGgpIHtcblx0XHRcdHJldHVybiBjb21tYW5kO1xuXHRcdH1cblx0XHRyZXR1cm4gYGNkICR7dGhpcy5fcXVvdGVTaGVsbEFyZ3VtZW50KGN3ZC5wYXRoKX0gJiYgJHtjb21tYW5kfWA7XG5cdH1cblxuXHRwcml2YXRlIF93cmFwU2FuZGJveFJ1bnRpbWVDb21tYW5kRm9yTGF1bmNoKHNhbmRib3hSdW50aW1lQ29tbWFuZDogc3RyaW5nLCBjd2Q6IFVSSSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdGVtcERpclBhdGggPSB0aGlzLl90ZW1wRGlyPy5wYXRoO1xuXHRcdHJldHVybiB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4ICYmIGN3ZD8ucGF0aCAmJiB0ZW1wRGlyUGF0aCAmJiBjd2QucGF0aCAhPT0gdGVtcERpclBhdGhcblx0XHRcdD8gYGNkICR7dGhpcy5fcXVvdGVTaGVsbEFyZ3VtZW50KHRlbXBEaXJQYXRoKX07ICR7c2FuZGJveFJ1bnRpbWVDb21tYW5kfWBcblx0XHRcdDogc2FuZGJveFJ1bnRpbWVDb21tYW5kO1xuXHR9XG5cblx0cHJpdmF0ZSBfd3JhcFVuc2FuZGJveGVkQ29tbWFuZChjb21tYW5kOiBzdHJpbmcsIHNoZWxsPzogc3RyaW5nLCBjd2Q/OiBVUkkpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdHJldHVybiB0aGlzLl93aW5kb3dzTXhjUnVudGltZS53cmFwVW5zYW5kYm94ZWRDb21tYW5kKGNvbW1hbmQpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3RlbXBEaXI/LnBhdGgpIHtcblx0XHRcdHJldHVybiBjb21tYW5kO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kV2l0aFByZXNlcnZlZEN3ZCA9IHRoaXMuX2dldFNhbmRib3hDb21tYW5kV2l0aFByZXNlcnZlZEN3ZChjb21tYW5kLCBjd2QpO1xuXHRcdGlmICghc2hlbGwpIHtcblx0XHRcdHJldHVybiBgKFRNUERJUj1cIiR7dGhpcy5fdGVtcERpci5wYXRofVwiOyBleHBvcnQgVE1QRElSOyAke2NvbW1hbmRXaXRoUHJlc2VydmVkQ3dkfSlgO1xuXHRcdH1cblx0XHRyZXR1cm4gYGVudiBUTVBESVI9XCIke3RoaXMuX3RlbXBEaXIucGF0aH1cIiAke3RoaXMuX3F1b3RlU2hlbGxBcmd1bWVudChzaGVsbCl9IC1jICR7dGhpcy5fcXVvdGVTaGVsbEFyZ3VtZW50KGNvbW1hbmRXaXRoUHJlc2VydmVkQ3dkKX1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QmxvY2tlZERvbWFpbnMoY29tbWFuZDogc3RyaW5nKTogeyBibG9ja2VkRG9tYWluczogc3RyaW5nW107IGRlbmllZERvbWFpbnM6IHN0cmluZ1tdIH0ge1xuXHRcdGlmICh0aGlzLl9pc1NhbmRib3hBbGxvd05ldHdvcmtDb25maWd1cmVkKCkpIHtcblx0XHRcdHJldHVybiB7IGJsb2NrZWREb21haW5zOiBbXSwgZGVuaWVkRG9tYWluczogW10gfTtcblx0XHR9XG5cblx0XHRjb25zdCBkb21haW5zID0gdGhpcy5fZXh0cmFjdERvbWFpbnMoY29tbWFuZCk7XG5cdFx0aWYgKGRvbWFpbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyBibG9ja2VkRG9tYWluczogW10sIGRlbmllZERvbWFpbnM6IFtdIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBhbGxvd2VkRG9tYWlucywgZGVuaWVkRG9tYWlucyB9ID0gdGhpcy5nZXRSZXNvbHZlZE5ldHdvcmtEb21haW5zKCk7XG5cdFx0Y29uc3QgYmxvY2tlZERvbWFpbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBleHBsaWNpdGx5RGVuaWVkRG9tYWlucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZG9tYWluIG9mIGRvbWFpbnMpIHtcblx0XHRcdGlmIChkZW5pZWREb21haW5zLnNvbWUocGF0dGVybiA9PiBtYXRjaGVzRG9tYWluUGF0dGVybihkb21haW4sIHBhdHRlcm4pKSkge1xuXHRcdFx0XHRibG9ja2VkRG9tYWlucy5hZGQoZG9tYWluKTtcblx0XHRcdFx0ZXhwbGljaXRseURlbmllZERvbWFpbnMuYWRkKGRvbWFpbik7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFhbGxvd2VkRG9tYWlucy5zb21lKHBhdHRlcm4gPT4gbWF0Y2hlc0RvbWFpblBhdHRlcm4oZG9tYWluLCBwYXR0ZXJuKSkpIHtcblx0XHRcdFx0YmxvY2tlZERvbWFpbnMuYWRkKGRvbWFpbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRibG9ja2VkRG9tYWluczogWy4uLmJsb2NrZWREb21haW5zXSxcblx0XHRcdGRlbmllZERvbWFpbnM6IFsuLi5leHBsaWNpdGx5RGVuaWVkRG9tYWluc10sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3REb21haW5zKGNvbW1hbmQ6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBkb21haW5zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0bGV0IG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xuXG5cdFx0VGVybWluYWxTYW5kYm94RW5naW5lLl91cmxSZWdleC5sYXN0SW5kZXggPSAwO1xuXHRcdHdoaWxlICgobWF0Y2ggPSBUZXJtaW5hbFNhbmRib3hFbmdpbmUuX3VybFJlZ2V4LmV4ZWMoY29tbWFuZCkpICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCBkb21haW4gPSB0aGlzLl9leHRyYWN0RG9tYWluRnJvbVVybChtYXRjaFswXSk7XG5cdFx0XHRpZiAoZG9tYWluKSB7XG5cdFx0XHRcdGRvbWFpbnMuYWRkKGRvbWFpbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0VGVybWluYWxTYW5kYm94RW5naW5lLl9zc2hSZW1vdGVSZWdleC5sYXN0SW5kZXggPSAwO1xuXHRcdHdoaWxlICgobWF0Y2ggPSBUZXJtaW5hbFNhbmRib3hFbmdpbmUuX3NzaFJlbW90ZVJlZ2V4LmV4ZWMoY29tbWFuZCkpICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCBkb21haW4gPSBub3JtYWxpemVEb21haW4obWF0Y2hbMV0sIHRydWUpO1xuXHRcdFx0aWYgKGRvbWFpbikge1xuXHRcdFx0XHRkb21haW5zLmFkZChkb21haW4pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdFRlcm1pbmFsU2FuZGJveEVuZ2luZS5faG9zdFJlZ2V4Lmxhc3RJbmRleCA9IDA7XG5cdFx0d2hpbGUgKChtYXRjaCA9IFRlcm1pbmFsU2FuZGJveEVuZ2luZS5faG9zdFJlZ2V4LmV4ZWMoY29tbWFuZCkpICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCBkb21haW4gPSBub3JtYWxpemVEb21haW4obWF0Y2hbMV0pO1xuXHRcdFx0aWYgKGRvbWFpbikge1xuXHRcdFx0XHRkb21haW5zLmFkZChkb21haW4pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBbLi4uZG9tYWluc107XG5cdH1cblxuXHRwcml2YXRlIF9leHRyYWN0RG9tYWluRnJvbVVybCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXV0aG9yaXR5ID0gVVJJLnBhcnNlKHZhbHVlKS5hdXRob3JpdHk7XG5cdFx0XHRyZXR1cm4gbm9ybWFsaXplRG9tYWluKGF1dGhvcml0eSwgdHJ1ZSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX25vcm1hbGl6ZUNvbW1hbmRLZXl3b3Jkcyhjb21tYW5kS2V5d29yZHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbLi4ubmV3IFNldChjb21tYW5kS2V5d29yZHMubWFwKGtleXdvcmQgPT4ga2V5d29yZC50b0xvd2VyQ2FzZSgpKSldLnNvcnQoKTtcblx0fVxuXG5cdHByaXZhdGUgX25vcm1hbGl6ZUNvbW1hbmREZXRhaWxzKGNvbW1hbmREZXRhaWxzOiByZWFkb25seSBJVGVybWluYWxTYW5kYm94Q29tbWFuZFtdKTogSVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXSB7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHJlc3VsdDogSVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kRGV0YWlscykge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZENvbW1hbmQgPSB7IGtleXdvcmQ6IGNvbW1hbmQua2V5d29yZC50b0xvd2VyQ2FzZSgpLCBhcmdzOiBbLi4uY29tbWFuZC5hcmdzXSB9O1xuXHRcdFx0Y29uc3Qga2V5ID0gSlNPTi5zdHJpbmdpZnkobm9ybWFsaXplZENvbW1hbmQpO1xuXHRcdFx0aWYgKCFzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHNlZW4uYWRkKGtleSk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG5vcm1hbGl6ZWRDb21tYW5kKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdC5zb3J0KChhLCBiKSA9PiBhLmtleXdvcmQubG9jYWxlQ29tcGFyZShiLmtleXdvcmQpIHx8IGEuYXJncy5qb2luKCdcXDAnKS5sb2NhbGVDb21wYXJlKGIuYXJncy5qb2luKCdcXDAnKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXJlU3RyaW5nQXJyYXlzRXF1YWwoYTogcmVhZG9ubHkgc3RyaW5nW10sIGI6IHJlYWRvbmx5IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGEubGVuZ3RoID09PSBiLmxlbmd0aCAmJiBhLmV2ZXJ5KChrZXl3b3JkLCBpbmRleCkgPT4ga2V5d29yZCA9PT0gYltpbmRleF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXJlT2JqZWN0c0VxdWFsKGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBiOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShhKSA9PT0gSlNPTi5zdHJpbmdpZnkoYik7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NhbmRib3hBbGxvd2VkQnlQcmVjaGVja0lucHV0cyhwcmVjaGVja0lucHV0czogSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHByZWNoZWNrSW5wdXRzPy5pc0RlZmF1bHRBcHByb3ZhbFBlcm1pc3Npb25FbmFibGVkICE9PSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2lzU2FuZGJveENvbmZpZ3VyZWRFbmFibGVkKHByZWNoZWNrSW5wdXRzPzogSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF0aGlzLl9pc1NhbmRib3hBbGxvd2VkQnlQcmVjaGVja0lucHV0cyhwcmVjaGVja0lucHV0cykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5nZXRPUygpO1xuXHRcdGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fZ2V0U2FuZGJveENvbmZpZ3VyZWRXaW5kb3dzRW5hYmxlZFZhbHVlKCk7XG5cdFx0XHRyZXR1cm4gaXNBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUodmFsdWUpO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX2dldFNhbmRib3hDb25maWd1cmVkRW5hYmxlZFZhbHVlKCk7XG5cdFx0cmV0dXJuIGlzQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVSdW50aW1lSW5mbygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fcnVudGltZVJlc29sdmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3J1bnRpbWVSZXNvbHZlZCA9IHRydWU7XG5cdFx0Y29uc3QgcnVudGltZUluZm8gPSBhd2FpdCB0aGlzLl9ob3N0LmdldFJ1bnRpbWVJbmZvKCk7XG5cdFx0dGhpcy5fYXBwUm9vdCA9IHJ1bnRpbWVJbmZvLmFwcFJvb3Q7XG5cdFx0dGhpcy5fZXhlY1BhdGggPSBydW50aW1lSW5mby5leGVjUGF0aDtcblx0XHR0aGlzLl9ydW5Bc05vZGUgPSBydW50aW1lSW5mby5ydW5Bc05vZGUgPz8gZmFsc2U7XG5cdFx0dGhpcy5fdXNlckhvbWUgPSBhd2FpdCB0aGlzLl9ob3N0LmdldFVzZXJIb21lKCk7XG5cdFx0dGhpcy5fc3J0UGF0aCA9IHRoaXMuX3BhdGhKb2luKHRoaXMuX2FwcFJvb3QsICdub2RlX21vZHVsZXMnLCAnQHZzY29kZScsICdzYW5kYm94LXJ1bnRpbWUnLCAnZGlzdCcsICdjbGkuanMnKTtcblx0XHRjb25zdCBuYXRpdmVNb2R1bGVzRGlyID0gcnVudGltZUluZm8ubmF0aXZlTW9kdWxlc0RpciA/PyAnbm9kZV9tb2R1bGVzJztcblx0XHRjb25zdCByZ1BsYXRmb3JtID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gJ3dpbjMyJyA6IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoID8gJ2RhcndpbicgOiAnbGludXgnO1xuXHRcdGNvbnN0IHJnQmluYXJ5ID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gJ3JnLmV4ZScgOiAncmcnO1xuXHRcdHRoaXMuX3JnUGF0aCA9IHRoaXMuX3BhdGhKb2luKHRoaXMuX2FwcFJvb3QsIG5hdGl2ZU1vZHVsZXNEaXIsICdAdnNjb2RlJywgJ3JpcGdyZXAtdW5pdmVyc2FsJywgJ2JpbicsIGAke3JnUGxhdGZvcm19LSR7YXJjaH1gLCByZ0JpbmFyeSk7XG5cdFx0dGhpcy5fbXhjUGF0aCA9IHRoaXMuX3dpbmRvd3NNeGNSdW50aW1lLmdldEV4ZWN1dGFibGVQYXRoKHRoaXMuX2FwcFJvb3QsIG5hdGl2ZU1vZHVsZXNEaXIsIHJ1bnRpbWVJbmZvLmFyY2gpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlU2FuZGJveENvbmZpZygpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICgoYXdhaXQgdGhpcy5pc0VuYWJsZWQoKSkgJiYgIXRoaXMuX3RlbXBEaXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2luaXRUZW1wRGlyKCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fdGVtcERpcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxvd05ldHdvcmsgPSB0aGlzLl9jb21tYW5kQWxsb3dOZXR3b3JrIHx8IGF3YWl0IHRoaXMuaXNTYW5kYm94QWxsb3dOZXR3b3JrRW5hYmxlZCgpO1xuXHRcdGNvbnN0IGxpbnV4RmlsZVN5c3RlbVNldHRpbmcgPSB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4XG5cdFx0XHQ/IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8SVRlcm1pbmFsU2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94TGludXhGaWxlU3lzdGVtKSA/PyB7fVxuXHRcdFx0OiB7fTtcblx0XHRjb25zdCBtYWNGaWxlU3lzdGVtU2V0dGluZyA9IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoXG5cdFx0XHQ/IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8SVRlcm1pbmFsU2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94TWFjRmlsZVN5c3RlbSkgPz8ge31cblx0XHRcdDoge307XG5cdFx0Y29uc3Qgd2luZG93c0ZpbGVTeXN0ZW1TZXR0aW5nID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzXG5cdFx0XHQ/IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8SVRlcm1pbmFsU2FuZGJveEZpbGVTeXN0ZW1TZXR0aW5nPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0ZpbGVTeXN0ZW0pID8/IHt9XG5cdFx0XHQ6IHt9O1xuXHRcdGNvbnN0IHdpbmRvd3NTY2hlbWFWZXJzaW9uID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzXG5cdFx0XHQ/IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8c3RyaW5nPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c1NjaGVtYVZlcnNpb24pXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBydW50aW1lU2V0dGluZyA9IHtcblx0XHRcdC4uLnRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBZHZhbmNlZFJ1bnRpbWUpLFxuXHRcdFx0Li4uKHRoaXMuX2VuYWJsZVdlYWtlck5lc3RlZFNhbmRib3ggPyB7IGVuYWJsZVdlYWtlck5lc3RlZFNhbmRib3g6IHRydWUgfSA6IHVuZGVmaW5lZCksXG5cdFx0fTtcblx0XHRjb25zdCBjb21tYW5kUnVudGltZVNldHRpbmcgPSBnZXRUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbkZvckNvbW1hbmRzKHRoaXMuX29zLCB0aGlzLl9jb21tYW5kQWxsb3dMaXN0Q29tbWFuZERldGFpbHMpO1xuXHRcdGNvbnN0IGNvbW1hbmRSdW50aW1lQWxsb3dSZWFkUGF0aHMgPSB0aGlzLl9nZXRDb21tYW5kUnVudGltZUZpbGVTeXN0ZW1QYXRocyhjb21tYW5kUnVudGltZVNldHRpbmcsICdhbGxvd1JlYWQnKTtcblx0XHRjb25zdCBjb21tYW5kUnVudGltZUFsbG93V3JpdGVQYXRocyA9IHRoaXMuX2dldENvbW1hbmRSdW50aW1lRmlsZVN5c3RlbVBhdGhzKGNvbW1hbmRSdW50aW1lU2V0dGluZywgJ2FsbG93V3JpdGUnKTtcblx0XHRjb25zdCBjb25maWdGaWxlVXJpID0gVVJJLmpvaW5QYXRoKHRoaXMuX3RlbXBEaXIsIGB2c2NvZGUtc2FuZGJveC1zZXR0aW5ncy0ke3RoaXMuX3NhbmRib3hTZXR0aW5nc0lkfS5qc29uYCk7XG5cdFx0Y29uc3QgY29uZmlnRmlsZVBhdGggPSB0aGlzLl9nZXRVcmlQYXRoKGNvbmZpZ0ZpbGVVcmkpO1xuXHRcdGxldCBhbGxvd1dyaXRlUGF0aHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGFsbG93UmVhZFBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBkZW55UmVhZFBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBkZW55V3JpdGVQYXRoczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0Y29uc3QgZmlsZXN5c3RlbVBvbGljeSA9IGF3YWl0IHRoaXMuX2dldFdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5KCk7XG5cdFx0XHRjb25zdCBlbnYgPSBhd2FpdCB0aGlzLl9nZXRXaW5kb3dzTXhjRW52aXJvbm1lbnQoKTtcblx0XHRcdGFsbG93V3JpdGVQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMoW1xuXHRcdFx0XHQuLi5hd2FpdCB0aGlzLl91cGRhdGVBbGxvd1dyaXRlUGF0aHNXaXRoV29ya3NwYWNlRm9sZGVycyh3aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcuYWxsb3dXcml0ZSksXG5cdFx0XHRcdC4uLmZpbGVzeXN0ZW1Qb2xpY3kucmVhZHdyaXRlUGF0aHNcblx0XHRcdF0pO1xuXHRcdFx0YWxsb3dSZWFkUGF0aHMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKFsuLi4od2luZG93c0ZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93UmVhZCA/PyBbXSksIC4uLmZpbGVzeXN0ZW1Qb2xpY3kucmVhZG9ubHlQYXRoc10pO1xuXHRcdFx0ZGVueVJlYWRQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMod2luZG93c0ZpbGVTeXN0ZW1TZXR0aW5nLmRlbnlSZWFkID8/IFtdKTtcblx0XHRcdHRoaXMuX3dpbmRvd3NNeGNFbnZpcm9ubWVudCA9IGVudjtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSB7XG5cdFx0XHRhbGxvd1dyaXRlUGF0aHMgPSAoYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhhd2FpdCB0aGlzLl91cGRhdGVBbGxvd1dyaXRlUGF0aHNXaXRoV29ya3NwYWNlRm9sZGVycyhtYWNGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1dyaXRlLCBjb21tYW5kUnVudGltZUFsbG93V3JpdGVQYXRocykpKS5maWx0ZXIocGF0aCA9PiBwYXRoICE9PSBjb25maWdGaWxlUGF0aCk7XG5cdFx0XHRhbGxvd1JlYWRQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMoYXdhaXQgdGhpcy5fdXBkYXRlQWxsb3dSZWFkUGF0aHNXaXRoQWxsb3dXcml0ZShtYWNGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1JlYWQsIGFsbG93V3JpdGVQYXRocywgY29tbWFuZFJ1bnRpbWVBbGxvd1JlYWRQYXRocykpO1xuXHRcdFx0ZGVueVJlYWRQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHModGhpcy5fdXBkYXRlRGVueVJlYWRQYXRoc1dpdGhIb21lKFsuLi4obWFjRmlsZVN5c3RlbVNldHRpbmcuZGVueVJlYWQgPz8gW10pLCBjb25maWdGaWxlUGF0aF0pKTtcblx0XHRcdGRlbnlXcml0ZVBhdGhzID0gbWFjRmlsZVN5c3RlbVNldHRpbmcuZGVueVdyaXRlID8gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhtYWNGaWxlU3lzdGVtU2V0dGluZy5kZW55V3JpdGUpIDogdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCkge1xuXHRcdFx0YWxsb3dXcml0ZVBhdGhzID0gKGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMoYXdhaXQgdGhpcy5fdXBkYXRlQWxsb3dXcml0ZVBhdGhzV2l0aFdvcmtzcGFjZUZvbGRlcnMobGludXhGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1dyaXRlLCBjb21tYW5kUnVudGltZUFsbG93V3JpdGVQYXRocykpKS5maWx0ZXIocGF0aCA9PiBwYXRoICE9PSBjb25maWdGaWxlUGF0aCk7XG5cdFx0XHRhbGxvd1JlYWRQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMoYXdhaXQgdGhpcy5fdXBkYXRlQWxsb3dSZWFkUGF0aHNXaXRoQWxsb3dXcml0ZShsaW51eEZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93UmVhZCwgYWxsb3dXcml0ZVBhdGhzLCBjb21tYW5kUnVudGltZUFsbG93UmVhZFBhdGhzKSk7XG5cdFx0XHRkZW55UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyh0aGlzLl91cGRhdGVEZW55UmVhZFBhdGhzV2l0aEhvbWUoWy4uLihsaW51eEZpbGVTeXN0ZW1TZXR0aW5nLmRlbnlSZWFkID8/IFtdKSwgY29uZmlnRmlsZVBhdGhdKSk7XG5cdFx0XHRkZW55V3JpdGVQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMobGludXhGaWxlU3lzdGVtU2V0dGluZy5kZW55V3JpdGUpO1xuXHRcdH1cblx0XHRjb25zdCBzYW5kYm94U2V0dGluZ3MgPSB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyBhd2FpdCB0aGlzLl93aW5kb3dzTXhjUnVudGltZS5jcmVhdGVDb25maWcoe1xuXHRcdFx0Y29tbWFuZDogdGhpcy5fY29tbWFuZExpbmUgPz8gJycsXG5cdFx0XHRzaGVsbDogdGhpcy5fY29tbWFuZFNoZWxsLFxuXHRcdFx0Y3dkOiB0aGlzLl9jb21tYW5kQ3dkID8/IHRoaXMuX2dldERlZmF1bHRXaW5kb3dzTXhjQ3dkKCksXG5cdFx0XHR0ZW1wRGlyOiB0aGlzLl90ZW1wRGlyLFxuXHRcdFx0c2NoZW1hVmVyc2lvbjogd2luZG93c1NjaGVtYVZlcnNpb24sXG5cdFx0XHRhbGxvd05ldHdvcmssXG5cdFx0XHRhbGxvd1JlYWRQYXRocyxcblx0XHRcdGFsbG93V3JpdGVQYXRocyxcblx0XHRcdGRlbnlSZWFkUGF0aHMsXG5cdFx0XHRlbnY6IHRoaXMuX3dpbmRvd3NNeGNFbnZpcm9ubWVudCA/PyBbXSxcblx0XHR9LCB0aGlzLl9idWlsZFNhbmRib3hQYXlsb2FkKSA6IHtcblx0XHRcdG5ldHdvcms6IGFsbG93TmV0d29yayA/IHsgYWxsb3dlZERvbWFpbnM6IFtdLCBkZW5pZWREb21haW5zOiBbXSwgZW5hYmxlZDogZmFsc2UgfSA6IHRoaXMuZ2V0UmVzb2x2ZWROZXR3b3JrRG9tYWlucygpLFxuXHRcdFx0ZmlsZXN5c3RlbToge1xuXHRcdFx0XHRkZW55UmVhZDogZGVueVJlYWRQYXRocyxcblx0XHRcdFx0YWxsb3dSZWFkOiBhbGxvd1JlYWRQYXRocyxcblx0XHRcdFx0YWxsb3dXcml0ZTogYWxsb3dXcml0ZVBhdGhzLFxuXHRcdFx0XHRkZW55V3JpdGU6IGRlbnlXcml0ZVBhdGhzLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGlmICh0aGlzLl9vcyAhPT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHNhbmRib3hSdW50aW1lU2V0dGluZ3MgPSBzYW5kYm94U2V0dGluZ3MgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHR0aGlzLl9tZXJnZUFkZGl0aW9uYWxTYW5kYm94Q29uZmlnUHJvcGVydGllcyhzYW5kYm94UnVudGltZVNldHRpbmdzLCBydW50aW1lU2V0dGluZyk7XG5cdFx0XHR0aGlzLl9tZXJnZUFkZGl0aW9uYWxTYW5kYm94Q29uZmlnUHJvcGVydGllcyhzYW5kYm94UnVudGltZVNldHRpbmdzLCBjb21tYW5kUnVudGltZVNldHRpbmcpO1xuXHRcdFx0aWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSB7XG5cdFx0XHRcdHNhbmRib3hSdW50aW1lU2V0dGluZ3MuYWxsb3dQdHkgPz89IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3NhbmRib3hDb25maWdQYXRoID0gY29uZmlnRmlsZVBhdGg7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShjb25maWdGaWxlVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHNhbmRib3hTZXR0aW5ncywgbnVsbCwgJ1xcdCcpKSwgeyBvdmVyd3JpdGU6IHRydWUgfSk7XG5cdFx0cmV0dXJuIHRoaXMuX3NhbmRib3hDb25maWdQYXRoO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0RmlsZVN5c3RlbUFjY2Vzc1BhdGhzKGNvbmZpZ0ZpbGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPElUZXJtaW5hbFNhbmRib3hGaWxlU3lzdGVtQWNjZXNzUGF0aHM+IHtcblx0XHRjb25zdCBsaW51eEZpbGVTeXN0ZW1TZXR0aW5nID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eFxuXHRcdFx0PyB0aGlzLl9ob3N0LmdldFNhbmRib3hTZXR0aW5nPElUZXJtaW5hbFNhbmRib3hGaWxlU3lzdGVtU2V0dGluZz4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveExpbnV4RmlsZVN5c3RlbSkgPz8ge31cblx0XHRcdDoge307XG5cdFx0Y29uc3QgbWFjRmlsZVN5c3RlbVNldHRpbmcgPSB0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaFxuXHRcdFx0PyB0aGlzLl9ob3N0LmdldFNhbmRib3hTZXR0aW5nPElUZXJtaW5hbFNhbmRib3hGaWxlU3lzdGVtU2V0dGluZz4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveE1hY0ZpbGVTeXN0ZW0pID8/IHt9XG5cdFx0XHQ6IHt9O1xuXHRcdGNvbnN0IHdpbmRvd3NGaWxlU3lzdGVtU2V0dGluZyA9IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93c1xuXHRcdFx0PyB0aGlzLl9ob3N0LmdldFNhbmRib3hTZXR0aW5nPElUZXJtaW5hbFNhbmRib3hGaWxlU3lzdGVtU2V0dGluZz4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NGaWxlU3lzdGVtKSA/PyB7fVxuXHRcdFx0OiB7fTtcblx0XHRjb25zdCBjb21tYW5kUnVudGltZVNldHRpbmcgPSBnZXRUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbkZvckNvbW1hbmRzKHRoaXMuX29zLCB0aGlzLl9jb21tYW5kQWxsb3dMaXN0Q29tbWFuZERldGFpbHMpO1xuXHRcdGNvbnN0IGNvbW1hbmRSdW50aW1lQWxsb3dSZWFkUGF0aHMgPSB0aGlzLl9nZXRDb21tYW5kUnVudGltZUZpbGVTeXN0ZW1QYXRocyhjb21tYW5kUnVudGltZVNldHRpbmcsICdhbGxvd1JlYWQnKTtcblx0XHRjb25zdCBjb21tYW5kUnVudGltZUFsbG93V3JpdGVQYXRocyA9IHRoaXMuX2dldENvbW1hbmRSdW50aW1lRmlsZVN5c3RlbVBhdGhzKGNvbW1hbmRSdW50aW1lU2V0dGluZywgJ2FsbG93V3JpdGUnKTtcblx0XHRsZXQgYWxsb3dXcml0ZVBhdGhzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBhbGxvd1JlYWRQYXRoczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgZGVueVJlYWRQYXRoczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgZGVueVdyaXRlUGF0aHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdGNvbnN0IGZpbGVzeXN0ZW1Qb2xpY3kgPSBhd2FpdCB0aGlzLl9nZXRXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeSgpO1xuXHRcdFx0YWxsb3dXcml0ZVBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhbXG5cdFx0XHRcdC4uLmF3YWl0IHRoaXMuX3VwZGF0ZUFsbG93V3JpdGVQYXRoc1dpdGhXb3Jrc3BhY2VGb2xkZXJzKHdpbmRvd3NGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1dyaXRlKSxcblx0XHRcdFx0Li4uZmlsZXN5c3RlbVBvbGljeS5yZWFkd3JpdGVQYXRoc1xuXHRcdFx0XSk7XG5cdFx0XHRhbGxvd1JlYWRQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMoWy4uLih3aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcuYWxsb3dSZWFkID8/IFtdKSwgLi4uZmlsZXN5c3RlbVBvbGljeS5yZWFkb25seVBhdGhzXSk7XG5cdFx0XHRkZW55UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyh3aW5kb3dzRmlsZVN5c3RlbVNldHRpbmcuZGVueVJlYWQgPz8gW10pO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpIHtcblx0XHRcdGFsbG93V3JpdGVQYXRocyA9IChhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKGF3YWl0IHRoaXMuX3VwZGF0ZUFsbG93V3JpdGVQYXRoc1dpdGhXb3Jrc3BhY2VGb2xkZXJzKG1hY0ZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93V3JpdGUsIGNvbW1hbmRSdW50aW1lQWxsb3dXcml0ZVBhdGhzKSkpLmZpbHRlcihwYXRoID0+IHBhdGggIT09IGNvbmZpZ0ZpbGVQYXRoKTtcblx0XHRcdGFsbG93UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhhd2FpdCB0aGlzLl91cGRhdGVBbGxvd1JlYWRQYXRoc1dpdGhBbGxvd1dyaXRlKG1hY0ZpbGVTeXN0ZW1TZXR0aW5nLmFsbG93UmVhZCwgYWxsb3dXcml0ZVBhdGhzLCBjb21tYW5kUnVudGltZUFsbG93UmVhZFBhdGhzKSk7XG5cdFx0XHRkZW55UmVhZFBhdGhzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyh0aGlzLl91cGRhdGVEZW55UmVhZFBhdGhzV2l0aEhvbWUoWy4uLihtYWNGaWxlU3lzdGVtU2V0dGluZy5kZW55UmVhZCA/PyBbXSksIC4uLihjb25maWdGaWxlUGF0aCA/IFtjb25maWdGaWxlUGF0aF0gOiBbXSldKSk7XG5cdFx0XHRkZW55V3JpdGVQYXRocyA9IG1hY0ZpbGVTeXN0ZW1TZXR0aW5nLmRlbnlXcml0ZSA/IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMobWFjRmlsZVN5c3RlbVNldHRpbmcuZGVueVdyaXRlKSA6IHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uTGludXgpIHtcblx0XHRcdGFsbG93V3JpdGVQYXRocyA9IChhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKGF3YWl0IHRoaXMuX3VwZGF0ZUFsbG93V3JpdGVQYXRoc1dpdGhXb3Jrc3BhY2VGb2xkZXJzKGxpbnV4RmlsZVN5c3RlbVNldHRpbmcuYWxsb3dXcml0ZSwgY29tbWFuZFJ1bnRpbWVBbGxvd1dyaXRlUGF0aHMpKSkuZmlsdGVyKHBhdGggPT4gcGF0aCAhPT0gY29uZmlnRmlsZVBhdGgpO1xuXHRcdFx0YWxsb3dSZWFkUGF0aHMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlRmlsZVN5c3RlbVBhdGhzKGF3YWl0IHRoaXMuX3VwZGF0ZUFsbG93UmVhZFBhdGhzV2l0aEFsbG93V3JpdGUobGludXhGaWxlU3lzdGVtU2V0dGluZy5hbGxvd1JlYWQsIGFsbG93V3JpdGVQYXRocywgY29tbWFuZFJ1bnRpbWVBbGxvd1JlYWRQYXRocykpO1xuXHRcdFx0ZGVueVJlYWRQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHModGhpcy5fdXBkYXRlRGVueVJlYWRQYXRoc1dpdGhIb21lKFsuLi4obGludXhGaWxlU3lzdGVtU2V0dGluZy5kZW55UmVhZCA/PyBbXSksIC4uLihjb25maWdGaWxlUGF0aCA/IFtjb25maWdGaWxlUGF0aF0gOiBbXSldKSk7XG5cdFx0XHRkZW55V3JpdGVQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aHMobGludXhGaWxlU3lzdGVtU2V0dGluZy5kZW55V3JpdGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGFsbG93UmVhZFBhdGhzLCBhbGxvd1dyaXRlUGF0aHMsIGRlbnlSZWFkUGF0aHMsIGRlbnlXcml0ZVBhdGhzIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYXNGaWxlU3lzdGVtQWNjZXNzKHBlcm1pc3Npb246IFRlcm1pbmFsU2FuZGJveEZpbGVBY2Nlc3NQZXJtaXNzaW9uLCBwYXRoOiBzdHJpbmcsIGFjY2Vzc1BhdGhzOiBJVGVybWluYWxTYW5kYm94RmlsZVN5c3RlbUFjY2Vzc1BhdGhzKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRQYXRocyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVGaWxlU3lzdGVtUGF0aChwYXRoKTtcblx0XHRpZiAocGVybWlzc2lvbiA9PT0gJ3dyaXRlJykge1xuXHRcdFx0aWYgKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyAmJiB0aGlzLl9tYXRjaGVzQW55RmlsZVN5c3RlbVBhdGgocmVzb2x2ZWRQYXRocywgYWNjZXNzUGF0aHMuZGVueVJlYWRQYXRocykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX21hdGNoZXNBbnlGaWxlU3lzdGVtUGF0aChyZXNvbHZlZFBhdGhzLCBhY2Nlc3NQYXRocy5kZW55V3JpdGVQYXRocyA/PyBbXSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX21hdGNoZXNBbnlGaWxlU3lzdGVtUGF0aChyZXNvbHZlZFBhdGhzLCBhY2Nlc3NQYXRocy5hbGxvd1dyaXRlUGF0aHMpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9tYXRjaGVzQW55RmlsZVN5c3RlbVBhdGgocmVzb2x2ZWRQYXRocywgWy4uLmFjY2Vzc1BhdGhzLmFsbG93UmVhZFBhdGhzLCAuLi5hY2Nlc3NQYXRocy5hbGxvd1dyaXRlUGF0aHNdKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiAhdGhpcy5fbWF0Y2hlc0FueUZpbGVTeXN0ZW1QYXRoKHJlc29sdmVkUGF0aHMsIGFjY2Vzc1BhdGhzLmRlbnlSZWFkUGF0aHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hlc0FueUZpbGVTeXN0ZW1QYXRoKHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSwgbWF0Y2hlcnM6IHJlYWRvbmx5IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHBhdGhzLnNvbWUocGF0aCA9PiBtYXRjaGVycy5zb21lKG1hdGNoZXIgPT4gdGhpcy5fbWF0Y2hlc0ZpbGVTeXN0ZW1QYXRoKHBhdGgsIG1hdGNoZXIpKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIGEgY2FuZGlkYXRlIGZpbGVzeXN0ZW0gcGF0aCBpcyBjb3ZlcmVkIGJ5IGEgc2FuZGJveCBhbGxvdy9kZW55XG5cdCAqIG1hdGNoZXIuIEJvdGggdmFsdWVzIGFyZSBub3JtYWxpemVkIHdpdGggdGhlIHRhcmdldCBzYW5kYm94IE9TIHNlbWFudGljcyBiZWZvcmVcblx0ICogY29tcGFyaXNvbi4gTm9uLWdsb2IgbWF0Y2hlcnMgYXJlIHRyZWF0ZWQgYXMgZXhhY3Qtb3ItcGFyZW50IG1hdGNoZXM7IGdsb2Jcblx0ICogbWF0Y2hlcnMgYXJlIGV2YWx1YXRlZCB3aXRoIFZTIENvZGUncyBnbG9iIG1hdGNoZXIuXG5cdCAqXG5cdCAqIEV4YW1wbGVzOlxuXHQgKiAtIExpbnV4L21hY09TOiBgL3dvcmtzcGFjZS9wcm9qZWN0L3NyYy9maWxlLnRzYCBtYXRjaGVzIGAvd29ya3NwYWNlL3Byb2plY3RgLlxuXHQgKiAtIExpbnV4L21hY09TOiBgL3dvcmtzcGFjZS9wcm9qZWN0Mi9maWxlLnRzYCBkb2VzIG5vdCBtYXRjaCBgL3dvcmtzcGFjZS9wcm9qZWN0YC5cblx0ICogLSBXaW5kb3dzOiBgQzpcXFJlcG9cXHNyY1xcZmlsZS50c2AgbWF0Y2hlcyBgYzovcmVwb2AgYmVjYXVzZSBtYXRjaGluZyBpc1xuXHQgKiAgIGNhc2UtaW5zZW5zaXRpdmUgYW5kIGJhY2tzbGFzaGVzIGFyZSBub3JtYWxpemVkIHRvIGAvYC5cblx0ICogLSBHbG9iOiBgL3dvcmtzcGFjZS9wcm9qZWN0L3BhY2thZ2UuanNvbmAgbWF0Y2hlcyBgL3dvcmtzcGFjZS9wcm9qZWN0LyouanNvbmAuXG5cdCAqL1xuXHRwcml2YXRlIF9tYXRjaGVzRmlsZVN5c3RlbVBhdGgocGF0aDogc3RyaW5nLCBtYXRjaGVyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBub3JtYWxpemVkUGF0aCA9IHRoaXMuX25vcm1hbGl6ZUZpbGVTeXN0ZW1BY2Nlc3NQYXRoKHBhdGgpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRNYXRjaGVyID0gdGhpcy5fbm9ybWFsaXplRmlsZVN5c3RlbUFjY2Vzc1BhdGgobWF0Y2hlciwgdHJ1ZSk7XG5cdFx0Y29uc3QgaWdub3JlQ2FzZSA9IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cztcblx0XHRpZiAodGhpcy5fY29udGFpbnNHbG9iUGF0dGVybihub3JtYWxpemVkTWF0Y2hlcikpIHtcblx0XHRcdHJldHVybiBnbG9iTWF0Y2gobm9ybWFsaXplZE1hdGNoZXIsIG5vcm1hbGl6ZWRQYXRoLCB7IGlnbm9yZUNhc2UgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9maWxlU3lzdGVtUGF0aEV4dFVyaS5pc0VxdWFsT3JQYXJlbnQodGhpcy5fdG9GaWxlU3lzdGVtQWNjZXNzVXJpKG5vcm1hbGl6ZWRQYXRoKSwgdGhpcy5fdG9GaWxlU3lzdGVtQWNjZXNzVXJpKG5vcm1hbGl6ZWRNYXRjaGVyKSk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBub3JtYWxpemVkIHNhbmRib3ggZmlsZXN5c3RlbSBwYXRoIGludG8gYSBwc2V1ZG8gVVJJIHNvIHRoZSBjb21tb25cblx0ICogYEV4dFVyaS5pc0VxdWFsT3JQYXJlbnRgIGNvbXBhcmVyIGNhbiBiZSB1c2VkIGluc3RlYWQgb2YgZGVwcmVjYXRlZCBzdHJpbmdcblx0ICogcGF0aCBoZWxwZXJzLiBBIG5vbi1gZmlsZWAgc2NoZW1lIGlzIGludGVudGlvbmFsOiBpdCBrZWVwcyBjb21wYXJpc29uIG9uIHRoZVxuXHQgKiBVUkkgcGF0aCBjb21wb25lbnQgYW5kIGF2b2lkcyBjb252ZXJ0aW5nIHRocm91Z2ggdGhlIGhvc3QgT1MnIG5hdGl2ZSBgZnNQYXRoYFxuXHQgKiBydWxlcywgd2hpY2ggbWF5IGRpZmZlciBmcm9tIHRoZSBzYW5kYm94IHRhcmdldCBPUy5cblx0ICpcblx0ICogRXhhbXBsZXM6XG5cdCAqIC0gYC93b3Jrc3BhY2UvcHJvamVjdGAgYmVjb21lcyBgdGVybWluYWwtc2FuZGJveC1wYXRoOi93b3Jrc3BhY2UvcHJvamVjdGAuXG5cdCAqIC0gYEM6L1JlcG9gIGJlY29tZXMgYHRlcm1pbmFsLXNhbmRib3gtcGF0aDovQzovUmVwb2Agc28gV2luZG93cyBkcml2ZSBwYXRoc1xuXHQgKiAgIGFyZSBzdGlsbCB2YWxpZCBVUkkgcGF0aHMgZm9yIGNvbXBhcmlzb24uXG5cdCAqL1xuXHRwcml2YXRlIF90b0ZpbGVTeXN0ZW1BY2Nlc3NVcmkocGF0aDogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXJtaW5hbC1zYW5kYm94LXBhdGgnLCBwYXRoOiBwYXRoLnN0YXJ0c1dpdGgoJy8nKSA/IHBhdGggOiBgLyR7cGF0aH1gIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5vcm1hbGl6ZXMgYSBwYXRoIG9yIG1hdGNoZXIgaW50byB0aGUgZm9ybSB1c2VkIGZvciBzYW5kYm94IGFjY2VzcyBjaGVja3MuXG5cdCAqIE9uIFdpbmRvd3MsIGJhY2tzbGFzaGVzIGFyZSBjb252ZXJ0ZWQgdG8gYC9gIGFuZCBVUkktc2hhcGVkIGRyaXZlIHBhdGhzIGxpa2Vcblx0ICogYC9DOi9Vc2Vycy9tZWAgYXJlIGNvbnZlcnRlZCB0byBgQzovVXNlcnMvbWVgLiBVbmxlc3MgYHByZXNlcnZlR2xvYmAgaXMgdHJ1ZVxuXHQgKiBmb3IgYSBnbG9iIG1hdGNoZXIsIHRoZSBwYXRoIGlzIFBPU0lYLW5vcm1hbGl6ZWQgdG8gcmVtb3ZlIHJlZHVuZGFudCBgLmAvYC4uYFxuXHQgKiBzZWdtZW50cy4gVHJhaWxpbmcgc2xhc2hlcyBhcmUgcmVtb3ZlZCBleGNlcHQgZm9yIGZpbGVzeXN0ZW0gcm9vdHMuXG5cdCAqXG5cdCAqIEV4YW1wbGVzOlxuXHQgKiAtIExpbnV4L21hY09TOiBgL3dvcmtzcGFjZS8uLi93b3Jrc3BhY2UvYXBwL2AgYmVjb21lcyBgL3dvcmtzcGFjZS9hcHBgLlxuXHQgKiAtIFdpbmRvd3M6IGBDOlxcVXNlcnNcXG1lXFxwcm9qZWN0XFxgIGJlY29tZXMgYEM6L1VzZXJzL21lL3Byb2plY3RgLlxuXHQgKiAtIFdpbmRvd3M6IGAvQzovVXNlcnMvbWUvcHJvamVjdGAgYmVjb21lcyBgQzovVXNlcnMvbWUvcHJvamVjdGAuXG5cdCAqIC0gR2xvYiB3aXRoIGBwcmVzZXJ2ZUdsb2I9dHJ1ZWA6IGAvd29ya3NwYWNlL3Byb2plY3QvKi5qc29uYCBrZWVwcyB0aGUgZ2xvYlxuXHQgKiAgIHBhdHRlcm4gaW50YWN0IGZvciBgZ2xvYk1hdGNoYC5cblx0ICovXG5cdHByaXZhdGUgX25vcm1hbGl6ZUZpbGVTeXN0ZW1BY2Nlc3NQYXRoKHBhdGg6IHN0cmluZywgcHJlc2VydmVHbG9iOiBib29sZWFuID0gZmFsc2UpOiBzdHJpbmcge1xuXHRcdGxldCBub3JtYWxpemVkUGF0aCA9IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/IHBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpIDogcGF0aDtcblx0XHRpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzICYmIC9eXFwvW2EtekEtWl06KCR8XFwvKS8udGVzdChub3JtYWxpemVkUGF0aCkpIHtcblx0XHRcdG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplZFBhdGguc2xpY2UoMSk7XG5cdFx0fVxuXHRcdGlmICghcHJlc2VydmVHbG9iIHx8ICF0aGlzLl9jb250YWluc0dsb2JQYXR0ZXJuKG5vcm1hbGl6ZWRQYXRoKSkge1xuXHRcdFx0bm9ybWFsaXplZFBhdGggPSBwb3NpeC5ub3JtYWxpemUobm9ybWFsaXplZFBhdGgpO1xuXHRcdH1cblx0XHRpZiAobm9ybWFsaXplZFBhdGgubGVuZ3RoID4gMSAmJiBub3JtYWxpemVkUGF0aC5lbmRzV2l0aCgnLycpICYmICEvXlthLXpBLVpdOlxcLyQvLnRlc3Qobm9ybWFsaXplZFBhdGgpKSB7XG5cdFx0XHRub3JtYWxpemVkUGF0aCA9IG5vcm1hbGl6ZWRQYXRoLnJlcGxhY2UoL1xcLyskLywgJycpO1xuXHRcdH1cblx0XHRyZXR1cm4gbm9ybWFsaXplZFBhdGg7XG5cdH1cblxuXHRwcml2YXRlIF9jb250YWluc0dsb2JQYXR0ZXJuKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAvWyo/e1xcW10vLnRlc3QocGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9idWlsZFNhbmRib3hQYXlsb2FkID0gKGNvbW1hbmRMaW5lOiBzdHJpbmcsIHBvbGljeTogSVdpbmRvd3NNeGNTYW5kYm94UG9saWN5LCB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nLCBjb250YWluZXJOYW1lPzogc3RyaW5nLCBjb250YWlubWVudD86IElXaW5kb3dzTXhjUG9saWN5Q29udGFpbm1lbnQpOiBQcm9taXNlPElXaW5kb3dzTXhjQ29uZmlnIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3QuYnVpbGRXaW5kb3dzTXhjU2FuZGJveFBheWxvYWQoY29tbWFuZExpbmUsIHBvbGljeSwgd29ya2luZ0RpcmVjdG9yeSwgY29udGFpbmVyTmFtZSwgY29udGFpbm1lbnQpO1xuXHR9O1xuXG5cdHByaXZhdGUgX2dldENvbW1hbmRSdW50aW1lRmlsZVN5c3RlbVBhdGhzKHJ1bnRpbWVTZXR0aW5nOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwga2V5OiAnYWxsb3dSZWFkJyB8ICdhbGxvd1dyaXRlJyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCBmaWxlc3lzdGVtID0gcnVudGltZVNldHRpbmcuZmlsZXN5c3RlbTtcblx0XHRpZiAoIXRoaXMuX2lzT2JqZWN0Rm9yU2FuZGJveENvbmZpZ01lcmdlKGZpbGVzeXN0ZW0pKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF0aHMgPSBmaWxlc3lzdGVtW2tleV07XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHBhdGhzKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXRocy5maWx0ZXIoKHBhdGgpOiBwYXRoIGlzIHN0cmluZyA9PiB0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWVyZ2VBZGRpdGlvbmFsU2FuZGJveENvbmZpZ1Byb3BlcnRpZXModGFyZ2V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgYWRkaXRpb25hbDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhhZGRpdGlvbmFsKSkge1xuXHRcdFx0aWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGFyZ2V0LCBrZXkpKSB7XG5cdFx0XHRcdHRhcmdldFtrZXldID0gdmFsdWU7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBleGlzdGluZ1ZhbHVlID0gdGFyZ2V0W2tleV07XG5cdFx0XHRpZiAodGhpcy5faXNPYmplY3RGb3JTYW5kYm94Q29uZmlnTWVyZ2UoZXhpc3RpbmdWYWx1ZSkgJiYgdGhpcy5faXNPYmplY3RGb3JTYW5kYm94Q29uZmlnTWVyZ2UodmFsdWUpKSB7XG5cdFx0XHRcdHRoaXMuX21lcmdlQWRkaXRpb25hbFNhbmRib3hDb25maWdQcm9wZXJ0aWVzKGV4aXN0aW5nVmFsdWUsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc09iamVjdEZvclNhbmRib3hDb25maWdNZXJnZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0XHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhQXJyYXkuaXNBcnJheSh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeSgpOiBQcm9taXNlPElXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeT4ge1xuXHRcdGlmICghdGhpcy5fd2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3kpIHtcblx0XHRcdHRoaXMuX3dpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5ID0gYXdhaXQgdGhpcy5faG9zdC5nZXRXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeSgpID8/IHsgcmVhZG9ubHlQYXRoczogW10sIHJlYWR3cml0ZVBhdGhzOiBbXSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3k7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRXaW5kb3dzTXhjRW52aXJvbm1lbnQoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGlmICghdGhpcy5fd2luZG93c014Y0Vudmlyb25tZW50KSB7XG5cdFx0XHR0aGlzLl93aW5kb3dzTXhjRW52aXJvbm1lbnQgPSBhd2FpdCB0aGlzLl9ob3N0LmdldFdpbmRvd3NNeGNFbnZpcm9ubWVudCgpID8/IFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd2luZG93c014Y0Vudmlyb25tZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfcGF0aEpvaW4gPSAoLi4uc2VnbWVudHM6IHN0cmluZ1tdKSA9PiB7XG5cdFx0Y29uc3QgcGF0aCA9IHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/IHdpbjMyIDogcG9zaXg7XG5cdFx0cmV0dXJuIHBhdGguam9pbiguLi5zZWdtZW50cyk7XG5cdH07XG5cblx0cHJpdmF0ZSBfcGF0aERpcm5hbWUocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gKHRoaXMuX29zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/IHdpbjMyIDogcG9zaXgpLmRpcm5hbWUocGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRVcmlQYXRoKHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gdGhpcy5fd2luZG93c014Y1J1bnRpbWUudG9XaW5kb3dzUGF0aCh1cmkpIDogdXJpLnBhdGg7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0VGVtcERpcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLmlzRW5hYmxlZCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9uZWVkc0ZvcmNlVXBkYXRlQ29uZmlnRmlsZSA9IHRydWU7XG5cdFx0dGhpcy5fdGVtcERpciA9IGF3YWl0IHRoaXMuX2hvc3QuZ2V0U2FuZGJveFRlbXBEaXIoKTtcblx0XHRpZiAodGhpcy5fdGVtcERpcikge1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHRoaXMuX3RlbXBEaXIpO1xuXHRcdFx0dGhpcy5fZGVmYXVsdFdyaXRlUGF0aHMucHVzaCh0aGlzLl9nZXRVcmlQYXRoKHRoaXMuX3RlbXBEaXIpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdUZXJtaW5hbFNhbmRib3hFbmdpbmU6IENhbm5vdCBjcmVhdGUgc2FuZGJveCBzZXR0aW5ncyBmaWxlIGJlY2F1c2Ugbm8gdG1wRGlyIGlzIGF2YWlsYWJsZSBpbiB0aGlzIGVudmlyb25tZW50Jyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlQWxsb3dXcml0ZVBhdGhzV2l0aFdvcmtzcGFjZUZvbGRlcnMoY29uZmlndXJlZEFsbG93V3JpdGU6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBjb21tYW5kUnVudGltZUFsbG93V3JpdGU6IHN0cmluZ1tdID0gW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3Qgd3JpdGVSb290UGF0aHMgPSB0aGlzLl9ob3N0LmdldFdyaXRlUm9vdHMoKS5tYXAoZm9sZGVyID0+IHRoaXMuX2dldFVyaVBhdGgoZm9sZGVyKSk7XG5cdFx0cmV0dXJuIFsuLi5uZXcgU2V0KFsuLi53cml0ZVJvb3RQYXRocywgLi4udGhpcy5fZGVmYXVsdFdyaXRlUGF0aHMsIC4uLmF3YWl0IHRoaXMuX2dldFdvcmtzcGFjZVN0b3JhZ2VSZWFkUGF0aHMoKSwgLi4uKGNvbmZpZ3VyZWRBbGxvd1dyaXRlID8/IFtdKSwgLi4uY29tbWFuZFJ1bnRpbWVBbGxvd1dyaXRlXSldO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRGVueVJlYWRQYXRoc1dpdGhIb21lKGNvbmZpZ3VyZWREZW55UmVhZDogc3RyaW5nW10gfCB1bmRlZmluZWQpOiBzdHJpbmdbXSB7XG5cdFx0Ly8gVE9ETzogT24gV2luZG93cywgZGVueSByZWFkIG9uIGhvbWUgZGlyZWN0b3J5LlxuXHRcdGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdHJldHVybiBbLi4ubmV3IFNldChjb25maWd1cmVkRGVueVJlYWQgPz8gW10pXTtcblx0XHR9XG5cdFx0Y29uc3QgdXNlckhvbWUgPSB0aGlzLl91c2VySG9tZSA/IHRoaXMuX2dldFVyaVBhdGgodGhpcy5fdXNlckhvbWUpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBbLi4ubmV3IFNldChbLi4uKGNvbmZpZ3VyZWREZW55UmVhZCA/PyBbXSksIC4uLih1c2VySG9tZSA/IFt1c2VySG9tZV0gOiBbXSldKV07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVBbGxvd1JlYWRQYXRoc1dpdGhBbGxvd1dyaXRlKGNvbmZpZ3VyZWRBbGxvd1JlYWQ6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBhbGxvd1dyaXRlOiBzdHJpbmdbXSwgY29tbWFuZFJ1bnRpbWVBbGxvd1JlYWQ6IHN0cmluZ1tdID0gW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0cmV0dXJuIFsuLi5uZXcgU2V0KFsuLi4oY29uZmlndXJlZEFsbG93UmVhZCA/PyBbXSksIC4uLmdldFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RGb3JDb21tYW5kcyh0aGlzLl9vcywgdGhpcy5fY29tbWFuZEFsbG93TGlzdEtleXdvcmRzLCB0aGlzLl9jb21tYW5kQWxsb3dMaXN0Q29tbWFuZERldGFpbHMpLCAuLi5jb21tYW5kUnVudGltZUFsbG93UmVhZCwgLi4udGhpcy5fZ2V0U2FuZGJveFJ1bnRpbWVSZWFkUGF0aHMoKSwgLi4uYXdhaXQgdGhpcy5fZ2V0V29ya3NwYWNlU3RvcmFnZVJlYWRQYXRocygpLCAuLi5hbGxvd1dyaXRlXSldO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhwYXRoczogc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRQYXRocyA9IGF3YWl0IFByb21pc2UuYWxsKChwYXRocyA/PyBbXSkubWFwKHBhdGggPT4gdGhpcy5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRoKHBhdGgpKSk7XG5cdFx0Y29uc3Qgc2VlblBhdGhzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0cmV0dXJuIHJlc29sdmVkUGF0aHMuZmxhdCgpLmZpbHRlcihwYXRoID0+IHtcblx0XHRcdGNvbnN0IGNvbXBhcmlzb25LZXkgPSB0aGlzLl9nZXRGaWxlU3lzdGVtUGF0aENvbXBhcmlzb25LZXkocGF0aCk7XG5cdFx0XHRpZiAoc2VlblBhdGhzLmhhcyhjb21wYXJpc29uS2V5KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRzZWVuUGF0aHMuYWRkKGNvbXBhcmlzb25LZXkpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRGaWxlU3lzdGVtUGF0aENvbXBhcmlzb25LZXkocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gcGF0aC5yZXBsYWNlKC9cXC8vZywgJ1xcXFwnKS50b0xvd2VyQ2FzZSgpIDogcGF0aDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVGaWxlU3lzdGVtUGF0aChwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgZXhwYW5kZWRQYXRoID0gdGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCA/IHRoaXMuX2V4cGFuZEhvbWVQYXRoKHBhdGgpIDogcGF0aDtcblx0XHRpZiAoIXRoaXMuX2lzQWJzb2x1dGVGaWxlU3lzdGVtUGF0aChleHBhbmRlZFBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gW2V4cGFuZGVkUGF0aF07XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlYWxwYXRoID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhbHBhdGgodGhpcy5fdG9GaWxlU3lzdGVtUmVzb3VyY2UoZXhwYW5kZWRQYXRoKSk7XG5cdFx0XHRjb25zdCByZXNvbHZlZFBhdGggPSByZWFscGF0aCA/IHRoaXMuX2dldFVyaVBhdGgocmVhbHBhdGgpIDogdW5kZWZpbmVkO1xuXHRcdFx0Ly8gS2VlcCB0aGUgZXhwYW5kZWQgcGF0aCAodGhlIGNvbmZpZ3VyZWQgcGF0aCBhZnRlciBob21lIGV4cGFuc2lvbikgc28gcGVybWlzc2lvbnMgYXBwbHkgd2hlbiBhY2Nlc3NlZCB0aHJvdWdoIHRoZSBzeW1saW5rLlxuXHRcdFx0Ly8gQWxzbyBpbmNsdWRlIHRoZSByZXNvbHZlZCBwYXRoICh0aGUgY2Fub25pY2FsIHN5bWxpbmsgdGFyZ2V0KSBzbyB0aGUgc2FtZSBwZXJtaXNzaW9ucyBhcHBseSB3aGVuIGFjY2Vzc2VkIGRpcmVjdGx5LlxuXHRcdFx0cmV0dXJuIHJlc29sdmVkUGF0aCAmJiByZXNvbHZlZFBhdGggIT09IGV4cGFuZGVkUGF0aCA/IFtleHBhbmRlZFBhdGgsIHJlc29sdmVkUGF0aF0gOiBbZXhwYW5kZWRQYXRoXTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbZXhwYW5kZWRQYXRoXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc0Fic29sdXRlRmlsZVN5c3RlbVBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyB3aW4zMiA6IHBvc2l4KS5pc0Fic29sdXRlKHBhdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9GaWxlU3lzdGVtUmVzb3VyY2UocGF0aDogc3RyaW5nKTogVVJJIHtcblx0XHRpZiAodGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9XaW5kb3dzRmlsZVN5c3RlbVJlc291cmNlKHBhdGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdXNlckhvbWU/LndpdGgoeyBwYXRoIH0pID8/IHRoaXMuX3RlbXBEaXI/LndpdGgoeyBwYXRoIH0pID8/IHRoaXMuX2hvc3QuZ2V0V3JpdGVSb290cygpWzBdPy53aXRoKHsgcGF0aCB9KSA/PyBVUkkuZmlsZShwYXRoKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvV2luZG93c0ZpbGVTeXN0ZW1SZXNvdXJjZShwYXRoOiBzdHJpbmcpOiBVUkkge1xuXHRcdC8vIE5vcm1hbGl6ZSBXaW5kb3dzIHNlcGFyYXRvcnMgZm9yIFVSSSBwYXJzaW5nLCBlLmcuIGBDOlxcVXNlcnNcXG1lYCBiZWNvbWVzIGBDOi9Vc2Vycy9tZWAuXG5cdFx0Y29uc3Qgbm9ybWFsaXplZFBhdGggPSBwYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcblx0XHQvLyBNYXRjaCBVTkMgcGF0aHMsIGUuZy4gYC8vc2VydmVyL3NoYXJlL2ZvbGRlcmAgYmVjb21lcyBgZmlsZTovL3NlcnZlci9zaGFyZS9mb2xkZXJgLlxuXHRcdGlmICgvXlxcL1xcL1teL10vLnRlc3Qobm9ybWFsaXplZFBhdGgpKSB7XG5cdFx0XHRjb25zdCBmaXJzdFBhdGhTZXBhcmF0b3IgPSBub3JtYWxpemVkUGF0aC5pbmRleE9mKCcvJywgMik7XG5cdFx0XHRpZiAoZmlyc3RQYXRoU2VwYXJhdG9yID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgYXV0aG9yaXR5OiBub3JtYWxpemVkUGF0aC5zbGljZSgyKSwgcGF0aDogJy8nIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiAnZmlsZScsIGF1dGhvcml0eTogbm9ybWFsaXplZFBhdGguc2xpY2UoMiwgZmlyc3RQYXRoU2VwYXJhdG9yKSwgcGF0aDogbm9ybWFsaXplZFBhdGguc2xpY2UoZmlyc3RQYXRoU2VwYXJhdG9yKSB8fCAnLycgfSk7XG5cdFx0fVxuXHRcdC8vIE1hdGNoIGRyaXZlLWxldHRlciBwYXRocywgZS5nLiBgQzovVXNlcnMvbWVgIGJlY29tZXMgYGZpbGU6Ly8vYzovVXNlcnMvbWVgLlxuXHRcdGlmICgvXlthLXpBLVpdOigkfFxcLykvLnRlc3Qobm9ybWFsaXplZFBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogYC8ke25vcm1hbGl6ZWRQYXRoWzBdLnRvTG93ZXJDYXNlKCl9JHtub3JtYWxpemVkUGF0aC5zbGljZSgxKX1gIH0pO1xuXHRcdH1cblx0XHQvLyBNYXRjaCBVUkktc2hhcGVkIGRyaXZlIHBhdGhzLCBlLmcuIGAvQzovVXNlcnMvbWVgIGJlY29tZXMgYGZpbGU6Ly8vYzovVXNlcnMvbWVgLlxuXHRcdGlmICgvXlxcL1thLXpBLVpdOigkfFxcLykvLnRlc3Qobm9ybWFsaXplZFBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogYC8ke25vcm1hbGl6ZWRQYXRoWzFdLnRvTG93ZXJDYXNlKCl9JHtub3JtYWxpemVkUGF0aC5zbGljZSgyKX1gIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogbm9ybWFsaXplZFBhdGggfSk7XG5cdH1cblxuXHRwcml2YXRlIF9leHBhbmRIb21lUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHVzZXJIb21lID0gdGhpcy5fdXNlckhvbWU/LnBhdGg7XG5cdFx0aWYgKCF1c2VySG9tZSkge1xuXHRcdFx0cmV0dXJuIHBhdGg7XG5cdFx0fVxuXHRcdGlmIChwYXRoID09PSAnficpIHtcblx0XHRcdHJldHVybiB1c2VySG9tZTtcblx0XHR9XG5cdFx0aWYgKHBhdGguc3RhcnRzV2l0aCgnfi8nKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BhdGhKb2luKHVzZXJIb21lLCBwYXRoLnNsaWNlKDIpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHBhdGg7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTYW5kYm94UnVudGltZVJlYWRQYXRocygpOiBzdHJpbmdbXSB7XG5cdFx0aWYgKCF0aGlzLl9hcHBSb290KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdHJldHVybiB0aGlzLl93aW5kb3dzTXhjUnVudGltZS5nZXRSdW50aW1lUmVhZFBhdGhzKHRoaXMuX2FwcFJvb3QsIHRoaXMuX214Y1BhdGgpO1xuXHRcdH1cblx0XHRjb25zdCBwYXRoczogc3RyaW5nW10gPSBbdGhpcy5fYXBwUm9vdF07XG5cdFx0aWYgKHRoaXMuX2V4ZWNQYXRoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgW3RoaXMuX2V4ZWNQYXRoLCB0aGlzLl9wYXRoRGlybmFtZSh0aGlzLl9leGVjUGF0aCldKSB7XG5cdFx0XHRcdGlmICghdGhpcy5faXNQYXRoVW5kZXJBcHBSb290KHBhdGgpKSB7XG5cdFx0XHRcdFx0cGF0aHMucHVzaChwYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcGF0aHM7XG5cdH1cblxuXHRwcml2YXRlIF9pc1BhdGhVbmRlckFwcFJvb3QocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9hcHBSb290KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBwYXRoID09PSB0aGlzLl9hcHBSb290IHx8IHBhdGguc3RhcnRzV2l0aChgJHt0aGlzLl9hcHBSb290fSR7dGhpcy5fb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luMzIuc2VwIDogcG9zaXguc2VwfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0V29ya3NwYWNlU3RvcmFnZVJlYWRQYXRocygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IHRoaXMuX2hvc3QuZ2V0V29ya3NwYWNlU3RvcmFnZVJlYWRSb290KCk7XG5cdFx0cmV0dXJuIHJvb3QgPyBbdGhpcy5fZ2V0VXJpUGF0aChyb290KV0gOiBbXTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERlZmF1bHRXaW5kb3dzTXhjQ3dkKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3QuZ2V0V3JpdGVSb290cygpWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2FuZGJveENvbmZpZ3VyZWRFbmFibGVkVmFsdWUoKTogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlIHtcblx0XHRyZXR1cm4gdGhpcy5faG9zdC5nZXRTYW5kYm94U2V0dGluZzxBZ2VudFNhbmRib3hFbmFibGVkVmFsdWU+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkKSA/PyBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2FuZGJveENvbmZpZ3VyZWRXaW5kb3dzRW5hYmxlZFZhbHVlKCk6IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8QWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0VuYWJsZWQpID8/IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmY7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NhbmRib3hBbGxvd05ldHdvcmtDb25maWd1cmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ob3N0LmdldFNhbmRib3hTZXR0aW5nPGJvb2xlYW4+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmspID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXJlVW5zYW5kYm94ZWRDb21tYW5kc0FsbG93ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8Ym9vbGVhbj4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9hcmVSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0c0FsbG93ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3QuZ2V0U2FuZGJveFNldHRpbmc8Ym9vbGVhbj4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzKSA9PT0gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGlCQUFpQjtBQUNuQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLE9BQU8sYUFBYTtBQUM3QixTQUFTLGlCQUFpQixVQUFVO0FBQ3BDLFNBQVMsWUFBWTtBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLHVCQUF1QjtBQUN0RCxTQUFTLG1DQUFtQztBQUU1QyxTQUFTLDBCQUEwQix1QkFBdUIsa0NBQWtDO0FBQzVGLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsa0RBQWtEO0FBQzNELFNBQVMseURBQXlEO0FBQ2xFLFNBQTJQLGtDQUFrQywwQ0FBMEM7QUFvR2hVLElBQU0sd0JBQU4sY0FBb0MsV0FBVztBQUFBLEVBZ0NyRCxZQUNrQixPQUNjLGNBQ0QsYUFDc0Isb0JBQ25EO0FBQ0QsVUFBTTtBQUxXO0FBQ2M7QUFDRDtBQUNzQjtBQS9CckQsU0FBaUIscUJBQTZCLGFBQWE7QUFDM0QsU0FBUSxtQkFB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VztBQUNuQixpQkFBVyxRQUFRLENBQUMsS0FBSyxXQUFXLEtBQUssYUFBYSxLQUFLLFNBQVMsQ0FBQyxHQUFHO0FBQ3ZFLFlBQUksQ0FBQyxLQUFLLG9CQUFvQixJQUFJLEdBQUc7QUFDcEMsZ0JBQU0sS0FBSyxJQUFJO0FBQUEsUUFDaEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxvQkFBb0IsTUFBdUI7QUFDbEQsUUFBSSxDQUFDLEtBQUssVUFBVTtBQUNuQixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sU0FBUyxLQUFLLFlBQVksS0FBSyxXQUFXLEdBQUcsS0FBSyxRQUFRLEdBQUcsS0FBSyxRQUFRLGdCQUFnQixVQUFVLE1BQU0sTUFBTSxNQUFNLEdBQUcsRUFBRTtBQUFBLEVBQ25JO0FBQUEsRUFFQSxNQUFjLGdDQUFtRDtBQUNoRSxVQUFNLE9BQU8sTUFBTSxLQUFLLE1BQU0sNEJBQTRCO0FBQzFELFdBQU8sT0FBTyxDQUFDLEtBQUssWUFBWSxJQUFJLENBQUMsSUFBSSxDQUFDO0FBQUEsRUFDM0M7QUFBQSxFQUVRLDJCQUE0QztBQUNuRCxXQUFPLEtBQUssTUFBTSxjQUFjLEVBQUUsQ0FBQztBQUFBLEVBQ3BDO0FBQUEsRUFFUSxvQ0FBOEQ7QUFDckUsV0FBTyxLQUFLLE1BQU0sa0JBQTRDLHNCQUFzQixtQkFBbUIsS0FBSyx5QkFBeUI7QUFBQSxFQUN0STtBQUFBLEVBRVEsMkNBQXFFO0FBQzVFLFdBQU8sS0FBSyxNQUFNLGtCQUE0QyxzQkFBc0IsMEJBQTBCLEtBQUsseUJBQXlCO0FBQUEsRUFDN0k7QUFBQSxFQUVRLG1DQUE0QztBQUNuRCxXQUFPLEtBQUssTUFBTSxrQkFBMkIsc0JBQXNCLHdCQUF3QixNQUFNO0FBQUEsRUFDbEc7QUFBQSxFQUVRLGlDQUEwQztBQUNqRCxXQUFPLEtBQUssTUFBTSxrQkFBMkIsc0JBQXNCLG9DQUFvQyxNQUFNO0FBQUEsRUFDOUc7QUFBQSxFQUVRLDJDQUFvRDtBQUMzRCxXQUFPLEtBQUssTUFBTSxrQkFBMkIsc0JBQXNCLHlDQUF5QyxNQUFNO0FBQUEsRUFDbkg7QUFDRDtBQWg4QmEsc0JBQ1ksWUFBWTtBQUR4QixzQkFFWSxrQkFBa0I7QUFGOUIsc0JBR1ksYUFBYTtBQUh6Qix3QkFBTjtBQUFBLEVBa0NKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBDVTsiLAogICJuYW1lcyI6IFsidmFsdWUiXQp9Cg==
