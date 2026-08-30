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
import { isFirefox } from "../../../../base/browser/browser.js";
import { BrowserFeatures } from "../../../../base/browser/canIUse.js";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { AutoOpenBarrier, Promises, disposableTimeout, timeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { debounce } from "../../../../base/common/decorators.js";
import { BugIndicatingError, onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { normalizeDriveLetter, template, tildify } from "../../../../base/common/labels.js";
import { Disposable, DisposableMap, DisposableStore, ImmortalReference, MutableDisposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as path from "../../../../base/common/path.js";
import { OS, OperatingSystem, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { URI } from "../../../../base/common/uri.js";
import { TabFocus } from "../../../../editor/browser/config/tabFocus.js";
import * as nls from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { CodeDataTransfers, containsDragType, getPathForFile } from "../../../../platform/dnd/browser/dnd.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResultKind } from "../../../../platform/keybinding/common/keybindingResolver.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalCapabilityStoreMultiplexer } from "../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { deserializeEnvironmentVariableCollections } from "../../../../platform/terminal/common/environmentVariableShared.js";
import { GeneralShellType, ITerminalLogService, PosixShellType, ProcessPropertyType, remoteResolverTerminal, ShellIntegrationStatus, TerminalExitReason, TerminalLocation, TerminalSettingId, TitleEventSource, WindowsShellType } from "../../../../platform/terminal/common/terminal.js";
import { formatMessageForTerminal } from "../../../../platform/terminal/common/terminalStrings.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from "../../../common/theme.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { ITerminalConfigurationService, TerminalDataTransfers } from "./terminal.js";
import { TerminalLaunchHelpAction } from "./terminalActions.js";
import { TerminalEditorInput } from "./terminalEditorInput.js";
import { TerminalExtensionsRegistry } from "./terminalExtensions.js";
import { getColorClass, createColorStyleElement, getStandardColors } from "./terminalIcon.js";
import { TerminalProcessManager } from "./terminalProcessManager.js";
import { TerminalStatus, TerminalStatusList } from "./terminalStatusList.js";
import { getTerminalResourcesFromDragEvent, getTerminalUri } from "./terminalUri.js";
import { TerminalWidgetManager } from "./widgets/widgetManager.js";
import { LineDataEventAddon } from "./xterm/lineDataEventAddon.js";
import { XtermTerminal, getXtermScaledDimensions } from "./xterm/xtermTerminal.js";
import { ITerminalProfileResolverService, ProcessState, TERMINAL_VIEW_ID, TerminalCommandId } from "../common/terminal.js";
import { TERMINAL_BACKGROUND_COLOR } from "../common/terminalColorRegistry.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { getUriLabelForShell, getShellIntegrationTimeout, getWorkspaceForTerminal, preparePathForShell } from "../common/terminalEnvironment.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { isHorizontal, IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { importAMDNodeModule } from "../../../../amdX.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { terminalStrings } from "../common/terminalStrings.js";
import { TerminalIconPicker } from "./terminalIconPicker.js";
import { TerminalResizeDebouncer } from "./terminalResizeDebouncer.js";
import { openContextMenu } from "./terminalContextMenu.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { TerminalContribCommandId } from "../terminalContribExports.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { PromptInputState } from "../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js";
import { hasKey, isNumber, isString } from "../../../../base/common/types.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["WaitForContainerThreshold"] = 100] = "WaitForContainerThreshold";
  Constants2[Constants2["DefaultCols"] = 80] = "DefaultCols";
  Constants2[Constants2["DefaultRows"] = 30] = "DefaultRows";
  Constants2[Constants2["MaxCanvasWidth"] = 4096] = "MaxCanvasWidth";
  return Constants2;
})(Constants || {});
let xtermConstructor;
const shellIntegrationSupportedShellTypes = [
  PosixShellType.Bash,
  PosixShellType.Zsh,
  GeneralShellType.PowerShell,
  GeneralShellType.Python
];
const agentCliTitlePatterns = /* @__PURE__ */ new Map([
  [GeneralShellType.Claude, /claude\s*code/i],
  // [GeneralShellType.Codex, /\bcodex\b/i], // codex does not report osc title.
  [GeneralShellType.CommandCode, /command\s*code/i],
  [GeneralShellType.Copilot, /\bcopilot\b/i],
  [GeneralShellType.Gemini, /\bgemini\b/i]
]);
let TerminalInstance = class extends Disposable {
  constructor(_terminalShellTypeContextKey, _shellLaunchConfig, _contextKeyService, _contextMenuService, instantiationService, _terminalConfigurationService, _terminalProfileResolverService, _pathService, _fileService, _keybindingService, _notificationService, _preferencesService, _viewsService, _themeService, _configurationService, _logService, _storageService, _accessibilityService, _productService, _quickInputService, _workbenchEnvironmentService, _workspaceContextService, _editorService, _workspaceTrustRequestService, _historyService, _telemetryService, _openerService, _commandService, _accessibilitySignalService, _viewDescriptorService) {
    super();
    this._terminalShellTypeContextKey = _terminalShellTypeContextKey;
    this._shellLaunchConfig = _shellLaunchConfig;
    this._contextKeyService = _contextKeyService;
    this._contextMenuService = _contextMenuService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._pathService = _pathService;
    this._fileService = _fileService;
    this._keybindingService = _keybindingService;
    this._notificationService = _notificationService;
    this._viewsService = _viewsService;
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._accessibilityService = _accessibilityService;
    this._quickInputService = _quickInputService;
    this._workbenchEnvironmentService = _workbenchEnvironmentService;
    this._workspaceContextService = _workspaceContextService;
    this._editorService = _editorService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._historyService = _historyService;
    this._telemetryService = _telemetryService;
    this._openerService = _openerService;
    this._commandService = _commandService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._viewDescriptorService = _viewDescriptorService;
    this._contributions = /* @__PURE__ */ new Map();
    this._latestXtermWriteData = 0;
    this._latestXtermParseData = 0;
    this._title = "";
    this._titleSource = TitleEventSource.Process;
    this._cols = 0;
    this._rows = 0;
    this._cwd = void 0;
    this._initialCwd = void 0;
    this._injectedArgs = void 0;
    this._layoutSettingsChanged = true;
    this._areLinksReady = false;
    this._initialDataEventsListener = this._register(new MutableDisposable());
    this._initialDataEvents = [];
    this._messageTitleDisposable = this._register(new MutableDisposable());
    this._dndObserver = this._register(new MutableDisposable());
    this._processName = "";
    this._usedShellIntegrationInjection = false;
    this.capabilities = this._register(new TerminalCapabilityStoreMultiplexer());
    this.disableLayout = false;
    this._targetRef = new ImmortalReference(void 0);
    // The onExit event is special in that it fires and is disposed after the terminal instance
    // itself is disposed
    this._onExit = new Emitter();
    this.onExit = this._onExit.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDisposed = this._register(new Emitter());
    this.onDisposed = this._onDisposed.event;
    this._onProcessIdReady = this._register(new Emitter());
    this.onProcessIdReady = this._onProcessIdReady.event;
    this._onProcessReplayComplete = this._register(new Emitter());
    this.onProcessReplayComplete = this._onProcessReplayComplete.event;
    this._onTitleChanged = this._register(new Emitter());
    this.onTitleChanged = this._onTitleChanged.event;
    this._onIconChanged = this._register(new Emitter());
    this.onIconChanged = this._onIconChanged.event;
    this._onWillData = this._register(new Emitter());
    this.onWillData = this._onWillData.event;
    this._onData = this._register(new Emitter());
    this.onData = this._onData.event;
    this._onBinary = this._register(new Emitter());
    this.onBinary = this._onBinary.event;
    this._onRequestExtHostProcess = this._register(new Emitter());
    this.onRequestExtHostProcess = this._onRequestExtHostProcess.event;
    this._onDimensionsChanged = this._register(new Emitter());
    this.onDimensionsChanged = this._onDimensionsChanged.event;
    this._onMaximumDimensionsChanged = this._register(new Emitter());
    this.onMaximumDimensionsChanged = this._onMaximumDimensionsChanged.event;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidRequestFocus = this._register(new Emitter());
    this.onDidRequestFocus = this._onDidRequestFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._onDidInputData = this._register(new Emitter());
    this.onDidInputData = this._onDidInputData.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onRequestAddInstanceToGroup = this._register(new Emitter());
    this.onRequestAddInstanceToGroup = this._onRequestAddInstanceToGroup.event;
    this._onDidChangeHasChildProcesses = this._register(new Emitter());
    this.onDidChangeHasChildProcesses = this._onDidChangeHasChildProcesses.event;
    this._onDidExecuteText = this._register(new Emitter());
    this.onDidExecuteText = this._onDidExecuteText.event;
    this._onDidChangeTarget = this._register(new Emitter());
    this.onDidChangeTarget = this._onDidChangeTarget.event;
    this._onDidSendText = this._register(new Emitter());
    this.onDidSendText = this._onDidSendText.event;
    this._onDidChangeShellType = this._register(new Emitter());
    this.onDidChangeShellType = this._onDidChangeShellType.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onLineData = this._register(new Emitter({
      onDidAddFirstListener: async () => (this.xterm ?? await this._xtermReadyPromise)?.raw.loadAddon(this._lineDataEventAddon)
    }));
    this.onLineData = this._onLineData.event;
    this.sessionId = generateUuid();
    this._isRemoteResolverTerminal = this._shellLaunchConfig[remoteResolverTerminal] === true;
    delete this._shellLaunchConfig[remoteResolverTerminal];
    this._wrapperElement = document.createElement("div");
    this._wrapperElement.classList.add("terminal-wrapper");
    this._widgetManager = this._register(instantiationService.createInstance(TerminalWidgetManager));
    this._isExiting = false;
    this._isDisposing = false;
    this._hadFocusOnExit = false;
    this._isVisible = false;
    this._instanceId = TerminalInstance._instanceIdCounter++;
    this._fixedRows = _shellLaunchConfig.attachPersistentProcess?.fixedDimensions?.rows;
    this._fixedCols = _shellLaunchConfig.attachPersistentProcess?.fixedDimensions?.cols;
    this._shellLaunchConfig.shellIntegrationEnvironmentReporting = this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnvironmentReporting);
    this._resource = getTerminalUri(this._workspaceContextService.getWorkspace().id, this.instanceId, this.title);
    if (this._shellLaunchConfig.attachPersistentProcess?.hideFromUser) {
      this._shellLaunchConfig.hideFromUser = this._shellLaunchConfig.attachPersistentProcess.hideFromUser;
    }
    if (this._shellLaunchConfig.attachPersistentProcess?.isFeatureTerminal) {
      this._shellLaunchConfig.isFeatureTerminal = this._shellLaunchConfig.attachPersistentProcess.isFeatureTerminal;
    }
    if (this._shellLaunchConfig.attachPersistentProcess?.type) {
      this._shellLaunchConfig.type = this._shellLaunchConfig.attachPersistentProcess.type;
    }
    if (this._shellLaunchConfig.attachPersistentProcess?.tabActions) {
      this._shellLaunchConfig.tabActions = this._shellLaunchConfig.attachPersistentProcess.tabActions;
    }
    if (this.shellLaunchConfig.cwd) {
      const cwdUri = isString(this._shellLaunchConfig.cwd) ? URI.from({
        scheme: Schemas.file,
        path: this._shellLaunchConfig.cwd
      }) : this._shellLaunchConfig.cwd;
      if (cwdUri) {
        this._workspaceFolder = this._workspaceContextService.getWorkspaceFolder(cwdUri) ?? void 0;
      }
    }
    if (!this._workspaceFolder) {
      const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
      this._workspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? void 0 : void 0;
    }
    const scopedContextKeyService = this._register(_contextKeyService.createScoped(this._wrapperElement));
    this._scopedContextKeyService = scopedContextKeyService;
    this._scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, scopedContextKeyService]
    )));
    this._terminalFocusContextKey = TerminalContextKeys.focus.bindTo(scopedContextKeyService);
    this._terminalHasFixedWidth = TerminalContextKeys.terminalHasFixedWidth.bindTo(scopedContextKeyService);
    this._terminalHasTextContextKey = TerminalContextKeys.textSelected.bindTo(this._contextKeyService);
    this._terminalAltBufferActiveContextKey = TerminalContextKeys.altBufferActive.bindTo(scopedContextKeyService);
    this._terminalShellIntegrationEnabledContextKey = TerminalContextKeys.terminalShellIntegrationEnabled.bindTo(scopedContextKeyService);
    this._logService.trace(`terminalInstance#ctor (instanceId: ${this.instanceId})`, this._shellLaunchConfig);
    this._register(this.capabilities.onDidAddCapability((e) => this._logService.debug("terminalInstance added capability", e.id)));
    this._register(this.capabilities.onDidRemoveCapability((e) => this._logService.debug("terminalInstance removed capability", e.id)));
    const capabilityListeners = this._register(new DisposableMap());
    this._register(this.capabilities.onDidAddCapability((e) => {
      capabilityListeners.get(e.id)?.dispose();
      const refreshInfo = () => {
        this._labelComputer?.refreshLabel(this);
        this._refreshShellIntegrationInfoStatus(this);
      };
      switch (e.id) {
        case TerminalCapability.CwdDetection: {
          capabilityListeners.set(e.id, e.capability.onDidChangeCwd((e2) => {
            this._cwd = e2;
            this._setTitle(this.title, TitleEventSource.Config);
          }));
          break;
        }
        case TerminalCapability.CommandDetection: {
          e.capability.promptInputModel.setShellType(this.shellType);
          const store = new DisposableStore();
          store.add(Event.any(
            e.capability.promptInputModel.onDidStartInput,
            e.capability.promptInputModel.onDidChangeInput,
            e.capability.promptInputModel.onDidFinishInput
          )(refreshInfo));
          store.add(e.capability.onCommandExecuted(async (command) => {
            if (!command.id && command.command) {
              const commandId = generateUuid();
              this.xterm?.shellIntegration.setNextCommandId(command.command, commandId);
              await this._processManager.setNextCommandId(command.command, commandId);
            }
          }));
          capabilityListeners.set(e.id, store);
          break;
        }
        case TerminalCapability.PromptTypeDetection: {
          capabilityListeners.set(e.id, e.capability.onPromptTypeChanged(refreshInfo));
          break;
        }
      }
    }));
    this._register(this.onDidChangeShellType(() => this._refreshShellIntegrationInfoStatus(this)));
    this._register(this.capabilities.onDidRemoveCapability((e) => {
      capabilityListeners.get(e.id)?.dispose();
    }));
    if (!this.shellLaunchConfig.executable && !this._workbenchEnvironmentService.remoteAuthority) {
      this._terminalProfileResolverService.resolveIcon(this._shellLaunchConfig, OS);
    }
    this._icon = _shellLaunchConfig.attachPersistentProcess?.icon || _shellLaunchConfig.icon;
    if (this.shellLaunchConfig.customPtyImplementation && !this._shellLaunchConfig.titleTemplate) {
      this._setTitle(this._shellLaunchConfig.name, TitleEventSource.Api);
    }
    this.statusList = this._register(this._scopedInstantiationService.createInstance(TerminalStatusList));
    this._initDimensions();
    this._processManager = this._createProcessManager();
    this._containerReadyBarrier = new AutoOpenBarrier(100 /* WaitForContainerThreshold */);
    this._attachBarrier = new AutoOpenBarrier(1e3);
    this._xtermReadyPromise = this._createXterm();
    this._xtermReadyPromise.then(async () => {
      await this._containerReadyBarrier.wait();
      let os;
      if (!this.shellLaunchConfig.customPtyImplementation && this._terminalConfigurationService.config.shellIntegration?.enabled && !this.shellLaunchConfig.executable) {
        os = await this._processManager.getBackendOS();
        const defaultProfile = await this._terminalProfileResolverService.getDefaultProfile({ remoteAuthority: this.remoteAuthority, os });
        this.shellLaunchConfig.executable = defaultProfile.path;
        this.shellLaunchConfig.args = defaultProfile.args;
        this.shellLaunchConfig.icon ??= defaultProfile.icon;
        this.shellLaunchConfig.color ??= defaultProfile.color;
        this.shellLaunchConfig.env ??= defaultProfile.env;
      }
      if (os && this.shellLaunchConfig.executable) {
        this.setShellType(guessShellTypeFromExecutable(os, this.shellLaunchConfig.executable));
      }
      await this._createProcess();
      if (this.shellLaunchConfig.attachPersistentProcess) {
        this._cwd = this.shellLaunchConfig.attachPersistentProcess.cwd;
        this._setTitle(this.shellLaunchConfig.attachPersistentProcess.title, this.shellLaunchConfig.attachPersistentProcess.titleSource);
        this.setShellType(this.shellType);
      }
      if (this._fixedCols) {
        await this._addScrollbar();
      }
    }).catch((err) => {
      if (!this.isDisposed) {
        throw err;
      }
    });
    this._register(this._configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(AccessibilityVerbositySettingId.Terminal)) {
        this._setAriaLabel(this.xterm?.raw, this._instanceId, this.title);
      }
      if (e.affectsConfiguration("terminal.integrated")) {
        this.updateConfig();
        this.setVisible(this._isVisible);
      }
      const layoutSettings = [
        TerminalSettingId.FontSize,
        TerminalSettingId.FontFamily,
        TerminalSettingId.FontWeight,
        TerminalSettingId.FontWeightBold,
        TerminalSettingId.LetterSpacing,
        TerminalSettingId.LineHeight,
        "editor.fontFamily"
      ];
      if (layoutSettings.some((id) => e.affectsConfiguration(id))) {
        this._layoutSettingsChanged = true;
        await this._resize();
      }
      if (e.affectsConfiguration(TerminalSettingId.UnicodeVersion)) {
        this._updateUnicodeVersion();
      }
      if (e.affectsConfiguration("editor.accessibilitySupport")) {
        this.updateAccessibilitySupport();
      }
      if (e.affectsConfiguration(TerminalSettingId.TerminalTitle) || e.affectsConfiguration(TerminalSettingId.TerminalTitleSeparator) || e.affectsConfiguration(TerminalSettingId.TerminalDescription)) {
        this._labelComputer?.refreshLabel(this);
      }
    }));
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._labelComputer?.refreshLabel(this)));
    let initialDataEventsTimeout = dom.getWindow(this._container).setTimeout(() => {
      initialDataEventsTimeout = void 0;
      this._initialDataEvents = void 0;
      this._initialDataEventsListener.clear();
    }, 1e4);
    this._register(toDisposable(() => {
      if (initialDataEventsTimeout) {
        dom.getWindow(this._container).clearTimeout(initialDataEventsTimeout);
      }
    }));
    const contributionDescs = TerminalExtensionsRegistry.getTerminalContributions();
    for (const desc of contributionDescs) {
      if (this._contributions.has(desc.id)) {
        onUnexpectedError(new Error(`Cannot have two terminal contributions with the same id ${desc.id}`));
        continue;
      }
      let contribution;
      try {
        contribution = this._register(this._scopedInstantiationService.createInstance(desc.ctor, {
          instance: this,
          processManager: this._processManager,
          widgetManager: this._widgetManager
        }));
        this._contributions.set(desc.id, contribution);
      } catch (err) {
        onUnexpectedError(err);
      }
      this._xtermReadyPromise.then((xterm) => {
        if (xterm) {
          contribution.xtermReady?.(xterm);
        }
      });
      this._register(this.onWillDispose(() => {
        contribution.dispose();
        this._contributions.delete(desc.id);
      }));
    }
  }
  get xtermReadyPromise() {
    return this._xtermReadyPromise;
  }
  get domElement() {
    return this._wrapperElement;
  }
  get usedShellIntegrationInjection() {
    return this._usedShellIntegrationInjection;
  }
  get shellIntegrationInjectionFailureReason() {
    return this._shellIntegrationInjectionInfo;
  }
  get store() {
    return this._store;
  }
  get extEnvironmentVariableCollection() {
    return this._processManager.extEnvironmentVariableCollection;
  }
  get waitOnExit() {
    return this._shellLaunchConfig.attachPersistentProcess?.waitOnExit || this._shellLaunchConfig.waitOnExit;
  }
  set waitOnExit(value) {
    this._shellLaunchConfig.waitOnExit = value;
  }
  get isVisible() {
    return this._isVisible;
  }
  get targetRef() {
    return this._targetRef;
  }
  get target() {
    return this._targetRef.object;
  }
  set target(value) {
    this._targetRef.object = value;
    this._onDidChangeTarget.fire(value);
  }
  get instanceId() {
    return this._instanceId;
  }
  get resource() {
    return this._resource;
  }
  get cols() {
    if (this._fixedCols !== void 0) {
      return this._fixedCols;
    }
    if (this._dimensionsOverride && this._dimensionsOverride.cols) {
      if (this._dimensionsOverride.forceExactSize) {
        return this._dimensionsOverride.cols;
      }
      return Math.min(Math.max(this._dimensionsOverride.cols, 2), this._cols);
    }
    return this._cols;
  }
  get rows() {
    if (this._fixedRows !== void 0) {
      return this._fixedRows;
    }
    if (this._dimensionsOverride && this._dimensionsOverride.rows) {
      if (this._dimensionsOverride.forceExactSize) {
        return this._dimensionsOverride.rows;
      }
      return Math.min(Math.max(this._dimensionsOverride.rows, 2), this._rows);
    }
    return this._rows;
  }
  get isDisposed() {
    return this._store.isDisposed;
  }
  get fixedCols() {
    return this._fixedCols;
  }
  get fixedRows() {
    return this._fixedRows;
  }
  get maxCols() {
    return this._cols;
  }
  get maxRows() {
    return this._rows;
  }
  // TODO: Ideally processId would be merged into processReady
  get processId() {
    return this._processManager.shellProcessId;
  }
  // TODO: How does this work with detached processes?
  // TODO: Should this be an event as it can fire twice?
  get processReady() {
    return this._processManager.ptyProcessReady;
  }
  get hasChildProcesses() {
    return this.shellLaunchConfig.attachPersistentProcess?.hasChildProcesses || this._processManager.hasChildProcesses;
  }
  get reconnectionProperties() {
    return this.shellLaunchConfig.attachPersistentProcess?.reconnectionProperties || this.shellLaunchConfig.reconnectionProperties;
  }
  get areLinksReady() {
    return this._areLinksReady;
  }
  get initialDataEvents() {
    return this._initialDataEvents;
  }
  get exitCode() {
    return this._exitCode;
  }
  get exitReason() {
    return this._exitReason;
  }
  get hadFocusOnExit() {
    return this._hadFocusOnExit;
  }
  get isTitleSetByProcess() {
    return !!this._messageTitleDisposable.value;
  }
  get shellLaunchConfig() {
    return this._shellLaunchConfig;
  }
  get shellType() {
    return this._shellType;
  }
  get os() {
    return this._processManager.os;
  }
  get hasRemoteAuthority() {
    return this._processManager.remoteAuthority !== void 0;
  }
  get remoteAuthority() {
    return this._processManager.remoteAuthority;
  }
  get hasFocus() {
    return dom.isAncestorOfActiveElement(this._wrapperElement);
  }
  get title() {
    return this._title;
  }
  get titleSource() {
    return this._titleSource;
  }
  get icon() {
    return this._getIcon();
  }
  get color() {
    return this._getColor();
  }
  get processName() {
    return this._processName;
  }
  get sequence() {
    return this._sequence;
  }
  get staticTitle() {
    return this._staticTitle;
  }
  get progressState() {
    return this.xterm?.progressState;
  }
  get workspaceFolder() {
    return this._workspaceFolder;
  }
  get cwd() {
    return this._cwd;
  }
  get initialCwd() {
    return this._initialCwd;
  }
  get description() {
    if (this._description) {
      return this._description;
    }
    const type = this.shellLaunchConfig.attachPersistentProcess?.type || this.shellLaunchConfig.type;
    switch (type) {
      case "Task":
        return terminalStrings.typeTask;
      case "Local":
        return terminalStrings.typeLocal;
      default:
        return void 0;
    }
  }
  get userHome() {
    return this._userHome;
  }
  get shellIntegrationNonce() {
    return this._processManager.shellIntegrationNonce;
  }
  get injectedArgs() {
    return this._injectedArgs;
  }
  getContribution(id) {
    return this._contributions.get(id);
  }
  async _handleOnData(data) {
    await this._processManager.write(data);
    this._onDidInputData.fire(data);
  }
  _getIcon() {
    if (!this._icon) {
      this._icon = this._processManager.processState >= ProcessState.Launching ? getIconRegistry().getIcon(this._configurationService.getValue(TerminalSettingId.TabsDefaultIcon)) : void 0;
    }
    return this._icon;
  }
  _getColor() {
    if (this.shellLaunchConfig.color) {
      return this.shellLaunchConfig.color;
    }
    if (this.shellLaunchConfig?.attachPersistentProcess?.color) {
      return this.shellLaunchConfig.attachPersistentProcess.color;
    }
    if (this._processManager.processState >= ProcessState.Launching) {
      return void 0;
    }
    return void 0;
  }
  _initDimensions() {
    if (!this._container) {
      this._cols = 80 /* DefaultCols */;
      this._rows = 30 /* DefaultRows */;
      return;
    }
    const computedStyle = dom.getWindow(this._container).getComputedStyle(this._container);
    const width = parseInt(computedStyle.width);
    const height = parseInt(computedStyle.height);
    this._evaluateColsAndRows(width, height);
  }
  /**
   * Evaluates and sets the cols and rows of the terminal if possible.
   * @param width The width of the container.
   * @param height The height of the container.
   * @return The terminal's width if it requires a layout.
   */
  _evaluateColsAndRows(width, height) {
    if (!width || !height) {
      this._setLastKnownColsAndRows();
      return null;
    }
    const dimension = this._getDimension(width, height);
    if (!dimension) {
      this._setLastKnownColsAndRows();
      return null;
    }
    const font = this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement));
    const newRC = getXtermScaledDimensions(dom.getWindow(this.domElement), font, dimension.width, dimension.height);
    if (!newRC) {
      this._setLastKnownColsAndRows();
      return null;
    }
    if (this._cols !== newRC.cols || this._rows !== newRC.rows) {
      this._cols = newRC.cols;
      this._rows = newRC.rows;
      this._fireMaximumDimensionsChanged();
    }
    return dimension.width;
  }
  _setLastKnownColsAndRows() {
    if (TerminalInstance._lastKnownGridDimensions) {
      this._cols = TerminalInstance._lastKnownGridDimensions.cols;
      this._rows = TerminalInstance._lastKnownGridDimensions.rows;
    }
  }
  _fireMaximumDimensionsChanged() {
    this._onMaximumDimensionsChanged.fire();
  }
  _getDimension(width, height) {
    const font = this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement));
    if (!font || !font.charWidth || !font.charHeight) {
      return void 0;
    }
    if (!this.xterm?.raw.element) {
      return void 0;
    }
    const computedStyle = dom.getWindow(this.xterm.raw.element).getComputedStyle(this.xterm.raw.element);
    const horizontalPadding = parseInt(computedStyle.paddingLeft) + parseInt(computedStyle.paddingRight) + this.xterm.scrollbarWidth;
    const verticalPadding = parseInt(computedStyle.paddingTop) + parseInt(computedStyle.paddingBottom);
    TerminalInstance._lastKnownCanvasDimensions = new dom.Dimension(
      Math.min(4096 /* MaxCanvasWidth */, width - horizontalPadding),
      height - verticalPadding + (this._hasScrollBar && this._horizontalScrollbar ? -5 : 0)
    );
    return TerminalInstance._lastKnownCanvasDimensions;
  }
  get persistentProcessId() {
    return this._processManager.persistentProcessId;
  }
  get shouldPersist() {
    return this._processManager.shouldPersist && !this.shellLaunchConfig.isTransient && (!this.reconnectionProperties || this._configurationService.getValue("task.reconnection") === true);
  }
  static getXtermConstructor(keybindingService, contextKeyService) {
    const keybinding = keybindingService.lookupKeybinding(TerminalContribCommandId.A11yFocusAccessibleBuffer, contextKeyService);
    if (xtermConstructor) {
      return xtermConstructor;
    }
    xtermConstructor = Promises.withAsyncBody(async (resolve) => {
      const Terminal = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
      Terminal.strings.promptLabel = nls.localize("terminal.integrated.a11yPromptLabel", "Terminal input");
      Terminal.strings.tooMuchOutput = keybinding ? nls.localize("terminal.integrated.useAccessibleBuffer", "Use the accessible buffer {0} to manually review output", keybinding.getLabel()) : nls.localize("terminal.integrated.useAccessibleBufferNoKb", "Use the Terminal: Focus Accessible Buffer command to manually review output");
      resolve(Terminal);
    });
    return xtermConstructor;
  }
  /**
   * Create xterm.js instance and attach data listeners.
   */
  async _createXterm() {
    const Terminal = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
    if (this.isDisposed) {
      return void 0;
    }
    const disableShellIntegrationReporting = this.shellLaunchConfig.executable === void 0 || this.shellType === void 0 || !shellIntegrationSupportedShellTypes.includes(this.shellType);
    const xterm = this._scopedInstantiationService.createInstance(XtermTerminal, this._resource, Terminal, {
      cols: this._cols,
      rows: this._rows,
      xtermColorProvider: this._scopedInstantiationService.createInstance(TerminalInstanceColorProvider, this._targetRef),
      capabilities: this.capabilities,
      shellIntegrationNonce: this._processManager.shellIntegrationNonce,
      disableShellIntegrationReporting
    }, this.onDidExecuteText);
    this.xterm = xterm;
    this._resizeDebouncer = this._register(new TerminalResizeDebouncer(
      () => this._isVisible,
      () => xterm,
      async (cols, rows) => {
        if (this.isDisposed) {
          return;
        }
        xterm.resize(cols, rows);
        await this._updatePtyDimensions(xterm.raw);
      },
      async (cols) => {
        if (this.isDisposed) {
          return;
        }
        xterm.resize(cols, xterm.raw.rows);
        await this._updatePtyDimensions(xterm.raw);
      },
      async (rows) => {
        if (this.isDisposed) {
          return;
        }
        xterm.resize(xterm.raw.cols, rows);
        await this._updatePtyDimensions(xterm.raw);
      }
    ));
    this._register(toDisposable(() => this._resizeDebouncer = void 0));
    this.updateAccessibilitySupport();
    this._register(this.xterm.onDidRequestRunCommand((e) => {
      this.sendText(e.command.command, e.noNewLine ? false : true);
    }));
    this._register(this.xterm.onDidRequestRefreshDimensions(() => {
      if (this._lastLayoutDimensions) {
        this.layout(this._lastLayoutDimensions);
      }
    }));
    const initialTextWrittenPromise = this._shellLaunchConfig.initialText ? new Promise((r) => this._writeInitialText(xterm, r)) : void 0;
    const lineDataEventAddon = this._register(new LineDataEventAddon(initialTextWrittenPromise));
    this._register(lineDataEventAddon.onLineData((e) => this._onLineData.fire(e)));
    this._lineDataEventAddon = lineDataEventAddon;
    disposableTimeout(() => {
      this._register(xterm.raw.onBell(() => {
        if (this._configurationService.getValue(TerminalSettingId.EnableBell) || this._configurationService.getValue(TerminalSettingId.EnableVisualBell)) {
          this.statusList.add({
            id: TerminalStatus.Bell,
            severity: Severity.Warning,
            icon: Codicon.bell,
            tooltip: nls.localize("bellStatus", "Bell")
          }, this._terminalConfigurationService.config.bellDuration);
        }
        this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalBell);
      }));
    }, 1e3, this._store);
    this._register(xterm.raw.onSelectionChange(() => this._onDidChangeSelection.fire(this)));
    this._register(xterm.raw.buffer.onBufferChange(() => this._refreshAltBufferContextKey()));
    this._register(this._processManager.onProcessData((e) => this._onProcessData(e)));
    this._register(xterm.raw.onData(async (data) => {
      await this._handleOnData(data);
    }));
    this._register(xterm.raw.onBinary((data) => this._processManager.processBinary(data)));
    this._register(this._processManager.onProcessReady(async (processTraits) => {
      if (processTraits?.windowsPty?.backend === "conpty") {
        this._register(xterm.raw.parser.registerCsiHandler({ final: "c" }, (params) => {
          if (params.length === 0 || params.length === 1 && params[0] === 0) {
            this._handleOnData("\x1B[?61;4c");
            return true;
          }
          return false;
        }));
      }
      if (this._processManager.os) {
        lineDataEventAddon.setOperatingSystem(this._processManager.os);
      }
      xterm.raw.options.windowsPty = processTraits.windowsPty;
      xterm.raw.options.reflowCursorLine = processTraits?.windowsPty?.backend === "conpty" && !!this._terminalConfigurationService.config.windowsUseConptyDll;
    }));
    this._register(this._processManager.onRestoreCommands((e) => this.xterm?.shellIntegration.deserialize(e)));
    this._register(this._viewDescriptorService.onDidChangeLocation(({ views }) => {
      if (views.some((v) => v.id === TERMINAL_VIEW_ID)) {
        xterm.refresh();
      }
    }));
    this._register(xterm.onDidChangeProgress(() => this._labelComputer?.refreshLabel(this)));
    this._register(Event.runAndSubscribe(xterm.shellIntegration.onDidChangeSeenSequences, () => {
      if (xterm.shellIntegration.seenSequences.size > 0) {
        this._refreshShellIntegrationInfoStatus(this);
      }
    }));
    if (!this.capabilities.has(TerminalCapability.CwdDetection)) {
      let onKeyListener = xterm.raw.onKey((e) => {
        const event = new StandardKeyboardEvent(e.domEvent);
        if (event.equals(KeyCode.Enter)) {
          this._updateProcessCwd();
        }
      });
      this._register(this.capabilities.onDidAddCwdDetectionCapability(() => {
        onKeyListener?.dispose();
        onKeyListener = void 0;
      }));
    }
    if (this.xterm?.shellIntegration) {
      this.capabilities.add(this.xterm.shellIntegration.capabilities);
    }
    this._pathService.userHome().then((userHome) => {
      this._userHome = userHome.fsPath;
    });
    if (this._isVisible) {
      this._open();
    }
    return xterm;
  }
  _refreshShellIntegrationInfoStatus(instance) {
    if (!instance.xterm) {
      return;
    }
    const cmdDetectionType = instance.capabilities.get(TerminalCapability.CommandDetection)?.hasRichCommandDetection ? nls.localize("shellIntegration.rich", "Rich") : instance.capabilities.has(TerminalCapability.CommandDetection) ? nls.localize("shellIntegration.basic", "Basic") : instance.usedShellIntegrationInjection ? nls.localize("shellIntegration.injectionFailed", "Injection failed to activate") : nls.localize("shellIntegration.no", "No");
    const detailedAdditions = [];
    if (instance.shellType) {
      detailedAdditions.push(`Shell type: \`${instance.shellType}\``);
    }
    const cwd = instance.cwd;
    if (cwd) {
      detailedAdditions.push(`Current working directory: \`${cwd}\``);
    }
    const seenSequences = Array.from(instance.xterm.shellIntegration.seenSequences);
    if (seenSequences.length > 0) {
      detailedAdditions.push(`Seen sequences: ${seenSequences.map((e) => `\`${e}\``).join(", ")}`);
    }
    const promptType = instance.capabilities.get(TerminalCapability.PromptTypeDetection)?.promptType;
    if (promptType) {
      detailedAdditions.push(`Prompt type: \`${promptType}\``);
    }
    const combinedString = instance.capabilities.get(TerminalCapability.CommandDetection)?.promptInputModel.getCombinedString();
    if (combinedString !== void 0) {
      detailedAdditions.push(`Prompt input: \`\`\`${combinedString}\`\`\``);
    }
    const detailedAdditionsString = detailedAdditions.length > 0 ? "\n\n" + detailedAdditions.map((e) => `- ${e}`).join("\n") : "";
    instance.statusList.add({
      id: TerminalStatus.ShellIntegrationInfo,
      severity: Severity.Info,
      tooltip: `${nls.localize("shellIntegration", "Shell integration")}: ${cmdDetectionType}`,
      detailedTooltip: `${nls.localize("shellIntegration", "Shell integration")}: ${cmdDetectionType}${detailedAdditionsString}`
    });
  }
  async runCommand(commandLine, shouldExecute, commandId, forceBracketedPasteMode, commandLineForMetadata) {
    let commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
    const siInjectionEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled) === true;
    const timeoutMs = getShellIntegrationTimeout(
      this._configurationService,
      siInjectionEnabled,
      this.hasRemoteAuthority,
      this._processManager.processReadyTimestamp
    );
    if (!commandDetection || commandDetection.promptInputModel.state !== PromptInputState.Input) {
      const store = new DisposableStore();
      await Promise.race([
        new Promise((r) => {
          store.add(this.capabilities.onDidAddCommandDetectionCapability((e) => {
            commandDetection = e;
            if (commandDetection.promptInputModel.state === PromptInputState.Input) {
              r();
            } else {
              store.add(commandDetection.promptInputModel.onDidStartInput(() => {
                r();
              }));
            }
          }));
        }),
        timeout(timeoutMs)
      ]);
      store.dispose();
    }
    if (commandId && commandDetection) {
      const commandLineToReport = commandLineForMetadata ?? commandLine;
      this.xterm?.shellIntegration.setNextCommandId(commandLineToReport, commandId);
      await this._processManager.setNextCommandId(commandLineToReport, commandId);
    }
    if (shouldExecute && (!commandDetection || commandDetection.promptInputModel.value.length > 0)) {
      await this.sendText("", false);
      await timeout(100);
    }
    await this.sendText(commandLine, shouldExecute, !shouldExecute || forceBracketedPasteMode);
  }
  detachFromElement() {
    this._wrapperElement.remove();
    this._container = void 0;
  }
  attachToElement(container) {
    if (this._container === container) {
      return;
    }
    if (!this._attachBarrier.isOpen()) {
      this._attachBarrier.open();
    }
    this._container = container;
    this._container.appendChild(this._wrapperElement);
    if (this.xterm?.raw.element) {
      this.xterm.raw.open(this.xterm.raw.element);
    }
    this.xterm?.refresh();
    setTimeout(() => {
      if (this._store.isDisposed) {
        return;
      }
      this._initDragAndDrop(container);
    }, 0);
  }
  /**
   * Opens the terminal instance inside the parent DOM element previously set with
   * `attachToElement`, you must ensure the parent DOM element is explicitly visible before
   * invoking this function as it performs some DOM calculations internally
   */
  _open() {
    if (!this.xterm || this.xterm.raw.element) {
      return;
    }
    if (!this._container || !this._container.isConnected) {
      throw new Error("A container element needs to be set with `attachToElement` and be part of the DOM before calling `_open`");
    }
    const xtermHost = document.createElement("div");
    xtermHost.classList.add("terminal-xterm-host");
    this._wrapperElement.appendChild(xtermHost);
    this._container.appendChild(this._wrapperElement);
    const xterm = this.xterm;
    this._wrapperElement.xterm = xterm.raw;
    const screenElement = xterm.attachToElement(xtermHost);
    for (const contribution of this._contributions.values()) {
      if (!this.xterm) {
        this._xtermReadyPromise.then((xterm2) => {
          if (xterm2) {
            contribution.xtermOpen?.(xterm2);
          }
        });
      } else {
        contribution.xtermOpen?.(this.xterm);
      }
    }
    this._register(xterm.shellIntegration.onDidChangeStatus(() => {
      if (this.hasFocus) {
        this._setShellIntegrationContextKey();
      } else {
        this._terminalShellIntegrationEnabledContextKey.reset();
      }
    }));
    if (!xterm.raw.element || !xterm.raw.textarea) {
      throw new Error("xterm elements not set after open");
    }
    this._setAriaLabel(xterm.raw, this._instanceId, this._title);
    xterm.raw.attachCustomKeyEventHandler((event) => {
      if (this._isExiting) {
        return false;
      }
      const standardKeyboardEvent = new StandardKeyboardEvent(event);
      const resolveResult = this._keybindingService.softDispatch(standardKeyboardEvent, standardKeyboardEvent.target);
      const isValidChord = resolveResult.kind === ResultKind.MoreChordsNeeded && this._terminalConfigurationService.config.allowChords && event.key !== "Escape";
      if (this._keybindingService.inChordMode || isValidChord) {
        event.preventDefault();
        return false;
      }
      if (!this._terminalConfigurationService.config.sendKeybindingsToShell && resolveResult.kind === ResultKind.KbFound && resolveResult.commandId && (event.metaKey || this._terminalConfigurationService.shouldCommandSkipShell(resolveResult.commandId))) {
        event.preventDefault();
        return false;
      }
      if (this._terminalConfigurationService.config.allowMnemonics && !isMacintosh && event.altKey) {
        return false;
      }
      if (TabFocus.getTabFocusMode() && event.key === "Tab") {
        return false;
      }
      if (event.key === "Tab" && event.shiftKey) {
        event.preventDefault();
        return true;
      }
      if (isWindows && event.altKey && event.key === "F4" && !event.ctrlKey) {
        return false;
      }
      if (!BrowserFeatures.clipboard.readText && event.key === "v" && event.ctrlKey) {
        return false;
      }
      return true;
    });
    this._register(dom.addDisposableListener(xterm.raw.element, "mousedown", () => {
      const listener = dom.addDisposableListener(xterm.raw.element.ownerDocument, "mouseup", () => {
        setTimeout(() => this._refreshSelectionContextKey(), 0);
        listener.dispose();
      });
    }));
    this._register(dom.addDisposableListener(xterm.raw.element, "touchstart", () => {
      xterm.raw.focus();
    }));
    this._register(dom.addDisposableListener(xterm.raw.element, "keyup", () => {
      setTimeout(() => this._refreshSelectionContextKey(), 0);
    }));
    this._register(dom.addDisposableListener(xterm.raw.textarea, "focus", () => this._setFocus(true)));
    this._register(dom.addDisposableListener(xterm.raw.textarea, "blur", () => this._setFocus(false)));
    this._register(dom.addDisposableListener(xterm.raw.textarea, "focusout", () => this._setFocus(false)));
    this._initDragAndDrop(this._container);
    this._widgetManager.attachToElement(screenElement);
    if (this._lastLayoutDimensions) {
      this.layout(this._lastLayoutDimensions);
    }
    this.updateConfig();
    if (xterm.raw.options.disableStdin) {
      this._attachPressAnyKeyToCloseListener(xterm.raw);
    }
  }
  _setFocus(focused) {
    if (focused) {
      this._terminalFocusContextKey.set(true);
      this._setShellIntegrationContextKey();
      this._onDidFocus.fire(this);
    } else {
      this.resetFocusContextKey();
      this._onDidBlur.fire(this);
      this._refreshSelectionContextKey();
    }
  }
  _setShellIntegrationContextKey() {
    if (this.xterm) {
      this._terminalShellIntegrationEnabledContextKey.set(this.xterm.shellIntegration.status === ShellIntegrationStatus.VSCode);
    }
  }
  resetFocusContextKey() {
    this._terminalFocusContextKey.reset();
    this._terminalShellIntegrationEnabledContextKey.reset();
  }
  _initDragAndDrop(container) {
    const store = new DisposableStore();
    const dndController = store.add(this._scopedInstantiationService.createInstance(TerminalInstanceDragAndDropController, container));
    store.add(dndController.onDropTerminal((e) => this._onRequestAddInstanceToGroup.fire(e)));
    store.add(dndController.onDropFile(async (path2) => {
      this.focus();
      await this.sendPath(path2, false);
    }));
    store.add(new dom.DragAndDropObserver(container, dndController));
    this._dndObserver.value = store;
  }
  hasSelection() {
    return this.xterm ? this.xterm.raw.hasSelection() : false;
  }
  get selection() {
    return this.xterm && this.hasSelection() ? this.xterm.raw.getSelection() : void 0;
  }
  clearSelection() {
    this.xterm?.raw.clearSelection();
  }
  _refreshAltBufferContextKey() {
    this._terminalAltBufferActiveContextKey.set(!!(this.xterm && this.xterm.raw.buffer.active === this.xterm.raw.buffer.alternate));
  }
  dispose(reason) {
    if (this.shellLaunchConfig.type === "Task" && reason === TerminalExitReason.Process && this._exitCode !== 0 && !this.shellLaunchConfig.waitOnExit) {
      return;
    }
    if (this.isDisposed) {
      return;
    }
    this._logService.trace(`terminalInstance#dispose (instanceId: ${this.instanceId})`);
    this._isDisposing = true;
    dispose(this._widgetManager);
    if (this.xterm?.raw.element) {
      this._hadFocusOnExit = this.hasFocus;
    }
    if (this._wrapperElement.xterm) {
      this._wrapperElement.xterm = void 0;
    }
    if (this._horizontalScrollbar) {
      this._horizontalScrollbar.dispose();
      this._horizontalScrollbar = void 0;
    }
    this._onWillDispose.fire(this);
    try {
      this.xterm?.dispose();
    } catch (err) {
      this._logService.error("Exception occurred during xterm disposal", err);
    }
    if (isFirefox) {
      this.resetFocusContextKey();
      this._terminalHasTextContextKey.reset();
      this._onDidBlur.fire(this);
    }
    if (this._pressAnyKeyToCloseListener) {
      this._pressAnyKeyToCloseListener.dispose();
      this._pressAnyKeyToCloseListener = void 0;
    }
    if (this._exitReason === void 0) {
      this._exitReason = reason ?? TerminalExitReason.Unknown;
    }
    this._resizeDebouncer?.dispose();
    this._resizeDebouncer = void 0;
    this._processManager.dispose();
    this._onProcessExit(void 0);
    this._onDisposed.fire(this);
    super.dispose();
  }
  async detachProcessAndDispose(reason) {
    await this._processManager.detachFromProcess(reason === TerminalExitReason.User);
    this.dispose(reason);
  }
  focus(force) {
    this._refreshAltBufferContextKey();
    if (!this.xterm) {
      return;
    }
    if (force || !dom.getActiveWindow().getSelection()?.toString()) {
      this.xterm.raw.focus();
      this._onDidRequestFocus.fire();
    }
  }
  async focusWhenReady(force) {
    await this._xtermReadyPromise;
    await this._attachBarrier.wait();
    this.focus(force);
  }
  async sendText(text, shouldExecute, forceBracketedPasteMode) {
    if (forceBracketedPasteMode && this.xterm?.raw.modes.bracketedPasteMode) {
      text = `\x1B[200~${text}\x1B[201~`;
    }
    text = text.replace(/\r?\n/g, "\r");
    if (shouldExecute && !text.endsWith("\r")) {
      text += "\r";
    }
    this._logService.debug("sending data (vscode)", text);
    await this._processManager.write(text);
    this._onDidInputData.fire(text);
    this._onDidSendText.fire(text);
    this.xterm?.scrollToBottom();
    if (shouldExecute) {
      this._onDidExecuteText.fire();
    }
  }
  async sendSignal(signal) {
    this._logService.debug("sending signal (vscode)", signal);
    await this._processManager.sendSignal(signal);
  }
  async sendPath(originalPath, shouldExecute) {
    return this.sendText(await this.preparePathForShell(originalPath), shouldExecute);
  }
  async preparePathForShell(originalPath) {
    await this.processReady;
    return preparePathForShell(originalPath, this.shellLaunchConfig.executable, this.title, this.shellType, this._processManager.backend, this._processManager.os);
  }
  async getUriLabelForShell(uri) {
    await this.processReady;
    return getUriLabelForShell(uri, this._processManager.backend, this.shellType, this.os);
  }
  setVisible(visible) {
    const didChange = this._isVisible !== visible;
    this._isVisible = visible;
    this._wrapperElement.classList.toggle("active", visible);
    if (visible && this.xterm) {
      this._open();
      this._resizeDebouncer?.flush();
      this._resize();
    }
    if (didChange) {
      this._onDidChangeVisibility.fire(visible);
    }
  }
  scrollDownLine() {
    this.xterm?.scrollDownLine();
  }
  scrollDownPage() {
    this.xterm?.scrollDownPage();
  }
  scrollToBottom() {
    this.xterm?.scrollToBottom();
  }
  scrollUpLine() {
    this.xterm?.scrollUpLine();
  }
  scrollUpPage() {
    this.xterm?.scrollUpPage();
  }
  scrollToTop() {
    this.xterm?.scrollToTop();
  }
  clearBuffer() {
    this._processManager.clearBuffer();
    this.xterm?.clearBuffer();
  }
  _refreshSelectionContextKey() {
    const isActive = !!this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
    let isEditorActive = false;
    const editor = this._editorService.activeEditor;
    if (editor) {
      isEditorActive = editor instanceof TerminalEditorInput;
    }
    this._terminalHasTextContextKey.set((isActive || isEditorActive) && this.hasSelection());
  }
  _createProcessManager() {
    let deserializedCollections;
    if (this.shellLaunchConfig.attachPersistentProcess?.environmentVariableCollections) {
      deserializedCollections = deserializeEnvironmentVariableCollections(this.shellLaunchConfig.attachPersistentProcess.environmentVariableCollections);
    }
    const processManager = this._scopedInstantiationService.createInstance(
      TerminalProcessManager,
      this._instanceId,
      this.shellLaunchConfig?.cwd,
      deserializedCollections,
      this.shellLaunchConfig.shellIntegrationNonce ?? this.shellLaunchConfig.attachPersistentProcess?.shellIntegrationNonce
    );
    this.capabilities.add(processManager.capabilities);
    this._register(processManager.onProcessReady(async (e) => {
      this._onProcessIdReady.fire(this);
      this._initialCwd = await this.getInitialCwd();
      if (!this._labelComputer) {
        this._labelComputer = this._register(this._scopedInstantiationService.createInstance(TerminalLabelComputer));
        this._register(this._labelComputer.onDidChangeLabel((e2) => {
          const wasChanged = this._title !== e2.title || this._description !== e2.description;
          if (wasChanged) {
            this._title = e2.title;
            this._description = e2.description;
            this._onTitleChanged.fire(this);
          }
        }));
      }
      if (this._shellLaunchConfig.name && !this._shellLaunchConfig.titleTemplate) {
        this._setTitle(this._shellLaunchConfig.name, TitleEventSource.Api);
      } else {
        setTimeout(() => {
          this._xtermReadyPromise.then((xterm) => {
            if (xterm) {
              this._messageTitleDisposable.value = xterm.raw.onTitleChange((e2) => this._onTitleChange(e2));
            }
          });
        });
        if (this._shellLaunchConfig.titleTemplate && this._shellLaunchConfig.name) {
          this._setTitle(this._shellLaunchConfig.name, TitleEventSource.Process);
        } else {
          this._setTitle(this._shellLaunchConfig.executable, TitleEventSource.Process);
        }
      }
    }));
    this._register(processManager.onProcessExit((exitCode) => this._onProcessExit(exitCode)));
    this._register(processManager.onDidChangeProperty(({ type, value }) => {
      switch (type) {
        case ProcessPropertyType.Cwd:
          this._cwd = value;
          this._labelComputer?.refreshLabel(this);
          break;
        case ProcessPropertyType.InitialCwd:
          this._initialCwd = value;
          this._cwd = this._initialCwd;
          this._setTitle(this.title, TitleEventSource.Config);
          this._icon = this._shellLaunchConfig.attachPersistentProcess?.icon || this._shellLaunchConfig.icon;
          this._onIconChanged.fire({ instance: this, userInitiated: false });
          break;
        case ProcessPropertyType.Title:
          this._setTitle(value ?? "", TitleEventSource.Process);
          break;
        case ProcessPropertyType.OverrideDimensions:
          this.setOverrideDimensions(value, true);
          break;
        case ProcessPropertyType.ResolvedShellLaunchConfig:
          this._setResolvedShellLaunchConfig(value);
          break;
        case ProcessPropertyType.ShellType:
          this._handleShellTypeChange(value);
          break;
        case ProcessPropertyType.HasChildProcesses:
          this._onDidChangeHasChildProcesses.fire(value);
          break;
        case ProcessPropertyType.UsedShellIntegrationInjection:
          this._usedShellIntegrationInjection = true;
          break;
        case ProcessPropertyType.ShellIntegrationInjectionFailureReason:
          this._shellIntegrationInjectionInfo = value;
          break;
      }
    }));
    this._initialDataEventsListener.value = processManager.onProcessData((ev) => this._initialDataEvents?.push(ev.data));
    this._register(processManager.onProcessReplayComplete(() => this._onProcessReplayComplete.fire()));
    this._register(processManager.onEnvironmentVariableInfoChanged((e) => this._onEnvironmentVariableInfoChanged(e)));
    this._register(processManager.onPtyDisconnect(() => {
      if (this.xterm) {
        this.xterm.raw.options.disableStdin = true;
      }
      this.statusList.add({
        id: TerminalStatus.Disconnected,
        severity: Severity.Error,
        icon: Codicon.debugDisconnect,
        tooltip: nls.localize("disconnectStatus", "Lost connection to process")
      });
    }));
    this._register(processManager.onPtyReconnect(() => {
      if (this.xterm) {
        this.xterm.raw.options.disableStdin = false;
      }
      this.statusList.remove(TerminalStatus.Disconnected);
    }));
    return processManager;
  }
  async _createProcess() {
    if (this.isDisposed) {
      return;
    }
    const trusted = this._isRemoteResolverTerminal || await this._trust();
    const isRemoteTerminal = !!this.remoteAuthority;
    if (!trusted && !(isRemoteTerminal && this._workbenchEnvironmentService.remoteAuthority)) {
      this._onProcessExit({ message: nls.localize("workspaceNotTrustedCreateTerminal", "Cannot launch a terminal process in an untrusted workspace") });
      return;
    } else if (this._workspaceContextService.getWorkspace().folders.length === 0 && this._cwd && this._userHome && normalizeDriveLetter(this._cwd) !== normalizeDriveLetter(this._userHome)) {
      this._onProcessExit({
        message: nls.localize("workspaceEmptyCreateTerminalCwd", "Cannot launch a terminal process in an empty workspace with cwd {0} different from userHome {1}", this._cwd, this._userHome)
      });
      return;
    }
    if (this._container && this._cols === 0 && this._rows === 0) {
      this._initDimensions();
      this.xterm?.resize(this._cols || 80 /* DefaultCols */, this._rows || 30 /* DefaultRows */);
    }
    const originalIcon = this.shellLaunchConfig.icon;
    await this._processManager.createProcess(this._shellLaunchConfig, this._cols || 80 /* DefaultCols */, this._rows || 30 /* DefaultRows */).then((result) => {
      if (result) {
        if (hasKey(result, { message: true })) {
          this._onProcessExit(result);
        } else if (hasKey(result, { injectedArgs: true })) {
          this._injectedArgs = result.injectedArgs;
        }
      }
    });
    if (this.isDisposed) {
      return;
    }
    if (originalIcon !== this.shellLaunchConfig.icon || this.shellLaunchConfig.color) {
      this._icon = this._shellLaunchConfig.attachPersistentProcess?.icon || this._shellLaunchConfig.icon;
      this._onIconChanged.fire({ instance: this, userInitiated: false });
    }
  }
  registerMarker(offset) {
    return this.xterm?.raw.registerMarker(offset);
  }
  addBufferMarker(properties) {
    this.capabilities.get(TerminalCapability.BufferMarkDetection)?.addMark(properties);
  }
  scrollToMark(startMarkId, endMarkId, highlight) {
    this.xterm?.markTracker.scrollToClosestMarker(startMarkId, endMarkId, highlight);
  }
  async freePortKillProcess(port, command) {
    await this._processManager?.freePortKillProcess(port);
    this.runCommand(command, false);
  }
  _onProcessData(ev) {
    const leadingSegmentedData = [];
    const matches = ev.data.matchAll(/(?<seq>\x1b\][16]33;(?:C|D(?:;\d+)?)\x07)/g);
    let i = 0;
    for (const match of matches) {
      if (match.groups?.seq === void 0) {
        throw new BugIndicatingError("seq must be defined");
      }
      leadingSegmentedData.push(ev.data.substring(i, match.index));
      leadingSegmentedData.push(match.groups?.seq ?? "");
      i = match.index + match[0].length;
    }
    const lastData = ev.data.substring(i);
    for (let i2 = 0; i2 < leadingSegmentedData.length; i2++) {
      this._writeProcessData(leadingSegmentedData[i2]);
    }
    if (ev.trackCommit) {
      ev.writePromise = new Promise((r) => this._writeProcessData(lastData, r));
    } else {
      this._writeProcessData(lastData);
    }
  }
  _writeProcessData(data, cb) {
    this._onWillData.fire(data);
    const messageId = ++this._latestXtermWriteData;
    this.xterm?.raw.write(data, () => {
      this._latestXtermParseData = messageId;
      this._processManager.acknowledgeDataEvent(data.length);
      cb?.();
      this._onData.fire(data);
    });
  }
  /**
   * Called when either a process tied to a terminal has exited or when a terminal renderer
   * simulates a process exiting (e.g. custom execution task).
   * @param exitCode The exit code of the process, this is undefined when the terminal was exited
   * through user action.
   */
  async _onProcessExit(exitCodeOrError) {
    if (this._isExiting || this.isDisposed) {
      return;
    }
    const parsedExitResult = parseExitResult(exitCodeOrError, this.shellLaunchConfig, this._processManager.processState, this._initialCwd);
    if (this._usedShellIntegrationInjection && this._processManager.processState === ProcessState.KilledDuringLaunch && parsedExitResult?.code !== 0) {
      this._relaunchWithShellIntegrationDisabled(parsedExitResult?.message);
      this._onExit.fire(exitCodeOrError);
      return;
    }
    this._isExiting = true;
    await this._flushXtermData();
    this._exitCode = parsedExitResult?.code;
    const exitMessage = parsedExitResult?.message;
    this._logService.debug("Terminal process exit", "instanceId", this.instanceId, "code", this._exitCode, "processState", this._processManager.processState);
    this._onExit.fire(exitCodeOrError);
    if (this.isDisposed) {
      return;
    }
    const waitOnExit = this.waitOnExit;
    if (waitOnExit && this._processManager.processState !== ProcessState.KilledByUser) {
      this._xtermReadyPromise.then((xterm) => {
        if (!xterm) {
          return;
        }
        if (exitMessage) {
          xterm.raw.write(formatMessageForTerminal(exitMessage));
        }
        switch (typeof waitOnExit) {
          case "string":
            xterm.raw.write(formatMessageForTerminal(waitOnExit, { excludeLeadingNewLine: true }));
            break;
          case "function":
            if (this.exitCode !== void 0) {
              xterm.raw.write(formatMessageForTerminal(waitOnExit(this.exitCode), { excludeLeadingNewLine: true }));
            }
            break;
        }
        xterm.raw.options.disableStdin = true;
        if (xterm.raw.textarea) {
          this._attachPressAnyKeyToCloseListener(xterm.raw);
        }
      });
    } else {
      if (exitMessage) {
        const failedDuringLaunch = this._processManager.processState === ProcessState.KilledDuringLaunch;
        if (failedDuringLaunch || this._terminalConfigurationService.config.showExitAlert && this.xterm?.lastInputEvent !== /*Ctrl+D*/
        "") {
          this._notificationService.notify({
            message: exitMessage,
            severity: Severity.Error,
            actions: { primary: [this._scopedInstantiationService.createInstance(TerminalLaunchHelpAction)] }
          });
        } else {
          this._logService.warn(exitMessage);
        }
      }
      this.dispose(TerminalExitReason.Process);
    }
    if (this.isDisposed) {
      this._onExit.dispose();
    }
  }
  _relaunchWithShellIntegrationDisabled(exitMessage) {
    this._shellLaunchConfig.ignoreShellIntegration = true;
    this.relaunch();
    this.statusList.add({
      id: TerminalStatus.ShellIntegrationAttentionNeeded,
      severity: Severity.Warning,
      icon: Codicon.warning,
      tooltip: `${exitMessage} ` + nls.localize("launchFailed.exitCodeOnlyShellIntegration", "Disabling shell integration in user settings might help."),
      hoverActions: [{
        commandId: TerminalCommandId.ShellIntegrationLearnMore,
        label: nls.localize("shellIntegration.learnMore", "Learn more about shell integration"),
        run: () => {
          this._openerService.open("https://code.visualstudio.com/docs/terminal/shell-integration?referrer=in-product");
        }
      }, {
        commandId: "workbench.action.openSettings",
        label: nls.localize("shellIntegration.openSettings", "Open user settings"),
        run: () => {
          this._commandService.executeCommand("workbench.action.openSettings", "terminal.integrated.shellIntegration.enabled");
        }
      }]
    });
    this._telemetryService.publicLog2("terminal/shellIntegrationFailureProcessExit");
  }
  /**
   * Ensure write calls to xterm.js have finished before resolving.
   */
  _flushXtermData() {
    if (this._latestXtermWriteData === this._latestXtermParseData) {
      return Promise.resolve();
    }
    let retries = 0;
    return new Promise((r) => {
      const interval = dom.disposableWindowInterval(dom.getActiveWindow().window, () => {
        if (this._latestXtermWriteData === this._latestXtermParseData || ++retries === 5) {
          interval.dispose();
          r();
        }
      }, 20);
    });
  }
  _attachPressAnyKeyToCloseListener(xterm) {
    if (xterm.textarea && !this._pressAnyKeyToCloseListener) {
      this._pressAnyKeyToCloseListener = dom.addDisposableListener(xterm.textarea, "keypress", (event) => {
        if (this._pressAnyKeyToCloseListener) {
          this._pressAnyKeyToCloseListener.dispose();
          this._pressAnyKeyToCloseListener = void 0;
          this.dispose(TerminalExitReason.Process);
          event.preventDefault();
        }
      });
    }
  }
  _writeInitialText(xterm, callback) {
    if (!this._shellLaunchConfig.initialText) {
      callback?.();
      return;
    }
    const text = isString(this._shellLaunchConfig.initialText) ? this._shellLaunchConfig.initialText : this._shellLaunchConfig.initialText?.text;
    if (isString(this._shellLaunchConfig.initialText)) {
      xterm.raw.writeln(text, callback);
    } else {
      if (this._shellLaunchConfig.initialText.trailingNewLine) {
        xterm.raw.writeln(text, callback);
      } else {
        xterm.raw.write(text, callback);
      }
    }
  }
  async reuseTerminal(shell, reset = false) {
    this._pressAnyKeyToCloseListener?.dispose();
    this._pressAnyKeyToCloseListener = void 0;
    const xterm = this.xterm;
    if (xterm) {
      if (!reset) {
        await new Promise((r) => xterm.raw.write("\n\x1B[G", r));
      }
      if (shell.initialText) {
        this._shellLaunchConfig.initialText = shell.initialText;
        await new Promise((r) => this._writeInitialText(xterm, r));
      }
      if (this._isExiting && this._shellLaunchConfig.waitOnExit) {
        xterm.raw.options.disableStdin = false;
        this._isExiting = false;
      }
      if (reset) {
        xterm.clearDecorations();
      }
    }
    this.statusList.remove(TerminalStatus.RelaunchNeeded);
    if (!reset) {
      shell.initialText = " ";
    }
    this._shellLaunchConfig = shell;
    this._agentShellTypeFromSequence = void 0;
    await this._processManager.relaunch(this._shellLaunchConfig, this._cols || 80 /* DefaultCols */, this._rows || 30 /* DefaultRows */, reset).then((result) => {
      if (result) {
        if (hasKey(result, { message: true })) {
          this._onProcessExit(result);
        } else if (hasKey(result, { injectedArgs: true })) {
          this._injectedArgs = result.injectedArgs;
        }
      }
    });
  }
  relaunch() {
    const shellLaunchConfig = { ...this._shellLaunchConfig };
    delete shellLaunchConfig.attachPersistentProcess;
    this.reuseTerminal(shellLaunchConfig, true);
  }
  _onTitleChange(title) {
    if (this.isTitleSetByProcess) {
      this._setTitle(title, TitleEventSource.Sequence);
    }
    for (const [shellType, pattern] of agentCliTitlePatterns) {
      if (pattern.test(title)) {
        this._agentShellTypeFromSequence = shellType;
        this.setShellType(shellType);
        break;
      }
    }
  }
  _handleShellTypeChange(shellType) {
    if (this._agentShellTypeFromSequence) {
      if (shellType === GeneralShellType.Node || shellType === void 0) {
        return;
      }
      this._agentShellTypeFromSequence = void 0;
    }
    this.setShellType(shellType);
  }
  async _trust() {
    if (this._configurationService.getValue(TerminalSettingId.AllowInUntrustedWorkspace)) {
      this._logService.info(`Workspace trust check bypassed due to ${TerminalSettingId.AllowInUntrustedWorkspace}`);
      return true;
    }
    const trustRequest = await this._workspaceTrustRequestService.requestWorkspaceTrust({
      message: nls.localize("terminal.requestTrust", "Creating a terminal process requires executing code")
    });
    return trustRequest === true;
  }
  async _updateProcessCwd() {
    if (this.isDisposed || this.shellLaunchConfig.customPtyImplementation) {
      return;
    }
    try {
      const cwd = await this._refreshProperty(ProcessPropertyType.Cwd);
      if (!isString(cwd)) {
        throw new Error(`cwd is not a string ${cwd}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Cannot refresh property when process is not set") {
        return;
      }
      throw e;
    }
  }
  updateConfig() {
    this._refreshEnvironmentVariableInfoWidgetState(this._processManager.environmentVariableInfo);
  }
  async _updateUnicodeVersion() {
    this._processManager.setUnicodeVersion(this._terminalConfigurationService.config.unicodeVersion);
  }
  updateAccessibilitySupport() {
    this.xterm.raw.options.screenReaderMode = this._accessibilityService.isScreenReaderOptimized();
  }
  layout(dimension) {
    this._lastLayoutDimensions = dimension;
    if (this.disableLayout) {
      return;
    }
    if (dimension.width <= 0 || dimension.height <= 0) {
      return;
    }
    const terminalWidth = this._evaluateColsAndRows(dimension.width, dimension.height);
    if (!terminalWidth) {
      return;
    }
    this._resize();
    if (!this._containerReadyBarrier.isOpen()) {
      this._containerReadyBarrier.open();
    }
    for (const contribution of this._contributions.values()) {
      if (!this.xterm) {
        this._xtermReadyPromise.then((xterm) => {
          if (xterm) {
            contribution.layout?.(xterm, dimension);
          }
        });
      } else {
        contribution.layout?.(this.xterm, dimension);
      }
    }
  }
  async _resize(immediate) {
    if (!this.xterm || !this._resizeDebouncer || this.isDisposed || this._isDisposing) {
      return;
    }
    let cols = this.cols;
    let rows = this.rows;
    if (this._isVisible && this._layoutSettingsChanged) {
      const font = this.xterm.getFont();
      const config = this._terminalConfigurationService.config;
      this.xterm.raw.options.letterSpacing = font.letterSpacing;
      this.xterm.raw.options.lineHeight = font.lineHeight;
      this.xterm.raw.options.fontSize = font.fontSize;
      this.xterm.raw.options.fontFamily = font.fontFamily;
      this.xterm.raw.options.fontWeight = config.fontWeight;
      this.xterm.raw.options.fontWeightBold = config.fontWeightBold;
      this._initDimensions();
      cols = this.cols;
      rows = this.rows;
      this._layoutSettingsChanged = false;
    }
    if (isNaN(cols) || isNaN(rows)) {
      return;
    }
    if (cols !== this.xterm.raw.cols || rows !== this.xterm.raw.rows) {
      if (this._fixedRows || this._fixedCols) {
        await this._updateProperty(ProcessPropertyType.FixedDimensions, { cols: this._fixedCols, rows: this._fixedRows });
      }
      this._onDimensionsChanged.fire();
    }
    TerminalInstance._lastKnownGridDimensions = { cols, rows };
    this._resizeDebouncer?.resize(cols, rows, immediate ?? false);
  }
  async _updatePtyDimensions(rawXterm) {
    if (this.isDisposed) {
      return;
    }
    const pixelWidth = rawXterm.dimensions?.css.canvas.width;
    const pixelHeight = rawXterm.dimensions?.css.canvas.height;
    const roundedPixelWidth = pixelWidth ? Math.round(pixelWidth) : void 0;
    const roundedPixelHeight = pixelHeight ? Math.round(pixelHeight) : void 0;
    await this._processManager.setDimensions(rawXterm.cols, rawXterm.rows, void 0, roundedPixelWidth, roundedPixelHeight);
  }
  setShellType(shellType) {
    if (this._shellType === shellType) {
      return;
    }
    this._shellType = shellType;
    if (shellType === void 0) {
      this._terminalShellTypeContextKey.reset();
    } else {
      this._terminalShellTypeContextKey.set(shellType?.toString());
    }
    this._onDidChangeShellType.fire(shellType);
    this._labelComputer?.refreshLabel(this);
  }
  _setAriaLabel(xterm, terminalId, title) {
    const labelParts = [];
    if (xterm && xterm.textarea) {
      if (title && title.length > 0) {
        labelParts.push(nls.localize("terminalTextBoxAriaLabelNumberAndTitle", "Terminal {0}, {1}", terminalId, title));
      } else {
        labelParts.push(nls.localize("terminalTextBoxAriaLabel", "Terminal {0}", terminalId));
      }
      const screenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
      if (!screenReaderOptimized) {
        labelParts.push(nls.localize("terminalScreenReaderMode", "Run the command: Toggle Screen Reader Accessibility Mode for an optimized screen reader experience"));
      }
      const accessibilityHelpKeybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      if (this._configurationService.getValue(AccessibilityVerbositySettingId.Terminal) && accessibilityHelpKeybinding) {
        labelParts.push(nls.localize("terminalHelpAriaLabel", "Use {0} for terminal accessibility help", accessibilityHelpKeybinding));
      }
      xterm.textarea.setAttribute("aria-label", labelParts.join("\n"));
    }
  }
  _updateTitleProperties(title, eventSource) {
    if (title === void 0) {
      return this._processName;
    }
    switch (eventSource) {
      case TitleEventSource.Process:
        if (this._processManager.os === OperatingSystem.Windows) {
          title = path.win32.parse(title).name;
        } else {
          const firstSpaceIndex = title.indexOf(" ");
          if (title.startsWith("/")) {
            title = path.basename(title);
          } else if (firstSpaceIndex > -1) {
            title = title.substring(0, firstSpaceIndex);
          }
        }
        this._processName = title;
        break;
      case TitleEventSource.Api:
        this._staticTitle = title;
        this._messageTitleDisposable.value = void 0;
        break;
      case TitleEventSource.Sequence:
        this._sequence = title;
        if (this._processManager.os === OperatingSystem.Windows && title.match(/^[a-zA-Z]:\\.+\.[a-zA-Z]{1,3}/)) {
          this._sequence = path.win32.parse(title).name;
        }
        break;
    }
    this._titleSource = eventSource;
    return title;
  }
  setOverrideDimensions(dimensions, immediate = false) {
    if (this._dimensionsOverride && this._dimensionsOverride.forceExactSize && !dimensions && this._rows === 0 && this._cols === 0) {
      this._cols = this._dimensionsOverride.cols;
      this._rows = this._dimensionsOverride.rows;
    }
    this._dimensionsOverride = dimensions;
    if (immediate) {
      this._resize(true);
    } else {
      this._resize();
    }
  }
  async setFixedDimensions() {
    const cols = await this._quickInputService.input({
      title: nls.localize("setTerminalDimensionsColumn", "Set Fixed Dimensions: Column"),
      placeHolder: "Enter a number of columns or leave empty for automatic width",
      validateInput: async (text) => text.length > 0 && !text.match(/^\d+$/) ? { content: "Enter a number or leave empty size automatically", severity: Severity.Error } : void 0
    });
    if (cols === void 0) {
      return;
    }
    this._fixedCols = this._parseFixedDimension(cols);
    this._labelComputer?.refreshLabel(this);
    this._terminalHasFixedWidth.set(!!this._fixedCols);
    const rows = await this._quickInputService.input({
      title: nls.localize("setTerminalDimensionsRow", "Set Fixed Dimensions: Row"),
      placeHolder: "Enter a number of rows or leave empty for automatic height",
      validateInput: async (text) => text.length > 0 && !text.match(/^\d+$/) ? { content: "Enter a number or leave empty size automatically", severity: Severity.Error } : void 0
    });
    if (rows === void 0) {
      return;
    }
    this._fixedRows = this._parseFixedDimension(rows);
    this._labelComputer?.refreshLabel(this);
    await this._refreshScrollbar();
    this._resize();
    this.focus();
  }
  _parseFixedDimension(value) {
    if (value === "") {
      return void 0;
    }
    const parsed = parseInt(value);
    if (parsed <= 0) {
      throw new Error(`Could not parse dimension "${value}"`);
    }
    return parsed;
  }
  async toggleSizeToContentWidth() {
    if (!this.xterm?.raw.buffer.active) {
      return;
    }
    if (this._hasScrollBar) {
      this._terminalHasFixedWidth.set(false);
      this._fixedCols = void 0;
      this._fixedRows = void 0;
      this._hasScrollBar = false;
      this._initDimensions();
      await this._resize();
    } else {
      const font = this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement));
      const maxColsForTexture = Math.floor(4096 /* MaxCanvasWidth */ / (font.charWidth ?? 20));
      const proposedCols = Math.max(this.maxCols, Math.min(this.xterm.getLongestViewportWrappedLineLength(), maxColsForTexture));
      if (proposedCols > this.xterm.raw.cols) {
        this._fixedCols = proposedCols;
      }
    }
    await this._refreshScrollbar();
    this._labelComputer?.refreshLabel(this);
    this.focus();
  }
  _refreshScrollbar() {
    if (this._fixedCols || this._fixedRows) {
      return this._addScrollbar();
    }
    return this._removeScrollbar();
  }
  async _addScrollbar() {
    const charWidth = (this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement))).charWidth;
    if (!this.xterm?.raw.element || !this._container || !charWidth || !this._fixedCols) {
      return;
    }
    this._wrapperElement.classList.add("fixed-dims");
    this._hasScrollBar = true;
    this._initDimensions();
    await this._resize();
    this._terminalHasFixedWidth.set(true);
    if (!this._horizontalScrollbar) {
      this._horizontalScrollbar = this._register(new DomScrollableElement(this._wrapperElement, {
        vertical: ScrollbarVisibility.Hidden,
        horizontal: ScrollbarVisibility.Auto,
        useShadows: false,
        scrollYToX: false,
        consumeMouseWheelIfScrollbarIsNeeded: false
      }));
      this._container.appendChild(this._horizontalScrollbar.getDomNode());
    }
    this._horizontalScrollbar.setScrollDimensions({
      width: this.xterm.raw.element.clientWidth,
      scrollWidth: this._fixedCols * charWidth + 40
      // Padding + scroll bar
    });
    this._horizontalScrollbar.getDomNode().style.paddingBottom = "16px";
    if (isWindows) {
      for (let i = this.xterm.raw.buffer.active.viewportY; i < this.xterm.raw.buffer.active.length; i++) {
        const line = this.xterm.raw.buffer.active.getLine(i);
        line._line.isWrapped = false;
      }
    }
  }
  async _removeScrollbar() {
    if (!this._container || !this._horizontalScrollbar) {
      return;
    }
    this._horizontalScrollbar.getDomNode().remove();
    this._horizontalScrollbar.dispose();
    this._horizontalScrollbar = void 0;
    this._wrapperElement.remove();
    this._wrapperElement.classList.remove("fixed-dims");
    this._container.appendChild(this._wrapperElement);
  }
  _setResolvedShellLaunchConfig(shellLaunchConfig) {
    this._shellLaunchConfig.args = shellLaunchConfig.args;
    this._shellLaunchConfig.cwd = shellLaunchConfig.cwd;
    this._shellLaunchConfig.executable = shellLaunchConfig.executable;
    this._shellLaunchConfig.env = shellLaunchConfig.env;
  }
  _onEnvironmentVariableInfoChanged(info) {
    if (info.requiresAction) {
      this.xterm?.raw.textarea?.setAttribute("aria-label", nls.localize("terminalStaleTextBoxAriaLabel", "Terminal {0} environment is stale, run the 'Show Environment Information' command for more information", this._instanceId));
    }
    this._refreshEnvironmentVariableInfoWidgetState(info);
  }
  async _refreshEnvironmentVariableInfoWidgetState(info) {
    if (!info) {
      this.statusList.remove(TerminalStatus.RelaunchNeeded);
      this.statusList.remove(TerminalStatus.EnvironmentVariableInfoChangesActive);
      return;
    }
    if (
      // The change requires a relaunch
      info.requiresAction && // The feature is enabled
      this._terminalConfigurationService.config.environmentChangesRelaunch && // Has not been interacted with
      !this._processManager.hasWrittenData && // Not a feature terminal or is a reconnecting task terminal (TODO: Need to explain the latter case)
      (!this._shellLaunchConfig.isFeatureTerminal || this.reconnectionProperties && this._configurationService.getValue("task.reconnection") === true) && // Not a custom pty
      !this._shellLaunchConfig.customPtyImplementation && // Not an extension owned terminal
      !this._shellLaunchConfig.isExtensionOwnedTerminal && // Not a reconnected or revived terminal
      !this._shellLaunchConfig.attachPersistentProcess && // Not a Windows remote using ConPTY which cannot relaunch (#187084). ConPTY is used on
      // Windows builds 18309+.
      !(this._processManager.remoteAuthority && await this._processManager.getBackendOS() === OperatingSystem.Windows && this._processManager.processTraits?.windowsPty?.buildNumber && this._processManager.processTraits.windowsPty.buildNumber >= 18309)
    ) {
      this.relaunch();
      return;
    }
    const workspaceFolder = getWorkspaceForTerminal(this.shellLaunchConfig.cwd, this._workspaceContextService, this._historyService);
    this.statusList.add(info.getStatus({ workspaceFolder }));
  }
  async getInitialCwd() {
    if (!this._initialCwd) {
      this._initialCwd = this._processManager.initialCwd;
    }
    return this._initialCwd;
  }
  async getSpeculativeCwd() {
    if (this.capabilities.has(TerminalCapability.CwdDetection)) {
      return this.capabilities.get(TerminalCapability.CwdDetection).getCwd();
    } else if (this.capabilities.has(TerminalCapability.NaiveCwdDetection)) {
      return this.capabilities.get(TerminalCapability.NaiveCwdDetection).getCwd();
    }
    return this._processManager.initialCwd;
  }
  async getCwdResource() {
    const cwd = this.capabilities.get(TerminalCapability.CwdDetection)?.getCwd();
    if (!cwd) {
      return void 0;
    }
    let resource;
    if (this.remoteAuthority) {
      resource = await this._pathService.fileURI(cwd);
    } else {
      resource = URI.file(cwd);
    }
    if (!await this._fileService.canHandleResource(resource)) {
      return void 0;
    }
    if (await this._fileService.exists(resource)) {
      return resource;
    }
    return void 0;
  }
  async _refreshProperty(type) {
    await this.processReady;
    return this._processManager.refreshProperty(type);
  }
  async _updateProperty(type, value) {
    return this._processManager.updateProperty(type, value);
  }
  async rename(title, source) {
    if (title !== void 0 && !title) {
      title = void 0;
    }
    this._setTitle(title, source ?? TitleEventSource.Api);
  }
  _setTitle(title, eventSource) {
    if ((this._shellLaunchConfig?.type === "Task" || this._titleSource === TitleEventSource.Api) && eventSource === TitleEventSource.Process) {
      return;
    }
    const reset = !title;
    title = this._updateTitleProperties(title, eventSource);
    const titleChanged = title !== this._title;
    this._title = title;
    this._labelComputer?.refreshLabel(this, reset);
    this._setAriaLabel(this.xterm?.raw, this._instanceId, this._title);
    if (titleChanged) {
      this._onTitleChanged.fire(this);
    }
  }
  async changeIcon(icon) {
    if (icon) {
      this._icon = icon;
      this._onIconChanged.fire({ instance: this, userInitiated: true });
      return icon;
    }
    const iconPicker = this._scopedInstantiationService.createInstance(TerminalIconPicker);
    const pickedIcon = await iconPicker.pickIcons();
    iconPicker.dispose();
    if (!pickedIcon) {
      return void 0;
    }
    this._icon = pickedIcon;
    this._onIconChanged.fire({ instance: this, userInitiated: true });
    return pickedIcon;
  }
  async changeColor(color, skipQuickPick) {
    if (color) {
      this.shellLaunchConfig.color = color;
      this._onIconChanged.fire({ instance: this, userInitiated: true });
      return color;
    } else if (skipQuickPick) {
      this.shellLaunchConfig.color = "";
      this._onIconChanged.fire({ instance: this, userInitiated: true });
      return;
    }
    const icon = this._getIcon();
    if (!icon) {
      return;
    }
    const colorTheme = this._themeService.getColorTheme();
    const standardColors = getStandardColors(colorTheme);
    const colorStyleDisposable = createColorStyleElement(colorTheme);
    const items = [];
    for (const colorKey of standardColors) {
      const colorClass = getColorClass(colorKey);
      items.push({
        label: `$(${Codicon.circleFilled.id}) ${colorKey.replace("terminal.ansi", "")}`,
        id: colorKey,
        description: colorKey,
        iconClasses: [colorClass]
      });
    }
    items.push({ type: "separator" });
    const showAllColorsItem = { label: "Reset to default" };
    items.push(showAllColorsItem);
    const disposables = [];
    const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
    disposables.push(quickPick);
    quickPick.items = items;
    quickPick.matchOnDescription = true;
    quickPick.placeholder = nls.localize("changeColor", "Select a color for the terminal");
    quickPick.show();
    const result = await new Promise((r) => {
      disposables.push(quickPick.onDidHide(() => r(void 0)));
      disposables.push(quickPick.onDidAccept(() => r(quickPick.selectedItems[0])));
    });
    dispose(disposables);
    if (result) {
      this.shellLaunchConfig.color = result.id;
      this._onIconChanged.fire({ instance: this, userInitiated: true });
    }
    quickPick.hide();
    colorStyleDisposable.dispose();
    return result?.id;
  }
  forceScrollbarVisibility() {
    this._wrapperElement.classList.add("force-scrollbar");
  }
  resetScrollbarVisibility() {
    this._wrapperElement.classList.remove("force-scrollbar");
  }
  setParentContextKeyService(parentContextKeyService) {
    this._scopedContextKeyService.updateParent(parentContextKeyService);
  }
  async handleMouseEvent(event, contextMenu) {
    if (dom.isHTMLElement(event.target) && (event.target.classList.contains("scrollbar") || event.target.classList.contains("slider"))) {
      return { cancelContextMenu: true };
    }
    for (const contrib of this._contributions.values()) {
      const result = await contrib.handleMouseEvent?.(event);
      if (result?.handled) {
        return { cancelContextMenu: true };
      }
    }
    if (event.which === 2) {
      switch (this._terminalConfigurationService.config.middleClickBehavior) {
        case "default":
        default:
          this.focus();
          break;
      }
      return;
    }
    if (event.which === 3) {
      if (event.shiftKey) {
        openContextMenu(dom.getActiveWindow(), event, this, contextMenu, this._contextMenuService);
        return;
      }
      const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
      if (rightClickBehavior === "nothing") {
        if (!event.shiftKey) {
          return { cancelContextMenu: true };
        }
        return;
      }
    }
  }
};
TerminalInstance._instanceIdCounter = 1;
__decorateClass([
  debounce(50)
], TerminalInstance.prototype, "_fireMaximumDimensionsChanged", 1);
__decorateClass([
  debounce(500)
], TerminalInstance.prototype, "_refreshShellIntegrationInfoStatus", 1);
__decorateClass([
  debounce(1e3)
], TerminalInstance.prototype, "relaunch", 1);
__decorateClass([
  debounce(2e3)
], TerminalInstance.prototype, "_updateProcessCwd", 1);
TerminalInstance = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITerminalConfigurationService),
  __decorateParam(6, ITerminalProfileResolverService),
  __decorateParam(7, IPathService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IPreferencesService),
  __decorateParam(12, IViewsService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, ITerminalLogService),
  __decorateParam(16, IStorageService),
  __decorateParam(17, IAccessibilityService),
  __decorateParam(18, IProductService),
  __decorateParam(19, IQuickInputService),
  __decorateParam(20, IWorkbenchEnvironmentService),
  __decorateParam(21, IWorkspaceContextService),
  __decorateParam(22, IEditorService),
  __decorateParam(23, IWorkspaceTrustRequestService),
  __decorateParam(24, IHistoryService),
  __decorateParam(25, ITelemetryService),
  __decorateParam(26, IOpenerService),
  __decorateParam(27, ICommandService),
  __decorateParam(28, IAccessibilitySignalService),
  __decorateParam(29, IViewDescriptorService)
], TerminalInstance);
let TerminalInstanceDragAndDropController = class extends Disposable {
  constructor(_container, _layoutService, _viewDescriptorService) {
    super();
    this._container = _container;
    this._layoutService = _layoutService;
    this._viewDescriptorService = _viewDescriptorService;
    this._onDropFile = this._register(new Emitter());
    this._onDropTerminal = this._register(new Emitter());
    this._register(toDisposable(() => this._clearDropOverlay()));
  }
  get onDropFile() {
    return this._onDropFile.event;
  }
  get onDropTerminal() {
    return this._onDropTerminal.event;
  }
  _clearDropOverlay() {
    this._dropOverlay?.remove();
    this._dropOverlay = void 0;
  }
  onDragEnter(e) {
    if (!containsDragType(e, DataTransfers.FILES, DataTransfers.RESOURCES, TerminalDataTransfers.Terminals, CodeDataTransfers.FILES)) {
      return;
    }
    if (!this._dropOverlay) {
      this._dropOverlay = document.createElement("div");
      this._dropOverlay.classList.add("terminal-drop-overlay");
    }
    if (containsDragType(e, TerminalDataTransfers.Terminals)) {
      const side = this._getDropSide(e);
      this._dropOverlay.classList.toggle("drop-before", side === "before");
      this._dropOverlay.classList.toggle("drop-after", side === "after");
    }
    if (!this._dropOverlay.parentElement) {
      this._container.appendChild(this._dropOverlay);
    }
  }
  onDragLeave(e) {
    this._clearDropOverlay();
  }
  onDragEnd(e) {
    this._clearDropOverlay();
  }
  onDragOver(e) {
    if (!e.dataTransfer || !this._dropOverlay) {
      return;
    }
    if (containsDragType(e, TerminalDataTransfers.Terminals)) {
      const side = this._getDropSide(e);
      this._dropOverlay.classList.toggle("drop-before", side === "before");
      this._dropOverlay.classList.toggle("drop-after", side === "after");
    }
    this._dropOverlay.style.opacity = "1";
  }
  async onDrop(e) {
    this._clearDropOverlay();
    if (!e.dataTransfer) {
      return;
    }
    const terminalResources = getTerminalResourcesFromDragEvent(e);
    if (terminalResources) {
      for (const uri of terminalResources) {
        const side = this._getDropSide(e);
        this._onDropTerminal.fire({ uri, side });
      }
      return;
    }
    let path2;
    const rawResources = e.dataTransfer.getData(DataTransfers.RESOURCES);
    if (rawResources) {
      path2 = URI.parse(JSON.parse(rawResources)[0]);
    }
    const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
    if (!path2 && rawCodeFiles) {
      path2 = URI.file(JSON.parse(rawCodeFiles)[0]);
    }
    if (!path2 && e.dataTransfer.files.length > 0 && getPathForFile(e.dataTransfer.files[0])) {
      path2 = URI.file(getPathForFile(e.dataTransfer.files[0]));
    }
    if (!path2) {
      return;
    }
    this._onDropFile.fire(path2);
  }
  _getDropSide(e) {
    const target = this._container;
    if (!target) {
      return "after";
    }
    const rect = target.getBoundingClientRect();
    return this._getViewOrientation() === Orientation.HORIZONTAL ? e.clientX - rect.left < rect.width / 2 ? "before" : "after" : e.clientY - rect.top < rect.height / 2 ? "before" : "after";
  }
  _getViewOrientation() {
    const panelPosition = this._layoutService.getPanelPosition();
    const terminalLocation = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
    return terminalLocation === ViewContainerLocation.Panel && isHorizontal(panelPosition) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
  }
};
TerminalInstanceDragAndDropController = __decorateClass([
  __decorateParam(1, IWorkbenchLayoutService),
  __decorateParam(2, IViewDescriptorService)
], TerminalInstanceDragAndDropController);
var TerminalLabelType = /* @__PURE__ */ ((TerminalLabelType2) => {
  TerminalLabelType2["Title"] = "title";
  TerminalLabelType2["Description"] = "description";
  return TerminalLabelType2;
})(TerminalLabelType || {});
let TerminalLabelComputer = class extends Disposable {
  constructor(_fileService, _terminalConfigurationService, _workspaceContextService) {
    super();
    this._fileService = _fileService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._workspaceContextService = _workspaceContextService;
    this._title = "";
    this._description = "";
    this._onDidChangeLabel = this._register(new Emitter());
    this.onDidChangeLabel = this._onDidChangeLabel.event;
  }
  get title() {
    return this._title;
  }
  get description() {
    return this._description;
  }
  refreshLabel(instance, reset) {
    const tabs = this._terminalConfigurationService.config.tabs;
    const useAgentCliTitle = tabs.allowAgentCliTitle && TerminalLabelComputer.agentCliShellTypes.has(instance.shellType);
    const titleTemplate = instance.shellLaunchConfig.titleTemplate ?? (useAgentCliTitle ? "${sequence}" : tabs.title);
    this._title = this.computeLabel(instance, titleTemplate, "title" /* Title */, reset);
    this._description = this.computeLabel(instance, tabs.description, "description" /* Description */);
    if (this._title !== instance.title || this._description !== instance.description || reset) {
      this._onDidChangeLabel.fire({ title: this._title, description: this._description });
    }
  }
  computeLabel(instance, labelTemplate, labelType, reset) {
    const type = instance.shellLaunchConfig.attachPersistentProcess?.type || instance.shellLaunchConfig.type;
    const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    const promptInputModel = commandDetection?.promptInputModel;
    const nonTaskSpinner = type === "Task" ? "" : " $(loading~spin)";
    let cwd = instance.cwd || instance.initialCwd || "";
    const os = instance.os ?? OS;
    cwd = tildify(cwd, instance.userHome || "", os);
    if (os !== OperatingSystem.Windows && cwd && instance.userHome && cwd === instance.userHome) {
      cwd = "~";
    }
    const templateProperties = {
      cwd,
      cwdFolder: "",
      workspaceFolderName: instance.workspaceFolder?.name,
      workspaceFolder: instance.workspaceFolder ? path.basename(instance.workspaceFolder.uri.fsPath) : void 0,
      local: type === "Local" ? terminalStrings.typeLocal : void 0,
      process: instance.processName,
      sequence: instance.sequence,
      task: type === "Task" ? terminalStrings.typeTask : void 0,
      fixedDimensions: instance.fixedCols ? instance.fixedRows ? `\u2194${instance.fixedCols} \u2195${instance.fixedRows}` : `\u2194${instance.fixedCols}` : instance.fixedRows ? `\u2195${instance.fixedRows}` : "",
      separator: { label: this._terminalConfigurationService.config.tabs.separator },
      shellType: instance.shellType,
      // Shell command requires high confidence
      shellCommand: commandDetection?.executingCommand && commandDetection.executingCommandConfidence === "high" && promptInputModel ? promptInputModel.value + nonTaskSpinner : void 0,
      // Shell prompt input does not require high confidence as it's largely for VS Code developers
      shellPromptInput: commandDetection?.executingCommand && promptInputModel ? promptInputModel.getCombinedString(true) + nonTaskSpinner : promptInputModel?.getCombinedString(true),
      progress: this._getProgressStateString(instance.progressState)
    };
    templateProperties.workspaceFolderName = instance.workspaceFolder?.name ?? templateProperties.workspaceFolder;
    labelTemplate = labelTemplate.trim();
    if (!labelTemplate) {
      return labelType === "title" /* Title */ ? instance.processName || "" : "";
    }
    if (!reset && instance.staticTitle && labelType === "title" /* Title */) {
      return instance.staticTitle.replace(/[\n\r\t]/g, "") || templateProperties.process?.replace(/[\n\r\t]/g, "") || "";
    }
    const detection = instance.capabilities.has(TerminalCapability.CwdDetection) || instance.capabilities.has(TerminalCapability.NaiveCwdDetection);
    const folders = this._workspaceContextService.getWorkspace().folders;
    const multiRootWorkspace = folders.length > 1;
    if (templateProperties.cwd && detection && (!instance.shellLaunchConfig.isFeatureTerminal || labelType === "title" /* Title */)) {
      const cwdUri = URI.from({
        scheme: instance.workspaceFolder?.uri.scheme || Schemas.file,
        path: instance.cwd ? path.resolve(instance.cwd) : void 0
      });
      let showCwd = false;
      if (multiRootWorkspace) {
        showCwd = true;
      } else if (instance.workspaceFolder?.uri) {
        const caseSensitive = this._fileService.hasCapability(instance.workspaceFolder.uri, FileSystemProviderCapabilities.PathCaseSensitive);
        showCwd = cwdUri.fsPath.localeCompare(instance.workspaceFolder.uri.fsPath, void 0, { sensitivity: caseSensitive ? "case" : "base" }) !== 0;
      }
      if (showCwd) {
        templateProperties.cwdFolder = path.basename(templateProperties.cwd);
      }
    }
    const label = template(labelTemplate, templateProperties).replace(/[\n\r\t]/g, "").trim();
    return label === "" && labelType === "title" /* Title */ ? instance.processName || "" : label;
  }
  _getProgressStateString(progressState) {
    if (!progressState) {
      return "";
    }
    switch (progressState.state) {
      case 0:
        return "";
      case 1:
        return `${Math.round(progressState.value)}%`;
      case 2:
        return "$(error)";
      case 3:
        return "$(loading~spin)";
      case 4:
        return "$(alert)";
    }
  }
};
/**
 * Agent CLIs whose tab title should come from their own escape sequences rather
 * than the configured template or a static profile name.
 */
TerminalLabelComputer.agentCliShellTypes = /* @__PURE__ */ new Set([
  GeneralShellType.Claude,
  GeneralShellType.Codex,
  GeneralShellType.CommandCode,
  GeneralShellType.Copilot,
  GeneralShellType.Gemini
]);
TerminalLabelComputer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ITerminalConfigurationService),
  __decorateParam(2, IWorkspaceContextService)
], TerminalLabelComputer);
function parseExitResult(exitCodeOrError, shellLaunchConfig, processState, initialCwd) {
  if (exitCodeOrError === void 0 || exitCodeOrError === 0) {
    return { code: exitCodeOrError, message: void 0 };
  }
  const code = isNumber(exitCodeOrError) ? exitCodeOrError : exitCodeOrError.code;
  let message = void 0;
  switch (typeof exitCodeOrError) {
    case "number": {
      let commandLine = void 0;
      if (shellLaunchConfig.executable) {
        commandLine = shellLaunchConfig.executable;
        if (isString(shellLaunchConfig.args)) {
          commandLine += ` ${shellLaunchConfig.args}`;
        } else if (shellLaunchConfig.args && shellLaunchConfig.args.length) {
          commandLine += shellLaunchConfig.args.map((a) => ` '${a}'`).join();
        }
      }
      if (processState === ProcessState.KilledDuringLaunch) {
        if (commandLine) {
          message = nls.localize("launchFailed.exitCodeAndCommandLine", 'The terminal process "{0}" failed to launch (exit code: {1}).', commandLine, code);
        } else {
          message = nls.localize("launchFailed.exitCodeOnly", "The terminal process failed to launch (exit code: {0}).", code);
        }
      } else {
        if (commandLine) {
          message = nls.localize("terminated.exitCodeAndCommandLine", 'The terminal process "{0}" terminated with exit code: {1}.', commandLine, code);
        } else {
          message = nls.localize("terminated.exitCodeOnly", "The terminal process terminated with exit code: {0}.", code);
        }
      }
      break;
    }
    case "object": {
      if (exitCodeOrError.message.toString().includes("Could not find pty with id")) {
        break;
      }
      let innerMessage = exitCodeOrError.message;
      const conptyError = exitCodeOrError.message.match(/.*error code:\s*(\d+).*$/);
      if (conptyError) {
        const errorCode = conptyError.length > 1 ? parseInt(conptyError[1]) : void 0;
        switch (errorCode) {
          case 5:
            innerMessage = `Access was denied to the path containing your executable "${shellLaunchConfig.executable}". Manage and change your permissions to get this to work`;
            break;
          case 267:
            innerMessage = `Invalid starting directory "${initialCwd}", review your terminal.integrated.cwd setting`;
            break;
          case 1260:
            innerMessage = `Windows cannot open this program because it has been prevented by a software restriction policy. For more information, open Event Viewer or contact your system Administrator`;
            break;
        }
      }
      message = nls.localize("launchFailed.errorMessage", "The terminal process failed to launch: {0}.", innerMessage);
      break;
    }
  }
  return { code, message };
}
let TerminalInstanceColorProvider = class {
  constructor(_target, _viewDescriptorService) {
    this._target = _target;
    this._viewDescriptorService = _viewDescriptorService;
  }
  getBackgroundColor(theme) {
    const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
    if (terminalBackground) {
      return terminalBackground;
    }
    if (this._target.object === TerminalLocation.Editor) {
      return theme.getColor(editorBackground);
    }
    const location = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
    if (location === ViewContainerLocation.Panel) {
      return theme.getColor(PANEL_BACKGROUND);
    }
    return theme.getColor(SIDE_BAR_BACKGROUND);
  }
};
TerminalInstanceColorProvider = __decorateClass([
  __decorateParam(1, IViewDescriptorService)
], TerminalInstanceColorProvider);
function guessShellTypeFromExecutable(os, executable) {
  const exeBasename = path.basename(executable);
  const generalShellTypeMap = /* @__PURE__ */ new Map([
    [GeneralShellType.Julia, /^julia$/],
    [GeneralShellType.Node, /^node$/],
    [GeneralShellType.NuShell, /^nu$/],
    [GeneralShellType.PowerShell, /^pwsh(-preview)?|powershell$/],
    [GeneralShellType.Python, /^py(?:thon)?$/],
    [GeneralShellType.Xonsh, /^xonsh/]
  ]);
  for (const [shellType, pattern] of generalShellTypeMap) {
    if (exeBasename.match(pattern)) {
      return shellType;
    }
  }
  if (os === OperatingSystem.Windows) {
    const windowsShellTypeMap = /* @__PURE__ */ new Map([
      [WindowsShellType.CommandPrompt, /^cmd$/],
      [WindowsShellType.GitBash, /^bash$/],
      [WindowsShellType.Wsl, /^wsl$/]
    ]);
    for (const [shellType, pattern] of windowsShellTypeMap) {
      if (exeBasename.match(pattern)) {
        return shellType;
      }
    }
  } else {
    const posixShellTypes = [
      PosixShellType.Bash,
      PosixShellType.Csh,
      PosixShellType.Fish,
      PosixShellType.Ksh,
      PosixShellType.Sh,
      PosixShellType.Zsh
    ];
    for (const type of posixShellTypes) {
      if (exeBasename === type) {
        return type;
      }
    }
  }
  return void 0;
}
export {
  TerminalInstance,
  TerminalInstanceColorProvider,
  TerminalLabelComputer,
  parseExitResult
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbEluc3RhbmNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNGaXJlZm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgQnJvd3NlckZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2NhbklVc2UuanMnO1xuaW1wb3J0IHsgRGF0YVRyYW5zZmVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBBdXRvT3BlbkJhcnJpZXIsIFByb21pc2VzLCBkaXNwb3NhYmxlVGltZW91dCwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yLCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJU2VwYXJhdG9yLCBub3JtYWxpemVEcml2ZUxldHRlciwgdGVtcGxhdGUsIHRpbGRpZnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgSW1tb3J0YWxSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlLCBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUsIHR5cGUgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgT1MsIE9wZXJhdGluZ1N5c3RlbSwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUYWJGb2N1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2NvbmZpZy90YWJGb2N1cy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCwgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvZGVEYXRhVHJhbnNmZXJzLCBjb250YWluc0RyYWdUeXBlLCBnZXRQYXRoRm9yRmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZXN1bHRLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElNYXJrUHJvcGVydGllcywgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmVNdWx0aXBsZXhlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvdGVybWluYWxDYXBhYmlsaXR5U3RvcmUuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLCBJTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZS5qcyc7XG5pbXBvcnQgeyBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlU2hhcmVkLmpzJztcbmltcG9ydCB7IEdlbmVyYWxTaGVsbFR5cGUsIElQcm9jZXNzRGF0YUV2ZW50LCBJUHJvY2Vzc1Byb3BlcnR5TWFwLCBJUmVjb25uZWN0aW9uUHJvcGVydGllcywgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxEaW1lbnNpb25zT3ZlcnJpZGUsIElUZXJtaW5hbExhdW5jaEVycm9yLCBJVGVybWluYWxMb2dTZXJ2aWNlLCBQb3NpeFNoZWxsVHlwZSwgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgcmVtb3RlUmVzb2x2ZXJUZXJtaW5hbCwgU2hlbGxJbnRlZ3JhdGlvblN0YXR1cywgVGVybWluYWxFeGl0UmVhc29uLCBUZXJtaW5hbEljb24sIFRlcm1pbmFsTG9jYXRpb24sIFRlcm1pbmFsU2V0dGluZ0lkLCBUZXJtaW5hbFNoZWxsVHlwZSwgVGl0bGVFdmVudFNvdXJjZSwgV2luZG93c1NoZWxsVHlwZSwgdHlwZSBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxTdHJpbmdzLmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgUEFORUxfQkFDS0dST1VORCwgU0lERV9CQVJfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdEFkZEluc3RhbmNlVG9Hcm91cEV2ZW50LCBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgSVRlcm1pbmFsQ29udHJpYnV0aW9uLCBJVGVybWluYWxJbnN0YW5jZSwgSVh0ZXJtQ29sb3JQcm92aWRlciwgVGVybWluYWxEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbExhdW5jaEhlbHBBY3Rpb24gfSBmcm9tICcuL3Rlcm1pbmFsQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEVkaXRvcklucHV0IH0gZnJvbSAnLi90ZXJtaW5hbEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi90ZXJtaW5hbEV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZ2V0Q29sb3JDbGFzcywgY3JlYXRlQ29sb3JTdHlsZUVsZW1lbnQsIGdldFN0YW5kYXJkQ29sb3JzIH0gZnJvbSAnLi90ZXJtaW5hbEljb24uanMnO1xuaW1wb3J0IHsgVGVybWluYWxQcm9jZXNzTWFuYWdlciB9IGZyb20gJy4vdGVybWluYWxQcm9jZXNzTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTdGF0dXNMaXN0LCBUZXJtaW5hbFN0YXR1cywgVGVybWluYWxTdGF0dXNMaXN0IH0gZnJvbSAnLi90ZXJtaW5hbFN0YXR1c0xpc3QuanMnO1xuaW1wb3J0IHsgZ2V0VGVybWluYWxSZXNvdXJjZXNGcm9tRHJhZ0V2ZW50LCBnZXRUZXJtaW5hbFVyaSB9IGZyb20gJy4vdGVybWluYWxVcmkuanMnO1xuaW1wb3J0IHsgVGVybWluYWxXaWRnZXRNYW5hZ2VyIH0gZnJvbSAnLi93aWRnZXRzL3dpZGdldE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgTGluZURhdGFFdmVudEFkZG9uIH0gZnJvbSAnLi94dGVybS9saW5lRGF0YUV2ZW50QWRkb24uanMnO1xuaW1wb3J0IHsgWHRlcm1UZXJtaW5hbCwgZ2V0WHRlcm1TY2FsZWREaW1lbnNpb25zIH0gZnJvbSAnLi94dGVybS94dGVybVRlcm1pbmFsLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFZhcmlhYmxlSW5mbyB9IGZyb20gJy4uL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyLCBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBQcm9jZXNzU3RhdGUsIFRFUk1JTkFMX1ZJRVdfSUQsIFRlcm1pbmFsQ29tbWFuZElkIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRFUk1JTkFMX0JBQ0tHUk9VTkRfQ09MT1IgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IGdldFVyaUxhYmVsRm9yU2hlbGwsIGdldFNoZWxsSW50ZWdyYXRpb25UaW1lb3V0LCBnZXRXb3Jrc3BhY2VGb3JUZXJtaW5hbCwgcHJlcGFyZVBhdGhGb3JTaGVsbCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgaXNIb3Jpem9udGFsLCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYXJrZXIsIFRlcm1pbmFsIGFzIFhUZXJtVGVybWluYWwsIElCdWZmZXJMaW5lIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgdGVybWluYWxTdHJpbmdzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEljb25QaWNrZXIgfSBmcm9tICcuL3Rlcm1pbmFsSWNvblBpY2tlci5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFJlc2l6ZURlYm91bmNlciB9IGZyb20gJy4vdGVybWluYWxSZXNpemVEZWJvdW5jZXIuanMnO1xuaW1wb3J0IHsgb3BlbkNvbnRleHRNZW51IH0gZnJvbSAnLi90ZXJtaW5hbENvbnRleHRNZW51LmpzJztcbmltcG9ydCB0eXBlIHsgSU1lbnUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udHJpYkNvbW1hbmRJZCB9IGZyb20gJy4uL3Rlcm1pbmFsQ29udHJpYkV4cG9ydHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvZ3Jlc3NTdGF0ZSB9IGZyb20gJ0B4dGVybS9hZGRvbi1wcm9ncmVzcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFByb21wdElucHV0U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb24vcHJvbXB0SW5wdXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIGlzTnVtYmVyLCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHQvKipcblx0ICogVGhlIG1heGltdW0gYW1vdW50IG9mIG1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciBhIGNvbnRhaW5lciBiZWZvcmUgc3RhcnRpbmcgdG8gY3JlYXRlIHRoZVxuXHQgKiB0ZXJtaW5hbCBwcm9jZXNzLiBUaGlzIHBlcmlvZCBoZWxwcyBlbnN1cmUgdGhlIHRlcm1pbmFsIGhhcyBnb29kIGluaXRpYWwgZGltZW5zaW9ucyB0byB3b3JrXG5cdCAqIHdpdGggaWYgaXQncyBnb2luZyB0byBiZSBhIGZvcmVncm91bmQgdGVybWluYWwuXG5cdCAqL1xuXHRXYWl0Rm9yQ29udGFpbmVyVGhyZXNob2xkID0gMTAwLFxuXG5cdERlZmF1bHRDb2xzID0gODAsXG5cdERlZmF1bHRSb3dzID0gMzAsXG5cdE1heENhbnZhc1dpZHRoID0gNDA5NlxufVxuXG5sZXQgeHRlcm1Db25zdHJ1Y3RvcjogUHJvbWlzZTx0eXBlb2YgWFRlcm1UZXJtaW5hbD4gfCB1bmRlZmluZWQ7XG5cbmludGVyZmFjZSBJQ2FudmFzRGltZW5zaW9ucyB7XG5cdHdpZHRoOiBudW1iZXI7XG5cdGhlaWdodDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUdyaWREaW1lbnNpb25zIHtcblx0Y29sczogbnVtYmVyO1xuXHRyb3dzOiBudW1iZXI7XG59XG5cbmNvbnN0IHNoZWxsSW50ZWdyYXRpb25TdXBwb3J0ZWRTaGVsbFR5cGVzOiAoUG9zaXhTaGVsbFR5cGUgfCBHZW5lcmFsU2hlbGxUeXBlIHwgV2luZG93c1NoZWxsVHlwZSlbXSA9IFtcblx0UG9zaXhTaGVsbFR5cGUuQmFzaCxcblx0UG9zaXhTaGVsbFR5cGUuWnNoLFxuXHRHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwsXG5cdEdlbmVyYWxTaGVsbFR5cGUuUHl0aG9uLFxuXTtcblxuLyoqXG4gKiBQYXR0ZXJucyBmb3IgZGV0ZWN0aW5nIGFnZW50IENMSXMgZnJvbSB0aGUgT1NDIHRpdGxlIHRoZXkgZW1pdC5cbiAqL1xuY29uc3QgYWdlbnRDbGlUaXRsZVBhdHRlcm5zOiBSZWFkb25seU1hcDxHZW5lcmFsU2hlbGxUeXBlLCBSZWdFeHA+ID0gbmV3IE1hcChbXG5cdFtHZW5lcmFsU2hlbGxUeXBlLkNsYXVkZSwgL2NsYXVkZVxccypjb2RlL2ldLFxuXHQvLyBbR2VuZXJhbFNoZWxsVHlwZS5Db2RleCwgL1xcYmNvZGV4XFxiL2ldLCAvLyBjb2RleCBkb2VzIG5vdCByZXBvcnQgb3NjIHRpdGxlLlxuXHRbR2VuZXJhbFNoZWxsVHlwZS5Db21tYW5kQ29kZSwgL2NvbW1hbmRcXHMqY29kZS9pXSxcblx0W0dlbmVyYWxTaGVsbFR5cGUuQ29waWxvdCwgL1xcYmNvcGlsb3RcXGIvaV0sXG5cdFtHZW5lcmFsU2hlbGxUeXBlLkdlbWluaSwgL1xcYmdlbWluaVxcYi9pXSxcbl0pO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxJbnN0YW5jZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxJbnN0YW5jZSB7XG5cdHByaXZhdGUgc3RhdGljIF9sYXN0S25vd25DYW52YXNEaW1lbnNpb25zOiBJQ2FudmFzRGltZW5zaW9ucyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGF0aWMgX2xhc3RLbm93bkdyaWREaW1lbnNpb25zOiBJR3JpZERpbWVuc2lvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3RhdGljIF9pbnN0YW5jZUlkQ291bnRlciA9IDE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9jZXNzTWFuYWdlcjogSVRlcm1pbmFsUHJvY2Vzc01hbmFnZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyaWJ1dGlvbnM6IE1hcDxzdHJpbmcsIElUZXJtaW5hbENvbnRyaWJ1dGlvbj4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlOiBVUkk7XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHdoZW4geHRlcm0uanMgaXMgcmVhZHksIHRoaXMgd2lsbCBiZSB1bmRlZmluZWQgaWYgdGhlIHRlcm1pbmFsIGluc3RhbmNlIGlzIGRpc3Bvc2VkXG5cdCAqIGJlZm9yZSB4dGVybS5qcyBjb3VsZCBiZSBjcmVhdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfeHRlcm1SZWFkeVByb21pc2U6IFByb21pc2U8WHRlcm1UZXJtaW5hbCB8IHVuZGVmaW5lZD47XG5cdGdldCB4dGVybVJlYWR5UHJvbWlzZSgpOiBQcm9taXNlPFh0ZXJtVGVybWluYWwgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX3h0ZXJtUmVhZHlQcm9taXNlOyB9XG5cblx0cHJpdmF0ZSBfcHJlc3NBbnlLZXlUb0Nsb3NlTGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pbnN0YW5jZUlkOiBudW1iZXI7XG5cdHByaXZhdGUgX2xhdGVzdFh0ZXJtV3JpdGVEYXRhOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9sYXRlc3RYdGVybVBhcnNlRGF0YTogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfaXNFeGl0aW5nOiBib29sZWFuO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2luZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaGFkRm9jdXNPbkV4aXQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2V4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4aXRSZWFzb246IFRlcm1pbmFsRXhpdFJlYXNvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWdlbnRTaGVsbFR5cGVGcm9tU2VxdWVuY2U6IEdlbmVyYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RpdGxlOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfdGl0bGVTb3VyY2U6IFRpdGxlRXZlbnRTb3VyY2UgPSBUaXRsZUV2ZW50U291cmNlLlByb2Nlc3M7XG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dyYXBwZXJFbGVtZW50OiAoSFRNTEVsZW1lbnQgJiB7IHh0ZXJtPzogWFRlcm1UZXJtaW5hbCB9KTtcblx0Z2V0IGRvbUVsZW1lbnQoKTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGhpcy5fd3JhcHBlckVsZW1lbnQ7IH1cblx0cHJpdmF0ZSBfaG9yaXpvbnRhbFNjcm9sbGJhcjogRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Rlcm1pbmFsRm9jdXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfdGVybWluYWxIYXNGaXhlZFdpZHRoOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfdGVybWluYWxIYXNUZXh0Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX3Rlcm1pbmFsQWx0QnVmZmVyQWN0aXZlQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX3Rlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfY29sczogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfcm93czogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfZml4ZWRDb2xzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZpeGVkUm93czogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jd2Q6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaW5pdGlhbEN3ZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pbmplY3RlZEFyZ3M6IHN0cmluZ1tdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXlvdXRTZXR0aW5nc0NoYW5nZWQ6IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIF9kaW1lbnNpb25zT3ZlcnJpZGU6IElUZXJtaW5hbERpbWVuc2lvbnNPdmVycmlkZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYXJlTGlua3NSZWFkeTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0aWFsRGF0YUV2ZW50c0xpc3RlbmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX2luaXRpYWxEYXRhRXZlbnRzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCA9IFtdO1xuXHRwcml2YXRlIF9jb250YWluZXJSZWFkeUJhcnJpZXI6IEF1dG9PcGVuQmFycmllcjtcblx0cHJpdmF0ZSBfYXR0YWNoQmFycmllcjogQXV0b09wZW5CYXJyaWVyO1xuXHRwcml2YXRlIF9pY29uOiBUZXJtaW5hbEljb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VUaXRsZURpc3Bvc2FibGU6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfd2lkZ2V0TWFuYWdlcjogVGVybWluYWxXaWRnZXRNYW5hZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kbmRPYnNlcnZlcjogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9sYXN0TGF5b3V0RGltZW5zaW9uczogZG9tLkRpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHByaXZhdGUgX3Byb2Nlc3NOYW1lOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBfc2VxdWVuY2U/OiBzdHJpbmc7XG5cdHByaXZhdGUgX3N0YXRpY1RpdGxlPzogc3RyaW5nO1xuXHRwcml2YXRlIF93b3Jrc3BhY2VGb2xkZXI/OiBJV29ya3NwYWNlRm9sZGVyO1xuXHRwcml2YXRlIF9sYWJlbENvbXB1dGVyPzogVGVybWluYWxMYWJlbENvbXB1dGVyO1xuXHRwcml2YXRlIF91c2VySG9tZT86IHN0cmluZztcblx0cHJpdmF0ZSBfaGFzU2Nyb2xsQmFyPzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfdXNlZFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb246IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IHVzZWRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fdXNlZFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb247IH1cblx0cHJpdmF0ZSBfc2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkluZm86IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uIHwgdW5kZWZpbmVkO1xuXHRnZXQgc2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24oKTogU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkluZm87IH1cblx0cHJpdmF0ZSBfbGluZURhdGFFdmVudEFkZG9uOiBMaW5lRGF0YUV2ZW50QWRkb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgX3Jlc2l6ZURlYm91bmNlcj86IFRlcm1pbmFsUmVzaXplRGVib3VuY2VyO1xuXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZU11bHRpcGxleGVyKCkpO1xuXHRyZWFkb25seSBzdGF0dXNMaXN0OiBJVGVybWluYWxTdGF0dXNMaXN0O1xuXG5cdGdldCBzdG9yZSgpOiBEaXNwb3NhYmxlU3RvcmUge1xuXHRcdHJldHVybiB0aGlzLl9zdG9yZTtcblx0fVxuXG5cdGdldCBleHRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbigpOiBJTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcHJvY2Vzc01hbmFnZXIuZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb247IH1cblxuXHR4dGVybT86IFh0ZXJtVGVybWluYWw7XG5cdGRpc2FibGVMYXlvdXQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRnZXQgd2FpdE9uRXhpdCgpOiBJVGVybWluYWxJbnN0YW5jZVsnd2FpdE9uRXhpdCddIHsgcmV0dXJuIHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy53YWl0T25FeGl0IHx8IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLndhaXRPbkV4aXQ7IH1cblx0c2V0IHdhaXRPbkV4aXQodmFsdWU6IElUZXJtaW5hbEluc3RhbmNlWyd3YWl0T25FeGl0J10pIHtcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy53YWl0T25FeGl0ID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9pc1Zpc2libGU6IGJvb2xlYW47XG5cdGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc1Zpc2libGU7IH1cblxuXHRwcml2YXRlIF90YXJnZXRSZWY6IEltbW9ydGFsUmVmZXJlbmNlPFRlcm1pbmFsTG9jYXRpb24gfCB1bmRlZmluZWQ+ID0gbmV3IEltbW9ydGFsUmVmZXJlbmNlKHVuZGVmaW5lZCk7XG5cdGdldCB0YXJnZXRSZWYoKTogSVJlZmVyZW5jZTxUZXJtaW5hbExvY2F0aW9uIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl90YXJnZXRSZWY7IH1cblxuXHRnZXQgdGFyZ2V0KCk6IFRlcm1pbmFsTG9jYXRpb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fdGFyZ2V0UmVmLm9iamVjdDsgfVxuXHRzZXQgdGFyZ2V0KHZhbHVlOiBUZXJtaW5hbExvY2F0aW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fdGFyZ2V0UmVmLm9iamVjdCA9IHZhbHVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVGFyZ2V0LmZpcmUodmFsdWUpO1xuXHR9XG5cblx0Z2V0IGluc3RhbmNlSWQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX2luc3RhbmNlSWQ7IH1cblx0Z2V0IHJlc291cmNlKCk6IFVSSSB7IHJldHVybiB0aGlzLl9yZXNvdXJjZTsgfVxuXHRnZXQgY29scygpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9maXhlZENvbHMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpeGVkQ29scztcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2RpbWVuc2lvbnNPdmVycmlkZSAmJiB0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUuY29scykge1xuXHRcdFx0aWYgKHRoaXMuX2RpbWVuc2lvbnNPdmVycmlkZS5mb3JjZUV4YWN0U2l6ZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZGltZW5zaW9uc092ZXJyaWRlLmNvbHM7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgodGhpcy5fZGltZW5zaW9uc092ZXJyaWRlLmNvbHMsIDIpLCB0aGlzLl9jb2xzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbHM7XG5cdH1cblx0Z2V0IHJvd3MoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fZml4ZWRSb3dzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9maXhlZFJvd3M7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUgJiYgdGhpcy5fZGltZW5zaW9uc092ZXJyaWRlLnJvd3MpIHtcblx0XHRcdGlmICh0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUuZm9yY2VFeGFjdFNpemUpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RpbWVuc2lvbnNPdmVycmlkZS5yb3dzO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIE1hdGgubWluKE1hdGgubWF4KHRoaXMuX2RpbWVuc2lvbnNPdmVycmlkZS5yb3dzLCAyKSwgdGhpcy5fcm93cyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yb3dzO1xuXHR9XG5cdGdldCBpc0Rpc3Bvc2VkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fc3RvcmUuaXNEaXNwb3NlZDsgfVxuXHRnZXQgZml4ZWRDb2xzKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9maXhlZENvbHM7IH1cblx0Z2V0IGZpeGVkUm93cygpOiBudW1iZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZml4ZWRSb3dzOyB9XG5cdGdldCBtYXhDb2xzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9jb2xzOyB9XG5cdGdldCBtYXhSb3dzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9yb3dzOyB9XG5cdC8vIFRPRE86IElkZWFsbHkgcHJvY2Vzc0lkIHdvdWxkIGJlIG1lcmdlZCBpbnRvIHByb2Nlc3NSZWFkeVxuXHRnZXQgcHJvY2Vzc0lkKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wcm9jZXNzTWFuYWdlci5zaGVsbFByb2Nlc3NJZDsgfVxuXHQvLyBUT0RPOiBIb3cgZG9lcyB0aGlzIHdvcmsgd2l0aCBkZXRhY2hlZCBwcm9jZXNzZXM/XG5cdC8vIFRPRE86IFNob3VsZCB0aGlzIGJlIGFuIGV2ZW50IGFzIGl0IGNhbiBmaXJlIHR3aWNlP1xuXHRnZXQgcHJvY2Vzc1JlYWR5KCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy5fcHJvY2Vzc01hbmFnZXIucHR5UHJvY2Vzc1JlYWR5OyB9XG5cdGdldCBoYXNDaGlsZFByb2Nlc3NlcygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/Lmhhc0NoaWxkUHJvY2Vzc2VzIHx8IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmhhc0NoaWxkUHJvY2Vzc2VzOyB9XG5cdGdldCByZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzKCk6IElSZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LnJlY29ubmVjdGlvblByb3BlcnRpZXMgfHwgdGhpcy5zaGVsbExhdW5jaENvbmZpZy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzOyB9XG5cdGdldCBhcmVMaW5rc1JlYWR5KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fYXJlTGlua3NSZWFkeTsgfVxuXHRnZXQgaW5pdGlhbERhdGFFdmVudHMoKTogc3RyaW5nW10gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5faW5pdGlhbERhdGFFdmVudHM7IH1cblx0Z2V0IGV4aXRDb2RlKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9leGl0Q29kZTsgfVxuXHRnZXQgZXhpdFJlYXNvbigpOiBUZXJtaW5hbEV4aXRSZWFzb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZXhpdFJlYXNvbjsgfVxuXHRnZXQgaGFkRm9jdXNPbkV4aXQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9oYWRGb2N1c09uRXhpdDsgfVxuXHRnZXQgaXNUaXRsZVNldEJ5UHJvY2VzcygpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5fbWVzc2FnZVRpdGxlRGlzcG9zYWJsZS52YWx1ZTsgfVxuXHRnZXQgc2hlbGxMYXVuY2hDb25maWcoKTogSVNoZWxsTGF1bmNoQ29uZmlnIHsgcmV0dXJuIHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnOyB9XG5cdGdldCBzaGVsbFR5cGUoKTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc2hlbGxUeXBlOyB9XG5cdGdldCBvcygpOiBPcGVyYXRpbmdTeXN0ZW0gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcHJvY2Vzc01hbmFnZXIub3M7IH1cblx0Z2V0IGhhc1JlbW90ZUF1dGhvcml0eSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnJlbW90ZUF1dGhvcml0eSAhPT0gdW5kZWZpbmVkOyB9XG5cdGdldCByZW1vdGVBdXRob3JpdHkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnJlbW90ZUF1dGhvcml0eTsgfVxuXHRnZXQgaGFzRm9jdXMoKTogYm9vbGVhbiB7IHJldHVybiBkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0aGlzLl93cmFwcGVyRWxlbWVudCk7IH1cblx0Z2V0IHRpdGxlKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl90aXRsZTsgfVxuXHRnZXQgdGl0bGVTb3VyY2UoKTogVGl0bGVFdmVudFNvdXJjZSB7IHJldHVybiB0aGlzLl90aXRsZVNvdXJjZTsgfVxuXHRnZXQgaWNvbigpOiBUZXJtaW5hbEljb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZ2V0SWNvbigpOyB9XG5cdGdldCBjb2xvcigpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZ2V0Q29sb3IoKTsgfVxuXHRnZXQgcHJvY2Vzc05hbWUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3NOYW1lOyB9XG5cdGdldCBzZXF1ZW5jZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc2VxdWVuY2U7IH1cblx0Z2V0IHN0YXRpY1RpdGxlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zdGF0aWNUaXRsZTsgfVxuXHRnZXQgcHJvZ3Jlc3NTdGF0ZSgpOiBJUHJvZ3Jlc3NTdGF0ZSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLnh0ZXJtPy5wcm9ncmVzc1N0YXRlOyB9XG5cdGdldCB3b3Jrc3BhY2VGb2xkZXIoKTogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl93b3Jrc3BhY2VGb2xkZXI7IH1cblx0Z2V0IGN3ZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY3dkOyB9XG5cdGdldCBpbml0aWFsQ3dkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9pbml0aWFsQ3dkOyB9XG5cdGdldCBkZXNjcmlwdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9kZXNjcmlwdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Rlc2NyaXB0aW9uO1xuXHRcdH1cblx0XHRjb25zdCB0eXBlID0gdGhpcy5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8udHlwZSB8fCB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLnR5cGU7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlICdUYXNrJzogcmV0dXJuIHRlcm1pbmFsU3RyaW5ncy50eXBlVGFzaztcblx0XHRcdGNhc2UgJ0xvY2FsJzogcmV0dXJuIHRlcm1pbmFsU3RyaW5ncy50eXBlTG9jYWw7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXHRnZXQgdXNlckhvbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3VzZXJIb21lOyB9XG5cdGdldCBzaGVsbEludGVncmF0aW9uTm9uY2UoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnNoZWxsSW50ZWdyYXRpb25Ob25jZTsgfVxuXHRnZXQgaW5qZWN0ZWRBcmdzKCk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2luamVjdGVkQXJnczsgfVxuXG5cdC8vIFRoZSBvbkV4aXQgZXZlbnQgaXMgc3BlY2lhbCBpbiB0aGF0IGl0IGZpcmVzIGFuZCBpcyBkaXNwb3NlZCBhZnRlciB0aGUgdGVybWluYWwgaW5zdGFuY2Vcblx0Ly8gaXRzZWxmIGlzIGRpc3Bvc2VkXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRXhpdCA9IG5ldyBFbWl0dGVyPG51bWJlciB8IElUZXJtaW5hbExhdW5jaEVycm9yIHwgdW5kZWZpbmVkPigpO1xuXHRyZWFkb25seSBvbkV4aXQgPSB0aGlzLl9vbkV4aXQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpc3Bvc2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpc3Bvc2VkID0gdGhpcy5fb25EaXNwb3NlZC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzSWRSZWFkeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzSWRSZWFkeSA9IHRoaXMuX29uUHJvY2Vzc0lkUmVhZHkuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc1JlcGxheUNvbXBsZXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc1JlcGxheUNvbXBsZXRlID0gdGhpcy5fb25Qcm9jZXNzUmVwbGF5Q29tcGxldGUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uVGl0bGVDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvblRpdGxlQ2hhbmdlZCA9IHRoaXMuX29uVGl0bGVDaGFuZ2VkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkljb25DaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2U7IHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4gfT4oKSk7XG5cdHJlYWRvbmx5IG9uSWNvbkNoYW5nZWQgPSB0aGlzLl9vbkljb25DaGFuZ2VkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25XaWxsRGF0YSA9IHRoaXMuX29uV2lsbERhdGEuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGF0YSA9IHRoaXMuX29uRGF0YS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25CaW5hcnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkJpbmFyeSA9IHRoaXMuX29uQmluYXJ5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlcXVlc3RFeHRIb3N0UHJvY2VzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25SZXF1ZXN0RXh0SG9zdFByb2Nlc3MgPSB0aGlzLl9vblJlcXVlc3RFeHRIb3N0UHJvY2Vzcy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaW1lbnNpb25zQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpbWVuc2lvbnNDaGFuZ2VkID0gdGhpcy5fb25EaW1lbnNpb25zQ2hhbmdlZC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25NYXhpbXVtRGltZW5zaW9uc0NoYW5nZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25NYXhpbXVtRGltZW5zaW9uc0NoYW5nZWQgPSB0aGlzLl9vbk1heGltdW1EaW1lbnNpb25zQ2hhbmdlZC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25EaWRGb2N1cyA9IHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdEZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdEZvY3VzID0gdGhpcy5fb25EaWRSZXF1ZXN0Rm9jdXMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQmx1ciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25EaWRCbHVyID0gdGhpcy5fb25EaWRCbHVyLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZElucHV0RGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5wdXREYXRhID0gdGhpcy5fb25EaWRJbnB1dERhdGEuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlcXVlc3RBZGRJbnN0YW5jZVRvR3JvdXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVxdWVzdEFkZEluc3RhbmNlVG9Hcm91cEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25SZXF1ZXN0QWRkSW5zdGFuY2VUb0dyb3VwID0gdGhpcy5fb25SZXF1ZXN0QWRkSW5zdGFuY2VUb0dyb3VwLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGFzQ2hpbGRQcm9jZXNzZXMgPSB0aGlzLl9vbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEV4ZWN1dGVUZXh0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRXhlY3V0ZVRleHQgPSB0aGlzLl9vbkRpZEV4ZWN1dGVUZXh0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRhcmdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRlcm1pbmFsTG9jYXRpb24gfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRhcmdldCA9IHRoaXMuX29uRGlkQ2hhbmdlVGFyZ2V0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbmRUZXh0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZW5kVGV4dCA9IHRoaXMuX29uRGlkU2VuZFRleHQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2hlbGxUeXBlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VGVybWluYWxTaGVsbFR5cGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNoZWxsVHlwZSA9IHRoaXMuX29uRGlkQ2hhbmdlU2hlbGxUeXBlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTGluZURhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KHtcblx0XHRvbkRpZEFkZEZpcnN0TGlzdGVuZXI6IGFzeW5jICgpID0+ICh0aGlzLnh0ZXJtID8/IGF3YWl0IHRoaXMuX3h0ZXJtUmVhZHlQcm9taXNlKT8ucmF3LmxvYWRBZGRvbih0aGlzLl9saW5lRGF0YUV2ZW50QWRkb24hKVxuXHR9KSk7XG5cdHJlYWRvbmx5IG9uTGluZURhdGEgPSB0aGlzLl9vbkxpbmVEYXRhLmV2ZW50O1xuXG5cdHJlYWRvbmx5IHNlc3Npb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1JlbW90ZVJlc29sdmVyVGVybWluYWw6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTaGVsbFR5cGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+LFxuXHRcdHByaXZhdGUgX3NoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgX3ByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtiZW5jaEVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASUhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2lzUmVtb3RlUmVzb2x2ZXJUZXJtaW5hbCA9IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnW3JlbW90ZVJlc29sdmVyVGVybWluYWxdID09PSB0cnVlO1xuXHRcdGRlbGV0ZSB0aGlzLl9zaGVsbExhdW5jaENvbmZpZ1tyZW1vdGVSZXNvbHZlclRlcm1pbmFsXTtcblx0XHR0aGlzLl93cmFwcGVyRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Rlcm1pbmFsLXdyYXBwZXInKTtcblxuXHRcdHRoaXMuX3dpZGdldE1hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFdpZGdldE1hbmFnZXIpKTtcblxuXHRcdHRoaXMuX2lzRXhpdGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX2lzRGlzcG9zaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5faGFkRm9jdXNPbkV4aXQgPSBmYWxzZTtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSBmYWxzZTtcblx0XHR0aGlzLl9pbnN0YW5jZUlkID0gVGVybWluYWxJbnN0YW5jZS5faW5zdGFuY2VJZENvdW50ZXIrKztcblx0XHR0aGlzLl9maXhlZFJvd3MgPSBfc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LmZpeGVkRGltZW5zaW9ucz8ucm93cztcblx0XHR0aGlzLl9maXhlZENvbHMgPSBfc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LmZpeGVkRGltZW5zaW9ucz8uY29scztcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5zaGVsbEludGVncmF0aW9uRW52aXJvbm1lbnRSZXBvcnRpbmcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uRW52aXJvbm1lbnRSZXBvcnRpbmcpO1xuXG5cdFx0dGhpcy5fcmVzb3VyY2UgPSBnZXRUZXJtaW5hbFVyaSh0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5pZCwgdGhpcy5pbnN0YW5jZUlkLCB0aGlzLnRpdGxlKTtcblxuXHRcdGlmICh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8uaGlkZUZyb21Vc2VyKSB7XG5cdFx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIgPSB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5oaWRlRnJvbVVzZXI7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5pc0ZlYXR1cmVUZXJtaW5hbCkge1xuXHRcdFx0dGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaXNGZWF0dXJlVGVybWluYWwgPSB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5pc0ZlYXR1cmVUZXJtaW5hbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LnR5cGUpIHtcblx0XHRcdHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLnR5cGUgPSB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy50eXBlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8udGFiQWN0aW9ucykge1xuXHRcdFx0dGhpcy5fc2hlbGxMYXVuY2hDb25maWcudGFiQWN0aW9ucyA9IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzLnRhYkFjdGlvbnM7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2hlbGxMYXVuY2hDb25maWcuY3dkKSB7XG5cdFx0XHRjb25zdCBjd2RVcmkgPSBpc1N0cmluZyh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5jd2QpID8gVVJJLmZyb20oe1xuXHRcdFx0XHRzY2hlbWU6IFNjaGVtYXMuZmlsZSxcblx0XHRcdFx0cGF0aDogdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuY3dkXG5cdFx0XHR9KSA6IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmN3ZDtcblx0XHRcdGlmIChjd2RVcmkpIHtcblx0XHRcdFx0dGhpcy5fd29ya3NwYWNlRm9sZGVyID0gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGN3ZFVyaSkgPz8gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3dvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0Y29uc3QgYWN0aXZlV29ya3NwYWNlUm9vdFVyaSA9IHRoaXMuX2hpc3RvcnlTZXJ2aWNlLmdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290KCk7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VGb2xkZXIgPSBhY3RpdmVXb3Jrc3BhY2VSb290VXJpID8gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkpID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKF9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5fd3JhcHBlckVsZW1lbnQpKTtcblx0XHR0aGlzLl9zY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdXG5cdFx0KSkpO1xuXG5cdFx0dGhpcy5fdGVybWluYWxGb2N1c0NvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fdGVybWluYWxIYXNGaXhlZFdpZHRoID0gVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0ZpeGVkV2lkdGguYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl90ZXJtaW5hbEhhc1RleHRDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy50ZXh0U2VsZWN0ZWQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl90ZXJtaW5hbEFsdEJ1ZmZlckFjdGl2ZUNvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLmFsdEJ1ZmZlckFjdGl2ZS5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWRDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbFNoZWxsSW50ZWdyYXRpb25FbmFibGVkLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGB0ZXJtaW5hbEluc3RhbmNlI2N0b3IgKGluc3RhbmNlSWQ6ICR7dGhpcy5pbnN0YW5jZUlkfSlgLCB0aGlzLl9zaGVsbExhdW5jaENvbmZpZyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jYXBhYmlsaXRpZXMub25EaWRBZGRDYXBhYmlsaXR5KGUgPT4gdGhpcy5fbG9nU2VydmljZS5kZWJ1ZygndGVybWluYWxJbnN0YW5jZSBhZGRlZCBjYXBhYmlsaXR5JywgZS5pZCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNhcGFiaWxpdGllcy5vbkRpZFJlbW92ZUNhcGFiaWxpdHkoZSA9PiB0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCd0ZXJtaW5hbEluc3RhbmNlIHJlbW92ZWQgY2FwYWJpbGl0eScsIGUuaWQpKSk7XG5cblx0XHRjb25zdCBjYXBhYmlsaXR5TGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8VGVybWluYWxDYXBhYmlsaXR5LCBJRGlzcG9zYWJsZT4oKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jYXBhYmlsaXRpZXMub25EaWRBZGRDYXBhYmlsaXR5KGUgPT4ge1xuXHRcdFx0Y2FwYWJpbGl0eUxpc3RlbmVycy5nZXQoZS5pZCk/LmRpc3Bvc2UoKTtcblx0XHRcdGNvbnN0IHJlZnJlc2hJbmZvID0gKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sYWJlbENvbXB1dGVyPy5yZWZyZXNoTGFiZWwodGhpcyk7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hTaGVsbEludGVncmF0aW9uSW5mb1N0YXR1cyh0aGlzKTtcblx0XHRcdH07XG5cdFx0XHRzd2l0Y2ggKGUuaWQpIHtcblx0XHRcdFx0Y2FzZSBUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uOiB7XG5cdFx0XHRcdFx0Y2FwYWJpbGl0eUxpc3RlbmVycy5zZXQoZS5pZCwgZS5jYXBhYmlsaXR5Lm9uRGlkQ2hhbmdlQ3dkKGUgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fY3dkID0gZTtcblx0XHRcdFx0XHRcdHRoaXMuX3NldFRpdGxlKHRoaXMudGl0bGUsIFRpdGxlRXZlbnRTb3VyY2UuQ29uZmlnKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbjoge1xuXHRcdFx0XHRcdGUuY2FwYWJpbGl0eS5wcm9tcHRJbnB1dE1vZGVsLnNldFNoZWxsVHlwZSh0aGlzLnNoZWxsVHlwZSk7XG5cdFx0XHRcdFx0Ly8gVXNlIERpc3Bvc2FibGVTdG9yZSB0byB0cmFjayBtdWx0aXBsZSBsaXN0ZW5lcnMgZm9yIHRoaXMgY2FwYWJpbGl0eVxuXHRcdFx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdHN0b3JlLmFkZChFdmVudC5hbnkoXG5cdFx0XHRcdFx0XHRlLmNhcGFiaWxpdHkucHJvbXB0SW5wdXRNb2RlbC5vbkRpZFN0YXJ0SW5wdXQsXG5cdFx0XHRcdFx0XHRlLmNhcGFiaWxpdHkucHJvbXB0SW5wdXRNb2RlbC5vbkRpZENoYW5nZUlucHV0LFxuXHRcdFx0XHRcdFx0ZS5jYXBhYmlsaXR5LnByb21wdElucHV0TW9kZWwub25EaWRGaW5pc2hJbnB1dFxuXHRcdFx0XHRcdCkocmVmcmVzaEluZm8pKTtcblx0XHRcdFx0XHRzdG9yZS5hZGQoZS5jYXBhYmlsaXR5Lm9uQ29tbWFuZEV4ZWN1dGVkKGFzeW5jIChjb21tYW5kKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBPbmx5IGdlbmVyYXRlIElEIGlmIGNvbW1hbmQgZG9lc24ndCBhbHJlYWR5IGhhdmUgb25lIChpLmUuLCBpdCdzIGEgbWFudWFsIGNvbW1hbmQsIG5vdCBDb3BpbG90LWluaXRpYXRlZClcblx0XHRcdFx0XHRcdC8vIFRoZSB0b29sIHRlcm1pbmFsIHNldHMgdGhlIGNvbW1hbmQgSUQgYmVmb3JlIGNvbW1hbmQgc3RhcnQsIHNvIHRoaXMgd29uJ3Qgb3ZlcnJpZGUgaXRcblx0XHRcdFx0XHRcdGlmICghY29tbWFuZC5pZCAmJiBjb21tYW5kLmNvbW1hbmQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29tbWFuZElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMueHRlcm0/LnNoZWxsSW50ZWdyYXRpb24uc2V0TmV4dENvbW1hbmRJZChjb21tYW5kLmNvbW1hbmQsIGNvbW1hbmRJZCk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnNldE5leHRDb21tYW5kSWQoY29tbWFuZC5jb21tYW5kLCBjb21tYW5kSWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRjYXBhYmlsaXR5TGlzdGVuZXJzLnNldChlLmlkLCBzdG9yZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBUZXJtaW5hbENhcGFiaWxpdHkuUHJvbXB0VHlwZURldGVjdGlvbjoge1xuXHRcdFx0XHRcdGNhcGFiaWxpdHlMaXN0ZW5lcnMuc2V0KGUuaWQsIGUuY2FwYWJpbGl0eS5vblByb21wdFR5cGVDaGFuZ2VkKHJlZnJlc2hJbmZvKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZVNoZWxsVHlwZSgoKSA9PiB0aGlzLl9yZWZyZXNoU2hlbGxJbnRlZ3JhdGlvbkluZm9TdGF0dXModGhpcykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNhcGFiaWxpdGllcy5vbkRpZFJlbW92ZUNhcGFiaWxpdHkoZSA9PiB7XG5cdFx0XHRjYXBhYmlsaXR5TGlzdGVuZXJzLmdldChlLmlkKT8uZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlc29sdmUganVzdCB0aGUgaWNvbiBhaGVhZCBvZiB0aW1lIHNvIHRoYXQgaXQgc2hvd3MgdXAgaW1tZWRpYXRlbHkgaW4gdGhlIHRhYnMuIFRoaXMgaXNcblx0XHQvLyBkaXNhYmxlZCBpbiByZW1vdGUgYmVjYXVzZSB0aGlzIG5lZWRzIHRvIGJlIHN5bmMgYW5kIHRoZSBPUyBtYXkgZGlmZmVyIG9uIHRoZSByZW1vdGVcblx0XHQvLyB3aGljaCB3b3VsZCByZXN1bHQgaW4gdGhlIHdyb25nIHByb2ZpbGUgYmVpbmcgc2VsZWN0ZWQgYW5kIHRoZSB3cm9uZyBpY29uIGJlaW5nXG5cdFx0Ly8gcGVybWFuZW50bHkgYXR0YWNoZWQgdG8gdGhlIHRlcm1pbmFsLiBUaGlzIGFsc28gZG9lc24ndCB3b3JrIHdoZW4gdGhlIGRlZmF1bHQgcHJvZmlsZVxuXHRcdC8vIHNldHRpbmcgaXMgc2V0IHRvIG51bGwsIHRoYXQncyBoYW5kbGVkIGFmdGVyIHRoZSBwcm9jZXNzIGlzIGNyZWF0ZWQuXG5cdFx0aWYgKCF0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUgJiYgIXRoaXMuX3dvcmtiZW5jaEVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZS5yZXNvbHZlSWNvbih0aGlzLl9zaGVsbExhdW5jaENvbmZpZywgT1MpO1xuXHRcdH1cblx0XHR0aGlzLl9pY29uID0gX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5pY29uIHx8IF9zaGVsbExhdW5jaENvbmZpZy5pY29uO1xuXG5cdFx0Ly8gV2hlbiBhIGN1c3RvbSBwdHkgaXMgdXNlZCBzZXQgdGhlIG5hbWUgaW1tZWRpYXRlbHkgc28gaXQgZ2V0cyBwYXNzZWQgb3ZlciB0byB0aGUgZXh0aG9zdFxuXHRcdC8vIGFuZCBpcyBhdmFpbGFibGUgd2hlbiBQc2V1ZG90ZXJtaW5hbC5vcGVuIGZpcmVzLlxuXHRcdGlmICh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uICYmICF0aGlzLl9zaGVsbExhdW5jaENvbmZpZy50aXRsZVRlbXBsYXRlKSB7XG5cdFx0XHR0aGlzLl9zZXRUaXRsZSh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5uYW1lLCBUaXRsZUV2ZW50U291cmNlLkFwaSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGF0dXNMaXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTdGF0dXNMaXN0KSk7XG5cdFx0dGhpcy5faW5pdERpbWVuc2lvbnMoKTtcblx0XHR0aGlzLl9wcm9jZXNzTWFuYWdlciA9IHRoaXMuX2NyZWF0ZVByb2Nlc3NNYW5hZ2VyKCk7XG5cblx0XHR0aGlzLl9jb250YWluZXJSZWFkeUJhcnJpZXIgPSBuZXcgQXV0b09wZW5CYXJyaWVyKENvbnN0YW50cy5XYWl0Rm9yQ29udGFpbmVyVGhyZXNob2xkKTtcblx0XHR0aGlzLl9hdHRhY2hCYXJyaWVyID0gbmV3IEF1dG9PcGVuQmFycmllcigxMDAwKTtcblx0XHR0aGlzLl94dGVybVJlYWR5UHJvbWlzZSA9IHRoaXMuX2NyZWF0ZVh0ZXJtKCk7XG5cdFx0dGhpcy5feHRlcm1SZWFkeVByb21pc2UudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBXYWl0IGZvciBhIHBlcmlvZCB0byBhbGxvdyBhIGNvbnRhaW5lciB0byBiZSByZWFkeVxuXHRcdFx0YXdhaXQgdGhpcy5fY29udGFpbmVyUmVhZHlCYXJyaWVyLndhaXQoKTtcblxuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgZXhlY3V0YWJsZSBhaGVhZCBvZiB0aW1lIGlmIHNoZWxsIGludGVncmF0aW9uIGlzIGVuYWJsZWQsIHRoaXMgc2hvdWxkIG5vdFxuXHRcdFx0Ly8gYmUgZG9uZSBmb3IgY3VzdG9tIFBUWXMgYXMgdGhhdCB3b3VsZCBjYXVzZSBleHRlbnNpb24gUHNldWRvdGVybWluYWwtYmFzZWQgdGVybWluYWxzXG5cdFx0XHQvLyB0byBoYW5nIGluIHJlc29sdmVyIGV4dGVuc2lvbnNcblx0XHRcdGxldCBvczogT3BlcmF0aW5nU3lzdGVtIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCF0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uICYmIHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnNoZWxsSW50ZWdyYXRpb24/LmVuYWJsZWQgJiYgIXRoaXMuc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSkge1xuXHRcdFx0XHRvcyA9IGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmdldEJhY2tlbmRPUygpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0UHJvZmlsZSA9IChhd2FpdCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UuZ2V0RGVmYXVsdFByb2ZpbGUoeyByZW1vdGVBdXRob3JpdHk6IHRoaXMucmVtb3RlQXV0aG9yaXR5LCBvcyB9KSk7XG5cdFx0XHRcdHRoaXMuc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSA9IGRlZmF1bHRQcm9maWxlLnBhdGg7XG5cdFx0XHRcdHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXJncyA9IGRlZmF1bHRQcm9maWxlLmFyZ3M7XG5cdFx0XHRcdC8vIE9ubHkgdXNlIGRlZmF1bHQgaWNvbiBhbmQgY29sb3IgYW5kIGVudiBpZiB0aGV5IGFyZSB1bmRlZmluZWQgaW4gdGhlIFNMQ1xuXHRcdFx0XHR0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmljb24gPz89IGRlZmF1bHRQcm9maWxlLmljb247XG5cdFx0XHRcdHRoaXMuc2hlbGxMYXVuY2hDb25maWcuY29sb3IgPz89IGRlZmF1bHRQcm9maWxlLmNvbG9yO1xuXHRcdFx0XHR0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmVudiA/Pz0gZGVmYXVsdFByb2ZpbGUuZW52O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNvbHZlIHRoZSBzaGVsbCB0eXBlIGFoZWFkIG9mIHRpbWUgdG8gYWxsb3cgZmVhdHVyZXMgdGhhdCBkZXBlbmQgdXBvbiBpdCB0byB3b3JrXG5cdFx0XHQvLyBiZWZvcmUgdGhlIHByb2Nlc3MgaXMgYWN0dWFsbHkgY3JlYXRlZCAobGlrZSB0ZXJtaW5hbCBzdWdnZXN0IG1hbnVhbCByZXF1ZXN0KVxuXHRcdFx0aWYgKG9zICYmIHRoaXMuc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSkge1xuXHRcdFx0XHR0aGlzLnNldFNoZWxsVHlwZShndWVzc1NoZWxsVHlwZUZyb21FeGVjdXRhYmxlKG9zLCB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUpKTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5fY3JlYXRlUHJvY2VzcygpO1xuXG5cdFx0XHQvLyBSZS1lc3RhYmxpc2ggdGhlIHRpdGxlIGFmdGVyIHJlY29ubmVjdFxuXHRcdFx0aWYgKHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MpIHtcblx0XHRcdFx0dGhpcy5fY3dkID0gdGhpcy5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5jd2Q7XG5cdFx0XHRcdHRoaXMuX3NldFRpdGxlKHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MudGl0bGUsIHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MudGl0bGVTb3VyY2UpO1xuXHRcdFx0XHR0aGlzLnNldFNoZWxsVHlwZSh0aGlzLnNoZWxsVHlwZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9maXhlZENvbHMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYWRkU2Nyb2xsYmFyKCk7XG5cdFx0XHR9XG5cdFx0fSkuY2F0Y2goKGVycikgPT4ge1xuXHRcdFx0Ly8gSWdub3JlIGV4Y2VwdGlvbnMgaWYgdGhlIHRlcm1pbmFsIGlzIGFscmVhZHkgZGlzcG9zZWRcblx0XHRcdGlmICghdGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuVGVybWluYWwpKSB7XG5cdFx0XHRcdHRoaXMuX3NldEFyaWFMYWJlbCh0aGlzLnh0ZXJtPy5yYXcsIHRoaXMuX2luc3RhbmNlSWQsIHRoaXMudGl0bGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsLmludGVncmF0ZWQnKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZygpO1xuXHRcdFx0XHR0aGlzLnNldFZpc2libGUodGhpcy5faXNWaXNpYmxlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxheW91dFNldHRpbmdzOiBzdHJpbmdbXSA9IFtcblx0XHRcdFx0VGVybWluYWxTZXR0aW5nSWQuRm9udFNpemUsXG5cdFx0XHRcdFRlcm1pbmFsU2V0dGluZ0lkLkZvbnRGYW1pbHksXG5cdFx0XHRcdFRlcm1pbmFsU2V0dGluZ0lkLkZvbnRXZWlnaHQsXG5cdFx0XHRcdFRlcm1pbmFsU2V0dGluZ0lkLkZvbnRXZWlnaHRCb2xkLFxuXHRcdFx0XHRUZXJtaW5hbFNldHRpbmdJZC5MZXR0ZXJTcGFjaW5nLFxuXHRcdFx0XHRUZXJtaW5hbFNldHRpbmdJZC5MaW5lSGVpZ2h0LFxuXHRcdFx0XHQnZWRpdG9yLmZvbnRGYW1pbHknXG5cdFx0XHRdO1xuXHRcdFx0aWYgKGxheW91dFNldHRpbmdzLnNvbWUoaWQgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihpZCkpKSB7XG5cdFx0XHRcdHRoaXMuX2xheW91dFNldHRpbmdzQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc2l6ZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuVW5pY29kZVZlcnNpb24pKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVVuaWNvZGVWZXJzaW9uKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0JykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBY2Nlc3NpYmlsaXR5U3VwcG9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLlRlcm1pbmFsVGl0bGUpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuVGVybWluYWxUaXRsZVNlcGFyYXRvcikgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5UZXJtaW5hbERlc2NyaXB0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9sYWJlbENvbXB1dGVyPy5yZWZyZXNoTGFiZWwodGhpcyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygoKSA9PiB0aGlzLl9sYWJlbENvbXB1dGVyPy5yZWZyZXNoTGFiZWwodGhpcykpKTtcblxuXHRcdC8vIENsZWFyIG91dCBpbml0aWFsIGRhdGEgZXZlbnRzIGFmdGVyIDEwIHNlY29uZHMsIGhvcGVmdWxseSBleHRlbnNpb24gaG9zdHMgYXJlIHVwIGFuZFxuXHRcdC8vIHJ1bm5pbmcgYXQgdGhhdCBwb2ludC5cblx0XHRsZXQgaW5pdGlhbERhdGFFdmVudHNUaW1lb3V0OiBudW1iZXIgfCB1bmRlZmluZWQgPSBkb20uZ2V0V2luZG93KHRoaXMuX2NvbnRhaW5lcikuc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpbml0aWFsRGF0YUV2ZW50c1RpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9pbml0aWFsRGF0YUV2ZW50cyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2luaXRpYWxEYXRhRXZlbnRzTGlzdGVuZXIuY2xlYXIoKTtcblx0XHR9LCAxMDAwMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmIChpbml0aWFsRGF0YUV2ZW50c1RpbWVvdXQpIHtcblx0XHRcdFx0ZG9tLmdldFdpbmRvdyh0aGlzLl9jb250YWluZXIpLmNsZWFyVGltZW91dChpbml0aWFsRGF0YUV2ZW50c1RpbWVvdXQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEluaXRpYWxpemUgY29udHJpYnV0aW9uc1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbkRlc2NzID0gVGVybWluYWxFeHRlbnNpb25zUmVnaXN0cnkuZ2V0VGVybWluYWxDb250cmlidXRpb25zKCk7XG5cdFx0Zm9yIChjb25zdCBkZXNjIG9mIGNvbnRyaWJ1dGlvbkRlc2NzKSB7XG5cdFx0XHRpZiAodGhpcy5fY29udHJpYnV0aW9ucy5oYXMoZGVzYy5pZCkpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IobmV3IEVycm9yKGBDYW5ub3QgaGF2ZSB0d28gdGVybWluYWwgY29udHJpYnV0aW9ucyB3aXRoIHRoZSBzYW1lIGlkICR7ZGVzYy5pZH1gKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGNvbnRyaWJ1dGlvbjogSVRlcm1pbmFsQ29udHJpYnV0aW9uO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29udHJpYnV0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoZGVzYy5jdG9yLCB7XG5cdFx0XHRcdFx0aW5zdGFuY2U6IHRoaXMsXG5cdFx0XHRcdFx0cHJvY2Vzc01hbmFnZXI6IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLFxuXHRcdFx0XHRcdHdpZGdldE1hbmFnZXI6IHRoaXMuX3dpZGdldE1hbmFnZXJcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLl9jb250cmlidXRpb25zLnNldChkZXNjLmlkLCBjb250cmlidXRpb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl94dGVybVJlYWR5UHJvbWlzZS50aGVuKHh0ZXJtID0+IHtcblx0XHRcdFx0aWYgKHh0ZXJtKSB7XG5cdFx0XHRcdFx0Y29udHJpYnV0aW9uLnh0ZXJtUmVhZHk/Lih4dGVybSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0Y29udHJpYnV0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fY29udHJpYnV0aW9ucy5kZWxldGUoZGVzYy5pZCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldENvbnRyaWJ1dGlvbjxUIGV4dGVuZHMgSVRlcm1pbmFsQ29udHJpYnV0aW9uPihpZDogc3RyaW5nKTogVCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9jb250cmlidXRpb25zLmdldChpZCkgYXMgVCB8IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVPbkRhdGEoZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcHJvY2Vzc01hbmFnZXIud3JpdGUoZGF0YSk7XG5cdFx0dGhpcy5fb25EaWRJbnB1dERhdGEuZmlyZShkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEljb24oKTogVGVybWluYWxJY29uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2ljb24pIHtcblx0XHRcdHRoaXMuX2ljb24gPSB0aGlzLl9wcm9jZXNzTWFuYWdlci5wcm9jZXNzU3RhdGUgPj0gUHJvY2Vzc1N0YXRlLkxhdW5jaGluZ1xuXHRcdFx0XHQ/IGdldEljb25SZWdpc3RyeSgpLmdldEljb24odGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuVGFic0RlZmF1bHRJY29uKSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pY29uO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29sb3IoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5zaGVsbExhdW5jaENvbmZpZy5jb2xvcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2hlbGxMYXVuY2hDb25maWcuY29sb3I7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnPy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8uY29sb3IpIHtcblx0XHRcdHJldHVybiB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzLmNvbG9yO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wcm9jZXNzTWFuYWdlci5wcm9jZXNzU3RhdGUgPj0gUHJvY2Vzc1N0YXRlLkxhdW5jaGluZykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2luaXREaW1lbnNpb25zKCk6IHZvaWQge1xuXHRcdC8vIFRoZSB0ZXJtaW5hbCBwYW5lbCBuZWVkcyB0byBoYXZlIGJlZW4gY3JlYXRlZCB0byBnZXQgdGhlIHJlYWwgdmlldyBkaW1lbnNpb25zXG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdC8vIFNldCB0aGUgZmFsbGJhY2sgZGltZW5zaW9ucyBpZiBub3Rcblx0XHRcdHRoaXMuX2NvbHMgPSBDb25zdGFudHMuRGVmYXVsdENvbHM7XG5cdFx0XHR0aGlzLl9yb3dzID0gQ29uc3RhbnRzLkRlZmF1bHRSb3dzO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXB1dGVkU3R5bGUgPSBkb20uZ2V0V2luZG93KHRoaXMuX2NvbnRhaW5lcikuZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLl9jb250YWluZXIpO1xuXHRcdGNvbnN0IHdpZHRoID0gcGFyc2VJbnQoY29tcHV0ZWRTdHlsZS53aWR0aCk7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gcGFyc2VJbnQoY29tcHV0ZWRTdHlsZS5oZWlnaHQpO1xuXG5cdFx0dGhpcy5fZXZhbHVhdGVDb2xzQW5kUm93cyh3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFdmFsdWF0ZXMgYW5kIHNldHMgdGhlIGNvbHMgYW5kIHJvd3Mgb2YgdGhlIHRlcm1pbmFsIGlmIHBvc3NpYmxlLlxuXHQgKiBAcGFyYW0gd2lkdGggVGhlIHdpZHRoIG9mIHRoZSBjb250YWluZXIuXG5cdCAqIEBwYXJhbSBoZWlnaHQgVGhlIGhlaWdodCBvZiB0aGUgY29udGFpbmVyLlxuXHQgKiBAcmV0dXJuIFRoZSB0ZXJtaW5hbCdzIHdpZHRoIGlmIGl0IHJlcXVpcmVzIGEgbGF5b3V0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZXZhbHVhdGVDb2xzQW5kUm93cyh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IG51bWJlciB8IG51bGwge1xuXHRcdC8vIElnbm9yZSBpZiBkaW1lbnNpb25zIGFyZSB1bmRlZmluZWQgb3IgMFxuXHRcdGlmICghd2lkdGggfHwgIWhlaWdodCkge1xuXHRcdFx0dGhpcy5fc2V0TGFzdEtub3duQ29sc0FuZFJvd3MoKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpbWVuc2lvbiA9IHRoaXMuX2dldERpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0XHRpZiAoIWRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5fc2V0TGFzdEtub3duQ29sc0FuZFJvd3MoKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbnQgPSB0aGlzLnh0ZXJtID8gdGhpcy54dGVybS5nZXRGb250KCkgOiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQoZG9tLmdldFdpbmRvdyh0aGlzLmRvbUVsZW1lbnQpKTtcblx0XHRjb25zdCBuZXdSQyA9IGdldFh0ZXJtU2NhbGVkRGltZW5zaW9ucyhkb20uZ2V0V2luZG93KHRoaXMuZG9tRWxlbWVudCksIGZvbnQsIGRpbWVuc2lvbi53aWR0aCwgZGltZW5zaW9uLmhlaWdodCk7XG5cdFx0aWYgKCFuZXdSQykge1xuXHRcdFx0dGhpcy5fc2V0TGFzdEtub3duQ29sc0FuZFJvd3MoKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb2xzICE9PSBuZXdSQy5jb2xzIHx8IHRoaXMuX3Jvd3MgIT09IG5ld1JDLnJvd3MpIHtcblx0XHRcdHRoaXMuX2NvbHMgPSBuZXdSQy5jb2xzO1xuXHRcdFx0dGhpcy5fcm93cyA9IG5ld1JDLnJvd3M7XG5cdFx0XHR0aGlzLl9maXJlTWF4aW11bURpbWVuc2lvbnNDaGFuZ2VkKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpbWVuc2lvbi53aWR0aDtcblx0fVxuXG5cdHByaXZhdGUgX3NldExhc3RLbm93bkNvbHNBbmRSb3dzKCk6IHZvaWQge1xuXHRcdGlmIChUZXJtaW5hbEluc3RhbmNlLl9sYXN0S25vd25HcmlkRGltZW5zaW9ucykge1xuXHRcdFx0dGhpcy5fY29scyA9IFRlcm1pbmFsSW5zdGFuY2UuX2xhc3RLbm93bkdyaWREaW1lbnNpb25zLmNvbHM7XG5cdFx0XHR0aGlzLl9yb3dzID0gVGVybWluYWxJbnN0YW5jZS5fbGFzdEtub3duR3JpZERpbWVuc2lvbnMucm93cztcblx0XHR9XG5cdH1cblxuXHRAZGVib3VuY2UoNTApXG5cdHByaXZhdGUgX2ZpcmVNYXhpbXVtRGltZW5zaW9uc0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25NYXhpbXVtRGltZW5zaW9uc0NoYW5nZWQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGltZW5zaW9uKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogSUNhbnZhc0RpbWVuc2lvbnMgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRoZSBmb250IG5lZWRzIHRvIGhhdmUgYmVlbiBpbml0aWFsaXplZFxuXHRcdGNvbnN0IGZvbnQgPSB0aGlzLnh0ZXJtID8gdGhpcy54dGVybS5nZXRGb250KCkgOiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQoZG9tLmdldFdpbmRvdyh0aGlzLmRvbUVsZW1lbnQpKTtcblx0XHRpZiAoIWZvbnQgfHwgIWZvbnQuY2hhcldpZHRoIHx8ICFmb250LmNoYXJIZWlnaHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnh0ZXJtPy5yYXcuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29tcHV0ZWRTdHlsZSA9IGRvbS5nZXRXaW5kb3codGhpcy54dGVybS5yYXcuZWxlbWVudCkuZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLnh0ZXJtLnJhdy5lbGVtZW50KTtcblx0XHRjb25zdCBob3Jpem9udGFsUGFkZGluZyA9IHBhcnNlSW50KGNvbXB1dGVkU3R5bGUucGFkZGluZ0xlZnQpICsgcGFyc2VJbnQoY29tcHV0ZWRTdHlsZS5wYWRkaW5nUmlnaHQpICsgdGhpcy54dGVybS5zY3JvbGxiYXJXaWR0aC8qc2Nyb2xsIGJhciBwYWRkaW5nKi87XG5cdFx0Y29uc3QgdmVydGljYWxQYWRkaW5nID0gcGFyc2VJbnQoY29tcHV0ZWRTdHlsZS5wYWRkaW5nVG9wKSArIHBhcnNlSW50KGNvbXB1dGVkU3R5bGUucGFkZGluZ0JvdHRvbSk7XG5cdFx0VGVybWluYWxJbnN0YW5jZS5fbGFzdEtub3duQ2FudmFzRGltZW5zaW9ucyA9IG5ldyBkb20uRGltZW5zaW9uKFxuXHRcdFx0TWF0aC5taW4oQ29uc3RhbnRzLk1heENhbnZhc1dpZHRoLCB3aWR0aCAtIGhvcml6b250YWxQYWRkaW5nKSxcblx0XHRcdGhlaWdodCAtIHZlcnRpY2FsUGFkZGluZyArICh0aGlzLl9oYXNTY3JvbGxCYXIgJiYgdGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhciA/IC01Lyogc2Nyb2xsIGJhciBoZWlnaHQgKi8gOiAwKSk7XG5cdFx0cmV0dXJuIFRlcm1pbmFsSW5zdGFuY2UuX2xhc3RLbm93bkNhbnZhc0RpbWVuc2lvbnM7XG5cdH1cblxuXHRnZXQgcGVyc2lzdGVudFByb2Nlc3NJZCgpOiBudW1iZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcHJvY2Vzc01hbmFnZXIucGVyc2lzdGVudFByb2Nlc3NJZDsgfVxuXHRnZXQgc2hvdWxkUGVyc2lzdCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnNob3VsZFBlcnNpc3QgJiYgIXRoaXMuc2hlbGxMYXVuY2hDb25maWcuaXNUcmFuc2llbnQgJiYgKCF0aGlzLnJlY29ubmVjdGlvblByb3BlcnRpZXMgfHwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3Rhc2sucmVjb25uZWN0aW9uJykgPT09IHRydWUpOyB9XG5cblx0cHVibGljIHN0YXRpYyBnZXRYdGVybUNvbnN0cnVjdG9yKGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRjb25zdCBrZXliaW5kaW5nID0ga2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQuQTExeUZvY3VzQWNjZXNzaWJsZUJ1ZmZlciwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmICh4dGVybUNvbnN0cnVjdG9yKSB7XG5cdFx0XHRyZXR1cm4geHRlcm1Db25zdHJ1Y3Rvcjtcblx0XHR9XG5cdFx0eHRlcm1Db25zdHJ1Y3RvciA9IFByb21pc2VzLndpdGhBc3luY0JvZHk8dHlwZW9mIFhUZXJtVGVybWluYWw+KGFzeW5jIChyZXNvbHZlKSA9PiB7XG5cdFx0XHRjb25zdCBUZXJtaW5hbCA9IChhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B4dGVybS94dGVybScpPignQHh0ZXJtL3h0ZXJtJywgJ2xpYi94dGVybS5qcycpKS5UZXJtaW5hbDtcblx0XHRcdC8vIExvY2FsaXplIHN0cmluZ3Ncblx0XHRcdFRlcm1pbmFsLnN0cmluZ3MucHJvbXB0TGFiZWwgPSBubHMubG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYTExeVByb21wdExhYmVsJywgJ1Rlcm1pbmFsIGlucHV0Jyk7XG5cdFx0XHRUZXJtaW5hbC5zdHJpbmdzLnRvb011Y2hPdXRwdXQgPSBrZXliaW5kaW5nID8gbmxzLmxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnVzZUFjY2Vzc2libGVCdWZmZXInLCAnVXNlIHRoZSBhY2Nlc3NpYmxlIGJ1ZmZlciB7MH0gdG8gbWFudWFsbHkgcmV2aWV3IG91dHB1dCcsIGtleWJpbmRpbmcuZ2V0TGFiZWwoKSkgOiBubHMubG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudXNlQWNjZXNzaWJsZUJ1ZmZlck5vS2InLCAnVXNlIHRoZSBUZXJtaW5hbDogRm9jdXMgQWNjZXNzaWJsZSBCdWZmZXIgY29tbWFuZCB0byBtYW51YWxseSByZXZpZXcgb3V0cHV0Jyk7XG5cdFx0XHRyZXNvbHZlKFRlcm1pbmFsKTtcblx0XHR9KTtcblx0XHRyZXR1cm4geHRlcm1Db25zdHJ1Y3Rvcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgeHRlcm0uanMgaW5zdGFuY2UgYW5kIGF0dGFjaCBkYXRhIGxpc3RlbmVycy5cblx0ICovXG5cdHByb3RlY3RlZCBhc3luYyBfY3JlYXRlWHRlcm0oKTogUHJvbWlzZTxYdGVybVRlcm1pbmFsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgVGVybWluYWwgPSBhd2FpdCBUZXJtaW5hbEluc3RhbmNlLmdldFh0ZXJtQ29uc3RydWN0b3IodGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc2FibGVTaGVsbEludGVncmF0aW9uUmVwb3J0aW5nID0gKHRoaXMuc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuc2hlbGxUeXBlID09PSB1bmRlZmluZWQpIHx8ICFzaGVsbEludGVncmF0aW9uU3VwcG9ydGVkU2hlbGxUeXBlcy5pbmNsdWRlcyh0aGlzLnNoZWxsVHlwZSk7XG5cdFx0Y29uc3QgeHRlcm0gPSB0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShYdGVybVRlcm1pbmFsLCB0aGlzLl9yZXNvdXJjZSwgVGVybWluYWwsIHtcblx0XHRcdGNvbHM6IHRoaXMuX2NvbHMsXG5cdFx0XHRyb3dzOiB0aGlzLl9yb3dzLFxuXHRcdFx0eHRlcm1Db2xvclByb3ZpZGVyOiB0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbEluc3RhbmNlQ29sb3JQcm92aWRlciwgdGhpcy5fdGFyZ2V0UmVmKSxcblx0XHRcdGNhcGFiaWxpdGllczogdGhpcy5jYXBhYmlsaXRpZXMsXG5cdFx0XHRzaGVsbEludGVncmF0aW9uTm9uY2U6IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnNoZWxsSW50ZWdyYXRpb25Ob25jZSxcblx0XHRcdGRpc2FibGVTaGVsbEludGVncmF0aW9uUmVwb3J0aW5nLFxuXHRcdH0sIHRoaXMub25EaWRFeGVjdXRlVGV4dCk7XG5cdFx0dGhpcy54dGVybSA9IHh0ZXJtO1xuXHRcdHRoaXMuX3Jlc2l6ZURlYm91bmNlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXJtaW5hbFJlc2l6ZURlYm91bmNlcihcblx0XHRcdCgpID0+IHRoaXMuX2lzVmlzaWJsZSxcblx0XHRcdCgpID0+IHh0ZXJtLFxuXHRcdFx0YXN5bmMgKGNvbHMsIHJvd3MpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR4dGVybS5yZXNpemUoY29scywgcm93cyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVB0eURpbWVuc2lvbnMoeHRlcm0ucmF3KTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyAoY29scykgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHh0ZXJtLnJlc2l6ZShjb2xzLCB4dGVybS5yYXcucm93cyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVB0eURpbWVuc2lvbnMoeHRlcm0ucmF3KTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyAocm93cykgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHh0ZXJtLnJlc2l6ZSh4dGVybS5yYXcuY29scywgcm93cyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVB0eURpbWVuc2lvbnMoeHRlcm0ucmF3KTtcblx0XHRcdH1cblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fcmVzaXplRGVib3VuY2VyID0gdW5kZWZpbmVkKSk7XG5cdFx0dGhpcy51cGRhdGVBY2Nlc3NpYmlsaXR5U3VwcG9ydCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMueHRlcm0ub25EaWRSZXF1ZXN0UnVuQ29tbWFuZChlID0+IHtcblx0XHRcdHRoaXMuc2VuZFRleHQoZS5jb21tYW5kLmNvbW1hbmQsIGUubm9OZXdMaW5lID8gZmFsc2UgOiB0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy54dGVybS5vbkRpZFJlcXVlc3RSZWZyZXNoRGltZW5zaW9ucygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHQvLyBXcml0ZSBpbml0aWFsIHRleHQsIGRlZmVycmluZyBvbkxpbmVGZWVkIGxpc3RlbmVyIHdoZW4gYXBwbGljYWJsZSB0byBhdm9pZCBmaXJpbmdcblx0XHQvLyBvbkxpbmVEYXRhIGV2ZW50cyBjb250YWluaW5nIGluaXRpYWxUZXh0XG5cdFx0Y29uc3QgaW5pdGlhbFRleHRXcml0dGVuUHJvbWlzZSA9IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0ID8gbmV3IFByb21pc2U8dm9pZD4ociA9PiB0aGlzLl93cml0ZUluaXRpYWxUZXh0KHh0ZXJtLCByKSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbGluZURhdGFFdmVudEFkZG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IExpbmVEYXRhRXZlbnRBZGRvbihpbml0aWFsVGV4dFdyaXR0ZW5Qcm9taXNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGluZURhdGFFdmVudEFkZG9uLm9uTGluZURhdGEoZSA9PiB0aGlzLl9vbkxpbmVEYXRhLmZpcmUoZSkpKTtcblx0XHR0aGlzLl9saW5lRGF0YUV2ZW50QWRkb24gPSBsaW5lRGF0YUV2ZW50QWRkb247XG5cdFx0Ly8gRGVsYXkgdGhlIGNyZWF0aW9uIG9mIHRoZSBiZWxsIGxpc3RlbmVyIHRvIGF2b2lkIHNob3dpbmcgdGhlIGJlbGwgd2hlbiB0aGUgdGVybWluYWxcblx0XHQvLyBzdGFydHMgdXAgb3IgcmVjb25uZWN0c1xuXHRcdGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHh0ZXJtLnJhdy5vbkJlbGwoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuRW5hYmxlQmVsbCkgfHwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuRW5hYmxlVmlzdWFsQmVsbCkpIHtcblx0XHRcdFx0XHR0aGlzLnN0YXR1c0xpc3QuYWRkKHtcblx0XHRcdFx0XHRcdGlkOiBUZXJtaW5hbFN0YXR1cy5CZWxsLFxuXHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmJlbGwsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBubHMubG9jYWxpemUoJ2JlbGxTdGF0dXMnLCBcIkJlbGxcIilcblx0XHRcdFx0XHR9LCB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5iZWxsRHVyYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC50ZXJtaW5hbEJlbGwpO1xuXHRcdFx0fSkpO1xuXHRcdH0sIDEwMDAsIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5yYXcub25TZWxlY3Rpb25DaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZSh0aGlzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHh0ZXJtLnJhdy5idWZmZXIub25CdWZmZXJDaGFuZ2UoKCkgPT4gdGhpcy5fcmVmcmVzaEFsdEJ1ZmZlckNvbnRleHRLZXkoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvY2Vzc01hbmFnZXIub25Qcm9jZXNzRGF0YShlID0+IHRoaXMuX29uUHJvY2Vzc0RhdGEoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5yYXcub25EYXRhKGFzeW5jIGRhdGEgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlT25EYXRhKGRhdGEpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5yYXcub25CaW5hcnkoZGF0YSA9PiB0aGlzLl9wcm9jZXNzTWFuYWdlci5wcm9jZXNzQmluYXJ5KGRhdGEpKSk7XG5cdFx0Ly8gSW5pdCBjb25wdHkgY29tcGF0IGFuZCBsaW5rIGhhbmRsZXIgYWZ0ZXIgcHJvY2VzcyBjcmVhdGlvbiBhcyB0aGV5IHJlbHkgb24gdGhlXG5cdFx0Ly8gdW5kZXJseWluZyBwcm9jZXNzIE9TXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvY2Vzc01hbmFnZXIub25Qcm9jZXNzUmVhZHkoYXN5bmMgKHByb2Nlc3NUcmFpdHMpID0+IHtcblx0XHRcdC8vIFJlc3BvbmQgdG8gREExIHdpdGggYmFzaWMgY29uZm9ybWFuY2UuIE5vdGUgdGhhdCBpbmNsdWRpbmcgdGhpcyBpcyByZXF1aXJlZCB0byBhdm9pZFxuXHRcdFx0Ly8gYSBsb25nIGRlbGF5IGluIGNvbnB0eSAxLjIyKyB3aGVyZSBpdCB3YWl0cyBmb3IgdGhlIHJlc3BvbnNlLlxuXHRcdFx0Ly8gUmVmZXJlbmNlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3Rlcm1pbmFsL2Jsb2IvMzc2MGNhZWQ5N2ZhOTE0MGE0MDc3N2E4ZmJjMWM5NTc4NWU2ZDJhYi9zcmMvdGVybWluYWwvYWRhcHRlci9hZGFwdERpc3BhdGNoLmNwcCNMMTQ3MS1MMTQ5NVxuXHRcdFx0aWYgKHByb2Nlc3NUcmFpdHM/LndpbmRvd3NQdHk/LmJhY2tlbmQgPT09ICdjb25wdHknKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHh0ZXJtLnJhdy5wYXJzZXIucmVnaXN0ZXJDc2lIYW5kbGVyKHsgZmluYWw6ICdjJyB9LCBwYXJhbXMgPT4ge1xuXHRcdFx0XHRcdGlmIChwYXJhbXMubGVuZ3RoID09PSAwIHx8IHBhcmFtcy5sZW5ndGggPT09IDEgJiYgcGFyYW1zWzBdID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9oYW5kbGVPbkRhdGEoJ1xceDFiWz82MTs0YycpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLm9zKSB7XG5cdFx0XHRcdGxpbmVEYXRhRXZlbnRBZGRvbi5zZXRPcGVyYXRpbmdTeXN0ZW0odGhpcy5fcHJvY2Vzc01hbmFnZXIub3MpO1xuXHRcdFx0fVxuXHRcdFx0eHRlcm0ucmF3Lm9wdGlvbnMud2luZG93c1B0eSA9IHByb2Nlc3NUcmFpdHMud2luZG93c1B0eTtcblx0XHRcdC8vIEVuYWJsZSByZWZsb3cgY3Vyc29yIHRvIGF2b2lkIHByb21wdCBsb3NzOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjc0MzcyXG5cdFx0XHR4dGVybS5yYXcub3B0aW9ucy5yZWZsb3dDdXJzb3JMaW5lID0gcHJvY2Vzc1RyYWl0cz8ud2luZG93c1B0eT8uYmFja2VuZCA9PT0gJ2NvbnB0eScgJiYgISF0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy53aW5kb3dzVXNlQ29ucHR5RGxsO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm9jZXNzTWFuYWdlci5vblJlc3RvcmVDb21tYW5kcyhlID0+IHRoaXMueHRlcm0/LnNoZWxsSW50ZWdyYXRpb24uZGVzZXJpYWxpemUoZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5vbkRpZENoYW5nZUxvY2F0aW9uKCh7IHZpZXdzIH0pID0+IHtcblx0XHRcdGlmICh2aWV3cy5zb21lKHYgPT4gdi5pZCA9PT0gVEVSTUlOQUxfVklFV19JRCkpIHtcblx0XHRcdFx0eHRlcm0ucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5vbkRpZENoYW5nZVByb2dyZXNzKCgpID0+IHRoaXMuX2xhYmVsQ29tcHV0ZXI/LnJlZnJlc2hMYWJlbCh0aGlzKSkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgYW5kIHVwZGF0ZSB0aGUgdGVybWluYWwncyBzaGVsbCBpbnRlZ3JhdGlvbiBzdGF0dXNcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUoeHRlcm0uc2hlbGxJbnRlZ3JhdGlvbi5vbkRpZENoYW5nZVNlZW5TZXF1ZW5jZXMsICgpID0+IHtcblx0XHRcdGlmICh4dGVybS5zaGVsbEludGVncmF0aW9uLnNlZW5TZXF1ZW5jZXMuc2l6ZSA+IDApIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaFNoZWxsSW50ZWdyYXRpb25JbmZvU3RhdHVzKHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNldCB1cCB1cGRhdGluZyBvZiB0aGUgcHJvY2VzcyBjd2Qgb24ga2V5IHByZXNzLCB0aGlzIGlzIG9ubHkgbmVlZGVkIHdoZW4gdGhlIGN3ZFxuXHRcdC8vIGRldGVjdGlvbiBjYXBhYmlsaXR5IGhhcyBub3QgYmVlbiByZWdpc3RlcmVkXG5cdFx0aWYgKCF0aGlzLmNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkN3ZERldGVjdGlvbikpIHtcblx0XHRcdGxldCBvbktleUxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCA9IHh0ZXJtLnJhdy5vbktleShlID0+IHtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUuZG9tRXZlbnQpO1xuXHRcdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlUHJvY2Vzc0N3ZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ3dkRGV0ZWN0aW9uQ2FwYWJpbGl0eSgoKSA9PiB7XG5cdFx0XHRcdG9uS2V5TGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0b25LZXlMaXN0ZW5lciA9IHVuZGVmaW5lZDtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy54dGVybT8uc2hlbGxJbnRlZ3JhdGlvbikge1xuXHRcdFx0dGhpcy5jYXBhYmlsaXRpZXMuYWRkKHRoaXMueHRlcm0uc2hlbGxJbnRlZ3JhdGlvbi5jYXBhYmlsaXRpZXMpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BhdGhTZXJ2aWNlLnVzZXJIb21lKCkudGhlbih1c2VySG9tZSA9PiB7XG5cdFx0XHR0aGlzLl91c2VySG9tZSA9IHVzZXJIb21lLmZzUGF0aDtcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuX29wZW4oKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geHRlcm07XG5cdH1cblxuXHQvLyBEZWJvdW5jZSB0aGlzIHRvIGF2b2lkIGltcGFjdGluZyBpbnB1dCBsYXRlbmN5IHdoaWxlIHR5cGluZyBpbnRvIHRoZSBwcm9tcHRcblx0QGRlYm91bmNlKDUwMClcblx0cHJpdmF0ZSBfcmVmcmVzaFNoZWxsSW50ZWdyYXRpb25JbmZvU3RhdHVzKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdGlmICghaW5zdGFuY2UueHRlcm0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY21kRGV0ZWN0aW9uVHlwZSA9IChcblx0XHRcdGluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pPy5oYXNSaWNoQ29tbWFuZERldGVjdGlvblxuXHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnc2hlbGxJbnRlZ3JhdGlvbi5yaWNoJywgJ1JpY2gnKVxuXHRcdFx0XHQ6IGluc3RhbmNlLmNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pXG5cdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ3NoZWxsSW50ZWdyYXRpb24uYmFzaWMnLCAnQmFzaWMnKVxuXHRcdFx0XHRcdDogaW5zdGFuY2UudXNlZFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25cblx0XHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdzaGVsbEludGVncmF0aW9uLmluamVjdGlvbkZhaWxlZCcsIFwiSW5qZWN0aW9uIGZhaWxlZCB0byBhY3RpdmF0ZVwiKVxuXHRcdFx0XHRcdFx0OiBubHMubG9jYWxpemUoJ3NoZWxsSW50ZWdyYXRpb24ubm8nLCAnTm8nKVxuXHRcdCk7XG5cblx0XHRjb25zdCBkZXRhaWxlZEFkZGl0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoaW5zdGFuY2Uuc2hlbGxUeXBlKSB7XG5cdFx0XHRkZXRhaWxlZEFkZGl0aW9ucy5wdXNoKGBTaGVsbCB0eXBlOiBcXGAke2luc3RhbmNlLnNoZWxsVHlwZX1cXGBgKTtcblx0XHR9XG5cdFx0Y29uc3QgY3dkID0gaW5zdGFuY2UuY3dkO1xuXHRcdGlmIChjd2QpIHtcblx0XHRcdGRldGFpbGVkQWRkaXRpb25zLnB1c2goYEN1cnJlbnQgd29ya2luZyBkaXJlY3Rvcnk6IFxcYCR7Y3dkfVxcYGApO1xuXHRcdH1cblx0XHRjb25zdCBzZWVuU2VxdWVuY2VzID0gQXJyYXkuZnJvbShpbnN0YW5jZS54dGVybS5zaGVsbEludGVncmF0aW9uLnNlZW5TZXF1ZW5jZXMpO1xuXHRcdGlmIChzZWVuU2VxdWVuY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdGRldGFpbGVkQWRkaXRpb25zLnB1c2goYFNlZW4gc2VxdWVuY2VzOiAke3NlZW5TZXF1ZW5jZXMubWFwKGUgPT4gYFxcYCR7ZX1cXGBgKS5qb2luKCcsICcpfWApO1xuXHRcdH1cblx0XHRjb25zdCBwcm9tcHRUeXBlID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuUHJvbXB0VHlwZURldGVjdGlvbik/LnByb21wdFR5cGU7XG5cdFx0aWYgKHByb21wdFR5cGUpIHtcblx0XHRcdGRldGFpbGVkQWRkaXRpb25zLnB1c2goYFByb21wdCB0eXBlOiBcXGAke3Byb21wdFR5cGV9XFxgYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbWJpbmVkU3RyaW5nID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik/LnByb21wdElucHV0TW9kZWwuZ2V0Q29tYmluZWRTdHJpbmcoKTtcblx0XHRpZiAoY29tYmluZWRTdHJpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGV0YWlsZWRBZGRpdGlvbnMucHVzaChgUHJvbXB0IGlucHV0OiBcXGBcXGBcXGAke2NvbWJpbmVkU3RyaW5nfVxcYFxcYFxcYGApO1xuXHRcdH1cblx0XHRjb25zdCBkZXRhaWxlZEFkZGl0aW9uc1N0cmluZyA9IGRldGFpbGVkQWRkaXRpb25zLmxlbmd0aCA+IDBcblx0XHRcdD8gJ1xcblxcbicgKyBkZXRhaWxlZEFkZGl0aW9ucy5tYXAoZSA9PiBgLSAke2V9YCkuam9pbignXFxuJylcblx0XHRcdDogJyc7XG5cblx0XHRpbnN0YW5jZS5zdGF0dXNMaXN0LmFkZCh7XG5cdFx0XHRpZDogVGVybWluYWxTdGF0dXMuU2hlbGxJbnRlZ3JhdGlvbkluZm8sXG5cdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdHRvb2x0aXA6IGAke25scy5sb2NhbGl6ZSgnc2hlbGxJbnRlZ3JhdGlvbicsIFwiU2hlbGwgaW50ZWdyYXRpb25cIil9OiAke2NtZERldGVjdGlvblR5cGV9YCxcblx0XHRcdGRldGFpbGVkVG9vbHRpcDogYCR7bmxzLmxvY2FsaXplKCdzaGVsbEludGVncmF0aW9uJywgXCJTaGVsbCBpbnRlZ3JhdGlvblwiKX06ICR7Y21kRGV0ZWN0aW9uVHlwZX0ke2RldGFpbGVkQWRkaXRpb25zU3RyaW5nfWBcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkNvbW1hbmQoY29tbWFuZExpbmU6IHN0cmluZywgc2hvdWxkRXhlY3V0ZTogYm9vbGVhbiwgY29tbWFuZElkPzogc3RyaW5nLCBmb3JjZUJyYWNrZXRlZFBhc3RlTW9kZT86IGJvb2xlYW4sIGNvbW1hbmRMaW5lRm9yTWV0YWRhdGE/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgY29tbWFuZERldGVjdGlvbiA9IHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0Y29uc3Qgc2lJbmplY3Rpb25FbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWQpID09PSB0cnVlO1xuXHRcdGNvbnN0IHRpbWVvdXRNcyA9IGdldFNoZWxsSW50ZWdyYXRpb25UaW1lb3V0KFxuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRzaUluamVjdGlvbkVuYWJsZWQsXG5cdFx0XHR0aGlzLmhhc1JlbW90ZUF1dGhvcml0eSxcblx0XHRcdHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnByb2Nlc3NSZWFkeVRpbWVzdGFtcFxuXHRcdCk7XG5cblx0XHRpZiAoIWNvbW1hbmREZXRlY3Rpb24gfHwgY29tbWFuZERldGVjdGlvbi5wcm9tcHRJbnB1dE1vZGVsLnN0YXRlICE9PSBQcm9tcHRJbnB1dFN0YXRlLklucHV0KSB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0bmV3IFByb21pc2U8dm9pZD4ociA9PiB7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKHRoaXMuY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkoZSA9PiB7XG5cdFx0XHRcdFx0XHRjb21tYW5kRGV0ZWN0aW9uID0gZTtcblx0XHRcdFx0XHRcdGlmIChjb21tYW5kRGV0ZWN0aW9uLnByb21wdElucHV0TW9kZWwuc3RhdGUgPT09IFByb21wdElucHV0U3RhdGUuSW5wdXQpIHtcblx0XHRcdFx0XHRcdFx0cigpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c3RvcmUuYWRkKGNvbW1hbmREZXRlY3Rpb24ucHJvbXB0SW5wdXRNb2RlbC5vbkRpZFN0YXJ0SW5wdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHIoKTtcblx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdHRpbWVvdXQodGltZW91dE1zKVxuXHRcdFx0XSk7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgYSBjb21tYW5kIElEIHdhcyBwcm92aWRlZCBhbmQgd2UgaGF2ZSBjb21tYW5kIGRldGVjdGlvbiwgc2V0IGl0IGFzIHRoZSBuZXh0IGNvbW1hbmQgSURcblx0XHQvLyBzbyBpdCB3aWxsIGJlIHVzZWQgd2hlbiB0aGUgc2hlbGwgc2VuZHMgdGhlIGNvbW1hbmQgc3RhcnQgc2VxdWVuY2Vcblx0XHRpZiAoY29tbWFuZElkICYmIGNvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lVG9SZXBvcnQgPSBjb21tYW5kTGluZUZvck1ldGFkYXRhID8/IGNvbW1hbmRMaW5lO1xuXHRcdFx0dGhpcy54dGVybT8uc2hlbGxJbnRlZ3JhdGlvbi5zZXROZXh0Q29tbWFuZElkKGNvbW1hbmRMaW5lVG9SZXBvcnQsIGNvbW1hbmRJZCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm9jZXNzTWFuYWdlci5zZXROZXh0Q29tbWFuZElkKGNvbW1hbmRMaW5lVG9SZXBvcnQsIGNvbW1hbmRJZCk7XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZXJtaW5lIHdoZXRoZXIgdG8gc2VuZCBFVFggKGN0cmwrYykgYmVmb3JlIHJ1bm5pbmcgdGhlIGNvbW1hbmQuIE9ubHkgZG8gdGhpcyB3aGVuIHRoZVxuXHRcdC8vIGNvbW1hbmQgd2lsbCBiZSBleGVjdXRlZCBpbW1lZGlhdGVseSBvciB3aGVuIGNvbW1hbmQgZGV0ZWN0aW9uIHNob3dzIHRoZSBwcm9tcHQgY29udGFpbnMgdGV4dC5cblx0XHRpZiAoc2hvdWxkRXhlY3V0ZSAmJiAoIWNvbW1hbmREZXRlY3Rpb24gfHwgY29tbWFuZERldGVjdGlvbi5wcm9tcHRJbnB1dE1vZGVsLnZhbHVlLmxlbmd0aCA+IDApKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnNlbmRUZXh0KCdcXHgwMycsIGZhbHNlKTtcblx0XHRcdC8vIFdhaXQgYSBsaXR0bGUgYmVmb3JlIHJ1bm5pbmcgdGhlIGNvbW1hbmQgdG8gYXZvaWQgdGhlIHNlcXVlbmNlcyBiZWluZyBlY2hvZWQgd2hpbGUgdGhlIF5DXG5cdFx0XHQvLyBpcyBiZWluZyBldmFsdWF0ZWRcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTAwKTtcblx0XHR9XG5cdFx0Ly8gQnkgZGVmYXVsdCwgdXNlIGJyYWNrZXRlZCBwYXN0ZSBtb2RlIG9ubHkgd2hlbiBub3QgcnVubmluZyB0aGUgY29tbWFuZDsgY2FsbGVycyBjYW4gb3ZlcnJpZGVcblx0XHQvLyB0aGlzIGJ5IGV4cGxpY2l0bHkgZW5hYmxpbmcgaXQgdmlhIHRoZSBicmFja2V0ZWRQYXN0ZU1vZGUgYXJndW1lbnQuXG5cdFx0YXdhaXQgdGhpcy5zZW5kVGV4dChjb21tYW5kTGluZSwgc2hvdWxkRXhlY3V0ZSwgIXNob3VsZEV4ZWN1dGUgfHwgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGUpO1xuXHR9XG5cblx0ZGV0YWNoRnJvbUVsZW1lbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fd3JhcHBlckVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXR0YWNoVG9FbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBUaGUgY29udGFpbmVyIGRpZCBub3QgY2hhbmdlLCBkbyBub3RoaW5nXG5cdFx0aWYgKHRoaXMuX2NvbnRhaW5lciA9PT0gY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9hdHRhY2hCYXJyaWVyLmlzT3BlbigpKSB7XG5cdFx0XHR0aGlzLl9hdHRhY2hCYXJyaWVyLm9wZW4oKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgY29udGFpbmVyIGNoYW5nZWQsIHJlYXR0YWNoXG5cdFx0dGhpcy5fY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl93cmFwcGVyRWxlbWVudCk7XG5cblx0XHQvLyBJZiB4dGVybSBpcyBhbHJlYWR5IGF0dGFjaGVkLCBjYWxsIG9wZW4gYWdhaW4gdG8gcGljayB1cCBhbnkgY2hhbmdlcyB0byB0aGUgd2luZG93LlxuXHRcdGlmICh0aGlzLnh0ZXJtPy5yYXcuZWxlbWVudCkge1xuXHRcdFx0dGhpcy54dGVybS5yYXcub3Blbih0aGlzLnh0ZXJtLnJhdy5lbGVtZW50KTtcblx0XHR9XG5cblx0XHR0aGlzLnh0ZXJtPy5yZWZyZXNoKCk7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2luaXREcmFnQW5kRHJvcChjb250YWluZXIpO1xuXHRcdH0sIDApO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW5zIHRoZSB0ZXJtaW5hbCBpbnN0YW5jZSBpbnNpZGUgdGhlIHBhcmVudCBET00gZWxlbWVudCBwcmV2aW91c2x5IHNldCB3aXRoXG5cdCAqIGBhdHRhY2hUb0VsZW1lbnRgLCB5b3UgbXVzdCBlbnN1cmUgdGhlIHBhcmVudCBET00gZWxlbWVudCBpcyBleHBsaWNpdGx5IHZpc2libGUgYmVmb3JlXG5cdCAqIGludm9raW5nIHRoaXMgZnVuY3Rpb24gYXMgaXQgcGVyZm9ybXMgc29tZSBET00gY2FsY3VsYXRpb25zIGludGVybmFsbHlcblx0ICovXG5cdHByaXZhdGUgX29wZW4oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnh0ZXJtIHx8IHRoaXMueHRlcm0ucmF3LmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lciB8fCAhdGhpcy5fY29udGFpbmVyLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0EgY29udGFpbmVyIGVsZW1lbnQgbmVlZHMgdG8gYmUgc2V0IHdpdGggYGF0dGFjaFRvRWxlbWVudGAgYW5kIGJlIHBhcnQgb2YgdGhlIERPTSBiZWZvcmUgY2FsbGluZyBgX29wZW5gJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeHRlcm1Ib3N0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0eHRlcm1Ib3N0LmNsYXNzTGlzdC5hZGQoJ3Rlcm1pbmFsLXh0ZXJtLWhvc3QnKTtcblx0XHR0aGlzLl93cmFwcGVyRWxlbWVudC5hcHBlbmRDaGlsZCh4dGVybUhvc3QpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3dyYXBwZXJFbGVtZW50KTtcblxuXHRcdGNvbnN0IHh0ZXJtID0gdGhpcy54dGVybTtcblxuXHRcdC8vIEF0dGFjaCB0aGUgeHRlcm0gb2JqZWN0IHRvIHRoZSBET00sIGV4cG9zaW5nIGl0IHRvIHRoZSBzbW9rZSB0ZXN0c1xuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50Lnh0ZXJtID0geHRlcm0ucmF3O1xuXG5cdFx0Y29uc3Qgc2NyZWVuRWxlbWVudCA9IHh0ZXJtLmF0dGFjaFRvRWxlbWVudCh4dGVybUhvc3QpO1xuXG5cdFx0Ly8gRmlyZSB4dGVybU9wZW4gb24gYWxsIGNvbnRyaWJ1dGlvbnNcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiB0aGlzLl9jb250cmlidXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoIXRoaXMueHRlcm0pIHtcblx0XHRcdFx0dGhpcy5feHRlcm1SZWFkeVByb21pc2UudGhlbih4dGVybSA9PiB7XG5cdFx0XHRcdFx0aWYgKHh0ZXJtKSB7XG5cdFx0XHRcdFx0XHRjb250cmlidXRpb24ueHRlcm1PcGVuPy4oeHRlcm0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250cmlidXRpb24ueHRlcm1PcGVuPy4odGhpcy54dGVybSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoeHRlcm0uc2hlbGxJbnRlZ3JhdGlvbi5vbkRpZENoYW5nZVN0YXR1cygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5oYXNGb2N1cykge1xuXHRcdFx0XHR0aGlzLl9zZXRTaGVsbEludGVncmF0aW9uQ29udGV4dEtleSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxTaGVsbEludGVncmF0aW9uRW5hYmxlZENvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIXh0ZXJtLnJhdy5lbGVtZW50IHx8ICF4dGVybS5yYXcudGV4dGFyZWEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigneHRlcm0gZWxlbWVudHMgbm90IHNldCBhZnRlciBvcGVuJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0QXJpYUxhYmVsKHh0ZXJtLnJhdywgdGhpcy5faW5zdGFuY2VJZCwgdGhpcy5fdGl0bGUpO1xuXG5cdFx0eHRlcm0ucmF3LmF0dGFjaEN1c3RvbUtleUV2ZW50SGFuZGxlcigoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiBib29sZWFuID0+IHtcblx0XHRcdC8vIERpc2FibGUgYWxsIGlucHV0IGlmIHRoZSB0ZXJtaW5hbCBpcyBleGl0aW5nXG5cdFx0XHRpZiAodGhpcy5faXNFeGl0aW5nKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhbmRhcmRLZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChldmVudCk7XG5cdFx0XHRjb25zdCByZXNvbHZlUmVzdWx0ID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2Uuc29mdERpc3BhdGNoKHN0YW5kYXJkS2V5Ym9hcmRFdmVudCwgc3RhbmRhcmRLZXlib2FyZEV2ZW50LnRhcmdldCk7XG5cblx0XHRcdC8vIFJlc3BlY3QgY2hvcmRzIGlmIHRoZSBhbGxvd0Nob3JkcyBzZXR0aW5nIGlzIHNldCBhbmQgaXQncyBub3QgRXNjYXBlLiBFc2NhcGUgaXNcblx0XHRcdC8vIGhhbmRsZWQgc3BlY2lhbGx5IGZvciBaZW4gTW9kZSdzIEVzY2FwZSwgRXNjYXBlIGNob3JkLCBwbHVzIGl0J3MgaW1wb3J0YW50IGluXG5cdFx0XHQvLyB0ZXJtaW5hbHMgZ2VuZXJhbGx5XG5cdFx0XHRjb25zdCBpc1ZhbGlkQ2hvcmQgPSByZXNvbHZlUmVzdWx0LmtpbmQgPT09IFJlc3VsdEtpbmQuTW9yZUNob3Jkc05lZWRlZCAmJiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5hbGxvd0Nob3JkcyAmJiBldmVudC5rZXkgIT09ICdFc2NhcGUnO1xuXHRcdFx0aWYgKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmluQ2hvcmRNb2RlIHx8IGlzVmFsaWRDaG9yZCkge1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNraXAgcHJvY2Vzc2luZyBieSB4dGVybS5qcyBvZiBrZXlib2FyZCBldmVudHMgdGhhdCByZXNvbHZlIHRvIGNvbW1hbmRzIGRlZmluZWQgaW5cblx0XHRcdC8vIHRoZSBjb21tYW5kc1RvU2tpcFNoZWxsIHNldHRpbmcsIG9yIHRoYXQgdXNlIHRoZSBNZXRhLlxuXHRcdFx0Ly8gVGhlIG1ldGFLZXkgY2hlY2sgaXMgbmVlZGVkIGJlY2F1c2Ugd2hlbiBhIHNoZWxsIGxpa2UgZmlzaCBlbmFibGVzIHRoZSBraXR0eVxuXHRcdFx0Ly8ga2V5Ym9hcmQgcHJvdG9jb2wsIHh0ZXJtLmpzIGVuY29kZXMgTWV0YS1tb2RpZmllZCBrZXlzIGFzIENTSSB1IHNlcXVlbmNlcyBhbmRcblx0XHRcdC8vIGNvbnN1bWVzIHRoZW0gdmlhIHByZXZlbnREZWZhdWx0LiBUaGUgKG5vbi1raXR0eSkgdHJhZGl0aW9uYWwgeHRlcm0uanMgaGFuZGxlciBhbHJlYWR5IHNraXBzXG5cdFx0XHQvLyBNZXRhIGtleXMgc28gdGhleSBidWJibGUgdXAgbmF0dXJhbGx5LCBidXQgdGhlIGtpdHR5IGhhbmRsZXIgZG9lcyBub3QuXG5cdFx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnNlbmRLZXliaW5kaW5nc1RvU2hlbGwgJiYgcmVzb2x2ZVJlc3VsdC5raW5kID09PSBSZXN1bHRLaW5kLktiRm91bmQgJiYgcmVzb2x2ZVJlc3VsdC5jb21tYW5kSWQgJiYgKGV2ZW50Lm1ldGFLZXkgfHwgdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5zaG91bGRDb21tYW5kU2tpcFNoZWxsKHJlc29sdmVSZXN1bHQuY29tbWFuZElkKSkpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTa2lwIHByb2Nlc3NpbmcgYnkgeHRlcm0uanMgb2Yga2V5Ym9hcmQgZXZlbnRzIHRoYXQgbWF0Y2ggbWVudSBiYXIgbW5lbW9uaWNzXG5cdFx0XHRpZiAodGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuYWxsb3dNbmVtb25pY3MgJiYgIWlzTWFjaW50b3NoICYmIGV2ZW50LmFsdEtleSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRhYiBmb2N1cyBtb2RlIGlzIG9uLCB0YWIgaXMgbm90IHBhc3NlZCB0byB0aGUgdGVybWluYWxcblx0XHRcdGlmIChUYWJGb2N1cy5nZXRUYWJGb2N1c01vZGUoKSAmJiBldmVudC5rZXkgPT09ICdUYWInKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJldmVudCBkZWZhdWx0IHdoZW4gc2hpZnQrdGFiIGlzIGJlaW5nIHNlbnQgdG8gdGhlIHRlcm1pbmFsIHRvIGF2b2lkIGl0IGJ1YmJsaW5nIHVwXG5cdFx0XHQvLyBhbmQgY2hhbmdpbmcgZm9jdXMgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE4ODMyOVxuXHRcdFx0aWYgKGV2ZW50LmtleSA9PT0gJ1RhYicgJiYgZXZlbnQuc2hpZnRLZXkpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFsd2F5cyBoYXZlIGFsdCtGNCBza2lwIHRoZSB0ZXJtaW5hbCBvbiBXaW5kb3dzIGFuZCBhbGxvdyBpdCB0byBiZSBoYW5kbGVkIGJ5IHRoZVxuXHRcdFx0Ly8gc3lzdGVtXG5cdFx0XHRpZiAoaXNXaW5kb3dzICYmIGV2ZW50LmFsdEtleSAmJiBldmVudC5rZXkgPT09ICdGNCcgJiYgIWV2ZW50LmN0cmxLZXkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGYWxsYmFjayB0byBmb3JjZSBjdHJsK3YgdG8gcGFzdGUgb24gYnJvd3NlcnMgdGhhdCBkbyBub3Qgc3VwcG9ydFxuXHRcdFx0Ly8gbmF2aWdhdG9yLmNsaXBib2FyZC5yZWFkVGV4dFxuXHRcdFx0aWYgKCFCcm93c2VyRmVhdHVyZXMuY2xpcGJvYXJkLnJlYWRUZXh0ICYmIGV2ZW50LmtleSA9PT0gJ3YnICYmIGV2ZW50LmN0cmxLZXkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHh0ZXJtLnJhdy5lbGVtZW50LCAnbW91c2Vkb3duJywgKCkgPT4ge1xuXHRcdFx0Ly8gV2UgbmVlZCB0byBsaXN0ZW4gdG8gdGhlIG1vdXNldXAgZXZlbnQgb24gdGhlIGRvY3VtZW50IHNpbmNlIHRoZSB1c2VyIG1heSByZWxlYXNlXG5cdFx0XHQvLyB0aGUgbW91c2UgYnV0dG9uIGFueXdoZXJlIG91dHNpZGUgb2YgX3h0ZXJtLmVsZW1lbnQuXG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoeHRlcm0ucmF3LmVsZW1lbnQhLm93bmVyRG9jdW1lbnQsICdtb3VzZXVwJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBEZWxheSB3aXRoIGEgc2V0VGltZW91dCB0byBhbGxvdyB0aGUgbW91c2V1cCB0byBwcm9wYWdhdGUgdGhyb3VnaCB0aGUgRE9NXG5cdFx0XHRcdC8vIGJlZm9yZSBldmFsdWF0aW5nIHRoZSBuZXcgc2VsZWN0aW9uIHN0YXRlLlxuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX3JlZnJlc2hTZWxlY3Rpb25Db250ZXh0S2V5KCksIDApO1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih4dGVybS5yYXcuZWxlbWVudCwgJ3RvdWNoc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHR4dGVybS5yYXcuZm9jdXMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyB4dGVybS5qcyBjdXJyZW50bHkgZHJvcHMgc2VsZWN0aW9uIG9uIGtleXVwIGFzIHdlIG5lZWQgdG8gaGFuZGxlIHRoaXMgY2FzZS5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHh0ZXJtLnJhdy5lbGVtZW50LCAna2V5dXAnLCAoKSA9PiB7XG5cdFx0XHQvLyBXYWl0IHVudGlsIGtleXVwIGhhcyBwcm9wYWdhdGVkIHRocm91Z2ggdGhlIERPTSBiZWZvcmUgZXZhbHVhdGluZ1xuXHRcdFx0Ly8gdGhlIG5ldyBzZWxlY3Rpb24gc3RhdGUuXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX3JlZnJlc2hTZWxlY3Rpb25Db250ZXh0S2V5KCksIDApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoeHRlcm0ucmF3LnRleHRhcmVhLCAnZm9jdXMnLCAoKSA9PiB0aGlzLl9zZXRGb2N1cyh0cnVlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoeHRlcm0ucmF3LnRleHRhcmVhLCAnYmx1cicsICgpID0+IHRoaXMuX3NldEZvY3VzKGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoeHRlcm0ucmF3LnRleHRhcmVhLCAnZm9jdXNvdXQnLCAoKSA9PiB0aGlzLl9zZXRGb2N1cyhmYWxzZSkpKTtcblxuXHRcdHRoaXMuX2luaXREcmFnQW5kRHJvcCh0aGlzLl9jb250YWluZXIpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0TWFuYWdlci5hdHRhY2hUb0VsZW1lbnQoc2NyZWVuRWxlbWVudCk7XG5cblx0XHRpZiAodGhpcy5fbGFzdExheW91dERpbWVuc2lvbnMpIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVDb25maWcoKTtcblxuXHRcdC8vIElmIElTaGVsbExhdW5jaENvbmZpZy53YWl0T25FeGl0IHdhcyB0cnVlIGFuZCB0aGUgcHJvY2VzcyBmaW5pc2hlZCBiZWZvcmUgdGhlIHRlcm1pbmFsXG5cdFx0Ly8gcGFuZWwgd2FzIGluaXRpYWxpemVkLlxuXHRcdGlmICh4dGVybS5yYXcub3B0aW9ucy5kaXNhYmxlU3RkaW4pIHtcblx0XHRcdHRoaXMuX2F0dGFjaFByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyKHh0ZXJtLnJhdyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Rm9jdXMoZm9jdXNlZD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxGb2N1c0NvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5fc2V0U2hlbGxJbnRlZ3JhdGlvbkNvbnRleHRLZXkoKTtcblx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSh0aGlzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZXNldEZvY3VzQ29udGV4dEtleSgpO1xuXHRcdFx0dGhpcy5fb25EaWRCbHVyLmZpcmUodGhpcyk7XG5cdFx0XHR0aGlzLl9yZWZyZXNoU2VsZWN0aW9uQ29udGV4dEtleSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldFNoZWxsSW50ZWdyYXRpb25Db250ZXh0S2V5KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnh0ZXJtKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNoZWxsSW50ZWdyYXRpb25FbmFibGVkQ29udGV4dEtleS5zZXQodGhpcy54dGVybS5zaGVsbEludGVncmF0aW9uLnN0YXR1cyA9PT0gU2hlbGxJbnRlZ3JhdGlvblN0YXR1cy5WU0NvZGUpO1xuXHRcdH1cblx0fVxuXG5cdHJlc2V0Rm9jdXNDb250ZXh0S2V5KCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsRm9jdXNDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0dGhpcy5fdGVybWluYWxTaGVsbEludGVncmF0aW9uRW5hYmxlZENvbnRleHRLZXkucmVzZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2luaXREcmFnQW5kRHJvcChjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZG5kQ29udHJvbGxlciA9IHN0b3JlLmFkZCh0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbEluc3RhbmNlRHJhZ0FuZERyb3BDb250cm9sbGVyLCBjb250YWluZXIpKTtcblx0XHRzdG9yZS5hZGQoZG5kQ29udHJvbGxlci5vbkRyb3BUZXJtaW5hbChlID0+IHRoaXMuX29uUmVxdWVzdEFkZEluc3RhbmNlVG9Hcm91cC5maXJlKGUpKSk7XG5cdFx0c3RvcmUuYWRkKGRuZENvbnRyb2xsZXIub25Ecm9wRmlsZShhc3luYyBwYXRoID0+IHtcblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdGF3YWl0IHRoaXMuc2VuZFBhdGgocGF0aCwgZmFsc2UpO1xuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQobmV3IGRvbS5EcmFnQW5kRHJvcE9ic2VydmVyKGNvbnRhaW5lciwgZG5kQ29udHJvbGxlcikpO1xuXHRcdHRoaXMuX2RuZE9ic2VydmVyLnZhbHVlID0gc3RvcmU7XG5cdH1cblxuXHRoYXNTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMueHRlcm0gPyB0aGlzLnh0ZXJtLnJhdy5oYXNTZWxlY3Rpb24oKSA6IGZhbHNlO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnh0ZXJtICYmIHRoaXMuaGFzU2VsZWN0aW9uKCkgPyB0aGlzLnh0ZXJtLnJhdy5nZXRTZWxlY3Rpb24oKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGNsZWFyU2VsZWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMueHRlcm0/LnJhdy5jbGVhclNlbGVjdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaEFsdEJ1ZmZlckNvbnRleHRLZXkoKSB7XG5cdFx0dGhpcy5fdGVybWluYWxBbHRCdWZmZXJBY3RpdmVDb250ZXh0S2V5LnNldCghISh0aGlzLnh0ZXJtICYmIHRoaXMueHRlcm0ucmF3LmJ1ZmZlci5hY3RpdmUgPT09IHRoaXMueHRlcm0ucmF3LmJ1ZmZlci5hbHRlcm5hdGUpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UocmVhc29uPzogVGVybWluYWxFeGl0UmVhc29uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2hlbGxMYXVuY2hDb25maWcudHlwZSA9PT0gJ1Rhc2snICYmIHJlYXNvbiA9PT0gVGVybWluYWxFeGl0UmVhc29uLlByb2Nlc3MgJiYgdGhpcy5fZXhpdENvZGUgIT09IDAgJiYgIXRoaXMuc2hlbGxMYXVuY2hDb25maWcud2FpdE9uRXhpdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYHRlcm1pbmFsSW5zdGFuY2UjZGlzcG9zZSAoaW5zdGFuY2VJZDogJHt0aGlzLmluc3RhbmNlSWR9KWApO1xuXHRcdHRoaXMuX2lzRGlzcG9zaW5nID0gdHJ1ZTtcblx0XHRkaXNwb3NlKHRoaXMuX3dpZGdldE1hbmFnZXIpO1xuXG5cdFx0aWYgKHRoaXMueHRlcm0/LnJhdy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9oYWRGb2N1c09uRXhpdCA9IHRoaXMuaGFzRm9jdXM7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl93cmFwcGVyRWxlbWVudC54dGVybSkge1xuXHRcdFx0dGhpcy5fd3JhcHBlckVsZW1lbnQueHRlcm0gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9ob3Jpem9udGFsU2Nyb2xsYmFyKSB7XG5cdFx0XHR0aGlzLl9ob3Jpem9udGFsU2Nyb2xsYmFyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSBvbldpbGxEaXNwb3NlIGJlZm9yZSBkaXNwb3NpbmcgeHRlcm0gc28gdGhhdCBjb250cmlidXRpb25zIGNhbiBjbGVhblxuXHRcdC8vIHVwIHRoZWlyIHh0ZXJtIGFkZG9ucyB3aGlsZSB0aGUgcmF3IHRlcm1pbmFsIGlzIHN0aWxsIGFsaXZlLiBEaXNwb3Npbmdcblx0XHQvLyB4dGVybSBmaXJzdCB3b3VsZCBjYXVzZSBBZGRvbk1hbmFnZXIgdG8gcmVtb3ZlIGFkZG9ucyBmcm9tIGl0cyBsaXN0LFxuXHRcdC8vIGFuZCBzdWJzZXF1ZW50IGNvbnRyaWJ1dGlvbiBkaXNwb3NhbCB3b3VsZCBmYWlsIHdpdGggXCJDb3VsZCBub3QgZGlzcG9zZVxuXHRcdC8vIGFuIGFkZG9uIHRoYXQgaGFzIG5vdCBiZWVuIGxvYWRlZFwiLlxuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSh0aGlzKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnh0ZXJtPy5kaXNwb3NlKCk7XG5cdFx0fSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE1MzQ4NlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignRXhjZXB0aW9uIG9jY3VycmVkIGR1cmluZyB4dGVybSBkaXNwb3NhbCcsIGVycik7XG5cdFx0fVxuXG5cdFx0Ly8gSEFDSzogV29ya2Fyb3VuZCBmb3IgRmlyZWZveCBidWcgaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9NTU5NTYxLFxuXHRcdC8vIGFzICdibHVyJyBldmVudCBpbiB4dGVybS5yYXcudGV4dGFyZWEgaXMgbm90IHRyaWdnZXJlZCBvbiB4dGVybS5kaXNwb3NlKClcblx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzODM1OFxuXHRcdGlmIChpc0ZpcmVmb3gpIHtcblx0XHRcdHRoaXMucmVzZXRGb2N1c0NvbnRleHRLZXkoKTtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsSGFzVGV4dENvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdHRoaXMuX29uRGlkQmx1ci5maXJlKHRoaXMpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lcikge1xuXHRcdFx0dGhpcy5fcHJlc3NBbnlLZXlUb0Nsb3NlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcHJlc3NBbnlLZXlUb0Nsb3NlTGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2V4aXRSZWFzb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZXhpdFJlYXNvbiA9IHJlYXNvbiA/PyBUZXJtaW5hbEV4aXRSZWFzb24uVW5rbm93bjtcblx0XHR9XG5cblx0XHQvLyBEaXNwb3NlIHRoZSByZXNpemUgZGVib3VuY2VyIGJlZm9yZSB0aGUgcHJvY2VzcyBtYW5hZ2VyIHNvIHRoYXQgbm9cblx0XHQvLyByZXNpemUgY2FsbGJhY2tzIGNhbiBmaXJlIGFmdGVyIHB0eVByb2Nlc3NSZWFkeSBoYXMgYmVlbiBudWxsZWQuXG5cdFx0dGhpcy5fcmVzaXplRGVib3VuY2VyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcmVzaXplRGVib3VuY2VyID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fcHJvY2Vzc01hbmFnZXIuZGlzcG9zZSgpO1xuXHRcdC8vIFByb2Nlc3MgbWFuYWdlciBkaXNwb3NlL3NodXRkb3duIGRvZXNuJ3QgZmlyZSBwcm9jZXNzIGV4aXQsIHRyaWdnZXIgd2l0aCB1bmRlZmluZWQgaWYgaXRcblx0XHQvLyBoYXNuJ3QgaGFwcGVuZWQgeWV0XG5cdFx0dGhpcy5fb25Qcm9jZXNzRXhpdCh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gRmlyZSBvbkRpc3Bvc2VkIG9ubHkgYWZ0ZXIgeHRlcm0gaGFzIGJlZW4gZGlzcG9zZWQgc28gdGhhdCBzdWJzY3JpYmVyc1xuXHRcdC8vIG9ic2VydmUgYSBmdWxseSBkaXNwb3NlZCBpbnN0YW5jZS5cblx0XHR0aGlzLl9vbkRpc3Bvc2VkLmZpcmUodGhpcyk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRhc3luYyBkZXRhY2hQcm9jZXNzQW5kRGlzcG9zZShyZWFzb246IFRlcm1pbmFsRXhpdFJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIERldGFjaCB0aGUgcHJvY2VzcyBhbmQgZGlzcG9zZSB0aGUgaW5zdGFuY2UsIHdpdGhvdXQgdGhlIGluc3RhbmNlIGRpc3Bvc2UgdGhlIHRlcm1pbmFsXG5cdFx0Ly8gd29uJ3QgZ28gYXdheS4gRm9yY2UgcGVyc2lzdCBpZiB0aGUgZGV0YWNoIHdhcyByZXF1ZXN0ZWQgYnkgdGhlIHVzZXIgKG5vdCBzaHV0ZG93bikuXG5cdFx0YXdhaXQgdGhpcy5fcHJvY2Vzc01hbmFnZXIuZGV0YWNoRnJvbVByb2Nlc3MocmVhc29uID09PSBUZXJtaW5hbEV4aXRSZWFzb24uVXNlcik7XG5cdFx0dGhpcy5kaXNwb3NlKHJlYXNvbik7XG5cdH1cblxuXHRmb2N1cyhmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWZyZXNoQWx0QnVmZmVyQ29udGV4dEtleSgpO1xuXHRcdGlmICghdGhpcy54dGVybSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZm9yY2UgfHwgIWRvbS5nZXRBY3RpdmVXaW5kb3coKS5nZXRTZWxlY3Rpb24oKT8udG9TdHJpbmcoKSkge1xuXHRcdFx0dGhpcy54dGVybS5yYXcuZm9jdXMoKTtcblx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdEZvY3VzLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmb2N1c1doZW5SZWFkeShmb3JjZT86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl94dGVybVJlYWR5UHJvbWlzZTtcblx0XHRhd2FpdCB0aGlzLl9hdHRhY2hCYXJyaWVyLndhaXQoKTtcblx0XHR0aGlzLmZvY3VzKGZvcmNlKTtcblx0fVxuXG5cdGFzeW5jIHNlbmRUZXh0KHRleHQ6IHN0cmluZywgc2hvdWxkRXhlY3V0ZTogYm9vbGVhbiwgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGU/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQXBwbHkgYnJhY2tldGVkIHBhc3RlIHNlcXVlbmNlcyBpZiB0aGUgdGVybWluYWwgaGFzIHRoZSBtb2RlIGVuYWJsZWQsIHRoaXMgd2lsbCBwcmV2ZW50XG5cdFx0Ly8gdGhlIHRleHQgZnJvbSB0cmlnZ2VyaW5nIGtleWJpbmRpbmdzIGFuZCBlbnN1cmUgbmV3IGxpbmVzIGFyZSBoYW5kbGVkIHByb3Blcmx5XG5cdFx0aWYgKGZvcmNlQnJhY2tldGVkUGFzdGVNb2RlICYmIHRoaXMueHRlcm0/LnJhdy5tb2Rlcy5icmFja2V0ZWRQYXN0ZU1vZGUpIHtcblx0XHRcdHRleHQgPSBgXFx4MWJbMjAwfiR7dGV4dH1cXHgxYlsyMDF+YDtcblx0XHR9XG5cblx0XHQvLyBOb3JtYWxpemUgbGluZSBlbmRpbmdzIHRvICdlbnRlcicgcHJlc3MuXG5cdFx0dGV4dCA9IHRleHQucmVwbGFjZSgvXFxyP1xcbi9nLCAnXFxyJyk7XG5cdFx0aWYgKHNob3VsZEV4ZWN1dGUgJiYgIXRleHQuZW5kc1dpdGgoJ1xccicpKSB7XG5cdFx0XHR0ZXh0ICs9ICdcXHInO1xuXHRcdH1cblxuXHRcdC8vIFNlbmQgaXQgdG8gdGhlIHByb2Nlc3Ncblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdzZW5kaW5nIGRhdGEgKHZzY29kZSknLCB0ZXh0KTtcblx0XHRhd2FpdCB0aGlzLl9wcm9jZXNzTWFuYWdlci53cml0ZSh0ZXh0KTtcblx0XHR0aGlzLl9vbkRpZElucHV0RGF0YS5maXJlKHRleHQpO1xuXHRcdHRoaXMuX29uRGlkU2VuZFRleHQuZmlyZSh0ZXh0KTtcblx0XHR0aGlzLnh0ZXJtPy5zY3JvbGxUb0JvdHRvbSgpO1xuXHRcdGlmIChzaG91bGRFeGVjdXRlKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEV4ZWN1dGVUZXh0LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZW5kU2lnbmFsKHNpZ25hbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1Zygnc2VuZGluZyBzaWduYWwgKHZzY29kZSknLCBzaWduYWwpO1xuXHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnNlbmRTaWduYWwoc2lnbmFsKTtcblx0fVxuXG5cdGFzeW5jIHNlbmRQYXRoKG9yaWdpbmFsUGF0aDogc3RyaW5nIHwgVVJJLCBzaG91bGRFeGVjdXRlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZFRleHQoYXdhaXQgdGhpcy5wcmVwYXJlUGF0aEZvclNoZWxsKG9yaWdpbmFsUGF0aCksIHNob3VsZEV4ZWN1dGUpO1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVBhdGhGb3JTaGVsbChvcmlnaW5hbFBhdGg6IHN0cmluZyB8IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Ly8gV2FpdCBmb3Igc2hlbGwgdHlwZSB0byBiZSByZWFkeVxuXHRcdGF3YWl0IHRoaXMucHJvY2Vzc1JlYWR5O1xuXHRcdHJldHVybiBwcmVwYXJlUGF0aEZvclNoZWxsKG9yaWdpbmFsUGF0aCwgdGhpcy5zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlLCB0aGlzLnRpdGxlLCB0aGlzLnNoZWxsVHlwZSwgdGhpcy5fcHJvY2Vzc01hbmFnZXIuYmFja2VuZCwgdGhpcy5fcHJvY2Vzc01hbmFnZXIub3MpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VXJpTGFiZWxGb3JTaGVsbCh1cmk6IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Ly8gV2FpdCBmb3Igc2hlbGwgdHlwZSB0byBiZSByZWFkeVxuXHRcdGF3YWl0IHRoaXMucHJvY2Vzc1JlYWR5O1xuXHRcdHJldHVybiBnZXRVcmlMYWJlbEZvclNoZWxsKHVyaSwgdGhpcy5fcHJvY2Vzc01hbmFnZXIuYmFja2VuZCEsIHRoaXMuc2hlbGxUeXBlLCB0aGlzLm9zKTtcblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGRpZENoYW5nZSA9IHRoaXMuX2lzVmlzaWJsZSAhPT0gdmlzaWJsZTtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIHZpc2libGUpO1xuXHRcdGlmICh2aXNpYmxlICYmIHRoaXMueHRlcm0pIHtcblx0XHRcdHRoaXMuX29wZW4oKTtcblx0XHRcdC8vIEZsdXNoIGFueSBwZW5kaW5nIHJlc2l6ZXNcblx0XHRcdHRoaXMuX3Jlc2l6ZURlYm91bmNlcj8uZmx1c2goKTtcblx0XHRcdC8vIFJlc2l6ZSB0byByZS1ldmFsdWF0ZSBkaW1lbnNpb25zLCB0aGlzIHdpbGwgZW5zdXJlIHdoZW4gc3dpdGNoaW5nIHRvIGEgdGVybWluYWwgaXQgaXNcblx0XHRcdC8vIHVzaW5nIHRoZSBtb3N0IHVwIHRvIGRhdGUgZGltZW5zaW9ucyAoZWcuIHdoZW4gdGVybWluYWwgaXMgY3JlYXRlZCBpbiB0aGUgYmFja2dyb3VuZFxuXHRcdFx0Ly8gdXNpbmcgY2FjaGVkIGRpbWVuc2lvbnMgb2YgYSBzcGxpdCB0ZXJtaW5hbCkuXG5cdFx0XHR0aGlzLl9yZXNpemUoKTtcblx0XHR9XG5cdFx0aWYgKGRpZENoYW5nZSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUodmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0c2Nyb2xsRG93bkxpbmUoKTogdm9pZCB7XG5cdFx0dGhpcy54dGVybT8uc2Nyb2xsRG93bkxpbmUoKTtcblx0fVxuXG5cdHNjcm9sbERvd25QYWdlKCk6IHZvaWQge1xuXHRcdHRoaXMueHRlcm0/LnNjcm9sbERvd25QYWdlKCk7XG5cdH1cblxuXHRzY3JvbGxUb0JvdHRvbSgpOiB2b2lkIHtcblx0XHR0aGlzLnh0ZXJtPy5zY3JvbGxUb0JvdHRvbSgpO1xuXHR9XG5cblx0c2Nyb2xsVXBMaW5lKCk6IHZvaWQge1xuXHRcdHRoaXMueHRlcm0/LnNjcm9sbFVwTGluZSgpO1xuXHR9XG5cblx0c2Nyb2xsVXBQYWdlKCk6IHZvaWQge1xuXHRcdHRoaXMueHRlcm0/LnNjcm9sbFVwUGFnZSgpO1xuXHR9XG5cblx0c2Nyb2xsVG9Ub3AoKTogdm9pZCB7XG5cdFx0dGhpcy54dGVybT8uc2Nyb2xsVG9Ub3AoKTtcblx0fVxuXG5cdGNsZWFyQnVmZmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmNsZWFyQnVmZmVyKCk7XG5cdFx0dGhpcy54dGVybT8uY2xlYXJCdWZmZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hTZWxlY3Rpb25Db250ZXh0S2V5KCkge1xuXHRcdGNvbnN0IGlzQWN0aXZlID0gISF0aGlzLl92aWV3c1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZChURVJNSU5BTF9WSUVXX0lEKTtcblx0XHRsZXQgaXNFZGl0b3JBY3RpdmUgPSBmYWxzZTtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRpc0VkaXRvckFjdGl2ZSA9IGVkaXRvciBpbnN0YW5jZW9mIFRlcm1pbmFsRWRpdG9ySW5wdXQ7XG5cdFx0fVxuXHRcdHRoaXMuX3Rlcm1pbmFsSGFzVGV4dENvbnRleHRLZXkuc2V0KChpc0FjdGl2ZSB8fCBpc0VkaXRvckFjdGl2ZSkgJiYgdGhpcy5oYXNTZWxlY3Rpb24oKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZVByb2Nlc3NNYW5hZ2VyKCk6IFRlcm1pbmFsUHJvY2Vzc01hbmFnZXIge1xuXHRcdGxldCBkZXNlcmlhbGl6ZWRDb2xsZWN0aW9uczogUmVhZG9ubHlNYXA8c3RyaW5nLCBJRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24+IHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMpIHtcblx0XHRcdGRlc2VyaWFsaXplZENvbGxlY3Rpb25zID0gZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnModGhpcy5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMpO1xuXHRcdH1cblx0XHRjb25zdCBwcm9jZXNzTWFuYWdlciA9IHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0VGVybWluYWxQcm9jZXNzTWFuYWdlcixcblx0XHRcdHRoaXMuX2luc3RhbmNlSWQsXG5cdFx0XHR0aGlzLnNoZWxsTGF1bmNoQ29uZmlnPy5jd2QsXG5cdFx0XHRkZXNlcmlhbGl6ZWRDb2xsZWN0aW9ucyxcblx0XHRcdHRoaXMuc2hlbGxMYXVuY2hDb25maWcuc2hlbGxJbnRlZ3JhdGlvbk5vbmNlID8/IHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LnNoZWxsSW50ZWdyYXRpb25Ob25jZVxuXHRcdCk7XG5cdFx0dGhpcy5jYXBhYmlsaXRpZXMuYWRkKHByb2Nlc3NNYW5hZ2VyLmNhcGFiaWxpdGllcyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocHJvY2Vzc01hbmFnZXIub25Qcm9jZXNzUmVhZHkoYXN5bmMgKGUpID0+IHtcblx0XHRcdHRoaXMuX29uUHJvY2Vzc0lkUmVhZHkuZmlyZSh0aGlzKTtcblx0XHRcdHRoaXMuX2luaXRpYWxDd2QgPSBhd2FpdCB0aGlzLmdldEluaXRpYWxDd2QoKTtcblx0XHRcdC8vIFNldCB0aGUgaW5pdGlhbCBuYW1lIGJhc2VkIG9uIHRoZSBfcmVzb2x2ZWRfIHNoZWxsIGxhdW5jaCBjb25maWcsIHRoaXMgd2lsbCBhbHNvXG5cdFx0XHQvLyBlbnN1cmUgdGhlIHJlc29sdmVkIGljb24gZ2V0cyBzaG93blxuXHRcdFx0aWYgKCF0aGlzLl9sYWJlbENvbXB1dGVyKSB7XG5cdFx0XHRcdHRoaXMuX2xhYmVsQ29tcHV0ZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExhYmVsQ29tcHV0ZXIpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGFiZWxDb21wdXRlci5vbkRpZENoYW5nZUxhYmVsKGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHdhc0NoYW5nZWQgPSB0aGlzLl90aXRsZSAhPT0gZS50aXRsZSB8fCB0aGlzLl9kZXNjcmlwdGlvbiAhPT0gZS5kZXNjcmlwdGlvbjtcblx0XHRcdFx0XHRpZiAod2FzQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGl0bGUgPSBlLnRpdGxlO1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVzY3JpcHRpb24gPSBlLmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdFx0dGhpcy5fb25UaXRsZUNoYW5nZWQuZmlyZSh0aGlzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5uYW1lICYmICF0aGlzLl9zaGVsbExhdW5jaENvbmZpZy50aXRsZVRlbXBsYXRlKSB7XG5cdFx0XHRcdHRoaXMuX3NldFRpdGxlKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLm5hbWUsIFRpdGxlRXZlbnRTb3VyY2UuQXBpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIExpc3RlbiB0byB4dGVybS5qcycgc2VxdWVuY2UgdGl0bGUgY2hhbmdlIGV2ZW50LCB0cmlnZ2VyIHRoaXMgYXN5bmMgdG8gZW5zdXJlXG5cdFx0XHRcdC8vIF94dGVybVJlYWR5UHJvbWlzZSBpcyByZWFkeSBjb25zdHJ1Y3RlZCBzaW5jZSB0aGlzIGlzIGNhbGxlZCBmcm9tIHRoZSBjdG9yXG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3h0ZXJtUmVhZHlQcm9taXNlLnRoZW4oeHRlcm0gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHh0ZXJtKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX21lc3NhZ2VUaXRsZURpc3Bvc2FibGUudmFsdWUgPSB4dGVybS5yYXcub25UaXRsZUNoYW5nZShlID0+IHRoaXMuX29uVGl0bGVDaGFuZ2UoZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gV2hlbiBhIHRpdGxlIHRlbXBsYXRlIGlzIHByb3ZpZGVkLCB1c2UgdGhlIG5hbWUgYXMgdGhlIGluaXRpYWwgcHJvY2VzcyBuYW1lXG5cdFx0XHRcdC8vIHNvIGl0IGNhbiBiZSByZWZlcmVuY2VkIHZpYSAke3Byb2Nlc3N9IGluIHRoZSB0ZW1wbGF0ZVxuXHRcdFx0XHRpZiAodGhpcy5fc2hlbGxMYXVuY2hDb25maWcudGl0bGVUZW1wbGF0ZSAmJiB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5uYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0VGl0bGUodGhpcy5fc2hlbGxMYXVuY2hDb25maWcubmFtZSwgVGl0bGVFdmVudFNvdXJjZS5Qcm9jZXNzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zZXRUaXRsZSh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlLCBUaXRsZUV2ZW50U291cmNlLlByb2Nlc3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHByb2Nlc3NNYW5hZ2VyLm9uUHJvY2Vzc0V4aXQoZXhpdENvZGUgPT4gdGhpcy5fb25Qcm9jZXNzRXhpdChleGl0Q29kZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihwcm9jZXNzTWFuYWdlci5vbkRpZENoYW5nZVByb3BlcnR5KCh7IHR5cGUsIHZhbHVlIH0pID0+IHtcblx0XHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0XHRjYXNlIFByb2Nlc3NQcm9wZXJ0eVR5cGUuQ3dkOlxuXHRcdFx0XHRcdHRoaXMuX2N3ZCA9IHZhbHVlIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbUHJvY2Vzc1Byb3BlcnR5VHlwZS5Dd2RdO1xuXHRcdFx0XHRcdHRoaXMuX2xhYmVsQ29tcHV0ZXI/LnJlZnJlc2hMYWJlbCh0aGlzKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBQcm9jZXNzUHJvcGVydHlUeXBlLkluaXRpYWxDd2Q6XG5cdFx0XHRcdFx0dGhpcy5faW5pdGlhbEN3ZCA9IHZhbHVlIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbUHJvY2Vzc1Byb3BlcnR5VHlwZS5Jbml0aWFsQ3dkXTtcblx0XHRcdFx0XHR0aGlzLl9jd2QgPSB0aGlzLl9pbml0aWFsQ3dkO1xuXHRcdFx0XHRcdHRoaXMuX3NldFRpdGxlKHRoaXMudGl0bGUsIFRpdGxlRXZlbnRTb3VyY2UuQ29uZmlnKTtcblx0XHRcdFx0XHR0aGlzLl9pY29uID0gdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/Lmljb24gfHwgdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaWNvbjtcblx0XHRcdFx0XHR0aGlzLl9vbkljb25DaGFuZ2VkLmZpcmUoeyBpbnN0YW5jZTogdGhpcywgdXNlckluaXRpYXRlZDogZmFsc2UgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5UaXRsZTpcblx0XHRcdFx0XHR0aGlzLl9zZXRUaXRsZSh2YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuVGl0bGVdID8/ICcnLCBUaXRsZUV2ZW50U291cmNlLlByb2Nlc3MpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFByb2Nlc3NQcm9wZXJ0eVR5cGUuT3ZlcnJpZGVEaW1lbnNpb25zOlxuXHRcdFx0XHRcdHRoaXMuc2V0T3ZlcnJpZGVEaW1lbnNpb25zKHZhbHVlIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbUHJvY2Vzc1Byb3BlcnR5VHlwZS5PdmVycmlkZURpbWVuc2lvbnNdLCB0cnVlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBQcm9jZXNzUHJvcGVydHlUeXBlLlJlc29sdmVkU2hlbGxMYXVuY2hDb25maWc6XG5cdFx0XHRcdFx0dGhpcy5fc2V0UmVzb2x2ZWRTaGVsbExhdW5jaENvbmZpZyh2YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuUmVzb2x2ZWRTaGVsbExhdW5jaENvbmZpZ10pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFByb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxUeXBlOlxuXHRcdFx0XHRcdHRoaXMuX2hhbmRsZVNoZWxsVHlwZUNoYW5nZSh2YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxUeXBlXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5IYXNDaGlsZFByb2Nlc3Nlczpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzLmZpcmUodmFsdWUgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtQcm9jZXNzUHJvcGVydHlUeXBlLkhhc0NoaWxkUHJvY2Vzc2VzXSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5Vc2VkU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbjpcblx0XHRcdFx0XHR0aGlzLl91c2VkU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5TaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbjpcblx0XHRcdFx0XHR0aGlzLl9zaGVsbEludGVncmF0aW9uSW5qZWN0aW9uSW5mbyA9IHZhbHVlIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbUHJvY2Vzc1Byb3BlcnR5VHlwZS5TaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbl07XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5faW5pdGlhbERhdGFFdmVudHNMaXN0ZW5lci52YWx1ZSA9IHByb2Nlc3NNYW5hZ2VyLm9uUHJvY2Vzc0RhdGEoZXYgPT4gdGhpcy5faW5pdGlhbERhdGFFdmVudHM/LnB1c2goZXYuZGF0YSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHByb2Nlc3NNYW5hZ2VyLm9uUHJvY2Vzc1JlcGxheUNvbXBsZXRlKCgpID0+IHRoaXMuX29uUHJvY2Vzc1JlcGxheUNvbXBsZXRlLmZpcmUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHByb2Nlc3NNYW5hZ2VyLm9uRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2VkKGUgPT4gdGhpcy5fb25FbnZpcm9ubWVudFZhcmlhYmxlSW5mb0NoYW5nZWQoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihwcm9jZXNzTWFuYWdlci5vblB0eURpc2Nvbm5lY3QoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMueHRlcm0pIHtcblx0XHRcdFx0dGhpcy54dGVybS5yYXcub3B0aW9ucy5kaXNhYmxlU3RkaW4gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zdGF0dXNMaXN0LmFkZCh7XG5cdFx0XHRcdGlkOiBUZXJtaW5hbFN0YXR1cy5EaXNjb25uZWN0ZWQsXG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5kZWJ1Z0Rpc2Nvbm5lY3QsXG5cdFx0XHRcdHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgnZGlzY29ubmVjdFN0YXR1cycsIFwiTG9zdCBjb25uZWN0aW9uIHRvIHByb2Nlc3NcIilcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihwcm9jZXNzTWFuYWdlci5vblB0eVJlY29ubmVjdCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy54dGVybSkge1xuXHRcdFx0XHR0aGlzLnh0ZXJtLnJhdy5vcHRpb25zLmRpc2FibGVTdGRpbiA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zdGF0dXNMaXN0LnJlbW92ZShUZXJtaW5hbFN0YXR1cy5EaXNjb25uZWN0ZWQpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBwcm9jZXNzTWFuYWdlcjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVByb2Nlc3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0cnVzdGVkID0gdGhpcy5faXNSZW1vdGVSZXNvbHZlclRlcm1pbmFsIHx8IGF3YWl0IHRoaXMuX3RydXN0KCk7XG5cdFx0Ly8gQWxsb3cgcmVtb3RlIHRlcm1pbmFscyBpbiBhIHJlbW90ZSB3b3Jrc3BhY2UgdG8gYmUgY3JlYXRlZCB3aGVuIHRydXN0IGlzIGRlbmllZCwgYnV0XG5cdFx0Ly8gc3RpbGwgYmxvY2sgbG9jYWwgdGVybWluYWxzICh0aG9zZSB3aXRob3V0IGEgcmVtb3RlQXV0aG9yaXR5KSBldmVuIHdoZW4gdGhlIHdvcmtzcGFjZSBpcyByZW1vdGUuXG5cdFx0Y29uc3QgaXNSZW1vdGVUZXJtaW5hbCA9ICEhdGhpcy5yZW1vdGVBdXRob3JpdHk7XG5cdFx0aWYgKCF0cnVzdGVkICYmICEoaXNSZW1vdGVUZXJtaW5hbCAmJiB0aGlzLl93b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSkge1xuXHRcdFx0dGhpcy5fb25Qcm9jZXNzRXhpdCh7IG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlTm90VHJ1c3RlZENyZWF0ZVRlcm1pbmFsJywgXCJDYW5ub3QgbGF1bmNoIGEgdGVybWluYWwgcHJvY2VzcyBpbiBhbiB1bnRydXN0ZWQgd29ya3NwYWNlXCIpIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGggPT09IDAgJiYgdGhpcy5fY3dkICYmIHRoaXMuX3VzZXJIb21lICYmIG5vcm1hbGl6ZURyaXZlTGV0dGVyKHRoaXMuX2N3ZCkgIT09IG5vcm1hbGl6ZURyaXZlTGV0dGVyKHRoaXMuX3VzZXJIb21lKSkge1xuXHRcdFx0Ly8gc29tZXRoaW5nIHN0cmFuZ2UgaXMgZ29pbmcgb24gaWYgY3dkIGlzIG5vdCB1c2VySG9tZSBpbiBhbiBlbXB0eSB3b3Jrc3BhY2Vcblx0XHRcdHRoaXMuX29uUHJvY2Vzc0V4aXQoe1xuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3dvcmtzcGFjZUVtcHR5Q3JlYXRlVGVybWluYWxDd2QnLCBcIkNhbm5vdCBsYXVuY2ggYSB0ZXJtaW5hbCBwcm9jZXNzIGluIGFuIGVtcHR5IHdvcmtzcGFjZSB3aXRoIGN3ZCB7MH0gZGlmZmVyZW50IGZyb20gdXNlckhvbWUgezF9XCIsIHRoaXMuX2N3ZCwgdGhpcy5fdXNlckhvbWUpXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUmUtZXZhbHVhdGUgZGltZW5zaW9ucyBpZiB0aGUgY29udGFpbmVyIGhhcyBiZWVuIHNldCBzaW5jZSB0aGUgeHRlcm0gaW5zdGFuY2Ugd2FzIGNyZWF0ZWRcblx0XHRpZiAodGhpcy5fY29udGFpbmVyICYmIHRoaXMuX2NvbHMgPT09IDAgJiYgdGhpcy5fcm93cyA9PT0gMCkge1xuXHRcdFx0dGhpcy5faW5pdERpbWVuc2lvbnMoKTtcblx0XHRcdHRoaXMueHRlcm0/LnJlc2l6ZSh0aGlzLl9jb2xzIHx8IENvbnN0YW50cy5EZWZhdWx0Q29scywgdGhpcy5fcm93cyB8fCBDb25zdGFudHMuRGVmYXVsdFJvd3MpO1xuXHRcdH1cblx0XHRjb25zdCBvcmlnaW5hbEljb24gPSB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmljb247XG5cdFx0YXdhaXQgdGhpcy5fcHJvY2Vzc01hbmFnZXIuY3JlYXRlUHJvY2Vzcyh0aGlzLl9zaGVsbExhdW5jaENvbmZpZywgdGhpcy5fY29scyB8fCBDb25zdGFudHMuRGVmYXVsdENvbHMsIHRoaXMuX3Jvd3MgfHwgQ29uc3RhbnRzLkRlZmF1bHRSb3dzKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGlmIChoYXNLZXkocmVzdWx0LCB7IG1lc3NhZ2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHR0aGlzLl9vblByb2Nlc3NFeGl0KHJlc3VsdCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzS2V5KHJlc3VsdCwgeyBpbmplY3RlZEFyZ3M6IHRydWUgfSkpIHtcblx0XHRcdFx0XHR0aGlzLl9pbmplY3RlZEFyZ3MgPSByZXN1bHQuaW5qZWN0ZWRBcmdzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAob3JpZ2luYWxJY29uICE9PSB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmljb24gfHwgdGhpcy5zaGVsbExhdW5jaENvbmZpZy5jb2xvcikge1xuXHRcdFx0dGhpcy5faWNvbiA9IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5pY29uIHx8IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmljb247XG5cdFx0XHR0aGlzLl9vbkljb25DaGFuZ2VkLmZpcmUoeyBpbnN0YW5jZTogdGhpcywgdXNlckluaXRpYXRlZDogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyTWFya2VyKG9mZnNldD86IG51bWJlcik6IElNYXJrZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnh0ZXJtPy5yYXcucmVnaXN0ZXJNYXJrZXIob2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBhZGRCdWZmZXJNYXJrZXIocHJvcGVydGllczogSU1hcmtQcm9wZXJ0aWVzKTogdm9pZCB7XG5cdFx0dGhpcy5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKT8uYWRkTWFyayhwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdHB1YmxpYyBzY3JvbGxUb01hcmsoc3RhcnRNYXJrSWQ6IHN0cmluZywgZW5kTWFya0lkPzogc3RyaW5nLCBoaWdobGlnaHQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy54dGVybT8ubWFya1RyYWNrZXIuc2Nyb2xsVG9DbG9zZXN0TWFya2VyKHN0YXJ0TWFya0lkLCBlbmRNYXJrSWQsIGhpZ2hsaWdodCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZnJlZVBvcnRLaWxsUHJvY2Vzcyhwb3J0OiBzdHJpbmcsIGNvbW1hbmQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyPy5mcmVlUG9ydEtpbGxQcm9jZXNzKHBvcnQpO1xuXHRcdHRoaXMucnVuQ29tbWFuZChjb21tYW5kLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9vblByb2Nlc3NEYXRhKGV2OiBJUHJvY2Vzc0RhdGFFdmVudCk6IHZvaWQge1xuXHRcdC8vIEVuc3VyZSBldmVudHMgYXJlIHNwbGl0IGJ5IFNJIGNvbW1hbmQgZXhlY3V0ZSBhbmQgY29tbWFuZCBmaW5pc2hlZCBzZXF1ZW5jZSB0byBlbnN1cmUgdGhlXG5cdFx0Ly8gb3V0cHV0IG9mIHRoZSBjb21tYW5kIGNhbiBiZSByZWFkIGJ5IGV4dGVuc2lvbnMgYW5kIHRoZSBvdXRwdXQgb2YgdGhlIGNvbW1hbmQgaXMgb2YgYVxuXHRcdC8vIGNvbnNpc3RlbnQgZm9ybSByZXNwZWN0aXZlbHkuIFRoaXMgbXVzdCBiZSBkb25lIGhlcmUgYXMgeHRlcm0uanMgZG9lcyBub3QgY3VycmVudGx5IGhhdmVcblx0XHQvLyBhIGxpc3RlbmVyIGZvciB3aGVuIGluZGl2aWR1YWwgZGF0YSBldmVudHMgYXJlIHBhcnNlZCwgb25seSBgb25Xcml0ZVBhcnNlZGAgd2hpY2ggZmlyZXNcblx0XHQvLyB3aGVuIHRoZSB3cml0ZSBidWZmZXIgaXMgZmx1c2hlZC5cblx0XHRjb25zdCBsZWFkaW5nU2VnbWVudGVkRGF0YTogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBtYXRjaGVzID0gZXYuZGF0YS5tYXRjaEFsbCgvKD88c2VxPlxceDFiXFxdWzE2XTMzOyg/OkN8RCg/OjtcXGQrKT8pXFx4MDcpL2cpO1xuXHRcdGxldCBpID0gMDtcblx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRcdGlmIChtYXRjaC5ncm91cHM/LnNlcSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ3NlcSBtdXN0IGJlIGRlZmluZWQnKTtcblx0XHRcdH1cblx0XHRcdGxlYWRpbmdTZWdtZW50ZWREYXRhLnB1c2goZXYuZGF0YS5zdWJzdHJpbmcoaSwgbWF0Y2guaW5kZXgpKTtcblx0XHRcdGxlYWRpbmdTZWdtZW50ZWREYXRhLnB1c2gobWF0Y2guZ3JvdXBzPy5zZXEgPz8gJycpO1xuXHRcdFx0aSA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuXHRcdH1cblx0XHRjb25zdCBsYXN0RGF0YSA9IGV2LmRhdGEuc3Vic3RyaW5nKGkpO1xuXG5cdFx0Ly8gV3JpdGUgYWxsIGxlYWRpbmcgc2VnbWVudGVkIGRhdGEgZmlyc3QsIGZvbGxvd2VkIGJ5IHRoZSBsYXN0IGRhdGEsIHRyYWNraW5nIGNvbW1pdCBpZlxuXHRcdC8vIG5lY2Vzc2FyeVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGVhZGluZ1NlZ21lbnRlZERhdGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX3dyaXRlUHJvY2Vzc0RhdGEobGVhZGluZ1NlZ21lbnRlZERhdGFbaV0pO1xuXHRcdH1cblx0XHRpZiAoZXYudHJhY2tDb21taXQpIHtcblx0XHRcdGV2LndyaXRlUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gdGhpcy5fd3JpdGVQcm9jZXNzRGF0YShsYXN0RGF0YSwgcikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl93cml0ZVByb2Nlc3NEYXRhKGxhc3REYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93cml0ZVByb2Nlc3NEYXRhKGRhdGE6IHN0cmluZywgY2I/OiAoKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy5fb25XaWxsRGF0YS5maXJlKGRhdGEpO1xuXHRcdGNvbnN0IG1lc3NhZ2VJZCA9ICsrdGhpcy5fbGF0ZXN0WHRlcm1Xcml0ZURhdGE7XG5cdFx0dGhpcy54dGVybT8ucmF3LndyaXRlKGRhdGEsICgpID0+IHtcblx0XHRcdHRoaXMuX2xhdGVzdFh0ZXJtUGFyc2VEYXRhID0gbWVzc2FnZUlkO1xuXHRcdFx0dGhpcy5fcHJvY2Vzc01hbmFnZXIuYWNrbm93bGVkZ2VEYXRhRXZlbnQoZGF0YS5sZW5ndGgpO1xuXHRcdFx0Y2I/LigpO1xuXHRcdFx0dGhpcy5fb25EYXRhLmZpcmUoZGF0YSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gZWl0aGVyIGEgcHJvY2VzcyB0aWVkIHRvIGEgdGVybWluYWwgaGFzIGV4aXRlZCBvciB3aGVuIGEgdGVybWluYWwgcmVuZGVyZXJcblx0ICogc2ltdWxhdGVzIGEgcHJvY2VzcyBleGl0aW5nIChlLmcuIGN1c3RvbSBleGVjdXRpb24gdGFzaykuXG5cdCAqIEBwYXJhbSBleGl0Q29kZSBUaGUgZXhpdCBjb2RlIG9mIHRoZSBwcm9jZXNzLCB0aGlzIGlzIHVuZGVmaW5lZCB3aGVuIHRoZSB0ZXJtaW5hbCB3YXMgZXhpdGVkXG5cdCAqIHRocm91Z2ggdXNlciBhY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9vblByb2Nlc3NFeGl0KGV4aXRDb2RlT3JFcnJvcj86IG51bWJlciB8IElUZXJtaW5hbExhdW5jaEVycm9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gUHJldmVudCBkaXNwb3NlIGZ1bmN0aW9ucyBiZWluZyB0cmlnZ2VyZWQgbXVsdGlwbGUgdGltZXNcblx0XHRpZiAodGhpcy5faXNFeGl0aW5nIHx8IHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWRFeGl0UmVzdWx0ID0gcGFyc2VFeGl0UmVzdWx0KGV4aXRDb2RlT3JFcnJvciwgdGhpcy5zaGVsbExhdW5jaENvbmZpZywgdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1N0YXRlLCB0aGlzLl9pbml0aWFsQ3dkKTtcblxuXHRcdGlmICh0aGlzLl91c2VkU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbiAmJiB0aGlzLl9wcm9jZXNzTWFuYWdlci5wcm9jZXNzU3RhdGUgPT09IFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2ggJiYgcGFyc2VkRXhpdFJlc3VsdD8uY29kZSAhPT0gMCkge1xuXHRcdFx0dGhpcy5fcmVsYXVuY2hXaXRoU2hlbGxJbnRlZ3JhdGlvbkRpc2FibGVkKHBhcnNlZEV4aXRSZXN1bHQ/Lm1lc3NhZ2UpO1xuXHRcdFx0dGhpcy5fb25FeGl0LmZpcmUoZXhpdENvZGVPckVycm9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pc0V4aXRpbmcgPSB0cnVlO1xuXG5cdFx0YXdhaXQgdGhpcy5fZmx1c2hYdGVybURhdGEoKTtcblxuXHRcdHRoaXMuX2V4aXRDb2RlID0gcGFyc2VkRXhpdFJlc3VsdD8uY29kZTtcblx0XHRjb25zdCBleGl0TWVzc2FnZSA9IHBhcnNlZEV4aXRSZXN1bHQ/Lm1lc3NhZ2U7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdUZXJtaW5hbCBwcm9jZXNzIGV4aXQnLCAnaW5zdGFuY2VJZCcsIHRoaXMuaW5zdGFuY2VJZCwgJ2NvZGUnLCB0aGlzLl9leGl0Q29kZSwgJ3Byb2Nlc3NTdGF0ZScsIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnByb2Nlc3NTdGF0ZSk7XG5cblx0XHQvLyBGaXJlIG9uRXhpdCBCRUZPUkUgcnVubmluZyBhbnkgZGlzcG9zaXRpb24gbG9naWMgKGluIHBhcnRpY3VsYXIgYmVmb3JlXG5cdFx0Ly8gYGRpc3Bvc2UoKWAgYmVsb3csIHdoaWNoIGZpcmVzIGBvbkRpc3Bvc2VkYCkuIENvbnN1bWVycyByYWNpbmdcblx0XHQvLyBgb25FeGl0YCBhZ2FpbnN0IGBvbkRpc3Bvc2VkYCAoZS5nLiB0aGUgY2hhdCBhZ2VudCBydW4taW4tdGVybWluYWxcblx0XHQvLyBleGVjdXRlIHN0cmF0ZWdpZXMpIG5lZWQgdG8gc2VlIHRoZSBleGl0IGNvZGUgZXZlbnQgZmlyc3Qgc28gdGhleSBjYW5cblx0XHQvLyByZXR1cm4gdGhlIGNhcHR1cmVkIGV4aXQgY29kZS4gT3RoZXJ3aXNlIGBvbkRpc3Bvc2VkYCB3aW5zIHRoZSByYWNlXG5cdFx0Ly8gYW5kIHRoZSBzdHJhdGVneSB0cmVhdHMgdGhlIGV4aXQgYXMgdGhlIHRlcm1pbmFsIGhhdmluZyBiZWVuIGNsb3NlZFxuXHRcdC8vIHdpdGhvdXQgYW4gZXhpdCBjb2RlLCBsZWF2aW5nIGNvbW1hbmRzIGxpa2UgYGV4aXQgNDJgIHN0dWNrIGluIGFcblx0XHQvLyBcIlJ1bm5pbmdcIiBzdGF0ZS5cblx0XHR0aGlzLl9vbkV4aXQuZmlyZShleGl0Q29kZU9yRXJyb3IpO1xuXG5cdFx0Ly8gQmFpbCBpZiBkaXNwb3NlZCBkdXJpbmcgZmx1c2g7IHRoZSB3b3JrIGJlbG93IHdvdWxkIHRvdWNoIGRpc3Bvc2VkIHNlcnZpY2VzLlxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPbmx5IHRyaWdnZXIgd2FpdCBvbiBleGl0IHdoZW4gdGhlIGV4aXQgd2FzICpub3QqIHRyaWdnZXJlZCBieSB0aGVcblx0XHQvLyB1c2VyICh2aWEgdGhlIGB3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmtpbGxgIGNvbW1hbmQpLlxuXHRcdGNvbnN0IHdhaXRPbkV4aXQgPSB0aGlzLndhaXRPbkV4aXQ7XG5cdFx0aWYgKHdhaXRPbkV4aXQgJiYgdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1N0YXRlICE9PSBQcm9jZXNzU3RhdGUuS2lsbGVkQnlVc2VyKSB7XG5cdFx0XHR0aGlzLl94dGVybVJlYWR5UHJvbWlzZS50aGVuKHh0ZXJtID0+IHtcblx0XHRcdFx0aWYgKCF4dGVybSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXhpdE1lc3NhZ2UpIHtcblx0XHRcdFx0XHR4dGVybS5yYXcud3JpdGUoZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsKGV4aXRNZXNzYWdlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3dpdGNoICh0eXBlb2Ygd2FpdE9uRXhpdCkge1xuXHRcdFx0XHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRcdFx0XHR4dGVybS5yYXcud3JpdGUoZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsKHdhaXRPbkV4aXQsIHsgZXhjbHVkZUxlYWRpbmdOZXdMaW5lOiB0cnVlIH0pKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2Z1bmN0aW9uJzpcblx0XHRcdFx0XHRcdGlmICh0aGlzLmV4aXRDb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0eHRlcm0ucmF3LndyaXRlKGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbCh3YWl0T25FeGl0KHRoaXMuZXhpdENvZGUpLCB7IGV4Y2x1ZGVMZWFkaW5nTmV3TGluZTogdHJ1ZSB9KSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBEaXNhYmxlIGFsbCBpbnB1dCBpZiB0aGUgdGVybWluYWwgaXMgZXhpdGluZyBhbmQgbGlzdGVuIGZvciBuZXh0IGtleXByZXNzXG5cdFx0XHRcdHh0ZXJtLnJhdy5vcHRpb25zLmRpc2FibGVTdGRpbiA9IHRydWU7XG5cdFx0XHRcdGlmICh4dGVybS5yYXcudGV4dGFyZWEpIHtcblx0XHRcdFx0XHR0aGlzLl9hdHRhY2hQcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lcih4dGVybS5yYXcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGV4aXRNZXNzYWdlKSB7XG5cdFx0XHRcdGNvbnN0IGZhaWxlZER1cmluZ0xhdW5jaCA9IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnByb2Nlc3NTdGF0ZSA9PT0gUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaDtcblx0XHRcdFx0aWYgKGZhaWxlZER1cmluZ0xhdW5jaCB8fCAodGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuc2hvd0V4aXRBbGVydCAmJiB0aGlzLnh0ZXJtPy5sYXN0SW5wdXRFdmVudCAhPT0gLypDdHJsK0QqLydcXHgwNCcpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXhpdE1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0XHRhY3Rpb25zOiB7IHByaW1hcnk6IFt0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExhdW5jaEhlbHBBY3Rpb24pXSB9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gTG9nIHRvIGhlbHAgc3VyZmFjZSB0aGUgZXJyb3IgaW4gY2FzZSB1c2VycyByZXBvcnQgaXNzdWVzIHdpdGggc2hvd0V4aXRBbGVydFxuXHRcdFx0XHRcdC8vIGRpc2FibGVkXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGV4aXRNZXNzYWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5kaXNwb3NlKFRlcm1pbmFsRXhpdFJlYXNvbi5Qcm9jZXNzKTtcblx0XHR9XG5cblx0XHQvLyBEaXNwb3NlIG9mIHRoZSBvbkV4aXQgZXZlbnQgaWYgdGhlIHRlcm1pbmFsIHdpbGwgbm90IGJlIHJldXNlZCBhZ2FpblxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX29uRXhpdC5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVsYXVuY2hXaXRoU2hlbGxJbnRlZ3JhdGlvbkRpc2FibGVkKGV4aXRNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pZ25vcmVTaGVsbEludGVncmF0aW9uID0gdHJ1ZTtcblx0XHR0aGlzLnJlbGF1bmNoKCk7XG5cdFx0dGhpcy5zdGF0dXNMaXN0LmFkZCh7XG5cdFx0XHRpZDogVGVybWluYWxTdGF0dXMuU2hlbGxJbnRlZ3JhdGlvbkF0dGVudGlvbk5lZWRlZCxcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0aWNvbjogQ29kaWNvbi53YXJuaW5nLFxuXHRcdFx0dG9vbHRpcDogYCR7ZXhpdE1lc3NhZ2V9IGAgKyBubHMubG9jYWxpemUoJ2xhdW5jaEZhaWxlZC5leGl0Q29kZU9ubHlTaGVsbEludGVncmF0aW9uJywgJ0Rpc2FibGluZyBzaGVsbCBpbnRlZ3JhdGlvbiBpbiB1c2VyIHNldHRpbmdzIG1pZ2h0IGhlbHAuJyksXG5cdFx0XHRob3ZlckFjdGlvbnM6IFt7XG5cdFx0XHRcdGNvbW1hbmRJZDogVGVybWluYWxDb21tYW5kSWQuU2hlbGxJbnRlZ3JhdGlvbkxlYXJuTW9yZSxcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc2hlbGxJbnRlZ3JhdGlvbi5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmUgYWJvdXQgc2hlbGwgaW50ZWdyYXRpb25cIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbignaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy90ZXJtaW5hbC9zaGVsbC1pbnRlZ3JhdGlvbj9yZWZlcnJlcj1pbi1wcm9kdWN0Jyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdzaGVsbEludGVncmF0aW9uLm9wZW5TZXR0aW5ncycsIFwiT3BlbiB1c2VyIHNldHRpbmdzXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCAndGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbEludGVncmF0aW9uLmVuYWJsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fV1cblx0XHR9KTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e30sIHsgb3duZXI6ICdtZWdhbnJvZ2dlJzsgY29tbWVudDogJ0luZGljYXRlcyB0aGUgcHJvY2VzcyBleGl0ZWQgd2hlbiBjcmVhdGVkIHdpdGggc2hlbGwgaW50ZWdyYXRpb24gYXJncycgfT4oJ3Rlcm1pbmFsL3NoZWxsSW50ZWdyYXRpb25GYWlsdXJlUHJvY2Vzc0V4aXQnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnN1cmUgd3JpdGUgY2FsbHMgdG8geHRlcm0uanMgaGF2ZSBmaW5pc2hlZCBiZWZvcmUgcmVzb2x2aW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmx1c2hYdGVybURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2xhdGVzdFh0ZXJtV3JpdGVEYXRhID09PSB0aGlzLl9sYXRlc3RYdGVybVBhcnNlRGF0YSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRsZXQgcmV0cmllcyA9IDA7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0Y29uc3QgaW50ZXJ2YWwgPSBkb20uZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKGRvbS5nZXRBY3RpdmVXaW5kb3coKS53aW5kb3csICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2xhdGVzdFh0ZXJtV3JpdGVEYXRhID09PSB0aGlzLl9sYXRlc3RYdGVybVBhcnNlRGF0YSB8fCArK3JldHJpZXMgPT09IDUpIHtcblx0XHRcdFx0XHRpbnRlcnZhbC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAyMCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9hdHRhY2hQcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lcih4dGVybTogWFRlcm1UZXJtaW5hbCkge1xuXHRcdGlmICh4dGVybS50ZXh0YXJlYSAmJiAhdGhpcy5fcHJlc3NBbnlLZXlUb0Nsb3NlTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMuX3ByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyID0gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih4dGVybS50ZXh0YXJlYSwgJ2tleXByZXNzJywgKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9wcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lcikge1xuXHRcdFx0XHRcdHRoaXMuX3ByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9wcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLmRpc3Bvc2UoVGVybWluYWxFeGl0UmVhc29uLlByb2Nlc3MpO1xuXHRcdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlSW5pdGlhbFRleHQoeHRlcm06IFh0ZXJtVGVybWluYWwsIGNhbGxiYWNrPzogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQpIHtcblx0XHRcdGNhbGxiYWNrPy4oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dCA9IGlzU3RyaW5nKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0KVxuXHRcdFx0PyB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dFxuXHRcdFx0OiB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dD8udGV4dDtcblx0XHRpZiAoaXNTdHJpbmcodGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQpKSB7XG5cdFx0XHR4dGVybS5yYXcud3JpdGVsbih0ZXh0LCBjYWxsYmFjayk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dC50cmFpbGluZ05ld0xpbmUpIHtcblx0XHRcdFx0eHRlcm0ucmF3LndyaXRlbG4odGV4dCwgY2FsbGJhY2spO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0eHRlcm0ucmF3LndyaXRlKHRleHQsIGNhbGxiYWNrKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXVzZVRlcm1pbmFsKHNoZWxsOiBJU2hlbGxMYXVuY2hDb25maWcsIHJlc2V0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBVbnN1YnNjcmliZSBhbnkga2V5IGxpc3RlbmVyIHdlIG1heSBoYXZlLlxuXHRcdHRoaXMuX3ByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcHJlc3NBbnlLZXlUb0Nsb3NlTGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB4dGVybSA9IHRoaXMueHRlcm07XG5cdFx0aWYgKHh0ZXJtKSB7XG5cdFx0XHRpZiAoIXJlc2V0KSB7XG5cdFx0XHRcdC8vIEVuc3VyZSBuZXcgcHJvY2Vzc2VzJyBvdXRwdXQgc3RhcnRzIGF0IHN0YXJ0IG9mIG5ldyBsaW5lXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4geHRlcm0ucmF3LndyaXRlKCdcXG5cXHgxYltHJywgcikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQcmludCBpbml0aWFsVGV4dCBpZiBzcGVjaWZpZWRcblx0XHRcdGlmIChzaGVsbC5pbml0aWFsVGV4dCkge1xuXHRcdFx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dCA9IHNoZWxsLmluaXRpYWxUZXh0O1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHRoaXMuX3dyaXRlSW5pdGlhbFRleHQoeHRlcm0sIHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2xlYW4gdXAgd2FpdE9uRXhpdCBzdGF0ZVxuXHRcdFx0aWYgKHRoaXMuX2lzRXhpdGluZyAmJiB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy53YWl0T25FeGl0KSB7XG5cdFx0XHRcdHh0ZXJtLnJhdy5vcHRpb25zLmRpc2FibGVTdGRpbiA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9pc0V4aXRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXNldCkge1xuXHRcdFx0XHR4dGVybS5jbGVhckRlY29yYXRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSB0aGUgZW52aXJvbm1lbnQgaW5mbyB3aWRnZXQgaWYgaXQgZXhpc3RzXG5cdFx0dGhpcy5zdGF0dXNMaXN0LnJlbW92ZShUZXJtaW5hbFN0YXR1cy5SZWxhdW5jaE5lZWRlZCk7XG5cblx0XHRpZiAoIXJlc2V0KSB7XG5cdFx0XHQvLyBIQUNLOiBGb3JjZSBpbml0aWFsVGV4dCB0byBiZSBub24tZmFsc3kgZm9yIHJldXNlZCB0ZXJtaW5hbHMgc3VjaCB0aGF0IHRoZVxuXHRcdFx0Ly8gY29ucHR5SW5oZXJpdEN1cnNvciBmbGFnIGlzIHBhc3NlZCB0byB0aGUgbm9kZS1wdHksIHRoaXMgZmxhZyBjYW4gY2F1c2UgYSBXaW5kb3cgdG8gc3RvcFxuXHRcdFx0Ly8gcmVzcG9uZGluZyBpbiBXaW5kb3dzIDEwIDE5MDMgc28gd2Ugb25seSB3YW50IHRvIHVzZSBpdCB3aGVuIHNvbWV0aGluZyBpcyBkZWZpbml0ZWx5IHdyaXR0ZW5cblx0XHRcdC8vIHRvIHRoZSB0ZXJtaW5hbC5cblx0XHRcdHNoZWxsLmluaXRpYWxUZXh0ID0gJyAnO1xuXHRcdH1cblxuXHRcdC8vIFNldCB0aGUgbmV3IHNoZWxsIGxhdW5jaCBjb25maWdcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZyA9IHNoZWxsOyAvLyBNdXN0IGJlIGRvbmUgYmVmb3JlIGNhbGxpbmcgX2NyZWF0ZVByb2Nlc3MoKVxuXHRcdHRoaXMuX2FnZW50U2hlbGxUeXBlRnJvbVNlcXVlbmNlID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnJlbGF1bmNoKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLCB0aGlzLl9jb2xzIHx8IENvbnN0YW50cy5EZWZhdWx0Q29scywgdGhpcy5fcm93cyB8fCBDb25zdGFudHMuRGVmYXVsdFJvd3MsIHJlc2V0KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGlmIChoYXNLZXkocmVzdWx0LCB7IG1lc3NhZ2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHR0aGlzLl9vblByb2Nlc3NFeGl0KHJlc3VsdCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzS2V5KHJlc3VsdCwgeyBpbmplY3RlZEFyZ3M6IHRydWUgfSkpIHtcblx0XHRcdFx0XHR0aGlzLl9pbmplY3RlZEFyZ3MgPSByZXN1bHQuaW5qZWN0ZWRBcmdzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRAZGVib3VuY2UoMTAwMClcblx0cmVsYXVuY2goKTogdm9pZCB7XG5cdFx0Ly8gQ2xlYXIgdGhlIGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzIGZsYWcgdG8gZW5zdXJlIHdlIGNyZWF0ZSBhIG5ldyBwcm9jZXNzXG5cdFx0Ly8gaW5zdGVhZCBvZiB0cnlpbmcgdG8gcmVhdHRhY2ggdG8gdGhlIGV4aXN0aW5nIG9uZSBkdXJpbmcgcmVsYXVuY2guXG5cdFx0Y29uc3Qgc2hlbGxMYXVuY2hDb25maWcgPSB7IC4uLnRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnIH07XG5cdFx0ZGVsZXRlIHNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzO1xuXG5cdFx0dGhpcy5yZXVzZVRlcm1pbmFsKHNoZWxsTGF1bmNoQ29uZmlnLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX29uVGl0bGVDaGFuZ2UodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzVGl0bGVTZXRCeVByb2Nlc3MpIHtcblx0XHRcdHRoaXMuX3NldFRpdGxlKHRpdGxlLCBUaXRsZUV2ZW50U291cmNlLlNlcXVlbmNlKTtcblx0XHR9XG5cdFx0Ly8gQWdlbnQgQ0xJcyBydW4gYXMgYG5vZGVgLCBzbyB0aGUgT1NDIHRpdGxlIGlzIG91ciBvbmx5IGNyb3NzLXBsYXRmb3JtIHNpZ25hbC5cblx0XHRmb3IgKGNvbnN0IFtzaGVsbFR5cGUsIHBhdHRlcm5dIG9mIGFnZW50Q2xpVGl0bGVQYXR0ZXJucykge1xuXHRcdFx0aWYgKHBhdHRlcm4udGVzdCh0aXRsZSkpIHtcblx0XHRcdFx0dGhpcy5fYWdlbnRTaGVsbFR5cGVGcm9tU2VxdWVuY2UgPSBzaGVsbFR5cGU7XG5cdFx0XHRcdHRoaXMuc2V0U2hlbGxUeXBlKHNoZWxsVHlwZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVNoZWxsVHlwZUNoYW5nZShzaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gT25jZSBhbiBhZ2VudCBDTEkgaXMgbG9ja2VkIGluLCBpZ25vcmUgc3RhbGUgYG5vZGVgL3VuZGVmaW5lZCByZXBvcnRzIGZyb20gdGhlIHB0eVxuXHRcdC8vIHVudGlsIGEgcmVhbCBzaGVsbCB0YWtlcyBvdmVyIChtZWFuaW5nIHRoZSBhZ2VudCBleGl0ZWQpLlxuXHRcdGlmICh0aGlzLl9hZ2VudFNoZWxsVHlwZUZyb21TZXF1ZW5jZSkge1xuXHRcdFx0aWYgKHNoZWxsVHlwZSA9PT0gR2VuZXJhbFNoZWxsVHlwZS5Ob2RlIHx8IHNoZWxsVHlwZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FnZW50U2hlbGxUeXBlRnJvbVNlcXVlbmNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLnNldFNoZWxsVHlwZShzaGVsbFR5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdHJ1c3QoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLkFsbG93SW5VbnRydXN0ZWRXb3Jrc3BhY2UpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFdvcmtzcGFjZSB0cnVzdCBjaGVjayBieXBhc3NlZCBkdWUgdG8gJHtUZXJtaW5hbFNldHRpbmdJZC5BbGxvd0luVW50cnVzdGVkV29ya3NwYWNlfWApO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHRydXN0UmVxdWVzdCA9IGF3YWl0IHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UucmVxdWVzdFdvcmtzcGFjZVRydXN0KHtcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndGVybWluYWwucmVxdWVzdFRydXN0JywgXCJDcmVhdGluZyBhIHRlcm1pbmFsIHByb2Nlc3MgcmVxdWlyZXMgZXhlY3V0aW5nIGNvZGVcIilcblx0XHR9KTtcblx0XHRyZXR1cm4gdHJ1c3RSZXF1ZXN0ID09PSB0cnVlO1xuXHR9XG5cblx0QGRlYm91bmNlKDIwMDApXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVByb2Nlc3NDd2QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCB8fCB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIHJlc2V0IGN3ZCBpZiBpdCBoYXMgY2hhbmdlZCwgc28gZmlsZSBiYXNlZCB1cmwgcGF0aHMgY2FuIGJlIHJlc29sdmVkXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGN3ZCA9IGF3YWl0IHRoaXMuX3JlZnJlc2hQcm9wZXJ0eShQcm9jZXNzUHJvcGVydHlUeXBlLkN3ZCk7XG5cdFx0XHRpZiAoIWlzU3RyaW5nKGN3ZCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBjd2QgaXMgbm90IGEgc3RyaW5nICR7Y3dkfWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGU6IHVua25vd24pIHtcblx0XHRcdC8vIFN3YWxsb3cgdGhpcyBhcyBpdCBtZWFucyB0aGUgcHJvY2VzcyBoYXMgYmVlbiBraWxsZWRcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IgJiYgZS5tZXNzYWdlID09PSAnQ2Fubm90IHJlZnJlc2ggcHJvcGVydHkgd2hlbiBwcm9jZXNzIGlzIG5vdCBzZXQnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlQ29uZmlnKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZnJlc2hFbnZpcm9ubWVudFZhcmlhYmxlSW5mb1dpZGdldFN0YXRlKHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmVudmlyb25tZW50VmFyaWFibGVJbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVVuaWNvZGVWZXJzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnNldFVuaWNvZGVWZXJzaW9uKHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnVuaWNvZGVWZXJzaW9uKTtcblx0fVxuXG5cdHVwZGF0ZUFjY2Vzc2liaWxpdHlTdXBwb3J0KCk6IHZvaWQge1xuXHRcdHRoaXMueHRlcm0hLnJhdy5vcHRpb25zLnNjcmVlblJlYWRlck1vZGUgPSB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogZG9tLkRpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zID0gZGltZW5zaW9uO1xuXHRcdGlmICh0aGlzLmRpc2FibGVMYXlvdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBsYXlvdXQgaWYgZGltZW5zaW9ucyBhcmUgaW52YWxpZCAoZWcuIHRoZSBjb250YWluZXIgaXMgbm90IGF0dGFjaGVkIHRvIHRoZSBET00gb3Jcblx0XHQvLyBpZiBkaXNwbGF5OiBub25lXG5cdFx0aWYgKGRpbWVuc2lvbi53aWR0aCA8PSAwIHx8IGRpbWVuc2lvbi5oZWlnaHQgPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEV2YWx1YXRlIGNvbHVtbnMgYW5kIHJvd3MsIGV4Y2x1ZGUgdGhlIHdyYXBwZXIgZWxlbWVudCdzIG1hcmdpblxuXHRcdGNvbnN0IHRlcm1pbmFsV2lkdGggPSB0aGlzLl9ldmFsdWF0ZUNvbHNBbmRSb3dzKGRpbWVuc2lvbi53aWR0aCwgZGltZW5zaW9uLmhlaWdodCk7XG5cdFx0aWYgKCF0ZXJtaW5hbFdpZHRoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVzaXplKCk7XG5cblx0XHQvLyBTaWduYWwgdGhlIGNvbnRhaW5lciBpcyByZWFkeVxuXHRcdGlmICghdGhpcy5fY29udGFpbmVyUmVhZHlCYXJyaWVyLmlzT3BlbigpKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXJSZWFkeUJhcnJpZXIub3BlbigpO1xuXHRcdH1cblxuXHRcdC8vIExheW91dCBhbGwgY29udHJpYnV0aW9uc1xuXHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIHRoaXMuX2NvbnRyaWJ1dGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmICghdGhpcy54dGVybSkge1xuXHRcdFx0XHR0aGlzLl94dGVybVJlYWR5UHJvbWlzZS50aGVuKHh0ZXJtID0+IHtcblx0XHRcdFx0XHRpZiAoeHRlcm0pIHtcblx0XHRcdFx0XHRcdGNvbnRyaWJ1dGlvbi5sYXlvdXQ/Lih4dGVybSwgZGltZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udHJpYnV0aW9uLmxheW91dD8uKHRoaXMueHRlcm0sIGRpbWVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzaXplKGltbWVkaWF0ZT86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMueHRlcm0gfHwgIXRoaXMuX3Jlc2l6ZURlYm91bmNlciB8fCB0aGlzLmlzRGlzcG9zZWQgfHwgdGhpcy5faXNEaXNwb3NpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgY29scyA9IHRoaXMuY29scztcblx0XHRsZXQgcm93cyA9IHRoaXMucm93cztcblxuXHRcdC8vIE9ubHkgYXBwbHkgdGhlc2Ugc2V0dGluZ3Mgd2hlbiB0aGUgdGVybWluYWwgaXMgdmlzaWJsZSBzbyB0aGF0XG5cdFx0Ly8gdGhlIGNoYXJhY3RlcnMgYXJlIG1lYXN1cmVkIGNvcnJlY3RseS5cblx0XHRpZiAodGhpcy5faXNWaXNpYmxlICYmIHRoaXMuX2xheW91dFNldHRpbmdzQ2hhbmdlZCkge1xuXHRcdFx0Y29uc3QgZm9udCA9IHRoaXMueHRlcm0uZ2V0Rm9udCgpO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWc7XG5cdFx0XHR0aGlzLnh0ZXJtLnJhdy5vcHRpb25zLmxldHRlclNwYWNpbmcgPSBmb250LmxldHRlclNwYWNpbmc7XG5cdFx0XHR0aGlzLnh0ZXJtLnJhdy5vcHRpb25zLmxpbmVIZWlnaHQgPSBmb250LmxpbmVIZWlnaHQ7XG5cdFx0XHR0aGlzLnh0ZXJtLnJhdy5vcHRpb25zLmZvbnRTaXplID0gZm9udC5mb250U2l6ZTtcblx0XHRcdHRoaXMueHRlcm0ucmF3Lm9wdGlvbnMuZm9udEZhbWlseSA9IGZvbnQuZm9udEZhbWlseTtcblx0XHRcdHRoaXMueHRlcm0ucmF3Lm9wdGlvbnMuZm9udFdlaWdodCA9IGNvbmZpZy5mb250V2VpZ2h0O1xuXHRcdFx0dGhpcy54dGVybS5yYXcub3B0aW9ucy5mb250V2VpZ2h0Qm9sZCA9IGNvbmZpZy5mb250V2VpZ2h0Qm9sZDtcblxuXHRcdFx0Ly8gQW55IG9mIHRoZSBhYm92ZSBzZXR0aW5nIGNoYW5nZXMgY291bGQgaGF2ZSBjaGFuZ2VkIHRoZSBkaW1lbnNpb25zIG9mIHRoZVxuXHRcdFx0Ly8gdGVybWluYWwsIHJlLWV2YWx1YXRlIG5vdy5cblx0XHRcdHRoaXMuX2luaXREaW1lbnNpb25zKCk7XG5cdFx0XHRjb2xzID0gdGhpcy5jb2xzO1xuXHRcdFx0cm93cyA9IHRoaXMucm93cztcblxuXHRcdFx0dGhpcy5fbGF5b3V0U2V0dGluZ3NDaGFuZ2VkID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTmFOKGNvbHMpIHx8IGlzTmFOKHJvd3MpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNvbHMgIT09IHRoaXMueHRlcm0ucmF3LmNvbHMgfHwgcm93cyAhPT0gdGhpcy54dGVybS5yYXcucm93cykge1xuXHRcdFx0aWYgKHRoaXMuX2ZpeGVkUm93cyB8fCB0aGlzLl9maXhlZENvbHMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdXBkYXRlUHJvcGVydHkoUHJvY2Vzc1Byb3BlcnR5VHlwZS5GaXhlZERpbWVuc2lvbnMsIHsgY29sczogdGhpcy5fZml4ZWRDb2xzLCByb3dzOiB0aGlzLl9maXhlZFJvd3MgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpbWVuc2lvbnNDaGFuZ2VkLmZpcmUoKTtcblx0XHR9XG5cblx0XHRUZXJtaW5hbEluc3RhbmNlLl9sYXN0S25vd25HcmlkRGltZW5zaW9ucyA9IHsgY29scywgcm93cyB9O1xuXHRcdHRoaXMuX3Jlc2l6ZURlYm91bmNlcj8ucmVzaXplKGNvbHMsIHJvd3MsIGltbWVkaWF0ZSA/PyBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVQdHlEaW1lbnNpb25zKHJhd1h0ZXJtOiBYVGVybVRlcm1pbmFsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwaXhlbFdpZHRoID0gcmF3WHRlcm0uZGltZW5zaW9ucz8uY3NzLmNhbnZhcy53aWR0aDtcblx0XHRjb25zdCBwaXhlbEhlaWdodCA9IHJhd1h0ZXJtLmRpbWVuc2lvbnM/LmNzcy5jYW52YXMuaGVpZ2h0O1xuXHRcdGNvbnN0IHJvdW5kZWRQaXhlbFdpZHRoID0gcGl4ZWxXaWR0aCA/IE1hdGgucm91bmQocGl4ZWxXaWR0aCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgcm91bmRlZFBpeGVsSGVpZ2h0ID0gcGl4ZWxIZWlnaHQgPyBNYXRoLnJvdW5kKHBpeGVsSGVpZ2h0KSA6IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLl9wcm9jZXNzTWFuYWdlci5zZXREaW1lbnNpb25zKHJhd1h0ZXJtLmNvbHMsIHJhd1h0ZXJtLnJvd3MsIHVuZGVmaW5lZCwgcm91bmRlZFBpeGVsV2lkdGgsIHJvdW5kZWRQaXhlbEhlaWdodCk7XG5cdH1cblxuXHRzZXRTaGVsbFR5cGUoc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9zaGVsbFR5cGUgPT09IHNoZWxsVHlwZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zaGVsbFR5cGUgPSBzaGVsbFR5cGU7XG5cdFx0aWYgKHNoZWxsVHlwZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNoZWxsVHlwZUNvbnRleHRLZXkucmVzZXQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdGVybWluYWxTaGVsbFR5cGVDb250ZXh0S2V5LnNldChzaGVsbFR5cGU/LnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNoZWxsVHlwZS5maXJlKHNoZWxsVHlwZSk7XG5cdFx0dGhpcy5fbGFiZWxDb21wdXRlcj8ucmVmcmVzaExhYmVsKHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0QXJpYUxhYmVsKHh0ZXJtOiBYVGVybVRlcm1pbmFsIHwgdW5kZWZpbmVkLCB0ZXJtaW5hbElkOiBudW1iZXIsIHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBsYWJlbFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmICh4dGVybSAmJiB4dGVybS50ZXh0YXJlYSkge1xuXHRcdFx0aWYgKHRpdGxlICYmIHRpdGxlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bGFiZWxQYXJ0cy5wdXNoKG5scy5sb2NhbGl6ZSgndGVybWluYWxUZXh0Qm94QXJpYUxhYmVsTnVtYmVyQW5kVGl0bGUnLCBcIlRlcm1pbmFsIHswfSwgezF9XCIsIHRlcm1pbmFsSWQsIHRpdGxlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbFBhcnRzLnB1c2gobmxzLmxvY2FsaXplKCd0ZXJtaW5hbFRleHRCb3hBcmlhTGFiZWwnLCBcIlRlcm1pbmFsIHswfVwiLCB0ZXJtaW5hbElkKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzY3JlZW5SZWFkZXJPcHRpbWl6ZWQgPSB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpO1xuXHRcdFx0aWYgKCFzY3JlZW5SZWFkZXJPcHRpbWl6ZWQpIHtcblx0XHRcdFx0bGFiZWxQYXJ0cy5wdXNoKG5scy5sb2NhbGl6ZSgndGVybWluYWxTY3JlZW5SZWFkZXJNb2RlJywgXCJSdW4gdGhlIGNvbW1hbmQ6IFRvZ2dsZSBTY3JlZW4gUmVhZGVyIEFjY2Vzc2liaWxpdHkgTW9kZSBmb3IgYW4gb3B0aW1pemVkIHNjcmVlbiByZWFkZXIgZXhwZXJpZW5jZVwiKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5SGVscEtleWJpbmRpbmcgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuT3BlbkFjY2Vzc2liaWxpdHlIZWxwKT8uZ2V0TGFiZWwoKTtcblx0XHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlRlcm1pbmFsKSAmJiBhY2Nlc3NpYmlsaXR5SGVscEtleWJpbmRpbmcpIHtcblx0XHRcdFx0bGFiZWxQYXJ0cy5wdXNoKG5scy5sb2NhbGl6ZSgndGVybWluYWxIZWxwQXJpYUxhYmVsJywgXCJVc2UgezB9IGZvciB0ZXJtaW5hbCBhY2Nlc3NpYmlsaXR5IGhlbHBcIiwgYWNjZXNzaWJpbGl0eUhlbHBLZXliaW5kaW5nKSk7XG5cdFx0XHR9XG5cdFx0XHR4dGVybS50ZXh0YXJlYS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbFBhcnRzLmpvaW4oJ1xcbicpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUaXRsZVByb3BlcnRpZXModGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZXZlbnRTb3VyY2U6IFRpdGxlRXZlbnRTb3VyY2UpOiBzdHJpbmcge1xuXHRcdGlmICh0aXRsZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJvY2Vzc05hbWU7XG5cdFx0fVxuXHRcdHN3aXRjaCAoZXZlbnRTb3VyY2UpIHtcblx0XHRcdGNhc2UgVGl0bGVFdmVudFNvdXJjZS5Qcm9jZXNzOlxuXHRcdFx0XHRpZiAodGhpcy5fcHJvY2Vzc01hbmFnZXIub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRcdFx0Ly8gRXh0cmFjdCB0aGUgZmlsZSBuYW1lIHdpdGhvdXQgZXh0ZW5zaW9uXG5cdFx0XHRcdFx0dGl0bGUgPSBwYXRoLndpbjMyLnBhcnNlKHRpdGxlKS5uYW1lO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGZpcnN0U3BhY2VJbmRleCA9IHRpdGxlLmluZGV4T2YoJyAnKTtcblx0XHRcdFx0XHRpZiAodGl0bGUuc3RhcnRzV2l0aCgnLycpKSB7XG5cdFx0XHRcdFx0XHR0aXRsZSA9IHBhdGguYmFzZW5hbWUodGl0bGUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZmlyc3RTcGFjZUluZGV4ID4gLTEpIHtcblx0XHRcdFx0XHRcdHRpdGxlID0gdGl0bGUuc3Vic3RyaW5nKDAsIGZpcnN0U3BhY2VJbmRleCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Byb2Nlc3NOYW1lID0gdGl0bGU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBUaXRsZUV2ZW50U291cmNlLkFwaTpcblx0XHRcdFx0Ly8gSWYgdGhlIHRpdGxlIGhhcyBub3QgYmVlbiBzZXQgYnkgdGhlIEFQSSBvciB0aGUgcmVuYW1lIGNvbW1hbmQsIHVucmVnaXN0ZXIgdGhlIGhhbmRsZXIgdGhhdFxuXHRcdFx0XHQvLyBhdXRvbWF0aWNhbGx5IHVwZGF0ZXMgdGhlIHRlcm1pbmFsIG5hbWVcblx0XHRcdFx0dGhpcy5fc3RhdGljVGl0bGUgPSB0aXRsZTtcblx0XHRcdFx0dGhpcy5fbWVzc2FnZVRpdGxlRGlzcG9zYWJsZS52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFRpdGxlRXZlbnRTb3VyY2UuU2VxdWVuY2U6XG5cdFx0XHRcdC8vIE9uIFdpbmRvd3MsIHNvbWUgc2hlbGxzIHdpbGwgZmlyZSB0aGlzIHdpdGggdGhlIGZ1bGwgcGF0aCB3aGljaCB3ZSB3YW50IHRvIHRyaW1cblx0XHRcdFx0Ly8gdG8gc2hvdyBqdXN0IHRoZSBmaWxlIG5hbWUuIFRoaXMgc2hvdWxkIG9ubHkgaGFwcGVuIGlmIHRoZSB0aXRsZSBsb29rcyBsaWtlIGFuXG5cdFx0XHRcdC8vIGFic29sdXRlIFdpbmRvd3MgZmlsZSBwYXRoXG5cdFx0XHRcdHRoaXMuX3NlcXVlbmNlID0gdGl0bGU7XG5cdFx0XHRcdGlmICh0aGlzLl9wcm9jZXNzTWFuYWdlci5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiZcblx0XHRcdFx0XHR0aXRsZS5tYXRjaCgvXlthLXpBLVpdOlxcXFwuK1xcLlthLXpBLVpdezEsM30vKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NlcXVlbmNlID0gcGF0aC53aW4zMi5wYXJzZSh0aXRsZSkubmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0dGhpcy5fdGl0bGVTb3VyY2UgPSBldmVudFNvdXJjZTtcblx0XHRyZXR1cm4gdGl0bGU7XG5cdH1cblxuXHRzZXRPdmVycmlkZURpbWVuc2lvbnMoZGltZW5zaW9uczogSVRlcm1pbmFsRGltZW5zaW9uc092ZXJyaWRlIHwgdW5kZWZpbmVkLCBpbW1lZGlhdGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUgJiYgdGhpcy5fZGltZW5zaW9uc092ZXJyaWRlLmZvcmNlRXhhY3RTaXplICYmICFkaW1lbnNpb25zICYmIHRoaXMuX3Jvd3MgPT09IDAgJiYgdGhpcy5fY29scyA9PT0gMCkge1xuXHRcdFx0Ly8gdGhpcyB0ZXJtaW5hbCBuZXZlciBoYWQgYSByZWFsIHNpemUgPT4ga2VlcCB0aGUgbGFzdCBkaW1lbnNpb25zIG92ZXJyaWRlIGV4YWN0IHNpemVcblx0XHRcdHRoaXMuX2NvbHMgPSB0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUuY29scztcblx0XHRcdHRoaXMuX3Jvd3MgPSB0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUucm93cztcblx0XHR9XG5cdFx0dGhpcy5fZGltZW5zaW9uc092ZXJyaWRlID0gZGltZW5zaW9ucztcblx0XHRpZiAoaW1tZWRpYXRlKSB7XG5cdFx0XHR0aGlzLl9yZXNpemUodHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Jlc2l6ZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldEZpeGVkRGltZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb2xzID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2V0VGVybWluYWxEaW1lbnNpb25zQ29sdW1uJywgXCJTZXQgRml4ZWQgRGltZW5zaW9uczogQ29sdW1uXCIpLFxuXHRcdFx0cGxhY2VIb2xkZXI6ICdFbnRlciBhIG51bWJlciBvZiBjb2x1bW5zIG9yIGxlYXZlIGVtcHR5IGZvciBhdXRvbWF0aWMgd2lkdGgnLFxuXHRcdFx0dmFsaWRhdGVJbnB1dDogYXN5bmMgKHRleHQpID0+IHRleHQubGVuZ3RoID4gMCAmJiAhdGV4dC5tYXRjaCgvXlxcZCskLykgPyB7IGNvbnRlbnQ6ICdFbnRlciBhIG51bWJlciBvciBsZWF2ZSBlbXB0eSBzaXplIGF1dG9tYXRpY2FsbHknLCBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IgfSA6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHRcdGlmIChjb2xzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZml4ZWRDb2xzID0gdGhpcy5fcGFyc2VGaXhlZERpbWVuc2lvbihjb2xzKTtcblx0XHR0aGlzLl9sYWJlbENvbXB1dGVyPy5yZWZyZXNoTGFiZWwodGhpcyk7XG5cdFx0dGhpcy5fdGVybWluYWxIYXNGaXhlZFdpZHRoLnNldCghIXRoaXMuX2ZpeGVkQ29scyk7XG5cdFx0Y29uc3Qgcm93cyA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3NldFRlcm1pbmFsRGltZW5zaW9uc1JvdycsIFwiU2V0IEZpeGVkIERpbWVuc2lvbnM6IFJvd1wiKSxcblx0XHRcdHBsYWNlSG9sZGVyOiAnRW50ZXIgYSBudW1iZXIgb2Ygcm93cyBvciBsZWF2ZSBlbXB0eSBmb3IgYXV0b21hdGljIGhlaWdodCcsXG5cdFx0XHR2YWxpZGF0ZUlucHV0OiBhc3luYyAodGV4dCkgPT4gdGV4dC5sZW5ndGggPiAwICYmICF0ZXh0Lm1hdGNoKC9eXFxkKyQvKSA/IHsgY29udGVudDogJ0VudGVyIGEgbnVtYmVyIG9yIGxlYXZlIGVtcHR5IHNpemUgYXV0b21hdGljYWxseScsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9IDogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdFx0aWYgKHJvd3MgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9maXhlZFJvd3MgPSB0aGlzLl9wYXJzZUZpeGVkRGltZW5zaW9uKHJvd3MpO1xuXHRcdHRoaXMuX2xhYmVsQ29tcHV0ZXI/LnJlZnJlc2hMYWJlbCh0aGlzKTtcblx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoU2Nyb2xsYmFyKCk7XG5cdFx0dGhpcy5fcmVzaXplKCk7XG5cdFx0dGhpcy5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VGaXhlZERpbWVuc2lvbih2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUludCh2YWx1ZSk7XG5cdFx0aWYgKHBhcnNlZCA8PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBwYXJzZSBkaW1lbnNpb24gXCIke3ZhbHVlfVwiYCk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZWQ7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVTaXplVG9Db250ZW50V2lkdGgoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnh0ZXJtPy5yYXcuYnVmZmVyLmFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faGFzU2Nyb2xsQmFyKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEhhc0ZpeGVkV2lkdGguc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMuX2ZpeGVkQ29scyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2ZpeGVkUm93cyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2hhc1Njcm9sbEJhciA9IGZhbHNlO1xuXHRcdFx0dGhpcy5faW5pdERpbWVuc2lvbnMoKTtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc2l6ZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBmb250ID0gdGhpcy54dGVybSA/IHRoaXMueHRlcm0uZ2V0Rm9udCgpIDogdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGRvbS5nZXRXaW5kb3codGhpcy5kb21FbGVtZW50KSk7XG5cdFx0XHRjb25zdCBtYXhDb2xzRm9yVGV4dHVyZSA9IE1hdGguZmxvb3IoQ29uc3RhbnRzLk1heENhbnZhc1dpZHRoIC8gKGZvbnQuY2hhcldpZHRoID8/IDIwKSk7XG5cdFx0XHQvLyBGaXhlZCBjb2x1bW5zIHNob3VsZCBiZSBhdCBsZWFzdCB4dGVybS5qcycgcmVndWxhciBjb2x1bW4gY291bnRcblx0XHRcdGNvbnN0IHByb3Bvc2VkQ29scyA9IE1hdGgubWF4KHRoaXMubWF4Q29scywgTWF0aC5taW4odGhpcy54dGVybS5nZXRMb25nZXN0Vmlld3BvcnRXcmFwcGVkTGluZUxlbmd0aCgpLCBtYXhDb2xzRm9yVGV4dHVyZSkpO1xuXHRcdFx0Ly8gRG9uJ3Qgc3dpdGNoIHRvIGZpeGVkIGRpbWVuc2lvbnMgaWYgdGhlIGNvbnRlbnQgYWxyZWFkeSBmaXRzIGFzIGl0IG1ha2VzIHRoZSBzY3JvbGxcblx0XHRcdC8vIGJhciBsb29rIGJhZCBiZWluZyBvZmYgdGhlIGVkZ2Vcblx0XHRcdGlmIChwcm9wb3NlZENvbHMgPiB0aGlzLnh0ZXJtLnJhdy5jb2xzKSB7XG5cdFx0XHRcdHRoaXMuX2ZpeGVkQ29scyA9IHByb3Bvc2VkQ29scztcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcmVmcmVzaFNjcm9sbGJhcigpO1xuXHRcdHRoaXMuX2xhYmVsQ29tcHV0ZXI/LnJlZnJlc2hMYWJlbCh0aGlzKTtcblx0XHR0aGlzLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoU2Nyb2xsYmFyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9maXhlZENvbHMgfHwgdGhpcy5fZml4ZWRSb3dzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWRkU2Nyb2xsYmFyKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW1vdmVTY3JvbGxiYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FkZFNjcm9sbGJhcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGFyV2lkdGggPSAodGhpcy54dGVybSA/IHRoaXMueHRlcm0uZ2V0Rm9udCgpIDogdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGRvbS5nZXRXaW5kb3codGhpcy5kb21FbGVtZW50KSkpLmNoYXJXaWR0aDtcblx0XHRpZiAoIXRoaXMueHRlcm0/LnJhdy5lbGVtZW50IHx8ICF0aGlzLl9jb250YWluZXIgfHwgIWNoYXJXaWR0aCB8fCAhdGhpcy5fZml4ZWRDb2xzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZpeGVkLWRpbXMnKTtcblx0XHR0aGlzLl9oYXNTY3JvbGxCYXIgPSB0cnVlO1xuXHRcdHRoaXMuX2luaXREaW1lbnNpb25zKCk7XG5cdFx0YXdhaXQgdGhpcy5fcmVzaXplKCk7XG5cdFx0dGhpcy5fdGVybWluYWxIYXNGaXhlZFdpZHRoLnNldCh0cnVlKTtcblx0XHRpZiAoIXRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIpIHtcblx0XHRcdHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5fd3JhcHBlckVsZW1lbnQsIHtcblx0XHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHRcdFx0XHRzY3JvbGxZVG9YOiBmYWxzZSxcblx0XHRcdFx0Y29uc3VtZU1vdXNlV2hlZWxJZlNjcm9sbGJhcklzTmVlZGVkOiBmYWxzZVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIuZ2V0RG9tTm9kZSgpKTtcblx0XHR9XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5zZXRTY3JvbGxEaW1lbnNpb25zKHtcblx0XHRcdHdpZHRoOiB0aGlzLnh0ZXJtLnJhdy5lbGVtZW50LmNsaWVudFdpZHRoLFxuXHRcdFx0c2Nyb2xsV2lkdGg6IHRoaXMuX2ZpeGVkQ29scyAqIGNoYXJXaWR0aCArIDQwIC8vIFBhZGRpbmcgKyBzY3JvbGwgYmFyXG5cdFx0fSk7XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5nZXREb21Ob2RlKCkuc3R5bGUucGFkZGluZ0JvdHRvbSA9ICcxNnB4JztcblxuXHRcdC8vIHdvcmsgYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20veHRlcm1qcy94dGVybS5qcy9pc3N1ZXMvMzQ4MlxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGZvciAobGV0IGkgPSB0aGlzLnh0ZXJtLnJhdy5idWZmZXIuYWN0aXZlLnZpZXdwb3J0WTsgaSA8IHRoaXMueHRlcm0ucmF3LmJ1ZmZlci5hY3RpdmUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aW50ZXJmYWNlIElMaW5lV2l0aEludGVybmFscyBleHRlbmRzIElCdWZmZXJMaW5lIHtcblx0XHRcdFx0XHRfbGluZToge1xuXHRcdFx0XHRcdFx0aXNXcmFwcGVkOiBib29sZWFuO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbGluZSA9IHRoaXMueHRlcm0ucmF3LmJ1ZmZlci5hY3RpdmUuZ2V0TGluZShpKTtcblx0XHRcdFx0KGxpbmUgYXMgSUxpbmVXaXRoSW50ZXJuYWxzKS5fbGluZS5pc1dyYXBwZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZW1vdmVTY3JvbGxiYXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIgfHwgIXRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5nZXREb21Ob2RlKCkucmVtb3ZlKCk7XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl93cmFwcGVyRWxlbWVudC5yZW1vdmUoKTtcblx0XHR0aGlzLl93cmFwcGVyRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdmaXhlZC1kaW1zJyk7XG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3dyYXBwZXJFbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFJlc29sdmVkU2hlbGxMYXVuY2hDb25maWcoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyk6IHZvaWQge1xuXHRcdHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmFyZ3MgPSBzaGVsbExhdW5jaENvbmZpZy5hcmdzO1xuXHRcdHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmN3ZCA9IHNoZWxsTGF1bmNoQ29uZmlnLmN3ZDtcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlID0gc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZTtcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5lbnYgPSBzaGVsbExhdW5jaENvbmZpZy5lbnY7XG5cdH1cblxuXHRwcml2YXRlIF9vbkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlZChpbmZvOiBJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8pOiB2b2lkIHtcblx0XHRpZiAoaW5mby5yZXF1aXJlc0FjdGlvbikge1xuXHRcdFx0dGhpcy54dGVybT8ucmF3LnRleHRhcmVhPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBubHMubG9jYWxpemUoJ3Rlcm1pbmFsU3RhbGVUZXh0Qm94QXJpYUxhYmVsJywgXCJUZXJtaW5hbCB7MH0gZW52aXJvbm1lbnQgaXMgc3RhbGUsIHJ1biB0aGUgJ1Nob3cgRW52aXJvbm1lbnQgSW5mb3JtYXRpb24nIGNvbW1hbmQgZm9yIG1vcmUgaW5mb3JtYXRpb25cIiwgdGhpcy5faW5zdGFuY2VJZCkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWZyZXNoRW52aXJvbm1lbnRWYXJpYWJsZUluZm9XaWRnZXRTdGF0ZShpbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hFbnZpcm9ubWVudFZhcmlhYmxlSW5mb1dpZGdldFN0YXRlKGluZm8/OiBJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDaGVjayBpZiB0aGUgc3RhdHVzIHNob3VsZCBleGlzdFxuXHRcdGlmICghaW5mbykge1xuXHRcdFx0dGhpcy5zdGF0dXNMaXN0LnJlbW92ZShUZXJtaW5hbFN0YXR1cy5SZWxhdW5jaE5lZWRlZCk7XG5cdFx0XHR0aGlzLnN0YXR1c0xpc3QucmVtb3ZlKFRlcm1pbmFsU3RhdHVzLkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlc0FjdGl2ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVjcmVhdGUgdGhlIHByb2Nlc3Mgc2VhbWxlc3NseSB3aXRob3V0IGluZm9ybWluZyB0aGUgdXNlIGlmIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmVcblx0XHQvLyBtZXQuXG5cdFx0aWYgKFxuXHRcdFx0Ly8gVGhlIGNoYW5nZSByZXF1aXJlcyBhIHJlbGF1bmNoXG5cdFx0XHRpbmZvLnJlcXVpcmVzQWN0aW9uICYmXG5cdFx0XHQvLyBUaGUgZmVhdHVyZSBpcyBlbmFibGVkXG5cdFx0XHR0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbnZpcm9ubWVudENoYW5nZXNSZWxhdW5jaCAmJlxuXHRcdFx0Ly8gSGFzIG5vdCBiZWVuIGludGVyYWN0ZWQgd2l0aFxuXHRcdFx0IXRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmhhc1dyaXR0ZW5EYXRhICYmXG5cdFx0XHQvLyBOb3QgYSBmZWF0dXJlIHRlcm1pbmFsIG9yIGlzIGEgcmVjb25uZWN0aW5nIHRhc2sgdGVybWluYWwgKFRPRE86IE5lZWQgdG8gZXhwbGFpbiB0aGUgbGF0dGVyIGNhc2UpXG5cdFx0XHQoIXRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsIHx8ICh0aGlzLnJlY29ubmVjdGlvblByb3BlcnRpZXMgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3Rhc2sucmVjb25uZWN0aW9uJykgPT09IHRydWUpKSAmJlxuXHRcdFx0Ly8gTm90IGEgY3VzdG9tIHB0eVxuXHRcdFx0IXRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uICYmXG5cdFx0XHQvLyBOb3QgYW4gZXh0ZW5zaW9uIG93bmVkIHRlcm1pbmFsXG5cdFx0XHQhdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaXNFeHRlbnNpb25Pd25lZFRlcm1pbmFsICYmXG5cdFx0XHQvLyBOb3QgYSByZWNvbm5lY3RlZCBvciByZXZpdmVkIHRlcm1pbmFsXG5cdFx0XHQhdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MgJiZcblx0XHRcdC8vIE5vdCBhIFdpbmRvd3MgcmVtb3RlIHVzaW5nIENvblBUWSB3aGljaCBjYW5ub3QgcmVsYXVuY2ggKCMxODcwODQpLiBDb25QVFkgaXMgdXNlZCBvblxuXHRcdFx0Ly8gV2luZG93cyBidWlsZHMgMTgzMDkrLlxuXHRcdFx0ISh0aGlzLl9wcm9jZXNzTWFuYWdlci5yZW1vdGVBdXRob3JpdHkgJiYgKGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmdldEJhY2tlbmRPUygpKSA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiYgdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1RyYWl0cz8ud2luZG93c1B0eT8uYnVpbGROdW1iZXIgJiYgdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1RyYWl0cy53aW5kb3dzUHR5LmJ1aWxkTnVtYmVyID49IDE4MzA5KVxuXHRcdCkge1xuXHRcdFx0dGhpcy5yZWxhdW5jaCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBSZS1jcmVhdGUgc3RhdHVzZXNcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSBnZXRXb3Jrc3BhY2VGb3JUZXJtaW5hbCh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmN3ZCwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHRoaXMuX2hpc3RvcnlTZXJ2aWNlKTtcblx0XHR0aGlzLnN0YXR1c0xpc3QuYWRkKGluZm8uZ2V0U3RhdHVzKHsgd29ya3NwYWNlRm9sZGVyIH0pKTtcblx0fVxuXG5cdGFzeW5jIGdldEluaXRpYWxDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoIXRoaXMuX2luaXRpYWxDd2QpIHtcblx0XHRcdHRoaXMuX2luaXRpYWxDd2QgPSB0aGlzLl9wcm9jZXNzTWFuYWdlci5pbml0aWFsQ3dkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faW5pdGlhbEN3ZDtcblx0fVxuXG5cdGFzeW5jIGdldFNwZWN1bGF0aXZlQ3dkKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKSEuZ2V0Q3dkKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5Lk5haXZlQ3dkRGV0ZWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuTmFpdmVDd2REZXRlY3Rpb24pIS5nZXRDd2QoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmluaXRpYWxDd2Q7XG5cdH1cblxuXHRhc3luYyBnZXRDd2RSZXNvdXJjZSgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGN3ZCA9IHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKT8uZ2V0Q3dkKCk7XG5cdFx0aWYgKCFjd2QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCByZXNvdXJjZTogVVJJO1xuXHRcdGlmICh0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmVzb3VyY2UgPSBhd2FpdCB0aGlzLl9wYXRoU2VydmljZS5maWxlVVJJKGN3ZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc291cmNlID0gVVJJLmZpbGUoY3dkKTtcblx0XHR9XG5cdFx0Ly8gSW4gVlMgQ29kZSB3ZWIgKHNlcnZlci1saW51eC14NjQtd2ViIGFjY2Vzc2VkIHZpYSBicm93c2VyKSwgcmVtb3RlQXV0aG9yaXR5XG5cdFx0Ly8gaXMgZmFsc3kgZnJvbSB0aGUgdGVybWluYWwncyBwZXJzcGVjdGl2ZSwgc28gVVJJLmZpbGUoKSBpcyB1c2VkIGFib3ZlLlxuXHRcdC8vIFRoZSBicm93c2VyIEZpbGVTZXJ2aWNlIGhhcyBubyBmaWxlOi8vIHByb3ZpZGVyIHJlZ2lzdGVyZWQgKG9ubHkgdGhlIHJlbW90ZVxuXHRcdC8vIHByb3ZpZGVyKSwgc28gZ3VhcmQgd2l0aCBjYW5IYW5kbGVSZXNvdXJjZSBiZWZvcmUgY2FsbGluZyBleGlzdHMoKSB0byBhdm9pZFxuXHRcdC8vIGFuIEVOT1BSTyBlcnJvciBwcm9wYWdhdGluZyB0byBjYWxsZXJzLlxuXHRcdGlmICghYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaFByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPih0eXBlOiBUKTogUHJvbWlzZTxJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdPiB7XG5cdFx0YXdhaXQgdGhpcy5wcm9jZXNzUmVhZHk7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnJlZnJlc2hQcm9wZXJ0eSh0eXBlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPih0eXBlOiBULCB2YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm9jZXNzTWFuYWdlci51cGRhdGVQcm9wZXJ0eSh0eXBlLCB2YWx1ZSk7XG5cdH1cblxuXHRhc3luYyByZW5hbWUodGl0bGU/OiBzdHJpbmcsIHNvdXJjZT86IFRpdGxlRXZlbnRTb3VyY2UpIHtcblx0XHRpZiAodGl0bGUgIT09IHVuZGVmaW5lZCAmJiAhdGl0bGUpIHtcblx0XHRcdHRpdGxlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9zZXRUaXRsZSh0aXRsZSwgc291cmNlID8/IFRpdGxlRXZlbnRTb3VyY2UuQXBpKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFRpdGxlKHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGV2ZW50U291cmNlOiBUaXRsZUV2ZW50U291cmNlKTogdm9pZCB7XG5cdFx0aWYgKCh0aGlzLl9zaGVsbExhdW5jaENvbmZpZz8udHlwZSA9PT0gJ1Rhc2snIHx8IHRoaXMuX3RpdGxlU291cmNlID09PSBUaXRsZUV2ZW50U291cmNlLkFwaSkgJiYgZXZlbnRTb3VyY2UgPT09IFRpdGxlRXZlbnRTb3VyY2UuUHJvY2Vzcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc2V0ID0gIXRpdGxlO1xuXHRcdHRpdGxlID0gdGhpcy5fdXBkYXRlVGl0bGVQcm9wZXJ0aWVzKHRpdGxlLCBldmVudFNvdXJjZSk7XG5cdFx0Y29uc3QgdGl0bGVDaGFuZ2VkID0gdGl0bGUgIT09IHRoaXMuX3RpdGxlO1xuXHRcdHRoaXMuX3RpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5fbGFiZWxDb21wdXRlcj8ucmVmcmVzaExhYmVsKHRoaXMsIHJlc2V0KTtcblx0XHR0aGlzLl9zZXRBcmlhTGFiZWwodGhpcy54dGVybT8ucmF3LCB0aGlzLl9pbnN0YW5jZUlkLCB0aGlzLl90aXRsZSk7XG5cblx0XHRpZiAodGl0bGVDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9vblRpdGxlQ2hhbmdlZC5maXJlKHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNoYW5nZUljb24oaWNvbj86IFRlcm1pbmFsSWNvbik6IFByb21pc2U8VGVybWluYWxJY29uIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGljb24pIHtcblx0XHRcdHRoaXMuX2ljb24gPSBpY29uO1xuXHRcdFx0dGhpcy5fb25JY29uQ2hhbmdlZC5maXJlKHsgaW5zdGFuY2U6IHRoaXMsIHVzZXJJbml0aWF0ZWQ6IHRydWUgfSk7XG5cdFx0XHRyZXR1cm4gaWNvbjtcblx0XHR9XG5cdFx0Y29uc3QgaWNvblBpY2tlciA9IHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsSWNvblBpY2tlcik7XG5cdFx0Y29uc3QgcGlja2VkSWNvbiA9IGF3YWl0IGljb25QaWNrZXIucGlja0ljb25zKCk7XG5cdFx0aWNvblBpY2tlci5kaXNwb3NlKCk7XG5cdFx0aWYgKCFwaWNrZWRJY29uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9pY29uID0gcGlja2VkSWNvbjtcblx0XHR0aGlzLl9vbkljb25DaGFuZ2VkLmZpcmUoeyBpbnN0YW5jZTogdGhpcywgdXNlckluaXRpYXRlZDogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gcGlja2VkSWNvbjtcblx0fVxuXG5cdGFzeW5jIGNoYW5nZUNvbG9yKGNvbG9yPzogc3RyaW5nLCBza2lwUXVpY2tQaWNrPzogYm9vbGVhbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHR0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmNvbG9yID0gY29sb3I7XG5cdFx0XHR0aGlzLl9vbkljb25DaGFuZ2VkLmZpcmUoeyBpbnN0YW5jZTogdGhpcywgdXNlckluaXRpYXRlZDogdHJ1ZSB9KTtcblx0XHRcdHJldHVybiBjb2xvcjtcblx0XHR9IGVsc2UgaWYgKHNraXBRdWlja1BpY2spIHtcblx0XHRcdC8vIFJlc2V0IHRoaXMgdGFiJ3MgY29sb3Jcblx0XHRcdHRoaXMuc2hlbGxMYXVuY2hDb25maWcuY29sb3IgPSAnJztcblx0XHRcdHRoaXMuX29uSWNvbkNoYW5nZWQuZmlyZSh7IGluc3RhbmNlOiB0aGlzLCB1c2VySW5pdGlhdGVkOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpY29uID0gdGhpcy5fZ2V0SWNvbigpO1xuXHRcdGlmICghaWNvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb2xvclRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBzdGFuZGFyZENvbG9yczogc3RyaW5nW10gPSBnZXRTdGFuZGFyZENvbG9ycyhjb2xvclRoZW1lKTtcblx0XHRjb25zdCBjb2xvclN0eWxlRGlzcG9zYWJsZSA9IGNyZWF0ZUNvbG9yU3R5bGVFbGVtZW50KGNvbG9yVGhlbWUpO1xuXHRcdGNvbnN0IGl0ZW1zOiBRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvbG9yS2V5IG9mIHN0YW5kYXJkQ29sb3JzKSB7XG5cdFx0XHRjb25zdCBjb2xvckNsYXNzID0gZ2V0Q29sb3JDbGFzcyhjb2xvcktleSk7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGAkKCR7Q29kaWNvbi5jaXJjbGVGaWxsZWQuaWR9KSAke2NvbG9yS2V5LnJlcGxhY2UoJ3Rlcm1pbmFsLmFuc2knLCAnJyl9YCwgaWQ6IGNvbG9yS2V5LCBkZXNjcmlwdGlvbjogY29sb3JLZXksIGljb25DbGFzc2VzOiBbY29sb3JDbGFzc11cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0Y29uc3Qgc2hvd0FsbENvbG9yc0l0ZW0gPSB7IGxhYmVsOiAnUmVzZXQgdG8gZGVmYXVsdCcgfTtcblx0XHRpdGVtcy5wdXNoKHNob3dBbGxDb2xvcnNJdGVtKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKHF1aWNrUGljayk7XG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0cXVpY2tQaWNrLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbmxzLmxvY2FsaXplKCdjaGFuZ2VDb2xvcicsICdTZWxlY3QgYSBjb2xvciBmb3IgdGhlIHRlcm1pbmFsJyk7XG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTxJUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZD4ociA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5wdXNoKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gcih1bmRlZmluZWQpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5wdXNoKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiByKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdKSkpO1xuXHRcdH0pO1xuXHRcdGRpc3Bvc2UoZGlzcG9zYWJsZXMpO1xuXG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0dGhpcy5zaGVsbExhdW5jaENvbmZpZy5jb2xvciA9IHJlc3VsdC5pZDtcblx0XHRcdHRoaXMuX29uSWNvbkNoYW5nZWQuZmlyZSh7IGluc3RhbmNlOiB0aGlzLCB1c2VySW5pdGlhdGVkOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0Y29sb3JTdHlsZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHJldHVybiByZXN1bHQ/LmlkO1xuXHR9XG5cblx0Zm9yY2VTY3JvbGxiYXJWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZvcmNlLXNjcm9sbGJhcicpO1xuXHR9XG5cblx0cmVzZXRTY3JvbGxiYXJWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZvcmNlLXNjcm9sbGJhcicpO1xuXHR9XG5cblx0c2V0UGFyZW50Q29udGV4dEtleVNlcnZpY2UocGFyZW50Q29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlLnVwZGF0ZVBhcmVudChwYXJlbnRDb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVNb3VzZUV2ZW50KGV2ZW50OiBNb3VzZUV2ZW50LCBjb250ZXh0TWVudTogSU1lbnUpOiBQcm9taXNlPHsgY2FuY2VsQ29udGV4dE1lbnU6IGJvb2xlYW4gfSB8IHZvaWQ+IHtcblx0XHQvLyBEb24ndCBoYW5kbGUgbW91c2UgZXZlbnQgaWYgaXQgd2FzIG9uIHRoZSBzY3JvbGwgYmFyXG5cdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KGV2ZW50LnRhcmdldCkgJiYgKGV2ZW50LnRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3Njcm9sbGJhcicpIHx8IGV2ZW50LnRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3NsaWRlcicpKSkge1xuXHRcdFx0cmV0dXJuIHsgY2FuY2VsQ29udGV4dE1lbnU6IHRydWUgfTtcblx0XHR9XG5cblx0XHQvLyBBbGxvdyBjb250cmlidXRpb25zIHRvIGhhbmRsZSB0aGUgbW91c2UgZXZlbnQgZmlyc3Rcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgdGhpcy5fY29udHJpYnV0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udHJpYi5oYW5kbGVNb3VzZUV2ZW50Py4oZXZlbnQpO1xuXHRcdFx0aWYgKHJlc3VsdD8uaGFuZGxlZCkge1xuXHRcdFx0XHRyZXR1cm4geyBjYW5jZWxDb250ZXh0TWVudTogdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1pZGRsZSBjbGlja1xuXHRcdGlmIChldmVudC53aGljaCA9PT0gMikge1xuXHRcdFx0c3dpdGNoICh0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5taWRkbGVDbGlja0JlaGF2aW9yKSB7XG5cdFx0XHRcdGNhc2UgJ2RlZmF1bHQnOlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdC8vIERyb3Agc2VsZWN0aW9uIGFuZCBmb2N1cyB0ZXJtaW5hbCBvbiBMaW51eCB0byBlbmFibGUgbWlkZGxlIGJ1dHRvbiBwYXN0ZVxuXHRcdFx0XHRcdC8vIHdoZW4gY2xpY2sgb2NjdXJzIG9uIHRoZSBzZWxlY3Rpb24gaXRzZWxmLlxuXHRcdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSaWdodCBjbGlja1xuXHRcdGlmIChldmVudC53aGljaCA9PT0gMykge1xuXHRcdFx0Ly8gU2hpZnQgY2xpY2sgZm9yY2VzIHRoZSBjb250ZXh0IG1lbnVcblx0XHRcdGlmIChldmVudC5zaGlmdEtleSkge1xuXHRcdFx0XHRvcGVuQ29udGV4dE1lbnUoZG9tLmdldEFjdGl2ZVdpbmRvdygpLCBldmVudCwgdGhpcywgY29udGV4dE1lbnUsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmlnaHRDbGlja0JlaGF2aW9yID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcucmlnaHRDbGlja0JlaGF2aW9yO1xuXHRcdFx0aWYgKHJpZ2h0Q2xpY2tCZWhhdmlvciA9PT0gJ25vdGhpbmcnKSB7XG5cdFx0XHRcdGlmICghZXZlbnQuc2hpZnRLZXkpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBjYW5jZWxDb250ZXh0TWVudTogdHJ1ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVGVybWluYWxJbnN0YW5jZURyYWdBbmREcm9wQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBkb20uSURyYWdBbmREcm9wT2JzZXJ2ZXJDYWxsYmFja3Mge1xuXHRwcml2YXRlIF9kcm9wT3ZlcmxheT86IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRHJvcEZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmcgfCBVUkk+KCkpO1xuXHRnZXQgb25Ecm9wRmlsZSgpOiBFdmVudDxzdHJpbmcgfCBVUkk+IHsgcmV0dXJuIHRoaXMuX29uRHJvcEZpbGUuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25Ecm9wVGVybWluYWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVxdWVzdEFkZEluc3RhbmNlVG9Hcm91cEV2ZW50PigpKTtcblx0Z2V0IG9uRHJvcFRlcm1pbmFsKCk6IEV2ZW50PElSZXF1ZXN0QWRkSW5zdGFuY2VUb0dyb3VwRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uRHJvcFRlcm1pbmFsLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9jbGVhckRyb3BPdmVybGF5KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyRHJvcE92ZXJsYXkoKSB7XG5cdFx0dGhpcy5fZHJvcE92ZXJsYXk/LnJlbW92ZSgpO1xuXHRcdHRoaXMuX2Ryb3BPdmVybGF5ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0b25EcmFnRW50ZXIoZTogRHJhZ0V2ZW50KSB7XG5cdFx0aWYgKCFjb250YWluc0RyYWdUeXBlKGUsIERhdGFUcmFuc2ZlcnMuRklMRVMsIERhdGFUcmFuc2ZlcnMuUkVTT1VSQ0VTLCBUZXJtaW5hbERhdGFUcmFuc2ZlcnMuVGVybWluYWxzLCBDb2RlRGF0YVRyYW5zZmVycy5GSUxFUykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2Ryb3BPdmVybGF5KSB7XG5cdFx0XHR0aGlzLl9kcm9wT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5fZHJvcE92ZXJsYXkuY2xhc3NMaXN0LmFkZCgndGVybWluYWwtZHJvcC1vdmVybGF5Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhZ2dpbmcgdGVybWluYWxzXG5cdFx0aWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgVGVybWluYWxEYXRhVHJhbnNmZXJzLlRlcm1pbmFscykpIHtcblx0XHRcdGNvbnN0IHNpZGUgPSB0aGlzLl9nZXREcm9wU2lkZShlKTtcblx0XHRcdHRoaXMuX2Ryb3BPdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoJ2Ryb3AtYmVmb3JlJywgc2lkZSA9PT0gJ2JlZm9yZScpO1xuXHRcdFx0dGhpcy5fZHJvcE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnZHJvcC1hZnRlcicsIHNpZGUgPT09ICdhZnRlcicpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZHJvcE92ZXJsYXkucGFyZW50RWxlbWVudCkge1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2Ryb3BPdmVybGF5KTtcblx0XHR9XG5cdH1cblx0b25EcmFnTGVhdmUoZTogRHJhZ0V2ZW50KSB7XG5cdFx0dGhpcy5fY2xlYXJEcm9wT3ZlcmxheSgpO1xuXHR9XG5cblx0b25EcmFnRW5kKGU6IERyYWdFdmVudCkge1xuXHRcdHRoaXMuX2NsZWFyRHJvcE92ZXJsYXkoKTtcblx0fVxuXG5cdG9uRHJhZ092ZXIoZTogRHJhZ0V2ZW50KSB7XG5cdFx0aWYgKCFlLmRhdGFUcmFuc2ZlciB8fCAhdGhpcy5fZHJvcE92ZXJsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEcmFnZ2luZyB0ZXJtaW5hbHNcblx0XHRpZiAoY29udGFpbnNEcmFnVHlwZShlLCBUZXJtaW5hbERhdGFUcmFuc2ZlcnMuVGVybWluYWxzKSkge1xuXHRcdFx0Y29uc3Qgc2lkZSA9IHRoaXMuX2dldERyb3BTaWRlKGUpO1xuXHRcdFx0dGhpcy5fZHJvcE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnZHJvcC1iZWZvcmUnLCBzaWRlID09PSAnYmVmb3JlJyk7XG5cdFx0XHR0aGlzLl9kcm9wT3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKCdkcm9wLWFmdGVyJywgc2lkZSA9PT0gJ2FmdGVyJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZHJvcE92ZXJsYXkuc3R5bGUub3BhY2l0eSA9ICcxJztcblx0fVxuXG5cdGFzeW5jIG9uRHJvcChlOiBEcmFnRXZlbnQpIHtcblx0XHR0aGlzLl9jbGVhckRyb3BPdmVybGF5KCk7XG5cblx0XHRpZiAoIWUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVybWluYWxSZXNvdXJjZXMgPSBnZXRUZXJtaW5hbFJlc291cmNlc0Zyb21EcmFnRXZlbnQoZSk7XG5cdFx0aWYgKHRlcm1pbmFsUmVzb3VyY2VzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0ZXJtaW5hbFJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCBzaWRlID0gdGhpcy5fZ2V0RHJvcFNpZGUoZSk7XG5cdFx0XHRcdHRoaXMuX29uRHJvcFRlcm1pbmFsLmZpcmUoeyB1cmksIHNpZGUgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgZmlsZXMgd2VyZSBkcmFnZ2VkIGZyb20gdGhlIHRyZWUgZXhwbG9yZXJcblx0XHRsZXQgcGF0aDogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJhd1Jlc291cmNlcyA9IGUuZGF0YVRyYW5zZmVyLmdldERhdGEoRGF0YVRyYW5zZmVycy5SRVNPVVJDRVMpO1xuXHRcdGlmIChyYXdSZXNvdXJjZXMpIHtcblx0XHRcdHBhdGggPSBVUkkucGFyc2UoSlNPTi5wYXJzZShyYXdSZXNvdXJjZXMpWzBdKTtcblx0XHR9XG5cblx0XHRjb25zdCByYXdDb2RlRmlsZXMgPSBlLmRhdGFUcmFuc2Zlci5nZXREYXRhKENvZGVEYXRhVHJhbnNmZXJzLkZJTEVTKTtcblx0XHRpZiAoIXBhdGggJiYgcmF3Q29kZUZpbGVzKSB7XG5cdFx0XHRwYXRoID0gVVJJLmZpbGUoSlNPTi5wYXJzZShyYXdDb2RlRmlsZXMpWzBdKTtcblx0XHR9XG5cblx0XHRpZiAoIXBhdGggJiYgZS5kYXRhVHJhbnNmZXIuZmlsZXMubGVuZ3RoID4gMCAmJiBnZXRQYXRoRm9yRmlsZShlLmRhdGFUcmFuc2Zlci5maWxlc1swXSkpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoZSBmaWxlIHdhcyBkcmFnZ2VkIGZyb20gdGhlIGZpbGVzeXN0ZW1cblx0XHRcdHBhdGggPSBVUkkuZmlsZShnZXRQYXRoRm9yRmlsZShlLmRhdGFUcmFuc2Zlci5maWxlc1swXSkhKTtcblx0XHR9XG5cblx0XHRpZiAoIXBhdGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRyb3BGaWxlLmZpcmUocGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREcm9wU2lkZShlOiBEcmFnRXZlbnQpOiAnYmVmb3JlJyB8ICdhZnRlcicge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2NvbnRhaW5lcjtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuICdhZnRlcic7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVjdCA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Vmlld09yaWVudGF0aW9uKCkgPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUxcblx0XHRcdD8gKGUuY2xpZW50WCAtIHJlY3QubGVmdCA8IHJlY3Qud2lkdGggLyAyID8gJ2JlZm9yZScgOiAnYWZ0ZXInKVxuXHRcdFx0OiAoZS5jbGllbnRZIC0gcmVjdC50b3AgPCByZWN0LmhlaWdodCAvIDIgPyAnYmVmb3JlJyA6ICdhZnRlcicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Vmlld09yaWVudGF0aW9uKCk6IE9yaWVudGF0aW9uIHtcblx0XHRjb25zdCBwYW5lbFBvc2l0aW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgdGVybWluYWxMb2NhdGlvbiA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKFRFUk1JTkFMX1ZJRVdfSUQpO1xuXHRcdHJldHVybiB0ZXJtaW5hbExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgJiYgaXNIb3Jpem9udGFsKHBhbmVsUG9zaXRpb24pXG5cdFx0XHQ/IE9yaWVudGF0aW9uLkhPUklaT05UQUxcblx0XHRcdDogT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUZXJtaW5hbExhYmVsVGVtcGxhdGVQcm9wZXJ0aWVzIHtcblx0Y3dkPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0Y3dkRm9sZGVyPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0d29ya3NwYWNlRm9sZGVyTmFtZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdHdvcmtzcGFjZUZvbGRlcj86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdGxvY2FsPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0cHJvY2Vzcz86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdHNlcXVlbmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0cHJvZ3Jlc3M/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkO1xuXHR0YXNrPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0Zml4ZWREaW1lbnNpb25zPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0c2VwYXJhdG9yPzogc3RyaW5nIHwgSVNlcGFyYXRvciB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdHNoZWxsVHlwZT86IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2hlbGxDb21tYW5kPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzaGVsbFByb21wdElucHV0Pzogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5jb25zdCBlbnVtIFRlcm1pbmFsTGFiZWxUeXBlIHtcblx0VGl0bGUgPSAndGl0bGUnLFxuXHREZXNjcmlwdGlvbiA9ICdkZXNjcmlwdGlvbidcbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsTGFiZWxDb21wdXRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF90aXRsZTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX2Rlc2NyaXB0aW9uOiBzdHJpbmcgPSAnJztcblx0Z2V0IHRpdGxlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl90aXRsZTsgfVxuXHRnZXQgZGVzY3JpcHRpb24oKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX2Rlc2NyaXB0aW9uOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYWJlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgdGl0bGU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYWJlbCA9IHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEFnZW50IENMSXMgd2hvc2UgdGFiIHRpdGxlIHNob3VsZCBjb21lIGZyb20gdGhlaXIgb3duIGVzY2FwZSBzZXF1ZW5jZXMgcmF0aGVyXG5cdCAqIHRoYW4gdGhlIGNvbmZpZ3VyZWQgdGVtcGxhdGUgb3IgYSBzdGF0aWMgcHJvZmlsZSBuYW1lLlxuXHQgKi9cblx0c3RhdGljIHJlYWRvbmx5IGFnZW50Q2xpU2hlbGxUeXBlczogUmVhZG9ubHlTZXQ8R2VuZXJhbFNoZWxsVHlwZT4gPSBuZXcgU2V0KFtcblx0XHRHZW5lcmFsU2hlbGxUeXBlLkNsYXVkZSxcblx0XHRHZW5lcmFsU2hlbGxUeXBlLkNvZGV4LFxuXHRcdEdlbmVyYWxTaGVsbFR5cGUuQ29tbWFuZENvZGUsXG5cdFx0R2VuZXJhbFNoZWxsVHlwZS5Db3BpbG90LFxuXHRcdEdlbmVyYWxTaGVsbFR5cGUuR2VtaW5pLFxuXHRdKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVmcmVzaExhYmVsKGluc3RhbmNlOiBQaWNrPElUZXJtaW5hbEluc3RhbmNlLCAnc2hlbGxMYXVuY2hDb25maWcnIHwgJ3NoZWxsVHlwZScgfCAnY3dkJyB8ICdmaXhlZENvbHMnIHwgJ2ZpeGVkUm93cycgfCAnaW5pdGlhbEN3ZCcgfCAncHJvY2Vzc05hbWUnIHwgJ3NlcXVlbmNlJyB8ICd1c2VySG9tZScgfCAnd29ya3NwYWNlRm9sZGVyJyB8ICdzdGF0aWNUaXRsZScgfCAnY2FwYWJpbGl0aWVzJyB8ICd0aXRsZScgfCAnZGVzY3JpcHRpb24nIHwgJ29zJz4sIHJlc2V0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHRhYnMgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy50YWJzO1xuXHRcdGNvbnN0IHVzZUFnZW50Q2xpVGl0bGUgPSB0YWJzLmFsbG93QWdlbnRDbGlUaXRsZSAmJiBUZXJtaW5hbExhYmVsQ29tcHV0ZXIuYWdlbnRDbGlTaGVsbFR5cGVzLmhhcyhpbnN0YW5jZS5zaGVsbFR5cGUgYXMgR2VuZXJhbFNoZWxsVHlwZSk7XG5cdFx0Y29uc3QgdGl0bGVUZW1wbGF0ZSA9IGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLnRpdGxlVGVtcGxhdGUgPz8gKHVzZUFnZW50Q2xpVGl0bGUgPyAnJHtzZXF1ZW5jZX0nIDogdGFicy50aXRsZSk7XG5cdFx0dGhpcy5fdGl0bGUgPSB0aGlzLmNvbXB1dGVMYWJlbChpbnN0YW5jZSwgdGl0bGVUZW1wbGF0ZSwgVGVybWluYWxMYWJlbFR5cGUuVGl0bGUsIHJlc2V0KTtcblx0XHR0aGlzLl9kZXNjcmlwdGlvbiA9IHRoaXMuY29tcHV0ZUxhYmVsKGluc3RhbmNlLCB0YWJzLmRlc2NyaXB0aW9uLCBUZXJtaW5hbExhYmVsVHlwZS5EZXNjcmlwdGlvbik7XG5cdFx0aWYgKHRoaXMuX3RpdGxlICE9PSBpbnN0YW5jZS50aXRsZSB8fCB0aGlzLl9kZXNjcmlwdGlvbiAhPT0gaW5zdGFuY2UuZGVzY3JpcHRpb24gfHwgcmVzZXQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSh7IHRpdGxlOiB0aGlzLl90aXRsZSwgZGVzY3JpcHRpb246IHRoaXMuX2Rlc2NyaXB0aW9uIH0pO1xuXHRcdH1cblx0fVxuXG5cdGNvbXB1dGVMYWJlbChcblx0XHRpbnN0YW5jZTogUGljazxJVGVybWluYWxJbnN0YW5jZSwgJ3NoZWxsTGF1bmNoQ29uZmlnJyB8ICdzaGVsbFR5cGUnIHwgJ2N3ZCcgfCAnZml4ZWRDb2xzJyB8ICdmaXhlZFJvd3MnIHwgJ2luaXRpYWxDd2QnIHwgJ3Byb2Nlc3NOYW1lJyB8ICdzZXF1ZW5jZScgfCAndXNlckhvbWUnIHwgJ3dvcmtzcGFjZUZvbGRlcicgfCAnc3RhdGljVGl0bGUnIHwgJ2NhcGFiaWxpdGllcycgfCAndGl0bGUnIHwgJ2Rlc2NyaXB0aW9uJyB8ICdwcm9ncmVzc1N0YXRlJyB8ICdvcyc+LFxuXHRcdGxhYmVsVGVtcGxhdGU6IHN0cmluZyxcblx0XHRsYWJlbFR5cGU6IFRlcm1pbmFsTGFiZWxUeXBlLFxuXHRcdHJlc2V0PzogYm9vbGVhblxuXHQpIHtcblx0XHRjb25zdCB0eXBlID0gaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LnR5cGUgfHwgaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcudHlwZTtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0Y29uc3QgcHJvbXB0SW5wdXRNb2RlbCA9IGNvbW1hbmREZXRlY3Rpb24/LnByb21wdElucHV0TW9kZWw7XG5cdFx0Y29uc3Qgbm9uVGFza1NwaW5uZXIgPSB0eXBlID09PSAnVGFzaycgPyAnJyA6ICcgJChsb2FkaW5nfnNwaW4pJztcblxuXHRcdGxldCBjd2QgPSBpbnN0YW5jZS5jd2QgfHwgaW5zdGFuY2UuaW5pdGlhbEN3ZCB8fCAnJztcblx0XHRjb25zdCBvcyA9IGluc3RhbmNlLm9zID8/IE9TO1xuXHRcdGN3ZCA9IHRpbGRpZnkoY3dkLCBpbnN0YW5jZS51c2VySG9tZSB8fCAnJywgb3MpO1xuXHRcdGlmIChvcyAhPT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiYgY3dkICYmIGluc3RhbmNlLnVzZXJIb21lICYmIGN3ZCA9PT0gaW5zdGFuY2UudXNlckhvbWUpIHtcblx0XHRcdGN3ZCA9ICd+Jztcblx0XHR9XG5cblx0XHRjb25zdCB0ZW1wbGF0ZVByb3BlcnRpZXM6IElUZXJtaW5hbExhYmVsVGVtcGxhdGVQcm9wZXJ0aWVzID0ge1xuXHRcdFx0Y3dkLFxuXHRcdFx0Y3dkRm9sZGVyOiAnJyxcblx0XHRcdHdvcmtzcGFjZUZvbGRlck5hbWU6IGluc3RhbmNlLndvcmtzcGFjZUZvbGRlcj8ubmFtZSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogaW5zdGFuY2Uud29ya3NwYWNlRm9sZGVyID8gcGF0aC5iYXNlbmFtZShpbnN0YW5jZS53b3Jrc3BhY2VGb2xkZXIudXJpLmZzUGF0aCkgOiB1bmRlZmluZWQsXG5cdFx0XHRsb2NhbDogdHlwZSA9PT0gJ0xvY2FsJyA/IHRlcm1pbmFsU3RyaW5ncy50eXBlTG9jYWwgOiB1bmRlZmluZWQsXG5cdFx0XHRwcm9jZXNzOiBpbnN0YW5jZS5wcm9jZXNzTmFtZSxcblx0XHRcdHNlcXVlbmNlOiBpbnN0YW5jZS5zZXF1ZW5jZSxcblx0XHRcdHRhc2s6IHR5cGUgPT09ICdUYXNrJyA/IHRlcm1pbmFsU3RyaW5ncy50eXBlVGFzayA6IHVuZGVmaW5lZCxcblx0XHRcdGZpeGVkRGltZW5zaW9uczogaW5zdGFuY2UuZml4ZWRDb2xzXG5cdFx0XHRcdD8gKGluc3RhbmNlLmZpeGVkUm93cyA/IGBcXHUyMTk0JHtpbnN0YW5jZS5maXhlZENvbHN9IFxcdTIxOTUke2luc3RhbmNlLmZpeGVkUm93c31gIDogYFxcdTIxOTQke2luc3RhbmNlLmZpeGVkQ29sc31gKVxuXHRcdFx0XHQ6IChpbnN0YW5jZS5maXhlZFJvd3MgPyBgXFx1MjE5NSR7aW5zdGFuY2UuZml4ZWRSb3dzfWAgOiAnJyksXG5cdFx0XHRzZXBhcmF0b3I6IHsgbGFiZWw6IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnRhYnMuc2VwYXJhdG9yIH0sXG5cdFx0XHRzaGVsbFR5cGU6IGluc3RhbmNlLnNoZWxsVHlwZSxcblx0XHRcdC8vIFNoZWxsIGNvbW1hbmQgcmVxdWlyZXMgaGlnaCBjb25maWRlbmNlXG5cdFx0XHRzaGVsbENvbW1hbmQ6IGNvbW1hbmREZXRlY3Rpb24/LmV4ZWN1dGluZ0NvbW1hbmQgJiYgY29tbWFuZERldGVjdGlvbi5leGVjdXRpbmdDb21tYW5kQ29uZmlkZW5jZSA9PT0gJ2hpZ2gnICYmIHByb21wdElucHV0TW9kZWxcblx0XHRcdFx0PyBwcm9tcHRJbnB1dE1vZGVsLnZhbHVlICsgbm9uVGFza1NwaW5uZXJcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHQvLyBTaGVsbCBwcm9tcHQgaW5wdXQgZG9lcyBub3QgcmVxdWlyZSBoaWdoIGNvbmZpZGVuY2UgYXMgaXQncyBsYXJnZWx5IGZvciBWUyBDb2RlIGRldmVsb3BlcnNcblx0XHRcdHNoZWxsUHJvbXB0SW5wdXQ6IGNvbW1hbmREZXRlY3Rpb24/LmV4ZWN1dGluZ0NvbW1hbmQgJiYgcHJvbXB0SW5wdXRNb2RlbFxuXHRcdFx0XHQ/IHByb21wdElucHV0TW9kZWwuZ2V0Q29tYmluZWRTdHJpbmcodHJ1ZSkgKyBub25UYXNrU3Bpbm5lclxuXHRcdFx0XHQ6IHByb21wdElucHV0TW9kZWw/LmdldENvbWJpbmVkU3RyaW5nKHRydWUpLFxuXHRcdFx0cHJvZ3Jlc3M6IHRoaXMuX2dldFByb2dyZXNzU3RhdGVTdHJpbmcoaW5zdGFuY2UucHJvZ3Jlc3NTdGF0ZSlcblx0XHR9O1xuXHRcdHRlbXBsYXRlUHJvcGVydGllcy53b3Jrc3BhY2VGb2xkZXJOYW1lID0gaW5zdGFuY2Uud29ya3NwYWNlRm9sZGVyPy5uYW1lID8/IHRlbXBsYXRlUHJvcGVydGllcy53b3Jrc3BhY2VGb2xkZXI7XG5cdFx0bGFiZWxUZW1wbGF0ZSA9IGxhYmVsVGVtcGxhdGUudHJpbSgpO1xuXHRcdGlmICghbGFiZWxUZW1wbGF0ZSkge1xuXHRcdFx0cmV0dXJuIGxhYmVsVHlwZSA9PT0gVGVybWluYWxMYWJlbFR5cGUuVGl0bGUgPyAoaW5zdGFuY2UucHJvY2Vzc05hbWUgfHwgJycpIDogJyc7XG5cdFx0fVxuXHRcdGlmICghcmVzZXQgJiYgaW5zdGFuY2Uuc3RhdGljVGl0bGUgJiYgbGFiZWxUeXBlID09PSBUZXJtaW5hbExhYmVsVHlwZS5UaXRsZSkge1xuXHRcdFx0cmV0dXJuIGluc3RhbmNlLnN0YXRpY1RpdGxlLnJlcGxhY2UoL1tcXG5cXHJcXHRdL2csICcnKSB8fCB0ZW1wbGF0ZVByb3BlcnRpZXMucHJvY2Vzcz8ucmVwbGFjZSgvW1xcblxcclxcdF0vZywgJycpIHx8ICcnO1xuXHRcdH1cblx0XHRjb25zdCBkZXRlY3Rpb24gPSBpbnN0YW5jZS5jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24pIHx8IGluc3RhbmNlLmNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5Lk5haXZlQ3dkRGV0ZWN0aW9uKTtcblx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRjb25zdCBtdWx0aVJvb3RXb3Jrc3BhY2UgPSBmb2xkZXJzLmxlbmd0aCA+IDE7XG5cblx0XHQvLyBPbmx5IHNldCBjd2RGb2xkZXIgaWYgZGV0ZWN0aW9uIGlzIG9uXG5cdFx0aWYgKHRlbXBsYXRlUHJvcGVydGllcy5jd2QgJiYgZGV0ZWN0aW9uICYmICghaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuaXNGZWF0dXJlVGVybWluYWwgfHwgbGFiZWxUeXBlID09PSBUZXJtaW5hbExhYmVsVHlwZS5UaXRsZSkpIHtcblx0XHRcdGNvbnN0IGN3ZFVyaSA9IFVSSS5mcm9tKHtcblx0XHRcdFx0c2NoZW1lOiBpbnN0YW5jZS53b3Jrc3BhY2VGb2xkZXI/LnVyaS5zY2hlbWUgfHwgU2NoZW1hcy5maWxlLFxuXHRcdFx0XHRwYXRoOiBpbnN0YW5jZS5jd2QgPyBwYXRoLnJlc29sdmUoaW5zdGFuY2UuY3dkKSA6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBNdWx0aS1yb290IHdvcmtzcGFjZXMgYWx3YXlzIHNob3cgY3dkRm9sZGVyIHRvIGRpc2FtYmlndWF0ZSB0aGVtLCBvdGhlcndpc2Ugb25seSBzaG93XG5cdFx0XHQvLyB3aGVuIGl0IGRpZmZlcnMgZnJvbSB0aGUgd29ya3NwYWNlIGZvbGRlciBpbiB3aGljaCBpdCB3YXMgbGF1bmNoZWQgZnJvbVxuXHRcdFx0bGV0IHNob3dDd2QgPSBmYWxzZTtcblx0XHRcdGlmIChtdWx0aVJvb3RXb3Jrc3BhY2UpIHtcblx0XHRcdFx0c2hvd0N3ZCA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKGluc3RhbmNlLndvcmtzcGFjZUZvbGRlcj8udXJpKSB7XG5cdFx0XHRcdGNvbnN0IGNhc2VTZW5zaXRpdmUgPSB0aGlzLl9maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KGluc3RhbmNlLndvcmtzcGFjZUZvbGRlci51cmksIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZSk7XG5cdFx0XHRcdHNob3dDd2QgPSBjd2RVcmkuZnNQYXRoLmxvY2FsZUNvbXBhcmUoaW5zdGFuY2Uud29ya3NwYWNlRm9sZGVyLnVyaS5mc1BhdGgsIHVuZGVmaW5lZCwgeyBzZW5zaXRpdml0eTogY2FzZVNlbnNpdGl2ZSA/ICdjYXNlJyA6ICdiYXNlJyB9KSAhPT0gMDtcblx0XHRcdH1cblx0XHRcdGlmIChzaG93Q3dkKSB7XG5cdFx0XHRcdHRlbXBsYXRlUHJvcGVydGllcy5jd2RGb2xkZXIgPSBwYXRoLmJhc2VuYW1lKHRlbXBsYXRlUHJvcGVydGllcy5jd2QpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBzcGVjaWFsIGNoYXJhY3RlcnMgdGhhdCBjb3VsZCBtZXNzIHdpdGggcmVuZGVyaW5nXG5cdFx0Y29uc3QgbGFiZWwgPSB0ZW1wbGF0ZShsYWJlbFRlbXBsYXRlLCAodGVtcGxhdGVQcm9wZXJ0aWVzIGFzIHVua25vd24pIGFzIHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgSVNlcGFyYXRvciB8IHVuZGVmaW5lZCB8IG51bGwgfSkucmVwbGFjZSgvW1xcblxcclxcdF0vZywgJycpLnRyaW0oKTtcblx0XHRyZXR1cm4gbGFiZWwgPT09ICcnICYmIGxhYmVsVHlwZSA9PT0gVGVybWluYWxMYWJlbFR5cGUuVGl0bGUgPyAoaW5zdGFuY2UucHJvY2Vzc05hbWUgfHwgJycpIDogbGFiZWw7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQcm9ncmVzc1N0YXRlU3RyaW5nKHByb2dyZXNzU3RhdGU/OiBJUHJvZ3Jlc3NTdGF0ZSk6IHN0cmluZyB7XG5cdFx0aWYgKCFwcm9ncmVzc1N0YXRlKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHN3aXRjaCAocHJvZ3Jlc3NTdGF0ZS5zdGF0ZSkge1xuXHRcdFx0Y2FzZSAwOiByZXR1cm4gJyc7XG5cdFx0XHRjYXNlIDE6IHJldHVybiBgJHtNYXRoLnJvdW5kKHByb2dyZXNzU3RhdGUudmFsdWUpfSVgO1xuXHRcdFx0Y2FzZSAyOiByZXR1cm4gJyQoZXJyb3IpJztcblx0XHRcdGNhc2UgMzogcmV0dXJuICckKGxvYWRpbmd+c3BpbiknO1xuXHRcdFx0Y2FzZSA0OiByZXR1cm4gJyQoYWxlcnQpJztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlRXhpdFJlc3VsdChcblx0ZXhpdENvZGVPckVycm9yOiBJVGVybWluYWxMYXVuY2hFcnJvciB8IG51bWJlciB8IHVuZGVmaW5lZCxcblx0c2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0cHJvY2Vzc1N0YXRlOiBQcm9jZXNzU3RhdGUsXG5cdGluaXRpYWxDd2Q6IHN0cmluZyB8IHVuZGVmaW5lZFxuKTogeyBjb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7IG1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIHtcblx0Ly8gT25seSByZXR1cm4gYSBtZXNzYWdlIGlmIHRoZSBleGl0IGNvZGUgaXMgbm9uLXplcm9cblx0aWYgKGV4aXRDb2RlT3JFcnJvciA9PT0gdW5kZWZpbmVkIHx8IGV4aXRDb2RlT3JFcnJvciA9PT0gMCkge1xuXHRcdHJldHVybiB7IGNvZGU6IGV4aXRDb2RlT3JFcnJvciwgbWVzc2FnZTogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRjb25zdCBjb2RlID0gaXNOdW1iZXIoZXhpdENvZGVPckVycm9yKSA/IGV4aXRDb2RlT3JFcnJvciA6IGV4aXRDb2RlT3JFcnJvci5jb2RlO1xuXG5cdC8vIENyZWF0ZSBleGl0IGNvZGUgbWVzc2FnZVxuXHRsZXQgbWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRzd2l0Y2ggKHR5cGVvZiBleGl0Q29kZU9yRXJyb3IpIHtcblx0XHRjYXNlICdudW1iZXInOiB7XG5cdFx0XHRsZXQgY29tbWFuZExpbmU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlKSB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lID0gc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZTtcblx0XHRcdFx0aWYgKGlzU3RyaW5nKHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MpKSB7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmUgKz0gYCAke3NoZWxsTGF1bmNoQ29uZmlnLmFyZ3N9YDtcblx0XHRcdFx0fSBlbHNlIGlmIChzaGVsbExhdW5jaENvbmZpZy5hcmdzICYmIHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmUgKz0gc2hlbGxMYXVuY2hDb25maWcuYXJncy5tYXAoYSA9PiBgICcke2F9J2ApLmpvaW4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2Nlc3NTdGF0ZSA9PT0gUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaCkge1xuXHRcdFx0XHRpZiAoY29tbWFuZExpbmUpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdsYXVuY2hGYWlsZWQuZXhpdENvZGVBbmRDb21tYW5kTGluZScsIFwiVGhlIHRlcm1pbmFsIHByb2Nlc3MgXFxcInswfVxcXCIgZmFpbGVkIHRvIGxhdW5jaCAoZXhpdCBjb2RlOiB7MX0pLlwiLCBjb21tYW5kTGluZSwgY29kZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnbGF1bmNoRmFpbGVkLmV4aXRDb2RlT25seScsIFwiVGhlIHRlcm1pbmFsIHByb2Nlc3MgZmFpbGVkIHRvIGxhdW5jaCAoZXhpdCBjb2RlOiB7MH0pLlwiLCBjb2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGNvbW1hbmRMaW5lKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgndGVybWluYXRlZC5leGl0Q29kZUFuZENvbW1hbmRMaW5lJywgXCJUaGUgdGVybWluYWwgcHJvY2VzcyBcXFwiezB9XFxcIiB0ZXJtaW5hdGVkIHdpdGggZXhpdCBjb2RlOiB7MX0uXCIsIGNvbW1hbmRMaW5lLCBjb2RlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCd0ZXJtaW5hdGVkLmV4aXRDb2RlT25seScsIFwiVGhlIHRlcm1pbmFsIHByb2Nlc3MgdGVybWluYXRlZCB3aXRoIGV4aXQgY29kZTogezB9LlwiLCBjb2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ29iamVjdCc6IHtcblx0XHRcdC8vIElnbm9yZSBpbnRlcm5hbCBlcnJvcnNcblx0XHRcdGlmIChleGl0Q29kZU9yRXJyb3IubWVzc2FnZS50b1N0cmluZygpLmluY2x1ZGVzKCdDb3VsZCBub3QgZmluZCBwdHkgd2l0aCBpZCcpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ29udmVydCBjb25wdHkgY29kZS1iYXNlZCBmYWlsdXJlcyBpbnRvIGh1bWFuIGZyaWVuZGx5IG1lc3NhZ2VzXG5cdFx0XHRsZXQgaW5uZXJNZXNzYWdlID0gZXhpdENvZGVPckVycm9yLm1lc3NhZ2U7XG5cdFx0XHRjb25zdCBjb25wdHlFcnJvciA9IGV4aXRDb2RlT3JFcnJvci5tZXNzYWdlLm1hdGNoKC8uKmVycm9yIGNvZGU6XFxzKihcXGQrKS4qJC8pO1xuXHRcdFx0aWYgKGNvbnB0eUVycm9yKSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yQ29kZSA9IGNvbnB0eUVycm9yLmxlbmd0aCA+IDEgPyBwYXJzZUludChjb25wdHlFcnJvclsxXSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHN3aXRjaCAoZXJyb3JDb2RlKSB7XG5cdFx0XHRcdFx0Y2FzZSA1OlxuXHRcdFx0XHRcdFx0aW5uZXJNZXNzYWdlID0gYEFjY2VzcyB3YXMgZGVuaWVkIHRvIHRoZSBwYXRoIGNvbnRhaW5pbmcgeW91ciBleGVjdXRhYmxlIFwiJHtzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlfVwiLiBNYW5hZ2UgYW5kIGNoYW5nZSB5b3VyIHBlcm1pc3Npb25zIHRvIGdldCB0aGlzIHRvIHdvcmtgO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAyNjc6XG5cdFx0XHRcdFx0XHRpbm5lck1lc3NhZ2UgPSBgSW52YWxpZCBzdGFydGluZyBkaXJlY3RvcnkgXCIke2luaXRpYWxDd2R9XCIsIHJldmlldyB5b3VyIHRlcm1pbmFsLmludGVncmF0ZWQuY3dkIHNldHRpbmdgO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAxMjYwOlxuXHRcdFx0XHRcdFx0aW5uZXJNZXNzYWdlID0gYFdpbmRvd3MgY2Fubm90IG9wZW4gdGhpcyBwcm9ncmFtIGJlY2F1c2UgaXQgaGFzIGJlZW4gcHJldmVudGVkIGJ5IGEgc29mdHdhcmUgcmVzdHJpY3Rpb24gcG9saWN5LiBGb3IgbW9yZSBpbmZvcm1hdGlvbiwgb3BlbiBFdmVudCBWaWV3ZXIgb3IgY29udGFjdCB5b3VyIHN5c3RlbSBBZG1pbmlzdHJhdG9yYDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdsYXVuY2hGYWlsZWQuZXJyb3JNZXNzYWdlJywgXCJUaGUgdGVybWluYWwgcHJvY2VzcyBmYWlsZWQgdG8gbGF1bmNoOiB7MH0uXCIsIGlubmVyTWVzc2FnZSk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBjb2RlLCBtZXNzYWdlIH07XG59XG5cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsSW5zdGFuY2VDb2xvclByb3ZpZGVyIGltcGxlbWVudHMgSVh0ZXJtQ29sb3JQcm92aWRlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhcmdldDogSVJlZmVyZW5jZTxUZXJtaW5hbExvY2F0aW9uIHwgdW5kZWZpbmVkPixcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0Z2V0QmFja2dyb3VuZENvbG9yKHRoZW1lOiBJQ29sb3JUaGVtZSkge1xuXHRcdGNvbnN0IHRlcm1pbmFsQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX0JBQ0tHUk9VTkRfQ09MT1IpO1xuXHRcdGlmICh0ZXJtaW5hbEJhY2tncm91bmQpIHtcblx0XHRcdHJldHVybiB0ZXJtaW5hbEJhY2tncm91bmQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90YXJnZXQub2JqZWN0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHRoZW1lLmdldENvbG9yKGVkaXRvckJhY2tncm91bmQpO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKFRFUk1JTkFMX1ZJRVdfSUQpITtcblx0XHRpZiAobG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCkge1xuXHRcdFx0cmV0dXJuIHRoZW1lLmdldENvbG9yKFBBTkVMX0JBQ0tHUk9VTkQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhlbWUuZ2V0Q29sb3IoU0lERV9CQVJfQkFDS0dST1VORCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ3Vlc3NTaGVsbFR5cGVGcm9tRXhlY3V0YWJsZShvczogT3BlcmF0aW5nU3lzdGVtLCBleGVjdXRhYmxlOiBzdHJpbmcpOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGV4ZUJhc2VuYW1lID0gcGF0aC5iYXNlbmFtZShleGVjdXRhYmxlKTtcblx0Y29uc3QgZ2VuZXJhbFNoZWxsVHlwZU1hcDogTWFwPFRlcm1pbmFsU2hlbGxUeXBlLCBSZWdFeHA+ID0gbmV3IE1hcChbXG5cdFx0W0dlbmVyYWxTaGVsbFR5cGUuSnVsaWEsIC9eanVsaWEkL10sXG5cdFx0W0dlbmVyYWxTaGVsbFR5cGUuTm9kZSwgL15ub2RlJC9dLFxuXHRcdFtHZW5lcmFsU2hlbGxUeXBlLk51U2hlbGwsIC9ebnUkL10sXG5cdFx0W0dlbmVyYWxTaGVsbFR5cGUuUG93ZXJTaGVsbCwgL15wd3NoKC1wcmV2aWV3KT98cG93ZXJzaGVsbCQvXSxcblx0XHRbR2VuZXJhbFNoZWxsVHlwZS5QeXRob24sIC9ecHkoPzp0aG9uKT8kL10sXG5cdFx0W0dlbmVyYWxTaGVsbFR5cGUuWG9uc2gsIC9eeG9uc2gvXVxuXHRdKTtcblx0Zm9yIChjb25zdCBbc2hlbGxUeXBlLCBwYXR0ZXJuXSBvZiBnZW5lcmFsU2hlbGxUeXBlTWFwKSB7XG5cdFx0aWYgKGV4ZUJhc2VuYW1lLm1hdGNoKHBhdHRlcm4pKSB7XG5cdFx0XHRyZXR1cm4gc2hlbGxUeXBlO1xuXHRcdH1cblx0fVxuXG5cdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRjb25zdCB3aW5kb3dzU2hlbGxUeXBlTWFwOiBNYXA8VGVybWluYWxTaGVsbFR5cGUsIFJlZ0V4cD4gPSBuZXcgTWFwKFtcblx0XHRcdFtXaW5kb3dzU2hlbGxUeXBlLkNvbW1hbmRQcm9tcHQsIC9eY21kJC9dLFxuXHRcdFx0W1dpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCwgL15iYXNoJC9dLFxuXHRcdFx0W1dpbmRvd3NTaGVsbFR5cGUuV3NsLCAvXndzbCQvXVxuXHRcdF0pO1xuXHRcdGZvciAoY29uc3QgW3NoZWxsVHlwZSwgcGF0dGVybl0gb2Ygd2luZG93c1NoZWxsVHlwZU1hcCkge1xuXHRcdFx0aWYgKGV4ZUJhc2VuYW1lLm1hdGNoKHBhdHRlcm4pKSB7XG5cdFx0XHRcdHJldHVybiBzaGVsbFR5cGU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IHBvc2l4U2hlbGxUeXBlczogUG9zaXhTaGVsbFR5cGVbXSA9IFtcblx0XHRcdFBvc2l4U2hlbGxUeXBlLkJhc2gsXG5cdFx0XHRQb3NpeFNoZWxsVHlwZS5Dc2gsXG5cdFx0XHRQb3NpeFNoZWxsVHlwZS5GaXNoLFxuXHRcdFx0UG9zaXhTaGVsbFR5cGUuS3NoLFxuXHRcdFx0UG9zaXhTaGVsbFR5cGUuU2gsXG5cdFx0XHRQb3NpeFNoZWxsVHlwZS5ac2gsXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IHR5cGUgb2YgcG9zaXhTaGVsbFR5cGVzKSB7XG5cdFx0XHRpZiAoZXhlQmFzZW5hbWUgPT09IHR5cGUpIHtcblx0XHRcdFx0cmV0dXJuIHR5cGU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlCQUFpQixVQUFVLG1CQUFtQixlQUFlO0FBQ3RFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQix5QkFBeUI7QUFDdEQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQXFCLHNCQUFzQixVQUFVLGVBQWU7QUFDcEUsU0FBUyxZQUFZLGVBQWUsaUJBQThCLG1CQUFtQixtQkFBbUIsU0FBUyxvQkFBcUM7QUFDdEosU0FBUyxlQUFlO0FBQ3hCLFlBQVksVUFBVTtBQUN0QixTQUFTLElBQUksaUJBQWlCLGFBQWEsaUJBQWlCO0FBQzVELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLG1CQUFtQixrQkFBa0Isc0JBQXNCO0FBQ3BFLFNBQVMsZ0NBQWdDLG9CQUFvQjtBQUM3RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxzQkFBc0I7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QztBQUNELGFBQVcsQ0FBQyxXQUFXLE9BQU8sS0FBSyxxQkFBcUI7QUFDdkQsUUFBSSxZQUFZLE1BQU0sT0FBTyxHQUFHO0FBQy9CLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUVBLE1BQUksT0FBTyxnQkFBZ0IsU0FBUztBQUNuQyxVQUFNLHNCQUFzRCxvQkFBSSxJQUFJO0FBQUEsTUFDbkUsQ0FBQyxpQkFBaUIsZUFBZSxPQUFPO0FBQUEsTUFDeEMsQ0FBQyxpQkFBaUIsU0FBUyxRQUFRO0FBQUEsTUFDbkMsQ0FBQyxpQkFBaUIsS0FBSyxPQUFPO0FBQUEsSUFDL0IsQ0FBQztBQUNELGVBQVcsQ0FBQyxXQUFXLE9BQU8sS0FBSyxxQkFBcUI7QUFDdkQsVUFBSSxZQUFZLE1BQU0sT0FBTyxHQUFHO0FBQy9CLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0QsT0FBTztBQUNOLFVBQU0sa0JBQW9DO0FBQUEsTUFDekMsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLElBQ2hCO0FBQ0EsZUFBVyxRQUFRLGlCQUFpQjtBQUNuQyxVQUFJLGdCQUFnQixNQUFNO0FBQ3pCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIkNvbnN0YW50cyIsICJlIiwgInh0ZXJtIiwgInBhdGgiLCAiaSIsICJUZXJtaW5hbExhYmVsVHlwZSJdCn0K
