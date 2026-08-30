import * as os from "os";
import { Emitter, Event } from "../../base/common/event.js";
import { cloneAndChange } from "../../base/common/objects.js";
import { Disposable } from "../../base/common/lifecycle.js";
import * as path from "../../base/common/path.js";
import * as platform from "../../base/common/platform.js";
import { removeDangerousEnvVariables } from "../../base/common/processes.js";
import { URI } from "../../base/common/uri.js";
import { createRandomIPCHandle } from "../../base/parts/ipc/node/ipc.net.js";
import { createURITransformer } from "../../base/common/uriTransformer.js";
import { CLIServerBase } from "../../workbench/api/node/extHostCLIServer.js";
import { MergedEnvironmentVariableCollection } from "../../platform/terminal/common/environmentVariableCollection.js";
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection } from "../../platform/terminal/common/environmentVariableShared.js";
import { RemoteTerminalChannelEvent, RemoteTerminalChannelRequest } from "../../workbench/contrib/terminal/common/remote/terminal.js";
import * as terminalEnvironment from "../../workbench/contrib/terminal/common/terminalEnvironment.js";
import { AbstractVariableResolverService } from "../../workbench/services/configurationResolver/common/variableResolver.js";
import { buildUserEnvironment } from "./extensionHostConnection.js";
import { promiseWithResolvers } from "../../base/common/async.js";
import { shouldUseEnvironmentVariableCollection } from "../../platform/terminal/common/terminalEnvironment.js";
class CustomVariableResolver extends AbstractVariableResolverService {
  constructor(env, workspaceFolders, activeFileResource, resolvedVariables, extensionService) {
    super({
      getFolderUri: (folderName) => {
        const found = workspaceFolders.filter((f) => f.name === folderName);
        if (found && found.length > 0) {
          return found[0].uri;
        }
        return void 0;
      },
      getWorkspaceFolderCount: () => {
        return workspaceFolders.length;
      },
      getConfigurationValue: (folderUri, section) => {
        return resolvedVariables[`config:${section}`];
      },
      getExecPath: () => {
        return env["VSCODE_EXEC_PATH"];
      },
      getAppRoot: () => {
        return env["VSCODE_CWD"];
      },
      getFilePath: () => {
        if (activeFileResource) {
          return path.normalize(activeFileResource.fsPath);
        }
        return void 0;
      },
      getSelectedText: () => {
        return resolvedVariables["selectedText"];
      },
      getLineNumber: () => {
        return resolvedVariables["lineNumber"];
      },
      getColumnNumber: () => {
        return resolvedVariables["columnNumber"];
      },
      getExtension: async (id) => {
        const installed = await extensionService.getInstalled();
        const found = installed.find((e) => e.identifier.id === id);
        return found && { extensionLocation: found.location };
      }
    }, void 0, Promise.resolve(os.homedir()), Promise.resolve(env));
  }
}
class RemoteTerminalChannel extends Disposable {
  constructor(_environmentService, _logService, _ptyHostService, _productService, _extensionManagementService, _configurationService) {
    super();
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._ptyHostService = _ptyHostService;
    this._productService = _productService;
    this._extensionManagementService = _extensionManagementService;
    this._configurationService = _configurationService;
    this._lastReqId = 0;
    this._pendingCommands = /* @__PURE__ */ new Map();
    this._onExecuteCommand = this._register(new Emitter());
    this.onExecuteCommand = this._onExecuteCommand.event;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async call(ctx, command, args) {
    switch (command) {
      case RemoteTerminalChannelRequest.RestartPtyHost:
        return this._ptyHostService.restartPtyHost.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.CreateProcess: {
        const uriTransformer = createURITransformer(ctx.remoteAuthority);
        return this._createProcess(uriTransformer, args);
      }
      case RemoteTerminalChannelRequest.AttachToProcess:
        return this._ptyHostService.attachToProcess.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.DetachFromProcess:
        return this._ptyHostService.detachFromProcess.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ListProcesses:
        return this._ptyHostService.listProcesses.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetLatency:
        return this._ptyHostService.getLatency.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetPerformanceMarks:
        return this._ptyHostService.getPerformanceMarks.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.OrphanQuestionReply:
        return this._ptyHostService.orphanQuestionReply.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.AcceptPtyHostResolvedVariables:
        return this._ptyHostService.acceptPtyHostResolvedVariables.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.Start:
        return this._ptyHostService.start.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.Input:
        return this._ptyHostService.input.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.SendSignal:
        return this._ptyHostService.sendSignal.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.AcknowledgeDataEvent:
        return this._ptyHostService.acknowledgeDataEvent.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.Shutdown:
        return this._ptyHostService.shutdown.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.Resize:
        return this._ptyHostService.resize.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ClearBuffer:
        return this._ptyHostService.clearBuffer.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetInitialCwd:
        return this._ptyHostService.getInitialCwd.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetCwd:
        return this._ptyHostService.getCwd.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ProcessBinary:
        return this._ptyHostService.processBinary.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.SendCommandResult:
        return this._sendCommandResult(args[0], args[1], args[2]);
      case RemoteTerminalChannelRequest.InstallAutoReply:
        return this._ptyHostService.installAutoReply.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.UninstallAllAutoReplies:
        return this._ptyHostService.uninstallAllAutoReplies.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetDefaultSystemShell:
        return this._getDefaultSystemShell.apply(this, args);
      case RemoteTerminalChannelRequest.GetProfiles:
        return this._getProfiles.apply(this, args);
      case RemoteTerminalChannelRequest.GetEnvironment:
        return this._getEnvironment();
      case RemoteTerminalChannelRequest.GetWslPath:
        return this._getWslPath(args[0], args[1]);
      case RemoteTerminalChannelRequest.GetTerminalLayoutInfo:
        return this._ptyHostService.getTerminalLayoutInfo(args);
      case RemoteTerminalChannelRequest.SetTerminalLayoutInfo:
        return this._ptyHostService.setTerminalLayoutInfo(args);
      case RemoteTerminalChannelRequest.SerializeTerminalState:
        return this._ptyHostService.serializeTerminalState.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ReviveTerminalProcesses:
        return this._ptyHostService.reviveTerminalProcesses.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetRevivedPtyNewId:
        return this._ptyHostService.getRevivedPtyNewId.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.SetUnicodeVersion:
        return this._ptyHostService.setUnicodeVersion.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.SetNextCommandId:
        return this._ptyHostService.setNextCommandId.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ReduceConnectionGraceTime:
        return this._reduceConnectionGraceTime();
      case RemoteTerminalChannelRequest.UpdateIcon:
        return this._ptyHostService.updateIcon.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.UpdateTitle:
        return this._ptyHostService.updateTitle.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.UpdateProperty:
        return this._ptyHostService.updateProperty.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.RefreshProperty:
        return this._ptyHostService.refreshProperty.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.RequestDetachInstance:
        return this._ptyHostService.requestDetachInstance(args[0], args[1]);
      case RemoteTerminalChannelRequest.AcceptDetachedInstance:
        return this._ptyHostService.acceptDetachInstanceReply(args[0], args[1]);
      case RemoteTerminalChannelRequest.FreePortKillProcess:
        return this._ptyHostService.freePortKillProcess.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.AcceptDetachInstanceReply:
        return this._ptyHostService.acceptDetachInstanceReply.apply(this._ptyHostService, args);
    }
    throw new Error(`IPC Command ${command} not found`);
  }
  listen(_, event, _arg) {
    switch (event) {
      case RemoteTerminalChannelEvent.OnPtyHostExitEvent:
        return this._ptyHostService.onPtyHostExit || Event.None;
      case RemoteTerminalChannelEvent.OnPtyHostStartEvent:
        return this._ptyHostService.onPtyHostStart || Event.None;
      case RemoteTerminalChannelEvent.OnPtyHostUnresponsiveEvent:
        return this._ptyHostService.onPtyHostUnresponsive || Event.None;
      case RemoteTerminalChannelEvent.OnPtyHostResponsiveEvent:
        return this._ptyHostService.onPtyHostResponsive || Event.None;
      case RemoteTerminalChannelEvent.OnPtyHostRequestResolveVariablesEvent:
        return this._ptyHostService.onPtyHostRequestResolveVariables || Event.None;
      case RemoteTerminalChannelEvent.OnProcessDataEvent:
        return this._ptyHostService.onProcessData;
      case RemoteTerminalChannelEvent.OnProcessReadyEvent:
        return this._ptyHostService.onProcessReady;
      case RemoteTerminalChannelEvent.OnProcessExitEvent:
        return this._ptyHostService.onProcessExit;
      case RemoteTerminalChannelEvent.OnProcessReplayEvent:
        return this._ptyHostService.onProcessReplay;
      case RemoteTerminalChannelEvent.OnProcessOrphanQuestion:
        return this._ptyHostService.onProcessOrphanQuestion;
      case RemoteTerminalChannelEvent.OnExecuteCommand:
        return this.onExecuteCommand;
      case RemoteTerminalChannelEvent.OnDidRequestDetach:
        return this._ptyHostService.onDidRequestDetach || Event.None;
      case RemoteTerminalChannelEvent.OnDidChangeProperty:
        return this._ptyHostService.onDidChangeProperty;
    }
    throw new Error(`IPC Command ${event} not found`);
  }
  async _createProcess(uriTransformer, args) {
    const shellLaunchConfig = {
      name: args.shellLaunchConfig.name,
      executable: args.shellLaunchConfig.executable,
      args: args.shellLaunchConfig.args,
      cwd: typeof args.shellLaunchConfig.cwd === "string" || typeof args.shellLaunchConfig.cwd === "undefined" ? args.shellLaunchConfig.cwd : URI.revive(uriTransformer.transformIncoming(args.shellLaunchConfig.cwd)),
      env: args.shellLaunchConfig.env,
      useShellEnvironment: args.shellLaunchConfig.useShellEnvironment,
      reconnectionProperties: args.shellLaunchConfig.reconnectionProperties,
      type: args.shellLaunchConfig.type,
      isFeatureTerminal: args.shellLaunchConfig.isFeatureTerminal,
      forceShellIntegration: args.shellLaunchConfig.forceShellIntegration,
      tabActions: args.shellLaunchConfig.tabActions,
      shellIntegrationEnvironmentReporting: args.shellLaunchConfig.shellIntegrationEnvironmentReporting
    };
    const resolverEnv = { ...args.resolverEnv };
    removeDangerousEnvVariables(resolverEnv);
    const baseEnv = await buildUserEnvironment(resolverEnv, !!args.shellLaunchConfig.useShellEnvironment, platform.language, this._environmentService, this._logService, this._configurationService);
    this._logService.trace("baseEnv", baseEnv);
    const reviveWorkspaceFolder = (workspaceData) => {
      return {
        uri: URI.revive(uriTransformer.transformIncoming(workspaceData.uri)),
        name: workspaceData.name,
        index: workspaceData.index,
        toResource: () => {
          throw new Error("Not implemented");
        }
      };
    };
    const workspaceFolders = args.workspaceFolders.map(reviveWorkspaceFolder);
    const activeWorkspaceFolder = args.activeWorkspaceFolder ? reviveWorkspaceFolder(args.activeWorkspaceFolder) : void 0;
    const activeFileResource = args.activeFileResource ? URI.revive(uriTransformer.transformIncoming(args.activeFileResource)) : void 0;
    const customVariableResolver = new CustomVariableResolver(baseEnv, workspaceFolders, activeFileResource, args.resolvedVariables, this._extensionManagementService);
    const variableResolver = terminalEnvironment.createVariableResolver(activeWorkspaceFolder, baseEnv, customVariableResolver);
    const initialCwd = await terminalEnvironment.getCwd(shellLaunchConfig, os.homedir(), variableResolver, activeWorkspaceFolder?.uri, args.configuration["terminal.integrated.cwd"], this._logService);
    shellLaunchConfig.cwd = initialCwd;
    const envPlatformKey = platform.isWindows ? "terminal.integrated.env.windows" : platform.isMacintosh ? "terminal.integrated.env.osx" : "terminal.integrated.env.linux";
    const envFromConfig = args.configuration[envPlatformKey];
    const env = await terminalEnvironment.createTerminalEnvironment(
      shellLaunchConfig,
      envFromConfig,
      variableResolver,
      this._productService.version,
      args.configuration["terminal.integrated.detectLocale"],
      baseEnv
    );
    if (shouldUseEnvironmentVariableCollection(shellLaunchConfig)) {
      const entries = [];
      for (const [k, v, d] of args.envVariableCollections) {
        entries.push([k, { map: deserializeEnvironmentVariableCollection(v), descriptionMap: deserializeEnvironmentDescriptionMap(d) }]);
      }
      const envVariableCollections = new Map(entries);
      const mergedCollection = new MergedEnvironmentVariableCollection(envVariableCollections);
      const workspaceFolder = activeWorkspaceFolder ? activeWorkspaceFolder ?? void 0 : void 0;
      await mergedCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
    }
    this._logService.debug(`Terminal process launching on remote agent`, { shellLaunchConfig, initialCwd, cols: args.cols, rows: args.rows, env });
    const ipcHandlePath = createRandomIPCHandle();
    env.VSCODE_IPC_HOOK_CLI = ipcHandlePath;
    const persistentProcessId = await this._ptyHostService.createProcess(shellLaunchConfig, initialCwd, args.cols, args.rows, args.unicodeVersion, env, baseEnv, args.options, args.shouldPersistTerminal, args.workspaceId, args.workspaceName);
    const commandsExecuter = {
      executeCommand: (id, ...args2) => this._executeCommand(persistentProcessId, id, args2, uriTransformer)
    };
    const cliServer = new CLIServerBase(commandsExecuter, this._logService, ipcHandlePath);
    this._ptyHostService.onProcessExit((e) => e.id === persistentProcessId && cliServer.dispose());
    return {
      persistentTerminalId: persistentProcessId,
      resolvedShellLaunchConfig: shellLaunchConfig
    };
  }
  _executeCommand(persistentProcessId, commandId, commandArgs, uriTransformer) {
    const { resolve, reject, promise } = promiseWithResolvers();
    const reqId = ++this._lastReqId;
    this._pendingCommands.set(reqId, { resolve, reject, uriTransformer });
    const serializedCommandArgs = cloneAndChange(commandArgs, (obj) => {
      if (obj && obj.$mid === 1) {
        return uriTransformer.transformOutgoing(obj);
      }
      if (obj && obj instanceof URI) {
        return uriTransformer.transformOutgoingURI(obj);
      }
      return void 0;
    });
    this._onExecuteCommand.fire({
      reqId,
      persistentProcessId,
      commandId,
      commandArgs: serializedCommandArgs
    });
    return promise;
  }
  _sendCommandResult(reqId, isError, serializedPayload) {
    const data = this._pendingCommands.get(reqId);
    if (!data) {
      return;
    }
    this._pendingCommands.delete(reqId);
    const payload = cloneAndChange(serializedPayload, (obj) => {
      if (obj && obj.$mid === 1) {
        return data.uriTransformer.transformIncoming(obj);
      }
      return void 0;
    });
    if (isError) {
      data.reject(payload);
    } else {
      data.resolve(payload);
    }
  }
  _getDefaultSystemShell(osOverride) {
    return this._ptyHostService.getDefaultSystemShell(osOverride);
  }
  async _getProfiles(workspaceId, profiles, defaultProfile, includeDetectedProfiles) {
    return this._ptyHostService.getProfiles(workspaceId, profiles, defaultProfile, includeDetectedProfiles) || [];
  }
  _getEnvironment() {
    return { ...process.env };
  }
  _getWslPath(original, direction) {
    return this._ptyHostService.getWslPath(original, direction);
  }
  _reduceConnectionGraceTime() {
    return this._ptyHostService.reduceConnectionGraceTime();
  }
}
export {
  RemoteTerminalChannel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXJ2ZXJcXG5vZGVcXHJlbW90ZVRlcm1pbmFsQ2hhbm5lbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY2xvbmVBbmRDaGFuZ2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IHJlbW92ZURhbmdlcm91c0VudlZhcmlhYmxlcyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVVSSVRyYW5zZm9ybWVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdXJpSXBjLmpzJztcbmltcG9ydCB7IElTZXJ2ZXJDaGFubmVsIH0gZnJvbSAnLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSYW5kb21JUENIYW5kbGUgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL2lwYy9ub2RlL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRDb25uZWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJUHR5SG9zdFNlcnZpY2UsIElTaGVsbExhdW5jaENvbmZpZywgSVRlcm1pbmFsUHJvZmlsZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJR2V0VGVybWluYWxMYXlvdXRJbmZvQXJncywgSVNldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3MgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxQcm9jZXNzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVVUklUcmFuc2Zvcm1lciB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaVRyYW5zZm9ybWVyLmpzJztcbmltcG9ydCB7IENMSVNlcnZlckJhc2UsIElDb21tYW5kc0V4ZWN1dGVyIH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2FwaS9ub2RlL2V4dEhvc3RDTElTZXJ2ZXIuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgZGVzZXJpYWxpemVFbnZpcm9ubWVudERlc2NyaXB0aW9uTWFwLCBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVTaGFyZWQuanMnO1xuaW1wb3J0IHsgSUNyZWF0ZVRlcm1pbmFsUHJvY2Vzc0FyZ3VtZW50cywgSUNyZWF0ZVRlcm1pbmFsUHJvY2Vzc1Jlc3VsdCwgSVdvcmtzcGFjZUZvbGRlckRhdGEsIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50LCBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0IH0gZnJvbSAnLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3JlbW90ZS90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgKiBhcyB0ZXJtaW5hbEVudmlyb25tZW50IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEFic3RyYWN0VmFyaWFibGVSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi92YXJpYWJsZVJlc29sdmVyLmpzJztcbmltcG9ydCB7IGJ1aWxkVXNlckVudmlyb25tZW50IH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0Q29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJU2VydmVyRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgcHJvbWlzZVdpdGhSZXNvbHZlcnMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBzaG91bGRVc2VFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcblxuY2xhc3MgQ3VzdG9tVmFyaWFibGVSZXNvbHZlciBleHRlbmRzIEFic3RyYWN0VmFyaWFibGVSZXNvbHZlclNlcnZpY2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRlbnY6IHBsYXRmb3JtLklQcm9jZXNzRW52aXJvbm1lbnQsXG5cdFx0d29ya3NwYWNlRm9sZGVyczogSVdvcmtzcGFjZUZvbGRlcltdLFxuXHRcdGFjdGl2ZUZpbGVSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHJlc29sdmVkVmFyaWFibGVzOiB7IFtuYW1lOiBzdHJpbmddOiBzdHJpbmcgfSxcblx0XHRleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGdldEZvbGRlclVyaTogKGZvbGRlck5hbWU6IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvdW5kID0gd29ya3NwYWNlRm9sZGVycy5maWx0ZXIoZiA9PiBmLm5hbWUgPT09IGZvbGRlck5hbWUpO1xuXHRcdFx0XHRpZiAoZm91bmQgJiYgZm91bmQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHJldHVybiBmb3VuZFswXS51cmk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXJDb3VudDogKCk6IG51bWJlciA9PiB7XG5cdFx0XHRcdHJldHVybiB3b3Jrc3BhY2VGb2xkZXJzLmxlbmd0aDtcblx0XHRcdH0sXG5cdFx0XHRnZXRDb25maWd1cmF0aW9uVmFsdWU6IChmb2xkZXJVcmk6IFVSSSwgc2VjdGlvbjogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVkVmFyaWFibGVzW2Bjb25maWc6JHtzZWN0aW9ufWBdO1xuXHRcdFx0fSxcblx0XHRcdGdldEV4ZWNQYXRoOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIGVudlsnVlNDT0RFX0VYRUNfUEFUSCddO1xuXHRcdFx0fSxcblx0XHRcdGdldEFwcFJvb3Q6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZW52WydWU0NPREVfQ1dEJ107XG5cdFx0XHR9LFxuXHRcdFx0Z2V0RmlsZVBhdGg6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aXZlRmlsZVJlc291cmNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhdGgubm9ybWFsaXplKGFjdGl2ZUZpbGVSZXNvdXJjZS5mc1BhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0U2VsZWN0ZWRUZXh0OiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVkVmFyaWFibGVzWydzZWxlY3RlZFRleHQnXTtcblx0XHRcdH0sXG5cdFx0XHRnZXRMaW5lTnVtYmVyOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVkVmFyaWFibGVzWydsaW5lTnVtYmVyJ107XG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q29sdW1uTnVtYmVyOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVkVmFyaWFibGVzWydjb2x1bW5OdW1iZXInXTtcblx0XHRcdH0sXG5cdFx0XHRnZXRFeHRlbnNpb246IGFzeW5jIGlkID0+IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgZXh0ZW5zaW9uU2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRcdFx0Y29uc3QgZm91bmQgPSBpbnN0YWxsZWQuZmluZChlID0+IGUuaWRlbnRpZmllci5pZCA9PT0gaWQpO1xuXHRcdFx0XHRyZXR1cm4gZm91bmQgJiYgeyBleHRlbnNpb25Mb2NhdGlvbjogZm91bmQubG9jYXRpb24gfTtcblx0XHRcdH0sXG5cdFx0fSwgdW5kZWZpbmVkLCBQcm9taXNlLnJlc29sdmUob3MuaG9tZWRpcigpKSwgUHJvbWlzZS5yZXNvbHZlKGVudikpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVUZXJtaW5hbENoYW5uZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNlcnZlckNoYW5uZWw8UmVtb3RlQWdlbnRDb25uZWN0aW9uQ29udGV4dD4ge1xuXG5cdHByaXZhdGUgX2xhc3RSZXFJZCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdDb21tYW5kcyA9IG5ldyBNYXA8bnVtYmVyLCB7XG5cdFx0cmVzb2x2ZTogKHZhbHVlOiB1bmtub3duKSA9PiB2b2lkO1xuXHRcdHJlamVjdDogKGVycj86IHVua25vd24pID0+IHZvaWQ7XG5cdFx0dXJpVHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lcjtcblx0fT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkV4ZWN1dGVDb21tYW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZXFJZDogbnVtYmVyOyBwZXJzaXN0ZW50UHJvY2Vzc0lkOiBudW1iZXI7IGNvbW1hbmRJZDogc3RyaW5nOyBjb21tYW5kQXJnczogdW5rbm93bltdIH0+KCkpO1xuXHRyZWFkb25seSBvbkV4ZWN1dGVDb21tYW5kID0gdGhpcy5fb25FeGVjdXRlQ29tbWFuZC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHR5SG9zdFNlcnZpY2U6IElQdHlIb3N0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0YXN5bmMgY2FsbChjdHg6IFJlbW90ZUFnZW50Q29ubmVjdGlvbkNvbnRleHQsIGNvbW1hbmQ6IFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QsIGFyZ3M/OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlJlc3RhcnRQdHlIb3N0OiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UucmVzdGFydFB0eUhvc3QuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuQ3JlYXRlUHJvY2Vzczoge1xuXHRcdFx0XHRjb25zdCB1cmlUcmFuc2Zvcm1lciA9IGNyZWF0ZVVSSVRyYW5zZm9ybWVyKGN0eC5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlUHJvY2Vzcyh1cmlUcmFuc2Zvcm1lciwgPElDcmVhdGVUZXJtaW5hbFByb2Nlc3NBcmd1bWVudHM+YXJncyk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuQXR0YWNoVG9Qcm9jZXNzOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuYXR0YWNoVG9Qcm9jZXNzLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5EZXRhY2hGcm9tUHJvY2VzczogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmRldGFjaEZyb21Qcm9jZXNzLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblxuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0Lkxpc3RQcm9jZXNzZXM6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5saXN0UHJvY2Vzc2VzLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5HZXRMYXRlbmN5OiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuZ2V0TGF0ZW5jeS5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuR2V0UGVyZm9ybWFuY2VNYXJrczogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmdldFBlcmZvcm1hbmNlTWFya3MuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0Lk9ycGhhblF1ZXN0aW9uUmVwbHk6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5vcnBoYW5RdWVzdGlvblJlcGx5LmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5BY2NlcHRQdHlIb3N0UmVzb2x2ZWRWYXJpYWJsZXM6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5hY2NlcHRQdHlIb3N0UmVzb2x2ZWRWYXJpYWJsZXMuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuU3RhcnQ6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5zdGFydC5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuSW5wdXQ6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5pbnB1dC5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuU2VuZFNpZ25hbDogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnNlbmRTaWduYWwuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkFja25vd2xlZGdlRGF0YUV2ZW50OiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuYWNrbm93bGVkZ2VEYXRhRXZlbnQuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlNodXRkb3duOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2Uuc2h1dGRvd24uYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlJlc2l6ZTogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnJlc2l6ZS5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuQ2xlYXJCdWZmZXI6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5jbGVhckJ1ZmZlci5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuR2V0SW5pdGlhbEN3ZDogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmdldEluaXRpYWxDd2QuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkdldEN3ZDogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmdldEN3ZC5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5Qcm9jZXNzQmluYXJ5OiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UucHJvY2Vzc0JpbmFyeS5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5TZW5kQ29tbWFuZFJlc3VsdDogcmV0dXJuIHRoaXMuX3NlbmRDb21tYW5kUmVzdWx0KGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0pO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0Lkluc3RhbGxBdXRvUmVwbHk6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5pbnN0YWxsQXV0b1JlcGx5LmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5Vbmluc3RhbGxBbGxBdXRvUmVwbGllczogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5HZXREZWZhdWx0U3lzdGVtU2hlbGw6IHJldHVybiB0aGlzLl9nZXREZWZhdWx0U3lzdGVtU2hlbGwuYXBwbHkodGhpcywgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuR2V0UHJvZmlsZXM6IHJldHVybiB0aGlzLl9nZXRQcm9maWxlcy5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5HZXRFbnZpcm9ubWVudDogcmV0dXJuIHRoaXMuX2dldEVudmlyb25tZW50KCk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuR2V0V3NsUGF0aDogcmV0dXJuIHRoaXMuX2dldFdzbFBhdGgoYXJnc1swXSwgYXJnc1sxXSk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuR2V0VGVybWluYWxMYXlvdXRJbmZvOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuZ2V0VGVybWluYWxMYXlvdXRJbmZvKDxJR2V0VGVybWluYWxMYXlvdXRJbmZvQXJncz5hcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5TZXRUZXJtaW5hbExheW91dEluZm86IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5zZXRUZXJtaW5hbExheW91dEluZm8oPElTZXRUZXJtaW5hbExheW91dEluZm9BcmdzPmFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlNlcmlhbGl6ZVRlcm1pbmFsU3RhdGU6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5zZXJpYWxpemVUZXJtaW5hbFN0YXRlLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5SZXZpdmVUZXJtaW5hbFByb2Nlc3NlczogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnJldml2ZVRlcm1pbmFsUHJvY2Vzc2VzLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5HZXRSZXZpdmVkUHR5TmV3SWQ6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5nZXRSZXZpdmVkUHR5TmV3SWQuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlNldFVuaWNvZGVWZXJzaW9uOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2Uuc2V0VW5pY29kZVZlcnNpb24uYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlNldE5leHRDb21tYW5kSWQ6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5zZXROZXh0Q29tbWFuZElkLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5SZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lOiByZXR1cm4gdGhpcy5fcmVkdWNlQ29ubmVjdGlvbkdyYWNlVGltZSgpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlVwZGF0ZUljb246IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS51cGRhdGVJY29uLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5VcGRhdGVUaXRsZTogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnVwZGF0ZVRpdGxlLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5VcGRhdGVQcm9wZXJ0eTogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnVwZGF0ZVByb3BlcnR5LmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5SZWZyZXNoUHJvcGVydHk6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5yZWZyZXNoUHJvcGVydHkuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlJlcXVlc3REZXRhY2hJbnN0YW5jZTogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnJlcXVlc3REZXRhY2hJbnN0YW5jZShhcmdzWzBdLCBhcmdzWzFdKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5BY2NlcHREZXRhY2hlZEluc3RhbmNlOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuYWNjZXB0RGV0YWNoSW5zdGFuY2VSZXBseShhcmdzWzBdLCBhcmdzWzFdKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5GcmVlUG9ydEtpbGxQcm9jZXNzOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuZnJlZVBvcnRLaWxsUHJvY2Vzcy5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuQWNjZXB0RGV0YWNoSW5zdGFuY2VSZXBseTogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmFjY2VwdERldGFjaEluc3RhbmNlUmVwbHkuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdH1cblxuXHRcdC8vIEB0cy1leHBlY3QtZXJyb3IgQXNzZXJ0IGNvbW1hbmQgaXMgdGhlIGBuZXZlcmAgdHlwZSB0byBlbnN1cmUgYWxsIG1lc3NhZ2VzIGFyZSBoYW5kbGVkXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJUEMgQ29tbWFuZCAke2NvbW1hbmR9IG5vdCBmb3VuZGApO1xuXHR9XG5cblx0bGlzdGVuPFQ+KF86IHVua25vd24sIGV2ZW50OiBSZW1vdGVUZXJtaW5hbENoYW5uZWxFdmVudCwgX2FyZzogdW5rbm93bik6IEV2ZW50PFQ+IHtcblx0XHRzd2l0Y2ggKGV2ZW50KSB7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHR5SG9zdEV4aXRFdmVudDogcmV0dXJuICh0aGlzLl9wdHlIb3N0U2VydmljZS5vblB0eUhvc3RFeGl0IHx8IEV2ZW50Lk5vbmUpIGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxFdmVudC5PblB0eUhvc3RTdGFydEV2ZW50OiByZXR1cm4gKHRoaXMuX3B0eUhvc3RTZXJ2aWNlLm9uUHR5SG9zdFN0YXJ0IHx8IEV2ZW50Lk5vbmUpIGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxFdmVudC5PblB0eUhvc3RVbnJlc3BvbnNpdmVFdmVudDogcmV0dXJuICh0aGlzLl9wdHlIb3N0U2VydmljZS5vblB0eUhvc3RVbnJlc3BvbnNpdmUgfHwgRXZlbnQuTm9uZSkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHR5SG9zdFJlc3BvbnNpdmVFdmVudDogcmV0dXJuICh0aGlzLl9wdHlIb3N0U2VydmljZS5vblB0eUhvc3RSZXNwb25zaXZlIHx8IEV2ZW50Lk5vbmUpIGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxFdmVudC5PblB0eUhvc3RSZXF1ZXN0UmVzb2x2ZVZhcmlhYmxlc0V2ZW50OiByZXR1cm4gKHRoaXMuX3B0eUhvc3RTZXJ2aWNlLm9uUHR5SG9zdFJlcXVlc3RSZXNvbHZlVmFyaWFibGVzIHx8IEV2ZW50Lk5vbmUpIGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxFdmVudC5PblByb2Nlc3NEYXRhRXZlbnQ6IHJldHVybiAodGhpcy5fcHR5SG9zdFNlcnZpY2Uub25Qcm9jZXNzRGF0YSkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHJvY2Vzc1JlYWR5RXZlbnQ6IHJldHVybiAodGhpcy5fcHR5SG9zdFNlcnZpY2Uub25Qcm9jZXNzUmVhZHkpIGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxFdmVudC5PblByb2Nlc3NFeGl0RXZlbnQ6IHJldHVybiAodGhpcy5fcHR5SG9zdFNlcnZpY2Uub25Qcm9jZXNzRXhpdCkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHJvY2Vzc1JlcGxheUV2ZW50OiByZXR1cm4gKHRoaXMuX3B0eUhvc3RTZXJ2aWNlLm9uUHJvY2Vzc1JlcGxheSkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHJvY2Vzc09ycGhhblF1ZXN0aW9uOiByZXR1cm4gKHRoaXMuX3B0eUhvc3RTZXJ2aWNlLm9uUHJvY2Vzc09ycGhhblF1ZXN0aW9uKSBhcyBFdmVudDxUPjtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsRXZlbnQuT25FeGVjdXRlQ29tbWFuZDogcmV0dXJuICh0aGlzLm9uRXhlY3V0ZUNvbW1hbmQpIGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxFdmVudC5PbkRpZFJlcXVlc3REZXRhY2g6IHJldHVybiAodGhpcy5fcHR5SG9zdFNlcnZpY2Uub25EaWRSZXF1ZXN0RGV0YWNoIHx8IEV2ZW50Lk5vbmUpIGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxFdmVudC5PbkRpZENoYW5nZVByb3BlcnR5OiByZXR1cm4gKHRoaXMuX3B0eUhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvcGVydHkpIGFzIEV2ZW50PFQ+O1xuXHRcdH1cblxuXHRcdC8vIEB0cy1leHBlY3QtZXJyb3IgQXNzZXJ0IGV2ZW50IGlzIHRoZSBgbmV2ZXJgIHR5cGUgdG8gZW5zdXJlIGFsbCBtZXNzYWdlcyBhcmUgaGFuZGxlZFxuXHRcdHRocm93IG5ldyBFcnJvcihgSVBDIENvbW1hbmQgJHtldmVudH0gbm90IGZvdW5kYCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVQcm9jZXNzKHVyaVRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIsIGFyZ3M6IElDcmVhdGVUZXJtaW5hbFByb2Nlc3NBcmd1bWVudHMpOiBQcm9taXNlPElDcmVhdGVUZXJtaW5hbFByb2Nlc3NSZXN1bHQ+IHtcblx0XHRjb25zdCBzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnID0ge1xuXHRcdFx0bmFtZTogYXJncy5zaGVsbExhdW5jaENvbmZpZy5uYW1lLFxuXHRcdFx0ZXhlY3V0YWJsZTogYXJncy5zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlLFxuXHRcdFx0YXJnczogYXJncy5zaGVsbExhdW5jaENvbmZpZy5hcmdzLFxuXHRcdFx0Y3dkOiAoXG5cdFx0XHRcdHR5cGVvZiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLmN3ZCA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGFyZ3Muc2hlbGxMYXVuY2hDb25maWcuY3dkID09PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHRcdD8gYXJncy5zaGVsbExhdW5jaENvbmZpZy5jd2Rcblx0XHRcdFx0XHQ6IFVSSS5yZXZpdmUodXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcoYXJncy5zaGVsbExhdW5jaENvbmZpZy5jd2QpKVxuXHRcdFx0KSxcblx0XHRcdGVudjogYXJncy5zaGVsbExhdW5jaENvbmZpZy5lbnYsXG5cdFx0XHR1c2VTaGVsbEVudmlyb25tZW50OiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLnVzZVNoZWxsRW52aXJvbm1lbnQsXG5cdFx0XHRyZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzOiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLnJlY29ubmVjdGlvblByb3BlcnRpZXMsXG5cdFx0XHR0eXBlOiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLnR5cGUsXG5cdFx0XHRpc0ZlYXR1cmVUZXJtaW5hbDogYXJncy5zaGVsbExhdW5jaENvbmZpZy5pc0ZlYXR1cmVUZXJtaW5hbCxcblx0XHRcdGZvcmNlU2hlbGxJbnRlZ3JhdGlvbjogYXJncy5zaGVsbExhdW5jaENvbmZpZy5mb3JjZVNoZWxsSW50ZWdyYXRpb24sXG5cdFx0XHR0YWJBY3Rpb25zOiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLnRhYkFjdGlvbnMsXG5cdFx0XHRzaGVsbEludGVncmF0aW9uRW52aXJvbm1lbnRSZXBvcnRpbmc6IGFyZ3Muc2hlbGxMYXVuY2hDb25maWcuc2hlbGxJbnRlZ3JhdGlvbkVudmlyb25tZW50UmVwb3J0aW5nLFxuXHRcdH07XG5cblxuXHRcdGNvbnN0IHJlc29sdmVyRW52ID0geyAuLi5hcmdzLnJlc29sdmVyRW52IH07XG5cdFx0Ly8gT25seSBrZXlzIGFyZSBpbnNwZWN0ZWQsIGBudWxsYCB2YWx1ZXMgYXJlIGtlcHQgc28gdGhleSBjYW4gdW5zZXQgaW5oZXJpdGVkIHZhcmlhYmxlc1xuXHRcdHJlbW92ZURhbmdlcm91c0VudlZhcmlhYmxlcyhyZXNvbHZlckVudiBhcyBwbGF0Zm9ybS5JUHJvY2Vzc0Vudmlyb25tZW50KTtcblx0XHRjb25zdCBiYXNlRW52ID0gYXdhaXQgYnVpbGRVc2VyRW52aXJvbm1lbnQocmVzb2x2ZXJFbnYsICEhYXJncy5zaGVsbExhdW5jaENvbmZpZy51c2VTaGVsbEVudmlyb25tZW50LCBwbGF0Zm9ybS5sYW5ndWFnZSwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnYmFzZUVudicsIGJhc2VFbnYpO1xuXG5cdFx0Y29uc3QgcmV2aXZlV29ya3NwYWNlRm9sZGVyID0gKHdvcmtzcGFjZURhdGE6IElXb3Jrc3BhY2VGb2xkZXJEYXRhKTogSVdvcmtzcGFjZUZvbGRlciA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IFVSSS5yZXZpdmUodXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcod29ya3NwYWNlRGF0YS51cmkpKSxcblx0XHRcdFx0bmFtZTogd29ya3NwYWNlRGF0YS5uYW1lLFxuXHRcdFx0XHRpbmRleDogd29ya3NwYWNlRGF0YS5pbmRleCxcblx0XHRcdFx0dG9SZXNvdXJjZTogKCkgPT4ge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fTtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gYXJncy53b3Jrc3BhY2VGb2xkZXJzLm1hcChyZXZpdmVXb3Jrc3BhY2VGb2xkZXIpO1xuXHRcdGNvbnN0IGFjdGl2ZVdvcmtzcGFjZUZvbGRlciA9IGFyZ3MuYWN0aXZlV29ya3NwYWNlRm9sZGVyID8gcmV2aXZlV29ya3NwYWNlRm9sZGVyKGFyZ3MuYWN0aXZlV29ya3NwYWNlRm9sZGVyKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhY3RpdmVGaWxlUmVzb3VyY2UgPSBhcmdzLmFjdGl2ZUZpbGVSZXNvdXJjZSA/IFVSSS5yZXZpdmUodXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcoYXJncy5hY3RpdmVGaWxlUmVzb3VyY2UpKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjdXN0b21WYXJpYWJsZVJlc29sdmVyID0gbmV3IEN1c3RvbVZhcmlhYmxlUmVzb2x2ZXIoYmFzZUVudiwgd29ya3NwYWNlRm9sZGVycywgYWN0aXZlRmlsZVJlc291cmNlLCBhcmdzLnJlc29sdmVkVmFyaWFibGVzLCB0aGlzLl9leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3QgdmFyaWFibGVSZXNvbHZlciA9IHRlcm1pbmFsRW52aXJvbm1lbnQuY3JlYXRlVmFyaWFibGVSZXNvbHZlcihhY3RpdmVXb3Jrc3BhY2VGb2xkZXIsIGJhc2VFbnYsIGN1c3RvbVZhcmlhYmxlUmVzb2x2ZXIpO1xuXG5cdFx0Ly8gR2V0IHRoZSBpbml0aWFsIGN3ZFxuXHRcdGNvbnN0IGluaXRpYWxDd2QgPSBhd2FpdCB0ZXJtaW5hbEVudmlyb25tZW50LmdldEN3ZChzaGVsbExhdW5jaENvbmZpZywgb3MuaG9tZWRpcigpLCB2YXJpYWJsZVJlc29sdmVyLCBhY3RpdmVXb3Jrc3BhY2VGb2xkZXI/LnVyaSwgYXJncy5jb25maWd1cmF0aW9uWyd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmN3ZCddLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHRzaGVsbExhdW5jaENvbmZpZy5jd2QgPSBpbml0aWFsQ3dkO1xuXG5cdFx0Y29uc3QgZW52UGxhdGZvcm1LZXkgPSBwbGF0Zm9ybS5pc1dpbmRvd3MgPyAndGVybWluYWwuaW50ZWdyYXRlZC5lbnYud2luZG93cycgOiAocGxhdGZvcm0uaXNNYWNpbnRvc2ggPyAndGVybWluYWwuaW50ZWdyYXRlZC5lbnYub3N4JyA6ICd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudi5saW51eCcpO1xuXHRcdGNvbnN0IGVudkZyb21Db25maWcgPSBhcmdzLmNvbmZpZ3VyYXRpb25bZW52UGxhdGZvcm1LZXldO1xuXHRcdGNvbnN0IGVudiA9IGF3YWl0IHRlcm1pbmFsRW52aXJvbm1lbnQuY3JlYXRlVGVybWluYWxFbnZpcm9ubWVudChcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdFx0ZW52RnJvbUNvbmZpZyxcblx0XHRcdHZhcmlhYmxlUmVzb2x2ZXIsXG5cdFx0XHR0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0YXJncy5jb25maWd1cmF0aW9uWyd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRldGVjdExvY2FsZSddLFxuXHRcdFx0YmFzZUVudlxuXHRcdCk7XG5cblx0XHQvLyBBcHBseSBleHRlbnNpb24gZW52aXJvbm1lbnQgdmFyaWFibGUgY29sbGVjdGlvbnMgdG8gdGhlIGVudmlyb25tZW50XG5cdFx0aWYgKHNob3VsZFVzZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKHNoZWxsTGF1bmNoQ29uZmlnKSkge1xuXHRcdFx0Y29uc3QgZW50cmllczogW3N0cmluZywgSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uXVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IFtrLCB2LCBkXSBvZiBhcmdzLmVudlZhcmlhYmxlQ29sbGVjdGlvbnMpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKFtrLCB7IG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbih2KSwgZGVzY3JpcHRpb25NYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnREZXNjcmlwdGlvbk1hcChkKSB9XSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnZWYXJpYWJsZUNvbGxlY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbj4oZW50cmllcyk7XG5cdFx0XHRjb25zdCBtZXJnZWRDb2xsZWN0aW9uID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGVudlZhcmlhYmxlQ29sbGVjdGlvbnMpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gYWN0aXZlV29ya3NwYWNlRm9sZGVyID8gYWN0aXZlV29ya3NwYWNlRm9sZGVyID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IG1lcmdlZENvbGxlY3Rpb24uYXBwbHlUb1Byb2Nlc3NFbnZpcm9ubWVudChlbnYsIHsgd29ya3NwYWNlRm9sZGVyIH0sIHZhcmlhYmxlUmVzb2x2ZXIpO1xuXHRcdH1cblxuXHRcdC8vIEZvcmsgdGhlIHByb2Nlc3MgYW5kIGxpc3RlbiBmb3IgbWVzc2FnZXNcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBUZXJtaW5hbCBwcm9jZXNzIGxhdW5jaGluZyBvbiByZW1vdGUgYWdlbnRgLCB7IHNoZWxsTGF1bmNoQ29uZmlnLCBpbml0aWFsQ3dkLCBjb2xzOiBhcmdzLmNvbHMsIHJvd3M6IGFyZ3Mucm93cywgZW52IH0pO1xuXG5cdFx0Ly8gU2V0dXAgdGhlIENMSSBzZXJ2ZXIgdG8gc3VwcG9ydCBmb3J3YXJkaW5nIGNvbW1hbmRzIHJ1biBmcm9tIHRoZSBDTElcblx0XHRjb25zdCBpcGNIYW5kbGVQYXRoID0gY3JlYXRlUmFuZG9tSVBDSGFuZGxlKCk7XG5cdFx0ZW52LlZTQ09ERV9JUENfSE9PS19DTEkgPSBpcGNIYW5kbGVQYXRoO1xuXG5cdFx0Y29uc3QgcGVyc2lzdGVudFByb2Nlc3NJZCA9IGF3YWl0IHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmNyZWF0ZVByb2Nlc3Moc2hlbGxMYXVuY2hDb25maWcsIGluaXRpYWxDd2QsIGFyZ3MuY29scywgYXJncy5yb3dzLCBhcmdzLnVuaWNvZGVWZXJzaW9uLCBlbnYsIGJhc2VFbnYsIGFyZ3Mub3B0aW9ucywgYXJncy5zaG91bGRQZXJzaXN0VGVybWluYWwsIGFyZ3Mud29ya3NwYWNlSWQsIGFyZ3Mud29ya3NwYWNlTmFtZSk7XG5cdFx0Y29uc3QgY29tbWFuZHNFeGVjdXRlcjogSUNvbW1hbmRzRXhlY3V0ZXIgPSB7XG5cdFx0XHRleGVjdXRlQ29tbWFuZDogPFQ+KGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VD4gPT4gdGhpcy5fZXhlY3V0ZUNvbW1hbmQocGVyc2lzdGVudFByb2Nlc3NJZCwgaWQsIGFyZ3MsIHVyaVRyYW5zZm9ybWVyKVxuXHRcdH07XG5cdFx0Y29uc3QgY2xpU2VydmVyID0gbmV3IENMSVNlcnZlckJhc2UoY29tbWFuZHNFeGVjdXRlciwgdGhpcy5fbG9nU2VydmljZSwgaXBjSGFuZGxlUGF0aCk7XG5cdFx0dGhpcy5fcHR5SG9zdFNlcnZpY2Uub25Qcm9jZXNzRXhpdChlID0+IGUuaWQgPT09IHBlcnNpc3RlbnRQcm9jZXNzSWQgJiYgY2xpU2VydmVyLmRpc3Bvc2UoKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGVyc2lzdGVudFRlcm1pbmFsSWQ6IHBlcnNpc3RlbnRQcm9jZXNzSWQsXG5cdFx0XHRyZXNvbHZlZFNoZWxsTGF1bmNoQ29uZmlnOiBzaGVsbExhdW5jaENvbmZpZ1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9leGVjdXRlQ29tbWFuZDxUPihwZXJzaXN0ZW50UHJvY2Vzc0lkOiBudW1iZXIsIGNvbW1hbmRJZDogc3RyaW5nLCBjb21tYW5kQXJnczogdW5rbm93bltdLCB1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyKTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgeyByZXNvbHZlLCByZWplY3QsIHByb21pc2UgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzPFQ+KCk7XG5cblx0XHRjb25zdCByZXFJZCA9ICsrdGhpcy5fbGFzdFJlcUlkO1xuXHRcdHRoaXMuX3BlbmRpbmdDb21tYW5kcy5zZXQocmVxSWQsIHsgcmVzb2x2ZTogcmVzb2x2ZSBhcyAodmFsdWU6IHVua25vd24pID0+IHZvaWQsIHJlamVjdCwgdXJpVHJhbnNmb3JtZXIgfSk7XG5cblx0XHRjb25zdCBzZXJpYWxpemVkQ29tbWFuZEFyZ3MgPSBjbG9uZUFuZENoYW5nZShjb21tYW5kQXJncywgKG9iaikgPT4ge1xuXHRcdFx0aWYgKG9iaiAmJiBvYmouJG1pZCA9PT0gMSkge1xuXHRcdFx0XHQvLyB0aGlzIGlzIFVyaUNvbXBvbmVudHNcblx0XHRcdFx0cmV0dXJuIHVyaVRyYW5zZm9ybWVyLnRyYW5zZm9ybU91dGdvaW5nKG9iaik7XG5cdFx0XHR9XG5cdFx0XHRpZiAob2JqICYmIG9iaiBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0XHRyZXR1cm4gdXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtT3V0Z29pbmdVUkkob2JqKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0dGhpcy5fb25FeGVjdXRlQ29tbWFuZC5maXJlKHtcblx0XHRcdHJlcUlkLFxuXHRcdFx0cGVyc2lzdGVudFByb2Nlc3NJZCxcblx0XHRcdGNvbW1hbmRJZCxcblx0XHRcdGNvbW1hbmRBcmdzOiBzZXJpYWxpemVkQ29tbWFuZEFyZ3Ncblx0XHR9KTtcblxuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZENvbW1hbmRSZXN1bHQocmVxSWQ6IG51bWJlciwgaXNFcnJvcjogYm9vbGVhbiwgc2VyaWFsaXplZFBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fcGVuZGluZ0NvbW1hbmRzLmdldChyZXFJZCk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdDb21tYW5kcy5kZWxldGUocmVxSWQpO1xuXHRcdGNvbnN0IHBheWxvYWQgPSBjbG9uZUFuZENoYW5nZShzZXJpYWxpemVkUGF5bG9hZCwgKG9iaikgPT4ge1xuXHRcdFx0aWYgKG9iaiAmJiBvYmouJG1pZCA9PT0gMSkge1xuXHRcdFx0XHQvLyB0aGlzIGlzIFVyaUNvbXBvbmVudHNcblx0XHRcdFx0cmV0dXJuIGRhdGEudXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcob2JqKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0aWYgKGlzRXJyb3IpIHtcblx0XHRcdGRhdGEucmVqZWN0KHBheWxvYWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLnJlc29sdmUocGF5bG9hZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVmYXVsdFN5c3RlbVNoZWxsKG9zT3ZlcnJpZGU/OiBwbGF0Zm9ybS5PcGVyYXRpbmdTeXN0ZW0pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5nZXREZWZhdWx0U3lzdGVtU2hlbGwob3NPdmVycmlkZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRQcm9maWxlcyh3b3Jrc3BhY2VJZDogc3RyaW5nLCBwcm9maWxlczogdW5rbm93biwgZGVmYXVsdFByb2ZpbGU6IHVua25vd24sIGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzPzogYm9vbGVhbik6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmdldFByb2ZpbGVzKHdvcmtzcGFjZUlkLCBwcm9maWxlcywgZGVmYXVsdFByb2ZpbGUsIGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzKSB8fCBbXTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVudmlyb25tZW50KCk6IHBsYXRmb3JtLklQcm9jZXNzRW52aXJvbm1lbnQge1xuXHRcdHJldHVybiB7IC4uLnByb2Nlc3MuZW52IH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRXc2xQYXRoKG9yaWdpbmFsOiBzdHJpbmcsIGRpcmVjdGlvbjogJ3VuaXgtdG8td2luJyB8ICd3aW4tdG8tdW5peCcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5nZXRXc2xQYXRoKG9yaWdpbmFsLCBkaXJlY3Rpb24pO1xuXHR9XG5cblxuXHRwcml2YXRlIF9yZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5yZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksUUFBUTtBQUNwQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixZQUFZLFVBQVU7QUFDdEIsWUFBWSxjQUFjO0FBQzFCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsV0FBVztBQUdwQixTQUFTLDZCQUE2QjtBQUt0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUF3QztBQUVqRCxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHNDQUFzQyxnREFBZ0Q7QUFDL0YsU0FBOEYsNEJBQTRCLG9DQUFvQztBQUM5SixZQUFZLHlCQUF5QjtBQUNyQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDRCQUE0QjtBQU1yQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDhDQUE4QztBQUV2RCxNQUFNLCtCQUErQixnQ0FBZ0M7QUFBQSxFQUNwRSxZQUNDLEtBQ0Esa0JBQ0Esb0JBQ0EsbUJBQ0Esa0JBQ0M7QUFDRCxVQUFNO0FBQUEsTUFDTCxjQUFjLENBQUMsZUFBd0M7QUFDdEQsY0FBTSxRQUFRLGlCQUFpQixPQUFPLE9BQUssRUFBRSxTQUFTLFVBQVU7QUFDaEUsWUFBSSxTQUFTLE1BQU0sU0FBUyxHQUFHO0FBQzlCLGlCQUFPLE1BQU0sQ0FBQyxFQUFFO0FBQUEsUUFDakI7QUFDQSxlQUFP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
