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
import { localize } from "../../../../nls.js";
import {
  TUNNEL_HOST_CHANNEL,
  TUNNEL_HOST_LOG_ID
} from "../../../../platform/agentHost/common/tunnelAgentHost.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ISharedProcessService } from "../../../../platform/ipc/electron-browser/services.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { joinPath } from "../../../../base/common/resources.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
const CONFIGURATION_KEY_MICROSOFT_AUTH = "remote.tunnels.access.enableMicrosoftAuth";
const SHOW_TUNNEL_HOST_OUTPUT_ID = "sessions.tunnelHost.showOutput";
const RENAME_TUNNEL_ID = "sessions.tunnelHost.renameTunnel";
let TunnelHostService = class extends Disposable {
  constructor(sharedProcessService, _authenticationService, _productService, _configurationService, loggerService, environmentService) {
    super();
    this._authenticationService = _authenticationService;
    this._productService = _productService;
    this._configurationService = _configurationService;
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this._isSharing = false;
    this._isConnecting = false;
    this._logger = this._register(loggerService.createLogger(
      joinPath(environmentService.logsHome, `${TUNNEL_HOST_LOG_ID}.log`),
      { id: TUNNEL_HOST_LOG_ID, name: localize("tunnelHost.outputChannel", "Remote Connections") }
    ));
    this._mainService = ProxyChannel.toService(
      sharedProcessService.getChannel(TUNNEL_HOST_CHANNEL)
    );
    this._register(this._mainService.onDidChangeStatus((status) => {
      this._isSharing = status.active;
      this._sharingInfo = status.active ? status.info : void 0;
      this._onDidChangeStatus.fire();
    }));
    this._mainService.getStatus().then((status) => {
      this._isSharing = status.active;
      this._sharingInfo = status.active ? status.info : void 0;
      if (status.active) {
        this._onDidChangeStatus.fire();
      }
    });
  }
  get isSharing() {
    return this._isSharing;
  }
  get isConnecting() {
    return this._isConnecting;
  }
  get sharingInfo() {
    return this._sharingInfo;
  }
  async startSharing() {
    this._isConnecting = true;
    this._onDidChangeStatus.fire();
    try {
      const auth = await this._getToken(false);
      if (!auth) {
        this._logger.warn("No auth token available for tunnel hosting");
        throw new Error(localize("tunnelHost.noAuth", "No authentication token available. Please sign in and try again."));
      }
      this._logger.info("Starting tunnel hosting...");
      const info = await this._mainService.startHosting(auth.token, auth.provider);
      this._isSharing = true;
      this._sharingInfo = info;
    } finally {
      this._isConnecting = false;
      this._onDidChangeStatus.fire();
    }
  }
  async stopSharing() {
    this._logger.info("Stopping tunnel hosting...");
    await this._mainService.stopHosting();
    this._isSharing = false;
    this._sharingInfo = void 0;
    this._onDidChangeStatus.fire();
  }
  _getEnabledProviders() {
    const microsoftEnabled = this._configurationService.getValue(CONFIGURATION_KEY_MICROSOFT_AUTH);
    return microsoftEnabled ? ["microsoft", "github"] : ["github"];
  }
  async _getToken(silent) {
    const enabledProviders = this._getEnabledProviders();
    if (this._lastAuthProvider && enabledProviders.includes(this._lastAuthProvider)) {
      const result = await this._getTokenForProvider(this._lastAuthProvider, silent);
      if (result) {
        return result;
      }
    }
    for (const provider of enabledProviders) {
      if (provider === this._lastAuthProvider) {
        continue;
      }
      const result = await this._getTokenForProvider(provider, true);
      if (result) {
        return result;
      }
    }
    if (!silent) {
      for (const provider of enabledProviders) {
        const result = await this._getTokenForProvider(provider, false);
        if (result) {
          return result;
        }
      }
    }
    return void 0;
  }
  _getScopesForProvider(provider) {
    const config = this._productService.tunnelApplicationConfig?.authenticationProviders;
    return config?.[provider]?.scopes ?? [];
  }
  async _getTokenForProvider(provider, silent) {
    const scopes = this._getScopesForProvider(provider);
    if (scopes.length === 0) {
      return void 0;
    }
    try {
      let sessions = await this._authenticationService.getSessions(provider, scopes, {}, true);
      if (sessions.length === 0) {
        const allSessions = await this._authenticationService.getSessions(provider, void 0, {}, true);
        const requestedSet = new Set(scopes);
        let bestSession;
        let bestExtra = Infinity;
        for (const session of allSessions) {
          const sessionScopes = new Set(session.scopes);
          let isSuperset = true;
          for (const scope of requestedSet) {
            if (!sessionScopes.has(scope)) {
              isSuperset = false;
              break;
            }
          }
          if (isSuperset) {
            const extra = sessionScopes.size - requestedSet.size;
            if (extra < bestExtra) {
              bestExtra = extra;
              bestSession = session;
            }
          }
        }
        if (bestSession) {
          sessions = [bestSession];
        }
      }
      if (sessions.length === 0 && !silent) {
        const session = await this._authenticationService.createSession(provider, scopes, { activateImmediate: true });
        sessions = [session];
      }
      if (sessions.length > 0) {
        const token = sessions[0].accessToken;
        if (token) {
          this._lastAuthProvider = provider;
          return { token, provider };
        }
      }
    } catch (err) {
      this._logger.debug(`Failed to get ${provider} token: ${err}`);
    }
    return void 0;
  }
};
TunnelHostService = __decorateClass([
  __decorateParam(0, ISharedProcessService),
  __decorateParam(1, IAuthenticationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILoggerService),
  __decorateParam(5, IEnvironmentService)
], TunnelHostService);
export {
  CONFIGURATION_KEY_MICROSOFT_AUTH,
  RENAME_TUNNEL_ID,
  SHOW_TUNNEL_HOST_OUTPUT_ID,
  TunnelHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGVsZWN0cm9uLWJyb3dzZXJcXHR1bm5lbEhvc3RTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHtcblx0SVR1bm5lbEFnZW50SG9zdEhvc3RpbmdTZXJ2aWNlLFxuXHRUVU5ORUxfSE9TVF9DSEFOTkVMLFxuXHRUVU5ORUxfSE9TVF9MT0dfSUQsXG5cdHR5cGUgSVR1bm5lbEhvc3RJbmZvLFxuXHR0eXBlIFR1bm5lbEhvc3RTdGF0dXMsXG59IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pcGMvZWxlY3Ryb24tYnJvd3Nlci9zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVR1bm5lbEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3R1bm5lbEhvc3QuanMnO1xuXG5leHBvcnQgY29uc3QgQ09ORklHVVJBVElPTl9LRVlfTUlDUk9TT0ZUX0FVVEggPSAncmVtb3RlLnR1bm5lbHMuYWNjZXNzLmVuYWJsZU1pY3Jvc29mdEF1dGgnO1xuZXhwb3J0IGNvbnN0IFNIT1dfVFVOTkVMX0hPU1RfT1VUUFVUX0lEID0gJ3Nlc3Npb25zLnR1bm5lbEhvc3Quc2hvd091dHB1dCc7XG5leHBvcnQgY29uc3QgUkVOQU1FX1RVTk5FTF9JRCA9ICdzZXNzaW9ucy50dW5uZWxIb3N0LnJlbmFtZVR1bm5lbCc7XG5cbmV4cG9ydCBjbGFzcyBUdW5uZWxIb3N0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHVubmVsSG9zdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tYWluU2VydmljZTogSVR1bm5lbEFnZW50SG9zdEhvc3RpbmdTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXI6IElMb2dnZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0dXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfaXNTaGFyaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzQ29ubmVjdGluZyA9IGZhbHNlO1xuXHRwcml2YXRlIF9zaGFyaW5nSW5mbzogSVR1bm5lbEhvc3RJbmZvIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBUcmFja3Mgd2hpY2ggYXV0aCBwcm92aWRlciB3YXMgbGFzdCB1c2VkIHN1Y2Nlc3NmdWxseS4gKi9cblx0cHJpdmF0ZSBfbGFzdEF1dGhQcm92aWRlcjogJ2dpdGh1YicgfCAnbWljcm9zb2Z0JyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNoYXJlZFByb2Nlc3NTZXJ2aWNlIHNoYXJlZFByb2Nlc3NTZXJ2aWNlOiBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dnZXJTZXJ2aWNlIGxvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2xvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKFxuXHRcdFx0am9pblBhdGgoZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lLCBgJHtUVU5ORUxfSE9TVF9MT0dfSUR9LmxvZ2ApLFxuXHRcdFx0eyBpZDogVFVOTkVMX0hPU1RfTE9HX0lELCBuYW1lOiBsb2NhbGl6ZSgndHVubmVsSG9zdC5vdXRwdXRDaGFubmVsJywgXCJSZW1vdGUgQ29ubmVjdGlvbnNcIikgfSxcblx0XHQpKTtcblxuXHRcdHRoaXMuX21haW5TZXJ2aWNlID0gUHJveHlDaGFubmVsLnRvU2VydmljZTxJVHVubmVsQWdlbnRIb3N0SG9zdGluZ1NlcnZpY2U+KFxuXHRcdFx0c2hhcmVkUHJvY2Vzc1NlcnZpY2UuZ2V0Q2hhbm5lbChUVU5ORUxfSE9TVF9DSEFOTkVMKSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbWFpblNlcnZpY2Uub25EaWRDaGFuZ2VTdGF0dXMoKHN0YXR1czogVHVubmVsSG9zdFN0YXR1cykgPT4ge1xuXHRcdFx0dGhpcy5faXNTaGFyaW5nID0gc3RhdHVzLmFjdGl2ZTtcblx0XHRcdHRoaXMuX3NoYXJpbmdJbmZvID0gc3RhdHVzLmFjdGl2ZSA/IHN0YXR1cy5pbmZvIDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX21haW5TZXJ2aWNlLmdldFN0YXR1cygpLnRoZW4oc3RhdHVzID0+IHtcblx0XHRcdHRoaXMuX2lzU2hhcmluZyA9IHN0YXR1cy5hY3RpdmU7XG5cdFx0XHR0aGlzLl9zaGFyaW5nSW5mbyA9IHN0YXR1cy5hY3RpdmUgPyBzdGF0dXMuaW5mbyA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzdGF0dXMuYWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGdldCBpc1NoYXJpbmcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzU2hhcmluZztcblx0fVxuXG5cdGdldCBpc0Nvbm5lY3RpbmcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzQ29ubmVjdGluZztcblx0fVxuXG5cdGdldCBzaGFyaW5nSW5mbygpOiBJVHVubmVsSG9zdEluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zaGFyaW5nSW5mbztcblx0fVxuXG5cdGFzeW5jIHN0YXJ0U2hhcmluZygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9pc0Nvbm5lY3RpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmZpcmUoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5fZ2V0VG9rZW4oZmFsc2UpO1xuXHRcdFx0aWYgKCFhdXRoKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKCdObyBhdXRoIHRva2VuIGF2YWlsYWJsZSBmb3IgdHVubmVsIGhvc3RpbmcnKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCd0dW5uZWxIb3N0Lm5vQXV0aCcsIFwiTm8gYXV0aGVudGljYXRpb24gdG9rZW4gYXZhaWxhYmxlLiBQbGVhc2Ugc2lnbiBpbiBhbmQgdHJ5IGFnYWluLlwiKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKCdTdGFydGluZyB0dW5uZWwgaG9zdGluZy4uLicpO1xuXG5cdFx0XHRjb25zdCBpbmZvID0gYXdhaXQgdGhpcy5fbWFpblNlcnZpY2Uuc3RhcnRIb3N0aW5nKGF1dGgudG9rZW4sIGF1dGgucHJvdmlkZXIpO1xuXHRcdFx0dGhpcy5faXNTaGFyaW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3NoYXJpbmdJbmZvID0gaW5mbztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNDb25uZWN0aW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3RvcFNoYXJpbmcoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oJ1N0b3BwaW5nIHR1bm5lbCBob3N0aW5nLi4uJyk7XG5cdFx0YXdhaXQgdGhpcy5fbWFpblNlcnZpY2Uuc3RvcEhvc3RpbmcoKTtcblx0XHR0aGlzLl9pc1NoYXJpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9zaGFyaW5nSW5mbyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFbmFibGVkUHJvdmlkZXJzKCk6IHJlYWRvbmx5ICgnZ2l0aHViJyB8ICdtaWNyb3NvZnQnKVtdIHtcblx0XHRjb25zdCBtaWNyb3NvZnRFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ09ORklHVVJBVElPTl9LRVlfTUlDUk9TT0ZUX0FVVEgpO1xuXHRcdHJldHVybiBtaWNyb3NvZnRFbmFibGVkID8gWydtaWNyb3NvZnQnLCAnZ2l0aHViJ10gOiBbJ2dpdGh1YiddO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0VG9rZW4oc2lsZW50OiBib29sZWFuKTogUHJvbWlzZTx7IHRva2VuOiBzdHJpbmc7IHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBlbmFibGVkUHJvdmlkZXJzID0gdGhpcy5fZ2V0RW5hYmxlZFByb3ZpZGVycygpO1xuXG5cdFx0aWYgKHRoaXMuX2xhc3RBdXRoUHJvdmlkZXIgJiYgZW5hYmxlZFByb3ZpZGVycy5pbmNsdWRlcyh0aGlzLl9sYXN0QXV0aFByb3ZpZGVyKSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZ2V0VG9rZW5Gb3JQcm92aWRlcih0aGlzLl9sYXN0QXV0aFByb3ZpZGVyLCBzaWxlbnQpO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgZW5hYmxlZFByb3ZpZGVycykge1xuXHRcdFx0aWYgKHByb3ZpZGVyID09PSB0aGlzLl9sYXN0QXV0aFByb3ZpZGVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZ2V0VG9rZW5Gb3JQcm92aWRlcihwcm92aWRlciwgdHJ1ZSk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFzaWxlbnQpIHtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgZW5hYmxlZFByb3ZpZGVycykge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9nZXRUb2tlbkZvclByb3ZpZGVyKHByb3ZpZGVyLCBmYWxzZSk7XG5cdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNjb3Blc0ZvclByb3ZpZGVyKHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnR1bm5lbEFwcGxpY2F0aW9uQ29uZmlnPy5hdXRoZW50aWNhdGlvblByb3ZpZGVycztcblx0XHRyZXR1cm4gY29uZmlnPy5bcHJvdmlkZXJdPy5zY29wZXMgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUb2tlbkZvclByb3ZpZGVyKFxuXHRcdHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnLFxuXHRcdHNpbGVudDogYm9vbGVhbixcblx0KTogUHJvbWlzZTx7IHRva2VuOiBzdHJpbmc7IHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzY29wZXMgPSB0aGlzLl9nZXRTY29wZXNGb3JQcm92aWRlcihwcm92aWRlcik7XG5cdFx0aWYgKHNjb3Blcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlciwgc2NvcGVzLCB7fSwgdHJ1ZSk7XG5cblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29uc3QgYWxsU2Vzc2lvbnMgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXIsIHVuZGVmaW5lZCwge30sIHRydWUpO1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0ZWRTZXQgPSBuZXcgU2V0KHNjb3Blcyk7XG5cdFx0XHRcdGxldCBiZXN0U2Vzc2lvbjogdHlwZW9mIGFsbFNlc3Npb25zW251bWJlcl0gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBiZXN0RXh0cmEgPSBJbmZpbml0eTtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGFsbFNlc3Npb25zKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblNjb3BlcyA9IG5ldyBTZXQoc2Vzc2lvbi5zY29wZXMpO1xuXHRcdFx0XHRcdGxldCBpc1N1cGVyc2V0ID0gdHJ1ZTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNjb3BlIG9mIHJlcXVlc3RlZFNldCkge1xuXHRcdFx0XHRcdFx0aWYgKCFzZXNzaW9uU2NvcGVzLmhhcyhzY29wZSkpIHtcblx0XHRcdFx0XHRcdFx0aXNTdXBlcnNldCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGlzU3VwZXJzZXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGV4dHJhID0gc2Vzc2lvblNjb3Blcy5zaXplIC0gcmVxdWVzdGVkU2V0LnNpemU7XG5cdFx0XHRcdFx0XHRpZiAoZXh0cmEgPCBiZXN0RXh0cmEpIHtcblx0XHRcdFx0XHRcdFx0YmVzdEV4dHJhID0gZXh0cmE7XG5cdFx0XHRcdFx0XHRcdGJlc3RTZXNzaW9uID0gc2Vzc2lvbjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGJlc3RTZXNzaW9uKSB7XG5cdFx0XHRcdFx0c2Vzc2lvbnMgPSBbYmVzdFNlc3Npb25dO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDAgJiYgIXNpbGVudCkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24ocHJvdmlkZXIsIHNjb3BlcywgeyBhY3RpdmF0ZUltbWVkaWF0ZTogdHJ1ZSB9KTtcblx0XHRcdFx0c2Vzc2lvbnMgPSBbc2Vzc2lvbl07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuID0gc2Vzc2lvbnNbMF0uYWNjZXNzVG9rZW47XG5cdFx0XHRcdGlmICh0b2tlbikge1xuXHRcdFx0XHRcdHRoaXMuX2xhc3RBdXRoUHJvdmlkZXIgPSBwcm92aWRlcjtcblx0XHRcdFx0XHRyZXR1cm4geyB0b2tlbiwgcHJvdmlkZXIgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmRlYnVnKGBGYWlsZWQgdG8gZ2V0ICR7cHJvdmlkZXJ9IHRva2VuOiAke2Vycn1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCO0FBQUEsRUFFQztBQUFBLEVBQ0E7QUFBQSxPQUdNO0FBQ1AsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBa0Isc0JBQXNCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw4QkFBOEI7QUFHaEMsTUFBTSxtQ0FBbUM7QUFDekMsTUFBTSw2QkFBNkI7QUFDbkMsTUFBTSxtQkFBbUI7QUFFekIsSUFBTSxvQkFBTixjQUFnQyxXQUF5QztBQUFBLEVBZ0IvRSxZQUN3QixzQkFDa0Isd0JBQ1AsaUJBQ00sdUJBQ3hCLGVBQ0ssb0JBQ3BCO0FBQ0QsVUFBTTtBQU5tQztBQUNQO0FBQ007QUFkekMsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUN4RSxTQUFTLG9CQUFpQyxLQUFLLG1CQUFtQjtBQUVsRSxTQUFRLGFB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
