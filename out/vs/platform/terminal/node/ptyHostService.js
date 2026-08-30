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
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { OS, isWindows } from "../../../base/common/platform.js";
import { ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { ILogService, ILoggerService, LogLevel } from "../../log/common/log.js";
import { RemoteLoggerChannelClient } from "../../log/common/logIpc.js";
import { getResolvedShellEnv } from "../../shell/node/shellEnv.js";
import { RequestStore } from "../common/requestStore.js";
import { HeartbeatConstants, TerminalIpcChannels, TerminalSettingId } from "../common/terminal.js";
import { registerTerminalPlatformConfiguration } from "../common/terminalPlatformConfiguration.js";
import { detectAvailableProfiles } from "./terminalProfiles.js";
import { getSystemShell } from "../../../base/node/shell.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxRestarts"] = 5] = "MaxRestarts";
  return Constants2;
})(Constants || {});
let PtyHostService = class extends Disposable {
  constructor(_ptyHostStarter, _configurationService, _logService, _loggerService) {
    super();
    this._ptyHostStarter = _ptyHostStarter;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._loggerService = _loggerService;
    this._wasQuitRequested = false;
    this._restartCount = 0;
    this._isResponsive = true;
    this._onPtyHostExit = this._register(new Emitter());
    this.onPtyHostExit = this._onPtyHostExit.event;
    this._onPtyHostStart = this._register(new Emitter());
    this.onPtyHostStart = this._onPtyHostStart.event;
    this._onPtyHostUnresponsive = this._register(new Emitter());
    this.onPtyHostUnresponsive = this._onPtyHostUnresponsive.event;
    this._onPtyHostResponsive = this._register(new Emitter());
    this.onPtyHostResponsive = this._onPtyHostResponsive.event;
    this._onPtyHostRequestResolveVariables = this._register(new Emitter());
    this.onPtyHostRequestResolveVariables = this._onPtyHostRequestResolveVariables.event;
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._onProcessData.event;
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._onProcessReady.event;
    this._onProcessReplay = this._register(new Emitter());
    this.onProcessReplay = this._onProcessReplay.event;
    this._onProcessOrphanQuestion = this._register(new Emitter());
    this.onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
    this._onDidRequestDetach = this._register(new Emitter());
    this.onDidRequestDetach = this._onDidRequestDetach.event;
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._onProcessExit = this._register(new Emitter());
    this.onProcessExit = this._onProcessExit.event;
    this._ptyHostStore = this._register(new DisposableStore());
    registerTerminalPlatformConfiguration();
    this._register(this._ptyHostStarter);
    this._register(toDisposable(() => this._disposePtyHost()));
    this._resolveVariablesRequestStore = this._register(new RequestStore(void 0, this._logService));
    this._register(this._resolveVariablesRequestStore.onCreateRequest(this._onPtyHostRequestResolveVariables.fire, this._onPtyHostRequestResolveVariables));
    if (this._ptyHostStarter.onRequestConnection) {
      this._register(Event.once(this._ptyHostStarter.onRequestConnection)(() => this._ensurePtyHost()));
    }
    if (this._ptyHostStarter.onWillShutdown) {
      this._register(this._ptyHostStarter.onWillShutdown(() => this._wasQuitRequested = true));
    }
  }
  get _proxy() {
    this._ensurePtyHost();
    return this.__proxy;
  }
  /**
   * Get the proxy if it exists, otherwise undefined. This is used when calls are not needed to be
   * passed through to the pty host if it has not yet been spawned.
   */
  get _optionalProxy() {
    return this.__proxy;
  }
  _ensurePtyHost() {
    if (!this.__connection) {
      this._startPtyHost();
    }
  }
  get _ignoreProcessNames() {
    return this._configurationService.getValue(TerminalSettingId.IgnoreProcessNames);
  }
  async _refreshIgnoreProcessNames() {
    return this._optionalProxy?.refreshIgnoreProcessNames?.(this._ignoreProcessNames);
  }
  async _resolveShellEnv() {
    if (isWindows) {
      return process.env;
    }
    try {
      return await getResolvedShellEnv(this._configurationService, this._logService, { _: [] }, process.env);
    } catch (error) {
      this._logService.error("ptyHost was unable to resolve shell environment", error);
      return {};
    }
  }
  _startPtyHost() {
    const connection = this._ptyHostStarter.start();
    const client = connection.client;
    const store = this._ptyHostStore;
    store.add(connection.store);
    if (this._logService.getLevel() === LogLevel.Trace) {
      this._logService.trace("PtyHostService#_startPtyHost", new Error().stack?.replace(/^Error/, ""));
    }
    const heartbeatService = ProxyChannel.toService(client.getChannel(TerminalIpcChannels.Heartbeat));
    store.add(heartbeatService.onBeat(() => this._handleHeartbeat()));
    this._handleHeartbeat(true);
    store.add(connection.onDidProcessExit((e) => {
      this._onPtyHostExit.fire(e.code);
      if (!this._wasQuitRequested && !this._store.isDisposed) {
        if (this._restartCount <= 5 /* MaxRestarts */) {
          this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}`);
          this._restartCount++;
          this.restartPtyHost();
        } else {
          this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}, giving up`);
        }
      }
    }));
    const proxy = ProxyChannel.toService(client.getChannel(TerminalIpcChannels.PtyHost));
    store.add(proxy.onProcessData((e) => this._onProcessData.fire(e)));
    store.add(proxy.onProcessReady((e) => this._onProcessReady.fire(e)));
    store.add(proxy.onProcessExit((e) => this._onProcessExit.fire(e)));
    store.add(proxy.onDidChangeProperty((e) => this._onDidChangeProperty.fire(e)));
    store.add(proxy.onProcessReplay((e) => this._onProcessReplay.fire(e)));
    store.add(proxy.onProcessOrphanQuestion((e) => this._onProcessOrphanQuestion.fire(e)));
    store.add(proxy.onDidRequestDetach((e) => this._onDidRequestDetach.fire(e)));
    store.add(new RemoteLoggerChannelClient(this._loggerService, client.getChannel(TerminalIpcChannels.Logger)));
    this.__connection = connection;
    this.__proxy = proxy;
    this._onPtyHostStart.fire();
    store.add(this._configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(TerminalSettingId.IgnoreProcessNames)) {
        await this._refreshIgnoreProcessNames();
      }
    }));
    this._refreshIgnoreProcessNames();
  }
  async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName) {
    const timeout = setTimeout(() => this._handleUnresponsiveCreateProcess(), HeartbeatConstants.CreateProcessTimeout);
    const id = await this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName);
    clearTimeout(timeout);
    return id;
  }
  updateTitle(id, title, titleSource) {
    return this._proxy.updateTitle(id, title, titleSource);
  }
  updateIcon(id, userInitiated, icon, color) {
    return this._proxy.updateIcon(id, userInitiated, icon, color);
  }
  attachToProcess(id) {
    return this._proxy.attachToProcess(id);
  }
  detachFromProcess(id, forcePersist) {
    return this._proxy.detachFromProcess(id, forcePersist);
  }
  shutdownAll() {
    return this._proxy.shutdownAll();
  }
  listProcesses() {
    return this._proxy.listProcesses();
  }
  async getPerformanceMarks() {
    return this._optionalProxy?.getPerformanceMarks() ?? [];
  }
  async reduceConnectionGraceTime() {
    return this._optionalProxy?.reduceConnectionGraceTime();
  }
  start(id) {
    return this._proxy.start(id);
  }
  shutdown(id, immediate) {
    return this._proxy.shutdown(id, immediate);
  }
  input(id, data) {
    return this._proxy.input(id, data);
  }
  sendSignal(id, signal) {
    return this._proxy.sendSignal(id, signal);
  }
  processBinary(id, data) {
    return this._proxy.processBinary(id, data);
  }
  resize(id, cols, rows, pixelWidth, pixelHeight) {
    return this._proxy.resize(id, cols, rows, pixelWidth, pixelHeight);
  }
  clearBuffer(id) {
    return this._proxy.clearBuffer(id);
  }
  acknowledgeDataEvent(id, charCount) {
    return this._proxy.acknowledgeDataEvent(id, charCount);
  }
  setUnicodeVersion(id, version) {
    return this._proxy.setUnicodeVersion(id, version);
  }
  setNextCommandId(id, commandLine, commandId) {
    return this._proxy.setNextCommandId(id, commandLine, commandId);
  }
  getInitialCwd(id) {
    return this._proxy.getInitialCwd(id);
  }
  getCwd(id) {
    return this._proxy.getCwd(id);
  }
  async getLatency() {
    const sw = new StopWatch();
    const results = await this._proxy.getLatency();
    sw.stop();
    return [
      {
        label: "ptyhostservice<->ptyhost",
        latency: sw.elapsed()
      },
      ...results
    ];
  }
  orphanQuestionReply(id) {
    return this._proxy.orphanQuestionReply(id);
  }
  installAutoReply(match, reply) {
    return this._proxy.installAutoReply(match, reply);
  }
  uninstallAllAutoReplies() {
    return this._proxy.uninstallAllAutoReplies();
  }
  getDefaultSystemShell(osOverride) {
    return this._optionalProxy?.getDefaultSystemShell(osOverride) ?? getSystemShell(osOverride ?? OS, process.env);
  }
  async getProfiles(workspaceId, profiles, defaultProfile, includeDetectedProfiles = false) {
    const shellEnv = await this._resolveShellEnv();
    return detectAvailableProfiles(profiles, defaultProfile, includeDetectedProfiles, this._configurationService, shellEnv, void 0, this._logService, this._resolveVariables.bind(this, workspaceId));
  }
  async getEnvironment() {
    if (!this.__proxy) {
      return { ...process.env };
    }
    return this._proxy.getEnvironment();
  }
  getWslPath(original, direction) {
    return this._proxy.getWslPath(original, direction);
  }
  getRevivedPtyNewId(workspaceId, id) {
    return this._proxy.getRevivedPtyNewId(workspaceId, id);
  }
  setTerminalLayoutInfo(args) {
    return this._proxy.setTerminalLayoutInfo(args);
  }
  async getTerminalLayoutInfo(args) {
    return this._optionalProxy?.getTerminalLayoutInfo(args);
  }
  async requestDetachInstance(workspaceId, instanceId) {
    return this._proxy.requestDetachInstance(workspaceId, instanceId);
  }
  async acceptDetachInstanceReply(requestId, persistentProcessId) {
    return this._proxy.acceptDetachInstanceReply(requestId, persistentProcessId);
  }
  async freePortKillProcess(port) {
    if (!this._proxy.freePortKillProcess) {
      throw new Error("freePortKillProcess does not exist on the pty proxy");
    }
    return this._proxy.freePortKillProcess(port);
  }
  async serializeTerminalState(ids) {
    return this._proxy.serializeTerminalState(ids);
  }
  async reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocate) {
    return this._proxy.reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocate);
  }
  async refreshProperty(id, property) {
    return this._proxy.refreshProperty(id, property);
  }
  async updateProperty(id, property, value) {
    return this._proxy.updateProperty(id, property, value);
  }
  async restartPtyHost() {
    this._disposePtyHost();
    this._isResponsive = true;
    this._startPtyHost();
  }
  _disposePtyHost() {
    this._clearHeartbeatTimeouts();
    this._optionalProxy?.shutdownAll().catch(() => {
    });
    this.__connection = void 0;
    this.__proxy = void 0;
    this._ptyHostStore.clear();
  }
  _handleHeartbeat(isConnecting) {
    this._clearHeartbeatTimeouts();
    this._heartbeatFirstTimeout = setTimeout(() => this._handleHeartbeatFirstTimeout(), isConnecting ? HeartbeatConstants.ConnectingBeatInterval : HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier);
    if (!this._isResponsive) {
      this._isResponsive = true;
      this._onPtyHostResponsive.fire();
    }
  }
  _handleHeartbeatFirstTimeout() {
    this._logService.warn(`No ptyHost heartbeat after ${HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier / 1e3} seconds`);
    this._heartbeatFirstTimeout = void 0;
    this._heartbeatSecondTimeout = setTimeout(() => this._handleHeartbeatSecondTimeout(), HeartbeatConstants.BeatInterval * HeartbeatConstants.SecondWaitMultiplier);
  }
  _handleHeartbeatSecondTimeout() {
    this._logService.error(`No ptyHost heartbeat after ${(HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier + HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier) / 1e3} seconds`);
    this._heartbeatSecondTimeout = void 0;
    if (this._isResponsive) {
      this._isResponsive = false;
      this._onPtyHostUnresponsive.fire();
    }
  }
  _handleUnresponsiveCreateProcess() {
    this._clearHeartbeatTimeouts();
    this._logService.error(`No ptyHost response to createProcess after ${HeartbeatConstants.CreateProcessTimeout / 1e3} seconds`);
    if (this._isResponsive) {
      this._isResponsive = false;
      this._onPtyHostUnresponsive.fire();
    }
  }
  _clearHeartbeatTimeouts() {
    if (this._heartbeatFirstTimeout) {
      clearTimeout(this._heartbeatFirstTimeout);
      this._heartbeatFirstTimeout = void 0;
    }
    if (this._heartbeatSecondTimeout) {
      clearTimeout(this._heartbeatSecondTimeout);
      this._heartbeatSecondTimeout = void 0;
    }
  }
  _resolveVariables(workspaceId, text) {
    return this._resolveVariablesRequestStore.createRequest({ workspaceId, originalText: text });
  }
  async acceptPtyHostResolvedVariables(requestId, resolved) {
    this._resolveVariablesRequestStore.acceptReply(requestId, resolved);
  }
};
PtyHostService = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ILoggerService)
], PtyHostService);
export {
  PtyHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXG5vZGVcXHB0eUhvc3RTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50LCBPUywgT3BlcmF0aW5nU3lzdGVtLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBQcm94eUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIElMb2dnZXJTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlbW90ZUxvZ2dlckNoYW5uZWxDbGllbnQgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZ0lwYy5qcyc7XG5pbXBvcnQgeyBnZXRSZXNvbHZlZFNoZWxsRW52IH0gZnJvbSAnLi4vLi4vc2hlbGwvbm9kZS9zaGVsbEVudi5qcyc7XG5pbXBvcnQgeyBJUHR5SG9zdFByb2Nlc3NSZXBsYXlFdmVudCB9IGZyb20gJy4uL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IFJlcXVlc3RTdG9yZSB9IGZyb20gJy4uL2NvbW1vbi9yZXF1ZXN0U3RvcmUuanMnO1xuaW1wb3J0IHsgSGVhcnRiZWF0Q29uc3RhbnRzLCBJSGVhcnRiZWF0U2VydmljZSwgSVRlcm1pbmFsTGF1bmNoUmVzdWx0LCBJUHJvY2Vzc0RhdGFFdmVudCwgSVByb2Nlc3NQcm9wZXJ0eSwgSVByb2Nlc3NQcm9wZXJ0eU1hcCwgSVByb2Nlc3NSZWFkeUV2ZW50LCBJUHR5SG9zdExhdGVuY3lNZWFzdXJlbWVudCwgSVB0eUhvc3RTZXJ2aWNlLCBJUHR5U2VydmljZSwgSVJlcXVlc3RSZXNvbHZlVmFyaWFibGVzRXZlbnQsIElTZXJpYWxpemVkVGVybWluYWxTdGF0ZSwgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxMYXVuY2hFcnJvciwgSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsIElUZXJtaW5hbFByb2ZpbGUsIElUZXJtaW5hbHNMYXlvdXRJbmZvLCBQcm9jZXNzUHJvcGVydHlUeXBlLCBUZXJtaW5hbEljb24sIFRlcm1pbmFsSXBjQ2hhbm5lbHMsIFRlcm1pbmFsU2V0dGluZ0lkLCBUaXRsZUV2ZW50U291cmNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGVybWluYWxQbGF0Zm9ybUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxQbGF0Zm9ybUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUdldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3MsIElQcm9jZXNzRGV0YWlscywgSVNldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3MgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxQcm9jZXNzLmpzJztcbmltcG9ydCB7IElQdHlIb3N0Q29ubmVjdGlvbiwgSVB0eUhvc3RTdGFydGVyIH0gZnJvbSAnLi9wdHlIb3N0LmpzJztcbmltcG9ydCB7IGRldGVjdEF2YWlsYWJsZVByb2ZpbGVzIH0gZnJvbSAnLi90ZXJtaW5hbFByb2ZpbGVzLmpzJztcbmltcG9ydCAqIGFzIHBlcmZvcm1hbmNlIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IGdldFN5c3RlbVNoZWxsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3NoZWxsLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5cbmVudW0gQ29uc3RhbnRzIHtcblx0TWF4UmVzdGFydHMgPSA1XG59XG5cbi8qKlxuICogVGhpcyBzZXJ2aWNlIGltcGxlbWVudHMgSVB0eVNlcnZpY2UgYnkgbGF1bmNoaW5nIGEgcHR5IGhvc3QgcHJvY2VzcywgZm9yd2FyZGluZyBtZXNzYWdlcyB0byBhbmRcbiAqIGZyb20gdGhlIHB0eSBob3N0IHByb2Nlc3MgYW5kIG1hbmFnZXMgdGhlIGNvbm5lY3Rpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBQdHlIb3N0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHR5SG9zdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9fY29ubmVjdGlvbj86IElQdHlIb3N0Q29ubmVjdGlvbjtcblx0Ly8gUHJveHlDaGFubmVsIGlzIG5vdCB1c2VkIGhlcmUgYmVjYXVzZSBldmVudHMgZ2V0IGxvc3Qgd2hlbiBmb3J3YXJkaW5nIGFjcm9zcyBtdWx0aXBsZSBwcm94aWVzXG5cdHByaXZhdGUgX19wcm94eT86IElQdHlTZXJ2aWNlO1xuXG5cdHByaXZhdGUgZ2V0IF9wcm94eSgpOiBJUHR5U2VydmljZSB7XG5cdFx0dGhpcy5fZW5zdXJlUHR5SG9zdCgpO1xuXHRcdHJldHVybiB0aGlzLl9fcHJveHkhO1xuXHR9XG5cdC8qKlxuXHQgKiBHZXQgdGhlIHByb3h5IGlmIGl0IGV4aXN0cywgb3RoZXJ3aXNlIHVuZGVmaW5lZC4gVGhpcyBpcyB1c2VkIHdoZW4gY2FsbHMgYXJlIG5vdCBuZWVkZWQgdG8gYmVcblx0ICogcGFzc2VkIHRocm91Z2ggdG8gdGhlIHB0eSBob3N0IGlmIGl0IGhhcyBub3QgeWV0IGJlZW4gc3Bhd25lZC5cblx0ICovXG5cdHByaXZhdGUgZ2V0IF9vcHRpb25hbFByb3h5KCk6IElQdHlTZXJ2aWNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fX3Byb3h5O1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlUHR5SG9zdCgpIHtcblx0XHRpZiAoIXRoaXMuX19jb25uZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9zdGFydFB0eUhvc3QoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlVmFyaWFibGVzUmVxdWVzdFN0b3JlOiBSZXF1ZXN0U3RvcmU8c3RyaW5nW10sIHsgd29ya3NwYWNlSWQ6IHN0cmluZzsgb3JpZ2luYWxUZXh0OiBzdHJpbmdbXSB9Pjtcblx0cHJpdmF0ZSBfd2FzUXVpdFJlcXVlc3RlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9yZXN0YXJ0Q291bnQgPSAwO1xuXHRwcml2YXRlIF9pc1Jlc3BvbnNpdmUgPSB0cnVlO1xuXHRwcml2YXRlIF9oZWFydGJlYXRGaXJzdFRpbWVvdXQ/OiBUaW1lb3V0O1xuXHRwcml2YXRlIF9oZWFydGJlYXRTZWNvbmRUaW1lb3V0PzogVGltZW91dDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblB0eUhvc3RFeGl0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cmVhZG9ubHkgb25QdHlIb3N0RXhpdCA9IHRoaXMuX29uUHR5SG9zdEV4aXQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHR5SG9zdFN0YXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUHR5SG9zdFN0YXJ0ID0gdGhpcy5fb25QdHlIb3N0U3RhcnQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHR5SG9zdFVucmVzcG9uc2l2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblB0eUhvc3RVbnJlc3BvbnNpdmUgPSB0aGlzLl9vblB0eUhvc3RVbnJlc3BvbnNpdmUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHR5SG9zdFJlc3BvbnNpdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25QdHlIb3N0UmVzcG9uc2l2ZSA9IHRoaXMuX29uUHR5SG9zdFJlc3BvbnNpdmUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHR5SG9zdFJlcXVlc3RSZXNvbHZlVmFyaWFibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVJlcXVlc3RSZXNvbHZlVmFyaWFibGVzRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvblB0eUhvc3RSZXF1ZXN0UmVzb2x2ZVZhcmlhYmxlcyA9IHRoaXMuX29uUHR5SG9zdFJlcXVlc3RSZXNvbHZlVmFyaWFibGVzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc0RhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBudW1iZXI7IGV2ZW50OiBJUHJvY2Vzc0RhdGFFdmVudCB8IHN0cmluZyB9PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzRGF0YSA9IHRoaXMuX29uUHJvY2Vzc0RhdGEuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc1JlYWR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogbnVtYmVyOyBldmVudDogSVByb2Nlc3NSZWFkeUV2ZW50IH0+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NSZWFkeSA9IHRoaXMuX29uUHJvY2Vzc1JlYWR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NSZXBsYXkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBudW1iZXI7IGV2ZW50OiBJUHR5SG9zdFByb2Nlc3NSZXBsYXlFdmVudCB9PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzUmVwbGF5ID0gdGhpcy5fb25Qcm9jZXNzUmVwbGF5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NPcnBoYW5RdWVzdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzT3JwaGFuUXVlc3Rpb24gPSB0aGlzLl9vblByb2Nlc3NPcnBoYW5RdWVzdGlvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0RGV0YWNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZXF1ZXN0SWQ6IG51bWJlcjsgd29ya3NwYWNlSWQ6IHN0cmluZzsgaW5zdGFuY2VJZDogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3REZXRhY2ggPSB0aGlzLl9vbkRpZFJlcXVlc3REZXRhY2guZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvcGVydHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBudW1iZXI7IHByb3BlcnR5OiBJUHJvY2Vzc1Byb3BlcnR5IH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb3BlcnR5ID0gdGhpcy5fb25EaWRDaGFuZ2VQcm9wZXJ0eS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzRXhpdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlcjsgZXZlbnQ6IG51bWJlciB8IHVuZGVmaW5lZCB9PigpKTtcblx0cmVhZG9ubHkgb25Qcm9jZXNzRXhpdCA9IHRoaXMuX29uUHJvY2Vzc0V4aXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHR5SG9zdFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wdHlIb3N0U3RhcnRlcjogSVB0eUhvc3RTdGFydGVyLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElMb2dnZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gUGxhdGZvcm0gY29uZmlndXJhdGlvbiBpcyByZXF1aXJlZCBvbiB0aGUgcHJvY2VzcyBydW5uaW5nIHRoZSBwdHkgaG9zdCAoc2hhcmVkIHByb2Nlc3Mgb3Jcblx0XHQvLyByZW1vdGUgc2VydmVyKS5cblx0XHRyZWdpc3RlclRlcm1pbmFsUGxhdGZvcm1Db25maWd1cmF0aW9uKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wdHlIb3N0U3RhcnRlcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2Rpc3Bvc2VQdHlIb3N0KCkpKTtcblxuXHRcdHRoaXMuX3Jlc29sdmVWYXJpYWJsZXNSZXF1ZXN0U3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVxdWVzdFN0b3JlKHVuZGVmaW5lZCwgdGhpcy5fbG9nU2VydmljZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Jlc29sdmVWYXJpYWJsZXNSZXF1ZXN0U3RvcmUub25DcmVhdGVSZXF1ZXN0KHRoaXMuX29uUHR5SG9zdFJlcXVlc3RSZXNvbHZlVmFyaWFibGVzLmZpcmUsIHRoaXMuX29uUHR5SG9zdFJlcXVlc3RSZXNvbHZlVmFyaWFibGVzKSk7XG5cblx0XHQvLyBTdGFydCB0aGUgcHR5IGhvc3Qgd2hlbiBhIHdpbmRvdyByZXF1ZXN0cyBhIGNvbm5lY3Rpb24sIGlmIHRoZSBzdGFydGVyIGhhcyB0aGF0IGNhcGFiaWxpdHkuXG5cdFx0aWYgKHRoaXMuX3B0eUhvc3RTdGFydGVyLm9uUmVxdWVzdENvbm5lY3Rpb24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50Lm9uY2UodGhpcy5fcHR5SG9zdFN0YXJ0ZXIub25SZXF1ZXN0Q29ubmVjdGlvbikoKCkgPT4gdGhpcy5fZW5zdXJlUHR5SG9zdCgpKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3B0eUhvc3RTdGFydGVyLm9uV2lsbFNodXRkb3duKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wdHlIb3N0U3RhcnRlci5vbldpbGxTaHV0ZG93bigoKSA9PiB0aGlzLl93YXNRdWl0UmVxdWVzdGVkID0gdHJ1ZSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9pZ25vcmVQcm9jZXNzTmFtZXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmdbXT4oVGVybWluYWxTZXR0aW5nSWQuSWdub3JlUHJvY2Vzc05hbWVzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hJZ25vcmVQcm9jZXNzTmFtZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbmFsUHJveHk/LnJlZnJlc2hJZ25vcmVQcm9jZXNzTmFtZXM/Lih0aGlzLl9pZ25vcmVQcm9jZXNzTmFtZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVNoZWxsRW52KCk6IFByb21pc2U8dHlwZW9mIHByb2Nlc3MuZW52PiB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0cmV0dXJuIHByb2Nlc3MuZW52O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgZ2V0UmVzb2x2ZWRTaGVsbEVudih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgeyBfOiBbXSB9LCBwcm9jZXNzLmVudik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ3B0eUhvc3Qgd2FzIHVuYWJsZSB0byByZXNvbHZlIHNoZWxsIGVudmlyb25tZW50JywgZXJyb3IpO1xuXG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRQdHlIb3N0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9wdHlIb3N0U3RhcnRlci5zdGFydCgpO1xuXHRcdGNvbnN0IGNsaWVudCA9IGNvbm5lY3Rpb24uY2xpZW50O1xuXHRcdGNvbnN0IHN0b3JlID0gdGhpcy5fcHR5SG9zdFN0b3JlO1xuXHRcdC8vIFRyYW5zZmVyIG93bmVyc2hpcCBvZiB0aGUgcGVyLWhvc3QgY29ubmVjdGlvbiBzdG9yZSBzbyBpdCBpcyBkaXNwb3NlZCB0b2dldGhlciB3aXRoIHRoZSBsaXN0ZW5lcnMgYmVsb3cgb24gdGhlIG5leHQgcmVzdGFydC5cblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbi5zdG9yZSk7XG5cblx0XHQvLyBMb2cgYSBmdWxsIHN0YWNrIHRyYWNlIHdoaWNoIHdpbGwgdGVsbCB0aGUgZXhhY3QgcmVhc29uIHRoZSBwdHkgaG9zdCBpcyBzdGFydGluZyB1cFxuXHRcdGlmICh0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCkgPT09IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdQdHlIb3N0U2VydmljZSNfc3RhcnRQdHlIb3N0JywgbmV3IEVycm9yKCkuc3RhY2s/LnJlcGxhY2UoL15FcnJvci8sICcnKSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0dXAgaGVhcnRiZWF0IHNlcnZpY2UgYW5kIHRyaWdnZXIgYSBoZWFydGJlYXQgaW1tZWRpYXRlbHkgdG8gcmVzZXQgdGhlIHRpbWVvdXRzXG5cdFx0Y29uc3QgaGVhcnRiZWF0U2VydmljZSA9IFByb3h5Q2hhbm5lbC50b1NlcnZpY2U8SUhlYXJ0YmVhdFNlcnZpY2U+KGNsaWVudC5nZXRDaGFubmVsKFRlcm1pbmFsSXBjQ2hhbm5lbHMuSGVhcnRiZWF0KSk7XG5cdFx0c3RvcmUuYWRkKGhlYXJ0YmVhdFNlcnZpY2Uub25CZWF0KCgpID0+IHRoaXMuX2hhbmRsZUhlYXJ0YmVhdCgpKSk7XG5cdFx0dGhpcy5faGFuZGxlSGVhcnRiZWF0KHRydWUpO1xuXG5cdFx0Ly8gSGFuZGxlIGV4aXRcblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbi5vbkRpZFByb2Nlc3NFeGl0KGUgPT4ge1xuXHRcdFx0dGhpcy5fb25QdHlIb3N0RXhpdC5maXJlKGUuY29kZSk7XG5cdFx0XHRpZiAoIXRoaXMuX3dhc1F1aXRSZXF1ZXN0ZWQgJiYgIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0aWYgKHRoaXMuX3Jlc3RhcnRDb3VudCA8PSBDb25zdGFudHMuTWF4UmVzdGFydHMpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBwdHlIb3N0IHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5IHdpdGggY29kZSAke2UuY29kZX1gKTtcblx0XHRcdFx0XHR0aGlzLl9yZXN0YXJ0Q291bnQrKztcblx0XHRcdFx0XHR0aGlzLnJlc3RhcnRQdHlIb3N0KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgcHR5SG9zdCB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseSB3aXRoIGNvZGUgJHtlLmNvZGV9LCBnaXZpbmcgdXBgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIENyZWF0ZSBwcm94eSBhbmQgZm9yd2FyZCBldmVudHNcblx0XHRjb25zdCBwcm94eSA9IFByb3h5Q2hhbm5lbC50b1NlcnZpY2U8SVB0eVNlcnZpY2U+KGNsaWVudC5nZXRDaGFubmVsKFRlcm1pbmFsSXBjQ2hhbm5lbHMuUHR5SG9zdCkpO1xuXHRcdHN0b3JlLmFkZChwcm94eS5vblByb2Nlc3NEYXRhKGUgPT4gdGhpcy5fb25Qcm9jZXNzRGF0YS5maXJlKGUpKSk7XG5cdFx0c3RvcmUuYWRkKHByb3h5Lm9uUHJvY2Vzc1JlYWR5KGUgPT4gdGhpcy5fb25Qcm9jZXNzUmVhZHkuZmlyZShlKSkpO1xuXHRcdHN0b3JlLmFkZChwcm94eS5vblByb2Nlc3NFeGl0KGUgPT4gdGhpcy5fb25Qcm9jZXNzRXhpdC5maXJlKGUpKSk7XG5cdFx0c3RvcmUuYWRkKHByb3h5Lm9uRGlkQ2hhbmdlUHJvcGVydHkoZSA9PiB0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmZpcmUoZSkpKTtcblx0XHRzdG9yZS5hZGQocHJveHkub25Qcm9jZXNzUmVwbGF5KGUgPT4gdGhpcy5fb25Qcm9jZXNzUmVwbGF5LmZpcmUoZSkpKTtcblx0XHRzdG9yZS5hZGQocHJveHkub25Qcm9jZXNzT3JwaGFuUXVlc3Rpb24oZSA9PiB0aGlzLl9vblByb2Nlc3NPcnBoYW5RdWVzdGlvbi5maXJlKGUpKSk7XG5cdFx0c3RvcmUuYWRkKHByb3h5Lm9uRGlkUmVxdWVzdERldGFjaChlID0+IHRoaXMuX29uRGlkUmVxdWVzdERldGFjaC5maXJlKGUpKSk7XG5cblx0XHRzdG9yZS5hZGQobmV3IFJlbW90ZUxvZ2dlckNoYW5uZWxDbGllbnQodGhpcy5fbG9nZ2VyU2VydmljZSwgY2xpZW50LmdldENoYW5uZWwoVGVybWluYWxJcGNDaGFubmVscy5Mb2dnZXIpKSk7XG5cblx0XHR0aGlzLl9fY29ubmVjdGlvbiA9IGNvbm5lY3Rpb247XG5cdFx0dGhpcy5fX3Byb3h5ID0gcHJveHk7XG5cblx0XHR0aGlzLl9vblB0eUhvc3RTdGFydC5maXJlKCk7XG5cblx0XHRzdG9yZS5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuSWdub3JlUHJvY2Vzc05hbWVzKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoSWdub3JlUHJvY2Vzc05hbWVzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZnJlc2hJZ25vcmVQcm9jZXNzTmFtZXMoKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVByb2Nlc3MoXG5cdFx0c2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0XHRjd2Q6IHN0cmluZyxcblx0XHRjb2xzOiBudW1iZXIsXG5cdFx0cm93czogbnVtYmVyLFxuXHRcdHVuaWNvZGVWZXJzaW9uOiAnNicgfCAnMTEnLFxuXHRcdGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCxcblx0XHRleGVjdXRhYmxlRW52OiBJUHJvY2Vzc0Vudmlyb25tZW50LFxuXHRcdG9wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLFxuXHRcdHNob3VsZFBlcnNpc3Q6IGJvb2xlYW4sXG5cdFx0d29ya3NwYWNlSWQ6IHN0cmluZyxcblx0XHR3b3Jrc3BhY2VOYW1lOiBzdHJpbmdcblx0KTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLl9oYW5kbGVVbnJlc3BvbnNpdmVDcmVhdGVQcm9jZXNzKCksIEhlYXJ0YmVhdENvbnN0YW50cy5DcmVhdGVQcm9jZXNzVGltZW91dCk7XG5cdFx0Y29uc3QgaWQgPSBhd2FpdCB0aGlzLl9wcm94eS5jcmVhdGVQcm9jZXNzKHNoZWxsTGF1bmNoQ29uZmlnLCBjd2QsIGNvbHMsIHJvd3MsIHVuaWNvZGVWZXJzaW9uLCBlbnYsIGV4ZWN1dGFibGVFbnYsIG9wdGlvbnMsIHNob3VsZFBlcnNpc3QsIHdvcmtzcGFjZUlkLCB3b3Jrc3BhY2VOYW1lKTtcblx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdHVwZGF0ZVRpdGxlKGlkOiBudW1iZXIsIHRpdGxlOiBzdHJpbmcsIHRpdGxlU291cmNlOiBUaXRsZUV2ZW50U291cmNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnVwZGF0ZVRpdGxlKGlkLCB0aXRsZSwgdGl0bGVTb3VyY2UpO1xuXHR9XG5cdHVwZGF0ZUljb24oaWQ6IG51bWJlciwgdXNlckluaXRpYXRlZDogYm9vbGVhbiwgaWNvbjogVGVybWluYWxJY29uLCBjb2xvcj86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS51cGRhdGVJY29uKGlkLCB1c2VySW5pdGlhdGVkLCBpY29uLCBjb2xvcik7XG5cdH1cblx0YXR0YWNoVG9Qcm9jZXNzKGlkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuYXR0YWNoVG9Qcm9jZXNzKGlkKTtcblx0fVxuXHRkZXRhY2hGcm9tUHJvY2VzcyhpZDogbnVtYmVyLCBmb3JjZVBlcnNpc3Q/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmRldGFjaEZyb21Qcm9jZXNzKGlkLCBmb3JjZVBlcnNpc3QpO1xuXHR9XG5cdHNodXRkb3duQWxsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5zaHV0ZG93bkFsbCgpO1xuXHR9XG5cdGxpc3RQcm9jZXNzZXMoKTogUHJvbWlzZTxJUHJvY2Vzc0RldGFpbHNbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5saXN0UHJvY2Vzc2VzKCk7XG5cdH1cblx0YXN5bmMgZ2V0UGVyZm9ybWFuY2VNYXJrcygpOiBQcm9taXNlPHBlcmZvcm1hbmNlLlBlcmZvcm1hbmNlTWFya1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbmFsUHJveHk/LmdldFBlcmZvcm1hbmNlTWFya3MoKSA/PyBbXTtcblx0fVxuXHRhc3luYyByZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25hbFByb3h5Py5yZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk7XG5cdH1cblx0c3RhcnQoaWQ6IG51bWJlcik6IFByb21pc2U8SVRlcm1pbmFsTGF1bmNoRXJyb3IgfCBJVGVybWluYWxMYXVuY2hSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuc3RhcnQoaWQpO1xuXHR9XG5cdHNodXRkb3duKGlkOiBudW1iZXIsIGltbWVkaWF0ZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5zaHV0ZG93bihpZCwgaW1tZWRpYXRlKTtcblx0fVxuXHRpbnB1dChpZDogbnVtYmVyLCBkYXRhOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuaW5wdXQoaWQsIGRhdGEpO1xuXHR9XG5cdHNlbmRTaWduYWwoaWQ6IG51bWJlciwgc2lnbmFsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuc2VuZFNpZ25hbChpZCwgc2lnbmFsKTtcblx0fVxuXHRwcm9jZXNzQmluYXJ5KGlkOiBudW1iZXIsIGRhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5wcm9jZXNzQmluYXJ5KGlkLCBkYXRhKTtcblx0fVxuXHRyZXNpemUoaWQ6IG51bWJlciwgY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIsIHBpeGVsV2lkdGg/OiBudW1iZXIsIHBpeGVsSGVpZ2h0PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnJlc2l6ZShpZCwgY29scywgcm93cywgcGl4ZWxXaWR0aCwgcGl4ZWxIZWlnaHQpO1xuXHR9XG5cdGNsZWFyQnVmZmVyKGlkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuY2xlYXJCdWZmZXIoaWQpO1xuXHR9XG5cdGFja25vd2xlZGdlRGF0YUV2ZW50KGlkOiBudW1iZXIsIGNoYXJDb3VudDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmFja25vd2xlZGdlRGF0YUV2ZW50KGlkLCBjaGFyQ291bnQpO1xuXHR9XG5cdHNldFVuaWNvZGVWZXJzaW9uKGlkOiBudW1iZXIsIHZlcnNpb246ICc2JyB8ICcxMScpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuc2V0VW5pY29kZVZlcnNpb24oaWQsIHZlcnNpb24pO1xuXHR9XG5cdHNldE5leHRDb21tYW5kSWQoaWQ6IG51bWJlciwgY29tbWFuZExpbmU6IHN0cmluZywgY29tbWFuZElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuc2V0TmV4dENvbW1hbmRJZChpZCwgY29tbWFuZExpbmUsIGNvbW1hbmRJZCk7XG5cdH1cblx0Z2V0SW5pdGlhbEN3ZChpZDogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuZ2V0SW5pdGlhbEN3ZChpZCk7XG5cdH1cblx0Z2V0Q3dkKGlkOiBudW1iZXIpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5nZXRDd2QoaWQpO1xuXHR9XG5cdGFzeW5jIGdldExhdGVuY3koKTogUHJvbWlzZTxJUHR5SG9zdExhdGVuY3lNZWFzdXJlbWVudFtdPiB7XG5cdFx0Y29uc3Qgc3cgPSBuZXcgU3RvcFdhdGNoKCk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuX3Byb3h5LmdldExhdGVuY3koKTtcblx0XHRzdy5zdG9wKCk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICdwdHlob3N0c2VydmljZTwtPnB0eWhvc3QnLFxuXHRcdFx0XHRsYXRlbmN5OiBzdy5lbGFwc2VkKClcblx0XHRcdH0sXG5cdFx0XHQuLi5yZXN1bHRzXG5cdFx0XTtcblx0fVxuXHRvcnBoYW5RdWVzdGlvblJlcGx5KGlkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkub3JwaGFuUXVlc3Rpb25SZXBseShpZCk7XG5cdH1cblxuXHRpbnN0YWxsQXV0b1JlcGx5KG1hdGNoOiBzdHJpbmcsIHJlcGx5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuaW5zdGFsbEF1dG9SZXBseShtYXRjaCwgcmVwbHkpO1xuXHR9XG5cdHVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS51bmluc3RhbGxBbGxBdXRvUmVwbGllcygpO1xuXHR9XG5cblx0Z2V0RGVmYXVsdFN5c3RlbVNoZWxsKG9zT3ZlcnJpZGU/OiBPcGVyYXRpbmdTeXN0ZW0pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25hbFByb3h5Py5nZXREZWZhdWx0U3lzdGVtU2hlbGwob3NPdmVycmlkZSkgPz8gZ2V0U3lzdGVtU2hlbGwob3NPdmVycmlkZSA/PyBPUywgcHJvY2Vzcy5lbnYpO1xuXHR9XG5cdGFzeW5jIGdldFByb2ZpbGVzKHdvcmtzcGFjZUlkOiBzdHJpbmcsIHByb2ZpbGVzOiB1bmtub3duLCBkZWZhdWx0UHJvZmlsZTogdW5rbm93biwgaW5jbHVkZURldGVjdGVkUHJvZmlsZXM6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZVtdPiB7XG5cdFx0Y29uc3Qgc2hlbGxFbnYgPSBhd2FpdCB0aGlzLl9yZXNvbHZlU2hlbGxFbnYoKTtcblx0XHRyZXR1cm4gZGV0ZWN0QXZhaWxhYmxlUHJvZmlsZXMocHJvZmlsZXMsIGRlZmF1bHRQcm9maWxlLCBpbmNsdWRlRGV0ZWN0ZWRQcm9maWxlcywgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHNoZWxsRW52LCB1bmRlZmluZWQsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX3Jlc29sdmVWYXJpYWJsZXMuYmluZCh0aGlzLCB3b3Jrc3BhY2VJZCkpO1xuXHR9XG5cdGFzeW5jIGdldEVudmlyb25tZW50KCk6IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD4ge1xuXHRcdC8vIElmIHRoZSBwdHkgaG9zdCBpcyB5ZXQgdG8gYmUgbGF1bmNoZWQsIGp1c3QgcmV0dXJuIHRoZSBlbnZpcm9ubWVudCBvZiB0aGlzIHByb2Nlc3MgYXMgaXRcblx0XHQvLyBpcyBlc3NlbnRpYWxseSB0aGUgc2FtZSB3aGVuIHVzZWQgdG8gZXZhbHVhdGUgdGVybWluYWwgcHJvZmlsZXMuXG5cdFx0aWYgKCF0aGlzLl9fcHJveHkpIHtcblx0XHRcdHJldHVybiB7IC4uLnByb2Nlc3MuZW52IH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94eS5nZXRFbnZpcm9ubWVudCgpO1xuXHR9XG5cdGdldFdzbFBhdGgob3JpZ2luYWw6IHN0cmluZywgZGlyZWN0aW9uOiAndW5peC10by13aW4nIHwgJ3dpbi10by11bml4Jyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmdldFdzbFBhdGgob3JpZ2luYWwsIGRpcmVjdGlvbik7XG5cdH1cblxuXHRnZXRSZXZpdmVkUHR5TmV3SWQod29ya3NwYWNlSWQ6IHN0cmluZywgaWQ6IG51bWJlcik6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmdldFJldml2ZWRQdHlOZXdJZCh3b3Jrc3BhY2VJZCwgaWQpO1xuXHR9XG5cblx0c2V0VGVybWluYWxMYXlvdXRJbmZvKGFyZ3M6IElTZXRUZXJtaW5hbExheW91dEluZm9BcmdzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnNldFRlcm1pbmFsTGF5b3V0SW5mbyhhcmdzKTtcblx0fVxuXHRhc3luYyBnZXRUZXJtaW5hbExheW91dEluZm8oYXJnczogSUdldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3MpOiBQcm9taXNlPElUZXJtaW5hbHNMYXlvdXRJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gVGhpcyBpcyBvcHRpb25hbCBhcyB3ZSB3YW50IHJlY29ubmVjdCByZXF1ZXN0cyB0byBnbyB0aHJvdWdoIG9ubHkgaWYgdGhlIHB0eSBob3N0IGV4aXN0cy5cblx0XHQvLyBSZXZpdmUgaXMgaGFuZGxlZCBzcGVjaWFsbHkgYXMgcmV2aXZlVGVybWluYWxQcm9jZXNzZXMgaXMgZ3VhcmFudGVlZCB0byBiZSBjYWxsZWQgYmVmb3JlXG5cdFx0Ly8gdGhlIHJlcXVlc3QgZm9yIGxheW91dCBpbmZvLlxuXHRcdHJldHVybiB0aGlzLl9vcHRpb25hbFByb3h5Py5nZXRUZXJtaW5hbExheW91dEluZm8oYXJncyk7XG5cdH1cblxuXHRhc3luYyByZXF1ZXN0RGV0YWNoSW5zdGFuY2Uod29ya3NwYWNlSWQ6IHN0cmluZywgaW5zdGFuY2VJZDogbnVtYmVyKTogUHJvbWlzZTxJUHJvY2Vzc0RldGFpbHMgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkucmVxdWVzdERldGFjaEluc3RhbmNlKHdvcmtzcGFjZUlkLCBpbnN0YW5jZUlkKTtcblx0fVxuXG5cdGFzeW5jIGFjY2VwdERldGFjaEluc3RhbmNlUmVwbHkocmVxdWVzdElkOiBudW1iZXIsIHBlcnNpc3RlbnRQcm9jZXNzSWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5hY2NlcHREZXRhY2hJbnN0YW5jZVJlcGx5KHJlcXVlc3RJZCwgcGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cdH1cblxuXHRhc3luYyBmcmVlUG9ydEtpbGxQcm9jZXNzKHBvcnQ6IHN0cmluZyk6IFByb21pc2U8eyBwb3J0OiBzdHJpbmc7IHByb2Nlc3NJZDogc3RyaW5nIH0+IHtcblx0XHRpZiAoIXRoaXMuX3Byb3h5LmZyZWVQb3J0S2lsbFByb2Nlc3MpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignZnJlZVBvcnRLaWxsUHJvY2VzcyBkb2VzIG5vdCBleGlzdCBvbiB0aGUgcHR5IHByb3h5Jyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wcm94eS5mcmVlUG9ydEtpbGxQcm9jZXNzKHBvcnQpO1xuXHR9XG5cblx0YXN5bmMgc2VyaWFsaXplVGVybWluYWxTdGF0ZShpZHM6IG51bWJlcltdKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuc2VyaWFsaXplVGVybWluYWxTdGF0ZShpZHMpO1xuXHR9XG5cblx0YXN5bmMgcmV2aXZlVGVybWluYWxQcm9jZXNzZXMod29ya3NwYWNlSWQ6IHN0cmluZywgc3RhdGU6IElTZXJpYWxpemVkVGVybWluYWxTdGF0ZVtdLCBkYXRlVGltZUZvcm1hdExvY2F0ZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnJldml2ZVRlcm1pbmFsUHJvY2Vzc2VzKHdvcmtzcGFjZUlkLCBzdGF0ZSwgZGF0ZVRpbWVGb3JtYXRMb2NhdGUpO1xuXHR9XG5cblx0YXN5bmMgcmVmcmVzaFByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPihpZDogbnVtYmVyLCBwcm9wZXJ0eTogVCk6IFByb21pc2U8SVByb2Nlc3NQcm9wZXJ0eU1hcFtUXT4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5yZWZyZXNoUHJvcGVydHkoaWQsIHByb3BlcnR5KTtcblxuXHR9XG5cdGFzeW5jIHVwZGF0ZVByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPihpZDogbnVtYmVyLCBwcm9wZXJ0eTogVCwgdmFsdWU6IElQcm9jZXNzUHJvcGVydHlNYXBbVF0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkudXBkYXRlUHJvcGVydHkoaWQsIHByb3BlcnR5LCB2YWx1ZSk7XG5cdH1cblxuXHRhc3luYyByZXN0YXJ0UHR5SG9zdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9kaXNwb3NlUHR5SG9zdCgpO1xuXHRcdHRoaXMuX2lzUmVzcG9uc2l2ZSA9IHRydWU7XG5cdFx0dGhpcy5fc3RhcnRQdHlIb3N0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwb3NlUHR5SG9zdCgpOiB2b2lkIHtcblx0XHQvLyBIZWFydGJlYXQgdGltZXJzIGFyZSBiYXJlIHNldFRpbWVvdXQgaGFuZGxlcywgbm90IGRpc3Bvc2FibGVzIGluIHRoZSBzdG9yZSwgc28gdGhleSBuZWVkIGFuIGV4cGxpY2l0IGNsZWFyLlxuXHRcdC8vIHNodXRkb3duQWxsKCkgaXMgZmlyZWQgYmVmb3JlIGNsZWFyaW5nIHRoZSBzdG9yZSBzbyBhbnkgaW4tZmxpZ2h0IGV4aXQgbGlzdGVuZXIgc3RpbGwgaGFzIGEgbGl2ZSBwcm94eSB0byByZWFkIGZyb207XG5cdFx0Ly8gdGhlIHBlci1ob3N0IGxpc3RlbmVyIHN0b3JlIGlzIGNsZWFyZWQgbGFzdCBzbyB0aGUgb24tZXhpdCBzaWduYWwgaXNuJ3QgZHJvcHBlZCBvbiB0aGUgZmxvb3IuXG5cdFx0dGhpcy5fY2xlYXJIZWFydGJlYXRUaW1lb3V0cygpO1xuXHRcdC8vIEZpcmUtYW5kLWZvcmdldDogdGhlIElQQyBjaGFubmVsIG1heSBhbHJlYWR5IGJlIGdvbmU7IHN3YWxsb3cgcmVqZWN0aW9ucyBzbyB3ZSBkb24ndCBzdXJmYWNlIGFuIHVuaGFuZGxlZCBwcm9taXNlLlxuXHRcdHRoaXMuX29wdGlvbmFsUHJveHk/LnNodXRkb3duQWxsKCkuY2F0Y2goKCkgPT4geyB9KTtcblx0XHR0aGlzLl9fY29ubmVjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9fcHJveHkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcHR5SG9zdFN0b3JlLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVIZWFydGJlYXQoaXNDb25uZWN0aW5nPzogYm9vbGVhbikge1xuXHRcdHRoaXMuX2NsZWFySGVhcnRiZWF0VGltZW91dHMoKTtcblx0XHR0aGlzLl9oZWFydGJlYXRGaXJzdFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuX2hhbmRsZUhlYXJ0YmVhdEZpcnN0VGltZW91dCgpLCBpc0Nvbm5lY3RpbmcgPyBIZWFydGJlYXRDb25zdGFudHMuQ29ubmVjdGluZ0JlYXRJbnRlcnZhbCA6IChIZWFydGJlYXRDb25zdGFudHMuQmVhdEludGVydmFsICogSGVhcnRiZWF0Q29uc3RhbnRzLkZpcnN0V2FpdE11bHRpcGxpZXIpKTtcblx0XHRpZiAoIXRoaXMuX2lzUmVzcG9uc2l2ZSkge1xuXHRcdFx0dGhpcy5faXNSZXNwb25zaXZlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uUHR5SG9zdFJlc3BvbnNpdmUuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUhlYXJ0YmVhdEZpcnN0VGltZW91dCgpIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIHB0eUhvc3QgaGVhcnRiZWF0IGFmdGVyICR7SGVhcnRiZWF0Q29uc3RhbnRzLkJlYXRJbnRlcnZhbCAqIEhlYXJ0YmVhdENvbnN0YW50cy5GaXJzdFdhaXRNdWx0aXBsaWVyIC8gMTAwMH0gc2Vjb25kc2ApO1xuXHRcdHRoaXMuX2hlYXJ0YmVhdEZpcnN0VGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9oZWFydGJlYXRTZWNvbmRUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLl9oYW5kbGVIZWFydGJlYXRTZWNvbmRUaW1lb3V0KCksIEhlYXJ0YmVhdENvbnN0YW50cy5CZWF0SW50ZXJ2YWwgKiBIZWFydGJlYXRDb25zdGFudHMuU2Vjb25kV2FpdE11bHRpcGxpZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlSGVhcnRiZWF0U2Vjb25kVGltZW91dCgpIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBObyBwdHlIb3N0IGhlYXJ0YmVhdCBhZnRlciAkeyhIZWFydGJlYXRDb25zdGFudHMuQmVhdEludGVydmFsICogSGVhcnRiZWF0Q29uc3RhbnRzLkZpcnN0V2FpdE11bHRpcGxpZXIgKyBIZWFydGJlYXRDb25zdGFudHMuQmVhdEludGVydmFsICogSGVhcnRiZWF0Q29uc3RhbnRzLkZpcnN0V2FpdE11bHRpcGxpZXIpIC8gMTAwMH0gc2Vjb25kc2ApO1xuXHRcdHRoaXMuX2hlYXJ0YmVhdFNlY29uZFRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX2lzUmVzcG9uc2l2ZSkge1xuXHRcdFx0dGhpcy5faXNSZXNwb25zaXZlID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9vblB0eUhvc3RVbnJlc3BvbnNpdmUuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVVucmVzcG9uc2l2ZUNyZWF0ZVByb2Nlc3MoKSB7XG5cdFx0dGhpcy5fY2xlYXJIZWFydGJlYXRUaW1lb3V0cygpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYE5vIHB0eUhvc3QgcmVzcG9uc2UgdG8gY3JlYXRlUHJvY2VzcyBhZnRlciAke0hlYXJ0YmVhdENvbnN0YW50cy5DcmVhdGVQcm9jZXNzVGltZW91dCAvIDEwMDB9IHNlY29uZHNgKTtcblx0XHRpZiAodGhpcy5faXNSZXNwb25zaXZlKSB7XG5cdFx0XHR0aGlzLl9pc1Jlc3BvbnNpdmUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uUHR5SG9zdFVucmVzcG9uc2l2ZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJIZWFydGJlYXRUaW1lb3V0cygpIHtcblx0XHRpZiAodGhpcy5faGVhcnRiZWF0Rmlyc3RUaW1lb3V0KSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5faGVhcnRiZWF0Rmlyc3RUaW1lb3V0KTtcblx0XHRcdHRoaXMuX2hlYXJ0YmVhdEZpcnN0VGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2hlYXJ0YmVhdFNlY29uZFRpbWVvdXQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9oZWFydGJlYXRTZWNvbmRUaW1lb3V0KTtcblx0XHRcdHRoaXMuX2hlYXJ0YmVhdFNlY29uZFRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVZhcmlhYmxlcyh3b3Jrc3BhY2VJZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVZhcmlhYmxlc1JlcXVlc3RTdG9yZS5jcmVhdGVSZXF1ZXN0KHsgd29ya3NwYWNlSWQsIG9yaWdpbmFsVGV4dDogdGV4dCB9KTtcblx0fVxuXHRhc3luYyBhY2NlcHRQdHlIb3N0UmVzb2x2ZWRWYXJpYWJsZXMocmVxdWVzdElkOiBudW1iZXIsIHJlc29sdmVkOiBzdHJpbmdbXSkge1xuXHRcdHRoaXMuX3Jlc29sdmVWYXJpYWJsZXNSZXF1ZXN0U3RvcmUuYWNjZXB0UmVwbHkocmVxdWVzdElkLCByZXNvbHZlZCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBOEIsSUFBcUIsaUJBQWlCO0FBQ3BF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
