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
import * as nls from "../../../../nls.js";
import { ITunnelService, TunnelProtocol, TunnelPrivacyId } from "../../../../platform/tunnel/common/tunnel.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { URI } from "../../../../base/common/uri.js";
import { IRemoteExplorerService } from "../../../services/remote/common/remoteExplorerService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { forwardedPortsFeaturesEnabled } from "../../../services/remote/common/tunnelModel.js";
let TunnelFactoryContribution = class extends Disposable {
  constructor(tunnelService, environmentService, openerService, remoteExplorerService, logService, contextKeyService) {
    super();
    this.openerService = openerService;
    const tunnelFactory = environmentService.options?.tunnelProvider?.tunnelFactory;
    if (tunnelFactory) {
      contextKeyService.createKey(forwardedPortsFeaturesEnabled.key, true);
      let privacyOptions = environmentService.options?.tunnelProvider?.features?.privacyOptions ?? [];
      if (environmentService.options?.tunnelProvider?.features?.public && privacyOptions.length === 0) {
        privacyOptions = [
          {
            id: "private",
            label: nls.localize("tunnelPrivacy.private", "Private"),
            themeIcon: "lock"
          },
          {
            id: "public",
            label: nls.localize("tunnelPrivacy.public", "Public"),
            themeIcon: "eye"
          }
        ];
      }
      this._register(tunnelService.setTunnelProvider({
        forwardPort: async (tunnelOptions, tunnelCreationOptions) => {
          let tunnelPromise;
          try {
            tunnelPromise = tunnelFactory(tunnelOptions, tunnelCreationOptions);
          } catch (e) {
            logService.trace("tunnelFactory: tunnel provider error");
          }
          if (!tunnelPromise) {
            return void 0;
          }
          let tunnel;
          try {
            tunnel = await tunnelPromise;
          } catch (e) {
            logService.trace("tunnelFactory: tunnel provider promise error");
            if (e instanceof Error) {
              return e.message;
            }
            return void 0;
          }
          const localAddress = tunnel.localAddress.startsWith("http") ? tunnel.localAddress : `http://${tunnel.localAddress}`;
          const remoteTunnel = {
            tunnelRemotePort: tunnel.remoteAddress.port,
            tunnelRemoteHost: tunnel.remoteAddress.host,
            // The tunnel factory may give us an inaccessible local address.
            // To make sure this doesn't happen, resolve the uri immediately.
            localAddress: await this.resolveExternalUri(localAddress),
            privacy: tunnel.privacy ?? (tunnel.public ? TunnelPrivacyId.Public : TunnelPrivacyId.Private),
            protocol: tunnel.protocol ?? TunnelProtocol.Http,
            dispose: async () => {
              await tunnel.dispose();
            }
          };
          return remoteTunnel;
        }
      }));
      const tunnelInformation = environmentService.options?.tunnelProvider?.features ? {
        features: {
          elevation: !!environmentService.options?.tunnelProvider?.features?.elevation,
          public: !!environmentService.options?.tunnelProvider?.features?.public,
          privacyOptions,
          protocol: environmentService.options?.tunnelProvider?.features?.protocol === void 0 ? true : !!environmentService.options?.tunnelProvider?.features?.protocol
        }
      } : void 0;
      remoteExplorerService.setTunnelInformation(tunnelInformation);
    }
  }
  async resolveExternalUri(uri) {
    try {
      return (await this.openerService.resolveExternalUri(URI.parse(uri))).resolved.toString();
    } catch {
      return uri;
    }
  }
};
TunnelFactoryContribution.ID = "workbench.contrib.tunnelFactory";
TunnelFactoryContribution = __decorateClass([
  __decorateParam(0, ITunnelService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IRemoteExplorerService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IContextKeyService)
], TunnelFactoryContribution);
export {
  TunnelFactoryContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVxcYnJvd3NlclxcdHVubmVsRmFjdG9yeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVR1bm5lbFNlcnZpY2UsIFR1bm5lbE9wdGlvbnMsIFJlbW90ZVR1bm5lbCwgVHVubmVsQ3JlYXRpb25PcHRpb25zLCBJVHVubmVsLCBUdW5uZWxQcm90b2NvbCwgVHVubmVsUHJpdmFjeUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdHVubmVsL2NvbW1vbi90dW5uZWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVFeHBsb3JlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGZvcndhcmRlZFBvcnRzRmVhdHVyZXNFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi90dW5uZWxNb2RlbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUdW5uZWxGYWN0b3J5Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi50dW5uZWxGYWN0b3J5JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVR1bm5lbFNlcnZpY2UgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCB0dW5uZWxGYWN0b3J5ID0gZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnR1bm5lbFByb3ZpZGVyPy50dW5uZWxGYWN0b3J5O1xuXHRcdGlmICh0dW5uZWxGYWN0b3J5KSB7XG5cdFx0XHQvLyBBdCB0aGlzIHBvaW50IHdlIGNsZWFybHkgd2FudCB0aGUgcG9ydHMgdmlldy9mZWF0dXJlcyBzaW5jZSB3ZSBoYXZlIGEgdHVubmVsIGZhY3Rvcnlcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShmb3J3YXJkZWRQb3J0c0ZlYXR1cmVzRW5hYmxlZC5rZXksIHRydWUpO1xuXHRcdFx0bGV0IHByaXZhY3lPcHRpb25zID0gZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnR1bm5lbFByb3ZpZGVyPy5mZWF0dXJlcz8ucHJpdmFjeU9wdGlvbnMgPz8gW107XG5cdFx0XHRpZiAoZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnR1bm5lbFByb3ZpZGVyPy5mZWF0dXJlcz8ucHVibGljXG5cdFx0XHRcdCYmIChwcml2YWN5T3B0aW9ucy5sZW5ndGggPT09IDApKSB7XG5cdFx0XHRcdHByaXZhY3lPcHRpb25zID0gW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkOiAncHJpdmF0ZScsXG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCd0dW5uZWxQcml2YWN5LnByaXZhdGUnLCBcIlByaXZhdGVcIiksXG5cdFx0XHRcdFx0XHR0aGVtZUljb246ICdsb2NrJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6ICdwdWJsaWMnLFxuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndHVubmVsUHJpdmFjeS5wdWJsaWMnLCBcIlB1YmxpY1wiKSxcblx0XHRcdFx0XHRcdHRoZW1lSWNvbjogJ2V5ZSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHR1bm5lbFNlcnZpY2Uuc2V0VHVubmVsUHJvdmlkZXIoe1xuXHRcdFx0XHRmb3J3YXJkUG9ydDogYXN5bmMgKHR1bm5lbE9wdGlvbnM6IFR1bm5lbE9wdGlvbnMsIHR1bm5lbENyZWF0aW9uT3B0aW9uczogVHVubmVsQ3JlYXRpb25PcHRpb25zKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0XHRsZXQgdHVubmVsUHJvbWlzZTogUHJvbWlzZTxJVHVubmVsPiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0dHVubmVsUHJvbWlzZSA9IHR1bm5lbEZhY3RvcnkodHVubmVsT3B0aW9ucywgdHVubmVsQ3JlYXRpb25PcHRpb25zKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCd0dW5uZWxGYWN0b3J5OiB0dW5uZWwgcHJvdmlkZXIgZXJyb3InKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIXR1bm5lbFByb21pc2UpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxldCB0dW5uZWw6IElUdW5uZWw7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHR1bm5lbCA9IGF3YWl0IHR1bm5lbFByb21pc2U7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgndHVubmVsRmFjdG9yeTogdHVubmVsIHByb3ZpZGVyIHByb21pc2UgZXJyb3InKTtcblx0XHRcdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGUubWVzc2FnZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGxvY2FsQWRkcmVzcyA9IHR1bm5lbC5sb2NhbEFkZHJlc3Muc3RhcnRzV2l0aCgnaHR0cCcpID8gdHVubmVsLmxvY2FsQWRkcmVzcyA6IGBodHRwOi8vJHt0dW5uZWwubG9jYWxBZGRyZXNzfWA7XG5cdFx0XHRcdFx0Y29uc3QgcmVtb3RlVHVubmVsOiBSZW1vdGVUdW5uZWwgPSB7XG5cdFx0XHRcdFx0XHR0dW5uZWxSZW1vdGVQb3J0OiB0dW5uZWwucmVtb3RlQWRkcmVzcy5wb3J0LFxuXHRcdFx0XHRcdFx0dHVubmVsUmVtb3RlSG9zdDogdHVubmVsLnJlbW90ZUFkZHJlc3MuaG9zdCxcblx0XHRcdFx0XHRcdC8vIFRoZSB0dW5uZWwgZmFjdG9yeSBtYXkgZ2l2ZSB1cyBhbiBpbmFjY2Vzc2libGUgbG9jYWwgYWRkcmVzcy5cblx0XHRcdFx0XHRcdC8vIFRvIG1ha2Ugc3VyZSB0aGlzIGRvZXNuJ3QgaGFwcGVuLCByZXNvbHZlIHRoZSB1cmkgaW1tZWRpYXRlbHkuXG5cdFx0XHRcdFx0XHRsb2NhbEFkZHJlc3M6IGF3YWl0IHRoaXMucmVzb2x2ZUV4dGVybmFsVXJpKGxvY2FsQWRkcmVzcyksXG5cdFx0XHRcdFx0XHRwcml2YWN5OiB0dW5uZWwucHJpdmFjeSA/PyAodHVubmVsLnB1YmxpYyA/IFR1bm5lbFByaXZhY3lJZC5QdWJsaWMgOiBUdW5uZWxQcml2YWN5SWQuUHJpdmF0ZSksXG5cdFx0XHRcdFx0XHRwcm90b2NvbDogdHVubmVsLnByb3RvY29sID8/IFR1bm5lbFByb3RvY29sLkh0dHAsXG5cdFx0XHRcdFx0XHRkaXNwb3NlOiBhc3luYyAoKSA9PiB7IGF3YWl0IHR1bm5lbC5kaXNwb3NlKCk7IH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHJldHVybiByZW1vdGVUdW5uZWw7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHR1bm5lbEluZm9ybWF0aW9uID0gZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnR1bm5lbFByb3ZpZGVyPy5mZWF0dXJlcyA/XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRmZWF0dXJlczoge1xuXHRcdFx0XHRcdFx0ZWxldmF0aW9uOiAhIWVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy50dW5uZWxQcm92aWRlcj8uZmVhdHVyZXM/LmVsZXZhdGlvbixcblx0XHRcdFx0XHRcdHB1YmxpYzogISFlbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8udHVubmVsUHJvdmlkZXI/LmZlYXR1cmVzPy5wdWJsaWMsXG5cdFx0XHRcdFx0XHRwcml2YWN5T3B0aW9ucyxcblx0XHRcdFx0XHRcdHByb3RvY29sOiBlbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8udHVubmVsUHJvdmlkZXI/LmZlYXR1cmVzPy5wcm90b2NvbCA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6ICEhZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnR1bm5lbFByb3ZpZGVyPy5mZWF0dXJlcz8ucHJvdG9jb2xcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRyZW1vdGVFeHBsb3JlclNlcnZpY2Uuc2V0VHVubmVsSW5mb3JtYXRpb24odHVubmVsSW5mb3JtYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUV4dGVybmFsVXJpKHVyaTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2UucmVzb2x2ZUV4dGVybmFsVXJpKFVSSS5wYXJzZSh1cmkpKSkucmVzb2x2ZWQudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUE2RSxnQkFBZ0IsdUJBQXVCO0FBQzdILFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFDQUFxQztBQUV2QyxJQUFNLDRCQUFOLGNBQXdDLFdBQTZDO0FBQUEsRUFJM0YsWUFDaUIsZUFDcUIsb0JBQ2IsZUFDQSx1QkFDWCxZQUNPLG1CQUNuQjtBQUNELFVBQU07QUFMa0I7QUFNeEIsVUFBTSxnQkFBZ0IsbUJBQW1CLFNBQVMsZ0JBQWdCO0FBQ2xFLFFBQUksZUFBZTtBQUVsQix3QkFBa0IsVUFBVSw4QkFBOEIsS0FBSyxJQUFJO0FBQ25FLFVBQUksaUJBQWlCLG1CQUFtQixTQUFTLGdCQUFnQixVQUFVLGtCQUFrQixDQUFDO0FBQzlGLFVBQUksbUJBQW1CLFNBQVMsZ0JBQWdCLFVBQVUsVUFDckQsZUFBZSxXQUFXLEdBQUk7QUFDbEMseUJBQWlCO0FBQUEsVUFDaEI7QUFBQSxZQUNDLElBQUk7QUFBQSxZQUNKLE9BQU8sSUFBSSxTQUFTLHlCQUF5QixTQUFTO0FBQUEsWUFDdEQsV0FBVztBQUFBLFVBQ1o7QUFBQSxVQUNBO0FBQUEsWUFDQyxJQUFJO0FBQUEsWUFDSixPQUFPLElBQUksU0FBUyx3QkFBd0IsUUFBUTtBQUFBLFlBQ3BELFdBQVc7QUFBQSxVQUNaO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLFVBQVUsY0FBYyxrQkFBa0I7QUFBQSxRQUM5QyxhQUFhLE9BQU8sZUFBOEIsMEJBQTZGO0FBQzlJLGNBQUk7QUFDSixjQUFJO0FBQ0gsNEJBQWdCLGNBQWMsZUFBZSxxQkFBcUI7QUFBQSxVQUNuRSxTQUFTLEdBQUc7QUFDWCx1QkFBVyxNQUFNLHNDQUFzQztBQUFBLFVBQ3hEO0FBRUEsY0FBSSxDQUFDLGVBQWU7QUFDbkIsbUJBQU87QUFBQSxVQUNSO0FBQ0EsY0FBSTtBQUNKLGNBQUk7QUFDSCxxQkFBUyxNQUFNO0FBQUEsVUFDaEIsU0FBUyxHQUFHO0FBQ1gsdUJBQVcsTUFBTSw4Q0FBOEM7QUFDL0QsZ0JBQUksYUFBYSxPQUFPO0FBQ3ZCLHFCQUFPLEVBQUU7QUFBQSxZQUNWO0FBQ0EsbUJBQU87QUFBQSxVQUNSO0FBQ0EsZ0JBQU0sZUFBZSxPQUFPLGFBQWEsV0FBVyxNQUFNLElBQUksT0FBTyxlQUFlLFVBQVUsT0FBTyxZQUFZO0FBQ2pILGdCQUFNLGVBQTZCO0FBQUEsWUFDbEMsa0JBQWtCLE9BQU8sY0FBYztBQUFBLFlBQ3ZDLGtCQUFrQixPQUFPLGNBQWM7QUFBQTtBQUFBO0FBQUEsWUFHdkMsY0FBYyxNQUFNLEtBQUssbUJBQW1CLFlBQVk7QUFBQSxZQUN4RCxTQUFTLE9BQU8sWUFBWSxPQUFPLFNBQVMsZ0JBQWdCLFNBQVMsZ0JBQWdCO0FBQUEsWUFDckYsVUFBVSxPQUFPLFlBQVksZUFBZTtBQUFBLFlBQzVDLFNBQVMsWUFBWTtBQUFFLG9CQUFNLE9BQU8sUUFBUTtBQUFBLFlBQUc7QUFBQSxVQUNoRDtBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQ0YsWUFBTSxvQkFBb0IsbUJBQW1CLFNBQVMsZ0JBQWdCLFdBQ3JFO0FBQUEsUUFDQyxVQUFVO0FBQUEsVUFDVCxXQUFXLENBQUMsQ0FBQyxtQkFBbUIsU0FBUyxnQkFBZ0IsVUFBVTtBQUFBLFVBQ25FLFFBQVEsQ0FBQyxDQUFDLG1CQUFtQixTQUFTLGdCQUFnQixVQUFVO0FBQUEsVUFDaEU7QUFBQSxVQUNBLFVBQVUsbUJBQW1CLFNBQVMsZ0JBQWdCLFVBQVUsYUFBYSxTQUFZLE9BQU8sQ0FBQyxDQUFDLG1CQUFtQixTQUFTLGdCQUFnQixVQUFVO0FBQUEsUUFDeko7QUFBQSxNQUNELElBQUk7QUFDTCw0QkFBc0IscUJBQXFCLGlCQUFpQjtBQUFBLElBQzdEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxtQkFBbUIsS0FBOEI7QUFDOUQsUUFBSTtBQUNILGNBQVEsTUFBTSxLQUFLLGNBQWMsbUJBQW1CLElBQUksTUFBTSxHQUFHLENBQUMsR0FBRyxTQUFTLFNBQVM7QUFBQSxJQUN4RixRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUExRmEsMEJBRUksS0FBSztBQUZULDRCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FWVTsiLAogICJuYW1lcyI6IFtdCn0K
