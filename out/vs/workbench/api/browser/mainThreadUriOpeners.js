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
import { Action } from "../../../base/common/actions.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { localize } from "../../../nls.js";
import { INotificationService, Severity } from "../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { defaultExternalUriOpenerId } from "../../contrib/externalUriOpener/common/configuration.js";
import { ContributedExternalUriOpenersStore } from "../../contrib/externalUriOpener/common/contributedOpeners.js";
import { IExternalUriOpenerService } from "../../contrib/externalUriOpener/common/externalUriOpenerService.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadUriOpeners = class extends Disposable {
  constructor(context, storageService, externalUriOpenerService, extensionService, openerService, notificationService) {
    super();
    this.extensionService = extensionService;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this._registeredOpeners = /* @__PURE__ */ new Map();
    this.proxy = context.getProxy(ExtHostContext.ExtHostUriOpeners);
    this._register(externalUriOpenerService.registerExternalOpenerProvider(this));
    this._contributedExternalUriOpenersStore = this._register(new ContributedExternalUriOpenersStore(storageService, extensionService));
  }
  async *getOpeners(targetUri) {
    if (targetUri.scheme !== Schemas.http && targetUri.scheme !== Schemas.https) {
      return;
    }
    await this.extensionService.activateByEvent(`onOpenExternalUri:${targetUri.scheme}`);
    for (const [id, openerMetadata] of this._registeredOpeners) {
      if (openerMetadata.schemes.has(targetUri.scheme)) {
        yield this.createOpener(id, openerMetadata);
      }
    }
  }
  createOpener(id, metadata) {
    return {
      id,
      label: metadata.label,
      canOpen: (uri, token) => {
        return this.proxy.$canOpenUri(id, uri, token);
      },
      openExternalUri: async (uri, ctx, token) => {
        try {
          await this.proxy.$openUri(id, { resolvedUri: uri, sourceUri: ctx.sourceUri }, token);
        } catch (e) {
          if (!isCancellationError(e)) {
            const openDefaultAction = new Action("default", localize("openerFailedUseDefault", "Open using default opener"), void 0, void 0, async () => {
              await this.openerService.open(uri, {
                allowTunneling: false,
                allowContributedOpeners: defaultExternalUriOpenerId
              });
            });
            openDefaultAction.tooltip = uri.toString();
            this.notificationService.notify({
              severity: Severity.Error,
              message: localize({
                key: "openerFailedMessage",
                comment: ["{0} is the id of the opener. {1} is the url being opened."]
              }, "Could not open uri with '{0}': {1}", id, e.toString()),
              actions: {
                primary: [
                  openDefaultAction
                ]
              }
            });
          }
        }
        return true;
      }
    };
  }
  async $registerUriOpener(id, schemes, extensionId, label) {
    if (this._registeredOpeners.has(id)) {
      throw new Error(`Opener with id '${id}' already registered`);
    }
    this._registeredOpeners.set(id, {
      schemes: new Set(schemes),
      label,
      extensionId
    });
    this._contributedExternalUriOpenersStore.didRegisterOpener(id, extensionId.value);
  }
  async $unregisterUriOpener(id) {
    this._registeredOpeners.delete(id);
    this._contributedExternalUriOpenersStore.delete(id);
  }
  dispose() {
    super.dispose();
    this._registeredOpeners.clear();
  }
};
MainThreadUriOpeners = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadUriOpeners),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IExternalUriOpenerService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, INotificationService)
], MainThreadUriOpeners);
export {
  MainThreadUriOpeners
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZFVyaU9wZW5lcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0VXJpT3BlbmVyc1NoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZFVyaU9wZW5lcnNTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGRlZmF1bHRFeHRlcm5hbFVyaU9wZW5lcklkIH0gZnJvbSAnLi4vLi4vY29udHJpYi9leHRlcm5hbFVyaU9wZW5lci9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRlZEV4dGVybmFsVXJpT3BlbmVyc1N0b3JlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9leHRlcm5hbFVyaU9wZW5lci9jb21tb24vY29udHJpYnV0ZWRPcGVuZXJzLmpzJztcbmltcG9ydCB7IElFeHRlcm5hbE9wZW5lclByb3ZpZGVyLCBJRXh0ZXJuYWxVcmlPcGVuZXIsIElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2V4dGVybmFsVXJpT3BlbmVyL2NvbW1vbi9leHRlcm5hbFVyaU9wZW5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcblxuaW50ZXJmYWNlIFJlZ2lzdGVyZWRPcGVuZXJNZXRhZGF0YSB7XG5cdHJlYWRvbmx5IHNjaGVtZXM6IFJlYWRvbmx5U2V0PHN0cmluZz47XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xufVxuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZFVyaU9wZW5lcnMpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFVyaU9wZW5lcnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZFVyaU9wZW5lcnNTaGFwZSwgSUV4dGVybmFsT3BlbmVyUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJveHk6IEV4dEhvc3RVcmlPcGVuZXJzU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdGVyZWRPcGVuZXJzID0gbmV3IE1hcDxzdHJpbmcsIFJlZ2lzdGVyZWRPcGVuZXJNZXRhZGF0YT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJpYnV0ZWRFeHRlcm5hbFVyaU9wZW5lcnNTdG9yZTogQ29udHJpYnV0ZWRFeHRlcm5hbFVyaU9wZW5lcnNTdG9yZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlIGV4dGVybmFsVXJpT3BlbmVyU2VydmljZTogSUV4dGVybmFsVXJpT3BlbmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnByb3h5ID0gY29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0VXJpT3BlbmVycyk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihleHRlcm5hbFVyaU9wZW5lclNlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbE9wZW5lclByb3ZpZGVyKHRoaXMpKTtcblxuXHRcdHRoaXMuX2NvbnRyaWJ1dGVkRXh0ZXJuYWxVcmlPcGVuZXJzU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29udHJpYnV0ZWRFeHRlcm5hbFVyaU9wZW5lcnNTdG9yZShzdG9yYWdlU2VydmljZSwgZXh0ZW5zaW9uU2VydmljZSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jICpnZXRPcGVuZXJzKHRhcmdldFVyaTogVVJJKTogQXN5bmNJdGVyYWJsZTxJRXh0ZXJuYWxVcmlPcGVuZXI+IHtcblxuXHRcdC8vIEN1cnJlbnRseSB3ZSBvbmx5IGFsbG93IG9wZW5lcnMgZm9yIGh0dHAgYW5kIGh0dHBzIHVybHNcblx0XHRpZiAodGFyZ2V0VXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5odHRwICYmIHRhcmdldFVyaS5zY2hlbWUgIT09IFNjaGVtYXMuaHR0cHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbk9wZW5FeHRlcm5hbFVyaToke3RhcmdldFVyaS5zY2hlbWV9YCk7XG5cblx0XHRmb3IgKGNvbnN0IFtpZCwgb3BlbmVyTWV0YWRhdGFdIG9mIHRoaXMuX3JlZ2lzdGVyZWRPcGVuZXJzKSB7XG5cdFx0XHRpZiAob3BlbmVyTWV0YWRhdGEuc2NoZW1lcy5oYXModGFyZ2V0VXJpLnNjaGVtZSkpIHtcblx0XHRcdFx0eWllbGQgdGhpcy5jcmVhdGVPcGVuZXIoaWQsIG9wZW5lck1ldGFkYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU9wZW5lcihpZDogc3RyaW5nLCBtZXRhZGF0YTogUmVnaXN0ZXJlZE9wZW5lck1ldGFkYXRhKTogSUV4dGVybmFsVXJpT3BlbmVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGlkLFxuXHRcdFx0bGFiZWw6IG1ldGFkYXRhLmxhYmVsLFxuXHRcdFx0Y2FuT3BlbjogKHVyaSwgdG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJveHkuJGNhbk9wZW5VcmkoaWQsIHVyaSwgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdG9wZW5FeHRlcm5hbFVyaTogYXN5bmMgKHVyaSwgY3R4LCB0b2tlbikgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucHJveHkuJG9wZW5VcmkoaWQsIHsgcmVzb2x2ZWRVcmk6IHVyaSwgc291cmNlVXJpOiBjdHguc291cmNlVXJpIH0sIHRva2VuKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3BlbkRlZmF1bHRBY3Rpb24gPSBuZXcgQWN0aW9uKCdkZWZhdWx0JywgbG9jYWxpemUoJ29wZW5lckZhaWxlZFVzZURlZmF1bHQnLCBcIk9wZW4gdXNpbmcgZGVmYXVsdCBvcGVuZXJcIiksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKHVyaSwge1xuXHRcdFx0XHRcdFx0XHRcdGFsbG93VHVubmVsaW5nOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRhbGxvd0NvbnRyaWJ1dGVkT3BlbmVyczogZGVmYXVsdEV4dGVybmFsVXJpT3BlbmVySWQsXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRvcGVuRGVmYXVsdEFjdGlvbi50b29sdGlwID0gdXJpLnRvU3RyaW5nKCk7XG5cblx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKHtcblx0XHRcdFx0XHRcdFx0XHRrZXk6ICdvcGVuZXJGYWlsZWRNZXNzYWdlJyxcblx0XHRcdFx0XHRcdFx0XHRjb21tZW50OiBbJ3swfSBpcyB0aGUgaWQgb2YgdGhlIG9wZW5lci4gezF9IGlzIHRoZSB1cmwgYmVpbmcgb3BlbmVkLiddLFxuXHRcdFx0XHRcdFx0XHR9LCAnQ291bGQgbm90IG9wZW4gdXJpIHdpdGggXFwnezB9XFwnOiB7MX0nLCBpZCwgZS50b1N0cmluZygpKSxcblx0XHRcdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdHByaW1hcnk6IFtcblx0XHRcdFx0XHRcdFx0XHRcdG9wZW5EZWZhdWx0QWN0aW9uXG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyAkcmVnaXN0ZXJVcmlPcGVuZXIoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRzY2hlbWVzOiByZWFkb25seSBzdHJpbmdbXSxcblx0XHRleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcixcblx0XHRsYWJlbDogc3RyaW5nLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fcmVnaXN0ZXJlZE9wZW5lcnMuaGFzKGlkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBPcGVuZXIgd2l0aCBpZCAnJHtpZH0nIGFscmVhZHkgcmVnaXN0ZXJlZGApO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyZWRPcGVuZXJzLnNldChpZCwge1xuXHRcdFx0c2NoZW1lczogbmV3IFNldChzY2hlbWVzKSxcblx0XHRcdGxhYmVsLFxuXHRcdFx0ZXh0ZW5zaW9uSWQsXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9jb250cmlidXRlZEV4dGVybmFsVXJpT3BlbmVyc1N0b3JlLmRpZFJlZ2lzdGVyT3BlbmVyKGlkLCBleHRlbnNpb25JZC52YWx1ZSk7XG5cdH1cblxuXHRhc3luYyAkdW5yZWdpc3RlclVyaU9wZW5lcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVnaXN0ZXJlZE9wZW5lcnMuZGVsZXRlKGlkKTtcblx0XHR0aGlzLl9jb250cmlidXRlZEV4dGVybmFsVXJpT3BlbmVyc1N0b3JlLmRlbGV0ZShpZCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZWdpc3RlcmVkT3BlbmVycy5jbGVhcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFFeEIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQXdDLG1CQUE4QztBQUMvRixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBDQUEwQztBQUNuRCxTQUFzRCxpQ0FBaUM7QUFDdkYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNkM7QUFTL0MsSUFBTSx1QkFBTixjQUFtQyxXQUF5RTtBQUFBLEVBTWxILFlBQ0MsU0FDaUIsZ0JBQ1UsMEJBQ1Msa0JBQ0gsZUFDTSxxQkFDdEM7QUFDRCxVQUFNO0FBSjhCO0FBQ0g7QUFDTTtBQVR4QyxTQUFpQixxQkFBcUIsb0JBQUksSUFBc0M7QUFZL0UsU0FBSyxRQUFRLFFBQVEsU0FBUyxlQUFlLGlCQUFpQjtBQUU5RCxTQUFLLFVBQVUseUJBQXlCLCtCQUErQixJQUFJLENBQUM7QUFFNUUsU0FBSyxzQ0FBc0MsS0FBSyxVQUFVLElBQUksbUNBQW1DLGdCQUFnQixnQkFBZ0IsQ0FBQztBQUFBLEVBQ25JO0FBQUEsRUFFQSxPQUFjLFdBQVcsV0FBbUQ7QUFHM0UsUUFBSSxVQUFVLFdBQVcsUUFBUSxRQUFRLFVBQVUsV0FBVyxRQUFRLE9BQU87QUFDNUU7QUFBQSxJQUNEO0FBRUEsVUFBTSxLQUFLLGlCQUFpQixnQkFBZ0IscUJBQXFCLFVBQVUsTUFBTSxFQUFFO0FBRW5GLGVBQVcsQ0FBQyxJQUFJLGNBQWMsS0FBSyxLQUFLLG9CQUFvQjtBQUMzRCxVQUFJLGVBQWUsUUFBUSxJQUFJLFVBQVUsTUFBTSxHQUFHO0FBQ2pELGNBQU0sS0FBSyxhQUFhLElBQUksY0FBYztBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQWEsSUFBWSxVQUF3RDtBQUN4RixXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsT0FBTyxTQUFTO0FBQUEsTUFDaEIsU0FBUyxDQUFDLEtBQUssVUFBVTtBQUN4QixlQUFPLEtBQUssTUFBTSxZQUFZLElBQUksS0FBSyxLQUFLO0FBQUEsTUFDN0M7QUFBQSxNQUNBLGlCQUFpQixPQUFPLEtBQUssS0FBSyxVQUFVO0FBQzNDLFlBQUk7QUFDSCxnQkFBTSxLQUFLLE1BQU0sU0FBUyxJQUFJLEVBQUUsYUFBYSxLQUFLLFdBQVcsSUFBSSxVQUFVLEdBQUcsS0FBSztBQUFBLFFBQ3BGLFNBQVMsR0FBRztBQUNYLGNBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHO0FBQzVCLGtCQUFNLG9CQUFvQixJQUFJLE9BQU8sV0FBVyxTQUFTLDBCQUEwQiwyQkFBMkIsR0FBRyxRQUFXLFFBQVcsWUFBWTtBQUNsSixvQkFBTSxLQUFLLGNBQWMsS0FBSyxLQUFLO0FBQUEsZ0JBQ2xDLGdCQUFnQjtBQUFBLGdCQUNoQix5QkFBeUI7QUFBQSxjQUMxQixDQUFDO0FBQUEsWUFDRixDQUFDO0FBQ0QsOEJBQWtCLFVBQVUsSUFBSSxTQUFTO0FBRXpDLGlCQUFLLG9CQUFvQixPQUFPO0FBQUEsY0FDL0IsVUFBVSxTQUFTO0FBQUEsY0FDbkIsU0FBUyxTQUFTO0FBQUEsZ0JBQ2pCLEtBQUs7QUFBQSxnQkFDTCxTQUFTLENBQUMsMkRBQTJEO0FBQUEsY0FDdEUsR0FBRyxzQ0FBd0MsSUFBSSxFQUFFLFNBQVMsQ0FBQztBQUFBLGNBQzNELFNBQVM7QUFBQSxnQkFDUixTQUFTO0FBQUEsa0JBQ1I7QUFBQSxnQkFDRDtBQUFBLGNBQ0Q7QUFBQSxZQUNELENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sbUJBQ0wsSUFDQSxTQUNBLGFBQ0EsT0FDZ0I7QUFDaEIsUUFBSSxLQUFLLG1CQUFtQixJQUFJLEVBQUUsR0FBRztBQUNwQyxZQUFNLElBQUksTUFBTSxtQkFBbUIsRUFBRSxzQkFBc0I7QUFBQSxJQUM1RDtBQUVBLFNBQUssbUJBQW1CLElBQUksSUFBSTtBQUFBLE1BQy9CLFNBQVMsSUFBSSxJQUFJLE9BQU87QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLG9DQUFvQyxrQkFBa0IsSUFBSSxZQUFZLEtBQUs7QUFBQSxFQUNqRjtBQUFBLEVBRUEsTUFBTSxxQkFBcUIsSUFBMkI7QUFDckQsU0FBSyxtQkFBbUIsT0FBTyxFQUFFO0FBQ2pDLFNBQUssb0NBQW9DLE9BQU8sRUFBRTtBQUFBLEVBQ25EO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixVQUFNLFFBQVE7QUFDZCxTQUFLLG1CQUFtQixNQUFNO0FBQUEsRUFDL0I7QUFDRDtBQXpHYSx1QkFBTjtBQUFBLEVBRE4scUJBQXFCLFlBQVksb0JBQW9CO0FBQUEsRUFTbkQ7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFtdCn0K
