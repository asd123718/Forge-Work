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
import * as domStylesheets from "../../../../base/browser/domStylesheets.js";
import * as cssValue from "../../../../base/browser/cssValue.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { debounce, memoize } from "../../../../base/common/decorators.js";
import { DynamicListEventMultiplexer, Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isMacintosh, isWeb } from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import * as nls from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ITerminalLogService, TerminalExitReason, TerminalLocation, TerminalSettingId, TitleEventSource } from "../../../../platform/terminal/common/terminal.js";
import { formatMessageForTerminal } from "../../../../platform/terminal/common/terminalStrings.js";
import { iconForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { VirtualWorkspaceContext } from "../../../common/contextkeys.js";
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService, ITerminalService, TerminalConnectionState } from "./terminal.js";
import { getCwdForSplit } from "./terminalActions.js";
import { TerminalEditorInput } from "./terminalEditorInput.js";
import { getColorStyleContent, getUriClasses } from "./terminalIcon.js";
import { TerminalProfileQuickpick } from "./terminalProfileQuickpick.js";
import { getInstanceFromResource, getTerminalUri, parseTerminalUri } from "./terminalUri.js";
import { ITerminalProfileService } from "../common/terminal.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { columnToEditorGroup } from "../../../services/editor/common/editorGroupColumn.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ILifecycleService, ShutdownReason, StartupKind } from "../../../services/lifecycle/common/lifecycle.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { XtermTerminal } from "./xterm/xtermTerminal.js";
import { TerminalInstance } from "./terminalInstance.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { TerminalCapabilityStore } from "../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
import { mark } from "../../../../base/common/performance.js";
import { DetachedTerminal } from "./detachedTerminal.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { createInstanceCapabilityEventMultiplexer } from "./terminalEvents.js";
import { isAuxiliaryWindow, mainWindow } from "../../../../base/browser/window.js";
import { getActiveWindow } from "../../../../base/browser/dom.js";
import { hasKey, isString } from "../../../../base/common/types.js";
let TerminalService = class extends Disposable {
  constructor(_contextKeyService, _lifecycleService, _logService, _dialogService, _instantiationService, _remoteAgentService, _configurationService, _environmentService, _terminalConfigurationService, _terminalEditorService, _terminalGroupService, _terminalInstanceService, _editorGroupsService, _terminalProfileService, _extensionService, _notificationService, _workspaceContextService, _commandService, _keybindingService, _timerService, _themeService) {
    super();
    this._contextKeyService = _contextKeyService;
    this._lifecycleService = _lifecycleService;
    this._logService = _logService;
    this._dialogService = _dialogService;
    this._instantiationService = _instantiationService;
    this._remoteAgentService = _remoteAgentService;
    this._configurationService = _configurationService;
    this._environmentService = _environmentService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalEditorService = _terminalEditorService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalInstanceService = _terminalInstanceService;
    this._editorGroupsService = _editorGroupsService;
    this._terminalProfileService = _terminalProfileService;
    this._extensionService = _extensionService;
    this._notificationService = _notificationService;
    this._workspaceContextService = _workspaceContextService;
    this._commandService = _commandService;
    this._keybindingService = _keybindingService;
    this._timerService = _timerService;
    this._themeService = _themeService;
    this._hostActiveTerminals = /* @__PURE__ */ new Map();
    this._detachedXterms = /* @__PURE__ */ new Set();
    this._detachedListenersRegistered = false;
    this._isShuttingDown = false;
    this._backgroundedTerminalInstances = [];
    this._backgroundedTerminalDisposables = this._register(new DisposableMap());
    this._connectionState = TerminalConnectionState.Connecting;
    this._whenConnected = new DeferredPromise();
    this._restoredGroupCount = 0;
    this._reconnectedTerminals = /* @__PURE__ */ new Map();
    this._onDidCreateInstance = this._register(new Emitter());
    this._onDidChangeInstanceDimensions = this._register(new Emitter());
    this._onDidRegisterProcessSupport = this._register(new Emitter());
    this._onDidChangeConnectionState = this._register(new Emitter());
    this._onDidRequestStartExtensionTerminal = this._register(new Emitter());
    // ITerminalInstanceHost events
    this._onDidDisposeInstance = this._register(new Emitter());
    this._onDidFocusInstance = this._register(new Emitter());
    this._onDidChangeActiveInstance = this._register(new Emitter());
    this._onDidChangeInstances = this._register(new Emitter());
    this._onDidChangeInstanceCapability = this._register(new Emitter());
    // Terminal view events
    this._onDidChangeActiveGroup = this._register(new Emitter());
    this._register(this.onDidCreateInstance(() => this._terminalProfileService.refreshAvailableProfiles()));
    this._forwardInstanceHostEvents(this._terminalGroupService);
    this._forwardInstanceHostEvents(this._terminalEditorService);
    this._register(this._terminalGroupService.onDidChangeActiveGroup(this._onDidChangeActiveGroup.fire, this._onDidChangeActiveGroup));
    this._register(this._terminalInstanceService.onDidCreateInstance((instance) => {
      this._initInstanceListeners(instance);
      this._onDidCreateInstance.fire(instance);
    }));
    this._register(this._terminalGroupService.onDidChangeActiveInstance((instance) => {
      if (!instance && !this._isShuttingDown && this._terminalConfigurationService.config.hideOnLastClosed) {
        this._terminalGroupService.hidePanel();
      }
      if (instance?.shellType) {
        this._terminalShellTypeContextKey.set(instance.shellType.toString());
      } else if (!instance || !instance.shellType) {
        this._terminalShellTypeContextKey.reset();
      }
    }));
    this._handleInstanceContextKeys();
    this._terminalShellTypeContextKey = TerminalContextKeys.shellType.bindTo(this._contextKeyService);
    this._processSupportContextKey = TerminalContextKeys.processSupported.bindTo(this._contextKeyService);
    this._processSupportContextKey.set(!isWeb || this._remoteAgentService.getConnection() !== null);
    this._terminalHasBeenCreated = TerminalContextKeys.terminalHasBeenCreated.bindTo(this._contextKeyService);
    this._terminalCountContextKey = TerminalContextKeys.count.bindTo(this._contextKeyService);
    this._register(_lifecycleService.onBeforeShutdown(async (e) => e.veto(this._onBeforeShutdown(e.reason), "veto.terminal")));
    this._register(_lifecycleService.onWillShutdown((e) => this._onWillShutdown(e)));
    this._initializePrimaryBackend();
    timeout(0).then(() => this._register(this._instantiationService.createInstance(TerminalEditorStyle, mainWindow.document.head)));
  }
  get isProcessSupportRegistered() {
    return !!this._processSupportContextKey.get();
  }
  get connectionState() {
    return this._connectionState;
  }
  get whenConnected() {
    return this._whenConnected.p;
  }
  get restoredGroupCount() {
    return this._restoredGroupCount;
  }
  get instances() {
    return this._terminalGroupService.instances.concat(this._terminalEditorService.instances).concat(this._backgroundedTerminalInstances.map((bg) => bg.instance));
  }
  /** Gets all non-background terminals. */
  get foregroundInstances() {
    return this._terminalGroupService.instances.concat(this._terminalEditorService.instances);
  }
  get detachedInstances() {
    return this._detachedXterms;
  }
  getReconnectedTerminals(reconnectionOwner) {
    return this._reconnectedTerminals.get(reconnectionOwner);
  }
  get activeInstance() {
    for (const activeHostTerminal of this._hostActiveTerminals.values()) {
      if (activeHostTerminal?.hasFocus) {
        return activeHostTerminal;
      }
    }
    return this._activeInstance;
  }
  get onDidCreateInstance() {
    return this._onDidCreateInstance.event;
  }
  get onDidChangeInstanceDimensions() {
    return this._onDidChangeInstanceDimensions.event;
  }
  get onDidRegisterProcessSupport() {
    return this._onDidRegisterProcessSupport.event;
  }
  get onDidChangeConnectionState() {
    return this._onDidChangeConnectionState.event;
  }
  get onDidRequestStartExtensionTerminal() {
    return this._onDidRequestStartExtensionTerminal.event;
  }
  get onDidDisposeInstance() {
    return this._onDidDisposeInstance.event;
  }
  get onDidFocusInstance() {
    return this._onDidFocusInstance.event;
  }
  get onDidChangeActiveInstance() {
    return this._onDidChangeActiveInstance.event;
  }
  get onDidChangeInstances() {
    return this._onDidChangeInstances.event;
  }
  get onDidChangeInstanceCapability() {
    return this._onDidChangeInstanceCapability.event;
  }
  get onDidChangeActiveGroup() {
    return this._onDidChangeActiveGroup.event;
  }
  get onAnyInstanceData() {
    return this._register(this.createOnInstanceEvent((instance) => Event.map(instance.onData, (data) => ({ instance, data })))).event;
  }
  get onAnyInstanceDataInput() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.onDidInputData, () => e, e.store))).event;
  }
  get onAnyInstanceIconChange() {
    return this._register(this.createOnInstanceEvent((e) => e.onIconChanged)).event;
  }
  get onAnyInstanceMaximumDimensionsChange() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.onMaximumDimensionsChanged, () => e, e.store))).event;
  }
  get onAnyInstancePrimaryStatusChange() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.statusList.onDidChangePrimaryStatus, () => e, e.store))).event;
  }
  get onAnyInstanceProcessIdReady() {
    return this._register(this.createOnInstanceEvent((e) => e.onProcessIdReady)).event;
  }
  get onAnyInstanceSelectionChange() {
    return this._register(this.createOnInstanceEvent((e) => e.onDidChangeSelection)).event;
  }
  get onAnyInstanceTitleChange() {
    return this._register(this.createOnInstanceEvent((e) => e.onTitleChanged)).event;
  }
  get onAnyInstanceShellTypeChanged() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.onDidChangeShellType, () => e))).event;
  }
  get onAnyInstanceAddedCapabilityType() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.capabilities.onDidAddCapability, (e2) => e2.id))).event;
  }
  async showProfileQuickPick(type, cwd) {
    const quickPick = this._instantiationService.createInstance(TerminalProfileQuickpick);
    const result = await quickPick.showAndGetResult(type);
    if (!result) {
      return;
    }
    if (isString(result)) {
      return;
    }
    const keyMods = result.keyMods;
    if (type === "createInstance") {
      const activeInstance = this.getDefaultInstanceHost().activeInstance;
      const defaultLocation = this._terminalConfigurationService.defaultLocation;
      let instance;
      if (result.config && hasKey(result.config, { id: true })) {
        await this.createContributedTerminalProfile(result.config.extensionIdentifier, result.config.id, {
          icon: result.config.options?.icon,
          color: result.config.options?.color,
          location: !!(keyMods?.alt && activeInstance) ? { splitActiveTerminal: true } : defaultLocation,
          titleTemplate: result.config.titleTemplate
        });
        return;
      } else if (result.config && hasKey(result.config, { profileName: true })) {
        if (keyMods?.alt && activeInstance) {
          instance = await this.createTerminal({ location: { parentTerminal: activeInstance }, config: result.config, cwd });
        } else {
          instance = await this.createTerminal({ location: defaultLocation, config: result.config, cwd });
        }
      }
      if (instance && defaultLocation !== TerminalLocation.Editor) {
        this._terminalGroupService.showPanel(true);
        this.setActiveInstance(instance);
        return instance;
      }
    }
    return void 0;
  }
  async _initializePrimaryBackend() {
    mark("code/terminal/willGetTerminalBackend");
    this._primaryBackend = await this._terminalInstanceService.getBackend(this._environmentService.remoteAuthority);
    mark("code/terminal/didGetTerminalBackend");
    const enableTerminalReconnection = this._terminalConfigurationService.config.enablePersistentSessions;
    this._connectionState = TerminalConnectionState.Connecting;
    const isPersistentRemote = !!this._environmentService.remoteAuthority && enableTerminalReconnection;
    if (this._primaryBackend) {
      this._register(this._primaryBackend.onDidRequestDetach(async (e) => {
        const instanceToDetach = this.getInstanceFromResource(getTerminalUri(e.workspaceId, e.instanceId));
        if (instanceToDetach) {
          const persistentProcessId = instanceToDetach?.persistentProcessId;
          if (persistentProcessId && !instanceToDetach.shellLaunchConfig.isFeatureTerminal && !instanceToDetach.shellLaunchConfig.customPtyImplementation) {
            if (instanceToDetach.target === TerminalLocation.Editor) {
              this._terminalEditorService.detachInstance(instanceToDetach);
            } else {
              this._terminalGroupService.getGroupForInstance(instanceToDetach)?.removeInstance(instanceToDetach);
            }
            await instanceToDetach.detachProcessAndDispose(TerminalExitReason.User);
            await this._primaryBackend?.acceptDetachInstanceReply(e.requestId, persistentProcessId);
          } else {
            await this._primaryBackend?.acceptDetachInstanceReply(e.requestId, void 0);
          }
        }
      }));
    }
    mark("code/terminal/willReconnect");
    let reconnectedPromise;
    if (isPersistentRemote) {
      reconnectedPromise = this._reconnectToRemoteTerminals();
    } else if (enableTerminalReconnection) {
      reconnectedPromise = this._reconnectToLocalTerminals();
    } else {
      reconnectedPromise = Promise.resolve();
    }
    reconnectedPromise.then(async () => {
      this._setConnected();
      mark("code/terminal/didReconnect");
      mark("code/terminal/willReplay");
      const instances = await this._reconnectedTerminalGroups?.then((groups) => groups.map((e) => e.terminalInstances).flat()) ?? [];
      await Promise.all(instances.map((e) => new Promise((r) => Event.once(e.onProcessReplayComplete)(r))));
      mark("code/terminal/didReplay");
      mark("code/terminal/willGetPerformanceMarks");
      await Promise.all(Array.from(this._terminalInstanceService.getRegisteredBackends()).map(async (backend) => {
        this._timerService.setPerformanceMarks(backend.remoteAuthority === void 0 ? "localPtyHost" : "remotePtyHost", await backend.getPerformanceMarks());
        backend.setReady();
      }));
      mark("code/terminal/didGetPerformanceMarks");
      this._whenConnected.complete();
    });
  }
  getPrimaryBackend() {
    return this._primaryBackend;
  }
  async setNextCommandId(id, commandLine, commandId) {
    if (!this._primaryBackend || id <= 0) {
      return;
    }
    await this._primaryBackend.setNextCommandId(id, commandLine, commandId);
  }
  _forwardInstanceHostEvents(host) {
    this._register(host.onDidChangeInstances(this._onDidChangeInstances.fire, this._onDidChangeInstances));
    this._register(host.onDidDisposeInstance(this._onDidDisposeInstance.fire, this._onDidDisposeInstance));
    this._register(host.onDidChangeActiveInstance((instance) => this._evaluateActiveInstance(host, instance)));
    this._register(host.onDidFocusInstance((instance) => {
      this._onDidFocusInstance.fire(instance);
      this._evaluateActiveInstance(host, instance);
    }));
    this._register(host.onDidChangeInstanceCapability((instance) => {
      this._onDidChangeInstanceCapability.fire(instance);
    }));
    this._hostActiveTerminals.set(host, void 0);
  }
  _evaluateActiveInstance(host, instance) {
    this._hostActiveTerminals.set(host, instance);
    if (instance === void 0) {
      for (const active of this._hostActiveTerminals.values()) {
        if (active) {
          instance = active;
        }
      }
    }
    this._activeInstance = instance;
    this._onDidChangeActiveInstance.fire(instance);
  }
  setActiveInstance(value) {
    if (!value) {
      return;
    }
    if (value.shellLaunchConfig.hideFromUser) {
      this.showBackgroundTerminal(value);
    }
    if (value.target === TerminalLocation.Editor) {
      this._terminalEditorService.setActiveInstance(value);
    } else {
      this._terminalGroupService.setActiveInstance(value);
    }
  }
  async focusInstance(instance) {
    if (this._activeInstance !== instance) {
      this.setActiveInstance(instance);
    }
    if (instance.target === TerminalLocation.Editor) {
      await this._terminalEditorService.focusInstance(instance);
      return;
    }
    await this._terminalGroupService.focusInstance(instance);
  }
  async focusActiveInstance() {
    if (!this._activeInstance) {
      return;
    }
    return this.focusInstance(this._activeInstance);
  }
  async createContributedTerminalProfile(extensionIdentifier, id, options) {
    await this._extensionService.activateByEvent(`onTerminalProfile:${id}`);
    const profileProvider = this._terminalProfileService.getContributedProfileProvider(extensionIdentifier, id);
    if (!profileProvider) {
      this._notificationService.error(`No terminal profile provider registered for id "${id}"`);
      return;
    }
    try {
      await profileProvider.createContributedTerminalProfile(options);
      this._terminalGroupService.setActiveInstanceByIndex(this._terminalGroupService.instances.length - 1);
      await this._terminalGroupService.activeInstance?.focusWhenReady();
    } catch (e) {
      this._notificationService.error(e.message);
    }
  }
  async safeDisposeTerminal(instance) {
    if (instance.target !== TerminalLocation.Editor && instance.hasChildProcesses && (this._terminalConfigurationService.config.confirmOnKill === "panel" || this._terminalConfigurationService.config.confirmOnKill === "always")) {
      const veto = await this._showTerminalCloseConfirmation(true);
      if (veto) {
        return;
      }
    }
    return new Promise((r) => {
      Event.once(instance.onExit)(() => r());
      instance.dispose(TerminalExitReason.User);
    });
  }
  _setConnected() {
    this._connectionState = TerminalConnectionState.Connected;
    this._onDidChangeConnectionState.fire();
    this._logService.trace("Pty host ready");
  }
  async _reconnectToRemoteTerminals() {
    const remoteAuthority = this._environmentService.remoteAuthority;
    if (!remoteAuthority) {
      return;
    }
    const backend = await this._terminalInstanceService.getBackend(remoteAuthority);
    if (!backend) {
      return;
    }
    mark("code/terminal/willGetTerminalLayoutInfo");
    const layoutInfo = await backend.getTerminalLayoutInfo();
    mark("code/terminal/didGetTerminalLayoutInfo");
    backend.reduceConnectionGraceTime();
    mark("code/terminal/willRecreateTerminalGroups");
    await this._recreateTerminalGroups(layoutInfo);
    mark("code/terminal/didRecreateTerminalGroups");
    this._attachProcessLayoutListeners();
    this._logService.trace("Reconnected to remote terminals");
  }
  async _reconnectToLocalTerminals() {
    const localBackend = await this._terminalInstanceService.getBackend();
    if (!localBackend) {
      return;
    }
    mark("code/terminal/willGetTerminalLayoutInfo");
    const layoutInfo = await localBackend.getTerminalLayoutInfo();
    mark("code/terminal/didGetTerminalLayoutInfo");
    if (layoutInfo && (layoutInfo.tabs.length > 0 || layoutInfo?.background?.length)) {
      mark("code/terminal/willRecreateTerminalGroups");
      this._reconnectedTerminalGroups = this._recreateTerminalGroups(layoutInfo);
      const revivedInstances = await this._reviveBackgroundTerminalInstances(layoutInfo.background || []);
      this._backgroundedTerminalInstances = revivedInstances.map((instance) => ({ instance }));
      mark("code/terminal/didRecreateTerminalGroups");
    }
    this._attachProcessLayoutListeners();
    this._logService.trace("Reconnected to local terminals");
  }
  _recreateTerminalGroups(layoutInfo) {
    const groupPromises = [];
    let activeGroup;
    if (layoutInfo) {
      for (const tabLayout of layoutInfo.tabs) {
        const terminalLayouts = tabLayout.terminals.filter((t) => t.terminal && t.terminal.isOrphan);
        if (terminalLayouts.length) {
          this._restoredGroupCount += terminalLayouts.length;
          const promise = this._recreateTerminalGroup(tabLayout, terminalLayouts);
          groupPromises.push(promise);
          if (tabLayout.isActive) {
            activeGroup = promise;
          }
          const activeInstance = this.instances.find((t) => t.shellLaunchConfig.attachPersistentProcess?.id === tabLayout.activePersistentProcessId);
          if (activeInstance) {
            this.setActiveInstance(activeInstance);
          }
        }
      }
      if (layoutInfo.tabs.length) {
        activeGroup?.then((group) => this._terminalGroupService.activeGroup = group);
      }
    }
    return Promise.all(groupPromises).then((result) => result.filter((e) => !!e));
  }
  async _reviveBackgroundTerminalInstances(bgTerminals) {
    const instances = [];
    for (const bg of bgTerminals) {
      const attachPersistentProcess = bg;
      if (!attachPersistentProcess) {
        continue;
      }
      const instance = await this.createTerminal({ config: { attachPersistentProcess, hideFromUser: true, forcePersist: true }, location: TerminalLocation.Panel });
      instances.push(instance);
    }
    return instances;
  }
  async _recreateTerminalGroup(tabLayout, terminalLayouts) {
    let lastInstance;
    for (const terminalLayout of terminalLayouts) {
      const attachPersistentProcess = terminalLayout.terminal;
      if (this._lifecycleService.startupKind !== StartupKind.ReloadedWindow && attachPersistentProcess.type === "Task") {
        continue;
      }
      mark(`code/terminal/willRecreateTerminal/${attachPersistentProcess.id}-${attachPersistentProcess.pid}`);
      lastInstance = this.createTerminal({
        config: { attachPersistentProcess },
        location: lastInstance ? { parentTerminal: lastInstance } : TerminalLocation.Panel
      });
      lastInstance.then(() => mark(`code/terminal/didRecreateTerminal/${attachPersistentProcess.id}-${attachPersistentProcess.pid}`));
    }
    const group = lastInstance?.then((instance) => {
      const g = this._terminalGroupService.getGroupForInstance(instance);
      g?.resizePanes(tabLayout.terminals.map((terminal) => terminal.relativeSize));
      return g;
    });
    return group;
  }
  _attachProcessLayoutListeners() {
    this._register(this.onDidChangeActiveGroup(() => this._saveState()));
    this._register(this.onDidChangeActiveInstance(() => this._saveState()));
    this._register(this.onDidChangeInstances(() => this._saveState()));
    this._register(this.onAnyInstanceProcessIdReady(() => this._saveState()));
    this._register(this.onAnyInstanceTitleChange((instance) => this._updateTitle(instance)));
    this._register(this.onAnyInstanceIconChange((e) => this._updateIcon(e.instance, e.userInitiated)));
  }
  _handleInstanceContextKeys() {
    const terminalIsOpenContext = TerminalContextKeys.isOpen.bindTo(this._contextKeyService);
    const updateTerminalContextKeys = () => {
      terminalIsOpenContext.set(this.instances.length > 0);
      this._terminalCountContextKey.set(this.instances.length);
    };
    this._register(this.onDidChangeInstances(() => updateTerminalContextKeys()));
  }
  async getActiveOrCreateInstance(options) {
    const activeInstance = this.activeInstance;
    if (!activeInstance) {
      return this.createTerminal();
    }
    if (!options?.acceptsInput || activeInstance.xterm?.isStdinDisabled !== true) {
      return activeInstance;
    }
    const instance = await this.createTerminal();
    this.setActiveInstance(instance);
    await this.revealActiveTerminal();
    return instance;
  }
  async revealTerminal(source, preserveFocus) {
    if (source.target === TerminalLocation.Editor) {
      await this._terminalEditorService.revealActiveEditor(preserveFocus);
    } else {
      await this._terminalGroupService.showPanel();
    }
  }
  async revealActiveTerminal(preserveFocus) {
    const instance = this.activeInstance;
    if (!instance) {
      return;
    }
    await this.revealTerminal(instance, preserveFocus);
  }
  requestStartExtensionTerminal(proxy, cols, rows) {
    return new Promise((callback) => {
      this._onDidRequestStartExtensionTerminal.fire({ proxy, cols, rows, callback });
    });
  }
  _onBeforeShutdown(reason) {
    if (isWeb) {
      this._isShuttingDown = true;
      return false;
    }
    return this._onBeforeShutdownAsync(reason);
  }
  async _onBeforeShutdownAsync(reason) {
    if (this.instances.length === 0) {
      return false;
    }
    try {
      this._shutdownWindowCount = await this._nativeDelegate?.getWindowCount();
      const shouldReviveProcesses = this._shouldReviveProcesses(reason);
      if (shouldReviveProcesses) {
        await Promise.race([
          this._primaryBackend?.persistTerminalState(),
          timeout(2e3)
        ]);
      }
      const shouldPersistProcesses = this._terminalConfigurationService.config.enablePersistentSessions && reason === ShutdownReason.RELOAD;
      if (!shouldPersistProcesses) {
        const hasDirtyInstances = this._terminalConfigurationService.config.confirmOnExit === "always" && this.foregroundInstances.length > 0 || this._terminalConfigurationService.config.confirmOnExit === "hasChildProcesses" && this.foregroundInstances.some((e) => e.hasChildProcesses);
        if (hasDirtyInstances) {
          return this._onBeforeShutdownConfirmation(reason);
        }
      }
    } catch (err) {
      this._logService.warn("Exception occurred during terminal shutdown", err);
    }
    this._isShuttingDown = true;
    return false;
  }
  setNativeDelegate(nativeDelegate) {
    this._nativeDelegate = nativeDelegate;
  }
  _shouldReviveProcesses(reason) {
    if (!this._terminalConfigurationService.config.enablePersistentSessions) {
      return false;
    }
    switch (this._terminalConfigurationService.config.persistentSessionReviveProcess) {
      case "onExit": {
        if (reason === ShutdownReason.CLOSE && (this._shutdownWindowCount === 1 && !isMacintosh)) {
          return true;
        }
        return reason === ShutdownReason.LOAD || reason === ShutdownReason.QUIT;
      }
      case "onExitAndWindowClose":
        return reason !== ShutdownReason.RELOAD;
      default:
        return false;
    }
  }
  async _onBeforeShutdownConfirmation(reason) {
    const veto = await this._showTerminalCloseConfirmation();
    if (!veto) {
      this._isShuttingDown = true;
    }
    return veto;
  }
  _onWillShutdown(e) {
    const shouldPersistTerminals = this._terminalConfigurationService.config.enablePersistentSessions && e.reason === ShutdownReason.RELOAD;
    for (const instance of [...this._terminalGroupService.instances, ...this._backgroundedTerminalInstances.map((bg) => bg.instance)]) {
      if (shouldPersistTerminals && instance.shouldPersist) {
        instance.detachProcessAndDispose(TerminalExitReason.Shutdown);
      } else {
        instance.dispose(TerminalExitReason.Shutdown);
      }
    }
    if (!shouldPersistTerminals && !this._shouldReviveProcesses(e.reason)) {
      this._primaryBackend?.setTerminalLayoutInfo(void 0);
    }
  }
  _saveState() {
    if (this._isShuttingDown) {
      return;
    }
    if (!this._terminalConfigurationService.config.enablePersistentSessions) {
      return;
    }
    const tabs = this._terminalGroupService.groups.map((g) => g.getLayoutInfo(g === this._terminalGroupService.activeGroup));
    const state = { tabs, background: this._backgroundedTerminalInstances.map((bg) => bg.instance).filter((i) => i.shellLaunchConfig.forcePersist).map((i) => i.persistentProcessId).filter((e) => e !== void 0) };
    this._primaryBackend?.setTerminalLayoutInfo(state);
  }
  _updateTitle(instance) {
    if (!this._terminalConfigurationService.config.enablePersistentSessions || !instance || instance.shellLaunchConfig.customPtyImplementation || !instance.persistentProcessId || !instance.title || instance.isDisposed) {
      return;
    }
    if (instance.staticTitle) {
      this._primaryBackend?.updateTitle(instance.persistentProcessId, instance.staticTitle, TitleEventSource.Api);
    } else {
      this._primaryBackend?.updateTitle(instance.persistentProcessId, instance.title, instance.titleSource);
    }
  }
  _updateIcon(instance, userInitiated) {
    if (!this._terminalConfigurationService.config.enablePersistentSessions || !instance || instance.shellLaunchConfig.customPtyImplementation || !instance.persistentProcessId || !instance.icon || instance.isDisposed) {
      return;
    }
    this._primaryBackend?.updateIcon(instance.persistentProcessId, userInitiated, instance.icon, instance.color);
  }
  refreshActiveGroup() {
    this._onDidChangeActiveGroup.fire(this._terminalGroupService.activeGroup);
  }
  getInstanceFromId(terminalId) {
    let bgIndex = -1;
    this._backgroundedTerminalInstances.forEach((bg, i) => {
      if (bg.instance.instanceId === terminalId) {
        bgIndex = i;
      }
    });
    if (bgIndex !== -1) {
      return this._backgroundedTerminalInstances[bgIndex].instance;
    }
    try {
      return this.instances[this._getIndexFromId(terminalId)];
    } catch {
      return void 0;
    }
  }
  getInstanceFromResource(resource) {
    return getInstanceFromResource(this.instances, resource);
  }
  openResource(resource) {
    const instance = this.getInstanceFromResource(resource);
    if (instance) {
      this.setActiveInstance(instance);
      this.revealTerminal(instance);
      const commands = instance.capabilities.get(TerminalCapability.CommandDetection)?.commands;
      const params = new URLSearchParams(resource.query);
      const relevantCommand = commands?.find((c) => c.id === params.get("command"));
      if (relevantCommand) {
        instance.xterm?.markTracker.revealCommand(relevantCommand);
      }
    }
  }
  isAttachedToTerminal(remoteTerm) {
    return this.instances.some((term) => term.processId === remoteTerm.pid);
  }
  moveToEditor(source, group) {
    if (source.target === TerminalLocation.Editor) {
      return;
    }
    const sourceGroup = this._terminalGroupService.getGroupForInstance(source);
    if (!sourceGroup) {
      return;
    }
    sourceGroup.removeInstance(source);
    this._terminalEditorService.openEditor(source, group ? { viewColumn: group } : void 0);
  }
  moveIntoNewEditor(source) {
    this.moveToEditor(source, AUX_WINDOW_GROUP);
  }
  async moveToTerminalView(source, target, side) {
    if (URI.isUri(source)) {
      source = this.getInstanceFromResource(source);
    }
    if (!source) {
      return;
    }
    this._terminalEditorService.detachInstance(source);
    if (source.target !== TerminalLocation.Editor) {
      await this._terminalGroupService.showPanel(true);
      return;
    }
    source.target = TerminalLocation.Panel;
    let group;
    if (target) {
      group = this._terminalGroupService.getGroupForInstance(target);
    }
    if (!group) {
      group = this._terminalGroupService.createGroup();
    }
    group.addInstance(source);
    this.setActiveInstance(source);
    await this._terminalGroupService.showPanel(true);
    if (target && side) {
      const index = group.terminalInstances.indexOf(target) + (side === "after" ? 1 : 0);
      group.moveInstance(source, index, side);
    }
    this._onDidChangeInstances.fire();
    this._onDidChangeActiveGroup.fire(this._terminalGroupService.activeGroup);
  }
  _initInstanceListeners(instance) {
    const instanceDisposables = new DisposableStore();
    instanceDisposables.add(instance.onDimensionsChanged(() => {
      this._onDidChangeInstanceDimensions.fire(instance);
      if (this._terminalConfigurationService.config.enablePersistentSessions && this.isProcessSupportRegistered) {
        this._saveState();
      }
    }));
    instanceDisposables.add(instance.onDidFocus(this._onDidChangeActiveInstance.fire, this._onDidChangeActiveInstance));
    instanceDisposables.add(instance.onRequestAddInstanceToGroup(async (e) => await this._addInstanceToGroup(instance, e)));
    instanceDisposables.add(instance.onDidChangeShellType(() => this._extensionService.activateByEvent(`onTerminal:${instance.shellType}`)));
    instanceDisposables.add(Event.runAndSubscribe(instance.capabilities.onDidAddCapability, (() => {
      if (instance.capabilities.has(TerminalCapability.CommandDetection)) {
        this._extensionService.activateByEvent(`onTerminalShellIntegration:${instance.shellType}`);
      }
    })));
    const disposeListener = this._register(instance.onDisposed(() => {
      instanceDisposables.dispose();
      this._store.delete(disposeListener);
    }));
  }
  async _addInstanceToGroup(instance, e) {
    const terminalIdentifier = parseTerminalUri(e.uri);
    if (terminalIdentifier.instanceId === void 0) {
      return;
    }
    let sourceInstance = this.getInstanceFromResource(e.uri);
    if (!sourceInstance) {
      const attachPersistentProcess = await this._primaryBackend?.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId);
      if (attachPersistentProcess) {
        sourceInstance = await this.createTerminal({ config: { attachPersistentProcess }, resource: e.uri });
        this._terminalGroupService.moveInstance(sourceInstance, instance, e.side);
        return;
      }
    }
    sourceInstance = this._terminalGroupService.getInstanceFromResource(e.uri);
    if (sourceInstance) {
      this._terminalGroupService.moveInstance(sourceInstance, instance, e.side);
      return;
    }
    sourceInstance = this._terminalEditorService.getInstanceFromResource(e.uri);
    if (sourceInstance) {
      this.moveToTerminalView(sourceInstance, instance, e.side);
      return;
    }
    return;
  }
  registerProcessSupport(isSupported) {
    if (!isSupported) {
      return;
    }
    this._processSupportContextKey.set(isSupported);
    this._onDidRegisterProcessSupport.fire();
  }
  // TODO: Remove this, it should live in group/editor servioce
  _getIndexFromId(terminalId) {
    let terminalIndex = -1;
    this.instances.forEach((terminalInstance, i) => {
      if (terminalInstance.instanceId === terminalId) {
        terminalIndex = i;
      }
    });
    if (terminalIndex === -1) {
      throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
    }
    return terminalIndex;
  }
  async _showTerminalCloseConfirmation(singleTerminal) {
    let message;
    const foregroundInstances = this.foregroundInstances;
    if (foregroundInstances.length === 1 || singleTerminal) {
      message = nls.localize("terminalService.terminalCloseConfirmationSingular", "Do you want to terminate the active terminal session?");
    } else {
      message = nls.localize("terminalService.terminalCloseConfirmationPlural", "Do you want to terminate the {0} active terminal sessions?", foregroundInstances.length);
    }
    const { confirmed } = await this._dialogService.confirm({
      type: "warning",
      message,
      primaryButton: nls.localize({ key: "terminate", comment: ["&& denotes a mnemonic"] }, "&&Terminate")
    });
    return !confirmed;
  }
  getDefaultInstanceHost() {
    if (this._terminalConfigurationService.defaultLocation === TerminalLocation.Editor) {
      return this._terminalEditorService;
    }
    return this._terminalGroupService;
  }
  async getInstanceHost(location) {
    if (location) {
      if (location === TerminalLocation.Editor) {
        return this._terminalEditorService;
      } else if (typeof location === "object") {
        if (hasKey(location, { viewColumn: true })) {
          return this._terminalEditorService;
        } else if (hasKey(location, { parentTerminal: true })) {
          return (await location.parentTerminal).target === TerminalLocation.Editor ? this._terminalEditorService : this._terminalGroupService;
        }
      } else {
        return this._terminalGroupService;
      }
    }
    return this;
  }
  async createTerminal(options) {
    const isLocalInRemoteTerminal = this._remoteAgentService.getConnection() && URI.isUri(options?.cwd) && options?.cwd.scheme === Schemas.file;
    if (this._terminalProfileService.availableProfiles.length === 0) {
      const isPtyTerminal = options?.config && hasKey(options.config, { customPtyImplementation: true });
      if (!isPtyTerminal && !isLocalInRemoteTerminal) {
        if (this._connectionState === TerminalConnectionState.Connecting) {
          mark(`code/terminal/willGetProfiles`);
        }
        await this._terminalProfileService.profilesReady;
        if (this._connectionState === TerminalConnectionState.Connecting) {
          mark(`code/terminal/didGetProfiles`);
        }
      }
    }
    let config = options?.config;
    if (!config && isLocalInRemoteTerminal) {
      const backend = await this._terminalInstanceService.getBackend(void 0);
      const executable = await backend?.getDefaultSystemShell();
      if (executable) {
        config = { executable };
      }
    }
    if (!config) {
      config = this._terminalProfileService.getDefaultProfile();
    }
    const shellLaunchConfig = config && hasKey(config, { extensionIdentifier: true }) ? {} : this._terminalInstanceService.convertProfileToShellLaunchConfig(config || {});
    const contributedProfile = options?.skipContributedProfileCheck ? void 0 : await this._getContributedProfile(shellLaunchConfig, options);
    const splitActiveTerminal = typeof options?.location === "object" && hasKey(options.location, { splitActiveTerminal: true }) ? options.location.splitActiveTerminal : typeof options?.location === "object" ? hasKey(options.location, { parentTerminal: true }) : false;
    await this._resolveCwd(shellLaunchConfig, splitActiveTerminal, options);
    if (!shellLaunchConfig.customPtyImplementation && contributedProfile) {
      const resolvedLocation = await this.resolveLocation(options?.location);
      let location2;
      if (splitActiveTerminal) {
        location2 = resolvedLocation === TerminalLocation.Editor ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
      } else {
        location2 = typeof options?.location === "object" && hasKey(options.location, { viewColumn: true }) ? options.location : resolvedLocation;
      }
      await this.createContributedTerminalProfile(contributedProfile.extensionIdentifier, contributedProfile.id, {
        icon: contributedProfile.icon,
        color: contributedProfile.color,
        location: location2,
        cwd: shellLaunchConfig.cwd,
        titleTemplate: contributedProfile.titleTemplate
      });
      const instanceHost = resolvedLocation === TerminalLocation.Editor ? this._terminalEditorService : this._terminalGroupService;
      const instance2 = instanceHost.instances[instanceHost.instances.length - 1];
      await instance2?.focusWhenReady();
      this._terminalHasBeenCreated.set(true);
      return instance2;
    }
    if (!shellLaunchConfig.customPtyImplementation && !this.isProcessSupportRegistered) {
      const resolvedLocation = await this.resolveLocation(options?.location);
      let location2;
      if (splitActiveTerminal) {
        location2 = resolvedLocation === TerminalLocation.Editor ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
      } else {
        location2 = typeof options?.location === "object" && hasKey(options.location, { viewColumn: true }) ? options.location : resolvedLocation;
      }
      const instanceHost = resolvedLocation === TerminalLocation.Editor ? this._terminalEditorService : this._terminalGroupService;
      for (const fallbackProfile of this._terminalProfileService.contributedProfiles) {
        const instanceCount = instanceHost.instances.length;
        await this.createContributedTerminalProfile(fallbackProfile.extensionIdentifier, fallbackProfile.id, {
          icon: fallbackProfile.icon,
          color: fallbackProfile.color,
          location: location2,
          cwd: shellLaunchConfig.cwd,
          titleTemplate: fallbackProfile.titleTemplate
        });
        const instance2 = instanceHost.instances[instanceCount];
        if (!instance2) {
          continue;
        }
        await instance2.focusWhenReady();
        this._terminalHasBeenCreated.set(true);
        return instance2;
      }
      throw new Error("Could not create terminal when process support is not registered");
    }
    this._evaluateLocalCwd(shellLaunchConfig);
    const location = await this.resolveLocation(options?.location) || this._terminalConfigurationService.defaultLocation;
    if (shellLaunchConfig.hideFromUser) {
      const instance2 = this._terminalInstanceService.createInstance(shellLaunchConfig, location);
      this._backgroundedTerminalInstances.push({ instance: instance2, terminalLocationOptions: options?.location });
      this._backgroundedTerminalDisposables.set(instance2.instanceId, instance2.onDisposed((instance3) => this._onBackgroundTerminalDisposed(instance3)));
      this._onDidChangeInstances.fire();
      return instance2;
    }
    const parent = await this._getSplitParent(options?.location);
    this._terminalHasBeenCreated.set(true);
    this._extensionService.activateByEvent("onTerminal:*");
    let instance;
    if (parent) {
      instance = await this._splitTerminal(shellLaunchConfig, location, parent);
    } else {
      instance = this._createTerminal(shellLaunchConfig, location, options);
    }
    if (instance.shellType) {
      this._extensionService.activateByEvent(`onTerminal:${instance.shellType}`);
    }
    return instance;
  }
  async createAndFocusTerminal(options) {
    const instance = await this.createTerminal(options);
    this.setActiveInstance(instance);
    await instance.focusWhenReady();
    return instance;
  }
  async _getContributedProfile(shellLaunchConfig, options) {
    if (options?.config && hasKey(options.config, { extensionIdentifier: true })) {
      return options.config;
    }
    return this._terminalProfileService.getContributedDefaultProfile(shellLaunchConfig);
  }
  async createDetachedTerminal(options) {
    const ctor = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
    const capabilities = options.capabilities ?? new TerminalCapabilityStore();
    const xterm = this._instantiationService.createInstance(XtermTerminal, void 0, ctor, {
      cols: options.cols,
      rows: options.rows,
      xtermColorProvider: options.colorProvider,
      capabilities,
      disableOverviewRuler: options.disableOverviewRuler,
      detached: true
    }, void 0);
    if (options.readonly) {
      xterm.raw.attachCustomKeyEventHandler(() => false);
    }
    const instance = new DetachedTerminal(xterm, { ...options, capabilities }, this._instantiationService);
    this._detachedXterms.add(instance);
    this._ensureDetachedTerminalListeners();
    const l = xterm.onDidDispose(() => {
      this._detachedXterms.delete(instance);
      l.dispose();
    });
    return instance;
  }
  /**
   * Registers a single set of global service listeners (theme/config/log-level
   * changes) that forward updates to all detached xterm instances. This avoids
   * each detached terminal registering its own listener on global singletons.
   */
  _ensureDetachedTerminalListeners() {
    if (this._detachedListenersRegistered) {
      return;
    }
    this._detachedListenersRegistered = true;
    this._register(this._themeService.onDidColorThemeChange(() => {
      for (const instance of this._detachedXterms) {
        instance.xterm.updateTheme();
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      const shouldUpdateConfig = e.affectsConfiguration("terminal.integrated") || e.affectsConfiguration("editor.fastScrollSensitivity") || e.affectsConfiguration("editor.mouseWheelScrollSensitivity") || e.affectsConfiguration("editor.multiCursorModifier");
      const shouldUpdateTheme = e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled);
      if (shouldUpdateConfig || shouldUpdateTheme) {
        for (const instance of this._detachedXterms) {
          if (shouldUpdateConfig) {
            instance.xterm.updateConfig();
          }
          if (shouldUpdateTheme) {
            instance.xterm.updateTheme();
          }
        }
      }
    }));
    this._register(this._logService.onDidChangeLogLevel(() => {
      for (const instance of this._detachedXterms) {
        instance.xterm.updateLogLevel();
      }
    }));
  }
  async _resolveCwd(shellLaunchConfig, splitActiveTerminal, options) {
    const cwd = shellLaunchConfig.cwd;
    if (!cwd) {
      if (options?.cwd) {
        shellLaunchConfig.cwd = options.cwd;
      } else if (splitActiveTerminal && options?.location) {
        let parent = this.activeInstance;
        if (typeof options.location === "object" && hasKey(options.location, { parentTerminal: true })) {
          parent = await options.location.parentTerminal;
        }
        if (!parent) {
          throw new Error("Cannot split without an active instance");
        }
        shellLaunchConfig.cwd = await getCwdForSplit(parent, this._workspaceContextService.getWorkspace().folders, this._commandService, this._terminalConfigurationService);
      }
    }
  }
  async _splitTerminal(shellLaunchConfig, location, parent) {
    let instance;
    if (typeof shellLaunchConfig.cwd !== "object" && typeof parent.shellLaunchConfig.cwd === "object") {
      let path = shellLaunchConfig.cwd || parent.shellLaunchConfig.cwd.path;
      if (parent.shellLaunchConfig.cwd.authority && path && path[0] !== "/") {
        path = "/" + path;
      }
      shellLaunchConfig.cwd = URI.from({
        scheme: parent.shellLaunchConfig.cwd.scheme,
        authority: parent.shellLaunchConfig.cwd.authority,
        path
      });
    }
    if (location === TerminalLocation.Editor || parent.target === TerminalLocation.Editor) {
      instance = await this._terminalEditorService.splitInstance(parent, shellLaunchConfig);
    } else {
      const group = this._terminalGroupService.getGroupForInstance(parent);
      if (!group) {
        throw new Error(`Cannot split a terminal without a group (instanceId: ${parent.instanceId}, title: ${parent.title})`);
      }
      shellLaunchConfig.parentTerminalId = parent.instanceId;
      instance = group.split(shellLaunchConfig);
    }
    return instance;
  }
  _createTerminal(shellLaunchConfig, location, options) {
    let instance;
    if (location === TerminalLocation.Editor) {
      instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Editor);
      if (!shellLaunchConfig.hideFromUser) {
        const editorOptions = this._getEditorOptions(options?.location);
        this._terminalEditorService.openEditor(instance, editorOptions);
      }
    } else {
      const group = this._terminalGroupService.createGroup(shellLaunchConfig);
      instance = group.terminalInstances[0];
    }
    return instance;
  }
  async resolveLocation(location) {
    if (location && typeof location === "object") {
      if (hasKey(location, { parentTerminal: true })) {
        const parentTerminal = await location.parentTerminal;
        return !parentTerminal.target ? TerminalLocation.Panel : parentTerminal.target;
      } else if (hasKey(location, { viewColumn: true })) {
        return TerminalLocation.Editor;
      } else if (hasKey(location, { splitActiveTerminal: true })) {
        return !this._activeInstance?.target ? TerminalLocation.Panel : this._activeInstance?.target;
      }
    }
    return location;
  }
  async _getSplitParent(location) {
    if (location && typeof location === "object" && hasKey(location, { parentTerminal: true })) {
      return location.parentTerminal;
    } else if (location && typeof location === "object" && hasKey(location, { splitActiveTerminal: true })) {
      return this.activeInstance;
    }
    return void 0;
  }
  _getEditorOptions(location) {
    if (location && typeof location === "object" && hasKey(location, { viewColumn: true })) {
      if (location.viewColumn === ACTIVE_GROUP && isAuxiliaryWindow(getActiveWindow())) {
        location.viewColumn = this._editorGroupsService.activeGroup.id;
        return location;
      }
      location.viewColumn = columnToEditorGroup(this._editorGroupsService, this._configurationService, location.viewColumn);
      return location;
    }
    return void 0;
  }
  _evaluateLocalCwd(shellLaunchConfig) {
    if (this._environmentService.isSessionsWindow) {
      return;
    }
    if (!isString(shellLaunchConfig.cwd) && shellLaunchConfig.cwd?.scheme === Schemas.file) {
      if (VirtualWorkspaceContext.getValue(this._contextKeyService)) {
        shellLaunchConfig.initialText = formatMessageForTerminal(nls.localize("localTerminalVirtualWorkspace", "This shell is open to a {0}local{1} folder, NOT to the virtual folder", "\x1B[3m", "\x1B[23m"), { excludeLeadingNewLine: true, loudFormatting: true });
        shellLaunchConfig.type = "Local";
      } else if (this._remoteAgentService.getConnection()) {
        shellLaunchConfig.initialText = formatMessageForTerminal(nls.localize("localTerminalRemote", "This shell is running on your {0}local{1} machine, NOT on the connected remote machine", "\x1B[3m", "\x1B[23m"), { excludeLeadingNewLine: true, loudFormatting: true });
        shellLaunchConfig.type = "Local";
      }
    }
  }
  moveToBackground(instance) {
    if (this._backgroundedTerminalInstances.some((bg) => bg.instance === instance)) {
      return;
    }
    if (instance.target === TerminalLocation.Editor) {
      this._terminalEditorService.detachInstance(instance);
    } else {
      const group = this._terminalGroupService.getGroupForInstance(instance);
      if (!group) {
        return;
      }
      group.removeInstance(instance);
    }
    instance.detachFromElement();
    this._backgroundedTerminalInstances.push({ instance, terminalLocationOptions: instance.target === TerminalLocation.Editor ? { viewColumn: ACTIVE_GROUP } : void 0 });
    this._backgroundedTerminalDisposables.set(instance.instanceId, instance.onDisposed((instance2) => this._onBackgroundTerminalDisposed(instance2)));
    this._onDidChangeInstances.fire();
  }
  _onBackgroundTerminalDisposed(instance) {
    const index = this._backgroundedTerminalInstances.findIndex((backgrounded) => backgrounded.instance === instance);
    if (index !== -1) {
      this._backgroundedTerminalInstances.splice(index, 1);
    }
    this._backgroundedTerminalDisposables.deleteAndDispose(instance.instanceId);
    this._onDidDisposeInstance.fire(instance);
  }
  async showBackgroundTerminal(instance, suppressSetActive) {
    const index = this._backgroundedTerminalInstances.findIndex((bg) => bg.instance === instance);
    if (index === -1) {
      return;
    }
    const backgroundTerminal = this._backgroundedTerminalInstances[index];
    this._backgroundedTerminalInstances.splice(index, 1);
    this._backgroundedTerminalDisposables.deleteAndDispose(instance.instanceId);
    if (instance.target === TerminalLocation.Panel) {
      this._terminalGroupService.createGroup(instance);
      if (this.instances.length === 1 && !suppressSetActive) {
        this._terminalGroupService.setActiveInstanceByIndex(0);
      }
    } else {
      const editorOptions = backgroundTerminal.terminalLocationOptions ? this._getEditorOptions(backgroundTerminal.terminalLocationOptions) : this._getEditorOptions(instance.target);
      this._terminalEditorService.openEditor(instance, editorOptions);
    }
    this._onDidChangeInstances.fire();
  }
  async setContainers(panelContainer, terminalContainer) {
    this._terminalConfigurationService.setPanelContainer(panelContainer);
    this._terminalGroupService.setContainer(terminalContainer);
  }
  createOnInstanceEvent(getEvent) {
    return new DynamicListEventMultiplexer(this.instances, this.onDidCreateInstance, this.onDidDisposeInstance, getEvent);
  }
  createOnInstanceCapabilityEvent(capabilityId, getEvent) {
    return createInstanceCapabilityEventMultiplexer(this.instances, this.onDidCreateInstance, this.onDidDisposeInstance, capabilityId, getEvent);
  }
};
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceData", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceDataInput", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceIconChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceMaximumDimensionsChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstancePrimaryStatusChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceProcessIdReady", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceSelectionChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceTitleChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceShellTypeChanged", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceAddedCapabilityType", 1);
__decorateClass([
  debounce(500)
], TerminalService.prototype, "_saveState", 1);
__decorateClass([
  debounce(500)
], TerminalService.prototype, "_updateTitle", 1);
__decorateClass([
  debounce(500)
], TerminalService.prototype, "_updateIcon", 1);
TerminalService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, ITerminalLogService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IRemoteAgentService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IWorkbenchEnvironmentService),
  __decorateParam(8, ITerminalConfigurationService),
  __decorateParam(9, ITerminalEditorService),
  __decorateParam(10, ITerminalGroupService),
  __decorateParam(11, ITerminalInstanceService),
  __decorateParam(12, IEditorGroupsService),
  __decorateParam(13, ITerminalProfileService),
  __decorateParam(14, IExtensionService),
  __decorateParam(15, INotificationService),
  __decorateParam(16, IWorkspaceContextService),
  __decorateParam(17, ICommandService),
  __decorateParam(18, IKeybindingService),
  __decorateParam(19, ITimerService),
  __decorateParam(20, IThemeService)
], TerminalService);
let TerminalEditorStyle = class extends Themable {
  constructor(container, _terminalService, _themeService, _terminalProfileService, _editorService) {
    super(_themeService);
    this._terminalService = _terminalService;
    this._themeService = _themeService;
    this._terminalProfileService = _terminalProfileService;
    this._editorService = _editorService;
    this._registerListeners();
    this._styleElement = domStylesheets.createStyleSheet(container);
    this._register(toDisposable(() => this._styleElement.remove()));
    this.updateStyles();
  }
  _registerListeners() {
    this._register(this._terminalService.onAnyInstanceIconChange(() => this.updateStyles()));
    this._register(this._terminalService.onDidCreateInstance(() => this.updateStyles()));
    this._register(this._editorService.onDidActiveEditorChange(() => {
      if (this._editorService.activeEditor instanceof TerminalEditorInput) {
        this.updateStyles();
      }
    }));
    this._register(this._editorService.onDidCloseEditor(() => {
      if (this._editorService.activeEditor instanceof TerminalEditorInput) {
        this.updateStyles();
      }
    }));
    this._register(this._terminalProfileService.onDidChangeAvailableProfiles(() => this.updateStyles()));
  }
  updateStyles() {
    super.updateStyles();
    const colorTheme = this._themeService.getColorTheme();
    let css = "";
    const productIconTheme = this._themeService.getProductIconTheme();
    for (const instance of this._terminalService.instances) {
      const icon = instance.icon;
      if (!icon) {
        continue;
      }
      let uri = void 0;
      if (icon instanceof URI) {
        uri = icon;
      } else if (icon instanceof Object && hasKey(icon, { light: true, dark: true })) {
        uri = isDark(colorTheme.type) ? icon.dark : icon.light;
      }
      const iconClasses = getUriClasses(instance, colorTheme.type);
      if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
        css += cssValue.inline`.monaco-workbench .terminal-tab.${cssValue.className(iconClasses[0])}::before
					{content: ''; background-image: ${cssValue.asCSSUrl(uri)};}`;
      }
      if (ThemeIcon.isThemeIcon(icon)) {
        const iconRegistry = getIconRegistry();
        const iconContribution = iconRegistry.getIcon(icon.id);
        if (iconContribution) {
          const def = productIconTheme.getIcon(iconContribution);
          if (def) {
            css += cssValue.inline`.monaco-workbench .terminal-tab.codicon-${cssValue.className(icon.id)}::before
							{content: ${cssValue.stringValue(def.fontCharacter)} !important; font-family: ${cssValue.stringValue(def.font?.id ?? "codicon")} !important;}`;
          }
        }
      }
    }
    const iconForegroundColor = colorTheme.getColor(iconForeground);
    if (iconForegroundColor) {
      css += cssValue.inline`.monaco-workbench .show-file-icons .file-icon.terminal-tab::before { color: ${iconForegroundColor}; }`;
    }
    css += getColorStyleContent(colorTheme, true);
    this._styleElement.textContent = css;
  }
};
TerminalEditorStyle = __decorateClass([
  __decorateParam(1, ITerminalService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, ITerminalProfileService),
  __decorateParam(4, IEditorService)
], TerminalEditorStyle);
export {
  TerminalService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb21TdHlsZXNoZWV0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0ICogYXMgY3NzVmFsdWUgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCwgdHlwZSBNYXliZVByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSwgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRHluYW1pY0xpc3RFdmVudE11bHRpcGxleGVyLCBFbWl0dGVyLCBFdmVudCwgSUR5bmFtaWNMaXN0RXZlbnRNdWx0aXBsZXhlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJS2V5TW9kcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZU9wdGlvbnMsIElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUsIElQdHlIb3N0QXR0YWNoVGFyZ2V0LCBJUmF3VGVybWluYWxJbnN0YW5jZUxheW91dEluZm8sIElSYXdUZXJtaW5hbFRhYkxheW91dEluZm8sIElTaGVsbExhdW5jaENvbmZpZywgSVRlcm1pbmFsQmFja2VuZCwgSVRlcm1pbmFsTGF1bmNoRXJyb3IsIElUZXJtaW5hbExvZ1NlcnZpY2UsIElUZXJtaW5hbHNMYXlvdXRJbmZvLCBJVGVybWluYWxzTGF5b3V0SW5mb0J5SWQsIFRlcm1pbmFsRXhpdFJlYXNvbiwgVGVybWluYWxMb2NhdGlvbiwgVGVybWluYWxTZXR0aW5nSWQsIFRpdGxlRXZlbnRTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsU3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBpY29uRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldEljb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgaXNEYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIFRoZW1hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVmlydHVhbFdvcmtzcGFjZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucywgSURldGFjaGVkVGVybWluYWxJbnN0YW5jZSwgSURldGFjaGVkWFRlcm1PcHRpb25zLCBJUmVxdWVzdEFkZEluc3RhbmNlVG9Hcm91cEV2ZW50LCBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgSVRlcm1pbmFsRWRpdG9yU2VydmljZSwgSVRlcm1pbmFsR3JvdXAsIElUZXJtaW5hbEdyb3VwU2VydmljZSwgSVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbEluc3RhbmNlSG9zdCwgSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLCBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMsIElUZXJtaW5hbFNlcnZpY2UsIElUZXJtaW5hbFNlcnZpY2VOYXRpdmVEZWxlZ2F0ZSwgVGVybWluYWxDb25uZWN0aW9uU3RhdGUsIFRlcm1pbmFsRWRpdG9yTG9jYXRpb24gfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGdldEN3ZEZvclNwbGl0IH0gZnJvbSAnLi90ZXJtaW5hbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxFZGl0b3JJbnB1dCB9IGZyb20gJy4vdGVybWluYWxFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBnZXRDb2xvclN0eWxlQ29udGVudCwgZ2V0VXJpQ2xhc3NlcyB9IGZyb20gJy4vdGVybWluYWxJY29uLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsUHJvZmlsZVF1aWNrcGljayB9IGZyb20gJy4vdGVybWluYWxQcm9maWxlUXVpY2twaWNrLmpzJztcbmltcG9ydCB7IGdldEluc3RhbmNlRnJvbVJlc291cmNlLCBnZXRUZXJtaW5hbFVyaSwgcGFyc2VUZXJtaW5hbFVyaSB9IGZyb20gJy4vdGVybWluYWxVcmkuanMnO1xuaW1wb3J0IHsgSVJlbW90ZVRlcm1pbmFsQXR0YWNoVGFyZ2V0LCBJU3RhcnRFeHRlbnNpb25UZXJtaW5hbFJlcXVlc3QsIElUZXJtaW5hbFByb2Nlc3NFeHRIb3N0UHJveHksIElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IGNvbHVtblRvRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3VwQ29sdW1uLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgQUNUSVZFX0dST1VQX1RZUEUsIEFVWF9XSU5ET1dfR1JPVVAsIEFVWF9XSU5ET1dfR1JPVVBfVFlQRSwgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAsIFNJREVfR1JPVVBfVFlQRSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIFNodXRkb3duUmVhc29uLCBTdGFydHVwS2luZCwgV2lsbFNodXRkb3duRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgWHRlcm1UZXJtaW5hbCB9IGZyb20gJy4veHRlcm0veHRlcm1UZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi90ZXJtaW5hbEluc3RhbmNlLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLmpzJztcbmltcG9ydCB7IElUaW1lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aW1lci9icm93c2VyL3RpbWVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgRGV0YWNoZWRUZXJtaW5hbCB9IGZyb20gJy4vZGV0YWNoZWRUZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDYXBhYmlsaXR5SW1wbE1hcCwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5zdGFuY2VDYXBhYmlsaXR5RXZlbnRNdWx0aXBsZXhlciB9IGZyb20gJy4vdGVybWluYWxFdmVudHMuanMnO1xuaW1wb3J0IHsgaXNBdXhpbGlhcnlXaW5kb3csIG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEdyb3VwSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5pbnRlcmZhY2UgSUJhY2tncm91bmRUZXJtaW5hbCB7XG5cdGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZTtcblx0dGVybWluYWxMb2NhdGlvbk9wdGlvbnM/OiBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnM7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlcm1pbmFsU2VydmljZSB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2hvc3RBY3RpdmVUZXJtaW5hbHM6IE1hcDxJVGVybWluYWxJbnN0YW5jZUhvc3QsIElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPiA9IG5ldyBNYXAoKTtcblxuXHRwcml2YXRlIF9kZXRhY2hlZFh0ZXJtcyA9IG5ldyBTZXQ8SURldGFjaGVkVGVybWluYWxJbnN0YW5jZT4oKTtcblx0cHJpdmF0ZSBfZGV0YWNoZWRMaXN0ZW5lcnNSZWdpc3RlcmVkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2hlbGxUeXBlQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nPjtcblxuXHRwcml2YXRlIF9pc1NodXR0aW5nRG93bjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlczogSUJhY2tncm91bmRUZXJtaW5hbFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2JhY2tncm91bmRlZFRlcm1pbmFsRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXI+KCkpO1xuXHRwcml2YXRlIF9wcm9jZXNzU3VwcG9ydENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgX3ByaW1hcnlCYWNrZW5kPzogSVRlcm1pbmFsQmFja2VuZDtcblx0cHJpdmF0ZSBfdGVybWluYWxIYXNCZWVuQ3JlYXRlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX3Rlcm1pbmFsQ291bnRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxudW1iZXI+O1xuXHRwcml2YXRlIF9uYXRpdmVEZWxlZ2F0ZT86IElUZXJtaW5hbFNlcnZpY2VOYXRpdmVEZWxlZ2F0ZTtcblx0cHJpdmF0ZSBfc2h1dGRvd25XaW5kb3dDb3VudD86IG51bWJlcjtcblxuXHRnZXQgaXNQcm9jZXNzU3VwcG9ydFJlZ2lzdGVyZWQoKTogYm9vbGVhbiB7IHJldHVybiAhIXRoaXMuX3Byb2Nlc3NTdXBwb3J0Q29udGV4dEtleS5nZXQoKTsgfVxuXG5cdHByaXZhdGUgX2Nvbm5lY3Rpb25TdGF0ZTogVGVybWluYWxDb25uZWN0aW9uU3RhdGUgPSBUZXJtaW5hbENvbm5lY3Rpb25TdGF0ZS5Db25uZWN0aW5nO1xuXHRnZXQgY29ubmVjdGlvblN0YXRlKCk6IFRlcm1pbmFsQ29ubmVjdGlvblN0YXRlIHsgcmV0dXJuIHRoaXMuX2Nvbm5lY3Rpb25TdGF0ZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3doZW5Db25uZWN0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdGdldCB3aGVuQ29ubmVjdGVkKCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy5fd2hlbkNvbm5lY3RlZC5wOyB9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZWRHcm91cENvdW50OiBudW1iZXIgPSAwO1xuXHRnZXQgcmVzdG9yZWRHcm91cENvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9yZXN0b3JlZEdyb3VwQ291bnQ7IH1cblxuXHRnZXQgaW5zdGFuY2VzKCk6IElUZXJtaW5hbEluc3RhbmNlW10ge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5pbnN0YW5jZXMuY29uY2F0KHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5pbnN0YW5jZXMpLmNvbmNhdCh0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlcy5tYXAoYmcgPT4gYmcuaW5zdGFuY2UpKTtcblx0fVxuXHQvKiogR2V0cyBhbGwgbm9uLWJhY2tncm91bmQgdGVybWluYWxzLiAqL1xuXHRnZXQgZm9yZWdyb3VuZEluc3RhbmNlcygpOiBJVGVybWluYWxJbnN0YW5jZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLmNvbmNhdCh0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2UuaW5zdGFuY2VzKTtcblx0fVxuXHRnZXQgZGV0YWNoZWRJbnN0YW5jZXMoKTogSXRlcmFibGU8SURldGFjaGVkVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdHJldHVybiB0aGlzLl9kZXRhY2hlZFh0ZXJtcztcblx0fVxuXG5cdHByaXZhdGUgX3JlY29ubmVjdGVkVGVybWluYWxHcm91cHM6IFByb21pc2U8SVRlcm1pbmFsR3JvdXBbXT4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcmVjb25uZWN0ZWRUZXJtaW5hbHM6IE1hcDxzdHJpbmcsIElUZXJtaW5hbEluc3RhbmNlW10+ID0gbmV3IE1hcCgpO1xuXHRnZXRSZWNvbm5lY3RlZFRlcm1pbmFscyhyZWNvbm5lY3Rpb25Pd25lcjogc3RyaW5nKTogSVRlcm1pbmFsSW5zdGFuY2VbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlY29ubmVjdGVkVGVybWluYWxzLmdldChyZWNvbm5lY3Rpb25Pd25lcik7XG5cdH1cblxuXHRwcml2YXRlIF9hY3RpdmVJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ7XG5cdGdldCBhY3RpdmVJbnN0YW5jZSgpOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gQ2hlY2sgaWYgZWl0aGVyIGFuIGVkaXRvciBvciBwYW5lbCB0ZXJtaW5hbCBoYXMgZm9jdXMgYW5kIHJldHVybiB0aGF0LCByZWdhcmRsZXNzIG9mIHRoZVxuXHRcdC8vIHZhbHVlIG9mIF9hY3RpdmVJbnN0YW5jZS4gVGhpcyBhdm9pZHMgdGVybWluYWxzIGNyZWF0ZWQgaW4gdGhlIHBhbmVsIGZvciBleGFtcGxlIHN0ZWFsaW5nXG5cdFx0Ly8gdGhlIGFjdGl2ZSBzdGF0dXMgZXZlbiB3aGVuIGl0J3Mgbm90IGZvY3VzZWQuXG5cdFx0Zm9yIChjb25zdCBhY3RpdmVIb3N0VGVybWluYWwgb2YgdGhpcy5faG9zdEFjdGl2ZVRlcm1pbmFscy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGFjdGl2ZUhvc3RUZXJtaW5hbD8uaGFzRm9jdXMpIHtcblx0XHRcdFx0cmV0dXJuIGFjdGl2ZUhvc3RUZXJtaW5hbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gRmFsbGJhY2sgdG8gdGhlIGxhc3QgcmVjb3JkZWQgYWN0aXZlIHRlcm1pbmFsIGlmIG5laXRoZXIgaGF2ZSBmb2N1c1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVJbnN0YW5jZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ3JlYXRlSW5zdGFuY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdGdldCBvbkRpZENyZWF0ZUluc3RhbmNlKCk6IEV2ZW50PElUZXJtaW5hbEluc3RhbmNlPiB7IHJldHVybiB0aGlzLl9vbkRpZENyZWF0ZUluc3RhbmNlLmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5zdGFuY2VEaW1lbnNpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VJbnN0YW5jZURpbWVuc2lvbnMoKTogRXZlbnQ8SVRlcm1pbmFsSW5zdGFuY2U+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VEaW1lbnNpb25zLmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVnaXN0ZXJQcm9jZXNzU3VwcG9ydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRSZWdpc3RlclByb2Nlc3NTdXBwb3J0KCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkUmVnaXN0ZXJQcm9jZXNzU3VwcG9ydC5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0U3RhcnRFeHRlbnNpb25UZXJtaW5hbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdGFydEV4dGVuc2lvblRlcm1pbmFsUmVxdWVzdD4oKSk7XG5cdGdldCBvbkRpZFJlcXVlc3RTdGFydEV4dGVuc2lvblRlcm1pbmFsKCk6IEV2ZW50PElTdGFydEV4dGVuc2lvblRlcm1pbmFsUmVxdWVzdD4geyByZXR1cm4gdGhpcy5fb25EaWRSZXF1ZXN0U3RhcnRFeHRlbnNpb25UZXJtaW5hbC5ldmVudDsgfVxuXG5cdC8vIElUZXJtaW5hbEluc3RhbmNlSG9zdCBldmVudHNcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlSW5zdGFuY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdGdldCBvbkRpZERpc3Bvc2VJbnN0YW5jZSgpOiBFdmVudDxJVGVybWluYWxJbnN0YW5jZT4geyByZXR1cm4gdGhpcy5fb25EaWREaXNwb3NlSW5zdGFuY2UuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1c0luc3RhbmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRnZXQgb25EaWRGb2N1c0luc3RhbmNlKCk6IEV2ZW50PElUZXJtaW5hbEluc3RhbmNlPiB7IHJldHVybiB0aGlzLl9vbkRpZEZvY3VzSW5zdGFuY2UuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UoKTogRXZlbnQ8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJbnN0YW5jZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlSW5zdGFuY2VzKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VzLmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VJbnN0YW5jZUNhcGFiaWxpdHkoKTogRXZlbnQ8SVRlcm1pbmFsSW5zdGFuY2U+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5LmV2ZW50OyB9XG5cblx0Ly8gVGVybWluYWwgdmlldyBldmVudHNcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVHcm91cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAoKTogRXZlbnQ8SVRlcm1pbmFsR3JvdXAgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAuZXZlbnQ7IH1cblxuXHQvLyBMYXppbHkgaW5pdGlhbGl6ZWQgZXZlbnRzIHRoYXQgZmlyZSB3aGVuIHRoZSBzcGVjaWZpZWQgZXZlbnQgZmlyZXMgb24gX2FueV8gdGVybWluYWxcblx0Ly8gVE9ETzogQmF0Y2ggZXZlbnRzXG5cdEBtZW1vaXplIGdldCBvbkFueUluc3RhbmNlRGF0YSgpIHsgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlT25JbnN0YW5jZUV2ZW50KGluc3RhbmNlID0+IEV2ZW50Lm1hcChpbnN0YW5jZS5vbkRhdGEsIGRhdGEgPT4gKHsgaW5zdGFuY2UsIGRhdGEgfSkpKSkuZXZlbnQ7IH1cblx0QG1lbW9pemUgZ2V0IG9uQW55SW5zdGFuY2VEYXRhSW5wdXQoKSB7IHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU9uSW5zdGFuY2VFdmVudChlID0+IEV2ZW50Lm1hcChlLm9uRGlkSW5wdXREYXRhLCAoKSA9PiBlLCBlLnN0b3JlKSkpLmV2ZW50OyB9XG5cdEBtZW1vaXplIGdldCBvbkFueUluc3RhbmNlSWNvbkNoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlT25JbnN0YW5jZUV2ZW50KGUgPT4gZS5vbkljb25DaGFuZ2VkKSkuZXZlbnQ7IH1cblx0QG1lbW9pemUgZ2V0IG9uQW55SW5zdGFuY2VNYXhpbXVtRGltZW5zaW9uc0NoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlT25JbnN0YW5jZUV2ZW50KGUgPT4gRXZlbnQubWFwKGUub25NYXhpbXVtRGltZW5zaW9uc0NoYW5nZWQsICgpID0+IGUsIGUuc3RvcmUpKSkuZXZlbnQ7IH1cblx0QG1lbW9pemUgZ2V0IG9uQW55SW5zdGFuY2VQcmltYXJ5U3RhdHVzQ2hhbmdlKCkgeyByZXR1cm4gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVPbkluc3RhbmNlRXZlbnQoZSA9PiBFdmVudC5tYXAoZS5zdGF0dXNMaXN0Lm9uRGlkQ2hhbmdlUHJpbWFyeVN0YXR1cywgKCkgPT4gZSwgZS5zdG9yZSkpKS5ldmVudDsgfVxuXHRAbWVtb2l6ZSBnZXQgb25BbnlJbnN0YW5jZVByb2Nlc3NJZFJlYWR5KCkgeyByZXR1cm4gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVPbkluc3RhbmNlRXZlbnQoZSA9PiBlLm9uUHJvY2Vzc0lkUmVhZHkpKS5ldmVudDsgfVxuXHRAbWVtb2l6ZSBnZXQgb25BbnlJbnN0YW5jZVNlbGVjdGlvbkNoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlT25JbnN0YW5jZUV2ZW50KGUgPT4gZS5vbkRpZENoYW5nZVNlbGVjdGlvbikpLmV2ZW50OyB9XG5cdEBtZW1vaXplIGdldCBvbkFueUluc3RhbmNlVGl0bGVDaGFuZ2UoKSB7IHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU9uSW5zdGFuY2VFdmVudChlID0+IGUub25UaXRsZUNoYW5nZWQpKS5ldmVudDsgfVxuXHRAbWVtb2l6ZSBnZXQgb25BbnlJbnN0YW5jZVNoZWxsVHlwZUNoYW5nZWQoKSB7IHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU9uSW5zdGFuY2VFdmVudChlID0+IEV2ZW50Lm1hcChlLm9uRGlkQ2hhbmdlU2hlbGxUeXBlLCAoKSA9PiBlKSkpLmV2ZW50OyB9XG5cdEBtZW1vaXplIGdldCBvbkFueUluc3RhbmNlQWRkZWRDYXBhYmlsaXR5VHlwZSgpIHsgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlT25JbnN0YW5jZUV2ZW50KGUgPT4gRXZlbnQubWFwKGUuY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ2FwYWJpbGl0eSwgZSA9PiBlLmlkKSkpLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSBfcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsRWRpdG9yU2VydmljZTogSVRlcm1pbmFsRWRpdG9yU2VydmljZSxcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEluc3RhbmNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEluc3RhbmNlU2VydmljZTogSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRpbWVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aW1lclNlcnZpY2U6IElUaW1lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyB0aGUgYmVsb3cgYXZvaWRzIGhhdmluZyB0byBwb2xsIHJvdXRpbmVseS5cblx0XHQvLyB3ZSB1cGRhdGUgZGV0ZWN0ZWQgcHJvZmlsZXMgd2hlbiBhbiBpbnN0YW5jZSBpcyBjcmVhdGVkIHNvIHRoYXQsXG5cdFx0Ly8gZm9yIGV4YW1wbGUsIHdlIGRldGVjdCBpZiB5b3UndmUgaW5zdGFsbGVkIGEgcHdzaFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDcmVhdGVJbnN0YW5jZSgoKSA9PiB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLnJlZnJlc2hBdmFpbGFibGVQcm9maWxlcygpKSk7XG5cdFx0dGhpcy5fZm9yd2FyZEluc3RhbmNlSG9zdEV2ZW50cyh0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZSk7XG5cdFx0dGhpcy5fZm9yd2FyZEluc3RhbmNlSG9zdEV2ZW50cyh0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAodGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5maXJlLCB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUdyb3VwKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxJbnN0YW5jZVNlcnZpY2Uub25EaWRDcmVhdGVJbnN0YW5jZShpbnN0YW5jZSA9PiB7XG5cdFx0XHR0aGlzLl9pbml0SW5zdGFuY2VMaXN0ZW5lcnMoaW5zdGFuY2UpO1xuXHRcdFx0dGhpcy5fb25EaWRDcmVhdGVJbnN0YW5jZS5maXJlKGluc3RhbmNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIaWRlIHRoZSBwYW5lbCBpZiB0aGVyZSBhcmUgbm8gbW9yZSBpbnN0YW5jZXMsIHByb3ZpZGVkIHRoYXQgVlMgQ29kZSBpcyBub3Qgc2h1dHRpbmdcblx0XHQvLyBkb3duLiBXaGVuIHNodXR0aW5nIGRvd24gdGhlIHBhbmVsIGlzIGxvY2tlZCBpbiBwbGFjZSBzbyB0aGF0IGl0IGlzIHJlc3RvcmVkIHVwb24gbmV4dFxuXHRcdC8vIGxhdW5jaC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlKGluc3RhbmNlID0+IHtcblx0XHRcdGlmICghaW5zdGFuY2UgJiYgIXRoaXMuX2lzU2h1dHRpbmdEb3duICYmIHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmhpZGVPbkxhc3RDbG9zZWQpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaGlkZVBhbmVsKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5zdGFuY2U/LnNoZWxsVHlwZSkge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNoZWxsVHlwZUNvbnRleHRLZXkuc2V0KGluc3RhbmNlLnNoZWxsVHlwZS50b1N0cmluZygpKTtcblx0XHRcdH0gZWxzZSBpZiAoIWluc3RhbmNlIHx8ICEoaW5zdGFuY2Uuc2hlbGxUeXBlKSkge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNoZWxsVHlwZUNvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9oYW5kbGVJbnN0YW5jZUNvbnRleHRLZXlzKCk7XG5cdFx0dGhpcy5fdGVybWluYWxTaGVsbFR5cGVDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy5zaGVsbFR5cGUuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9wcm9jZXNzU3VwcG9ydENvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9wcm9jZXNzU3VwcG9ydENvbnRleHRLZXkuc2V0KCFpc1dlYiB8fCB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpICE9PSBudWxsKTtcblx0XHR0aGlzLl90ZXJtaW5hbEhhc0JlZW5DcmVhdGVkID0gVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fdGVybWluYWxDb3VudENvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLmNvdW50LmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihfbGlmZWN5Y2xlU2VydmljZS5vbkJlZm9yZVNodXRkb3duKGFzeW5jIGUgPT4gZS52ZXRvKHRoaXMuX29uQmVmb3JlU2h1dGRvd24oZS5yZWFzb24pLCAndmV0by50ZXJtaW5hbCcpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oZSA9PiB0aGlzLl9vbldpbGxTaHV0ZG93bihlKSkpO1xuXG5cdFx0dGhpcy5faW5pdGlhbGl6ZVByaW1hcnlCYWNrZW5kKCk7XG5cblx0XHQvLyBDcmVhdGUgYXN5bmMgYXMgdGhlIGNsYXNzIGRlcGVuZHMgb24gYHRoaXNgXG5cdFx0dGltZW91dCgwKS50aGVuKCgpID0+IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsRWRpdG9yU3R5bGUsIG1haW5XaW5kb3cuZG9jdW1lbnQuaGVhZCkpKTtcblx0fVxuXG5cdGFzeW5jIHNob3dQcm9maWxlUXVpY2tQaWNrKHR5cGU6ICdzZXREZWZhdWx0JyB8ICdjcmVhdGVJbnN0YW5jZScsIGN3ZD86IHN0cmluZyB8IFVSSSk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBxdWlja1BpY2sgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFByb2ZpbGVRdWlja3BpY2spO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1aWNrUGljay5zaG93QW5kR2V0UmVzdWx0KHR5cGUpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpc1N0cmluZyhyZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGtleU1vZHM6IElLZXlNb2RzIHwgdW5kZWZpbmVkID0gcmVzdWx0LmtleU1vZHM7XG5cdFx0aWYgKHR5cGUgPT09ICdjcmVhdGVJbnN0YW5jZScpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gdGhpcy5nZXREZWZhdWx0SW5zdGFuY2VIb3N0KCkuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRjb25zdCBkZWZhdWx0TG9jYXRpb24gPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmRlZmF1bHRMb2NhdGlvbjtcblx0XHRcdGxldCBpbnN0YW5jZTtcblxuXHRcdFx0aWYgKHJlc3VsdC5jb25maWcgJiYgaGFzS2V5KHJlc3VsdC5jb25maWcsIHsgaWQ6IHRydWUgfSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZShyZXN1bHQuY29uZmlnLmV4dGVuc2lvbklkZW50aWZpZXIsIHJlc3VsdC5jb25maWcuaWQsIHtcblx0XHRcdFx0XHRpY29uOiByZXN1bHQuY29uZmlnLm9wdGlvbnM/Lmljb24sXG5cdFx0XHRcdFx0Y29sb3I6IHJlc3VsdC5jb25maWcub3B0aW9ucz8uY29sb3IsXG5cdFx0XHRcdFx0bG9jYXRpb246ICEhKGtleU1vZHM/LmFsdCAmJiBhY3RpdmVJbnN0YW5jZSkgPyB7IHNwbGl0QWN0aXZlVGVybWluYWw6IHRydWUgfSA6IGRlZmF1bHRMb2NhdGlvbixcblx0XHRcdFx0XHR0aXRsZVRlbXBsYXRlOiByZXN1bHQuY29uZmlnLnRpdGxlVGVtcGxhdGUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2UgaWYgKHJlc3VsdC5jb25maWcgJiYgaGFzS2V5KHJlc3VsdC5jb25maWcsIHsgcHJvZmlsZU5hbWU6IHRydWUgfSkpIHtcblx0XHRcdFx0aWYgKGtleU1vZHM/LmFsdCAmJiBhY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0XHRcdC8vIGNyZWF0ZSBzcGxpdCwgb25seSB2YWxpZCBpZiB0aGVyZSdzIGFuIGFjdGl2ZSBpbnN0YW5jZVxuXHRcdFx0XHRcdGluc3RhbmNlID0gYXdhaXQgdGhpcy5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiB7IHBhcmVudFRlcm1pbmFsOiBhY3RpdmVJbnN0YW5jZSB9LCBjb25maWc6IHJlc3VsdC5jb25maWcsIGN3ZCB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbnN0YW5jZSA9IGF3YWl0IHRoaXMuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogZGVmYXVsdExvY2F0aW9uLCBjb25maWc6IHJlc3VsdC5jb25maWcsIGN3ZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5zdGFuY2UgJiYgZGVmYXVsdExvY2F0aW9uICE9PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0aWFsaXplUHJpbWFyeUJhY2tlbmQoKSB7XG5cdFx0bWFyaygnY29kZS90ZXJtaW5hbC93aWxsR2V0VGVybWluYWxCYWNrZW5kJyk7XG5cdFx0dGhpcy5fcHJpbWFyeUJhY2tlbmQgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbEluc3RhbmNlU2VydmljZS5nZXRCYWNrZW5kKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkR2V0VGVybWluYWxCYWNrZW5kJyk7XG5cdFx0Y29uc3QgZW5hYmxlVGVybWluYWxSZWNvbm5lY3Rpb24gPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnM7XG5cblx0XHQvLyBDb25uZWN0IHRvIHRoZSBleHRlbnNpb24gaG9zdCBpZiBpdCdzIHRoZXJlLCBzZXQgdGhlIGNvbm5lY3Rpb24gc3RhdGUgdG8gY29ubmVjdGVkIHdoZW5cblx0XHQvLyBpdCdzIGRvbmUuIFRoaXMgc2hvdWxkIGhhcHBlbiBldmVuIHdoZW4gdGhlcmUgaXMgbm8gZXh0ZW5zaW9uIGhvc3QuXG5cdFx0dGhpcy5fY29ubmVjdGlvblN0YXRlID0gVGVybWluYWxDb25uZWN0aW9uU3RhdGUuQ29ubmVjdGluZztcblxuXHRcdGNvbnN0IGlzUGVyc2lzdGVudFJlbW90ZSA9ICEhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiBlbmFibGVUZXJtaW5hbFJlY29ubmVjdGlvbjtcblxuXHRcdGlmICh0aGlzLl9wcmltYXJ5QmFja2VuZCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJpbWFyeUJhY2tlbmQub25EaWRSZXF1ZXN0RGV0YWNoKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlVG9EZXRhY2ggPSB0aGlzLmdldEluc3RhbmNlRnJvbVJlc291cmNlKGdldFRlcm1pbmFsVXJpKGUud29ya3NwYWNlSWQsIGUuaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHRpZiAoaW5zdGFuY2VUb0RldGFjaCkge1xuXHRcdFx0XHRcdGNvbnN0IHBlcnNpc3RlbnRQcm9jZXNzSWQgPSBpbnN0YW5jZVRvRGV0YWNoPy5wZXJzaXN0ZW50UHJvY2Vzc0lkO1xuXHRcdFx0XHRcdGlmIChwZXJzaXN0ZW50UHJvY2Vzc0lkICYmICFpbnN0YW5jZVRvRGV0YWNoLnNoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsICYmICFpbnN0YW5jZVRvRGV0YWNoLnNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uKSB7XG5cdFx0XHRcdFx0XHRpZiAoaW5zdGFuY2VUb0RldGFjaC50YXJnZXQgPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5kZXRhY2hJbnN0YW5jZShpbnN0YW5jZVRvRGV0YWNoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2UoaW5zdGFuY2VUb0RldGFjaCk/LnJlbW92ZUluc3RhbmNlKGluc3RhbmNlVG9EZXRhY2gpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YXdhaXQgaW5zdGFuY2VUb0RldGFjaC5kZXRhY2hQcm9jZXNzQW5kRGlzcG9zZShUZXJtaW5hbEV4aXRSZWFzb24uVXNlcik7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wcmltYXJ5QmFja2VuZD8uYWNjZXB0RGV0YWNoSW5zdGFuY2VSZXBseShlLnJlcXVlc3RJZCwgcGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIHdpbGwgZ2V0IHJlamVjdGVkIHdpdGhvdXQgYSBwZXJzaXN0ZW50UHJvY2Vzc0lkIHRvIGF0dGFjaCB0b1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcHJpbWFyeUJhY2tlbmQ/LmFjY2VwdERldGFjaEluc3RhbmNlUmVwbHkoZS5yZXF1ZXN0SWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0bWFyaygnY29kZS90ZXJtaW5hbC93aWxsUmVjb25uZWN0Jyk7XG5cdFx0bGV0IHJlY29ubmVjdGVkUHJvbWlzZTogUHJvbWlzZTx1bmtub3duPjtcblx0XHRpZiAoaXNQZXJzaXN0ZW50UmVtb3RlKSB7XG5cdFx0XHRyZWNvbm5lY3RlZFByb21pc2UgPSB0aGlzLl9yZWNvbm5lY3RUb1JlbW90ZVRlcm1pbmFscygpO1xuXHRcdH0gZWxzZSBpZiAoZW5hYmxlVGVybWluYWxSZWNvbm5lY3Rpb24pIHtcblx0XHRcdHJlY29ubmVjdGVkUHJvbWlzZSA9IHRoaXMuX3JlY29ubmVjdFRvTG9jYWxUZXJtaW5hbHMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVjb25uZWN0ZWRQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdHJlY29ubmVjdGVkUHJvbWlzZS50aGVuKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX3NldENvbm5lY3RlZCgpO1xuXHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC9kaWRSZWNvbm5lY3QnKTtcblx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbFJlcGxheScpO1xuXHRcdFx0Y29uc3QgaW5zdGFuY2VzID0gYXdhaXQgdGhpcy5fcmVjb25uZWN0ZWRUZXJtaW5hbEdyb3Vwcz8udGhlbihncm91cHMgPT4gZ3JvdXBzLm1hcChlID0+IGUudGVybWluYWxJbnN0YW5jZXMpLmZsYXQoKSkgPz8gW107XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChpbnN0YW5jZXMubWFwKGUgPT4gbmV3IFByb21pc2U8dm9pZD4ociA9PiBFdmVudC5vbmNlKGUub25Qcm9jZXNzUmVwbGF5Q29tcGxldGUpKHIpKSkpO1xuXHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC9kaWRSZXBsYXknKTtcblx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbEdldFBlcmZvcm1hbmNlTWFya3MnKTtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKEFycmF5LmZyb20odGhpcy5fdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuZ2V0UmVnaXN0ZXJlZEJhY2tlbmRzKCkpLm1hcChhc3luYyBiYWNrZW5kID0+IHtcblx0XHRcdFx0dGhpcy5fdGltZXJTZXJ2aWNlLnNldFBlcmZvcm1hbmNlTWFya3MoYmFja2VuZC5yZW1vdGVBdXRob3JpdHkgPT09IHVuZGVmaW5lZCA/ICdsb2NhbFB0eUhvc3QnIDogJ3JlbW90ZVB0eUhvc3QnLCBhd2FpdCBiYWNrZW5kLmdldFBlcmZvcm1hbmNlTWFya3MoKSk7XG5cdFx0XHRcdGJhY2tlbmQuc2V0UmVhZHkoKTtcblx0XHRcdH0pKTtcblx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkR2V0UGVyZm9ybWFuY2VNYXJrcycpO1xuXHRcdFx0dGhpcy5fd2hlbkNvbm5lY3RlZC5jb21wbGV0ZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0UHJpbWFyeUJhY2tlbmQoKTogSVRlcm1pbmFsQmFja2VuZCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByaW1hcnlCYWNrZW5kO1xuXHR9XG5cblx0YXN5bmMgc2V0TmV4dENvbW1hbmRJZChpZDogbnVtYmVyLCBjb21tYW5kTGluZTogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fcHJpbWFyeUJhY2tlbmQgfHwgaWQgPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9wcmltYXJ5QmFja2VuZC5zZXROZXh0Q29tbWFuZElkKGlkLCBjb21tYW5kTGluZSwgY29tbWFuZElkKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZvcndhcmRJbnN0YW5jZUhvc3RFdmVudHMoaG9zdDogSVRlcm1pbmFsSW5zdGFuY2VIb3N0KSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG9zdC5vbkRpZENoYW5nZUluc3RhbmNlcyh0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlLCB0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvc3Qub25EaWREaXNwb3NlSW5zdGFuY2UodGhpcy5fb25EaWREaXNwb3NlSW5zdGFuY2UuZmlyZSwgdGhpcy5fb25EaWREaXNwb3NlSW5zdGFuY2UpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3N0Lm9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UgPT4gdGhpcy5fZXZhbHVhdGVBY3RpdmVJbnN0YW5jZShob3N0LCBpbnN0YW5jZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3N0Lm9uRGlkRm9jdXNJbnN0YW5jZShpbnN0YW5jZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzSW5zdGFuY2UuZmlyZShpbnN0YW5jZSk7XG5cdFx0XHR0aGlzLl9ldmFsdWF0ZUFjdGl2ZUluc3RhbmNlKGhvc3QsIGluc3RhbmNlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG9zdC5vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSgoaW5zdGFuY2UpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5LmZpcmUoaW5zdGFuY2UpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9ob3N0QWN0aXZlVGVybWluYWxzLnNldChob3N0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXZhbHVhdGVBY3RpdmVJbnN0YW5jZShob3N0OiBJVGVybWluYWxJbnN0YW5jZUhvc3QsIGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCkge1xuXHRcdC8vIFRyYWNrIHRoZSBsYXRlc3QgYWN0aXZlIHRlcm1pbmFsIGZvciBlYWNoIGhvc3Qgc28gdGhhdCB3aGVuIG9uZSBiZWNvbWVzIHVuZGVmaW5lZCwgdGhlXG5cdFx0Ly8gVGVybWluYWxTZXJ2aWNlJ3MgYWN0aXZlIHRlcm1pbmFsIGlzIHNldCB0byB0aGUgbGFzdCBhY3RpdmUgdGVybWluYWwgZnJvbSB0aGUgb3RoZXIgaG9zdC5cblx0XHQvLyBUaGlzIG1lYW5zIGlmIHRoZSBsYXN0IHRlcm1pbmFsIGVkaXRvciBpcyBjbG9zZWQgc3VjaCB0aGF0IGl0IGJlY29tZXMgdW5kZWZpbmVkLCB0aGUgbGFzdFxuXHRcdC8vIGFjdGl2ZSBncm91cCdzIHRlcm1pbmFsIHdpbGwgYmUgdXNlZCBhcyB0aGUgYWN0aXZlIHRlcm1pbmFsIGlmIGF2YWlsYWJsZS5cblx0XHR0aGlzLl9ob3N0QWN0aXZlVGVybWluYWxzLnNldChob3N0LCBpbnN0YW5jZSk7XG5cdFx0aWYgKGluc3RhbmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGZvciAoY29uc3QgYWN0aXZlIG9mIHRoaXMuX2hvc3RBY3RpdmVUZXJtaW5hbHMudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0XHRcdGluc3RhbmNlID0gYWN0aXZlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZUluc3RhbmNlID0gaW5zdGFuY2U7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZS5maXJlKGluc3RhbmNlKTtcblx0fVxuXG5cdHNldEFjdGl2ZUluc3RhbmNlKHZhbHVlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCkge1xuXHRcdC8vIFRPRE9AbWVnYW5yb2dnZTogSXMgdGhpcyB0aGUgcmlnaHQgbG9naWMgZm9yIHdoZW4gaW5zdGFuY2UgaXMgdW5kZWZpbmVkP1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gSWYgdGhpcyB3YXMgYSBoaWRlRnJvbVVzZXIgdGVybWluYWwgY3JlYXRlZCBieSB0aGUgQVBJIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBzaG93LFxuXHRcdC8vIGluIHdoaWNoIGNhc2Ugd2UgbmVlZCB0byBjcmVhdGUgdGhlIHRlcm1pbmFsIGdyb3VwXG5cdFx0aWYgKHZhbHVlLnNoZWxsTGF1bmNoQ29uZmlnLmhpZGVGcm9tVXNlcikge1xuXHRcdFx0dGhpcy5zaG93QmFja2dyb3VuZFRlcm1pbmFsKHZhbHVlKTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh2YWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmb2N1c0luc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9hY3RpdmVJbnN0YW5jZSAhPT0gaW5zdGFuY2UpIHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdH1cblx0XHRpZiAoaW5zdGFuY2UudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlLmZvY3VzSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5mb2N1c0luc3RhbmNlKGluc3RhbmNlKTtcblx0fVxuXG5cdGFzeW5jIGZvY3VzQWN0aXZlSW5zdGFuY2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9hY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5mb2N1c0luc3RhbmNlKHRoaXMuX2FjdGl2ZUluc3RhbmNlKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlKGV4dGVuc2lvbklkZW50aWZpZXI6IHN0cmluZywgaWQ6IHN0cmluZywgb3B0aW9uczogSUNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvblRlcm1pbmFsUHJvZmlsZToke2lkfWApO1xuXG5cdFx0Y29uc3QgcHJvZmlsZVByb3ZpZGVyID0gdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5nZXRDb250cmlidXRlZFByb2ZpbGVQcm92aWRlcihleHRlbnNpb25JZGVudGlmaWVyLCBpZCk7XG5cdFx0aWYgKCFwcm9maWxlUHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoYE5vIHRlcm1pbmFsIHByb2ZpbGUgcHJvdmlkZXIgcmVnaXN0ZXJlZCBmb3IgaWQgXCIke2lkfVwiYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm9maWxlUHJvdmlkZXIuY3JlYXRlQ29udHJpYnV0ZWRUZXJtaW5hbFByb2ZpbGUob3B0aW9ucyk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgodGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLmxlbmd0aCAtIDEpO1xuXHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U/LmZvY3VzV2hlblJlYWR5KCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlLm1lc3NhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNhZmVEaXNwb3NlVGVybWluYWwoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ29uZmlybSBvbiBraWxsIGluIHRoZSBlZGl0b3IgaXMgaGFuZGxlZCBieSB0aGUgZWRpdG9yIGlucHV0XG5cdFx0aWYgKGluc3RhbmNlLnRhcmdldCAhPT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IgJiZcblx0XHRcdGluc3RhbmNlLmhhc0NoaWxkUHJvY2Vzc2VzICYmXG5cdFx0XHQodGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuY29uZmlybU9uS2lsbCA9PT0gJ3BhbmVsJyB8fCB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5jb25maXJtT25LaWxsID09PSAnYWx3YXlzJykpIHtcblx0XHRcdGNvbnN0IHZldG8gPSBhd2FpdCB0aGlzLl9zaG93VGVybWluYWxDbG9zZUNvbmZpcm1hdGlvbih0cnVlKTtcblx0XHRcdGlmICh2ZXRvKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0RXZlbnQub25jZShpbnN0YW5jZS5vbkV4aXQpKCgpID0+IHIoKSk7XG5cdFx0XHRpbnN0YW5jZS5kaXNwb3NlKFRlcm1pbmFsRXhpdFJlYXNvbi5Vc2VyKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldENvbm5lY3RlZCgpIHtcblx0XHR0aGlzLl9jb25uZWN0aW9uU3RhdGUgPSBUZXJtaW5hbENvbm5lY3Rpb25TdGF0ZS5Db25uZWN0ZWQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUuZmlyZSgpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1B0eSBob3N0IHJlYWR5Jyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvbm5lY3RUb1JlbW90ZVRlcm1pbmFscygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGlmICghcmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbEluc3RhbmNlU2VydmljZS5nZXRCYWNrZW5kKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0aWYgKCFiYWNrZW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbEdldFRlcm1pbmFsTGF5b3V0SW5mbycpO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSBhd2FpdCBiYWNrZW5kLmdldFRlcm1pbmFsTGF5b3V0SW5mbygpO1xuXHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkR2V0VGVybWluYWxMYXlvdXRJbmZvJyk7XG5cdFx0YmFja2VuZC5yZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk7XG5cdFx0bWFyaygnY29kZS90ZXJtaW5hbC93aWxsUmVjcmVhdGVUZXJtaW5hbEdyb3VwcycpO1xuXHRcdGF3YWl0IHRoaXMuX3JlY3JlYXRlVGVybWluYWxHcm91cHMobGF5b3V0SW5mbyk7XG5cdFx0bWFyaygnY29kZS90ZXJtaW5hbC9kaWRSZWNyZWF0ZVRlcm1pbmFsR3JvdXBzJyk7XG5cdFx0Ly8gbm93IHRoYXQgdGVybWluYWxzIGhhdmUgYmVlbiByZXN0b3JlZCxcblx0XHQvLyBhdHRhY2ggbGlzdGVuZXJzIHRvIHVwZGF0ZSByZW1vdGUgd2hlbiB0ZXJtaW5hbHMgYXJlIGNoYW5nZWRcblx0XHR0aGlzLl9hdHRhY2hQcm9jZXNzTGF5b3V0TGlzdGVuZXJzKCk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdSZWNvbm5lY3RlZCB0byByZW1vdGUgdGVybWluYWxzJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWNvbm5lY3RUb0xvY2FsVGVybWluYWxzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxvY2FsQmFja2VuZCA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmdldEJhY2tlbmQoKTtcblx0XHRpZiAoIWxvY2FsQmFja2VuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL3dpbGxHZXRUZXJtaW5hbExheW91dEluZm8nKTtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gYXdhaXQgbG9jYWxCYWNrZW5kLmdldFRlcm1pbmFsTGF5b3V0SW5mbygpO1xuXHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkR2V0VGVybWluYWxMYXlvdXRJbmZvJyk7XG5cdFx0aWYgKGxheW91dEluZm8gJiYgKGxheW91dEluZm8udGFicy5sZW5ndGggPiAwIHx8IGxheW91dEluZm8/LmJhY2tncm91bmQ/Lmxlbmd0aCkpIHtcblx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbFJlY3JlYXRlVGVybWluYWxHcm91cHMnKTtcblx0XHRcdHRoaXMuX3JlY29ubmVjdGVkVGVybWluYWxHcm91cHMgPSB0aGlzLl9yZWNyZWF0ZVRlcm1pbmFsR3JvdXBzKGxheW91dEluZm8pO1xuXHRcdFx0Y29uc3QgcmV2aXZlZEluc3RhbmNlcyA9IGF3YWl0IHRoaXMuX3Jldml2ZUJhY2tncm91bmRUZXJtaW5hbEluc3RhbmNlcyhsYXlvdXRJbmZvLmJhY2tncm91bmQgfHwgW10pO1xuXHRcdFx0dGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXMgPSByZXZpdmVkSW5zdGFuY2VzLm1hcChpbnN0YW5jZSA9PiAoeyBpbnN0YW5jZSB9KSk7XG5cdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZFJlY3JlYXRlVGVybWluYWxHcm91cHMnKTtcblx0XHR9XG5cdFx0Ly8gbm93IHRoYXQgdGVybWluYWxzIGhhdmUgYmVlbiByZXN0b3JlZCxcblx0XHQvLyBhdHRhY2ggbGlzdGVuZXJzIHRvIHVwZGF0ZSBsb2NhbCBzdGF0ZSB3aGVuIHRlcm1pbmFscyBhcmUgY2hhbmdlZFxuXHRcdHRoaXMuX2F0dGFjaFByb2Nlc3NMYXlvdXRMaXN0ZW5lcnMoKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1JlY29ubmVjdGVkIHRvIGxvY2FsIHRlcm1pbmFscycpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjcmVhdGVUZXJtaW5hbEdyb3VwcyhsYXlvdXRJbmZvPzogSVRlcm1pbmFsc0xheW91dEluZm8pOiBQcm9taXNlPElUZXJtaW5hbEdyb3VwW10+IHtcblx0XHRjb25zdCBncm91cFByb21pc2VzOiBQcm9taXNlPElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkPltdID0gW107XG5cdFx0bGV0IGFjdGl2ZUdyb3VwOiBQcm9taXNlPElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAobGF5b3V0SW5mbykge1xuXHRcdFx0Zm9yIChjb25zdCB0YWJMYXlvdXQgb2YgbGF5b3V0SW5mby50YWJzKSB7XG5cdFx0XHRcdGNvbnN0IHRlcm1pbmFsTGF5b3V0cyA9IHRhYkxheW91dC50ZXJtaW5hbHMuZmlsdGVyKHQgPT4gdC50ZXJtaW5hbCAmJiB0LnRlcm1pbmFsLmlzT3JwaGFuKTtcblx0XHRcdFx0aWYgKHRlcm1pbmFsTGF5b3V0cy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLl9yZXN0b3JlZEdyb3VwQ291bnQgKz0gdGVybWluYWxMYXlvdXRzLmxlbmd0aDtcblx0XHRcdFx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5fcmVjcmVhdGVUZXJtaW5hbEdyb3VwKHRhYkxheW91dCwgdGVybWluYWxMYXlvdXRzKTtcblx0XHRcdFx0XHRncm91cFByb21pc2VzLnB1c2gocHJvbWlzZSk7XG5cdFx0XHRcdFx0aWYgKHRhYkxheW91dC5pc0FjdGl2ZSkge1xuXHRcdFx0XHRcdFx0YWN0aXZlR3JvdXAgPSBwcm9taXNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IHRoaXMuaW5zdGFuY2VzLmZpbmQodCA9PiB0LnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5pZCA9PT0gdGFiTGF5b3V0LmFjdGl2ZVBlcnNpc3RlbnRQcm9jZXNzSWQpO1xuXHRcdFx0XHRcdGlmIChhY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZShhY3RpdmVJbnN0YW5jZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobGF5b3V0SW5mby50YWJzLmxlbmd0aCkge1xuXHRcdFx0XHRhY3RpdmVHcm91cD8udGhlbihncm91cCA9PiB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVHcm91cCA9IGdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKGdyb3VwUHJvbWlzZXMpLnRoZW4ocmVzdWx0ID0+IHJlc3VsdC5maWx0ZXIoZSA9PiAhIWUpIGFzIElUZXJtaW5hbEdyb3VwW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmV2aXZlQmFja2dyb3VuZFRlcm1pbmFsSW5zdGFuY2VzKGJnVGVybWluYWxzOiAoSVB0eUhvc3RBdHRhY2hUYXJnZXQgfCBudWxsKVtdKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZVtdPiB7XG5cdFx0Y29uc3QgaW5zdGFuY2VzOiBJVGVybWluYWxJbnN0YW5jZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBiZyBvZiBiZ1Rlcm1pbmFscykge1xuXHRcdFx0Y29uc3QgYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MgPSBiZztcblx0XHRcdGlmICghYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IHRoaXMuY3JlYXRlVGVybWluYWwoeyBjb25maWc6IHsgYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MsIGhpZGVGcm9tVXNlcjogdHJ1ZSwgZm9yY2VQZXJzaXN0OiB0cnVlIH0sIGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIH0pO1xuXHRcdFx0aW5zdGFuY2VzLnB1c2goaW5zdGFuY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5zdGFuY2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjcmVhdGVUZXJtaW5hbEdyb3VwKHRhYkxheW91dDogSVJhd1Rlcm1pbmFsVGFiTGF5b3V0SW5mbzxJUHR5SG9zdEF0dGFjaFRhcmdldCB8IG51bGw+LCB0ZXJtaW5hbExheW91dHM6IElSYXdUZXJtaW5hbEluc3RhbmNlTGF5b3V0SW5mbzxJUHR5SG9zdEF0dGFjaFRhcmdldCB8IG51bGw+W10pOiBQcm9taXNlPElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IGxhc3RJbnN0YW5jZTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4gfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCB0ZXJtaW5hbExheW91dCBvZiB0ZXJtaW5hbExheW91dHMpIHtcblx0XHRcdGNvbnN0IGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzID0gdGVybWluYWxMYXlvdXQudGVybWluYWwhO1xuXHRcdFx0aWYgKHRoaXMuX2xpZmVjeWNsZVNlcnZpY2Uuc3RhcnR1cEtpbmQgIT09IFN0YXJ0dXBLaW5kLlJlbG9hZGVkV2luZG93ICYmIGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzLnR5cGUgPT09ICdUYXNrJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdG1hcmsoYGNvZGUvdGVybWluYWwvd2lsbFJlY3JlYXRlVGVybWluYWwvJHthdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5pZH0tJHthdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5waWR9YCk7XG5cdFx0XHRsYXN0SW5zdGFuY2UgPSB0aGlzLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdFx0Y29uZmlnOiB7IGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzIH0sXG5cdFx0XHRcdGxvY2F0aW9uOiBsYXN0SW5zdGFuY2UgPyB7IHBhcmVudFRlcm1pbmFsOiBsYXN0SW5zdGFuY2UgfSA6IFRlcm1pbmFsTG9jYXRpb24uUGFuZWxcblx0XHRcdH0pO1xuXHRcdFx0bGFzdEluc3RhbmNlLnRoZW4oKCkgPT4gbWFyayhgY29kZS90ZXJtaW5hbC9kaWRSZWNyZWF0ZVRlcm1pbmFsLyR7YXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuaWR9LSR7YXR0YWNoUGVyc2lzdGVudFByb2Nlc3MucGlkfWApKTtcblx0XHR9XG5cdFx0Y29uc3QgZ3JvdXAgPSBsYXN0SW5zdGFuY2U/LnRoZW4oaW5zdGFuY2UgPT4ge1xuXHRcdFx0Y29uc3QgZyA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0Zz8ucmVzaXplUGFuZXModGFiTGF5b3V0LnRlcm1pbmFscy5tYXAodGVybWluYWwgPT4gdGVybWluYWwucmVsYXRpdmVTaXplKSk7XG5cdFx0XHRyZXR1cm4gZztcblx0XHR9KTtcblx0XHRyZXR1cm4gZ3JvdXA7XG5cdH1cblxuXHRwcml2YXRlIF9hdHRhY2hQcm9jZXNzTGF5b3V0TGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VBY3RpdmVHcm91cCgoKSA9PiB0aGlzLl9zYXZlU3RhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZSgoKSA9PiB0aGlzLl9zYXZlU3RhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VJbnN0YW5jZXMoKCkgPT4gdGhpcy5fc2F2ZVN0YXRlKCkpKTtcblx0XHQvLyBUaGUgc3RhdGUgbXVzdCBiZSB1cGRhdGVkIHdoZW4gdGhlIHRlcm1pbmFsIGlzIHJlbGF1bmNoZWQsIG90aGVyd2lzZSB0aGUgcGVyc2lzdGVudFxuXHRcdC8vIHRlcm1pbmFsIElEIHdpbGwgYmUgc3RhbGUgYW5kIHRoZSBwcm9jZXNzIHdpbGwgYmUgbGVha2VkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25BbnlJbnN0YW5jZVByb2Nlc3NJZFJlYWR5KCgpID0+IHRoaXMuX3NhdmVTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkFueUluc3RhbmNlVGl0bGVDaGFuZ2UoaW5zdGFuY2UgPT4gdGhpcy5fdXBkYXRlVGl0bGUoaW5zdGFuY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkFueUluc3RhbmNlSWNvbkNoYW5nZShlID0+IHRoaXMuX3VwZGF0ZUljb24oZS5pbnN0YW5jZSwgZS51c2VySW5pdGlhdGVkKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlSW5zdGFuY2VDb250ZXh0S2V5cygpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbElzT3BlbkNvbnRleHQgPSBUZXJtaW5hbENvbnRleHRLZXlzLmlzT3Blbi5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVwZGF0ZVRlcm1pbmFsQ29udGV4dEtleXMgPSAoKSA9PiB7XG5cdFx0XHR0ZXJtaW5hbElzT3BlbkNvbnRleHQuc2V0KHRoaXMuaW5zdGFuY2VzLmxlbmd0aCA+IDApO1xuXHRcdFx0dGhpcy5fdGVybWluYWxDb3VudENvbnRleHRLZXkuc2V0KHRoaXMuaW5zdGFuY2VzLmxlbmd0aCk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlSW5zdGFuY2VzKCgpID0+IHVwZGF0ZVRlcm1pbmFsQ29udGV4dEtleXMoKSkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QWN0aXZlT3JDcmVhdGVJbnN0YW5jZShvcHRpb25zPzogeyBhY2NlcHRzSW5wdXQ/OiBib29sZWFuIH0pOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2UgPSB0aGlzLmFjdGl2ZUluc3RhbmNlO1xuXHRcdC8vIE5vIGluc3RhbmNlLCBjcmVhdGVcblx0XHRpZiAoIWFjdGl2ZUluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVUZXJtaW5hbCgpO1xuXHRcdH1cblx0XHQvLyBBY3RpdmUgaW5zdGFuY2UsIGVuc3VyZSBhY2NlcHRzIGlucHV0XG5cdFx0aWYgKCFvcHRpb25zPy5hY2NlcHRzSW5wdXQgfHwgYWN0aXZlSW5zdGFuY2UueHRlcm0/LmlzU3RkaW5EaXNhYmxlZCAhPT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIGFjdGl2ZUluc3RhbmNlO1xuXHRcdH1cblx0XHQvLyBBY3RpdmUgaW5zdGFuY2UgZG9lc24ndCBhY2NlcHQgaW5wdXQsIGNyZWF0ZSBhbmQgZm9jdXNcblx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IHRoaXMuY3JlYXRlVGVybWluYWwoKTtcblx0XHR0aGlzLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRhd2FpdCB0aGlzLnJldmVhbEFjdGl2ZVRlcm1pbmFsKCk7XG5cdFx0cmV0dXJuIGluc3RhbmNlO1xuXHR9XG5cblx0YXN5bmMgcmV2ZWFsVGVybWluYWwoc291cmNlOiBJVGVybWluYWxJbnN0YW5jZSwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc291cmNlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5yZXZlYWxBY3RpdmVFZGl0b3IocHJlc2VydmVGb2N1cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNob3dQYW5lbCgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJldmVhbEFjdGl2ZVRlcm1pbmFsKHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLmFjdGl2ZUluc3RhbmNlO1xuXHRcdGlmICghaW5zdGFuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5yZXZlYWxUZXJtaW5hbChpbnN0YW5jZSwgcHJlc2VydmVGb2N1cyk7XG5cdH1cblxuXG5cblx0cmVxdWVzdFN0YXJ0RXh0ZW5zaW9uVGVybWluYWwocHJveHk6IElUZXJtaW5hbFByb2Nlc3NFeHRIb3N0UHJveHksIGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyKTogUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFRoZSBpbml0aWFsIHJlcXVlc3QgY2FtZSBmcm9tIHRoZSBleHRlbnNpb24gaG9zdCwgbm8gbmVlZCB0byB3YWl0IGZvciBpdFxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IHVuZGVmaW5lZD4oY2FsbGJhY2sgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0U3RhcnRFeHRlbnNpb25UZXJtaW5hbC5maXJlKHsgcHJveHksIGNvbHMsIHJvd3MsIGNhbGxiYWNrIH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25CZWZvcmVTaHV0ZG93bihyZWFzb246IFNodXRkb3duUmVhc29uKTogTWF5YmVQcm9taXNlPGJvb2xlYW4+IHtcblx0XHQvLyBOZXZlciB2ZXRvIG9uIHdlYiBhcyB0aGlzIHdvdWxkIGJsb2NrIGFsbCB3aW5kb3dzIGZyb20gYmVpbmcgY2xvc2VkLiBUaGlzIGRpc2FibGVzXG5cdFx0Ly8gcHJvY2VzcyByZXZpdmUgYXMgd2UgY2FuJ3QgaGFuZGxlIGl0IG9uIHNodXRkb3duLlxuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0dGhpcy5faXNTaHV0dGluZ0Rvd24gPSB0cnVlO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fb25CZWZvcmVTaHV0ZG93bkFzeW5jKHJlYXNvbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vbkJlZm9yZVNodXRkb3duQXN5bmMocmVhc29uOiBTaHV0ZG93blJlYXNvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLmluc3RhbmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIE5vIHRlcm1pbmFsIGluc3RhbmNlcywgZG9uJ3QgdmV0b1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFBlcnNpc3QgdGVybWluYWwgX2J1ZmZlciBzdGF0ZV8sIG5vdGUgdGhhdCBldmVuIGlmIHRoaXMgaGFwcGVucyB0aGUgZGlydHkgdGVybWluYWwgcHJvbXB0XG5cdFx0Ly8gc3RpbGwgc2hvd3MgYXMgdGhhdCBjYW5ub3QgYmUgcmV2aXZlZFxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9zaHV0ZG93bldpbmRvd0NvdW50ID0gYXdhaXQgdGhpcy5fbmF0aXZlRGVsZWdhdGU/LmdldFdpbmRvd0NvdW50KCk7XG5cdFx0XHRjb25zdCBzaG91bGRSZXZpdmVQcm9jZXNzZXMgPSB0aGlzLl9zaG91bGRSZXZpdmVQcm9jZXNzZXMocmVhc29uKTtcblx0XHRcdGlmIChzaG91bGRSZXZpdmVQcm9jZXNzZXMpIHtcblx0XHRcdFx0Ly8gQXR0ZW1wdCB0byBwZXJzaXN0IHRoZSB0ZXJtaW5hbCBzdGF0ZSBidXQgb25seSBhbGxvdyAyMDAwbXMgYXMgd2UgY2FuJ3QgYmxvY2tcblx0XHRcdFx0Ly8gc2h1dGRvd24uIFRoaXMgY2FuIGhhcHBlbiB3aGVuIGluIGEgcmVtb3RlIHdvcmtzcGFjZSBidXQgdGhlIG90aGVyIHNpZGUgaGFzIGJlZW5cblx0XHRcdFx0Ly8gc3VzcGVuZGVkIGFuZCBpcyBpbiB0aGUgcHJvY2VzcyBvZiByZWNvbm5lY3RpbmcsIHRoZSBtZXNzYWdlIHdpbGwgYmUgcHV0IGluIGFcblx0XHRcdFx0Ly8gcXVldWUgaW4gdGhpcyBjYXNlIGZvciB3aGVuIHRoZSBjb25uZWN0aW9uIGlzIGJhY2sgdXAgYW5kIHJ1bm5pbmcuIEFib3J0aW5nIHRoZVxuXHRcdFx0XHQvLyBwcm9jZXNzIGlzIHByZWZlcmFibGUgaW4gdGhpcyBjYXNlLlxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRcdHRoaXMuX3ByaW1hcnlCYWNrZW5kPy5wZXJzaXN0VGVybWluYWxTdGF0ZSgpLFxuXHRcdFx0XHRcdHRpbWVvdXQoMjAwMClcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFBlcnNpc3QgdGVybWluYWwgX3Byb2Nlc3Nlc19cblx0XHRcdGNvbnN0IHNob3VsZFBlcnNpc3RQcm9jZXNzZXMgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnMgJiYgcmVhc29uID09PSBTaHV0ZG93blJlYXNvbi5SRUxPQUQ7XG5cdFx0XHRpZiAoIXNob3VsZFBlcnNpc3RQcm9jZXNzZXMpIHtcblx0XHRcdFx0Y29uc3QgaGFzRGlydHlJbnN0YW5jZXMgPSAoXG5cdFx0XHRcdFx0KHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmNvbmZpcm1PbkV4aXQgPT09ICdhbHdheXMnICYmIHRoaXMuZm9yZWdyb3VuZEluc3RhbmNlcy5sZW5ndGggPiAwKSB8fFxuXHRcdFx0XHRcdCh0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5jb25maXJtT25FeGl0ID09PSAnaGFzQ2hpbGRQcm9jZXNzZXMnICYmIHRoaXMuZm9yZWdyb3VuZEluc3RhbmNlcy5zb21lKGUgPT4gZS5oYXNDaGlsZFByb2Nlc3NlcykpXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmIChoYXNEaXJ0eUluc3RhbmNlcykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9vbkJlZm9yZVNodXRkb3duQ29uZmlybWF0aW9uKHJlYXNvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnI6IHVua25vd24pIHtcblx0XHRcdC8vIFN3YWxsb3cgYXMgZXhjZXB0aW9ucyBzaG91bGQgbm90IGNhdXNlIGEgdmV0byB0byBwcmV2ZW50IHNodXRkb3duXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0V4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgdGVybWluYWwgc2h1dGRvd24nLCBlcnIpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzU2h1dHRpbmdEb3duID0gdHJ1ZTtcblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHNldE5hdGl2ZURlbGVnYXRlKG5hdGl2ZURlbGVnYXRlOiBJVGVybWluYWxTZXJ2aWNlTmF0aXZlRGVsZWdhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl9uYXRpdmVEZWxlZ2F0ZSA9IG5hdGl2ZURlbGVnYXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkUmV2aXZlUHJvY2Vzc2VzKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmVuYWJsZVBlcnNpc3RlbnRTZXNzaW9ucykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRzd2l0Y2ggKHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnBlcnNpc3RlbnRTZXNzaW9uUmV2aXZlUHJvY2Vzcykge1xuXHRcdFx0Y2FzZSAnb25FeGl0Jzoge1xuXHRcdFx0XHQvLyBBbGxvdyBvbiBjbG9zZSBpZiBpdCdzIHRoZSBsYXN0IHdpbmRvdyBvbiBXaW5kb3dzIG9yIExpbnV4XG5cdFx0XHRcdGlmIChyZWFzb24gPT09IFNodXRkb3duUmVhc29uLkNMT1NFICYmICh0aGlzLl9zaHV0ZG93bldpbmRvd0NvdW50ID09PSAxICYmICFpc01hY2ludG9zaCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVhc29uID09PSBTaHV0ZG93blJlYXNvbi5MT0FEIHx8IHJlYXNvbiA9PT0gU2h1dGRvd25SZWFzb24uUVVJVDtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ29uRXhpdEFuZFdpbmRvd0Nsb3NlJzogcmV0dXJuIHJlYXNvbiAhPT0gU2h1dGRvd25SZWFzb24uUkVMT0FEO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29uQmVmb3JlU2h1dGRvd25Db25maXJtYXRpb24ocmVhc29uOiBTaHV0ZG93blJlYXNvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIHZldG8gaWYgY29uZmlndXJlZCB0byBzaG93IGNvbmZpcm1hdGlvbiBhbmQgdGhlIHVzZXIgY2hvc2Ugbm90IHRvIGV4aXRcblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgdGhpcy5fc2hvd1Rlcm1pbmFsQ2xvc2VDb25maXJtYXRpb24oKTtcblx0XHRpZiAoIXZldG8pIHtcblx0XHRcdHRoaXMuX2lzU2h1dHRpbmdEb3duID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdmV0bztcblx0fVxuXG5cdHByaXZhdGUgX29uV2lsbFNodXRkb3duKGU6IFdpbGxTaHV0ZG93bkV2ZW50KTogdm9pZCB7XG5cdFx0Ly8gRG9uJ3QgdG91Y2ggcHJvY2Vzc2VzIGlmIHRoZSBzaHV0ZG93biB3YXMgYSByZXN1bHQgb2YgcmVsb2FkIGFzIHRoZXkgd2lsbCBiZSByZWF0dGFjaGVkXG5cdFx0Y29uc3Qgc2hvdWxkUGVyc2lzdFRlcm1pbmFscyA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmVuYWJsZVBlcnNpc3RlbnRTZXNzaW9ucyAmJiBlLnJlYXNvbiA9PT0gU2h1dGRvd25SZWFzb24uUkVMT0FEO1xuXG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiBbLi4udGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLCAuLi50aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlcy5tYXAoYmcgPT4gYmcuaW5zdGFuY2UpXSkge1xuXHRcdFx0aWYgKHNob3VsZFBlcnNpc3RUZXJtaW5hbHMgJiYgaW5zdGFuY2Uuc2hvdWxkUGVyc2lzdCkge1xuXHRcdFx0XHRpbnN0YW5jZS5kZXRhY2hQcm9jZXNzQW5kRGlzcG9zZShUZXJtaW5hbEV4aXRSZWFzb24uU2h1dGRvd24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5zdGFuY2UuZGlzcG9zZShUZXJtaW5hbEV4aXRSZWFzb24uU2h1dGRvd24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENsZWFyIHRlcm1pbmFsIGxheW91dCBpbmZvIG9ubHkgd2hlbiBub3QgcGVyc2lzdGluZ1xuXHRcdGlmICghc2hvdWxkUGVyc2lzdFRlcm1pbmFscyAmJiAhdGhpcy5fc2hvdWxkUmV2aXZlUHJvY2Vzc2VzKGUucmVhc29uKSkge1xuXHRcdFx0dGhpcy5fcHJpbWFyeUJhY2tlbmQ/LnNldFRlcm1pbmFsTGF5b3V0SW5mbyh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdEBkZWJvdW5jZSg1MDApXG5cdHByaXZhdGUgX3NhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHQvLyBBdm9pZCBzYXZpbmcgc3RhdGUgd2hlbiBzaHV0dGluZyBkb3duIGFzIHRoYXQgd291bGQgb3ZlcnJpZGUgcHJvY2VzcyBzdGF0ZSB0byBiZSByZXZpdmVkXG5cdFx0aWYgKHRoaXMuX2lzU2h1dHRpbmdEb3duKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZW5hYmxlUGVyc2lzdGVudFNlc3Npb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRhYnMgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5ncm91cHMubWFwKGcgPT4gZy5nZXRMYXlvdXRJbmZvKGcgPT09IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwKSk7XG5cdFx0Y29uc3Qgc3RhdGU6IElUZXJtaW5hbHNMYXlvdXRJbmZvQnlJZCA9IHsgdGFicywgYmFja2dyb3VuZDogdGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXMubWFwKGJnID0+IGJnLmluc3RhbmNlKS5maWx0ZXIoaSA9PiBpLnNoZWxsTGF1bmNoQ29uZmlnLmZvcmNlUGVyc2lzdCkubWFwKGkgPT4gaS5wZXJzaXN0ZW50UHJvY2Vzc0lkKS5maWx0ZXIoKGUpOiBlIGlzIG51bWJlciA9PiBlICE9PSB1bmRlZmluZWQpIH07XG5cdFx0dGhpcy5fcHJpbWFyeUJhY2tlbmQ/LnNldFRlcm1pbmFsTGF5b3V0SW5mbyhzdGF0ZSk7XG5cdH1cblxuXHRAZGVib3VuY2UoNTAwKVxuXHRwcml2YXRlIF91cGRhdGVUaXRsZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmVuYWJsZVBlcnNpc3RlbnRTZXNzaW9ucyB8fCAhaW5zdGFuY2UgfHwgaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuY3VzdG9tUHR5SW1wbGVtZW50YXRpb24gfHwgIWluc3RhbmNlLnBlcnNpc3RlbnRQcm9jZXNzSWQgfHwgIWluc3RhbmNlLnRpdGxlIHx8IGluc3RhbmNlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGluc3RhbmNlLnN0YXRpY1RpdGxlKSB7XG5cdFx0XHR0aGlzLl9wcmltYXJ5QmFja2VuZD8udXBkYXRlVGl0bGUoaW5zdGFuY2UucGVyc2lzdGVudFByb2Nlc3NJZCwgaW5zdGFuY2Uuc3RhdGljVGl0bGUsIFRpdGxlRXZlbnRTb3VyY2UuQXBpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcHJpbWFyeUJhY2tlbmQ/LnVwZGF0ZVRpdGxlKGluc3RhbmNlLnBlcnNpc3RlbnRQcm9jZXNzSWQsIGluc3RhbmNlLnRpdGxlLCBpbnN0YW5jZS50aXRsZVNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0QGRlYm91bmNlKDUwMClcblx0cHJpdmF0ZSBfdXBkYXRlSWNvbihpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmVuYWJsZVBlcnNpc3RlbnRTZXNzaW9ucyB8fCAhaW5zdGFuY2UgfHwgaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuY3VzdG9tUHR5SW1wbGVtZW50YXRpb24gfHwgIWluc3RhbmNlLnBlcnNpc3RlbnRQcm9jZXNzSWQgfHwgIWluc3RhbmNlLmljb24gfHwgaW5zdGFuY2UuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcmltYXJ5QmFja2VuZD8udXBkYXRlSWNvbihpbnN0YW5jZS5wZXJzaXN0ZW50UHJvY2Vzc0lkLCB1c2VySW5pdGlhdGVkLCBpbnN0YW5jZS5pY29uLCBpbnN0YW5jZS5jb2xvcik7XG5cdH1cblxuXHRyZWZyZXNoQWN0aXZlR3JvdXAoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5maXJlKHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwKTtcblx0fVxuXG5cdGdldEluc3RhbmNlRnJvbUlkKHRlcm1pbmFsSWQ6IG51bWJlcik6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgYmdJbmRleCA9IC0xO1xuXHRcdHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsSW5zdGFuY2VzLmZvckVhY2goKGJnLCBpKSA9PiB7XG5cdFx0XHRpZiAoYmcuaW5zdGFuY2UuaW5zdGFuY2VJZCA9PT0gdGVybWluYWxJZCkge1xuXHRcdFx0XHRiZ0luZGV4ID0gaTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAoYmdJbmRleCAhPT0gLTEpIHtcblx0XHRcdHJldHVybiB0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlc1tiZ0luZGV4XS5pbnN0YW5jZTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbmNlc1t0aGlzLl9nZXRJbmRleEZyb21JZCh0ZXJtaW5hbElkKV07XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGdldEluc3RhbmNlRnJvbVJlc291cmNlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdldEluc3RhbmNlRnJvbVJlc291cmNlKHRoaXMuaW5zdGFuY2VzLCByZXNvdXJjZSk7XG5cdH1cblxuXHRvcGVuUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZShyZXNvdXJjZSk7XG5cdFx0aWYgKGluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdHRoaXMucmV2ZWFsVGVybWluYWwoaW5zdGFuY2UpO1xuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBpbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKT8uY29tbWFuZHM7XG5cdFx0XHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHJlc291cmNlLnF1ZXJ5KTtcblx0XHRcdGNvbnN0IHJlbGV2YW50Q29tbWFuZCA9IGNvbW1hbmRzPy5maW5kKGMgPT4gYy5pZCA9PT0gcGFyYW1zLmdldCgnY29tbWFuZCcpKTtcblx0XHRcdGlmIChyZWxldmFudENvbW1hbmQpIHtcblx0XHRcdFx0aW5zdGFuY2UueHRlcm0/Lm1hcmtUcmFja2VyLnJldmVhbENvbW1hbmQocmVsZXZhbnRDb21tYW5kKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpc0F0dGFjaGVkVG9UZXJtaW5hbChyZW1vdGVUZXJtOiBJUmVtb3RlVGVybWluYWxBdHRhY2hUYXJnZXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW5jZXMuc29tZSh0ZXJtID0+IHRlcm0ucHJvY2Vzc0lkID09PSByZW1vdGVUZXJtLnBpZCk7XG5cdH1cblxuXHRtb3ZlVG9FZGl0b3Ioc291cmNlOiBJVGVybWluYWxJbnN0YW5jZSwgZ3JvdXA/OiBHcm91cElkZW50aWZpZXIgfCBTSURFX0dST1VQX1RZUEUgfCBBQ1RJVkVfR1JPVVBfVFlQRSB8IEFVWF9XSU5ET1dfR1JPVVBfVFlQRSk6IHZvaWQge1xuXHRcdGlmIChzb3VyY2UudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2VHcm91cCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2Uoc291cmNlKTtcblx0XHRpZiAoIXNvdXJjZUdyb3VwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNvdXJjZUdyb3VwLnJlbW92ZUluc3RhbmNlKHNvdXJjZSk7XG5cdFx0dGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioc291cmNlLCBncm91cCA/IHsgdmlld0NvbHVtbjogZ3JvdXAgfSA6IHVuZGVmaW5lZCk7XG5cblx0fVxuXG5cdG1vdmVJbnRvTmV3RWRpdG9yKHNvdXJjZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHR0aGlzLm1vdmVUb0VkaXRvcihzb3VyY2UsIEFVWF9XSU5ET1dfR1JPVVApO1xuXHR9XG5cblx0YXN5bmMgbW92ZVRvVGVybWluYWxWaWV3KHNvdXJjZT86IElUZXJtaW5hbEluc3RhbmNlIHwgVVJJLCB0YXJnZXQ/OiBJVGVybWluYWxJbnN0YW5jZSwgc2lkZT86ICdiZWZvcmUnIHwgJ2FmdGVyJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChVUkkuaXNVcmkoc291cmNlKSkge1xuXHRcdFx0c291cmNlID0gdGhpcy5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZShzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGlmICghc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlLmRldGFjaEluc3RhbmNlKHNvdXJjZSk7XG5cblx0XHRpZiAoc291cmNlLnRhcmdldCAhPT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNob3dQYW5lbCh0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c291cmNlLnRhcmdldCA9IFRlcm1pbmFsTG9jYXRpb24uUGFuZWw7XG5cblx0XHRsZXQgZ3JvdXA6IElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdGdyb3VwID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0R3JvdXBGb3JJbnN0YW5jZSh0YXJnZXQpO1xuXHRcdH1cblxuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdGdyb3VwID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuY3JlYXRlR3JvdXAoKTtcblx0XHR9XG5cblx0XHRncm91cC5hZGRJbnN0YW5jZShzb3VyY2UpO1xuXHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2Uoc291cmNlKTtcblx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cblx0XHRpZiAodGFyZ2V0ICYmIHNpZGUpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gZ3JvdXAudGVybWluYWxJbnN0YW5jZXMuaW5kZXhPZih0YXJnZXQpICsgKHNpZGUgPT09ICdhZnRlcicgPyAxIDogMCk7XG5cdFx0XHRncm91cC5tb3ZlSW5zdGFuY2Uoc291cmNlLCBpbmRleCwgc2lkZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSBldmVudHNcblx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5maXJlKHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfaW5pdEluc3RhbmNlTGlzdGVuZXJzKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGNvbnN0IGluc3RhbmNlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFuY2VEaXNwb3NhYmxlcy5hZGQoaW5zdGFuY2Uub25EaW1lbnNpb25zQ2hhbmdlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlRGltZW5zaW9ucy5maXJlKGluc3RhbmNlKTtcblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnMgJiYgdGhpcy5pc1Byb2Nlc3NTdXBwb3J0UmVnaXN0ZXJlZCkge1xuXHRcdFx0XHR0aGlzLl9zYXZlU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aW5zdGFuY2VEaXNwb3NhYmxlcy5hZGQoaW5zdGFuY2Uub25EaWRGb2N1cyh0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlLmZpcmUsIHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UpKTtcblx0XHRpbnN0YW5jZURpc3Bvc2FibGVzLmFkZChpbnN0YW5jZS5vblJlcXVlc3RBZGRJbnN0YW5jZVRvR3JvdXAoYXN5bmMgZSA9PiBhd2FpdCB0aGlzLl9hZGRJbnN0YW5jZVRvR3JvdXAoaW5zdGFuY2UsIGUpKSk7XG5cdFx0aW5zdGFuY2VEaXNwb3NhYmxlcy5hZGQoaW5zdGFuY2Uub25EaWRDaGFuZ2VTaGVsbFR5cGUoKCkgPT4gdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uVGVybWluYWw6JHtpbnN0YW5jZS5zaGVsbFR5cGV9YCkpKTtcblx0XHRpbnN0YW5jZURpc3Bvc2FibGVzLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUoaW5zdGFuY2UuY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ2FwYWJpbGl0eSwgKCgpID0+IHtcblx0XHRcdGlmIChpbnN0YW5jZS5jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25UZXJtaW5hbFNoZWxsSW50ZWdyYXRpb246JHtpbnN0YW5jZS5zaGVsbFR5cGV9YCk7XG5cdFx0XHR9XG5cdFx0fSkpKTtcblx0XHRjb25zdCBkaXNwb3NlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW5jZS5vbkRpc3Bvc2VkKCgpID0+IHtcblx0XHRcdGluc3RhbmNlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fc3RvcmUuZGVsZXRlKGRpc3Bvc2VMaXN0ZW5lcik7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWRkSW5zdGFuY2VUb0dyb3VwKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgZTogSVJlcXVlc3RBZGRJbnN0YW5jZVRvR3JvdXBFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsSWRlbnRpZmllciA9IHBhcnNlVGVybWluYWxVcmkoZS51cmkpO1xuXHRcdGlmICh0ZXJtaW5hbElkZW50aWZpZXIuaW5zdGFuY2VJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHNvdXJjZUluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCA9IHRoaXMuZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UoZS51cmkpO1xuXG5cdFx0Ly8gVGVybWluYWwgZnJvbSBhIGRpZmZlcmVudCB3aW5kb3dcblx0XHRpZiAoIXNvdXJjZUluc3RhbmNlKSB7XG5cdFx0XHRjb25zdCBhdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyA9IGF3YWl0IHRoaXMuX3ByaW1hcnlCYWNrZW5kPy5yZXF1ZXN0RGV0YWNoSW5zdGFuY2UodGVybWluYWxJZGVudGlmaWVyLndvcmtzcGFjZUlkLCB0ZXJtaW5hbElkZW50aWZpZXIuaW5zdGFuY2VJZCk7XG5cdFx0XHRpZiAoYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MpIHtcblx0XHRcdFx0c291cmNlSW5zdGFuY2UgPSBhd2FpdCB0aGlzLmNyZWF0ZVRlcm1pbmFsKHsgY29uZmlnOiB7IGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzIH0sIHJlc291cmNlOiBlLnVyaSB9KTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UubW92ZUluc3RhbmNlKHNvdXJjZUluc3RhbmNlLCBpbnN0YW5jZSwgZS5zaWRlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZpZXcgdGVybWluYWxzXG5cdFx0c291cmNlSW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZShlLnVyaSk7XG5cdFx0aWYgKHNvdXJjZUluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5tb3ZlSW5zdGFuY2Uoc291cmNlSW5zdGFuY2UsIGluc3RhbmNlLCBlLnNpZGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRlcm1pbmFsIGVkaXRvcnNcblx0XHRzb3VyY2VJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZShlLnVyaSk7XG5cdFx0aWYgKHNvdXJjZUluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLm1vdmVUb1Rlcm1pbmFsVmlldyhzb3VyY2VJbnN0YW5jZSwgaW5zdGFuY2UsIGUuc2lkZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdHJlZ2lzdGVyUHJvY2Vzc1N1cHBvcnQoaXNTdXBwb3J0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIWlzU3VwcG9ydGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Byb2Nlc3NTdXBwb3J0Q29udGV4dEtleS5zZXQoaXNTdXBwb3J0ZWQpO1xuXHRcdHRoaXMuX29uRGlkUmVnaXN0ZXJQcm9jZXNzU3VwcG9ydC5maXJlKCk7XG5cdH1cblxuXHQvLyBUT0RPOiBSZW1vdmUgdGhpcywgaXQgc2hvdWxkIGxpdmUgaW4gZ3JvdXAvZWRpdG9yIHNlcnZpb2NlXG5cdHByaXZhdGUgX2dldEluZGV4RnJvbUlkKHRlcm1pbmFsSWQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IHRlcm1pbmFsSW5kZXggPSAtMTtcblx0XHR0aGlzLmluc3RhbmNlcy5mb3JFYWNoKCh0ZXJtaW5hbEluc3RhbmNlLCBpKSA9PiB7XG5cdFx0XHRpZiAodGVybWluYWxJbnN0YW5jZS5pbnN0YW5jZUlkID09PSB0ZXJtaW5hbElkKSB7XG5cdFx0XHRcdHRlcm1pbmFsSW5kZXggPSBpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmICh0ZXJtaW5hbEluZGV4ID09PSAtMSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUZXJtaW5hbCB3aXRoIElEICR7dGVybWluYWxJZH0gZG9lcyBub3QgZXhpc3QgKGhhcyBpdCBhbHJlYWR5IGJlZW4gZGlzcG9zZWQ/KWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVybWluYWxJbmRleDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfc2hvd1Rlcm1pbmFsQ2xvc2VDb25maXJtYXRpb24oc2luZ2xlVGVybWluYWw/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRjb25zdCBmb3JlZ3JvdW5kSW5zdGFuY2VzID0gdGhpcy5mb3JlZ3JvdW5kSW5zdGFuY2VzO1xuXHRcdGlmIChmb3JlZ3JvdW5kSW5zdGFuY2VzLmxlbmd0aCA9PT0gMSB8fCBzaW5nbGVUZXJtaW5hbCkge1xuXHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgndGVybWluYWxTZXJ2aWNlLnRlcm1pbmFsQ2xvc2VDb25maXJtYXRpb25TaW5ndWxhcicsIFwiRG8geW91IHdhbnQgdG8gdGVybWluYXRlIHRoZSBhY3RpdmUgdGVybWluYWwgc2Vzc2lvbj9cIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3Rlcm1pbmFsU2VydmljZS50ZXJtaW5hbENsb3NlQ29uZmlybWF0aW9uUGx1cmFsJywgXCJEbyB5b3Ugd2FudCB0byB0ZXJtaW5hdGUgdGhlIHswfSBhY3RpdmUgdGVybWluYWwgc2Vzc2lvbnM/XCIsIGZvcmVncm91bmRJbnN0YW5jZXMubGVuZ3RoKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAndGVybWluYXRlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVGVybWluYXRlXCIpXG5cdFx0fSk7XG5cdFx0cmV0dXJuICFjb25maXJtZWQ7XG5cdH1cblxuXHRnZXREZWZhdWx0SW5zdGFuY2VIb3N0KCk6IElUZXJtaW5hbEluc3RhbmNlSG9zdCB7XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZGVmYXVsdExvY2F0aW9uID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlO1xuXHR9XG5cblx0YXN5bmMgZ2V0SW5zdGFuY2VIb3N0KGxvY2F0aW9uOiBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlSG9zdD4ge1xuXHRcdGlmIChsb2NhdGlvbikge1xuXHRcdFx0aWYgKGxvY2F0aW9uID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgbG9jYXRpb24gPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdGlmIChoYXNLZXkobG9jYXRpb24sIHsgdmlld0NvbHVtbjogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2U7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzS2V5KGxvY2F0aW9uLCB7IHBhcmVudFRlcm1pbmFsOiB0cnVlIH0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIChhd2FpdCBsb2NhdGlvbi5wYXJlbnRUZXJtaW5hbCkudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvciA/IHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZSA6IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlVGVybWluYWwob3B0aW9ucz86IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0Ly8gQXdhaXQgdGhlIGluaXRpYWxpemF0aW9uIG9mIGF2YWlsYWJsZSBwcm9maWxlcyBhcyBsb25nIGFzIHRoaXMgaXMgbm90IGEgcHR5IHRlcm1pbmFsIG9yIGFcblx0XHQvLyBsb2NhbCB0ZXJtaW5hbCBpbiBhIHJlbW90ZSB3b3Jrc3BhY2UgYXMgcHJvZmlsZSB3b24ndCBiZSB1c2VkIGluIHRob3NlIGNhc2VzIGFuZCB0aGVzZVxuXHRcdC8vIHRlcm1pbmFscyBuZWVkIHRvIGJlIGxhdW5jaGVkIGJlZm9yZSByZW1vdGUgY29ubmVjdGlvbnMgYXJlIGVzdGFibGlzaGVkLlxuXHRcdGNvbnN0IGlzTG9jYWxJblJlbW90ZVRlcm1pbmFsID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKSAmJiBVUkkuaXNVcmkob3B0aW9ucz8uY3dkKSAmJiBvcHRpb25zPy5jd2Quc2NoZW1lID09PSBTY2hlbWFzLmZpbGU7XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuYXZhaWxhYmxlUHJvZmlsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb25zdCBpc1B0eVRlcm1pbmFsID0gb3B0aW9ucz8uY29uZmlnICYmIGhhc0tleShvcHRpb25zLmNvbmZpZywgeyBjdXN0b21QdHlJbXBsZW1lbnRhdGlvbjogdHJ1ZSB9KTtcblx0XHRcdGlmICghaXNQdHlUZXJtaW5hbCAmJiAhaXNMb2NhbEluUmVtb3RlVGVybWluYWwpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb25TdGF0ZSA9PT0gVGVybWluYWxDb25uZWN0aW9uU3RhdGUuQ29ubmVjdGluZykge1xuXHRcdFx0XHRcdG1hcmsoYGNvZGUvdGVybWluYWwvd2lsbEdldFByb2ZpbGVzYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5wcm9maWxlc1JlYWR5O1xuXHRcdFx0XHRpZiAodGhpcy5fY29ubmVjdGlvblN0YXRlID09PSBUZXJtaW5hbENvbm5lY3Rpb25TdGF0ZS5Db25uZWN0aW5nKSB7XG5cdFx0XHRcdFx0bWFyayhgY29kZS90ZXJtaW5hbC9kaWRHZXRQcm9maWxlc2ApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGNvbmZpZyA9IG9wdGlvbnM/LmNvbmZpZztcblx0XHRpZiAoIWNvbmZpZyAmJiBpc0xvY2FsSW5SZW1vdGVUZXJtaW5hbCkge1xuXHRcdFx0Y29uc3QgYmFja2VuZCA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmdldEJhY2tlbmQodW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGV4ZWN1dGFibGUgPSBhd2FpdCBiYWNrZW5kPy5nZXREZWZhdWx0U3lzdGVtU2hlbGwoKTtcblx0XHRcdGlmIChleGVjdXRhYmxlKSB7XG5cdFx0XHRcdGNvbmZpZyA9IHsgZXhlY3V0YWJsZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRjb25maWcgPSB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmdldERlZmF1bHRQcm9maWxlKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNoZWxsTGF1bmNoQ29uZmlnID0gY29uZmlnICYmIGhhc0tleShjb25maWcsIHsgZXh0ZW5zaW9uSWRlbnRpZmllcjogdHJ1ZSB9KSA/IHt9IDogdGhpcy5fdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuY29udmVydFByb2ZpbGVUb1NoZWxsTGF1bmNoQ29uZmlnKGNvbmZpZyB8fCB7fSk7XG5cblx0XHQvLyBHZXQgdGhlIGNvbnRyaWJ1dGVkIHByb2ZpbGUgaWYgaXQgd2FzIHByb3ZpZGVkXG5cdFx0Y29uc3QgY29udHJpYnV0ZWRQcm9maWxlID0gb3B0aW9ucz8uc2tpcENvbnRyaWJ1dGVkUHJvZmlsZUNoZWNrID8gdW5kZWZpbmVkIDogYXdhaXQgdGhpcy5fZ2V0Q29udHJpYnV0ZWRQcm9maWxlKHNoZWxsTGF1bmNoQ29uZmlnLCBvcHRpb25zKTtcblxuXHRcdGNvbnN0IHNwbGl0QWN0aXZlVGVybWluYWwgPSB0eXBlb2Ygb3B0aW9ucz8ubG9jYXRpb24gPT09ICdvYmplY3QnICYmIGhhc0tleShvcHRpb25zLmxvY2F0aW9uLCB7IHNwbGl0QWN0aXZlVGVybWluYWw6IHRydWUgfSlcblx0XHRcdD8gb3B0aW9ucy5sb2NhdGlvbi5zcGxpdEFjdGl2ZVRlcm1pbmFsXG5cdFx0XHQ6IHR5cGVvZiBvcHRpb25zPy5sb2NhdGlvbiA9PT0gJ29iamVjdCcgPyBoYXNLZXkob3B0aW9ucy5sb2NhdGlvbiwgeyBwYXJlbnRUZXJtaW5hbDogdHJ1ZSB9KSA6IGZhbHNlO1xuXG5cdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZUN3ZChzaGVsbExhdW5jaENvbmZpZywgc3BsaXRBY3RpdmVUZXJtaW5hbCwgb3B0aW9ucyk7XG5cblx0XHQvLyBMYXVuY2ggdGhlIGNvbnRyaWJ1dGVkIHByb2ZpbGVcblx0XHQvLyBJZiBpdCdzIGEgY3VzdG9tIHB0eSBpbXBsZW1lbnRhdGlvbiwgd2UgZGlkIG5vdCBhd2FpdCB0aGUgcHJvZmlsZXMgcmVhZHksIHNvXG5cdFx0Ly8gd2UgY2Fubm90IGxhdW5jaCB0aGUgY29udHJpYnV0ZWQgcHJvZmlsZSBhbmQgZG9pbmcgc28gd291bGQgY2F1c2UgYW4gZXJyb3Jcblx0XHRpZiAoIXNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uICYmIGNvbnRyaWJ1dGVkUHJvZmlsZSkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRMb2NhdGlvbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUxvY2F0aW9uKG9wdGlvbnM/LmxvY2F0aW9uKTtcblx0XHRcdGxldCBsb2NhdGlvbjogVGVybWluYWxMb2NhdGlvbiB8IHsgdmlld0NvbHVtbjogbnVtYmVyOyBwcmVzZXJ2ZVN0YXRlPzogYm9vbGVhbiB9IHwgeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc3BsaXRBY3RpdmVUZXJtaW5hbCkge1xuXHRcdFx0XHRsb2NhdGlvbiA9IHJlc29sdmVkTG9jYXRpb24gPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yID8geyB2aWV3Q29sdW1uOiBTSURFX0dST1VQIH0gOiB7IHNwbGl0QWN0aXZlVGVybWluYWw6IHRydWUgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvY2F0aW9uID0gdHlwZW9mIG9wdGlvbnM/LmxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkob3B0aW9ucy5sb2NhdGlvbiwgeyB2aWV3Q29sdW1uOiB0cnVlIH0pID8gb3B0aW9ucy5sb2NhdGlvbiA6IHJlc29sdmVkTG9jYXRpb247XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlKGNvbnRyaWJ1dGVkUHJvZmlsZS5leHRlbnNpb25JZGVudGlmaWVyLCBjb250cmlidXRlZFByb2ZpbGUuaWQsIHtcblx0XHRcdFx0aWNvbjogY29udHJpYnV0ZWRQcm9maWxlLmljb24sXG5cdFx0XHRcdGNvbG9yOiBjb250cmlidXRlZFByb2ZpbGUuY29sb3IsXG5cdFx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0XHRjd2Q6IHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCxcblx0XHRcdFx0dGl0bGVUZW1wbGF0ZTogY29udHJpYnV0ZWRQcm9maWxlLnRpdGxlVGVtcGxhdGUsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGluc3RhbmNlSG9zdCA9IHJlc29sdmVkTG9jYXRpb24gPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yID8gdGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlIDogdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2U7XG5cdFx0XHQvLyBUT0RPQG1lZ2Fucm9nZ2U6IFRoaXMgcmV0dXJucyB1bmRlZmluZWQgaW4gdGhlIHJlbW90ZSAmIHdlYiBzbW9rZSB0ZXN0cyBidXQgdGhlIGZ1bmN0aW9uXG5cdFx0XHQvLyBkb2VzIG5vdCByZXR1cm4gdW5kZWZpbmVkLiBUaGlzIHNob3VsZCBiZSBoYW5kbGVkIGNvcnJlY3RseS5cblx0XHRcdGNvbnN0IGluc3RhbmNlID0gaW5zdGFuY2VIb3N0Lmluc3RhbmNlc1tpbnN0YW5jZUhvc3QuaW5zdGFuY2VzLmxlbmd0aCAtIDFdO1xuXHRcdFx0YXdhaXQgaW5zdGFuY2U/LmZvY3VzV2hlblJlYWR5KCk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEhhc0JlZW5DcmVhdGVkLnNldCh0cnVlKTtcblx0XHRcdHJldHVybiBpbnN0YW5jZTtcblx0XHR9XG5cblx0XHRpZiAoIXNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uICYmICF0aGlzLmlzUHJvY2Vzc1N1cHBvcnRSZWdpc3RlcmVkKSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZExvY2F0aW9uID0gYXdhaXQgdGhpcy5yZXNvbHZlTG9jYXRpb24ob3B0aW9ucz8ubG9jYXRpb24pO1xuXHRcdFx0bGV0IGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uIHwgeyB2aWV3Q29sdW1uOiBudW1iZXI7IHByZXNlcnZlU3RhdGU/OiBib29sZWFuIH0gfCB7IHNwbGl0QWN0aXZlVGVybWluYWw6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzcGxpdEFjdGl2ZVRlcm1pbmFsKSB7XG5cdFx0XHRcdGxvY2F0aW9uID0gcmVzb2x2ZWRMb2NhdGlvbiA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IgPyB7IHZpZXdDb2x1bW46IFNJREVfR1JPVVAgfSA6IHsgc3BsaXRBY3RpdmVUZXJtaW5hbDogdHJ1ZSB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9jYXRpb24gPSB0eXBlb2Ygb3B0aW9ucz8ubG9jYXRpb24gPT09ICdvYmplY3QnICYmIGhhc0tleShvcHRpb25zLmxvY2F0aW9uLCB7IHZpZXdDb2x1bW46IHRydWUgfSkgPyBvcHRpb25zLmxvY2F0aW9uIDogcmVzb2x2ZWRMb2NhdGlvbjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluc3RhbmNlSG9zdCA9IHJlc29sdmVkTG9jYXRpb24gPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yID8gdGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlIDogdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2U7XG5cdFx0XHRmb3IgKGNvbnN0IGZhbGxiYWNrUHJvZmlsZSBvZiB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmNvbnRyaWJ1dGVkUHJvZmlsZXMpIHtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2VDb3VudCA9IGluc3RhbmNlSG9zdC5pbnN0YW5jZXMubGVuZ3RoO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlKGZhbGxiYWNrUHJvZmlsZS5leHRlbnNpb25JZGVudGlmaWVyLCBmYWxsYmFja1Byb2ZpbGUuaWQsIHtcblx0XHRcdFx0XHRpY29uOiBmYWxsYmFja1Byb2ZpbGUuaWNvbixcblx0XHRcdFx0XHRjb2xvcjogZmFsbGJhY2tQcm9maWxlLmNvbG9yLFxuXHRcdFx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0XHRcdGN3ZDogc2hlbGxMYXVuY2hDb25maWcuY3dkLFxuXHRcdFx0XHRcdHRpdGxlVGVtcGxhdGU6IGZhbGxiYWNrUHJvZmlsZS50aXRsZVRlbXBsYXRlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBpbnN0YW5jZUhvc3QuaW5zdGFuY2VzW2luc3RhbmNlQ291bnRdO1xuXHRcdFx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgaW5zdGFuY2UuZm9jdXNXaGVuUmVhZHkoKTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxIYXNCZWVuQ3JlYXRlZC5zZXQodHJ1ZSk7XG5cdFx0XHRcdHJldHVybiBpbnN0YW5jZTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGNyZWF0ZSB0ZXJtaW5hbCB3aGVuIHByb2Nlc3Mgc3VwcG9ydCBpcyBub3QgcmVnaXN0ZXJlZCcpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2V2YWx1YXRlTG9jYWxDd2Qoc2hlbGxMYXVuY2hDb25maWcpO1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gYXdhaXQgdGhpcy5yZXNvbHZlTG9jYXRpb24ob3B0aW9ucz8ubG9jYXRpb24pIHx8IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZGVmYXVsdExvY2F0aW9uO1xuXG5cdFx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmhpZGVGcm9tVXNlcikge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbEluc3RhbmNlU2VydmljZS5jcmVhdGVJbnN0YW5jZShzaGVsbExhdW5jaENvbmZpZywgbG9jYXRpb24pO1xuXHRcdFx0dGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXMucHVzaCh7IGluc3RhbmNlLCB0ZXJtaW5hbExvY2F0aW9uT3B0aW9uczogb3B0aW9ucz8ubG9jYXRpb24gfSk7XG5cdFx0XHR0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbERpc3Bvc2FibGVzLnNldChpbnN0YW5jZS5pbnN0YW5jZUlkLCBpbnN0YW5jZS5vbkRpc3Bvc2VkKGluc3RhbmNlID0+IHRoaXMuX29uQmFja2dyb3VuZFRlcm1pbmFsRGlzcG9zZWQoaW5zdGFuY2UpKSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlKCk7XG5cdFx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyZW50ID0gYXdhaXQgdGhpcy5fZ2V0U3BsaXRQYXJlbnQob3B0aW9ucz8ubG9jYXRpb24pO1xuXHRcdHRoaXMuX3Rlcm1pbmFsSGFzQmVlbkNyZWF0ZWQuc2V0KHRydWUpO1xuXHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KCdvblRlcm1pbmFsOionKTtcblx0XHRsZXQgaW5zdGFuY2U7XG5cdFx0aWYgKHBhcmVudCkge1xuXHRcdFx0aW5zdGFuY2UgPSBhd2FpdCB0aGlzLl9zcGxpdFRlcm1pbmFsKHNoZWxsTGF1bmNoQ29uZmlnLCBsb2NhdGlvbiwgcGFyZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5zdGFuY2UgPSB0aGlzLl9jcmVhdGVUZXJtaW5hbChzaGVsbExhdW5jaENvbmZpZywgbG9jYXRpb24sIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRpZiAoaW5zdGFuY2Uuc2hlbGxUeXBlKSB7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25UZXJtaW5hbDoke2luc3RhbmNlLnNoZWxsVHlwZX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVBbmRGb2N1c1Rlcm1pbmFsKG9wdGlvbnM/OiBJQ3JlYXRlVGVybWluYWxPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgdGhpcy5jcmVhdGVUZXJtaW5hbChvcHRpb25zKTtcblx0XHR0aGlzLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRhd2FpdCBpbnN0YW5jZS5mb2N1c1doZW5SZWFkeSgpO1xuXHRcdHJldHVybiBpbnN0YW5jZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldENvbnRyaWJ1dGVkUHJvZmlsZShzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLCBvcHRpb25zPzogSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucyk6IFByb21pc2U8SUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChvcHRpb25zPy5jb25maWcgJiYgaGFzS2V5KG9wdGlvbnMuY29uZmlnLCB7IGV4dGVuc2lvbklkZW50aWZpZXI6IHRydWUgfSkpIHtcblx0XHRcdHJldHVybiBvcHRpb25zLmNvbmZpZztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5nZXRDb250cmlidXRlZERlZmF1bHRQcm9maWxlKHNoZWxsTGF1bmNoQ29uZmlnKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZURldGFjaGVkVGVybWluYWwob3B0aW9uczogSURldGFjaGVkWFRlcm1PcHRpb25zKTogUHJvbWlzZTxJRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0Y29uc3QgY3RvciA9IGF3YWl0IFRlcm1pbmFsSW5zdGFuY2UuZ2V0WHRlcm1Db25zdHJ1Y3Rvcih0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IG9wdGlvbnMuY2FwYWJpbGl0aWVzID8/IG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpO1xuXHRcdGNvbnN0IHh0ZXJtID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoWHRlcm1UZXJtaW5hbCwgdW5kZWZpbmVkLCBjdG9yLCB7XG5cdFx0XHRjb2xzOiBvcHRpb25zLmNvbHMsXG5cdFx0XHRyb3dzOiBvcHRpb25zLnJvd3MsXG5cdFx0XHR4dGVybUNvbG9yUHJvdmlkZXI6IG9wdGlvbnMuY29sb3JQcm92aWRlcixcblx0XHRcdGNhcGFiaWxpdGllcyxcblx0XHRcdGRpc2FibGVPdmVydmlld1J1bGVyOiBvcHRpb25zLmRpc2FibGVPdmVydmlld1J1bGVyLFxuXHRcdFx0ZGV0YWNoZWQ6IHRydWUsXG5cdFx0fSwgdW5kZWZpbmVkKTtcblxuXHRcdGlmIChvcHRpb25zLnJlYWRvbmx5KSB7XG5cdFx0XHR4dGVybS5yYXcuYXR0YWNoQ3VzdG9tS2V5RXZlbnRIYW5kbGVyKCgpID0+IGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YW5jZSA9IG5ldyBEZXRhY2hlZFRlcm1pbmFsKHh0ZXJtLCB7IC4uLm9wdGlvbnMsIGNhcGFiaWxpdGllcyB9LCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fZGV0YWNoZWRYdGVybXMuYWRkKGluc3RhbmNlKTtcblx0XHQvLyBFbnN1cmUgY2VudHJhbGl6ZWQgdGhlbWUvY29uZmlnIGxpc3RlbmVycyB1cGRhdGUgdGhpcyBkZXRhY2hlZCB0ZXJtaW5hbFxuXHRcdHRoaXMuX2Vuc3VyZURldGFjaGVkVGVybWluYWxMaXN0ZW5lcnMoKTtcblx0XHRjb25zdCBsID0geHRlcm0ub25EaWREaXNwb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuX2RldGFjaGVkWHRlcm1zLmRlbGV0ZShpbnN0YW5jZSk7XG5cdFx0XHRsLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBpbnN0YW5jZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBzaW5nbGUgc2V0IG9mIGdsb2JhbCBzZXJ2aWNlIGxpc3RlbmVycyAodGhlbWUvY29uZmlnL2xvZy1sZXZlbFxuXHQgKiBjaGFuZ2VzKSB0aGF0IGZvcndhcmQgdXBkYXRlcyB0byBhbGwgZGV0YWNoZWQgeHRlcm0gaW5zdGFuY2VzLiBUaGlzIGF2b2lkc1xuXHQgKiBlYWNoIGRldGFjaGVkIHRlcm1pbmFsIHJlZ2lzdGVyaW5nIGl0cyBvd24gbGlzdGVuZXIgb24gZ2xvYmFsIHNpbmdsZXRvbnMuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVEZXRhY2hlZFRlcm1pbmFsTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kZXRhY2hlZExpc3RlbmVyc1JlZ2lzdGVyZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGV0YWNoZWRMaXN0ZW5lcnNSZWdpc3RlcmVkID0gdHJ1ZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fZGV0YWNoZWRYdGVybXMpIHtcblx0XHRcdFx0aW5zdGFuY2UueHRlcm0udXBkYXRlVGhlbWUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0Y29uc3Qgc2hvdWxkVXBkYXRlQ29uZmlnID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbigndGVybWluYWwuaW50ZWdyYXRlZCcpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHknKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5JykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLm11bHRpQ3Vyc29yTW9kaWZpZXInKTtcblx0XHRcdGNvbnN0IHNob3VsZFVwZGF0ZVRoZW1lID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uRGVjb3JhdGlvbnNFbmFibGVkKTtcblx0XHRcdGlmIChzaG91bGRVcGRhdGVDb25maWcgfHwgc2hvdWxkVXBkYXRlVGhlbWUpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl9kZXRhY2hlZFh0ZXJtcykge1xuXHRcdFx0XHRcdGlmIChzaG91bGRVcGRhdGVDb25maWcpIHtcblx0XHRcdFx0XHRcdGluc3RhbmNlLnh0ZXJtLnVwZGF0ZUNvbmZpZygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc2hvdWxkVXBkYXRlVGhlbWUpIHtcblx0XHRcdFx0XHRcdGluc3RhbmNlLnh0ZXJtLnVwZGF0ZVRoZW1lKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xvZ1NlcnZpY2Uub25EaWRDaGFuZ2VMb2dMZXZlbCgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX2RldGFjaGVkWHRlcm1zKSB7XG5cdFx0XHRcdGluc3RhbmNlLnh0ZXJtLnVwZGF0ZUxvZ0xldmVsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUN3ZChzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLCBzcGxpdEFjdGl2ZVRlcm1pbmFsOiBib29sZWFuLCBvcHRpb25zPzogSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN3ZCA9IHNoZWxsTGF1bmNoQ29uZmlnLmN3ZDtcblx0XHRpZiAoIWN3ZCkge1xuXHRcdFx0aWYgKG9wdGlvbnM/LmN3ZCkge1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5jd2QgPSBvcHRpb25zLmN3ZDtcblx0XHRcdH0gZWxzZSBpZiAoc3BsaXRBY3RpdmVUZXJtaW5hbCAmJiBvcHRpb25zPy5sb2NhdGlvbikge1xuXHRcdFx0XHRsZXQgcGFyZW50ID0gdGhpcy5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdFx0aWYgKHR5cGVvZiBvcHRpb25zLmxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkob3B0aW9ucy5sb2NhdGlvbiwgeyBwYXJlbnRUZXJtaW5hbDogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdHBhcmVudCA9IGF3YWl0IG9wdGlvbnMubG9jYXRpb24ucGFyZW50VGVybWluYWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFwYXJlbnQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBzcGxpdCB3aXRob3V0IGFuIGFjdGl2ZSBpbnN0YW5jZScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCA9IGF3YWl0IGdldEN3ZEZvclNwbGl0KHBhcmVudCwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycywgdGhpcy5fY29tbWFuZFNlcnZpY2UsIHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NwbGl0VGVybWluYWwoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZywgbG9jYXRpb246IFRlcm1pbmFsTG9jYXRpb24sIHBhcmVudDogSVRlcm1pbmFsSW5zdGFuY2UpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0bGV0IGluc3RhbmNlO1xuXHRcdC8vIFVzZSB0aGUgVVJJIGZyb20gdGhlIGJhc2UgaW5zdGFuY2UgaWYgaXQgZXhpc3RzLCB0aGlzIHdpbGwgY29ycmVjdGx5IHNwbGl0IGxvY2FsIHRlcm1pbmFsc1xuXHRcdGlmICh0eXBlb2Ygc2hlbGxMYXVuY2hDb25maWcuY3dkICE9PSAnb2JqZWN0JyAmJiB0eXBlb2YgcGFyZW50LnNoZWxsTGF1bmNoQ29uZmlnLmN3ZCA9PT0gJ29iamVjdCcpIHtcblx0XHRcdGxldCBwYXRoID0gc2hlbGxMYXVuY2hDb25maWcuY3dkIHx8IHBhcmVudC5zaGVsbExhdW5jaENvbmZpZy5jd2QucGF0aDtcblx0XHRcdGlmIChwYXJlbnQuc2hlbGxMYXVuY2hDb25maWcuY3dkLmF1dGhvcml0eSAmJiBwYXRoICYmIHBhdGhbMF0gIT09ICcvJykge1xuXHRcdFx0XHRwYXRoID0gJy8nICsgcGF0aDtcblx0XHRcdH1cblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCA9IFVSSS5mcm9tKHtcblx0XHRcdFx0c2NoZW1lOiBwYXJlbnQuc2hlbGxMYXVuY2hDb25maWcuY3dkLnNjaGVtZSxcblx0XHRcdFx0YXV0aG9yaXR5OiBwYXJlbnQuc2hlbGxMYXVuY2hDb25maWcuY3dkLmF1dGhvcml0eSxcblx0XHRcdFx0cGF0aFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmIChsb2NhdGlvbiA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IgfHwgcGFyZW50LnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdGluc3RhbmNlID0gYXdhaXQgdGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlLnNwbGl0SW5zdGFuY2UocGFyZW50LCBzaGVsbExhdW5jaENvbmZpZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0R3JvdXBGb3JJbnN0YW5jZShwYXJlbnQpO1xuXHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBzcGxpdCBhIHRlcm1pbmFsIHdpdGhvdXQgYSBncm91cCAoaW5zdGFuY2VJZDogJHtwYXJlbnQuaW5zdGFuY2VJZH0sIHRpdGxlOiAke3BhcmVudC50aXRsZX0pYCk7XG5cdFx0XHR9XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy5wYXJlbnRUZXJtaW5hbElkID0gcGFyZW50Lmluc3RhbmNlSWQ7XG5cdFx0XHRpbnN0YW5jZSA9IGdyb3VwLnNwbGl0KHNoZWxsTGF1bmNoQ29uZmlnKTtcblx0XHR9XG5cdFx0cmV0dXJuIGluc3RhbmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVGVybWluYWwoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZywgbG9jYXRpb246IFRlcm1pbmFsTG9jYXRpb24sIG9wdGlvbnM/OiBJQ3JlYXRlVGVybWluYWxPcHRpb25zKTogSVRlcm1pbmFsSW5zdGFuY2Uge1xuXHRcdGxldCBpbnN0YW5jZTtcblx0XHRpZiAobG9jYXRpb24gPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHRpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKHNoZWxsTGF1bmNoQ29uZmlnLCBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcik7XG5cdFx0XHRpZiAoIXNoZWxsTGF1bmNoQ29uZmlnLmhpZGVGcm9tVXNlcikge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JPcHRpb25zID0gdGhpcy5fZ2V0RWRpdG9yT3B0aW9ucyhvcHRpb25zPy5sb2NhdGlvbik7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGluc3RhbmNlLCBlZGl0b3JPcHRpb25zKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVE9ETzogcGFzcyByZXNvdXJjZT9cblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuY3JlYXRlR3JvdXAoc2hlbGxMYXVuY2hDb25maWcpO1xuXHRcdFx0aW5zdGFuY2UgPSBncm91cC50ZXJtaW5hbEluc3RhbmNlc1swXTtcblx0XHR9XG5cdFx0cmV0dXJuIGluc3RhbmNlO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUxvY2F0aW9uKGxvY2F0aW9uPzogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zKTogUHJvbWlzZTxUZXJtaW5hbExvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGxvY2F0aW9uICYmIHR5cGVvZiBsb2NhdGlvbiA9PT0gJ29iamVjdCcpIHtcblx0XHRcdGlmIChoYXNLZXkobG9jYXRpb24sIHsgcGFyZW50VGVybWluYWw6IHRydWUgfSkpIHtcblx0XHRcdFx0Ly8gc2luY2Ugd2UgZG9uJ3Qgc2V0IHRoZSB0YXJnZXQgdW5sZXNzIGl0J3MgYW4gZWRpdG9yIHRlcm1pbmFsLCB0aGlzIGlzIG5lY2Vzc2FyeVxuXHRcdFx0XHRjb25zdCBwYXJlbnRUZXJtaW5hbCA9IGF3YWl0IGxvY2F0aW9uLnBhcmVudFRlcm1pbmFsO1xuXHRcdFx0XHRyZXR1cm4gIXBhcmVudFRlcm1pbmFsLnRhcmdldCA/IFRlcm1pbmFsTG9jYXRpb24uUGFuZWwgOiBwYXJlbnRUZXJtaW5hbC50YXJnZXQ7XG5cdFx0XHR9IGVsc2UgaWYgKGhhc0tleShsb2NhdGlvbiwgeyB2aWV3Q29sdW1uOiB0cnVlIH0pKSB7XG5cdFx0XHRcdHJldHVybiBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcjtcblx0XHRcdH0gZWxzZSBpZiAoaGFzS2V5KGxvY2F0aW9uLCB7IHNwbGl0QWN0aXZlVGVybWluYWw6IHRydWUgfSkpIHtcblx0XHRcdFx0Ly8gc2luY2Ugd2UgZG9uJ3Qgc2V0IHRoZSB0YXJnZXQgdW5sZXNzIGl0J3MgYW4gZWRpdG9yIHRlcm1pbmFsLCB0aGlzIGlzIG5lY2Vzc2FyeVxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuX2FjdGl2ZUluc3RhbmNlPy50YXJnZXQgPyBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIDogdGhpcy5fYWN0aXZlSW5zdGFuY2U/LnRhcmdldDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxvY2F0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U3BsaXRQYXJlbnQobG9jYXRpb24/OiBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGxvY2F0aW9uICYmIHR5cGVvZiBsb2NhdGlvbiA9PT0gJ29iamVjdCcgJiYgaGFzS2V5KGxvY2F0aW9uLCB7IHBhcmVudFRlcm1pbmFsOiB0cnVlIH0pKSB7XG5cdFx0XHRyZXR1cm4gbG9jYXRpb24ucGFyZW50VGVybWluYWw7XG5cdFx0fSBlbHNlIGlmIChsb2NhdGlvbiAmJiB0eXBlb2YgbG9jYXRpb24gPT09ICdvYmplY3QnICYmIGhhc0tleShsb2NhdGlvbiwgeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiB0cnVlIH0pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hY3RpdmVJbnN0YW5jZTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVkaXRvck9wdGlvbnMobG9jYXRpb24/OiBJVGVybWluYWxMb2NhdGlvbk9wdGlvbnMpOiBUZXJtaW5hbEVkaXRvckxvY2F0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAobG9jYXRpb24gJiYgdHlwZW9mIGxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkobG9jYXRpb24sIHsgdmlld0NvbHVtbjogdHJ1ZSB9KSkge1xuXHRcdFx0Ly8gVGVybWluYWwtc3BlY2lmaWMgd29ya2Fyb3VuZCB0byByZXNvbHZlIHRoZSBhY3RpdmUgZ3JvdXAgaW4gYXV4aWxpYXJ5IHdpbmRvd3MgdG9cblx0XHRcdC8vIG92ZXJyaWRlIHRoZSBsb2NrZWQgZWRpdG9yIGJlaGF2aW9yLlxuXHRcdFx0aWYgKGxvY2F0aW9uLnZpZXdDb2x1bW4gPT09IEFDVElWRV9HUk9VUCAmJiBpc0F1eGlsaWFyeVdpbmRvdyhnZXRBY3RpdmVXaW5kb3coKSkpIHtcblx0XHRcdFx0bG9jYXRpb24udmlld0NvbHVtbiA9IHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXAuaWQ7XG5cdFx0XHRcdHJldHVybiBsb2NhdGlvbjtcblx0XHRcdH1cblx0XHRcdGxvY2F0aW9uLnZpZXdDb2x1bW4gPSBjb2x1bW5Ub0VkaXRvckdyb3VwKHRoaXMuX2VkaXRvckdyb3Vwc1NlcnZpY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsb2NhdGlvbi52aWV3Q29sdW1uKTtcblx0XHRcdHJldHVybiBsb2NhdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2V2YWx1YXRlTG9jYWxDd2Qoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZykge1xuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFkZCB3ZWxjb21lIG1lc3NhZ2UgYW5kIHRpdGxlIGFubm90YXRpb24gZm9yIGxvY2FsIHRlcm1pbmFscyBsYXVuY2hlZCB3aXRoaW4gcmVtb3RlIG9yXG5cdFx0Ly8gdmlydHVhbCB3b3Jrc3BhY2VzXG5cdFx0aWYgKCFpc1N0cmluZyhzaGVsbExhdW5jaENvbmZpZy5jd2QpICYmIHNoZWxsTGF1bmNoQ29uZmlnLmN3ZD8uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdGlmIChWaXJ0dWFsV29ya3NwYWNlQ29udGV4dC5nZXRWYWx1ZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQgPSBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwobmxzLmxvY2FsaXplKCdsb2NhbFRlcm1pbmFsVmlydHVhbFdvcmtzcGFjZScsIFwiVGhpcyBzaGVsbCBpcyBvcGVuIHRvIGEgezB9bG9jYWx7MX0gZm9sZGVyLCBOT1QgdG8gdGhlIHZpcnR1YWwgZm9sZGVyXCIsICdcXHgxYlszbScsICdcXHgxYlsyM20nKSwgeyBleGNsdWRlTGVhZGluZ05ld0xpbmU6IHRydWUsIGxvdWRGb3JtYXR0aW5nOiB0cnVlIH0pO1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy50eXBlID0gJ0xvY2FsJztcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKSkge1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dCA9IGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbChubHMubG9jYWxpemUoJ2xvY2FsVGVybWluYWxSZW1vdGUnLCBcIlRoaXMgc2hlbGwgaXMgcnVubmluZyBvbiB5b3VyIHswfWxvY2FsezF9IG1hY2hpbmUsIE5PVCBvbiB0aGUgY29ubmVjdGVkIHJlbW90ZSBtYWNoaW5lXCIsICdcXHgxYlszbScsICdcXHgxYlsyM20nKSwgeyBleGNsdWRlTGVhZGluZ05ld0xpbmU6IHRydWUsIGxvdWRGb3JtYXR0aW5nOiB0cnVlIH0pO1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy50eXBlID0gJ0xvY2FsJztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRtb3ZlVG9CYWNrZ3JvdW5kKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdC8vIEFscmVhZHkgYmFja2dyb3VuZGVkXG5cdFx0aWYgKHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsSW5zdGFuY2VzLnNvbWUoYmcgPT4gYmcuaW5zdGFuY2UgPT09IGluc3RhbmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBmcm9tIGl0cyBjdXJyZW50IGxvY2F0aW9uIChwYW5lbCBncm91cCBvciBlZGl0b3IpXG5cdFx0aWYgKGluc3RhbmNlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5kZXRhY2hJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0R3JvdXBGb3JJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGdyb3VwLnJlbW92ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHR9XG5cblx0XHRpbnN0YW5jZS5kZXRhY2hGcm9tRWxlbWVudCgpO1xuXG5cdFx0Ly8gVHJhY2sgaW4gYmFja2dyb3VuZFxuXHRcdHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsSW5zdGFuY2VzLnB1c2goeyBpbnN0YW5jZSwgdGVybWluYWxMb2NhdGlvbk9wdGlvbnM6IGluc3RhbmNlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IgPyB7IHZpZXdDb2x1bW46IEFDVElWRV9HUk9VUCB9IDogdW5kZWZpbmVkIH0pO1xuXHRcdHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsRGlzcG9zYWJsZXMuc2V0KGluc3RhbmNlLmluc3RhbmNlSWQsIGluc3RhbmNlLm9uRGlzcG9zZWQoaW5zdGFuY2UgPT4gdGhpcy5fb25CYWNrZ3JvdW5kVGVybWluYWxEaXNwb3NlZChpbnN0YW5jZSkpKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VzLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uQmFja2dyb3VuZFRlcm1pbmFsRGlzcG9zZWQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlcy5maW5kSW5kZXgoYmFja2dyb3VuZGVkID0+IGJhY2tncm91bmRlZC5pbnN0YW5jZSA9PT0gaW5zdGFuY2UpO1xuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsSW5zdGFuY2VzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0fVxuXHRcdHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHR0aGlzLl9vbkRpZERpc3Bvc2VJbnN0YW5jZS5maXJlKGluc3RhbmNlKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzaG93QmFja2dyb3VuZFRlcm1pbmFsKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgc3VwcHJlc3NTZXRBY3RpdmU/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlcy5maW5kSW5kZXgoYmcgPT4gYmcuaW5zdGFuY2UgPT09IGluc3RhbmNlKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGJhY2tncm91bmRUZXJtaW5hbCA9IHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsSW5zdGFuY2VzW2luZGV4XTtcblx0XHR0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRpZiAoaW5zdGFuY2UudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLlBhbmVsKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5jcmVhdGVHcm91cChpbnN0YW5jZSk7XG5cblx0XHRcdC8vIE1ha2UgYWN0aXZlIGF1dG9tYXRpY2FsbHkgaWYgaXQncyB0aGUgZmlyc3QgaW5zdGFuY2Vcblx0XHRcdGlmICh0aGlzLmluc3RhbmNlcy5sZW5ndGggPT09IDEgJiYgIXN1cHByZXNzU2V0QWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlQnlJbmRleCgwKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IGJhY2tncm91bmRUZXJtaW5hbC50ZXJtaW5hbExvY2F0aW9uT3B0aW9ucyA/IHRoaXMuX2dldEVkaXRvck9wdGlvbnMoYmFja2dyb3VuZFRlcm1pbmFsLnRlcm1pbmFsTG9jYXRpb25PcHRpb25zKSA6IHRoaXMuX2dldEVkaXRvck9wdGlvbnMoaW5zdGFuY2UudGFyZ2V0KTtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGluc3RhbmNlLCBlZGl0b3JPcHRpb25zKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlKCk7XG5cdH1cblxuXHRhc3luYyBzZXRDb250YWluZXJzKHBhbmVsQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGVybWluYWxDb250YWluZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5zZXRQYW5lbENvbnRhaW5lcihwYW5lbENvbnRhaW5lcik7XG5cdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2V0Q29udGFpbmVyKHRlcm1pbmFsQ29udGFpbmVyKTtcblx0fVxuXG5cblxuXHRjcmVhdGVPbkluc3RhbmNlRXZlbnQ8VD4oZ2V0RXZlbnQ6IChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpID0+IEV2ZW50PFQ+KTogRHluYW1pY0xpc3RFdmVudE11bHRpcGxleGVyPElUZXJtaW5hbEluc3RhbmNlLCBUPiB7XG5cdFx0cmV0dXJuIG5ldyBEeW5hbWljTGlzdEV2ZW50TXVsdGlwbGV4ZXIodGhpcy5pbnN0YW5jZXMsIHRoaXMub25EaWRDcmVhdGVJbnN0YW5jZSwgdGhpcy5vbkRpZERpc3Bvc2VJbnN0YW5jZSwgZ2V0RXZlbnQpO1xuXHR9XG5cblx0Y3JlYXRlT25JbnN0YW5jZUNhcGFiaWxpdHlFdmVudDxUIGV4dGVuZHMgVGVybWluYWxDYXBhYmlsaXR5LCBLPihjYXBhYmlsaXR5SWQ6IFQsIGdldEV2ZW50OiAoY2FwYWJpbGl0eTogSVRlcm1pbmFsQ2FwYWJpbGl0eUltcGxNYXBbVF0pID0+IEV2ZW50PEs+KTogSUR5bmFtaWNMaXN0RXZlbnRNdWx0aXBsZXhlcjx7IGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZTsgZGF0YTogSyB9PiB7XG5cdFx0cmV0dXJuIGNyZWF0ZUluc3RhbmNlQ2FwYWJpbGl0eUV2ZW50TXVsdGlwbGV4ZXIodGhpcy5pbnN0YW5jZXMsIHRoaXMub25EaWRDcmVhdGVJbnN0YW5jZSwgdGhpcy5vbkRpZERpc3Bvc2VJbnN0YW5jZSwgY2FwYWJpbGl0eUlkLCBnZXRFdmVudCk7XG5cdH1cbn1cblxuY2xhc3MgVGVybWluYWxFZGl0b3JTdHlsZSBleHRlbmRzIFRoZW1hYmxlIHtcblx0cHJpdmF0ZSBfc3R5bGVFbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihfdGhlbWVTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudCA9IGRvbVN0eWxlc2hlZXRzLmNyZWF0ZVN0eWxlU2hlZXQoY29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fc3R5bGVFbGVtZW50LnJlbW92ZSgpKSk7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlSWNvbkNoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZVN0eWxlcygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkQ3JlYXRlSW5zdGFuY2UoKCkgPT4gdGhpcy51cGRhdGVTdHlsZXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgVGVybWluYWxFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQ2xvc2VFZGl0b3IoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgVGVybWluYWxFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXMoKCkgPT4gdGhpcy51cGRhdGVTdHlsZXMoKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZVN0eWxlcygpO1xuXHRcdGNvbnN0IGNvbG9yVGhlbWUgPSB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXG5cdFx0Ly8gVE9ETzogYWRkIGEgcnVsZSBjb2xsZWN0b3IgdG8gYXZvaWQgZHVwbGljYXRpb25cblx0XHRsZXQgY3NzID0gJyc7XG5cblx0XHRjb25zdCBwcm9kdWN0SWNvblRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldFByb2R1Y3RJY29uVGhlbWUoKTtcblxuXHRcdC8vIEFkZCBpY29uc1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcykge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGluc3RhbmNlLmljb247XG5cdFx0XHRpZiAoIWljb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdXJpID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGljb24gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdFx0dXJpID0gaWNvbjtcblx0XHRcdH0gZWxzZSBpZiAoaWNvbiBpbnN0YW5jZW9mIE9iamVjdCAmJiBoYXNLZXkoaWNvbiwgeyBsaWdodDogdHJ1ZSwgZGFyazogdHJ1ZSB9KSkge1xuXHRcdFx0XHR1cmkgPSBpc0RhcmsoY29sb3JUaGVtZS50eXBlKSA/IGljb24uZGFyayA6IGljb24ubGlnaHQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpY29uQ2xhc3NlcyA9IGdldFVyaUNsYXNzZXMoaW5zdGFuY2UsIGNvbG9yVGhlbWUudHlwZSk7XG5cdFx0XHRpZiAodXJpIGluc3RhbmNlb2YgVVJJICYmIGljb25DbGFzc2VzICYmIGljb25DbGFzc2VzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Y3NzICs9IChcblx0XHRcdFx0XHRjc3NWYWx1ZS5pbmxpbmVgLm1vbmFjby13b3JrYmVuY2ggLnRlcm1pbmFsLXRhYi4ke2Nzc1ZhbHVlLmNsYXNzTmFtZShpY29uQ2xhc3Nlc1swXSl9OjpiZWZvcmVcblx0XHRcdFx0XHR7Y29udGVudDogJyc7IGJhY2tncm91bmQtaW1hZ2U6ICR7Y3NzVmFsdWUuYXNDU1NVcmwodXJpKX07fWBcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oaWNvbikpIHtcblx0XHRcdFx0Y29uc3QgaWNvblJlZ2lzdHJ5ID0gZ2V0SWNvblJlZ2lzdHJ5KCk7XG5cdFx0XHRcdGNvbnN0IGljb25Db250cmlidXRpb24gPSBpY29uUmVnaXN0cnkuZ2V0SWNvbihpY29uLmlkKTtcblx0XHRcdFx0aWYgKGljb25Db250cmlidXRpb24pIHtcblx0XHRcdFx0XHRjb25zdCBkZWYgPSBwcm9kdWN0SWNvblRoZW1lLmdldEljb24oaWNvbkNvbnRyaWJ1dGlvbik7XG5cdFx0XHRcdFx0aWYgKGRlZikge1xuXHRcdFx0XHRcdFx0Y3NzICs9IGNzc1ZhbHVlLmlubGluZWAubW9uYWNvLXdvcmtiZW5jaCAudGVybWluYWwtdGFiLmNvZGljb24tJHtjc3NWYWx1ZS5jbGFzc05hbWUoaWNvbi5pZCl9OjpiZWZvcmVcblx0XHRcdFx0XHRcdFx0e2NvbnRlbnQ6ICR7Y3NzVmFsdWUuc3RyaW5nVmFsdWUoZGVmLmZvbnRDaGFyYWN0ZXIpfSAhaW1wb3J0YW50OyBmb250LWZhbWlseTogJHtjc3NWYWx1ZS5zdHJpbmdWYWx1ZShkZWYuZm9udD8uaWQgPz8gJ2NvZGljb24nKX0gIWltcG9ydGFudDt9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgY29sb3JzXG5cdFx0Y29uc3QgaWNvbkZvcmVncm91bmRDb2xvciA9IGNvbG9yVGhlbWUuZ2V0Q29sb3IoaWNvbkZvcmVncm91bmQpO1xuXHRcdGlmIChpY29uRm9yZWdyb3VuZENvbG9yKSB7XG5cdFx0XHRjc3MgKz0gY3NzVmFsdWUuaW5saW5lYC5tb25hY28td29ya2JlbmNoIC5zaG93LWZpbGUtaWNvbnMgLmZpbGUtaWNvbi50ZXJtaW5hbC10YWI6OmJlZm9yZSB7IGNvbG9yOiAke2ljb25Gb3JlZ3JvdW5kQ29sb3J9OyB9YDtcblx0XHR9XG5cblx0XHRjc3MgKz0gZ2V0Q29sb3JTdHlsZUNvbnRlbnQoY29sb3JUaGVtZSwgdHJ1ZSk7XG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gY3NzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksb0JBQW9CO0FBQ2hDLFlBQVksY0FBYztBQUMxQixTQUFTLGlCQUFpQixlQUFrQztBQUM1RCxTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLDZCQUE2QixTQUFTLGFBQTJDO0FBQzFGLFNBQVMsWUFBWSxlQUFlLGlCQUFpQixvQkFBb0I7QUFDekUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYSxhQUFhO0FBQ25DLFNBQVMsV0FBVztBQUVwQixZQUFZLFNBQVM7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJB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LGFBQWE7QUFBQSxNQUNuQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssd0JBQXdCLDZCQUE2QixNQUFNLEtBQUssYUFBYSxDQUFDLENBQUM7QUFBQSxFQUNwRztBQUFBLEVBRVMsZUFBcUI7QUFDN0IsVUFBTSxhQUFhO0FBQ25CLFVBQU0sYUFBYSxLQUFLLGNBQWMsY0FBYztBQUdwRCxRQUFJLE1BQU07QUFFVixVQUFNLG1CQUFtQixLQUFLLGNBQWMsb0JBQW9CO0FBR2hFLGVBQVcsWUFBWSxLQUFLLGlCQUFpQixXQUFXO0FBQ3ZELFlBQU0sT0FBTyxTQUFTO0FBQ3RCLFVBQUksQ0FBQyxNQUFNO0FBQ1Y7QUFBQSxNQUNEO0FBQ0EsVUFBSSxNQUFNO0FBQ1YsVUFBSSxnQkFBZ0IsS0FBSztBQUN4QixjQUFNO0FBQUEsTUFDUCxXQUFXLGdCQUFnQixVQUFVLE9BQU8sTUFBTSxFQUFFLE9BQU8sTUFBTSxNQUFNLEtBQUssQ0FBQyxHQUFHO0FBQy9FLGNBQU0sT0FBTyxXQUFXLElBQUksSUFBSSxLQUFLLE9BQU8sS0FBSztBQUFBLE1BQ2xEO0FBQ0EsWUFBTSxjQUFjLGNBQWMsVUFBVSxXQUFXLElBQUk7QUFDM0QsVUFBSSxlQUFlLE9BQU8sZUFBZSxZQUFZLFNBQVMsR0FBRztBQUNoRSxlQUNDLFNBQVMseUNBQXlDLFNBQVMsVUFBVSxZQUFZLENBQUMsQ0FBQyxDQUFDO0FBQUEsdUNBQ2xELFNBQVMsU0FBUyxHQUFHLENBQUM7QUFBQSxNQUUxRDtBQUNBLFVBQUksVUFBVSxZQUFZLElBQUksR0FBRztBQUNoQyxjQUFNLGVBQWUsZ0JBQWdCO0FBQ3JDLGNBQU0sbUJBQW1CLGFBQWEsUUFBUSxLQUFLLEVBQUU7QUFDckQsWUFBSSxrQkFBa0I7QUFDckIsZ0JBQU0sTUFBTSxpQkFBaUIsUUFBUSxnQkFBZ0I7QUFDckQsY0FBSSxLQUFLO0FBQ1IsbUJBQU8sU0FBUyxpREFBaUQsU0FBUyxVQUFVLEtBQUssRUFBRSxDQUFDO0FBQUEsbUJBQy9FLFNBQVMsWUFBWSxJQUFJLGFBQWEsQ0FBQyw2QkFBNkIsU0FBUyxZQUFZLElBQUksTUFBTSxNQUFNLFNBQVMsQ0FBQztBQUFBLFVBQ2pJO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsVUFBTSxzQkFBc0IsV0FBVyxTQUFTLGNBQWM7QUFDOUQsUUFBSSxxQkFBcUI7QUFDeEIsYUFBTyxTQUFTLHFGQUFxRixtQkFBbUI7QUFBQSxJQUN6SDtBQUVBLFdBQU8scUJBQXFCLFlBQVksSUFBSTtBQUM1QyxTQUFLLGNBQWMsY0FBYztBQUFBLEVBQ2xDO0FBQ0Q7QUFuRk0sc0JBQU47QUFBQSxFQUtHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSRzsiLAogICJuYW1lcyI6IFsiZSIsICJsb2NhdGlvbiIsICJpbnN0YW5jZSJdCn0K
