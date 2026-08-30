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
import { DeferredPromise } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { revive } from "../../../../base/common/marshalling.js";
import { mark } from "../../../../base/common/performance.js";
import { OperatingSystem } from "../../../../base/common/platform.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITerminalLogService, TerminalExtensions, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { BaseTerminalBackend } from "./baseTerminalBackend.js";
import { RemotePty } from "./remotePty.js";
import { ITerminalInstanceService } from "./terminal.js";
import { RemoteTerminalChannelClient, REMOTE_TERMINAL_CHANNEL_NAME } from "../common/remote/remoteTerminalChannel.js";
import { TERMINAL_CONFIG_SECTION } from "../common/terminal.js";
import { TerminalStorageKeys } from "../common/terminalStorageKeys.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { getWorkspaceForTerminal } from "../common/terminalEnvironment.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
let RemoteTerminalBackendContribution = class {
  constructor(instantiationService, remoteAgentService, terminalInstanceService) {
    const connection = remoteAgentService.getConnection();
    if (connection?.remoteAuthority) {
      const channel = instantiationService.createInstance(RemoteTerminalChannelClient, connection.remoteAuthority, connection.getChannel(REMOTE_TERMINAL_CHANNEL_NAME));
      const backend = instantiationService.createInstance(RemoteTerminalBackend, connection.remoteAuthority, channel);
      Registry.as(TerminalExtensions.Backend).registerTerminalBackend(backend);
      terminalInstanceService.didRegisterBackend(backend);
    }
  }
};
RemoteTerminalBackendContribution.ID = "remoteTerminalBackend";
RemoteTerminalBackendContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, ITerminalInstanceService)
], RemoteTerminalBackendContribution);
let RemoteTerminalBackend = class extends BaseTerminalBackend {
  constructor(remoteAuthority, _remoteTerminalChannel, _remoteAgentService, _instantiationService, logService, _commandService, _storageService, _remoteAuthorityResolverService, workspaceContextService, configurationResolverService, _historyService, _configurationService, statusBarService) {
    super(_remoteTerminalChannel, logService, _historyService, configurationResolverService, statusBarService, workspaceContextService);
    this.remoteAuthority = remoteAuthority;
    this._remoteTerminalChannel = _remoteTerminalChannel;
    this._remoteAgentService = _remoteAgentService;
    this._instantiationService = _instantiationService;
    this._commandService = _commandService;
    this._storageService = _storageService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._historyService = _historyService;
    this._configurationService = _configurationService;
    this._ptys = /* @__PURE__ */ new Map();
    this._whenConnected = new DeferredPromise();
    this._onDidRequestDetach = this._register(new Emitter());
    this.onDidRequestDetach = this._onDidRequestDetach.event;
    this._onRestoreCommands = this._register(new Emitter());
    this.onRestoreCommands = this._onRestoreCommands.event;
    this._register(this._remoteTerminalChannel.onProcessData((e) => this._ptys.get(e.id)?.handleData(e.event)));
    this._register(this._remoteTerminalChannel.onProcessReplay((e) => {
      this._ptys.get(e.id)?.handleReplay(e.event);
      if (e.event.commands.commands.length > 0) {
        this._onRestoreCommands.fire({ id: e.id, commands: e.event.commands.commands });
      }
    }));
    this._register(this._remoteTerminalChannel.onProcessOrphanQuestion((e) => this._ptys.get(e.id)?.handleOrphanQuestion()));
    this._register(this._remoteTerminalChannel.onDidRequestDetach((e) => this._onDidRequestDetach.fire(e)));
    this._register(this._remoteTerminalChannel.onProcessReady((e) => this._ptys.get(e.id)?.handleReady(e.event)));
    this._register(this._remoteTerminalChannel.onDidChangeProperty((e) => this._ptys.get(e.id)?.handleDidChangeProperty(e.property)));
    this._register(this._remoteTerminalChannel.onProcessExit((e) => {
      const pty = this._ptys.get(e.id);
      if (pty) {
        pty.handleExit(e.event);
        pty.dispose();
        this._ptys.delete(e.id);
      }
    }));
    const allowedCommands = ["_remoteCLI.openExternal", "_remoteCLI.windowOpen", "_remoteCLI.getSystemStatus", "_remoteCLI.manageExtensions"];
    this._register(this._remoteTerminalChannel.onExecuteCommand(async (e) => {
      const pty = this._ptys.get(e.persistentProcessId);
      if (!pty) {
        return;
      }
      const reqId = e.reqId;
      const commandId = e.commandId;
      if (!allowedCommands.includes(commandId)) {
        this._remoteTerminalChannel.sendCommandResult(reqId, true, "Invalid remote cli command: " + commandId);
        return;
      }
      const commandArgs = e.commandArgs.map((arg) => revive(arg));
      try {
        const result = await this._commandService.executeCommand(e.commandId, ...commandArgs);
        this._remoteTerminalChannel.sendCommandResult(reqId, false, result);
      } catch (err) {
        this._remoteTerminalChannel.sendCommandResult(reqId, true, err);
      }
    }));
    this._onPtyHostConnected.fire();
  }
  get whenReady() {
    return this._whenConnected.p;
  }
  setReady() {
    this._whenConnected.complete();
  }
  async requestDetachInstance(workspaceId, instanceId) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot request detach instance when there is no remote!`);
    }
    return this._remoteTerminalChannel.requestDetachInstance(workspaceId, instanceId);
  }
  async acceptDetachInstanceReply(requestId, persistentProcessId) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot accept detached instance when there is no remote!`);
    } else if (!persistentProcessId) {
      this._logService.warn("Cannot attach to feature terminals, custom pty terminals, or those without a persistentProcessId");
      return;
    }
    return this._remoteTerminalChannel.acceptDetachInstanceReply(requestId, persistentProcessId);
  }
  async persistTerminalState() {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot persist terminal state when there is no remote!`);
    }
    const ids = Array.from(this._ptys.keys());
    const serialized = await this._remoteTerminalChannel.serializeTerminalState(ids);
    this._storageService.store(TerminalStorageKeys.TerminalBufferState, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, options, shouldPersist) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot create remote terminal when there is no remote!`);
    }
    const remoteEnv = await this._remoteAgentService.getEnvironment();
    if (!remoteEnv) {
      throw new Error("Could not fetch remote environment");
    }
    const terminalConfig = this._configurationService.getValue(TERMINAL_CONFIG_SECTION);
    const configuration = {
      "terminal.integrated.env.windows": this._configurationService.getValue(TerminalSettingId.EnvWindows),
      "terminal.integrated.env.osx": this._configurationService.getValue(TerminalSettingId.EnvMacOs),
      "terminal.integrated.env.linux": this._configurationService.getValue(TerminalSettingId.EnvLinux),
      "terminal.integrated.cwd": this._configurationService.getValue(TerminalSettingId.Cwd),
      "terminal.integrated.detectLocale": terminalConfig.detectLocale
    };
    const shellLaunchConfigDto = {
      name: shellLaunchConfig.name,
      executable: shellLaunchConfig.executable,
      args: shellLaunchConfig.args,
      cwd: shellLaunchConfig.cwd,
      env: shellLaunchConfig.env,
      useShellEnvironment: shellLaunchConfig.useShellEnvironment,
      reconnectionProperties: shellLaunchConfig.reconnectionProperties,
      type: shellLaunchConfig.type,
      isFeatureTerminal: shellLaunchConfig.isFeatureTerminal,
      forceShellIntegration: shellLaunchConfig.forceShellIntegration,
      tabActions: shellLaunchConfig.tabActions,
      shellIntegrationEnvironmentReporting: shellLaunchConfig.shellIntegrationEnvironmentReporting
    };
    const activeWorkspaceRootUri = getWorkspaceForTerminal(shellLaunchConfig.cwd, this._workspaceContextService, this._historyService)?.uri;
    const result = await this._remoteTerminalChannel.createProcess(
      shellLaunchConfigDto,
      configuration,
      activeWorkspaceRootUri,
      options,
      shouldPersist,
      cols,
      rows,
      unicodeVersion
    );
    const pty = this._instantiationService.createInstance(RemotePty, result.persistentTerminalId, shouldPersist, this._remoteTerminalChannel);
    this._ptys.set(result.persistentTerminalId, pty);
    return pty;
  }
  async attachToProcess(id) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot create remote terminal when there is no remote!`);
    }
    try {
      await this._remoteTerminalChannel.attachToProcess(id);
      const pty = this._instantiationService.createInstance(RemotePty, id, true, this._remoteTerminalChannel);
      this._ptys.set(id, pty);
      return pty;
    } catch (e) {
      this._logService.trace(`Couldn't attach to process ${e.message}`);
    }
    return void 0;
  }
  async attachToRevivedProcess(id) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot create remote terminal when there is no remote!`);
    }
    try {
      const newId = await this._remoteTerminalChannel.getRevivedPtyNewId(id) ?? id;
      return await this.attachToProcess(newId);
    } catch (e) {
      this._logService.trace(`Couldn't attach to process ${e.message}`);
    }
    return void 0;
  }
  async listProcesses() {
    return this._remoteTerminalChannel.listProcesses();
  }
  async getLatency() {
    const sw = new StopWatch();
    const results = await this._remoteTerminalChannel.getLatency();
    sw.stop();
    return [
      {
        label: "window<->ptyhostservice<->ptyhost",
        latency: sw.elapsed()
      },
      ...results
    ];
  }
  async updateProperty(id, property, value) {
    await this._remoteTerminalChannel.updateProperty(id, property, value);
  }
  async updateTitle(id, title, titleSource) {
    await this._remoteTerminalChannel.updateTitle(id, title, titleSource);
  }
  async updateIcon(id, userInitiated, icon, color) {
    await this._remoteTerminalChannel.updateIcon(id, userInitiated, icon, color);
  }
  async setNextCommandId(id, commandLine, commandId) {
    await this._remoteTerminalChannel.setNextCommandId(id, commandLine, commandId);
  }
  async getDefaultSystemShell(osOverride) {
    return this._remoteTerminalChannel.getDefaultSystemShell(osOverride) || "";
  }
  async getProfiles(profiles, defaultProfile, includeDetectedProfiles) {
    return this._remoteTerminalChannel.getProfiles(profiles, defaultProfile, includeDetectedProfiles) || [];
  }
  async getEnvironment() {
    return this._remoteTerminalChannel.getEnvironment() || {};
  }
  async getShellEnvironment() {
    const connection = this._remoteAgentService.getConnection();
    if (!connection) {
      return void 0;
    }
    const resolverResult = await this._remoteAuthorityResolverService.resolveAuthority(connection.remoteAuthority);
    const envResult = {};
    if (resolverResult.options?.extensionHostEnv) {
      for (const [key, value] of Object.entries(resolverResult.options.extensionHostEnv)) {
        if (value !== null) {
          envResult[key] = value;
        }
      }
    }
    return envResult;
  }
  async getWslPath(original, direction) {
    const env = await this._remoteAgentService.getEnvironment();
    if (env?.os !== OperatingSystem.Windows) {
      return original;
    }
    return this._remoteTerminalChannel.getWslPath(original, direction) || original;
  }
  async setTerminalLayoutInfo(layout) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot call setActiveInstanceId when there is no remote`);
    }
    return this._remoteTerminalChannel.setTerminalLayoutInfo(layout);
  }
  async reduceConnectionGraceTime() {
    if (!this._remoteTerminalChannel) {
      throw new Error("Cannot reduce grace time when there is no remote");
    }
    return this._remoteTerminalChannel.reduceConnectionGraceTime();
  }
  async getTerminalLayoutInfo() {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot call getActiveInstanceId when there is no remote`);
    }
    const workspaceId = this._getWorkspaceId();
    const serializedState = this._storageService.get(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
    const reviveBufferState = this._deserializeTerminalState(serializedState);
    if (reviveBufferState && reviveBufferState.length > 0) {
      try {
        mark("code/terminal/willReviveTerminalProcessesRemote");
        await this._remoteTerminalChannel.reviveTerminalProcesses(workspaceId, reviveBufferState, Intl.DateTimeFormat().resolvedOptions().locale);
        mark("code/terminal/didReviveTerminalProcessesRemote");
        this._storageService.remove(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
        const layoutInfo = this._storageService.get(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
        if (layoutInfo) {
          mark("code/terminal/willSetTerminalLayoutInfoRemote");
          await this._remoteTerminalChannel.setTerminalLayoutInfo(JSON.parse(layoutInfo));
          mark("code/terminal/didSetTerminalLayoutInfoRemote");
          this._storageService.remove(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
        }
      } catch (e) {
        this._logService.warn("RemoteTerminalBackend#getTerminalLayoutInfo Error", e.message ?? e);
      }
    }
    return this._remoteTerminalChannel.getTerminalLayoutInfo();
  }
  async getPerformanceMarks() {
    return this._remoteTerminalChannel.getPerformanceMarks();
  }
  installAutoReply(match, reply) {
    return this._remoteTerminalChannel.installAutoReply(match, reply);
  }
  uninstallAllAutoReplies() {
    return this._remoteTerminalChannel.uninstallAllAutoReplies();
  }
};
RemoteTerminalBackend = __decorateClass([
  __decorateParam(2, IRemoteAgentService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ITerminalLogService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IRemoteAuthorityResolverService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IConfigurationResolverService),
  __decorateParam(10, IHistoryService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IStatusbarService)
], RemoteTerminalBackend);
export {
  RemoteTerminalBackendContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFxyZW1vdGVUZXJtaW5hbEJhY2tlbmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgUGVyZm9ybWFuY2VNYXJrLCBtYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElTZXJpYWxpemVkVGVybWluYWxDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSVB0eUhvc3RMYXRlbmN5TWVhc3VyZW1lbnQsIElTaGVsbExhdW5jaENvbmZpZywgSVNoZWxsTGF1bmNoQ29uZmlnRHRvLCBJVGVybWluYWxCYWNrZW5kLCBJVGVybWluYWxCYWNrZW5kUmVnaXN0cnksIElUZXJtaW5hbENoaWxkUHJvY2VzcywgSVRlcm1pbmFsRW52aXJvbm1lbnQsIElUZXJtaW5hbExvZ1NlcnZpY2UsIElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLCBJVGVybWluYWxQcm9maWxlLCBJVGVybWluYWxzTGF5b3V0SW5mbywgSVRlcm1pbmFsc0xheW91dEluZm9CeUlkLCBQcm9jZXNzUHJvcGVydHlUeXBlLCBUZXJtaW5hbEV4dGVuc2lvbnMsIFRlcm1pbmFsSWNvbiwgVGVybWluYWxTZXR0aW5nSWQsIFRpdGxlRXZlbnRTb3VyY2UsIHR5cGUgSVByb2Nlc3NQcm9wZXJ0eU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0RldGFpbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxQcm9jZXNzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBCYXNlVGVybWluYWxCYWNrZW5kIH0gZnJvbSAnLi9iYXNlVGVybWluYWxCYWNrZW5kLmpzJztcbmltcG9ydCB7IFJlbW90ZVB0eSB9IGZyb20gJy4vcmVtb3RlUHR5LmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlU2VydmljZSB9IGZyb20gJy4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgUmVtb3RlVGVybWluYWxDaGFubmVsQ2xpZW50LCBSRU1PVEVfVEVSTUlOQUxfQ0hBTk5FTF9OQU1FIH0gZnJvbSAnLi4vY29tbW9uL3JlbW90ZS9yZW1vdGVUZXJtaW5hbENoYW5uZWwuanMnO1xuaW1wb3J0IHsgSUNvbXBsZXRlVGVybWluYWxDb25maWd1cmF0aW9uLCBJVGVybWluYWxDb25maWd1cmF0aW9uLCBURVJNSU5BTF9DT05GSUdfU0VDVElPTiB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFN0b3JhZ2VLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3RvcmFnZUtleXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IGdldFdvcmtzcGFjZUZvclRlcm1pbmFsIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsRW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcblxuZXhwb3J0IGNsYXNzIFJlbW90ZVRlcm1pbmFsQmFja2VuZENvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgSUQgPSAncmVtb3RlVGVybWluYWxCYWNrZW5kJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UgdGVybWluYWxJbnN0YW5jZVNlcnZpY2U6IElUZXJtaW5hbEluc3RhbmNlU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoY29ubmVjdGlvbj8ucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRjb25zdCBjaGFubmVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlVGVybWluYWxDaGFubmVsQ2xpZW50LCBjb25uZWN0aW9uLnJlbW90ZUF1dGhvcml0eSwgY29ubmVjdGlvbi5nZXRDaGFubmVsKFJFTU9URV9URVJNSU5BTF9DSEFOTkVMX05BTUUpKTtcblx0XHRcdGNvbnN0IGJhY2tlbmQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVUZXJtaW5hbEJhY2tlbmQsIGNvbm5lY3Rpb24ucmVtb3RlQXV0aG9yaXR5LCBjaGFubmVsKTtcblx0XHRcdFJlZ2lzdHJ5LmFzPElUZXJtaW5hbEJhY2tlbmRSZWdpc3RyeT4oVGVybWluYWxFeHRlbnNpb25zLkJhY2tlbmQpLnJlZ2lzdGVyVGVybWluYWxCYWNrZW5kKGJhY2tlbmQpO1xuXHRcdFx0dGVybWluYWxJbnN0YW5jZVNlcnZpY2UuZGlkUmVnaXN0ZXJCYWNrZW5kKGJhY2tlbmQpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSZW1vdGVUZXJtaW5hbEJhY2tlbmQgZXh0ZW5kcyBCYXNlVGVybWluYWxCYWNrZW5kIGltcGxlbWVudHMgSVRlcm1pbmFsQmFja2VuZCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B0eXM6IE1hcDxudW1iZXIsIFJlbW90ZVB0eT4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2hlbkNvbm5lY3RlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0Z2V0IHdoZW5SZWFkeSgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIHRoaXMuX3doZW5Db25uZWN0ZWQucDsgfVxuXHRzZXRSZWFkeSgpOiB2b2lkIHsgdGhpcy5fd2hlbkNvbm5lY3RlZC5jb21wbGV0ZSgpOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0RGV0YWNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZXF1ZXN0SWQ6IG51bWJlcjsgd29ya3NwYWNlSWQ6IHN0cmluZzsgaW5zdGFuY2VJZDogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3REZXRhY2ggPSB0aGlzLl9vbkRpZFJlcXVlc3REZXRhY2guZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUmVzdG9yZUNvbW1hbmRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogbnVtYmVyOyBjb21tYW5kczogSVNlcmlhbGl6ZWRUZXJtaW5hbENvbW1hbmRbXSB9PigpKTtcblx0cmVhZG9ubHkgb25SZXN0b3JlQ29tbWFuZHMgPSB0aGlzLl9vblJlc3RvcmVDb21tYW5kcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVUZXJtaW5hbENoYW5uZWw6IFJlbW90ZVRlcm1pbmFsQ2hhbm5lbENsaWVudCxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBzdGF0dXNCYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihfcmVtb3RlVGVybWluYWxDaGFubmVsLCBsb2dTZXJ2aWNlLCBfaGlzdG9yeVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsIHN0YXR1c0JhclNlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5vblByb2Nlc3NEYXRhKGUgPT4gdGhpcy5fcHR5cy5nZXQoZS5pZCk/LmhhbmRsZURhdGEoZS5ldmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwub25Qcm9jZXNzUmVwbGF5KGUgPT4ge1xuXHRcdFx0dGhpcy5fcHR5cy5nZXQoZS5pZCk/LmhhbmRsZVJlcGxheShlLmV2ZW50KTtcblx0XHRcdGlmIChlLmV2ZW50LmNvbW1hbmRzLmNvbW1hbmRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fb25SZXN0b3JlQ29tbWFuZHMuZmlyZSh7IGlkOiBlLmlkLCBjb21tYW5kczogZS5ldmVudC5jb21tYW5kcy5jb21tYW5kcyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLm9uUHJvY2Vzc09ycGhhblF1ZXN0aW9uKGUgPT4gdGhpcy5fcHR5cy5nZXQoZS5pZCk/LmhhbmRsZU9ycGhhblF1ZXN0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwub25EaWRSZXF1ZXN0RGV0YWNoKGUgPT4gdGhpcy5fb25EaWRSZXF1ZXN0RGV0YWNoLmZpcmUoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwub25Qcm9jZXNzUmVhZHkoZSA9PiB0aGlzLl9wdHlzLmdldChlLmlkKT8uaGFuZGxlUmVhZHkoZS5ldmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwub25EaWRDaGFuZ2VQcm9wZXJ0eShlID0+IHRoaXMuX3B0eXMuZ2V0KGUuaWQpPy5oYW5kbGVEaWRDaGFuZ2VQcm9wZXJ0eShlLnByb3BlcnR5KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5vblByb2Nlc3NFeGl0KGUgPT4ge1xuXHRcdFx0Y29uc3QgcHR5ID0gdGhpcy5fcHR5cy5nZXQoZS5pZCk7XG5cdFx0XHRpZiAocHR5KSB7XG5cdFx0XHRcdHB0eS5oYW5kbGVFeGl0KGUuZXZlbnQpO1xuXHRcdFx0XHRwdHkuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9wdHlzLmRlbGV0ZShlLmlkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBhbGxvd2VkQ29tbWFuZHMgPSBbJ19yZW1vdGVDTEkub3BlbkV4dGVybmFsJywgJ19yZW1vdGVDTEkud2luZG93T3BlbicsICdfcmVtb3RlQ0xJLmdldFN5c3RlbVN0YXR1cycsICdfcmVtb3RlQ0xJLm1hbmFnZUV4dGVuc2lvbnMnXTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwub25FeGVjdXRlQ29tbWFuZChhc3luYyBlID0+IHtcblx0XHRcdC8vIEVuc3VyZSB0aGlzIHJlcXVlc3QgZm9yIGZvciB0aGlzIHdpbmRvd1xuXHRcdFx0Y29uc3QgcHR5ID0gdGhpcy5fcHR5cy5nZXQoZS5wZXJzaXN0ZW50UHJvY2Vzc0lkKTtcblx0XHRcdGlmICghcHR5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlcUlkID0gZS5yZXFJZDtcblx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IGUuY29tbWFuZElkO1xuXHRcdFx0aWYgKCFhbGxvd2VkQ29tbWFuZHMuaW5jbHVkZXMoY29tbWFuZElkKSkge1xuXHRcdFx0XHR0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuc2VuZENvbW1hbmRSZXN1bHQocmVxSWQsIHRydWUsICdJbnZhbGlkIHJlbW90ZSBjbGkgY29tbWFuZDogJyArIGNvbW1hbmRJZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbW1hbmRBcmdzID0gZS5jb21tYW5kQXJncy5tYXAoYXJnID0+IHJldml2ZShhcmcpKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGUuY29tbWFuZElkLCAuLi5jb21tYW5kQXJncyk7XG5cdFx0XHRcdHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5zZW5kQ29tbWFuZFJlc3VsdChyZXFJZCwgZmFsc2UsIHJlc3VsdCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLnNlbmRDb21tYW5kUmVzdWx0KHJlcUlkLCB0cnVlLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX29uUHR5SG9zdENvbm5lY3RlZC5maXJlKCk7XG5cdH1cblxuXHRhc3luYyByZXF1ZXN0RGV0YWNoSW5zdGFuY2Uod29ya3NwYWNlSWQ6IHN0cmluZywgaW5zdGFuY2VJZDogbnVtYmVyKTogUHJvbWlzZTxJUHJvY2Vzc0RldGFpbHMgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVxdWVzdCBkZXRhY2ggaW5zdGFuY2Ugd2hlbiB0aGVyZSBpcyBubyByZW1vdGUhYCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwucmVxdWVzdERldGFjaEluc3RhbmNlKHdvcmtzcGFjZUlkLCBpbnN0YW5jZUlkKTtcblx0fVxuXG5cdGFzeW5jIGFjY2VwdERldGFjaEluc3RhbmNlUmVwbHkocmVxdWVzdElkOiBudW1iZXIsIHBlcnNpc3RlbnRQcm9jZXNzSWQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgYWNjZXB0IGRldGFjaGVkIGluc3RhbmNlIHdoZW4gdGhlcmUgaXMgbm8gcmVtb3RlIWApO1xuXHRcdH0gZWxzZSBpZiAoIXBlcnNpc3RlbnRQcm9jZXNzSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignQ2Fubm90IGF0dGFjaCB0byBmZWF0dXJlIHRlcm1pbmFscywgY3VzdG9tIHB0eSB0ZXJtaW5hbHMsIG9yIHRob3NlIHdpdGhvdXQgYSBwZXJzaXN0ZW50UHJvY2Vzc0lkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5hY2NlcHREZXRhY2hJbnN0YW5jZVJlcGx5KHJlcXVlc3RJZCwgcGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cdH1cblxuXHRhc3luYyBwZXJzaXN0VGVybWluYWxTdGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcGVyc2lzdCB0ZXJtaW5hbCBzdGF0ZSB3aGVuIHRoZXJlIGlzIG5vIHJlbW90ZSFgKTtcblx0XHR9XG5cdFx0Y29uc3QgaWRzID0gQXJyYXkuZnJvbSh0aGlzLl9wdHlzLmtleXMoKSk7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZCA9IGF3YWl0IHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5zZXJpYWxpemVUZXJtaW5hbFN0YXRlKGlkcyk7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVGVybWluYWxTdG9yYWdlS2V5cy5UZXJtaW5hbEJ1ZmZlclN0YXRlLCBzZXJpYWxpemVkLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlUHJvY2Vzcyhcblx0XHRzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdGN3ZDogc3RyaW5nLCAvLyBUT0RPOiBUaGlzIGlzIGlnbm9yZWRcblx0XHRjb2xzOiBudW1iZXIsXG5cdFx0cm93czogbnVtYmVyLFxuXHRcdHVuaWNvZGVWZXJzaW9uOiAnNicgfCAnMTEnLFxuXHRcdGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCwgLy8gVE9ETzogVGhpcyBpcyBpZ25vcmVkXG5cdFx0b3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsXG5cdFx0c2hvdWxkUGVyc2lzdDogYm9vbGVhblxuXHQpOiBQcm9taXNlPElUZXJtaW5hbENoaWxkUHJvY2Vzcz4ge1xuXHRcdGlmICghdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjcmVhdGUgcmVtb3RlIHRlcm1pbmFsIHdoZW4gdGhlcmUgaXMgbm8gcmVtb3RlIWApO1xuXHRcdH1cblxuXHRcdC8vIEZldGNoIHRoZSBlbnZpcm9ubWVudCB0byBjaGVjayBzaGVsbCBwZXJtaXNzaW9uc1xuXHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdGlmICghcmVtb3RlRW52KSB7XG5cdFx0XHQvLyBFeHRlbnNpb24gaG9zdCBwcm9jZXNzZXMgYXJlIG9ubHkgYWxsb3dlZCBpbiByZW1vdGUgZXh0ZW5zaW9uIGhvc3RzIGN1cnJlbnRseVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZmV0Y2ggcmVtb3RlIGVudmlyb25tZW50Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVybWluYWxDb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVGVybWluYWxDb25maWd1cmF0aW9uPihURVJNSU5BTF9DT05GSUdfU0VDVElPTik7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbjogSUNvbXBsZXRlVGVybWluYWxDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0J3Rlcm1pbmFsLmludGVncmF0ZWQuZW52LndpbmRvd3MnOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5FbnZXaW5kb3dzKSBhcyBJVGVybWluYWxFbnZpcm9ubWVudCxcblx0XHRcdCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudi5vc3gnOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5FbnZNYWNPcykgYXMgSVRlcm1pbmFsRW52aXJvbm1lbnQsXG5cdFx0XHQndGVybWluYWwuaW50ZWdyYXRlZC5lbnYubGludXgnOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5FbnZMaW51eCkgYXMgSVRlcm1pbmFsRW52aXJvbm1lbnQsXG5cdFx0XHQndGVybWluYWwuaW50ZWdyYXRlZC5jd2QnOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5Dd2QpIGFzIHN0cmluZyxcblx0XHRcdCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRldGVjdExvY2FsZSc6IHRlcm1pbmFsQ29uZmlnLmRldGVjdExvY2FsZVxuXHRcdH07XG5cblx0XHRjb25zdCBzaGVsbExhdW5jaENvbmZpZ0R0bzogSVNoZWxsTGF1bmNoQ29uZmlnRHRvID0ge1xuXHRcdFx0bmFtZTogc2hlbGxMYXVuY2hDb25maWcubmFtZSxcblx0XHRcdGV4ZWN1dGFibGU6IHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUsXG5cdFx0XHRhcmdzOiBzaGVsbExhdW5jaENvbmZpZy5hcmdzLFxuXHRcdFx0Y3dkOiBzaGVsbExhdW5jaENvbmZpZy5jd2QsXG5cdFx0XHRlbnY6IHNoZWxsTGF1bmNoQ29uZmlnLmVudixcblx0XHRcdHVzZVNoZWxsRW52aXJvbm1lbnQ6IHNoZWxsTGF1bmNoQ29uZmlnLnVzZVNoZWxsRW52aXJvbm1lbnQsXG5cdFx0XHRyZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzOiBzaGVsbExhdW5jaENvbmZpZy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzLFxuXHRcdFx0dHlwZTogc2hlbGxMYXVuY2hDb25maWcudHlwZSxcblx0XHRcdGlzRmVhdHVyZVRlcm1pbmFsOiBzaGVsbExhdW5jaENvbmZpZy5pc0ZlYXR1cmVUZXJtaW5hbCxcblx0XHRcdGZvcmNlU2hlbGxJbnRlZ3JhdGlvbjogc2hlbGxMYXVuY2hDb25maWcuZm9yY2VTaGVsbEludGVncmF0aW9uLFxuXHRcdFx0dGFiQWN0aW9uczogc2hlbGxMYXVuY2hDb25maWcudGFiQWN0aW9ucyxcblx0XHRcdHNoZWxsSW50ZWdyYXRpb25FbnZpcm9ubWVudFJlcG9ydGluZzogc2hlbGxMYXVuY2hDb25maWcuc2hlbGxJbnRlZ3JhdGlvbkVudmlyb25tZW50UmVwb3J0aW5nLFxuXHRcdH07XG5cdFx0Y29uc3QgYWN0aXZlV29ya3NwYWNlUm9vdFVyaSA9IGdldFdvcmtzcGFjZUZvclRlcm1pbmFsKHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHRoaXMuX2hpc3RvcnlTZXJ2aWNlKT8udXJpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmNyZWF0ZVByb2Nlc3MoXG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZ0R0byxcblx0XHRcdGNvbmZpZ3VyYXRpb24sXG5cdFx0XHRhY3RpdmVXb3Jrc3BhY2VSb290VXJpLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdHNob3VsZFBlcnNpc3QsXG5cdFx0XHRjb2xzLFxuXHRcdFx0cm93cyxcblx0XHRcdHVuaWNvZGVWZXJzaW9uXG5cdFx0KTtcblx0XHRjb25zdCBwdHkgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVQdHksIHJlc3VsdC5wZXJzaXN0ZW50VGVybWluYWxJZCwgc2hvdWxkUGVyc2lzdCwgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsKTtcblx0XHR0aGlzLl9wdHlzLnNldChyZXN1bHQucGVyc2lzdGVudFRlcm1pbmFsSWQsIHB0eSk7XG5cdFx0cmV0dXJuIHB0eTtcblx0fVxuXG5cdGFzeW5jIGF0dGFjaFRvUHJvY2VzcyhpZDogbnVtYmVyKTogUHJvbWlzZTxJVGVybWluYWxDaGlsZFByb2Nlc3MgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY3JlYXRlIHJlbW90ZSB0ZXJtaW5hbCB3aGVuIHRoZXJlIGlzIG5vIHJlbW90ZSFgKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmF0dGFjaFRvUHJvY2VzcyhpZCk7XG5cdFx0XHRjb25zdCBwdHkgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVQdHksIGlkLCB0cnVlLCB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwpO1xuXHRcdFx0dGhpcy5fcHR5cy5zZXQoaWQsIHB0eSk7XG5cdFx0XHRyZXR1cm4gcHR5O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYENvdWxkbid0IGF0dGFjaCB0byBwcm9jZXNzICR7ZS5tZXNzYWdlfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgYXR0YWNoVG9SZXZpdmVkUHJvY2VzcyhpZDogbnVtYmVyKTogUHJvbWlzZTxJVGVybWluYWxDaGlsZFByb2Nlc3MgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY3JlYXRlIHJlbW90ZSB0ZXJtaW5hbCB3aGVuIHRoZXJlIGlzIG5vIHJlbW90ZSFgKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbmV3SWQgPSBhd2FpdCB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuZ2V0UmV2aXZlZFB0eU5ld0lkKGlkKSA/PyBpZDtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmF0dGFjaFRvUHJvY2VzcyhuZXdJZCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgQ291bGRuJ3QgYXR0YWNoIHRvIHByb2Nlc3MgJHtlLm1lc3NhZ2V9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBsaXN0UHJvY2Vzc2VzKCk6IFByb21pc2U8SVByb2Nlc3NEZXRhaWxzW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmxpc3RQcm9jZXNzZXMoKTtcblx0fVxuXG5cdGFzeW5jIGdldExhdGVuY3koKTogUHJvbWlzZTxJUHR5SG9zdExhdGVuY3lNZWFzdXJlbWVudFtdPiB7XG5cdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5nZXRMYXRlbmN5KCk7XG5cdFx0c3cuc3RvcCgpO1xuXHRcdHJldHVybiBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnd2luZG93PC0+cHR5aG9zdHNlcnZpY2U8LT5wdHlob3N0Jyxcblx0XHRcdFx0bGF0ZW5jeTogc3cuZWxhcHNlZCgpXG5cdFx0XHR9LFxuXHRcdFx0Li4ucmVzdWx0c1xuXHRcdF07XG5cdH1cblxuXHRhc3luYyB1cGRhdGVQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4oaWQ6IG51bWJlciwgcHJvcGVydHk6IFQsIHZhbHVlOiBJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLnVwZGF0ZVByb3BlcnR5KGlkLCBwcm9wZXJ0eSwgdmFsdWUpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlVGl0bGUoaWQ6IG51bWJlciwgdGl0bGU6IHN0cmluZywgdGl0bGVTb3VyY2U6IFRpdGxlRXZlbnRTb3VyY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwudXBkYXRlVGl0bGUoaWQsIHRpdGxlLCB0aXRsZVNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVJY29uKGlkOiBudW1iZXIsIHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4sIGljb246IFRlcm1pbmFsSWNvbiwgY29sb3I/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwudXBkYXRlSWNvbihpZCwgdXNlckluaXRpYXRlZCwgaWNvbiwgY29sb3IpO1xuXHR9XG5cblx0YXN5bmMgc2V0TmV4dENvbW1hbmRJZChpZDogbnVtYmVyLCBjb21tYW5kTGluZTogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5zZXROZXh0Q29tbWFuZElkKGlkLCBjb21tYW5kTGluZSwgY29tbWFuZElkKTtcblx0fVxuXG5cdGFzeW5jIGdldERlZmF1bHRTeXN0ZW1TaGVsbChvc092ZXJyaWRlPzogT3BlcmF0aW5nU3lzdGVtKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmdldERlZmF1bHRTeXN0ZW1TaGVsbChvc092ZXJyaWRlKSB8fCAnJztcblx0fVxuXG5cdGFzeW5jIGdldFByb2ZpbGVzKHByb2ZpbGVzOiB1bmtub3duLCBkZWZhdWx0UHJvZmlsZTogdW5rbm93biwgaW5jbHVkZURldGVjdGVkUHJvZmlsZXM/OiBib29sZWFuKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmdldFByb2ZpbGVzKHByb2ZpbGVzLCBkZWZhdWx0UHJvZmlsZSwgaW5jbHVkZURldGVjdGVkUHJvZmlsZXMpIHx8IFtdO1xuXHR9XG5cblx0YXN5bmMgZ2V0RW52aXJvbm1lbnQoKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5nZXRFbnZpcm9ubWVudCgpIHx8IHt9O1xuXHR9XG5cblx0YXN5bmMgZ2V0U2hlbGxFbnZpcm9ubWVudCgpOiBQcm9taXNlPElQcm9jZXNzRW52aXJvbm1lbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVyUmVzdWx0ID0gYXdhaXQgdGhpcy5fcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVBdXRob3JpdHkoY29ubmVjdGlvbi5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdGNvbnN0IGVudlJlc3VsdDogSVByb2Nlc3NFbnZpcm9ubWVudCA9IHt9O1xuXHRcdGlmIChyZXNvbHZlclJlc3VsdC5vcHRpb25zPy5leHRlbnNpb25Ib3N0RW52KSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyZXNvbHZlclJlc3VsdC5vcHRpb25zLmV4dGVuc2lvbkhvc3RFbnYpKSB7XG5cdFx0XHRcdGlmICh2YWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdGVudlJlc3VsdFtrZXldID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGVudlJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGdldFdzbFBhdGgob3JpZ2luYWw6IHN0cmluZywgZGlyZWN0aW9uOiAndW5peC10by13aW4nIHwgJ3dpbi10by11bml4Jyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZW52ID0gYXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCk7XG5cdFx0aWYgKGVudj8ub3MgIT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuZ2V0V3NsUGF0aChvcmlnaW5hbCwgZGlyZWN0aW9uKSB8fCBvcmlnaW5hbDtcblx0fVxuXG5cdGFzeW5jIHNldFRlcm1pbmFsTGF5b3V0SW5mbyhsYXlvdXQ/OiBJVGVybWluYWxzTGF5b3V0SW5mb0J5SWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY2FsbCBzZXRBY3RpdmVJbnN0YW5jZUlkIHdoZW4gdGhlcmUgaXMgbm8gcmVtb3RlYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5zZXRUZXJtaW5hbExheW91dEluZm8obGF5b3V0KTtcblx0fVxuXG5cdGFzeW5jIHJlZHVjZUNvbm5lY3Rpb25HcmFjZVRpbWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlZHVjZSBncmFjZSB0aW1lIHdoZW4gdGhlcmUgaXMgbm8gcmVtb3RlJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwucmVkdWNlQ29ubmVjdGlvbkdyYWNlVGltZSgpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VGVybWluYWxMYXlvdXRJbmZvKCk6IFByb21pc2U8SVRlcm1pbmFsc0xheW91dEluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY2FsbCBnZXRBY3RpdmVJbnN0YW5jZUlkIHdoZW4gdGhlcmUgaXMgbm8gcmVtb3RlYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlSWQgPSB0aGlzLl9nZXRXb3Jrc3BhY2VJZCgpO1xuXG5cdFx0Ly8gUmV2aXZlIHByb2Nlc3NlcyBpZiBuZWVkZWRcblx0XHRjb25zdCBzZXJpYWxpemVkU3RhdGUgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoVGVybWluYWxTdG9yYWdlS2V5cy5UZXJtaW5hbEJ1ZmZlclN0YXRlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRjb25zdCByZXZpdmVCdWZmZXJTdGF0ZSA9IHRoaXMuX2Rlc2VyaWFsaXplVGVybWluYWxTdGF0ZShzZXJpYWxpemVkU3RhdGUpO1xuXHRcdGlmIChyZXZpdmVCdWZmZXJTdGF0ZSAmJiByZXZpdmVCdWZmZXJTdGF0ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBOb3RlIHRoYXQgcmVtb3RlIHRlcm1pbmFscyBkbyBub3QgZ2V0IHRoZWlyIGVudmlyb25tZW50IHJlLXJlc29sdmVkIHVubGlrZSBpbiBsb2NhbCB0ZXJtaW5hbHNcblxuXHRcdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL3dpbGxSZXZpdmVUZXJtaW5hbFByb2Nlc3Nlc1JlbW90ZScpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwucmV2aXZlVGVybWluYWxQcm9jZXNzZXMod29ya3NwYWNlSWQsIHJldml2ZUJ1ZmZlclN0YXRlLCBJbnRsLkRhdGVUaW1lRm9ybWF0KCkucmVzb2x2ZWRPcHRpb25zKCkubG9jYWxlKTtcblx0XHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC9kaWRSZXZpdmVUZXJtaW5hbFByb2Nlc3Nlc1JlbW90ZScpO1xuXHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoVGVybWluYWxTdG9yYWdlS2V5cy5UZXJtaW5hbEJ1ZmZlclN0YXRlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRcdFx0Ly8gSWYgcmV2aXZpbmcgcHJvY2Vzc2VzLCBzZW5kIHRoZSB0ZXJtaW5hbCBsYXlvdXQgaW5mbyBiYWNrIHRvIHRoZSBwdHkgaG9zdCBhcyBpdFxuXHRcdFx0XHQvLyB3aWxsIG5vdCBoYXZlIGJlZW4gcGVyc2lzdGVkIG9uIGFwcGxpY2F0aW9uIGV4aXRcblx0XHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChUZXJtaW5hbFN0b3JhZ2VLZXlzLlRlcm1pbmFsTGF5b3V0SW5mbywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRcdGlmIChsYXlvdXRJbmZvKSB7XG5cdFx0XHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC93aWxsU2V0VGVybWluYWxMYXlvdXRJbmZvUmVtb3RlJyk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLnNldFRlcm1pbmFsTGF5b3V0SW5mbyhKU09OLnBhcnNlKGxheW91dEluZm8pKTtcblx0XHRcdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZFNldFRlcm1pbmFsTGF5b3V0SW5mb1JlbW90ZScpO1xuXHRcdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShUZXJtaW5hbFN0b3JhZ2VLZXlzLlRlcm1pbmFsTGF5b3V0SW5mbywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGU6IHVua25vd24pIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdSZW1vdGVUZXJtaW5hbEJhY2tlbmQjZ2V0VGVybWluYWxMYXlvdXRJbmZvIEVycm9yJywgKDx7IG1lc3NhZ2U/OiBzdHJpbmcgfT5lKS5tZXNzYWdlID8/IGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuZ2V0VGVybWluYWxMYXlvdXRJbmZvKCk7XG5cdH1cblxuXHRhc3luYyBnZXRQZXJmb3JtYW5jZU1hcmtzKCk6IFByb21pc2U8UGVyZm9ybWFuY2VNYXJrW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmdldFBlcmZvcm1hbmNlTWFya3MoKTtcblx0fVxuXG5cdGluc3RhbGxBdXRvUmVwbHkobWF0Y2g6IHN0cmluZywgcmVwbHk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuaW5zdGFsbEF1dG9SZXBseShtYXRjaCwgcmVwbHkpO1xuXHR9XG5cblx0dW5pbnN0YWxsQWxsQXV0b1JlcGxpZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC51bmluc3RhbGxBbGxBdXRvUmVwbGllcygpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBMEIsWUFBWTtBQUN0QyxTQUE4Qix1QkFBdUI7QUFDckQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFFN0QsU0FBeUsscUJBQXFJLG9CQUFrQyx5QkFBcUU7QUFFclosU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkIsb0NBQW9DO0FBQzFFLFNBQWlFLCtCQUErQjtBQUNoRyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUF5QjtBQUUzQixJQUFNLG9DQUFOLE1B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
