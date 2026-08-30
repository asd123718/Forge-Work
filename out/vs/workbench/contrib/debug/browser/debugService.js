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
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { toAction } from "../../../../base/common/actions.js";
import { distinct } from "../../../../base/common/arrays.js";
import { RunOnceScheduler, raceTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isErrorWithActions } from "../../../../base/common/errorMessage.js";
import * as errors from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { deepClone, equals } from "../../../../base/common/objects.js";
import severity from "../../../../base/common/severity.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import * as nls from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IExtensionHostDebugService } from "../../../../platform/debug/common/extensionHostDebug.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { FileChangeType, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { EditorsOrder } from "../../../common/editor.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IActivityService, NumberBadge } from "../../../services/activity/common/activity.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from "../../files/common/files.js";
import { ITestService } from "../../testing/common/testService.js";
import { CALLSTACK_VIEW_ID, CONTEXT_BREAKPOINTS_EXIST, CONTEXT_DEBUG_STATE, CONTEXT_DEBUG_TYPE, CONTEXT_DEBUG_UX, CONTEXT_DISASSEMBLY_VIEW_FOCUS, CONTEXT_HAS_DEBUGGED, CONTEXT_IN_DEBUG_MODE, DEBUG_MEMORY_SCHEME, DEBUG_SCHEME, REPL_VIEW_ID, State, VIEWLET_ID, debuggerDisabledMessage, getStateLabel } from "../common/debug.js";
import { DebugCompoundRoot } from "../common/debugCompoundRoot.js";
import { Breakpoint, DataBreakpoint, DebugModel, FunctionBreakpoint, InstructionBreakpoint } from "../common/debugModel.js";
import { Source } from "../common/debugSource.js";
import { DebugStorage } from "../common/debugStorage.js";
import { DebugTelemetry } from "../common/debugTelemetry.js";
import { getExtensionHostDebugSession, saveAllBeforeDebugStart } from "../common/debugUtils.js";
import { ViewModel } from "../common/debugViewModel.js";
import { DisassemblyViewInput } from "../common/disassemblyViewInput.js";
import { AdapterManager } from "./debugAdapterManager.js";
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL } from "./debugCommands.js";
import { ConfigurationManager } from "./debugConfigurationManager.js";
import { DebugMemoryFileSystemProvider } from "./debugMemory.js";
import { DebugSession } from "./debugSession.js";
import { DebugTaskRunner, TaskRunResult } from "./debugTaskRunner.js";
let DebugService = class {
  constructor(editorService, paneCompositeService, viewsService, viewDescriptorService, notificationService, dialogService, layoutService, contextService, contextKeyService, lifecycleService, instantiationService, extensionService, fileService, configurationService, extensionHostDebugService, activityService, commandService, quickInputService, workspaceTrustRequestService, uriIdentityService, testService) {
    this.editorService = editorService;
    this.paneCompositeService = paneCompositeService;
    this.viewsService = viewsService;
    this.viewDescriptorService = viewDescriptorService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.layoutService = layoutService;
    this.contextService = contextService;
    this.contextKeyService = contextKeyService;
    this.lifecycleService = lifecycleService;
    this.instantiationService = instantiationService;
    this.extensionService = extensionService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.extensionHostDebugService = extensionHostDebugService;
    this.activityService = activityService;
    this.commandService = commandService;
    this.quickInputService = quickInputService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.uriIdentityService = uriIdentityService;
    this.testService = testService;
    this.restartingSessions = /* @__PURE__ */ new Set();
    this.disposables = new DisposableStore();
    this.initializing = false;
    this.sessionCancellationTokens = /* @__PURE__ */ new Map();
    this.haveDoneLazySetup = false;
    this.breakpointsToSendOnResourceSaved = /* @__PURE__ */ new Set();
    this._onDidChangeState = this.disposables.add(new Emitter());
    this._onDidNewSession = this.disposables.add(new Emitter());
    this._onWillNewSession = this.disposables.add(new Emitter());
    this._onDidEndSession = this.disposables.add(new Emitter());
    this.adapterManager = this.instantiationService.createInstance(AdapterManager, {
      onDidNewSession: this.onDidNewSession,
      configurationManager: () => this.configurationManager
    });
    this.disposables.add(this.adapterManager);
    this.configurationManager = this.instantiationService.createInstance(ConfigurationManager, this.adapterManager);
    this.disposables.add(this.configurationManager);
    this.debugStorage = this.disposables.add(this.instantiationService.createInstance(DebugStorage));
    this.chosenEnvironments = this.debugStorage.loadChosenEnvironments();
    this.model = this.instantiationService.createInstance(DebugModel, this.debugStorage);
    this.telemetry = this.instantiationService.createInstance(DebugTelemetry, this.model);
    this.viewModel = this.disposables.add(new ViewModel(contextKeyService));
    this.taskRunner = this.instantiationService.createInstance(DebugTaskRunner);
    this.disposables.add(this.fileService.onDidFilesChange((e) => this.onFileChanges(e)));
    this.disposables.add(this.lifecycleService.onWillShutdown(this.dispose, this));
    this.disposables.add(this.extensionHostDebugService.onAttachSession((event) => {
      const session = this.model.getSession(event.sessionId, true);
      if (session) {
        session.configuration.request = "attach";
        session.configuration.port = event.port;
        session.setSubId(event.subId);
        this.launchOrAttachToSession(session);
      }
    }));
    this.disposables.add(this.extensionHostDebugService.onTerminateSession((event) => {
      const session = this.model.getSession(event.sessionId);
      if (session && session.subId === event.subId) {
        session.disconnect();
      }
    }));
    this.disposables.add(this.viewModel.onDidFocusStackFrame(() => {
      this.onStateChange();
    }));
    this.disposables.add(this.viewModel.onDidFocusSession((session) => {
      this.onStateChange();
      if (session) {
        this.setExceptionBreakpointFallbackSession(session.getId());
      }
    }));
    this.disposables.add(Event.any(this.adapterManager.onDidRegisterDebugger, this.configurationManager.onDidSelectConfiguration)(() => {
      const debugUxValue = this.state !== State.Inactive || this.configurationManager.getAllConfigurations().length > 0 && this.adapterManager.hasEnabledDebuggers() ? "default" : "simple";
      this.debugUx.set(debugUxValue);
      this.debugStorage.storeDebugUxState(debugUxValue);
    }));
    this.disposables.add(this.model.onDidChangeCallStack(() => {
      const numberOfSessions = this.model.getSessions().filter((s) => !s.parentSession).length;
      this.activity?.dispose();
      if (numberOfSessions > 0) {
        const viewContainer = this.viewDescriptorService.getViewContainerByViewId(CALLSTACK_VIEW_ID);
        if (viewContainer) {
          this.activity = this.activityService.showViewContainerActivity(viewContainer.id, { badge: new NumberBadge(numberOfSessions, (n) => n === 1 ? nls.localize("1activeSession", "1 active session") : nls.localize("nActiveSessions", "{0} active sessions", n)) });
        }
      }
    }));
    this.disposables.add(editorService.onDidActiveEditorChange(() => {
      this.contextKeyService.bufferChangeEvents(() => {
        if (editorService.activeEditor === DisassemblyViewInput.instance) {
          this.disassemblyViewFocus.set(true);
        } else {
          this.disassemblyViewFocus?.reset();
        }
      });
    }));
    this.disposables.add(this.lifecycleService.onBeforeShutdown(() => {
      for (const editor of editorService.editors) {
        if (editor.resource?.scheme === DEBUG_MEMORY_SCHEME) {
          editor.dispose();
        }
      }
    }));
    this.disposables.add(extensionService.onWillStop((evt) => {
      evt.veto(
        this.model.getSessions().length > 0,
        nls.localize("active debug session", "A debug session is still running that would terminate.")
      );
    }));
    this.initContextKeys(contextKeyService);
  }
  initContextKeys(contextKeyService) {
    queueMicrotask(() => {
      contextKeyService.bufferChangeEvents(() => {
        this.debugType = CONTEXT_DEBUG_TYPE.bindTo(contextKeyService);
        this.debugState = CONTEXT_DEBUG_STATE.bindTo(contextKeyService);
        this.hasDebugged = CONTEXT_HAS_DEBUGGED.bindTo(contextKeyService);
        this.inDebugMode = CONTEXT_IN_DEBUG_MODE.bindTo(contextKeyService);
        this.debugUx = CONTEXT_DEBUG_UX.bindTo(contextKeyService);
        this.debugUx.set(this.debugStorage.loadDebugUxState());
        this.breakpointsExist = CONTEXT_BREAKPOINTS_EXIST.bindTo(contextKeyService);
        this.disassemblyViewFocus = CONTEXT_DISASSEMBLY_VIEW_FOCUS.bindTo(contextKeyService);
      });
      const setBreakpointsExistContext = () => this.breakpointsExist.set(!!(this.model.getBreakpoints().length || this.model.getDataBreakpoints().length || this.model.getFunctionBreakpoints().length));
      setBreakpointsExistContext();
      this.disposables.add(this.model.onDidChangeBreakpoints(() => setBreakpointsExistContext()));
    });
  }
  getModel() {
    return this.model;
  }
  getViewModel() {
    return this.viewModel;
  }
  getConfigurationManager() {
    return this.configurationManager;
  }
  getAdapterManager() {
    return this.adapterManager;
  }
  sourceIsNotAvailable(uri2) {
    this.model.sourceIsNotAvailable(uri2);
  }
  dispose() {
    this.disposables.dispose();
  }
  //---- state management
  get state() {
    const focusedSession = this.viewModel.focusedSession;
    if (focusedSession) {
      return focusedSession.state;
    }
    return this.initializing ? State.Initializing : State.Inactive;
  }
  get initializingOptions() {
    return this._initializingOptions;
  }
  startInitializingState(options) {
    if (!this.initializing) {
      this.initializing = true;
      this._initializingOptions = options;
      this.onStateChange();
    }
  }
  endInitializingState() {
    if (this.initializing) {
      this.initializing = false;
      this._initializingOptions = void 0;
      this.onStateChange();
    }
  }
  cancelTokens(id) {
    if (id) {
      const token = this.sessionCancellationTokens.get(id);
      if (token) {
        token.cancel();
        this.sessionCancellationTokens.delete(id);
      }
    } else {
      this.sessionCancellationTokens.forEach((t) => t.cancel());
      this.sessionCancellationTokens.clear();
    }
  }
  onStateChange() {
    const state = this.state;
    if (this.previousState !== state) {
      this.contextKeyService.bufferChangeEvents(() => {
        this.debugState.set(getStateLabel(state));
        this.inDebugMode.set(state !== State.Inactive);
        const debugUxValue = state !== State.Inactive && state !== State.Initializing || this.adapterManager.hasEnabledDebuggers() && this.configurationManager.selectedConfiguration.name ? "default" : "simple";
        this.debugUx.set(debugUxValue);
        this.debugStorage.storeDebugUxState(debugUxValue);
      });
      this.previousState = state;
      this._onDidChangeState.fire(state);
    }
  }
  get onDidChangeState() {
    return this._onDidChangeState.event;
  }
  get onDidNewSession() {
    return this._onDidNewSession.event;
  }
  get onWillNewSession() {
    return this._onWillNewSession.event;
  }
  get onDidEndSession() {
    return this._onDidEndSession.event;
  }
  lazySetup() {
    if (!this.haveDoneLazySetup) {
      this.disposables.add(this.fileService.registerProvider(DEBUG_MEMORY_SCHEME, this.disposables.add(new DebugMemoryFileSystemProvider(this))));
      this.haveDoneLazySetup = true;
    }
  }
  //---- life cycle management
  /**
   * main entry point
   * properly manages compounds, checks for errors and handles the initializing state.
   */
  async startDebugging(launch, configOrName, options, saveBeforeStart = !options?.parentSession) {
    const message = options && options.noDebug ? nls.localize("runTrust", "Running executes build tasks and program code from your workspace.") : nls.localize("debugTrust", "Debugging executes build tasks and program code from your workspace.");
    const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({ message });
    if (!trust) {
      return false;
    }
    this.lazySetup();
    this.startInitializingState(options);
    this.hasDebugged.set(true);
    try {
      await this.extensionService.activateByEvent("onDebug");
      if (saveBeforeStart) {
        await saveAllBeforeDebugStart(this.configurationService, this.editorService);
      }
      await this.extensionService.whenInstalledExtensionsRegistered();
      let config;
      let compound;
      if (!configOrName) {
        configOrName = this.configurationManager.selectedConfiguration.name;
      }
      if (typeof configOrName === "string" && launch) {
        config = launch.getConfiguration(configOrName);
        compound = launch.getCompound(configOrName);
      } else if (typeof configOrName !== "string") {
        config = configOrName;
      }
      if (compound) {
        if (!compound.configurations) {
          throw new Error(nls.localize(
            { key: "compoundMustHaveConfigurations", comment: ['compound indicates a "compounds" configuration item', '"configurations" is an attribute and should not be localized'] },
            'Compound must have "configurations" attribute set in order to start multiple configurations.'
          ));
        }
        if (compound.preLaunchTask) {
          const taskResult = await this.taskRunner.runTaskAndCheckErrors(launch?.workspace || this.contextService.getWorkspace(), compound.preLaunchTask);
          if (taskResult === TaskRunResult.Failure) {
            this.endInitializingState();
            return false;
          }
        }
        if (compound.stopAll) {
          options = { ...options, compoundRoot: new DebugCompoundRoot() };
        }
        const values = await Promise.all(compound.configurations.map((configData) => {
          const name = typeof configData === "string" ? configData : configData.name;
          if (name === compound.name) {
            return Promise.resolve(false);
          }
          let launchForName;
          if (typeof configData === "string") {
            const launchesContainingName = this.configurationManager.getLaunches().filter((l) => !!l.getConfiguration(name));
            if (launchesContainingName.length === 1) {
              launchForName = launchesContainingName[0];
            } else if (launch && launchesContainingName.length > 1 && launchesContainingName.indexOf(launch) >= 0) {
              launchForName = launch;
            } else {
              throw new Error(launchesContainingName.length === 0 ? nls.localize("noConfigurationNameInWorkspace", "Could not find launch configuration '{0}' in the workspace.", name) : nls.localize("multipleConfigurationNamesInWorkspace", "There are multiple launch configurations '{0}' in the workspace. Use folder name to qualify the configuration.", name));
            }
          } else if (configData.folder) {
            const launchesMatchingConfigData = this.configurationManager.getLaunches().filter((l) => l.workspace && l.workspace.name === configData.folder && !!l.getConfiguration(configData.name));
            if (launchesMatchingConfigData.length === 1) {
              launchForName = launchesMatchingConfigData[0];
            } else {
              throw new Error(nls.localize("noFolderWithName", "Can not find folder with name '{0}' for configuration '{1}' in compound '{2}'.", configData.folder, configData.name, compound.name));
            }
          }
          return this.createSession(launchForName, launchForName.getConfiguration(name), options);
        }));
        const result2 = values.every((success) => !!success);
        this.endInitializingState();
        return result2;
      }
      if (configOrName && !config) {
        const message2 = !!launch ? nls.localize("configMissing", "Configuration '{0}' is missing in 'launch.json'.", typeof configOrName === "string" ? configOrName : configOrName.name) : nls.localize("launchJsonDoesNotExist", "'launch.json' does not exist for passed workspace folder.");
        throw new Error(message2);
      }
      const result = await this.createSession(launch, config, options);
      this.endInitializingState();
      return result;
    } catch (err) {
      this.notificationService.error(err);
      this.endInitializingState();
      return Promise.reject(err);
    }
  }
  /**
   * gets the debugger for the type, resolves configurations by providers, substitutes variables and runs prelaunch tasks
   */
  async createSession(launch, config, options) {
    let type;
    if (config) {
      type = config.type;
    } else {
      config = /* @__PURE__ */ Object.create(null);
    }
    if (options && options.noDebug) {
      config.noDebug = true;
    } else if (options && typeof options.noDebug === "undefined" && options.parentSession && options.parentSession.configuration.noDebug) {
      config.noDebug = true;
    }
    const unresolvedConfig = deepClone(config);
    let guess;
    let activeEditor;
    if (!type) {
      activeEditor = this.editorService.activeEditor;
      if (activeEditor && activeEditor.resource) {
        const chosen = this.chosenEnvironments[activeEditor.resource.toString()];
        if (chosen) {
          type = chosen.type;
          if (chosen.dynamicLabel) {
            const dyn = await this.configurationManager.getDynamicConfigurationsByType(chosen.type);
            const found = dyn.find((d) => d.label === chosen.dynamicLabel);
            if (found) {
              launch = found.launch;
              Object.assign(config, found.config);
            }
          }
        }
      }
      if (!type) {
        guess = await this.adapterManager.guessDebugger(false);
        if (guess) {
          type = guess.debugger.type;
          if (guess.withConfig) {
            launch = guess.withConfig.launch;
            Object.assign(config, guess.withConfig.config);
          }
        }
      }
    }
    const initCancellationToken = new CancellationTokenSource();
    const sessionId = generateUuid();
    this.sessionCancellationTokens.set(sessionId, initCancellationToken);
    const configByProviders = await this.configurationManager.resolveConfigurationByProviders(launch && launch.workspace ? launch.workspace.uri : void 0, type, config, initCancellationToken.token);
    if (configByProviders && configByProviders.type) {
      try {
        let resolvedConfig = await this.substituteVariables(launch, configByProviders);
        if (!resolvedConfig) {
          return false;
        }
        if (initCancellationToken.token.isCancellationRequested) {
          return false;
        }
        let userConfirmedConcurrentSession = false;
        if (options?.startedByUser && resolvedConfig && resolvedConfig.suppressMultipleSessionWarning !== true) {
          const existingSessions = this.model.getSessions();
          const workspace2 = launch?.workspace;
          const existingSession = existingSessions.find(
            (s) => s.configuration.name === resolvedConfig.name && s.configuration.type === resolvedConfig.type && s.configuration.request === resolvedConfig.request && s.root === workspace2
          );
          if (existingSession) {
            const confirmed = await this.confirmConcurrentSession(existingSession.getLabel());
            if (!confirmed) {
              return false;
            }
            userConfirmedConcurrentSession = true;
          }
        }
        const workspace = launch?.workspace || this.contextService.getWorkspace();
        const taskResult = await this.taskRunner.runTaskAndCheckErrors(workspace, resolvedConfig.preLaunchTask);
        if (taskResult === TaskRunResult.Failure) {
          return false;
        }
        const cfg = await this.configurationManager.resolveDebugConfigurationWithSubstitutedVariables(launch && launch.workspace ? launch.workspace.uri : void 0, resolvedConfig.type, resolvedConfig, initCancellationToken.token);
        if (!cfg) {
          if (launch && type && cfg === null && !initCancellationToken.token.isCancellationRequested) {
            await launch.openConfigFile({ preserveFocus: true, type }, initCancellationToken.token);
          }
          return false;
        }
        resolvedConfig = cfg;
        const dbg = this.adapterManager.getDebugger(resolvedConfig.type);
        if (!dbg || configByProviders.request !== "attach" && configByProviders.request !== "launch") {
          let message;
          if (configByProviders.request !== "attach" && configByProviders.request !== "launch") {
            message = configByProviders.request ? nls.localize("debugRequestNotSupported", "Attribute '{0}' has an unsupported value '{1}' in the chosen debug configuration.", "request", configByProviders.request) : nls.localize("debugRequesMissing", "Attribute '{0}' is missing from the chosen debug configuration.", "request");
          } else {
            message = resolvedConfig.type ? nls.localize("debugTypeNotSupported", "Configured debug type '{0}' is not supported.", resolvedConfig.type) : nls.localize("debugTypeMissing", "Missing property 'type' for the chosen launch configuration.");
          }
          const actionList = [];
          actionList.push(toAction({
            id: "installAdditionalDebuggers",
            label: nls.localize({ key: "installAdditionalDebuggers", comment: ['Placeholder is the debug type, so for example "node", "python"'] }, "Install {0} Extension", resolvedConfig.type),
            enabled: true,
            run: async () => this.commandService.executeCommand("debug.installAdditionalDebuggers", resolvedConfig?.type)
          }));
          await this.showError(message, actionList);
          return false;
        }
        if (!dbg.enabled) {
          await this.showError(debuggerDisabledMessage(dbg.type), []);
          return false;
        }
        const result = await this.doCreateSession(sessionId, launch?.workspace, { resolved: resolvedConfig, unresolved: unresolvedConfig }, options, userConfirmedConcurrentSession);
        if (result && guess && activeEditor && activeEditor.resource) {
          this.chosenEnvironments[activeEditor.resource.toString()] = { type: guess.debugger.type, dynamicLabel: guess.withConfig?.label };
          this.debugStorage.storeChosenEnvironments(this.chosenEnvironments);
        }
        return result;
      } catch (err) {
        if (err && err.message) {
          await this.showError(err.message);
        } else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
          await this.showError(nls.localize("noFolderWorkspaceDebugError", "The active file can not be debugged. Make sure it is saved and that you have a debug extension installed for that file type."));
        }
        if (launch && !initCancellationToken.token.isCancellationRequested) {
          await launch.openConfigFile({ preserveFocus: true }, initCancellationToken.token);
        }
        return false;
      }
    }
    if (launch && type && configByProviders === null && !initCancellationToken.token.isCancellationRequested) {
      await launch.openConfigFile({ preserveFocus: true, type }, initCancellationToken.token);
    }
    return false;
  }
  /**
   * instantiates the new session, initializes the session, registers session listeners and reports telemetry
   */
  async doCreateSession(sessionId, root, configuration, options, userConfirmedConcurrentSession = false) {
    const session = this.instantiationService.createInstance(DebugSession, sessionId, configuration, root, this.model, options);
    if (!userConfirmedConcurrentSession && options?.startedByUser && this.model.getSessions().some(
      (s) => s.configuration.name === configuration.resolved.name && s.configuration.type === configuration.resolved.type && s.configuration.request === configuration.resolved.request && s.root === root
    ) && configuration.resolved.suppressMultipleSessionWarning !== true) {
      const confirmed = await this.confirmConcurrentSession(session.getLabel());
      if (!confirmed) {
        return false;
      }
    }
    this.model.addSession(session);
    this._onWillNewSession.fire(session);
    const openDebug = this.configurationService.getValue("debug").openDebug;
    if (!configuration.resolved.noDebug && (openDebug === "openOnSessionStart" || openDebug === "openOnFirstSessionStart" && this.viewModel.firstSessionStart) && !session.suppressDebugView) {
      await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar);
    }
    try {
      await this.launchOrAttachToSession(session);
      const internalConsoleOptions = session.configuration.internalConsoleOptions || this.configurationService.getValue("debug").internalConsoleOptions;
      if (internalConsoleOptions === "openOnSessionStart" || this.viewModel.firstSessionStart && internalConsoleOptions === "openOnFirstSessionStart") {
        this.viewsService.openView(REPL_VIEW_ID, false);
      }
      this.viewModel.firstSessionStart = false;
      const showSubSessions = this.configurationService.getValue("debug").showSubSessionsInToolBar;
      const sessions = this.model.getSessions();
      const shownSessions = showSubSessions ? sessions : sessions.filter((s) => !s.parentSession);
      if (shownSessions.length > 1) {
        this.viewModel.setMultiSessionView(true);
      }
      this._onDidNewSession.fire(session);
      return true;
    } catch (error) {
      if (errors.isCancellationError(error)) {
        return false;
      }
      if (session && session.getReplElements().length > 0) {
        this.viewsService.openView(REPL_VIEW_ID, false);
      }
      if (session.configuration && session.configuration.request === "attach" && session.configuration.__autoAttach) {
        return false;
      }
      const errorMessage = error instanceof Error ? error.message : error;
      if (error.showUser !== false) {
        await this.showError(errorMessage, isErrorWithActions(error) ? error.actions : []);
      }
      return false;
    }
  }
  async confirmConcurrentSession(sessionLabel) {
    const result = await this.dialogService.confirm({
      message: nls.localize("multipleSession", "'{0}' is already running. Do you want to start another instance?", sessionLabel)
    });
    return result.confirmed;
  }
  async launchOrAttachToSession(session, forceFocus = false) {
    this.registerSessionListeners(session);
    const dbgr = this.adapterManager.getDebugger(session.configuration.type);
    try {
      await session.initialize(dbgr);
      await session.launchOrAttach(session.configuration);
      const launchJsonExists = !!session.root && !!this.configurationService.getValue("launch", { resource: session.root.uri });
      await this.telemetry.logDebugSessionStart(dbgr, launchJsonExists);
      if (forceFocus || !this.viewModel.focusedSession || session.parentSession === this.viewModel.focusedSession && session.compact) {
        await this.focusStackFrame(void 0, void 0, session);
      }
    } catch (err) {
      if (this.viewModel.focusedSession === session) {
        await this.focusStackFrame(void 0);
      }
      return Promise.reject(err);
    }
  }
  registerSessionListeners(session) {
    const listenerDisposables = new DisposableStore();
    this.disposables.add(listenerDisposables);
    const sessionRunningScheduler = listenerDisposables.add(new RunOnceScheduler(() => {
      if (session.state === State.Running && this.viewModel.focusedSession === session) {
        this.viewModel.setFocus(void 0, this.viewModel.focusedThread, session, false);
      }
    }, 200));
    listenerDisposables.add(session.onDidChangeState(() => {
      if (session.state === State.Running && this.viewModel.focusedSession === session) {
        sessionRunningScheduler.schedule();
      }
      if (session === this.viewModel.focusedSession) {
        this.onStateChange();
      }
    }));
    listenerDisposables.add(this.onDidEndSession((e) => {
      if (e.session === session) {
        this.disposables.delete(listenerDisposables);
      }
    }));
    listenerDisposables.add(session.onDidEndAdapter(async (adapterExitEvent) => {
      if (adapterExitEvent) {
        if (adapterExitEvent.error) {
          this.notificationService.error(nls.localize("debugAdapterCrash", "Debug adapter process has terminated unexpectedly ({0})", adapterExitEvent.error.message || adapterExitEvent.error.toString()));
        }
        this.telemetry.logDebugSessionStop(session, adapterExitEvent);
      }
      const extensionDebugSession = getExtensionHostDebugSession(session);
      if (extensionDebugSession && extensionDebugSession.state === State.Running && extensionDebugSession.configuration.noDebug) {
        this.extensionHostDebugService.close(extensionDebugSession.getId());
      }
      if (session.configuration.postDebugTask) {
        const root = session.root ?? this.contextService.getWorkspace();
        try {
          await this.taskRunner.runTask(root, session.configuration.postDebugTask);
        } catch (err) {
          this.notificationService.error(err);
        }
      }
      this.endInitializingState();
      this.cancelTokens(session.getId());
      if (this.configurationService.getValue("debug").closeReadonlyTabsOnEnd) {
        const editorsToClose = this.editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => {
          return editor.resource?.scheme === DEBUG_SCHEME && session.getId() === Source.getEncodedDebugData(editor.resource).sessionId;
        });
        this.editorService.closeEditors(editorsToClose);
      }
      this._onDidEndSession.fire({ session, restart: this.restartingSessions.has(session) });
      const focusedSession = this.viewModel.focusedSession;
      if (focusedSession && focusedSession.getId() === session.getId()) {
        const { session: session2, thread, stackFrame } = getStackFrameThreadAndSessionToFocus(this.model, void 0, void 0, void 0, focusedSession);
        this.viewModel.setFocus(stackFrame, thread, session2, false);
      }
      if (this.model.getSessions().length === 0) {
        this.viewModel.setMultiSessionView(false);
        if (this.layoutService.isVisible(Parts.SIDEBAR_PART) && this.configurationService.getValue("debug").openExplorerOnEnd) {
          this.paneCompositeService.openPaneComposite(EXPLORER_VIEWLET_ID, ViewContainerLocation.Sidebar);
        }
        const dataBreakpoints = this.model.getDataBreakpoints().filter((dbp) => !dbp.canPersist);
        dataBreakpoints.forEach((dbp) => this.model.removeDataBreakpoints(dbp.getId()));
        if (this.configurationService.getValue("debug").console.closeOnEnd) {
          const debugConsoleContainer = this.viewDescriptorService.getViewContainerByViewId(REPL_VIEW_ID);
          if (debugConsoleContainer && this.viewsService.isViewContainerVisible(debugConsoleContainer.id)) {
            this.viewsService.closeViewContainer(debugConsoleContainer.id);
          }
        }
      }
      this.model.removeExceptionBreakpointsForSession(session.getId());
    }));
  }
  async restartSession(session, restartData) {
    if (session.saveBeforeRestart) {
      await saveAllBeforeDebugStart(this.configurationService, this.editorService);
    }
    const isAutoRestart = !!restartData;
    const runTasks = async () => {
      if (isAutoRestart) {
        return Promise.resolve(TaskRunResult.Success);
      }
      const root = session.root || this.contextService.getWorkspace();
      await this.taskRunner.runTask(root, session.configuration.preRestartTask);
      await this.taskRunner.runTask(root, session.configuration.postDebugTask);
      const taskResult1 = await this.taskRunner.runTaskAndCheckErrors(root, session.configuration.preLaunchTask);
      if (taskResult1 !== TaskRunResult.Success) {
        return taskResult1;
      }
      return this.taskRunner.runTaskAndCheckErrors(root, session.configuration.postRestartTask);
    };
    const extensionDebugSession = getExtensionHostDebugSession(session);
    if (extensionDebugSession) {
      const taskResult = await runTasks();
      if (taskResult === TaskRunResult.Success) {
        this.extensionHostDebugService.reload(extensionDebugSession.getId());
      }
      return;
    }
    let needsToSubstitute = false;
    let unresolved;
    const launch = session.root ? this.configurationManager.getLaunch(session.root.uri) : void 0;
    if (launch) {
      unresolved = launch.getConfiguration(session.configuration.name);
      if (unresolved && !equals(unresolved, session.unresolvedConfiguration)) {
        unresolved.noDebug = session.configuration.noDebug;
        needsToSubstitute = true;
      }
    }
    let resolved = session.configuration;
    if (launch && needsToSubstitute && unresolved) {
      const initCancellationToken = new CancellationTokenSource();
      this.sessionCancellationTokens.set(session.getId(), initCancellationToken);
      const resolvedByProviders = await this.configurationManager.resolveConfigurationByProviders(launch.workspace ? launch.workspace.uri : void 0, unresolved.type, unresolved, initCancellationToken.token);
      if (resolvedByProviders) {
        resolved = await this.substituteVariables(launch, resolvedByProviders);
        if (resolved && !initCancellationToken.token.isCancellationRequested) {
          resolved = await this.configurationManager.resolveDebugConfigurationWithSubstitutedVariables(launch && launch.workspace ? launch.workspace.uri : void 0, resolved.type, resolved, initCancellationToken.token);
        }
      } else {
        resolved = resolvedByProviders;
      }
    }
    if (resolved) {
      session.setConfiguration({ resolved, unresolved });
    }
    session.configuration.__restart = restartData;
    const doRestart = async (fn) => {
      this.restartingSessions.add(session);
      let didRestart = false;
      try {
        didRestart = await fn() !== false;
      } catch (e) {
        didRestart = false;
        throw e;
      } finally {
        this.restartingSessions.delete(session);
        if (!didRestart) {
          this._onDidEndSession.fire({ session, restart: false });
        }
      }
    };
    for (const breakpoint of this.model.getBreakpoints({ triggeredOnly: true })) {
      breakpoint.setSessionDidTrigger(session.getId(), false);
    }
    if (session.correlatedTestRun) {
      if (!session.correlatedTestRun.completedAt) {
        session.cancelCorrelatedTestRun();
        await Event.toPromise(session.correlatedTestRun.onComplete);
      }
      this.testService.runResolvedTests(session.correlatedTestRun.request);
      return;
    }
    if (session.capabilities.supportsRestartRequest) {
      const taskResult = await runTasks();
      if (taskResult === TaskRunResult.Success) {
        await doRestart(async () => {
          await session.restart();
          return true;
        });
      }
      return;
    }
    const shouldFocus = !!this.viewModel.focusedSession && session.getId() === this.viewModel.focusedSession.getId();
    return doRestart(async () => {
      if (isAutoRestart) {
        await session.disconnect(true);
      } else {
        await session.terminate(true);
      }
      return new Promise((c, e) => {
        setTimeout(async () => {
          const taskResult = await runTasks();
          if (taskResult !== TaskRunResult.Success) {
            return c(false);
          }
          if (!resolved) {
            return c(false);
          }
          try {
            await this.launchOrAttachToSession(session, shouldFocus);
            this._onDidNewSession.fire(session);
            c(true);
          } catch (error) {
            e(error);
          }
        }, 300);
      });
    });
  }
  async stopSession(session, disconnect = false, suspend = false) {
    if (session) {
      return disconnect ? session.disconnect(void 0, suspend) : session.terminate();
    }
    const sessions = this.model.getSessions();
    if (sessions.length === 0) {
      this.taskRunner.cancel();
      await this.quickInputService.cancel();
      this.endInitializingState();
      this.cancelTokens(void 0);
    }
    return Promise.all(sessions.map((s) => disconnect ? s.disconnect(void 0, suspend) : s.terminate()));
  }
  async substituteVariables(launch, config) {
    const dbg = this.adapterManager.getDebugger(config.type);
    if (dbg) {
      let folder = void 0;
      if (launch && launch.workspace) {
        folder = launch.workspace;
      } else {
        const folders = this.contextService.getWorkspace().folders;
        if (folders.length === 1) {
          folder = folders[0];
        }
      }
      try {
        return await dbg.substituteVariables(folder, config);
      } catch (err) {
        if (err.message !== errors.canceledName) {
          this.showError(err.message, void 0, !!launch?.getConfiguration(config.name));
        }
        return void 0;
      }
    }
    return Promise.resolve(config);
  }
  async showError(message, errorActions = [], promptLaunchJson = true) {
    const configureAction = toAction({ id: DEBUG_CONFIGURE_COMMAND_ID, label: DEBUG_CONFIGURE_LABEL, enabled: true, run: () => this.commandService.executeCommand(DEBUG_CONFIGURE_COMMAND_ID) });
    const actions = errorActions.filter((action) => action.id.endsWith(".command")).length > 0 ? errorActions : [...errorActions, ...promptLaunchJson ? [configureAction] : []];
    await this.dialogService.prompt({
      type: severity.Error,
      message,
      buttons: actions.map((action) => ({
        label: action.label,
        run: () => action.run()
      })),
      cancelButton: true
    });
  }
  //---- focus management
  async focusStackFrame(_stackFrame, _thread, _session, options) {
    const { stackFrame, thread, session } = getStackFrameThreadAndSessionToFocus(this.model, _stackFrame, _thread, _session);
    if (stackFrame) {
      const editor = await stackFrame.openInEditor(this.editorService, options?.preserveFocus ?? true, options?.sideBySide, options?.pinned);
      if (editor) {
        if (editor.input === DisassemblyViewInput.instance) {
        } else {
          const control = editor.getControl();
          if (stackFrame && isCodeEditor(control) && control.hasModel()) {
            const model = control.getModel();
            const lineNumber = stackFrame.range.startLineNumber;
            if (lineNumber >= 1 && lineNumber <= model.getLineCount()) {
              const lineContent = control.getModel().getLineContent(lineNumber);
              aria.alert(nls.localize(
                { key: "debuggingPaused", comment: ['First placeholder is the file line content, second placeholder is the reason why debugging is stopped, for example "breakpoint", third is the stack frame name, and last is the line number.'] },
                "{0}, debugging paused {1}, {2}:{3}",
                lineContent,
                thread && thread.stoppedDetails ? `, reason ${thread.stoppedDetails.reason}` : "",
                stackFrame.source ? stackFrame.source.name : "",
                stackFrame.range.startLineNumber
              ));
            }
          }
        }
      }
    }
    if (session) {
      this.debugType.set(session.configuration.type);
    } else {
      this.debugType.reset();
    }
    this.viewModel.setFocus(stackFrame, thread, session, !!options?.explicit);
  }
  //---- watches
  addWatchExpression(name) {
    const we = this.model.addWatchExpression(name);
    if (!name) {
      this.viewModel.setSelectedExpression(we, false);
    }
    this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
  }
  renameWatchExpression(id, newName) {
    this.model.renameWatchExpression(id, newName);
    this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
  }
  moveWatchExpression(id, position) {
    this.model.moveWatchExpression(id, position);
    this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
  }
  removeWatchExpressions(id) {
    this.model.removeWatchExpressions(id);
    this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
  }
  //---- breakpoints
  canSetBreakpointsIn(model) {
    return this.adapterManager.canSetBreakpointsIn(model);
  }
  async enableOrDisableBreakpoints(enable, breakpoint) {
    if (breakpoint) {
      this.model.setEnablement(breakpoint, enable);
      this.debugStorage.storeBreakpoints(this.model);
      if (breakpoint instanceof Breakpoint) {
        await this.makeTriggeredBreakpointsMatchEnablement(enable, breakpoint);
        await this.sendBreakpoints(breakpoint.originalUri);
      } else if (breakpoint instanceof FunctionBreakpoint) {
        await this.sendFunctionBreakpoints();
      } else if (breakpoint instanceof DataBreakpoint) {
        await this.sendDataBreakpoints();
      } else if (breakpoint instanceof InstructionBreakpoint) {
        await this.sendInstructionBreakpoints();
      } else {
        await this.sendExceptionBreakpoints();
      }
    } else {
      this.model.enableOrDisableAllBreakpoints(enable);
      this.debugStorage.storeBreakpoints(this.model);
      await this.sendAllBreakpoints();
    }
    this.debugStorage.storeBreakpoints(this.model);
  }
  async addBreakpoints(uri2, rawBreakpoints, ariaAnnounce = true) {
    const breakpoints = this.model.addBreakpoints(uri2, rawBreakpoints);
    if (ariaAnnounce) {
      breakpoints.forEach((bp) => aria.status(nls.localize("breakpointAdded", "Added breakpoint, line {0}, file {1}", bp.lineNumber, uri2.fsPath)));
    }
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendBreakpoints(uri2);
    this.debugStorage.storeBreakpoints(this.model);
    return breakpoints;
  }
  async updateBreakpoints(uri2, data, sendOnResourceSaved) {
    this.model.updateBreakpoints(data);
    this.debugStorage.storeBreakpoints(this.model);
    if (sendOnResourceSaved) {
      this.breakpointsToSendOnResourceSaved.add(uri2);
    } else {
      await this.sendBreakpoints(uri2);
      this.debugStorage.storeBreakpoints(this.model);
    }
  }
  async removeBreakpoints(id) {
    const breakpoints = this.model.getBreakpoints();
    const toRemove = id === void 0 ? breakpoints : id instanceof Array ? breakpoints.filter((bp) => id.includes(bp.getId())) : breakpoints.filter((bp) => bp.getId() === id);
    toRemove.forEach((bp) => aria.status(nls.localize("breakpointRemoved", "Removed breakpoint, line {0}, file {1}", bp.lineNumber, bp.uri.fsPath)));
    const urisToClear = new Set(toRemove.map((bp) => bp.originalUri.toString()));
    this.model.removeBreakpoints(toRemove);
    this.unlinkTriggeredBreakpoints(breakpoints, toRemove).forEach((uri2) => urisToClear.add(uri2.toString()));
    this.debugStorage.storeBreakpoints(this.model);
    await Promise.all([...urisToClear].map((uri2) => this.sendBreakpoints(URI.parse(uri2))));
  }
  setBreakpointsActivated(activated) {
    this.model.setBreakpointsActivated(activated);
    return this.sendAllBreakpoints();
  }
  async addFunctionBreakpoint(opts, id) {
    this.model.addFunctionBreakpoint(opts ?? { name: "" }, id);
    if (opts) {
      this.debugStorage.storeBreakpoints(this.model);
      await this.sendFunctionBreakpoints();
      this.debugStorage.storeBreakpoints(this.model);
    }
  }
  async updateFunctionBreakpoint(id, update) {
    this.model.updateFunctionBreakpoint(id, update);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendFunctionBreakpoints();
  }
  async removeFunctionBreakpoints(id) {
    this.model.removeFunctionBreakpoints(id);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendFunctionBreakpoints();
  }
  async addDataBreakpoint(opts) {
    this.model.addDataBreakpoint(opts);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendDataBreakpoints();
    this.debugStorage.storeBreakpoints(this.model);
  }
  async updateDataBreakpoint(id, update) {
    this.model.updateDataBreakpoint(id, update);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendDataBreakpoints();
  }
  async removeDataBreakpoints(id) {
    this.model.removeDataBreakpoints(id);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendDataBreakpoints();
  }
  async addInstructionBreakpoint(opts) {
    this.model.addInstructionBreakpoint(opts);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendInstructionBreakpoints();
    this.debugStorage.storeBreakpoints(this.model);
  }
  async removeInstructionBreakpoints(instructionReference, offset, address) {
    this.model.removeInstructionBreakpoints(instructionReference, offset, address);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendInstructionBreakpoints();
  }
  setExceptionBreakpointFallbackSession(sessionId) {
    this.model.setExceptionBreakpointFallbackSession(sessionId);
    this.debugStorage.storeBreakpoints(this.model);
  }
  setExceptionBreakpointsForSession(session, filters) {
    this.model.setExceptionBreakpointsForSession(session.getId(), filters);
    this.debugStorage.storeBreakpoints(this.model);
  }
  async setExceptionBreakpointCondition(exceptionBreakpoint, condition) {
    this.model.setExceptionBreakpointCondition(exceptionBreakpoint, condition);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendExceptionBreakpoints();
  }
  async sendAllBreakpoints(session) {
    const setBreakpointsPromises = distinct(this.model.getBreakpoints(), (bp) => bp.originalUri.toString()).map((bp) => this.sendBreakpoints(bp.originalUri, false, session));
    if (session?.capabilities.supportsConfigurationDoneRequest) {
      await Promise.all([
        ...setBreakpointsPromises,
        this.sendFunctionBreakpoints(session),
        this.sendDataBreakpoints(session),
        this.sendInstructionBreakpoints(session),
        this.sendExceptionBreakpoints(session)
      ]);
    } else {
      await Promise.all(setBreakpointsPromises);
      await this.sendFunctionBreakpoints(session);
      await this.sendDataBreakpoints(session);
      await this.sendInstructionBreakpoints(session);
      await this.sendExceptionBreakpoints(session);
    }
  }
  /**
   * Removes the condition of triggered breakpoints that depended on
   * breakpoints in `removedBreakpoints`. Returns the URIs of resources that
   * had their breakpoints changed in this way.
   */
  unlinkTriggeredBreakpoints(allBreakpoints, removedBreakpoints) {
    const affectedUris = [];
    for (const removed of removedBreakpoints) {
      for (const existing of allBreakpoints) {
        if (!removedBreakpoints.includes(existing) && existing.triggeredBy === removed.getId()) {
          this.model.updateBreakpoints(/* @__PURE__ */ new Map([[existing.getId(), { triggeredBy: void 0 }]]));
          affectedUris.push(existing.originalUri);
        }
      }
    }
    return affectedUris;
  }
  async makeTriggeredBreakpointsMatchEnablement(enable, breakpoint) {
    if (enable) {
      if (breakpoint.triggeredBy) {
        const trigger = this.model.getBreakpoints().find((bp) => breakpoint.triggeredBy === bp.getId());
        if (trigger && !trigger.enabled) {
          await this.enableOrDisableBreakpoints(enable, trigger);
        }
      }
    }
    await Promise.all(
      this.model.getBreakpoints().filter((bp) => bp.triggeredBy === breakpoint.getId() && bp.enabled !== enable).map((bp) => this.enableOrDisableBreakpoints(enable, bp))
    );
  }
  async sendBreakpoints(modelUri, sourceModified = false, session) {
    const breakpointsToSend = this.model.getBreakpoints({ originalUri: modelUri, enabledOnly: true });
    await sendToOneOrAllSessions(this.model, session, async (s) => {
      if (!s.configuration.noDebug) {
        const sessionBps = breakpointsToSend.filter((bp) => !bp.triggeredBy || bp.getSessionDidTrigger(s.getId()));
        await s.sendBreakpoints(modelUri, sessionBps, sourceModified);
      }
    });
  }
  async sendFunctionBreakpoints(session) {
    const breakpointsToSend = this.model.getFunctionBreakpoints().filter((fbp) => fbp.enabled && this.model.areBreakpointsActivated());
    await sendToOneOrAllSessions(this.model, session, async (s) => {
      if (s.capabilities.supportsFunctionBreakpoints && !s.configuration.noDebug) {
        await s.sendFunctionBreakpoints(breakpointsToSend);
      }
    });
  }
  async sendDataBreakpoints(session) {
    const breakpointsToSend = this.model.getDataBreakpoints().filter((fbp) => fbp.enabled && this.model.areBreakpointsActivated());
    await sendToOneOrAllSessions(this.model, session, async (s) => {
      if (s.capabilities.supportsDataBreakpoints && !s.configuration.noDebug) {
        await s.sendDataBreakpoints(breakpointsToSend);
      }
    });
  }
  async sendInstructionBreakpoints(session) {
    const breakpointsToSend = this.model.getInstructionBreakpoints().filter((fbp) => fbp.enabled && this.model.areBreakpointsActivated());
    await sendToOneOrAllSessions(this.model, session, async (s) => {
      if (s.capabilities.supportsInstructionBreakpoints && !s.configuration.noDebug) {
        await s.sendInstructionBreakpoints(breakpointsToSend);
      }
    });
  }
  sendExceptionBreakpoints(session) {
    return sendToOneOrAllSessions(this.model, session, async (s) => {
      const enabledExceptionBps = this.model.getExceptionBreakpointsForSession(s.getId()).filter((exb) => exb.enabled);
      if (s.capabilities.supportsConfigurationDoneRequest && (!s.capabilities.exceptionBreakpointFilters || s.capabilities.exceptionBreakpointFilters.length === 0)) {
        return;
      }
      if (!s.configuration.noDebug) {
        await s.sendExceptionBreakpoints(enabledExceptionBps);
      }
    });
  }
  onFileChanges(fileChangesEvent) {
    const toRemove = this.model.getBreakpoints().filter((bp) => fileChangesEvent.contains(bp.originalUri, FileChangeType.DELETED));
    if (toRemove.length) {
      this.model.removeBreakpoints(toRemove);
    }
    const toSend = [];
    for (const uri2 of this.breakpointsToSendOnResourceSaved) {
      if (fileChangesEvent.contains(uri2, FileChangeType.UPDATED)) {
        toSend.push(uri2);
      }
    }
    for (const uri2 of toSend) {
      this.breakpointsToSendOnResourceSaved.delete(uri2);
      this.sendBreakpoints(uri2, true);
    }
  }
  async runTo(uri2, lineNumber, column) {
    let breakpointToRemove;
    let threadToContinue = this.getViewModel().focusedThread;
    const addTempBreakPoint = async () => {
      const bpExists = !!this.getModel().getBreakpoints({ column, lineNumber, uri: uri2 }).length;
      if (!bpExists) {
        const addResult = await this.addAndValidateBreakpoints(uri2, lineNumber, column);
        if (addResult.thread) {
          threadToContinue = addResult.thread;
        }
        if (addResult.breakpoint) {
          breakpointToRemove = addResult.breakpoint;
        }
      }
      return { threadToContinue, breakpointToRemove };
    };
    const removeTempBreakPoint = (state) => {
      if (state === State.Stopped || state === State.Inactive) {
        if (breakpointToRemove) {
          this.removeBreakpoints(breakpointToRemove.getId());
        }
        return true;
      }
      return false;
    };
    await addTempBreakPoint();
    if (this.state === State.Inactive) {
      const { launch, name, getConfig } = this.getConfigurationManager().selectedConfiguration;
      const config = await getConfig();
      const configOrName = config ? Object.assign(deepClone(config), {}) : name;
      const listener = this.onDidChangeState((state) => {
        if (removeTempBreakPoint(state)) {
          listener.dispose();
        }
      });
      await this.startDebugging(launch, configOrName, void 0, true);
    }
    if (this.state === State.Stopped) {
      const focusedSession = this.getViewModel().focusedSession;
      if (!focusedSession || !threadToContinue) {
        return;
      }
      const listener = threadToContinue.session.onDidChangeState(() => {
        if (removeTempBreakPoint(focusedSession.state)) {
          listener.dispose();
        }
      });
      await threadToContinue.continue();
    }
  }
  async addAndValidateBreakpoints(uri2, lineNumber, column) {
    const debugModel = this.getModel();
    const viewModel = this.getViewModel();
    const breakpoints = await this.addBreakpoints(uri2, [{ lineNumber, column }], false);
    const breakpoint = breakpoints?.[0];
    if (!breakpoint) {
      return { breakpoint: void 0, thread: viewModel.focusedThread };
    }
    if (!breakpoint.verified) {
      let listener;
      await raceTimeout(new Promise((resolve) => {
        listener = debugModel.onDidChangeBreakpoints(() => {
          if (breakpoint.verified) {
            resolve();
          }
        });
      }), 2e3);
      listener.dispose();
    }
    let Score;
    ((Score2) => {
      Score2[Score2["Focused"] = 0] = "Focused";
      Score2[Score2["Verified"] = 1] = "Verified";
      Score2[Score2["VerifiedAndPausedInFile"] = 2] = "VerifiedAndPausedInFile";
      Score2[Score2["VerifiedAndFocused"] = 3] = "VerifiedAndFocused";
    })(Score || (Score = {}));
    let bestThread = viewModel.focusedThread;
    let bestScore = 0 /* Focused */;
    for (const sessionId of breakpoint.sessionsThatVerified) {
      const session = debugModel.getSession(sessionId);
      if (!session) {
        continue;
      }
      const threads = session.getAllThreads().filter((t) => t.stopped);
      if (bestScore < 3 /* VerifiedAndFocused */) {
        if (viewModel.focusedThread && threads.includes(viewModel.focusedThread)) {
          bestThread = viewModel.focusedThread;
          bestScore = 3 /* VerifiedAndFocused */;
        }
      }
      if (bestScore < 2 /* VerifiedAndPausedInFile */) {
        const pausedInThisFile = threads.find((t) => {
          const top = t.getTopStackFrame();
          return top && this.uriIdentityService.extUri.isEqual(top.source.uri, uri2);
        });
        if (pausedInThisFile) {
          bestThread = pausedInThisFile;
          bestScore = 2 /* VerifiedAndPausedInFile */;
        }
      }
      if (bestScore < 1 /* Verified */) {
        bestThread = threads[0];
        bestScore = 2 /* VerifiedAndPausedInFile */;
      }
    }
    return { thread: bestThread, breakpoint };
  }
};
DebugService = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IPaneCompositePartService),
  __decorateParam(2, IViewsService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, ILifecycleService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IExtensionService),
  __decorateParam(12, IFileService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IExtensionHostDebugService),
  __decorateParam(15, IActivityService),
  __decorateParam(16, ICommandService),
  __decorateParam(17, IQuickInputService),
  __decorateParam(18, IWorkspaceTrustRequestService),
  __decorateParam(19, IUriIdentityService),
  __decorateParam(20, ITestService)
], DebugService);
function getStackFrameThreadAndSessionToFocus(model, stackFrame, thread, session, avoidSession) {
  if (!session) {
    if (stackFrame || thread) {
      session = stackFrame ? stackFrame.thread.session : thread.session;
    } else {
      const sessions = model.getSessions();
      const stoppedSession = sessions.find((s) => s.state === State.Stopped);
      session = stoppedSession || sessions.find((s) => s !== avoidSession && s !== avoidSession?.parentSession) || (sessions.length ? sessions[0] : void 0);
    }
  }
  if (!thread) {
    if (stackFrame) {
      thread = stackFrame.thread;
    } else {
      const threads = session ? session.getAllThreads() : void 0;
      const stoppedThread = threads && threads.find((t) => t.stopped);
      thread = stoppedThread || (threads && threads.length ? threads[0] : void 0);
    }
  }
  if (!stackFrame && thread) {
    stackFrame = thread.getTopStackFrame();
  }
  return { session, thread, stackFrame };
}
async function sendToOneOrAllSessions(model, session, send) {
  if (session) {
    await send(session);
  } else {
    await Promise.all(model.getSessions().map((s) => send(s)));
  }
}
export {
  DebugService,
  getStackFrameThreadAndSessionToFocus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIsIHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNFcnJvcldpdGhBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSwgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5cbmltcG9ydCBzZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBVUkksIFVSSSBhcyB1cmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWJ1Zy9jb21tb24vZXh0ZW5zaW9uSG9zdERlYnVnLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlVHlwZSwgRmlsZUNoYW5nZXNFdmVudCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JzT3JkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUFjdGl2aXR5U2VydmljZSwgTnVtYmVyQmFkZ2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVklFV0xFVF9JRCBhcyBFWFBMT1JFUl9WSUVXTEVUX0lEIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElUZXN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Rlc3RpbmcvY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENBTExTVEFDS19WSUVXX0lELCBDT05URVhUX0JSRUFLUE9JTlRTX0VYSVNULCBDT05URVhUX0RFQlVHX1NUQVRFLCBDT05URVhUX0RFQlVHX1RZUEUsIENPTlRFWFRfREVCVUdfVVgsIENPTlRFWFRfRElTQVNTRU1CTFlfVklFV19GT0NVUywgQ09OVEVYVF9IQVNfREVCVUdHRUQsIENPTlRFWFRfSU5fREVCVUdfTU9ERSwgREVCVUdfTUVNT1JZX1NDSEVNRSwgREVCVUdfU0NIRU1FLCBJQWRhcHRlck1hbmFnZXIsIElCcmVha3BvaW50LCBJQnJlYWtwb2ludERhdGEsIElCcmVha3BvaW50VXBkYXRlRGF0YSwgSUNvbXBvdW5kLCBJQ29uZmlnLCBJQ29uZmlndXJhdGlvbk1hbmFnZXIsIElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElEZWJ1Z01vZGVsLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBJRGVidWdTZXNzaW9uT3B0aW9ucywgSUVuYWJsZW1lbnQsIElFeGNlcHRpb25CcmVha3BvaW50LCBJR2xvYmFsQ29uZmlnLCBJR3Vlc3NlZERlYnVnZ2VyLCBJTGF1bmNoLCBJU3RhY2tGcmFtZSwgSVRocmVhZCwgSVZpZXdNb2RlbCwgUkVQTF9WSUVXX0lELCBTdGF0ZSwgVklFV0xFVF9JRCwgZGVidWdnZXJEaXNhYmxlZE1lc3NhZ2UsIGdldFN0YXRlTGFiZWwgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgRGVidWdDb21wb3VuZFJvb3QgfSBmcm9tICcuLi9jb21tb24vZGVidWdDb21wb3VuZFJvb3QuanMnO1xuaW1wb3J0IHsgQnJlYWtwb2ludCwgRGF0YUJyZWFrcG9pbnQsIERlYnVnTW9kZWwsIEZ1bmN0aW9uQnJlYWtwb2ludCwgSURhdGFCcmVha3BvaW50T3B0aW9ucywgSUZ1bmN0aW9uQnJlYWtwb2ludE9wdGlvbnMsIElJbnN0cnVjdGlvbkJyZWFrcG9pbnRPcHRpb25zLCBJbnN0cnVjdGlvbkJyZWFrcG9pbnQgfSBmcm9tICcuLi9jb21tb24vZGVidWdNb2RlbC5qcyc7XG5pbXBvcnQgeyBTb3VyY2UgfSBmcm9tICcuLi9jb21tb24vZGVidWdTb3VyY2UuanMnO1xuaW1wb3J0IHsgRGVidWdTdG9yYWdlLCBJQ2hvc2VuRW52aXJvbm1lbnQgfSBmcm9tICcuLi9jb21tb24vZGVidWdTdG9yYWdlLmpzJztcbmltcG9ydCB7IERlYnVnVGVsZW1ldHJ5IH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGdldEV4dGVuc2lvbkhvc3REZWJ1Z1Nlc3Npb24sIHNhdmVBbGxCZWZvcmVEZWJ1Z1N0YXJ0IH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnVXRpbHMuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnVmlld01vZGVsLmpzJztcbmltcG9ydCB7IERpc2Fzc2VtYmx5Vmlld0lucHV0IH0gZnJvbSAnLi4vY29tbW9uL2Rpc2Fzc2VtYmx5Vmlld0lucHV0LmpzJztcbmltcG9ydCB7IEFkYXB0ZXJNYW5hZ2VyIH0gZnJvbSAnLi9kZWJ1Z0FkYXB0ZXJNYW5hZ2VyLmpzJztcbmltcG9ydCB7IERFQlVHX0NPTkZJR1VSRV9DT01NQU5EX0lELCBERUJVR19DT05GSUdVUkVfTEFCRUwgfSBmcm9tICcuL2RlYnVnQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbk1hbmFnZXIgfSBmcm9tICcuL2RlYnVnQ29uZmlndXJhdGlvbk1hbmFnZXIuanMnO1xuaW1wb3J0IHsgRGVidWdNZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuL2RlYnVnTWVtb3J5LmpzJztcbmltcG9ydCB7IERlYnVnU2Vzc2lvbiB9IGZyb20gJy4vZGVidWdTZXNzaW9uLmpzJztcbmltcG9ydCB7IERlYnVnVGFza1J1bm5lciwgVGFza1J1blJlc3VsdCB9IGZyb20gJy4vZGVidWdUYXNrUnVubmVyLmpzJztcblxuZXhwb3J0IGNsYXNzIERlYnVnU2VydmljZSBpbXBsZW1lbnRzIElEZWJ1Z1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN0YXRlOiBFbWl0dGVyPFN0YXRlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWROZXdTZXNzaW9uOiBFbWl0dGVyPElEZWJ1Z1Nlc3Npb24+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxOZXdTZXNzaW9uOiBFbWl0dGVyPElEZWJ1Z1Nlc3Npb24+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEVuZFNlc3Npb246IEVtaXR0ZXI8eyBzZXNzaW9uOiBJRGVidWdTZXNzaW9uOyByZXN0YXJ0OiBib29sZWFuIH0+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlc3RhcnRpbmdTZXNzaW9ucyA9IG5ldyBTZXQ8SURlYnVnU2Vzc2lvbj4oKTtcblx0cHJpdmF0ZSBkZWJ1Z1N0b3JhZ2U6IERlYnVnU3RvcmFnZTtcblx0cHJpdmF0ZSBtb2RlbDogRGVidWdNb2RlbDtcblx0cHJpdmF0ZSB2aWV3TW9kZWw6IFZpZXdNb2RlbDtcblx0cHJpdmF0ZSB0ZWxlbWV0cnk6IERlYnVnVGVsZW1ldHJ5O1xuXHRwcml2YXRlIHRhc2tSdW5uZXI6IERlYnVnVGFza1J1bm5lcjtcblx0cHJpdmF0ZSBjb25maWd1cmF0aW9uTWFuYWdlcjogQ29uZmlndXJhdGlvbk1hbmFnZXI7XG5cdHByaXZhdGUgYWRhcHRlck1hbmFnZXI6IEFkYXB0ZXJNYW5hZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIGRlYnVnVHlwZSE6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgZGVidWdTdGF0ZSE6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgaW5EZWJ1Z01vZGUhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBkZWJ1Z1V4ITogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSBoYXNEZWJ1Z2dlZCE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGJyZWFrcG9pbnRzRXhpc3QhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBkaXNhc3NlbWJseVZpZXdGb2N1cyE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGJyZWFrcG9pbnRzVG9TZW5kT25SZXNvdXJjZVNhdmVkOiBTZXQ8VVJJPjtcblx0cHJpdmF0ZSBpbml0aWFsaXppbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaW5pdGlhbGl6aW5nT3B0aW9uczogSURlYnVnU2Vzc2lvbk9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJldmlvdXNTdGF0ZTogU3RhdGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2Vzc2lvbkNhbmNlbGxhdGlvblRva2VucyA9IG5ldyBNYXA8c3RyaW5nLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKTtcblx0cHJpdmF0ZSBhY3Rpdml0eTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY2hvc2VuRW52aXJvbm1lbnRzOiBSZWNvcmQ8c3RyaW5nLCBJQ2hvc2VuRW52aXJvbm1lbnQ+O1xuXHRwcml2YXRlIGhhdmVEb25lTGF6eVNldHVwID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYW5lQ29tcG9zaXRlU2VydmljZTogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlOiBJRXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVRlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVzdFNlcnZpY2U6IElUZXN0U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5icmVha3BvaW50c1RvU2VuZE9uUmVzb3VyY2VTYXZlZCA9IG5ldyBTZXQ8VVJJPigpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPFN0YXRlPigpKTtcblx0XHR0aGlzLl9vbkRpZE5ld1Nlc3Npb24gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJRGVidWdTZXNzaW9uPigpKTtcblx0XHR0aGlzLl9vbldpbGxOZXdTZXNzaW9uID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SURlYnVnU2Vzc2lvbj4oKSk7XG5cdFx0dGhpcy5fb25EaWRFbmRTZXNzaW9uID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXIoKSk7XG5cblx0XHR0aGlzLmFkYXB0ZXJNYW5hZ2VyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZGFwdGVyTWFuYWdlciwge1xuXHRcdFx0b25EaWROZXdTZXNzaW9uOiB0aGlzLm9uRGlkTmV3U2Vzc2lvbixcblx0XHRcdGNvbmZpZ3VyYXRpb25NYW5hZ2VyOiAoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLFxuXHRcdH0pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuYWRhcHRlck1hbmFnZXIpO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpZ3VyYXRpb25NYW5hZ2VyLCB0aGlzLmFkYXB0ZXJNYW5hZ2VyKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdTdG9yYWdlKSk7XG5cblx0XHR0aGlzLmNob3NlbkVudmlyb25tZW50cyA9IHRoaXMuZGVidWdTdG9yYWdlLmxvYWRDaG9zZW5FbnZpcm9ubWVudHMoKTtcblxuXHRcdHRoaXMubW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlYnVnTW9kZWwsIHRoaXMuZGVidWdTdG9yYWdlKTtcblx0XHR0aGlzLnRlbGVtZXRyeSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdUZWxlbWV0cnksIHRoaXMubW9kZWwpO1xuXG5cdFx0dGhpcy52aWV3TW9kZWwgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgVmlld01vZGVsKGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy50YXNrUnVubmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z1Rhc2tSdW5uZXIpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4gdGhpcy5vbkZpbGVDaGFuZ2VzKGUpKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKHRoaXMuZGlzcG9zZSwgdGhpcykpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5leHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLm9uQXR0YWNoU2Vzc2lvbihldmVudCA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5tb2RlbC5nZXRTZXNzaW9uKGV2ZW50LnNlc3Npb25JZCwgdHJ1ZSk7XG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHQvLyBFSCB3YXMgc3RhcnRlZCBpbiBkZWJ1ZyBtb2RlIC0+IGF0dGFjaCB0byBpdFxuXHRcdFx0XHRzZXNzaW9uLmNvbmZpZ3VyYXRpb24ucmVxdWVzdCA9ICdhdHRhY2gnO1xuXHRcdFx0XHRzZXNzaW9uLmNvbmZpZ3VyYXRpb24ucG9ydCA9IGV2ZW50LnBvcnQ7XG5cdFx0XHRcdHNlc3Npb24uc2V0U3ViSWQoZXZlbnQuc3ViSWQpO1xuXHRcdFx0XHR0aGlzLmxhdW5jaE9yQXR0YWNoVG9TZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2Uub25UZXJtaW5hdGVTZXNzaW9uKGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLm1vZGVsLmdldFNlc3Npb24oZXZlbnQuc2Vzc2lvbklkKTtcblx0XHRcdGlmIChzZXNzaW9uICYmIHNlc3Npb24uc3ViSWQgPT09IGV2ZW50LnN1YklkKSB7XG5cdFx0XHRcdHNlc3Npb24uZGlzY29ubmVjdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMudmlld01vZGVsLm9uRGlkRm9jdXNTdGFja0ZyYW1lKCgpID0+IHtcblx0XHRcdHRoaXMub25TdGF0ZUNoYW5nZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnZpZXdNb2RlbC5vbkRpZEZvY3VzU2Vzc2lvbigoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0dGhpcy5vblN0YXRlQ2hhbmdlKCk7XG5cblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuc2V0RXhjZXB0aW9uQnJlYWtwb2ludEZhbGxiYWNrU2Vzc2lvbihzZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChFdmVudC5hbnkodGhpcy5hZGFwdGVyTWFuYWdlci5vbkRpZFJlZ2lzdGVyRGVidWdnZXIsIHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIub25EaWRTZWxlY3RDb25maWd1cmF0aW9uKSgoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWJ1Z1V4VmFsdWUgPSAodGhpcy5zdGF0ZSAhPT0gU3RhdGUuSW5hY3RpdmUgfHwgKHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIuZ2V0QWxsQ29uZmlndXJhdGlvbnMoKS5sZW5ndGggPiAwICYmIHRoaXMuYWRhcHRlck1hbmFnZXIuaGFzRW5hYmxlZERlYnVnZ2VycygpKSkgPyAnZGVmYXVsdCcgOiAnc2ltcGxlJztcblx0XHRcdHRoaXMuZGVidWdVeC5zZXQoZGVidWdVeFZhbHVlKTtcblx0XHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlRGVidWdVeFN0YXRlKGRlYnVnVXhWYWx1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubW9kZWwub25EaWRDaGFuZ2VDYWxsU3RhY2soKCkgPT4ge1xuXHRcdFx0Y29uc3QgbnVtYmVyT2ZTZXNzaW9ucyA9IHRoaXMubW9kZWwuZ2V0U2Vzc2lvbnMoKS5maWx0ZXIocyA9PiAhcy5wYXJlbnRTZXNzaW9uKS5sZW5ndGg7XG5cdFx0XHR0aGlzLmFjdGl2aXR5Py5kaXNwb3NlKCk7XG5cdFx0XHRpZiAobnVtYmVyT2ZTZXNzaW9ucyA+IDApIHtcblx0XHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeVZpZXdJZChDQUxMU1RBQ0tfVklFV19JRCk7XG5cdFx0XHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0dGhpcy5hY3Rpdml0eSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dWaWV3Q29udGFpbmVyQWN0aXZpdHkodmlld0NvbnRhaW5lci5pZCwgeyBiYWRnZTogbmV3IE51bWJlckJhZGdlKG51bWJlck9mU2Vzc2lvbnMsIG4gPT4gbiA9PT0gMSA/IG5scy5sb2NhbGl6ZSgnMWFjdGl2ZVNlc3Npb24nLCBcIjEgYWN0aXZlIHNlc3Npb25cIikgOiBubHMubG9jYWxpemUoJ25BY3RpdmVTZXNzaW9ucycsIFwiezB9IGFjdGl2ZSBzZXNzaW9uc1wiLCBuKSkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChlZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdFx0aWYgKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yID09PSBEaXNhc3NlbWJseVZpZXdJbnB1dC5pbnN0YW5jZSkge1xuXHRcdFx0XHRcdHRoaXMuZGlzYXNzZW1ibHlWaWV3Rm9jdXMuc2V0KHRydWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFRoaXMga2V5IGNhbiBiZSBpbml0aWFsaXplZCBhIHRpY2sgYWZ0ZXIgdGhpcyBldmVudCBpcyBmaXJlZFxuXHRcdFx0XHRcdHRoaXMuZGlzYXNzZW1ibHlWaWV3Rm9jdXM/LnJlc2V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbkJlZm9yZVNodXRkb3duKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvclNlcnZpY2UuZWRpdG9ycykge1xuXHRcdFx0XHQvLyBFZGl0b3JzIHdpbGwgbm90IGJlIHZhbGlkIG9uIHdpbmRvdyByZWxvYWQsIHNvIGNsb3NlIHRoZW0uXG5cdFx0XHRcdGlmIChlZGl0b3IucmVzb3VyY2U/LnNjaGVtZSA9PT0gREVCVUdfTUVNT1JZX1NDSEVNRSkge1xuXHRcdFx0XHRcdGVkaXRvci5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChleHRlbnNpb25TZXJ2aWNlLm9uV2lsbFN0b3AoZXZ0ID0+IHtcblx0XHRcdGV2dC52ZXRvKFxuXHRcdFx0XHR0aGlzLm1vZGVsLmdldFNlc3Npb25zKCkubGVuZ3RoID4gMCxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhY3RpdmUgZGVidWcgc2Vzc2lvbicsICdBIGRlYnVnIHNlc3Npb24gaXMgc3RpbGwgcnVubmluZyB0aGF0IHdvdWxkIHRlcm1pbmF0ZS4nKSxcblx0XHRcdCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5pbml0Q29udGV4dEtleXMoY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0Q29udGV4dEtleXMoY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IHZvaWQge1xuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZGVidWdUeXBlID0gQ09OVEVYVF9ERUJVR19UWVBFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdHRoaXMuZGVidWdTdGF0ZSA9IENPTlRFWFRfREVCVUdfU1RBVEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0dGhpcy5oYXNEZWJ1Z2dlZCA9IENPTlRFWFRfSEFTX0RFQlVHR0VELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdHRoaXMuaW5EZWJ1Z01vZGUgPSBDT05URVhUX0lOX0RFQlVHX01PREUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0dGhpcy5kZWJ1Z1V4ID0gQ09OVEVYVF9ERUJVR19VWC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0XHR0aGlzLmRlYnVnVXguc2V0KHRoaXMuZGVidWdTdG9yYWdlLmxvYWREZWJ1Z1V4U3RhdGUoKSk7XG5cdFx0XHRcdHRoaXMuYnJlYWtwb2ludHNFeGlzdCA9IENPTlRFWFRfQlJFQUtQT0lOVFNfRVhJU1QuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0Ly8gTmVlZCB0byBzZXQgZGlzYXNzZW1ibHlWaWV3Rm9jdXMgaGVyZSB0byBtYWtlIGl0IGluIHRoZSBzYW1lIGNvbnRleHQgYXMgdGhlIGRlYnVnIGV2ZW50IGhhbmRsZXJzXG5cdFx0XHRcdHRoaXMuZGlzYXNzZW1ibHlWaWV3Rm9jdXMgPSBDT05URVhUX0RJU0FTU0VNQkxZX1ZJRVdfRk9DVVMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzZXRCcmVha3BvaW50c0V4aXN0Q29udGV4dCA9ICgpID0+IHRoaXMuYnJlYWtwb2ludHNFeGlzdC5zZXQoISEodGhpcy5tb2RlbC5nZXRCcmVha3BvaW50cygpLmxlbmd0aCB8fCB0aGlzLm1vZGVsLmdldERhdGFCcmVha3BvaW50cygpLmxlbmd0aCB8fCB0aGlzLm1vZGVsLmdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKS5sZW5ndGgpKTtcblx0XHRcdHNldEJyZWFrcG9pbnRzRXhpc3RDb250ZXh0KCk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMoKCkgPT4gc2V0QnJlYWtwb2ludHNFeGlzdENvbnRleHQoKSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0TW9kZWwoKTogSURlYnVnTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsO1xuXHR9XG5cblx0Z2V0Vmlld01vZGVsKCk6IElWaWV3TW9kZWwge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbDtcblx0fVxuXG5cdGdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCk6IElDb25maWd1cmF0aW9uTWFuYWdlciB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXI7XG5cdH1cblxuXHRnZXRBZGFwdGVyTWFuYWdlcigpOiBJQWRhcHRlck1hbmFnZXIge1xuXHRcdHJldHVybiB0aGlzLmFkYXB0ZXJNYW5hZ2VyO1xuXHR9XG5cblx0c291cmNlSXNOb3RBdmFpbGFibGUodXJpOiB1cmkpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnNvdXJjZUlzTm90QXZhaWxhYmxlKHVyaSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0Ly8tLS0tIHN0YXRlIG1hbmFnZW1lbnRcblxuXHRnZXQgc3RhdGUoKTogU3RhdGUge1xuXHRcdGNvbnN0IGZvY3VzZWRTZXNzaW9uID0gdGhpcy52aWV3TW9kZWwuZm9jdXNlZFNlc3Npb247XG5cdFx0aWYgKGZvY3VzZWRTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gZm9jdXNlZFNlc3Npb24uc3RhdGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6aW5nID8gU3RhdGUuSW5pdGlhbGl6aW5nIDogU3RhdGUuSW5hY3RpdmU7XG5cdH1cblxuXHRnZXQgaW5pdGlhbGl6aW5nT3B0aW9ucygpOiBJRGVidWdTZXNzaW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2luaXRpYWxpemluZ09wdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIHN0YXJ0SW5pdGlhbGl6aW5nU3RhdGUob3B0aW9ucz86IElEZWJ1Z1Nlc3Npb25PcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmluaXRpYWxpemluZykge1xuXHRcdFx0dGhpcy5pbml0aWFsaXppbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy5faW5pdGlhbGl6aW5nT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0XHR0aGlzLm9uU3RhdGVDaGFuZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVuZEluaXRpYWxpemluZ1N0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmluaXRpYWxpemluZykge1xuXHRcdFx0dGhpcy5pbml0aWFsaXppbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2luaXRpYWxpemluZ09wdGlvbnMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLm9uU3RhdGVDaGFuZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbFRva2VucyhpZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGlkKSB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IHRoaXMuc2Vzc2lvbkNhbmNlbGxhdGlvblRva2Vucy5nZXQoaWQpO1xuXHRcdFx0aWYgKHRva2VuKSB7XG5cdFx0XHRcdHRva2VuLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLnNlc3Npb25DYW5jZWxsYXRpb25Ub2tlbnMuZGVsZXRlKGlkKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZXNzaW9uQ2FuY2VsbGF0aW9uVG9rZW5zLmZvckVhY2godCA9PiB0LmNhbmNlbCgpKTtcblx0XHRcdHRoaXMuc2Vzc2lvbkNhbmNlbGxhdGlvblRva2Vucy5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25TdGF0ZUNoYW5nZSgpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuc3RhdGU7XG5cdFx0aWYgKHRoaXMucHJldmlvdXNTdGF0ZSAhPT0gc3RhdGUpIHtcblx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdFx0dGhpcy5kZWJ1Z1N0YXRlLnNldChnZXRTdGF0ZUxhYmVsKHN0YXRlKSk7XG5cdFx0XHRcdHRoaXMuaW5EZWJ1Z01vZGUuc2V0KHN0YXRlICE9PSBTdGF0ZS5JbmFjdGl2ZSk7XG5cdFx0XHRcdC8vIE9ubHkgc2hvdyB0aGUgc2ltcGxlIHV4IGlmIGRlYnVnIGlzIG5vdCB5ZXQgc3RhcnRlZCBhbmQgaWYgbm8gbGF1bmNoLmpzb24gZXhpc3RzXG5cdFx0XHRcdGNvbnN0IGRlYnVnVXhWYWx1ZSA9ICgoc3RhdGUgIT09IFN0YXRlLkluYWN0aXZlICYmIHN0YXRlICE9PSBTdGF0ZS5Jbml0aWFsaXppbmcpIHx8ICh0aGlzLmFkYXB0ZXJNYW5hZ2VyLmhhc0VuYWJsZWREZWJ1Z2dlcnMoKSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLnNlbGVjdGVkQ29uZmlndXJhdGlvbi5uYW1lKSkgPyAnZGVmYXVsdCcgOiAnc2ltcGxlJztcblx0XHRcdFx0dGhpcy5kZWJ1Z1V4LnNldChkZWJ1Z1V4VmFsdWUpO1xuXHRcdFx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZURlYnVnVXhTdGF0ZShkZWJ1Z1V4VmFsdWUpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLnByZXZpb3VzU3RhdGUgPSBzdGF0ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZmlyZShzdGF0ZSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlU3RhdGUoKTogRXZlbnQ8U3RhdGU+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5ldmVudDtcblx0fVxuXG5cdGdldCBvbkRpZE5ld1Nlc3Npb24oKTogRXZlbnQ8SURlYnVnU2Vzc2lvbj4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZE5ld1Nlc3Npb24uZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25XaWxsTmV3U2Vzc2lvbigpOiBFdmVudDxJRGVidWdTZXNzaW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uV2lsbE5ld1Nlc3Npb24uZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRFbmRTZXNzaW9uKCk6IEV2ZW50PHsgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbjsgcmVzdGFydDogYm9vbGVhbiB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRW5kU2Vzc2lvbi5ldmVudDtcblx0fVxuXG5cdHByaXZhdGUgbGF6eVNldHVwKCkge1xuXHRcdGlmICghdGhpcy5oYXZlRG9uZUxhenlTZXR1cCkge1xuXHRcdFx0Ly8gUmVnaXN0ZXJpbmcgZnMgcHJvdmlkZXJzIGlzIHNsb3dcblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNTk4ODZcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihERUJVR19NRU1PUllfU0NIRU1FLCB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRGVidWdNZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIodGhpcykpKSk7XG5cdFx0XHR0aGlzLmhhdmVEb25lTGF6eVNldHVwID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHQvLy0tLS0gbGlmZSBjeWNsZSBtYW5hZ2VtZW50XG5cblx0LyoqXG5cdCAqIG1haW4gZW50cnkgcG9pbnRcblx0ICogcHJvcGVybHkgbWFuYWdlcyBjb21wb3VuZHMsIGNoZWNrcyBmb3IgZXJyb3JzIGFuZCBoYW5kbGVzIHRoZSBpbml0aWFsaXppbmcgc3RhdGUuXG5cdCAqL1xuXHRhc3luYyBzdGFydERlYnVnZ2luZyhsYXVuY2g6IElMYXVuY2ggfCB1bmRlZmluZWQsIGNvbmZpZ09yTmFtZT86IElDb25maWcgfCBzdHJpbmcsIG9wdGlvbnM/OiBJRGVidWdTZXNzaW9uT3B0aW9ucywgc2F2ZUJlZm9yZVN0YXJ0ID0gIW9wdGlvbnM/LnBhcmVudFNlc3Npb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBtZXNzYWdlID0gb3B0aW9ucyAmJiBvcHRpb25zLm5vRGVidWcgPyBubHMubG9jYWxpemUoJ3J1blRydXN0JywgXCJSdW5uaW5nIGV4ZWN1dGVzIGJ1aWxkIHRhc2tzIGFuZCBwcm9ncmFtIGNvZGUgZnJvbSB5b3VyIHdvcmtzcGFjZS5cIikgOiBubHMubG9jYWxpemUoJ2RlYnVnVHJ1c3QnLCBcIkRlYnVnZ2luZyBleGVjdXRlcyBidWlsZCB0YXNrcyBhbmQgcHJvZ3JhbSBjb2RlIGZyb20geW91ciB3b3Jrc3BhY2UuXCIpO1xuXHRcdGNvbnN0IHRydXN0ID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdCh7IG1lc3NhZ2UgfSk7XG5cdFx0aWYgKCF0cnVzdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMubGF6eVNldHVwKCk7XG5cdFx0dGhpcy5zdGFydEluaXRpYWxpemluZ1N0YXRlKG9wdGlvbnMpO1xuXHRcdHRoaXMuaGFzRGVidWdnZWQuc2V0KHRydWUpO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBtYWtlIHN1cmUgdG8gc2F2ZSBhbGwgZmlsZXMgYW5kIHRoYXQgdGhlIGNvbmZpZ3VyYXRpb24gaXMgdXAgdG8gZGF0ZVxuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudCgnb25EZWJ1ZycpO1xuXHRcdFx0aWYgKHNhdmVCZWZvcmVTdGFydCkge1xuXHRcdFx0XHRhd2FpdCBzYXZlQWxsQmVmb3JlRGVidWdTdGFydCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmVkaXRvclNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0XHRsZXQgY29uZmlnOiBJQ29uZmlnIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGNvbXBvdW5kOiBJQ29tcG91bmQgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWNvbmZpZ09yTmFtZSkge1xuXHRcdFx0XHRjb25maWdPck5hbWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLnNlbGVjdGVkQ29uZmlndXJhdGlvbi5uYW1lO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBjb25maWdPck5hbWUgPT09ICdzdHJpbmcnICYmIGxhdW5jaCkge1xuXHRcdFx0XHRjb25maWcgPSBsYXVuY2guZ2V0Q29uZmlndXJhdGlvbihjb25maWdPck5hbWUpO1xuXHRcdFx0XHRjb21wb3VuZCA9IGxhdW5jaC5nZXRDb21wb3VuZChjb25maWdPck5hbWUpO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgY29uZmlnT3JOYW1lICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25maWcgPSBjb25maWdPck5hbWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb21wb3VuZCkge1xuXHRcdFx0XHQvLyB3ZSBhcmUgc3RhcnRpbmcgYSBjb21wb3VuZCBkZWJ1ZywgZmlyc3QgZG8gc29tZSBlcnJvciBjaGVja2luZyBhbmQgdGhhbiBzdGFydCBlYWNoIGNvbmZpZ3VyYXRpb24gaW4gdGhlIGNvbXBvdW5kXG5cdFx0XHRcdGlmICghY29tcG91bmQuY29uZmlndXJhdGlvbnMpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKHsga2V5OiAnY29tcG91bmRNdXN0SGF2ZUNvbmZpZ3VyYXRpb25zJywgY29tbWVudDogWydjb21wb3VuZCBpbmRpY2F0ZXMgYSBcImNvbXBvdW5kc1wiIGNvbmZpZ3VyYXRpb24gaXRlbScsICdcImNvbmZpZ3VyYXRpb25zXCIgaXMgYW4gYXR0cmlidXRlIGFuZCBzaG91bGQgbm90IGJlIGxvY2FsaXplZCddIH0sXG5cdFx0XHRcdFx0XHRcIkNvbXBvdW5kIG11c3QgaGF2ZSBcXFwiY29uZmlndXJhdGlvbnNcXFwiIGF0dHJpYnV0ZSBzZXQgaW4gb3JkZXIgdG8gc3RhcnQgbXVsdGlwbGUgY29uZmlndXJhdGlvbnMuXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29tcG91bmQucHJlTGF1bmNoVGFzaykge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2tSZXN1bHQgPSBhd2FpdCB0aGlzLnRhc2tSdW5uZXIucnVuVGFza0FuZENoZWNrRXJyb3JzKGxhdW5jaD8ud29ya3NwYWNlIHx8IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCksIGNvbXBvdW5kLnByZUxhdW5jaFRhc2spO1xuXHRcdFx0XHRcdGlmICh0YXNrUmVzdWx0ID09PSBUYXNrUnVuUmVzdWx0LkZhaWx1cmUpIHtcblx0XHRcdFx0XHRcdHRoaXMuZW5kSW5pdGlhbGl6aW5nU3RhdGUoKTtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbXBvdW5kLnN0b3BBbGwpIHtcblx0XHRcdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBjb21wb3VuZFJvb3Q6IG5ldyBEZWJ1Z0NvbXBvdW5kUm9vdCgpIH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB2YWx1ZXMgPSBhd2FpdCBQcm9taXNlLmFsbChjb21wb3VuZC5jb25maWd1cmF0aW9ucy5tYXAoY29uZmlnRGF0YSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbmFtZSA9IHR5cGVvZiBjb25maWdEYXRhID09PSAnc3RyaW5nJyA/IGNvbmZpZ0RhdGEgOiBjb25maWdEYXRhLm5hbWU7XG5cdFx0XHRcdFx0aWYgKG5hbWUgPT09IGNvbXBvdW5kLm5hbWUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxldCBsYXVuY2hGb3JOYW1lOiBJTGF1bmNoIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgY29uZmlnRGF0YSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhdW5jaGVzQ29udGFpbmluZ05hbWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLmdldExhdW5jaGVzKCkuZmlsdGVyKGwgPT4gISFsLmdldENvbmZpZ3VyYXRpb24obmFtZSkpO1xuXHRcdFx0XHRcdFx0aWYgKGxhdW5jaGVzQ29udGFpbmluZ05hbWUubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdGxhdW5jaEZvck5hbWUgPSBsYXVuY2hlc0NvbnRhaW5pbmdOYW1lWzBdO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChsYXVuY2ggJiYgbGF1bmNoZXNDb250YWluaW5nTmFtZS5sZW5ndGggPiAxICYmIGxhdW5jaGVzQ29udGFpbmluZ05hbWUuaW5kZXhPZihsYXVuY2gpID49IDApIHtcblx0XHRcdFx0XHRcdFx0Ly8gSWYgdGhlcmUgYXJlIG11bHRpcGxlIGxhdW5jaGVzIGNvbnRhaW5pbmcgdGhlIGNvbmZpZ3VyYXRpb24gZ2l2ZSBwcmlvcml0eSB0byB0aGUgY29uZmlndXJhdGlvbiBpbiB0aGUgY3VycmVudCBsYXVuY2hcblx0XHRcdFx0XHRcdFx0bGF1bmNoRm9yTmFtZSA9IGxhdW5jaDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsYXVuY2hlc0NvbnRhaW5pbmdOYW1lLmxlbmd0aCA9PT0gMCA/IG5scy5sb2NhbGl6ZSgnbm9Db25maWd1cmF0aW9uTmFtZUluV29ya3NwYWNlJywgXCJDb3VsZCBub3QgZmluZCBsYXVuY2ggY29uZmlndXJhdGlvbiAnezB9JyBpbiB0aGUgd29ya3NwYWNlLlwiLCBuYW1lKVxuXHRcdFx0XHRcdFx0XHRcdDogbmxzLmxvY2FsaXplKCdtdWx0aXBsZUNvbmZpZ3VyYXRpb25OYW1lc0luV29ya3NwYWNlJywgXCJUaGVyZSBhcmUgbXVsdGlwbGUgbGF1bmNoIGNvbmZpZ3VyYXRpb25zICd7MH0nIGluIHRoZSB3b3Jrc3BhY2UuIFVzZSBmb2xkZXIgbmFtZSB0byBxdWFsaWZ5IHRoZSBjb25maWd1cmF0aW9uLlwiLCBuYW1lKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjb25maWdEYXRhLmZvbGRlcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGF1bmNoZXNNYXRjaGluZ0NvbmZpZ0RhdGEgPSB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLmdldExhdW5jaGVzKCkuZmlsdGVyKGwgPT4gbC53b3Jrc3BhY2UgJiYgbC53b3Jrc3BhY2UubmFtZSA9PT0gY29uZmlnRGF0YS5mb2xkZXIgJiYgISFsLmdldENvbmZpZ3VyYXRpb24oY29uZmlnRGF0YS5uYW1lKSk7XG5cdFx0XHRcdFx0XHRpZiAobGF1bmNoZXNNYXRjaGluZ0NvbmZpZ0RhdGEubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdGxhdW5jaEZvck5hbWUgPSBsYXVuY2hlc01hdGNoaW5nQ29uZmlnRGF0YVswXTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ25vRm9sZGVyV2l0aE5hbWUnLCBcIkNhbiBub3QgZmluZCBmb2xkZXIgd2l0aCBuYW1lICd7MH0nIGZvciBjb25maWd1cmF0aW9uICd7MX0nIGluIGNvbXBvdW5kICd7Mn0nLlwiLCBjb25maWdEYXRhLmZvbGRlciwgY29uZmlnRGF0YS5uYW1lLCBjb21wb3VuZC5uYW1lKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvbihsYXVuY2hGb3JOYW1lLCBsYXVuY2hGb3JOYW1lIS5nZXRDb25maWd1cmF0aW9uKG5hbWUpLCBvcHRpb25zKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHZhbHVlcy5ldmVyeShzdWNjZXNzID0+ICEhc3VjY2Vzcyk7IC8vIENvbXBvdW5kIGxhdW5jaCBpcyBhIHN1Y2Nlc3Mgb25seSBpZiBlYWNoIGNvbmZpZ3VyYXRpb24gbGF1bmNoZWQgc3VjY2Vzc2Z1bGx5XG5cdFx0XHRcdHRoaXMuZW5kSW5pdGlhbGl6aW5nU3RhdGUoKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpZ09yTmFtZSAmJiAhY29uZmlnKSB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSAhIWxhdW5jaCA/IG5scy5sb2NhbGl6ZSgnY29uZmlnTWlzc2luZycsIFwiQ29uZmlndXJhdGlvbiAnezB9JyBpcyBtaXNzaW5nIGluICdsYXVuY2guanNvbicuXCIsIHR5cGVvZiBjb25maWdPck5hbWUgPT09ICdzdHJpbmcnID8gY29uZmlnT3JOYW1lIDogY29uZmlnT3JOYW1lLm5hbWUpIDpcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2xhdW5jaEpzb25Eb2VzTm90RXhpc3QnLCBcIidsYXVuY2guanNvbicgZG9lcyBub3QgZXhpc3QgZm9yIHBhc3NlZCB3b3Jrc3BhY2UgZm9sZGVyLlwiKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNyZWF0ZVNlc3Npb24obGF1bmNoLCBjb25maWcsIG9wdGlvbnMpO1xuXHRcdFx0dGhpcy5lbmRJbml0aWFsaXppbmdTdGF0ZSgpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIG1ha2Ugc3VyZSB0byBnZXQgb3V0IG9mIGluaXRpYWxpemluZyBzdGF0ZSwgYW5kIHByb3BhZ2F0ZSB0aGUgcmVzdWx0XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdHRoaXMuZW5kSW5pdGlhbGl6aW5nU3RhdGUoKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBnZXRzIHRoZSBkZWJ1Z2dlciBmb3IgdGhlIHR5cGUsIHJlc29sdmVzIGNvbmZpZ3VyYXRpb25zIGJ5IHByb3ZpZGVycywgc3Vic3RpdHV0ZXMgdmFyaWFibGVzIGFuZCBydW5zIHByZWxhdW5jaCB0YXNrc1xuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVTZXNzaW9uKGxhdW5jaDogSUxhdW5jaCB8IHVuZGVmaW5lZCwgY29uZmlnOiBJQ29uZmlnIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSURlYnVnU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHQvLyBXZSBrZWVwIHRoZSBkZWJ1ZyB0eXBlIGluIGEgc2VwYXJhdGUgdmFyaWFibGUgJ3R5cGUnIHNvIHRoYXQgYSBuby1mb2xkZXIgY29uZmlnIGhhcyBubyBhdHRyaWJ1dGVzLlxuXHRcdC8vIFN0b3JpbmcgdGhlIHR5cGUgaW4gdGhlIGNvbmZpZyB3b3VsZCBicmVhayBleHRlbnNpb25zIHRoYXQgYXNzdW1lIHRoYXQgdGhlIG5vLWZvbGRlciBjYXNlIGlzIGluZGljYXRlZCBieSBhbiBlbXB0eSBjb25maWcuXG5cdFx0bGV0IHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY29uZmlnKSB7XG5cdFx0XHR0eXBlID0gY29uZmlnLnR5cGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGEgbm8tZm9sZGVyIHdvcmtzcGFjZSBoYXMgbm8gbGF1bmNoLmNvbmZpZ1xuXHRcdFx0Y29uZmlnID0gT2JqZWN0LmNyZWF0ZShudWxsKSBhcyBJQ29uZmlnO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucyAmJiBvcHRpb25zLm5vRGVidWcpIHtcblx0XHRcdGNvbmZpZy5ub0RlYnVnID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubm9EZWJ1ZyA9PT0gJ3VuZGVmaW5lZCcgJiYgb3B0aW9ucy5wYXJlbnRTZXNzaW9uICYmIG9wdGlvbnMucGFyZW50U2Vzc2lvbi5jb25maWd1cmF0aW9uLm5vRGVidWcpIHtcblx0XHRcdGNvbmZpZy5ub0RlYnVnID0gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgdW5yZXNvbHZlZENvbmZpZyA9IGRlZXBDbG9uZShjb25maWcpO1xuXG5cdFx0bGV0IGd1ZXNzOiBJR3Vlc3NlZERlYnVnZ2VyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhY3RpdmVFZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRcdGlmICghdHlwZSkge1xuXHRcdFx0YWN0aXZlRWRpdG9yID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRcdGlmIChhY3RpdmVFZGl0b3IgJiYgYWN0aXZlRWRpdG9yLnJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IGNob3NlbiA9IHRoaXMuY2hvc2VuRW52aXJvbm1lbnRzW2FjdGl2ZUVkaXRvci5yZXNvdXJjZS50b1N0cmluZygpXTtcblx0XHRcdFx0aWYgKGNob3Nlbikge1xuXHRcdFx0XHRcdHR5cGUgPSBjaG9zZW4udHlwZTtcblx0XHRcdFx0XHRpZiAoY2hvc2VuLmR5bmFtaWNMYWJlbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZHluID0gYXdhaXQgdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5nZXREeW5hbWljQ29uZmlndXJhdGlvbnNCeVR5cGUoY2hvc2VuLnR5cGUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZm91bmQgPSBkeW4uZmluZChkID0+IGQubGFiZWwgPT09IGNob3Nlbi5keW5hbWljTGFiZWwpO1xuXHRcdFx0XHRcdFx0aWYgKGZvdW5kKSB7XG5cdFx0XHRcdFx0XHRcdGxhdW5jaCA9IGZvdW5kLmxhdW5jaDtcblx0XHRcdFx0XHRcdFx0T2JqZWN0LmFzc2lnbihjb25maWcsIGZvdW5kLmNvbmZpZyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdHlwZSkge1xuXHRcdFx0XHRndWVzcyA9IGF3YWl0IHRoaXMuYWRhcHRlck1hbmFnZXIuZ3Vlc3NEZWJ1Z2dlcihmYWxzZSk7XG5cdFx0XHRcdGlmIChndWVzcykge1xuXHRcdFx0XHRcdHR5cGUgPSBndWVzcy5kZWJ1Z2dlci50eXBlO1xuXHRcdFx0XHRcdGlmIChndWVzcy53aXRoQ29uZmlnKSB7XG5cdFx0XHRcdFx0XHRsYXVuY2ggPSBndWVzcy53aXRoQ29uZmlnLmxhdW5jaDtcblx0XHRcdFx0XHRcdE9iamVjdC5hc3NpZ24oY29uZmlnLCBndWVzcy53aXRoQ29uZmlnLmNvbmZpZyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5pdENhbmNlbGxhdGlvblRva2VuID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5zZXNzaW9uQ2FuY2VsbGF0aW9uVG9rZW5zLnNldChzZXNzaW9uSWQsIGluaXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cblx0XHRjb25zdCBjb25maWdCeVByb3ZpZGVycyA9IGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIucmVzb2x2ZUNvbmZpZ3VyYXRpb25CeVByb3ZpZGVycyhsYXVuY2ggJiYgbGF1bmNoLndvcmtzcGFjZSA/IGxhdW5jaC53b3Jrc3BhY2UudXJpIDogdW5kZWZpbmVkLCB0eXBlLCBjb25maWcsIGluaXRDYW5jZWxsYXRpb25Ub2tlbi50b2tlbik7XG5cdFx0Ly8gYSBmYWxzeSBjb25maWcgaW5kaWNhdGVzIGFuIGFib3J0ZWQgbGF1bmNoXG5cdFx0aWYgKGNvbmZpZ0J5UHJvdmlkZXJzICYmIGNvbmZpZ0J5UHJvdmlkZXJzLnR5cGUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGxldCByZXNvbHZlZENvbmZpZyA9IGF3YWl0IHRoaXMuc3Vic3RpdHV0ZVZhcmlhYmxlcyhsYXVuY2gsIGNvbmZpZ0J5UHJvdmlkZXJzKTtcblx0XHRcdFx0aWYgKCFyZXNvbHZlZENvbmZpZykge1xuXHRcdFx0XHRcdC8vIFVzZXIgY2FuY2VsbGVkIHJlc29sdmluZyBvZiBpbnRlcmFjdGl2ZSB2YXJpYWJsZXMsIHNpbGVudGx5IHJldHVyblxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpbml0Q2FuY2VsbGF0aW9uVG9rZW4udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHQvLyBVc2VyIGNhbmNlbGxlZCwgc2lsZW50bHkgcmV0dXJuXG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2hlY2sgZm9yIGNvbmN1cnJlbnQgc2Vzc2lvbnMgYmVmb3JlIHJ1bm5pbmcgcHJlTGF1bmNoVGFzayB0byBhdm9pZCBydW5uaW5nIHRoZSB0YXNrIGlmIHVzZXIgY2FuY2Vsc1xuXHRcdFx0XHRsZXQgdXNlckNvbmZpcm1lZENvbmN1cnJlbnRTZXNzaW9uID0gZmFsc2U7XG5cdFx0XHRcdGlmIChvcHRpb25zPy5zdGFydGVkQnlVc2VyICYmIHJlc29sdmVkQ29uZmlnICYmIHJlc29sdmVkQ29uZmlnLnN1cHByZXNzTXVsdGlwbGVTZXNzaW9uV2FybmluZyAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRcdC8vIENoZWNrIGlmIHRoZXJlJ3MgYWxyZWFkeSBhIHNlc3Npb24gd2l0aCB0aGUgc2FtZSBsYXVuY2ggY29uZmlndXJhdGlvblxuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nU2Vzc2lvbnMgPSB0aGlzLm1vZGVsLmdldFNlc3Npb25zKCk7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gbGF1bmNoPy53b3Jrc3BhY2U7XG5cblx0XHRcdFx0XHRjb25zdCBleGlzdGluZ1Nlc3Npb24gPSBleGlzdGluZ1Nlc3Npb25zLmZpbmQocyA9PlxuXHRcdFx0XHRcdFx0cy5jb25maWd1cmF0aW9uLm5hbWUgPT09IHJlc29sdmVkQ29uZmlnIS5uYW1lICYmXG5cdFx0XHRcdFx0XHRzLmNvbmZpZ3VyYXRpb24udHlwZSA9PT0gcmVzb2x2ZWRDb25maWchLnR5cGUgJiZcblx0XHRcdFx0XHRcdHMuY29uZmlndXJhdGlvbi5yZXF1ZXN0ID09PSByZXNvbHZlZENvbmZpZyEucmVxdWVzdCAmJlxuXHRcdFx0XHRcdFx0cy5yb290ID09PSB3b3Jrc3BhY2Vcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0aWYgKGV4aXN0aW5nU2Vzc2lvbikge1xuXHRcdFx0XHRcdFx0Ly8gVGhlcmUgaXMgYWxyZWFkeSBhIHNlc3Npb24gd2l0aCB0aGUgc2FtZSBjb25maWd1cmF0aW9uLCBwcm9tcHQgdXNlciBiZWZvcmUgcnVubmluZyBwcmVMYXVuY2hUYXNrXG5cdFx0XHRcdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmNvbmZpcm1Db25jdXJyZW50U2Vzc2lvbihleGlzdGluZ1Nlc3Npb24uZ2V0TGFiZWwoKSk7XG5cdFx0XHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR1c2VyQ29uZmlybWVkQ29uY3VycmVudFNlc3Npb24gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGxhdW5jaD8ud29ya3NwYWNlIHx8IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0XHRcdGNvbnN0IHRhc2tSZXN1bHQgPSBhd2FpdCB0aGlzLnRhc2tSdW5uZXIucnVuVGFza0FuZENoZWNrRXJyb3JzKHdvcmtzcGFjZSwgcmVzb2x2ZWRDb25maWcucHJlTGF1bmNoVGFzayk7XG5cdFx0XHRcdGlmICh0YXNrUmVzdWx0ID09PSBUYXNrUnVuUmVzdWx0LkZhaWx1cmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjZmcgPSBhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMobGF1bmNoICYmIGxhdW5jaC53b3Jrc3BhY2UgPyBsYXVuY2gud29ya3NwYWNlLnVyaSA6IHVuZGVmaW5lZCwgcmVzb2x2ZWRDb25maWcudHlwZSwgcmVzb2x2ZWRDb25maWcsIGluaXRDYW5jZWxsYXRpb25Ub2tlbi50b2tlbik7XG5cdFx0XHRcdGlmICghY2ZnKSB7XG5cdFx0XHRcdFx0aWYgKGxhdW5jaCAmJiB0eXBlICYmIGNmZyA9PT0gbnVsbCAmJiAhaW5pdENhbmNlbGxhdGlvblRva2VuLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XHQvLyBzaG93IGxhdW5jaC5qc29uIG9ubHkgZm9yIFwiY29uZmlnXCIgYmVpbmcgXCJudWxsXCIuXG5cdFx0XHRcdFx0XHRhd2FpdCBsYXVuY2gub3BlbkNvbmZpZ0ZpbGUoeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCB0eXBlIH0sIGluaXRDYW5jZWxsYXRpb25Ub2tlbi50b2tlbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlZENvbmZpZyA9IGNmZztcblxuXHRcdFx0XHRjb25zdCBkYmcgPSB0aGlzLmFkYXB0ZXJNYW5hZ2VyLmdldERlYnVnZ2VyKHJlc29sdmVkQ29uZmlnLnR5cGUpO1xuXHRcdFx0XHRpZiAoIWRiZyB8fCAoY29uZmlnQnlQcm92aWRlcnMucmVxdWVzdCAhPT0gJ2F0dGFjaCcgJiYgY29uZmlnQnlQcm92aWRlcnMucmVxdWVzdCAhPT0gJ2xhdW5jaCcpKSB7XG5cdFx0XHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdFx0XHRpZiAoY29uZmlnQnlQcm92aWRlcnMucmVxdWVzdCAhPT0gJ2F0dGFjaCcgJiYgY29uZmlnQnlQcm92aWRlcnMucmVxdWVzdCAhPT0gJ2xhdW5jaCcpIHtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBjb25maWdCeVByb3ZpZGVycy5yZXF1ZXN0ID8gbmxzLmxvY2FsaXplKCdkZWJ1Z1JlcXVlc3ROb3RTdXBwb3J0ZWQnLCBcIkF0dHJpYnV0ZSAnezB9JyBoYXMgYW4gdW5zdXBwb3J0ZWQgdmFsdWUgJ3sxfScgaW4gdGhlIGNob3NlbiBkZWJ1ZyBjb25maWd1cmF0aW9uLlwiLCAncmVxdWVzdCcsIGNvbmZpZ0J5UHJvdmlkZXJzLnJlcXVlc3QpXG5cdFx0XHRcdFx0XHRcdDogbmxzLmxvY2FsaXplKCdkZWJ1Z1JlcXVlc01pc3NpbmcnLCBcIkF0dHJpYnV0ZSAnezB9JyBpcyBtaXNzaW5nIGZyb20gdGhlIGNob3NlbiBkZWJ1ZyBjb25maWd1cmF0aW9uLlwiLCAncmVxdWVzdCcpO1xuXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgPSByZXNvbHZlZENvbmZpZy50eXBlID8gbmxzLmxvY2FsaXplKCdkZWJ1Z1R5cGVOb3RTdXBwb3J0ZWQnLCBcIkNvbmZpZ3VyZWQgZGVidWcgdHlwZSAnezB9JyBpcyBub3Qgc3VwcG9ydGVkLlwiLCByZXNvbHZlZENvbmZpZy50eXBlKSA6XG5cdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZGVidWdUeXBlTWlzc2luZycsIFwiTWlzc2luZyBwcm9wZXJ0eSAndHlwZScgZm9yIHRoZSBjaG9zZW4gbGF1bmNoIGNvbmZpZ3VyYXRpb24uXCIpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbkxpc3Q6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0XHRcdFx0YWN0aW9uTGlzdC5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiAnaW5zdGFsbEFkZGl0aW9uYWxEZWJ1Z2dlcnMnLFxuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSh7IGtleTogJ2luc3RhbGxBZGRpdGlvbmFsRGVidWdnZXJzJywgY29tbWVudDogWydQbGFjZWhvbGRlciBpcyB0aGUgZGVidWcgdHlwZSwgc28gZm9yIGV4YW1wbGUgXCJub2RlXCIsIFwicHl0aG9uXCInXSB9LCBcIkluc3RhbGwgezB9IEV4dGVuc2lvblwiLCByZXNvbHZlZENvbmZpZy50eXBlKSxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2RlYnVnLmluc3RhbGxBZGRpdGlvbmFsRGVidWdnZXJzJywgcmVzb2x2ZWRDb25maWc/LnR5cGUpXG5cdFx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zaG93RXJyb3IobWVzc2FnZSwgYWN0aW9uTGlzdCk7IHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghZGJnLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnNob3dFcnJvcihkZWJ1Z2dlckRpc2FibGVkTWVzc2FnZShkYmcudHlwZSksIFtdKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRvQ3JlYXRlU2Vzc2lvbihzZXNzaW9uSWQsIGxhdW5jaD8ud29ya3NwYWNlLCB7IHJlc29sdmVkOiByZXNvbHZlZENvbmZpZywgdW5yZXNvbHZlZDogdW5yZXNvbHZlZENvbmZpZyB9LCBvcHRpb25zLCB1c2VyQ29uZmlybWVkQ29uY3VycmVudFNlc3Npb24pO1xuXHRcdFx0XHRpZiAocmVzdWx0ICYmIGd1ZXNzICYmIGFjdGl2ZUVkaXRvciAmJiBhY3RpdmVFZGl0b3IucmVzb3VyY2UpIHtcblx0XHRcdFx0XHQvLyBSZW1lYmVyIHVzZXIgY2hvaWNlIG9mIGVudmlyb25tZW50IHBlciBhY3RpdmUgZWRpdG9yIHRvIG1ha2Ugc3RhcnRpbmcgZGVidWdnaW5nIHNtb290aGVyICMxMjQ3NzBcblx0XHRcdFx0XHR0aGlzLmNob3NlbkVudmlyb25tZW50c1thY3RpdmVFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKV0gPSB7IHR5cGU6IGd1ZXNzLmRlYnVnZ2VyLnR5cGUsIGR5bmFtaWNMYWJlbDogZ3Vlc3Mud2l0aENvbmZpZz8ubGFiZWwgfTtcblx0XHRcdFx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUNob3NlbkVudmlyb25tZW50cyh0aGlzLmNob3NlbkVudmlyb25tZW50cyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoZXJyICYmIGVyci5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zaG93RXJyb3IoZXJyLm1lc3NhZ2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnNob3dFcnJvcihubHMubG9jYWxpemUoJ25vRm9sZGVyV29ya3NwYWNlRGVidWdFcnJvcicsIFwiVGhlIGFjdGl2ZSBmaWxlIGNhbiBub3QgYmUgZGVidWdnZWQuIE1ha2Ugc3VyZSBpdCBpcyBzYXZlZCBhbmQgdGhhdCB5b3UgaGF2ZSBhIGRlYnVnIGV4dGVuc2lvbiBpbnN0YWxsZWQgZm9yIHRoYXQgZmlsZSB0eXBlLlwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGxhdW5jaCAmJiAhaW5pdENhbmNlbGxhdGlvblRva2VuLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0YXdhaXQgbGF1bmNoLm9wZW5Db25maWdGaWxlKHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9LCBpbml0Q2FuY2VsbGF0aW9uVG9rZW4udG9rZW4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChsYXVuY2ggJiYgdHlwZSAmJiBjb25maWdCeVByb3ZpZGVycyA9PT0gbnVsbCAmJiAhaW5pdENhbmNlbGxhdGlvblRva2VuLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XHQvLyBzaG93IGxhdW5jaC5qc29uIG9ubHkgZm9yIFwiY29uZmlnXCIgYmVpbmcgXCJudWxsXCIuXG5cdFx0XHRhd2FpdCBsYXVuY2gub3BlbkNvbmZpZ0ZpbGUoeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCB0eXBlIH0sIGluaXRDYW5jZWxsYXRpb25Ub2tlbi50b2tlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIGluc3RhbnRpYXRlcyB0aGUgbmV3IHNlc3Npb24sIGluaXRpYWxpemVzIHRoZSBzZXNzaW9uLCByZWdpc3RlcnMgc2Vzc2lvbiBsaXN0ZW5lcnMgYW5kIHJlcG9ydHMgdGVsZW1ldHJ5XG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGRvQ3JlYXRlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZywgcm9vdDogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbjogeyByZXNvbHZlZDogSUNvbmZpZzsgdW5yZXNvbHZlZDogSUNvbmZpZyB8IHVuZGVmaW5lZCB9LCBvcHRpb25zPzogSURlYnVnU2Vzc2lvbk9wdGlvbnMsIHVzZXJDb25maXJtZWRDb25jdXJyZW50U2Vzc2lvbiA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z1Nlc3Npb24sIHNlc3Npb25JZCwgY29uZmlndXJhdGlvbiwgcm9vdCwgdGhpcy5tb2RlbCwgb3B0aW9ucyk7XG5cdFx0aWYgKCF1c2VyQ29uZmlybWVkQ29uY3VycmVudFNlc3Npb24gJiYgb3B0aW9ucz8uc3RhcnRlZEJ5VXNlciAmJiB0aGlzLm1vZGVsLmdldFNlc3Npb25zKCkuc29tZShzID0+XG5cdFx0XHRzLmNvbmZpZ3VyYXRpb24ubmFtZSA9PT0gY29uZmlndXJhdGlvbi5yZXNvbHZlZC5uYW1lICYmXG5cdFx0XHRzLmNvbmZpZ3VyYXRpb24udHlwZSA9PT0gY29uZmlndXJhdGlvbi5yZXNvbHZlZC50eXBlICYmXG5cdFx0XHRzLmNvbmZpZ3VyYXRpb24ucmVxdWVzdCA9PT0gY29uZmlndXJhdGlvbi5yZXNvbHZlZC5yZXF1ZXN0ICYmXG5cdFx0XHRzLnJvb3QgPT09IHJvb3Rcblx0XHQpICYmIGNvbmZpZ3VyYXRpb24ucmVzb2x2ZWQuc3VwcHJlc3NNdWx0aXBsZVNlc3Npb25XYXJuaW5nICE9PSB0cnVlKSB7XG5cdFx0XHQvLyBUaGVyZSBpcyBhbHJlYWR5IGEgc2Vzc2lvbiB3aXRoIHRoZSBzYW1lIGNvbmZpZ3VyYXRpb24sIHByb21wdCB1c2VyICMxMjc3MjFcblx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IHRoaXMuY29uZmlybUNvbmN1cnJlbnRTZXNzaW9uKHNlc3Npb24uZ2V0TGFiZWwoKSk7XG5cdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5tb2RlbC5hZGRTZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0Ly8gc2luY2UgdGhlIFNlc3Npb24gaXMgbm93IHByb3Blcmx5IHJlZ2lzdGVyZWQgdW5kZXIgaXRzIElEIGFuZCBob29rZWQsIHdlIGNhbiBhbm5vdW5jZSBpdFxuXHRcdC8vIHRoaXMgZXZlbnQgZG9lc24ndCBnbyB0byBleHRlbnNpb25zXG5cdFx0dGhpcy5fb25XaWxsTmV3U2Vzc2lvbi5maXJlKHNlc3Npb24pO1xuXG5cdFx0Y29uc3Qgb3BlbkRlYnVnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5vcGVuRGVidWc7XG5cdFx0Ly8gT3BlbiBkZWJ1ZyB2aWV3bGV0IGJhc2VkIG9uIHRoZSB2aXNpYmlsaXR5IG9mIHRoZSBzaWRlIGJhciBhbmQgb3BlbkRlYnVnIHNldHRpbmcuIERvIG5vdCBvcGVuIGZvciAncnVuIHdpdGhvdXQgZGVidWcnLlxuXHRcdC8vIE5vdGU6ICdvcGVuT25EZWJ1Z0JyZWFrJyBpcyBpbnRlbnRpb25hbGx5IGV4Y2x1ZGVkIGhlcmUgLSB0aGF0IGNhc2UgaXMgaGFuZGxlZCBpbiBkZWJ1Z1Nlc3Npb24gd2hlbiBhIGJyZWFrcG9pbnQgaXMgaGl0LlxuXHRcdGlmICghY29uZmlndXJhdGlvbi5yZXNvbHZlZC5ub0RlYnVnICYmIChvcGVuRGVidWcgPT09ICdvcGVuT25TZXNzaW9uU3RhcnQnIHx8IChvcGVuRGVidWcgPT09ICdvcGVuT25GaXJzdFNlc3Npb25TdGFydCcgJiYgdGhpcy52aWV3TW9kZWwuZmlyc3RTZXNzaW9uU3RhcnQpKSAmJiAhc2Vzc2lvbi5zdXBwcmVzc0RlYnVnVmlldykge1xuXHRcdFx0YXdhaXQgdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5vcGVuUGFuZUNvbXBvc2l0ZShWSUVXTEVUX0lELCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMubGF1bmNoT3JBdHRhY2hUb1Nlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdGNvbnN0IGludGVybmFsQ29uc29sZU9wdGlvbnMgPSBzZXNzaW9uLmNvbmZpZ3VyYXRpb24uaW50ZXJuYWxDb25zb2xlT3B0aW9ucyB8fCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmludGVybmFsQ29uc29sZU9wdGlvbnM7XG5cdFx0XHRpZiAoaW50ZXJuYWxDb25zb2xlT3B0aW9ucyA9PT0gJ29wZW5PblNlc3Npb25TdGFydCcgfHwgKHRoaXMudmlld01vZGVsLmZpcnN0U2Vzc2lvblN0YXJ0ICYmIGludGVybmFsQ29uc29sZU9wdGlvbnMgPT09ICdvcGVuT25GaXJzdFNlc3Npb25TdGFydCcpKSB7XG5cdFx0XHRcdHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3KFJFUExfVklFV19JRCwgZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5maXJzdFNlc3Npb25TdGFydCA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgc2hvd1N1YlNlc3Npb25zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5zaG93U3ViU2Vzc2lvbnNJblRvb2xCYXI7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMubW9kZWwuZ2V0U2Vzc2lvbnMoKTtcblx0XHRcdGNvbnN0IHNob3duU2Vzc2lvbnMgPSBzaG93U3ViU2Vzc2lvbnMgPyBzZXNzaW9ucyA6IHNlc3Npb25zLmZpbHRlcihzID0+ICFzLnBhcmVudFNlc3Npb24pO1xuXHRcdFx0aWYgKHNob3duU2Vzc2lvbnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5zZXRNdWx0aVNlc3Npb25WaWV3KHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzaW5jZSB0aGUgaW5pdGlhbGl6ZWQgcmVzcG9uc2UgaGFzIGFycml2ZWQgYW5ub3VuY2UgdGhlIG5ldyBTZXNzaW9uIChpbmNsdWRpbmcgZXh0ZW5zaW9ucylcblx0XHRcdHRoaXMuX29uRGlkTmV3U2Vzc2lvbi5maXJlKHNlc3Npb24pO1xuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHRpZiAoZXJyb3JzLmlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdC8vIGRvbid0IHNob3cgJ2NhbmNlbGVkJyBlcnJvciBtZXNzYWdlcyB0byB0aGUgdXNlciAjNzkwNlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNob3cgdGhlIHJlcGwgaWYgc29tZSBlcnJvciBnb3QgbG9nZ2VkIHRoZXJlICM1ODcwXG5cdFx0XHRpZiAoc2Vzc2lvbiAmJiBzZXNzaW9uLmdldFJlcGxFbGVtZW50cygpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy52aWV3c1NlcnZpY2Uub3BlblZpZXcoUkVQTF9WSUVXX0lELCBmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9uLmNvbmZpZ3VyYXRpb24gJiYgc2Vzc2lvbi5jb25maWd1cmF0aW9uLnJlcXVlc3QgPT09ICdhdHRhY2gnICYmIHNlc3Npb24uY29uZmlndXJhdGlvbi5fX2F1dG9BdHRhY2gpIHtcblx0XHRcdFx0Ly8gaWdub3JlIGF0dGFjaCB0aW1lb3V0cyBpbiBhdXRvIGF0dGFjaCBtb2RlXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcjtcblx0XHRcdGlmIChlcnJvci5zaG93VXNlciAhPT0gZmFsc2UpIHtcblx0XHRcdFx0Ly8gT25seSBzaG93IHRoZSBlcnJvciB3aGVuIHNob3dVc2VyIGlzIGVpdGhlciBub3QgZGVmaW5lZCwgb3IgaXMgdHJ1ZSAjMTI4NDg0XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2hvd0Vycm9yKGVycm9yTWVzc2FnZSwgaXNFcnJvcldpdGhBY3Rpb25zKGVycm9yKSA/IGVycm9yLmFjdGlvbnMgOiBbXSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtQ29uY3VycmVudFNlc3Npb24oc2Vzc2lvbkxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ211bHRpcGxlU2Vzc2lvbicsIFwiJ3swfScgaXMgYWxyZWFkeSBydW5uaW5nLiBEbyB5b3Ugd2FudCB0byBzdGFydCBhbm90aGVyIGluc3RhbmNlP1wiLCBzZXNzaW9uTGFiZWwpXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdC5jb25maXJtZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxhdW5jaE9yQXR0YWNoVG9TZXNzaW9uKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIGZvcmNlRm9jdXMgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIHJlZ2lzdGVyIGxpc3RlbmVycyBhcyB0aGUgdmVyeSBmaXJzdCB0aGluZyFcblx0XHR0aGlzLnJlZ2lzdGVyU2Vzc2lvbkxpc3RlbmVycyhzZXNzaW9uKTtcblxuXHRcdGNvbnN0IGRiZ3IgPSB0aGlzLmFkYXB0ZXJNYW5hZ2VyLmdldERlYnVnZ2VyKHNlc3Npb24uY29uZmlndXJhdGlvbi50eXBlKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbi5pbml0aWFsaXplKGRiZ3IhKTtcblx0XHRcdGF3YWl0IHNlc3Npb24ubGF1bmNoT3JBdHRhY2goc2Vzc2lvbi5jb25maWd1cmF0aW9uKTtcblx0XHRcdGNvbnN0IGxhdW5jaEpzb25FeGlzdHMgPSAhIXNlc3Npb24ucm9vdCAmJiAhIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUdsb2JhbENvbmZpZz4oJ2xhdW5jaCcsIHsgcmVzb3VyY2U6IHNlc3Npb24ucm9vdC51cmkgfSk7XG5cdFx0XHRhd2FpdCB0aGlzLnRlbGVtZXRyeS5sb2dEZWJ1Z1Nlc3Npb25TdGFydChkYmdyISwgbGF1bmNoSnNvbkV4aXN0cyk7XG5cblx0XHRcdGlmIChmb3JjZUZvY3VzIHx8ICF0aGlzLnZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbiB8fCAoc2Vzc2lvbi5wYXJlbnRTZXNzaW9uID09PSB0aGlzLnZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbiAmJiBzZXNzaW9uLmNvbXBhY3QpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZm9jdXNTdGFja0ZyYW1lKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbiA9PT0gc2Vzc2lvbikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZvY3VzU3RhY2tGcmFtZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNlc3Npb25MaXN0ZW5lcnMoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IGxpc3RlbmVyRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQobGlzdGVuZXJEaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBzZXNzaW9uUnVubmluZ1NjaGVkdWxlciA9IGxpc3RlbmVyRGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdC8vIERvIG5vdCBpbW1lZGlhdGx5IGRlZm9jdXMgdGhlIHN0YWNrIGZyYW1lIGlmIHRoZSBzZXNzaW9uIGlzIHJ1bm5pbmdcblx0XHRcdGlmIChzZXNzaW9uLnN0YXRlID09PSBTdGF0ZS5SdW5uaW5nICYmIHRoaXMudmlld01vZGVsLmZvY3VzZWRTZXNzaW9uID09PSBzZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMudmlld01vZGVsLnNldEZvY3VzKHVuZGVmaW5lZCwgdGhpcy52aWV3TW9kZWwuZm9jdXNlZFRocmVhZCwgc2Vzc2lvbiwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0sIDIwMCkpO1xuXHRcdGxpc3RlbmVyRGlzcG9zYWJsZXMuYWRkKHNlc3Npb24ub25EaWRDaGFuZ2VTdGF0ZSgoKSA9PiB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5zdGF0ZSA9PT0gU3RhdGUuUnVubmluZyAmJiB0aGlzLnZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbiA9PT0gc2Vzc2lvbikge1xuXHRcdFx0XHRzZXNzaW9uUnVubmluZ1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlc3Npb24gPT09IHRoaXMudmlld01vZGVsLmZvY3VzZWRTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMub25TdGF0ZUNoYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRsaXN0ZW5lckRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkRW5kU2Vzc2lvbihlID0+IHtcblx0XHRcdGlmIChlLnNlc3Npb24gPT09IHNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5kZWxldGUobGlzdGVuZXJEaXNwb3NhYmxlcyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGxpc3RlbmVyRGlzcG9zYWJsZXMuYWRkKHNlc3Npb24ub25EaWRFbmRBZGFwdGVyKGFzeW5jIGFkYXB0ZXJFeGl0RXZlbnQgPT4ge1xuXG5cdFx0XHRpZiAoYWRhcHRlckV4aXRFdmVudCkge1xuXHRcdFx0XHRpZiAoYWRhcHRlckV4aXRFdmVudC5lcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ2RlYnVnQWRhcHRlckNyYXNoJywgXCJEZWJ1ZyBhZGFwdGVyIHByb2Nlc3MgaGFzIHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5ICh7MH0pXCIsIGFkYXB0ZXJFeGl0RXZlbnQuZXJyb3IubWVzc2FnZSB8fCBhZGFwdGVyRXhpdEV2ZW50LmVycm9yLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeS5sb2dEZWJ1Z1Nlc3Npb25TdG9wKHNlc3Npb24sIGFkYXB0ZXJFeGl0RXZlbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAnUnVuIHdpdGhvdXQgZGVidWdnaW5nJyBtb2RlIFZTQ29kZSBtdXN0IHRlcm1pbmF0ZSB0aGUgZXh0ZW5zaW9uIGhvc3QuIE1vcmUgZGV0YWlsczogIzM5MDVcblx0XHRcdGNvbnN0IGV4dGVuc2lvbkRlYnVnU2Vzc2lvbiA9IGdldEV4dGVuc2lvbkhvc3REZWJ1Z1Nlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uRGVidWdTZXNzaW9uICYmIGV4dGVuc2lvbkRlYnVnU2Vzc2lvbi5zdGF0ZSA9PT0gU3RhdGUuUnVubmluZyAmJiBleHRlbnNpb25EZWJ1Z1Nlc3Npb24uY29uZmlndXJhdGlvbi5ub0RlYnVnKSB7XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZS5jbG9zZShleHRlbnNpb25EZWJ1Z1Nlc3Npb24uZ2V0SWQoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9uLmNvbmZpZ3VyYXRpb24ucG9zdERlYnVnVGFzaykge1xuXHRcdFx0XHRjb25zdCByb290ID0gc2Vzc2lvbi5yb290ID8/IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy50YXNrUnVubmVyLnJ1blRhc2socm9vdCwgc2Vzc2lvbi5jb25maWd1cmF0aW9uLnBvc3REZWJ1Z1Rhc2spO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5lbmRJbml0aWFsaXppbmdTdGF0ZSgpO1xuXHRcdFx0dGhpcy5jYW5jZWxUb2tlbnMoc2Vzc2lvbi5nZXRJZCgpKTtcblxuXHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuY2xvc2VSZWFkb25seVRhYnNPbkVuZCkge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JzVG9DbG9zZSA9IHRoaXMuZWRpdG9yU2VydmljZS5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5maWx0ZXIoKHsgZWRpdG9yIH0pID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yLnJlc291cmNlPy5zY2hlbWUgPT09IERFQlVHX1NDSEVNRSAmJiBzZXNzaW9uLmdldElkKCkgPT09IFNvdXJjZS5nZXRFbmNvZGVkRGVidWdEYXRhKGVkaXRvci5yZXNvdXJjZSkuc2Vzc2lvbklkO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLmNsb3NlRWRpdG9ycyhlZGl0b3JzVG9DbG9zZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZEVuZFNlc3Npb24uZmlyZSh7IHNlc3Npb24sIHJlc3RhcnQ6IHRoaXMucmVzdGFydGluZ1Nlc3Npb25zLmhhcyhzZXNzaW9uKSB9KTtcblxuXHRcdFx0Y29uc3QgZm9jdXNlZFNlc3Npb24gPSB0aGlzLnZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbjtcblx0XHRcdGlmIChmb2N1c2VkU2Vzc2lvbiAmJiBmb2N1c2VkU2Vzc2lvbi5nZXRJZCgpID09PSBzZXNzaW9uLmdldElkKCkpIHtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uLCB0aHJlYWQsIHN0YWNrRnJhbWUgfSA9IGdldFN0YWNrRnJhbWVUaHJlYWRBbmRTZXNzaW9uVG9Gb2N1cyh0aGlzLm1vZGVsLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmb2N1c2VkU2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMudmlld01vZGVsLnNldEZvY3VzKHN0YWNrRnJhbWUsIHRocmVhZCwgc2Vzc2lvbiwgZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5tb2RlbC5nZXRTZXNzaW9ucygpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5zZXRNdWx0aVNlc3Npb25WaWV3KGZhbHNlKTtcblxuXHRcdFx0XHRpZiAodGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5TSURFQkFSX1BBUlQpICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykub3BlbkV4cGxvcmVyT25FbmQpIHtcblx0XHRcdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9wZW5QYW5lQ29tcG9zaXRlKEVYUExPUkVSX1ZJRVdMRVRfSUQsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIERhdGEgYnJlYWtwb2ludHMgdGhhdCBjYW4gbm90IGJlIHBlcnNpc3RlZCBzaG91bGQgYmUgY2xlYXJlZCB3aGVuIGEgc2Vzc2lvbiBlbmRzXG5cdFx0XHRcdGNvbnN0IGRhdGFCcmVha3BvaW50cyA9IHRoaXMubW9kZWwuZ2V0RGF0YUJyZWFrcG9pbnRzKCkuZmlsdGVyKGRicCA9PiAhZGJwLmNhblBlcnNpc3QpO1xuXHRcdFx0XHRkYXRhQnJlYWtwb2ludHMuZm9yRWFjaChkYnAgPT4gdGhpcy5tb2RlbC5yZW1vdmVEYXRhQnJlYWtwb2ludHMoZGJwLmdldElkKCkpKTtcblxuXHRcdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5jb25zb2xlLmNsb3NlT25FbmQpIHtcblx0XHRcdFx0XHRjb25zdCBkZWJ1Z0NvbnNvbGVDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoUkVQTF9WSUVXX0lEKTtcblx0XHRcdFx0XHRpZiAoZGVidWdDb25zb2xlQ29udGFpbmVyICYmIHRoaXMudmlld3NTZXJ2aWNlLmlzVmlld0NvbnRhaW5lclZpc2libGUoZGVidWdDb25zb2xlQ29udGFpbmVyLmlkKSkge1xuXHRcdFx0XHRcdFx0dGhpcy52aWV3c1NlcnZpY2UuY2xvc2VWaWV3Q29udGFpbmVyKGRlYnVnQ29uc29sZUNvbnRhaW5lci5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubW9kZWwucmVtb3ZlRXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uKHNlc3Npb24uZ2V0SWQoKSk7XG5cdFx0XHQvLyBzZXNzaW9uLmRpc3Bvc2UoKTsgVE9ET0Byb2Jsb3VyZW5zXG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgcmVzdGFydFNlc3Npb24oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgcmVzdGFydERhdGE/OiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc2Vzc2lvbi5zYXZlQmVmb3JlUmVzdGFydCkge1xuXHRcdFx0YXdhaXQgc2F2ZUFsbEJlZm9yZURlYnVnU3RhcnQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5lZGl0b3JTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0F1dG9SZXN0YXJ0ID0gISFyZXN0YXJ0RGF0YTtcblxuXHRcdGNvbnN0IHJ1blRhc2tzOiAoKSA9PiBQcm9taXNlPFRhc2tSdW5SZXN1bHQ+ID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKGlzQXV0b1Jlc3RhcnQpIHtcblx0XHRcdFx0Ly8gRG8gbm90IHJ1biBwcmVMYXVuY2ggYW5kIHBvc3REZWJ1ZyB0YXNrcyBmb3IgYXV0b21hdGljIHJlc3RhcnRzXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoVGFza1J1blJlc3VsdC5TdWNjZXNzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgcm9vdCA9IHNlc3Npb24ucm9vdCB8fCB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdFx0YXdhaXQgdGhpcy50YXNrUnVubmVyLnJ1blRhc2socm9vdCwgc2Vzc2lvbi5jb25maWd1cmF0aW9uLnByZVJlc3RhcnRUYXNrKTtcblx0XHRcdGF3YWl0IHRoaXMudGFza1J1bm5lci5ydW5UYXNrKHJvb3QsIHNlc3Npb24uY29uZmlndXJhdGlvbi5wb3N0RGVidWdUYXNrKTtcblxuXHRcdFx0Y29uc3QgdGFza1Jlc3VsdDEgPSBhd2FpdCB0aGlzLnRhc2tSdW5uZXIucnVuVGFza0FuZENoZWNrRXJyb3JzKHJvb3QsIHNlc3Npb24uY29uZmlndXJhdGlvbi5wcmVMYXVuY2hUYXNrKTtcblx0XHRcdGlmICh0YXNrUmVzdWx0MSAhPT0gVGFza1J1blJlc3VsdC5TdWNjZXNzKSB7XG5cdFx0XHRcdHJldHVybiB0YXNrUmVzdWx0MTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMudGFza1J1bm5lci5ydW5UYXNrQW5kQ2hlY2tFcnJvcnMocm9vdCwgc2Vzc2lvbi5jb25maWd1cmF0aW9uLnBvc3RSZXN0YXJ0VGFzayk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbkRlYnVnU2Vzc2lvbiA9IGdldEV4dGVuc2lvbkhvc3REZWJ1Z1Nlc3Npb24oc2Vzc2lvbik7XG5cdFx0aWYgKGV4dGVuc2lvbkRlYnVnU2Vzc2lvbikge1xuXHRcdFx0Y29uc3QgdGFza1Jlc3VsdCA9IGF3YWl0IHJ1blRhc2tzKCk7XG5cdFx0XHRpZiAodGFza1Jlc3VsdCA9PT0gVGFza1J1blJlc3VsdC5TdWNjZXNzKSB7XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZS5yZWxvYWQoZXh0ZW5zaW9uRGVidWdTZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVhZCB0aGUgY29uZmlndXJhdGlvbiBhZ2FpbiBpZiBhIGxhdW5jaC5qc29uIGhhcyBiZWVuIGNoYW5nZWQsIGlmIG5vdCBqdXN0IHVzZSB0aGUgaW5tZW1vcnkgY29uZmlndXJhdGlvblxuXHRcdGxldCBuZWVkc1RvU3Vic3RpdHV0ZSA9IGZhbHNlO1xuXHRcdGxldCB1bnJlc29sdmVkOiBJQ29uZmlnIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGxhdW5jaCA9IHNlc3Npb24ucm9vdCA/IHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIuZ2V0TGF1bmNoKHNlc3Npb24ucm9vdC51cmkpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChsYXVuY2gpIHtcblx0XHRcdHVucmVzb2x2ZWQgPSBsYXVuY2guZ2V0Q29uZmlndXJhdGlvbihzZXNzaW9uLmNvbmZpZ3VyYXRpb24ubmFtZSk7XG5cdFx0XHRpZiAodW5yZXNvbHZlZCAmJiAhZXF1YWxzKHVucmVzb2x2ZWQsIHNlc3Npb24udW5yZXNvbHZlZENvbmZpZ3VyYXRpb24pKSB7XG5cdFx0XHRcdHVucmVzb2x2ZWQubm9EZWJ1ZyA9IHNlc3Npb24uY29uZmlndXJhdGlvbi5ub0RlYnVnO1xuXHRcdFx0XHRuZWVkc1RvU3Vic3RpdHV0ZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHJlc29sdmVkOiBJQ29uZmlnIHwgdW5kZWZpbmVkIHwgbnVsbCA9IHNlc3Npb24uY29uZmlndXJhdGlvbjtcblx0XHRpZiAobGF1bmNoICYmIG5lZWRzVG9TdWJzdGl0dXRlICYmIHVucmVzb2x2ZWQpIHtcblx0XHRcdGNvbnN0IGluaXRDYW5jZWxsYXRpb25Ub2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0dGhpcy5zZXNzaW9uQ2FuY2VsbGF0aW9uVG9rZW5zLnNldChzZXNzaW9uLmdldElkKCksIGluaXRDYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0XHRjb25zdCByZXNvbHZlZEJ5UHJvdmlkZXJzID0gYXdhaXQgdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5yZXNvbHZlQ29uZmlndXJhdGlvbkJ5UHJvdmlkZXJzKGxhdW5jaC53b3Jrc3BhY2UgPyBsYXVuY2gud29ya3NwYWNlLnVyaSA6IHVuZGVmaW5lZCwgdW5yZXNvbHZlZC50eXBlLCB1bnJlc29sdmVkLCBpbml0Q2FuY2VsbGF0aW9uVG9rZW4udG9rZW4pO1xuXHRcdFx0aWYgKHJlc29sdmVkQnlQcm92aWRlcnMpIHtcblx0XHRcdFx0cmVzb2x2ZWQgPSBhd2FpdCB0aGlzLnN1YnN0aXR1dGVWYXJpYWJsZXMobGF1bmNoLCByZXNvbHZlZEJ5UHJvdmlkZXJzKTtcblx0XHRcdFx0aWYgKHJlc29sdmVkICYmICFpbml0Q2FuY2VsbGF0aW9uVG9rZW4udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXNvbHZlZCA9IGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbldpdGhTdWJzdGl0dXRlZFZhcmlhYmxlcyhsYXVuY2ggJiYgbGF1bmNoLndvcmtzcGFjZSA/IGxhdW5jaC53b3Jrc3BhY2UudXJpIDogdW5kZWZpbmVkLCByZXNvbHZlZC50eXBlLCByZXNvbHZlZCwgaW5pdENhbmNlbGxhdGlvblRva2VuLnRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzb2x2ZWQgPSByZXNvbHZlZEJ5UHJvdmlkZXJzO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdHNlc3Npb24uc2V0Q29uZmlndXJhdGlvbih7IHJlc29sdmVkLCB1bnJlc29sdmVkIH0pO1xuXHRcdH1cblx0XHRzZXNzaW9uLmNvbmZpZ3VyYXRpb24uX19yZXN0YXJ0ID0gcmVzdGFydERhdGE7XG5cblx0XHRjb25zdCBkb1Jlc3RhcnQgPSBhc3luYyAoZm46ICgpID0+IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD4pID0+IHtcblx0XHRcdHRoaXMucmVzdGFydGluZ1Nlc3Npb25zLmFkZChzZXNzaW9uKTtcblx0XHRcdGxldCBkaWRSZXN0YXJ0ID0gZmFsc2U7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRkaWRSZXN0YXJ0ID0gKGF3YWl0IGZuKCkpICE9PSBmYWxzZTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0ZGlkUmVzdGFydCA9IGZhbHNlO1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5yZXN0YXJ0aW5nU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24pO1xuXHRcdFx0XHQvLyB3ZSBwcmV2aW91c2x5IG1heSBoYXZlIGlzc3VlZCBhbiBvbkRpZEVuZFNlc3Npb24gd2l0aCByZXN0YXJ0OiB0cnVlLFxuXHRcdFx0XHQvLyBhc3N1bWluZyB0aGUgYWRhcHRlciBleGl0ZWQgKGluIGByZWdpc3RlclNlc3Npb25MaXN0ZW5lcnNgKS4gQnV0IHRoZVxuXHRcdFx0XHQvLyByZXN0YXJ0IGZhaWxlZCwgc28gZW1pdCB0aGUgZmluYWwgdGVybWluYXRpb24gbm93LlxuXHRcdFx0XHRpZiAoIWRpZFJlc3RhcnQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEVuZFNlc3Npb24uZmlyZSh7IHNlc3Npb24sIHJlc3RhcnQ6IGZhbHNlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgYnJlYWtwb2ludCBvZiB0aGlzLm1vZGVsLmdldEJyZWFrcG9pbnRzKHsgdHJpZ2dlcmVkT25seTogdHJ1ZSB9KSkge1xuXHRcdFx0YnJlYWtwb2ludC5zZXRTZXNzaW9uRGlkVHJpZ2dlcihzZXNzaW9uLmdldElkKCksIGZhbHNlKTtcblx0XHR9XG5cblx0XHQvLyBGb3IgZGVidWcgc2Vzc2lvbnMgc3Bhd25lZCBieSB0ZXN0IHJ1bnMsIGNhbmNlbCB0aGUgdGVzdCBydW4gYW5kIHN0b3Bcblx0XHQvLyB0aGUgc2Vzc2lvbiwgdGhlbiBzdGFydCB0aGUgdGVzdCBydW4gYWdhaW47IHRlc3RzIGhhdmUgbm8gbm90aW9uIG9mIHJlc3RhcnRzLlxuXHRcdGlmIChzZXNzaW9uLmNvcnJlbGF0ZWRUZXN0UnVuKSB7XG5cdFx0XHRpZiAoIXNlc3Npb24uY29ycmVsYXRlZFRlc3RSdW4uY29tcGxldGVkQXQpIHtcblx0XHRcdFx0c2Vzc2lvbi5jYW5jZWxDb3JyZWxhdGVkVGVzdFJ1bigpO1xuXHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2Uoc2Vzc2lvbi5jb3JyZWxhdGVkVGVzdFJ1bi5vbkNvbXBsZXRlKTtcblx0XHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyIGlzIHRoZXJlIGFueSByZWFzb24gdG8gd2FpdCBmb3IgdGhlIGRlYnVnIHNlc3Npb24gdG9cblx0XHRcdFx0Ly8gdGVybWluYXRlPyBJIGRvbid0IHRoaW5rIHNvLCB0ZXN0IGV4dGVuc2lvbiBzaG91bGQgYWxyZWFkeSBoYW5kbGUgYW55XG5cdFx0XHRcdC8vIHN0YXRlIGNvbmZsaWN0cy4uLlxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRlc3RTZXJ2aWNlLnJ1blJlc29sdmVkVGVzdHMoc2Vzc2lvbi5jb3JyZWxhdGVkVGVzdFJ1bi5yZXF1ZXN0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNSZXN0YXJ0UmVxdWVzdCkge1xuXHRcdFx0Y29uc3QgdGFza1Jlc3VsdCA9IGF3YWl0IHJ1blRhc2tzKCk7XG5cdFx0XHRpZiAodGFza1Jlc3VsdCA9PT0gVGFza1J1blJlc3VsdC5TdWNjZXNzKSB7XG5cdFx0XHRcdGF3YWl0IGRvUmVzdGFydChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgc2Vzc2lvbi5yZXN0YXJ0KCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvdWxkRm9jdXMgPSAhIXRoaXMudmlld01vZGVsLmZvY3VzZWRTZXNzaW9uICYmIHNlc3Npb24uZ2V0SWQoKSA9PT0gdGhpcy52aWV3TW9kZWwuZm9jdXNlZFNlc3Npb24uZ2V0SWQoKTtcblx0XHRyZXR1cm4gZG9SZXN0YXJ0KGFzeW5jICgpID0+IHtcblx0XHRcdC8vIElmIHRoZSByZXN0YXJ0IGlzIGF1dG9tYXRpYyAgLT4gZGlzY29ubmVjdCwgb3RoZXJ3aXNlIC0+IHRlcm1pbmF0ZSAjNTUwNjRcblx0XHRcdGlmIChpc0F1dG9SZXN0YXJ0KSB7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb24uZGlzY29ubmVjdCh0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb24udGVybWluYXRlKHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4oKGMsIGUpID0+IHtcblx0XHRcdFx0c2V0VGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGFza1Jlc3VsdCA9IGF3YWl0IHJ1blRhc2tzKCk7XG5cdFx0XHRcdFx0aWYgKHRhc2tSZXN1bHQgIT09IFRhc2tSdW5SZXN1bHQuU3VjY2Vzcykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGMoZmFsc2UpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjKGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5sYXVuY2hPckF0dGFjaFRvU2Vzc2lvbihzZXNzaW9uLCBzaG91bGRGb2N1cyk7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZE5ld1Nlc3Npb24uZmlyZShzZXNzaW9uKTtcblx0XHRcdFx0XHRcdGModHJ1ZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdGUoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMzAwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgc3RvcFNlc3Npb24oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCwgZGlzY29ubmVjdCA9IGZhbHNlLCBzdXNwZW5kID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gZGlzY29ubmVjdCA/IHNlc3Npb24uZGlzY29ubmVjdCh1bmRlZmluZWQsIHN1c3BlbmQpIDogc2Vzc2lvbi50ZXJtaW5hdGUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMubW9kZWwuZ2V0U2Vzc2lvbnMoKTtcblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnRhc2tSdW5uZXIuY2FuY2VsKCk7XG5cdFx0XHQvLyBVc2VyIG1pZ2h0IGhhdmUgY2FuY2VsbGVkIHN0YXJ0aW5nIG9mIGEgZGVidWcgc2Vzc2lvbiwgYW5kIGluIHNvbWUgY2FzZXMgdGhlIHF1aWNrIHBpY2sgaXMgbGVmdCBvcGVuXG5cdFx0XHRhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5lbmRJbml0aWFsaXppbmdTdGF0ZSgpO1xuXHRcdFx0dGhpcy5jYW5jZWxUb2tlbnModW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoc2Vzc2lvbnMubWFwKHMgPT4gZGlzY29ubmVjdCA/IHMuZGlzY29ubmVjdCh1bmRlZmluZWQsIHN1c3BlbmQpIDogcy50ZXJtaW5hdGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdWJzdGl0dXRlVmFyaWFibGVzKGxhdW5jaDogSUxhdW5jaCB8IHVuZGVmaW5lZCwgY29uZmlnOiBJQ29uZmlnKTogUHJvbWlzZTxJQ29uZmlnIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGJnID0gdGhpcy5hZGFwdGVyTWFuYWdlci5nZXREZWJ1Z2dlcihjb25maWcudHlwZSk7XG5cdFx0aWYgKGRiZykge1xuXHRcdFx0bGV0IGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChsYXVuY2ggJiYgbGF1bmNoLndvcmtzcGFjZSkge1xuXHRcdFx0XHRmb2xkZXIgPSBsYXVuY2gud29ya3NwYWNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRcdFx0aWYgKGZvbGRlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0Zm9sZGVyID0gZm9sZGVyc1swXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IGRiZy5zdWJzdGl0dXRlVmFyaWFibGVzKGZvbGRlciwgY29uZmlnKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoZXJyLm1lc3NhZ2UgIT09IGVycm9ycy5jYW5jZWxlZE5hbWUpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dFcnJvcihlcnIubWVzc2FnZSwgdW5kZWZpbmVkLCAhIWxhdW5jaD8uZ2V0Q29uZmlndXJhdGlvbihjb25maWcubmFtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XHQvLyBiYWlsIG91dFxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNvbmZpZyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dFcnJvcihtZXNzYWdlOiBzdHJpbmcsIGVycm9yQWN0aW9uczogUmVhZG9ubHlBcnJheTxJQWN0aW9uPiA9IFtdLCBwcm9tcHRMYXVuY2hKc29uID0gdHJ1ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZUFjdGlvbiA9IHRvQWN0aW9uKHsgaWQ6IERFQlVHX0NPTkZJR1VSRV9DT01NQU5EX0lELCBsYWJlbDogREVCVUdfQ09ORklHVVJFX0xBQkVMLCBlbmFibGVkOiB0cnVlLCBydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoREVCVUdfQ09ORklHVVJFX0NPTU1BTkRfSUQpIH0pO1xuXHRcdC8vIERvbid0IGFwcGVuZCB0aGUgc3RhbmRhcmQgY29tbWFuZCBpZiBpZCBvZiBhbnkgcHJvdmlkZWQgYWN0aW9uIGluZGljYXRlcyBpdCBpcyBhIGNvbW1hbmRcblx0XHRjb25zdCBhY3Rpb25zID0gZXJyb3JBY3Rpb25zLmZpbHRlcigoYWN0aW9uKSA9PiBhY3Rpb24uaWQuZW5kc1dpdGgoJy5jb21tYW5kJykpLmxlbmd0aCA+IDAgP1xuXHRcdFx0ZXJyb3JBY3Rpb25zIDpcblx0XHRcdFsuLi5lcnJvckFjdGlvbnMsIC4uLihwcm9tcHRMYXVuY2hKc29uID8gW2NvbmZpZ3VyZUFjdGlvbl0gOiBbXSldO1xuXHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogc2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0YnV0dG9uczogYWN0aW9ucy5tYXAoYWN0aW9uID0+ICh7XG5cdFx0XHRcdGxhYmVsOiBhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdHJ1bjogKCkgPT4gYWN0aW9uLnJ1bigpXG5cdFx0XHR9KSksXG5cdFx0XHRjYW5jZWxCdXR0b246IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdC8vLS0tLSBmb2N1cyBtYW5hZ2VtZW50XG5cblx0YXN5bmMgZm9jdXNTdGFja0ZyYW1lKF9zdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSB8IHVuZGVmaW5lZCwgX3RocmVhZD86IElUaHJlYWQsIF9zZXNzaW9uPzogSURlYnVnU2Vzc2lvbiwgb3B0aW9ucz86IHsgZXhwbGljaXQ/OiBib29sZWFuOyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjsgc2lkZUJ5U2lkZT86IGJvb2xlYW47IHBpbm5lZD86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgc3RhY2tGcmFtZSwgdGhyZWFkLCBzZXNzaW9uIH0gPSBnZXRTdGFja0ZyYW1lVGhyZWFkQW5kU2Vzc2lvblRvRm9jdXModGhpcy5tb2RlbCwgX3N0YWNrRnJhbWUsIF90aHJlYWQsIF9zZXNzaW9uKTtcblxuXHRcdGlmIChzdGFja0ZyYW1lKSB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCBzdGFja0ZyYW1lLm9wZW5JbkVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UsIG9wdGlvbnM/LnByZXNlcnZlRm9jdXMgPz8gdHJ1ZSwgb3B0aW9ucz8uc2lkZUJ5U2lkZSwgb3B0aW9ucz8ucGlubmVkKTtcblx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0aWYgKGVkaXRvci5pbnB1dCA9PT0gRGlzYXNzZW1ibHlWaWV3SW5wdXQuaW5zdGFuY2UpIHtcblx0XHRcdFx0XHQvLyBHbyB0byBhZGRyZXNzIGlzIGludm9rZWQgdmlhIHNldEZvY3VzXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udHJvbCA9IGVkaXRvci5nZXRDb250cm9sKCk7XG5cdFx0XHRcdFx0aWYgKHN0YWNrRnJhbWUgJiYgaXNDb2RlRWRpdG9yKGNvbnRyb2wpICYmIGNvbnRyb2wuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBjb250cm9sLmdldE1vZGVsKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gc3RhY2tGcmFtZS5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRpZiAobGluZU51bWJlciA+PSAxICYmIGxpbmVOdW1iZXIgPD0gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBjb250cm9sLmdldE1vZGVsKCkuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHRcdFx0XHRcdGFyaWEuYWxlcnQobmxzLmxvY2FsaXplKHsga2V5OiAnZGVidWdnaW5nUGF1c2VkJywgY29tbWVudDogWydGaXJzdCBwbGFjZWhvbGRlciBpcyB0aGUgZmlsZSBsaW5lIGNvbnRlbnQsIHNlY29uZCBwbGFjZWhvbGRlciBpcyB0aGUgcmVhc29uIHdoeSBkZWJ1Z2dpbmcgaXMgc3RvcHBlZCwgZm9yIGV4YW1wbGUgXCJicmVha3BvaW50XCIsIHRoaXJkIGlzIHRoZSBzdGFjayBmcmFtZSBuYW1lLCBhbmQgbGFzdCBpcyB0aGUgbGluZSBudW1iZXIuJ10gfSxcblx0XHRcdFx0XHRcdFx0XHRcInswfSwgZGVidWdnaW5nIHBhdXNlZCB7MX0sIHsyfTp7M31cIiwgbGluZUNvbnRlbnQsIHRocmVhZCAmJiB0aHJlYWQuc3RvcHBlZERldGFpbHMgPyBgLCByZWFzb24gJHt0aHJlYWQuc3RvcHBlZERldGFpbHMucmVhc29ufWAgOiAnJywgc3RhY2tGcmFtZS5zb3VyY2UgPyBzdGFja0ZyYW1lLnNvdXJjZS5uYW1lIDogJycsIHN0YWNrRnJhbWUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLmRlYnVnVHlwZS5zZXQoc2Vzc2lvbi5jb25maWd1cmF0aW9uLnR5cGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRlYnVnVHlwZS5yZXNldCgpO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld01vZGVsLnNldEZvY3VzKHN0YWNrRnJhbWUsIHRocmVhZCwgc2Vzc2lvbiwgISFvcHRpb25zPy5leHBsaWNpdCk7XG5cdH1cblxuXHQvLy0tLS0gd2F0Y2hlc1xuXG5cdGFkZFdhdGNoRXhwcmVzc2lvbihuYW1lPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2UgPSB0aGlzLm1vZGVsLmFkZFdhdGNoRXhwcmVzc2lvbihuYW1lKTtcblx0XHRpZiAoIW5hbWUpIHtcblx0XHRcdHRoaXMudmlld01vZGVsLnNldFNlbGVjdGVkRXhwcmVzc2lvbih3ZSwgZmFsc2UpO1xuXHRcdH1cblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZVdhdGNoRXhwcmVzc2lvbnModGhpcy5tb2RlbC5nZXRXYXRjaEV4cHJlc3Npb25zKCkpO1xuXHR9XG5cblx0cmVuYW1lV2F0Y2hFeHByZXNzaW9uKGlkOiBzdHJpbmcsIG5ld05hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwucmVuYW1lV2F0Y2hFeHByZXNzaW9uKGlkLCBuZXdOYW1lKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZVdhdGNoRXhwcmVzc2lvbnModGhpcy5tb2RlbC5nZXRXYXRjaEV4cHJlc3Npb25zKCkpO1xuXHR9XG5cblx0bW92ZVdhdGNoRXhwcmVzc2lvbihpZDogc3RyaW5nLCBwb3NpdGlvbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5tb3ZlV2F0Y2hFeHByZXNzaW9uKGlkLCBwb3NpdGlvbik7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVXYXRjaEV4cHJlc3Npb25zKHRoaXMubW9kZWwuZ2V0V2F0Y2hFeHByZXNzaW9ucygpKTtcblx0fVxuXG5cdHJlbW92ZVdhdGNoRXhwcmVzc2lvbnMoaWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnJlbW92ZVdhdGNoRXhwcmVzc2lvbnMoaWQpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlV2F0Y2hFeHByZXNzaW9ucyh0aGlzLm1vZGVsLmdldFdhdGNoRXhwcmVzc2lvbnMoKSk7XG5cdH1cblxuXHQvLy0tLS0gYnJlYWtwb2ludHNcblxuXHRjYW5TZXRCcmVha3BvaW50c0luKG1vZGVsOiBJVGV4dE1vZGVsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYWRhcHRlck1hbmFnZXIuY2FuU2V0QnJlYWtwb2ludHNJbihtb2RlbCk7XG5cdH1cblxuXHRhc3luYyBlbmFibGVPckRpc2FibGVCcmVha3BvaW50cyhlbmFibGU6IGJvb2xlYW4sIGJyZWFrcG9pbnQ/OiBJRW5hYmxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChicmVha3BvaW50KSB7XG5cdFx0XHR0aGlzLm1vZGVsLnNldEVuYWJsZW1lbnQoYnJlYWtwb2ludCwgZW5hYmxlKTtcblx0XHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0XHRpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5tYWtlVHJpZ2dlcmVkQnJlYWtwb2ludHNNYXRjaEVuYWJsZW1lbnQoZW5hYmxlLCBicmVha3BvaW50KTtcblx0XHRcdFx0YXdhaXQgdGhpcy5zZW5kQnJlYWtwb2ludHMoYnJlYWtwb2ludC5vcmlnaW5hbFVyaSk7XG5cdFx0XHR9IGVsc2UgaWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zZW5kRnVuY3Rpb25CcmVha3BvaW50cygpO1xuXHRcdFx0fSBlbHNlIGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgRGF0YUJyZWFrcG9pbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zZW5kRGF0YUJyZWFrcG9pbnRzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBJbnN0cnVjdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zZW5kSW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zZW5kRXhjZXB0aW9uQnJlYWtwb2ludHMoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tb2RlbC5lbmFibGVPckRpc2FibGVBbGxCcmVha3BvaW50cyhlbmFibGUpO1xuXHRcdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHRcdGF3YWl0IHRoaXMuc2VuZEFsbEJyZWFrcG9pbnRzKCk7XG5cdFx0fVxuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdH1cblxuXHRhc3luYyBhZGRCcmVha3BvaW50cyh1cmk6IHVyaSwgcmF3QnJlYWtwb2ludHM6IElCcmVha3BvaW50RGF0YVtdLCBhcmlhQW5ub3VuY2UgPSB0cnVlKTogUHJvbWlzZTxJQnJlYWtwb2ludFtdPiB7XG5cdFx0Y29uc3QgYnJlYWtwb2ludHMgPSB0aGlzLm1vZGVsLmFkZEJyZWFrcG9pbnRzKHVyaSwgcmF3QnJlYWtwb2ludHMpO1xuXHRcdGlmIChhcmlhQW5ub3VuY2UpIHtcblx0XHRcdGJyZWFrcG9pbnRzLmZvckVhY2goYnAgPT4gYXJpYS5zdGF0dXMobmxzLmxvY2FsaXplKCdicmVha3BvaW50QWRkZWQnLCBcIkFkZGVkIGJyZWFrcG9pbnQsIGxpbmUgezB9LCBmaWxlIHsxfVwiLCBicC5saW5lTnVtYmVyLCB1cmkuZnNQYXRoKSkpO1xuXHRcdH1cblxuXHRcdC8vIEluIHNvbWUgY2FzZXMgd2UgbmVlZCB0byBzdG9yZSBicmVha3BvaW50cyBiZWZvcmUgd2Ugc2VuZCB0aGVtIGJlY2F1c2Ugc2VuZGluZyB0aGVtIGNhbiB0YWtlIGEgbG9uZyB0aW1lXG5cdFx0Ly8gQW5kIGFmdGVyIHNlbmRpbmcgdGhlbSBiZWNhdXNlIHRoZSBkZWJ1ZyBhZGFwdGVyIGNhbiBhdHRhY2ggYWRhcHRlciBkYXRhIHRvIGEgYnJlYWtwb2ludFxuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0YXdhaXQgdGhpcy5zZW5kQnJlYWtwb2ludHModXJpKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdHJldHVybiBicmVha3BvaW50cztcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUJyZWFrcG9pbnRzKHVyaTogdXJpLCBkYXRhOiBNYXA8c3RyaW5nLCBJQnJlYWtwb2ludFVwZGF0ZURhdGE+LCBzZW5kT25SZXNvdXJjZVNhdmVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tb2RlbC51cGRhdGVCcmVha3BvaW50cyhkYXRhKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdGlmIChzZW5kT25SZXNvdXJjZVNhdmVkKSB7XG5cdFx0XHR0aGlzLmJyZWFrcG9pbnRzVG9TZW5kT25SZXNvdXJjZVNhdmVkLmFkZCh1cmkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLnNlbmRCcmVha3BvaW50cyh1cmkpO1xuXHRcdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZW1vdmVCcmVha3BvaW50cyhpZD86IHN0cmluZyB8IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYnJlYWtwb2ludHMgPSB0aGlzLm1vZGVsLmdldEJyZWFrcG9pbnRzKCk7XG5cdFx0Y29uc3QgdG9SZW1vdmUgPSBpZCA9PT0gdW5kZWZpbmVkXG5cdFx0XHQ/IGJyZWFrcG9pbnRzXG5cdFx0XHQ6IGlkIGluc3RhbmNlb2YgQXJyYXlcblx0XHRcdFx0PyBicmVha3BvaW50cy5maWx0ZXIoYnAgPT4gaWQuaW5jbHVkZXMoYnAuZ2V0SWQoKSkpXG5cdFx0XHRcdDogYnJlYWtwb2ludHMuZmlsdGVyKGJwID0+IGJwLmdldElkKCkgPT09IGlkKTtcblx0XHQvLyBub3RlOiB1c2luZyB0aGUgZGVidWdnZXItcmVzb2x2ZWQgdXJpIGZvciBhcmlhIHRvIHJlZmxlY3QgVUkgc3RhdGVcblx0XHR0b1JlbW92ZS5mb3JFYWNoKGJwID0+IGFyaWEuc3RhdHVzKG5scy5sb2NhbGl6ZSgnYnJlYWtwb2ludFJlbW92ZWQnLCBcIlJlbW92ZWQgYnJlYWtwb2ludCwgbGluZSB7MH0sIGZpbGUgezF9XCIsIGJwLmxpbmVOdW1iZXIsIGJwLnVyaS5mc1BhdGgpKSk7XG5cdFx0Y29uc3QgdXJpc1RvQ2xlYXIgPSBuZXcgU2V0KHRvUmVtb3ZlLm1hcChicCA9PiBicC5vcmlnaW5hbFVyaS50b1N0cmluZygpKSk7XG5cblx0XHR0aGlzLm1vZGVsLnJlbW92ZUJyZWFrcG9pbnRzKHRvUmVtb3ZlKTtcblx0XHR0aGlzLnVubGlua1RyaWdnZXJlZEJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzLCB0b1JlbW92ZSkuZm9yRWFjaCh1cmkgPT4gdXJpc1RvQ2xlYXIuYWRkKHVyaS50b1N0cmluZygpKSk7XG5cblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi51cmlzVG9DbGVhcl0ubWFwKHVyaSA9PiB0aGlzLnNlbmRCcmVha3BvaW50cyhVUkkucGFyc2UodXJpKSkpKTtcblx0fVxuXG5cdHNldEJyZWFrcG9pbnRzQWN0aXZhdGVkKGFjdGl2YXRlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubW9kZWwuc2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQoYWN0aXZhdGVkKTtcblx0XHRyZXR1cm4gdGhpcy5zZW5kQWxsQnJlYWtwb2ludHMoKTtcblx0fVxuXG5cdGFzeW5jIGFkZEZ1bmN0aW9uQnJlYWtwb2ludChvcHRzPzogSUZ1bmN0aW9uQnJlYWtwb2ludE9wdGlvbnMsIGlkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tb2RlbC5hZGRGdW5jdGlvbkJyZWFrcG9pbnQob3B0cyA/PyB7IG5hbWU6ICcnIH0sIGlkKTtcblx0XHQvLyBJZiBvcHRzIG5vdCBwcm92aWRlZCwgc2VuZGluZyB0aGUgYnJlYWtwb2ludCBpcyBoYW5kbGVkIGJ5IGEgbGF0ZXIgdG8gY2FsbCB0byBgdXBkYXRlRnVuY3Rpb25CcmVha3BvaW50YFxuXHRcdGlmIChvcHRzKSB7XG5cdFx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdFx0YXdhaXQgdGhpcy5zZW5kRnVuY3Rpb25CcmVha3BvaW50cygpO1xuXHRcdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB1cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnQoaWQ6IHN0cmluZywgdXBkYXRlOiB7IG5hbWU/OiBzdHJpbmc7IGhpdENvbmRpdGlvbj86IHN0cmluZzsgY29uZGl0aW9uPzogc3RyaW5nIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm1vZGVsLnVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludChpZCwgdXBkYXRlKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdGF3YWl0IHRoaXMuc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKTtcblx0fVxuXG5cdGFzeW5jIHJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMoaWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm1vZGVsLnJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMoaWQpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0YXdhaXQgdGhpcy5zZW5kRnVuY3Rpb25CcmVha3BvaW50cygpO1xuXHR9XG5cblx0YXN5bmMgYWRkRGF0YUJyZWFrcG9pbnQob3B0czogSURhdGFCcmVha3BvaW50T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubW9kZWwuYWRkRGF0YUJyZWFrcG9pbnQob3B0cyk7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHRhd2FpdCB0aGlzLnNlbmREYXRhQnJlYWtwb2ludHMoKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlRGF0YUJyZWFrcG9pbnQoaWQ6IHN0cmluZywgdXBkYXRlOiB7IGhpdENvbmRpdGlvbj86IHN0cmluZzsgY29uZGl0aW9uPzogc3RyaW5nIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm1vZGVsLnVwZGF0ZURhdGFCcmVha3BvaW50KGlkLCB1cGRhdGUpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0YXdhaXQgdGhpcy5zZW5kRGF0YUJyZWFrcG9pbnRzKCk7XG5cdH1cblxuXHRhc3luYyByZW1vdmVEYXRhQnJlYWtwb2ludHMoaWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm1vZGVsLnJlbW92ZURhdGFCcmVha3BvaW50cyhpZCk7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHRhd2FpdCB0aGlzLnNlbmREYXRhQnJlYWtwb2ludHMoKTtcblx0fVxuXG5cdGFzeW5jIGFkZEluc3RydWN0aW9uQnJlYWtwb2ludChvcHRzOiBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubW9kZWwuYWRkSW5zdHJ1Y3Rpb25CcmVha3BvaW50KG9wdHMpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0YXdhaXQgdGhpcy5zZW5kSW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdH1cblxuXHRhc3luYyByZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKGluc3RydWN0aW9uUmVmZXJlbmNlPzogc3RyaW5nLCBvZmZzZXQ/OiBudW1iZXIsIGFkZHJlc3M/OiBiaWdpbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm1vZGVsLnJlbW92ZUluc3RydWN0aW9uQnJlYWtwb2ludHMoaW5zdHJ1Y3Rpb25SZWZlcmVuY2UsIG9mZnNldCwgYWRkcmVzcyk7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHRhd2FpdCB0aGlzLnNlbmRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKCk7XG5cdH1cblxuXHRzZXRFeGNlcHRpb25CcmVha3BvaW50RmFsbGJhY2tTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5tb2RlbC5zZXRFeGNlcHRpb25CcmVha3BvaW50RmFsbGJhY2tTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0fVxuXG5cdHNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbihzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBmaWx0ZXJzOiBEZWJ1Z1Byb3RvY29sLkV4Y2VwdGlvbkJyZWFrcG9pbnRzRmlsdGVyW10pOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbihzZXNzaW9uLmdldElkKCksIGZpbHRlcnMpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdH1cblxuXHRhc3luYyBzZXRFeGNlcHRpb25CcmVha3BvaW50Q29uZGl0aW9uKGV4Y2VwdGlvbkJyZWFrcG9pbnQ6IElFeGNlcHRpb25CcmVha3BvaW50LCBjb25kaXRpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubW9kZWwuc2V0RXhjZXB0aW9uQnJlYWtwb2ludENvbmRpdGlvbihleGNlcHRpb25CcmVha3BvaW50LCBjb25kaXRpb24pO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0YXdhaXQgdGhpcy5zZW5kRXhjZXB0aW9uQnJlYWtwb2ludHMoKTtcblx0fVxuXG5cdGFzeW5jIHNlbmRBbGxCcmVha3BvaW50cyhzZXNzaW9uPzogSURlYnVnU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNldEJyZWFrcG9pbnRzUHJvbWlzZXMgPSBkaXN0aW5jdCh0aGlzLm1vZGVsLmdldEJyZWFrcG9pbnRzKCksIGJwID0+IGJwLm9yaWdpbmFsVXJpLnRvU3RyaW5nKCkpXG5cdFx0XHQubWFwKGJwID0+IHRoaXMuc2VuZEJyZWFrcG9pbnRzKGJwLm9yaWdpbmFsVXJpLCBmYWxzZSwgc2Vzc2lvbikpO1xuXG5cdFx0Ly8gSWYgc2VuZGluZyBicmVha3BvaW50cyB0byBvbmUgc2Vzc2lvbiB3aGljaCB3ZSBrbm93IHN1cHBvcnRzIHRoZSBjb25maWd1cmF0aW9uRG9uZSByZXF1ZXN0LCBjYW4gbWFrZSBhbGwgcmVxdWVzdHMgaW4gcGFyYWxsZWxcblx0XHRpZiAoc2Vzc2lvbj8uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29uZmlndXJhdGlvbkRvbmVSZXF1ZXN0KSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdC4uLnNldEJyZWFrcG9pbnRzUHJvbWlzZXMsXG5cdFx0XHRcdHRoaXMuc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoc2Vzc2lvbiksXG5cdFx0XHRcdHRoaXMuc2VuZERhdGFCcmVha3BvaW50cyhzZXNzaW9uKSxcblx0XHRcdFx0dGhpcy5zZW5kSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyhzZXNzaW9uKSxcblx0XHRcdFx0dGhpcy5zZW5kRXhjZXB0aW9uQnJlYWtwb2ludHMoc2Vzc2lvbiksXG5cdFx0XHRdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2V0QnJlYWtwb2ludHNQcm9taXNlcyk7XG5cdFx0XHRhd2FpdCB0aGlzLnNlbmRGdW5jdGlvbkJyZWFrcG9pbnRzKHNlc3Npb24pO1xuXHRcdFx0YXdhaXQgdGhpcy5zZW5kRGF0YUJyZWFrcG9pbnRzKHNlc3Npb24pO1xuXHRcdFx0YXdhaXQgdGhpcy5zZW5kSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyhzZXNzaW9uKTtcblx0XHRcdC8vIHNlbmQgZXhjZXB0aW9uIGJyZWFrcG9pbnRzIGF0IHRoZSBlbmQgc2luY2Ugc29tZSBkZWJ1ZyBhZGFwdGVycyBtYXkgcmVseSBvbiB0aGUgb3JkZXIgLSB0aGlzIHdhcyB0aGUgY2FzZSBiZWZvcmVcblx0XHRcdC8vIHRoZSBjb25maWd1cmF0aW9uRG9uZSByZXF1ZXN0IHdhcyBpbnRyb2R1Y2VkLlxuXHRcdFx0YXdhaXQgdGhpcy5zZW5kRXhjZXB0aW9uQnJlYWtwb2ludHMoc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgdGhlIGNvbmRpdGlvbiBvZiB0cmlnZ2VyZWQgYnJlYWtwb2ludHMgdGhhdCBkZXBlbmRlZCBvblxuXHQgKiBicmVha3BvaW50cyBpbiBgcmVtb3ZlZEJyZWFrcG9pbnRzYC4gUmV0dXJucyB0aGUgVVJJcyBvZiByZXNvdXJjZXMgdGhhdFxuXHQgKiBoYWQgdGhlaXIgYnJlYWtwb2ludHMgY2hhbmdlZCBpbiB0aGlzIHdheS5cblx0ICovXG5cdHByaXZhdGUgdW5saW5rVHJpZ2dlcmVkQnJlYWtwb2ludHMoYWxsQnJlYWtwb2ludHM6IHJlYWRvbmx5IElCcmVha3BvaW50W10sIHJlbW92ZWRCcmVha3BvaW50czogcmVhZG9ubHkgSUJyZWFrcG9pbnRbXSk6IHVyaVtdIHtcblx0XHRjb25zdCBhZmZlY3RlZFVyaXM6IHVyaVtdID0gW107XG5cdFx0Zm9yIChjb25zdCByZW1vdmVkIG9mIHJlbW92ZWRCcmVha3BvaW50cykge1xuXHRcdFx0Zm9yIChjb25zdCBleGlzdGluZyBvZiBhbGxCcmVha3BvaW50cykge1xuXHRcdFx0XHRpZiAoIXJlbW92ZWRCcmVha3BvaW50cy5pbmNsdWRlcyhleGlzdGluZykgJiYgZXhpc3RpbmcudHJpZ2dlcmVkQnkgPT09IHJlbW92ZWQuZ2V0SWQoKSkge1xuXHRcdFx0XHRcdHRoaXMubW9kZWwudXBkYXRlQnJlYWtwb2ludHMobmV3IE1hcChbW2V4aXN0aW5nLmdldElkKCksIHsgdHJpZ2dlcmVkQnk6IHVuZGVmaW5lZCB9XV0pKTtcblx0XHRcdFx0XHRhZmZlY3RlZFVyaXMucHVzaChleGlzdGluZy5vcmlnaW5hbFVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYWZmZWN0ZWRVcmlzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtYWtlVHJpZ2dlcmVkQnJlYWtwb2ludHNNYXRjaEVuYWJsZW1lbnQoZW5hYmxlOiBib29sZWFuLCBicmVha3BvaW50OiBCcmVha3BvaW50KSB7XG5cdFx0aWYgKGVuYWJsZSkge1xuXHRcdFx0LyoqIElmIHRoZSBicmVha3BvaW50IGlzIGJlaW5nIGVuYWJsZWQsIGFsc28gZW5zdXJlIGl0cyB0cmlnZ2VyZXIgaXMgZW5hYmxlZCAqL1xuXHRcdFx0aWYgKGJyZWFrcG9pbnQudHJpZ2dlcmVkQnkpIHtcblx0XHRcdFx0Y29uc3QgdHJpZ2dlciA9IHRoaXMubW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5maW5kKGJwID0+IGJyZWFrcG9pbnQudHJpZ2dlcmVkQnkgPT09IGJwLmdldElkKCkpO1xuXHRcdFx0XHRpZiAodHJpZ2dlciAmJiAhdHJpZ2dlci5lbmFibGVkKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyhlbmFibGUsIHRyaWdnZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHQvKiogTWFrZXMgaXRzIHRyaWdnZXJlZSBzdGF0ZXMgbWF0Y2ggdGhlIHN0YXRlIG9mIHRoaXMgYnJlYWtwb2ludCAqL1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHRoaXMubW9kZWwuZ2V0QnJlYWtwb2ludHMoKVxuXHRcdFx0LmZpbHRlcihicCA9PiBicC50cmlnZ2VyZWRCeSA9PT0gYnJlYWtwb2ludC5nZXRJZCgpICYmIGJwLmVuYWJsZWQgIT09IGVuYWJsZSlcblx0XHRcdC5tYXAoYnAgPT4gdGhpcy5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyhlbmFibGUsIGJwKSlcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHNlbmRCcmVha3BvaW50cyhtb2RlbFVyaTogdXJpLCBzb3VyY2VNb2RpZmllZCA9IGZhbHNlLCBzZXNzaW9uPzogSURlYnVnU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJyZWFrcG9pbnRzVG9TZW5kID0gdGhpcy5tb2RlbC5nZXRCcmVha3BvaW50cyh7IG9yaWdpbmFsVXJpOiBtb2RlbFVyaSwgZW5hYmxlZE9ubHk6IHRydWUgfSk7XG5cdFx0YXdhaXQgc2VuZFRvT25lT3JBbGxTZXNzaW9ucyh0aGlzLm1vZGVsLCBzZXNzaW9uLCBhc3luYyBzID0+IHtcblx0XHRcdGlmICghcy5jb25maWd1cmF0aW9uLm5vRGVidWcpIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbkJwcyA9IGJyZWFrcG9pbnRzVG9TZW5kLmZpbHRlcihicCA9PiAhYnAudHJpZ2dlcmVkQnkgfHwgYnAuZ2V0U2Vzc2lvbkRpZFRyaWdnZXIocy5nZXRJZCgpKSk7XG5cdFx0XHRcdGF3YWl0IHMuc2VuZEJyZWFrcG9pbnRzKG1vZGVsVXJpLCBzZXNzaW9uQnBzLCBzb3VyY2VNb2RpZmllZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlbmRGdW5jdGlvbkJyZWFrcG9pbnRzKHNlc3Npb24/OiBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYnJlYWtwb2ludHNUb1NlbmQgPSB0aGlzLm1vZGVsLmdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKS5maWx0ZXIoZmJwID0+IGZicC5lbmFibGVkICYmIHRoaXMubW9kZWwuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSk7XG5cblx0XHRhd2FpdCBzZW5kVG9PbmVPckFsbFNlc3Npb25zKHRoaXMubW9kZWwsIHNlc3Npb24sIGFzeW5jIHMgPT4ge1xuXHRcdFx0aWYgKHMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzRnVuY3Rpb25CcmVha3BvaW50cyAmJiAhcy5jb25maWd1cmF0aW9uLm5vRGVidWcpIHtcblx0XHRcdFx0YXdhaXQgcy5zZW5kRnVuY3Rpb25CcmVha3BvaW50cyhicmVha3BvaW50c1RvU2VuZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlbmREYXRhQnJlYWtwb2ludHMoc2Vzc2lvbj86IElEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBicmVha3BvaW50c1RvU2VuZCA9IHRoaXMubW9kZWwuZ2V0RGF0YUJyZWFrcG9pbnRzKCkuZmlsdGVyKGZicCA9PiBmYnAuZW5hYmxlZCAmJiB0aGlzLm1vZGVsLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCkpO1xuXG5cdFx0YXdhaXQgc2VuZFRvT25lT3JBbGxTZXNzaW9ucyh0aGlzLm1vZGVsLCBzZXNzaW9uLCBhc3luYyBzID0+IHtcblx0XHRcdGlmIChzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0RhdGFCcmVha3BvaW50cyAmJiAhcy5jb25maWd1cmF0aW9uLm5vRGVidWcpIHtcblx0XHRcdFx0YXdhaXQgcy5zZW5kRGF0YUJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzVG9TZW5kKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VuZEluc3RydWN0aW9uQnJlYWtwb2ludHMoc2Vzc2lvbj86IElEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBicmVha3BvaW50c1RvU2VuZCA9IHRoaXMubW9kZWwuZ2V0SW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpLmZpbHRlcihmYnAgPT4gZmJwLmVuYWJsZWQgJiYgdGhpcy5tb2RlbC5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpKTtcblxuXHRcdGF3YWl0IHNlbmRUb09uZU9yQWxsU2Vzc2lvbnModGhpcy5tb2RlbCwgc2Vzc2lvbiwgYXN5bmMgcyA9PiB7XG5cdFx0XHRpZiAocy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNJbnN0cnVjdGlvbkJyZWFrcG9pbnRzICYmICFzLmNvbmZpZ3VyYXRpb24ubm9EZWJ1Zykge1xuXHRcdFx0XHRhd2FpdCBzLnNlbmRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKGJyZWFrcG9pbnRzVG9TZW5kKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKHNlc3Npb24/OiBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHNlbmRUb09uZU9yQWxsU2Vzc2lvbnModGhpcy5tb2RlbCwgc2Vzc2lvbiwgYXN5bmMgcyA9PiB7XG5cdFx0XHRjb25zdCBlbmFibGVkRXhjZXB0aW9uQnBzID0gdGhpcy5tb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24ocy5nZXRJZCgpKS5maWx0ZXIoZXhiID0+IGV4Yi5lbmFibGVkKTtcblx0XHRcdGlmIChzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbmZpZ3VyYXRpb25Eb25lUmVxdWVzdCAmJiAoIXMuY2FwYWJpbGl0aWVzLmV4Y2VwdGlvbkJyZWFrcG9pbnRGaWx0ZXJzIHx8IHMuY2FwYWJpbGl0aWVzLmV4Y2VwdGlvbkJyZWFrcG9pbnRGaWx0ZXJzLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdFx0Ly8gT25seSBjYWxsIGBzZXRFeGNlcHRpb25CcmVha3BvaW50c2AgYXMgc3BlY2lmaWVkIGluIGRhcCBwcm90b2NvbCAjOTAwMDFcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzLmNvbmZpZ3VyYXRpb24ubm9EZWJ1Zykge1xuXHRcdFx0XHRhd2FpdCBzLnNlbmRFeGNlcHRpb25CcmVha3BvaW50cyhlbmFibGVkRXhjZXB0aW9uQnBzKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25GaWxlQ2hhbmdlcyhmaWxlQ2hhbmdlc0V2ZW50OiBGaWxlQ2hhbmdlc0V2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdG9SZW1vdmUgPSB0aGlzLm1vZGVsLmdldEJyZWFrcG9pbnRzKCkuZmlsdGVyKGJwID0+XG5cdFx0XHRmaWxlQ2hhbmdlc0V2ZW50LmNvbnRhaW5zKGJwLm9yaWdpbmFsVXJpLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSk7XG5cdFx0aWYgKHRvUmVtb3ZlLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5tb2RlbC5yZW1vdmVCcmVha3BvaW50cyh0b1JlbW92ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9TZW5kOiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdXJpIG9mIHRoaXMuYnJlYWtwb2ludHNUb1NlbmRPblJlc291cmNlU2F2ZWQpIHtcblx0XHRcdGlmIChmaWxlQ2hhbmdlc0V2ZW50LmNvbnRhaW5zKHVyaSwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCkpIHtcblx0XHRcdFx0dG9TZW5kLnB1c2godXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0b1NlbmQpIHtcblx0XHRcdHRoaXMuYnJlYWtwb2ludHNUb1NlbmRPblJlc291cmNlU2F2ZWQuZGVsZXRlKHVyaSk7XG5cdFx0XHR0aGlzLnNlbmRCcmVha3BvaW50cyh1cmksIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJ1blRvKHVyaTogdXJpLCBsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbj86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBicmVha3BvaW50VG9SZW1vdmU6IElCcmVha3BvaW50IHwgdW5kZWZpbmVkO1xuXHRcdGxldCB0aHJlYWRUb0NvbnRpbnVlID0gdGhpcy5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkVGhyZWFkO1xuXHRcdGNvbnN0IGFkZFRlbXBCcmVha1BvaW50ID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnBFeGlzdHMgPSAhISh0aGlzLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoeyBjb2x1bW4sIGxpbmVOdW1iZXIsIHVyaSB9KS5sZW5ndGgpO1xuXG5cdFx0XHRpZiAoIWJwRXhpc3RzKSB7XG5cdFx0XHRcdGNvbnN0IGFkZFJlc3VsdCA9IGF3YWl0IHRoaXMuYWRkQW5kVmFsaWRhdGVCcmVha3BvaW50cyh1cmksIGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHRcdGlmIChhZGRSZXN1bHQudGhyZWFkKSB7XG5cdFx0XHRcdFx0dGhyZWFkVG9Db250aW51ZSA9IGFkZFJlc3VsdC50aHJlYWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYWRkUmVzdWx0LmJyZWFrcG9pbnQpIHtcblx0XHRcdFx0XHRicmVha3BvaW50VG9SZW1vdmUgPSBhZGRSZXN1bHQuYnJlYWtwb2ludDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgdGhyZWFkVG9Db250aW51ZSwgYnJlYWtwb2ludFRvUmVtb3ZlIH07XG5cdFx0fTtcblx0XHRjb25zdCByZW1vdmVUZW1wQnJlYWtQb2ludCA9IChzdGF0ZTogU3RhdGUpOiBib29sZWFuID0+IHtcblx0XHRcdGlmIChzdGF0ZSA9PT0gU3RhdGUuU3RvcHBlZCB8fCBzdGF0ZSA9PT0gU3RhdGUuSW5hY3RpdmUpIHtcblx0XHRcdFx0aWYgKGJyZWFrcG9pbnRUb1JlbW92ZSkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludFRvUmVtb3ZlLmdldElkKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH07XG5cblx0XHRhd2FpdCBhZGRUZW1wQnJlYWtQb2ludCgpO1xuXHRcdGlmICh0aGlzLnN0YXRlID09PSBTdGF0ZS5JbmFjdGl2ZSkge1xuXHRcdFx0Ly8gSWYgbm8gc2Vzc2lvbiBleGlzdHMgc3RhcnQgdGhlIGRlYnVnZ2VyXG5cdFx0XHRjb25zdCB7IGxhdW5jaCwgbmFtZSwgZ2V0Q29uZmlnIH0gPSB0aGlzLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCkuc2VsZWN0ZWRDb25maWd1cmF0aW9uO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgZ2V0Q29uZmlnKCk7XG5cdFx0XHRjb25zdCBjb25maWdPck5hbWUgPSBjb25maWcgPyBPYmplY3QuYXNzaWduKGRlZXBDbG9uZShjb25maWcpLCB7fSkgOiBuYW1lO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLm9uRGlkQ2hhbmdlU3RhdGUoc3RhdGUgPT4ge1xuXHRcdFx0XHRpZiAocmVtb3ZlVGVtcEJyZWFrUG9pbnQoc3RhdGUpKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRoaXMuc3RhcnREZWJ1Z2dpbmcobGF1bmNoLCBjb25maWdPck5hbWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnN0YXRlID09PSBTdGF0ZS5TdG9wcGVkKSB7XG5cdFx0XHRjb25zdCBmb2N1c2VkU2Vzc2lvbiA9IHRoaXMuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb247XG5cdFx0XHRpZiAoIWZvY3VzZWRTZXNzaW9uIHx8ICF0aHJlYWRUb0NvbnRpbnVlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aHJlYWRUb0NvbnRpbnVlLnNlc3Npb24ub25EaWRDaGFuZ2VTdGF0ZSgoKSA9PiB7XG5cdFx0XHRcdGlmIChyZW1vdmVUZW1wQnJlYWtQb2ludChmb2N1c2VkU2Vzc2lvbi5zdGF0ZSkpIHtcblx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgdGhyZWFkVG9Db250aW51ZS5jb250aW51ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWRkQW5kVmFsaWRhdGVCcmVha3BvaW50cyh1cmk6IFVSSSwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIpIHtcblx0XHRjb25zdCBkZWJ1Z01vZGVsID0gdGhpcy5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuZ2V0Vmlld01vZGVsKCk7XG5cblx0XHRjb25zdCBicmVha3BvaW50cyA9IGF3YWl0IHRoaXMuYWRkQnJlYWtwb2ludHModXJpLCBbeyBsaW5lTnVtYmVyLCBjb2x1bW4gfV0sIGZhbHNlKTtcblx0XHRjb25zdCBicmVha3BvaW50ID0gYnJlYWtwb2ludHM/LlswXTtcblx0XHRpZiAoIWJyZWFrcG9pbnQpIHtcblx0XHRcdHJldHVybiB7IGJyZWFrcG9pbnQ6IHVuZGVmaW5lZCwgdGhyZWFkOiB2aWV3TW9kZWwuZm9jdXNlZFRocmVhZCB9O1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBicmVha3BvaW50IHdhcyBub3QgaW5pdGlhbGx5IHZlcmlmaWVkLCB3YWl0IHVwIHRvIDJzIGZvciBpdCB0byBiZWNvbWUgc28uXG5cdFx0Ly8gSW5oZXJlbnRseSByYWNleSBpZiBtdWx0aXBsZSBzZXNzaW9ucyBjYW4gdmVyaWZ5IGFzeW5jLCBidXQgbm90IHNvbHZhYmxlLi4uXG5cdFx0aWYgKCFicmVha3BvaW50LnZlcmlmaWVkKSB7XG5cdFx0XHRsZXQgbGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXHRcdFx0YXdhaXQgcmFjZVRpbWVvdXQobmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGxpc3RlbmVyID0gZGVidWdNb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKCgpID0+IHtcblx0XHRcdFx0XHRpZiAoYnJlYWtwb2ludC52ZXJpZmllZCkge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KSwgMjAwMCk7XG5cdFx0XHRsaXN0ZW5lciEuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIExvb2sgYXQgcGF1c2VkIHRocmVhZHMgZm9yIHNlc3Npb25zIHRoYXQgdmVyaWZpZWQgdGhpcyBicC4gUHJlZmVyLCBpbiBvcmRlcjpcblx0XHRjb25zdCBlbnVtIFNjb3JlIHtcblx0XHRcdC8qKiBUaGUgZm9jdXNlZCB0aHJlYWQgKi9cblx0XHRcdEZvY3VzZWQsXG5cdFx0XHQvKiogQW55IG90aGVyIHN0b3BwZWQgdGhyZWFkIG9mIGEgc2Vzc2lvbiB0aGF0IHZlcmlmaWVkIHRoZSBicCAqL1xuXHRcdFx0VmVyaWZpZWQsXG5cdFx0XHQvKiogQW55IHRocmVhZCB0aGF0IHZlcmlmaWVkIGFuZCBwYXVzZWQgaW4gdGhlIHNhbWUgZmlsZSAqL1xuXHRcdFx0VmVyaWZpZWRBbmRQYXVzZWRJbkZpbGUsXG5cdFx0XHQvKiogVGhlIGZvY3VzZWQgdGhyZWFkIGlmIGl0IHZlcmlmaWVkIHRoZSBicmVha3BvaW50ICovXG5cdFx0XHRWZXJpZmllZEFuZEZvY3VzZWQsXG5cdFx0fVxuXG5cdFx0bGV0IGJlc3RUaHJlYWQgPSB2aWV3TW9kZWwuZm9jdXNlZFRocmVhZDtcblx0XHRsZXQgYmVzdFNjb3JlID0gU2NvcmUuRm9jdXNlZDtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb25JZCBvZiBicmVha3BvaW50LnNlc3Npb25zVGhhdFZlcmlmaWVkKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gZGVidWdNb2RlbC5nZXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRocmVhZHMgPSBzZXNzaW9uLmdldEFsbFRocmVhZHMoKS5maWx0ZXIodCA9PiB0LnN0b3BwZWQpO1xuXHRcdFx0aWYgKGJlc3RTY29yZSA8IFNjb3JlLlZlcmlmaWVkQW5kRm9jdXNlZCkge1xuXHRcdFx0XHRpZiAodmlld01vZGVsLmZvY3VzZWRUaHJlYWQgJiYgdGhyZWFkcy5pbmNsdWRlcyh2aWV3TW9kZWwuZm9jdXNlZFRocmVhZCkpIHtcblx0XHRcdFx0XHRiZXN0VGhyZWFkID0gdmlld01vZGVsLmZvY3VzZWRUaHJlYWQ7XG5cdFx0XHRcdFx0YmVzdFNjb3JlID0gU2NvcmUuVmVyaWZpZWRBbmRGb2N1c2VkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChiZXN0U2NvcmUgPCBTY29yZS5WZXJpZmllZEFuZFBhdXNlZEluRmlsZSkge1xuXHRcdFx0XHRjb25zdCBwYXVzZWRJblRoaXNGaWxlID0gdGhyZWFkcy5maW5kKHQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRvcCA9IHQuZ2V0VG9wU3RhY2tGcmFtZSgpO1xuXHRcdFx0XHRcdHJldHVybiB0b3AgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodG9wLnNvdXJjZS51cmksIHVyaSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChwYXVzZWRJblRoaXNGaWxlKSB7XG5cdFx0XHRcdFx0YmVzdFRocmVhZCA9IHBhdXNlZEluVGhpc0ZpbGU7XG5cdFx0XHRcdFx0YmVzdFNjb3JlID0gU2NvcmUuVmVyaWZpZWRBbmRQYXVzZWRJbkZpbGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGJlc3RTY29yZSA8IFNjb3JlLlZlcmlmaWVkKSB7XG5cdFx0XHRcdGJlc3RUaHJlYWQgPSB0aHJlYWRzWzBdO1xuXHRcdFx0XHRiZXN0U2NvcmUgPSBTY29yZS5WZXJpZmllZEFuZFBhdXNlZEluRmlsZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB0aHJlYWQ6IGJlc3RUaHJlYWQsIGJyZWFrcG9pbnQgfTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RhY2tGcmFtZVRocmVhZEFuZFNlc3Npb25Ub0ZvY3VzKG1vZGVsOiBJRGVidWdNb2RlbCwgc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQsIHRocmVhZD86IElUaHJlYWQsIHNlc3Npb24/OiBJRGVidWdTZXNzaW9uLCBhdm9pZFNlc3Npb24/OiBJRGVidWdTZXNzaW9uKTogeyBzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSB8IHVuZGVmaW5lZDsgdGhyZWFkOiBJVGhyZWFkIHwgdW5kZWZpbmVkOyBzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkIH0ge1xuXHRpZiAoIXNlc3Npb24pIHtcblx0XHRpZiAoc3RhY2tGcmFtZSB8fCB0aHJlYWQpIHtcblx0XHRcdHNlc3Npb24gPSBzdGFja0ZyYW1lID8gc3RhY2tGcmFtZS50aHJlYWQuc2Vzc2lvbiA6IHRocmVhZCEuc2Vzc2lvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBtb2RlbC5nZXRTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc3RvcHBlZFNlc3Npb24gPSBzZXNzaW9ucy5maW5kKHMgPT4gcy5zdGF0ZSA9PT0gU3RhdGUuU3RvcHBlZCk7XG5cdFx0XHQvLyBNYWtlIHN1cmUgdG8gbm90IGZvY3VzIHNlc3Npb24gdGhhdCBpcyBnb2luZyBkb3duXG5cdFx0XHRzZXNzaW9uID0gc3RvcHBlZFNlc3Npb24gfHwgc2Vzc2lvbnMuZmluZChzID0+IHMgIT09IGF2b2lkU2Vzc2lvbiAmJiBzICE9PSBhdm9pZFNlc3Npb24/LnBhcmVudFNlc3Npb24pIHx8IChzZXNzaW9ucy5sZW5ndGggPyBzZXNzaW9uc1swXSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKCF0aHJlYWQpIHtcblx0XHRpZiAoc3RhY2tGcmFtZSkge1xuXHRcdFx0dGhyZWFkID0gc3RhY2tGcmFtZS50aHJlYWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHRocmVhZHMgPSBzZXNzaW9uID8gc2Vzc2lvbi5nZXRBbGxUaHJlYWRzKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzdG9wcGVkVGhyZWFkID0gdGhyZWFkcyAmJiB0aHJlYWRzLmZpbmQodCA9PiB0LnN0b3BwZWQpO1xuXHRcdFx0dGhyZWFkID0gc3RvcHBlZFRocmVhZCB8fCAodGhyZWFkcyAmJiB0aHJlYWRzLmxlbmd0aCA/IHRocmVhZHNbMF0gOiB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdGlmICghc3RhY2tGcmFtZSAmJiB0aHJlYWQpIHtcblx0XHRzdGFja0ZyYW1lID0gdGhyZWFkLmdldFRvcFN0YWNrRnJhbWUoKTtcblx0fVxuXG5cdHJldHVybiB7IHNlc3Npb24sIHRocmVhZCwgc3RhY2tGcmFtZSB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBzZW5kVG9PbmVPckFsbFNlc3Npb25zKG1vZGVsOiBEZWJ1Z01vZGVsLCBzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkLCBzZW5kOiAoc2Vzc2lvbjogSURlYnVnU2Vzc2lvbikgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAoc2Vzc2lvbikge1xuXHRcdGF3YWl0IHNlbmQoc2Vzc2lvbik7XG5cdH0gZWxzZSB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwobW9kZWwuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzZW5kKHMpKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxVQUFVO0FBQ3RCLFNBQWtCLGdCQUFnQjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQixtQkFBbUI7QUFDOUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQW9DO0FBQzdDLFNBQVMsV0FBVyxjQUFjO0FBRWxDLE9BQU8sY0FBYztBQUNyQixTQUFTLFdBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0JBQW9CO0FBRTdCLFlBQVksU0FBUztBQUNyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBa0Msb0JBQW9CO0FBQy9ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTRDLHNCQUFzQjtBQUMzRSxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLHdCQUF3Qiw2QkFBNkI7QUFDOUQsU0FBUyxr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
