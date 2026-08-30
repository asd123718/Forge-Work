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
import { timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { FileAccess } from "../../../../../base/common/network.js";
import { dirname } from "../../../../../base/common/path.js";
import { OperatingSystem, OS } from "../../../../../base/common/platform.js";
import { arch } from "../../../../../base/common/process.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { SANDBOX_HELPER_CHANNEL_NAME, SandboxHelperChannelClient } from "../../../../../platform/sandbox/common/sandboxHelperIpc.js";
import { ISandboxHelperService } from "../../../../../platform/sandbox/common/sandboxHelperService.js";
import { TerminalSandboxEngine } from "../../../../../platform/sandbox/common/terminalSandboxEngine.js";
import { readSandboxSetting, SANDBOX_SETTING_KEYS } from "./sandboxSettingsReader.js";
import { TerminalSandboxPreCheckRemediation } from "../../../../../platform/sandbox/common/terminalSandboxService.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { ChatModel } from "../../../chat/common/model/chatModel.js";
import { ChatElicitationRequestPart } from "../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { ElicitationState, IChatService } from "../../../chat/common/chatService/chatService.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { ILifecycleService, WillShutdownJoinerOrder } from "../../../../services/lifecycle/common/lifecycle.js";
import { ITerminalSandboxService as ITerminalSandboxService2, TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation as TerminalSandboxPreCheckRemediation2 } from "../../../../../platform/sandbox/common/terminalSandboxService.js";
const SANDBOX_TEMP_DIR_NAME = "tmp";
function affectsSandboxSettings(e) {
  return SANDBOX_SETTING_KEYS.some((key) => e.affectsConfiguration(key));
}
let TerminalSandboxService = class extends Disposable {
  constructor(_configurationService, fileService, _environmentService, _logService, _remoteAgentService, _workspaceContextService, _productService, lifecycleService, _sandboxHelperService, _chatService, instantiationService) {
    super();
    this._configurationService = _configurationService;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._remoteAgentService = _remoteAgentService;
    this._workspaceContextService = _workspaceContextService;
    this._productService = _productService;
    this._sandboxHelperService = _sandboxHelperService;
    this._chatService = _chatService;
    this._onDidChangeRoots = this._register(new Emitter());
    this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();
    const onDidChangeSandboxSettings = Event.filter(this._configurationService.onDidChangeConfiguration, affectsSandboxSettings);
    const host = {
      getOS: () => this._resolveOS(),
      getRuntimeInfo: () => this._resolveRuntimeInfo(),
      getUserHome: () => this._resolveUserHome(),
      getSandboxTempDir: () => this._resolveSandboxTempDir(),
      getWorkspaceStorageReadRoot: () => this._resolveWorkspaceStorageReadRoot(),
      getWriteRoots: () => this._workspaceContextService.getWorkspace().folders.map((folder) => folder.uri),
      onDidChangeRoots: this._onDidChangeRoots.event,
      checkSandboxDependencies: () => this._resolveSandboxDependencyStatus(),
      getWindowsMxcFilesystemPolicy: () => this._resolveWindowsMxcFilesystemPolicy(),
      getWindowsMxcEnvironment: () => this._resolveWindowsMxcEnvironment(),
      buildWindowsMxcSandboxPayload: (commandLine, policy, workingDirectory, containerName, containment) => this._resolveWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment),
      getSandboxSetting: (settingId) => this._readSandboxSetting(settingId),
      onDidChangeSandboxSettings: Event.map(onDidChangeSandboxSettings, () => void 0)
    };
    this._engine = this._register(instantiationService.createInstance(TerminalSandboxEngine, host));
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._onDidChangeRoots.fire()));
    this._register(lifecycleService.onWillShutdown((e) => {
      if (!this._engine.getTempDir()) {
        return;
      }
      e.join(this._engine.cleanupTempDir(), {
        id: "join.deleteFilesInSandboxTempDir",
        label: localize("deleteFilesInSandboxTempDir", "Delete Files in Sandbox Temp Dir"),
        order: WillShutdownJoinerOrder.Default
      });
    }));
  }
  // ---- ITerminalSandboxService forwarders ---------------------------------
  isEnabled(precheckInputs) {
    return this._engine.isEnabled(precheckInputs);
  }
  isSandboxAllowNetworkEnabled(precheckInputs) {
    return this._engine.isSandboxAllowNetworkEnabled(precheckInputs);
  }
  getOS() {
    return this._engine.getOS();
  }
  wrapCommand(command, requestUnsandboxedExecution, shell, cwd, commandDetails, requestAllowNetwork) {
    return this._engine.wrapCommand(command, requestUnsandboxedExecution, shell, cwd, commandDetails, requestAllowNetwork);
  }
  checkFileAccess(permission, paths, precheckInputs) {
    return this._engine.checkFileAccess(permission, paths, precheckInputs);
  }
  checkForSandboxingPrereqs(forceRefresh = false, precheckInputs) {
    return this._engine.checkForSandboxingPrereqs(forceRefresh, precheckInputs);
  }
  getSandboxConfigPath(forceRefresh = false, precheckInputs) {
    return this._engine.getSandboxConfigPath(forceRefresh, precheckInputs);
  }
  getTempDir() {
    return this._engine.getTempDir();
  }
  setNeedsForceUpdateConfigFile() {
    this._engine.setNeedsForceUpdateConfigFile();
  }
  getResolvedNetworkDomains() {
    return this._engine.getResolvedNetworkDomains();
  }
  getMissingSandboxDependencies() {
    return this._engine.getMissingSandboxDependencies();
  }
  // ---- host adapter helpers -----------------------------------------------
  async _resolveRemoteEnv() {
    if (this._remoteEnvDetails === void 0) {
      this._remoteEnvDetails = await this._remoteEnvDetailsPromise;
    }
    return this._remoteEnvDetails;
  }
  async _resolveOS() {
    const remoteEnv = await this._resolveRemoteEnv();
    return remoteEnv ? remoteEnv.os : OS;
  }
  _readSandboxSetting(settingId) {
    return readSandboxSetting(this._configurationService, this._logService, settingId);
  }
  async _resolveRuntimeInfo() {
    const remoteEnv = await this._resolveRemoteEnv();
    if (remoteEnv) {
      return { appRoot: remoteEnv.os === OperatingSystem.Windows ? this._toWindowsPath(remoteEnv.appRoot) : remoteEnv.appRoot.path, execPath: remoteEnv.execPath, runAsNode: false, arch: remoteEnv.arch, nativeModulesDir: "node_modules" };
    }
    const localAppRootUri = FileAccess.asFileUri("");
    const localAppRoot = OS === OperatingSystem.Windows ? dirname(localAppRootUri.fsPath) : dirname(localAppRootUri.path);
    const nativeEnv = this._environmentService;
    const nativeModulesDir = this._environmentService.isBuilt ? "node_modules.asar.unpacked" : "node_modules";
    return { appRoot: localAppRoot, execPath: nativeEnv.execPath, runAsNode: true, arch, nativeModulesDir };
  }
  _toWindowsPath(uri) {
    let value;
    if (uri.authority && uri.path.length > 1 && uri.scheme === "file") {
      value = `\\\\${uri.authority}${uri.path}`;
    } else if (/^\/[a-zA-Z]:/.test(uri.path)) {
      value = uri.path.slice(1);
    } else {
      value = uri.fsPath;
    }
    return value.replace(/\//g, "\\");
  }
  async _resolveUserHome() {
    const remoteEnv = await this._resolveRemoteEnv();
    if (remoteEnv?.userHome) {
      return remoteEnv.userHome;
    }
    const nativeEnv = this._environmentService;
    return nativeEnv.userHome;
  }
  async _resolveSandboxTempDir() {
    const remoteEnv = await this._resolveRemoteEnv();
    const sandboxTempDirName = this._getSandboxWindowTempDirName();
    if (remoteEnv?.userHome) {
      const sandboxRoot = URI.joinPath(remoteEnv.userHome, this._productService.serverDataFolderName ?? this._productService.dataFolderName, SANDBOX_TEMP_DIR_NAME);
      return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
    }
    const nativeEnv = this._environmentService;
    if (nativeEnv.userHome) {
      const sandboxRoot = URI.joinPath(nativeEnv.userHome, this._productService.dataFolderName, SANDBOX_TEMP_DIR_NAME);
      return sandboxTempDirName ? URI.joinPath(sandboxRoot, sandboxTempDirName) : sandboxRoot;
    }
    return void 0;
  }
  async _resolveWorkspaceStorageReadRoot() {
    const remoteEnv = await this._resolveRemoteEnv();
    const workspaceStorageHome = remoteEnv?.workspaceStorageHome ?? this._environmentService.workspaceStorageHome;
    const workspaceId = this._workspaceContextService.getWorkspace().id;
    return URI.joinPath(workspaceStorageHome, workspaceId);
  }
  _getSandboxWindowTempDirName() {
    const workbenchEnv = this._environmentService;
    const windowId = workbenchEnv.window?.id;
    return typeof windowId === "number" ? `tmp_vscode_${windowId}` : void 0;
  }
  async _resolveSandboxDependencyStatus() {
    const connection = this._remoteAgentService.getConnection();
    if (connection) {
      return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, (channel) => {
        const sandboxHelper = new SandboxHelperChannelClient(channel);
        return sandboxHelper.checkSandboxDependencies();
      });
    }
    return this._sandboxHelperService.checkSandboxDependencies();
  }
  async _resolveWindowsMxcFilesystemPolicy() {
    const connection = this._remoteAgentService.getConnection();
    if (connection) {
      return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, (channel) => {
        const sandboxHelper = new SandboxHelperChannelClient(channel);
        return sandboxHelper.getWindowsMxcFilesystemPolicy();
      });
    }
    return this._sandboxHelperService.getWindowsMxcFilesystemPolicy();
  }
  async _resolveWindowsMxcEnvironment() {
    const connection = this._remoteAgentService.getConnection();
    if (connection) {
      return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, (channel) => {
        const sandboxHelper = new SandboxHelperChannelClient(channel);
        return sandboxHelper.getWindowsMxcEnvironment();
      });
    }
    return this._sandboxHelperService.getWindowsMxcEnvironment();
  }
  async _resolveWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment) {
    const connection = this._remoteAgentService.getConnection();
    if (connection) {
      return connection.withChannel(SANDBOX_HELPER_CHANNEL_NAME, (channel) => {
        const sandboxHelper = new SandboxHelperChannelClient(channel);
        return sandboxHelper.buildWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment);
      });
    }
    return this._sandboxHelperService.buildWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment);
  }
  // ---- workbench-only flows -----------------------------------------------
  async installMissingSandboxDependencies(missingDependencies, sessionResource, token, options) {
    const status = await this._resolveSandboxDependencyStatus();
    if (!status?.dependencyInstallCommand) {
      return { exitCode: void 0 };
    }
    const depsList = missingDependencies.map((dependency) => this._quoteShellArgument(dependency)).join(" ");
    return this._runSandboxPrerequisiteCommand(`${status.dependencyInstallCommand} ${depsList}`, sessionResource, token, options);
  }
  async runSandboxRemediation(remediation, sessionResource, token, options) {
    let command;
    switch (remediation) {
      case TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction:
        command = "sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0";
        break;
      default:
        throw new Error("Unsupported sandbox remediation");
    }
    return this._runSandboxPrerequisiteCommand(command, sessionResource, token, options);
  }
  async _runSandboxPrerequisiteCommand(command, sessionResource, token, options) {
    const instance = await options.createTerminal();
    let installCommandSent = false;
    const completionPromise = new Promise((resolve) => {
      const store = new DisposableStore();
      let resolved = false;
      const resolveOnce = (code) => {
        if (resolved) {
          return;
        }
        resolved = true;
        store.dispose();
        resolve(code);
      };
      const attachListener = () => {
        const detection = instance.capabilities.get(TerminalCapability.CommandDetection);
        if (detection) {
          store.add(detection.onCommandFinished((cmd) => resolveOnce(cmd.exitCode)));
        }
      };
      attachListener();
      store.add(instance.capabilities.onDidAddCapability((e) => {
        if (e.id === TerminalCapability.CommandDetection) {
          attachListener();
        }
      }));
      store.add(instance.onDisposed(() => resolveOnce(void 0)));
      store.add(token.onCancellationRequested(() => resolveOnce(void 0)));
      const safetyTimeout = timeout(5 * 60 * 1e3);
      store.add({ dispose: () => safetyTimeout.cancel() });
      safetyTimeout.then(() => resolveOnce(void 0));
      const passwordPrompt = this._createMissingDependencyPasswordPrompt(sessionResource, {
        focusTerminal: () => options.focusTerminal(instance),
        onDidInputData: instance.onDidInputData,
        onDisposed: instance.onDisposed,
        didSendInstallCommand: () => installCommandSent
      }, token);
      store.add(passwordPrompt);
    });
    await instance.sendText(command, true);
    installCommandSent = true;
    return { exitCode: await completionPromise };
  }
  _quoteShellArgument(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
  /**
   * Shows a chat elicitation that keeps the "Install" flow grounded in chat while
   * the user focuses the terminal and types a sudo password.
   */
  _createMissingDependencyPasswordPrompt(sessionResource, promptContext, token) {
    const chatModel = sessionResource && this._chatService.getSession(sessionResource);
    if (!(chatModel instanceof ChatModel)) {
      return new DisposableStore();
    }
    const request = chatModel.getRequests().at(-1);
    if (!request) {
      return new DisposableStore();
    }
    const part = new ChatElicitationRequestPart(
      localize("runInTerminal.missingDeps.passwordPromptTitle", "The terminal is awaiting input."),
      new MarkdownString(localize(
        "runInTerminal.missingDeps.passwordPromptMessage",
        "Applying sandbox prerequisites may prompt for your sudo password. Select Focus Terminal to type it in the terminal."
      )),
      "",
      localize("runInTerminal.missingDeps.focusTerminal", "Focus Terminal"),
      void 0,
      async () => {
        await promptContext.focusTerminal();
        return ElicitationState.Pending;
      }
    );
    chatModel.acceptResponseProgress(request, part);
    const store = new DisposableStore();
    const disposePrompt = () => store.dispose();
    store.add({ dispose: () => part.hide() });
    store.add(token.onCancellationRequested(disposePrompt));
    store.add(promptContext.onDisposed(disposePrompt));
    store.add(promptContext.onDidInputData((data) => {
      if (promptContext.didSendInstallCommand() && data.length > 0) {
        disposePrompt();
      }
    }));
    return store;
  }
};
TerminalSandboxService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IRemoteAgentService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IProductService),
  __decorateParam(7, ILifecycleService),
  __decorateParam(8, ISandboxHelperService),
  __decorateParam(9, IChatService),
  __decorateParam(10, IInstantiationService)
], TerminalSandboxService);
export {
  ITerminalSandboxService2 as ITerminalSandboxService,
  TerminalSandboxPreCheckRemediation2 as TerminalSandboxPreCheckRemediation,
  TerminalSandboxPrerequisiteCheck,
  TerminalSandboxService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGNvbW1vblxcdGVybWluYWxTYW5kYm94U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSwgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBhcmNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50RW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50RW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgU0FOREJPWF9IRUxQRVJfQ0hBTk5FTF9OQU1FLCBTYW5kYm94SGVscGVyQ2hhbm5lbENsaWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3NhbmRib3hIZWxwZXJJcGMuanMnO1xuaW1wb3J0IHsgSVNhbmRib3hEZXBlbmRlbmN5U3RhdHVzLCBJU2FuZGJveEhlbHBlclNlcnZpY2UsIHR5cGUgSVdpbmRvd3NNeGNDb25maWcsIElXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeSwgdHlwZSBJV2luZG93c014Y1BvbGljeUNvbnRhaW5tZW50LCB0eXBlIElXaW5kb3dzTXhjU2FuZGJveFBvbGljeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3NhbmRib3hIZWxwZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNhbmRib3hFbmdpbmVIb3N0LCBJVGVybWluYWxTYW5kYm94UnVudGltZUluZm8sIFRlcm1pbmFsU2FuZGJveEVuZ2luZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3Rlcm1pbmFsU2FuZGJveEVuZ2luZS5qcyc7XG5pbXBvcnQgeyByZWFkU2FuZGJveFNldHRpbmcsIFNBTkRCT1hfU0VUVElOR19LRVlTIH0gZnJvbSAnLi9zYW5kYm94U2V0dGluZ3NSZWFkZXIuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsIFRlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24sIHR5cGUgSVNhbmRib3hEZXBlbmRlbmN5SW5zdGFsbE9wdGlvbnMsIHR5cGUgSVNhbmRib3hEZXBlbmRlbmN5SW5zdGFsbFJlc3VsdCwgdHlwZSBJVGVybWluYWxTYW5kYm94Q29tbWFuZCwgdHlwZSBJVGVybWluYWxTYW5kYm94RmlsZUFjY2Vzc0NoZWNrUmVzdWx0LCB0eXBlIElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cywgdHlwZSBJVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2tSZXN1bHQsIHR5cGUgSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnMsIHR5cGUgSVRlcm1pbmFsU2FuZGJveFdyYXBSZXN1bHQsIHR5cGUgVGVybWluYWxTYW5kYm94RmlsZUFjY2Vzc1Blcm1pc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2NvbW1vbi90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydCB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0LmpzJztcbmltcG9ydCB7IEVsaWNpdGF0aW9uU3RhdGUsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgV2lsbFNodXRkb3duSm9pbmVyT3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmV4cG9ydCB7IElUZXJtaW5hbFNhbmRib3hTZXJ2aWNlLCBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjaywgVGVybWluYWxTYW5kYm94UHJlQ2hlY2tSZW1lZGlhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuanMnO1xuZXhwb3J0IHR5cGUgeyBJU2FuZGJveERlcGVuZGVuY3lJbnN0YWxsT3B0aW9ucywgSVNhbmRib3hEZXBlbmRlbmN5SW5zdGFsbFJlc3VsdCwgSVNhbmRib3hEZXBlbmRlbmN5SW5zdGFsbFRlcm1pbmFsLCBJVGVybWluYWxTYW5kYm94Q29tbWFuZCwgSVRlcm1pbmFsU2FuZGJveEZpbGVBY2Nlc3NDaGVja1Jlc3VsdCwgSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzLCBJVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2tSZXN1bHQsIElUZXJtaW5hbFNhbmRib3hSZXNvbHZlZE5ldHdvcmtEb21haW5zLCBJVGVybWluYWxTYW5kYm94V3JhcFJlc3VsdCwgVGVybWluYWxTYW5kYm94RmlsZUFjY2Vzc1Blcm1pc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2NvbW1vbi90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmpzJztcblxuLyoqXG4gKiBDb250ZXh0IHBhc3NlZCB0byB0aGUgcGFzc3dvcmQgcHJvbXB0IGR1cmluZyBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbi5cbiAqL1xuaW50ZXJmYWNlIElTYW5kYm94RGVwZW5kZW5jeUluc3RhbGxUZXJtaW5hbENvbnRleHQge1xuXHRmb2N1c1Rlcm1pbmFsKCk6IFByb21pc2U8dm9pZD47XG5cdG9uRGlkSW5wdXREYXRhOiBFdmVudDxzdHJpbmc+O1xuXHRvbkRpc3Bvc2VkOiBFdmVudDx1bmtub3duPjtcblx0ZGlkU2VuZEluc3RhbGxDb21tYW5kKCk6IGJvb2xlYW47XG59XG5cbi8qKiBTdWJkaXJlY3RvcnkgdW5kZXIgdGhlIHVzZXIgaG9tZSArIHByb2R1Y3QgZGF0YSBmb2xkZXIgd2hlcmUgdGhlIGVuZ2luZSBjcmVhdGVzIGl0cyB0ZW1wIGRpci4gKi9cbmNvbnN0IFNBTkRCT1hfVEVNUF9ESVJfTkFNRSA9ICd0bXAnO1xuXG5mdW5jdGlvbiBhZmZlY3RzU2FuZGJveFNldHRpbmdzKGU6IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIFNBTkRCT1hfU0VUVElOR19LRVlTLnNvbWUoa2V5ID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oa2V5KSk7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFNhbmRib3hTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbFNhbmRib3hTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuZ2luZTogVGVybWluYWxTYW5kYm94RW5naW5lO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVFbnZEZXRhaWxzUHJvbWlzZTogUHJvbWlzZTxJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB8IG51bGw+O1xuXHRwcml2YXRlIF9yZW1vdGVFbnZEZXRhaWxzOiBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUm9vdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJU2FuZGJveEhlbHBlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2FuZGJveEhlbHBlclNlcnZpY2U6IElTYW5kYm94SGVscGVyU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlbW90ZUVudkRldGFpbHNQcm9taXNlID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCk7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZVNhbmRib3hTZXR0aW5ncyA9IEV2ZW50LmZpbHRlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGFmZmVjdHNTYW5kYm94U2V0dGluZ3MpO1xuXG5cdFx0Y29uc3QgaG9zdDogSVRlcm1pbmFsU2FuZGJveEVuZ2luZUhvc3QgPSB7XG5cdFx0XHRnZXRPUzogKCkgPT4gdGhpcy5fcmVzb2x2ZU9TKCksXG5cdFx0XHRnZXRSdW50aW1lSW5mbzogKCkgPT4gdGhpcy5fcmVzb2x2ZVJ1bnRpbWVJbmZvKCksXG5cdFx0XHRnZXRVc2VySG9tZTogKCkgPT4gdGhpcy5fcmVzb2x2ZVVzZXJIb21lKCksXG5cdFx0XHRnZXRTYW5kYm94VGVtcERpcjogKCkgPT4gdGhpcy5fcmVzb2x2ZVNhbmRib3hUZW1wRGlyKCksXG5cdFx0XHRnZXRXb3Jrc3BhY2VTdG9yYWdlUmVhZFJvb3Q6ICgpID0+IHRoaXMuX3Jlc29sdmVXb3Jrc3BhY2VTdG9yYWdlUmVhZFJvb3QoKSxcblx0XHRcdGdldFdyaXRlUm9vdHM6ICgpID0+IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKSxcblx0XHRcdG9uRGlkQ2hhbmdlUm9vdHM6IHRoaXMuX29uRGlkQ2hhbmdlUm9vdHMuZXZlbnQsXG5cdFx0XHRjaGVja1NhbmRib3hEZXBlbmRlbmNpZXM6ICgpID0+IHRoaXMuX3Jlc29sdmVTYW5kYm94RGVwZW5kZW5jeVN0YXR1cygpLFxuXHRcdFx0Z2V0V2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3k6ICgpID0+IHRoaXMuX3Jlc29sdmVXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeSgpLFxuXHRcdFx0Z2V0V2luZG93c014Y0Vudmlyb25tZW50OiAoKSA9PiB0aGlzLl9yZXNvbHZlV2luZG93c014Y0Vudmlyb25tZW50KCksXG5cdFx0XHRidWlsZFdpbmRvd3NNeGNTYW5kYm94UGF5bG9hZDogKGNvbW1hbmRMaW5lLCBwb2xpY3ksIHdvcmtpbmdEaXJlY3RvcnksIGNvbnRhaW5lck5hbWUsIGNvbnRhaW5tZW50KSA9PiB0aGlzLl9yZXNvbHZlV2luZG93c014Y1NhbmRib3hQYXlsb2FkKGNvbW1hbmRMaW5lLCBwb2xpY3ksIHdvcmtpbmdEaXJlY3RvcnksIGNvbnRhaW5lck5hbWUsIGNvbnRhaW5tZW50KSxcblx0XHRcdGdldFNhbmRib3hTZXR0aW5nOiA8VD4oc2V0dGluZ0lkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkID0+IHRoaXMuX3JlYWRTYW5kYm94U2V0dGluZzxUPihzZXR0aW5nSWQpLFxuXHRcdFx0b25EaWRDaGFuZ2VTYW5kYm94U2V0dGluZ3M6IEV2ZW50Lm1hcChvbkRpZENoYW5nZVNhbmRib3hTZXR0aW5ncywgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHR9O1xuXHRcdHRoaXMuX2VuZ2luZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlUm9vdHMuZmlyZSgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihsaWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9lbmdpbmUuZ2V0VGVtcERpcigpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGUuam9pbih0aGlzLl9lbmdpbmUuY2xlYW51cFRlbXBEaXIoKSwge1xuXHRcdFx0XHRpZDogJ2pvaW4uZGVsZXRlRmlsZXNJblNhbmRib3hUZW1wRGlyJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkZWxldGVGaWxlc0luU2FuZGJveFRlbXBEaXInLCBcIkRlbGV0ZSBGaWxlcyBpbiBTYW5kYm94IFRlbXAgRGlyXCIpLFxuXHRcdFx0XHRvcmRlcjogV2lsbFNodXRkb3duSm9pbmVyT3JkZXIuRGVmYXVsdFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tLSBJVGVybWluYWxTYW5kYm94U2VydmljZSBmb3J3YXJkZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGlzRW5hYmxlZChwcmVjaGVja0lucHV0cz86IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9lbmdpbmUuaXNFbmFibGVkKHByZWNoZWNrSW5wdXRzKTtcblx0fVxuXG5cdGlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQocHJlY2hlY2tJbnB1dHM/OiBJVGVybWluYWxTYW5kYm94UHJlY2hlY2tJbnB1dHMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fZW5naW5lLmlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQocHJlY2hlY2tJbnB1dHMpO1xuXHR9XG5cblx0Z2V0T1MoKTogUHJvbWlzZTxPcGVyYXRpbmdTeXN0ZW0+IHtcblx0XHRyZXR1cm4gdGhpcy5fZW5naW5lLmdldE9TKCk7XG5cdH1cblxuXHR3cmFwQ29tbWFuZChjb21tYW5kOiBzdHJpbmcsIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj86IGJvb2xlYW4sIHNoZWxsPzogc3RyaW5nLCBjd2Q/OiBVUkksIGNvbW1hbmREZXRhaWxzPzogcmVhZG9ubHkgSVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXSwgcmVxdWVzdEFsbG93TmV0d29yaz86IGJvb2xlYW4pOiBQcm9taXNlPElUZXJtaW5hbFNhbmRib3hXcmFwUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuZ2luZS53cmFwQ29tbWFuZChjb21tYW5kLCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24sIHNoZWxsLCBjd2QsIGNvbW1hbmREZXRhaWxzLCByZXF1ZXN0QWxsb3dOZXR3b3JrKTtcblx0fVxuXG5cdGNoZWNrRmlsZUFjY2VzcyhwZXJtaXNzaW9uOiBUZXJtaW5hbFNhbmRib3hGaWxlQWNjZXNzUGVybWlzc2lvbiwgcGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdLCBwcmVjaGVja0lucHV0cz86IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyk6IFByb21pc2U8SVRlcm1pbmFsU2FuZGJveEZpbGVBY2Nlc3NDaGVja1Jlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9lbmdpbmUuY2hlY2tGaWxlQWNjZXNzKHBlcm1pc3Npb24sIHBhdGhzLCBwcmVjaGVja0lucHV0cyk7XG5cdH1cblxuXHRjaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKGZvcmNlUmVmcmVzaDogYm9vbGVhbiA9IGZhbHNlLCBwcmVjaGVja0lucHV0cz86IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyk6IFByb21pc2U8SVRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuZ2luZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKGZvcmNlUmVmcmVzaCwgcHJlY2hlY2tJbnB1dHMpO1xuXHR9XG5cblx0Z2V0U2FuZGJveENvbmZpZ1BhdGgoZm9yY2VSZWZyZXNoOiBib29sZWFuID0gZmFsc2UsIHByZWNoZWNrSW5wdXRzPzogSVRlcm1pbmFsU2FuZGJveFByZWNoZWNrSW5wdXRzKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKGZvcmNlUmVmcmVzaCwgcHJlY2hlY2tJbnB1dHMpO1xuXHR9XG5cblx0Z2V0VGVtcERpcigpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9lbmdpbmUuZ2V0VGVtcERpcigpO1xuXHR9XG5cblx0c2V0TmVlZHNGb3JjZVVwZGF0ZUNvbmZpZ0ZpbGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5naW5lLnNldE5lZWRzRm9yY2VVcGRhdGVDb25maWdGaWxlKCk7XG5cdH1cblxuXHRnZXRSZXNvbHZlZE5ldHdvcmtEb21haW5zKCk6IElUZXJtaW5hbFNhbmRib3hSZXNvbHZlZE5ldHdvcmtEb21haW5zIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5naW5lLmdldFJlc29sdmVkTmV0d29ya0RvbWFpbnMoKTtcblx0fVxuXG5cdGdldE1pc3NpbmdTYW5kYm94RGVwZW5kZW5jaWVzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fZW5naW5lLmdldE1pc3NpbmdTYW5kYm94RGVwZW5kZW5jaWVzKCk7XG5cdH1cblxuXHQvLyAtLS0tIGhvc3QgYWRhcHRlciBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVJlbW90ZUVudigpOiBQcm9taXNlPElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbD4ge1xuXHRcdGlmICh0aGlzLl9yZW1vdGVFbnZEZXRhaWxzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3JlbW90ZUVudkRldGFpbHMgPSBhd2FpdCB0aGlzLl9yZW1vdGVFbnZEZXRhaWxzUHJvbWlzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZUVudkRldGFpbHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlT1MoKTogUHJvbWlzZTxPcGVyYXRpbmdTeXN0ZW0+IHtcblx0XHRjb25zdCByZW1vdGVFbnYgPSBhd2FpdCB0aGlzLl9yZXNvbHZlUmVtb3RlRW52KCk7XG5cdFx0cmV0dXJuIHJlbW90ZUVudiA/IHJlbW90ZUVudi5vcyA6IE9TO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZFNhbmRib3hTZXR0aW5nPFQ+KHNldHRpbmdJZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHJlYWRTYW5kYm94U2V0dGluZzxUPih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgc2V0dGluZ0lkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVSdW50aW1lSW5mbygpOiBQcm9taXNlPElUZXJtaW5hbFNhbmRib3hSdW50aW1lSW5mbz4ge1xuXHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX3Jlc29sdmVSZW1vdGVFbnYoKTtcblx0XHRpZiAocmVtb3RlRW52KSB7XG5cdFx0XHQvLyBSZW1vdGUgd29ya2JlbmNoOiBzZXJ2ZXIgcmVzb2x2ZXMgYSByZWFsIGBub2RlYCBiaW5hcnksIG5vIGVudiBwcmVmaXggbmVlZGVkLlxuXHRcdFx0cmV0dXJuIHsgYXBwUm9vdDogcmVtb3RlRW52Lm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/IHRoaXMuX3RvV2luZG93c1BhdGgocmVtb3RlRW52LmFwcFJvb3QpIDogcmVtb3RlRW52LmFwcFJvb3QucGF0aCwgZXhlY1BhdGg6IHJlbW90ZUVudi5leGVjUGF0aCwgcnVuQXNOb2RlOiBmYWxzZSwgYXJjaDogcmVtb3RlRW52LmFyY2gsIG5hdGl2ZU1vZHVsZXNEaXI6ICdub2RlX21vZHVsZXMnIH07XG5cdFx0fVxuXHRcdC8vIExvY2FsIHdvcmtiZW5jaDogYXBwIHJvb3QgaXMgbG9jYWwgYW5kIGV4ZWMgcGF0aCBwb2ludHMgYXQgdGhlIEVsZWN0cm9uIGJpbmFyeSxcblx0XHQvLyBzbyB0aGUgZW5naW5lIG11c3QgcHJlZml4IGBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xYCB3aGVuIGludm9raW5nIGl0LlxuXHRcdGNvbnN0IGxvY2FsQXBwUm9vdFVyaSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCcnKTtcblx0XHRjb25zdCBsb2NhbEFwcFJvb3QgPSBPUyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyBkaXJuYW1lKGxvY2FsQXBwUm9vdFVyaS5mc1BhdGgpIDogZGlybmFtZShsb2NhbEFwcFJvb3RVcmkucGF0aCk7XG5cdFx0Y29uc3QgbmF0aXZlRW52ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlIGFzIElFbnZpcm9ubWVudFNlcnZpY2UgJiB7IGV4ZWNQYXRoPzogc3RyaW5nIH07XG5cdFx0Y29uc3QgbmF0aXZlTW9kdWxlc0RpciA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0ID8gJ25vZGVfbW9kdWxlcy5hc2FyLnVucGFja2VkJyA6ICdub2RlX21vZHVsZXMnO1xuXHRcdHJldHVybiB7IGFwcFJvb3Q6IGxvY2FsQXBwUm9vdCwgZXhlY1BhdGg6IG5hdGl2ZUVudi5leGVjUGF0aCwgcnVuQXNOb2RlOiB0cnVlLCBhcmNoLCBuYXRpdmVNb2R1bGVzRGlyIH07XG5cdH1cblxuXHRwcml2YXRlIF90b1dpbmRvd3NQYXRoKHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRsZXQgdmFsdWU6IHN0cmluZztcblx0XHRpZiAodXJpLmF1dGhvcml0eSAmJiB1cmkucGF0aC5sZW5ndGggPiAxICYmIHVyaS5zY2hlbWUgPT09ICdmaWxlJykge1xuXHRcdFx0dmFsdWUgPSBgXFxcXFxcXFwke3VyaS5hdXRob3JpdHl9JHt1cmkucGF0aH1gO1xuXHRcdH0gZWxzZSBpZiAoL15cXC9bYS16QS1aXTovLnRlc3QodXJpLnBhdGgpKSB7XG5cdFx0XHR2YWx1ZSA9IHVyaS5wYXRoLnNsaWNlKDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWx1ZSA9IHVyaS5mc1BhdGg7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZS5yZXBsYWNlKC9cXC8vZywgJ1xcXFwnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVVc2VySG9tZSgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX3Jlc29sdmVSZW1vdGVFbnYoKTtcblx0XHRpZiAocmVtb3RlRW52Py51c2VySG9tZSkge1xuXHRcdFx0cmV0dXJuIHJlbW90ZUVudi51c2VySG9tZTtcblx0XHR9XG5cdFx0Y29uc3QgbmF0aXZlRW52ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlIGFzIElFbnZpcm9ubWVudFNlcnZpY2UgJiB7IHVzZXJIb21lPzogVVJJIH07XG5cdFx0cmV0dXJuIG5hdGl2ZUVudi51c2VySG9tZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVTYW5kYm94VGVtcERpcigpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX3Jlc29sdmVSZW1vdGVFbnYoKTtcblx0XHRjb25zdCBzYW5kYm94VGVtcERpck5hbWUgPSB0aGlzLl9nZXRTYW5kYm94V2luZG93VGVtcERpck5hbWUoKTtcblx0XHRpZiAocmVtb3RlRW52Py51c2VySG9tZSkge1xuXHRcdFx0Y29uc3Qgc2FuZGJveFJvb3QgPSBVUkkuam9pblBhdGgocmVtb3RlRW52LnVzZXJIb21lLCB0aGlzLl9wcm9kdWN0U2VydmljZS5zZXJ2ZXJEYXRhRm9sZGVyTmFtZSA/PyB0aGlzLl9wcm9kdWN0U2VydmljZS5kYXRhRm9sZGVyTmFtZSwgU0FOREJPWF9URU1QX0RJUl9OQU1FKTtcblx0XHRcdHJldHVybiBzYW5kYm94VGVtcERpck5hbWUgPyBVUkkuam9pblBhdGgoc2FuZGJveFJvb3QsIHNhbmRib3hUZW1wRGlyTmFtZSkgOiBzYW5kYm94Um9vdDtcblx0XHR9XG5cblx0XHRjb25zdCBuYXRpdmVFbnYgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UgYXMgSUVudmlyb25tZW50U2VydmljZSAmIHsgdXNlckhvbWU/OiBVUkkgfTtcblx0XHRpZiAobmF0aXZlRW52LnVzZXJIb21lKSB7XG5cdFx0XHRjb25zdCBzYW5kYm94Um9vdCA9IFVSSS5qb2luUGF0aChuYXRpdmVFbnYudXNlckhvbWUsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmRhdGFGb2xkZXJOYW1lLCBTQU5EQk9YX1RFTVBfRElSX05BTUUpO1xuXHRcdFx0cmV0dXJuIHNhbmRib3hUZW1wRGlyTmFtZSA/IFVSSS5qb2luUGF0aChzYW5kYm94Um9vdCwgc2FuZGJveFRlbXBEaXJOYW1lKSA6IHNhbmRib3hSb290O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVdvcmtzcGFjZVN0b3JhZ2VSZWFkUm9vdCgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX3Jlc29sdmVSZW1vdGVFbnYoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VTdG9yYWdlSG9tZSA9IHJlbW90ZUVudj8ud29ya3NwYWNlU3RvcmFnZUhvbWUgPz8gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2VIb21lO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUlkID0gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuaWQ7XG5cdFx0cmV0dXJuIFVSSS5qb2luUGF0aCh3b3Jrc3BhY2VTdG9yYWdlSG9tZSwgd29ya3NwYWNlSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2FuZGJveFdpbmRvd1RlbXBEaXJOYW1lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgd29ya2JlbmNoRW52ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlIGFzIElFbnZpcm9ubWVudFNlcnZpY2UgJiB7IHdpbmRvdz86IHsgaWQ/OiBudW1iZXIgfSB9O1xuXHRcdGNvbnN0IHdpbmRvd0lkID0gd29ya2JlbmNoRW52LndpbmRvdz8uaWQ7XG5cdFx0cmV0dXJuIHR5cGVvZiB3aW5kb3dJZCA9PT0gJ251bWJlcicgPyBgdG1wX3ZzY29kZV8ke3dpbmRvd0lkfWAgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlU2FuZGJveERlcGVuZGVuY3lTdGF0dXMoKTogUHJvbWlzZTxJU2FuZGJveERlcGVuZGVuY3lTdGF0dXMgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuIGNvbm5lY3Rpb24ud2l0aENoYW5uZWwoU0FOREJPWF9IRUxQRVJfQ0hBTk5FTF9OQU1FLCBjaGFubmVsID0+IHtcblx0XHRcdFx0Y29uc3Qgc2FuZGJveEhlbHBlciA9IG5ldyBTYW5kYm94SGVscGVyQ2hhbm5lbENsaWVudChjaGFubmVsKTtcblx0XHRcdFx0cmV0dXJuIHNhbmRib3hIZWxwZXIuY2hlY2tTYW5kYm94RGVwZW5kZW5jaWVzKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NhbmRib3hIZWxwZXJTZXJ2aWNlLmNoZWNrU2FuZGJveERlcGVuZGVuY2llcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5KCk6IFByb21pc2U8SVdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiBjb25uZWN0aW9uLndpdGhDaGFubmVsKFNBTkRCT1hfSEVMUEVSX0NIQU5ORUxfTkFNRSwgY2hhbm5lbCA9PiB7XG5cdFx0XHRcdGNvbnN0IHNhbmRib3hIZWxwZXIgPSBuZXcgU2FuZGJveEhlbHBlckNoYW5uZWxDbGllbnQoY2hhbm5lbCk7XG5cdFx0XHRcdHJldHVybiBzYW5kYm94SGVscGVyLmdldFdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5KCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NhbmRib3hIZWxwZXJTZXJ2aWNlLmdldFdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlV2luZG93c014Y0Vudmlyb25tZW50KCk6IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuIGNvbm5lY3Rpb24ud2l0aENoYW5uZWwoU0FOREJPWF9IRUxQRVJfQ0hBTk5FTF9OQU1FLCBjaGFubmVsID0+IHtcblx0XHRcdFx0Y29uc3Qgc2FuZGJveEhlbHBlciA9IG5ldyBTYW5kYm94SGVscGVyQ2hhbm5lbENsaWVudChjaGFubmVsKTtcblx0XHRcdFx0cmV0dXJuIHNhbmRib3hIZWxwZXIuZ2V0V2luZG93c014Y0Vudmlyb25tZW50KCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NhbmRib3hIZWxwZXJTZXJ2aWNlLmdldFdpbmRvd3NNeGNFbnZpcm9ubWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVdpbmRvd3NNeGNTYW5kYm94UGF5bG9hZChjb21tYW5kTGluZTogc3RyaW5nLCBwb2xpY3k6IElXaW5kb3dzTXhjU2FuZGJveFBvbGljeSwgd29ya2luZ0RpcmVjdG9yeT86IHN0cmluZywgY29udGFpbmVyTmFtZT86IHN0cmluZywgY29udGFpbm1lbnQ/OiBJV2luZG93c014Y1BvbGljeUNvbnRhaW5tZW50KTogUHJvbWlzZTxJV2luZG93c014Y0NvbmZpZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gY29ubmVjdGlvbi53aXRoQ2hhbm5lbChTQU5EQk9YX0hFTFBFUl9DSEFOTkVMX05BTUUsIGNoYW5uZWwgPT4ge1xuXHRcdFx0XHRjb25zdCBzYW5kYm94SGVscGVyID0gbmV3IFNhbmRib3hIZWxwZXJDaGFubmVsQ2xpZW50KGNoYW5uZWwpO1xuXHRcdFx0XHRyZXR1cm4gc2FuZGJveEhlbHBlci5idWlsZFdpbmRvd3NNeGNTYW5kYm94UGF5bG9hZChjb21tYW5kTGluZSwgcG9saWN5LCB3b3JraW5nRGlyZWN0b3J5LCBjb250YWluZXJOYW1lLCBjb250YWlubWVudCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NhbmRib3hIZWxwZXJTZXJ2aWNlLmJ1aWxkV2luZG93c014Y1NhbmRib3hQYXlsb2FkKGNvbW1hbmRMaW5lLCBwb2xpY3ksIHdvcmtpbmdEaXJlY3RvcnksIGNvbnRhaW5lck5hbWUsIGNvbnRhaW5tZW50KTtcblx0fVxuXG5cdC8vIC0tLS0gd29ya2JlbmNoLW9ubHkgZmxvd3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBpbnN0YWxsTWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXMobWlzc2luZ0RlcGVuZGVuY2llczogc3RyaW5nW10sIHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG9wdGlvbnM6IElTYW5kYm94RGVwZW5kZW5jeUluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJU2FuZGJveERlcGVuZGVuY3lJbnN0YWxsUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc3RhdHVzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVNhbmRib3hEZXBlbmRlbmN5U3RhdHVzKCk7XG5cdFx0aWYgKCFzdGF0dXM/LmRlcGVuZGVuY3lJbnN0YWxsQ29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIHsgZXhpdENvZGU6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblx0XHRjb25zdCBkZXBzTGlzdCA9IG1pc3NpbmdEZXBlbmRlbmNpZXMubWFwKGRlcGVuZGVuY3kgPT4gdGhpcy5fcXVvdGVTaGVsbEFyZ3VtZW50KGRlcGVuZGVuY3kpKS5qb2luKCcgJyk7XG5cdFx0cmV0dXJuIHRoaXMuX3J1blNhbmRib3hQcmVyZXF1aXNpdGVDb21tYW5kKGAke3N0YXR1cy5kZXBlbmRlbmN5SW5zdGFsbENvbW1hbmR9ICR7ZGVwc0xpc3R9YCwgc2Vzc2lvblJlc291cmNlLCB0b2tlbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyBydW5TYW5kYm94UmVtZWRpYXRpb24ocmVtZWRpYXRpb246IFRlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24sIHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG9wdGlvbnM6IElTYW5kYm94RGVwZW5kZW5jeUluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJU2FuZGJveERlcGVuZGVuY3lJbnN0YWxsUmVzdWx0PiB7XG5cdFx0bGV0IGNvbW1hbmQ6IHN0cmluZztcblx0XHRzd2l0Y2ggKHJlbWVkaWF0aW9uKSB7XG5cdFx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24uRGlzYWJsZVVucHJpdmlsYWdlZHVzZXJuYW1lc3BhY2VSZXN0cmljdGlvbjpcblx0XHRcdFx0Y29tbWFuZCA9ICdzdWRvIHN5c2N0bCAtdyBrZXJuZWwuYXBwYXJtb3JfcmVzdHJpY3RfdW5wcml2aWxlZ2VkX3VzZXJucz0wJztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIHNhbmRib3ggcmVtZWRpYXRpb24nKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3J1blNhbmRib3hQcmVyZXF1aXNpdGVDb21tYW5kKGNvbW1hbmQsIHNlc3Npb25SZXNvdXJjZSwgdG9rZW4sIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuU2FuZGJveFByZXJlcXVpc2l0ZUNvbW1hbmQoY29tbWFuZDogc3RyaW5nLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBvcHRpb25zOiBJU2FuZGJveERlcGVuZGVuY3lJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SVNhbmRib3hEZXBlbmRlbmN5SW5zdGFsbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgb3B0aW9ucy5jcmVhdGVUZXJtaW5hbCgpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgdGhlIGluc3RhbGwgY29tbWFuZCB0byBmaW5pc2ggc28gdGhlIGNoYXQgY2FuIHByb2NlZWQgYXV0b21hdGljYWxseS5cblx0XHRsZXQgaW5zdGFsbENvbW1hbmRTZW50ID0gZmFsc2U7XG5cdFx0Y29uc3QgY29tcGxldGlvblByb21pc2UgPSBuZXcgUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRsZXQgcmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHJlc29sdmVPbmNlID0gKGNvZGU6IG51bWJlciB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoY29kZSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBhdHRhY2hMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZGV0ZWN0aW9uID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0XHRcdGlmIChkZXRlY3Rpb24pIHtcblx0XHRcdFx0XHRzdG9yZS5hZGQoZGV0ZWN0aW9uLm9uQ29tbWFuZEZpbmlzaGVkKGNtZCA9PiByZXNvbHZlT25jZShjbWQuZXhpdENvZGUpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGF0dGFjaExpc3RlbmVyKCk7XG5cdFx0XHRzdG9yZS5hZGQoaW5zdGFuY2UuY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ2FwYWJpbGl0eShlID0+IHtcblx0XHRcdFx0aWYgKGUuaWQgPT09IFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdFx0YXR0YWNoTGlzdGVuZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBIYW5kbGUgdGVybWluYWwgZGlzcG9zYWxcblx0XHRcdHN0b3JlLmFkZChpbnN0YW5jZS5vbkRpc3Bvc2VkKCgpID0+IHJlc29sdmVPbmNlKHVuZGVmaW5lZCkpKTtcblxuXHRcdFx0Ly8gSGFuZGxlIGNhbmNlbGxhdGlvblxuXHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHJlc29sdmVPbmNlKHVuZGVmaW5lZCkpKTtcblxuXHRcdFx0Ly8gU2FmZXR5IHRpbWVvdXQgXHUyMDE0IDUgbWludXRlcyBzaG91bGQgYmUgZW5vdWdoIGZvciBwYWNrYWdlIG9yIHN5c3RlbS1wb2xpY3kgcmVtZWRpYXRpb24uXG5cdFx0XHRjb25zdCBzYWZldHlUaW1lb3V0ID0gdGltZW91dCg1ICogNjAgKiAxMDAwKTtcblx0XHRcdHN0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHNhZmV0eVRpbWVvdXQuY2FuY2VsKCkgfSk7XG5cdFx0XHRzYWZldHlUaW1lb3V0LnRoZW4oKCkgPT4gcmVzb2x2ZU9uY2UodW5kZWZpbmVkKSk7XG5cblx0XHRcdGNvbnN0IHBhc3N3b3JkUHJvbXB0ID0gdGhpcy5fY3JlYXRlTWlzc2luZ0RlcGVuZGVuY3lQYXNzd29yZFByb21wdChzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdFx0Zm9jdXNUZXJtaW5hbDogKCkgPT4gb3B0aW9ucy5mb2N1c1Rlcm1pbmFsKGluc3RhbmNlKSxcblx0XHRcdFx0b25EaWRJbnB1dERhdGE6IGluc3RhbmNlLm9uRGlkSW5wdXREYXRhLFxuXHRcdFx0XHRvbkRpc3Bvc2VkOiBpbnN0YW5jZS5vbkRpc3Bvc2VkLFxuXHRcdFx0XHRkaWRTZW5kSW5zdGFsbENvbW1hbmQ6ICgpID0+IGluc3RhbGxDb21tYW5kU2VudCxcblx0XHRcdH0sIHRva2VuKTtcblx0XHRcdHN0b3JlLmFkZChwYXNzd29yZFByb21wdCk7XG5cdFx0fSk7XG5cblx0XHQvLyBTZW5kIHRoZSBjb21tYW5kIGFmdGVyIGxpc3RlbmVycyBhcmUgYXR0YWNoZWQgc28gd2UgbmV2ZXIgbWlzcyB0aGUgZXZlbnQuXG5cdFx0Ly8gU2V0IGluc3RhbGxDb21tYW5kU2VudCBvbmx5IGFmdGVyIHNlbmRUZXh0IGNvbXBsZXRlcyBiZWNhdXNlIHNlbmRUZXh0XG5cdFx0Ly8gZmlyZXMgb25EaWRJbnB1dERhdGEgaW50ZXJuYWxseSwgYW5kIHRoZSBwYXNzd29yZC1wcm9tcHQgbGlzdGVuZXIgd291bGRcblx0XHQvLyBkaXNtaXNzIHRoZSBlbGljaXRhdGlvbiBwcmVtYXR1cmVseSBpZiB0aGUgZmxhZyB3ZXJlIGFscmVhZHkgdHJ1ZS5cblx0XHRhd2FpdCBpbnN0YW5jZS5zZW5kVGV4dChjb21tYW5kLCB0cnVlKTtcblx0XHRpbnN0YWxsQ29tbWFuZFNlbnQgPSB0cnVlO1xuXG5cdFx0cmV0dXJuIHsgZXhpdENvZGU6IGF3YWl0IGNvbXBsZXRpb25Qcm9taXNlIH07XG5cdH1cblxuXHRwcml2YXRlIF9xdW90ZVNoZWxsQXJndW1lbnQodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAnJHt2YWx1ZS5yZXBsYWNlKC8nL2csIGAnXFxcXCcnYCl9J2A7XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgYSBjaGF0IGVsaWNpdGF0aW9uIHRoYXQga2VlcHMgdGhlIFwiSW5zdGFsbFwiIGZsb3cgZ3JvdW5kZWQgaW4gY2hhdCB3aGlsZVxuXHQgKiB0aGUgdXNlciBmb2N1c2VzIHRoZSB0ZXJtaW5hbCBhbmQgdHlwZXMgYSBzdWRvIHBhc3N3b3JkLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlTWlzc2luZ0RlcGVuZGVuY3lQYXNzd29yZFByb21wdChzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgcHJvbXB0Q29udGV4dDogSVNhbmRib3hEZXBlbmRlbmN5SW5zdGFsbFRlcm1pbmFsQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogRGlzcG9zYWJsZVN0b3JlIHtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBzZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghKGNoYXRNb2RlbCBpbnN0YW5jZW9mIENoYXRNb2RlbCkpIHtcblx0XHRcdHJldHVybiBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRpZiAoIXJlcXVlc3QpIHtcblx0XHRcdHJldHVybiBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFydCA9IG5ldyBDaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydChcblx0XHRcdGxvY2FsaXplKCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLnBhc3N3b3JkUHJvbXB0VGl0bGUnLCBcIlRoZSB0ZXJtaW5hbCBpcyBhd2FpdGluZyBpbnB1dC5cIiksXG5cdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoXG5cdFx0XHRcdCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLnBhc3N3b3JkUHJvbXB0TWVzc2FnZScsXG5cdFx0XHRcdFwiQXBwbHlpbmcgc2FuZGJveCBwcmVyZXF1aXNpdGVzIG1heSBwcm9tcHQgZm9yIHlvdXIgc3VkbyBwYXNzd29yZC4gU2VsZWN0IEZvY3VzIFRlcm1pbmFsIHRvIHR5cGUgaXQgaW4gdGhlIHRlcm1pbmFsLlwiXG5cdFx0XHQpKSxcblx0XHRcdCcnLFxuXHRcdFx0bG9jYWxpemUoJ3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMuZm9jdXNUZXJtaW5hbCcsICdGb2N1cyBUZXJtaW5hbCcpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBwcm9tcHRDb250ZXh0LmZvY3VzVGVybWluYWwoKTtcblx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuUGVuZGluZztcblx0XHRcdH1cblx0XHQpO1xuXHRcdGNoYXRNb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHBhcnQpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZGlzcG9zZVByb21wdCA9ICgpID0+IHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiBwYXJ0LmhpZGUoKSB9KTtcblx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoZGlzcG9zZVByb21wdCkpO1xuXHRcdHN0b3JlLmFkZChwcm9tcHRDb250ZXh0Lm9uRGlzcG9zZWQoZGlzcG9zZVByb21wdCkpO1xuXHRcdHN0b3JlLmFkZChwcm9tcHRDb250ZXh0Lm9uRGlkSW5wdXREYXRhKGRhdGEgPT4ge1xuXHRcdFx0aWYgKHByb21wdENvbnRleHQuZGlkU2VuZEluc3RhbGxDb21tYW5kKCkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGRpc3Bvc2VQcm9tcHQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7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QUM1QztBQUFBLEVBRVEsb0JBQW9CLE9BQXVCO0FBQ2xELFdBQU8sSUFBSSxNQUFNLFFBQVEsTUFBTSxPQUFPLENBQUM7QUFBQSxFQUN4QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSx1Q0FBdUMsaUJBQWtDLGVBQXlELE9BQTJDO0FBQ3BMLFVBQU0sWUFBWSxtQkFBbUIsS0FBSyxhQUFhLFdBQVcsZUFBZTtBQUNqRixRQUFJLEVBQUUscUJBQXFCLFlBQVk7QUFDdEMsYUFBTyxJQUFJLGdCQUFnQjtBQUFBLElBQzVCO0FBRUEsVUFBTSxVQUFVLFVBQVUsWUFBWSxFQUFFLEdBQUcsRUFBRTtBQUM3QyxRQUFJLENBQUMsU0FBUztBQUNiLGFBQU8sSUFBSSxnQkFBZ0I7QUFBQSxJQUM1QjtBQUVBLFVBQU0sT0FBTyxJQUFJO0FBQUEsTUFDaEIsU0FBUyxpREFBaUQsaUNBQWlDO0FBQUEsTUFDM0YsSUFBSSxlQUFlO0FBQUEsUUFDbEI7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsU0FBUywyQ0FBMkMsZ0JBQWdCO0FBQUEsTUFDcEU7QUFBQSxNQUNBLFlBQVk7QUFDWCxjQUFNLGNBQWMsY0FBYztBQUNsQyxlQUFPLGlCQUFpQjtBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUNBLGNBQVUsdUJBQXVCLFNBQVMsSUFBSTtBQUU5QyxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxnQkFBZ0IsTUFBTSxNQUFNLFFBQVE7QUFDMUMsVUFBTSxJQUFJLEVBQUUsU0FBUyxNQUFNLEtBQUssS0FBSyxFQUFFLENBQUM7QUFDeEMsVUFBTSxJQUFJLE1BQU0sd0JBQXdCLGFBQWEsQ0FBQztBQUN0RCxVQUFNLElBQUksY0FBYyxXQUFXLGFBQWEsQ0FBQztBQUNqRCxVQUFNLElBQUksY0FBYyxlQUFlLFVBQVE7QUFDOUMsVUFBSSxjQUFjLHNCQUFzQixLQUFLLEtBQUssU0FBUyxHQUFHO0FBQzdELHNCQUFjO0FBQUEsTUFDZjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsV0FBTztBQUFBLEVBQ1I7QUFFRDtBQTFXYSx5QkFBTjtBQUFBLEVBU0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FuQlU7IiwKICAibmFtZXMiOiBbIklUZXJtaW5hbFNhbmRib3hTZXJ2aWNlIiwgIlRlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24iXQp9Cg==
