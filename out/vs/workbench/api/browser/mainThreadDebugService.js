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
import { DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { URI as uri } from "../../../base/common/uri.js";
import { IDebugService, IDebugVisualization, DataBreakpointSetType } from "../../contrib/debug/common/debug.js";
import {
  ExtHostContext,
  MainContext
} from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import severity from "../../../base/common/severity.js";
import { AbstractDebugAdapter } from "../../contrib/debug/common/abstractDebugAdapter.js";
import { convertToVSCPaths, convertToDAPaths, isSessionAttach } from "../../contrib/debug/common/debugUtils.js";
import { ErrorNoTelemetry } from "../../../base/common/errors.js";
import { IDebugVisualizerService } from "../../contrib/debug/common/debugVisualizers.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { Event } from "../../../base/common/event.js";
import { isDefined } from "../../../base/common/types.js";
let MainThreadDebugService = class {
  constructor(extHostContext, debugService, visualizerService) {
    this.debugService = debugService;
    this.visualizerService = visualizerService;
    this._toDispose = new DisposableStore();
    this._debugAdaptersHandleCounter = 1;
    this._visualizerHandles = /* @__PURE__ */ new Map();
    this._visualizerTreeHandles = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDebugService);
    const sessionListeners = new DisposableMap();
    this._toDispose.add(sessionListeners);
    this._toDispose.add(debugService.onDidNewSession((session) => {
      this._proxy.$acceptDebugSessionStarted(this.getSessionDto(session));
      const store = sessionListeners.get(session);
      store?.add(session.onDidChangeName((name) => {
        this._proxy.$acceptDebugSessionNameChanged(this.getSessionDto(session), name);
      }));
    }));
    this._toDispose.add(debugService.onWillNewSession((session) => {
      let store = sessionListeners.get(session);
      if (!store) {
        store = new DisposableStore();
        sessionListeners.set(session, store);
      }
      store.add(session.onDidCustomEvent((event) => this._proxy.$acceptDebugSessionCustomEvent(this.getSessionDto(session), event)));
    }));
    this._toDispose.add(debugService.onDidEndSession(({ session, restart }) => {
      this._proxy.$acceptDebugSessionTerminated(this.getSessionDto(session));
      this._extHostKnownSessions.delete(session.getId());
      if (!restart) {
        sessionListeners.deleteAndDispose(session);
      }
      for (const [handle, value] of this._debugAdapters) {
        if (value.session === session) {
          this._debugAdapters.delete(handle);
        }
      }
    }));
    this._toDispose.add(debugService.getViewModel().onDidFocusSession((session) => {
      this._proxy.$acceptDebugSessionActiveChanged(this.getSessionDto(session));
    }));
    this._toDispose.add(toDisposable(() => {
      for (const [handle, da] of this._debugAdapters) {
        da.fireError(handle, new Error("Extension host shut down"));
      }
    }));
    this._debugAdapters = /* @__PURE__ */ new Map();
    this._debugConfigurationProviders = /* @__PURE__ */ new Map();
    this._debugAdapterDescriptorFactories = /* @__PURE__ */ new Map();
    this._extHostKnownSessions = /* @__PURE__ */ new Set();
    const viewModel = this.debugService.getViewModel();
    this._toDispose.add(Event.any(viewModel.onDidFocusStackFrame, viewModel.onDidFocusThread)(() => {
      const stackFrame = viewModel.focusedStackFrame;
      const thread = viewModel.focusedThread;
      if (stackFrame) {
        this._proxy.$acceptStackFrameFocus({
          kind: "stackFrame",
          threadId: stackFrame.thread.threadId,
          frameId: stackFrame.frameId,
          sessionId: stackFrame.thread.session.getId()
        });
      } else if (thread) {
        this._proxy.$acceptStackFrameFocus({
          kind: "thread",
          threadId: thread.threadId,
          sessionId: thread.session.getId()
        });
      } else {
        this._proxy.$acceptStackFrameFocus(void 0);
      }
    }));
    this.sendBreakpointsAndListen();
  }
  $registerDebugVisualizerTree(treeId, canEdit) {
    this._visualizerTreeHandles.set(treeId, this.visualizerService.registerTree(treeId, {
      disposeItem: (id) => this._proxy.$disposeVisualizedTree(id),
      getChildren: (e) => this._proxy.$getVisualizerTreeItemChildren(treeId, e),
      getTreeItem: (e) => this._proxy.$getVisualizerTreeItem(treeId, e),
      editItem: canEdit ? ((e, v) => this._proxy.$editVisualizerTreeItem(e, v)) : void 0
    }));
  }
  $unregisterDebugVisualizerTree(treeId) {
    this._visualizerTreeHandles.get(treeId)?.dispose();
    this._visualizerTreeHandles.delete(treeId);
  }
  $registerDebugVisualizer(extensionId, id) {
    const handle = this.visualizerService.register({
      extensionId: new ExtensionIdentifier(extensionId),
      id,
      disposeDebugVisualizers: (ids) => this._proxy.$disposeDebugVisualizers(ids),
      executeDebugVisualizerCommand: (id2) => this._proxy.$executeDebugVisualizerCommand(id2),
      provideDebugVisualizers: (context, token) => this._proxy.$provideDebugVisualizers(extensionId, id, context, token).then((r) => r.map(IDebugVisualization.deserialize)),
      resolveDebugVisualizer: (viz, token) => this._proxy.$resolveDebugVisualizer(viz.id, token)
    });
    this._visualizerHandles.set(`${extensionId}/${id}`, handle);
  }
  $unregisterDebugVisualizer(extensionId, id) {
    const key = `${extensionId}/${id}`;
    this._visualizerHandles.get(key)?.dispose();
    this._visualizerHandles.delete(key);
  }
  sendBreakpointsAndListen() {
    this._toDispose.add(this.debugService.getModel().onDidChangeBreakpoints((e) => {
      if (e && !e.sessionOnly) {
        const delta = {};
        if (e.added) {
          delta.added = this.convertToDto(e.added);
        }
        if (e.removed) {
          delta.removed = e.removed.map((x) => x.getId());
        }
        if (e.changed) {
          delta.changed = this.convertToDto(e.changed);
        }
        if (delta.added || delta.removed || delta.changed) {
          this._proxy.$acceptBreakpointsDelta(delta);
        }
      }
    }));
    const bps = this.debugService.getModel().getBreakpoints();
    const fbps = this.debugService.getModel().getFunctionBreakpoints();
    const dbps = this.debugService.getModel().getDataBreakpoints();
    if (bps.length > 0 || fbps.length > 0) {
      this._proxy.$acceptBreakpointsDelta({
        added: this.convertToDto(bps).concat(this.convertToDto(fbps)).concat(this.convertToDto(dbps))
      });
    }
  }
  dispose() {
    this._toDispose.dispose();
  }
  // interface IDebugAdapterProvider
  createDebugAdapter(session) {
    const handle = this._debugAdaptersHandleCounter++;
    const da = new ExtensionHostDebugAdapter(this, handle, this._proxy, session);
    this._debugAdapters.set(handle, da);
    return da;
  }
  substituteVariables(folder, config) {
    return Promise.resolve(this._proxy.$substituteVariables(folder ? folder.uri : void 0, config));
  }
  runInTerminal(args, sessionId) {
    return this._proxy.$runInTerminal(args, sessionId);
  }
  // RPC methods (MainThreadDebugServiceShape)
  $registerDebugTypes(debugTypes) {
    this._toDispose.add(this.debugService.getAdapterManager().registerDebugAdapterFactory(debugTypes, this));
  }
  $registerBreakpoints(DTOs) {
    for (const dto of DTOs) {
      if (dto.type === "sourceMulti") {
        const rawbps = dto.lines.map((l) => ({
          id: l.id,
          enabled: l.enabled,
          lineNumber: l.line + 1,
          column: l.character > 0 ? l.character + 1 : void 0,
          // a column value of 0 results in an omitted column attribute; see #46784
          condition: l.condition,
          hitCondition: l.hitCondition,
          logMessage: l.logMessage,
          mode: l.mode
        }));
        this.debugService.addBreakpoints(uri.revive(dto.uri), rawbps);
      } else if (dto.type === "function") {
        this.debugService.addFunctionBreakpoint({
          name: dto.functionName,
          mode: dto.mode,
          condition: dto.condition,
          hitCondition: dto.hitCondition,
          enabled: dto.enabled,
          logMessage: dto.logMessage
        }, dto.id);
      } else if (dto.type === "data") {
        this.debugService.addDataBreakpoint({
          description: dto.label,
          src: { type: DataBreakpointSetType.Variable, dataId: dto.dataId },
          canPersist: dto.canPersist,
          accessTypes: dto.accessTypes,
          accessType: dto.accessType,
          mode: dto.mode
        });
      }
    }
    return Promise.resolve();
  }
  $unregisterBreakpoints(breakpointIds, functionBreakpointIds, dataBreakpointIds) {
    breakpointIds.forEach((id) => this.debugService.removeBreakpoints(id));
    functionBreakpointIds.forEach((id) => this.debugService.removeFunctionBreakpoints(id));
    dataBreakpointIds.forEach((id) => this.debugService.removeDataBreakpoints(id));
    return Promise.resolve();
  }
  $registerDebugConfigurationProvider(debugType, providerTriggerKind, hasProvide, hasResolve, hasResolve2, handle) {
    const provider = {
      type: debugType,
      triggerKind: providerTriggerKind
    };
    if (hasProvide) {
      provider.provideDebugConfigurations = (folder, token) => {
        return this._proxy.$provideDebugConfigurations(handle, folder, token);
      };
    }
    if (hasResolve) {
      provider.resolveDebugConfiguration = (folder, config, token) => {
        return this._proxy.$resolveDebugConfiguration(handle, folder, config, token);
      };
    }
    if (hasResolve2) {
      provider.resolveDebugConfigurationWithSubstitutedVariables = (folder, config, token) => {
        return this._proxy.$resolveDebugConfigurationWithSubstitutedVariables(handle, folder, config, token);
      };
    }
    this._debugConfigurationProviders.set(handle, provider);
    this._toDispose.add(this.debugService.getConfigurationManager().registerDebugConfigurationProvider(provider));
    return Promise.resolve(void 0);
  }
  $unregisterDebugConfigurationProvider(handle) {
    const provider = this._debugConfigurationProviders.get(handle);
    if (provider) {
      this._debugConfigurationProviders.delete(handle);
      this.debugService.getConfigurationManager().unregisterDebugConfigurationProvider(provider);
    }
  }
  $registerDebugAdapterDescriptorFactory(debugType, handle) {
    const provider = {
      type: debugType,
      createDebugAdapterDescriptor: (session) => {
        return Promise.resolve(this._proxy.$provideDebugAdapter(handle, this.getSessionDto(session)));
      }
    };
    this._debugAdapterDescriptorFactories.set(handle, provider);
    this._toDispose.add(this.debugService.getAdapterManager().registerDebugAdapterDescriptorFactory(provider));
    return Promise.resolve(void 0);
  }
  $unregisterDebugAdapterDescriptorFactory(handle) {
    const provider = this._debugAdapterDescriptorFactories.get(handle);
    if (provider) {
      this._debugAdapterDescriptorFactories.delete(handle);
      this.debugService.getAdapterManager().unregisterDebugAdapterDescriptorFactory(provider);
    }
  }
  getSession(sessionId) {
    if (sessionId) {
      return this.debugService.getModel().getSession(sessionId, true);
    }
    return void 0;
  }
  async $startDebugging(folder, nameOrConfig, options) {
    const folderUri = folder ? uri.revive(folder) : void 0;
    const launch = this.debugService.getConfigurationManager().getLaunch(folderUri);
    const parentSession = this.getSession(options.parentSessionID);
    const saveBeforeStart = typeof options.suppressSaveBeforeStart === "boolean" ? !options.suppressSaveBeforeStart : void 0;
    const debugOptions = {
      noDebug: options.noDebug,
      parentSession,
      lifecycleManagedByParent: options.lifecycleManagedByParent,
      repl: options.repl,
      compact: options.compact,
      compoundRoot: parentSession?.compoundRoot,
      saveBeforeRestart: saveBeforeStart,
      testRun: options.testRun,
      suppressDebugStatusbar: options.suppressDebugStatusbar,
      suppressDebugToolbar: options.suppressDebugToolbar,
      suppressDebugView: options.suppressDebugView
    };
    try {
      return this.debugService.startDebugging(launch, nameOrConfig, debugOptions, saveBeforeStart);
    } catch (err) {
      throw new ErrorNoTelemetry(err && err.message ? err.message : "cannot start debugging");
    }
  }
  $setDebugSessionName(sessionId, name) {
    const session = this.debugService.getModel().getSession(sessionId);
    session?.setName(name);
  }
  $customDebugAdapterRequest(sessionId, request, args) {
    const session = this.debugService.getModel().getSession(sessionId, true);
    if (session) {
      return session.customRequest(request, args).then((response) => {
        if (response && response.success) {
          return response.body;
        } else {
          return Promise.reject(new ErrorNoTelemetry(response ? response.message : "custom request failed"));
        }
      });
    }
    return Promise.reject(new ErrorNoTelemetry("debug session not found"));
  }
  $getDebugProtocolBreakpoint(sessionId, breakpoinId) {
    const session = this.debugService.getModel().getSession(sessionId, true);
    if (session) {
      return Promise.resolve(session.getDebugProtocolBreakpoint(breakpoinId));
    }
    return Promise.reject(new ErrorNoTelemetry("debug session not found"));
  }
  $stopDebugging(sessionId) {
    if (sessionId) {
      const session = this.debugService.getModel().getSession(sessionId, true);
      if (session) {
        return this.debugService.stopSession(session, isSessionAttach(session));
      }
    } else {
      return this.debugService.stopSession(void 0);
    }
    return Promise.reject(new ErrorNoTelemetry("debug session not found"));
  }
  $appendDebugConsole(value) {
    const session = this.debugService.getViewModel().focusedSession;
    session?.appendToRepl({ output: value, sev: severity.Warning });
  }
  $acceptDAMessage(handle, message) {
    this.getDebugAdapter(handle).acceptMessage(convertToVSCPaths(message, false));
  }
  $acceptDAError(handle, name, message, stack) {
    this._debugAdapters.get(handle)?.fireError(handle, new Error(`${name}: ${message}
${stack}`));
  }
  $acceptDAExit(handle, code, signal) {
    this._debugAdapters.get(handle)?.fireExit(handle, code, signal);
  }
  getDebugAdapter(handle) {
    const adapter = this._debugAdapters.get(handle);
    if (!adapter) {
      throw new Error("Invalid debug adapter");
    }
    return adapter;
  }
  // dto helpers
  $sessionCached(sessionID) {
    this._extHostKnownSessions.add(sessionID);
  }
  getSessionDto(session) {
    if (session) {
      const sessionID = session.getId();
      if (this._extHostKnownSessions.has(sessionID)) {
        return sessionID;
      } else {
        return {
          id: sessionID,
          type: session.configuration.type,
          name: session.name,
          folderUri: session.root ? session.root.uri : void 0,
          configuration: session.configuration,
          parent: session.parentSession?.getId()
        };
      }
    }
    return void 0;
  }
  convertToDto(bps) {
    return bps.map((bp) => {
      if ("name" in bp) {
        const fbp = bp;
        return {
          type: "function",
          id: fbp.getId(),
          enabled: fbp.enabled,
          condition: fbp.condition,
          hitCondition: fbp.hitCondition,
          logMessage: fbp.logMessage,
          functionName: fbp.name
        };
      } else if ("src" in bp) {
        const dbp = bp;
        return {
          type: "data",
          id: dbp.getId(),
          dataId: dbp.src.type === DataBreakpointSetType.Variable ? dbp.src.dataId : dbp.src.address,
          enabled: dbp.enabled,
          condition: dbp.condition,
          hitCondition: dbp.hitCondition,
          logMessage: dbp.logMessage,
          accessType: dbp.accessType,
          label: dbp.description,
          canPersist: dbp.canPersist
        };
      } else if ("uri" in bp) {
        const sbp = bp;
        return {
          type: "source",
          id: sbp.getId(),
          enabled: sbp.enabled,
          condition: sbp.condition,
          hitCondition: sbp.hitCondition,
          logMessage: sbp.logMessage,
          uri: sbp.uri,
          line: sbp.lineNumber > 0 ? sbp.lineNumber - 1 : 0,
          character: typeof sbp.column === "number" && sbp.column > 0 ? sbp.column - 1 : 0
        };
      } else {
        return void 0;
      }
    }).filter(isDefined);
  }
};
MainThreadDebugService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadDebugService),
  __decorateParam(1, IDebugService),
  __decorateParam(2, IDebugVisualizerService)
], MainThreadDebugService);
class ExtensionHostDebugAdapter extends AbstractDebugAdapter {
  constructor(_ds, _handle, _proxy, session) {
    super();
    this._ds = _ds;
    this._handle = _handle;
    this._proxy = _proxy;
    this.session = session;
  }
  fireError(handle, err) {
    this._onError.fire(err);
  }
  fireExit(handle, code, signal) {
    this._onExit.fire(code);
  }
  startSession() {
    return Promise.resolve(this._proxy.$startDASession(this._handle, this._ds.getSessionDto(this.session)));
  }
  sendMessage(message) {
    this._proxy.$sendDAMessage(this._handle, convertToDAPaths(message, true));
  }
  async stopSession() {
    await this.cancelPendingRequests();
    return Promise.resolve(this._proxy.$stopDASession(this._handle));
  }
}
export {
  MainThreadDebugService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZERlYnVnU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgYXMgdXJpLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UsIElDb25maWcsIElEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciwgSUJyZWFrcG9pbnQsIElGdW5jdGlvbkJyZWFrcG9pbnQsIElCcmVha3BvaW50RGF0YSwgSURlYnVnQWRhcHRlciwgSURlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5LCBJRGVidWdTZXNzaW9uLCBJRGVidWdBZGFwdGVyRmFjdG9yeSwgSURhdGFCcmVha3BvaW50LCBJRGVidWdTZXNzaW9uT3B0aW9ucywgSUluc3RydWN0aW9uQnJlYWtwb2ludCwgRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZCwgSURlYnVnVmlzdWFsaXphdGlvbiwgRGF0YUJyZWFrcG9pbnRTZXRUeXBlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHtcblx0RXh0SG9zdENvbnRleHQsIEV4dEhvc3REZWJ1Z1NlcnZpY2VTaGFwZSwgTWFpblRocmVhZERlYnVnU2VydmljZVNoYXBlLCBEZWJ1Z1Nlc3Npb25VVUlELCBNYWluQ29udGV4dCxcblx0SUJyZWFrcG9pbnRzRGVsdGFEdG8sIElTb3VyY2VNdWx0aUJyZWFrcG9pbnREdG8sIElTb3VyY2VCcmVha3BvaW50RHRvLCBJRnVuY3Rpb25CcmVha3BvaW50RHRvLCBJRGVidWdTZXNzaW9uRHRvLCBJRGF0YUJyZWFrcG9pbnREdG8sIElTdGFydERlYnVnZ2luZ09wdGlvbnMsIElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElUaHJlYWRGb2N1c0R0bywgSVN0YWNrRnJhbWVGb2N1c0R0b1xufSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgc2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3REZWJ1Z0FkYXB0ZXIgfSBmcm9tICcuLi8uLi9jb250cmliL2RlYnVnL2NvbW1vbi9hYnN0cmFjdERlYnVnQWRhcHRlci5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgY29udmVydFRvVlNDUGF0aHMsIGNvbnZlcnRUb0RBUGF0aHMsIGlzU2Vzc2lvbkF0dGFjaCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvZGVidWcvY29tbW9uL2RlYnVnVXRpbHMuanMnO1xuaW1wb3J0IHsgRXJyb3JOb1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJRGVidWdWaXN1YWxpemVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvZGVidWcvY29tbW9uL2RlYnVnVmlzdWFsaXplcnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkRGVidWdTZXJ2aWNlKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWREZWJ1Z1NlcnZpY2UgaW1wbGVtZW50cyBNYWluVGhyZWFkRGVidWdTZXJ2aWNlU2hhcGUsIElEZWJ1Z0FkYXB0ZXJGYWN0b3J5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdERlYnVnU2VydmljZVNoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnQWRhcHRlcnM6IE1hcDxudW1iZXIsIEV4dGVuc2lvbkhvc3REZWJ1Z0FkYXB0ZXI+O1xuXHRwcml2YXRlIF9kZWJ1Z0FkYXB0ZXJzSGFuZGxlQ291bnRlciA9IDE7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyczogTWFwPG51bWJlciwgSURlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcmllczogTWFwPG51bWJlciwgSURlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdEtub3duU2Vzc2lvbnM6IFNldDxEZWJ1Z1Nlc3Npb25VVUlEPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlzdWFsaXplckhhbmRsZXMgPSBuZXcgTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc3VhbGl6ZXJUcmVlSGFuZGxlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJRGVidWdWaXN1YWxpemVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpc3VhbGl6ZXJTZXJ2aWNlOiBJRGVidWdWaXN1YWxpemVyU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0RGVidWdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlc3Npb25MaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZU1hcDxJRGVidWdTZXNzaW9uLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChzZXNzaW9uTGlzdGVuZXJzKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKGRlYnVnU2VydmljZS5vbkRpZE5ld1Nlc3Npb24oc2Vzc2lvbiA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0RGVidWdTZXNzaW9uU3RhcnRlZCh0aGlzLmdldFNlc3Npb25EdG8oc2Vzc2lvbikpO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBzZXNzaW9uTGlzdGVuZXJzLmdldChzZXNzaW9uKTtcblx0XHRcdHN0b3JlPy5hZGQoc2Vzc2lvbi5vbkRpZENoYW5nZU5hbWUobmFtZSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHREZWJ1Z1Nlc3Npb25OYW1lQ2hhbmdlZCh0aGlzLmdldFNlc3Npb25EdG8oc2Vzc2lvbiksIG5hbWUpO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0XHQvLyBOZWVkIHRvIHN0YXJ0IGxpc3RlbmluZyBlYXJseSB0byBuZXcgc2Vzc2lvbiBldmVudHMgYmVjYXVzZSBhIGN1c3RvbSBldmVudCBjYW4gY29tZSB3aGlsZSBhIHNlc3Npb24gaXMgaW5pdGlhbGlzaW5nXG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChkZWJ1Z1NlcnZpY2Uub25XaWxsTmV3U2Vzc2lvbihzZXNzaW9uID0+IHtcblx0XHRcdGxldCBzdG9yZSA9IHNlc3Npb25MaXN0ZW5lcnMuZ2V0KHNlc3Npb24pO1xuXHRcdFx0aWYgKCFzdG9yZSkge1xuXHRcdFx0XHRzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0c2Vzc2lvbkxpc3RlbmVycy5zZXQoc2Vzc2lvbiwgc3RvcmUpO1xuXHRcdFx0fVxuXHRcdFx0c3RvcmUuYWRkKHNlc3Npb24ub25EaWRDdXN0b21FdmVudChldmVudCA9PiB0aGlzLl9wcm94eS4kYWNjZXB0RGVidWdTZXNzaW9uQ3VzdG9tRXZlbnQodGhpcy5nZXRTZXNzaW9uRHRvKHNlc3Npb24pLCBldmVudCkpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChkZWJ1Z1NlcnZpY2Uub25EaWRFbmRTZXNzaW9uKCh7IHNlc3Npb24sIHJlc3RhcnQgfSkgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdERlYnVnU2Vzc2lvblRlcm1pbmF0ZWQodGhpcy5nZXRTZXNzaW9uRHRvKHNlc3Npb24pKTtcblx0XHRcdHRoaXMuX2V4dEhvc3RLbm93blNlc3Npb25zLmRlbGV0ZShzZXNzaW9uLmdldElkKCkpO1xuXG5cdFx0XHQvLyBrZWVwIHRoZSBzZXNzaW9uIGxpc3RlbmVycyBhcm91bmQgc2luY2Ugd2Ugc3RpbGwgd2lsbCBnZXQgZXZlbnRzIGFmdGVyIHRoZXkgcmVzdGFydFxuXHRcdFx0aWYgKCFyZXN0YXJ0KSB7XG5cdFx0XHRcdHNlc3Npb25MaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYW55IHJlc3RhcnRlZCBzZXNzaW9uIHdpbGwgY3JlYXRlIGEgbmV3IERBLCBzbyBhbHdheXMgdGhyb3cgdGhlIG9sZCBvbmUgYXdheS5cblx0XHRcdGZvciAoY29uc3QgW2hhbmRsZSwgdmFsdWVdIG9mIHRoaXMuX2RlYnVnQWRhcHRlcnMpIHtcblx0XHRcdFx0aWYgKHZhbHVlLnNlc3Npb24gPT09IHNlc3Npb24pIHtcblx0XHRcdFx0XHR0aGlzLl9kZWJ1Z0FkYXB0ZXJzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0XHRcdC8vIGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQoZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRm9jdXNTZXNzaW9uKHNlc3Npb24gPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdERlYnVnU2Vzc2lvbkFjdGl2ZUNoYW5nZWQodGhpcy5nZXRTZXNzaW9uRHRvKHNlc3Npb24pKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBbaGFuZGxlLCBkYV0gb2YgdGhpcy5fZGVidWdBZGFwdGVycykge1xuXHRcdFx0XHRkYS5maXJlRXJyb3IoaGFuZGxlLCBuZXcgRXJyb3IoJ0V4dGVuc2lvbiBob3N0IHNodXQgZG93bicpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kZWJ1Z0FkYXB0ZXJzID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMuX2RlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVycyA9IG5ldyBNYXAoKTtcblx0XHR0aGlzLl9kZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMuX2V4dEhvc3RLbm93blNlc3Npb25zID0gbmV3IFNldCgpO1xuXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZChFdmVudC5hbnkodmlld01vZGVsLm9uRGlkRm9jdXNTdGFja0ZyYW1lLCB2aWV3TW9kZWwub25EaWRGb2N1c1RocmVhZCkoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IHZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRcdGNvbnN0IHRocmVhZCA9IHZpZXdNb2RlbC5mb2N1c2VkVGhyZWFkO1xuXHRcdFx0aWYgKHN0YWNrRnJhbWUpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFN0YWNrRnJhbWVGb2N1cyh7XG5cdFx0XHRcdFx0a2luZDogJ3N0YWNrRnJhbWUnLFxuXHRcdFx0XHRcdHRocmVhZElkOiBzdGFja0ZyYW1lLnRocmVhZC50aHJlYWRJZCxcblx0XHRcdFx0XHRmcmFtZUlkOiBzdGFja0ZyYW1lLmZyYW1lSWQsXG5cdFx0XHRcdFx0c2Vzc2lvbklkOiBzdGFja0ZyYW1lLnRocmVhZC5zZXNzaW9uLmdldElkKCksXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElTdGFja0ZyYW1lRm9jdXNEdG8pO1xuXHRcdFx0fSBlbHNlIGlmICh0aHJlYWQpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFN0YWNrRnJhbWVGb2N1cyh7XG5cdFx0XHRcdFx0a2luZDogJ3RocmVhZCcsXG5cdFx0XHRcdFx0dGhyZWFkSWQ6IHRocmVhZC50aHJlYWRJZCxcblx0XHRcdFx0XHRzZXNzaW9uSWQ6IHRocmVhZC5zZXNzaW9uLmdldElkKCksXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElUaHJlYWRGb2N1c0R0byk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0U3RhY2tGcmFtZUZvY3VzKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zZW5kQnJlYWtwb2ludHNBbmRMaXN0ZW4oKTtcblx0fVxuXG5cdCRyZWdpc3RlckRlYnVnVmlzdWFsaXplclRyZWUodHJlZUlkOiBzdHJpbmcsIGNhbkVkaXQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl92aXN1YWxpemVyVHJlZUhhbmRsZXMuc2V0KHRyZWVJZCwgdGhpcy52aXN1YWxpemVyU2VydmljZS5yZWdpc3RlclRyZWUodHJlZUlkLCB7XG5cdFx0XHRkaXNwb3NlSXRlbTogaWQgPT4gdGhpcy5fcHJveHkuJGRpc3Bvc2VWaXN1YWxpemVkVHJlZShpZCksXG5cdFx0XHRnZXRDaGlsZHJlbjogZSA9PiB0aGlzLl9wcm94eS4kZ2V0VmlzdWFsaXplclRyZWVJdGVtQ2hpbGRyZW4odHJlZUlkLCBlKSxcblx0XHRcdGdldFRyZWVJdGVtOiBlID0+IHRoaXMuX3Byb3h5LiRnZXRWaXN1YWxpemVyVHJlZUl0ZW0odHJlZUlkLCBlKSxcblx0XHRcdGVkaXRJdGVtOiBjYW5FZGl0ID8gKChlLCB2KSA9PiB0aGlzLl9wcm94eS4kZWRpdFZpc3VhbGl6ZXJUcmVlSXRlbShlLCB2KSkgOiB1bmRlZmluZWRcblx0XHR9KSk7XG5cdH1cblxuXHQkdW5yZWdpc3RlckRlYnVnVmlzdWFsaXplclRyZWUodHJlZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl92aXN1YWxpemVyVHJlZUhhbmRsZXMuZ2V0KHRyZWVJZCk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl92aXN1YWxpemVyVHJlZUhhbmRsZXMuZGVsZXRlKHRyZWVJZCk7XG5cdH1cblxuXHQkcmVnaXN0ZXJEZWJ1Z1Zpc3VhbGl6ZXIoZXh0ZW5zaW9uSWQ6IHN0cmluZywgaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMudmlzdWFsaXplclNlcnZpY2UucmVnaXN0ZXIoe1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKGV4dGVuc2lvbklkKSxcblx0XHRcdGlkLFxuXHRcdFx0ZGlzcG9zZURlYnVnVmlzdWFsaXplcnM6IGlkcyA9PiB0aGlzLl9wcm94eS4kZGlzcG9zZURlYnVnVmlzdWFsaXplcnMoaWRzKSxcblx0XHRcdGV4ZWN1dGVEZWJ1Z1Zpc3VhbGl6ZXJDb21tYW5kOiBpZCA9PiB0aGlzLl9wcm94eS4kZXhlY3V0ZURlYnVnVmlzdWFsaXplckNvbW1hbmQoaWQpLFxuXHRcdFx0cHJvdmlkZURlYnVnVmlzdWFsaXplcnM6IChjb250ZXh0LCB0b2tlbikgPT4gdGhpcy5fcHJveHkuJHByb3ZpZGVEZWJ1Z1Zpc3VhbGl6ZXJzKGV4dGVuc2lvbklkLCBpZCwgY29udGV4dCwgdG9rZW4pLnRoZW4ociA9PiByLm1hcChJRGVidWdWaXN1YWxpemF0aW9uLmRlc2VyaWFsaXplKSksXG5cdFx0XHRyZXNvbHZlRGVidWdWaXN1YWxpemVyOiAodml6LCB0b2tlbikgPT4gdGhpcy5fcHJveHkuJHJlc29sdmVEZWJ1Z1Zpc3VhbGl6ZXIodml6LmlkLCB0b2tlbiksXG5cdFx0fSk7XG5cdFx0dGhpcy5fdmlzdWFsaXplckhhbmRsZXMuc2V0KGAke2V4dGVuc2lvbklkfS8ke2lkfWAsIGhhbmRsZSk7XG5cdH1cblxuXHQkdW5yZWdpc3RlckRlYnVnVmlzdWFsaXplcihleHRlbnNpb25JZDogc3RyaW5nLCBpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gYCR7ZXh0ZW5zaW9uSWR9LyR7aWR9YDtcblx0XHR0aGlzLl92aXN1YWxpemVySGFuZGxlcy5nZXQoa2V5KT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Zpc3VhbGl6ZXJIYW5kbGVzLmRlbGV0ZShrZXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZW5kQnJlYWtwb2ludHNBbmRMaXN0ZW4oKTogdm9pZCB7XG5cdFx0Ly8gc2V0IHVwIGEgaGFuZGxlciB0byBzZW5kIG1vcmVcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkub25EaWRDaGFuZ2VCcmVha3BvaW50cyhlID0+IHtcblx0XHRcdC8vIElnbm9yZSBzZXNzaW9uIG9ubHkgYnJlYWtwb2ludCBldmVudHMgc2luY2UgdGhleSBzaG91bGQgb25seSByZWZsZWN0IGluIHRoZSBVSVxuXHRcdFx0aWYgKGUgJiYgIWUuc2Vzc2lvbk9ubHkpIHtcblx0XHRcdFx0Y29uc3QgZGVsdGE6IElCcmVha3BvaW50c0RlbHRhRHRvID0ge307XG5cdFx0XHRcdGlmIChlLmFkZGVkKSB7XG5cdFx0XHRcdFx0ZGVsdGEuYWRkZWQgPSB0aGlzLmNvbnZlcnRUb0R0byhlLmFkZGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5yZW1vdmVkKSB7XG5cdFx0XHRcdFx0ZGVsdGEucmVtb3ZlZCA9IGUucmVtb3ZlZC5tYXAoeCA9PiB4LmdldElkKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmNoYW5nZWQpIHtcblx0XHRcdFx0XHRkZWx0YS5jaGFuZ2VkID0gdGhpcy5jb252ZXJ0VG9EdG8oZS5jaGFuZ2VkKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChkZWx0YS5hZGRlZCB8fCBkZWx0YS5yZW1vdmVkIHx8IGRlbHRhLmNoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0QnJlYWtwb2ludHNEZWx0YShkZWx0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBzZW5kIGFsbCBicmVha3BvaW50c1xuXHRcdGNvbnN0IGJwcyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoKTtcblx0XHRjb25zdCBmYnBzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0Y29uc3QgZGJwcyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0RGF0YUJyZWFrcG9pbnRzKCk7XG5cdFx0aWYgKGJwcy5sZW5ndGggPiAwIHx8IGZicHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdEJyZWFrcG9pbnRzRGVsdGEoe1xuXHRcdFx0XHRhZGRlZDogdGhpcy5jb252ZXJ0VG9EdG8oYnBzKS5jb25jYXQodGhpcy5jb252ZXJ0VG9EdG8oZmJwcykpLmNvbmNhdCh0aGlzLmNvbnZlcnRUb0R0byhkYnBzKSlcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdH1cblxuXHQvLyBpbnRlcmZhY2UgSURlYnVnQWRhcHRlclByb3ZpZGVyXG5cblx0Y3JlYXRlRGVidWdBZGFwdGVyKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBJRGVidWdBZGFwdGVyIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9kZWJ1Z0FkYXB0ZXJzSGFuZGxlQ291bnRlcisrO1xuXHRcdGNvbnN0IGRhID0gbmV3IEV4dGVuc2lvbkhvc3REZWJ1Z0FkYXB0ZXIodGhpcywgaGFuZGxlLCB0aGlzLl9wcm94eSwgc2Vzc2lvbik7XG5cdFx0dGhpcy5fZGVidWdBZGFwdGVycy5zZXQoaGFuZGxlLCBkYSk7XG5cdFx0cmV0dXJuIGRhO1xuXHR9XG5cblx0c3Vic3RpdHV0ZVZhcmlhYmxlcyhmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQsIGNvbmZpZzogSUNvbmZpZyk6IFByb21pc2U8SUNvbmZpZz4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5fcHJveHkuJHN1YnN0aXR1dGVWYXJpYWJsZXMoZm9sZGVyID8gZm9sZGVyLnVyaSA6IHVuZGVmaW5lZCwgY29uZmlnKSk7XG5cdH1cblxuXHRydW5JblRlcm1pbmFsKGFyZ3M6IERlYnVnUHJvdG9jb2wuUnVuSW5UZXJtaW5hbFJlcXVlc3RBcmd1bWVudHMsIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHJ1bkluVGVybWluYWwoYXJncywgc2Vzc2lvbklkKTtcblx0fVxuXG5cdC8vIFJQQyBtZXRob2RzIChNYWluVGhyZWFkRGVidWdTZXJ2aWNlU2hhcGUpXG5cblx0cHVibGljICRyZWdpc3RlckRlYnVnVHlwZXMoZGVidWdUeXBlczogc3RyaW5nW10pIHtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkucmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJGYWN0b3J5KGRlYnVnVHlwZXMsIHRoaXMpKTtcblx0fVxuXG5cdHB1YmxpYyAkcmVnaXN0ZXJCcmVha3BvaW50cyhEVE9zOiBBcnJheTxJU291cmNlTXVsdGlCcmVha3BvaW50RHRvIHwgSUZ1bmN0aW9uQnJlYWtwb2ludER0byB8IElEYXRhQnJlYWtwb2ludER0bz4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGZvciAoY29uc3QgZHRvIG9mIERUT3MpIHtcblx0XHRcdGlmIChkdG8udHlwZSA9PT0gJ3NvdXJjZU11bHRpJykge1xuXHRcdFx0XHRjb25zdCByYXdicHMgPSBkdG8ubGluZXMubWFwKChsKTogSUJyZWFrcG9pbnREYXRhID0+ICh7XG5cdFx0XHRcdFx0aWQ6IGwuaWQsXG5cdFx0XHRcdFx0ZW5hYmxlZDogbC5lbmFibGVkLFxuXHRcdFx0XHRcdGxpbmVOdW1iZXI6IGwubGluZSArIDEsXG5cdFx0XHRcdFx0Y29sdW1uOiBsLmNoYXJhY3RlciA+IDAgPyBsLmNoYXJhY3RlciArIDEgOiB1bmRlZmluZWQsIC8vIGEgY29sdW1uIHZhbHVlIG9mIDAgcmVzdWx0cyBpbiBhbiBvbWl0dGVkIGNvbHVtbiBhdHRyaWJ1dGU7IHNlZSAjNDY3ODRcblx0XHRcdFx0XHRjb25kaXRpb246IGwuY29uZGl0aW9uLFxuXHRcdFx0XHRcdGhpdENvbmRpdGlvbjogbC5oaXRDb25kaXRpb24sXG5cdFx0XHRcdFx0bG9nTWVzc2FnZTogbC5sb2dNZXNzYWdlLFxuXHRcdFx0XHRcdG1vZGU6IGwubW9kZSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5hZGRCcmVha3BvaW50cyh1cmkucmV2aXZlKGR0by51cmkpLCByYXdicHMpO1xuXHRcdFx0fSBlbHNlIGlmIChkdG8udHlwZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5hZGRGdW5jdGlvbkJyZWFrcG9pbnQoe1xuXHRcdFx0XHRcdG5hbWU6IGR0by5mdW5jdGlvbk5hbWUsXG5cdFx0XHRcdFx0bW9kZTogZHRvLm1vZGUsXG5cdFx0XHRcdFx0Y29uZGl0aW9uOiBkdG8uY29uZGl0aW9uLFxuXHRcdFx0XHRcdGhpdENvbmRpdGlvbjogZHRvLmhpdENvbmRpdGlvbixcblx0XHRcdFx0XHRlbmFibGVkOiBkdG8uZW5hYmxlZCxcblx0XHRcdFx0XHRsb2dNZXNzYWdlOiBkdG8ubG9nTWVzc2FnZVxuXHRcdFx0XHR9LCBkdG8uaWQpO1xuXHRcdFx0fSBlbHNlIGlmIChkdG8udHlwZSA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmFkZERhdGFCcmVha3BvaW50KHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZHRvLmxhYmVsLFxuXHRcdFx0XHRcdHNyYzogeyB0eXBlOiBEYXRhQnJlYWtwb2ludFNldFR5cGUuVmFyaWFibGUsIGRhdGFJZDogZHRvLmRhdGFJZCB9LFxuXHRcdFx0XHRcdGNhblBlcnNpc3Q6IGR0by5jYW5QZXJzaXN0LFxuXHRcdFx0XHRcdGFjY2Vzc1R5cGVzOiBkdG8uYWNjZXNzVHlwZXMsXG5cdFx0XHRcdFx0YWNjZXNzVHlwZTogZHRvLmFjY2Vzc1R5cGUsXG5cdFx0XHRcdFx0bW9kZTogZHRvLm1vZGVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHB1YmxpYyAkdW5yZWdpc3RlckJyZWFrcG9pbnRzKGJyZWFrcG9pbnRJZHM6IHN0cmluZ1tdLCBmdW5jdGlvbkJyZWFrcG9pbnRJZHM6IHN0cmluZ1tdLCBkYXRhQnJlYWtwb2ludElkczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRicmVha3BvaW50SWRzLmZvckVhY2goaWQgPT4gdGhpcy5kZWJ1Z1NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoaWQpKTtcblx0XHRmdW5jdGlvbkJyZWFrcG9pbnRJZHMuZm9yRWFjaChpZCA9PiB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGlkKSk7XG5cdFx0ZGF0YUJyZWFrcG9pbnRJZHMuZm9yRWFjaChpZCA9PiB0aGlzLmRlYnVnU2VydmljZS5yZW1vdmVEYXRhQnJlYWtwb2ludHMoaWQpKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRwdWJsaWMgJHJlZ2lzdGVyRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIoZGVidWdUeXBlOiBzdHJpbmcsIHByb3ZpZGVyVHJpZ2dlcktpbmQ6IERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQsIGhhc1Byb3ZpZGU6IGJvb2xlYW4sIGhhc1Jlc29sdmU6IGJvb2xlYW4sIGhhc1Jlc29sdmUyOiBib29sZWFuLCBoYW5kbGU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgcHJvdmlkZXI6IElEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciA9IHtcblx0XHRcdHR5cGU6IGRlYnVnVHlwZSxcblx0XHRcdHRyaWdnZXJLaW5kOiBwcm92aWRlclRyaWdnZXJLaW5kXG5cdFx0fTtcblx0XHRpZiAoaGFzUHJvdmlkZSkge1xuXHRcdFx0cHJvdmlkZXIucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMgPSAoZm9sZGVyLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zKGhhbmRsZSwgZm9sZGVyLCB0b2tlbik7XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAoaGFzUmVzb2x2ZSkge1xuXHRcdFx0cHJvdmlkZXIucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbiA9IChmb2xkZXIsIGNvbmZpZywgdG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZXNvbHZlRGVidWdDb25maWd1cmF0aW9uKGhhbmRsZSwgZm9sZGVyLCBjb25maWcsIHRva2VuKTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChoYXNSZXNvbHZlMikge1xuXHRcdFx0cHJvdmlkZXIucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbldpdGhTdWJzdGl0dXRlZFZhcmlhYmxlcyA9IChmb2xkZXIsIGNvbmZpZywgdG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzKGhhbmRsZSwgZm9sZGVyLCBjb25maWcsIHRva2VuKTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdHRoaXMuX2RlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVycy5zZXQoaGFuZGxlLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLmRlYnVnU2VydmljZS5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpLnJlZ2lzdGVyRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIocHJvdmlkZXIpKTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyAkdW5yZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9kZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9kZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHR0aGlzLmRlYnVnU2VydmljZS5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpLnVucmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcihwcm92aWRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljICRyZWdpc3RlckRlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3J5KGRlYnVnVHlwZTogc3RyaW5nLCBoYW5kbGU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgcHJvdmlkZXI6IElEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeSA9IHtcblx0XHRcdHR5cGU6IGRlYnVnVHlwZSxcblx0XHRcdGNyZWF0ZURlYnVnQWRhcHRlckRlc2NyaXB0b3I6IHNlc3Npb24gPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX3Byb3h5LiRwcm92aWRlRGVidWdBZGFwdGVyKGhhbmRsZSwgdGhpcy5nZXRTZXNzaW9uRHRvKHNlc3Npb24pKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9kZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkucmVnaXN0ZXJEZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yeShwcm92aWRlcikpO1xuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljICR1bnJlZ2lzdGVyRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2RlYnVnQWRhcHRlckRlc2NyaXB0b3JGYWN0b3JpZXMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9kZWJ1Z0FkYXB0ZXJEZXNjcmlwdG9yRmFjdG9yaWVzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0dGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0QWRhcHRlck1hbmFnZXIoKS51bnJlZ2lzdGVyRGVidWdBZGFwdGVyRGVzY3JpcHRvckZhY3RvcnkocHJvdmlkZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U2Vzc2lvbihzZXNzaW9uSWQ6IERlYnVnU2Vzc2lvblVVSUQgfCB1bmRlZmluZWQpOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKHNlc3Npb25JZCwgdHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJHN0YXJ0RGVidWdnaW5nKGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZCwgbmFtZU9yQ29uZmlnOiBzdHJpbmcgfCBJRGVidWdDb25maWd1cmF0aW9uLCBvcHRpb25zOiBJU3RhcnREZWJ1Z2dpbmdPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gZm9sZGVyID8gdXJpLnJldml2ZShmb2xkZXIpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGxhdW5jaCA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCkuZ2V0TGF1bmNoKGZvbGRlclVyaSk7XG5cdFx0Y29uc3QgcGFyZW50U2Vzc2lvbiA9IHRoaXMuZ2V0U2Vzc2lvbihvcHRpb25zLnBhcmVudFNlc3Npb25JRCk7XG5cdFx0Y29uc3Qgc2F2ZUJlZm9yZVN0YXJ0ID0gdHlwZW9mIG9wdGlvbnMuc3VwcHJlc3NTYXZlQmVmb3JlU3RhcnQgPT09ICdib29sZWFuJyA/ICFvcHRpb25zLnN1cHByZXNzU2F2ZUJlZm9yZVN0YXJ0IDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGRlYnVnT3B0aW9uczogSURlYnVnU2Vzc2lvbk9wdGlvbnMgPSB7XG5cdFx0XHRub0RlYnVnOiBvcHRpb25zLm5vRGVidWcsXG5cdFx0XHRwYXJlbnRTZXNzaW9uLFxuXHRcdFx0bGlmZWN5Y2xlTWFuYWdlZEJ5UGFyZW50OiBvcHRpb25zLmxpZmVjeWNsZU1hbmFnZWRCeVBhcmVudCxcblx0XHRcdHJlcGw6IG9wdGlvbnMucmVwbCxcblx0XHRcdGNvbXBhY3Q6IG9wdGlvbnMuY29tcGFjdCxcblx0XHRcdGNvbXBvdW5kUm9vdDogcGFyZW50U2Vzc2lvbj8uY29tcG91bmRSb290LFxuXHRcdFx0c2F2ZUJlZm9yZVJlc3RhcnQ6IHNhdmVCZWZvcmVTdGFydCxcblx0XHRcdHRlc3RSdW46IG9wdGlvbnMudGVzdFJ1bixcblxuXHRcdFx0c3VwcHJlc3NEZWJ1Z1N0YXR1c2Jhcjogb3B0aW9ucy5zdXBwcmVzc0RlYnVnU3RhdHVzYmFyLFxuXHRcdFx0c3VwcHJlc3NEZWJ1Z1Rvb2xiYXI6IG9wdGlvbnMuc3VwcHJlc3NEZWJ1Z1Rvb2xiYXIsXG5cdFx0XHRzdXBwcmVzc0RlYnVnVmlldzogb3B0aW9ucy5zdXBwcmVzc0RlYnVnVmlldyxcblx0XHR9O1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWJ1Z1NlcnZpY2Uuc3RhcnREZWJ1Z2dpbmcobGF1bmNoLCBuYW1lT3JDb25maWcsIGRlYnVnT3B0aW9ucywgc2F2ZUJlZm9yZVN0YXJ0KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvck5vVGVsZW1ldHJ5KGVyciAmJiBlcnIubWVzc2FnZSA/IGVyci5tZXNzYWdlIDogJ2Nhbm5vdCBzdGFydCBkZWJ1Z2dpbmcnKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgJHNldERlYnVnU2Vzc2lvbk5hbWUoc2Vzc2lvbklkOiBEZWJ1Z1Nlc3Npb25VVUlELCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0c2Vzc2lvbj8uc2V0TmFtZShuYW1lKTtcblx0fVxuXG5cdHB1YmxpYyAkY3VzdG9tRGVidWdBZGFwdGVyUmVxdWVzdChzZXNzaW9uSWQ6IERlYnVnU2Vzc2lvblVVSUQsIHJlcXVlc3Q6IHN0cmluZywgYXJnczogdW5rbm93bik6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb24oc2Vzc2lvbklkLCB0cnVlKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHNlc3Npb24uY3VzdG9tUmVxdWVzdChyZXF1ZXN0LCBhcmdzKS50aGVuKHJlc3BvbnNlID0+IHtcblx0XHRcdFx0aWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLnN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzcG9uc2UuYm9keTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yTm9UZWxlbWV0cnkocmVzcG9uc2UgPyByZXNwb25zZS5tZXNzYWdlIDogJ2N1c3RvbSByZXF1ZXN0IGZhaWxlZCcpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3JOb1RlbGVtZXRyeSgnZGVidWcgc2Vzc2lvbiBub3QgZm91bmQnKSk7XG5cdH1cblxuXHRwdWJsaWMgJGdldERlYnVnUHJvdG9jb2xCcmVha3BvaW50KHNlc3Npb25JZDogRGVidWdTZXNzaW9uVVVJRCwgYnJlYWtwb2luSWQ6IHN0cmluZyk6IFByb21pc2U8RGVidWdQcm90b2NvbC5CcmVha3BvaW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbihzZXNzaW9uSWQsIHRydWUpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHNlc3Npb24uZ2V0RGVidWdQcm90b2NvbEJyZWFrcG9pbnQoYnJlYWtwb2luSWQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvck5vVGVsZW1ldHJ5KCdkZWJ1ZyBzZXNzaW9uIG5vdCBmb3VuZCcpKTtcblx0fVxuXG5cdHB1YmxpYyAkc3RvcERlYnVnZ2luZyhzZXNzaW9uSWQ6IERlYnVnU2Vzc2lvblVVSUQgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc2Vzc2lvbklkKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9uKHNlc3Npb25JZCwgdHJ1ZSk7XG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5kZWJ1Z1NlcnZpY2Uuc3RvcFNlc3Npb24oc2Vzc2lvbiwgaXNTZXNzaW9uQXR0YWNoKHNlc3Npb24pKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1x0Ly8gc3RvcCBhbGxcblx0XHRcdHJldHVybiB0aGlzLmRlYnVnU2VydmljZS5zdG9wU2Vzc2lvbih1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yTm9UZWxlbWV0cnkoJ2RlYnVnIHNlc3Npb24gbm90IGZvdW5kJykpO1xuXHR9XG5cblx0cHVibGljICRhcHBlbmREZWJ1Z0NvbnNvbGUodmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIFVzZSB3YXJuaW5nIGFzIHNldmVyaXR5IHRvIGdldCB0aGUgb3JhbmdlIGNvbG9yIGZvciBtZXNzYWdlcyBjb21pbmcgZnJvbSB0aGUgZGVidWcgZXh0ZW5zaW9uXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdHNlc3Npb24/LmFwcGVuZFRvUmVwbCh7IG91dHB1dDogdmFsdWUsIHNldjogc2V2ZXJpdHkuV2FybmluZyB9KTtcblx0fVxuXG5cdHB1YmxpYyAkYWNjZXB0REFNZXNzYWdlKGhhbmRsZTogbnVtYmVyLCBtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSkge1xuXHRcdHRoaXMuZ2V0RGVidWdBZGFwdGVyKGhhbmRsZSkuYWNjZXB0TWVzc2FnZShjb252ZXJ0VG9WU0NQYXRocyhtZXNzYWdlLCBmYWxzZSkpO1xuXHR9XG5cblx0cHVibGljICRhY2NlcHREQUVycm9yKGhhbmRsZTogbnVtYmVyLCBuYW1lOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZywgc3RhY2s6IHN0cmluZykge1xuXHRcdC8vIGRvbid0IHVzZSBnZXREZWJ1Z0FkYXB0ZXIgc2luY2UgYW4gZXJyb3IgY2FuIGJlIGV4cGVjdGVkIG9uIGEgcG9zdC1jbG9zZVxuXHRcdHRoaXMuX2RlYnVnQWRhcHRlcnMuZ2V0KGhhbmRsZSk/LmZpcmVFcnJvcihoYW5kbGUsIG5ldyBFcnJvcihgJHtuYW1lfTogJHttZXNzYWdlfVxcbiR7c3RhY2t9YCkpO1xuXHR9XG5cblx0cHVibGljICRhY2NlcHREQUV4aXQoaGFuZGxlOiBudW1iZXIsIGNvZGU6IG51bWJlciwgc2lnbmFsOiBzdHJpbmcpIHtcblx0XHQvLyBkb24ndCB1c2UgZ2V0RGVidWdBZGFwdGVyIHNpbmNlIGFuIGVycm9yIGNhbiBiZSBleHBlY3RlZCBvbiBhIHBvc3QtY2xvc2Vcblx0XHR0aGlzLl9kZWJ1Z0FkYXB0ZXJzLmdldChoYW5kbGUpPy5maXJlRXhpdChoYW5kbGUsIGNvZGUsIHNpZ25hbCk7XG5cdH1cblxuXHRwcml2YXRlIGdldERlYnVnQWRhcHRlcihoYW5kbGU6IG51bWJlcik6IEV4dGVuc2lvbkhvc3REZWJ1Z0FkYXB0ZXIge1xuXHRcdGNvbnN0IGFkYXB0ZXIgPSB0aGlzLl9kZWJ1Z0FkYXB0ZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghYWRhcHRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGRlYnVnIGFkYXB0ZXInKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFkYXB0ZXI7XG5cdH1cblxuXHQvLyBkdG8gaGVscGVyc1xuXG5cdHB1YmxpYyAkc2Vzc2lvbkNhY2hlZChzZXNzaW9uSUQ6IHN0cmluZykge1xuXHRcdC8vIHJlbWVtYmVyIHRoYXQgdGhlIEVIIGhhcyBjYWNoZWQgdGhlIHNlc3Npb24gYW5kIHdlIGRvIG5vdCBoYXZlIHRvIHNlbmQgaXQgYWdhaW5cblx0XHR0aGlzLl9leHRIb3N0S25vd25TZXNzaW9ucy5hZGQoc2Vzc2lvbklEKTtcblx0fVxuXG5cblx0Z2V0U2Vzc2lvbkR0byhzZXNzaW9uOiB1bmRlZmluZWQpOiB1bmRlZmluZWQ7XG5cdGdldFNlc3Npb25EdG8oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IElEZWJ1Z1Nlc3Npb25EdG87XG5cdGdldFNlc3Npb25EdG8oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IElEZWJ1Z1Nlc3Npb25EdG8gfCB1bmRlZmluZWQ7XG5cdGdldFNlc3Npb25EdG8oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IElEZWJ1Z1Nlc3Npb25EdG8gfCB1bmRlZmluZWQge1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uSUQgPSBzZXNzaW9uLmdldElkKCk7XG5cdFx0XHRpZiAodGhpcy5fZXh0SG9zdEtub3duU2Vzc2lvbnMuaGFzKHNlc3Npb25JRCkpIHtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb25JRDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHRoaXMuX3Nlc3Npb25zLmFkZChzZXNzaW9uSUQpOyBcdC8vICM2OTUzNDogc2VlICRzZXNzaW9uQ2FjaGVkIGFib3ZlXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IHNlc3Npb25JRCxcblx0XHRcdFx0XHR0eXBlOiBzZXNzaW9uLmNvbmZpZ3VyYXRpb24udHlwZSxcblx0XHRcdFx0XHRuYW1lOiBzZXNzaW9uLm5hbWUsXG5cdFx0XHRcdFx0Zm9sZGVyVXJpOiBzZXNzaW9uLnJvb3QgPyBzZXNzaW9uLnJvb3QudXJpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb246IHNlc3Npb24uY29uZmlndXJhdGlvbixcblx0XHRcdFx0XHRwYXJlbnQ6IHNlc3Npb24ucGFyZW50U2Vzc2lvbj8uZ2V0SWQoKSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgY29udmVydFRvRHRvKGJwczogKFJlYWRvbmx5QXJyYXk8SUJyZWFrcG9pbnQgfCBJRnVuY3Rpb25CcmVha3BvaW50IHwgSURhdGFCcmVha3BvaW50IHwgSUluc3RydWN0aW9uQnJlYWtwb2ludD4pKTogQXJyYXk8SVNvdXJjZUJyZWFrcG9pbnREdG8gfCBJRnVuY3Rpb25CcmVha3BvaW50RHRvIHwgSURhdGFCcmVha3BvaW50RHRvPiB7XG5cdFx0cmV0dXJuIGJwcy5tYXAoYnAgPT4ge1xuXHRcdFx0aWYgKCduYW1lJyBpbiBicCkge1xuXHRcdFx0XHRjb25zdCBmYnA6IElGdW5jdGlvbkJyZWFrcG9pbnQgPSBicDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAnZnVuY3Rpb24nLFxuXHRcdFx0XHRcdGlkOiBmYnAuZ2V0SWQoKSxcblx0XHRcdFx0XHRlbmFibGVkOiBmYnAuZW5hYmxlZCxcblx0XHRcdFx0XHRjb25kaXRpb246IGZicC5jb25kaXRpb24sXG5cdFx0XHRcdFx0aGl0Q29uZGl0aW9uOiBmYnAuaGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRcdGxvZ01lc3NhZ2U6IGZicC5sb2dNZXNzYWdlLFxuXHRcdFx0XHRcdGZ1bmN0aW9uTmFtZTogZmJwLm5hbWVcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSUZ1bmN0aW9uQnJlYWtwb2ludER0bztcblx0XHRcdH0gZWxzZSBpZiAoJ3NyYycgaW4gYnApIHtcblx0XHRcdFx0Y29uc3QgZGJwOiBJRGF0YUJyZWFrcG9pbnQgPSBicDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAnZGF0YScsXG5cdFx0XHRcdFx0aWQ6IGRicC5nZXRJZCgpLFxuXHRcdFx0XHRcdGRhdGFJZDogZGJwLnNyYy50eXBlID09PSBEYXRhQnJlYWtwb2ludFNldFR5cGUuVmFyaWFibGUgPyBkYnAuc3JjLmRhdGFJZCA6IGRicC5zcmMuYWRkcmVzcyxcblx0XHRcdFx0XHRlbmFibGVkOiBkYnAuZW5hYmxlZCxcblx0XHRcdFx0XHRjb25kaXRpb246IGRicC5jb25kaXRpb24sXG5cdFx0XHRcdFx0aGl0Q29uZGl0aW9uOiBkYnAuaGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRcdGxvZ01lc3NhZ2U6IGRicC5sb2dNZXNzYWdlLFxuXHRcdFx0XHRcdGFjY2Vzc1R5cGU6IGRicC5hY2Nlc3NUeXBlLFxuXHRcdFx0XHRcdGxhYmVsOiBkYnAuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0Y2FuUGVyc2lzdDogZGJwLmNhblBlcnNpc3Rcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSURhdGFCcmVha3BvaW50RHRvO1xuXHRcdFx0fSBlbHNlIGlmICgndXJpJyBpbiBicCkge1xuXHRcdFx0XHRjb25zdCBzYnA6IElCcmVha3BvaW50ID0gYnA7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ3NvdXJjZScsXG5cdFx0XHRcdFx0aWQ6IHNicC5nZXRJZCgpLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHNicC5lbmFibGVkLFxuXHRcdFx0XHRcdGNvbmRpdGlvbjogc2JwLmNvbmRpdGlvbixcblx0XHRcdFx0XHRoaXRDb25kaXRpb246IHNicC5oaXRDb25kaXRpb24sXG5cdFx0XHRcdFx0bG9nTWVzc2FnZTogc2JwLmxvZ01lc3NhZ2UsXG5cdFx0XHRcdFx0dXJpOiBzYnAudXJpLFxuXHRcdFx0XHRcdGxpbmU6IHNicC5saW5lTnVtYmVyID4gMCA/IHNicC5saW5lTnVtYmVyIC0gMSA6IDAsXG5cdFx0XHRcdFx0Y2hhcmFjdGVyOiAodHlwZW9mIHNicC5jb2x1bW4gPT09ICdudW1iZXInICYmIHNicC5jb2x1bW4gPiAwKSA/IHNicC5jb2x1bW4gLSAxIDogMCxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVNvdXJjZUJyZWFrcG9pbnREdG87XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pLmZpbHRlcihpc0RlZmluZWQpO1xuXHR9XG59XG5cbi8qKlxuICogRGVidWdBZGFwdGVyIHRoYXQgY29tbXVuaWNhdGVzIHZpYSBleHRlbnNpb24gcHJvdG9jb2wgd2l0aCBhbm90aGVyIGRlYnVnIGFkYXB0ZXIuXG4gKi9cbmNsYXNzIEV4dGVuc2lvbkhvc3REZWJ1Z0FkYXB0ZXIgZXh0ZW5kcyBBYnN0cmFjdERlYnVnQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZHM6IE1haW5UaHJlYWREZWJ1Z1NlcnZpY2UsIHByaXZhdGUgX2hhbmRsZTogbnVtYmVyLCBwcml2YXRlIF9wcm94eTogRXh0SG9zdERlYnVnU2VydmljZVNoYXBlLCByZWFkb25seSBzZXNzaW9uOiBJRGVidWdTZXNzaW9uKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGZpcmVFcnJvcihoYW5kbGU6IG51bWJlciwgZXJyOiBFcnJvcikge1xuXHRcdHRoaXMuX29uRXJyb3IuZmlyZShlcnIpO1xuXHR9XG5cblx0ZmlyZUV4aXQoaGFuZGxlOiBudW1iZXIsIGNvZGU6IG51bWJlciwgc2lnbmFsOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9vbkV4aXQuZmlyZShjb2RlKTtcblx0fVxuXG5cdHN0YXJ0U2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX3Byb3h5LiRzdGFydERBU2Vzc2lvbih0aGlzLl9oYW5kbGUsIHRoaXMuX2RzLmdldFNlc3Npb25EdG8odGhpcy5zZXNzaW9uKSkpO1xuXHR9XG5cblx0c2VuZE1lc3NhZ2UobWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kc2VuZERBTWVzc2FnZSh0aGlzLl9oYW5kbGUsIGNvbnZlcnRUb0RBUGF0aHMobWVzc2FnZSwgdHJ1ZSkpO1xuXHR9XG5cblx0YXN5bmMgc3RvcFNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5jYW5jZWxQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX3Byb3h5LiRzdG9wREFTZXNzaW9uKHRoaXMuX2hhbmRsZSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZSxpQkFBOEIsb0JBQW9CO0FBQzFFLFNBQVMsT0FBTyxXQUEwQjtBQUMxQyxTQUFTLGVBQWtTLHFCQUFxQiw2QkFBNkI7QUFDN1Y7QUFBQSxFQUNDO0FBQUEsRUFBeUY7QUFBQSxPQUVuRjtBQUNQLFNBQVMsNEJBQTZDO0FBQ3RELE9BQU8sY0FBYztBQUNyQixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLG1CQUFtQixrQkFBa0IsdUJBQXVCO0FBQ3JFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUduQixJQUFNLHlCQUFOLE1BQTBGO0FBQUEsRUFZaEcsWUFDQyxnQkFDZ0MsY0FDVSxtQkFDekM7QUFGK0I7QUFDVTtBQVozQyxTQUFpQixhQUFhLElBQUksZ0JBQWdCO0FBRWxELFNBQVEsOEJBQThCO0FBSXRDLFNB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
