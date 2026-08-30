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
import { IntervalTimer } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import * as errors from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import * as nls from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { RemoteAuthorityResolverErrorCode, getRemoteAuthorityPrefix } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { ExtHostCustomersRegistry } from "./extHostCustomers.js";
import { extensionHostKindToString } from "./extensionHostKind.js";
import { ActivationKind } from "./extensions.js";
import { RPCProtocol, RequestInitiator } from "./rpcProtocol.js";
const LOG_EXTENSION_HOST_COMMUNICATION = false;
const LOG_USE_COLORS = true;
let ExtensionHostManager = class extends Disposable {
  constructor(extensionHost, initialActivationEvents, _internalExtensionService, _instantiationService, _environmentService, _telemetryService, _logService) {
    super();
    this._internalExtensionService = _internalExtensionService;
    this._instantiationService = _instantiationService;
    this._environmentService = _environmentService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._onDidChangeResponsiveState = this._register(new Emitter());
    this.onDidChangeResponsiveState = this._onDidChangeResponsiveState.event;
    this._hasStarted = false;
    this._cachedActivationEvents = /* @__PURE__ */ new Map();
    this._resolvedActivationEvents = /* @__PURE__ */ new Set();
    this._rpcProtocol = null;
    this._customers = [];
    this._extensionHost = extensionHost;
    this.onDidExit = this._extensionHost.onExit;
    const startingTelemetryEvent = {
      time: Date.now(),
      action: "starting",
      kind: extensionHostKindToString(this.kind)
    };
    this._telemetryService.publicLog2("extensionHostStartup", startingTelemetryEvent);
    this._proxy = this._extensionHost.start().then(
      (protocol) => {
        const successTelemetryEvent = {
          time: Date.now(),
          action: "success",
          kind: extensionHostKindToString(this.kind)
        };
        this._telemetryService.publicLog2("extensionHostStartup", successTelemetryEvent);
        return this._createExtensionHostCustomers(this.kind, protocol);
      },
      (err) => {
        this._logService.error(`Error received from starting extension host (kind: ${extensionHostKindToString(this.kind)})`);
        this._logService.error(err);
        const failureTelemetryEvent = {
          time: Date.now(),
          action: "error",
          kind: extensionHostKindToString(this.kind)
        };
        if (err && err.name) {
          failureTelemetryEvent.errorName = err.name;
        }
        if (err && err.message) {
          failureTelemetryEvent.errorMessage = err.message;
        }
        if (err && err.stack) {
          failureTelemetryEvent.errorStack = err.stack;
        }
        this._telemetryService.publicLog2("extensionHostStartup", failureTelemetryEvent);
        return null;
      }
    );
    this._proxy.then(() => {
      this._hasStarted = true;
      initialActivationEvents.forEach((activationEvent) => this.activateByEvent(activationEvent, ActivationKind.Normal));
      this._register(registerLatencyTestProvider({
        measure: () => this.measure()
      }));
    });
  }
  get pid() {
    return this._extensionHost.pid;
  }
  get kind() {
    return this._extensionHost.runningLocation.kind;
  }
  get startup() {
    return this._extensionHost.startup;
  }
  get friendyName() {
    return friendlyExtHostName(this.kind, this.pid);
  }
  async disconnect() {
    await this._extensionHost?.disconnect?.();
  }
  dispose() {
    this._extensionHost?.dispose();
    this._rpcProtocol?.dispose();
    for (let i = 0, len = this._customers.length; i < len; i++) {
      const customer = this._customers[i];
      try {
        customer.dispose();
      } catch (err) {
        errors.onUnexpectedError(err);
      }
    }
    this._proxy = null;
    super.dispose();
  }
  async measure() {
    const proxy = await this._proxy;
    if (!proxy) {
      return null;
    }
    const latency = await this._measureLatency(proxy);
    const down = await this._measureDown(proxy);
    const up = await this._measureUp(proxy);
    return {
      remoteAuthority: this._extensionHost.remoteAuthority,
      latency,
      down,
      up
    };
  }
  get isReady() {
    return this._hasStarted;
  }
  async ready() {
    await this._proxy;
  }
  async _measureLatency(proxy) {
    const COUNT = 10;
    let sum = 0;
    for (let i = 0; i < COUNT; i++) {
      const sw = StopWatch.create();
      await proxy.test_latency(i);
      sw.stop();
      sum += sw.elapsed();
    }
    return sum / COUNT;
  }
  static _convert(byteCount, elapsedMillis) {
    return byteCount * 1e3 * 8 / elapsedMillis;
  }
  async _measureUp(proxy) {
    const SIZE = 10 * 1024 * 1024;
    const buff = VSBuffer.alloc(SIZE);
    const value = Math.ceil(Math.random() * 256);
    for (let i = 0; i < buff.byteLength; i++) {
      buff.writeUInt8(i, value);
    }
    const sw = StopWatch.create();
    await proxy.test_up(buff);
    sw.stop();
    return ExtensionHostManager._convert(SIZE, sw.elapsed());
  }
  async _measureDown(proxy) {
    const SIZE = 10 * 1024 * 1024;
    const sw = StopWatch.create();
    await proxy.test_down(SIZE);
    sw.stop();
    return ExtensionHostManager._convert(SIZE, sw.elapsed());
  }
  _createExtensionHostCustomers(kind, protocol) {
    let logger = null;
    if (LOG_EXTENSION_HOST_COMMUNICATION || this._environmentService.logExtensionHostCommunication) {
      logger = new RPCLogger(kind);
    } else if (TelemetryRPCLogger.isEnabled()) {
      logger = new TelemetryRPCLogger(this._telemetryService);
    }
    this._rpcProtocol = new RPCProtocol(protocol, logger);
    this._register(this._rpcProtocol.onDidChangeResponsiveState((responsiveState) => this._onDidChangeResponsiveState.fire(responsiveState)));
    let extensionHostProxy = null;
    let mainProxyIdentifiers = [];
    const extHostContext = {
      remoteAuthority: this._extensionHost.remoteAuthority,
      extensionHostKind: this.kind,
      getProxy: (identifier) => this._rpcProtocol.getProxy(identifier),
      set: (identifier, instance) => this._rpcProtocol.set(identifier, instance),
      dispose: () => this._rpcProtocol.dispose(),
      assertRegistered: (identifiers) => this._rpcProtocol.assertRegistered(identifiers),
      drain: () => this._rpcProtocol.drain(),
      //#region internal
      internalExtensionService: this._internalExtensionService,
      _setExtensionHostProxy: (value) => {
        extensionHostProxy = value;
      },
      _setAllMainProxyIdentifiers: (value) => {
        mainProxyIdentifiers = value;
      }
      //#endregion
    };
    const namedCustomers = ExtHostCustomersRegistry.getNamedCustomers();
    for (let i = 0, len = namedCustomers.length; i < len; i++) {
      const [id, ctor] = namedCustomers[i];
      try {
        const instance = this._instantiationService.createInstance(ctor, extHostContext);
        this._customers.push(instance);
        this._rpcProtocol.set(id, instance);
      } catch (err) {
        this._logService.error(`Cannot instantiate named customer: '${id.sid}'`);
        this._logService.error(err);
        errors.onUnexpectedError(err);
      }
    }
    const customers = ExtHostCustomersRegistry.getCustomers();
    for (const ctor of customers) {
      try {
        const instance = this._instantiationService.createInstance(ctor, extHostContext);
        this._customers.push(instance);
      } catch (err) {
        this._logService.error(err);
        errors.onUnexpectedError(err);
      }
    }
    if (!extensionHostProxy) {
      throw new Error(`Missing IExtensionHostProxy!`);
    }
    this._rpcProtocol.assertRegistered(mainProxyIdentifiers);
    return extensionHostProxy;
  }
  async activate(extension, reason) {
    const proxy = await this._proxy;
    if (!proxy) {
      return false;
    }
    return proxy.activate(extension, reason);
  }
  activateByEvent(activationEvent, activationKind) {
    if (!this._cachedActivationEvents.has(activationEvent)) {
      this._cachedActivationEvents.set(activationEvent, this._activateByEvent(activationEvent, activationKind));
    }
    return this._cachedActivationEvents.get(activationEvent);
  }
  activationEventIsDone(activationEvent) {
    return this._resolvedActivationEvents.has(activationEvent);
  }
  async _activateByEvent(activationEvent, activationKind) {
    if (!this._proxy) {
      return;
    }
    const proxy = await this._proxy;
    if (!proxy) {
      return;
    }
    if (!this._extensionHost.extensions.containsActivationEvent(activationEvent)) {
      this._resolvedActivationEvents.add(activationEvent);
      return;
    }
    await proxy.activateByEvent(activationEvent, activationKind);
    this._resolvedActivationEvents.add(activationEvent);
  }
  async getInspectPort(tryEnableInspector) {
    if (this._extensionHost) {
      if (tryEnableInspector) {
        await this._extensionHost.enableInspectPort();
      }
      const port = this._extensionHost.getInspectPort();
      if (port) {
        return port;
      }
    }
    return void 0;
  }
  async resolveAuthority(remoteAuthority, resolveAttempt) {
    const sw = StopWatch.create(false);
    const prefix = () => `[${extensionHostKindToString(this._extensionHost.runningLocation.kind)}${this._extensionHost.runningLocation.affinity}][resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthority)},${resolveAttempt})][${sw.elapsed()}ms] `;
    const logInfo = (msg) => this._logService.info(`${prefix()}${msg}`);
    const logError = (msg, err = void 0) => this._logService.error(`${prefix()}${msg}`, err);
    logInfo(`obtaining proxy...`);
    const proxy = await this._proxy;
    if (!proxy) {
      logError(`no proxy`);
      return {
        type: "error",
        error: {
          message: `Cannot resolve authority`,
          code: RemoteAuthorityResolverErrorCode.Unknown,
          detail: void 0
        }
      };
    }
    logInfo(`invoking...`);
    const intervalLogger = new IntervalTimer();
    try {
      intervalLogger.cancelAndSet(() => logInfo("waiting..."), 1e3);
      const resolverResult = await proxy.resolveAuthority(remoteAuthority, resolveAttempt);
      intervalLogger.dispose();
      if (resolverResult.type === "ok") {
        logInfo(`returned ${resolverResult.value.authority.connectTo}`);
      } else {
        logError(`returned an error`, resolverResult.error);
      }
      return resolverResult;
    } catch (err) {
      intervalLogger.dispose();
      logError(`returned an error`, err);
      return {
        type: "error",
        error: {
          message: err.message,
          code: RemoteAuthorityResolverErrorCode.Unknown,
          detail: err
        }
      };
    }
  }
  async getCanonicalURI(remoteAuthority, uri) {
    const proxy = await this._proxy;
    if (!proxy) {
      throw new Error(`Cannot resolve canonical URI`);
    }
    return proxy.getCanonicalURI(remoteAuthority, uri);
  }
  async start(extensionRegistryVersionId, allExtensions, myExtensions) {
    const proxy = await this._proxy;
    if (!proxy) {
      return;
    }
    const deltaExtensions = this._extensionHost.extensions.set(extensionRegistryVersionId, allExtensions, myExtensions);
    return proxy.startExtensionHost(deltaExtensions);
  }
  async extensionTestsExecute() {
    const proxy = await this._proxy;
    if (!proxy) {
      throw new Error("Could not obtain Extension Host Proxy");
    }
    return proxy.extensionTestsExecute();
  }
  representsRunningLocation(runningLocation) {
    return this._extensionHost.runningLocation.equals(runningLocation);
  }
  async deltaExtensions(incomingExtensionsDelta) {
    const proxy = await this._proxy;
    if (!proxy) {
      return;
    }
    const outgoingExtensionsDelta = this._extensionHost.extensions.delta(incomingExtensionsDelta);
    if (!outgoingExtensionsDelta) {
      return;
    }
    return proxy.deltaExtensions(outgoingExtensionsDelta);
  }
  containsExtension(extensionId) {
    return this._extensionHost.extensions?.containsExtension(extensionId) ?? false;
  }
  async setRemoteEnvironment(env) {
    const proxy = await this._proxy;
    if (!proxy) {
      return;
    }
    return proxy.setRemoteEnvironment(env);
  }
};
ExtensionHostManager = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, ILogService)
], ExtensionHostManager);
function friendlyExtHostName(kind, pid) {
  if (pid) {
    return `${extensionHostKindToString(kind)} pid: ${pid}`;
  }
  return `${extensionHostKindToString(kind)}`;
}
const colorTables = [
  ["#2977B1", "#FC802D", "#34A13A", "#D3282F", "#9366BA"],
  ["#8B564C", "#E177C0", "#7F7F7F", "#BBBE3D", "#2EBECD"]
];
function prettyWithoutArrays(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object" && typeof data.toString === "function") {
    const result = data.toString();
    if (result !== "[object Object]") {
      return result;
    }
  }
  return data;
}
function pretty(data) {
  if (Array.isArray(data)) {
    return data.map(prettyWithoutArrays);
  }
  return prettyWithoutArrays(data);
}
class RPCLogger {
  constructor(_kind) {
    this._kind = _kind;
    this._totalIncoming = 0;
    this._totalOutgoing = 0;
  }
  _log(direction, totalLength, msgLength, req, initiator, str, data) {
    data = pretty(data);
    const colorTable = colorTables[initiator];
    const color = LOG_USE_COLORS ? colorTable[req % colorTable.length] : "#000000";
    let args = [`%c[${extensionHostKindToString(this._kind)}][${direction}]%c[${String(totalLength).padStart(7)}]%c[len: ${String(msgLength).padStart(5)}]%c${String(req).padStart(5)} - ${str}`, "color: darkgreen", "color: grey", "color: grey", `color: ${color}`];
    if (/\($/.test(str)) {
      args = args.concat(data);
      args.push(")");
    } else {
      args.push(data);
    }
    console.log.apply(console, args);
  }
  logIncoming(msgLength, req, initiator, str, data) {
    this._totalIncoming += msgLength;
    this._log("Ext \u2192 Win", this._totalIncoming, msgLength, req, initiator, str, data);
  }
  logOutgoing(msgLength, req, initiator, str, data) {
    this._totalOutgoing += msgLength;
    this._log("Win \u2192 Ext", this._totalOutgoing, msgLength, req, initiator, str, data);
  }
}
let TelemetryRPCLogger = class {
  constructor(_telemetryService) {
    this._telemetryService = _telemetryService;
    this._pendingRequests = /* @__PURE__ */ new Map();
  }
  static isEnabled() {
    return Math.random() < 1e-4;
  }
  logIncoming(msgLength, req, initiator, str) {
    if (initiator === RequestInitiator.LocalSide && /^receiveReply(Err)?:/.test(str)) {
      const requestStr = this._pendingRequests.get(req) ?? "unknown_reply";
      this._pendingRequests.delete(req);
      this._telemetryService.publicLog2("extensionhost.incoming", {
        type: `${str} ${requestStr}`,
        length: msgLength
      });
    }
    if (initiator === RequestInitiator.OtherSide && /^receiveRequest /.test(str)) {
      this._telemetryService.publicLog2("extensionhost.incoming", {
        type: `${str}`,
        length: msgLength
      });
    }
  }
  logOutgoing(msgLength, req, initiator, str) {
    if (initiator === RequestInitiator.LocalSide && str.startsWith("request: ")) {
      this._pendingRequests.set(req, str);
      this._telemetryService.publicLog2("extensionhost.outgoing", {
        type: str,
        length: msgLength
      });
    }
  }
};
TelemetryRPCLogger = __decorateClass([
  __decorateParam(0, ITelemetryService)
], TelemetryRPCLogger);
const providers = [];
function registerLatencyTestProvider(provider) {
  providers.push(provider);
  return {
    dispose: () => {
      for (let i = 0; i < providers.length; i++) {
        if (providers[i] === provider) {
          providers.splice(i, 1);
          return;
        }
      }
    }
  };
}
function getLatencyTestProviders() {
  return providers.slice(0);
}
registerAction2(class MeasureExtHostLatencyAction extends Action2 {
  constructor() {
    super({
      id: "editor.action.measureExtHostLatency",
      title: nls.localize2("measureExtHostLatency", "Measure Extension Host Latency"),
      category: Categories.Developer,
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const measurements = await Promise.all(getLatencyTestProviders().map((provider) => provider.measure()));
    editorService.openEditor({ resource: void 0, contents: measurements.map(MeasureExtHostLatencyAction._print).join("\n\n"), options: { pinned: true } });
  }
  static _print(m) {
    if (!m) {
      return "";
    }
    return `${m.remoteAuthority ? `Authority: ${m.remoteAuthority}
` : ``}Roundtrip latency: ${m.latency.toFixed(3)}ms
Up: ${MeasureExtHostLatencyAction._printSpeed(m.up)}
Down: ${MeasureExtHostLatencyAction._printSpeed(m.down)}
`;
  }
  static _printSpeed(n) {
    if (n <= 1024) {
      return `${n} bps`;
    }
    if (n < 1024 * 1024) {
      return `${(n / 1024).toFixed(1)} kbps`;
    }
    return `${(n / 1024 / 1024).toFixed(1)} Mbps`;
  }
});
export {
  ExtensionHostManager,
  friendlyExtHostName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxjb21tb25cXGV4dGVuc2lvbkhvc3RNYW5hZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSW50ZXJ2YWxUaW1lciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElNZXNzYWdlUGFzc2luZ1Byb3RvY29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZSwgZ2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBdXRob3JpdHlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDdXN0b21lcnNSZWdpc3RyeSwgSUludGVybmFsRXh0SG9zdENvbnRleHQgfSBmcm9tICcuL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSG9zdEtpbmQsIGV4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcgfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RLaW5kLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0TWFuYWdlciB9IGZyb20gJy4vZXh0ZW5zaW9uSG9zdE1hbmFnZXJzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbkRlbHRhIH0gZnJvbSAnLi9leHRlbnNpb25Ib3N0UHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3RQcm94eSwgSVJlc29sdmVBdXRob3JpdHlSZXN1bHQgfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RQcm94eS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25SdW5uaW5nTG9jYXRpb24gfSBmcm9tICcuL2V4dGVuc2lvblJ1bm5pbmdMb2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3RpdmF0aW9uS2luZCwgRXh0ZW5zaW9uQWN0aXZhdGlvblJlYXNvbiwgRXh0ZW5zaW9uSG9zdFN0YXJ0dXAsIElFeHRlbnNpb25Ib3N0LCBJRXh0ZW5zaW9uSW5zcGVjdEluZm8sIElJbnRlcm5hbEV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUHJveGllZCwgUHJveHlJZGVudGlmaWVyIH0gZnJvbSAnLi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgSVJQQ1Byb3RvY29sTG9nZ2VyLCBSUENQcm90b2NvbCwgUmVxdWVzdEluaXRpYXRvciwgUmVzcG9uc2l2ZVN0YXRlIH0gZnJvbSAnLi9ycGNQcm90b2NvbC5qcyc7XG5cbi8vIEVuYWJsZSB0byBzZWUgZGV0YWlsZWQgbWVzc2FnZSBjb21tdW5pY2F0aW9uIGJldHdlZW4gd2luZG93IGFuZCBleHRlbnNpb24gaG9zdFxuY29uc3QgTE9HX0VYVEVOU0lPTl9IT1NUX0NPTU1VTklDQVRJT04gPSBmYWxzZTtcbmNvbnN0IExPR19VU0VfQ09MT1JTID0gdHJ1ZTtcblxudHlwZSBFeHRlbnNpb25Ib3N0U3RhcnR1cENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2FsZXhkaW1hJztcblx0Y29tbWVudDogJ1RoZSBzdGFydHVwIHN0YXRlIG9mIHRoZSBleHRlbnNpb24gaG9zdCc7XG5cdHRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdGltZSByZXBvcnRlZCBieSBEYXRlLm5vdygpLicgfTtcblx0YWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGFjdGlvbjogc3RhcnRpbmcsIHN1Y2Nlc3Mgb3IgZXJyb3IuJyB9O1xuXHRraW5kOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGV4dGVuc2lvbiBob3N0IGtpbmQ6IExvY2FsUHJvY2VzcywgTG9jYWxXZWJXb3JrZXIgb3IgUmVtb3RlLicgfTtcblx0ZXJyb3JOYW1lPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBlcnJvciBuYW1lLicgfTtcblx0ZXJyb3JNZXNzYWdlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBlcnJvciBtZXNzYWdlLicgfTtcblx0ZXJyb3JTdGFjaz86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3Igc3RhY2suJyB9O1xufTtcblxudHlwZSBFeHRlbnNpb25Ib3N0U3RhcnR1cEV2ZW50ID0ge1xuXHR0aW1lOiBudW1iZXI7XG5cdGFjdGlvbjogJ3N0YXJ0aW5nJyB8ICdzdWNjZXNzJyB8ICdlcnJvcic7XG5cdGtpbmQ6IHN0cmluZztcblx0ZXJyb3JOYW1lPzogc3RyaW5nO1xuXHRlcnJvck1lc3NhZ2U/OiBzdHJpbmc7XG5cdGVycm9yU3RhY2s/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uSG9zdE1hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkhvc3RNYW5hZ2VyIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRFeGl0OiBFdmVudDxbbnVtYmVyLCBzdHJpbmcgfCBudWxsXT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VSZXNwb25zaXZlU3RhdGU6IEVtaXR0ZXI8UmVzcG9uc2l2ZVN0YXRlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFJlc3BvbnNpdmVTdGF0ZT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVJlc3BvbnNpdmVTdGF0ZTogRXZlbnQ8UmVzcG9uc2l2ZVN0YXRlPiA9IHRoaXMuX29uRGlkQ2hhbmdlUmVzcG9uc2l2ZVN0YXRlLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBBIG1hcCBvZiBhbHJlYWR5IHJlcXVlc3RlZCBhY3RpdmF0aW9uIGV2ZW50cyB0byBzcGVlZCB0aGluZ3MgdXAgaWYgdGhlIHNhbWUgYWN0aXZhdGlvbiBldmVudCBpcyB0cmlnZ2VyZWQgbXVsdGlwbGUgdGltZXMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZWRBY3RpdmF0aW9uRXZlbnRzOiBNYXA8c3RyaW5nLCBQcm9taXNlPHZvaWQ+Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZWRBY3RpdmF0aW9uRXZlbnRzOiBTZXQ8c3RyaW5nPjtcblx0cHJpdmF0ZSBfcnBjUHJvdG9jb2w6IFJQQ1Byb3RvY29sIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VzdG9tZXJzOiBJRGlzcG9zYWJsZVtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25Ib3N0OiBJRXh0ZW5zaW9uSG9zdDtcblx0cHJpdmF0ZSBfcHJveHk6IFByb21pc2U8SUV4dGVuc2lvbkhvc3RQcm94eSB8IG51bGw+IHwgbnVsbDtcblx0cHJpdmF0ZSBfaGFzU3RhcnRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHB1YmxpYyBnZXQgcGlkKCk6IG51bWJlciB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0LnBpZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQga2luZCgpOiBFeHRlbnNpb25Ib3N0S2luZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbkhvc3QucnVubmluZ0xvY2F0aW9uLmtpbmQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN0YXJ0dXAoKTogRXh0ZW5zaW9uSG9zdFN0YXJ0dXAge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0LnN0YXJ0dXA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGZyaWVuZHlOYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGZyaWVuZGx5RXh0SG9zdE5hbWUodGhpcy5raW5kLCB0aGlzLnBpZCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRlbnNpb25Ib3N0OiBJRXh0ZW5zaW9uSG9zdCxcblx0XHRpbml0aWFsQWN0aXZhdGlvbkV2ZW50czogc3RyaW5nW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW50ZXJuYWxFeHRlbnNpb25TZXJ2aWNlOiBJSW50ZXJuYWxFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jYWNoZWRBY3RpdmF0aW9uRXZlbnRzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cdFx0dGhpcy5fcmVzb2x2ZWRBY3RpdmF0aW9uRXZlbnRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5fcnBjUHJvdG9jb2wgPSBudWxsO1xuXHRcdHRoaXMuX2N1c3RvbWVycyA9IFtdO1xuXG5cdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdCA9IGV4dGVuc2lvbkhvc3Q7XG5cdFx0dGhpcy5vbkRpZEV4aXQgPSB0aGlzLl9leHRlbnNpb25Ib3N0Lm9uRXhpdDtcblxuXHRcdGNvbnN0IHN0YXJ0aW5nVGVsZW1ldHJ5RXZlbnQ6IEV4dGVuc2lvbkhvc3RTdGFydHVwRXZlbnQgPSB7XG5cdFx0XHR0aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0YWN0aW9uOiAnc3RhcnRpbmcnLFxuXHRcdFx0a2luZDogZXh0ZW5zaW9uSG9zdEtpbmRUb1N0cmluZyh0aGlzLmtpbmQpXG5cdFx0fTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RXh0ZW5zaW9uSG9zdFN0YXJ0dXBFdmVudCwgRXh0ZW5zaW9uSG9zdFN0YXJ0dXBDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbkhvc3RTdGFydHVwJywgc3RhcnRpbmdUZWxlbWV0cnlFdmVudCk7XG5cblx0XHR0aGlzLl9wcm94eSA9IHRoaXMuX2V4dGVuc2lvbkhvc3Quc3RhcnQoKS50aGVuKFxuXHRcdFx0KHByb3RvY29sKSA9PiB7XG5cblx0XHRcdFx0Ly8gVHJhY2sgaGVhbHRoeSBleHRlbnNpb24gaG9zdCBzdGFydHVwXG5cdFx0XHRcdGNvbnN0IHN1Y2Nlc3NUZWxlbWV0cnlFdmVudDogRXh0ZW5zaW9uSG9zdFN0YXJ0dXBFdmVudCA9IHtcblx0XHRcdFx0XHR0aW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0XHRcdGFjdGlvbjogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRcdGtpbmQ6IGV4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcodGhpcy5raW5kKVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RXh0ZW5zaW9uSG9zdFN0YXJ0dXBFdmVudCwgRXh0ZW5zaW9uSG9zdFN0YXJ0dXBDbGFzc2lmaWNhdGlvbj4oJ2V4dGVuc2lvbkhvc3RTdGFydHVwJywgc3VjY2Vzc1RlbGVtZXRyeUV2ZW50KTtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRXh0ZW5zaW9uSG9zdEN1c3RvbWVycyh0aGlzLmtpbmQsIHByb3RvY29sKTtcblx0XHRcdH0sXG5cdFx0XHQoZXJyKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHJlY2VpdmVkIGZyb20gc3RhcnRpbmcgZXh0ZW5zaW9uIGhvc3QgKGtpbmQ6ICR7ZXh0ZW5zaW9uSG9zdEtpbmRUb1N0cmluZyh0aGlzLmtpbmQpfSlgKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXG5cdFx0XHRcdC8vIFRyYWNrIGVycm9ycyBkdXJpbmcgZXh0ZW5zaW9uIGhvc3Qgc3RhcnR1cFxuXHRcdFx0XHRjb25zdCBmYWlsdXJlVGVsZW1ldHJ5RXZlbnQ6IEV4dGVuc2lvbkhvc3RTdGFydHVwRXZlbnQgPSB7XG5cdFx0XHRcdFx0dGltZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRhY3Rpb246ICdlcnJvcicsXG5cdFx0XHRcdFx0a2luZDogZXh0ZW5zaW9uSG9zdEtpbmRUb1N0cmluZyh0aGlzLmtpbmQpXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0aWYgKGVyciAmJiBlcnIubmFtZSkge1xuXHRcdFx0XHRcdGZhaWx1cmVUZWxlbWV0cnlFdmVudC5lcnJvck5hbWUgPSBlcnIubmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXJyICYmIGVyci5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0ZmFpbHVyZVRlbGVtZXRyeUV2ZW50LmVycm9yTWVzc2FnZSA9IGVyci5tZXNzYWdlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlcnIgJiYgZXJyLnN0YWNrKSB7XG5cdFx0XHRcdFx0ZmFpbHVyZVRlbGVtZXRyeUV2ZW50LmVycm9yU3RhY2sgPSBlcnIuc3RhY2s7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV4dGVuc2lvbkhvc3RTdGFydHVwRXZlbnQsIEV4dGVuc2lvbkhvc3RTdGFydHVwQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25Ib3N0U3RhcnR1cCcsIGZhaWx1cmVUZWxlbWV0cnlFdmVudCk7XG5cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0KTtcblx0XHR0aGlzLl9wcm94eS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMuX2hhc1N0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0aW5pdGlhbEFjdGl2YXRpb25FdmVudHMuZm9yRWFjaCgoYWN0aXZhdGlvbkV2ZW50KSA9PiB0aGlzLmFjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQsIEFjdGl2YXRpb25LaW5kLk5vcm1hbCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJMYXRlbmN5VGVzdFByb3ZpZGVyKHtcblx0XHRcdFx0bWVhc3VyZTogKCkgPT4gdGhpcy5tZWFzdXJlKClcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBkaXNjb25uZWN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4dGVuc2lvbkhvc3Q/LmRpc2Nvbm5lY3Q/LigpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZXh0ZW5zaW9uSG9zdD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3JwY1Byb3RvY29sPy5kaXNwb3NlKCk7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fY3VzdG9tZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjdXN0b21lciA9IHRoaXMuX2N1c3RvbWVyc1tpXTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGN1c3RvbWVyLmRpc3Bvc2UoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRlcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcHJveHkgPSBudWxsO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBtZWFzdXJlKCk6IFByb21pc2U8RXh0SG9zdExhdGVuY3lSZXN1bHQgfCBudWxsPiB7XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLl9wcm94eTtcblx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgbGF0ZW5jeSA9IGF3YWl0IHRoaXMuX21lYXN1cmVMYXRlbmN5KHByb3h5KTtcblx0XHRjb25zdCBkb3duID0gYXdhaXQgdGhpcy5fbWVhc3VyZURvd24ocHJveHkpO1xuXHRcdGNvbnN0IHVwID0gYXdhaXQgdGhpcy5fbWVhc3VyZVVwKHByb3h5KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB0aGlzLl9leHRlbnNpb25Ib3N0LnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdGxhdGVuY3ksXG5cdFx0XHRkb3duLFxuXHRcdFx0dXBcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGdldCBpc1JlYWR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9oYXNTdGFydGVkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlYWR5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Byb3h5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbWVhc3VyZUxhdGVuY3kocHJveHk6IElFeHRlbnNpb25Ib3N0UHJveHkpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IENPVU5UID0gMTA7XG5cblx0XHRsZXQgc3VtID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IENPVU5UOyBpKyspIHtcblx0XHRcdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXHRcdFx0YXdhaXQgcHJveHkudGVzdF9sYXRlbmN5KGkpO1xuXHRcdFx0c3cuc3RvcCgpO1xuXHRcdFx0c3VtICs9IHN3LmVsYXBzZWQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIChzdW0gLyBDT1VOVCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29udmVydChieXRlQ291bnQ6IG51bWJlciwgZWxhcHNlZE1pbGxpczogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gKGJ5dGVDb3VudCAqIDEwMDAgKiA4KSAvIGVsYXBzZWRNaWxsaXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9tZWFzdXJlVXAocHJveHk6IElFeHRlbnNpb25Ib3N0UHJveHkpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IFNJWkUgPSAxMCAqIDEwMjQgKiAxMDI0OyAvLyAxME1CXG5cblx0XHRjb25zdCBidWZmID0gVlNCdWZmZXIuYWxsb2MoU0laRSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBNYXRoLmNlaWwoTWF0aC5yYW5kb20oKSAqIDI1Nik7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBidWZmLmJ5dGVMZW5ndGg7IGkrKykge1xuXHRcdFx0YnVmZi53cml0ZVVJbnQ4KGksIHZhbHVlKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3cgPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0YXdhaXQgcHJveHkudGVzdF91cChidWZmKTtcblx0XHRzdy5zdG9wKCk7XG5cdFx0cmV0dXJuIEV4dGVuc2lvbkhvc3RNYW5hZ2VyLl9jb252ZXJ0KFNJWkUsIHN3LmVsYXBzZWQoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9tZWFzdXJlRG93bihwcm94eTogSUV4dGVuc2lvbkhvc3RQcm94eSk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0Y29uc3QgU0laRSA9IDEwICogMTAyNCAqIDEwMjQ7IC8vIDEwTUJcblxuXHRcdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXHRcdGF3YWl0IHByb3h5LnRlc3RfZG93bihTSVpFKTtcblx0XHRzdy5zdG9wKCk7XG5cdFx0cmV0dXJuIEV4dGVuc2lvbkhvc3RNYW5hZ2VyLl9jb252ZXJ0KFNJWkUsIHN3LmVsYXBzZWQoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVFeHRlbnNpb25Ib3N0Q3VzdG9tZXJzKGtpbmQ6IEV4dGVuc2lvbkhvc3RLaW5kLCBwcm90b2NvbDogSU1lc3NhZ2VQYXNzaW5nUHJvdG9jb2wpOiBJRXh0ZW5zaW9uSG9zdFByb3h5IHtcblxuXHRcdGxldCBsb2dnZXI6IElSUENQcm90b2NvbExvZ2dlciB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChMT0dfRVhURU5TSU9OX0hPU1RfQ09NTVVOSUNBVElPTiB8fCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UubG9nRXh0ZW5zaW9uSG9zdENvbW11bmljYXRpb24pIHtcblx0XHRcdGxvZ2dlciA9IG5ldyBSUENMb2dnZXIoa2luZCk7XG5cdFx0fSBlbHNlIGlmIChUZWxlbWV0cnlSUENMb2dnZXIuaXNFbmFibGVkKCkpIHtcblx0XHRcdGxvZ2dlciA9IG5ldyBUZWxlbWV0cnlSUENMb2dnZXIodGhpcy5fdGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcnBjUHJvdG9jb2wgPSBuZXcgUlBDUHJvdG9jb2wocHJvdG9jb2wsIGxvZ2dlcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcnBjUHJvdG9jb2wub25EaWRDaGFuZ2VSZXNwb25zaXZlU3RhdGUoKHJlc3BvbnNpdmVTdGF0ZTogUmVzcG9uc2l2ZVN0YXRlKSA9PiB0aGlzLl9vbkRpZENoYW5nZVJlc3BvbnNpdmVTdGF0ZS5maXJlKHJlc3BvbnNpdmVTdGF0ZSkpKTtcblx0XHRsZXQgZXh0ZW5zaW9uSG9zdFByb3h5OiBJRXh0ZW5zaW9uSG9zdFByb3h5IHwgbnVsbCA9IG51bGwgYXMgSUV4dGVuc2lvbkhvc3RQcm94eSB8IG51bGw7XG5cdFx0bGV0IG1haW5Qcm94eUlkZW50aWZpZXJzOiBQcm94eUlkZW50aWZpZXI8YW55PltdID0gW107XG5cdFx0Y29uc3QgZXh0SG9zdENvbnRleHQ6IElJbnRlcm5hbEV4dEhvc3RDb250ZXh0ID0ge1xuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB0aGlzLl9leHRlbnNpb25Ib3N0LnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdGV4dGVuc2lvbkhvc3RLaW5kOiB0aGlzLmtpbmQsXG5cdFx0XHRnZXRQcm94eTogPFQ+KGlkZW50aWZpZXI6IFByb3h5SWRlbnRpZmllcjxUPik6IFByb3hpZWQ8VD4gPT4gdGhpcy5fcnBjUHJvdG9jb2whLmdldFByb3h5KGlkZW50aWZpZXIpLFxuXHRcdFx0c2V0OiA8VCwgUiBleHRlbmRzIFQ+KGlkZW50aWZpZXI6IFByb3h5SWRlbnRpZmllcjxUPiwgaW5zdGFuY2U6IFIpOiBSID0+IHRoaXMuX3JwY1Byb3RvY29sIS5zZXQoaWRlbnRpZmllciwgaW5zdGFuY2UpLFxuXHRcdFx0ZGlzcG9zZTogKCk6IHZvaWQgPT4gdGhpcy5fcnBjUHJvdG9jb2whLmRpc3Bvc2UoKSxcblx0XHRcdGFzc2VydFJlZ2lzdGVyZWQ6IChpZGVudGlmaWVyczogUHJveHlJZGVudGlmaWVyPGFueT5bXSk6IHZvaWQgPT4gdGhpcy5fcnBjUHJvdG9jb2whLmFzc2VydFJlZ2lzdGVyZWQoaWRlbnRpZmllcnMpLFxuXHRcdFx0ZHJhaW46ICgpOiBQcm9taXNlPHZvaWQ+ID0+IHRoaXMuX3JwY1Byb3RvY29sIS5kcmFpbigpLFxuXG5cdFx0XHQvLyNyZWdpb24gaW50ZXJuYWxcblx0XHRcdGludGVybmFsRXh0ZW5zaW9uU2VydmljZTogdGhpcy5faW50ZXJuYWxFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdFx0X3NldEV4dGVuc2lvbkhvc3RQcm94eTogKHZhbHVlOiBJRXh0ZW5zaW9uSG9zdFByb3h5KTogdm9pZCA9PiB7XG5cdFx0XHRcdGV4dGVuc2lvbkhvc3RQcm94eSA9IHZhbHVlO1xuXHRcdFx0fSxcblx0XHRcdF9zZXRBbGxNYWluUHJveHlJZGVudGlmaWVyczogKHZhbHVlOiBQcm94eUlkZW50aWZpZXI8YW55PltdKTogdm9pZCA9PiB7XG5cdFx0XHRcdG1haW5Qcm94eUlkZW50aWZpZXJzID0gdmFsdWU7XG5cdFx0XHR9LFxuXHRcdFx0Ly8jZW5kcmVnaW9uXG5cdFx0fTtcblxuXHRcdC8vIE5hbWVkIGN1c3RvbWVyc1xuXHRcdGNvbnN0IG5hbWVkQ3VzdG9tZXJzID0gRXh0SG9zdEN1c3RvbWVyc1JlZ2lzdHJ5LmdldE5hbWVkQ3VzdG9tZXJzKCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG5hbWVkQ3VzdG9tZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBbaWQsIGN0b3JdID0gbmFtZWRDdXN0b21lcnNbaV07XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGN0b3IsIGV4dEhvc3RDb250ZXh0KTtcblx0XHRcdFx0dGhpcy5fY3VzdG9tZXJzLnB1c2goaW5zdGFuY2UpO1xuXHRcdFx0XHR0aGlzLl9ycGNQcm90b2NvbC5zZXQoaWQsIGluc3RhbmNlKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBDYW5ub3QgaW5zdGFudGlhdGUgbmFtZWQgY3VzdG9tZXI6ICcke2lkLnNpZH0nYCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0ZXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3VzdG9tZXJzXG5cdFx0Y29uc3QgY3VzdG9tZXJzID0gRXh0SG9zdEN1c3RvbWVyc1JlZ2lzdHJ5LmdldEN1c3RvbWVycygpO1xuXHRcdGZvciAoY29uc3QgY3RvciBvZiBjdXN0b21lcnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoY3RvciwgZXh0SG9zdENvbnRleHQpO1xuXHRcdFx0XHR0aGlzLl9jdXN0b21lcnMucHVzaChpbnN0YW5jZSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRlcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWV4dGVuc2lvbkhvc3RQcm94eSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIElFeHRlbnNpb25Ib3N0UHJveHkhYCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdGhhdCBubyBuYW1lZCBjdXN0b21lcnMgYXJlIG1pc3Npbmdcblx0XHR0aGlzLl9ycGNQcm90b2NvbC5hc3NlcnRSZWdpc3RlcmVkKG1haW5Qcm94eUlkZW50aWZpZXJzKTtcblxuXHRcdHJldHVybiBleHRlbnNpb25Ib3N0UHJveHk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgYWN0aXZhdGUoZXh0ZW5zaW9uOiBFeHRlbnNpb25JZGVudGlmaWVyLCByZWFzb246IEV4dGVuc2lvbkFjdGl2YXRpb25SZWFzb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBwcm94eSA9IGF3YWl0IHRoaXMuX3Byb3h5O1xuXHRcdGlmICghcHJveHkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3h5LmFjdGl2YXRlKGV4dGVuc2lvbiwgcmVhc29uKTtcblx0fVxuXG5cdHB1YmxpYyBhY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50OiBzdHJpbmcsIGFjdGl2YXRpb25LaW5kOiBBY3RpdmF0aW9uS2luZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fY2FjaGVkQWN0aXZhdGlvbkV2ZW50cy5oYXMoYWN0aXZhdGlvbkV2ZW50KSkge1xuXHRcdFx0dGhpcy5fY2FjaGVkQWN0aXZhdGlvbkV2ZW50cy5zZXQoYWN0aXZhdGlvbkV2ZW50LCB0aGlzLl9hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50LCBhY3RpdmF0aW9uS2luZCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkQWN0aXZhdGlvbkV2ZW50cy5nZXQoYWN0aXZhdGlvbkV2ZW50KSE7XG5cdH1cblxuXHRwdWJsaWMgYWN0aXZhdGlvbkV2ZW50SXNEb25lKGFjdGl2YXRpb25FdmVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVkQWN0aXZhdGlvbkV2ZW50cy5oYXMoYWN0aXZhdGlvbkV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FjdGl2YXRlQnlFdmVudChhY3RpdmF0aW9uRXZlbnQ6IHN0cmluZywgYWN0aXZhdGlvbktpbmQ6IEFjdGl2YXRpb25LaW5kKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9wcm94eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcm94eSA9IGF3YWl0IHRoaXMuX3Byb3h5O1xuXHRcdGlmICghcHJveHkpIHtcblx0XHRcdC8vIHRoaXMgY2FzZSBpcyBhbHJlYWR5IGNvdmVyZWQgYWJvdmUgYW5kIGxvZ2dlZC5cblx0XHRcdC8vIGkuZS4gdGhlIGV4dGVuc2lvbiBob3N0IGNvdWxkIG5vdCBiZSBzdGFydGVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9leHRlbnNpb25Ib3N0LmV4dGVuc2lvbnMhLmNvbnRhaW5zQWN0aXZhdGlvbkV2ZW50KGFjdGl2YXRpb25FdmVudCkpIHtcblx0XHRcdHRoaXMuX3Jlc29sdmVkQWN0aXZhdGlvbkV2ZW50cy5hZGQoYWN0aXZhdGlvbkV2ZW50KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBwcm94eS5hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50LCBhY3RpdmF0aW9uS2luZCk7XG5cdFx0dGhpcy5fcmVzb2x2ZWRBY3RpdmF0aW9uRXZlbnRzLmFkZChhY3RpdmF0aW9uRXZlbnQpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldEluc3BlY3RQb3J0KHRyeUVuYWJsZUluc3BlY3RvcjogYm9vbGVhbik6IFByb21pc2U8SUV4dGVuc2lvbkluc3BlY3RJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuX2V4dGVuc2lvbkhvc3QpIHtcblx0XHRcdGlmICh0cnlFbmFibGVJbnNwZWN0b3IpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uSG9zdC5lbmFibGVJbnNwZWN0UG9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcG9ydCA9IHRoaXMuX2V4dGVuc2lvbkhvc3QuZ2V0SW5zcGVjdFBvcnQoKTtcblx0XHRcdGlmIChwb3J0KSB7XG5cdFx0XHRcdHJldHVybiBwb3J0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVzb2x2ZUF1dGhvcml0eShyZW1vdGVBdXRob3JpdHk6IHN0cmluZywgcmVzb2x2ZUF0dGVtcHQ6IG51bWJlcik6IFByb21pc2U8SVJlc29sdmVBdXRob3JpdHlSZXN1bHQ+IHtcblx0XHRjb25zdCBzdyA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRcdGNvbnN0IHByZWZpeCA9ICgpID0+IGBbJHtleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nKHRoaXMuX2V4dGVuc2lvbkhvc3QucnVubmluZ0xvY2F0aW9uLmtpbmQpfSR7dGhpcy5fZXh0ZW5zaW9uSG9zdC5ydW5uaW5nTG9jYXRpb24uYWZmaW5pdHl9XVtyZXNvbHZlQXV0aG9yaXR5KCR7Z2V0UmVtb3RlQXV0aG9yaXR5UHJlZml4KHJlbW90ZUF1dGhvcml0eSl9LCR7cmVzb2x2ZUF0dGVtcHR9KV1bJHtzdy5lbGFwc2VkKCl9bXNdIGA7XG5cdFx0Y29uc3QgbG9nSW5mbyA9IChtc2c6IHN0cmluZykgPT4gdGhpcy5fbG9nU2VydmljZS5pbmZvKGAke3ByZWZpeCgpfSR7bXNnfWApO1xuXHRcdGNvbnN0IGxvZ0Vycm9yID0gKG1zZzogc3RyaW5nLCBlcnI6IGFueSA9IHVuZGVmaW5lZCkgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtwcmVmaXgoKX0ke21zZ31gLCBlcnIpO1xuXG5cdFx0bG9nSW5mbyhgb2J0YWluaW5nIHByb3h5Li4uYCk7XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLl9wcm94eTtcblx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHRsb2dFcnJvcihgbm8gcHJveHlgKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0bWVzc2FnZTogYENhbm5vdCByZXNvbHZlIGF1dGhvcml0eWAsXG5cdFx0XHRcdFx0Y29kZTogUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUuVW5rbm93bixcblx0XHRcdFx0XHRkZXRhaWw6IHVuZGVmaW5lZFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRsb2dJbmZvKGBpbnZva2luZy4uLmApO1xuXHRcdGNvbnN0IGludGVydmFsTG9nZ2VyID0gbmV3IEludGVydmFsVGltZXIoKTtcblx0XHR0cnkge1xuXHRcdFx0aW50ZXJ2YWxMb2dnZXIuY2FuY2VsQW5kU2V0KCgpID0+IGxvZ0luZm8oJ3dhaXRpbmcuLi4nKSwgMTAwMCk7XG5cdFx0XHRjb25zdCByZXNvbHZlclJlc3VsdCA9IGF3YWl0IHByb3h5LnJlc29sdmVBdXRob3JpdHkocmVtb3RlQXV0aG9yaXR5LCByZXNvbHZlQXR0ZW1wdCk7XG5cdFx0XHRpbnRlcnZhbExvZ2dlci5kaXNwb3NlKCk7XG5cdFx0XHRpZiAocmVzb2x2ZXJSZXN1bHQudHlwZSA9PT0gJ29rJykge1xuXHRcdFx0XHRsb2dJbmZvKGByZXR1cm5lZCAke3Jlc29sdmVyUmVzdWx0LnZhbHVlLmF1dGhvcml0eS5jb25uZWN0VG99YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dFcnJvcihgcmV0dXJuZWQgYW4gZXJyb3JgLCByZXNvbHZlclJlc3VsdC5lcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzb2x2ZXJSZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpbnRlcnZhbExvZ2dlci5kaXNwb3NlKCk7XG5cdFx0XHRsb2dFcnJvcihgcmV0dXJuZWQgYW4gZXJyb3JgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRtZXNzYWdlOiBlcnIubWVzc2FnZSxcblx0XHRcdFx0XHRjb2RlOiBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZS5Vbmtub3duLFxuXHRcdFx0XHRcdGRldGFpbDogZXJyXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldENhbm9uaWNhbFVSSShyZW1vdGVBdXRob3JpdHk6IHN0cmluZywgdXJpOiBVUkkpOiBQcm9taXNlPFVSSSB8IG51bGw+IHtcblx0XHRjb25zdCBwcm94eSA9IGF3YWl0IHRoaXMuX3Byb3h5O1xuXHRcdGlmICghcHJveHkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgY2Fub25pY2FsIFVSSWApO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJveHkuZ2V0Q2Fub25pY2FsVVJJKHJlbW90ZUF1dGhvcml0eSwgdXJpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzdGFydChleHRlbnNpb25SZWdpc3RyeVZlcnNpb25JZDogbnVtYmVyLCBhbGxFeHRlbnNpb25zOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSwgbXlFeHRlbnNpb25zOiBFeHRlbnNpb25JZGVudGlmaWVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm94eSA9IGF3YWl0IHRoaXMuX3Byb3h5O1xuXHRcdGlmICghcHJveHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGVsdGFFeHRlbnNpb25zID0gdGhpcy5fZXh0ZW5zaW9uSG9zdC5leHRlbnNpb25zIS5zZXQoZXh0ZW5zaW9uUmVnaXN0cnlWZXJzaW9uSWQsIGFsbEV4dGVuc2lvbnMsIG15RXh0ZW5zaW9ucyk7XG5cdFx0cmV0dXJuIHByb3h5LnN0YXJ0RXh0ZW5zaW9uSG9zdChkZWx0YUV4dGVuc2lvbnMpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGV4dGVuc2lvblRlc3RzRXhlY3V0ZSgpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IHByb3h5ID0gYXdhaXQgdGhpcy5fcHJveHk7XG5cdFx0aWYgKCFwcm94eSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3Qgb2J0YWluIEV4dGVuc2lvbiBIb3N0IFByb3h5Jyk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm94eS5leHRlbnNpb25UZXN0c0V4ZWN1dGUoKTtcblx0fVxuXG5cdHB1YmxpYyByZXByZXNlbnRzUnVubmluZ0xvY2F0aW9uKHJ1bm5pbmdMb2NhdGlvbjogRXh0ZW5zaW9uUnVubmluZ0xvY2F0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvbkhvc3QucnVubmluZ0xvY2F0aW9uLmVxdWFscyhydW5uaW5nTG9jYXRpb24pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGRlbHRhRXh0ZW5zaW9ucyhpbmNvbWluZ0V4dGVuc2lvbnNEZWx0YTogSUV4dGVuc2lvbkRlc2NyaXB0aW9uRGVsdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm94eSA9IGF3YWl0IHRoaXMuX3Byb3h5O1xuXHRcdGlmICghcHJveHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgb3V0Z29pbmdFeHRlbnNpb25zRGVsdGEgPSB0aGlzLl9leHRlbnNpb25Ib3N0LmV4dGVuc2lvbnMhLmRlbHRhKGluY29taW5nRXh0ZW5zaW9uc0RlbHRhKTtcblx0XHRpZiAoIW91dGdvaW5nRXh0ZW5zaW9uc0RlbHRhKSB7XG5cdFx0XHQvLyBUaGUgZXh0ZW5zaW9uIGhvc3QgYWxyZWFkeSBoYXMgdGhpcyB2ZXJzaW9uIG9mIHRoZSBleHRlbnNpb25zLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJveHkuZGVsdGFFeHRlbnNpb25zKG91dGdvaW5nRXh0ZW5zaW9uc0RlbHRhKTtcblx0fVxuXG5cdHB1YmxpYyBjb250YWluc0V4dGVuc2lvbihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9leHRlbnNpb25Ib3N0LmV4dGVuc2lvbnM/LmNvbnRhaW5zRXh0ZW5zaW9uKGV4dGVuc2lvbklkKSA/PyBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZXRSZW1vdGVFbnZpcm9ubWVudChlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgbnVsbCB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJveHkgPSBhd2FpdCB0aGlzLl9wcm94eTtcblx0XHRpZiAoIXByb3h5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb3h5LnNldFJlbW90ZUVudmlyb25tZW50KGVudik7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZyaWVuZGx5RXh0SG9zdE5hbWUoa2luZDogRXh0ZW5zaW9uSG9zdEtpbmQsIHBpZDogbnVtYmVyIHwgbnVsbCkge1xuXHRpZiAocGlkKSB7XG5cdFx0cmV0dXJuIGAke2V4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcoa2luZCl9IHBpZDogJHtwaWR9YDtcblx0fVxuXHRyZXR1cm4gYCR7ZXh0ZW5zaW9uSG9zdEtpbmRUb1N0cmluZyhraW5kKX1gO1xufVxuXG5jb25zdCBjb2xvclRhYmxlcyA9IFtcblx0WycjMjk3N0IxJywgJyNGQzgwMkQnLCAnIzM0QTEzQScsICcjRDMyODJGJywgJyM5MzY2QkEnXSxcblx0WycjOEI1NjRDJywgJyNFMTc3QzAnLCAnIzdGN0Y3RicsICcjQkJCRTNEJywgJyMyRUJFQ0QnXVxuXTtcblxuZnVuY3Rpb24gcHJldHR5V2l0aG91dEFycmF5cyhkYXRhOiBhbnkpOiBhbnkge1xuXHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cdGlmIChkYXRhICYmIHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgZGF0YS50b1N0cmluZyA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGRhdGEudG9TdHJpbmcoKTtcblx0XHRpZiAocmVzdWx0ICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGRhdGE7XG59XG5cbmZ1bmN0aW9uIHByZXR0eShkYXRhOiBhbnkpOiBhbnkge1xuXHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuXHRcdHJldHVybiBkYXRhLm1hcChwcmV0dHlXaXRob3V0QXJyYXlzKTtcblx0fVxuXHRyZXR1cm4gcHJldHR5V2l0aG91dEFycmF5cyhkYXRhKTtcbn1cblxuY2xhc3MgUlBDTG9nZ2VyIGltcGxlbWVudHMgSVJQQ1Byb3RvY29sTG9nZ2VyIHtcblxuXHRwcml2YXRlIF90b3RhbEluY29taW5nID0gMDtcblx0cHJpdmF0ZSBfdG90YWxPdXRnb2luZyA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfa2luZDogRXh0ZW5zaW9uSG9zdEtpbmRcblx0KSB7IH1cblxuXHRwcml2YXRlIF9sb2coZGlyZWN0aW9uOiBzdHJpbmcsIHRvdGFsTGVuZ3RoOiBudW1iZXIsIG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlciwgaW5pdGlhdG9yOiBSZXF1ZXN0SW5pdGlhdG9yLCBzdHI6IHN0cmluZywgZGF0YTogYW55KTogdm9pZCB7XG5cdFx0ZGF0YSA9IHByZXR0eShkYXRhKTtcblxuXHRcdGNvbnN0IGNvbG9yVGFibGUgPSBjb2xvclRhYmxlc1tpbml0aWF0b3JdO1xuXHRcdGNvbnN0IGNvbG9yID0gTE9HX1VTRV9DT0xPUlMgPyBjb2xvclRhYmxlW3JlcSAlIGNvbG9yVGFibGUubGVuZ3RoXSA6ICcjMDAwMDAwJztcblx0XHRsZXQgYXJncyA9IFtgJWNbJHtleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nKHRoaXMuX2tpbmQpfV1bJHtkaXJlY3Rpb259XSVjWyR7U3RyaW5nKHRvdGFsTGVuZ3RoKS5wYWRTdGFydCg3KX1dJWNbbGVuOiAke1N0cmluZyhtc2dMZW5ndGgpLnBhZFN0YXJ0KDUpfV0lYyR7U3RyaW5nKHJlcSkucGFkU3RhcnQoNSl9IC0gJHtzdHJ9YCwgJ2NvbG9yOiBkYXJrZ3JlZW4nLCAnY29sb3I6IGdyZXknLCAnY29sb3I6IGdyZXknLCBgY29sb3I6ICR7Y29sb3J9YF07XG5cdFx0aWYgKC9cXCgkLy50ZXN0KHN0cikpIHtcblx0XHRcdGFyZ3MgPSBhcmdzLmNvbmNhdChkYXRhKTtcblx0XHRcdGFyZ3MucHVzaCgnKScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcmdzLnB1c2goZGF0YSk7XG5cdFx0fVxuXHRcdGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3MgYXMgW3N0cmluZywgLi4uc3RyaW5nW11dKTtcblx0fVxuXG5cdGxvZ0luY29taW5nKG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlciwgaW5pdGlhdG9yOiBSZXF1ZXN0SW5pdGlhdG9yLCBzdHI6IHN0cmluZywgZGF0YT86IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuX3RvdGFsSW5jb21pbmcgKz0gbXNnTGVuZ3RoO1xuXHRcdHRoaXMuX2xvZygnRXh0IFxcdTIxOTIgV2luJywgdGhpcy5fdG90YWxJbmNvbWluZywgbXNnTGVuZ3RoLCByZXEsIGluaXRpYXRvciwgc3RyLCBkYXRhKTtcblx0fVxuXG5cdGxvZ091dGdvaW5nKG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlciwgaW5pdGlhdG9yOiBSZXF1ZXN0SW5pdGlhdG9yLCBzdHI6IHN0cmluZywgZGF0YT86IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuX3RvdGFsT3V0Z29pbmcgKz0gbXNnTGVuZ3RoO1xuXHRcdHRoaXMuX2xvZygnV2luIFxcdTIxOTIgRXh0JywgdGhpcy5fdG90YWxPdXRnb2luZywgbXNnTGVuZ3RoLCByZXEsIGluaXRpYXRvciwgc3RyLCBkYXRhKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgUlBDVGVsZW1ldHJ5RGF0YSB7XG5cdHR5cGU6IHN0cmluZztcblx0bGVuZ3RoOiBudW1iZXI7XG59XG5cbnR5cGUgUlBDVGVsZW1ldHJ5RGF0YUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2pyaWVrZW4nO1xuXHRjb21tZW50OiAnSW5zaWdodHMgYWJvdXQgUlBDIG1lc3NhZ2Ugc2l6ZXMnO1xuXHR0eXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHR5cGUgb2YgdGhlIFJQQyBtZXNzYWdlJyB9O1xuXHRsZW5ndGg6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgYnl0ZS1sZW5ndGggb2YgdGhlIFJQQyBtZXNzYWdlJyB9O1xufTtcblxuY2xhc3MgVGVsZW1ldHJ5UlBDTG9nZ2VyIGltcGxlbWVudHMgSVJQQ1Byb3RvY29sTG9nZ2VyIHtcblxuXHRzdGF0aWMgaXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBNYXRoLnJhbmRvbSgpIDwgMC4wMDAxOyAvLyAwLjAxJSBvZiB1c2Vyc1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1JlcXVlc3RzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3RvcihASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UpIHsgfVxuXG5cdGxvZ0luY29taW5nKG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlciwgaW5pdGlhdG9yOiBSZXF1ZXN0SW5pdGlhdG9yLCBzdHI6IHN0cmluZyk6IHZvaWQge1xuXG5cdFx0aWYgKGluaXRpYXRvciA9PT0gUmVxdWVzdEluaXRpYXRvci5Mb2NhbFNpZGUgJiYgL15yZWNlaXZlUmVwbHkoRXJyKT86Ly50ZXN0KHN0cikpIHtcblx0XHRcdC8vIGxvZyB0aGUgc2l6ZSBvZiByZXBseSBtZXNzYWdlc1xuXHRcdFx0Y29uc3QgcmVxdWVzdFN0ciA9IHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5nZXQocmVxKSA/PyAndW5rbm93bl9yZXBseSc7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKHJlcSk7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UlBDVGVsZW1ldHJ5RGF0YSwgUlBDVGVsZW1ldHJ5RGF0YUNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uaG9zdC5pbmNvbWluZycsIHtcblx0XHRcdFx0dHlwZTogYCR7c3RyfSAke3JlcXVlc3RTdHJ9YCxcblx0XHRcdFx0bGVuZ3RoOiBtc2dMZW5ndGhcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChpbml0aWF0b3IgPT09IFJlcXVlc3RJbml0aWF0b3IuT3RoZXJTaWRlICYmIC9ecmVjZWl2ZVJlcXVlc3QgLy50ZXN0KHN0cikpIHtcblx0XHRcdC8vIGluY29taW5nIHJlcXVlc3Rcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSUENUZWxlbWV0cnlEYXRhLCBSUENUZWxlbWV0cnlEYXRhQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25ob3N0LmluY29taW5nJywge1xuXHRcdFx0XHR0eXBlOiBgJHtzdHJ9YCxcblx0XHRcdFx0bGVuZ3RoOiBtc2dMZW5ndGhcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGxvZ091dGdvaW5nKG1zZ0xlbmd0aDogbnVtYmVyLCByZXE6IG51bWJlciwgaW5pdGlhdG9yOiBSZXF1ZXN0SW5pdGlhdG9yLCBzdHI6IHN0cmluZyk6IHZvaWQge1xuXG5cdFx0aWYgKGluaXRpYXRvciA9PT0gUmVxdWVzdEluaXRpYXRvci5Mb2NhbFNpZGUgJiYgc3RyLnN0YXJ0c1dpdGgoJ3JlcXVlc3Q6ICcpKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuc2V0KHJlcSwgc3RyKTtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSUENUZWxlbWV0cnlEYXRhLCBSUENUZWxlbWV0cnlEYXRhQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25ob3N0Lm91dGdvaW5nJywge1xuXHRcdFx0XHR0eXBlOiBzdHIsXG5cdFx0XHRcdGxlbmd0aDogbXNnTGVuZ3RoXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIEV4dEhvc3RMYXRlbmN5UmVzdWx0IHtcblx0cmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCBudWxsO1xuXHR1cDogbnVtYmVyO1xuXHRkb3duOiBudW1iZXI7XG5cdGxhdGVuY3k6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEV4dEhvc3RMYXRlbmN5UHJvdmlkZXIge1xuXHRtZWFzdXJlKCk6IFByb21pc2U8RXh0SG9zdExhdGVuY3lSZXN1bHQgfCBudWxsPjtcbn1cblxuY29uc3QgcHJvdmlkZXJzOiBFeHRIb3N0TGF0ZW5jeVByb3ZpZGVyW10gPSBbXTtcbmZ1bmN0aW9uIHJlZ2lzdGVyTGF0ZW5jeVRlc3RQcm92aWRlcihwcm92aWRlcjogRXh0SG9zdExhdGVuY3lQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0cHJvdmlkZXJzLnB1c2gocHJvdmlkZXIpO1xuXHRyZXR1cm4ge1xuXHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcHJvdmlkZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmIChwcm92aWRlcnNbaV0gPT09IHByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJzLnNwbGljZShpLCAxKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldExhdGVuY3lUZXN0UHJvdmlkZXJzKCk6IEV4dEhvc3RMYXRlbmN5UHJvdmlkZXJbXSB7XG5cdHJldHVybiBwcm92aWRlcnMuc2xpY2UoMCk7XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBNZWFzdXJlRXh0SG9zdExhdGVuY3lBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ubWVhc3VyZUV4dEhvc3RMYXRlbmN5Jyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdtZWFzdXJlRXh0SG9zdExhdGVuY3knLCBcIk1lYXN1cmUgRXh0ZW5zaW9uIEhvc3QgTGF0ZW5jeVwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblxuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbWVhc3VyZW1lbnRzID0gYXdhaXQgUHJvbWlzZS5hbGwoZ2V0TGF0ZW5jeVRlc3RQcm92aWRlcnMoKS5tYXAocHJvdmlkZXIgPT4gcHJvdmlkZXIubWVhc3VyZSgpKSk7XG5cdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHVuZGVmaW5lZCwgY29udGVudHM6IG1lYXN1cmVtZW50cy5tYXAoTWVhc3VyZUV4dEhvc3RMYXRlbmN5QWN0aW9uLl9wcmludCkuam9pbignXFxuXFxuJyksIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcHJpbnQobTogRXh0SG9zdExhdGVuY3lSZXN1bHQgfCBudWxsKTogc3RyaW5nIHtcblx0XHRpZiAoIW0pIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIGAke20ucmVtb3RlQXV0aG9yaXR5ID8gYEF1dGhvcml0eTogJHttLnJlbW90ZUF1dGhvcml0eX1cXG5gIDogYGB9Um91bmR0cmlwIGxhdGVuY3k6ICR7bS5sYXRlbmN5LnRvRml4ZWQoMyl9bXNcXG5VcDogJHtNZWFzdXJlRXh0SG9zdExhdGVuY3lBY3Rpb24uX3ByaW50U3BlZWQobS51cCl9XFxuRG93bjogJHtNZWFzdXJlRXh0SG9zdExhdGVuY3lBY3Rpb24uX3ByaW50U3BlZWQobS5kb3duKX1cXG5gO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3ByaW50U3BlZWQobjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRpZiAobiA8PSAxMDI0KSB7XG5cdFx0XHRyZXR1cm4gYCR7bn0gYnBzYDtcblx0XHR9XG5cdFx0aWYgKG4gPCAxMDI0ICogMTAyNCkge1xuXHRcdFx0cmV0dXJuIGAkeyhuIC8gMTAyNCkudG9GaXhlZCgxKX0ga2Jwc2A7XG5cdFx0fVxuXHRcdHJldHVybiBgJHsobiAvIDEwMjQgLyAxMDI0KS50b0ZpeGVkKDEpfSBNYnBzYDtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksWUFBWTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsaUJBQWlCO0FBRzFCLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsdUJBQXVCO0FBRXpDLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDLGdDQUFnQztBQUMzRSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGdDQUF5RDtBQUNsRSxTQUE0QixpQ0FBaUM7QUFLN0QsU0FBUyxzQkFBeUk7QUFFbEosU0FBNkIsYUFBYSx3QkFBeUM7QUFHbkYsTUFBTSxtQ0FBbUM7QUFDekMsTUFBTSxpQkFBaUI7QUFzQmhCLElBQU0sdUJBQU4sY0FBbUMsV0FBNEM7QUFBQSxFQWtDckYsWUFDQyxlQUNBLHlCQUNpQiwyQkFDdUIsdUJBQ08scUJBQ1gsbUJBQ04sYUFDN0I7QUFDRCxVQUFNO0FBTlc7QUFDdUI7QUFDTztBQUNYO0FBQ047QUFyQy9CLFNBQWlCLDhCQUF3RCxLQUFLLFVBQVUsSUFBSSxRQUF5QixDQUFDO0FBQ3RI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QUMxQyxZQUFJLFVBQVUsQ0FBQyxNQUFNLFVBQVU7QUFDOUIsb0JBQVUsT0FBTyxHQUFHLENBQUM7QUFDckI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLDBCQUFvRDtBQUM1RCxTQUFPLFVBQVUsTUFBTSxDQUFDO0FBQ3pCO0FBRUEsZ0JBQWdCLE1BQU0sb0NBQW9DLFFBQVE7QUFBQSxFQUVqRSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUseUJBQXlCLGdDQUFnQztBQUFBLE1BQzlFLFVBQVUsV0FBVztBQUFBLE1BQ3JCLElBQUk7QUFBQSxJQUNMLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBNEI7QUFFckMsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFFakQsVUFBTSxlQUFlLE1BQU0sUUFBUSxJQUFJLHdCQUF3QixFQUFFLElBQUksY0FBWSxTQUFTLFFBQVEsQ0FBQyxDQUFDO0FBQ3BHLGtCQUFjLFdBQVcsRUFBRSxVQUFVLFFBQVcsVUFBVSxhQUFhLElBQUksNEJBQTRCLE1BQU0sRUFBRSxLQUFLLE1BQU0sR0FBRyxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsQ0FBQztBQUFBLEVBQ3pKO0FBQUEsRUFFQSxPQUFlLE9BQU8sR0FBd0M7QUFDN0QsUUFBSSxDQUFDLEdBQUc7QUFDUCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sR0FBRyxFQUFFLGtCQUFrQixjQUFjLEVBQUUsZUFBZTtBQUFBLElBQU8sRUFBRSxzQkFBc0IsRUFBRSxRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQUEsTUFBVyw0QkFBNEIsWUFBWSxFQUFFLEVBQUUsQ0FBQztBQUFBLFFBQVcsNEJBQTRCLFlBQVksRUFBRSxJQUFJLENBQUM7QUFBQTtBQUFBLEVBQ25PO0FBQUEsRUFFQSxPQUFlLFlBQVksR0FBbUI7QUFDN0MsUUFBSSxLQUFLLE1BQU07QUFDZCxhQUFPLEdBQUcsQ0FBQztBQUFBLElBQ1o7QUFDQSxRQUFJLElBQUksT0FBTyxNQUFNO0FBQ3BCLGFBQU8sSUFBSSxJQUFJLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFBQSxJQUNoQztBQUNBLFdBQU8sSUFBSSxJQUFJLE9BQU8sTUFBTSxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ3ZDO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
