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
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, dispose, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isMacintosh, isWindows, OperatingSystem, OS } from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { formatMessageForTerminal } from "../../../../platform/terminal/common/terminalStrings.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { getRemoteAuthority } from "../../../../platform/remote/common/remoteHosts.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { NaiveCwdDetectionCapability } from "../../../../platform/terminal/common/capabilities/naiveCwdDetectionCapability.js";
import { TerminalCapabilityStore } from "../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { FlowControlConstants, ITerminalLogService, ProcessPropertyType, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { TerminalRecorder } from "../../../../platform/terminal/common/terminalRecorder.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { EnvironmentVariableInfoChangesActive, EnvironmentVariableInfoStale } from "./environmentVariableInfo.js";
import { ITerminalConfigurationService, ITerminalInstanceService, ITerminalService } from "./terminal.js";
import { IEnvironmentVariableService } from "../common/environmentVariable.js";
import { MergedEnvironmentVariableCollection } from "../../../../platform/terminal/common/environmentVariableCollection.js";
import { serializeEnvironmentVariableCollections } from "../../../../platform/terminal/common/environmentVariableShared.js";
import { ITerminalProfileResolverService, ProcessState } from "../common/terminal.js";
import * as terminalEnvironment from "../common/terminalEnvironment.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { TaskSettingId } from "../../tasks/common/tasks.js";
import Severity from "../../../../base/common/severity.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { getActiveWindow, runWhenWindowIdle } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { shouldUseEnvironmentVariableCollection } from "../../../../platform/terminal/common/terminalEnvironment.js";
import { TerminalContribSettingId } from "../terminalContribExports.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { isString } from "../../../../base/common/types.js";
var ProcessConstants = /* @__PURE__ */ ((ProcessConstants2) => {
  ProcessConstants2[ProcessConstants2["ErrorLaunchThresholdDuration"] = 500] = "ErrorLaunchThresholdDuration";
  ProcessConstants2[ProcessConstants2["LatencyMeasuringInterval"] = 1e3] = "LatencyMeasuringInterval";
  return ProcessConstants2;
})(ProcessConstants || {});
var ProcessType = /* @__PURE__ */ ((ProcessType2) => {
  ProcessType2[ProcessType2["Process"] = 0] = "Process";
  ProcessType2[ProcessType2["PsuedoTerminal"] = 1] = "PsuedoTerminal";
  return ProcessType2;
})(ProcessType || {});
let TerminalProcessManager = class extends Disposable {
  constructor(_instanceId, cwd, environmentVariableCollections, shellIntegrationNonce, _historyService, _instantiationService, _logService, _workspaceContextService, _configurationResolverService, _workbenchEnvironmentService, _productService, _remoteAgentService, _pathService, _environmentVariableService, _terminalConfigurationService, _terminalProfileResolverService, _configurationService, _terminalInstanceService, _telemetryService, _notificationService, _accessibilityService, _terminalService) {
    super();
    this._instanceId = _instanceId;
    this._historyService = _historyService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._workspaceContextService = _workspaceContextService;
    this._configurationResolverService = _configurationResolverService;
    this._workbenchEnvironmentService = _workbenchEnvironmentService;
    this._productService = _productService;
    this._remoteAgentService = _remoteAgentService;
    this._pathService = _pathService;
    this._environmentVariableService = _environmentVariableService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._configurationService = _configurationService;
    this._terminalInstanceService = _terminalInstanceService;
    this._telemetryService = _telemetryService;
    this._notificationService = _notificationService;
    this._accessibilityService = _accessibilityService;
    this._terminalService = _terminalService;
    this.processState = ProcessState.Uninitialized;
    this.capabilities = this._register(new TerminalCapabilityStore());
    this.processReadyTimestamp = 0;
    this._isDisposed = false;
    this._process = null;
    this._processType = 0 /* Process */;
    this._preLaunchInputQueue = [];
    this._environmentVariableCollectionListener = this._register(new MutableDisposable());
    this._hasWrittenData = false;
    this._hasChildProcesses = false;
    this._ptyListenersAttached = false;
    this._isDisconnected = false;
    this._dimensions = { cols: 0, rows: 0 };
    this._onPtyDisconnect = this._register(new Emitter());
    this.onPtyDisconnect = this._onPtyDisconnect.event;
    this._onPtyReconnect = this._register(new Emitter());
    this.onPtyReconnect = this._onPtyReconnect.event;
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._onProcessReady.event;
    this._onProcessStateChange = this._register(new Emitter());
    this.onProcessStateChange = this._onProcessStateChange.event;
    this._onBeforeProcessData = this._register(new Emitter());
    this.onBeforeProcessData = this._onBeforeProcessData.event;
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._onProcessData.event;
    this._onProcessReplayComplete = this._register(new Emitter());
    this.onProcessReplayComplete = this._onProcessReplayComplete.event;
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._onEnvironmentVariableInfoChange = this._register(new Emitter());
    this.onEnvironmentVariableInfoChanged = this._onEnvironmentVariableInfoChange.event;
    this._onProcessExit = this._register(new Emitter());
    this.onProcessExit = this._onProcessExit.event;
    this._onRestoreCommands = this._register(new Emitter());
    this.onRestoreCommands = this._onRestoreCommands.event;
    this._cwdWorkspaceFolder = terminalEnvironment.getWorkspaceForTerminal(cwd, this._workspaceContextService, this._historyService);
    this.ptyProcessReady = this._createPtyProcessReadyPromise();
    this._ackDataBufferer = new AckDataBufferer((e) => this._process?.acknowledgeDataEvent(e));
    this._dataFilter = this._register(this._instantiationService.createInstance(SeamlessRelaunchDataFilter));
    this._register(this._dataFilter.onProcessData((ev) => {
      const data = isString(ev) ? ev : ev.data;
      const beforeProcessDataEvent = { data };
      this._onBeforeProcessData.fire(beforeProcessDataEvent);
      if (beforeProcessDataEvent.data && beforeProcessDataEvent.data.length > 0) {
        if (!isString(ev)) {
          ev.data = beforeProcessDataEvent.data;
        }
        this._onProcessData.fire(!isString(ev) ? ev : { data: beforeProcessDataEvent.data, trackCommit: false });
      }
    }));
    if (cwd && typeof cwd === "object") {
      this.remoteAuthority = getRemoteAuthority(cwd);
    } else {
      this.remoteAuthority = this._workbenchEnvironmentService.remoteAuthority;
    }
    if (environmentVariableCollections) {
      this._extEnvironmentVariableCollection = new MergedEnvironmentVariableCollection(environmentVariableCollections);
      this._environmentVariableCollectionListener.value = this._environmentVariableService.onDidChangeCollections((newCollection) => this._onEnvironmentVariableCollectionChange(newCollection));
      this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoChangesActive, this._extEnvironmentVariableCollection);
      this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
    }
    this.shellIntegrationNonce = shellIntegrationNonce ?? generateUuid();
  }
  get persistentProcessId() {
    return this._process?.id;
  }
  get shouldPersist() {
    return !!this.reconnectionProperties || (this._process ? this._process.shouldPersist : false);
  }
  get hasWrittenData() {
    return this._hasWrittenData;
  }
  get hasChildProcesses() {
    return this._hasChildProcesses;
  }
  get reconnectionProperties() {
    return this._shellLaunchConfig?.attachPersistentProcess?.reconnectionProperties || this._shellLaunchConfig?.reconnectionProperties || void 0;
  }
  get extEnvironmentVariableCollection() {
    return this._extEnvironmentVariableCollection;
  }
  get processTraits() {
    return this._processTraits;
  }
  async freePortKillProcess(port) {
    try {
      if (this._process?.freePortKillProcess) {
        await this._process?.freePortKillProcess(port);
      }
    } catch (e) {
      this._notificationService.notify({ message: localize("killportfailure", "Could not kill process listening on port {0}, command exited with error {1}", port, e), severity: Severity.Warning });
    }
  }
  dispose(immediate = false) {
    this._isDisposed = true;
    if (this._process) {
      this._setProcessState(ProcessState.KilledByUser);
      this._process.shutdown(immediate);
      this._process = null;
    }
    if (this._processListeners) {
      dispose(this._processListeners);
      this._processListeners = void 0;
    }
    super.dispose();
  }
  _createPtyProcessReadyPromise() {
    return new Promise((c) => {
      const listener = Event.once(this.onProcessReady)(() => {
        this._logService.debug(`Terminal process ready (shellProcessId: ${this.shellProcessId})`);
        this._store.delete(listener);
        c(void 0);
      });
      this._store.add(listener);
    });
  }
  async detachFromProcess(forcePersist) {
    await this._process?.detach?.(forcePersist);
    this._process = null;
  }
  async createProcess(shellLaunchConfig, cols, rows, reset = true) {
    this._shellLaunchConfig = shellLaunchConfig;
    this._dimensions.cols = cols;
    this._dimensions.rows = rows;
    let newProcess;
    if (shellLaunchConfig.customPtyImplementation) {
      this._processType = 1 /* PsuedoTerminal */;
      newProcess = shellLaunchConfig.customPtyImplementation(this._instanceId, cols, rows);
    } else {
      const backend = await this._terminalInstanceService.getBackend(this.remoteAuthority);
      if (!backend) {
        throw new Error(`No terminal backend registered for remote authority '${this.remoteAuthority}'`);
      }
      this.backend = backend;
      const envForResolver = { ...await this._terminalProfileResolverService.getEnvironment(this.remoteAuthority) };
      terminalEnvironment.mergeEnvironments(envForResolver, await backend.getShellEnvironment());
      const variableResolver = terminalEnvironment.createVariableResolver(this._cwdWorkspaceFolder, envForResolver, this._configurationResolverService);
      this.userHome = this._pathService.resolvedUserHome?.fsPath;
      this.os = OS;
      if (!!this.remoteAuthority) {
        const userHomeUri = await this._pathService.userHome();
        this.userHome = userHomeUri.path;
        const remoteEnv = await this._remoteAgentService.getEnvironment();
        if (!remoteEnv) {
          throw new Error(`Failed to get remote environment for remote authority "${this.remoteAuthority}"`);
        }
        this.userHome = remoteEnv.userHome.path;
        this.os = remoteEnv.os;
        const env = await this._resolveEnvironment(backend, variableResolver, shellLaunchConfig);
        const shouldPersist = (this._configurationService.getValue(TaskSettingId.Reconnection) && shellLaunchConfig.reconnectionProperties || !shellLaunchConfig.isFeatureTerminal) && this._terminalConfigurationService.config.enablePersistentSessions && !shellLaunchConfig.isTransient;
        if (shellLaunchConfig.attachPersistentProcess) {
          const result2 = await backend.attachToProcess(shellLaunchConfig.attachPersistentProcess.id);
          if (result2) {
            newProcess = result2;
          } else {
            this._logService.warn(`Attach to process failed for terminal`, shellLaunchConfig.attachPersistentProcess);
            shellLaunchConfig.attachPersistentProcess = void 0;
          }
        }
        if (!newProcess) {
          await this._terminalProfileResolverService.resolveShellLaunchConfig(shellLaunchConfig, {
            remoteAuthority: this.remoteAuthority,
            os: this.os
          });
          const options = {
            shellIntegration: {
              enabled: this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled),
              suggestEnabled: this._configurationService.getValue(TerminalContribSettingId.SuggestEnabled),
              nonce: this.shellIntegrationNonce
            },
            windowsUseConptyDll: this._terminalConfigurationService.config.windowsUseConptyDll ?? false,
            environmentVariableCollections: this._extEnvironmentVariableCollection?.collections ? serializeEnvironmentVariableCollections(this._extEnvironmentVariableCollection.collections) : void 0,
            workspaceFolder: this._cwdWorkspaceFolder,
            isScreenReaderOptimized: this._accessibilityService.isScreenReaderOptimized()
          };
          try {
            newProcess = await backend.createProcess(
              shellLaunchConfig,
              "",
              // TODO: Fix cwd
              cols,
              rows,
              this._terminalConfigurationService.config.unicodeVersion,
              env,
              // TODO:
              options,
              shouldPersist
            );
          } catch (e) {
            if (e?.message === "Could not fetch remote environment") {
              this._logService.trace(`Could not fetch remote environment, silently failing`);
              return void 0;
            }
            throw e;
          }
        }
        if (!this._isDisposed) {
          this._setupPtyHostListeners(backend);
        }
      } else {
        if (shellLaunchConfig.attachPersistentProcess) {
          const result2 = shellLaunchConfig.attachPersistentProcess.findRevivedId ? await backend.attachToRevivedProcess(shellLaunchConfig.attachPersistentProcess.id) : await backend.attachToProcess(shellLaunchConfig.attachPersistentProcess.id);
          if (result2) {
            newProcess = result2;
          } else {
            this._logService.warn(`Attach to process failed for terminal`, shellLaunchConfig.attachPersistentProcess);
            shellLaunchConfig.attachPersistentProcess = void 0;
          }
        }
        if (!newProcess) {
          newProcess = await this._launchLocalProcess(backend, shellLaunchConfig, cols, rows, this.userHome, variableResolver);
        }
        if (!this._isDisposed) {
          this._setupPtyHostListeners(backend);
        }
      }
    }
    if (this._isDisposed) {
      newProcess.shutdown(false);
      return void 0;
    }
    this._process = newProcess;
    this._setProcessState(ProcessState.Launching);
    if (this.os === OperatingSystem.Linux || this.os === OperatingSystem.Macintosh) {
      this.capabilities.add(TerminalCapability.NaiveCwdDetection, new NaiveCwdDetectionCapability(this._process));
    }
    this._dataFilter.newProcess(this._process, reset);
    if (this._processListeners) {
      dispose(this._processListeners);
    }
    this._processListeners = [
      newProcess.onProcessReady((e) => {
        this._logService.debug("onProcessReady", e);
        this._processTraits = e;
        this.shellProcessId = e.pid;
        this._initialCwd = e.cwd;
        this.processReadyTimestamp = Date.now();
        this._onDidChangeProperty.fire({ type: ProcessPropertyType.InitialCwd, value: this._initialCwd });
        this._onProcessReady.fire(e);
        if (this._preLaunchInputQueue.length > 0 && this._process) {
          this._logService.debug("sending prelaunch input queue", this._preLaunchInputQueue);
          newProcess.input(this._preLaunchInputQueue.join(""));
          this._preLaunchInputQueue.length = 0;
        }
      }),
      newProcess.onProcessExit((exitCode) => this._onExit(exitCode)),
      newProcess.onDidChangeProperty(({ type, value }) => {
        switch (type) {
          case ProcessPropertyType.HasChildProcesses:
            this._hasChildProcesses = value;
            break;
          case ProcessPropertyType.FailedShellIntegrationActivation:
            this._telemetryService?.publicLog2("terminal/shellIntegrationActivationFailureCustomArgs");
            break;
        }
        this._onDidChangeProperty.fire({ type, value });
      })
    ];
    if (newProcess.onProcessReplayComplete) {
      this._processListeners.push(newProcess.onProcessReplayComplete(() => this._onProcessReplayComplete.fire()));
    }
    if (newProcess.onRestoreCommands) {
      this._processListeners.push(newProcess.onRestoreCommands((e) => this._onRestoreCommands.fire(e)));
    }
    setTimeout(() => {
      if (this.processState === ProcessState.Launching) {
        this._setProcessState(ProcessState.Running);
      }
    }, 500 /* ErrorLaunchThresholdDuration */);
    const result = await newProcess.start();
    if (result) {
      return result;
    }
    runWhenWindowIdle(getActiveWindow(), () => {
      this.backend?.getLatency().then((measurements) => {
        this._logService.info(`Latency measurements for ${this.remoteAuthority ?? "local"} backend
${measurements.map((e) => `${e.label}: ${e.latency.toFixed(2)}ms`).join("\n")}`);
      });
    });
    return void 0;
  }
  async relaunch(shellLaunchConfig, cols, rows, reset) {
    this.ptyProcessReady = this._createPtyProcessReadyPromise();
    this._logService.trace(`Relaunching terminal instance ${this._instanceId}`);
    if (this._isDisconnected) {
      this._isDisconnected = false;
      this._onPtyReconnect.fire();
    }
    this._hasWrittenData = false;
    return this.createProcess(shellLaunchConfig, cols, rows, reset);
  }
  // Fetch any extension environment additions and apply them
  async _resolveEnvironment(backend, variableResolver, shellLaunchConfig) {
    const workspaceFolder = terminalEnvironment.getWorkspaceForTerminal(shellLaunchConfig.cwd, this._workspaceContextService, this._historyService);
    const platformKey = isWindows ? "windows" : isMacintosh ? "osx" : "linux";
    const envFromConfigValue = this._configurationService.getValue(`terminal.integrated.env.${platformKey}`);
    this._logService.debug(`Resolving environment (useShellEnvironment=${shellLaunchConfig.useShellEnvironment}, platformKey=${platformKey}, envFromConfig=${envFromConfigValue ? Object.keys(envFromConfigValue).join(",") : "none"})`);
    let baseEnv;
    if (shellLaunchConfig.useShellEnvironment) {
      const shellEnv = await backend.getShellEnvironment();
      if (!shellEnv) {
        throw new BugIndicatingError("Cannot fetch shell environment to use");
      }
      this._logService.debug(`Shell environment resolved with ${Object.keys(shellEnv).length} variables: ${Object.keys(shellEnv).sort().join(", ")}`);
      baseEnv = shellEnv;
    } else {
      baseEnv = await this._terminalProfileResolverService.getEnvironment(this.remoteAuthority);
      this._logService.debug(`Profile environment resolved with ${Object.keys(baseEnv).length} variables`);
    }
    const env = await terminalEnvironment.createTerminalEnvironment(shellLaunchConfig, envFromConfigValue, variableResolver, this._productService.version, this._terminalConfigurationService.config.detectLocale, baseEnv);
    this._logService.debug(`Terminal environment created with ${Object.keys(env).length} variables: ${Object.keys(env).sort().join(", ")}`);
    this._environmentVariableCollectionListener.clear();
    if (!this._isDisposed && shouldUseEnvironmentVariableCollection(shellLaunchConfig)) {
      this._extEnvironmentVariableCollection = this._environmentVariableService.mergedCollection;
      this._environmentVariableCollectionListener.value = this._environmentVariableService.onDidChangeCollections((newCollection) => this._onEnvironmentVariableCollectionChange(newCollection));
      await this._extEnvironmentVariableCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
      if (this._extEnvironmentVariableCollection.getVariableMap({ workspaceFolder }).size) {
        this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoChangesActive, this._extEnvironmentVariableCollection);
        this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
      }
    }
    return env;
  }
  async _launchLocalProcess(backend, shellLaunchConfig, cols, rows, userHome, variableResolver) {
    await this._terminalProfileResolverService.resolveShellLaunchConfig(shellLaunchConfig, {
      remoteAuthority: void 0,
      os: OS
    });
    const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(Schemas.file);
    const initialCwd = await terminalEnvironment.getCwd(
      shellLaunchConfig,
      userHome,
      variableResolver,
      activeWorkspaceRootUri,
      this._terminalConfigurationService.config.cwd,
      this._logService
    );
    const env = await this._resolveEnvironment(backend, variableResolver, shellLaunchConfig);
    const options = {
      shellIntegration: {
        enabled: this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled),
        suggestEnabled: this._configurationService.getValue(TerminalContribSettingId.SuggestEnabled),
        nonce: this.shellIntegrationNonce
      },
      windowsUseConptyDll: this._terminalConfigurationService.config.windowsUseConptyDll ?? false,
      environmentVariableCollections: this._extEnvironmentVariableCollection ? serializeEnvironmentVariableCollections(this._extEnvironmentVariableCollection.collections) : void 0,
      workspaceFolder: this._cwdWorkspaceFolder,
      isScreenReaderOptimized: this._accessibilityService.isScreenReaderOptimized()
    };
    const shouldPersist = (this._configurationService.getValue(TaskSettingId.Reconnection) && shellLaunchConfig.reconnectionProperties || !shellLaunchConfig.isFeatureTerminal) && this._terminalConfigurationService.config.enablePersistentSessions && !shellLaunchConfig.isTransient;
    return await backend.createProcess(shellLaunchConfig, initialCwd, cols, rows, this._terminalConfigurationService.config.unicodeVersion, env, options, shouldPersist);
  }
  _setupPtyHostListeners(backend) {
    if (this._ptyListenersAttached) {
      return;
    }
    this._ptyListenersAttached = true;
    this._register(backend.onPtyHostUnresponsive(() => {
      this._isDisconnected = true;
      this._onPtyDisconnect.fire();
    }));
    this._ptyResponsiveListener = backend.onPtyHostResponsive(() => {
      this._isDisconnected = false;
      this._onPtyReconnect.fire();
    });
    this._register(toDisposable(() => this._ptyResponsiveListener?.dispose()));
    this._register(backend.onPtyHostRestart(async () => {
      if (!this._isDisconnected) {
        this._isDisconnected = true;
        this._onPtyDisconnect.fire();
      }
      this._ptyResponsiveListener?.dispose();
      this._ptyResponsiveListener = void 0;
      if (this._shellLaunchConfig) {
        if (this._shellLaunchConfig.isFeatureTerminal && !this.reconnectionProperties) {
          this._onExit(-1);
        } else {
          const message = localize("ptyHostRelaunch", "Restarting the terminal because the connection to the shell process was lost...");
          let postRestartMessage = "";
          if (this.os === OperatingSystem.Windows && this._dimensions.rows > 0) {
            postRestartMessage = "\r\n".repeat(this._dimensions.rows - 1) + `\x1B[H`;
          }
          this._onProcessData.fire({ data: formatMessageForTerminal(message, { loudFormatting: true }) + postRestartMessage, trackCommit: false });
          await this.relaunch(this._shellLaunchConfig, this._dimensions.cols, this._dimensions.rows, false);
        }
      }
    }));
    this._register(toDisposable(() => {
      this.ptyProcessReady = void 0;
    }));
  }
  async getBackendOS() {
    let os = OS;
    if (!!this.remoteAuthority) {
      const remoteEnv = await this._remoteAgentService.getEnvironment();
      if (!remoteEnv) {
        throw new Error(`Failed to get remote environment for remote authority "${this.remoteAuthority}"`);
      }
      os = remoteEnv.os;
    }
    return os;
  }
  setDimensions(cols, rows, sync, pixelWidth, pixelHeight) {
    if (sync) {
      this._resize(cols, rows, pixelWidth, pixelHeight);
      return;
    }
    if (this._store.isDisposed) {
      return Promise.resolve();
    }
    if (!this.ptyProcessReady) {
      throw new Error("TerminalProcessManager.setDimensions called before initialization");
    }
    return this.ptyProcessReady.then(() => this._resize(cols, rows, pixelWidth, pixelHeight));
  }
  async setUnicodeVersion(version) {
    return this._process?.setUnicodeVersion(version);
  }
  async setNextCommandId(commandLine, commandId) {
    await this.ptyProcessReady;
    const process = this._process;
    if (!process?.id) {
      return;
    }
    await this._terminalService.setNextCommandId(process.id, commandLine, commandId);
  }
  _resize(cols, rows, pixelWidth, pixelHeight) {
    if (!this._process) {
      return;
    }
    try {
      this._process.resize(cols, rows, pixelWidth, pixelHeight);
    } catch (error) {
      if (error.code !== "EPIPE" && error.code !== "ERR_IPC_CHANNEL_CLOSED") {
        throw error;
      }
    }
    this._dimensions.cols = cols;
    this._dimensions.rows = rows;
  }
  async write(data) {
    await this.ptyProcessReady;
    this._dataFilter.disableSeamlessRelaunch();
    this._hasWrittenData = true;
    if (this.shellProcessId || this._processType === 1 /* PsuedoTerminal */) {
      if (this._process) {
        this._process.input(data);
      }
    } else {
      this._logService.debug("queueing data in prelaunch input queue", data);
      this._preLaunchInputQueue.push(data);
    }
  }
  async sendSignal(signal) {
    await this.ptyProcessReady;
    if (this._process) {
      this._process.sendSignal(signal);
    }
  }
  async processBinary(data) {
    await this.ptyProcessReady;
    this._dataFilter.disableSeamlessRelaunch();
    this._hasWrittenData = true;
    this._process?.processBinary(data);
  }
  get initialCwd() {
    return this._initialCwd ?? "";
  }
  async refreshProperty(type) {
    if (!this._process) {
      throw new Error("Cannot refresh property when process is not set");
    }
    return this._process.refreshProperty(type);
  }
  async updateProperty(type, value) {
    return this._process?.updateProperty(type, value);
  }
  acknowledgeDataEvent(charCount) {
    this._ackDataBufferer.ack(charCount);
  }
  _onExit(exitCode) {
    this._process = null;
    if (this.processState === ProcessState.Launching) {
      this._setProcessState(ProcessState.KilledDuringLaunch);
    }
    if (this.processState === ProcessState.Running) {
      this._setProcessState(ProcessState.KilledByProcess);
    }
    this._onProcessExit.fire(exitCode);
  }
  _setProcessState(state) {
    this.processState = state;
    this._onProcessStateChange.fire();
  }
  _onEnvironmentVariableCollectionChange(newCollection) {
    const diff = this._extEnvironmentVariableCollection.diff(newCollection, { workspaceFolder: this._cwdWorkspaceFolder });
    if (diff === void 0) {
      if (this.environmentVariableInfo instanceof EnvironmentVariableInfoStale) {
        this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoChangesActive, this._extEnvironmentVariableCollection);
        this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
      }
      return;
    }
    this.environmentVariableInfo = this._instantiationService.createInstance(EnvironmentVariableInfoStale, diff, this._instanceId, newCollection);
    this._onEnvironmentVariableInfoChange.fire(this.environmentVariableInfo);
  }
  async clearBuffer() {
    this._process?.clearBuffer?.();
  }
};
TerminalProcessManager = __decorateClass([
  __decorateParam(4, IHistoryService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ITerminalLogService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IConfigurationResolverService),
  __decorateParam(9, IWorkbenchEnvironmentService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IRemoteAgentService),
  __decorateParam(12, IPathService),
  __decorateParam(13, IEnvironmentVariableService),
  __decorateParam(14, ITerminalConfigurationService),
  __decorateParam(15, ITerminalProfileResolverService),
  __decorateParam(16, IConfigurationService),
  __decorateParam(17, ITerminalInstanceService),
  __decorateParam(18, ITelemetryService),
  __decorateParam(19, INotificationService),
  __decorateParam(20, IAccessibilityService),
  __decorateParam(21, ITerminalService)
], TerminalProcessManager);
class AckDataBufferer {
  constructor(_callback) {
    this._callback = _callback;
    this._unsentCharCount = 0;
  }
  ack(charCount) {
    this._unsentCharCount += charCount;
    while (this._unsentCharCount > FlowControlConstants.CharCountAckSize) {
      this._unsentCharCount -= FlowControlConstants.CharCountAckSize;
      this._callback(FlowControlConstants.CharCountAckSize);
    }
  }
}
var SeamlessRelaunchConstants = /* @__PURE__ */ ((SeamlessRelaunchConstants2) => {
  SeamlessRelaunchConstants2[SeamlessRelaunchConstants2["RecordTerminalDuration"] = 1e4] = "RecordTerminalDuration";
  SeamlessRelaunchConstants2[SeamlessRelaunchConstants2["SwapWaitMaximumDuration"] = 3e3] = "SwapWaitMaximumDuration";
  return SeamlessRelaunchConstants2;
})(SeamlessRelaunchConstants || {});
let SeamlessRelaunchDataFilter = class extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._firstDisposable = this._register(new MutableDisposable());
    this._secondDisposable = this._register(new MutableDisposable());
    this._dataListener = this._register(new MutableDisposable());
    this._disableSeamlessRelaunch = false;
    this._onProcessData = this._register(new Emitter());
  }
  get onProcessData() {
    return this._onProcessData.event;
  }
  newProcess(process, reset) {
    this._dataListener.clear();
    this._activeProcess?.shutdown(false);
    this._activeProcess = process;
    if (!this._firstRecorder || !reset || this._disableSeamlessRelaunch) {
      [this._firstRecorder, this._firstDisposable.value] = this._createRecorder(process);
      if (this._disableSeamlessRelaunch && reset) {
        this._onProcessData.fire("\x1Bc");
      }
      this._dataListener.value = process.onProcessData((e) => this._onProcessData.fire(e));
      this._disableSeamlessRelaunch = false;
      return;
    }
    if (this._secondRecorder) {
      this.triggerSwap();
    }
    this._swapTimeout = mainWindow.setTimeout(() => this.triggerSwap(), 3e3 /* SwapWaitMaximumDuration */);
    this._dataListener.clear();
    this._firstDisposable.clear();
    const recorder = this._createRecorder(process);
    [this._secondRecorder, this._secondDisposable.value] = recorder;
  }
  /**
   * Disables seamless relaunch for the active process
   */
  disableSeamlessRelaunch() {
    this._disableSeamlessRelaunch = true;
    this._stopRecording();
    this.triggerSwap();
  }
  /**
   * Trigger the swap of the processes if needed (eg. timeout, input)
   */
  triggerSwap() {
    if (this._swapTimeout) {
      mainWindow.clearTimeout(this._swapTimeout);
      this._swapTimeout = void 0;
    }
    if (!this._firstRecorder) {
      return;
    }
    if (!this._secondRecorder) {
      this._firstRecorder = void 0;
      this._firstDisposable.clear();
      return;
    }
    const firstData = this._getDataFromRecorder(this._firstRecorder);
    const secondData = this._getDataFromRecorder(this._secondRecorder);
    if (firstData === secondData) {
      this._logService.trace(`Seamless terminal relaunch - identical content`);
    } else {
      this._logService.trace(`Seamless terminal relaunch - resetting content`);
      this._onProcessData.fire({ data: `\x1Bc${secondData}`, trackCommit: false });
    }
    this._dataListener.value = this._activeProcess.onProcessData((e) => this._onProcessData.fire(e));
    this._firstRecorder = this._secondRecorder;
    this._firstDisposable.value = this._secondDisposable.value;
    this._secondRecorder = void 0;
  }
  _stopRecording() {
    if (this._swapTimeout) {
      return;
    }
    this._firstRecorder = void 0;
    this._firstDisposable.clear();
    this._secondRecorder = void 0;
    this._secondDisposable.clear();
  }
  _createRecorder(process) {
    const recorder = new TerminalRecorder(0, 0);
    const disposable = process.onProcessData((e) => recorder.handleData(isString(e) ? e : e.data));
    return [recorder, disposable];
  }
  _getDataFromRecorder(recorder) {
    return recorder.generateReplayEventSync().events.filter((e) => !!e.data).map((e) => e.data).join("");
  }
};
SeamlessRelaunchDataFilter = __decorateClass([
  __decorateParam(0, ITerminalLogService)
], SeamlessRelaunchDataFilter);
export {
  TerminalProcessManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbFByb2Nlc3NNYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzLCBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFJlbW90ZUF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlSG9zdHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBOYWl2ZUN3ZERldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL25haXZlQ3dkRGV0ZWN0aW9uQ2FwYWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvdGVybWluYWxDYXBhYmlsaXR5U3RvcmUuanMnO1xuaW1wb3J0IHsgRmxvd0NvbnRyb2xDb25zdGFudHMsIElUZXJtaW5hbExhdW5jaFJlc3VsdCwgSVByb2Nlc3NEYXRhRXZlbnQsIElQcm9jZXNzUHJvcGVydHksIElQcm9jZXNzUHJvcGVydHlNYXAsIElQcm9jZXNzUmVhZHlFdmVudCwgSVJlY29ubmVjdGlvblByb3BlcnRpZXMsIElTaGVsbExhdW5jaENvbmZpZywgSVRlcm1pbmFsQmFja2VuZCwgSVRlcm1pbmFsQ2hpbGRQcm9jZXNzLCBJVGVybWluYWxEaW1lbnNpb25zLCBJVGVybWluYWxFbnZpcm9ubWVudCwgSVRlcm1pbmFsTGF1bmNoRXJyb3IsIElUZXJtaW5hbExvZ1NlcnZpY2UsIElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLCBQcm9jZXNzUHJvcGVydHlUeXBlLCBUZXJtaW5hbFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFJlY29yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsUmVjb3JkZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2VzQWN0aXZlLCBFbnZpcm9ubWVudFZhcmlhYmxlSW5mb1N0YWxlIH0gZnJvbSAnLi9lbnZpcm9ubWVudFZhcmlhYmxlSW5mby5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8sIElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IHNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlU2hhcmVkLmpzJztcbmltcG9ydCB7IElCZWZvcmVQcm9jZXNzRGF0YUV2ZW50LCBJVGVybWluYWxQcm9jZXNzTWFuYWdlciwgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSwgUHJvY2Vzc1N0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCAqIGFzIHRlcm1pbmFsRW52aXJvbm1lbnQgZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsRW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUYXNrU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vdGFza3MvY29tbW9uL3Rhc2tzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiwgSU1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVXaW5kb3csIHJ1bldoZW5XaW5kb3dJZGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBzaG91bGRVc2VFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZCB9IGZyb20gJy4uL3Rlcm1pbmFsQ29udHJpYkV4cG9ydHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHR5cGUgeyBNYXliZVByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuY29uc3QgZW51bSBQcm9jZXNzQ29uc3RhbnRzIHtcblx0LyoqXG5cdCAqIFRoZSBhbW91bnQgb2YgdGltZSB0byBjb25zaWRlciB0ZXJtaW5hbCBlcnJvcnMgdG8gYmUgcmVsYXRlZCB0byB0aGUgbGF1bmNoLlxuXHQgKi9cblx0RXJyb3JMYXVuY2hUaHJlc2hvbGREdXJhdGlvbiA9IDUwMCxcblx0LyoqXG5cdCAqIFRoZSBtaW5pbXVtIGFtb3VudCBvZiB0aW1lIGJldHdlZW4gbGF0ZW5jeSByZXF1ZXN0cy5cblx0ICovXG5cdExhdGVuY3lNZWFzdXJpbmdJbnRlcnZhbCA9IDEwMDAsXG59XG5cbmNvbnN0IGVudW0gUHJvY2Vzc1R5cGUge1xuXHRQcm9jZXNzLFxuXHRQc3VlZG9UZXJtaW5hbFxufVxuXG4vKipcbiAqIEhvbGRzIGFsbCBzdGF0ZSByZWxhdGVkIHRvIHRoZSBjcmVhdGlvbiBhbmQgbWFuYWdlbWVudCBvZiB0ZXJtaW5hbCBwcm9jZXNzZXMuXG4gKlxuICogSW50ZXJuYWwgZGVmaW5pdGlvbnM6XG4gKiAtIFByb2Nlc3M6IFRoZSBwcm9jZXNzIGxhdW5jaGVkIHdpdGggdGhlIHRlcm1pbmFsUHJvY2Vzcy50cyBmaWxlLCBvciB0aGUgcHR5IGFzIGEgd2hvbGVcbiAqIC0gUHR5IFByb2Nlc3M6IFRoZSBwc2V1ZG90ZXJtaW5hbCBwYXJlbnQgcHJvY2VzcyAob3IgdGhlIGNvbnB0eSBhZ2VudCBwcm9jZXNzKVxuICogLSBTaGVsbCBQcm9jZXNzOiBUaGUgcHNldWRvdGVybWluYWwgY2hpbGQgcHJvY2VzcyAoaWUuIHRoZSBzaGVsbClcbiAqL1xuZXhwb3J0IGNsYXNzIFRlcm1pbmFsUHJvY2Vzc01hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlcm1pbmFsUHJvY2Vzc01hbmFnZXIge1xuXHRwcm9jZXNzU3RhdGU6IFByb2Nlc3NTdGF0ZSA9IFByb2Nlc3NTdGF0ZS5VbmluaXRpYWxpemVkO1xuXHRwdHlQcm9jZXNzUmVhZHk6IFByb21pc2U8dm9pZD47XG5cdHNoZWxsUHJvY2Vzc0lkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRvczogT3BlcmF0aW5nU3lzdGVtIHwgdW5kZWZpbmVkO1xuXHR1c2VySG9tZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRlbnZpcm9ubWVudFZhcmlhYmxlSW5mbzogSUVudmlyb25tZW50VmFyaWFibGVJbmZvIHwgdW5kZWZpbmVkO1xuXHRiYWNrZW5kOiBJVGVybWluYWxCYWNrZW5kIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjYXBhYmlsaXRpZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSk7XG5cdHJlYWRvbmx5IHNoZWxsSW50ZWdyYXRpb25Ob25jZTogc3RyaW5nO1xuXHRwcm9jZXNzUmVhZHlUaW1lc3RhbXA6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBfaXNEaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9wcm9jZXNzOiBJVGVybWluYWxDaGlsZFByb2Nlc3MgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfcHJvY2Vzc1R5cGU6IFByb2Nlc3NUeXBlID0gUHJvY2Vzc1R5cGUuUHJvY2Vzcztcblx0cHJpdmF0ZSBfcHJlTGF1bmNoSW5wdXRRdWV1ZTogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfaW5pdGlhbEN3ZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbjogSU1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbkxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSBfYWNrRGF0YUJ1ZmZlcmVyOiBBY2tEYXRhQnVmZmVyZXI7XG5cdHByaXZhdGUgX2hhc1dyaXR0ZW5EYXRhOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc0NoaWxkUHJvY2Vzc2VzOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3B0eVJlc3BvbnNpdmVMaXN0ZW5lcjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3B0eUxpc3RlbmVyc0F0dGFjaGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2RhdGFGaWx0ZXI6IFNlYW1sZXNzUmVsYXVuY2hEYXRhRmlsdGVyO1xuXHRwcml2YXRlIF9wcm9jZXNzTGlzdGVuZXJzPzogSURpc3Bvc2FibGVbXTtcblx0cHJpdmF0ZSBfaXNEaXNjb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIF9wcm9jZXNzVHJhaXRzOiBJUHJvY2Vzc1JlYWR5RXZlbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NoZWxsTGF1bmNoQ29uZmlnPzogSVNoZWxsTGF1bmNoQ29uZmlnO1xuXHRwcml2YXRlIF9kaW1lbnNpb25zOiBJVGVybWluYWxEaW1lbnNpb25zID0geyBjb2xzOiAwLCByb3dzOiAwIH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHlEaXNjb25uZWN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUHR5RGlzY29ubmVjdCA9IHRoaXMuX29uUHR5RGlzY29ubmVjdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHlSZWNvbm5lY3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25QdHlSZWNvbm5lY3QgPSB0aGlzLl9vblB0eVJlY29ubmVjdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NSZWFkeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcm9jZXNzUmVhZHlFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc1JlYWR5ID0gdGhpcy5fb25Qcm9jZXNzUmVhZHkuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc1N0YXRlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc1N0YXRlQ2hhbmdlID0gdGhpcy5fb25Qcm9jZXNzU3RhdGVDaGFuZ2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQmVmb3JlUHJvY2Vzc0RhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQmVmb3JlUHJvY2Vzc0RhdGFFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uQmVmb3JlUHJvY2Vzc0RhdGEgPSB0aGlzLl9vbkJlZm9yZVByb2Nlc3NEYXRhLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NEYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByb2Nlc3NEYXRhRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NEYXRhID0gdGhpcy5fb25Qcm9jZXNzRGF0YS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVwbGF5Q29tcGxldGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzUmVwbGF5Q29tcGxldGUgPSB0aGlzLl9vblByb2Nlc3NSZXBsYXlDb21wbGV0ZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQcm9wZXJ0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcm9jZXNzUHJvcGVydHk+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb3BlcnR5ID0gdGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25FbnZpcm9ubWVudFZhcmlhYmxlSW5mb0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFbnZpcm9ubWVudFZhcmlhYmxlSW5mbz4oKSk7XG5cdHJlYWRvbmx5IG9uRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2VkID0gdGhpcy5fb25FbnZpcm9ubWVudFZhcmlhYmxlSW5mb0NoYW5nZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzRXhpdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc0V4aXQgPSB0aGlzLl9vblByb2Nlc3NFeGl0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlc3RvcmVDb21tYW5kcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXJpYWxpemVkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk+KCkpO1xuXHRyZWFkb25seSBvblJlc3RvcmVDb21tYW5kcyA9IHRoaXMuX29uUmVzdG9yZUNvbW1hbmRzLmV2ZW50O1xuXHRwcml2YXRlIF9jd2RXb3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IHBlcnNpc3RlbnRQcm9jZXNzSWQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3M/LmlkOyB9XG5cdGdldCBzaG91bGRQZXJzaXN0KCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLnJlY29ubmVjdGlvblByb3BlcnRpZXMgfHwgKHRoaXMuX3Byb2Nlc3MgPyB0aGlzLl9wcm9jZXNzLnNob3VsZFBlcnNpc3QgOiBmYWxzZSk7IH1cblx0Z2V0IGhhc1dyaXR0ZW5EYXRhKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGFzV3JpdHRlbkRhdGE7IH1cblx0Z2V0IGhhc0NoaWxkUHJvY2Vzc2VzKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGFzQ2hpbGRQcm9jZXNzZXM7IH1cblx0Z2V0IHJlY29ubmVjdGlvblByb3BlcnRpZXMoKTogSVJlY29ubmVjdGlvblByb3BlcnRpZXMgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc2hlbGxMYXVuY2hDb25maWc/LmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzIHx8IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnPy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzIHx8IHVuZGVmaW5lZDsgfVxuXHRnZXQgZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oKTogSU1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uOyB9XG5cdGdldCBwcm9jZXNzVHJhaXRzKCk6IElQcm9jZXNzUmVhZHlFdmVudCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wcm9jZXNzVHJhaXRzOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5zdGFuY2VJZDogbnVtYmVyLFxuXHRcdGN3ZDogc3RyaW5nIHwgVVJJIHwgdW5kZWZpbmVkLFxuXHRcdGVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uczogUmVhZG9ubHlNYXA8c3RyaW5nLCBJRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24+IHwgdW5kZWZpbmVkLFxuXHRcdHNoZWxsSW50ZWdyYXRpb25Ob25jZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJSGlzdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeVNlcnZpY2U6IElIaXN0b3J5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtiZW5jaEVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlOiBJRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEluc3RhbmNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEluc3RhbmNlU2VydmljZTogSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2N3ZFdvcmtzcGFjZUZvbGRlciA9IHRlcm1pbmFsRW52aXJvbm1lbnQuZ2V0V29ya3NwYWNlRm9yVGVybWluYWwoY3dkLCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZSwgdGhpcy5faGlzdG9yeVNlcnZpY2UpO1xuXHRcdHRoaXMucHR5UHJvY2Vzc1JlYWR5ID0gdGhpcy5fY3JlYXRlUHR5UHJvY2Vzc1JlYWR5UHJvbWlzZSgpO1xuXHRcdHRoaXMuX2Fja0RhdGFCdWZmZXJlciA9IG5ldyBBY2tEYXRhQnVmZmVyZXIoZSA9PiB0aGlzLl9wcm9jZXNzPy5hY2tub3dsZWRnZURhdGFFdmVudChlKSk7XG5cdFx0dGhpcy5fZGF0YUZpbHRlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYW1sZXNzUmVsYXVuY2hEYXRhRmlsdGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGF0YUZpbHRlci5vblByb2Nlc3NEYXRhKGV2ID0+IHtcblx0XHRcdGNvbnN0IGRhdGEgPSAoaXNTdHJpbmcoZXYpID8gZXYgOiBldi5kYXRhKTtcblx0XHRcdGNvbnN0IGJlZm9yZVByb2Nlc3NEYXRhRXZlbnQ6IElCZWZvcmVQcm9jZXNzRGF0YUV2ZW50ID0geyBkYXRhIH07XG5cdFx0XHR0aGlzLl9vbkJlZm9yZVByb2Nlc3NEYXRhLmZpcmUoYmVmb3JlUHJvY2Vzc0RhdGFFdmVudCk7XG5cdFx0XHRpZiAoYmVmb3JlUHJvY2Vzc0RhdGFFdmVudC5kYXRhICYmIGJlZm9yZVByb2Nlc3NEYXRhRXZlbnQuZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdC8vIFRoaXMgZXZlbnQgaXMgdXNlZCBieSB0aGUgY2FsbGVyIHNvIHRoZSBvYmplY3QgbXVzdCBiZSByZXVzZWRcblx0XHRcdFx0aWYgKCFpc1N0cmluZyhldikpIHtcblx0XHRcdFx0XHRldi5kYXRhID0gYmVmb3JlUHJvY2Vzc0RhdGFFdmVudC5kYXRhO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29uUHJvY2Vzc0RhdGEuZmlyZSghaXNTdHJpbmcoZXYpID8gZXYgOiB7IGRhdGE6IGJlZm9yZVByb2Nlc3NEYXRhRXZlbnQuZGF0YSwgdHJhY2tDb21taXQ6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChjd2QgJiYgdHlwZW9mIGN3ZCA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHRoaXMucmVtb3RlQXV0aG9yaXR5ID0gZ2V0UmVtb3RlQXV0aG9yaXR5KGN3ZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5fd29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHR9XG5cblx0XHRpZiAoZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKSB7XG5cdFx0XHR0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMpO1xuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25MaXN0ZW5lci52YWx1ZSA9IHRoaXMuX2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29sbGVjdGlvbnMobmV3Q29sbGVjdGlvbiA9PiB0aGlzLl9vbkVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uQ2hhbmdlKG5ld0NvbGxlY3Rpb24pKTtcblx0XHRcdHRoaXMuZW52aXJvbm1lbnRWYXJpYWJsZUluZm8gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbnZpcm9ubWVudFZhcmlhYmxlSW5mb0NoYW5nZXNBY3RpdmUsIHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKTtcblx0XHRcdHRoaXMuX29uRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2UuZmlyZSh0aGlzLmVudmlyb25tZW50VmFyaWFibGVJbmZvKTtcblx0XHR9XG5cblx0XHR0aGlzLnNoZWxsSW50ZWdyYXRpb25Ob25jZSA9IHNoZWxsSW50ZWdyYXRpb25Ob25jZSA/PyBnZW5lcmF0ZVV1aWQoKTtcblx0fVxuXG5cdGFzeW5jIGZyZWVQb3J0S2lsbFByb2Nlc3MocG9ydDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLl9wcm9jZXNzPy5mcmVlUG9ydEtpbGxQcm9jZXNzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3M/LmZyZWVQb3J0S2lsbFByb2Nlc3MocG9ydCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoeyBtZXNzYWdlOiBsb2NhbGl6ZSgna2lsbHBvcnRmYWlsdXJlJywgJ0NvdWxkIG5vdCBraWxsIHByb2Nlc3MgbGlzdGVuaW5nIG9uIHBvcnQgezB9LCBjb21tYW5kIGV4aXRlZCB3aXRoIGVycm9yIHsxfScsIHBvcnQsIGUpLCBzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyB9KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKGltbWVkaWF0ZTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0aWYgKHRoaXMuX3Byb2Nlc3MpIHtcblx0XHRcdC8vIElmIHRoZSBwcm9jZXNzIHdhcyBzdGlsbCBjb25uZWN0ZWQgdGhpcyBkaXNwb3NlIGNhbWUgZnJvbVxuXHRcdFx0Ly8gd2l0aGluIFZTIENvZGUsIG5vdCB0aGUgcHJvY2Vzcywgc28gbWFyayB0aGUgcHJvY2VzcyBhc1xuXHRcdFx0Ly8ga2lsbGVkIGJ5IHRoZSB1c2VyLlxuXHRcdFx0dGhpcy5fc2V0UHJvY2Vzc1N0YXRlKFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVVzZXIpO1xuXHRcdFx0dGhpcy5fcHJvY2Vzcy5zaHV0ZG93bihpbW1lZGlhdGUpO1xuXHRcdFx0dGhpcy5fcHJvY2VzcyA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9wcm9jZXNzTGlzdGVuZXJzKSB7XG5cdFx0XHRkaXNwb3NlKHRoaXMuX3Byb2Nlc3NMaXN0ZW5lcnMpO1xuXHRcdFx0dGhpcy5fcHJvY2Vzc0xpc3RlbmVycyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUHR5UHJvY2Vzc1JlYWR5UHJvbWlzZSgpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihjID0+IHtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gRXZlbnQub25jZSh0aGlzLm9uUHJvY2Vzc1JlYWR5KSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFRlcm1pbmFsIHByb2Nlc3MgcmVhZHkgKHNoZWxsUHJvY2Vzc0lkOiAke3RoaXMuc2hlbGxQcm9jZXNzSWR9KWApO1xuXHRcdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUobGlzdGVuZXIpO1xuXHRcdFx0XHRjKHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3N0b3JlLmFkZChsaXN0ZW5lcik7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBkZXRhY2hGcm9tUHJvY2Vzcyhmb3JjZVBlcnNpc3Q/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcHJvY2Vzcz8uZGV0YWNoPy4oZm9yY2VQZXJzaXN0KTtcblx0XHR0aGlzLl9wcm9jZXNzID0gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVByb2Nlc3MoXG5cdFx0c2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0XHRjb2xzOiBudW1iZXIsXG5cdFx0cm93czogbnVtYmVyLFxuXHRcdHJlc2V0OiBib29sZWFuID0gdHJ1ZVxuXHQpOiBQcm9taXNlPElUZXJtaW5hbExhdW5jaEVycm9yIHwgSVRlcm1pbmFsTGF1bmNoUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5fc2hlbGxMYXVuY2hDb25maWcgPSBzaGVsbExhdW5jaENvbmZpZztcblx0XHR0aGlzLl9kaW1lbnNpb25zLmNvbHMgPSBjb2xzO1xuXHRcdHRoaXMuX2RpbWVuc2lvbnMucm93cyA9IHJvd3M7XG5cblx0XHRsZXQgbmV3UHJvY2VzczogSVRlcm1pbmFsQ2hpbGRQcm9jZXNzIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uKSB7XG5cdFx0XHR0aGlzLl9wcm9jZXNzVHlwZSA9IFByb2Nlc3NUeXBlLlBzdWVkb1Rlcm1pbmFsO1xuXHRcdFx0bmV3UHJvY2VzcyA9IHNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uKHRoaXMuX2luc3RhbmNlSWQsIGNvbHMsIHJvd3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBiYWNrZW5kID0gYXdhaXQgdGhpcy5fdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuZ2V0QmFja2VuZCh0aGlzLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRpZiAoIWJhY2tlbmQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyB0ZXJtaW5hbCBiYWNrZW5kIHJlZ2lzdGVyZWQgZm9yIHJlbW90ZSBhdXRob3JpdHkgJyR7dGhpcy5yZW1vdGVBdXRob3JpdHl9J2ApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5iYWNrZW5kID0gYmFja2VuZDtcblxuXHRcdFx0Ly8gQ3JlYXRlIHZhcmlhYmxlIHJlc29sdmVyXG5cdFx0XHQvLyBTdGFydCB3aXRoIHRoZSBmdWxsIGJhc2UgZW52aXJvbm1lbnQgc28gdGhhdCBhbGwgc3RhbmRhcmQgdmFyaWFibGVzIChlLmcuIFBBVEgpIGFyZVxuXHRcdFx0Ly8gYXZhaWxhYmxlLCB0aGVuIG92ZXJsYXkgdGhlIHNoZWxsIGVudmlyb25tZW50IG9uIHRvcCBzbyB0aGF0IGxhdW5jaCBjb25maWd1cmF0aW9uXG5cdFx0XHQvLyB2YXJpYWJsZXMgYW5kIHNoZWxsLXByb2ZpbGUgbW9kaWZpY2F0aW9ucyB0YWtlIHByZWNlZGVuY2UuXG5cdFx0XHRjb25zdCBlbnZGb3JSZXNvbHZlciA9IHsgLi4uYXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLmdldEVudmlyb25tZW50KHRoaXMucmVtb3RlQXV0aG9yaXR5KSB9O1xuXHRcdFx0dGVybWluYWxFbnZpcm9ubWVudC5tZXJnZUVudmlyb25tZW50cyhlbnZGb3JSZXNvbHZlciwgYXdhaXQgYmFja2VuZC5nZXRTaGVsbEVudmlyb25tZW50KCkpO1xuXHRcdFx0Y29uc3QgdmFyaWFibGVSZXNvbHZlciA9IHRlcm1pbmFsRW52aXJvbm1lbnQuY3JlYXRlVmFyaWFibGVSZXNvbHZlcih0aGlzLl9jd2RXb3Jrc3BhY2VGb2xkZXIsIGVudkZvclJlc29sdmVyLCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlKTtcblxuXHRcdFx0Ly8gcmVzb2x2ZWRVc2VySG9tZSBpcyBuZWVkZWQgaGVyZSBhcyByZW1vdGUgcmVzb2x2ZXJzIGNhbiBsYXVuY2ggbG9jYWwgdGVybWluYWxzIGJlZm9yZVxuXHRcdFx0Ly8gdGhleSdyZSBjb25uZWN0ZWQgdG8gdGhlIHJlbW90ZS5cblx0XHRcdHRoaXMudXNlckhvbWUgPSB0aGlzLl9wYXRoU2VydmljZS5yZXNvbHZlZFVzZXJIb21lPy5mc1BhdGg7XG5cdFx0XHR0aGlzLm9zID0gT1M7XG5cdFx0XHRpZiAoISF0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXG5cdFx0XHRcdGNvbnN0IHVzZXJIb21lVXJpID0gYXdhaXQgdGhpcy5fcGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRcdFx0dGhpcy51c2VySG9tZSA9IHVzZXJIb21lVXJpLnBhdGg7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdFx0XHRpZiAoIXJlbW90ZUVudikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGdldCByZW1vdGUgZW52aXJvbm1lbnQgZm9yIHJlbW90ZSBhdXRob3JpdHkgXCIke3RoaXMucmVtb3RlQXV0aG9yaXR5fVwiYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51c2VySG9tZSA9IHJlbW90ZUVudi51c2VySG9tZS5wYXRoO1xuXHRcdFx0XHR0aGlzLm9zID0gcmVtb3RlRW52Lm9zO1xuXG5cdFx0XHRcdC8vIHRoaXMgaXMgYSBjb3B5IG9mIHdoYXQgdGhlIG1lcmdlZCBlbnZpcm9ubWVudCBjb2xsZWN0aW9uIGlzIG9uIHRoZSByZW1vdGUgc2lkZVxuXHRcdFx0XHRjb25zdCBlbnYgPSBhd2FpdCB0aGlzLl9yZXNvbHZlRW52aXJvbm1lbnQoYmFja2VuZCwgdmFyaWFibGVSZXNvbHZlciwgc2hlbGxMYXVuY2hDb25maWcpO1xuXHRcdFx0XHRjb25zdCBzaG91bGRQZXJzaXN0ID0gKCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrU2V0dGluZ0lkLlJlY29ubmVjdGlvbikgJiYgc2hlbGxMYXVuY2hDb25maWcucmVjb25uZWN0aW9uUHJvcGVydGllcykgfHwgIXNoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsKSAmJiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnMgJiYgIXNoZWxsTGF1bmNoQ29uZmlnLmlzVHJhbnNpZW50O1xuXHRcdFx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MpIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBiYWNrZW5kLmF0dGFjaFRvUHJvY2VzcyhzaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5pZCk7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdFx0bmV3UHJvY2VzcyA9IHJlc3VsdDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gV2FybiBhbmQganVzdCBjcmVhdGUgYSBuZXcgdGVybWluYWwgaWYgYXR0YWNoIGZhaWxlZCBmb3Igc29tZSByZWFzb25cblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgQXR0YWNoIHRvIHByb2Nlc3MgZmFpbGVkIGZvciB0ZXJtaW5hbGAsIHNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzKTtcblx0XHRcdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIW5ld1Byb2Nlc3MpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UucmVzb2x2ZVNoZWxsTGF1bmNoQ29uZmlnKHNoZWxsTGF1bmNoQ29uZmlnLCB7XG5cdFx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0XHRcdFx0b3M6IHRoaXMub3Ncblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb25zdCBvcHRpb25zOiBJVGVybWluYWxQcm9jZXNzT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRcdHNoZWxsSW50ZWdyYXRpb246IHtcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWQpLFxuXHRcdFx0XHRcdFx0XHRzdWdnZXN0RW5hYmxlZDogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxDb250cmliU2V0dGluZ0lkLlN1Z2dlc3RFbmFibGVkKSxcblx0XHRcdFx0XHRcdFx0bm9uY2U6IHRoaXMuc2hlbGxJbnRlZ3JhdGlvbk5vbmNlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0d2luZG93c1VzZUNvbnB0eURsbDogdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcud2luZG93c1VzZUNvbnB0eURsbCA/PyBmYWxzZSxcblx0XHRcdFx0XHRcdGVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uczogdGhpcy5fZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24/LmNvbGxlY3Rpb25zID8gc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLmNvbGxlY3Rpb25zKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlcjogdGhpcy5fY3dkV29ya3NwYWNlRm9sZGVyLFxuXHRcdFx0XHRcdFx0aXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQ6IHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKClcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRuZXdQcm9jZXNzID0gYXdhaXQgYmFja2VuZC5jcmVhdGVQcm9jZXNzKFxuXHRcdFx0XHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZyxcblx0XHRcdFx0XHRcdFx0JycsIC8vIFRPRE86IEZpeCBjd2Rcblx0XHRcdFx0XHRcdFx0Y29scyxcblx0XHRcdFx0XHRcdFx0cm93cyxcblx0XHRcdFx0XHRcdFx0dGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcudW5pY29kZVZlcnNpb24sXG5cdFx0XHRcdFx0XHRcdGVudiwgLy8gVE9ETzpcblx0XHRcdFx0XHRcdFx0b3B0aW9ucyxcblx0XHRcdFx0XHRcdFx0c2hvdWxkUGVyc2lzdFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRpZiAoZT8ubWVzc2FnZSA9PT0gJ0NvdWxkIG5vdCBmZXRjaCByZW1vdGUgZW52aXJvbm1lbnQnKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYENvdWxkIG5vdCBmZXRjaCByZW1vdGUgZW52aXJvbm1lbnQsIHNpbGVudGx5IGZhaWxpbmdgKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghdGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3NldHVwUHR5SG9zdExpc3RlbmVycyhiYWNrZW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuZmluZFJldml2ZWRJZCA/IGF3YWl0IGJhY2tlbmQuYXR0YWNoVG9SZXZpdmVkUHJvY2VzcyhzaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5pZCkgOiBhd2FpdCBiYWNrZW5kLmF0dGFjaFRvUHJvY2VzcyhzaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5pZCk7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdFx0bmV3UHJvY2VzcyA9IHJlc3VsdDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gV2FybiBhbmQganVzdCBjcmVhdGUgYSBuZXcgdGVybWluYWwgaWYgYXR0YWNoIGZhaWxlZCBmb3Igc29tZSByZWFzb25cblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgQXR0YWNoIHRvIHByb2Nlc3MgZmFpbGVkIGZvciB0ZXJtaW5hbGAsIHNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzKTtcblx0XHRcdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIW5ld1Byb2Nlc3MpIHtcblx0XHRcdFx0XHRuZXdQcm9jZXNzID0gYXdhaXQgdGhpcy5fbGF1bmNoTG9jYWxQcm9jZXNzKGJhY2tlbmQsIHNoZWxsTGF1bmNoQ29uZmlnLCBjb2xzLCByb3dzLCB0aGlzLnVzZXJIb21lLCB2YXJpYWJsZVJlc29sdmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXR1cFB0eUhvc3RMaXN0ZW5lcnMoYmFja2VuZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgcHJvY2VzcyB3YXMgZGlzcG9zZWQgZHVyaW5nIGl0cyBjcmVhdGlvbiwgc2h1dCBpdCBkb3duIGFuZCByZXR1cm4gZmFpbHVyZVxuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRuZXdQcm9jZXNzLnNodXRkb3duKGZhbHNlKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJvY2VzcyA9IG5ld1Byb2Nlc3M7XG5cdFx0dGhpcy5fc2V0UHJvY2Vzc1N0YXRlKFByb2Nlc3NTdGF0ZS5MYXVuY2hpbmcpO1xuXG5cdFx0Ly8gQWRkIGFueSBjYXBhYmlsaXRpZXMgaW5oZXJlbnQgdG8gdGhlIGJhY2tlbmRcblx0XHRpZiAodGhpcy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4IHx8IHRoaXMub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpIHtcblx0XHRcdHRoaXMuY2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuTmFpdmVDd2REZXRlY3Rpb24sIG5ldyBOYWl2ZUN3ZERldGVjdGlvbkNhcGFiaWxpdHkodGhpcy5fcHJvY2VzcykpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RhdGFGaWx0ZXIubmV3UHJvY2Vzcyh0aGlzLl9wcm9jZXNzLCByZXNldCk7XG5cblx0XHRpZiAodGhpcy5fcHJvY2Vzc0xpc3RlbmVycykge1xuXHRcdFx0ZGlzcG9zZSh0aGlzLl9wcm9jZXNzTGlzdGVuZXJzKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvY2Vzc0xpc3RlbmVycyA9IFtcblx0XHRcdG5ld1Byb2Nlc3Mub25Qcm9jZXNzUmVhZHkoKGU6IElQcm9jZXNzUmVhZHlFdmVudCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdvblByb2Nlc3NSZWFkeScsIGUpO1xuXHRcdFx0XHR0aGlzLl9wcm9jZXNzVHJhaXRzID0gZTtcblx0XHRcdFx0dGhpcy5zaGVsbFByb2Nlc3NJZCA9IGUucGlkO1xuXHRcdFx0XHR0aGlzLl9pbml0aWFsQ3dkID0gZS5jd2Q7XG5cdFx0XHRcdHRoaXMucHJvY2Vzc1JlYWR5VGltZXN0YW1wID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5Jbml0aWFsQ3dkLCB2YWx1ZTogdGhpcy5faW5pdGlhbEN3ZCB9KTtcblx0XHRcdFx0dGhpcy5fb25Qcm9jZXNzUmVhZHkuZmlyZShlKTtcblxuXHRcdFx0XHRpZiAodGhpcy5fcHJlTGF1bmNoSW5wdXRRdWV1ZS5sZW5ndGggPiAwICYmIHRoaXMuX3Byb2Nlc3MpIHtcblx0XHRcdFx0XHQvLyBTZW5kIGFueSBxdWV1ZWQgZGF0YSB0aGF0J3Mgd2FpdGluZ1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ3NlbmRpbmcgcHJlbGF1bmNoIGlucHV0IHF1ZXVlJywgdGhpcy5fcHJlTGF1bmNoSW5wdXRRdWV1ZSk7XG5cdFx0XHRcdFx0bmV3UHJvY2Vzcy5pbnB1dCh0aGlzLl9wcmVMYXVuY2hJbnB1dFF1ZXVlLmpvaW4oJycpKTtcblx0XHRcdFx0XHR0aGlzLl9wcmVMYXVuY2hJbnB1dFF1ZXVlLmxlbmd0aCA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0bmV3UHJvY2Vzcy5vblByb2Nlc3NFeGl0KGV4aXRDb2RlID0+IHRoaXMuX29uRXhpdChleGl0Q29kZSkpLFxuXHRcdFx0bmV3UHJvY2Vzcy5vbkRpZENoYW5nZVByb3BlcnR5KCh7IHR5cGUsIHZhbHVlIH0pID0+IHtcblx0XHRcdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSBQcm9jZXNzUHJvcGVydHlUeXBlLkhhc0NoaWxkUHJvY2Vzc2VzOlxuXHRcdFx0XHRcdFx0dGhpcy5faGFzQ2hpbGRQcm9jZXNzZXMgPSB2YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuSGFzQ2hpbGRQcm9jZXNzZXNdO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBQcm9jZXNzUHJvcGVydHlUeXBlLkZhaWxlZFNoZWxsSW50ZWdyYXRpb25BY3RpdmF0aW9uOlxuXHRcdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZT8ucHVibGljTG9nMjx7fSwgeyBvd25lcjogJ21lZ2Fucm9nZ2UnOyBjb21tZW50OiAnSW5kaWNhdGVzIHNoZWxsIGludGVncmF0aW9uIHdhcyBub3QgYWN0aXZhdGVkIGJlY2F1c2Ugb2YgY3VzdG9tIGFyZ3MnIH0+KCd0ZXJtaW5hbC9zaGVsbEludGVncmF0aW9uQWN0aXZhdGlvbkZhaWx1cmVDdXN0b21BcmdzJyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoeyB0eXBlLCB2YWx1ZSB9KTtcblx0XHRcdH0pXG5cdFx0XTtcblx0XHRpZiAobmV3UHJvY2Vzcy5vblByb2Nlc3NSZXBsYXlDb21wbGV0ZSkge1xuXHRcdFx0dGhpcy5fcHJvY2Vzc0xpc3RlbmVycy5wdXNoKG5ld1Byb2Nlc3Mub25Qcm9jZXNzUmVwbGF5Q29tcGxldGUoKCkgPT4gdGhpcy5fb25Qcm9jZXNzUmVwbGF5Q29tcGxldGUuZmlyZSgpKSk7XG5cdFx0fVxuXHRcdGlmIChuZXdQcm9jZXNzLm9uUmVzdG9yZUNvbW1hbmRzKSB7XG5cdFx0XHR0aGlzLl9wcm9jZXNzTGlzdGVuZXJzLnB1c2gobmV3UHJvY2Vzcy5vblJlc3RvcmVDb21tYW5kcyhlID0+IHRoaXMuX29uUmVzdG9yZUNvbW1hbmRzLmZpcmUoZSkpKTtcblx0XHR9XG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5wcm9jZXNzU3RhdGUgPT09IFByb2Nlc3NTdGF0ZS5MYXVuY2hpbmcpIHtcblx0XHRcdFx0dGhpcy5fc2V0UHJvY2Vzc1N0YXRlKFByb2Nlc3NTdGF0ZS5SdW5uaW5nKTtcblx0XHRcdH1cblx0XHR9LCBQcm9jZXNzQ29uc3RhbnRzLkVycm9yTGF1bmNoVGhyZXNob2xkRHVyYXRpb24pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbmV3UHJvY2Vzcy5zdGFydCgpO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdC8vIEVycm9yXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIFJlcG9ydCB0aGUgbGF0ZW5jeSB0byB0aGUgcHR5IGhvc3Qgd2hlbiBpZGxlXG5cdFx0cnVuV2hlbldpbmRvd0lkbGUoZ2V0QWN0aXZlV2luZG93KCksICgpID0+IHtcblx0XHRcdHRoaXMuYmFja2VuZD8uZ2V0TGF0ZW5jeSgpLnRoZW4obWVhc3VyZW1lbnRzID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBMYXRlbmN5IG1lYXN1cmVtZW50cyBmb3IgJHt0aGlzLnJlbW90ZUF1dGhvcml0eSA/PyAnbG9jYWwnfSBiYWNrZW5kXFxuJHttZWFzdXJlbWVudHMubWFwKGUgPT4gYCR7ZS5sYWJlbH06ICR7ZS5sYXRlbmN5LnRvRml4ZWQoMil9bXNgKS5qb2luKCdcXG4nKX1gKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHJlbGF1bmNoKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCByZXNldDogYm9vbGVhbik6IFByb21pc2U8SVRlcm1pbmFsTGF1bmNoRXJyb3IgfCBJVGVybWluYWxMYXVuY2hSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLnB0eVByb2Nlc3NSZWFkeSA9IHRoaXMuX2NyZWF0ZVB0eVByb2Nlc3NSZWFkeVByb21pc2UoKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBSZWxhdW5jaGluZyB0ZXJtaW5hbCBpbnN0YW5jZSAke3RoaXMuX2luc3RhbmNlSWR9YCk7XG5cblx0XHQvLyBGaXJlIHJlY29ubmVjdCBpZiBuZWVkZWQgdG8gZW5zdXJlIHRoZSB0ZXJtaW5hbCBpcyB1c2FibGUgYWdhaW5cblx0XHRpZiAodGhpcy5faXNEaXNjb25uZWN0ZWQpIHtcblx0XHRcdHRoaXMuX2lzRGlzY29ubmVjdGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9vblB0eVJlY29ubmVjdC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgZGF0YSB3cml0dGVuIGZsYWcgdG8gcmUtZW5hYmxlIHNlYW1sZXNzIHJlbGF1bmNoIGlmIHRoaXMgcmVsYXVuY2ggd2FzIG1hbnVhbGx5XG5cdFx0Ly8gdHJpZ2dlcmVkXG5cdFx0dGhpcy5faGFzV3JpdHRlbkRhdGEgPSBmYWxzZTtcblxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZVByb2Nlc3Moc2hlbGxMYXVuY2hDb25maWcsIGNvbHMsIHJvd3MsIHJlc2V0KTtcblx0fVxuXG5cdC8vIEZldGNoIGFueSBleHRlbnNpb24gZW52aXJvbm1lbnQgYWRkaXRpb25zIGFuZCBhcHBseSB0aGVtXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVFbnZpcm9ubWVudChiYWNrZW5kOiBJVGVybWluYWxCYWNrZW5kLCB2YXJpYWJsZVJlc29sdmVyOiB0ZXJtaW5hbEVudmlyb25tZW50LlZhcmlhYmxlUmVzb2x2ZXIgfCB1bmRlZmluZWQsIHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcpOiBQcm9taXNlPElQcm9jZXNzRW52aXJvbm1lbnQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0ZXJtaW5hbEVudmlyb25tZW50LmdldFdvcmtzcGFjZUZvclRlcm1pbmFsKHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHRoaXMuX2hpc3RvcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBwbGF0Zm9ybUtleSA9IGlzV2luZG93cyA/ICd3aW5kb3dzJyA6IChpc01hY2ludG9zaCA/ICdvc3gnIDogJ2xpbnV4Jyk7XG5cdFx0Y29uc3QgZW52RnJvbUNvbmZpZ1ZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVRlcm1pbmFsRW52aXJvbm1lbnQgfCB1bmRlZmluZWQ+KGB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudi4ke3BsYXRmb3JtS2V5fWApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJlc29sdmluZyBlbnZpcm9ubWVudCAodXNlU2hlbGxFbnZpcm9ubWVudD0ke3NoZWxsTGF1bmNoQ29uZmlnLnVzZVNoZWxsRW52aXJvbm1lbnR9LCBwbGF0Zm9ybUtleT0ke3BsYXRmb3JtS2V5fSwgZW52RnJvbUNvbmZpZz0ke2VudkZyb21Db25maWdWYWx1ZSA/IE9iamVjdC5rZXlzKGVudkZyb21Db25maWdWYWx1ZSkuam9pbignLCcpIDogJ25vbmUnfSlgKTtcblxuXHRcdGxldCBiYXNlRW52OiBJUHJvY2Vzc0Vudmlyb25tZW50O1xuXHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy51c2VTaGVsbEVudmlyb25tZW50KSB7XG5cdFx0XHRjb25zdCBzaGVsbEVudiA9IGF3YWl0IGJhY2tlbmQuZ2V0U2hlbGxFbnZpcm9ubWVudCgpO1xuXHRcdFx0aWYgKCFzaGVsbEVudikge1xuXHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdDYW5ub3QgZmV0Y2ggc2hlbGwgZW52aXJvbm1lbnQgdG8gdXNlJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBTaGVsbCBlbnZpcm9ubWVudCByZXNvbHZlZCB3aXRoICR7T2JqZWN0LmtleXMoc2hlbGxFbnYpLmxlbmd0aH0gdmFyaWFibGVzOiAke09iamVjdC5rZXlzKHNoZWxsRW52KS5zb3J0KCkuam9pbignLCAnKX1gKTtcblx0XHRcdGJhc2VFbnYgPSBzaGVsbEVudjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YmFzZUVudiA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZS5nZXRFbnZpcm9ubWVudCh0aGlzLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBQcm9maWxlIGVudmlyb25tZW50IHJlc29sdmVkIHdpdGggJHtPYmplY3Qua2V5cyhiYXNlRW52KS5sZW5ndGh9IHZhcmlhYmxlc2ApO1xuXHRcdH1cblx0XHRjb25zdCBlbnYgPSBhd2FpdCB0ZXJtaW5hbEVudmlyb25tZW50LmNyZWF0ZVRlcm1pbmFsRW52aXJvbm1lbnQoc2hlbGxMYXVuY2hDb25maWcsIGVudkZyb21Db25maWdWYWx1ZSwgdmFyaWFibGVSZXNvbHZlciwgdGhpcy5fcHJvZHVjdFNlcnZpY2UudmVyc2lvbiwgdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZGV0ZWN0TG9jYWxlLCBiYXNlRW52KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBUZXJtaW5hbCBlbnZpcm9ubWVudCBjcmVhdGVkIHdpdGggJHtPYmplY3Qua2V5cyhlbnYpLmxlbmd0aH0gdmFyaWFibGVzOiAke09iamVjdC5rZXlzKGVudikuc29ydCgpLmpvaW4oJywgJyl9YCk7XG5cdFx0dGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25MaXN0ZW5lci5jbGVhcigpO1xuXHRcdGlmICghdGhpcy5faXNEaXNwb3NlZCAmJiBzaG91bGRVc2VFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihzaGVsbExhdW5jaENvbmZpZykpIHtcblx0XHRcdHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uID0gdGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UubWVyZ2VkQ29sbGVjdGlvbjtcblxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25MaXN0ZW5lci52YWx1ZSA9IHRoaXMuX2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29sbGVjdGlvbnMobmV3Q29sbGVjdGlvbiA9PiB0aGlzLl9vbkVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uQ2hhbmdlKG5ld0NvbGxlY3Rpb24pKTtcblx0XHRcdC8vIEZvciByZW1vdGUgdGVybWluYWxzLCB0aGlzIGlzIGEgY29weSBvZiB0aGUgbWVyZ2VkRW52aXJvbm1lbnRDb2xsZWN0aW9uIGNyZWF0ZWQgb25cblx0XHRcdC8vIHRoZSByZW1vdGUgc2lkZS4gU2luY2UgdGhlIGVudmlyb25tZW50IGNvbGxlY3Rpb24gaXMgc3luY2VkIGJldHdlZW4gdGhlIHJlbW90ZSBhbmRcblx0XHRcdC8vIGxvY2FsIHNpZGVzIGltbWVkaWF0ZWx5IHRoaXMgaXMgYSBmYWlybHkgc2FmZSB3YXkgb2YgZW5hYmxpbmcgdGhlIGVudiB2YXIgZGlmZmluZyBhbmRcblx0XHRcdC8vIGluZm8gd2lkZ2V0LiBXaGlsZSB0ZWNobmljYWxseSB0aGVzZSBjb3VsZCBkaWZmZXIgZHVlIHRvIHRoZSBzbGlnaHQgY2hhbmdlIG9mIGEgcmFjZVxuXHRcdFx0Ly8gY29uZGl0aW9uLCB0aGUgY2hhbmNlIGlzIG1pbmltYWwgcGx1cyB0aGUgaW1wYWN0IG9uIHRoZSB1c2VyIGlzIGFsc28gbm90IHRoYXQgZ3JlYXRcblx0XHRcdC8vIGlmIGl0IGhhcHBlbnMgLSBpdCdzIG5vdCB3b3J0aCBhZGRpbmcgcGx1bWJpbmcgdG8gc3luYyBiYWNrIHRoZSByZXNvbHZlZCBjb2xsZWN0aW9uLlxuXHRcdFx0YXdhaXQgdGhpcy5fZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24uYXBwbHlUb1Byb2Nlc3NFbnZpcm9ubWVudChlbnYsIHsgd29ya3NwYWNlRm9sZGVyIH0sIHZhcmlhYmxlUmVzb2x2ZXIpO1xuXHRcdFx0aWYgKHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLmdldFZhcmlhYmxlTWFwKHsgd29ya3NwYWNlRm9sZGVyIH0pLnNpemUpIHtcblx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudFZhcmlhYmxlSW5mbyA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlc0FjdGl2ZSwgdGhpcy5fZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24pO1xuXHRcdFx0XHR0aGlzLl9vbkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlLmZpcmUodGhpcy5lbnZpcm9ubWVudFZhcmlhYmxlSW5mbyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBlbnY7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9sYXVuY2hMb2NhbFByb2Nlc3MoXG5cdFx0YmFja2VuZDogSVRlcm1pbmFsQmFja2VuZCxcblx0XHRzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdGNvbHM6IG51bWJlcixcblx0XHRyb3dzOiBudW1iZXIsXG5cdFx0dXNlckhvbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHR2YXJpYWJsZVJlc29sdmVyOiB0ZXJtaW5hbEVudmlyb25tZW50LlZhcmlhYmxlUmVzb2x2ZXIgfCB1bmRlZmluZWRcblx0KTogUHJvbWlzZTxJVGVybWluYWxDaGlsZFByb2Nlc3M+IHtcblx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UucmVzb2x2ZVNoZWxsTGF1bmNoQ29uZmlnKHNoZWxsTGF1bmNoQ29uZmlnLCB7XG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHVuZGVmaW5lZCxcblx0XHRcdG9zOiBPU1xuXHRcdH0pO1xuXHRcdGNvbnN0IGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkgPSB0aGlzLl9oaXN0b3J5U2VydmljZS5nZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdChTY2hlbWFzLmZpbGUpO1xuXG5cdFx0Y29uc3QgaW5pdGlhbEN3ZCA9IGF3YWl0IHRlcm1pbmFsRW52aXJvbm1lbnQuZ2V0Q3dkKFxuXHRcdFx0c2hlbGxMYXVuY2hDb25maWcsXG5cdFx0XHR1c2VySG9tZSxcblx0XHRcdHZhcmlhYmxlUmVzb2x2ZXIsXG5cdFx0XHRhY3RpdmVXb3Jrc3BhY2VSb290VXJpLFxuXHRcdFx0dGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuY3dkLFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZVxuXHRcdCk7XG5cblx0XHRjb25zdCBlbnYgPSBhd2FpdCB0aGlzLl9yZXNvbHZlRW52aXJvbm1lbnQoYmFja2VuZCwgdmFyaWFibGVSZXNvbHZlciwgc2hlbGxMYXVuY2hDb25maWcpO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMgPSB7XG5cdFx0XHRzaGVsbEludGVncmF0aW9uOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25FbmFibGVkKSxcblx0XHRcdFx0c3VnZ2VzdEVuYWJsZWQ6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5TdWdnZXN0RW5hYmxlZCksXG5cdFx0XHRcdG5vbmNlOiB0aGlzLnNoZWxsSW50ZWdyYXRpb25Ob25jZVxuXHRcdFx0fSxcblx0XHRcdHdpbmRvd3NVc2VDb25wdHlEbGw6IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLndpbmRvd3NVc2VDb25wdHlEbGwgPz8gZmFsc2UsXG5cdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnM6IHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uID8gc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKHRoaXMuX2V4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLmNvbGxlY3Rpb25zKSA6IHVuZGVmaW5lZCxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogdGhpcy5fY3dkV29ya3NwYWNlRm9sZGVyLFxuXHRcdFx0aXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQ6IHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKClcblx0XHR9O1xuXHRcdGNvbnN0IHNob3VsZFBlcnNpc3QgPSAoKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRhc2tTZXR0aW5nSWQuUmVjb25uZWN0aW9uKSAmJiBzaGVsbExhdW5jaENvbmZpZy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzKSB8fCAhc2hlbGxMYXVuY2hDb25maWcuaXNGZWF0dXJlVGVybWluYWwpICYmIHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmVuYWJsZVBlcnNpc3RlbnRTZXNzaW9ucyAmJiAhc2hlbGxMYXVuY2hDb25maWcuaXNUcmFuc2llbnQ7XG5cdFx0cmV0dXJuIGF3YWl0IGJhY2tlbmQuY3JlYXRlUHJvY2VzcyhzaGVsbExhdW5jaENvbmZpZywgaW5pdGlhbEN3ZCwgY29scywgcm93cywgdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcudW5pY29kZVZlcnNpb24sIGVudiwgb3B0aW9ucywgc2hvdWxkUGVyc2lzdCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFB0eUhvc3RMaXN0ZW5lcnMoYmFja2VuZDogSVRlcm1pbmFsQmFja2VuZCkge1xuXHRcdGlmICh0aGlzLl9wdHlMaXN0ZW5lcnNBdHRhY2hlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wdHlMaXN0ZW5lcnNBdHRhY2hlZCA9IHRydWU7XG5cblx0XHQvLyBNYXJrIHRoZSBwcm9jZXNzIGFzIGRpc2Nvbm5lY3RlZCBpcyB0aGUgcHR5IGhvc3QgaXMgdW5yZXNwb25zaXZlLCB0aGUgcmVzcG9uc2l2ZSBldmVudFxuXHRcdC8vIHdpbGwgZmlyZSBvbmx5IHdoZW4gdGhlIHB0eSBob3N0IHdhcyBhbHJlYWR5IHVucmVzcG9uc2l2ZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJhY2tlbmQub25QdHlIb3N0VW5yZXNwb25zaXZlKCgpID0+IHtcblx0XHRcdHRoaXMuX2lzRGlzY29ubmVjdGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uUHR5RGlzY29ubmVjdC5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3B0eVJlc3BvbnNpdmVMaXN0ZW5lciA9IGJhY2tlbmQub25QdHlIb3N0UmVzcG9uc2l2ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc0Rpc2Nvbm5lY3RlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fb25QdHlSZWNvbm5lY3QuZmlyZSgpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9wdHlSZXNwb25zaXZlTGlzdGVuZXI/LmRpc3Bvc2UoKSkpO1xuXG5cdFx0Ly8gV2hlbiB0aGUgcHR5IGhvc3QgcmVzdGFydHMsIHJlY29ubmVjdCBpcyBubyBsb25nZXIgcG9zc2libGUgc28gZGlzcG9zZSB0aGUgcmVzcG9uc2l2ZVxuXHRcdC8vIGxpc3RlbmVyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmFja2VuZC5vblB0eUhvc3RSZXN0YXJ0KGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFdoZW4gdGhlIHB0eSBob3N0IHJlc3RhcnRzLCByZWNvbm5lY3QgaXMgbm8gbG9uZ2VyIHBvc3NpYmxlXG5cdFx0XHRpZiAoIXRoaXMuX2lzRGlzY29ubmVjdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2lzRGlzY29ubmVjdGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fb25QdHlEaXNjb25uZWN0LmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3B0eVJlc3BvbnNpdmVMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcHR5UmVzcG9uc2l2ZUxpc3RlbmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pc0ZlYXR1cmVUZXJtaW5hbCAmJiAhdGhpcy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdFx0Ly8gSW5kaWNhdGUgdGhlIHByb2Nlc3MgaXMgZXhpdGVkIChhbmQgZ29uZSBmb3JldmVyKSBvbmx5IGZvciBmZWF0dXJlIHRlcm1pbmFsc1xuXHRcdFx0XHRcdC8vIHNvIHRoZXkgY2FuIHJlYWN0IHRvIHRoZSBleGl0LCB0aGlzIGlzIHBhcnRpY3VsYXJseSBpbXBvcnRhbnQgZm9yIHRhc2tzIHNvXG5cdFx0XHRcdFx0Ly8gdGhhdCBpdCBrbm93cyB0aGF0IHRoZSBwcm9jZXNzIGlzIG5vdCBzdGlsbCBhY3RpdmUuIE5vdGUgdGhhdCB0aGlzIGlzIG5vdFxuXHRcdFx0XHRcdC8vIGRvbmUgZm9yIHJlZ3VsYXIgdGVybWluYWxzIGJlY2F1c2Ugb3RoZXJ3aXNlIHRoZSB0ZXJtaW5hbCBpbnN0YW5jZSB3b3VsZCBiZVxuXHRcdFx0XHRcdC8vIGRpc3Bvc2VkLlxuXHRcdFx0XHRcdHRoaXMuX29uRXhpdCgtMSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gRm9yIG5vcm1hbCB0ZXJtaW5hbHMgd3JpdGUgYSBtZXNzYWdlIGluZGljYXRpbmcgd2hhdCBoYXBwZW5lZCBhbmQgcmVsYXVuY2hcblx0XHRcdFx0XHQvLyB1c2luZyB0aGUgcHJldmlvdXMgc2hlbGxMYXVuY2hDb25maWdcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ3B0eUhvc3RSZWxhdW5jaCcsIFwiUmVzdGFydGluZyB0aGUgdGVybWluYWwgYmVjYXVzZSB0aGUgY29ubmVjdGlvbiB0byB0aGUgc2hlbGwgcHJvY2VzcyB3YXMgbG9zdC4uLlwiKTtcblx0XHRcdFx0XHQvLyBBbGlnbiB3aXRoIHRoZSBwdHkgc2VydmljZSdzIHJldml2ZSBsb2dpYyAoX3Jldml2ZVRlcm1pbmFsUHJvY2VzcyBpbiBzcmMvdnMvcGxhdGZvcm0vdGVybWluYWwvbm9kZS9wdHlTZXJ2aWNlLnRzKVxuXHRcdFx0XHRcdC8vIHRvIGhlZGdlIGFnYWluc3QgUFNSZWFkTGluZSBgR2V0Q29uc29sZUN1cnNvckluZm9gIGFuZCBjdXJzb3IgaGFuZGxpbmcgZnJvbSBjb25wdHkuXG5cdFx0XHRcdFx0bGV0IHBvc3RSZXN0YXJ0TWVzc2FnZSA9ICcnO1xuXHRcdFx0XHRcdGlmICh0aGlzLm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyAmJiB0aGlzLl9kaW1lbnNpb25zLnJvd3MgPiAwKSB7XG5cdFx0XHRcdFx0XHRwb3N0UmVzdGFydE1lc3NhZ2UgPSAnXFxyXFxuJy5yZXBlYXQodGhpcy5fZGltZW5zaW9ucy5yb3dzIC0gMSkgKyBgXFx4MWJbSGA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX29uUHJvY2Vzc0RhdGEuZmlyZSh7IGRhdGE6IGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbChtZXNzYWdlLCB7IGxvdWRGb3JtYXR0aW5nOiB0cnVlIH0pICsgcG9zdFJlc3RhcnRNZXNzYWdlLCB0cmFja0NvbW1pdDogZmFsc2UgfSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZWxhdW5jaCh0aGlzLl9zaGVsbExhdW5jaENvbmZpZywgdGhpcy5fZGltZW5zaW9ucy5jb2xzLCB0aGlzLl9kaW1lbnNpb25zLnJvd3MsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5wdHlQcm9jZXNzUmVhZHkgPSB1bmRlZmluZWQhO1xuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGdldEJhY2tlbmRPUygpOiBQcm9taXNlPE9wZXJhdGluZ1N5c3RlbT4ge1xuXHRcdGxldCBvcyA9IE9TO1xuXHRcdGlmICghIXRoaXMucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRjb25zdCByZW1vdGVFbnYgPSBhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRcdGlmICghcmVtb3RlRW52KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGdldCByZW1vdGUgZW52aXJvbm1lbnQgZm9yIHJlbW90ZSBhdXRob3JpdHkgXCIke3RoaXMucmVtb3RlQXV0aG9yaXR5fVwiYCk7XG5cdFx0XHR9XG5cdFx0XHRvcyA9IHJlbW90ZUVudi5vcztcblx0XHR9XG5cdFx0cmV0dXJuIG9zO1xuXHR9XG5cblx0c2V0RGltZW5zaW9ucyhjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgc3luYz86IHVuZGVmaW5lZCwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXREaW1lbnNpb25zKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCBzeW5jOiBmYWxzZSwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXREaW1lbnNpb25zKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCBzeW5jOiB0cnVlLCBwaXhlbFdpZHRoPzogbnVtYmVyLCBwaXhlbEhlaWdodD86IG51bWJlcik6IHZvaWQ7XG5cdHNldERpbWVuc2lvbnMoY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIsIHN5bmM/OiBib29sZWFuLCBwaXhlbFdpZHRoPzogbnVtYmVyLCBwaXhlbEhlaWdodD86IG51bWJlcik6IE1heWJlUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHN5bmMpIHtcblx0XHRcdHRoaXMuX3Jlc2l6ZShjb2xzLCByb3dzLCBwaXhlbFdpZHRoLCBwaXhlbEhlaWdodCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVzaXppbmcgYSBkaXNwb3NlZCBwdHkgaXMgYSBjb250cmFjdHVhbCBuby1vcCBzbyByZS1lbnRyYW50IHJlc2l6ZXNcblx0XHQvLyBkdXJpbmcgdGhlIHN5bmNocm9ub3VzIHRlYXJkb3duIHN0YWNrICgjMzE1MjgyKSBhcmUgc2lsZW50bHkgZHJvcHBlZC5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMucHR5UHJvY2Vzc1JlYWR5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rlcm1pbmFsUHJvY2Vzc01hbmFnZXIuc2V0RGltZW5zaW9ucyBjYWxsZWQgYmVmb3JlIGluaXRpYWxpemF0aW9uJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnB0eVByb2Nlc3NSZWFkeS50aGVuKCgpID0+IHRoaXMuX3Jlc2l6ZShjb2xzLCByb3dzLCBwaXhlbFdpZHRoLCBwaXhlbEhlaWdodCkpO1xuXHR9XG5cblx0YXN5bmMgc2V0VW5pY29kZVZlcnNpb24odmVyc2lvbjogJzYnIHwgJzExJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm9jZXNzPy5zZXRVbmljb2RlVmVyc2lvbih2ZXJzaW9uKTtcblx0fVxuXG5cdGFzeW5jIHNldE5leHRDb21tYW5kSWQoY29tbWFuZExpbmU6IHN0cmluZywgY29tbWFuZElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnB0eVByb2Nlc3NSZWFkeTtcblx0XHRjb25zdCBwcm9jZXNzID0gdGhpcy5fcHJvY2Vzcztcblx0XHRpZiAoIXByb2Nlc3M/LmlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXROZXh0Q29tbWFuZElkKHByb2Nlc3MuaWQsIGNvbW1hbmRMaW5lLCBjb21tYW5kSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzaXplKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyLCBwaXhlbFdpZHRoPzogbnVtYmVyLCBwaXhlbEhlaWdodD86IG51bWJlcikge1xuXHRcdGlmICghdGhpcy5fcHJvY2Vzcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUaGUgY2hpbGQgcHJvY2VzcyBjb3VsZCBhbHJlYWR5IGJlIHRlcm1pbmF0ZWRcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fcHJvY2Vzcy5yZXNpemUoY29scywgcm93cywgcGl4ZWxXaWR0aCwgcGl4ZWxIZWlnaHQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBXZSB0cmllZCB0byB3cml0ZSB0byBhIGNsb3NlZCBwaXBlIC8gY2hhbm5lbC5cblx0XHRcdGlmIChlcnJvci5jb2RlICE9PSAnRVBJUEUnICYmIGVycm9yLmNvZGUgIT09ICdFUlJfSVBDX0NIQU5ORUxfQ0xPU0VEJykge1xuXHRcdFx0XHR0aHJvdyAoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9kaW1lbnNpb25zLmNvbHMgPSBjb2xzO1xuXHRcdHRoaXMuX2RpbWVuc2lvbnMucm93cyA9IHJvd3M7XG5cdH1cblxuXHRhc3luYyB3cml0ZShkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnB0eVByb2Nlc3NSZWFkeTtcblx0XHR0aGlzLl9kYXRhRmlsdGVyLmRpc2FibGVTZWFtbGVzc1JlbGF1bmNoKCk7XG5cdFx0dGhpcy5faGFzV3JpdHRlbkRhdGEgPSB0cnVlO1xuXHRcdGlmICh0aGlzLnNoZWxsUHJvY2Vzc0lkIHx8IHRoaXMuX3Byb2Nlc3NUeXBlID09PSBQcm9jZXNzVHlwZS5Qc3VlZG9UZXJtaW5hbCkge1xuXHRcdFx0aWYgKHRoaXMuX3Byb2Nlc3MpIHtcblx0XHRcdFx0Ly8gU2VuZCBkYXRhIGlmIHRoZSBwdHkgaXMgcmVhZHlcblx0XHRcdFx0dGhpcy5fcHJvY2Vzcy5pbnB1dChkYXRhKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSWYgdGhlIHB0eSBpcyBub3QgcmVhZHksIHF1ZXVlIHRoZSBkYXRhIHJlY2VpdmVkIHRvIHNlbmQgbGF0ZXJcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ3F1ZXVlaW5nIGRhdGEgaW4gcHJlbGF1bmNoIGlucHV0IHF1ZXVlJywgZGF0YSk7XG5cdFx0XHR0aGlzLl9wcmVMYXVuY2hJbnB1dFF1ZXVlLnB1c2goZGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2VuZFNpZ25hbChzaWduYWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucHR5UHJvY2Vzc1JlYWR5O1xuXHRcdGlmICh0aGlzLl9wcm9jZXNzKSB7XG5cdFx0XHR0aGlzLl9wcm9jZXNzLnNlbmRTaWduYWwoc2lnbmFsKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBwcm9jZXNzQmluYXJ5KGRhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucHR5UHJvY2Vzc1JlYWR5O1xuXHRcdHRoaXMuX2RhdGFGaWx0ZXIuZGlzYWJsZVNlYW1sZXNzUmVsYXVuY2goKTtcblx0XHR0aGlzLl9oYXNXcml0dGVuRGF0YSA9IHRydWU7XG5cdFx0dGhpcy5fcHJvY2Vzcz8ucHJvY2Vzc0JpbmFyeShkYXRhKTtcblx0fVxuXG5cdGdldCBpbml0aWFsQ3dkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxDd2QgPz8gJyc7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KHR5cGU6IFQpOiBQcm9taXNlPElQcm9jZXNzUHJvcGVydHlNYXBbVF0+IHtcblx0XHRpZiAoIXRoaXMuX3Byb2Nlc3MpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlZnJlc2ggcHJvcGVydHkgd2hlbiBwcm9jZXNzIGlzIG5vdCBzZXQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2Nlc3MucmVmcmVzaFByb3BlcnR5KHR5cGUpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KHR5cGU6IFQsIHZhbHVlOiBJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2Nlc3M/LnVwZGF0ZVByb3BlcnR5KHR5cGUsIHZhbHVlKTtcblx0fVxuXG5cdGFja25vd2xlZGdlRGF0YUV2ZW50KGNoYXJDb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNrRGF0YUJ1ZmZlcmVyLmFjayhjaGFyQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FeGl0KGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm9jZXNzID0gbnVsbDtcblx0XHQvLyBJZiB0aGUgcHJvY2VzcyBpcyBtYXJrZWQgYXMgbGF1bmNoaW5nIHRoZW4gbWFyayB0aGUgcHJvY2VzcyBhcyBraWxsZWRcblx0XHQvLyBkdXJpbmcgbGF1bmNoLiBUaGlzIHR5cGljYWxseSBtZWFucyB0aGF0IHRoZXJlIGlzIGEgcHJvYmxlbSB3aXRoIHRoZVxuXHRcdC8vIHNoZWxsIGFuZCBhcmdzLlxuXHRcdGlmICh0aGlzLnByb2Nlc3NTdGF0ZSA9PT0gUHJvY2Vzc1N0YXRlLkxhdW5jaGluZykge1xuXHRcdFx0dGhpcy5fc2V0UHJvY2Vzc1N0YXRlKFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gpO1xuXHRcdH1cblxuXHRcdC8vIElmIFRlcm1pbmFsSW5zdGFuY2UgZGlkIG5vdCBrbm93IGFib3V0IHRoZSBwcm9jZXNzIGV4aXQgdGhlbiBpdCB3YXNcblx0XHQvLyB0cmlnZ2VyZWQgYnkgdGhlIHByb2Nlc3MsIG5vdCBvbiBWUyBDb2RlJ3Mgc2lkZS5cblx0XHRpZiAodGhpcy5wcm9jZXNzU3RhdGUgPT09IFByb2Nlc3NTdGF0ZS5SdW5uaW5nKSB7XG5cdFx0XHR0aGlzLl9zZXRQcm9jZXNzU3RhdGUoUHJvY2Vzc1N0YXRlLktpbGxlZEJ5UHJvY2Vzcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25Qcm9jZXNzRXhpdC5maXJlKGV4aXRDb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFByb2Nlc3NTdGF0ZShzdGF0ZTogUHJvY2Vzc1N0YXRlKSB7XG5cdFx0dGhpcy5wcm9jZXNzU3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9vblByb2Nlc3NTdGF0ZUNoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uQ2hhbmdlKG5ld0NvbGxlY3Rpb246IElNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGRpZmYgPSB0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiEuZGlmZihuZXdDb2xsZWN0aW9uLCB7IHdvcmtzcGFjZUZvbGRlcjogdGhpcy5fY3dkV29ya3NwYWNlRm9sZGVyIH0pO1xuXHRcdGlmIChkaWZmID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIElmIHRoZXJlIGFyZSBubyBsb25nZXIgZGlmZmVyZW5jZXMsIHJlbW92ZSB0aGUgc3RhbGUgaW5mbyBpbmRpY2F0b3Jcblx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50VmFyaWFibGVJbmZvIGluc3RhbmNlb2YgRW52aXJvbm1lbnRWYXJpYWJsZUluZm9TdGFsZSkge1xuXHRcdFx0XHR0aGlzLmVudmlyb25tZW50VmFyaWFibGVJbmZvID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2VzQWN0aXZlLCB0aGlzLl9leHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiEpO1xuXHRcdFx0XHR0aGlzLl9vbkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlLmZpcmUodGhpcy5lbnZpcm9ubWVudFZhcmlhYmxlSW5mbyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZW52aXJvbm1lbnRWYXJpYWJsZUluZm8gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbnZpcm9ubWVudFZhcmlhYmxlSW5mb1N0YWxlLCBkaWZmLCB0aGlzLl9pbnN0YW5jZUlkLCBuZXdDb2xsZWN0aW9uKTtcblx0XHR0aGlzLl9vbkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlLmZpcmUodGhpcy5lbnZpcm9ubWVudFZhcmlhYmxlSW5mbyk7XG5cdH1cblxuXHRhc3luYyBjbGVhckJ1ZmZlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9wcm9jZXNzPy5jbGVhckJ1ZmZlcj8uKCk7XG5cdH1cbn1cblxuY2xhc3MgQWNrRGF0YUJ1ZmZlcmVyIHtcblx0cHJpdmF0ZSBfdW5zZW50Q2hhckNvdW50OiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhbGxiYWNrOiAoY2hhckNvdW50OiBudW1iZXIpID0+IHZvaWRcblx0KSB7XG5cdH1cblxuXHRhY2soY2hhckNvdW50OiBudW1iZXIpIHtcblx0XHR0aGlzLl91bnNlbnRDaGFyQ291bnQgKz0gY2hhckNvdW50O1xuXHRcdHdoaWxlICh0aGlzLl91bnNlbnRDaGFyQ291bnQgPiBGbG93Q29udHJvbENvbnN0YW50cy5DaGFyQ291bnRBY2tTaXplKSB7XG5cdFx0XHR0aGlzLl91bnNlbnRDaGFyQ291bnQgLT0gRmxvd0NvbnRyb2xDb25zdGFudHMuQ2hhckNvdW50QWNrU2l6ZTtcblx0XHRcdHRoaXMuX2NhbGxiYWNrKEZsb3dDb250cm9sQ29uc3RhbnRzLkNoYXJDb3VudEFja1NpemUpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBlbnVtIFNlYW1sZXNzUmVsYXVuY2hDb25zdGFudHMge1xuXHQvKipcblx0ICogSG93IGxvbmcgdG8gcmVjb3JkIGRhdGEgZXZlbnRzIGZvciBuZXcgdGVybWluYWxzLlxuXHQgKi9cblx0UmVjb3JkVGVybWluYWxEdXJhdGlvbiA9IDEwMDAwLFxuXHQvKipcblx0ICogVGhlIG1heGltdW0gZHVyYXRpb24gYWZ0ZXIgYSByZWxhdW5jaCBvY2N1cnMgdG8gdHJpZ2dlciBhIHN3YXAuXG5cdCAqL1xuXHRTd2FwV2FpdE1heGltdW1EdXJhdGlvbiA9IDMwMDBcbn1cblxuLyoqXG4gKiBGaWx0ZXJzIGRhdGEgZXZlbnRzIGZyb20gdGhlIHByb2Nlc3MgYW5kIHN1cHBvcnRzIHNlYW1sZXNzbHkgcmVzdGFydGluZyBzd2FwcGluZyBvdXQgdGhlIHByb2Nlc3NcbiAqIHdpdGggYW5vdGhlciwgZGVsYXlpbmcgdGhlIHN3YXAgaW4gb3V0cHV0IGluIG9yZGVyIHRvIG1pbmltaXplIGZsaWNrZXJpbmcvY2xlYXJpbmcgb2YgdGhlXG4gKiB0ZXJtaW5hbC5cbiAqL1xuY2xhc3MgU2VhbWxlc3NSZWxhdW5jaERhdGFGaWx0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfZmlyc3RSZWNvcmRlcj86IFRlcm1pbmFsUmVjb3JkZXI7XG5cdHByaXZhdGUgX3NlY29uZFJlY29yZGVyPzogVGVybWluYWxSZWNvcmRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlyc3REaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWNvbmREaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX2FjdGl2ZVByb2Nlc3M/OiBJVGVybWluYWxDaGlsZFByb2Nlc3M7XG5cdHByaXZhdGUgX2Rpc2FibGVTZWFtbGVzc1JlbGF1bmNoOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfc3dhcFRpbWVvdXQ/OiBudW1iZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZyB8IElQcm9jZXNzRGF0YUV2ZW50PigpKTtcblx0Z2V0IG9uUHJvY2Vzc0RhdGEoKTogRXZlbnQ8c3RyaW5nIHwgSVByb2Nlc3NEYXRhRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uUHJvY2Vzc0RhdGEuZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRuZXdQcm9jZXNzKHByb2Nlc3M6IElUZXJtaW5hbENoaWxkUHJvY2VzcywgcmVzZXQ6IGJvb2xlYW4pIHtcblx0XHQvLyBTdG9wIGxpc3RlbmluZyB0byB0aGUgb2xkIHByb2Nlc3MgYW5kIHRyaWdnZXIgZGVsYXllZCBzaHV0ZG93biAoZm9yIGhhbmcgaXNzdWUgIzcxOTY2KVxuXHRcdHRoaXMuX2RhdGFMaXN0ZW5lci5jbGVhcigpO1xuXHRcdHRoaXMuX2FjdGl2ZVByb2Nlc3M/LnNodXRkb3duKGZhbHNlKTtcblxuXHRcdHRoaXMuX2FjdGl2ZVByb2Nlc3MgPSBwcm9jZXNzO1xuXG5cdFx0Ly8gU3RhcnQgZmlyaW5nIGV2ZW50cyBpbW1lZGlhdGVseSBpZjpcblx0XHQvLyAtIHRoZXJlJ3Mgbm8gcmVjb3JkZXIsIHdoaWNoIG1lYW5zIGl0J3MgYSBuZXcgdGVybWluYWxcblx0XHQvLyAtIHRoaXMgaXMgbm90IGEgcmVzZXQsIHNvIHNlYW1sZXNzIHJlbGF1bmNoIGlzbid0IG5lY2Vzc2FyeVxuXHRcdC8vIC0gc2VhbWxlc3MgcmVsYXVuY2ggaXMgZGlzYWJsZWQgYmVjYXVzZSB0aGUgdGVybWluYWwgaGFzIGFjY2VwdGVkIGlucHV0XG5cdFx0aWYgKCF0aGlzLl9maXJzdFJlY29yZGVyIHx8ICFyZXNldCB8fCB0aGlzLl9kaXNhYmxlU2VhbWxlc3NSZWxhdW5jaCkge1xuXHRcdFx0W3RoaXMuX2ZpcnN0UmVjb3JkZXIsIHRoaXMuX2ZpcnN0RGlzcG9zYWJsZS52YWx1ZV0gPSB0aGlzLl9jcmVhdGVSZWNvcmRlcihwcm9jZXNzKTtcblx0XHRcdGlmICh0aGlzLl9kaXNhYmxlU2VhbWxlc3NSZWxhdW5jaCAmJiByZXNldCkge1xuXHRcdFx0XHR0aGlzLl9vblByb2Nlc3NEYXRhLmZpcmUoJ1xceDFiYycpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZGF0YUxpc3RlbmVyLnZhbHVlID0gcHJvY2Vzcy5vblByb2Nlc3NEYXRhKGUgPT4gdGhpcy5fb25Qcm9jZXNzRGF0YS5maXJlKGUpKTtcblx0XHRcdHRoaXMuX2Rpc2FibGVTZWFtbGVzc1JlbGF1bmNoID0gZmFsc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciBhIHN3YXAgaWYgdGhlcmUgd2FzIGEgcmVjZW50IHJlbGF1bmNoXG5cdFx0aWYgKHRoaXMuX3NlY29uZFJlY29yZGVyKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXJTd2FwKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3dhcFRpbWVvdXQgPSBtYWluV2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGhpcy50cmlnZ2VyU3dhcCgpLCBTZWFtbGVzc1JlbGF1bmNoQ29uc3RhbnRzLlN3YXBXYWl0TWF4aW11bUR1cmF0aW9uKTtcblxuXHRcdC8vIFBhdXNlIGFsbCBvdXRnb2luZyBkYXRhIGV2ZW50c1xuXHRcdHRoaXMuX2RhdGFMaXN0ZW5lci5jbGVhcigpO1xuXG5cdFx0dGhpcy5fZmlyc3REaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0Y29uc3QgcmVjb3JkZXIgPSB0aGlzLl9jcmVhdGVSZWNvcmRlcihwcm9jZXNzKTtcblx0XHRbdGhpcy5fc2Vjb25kUmVjb3JkZXIsIHRoaXMuX3NlY29uZERpc3Bvc2FibGUudmFsdWVdID0gcmVjb3JkZXI7XG5cdH1cblxuXHQvKipcblx0ICogRGlzYWJsZXMgc2VhbWxlc3MgcmVsYXVuY2ggZm9yIHRoZSBhY3RpdmUgcHJvY2Vzc1xuXHQgKi9cblx0ZGlzYWJsZVNlYW1sZXNzUmVsYXVuY2goKSB7XG5cdFx0dGhpcy5fZGlzYWJsZVNlYW1sZXNzUmVsYXVuY2ggPSB0cnVlO1xuXHRcdHRoaXMuX3N0b3BSZWNvcmRpbmcoKTtcblx0XHR0aGlzLnRyaWdnZXJTd2FwKCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJpZ2dlciB0aGUgc3dhcCBvZiB0aGUgcHJvY2Vzc2VzIGlmIG5lZWRlZCAoZWcuIHRpbWVvdXQsIGlucHV0KVxuXHQgKi9cblx0dHJpZ2dlclN3YXAoKSB7XG5cdFx0Ly8gQ2xlYXIgdGhlIHN3YXAgdGltZW91dCBpZiBpdCBleGlzdHNcblx0XHRpZiAodGhpcy5fc3dhcFRpbWVvdXQpIHtcblx0XHRcdG1haW5XaW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuX3N3YXBUaW1lb3V0KTtcblx0XHRcdHRoaXMuX3N3YXBUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIERvIG5vdGhpbmcgaWYgdGhlcmUncyBub3RoaW5nIGJlaW5nIHJlY29yZGVyXG5cdFx0aWYgKCF0aGlzLl9maXJzdFJlY29yZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENsZWFyIHRoZSBmaXJzdCByZWNvcmRlciBpZiBubyBzZWNvbmQgcHJvY2VzcyB3YXMgYXR0YWNoZWQgYmVmb3JlIHRoZSBzd2FwIHRyaWdnZXJcblx0XHRpZiAoIXRoaXMuX3NlY29uZFJlY29yZGVyKSB7XG5cdFx0XHR0aGlzLl9maXJzdFJlY29yZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fZmlyc3REaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgZGF0YSBmb3IgZWFjaCByZWNvcmRlclxuXHRcdGNvbnN0IGZpcnN0RGF0YSA9IHRoaXMuX2dldERhdGFGcm9tUmVjb3JkZXIodGhpcy5fZmlyc3RSZWNvcmRlcik7XG5cdFx0Y29uc3Qgc2Vjb25kRGF0YSA9IHRoaXMuX2dldERhdGFGcm9tUmVjb3JkZXIodGhpcy5fc2Vjb25kUmVjb3JkZXIpO1xuXG5cdFx0Ly8gUmUtd3JpdGUgdGhlIHRlcm1pbmFsIGlmIHRoZSBkYXRhIGRpZmZlcnNcblx0XHRpZiAoZmlyc3REYXRhID09PSBzZWNvbmREYXRhKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBTZWFtbGVzcyB0ZXJtaW5hbCByZWxhdW5jaCAtIGlkZW50aWNhbCBjb250ZW50YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFNlYW1sZXNzIHRlcm1pbmFsIHJlbGF1bmNoIC0gcmVzZXR0aW5nIGNvbnRlbnRgKTtcblx0XHRcdC8vIEZpcmUgZnVsbCByZXNldCAoUklTKSBmb2xsb3dlZCBieSB0aGUgbmV3IGRhdGEgc28gdGhlIHVwZGF0ZSBoYXBwZW5zIGluIHRoZSBzYW1lIGZyYW1lXG5cdFx0XHR0aGlzLl9vblByb2Nlc3NEYXRhLmZpcmUoeyBkYXRhOiBgXFx4MWJjJHtzZWNvbmREYXRhfWAsIHRyYWNrQ29tbWl0OiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHQvLyBTZXQgdXAgdGhlIG5ldyBkYXRhIGxpc3RlbmVyXG5cdFx0dGhpcy5fZGF0YUxpc3RlbmVyLnZhbHVlID0gdGhpcy5fYWN0aXZlUHJvY2VzcyEub25Qcm9jZXNzRGF0YShlID0+IHRoaXMuX29uUHJvY2Vzc0RhdGEuZmlyZShlKSk7XG5cblx0XHQvLyBSZXBsYWNlIGZpcnN0IHJlY29yZGVyIHdpdGggc2Vjb25kXG5cdFx0dGhpcy5fZmlyc3RSZWNvcmRlciA9IHRoaXMuX3NlY29uZFJlY29yZGVyO1xuXHRcdHRoaXMuX2ZpcnN0RGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuX3NlY29uZERpc3Bvc2FibGUudmFsdWU7XG5cdFx0dGhpcy5fc2Vjb25kUmVjb3JkZXIgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wUmVjb3JkaW5nKCkge1xuXHRcdC8vIENvbnRpbnVlIHJlY29yZGluZyBpZiBhIHN3YXAgaXMgY29taW5nXG5cdFx0aWYgKHRoaXMuX3N3YXBUaW1lb3V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFN0b3AgcmVjb3JkaW5nXG5cdFx0dGhpcy5fZmlyc3RSZWNvcmRlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9maXJzdERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLl9zZWNvbmRSZWNvcmRlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zZWNvbmREaXNwb3NhYmxlLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSZWNvcmRlcihwcm9jZXNzOiBJVGVybWluYWxDaGlsZFByb2Nlc3MpOiBbVGVybWluYWxSZWNvcmRlciwgSURpc3Bvc2FibGVdIHtcblx0XHRjb25zdCByZWNvcmRlciA9IG5ldyBUZXJtaW5hbFJlY29yZGVyKDAsIDApO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBwcm9jZXNzLm9uUHJvY2Vzc0RhdGEoZSA9PiByZWNvcmRlci5oYW5kbGVEYXRhKGlzU3RyaW5nKGUpID8gZSA6IGUuZGF0YSkpO1xuXHRcdHJldHVybiBbcmVjb3JkZXIsIGRpc3Bvc2FibGVdO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGF0YUZyb21SZWNvcmRlcihyZWNvcmRlcjogVGVybWluYWxSZWNvcmRlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHJlY29yZGVyLmdlbmVyYXRlUmVwbGF5RXZlbnRTeW5jKCkuZXZlbnRzLmZpbHRlcihlID0+ICEhZS5kYXRhKS5tYXAoZSA9PiBlLmRhdGEpLmpvaW4oJycpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxTQUFzQixtQkFBbUIsb0JBQW9CO0FBQ2xGLFNBQVMsZUFBZTtBQUN4QixTQUE4QixhQUFhLFdBQVcsaUJBQWlCLFVBQVU7QUFFakYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBZ0QsMEJBQTBCO0FBQzFFLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsc0JBQWtSLHFCQUE4QyxxQkFBcUIseUJBQXlCO0FBQ3ZYLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWtEO0FBQzNELFNBQVMsc0NBQXNDLG9DQUFvQztBQUNuRixTQUFTLCtCQUErQiwwQkFBMEIsd0JBQXdCO0FBQzFGLFNBQW1DLG1DQUFtQztBQUN0RSxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLCtDQUErQztBQUN4RCxTQUEyRCxpQ0FBaUMsb0JBQW9CO0FBQ2hILFlBQVkseUJBQXlCO0FBQ3JDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNB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SUFDeEUsT0FBTztBQUNOLFdBQUssWUFBWSxNQUFNLGdEQUFnRDtBQUV2RSxXQUFLLGVBQWUsS0FBSyxFQUFFLE1BQU0sUUFBUSxVQUFVLElBQUksYUFBYSxNQUFNLENBQUM7QUFBQSxJQUM1RTtBQUdBLFNBQUssY0FBYyxRQUFRLEtBQUssZUFBZ0IsY0FBYyxPQUFLLEtBQUssZUFBZSxLQUFLLENBQUMsQ0FBQztBQUc5RixTQUFLLGlCQUFpQixLQUFLO0FBQzNCLFNBQUssaUJBQWlCLFFBQVEsS0FBSyxrQkFBa0I7QUFDckQsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRVEsaUJBQWlCO0FBRXhCLFFBQUksS0FBSyxjQUFjO0FBQ3RCO0FBQUEsSUFDRDtBQUVBLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssaUJBQWlCLE1BQU07QUFDNUIsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxrQkFBa0IsTUFBTTtBQUFBLEVBQzlCO0FBQUEsRUFFUSxnQkFBZ0IsU0FBaUU7QUFDeEYsVUFBTSxXQUFXLElBQUksaUJBQWlCLEdBQUcsQ0FBQztBQUMxQyxVQUFNLGFBQWEsUUFBUSxjQUFjLE9BQUssU0FBUyxXQUFXLFNBQVMsQ0FBQyxJQUFJLElBQUksRUFBRSxJQUFJLENBQUM7QUFDM0YsV0FBTyxDQUFDLFVBQVUsVUFBVTtBQUFBLEVBQzdCO0FBQUEsRUFFUSxxQkFBcUIsVUFBb0M7QUFDaEUsV0FBTyxTQUFTLHdCQUF3QixFQUFFLE9BQU8sT0FBTyxPQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLE9BQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFO0FBQUEsRUFDaEc7QUFDRDtBQWpJTSw2QkFBTjtBQUFBLEVBZUc7QUFBQSxHQWZHOyIsCiAgIm5hbWVzIjogWyJQcm9jZXNzQ29uc3RhbnRzIiwgIlByb2Nlc3NUeXBlIiwgInJlc3VsdCIsICJTZWFtbGVzc1JlbGF1bmNoQ29uc3RhbnRzIl0KfQo=
