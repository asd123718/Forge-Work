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
import { Promises } from "../../../base/common/async.js";
import { canceled } from "../../../base/common/errors.js";
import { Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { extensionHostGraceTimeMs } from "../common/extensionHostStarter.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { WindowUtilityProcess } from "../../utilityProcess/electron-main/utilityProcess.js";
import { IWindowsMainService } from "../../windows/electron-main/windows.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
let ExtensionHostStarter = class extends Disposable {
  constructor(_logService, _lifecycleMainService, _windowsMainService, _telemetryService, _configurationService) {
    super();
    this._logService = _logService;
    this._lifecycleMainService = _lifecycleMainService;
    this._windowsMainService = _windowsMainService;
    this._telemetryService = _telemetryService;
    this._configurationService = _configurationService;
    this._extHosts = /* @__PURE__ */ new Map();
    this._shutdown = false;
    this._register(this._lifecycleMainService.onWillShutdown((e) => {
      this._shutdown = true;
      e.join("extHostStarter", this._waitForAllExit(6e3));
    }));
  }
  dispose() {
    super.dispose();
  }
  _getExtHost(id) {
    const extHostProcess = this._extHosts.get(id);
    if (!extHostProcess) {
      throw new Error(`Unknown extension host!`);
    }
    return extHostProcess;
  }
  onDynamicStdout(id) {
    return this._getExtHost(id).onStdout;
  }
  onDynamicStderr(id) {
    return this._getExtHost(id).onStderr;
  }
  onDynamicMessage(id) {
    return this._getExtHost(id).onMessage;
  }
  onDynamicExit(id) {
    return this._getExtHost(id).onExit;
  }
  async createExtensionHost() {
    if (this._shutdown) {
      throw canceled();
    }
    const id = String(++ExtensionHostStarter._lastId);
    const extHost = new WindowUtilityProcess(this._logService, this._windowsMainService, this._telemetryService, this._lifecycleMainService);
    this._extHosts.set(id, extHost);
    const disposable = extHost.onExit(({ pid, code, signal }) => {
      disposable.dispose();
      this._logService.info(`Extension host with pid ${pid} exited with code: ${code}, signal: ${signal}.`);
      setTimeout(() => {
        extHost.dispose();
        this._extHosts.delete(id);
      });
      setTimeout(() => {
        try {
          process.kill(pid, 0);
          this._logService.error(`Extension host with pid ${pid} still exists, forcefully killing it...`);
          process.kill(pid);
        } catch (er) {
        }
      }, 1e3);
    });
    return { id };
  }
  async start(id, opts) {
    if (this._shutdown) {
      throw canceled();
    }
    const extHost = this._getExtHost(id);
    const args = ["--skipWorkspaceStorageLock"];
    if (this._configurationService.getValue("extensions.supportNodeGlobalNavigator")) {
      args.push("--supportGlobalNavigator");
    }
    extHost.start({
      ...opts,
      type: "extensionHost",
      name: "extension-host",
      entryPoint: "vs/workbench/api/node/extensionHostProcess",
      args,
      execArgv: opts.execArgv,
      allowLoadingUnsignedLibraries: true,
      respondToAuthRequestsFromMainProcess: true,
      windowLifecycleBound: true,
      windowLifecycleGraceTime: extensionHostGraceTimeMs,
      correlationId: id
    });
    const pid = await Event.toPromise(extHost.onSpawn);
    return { pid };
  }
  async enableInspectPort(id) {
    if (this._shutdown) {
      throw canceled();
    }
    const extHostProcess = this._extHosts.get(id);
    if (!extHostProcess) {
      return false;
    }
    return extHostProcess.enableInspectPort();
  }
  async kill(id) {
    if (this._shutdown) {
      throw canceled();
    }
    const extHostProcess = this._extHosts.get(id);
    if (!extHostProcess) {
      return;
    }
    extHostProcess.kill();
  }
  async waitForExit(id, maxWaitTimeMs) {
    if (this._shutdown) {
      throw canceled();
    }
    const extHostProcess = this._extHosts.get(id);
    if (!extHostProcess) {
      return;
    }
    await extHostProcess.waitForExit(maxWaitTimeMs);
  }
  async _killAllNow() {
    for (const [, extHost] of this._extHosts) {
      extHost.kill();
    }
  }
  async _waitForAllExit(maxWaitTimeMs) {
    const exitPromises = [];
    for (const [, extHost] of this._extHosts) {
      exitPromises.push(extHost.waitForExit(maxWaitTimeMs));
    }
    return Promises.settled(exitPromises).then(() => {
    });
  }
};
ExtensionHostStarter._lastId = 0;
ExtensionHostStarter = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ILifecycleMainService),
  __decorateParam(2, IWindowsMainService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IConfigurationService)
], ExtensionHostStarter);
export {
  ExtensionHostStarter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uc1xcZWxlY3Ryb24tbWFpblxcZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGNhbmNlbGVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZXh0ZW5zaW9uSG9zdEdyYWNlVGltZU1zLCBJRXh0ZW5zaW9uSG9zdFByb2Nlc3NPcHRpb25zLCBJRXh0ZW5zaW9uSG9zdFN0YXJ0ZXIgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uSG9zdFN0YXJ0ZXIuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2VsZWN0cm9uLW1haW4vbGlmZWN5Y2xlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFdpbmRvd1V0aWxpdHlQcm9jZXNzIH0gZnJvbSAnLi4vLi4vdXRpbGl0eVByb2Nlc3MvZWxlY3Ryb24tbWFpbi91dGlsaXR5UHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBJV2luZG93c01haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd2luZG93cy9lbGVjdHJvbi1tYWluL3dpbmRvd3MuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25Ib3N0U3RhcnRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSwgSUV4dGVuc2lvbkhvc3RTdGFydGVyIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2xhc3RJZDogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0cyA9IG5ldyBNYXA8c3RyaW5nLCBXaW5kb3dVdGlsaXR5UHJvY2Vzcz4oKTtcblx0cHJpdmF0ZSBfc2h1dGRvd24gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlLFxuXHRcdEBJV2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dpbmRvd3NNYWluU2VydmljZTogSVdpbmRvd3NNYWluU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gT24gc2h1dGRvd246IGdyYWNlZnVsbHkgYXdhaXQgZXh0ZW5zaW9uIGhvc3Qgc2h1dGRvd25zXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlmZWN5Y2xlTWFpblNlcnZpY2Uub25XaWxsU2h1dGRvd24oZSA9PiB7XG5cdFx0XHR0aGlzLl9zaHV0ZG93biA9IHRydWU7XG5cdFx0XHRlLmpvaW4oJ2V4dEhvc3RTdGFydGVyJywgdGhpcy5fd2FpdEZvckFsbEV4aXQoNjAwMCkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gSW50ZW50aW9uYWxseSBub3Qga2lsbGluZyB0aGUgZXh0ZW5zaW9uIGhvc3QgcHJvY2Vzc2VzXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RXh0SG9zdChpZDogc3RyaW5nKTogV2luZG93VXRpbGl0eVByb2Nlc3Mge1xuXHRcdGNvbnN0IGV4dEhvc3RQcm9jZXNzID0gdGhpcy5fZXh0SG9zdHMuZ2V0KGlkKTtcblx0XHRpZiAoIWV4dEhvc3RQcm9jZXNzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gZXh0ZW5zaW9uIGhvc3QhYCk7XG5cdFx0fVxuXHRcdHJldHVybiBleHRIb3N0UHJvY2Vzcztcblx0fVxuXG5cdG9uRHluYW1pY1N0ZG91dChpZDogc3RyaW5nKTogRXZlbnQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEV4dEhvc3QoaWQpLm9uU3Rkb3V0O1xuXHR9XG5cblx0b25EeW5hbWljU3RkZXJyKGlkOiBzdHJpbmcpOiBFdmVudDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0RXh0SG9zdChpZCkub25TdGRlcnI7XG5cdH1cblxuXHRvbkR5bmFtaWNNZXNzYWdlKGlkOiBzdHJpbmcpOiBFdmVudDx1bmtub3duPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEV4dEhvc3QoaWQpLm9uTWVzc2FnZTtcblx0fVxuXG5cdG9uRHluYW1pY0V4aXQoaWQ6IHN0cmluZyk6IEV2ZW50PHsgY29kZTogbnVtYmVyOyBzaWduYWw6IHN0cmluZyB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEV4dEhvc3QoaWQpLm9uRXhpdDtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUV4dGVuc2lvbkhvc3QoKTogUHJvbWlzZTx7IGlkOiBzdHJpbmcgfT4ge1xuXHRcdGlmICh0aGlzLl9zaHV0ZG93bikge1xuXHRcdFx0dGhyb3cgY2FuY2VsZWQoKTtcblx0XHR9XG5cdFx0Y29uc3QgaWQgPSBTdHJpbmcoKytFeHRlbnNpb25Ib3N0U3RhcnRlci5fbGFzdElkKTtcblx0XHRjb25zdCBleHRIb3N0ID0gbmV3IFdpbmRvd1V0aWxpdHlQcm9jZXNzKHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuX3dpbmRvd3NNYWluU2VydmljZSwgdGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgdGhpcy5fbGlmZWN5Y2xlTWFpblNlcnZpY2UpO1xuXHRcdHRoaXMuX2V4dEhvc3RzLnNldChpZCwgZXh0SG9zdCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGV4dEhvc3Qub25FeGl0KCh7IHBpZCwgY29kZSwgc2lnbmFsIH0pID0+IHtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBFeHRlbnNpb24gaG9zdCB3aXRoIHBpZCAke3BpZH0gZXhpdGVkIHdpdGggY29kZTogJHtjb2RlfSwgc2lnbmFsOiAke3NpZ25hbH0uYCk7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0ZXh0SG9zdC5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2V4dEhvc3RzLmRlbGV0ZShpZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTQ0Nzdcblx0XHRcdC8vIFdlIGhhdmUgb2JzZXJ2ZWQgdGhhdCBzb21ldGltZXMgdGhlIHByb2Nlc3Mgc2VuZHMgYW4gZXhpdFxuXHRcdFx0Ly8gZXZlbnQsIGJ1dCBkb2VzIG5vdCByZWFsbHkgZXhpdCBhbmQgaXMgc3R1Y2sgaW4gYW4gZW5kbGVzc1xuXHRcdFx0Ly8gbG9vcC4gSW4gdGhlc2UgY2FzZXMgd2Uga2lsbCB0aGUgcHJvY2VzcyBmb3JjZWZ1bGx5IGFmdGVyXG5cdFx0XHQvLyBhIGNlcnRhaW4gdGltZW91dC5cblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHByb2Nlc3Mua2lsbChwaWQsIDApOyAvLyB3aWxsIHRocm93IGlmIHRoZSBwcm9jZXNzIGRvZXNuJ3QgZXhpc3QgYW55bW9yZS5cblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBFeHRlbnNpb24gaG9zdCB3aXRoIHBpZCAke3BpZH0gc3RpbGwgZXhpc3RzLCBmb3JjZWZ1bGx5IGtpbGxpbmcgaXQuLi5gKTtcblx0XHRcdFx0XHRwcm9jZXNzLmtpbGwocGlkKTtcblx0XHRcdFx0fSBjYXRjaCAoZXIpIHtcblx0XHRcdFx0XHQvLyBpZ25vcmUsIGFzIHRoZSBwcm9jZXNzIGlzIGFscmVhZHkgZ29uZVxuXHRcdFx0XHR9XG5cdFx0XHR9LCAxMDAwKTtcblx0XHR9KTtcblx0XHRyZXR1cm4geyBpZCB9O1xuXHR9XG5cblx0YXN5bmMgc3RhcnQoaWQ6IHN0cmluZywgb3B0czogSUV4dGVuc2lvbkhvc3RQcm9jZXNzT3B0aW9ucyk6IFByb21pc2U8eyBwaWQ6IG51bWJlciB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0aWYgKHRoaXMuX3NodXRkb3duKSB7XG5cdFx0XHR0aHJvdyBjYW5jZWxlZCgpO1xuXHRcdH1cblx0XHRjb25zdCBleHRIb3N0ID0gdGhpcy5fZ2V0RXh0SG9zdChpZCk7XG5cdFx0Y29uc3QgYXJncyA9IFsnLS1za2lwV29ya3NwYWNlU3RvcmFnZUxvY2snXTtcblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2V4dGVuc2lvbnMuc3VwcG9ydE5vZGVHbG9iYWxOYXZpZ2F0b3InKSkge1xuXHRcdFx0YXJncy5wdXNoKCctLXN1cHBvcnRHbG9iYWxOYXZpZ2F0b3InKTtcblx0XHR9XG5cdFx0ZXh0SG9zdC5zdGFydCh7XG5cdFx0XHQuLi5vcHRzLFxuXHRcdFx0dHlwZTogJ2V4dGVuc2lvbkhvc3QnLFxuXHRcdFx0bmFtZTogJ2V4dGVuc2lvbi1ob3N0Jyxcblx0XHRcdGVudHJ5UG9pbnQ6ICd2cy93b3JrYmVuY2gvYXBpL25vZGUvZXh0ZW5zaW9uSG9zdFByb2Nlc3MnLFxuXHRcdFx0YXJncyxcblx0XHRcdGV4ZWNBcmd2OiBvcHRzLmV4ZWNBcmd2LFxuXHRcdFx0YWxsb3dMb2FkaW5nVW5zaWduZWRMaWJyYXJpZXM6IHRydWUsXG5cdFx0XHRyZXNwb25kVG9BdXRoUmVxdWVzdHNGcm9tTWFpblByb2Nlc3M6IHRydWUsXG5cdFx0XHR3aW5kb3dMaWZlY3ljbGVCb3VuZDogdHJ1ZSxcblx0XHRcdHdpbmRvd0xpZmVjeWNsZUdyYWNlVGltZTogZXh0ZW5zaW9uSG9zdEdyYWNlVGltZU1zLFxuXHRcdFx0Y29ycmVsYXRpb25JZDogaWRcblx0XHR9KTtcblx0XHRjb25zdCBwaWQgPSBhd2FpdCBFdmVudC50b1Byb21pc2UoZXh0SG9zdC5vblNwYXduKTtcblx0XHRyZXR1cm4geyBwaWQgfTtcblx0fVxuXG5cdGFzeW5jIGVuYWJsZUluc3BlY3RQb3J0KGlkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5fc2h1dGRvd24pIHtcblx0XHRcdHRocm93IGNhbmNlbGVkKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4dEhvc3RQcm9jZXNzID0gdGhpcy5fZXh0SG9zdHMuZ2V0KGlkKTtcblx0XHRpZiAoIWV4dEhvc3RQcm9jZXNzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBleHRIb3N0UHJvY2Vzcy5lbmFibGVJbnNwZWN0UG9ydCgpO1xuXHR9XG5cblx0YXN5bmMga2lsbChpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3NodXRkb3duKSB7XG5cdFx0XHR0aHJvdyBjYW5jZWxlZCgpO1xuXHRcdH1cblx0XHRjb25zdCBleHRIb3N0UHJvY2VzcyA9IHRoaXMuX2V4dEhvc3RzLmdldChpZCk7XG5cdFx0aWYgKCFleHRIb3N0UHJvY2Vzcykge1xuXHRcdFx0Ly8gYWxyZWFkeSBnb25lIVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRleHRIb3N0UHJvY2Vzcy5raWxsKCk7XG5cdH1cblxuXHRhc3luYyB3YWl0Rm9yRXhpdChpZDogc3RyaW5nLCBtYXhXYWl0VGltZU1zOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc2h1dGRvd24pIHtcblx0XHRcdHRocm93IGNhbmNlbGVkKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4dEhvc3RQcm9jZXNzID0gdGhpcy5fZXh0SG9zdHMuZ2V0KGlkKTtcblx0XHRpZiAoIWV4dEhvc3RQcm9jZXNzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IGV4dEhvc3RQcm9jZXNzLndhaXRGb3JFeGl0KG1heFdhaXRUaW1lTXMpO1xuXHR9XG5cblx0YXN5bmMgX2tpbGxBbGxOb3coKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBbLCBleHRIb3N0XSBvZiB0aGlzLl9leHRIb3N0cykge1xuXHRcdFx0ZXh0SG9zdC5raWxsKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgX3dhaXRGb3JBbGxFeGl0KG1heFdhaXRUaW1lTXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4aXRQcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBbLCBleHRIb3N0XSBvZiB0aGlzLl9leHRIb3N0cykge1xuXHRcdFx0ZXhpdFByb21pc2VzLnB1c2goZXh0SG9zdC53YWl0Rm9yRXhpdChtYXhXYWl0VGltZU1zKSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlcy5zZXR0bGVkKGV4aXRQcm9taXNlcykudGhlbigoKSA9PiB7IH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGdDQUFxRjtBQUM5RixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUUvQixJQUFNLHVCQUFOLGNBQW1DLFdBQXlEO0FBQUEsRUFTbEcsWUFDK0IsYUFDVSx1QkFDRixxQkFDRixtQkFDSSx1QkFDdkM7QUFDRCxVQUFNO0FBTndCO0FBQ1U7QUFDRjtBQUNGO0FBQ0k7QUFSekMsU0FBaUIsWUFBWSxvQkFBSSxJQUFrQztBQUNuRSxTQUFRLFlBQVk7QUFZbkIsU0FBSyxVQUFVLEtBQUssc0JBQXNCLGVBQWUsT0FBSztBQUM3RCxXQUFLLFlBQVk7QUFDakIsUUFBRSxLQUFLLGtCQUFrQixLQUFLLGdCQUFnQixHQUFJLENBQUM7QUFBQSxJQUNwRCxDQUFDLENBQUM7QUFB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
