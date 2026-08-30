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
import { Disposable } from "../../../base/common/lifecycle.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { LogLevel, LogLevelToString } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREVENT_SLEEP, normalizeTunnelName, tunnelNameFromHostname } from "../common/remoteTunnel.js";
import { parseTunnelMachineStatus } from "../common/tunnelMachineStatus.js";
import { CodeTunnelCli } from "./codeTunnelCliProcess.js";
import { hostname } from "os";
const ITunnelProcessCoordinator = createDecorator("tunnelProcessCoordinator");
function resolveTunnelProcessMode(agentHostSharing, remoteAccess) {
  if (remoteAccess.active) {
    return remoteAccess.asService ? "service" : "remoteAccess";
  }
  return agentHostSharing ? "agentHost" : "none";
}
let TunnelProcessCoordinator = class extends Disposable {
  constructor(tunnelCliFactory, configurationService, environmentService, productService) {
    super();
    this.configurationService = configurationService;
    this.environmentService = environmentService;
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this._onDidOutput = this._register(new Emitter());
    this.onDidOutput = this._onDidOutput.event;
    this._onDidMachineStatus = this._register(new Emitter());
    this.onDidMachineStatus = this._onDidMachineStatus.event;
    this._remoteAccess = { mode: { active: false }, logLevel: LogLevel.Info };
    this._queue = Promise.resolve();
    this._generation = 0;
    /**
     * Survives across generations: a newer request can preempt the reconcile
     * that was going to uninstall the service, and that newer request has no
     * idea an uninstall was owed. Cleared only once an uninstall succeeds.
     */
    this._uninstallServicePending = false;
    this._status = { mode: "none", tunnelName: void 0, tunnelId: void 0, connectionState: "disconnected", serviceInstallFailed: false };
    this._tunnelCli = tunnelCliFactory?.(() => {
    }) ?? new CodeTunnelCli({
      appRoot: environmentService.appRoot,
      isBuilt: environmentService.isBuilt,
      tunnelApplicationName: productService.tunnelApplicationName,
      win32VersionedUpdate: !!productService.win32VersionedUpdate
    });
  }
  getStatus() {
    return this._status;
  }
  /**
   * The name a tunnel would be given right now, from configuration or the
   * hostname. Unlike {@link getStatus}'s `tunnelName` this is defined even
   * when no tunnel process is running, so callers can compare the intended
   * name against a previously used one.
   */
  getIntendedTunnelName() {
    return this._getTunnelName();
  }
  setRemoteAccess(mode, logLevel) {
    const wasService = this._remoteAccess.mode.active && this._remoteAccess.mode.asService;
    this._remoteAccess = { mode, logLevel };
    return this._schedule(wasService && (!mode.active || !mode.asService));
  }
  setAgentHostSharing(request) {
    this._agentHostSharing = request;
    return this._schedule(false);
  }
  restart() {
    return this._schedule(false, true);
  }
  setRemoteAccessStatus(status) {
    if (this._status.mode !== "remoteAccess" && this._status.mode !== "service") {
      return;
    }
    const connectionState = status.type === "connected" ? "connected" : status.type === "connecting" ? "connecting" : "disconnected";
    this._setStatus({ ...this._status, connectionState });
  }
  _schedule(uninstallService, forceRestart = false) {
    this._uninstallServicePending ||= uninstallService;
    if (!forceRestart && !this._uninstallServicePending && this._isTargetSatisfied()) {
      return Promise.resolve();
    }
    const generation = ++this._generation;
    void this._currentProcess?.stop();
    const operation = this._queue.then(() => this._reconcile(generation));
    this._queue = operation.catch(() => {
    });
    return operation;
  }
  /**
   * Whether the running process was launched from exactly the inputs the
   * current intent resolves to. Compares the full launch description, not
   * just mode and name: callers also update the session token, log level and
   * sleep prevention, and each of those has to reach a new process.
   */
  _isTargetSatisfied() {
    const target = this._getTarget();
    if (target.mode === "none") {
      return this._status.mode === "none";
    }
    if (!this._currentProcess || this._status.connectionState === "disconnected") {
      return false;
    }
    const launched = this._launched;
    const wanted = this._describeLaunch(target);
    return !!launched && launched.mode === wanted.mode && launched.tunnelName === wanted.tunnelName && launched.providerId === wanted.providerId && launched.token === wanted.token && launched.logLevel === wanted.logLevel && launched.preventSleep === wanted.preventSleep;
  }
  /** Everything that changes what a launched tunnel process actually does. */
  _describeLaunch(target) {
    return {
      mode: target.mode,
      tunnelName: this._getTunnelName(),
      providerId: target.login?.providerId,
      token: target.login?.token,
      logLevel: target.logLevel,
      preventSleep: this._preventSleep()
    };
  }
  async _reconcile(generation) {
    await this._stopCurrentProcess();
    if (generation !== this._generation) {
      return;
    }
    if (this._uninstallServicePending) {
      const exitCode = await this._runTransient("serviceUninstall", ["tunnel", "service", "uninstall"], "none", generation);
      if (exitCode === 0) {
        this._uninstallServicePending = false;
      }
      if (generation !== this._generation) {
        return;
      }
    }
    const target = this._getTarget();
    const tunnelName = target.mode === "none" ? void 0 : this._getTunnelName();
    if (target.mode === "none") {
      await this._runTransient("kill", ["tunnel", "kill"], "none", generation);
      if (generation === this._generation) {
        this._setStatus({ mode: "none", tunnelName: void 0, tunnelId: void 0, connectionState: "disconnected", serviceInstallFailed: false });
      }
      return;
    }
    this._setStatus({ mode: target.mode, tunnelName, tunnelId: void 0, connectionState: "connecting", serviceInstallFailed: false });
    const isServiceInstalled = target.mode === "service" || target.mode === "remoteAccess" ? await this._isServiceInstalled(generation) : false;
    if (generation !== this._generation) {
      return;
    }
    if (target.mode === "service" && !isServiceInstalled) {
      const serviceInstallFailed = await this._installService(target.logLevel, tunnelName, generation) === false;
      if (generation !== this._generation) {
        return;
      }
      this._setStatus({ ...this._status, serviceInstallFailed });
    }
    if (target.login) {
      const loginExitCode = await this._runTransient(
        "login",
        ["tunnel", "user", "login", "--provider", target.login.providerId, "--log", LogLevelToString(target.logLevel)],
        target.mode,
        generation,
        { VSCODE_CLI_ACCESS_TOKEN: target.login.token }
      );
      if (generation !== this._generation || loginExitCode !== 0) {
        if (generation === this._generation) {
          this._setStatus({ ...this._status, connectionState: "disconnected" });
        }
        return;
      }
    }
    const args = ["tunnel"];
    if (target.mode === "agentHost") {
      args.push("--agent-host-only", "--name", tunnelName, "--user-data-dir", this.environmentService.userDataPath);
      args.push("--delegate-to-editor", "--parent-process-id", String(process.pid));
    } else {
      args.push("--accept-server-license-terms", "--log", LogLevelToString(target.logLevel));
      args.push("--user-data-dir", this.environmentService.userDataPath, "--delegate-to-editor", "--name", tunnelName, "--parent-process-id", String(process.pid));
    }
    if (target.mode !== "agentHost" && this._preventSleep()) {
      args.push("--no-sleep");
    }
    this._launched = this._describeLaunch(target);
    this._startTunnel(args, target.mode, generation);
  }
  /**
   * The credentials the CLI needs for `tunnel user login`. Deliberately not an
   * {@link IRemoteTunnelSession}: agent host sharing has no session, only a
   * token, and fabricating one with empty ids would misrepresent that.
   */
  _getTarget() {
    if (this._remoteAccess.mode.active) {
      const session = this._remoteAccess.mode.session;
      return {
        mode: resolveTunnelProcessMode(!!this._agentHostSharing, this._remoteAccess.mode),
        login: session.token ? { providerId: session.providerId, token: session.token } : void 0,
        logLevel: this._remoteAccess.logLevel
      };
    }
    if (this._agentHostSharing) {
      return {
        mode: resolveTunnelProcessMode(true, this._remoteAccess.mode),
        login: { providerId: this._agentHostSharing.authProvider, token: this._agentHostSharing.token },
        logLevel: this._agentHostSharing.logLevel
      };
    }
    return { mode: "none", login: void 0, logLevel: LogLevel.Info };
  }
  async _isServiceInstalled(generation) {
    let output = "";
    const exitCode = await this._runTransient("status", ["tunnel", "status"], "service", generation, void 0, (message, isError) => {
      if (!isError) {
        output += message;
      }
    });
    if (exitCode !== 0) {
      return false;
    }
    try {
      const status = JSON.parse(output.trim().split("\n").find((line) => line.startsWith("{")));
      return status.service_installed;
    } catch {
      return false;
    }
  }
  async _installService(logLevel, tunnelName, generation) {
    const args = ["tunnel", "service", "install", "--accept-server-license-terms", "--log", LogLevelToString(logLevel), "--user-data-dir", this.environmentService.userDataPath, "--name", tunnelName];
    return await this._runTransient("serviceInstall", args, "service", generation) === 0;
  }
  _startTunnel(args, mode, generation) {
    const tunnelRun = this._tunnelCli.run("tunnel", args, (message, isError) => this._fireOutput(mode, message, isError, true, () => tunnelRun.result.cancel(), generation), { VSCODE_CLI_MACHINE_STATUS: "1" });
    this._currentProcess = tunnelRun;
    const onSettled = () => {
      if (this._currentProcess === tunnelRun) {
        this._currentProcess = void 0;
        this._launched = void 0;
        if (generation === this._generation) {
          this._setStatus({ ...this._status, connectionState: "disconnected" });
        }
      }
    };
    void tunnelRun.result.then(onSettled, onSettled);
  }
  async _runTransient(logLabel, args, mode, generation, env, onOutput) {
    const run = this._tunnelCli.run(logLabel, args, (message, isError) => {
      onOutput?.(message, isError);
      this._fireOutput(mode, message, isError, false, () => run.result.cancel());
    }, env);
    this._currentProcess = run;
    try {
      return await run.result;
    } catch {
      return 1;
    } finally {
      if (this._currentProcess === run) {
        this._currentProcess = void 0;
      }
    }
  }
  async _stopCurrentProcess() {
    const run = this._currentProcess;
    if (!run) {
      return;
    }
    await run.stop();
    if (this._currentProcess === run) {
      this._currentProcess = void 0;
      this._launched = void 0;
    }
  }
  _fireOutput(mode, message, isError, isTunnelProcess, cancel, generation) {
    this._onDidOutput.fire({ mode, message, isError });
    if (!isError && isTunnelProcess && generation === this._generation) {
      const status = parseTunnelMachineStatus(message);
      if (status) {
        if (status.type === "connected" && this._status.mode === mode) {
          this._setStatus({ ...this._status, tunnelId: status.tunnelId, connectionState: "connected" });
        }
        this._onDidMachineStatus.fire({ mode, status, cancel });
      }
    }
  }
  _setStatus(status) {
    if (this._status.mode === status.mode && this._status.tunnelName === status.tunnelName && this._status.tunnelId === status.tunnelId && this._status.connectionState === status.connectionState && this._status.serviceInstallFailed === status.serviceInstallFailed) {
      return;
    }
    this._status = status;
    this._onDidChangeStatus.fire(status);
  }
  _getTunnelName() {
    const configured = this.configurationService.getValue(CONFIGURATION_KEY_HOST_NAME);
    return (configured ? normalizeTunnelName(configured) : tunnelNameFromHostname(hostname())) || "vscode";
  }
  _preventSleep() {
    return !!this.configurationService.getValue(CONFIGURATION_KEY_PREVENT_SLEEP);
  }
  dispose() {
    this._generation++;
    void this._currentProcess?.stop();
    super.dispose();
  }
};
TunnelProcessCoordinator = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, INativeEnvironmentService),
  __decorateParam(3, IProductService)
], TunnelProcessCoordinator);
export {
  ITunnelProcessCoordinator,
  TunnelProcessCoordinator,
  resolveTunnelProcessMode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccmVtb3RlVHVubmVsXFxub2RlXFx0dW5uZWxQcm9jZXNzQ29vcmRpbmF0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgTG9nTGV2ZWwsIExvZ0xldmVsVG9TdHJpbmcgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDT05GSUdVUkFUSU9OX0tFWV9IT1NUX05BTUUsIENPTkZJR1VSQVRJT05fS0VZX1BSRVZFTlRfU0xFRVAsIG5vcm1hbGl6ZVR1bm5lbE5hbWUsIHR1bm5lbE5hbWVGcm9tSG9zdG5hbWUsIFR1bm5lbE1vZGUsIFR1bm5lbFN0YXR1cyB9IGZyb20gJy4uL2NvbW1vbi9yZW1vdGVUdW5uZWwuanMnO1xuaW1wb3J0IHsgcGFyc2VUdW5uZWxNYWNoaW5lU3RhdHVzLCBUdW5uZWxNYWNoaW5lU3RhdHVzIH0gZnJvbSAnLi4vY29tbW9uL3R1bm5lbE1hY2hpbmVTdGF0dXMuanMnO1xuaW1wb3J0IHsgQ29kZVR1bm5lbENsaSwgQ29kZVR1bm5lbENsaU91dHB1dCwgSUNvZGVUdW5uZWxDbGlSdW4gfSBmcm9tICcuL2NvZGVUdW5uZWxDbGlQcm9jZXNzLmpzJztcbmltcG9ydCB7IGhvc3RuYW1lIH0gZnJvbSAnb3MnO1xuXG50eXBlIFR1bm5lbENsaUZhY3RvcnkgPSAob25Mb2c6IChtZXNzYWdlOiBzdHJpbmcpID0+IHZvaWQpID0+IENvZGVUdW5uZWxDbGk7XG5cbi8qKiBUaGUgcHJvY2VzcyBtb2RlIHNlbGVjdGVkIGZyb20gdGhlIGNvbWJpbmVkIHR1bm5lbCBpbnRlbnRzLiAqL1xuZXhwb3J0IHR5cGUgVHVubmVsUHJvY2Vzc01vZGUgPSAnbm9uZScgfCAnYWdlbnRIb3N0JyB8ICdyZW1vdGVBY2Nlc3MnIHwgJ3NlcnZpY2UnO1xuLyoqIFRoZSBjb25uZWN0aW9uIGxpZmVjeWNsZSBzdGF0ZSByZXBvcnRlZCBieSB0aGUgY29vcmRpbmF0b3IuICovXG5leHBvcnQgdHlwZSBUdW5uZWxQcm9jZXNzQ29ubmVjdGlvblN0YXRlID0gJ2Rpc2Nvbm5lY3RlZCcgfCAnY29ubmVjdGluZycgfCAnY29ubmVjdGVkJztcblxuLyoqIFRoZSByZXF1ZXN0ZWQgYWdlbnQtaG9zdC1vbmx5IHNoYXJpbmcgc2Vzc2lvbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFNoYXJpbmdSZXF1ZXN0IHtcblx0cmVhZG9ubHkgdG9rZW46IHN0cmluZztcblx0cmVhZG9ubHkgYXV0aFByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnO1xuXHRyZWFkb25seSBsb2dMZXZlbDogTG9nTGV2ZWw7XG59XG5cbi8qKiBDcmVkZW50aWFscyBwYXNzZWQgdG8gYHR1bm5lbCB1c2VyIGxvZ2luYC4gKi9cbmludGVyZmFjZSBJVHVubmVsTG9naW5DcmVkZW50aWFscyB7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdG9rZW46IHN0cmluZztcbn1cblxuLyoqIFRoZSB0dW5uZWwgdGhlIGN1cnJlbnQgaW50ZW50cyByZXNvbHZlIHRvLiAqL1xuaW50ZXJmYWNlIElUdW5uZWxUYXJnZXQge1xuXHRyZWFkb25seSBtb2RlOiBUdW5uZWxQcm9jZXNzTW9kZTtcblx0cmVhZG9ubHkgbG9naW46IElUdW5uZWxMb2dpbkNyZWRlbnRpYWxzIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBsb2dMZXZlbDogTG9nTGV2ZWw7XG59XG5cbi8qKlxuICogQSBsYXVuY2hlZCBwcm9jZXNzJ3MgaW5wdXRzLCBrZXB0IHNvIGEgbGF0ZXIgaW50ZW50IHVwZGF0ZSBjYW4gdGVsbCB3aGV0aGVyXG4gKiBpdCB3b3VsZCBwcm9kdWNlIHRoZSBzYW1lIHByb2Nlc3Mgb3IgZ2VudWluZWx5IG5lZWRzIGEgbmV3IG9uZS5cbiAqL1xuaW50ZXJmYWNlIElMYXVuY2hEZXNjcmlwdGlvbiB7XG5cdHJlYWRvbmx5IG1vZGU6IFR1bm5lbFByb2Nlc3NNb2RlO1xuXHRyZWFkb25seSB0dW5uZWxOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbG9nTGV2ZWw6IExvZ0xldmVsO1xuXHRyZWFkb25seSBwcmV2ZW50U2xlZXA6IGJvb2xlYW47XG59XG5cbi8qKiBBIGxpbmUgZW1pdHRlZCBieSBhIENMSSBpbnZvY2F0aW9uIG93bmVkIGJ5IHRoZSBjb29yZGluYXRvci4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVR1bm5lbFByb2Nlc3NPdXRwdXQge1xuXHRyZWFkb25seSBtb2RlOiBUdW5uZWxQcm9jZXNzTW9kZTtcblx0cmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nO1xuXHRyZWFkb25seSBpc0Vycm9yOiBib29sZWFuO1xufVxuXG4vKiogQSBtYWNoaW5lLXN0YXR1cyBldmVudCBlbWl0dGVkIGJ5IGEgQ0xJIGludm9jYXRpb24gb3duZWQgYnkgdGhlIGNvb3JkaW5hdG9yLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVHVubmVsUHJvY2Vzc01hY2hpbmVTdGF0dXMge1xuXHRyZWFkb25seSBtb2RlOiBUdW5uZWxQcm9jZXNzTW9kZTtcblx0cmVhZG9ubHkgc3RhdHVzOiBUdW5uZWxNYWNoaW5lU3RhdHVzO1xuXHRjYW5jZWwoKTogdm9pZDtcbn1cblxuLyoqIFRoZSBzaW5nbGUsIHJlc29sdmVkIHR1bm5lbCBzdGF0ZSBzaGFyZWQgYnkgUmVtb3RlIFR1bm5lbCBBY2Nlc3MgYW5kIGFnZW50IGhvc3Qgc2hhcmluZy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVR1bm5lbFByb2Nlc3NTdGF0dXMge1xuXHRyZWFkb25seSBtb2RlOiBUdW5uZWxQcm9jZXNzTW9kZTtcblx0cmVhZG9ubHkgdHVubmVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0dW5uZWxJZD86IHN0cmluZztcblx0cmVhZG9ubHkgY29ubmVjdGlvblN0YXRlOiBUdW5uZWxQcm9jZXNzQ29ubmVjdGlvblN0YXRlO1xuXHRyZWFkb25seSBzZXJ2aWNlSW5zdGFsbEZhaWxlZDogYm9vbGVhbjtcbn1cblxuLyoqIFNlcnZpY2UgaWRlbnRpZmllciBmb3IgdGhlIHNoYXJlZC1wcm9jZXNzIHR1bm5lbCBjb29yZGluYXRvci4gKi9cbmV4cG9ydCBjb25zdCBJVHVubmVsUHJvY2Vzc0Nvb3JkaW5hdG9yID0gY3JlYXRlRGVjb3JhdG9yPElUdW5uZWxQcm9jZXNzQ29vcmRpbmF0b3I+KCd0dW5uZWxQcm9jZXNzQ29vcmRpbmF0b3InKTtcblxuLyoqIENvb3JkaW5hdGVzIHRoZSBvbmUgYGNvZGUgdHVubmVsYCBwcm9jZXNzIHVzZWQgYnkgYm90aCBzaGFyZWQtcHJvY2VzcyB0dW5uZWwgY29uc3VtZXJzLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVHVubmVsUHJvY2Vzc0Nvb3JkaW5hdG9yIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVN0YXR1czogRXZlbnQ8SVR1bm5lbFByb2Nlc3NTdGF0dXM+O1xuXHRyZWFkb25seSBvbkRpZE91dHB1dDogRXZlbnQ8SVR1bm5lbFByb2Nlc3NPdXRwdXQ+O1xuXHRyZWFkb25seSBvbkRpZE1hY2hpbmVTdGF0dXM6IEV2ZW50PElUdW5uZWxQcm9jZXNzTWFjaGluZVN0YXR1cz47XG5cdGdldFN0YXR1cygpOiBJVHVubmVsUHJvY2Vzc1N0YXR1cztcblx0Z2V0SW50ZW5kZWRUdW5uZWxOYW1lKCk6IHN0cmluZztcblx0c2V0UmVtb3RlQWNjZXNzKG1vZGU6IFR1bm5lbE1vZGUsIGxvZ0xldmVsOiBMb2dMZXZlbCk6IFByb21pc2U8dm9pZD47XG5cdHNldEFnZW50SG9zdFNoYXJpbmcocmVxdWVzdDogSUFnZW50SG9zdFNoYXJpbmdSZXF1ZXN0IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPjtcblx0cmVzdGFydCgpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXRSZW1vdGVBY2Nlc3NTdGF0dXMoc3RhdHVzOiBUdW5uZWxTdGF0dXMpOiB2b2lkO1xufVxuXG4vKiogUmVzb2x2ZXMgdGhlIHByb2Nlc3MgbW9kZSBmcm9tIHRoZSB0d28gaW5kZXBlbmRlbnQgdHVubmVsIGludGVudHMuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVR1bm5lbFByb2Nlc3NNb2RlKGFnZW50SG9zdFNoYXJpbmc6IGJvb2xlYW4sIHJlbW90ZUFjY2VzczogVHVubmVsTW9kZSk6IFR1bm5lbFByb2Nlc3NNb2RlIHtcblx0aWYgKHJlbW90ZUFjY2Vzcy5hY3RpdmUpIHtcblx0XHRyZXR1cm4gcmVtb3RlQWNjZXNzLmFzU2VydmljZSA/ICdzZXJ2aWNlJyA6ICdyZW1vdGVBY2Nlc3MnO1xuXHR9XG5cdHJldHVybiBhZ2VudEhvc3RTaGFyaW5nID8gJ2FnZW50SG9zdCcgOiAnbm9uZSc7XG59XG5cbi8qKlxuICogT3ducyB0aGUgb25seSB0dW5uZWwgcHJvY2VzcyBpbiB0aGUgc2hhcmVkIHByb2Nlc3MuXG4gKlxuICogVGhlIHNlcmlhbCBxdWV1ZSBhbHdheXMgd2FpdHMgZm9yIHRoZSBwcmV2aW91cyBjaGlsZCBwcm9jZXNzIHRvIGV4aXQgYmVmb3JlXG4gKiBzcGF3bmluZyBpdHMgcmVwbGFjZW1lbnQuIFRoaXMgbWFrZXMgYSBtb2RlIHRyYW5zaXRpb24gcmVsZWFzZSBgLS1uYW1lYFxuICogYmVmb3JlIGFub3RoZXIgbW9kZSBjYW4gY2xhaW0gaXQuXG4gKi9cbmV4cG9ydCBjbGFzcyBUdW5uZWxQcm9jZXNzQ29vcmRpbmF0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVR1bm5lbFByb2Nlc3NDb29yZGluYXRvciB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVHVubmVsUHJvY2Vzc1N0YXR1cz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdHVzID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRPdXRwdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVHVubmVsUHJvY2Vzc091dHB1dD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkT3V0cHV0ID0gdGhpcy5fb25EaWRPdXRwdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNYWNoaW5lU3RhdHVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVR1bm5lbFByb2Nlc3NNYWNoaW5lU3RhdHVzPigpKTtcblx0cmVhZG9ubHkgb25EaWRNYWNoaW5lU3RhdHVzID0gdGhpcy5fb25EaWRNYWNoaW5lU3RhdHVzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3R1bm5lbENsaTogQ29kZVR1bm5lbENsaTtcblx0cHJpdmF0ZSBfcmVtb3RlQWNjZXNzOiB7IG1vZGU6IFR1bm5lbE1vZGU7IGxvZ0xldmVsOiBMb2dMZXZlbCB9ID0geyBtb2RlOiB7IGFjdGl2ZTogZmFsc2UgfSwgbG9nTGV2ZWw6IExvZ0xldmVsLkluZm8gfTtcblx0cHJpdmF0ZSBfYWdlbnRIb3N0U2hhcmluZzogSUFnZW50SG9zdFNoYXJpbmdSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50UHJvY2VzczogSUNvZGVUdW5uZWxDbGlSdW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3F1ZXVlOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdHByaXZhdGUgX2dlbmVyYXRpb24gPSAwO1xuXHQvKipcblx0ICogU3Vydml2ZXMgYWNyb3NzIGdlbmVyYXRpb25zOiBhIG5ld2VyIHJlcXVlc3QgY2FuIHByZWVtcHQgdGhlIHJlY29uY2lsZVxuXHQgKiB0aGF0IHdhcyBnb2luZyB0byB1bmluc3RhbGwgdGhlIHNlcnZpY2UsIGFuZCB0aGF0IG5ld2VyIHJlcXVlc3QgaGFzIG5vXG5cdCAqIGlkZWEgYW4gdW5pbnN0YWxsIHdhcyBvd2VkLiBDbGVhcmVkIG9ubHkgb25jZSBhbiB1bmluc3RhbGwgc3VjY2VlZHMuXG5cdCAqL1xuXHRwcml2YXRlIF91bmluc3RhbGxTZXJ2aWNlUGVuZGluZyA9IGZhbHNlO1xuXHQvKiogSW5wdXRzIG9mIHRoZSBjdXJyZW50bHkgcnVubmluZyBwcm9jZXNzLCBvciB1bmRlZmluZWQgd2hlbiBub25lIHJ1bnMuICovXG5cdHByaXZhdGUgX2xhdW5jaGVkOiBJTGF1bmNoRGVzY3JpcHRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N0YXR1czogSVR1bm5lbFByb2Nlc3NTdGF0dXMgPSB7IG1vZGU6ICdub25lJywgdHVubmVsTmFtZTogdW5kZWZpbmVkLCB0dW5uZWxJZDogdW5kZWZpbmVkLCBjb25uZWN0aW9uU3RhdGU6ICdkaXNjb25uZWN0ZWQnLCBzZXJ2aWNlSW5zdGFsbEZhaWxlZDogZmFsc2UgfTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0dW5uZWxDbGlGYWN0b3J5OiBUdW5uZWxDbGlGYWN0b3J5IHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl90dW5uZWxDbGkgPSB0dW5uZWxDbGlGYWN0b3J5Py4oKCkgPT4geyB9KSA/PyBuZXcgQ29kZVR1bm5lbENsaSh7XG5cdFx0XHRhcHBSb290OiBlbnZpcm9ubWVudFNlcnZpY2UuYXBwUm9vdCxcblx0XHRcdGlzQnVpbHQ6IGVudmlyb25tZW50U2VydmljZS5pc0J1aWx0LFxuXHRcdFx0dHVubmVsQXBwbGljYXRpb25OYW1lOiBwcm9kdWN0U2VydmljZS50dW5uZWxBcHBsaWNhdGlvbk5hbWUsXG5cdFx0XHR3aW4zMlZlcnNpb25lZFVwZGF0ZTogISFwcm9kdWN0U2VydmljZS53aW4zMlZlcnNpb25lZFVwZGF0ZSxcblx0XHR9KTtcblx0fVxuXG5cdGdldFN0YXR1cygpOiBJVHVubmVsUHJvY2Vzc1N0YXR1cyB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXR1cztcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbmFtZSBhIHR1bm5lbCB3b3VsZCBiZSBnaXZlbiByaWdodCBub3csIGZyb20gY29uZmlndXJhdGlvbiBvciB0aGVcblx0ICogaG9zdG5hbWUuIFVubGlrZSB7QGxpbmsgZ2V0U3RhdHVzfSdzIGB0dW5uZWxOYW1lYCB0aGlzIGlzIGRlZmluZWQgZXZlblxuXHQgKiB3aGVuIG5vIHR1bm5lbCBwcm9jZXNzIGlzIHJ1bm5pbmcsIHNvIGNhbGxlcnMgY2FuIGNvbXBhcmUgdGhlIGludGVuZGVkXG5cdCAqIG5hbWUgYWdhaW5zdCBhIHByZXZpb3VzbHkgdXNlZCBvbmUuXG5cdCAqL1xuXHRnZXRJbnRlbmRlZFR1bm5lbE5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0VHVubmVsTmFtZSgpO1xuXHR9XG5cblx0c2V0UmVtb3RlQWNjZXNzKG1vZGU6IFR1bm5lbE1vZGUsIGxvZ0xldmVsOiBMb2dMZXZlbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdhc1NlcnZpY2UgPSB0aGlzLl9yZW1vdGVBY2Nlc3MubW9kZS5hY3RpdmUgJiYgdGhpcy5fcmVtb3RlQWNjZXNzLm1vZGUuYXNTZXJ2aWNlO1xuXHRcdHRoaXMuX3JlbW90ZUFjY2VzcyA9IHsgbW9kZSwgbG9nTGV2ZWwgfTtcblx0XHRyZXR1cm4gdGhpcy5fc2NoZWR1bGUod2FzU2VydmljZSAmJiAoIW1vZGUuYWN0aXZlIHx8ICFtb2RlLmFzU2VydmljZSkpO1xuXHR9XG5cblx0c2V0QWdlbnRIb3N0U2hhcmluZyhyZXF1ZXN0OiBJQWdlbnRIb3N0U2hhcmluZ1JlcXVlc3QgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9hZ2VudEhvc3RTaGFyaW5nID0gcmVxdWVzdDtcblx0XHRyZXR1cm4gdGhpcy5fc2NoZWR1bGUoZmFsc2UpO1xuXHR9XG5cblx0cmVzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2NoZWR1bGUoZmFsc2UsIHRydWUpO1xuXHR9XG5cblx0c2V0UmVtb3RlQWNjZXNzU3RhdHVzKHN0YXR1czogVHVubmVsU3RhdHVzKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXR1cy5tb2RlICE9PSAncmVtb3RlQWNjZXNzJyAmJiB0aGlzLl9zdGF0dXMubW9kZSAhPT0gJ3NlcnZpY2UnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm5lY3Rpb25TdGF0ZSA9IHN0YXR1cy50eXBlID09PSAnY29ubmVjdGVkJyA/ICdjb25uZWN0ZWQnIDogc3RhdHVzLnR5cGUgPT09ICdjb25uZWN0aW5nJyA/ICdjb25uZWN0aW5nJyA6ICdkaXNjb25uZWN0ZWQnO1xuXHRcdHRoaXMuX3NldFN0YXR1cyh7IC4uLnRoaXMuX3N0YXR1cywgY29ubmVjdGlvblN0YXRlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGUodW5pbnN0YWxsU2VydmljZTogYm9vbGVhbiwgZm9yY2VSZXN0YXJ0ID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl91bmluc3RhbGxTZXJ2aWNlUGVuZGluZyB8fD0gdW5pbnN0YWxsU2VydmljZTtcblxuXHRcdC8vIENoZWNrZWQgYmVmb3JlIHN0b3BwaW5nIGFueXRoaW5nOiBgX3JlY29uY2lsZWAgY2FuIG9ubHkgb2JzZXJ2ZSBhXG5cdFx0Ly8gcHJvY2VzcyB0aGlzIG1ldGhvZCBhbHJlYWR5IHN0b3BwZWQsIHNvIGEgbm8tb3AgdXBkYXRlIHdvdWxkXG5cdFx0Ly8gb3RoZXJ3aXNlIHRlYXIgZG93biBhIHBlcmZlY3RseSBoZWFsdGh5IHR1bm5lbC5cblx0XHRpZiAoIWZvcmNlUmVzdGFydCAmJiAhdGhpcy5fdW5pbnN0YWxsU2VydmljZVBlbmRpbmcgJiYgdGhpcy5faXNUYXJnZXRTYXRpc2ZpZWQoKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSArK3RoaXMuX2dlbmVyYXRpb247XG5cdFx0dm9pZCB0aGlzLl9jdXJyZW50UHJvY2Vzcz8uc3RvcCgpO1xuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IHRoaXMuX3F1ZXVlLnRoZW4oKCkgPT4gdGhpcy5fcmVjb25jaWxlKGdlbmVyYXRpb24pKTtcblx0XHR0aGlzLl9xdWV1ZSA9IG9wZXJhdGlvbi5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdHJldHVybiBvcGVyYXRpb247XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgcnVubmluZyBwcm9jZXNzIHdhcyBsYXVuY2hlZCBmcm9tIGV4YWN0bHkgdGhlIGlucHV0cyB0aGVcblx0ICogY3VycmVudCBpbnRlbnQgcmVzb2x2ZXMgdG8uIENvbXBhcmVzIHRoZSBmdWxsIGxhdW5jaCBkZXNjcmlwdGlvbiwgbm90XG5cdCAqIGp1c3QgbW9kZSBhbmQgbmFtZTogY2FsbGVycyBhbHNvIHVwZGF0ZSB0aGUgc2Vzc2lvbiB0b2tlbiwgbG9nIGxldmVsIGFuZFxuXHQgKiBzbGVlcCBwcmV2ZW50aW9uLCBhbmQgZWFjaCBvZiB0aG9zZSBoYXMgdG8gcmVhY2ggYSBuZXcgcHJvY2Vzcy5cblx0ICovXG5cdHByaXZhdGUgX2lzVGFyZ2V0U2F0aXNmaWVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2dldFRhcmdldCgpO1xuXHRcdGlmICh0YXJnZXQubW9kZSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc3RhdHVzLm1vZGUgPT09ICdub25lJztcblx0XHR9XG5cdFx0Ly8gQSBydW4gdGhhdCBhbHJlYWR5IHJlcG9ydGVkIGZhaWx1cmUgY2Fubm90IHNhdGlzZnkgYW55dGhpbmc6IGEgdG9rZW5cblx0XHQvLyBlcnJvciBjYW5jZWxzIHRoZSBjaGlsZCBhbmQgbWFya3MgdXMgZGlzY29ubmVjdGVkIGJlZm9yZSBpdCBleGl0cywgc29cblx0XHQvLyB0cmVhdGluZyBpdCBhcyBoZWFsdGh5IHdvdWxkIHNraXAgdGhlIHJlY29uY2lsZSBhbmQgbGVhdmUgbm90aGluZ1xuXHRcdC8vIHJ1bm5pbmcgb25jZSB0aGUgY2FuY2VsbGVkIGNoaWxkIGZpbmFsbHkgZ29lcyBhd2F5LlxuXHRcdGlmICghdGhpcy5fY3VycmVudFByb2Nlc3MgfHwgdGhpcy5fc3RhdHVzLmNvbm5lY3Rpb25TdGF0ZSA9PT0gJ2Rpc2Nvbm5lY3RlZCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbGF1bmNoZWQgPSB0aGlzLl9sYXVuY2hlZDtcblx0XHRjb25zdCB3YW50ZWQgPSB0aGlzLl9kZXNjcmliZUxhdW5jaCh0YXJnZXQpO1xuXHRcdHJldHVybiAhIWxhdW5jaGVkXG5cdFx0XHQmJiBsYXVuY2hlZC5tb2RlID09PSB3YW50ZWQubW9kZVxuXHRcdFx0JiYgbGF1bmNoZWQudHVubmVsTmFtZSA9PT0gd2FudGVkLnR1bm5lbE5hbWVcblx0XHRcdCYmIGxhdW5jaGVkLnByb3ZpZGVySWQgPT09IHdhbnRlZC5wcm92aWRlcklkXG5cdFx0XHQmJiBsYXVuY2hlZC50b2tlbiA9PT0gd2FudGVkLnRva2VuXG5cdFx0XHQmJiBsYXVuY2hlZC5sb2dMZXZlbCA9PT0gd2FudGVkLmxvZ0xldmVsXG5cdFx0XHQmJiBsYXVuY2hlZC5wcmV2ZW50U2xlZXAgPT09IHdhbnRlZC5wcmV2ZW50U2xlZXA7XG5cdH1cblxuXHQvKiogRXZlcnl0aGluZyB0aGF0IGNoYW5nZXMgd2hhdCBhIGxhdW5jaGVkIHR1bm5lbCBwcm9jZXNzIGFjdHVhbGx5IGRvZXMuICovXG5cdHByaXZhdGUgX2Rlc2NyaWJlTGF1bmNoKHRhcmdldDogSVR1bm5lbFRhcmdldCk6IElMYXVuY2hEZXNjcmlwdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1vZGU6IHRhcmdldC5tb2RlLFxuXHRcdFx0dHVubmVsTmFtZTogdGhpcy5fZ2V0VHVubmVsTmFtZSgpLFxuXHRcdFx0cHJvdmlkZXJJZDogdGFyZ2V0LmxvZ2luPy5wcm92aWRlcklkLFxuXHRcdFx0dG9rZW46IHRhcmdldC5sb2dpbj8udG9rZW4sXG5cdFx0XHRsb2dMZXZlbDogdGFyZ2V0LmxvZ0xldmVsLFxuXHRcdFx0cHJldmVudFNsZWVwOiB0aGlzLl9wcmV2ZW50U2xlZXAoKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25jaWxlKGdlbmVyYXRpb246IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3N0b3BDdXJyZW50UHJvY2VzcygpO1xuXHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3VuaW5zdGFsbFNlcnZpY2VQZW5kaW5nKSB7XG5cdFx0XHRjb25zdCBleGl0Q29kZSA9IGF3YWl0IHRoaXMuX3J1blRyYW5zaWVudCgnc2VydmljZVVuaW5zdGFsbCcsIFsndHVubmVsJywgJ3NlcnZpY2UnLCAndW5pbnN0YWxsJ10sICdub25lJywgZ2VuZXJhdGlvbik7XG5cdFx0XHRpZiAoZXhpdENvZGUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fdW5pbnN0YWxsU2VydmljZVBlbmRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9nZXRUYXJnZXQoKTtcblx0XHRjb25zdCB0dW5uZWxOYW1lID0gdGFyZ2V0Lm1vZGUgPT09ICdub25lJyA/IHVuZGVmaW5lZCA6IHRoaXMuX2dldFR1bm5lbE5hbWUoKTtcblxuXHRcdGlmICh0YXJnZXQubW9kZSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9ydW5UcmFuc2llbnQoJ2tpbGwnLCBbJ3R1bm5lbCcsICdraWxsJ10sICdub25lJywgZ2VuZXJhdGlvbik7XG5cdFx0XHRpZiAoZ2VuZXJhdGlvbiA9PT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9zZXRTdGF0dXMoeyBtb2RlOiAnbm9uZScsIHR1bm5lbE5hbWU6IHVuZGVmaW5lZCwgdHVubmVsSWQ6IHVuZGVmaW5lZCwgY29ubmVjdGlvblN0YXRlOiAnZGlzY29ubmVjdGVkJywgc2VydmljZUluc3RhbGxGYWlsZWQ6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NldFN0YXR1cyh7IG1vZGU6IHRhcmdldC5tb2RlLCB0dW5uZWxOYW1lLCB0dW5uZWxJZDogdW5kZWZpbmVkLCBjb25uZWN0aW9uU3RhdGU6ICdjb25uZWN0aW5nJywgc2VydmljZUluc3RhbGxGYWlsZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGlzU2VydmljZUluc3RhbGxlZCA9IHRhcmdldC5tb2RlID09PSAnc2VydmljZScgfHwgdGFyZ2V0Lm1vZGUgPT09ICdyZW1vdGVBY2Nlc3MnXG5cdFx0XHQ/IGF3YWl0IHRoaXMuX2lzU2VydmljZUluc3RhbGxlZChnZW5lcmF0aW9uKVxuXHRcdFx0OiBmYWxzZTtcblx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0Lm1vZGUgPT09ICdzZXJ2aWNlJyAmJiAhaXNTZXJ2aWNlSW5zdGFsbGVkKSB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlSW5zdGFsbEZhaWxlZCA9IGF3YWl0IHRoaXMuX2luc3RhbGxTZXJ2aWNlKHRhcmdldC5sb2dMZXZlbCwgdHVubmVsTmFtZSEsIGdlbmVyYXRpb24pID09PSBmYWxzZTtcblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIEEgZmFpbGVkIGluc3RhbGwgaXMgbm90IGZhdGFsOiB0aGUgc2Vzc2lvbiB0dW5uZWwgYmVsb3cgc3RpbGxcblx0XHRcdC8vIHJ1bnMsIG1hdGNoaW5nIHRoZSBwcmUtQ0xJIGJlaGF2aW91ciBvZiBmYWxsaW5nIGJhY2sgdG8gaG9zdGluZ1xuXHRcdFx0Ly8gaW4tc2Vzc2lvbiBhbmQgcmVwb3J0aW5nIHRoZSBmYWlsdXJlIGFsb25nc2lkZSBpdC5cblx0XHRcdHRoaXMuX3NldFN0YXR1cyh7IC4uLnRoaXMuX3N0YXR1cywgc2VydmljZUluc3RhbGxGYWlsZWQgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldC5sb2dpbikge1xuXHRcdFx0Y29uc3QgbG9naW5FeGl0Q29kZSA9IGF3YWl0IHRoaXMuX3J1blRyYW5zaWVudChcblx0XHRcdFx0J2xvZ2luJyxcblx0XHRcdFx0Wyd0dW5uZWwnLCAndXNlcicsICdsb2dpbicsICctLXByb3ZpZGVyJywgdGFyZ2V0LmxvZ2luLnByb3ZpZGVySWQsICctLWxvZycsIExvZ0xldmVsVG9TdHJpbmcodGFyZ2V0LmxvZ0xldmVsKV0sXG5cdFx0XHRcdHRhcmdldC5tb2RlLFxuXHRcdFx0XHRnZW5lcmF0aW9uLFxuXHRcdFx0XHR7IFZTQ09ERV9DTElfQUNDRVNTX1RPS0VOOiB0YXJnZXQubG9naW4udG9rZW4gfSxcblx0XHRcdCk7XG5cdFx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5fZ2VuZXJhdGlvbiB8fCBsb2dpbkV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRcdGlmIChnZW5lcmF0aW9uID09PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0U3RhdHVzKHsgLi4udGhpcy5fc3RhdHVzLCBjb25uZWN0aW9uU3RhdGU6ICdkaXNjb25uZWN0ZWQnIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhcmdzID0gWyd0dW5uZWwnXTtcblx0XHRpZiAodGFyZ2V0Lm1vZGUgPT09ICdhZ2VudEhvc3QnKSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tYWdlbnQtaG9zdC1vbmx5JywgJy0tbmFtZScsIHR1bm5lbE5hbWUhLCAnLS11c2VyLWRhdGEtZGlyJywgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFQYXRoKTtcblx0XHRcdGFyZ3MucHVzaCgnLS1kZWxlZ2F0ZS10by1lZGl0b3InLCAnLS1wYXJlbnQtcHJvY2Vzcy1pZCcsIFN0cmluZyhwcm9jZXNzLnBpZCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tYWNjZXB0LXNlcnZlci1saWNlbnNlLXRlcm1zJywgJy0tbG9nJywgTG9nTGV2ZWxUb1N0cmluZyh0YXJnZXQubG9nTGV2ZWwpKTtcblx0XHRcdGFyZ3MucHVzaCgnLS11c2VyLWRhdGEtZGlyJywgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFQYXRoLCAnLS1kZWxlZ2F0ZS10by1lZGl0b3InLCAnLS1uYW1lJywgdHVubmVsTmFtZSEsICctLXBhcmVudC1wcm9jZXNzLWlkJywgU3RyaW5nKHByb2Nlc3MucGlkKSk7XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQubW9kZSAhPT0gJ2FnZW50SG9zdCcgJiYgdGhpcy5fcHJldmVudFNsZWVwKCkpIHtcblx0XHRcdGFyZ3MucHVzaCgnLS1uby1zbGVlcCcpO1xuXHRcdH1cblx0XHR0aGlzLl9sYXVuY2hlZCA9IHRoaXMuX2Rlc2NyaWJlTGF1bmNoKHRhcmdldCk7XG5cdFx0dGhpcy5fc3RhcnRUdW5uZWwoYXJncywgdGFyZ2V0Lm1vZGUsIGdlbmVyYXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBjcmVkZW50aWFscyB0aGUgQ0xJIG5lZWRzIGZvciBgdHVubmVsIHVzZXIgbG9naW5gLiBEZWxpYmVyYXRlbHkgbm90IGFuXG5cdCAqIHtAbGluayBJUmVtb3RlVHVubmVsU2Vzc2lvbn06IGFnZW50IGhvc3Qgc2hhcmluZyBoYXMgbm8gc2Vzc2lvbiwgb25seSBhXG5cdCAqIHRva2VuLCBhbmQgZmFicmljYXRpbmcgb25lIHdpdGggZW1wdHkgaWRzIHdvdWxkIG1pc3JlcHJlc2VudCB0aGF0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0VGFyZ2V0KCk6IElUdW5uZWxUYXJnZXQge1xuXHRcdGlmICh0aGlzLl9yZW1vdGVBY2Nlc3MubW9kZS5hY3RpdmUpIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9yZW1vdGVBY2Nlc3MubW9kZS5zZXNzaW9uO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bW9kZTogcmVzb2x2ZVR1bm5lbFByb2Nlc3NNb2RlKCEhdGhpcy5fYWdlbnRIb3N0U2hhcmluZywgdGhpcy5fcmVtb3RlQWNjZXNzLm1vZGUpLFxuXHRcdFx0XHRsb2dpbjogc2Vzc2lvbi50b2tlbiA/IHsgcHJvdmlkZXJJZDogc2Vzc2lvbi5wcm92aWRlcklkLCB0b2tlbjogc2Vzc2lvbi50b2tlbiB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsb2dMZXZlbDogdGhpcy5fcmVtb3RlQWNjZXNzLmxvZ0xldmVsLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FnZW50SG9zdFNoYXJpbmcpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1vZGU6IHJlc29sdmVUdW5uZWxQcm9jZXNzTW9kZSh0cnVlLCB0aGlzLl9yZW1vdGVBY2Nlc3MubW9kZSksXG5cdFx0XHRcdGxvZ2luOiB7IHByb3ZpZGVySWQ6IHRoaXMuX2FnZW50SG9zdFNoYXJpbmcuYXV0aFByb3ZpZGVyLCB0b2tlbjogdGhpcy5fYWdlbnRIb3N0U2hhcmluZy50b2tlbiB9LFxuXHRcdFx0XHRsb2dMZXZlbDogdGhpcy5fYWdlbnRIb3N0U2hhcmluZy5sb2dMZXZlbCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7IG1vZGU6ICdub25lJywgbG9naW46IHVuZGVmaW5lZCwgbG9nTGV2ZWw6IExvZ0xldmVsLkluZm8gfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2lzU2VydmljZUluc3RhbGxlZChnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgb3V0cHV0ID0gJyc7XG5cdFx0Y29uc3QgZXhpdENvZGUgPSBhd2FpdCB0aGlzLl9ydW5UcmFuc2llbnQoJ3N0YXR1cycsIFsndHVubmVsJywgJ3N0YXR1cyddLCAnc2VydmljZScsIGdlbmVyYXRpb24sIHVuZGVmaW5lZCwgKG1lc3NhZ2UsIGlzRXJyb3IpID0+IHtcblx0XHRcdGlmICghaXNFcnJvcikge1xuXHRcdFx0XHRvdXRwdXQgKz0gbWVzc2FnZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAoZXhpdENvZGUgIT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IEpTT04ucGFyc2Uob3V0cHV0LnRyaW0oKS5zcGxpdCgnXFxuJykuZmluZChsaW5lID0+IGxpbmUuc3RhcnRzV2l0aCgneycpKSEpIGFzIHsgc2VydmljZV9pbnN0YWxsZWQ6IGJvb2xlYW4gfTtcblx0XHRcdHJldHVybiBzdGF0dXMuc2VydmljZV9pbnN0YWxsZWQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW5zdGFsbFNlcnZpY2UobG9nTGV2ZWw6IExvZ0xldmVsLCB0dW5uZWxOYW1lOiBzdHJpbmcsIGdlbmVyYXRpb246IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBbJ3R1bm5lbCcsICdzZXJ2aWNlJywgJ2luc3RhbGwnLCAnLS1hY2NlcHQtc2VydmVyLWxpY2Vuc2UtdGVybXMnLCAnLS1sb2cnLCBMb2dMZXZlbFRvU3RyaW5nKGxvZ0xldmVsKSwgJy0tdXNlci1kYXRhLWRpcicsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCwgJy0tbmFtZScsIHR1bm5lbE5hbWVdO1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fcnVuVHJhbnNpZW50KCdzZXJ2aWNlSW5zdGFsbCcsIGFyZ3MsICdzZXJ2aWNlJywgZ2VuZXJhdGlvbikpID09PSAwO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRUdW5uZWwoYXJnczogcmVhZG9ubHkgc3RyaW5nW10sIG1vZGU6IFR1bm5lbFByb2Nlc3NNb2RlLCBnZW5lcmF0aW9uOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0dW5uZWxSdW4gPSB0aGlzLl90dW5uZWxDbGkucnVuKCd0dW5uZWwnLCBhcmdzLCAobWVzc2FnZSwgaXNFcnJvcikgPT4gdGhpcy5fZmlyZU91dHB1dChtb2RlLCBtZXNzYWdlLCBpc0Vycm9yLCB0cnVlLCAoKSA9PiB0dW5uZWxSdW4ucmVzdWx0LmNhbmNlbCgpLCBnZW5lcmF0aW9uKSwgeyBWU0NPREVfQ0xJX01BQ0hJTkVfU1RBVFVTOiAnMScgfSk7XG5cdFx0dGhpcy5fY3VycmVudFByb2Nlc3MgPSB0dW5uZWxSdW47XG5cdFx0Y29uc3Qgb25TZXR0bGVkID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm9jZXNzID09PSB0dW5uZWxSdW4pIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudFByb2Nlc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2xhdW5jaGVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoZ2VuZXJhdGlvbiA9PT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuX3NldFN0YXR1cyh7IC4uLnRoaXMuX3N0YXR1cywgY29ubmVjdGlvblN0YXRlOiAnZGlzY29ubmVjdGVkJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dm9pZCB0dW5uZWxSdW4ucmVzdWx0LnRoZW4ob25TZXR0bGVkLCBvblNldHRsZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuVHJhbnNpZW50KGxvZ0xhYmVsOiBzdHJpbmcsIGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdLCBtb2RlOiBUdW5uZWxQcm9jZXNzTW9kZSwgZ2VuZXJhdGlvbjogbnVtYmVyLCBlbnY/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCBvbk91dHB1dD86IENvZGVUdW5uZWxDbGlPdXRwdXQpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IHJ1biA9IHRoaXMuX3R1bm5lbENsaS5ydW4obG9nTGFiZWwsIGFyZ3MsIChtZXNzYWdlLCBpc0Vycm9yKSA9PiB7XG5cdFx0XHRvbk91dHB1dD8uKG1lc3NhZ2UsIGlzRXJyb3IpO1xuXHRcdFx0dGhpcy5fZmlyZU91dHB1dChtb2RlLCBtZXNzYWdlLCBpc0Vycm9yLCBmYWxzZSwgKCkgPT4gcnVuLnJlc3VsdC5jYW5jZWwoKSk7XG5cdFx0fSwgZW52KTtcblx0XHR0aGlzLl9jdXJyZW50UHJvY2VzcyA9IHJ1bjtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHJ1bi5yZXN1bHQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm9jZXNzID09PSBydW4pIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudFByb2Nlc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RvcEN1cnJlbnRQcm9jZXNzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJ1biA9IHRoaXMuX2N1cnJlbnRQcm9jZXNzO1xuXHRcdGlmICghcnVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHJ1bi5zdG9wKCk7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm9jZXNzID09PSBydW4pIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRQcm9jZXNzID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fbGF1bmNoZWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZU91dHB1dChtb2RlOiBUdW5uZWxQcm9jZXNzTW9kZSwgbWVzc2FnZTogc3RyaW5nLCBpc0Vycm9yOiBib29sZWFuLCBpc1R1bm5lbFByb2Nlc3M6IGJvb2xlYW4sIGNhbmNlbDogKCkgPT4gdm9pZCwgZ2VuZXJhdGlvbj86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkT3V0cHV0LmZpcmUoeyBtb2RlLCBtZXNzYWdlLCBpc0Vycm9yIH0pO1xuXHRcdGlmICghaXNFcnJvciAmJiBpc1R1bm5lbFByb2Nlc3MgJiYgZ2VuZXJhdGlvbiA9PT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gcGFyc2VUdW5uZWxNYWNoaW5lU3RhdHVzKG1lc3NhZ2UpO1xuXHRcdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0XHRpZiAoc3RhdHVzLnR5cGUgPT09ICdjb25uZWN0ZWQnICYmIHRoaXMuX3N0YXR1cy5tb2RlID09PSBtb2RlKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0U3RhdHVzKHsgLi4udGhpcy5fc3RhdHVzLCB0dW5uZWxJZDogc3RhdHVzLnR1bm5lbElkLCBjb25uZWN0aW9uU3RhdGU6ICdjb25uZWN0ZWQnIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29uRGlkTWFjaGluZVN0YXR1cy5maXJlKHsgbW9kZSwgc3RhdHVzLCBjYW5jZWwgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U3RhdHVzKHN0YXR1czogSVR1bm5lbFByb2Nlc3NTdGF0dXMpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdHVzLm1vZGUgPT09IHN0YXR1cy5tb2RlXG5cdFx0XHQmJiB0aGlzLl9zdGF0dXMudHVubmVsTmFtZSA9PT0gc3RhdHVzLnR1bm5lbE5hbWVcblx0XHRcdCYmIHRoaXMuX3N0YXR1cy50dW5uZWxJZCA9PT0gc3RhdHVzLnR1bm5lbElkXG5cdFx0XHQmJiB0aGlzLl9zdGF0dXMuY29ubmVjdGlvblN0YXRlID09PSBzdGF0dXMuY29ubmVjdGlvblN0YXRlXG5cdFx0XHQmJiB0aGlzLl9zdGF0dXMuc2VydmljZUluc3RhbGxGYWlsZWQgPT09IHN0YXR1cy5zZXJ2aWNlSW5zdGFsbEZhaWxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0dXMgPSBzdGF0dXM7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZmlyZShzdGF0dXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VHVubmVsTmFtZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oQ09ORklHVVJBVElPTl9LRVlfSE9TVF9OQU1FKTtcblx0XHRyZXR1cm4gKGNvbmZpZ3VyZWQgPyBub3JtYWxpemVUdW5uZWxOYW1lKGNvbmZpZ3VyZWQpIDogdHVubmVsTmFtZUZyb21Ib3N0bmFtZShob3N0bmFtZSgpKSkgfHwgJ3ZzY29kZSc7XG5cdH1cblxuXHRwcml2YXRlIF9wcmV2ZW50U2xlZXAoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDT05GSUdVUkFUSU9OX0tFWV9QUkVWRU5UX1NMRUVQKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZ2VuZXJhdGlvbisrO1xuXHRcdHZvaWQgdGhpcy5fY3VycmVudFByb2Nlc3M/LnN0b3AoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLFVBQVUsd0JBQXdC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
