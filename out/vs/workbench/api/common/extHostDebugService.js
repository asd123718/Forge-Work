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
import { coalesce } from "../../../base/common/arrays.js";
import { asPromise } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable as DisposableCls, toDisposable } from "../../../base/common/lifecycle.js";
import { ThemeIcon as ThemeIconUtils } from "../../../base/common/themables.js";
import { URI } from "../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { AbstractDebugAdapter } from "../../contrib/debug/common/abstractDebugAdapter.js";
import { DebugVisualizationType } from "../../contrib/debug/common/debug.js";
import { convertToDAPaths, convertToVSCPaths, isDebuggerMainContribution } from "../../contrib/debug/common/debugUtils.js";
import { MainContext } from "./extHost.protocol.js";
import { IExtHostCommands } from "./extHostCommands.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
import { IExtHostEditorTabs } from "./extHostEditorTabs.js";
import { IExtHostExtensionService } from "./extHostExtensionService.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { IExtHostTesting } from "./extHostTesting.js";
import * as Convert from "./extHostTypeConverters.js";
import { DataBreakpoint, DebugAdapterExecutable, DebugAdapterInlineImplementation, DebugAdapterNamedPipeServer, DebugAdapterServer, DebugConsoleMode, DebugStackFrame, DebugThread, Disposable, FunctionBreakpoint, Location, Position, setBreakpointId, SourceBreakpoint, ThemeIcon } from "./extHostTypes.js";
import { IExtHostVariableResolverProvider } from "./extHostVariableResolverService.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
const IExtHostDebugService = createDecorator("IExtHostDebugService");
let ExtHostDebugServiceBase = class extends DisposableCls {
  constructor(extHostRpcService, _workspaceService, _extensionService, _configurationService, _editorTabs, _variableResolver, _commands, _testing) {
    super();
    this._workspaceService = _workspaceService;
    this._extensionService = _extensionService;
    this._configurationService = _configurationService;
    this._editorTabs = _editorTabs;
    this._variableResolver = _variableResolver;
    this._commands = _commands;
    this._testing = _testing;
    this._debugSessions = /* @__PURE__ */ new Map();
    this._debugVisualizationTreeItemIdsCounter = 0;
    this._debugVisualizationProviders = /* @__PURE__ */ new Map();
    this._debugVisualizationTrees = /* @__PURE__ */ new Map();
    this._debugVisualizationTreeItemIds = /* @__PURE__ */ new WeakMap();
    this._debugVisualizationElements = /* @__PURE__ */ new Map();
    this._visualizers = /* @__PURE__ */ new Map();
    this._visualizerIdCounter = 0;
    this._configProviderHandleCounter = 0;
    this._configProviders = [];
    this._adapterFactoryHandleCounter = 0;
    this._adapterFactories = [];
    this._trackerFactoryHandleCounter = 0;
    this._trackerFactories = [];
    this._debugAdapters = /* @__PURE__ */ new Map();
    this._debugAdaptersTrackers = /* @__PURE__ */ new Map();
    this._onDidStartDebugSession = this._register(new Emitter());
    this._onDidTerminateDebugSession = this._register(new Emitter());
    this._onDidChangeActiveDebugSession = this._register(new Emitter());
    this._onDidReceiveDebugSessionCustomEvent = this._register(new Emitter());
    this._debugServiceProxy = extHostRpcService.getProxy(MainContext.MainThreadDebugService);
    this._onDidChangeBreakpoints = this._register(new Emitter());
    this._onDidChangeActiveStackItem = this._register(new Emitter());
    this._activeDebugConsole = new ExtHostDebugConsole(this._debugServiceProxy);
    this._breakpoints = /* @__PURE__ */ new Map();
    this._extensionService.getExtensionRegistry().then((extensionRegistry) => {
      this._register(extensionRegistry.onDidChange((_) => {
        this.registerAllDebugTypes(extensionRegistry);
      }));
      this.registerAllDebugTypes(extensionRegistry);
    });
    this._telemetryProxy = extHostRpcService.getProxy(MainContext.MainThreadTelemetry);
  }
  get onDidStartDebugSession() {
    return this._onDidStartDebugSession.event;
  }
  get onDidTerminateDebugSession() {
    return this._onDidTerminateDebugSession.event;
  }
  get onDidChangeActiveDebugSession() {
    return this._onDidChangeActiveDebugSession.event;
  }
  get activeDebugSession() {
    return this._activeDebugSession?.api;
  }
  get onDidReceiveDebugSessionCustomEvent() {
    return this._onDidReceiveDebugSessionCustomEvent.event;
  }
  get activeDebugConsole() {
    return this._activeDebugConsole.value;
  }
  async $getVisualizerTreeItem(treeId, element) {
    const context = this.hydrateVisualizationContext(element);
    if (!context) {
      return void 0;
    }
    const item = await this._debugVisualizationTrees.get(treeId)?.getTreeItem?.(context);
    return item ? this.convertVisualizerTreeItem(treeId, item) : void 0;
  }
  registerDebugVisualizationTree(manifest, id, provider) {
    const extensionId = ExtensionIdentifier.toKey(manifest.identifier);
    const key = this.extensionVisKey(extensionId, id);
    if (this._debugVisualizationProviders.has(key)) {
      throw new Error(`A debug visualization provider with id '${id}' is already registered`);
    }
    this._debugVisualizationTrees.set(key, provider);
    this._debugServiceProxy.$registerDebugVisualizerTree(key, !!provider.editItem);
    return toDisposable(() => {
      this._debugServiceProxy.$unregisterDebugVisualizerTree(key);
      this._debugVisualizationTrees.delete(id);
    });
  }
  async $getVisualizerTreeItemChildren(treeId, element) {
    const item = this._debugVisualizationElements.get(element)?.item;
    if (!item) {
      return [];
    }
    const children = await this._debugVisualizationTrees.get(treeId)?.getChildren?.(item);
    return children?.map((i) => this.convertVisualizerTreeItem(treeId, i)) || [];
  }
  async $editVisualizerTreeItem(element, value) {
    const e = this._debugVisualizationElements.get(element);
    if (!e) {
      return void 0;
    }
    const r = await this._debugVisualizationTrees.get(e.provider)?.editItem?.(e.item, value);
    return this.convertVisualizerTreeItem(e.provider, r || e.item);
  }
  $disposeVisualizedTree(element) {
    const root = this._debugVisualizationElements.get(element);
    if (!root) {
      return;
    }
    const queue = [root.children];
    for (const children of queue) {
      if (children) {
        for (const child of children) {
          queue.push(this._debugVisualizationElements.get(child)?.children);
          this._debugVisualizationElements.delete(child);
        }
      }
    }
  }
  convertVisualizerTreeItem(treeId, item) {
    let id = this._debugVisualizationTreeItemIds.get(item);
    if (!id) {
      id = this._debugVisualizationTreeItemIdsCounter++;
      this._debugVisualizationTreeItemIds.set(item, id);
      this._debugVisualizationElements.set(id, { provider: treeId, item });
    }
    return Convert.DebugTreeItem.from(item, id);
  }
  asDebugSourceUri(src, session) {
    const source = src;
    if (typeof source.sourceReference === "number" && source.sourceReference > 0) {
      let debug = `debug:${encodeURIComponent(source.path || "")}`;
      let sep = "?";
      if (session) {
        debug += `${sep}session=${encodeURIComponent(session.id)}`;
        sep = "&";
      }
      debug += `${sep}ref=${source.sourceReference}`;
      return URI.parse(debug);
    } else if (source.path) {
      return URI.file(source.path);
    } else {
      throw new Error(`cannot create uri from DAP 'source' object; properties 'path' and 'sourceReference' are both missing.`);
    }
  }
  registerAllDebugTypes(extensionRegistry) {
    const debugTypes = [];
    for (const ed of extensionRegistry.getAllExtensionDescriptions()) {
      if (ed.contributes) {
        const debuggers = ed.contributes["debuggers"];
        if (debuggers && debuggers.length > 0) {
          for (const dbg of debuggers) {
            if (isDebuggerMainContribution(dbg)) {
              debugTypes.push(dbg.type);
            }
          }
        }
      }
    }
    this._debugServiceProxy.$registerDebugTypes(debugTypes);
  }
  // extension debug API
  get activeStackItem() {
    return this._activeStackItem;
  }
  get onDidChangeActiveStackItem() {
    return this._onDidChangeActiveStackItem.event;
  }
  get onDidChangeBreakpoints() {
    return this._onDidChangeBreakpoints.event;
  }
  get breakpoints() {
    const result = [];
    this._breakpoints.forEach((bp) => result.push(bp));
    return result;
  }
  async $resolveDebugVisualizer(id, token) {
    const visualizer = this._visualizers.get(id);
    if (!visualizer) {
      throw new Error(`No debug visualizer found with id '${id}'`);
    }
    let { v, provider, extensionId } = visualizer;
    if (!v.visualization) {
      v = await provider.resolveDebugVisualization?.(v, token) || v;
      visualizer.v = v;
    }
    if (!v.visualization) {
      throw new Error(`No visualization returned from resolveDebugVisualization in '${provider}'`);
    }
    return this.serializeVisualization(extensionId, v.visualization);
  }
  async $executeDebugVisualizerCommand(id) {
    const visualizer = this._visualizers.get(id);
    if (!visualizer) {
      throw new Error(`No debug visualizer found with id '${id}'`);
    }
    const command = visualizer.v.visualization;
    if (command && "command" in command) {
      this._commands.executeCommand(command.command, ...command.arguments || []);
    }
  }
  hydrateVisualizationContext(context) {
    const session = this._debugSessions.get(context.sessionId);
    return session && {
      session: session.api,
      variable: context.variable,
      containerId: context.containerId,
      frameId: context.frameId,
      threadId: context.threadId
    };
  }
  async $provideDebugVisualizers(extensionId, id, context, token) {
    const contextHydrated = this.hydrateVisualizationContext(context);
    const key = this.extensionVisKey(extensionId, id);
    const provider = this._debugVisualizationProviders.get(key);
    if (!contextHydrated || !provider) {
      return [];
    }
    const visualizations = await provider.provideDebugVisualization(contextHydrated, token);
    if (!visualizations) {
      return [];
    }
    return visualizations.map((v) => {
      const id2 = ++this._visualizerIdCounter;
      this._visualizers.set(id2, { v, provider, extensionId });
      const icon = v.iconPath ? this.getIconPathOrClass(v.iconPath) : void 0;
      return {
        id: id2,
        name: v.name,
        iconClass: icon?.iconClass,
        iconPath: icon?.iconPath,
        visualization: this.serializeVisualization(extensionId, v.visualization)
      };
    });
  }
  $disposeDebugVisualizers(ids) {
    for (const id of ids) {
      this._visualizers.delete(id);
    }
  }
  registerDebugVisualizationProvider(manifest, id, provider) {
    if (!manifest.contributes?.debugVisualizers?.some((r) => r.id === id)) {
      throw new Error(`Extensions may only call registerDebugVisualizationProvider() for renderers they contribute (got ${id})`);
    }
    const extensionId = ExtensionIdentifier.toKey(manifest.identifier);
    const key = this.extensionVisKey(extensionId, id);
    if (this._debugVisualizationProviders.has(key)) {
      throw new Error(`A debug visualization provider with id '${id}' is already registered`);
    }
    this._debugVisualizationProviders.set(key, provider);
    this._debugServiceProxy.$registerDebugVisualizer(extensionId, id);
    return toDisposable(() => {
      this._debugServiceProxy.$unregisterDebugVisualizer(extensionId, id);
      this._debugVisualizationProviders.delete(id);
    });
  }
  addBreakpoints(breakpoints0) {
    const breakpoints = breakpoints0.filter((bp) => {
      const id = bp.id;
      if (!this._breakpoints.has(id)) {
        this._breakpoints.set(id, bp);
        return true;
      }
      return false;
    });
    this.fireBreakpointChanges(breakpoints, [], []);
    const dtos = [];
    const map = /* @__PURE__ */ new Map();
    for (const bp of breakpoints) {
      if (bp instanceof SourceBreakpoint) {
        let dto = map.get(bp.location.uri.toString());
        if (!dto) {
          dto = {
            type: "sourceMulti",
            uri: bp.location.uri,
            lines: []
          };
          map.set(bp.location.uri.toString(), dto);
          dtos.push(dto);
        }
        dto.lines.push({
          id: bp.id,
          enabled: bp.enabled,
          condition: bp.condition,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
          line: bp.location.range.start.line,
          character: bp.location.range.start.character,
          mode: bp.mode
        });
      } else if (bp instanceof FunctionBreakpoint) {
        dtos.push({
          type: "function",
          id: bp.id,
          enabled: bp.enabled,
          hitCondition: bp.hitCondition,
          logMessage: bp.logMessage,
          condition: bp.condition,
          functionName: bp.functionName,
          mode: bp.mode
        });
      }
    }
    return this._debugServiceProxy.$registerBreakpoints(dtos);
  }
  removeBreakpoints(breakpoints0) {
    const breakpoints = breakpoints0.filter((b) => this._breakpoints.delete(b.id));
    this.fireBreakpointChanges([], breakpoints, []);
    const ids = breakpoints.filter((bp) => bp instanceof SourceBreakpoint).map((bp) => bp.id);
    const fids = breakpoints.filter((bp) => bp instanceof FunctionBreakpoint).map((bp) => bp.id);
    const dids = breakpoints.filter((bp) => bp instanceof DataBreakpoint).map((bp) => bp.id);
    return this._debugServiceProxy.$unregisterBreakpoints(ids, fids, dids);
  }
  startDebugging(folder, nameOrConfig, options) {
    const testRunMeta = options.testRun && this._testing.getMetadataForRun(options.testRun);
    return this._debugServiceProxy.$startDebugging(folder ? folder.uri : void 0, nameOrConfig, {
      parentSessionID: options.parentSession ? options.parentSession.id : void 0,
      lifecycleManagedByParent: options.lifecycleManagedByParent,
      repl: options.consoleMode === DebugConsoleMode.MergeWithParent ? "mergeWithParent" : "separate",
      noDebug: options.noDebug,
      compact: options.compact,
      suppressSaveBeforeStart: options.suppressSaveBeforeStart,
      testRun: testRunMeta && {
        runId: testRunMeta.runId,
        taskId: testRunMeta.taskId
      },
      // Check debugUI for back-compat, #147264
      // eslint-disable-next-line local/code-no-any-casts
      suppressDebugStatusbar: options.suppressDebugStatusbar ?? options.debugUI?.simple,
      // eslint-disable-next-line local/code-no-any-casts
      suppressDebugToolbar: options.suppressDebugToolbar ?? options.debugUI?.simple,
      // eslint-disable-next-line local/code-no-any-casts
      suppressDebugView: options.suppressDebugView ?? options.debugUI?.simple
    });
  }
  stopDebugging(session) {
    return this._debugServiceProxy.$stopDebugging(session ? session.id : void 0);
  }
  registerDebugConfigurationProvider(type, provider, trigger) {
    if (!provider) {
      return new Disposable(() => {
      });
    }
    const handle = this._configProviderHandleCounter++;
    this._configProviders.push({ type, handle, provider });
    this._debugServiceProxy.$registerDebugConfigurationProvider(
      type,
      trigger,
      !!provider.provideDebugConfigurations,
      !!provider.resolveDebugConfiguration,
      !!provider.resolveDebugConfigurationWithSubstitutedVariables,
      handle
    );
    return new Disposable(() => {
      this._configProviders = this._configProviders.filter((p) => p.provider !== provider);
      this._debugServiceProxy.$unregisterDebugConfigurationProvider(handle);
    });
  }
  registerDebugAdapterDescriptorFactory(extension, type, factory) {
    if (!factory) {
      return new Disposable(() => {
      });
    }
    if (!this.definesDebugType(extension, type)) {
      throw new Error(`a DebugAdapterDescriptorFactory can only be registered from the extension that defines the '${type}' debugger.`);
    }
    if (this.getAdapterDescriptorFactoryByType(type)) {
      throw new Error(`a DebugAdapterDescriptorFactory can only be registered once per a type.`);
    }
    const handle = this._adapterFactoryHandleCounter++;
    this._adapterFactories.push({ type, handle, factory });
    this._debugServiceProxy.$registerDebugAdapterDescriptorFactory(type, handle);
    return new Disposable(() => {
      this._adapterFactories = this._adapterFactories.filter((p) => p.factory !== factory);
      this._debugServiceProxy.$unregisterDebugAdapterDescriptorFactory(handle);
    });
  }
  registerDebugAdapterTrackerFactory(type, factory) {
    if (!factory) {
      return new Disposable(() => {
      });
    }
    const handle = this._trackerFactoryHandleCounter++;
    this._trackerFactories.push({ type, handle, factory });
    return new Disposable(() => {
      this._trackerFactories = this._trackerFactories.filter((p) => p.factory !== factory);
    });
  }
  // RPC methods (ExtHostDebugServiceShape)
  async $runInTerminal(args, sessionId) {
    return Promise.resolve(void 0);
  }
  async $substituteVariables(folderUri, config) {
    let ws;
    const folder = await this.getFolder(folderUri);
    if (folder) {
      ws = {
        uri: folder.uri,
        name: folder.name,
        index: folder.index
      };
    }
    const variableResolver = await this._variableResolver.getResolver();
    return variableResolver.resolveAsync(ws, config);
  }
  createDebugAdapter(adapter, session) {
    if (adapter instanceof DebugAdapterInlineImplementation) {
      return new DirectDebugAdapter(adapter.implementation);
    }
    return void 0;
  }
  createSignService() {
    return void 0;
  }
  async $startDASession(debugAdapterHandle, sessionDto) {
    const mythis = this;
    const session = await this.getSession(sessionDto);
    return this.getAdapterDescriptor(this.getAdapterDescriptorFactoryByType(session.type), session).then((daDescriptor) => {
      if (!daDescriptor) {
        throw new Error(`Couldn't find a debug adapter descriptor for debug type '${session.type}' (extension might have failed to activate)`);
      }
      const da = this.createDebugAdapter(daDescriptor, session);
      if (!da) {
        throw new Error(`Couldn't create a debug adapter for type '${session.type}'.`);
      }
      const debugAdapter = da;
      this._debugAdapters.set(debugAdapterHandle, debugAdapter);
      return this.getDebugAdapterTrackers(session).then((tracker) => {
        if (tracker) {
          this._debugAdaptersTrackers.set(debugAdapterHandle, tracker);
        }
        debugAdapter.onMessage(async (message) => {
          if (message.type === "request" && message.command === "handshake") {
            const request = message;
            const response = {
              type: "response",
              seq: 0,
              command: request.command,
              request_seq: request.seq,
              success: true
            };
            if (!this._signService) {
              this._signService = this.createSignService();
            }
            try {
              if (this._signService) {
                const signature = await this._signService.sign(request.arguments.value);
                response.body = {
                  signature
                };
                debugAdapter.sendResponse(response);
              } else {
                throw new Error("no signer");
              }
            } catch (e) {
              response.success = false;
              response.message = e.message;
              debugAdapter.sendResponse(response);
            }
          } else {
            if (tracker && tracker.onDidSendMessage) {
              tracker.onDidSendMessage(message);
            }
            try {
              message = convertToVSCPaths(message, true);
            } catch (e) {
              const type = message.type + "_" + (message.command ?? message.event ?? "");
              this._telemetryProxy.$publicLog2("debugProtocolMessageError", { type, from: session.type });
              throw e;
            }
            mythis._debugServiceProxy.$acceptDAMessage(debugAdapterHandle, message);
          }
        });
        debugAdapter.onError((err) => {
          if (tracker && tracker.onError) {
            tracker.onError(err);
          }
          this._debugServiceProxy.$acceptDAError(debugAdapterHandle, err.name, err.message, err.stack);
        });
        debugAdapter.onExit((code) => {
          if (tracker && tracker.onExit) {
            tracker.onExit(code ?? void 0, void 0);
          }
          this._debugServiceProxy.$acceptDAExit(debugAdapterHandle, code ?? void 0, void 0);
        });
        if (tracker && tracker.onWillStartSession) {
          tracker.onWillStartSession();
        }
        return debugAdapter.startSession();
      });
    });
  }
  $sendDAMessage(debugAdapterHandle, message) {
    message = convertToDAPaths(message, false);
    const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);
    if (tracker && tracker.onWillReceiveMessage) {
      tracker.onWillReceiveMessage(message);
    }
    const da = this._debugAdapters.get(debugAdapterHandle);
    da?.sendMessage(message);
  }
  $stopDASession(debugAdapterHandle) {
    const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);
    this._debugAdaptersTrackers.delete(debugAdapterHandle);
    if (tracker && tracker.onWillStopSession) {
      tracker.onWillStopSession();
    }
    const da = this._debugAdapters.get(debugAdapterHandle);
    this._debugAdapters.delete(debugAdapterHandle);
    if (da) {
      return da.stopSession();
    } else {
      return Promise.resolve(void 0);
    }
  }
  $acceptBreakpointsDelta(delta) {
    const a = [];
    const r = [];
    const c = [];
    if (delta.added) {
      for (const bpd of delta.added) {
        const id = bpd.id;
        if (id && !this._breakpoints.has(id)) {
          let bp;
          if (bpd.type === "function") {
            bp = new FunctionBreakpoint(bpd.functionName, bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage, bpd.mode);
          } else if (bpd.type === "data") {
            bp = new DataBreakpoint(bpd.label, bpd.dataId, bpd.canPersist, bpd.enabled, bpd.hitCondition, bpd.condition, bpd.logMessage, bpd.mode);
          } else {
            const uri = URI.revive(bpd.uri);
            bp = new SourceBreakpoint(new Location(uri, new Position(bpd.line, bpd.character)), bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage, bpd.mode);
          }
          setBreakpointId(bp, id);
          this._breakpoints.set(id, bp);
          a.push(bp);
        }
      }
    }
    if (delta.removed) {
      for (const id of delta.removed) {
        const bp = this._breakpoints.get(id);
        if (bp) {
          this._breakpoints.delete(id);
          r.push(bp);
        }
      }
    }
    if (delta.changed) {
      for (const bpd of delta.changed) {
        if (bpd.id) {
          const bp = this._breakpoints.get(bpd.id);
          if (bp) {
            if (bp instanceof FunctionBreakpoint && bpd.type === "function") {
              const fbp = bp;
              fbp.enabled = bpd.enabled;
              fbp.condition = bpd.condition;
              fbp.hitCondition = bpd.hitCondition;
              fbp.logMessage = bpd.logMessage;
              fbp.functionName = bpd.functionName;
            } else if (bp instanceof SourceBreakpoint && bpd.type === "source") {
              const sbp = bp;
              sbp.enabled = bpd.enabled;
              sbp.condition = bpd.condition;
              sbp.hitCondition = bpd.hitCondition;
              sbp.logMessage = bpd.logMessage;
              sbp.location = new Location(URI.revive(bpd.uri), new Position(bpd.line, bpd.character));
            }
            c.push(bp);
          }
        }
      }
    }
    this.fireBreakpointChanges(a, r, c);
  }
  async $acceptStackFrameFocus(focusDto) {
    let focus;
    if (focusDto) {
      const session = await this.getSession(focusDto.sessionId);
      if (focusDto.kind === "thread") {
        focus = new DebugThread(session.api, focusDto.threadId);
      } else {
        focus = new DebugStackFrame(session.api, focusDto.threadId, focusDto.frameId);
      }
    }
    this._activeStackItem = focus;
    this._onDidChangeActiveStackItem.fire(this._activeStackItem);
  }
  $provideDebugConfigurations(configProviderHandle, folderUri, token) {
    return asPromise(async () => {
      const provider = this.getConfigProviderByHandle(configProviderHandle);
      if (!provider) {
        throw new Error("no DebugConfigurationProvider found");
      }
      if (!provider.provideDebugConfigurations) {
        throw new Error("DebugConfigurationProvider has no method provideDebugConfigurations");
      }
      const folder = await this.getFolder(folderUri);
      return provider.provideDebugConfigurations(folder, token);
    }).then((debugConfigurations) => {
      if (!debugConfigurations) {
        throw new Error("nothing returned from DebugConfigurationProvider.provideDebugConfigurations");
      }
      return debugConfigurations;
    });
  }
  $resolveDebugConfiguration(configProviderHandle, folderUri, debugConfiguration, token) {
    return asPromise(async () => {
      const provider = this.getConfigProviderByHandle(configProviderHandle);
      if (!provider) {
        throw new Error("no DebugConfigurationProvider found");
      }
      if (!provider.resolveDebugConfiguration) {
        throw new Error("DebugConfigurationProvider has no method resolveDebugConfiguration");
      }
      const folder = await this.getFolder(folderUri);
      return provider.resolveDebugConfiguration(folder, debugConfiguration, token);
    });
  }
  $resolveDebugConfigurationWithSubstitutedVariables(configProviderHandle, folderUri, debugConfiguration, token) {
    return asPromise(async () => {
      const provider = this.getConfigProviderByHandle(configProviderHandle);
      if (!provider) {
        throw new Error("no DebugConfigurationProvider found");
      }
      if (!provider.resolveDebugConfigurationWithSubstitutedVariables) {
        throw new Error("DebugConfigurationProvider has no method resolveDebugConfigurationWithSubstitutedVariables");
      }
      const folder = await this.getFolder(folderUri);
      return provider.resolveDebugConfigurationWithSubstitutedVariables(folder, debugConfiguration, token);
    });
  }
  async $provideDebugAdapter(adapterFactoryHandle, sessionDto) {
    const adapterDescriptorFactory = this.getAdapterDescriptorFactoryByHandle(adapterFactoryHandle);
    if (!adapterDescriptorFactory) {
      return Promise.reject(new Error("no adapter descriptor factory found for handle"));
    }
    const session = await this.getSession(sessionDto);
    return this.getAdapterDescriptor(adapterDescriptorFactory, session).then((adapterDescriptor) => {
      if (!adapterDescriptor) {
        throw new Error(`Couldn't find a debug adapter descriptor for debug type '${session.type}'`);
      }
      return this.convertToDto(adapterDescriptor);
    });
  }
  async $acceptDebugSessionStarted(sessionDto) {
    const session = await this.getSession(sessionDto);
    this._onDidStartDebugSession.fire(session.api);
  }
  async $acceptDebugSessionTerminated(sessionDto) {
    const session = await this.getSession(sessionDto);
    if (session) {
      this._onDidTerminateDebugSession.fire(session.api);
      this._debugSessions.delete(session.id);
    }
  }
  async $acceptDebugSessionActiveChanged(sessionDto) {
    this._activeDebugSession = sessionDto ? await this.getSession(sessionDto) : void 0;
    this._onDidChangeActiveDebugSession.fire(this._activeDebugSession?.api);
  }
  async $acceptDebugSessionNameChanged(sessionDto, name) {
    const session = await this.getSession(sessionDto);
    session?._acceptNameChanged(name);
  }
  async $acceptDebugSessionCustomEvent(sessionDto, event) {
    const session = await this.getSession(sessionDto);
    const ee = {
      session: session.api,
      event: event.event,
      body: event.body
    };
    this._onDidReceiveDebugSessionCustomEvent.fire(ee);
  }
  // private & dto helpers
  convertToDto(x) {
    if (x instanceof DebugAdapterExecutable) {
      return this.convertExecutableToDto(x);
    } else if (x instanceof DebugAdapterServer) {
      return this.convertServerToDto(x);
    } else if (x instanceof DebugAdapterNamedPipeServer) {
      return this.convertPipeServerToDto(x);
    } else if (x instanceof DebugAdapterInlineImplementation) {
      return this.convertImplementationToDto(x);
    } else {
      throw new Error("convertToDto unexpected type");
    }
  }
  convertExecutableToDto(x) {
    return {
      type: "executable",
      command: x.command,
      args: x.args,
      options: x.options
    };
  }
  convertServerToDto(x) {
    return {
      type: "server",
      port: x.port,
      host: x.host
    };
  }
  convertPipeServerToDto(x) {
    return {
      type: "pipeServer",
      path: x.path
    };
  }
  convertImplementationToDto(x) {
    return {
      type: "implementation"
    };
  }
  getAdapterDescriptorFactoryByType(type) {
    const results = this._adapterFactories.filter((p) => p.type === type);
    if (results.length > 0) {
      return results[0].factory;
    }
    return void 0;
  }
  getAdapterDescriptorFactoryByHandle(handle) {
    const results = this._adapterFactories.filter((p) => p.handle === handle);
    if (results.length > 0) {
      return results[0].factory;
    }
    return void 0;
  }
  getConfigProviderByHandle(handle) {
    const results = this._configProviders.filter((p) => p.handle === handle);
    if (results.length > 0) {
      return results[0].provider;
    }
    return void 0;
  }
  definesDebugType(ed, type) {
    if (ed.contributes) {
      const debuggers = ed.contributes["debuggers"];
      if (debuggers && debuggers.length > 0) {
        for (const dbg of debuggers) {
          if (dbg.label && dbg.type) {
            if (dbg.type === type) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
  getDebugAdapterTrackers(session) {
    const config = session.configuration;
    const type = config.type;
    const promises = this._trackerFactories.filter((tuple) => tuple.type === type || tuple.type === "*").map((tuple) => asPromise(() => tuple.factory.createDebugAdapterTracker(session.api)).then((p) => p, (err) => null));
    return Promise.race([
      Promise.all(promises).then((result) => {
        const trackers = coalesce(result);
        if (trackers.length > 0) {
          return new MultiTracker(trackers);
        }
        return void 0;
      }),
      new Promise((resolve) => setTimeout(() => resolve(void 0), 1e3))
    ]).catch((err) => {
      return void 0;
    });
  }
  async getAdapterDescriptor(adapterDescriptorFactory, session) {
    const serverPort = session.configuration.debugServer;
    if (typeof serverPort === "number") {
      return Promise.resolve(new DebugAdapterServer(serverPort));
    }
    if (adapterDescriptorFactory) {
      const extensionRegistry2 = await this._extensionService.getExtensionRegistry();
      return asPromise(() => adapterDescriptorFactory.createDebugAdapterDescriptor(session.api, this.daExecutableFromPackage(session, extensionRegistry2))).then((daDescriptor) => {
        if (daDescriptor) {
          return daDescriptor;
        }
        return void 0;
      });
    }
    const extensionRegistry = await this._extensionService.getExtensionRegistry();
    return Promise.resolve(this.daExecutableFromPackage(session, extensionRegistry));
  }
  daExecutableFromPackage(session, extensionRegistry) {
    return void 0;
  }
  fireBreakpointChanges(added, removed, changed) {
    if (added.length > 0 || removed.length > 0 || changed.length > 0) {
      this._onDidChangeBreakpoints.fire(Object.freeze({
        added,
        removed,
        changed
      }));
    }
  }
  async getSession(dto) {
    if (dto) {
      if (typeof dto === "string") {
        const ds = this._debugSessions.get(dto);
        if (ds) {
          return ds;
        }
      } else {
        let ds = this._debugSessions.get(dto.id);
        if (!ds) {
          const folder = await this.getFolder(dto.folderUri);
          const parent = dto.parent ? this._debugSessions.get(dto.parent) : void 0;
          ds = new ExtHostDebugSession(this._debugServiceProxy, dto.id, dto.type, dto.name, folder, dto.configuration, parent?.api);
          this._debugSessions.set(ds.id, ds);
          this._debugServiceProxy.$sessionCached(ds.id);
        }
        return ds;
      }
    }
    throw new Error("cannot find session");
  }
  getFolder(_folderUri) {
    if (_folderUri) {
      const folderURI = URI.revive(_folderUri);
      return this._workspaceService.resolveWorkspaceFolder(folderURI);
    }
    return Promise.resolve(void 0);
  }
  extensionVisKey(extensionId, id) {
    return `${extensionId}\0${id}`;
  }
  serializeVisualization(extensionId, viz) {
    if (!viz) {
      return void 0;
    }
    if ("title" in viz && "command" in viz) {
      return { type: DebugVisualizationType.Command };
    }
    if ("treeId" in viz) {
      return { type: DebugVisualizationType.Tree, id: `${extensionId}\0${viz.treeId}` };
    }
    throw new Error("Unsupported debug visualization type");
  }
  getIconPathOrClass(icon) {
    const iconPathOrIconClass = this.getIconUris(icon);
    let iconPath;
    let iconClass;
    if ("id" in iconPathOrIconClass) {
      iconClass = ThemeIconUtils.asClassName(iconPathOrIconClass);
    } else {
      iconPath = iconPathOrIconClass;
    }
    return {
      iconPath,
      iconClass
    };
  }
  getIconUris(iconPath) {
    if (iconPath instanceof ThemeIcon) {
      return { id: iconPath.id };
    }
    const dark = typeof iconPath === "object" && "dark" in iconPath ? iconPath.dark : iconPath;
    const light = typeof iconPath === "object" && "light" in iconPath ? iconPath.light : iconPath;
    return {
      dark: typeof dark === "string" ? URI.file(dark) : dark,
      light: typeof light === "string" ? URI.file(light) : light
    };
  }
};
ExtHostDebugServiceBase = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostWorkspace),
  __decorateParam(2, IExtHostExtensionService),
  __decorateParam(3, IExtHostConfiguration),
  __decorateParam(4, IExtHostEditorTabs),
  __decorateParam(5, IExtHostVariableResolverProvider),
  __decorateParam(6, IExtHostCommands),
  __decorateParam(7, IExtHostTesting)
], ExtHostDebugServiceBase);
class ExtHostDebugSession {
  constructor(_debugServiceProxy, _id, _type, _name, _workspaceFolder, _configuration, _parentSession) {
    this._debugServiceProxy = _debugServiceProxy;
    this._id = _id;
    this._type = _type;
    this._name = _name;
    this._workspaceFolder = _workspaceFolder;
    this._configuration = _configuration;
    this._parentSession = _parentSession;
  }
  get api() {
    const that = this;
    return this.apiSession ??= Object.freeze({
      id: that._id,
      type: that._type,
      get name() {
        return that._name;
      },
      set name(name) {
        that._name = name;
        that._debugServiceProxy.$setDebugSessionName(that._id, name);
      },
      parentSession: that._parentSession,
      workspaceFolder: that._workspaceFolder,
      configuration: that._configuration,
      customRequest(command, args) {
        return that._debugServiceProxy.$customDebugAdapterRequest(that._id, command, args);
      },
      getDebugProtocolBreakpoint(breakpoint) {
        return that._debugServiceProxy.$getDebugProtocolBreakpoint(that._id, breakpoint.id);
      }
    });
  }
  get id() {
    return this._id;
  }
  get type() {
    return this._type;
  }
  _acceptNameChanged(name) {
    this._name = name;
  }
  get configuration() {
    return this._configuration;
  }
}
class ExtHostDebugConsole {
  constructor(proxy) {
    this.value = Object.freeze({
      append(value) {
        proxy.$appendDebugConsole(value);
      },
      appendLine(value) {
        this.append(value + "\n");
      }
    });
  }
}
class MultiTracker {
  constructor(trackers) {
    this.trackers = trackers;
  }
  onWillStartSession() {
    this.trackers.forEach((t) => t.onWillStartSession ? t.onWillStartSession() : void 0);
  }
  onWillReceiveMessage(message) {
    this.trackers.forEach((t) => t.onWillReceiveMessage ? t.onWillReceiveMessage(message) : void 0);
  }
  onDidSendMessage(message) {
    this.trackers.forEach((t) => t.onDidSendMessage ? t.onDidSendMessage(message) : void 0);
  }
  onWillStopSession() {
    this.trackers.forEach((t) => t.onWillStopSession ? t.onWillStopSession() : void 0);
  }
  onError(error) {
    this.trackers.forEach((t) => t.onError ? t.onError(error) : void 0);
  }
  onExit(code, signal) {
    this.trackers.forEach((t) => t.onExit ? t.onExit(code, signal) : void 0);
  }
}
class DirectDebugAdapter extends AbstractDebugAdapter {
  constructor(implementation) {
    super();
    this.implementation = implementation;
    implementation.onDidSendMessage((message) => {
      this.acceptMessage(message);
    });
  }
  startSession() {
    return Promise.resolve(void 0);
  }
  sendMessage(message) {
    this.implementation.handleMessage(message);
  }
  stopSession() {
    this.implementation.dispose();
    return Promise.resolve(void 0);
  }
}
let WorkerExtHostDebugService = class extends ExtHostDebugServiceBase {
  constructor(extHostRpcService, workspaceService, extensionService, configurationService, editorTabs, variableResolver, commands, testing) {
    super(extHostRpcService, workspaceService, extensionService, configurationService, editorTabs, variableResolver, commands, testing);
  }
};
WorkerExtHostDebugService = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostWorkspace),
  __decorateParam(2, IExtHostExtensionService),
  __decorateParam(3, IExtHostConfiguration),
  __decorateParam(4, IExtHostEditorTabs),
  __decorateParam(5, IExtHostVariableResolverProvider),
  __decorateParam(6, IExtHostCommands),
  __decorateParam(7, IExtHostTesting)
], WorkerExtHostDebugService);
export {
  ExtHostDebugConsole,
  ExtHostDebugServiceBase,
  ExtHostDebugSession,
  IExtHostDebugService,
  WorkerExtHostDebugService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0RGVidWdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGFzUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSBhcyBEaXNwb3NhYmxlQ2xzLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIGFzIFRoZW1lSWNvblV0aWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVNpZ25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc2lnbi9jb21tb24vc2lnbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyRGF0YSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RGVidWdBZGFwdGVyIH0gZnJvbSAnLi4vLi4vY29udHJpYi9kZWJ1Zy9jb21tb24vYWJzdHJhY3REZWJ1Z0FkYXB0ZXIuanMnO1xuaW1wb3J0IHsgRGVidWdWaXN1YWxpemF0aW9uVHlwZSwgSUFkYXB0ZXJEZXNjcmlwdG9yLCBJQ29uZmlnLCBJRGVidWdBZGFwdGVyLCBJRGVidWdBZGFwdGVyRXhlY3V0YWJsZSwgSURlYnVnQWRhcHRlckltcGwsIElEZWJ1Z0FkYXB0ZXJOYW1lZFBpcGVTZXJ2ZXIsIElEZWJ1Z0FkYXB0ZXJTZXJ2ZXIsIElEZWJ1Z2dlckNvbnRyaWJ1dGlvbiwgSURlYnVnVmlzdWFsaXphdGlvbiwgSURlYnVnVmlzdWFsaXphdGlvbkNvbnRleHQsIElEZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlSXRlbSwgTWFpblRocmVhZERlYnVnVmlzdWFsaXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvZGVidWcvY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IGNvbnZlcnRUb0RBUGF0aHMsIGNvbnZlcnRUb1ZTQ1BhdGhzLCBpc0RlYnVnZ2VyTWFpbkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvZGVidWcvY29tbW9uL2RlYnVnVXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRHRvIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IERlYnVnU2Vzc2lvblVVSUQsIEV4dEhvc3REZWJ1Z1NlcnZpY2VTaGFwZSwgSUJyZWFrcG9pbnRzRGVsdGFEdG8sIElEZWJ1Z1Nlc3Npb25EdG8sIElGdW5jdGlvbkJyZWFrcG9pbnREdG8sIElTb3VyY2VNdWx0aUJyZWFrcG9pbnREdG8sIElTdGFja0ZyYW1lRm9jdXNEdG8sIElUaHJlYWRGb2N1c0R0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWREZWJ1Z1NlcnZpY2VTaGFwZSwgTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuL2V4dEhvc3RDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RWRpdG9yVGFicyB9IGZyb20gJy4vZXh0SG9zdEVkaXRvclRhYnMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0RXh0ZW5zaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVzdGluZyB9IGZyb20gJy4vZXh0SG9zdFRlc3RpbmcuanMnO1xuaW1wb3J0ICogYXMgQ29udmVydCBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBCcmVha3BvaW50LCBEYXRhQnJlYWtwb2ludCwgRGVidWdBZGFwdGVyRXhlY3V0YWJsZSwgRGVidWdBZGFwdGVySW5saW5lSW1wbGVtZW50YXRpb24sIERlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlciwgRGVidWdBZGFwdGVyU2VydmVyLCBEZWJ1Z0NvbnNvbGVNb2RlLCBEZWJ1Z1N0YWNrRnJhbWUsIERlYnVnVGhyZWFkLCBEaXNwb3NhYmxlLCBGdW5jdGlvbkJyZWFrcG9pbnQsIExvY2F0aW9uLCBQb3NpdGlvbiwgc2V0QnJlYWtwb2ludElkLCBTb3VyY2VCcmVha3BvaW50LCBUaGVtZUljb24gfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJQcm92aWRlciB9IGZyb20gJy4vZXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0V29ya3NwYWNlIH0gZnJvbSAnLi9leHRIb3N0V29ya3NwYWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0RGVidWdTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0RGVidWdTZXJ2aWNlPignSUV4dEhvc3REZWJ1Z1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdERlYnVnU2VydmljZSBleHRlbmRzIEV4dEhvc3REZWJ1Z1NlcnZpY2VTaGFwZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkU3RhcnREZWJ1Z1Nlc3Npb246IEV2ZW50PHZzY29kZS5EZWJ1Z1Nlc3Npb24+O1xuXHRyZWFkb25seSBvbkRpZFRlcm1pbmF0ZURlYnVnU2Vzc2lvbjogRXZlbnQ8dnNjb2RlLkRlYnVnU2Vzc2lvbj47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlRGVidWdTZXNzaW9uOiBFdmVudDx2c2NvZGUuRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkPjtcblx0YWN0aXZlRGVidWdTZXNzaW9uOiB2c2NvZGUuRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRhY3RpdmVEZWJ1Z0NvbnNvbGU6IHZzY29kZS5EZWJ1Z0NvbnNvbGU7XG5cdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZURlYnVnU2Vzc2lvbkN1c3RvbUV2ZW50OiBFdmVudDx2c2NvZGUuRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUJyZWFrcG9pbnRzOiBFdmVudDx2c2NvZGUuQnJlYWtwb2ludHNDaGFuZ2VFdmVudD47XG5cdGJyZWFrcG9pbnRzOiB2c2NvZGUuQnJlYWtwb2ludFtdO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVN0YWNrSXRlbTogRXZlbnQ8dnNjb2RlLkRlYnVnVGhyZWFkIHwgdnNjb2RlLkRlYnVnU3RhY2tGcmFtZSB8IHVuZGVmaW5lZD47XG5cdGFjdGl2ZVN0YWNrSXRlbTogdnNjb2RlLkRlYnVnVGhyZWFkIHwgdnNjb2RlLkRlYnVnU3RhY2tGcmFtZSB8IHVuZGVmaW5lZDtcblxuXHRhZGRCcmVha3BvaW50cyhicmVha3BvaW50czA6IHJlYWRvbmx5IHZzY29kZS5CcmVha3BvaW50W10pOiBQcm9taXNlPHZvaWQ+O1xuXHRyZW1vdmVCcmVha3BvaW50cyhicmVha3BvaW50czA6IHJlYWRvbmx5IHZzY29kZS5CcmVha3BvaW50W10pOiBQcm9taXNlPHZvaWQ+O1xuXHRzdGFydERlYnVnZ2luZyhmb2xkZXI6IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQsIG5hbWVPckNvbmZpZzogc3RyaW5nIHwgdnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvbiwgb3B0aW9uczogdnNjb2RlLkRlYnVnU2Vzc2lvbk9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+O1xuXHRzdG9wRGVidWdnaW5nKHNlc3Npb24/OiB2c2NvZGUuRGVidWdTZXNzaW9uKTogUHJvbWlzZTx2b2lkPjtcblx0cmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcih0eXBlOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIsIHRyaWdnZXI6IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kKTogdnNjb2RlLkRpc3Bvc2FibGU7XG5cdHJlZ2lzdGVyRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHR5cGU6IHN0cmluZywgZmFjdG9yeTogdnNjb2RlLkRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KTogdnNjb2RlLkRpc3Bvc2FibGU7XG5cdHJlZ2lzdGVyRGVidWdBZGFwdGVyVHJhY2tlckZhY3RvcnkodHlwZTogc3RyaW5nLCBmYWN0b3J5OiB2c2NvZGUuRGVidWdBZGFwdGVyVHJhY2tlckZhY3RvcnkpOiB2c2NvZGUuRGlzcG9zYWJsZTtcblx0cmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcjxUIGV4dGVuZHMgdnNjb2RlLkRlYnVnVmlzdWFsaXphdGlvbj4oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXI8VD4pOiB2c2NvZGUuRGlzcG9zYWJsZTtcblx0cmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlPFQgZXh0ZW5kcyB2c2NvZGUuRGVidWdUcmVlSXRlbT4oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uVHJlZTxUPik6IHZzY29kZS5EaXNwb3NhYmxlO1xuXHRhc0RlYnVnU291cmNlVXJpKHNvdXJjZTogdnNjb2RlLkRlYnVnUHJvdG9jb2xTb3VyY2UsIHNlc3Npb24/OiB2c2NvZGUuRGVidWdTZXNzaW9uKTogdnNjb2RlLlVyaTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEV4dEhvc3REZWJ1Z1NlcnZpY2VCYXNlIGV4dGVuZHMgRGlzcG9zYWJsZUNscyBpbXBsZW1lbnRzIElFeHRIb3N0RGVidWdTZXJ2aWNlLCBFeHRIb3N0RGVidWdTZXJ2aWNlU2hhcGUge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2NvbmZpZ1Byb3ZpZGVySGFuZGxlQ291bnRlcjogbnVtYmVyO1xuXHRwcml2YXRlIF9jb25maWdQcm92aWRlcnM6IENvbmZpZ1Byb3ZpZGVyVHVwbGVbXTtcblxuXHRwcml2YXRlIF9hZGFwdGVyRmFjdG9yeUhhbmRsZUNvdW50ZXI6IG51bWJlcjtcblx0cHJpdmF0ZSBfYWRhcHRlckZhY3RvcmllczogRGVzY3JpcHRvckZhY3RvcnlUdXBsZVtdO1xuXG5cdHByaXZhdGUgX3RyYWNrZXJGYWN0b3J5SGFuZGxlQ291bnRlcjogbnVtYmVyO1xuXHRwcml2YXRlIF90cmFja2VyRmFjdG9yaWVzOiBUcmFja2VyRmFjdG9yeVR1cGxlW107XG5cblx0cHJpdmF0ZSBfZGVidWdTZXJ2aWNlUHJveHk6IE1haW5UaHJlYWREZWJ1Z1NlcnZpY2VTaGFwZTtcblx0cHJpdmF0ZSBfZGVidWdTZXNzaW9uczogTWFwPERlYnVnU2Vzc2lvblVVSUQsIEV4dEhvc3REZWJ1Z1Nlc3Npb24+ID0gbmV3IE1hcDxEZWJ1Z1Nlc3Npb25VVUlELCBFeHRIb3N0RGVidWdTZXNzaW9uPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RhcnREZWJ1Z1Nlc3Npb246IEVtaXR0ZXI8dnNjb2RlLkRlYnVnU2Vzc2lvbj47XG5cdGdldCBvbkRpZFN0YXJ0RGVidWdTZXNzaW9uKCk6IEV2ZW50PHZzY29kZS5EZWJ1Z1Nlc3Npb24+IHsgcmV0dXJuIHRoaXMuX29uRGlkU3RhcnREZWJ1Z1Nlc3Npb24uZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRlcm1pbmF0ZURlYnVnU2Vzc2lvbjogRW1pdHRlcjx2c2NvZGUuRGVidWdTZXNzaW9uPjtcblx0Z2V0IG9uRGlkVGVybWluYXRlRGVidWdTZXNzaW9uKCk6IEV2ZW50PHZzY29kZS5EZWJ1Z1Nlc3Npb24+IHsgcmV0dXJuIHRoaXMuX29uRGlkVGVybWluYXRlRGVidWdTZXNzaW9uLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVEZWJ1Z1Nlc3Npb246IEVtaXR0ZXI8dnNjb2RlLkRlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cdGdldCBvbkRpZENoYW5nZUFjdGl2ZURlYnVnU2Vzc2lvbigpOiBFdmVudDx2c2NvZGUuRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZURlYnVnU2Vzc2lvbi5ldmVudDsgfVxuXG5cdHByaXZhdGUgX2FjdGl2ZURlYnVnU2Vzc2lvbjogRXh0SG9zdERlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0Z2V0IGFjdGl2ZURlYnVnU2Vzc2lvbigpOiB2c2NvZGUuRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2FjdGl2ZURlYnVnU2Vzc2lvbj8uYXBpOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWNlaXZlRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQ6IEVtaXR0ZXI8dnNjb2RlLkRlYnVnU2Vzc2lvbkN1c3RvbUV2ZW50Pjtcblx0Z2V0IG9uRGlkUmVjZWl2ZURlYnVnU2Vzc2lvbkN1c3RvbUV2ZW50KCk6IEV2ZW50PHZzY29kZS5EZWJ1Z1Nlc3Npb25DdXN0b21FdmVudD4geyByZXR1cm4gdGhpcy5fb25EaWRSZWNlaXZlRGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQuZXZlbnQ7IH1cblxuXHRwcml2YXRlIF9hY3RpdmVEZWJ1Z0NvbnNvbGU6IEV4dEhvc3REZWJ1Z0NvbnNvbGU7XG5cdGdldCBhY3RpdmVEZWJ1Z0NvbnNvbGUoKTogdnNjb2RlLkRlYnVnQ29uc29sZSB7IHJldHVybiB0aGlzLl9hY3RpdmVEZWJ1Z0NvbnNvbGUudmFsdWU7IH1cblxuXHRwcml2YXRlIF9icmVha3BvaW50czogTWFwPHN0cmluZywgdnNjb2RlLkJyZWFrcG9pbnQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQnJlYWtwb2ludHM6IEVtaXR0ZXI8dnNjb2RlLkJyZWFrcG9pbnRzQ2hhbmdlRXZlbnQ+O1xuXG5cdHByaXZhdGUgX2FjdGl2ZVN0YWNrSXRlbTogdnNjb2RlLkRlYnVnVGhyZWFkIHwgdnNjb2RlLkRlYnVnU3RhY2tGcmFtZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVTdGFja0l0ZW06IEVtaXR0ZXI8dnNjb2RlLkRlYnVnVGhyZWFkIHwgdnNjb2RlLkRlYnVnU3RhY2tGcmFtZSB8IHVuZGVmaW5lZD47XG5cblx0cHJpdmF0ZSBfZGVidWdBZGFwdGVyczogTWFwPG51bWJlciwgSURlYnVnQWRhcHRlcj47XG5cdHByaXZhdGUgX2RlYnVnQWRhcHRlcnNUcmFja2VyczogTWFwPG51bWJlciwgdnNjb2RlLkRlYnVnQWRhcHRlclRyYWNrZXI+O1xuXG5cdHByaXZhdGUgX2RlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtSWRzQ291bnRlciA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnVmlzdWFsaXphdGlvblByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnVmlzdWFsaXphdGlvblRyZWVzID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5EZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlSXRlbUlkcyA9IG5ldyBXZWFrTWFwPHZzY29kZS5EZWJ1Z1RyZWVJdGVtLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnVmlzdWFsaXphdGlvbkVsZW1lbnRzID0gbmV3IE1hcDxudW1iZXIsIHsgcHJvdmlkZXI6IHN0cmluZzsgaXRlbTogdnNjb2RlLkRlYnVnVHJlZUl0ZW07IGNoaWxkcmVuPzogbnVtYmVyW10gfT4oKTtcblxuXHRwcml2YXRlIF9zaWduU2VydmljZTogSVNpZ25TZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc3VhbGl6ZXJzID0gbmV3IE1hcDxudW1iZXIsIHsgdjogdnNjb2RlLkRlYnVnVmlzdWFsaXphdGlvbjsgcHJvdmlkZXI6IHZzY29kZS5EZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcjsgZXh0ZW5zaW9uSWQ6IHN0cmluZyB9PigpO1xuXHRwcml2YXRlIF92aXN1YWxpemVySWRDb3VudGVyID0gMDtcblxuXHRwcml2YXRlIF90ZWxlbWV0cnlQcm94eTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwY1NlcnZpY2U6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUV4dEhvc3RXb3Jrc3BhY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF93b3Jrc3BhY2VTZXJ2aWNlOiBJRXh0SG9zdFdvcmtzcGFjZSxcblx0XHRASUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dEhvc3RDb25maWd1cmF0aW9uIHByb3RlY3RlZCByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElFeHRIb3N0Q29uZmlndXJhdGlvbixcblx0XHRASUV4dEhvc3RFZGl0b3JUYWJzIHByb3RlY3RlZCByZWFkb25seSBfZWRpdG9yVGFiczogSUV4dEhvc3RFZGl0b3JUYWJzLFxuXHRcdEBJRXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJQcm92aWRlciBwcml2YXRlIHJlYWRvbmx5IF92YXJpYWJsZVJlc29sdmVyOiBJRXh0SG9zdFZhcmlhYmxlUmVzb2x2ZXJQcm92aWRlcixcblx0XHRASUV4dEhvc3RDb21tYW5kcyBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kczogSUV4dEhvc3RDb21tYW5kcyxcblx0XHRASUV4dEhvc3RUZXN0aW5nIHByaXZhdGUgcmVhZG9ubHkgX3Rlc3Rpbmc6IElFeHRIb3N0VGVzdGluZyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NvbmZpZ1Byb3ZpZGVySGFuZGxlQ291bnRlciA9IDA7XG5cdFx0dGhpcy5fY29uZmlnUHJvdmlkZXJzID0gW107XG5cblx0XHR0aGlzLl9hZGFwdGVyRmFjdG9yeUhhbmRsZUNvdW50ZXIgPSAwO1xuXHRcdHRoaXMuX2FkYXB0ZXJGYWN0b3JpZXMgPSBbXTtcblxuXHRcdHRoaXMuX3RyYWNrZXJGYWN0b3J5SGFuZGxlQ291bnRlciA9IDA7XG5cdFx0dGhpcy5fdHJhY2tlckZhY3RvcmllcyA9IFtdO1xuXG5cdFx0dGhpcy5fZGVidWdBZGFwdGVycyA9IG5ldyBNYXAoKTtcblx0XHR0aGlzLl9kZWJ1Z0FkYXB0ZXJzVHJhY2tlcnMgPSBuZXcgTWFwKCk7XG5cblx0XHR0aGlzLl9vbkRpZFN0YXJ0RGVidWdTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dnNjb2RlLkRlYnVnU2Vzc2lvbj4oKSk7XG5cdFx0dGhpcy5fb25EaWRUZXJtaW5hdGVEZWJ1Z1Nlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuRGVidWdTZXNzaW9uPigpKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZURlYnVnU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5EZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQ+KCkpO1xuXHRcdHRoaXMuX29uRGlkUmVjZWl2ZURlYnVnU2Vzc2lvbkN1c3RvbUV2ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dnNjb2RlLkRlYnVnU2Vzc2lvbkN1c3RvbUV2ZW50PigpKTtcblxuXHRcdHRoaXMuX2RlYnVnU2VydmljZVByb3h5ID0gZXh0SG9zdFJwY1NlcnZpY2UuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZERlYnVnU2VydmljZSk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dnNjb2RlLkJyZWFrcG9pbnRzQ2hhbmdlRXZlbnQ+KCkpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVTdGFja0l0ZW0gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuRGVidWdUaHJlYWQgfCB2c2NvZGUuRGVidWdTdGFja0ZyYW1lIHwgdW5kZWZpbmVkPigpKTtcblxuXHRcdHRoaXMuX2FjdGl2ZURlYnVnQ29uc29sZSA9IG5ldyBFeHRIb3N0RGVidWdDb25zb2xlKHRoaXMuX2RlYnVnU2VydmljZVByb3h5KTtcblxuXHRcdHRoaXMuX2JyZWFrcG9pbnRzID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5CcmVha3BvaW50PigpO1xuXG5cdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25SZWdpc3RyeSgpLnRoZW4oKGV4dGVuc2lvblJlZ2lzdHJ5OiBFeHRlbnNpb25EZXNjcmlwdGlvblJlZ2lzdHJ5KSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25SZWdpc3RyeS5vbkRpZENoYW5nZShfID0+IHtcblx0XHRcdFx0dGhpcy5yZWdpc3RlckFsbERlYnVnVHlwZXMoZXh0ZW5zaW9uUmVnaXN0cnkpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5yZWdpc3RlckFsbERlYnVnVHlwZXMoZXh0ZW5zaW9uUmVnaXN0cnkpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fdGVsZW1ldHJ5UHJveHkgPSBleHRIb3N0UnBjU2VydmljZS5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkVGVsZW1ldHJ5KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkZ2V0VmlzdWFsaXplclRyZWVJdGVtKHRyZWVJZDogc3RyaW5nLCBlbGVtZW50OiBJRGVidWdWaXN1YWxpemF0aW9uQ29udGV4dCk6IFByb21pc2U8SURlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuaHlkcmF0ZVZpc3VhbGl6YXRpb25Db250ZXh0KGVsZW1lbnQpO1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtID0gYXdhaXQgdGhpcy5fZGVidWdWaXN1YWxpemF0aW9uVHJlZXMuZ2V0KHRyZWVJZCk/LmdldFRyZWVJdGVtPy4oY29udGV4dCk7XG5cdFx0cmV0dXJuIGl0ZW0gPyB0aGlzLmNvbnZlcnRWaXN1YWxpemVyVHJlZUl0ZW0odHJlZUlkLCBpdGVtKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckRlYnVnVmlzdWFsaXphdGlvblRyZWU8VCBleHRlbmRzIHZzY29kZS5EZWJ1Z1RyZWVJdGVtPihtYW5pZmVzdDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLkRlYnVnVmlzdWFsaXphdGlvblRyZWU8VD4pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KG1hbmlmZXN0LmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZXh0ZW5zaW9uVmlzS2V5KGV4dGVuc2lvbklkLCBpZCk7XG5cdFx0aWYgKHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvblByb3ZpZGVycy5oYXMoa2V5KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBIGRlYnVnIHZpc3VhbGl6YXRpb24gcHJvdmlkZXIgd2l0aCBpZCAnJHtpZH0nIGlzIGFscmVhZHkgcmVnaXN0ZXJlZGApO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvblRyZWVzLnNldChrZXksIHByb3ZpZGVyKTtcblx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kcmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6ZXJUcmVlKGtleSwgISFwcm92aWRlci5lZGl0SXRlbSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kdW5yZWdpc3RlckRlYnVnVmlzdWFsaXplclRyZWUoa2V5KTtcblx0XHRcdHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvblRyZWVzLmRlbGV0ZShpZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGdldFZpc3VhbGl6ZXJUcmVlSXRlbUNoaWxkcmVuKHRyZWVJZDogc3RyaW5nLCBlbGVtZW50OiBudW1iZXIpOiBQcm9taXNlPElEZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlSXRlbVtdPiB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvbkVsZW1lbnRzLmdldChlbGVtZW50KT8uaXRlbTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvblRyZWVzLmdldCh0cmVlSWQpPy5nZXRDaGlsZHJlbj8uKGl0ZW0pO1xuXHRcdHJldHVybiBjaGlsZHJlbj8ubWFwKGkgPT4gdGhpcy5jb252ZXJ0VmlzdWFsaXplclRyZWVJdGVtKHRyZWVJZCwgaSkpIHx8IFtdO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRlZGl0VmlzdWFsaXplclRyZWVJdGVtKGVsZW1lbnQ6IG51bWJlciwgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8SURlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZSA9IHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvbkVsZW1lbnRzLmdldChlbGVtZW50KTtcblx0XHRpZiAoIWUpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3QgciA9IGF3YWl0IHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvblRyZWVzLmdldChlLnByb3ZpZGVyKT8uZWRpdEl0ZW0/LihlLml0ZW0sIHZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcy5jb252ZXJ0VmlzdWFsaXplclRyZWVJdGVtKGUucHJvdmlkZXIsIHIgfHwgZS5pdGVtKTtcblx0fVxuXG5cdHB1YmxpYyAkZGlzcG9zZVZpc3VhbGl6ZWRUcmVlKGVsZW1lbnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLl9kZWJ1Z1Zpc3VhbGl6YXRpb25FbGVtZW50cy5nZXQoZWxlbWVudCk7XG5cdFx0aWYgKCFyb290KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVldWUgPSBbcm9vdC5jaGlsZHJlbl07XG5cdFx0Zm9yIChjb25zdCBjaGlsZHJlbiBvZiBxdWV1ZSkge1xuXHRcdFx0aWYgKGNoaWxkcmVuKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRxdWV1ZS5wdXNoKHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvbkVsZW1lbnRzLmdldChjaGlsZCk/LmNoaWxkcmVuKTtcblx0XHRcdFx0XHR0aGlzLl9kZWJ1Z1Zpc3VhbGl6YXRpb25FbGVtZW50cy5kZWxldGUoY2hpbGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb252ZXJ0VmlzdWFsaXplclRyZWVJdGVtKHRyZWVJZDogc3RyaW5nLCBpdGVtOiB2c2NvZGUuRGVidWdUcmVlSXRlbSk6IElEZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlSXRlbSB7XG5cdFx0bGV0IGlkID0gdGhpcy5fZGVidWdWaXN1YWxpemF0aW9uVHJlZUl0ZW1JZHMuZ2V0KGl0ZW0pO1xuXHRcdGlmICghaWQpIHtcblx0XHRcdGlkID0gdGhpcy5fZGVidWdWaXN1YWxpemF0aW9uVHJlZUl0ZW1JZHNDb3VudGVyKys7XG5cdFx0XHR0aGlzLl9kZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlSXRlbUlkcy5zZXQoaXRlbSwgaWQpO1xuXHRcdFx0dGhpcy5fZGVidWdWaXN1YWxpemF0aW9uRWxlbWVudHMuc2V0KGlkLCB7IHByb3ZpZGVyOiB0cmVlSWQsIGl0ZW0gfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIENvbnZlcnQuRGVidWdUcmVlSXRlbS5mcm9tKGl0ZW0sIGlkKTtcblx0fVxuXG5cdHB1YmxpYyBhc0RlYnVnU291cmNlVXJpKHNyYzogdnNjb2RlLkRlYnVnUHJvdG9jb2xTb3VyY2UsIHNlc3Npb24/OiB2c2NvZGUuRGVidWdTZXNzaW9uKTogVVJJIHtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHNvdXJjZSA9IDxhbnk+c3JjO1xuXG5cdFx0aWYgKHR5cGVvZiBzb3VyY2Uuc291cmNlUmVmZXJlbmNlID09PSAnbnVtYmVyJyAmJiBzb3VyY2Uuc291cmNlUmVmZXJlbmNlID4gMCkge1xuXHRcdFx0Ly8gc3JjIGNhbiBiZSByZXRyaWV2ZWQgdmlhIERBUCdzIFwic291cmNlXCIgcmVxdWVzdFxuXG5cdFx0XHRsZXQgZGVidWcgPSBgZGVidWc6JHtlbmNvZGVVUklDb21wb25lbnQoc291cmNlLnBhdGggfHwgJycpfWA7XG5cdFx0XHRsZXQgc2VwID0gJz8nO1xuXG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRkZWJ1ZyArPSBgJHtzZXB9c2Vzc2lvbj0ke2VuY29kZVVSSUNvbXBvbmVudChzZXNzaW9uLmlkKX1gO1xuXHRcdFx0XHRzZXAgPSAnJic7XG5cdFx0XHR9XG5cblx0XHRcdGRlYnVnICs9IGAke3NlcH1yZWY9JHtzb3VyY2Uuc291cmNlUmVmZXJlbmNlfWA7XG5cblx0XHRcdHJldHVybiBVUkkucGFyc2UoZGVidWcpO1xuXHRcdH0gZWxzZSBpZiAoc291cmNlLnBhdGgpIHtcblx0XHRcdC8vIHNyYyBpcyBqdXN0IGEgbG9jYWwgZmlsZSBwYXRoXG5cdFx0XHRyZXR1cm4gVVJJLmZpbGUoc291cmNlLnBhdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBjcmVhdGUgdXJpIGZyb20gREFQICdzb3VyY2UnIG9iamVjdDsgcHJvcGVydGllcyAncGF0aCcgYW5kICdzb3VyY2VSZWZlcmVuY2UnIGFyZSBib3RoIG1pc3NpbmcuYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFsbERlYnVnVHlwZXMoZXh0ZW5zaW9uUmVnaXN0cnk6IEV4dGVuc2lvbkRlc2NyaXB0aW9uUmVnaXN0cnkpIHtcblxuXHRcdGNvbnN0IGRlYnVnVHlwZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGVkIG9mIGV4dGVuc2lvblJlZ2lzdHJ5LmdldEFsbEV4dGVuc2lvbkRlc2NyaXB0aW9ucygpKSB7XG5cdFx0XHRpZiAoZWQuY29udHJpYnV0ZXMpIHtcblx0XHRcdFx0Y29uc3QgZGVidWdnZXJzID0gPElEZWJ1Z2dlckNvbnRyaWJ1dGlvbltdPmVkLmNvbnRyaWJ1dGVzWydkZWJ1Z2dlcnMnXTtcblx0XHRcdFx0aWYgKGRlYnVnZ2VycyAmJiBkZWJ1Z2dlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZGJnIG9mIGRlYnVnZ2Vycykge1xuXHRcdFx0XHRcdFx0aWYgKGlzRGVidWdnZXJNYWluQ29udHJpYnV0aW9uKGRiZykpIHtcblx0XHRcdFx0XHRcdFx0ZGVidWdUeXBlcy5wdXNoKGRiZy50eXBlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kcmVnaXN0ZXJEZWJ1Z1R5cGVzKGRlYnVnVHlwZXMpO1xuXHR9XG5cblx0Ly8gZXh0ZW5zaW9uIGRlYnVnIEFQSVxuXG5cblx0Z2V0IGFjdGl2ZVN0YWNrSXRlbSgpOiB2c2NvZGUuRGVidWdUaHJlYWQgfCB2c2NvZGUuRGVidWdTdGFja0ZyYW1lIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlU3RhY2tJdGVtO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlQWN0aXZlU3RhY2tJdGVtKCk6IEV2ZW50PHZzY29kZS5EZWJ1Z1RocmVhZCB8IHZzY29kZS5EZWJ1Z1N0YWNrRnJhbWUgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVTdGFja0l0ZW0uZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VCcmVha3BvaW50cygpOiBFdmVudDx2c2NvZGUuQnJlYWtwb2ludHNDaGFuZ2VFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUJyZWFrcG9pbnRzLmV2ZW50O1xuXHR9XG5cblx0Z2V0IGJyZWFrcG9pbnRzKCk6IHZzY29kZS5CcmVha3BvaW50W10ge1xuXHRcdGNvbnN0IHJlc3VsdDogdnNjb2RlLkJyZWFrcG9pbnRbXSA9IFtdO1xuXHRcdHRoaXMuX2JyZWFrcG9pbnRzLmZvckVhY2goYnAgPT4gcmVzdWx0LnB1c2goYnApKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRyZXNvbHZlRGVidWdWaXN1YWxpemVyKGlkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TWFpblRocmVhZERlYnVnVmlzdWFsaXphdGlvbj4ge1xuXHRcdGNvbnN0IHZpc3VhbGl6ZXIgPSB0aGlzLl92aXN1YWxpemVycy5nZXQoaWQpO1xuXHRcdGlmICghdmlzdWFsaXplcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBkZWJ1ZyB2aXN1YWxpemVyIGZvdW5kIHdpdGggaWQgJyR7aWR9J2ApO1xuXHRcdH1cblxuXHRcdGxldCB7IHYsIHByb3ZpZGVyLCBleHRlbnNpb25JZCB9ID0gdmlzdWFsaXplcjtcblx0XHRpZiAoIXYudmlzdWFsaXphdGlvbikge1xuXHRcdFx0diA9IGF3YWl0IHByb3ZpZGVyLnJlc29sdmVEZWJ1Z1Zpc3VhbGl6YXRpb24/Lih2LCB0b2tlbikgfHwgdjtcblx0XHRcdHZpc3VhbGl6ZXIudiA9IHY7XG5cdFx0fVxuXG5cdFx0aWYgKCF2LnZpc3VhbGl6YXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gdmlzdWFsaXphdGlvbiByZXR1cm5lZCBmcm9tIHJlc29sdmVEZWJ1Z1Zpc3VhbGl6YXRpb24gaW4gJyR7cHJvdmlkZXJ9J2ApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNlcmlhbGl6ZVZpc3VhbGl6YXRpb24oZXh0ZW5zaW9uSWQsIHYudmlzdWFsaXphdGlvbikhO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRleGVjdXRlRGVidWdWaXN1YWxpemVyQ29tbWFuZChpZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdmlzdWFsaXplciA9IHRoaXMuX3Zpc3VhbGl6ZXJzLmdldChpZCk7XG5cdFx0aWYgKCF2aXN1YWxpemVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGRlYnVnIHZpc3VhbGl6ZXIgZm91bmQgd2l0aCBpZCAnJHtpZH0nYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZCA9IHZpc3VhbGl6ZXIudi52aXN1YWxpemF0aW9uO1xuXHRcdGlmIChjb21tYW5kICYmICdjb21tYW5kJyBpbiBjb21tYW5kKSB7XG5cdFx0XHR0aGlzLl9jb21tYW5kcy5leGVjdXRlQ29tbWFuZChjb21tYW5kLmNvbW1hbmQsIC4uLihjb21tYW5kLmFyZ3VtZW50cyB8fCBbXSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaHlkcmF0ZVZpc3VhbGl6YXRpb25Db250ZXh0KGNvbnRleHQ6IElEZWJ1Z1Zpc3VhbGl6YXRpb25Db250ZXh0KTogdnNjb2RlLkRlYnVnVmlzdWFsaXphdGlvbkNvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9kZWJ1Z1Nlc3Npb25zLmdldChjb250ZXh0LnNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb24gJiYge1xuXHRcdFx0c2Vzc2lvbjogc2Vzc2lvbi5hcGksXG5cdFx0XHR2YXJpYWJsZTogY29udGV4dC52YXJpYWJsZSxcblx0XHRcdGNvbnRhaW5lcklkOiBjb250ZXh0LmNvbnRhaW5lcklkLFxuXHRcdFx0ZnJhbWVJZDogY29udGV4dC5mcmFtZUlkLFxuXHRcdFx0dGhyZWFkSWQ6IGNvbnRleHQudGhyZWFkSWQsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkcHJvdmlkZURlYnVnVmlzdWFsaXplcnMoZXh0ZW5zaW9uSWQ6IHN0cmluZywgaWQ6IHN0cmluZywgY29udGV4dDogSURlYnVnVmlzdWFsaXphdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SURlYnVnVmlzdWFsaXphdGlvbi5TZXJpYWxpemVkW10+IHtcblx0XHRjb25zdCBjb250ZXh0SHlkcmF0ZWQgPSB0aGlzLmh5ZHJhdGVWaXN1YWxpemF0aW9uQ29udGV4dChjb250ZXh0KTtcblx0XHRjb25zdCBrZXkgPSB0aGlzLmV4dGVuc2lvblZpc0tleShleHRlbnNpb25JZCwgaWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXJzLmdldChrZXkpO1xuXHRcdGlmICghY29udGV4dEh5ZHJhdGVkIHx8ICFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIFtdOyAvLyBwcm9iYWJseSBlbmRlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHR9XG5cblx0XHRjb25zdCB2aXN1YWxpemF0aW9ucyA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVEZWJ1Z1Zpc3VhbGl6YXRpb24oY29udGV4dEh5ZHJhdGVkLCB0b2tlbik7XG5cblx0XHRpZiAoIXZpc3VhbGl6YXRpb25zKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpc3VhbGl6YXRpb25zLm1hcCh2ID0+IHtcblx0XHRcdGNvbnN0IGlkID0gKyt0aGlzLl92aXN1YWxpemVySWRDb3VudGVyO1xuXHRcdFx0dGhpcy5fdmlzdWFsaXplcnMuc2V0KGlkLCB7IHYsIHByb3ZpZGVyLCBleHRlbnNpb25JZCB9KTtcblx0XHRcdGNvbnN0IGljb24gPSB2Lmljb25QYXRoID8gdGhpcy5nZXRJY29uUGF0aE9yQ2xhc3Modi5pY29uUGF0aCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0bmFtZTogdi5uYW1lLFxuXHRcdFx0XHRpY29uQ2xhc3M6IGljb24/Lmljb25DbGFzcyxcblx0XHRcdFx0aWNvblBhdGg6IGljb24/Lmljb25QYXRoLFxuXHRcdFx0XHR2aXN1YWxpemF0aW9uOiB0aGlzLnNlcmlhbGl6ZVZpc3VhbGl6YXRpb24oZXh0ZW5zaW9uSWQsIHYudmlzdWFsaXphdGlvbiksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljICRkaXNwb3NlRGVidWdWaXN1YWxpemVycyhpZHM6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBpZHMpIHtcblx0XHRcdHRoaXMuX3Zpc3VhbGl6ZXJzLmRlbGV0ZShpZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyRGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXI8VCBleHRlbmRzIHZzY29kZS5EZWJ1Z1Zpc3VhbGl6YXRpb24+KG1hbmlmZXN0OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGlkOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXI8VD4pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0aWYgKCFtYW5pZmVzdC5jb250cmlidXRlcz8uZGVidWdWaXN1YWxpemVycz8uc29tZShyID0+IHIuaWQgPT09IGlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHRlbnNpb25zIG1heSBvbmx5IGNhbGwgcmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6YXRpb25Qcm92aWRlcigpIGZvciByZW5kZXJlcnMgdGhleSBjb250cmlidXRlIChnb3QgJHtpZH0pYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KG1hbmlmZXN0LmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuZXh0ZW5zaW9uVmlzS2V5KGV4dGVuc2lvbklkLCBpZCk7XG5cdFx0aWYgKHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvblByb3ZpZGVycy5oYXMoa2V5KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBIGRlYnVnIHZpc3VhbGl6YXRpb24gcHJvdmlkZXIgd2l0aCBpZCAnJHtpZH0nIGlzIGFscmVhZHkgcmVnaXN0ZXJlZGApO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RlYnVnVmlzdWFsaXphdGlvblByb3ZpZGVycy5zZXQoa2V5LCBwcm92aWRlcik7XG5cdFx0dGhpcy5fZGVidWdTZXJ2aWNlUHJveHkuJHJlZ2lzdGVyRGVidWdWaXN1YWxpemVyKGV4dGVuc2lvbklkLCBpZCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kdW5yZWdpc3RlckRlYnVnVmlzdWFsaXplcihleHRlbnNpb25JZCwgaWQpO1xuXHRcdFx0dGhpcy5fZGVidWdWaXN1YWxpemF0aW9uUHJvdmlkZXJzLmRlbGV0ZShpZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYWRkQnJlYWtwb2ludHMoYnJlYWtwb2ludHMwOiB2c2NvZGUuQnJlYWtwb2ludFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gZmlsdGVyIG9ubHkgbmV3IGJyZWFrcG9pbnRzXG5cdFx0Y29uc3QgYnJlYWtwb2ludHMgPSBicmVha3BvaW50czAuZmlsdGVyKGJwID0+IHtcblx0XHRcdGNvbnN0IGlkID0gYnAuaWQ7XG5cdFx0XHRpZiAoIXRoaXMuX2JyZWFrcG9pbnRzLmhhcyhpZCkpIHtcblx0XHRcdFx0dGhpcy5fYnJlYWtwb2ludHMuc2V0KGlkLCBicCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0Ly8gc2VuZCBub3RpZmljYXRpb24gZm9yIGFkZGVkIGJyZWFrcG9pbnRzXG5cdFx0dGhpcy5maXJlQnJlYWtwb2ludENoYW5nZXMoYnJlYWtwb2ludHMsIFtdLCBbXSk7XG5cblx0XHQvLyBjb252ZXJ0IGFkZGVkIGJyZWFrcG9pbnRzIHRvIERUT3Ncblx0XHRjb25zdCBkdG9zOiBBcnJheTxJU291cmNlTXVsdGlCcmVha3BvaW50RHRvIHwgSUZ1bmN0aW9uQnJlYWtwb2ludER0bz4gPSBbXTtcblx0XHRjb25zdCBtYXAgPSBuZXcgTWFwPHN0cmluZywgSVNvdXJjZU11bHRpQnJlYWtwb2ludER0bz4oKTtcblx0XHRmb3IgKGNvbnN0IGJwIG9mIGJyZWFrcG9pbnRzKSB7XG5cdFx0XHRpZiAoYnAgaW5zdGFuY2VvZiBTb3VyY2VCcmVha3BvaW50KSB7XG5cdFx0XHRcdGxldCBkdG8gPSBtYXAuZ2V0KGJwLmxvY2F0aW9uLnVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKCFkdG8pIHtcblx0XHRcdFx0XHRkdG8gPSB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc291cmNlTXVsdGknLFxuXHRcdFx0XHRcdFx0dXJpOiBicC5sb2NhdGlvbi51cmksXG5cdFx0XHRcdFx0XHRsaW5lczogW11cblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJU291cmNlTXVsdGlCcmVha3BvaW50RHRvO1xuXHRcdFx0XHRcdG1hcC5zZXQoYnAubG9jYXRpb24udXJpLnRvU3RyaW5nKCksIGR0byk7XG5cdFx0XHRcdFx0ZHRvcy5wdXNoKGR0byk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZHRvLmxpbmVzLnB1c2goe1xuXHRcdFx0XHRcdGlkOiBicC5pZCxcblx0XHRcdFx0XHRlbmFibGVkOiBicC5lbmFibGVkLFxuXHRcdFx0XHRcdGNvbmRpdGlvbjogYnAuY29uZGl0aW9uLFxuXHRcdFx0XHRcdGhpdENvbmRpdGlvbjogYnAuaGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRcdGxvZ01lc3NhZ2U6IGJwLmxvZ01lc3NhZ2UsXG5cdFx0XHRcdFx0bGluZTogYnAubG9jYXRpb24ucmFuZ2Uuc3RhcnQubGluZSxcblx0XHRcdFx0XHRjaGFyYWN0ZXI6IGJwLmxvY2F0aW9uLnJhbmdlLnN0YXJ0LmNoYXJhY3Rlcixcblx0XHRcdFx0XHRtb2RlOiBicC5tb2RlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoYnAgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcblx0XHRcdFx0ZHRvcy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnZnVuY3Rpb24nLFxuXHRcdFx0XHRcdGlkOiBicC5pZCxcblx0XHRcdFx0XHRlbmFibGVkOiBicC5lbmFibGVkLFxuXHRcdFx0XHRcdGhpdENvbmRpdGlvbjogYnAuaGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRcdGxvZ01lc3NhZ2U6IGJwLmxvZ01lc3NhZ2UsXG5cdFx0XHRcdFx0Y29uZGl0aW9uOiBicC5jb25kaXRpb24sXG5cdFx0XHRcdFx0ZnVuY3Rpb25OYW1lOiBicC5mdW5jdGlvbk5hbWUsXG5cdFx0XHRcdFx0bW9kZTogYnAubW9kZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc2VuZCBEVE9zIHRvIFZTIENvZGVcblx0XHRyZXR1cm4gdGhpcy5fZGVidWdTZXJ2aWNlUHJveHkuJHJlZ2lzdGVyQnJlYWtwb2ludHMoZHRvcyk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludHMwOiB2c2NvZGUuQnJlYWtwb2ludFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gcmVtb3ZlIGZyb20gYXJyYXlcblx0XHRjb25zdCBicmVha3BvaW50cyA9IGJyZWFrcG9pbnRzMC5maWx0ZXIoYiA9PiB0aGlzLl9icmVha3BvaW50cy5kZWxldGUoYi5pZCkpO1xuXG5cdFx0Ly8gc2VuZCBub3RpZmljYXRpb25cblx0XHR0aGlzLmZpcmVCcmVha3BvaW50Q2hhbmdlcyhbXSwgYnJlYWtwb2ludHMsIFtdKTtcblxuXHRcdC8vIHVucmVnaXN0ZXIgd2l0aCBWUyBDb2RlXG5cdFx0Y29uc3QgaWRzID0gYnJlYWtwb2ludHMuZmlsdGVyKGJwID0+IGJwIGluc3RhbmNlb2YgU291cmNlQnJlYWtwb2ludCkubWFwKGJwID0+IGJwLmlkKTtcblx0XHRjb25zdCBmaWRzID0gYnJlYWtwb2ludHMuZmlsdGVyKGJwID0+IGJwIGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50KS5tYXAoYnAgPT4gYnAuaWQpO1xuXHRcdGNvbnN0IGRpZHMgPSBicmVha3BvaW50cy5maWx0ZXIoYnAgPT4gYnAgaW5zdGFuY2VvZiBEYXRhQnJlYWtwb2ludCkubWFwKGJwID0+IGJwLmlkKTtcblx0XHRyZXR1cm4gdGhpcy5fZGVidWdTZXJ2aWNlUHJveHkuJHVucmVnaXN0ZXJCcmVha3BvaW50cyhpZHMsIGZpZHMsIGRpZHMpO1xuXHR9XG5cblx0cHVibGljIHN0YXJ0RGVidWdnaW5nKGZvbGRlcjogdnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgbmFtZU9yQ29uZmlnOiBzdHJpbmcgfCB2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uLCBvcHRpb25zOiB2c2NvZGUuRGVidWdTZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHRlc3RSdW5NZXRhID0gb3B0aW9ucy50ZXN0UnVuICYmIHRoaXMuX3Rlc3RpbmcuZ2V0TWV0YWRhdGFGb3JSdW4ob3B0aW9ucy50ZXN0UnVuKTtcblxuXHRcdHJldHVybiB0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kc3RhcnREZWJ1Z2dpbmcoZm9sZGVyID8gZm9sZGVyLnVyaSA6IHVuZGVmaW5lZCwgbmFtZU9yQ29uZmlnLCB7XG5cdFx0XHRwYXJlbnRTZXNzaW9uSUQ6IG9wdGlvbnMucGFyZW50U2Vzc2lvbiA/IG9wdGlvbnMucGFyZW50U2Vzc2lvbi5pZCA6IHVuZGVmaW5lZCxcblx0XHRcdGxpZmVjeWNsZU1hbmFnZWRCeVBhcmVudDogb3B0aW9ucy5saWZlY3ljbGVNYW5hZ2VkQnlQYXJlbnQsXG5cdFx0XHRyZXBsOiBvcHRpb25zLmNvbnNvbGVNb2RlID09PSBEZWJ1Z0NvbnNvbGVNb2RlLk1lcmdlV2l0aFBhcmVudCA/ICdtZXJnZVdpdGhQYXJlbnQnIDogJ3NlcGFyYXRlJyxcblx0XHRcdG5vRGVidWc6IG9wdGlvbnMubm9EZWJ1Zyxcblx0XHRcdGNvbXBhY3Q6IG9wdGlvbnMuY29tcGFjdCxcblx0XHRcdHN1cHByZXNzU2F2ZUJlZm9yZVN0YXJ0OiBvcHRpb25zLnN1cHByZXNzU2F2ZUJlZm9yZVN0YXJ0LFxuXHRcdFx0dGVzdFJ1bjogdGVzdFJ1bk1ldGEgJiYge1xuXHRcdFx0XHRydW5JZDogdGVzdFJ1bk1ldGEucnVuSWQsXG5cdFx0XHRcdHRhc2tJZDogdGVzdFJ1bk1ldGEudGFza0lkLFxuXHRcdFx0fSxcblxuXHRcdFx0Ly8gQ2hlY2sgZGVidWdVSSBmb3IgYmFjay1jb21wYXQsICMxNDcyNjRcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0c3VwcHJlc3NEZWJ1Z1N0YXR1c2Jhcjogb3B0aW9ucy5zdXBwcmVzc0RlYnVnU3RhdHVzYmFyID8/IChvcHRpb25zIGFzIGFueSkuZGVidWdVST8uc2ltcGxlLFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRzdXBwcmVzc0RlYnVnVG9vbGJhcjogb3B0aW9ucy5zdXBwcmVzc0RlYnVnVG9vbGJhciA/PyAob3B0aW9ucyBhcyBhbnkpLmRlYnVnVUk/LnNpbXBsZSxcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0c3VwcHJlc3NEZWJ1Z1ZpZXc6IG9wdGlvbnMuc3VwcHJlc3NEZWJ1Z1ZpZXcgPz8gKG9wdGlvbnMgYXMgYW55KS5kZWJ1Z1VJPy5zaW1wbGUsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RvcERlYnVnZ2luZyhzZXNzaW9uPzogdnNjb2RlLkRlYnVnU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kc3RvcERlYnVnZ2luZyhzZXNzaW9uID8gc2Vzc2lvbi5pZCA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcih0eXBlOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIsIHRyaWdnZXI6IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIG5ldyBEaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fY29uZmlnUHJvdmlkZXJIYW5kbGVDb3VudGVyKys7XG5cdFx0dGhpcy5fY29uZmlnUHJvdmlkZXJzLnB1c2goeyB0eXBlLCBoYW5kbGUsIHByb3ZpZGVyIH0pO1xuXG5cdFx0dGhpcy5fZGVidWdTZXJ2aWNlUHJveHkuJHJlZ2lzdGVyRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIodHlwZSwgdHJpZ2dlcixcblx0XHRcdCEhcHJvdmlkZXIucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMsXG5cdFx0XHQhIXByb3ZpZGVyLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb24sXG5cdFx0XHQhIXByb3ZpZGVyLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMsXG5cdFx0XHRoYW5kbGUpO1xuXG5cdFx0cmV0dXJuIG5ldyBEaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2NvbmZpZ1Byb3ZpZGVycyA9IHRoaXMuX2NvbmZpZ1Byb3ZpZGVycy5maWx0ZXIocCA9PiBwLnByb3ZpZGVyICE9PSBwcm92aWRlcik7XHRcdC8vIHJlbW92ZVxuXHRcdFx0dGhpcy5fZGVidWdTZXJ2aWNlUHJveHkuJHVucmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcihoYW5kbGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHR5cGU6IHN0cmluZywgZmFjdG9yeTogdnNjb2RlLkRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXG5cdFx0aWYgKCFmYWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0XHR9XG5cblx0XHQvLyBhIERlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5IGNhbiBvbmx5IGJlIHJlZ2lzdGVyZWQgaW4gdGhlIGV4dGVuc2lvbiB0aGF0IGNvbnRyaWJ1dGVzIHRoZSBkZWJ1Z2dlclxuXHRcdGlmICghdGhpcy5kZWZpbmVzRGVidWdUeXBlKGV4dGVuc2lvbiwgdHlwZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgYSBEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSBjYW4gb25seSBiZSByZWdpc3RlcmVkIGZyb20gdGhlIGV4dGVuc2lvbiB0aGF0IGRlZmluZXMgdGhlICcke3R5cGV9JyBkZWJ1Z2dlci5gKTtcblx0XHR9XG5cblx0XHQvLyBtYWtlIHN1cmUgdGhhdCBvbmx5IG9uZSBmYWN0b3J5IGZvciB0aGlzIHR5cGUgaXMgcmVnaXN0ZXJlZFxuXHRcdGlmICh0aGlzLmdldEFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeUJ5VHlwZSh0eXBlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBhIERlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5IGNhbiBvbmx5IGJlIHJlZ2lzdGVyZWQgb25jZSBwZXIgYSB0eXBlLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkYXB0ZXJGYWN0b3J5SGFuZGxlQ291bnRlcisrO1xuXHRcdHRoaXMuX2FkYXB0ZXJGYWN0b3JpZXMucHVzaCh7IHR5cGUsIGhhbmRsZSwgZmFjdG9yeSB9KTtcblxuXHRcdHRoaXMuX2RlYnVnU2VydmljZVByb3h5LiRyZWdpc3RlckRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KHR5cGUsIGhhbmRsZSk7XG5cblx0XHRyZXR1cm4gbmV3IERpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYWRhcHRlckZhY3RvcmllcyA9IHRoaXMuX2FkYXB0ZXJGYWN0b3JpZXMuZmlsdGVyKHAgPT4gcC5mYWN0b3J5ICE9PSBmYWN0b3J5KTtcdFx0Ly8gcmVtb3ZlXG5cdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kdW5yZWdpc3RlckRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KGhhbmRsZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJUcmFja2VyRmFjdG9yeSh0eXBlOiBzdHJpbmcsIGZhY3Rvcnk6IHZzY29kZS5EZWJ1Z0FkYXB0ZXJUcmFja2VyRmFjdG9yeSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblxuXHRcdGlmICghZmFjdG9yeSkge1xuXHRcdFx0cmV0dXJuIG5ldyBEaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fdHJhY2tlckZhY3RvcnlIYW5kbGVDb3VudGVyKys7XG5cdFx0dGhpcy5fdHJhY2tlckZhY3Rvcmllcy5wdXNoKHsgdHlwZSwgaGFuZGxlLCBmYWN0b3J5IH0pO1xuXG5cdFx0cmV0dXJuIG5ldyBEaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3RyYWNrZXJGYWN0b3JpZXMgPSB0aGlzLl90cmFja2VyRmFjdG9yaWVzLmZpbHRlcihwID0+IHAuZmFjdG9yeSAhPT0gZmFjdG9yeSk7XHRcdC8vIHJlbW92ZVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gUlBDIG1ldGhvZHMgKEV4dEhvc3REZWJ1Z1NlcnZpY2VTaGFwZSlcblxuXHRwdWJsaWMgYXN5bmMgJHJ1bkluVGVybWluYWwoYXJnczogRGVidWdQcm90b2NvbC5SdW5JblRlcm1pbmFsUmVxdWVzdEFyZ3VtZW50cywgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkc3Vic3RpdHV0ZVZhcmlhYmxlcyhmb2xkZXJVcmk6IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQsIGNvbmZpZzogSUNvbmZpZyk6IFByb21pc2U8SUNvbmZpZz4ge1xuXHRcdGxldCB3czogSVdvcmtzcGFjZUZvbGRlckRhdGEgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZm9sZGVyID0gYXdhaXQgdGhpcy5nZXRGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHR3cyA9IHtcblx0XHRcdFx0dXJpOiBmb2xkZXIudXJpLFxuXHRcdFx0XHRuYW1lOiBmb2xkZXIubmFtZSxcblx0XHRcdFx0aW5kZXg6IGZvbGRlci5pbmRleCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IHZhcmlhYmxlUmVzb2x2ZXIgPSBhd2FpdCB0aGlzLl92YXJpYWJsZVJlc29sdmVyLmdldFJlc29sdmVyKCk7XG5cdFx0cmV0dXJuIHZhcmlhYmxlUmVzb2x2ZXIucmVzb2x2ZUFzeW5jKHdzLCBjb25maWcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZURlYnVnQWRhcHRlcihhZGFwdGVyOiB2c2NvZGUuRGVidWdBZGFwdGVyRGVzY3JpcHRvciwgc2Vzc2lvbjogRXh0SG9zdERlYnVnU2Vzc2lvbik6IEFic3RyYWN0RGVidWdBZGFwdGVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoYWRhcHRlciBpbnN0YW5jZW9mIERlYnVnQWRhcHRlcklubGluZUltcGxlbWVudGF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbmV3IERpcmVjdERlYnVnQWRhcHRlcihhZGFwdGVyLmltcGxlbWVudGF0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVTaWduU2VydmljZSgpOiBJU2lnblNlcnZpY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHN0YXJ0REFTZXNzaW9uKGRlYnVnQWRhcHRlckhhbmRsZTogbnVtYmVyLCBzZXNzaW9uRHRvOiBJRGVidWdTZXNzaW9uRHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbXl0aGlzID0gdGhpcztcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLmdldFNlc3Npb24oc2Vzc2lvbkR0byk7XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRBZGFwdGVyRGVzY3JpcHRvcih0aGlzLmdldEFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeUJ5VHlwZShzZXNzaW9uLnR5cGUpLCBzZXNzaW9uKS50aGVuKGRhRGVzY3JpcHRvciA9PiB7XG5cblx0XHRcdGlmICghZGFEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgZmluZCBhIGRlYnVnIGFkYXB0ZXIgZGVzY3JpcHRvciBmb3IgZGVidWcgdHlwZSAnJHtzZXNzaW9uLnR5cGV9JyAoZXh0ZW5zaW9uIG1pZ2h0IGhhdmUgZmFpbGVkIHRvIGFjdGl2YXRlKWApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkYSA9IHRoaXMuY3JlYXRlRGVidWdBZGFwdGVyKGRhRGVzY3JpcHRvciwgc2Vzc2lvbik7XG5cdFx0XHRpZiAoIWRhKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgY3JlYXRlIGEgZGVidWcgYWRhcHRlciBmb3IgdHlwZSAnJHtzZXNzaW9uLnR5cGV9Jy5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVidWdBZGFwdGVyID0gZGE7XG5cblx0XHRcdHRoaXMuX2RlYnVnQWRhcHRlcnMuc2V0KGRlYnVnQWRhcHRlckhhbmRsZSwgZGVidWdBZGFwdGVyKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0RGVidWdBZGFwdGVyVHJhY2tlcnMoc2Vzc2lvbikudGhlbih0cmFja2VyID0+IHtcblxuXHRcdFx0XHRpZiAodHJhY2tlcikge1xuXHRcdFx0XHRcdHRoaXMuX2RlYnVnQWRhcHRlcnNUcmFja2Vycy5zZXQoZGVidWdBZGFwdGVySGFuZGxlLCB0cmFja2VyKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRlYnVnQWRhcHRlci5vbk1lc3NhZ2UoYXN5bmMgbWVzc2FnZSA9PiB7XG5cblx0XHRcdFx0XHRpZiAobWVzc2FnZS50eXBlID09PSAncmVxdWVzdCcgJiYgKDxEZWJ1Z1Byb3RvY29sLlJlcXVlc3Q+bWVzc2FnZSkuY29tbWFuZCA9PT0gJ2hhbmRzaGFrZScpIHtcblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IDxEZWJ1Z1Byb3RvY29sLlJlcXVlc3Q+bWVzc2FnZTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuUmVzcG9uc2UgPSB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdyZXNwb25zZScsXG5cdFx0XHRcdFx0XHRcdHNlcTogMCxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDogcmVxdWVzdC5jb21tYW5kLFxuXHRcdFx0XHRcdFx0XHRyZXF1ZXN0X3NlcTogcmVxdWVzdC5zZXEsXG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWVcblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdGlmICghdGhpcy5fc2lnblNlcnZpY2UpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fc2lnblNlcnZpY2UgPSB0aGlzLmNyZWF0ZVNpZ25TZXJ2aWNlKCk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLl9zaWduU2VydmljZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHNpZ25hdHVyZSA9IGF3YWl0IHRoaXMuX3NpZ25TZXJ2aWNlLnNpZ24ocmVxdWVzdC5hcmd1bWVudHMudmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdHJlc3BvbnNlLmJvZHkgPSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzaWduYXR1cmU6IHNpZ25hdHVyZVxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdFx0ZGVidWdBZGFwdGVyLnNlbmRSZXNwb25zZShyZXNwb25zZSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdubyBzaWduZXInKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHRyZXNwb25zZS5zdWNjZXNzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdHJlc3BvbnNlLm1lc3NhZ2UgPSBlLm1lc3NhZ2U7XG5cdFx0XHRcdFx0XHRcdGRlYnVnQWRhcHRlci5zZW5kUmVzcG9uc2UocmVzcG9uc2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpZiAodHJhY2tlciAmJiB0cmFja2VyLm9uRGlkU2VuZE1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0dHJhY2tlci5vbkRpZFNlbmRNZXNzYWdlKG1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBEQSAtPiBWUyBDb2RlXG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHQvLyBUcnkgdG8gY2F0Y2ggZGV0YWlscyBmb3IgIzIzMzE2N1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gY29udmVydFRvVlNDUGF0aHMobWVzc2FnZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdFx0XHRjb25zdCB0eXBlID0gbWVzc2FnZS50eXBlICsgJ18nICsgKChtZXNzYWdlIGFzIGFueSkuY29tbWFuZCA/PyAobWVzc2FnZSBhcyBhbnkpLmV2ZW50ID8/ICcnKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5UHJveHkuJHB1YmxpY0xvZzI8RGVidWdQcm90b2NvbE1lc3NhZ2VFcnJvckV2ZW50LCBEZWJ1Z1Byb3RvY29sTWVzc2FnZUVycm9yQ2xhc3NpZmljYXRpb24+KCdkZWJ1Z1Byb3RvY29sTWVzc2FnZUVycm9yJywgeyB0eXBlLCBmcm9tOiBzZXNzaW9uLnR5cGUgfSk7XG5cdFx0XHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdG15dGhpcy5fZGVidWdTZXJ2aWNlUHJveHkuJGFjY2VwdERBTWVzc2FnZShkZWJ1Z0FkYXB0ZXJIYW5kbGUsIG1lc3NhZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlYnVnQWRhcHRlci5vbkVycm9yKGVyciA9PiB7XG5cdFx0XHRcdFx0aWYgKHRyYWNrZXIgJiYgdHJhY2tlci5vbkVycm9yKSB7XG5cdFx0XHRcdFx0XHR0cmFja2VyLm9uRXJyb3IoZXJyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fZGVidWdTZXJ2aWNlUHJveHkuJGFjY2VwdERBRXJyb3IoZGVidWdBZGFwdGVySGFuZGxlLCBlcnIubmFtZSwgZXJyLm1lc3NhZ2UsIGVyci5zdGFjayk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWJ1Z0FkYXB0ZXIub25FeGl0KChjb2RlOiBudW1iZXIgfCBudWxsKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRyYWNrZXIgJiYgdHJhY2tlci5vbkV4aXQpIHtcblx0XHRcdFx0XHRcdHRyYWNrZXIub25FeGl0KGNvZGUgPz8gdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2VQcm94eS4kYWNjZXB0REFFeGl0KGRlYnVnQWRhcHRlckhhbmRsZSwgY29kZSA/PyB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmICh0cmFja2VyICYmIHRyYWNrZXIub25XaWxsU3RhcnRTZXNzaW9uKSB7XG5cdFx0XHRcdFx0dHJhY2tlci5vbldpbGxTdGFydFNlc3Npb24oKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBkZWJ1Z0FkYXB0ZXIuc3RhcnRTZXNzaW9uKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyAkc2VuZERBTWVzc2FnZShkZWJ1Z0FkYXB0ZXJIYW5kbGU6IG51bWJlciwgbWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblxuXHRcdC8vIFZTIENvZGUgLT4gREFcblx0XHRtZXNzYWdlID0gY29udmVydFRvREFQYXRocyhtZXNzYWdlLCBmYWxzZSk7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGhpcy5fZGVidWdBZGFwdGVyc1RyYWNrZXJzLmdldChkZWJ1Z0FkYXB0ZXJIYW5kbGUpO1x0Ly8gVE9ET0BBVzogc2FtZSBoYW5kbGU/XG5cdFx0aWYgKHRyYWNrZXIgJiYgdHJhY2tlci5vbldpbGxSZWNlaXZlTWVzc2FnZSkge1xuXHRcdFx0dHJhY2tlci5vbldpbGxSZWNlaXZlTWVzc2FnZShtZXNzYWdlKTtcblx0XHR9XG5cblx0XHRjb25zdCBkYSA9IHRoaXMuX2RlYnVnQWRhcHRlcnMuZ2V0KGRlYnVnQWRhcHRlckhhbmRsZSk7XG5cdFx0ZGE/LnNlbmRNZXNzYWdlKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljICRzdG9wREFTZXNzaW9uKGRlYnVnQWRhcHRlckhhbmRsZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCB0cmFja2VyID0gdGhpcy5fZGVidWdBZGFwdGVyc1RyYWNrZXJzLmdldChkZWJ1Z0FkYXB0ZXJIYW5kbGUpO1xuXHRcdHRoaXMuX2RlYnVnQWRhcHRlcnNUcmFja2Vycy5kZWxldGUoZGVidWdBZGFwdGVySGFuZGxlKTtcblx0XHRpZiAodHJhY2tlciAmJiB0cmFja2VyLm9uV2lsbFN0b3BTZXNzaW9uKSB7XG5cdFx0XHR0cmFja2VyLm9uV2lsbFN0b3BTZXNzaW9uKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGEgPSB0aGlzLl9kZWJ1Z0FkYXB0ZXJzLmdldChkZWJ1Z0FkYXB0ZXJIYW5kbGUpO1xuXHRcdHRoaXMuX2RlYnVnQWRhcHRlcnMuZGVsZXRlKGRlYnVnQWRhcHRlckhhbmRsZSk7XG5cdFx0aWYgKGRhKSB7XG5cdFx0XHRyZXR1cm4gZGEuc3RvcFNlc3Npb24oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh2b2lkIDApO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0QnJlYWtwb2ludHNEZWx0YShkZWx0YTogSUJyZWFrcG9pbnRzRGVsdGFEdG8pOiB2b2lkIHtcblxuXHRcdGNvbnN0IGE6IHZzY29kZS5CcmVha3BvaW50W10gPSBbXTtcblx0XHRjb25zdCByOiB2c2NvZGUuQnJlYWtwb2ludFtdID0gW107XG5cdFx0Y29uc3QgYzogdnNjb2RlLkJyZWFrcG9pbnRbXSA9IFtdO1xuXG5cdFx0aWYgKGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGJwZCBvZiBkZWx0YS5hZGRlZCkge1xuXHRcdFx0XHRjb25zdCBpZCA9IGJwZC5pZDtcblx0XHRcdFx0aWYgKGlkICYmICF0aGlzLl9icmVha3BvaW50cy5oYXMoaWQpKSB7XG5cdFx0XHRcdFx0bGV0IGJwOiBCcmVha3BvaW50O1xuXHRcdFx0XHRcdGlmIChicGQudHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0YnAgPSBuZXcgRnVuY3Rpb25CcmVha3BvaW50KGJwZC5mdW5jdGlvbk5hbWUsIGJwZC5lbmFibGVkLCBicGQuY29uZGl0aW9uLCBicGQuaGl0Q29uZGl0aW9uLCBicGQubG9nTWVzc2FnZSwgYnBkLm1vZGUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYnBkLnR5cGUgPT09ICdkYXRhJykge1xuXHRcdFx0XHRcdFx0YnAgPSBuZXcgRGF0YUJyZWFrcG9pbnQoYnBkLmxhYmVsLCBicGQuZGF0YUlkLCBicGQuY2FuUGVyc2lzdCwgYnBkLmVuYWJsZWQsIGJwZC5oaXRDb25kaXRpb24sIGJwZC5jb25kaXRpb24sIGJwZC5sb2dNZXNzYWdlLCBicGQubW9kZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUoYnBkLnVyaSk7XG5cdFx0XHRcdFx0XHRicCA9IG5ldyBTb3VyY2VCcmVha3BvaW50KG5ldyBMb2NhdGlvbih1cmksIG5ldyBQb3NpdGlvbihicGQubGluZSwgYnBkLmNoYXJhY3RlcikpLCBicGQuZW5hYmxlZCwgYnBkLmNvbmRpdGlvbiwgYnBkLmhpdENvbmRpdGlvbiwgYnBkLmxvZ01lc3NhZ2UsIGJwZC5tb2RlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2V0QnJlYWtwb2ludElkKGJwLCBpZCk7XG5cdFx0XHRcdFx0dGhpcy5fYnJlYWtwb2ludHMuc2V0KGlkLCBicCk7XG5cdFx0XHRcdFx0YS5wdXNoKGJwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0Y29uc3QgYnAgPSB0aGlzLl9icmVha3BvaW50cy5nZXQoaWQpO1xuXHRcdFx0XHRpZiAoYnApIHtcblx0XHRcdFx0XHR0aGlzLl9icmVha3BvaW50cy5kZWxldGUoaWQpO1xuXHRcdFx0XHRcdHIucHVzaChicCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGVsdGEuY2hhbmdlZCkge1xuXHRcdFx0Zm9yIChjb25zdCBicGQgb2YgZGVsdGEuY2hhbmdlZCkge1xuXHRcdFx0XHRpZiAoYnBkLmlkKSB7XG5cdFx0XHRcdFx0Y29uc3QgYnAgPSB0aGlzLl9icmVha3BvaW50cy5nZXQoYnBkLmlkKTtcblx0XHRcdFx0XHRpZiAoYnApIHtcblx0XHRcdFx0XHRcdGlmIChicCBpbnN0YW5jZW9mIEZ1bmN0aW9uQnJlYWtwb2ludCAmJiBicGQudHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRcdFx0Y29uc3QgZmJwID0gPGFueT5icDtcblx0XHRcdFx0XHRcdFx0ZmJwLmVuYWJsZWQgPSBicGQuZW5hYmxlZDtcblx0XHRcdFx0XHRcdFx0ZmJwLmNvbmRpdGlvbiA9IGJwZC5jb25kaXRpb247XG5cdFx0XHRcdFx0XHRcdGZicC5oaXRDb25kaXRpb24gPSBicGQuaGl0Q29uZGl0aW9uO1xuXHRcdFx0XHRcdFx0XHRmYnAubG9nTWVzc2FnZSA9IGJwZC5sb2dNZXNzYWdlO1xuXHRcdFx0XHRcdFx0XHRmYnAuZnVuY3Rpb25OYW1lID0gYnBkLmZ1bmN0aW9uTmFtZTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoYnAgaW5zdGFuY2VvZiBTb3VyY2VCcmVha3BvaW50ICYmIGJwZC50eXBlID09PSAnc291cmNlJykge1xuXHRcdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2JwID0gPGFueT5icDtcblx0XHRcdFx0XHRcdFx0c2JwLmVuYWJsZWQgPSBicGQuZW5hYmxlZDtcblx0XHRcdFx0XHRcdFx0c2JwLmNvbmRpdGlvbiA9IGJwZC5jb25kaXRpb247XG5cdFx0XHRcdFx0XHRcdHNicC5oaXRDb25kaXRpb24gPSBicGQuaGl0Q29uZGl0aW9uO1xuXHRcdFx0XHRcdFx0XHRzYnAubG9nTWVzc2FnZSA9IGJwZC5sb2dNZXNzYWdlO1xuXHRcdFx0XHRcdFx0XHRzYnAubG9jYXRpb24gPSBuZXcgTG9jYXRpb24oVVJJLnJldml2ZShicGQudXJpKSwgbmV3IFBvc2l0aW9uKGJwZC5saW5lLCBicGQuY2hhcmFjdGVyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjLnB1c2goYnApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZmlyZUJyZWFrcG9pbnRDaGFuZ2VzKGEsIHIsIGMpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHRTdGFja0ZyYW1lRm9jdXMoZm9jdXNEdG86IElUaHJlYWRGb2N1c0R0byB8IElTdGFja0ZyYW1lRm9jdXNEdG8gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZm9jdXM6IHZzY29kZS5EZWJ1Z1RocmVhZCB8IHZzY29kZS5EZWJ1Z1N0YWNrRnJhbWUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGZvY3VzRHRvKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRTZXNzaW9uKGZvY3VzRHRvLnNlc3Npb25JZCk7XG5cdFx0XHRpZiAoZm9jdXNEdG8ua2luZCA9PT0gJ3RocmVhZCcpIHtcblx0XHRcdFx0Zm9jdXMgPSBuZXcgRGVidWdUaHJlYWQoc2Vzc2lvbi5hcGksIGZvY3VzRHRvLnRocmVhZElkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvY3VzID0gbmV3IERlYnVnU3RhY2tGcmFtZShzZXNzaW9uLmFwaSwgZm9jdXNEdG8udGhyZWFkSWQsIGZvY3VzRHRvLmZyYW1lSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2FjdGl2ZVN0YWNrSXRlbSA9IGZvY3VzO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlU3RhY2tJdGVtLmZpcmUodGhpcy5fYWN0aXZlU3RhY2tJdGVtKTtcblx0fVxuXG5cdHB1YmxpYyAkcHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMoY29uZmlnUHJvdmlkZXJIYW5kbGU6IG51bWJlciwgZm9sZGVyVXJpOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb25bXT4ge1xuXHRcdHJldHVybiBhc1Byb21pc2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmdldENvbmZpZ1Byb3ZpZGVyQnlIYW5kbGUoY29uZmlnUHJvdmlkZXJIYW5kbGUpO1xuXHRcdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vIERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyIGZvdW5kJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByb3ZpZGVyLnByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIgaGFzIG5vIG1ldGhvZCBwcm92aWRlRGVidWdDb25maWd1cmF0aW9ucycpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9sZGVyID0gYXdhaXQgdGhpcy5nZXRGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyhmb2xkZXIsIHRva2VuKTtcblx0XHR9KS50aGVuKGRlYnVnQ29uZmlndXJhdGlvbnMgPT4ge1xuXHRcdFx0aWYgKCFkZWJ1Z0NvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm90aGluZyByZXR1cm5lZCBmcm9tIERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyLnByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGVidWdDb25maWd1cmF0aW9ucztcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyAkcmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbihjb25maWdQcm92aWRlckhhbmRsZTogbnVtYmVyLCBmb2xkZXJVcmk6IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQsIGRlYnVnQ29uZmlndXJhdGlvbjogdnNjb2RlLkRlYnVnQ29uZmlndXJhdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uIHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBhc1Byb21pc2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmdldENvbmZpZ1Byb3ZpZGVyQnlIYW5kbGUoY29uZmlnUHJvdmlkZXJIYW5kbGUpO1xuXHRcdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vIERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyIGZvdW5kJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByb3ZpZGVyLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciBoYXMgbm8gbWV0aG9kIHJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb24nKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IHRoaXMuZ2V0Rm9sZGVyKGZvbGRlclVyaSk7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXIucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbihmb2xkZXIsIGRlYnVnQ29uZmlndXJhdGlvbiwgdG9rZW4pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljICRyZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzKGNvbmZpZ1Byb3ZpZGVySGFuZGxlOiBudW1iZXIsIGZvbGRlclVyaTogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZCwgZGVidWdDb25maWd1cmF0aW9uOiB2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb24gfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIGFzUHJvbWlzZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZ2V0Q29uZmlnUHJvdmlkZXJCeUhhbmRsZShjb25maWdQcm92aWRlckhhbmRsZSk7XG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignbm8gRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIgZm91bmQnKTtcblx0XHRcdH1cblx0XHRcdGlmICghcHJvdmlkZXIucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbldpdGhTdWJzdGl0dXRlZFZhcmlhYmxlcykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0RlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyIGhhcyBubyBtZXRob2QgcmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbldpdGhTdWJzdGl0dXRlZFZhcmlhYmxlcycpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9sZGVyID0gYXdhaXQgdGhpcy5nZXRGb2xkZXIoZm9sZGVyVXJpKTtcblx0XHRcdHJldHVybiBwcm92aWRlci5yZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzKGZvbGRlciwgZGVidWdDb25maWd1cmF0aW9uLCB0b2tlbik7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHByb3ZpZGVEZWJ1Z0FkYXB0ZXIoYWRhcHRlckZhY3RvcnlIYW5kbGU6IG51bWJlciwgc2Vzc2lvbkR0bzogSURlYnVnU2Vzc2lvbkR0byk6IFByb21pc2U8RHRvPElBZGFwdGVyRGVzY3JpcHRvcj4+IHtcblx0XHRjb25zdCBhZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkgPSB0aGlzLmdldEFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeUJ5SGFuZGxlKGFkYXB0ZXJGYWN0b3J5SGFuZGxlKTtcblx0XHRpZiAoIWFkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignbm8gYWRhcHRlciBkZXNjcmlwdG9yIGZhY3RvcnkgZm91bmQgZm9yIGhhbmRsZScpKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbihzZXNzaW9uRHRvKTtcblx0XHRyZXR1cm4gdGhpcy5nZXRBZGFwdGVyRGVzY3JpcHRvcihhZGFwdGVyRGVzY3JpcHRvckZhY3RvcnksIHNlc3Npb24pLnRoZW4oYWRhcHRlckRlc2NyaXB0b3IgPT4ge1xuXHRcdFx0aWYgKCFhZGFwdGVyRGVzY3JpcHRvcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgYSBkZWJ1ZyBhZGFwdGVyIGRlc2NyaXB0b3IgZm9yIGRlYnVnIHR5cGUgJyR7c2Vzc2lvbi50eXBlfSdgKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmNvbnZlcnRUb0R0byhhZGFwdGVyRGVzY3JpcHRvcik7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGFjY2VwdERlYnVnU2Vzc2lvblN0YXJ0ZWQoc2Vzc2lvbkR0bzogSURlYnVnU2Vzc2lvbkR0byk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLmdldFNlc3Npb24oc2Vzc2lvbkR0byk7XG5cdFx0dGhpcy5fb25EaWRTdGFydERlYnVnU2Vzc2lvbi5maXJlKHNlc3Npb24uYXBpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkYWNjZXB0RGVidWdTZXNzaW9uVGVybWluYXRlZChzZXNzaW9uRHRvOiBJRGVidWdTZXNzaW9uRHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbihzZXNzaW9uRHRvKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fb25EaWRUZXJtaW5hdGVEZWJ1Z1Nlc3Npb24uZmlyZShzZXNzaW9uLmFwaSk7XG5cdFx0XHR0aGlzLl9kZWJ1Z1Nlc3Npb25zLmRlbGV0ZShzZXNzaW9uLmlkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGFjY2VwdERlYnVnU2Vzc2lvbkFjdGl2ZUNoYW5nZWQoc2Vzc2lvbkR0bzogSURlYnVnU2Vzc2lvbkR0byB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2FjdGl2ZURlYnVnU2Vzc2lvbiA9IHNlc3Npb25EdG8gPyBhd2FpdCB0aGlzLmdldFNlc3Npb24oc2Vzc2lvbkR0bykgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVEZWJ1Z1Nlc3Npb24uZmlyZSh0aGlzLl9hY3RpdmVEZWJ1Z1Nlc3Npb24/LmFwaSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGFjY2VwdERlYnVnU2Vzc2lvbk5hbWVDaGFuZ2VkKHNlc3Npb25EdG86IElEZWJ1Z1Nlc3Npb25EdG8sIG5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLmdldFNlc3Npb24oc2Vzc2lvbkR0byk7XG5cdFx0c2Vzc2lvbj8uX2FjY2VwdE5hbWVDaGFuZ2VkKG5hbWUpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRhY2NlcHREZWJ1Z1Nlc3Npb25DdXN0b21FdmVudChzZXNzaW9uRHRvOiBJRGVidWdTZXNzaW9uRHRvLCBldmVudDogYW55KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuZ2V0U2Vzc2lvbihzZXNzaW9uRHRvKTtcblx0XHRjb25zdCBlZTogdnNjb2RlLkRlYnVnU2Vzc2lvbkN1c3RvbUV2ZW50ID0ge1xuXHRcdFx0c2Vzc2lvbjogc2Vzc2lvbi5hcGksXG5cdFx0XHRldmVudDogZXZlbnQuZXZlbnQsXG5cdFx0XHRib2R5OiBldmVudC5ib2R5XG5cdFx0fTtcblx0XHR0aGlzLl9vbkRpZFJlY2VpdmVEZWJ1Z1Nlc3Npb25DdXN0b21FdmVudC5maXJlKGVlKTtcblx0fVxuXG5cdC8vIHByaXZhdGUgJiBkdG8gaGVscGVyc1xuXG5cdHByaXZhdGUgY29udmVydFRvRHRvKHg6IHZzY29kZS5EZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yKTogRHRvPElBZGFwdGVyRGVzY3JpcHRvcj4ge1xuXHRcdGlmICh4IGluc3RhbmNlb2YgRGVidWdBZGFwdGVyRXhlY3V0YWJsZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29udmVydEV4ZWN1dGFibGVUb0R0byh4KTtcblx0XHR9IGVsc2UgaWYgKHggaW5zdGFuY2VvZiBEZWJ1Z0FkYXB0ZXJTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmNvbnZlcnRTZXJ2ZXJUb0R0byh4KTtcblx0XHR9IGVsc2UgaWYgKHggaW5zdGFuY2VvZiBEZWJ1Z0FkYXB0ZXJOYW1lZFBpcGVTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmNvbnZlcnRQaXBlU2VydmVyVG9EdG8oeCk7XG5cdFx0fSBlbHNlIGlmICh4IGluc3RhbmNlb2YgRGVidWdBZGFwdGVySW5saW5lSW1wbGVtZW50YXRpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmNvbnZlcnRJbXBsZW1lbnRhdGlvblRvRHRvKHgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NvbnZlcnRUb0R0byB1bmV4cGVjdGVkIHR5cGUnKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29udmVydEV4ZWN1dGFibGVUb0R0byh4OiBEZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlKTogSURlYnVnQWRhcHRlckV4ZWN1dGFibGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnZXhlY3V0YWJsZScsXG5cdFx0XHRjb21tYW5kOiB4LmNvbW1hbmQsXG5cdFx0XHRhcmdzOiB4LmFyZ3MsXG5cdFx0XHRvcHRpb25zOiB4Lm9wdGlvbnNcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbnZlcnRTZXJ2ZXJUb0R0byh4OiBEZWJ1Z0FkYXB0ZXJTZXJ2ZXIpOiBJRGVidWdBZGFwdGVyU2VydmVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3NlcnZlcicsXG5cdFx0XHRwb3J0OiB4LnBvcnQsXG5cdFx0XHRob3N0OiB4Lmhvc3Rcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbnZlcnRQaXBlU2VydmVyVG9EdG8oeDogRGVidWdBZGFwdGVyTmFtZWRQaXBlU2VydmVyKTogSURlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdwaXBlU2VydmVyJyxcblx0XHRcdHBhdGg6IHgucGF0aFxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29udmVydEltcGxlbWVudGF0aW9uVG9EdG8oeDogRGVidWdBZGFwdGVySW5saW5lSW1wbGVtZW50YXRpb24pOiBJRGVidWdBZGFwdGVySW1wbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdpbXBsZW1lbnRhdGlvbicsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5QnlUeXBlKHR5cGU6IHN0cmluZyk6IHZzY29kZS5EZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHRoaXMuX2FkYXB0ZXJGYWN0b3JpZXMuZmlsdGVyKHAgPT4gcC50eXBlID09PSB0eXBlKTtcblx0XHRpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0c1swXS5mYWN0b3J5O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnlCeUhhbmRsZShoYW5kbGU6IG51bWJlcik6IHZzY29kZS5EZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHRoaXMuX2FkYXB0ZXJGYWN0b3JpZXMuZmlsdGVyKHAgPT4gcC5oYW5kbGUgPT09IGhhbmRsZSk7XG5cdFx0aWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdHNbMF0uZmFjdG9yeTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlnUHJvdmlkZXJCeUhhbmRsZShoYW5kbGU6IG51bWJlcik6IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHRoaXMuX2NvbmZpZ1Byb3ZpZGVycy5maWx0ZXIocCA9PiBwLmhhbmRsZSA9PT0gaGFuZGxlKTtcblx0XHRpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0c1swXS5wcm92aWRlcjtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZGVmaW5lc0RlYnVnVHlwZShlZDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB0eXBlOiBzdHJpbmcpIHtcblx0XHRpZiAoZWQuY29udHJpYnV0ZXMpIHtcblx0XHRcdGNvbnN0IGRlYnVnZ2VycyA9IGVkLmNvbnRyaWJ1dGVzWydkZWJ1Z2dlcnMnXTtcblx0XHRcdGlmIChkZWJ1Z2dlcnMgJiYgZGVidWdnZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Zm9yIChjb25zdCBkYmcgb2YgZGVidWdnZXJzKSB7XG5cdFx0XHRcdFx0Ly8gb25seSBkZWJ1Z2dlciBjb250cmlidXRpb25zIHdpdGggYSBcImxhYmVsXCIgYXJlIGNvbnNpZGVyZWQgYSBcImRlZmluaW5nXCIgZGVidWdnZXIgY29udHJpYnV0aW9uXG5cdFx0XHRcdFx0aWYgKGRiZy5sYWJlbCAmJiBkYmcudHlwZSkge1xuXHRcdFx0XHRcdFx0aWYgKGRiZy50eXBlID09PSB0eXBlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldERlYnVnQWRhcHRlclRyYWNrZXJzKHNlc3Npb246IEV4dEhvc3REZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPHZzY29kZS5EZWJ1Z0FkYXB0ZXJUcmFja2VyIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBjb25maWcgPSBzZXNzaW9uLmNvbmZpZ3VyYXRpb247XG5cdFx0Y29uc3QgdHlwZSA9IGNvbmZpZy50eXBlO1xuXG5cdFx0Y29uc3QgcHJvbWlzZXMgPSB0aGlzLl90cmFja2VyRmFjdG9yaWVzXG5cdFx0XHQuZmlsdGVyKHR1cGxlID0+IHR1cGxlLnR5cGUgPT09IHR5cGUgfHwgdHVwbGUudHlwZSA9PT0gJyonKVxuXHRcdFx0Lm1hcCh0dXBsZSA9PiBhc1Byb21pc2U8dnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5EZWJ1Z0FkYXB0ZXJUcmFja2VyPj4oKCkgPT4gdHVwbGUuZmFjdG9yeS5jcmVhdGVEZWJ1Z0FkYXB0ZXJUcmFja2VyKHNlc3Npb24uYXBpKSkudGhlbihwID0+IHAsIGVyciA9PiBudWxsKSk7XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yYWNlKFtcblx0XHRcdFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdGNvbnN0IHRyYWNrZXJzID0gY29hbGVzY2UocmVzdWx0KTtcdC8vIGZpbHRlciBudWxsXG5cdFx0XHRcdGlmICh0cmFja2Vycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBNdWx0aVRyYWNrZXIodHJhY2tlcnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9KSxcblx0XHRcdG5ldyBQcm9taXNlPHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KCgpID0+IHJlc29sdmUodW5kZWZpbmVkKSwgMTAwMCkpLFxuXHRcdF0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHQvLyBpZ25vcmUgZXJyb3JzXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRBZGFwdGVyRGVzY3JpcHRvcihhZGFwdGVyRGVzY3JpcHRvckZhY3Rvcnk6IHZzY29kZS5EZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSB8IHVuZGVmaW5lZCwgc2Vzc2lvbjogRXh0SG9zdERlYnVnU2Vzc2lvbik6IFByb21pc2U8dnNjb2RlLkRlYnVnQWRhcHRlckRlc2NyaXB0b3IgfCB1bmRlZmluZWQ+IHtcblxuXHRcdC8vIGEgXCJkZWJ1Z1NlcnZlclwiIGF0dHJpYnV0ZSBpbiB0aGUgbGF1bmNoIGNvbmZpZyB0YWtlcyBwcmVjZWRlbmNlXG5cdFx0Y29uc3Qgc2VydmVyUG9ydCA9IHNlc3Npb24uY29uZmlndXJhdGlvbi5kZWJ1Z1NlcnZlcjtcblx0XHRpZiAodHlwZW9mIHNlcnZlclBvcnQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5ldyBEZWJ1Z0FkYXB0ZXJTZXJ2ZXIoc2VydmVyUG9ydCkpO1xuXHRcdH1cblxuXHRcdGlmIChhZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvblJlZ2lzdHJ5ID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25SZWdpc3RyeSgpO1xuXHRcdFx0cmV0dXJuIGFzUHJvbWlzZSgoKSA9PiBhZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkuY3JlYXRlRGVidWdBZGFwdGVyRGVzY3JpcHRvcihzZXNzaW9uLmFwaSwgdGhpcy5kYUV4ZWN1dGFibGVGcm9tUGFja2FnZShzZXNzaW9uLCBleHRlbnNpb25SZWdpc3RyeSkpKS50aGVuKGRhRGVzY3JpcHRvciA9PiB7XG5cdFx0XHRcdGlmIChkYURlc2NyaXB0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gZGFEZXNjcmlwdG9yO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBmYWxsYmFjazogdXNlIGV4ZWN1dGFibGUgaW5mb3JtYXRpb24gZnJvbSBwYWNrYWdlLmpzb25cblx0XHRjb25zdCBleHRlbnNpb25SZWdpc3RyeSA9IGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uUmVnaXN0cnkoKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuZGFFeGVjdXRhYmxlRnJvbVBhY2thZ2Uoc2Vzc2lvbiwgZXh0ZW5zaW9uUmVnaXN0cnkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBkYUV4ZWN1dGFibGVGcm9tUGFja2FnZShzZXNzaW9uOiBFeHRIb3N0RGVidWdTZXNzaW9uLCBleHRlbnNpb25SZWdpc3RyeTogRXh0ZW5zaW9uRGVzY3JpcHRpb25SZWdpc3RyeSk6IERlYnVnQWRhcHRlckV4ZWN1dGFibGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGZpcmVCcmVha3BvaW50Q2hhbmdlcyhhZGRlZDogdnNjb2RlLkJyZWFrcG9pbnRbXSwgcmVtb3ZlZDogdnNjb2RlLkJyZWFrcG9pbnRbXSwgY2hhbmdlZDogdnNjb2RlLkJyZWFrcG9pbnRbXSkge1xuXHRcdGlmIChhZGRlZC5sZW5ndGggPiAwIHx8IHJlbW92ZWQubGVuZ3RoID4gMCB8fCBjaGFuZ2VkLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJlYWtwb2ludHMuZmlyZShPYmplY3QuZnJlZXplKHtcblx0XHRcdFx0YWRkZWQsXG5cdFx0XHRcdHJlbW92ZWQsXG5cdFx0XHRcdGNoYW5nZWQsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTZXNzaW9uKGR0bzogSURlYnVnU2Vzc2lvbkR0byk6IFByb21pc2U8RXh0SG9zdERlYnVnU2Vzc2lvbj4ge1xuXHRcdGlmIChkdG8pIHtcblx0XHRcdGlmICh0eXBlb2YgZHRvID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCBkcyA9IHRoaXMuX2RlYnVnU2Vzc2lvbnMuZ2V0KGR0byk7XG5cdFx0XHRcdGlmIChkcykge1xuXHRcdFx0XHRcdHJldHVybiBkcztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGRzID0gdGhpcy5fZGVidWdTZXNzaW9ucy5nZXQoZHRvLmlkKTtcblx0XHRcdFx0aWYgKCFkcykge1xuXHRcdFx0XHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IHRoaXMuZ2V0Rm9sZGVyKGR0by5mb2xkZXJVcmkpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcmVudCA9IGR0by5wYXJlbnQgPyB0aGlzLl9kZWJ1Z1Nlc3Npb25zLmdldChkdG8ucGFyZW50KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRkcyA9IG5ldyBFeHRIb3N0RGVidWdTZXNzaW9uKHRoaXMuX2RlYnVnU2VydmljZVByb3h5LCBkdG8uaWQsIGR0by50eXBlLCBkdG8ubmFtZSwgZm9sZGVyLCBkdG8uY29uZmlndXJhdGlvbiwgcGFyZW50Py5hcGkpO1xuXHRcdFx0XHRcdHRoaXMuX2RlYnVnU2Vzc2lvbnMuc2V0KGRzLmlkLCBkcyk7XG5cdFx0XHRcdFx0dGhpcy5fZGVidWdTZXJ2aWNlUHJveHkuJHNlc3Npb25DYWNoZWQoZHMuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBkcztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdjYW5ub3QgZmluZCBzZXNzaW9uJyk7XG5cdH1cblxuXHRwcml2YXRlIGdldEZvbGRlcihfZm9sZGVyVXJpOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKF9mb2xkZXJVcmkpIHtcblx0XHRcdGNvbnN0IGZvbGRlclVSSSA9IFVSSS5yZXZpdmUoX2ZvbGRlclVyaSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlU2VydmljZS5yZXNvbHZlV29ya3NwYWNlRm9sZGVyKGZvbGRlclVSSSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgZXh0ZW5zaW9uVmlzS2V5KGV4dGVuc2lvbklkOiBzdHJpbmcsIGlkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gYCR7ZXh0ZW5zaW9uSWR9XFwwJHtpZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXJpYWxpemVWaXN1YWxpemF0aW9uKGV4dGVuc2lvbklkOiBzdHJpbmcsIHZpejogdnNjb2RlLkRlYnVnVmlzdWFsaXphdGlvblsndmlzdWFsaXphdGlvbiddKTogTWFpblRocmVhZERlYnVnVmlzdWFsaXphdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF2aXopIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCd0aXRsZScgaW4gdml6ICYmICdjb21tYW5kJyBpbiB2aXopIHtcblx0XHRcdHJldHVybiB7IHR5cGU6IERlYnVnVmlzdWFsaXphdGlvblR5cGUuQ29tbWFuZCB9O1xuXHRcdH1cblxuXHRcdGlmICgndHJlZUlkJyBpbiB2aXopIHtcblx0XHRcdHJldHVybiB7IHR5cGU6IERlYnVnVmlzdWFsaXphdGlvblR5cGUuVHJlZSwgaWQ6IGAke2V4dGVuc2lvbklkfVxcMCR7dml6LnRyZWVJZH1gIH07XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBkZWJ1ZyB2aXN1YWxpemF0aW9uIHR5cGUnKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SWNvblBhdGhPckNsYXNzKGljb246IHZzY29kZS5EZWJ1Z1Zpc3VhbGl6YXRpb25bJ2ljb25QYXRoJ10pIHtcblx0XHRjb25zdCBpY29uUGF0aE9ySWNvbkNsYXNzID0gdGhpcy5nZXRJY29uVXJpcyhpY29uKTtcblx0XHRsZXQgaWNvblBhdGg6IHsgZGFyazogVVJJOyBsaWdodD86IFVSSSB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBpY29uQ2xhc3M6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoJ2lkJyBpbiBpY29uUGF0aE9ySWNvbkNsYXNzKSB7XG5cdFx0XHRpY29uQ2xhc3MgPSBUaGVtZUljb25VdGlscy5hc0NsYXNzTmFtZShpY29uUGF0aE9ySWNvbkNsYXNzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWNvblBhdGggPSBpY29uUGF0aE9ySWNvbkNsYXNzO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpY29uUGF0aCxcblx0XHRcdGljb25DbGFzc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldEljb25VcmlzKGljb25QYXRoOiB2c2NvZGUuRGVidWdWaXN1YWxpemF0aW9uWydpY29uUGF0aCddKTogeyBkYXJrOiBVUkk7IGxpZ2h0PzogVVJJIH0gfCB7IGlkOiBzdHJpbmcgfSB7XG5cdFx0aWYgKGljb25QYXRoIGluc3RhbmNlb2YgVGhlbWVJY29uKSB7XG5cdFx0XHRyZXR1cm4geyBpZDogaWNvblBhdGguaWQgfTtcblx0XHR9XG5cdFx0Y29uc3QgZGFyayA9IHR5cGVvZiBpY29uUGF0aCA9PT0gJ29iamVjdCcgJiYgJ2RhcmsnIGluIGljb25QYXRoID8gaWNvblBhdGguZGFyayA6IGljb25QYXRoO1xuXHRcdGNvbnN0IGxpZ2h0ID0gdHlwZW9mIGljb25QYXRoID09PSAnb2JqZWN0JyAmJiAnbGlnaHQnIGluIGljb25QYXRoID8gaWNvblBhdGgubGlnaHQgOiBpY29uUGF0aDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGFyazogKHR5cGVvZiBkYXJrID09PSAnc3RyaW5nJyA/IFVSSS5maWxlKGRhcmspIDogZGFyaykgYXMgVVJJLFxuXHRcdFx0bGlnaHQ6ICh0eXBlb2YgbGlnaHQgPT09ICdzdHJpbmcnID8gVVJJLmZpbGUobGlnaHQpIDogbGlnaHQpIGFzIFVSSSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0RGVidWdTZXNzaW9uIHtcblx0cHJpdmF0ZSBhcGlTZXNzaW9uPzogdnNjb2RlLkRlYnVnU2Vzc2lvbjtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZGVidWdTZXJ2aWNlUHJveHk6IE1haW5UaHJlYWREZWJ1Z1NlcnZpY2VTaGFwZSxcblx0XHRwcml2YXRlIF9pZDogRGVidWdTZXNzaW9uVVVJRCxcblx0XHRwcml2YXRlIF90eXBlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfbmFtZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgX3dvcmtzcGFjZUZvbGRlcjogdnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIF9jb25maWd1cmF0aW9uOiB2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uLFxuXHRcdHByaXZhdGUgX3BhcmVudFNlc3Npb246IHZzY29kZS5EZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQpIHtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYXBpKCk6IHZzY29kZS5EZWJ1Z1Nlc3Npb24ge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHJldHVybiB0aGlzLmFwaVNlc3Npb24gPz89IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0aWQ6IHRoYXQuX2lkLFxuXHRcdFx0dHlwZTogdGhhdC5fdHlwZSxcblx0XHRcdGdldCBuYW1lKCkge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fbmFtZTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgbmFtZShuYW1lOiBzdHJpbmcpIHtcblx0XHRcdFx0dGhhdC5fbmFtZSA9IG5hbWU7XG5cdFx0XHRcdHRoYXQuX2RlYnVnU2VydmljZVByb3h5LiRzZXREZWJ1Z1Nlc3Npb25OYW1lKHRoYXQuX2lkLCBuYW1lKTtcblx0XHRcdH0sXG5cdFx0XHRwYXJlbnRTZXNzaW9uOiB0aGF0Ll9wYXJlbnRTZXNzaW9uLFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyOiB0aGF0Ll93b3Jrc3BhY2VGb2xkZXIsXG5cdFx0XHRjb25maWd1cmF0aW9uOiB0aGF0Ll9jb25maWd1cmF0aW9uLFxuXHRcdFx0Y3VzdG9tUmVxdWVzdChjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IGFueSk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9kZWJ1Z1NlcnZpY2VQcm94eS4kY3VzdG9tRGVidWdBZGFwdGVyUmVxdWVzdCh0aGF0Ll9pZCwgY29tbWFuZCwgYXJncyk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0RGVidWdQcm90b2NvbEJyZWFrcG9pbnQoYnJlYWtwb2ludDogdnNjb2RlLkJyZWFrcG9pbnQpOiBQcm9taXNlPHZzY29kZS5EZWJ1Z1Byb3RvY29sQnJlYWtwb2ludCB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fZGVidWdTZXJ2aWNlUHJveHkuJGdldERlYnVnUHJvdG9jb2xCcmVha3BvaW50KHRoYXQuX2lkLCBicmVha3BvaW50LmlkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHR5cGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdHlwZTtcblx0fVxuXG5cdF9hY2NlcHROYW1lQ2hhbmdlZChuYW1lOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9uYW1lID0gbmFtZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29uZmlndXJhdGlvbigpOiB2c2NvZGUuRGVidWdDb25maWd1cmF0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdERlYnVnQ29uc29sZSB7XG5cblx0cmVhZG9ubHkgdmFsdWU6IHZzY29kZS5EZWJ1Z0NvbnNvbGU7XG5cblx0Y29uc3RydWN0b3IocHJveHk6IE1haW5UaHJlYWREZWJ1Z1NlcnZpY2VTaGFwZSkge1xuXG5cdFx0dGhpcy52YWx1ZSA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0YXBwZW5kKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0cHJveHkuJGFwcGVuZERlYnVnQ29uc29sZSh2YWx1ZSk7XG5cdFx0XHR9LFxuXHRcdFx0YXBwZW5kTGluZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuYXBwZW5kKHZhbHVlICsgJ1xcbicpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmludGVyZmFjZSBDb25maWdQcm92aWRlclR1cGxlIHtcblx0dHlwZTogc3RyaW5nO1xuXHRoYW5kbGU6IG51bWJlcjtcblx0cHJvdmlkZXI6IHZzY29kZS5EZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcjtcbn1cblxuaW50ZXJmYWNlIERlc2NyaXB0b3JGYWN0b3J5VHVwbGUge1xuXHR0eXBlOiBzdHJpbmc7XG5cdGhhbmRsZTogbnVtYmVyO1xuXHRmYWN0b3J5OiB2c2NvZGUuRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3Rvcnk7XG59XG5cbmludGVyZmFjZSBUcmFja2VyRmFjdG9yeVR1cGxlIHtcblx0dHlwZTogc3RyaW5nO1xuXHRoYW5kbGU6IG51bWJlcjtcblx0ZmFjdG9yeTogdnNjb2RlLkRlYnVnQWRhcHRlclRyYWNrZXJGYWN0b3J5O1xufVxuXG5jbGFzcyBNdWx0aVRyYWNrZXIgaW1wbGVtZW50cyB2c2NvZGUuRGVidWdBZGFwdGVyVHJhY2tlciB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSB0cmFja2VyczogdnNjb2RlLkRlYnVnQWRhcHRlclRyYWNrZXJbXSkge1xuXHR9XG5cblx0b25XaWxsU3RhcnRTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2tlcnMuZm9yRWFjaCh0ID0+IHQub25XaWxsU3RhcnRTZXNzaW9uID8gdC5vbldpbGxTdGFydFNlc3Npb24oKSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvbldpbGxSZWNlaXZlTWVzc2FnZShtZXNzYWdlOiBhbnkpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNrZXJzLmZvckVhY2godCA9PiB0Lm9uV2lsbFJlY2VpdmVNZXNzYWdlID8gdC5vbldpbGxSZWNlaXZlTWVzc2FnZShtZXNzYWdlKSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvbkRpZFNlbmRNZXNzYWdlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2tlcnMuZm9yRWFjaCh0ID0+IHQub25EaWRTZW5kTWVzc2FnZSA/IHQub25EaWRTZW5kTWVzc2FnZShtZXNzYWdlKSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvbldpbGxTdG9wU2Vzc2lvbigpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNrZXJzLmZvckVhY2godCA9PiB0Lm9uV2lsbFN0b3BTZXNzaW9uID8gdC5vbldpbGxTdG9wU2Vzc2lvbigpIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdG9uRXJyb3IoZXJyb3I6IEVycm9yKTogdm9pZCB7XG5cdFx0dGhpcy50cmFja2Vycy5mb3JFYWNoKHQgPT4gdC5vbkVycm9yID8gdC5vbkVycm9yKGVycm9yKSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvbkV4aXQoY29kZTogbnVtYmVyLCBzaWduYWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2tlcnMuZm9yRWFjaCh0ID0+IHQub25FeGl0ID8gdC5vbkV4aXQoY29kZSwgc2lnbmFsKSA6IHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuLypcbiAqIENhbGwgZGlyZWN0bHkgaW50byBhIGRlYnVnIGFkYXB0ZXIgaW1wbGVtZW50YXRpb25cbiAqL1xuY2xhc3MgRGlyZWN0RGVidWdBZGFwdGVyIGV4dGVuZHMgQWJzdHJhY3REZWJ1Z0FkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgaW1wbGVtZW50YXRpb246IHZzY29kZS5EZWJ1Z0FkYXB0ZXIpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aW1wbGVtZW50YXRpb24ub25EaWRTZW5kTWVzc2FnZSgobWVzc2FnZTogdnNjb2RlLkRlYnVnUHJvdG9jb2xNZXNzYWdlKSA9PiB7XG5cdFx0XHR0aGlzLmFjY2VwdE1lc3NhZ2UobWVzc2FnZSBhcyBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRzdGFydFNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0c2VuZE1lc3NhZ2UobWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblx0XHR0aGlzLmltcGxlbWVudGF0aW9uLmhhbmRsZU1lc3NhZ2UobWVzc2FnZSk7XG5cdH1cblxuXHRzdG9wU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmltcGxlbWVudGF0aW9uLmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgV29ya2VyRXh0SG9zdERlYnVnU2VydmljZSBleHRlbmRzIEV4dEhvc3REZWJ1Z1NlcnZpY2VCYXNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjU2VydmljZTogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFdvcmtzcGFjZSB3b3Jrc3BhY2VTZXJ2aWNlOiBJRXh0SG9zdFdvcmtzcGFjZSxcblx0XHRASUV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dEhvc3RDb25maWd1cmF0aW9uIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRXh0SG9zdENvbmZpZ3VyYXRpb24sXG5cdFx0QElFeHRIb3N0RWRpdG9yVGFicyBlZGl0b3JUYWJzOiBJRXh0SG9zdEVkaXRvclRhYnMsXG5cdFx0QElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyIHZhcmlhYmxlUmVzb2x2ZXI6IElFeHRIb3N0VmFyaWFibGVSZXNvbHZlclByb3ZpZGVyLFxuXHRcdEBJRXh0SG9zdENvbW1hbmRzIGNvbW1hbmRzOiBJRXh0SG9zdENvbW1hbmRzLFxuXHRcdEBJRXh0SG9zdFRlc3RpbmcgdGVzdGluZzogSUV4dEhvc3RUZXN0aW5nLFxuXHQpIHtcblx0XHRzdXBlcihleHRIb3N0UnBjU2VydmljZSwgd29ya3NwYWNlU2VydmljZSwgZXh0ZW5zaW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGVkaXRvclRhYnMsIHZhcmlhYmxlUmVzb2x2ZXIsIGNvbW1hbmRzLCB0ZXN0aW5nKTtcblx0fVxufVxuXG4vLyBDb2xsZWN0aW5nIGluZm8gZm9yICMyMzMxNjcgc3BlY2lmaWNhbGx5XG50eXBlIERlYnVnUHJvdG9jb2xNZXNzYWdlRXJyb3JDbGFzc2lmaWNhdGlvbiA9IHtcblx0ZnJvbTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIHRoZSBkZWJ1ZyBhZGFwdGVyIHRoYXQgdGhlIGV2ZW50IGlzIGZyb20uJyB9O1xuXHR0eXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHR5cGUgb2YgdGhlIGV2ZW50IHRoYXQgd2FzIG1hbGZvcm1lZC4nIH07XG5cdG93bmVyOiAncm9ibG91cmVucyc7XG5cdGNvbW1lbnQ6ICdTZW50IHRvIGNvbGxlY3QgZGV0YWlscyBhYm91dCBtaXNiZWhhdmluZyBkZWJ1ZyBleHRlbnNpb25zLic7XG59O1xuXG50eXBlIERlYnVnUHJvdG9jb2xNZXNzYWdlRXJyb3JFdmVudCA9IHtcblx0ZnJvbTogc3RyaW5nO1xuXHR0eXBlOiBzdHJpbmc7XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsY0FBYyxlQUFlLG9CQUFvQjtBQUMxRCxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsV0FBMEI7QUFDbkMsU0FBUywyQkFBa0Q7QUFDM0QsU0FBUyx1QkFBdUI7QUFHaEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw4QkFBNFM7QUFDclQsU0FBUyxrQkFBa0IsbUJBQW1CLGtDQUFrQztBQUdoRixTQUFzTCxtQkFBMEU7QUFDaFEsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsWUFBWSxhQUFhO0FBQ3pCLFNBQXFCLGdCQUFnQix3QkFBd0Isa0NBQWtDLDZCQUE2QixvQkFBb0Isa0JBQWtCLGlCQUFpQixhQUFhLFlBQVksb0JBQW9CLFVBQVUsVUFBVSxpQkFBaUIsa0JBQWtCLGlCQUFpQjtBQUN4UyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHlCQUF5QjtBQUUzQixNQUFNLHVCQUF1QixnQkFBc0Msc0JBQXNCO0FBNkJ6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
