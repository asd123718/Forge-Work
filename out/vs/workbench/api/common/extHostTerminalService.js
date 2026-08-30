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
import { Emitter } from "../../../base/common/event.js";
import { MainContext } from "./extHost.protocol.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { URI } from "../../../base/common/uri.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { DisposableStore, Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { Disposable as VSCodeDisposable, EnvironmentVariableMutatorType } from "./extHostTypes.js";
import { localize } from "../../../nls.js";
import { NotSupportedError } from "../../../base/common/errors.js";
import { serializeEnvironmentDescriptionMap, serializeEnvironmentVariableCollection } from "../../../platform/terminal/common/environmentVariableShared.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ProcessPropertyType, WindowsShellType } from "../../../platform/terminal/common/terminal.js";
import { TerminalDataBufferer } from "../../../platform/terminal/common/terminalDataBuffering.js";
import { ThemeColor } from "../../../base/common/themables.js";
import { Promises } from "../../../base/common/async.js";
import { TerminalCompletionList, TerminalQuickFix, ViewColumn } from "./extHostTypeConverters.js";
import { IExtHostCommands } from "./extHostCommands.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { isWindows } from "../../../base/common/platform.js";
import { hasKey } from "../../../base/common/types.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
const IExtHostTerminalService = createDecorator("IExtHostTerminalService");
class ExtHostTerminal extends Disposable {
  constructor(_proxy, _id, _creationOptions, _name) {
    super();
    this._proxy = _proxy;
    this._id = _id;
    this._creationOptions = _creationOptions;
    this._name = _name;
    this._disposed = false;
    this._state = { isInteractedWith: false, shell: void 0 };
    this.isOpen = false;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._creationOptions = Object.freeze(this._creationOptions);
    this._pidPromise = new Promise((c) => this._pidPromiseComplete = c);
    const that = this;
    this.value = {
      get name() {
        return that._name || "";
      },
      get processId() {
        return that._pidPromise;
      },
      get creationOptions() {
        return that._creationOptions;
      },
      get exitStatus() {
        return that._exitStatus;
      },
      get state() {
        return that._state;
      },
      get selection() {
        return that._selection;
      },
      get shellIntegration() {
        return that.shellIntegration;
      },
      sendText(text, shouldExecute = true) {
        that._checkDisposed();
        that._proxy.$sendText(that._id, text, shouldExecute);
      },
      show(preserveFocus) {
        that._checkDisposed();
        that._proxy.$show(that._id, preserveFocus);
      },
      hide() {
        that._checkDisposed();
        that._proxy.$hide(that._id);
      },
      dispose() {
        if (!that._disposed) {
          that._disposed = true;
          that._proxy.$dispose(that._id);
        }
      },
      get dimensions() {
        if (that._cols === void 0 || that._rows === void 0) {
          return void 0;
        }
        return {
          columns: that._cols,
          rows: that._rows
        };
      }
    };
  }
  dispose() {
    this._onWillDispose.fire();
    super.dispose();
  }
  async create(options, internalOptions) {
    if (typeof this._id !== "string") {
      throw new Error("Terminal has already been created");
    }
    await this._proxy.$createTerminal(this._id, {
      name: options.name,
      shellPath: options.shellPath ?? void 0,
      shellArgs: options.shellArgs ?? void 0,
      cwd: options.cwd ?? internalOptions?.cwd ?? void 0,
      env: options.env ?? void 0,
      icon: asTerminalIcon(options.iconPath) ?? void 0,
      color: ThemeColor.isThemeColor(options.color) ? options.color.id : void 0,
      initialText: options.message ?? void 0,
      strictEnv: options.strictEnv ?? void 0,
      hideFromUser: options.hideFromUser ?? void 0,
      forceShellIntegration: internalOptions?.forceShellIntegration ?? void 0,
      isFeatureTerminal: internalOptions?.isFeatureTerminal ?? void 0,
      isRemoteResolverTerminal: internalOptions?.isRemoteResolverTerminal ?? void 0,
      isExtensionOwnedTerminal: true,
      useShellEnvironment: internalOptions?.useShellEnvironment ?? void 0,
      location: internalOptions?.location || this._serializeParentTerminal(options.location, internalOptions?.resolvedExtHostIdentifier),
      isTransient: options.isTransient ?? void 0,
      shellIntegrationNonce: options.shellIntegrationNonce ?? void 0,
      titleTemplate: options.titleTemplate ?? void 0
    });
  }
  async createExtensionTerminal(location, internalOptions, parentTerminal, iconPath, color, shellIntegrationNonce, titleTemplate) {
    if (typeof this._id !== "string") {
      throw new Error("Terminal has already been created");
    }
    await this._proxy.$createTerminal(this._id, {
      name: this._name,
      isExtensionCustomPtyTerminal: true,
      icon: iconPath,
      color: ThemeColor.isThemeColor(color) ? color.id : void 0,
      location: internalOptions?.location || this._serializeParentTerminal(location, parentTerminal),
      isTransient: true,
      shellIntegrationNonce: shellIntegrationNonce ?? void 0,
      titleTemplate: titleTemplate ?? void 0
    });
    if (typeof this._id === "string") {
      throw new Error("Terminal creation failed");
    }
    return this._id;
  }
  _serializeParentTerminal(location, parentTerminal) {
    if (typeof location === "object") {
      if (hasKey(location, { parentTerminal: true }) && location.parentTerminal && parentTerminal) {
        return { parentTerminal };
      }
      if (hasKey(location, { viewColumn: true })) {
        return { viewColumn: ViewColumn.from(location.viewColumn), preserveFocus: location.preserveFocus };
      }
      return void 0;
    }
    return location;
  }
  _checkDisposed() {
    if (this._disposed) {
      throw new Error("Terminal has already been disposed");
    }
  }
  set name(name) {
    this._name = name;
  }
  setExitStatus(code, reason) {
    this._exitStatus = Object.freeze({ code, reason });
  }
  setDimensions(cols, rows) {
    if (cols === this._cols && rows === this._rows) {
      return false;
    }
    if (cols === 0 || rows === 0) {
      return false;
    }
    this._cols = cols;
    this._rows = rows;
    return true;
  }
  setInteractedWith() {
    if (!this._state.isInteractedWith) {
      this._state = {
        ...this._state,
        isInteractedWith: true
      };
      return true;
    }
    return false;
  }
  setShellType(shellType) {
    if (this._state.shell !== shellType) {
      this._state = {
        ...this._state,
        shell: shellType
      };
      return true;
    }
    return false;
  }
  setSelection(selection) {
    this._selection = selection;
  }
  _setProcessId(processId) {
    if (this._pidPromiseComplete) {
      this._pidPromiseComplete(processId);
      this._pidPromiseComplete = void 0;
    } else {
      this._pidPromise.then((pid) => {
        if (pid !== processId) {
          this._pidPromise = Promise.resolve(processId);
        }
      });
    }
  }
}
class ExtHostPseudoterminal {
  constructor(_pty) {
    this._pty = _pty;
    this.id = 0;
    this.shouldPersist = false;
    this._onProcessData = new Emitter();
    this.onProcessData = this._onProcessData.event;
    this._onProcessReady = new Emitter();
    this._onDidChangeProperty = new Emitter();
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._onProcessExit = new Emitter();
    this.onProcessExit = this._onProcessExit.event;
  }
  get onProcessReady() {
    return this._onProcessReady.event;
  }
  refreshProperty(property) {
    throw new Error(`refreshProperty is not suppported in extension owned terminals. property: ${property}`);
  }
  updateProperty(property, value) {
    throw new Error(`updateProperty is not suppported in extension owned terminals. property: ${property}, value: ${value}`);
  }
  async start() {
    return void 0;
  }
  shutdown() {
    this._pty.close();
  }
  input(data) {
    this._pty.handleInput?.(data);
  }
  sendSignal(signal) {
  }
  resize(cols, rows) {
    this._pty.setDimensions?.({ columns: cols, rows });
  }
  clearBuffer() {
  }
  async processBinary(data) {
  }
  acknowledgeDataEvent(charCount) {
  }
  async setUnicodeVersion(version) {
  }
  getInitialCwd() {
    return Promise.resolve("");
  }
  getCwd() {
    return Promise.resolve("");
  }
  startSendingEvents(initialDimensions) {
    this._pty.onDidWrite((e) => this._onProcessData.fire(e));
    this._pty.onDidClose?.((e = void 0) => {
      this._onProcessExit.fire(e === void 0 ? void 0 : e);
    });
    this._pty.onDidOverrideDimensions?.((e) => {
      if (e) {
        this._onDidChangeProperty.fire({ type: ProcessPropertyType.OverrideDimensions, value: { cols: e.columns, rows: e.rows } });
      }
    });
    this._pty.onDidChangeName?.((title) => {
      this._onDidChangeProperty.fire({ type: ProcessPropertyType.Title, value: title });
    });
    this._pty.open(initialDimensions ? initialDimensions : void 0);
    if (initialDimensions) {
      this._pty.setDimensions?.(initialDimensions);
    }
    this._onProcessReady.fire({ pid: -1, cwd: "", windowsPty: void 0 });
  }
}
let nextLinkId = 1;
let BaseExtHostTerminalService = class extends Disposable {
  constructor(supportsProcesses, _extHostCommands, extHostRpc) {
    super();
    this._extHostCommands = _extHostCommands;
    this._terminals = [];
    this._terminalProcesses = /* @__PURE__ */ new Map();
    this._terminalProcessDisposables = {};
    this._extensionTerminalAwaitingStart = {};
    this._getTerminalPromises = {};
    this._environmentVariableCollections = /* @__PURE__ */ new Map();
    this._lastQuickFixCommands = this._register(new MutableDisposable());
    this._linkProviders = /* @__PURE__ */ new Set();
    this._completionProviders = /* @__PURE__ */ new Map();
    this._profileProviders = /* @__PURE__ */ new Map();
    this._quickFixProviders = /* @__PURE__ */ new Map();
    this._terminalLinkCache = /* @__PURE__ */ new Map();
    this._terminalLinkCancellationSource = /* @__PURE__ */ new Map();
    this._onDidCloseTerminal = new Emitter();
    this.onDidCloseTerminal = this._onDidCloseTerminal.event;
    this._onDidOpenTerminal = new Emitter();
    this.onDidOpenTerminal = this._onDidOpenTerminal.event;
    this._onDidChangeActiveTerminal = new Emitter();
    this.onDidChangeActiveTerminal = this._onDidChangeActiveTerminal.event;
    this._onDidChangeTerminalDimensions = new Emitter();
    this.onDidChangeTerminalDimensions = this._onDidChangeTerminalDimensions.event;
    this._onDidChangeTerminalState = new Emitter();
    this.onDidChangeTerminalState = this._onDidChangeTerminalState.event;
    this._onDidChangeShell = new Emitter();
    this.onDidChangeShell = this._onDidChangeShell.event;
    this._onDidWriteTerminalData = new Emitter({
      onWillAddFirstListener: () => this._proxy.$startSendingDataEvents(),
      onDidRemoveLastListener: () => this._proxy.$stopSendingDataEvents()
    });
    this.onDidWriteTerminalData = this._onDidWriteTerminalData.event;
    this._onDidExecuteCommand = new Emitter({
      onWillAddFirstListener: () => this._proxy.$startSendingCommandEvents(),
      onDidRemoveLastListener: () => this._proxy.$stopSendingCommandEvents()
    });
    this.onDidExecuteTerminalCommand = this._onDidExecuteCommand.event;
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadTerminalService);
    this._bufferer = new TerminalDataBufferer(this._proxy.$sendProcessData);
    this._proxy.$registerProcessSupport(supportsProcesses);
    this._extHostCommands.registerArgumentProcessor({
      processArgument: (arg) => {
        const deserialize = (arg2) => {
          return this.getTerminalById(arg2.instanceId)?.value;
        };
        switch (arg?.$mid) {
          case MarshalledId.TerminalContext:
            return deserialize(arg);
          default: {
            if (Array.isArray(arg)) {
              for (let i = 0; i < arg.length; i++) {
                if (arg[i].$mid === MarshalledId.TerminalContext) {
                  arg[i] = deserialize(arg[i]);
                } else {
                  break;
                }
              }
            }
            return arg;
          }
        }
      }
    });
    this._register({
      dispose: () => {
        for (const [_, terminalProcess] of this._terminalProcesses) {
          terminalProcess.shutdown(true);
        }
      }
    });
  }
  get activeTerminal() {
    return this._activeTerminal?.value;
  }
  get terminals() {
    return this._terminals.map((term) => term.value);
  }
  getDefaultShell(useAutomationShell) {
    const profile = useAutomationShell ? this._defaultAutomationProfile : this._defaultProfile;
    return profile?.path || "";
  }
  getDefaultShellArgs(useAutomationShell) {
    const profile = useAutomationShell ? this._defaultAutomationProfile : this._defaultProfile;
    return profile?.args || [];
  }
  createExtensionTerminal(options, internalOptions) {
    const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
    const p = new ExtHostPseudoterminal(options.pty);
    terminal.createExtensionTerminal(options.location, internalOptions, this._serializeParentTerminal(options, internalOptions).resolvedExtHostIdentifier, asTerminalIcon(options.iconPath), asTerminalColor(options.color), options.shellIntegrationNonce, options.titleTemplate).then((id) => {
      const disposable = this._setupExtHostProcessListeners(id, p);
      this._terminalProcessDisposables[id] = disposable;
    });
    this._terminals.push(terminal);
    return terminal.value;
  }
  _serializeParentTerminal(options, internalOptions) {
    internalOptions = internalOptions ? internalOptions : {};
    if (options.location && typeof options.location === "object" && hasKey(options.location, { parentTerminal: true })) {
      const parentTerminal = options.location.parentTerminal;
      if (parentTerminal) {
        const parentExtHostTerminal = this._terminals.find((t) => t.value === parentTerminal);
        if (parentExtHostTerminal) {
          internalOptions.resolvedExtHostIdentifier = parentExtHostTerminal._id;
        }
      }
    } else if (options.location && typeof options.location !== "object") {
      internalOptions.location = options.location;
    } else if (internalOptions.location && typeof internalOptions.location === "object" && hasKey(internalOptions.location, { splitActiveTerminal: true })) {
      internalOptions.location = { splitActiveTerminal: true };
    }
    return internalOptions;
  }
  attachPtyToTerminal(id, pty) {
    const terminal = this.getTerminalById(id);
    if (!terminal) {
      throw new Error(`Cannot resolve terminal with id ${id} for virtual process`);
    }
    const p = new ExtHostPseudoterminal(pty);
    const disposable = this._setupExtHostProcessListeners(id, p);
    this._terminalProcessDisposables[id] = disposable;
  }
  async $acceptActiveTerminalChanged(id) {
    const original = this._activeTerminal;
    if (id === null) {
      this._activeTerminal = void 0;
      if (original !== this._activeTerminal) {
        this._onDidChangeActiveTerminal.fire(this._activeTerminal);
      }
      return;
    }
    const terminal = this.getTerminalById(id);
    if (terminal) {
      this._activeTerminal = terminal;
      if (original !== this._activeTerminal) {
        this._onDidChangeActiveTerminal.fire(this._activeTerminal.value);
      }
    }
  }
  async $acceptTerminalProcessData(id, data) {
    const terminal = this.getTerminalById(id);
    if (terminal) {
      this._onDidWriteTerminalData.fire({ terminal: terminal.value, data });
    }
  }
  async $acceptTerminalDimensions(id, cols, rows) {
    const terminal = this.getTerminalById(id);
    if (terminal) {
      if (terminal.setDimensions(cols, rows)) {
        this._onDidChangeTerminalDimensions.fire({
          terminal: terminal.value,
          dimensions: terminal.value.dimensions
        });
      }
    }
  }
  async $acceptDidExecuteCommand(id, command) {
    const terminal = this.getTerminalById(id);
    if (terminal) {
      this._onDidExecuteCommand.fire({ terminal: terminal.value, ...command });
    }
  }
  async $acceptTerminalMaximumDimensions(id, cols, rows) {
    this._terminalProcesses.get(id)?.resize(cols, rows);
  }
  async $acceptTerminalTitleChange(id, name) {
    const terminal = this.getTerminalById(id);
    if (terminal) {
      terminal.name = name;
    }
  }
  async $acceptTerminalClosed(id, exitCode, exitReason) {
    this._terminalLinkCache.delete(id);
    const cancellationSource = this._terminalLinkCancellationSource.get(id);
    if (cancellationSource) {
      this._terminalLinkCancellationSource.delete(id);
      cancellationSource.dispose(true);
    }
    const index = this._getTerminalObjectIndexById(this._terminals, id);
    if (index !== null) {
      const terminal = this._terminals.splice(index, 1)[0];
      terminal.setExitStatus(exitCode, exitReason);
      this._onDidCloseTerminal.fire(terminal.value);
    }
  }
  $acceptTerminalOpened(id, extHostTerminalId, name, shellLaunchConfigDto) {
    if (extHostTerminalId) {
      const index = this._getTerminalObjectIndexById(this._terminals, extHostTerminalId);
      if (index !== null) {
        this._terminals[index]._id = id;
        this._onDidOpenTerminal.fire(this.terminals[index]);
        this._terminals[index].isOpen = true;
        return;
      }
    }
    const creationOptions = {
      name: shellLaunchConfigDto.name,
      shellPath: shellLaunchConfigDto.executable,
      shellArgs: shellLaunchConfigDto.args,
      cwd: typeof shellLaunchConfigDto.cwd === "string" ? shellLaunchConfigDto.cwd : URI.revive(shellLaunchConfigDto.cwd),
      env: shellLaunchConfigDto.env,
      hideFromUser: shellLaunchConfigDto.hideFromUser,
      titleTemplate: shellLaunchConfigDto.titleTemplate
    };
    const terminal = new ExtHostTerminal(this._proxy, id, creationOptions, name);
    this._terminals.push(terminal);
    this._onDidOpenTerminal.fire(terminal.value);
    terminal.isOpen = true;
  }
  async $acceptTerminalProcessId(id, processId) {
    const terminal = this.getTerminalById(id);
    terminal?._setProcessId(processId);
  }
  async $startExtensionTerminal(id, initialDimensions) {
    const terminal = this.getTerminalById(id);
    if (!terminal) {
      return { message: localize("launchFail.idMissingOnExtHost", "Could not find the terminal with id {0} on the extension host", id) };
    }
    if (!terminal.isOpen) {
      await new Promise((r) => {
        const listener = this.onDidOpenTerminal(async (e) => {
          if (e === terminal.value) {
            listener.dispose();
            r();
          }
        });
      });
    }
    const terminalProcess = this._terminalProcesses.get(id);
    if (terminalProcess) {
      terminalProcess.startSendingEvents(initialDimensions);
    } else {
      this._extensionTerminalAwaitingStart[id] = { initialDimensions };
    }
    return void 0;
  }
  _setupExtHostProcessListeners(id, p) {
    const disposables = new DisposableStore();
    disposables.add(p.onProcessReady((e) => this._proxy.$sendProcessReady(id, e.pid, e.cwd, e.windowsPty)));
    disposables.add(p.onDidChangeProperty((property) => this._proxy.$sendProcessProperty(id, property)));
    this._bufferer.startBuffering(id, p.onProcessData);
    disposables.add(p.onProcessExit((exitCode) => this._onProcessExit(id, exitCode)));
    this._terminalProcesses.set(id, p);
    const awaitingStart = this._extensionTerminalAwaitingStart[id];
    if (awaitingStart && p instanceof ExtHostPseudoterminal) {
      p.startSendingEvents(awaitingStart.initialDimensions);
      delete this._extensionTerminalAwaitingStart[id];
    }
    return disposables;
  }
  $acceptProcessAckDataEvent(id, charCount) {
    this._terminalProcesses.get(id)?.acknowledgeDataEvent(charCount);
  }
  $acceptProcessInput(id, data) {
    this._terminalProcesses.get(id)?.input(data);
  }
  $acceptTerminalInteraction(id) {
    const terminal = this.getTerminalById(id);
    if (terminal?.setInteractedWith()) {
      this._onDidChangeTerminalState.fire(terminal.value);
    }
  }
  $acceptTerminalSelection(id, selection) {
    this.getTerminalById(id)?.setSelection(selection);
  }
  $acceptProcessResize(id, cols, rows) {
    try {
      this._terminalProcesses.get(id)?.resize(cols, rows);
    } catch (error) {
      if (error.code !== "EPIPE" && error.code !== "ERR_IPC_CHANNEL_CLOSED") {
        throw error;
      }
    }
  }
  $acceptProcessShutdown(id, immediate) {
    this._terminalProcesses.get(id)?.shutdown(immediate);
  }
  $acceptProcessRequestInitialCwd(id) {
    this._terminalProcesses.get(id)?.getInitialCwd().then((initialCwd) => this._proxy.$sendProcessProperty(id, { type: ProcessPropertyType.InitialCwd, value: initialCwd }));
  }
  $acceptProcessRequestCwd(id) {
    this._terminalProcesses.get(id)?.getCwd().then((cwd) => this._proxy.$sendProcessProperty(id, { type: ProcessPropertyType.Cwd, value: cwd }));
  }
  $acceptProcessRequestLatency(id) {
    return Promise.resolve(id);
  }
  registerProfileProvider(extension, id, provider) {
    if (this._profileProviders.has(id)) {
      throw new Error(`Terminal profile provider "${id}" already registered`);
    }
    this._profileProviders.set(id, { provider, extension });
    this._proxy.$registerProfileProvider(id, extension.identifier.value);
    return new VSCodeDisposable(() => {
      this._profileProviders.delete(id);
      this._proxy.$unregisterProfileProvider(id);
    });
  }
  registerTerminalCompletionProvider(extension, provider, ...triggerCharacters) {
    if (this._completionProviders.has(extension.identifier.value)) {
      throw new Error(`Terminal completion provider "${extension.identifier.value}" already registered`);
    }
    this._completionProviders.set(extension.identifier.value, provider);
    this._proxy.$registerCompletionProvider(extension.identifier.value, extension.identifier.value, ...triggerCharacters);
    return new VSCodeDisposable(() => {
      this._completionProviders.delete(extension.identifier.value);
      this._proxy.$unregisterCompletionProvider(extension.identifier.value);
    });
  }
  async $provideTerminalCompletions(id, options) {
    const token = new CancellationTokenSource().token;
    if (token.isCancellationRequested || !this.activeTerminal) {
      return void 0;
    }
    const provider = this._completionProviders.get(id);
    if (!provider) {
      return;
    }
    const completions = await provider.provideTerminalCompletions(this.activeTerminal, options, token);
    if (completions === null || completions === void 0) {
      return void 0;
    }
    const pathSeparator = !isWindows || this.activeTerminal.state?.shell === WindowsShellType.GitBash ? "/" : "\\";
    return TerminalCompletionList.from(completions, pathSeparator);
  }
  $acceptTerminalShellType(id, shellType) {
    const terminal = this.getTerminalById(id);
    if (terminal?.setShellType(shellType)) {
      this._onDidChangeTerminalState.fire(terminal.value);
    }
  }
  registerTerminalQuickFixProvider(id, extensionId, provider) {
    if (this._quickFixProviders.has(id)) {
      throw new Error(`Terminal quick fix provider "${id}" is already registered`);
    }
    this._quickFixProviders.set(id, provider);
    this._proxy.$registerQuickFixProvider(id, extensionId);
    return new VSCodeDisposable(() => {
      this._quickFixProviders.delete(id);
      this._proxy.$unregisterQuickFixProvider(id);
    });
  }
  async $provideTerminalQuickFixes(id, matchResult) {
    const token = new CancellationTokenSource().token;
    if (token.isCancellationRequested) {
      return;
    }
    const provider = this._quickFixProviders.get(id);
    if (!provider) {
      return;
    }
    const quickFixes = await provider.provideTerminalQuickFixes(matchResult, token);
    if (quickFixes === null || Array.isArray(quickFixes) && quickFixes.length === 0) {
      return void 0;
    }
    const store = new DisposableStore();
    this._lastQuickFixCommands.value = store;
    if (!Array.isArray(quickFixes)) {
      return quickFixes ? TerminalQuickFix.from(quickFixes, this._extHostCommands.converter, store) : void 0;
    }
    const result = [];
    for (const fix of quickFixes) {
      const converted = TerminalQuickFix.from(fix, this._extHostCommands.converter, store);
      if (converted) {
        result.push(converted);
      }
    }
    return result;
  }
  async $createContributedProfileTerminal(id, options) {
    const token = new CancellationTokenSource().token;
    const profileProviderData = this._profileProviders.get(id);
    if (!profileProviderData) {
      throw new Error(`No terminal profile provider registered for id "${id}"`);
    }
    let profile = await profileProviderData.provider.provideTerminalProfile(token);
    if (token.isCancellationRequested) {
      return;
    }
    if (profile && !hasKey(profile, { options: true })) {
      profile = { options: profile };
    }
    if (!profile || !hasKey(profile, { options: true })) {
      throw new Error(`No terminal profile options provided for id "${id}"`);
    }
    const hasTerminalTitleProposal = isProposedApiEnabled(profileProviderData.extension, "terminalTitle");
    if (!hasTerminalTitleProposal && profile.options.titleTemplate !== void 0) {
      console.error(`[${profileProviderData.extension.identifier.value}] \`titleTemplate\` returned from TerminalProfileProvider is ignored because the \`terminalTitle\` proposed API is not enabled.`);
      profile = { options: { ...profile.options, titleTemplate: void 0 } };
    }
    if (!hasTerminalTitleProposal && options.titleTemplate !== void 0) {
      console.error(`[${profileProviderData.extension.identifier.value}] \`titleTemplate\` passed to createContributedTerminalProfile is ignored because the \`terminalTitle\` proposed API is not enabled.`);
    }
    const profileOptions = hasTerminalTitleProposal && options.titleTemplate && !profile.options.titleTemplate ? { ...profile.options, titleTemplate: options.titleTemplate } : profile.options;
    if (hasKey(profileOptions, { pty: true })) {
      this.createExtensionTerminal(profileOptions, options);
      return;
    }
    this.createTerminalFromOptions(profileOptions, options);
  }
  registerLinkProvider(provider) {
    this._linkProviders.add(provider);
    if (this._linkProviders.size === 1) {
      this._proxy.$startLinkProvider();
    }
    return new VSCodeDisposable(() => {
      this._linkProviders.delete(provider);
      if (this._linkProviders.size === 0) {
        this._proxy.$stopLinkProvider();
      }
    });
  }
  async $provideLinks(terminalId, line) {
    const terminal = this.getTerminalById(terminalId);
    if (!terminal) {
      return [];
    }
    this._terminalLinkCache.delete(terminalId);
    const oldToken = this._terminalLinkCancellationSource.get(terminalId);
    oldToken?.dispose(true);
    const cancellationSource = new CancellationTokenSource();
    this._terminalLinkCancellationSource.set(terminalId, cancellationSource);
    const result = [];
    const context = { terminal: terminal.value, line };
    const promises = [];
    for (const provider of this._linkProviders) {
      promises.push(Promises.withAsyncBody(async (r) => {
        const cancelSubscription = cancellationSource.token.onCancellationRequested(() => r({ provider, links: [] }));
        try {
          const links = await provider.provideTerminalLinks(context, cancellationSource.token) || [];
          if (!cancellationSource.token.isCancellationRequested) {
            r({ provider, links });
          }
        } finally {
          cancelSubscription.dispose();
        }
      }));
    }
    const provideResults = await Promise.all(promises);
    if (cancellationSource.token.isCancellationRequested) {
      return [];
    }
    const cacheLinkMap = /* @__PURE__ */ new Map();
    for (const provideResult of provideResults) {
      if (provideResult && provideResult.links.length > 0) {
        result.push(...provideResult.links.map((providerLink) => {
          const link = {
            id: nextLinkId++,
            startIndex: providerLink.startIndex,
            length: providerLink.length,
            label: providerLink.tooltip
          };
          cacheLinkMap.set(link.id, {
            provider: provideResult.provider,
            link: providerLink
          });
          return link;
        }));
      }
    }
    this._terminalLinkCache.set(terminalId, cacheLinkMap);
    return result;
  }
  $activateLink(terminalId, linkId) {
    const cachedLink = this._terminalLinkCache.get(terminalId)?.get(linkId);
    if (!cachedLink) {
      return;
    }
    cachedLink.provider.handleTerminalLink(cachedLink.link);
  }
  _onProcessExit(id, exitCode) {
    this._bufferer.stopBuffering(id);
    this._terminalProcesses.delete(id);
    delete this._extensionTerminalAwaitingStart[id];
    const processDiposable = this._terminalProcessDisposables[id];
    if (processDiposable) {
      processDiposable.dispose();
      delete this._terminalProcessDisposables[id];
    }
    this._proxy.$sendProcessExit(id, exitCode);
  }
  getTerminalById(id) {
    return this._getTerminalObjectById(this._terminals, id);
  }
  getTerminalIdByApiObject(terminal) {
    const index = this._terminals.findIndex((item) => {
      return item.value === terminal;
    });
    return index >= 0 ? index : null;
  }
  _getTerminalObjectById(array, id) {
    const index = this._getTerminalObjectIndexById(array, id);
    return index !== null ? array[index] : null;
  }
  _getTerminalObjectIndexById(array, id) {
    const index = array.findIndex((item) => {
      return item._id === id;
    });
    return index >= 0 ? index : null;
  }
  getEnvironmentVariableCollection(extension) {
    let collection = this._environmentVariableCollections.get(extension.identifier.value);
    if (!collection) {
      collection = this._register(new UnifiedEnvironmentVariableCollection());
      this._setEnvironmentVariableCollection(extension.identifier.value, collection);
    }
    return collection.getScopedEnvironmentVariableCollection(void 0);
  }
  _syncEnvironmentVariableCollection(extensionIdentifier, collection) {
    const serialized = serializeEnvironmentVariableCollection(collection.map);
    const serializedDescription = serializeEnvironmentDescriptionMap(collection.descriptionMap);
    this._proxy.$setEnvironmentVariableCollection(extensionIdentifier, collection.persistent, serialized.length === 0 ? void 0 : serialized, serializedDescription);
  }
  $initEnvironmentVariableCollections(collections) {
    collections.forEach((entry) => {
      const extensionIdentifier = entry[0];
      const collection = this._register(new UnifiedEnvironmentVariableCollection(entry[1]));
      this._setEnvironmentVariableCollection(extensionIdentifier, collection);
    });
  }
  $acceptDefaultProfile(profile, automationProfile) {
    const oldProfile = this._defaultProfile;
    this._defaultProfile = profile;
    this._defaultAutomationProfile = automationProfile;
    if (oldProfile?.path !== profile.path) {
      this._onDidChangeShell.fire(profile.path);
    }
  }
  _setEnvironmentVariableCollection(extensionIdentifier, collection) {
    this._environmentVariableCollections.set(extensionIdentifier, collection);
    this._register(collection.onDidChangeCollection(() => {
      this._syncEnvironmentVariableCollection(extensionIdentifier, collection);
    }));
  }
};
BaseExtHostTerminalService = __decorateClass([
  __decorateParam(1, IExtHostCommands),
  __decorateParam(2, IExtHostRpcService)
], BaseExtHostTerminalService);
class UnifiedEnvironmentVariableCollection extends Disposable {
  constructor(serialized) {
    super();
    this.map = /* @__PURE__ */ new Map();
    this.scopedCollections = /* @__PURE__ */ new Map();
    this.descriptionMap = /* @__PURE__ */ new Map();
    this._persistent = true;
    this._onDidChangeCollection = this._register(new Emitter());
    this.map = new Map(serialized);
  }
  get persistent() {
    return this._persistent;
  }
  set persistent(value) {
    this._persistent = value;
    this._onDidChangeCollection.fire();
  }
  get onDidChangeCollection() {
    return this._onDidChangeCollection && this._onDidChangeCollection.event;
  }
  getScopedEnvironmentVariableCollection(scope) {
    const scopedCollectionKey = this.getScopeKey(scope);
    let scopedCollection = this.scopedCollections.get(scopedCollectionKey);
    if (!scopedCollection) {
      scopedCollection = new ScopedEnvironmentVariableCollection(this, scope);
      this.scopedCollections.set(scopedCollectionKey, scopedCollection);
      this._register(scopedCollection.onDidChangeCollection(() => this._onDidChangeCollection.fire()));
    }
    return scopedCollection;
  }
  replace(variable, value, options, scope) {
    this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Replace, options: options ?? { applyAtProcessCreation: true }, scope });
  }
  append(variable, value, options, scope) {
    this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Append, options: options ?? { applyAtProcessCreation: true }, scope });
  }
  prepend(variable, value, options, scope) {
    this._setIfDiffers(variable, { value, type: EnvironmentVariableMutatorType.Prepend, options: options ?? { applyAtProcessCreation: true }, scope });
  }
  _setIfDiffers(variable, mutator) {
    if (mutator.options && mutator.options.applyAtProcessCreation === false && !mutator.options.applyAtShellIntegration) {
      throw new Error("EnvironmentVariableMutatorOptions must apply at either process creation or shell integration");
    }
    const key = this.getKey(variable, mutator.scope);
    const current = this.map.get(key);
    const newOptions = mutator.options ? {
      applyAtProcessCreation: mutator.options.applyAtProcessCreation ?? false,
      applyAtShellIntegration: mutator.options.applyAtShellIntegration ?? false
    } : {
      applyAtProcessCreation: true
    };
    if (!current || current.value !== mutator.value || current.type !== mutator.type || current.options?.applyAtProcessCreation !== newOptions.applyAtProcessCreation || current.options?.applyAtShellIntegration !== newOptions.applyAtShellIntegration || current.scope?.workspaceFolder?.index !== mutator.scope?.workspaceFolder?.index) {
      const key2 = this.getKey(variable, mutator.scope);
      const value = {
        variable,
        ...mutator,
        options: newOptions
      };
      this.map.set(key2, value);
      this._onDidChangeCollection.fire();
    }
  }
  get(variable, scope) {
    const key = this.getKey(variable, scope);
    const value = this.map.get(key);
    return value ? convertMutator(value) : void 0;
  }
  getKey(variable, scope) {
    const scopeKey = this.getScopeKey(scope);
    return scopeKey.length ? `${variable}:::${scopeKey}` : variable;
  }
  getScopeKey(scope) {
    return this.getWorkspaceKey(scope?.workspaceFolder) ?? "";
  }
  getWorkspaceKey(workspaceFolder) {
    return workspaceFolder ? workspaceFolder.uri.toString() : void 0;
  }
  getVariableMap(scope) {
    const map = /* @__PURE__ */ new Map();
    for (const [_, value] of this.map) {
      if (this.getScopeKey(value.scope) === this.getScopeKey(scope)) {
        map.set(value.variable, convertMutator(value));
      }
    }
    return map;
  }
  delete(variable, scope) {
    const key = this.getKey(variable, scope);
    this.map.delete(key);
    this._onDidChangeCollection.fire();
  }
  clear(scope) {
    if (scope?.workspaceFolder) {
      for (const [key, mutator] of this.map) {
        if (mutator.scope?.workspaceFolder?.index === scope.workspaceFolder.index) {
          this.map.delete(key);
        }
      }
      this.clearDescription(scope);
    } else {
      this.map.clear();
      this.descriptionMap.clear();
    }
    this._onDidChangeCollection.fire();
  }
  setDescription(description, scope) {
    const key = this.getScopeKey(scope);
    const current = this.descriptionMap.get(key);
    if (!current || current.description !== description) {
      let descriptionStr;
      if (typeof description === "string") {
        descriptionStr = description;
      } else {
        descriptionStr = description?.value.split("\n\n")[0];
      }
      const value = { description: descriptionStr, scope };
      this.descriptionMap.set(key, value);
      this._onDidChangeCollection.fire();
    }
  }
  getDescription(scope) {
    const key = this.getScopeKey(scope);
    return this.descriptionMap.get(key)?.description;
  }
  clearDescription(scope) {
    const key = this.getScopeKey(scope);
    this.descriptionMap.delete(key);
  }
}
class ScopedEnvironmentVariableCollection {
  constructor(collection, scope) {
    this.collection = collection;
    this.scope = scope;
    this._onDidChangeCollection = new Emitter();
  }
  get persistent() {
    return this.collection.persistent;
  }
  set persistent(value) {
    this.collection.persistent = value;
  }
  get onDidChangeCollection() {
    return this._onDidChangeCollection && this._onDidChangeCollection.event;
  }
  getScoped(scope) {
    return this.collection.getScopedEnvironmentVariableCollection(scope);
  }
  replace(variable, value, options) {
    this.collection.replace(variable, value, options, this.scope);
  }
  append(variable, value, options) {
    this.collection.append(variable, value, options, this.scope);
  }
  prepend(variable, value, options) {
    this.collection.prepend(variable, value, options, this.scope);
  }
  get(variable) {
    return this.collection.get(variable, this.scope);
  }
  forEach(callback, thisArg) {
    this.collection.getVariableMap(this.scope).forEach((value, variable) => callback.call(thisArg, variable, value, this), this.scope);
  }
  [Symbol.iterator]() {
    return this.collection.getVariableMap(this.scope).entries();
  }
  delete(variable) {
    this.collection.delete(variable, this.scope);
    this._onDidChangeCollection.fire(void 0);
  }
  clear() {
    this.collection.clear(this.scope);
  }
  set description(description) {
    this.collection.setDescription(description, this.scope);
  }
  get description() {
    return this.collection.getDescription(this.scope);
  }
}
let WorkerExtHostTerminalService = class extends BaseExtHostTerminalService {
  constructor(extHostCommands, extHostRpc, initData) {
    super(false, extHostCommands, extHostRpc);
    this._hasRemoteAuthority = !!initData.remote.authority;
  }
  createTerminal(name, shellPath, shellArgs) {
    if (!this._hasRemoteAuthority) {
      throw new NotSupportedError();
    }
    return this.createTerminalFromOptions({ name, shellPath, shellArgs });
  }
  createTerminalFromOptions(options, internalOptions) {
    if (!this._hasRemoteAuthority) {
      throw new NotSupportedError();
    }
    const terminal = new ExtHostTerminal(this._proxy, generateUuid(), options, options.name);
    this._terminals.push(terminal);
    terminal.create(options, this._serializeParentTerminal(options, internalOptions));
    return terminal.value;
  }
};
WorkerExtHostTerminalService = __decorateClass([
  __decorateParam(0, IExtHostCommands),
  __decorateParam(1, IExtHostRpcService),
  __decorateParam(2, IExtHostInitDataService)
], WorkerExtHostTerminalService);
function asTerminalIcon(iconPath) {
  if (!iconPath || typeof iconPath === "string") {
    return void 0;
  }
  if (!hasKey(iconPath, { id: true })) {
    return iconPath;
  }
  return {
    id: iconPath.id,
    color: iconPath.color
  };
}
function asTerminalColor(color) {
  return ThemeColor.isThemeColor(color) ? color : void 0;
}
function convertMutator(mutator) {
  const newMutator = { ...mutator };
  delete newMutator.scope;
  newMutator.options = newMutator.options ?? void 0;
  return newMutator;
}
export {
  BaseExtHostTerminalService,
  ExtHostTerminal,
  IExtHostTerminalService,
  WorkerExtHostTerminalService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VGVybWluYWxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFRlcm1pbmFsU2VydmljZVNoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZFRlcm1pbmFsU2VydmljZVNoYXBlLCBJVGVybWluYWxEaW1lbnNpb25zRHRvLCBJVGVybWluYWxMaW5rRHRvLCBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyLCBJQ29tbWFuZER0bywgSVRlcm1pbmFsUXVpY2tGaXhPcGVuZXJEdG8sIElUZXJtaW5hbFF1aWNrRml4VGVybWluYWxDb21tYW5kRHRvLCBUZXJtaW5hbENvbW1hbmRNYXRjaFJlc3VsdER0bywgSVRlcm1pbmFsQ29tbWFuZER0bywgSVRlcm1pbmFsQ29tcGxldGlvbkNvbnRleHREdG8sIFRlcm1pbmFsQ29tcGxldGlvbkxpc3REdG8gfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIGFzIFZTQ29kZURpc3Bvc2FibGUsIEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZSwgVGVybWluYWxFeGl0UmVhc29uLCBUZXJtaW5hbENvbXBsZXRpb25JdGVtIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBOb3RTdXBwb3J0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBzZXJpYWxpemVFbnZpcm9ubWVudERlc2NyaXB0aW9uTWFwLCBzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlU2hhcmVkLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uRGVzY3JpcHRpb24sIElFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvciwgSVNlcmlhbGl6YWJsZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgSUNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlT3B0aW9ucywgSVByb2Nlc3NSZWFkeUV2ZW50LCBJU2hlbGxMYXVuY2hDb25maWdEdG8sIElUZXJtaW5hbENoaWxkUHJvY2VzcywgSVRlcm1pbmFsTGF1bmNoRXJyb3IsIElUZXJtaW5hbFByb2ZpbGUsIFRlcm1pbmFsSWNvbiwgVGVybWluYWxMb2NhdGlvbiwgSVByb2Nlc3NQcm9wZXJ0eSwgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgSVByb2Nlc3NQcm9wZXJ0eU1hcCwgVGVybWluYWxTaGVsbFR5cGUsIFdpbmRvd3NTaGVsbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxEYXRhQnVmZmVyZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxEYXRhQnVmZmVyaW5nLmpzJztcbmltcG9ydCB7IFRoZW1lQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cENvbHVtbiB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBDb2x1bW4uanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb21wbGV0aW9uTGlzdCwgVGVybWluYWxRdWlja0ZpeCwgVmlld0NvbHVtbiB9IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZFRlcm1pbmFsSW5zdGFuY2VDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdFRlcm1pbmFsU2VydmljZSBleHRlbmRzIEV4dEhvc3RUZXJtaW5hbFNlcnZpY2VTaGFwZSwgSURpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRhY3RpdmVUZXJtaW5hbDogdnNjb2RlLlRlcm1pbmFsIHwgdW5kZWZpbmVkO1xuXHR0ZXJtaW5hbHM6IHZzY29kZS5UZXJtaW5hbFtdO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2VUZXJtaW5hbDogRXZlbnQ8dnNjb2RlLlRlcm1pbmFsPjtcblx0cmVhZG9ubHkgb25EaWRPcGVuVGVybWluYWw6IEV2ZW50PHZzY29kZS5UZXJtaW5hbD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlVGVybWluYWw6IEV2ZW50PHZzY29kZS5UZXJtaW5hbCB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGVybWluYWxEaW1lbnNpb25zOiBFdmVudDx2c2NvZGUuVGVybWluYWxEaW1lbnNpb25zQ2hhbmdlRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVRlcm1pbmFsU3RhdGU6IEV2ZW50PHZzY29kZS5UZXJtaW5hbD47XG5cdHJlYWRvbmx5IG9uRGlkV3JpdGVUZXJtaW5hbERhdGE6IEV2ZW50PHZzY29kZS5UZXJtaW5hbERhdGFXcml0ZUV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRFeGVjdXRlVGVybWluYWxDb21tYW5kOiBFdmVudDx2c2NvZGUuVGVybWluYWxFeGVjdXRlZENvbW1hbmQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNoZWxsOiBFdmVudDxzdHJpbmc+O1xuXG5cdGNyZWF0ZVRlcm1pbmFsKG5hbWU/OiBzdHJpbmcsIHNoZWxsUGF0aD86IHN0cmluZywgc2hlbGxBcmdzPzogcmVhZG9ubHkgc3RyaW5nW10gfCBzdHJpbmcpOiB2c2NvZGUuVGVybWluYWw7XG5cdGNyZWF0ZVRlcm1pbmFsRnJvbU9wdGlvbnMob3B0aW9uczogdnNjb2RlLlRlcm1pbmFsT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSVRlcm1pbmFsSW50ZXJuYWxPcHRpb25zKTogdnNjb2RlLlRlcm1pbmFsO1xuXHRjcmVhdGVFeHRlbnNpb25UZXJtaW5hbChvcHRpb25zOiB2c2NvZGUuRXh0ZW5zaW9uVGVybWluYWxPcHRpb25zKTogdnNjb2RlLlRlcm1pbmFsO1xuXHRhdHRhY2hQdHlUb1Rlcm1pbmFsKGlkOiBudW1iZXIsIHB0eTogdnNjb2RlLlBzZXVkb3Rlcm1pbmFsKTogdm9pZDtcblx0Z2V0RGVmYXVsdFNoZWxsKHVzZUF1dG9tYXRpb25TaGVsbDogYm9vbGVhbik6IHN0cmluZztcblx0Z2V0RGVmYXVsdFNoZWxsQXJncyh1c2VBdXRvbWF0aW9uU2hlbGw6IGJvb2xlYW4pOiBzdHJpbmdbXSB8IHN0cmluZztcblx0cmVnaXN0ZXJMaW5rUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5UZXJtaW5hbExpbmtQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlO1xuXHRyZWdpc3RlclByb2ZpbGVQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5UZXJtaW5hbFByb2ZpbGVQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlO1xuXHRyZWdpc3RlclRlcm1pbmFsUXVpY2tGaXhQcm92aWRlcihpZDogc3RyaW5nLCBleHRlbnNpb25JZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsUXVpY2tGaXhQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlO1xuXHRnZXRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbjtcblx0Z2V0VGVybWluYWxCeUlkKGlkOiBudW1iZXIpOiBFeHRIb3N0VGVybWluYWwgfCBudWxsO1xuXHRnZXRUZXJtaW5hbElkQnlBcGlPYmplY3QoYXBpVGVybWluYWw6IHZzY29kZS5UZXJtaW5hbCk6IG51bWJlciB8IG51bGw7XG5cdHJlZ2lzdGVyVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXI8dnNjb2RlLlRlcm1pbmFsQ29tcGxldGlvbkl0ZW0+LCAuLi50cmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10pOiB2c2NvZGUuRGlzcG9zYWJsZTtcbn1cblxuaW50ZXJmYWNlIElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiBleHRlbmRzIHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB7XG5cdGdldFNjb3BlZChzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSk6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxJbnRlcm5hbE9wdGlvbnMge1xuXHRjd2Q/OiBzdHJpbmcgfCBVUkk7XG5cdGlzRmVhdHVyZVRlcm1pbmFsPzogYm9vbGVhbjtcblx0aXNSZW1vdGVSZXNvbHZlclRlcm1pbmFsPzogYm9vbGVhbjtcblx0Zm9yY2VTaGVsbEludGVncmF0aW9uPzogYm9vbGVhbjtcblx0dXNlU2hlbGxFbnZpcm9ubWVudD86IGJvb2xlYW47XG5cdHJlc29sdmVkRXh0SG9zdElkZW50aWZpZXI/OiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyO1xuXHQvKipcblx0ICogVGhpcyBsb2NhdGlvbiBpcyBkaWZmZXJlbnQgZnJvbSB0aGUgQVBJIGxvY2F0aW9uIGJlY2F1c2UgaXQgY2FuIGluY2x1ZGUgc3BsaXRBY3RpdmVUZXJtaW5hbCxcblx0ICogYSBwcm9wZXJ0eSB3ZSByZXNvbHZlIGludGVybmFsbHlcblx0ICovXG5cdGxvY2F0aW9uPzogVGVybWluYWxMb2NhdGlvbiB8IHsgdmlld0NvbHVtbjogbnVtYmVyOyBwcmVzZXJ2ZVN0YXRlPzogYm9vbGVhbiB9IHwgeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiBib29sZWFuIH07XG59XG5cbmV4cG9ydCBjb25zdCBJRXh0SG9zdFRlcm1pbmFsU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRXh0SG9zdFRlcm1pbmFsU2VydmljZT4oJ0lFeHRIb3N0VGVybWluYWxTZXJ2aWNlJyk7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0VGVybWluYWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfZGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfcGlkUHJvbWlzZTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIF9jb2xzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3BpZFByb21pc2VDb21wbGV0ZTogKCh2YWx1ZTogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiB1bmtub3duKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcm93czogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9leGl0U3RhdHVzOiB2c2NvZGUuVGVybWluYWxFeGl0U3RhdHVzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdGF0ZTogdnNjb2RlLlRlcm1pbmFsU3RhdGUgPSB7IGlzSW50ZXJhY3RlZFdpdGg6IGZhbHNlLCBzaGVsbDogdW5kZWZpbmVkIH07XG5cdHByaXZhdGUgX3NlbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdHNoZWxsSW50ZWdyYXRpb246IHZzY29kZS5UZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24gfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIGlzT3BlbjogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHJlYWRvbmx5IHZhbHVlOiB2c2NvZGUuVGVybWluYWw7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX3Byb3h5OiBNYWluVGhyZWFkVGVybWluYWxTZXJ2aWNlU2hhcGUsXG5cdFx0cHVibGljIF9pZDogRXh0SG9zdFRlcm1pbmFsSWRlbnRpZmllcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jcmVhdGlvbk9wdGlvbnM6IHZzY29kZS5UZXJtaW5hbE9wdGlvbnMgfCB2c2NvZGUuRXh0ZW5zaW9uVGVybWluYWxPcHRpb25zLFxuXHRcdHByaXZhdGUgX25hbWU/OiBzdHJpbmcsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jcmVhdGlvbk9wdGlvbnMgPSBPYmplY3QuZnJlZXplKHRoaXMuX2NyZWF0aW9uT3B0aW9ucyk7XG5cdFx0dGhpcy5fcGlkUHJvbWlzZSA9IG5ldyBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4oYyA9PiB0aGlzLl9waWRQcm9taXNlQ29tcGxldGUgPSBjKTtcblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMudmFsdWUgPSB7XG5cdFx0XHRnZXQgbmFtZSgpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fbmFtZSB8fCAnJztcblx0XHRcdH0sXG5cdFx0XHRnZXQgcHJvY2Vzc0lkKCk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9waWRQcm9taXNlO1xuXHRcdFx0fSxcblx0XHRcdGdldCBjcmVhdGlvbk9wdGlvbnMoKTogUmVhZG9ubHk8dnNjb2RlLlRlcm1pbmFsT3B0aW9ucyB8IHZzY29kZS5FeHRlbnNpb25UZXJtaW5hbE9wdGlvbnM+IHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2NyZWF0aW9uT3B0aW9ucztcblx0XHRcdH0sXG5cdFx0XHRnZXQgZXhpdFN0YXR1cygpOiB2c2NvZGUuVGVybWluYWxFeGl0U3RhdHVzIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2V4aXRTdGF0dXM7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHN0YXRlKCk6IHZzY29kZS5UZXJtaW5hbFN0YXRlIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3N0YXRlO1xuXHRcdFx0fSxcblx0XHRcdGdldCBzZWxlY3Rpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3NlbGVjdGlvbjtcblx0XHRcdH0sXG5cdFx0XHRnZXQgc2hlbGxJbnRlZ3JhdGlvbigpOiB2c2NvZGUuVGVybWluYWxTaGVsbEludGVncmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuc2hlbGxJbnRlZ3JhdGlvbjtcblx0XHRcdH0sXG5cdFx0XHRzZW5kVGV4dCh0ZXh0OiBzdHJpbmcsIHNob3VsZEV4ZWN1dGU6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG5cdFx0XHRcdHRoYXQuX2NoZWNrRGlzcG9zZWQoKTtcblx0XHRcdFx0dGhhdC5fcHJveHkuJHNlbmRUZXh0KHRoYXQuX2lkLCB0ZXh0LCBzaG91bGRFeGVjdXRlKTtcblx0XHRcdH0sXG5cdFx0XHRzaG93KHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdFx0dGhhdC5fY2hlY2tEaXNwb3NlZCgpO1xuXHRcdFx0XHR0aGF0Ll9wcm94eS4kc2hvdyh0aGF0Ll9pZCwgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHR9LFxuXHRcdFx0aGlkZSgpOiB2b2lkIHtcblx0XHRcdFx0dGhhdC5fY2hlY2tEaXNwb3NlZCgpO1xuXHRcdFx0XHR0aGF0Ll9wcm94eS4kaGlkZSh0aGF0Ll9pZCk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRcdFx0aWYgKCF0aGF0Ll9kaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRoYXQuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGF0Ll9wcm94eS4kZGlzcG9zZSh0aGF0Ll9pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXQgZGltZW5zaW9ucygpOiB2c2NvZGUuVGVybWluYWxEaW1lbnNpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0aWYgKHRoYXQuX2NvbHMgPT09IHVuZGVmaW5lZCB8fCB0aGF0Ll9yb3dzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29sdW1uczogdGhhdC5fY29scyxcblx0XHRcdFx0XHRyb3dzOiB0aGF0Ll9yb3dzXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25XaWxsRGlzcG9zZS5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGNyZWF0ZShcblx0XHRvcHRpb25zOiB2c2NvZGUuVGVybWluYWxPcHRpb25zLFxuXHRcdGludGVybmFsT3B0aW9ucz86IElUZXJtaW5hbEludGVybmFsT3B0aW9ucyxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9pZCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGVybWluYWwgaGFzIGFscmVhZHkgYmVlbiBjcmVhdGVkJyk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRjcmVhdGVUZXJtaW5hbCh0aGlzLl9pZCwge1xuXHRcdFx0bmFtZTogb3B0aW9ucy5uYW1lLFxuXHRcdFx0c2hlbGxQYXRoOiBvcHRpb25zLnNoZWxsUGF0aCA/PyB1bmRlZmluZWQsXG5cdFx0XHRzaGVsbEFyZ3M6IG9wdGlvbnMuc2hlbGxBcmdzID8/IHVuZGVmaW5lZCxcblx0XHRcdGN3ZDogb3B0aW9ucy5jd2QgPz8gaW50ZXJuYWxPcHRpb25zPy5jd2QgPz8gdW5kZWZpbmVkLFxuXHRcdFx0ZW52OiBvcHRpb25zLmVudiA/PyB1bmRlZmluZWQsXG5cdFx0XHRpY29uOiBhc1Rlcm1pbmFsSWNvbihvcHRpb25zLmljb25QYXRoKSA/PyB1bmRlZmluZWQsXG5cdFx0XHRjb2xvcjogVGhlbWVDb2xvci5pc1RoZW1lQ29sb3Iob3B0aW9ucy5jb2xvcikgPyBvcHRpb25zLmNvbG9yLmlkIDogdW5kZWZpbmVkLFxuXHRcdFx0aW5pdGlhbFRleHQ6IG9wdGlvbnMubWVzc2FnZSA/PyB1bmRlZmluZWQsXG5cdFx0XHRzdHJpY3RFbnY6IG9wdGlvbnMuc3RyaWN0RW52ID8/IHVuZGVmaW5lZCxcblx0XHRcdGhpZGVGcm9tVXNlcjogb3B0aW9ucy5oaWRlRnJvbVVzZXIgPz8gdW5kZWZpbmVkLFxuXHRcdFx0Zm9yY2VTaGVsbEludGVncmF0aW9uOiBpbnRlcm5hbE9wdGlvbnM/LmZvcmNlU2hlbGxJbnRlZ3JhdGlvbiA/PyB1bmRlZmluZWQsXG5cdFx0XHRpc0ZlYXR1cmVUZXJtaW5hbDogaW50ZXJuYWxPcHRpb25zPy5pc0ZlYXR1cmVUZXJtaW5hbCA/PyB1bmRlZmluZWQsXG5cdFx0XHRpc1JlbW90ZVJlc29sdmVyVGVybWluYWw6IGludGVybmFsT3B0aW9ucz8uaXNSZW1vdGVSZXNvbHZlclRlcm1pbmFsID8/IHVuZGVmaW5lZCxcblx0XHRcdGlzRXh0ZW5zaW9uT3duZWRUZXJtaW5hbDogdHJ1ZSxcblx0XHRcdHVzZVNoZWxsRW52aXJvbm1lbnQ6IGludGVybmFsT3B0aW9ucz8udXNlU2hlbGxFbnZpcm9ubWVudCA/PyB1bmRlZmluZWQsXG5cdFx0XHRsb2NhdGlvbjogaW50ZXJuYWxPcHRpb25zPy5sb2NhdGlvbiB8fCB0aGlzLl9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChvcHRpb25zLmxvY2F0aW9uLCBpbnRlcm5hbE9wdGlvbnM/LnJlc29sdmVkRXh0SG9zdElkZW50aWZpZXIpLFxuXHRcdFx0aXNUcmFuc2llbnQ6IG9wdGlvbnMuaXNUcmFuc2llbnQgPz8gdW5kZWZpbmVkLFxuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvbk5vbmNlOiBvcHRpb25zLnNoZWxsSW50ZWdyYXRpb25Ob25jZSA/PyB1bmRlZmluZWQsXG5cdFx0XHR0aXRsZVRlbXBsYXRlOiBvcHRpb25zLnRpdGxlVGVtcGxhdGUgPz8gdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9XG5cblxuXHRwdWJsaWMgYXN5bmMgY3JlYXRlRXh0ZW5zaW9uVGVybWluYWwobG9jYXRpb24/OiBUZXJtaW5hbExvY2F0aW9uIHwgdnNjb2RlLlRlcm1pbmFsRWRpdG9yTG9jYXRpb25PcHRpb25zIHwgdnNjb2RlLlRlcm1pbmFsU3BsaXRMb2NhdGlvbk9wdGlvbnMsIGludGVybmFsT3B0aW9ucz86IElUZXJtaW5hbEludGVybmFsT3B0aW9ucywgcGFyZW50VGVybWluYWw/OiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyLCBpY29uUGF0aD86IFRlcm1pbmFsSWNvbiwgY29sb3I/OiBUaGVtZUNvbG9yLCBzaGVsbEludGVncmF0aW9uTm9uY2U/OiBzdHJpbmcsIHRpdGxlVGVtcGxhdGU/OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5faWQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rlcm1pbmFsIGhhcyBhbHJlYWR5IGJlZW4gY3JlYXRlZCcpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9wcm94eS4kY3JlYXRlVGVybWluYWwodGhpcy5faWQsIHtcblx0XHRcdG5hbWU6IHRoaXMuX25hbWUsXG5cdFx0XHRpc0V4dGVuc2lvbkN1c3RvbVB0eVRlcm1pbmFsOiB0cnVlLFxuXHRcdFx0aWNvbjogaWNvblBhdGgsXG5cdFx0XHRjb2xvcjogVGhlbWVDb2xvci5pc1RoZW1lQ29sb3IoY29sb3IpID8gY29sb3IuaWQgOiB1bmRlZmluZWQsXG5cdFx0XHRsb2NhdGlvbjogaW50ZXJuYWxPcHRpb25zPy5sb2NhdGlvbiB8fCB0aGlzLl9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChsb2NhdGlvbiwgcGFyZW50VGVybWluYWwpLFxuXHRcdFx0aXNUcmFuc2llbnQ6IHRydWUsXG5cdFx0XHRzaGVsbEludGVncmF0aW9uTm9uY2U6IHNoZWxsSW50ZWdyYXRpb25Ob25jZSA/PyB1bmRlZmluZWQsXG5cdFx0XHR0aXRsZVRlbXBsYXRlOiB0aXRsZVRlbXBsYXRlID8/IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHQvLyBBdCB0aGlzIHBvaW50LCB0aGUgaWQgaGFzIGJlZW4gc2V0IHZpYSBgJGFjY2VwdFRlcm1pbmFsT3BlbmVkYFxuXHRcdGlmICh0eXBlb2YgdGhpcy5faWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rlcm1pbmFsIGNyZWF0aW9uIGZhaWxlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChsb2NhdGlvbj86IFRlcm1pbmFsTG9jYXRpb24gfCB2c2NvZGUuVGVybWluYWxFZGl0b3JMb2NhdGlvbk9wdGlvbnMgfCB2c2NvZGUuVGVybWluYWxTcGxpdExvY2F0aW9uT3B0aW9ucywgcGFyZW50VGVybWluYWw/OiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyKTogVGVybWluYWxMb2NhdGlvbiB8IHsgdmlld0NvbHVtbjogRWRpdG9yR3JvdXBDb2x1bW47IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0gfCB7IHBhcmVudFRlcm1pbmFsOiBFeHRIb3N0VGVybWluYWxJZGVudGlmaWVyIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgbG9jYXRpb24gPT09ICdvYmplY3QnKSB7XG5cdFx0XHRpZiAoaGFzS2V5KGxvY2F0aW9uLCB7IHBhcmVudFRlcm1pbmFsOiB0cnVlIH0pICYmIGxvY2F0aW9uLnBhcmVudFRlcm1pbmFsICYmIHBhcmVudFRlcm1pbmFsKSB7XG5cdFx0XHRcdHJldHVybiB7IHBhcmVudFRlcm1pbmFsIH07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoYXNLZXkobG9jYXRpb24sIHsgdmlld0NvbHVtbjogdHJ1ZSB9KSkge1xuXHRcdFx0XHRyZXR1cm4geyB2aWV3Q29sdW1uOiBWaWV3Q29sdW1uLmZyb20obG9jYXRpb24udmlld0NvbHVtbiksIHByZXNlcnZlRm9jdXM6IGxvY2F0aW9uLnByZXNlcnZlRm9jdXMgfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbG9jYXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9jaGVja0Rpc3Bvc2VkKCkge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUZXJtaW5hbCBoYXMgYWxyZWFkeSBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldCBuYW1lKG5hbWU6IHN0cmluZykge1xuXHRcdHRoaXMuX25hbWUgPSBuYW1lO1xuXHR9XG5cblx0cHVibGljIHNldEV4aXRTdGF0dXMoY29kZTogbnVtYmVyIHwgdW5kZWZpbmVkLCByZWFzb246IFRlcm1pbmFsRXhpdFJlYXNvbikge1xuXHRcdHRoaXMuX2V4aXRTdGF0dXMgPSBPYmplY3QuZnJlZXplKHsgY29kZSwgcmVhc29uIH0pO1xuXHR9XG5cblx0cHVibGljIHNldERpbWVuc2lvbnMoY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAoY29scyA9PT0gdGhpcy5fY29scyAmJiByb3dzID09PSB0aGlzLl9yb3dzKSB7XG5cdFx0XHQvLyBOb3RoaW5nIGNoYW5nZWRcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNvbHMgPT09IDAgfHwgcm93cyA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9jb2xzID0gY29scztcblx0XHR0aGlzLl9yb3dzID0gcm93cztcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBzZXRJbnRlcmFjdGVkV2l0aCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3N0YXRlLmlzSW50ZXJhY3RlZFdpdGgpIHtcblx0XHRcdHRoaXMuX3N0YXRlID0ge1xuXHRcdFx0XHQuLi50aGlzLl9zdGF0ZSxcblx0XHRcdFx0aXNJbnRlcmFjdGVkV2l0aDogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2hlbGxUeXBlKHNoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblxuXHRcdGlmICh0aGlzLl9zdGF0ZS5zaGVsbCAhPT0gc2hlbGxUeXBlKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IHtcblx0XHRcdFx0Li4udGhpcy5fc3RhdGUsXG5cdFx0XHRcdHNoZWxsOiBzaGVsbFR5cGVcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHNldFNlbGVjdGlvbihzZWxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGlvbiA9IHNlbGVjdGlvbjtcblx0fVxuXG5cdHB1YmxpYyBfc2V0UHJvY2Vzc0lkKHByb2Nlc3NJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gVGhlIGV2ZW50IG1heSBmaXJlIDIgdGltZXMgd2hlbiB0aGUgcGFuZWwgaXMgcmVzdG9yZWRcblx0XHRpZiAodGhpcy5fcGlkUHJvbWlzZUNvbXBsZXRlKSB7XG5cdFx0XHR0aGlzLl9waWRQcm9taXNlQ29tcGxldGUocHJvY2Vzc0lkKTtcblx0XHRcdHRoaXMuX3BpZFByb21pc2VDb21wbGV0ZSA9IHVuZGVmaW5lZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUmVjcmVhdGUgdGhlIHByb21pc2UgaWYgdGhpcyBpcyB0aGUgbnRoIHByb2Nlc3NJZCBzZXQgKGUuZy4gcmV1c2VkIHRhc2sgdGVybWluYWxzKVxuXHRcdFx0dGhpcy5fcGlkUHJvbWlzZS50aGVuKHBpZCA9PiB7XG5cdFx0XHRcdGlmIChwaWQgIT09IHByb2Nlc3NJZCkge1xuXHRcdFx0XHRcdHRoaXMuX3BpZFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUocHJvY2Vzc0lkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEV4dEhvc3RQc2V1ZG90ZXJtaW5hbCBpbXBsZW1lbnRzIElUZXJtaW5hbENoaWxkUHJvY2VzcyB7XG5cdHJlYWRvbmx5IGlkID0gMDtcblx0cmVhZG9ubHkgc2hvdWxkUGVyc2lzdCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc0RhdGEgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvblByb2Nlc3NEYXRhOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25Qcm9jZXNzRGF0YS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVhZHkgPSBuZXcgRW1pdHRlcjxJUHJvY2Vzc1JlYWR5RXZlbnQ+KCk7XG5cdHB1YmxpYyBnZXQgb25Qcm9jZXNzUmVhZHkoKTogRXZlbnQ8SVByb2Nlc3NSZWFkeUV2ZW50PiB7IHJldHVybiB0aGlzLl9vblByb2Nlc3NSZWFkeS5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb3BlcnR5ID0gbmV3IEVtaXR0ZXI8SVByb2Nlc3NQcm9wZXJ0eT4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvcGVydHkgPSB0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NFeGl0ID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Qcm9jZXNzRXhpdDogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uUHJvY2Vzc0V4aXQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfcHR5OiB2c2NvZGUuUHNldWRvdGVybWluYWwpIHsgfVxuXG5cdHJlZnJlc2hQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4ocHJvcGVydHk6IFByb2Nlc3NQcm9wZXJ0eVR5cGUpOiBQcm9taXNlPElQcm9jZXNzUHJvcGVydHlNYXBbVF0+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYHJlZnJlc2hQcm9wZXJ0eSBpcyBub3Qgc3VwcHBvcnRlZCBpbiBleHRlbnNpb24gb3duZWQgdGVybWluYWxzLiBwcm9wZXJ0eTogJHtwcm9wZXJ0eX1gKTtcblx0fVxuXG5cdHVwZGF0ZVByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPihwcm9wZXJ0eTogUHJvY2Vzc1Byb3BlcnR5VHlwZSwgdmFsdWU6IElQcm9jZXNzUHJvcGVydHlNYXBbVF0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYHVwZGF0ZVByb3BlcnR5IGlzIG5vdCBzdXBwcG9ydGVkIGluIGV4dGVuc2lvbiBvd25lZCB0ZXJtaW5hbHMuIHByb3BlcnR5OiAke3Byb3BlcnR5fSwgdmFsdWU6ICR7dmFsdWV9YCk7XG5cdH1cblxuXHRhc3luYyBzdGFydCgpOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzaHV0ZG93bigpOiB2b2lkIHtcblx0XHR0aGlzLl9wdHkuY2xvc2UoKTtcblx0fVxuXG5cdGlucHV0KGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3B0eS5oYW5kbGVJbnB1dD8uKGRhdGEpO1xuXHR9XG5cblx0c2VuZFNpZ25hbChzaWduYWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIEV4dGVuc2lvbiBvd25lZCB0ZXJtaW5hbHMgZG9uJ3Qgc3VwcG9ydCBzZW5kaW5nIHNpZ25hbHMgZGlyZWN0bHkgdG8gcHJvY2Vzc2VzXG5cdFx0Ly8gVGhpcyBjb3VsZCBiZSBleHRlbmRlZCBpbiB0aGUgZnV0dXJlIGlmIHRoZSBwc2V1ZG90ZXJtaW5hbCBBUEkgaXMgZW5oYW5jZWRcblx0fVxuXG5cdHJlc2l6ZShjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3B0eS5zZXREaW1lbnNpb25zPy4oeyBjb2x1bW5zOiBjb2xzLCByb3dzIH0pO1xuXHR9XG5cblx0Y2xlYXJCdWZmZXIoKTogdm9pZCB7XG5cdFx0Ly8gbm8tb3Bcblx0fVxuXG5cdGFzeW5jIHByb2Nlc3NCaW5hcnkoZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTm8tb3AsIHByb2Nlc3NCaW5hcnkgaXMgbm90IHN1cHBvcnRlZCBpbiBleHRlbnNpb24gb3duZWQgdGVybWluYWxzLlxuXHR9XG5cblx0YWNrbm93bGVkZ2VEYXRhRXZlbnQoY2hhckNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBOby1vcCwgZmxvdyBjb250cm9sIGlzIG5vdCBzdXBwb3J0ZWQgaW4gZXh0ZW5zaW9uIG93bmVkIHRlcm1pbmFscy4gSWYgdGhpcyBpcyBldmVyXG5cdFx0Ly8gaW1wbGVtZW50ZWQgaXQgd2lsbCBuZWVkIG5ldyBwYXVzZSBhbmQgcmVzdW1lIFZTIENvZGUgQVBJcy5cblx0fVxuXG5cdGFzeW5jIHNldFVuaWNvZGVWZXJzaW9uKHZlcnNpb246ICc2JyB8ICcxMScpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBOby1vcCwgeHRlcm0taGVhZGxlc3MgaXNuJ3QgdXNlZCBmb3IgZXh0ZW5zaW9uIG93bmVkIHRlcm1pbmFscy5cblx0fVxuXG5cdGdldEluaXRpYWxDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCcnKTtcblx0fVxuXG5cdGdldEN3ZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoJycpO1xuXHR9XG5cblx0c3RhcnRTZW5kaW5nRXZlbnRzKGluaXRpYWxEaW1lbnNpb25zOiBJVGVybWluYWxEaW1lbnNpb25zRHRvIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gQXR0YWNoIHRoZSBsaXN0ZW5lcnNcblx0XHR0aGlzLl9wdHkub25EaWRXcml0ZShlID0+IHRoaXMuX29uUHJvY2Vzc0RhdGEuZmlyZShlKSk7XG5cdFx0dGhpcy5fcHR5Lm9uRGlkQ2xvc2U/LigoZTogbnVtYmVyIHwgdm9pZCA9IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0dGhpcy5fb25Qcm9jZXNzRXhpdC5maXJlKGUgPT09IHZvaWQgMCA/IHVuZGVmaW5lZCA6IGUpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3B0eS5vbkRpZE92ZXJyaWRlRGltZW5zaW9ucz8uKGUgPT4ge1xuXHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5maXJlKHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5PdmVycmlkZURpbWVuc2lvbnMsIHZhbHVlOiB7IGNvbHM6IGUuY29sdW1ucywgcm93czogZS5yb3dzIH0gfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcHR5Lm9uRGlkQ2hhbmdlTmFtZT8uKHRpdGxlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZSh7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuVGl0bGUsIHZhbHVlOiB0aXRsZSB9KTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3B0eS5vcGVuKGluaXRpYWxEaW1lbnNpb25zID8gaW5pdGlhbERpbWVuc2lvbnMgOiB1bmRlZmluZWQpO1xuXG5cdFx0aWYgKGluaXRpYWxEaW1lbnNpb25zKSB7XG5cdFx0XHR0aGlzLl9wdHkuc2V0RGltZW5zaW9ucz8uKGluaXRpYWxEaW1lbnNpb25zKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vblByb2Nlc3NSZWFkeS5maXJlKHsgcGlkOiAtMSwgY3dkOiAnJywgd2luZG93c1B0eTogdW5kZWZpbmVkIH0pO1xuXHR9XG59XG5cbmxldCBuZXh0TGlua0lkID0gMTtcblxuaW50ZXJmYWNlIElDYWNoZWRMaW5rRW50cnkge1xuXHRwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsTGlua1Byb3ZpZGVyO1xuXHRsaW5rOiB2c2NvZGUuVGVybWluYWxMaW5rO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UsIEV4dEhvc3RUZXJtaW5hbFNlcnZpY2VTaGFwZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBfcHJveHk6IE1haW5UaHJlYWRUZXJtaW5hbFNlcnZpY2VTaGFwZTtcblx0cHJvdGVjdGVkIF9hY3RpdmVUZXJtaW5hbDogRXh0SG9zdFRlcm1pbmFsIHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgX3Rlcm1pbmFsczogRXh0SG9zdFRlcm1pbmFsW10gPSBbXTtcblx0cHJvdGVjdGVkIF90ZXJtaW5hbFByb2Nlc3NlczogTWFwPG51bWJlciwgSVRlcm1pbmFsQ2hpbGRQcm9jZXNzPiA9IG5ldyBNYXAoKTtcblx0cHJvdGVjdGVkIF90ZXJtaW5hbFByb2Nlc3NEaXNwb3NhYmxlczogeyBbaWQ6IG51bWJlcl06IElEaXNwb3NhYmxlIH0gPSB7fTtcblx0cHJvdGVjdGVkIF9leHRlbnNpb25UZXJtaW5hbEF3YWl0aW5nU3RhcnQ6IHsgW2lkOiBudW1iZXJdOiB7IGluaXRpYWxEaW1lbnNpb25zOiBJVGVybWluYWxEaW1lbnNpb25zRHRvIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQgfSA9IHt9O1xuXHRwcm90ZWN0ZWQgX2dldFRlcm1pbmFsUHJvbWlzZXM6IHsgW2lkOiBudW1iZXJdOiBQcm9taXNlPEV4dEhvc3RUZXJtaW5hbCB8IHVuZGVmaW5lZD4gfSA9IHt9O1xuXHRwcm90ZWN0ZWQgX2Vudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uczogTWFwPHN0cmluZywgVW5pZmllZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBfZGVmYXVsdFByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RlZmF1bHRBdXRvbWF0aW9uUHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdFF1aWNrRml4Q29tbWFuZHM6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9idWZmZXJlcjogVGVybWluYWxEYXRhQnVmZmVyZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmtQcm92aWRlcnM6IFNldDx2c2NvZGUuVGVybWluYWxMaW5rUHJvdmlkZXI+ID0gbmV3IFNldCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0aW9uUHJvdmlkZXJzOiBNYXA8c3RyaW5nLCB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXI8dnNjb2RlLlRlcm1pbmFsQ29tcGxldGlvbkl0ZW0+PiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvZmlsZVByb3ZpZGVyczogTWFwPHN0cmluZywgeyBwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyOyBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9PiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVpY2tGaXhQcm92aWRlcnM6IE1hcDxzdHJpbmcsIHZzY29kZS5UZXJtaW5hbFF1aWNrRml4UHJvdmlkZXI+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbExpbmtDYWNoZTogTWFwPG51bWJlciwgTWFwPG51bWJlciwgSUNhY2hlZExpbmtFbnRyeT4+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbExpbmtDYW5jZWxsYXRpb25Tb3VyY2U6IE1hcDxudW1iZXIsIENhbmNlbGxhdGlvblRva2VuU291cmNlPiA9IG5ldyBNYXAoKTtcblxuXHRwdWJsaWMgZ2V0IGFjdGl2ZVRlcm1pbmFsKCk6IHZzY29kZS5UZXJtaW5hbCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9hY3RpdmVUZXJtaW5hbD8udmFsdWU7IH1cblx0cHVibGljIGdldCB0ZXJtaW5hbHMoKTogdnNjb2RlLlRlcm1pbmFsW10geyByZXR1cm4gdGhpcy5fdGVybWluYWxzLm1hcCh0ZXJtID0+IHRlcm0udmFsdWUpOyB9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENsb3NlVGVybWluYWwgPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGVybWluYWw+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2VUZXJtaW5hbCA9IHRoaXMuX29uRGlkQ2xvc2VUZXJtaW5hbC5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZE9wZW5UZXJtaW5hbCA9IG5ldyBFbWl0dGVyPHZzY29kZS5UZXJtaW5hbD4oKTtcblx0cmVhZG9ubHkgb25EaWRPcGVuVGVybWluYWwgPSB0aGlzLl9vbkRpZE9wZW5UZXJtaW5hbC5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZVRlcm1pbmFsID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRlcm1pbmFsIHwgdW5kZWZpbmVkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVRlcm1pbmFsID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVUZXJtaW5hbC5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRlcm1pbmFsRGltZW5zaW9ucyA9IG5ldyBFbWl0dGVyPHZzY29kZS5UZXJtaW5hbERpbWVuc2lvbnNDaGFuZ2VFdmVudD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUZXJtaW5hbERpbWVuc2lvbnMgPSB0aGlzLl9vbkRpZENoYW5nZVRlcm1pbmFsRGltZW5zaW9ucy5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRlcm1pbmFsU3RhdGUgPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGVybWluYWw+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGVybWluYWxTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlVGVybWluYWxTdGF0ZS5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNoZWxsID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNoZWxsID0gdGhpcy5fb25EaWRDaGFuZ2VTaGVsbC5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkV3JpdGVUZXJtaW5hbERhdGEgPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGVybWluYWxEYXRhV3JpdGVFdmVudD4oe1xuXHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHRoaXMuX3Byb3h5LiRzdGFydFNlbmRpbmdEYXRhRXZlbnRzKCksXG5cdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHRoaXMuX3Byb3h5LiRzdG9wU2VuZGluZ0RhdGFFdmVudHMoKVxuXHR9KTtcblx0cmVhZG9ubHkgb25EaWRXcml0ZVRlcm1pbmFsRGF0YSA9IHRoaXMuX29uRGlkV3JpdGVUZXJtaW5hbERhdGEuZXZlbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRFeGVjdXRlQ29tbWFuZCA9IG5ldyBFbWl0dGVyPHZzY29kZS5UZXJtaW5hbEV4ZWN1dGVkQ29tbWFuZD4oe1xuXHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHRoaXMuX3Byb3h5LiRzdGFydFNlbmRpbmdDb21tYW5kRXZlbnRzKCksXG5cdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHRoaXMuX3Byb3h5LiRzdG9wU2VuZGluZ0NvbW1hbmRFdmVudHMoKVxuXHR9KTtcblx0cmVhZG9ubHkgb25EaWRFeGVjdXRlVGVybWluYWxDb21tYW5kID0gdGhpcy5fb25EaWRFeGVjdXRlQ29tbWFuZC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzdXBwb3J0c1Byb2Nlc3NlczogYm9vbGVhbixcblx0XHRASUV4dEhvc3RDb21tYW5kcyBwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0Q29tbWFuZHM6IElFeHRIb3N0Q29tbWFuZHMsXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZFRlcm1pbmFsU2VydmljZSk7XG5cdFx0dGhpcy5fYnVmZmVyZXIgPSBuZXcgVGVybWluYWxEYXRhQnVmZmVyZXIodGhpcy5fcHJveHkuJHNlbmRQcm9jZXNzRGF0YSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyUHJvY2Vzc1N1cHBvcnQoc3VwcG9ydHNQcm9jZXNzZXMpO1xuXHRcdHRoaXMuX2V4dEhvc3RDb21tYW5kcy5yZWdpc3RlckFyZ3VtZW50UHJvY2Vzc29yKHtcblx0XHRcdHByb2Nlc3NBcmd1bWVudDogYXJnID0+IHtcblx0XHRcdFx0Y29uc3QgZGVzZXJpYWxpemUgPSAoYXJnOiBJU2VyaWFsaXplZFRlcm1pbmFsSW5zdGFuY2VDb250ZXh0KSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0VGVybWluYWxCeUlkKGFyZy5pbnN0YW5jZUlkKT8udmFsdWU7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHN3aXRjaCAoYXJnPy4kbWlkKSB7XG5cdFx0XHRcdFx0Y2FzZSBNYXJzaGFsbGVkSWQuVGVybWluYWxDb250ZXh0OiByZXR1cm4gZGVzZXJpYWxpemUoYXJnKTtcblx0XHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0XHQvLyBEbyBhcnJheSB0cmFuc2Zvcm1hdGlvbiBpbiBwbGFjZSBhcyB0aGlzIGlzIGEgaG90IHBhdGhcblx0XHRcdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KGFyZykpIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcmcubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoYXJnW2ldLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5UZXJtaW5hbENvbnRleHQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGFyZ1tpXSA9IGRlc2VyaWFsaXplKGFyZ1tpXSk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdC8vIFByb2JhYmx5IHNvbWV0aGluZyBlbHNlLCBzbyBleGl0IGVhcmx5XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtfLCB0ZXJtaW5hbFByb2Nlc3NdIG9mIHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzKSB7XG5cdFx0XHRcdFx0dGVybWluYWxQcm9jZXNzLnNodXRkb3duKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgY3JlYXRlVGVybWluYWwobmFtZT86IHN0cmluZywgc2hlbGxQYXRoPzogc3RyaW5nLCBzaGVsbEFyZ3M/OiBzdHJpbmdbXSB8IHN0cmluZyk6IHZzY29kZS5UZXJtaW5hbDtcblx0cHVibGljIGFic3RyYWN0IGNyZWF0ZVRlcm1pbmFsRnJvbU9wdGlvbnMob3B0aW9uczogdnNjb2RlLlRlcm1pbmFsT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSVRlcm1pbmFsSW50ZXJuYWxPcHRpb25zKTogdnNjb2RlLlRlcm1pbmFsO1xuXG5cdHB1YmxpYyBnZXREZWZhdWx0U2hlbGwodXNlQXV0b21hdGlvblNoZWxsOiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcm9maWxlID0gdXNlQXV0b21hdGlvblNoZWxsID8gdGhpcy5fZGVmYXVsdEF1dG9tYXRpb25Qcm9maWxlIDogdGhpcy5fZGVmYXVsdFByb2ZpbGU7XG5cdFx0cmV0dXJuIHByb2ZpbGU/LnBhdGggfHwgJyc7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVmYXVsdFNoZWxsQXJncyh1c2VBdXRvbWF0aW9uU2hlbGw6IGJvb2xlYW4pOiBzdHJpbmdbXSB8IHN0cmluZyB7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IHVzZUF1dG9tYXRpb25TaGVsbCA/IHRoaXMuX2RlZmF1bHRBdXRvbWF0aW9uUHJvZmlsZSA6IHRoaXMuX2RlZmF1bHRQcm9maWxlO1xuXHRcdHJldHVybiBwcm9maWxlPy5hcmdzIHx8IFtdO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUV4dGVuc2lvblRlcm1pbmFsKG9wdGlvbnM6IHZzY29kZS5FeHRlbnNpb25UZXJtaW5hbE9wdGlvbnMsIGludGVybmFsT3B0aW9ucz86IElUZXJtaW5hbEludGVybmFsT3B0aW9ucyk6IHZzY29kZS5UZXJtaW5hbCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSBuZXcgRXh0SG9zdFRlcm1pbmFsKHRoaXMuX3Byb3h5LCBnZW5lcmF0ZVV1aWQoKSwgb3B0aW9ucywgb3B0aW9ucy5uYW1lKTtcblx0XHRjb25zdCBwID0gbmV3IEV4dEhvc3RQc2V1ZG90ZXJtaW5hbChvcHRpb25zLnB0eSk7XG5cdFx0dGVybWluYWwuY3JlYXRlRXh0ZW5zaW9uVGVybWluYWwob3B0aW9ucy5sb2NhdGlvbiwgaW50ZXJuYWxPcHRpb25zLCB0aGlzLl9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChvcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMpLnJlc29sdmVkRXh0SG9zdElkZW50aWZpZXIsIGFzVGVybWluYWxJY29uKG9wdGlvbnMuaWNvblBhdGgpLCBhc1Rlcm1pbmFsQ29sb3Iob3B0aW9ucy5jb2xvciksIG9wdGlvbnMuc2hlbGxJbnRlZ3JhdGlvbk5vbmNlLCBvcHRpb25zLnRpdGxlVGVtcGxhdGUpLnRoZW4oaWQgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX3NldHVwRXh0SG9zdFByb2Nlc3NMaXN0ZW5lcnMoaWQsIHApO1xuXHRcdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzRGlzcG9zYWJsZXNbaWRdID0gZGlzcG9zYWJsZTtcblx0XHR9KTtcblx0XHR0aGlzLl90ZXJtaW5hbHMucHVzaCh0ZXJtaW5hbCk7XG5cdFx0cmV0dXJuIHRlcm1pbmFsLnZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChvcHRpb25zOiB2c2NvZGUuVGVybWluYWxPcHRpb25zLCBpbnRlcm5hbE9wdGlvbnM/OiBJVGVybWluYWxJbnRlcm5hbE9wdGlvbnMpOiBJVGVybWluYWxJbnRlcm5hbE9wdGlvbnMge1xuXHRcdGludGVybmFsT3B0aW9ucyA9IGludGVybmFsT3B0aW9ucyA/IGludGVybmFsT3B0aW9ucyA6IHt9O1xuXHRcdGlmIChvcHRpb25zLmxvY2F0aW9uICYmIHR5cGVvZiBvcHRpb25zLmxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkob3B0aW9ucy5sb2NhdGlvbiwgeyBwYXJlbnRUZXJtaW5hbDogdHJ1ZSB9KSkge1xuXHRcdFx0Y29uc3QgcGFyZW50VGVybWluYWwgPSBvcHRpb25zLmxvY2F0aW9uLnBhcmVudFRlcm1pbmFsO1xuXHRcdFx0aWYgKHBhcmVudFRlcm1pbmFsKSB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudEV4dEhvc3RUZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5maW5kKHQgPT4gdC52YWx1ZSA9PT0gcGFyZW50VGVybWluYWwpO1xuXHRcdFx0XHRpZiAocGFyZW50RXh0SG9zdFRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0aW50ZXJuYWxPcHRpb25zLnJlc29sdmVkRXh0SG9zdElkZW50aWZpZXIgPSBwYXJlbnRFeHRIb3N0VGVybWluYWwuX2lkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zLmxvY2F0aW9uICYmIHR5cGVvZiBvcHRpb25zLmxvY2F0aW9uICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0aW50ZXJuYWxPcHRpb25zLmxvY2F0aW9uID0gb3B0aW9ucy5sb2NhdGlvbjtcblx0XHR9IGVsc2UgaWYgKGludGVybmFsT3B0aW9ucy5sb2NhdGlvbiAmJiB0eXBlb2YgaW50ZXJuYWxPcHRpb25zLmxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkoaW50ZXJuYWxPcHRpb25zLmxvY2F0aW9uLCB7IHNwbGl0QWN0aXZlVGVybWluYWw6IHRydWUgfSkpIHtcblx0XHRcdGludGVybmFsT3B0aW9ucy5sb2NhdGlvbiA9IHsgc3BsaXRBY3RpdmVUZXJtaW5hbDogdHJ1ZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gaW50ZXJuYWxPcHRpb25zO1xuXHR9XG5cblx0cHVibGljIGF0dGFjaFB0eVRvVGVybWluYWwoaWQ6IG51bWJlciwgcHR5OiB2c2NvZGUuUHNldWRvdGVybWluYWwpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXNvbHZlIHRlcm1pbmFsIHdpdGggaWQgJHtpZH0gZm9yIHZpcnR1YWwgcHJvY2Vzc2ApO1xuXHRcdH1cblx0XHRjb25zdCBwID0gbmV3IEV4dEhvc3RQc2V1ZG90ZXJtaW5hbChwdHkpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9zZXR1cEV4dEhvc3RQcm9jZXNzTGlzdGVuZXJzKGlkLCBwKTtcblx0XHR0aGlzLl90ZXJtaW5hbFByb2Nlc3NEaXNwb3NhYmxlc1tpZF0gPSBkaXNwb3NhYmxlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHRBY3RpdmVUZXJtaW5hbENoYW5nZWQoaWQ6IG51bWJlciB8IG51bGwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IHRoaXMuX2FjdGl2ZVRlcm1pbmFsO1xuXHRcdGlmIChpZCA9PT0gbnVsbCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlVGVybWluYWwgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAob3JpZ2luYWwgIT09IHRoaXMuX2FjdGl2ZVRlcm1pbmFsKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlVGVybWluYWwuZmlyZSh0aGlzLl9hY3RpdmVUZXJtaW5hbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5nZXRUZXJtaW5hbEJ5SWQoaWQpO1xuXHRcdGlmICh0ZXJtaW5hbCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlVGVybWluYWwgPSB0ZXJtaW5hbDtcblx0XHRcdGlmIChvcmlnaW5hbCAhPT0gdGhpcy5fYWN0aXZlVGVybWluYWwpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVUZXJtaW5hbC5maXJlKHRoaXMuX2FjdGl2ZVRlcm1pbmFsLnZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGFjY2VwdFRlcm1pbmFsUHJvY2Vzc0RhdGEoaWQ6IG51bWJlciwgZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLmdldFRlcm1pbmFsQnlJZChpZCk7XG5cdFx0aWYgKHRlcm1pbmFsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFdyaXRlVGVybWluYWxEYXRhLmZpcmUoeyB0ZXJtaW5hbDogdGVybWluYWwudmFsdWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHRUZXJtaW5hbERpbWVuc2lvbnMoaWQ6IG51bWJlciwgY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKTtcblx0XHRpZiAodGVybWluYWwpIHtcblx0XHRcdGlmICh0ZXJtaW5hbC5zZXREaW1lbnNpb25zKGNvbHMsIHJvd3MpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGVybWluYWxEaW1lbnNpb25zLmZpcmUoe1xuXHRcdFx0XHRcdHRlcm1pbmFsOiB0ZXJtaW5hbC52YWx1ZSxcblx0XHRcdFx0XHRkaW1lbnNpb25zOiB0ZXJtaW5hbC52YWx1ZS5kaW1lbnNpb25zIGFzIHZzY29kZS5UZXJtaW5hbERpbWVuc2lvbnNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHREaWRFeGVjdXRlQ29tbWFuZChpZDogbnVtYmVyLCBjb21tYW5kOiBJVGVybWluYWxDb21tYW5kRHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLmdldFRlcm1pbmFsQnlJZChpZCk7XG5cdFx0aWYgKHRlcm1pbmFsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZEV4ZWN1dGVDb21tYW5kLmZpcmUoeyB0ZXJtaW5hbDogdGVybWluYWwudmFsdWUsIC4uLmNvbW1hbmQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHRUZXJtaW5hbE1heGltdW1EaW1lbnNpb25zKGlkOiBudW1iZXIsIGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRXh0ZW5zaW9uIHB0eSB0ZXJtaW5hbCBvbmx5IC0gd2hlbiB2aXJ0dWFsIHByb2Nlc3MgcmVzaXplIGZpcmVzIGl0IG1lYW5zIHRoYXQgdGhlXG5cdFx0Ly8gdGVybWluYWwncyBtYXhpbXVtIGRpbWVuc2lvbnMgY2hhbmdlZFxuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmdldChpZCk/LnJlc2l6ZShjb2xzLCByb3dzKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0VGVybWluYWxUaXRsZUNoYW5nZShpZDogbnVtYmVyLCBuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKTtcblx0XHRpZiAodGVybWluYWwpIHtcblx0XHRcdHRlcm1pbmFsLm5hbWUgPSBuYW1lO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0VGVybWluYWxDbG9zZWQoaWQ6IG51bWJlciwgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCwgZXhpdFJlYXNvbjogVGVybWluYWxFeGl0UmVhc29uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gUmVsZWFzZSBhbnkgY2FjaGVkIHRlcm1pbmFsIGxpbmtzIGFuZCBjYW5jZWwgaW4tZmxpZ2h0IGxpbmsgcHJvdmlkZXJzIGZvciB0aGlzIHRlcm1pbmFsXG5cdFx0dGhpcy5fdGVybWluYWxMaW5rQ2FjaGUuZGVsZXRlKGlkKTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25Tb3VyY2UgPSB0aGlzLl90ZXJtaW5hbExpbmtDYW5jZWxsYXRpb25Tb3VyY2UuZ2V0KGlkKTtcblx0XHRpZiAoY2FuY2VsbGF0aW9uU291cmNlKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbExpbmtDYW5jZWxsYXRpb25Tb3VyY2UuZGVsZXRlKGlkKTtcblx0XHRcdGNhbmNlbGxhdGlvblNvdXJjZS5kaXNwb3NlKHRydWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZ2V0VGVybWluYWxPYmplY3RJbmRleEJ5SWQodGhpcy5fdGVybWluYWxzLCBpZCk7XG5cdFx0aWYgKGluZGV4ICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFscy5zcGxpY2UoaW5kZXgsIDEpWzBdO1xuXHRcdFx0dGVybWluYWwuc2V0RXhpdFN0YXR1cyhleGl0Q29kZSwgZXhpdFJlYXNvbik7XG5cdFx0XHR0aGlzLl9vbkRpZENsb3NlVGVybWluYWwuZmlyZSh0ZXJtaW5hbC52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljICRhY2NlcHRUZXJtaW5hbE9wZW5lZChpZDogbnVtYmVyLCBleHRIb3N0VGVybWluYWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBuYW1lOiBzdHJpbmcsIHNoZWxsTGF1bmNoQ29uZmlnRHRvOiBJU2hlbGxMYXVuY2hDb25maWdEdG8pOiB2b2lkIHtcblx0XHRpZiAoZXh0SG9zdFRlcm1pbmFsSWQpIHtcblx0XHRcdC8vIFJlc29sdmUgd2l0aCB0aGUgcmVuZGVyZXIgZ2VuZXJhdGVkIGlkXG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2dldFRlcm1pbmFsT2JqZWN0SW5kZXhCeUlkKHRoaXMuX3Rlcm1pbmFscywgZXh0SG9zdFRlcm1pbmFsSWQpO1xuXHRcdFx0aWYgKGluZGV4ICE9PSBudWxsKSB7XG5cdFx0XHRcdC8vIFRoZSB0ZXJtaW5hbCBoYXMgYWxyZWFkeSBiZWVuIGNyZWF0ZWQgKHZpYSBjcmVhdGVUZXJtaW5hbCopLCBvbmx5IGZpcmUgdGhlIGV2ZW50XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsc1tpbmRleF0uX2lkID0gaWQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkT3BlblRlcm1pbmFsLmZpcmUodGhpcy50ZXJtaW5hbHNbaW5kZXhdKTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxzW2luZGV4XS5pc09wZW4gPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3JlYXRpb25PcHRpb25zOiB2c2NvZGUuVGVybWluYWxPcHRpb25zID0ge1xuXHRcdFx0bmFtZTogc2hlbGxMYXVuY2hDb25maWdEdG8ubmFtZSxcblx0XHRcdHNoZWxsUGF0aDogc2hlbGxMYXVuY2hDb25maWdEdG8uZXhlY3V0YWJsZSxcblx0XHRcdHNoZWxsQXJnczogc2hlbGxMYXVuY2hDb25maWdEdG8uYXJncyxcblx0XHRcdGN3ZDogdHlwZW9mIHNoZWxsTGF1bmNoQ29uZmlnRHRvLmN3ZCA9PT0gJ3N0cmluZycgPyBzaGVsbExhdW5jaENvbmZpZ0R0by5jd2QgOiBVUkkucmV2aXZlKHNoZWxsTGF1bmNoQ29uZmlnRHRvLmN3ZCksXG5cdFx0XHRlbnY6IHNoZWxsTGF1bmNoQ29uZmlnRHRvLmVudixcblx0XHRcdGhpZGVGcm9tVXNlcjogc2hlbGxMYXVuY2hDb25maWdEdG8uaGlkZUZyb21Vc2VyLFxuXHRcdFx0dGl0bGVUZW1wbGF0ZTogc2hlbGxMYXVuY2hDb25maWdEdG8udGl0bGVUZW1wbGF0ZVxuXHRcdH07XG5cdFx0Y29uc3QgdGVybWluYWwgPSBuZXcgRXh0SG9zdFRlcm1pbmFsKHRoaXMuX3Byb3h5LCBpZCwgY3JlYXRpb25PcHRpb25zLCBuYW1lKTtcblx0XHR0aGlzLl90ZXJtaW5hbHMucHVzaCh0ZXJtaW5hbCk7XG5cdFx0dGhpcy5fb25EaWRPcGVuVGVybWluYWwuZmlyZSh0ZXJtaW5hbC52YWx1ZSk7XG5cdFx0dGVybWluYWwuaXNPcGVuID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0VGVybWluYWxQcm9jZXNzSWQoaWQ6IG51bWJlciwgcHJvY2Vzc0lkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKTtcblx0XHR0ZXJtaW5hbD8uX3NldFByb2Nlc3NJZChwcm9jZXNzSWQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRzdGFydEV4dGVuc2lvblRlcm1pbmFsKGlkOiBudW1iZXIsIGluaXRpYWxEaW1lbnNpb25zOiBJVGVybWluYWxEaW1lbnNpb25zRHRvIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIE1ha2Ugc3VyZSB0aGUgRXh0SG9zdFRlcm1pbmFsIGV4aXN0cyBzbyBvbkRpZE9wZW5UZXJtaW5hbCBoYXMgZmlyZWQgYmVmb3JlIHdlIGNhbGxcblx0XHQvLyBQc2V1ZG90ZXJtaW5hbC5zdGFydFxuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5nZXRUZXJtaW5hbEJ5SWQoaWQpO1xuXHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdHJldHVybiB7IG1lc3NhZ2U6IGxvY2FsaXplKCdsYXVuY2hGYWlsLmlkTWlzc2luZ09uRXh0SG9zdCcsIFwiQ291bGQgbm90IGZpbmQgdGhlIHRlcm1pbmFsIHdpdGggaWQgezB9IG9uIHRoZSBleHRlbnNpb24gaG9zdFwiLCBpZCkgfTtcblx0XHR9XG5cblx0XHQvLyBXYWl0IGZvciBvbkRpZE9wZW5UZXJtaW5hbCB0byBmaXJlXG5cdFx0aWYgKCF0ZXJtaW5hbC5pc09wZW4pIHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0XHQvLyBFbnN1cmUgb3BlbiBpcyBjYWxsZWQgYWZ0ZXIgb25EaWRPcGVuVGVybWluYWxcblx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLm9uRGlkT3BlblRlcm1pbmFsKGFzeW5jIGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlID09PSB0ZXJtaW5hbC52YWx1ZSkge1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXJtaW5hbFByb2Nlc3MgPSB0aGlzLl90ZXJtaW5hbFByb2Nlc3Nlcy5nZXQoaWQpO1xuXHRcdGlmICh0ZXJtaW5hbFByb2Nlc3MpIHtcblx0XHRcdCh0ZXJtaW5hbFByb2Nlc3MgYXMgRXh0SG9zdFBzZXVkb3Rlcm1pbmFsKS5zdGFydFNlbmRpbmdFdmVudHMoaW5pdGlhbERpbWVuc2lvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBEZWZlciBzdGFydFNlbmRpbmdFdmVudHMgY2FsbCB0byB3aGVuIF9zZXR1cEV4dEhvc3RQcm9jZXNzTGlzdGVuZXJzIGlzIGNhbGxlZFxuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uVGVybWluYWxBd2FpdGluZ1N0YXJ0W2lkXSA9IHsgaW5pdGlhbERpbWVuc2lvbnMgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zZXR1cEV4dEhvc3RQcm9jZXNzTGlzdGVuZXJzKGlkOiBudW1iZXIsIHA6IElUZXJtaW5hbENoaWxkUHJvY2Vzcyk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocC5vblByb2Nlc3NSZWFkeShlID0+IHRoaXMuX3Byb3h5LiRzZW5kUHJvY2Vzc1JlYWR5KGlkLCBlLnBpZCwgZS5jd2QsIGUud2luZG93c1B0eSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocC5vbkRpZENoYW5nZVByb3BlcnR5KHByb3BlcnR5ID0+IHRoaXMuX3Byb3h5LiRzZW5kUHJvY2Vzc1Byb3BlcnR5KGlkLCBwcm9wZXJ0eSkpKTtcblxuXHRcdC8vIEJ1ZmZlciBkYXRhIGV2ZW50cyB0byByZWR1Y2UgdGhlIGFtb3VudCBvZiBtZXNzYWdlcyBnb2luZyB0byB0aGUgcmVuZGVyZXJcblx0XHR0aGlzLl9idWZmZXJlci5zdGFydEJ1ZmZlcmluZyhpZCwgcC5vblByb2Nlc3NEYXRhKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocC5vblByb2Nlc3NFeGl0KGV4aXRDb2RlID0+IHRoaXMuX29uUHJvY2Vzc0V4aXQoaWQsIGV4aXRDb2RlKSkpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLnNldChpZCwgcCk7XG5cblx0XHRjb25zdCBhd2FpdGluZ1N0YXJ0ID0gdGhpcy5fZXh0ZW5zaW9uVGVybWluYWxBd2FpdGluZ1N0YXJ0W2lkXTtcblx0XHRpZiAoYXdhaXRpbmdTdGFydCAmJiBwIGluc3RhbmNlb2YgRXh0SG9zdFBzZXVkb3Rlcm1pbmFsKSB7XG5cdFx0XHRwLnN0YXJ0U2VuZGluZ0V2ZW50cyhhd2FpdGluZ1N0YXJ0LmluaXRpYWxEaW1lbnNpb25zKTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9leHRlbnNpb25UZXJtaW5hbEF3YWl0aW5nU3RhcnRbaWRdO1xuXHRcdH1cblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0UHJvY2Vzc0Fja0RhdGFFdmVudChpZDogbnVtYmVyLCBjaGFyQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmdldChpZCk/LmFja25vd2xlZGdlRGF0YUV2ZW50KGNoYXJDb3VudCk7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdFByb2Nlc3NJbnB1dChpZDogbnVtYmVyLCBkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbFByb2Nlc3Nlcy5nZXQoaWQpPy5pbnB1dChkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0VGVybWluYWxJbnRlcmFjdGlvbihpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLmdldFRlcm1pbmFsQnlJZChpZCk7XG5cdFx0aWYgKHRlcm1pbmFsPy5zZXRJbnRlcmFjdGVkV2l0aCgpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRlcm1pbmFsU3RhdGUuZmlyZSh0ZXJtaW5hbC52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljICRhY2NlcHRUZXJtaW5hbFNlbGVjdGlvbihpZDogbnVtYmVyLCBzZWxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuZ2V0VGVybWluYWxCeUlkKGlkKT8uc2V0U2VsZWN0aW9uKHNlbGVjdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdFByb2Nlc3NSZXNpemUoaWQ6IG51bWJlciwgY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzZXMuZ2V0KGlkKT8ucmVzaXplKGNvbHMsIHJvd3MpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBXZSB0cmllZCB0byB3cml0ZSB0byBhIGNsb3NlZCBwaXBlIC8gY2hhbm5lbC5cblx0XHRcdGlmIChlcnJvci5jb2RlICE9PSAnRVBJUEUnICYmIGVycm9yLmNvZGUgIT09ICdFUlJfSVBDX0NIQU5ORUxfQ0xPU0VEJykge1xuXHRcdFx0XHR0aHJvdyAoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0UHJvY2Vzc1NodXRkb3duKGlkOiBudW1iZXIsIGltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmdldChpZCk/LnNodXRkb3duKGltbWVkaWF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgJGFjY2VwdFByb2Nlc3NSZXF1ZXN0SW5pdGlhbEN3ZChpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWxQcm9jZXNzZXMuZ2V0KGlkKT8uZ2V0SW5pdGlhbEN3ZCgpLnRoZW4oaW5pdGlhbEN3ZCA9PiB0aGlzLl9wcm94eS4kc2VuZFByb2Nlc3NQcm9wZXJ0eShpZCwgeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLkluaXRpYWxDd2QsIHZhbHVlOiBpbml0aWFsQ3dkIH0pKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0UHJvY2Vzc1JlcXVlc3RDd2QoaWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmdldChpZCk/LmdldEN3ZCgpLnRoZW4oY3dkID0+IHRoaXMuX3Byb3h5LiRzZW5kUHJvY2Vzc1Byb3BlcnR5KGlkLCB7IHR5cGU6IFByb2Nlc3NQcm9wZXJ0eVR5cGUuQ3dkLCB2YWx1ZTogY3dkIH0pKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0UHJvY2Vzc1JlcXVlc3RMYXRlbmN5KGlkOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoaWQpO1xuXHR9XG5cblxuXHRwdWJsaWMgcmVnaXN0ZXJQcm9maWxlUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxQcm9maWxlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX3Byb2ZpbGVQcm92aWRlcnMuaGFzKGlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUZXJtaW5hbCBwcm9maWxlIHByb3ZpZGVyIFwiJHtpZH1cIiBhbHJlYWR5IHJlZ2lzdGVyZWRgKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvZmlsZVByb3ZpZGVycy5zZXQoaWQsIHsgcHJvdmlkZXIsIGV4dGVuc2lvbiB9KTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJQcm9maWxlUHJvdmlkZXIoaWQsIGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRyZXR1cm4gbmV3IFZTQ29kZURpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJvZmlsZVByb3ZpZGVycy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJQcm9maWxlUHJvdmlkZXIoaWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHByb3ZpZGVyOiB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXI8VGVybWluYWxDb21wbGV0aW9uSXRlbT4sIC4uLnRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fY29tcGxldGlvblByb3ZpZGVycy5oYXMoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRlcm1pbmFsIGNvbXBsZXRpb24gcHJvdmlkZXIgXCIke2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfVwiIGFscmVhZHkgcmVnaXN0ZXJlZGApO1xuXHRcdH1cblx0XHR0aGlzLl9jb21wbGV0aW9uUHJvdmlkZXJzLnNldChleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSwgcHJvdmlkZXIpO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckNvbXBsZXRpb25Qcm92aWRlcihleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsIC4uLnRyaWdnZXJDaGFyYWN0ZXJzKTtcblx0XHRyZXR1cm4gbmV3IFZTQ29kZURpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29tcGxldGlvblByb3ZpZGVycy5kZWxldGUoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJDb21wbGV0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRwcm92aWRlVGVybWluYWxDb21wbGV0aW9ucyhpZDogc3RyaW5nLCBvcHRpb25zOiBJVGVybWluYWxDb21wbGV0aW9uQ29udGV4dER0byk6IFByb21pc2U8VGVybWluYWxDb21wbGV0aW9uTGlzdER0byB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRva2VuID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkudG9rZW47XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICF0aGlzLmFjdGl2ZVRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY29tcGxldGlvblByb3ZpZGVycy5nZXQoaWQpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVUZXJtaW5hbENvbXBsZXRpb25zKHRoaXMuYWN0aXZlVGVybWluYWwsIG9wdGlvbnMsIHRva2VuKTtcblx0XHRpZiAoY29tcGxldGlvbnMgPT09IG51bGwgfHwgY29tcGxldGlvbnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGF0aFNlcGFyYXRvciA9ICFpc1dpbmRvd3MgfHwgdGhpcy5hY3RpdmVUZXJtaW5hbC5zdGF0ZT8uc2hlbGwgPT09IFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCA/ICcvJyA6ICdcXFxcJztcblx0XHRyZXR1cm4gVGVybWluYWxDb21wbGV0aW9uTGlzdC5mcm9tKGNvbXBsZXRpb25zLCBwYXRoU2VwYXJhdG9yKTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0VGVybWluYWxTaGVsbFR5cGUoaWQ6IG51bWJlciwgc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5nZXRUZXJtaW5hbEJ5SWQoaWQpO1xuXHRcdGlmICh0ZXJtaW5hbD8uc2V0U2hlbGxUeXBlKHNoZWxsVHlwZSkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVGVybWluYWxTdGF0ZS5maXJlKHRlcm1pbmFsLnZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJUZXJtaW5hbFF1aWNrRml4UHJvdmlkZXIoaWQ6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5UZXJtaW5hbFF1aWNrRml4UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX3F1aWNrRml4UHJvdmlkZXJzLmhhcyhpZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGVybWluYWwgcXVpY2sgZml4IHByb3ZpZGVyIFwiJHtpZH1cIiBpcyBhbHJlYWR5IHJlZ2lzdGVyZWRgKTtcblx0XHR9XG5cdFx0dGhpcy5fcXVpY2tGaXhQcm92aWRlcnMuc2V0KGlkLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyUXVpY2tGaXhQcm92aWRlcihpZCwgZXh0ZW5zaW9uSWQpO1xuXHRcdHJldHVybiBuZXcgVlNDb2RlRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9xdWlja0ZpeFByb3ZpZGVycy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJRdWlja0ZpeFByb3ZpZGVyKGlkKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkcHJvdmlkZVRlcm1pbmFsUXVpY2tGaXhlcyhpZDogc3RyaW5nLCBtYXRjaFJlc3VsdDogVGVybWluYWxDb21tYW5kTWF0Y2hSZXN1bHREdG8pOiBQcm9taXNlPChJVGVybWluYWxRdWlja0ZpeFRlcm1pbmFsQ29tbWFuZER0byB8IElUZXJtaW5hbFF1aWNrRml4T3BlbmVyRHRvIHwgSUNvbW1hbmREdG8pW10gfCBJVGVybWluYWxRdWlja0ZpeFRlcm1pbmFsQ29tbWFuZER0byB8IElUZXJtaW5hbFF1aWNrRml4T3BlbmVyRHRvIHwgSUNvbW1hbmREdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0b2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpLnRva2VuO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3F1aWNrRml4UHJvdmlkZXJzLmdldChpZCk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBxdWlja0ZpeGVzID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZVRlcm1pbmFsUXVpY2tGaXhlcyhtYXRjaFJlc3VsdCwgdG9rZW4pO1xuXHRcdGlmIChxdWlja0ZpeGVzID09PSBudWxsIHx8IChBcnJheS5pc0FycmF5KHF1aWNrRml4ZXMpICYmIHF1aWNrRml4ZXMubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9sYXN0UXVpY2tGaXhDb21tYW5kcy52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0Ly8gU2luZ2xlXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHF1aWNrRml4ZXMpKSB7XG5cdFx0XHRyZXR1cm4gcXVpY2tGaXhlcyA/IFRlcm1pbmFsUXVpY2tGaXguZnJvbShxdWlja0ZpeGVzLCB0aGlzLl9leHRIb3N0Q29tbWFuZHMuY29udmVydGVyLCBzdG9yZSkgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gTWFueVxuXHRcdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRcdGZvciAoY29uc3QgZml4IG9mIHF1aWNrRml4ZXMpIHtcblx0XHRcdGNvbnN0IGNvbnZlcnRlZCA9IFRlcm1pbmFsUXVpY2tGaXguZnJvbShmaXgsIHRoaXMuX2V4dEhvc3RDb21tYW5kcy5jb252ZXJ0ZXIsIHN0b3JlKTtcblx0XHRcdGlmIChjb252ZXJ0ZWQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goY29udmVydGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkY3JlYXRlQ29udHJpYnV0ZWRQcm9maWxlVGVybWluYWwoaWQ6IHN0cmluZywgb3B0aW9uczogSUNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRva2VuID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkudG9rZW47XG5cdFx0Y29uc3QgcHJvZmlsZVByb3ZpZGVyRGF0YSA9IHRoaXMuX3Byb2ZpbGVQcm92aWRlcnMuZ2V0KGlkKTtcblx0XHRpZiAoIXByb2ZpbGVQcm92aWRlckRhdGEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gdGVybWluYWwgcHJvZmlsZSBwcm92aWRlciByZWdpc3RlcmVkIGZvciBpZCBcIiR7aWR9XCJgKTtcblx0XHR9XG5cdFx0bGV0IHByb2ZpbGUgPSBhd2FpdCBwcm9maWxlUHJvdmlkZXJEYXRhLnByb3ZpZGVyLnByb3ZpZGVUZXJtaW5hbFByb2ZpbGUodG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocHJvZmlsZSAmJiAhaGFzS2V5KHByb2ZpbGUsIHsgb3B0aW9uczogdHJ1ZSB9KSkge1xuXHRcdFx0cHJvZmlsZSA9IHsgb3B0aW9uczogcHJvZmlsZSB9O1xuXHRcdH1cblxuXHRcdGlmICghcHJvZmlsZSB8fCAhaGFzS2V5KHByb2ZpbGUsIHsgb3B0aW9uczogdHJ1ZSB9KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyB0ZXJtaW5hbCBwcm9maWxlIG9wdGlvbnMgcHJvdmlkZWQgZm9yIGlkIFwiJHtpZH1cImApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1Rlcm1pbmFsVGl0bGVQcm9wb3NhbCA9IGlzUHJvcG9zZWRBcGlFbmFibGVkKHByb2ZpbGVQcm92aWRlckRhdGEuZXh0ZW5zaW9uLCAndGVybWluYWxUaXRsZScpO1xuXHRcdGlmICghaGFzVGVybWluYWxUaXRsZVByb3Bvc2FsICYmIHByb2ZpbGUub3B0aW9ucy50aXRsZVRlbXBsYXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYFske3Byb2ZpbGVQcm92aWRlckRhdGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XSBcXGB0aXRsZVRlbXBsYXRlXFxgIHJldHVybmVkIGZyb20gVGVybWluYWxQcm9maWxlUHJvdmlkZXIgaXMgaWdub3JlZCBiZWNhdXNlIHRoZSBcXGB0ZXJtaW5hbFRpdGxlXFxgIHByb3Bvc2VkIEFQSSBpcyBub3QgZW5hYmxlZC5gKTtcblx0XHRcdHByb2ZpbGUgPSB7IG9wdGlvbnM6IHsgLi4ucHJvZmlsZS5vcHRpb25zLCB0aXRsZVRlbXBsYXRlOiB1bmRlZmluZWQgfSB9O1xuXHRcdH1cblx0XHQvLyBvcHRpb25zLnRpdGxlVGVtcGxhdGUgaXMgbm90IGV4cGxpY2l0bHkgc3RyaXBwZWQgaGVyZSBiZWNhdXNlIHRoZSBwcm9maWxlT3B0aW9uc1xuXHRcdC8vIGFzc2lnbm1lbnQgYmVsb3cgb25seSBhcHBsaWVzIGl0IHdoZW4gaGFzVGVybWluYWxUaXRsZVByb3Bvc2FsIGlzIHRydWUuXG5cdFx0aWYgKCFoYXNUZXJtaW5hbFRpdGxlUHJvcG9zYWwgJiYgb3B0aW9ucy50aXRsZVRlbXBsYXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYFske3Byb2ZpbGVQcm92aWRlckRhdGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XSBcXGB0aXRsZVRlbXBsYXRlXFxgIHBhc3NlZCB0byBjcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZSBpcyBpZ25vcmVkIGJlY2F1c2UgdGhlIFxcYHRlcm1pbmFsVGl0bGVcXGAgcHJvcG9zZWQgQVBJIGlzIG5vdCBlbmFibGVkLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2ZpbGVPcHRpb25zID0gaGFzVGVybWluYWxUaXRsZVByb3Bvc2FsICYmIG9wdGlvbnMudGl0bGVUZW1wbGF0ZSAmJiAhcHJvZmlsZS5vcHRpb25zLnRpdGxlVGVtcGxhdGVcblx0XHRcdD8geyAuLi5wcm9maWxlLm9wdGlvbnMsIHRpdGxlVGVtcGxhdGU6IG9wdGlvbnMudGl0bGVUZW1wbGF0ZSB9XG5cdFx0XHQ6IHByb2ZpbGUub3B0aW9ucztcblxuXHRcdGlmIChoYXNLZXkocHJvZmlsZU9wdGlvbnMsIHsgcHR5OiB0cnVlIH0pKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZUV4dGVuc2lvblRlcm1pbmFsKHByb2ZpbGVPcHRpb25zLCBvcHRpb25zKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jcmVhdGVUZXJtaW5hbEZyb21PcHRpb25zKHByb2ZpbGVPcHRpb25zLCBvcHRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckxpbmtQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLlRlcm1pbmFsTGlua1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdHRoaXMuX2xpbmtQcm92aWRlcnMuYWRkKHByb3ZpZGVyKTtcblx0XHRpZiAodGhpcy5fbGlua1Byb3ZpZGVycy5zaXplID09PSAxKSB7XG5cdFx0XHR0aGlzLl9wcm94eS4kc3RhcnRMaW5rUHJvdmlkZXIoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBWU0NvZGVEaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2xpbmtQcm92aWRlcnMuZGVsZXRlKHByb3ZpZGVyKTtcblx0XHRcdGlmICh0aGlzLl9saW5rUHJvdmlkZXJzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJHN0b3BMaW5rUHJvdmlkZXIoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkcHJvdmlkZUxpbmtzKHRlcm1pbmFsSWQ6IG51bWJlciwgbGluZTogc3RyaW5nKTogUHJvbWlzZTxJVGVybWluYWxMaW5rRHRvW10+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuZ2V0VGVybWluYWxCeUlkKHRlcm1pbmFsSWQpO1xuXHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBEaXNjYXJkIGFueSBjYWNoZWQgbGlua3MgdGhlIHRlcm1pbmFsIGhhcyBiZWVuIGhvbGRpbmcsIGN1cnJlbnRseSBhbGwgbGlua3MgYXJlIHJlbGVhc2VkXG5cdFx0Ly8gd2hlbiBuZXcgbGlua3MgYXJlIHByb3ZpZGVkLlxuXHRcdHRoaXMuX3Rlcm1pbmFsTGlua0NhY2hlLmRlbGV0ZSh0ZXJtaW5hbElkKTtcblxuXHRcdGNvbnN0IG9sZFRva2VuID0gdGhpcy5fdGVybWluYWxMaW5rQ2FuY2VsbGF0aW9uU291cmNlLmdldCh0ZXJtaW5hbElkKTtcblx0XHRvbGRUb2tlbj8uZGlzcG9zZSh0cnVlKTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb25Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl90ZXJtaW5hbExpbmtDYW5jZWxsYXRpb25Tb3VyY2Uuc2V0KHRlcm1pbmFsSWQsIGNhbmNlbGxhdGlvblNvdXJjZSk7XG5cblx0XHRjb25zdCByZXN1bHQ6IElUZXJtaW5hbExpbmtEdG9bXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRleHQ6IHZzY29kZS5UZXJtaW5hbExpbmtDb250ZXh0ID0geyB0ZXJtaW5hbDogdGVybWluYWwudmFsdWUsIGxpbmUgfTtcblx0XHRjb25zdCBwcm9taXNlczogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHsgcHJvdmlkZXI6IHZzY29kZS5UZXJtaW5hbExpbmtQcm92aWRlcjsgbGlua3M6IHZzY29kZS5UZXJtaW5hbExpbmtbXSB9PltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX2xpbmtQcm92aWRlcnMpIHtcblx0XHRcdHByb21pc2VzLnB1c2goUHJvbWlzZXMud2l0aEFzeW5jQm9keShhc3luYyByID0+IHtcblx0XHRcdFx0Y29uc3QgY2FuY2VsU3Vic2NyaXB0aW9uID0gY2FuY2VsbGF0aW9uU291cmNlLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHIoeyBwcm92aWRlciwgbGlua3M6IFtdIH0pKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBsaW5rcyA9IChhd2FpdCBwcm92aWRlci5wcm92aWRlVGVybWluYWxMaW5rcyhjb250ZXh0LCBjYW5jZWxsYXRpb25Tb3VyY2UudG9rZW4pKSB8fCBbXTtcblx0XHRcdFx0XHRpZiAoIWNhbmNlbGxhdGlvblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cih7IHByb3ZpZGVyLCBsaW5rcyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0Y2FuY2VsU3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVSZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG5cdFx0aWYgKGNhbmNlbGxhdGlvblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlTGlua01hcCA9IG5ldyBNYXA8bnVtYmVyLCBJQ2FjaGVkTGlua0VudHJ5PigpO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZVJlc3VsdCBvZiBwcm92aWRlUmVzdWx0cykge1xuXHRcdFx0aWYgKHByb3ZpZGVSZXN1bHQgJiYgcHJvdmlkZVJlc3VsdC5saW5rcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKC4uLnByb3ZpZGVSZXN1bHQubGlua3MubWFwKHByb3ZpZGVyTGluayA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbGluayA9IHtcblx0XHRcdFx0XHRcdGlkOiBuZXh0TGlua0lkKyssXG5cdFx0XHRcdFx0XHRzdGFydEluZGV4OiBwcm92aWRlckxpbmsuc3RhcnRJbmRleCxcblx0XHRcdFx0XHRcdGxlbmd0aDogcHJvdmlkZXJMaW5rLmxlbmd0aCxcblx0XHRcdFx0XHRcdGxhYmVsOiBwcm92aWRlckxpbmsudG9vbHRpcFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0Y2FjaGVMaW5rTWFwLnNldChsaW5rLmlkLCB7XG5cdFx0XHRcdFx0XHRwcm92aWRlcjogcHJvdmlkZVJlc3VsdC5wcm92aWRlcixcblx0XHRcdFx0XHRcdGxpbms6IHByb3ZpZGVyTGlua1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybiBsaW5rO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVybWluYWxMaW5rQ2FjaGUuc2V0KHRlcm1pbmFsSWQsIGNhY2hlTGlua01hcCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0JGFjdGl2YXRlTGluayh0ZXJtaW5hbElkOiBudW1iZXIsIGxpbmtJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FjaGVkTGluayA9IHRoaXMuX3Rlcm1pbmFsTGlua0NhY2hlLmdldCh0ZXJtaW5hbElkKT8uZ2V0KGxpbmtJZCk7XG5cdFx0aWYgKCFjYWNoZWRMaW5rKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNhY2hlZExpbmsucHJvdmlkZXIuaGFuZGxlVGVybWluYWxMaW5rKGNhY2hlZExpbmsubGluayk7XG5cdH1cblxuXHRwcml2YXRlIF9vblByb2Nlc3NFeGl0KGlkOiBudW1iZXIsIGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9idWZmZXJlci5zdG9wQnVmZmVyaW5nKGlkKTtcblxuXHRcdC8vIFJlbW92ZSBwcm9jZXNzIHJlZmVyZW5jZVxuXHRcdHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc2VzLmRlbGV0ZShpZCk7XG5cdFx0ZGVsZXRlIHRoaXMuX2V4dGVuc2lvblRlcm1pbmFsQXdhaXRpbmdTdGFydFtpZF07XG5cblx0XHQvLyBDbGVhbiB1cCBwcm9jZXNzIGRpc3Bvc2FibGVzXG5cdFx0Y29uc3QgcHJvY2Vzc0RpcG9zYWJsZSA9IHRoaXMuX3Rlcm1pbmFsUHJvY2Vzc0Rpc3Bvc2FibGVzW2lkXTtcblx0XHRpZiAocHJvY2Vzc0RpcG9zYWJsZSkge1xuXHRcdFx0cHJvY2Vzc0RpcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRkZWxldGUgdGhpcy5fdGVybWluYWxQcm9jZXNzRGlzcG9zYWJsZXNbaWRdO1xuXHRcdH1cblx0XHQvLyBTZW5kIGV4aXQgZXZlbnQgdG8gbWFpbiBzaWRlXG5cdFx0dGhpcy5fcHJveHkuJHNlbmRQcm9jZXNzRXhpdChpZCwgZXhpdENvZGUpO1xuXHR9XG5cblx0cHVibGljIGdldFRlcm1pbmFsQnlJZChpZDogbnVtYmVyKTogRXh0SG9zdFRlcm1pbmFsIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldFRlcm1pbmFsT2JqZWN0QnlJZCh0aGlzLl90ZXJtaW5hbHMsIGlkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUZXJtaW5hbElkQnlBcGlPYmplY3QodGVybWluYWw6IHZzY29kZS5UZXJtaW5hbCk6IG51bWJlciB8IG51bGwge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fdGVybWluYWxzLmZpbmRJbmRleChpdGVtID0+IHtcblx0XHRcdHJldHVybiBpdGVtLnZhbHVlID09PSB0ZXJtaW5hbDtcblx0XHR9KTtcblx0XHRyZXR1cm4gaW5kZXggPj0gMCA/IGluZGV4IDogbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRlcm1pbmFsT2JqZWN0QnlJZDxUIGV4dGVuZHMgRXh0SG9zdFRlcm1pbmFsPihhcnJheTogVFtdLCBpZDogbnVtYmVyKTogVCB8IG51bGwge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fZ2V0VGVybWluYWxPYmplY3RJbmRleEJ5SWQoYXJyYXksIGlkKTtcblx0XHRyZXR1cm4gaW5kZXggIT09IG51bGwgPyBhcnJheVtpbmRleF0gOiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGVybWluYWxPYmplY3RJbmRleEJ5SWQ8VCBleHRlbmRzIEV4dEhvc3RUZXJtaW5hbD4oYXJyYXk6IFRbXSwgaWQ6IEV4dEhvc3RUZXJtaW5hbElkZW50aWZpZXIpOiBudW1iZXIgfCBudWxsIHtcblx0XHRjb25zdCBpbmRleCA9IGFycmF5LmZpbmRJbmRleChpdGVtID0+IHtcblx0XHRcdHJldHVybiBpdGVtLl9pZCA9PT0gaWQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGluZGV4ID49IDAgPyBpbmRleCA6IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBJRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24ge1xuXHRcdGxldCBjb2xsZWN0aW9uID0gdGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zLmdldChleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0aWYgKCFjb2xsZWN0aW9uKSB7XG5cdFx0XHRjb2xsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFVuaWZpZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbigpKTtcblx0XHRcdHRoaXMuX3NldEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlLCBjb2xsZWN0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbGxlY3Rpb24uZ2V0U2NvcGVkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24odW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3N5bmNFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmcsIGNvbGxlY3Rpb246IFVuaWZpZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihjb2xsZWN0aW9uLm1hcCk7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZERlc2NyaXB0aW9uID0gc2VyaWFsaXplRW52aXJvbm1lbnREZXNjcmlwdGlvbk1hcChjb2xsZWN0aW9uLmRlc2NyaXB0aW9uTWFwKTtcblx0XHR0aGlzLl9wcm94eS4kc2V0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZXh0ZW5zaW9uSWRlbnRpZmllciwgY29sbGVjdGlvbi5wZXJzaXN0ZW50LCBzZXJpYWxpemVkLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IHNlcmlhbGl6ZWQsIHNlcmlhbGl6ZWREZXNjcmlwdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgJGluaXRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMoY29sbGVjdGlvbnM6IFtzdHJpbmcsIElTZXJpYWxpemFibGVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbl1bXSk6IHZvaWQge1xuXHRcdGNvbGxlY3Rpb25zLmZvckVhY2goZW50cnkgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWRlbnRpZmllciA9IGVudHJ5WzBdO1xuXHRcdFx0Y29uc3QgY29sbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBVbmlmaWVkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZW50cnlbMV0pKTtcblx0XHRcdHRoaXMuX3NldEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGV4dGVuc2lvbklkZW50aWZpZXIsIGNvbGxlY3Rpb24pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljICRhY2NlcHREZWZhdWx0UHJvZmlsZShwcm9maWxlOiBJVGVybWluYWxQcm9maWxlLCBhdXRvbWF0aW9uUHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZFByb2ZpbGUgPSB0aGlzLl9kZWZhdWx0UHJvZmlsZTtcblx0XHR0aGlzLl9kZWZhdWx0UHJvZmlsZSA9IHByb2ZpbGU7XG5cdFx0dGhpcy5fZGVmYXVsdEF1dG9tYXRpb25Qcm9maWxlID0gYXV0b21hdGlvblByb2ZpbGU7XG5cdFx0aWYgKG9sZFByb2ZpbGU/LnBhdGggIT09IHByb2ZpbGUucGF0aCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTaGVsbC5maXJlKHByb2ZpbGUucGF0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBjb2xsZWN0aW9uOiBVbmlmaWVkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMuc2V0KGV4dGVuc2lvbklkZW50aWZpZXIsIGNvbGxlY3Rpb24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbGxlY3Rpb24ub25EaWRDaGFuZ2VDb2xsZWN0aW9uKCgpID0+IHtcblx0XHRcdC8vIFdoZW4gYW55IGNvbGxlY3Rpb24gdmFsdWUgY2hhbmdlcyBzZW5kIHRoaXMgaW1tZWRpYXRlbHksIHRoaXMgaXMgZG9uZSB0byBlbnN1cmVcblx0XHRcdC8vIGZvbGxvd2luZyBjYWxscyB0byBjcmVhdGVUZXJtaW5hbCB3aWxsIGJlIGNyZWF0ZWQgd2l0aCB0aGUgbmV3IGVudmlyb25tZW50LiBJdCB3aWxsXG5cdFx0XHQvLyByZXN1bHQgaW4gbW9yZSBub2lzZSBieSBzZW5kaW5nIG11bHRpcGxlIHVwZGF0ZXMgd2hlbiBjYWxsZWQgYnV0IGNvbGxlY3Rpb25zIGFyZVxuXHRcdFx0Ly8gZXhwZWN0ZWQgdG8gYmUgc21hbGwuXG5cdFx0XHR0aGlzLl9zeW5jRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oZXh0ZW5zaW9uSWRlbnRpZmllciwgY29sbGVjdGlvbik7XG5cdFx0fSkpO1xuXHR9XG59XG5cbi8qKlxuICogVW5pZmllZCBlbnZpcm9ubWVudCB2YXJpYWJsZSBjb2xsZWN0aW9uIGNhcnJ5aW5nIGluZm9ybWF0aW9uIGZvciBhbGwgc2NvcGVzLCBmb3IgYSBzcGVjaWZpYyBleHRlbnNpb24uXG4gKi9cbmNsYXNzIFVuaWZpZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBtYXA6IE1hcDxzdHJpbmcsIElFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvcj4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2NvcGVkQ29sbGVjdGlvbnM6IE1hcDxzdHJpbmcsIFNjb3BlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uPiA9IG5ldyBNYXAoKTtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb25NYXA6IE1hcDxzdHJpbmcsIElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbkRlc2NyaXB0aW9uPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBfcGVyc2lzdGVudDogYm9vbGVhbiA9IHRydWU7XG5cblx0cHVibGljIGdldCBwZXJzaXN0ZW50KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fcGVyc2lzdGVudDsgfVxuXHRwdWJsaWMgc2V0IHBlcnNpc3RlbnQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9wZXJzaXN0ZW50ID0gdmFsdWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VDb2xsZWN0aW9uOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZUNvbGxlY3Rpb24oKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uICYmIHRoaXMuX29uRGlkQ2hhbmdlQ29sbGVjdGlvbi5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlcmlhbGl6ZWQ/OiBJU2VyaWFsaXphYmxlRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25cblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm1hcCA9IG5ldyBNYXAoc2VyaWFsaXplZCk7XG5cdH1cblxuXHRnZXRTY29wZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB7XG5cdFx0Y29uc3Qgc2NvcGVkQ29sbGVjdGlvbktleSA9IHRoaXMuZ2V0U2NvcGVLZXkoc2NvcGUpO1xuXHRcdGxldCBzY29wZWRDb2xsZWN0aW9uID0gdGhpcy5zY29wZWRDb2xsZWN0aW9ucy5nZXQoc2NvcGVkQ29sbGVjdGlvbktleSk7XG5cdFx0aWYgKCFzY29wZWRDb2xsZWN0aW9uKSB7XG5cdFx0XHRzY29wZWRDb2xsZWN0aW9uID0gbmV3IFNjb3BlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKHRoaXMsIHNjb3BlKTtcblx0XHRcdHRoaXMuc2NvcGVkQ29sbGVjdGlvbnMuc2V0KHNjb3BlZENvbGxlY3Rpb25LZXksIHNjb3BlZENvbGxlY3Rpb24pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoc2NvcGVkQ29sbGVjdGlvbi5vbkRpZENoYW5nZUNvbGxlY3Rpb24oKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2NvcGVkQ29sbGVjdGlvbjtcblx0fVxuXG5cdHJlcGxhY2UodmFyaWFibGU6IHN0cmluZywgdmFsdWU6IHN0cmluZywgb3B0aW9uczogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgc2NvcGU6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlU2NvcGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRJZkRpZmZlcnModmFyaWFibGUsIHsgdmFsdWUsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCBvcHRpb25zOiBvcHRpb25zID8/IHsgYXBwbHlBdFByb2Nlc3NDcmVhdGlvbjogdHJ1ZSB9LCBzY29wZSB9KTtcblx0fVxuXG5cdGFwcGVuZCh2YXJpYWJsZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCBvcHRpb25zOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldElmRGlmZmVycyh2YXJpYWJsZSwgeyB2YWx1ZSwgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgb3B0aW9uczogb3B0aW9ucyA/PyB7IGFwcGx5QXRQcm9jZXNzQ3JlYXRpb246IHRydWUgfSwgc2NvcGUgfSk7XG5cdH1cblxuXHRwcmVwZW5kKHZhcmlhYmxlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIG9wdGlvbnM6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0SWZEaWZmZXJzKHZhcmlhYmxlLCB7IHZhbHVlLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgb3B0aW9uczogb3B0aW9ucyA/PyB7IGFwcGx5QXRQcm9jZXNzQ3JlYXRpb246IHRydWUgfSwgc2NvcGUgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRJZkRpZmZlcnModmFyaWFibGU6IHN0cmluZywgbXV0YXRvcjogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yICYgeyBzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCB9KTogdm9pZCB7XG5cdFx0aWYgKG11dGF0b3Iub3B0aW9ucyAmJiBtdXRhdG9yLm9wdGlvbnMuYXBwbHlBdFByb2Nlc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiYgIW11dGF0b3Iub3B0aW9ucy5hcHBseUF0U2hlbGxJbnRlZ3JhdGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvck9wdGlvbnMgbXVzdCBhcHBseSBhdCBlaXRoZXIgcHJvY2VzcyBjcmVhdGlvbiBvciBzaGVsbCBpbnRlZ3JhdGlvbicpO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSB0aGlzLmdldEtleSh2YXJpYWJsZSwgbXV0YXRvci5zY29wZSk7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMubWFwLmdldChrZXkpO1xuXHRcdGNvbnN0IG5ld09wdGlvbnMgPSBtdXRhdG9yLm9wdGlvbnMgPyB7XG5cdFx0XHRhcHBseUF0UHJvY2Vzc0NyZWF0aW9uOiBtdXRhdG9yLm9wdGlvbnMuYXBwbHlBdFByb2Nlc3NDcmVhdGlvbiA/PyBmYWxzZSxcblx0XHRcdGFwcGx5QXRTaGVsbEludGVncmF0aW9uOiBtdXRhdG9yLm9wdGlvbnMuYXBwbHlBdFNoZWxsSW50ZWdyYXRpb24gPz8gZmFsc2UsXG5cdFx0fSA6IHtcblx0XHRcdGFwcGx5QXRQcm9jZXNzQ3JlYXRpb246IHRydWVcblx0XHR9O1xuXHRcdGlmIChcblx0XHRcdCFjdXJyZW50IHx8XG5cdFx0XHRjdXJyZW50LnZhbHVlICE9PSBtdXRhdG9yLnZhbHVlIHx8XG5cdFx0XHRjdXJyZW50LnR5cGUgIT09IG11dGF0b3IudHlwZSB8fFxuXHRcdFx0Y3VycmVudC5vcHRpb25zPy5hcHBseUF0UHJvY2Vzc0NyZWF0aW9uICE9PSBuZXdPcHRpb25zLmFwcGx5QXRQcm9jZXNzQ3JlYXRpb24gfHxcblx0XHRcdGN1cnJlbnQub3B0aW9ucz8uYXBwbHlBdFNoZWxsSW50ZWdyYXRpb24gIT09IG5ld09wdGlvbnMuYXBwbHlBdFNoZWxsSW50ZWdyYXRpb24gfHxcblx0XHRcdGN1cnJlbnQuc2NvcGU/LndvcmtzcGFjZUZvbGRlcj8uaW5kZXggIT09IG11dGF0b3Iuc2NvcGU/LndvcmtzcGFjZUZvbGRlcj8uaW5kZXhcblx0XHQpIHtcblx0XHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0S2V5KHZhcmlhYmxlLCBtdXRhdG9yLnNjb3BlKTtcblx0XHRcdGNvbnN0IHZhbHVlOiBJRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IgPSB7XG5cdFx0XHRcdHZhcmlhYmxlLFxuXHRcdFx0XHQuLi5tdXRhdG9yLFxuXHRcdFx0XHRvcHRpb25zOiBuZXdPcHRpb25zXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5tYXAuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQodmFyaWFibGU6IHN0cmluZywgc2NvcGU6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlU2NvcGUgfCB1bmRlZmluZWQpOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0S2V5KHZhcmlhYmxlLCBzY29wZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLm1hcC5nZXQoa2V5KTtcblx0XHQvLyBUT0RPOiBTZXQgb3B0aW9ucyB0byBkZWZhdWx0cyBpZiBuZWVkZWRcblx0XHRyZXR1cm4gdmFsdWUgPyBjb252ZXJ0TXV0YXRvcih2YWx1ZSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleSh2YXJpYWJsZTogc3RyaW5nLCBzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IHNjb3BlS2V5ID0gdGhpcy5nZXRTY29wZUtleShzY29wZSk7XG5cdFx0cmV0dXJuIHNjb3BlS2V5Lmxlbmd0aCA/IGAke3ZhcmlhYmxlfTo6OiR7c2NvcGVLZXl9YCA6IHZhcmlhYmxlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTY29wZUtleShzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0V29ya3NwYWNlS2V5KHNjb3BlPy53b3Jrc3BhY2VGb2xkZXIpID8/ICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3Jrc3BhY2VLZXkod29ya3NwYWNlRm9sZGVyOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gd29ya3NwYWNlRm9sZGVyID8gd29ya3NwYWNlRm9sZGVyLnVyaS50b1N0cmluZygpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldFZhcmlhYmxlTWFwKHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkKTogTWFwPHN0cmluZywgdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yPiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvcj4oKTtcblx0XHRmb3IgKGNvbnN0IFtfLCB2YWx1ZV0gb2YgdGhpcy5tYXApIHtcblx0XHRcdGlmICh0aGlzLmdldFNjb3BlS2V5KHZhbHVlLnNjb3BlKSA9PT0gdGhpcy5nZXRTY29wZUtleShzY29wZSkpIHtcblx0XHRcdFx0bWFwLnNldCh2YWx1ZS52YXJpYWJsZSwgY29udmVydE11dGF0b3IodmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1hcDtcblx0fVxuXG5cdGRlbGV0ZSh2YXJpYWJsZTogc3RyaW5nLCBzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0S2V5KHZhcmlhYmxlLCBzY29wZSk7XG5cdFx0dGhpcy5tYXAuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKTtcblx0fVxuXG5cdGNsZWFyKHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHNjb3BlPy53b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgbXV0YXRvcl0gb2YgdGhpcy5tYXApIHtcblx0XHRcdFx0aWYgKG11dGF0b3Iuc2NvcGU/LndvcmtzcGFjZUZvbGRlcj8uaW5kZXggPT09IHNjb3BlLndvcmtzcGFjZUZvbGRlci5pbmRleCkge1xuXHRcdFx0XHRcdHRoaXMubWFwLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNsZWFyRGVzY3JpcHRpb24oc2NvcGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1hcC5jbGVhcigpO1xuXHRcdFx0dGhpcy5kZXNjcmlwdGlvbk1hcC5jbGVhcigpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbGxlY3Rpb24uZmlyZSgpO1xuXHR9XG5cblx0c2V0RGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCwgc2NvcGU6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlU2NvcGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLmdldFNjb3BlS2V5KHNjb3BlKTtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5kZXNjcmlwdGlvbk1hcC5nZXQoa2V5KTtcblx0XHRpZiAoIWN1cnJlbnQgfHwgY3VycmVudC5kZXNjcmlwdGlvbiAhPT0gZGVzY3JpcHRpb24pIHtcblx0XHRcdGxldCBkZXNjcmlwdGlvblN0cjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHR5cGVvZiBkZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZGVzY3JpcHRpb25TdHIgPSBkZXNjcmlwdGlvbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE9ubHkgdGFrZSB0aGUgZGVzY3JpcHRpb24gYmVmb3JlIHRoZSBmaXJzdCBgXFxuXFxuYCwgc28gdGhhdCB0aGUgZGVzY3JpcHRpb24gZG9lc24ndCBtZXNzIHVwIHRoZSBVSVxuXHRcdFx0XHRkZXNjcmlwdGlvblN0ciA9IGRlc2NyaXB0aW9uPy52YWx1ZS5zcGxpdCgnXFxuXFxuJylbMF07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YWx1ZTogSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uRGVzY3JpcHRpb24gPSB7IGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvblN0ciwgc2NvcGUgfTtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb25NYXAuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb2xsZWN0aW9uLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVzY3JpcHRpb24oc2NvcGU6IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlU2NvcGUgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0U2NvcGVLZXkoc2NvcGUpO1xuXHRcdHJldHVybiB0aGlzLmRlc2NyaXB0aW9uTWFwLmdldChrZXkpPy5kZXNjcmlwdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJEZXNjcmlwdGlvbihzY29wZTogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVTY29wZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZ2V0U2NvcGVLZXkoc2NvcGUpO1xuXHRcdHRoaXMuZGVzY3JpcHRpb25NYXAuZGVsZXRlKGtleSk7XG5cdH1cbn1cblxuY2xhc3MgU2NvcGVkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gaW1wbGVtZW50cyBJRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24ge1xuXHRwdWJsaWMgZ2V0IHBlcnNpc3RlbnQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmNvbGxlY3Rpb24ucGVyc2lzdGVudDsgfVxuXHRwdWJsaWMgc2V0IHBlcnNpc3RlbnQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24ucGVyc2lzdGVudCA9IHZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbGxlY3Rpb24gPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRnZXQgb25EaWRDaGFuZ2VDb2xsZWN0aW9uKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ29sbGVjdGlvbiAmJiB0aGlzLl9vbkRpZENoYW5nZUNvbGxlY3Rpb24uZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbGxlY3Rpb246IFVuaWZpZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkXG5cdCkge1xuXHR9XG5cblx0Z2V0U2NvcGVkKHNjb3BlOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZVNjb3BlIHwgdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29sbGVjdGlvbi5nZXRTY29wZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihzY29wZSk7XG5cdH1cblxuXHRyZXBsYWNlKHZhcmlhYmxlOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIG9wdGlvbnM/OiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5jb2xsZWN0aW9uLnJlcGxhY2UodmFyaWFibGUsIHZhbHVlLCBvcHRpb25zLCB0aGlzLnNjb3BlKTtcblx0fVxuXG5cdGFwcGVuZCh2YXJpYWJsZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCBvcHRpb25zPzogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuY29sbGVjdGlvbi5hcHBlbmQodmFyaWFibGUsIHZhbHVlLCBvcHRpb25zLCB0aGlzLnNjb3BlKTtcblx0fVxuXG5cdHByZXBlbmQodmFyaWFibGU6IHN0cmluZywgdmFsdWU6IHN0cmluZywgb3B0aW9ucz86IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24ucHJlcGVuZCh2YXJpYWJsZSwgdmFsdWUsIG9wdGlvbnMsIHRoaXMuc2NvcGUpO1xuXHR9XG5cblx0Z2V0KHZhcmlhYmxlOiBzdHJpbmcpOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbGxlY3Rpb24uZ2V0KHZhcmlhYmxlLCB0aGlzLnNjb3BlKTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2s6ICh2YXJpYWJsZTogc3RyaW5nLCBtdXRhdG9yOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IsIGNvbGxlY3Rpb246IHZzY29kZS5FbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbikgPT4gdW5rbm93biwgdGhpc0FyZz86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24uZ2V0VmFyaWFibGVNYXAodGhpcy5zY29wZSkuZm9yRWFjaCgodmFsdWUsIHZhcmlhYmxlKSA9PiBjYWxsYmFjay5jYWxsKHRoaXNBcmcsIHZhcmlhYmxlLCB2YWx1ZSwgdGhpcyksIHRoaXMuc2NvcGUpO1xuXHR9XG5cblx0W1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmFibGVJdGVyYXRvcjxbdmFyaWFibGU6IHN0cmluZywgbXV0YXRvcjogdnNjb2RlLkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yXT4ge1xuXHRcdHJldHVybiB0aGlzLmNvbGxlY3Rpb24uZ2V0VmFyaWFibGVNYXAodGhpcy5zY29wZSkuZW50cmllcygpO1xuXHR9XG5cblx0ZGVsZXRlKHZhcmlhYmxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24uZGVsZXRlKHZhcmlhYmxlLCB0aGlzLnNjb3BlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbGxlY3Rpb24uZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jb2xsZWN0aW9uLmNsZWFyKHRoaXMuc2NvcGUpO1xuXHR9XG5cblx0c2V0IGRlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmNvbGxlY3Rpb24uc2V0RGVzY3JpcHRpb24oZGVzY3JpcHRpb24sIHRoaXMuc2NvcGUpO1xuXHR9XG5cblx0Z2V0IGRlc2NyaXB0aW9uKCk6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29sbGVjdGlvbi5nZXREZXNjcmlwdGlvbih0aGlzLnNjb3BlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV29ya2VyRXh0SG9zdFRlcm1pbmFsU2VydmljZSBleHRlbmRzIEJhc2VFeHRIb3N0VGVybWluYWxTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNSZW1vdGVBdXRob3JpdHk6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0Q29tbWFuZHMgZXh0SG9zdENvbW1hbmRzOiBJRXh0SG9zdENvbW1hbmRzLFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEluaXREYXRhU2VydmljZSBpbml0RGF0YTogSUV4dEhvc3RJbml0RGF0YVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZmFsc2UsIGV4dEhvc3RDb21tYW5kcywgZXh0SG9zdFJwYyk7XG5cdFx0dGhpcy5faGFzUmVtb3RlQXV0aG9yaXR5ID0gISFpbml0RGF0YS5yZW1vdGUuYXV0aG9yaXR5O1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVRlcm1pbmFsKG5hbWU/OiBzdHJpbmcsIHNoZWxsUGF0aD86IHN0cmluZywgc2hlbGxBcmdzPzogc3RyaW5nW10gfCBzdHJpbmcpOiB2c2NvZGUuVGVybWluYWwge1xuXHRcdGlmICghdGhpcy5faGFzUmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHR0aHJvdyBuZXcgTm90U3VwcG9ydGVkRXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlVGVybWluYWxGcm9tT3B0aW9ucyh7IG5hbWUsIHNoZWxsUGF0aCwgc2hlbGxBcmdzIH0pO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZVRlcm1pbmFsRnJvbU9wdGlvbnMob3B0aW9uczogdnNjb2RlLlRlcm1pbmFsT3B0aW9ucywgaW50ZXJuYWxPcHRpb25zPzogSVRlcm1pbmFsSW50ZXJuYWxPcHRpb25zKTogdnNjb2RlLlRlcm1pbmFsIHtcblx0XHRpZiAoIXRoaXMuX2hhc1JlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0dGhyb3cgbmV3IE5vdFN1cHBvcnRlZEVycm9yKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsID0gbmV3IEV4dEhvc3RUZXJtaW5hbCh0aGlzLl9wcm94eSwgZ2VuZXJhdGVVdWlkKCksIG9wdGlvbnMsIG9wdGlvbnMubmFtZSk7XG5cdFx0dGhpcy5fdGVybWluYWxzLnB1c2godGVybWluYWwpO1xuXHRcdHRlcm1pbmFsLmNyZWF0ZShvcHRpb25zLCB0aGlzLl9zZXJpYWxpemVQYXJlbnRUZXJtaW5hbChvcHRpb25zLCBpbnRlcm5hbE9wdGlvbnMpKTtcblx0XHRyZXR1cm4gdGVybWluYWwudmFsdWU7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNUZXJtaW5hbEljb24oaWNvblBhdGg/OiB2c2NvZGUuVXJpIHwgeyBsaWdodDogdnNjb2RlLlVyaTsgZGFyazogdnNjb2RlLlVyaSB9IHwgdnNjb2RlLlRoZW1lSWNvbik6IFRlcm1pbmFsSWNvbiB8IHVuZGVmaW5lZCB7XG5cdGlmICghaWNvblBhdGggfHwgdHlwZW9mIGljb25QYXRoID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpZiAoIWhhc0tleShpY29uUGF0aCwgeyBpZDogdHJ1ZSB9KSkge1xuXHRcdHJldHVybiBpY29uUGF0aDtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0aWQ6IGljb25QYXRoLmlkLFxuXHRcdGNvbG9yOiBpY29uUGF0aC5jb2xvciBhcyBUaGVtZUNvbG9yXG5cdH07XG59XG5cbmZ1bmN0aW9uIGFzVGVybWluYWxDb2xvcihjb2xvcj86IHZzY29kZS5UaGVtZUNvbG9yKTogVGhlbWVDb2xvciB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBUaGVtZUNvbG9yLmlzVGhlbWVDb2xvcihjb2xvcikgPyBjb2xvciBhcyBUaGVtZUNvbG9yIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0TXV0YXRvcihtdXRhdG9yOiBJRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3IpOiB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3Ige1xuXHRjb25zdCBuZXdNdXRhdG9yID0geyAuLi5tdXRhdG9yIH07XG5cdGRlbGV0ZSBuZXdNdXRhdG9yLnNjb3BlO1xuXHRuZXdNdXRhdG9yLm9wdGlvbnMgPSBuZXdNdXRhdG9yLm9wdGlvbnMgPz8gdW5kZWZpbmVkO1xuXHRyZXR1cm4gbmV3TXV0YXRvciBhcyB2c2NvZGUuRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3I7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQWdCLGVBQWU7QUFDL0IsU0FBc0MsbUJBQW9UO0FBQzFWLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFzQixpQkFBaUIsWUFBWSx5QkFBeUI7QUFDNUUsU0FBUyxjQUFjLGtCQUFrQixzQ0FBa0Y7QUFFM0gsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQ0FBb0MsOENBQThDO0FBQzNGLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQStNLHFCQUE2RCx3QkFBd0I7QUFDcFMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx3QkFBd0Isa0JBQWtCLGtCQUFrQjtBQUNyRSxT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QUFNLEtBQUssS0FBSztBQUFBLEVBQ2pDO0FBQUEsRUFFQSxJQUFJLFlBQVksYUFBeUQ7QUFDeEUsU0FBSyxXQUFXLGVBQWUsYUFBYSxLQUFLLEtBQUs7QUFBQSxFQUN2RDtBQUFBLEVBRUEsSUFBSSxjQUEwRDtBQUM3RCxXQUFPLEtBQUssV0FBVyxlQUFlLEtBQUssS0FBSztBQUFBLEVBQ2pEO0FBQ0Q7QUFFTyxJQUFNLCtCQUFOLGNBQTJDLDJCQUEyQjtBQUFBLEVBSTVFLFlBQ21CLGlCQUNFLFlBQ0ssVUFDeEI7QUFDRCxVQUFNLE9BQU8saUJBQWlCLFVBQVU7QUFDeEMsU0FBSyxzQkFBc0IsQ0FBQyxDQUFDLFNBQVMsT0FBTztBQUFBLEVBQzlDO0FBQUEsRUFFTyxlQUFlLE1BQWUsV0FBb0IsV0FBZ0Q7QUFDeEcsUUFBSSxDQUFDLEtBQUsscUJBQXFCO0FBQzlCLFlBQU0sSUFBSSxrQkFBa0I7QUFBQSxJQUM3QjtBQUNBLFdBQU8sS0FBSywwQkFBMEIsRUFBRSxNQUFNLFdBQVcsVUFBVSxDQUFDO0FBQUEsRUFDckU7QUFBQSxFQUVPLDBCQUEwQixTQUFpQyxpQkFBNkQ7QUFDOUgsUUFBSSxDQUFDLEtBQUsscUJBQXFCO0FBQzlCLFlBQU0sSUFBSSxrQkFBa0I7QUFBQSxJQUM3QjtBQUNBLFVBQU0sV0FBVyxJQUFJLGdCQUFnQixLQUFLLFFBQVEsYUFBYSxHQUFHLFNBQVMsUUFBUSxJQUFJO0FBQ3ZGLFNBQUssV0FBVyxLQUFLLFFBQVE7QUFDN0IsYUFBUyxPQUFPLFNBQVMsS0FBSyx5QkFBeUIsU0FBUyxlQUFlLENBQUM7QUFDaEYsV0FBTyxTQUFTO0FBQUEsRUFDakI7QUFDRDtBQTdCYSwrQkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7QUErQmIsU0FBUyxlQUFlLFVBQThHO0FBQ3JJLE1BQUksQ0FBQyxZQUFZLE9BQU8sYUFBYSxVQUFVO0FBQzlDLFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxDQUFDLE9BQU8sVUFBVSxFQUFFLElBQUksS0FBSyxDQUFDLEdBQUc7QUFDcEMsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPO0FBQUEsSUFDTixJQUFJLFNBQVM7QUFBQSxJQUNiLE9BQU8sU0FBUztBQUFBLEVBQ2pCO0FBQ0Q7QUFFQSxTQUFTLGdCQUFnQixPQUFtRDtBQUMzRSxTQUFPLFdBQVcsYUFBYSxLQUFLLElBQUksUUFBc0I7QUFDL0Q7QUFFQSxTQUFTLGVBQWUsU0FBeUU7QUFDaEcsUUFBTSxhQUFhLEVBQUUsR0FBRyxRQUFRO0FBQ2hDLFNBQU8sV0FBVztBQUNsQixhQUFXLFVBQVUsV0FBVyxXQUFXO0FBQzNDLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiYXJnIiwgImtleSJdCn0K
