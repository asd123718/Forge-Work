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
import { DisposableStore, Disposable, MutableDisposable, combinedDisposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { URI } from "../../../base/common/uri.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ProcessPropertyType, remoteResolverTerminal, TerminalExitReason, TerminalLocation } from "../../../platform/terminal/common/terminal.js";
import { TerminalDataBufferer } from "../../../platform/terminal/common/terminalDataBuffering.js";
import { ITerminalEditorService, ITerminalGroupService, ITerminalService } from "../../contrib/terminal/browser/terminal.js";
import { TerminalProcessExtHostProxy } from "../../contrib/terminal/browser/terminalProcessExtHostProxy.js";
import { IEnvironmentVariableService } from "../../contrib/terminal/common/environmentVariable.js";
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection, serializeEnvironmentVariableCollection } from "../../../platform/terminal/common/environmentVariableShared.js";
import { ITerminalProfileResolverService, ITerminalProfileService } from "../../contrib/terminal/common/terminal.js";
import { IRemoteAgentService } from "../../services/remote/common/remoteAgentService.js";
import { OS } from "../../../base/common/platform.js";
import { Promises } from "../../../base/common/async.js";
import { ITerminalLinkProviderService } from "../../contrib/terminalContrib/links/browser/links.js";
import { ITerminalQuickFixService, TerminalQuickFixType } from "../../contrib/terminalContrib/quickFix/browser/quickFix.js";
import { TerminalCapability } from "../../../platform/terminal/common/capabilities/capabilities.js";
import { ITerminalCompletionService } from "../../contrib/terminalContrib/suggest/browser/terminalCompletionService.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { hasKey } from "../../../base/common/types.js";
let MainThreadTerminalService = class extends Disposable {
  constructor(_extHostContext, _terminalService, _terminalLinkProviderService, _terminalQuickFixService, _instantiationService, _environmentVariableService, _logService, _terminalProfileResolverService, remoteAgentService, _terminalGroupService, _terminalEditorService, _terminalProfileService, _terminalCompletionService, _environmentService) {
    super();
    this._terminalService = _terminalService;
    this._terminalLinkProviderService = _terminalLinkProviderService;
    this._terminalQuickFixService = _terminalQuickFixService;
    this._instantiationService = _instantiationService;
    this._environmentVariableService = _environmentVariableService;
    this._logService = _logService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalEditorService = _terminalEditorService;
    this._terminalProfileService = _terminalProfileService;
    this._terminalCompletionService = _terminalCompletionService;
    this._environmentService = _environmentService;
    /**
     * Stores a map from a temporary terminal id (a UUID generated on the extension host side)
     * to a numeric terminal id (an id generated on the renderer side)
     * This comes in play only when dealing with terminals created on the extension host side
     */
    this._extHostTerminals = /* @__PURE__ */ new Map();
    this._terminalProcessProxies = this._register(new DisposableMap());
    this._profileProviders = this._register(new DisposableMap());
    this._completionProviders = this._register(new DisposableMap());
    this._quickFixProviders = this._register(new DisposableMap());
    this._dataEventTracker = this._register(new MutableDisposable());
    this._sendCommandEventListener = this._register(new MutableDisposable());
    /**
     * A single shared terminal link provider for the exthost. When an ext registers a link
     * provider, this is registered with the terminal on the renderer side and all links are
     * provided through this, even from multiple ext link providers. Xterm should remove lower
     * priority intersecting links itself.
     */
    this._linkProvider = this._register(new MutableDisposable());
    this._os = OS;
    this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostTerminalService);
    this._register(_terminalService.onDidCreateInstance((instance) => {
      this._onTerminalOpened(instance);
      this._onInstanceDimensionsChanged(instance);
    }));
    this._register(_terminalService.onDidDisposeInstance((instance) => this._onTerminalDisposed(instance)));
    this._register(_terminalService.onAnyInstanceProcessIdReady((instance) => this._onTerminalProcessIdReady(instance)));
    this._register(_terminalService.onDidChangeInstanceDimensions((instance) => this._onInstanceDimensionsChanged(instance)));
    this._register(_terminalService.onAnyInstanceMaximumDimensionsChange((instance) => this._onInstanceMaximumDimensionsChanged(instance)));
    this._register(_terminalService.onDidRequestStartExtensionTerminal((e) => this._onRequestStartExtensionTerminal(e)));
    this._register(_terminalService.onDidChangeActiveInstance((instance) => this._onActiveTerminalChanged(instance ? instance.instanceId : null)));
    this._register(_terminalService.onAnyInstanceTitleChange((instance) => instance && this._onTitleChanged(instance.instanceId, instance.title)));
    this._register(_terminalService.onAnyInstanceDataInput((instance) => this._proxy.$acceptTerminalInteraction(instance.instanceId)));
    this._register(_terminalService.onAnyInstanceSelectionChange((instance) => this._proxy.$acceptTerminalSelection(instance.instanceId, instance.selection)));
    this._register(_terminalService.onAnyInstanceShellTypeChanged((instance) => this._onShellTypeChanged(instance.instanceId)));
    for (const instance of this._terminalService.instances) {
      this._onTerminalOpened(instance);
      instance.processReady.then(() => this._onTerminalProcessIdReady(instance));
      if (instance.shellType) {
        this._proxy.$acceptTerminalShellType(instance.instanceId, instance.shellType);
      }
    }
    const activeInstance = this._terminalService.activeInstance;
    if (activeInstance) {
      this._proxy.$acceptActiveTerminalChanged(activeInstance.instanceId);
    }
    if (this._environmentVariableService.collections.size > 0) {
      const collectionAsArray = [...this._environmentVariableService.collections.entries()];
      const serializedCollections = collectionAsArray.map((e) => {
        return [e[0], serializeEnvironmentVariableCollection(e[1].map)];
      });
      this._proxy.$initEnvironmentVariableCollections(serializedCollections);
    }
    remoteAgentService.getEnvironment().then(async (env) => {
      this._os = env?.os || OS;
      this._updateDefaultProfile();
    });
    this._register(this._terminalProfileService.onDidChangeAvailableProfiles(() => this._updateDefaultProfile()));
  }
  async _updateDefaultProfile() {
    const remoteAuthority = this._environmentService.remoteAuthority;
    const defaultProfile = this._terminalProfileResolverService.getDefaultProfile({ remoteAuthority, os: this._os });
    const defaultAutomationProfile = this._terminalProfileResolverService.getDefaultProfile({ remoteAuthority, os: this._os, allowAutomationShell: true });
    this._proxy.$acceptDefaultProfile(...await Promise.all([defaultProfile, defaultAutomationProfile]));
  }
  async _getTerminalInstance(id) {
    if (typeof id === "string") {
      return this._extHostTerminals.get(id);
    }
    return this._terminalService.getInstanceFromId(id);
  }
  async $createTerminal(extHostTerminalId, launchConfig) {
    const shellLaunchConfig = {
      name: launchConfig.name,
      executable: launchConfig.shellPath,
      args: launchConfig.shellArgs,
      cwd: typeof launchConfig.cwd === "string" ? launchConfig.cwd : URI.revive(launchConfig.cwd),
      icon: launchConfig.icon,
      color: launchConfig.color,
      initialText: launchConfig.initialText,
      waitOnExit: launchConfig.waitOnExit,
      ignoreConfigurationCwd: true,
      env: launchConfig.env,
      strictEnv: launchConfig.strictEnv,
      hideFromUser: launchConfig.hideFromUser,
      customPtyImplementation: launchConfig.isExtensionCustomPtyTerminal ? (id, cols, rows) => new TerminalProcessExtHostProxy(id, cols, rows, this._terminalService) : void 0,
      extHostTerminalId,
      forceShellIntegration: launchConfig.forceShellIntegration,
      isFeatureTerminal: launchConfig.isFeatureTerminal,
      [remoteResolverTerminal]: launchConfig.isRemoteResolverTerminal || void 0,
      isExtensionOwnedTerminal: launchConfig.isExtensionOwnedTerminal,
      useShellEnvironment: launchConfig.useShellEnvironment,
      isTransient: launchConfig.isTransient,
      shellIntegrationNonce: launchConfig.shellIntegrationNonce,
      titleTemplate: launchConfig.titleTemplate
    };
    const terminal = Promises.withAsyncBody(async (r) => {
      const terminal2 = await this._terminalService.createTerminal({
        config: shellLaunchConfig,
        cwd: launchConfig.isRemoteResolverTerminal ? shellLaunchConfig.cwd : void 0,
        location: await this._deserializeParentTerminal(launchConfig.location)
      });
      r(terminal2);
    });
    this._extHostTerminals.set(extHostTerminalId, terminal);
    const terminalInstance = await terminal;
    this._register(terminalInstance.onDisposed(() => {
      this._extHostTerminals.delete(extHostTerminalId);
    }));
  }
  async _deserializeParentTerminal(location) {
    if (typeof location === "object" && hasKey(location, { parentTerminal: true })) {
      const parentTerminal = await this._extHostTerminals.get(location.parentTerminal.toString());
      return parentTerminal ? { parentTerminal } : void 0;
    }
    return location;
  }
  async $show(id, preserveFocus) {
    const terminalInstance = await this._getTerminalInstance(id);
    if (terminalInstance) {
      this._terminalService.setActiveInstance(terminalInstance);
      if (terminalInstance.target === TerminalLocation.Editor) {
        await this._terminalEditorService.revealActiveEditor(preserveFocus);
      } else {
        await this._terminalGroupService.showPanel(!preserveFocus);
      }
    }
  }
  async $hide(id) {
    const instanceToHide = await this._getTerminalInstance(id);
    const activeInstance = this._terminalService.activeInstance;
    if (activeInstance && activeInstance.instanceId === instanceToHide?.instanceId && activeInstance.target !== TerminalLocation.Editor) {
      this._terminalGroupService.hidePanel();
    }
  }
  async $dispose(id) {
    (await this._getTerminalInstance(id))?.dispose(TerminalExitReason.Extension);
  }
  async $sendText(id, text, shouldExecute) {
    const instance = await this._getTerminalInstance(id);
    await instance?.sendText(text, shouldExecute);
  }
  $sendProcessExit(terminalId, exitCode) {
    this._terminalProcessProxies.get(terminalId)?.proxy.emitExit(exitCode);
  }
  $startSendingDataEvents() {
    if (!this._dataEventTracker.value) {
      this._dataEventTracker.value = this._instantiationService.createInstance(TerminalDataEventTracker, (id, data) => {
        this._onTerminalData(id, data);
      });
      for (const instance of this._terminalService.instances) {
        for (const data of instance.initialDataEvents || []) {
          this._onTerminalData(instance.instanceId, data);
        }
      }
    }
  }
  $stopSendingDataEvents() {
    this._dataEventTracker.clear();
  }
  $startSendingCommandEvents() {
    if (this._sendCommandEventListener.value) {
      return;
    }
    const multiplexer = this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, (capability) => capability.onCommandFinished);
    const sub = multiplexer.event((e) => {
      this._onDidExecuteCommand(e.instance.instanceId, {
        commandLine: e.data.command,
        // TODO: Convert to URI if possible
        cwd: e.data.cwd,
        exitCode: e.data.exitCode,
        output: e.data.getOutput()
      });
    });
    this._sendCommandEventListener.value = combinedDisposable(multiplexer, sub);
  }
  $stopSendingCommandEvents() {
    this._sendCommandEventListener.clear();
  }
  $startLinkProvider() {
    this._linkProvider.value = this._terminalLinkProviderService.registerLinkProvider(new ExtensionTerminalLinkProvider(this._proxy));
  }
  $stopLinkProvider() {
    this._linkProvider.clear();
  }
  $registerProcessSupport(isSupported) {
    this._terminalService.registerProcessSupport(isSupported);
  }
  $registerCompletionProvider(id, extensionIdentifier, ...triggerCharacters) {
    this._completionProviders.set(id, this._terminalCompletionService.registerTerminalCompletionProvider(extensionIdentifier, id, {
      id,
      provideCompletions: async (commandLine, cursorIndex, token) => {
        const completions = await this._proxy.$provideTerminalCompletions(id, { commandLine, cursorIndex }, token);
        if (!completions) {
          return void 0;
        }
        if (completions.resourceOptions) {
          const { cwd, globPattern, ...rest } = completions.resourceOptions;
          return {
            items: completions.items?.map((c) => ({
              provider: `ext:${id}`,
              ...c
            })),
            resourceOptions: {
              ...rest,
              cwd,
              globPattern
            }
          };
        }
        return completions.items?.map((c) => ({
          provider: `ext:${id}`,
          ...c
        }));
      }
    }, ...triggerCharacters));
  }
  $unregisterCompletionProvider(id) {
    this._completionProviders.deleteAndDispose(id);
  }
  $registerProfileProvider(id, extensionIdentifier) {
    this._profileProviders.set(id, this._terminalProfileService.registerTerminalProfileProvider(extensionIdentifier, id, {
      createContributedTerminalProfile: async (options) => {
        return this._proxy.$createContributedProfileTerminal(id, options);
      }
    }));
  }
  $unregisterProfileProvider(id) {
    this._profileProviders.deleteAndDispose(id);
  }
  async $registerQuickFixProvider(id, extensionId) {
    this._quickFixProviders.set(id, this._terminalQuickFixService.registerQuickFixProvider(id, {
      provideTerminalQuickFixes: async (terminalCommand, lines, options, token) => {
        if (token.isCancellationRequested) {
          return;
        }
        if (options.outputMatcher?.length && options.outputMatcher.length > 40) {
          options.outputMatcher.length = 40;
          this._logService.warn("Cannot exceed output matcher length of 40");
        }
        const commandLineMatch = terminalCommand.command.match(options.commandLineMatcher);
        if (!commandLineMatch || !lines) {
          return;
        }
        const outputMatcher = options.outputMatcher;
        let outputMatch;
        if (outputMatcher) {
          outputMatch = getOutputMatchForLines(lines, outputMatcher);
        }
        if (!outputMatch) {
          return;
        }
        const matchResult = { commandLineMatch, outputMatch, commandLine: terminalCommand.command };
        if (matchResult) {
          const result = await this._proxy.$provideTerminalQuickFixes(id, matchResult, token);
          if (result && Array.isArray(result)) {
            return result.map((r) => parseQuickFix(id, extensionId, r));
          } else if (result) {
            return parseQuickFix(id, extensionId, result);
          }
        }
        return;
      }
    }));
  }
  $unregisterQuickFixProvider(id) {
    this._quickFixProviders.deleteAndDispose(id);
  }
  _onActiveTerminalChanged(terminalId) {
    this._proxy.$acceptActiveTerminalChanged(terminalId);
  }
  _onTerminalData(terminalId, data) {
    this._proxy.$acceptTerminalProcessData(terminalId, data);
  }
  _onDidExecuteCommand(terminalId, command) {
    this._proxy.$acceptDidExecuteCommand(terminalId, command);
  }
  _onTitleChanged(terminalId, name) {
    this._proxy.$acceptTerminalTitleChange(terminalId, name);
  }
  _onShellTypeChanged(terminalId) {
    const terminalInstance = this._terminalService.getInstanceFromId(terminalId);
    if (terminalInstance) {
      this._proxy.$acceptTerminalShellType(terminalId, terminalInstance.shellType);
    }
  }
  _onTerminalDisposed(terminalInstance) {
    this._proxy.$acceptTerminalClosed(terminalInstance.instanceId, terminalInstance.exitCode, terminalInstance.exitReason ?? TerminalExitReason.Unknown);
    this._terminalProcessProxies.deleteAndDispose(terminalInstance.instanceId);
  }
  _onTerminalOpened(terminalInstance) {
    const extHostTerminalId = terminalInstance.shellLaunchConfig.extHostTerminalId;
    const shellLaunchConfigDto = {
      name: terminalInstance.shellLaunchConfig.name,
      executable: terminalInstance.shellLaunchConfig.executable,
      args: terminalInstance.shellLaunchConfig.args,
      cwd: terminalInstance.shellLaunchConfig.cwd,
      env: terminalInstance.shellLaunchConfig.env,
      hideFromUser: terminalInstance.shellLaunchConfig.hideFromUser,
      tabActions: terminalInstance.shellLaunchConfig.tabActions,
      titleTemplate: terminalInstance.shellLaunchConfig.titleTemplate
    };
    this._proxy.$acceptTerminalOpened(terminalInstance.instanceId, extHostTerminalId, terminalInstance.title, shellLaunchConfigDto);
  }
  _onTerminalProcessIdReady(terminalInstance) {
    if (terminalInstance.processId === void 0) {
      return;
    }
    this._proxy.$acceptTerminalProcessId(terminalInstance.instanceId, terminalInstance.processId);
  }
  _onInstanceDimensionsChanged(instance) {
    this._proxy.$acceptTerminalDimensions(instance.instanceId, instance.cols, instance.rows);
  }
  _onInstanceMaximumDimensionsChanged(instance) {
    this._proxy.$acceptTerminalMaximumDimensions(instance.instanceId, instance.maxCols, instance.maxRows);
  }
  _onRequestStartExtensionTerminal(request) {
    const proxy = request.proxy;
    const store = new DisposableStore();
    store.add(proxy);
    this._terminalProcessProxies.set(proxy.instanceId, { proxy, dispose: () => store.dispose() });
    const initialDimensions = request.cols && request.rows ? {
      columns: request.cols,
      rows: request.rows
    } : void 0;
    this._proxy.$startExtensionTerminal(
      proxy.instanceId,
      initialDimensions
    ).then(request.callback);
    store.add(proxy.onInput((data) => this._proxy.$acceptProcessInput(proxy.instanceId, data)));
    store.add(proxy.onShutdown((immediate) => this._proxy.$acceptProcessShutdown(proxy.instanceId, immediate)));
    store.add(proxy.onRequestCwd(() => this._proxy.$acceptProcessRequestCwd(proxy.instanceId)));
    store.add(proxy.onRequestInitialCwd(() => this._proxy.$acceptProcessRequestInitialCwd(proxy.instanceId)));
  }
  $sendProcessData(terminalId, data) {
    this._terminalProcessProxies.get(terminalId)?.proxy.emitData(data);
  }
  $sendProcessReady(terminalId, pid, cwd, windowsPty) {
    this._terminalProcessProxies.get(terminalId)?.proxy.emitReady(pid, cwd, windowsPty);
  }
  $sendProcessProperty(terminalId, property) {
    if (property.type === ProcessPropertyType.Title) {
      const instance = this._terminalService.getInstanceFromId(terminalId);
      instance?.rename(property.value);
    }
    this._terminalProcessProxies.get(terminalId)?.proxy.emitProcessProperty(property);
  }
  $setEnvironmentVariableCollection(extensionIdentifier, persistent, collection, descriptionMap) {
    if (collection) {
      const translatedCollection = {
        persistent,
        map: deserializeEnvironmentVariableCollection(collection),
        descriptionMap: deserializeEnvironmentDescriptionMap(descriptionMap)
      };
      this._environmentVariableService.set(extensionIdentifier, translatedCollection);
    } else {
      this._environmentVariableService.delete(extensionIdentifier);
    }
  }
};
MainThreadTerminalService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadTerminalService),
  __decorateParam(1, ITerminalService),
  __decorateParam(2, ITerminalLinkProviderService),
  __decorateParam(3, ITerminalQuickFixService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IEnvironmentVariableService),
  __decorateParam(6, ILogService),
  __decorateParam(7, ITerminalProfileResolverService),
  __decorateParam(8, IRemoteAgentService),
  __decorateParam(9, ITerminalGroupService),
  __decorateParam(10, ITerminalEditorService),
  __decorateParam(11, ITerminalProfileService),
  __decorateParam(12, ITerminalCompletionService),
  __decorateParam(13, IWorkbenchEnvironmentService)
], MainThreadTerminalService);
let TerminalDataEventTracker = class extends Disposable {
  constructor(_callback, _terminalService) {
    super();
    this._callback = _callback;
    this._terminalService = _terminalService;
    this._instanceListeners = this._register(new DisposableMap());
    this._register(this._bufferer = new TerminalDataBufferer(this._callback));
    for (const instance of this._terminalService.instances) {
      this._registerInstance(instance);
    }
    this._register(this._terminalService.onDidCreateInstance((instance) => this._registerInstance(instance)));
    this._register(this._terminalService.onDidDisposeInstance((instance) => {
      this._bufferer.stopBuffering(instance.instanceId);
      this._instanceListeners.deleteAndDispose(instance.instanceId);
    }));
  }
  _registerInstance(instance) {
    this._instanceListeners.set(instance.instanceId, this._bufferer.startBuffering(instance.instanceId, instance.onData));
  }
};
TerminalDataEventTracker = __decorateClass([
  __decorateParam(1, ITerminalService)
], TerminalDataEventTracker);
class ExtensionTerminalLinkProvider {
  constructor(_proxy) {
    this._proxy = _proxy;
  }
  async provideLinks(instance, line) {
    const proxy = this._proxy;
    const extHostLinks = await proxy.$provideLinks(instance.instanceId, line);
    return extHostLinks.map((dto) => ({
      id: dto.id,
      startIndex: dto.startIndex,
      length: dto.length,
      label: dto.label,
      activate: () => proxy.$activateLink(instance.instanceId, dto.id)
    }));
  }
}
function getOutputMatchForLines(lines, outputMatcher) {
  const match = lines.join("\n").match(outputMatcher.lineMatcher);
  return match ? { regexMatch: match, outputLines: lines } : void 0;
}
function parseQuickFix(id, source, fix) {
  let type = TerminalQuickFixType.TerminalCommand;
  if (hasKey(fix, { uri: true })) {
    fix.uri = URI.revive(fix.uri);
    type = TerminalQuickFixType.Opener;
  } else if (hasKey(fix, { id: true })) {
    type = TerminalQuickFixType.VscodeCommand;
  }
  return { id, type, source, ...fix };
}
export {
  MainThreadTerminalService,
  getOutputMatchForLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZFRlcm1pbmFsU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3RUZXJtaW5hbFNlcnZpY2VTaGFwZSwgTWFpblRocmVhZFRlcm1pbmFsU2VydmljZVNoYXBlLCBNYWluQ29udGV4dCwgVGVybWluYWxMYXVuY2hDb25maWcsIElUZXJtaW5hbERpbWVuc2lvbnNEdG8sIEV4dEhvc3RUZXJtaW5hbElkZW50aWZpZXIsIFRlcm1pbmFsUXVpY2tGaXgsIElUZXJtaW5hbENvbW1hbmREdG8gfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9jZXNzUHJvcGVydHksIElQcm9jZXNzUmVhZHlXaW5kb3dzUHR5LCBJU2hlbGxMYXVuY2hDb25maWcsIElTaGVsbExhdW5jaENvbmZpZ0R0bywgSVRlcm1pbmFsT3V0cHV0TWF0Y2gsIElUZXJtaW5hbE91dHB1dE1hdGNoZXIsIFByb2Nlc3NQcm9wZXJ0eVR5cGUsIHJlbW90ZVJlc29sdmVyVGVybWluYWwsIFRlcm1pbmFsRXhpdFJlYXNvbiwgVGVybWluYWxMb2NhdGlvbiwgdHlwZSBJUHJvY2Vzc1Byb3BlcnR5TWFwIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsRGF0YUJ1ZmZlcmVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsRGF0YUJ1ZmZlcmluZy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxFZGl0b3JTZXJ2aWNlLCBJVGVybWluYWxFeHRlcm5hbExpbmtQcm92aWRlciwgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsTGluaywgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFByb2Nlc3NFeHRIb3N0UHJveHkgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgZGVzZXJpYWxpemVFbnZpcm9ubWVudERlc2NyaXB0aW9uTWFwLCBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLCBzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlU2hhcmVkLmpzJztcbmltcG9ydCB7IElTdGFydEV4dGVuc2lvblRlcm1pbmFsUmVxdWVzdCwgSVRlcm1pbmFsUHJvY2Vzc0V4dEhvc3RQcm94eSwgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSwgSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsRWRpdG9yTG9jYXRpb25PcHRpb25zIH0gZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6YWJsZUVudmlyb25tZW50RGVzY3JpcHRpb25NYXAsIElTZXJpYWxpemFibGVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExpbmtQcm92aWRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy9icm93c2VyL2xpbmtzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFF1aWNrRml4U2VydmljZSwgSVRlcm1pbmFsUXVpY2tGaXgsIFRlcm1pbmFsUXVpY2tGaXhUeXBlIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXJtaW5hbENvbnRyaWIvcXVpY2tGaXgvYnJvd3Nlci9xdWlja0ZpeC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb21wbGV0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N1Z2dlc3QvYnJvd3Nlci90ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuaW50ZXJmYWNlIFRlcm1pbmFsUHJvY2Vzc1Byb3h5RW50cnkgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IHByb3h5OiBJVGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5O1xufVxuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZFRlcm1pbmFsU2VydmljZSlcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkVGVybWluYWxTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRUZXJtaW5hbFNlcnZpY2VTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RUZXJtaW5hbFNlcnZpY2VTaGFwZTtcblxuXHQvKipcblx0ICogU3RvcmVzIGEgbWFwIGZyb20gYSB0ZW1wb3JhcnkgdGVybWluYWwgaWQgKGEgVVVJRCBnZW5lcmF0ZWQgb24gdGhlIGV4dGVuc2lvbiBob3N0IHNpZGUpXG5cdCAqIHRvIGEgbnVtZXJpYyB0ZXJtaW5hbCBpZCAoYW4gaWQgZ2VuZXJhdGVkIG9uIHRoZSByZW5kZXJlciBzaWRlKVxuXHQgKiBUaGlzIGNvbWVzIGluIHBsYXkgb25seSB3aGVuIGRlYWxpbmcgd2l0aCB0ZXJtaW5hbHMgY3JlYXRlZCBvbiB0aGUgZXh0ZW5zaW9uIGhvc3Qgc2lkZVxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdFRlcm1pbmFscyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9jZXNzUHJveGllcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgVGVybWluYWxQcm9jZXNzUHJveHlFbnRyeT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb2ZpbGVQcm92aWRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tcGxldGlvblByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWlja0ZpeFByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhRXZlbnRUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFRlcm1pbmFsRGF0YUV2ZW50VHJhY2tlcj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbmRDb21tYW5kRXZlbnRMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHQvKipcblx0ICogQSBzaW5nbGUgc2hhcmVkIHRlcm1pbmFsIGxpbmsgcHJvdmlkZXIgZm9yIHRoZSBleHRob3N0LiBXaGVuIGFuIGV4dCByZWdpc3RlcnMgYSBsaW5rXG5cdCAqIHByb3ZpZGVyLCB0aGlzIGlzIHJlZ2lzdGVyZWQgd2l0aCB0aGUgdGVybWluYWwgb24gdGhlIHJlbmRlcmVyIHNpZGUgYW5kIGFsbCBsaW5rcyBhcmVcblx0ICogcHJvdmlkZWQgdGhyb3VnaCB0aGlzLCBldmVuIGZyb20gbXVsdGlwbGUgZXh0IGxpbmsgcHJvdmlkZXJzLiBYdGVybSBzaG91bGQgcmVtb3ZlIGxvd2VyXG5cdCAqIHByaW9yaXR5IGludGVyc2VjdGluZyBsaW5rcyBpdHNlbGYuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5rUHJvdmlkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfb3M6IE9wZXJhdGluZ1N5c3RlbSA9IE9TO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdF9leHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsTGlua1Byb3ZpZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbExpbmtQcm92aWRlclNlcnZpY2U6IElUZXJtaW5hbExpbmtQcm92aWRlclNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFF1aWNrRml4U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFF1aWNrRml4U2VydmljZTogSVRlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlOiBJRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsRWRpdG9yU2VydmljZTogSVRlcm1pbmFsRWRpdG9yU2VydmljZSxcblx0XHRASVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2U6IElUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IF9leHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0VGVybWluYWxTZXJ2aWNlKTtcblxuXHRcdC8vIElUZXJtaW5hbFNlcnZpY2UgbGlzdGVuZXJzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3Rlcm1pbmFsU2VydmljZS5vbkRpZENyZWF0ZUluc3RhbmNlKChpbnN0YW5jZSkgPT4ge1xuXHRcdFx0dGhpcy5fb25UZXJtaW5hbE9wZW5lZChpbnN0YW5jZSk7XG5cdFx0XHR0aGlzLl9vbkluc3RhbmNlRGltZW5zaW9uc0NoYW5nZWQoaW5zdGFuY2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25EaWREaXNwb3NlSW5zdGFuY2UoaW5zdGFuY2UgPT4gdGhpcy5fb25UZXJtaW5hbERpc3Bvc2VkKGluc3RhbmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZVByb2Nlc3NJZFJlYWR5KGluc3RhbmNlID0+IHRoaXMuX29uVGVybWluYWxQcm9jZXNzSWRSZWFkeShpbnN0YW5jZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlSW5zdGFuY2VEaW1lbnNpb25zKGluc3RhbmNlID0+IHRoaXMuX29uSW5zdGFuY2VEaW1lbnNpb25zQ2hhbmdlZChpbnN0YW5jZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VNYXhpbXVtRGltZW5zaW9uc0NoYW5nZShpbnN0YW5jZSA9PiB0aGlzLl9vbkluc3RhbmNlTWF4aW11bURpbWVuc2lvbnNDaGFuZ2VkKGluc3RhbmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25EaWRSZXF1ZXN0U3RhcnRFeHRlbnNpb25UZXJtaW5hbChlID0+IHRoaXMuX29uUmVxdWVzdFN0YXJ0RXh0ZW5zaW9uVGVybWluYWwoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UgPT4gdGhpcy5fb25BY3RpdmVUZXJtaW5hbENoYW5nZWQoaW5zdGFuY2UgPyBpbnN0YW5jZS5pbnN0YW5jZUlkIDogbnVsbCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VUaXRsZUNoYW5nZShpbnN0YW5jZSA9PiBpbnN0YW5jZSAmJiB0aGlzLl9vblRpdGxlQ2hhbmdlZChpbnN0YW5jZS5pbnN0YW5jZUlkLCBpbnN0YW5jZS50aXRsZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VEYXRhSW5wdXQoaW5zdGFuY2UgPT4gdGhpcy5fcHJveHkuJGFjY2VwdFRlcm1pbmFsSW50ZXJhY3Rpb24oaW5zdGFuY2UuaW5zdGFuY2VJZCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VTZWxlY3Rpb25DaGFuZ2UoaW5zdGFuY2UgPT4gdGhpcy5fcHJveHkuJGFjY2VwdFRlcm1pbmFsU2VsZWN0aW9uKGluc3RhbmNlLmluc3RhbmNlSWQsIGluc3RhbmNlLnNlbGVjdGlvbikpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uQW55SW5zdGFuY2VTaGVsbFR5cGVDaGFuZ2VkKGluc3RhbmNlID0+IHRoaXMuX29uU2hlbGxUeXBlQ2hhbmdlZChpbnN0YW5jZS5pbnN0YW5jZUlkKSkpO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgZXh0IGhvc3Qgc3RhdGVcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdHRoaXMuX29uVGVybWluYWxPcGVuZWQoaW5zdGFuY2UpO1xuXHRcdFx0aW5zdGFuY2UucHJvY2Vzc1JlYWR5LnRoZW4oKCkgPT4gdGhpcy5fb25UZXJtaW5hbFByb2Nlc3NJZFJlYWR5KGluc3RhbmNlKSk7XG5cdFx0XHRpZiAoaW5zdGFuY2Uuc2hlbGxUeXBlKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUZXJtaW5hbFNoZWxsVHlwZShpbnN0YW5jZS5pbnN0YW5jZUlkLCBpbnN0YW5jZS5zaGVsbFR5cGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRpZiAoYWN0aXZlSW5zdGFuY2UpIHtcblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRBY3RpdmVUZXJtaW5hbENoYW5nZWQoYWN0aXZlSW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZS5jb2xsZWN0aW9ucy5zaXplID4gMCkge1xuXHRcdFx0Y29uc3QgY29sbGVjdGlvbkFzQXJyYXkgPSBbLi4udGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UuY29sbGVjdGlvbnMuZW50cmllcygpXTtcblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRDb2xsZWN0aW9uczogW3N0cmluZywgSVNlcmlhbGl6YWJsZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uXVtdID0gY29sbGVjdGlvbkFzQXJyYXkubWFwKGUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW2VbMF0sIHNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGVbMV0ubWFwKV07XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3Byb3h5LiRpbml0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKHNlcmlhbGl6ZWRDb2xsZWN0aW9ucyk7XG5cdFx0fVxuXHRcdHJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpLnRoZW4oYXN5bmMgZW52ID0+IHtcblx0XHRcdHRoaXMuX29zID0gZW52Py5vcyB8fCBPUztcblx0XHRcdHRoaXMuX3VwZGF0ZURlZmF1bHRQcm9maWxlKCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzKCgpID0+IHRoaXMuX3VwZGF0ZURlZmF1bHRQcm9maWxlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZURlZmF1bHRQcm9maWxlKCkge1xuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGUgPSB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UuZ2V0RGVmYXVsdFByb2ZpbGUoeyByZW1vdGVBdXRob3JpdHksIG9zOiB0aGlzLl9vcyB9KTtcblx0XHRjb25zdCBkZWZhdWx0QXV0b21hdGlvblByb2ZpbGUgPSB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UuZ2V0RGVmYXVsdFByb2ZpbGUoeyByZW1vdGVBdXRob3JpdHksIG9zOiB0aGlzLl9vcywgYWxsb3dBdXRvbWF0aW9uU2hlbGw6IHRydWUgfSk7XG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdERlZmF1bHRQcm9maWxlKC4uLmF3YWl0IFByb21pc2UuYWxsKFtkZWZhdWx0UHJvZmlsZSwgZGVmYXVsdEF1dG9tYXRpb25Qcm9maWxlXSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0VGVybWluYWxJbnN0YW5jZShpZDogRXh0SG9zdFRlcm1pbmFsSWRlbnRpZmllcik6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodHlwZW9mIGlkID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4dEhvc3RUZXJtaW5hbHMuZ2V0KGlkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21JZChpZCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGNyZWF0ZVRlcm1pbmFsKGV4dEhvc3RUZXJtaW5hbElkOiBzdHJpbmcsIGxhdW5jaENvbmZpZzogVGVybWluYWxMYXVuY2hDb25maWcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnID0ge1xuXHRcdFx0bmFtZTogbGF1bmNoQ29uZmlnLm5hbWUsXG5cdFx0XHRleGVjdXRhYmxlOiBsYXVuY2hDb25maWcuc2hlbGxQYXRoLFxuXHRcdFx0YXJnczogbGF1bmNoQ29uZmlnLnNoZWxsQXJncyxcblx0XHRcdGN3ZDogdHlwZW9mIGxhdW5jaENvbmZpZy5jd2QgPT09ICdzdHJpbmcnID8gbGF1bmNoQ29uZmlnLmN3ZCA6IFVSSS5yZXZpdmUobGF1bmNoQ29uZmlnLmN3ZCksXG5cdFx0XHRpY29uOiBsYXVuY2hDb25maWcuaWNvbixcblx0XHRcdGNvbG9yOiBsYXVuY2hDb25maWcuY29sb3IsXG5cdFx0XHRpbml0aWFsVGV4dDogbGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0LFxuXHRcdFx0d2FpdE9uRXhpdDogbGF1bmNoQ29uZmlnLndhaXRPbkV4aXQsXG5cdFx0XHRpZ25vcmVDb25maWd1cmF0aW9uQ3dkOiB0cnVlLFxuXHRcdFx0ZW52OiBsYXVuY2hDb25maWcuZW52LFxuXHRcdFx0c3RyaWN0RW52OiBsYXVuY2hDb25maWcuc3RyaWN0RW52LFxuXHRcdFx0aGlkZUZyb21Vc2VyOiBsYXVuY2hDb25maWcuaGlkZUZyb21Vc2VyLFxuXHRcdFx0Y3VzdG9tUHR5SW1wbGVtZW50YXRpb246IGxhdW5jaENvbmZpZy5pc0V4dGVuc2lvbkN1c3RvbVB0eVRlcm1pbmFsXG5cdFx0XHRcdD8gKGlkLCBjb2xzLCByb3dzKSA9PiBuZXcgVGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5KGlkLCBjb2xzLCByb3dzLCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UpXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0ZXh0SG9zdFRlcm1pbmFsSWQsXG5cdFx0XHRmb3JjZVNoZWxsSW50ZWdyYXRpb246IGxhdW5jaENvbmZpZy5mb3JjZVNoZWxsSW50ZWdyYXRpb24sXG5cdFx0XHRpc0ZlYXR1cmVUZXJtaW5hbDogbGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsLFxuXHRcdFx0W3JlbW90ZVJlc29sdmVyVGVybWluYWxdOiBsYXVuY2hDb25maWcuaXNSZW1vdGVSZXNvbHZlclRlcm1pbmFsIHx8IHVuZGVmaW5lZCxcblx0XHRcdGlzRXh0ZW5zaW9uT3duZWRUZXJtaW5hbDogbGF1bmNoQ29uZmlnLmlzRXh0ZW5zaW9uT3duZWRUZXJtaW5hbCxcblx0XHRcdHVzZVNoZWxsRW52aXJvbm1lbnQ6IGxhdW5jaENvbmZpZy51c2VTaGVsbEVudmlyb25tZW50LFxuXHRcdFx0aXNUcmFuc2llbnQ6IGxhdW5jaENvbmZpZy5pc1RyYW5zaWVudCxcblx0XHRcdHNoZWxsSW50ZWdyYXRpb25Ob25jZTogbGF1bmNoQ29uZmlnLnNoZWxsSW50ZWdyYXRpb25Ob25jZSxcblx0XHRcdHRpdGxlVGVtcGxhdGU6IGxhdW5jaENvbmZpZy50aXRsZVRlbXBsYXRlLFxuXHRcdH07XG5cdFx0Y29uc3QgdGVybWluYWwgPSBQcm9taXNlcy53aXRoQXN5bmNCb2R5PElUZXJtaW5hbEluc3RhbmNlPihhc3luYyByID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsID0gYXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdFx0Y29uZmlnOiBzaGVsbExhdW5jaENvbmZpZyxcblx0XHRcdFx0Y3dkOiBsYXVuY2hDb25maWcuaXNSZW1vdGVSZXNvbHZlclRlcm1pbmFsID8gc2hlbGxMYXVuY2hDb25maWcuY3dkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsb2NhdGlvbjogYXdhaXQgdGhpcy5fZGVzZXJpYWxpemVQYXJlbnRUZXJtaW5hbChsYXVuY2hDb25maWcubG9jYXRpb24pXG5cdFx0XHR9KTtcblx0XHRcdHIodGVybWluYWwpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2V4dEhvc3RUZXJtaW5hbHMuc2V0KGV4dEhvc3RUZXJtaW5hbElkLCB0ZXJtaW5hbCk7XG5cdFx0Y29uc3QgdGVybWluYWxJbnN0YW5jZSA9IGF3YWl0IHRlcm1pbmFsO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlcm1pbmFsSW5zdGFuY2Uub25EaXNwb3NlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9leHRIb3N0VGVybWluYWxzLmRlbGV0ZShleHRIb3N0VGVybWluYWxJZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGVzZXJpYWxpemVQYXJlbnRUZXJtaW5hbChsb2NhdGlvbj86IFRlcm1pbmFsTG9jYXRpb24gfCBUZXJtaW5hbEVkaXRvckxvY2F0aW9uT3B0aW9ucyB8IHsgcGFyZW50VGVybWluYWw6IEV4dEhvc3RUZXJtaW5hbElkZW50aWZpZXIgfSB8IHsgc3BsaXRBY3RpdmVUZXJtaW5hbDogYm9vbGVhbjsgbG9jYXRpb24/OiBUZXJtaW5hbExvY2F0aW9uIH0pOiBQcm9taXNlPFRlcm1pbmFsTG9jYXRpb24gfCBUZXJtaW5hbEVkaXRvckxvY2F0aW9uT3B0aW9ucyB8IHsgcGFyZW50VGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlIH0gfCB7IHNwbGl0QWN0aXZlVGVybWluYWw6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0eXBlb2YgbG9jYXRpb24gPT09ICdvYmplY3QnICYmIGhhc0tleShsb2NhdGlvbiwgeyBwYXJlbnRUZXJtaW5hbDogdHJ1ZSB9KSkge1xuXHRcdFx0Y29uc3QgcGFyZW50VGVybWluYWwgPSBhd2FpdCB0aGlzLl9leHRIb3N0VGVybWluYWxzLmdldChsb2NhdGlvbi5wYXJlbnRUZXJtaW5hbC50b1N0cmluZygpKTtcblx0XHRcdHJldHVybiBwYXJlbnRUZXJtaW5hbCA/IHsgcGFyZW50VGVybWluYWwgfSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2F0aW9uO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRzaG93KGlkOiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVybWluYWxJbnN0YW5jZSA9IGF3YWl0IHRoaXMuX2dldFRlcm1pbmFsSW5zdGFuY2UoaWQpO1xuXHRcdGlmICh0ZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWxJbnN0YW5jZSk7XG5cdFx0XHRpZiAodGVybWluYWxJbnN0YW5jZS50YXJnZXQgPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5yZXZlYWxBY3RpdmVFZGl0b3IocHJlc2VydmVGb2N1cyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwoIXByZXNlcnZlRm9jdXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkaGlkZShpZDogRXh0SG9zdFRlcm1pbmFsSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbmNlVG9IaWRlID0gYXdhaXQgdGhpcy5fZ2V0VGVybWluYWxJbnN0YW5jZShpZCk7XG5cdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0aWYgKGFjdGl2ZUluc3RhbmNlICYmIGFjdGl2ZUluc3RhbmNlLmluc3RhbmNlSWQgPT09IGluc3RhbmNlVG9IaWRlPy5pbnN0YW5jZUlkICYmIGFjdGl2ZUluc3RhbmNlLnRhcmdldCAhPT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmhpZGVQYW5lbCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkZGlzcG9zZShpZDogRXh0SG9zdFRlcm1pbmFsSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdChhd2FpdCB0aGlzLl9nZXRUZXJtaW5hbEluc3RhbmNlKGlkKSk/LmRpc3Bvc2UoVGVybWluYWxFeGl0UmVhc29uLkV4dGVuc2lvbik7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHNlbmRUZXh0KGlkOiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyLCB0ZXh0OiBzdHJpbmcsIHNob3VsZEV4ZWN1dGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IHRoaXMuX2dldFRlcm1pbmFsSW5zdGFuY2UoaWQpO1xuXHRcdGF3YWl0IGluc3RhbmNlPy5zZW5kVGV4dCh0ZXh0LCBzaG91bGRFeGVjdXRlKTtcblx0fVxuXG5cdHB1YmxpYyAkc2VuZFByb2Nlc3NFeGl0KHRlcm1pbmFsSWQ6IG51bWJlciwgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc1Byb3hpZXMuZ2V0KHRlcm1pbmFsSWQpPy5wcm94eS5lbWl0RXhpdChleGl0Q29kZSk7XG5cdH1cblxuXHRwdWJsaWMgJHN0YXJ0U2VuZGluZ0RhdGFFdmVudHMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kYXRhRXZlbnRUcmFja2VyLnZhbHVlKSB7XG5cdFx0XHR0aGlzLl9kYXRhRXZlbnRUcmFja2VyLnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxEYXRhRXZlbnRUcmFja2VyLCAoaWQsIGRhdGEpID0+IHtcblx0XHRcdFx0dGhpcy5fb25UZXJtaW5hbERhdGEoaWQsIGRhdGEpO1xuXHRcdFx0fSk7XG5cdFx0XHQvLyBTZW5kIGluaXRpYWwgZXZlbnRzIGlmIHRoZXkgZXhpc3Rcblx0XHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgaW5zdGFuY2UuaW5pdGlhbERhdGFFdmVudHMgfHwgW10pIHtcblx0XHRcdFx0XHR0aGlzLl9vblRlcm1pbmFsRGF0YShpbnN0YW5jZS5pbnN0YW5jZUlkLCBkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyAkc3RvcFNlbmRpbmdEYXRhRXZlbnRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RhdGFFdmVudFRyYWNrZXIuY2xlYXIoKTtcblx0fVxuXG5cdHB1YmxpYyAkc3RhcnRTZW5kaW5nQ29tbWFuZEV2ZW50cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2VuZENvbW1hbmRFdmVudExpc3RlbmVyLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbXVsdGlwbGV4ZXIgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlT25JbnN0YW5jZUNhcGFiaWxpdHlFdmVudChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiwgY2FwYWJpbGl0eSA9PiBjYXBhYmlsaXR5Lm9uQ29tbWFuZEZpbmlzaGVkKTtcblx0XHRjb25zdCBzdWIgPSBtdWx0aXBsZXhlci5ldmVudChlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkRXhlY3V0ZUNvbW1hbmQoZS5pbnN0YW5jZS5pbnN0YW5jZUlkLCB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiBlLmRhdGEuY29tbWFuZCxcblx0XHRcdFx0Ly8gVE9ETzogQ29udmVydCB0byBVUkkgaWYgcG9zc2libGVcblx0XHRcdFx0Y3dkOiBlLmRhdGEuY3dkLFxuXHRcdFx0XHRleGl0Q29kZTogZS5kYXRhLmV4aXRDb2RlLFxuXHRcdFx0XHRvdXRwdXQ6IGUuZGF0YS5nZXRPdXRwdXQoKVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fc2VuZENvbW1hbmRFdmVudExpc3RlbmVyLnZhbHVlID0gY29tYmluZWREaXNwb3NhYmxlKG11bHRpcGxleGVyLCBzdWIpO1xuXHR9XG5cblx0cHVibGljICRzdG9wU2VuZGluZ0NvbW1hbmRFdmVudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VuZENvbW1hbmRFdmVudExpc3RlbmVyLmNsZWFyKCk7XG5cdH1cblxuXHRwdWJsaWMgJHN0YXJ0TGlua1Byb3ZpZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpbmtQcm92aWRlci52YWx1ZSA9IHRoaXMuX3Rlcm1pbmFsTGlua1Byb3ZpZGVyU2VydmljZS5yZWdpc3RlckxpbmtQcm92aWRlcihuZXcgRXh0ZW5zaW9uVGVybWluYWxMaW5rUHJvdmlkZXIodGhpcy5fcHJveHkpKTtcblx0fVxuXG5cdHB1YmxpYyAkc3RvcExpbmtQcm92aWRlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9saW5rUHJvdmlkZXIuY2xlYXIoKTtcblx0fVxuXG5cdHB1YmxpYyAkcmVnaXN0ZXJQcm9jZXNzU3VwcG9ydChpc1N1cHBvcnRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5yZWdpc3RlclByb2Nlc3NTdXBwb3J0KGlzU3VwcG9ydGVkKTtcblx0fVxuXG5cdHB1YmxpYyAkcmVnaXN0ZXJDb21wbGV0aW9uUHJvdmlkZXIoaWQ6IHN0cmluZywgZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCAuLi50cmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHR0aGlzLl9jb21wbGV0aW9uUHJvdmlkZXJzLnNldChpZCwgdGhpcy5fdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZWdpc3RlclRlcm1pbmFsQ29tcGxldGlvblByb3ZpZGVyKGV4dGVuc2lvbklkZW50aWZpZXIsIGlkLCB7XG5cdFx0XHRpZCxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uczogYXN5bmMgKGNvbW1hbmRMaW5lLCBjdXJzb3JJbmRleCwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZVRlcm1pbmFsQ29tcGxldGlvbnMoaWQsIHsgY29tbWFuZExpbmUsIGN1cnNvckluZGV4IH0sIHRva2VuKTtcblx0XHRcdFx0aWYgKCFjb21wbGV0aW9ucykge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbXBsZXRpb25zLnJlc291cmNlT3B0aW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IHsgY3dkLCBnbG9iUGF0dGVybiwgLi4ucmVzdCB9ID0gY29tcGxldGlvbnMucmVzb3VyY2VPcHRpb25zO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRpdGVtczogY29tcGxldGlvbnMuaXRlbXM/Lm1hcChjID0+ICh7XG5cdFx0XHRcdFx0XHRcdHByb3ZpZGVyOiBgZXh0OiR7aWR9YCxcblx0XHRcdFx0XHRcdFx0Li4uYyxcblx0XHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRcdHJlc291cmNlT3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHQuLi5yZXN0LFxuXHRcdFx0XHRcdFx0XHRjd2QsXG5cdFx0XHRcdFx0XHRcdGdsb2JQYXR0ZXJuXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY29tcGxldGlvbnMuaXRlbXM/Lm1hcChjID0+ICh7XG5cdFx0XHRcdFx0cHJvdmlkZXI6IGBleHQ6JHtpZH1gLFxuXHRcdFx0XHRcdC4uLmMsXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9LCAuLi50cmlnZ2VyQ2hhcmFjdGVycykpO1xuXHR9XG5cblx0cHVibGljICR1bnJlZ2lzdGVyQ29tcGxldGlvblByb3ZpZGVyKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21wbGV0aW9uUHJvdmlkZXJzLmRlbGV0ZUFuZERpc3Bvc2UoaWQpO1xuXHR9XG5cblx0cHVibGljICRyZWdpc3RlclByb2ZpbGVQcm92aWRlcihpZDogc3RyaW5nLCBleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBQcm94eSBwcm9maWxlIHByb3ZpZGVyIHJlcXVlc3RzIHRocm91Z2ggdGhlIGV4dGVuc2lvbiBob3N0XG5cdFx0dGhpcy5fcHJvZmlsZVByb3ZpZGVycy5zZXQoaWQsIHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UucmVnaXN0ZXJUZXJtaW5hbFByb2ZpbGVQcm92aWRlcihleHRlbnNpb25JZGVudGlmaWVyLCBpZCwge1xuXHRcdFx0Y3JlYXRlQ29udHJpYnV0ZWRUZXJtaW5hbFByb2ZpbGU6IGFzeW5jIChvcHRpb25zKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kY3JlYXRlQ29udHJpYnV0ZWRQcm9maWxlVGVybWluYWwoaWQsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyAkdW5yZWdpc3RlclByb2ZpbGVQcm92aWRlcihpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvZmlsZVByb3ZpZGVycy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkcmVnaXN0ZXJRdWlja0ZpeFByb3ZpZGVyKGlkOiBzdHJpbmcsIGV4dGVuc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9xdWlja0ZpeFByb3ZpZGVycy5zZXQoaWQsIHRoaXMuX3Rlcm1pbmFsUXVpY2tGaXhTZXJ2aWNlLnJlZ2lzdGVyUXVpY2tGaXhQcm92aWRlcihpZCwge1xuXHRcdFx0cHJvdmlkZVRlcm1pbmFsUXVpY2tGaXhlczogYXN5bmMgKHRlcm1pbmFsQ29tbWFuZCwgbGluZXMsIG9wdGlvbnMsIHRva2VuKSA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucy5vdXRwdXRNYXRjaGVyPy5sZW5ndGggJiYgb3B0aW9ucy5vdXRwdXRNYXRjaGVyLmxlbmd0aCA+IDQwKSB7XG5cdFx0XHRcdFx0b3B0aW9ucy5vdXRwdXRNYXRjaGVyLmxlbmd0aCA9IDQwO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignQ2Fubm90IGV4Y2VlZCBvdXRwdXQgbWF0Y2hlciBsZW5ndGggb2YgNDAnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb21tYW5kTGluZU1hdGNoID0gdGVybWluYWxDb21tYW5kLmNvbW1hbmQubWF0Y2gob3B0aW9ucy5jb21tYW5kTGluZU1hdGNoZXIpO1xuXHRcdFx0XHRpZiAoIWNvbW1hbmRMaW5lTWF0Y2ggfHwgIWxpbmVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG91dHB1dE1hdGNoZXIgPSBvcHRpb25zLm91dHB1dE1hdGNoZXI7XG5cdFx0XHRcdGxldCBvdXRwdXRNYXRjaDtcblx0XHRcdFx0aWYgKG91dHB1dE1hdGNoZXIpIHtcblx0XHRcdFx0XHRvdXRwdXRNYXRjaCA9IGdldE91dHB1dE1hdGNoRm9yTGluZXMobGluZXMsIG91dHB1dE1hdGNoZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghb3V0cHV0TWF0Y2gpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWF0Y2hSZXN1bHQgPSB7IGNvbW1hbmRMaW5lTWF0Y2gsIG91dHB1dE1hdGNoLCBjb21tYW5kTGluZTogdGVybWluYWxDb21tYW5kLmNvbW1hbmQgfTtcblxuXHRcdFx0XHRpZiAobWF0Y2hSZXN1bHQpIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZVRlcm1pbmFsUXVpY2tGaXhlcyhpZCwgbWF0Y2hSZXN1bHQsIHRva2VuKTtcblx0XHRcdFx0XHRpZiAocmVzdWx0ICYmIEFycmF5LmlzQXJyYXkocmVzdWx0KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdC5tYXAociA9PiBwYXJzZVF1aWNrRml4KGlkLCBleHRlbnNpb25JZCwgcikpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGFyc2VRdWlja0ZpeChpZCwgZXh0ZW5zaW9uSWQsIHJlc3VsdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgJHVucmVnaXN0ZXJRdWlja0ZpeFByb3ZpZGVyKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9xdWlja0ZpeFByb3ZpZGVycy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0fVxuXG5cdHByaXZhdGUgX29uQWN0aXZlVGVybWluYWxDaGFuZ2VkKHRlcm1pbmFsSWQ6IG51bWJlciB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0QWN0aXZlVGVybWluYWxDaGFuZ2VkKHRlcm1pbmFsSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25UZXJtaW5hbERhdGEodGVybWluYWxJZDogbnVtYmVyLCBkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGVybWluYWxQcm9jZXNzRGF0YSh0ZXJtaW5hbElkLCBkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkRXhlY3V0ZUNvbW1hbmQodGVybWluYWxJZDogbnVtYmVyLCBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kRHRvKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdERpZEV4ZWN1dGVDb21tYW5kKHRlcm1pbmFsSWQsIGNvbW1hbmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25UaXRsZUNoYW5nZWQodGVybWluYWxJZDogbnVtYmVyLCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGVybWluYWxUaXRsZUNoYW5nZSh0ZXJtaW5hbElkLCBuYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgX29uU2hlbGxUeXBlQ2hhbmdlZCh0ZXJtaW5hbElkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbEluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmdldEluc3RhbmNlRnJvbUlkKHRlcm1pbmFsSWQpO1xuXHRcdGlmICh0ZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGVybWluYWxTaGVsbFR5cGUodGVybWluYWxJZCwgdGVybWluYWxJbnN0YW5jZS5zaGVsbFR5cGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uVGVybWluYWxEaXNwb3NlZCh0ZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUZXJtaW5hbENsb3NlZCh0ZXJtaW5hbEluc3RhbmNlLmluc3RhbmNlSWQsIHRlcm1pbmFsSW5zdGFuY2UuZXhpdENvZGUsIHRlcm1pbmFsSW5zdGFuY2UuZXhpdFJlYXNvbiA/PyBUZXJtaW5hbEV4aXRSZWFzb24uVW5rbm93bik7XG5cdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzUHJveGllcy5kZWxldGVBbmREaXNwb3NlKHRlcm1pbmFsSW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblRlcm1pbmFsT3BlbmVkKHRlcm1pbmFsSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0SG9zdFRlcm1pbmFsSWQgPSB0ZXJtaW5hbEluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmV4dEhvc3RUZXJtaW5hbElkO1xuXHRcdGNvbnN0IHNoZWxsTGF1bmNoQ29uZmlnRHRvOiBJU2hlbGxMYXVuY2hDb25maWdEdG8gPSB7XG5cdFx0XHRuYW1lOiB0ZXJtaW5hbEluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLm5hbWUsXG5cdFx0XHRleGVjdXRhYmxlOiB0ZXJtaW5hbEluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUsXG5cdFx0XHRhcmdzOiB0ZXJtaW5hbEluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MsXG5cdFx0XHRjd2Q6IHRlcm1pbmFsSW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuY3dkLFxuXHRcdFx0ZW52OiB0ZXJtaW5hbEluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmVudixcblx0XHRcdGhpZGVGcm9tVXNlcjogdGVybWluYWxJbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIsXG5cdFx0XHR0YWJBY3Rpb25zOiB0ZXJtaW5hbEluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLnRhYkFjdGlvbnMsXG5cdFx0XHR0aXRsZVRlbXBsYXRlOiB0ZXJtaW5hbEluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLnRpdGxlVGVtcGxhdGVcblx0XHR9O1xuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUZXJtaW5hbE9wZW5lZCh0ZXJtaW5hbEluc3RhbmNlLmluc3RhbmNlSWQsIGV4dEhvc3RUZXJtaW5hbElkLCB0ZXJtaW5hbEluc3RhbmNlLnRpdGxlLCBzaGVsbExhdW5jaENvbmZpZ0R0byk7XG5cdH1cblxuXHRwcml2YXRlIF9vblRlcm1pbmFsUHJvY2Vzc0lkUmVhZHkodGVybWluYWxJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRpZiAodGVybWluYWxJbnN0YW5jZS5wcm9jZXNzSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcm94eS4kYWNjZXB0VGVybWluYWxQcm9jZXNzSWQodGVybWluYWxJbnN0YW5jZS5pbnN0YW5jZUlkLCB0ZXJtaW5hbEluc3RhbmNlLnByb2Nlc3NJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkluc3RhbmNlRGltZW5zaW9uc0NoYW5nZWQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRlcm1pbmFsRGltZW5zaW9ucyhpbnN0YW5jZS5pbnN0YW5jZUlkLCBpbnN0YW5jZS5jb2xzLCBpbnN0YW5jZS5yb3dzKTtcblx0fVxuXG5cdHByaXZhdGUgX29uSW5zdGFuY2VNYXhpbXVtRGltZW5zaW9uc0NoYW5nZWQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJveHkuJGFjY2VwdFRlcm1pbmFsTWF4aW11bURpbWVuc2lvbnMoaW5zdGFuY2UuaW5zdGFuY2VJZCwgaW5zdGFuY2UubWF4Q29scywgaW5zdGFuY2UubWF4Um93cyk7XG5cdH1cblxuXHRwcml2YXRlIF9vblJlcXVlc3RTdGFydEV4dGVuc2lvblRlcm1pbmFsKHJlcXVlc3Q6IElTdGFydEV4dGVuc2lvblRlcm1pbmFsUmVxdWVzdCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3h5ID0gcmVxdWVzdC5wcm94eTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQocHJveHkpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc1Byb3hpZXMuc2V0KHByb3h5Lmluc3RhbmNlSWQsIHsgcHJveHksIGRpc3Bvc2U6ICgpID0+IHN0b3JlLmRpc3Bvc2UoKSB9KTtcblxuXHRcdC8vIE5vdGUgdGhhdCBvblJlc2l6ZSBpcyBub3QgYmVpbmcgbGlzdGVuZWQgdG8gaGVyZSBhcyBpdCBuZWVkcyB0byBmaXJlIHdoZW4gbWF4IGRpbWVuc2lvbnNcblx0XHQvLyBjaGFuZ2UsIGV4Y2x1ZGluZyB0aGUgZGltZW5zaW9uIG92ZXJyaWRlXG5cdFx0Y29uc3QgaW5pdGlhbERpbWVuc2lvbnM6IElUZXJtaW5hbERpbWVuc2lvbnNEdG8gfCB1bmRlZmluZWQgPSByZXF1ZXN0LmNvbHMgJiYgcmVxdWVzdC5yb3dzID8ge1xuXHRcdFx0Y29sdW1uczogcmVxdWVzdC5jb2xzLFxuXHRcdFx0cm93czogcmVxdWVzdC5yb3dzXG5cdFx0fSA6IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3Byb3h5LiRzdGFydEV4dGVuc2lvblRlcm1pbmFsKFxuXHRcdFx0cHJveHkuaW5zdGFuY2VJZCxcblx0XHRcdGluaXRpYWxEaW1lbnNpb25zXG5cdFx0KS50aGVuKHJlcXVlc3QuY2FsbGJhY2spO1xuXG5cdFx0c3RvcmUuYWRkKHByb3h5Lm9uSW5wdXQoZGF0YSA9PiB0aGlzLl9wcm94eS4kYWNjZXB0UHJvY2Vzc0lucHV0KHByb3h5Lmluc3RhbmNlSWQsIGRhdGEpKSk7XG5cdFx0c3RvcmUuYWRkKHByb3h5Lm9uU2h1dGRvd24oaW1tZWRpYXRlID0+IHRoaXMuX3Byb3h5LiRhY2NlcHRQcm9jZXNzU2h1dGRvd24ocHJveHkuaW5zdGFuY2VJZCwgaW1tZWRpYXRlKSkpO1xuXHRcdHN0b3JlLmFkZChwcm94eS5vblJlcXVlc3RDd2QoKCkgPT4gdGhpcy5fcHJveHkuJGFjY2VwdFByb2Nlc3NSZXF1ZXN0Q3dkKHByb3h5Lmluc3RhbmNlSWQpKSk7XG5cdFx0c3RvcmUuYWRkKHByb3h5Lm9uUmVxdWVzdEluaXRpYWxDd2QoKCkgPT4gdGhpcy5fcHJveHkuJGFjY2VwdFByb2Nlc3NSZXF1ZXN0SW5pdGlhbEN3ZChwcm94eS5pbnN0YW5jZUlkKSkpO1xuXHR9XG5cblx0cHVibGljICRzZW5kUHJvY2Vzc0RhdGEodGVybWluYWxJZDogbnVtYmVyLCBkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbFByb2Nlc3NQcm94aWVzLmdldCh0ZXJtaW5hbElkKT8ucHJveHkuZW1pdERhdGEoZGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgJHNlbmRQcm9jZXNzUmVhZHkodGVybWluYWxJZDogbnVtYmVyLCBwaWQ6IG51bWJlciwgY3dkOiBzdHJpbmcsIHdpbmRvd3NQdHk6IElQcm9jZXNzUmVhZHlXaW5kb3dzUHR5IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzUHJveGllcy5nZXQodGVybWluYWxJZCk/LnByb3h5LmVtaXRSZWFkeShwaWQsIGN3ZCwgd2luZG93c1B0eSk7XG5cdH1cblxuXHRwdWJsaWMgJHNlbmRQcm9jZXNzUHJvcGVydHkodGVybWluYWxJZDogbnVtYmVyLCBwcm9wZXJ0eTogSVByb2Nlc3NQcm9wZXJ0eSk6IHZvaWQge1xuXHRcdGlmIChwcm9wZXJ0eS50eXBlID09PSBQcm9jZXNzUHJvcGVydHlUeXBlLlRpdGxlKSB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRJbnN0YW5jZUZyb21JZCh0ZXJtaW5hbElkKTtcblx0XHRcdGluc3RhbmNlPy5yZW5hbWUocHJvcGVydHkudmFsdWUgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtQcm9jZXNzUHJvcGVydHlUeXBlLlRpdGxlXSk7XG5cdFx0fVxuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc1Byb3hpZXMuZ2V0KHRlcm1pbmFsSWQpPy5wcm94eS5lbWl0UHJvY2Vzc1Byb3BlcnR5KHByb3BlcnR5KTtcblx0fVxuXG5cdCRzZXRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmcsIHBlcnNpc3RlbnQ6IGJvb2xlYW4sIGNvbGxlY3Rpb246IElTZXJpYWxpemFibGVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB8IHVuZGVmaW5lZCwgZGVzY3JpcHRpb25NYXA6IElTZXJpYWxpemFibGVFbnZpcm9ubWVudERlc2NyaXB0aW9uTWFwKTogdm9pZCB7XG5cdFx0aWYgKGNvbGxlY3Rpb24pIHtcblx0XHRcdGNvbnN0IHRyYW5zbGF0ZWRDb2xsZWN0aW9uID0ge1xuXHRcdFx0XHRwZXJzaXN0ZW50LFxuXHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oY29sbGVjdGlvbiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uTWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50RGVzY3JpcHRpb25NYXAoZGVzY3JpcHRpb25NYXApXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2Uuc2V0KGV4dGVuc2lvbklkZW50aWZpZXIsIHRyYW5zbGF0ZWRDb2xsZWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UuZGVsZXRlKGV4dGVuc2lvbklkZW50aWZpZXIpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEVuY2Fwc3VsYXRlcyB0ZW1wb3JhcnkgdHJhY2tpbmcgb2YgZGF0YSBldmVudHMgZnJvbSB0ZXJtaW5hbCBpbnN0YW5jZXMsIG9uY2UgZGlzcG9zZWQgYWxsXG4gKiBsaXN0ZW5lcnMgYXJlIHJlbW92ZWQuXG4gKi9cbmNsYXNzIFRlcm1pbmFsRGF0YUV2ZW50VHJhY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9idWZmZXJlcjogVGVybWluYWxEYXRhQnVmZmVyZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbmNlTGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jYWxsYmFjazogKGlkOiBudW1iZXIsIGRhdGE6IHN0cmluZykgPT4gdm9pZCxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2J1ZmZlcmVyID0gbmV3IFRlcm1pbmFsRGF0YUJ1ZmZlcmVyKHRoaXMuX2NhbGxiYWNrKSk7XG5cblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVySW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDcmVhdGVJbnN0YW5jZShpbnN0YW5jZSA9PiB0aGlzLl9yZWdpc3Rlckluc3RhbmNlKGluc3RhbmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZERpc3Bvc2VJbnN0YW5jZShpbnN0YW5jZSA9PiB7XG5cdFx0XHR0aGlzLl9idWZmZXJlci5zdG9wQnVmZmVyaW5nKGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdFx0dGhpcy5faW5zdGFuY2VMaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZShpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlckluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdC8vIEJ1ZmZlciBkYXRhIGV2ZW50cyB0byByZWR1Y2UgdGhlIGFtb3VudCBvZiBtZXNzYWdlcyBnb2luZyB0byB0aGUgZXh0ZW5zaW9uIGhvc3Rcblx0XHR0aGlzLl9pbnN0YW5jZUxpc3RlbmVycy5zZXQoaW5zdGFuY2UuaW5zdGFuY2VJZCwgdGhpcy5fYnVmZmVyZXIuc3RhcnRCdWZmZXJpbmcoaW5zdGFuY2UuaW5zdGFuY2VJZCwgaW5zdGFuY2Uub25EYXRhKSk7XG5cdH1cbn1cblxuY2xhc3MgRXh0ZW5zaW9uVGVybWluYWxMaW5rUHJvdmlkZXIgaW1wbGVtZW50cyBJVGVybWluYWxFeHRlcm5hbExpbmtQcm92aWRlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0VGVybWluYWxTZXJ2aWNlU2hhcGVcblx0KSB7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlTGlua3MoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBsaW5lOiBzdHJpbmcpOiBQcm9taXNlPElUZXJtaW5hbExpbmtbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb3h5ID0gdGhpcy5fcHJveHk7XG5cdFx0Y29uc3QgZXh0SG9zdExpbmtzID0gYXdhaXQgcHJveHkuJHByb3ZpZGVMaW5rcyhpbnN0YW5jZS5pbnN0YW5jZUlkLCBsaW5lKTtcblx0XHRyZXR1cm4gZXh0SG9zdExpbmtzLm1hcChkdG8gPT4gKHtcblx0XHRcdGlkOiBkdG8uaWQsXG5cdFx0XHRzdGFydEluZGV4OiBkdG8uc3RhcnRJbmRleCxcblx0XHRcdGxlbmd0aDogZHRvLmxlbmd0aCxcblx0XHRcdGxhYmVsOiBkdG8ubGFiZWwsXG5cdFx0XHRhY3RpdmF0ZTogKCkgPT4gcHJveHkuJGFjdGl2YXRlTGluayhpbnN0YW5jZS5pbnN0YW5jZUlkLCBkdG8uaWQpXG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRPdXRwdXRNYXRjaEZvckxpbmVzKGxpbmVzOiBzdHJpbmdbXSwgb3V0cHV0TWF0Y2hlcjogSVRlcm1pbmFsT3V0cHV0TWF0Y2hlcik6IElUZXJtaW5hbE91dHB1dE1hdGNoIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkgfCBudWxsIHwgdW5kZWZpbmVkID0gbGluZXMuam9pbignXFxuJykubWF0Y2gob3V0cHV0TWF0Y2hlci5saW5lTWF0Y2hlcik7XG5cdHJldHVybiBtYXRjaCA/IHsgcmVnZXhNYXRjaDogbWF0Y2gsIG91dHB1dExpbmVzOiBsaW5lcyB9IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBwYXJzZVF1aWNrRml4KGlkOiBzdHJpbmcsIHNvdXJjZTogc3RyaW5nLCBmaXg6IFRlcm1pbmFsUXVpY2tGaXgpOiBJVGVybWluYWxRdWlja0ZpeCB7XG5cdGxldCB0eXBlID0gVGVybWluYWxRdWlja0ZpeFR5cGUuVGVybWluYWxDb21tYW5kO1xuXHRpZiAoaGFzS2V5KGZpeCwgeyB1cmk6IHRydWUgfSkpIHtcblx0XHRmaXgudXJpID0gVVJJLnJldml2ZShmaXgudXJpKTtcblx0XHR0eXBlID0gVGVybWluYWxRdWlja0ZpeFR5cGUuT3BlbmVyO1xuXHR9IGVsc2UgaWYgKGhhc0tleShmaXgsIHsgaWQ6IHRydWUgfSkpIHtcblx0XHR0eXBlID0gVGVybWluYWxRdWlja0ZpeFR5cGUuVnNjb2RlQ29tbWFuZDtcblx0fVxuXHRyZXR1cm4geyBpZCwgdHlwZSwgc291cmNlLCAuLi5maXggfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUIsWUFBeUIsbUJBQW1CLG9CQUFvQixxQkFBcUI7QUFDL0csU0FBUyxnQkFBNkUsbUJBQW1JO0FBQ3pOLFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsV0FBVztBQUNwQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUE2SSxxQkFBcUIsd0JBQXdCLG9CQUFvQix3QkFBa0Q7QUFDaFEsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBdUQsdUJBQXlELHdCQUF3QjtBQUNqSixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHNDQUFzQywwQ0FBMEMsOENBQThDO0FBQ3ZJLFNBQXVFLGlDQUFpQywrQkFBK0I7QUFDdkksU0FBUywyQkFBMkI7QUFDcEMsU0FBMEIsVUFBVTtBQUVwQyxTQUFTLGdCQUFnQjtBQUV6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
