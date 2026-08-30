import { Emitter, Event } from "../../../base/common/event.js";
import { cloneAndChange } from "../../../base/common/objects.js";
import { URI } from "../../../base/common/uri.js";
import { DefaultURITransformer, transformAndReviveIncomingURIs } from "../../../base/common/uriIpc.js";
import { CommontExtensionManagementService } from "./abstractExtensionManagementService.js";
import { language } from "../../../base/common/platform.js";
function transformIncomingURI(uri, transformer) {
  return uri ? URI.revive(transformer ? transformer.transformIncoming(uri) : uri) : void 0;
}
function transformOutgoingURI(uri, transformer) {
  return transformer ? transformer.transformOutgoingURI(uri) : uri;
}
function transformIncomingExtension(extension, transformer) {
  transformer = transformer ? transformer : DefaultURITransformer;
  const manifest = extension.manifest;
  const transformed = transformAndReviveIncomingURIs({ ...extension, ...{ manifest: void 0 } }, transformer);
  return { ...transformed, ...{ manifest } };
}
function transformIncomingOptions(options, transformer) {
  return options?.profileLocation ? transformAndReviveIncomingURIs(options, transformer ?? DefaultURITransformer) : options;
}
function transformOutgoingExtension(extension, transformer) {
  return transformer ? cloneAndChange(extension, (value) => value instanceof URI ? transformer.transformOutgoingURI(value) : void 0) : extension;
}
class ExtensionManagementChannel {
  constructor(service, getUriTransformer) {
    this.service = service;
    this.getUriTransformer = getUriTransformer;
    this.onInstallExtension = Event.buffer(service.onInstallExtension, "onInstallExtension", true);
    this.onDidInstallExtensions = Event.buffer(service.onDidInstallExtensions, "onDidInstallExtensions", true);
    this.onUninstallExtension = Event.buffer(service.onUninstallExtension, "onUninstallExtension", true);
    this.onDidUninstallExtension = Event.buffer(service.onDidUninstallExtension, "onDidUninstallExtension", true);
    this.onDidUpdateExtensionMetadata = Event.buffer(service.onDidUpdateExtensionMetadata, "onDidUpdateExtensionMetadata", true);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listen(context, event) {
    const uriTransformer = this.getUriTransformer(context);
    switch (event) {
      case "onInstallExtension": {
        return Event.map(this.onInstallExtension, (e) => {
          return {
            ...e,
            profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
          };
        });
      }
      case "onDidInstallExtensions": {
        return Event.map(this.onDidInstallExtensions, (results) => results.map((i) => ({
          ...i,
          local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local,
          profileLocation: i.profileLocation ? transformOutgoingURI(i.profileLocation, uriTransformer) : i.profileLocation
        })));
      }
      case "onUninstallExtension": {
        return Event.map(this.onUninstallExtension, (e) => {
          return {
            ...e,
            profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
          };
        });
      }
      case "onDidUninstallExtension": {
        return Event.map(this.onDidUninstallExtension, (e) => {
          return {
            ...e,
            profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
          };
        });
      }
      case "onDidUpdateExtensionMetadata": {
        return Event.map(this.onDidUpdateExtensionMetadata, (e) => {
          return {
            local: transformOutgoingExtension(e.local, uriTransformer),
            profileLocation: transformOutgoingURI(e.profileLocation, uriTransformer)
          };
        });
      }
    }
    throw new Error("Invalid listen");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async call(context, command, args) {
    const uriTransformer = this.getUriTransformer(context);
    switch (command) {
      case "zip": {
        const extension = transformIncomingExtension(args[0], uriTransformer);
        const uri = await this.service.zip(extension);
        return transformOutgoingURI(uri, uriTransformer);
      }
      case "install": {
        return this.service.install(transformIncomingURI(args[0], uriTransformer), transformIncomingOptions(args[1], uriTransformer));
      }
      case "installFromLocation": {
        return this.service.installFromLocation(transformIncomingURI(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
      }
      case "installExtensionsFromProfile": {
        return this.service.installExtensionsFromProfile(args[0], transformIncomingURI(args[1], uriTransformer), transformIncomingURI(args[2], uriTransformer));
      }
      case "getManifest": {
        return this.service.getManifest(transformIncomingURI(args[0], uriTransformer));
      }
      case "getTargetPlatform": {
        return this.service.getTargetPlatform();
      }
      case "installFromGallery": {
        return this.service.installFromGallery(args[0], transformIncomingOptions(args[1], uriTransformer));
      }
      case "installGalleryExtensions": {
        const arg = args[0];
        return this.service.installGalleryExtensions(arg.map(({ extension, options }) => ({ extension, options: transformIncomingOptions(options, uriTransformer) ?? {} })));
      }
      case "uninstall": {
        return this.service.uninstall(transformIncomingExtension(args[0], uriTransformer), transformIncomingOptions(args[1], uriTransformer));
      }
      case "uninstallExtensions": {
        const arg = args[0];
        return this.service.uninstallExtensions(arg.map(({ extension, options }) => ({ extension: transformIncomingExtension(extension, uriTransformer), options: transformIncomingOptions(options, uriTransformer) })));
      }
      case "getInstalled": {
        const extensions = await this.service.getInstalled(args[0], transformIncomingURI(args[1], uriTransformer), args[2], args[3]);
        return extensions.map((e) => transformOutgoingExtension(e, uriTransformer));
      }
      case "toggleApplicationScope": {
        const extension = await this.service.toggleApplicationScope(transformIncomingExtension(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
        return transformOutgoingExtension(extension, uriTransformer);
      }
      case "copyExtensions": {
        return this.service.copyExtensions(transformIncomingURI(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
      }
      case "updateMetadata": {
        const e = await this.service.updateMetadata(transformIncomingExtension(args[0], uriTransformer), args[1], transformIncomingURI(args[2], uriTransformer));
        return transformOutgoingExtension(e, uriTransformer);
      }
      case "resetPinnedStateForAllUserExtensions": {
        return this.service.resetPinnedStateForAllUserExtensions(args[0]);
      }
      case "getExtensionsControlManifest": {
        return this.service.getExtensionsControlManifest();
      }
      case "download": {
        return this.service.download(args[0], args[1], args[2]);
      }
      case "cleanUp": {
        return this.service.cleanUp();
      }
    }
    throw new Error("Invalid call");
  }
}
class ExtensionManagementChannelClient extends CommontExtensionManagementService {
  constructor(channel, productService, allowedExtensionsService) {
    super(productService, allowedExtensionsService);
    this.channel = channel;
    this._onInstallExtension = this._register(new Emitter());
    this._onDidInstallExtensions = this._register(new Emitter());
    this._onUninstallExtension = this._register(new Emitter());
    this._onDidUninstallExtension = this._register(new Emitter());
    this._onDidUpdateExtensionMetadata = this._register(new Emitter());
    this._register(this.channel.listen("onInstallExtension")((e) => this.onInstallExtensionEvent({ ...e, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })));
    this._register(this.channel.listen("onDidInstallExtensions")((results) => this.onDidInstallExtensionsEvent(results.map((e) => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })))));
    this._register(this.channel.listen("onUninstallExtension")((e) => this.onUninstallExtensionEvent({ ...e, profileLocation: URI.revive(e.profileLocation) })));
    this._register(this.channel.listen("onDidUninstallExtension")((e) => this.onDidUninstallExtensionEvent({ ...e, profileLocation: URI.revive(e.profileLocation) })));
    this._register(this.channel.listen("onDidUpdateExtensionMetadata")((e) => this.onDidUpdateExtensionMetadataEvent({ profileLocation: URI.revive(e.profileLocation), local: transformIncomingExtension(e.local, null) })));
  }
  get onInstallExtension() {
    return this._onInstallExtension.event;
  }
  get onDidInstallExtensions() {
    return this._onDidInstallExtensions.event;
  }
  get onUninstallExtension() {
    return this._onUninstallExtension.event;
  }
  get onDidUninstallExtension() {
    return this._onDidUninstallExtension.event;
  }
  get onDidUpdateExtensionMetadata() {
    return this._onDidUpdateExtensionMetadata.event;
  }
  onInstallExtensionEvent(event) {
    this._onInstallExtension.fire(event);
  }
  onDidInstallExtensionsEvent(results) {
    this._onDidInstallExtensions.fire(results);
  }
  onUninstallExtensionEvent(event) {
    this._onUninstallExtension.fire(event);
  }
  onDidUninstallExtensionEvent(event) {
    this._onDidUninstallExtension.fire(event);
  }
  onDidUpdateExtensionMetadataEvent(event) {
    this._onDidUpdateExtensionMetadata.fire(event);
  }
  isUriComponents(obj) {
    if (!obj) {
      return false;
    }
    const thing = obj;
    return typeof thing?.path === "string" && typeof thing?.scheme === "string";
  }
  getTargetPlatform() {
    if (!this._targetPlatformPromise) {
      this._targetPlatformPromise = this.channel.call("getTargetPlatform");
    }
    return this._targetPlatformPromise;
  }
  zip(extension) {
    return Promise.resolve(this.channel.call("zip", [extension]).then((result) => URI.revive(result)));
  }
  install(vsix, options) {
    return Promise.resolve(this.channel.call("install", [vsix, options])).then((local) => transformIncomingExtension(local, null));
  }
  installFromLocation(location, profileLocation) {
    return Promise.resolve(this.channel.call("installFromLocation", [location, profileLocation])).then((local) => transformIncomingExtension(local, null));
  }
  async installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
    const result = await this.channel.call("installExtensionsFromProfile", [extensions, fromProfileLocation, toProfileLocation]);
    return result.map((local) => transformIncomingExtension(local, null));
  }
  getManifest(vsix) {
    return Promise.resolve(this.channel.call("getManifest", [vsix]));
  }
  installFromGallery(extension, installOptions) {
    return Promise.resolve(this.channel.call("installFromGallery", [extension, installOptions])).then((local) => transformIncomingExtension(local, null));
  }
  async installGalleryExtensions(extensions) {
    const results = await this.channel.call("installGalleryExtensions", [extensions]);
    return results.map((e) => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) }));
  }
  uninstall(extension, options) {
    if (extension.isWorkspaceScoped) {
      throw new Error("Cannot uninstall a workspace extension");
    }
    return Promise.resolve(this.channel.call("uninstall", [extension, options]));
  }
  uninstallExtensions(extensions) {
    if (extensions.some((e) => e.extension.isWorkspaceScoped)) {
      throw new Error("Cannot uninstall a workspace extension");
    }
    return Promise.resolve(this.channel.call("uninstallExtensions", [extensions]));
  }
  getInstalled(type = null, extensionsProfileResource, productVersion) {
    return Promise.resolve(this.channel.call("getInstalled", [type, extensionsProfileResource, productVersion, language])).then((extensions) => extensions.map((extension) => transformIncomingExtension(extension, null)));
  }
  updateMetadata(local, metadata, extensionsProfileResource) {
    return Promise.resolve(this.channel.call("updateMetadata", [local, metadata, extensionsProfileResource])).then((extension) => transformIncomingExtension(extension, null));
  }
  resetPinnedStateForAllUserExtensions(pinned) {
    return this.channel.call("resetPinnedStateForAllUserExtensions", [pinned]);
  }
  toggleApplicationScope(local, fromProfileLocation) {
    return this.channel.call("toggleApplicationScope", [local, fromProfileLocation]).then((extension) => transformIncomingExtension(extension, null));
  }
  copyExtensions(fromProfileLocation, toProfileLocation) {
    return this.channel.call("copyExtensions", [fromProfileLocation, toProfileLocation]);
  }
  getExtensionsControlManifest() {
    return Promise.resolve(this.channel.call("getExtensionsControlManifest"));
  }
  async download(extension, operation, donotVerifySignature) {
    const result = await this.channel.call("download", [extension, operation, donotVerifySignature]);
    return URI.revive(result);
  }
  async cleanUp() {
    return this.channel.call("cleanUp");
  }
  registerParticipant() {
    throw new Error("Not Supported");
  }
}
class ExtensionTipsChannel {
  constructor(service) {
    this.service = service;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listen(context, event) {
    throw new Error("Invalid listen");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call(context, command, args) {
    switch (command) {
      case "getConfigBasedTips":
        return this.service.getConfigBasedTips(URI.revive(args[0]));
      case "getImportantExecutableBasedTips":
        return this.service.getImportantExecutableBasedTips();
      case "getOtherExecutableBasedTips":
        return this.service.getOtherExecutableBasedTips();
    }
    throw new Error("Invalid call");
  }
}
export {
  ExtensionManagementChannel,
  ExtensionManagementChannelClient,
  ExtensionTipsChannel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZXh0ZW5zaW9uTWFuYWdlbWVudFxcY29tbW9uXFxleHRlbnNpb25NYW5hZ2VtZW50SXBjLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjbG9uZUFuZENoYW5nZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IERlZmF1bHRVUklUcmFuc2Zvcm1lciwgSVVSSVRyYW5zZm9ybWVyLCB0cmFuc2Zvcm1BbmRSZXZpdmVJbmNvbWluZ1VSSXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmlJcGMuanMnO1xuaW1wb3J0IHsgSUNoYW5uZWwsIElTZXJ2ZXJDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQge1xuXHRJRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvblRpcHNTZXJ2aWNlLCBJR2FsbGVyeUV4dGVuc2lvbiwgSUxvY2FsRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCwgSW5zdGFsbE9wdGlvbnMsXG5cdFVuaW5zdGFsbE9wdGlvbnMsIE1ldGFkYXRhLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50LCBJbnN0YWxsRXh0ZW5zaW9uRXZlbnQsIEluc3RhbGxFeHRlbnNpb25SZXN1bHQsXG5cdFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50LCBJbnN0YWxsT3BlcmF0aW9uLCBJbnN0YWxsRXh0ZW5zaW9uSW5mbywgSVByb2R1Y3RWZXJzaW9uLCBEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSwgVW5pbnN0YWxsRXh0ZW5zaW9uSW5mbyxcblx0SUFsbG93ZWRFeHRlbnNpb25zU2VydmljZVxufSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbk1hbmlmZXN0LCBUYXJnZXRQbGF0Zm9ybSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbW9udEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi9hYnN0cmFjdEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxhbmd1YWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRDb25uZWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRFbnZpcm9ubWVudC5qcyc7XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUluY29taW5nVVJJKHVyaTogVXJpQ29tcG9uZW50cywgdHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lciB8IG51bGwpOiBVUkk7XG5mdW5jdGlvbiB0cmFuc2Zvcm1JbmNvbWluZ1VSSSh1cmk6IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQsIHRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCBudWxsKTogVVJJIHwgdW5kZWZpbmVkO1xuZnVuY3Rpb24gdHJhbnNmb3JtSW5jb21pbmdVUkkodXJpOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkLCB0cmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB1cmkgPyBVUkkucmV2aXZlKHRyYW5zZm9ybWVyID8gdHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcodXJpKSA6IHVyaSkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU91dGdvaW5nVVJJKHVyaTogVVJJLCB0cmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCk6IFVSSSB7XG5cdHJldHVybiB0cmFuc2Zvcm1lciA/IHRyYW5zZm9ybWVyLnRyYW5zZm9ybU91dGdvaW5nVVJJKHVyaSkgOiB1cmk7XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCB0cmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCk6IElMb2NhbEV4dGVuc2lvbiB7XG5cdHRyYW5zZm9ybWVyID0gdHJhbnNmb3JtZXIgPyB0cmFuc2Zvcm1lciA6IERlZmF1bHRVUklUcmFuc2Zvcm1lcjtcblx0Y29uc3QgbWFuaWZlc3QgPSBleHRlbnNpb24ubWFuaWZlc3Q7XG5cdGNvbnN0IHRyYW5zZm9ybWVkID0gdHJhbnNmb3JtQW5kUmV2aXZlSW5jb21pbmdVUklzKHsgLi4uZXh0ZW5zaW9uLCAuLi57IG1hbmlmZXN0OiB1bmRlZmluZWQgfSB9LCB0cmFuc2Zvcm1lcik7XG5cdHJldHVybiB7IC4uLnRyYW5zZm9ybWVkLCAuLi57IG1hbmlmZXN0IH0gfTtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtSW5jb21pbmdPcHRpb25zPE8gZXh0ZW5kcyB7IHByb2ZpbGVMb2NhdGlvbj86IFVyaUNvbXBvbmVudHMgfT4ob3B0aW9uczogTyB8IHVuZGVmaW5lZCwgdHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lciB8IG51bGwpOiBPIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIG9wdGlvbnM/LnByb2ZpbGVMb2NhdGlvbiA/IHRyYW5zZm9ybUFuZFJldml2ZUluY29taW5nVVJJcyhvcHRpb25zLCB0cmFuc2Zvcm1lciA/PyBEZWZhdWx0VVJJVHJhbnNmb3JtZXIpIDogb3B0aW9ucztcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtT3V0Z29pbmdFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIHRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCBudWxsKTogSUxvY2FsRXh0ZW5zaW9uIHtcblx0cmV0dXJuIHRyYW5zZm9ybWVyID8gY2xvbmVBbmRDaGFuZ2UoZXh0ZW5zaW9uLCB2YWx1ZSA9PiB2YWx1ZSBpbnN0YW5jZW9mIFVSSSA/IHRyYW5zZm9ybWVyLnRyYW5zZm9ybU91dGdvaW5nVVJJKHZhbHVlKSA6IHVuZGVmaW5lZCkgOiBleHRlbnNpb247XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25NYW5hZ2VtZW50Q2hhbm5lbDxUQ29udGV4dCA9IFJlbW90ZUFnZW50Q29ubmVjdGlvbkNvbnRleHQgfCBzdHJpbmc+IGltcGxlbWVudHMgSVNlcnZlckNoYW5uZWw8VENvbnRleHQ+IHtcblxuXHRyZWFkb25seSBvbkluc3RhbGxFeHRlbnNpb246IEV2ZW50PEluc3RhbGxFeHRlbnNpb25FdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkSW5zdGFsbEV4dGVuc2lvbnM6IEV2ZW50PHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT47XG5cdHJlYWRvbmx5IG9uVW5pbnN0YWxsRXh0ZW5zaW9uOiBFdmVudDxVbmluc3RhbGxFeHRlbnNpb25FdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uOiBFdmVudDxEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE6IEV2ZW50PERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhPjtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgcHJpdmF0ZSBnZXRVcmlUcmFuc2Zvcm1lcjogKHJlcXVlc3RDb250ZXh0OiBUQ29udGV4dCkgPT4gSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCkge1xuXHRcdHRoaXMub25JbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuYnVmZmVyKHNlcnZpY2Uub25JbnN0YWxsRXh0ZW5zaW9uLCAnb25JbnN0YWxsRXh0ZW5zaW9uJywgdHJ1ZSk7XG5cdFx0dGhpcy5vbkRpZEluc3RhbGxFeHRlbnNpb25zID0gRXZlbnQuYnVmZmVyKHNlcnZpY2Uub25EaWRJbnN0YWxsRXh0ZW5zaW9ucywgJ29uRGlkSW5zdGFsbEV4dGVuc2lvbnMnLCB0cnVlKTtcblx0XHR0aGlzLm9uVW5pbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuYnVmZmVyKHNlcnZpY2Uub25Vbmluc3RhbGxFeHRlbnNpb24sICdvblVuaW5zdGFsbEV4dGVuc2lvbicsIHRydWUpO1xuXHRcdHRoaXMub25EaWRVbmluc3RhbGxFeHRlbnNpb24gPSBFdmVudC5idWZmZXIoc2VydmljZS5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiwgJ29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uJywgdHJ1ZSk7XG5cdFx0dGhpcy5vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhID0gRXZlbnQuYnVmZmVyKHNlcnZpY2Uub25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSwgJ29uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEnLCB0cnVlKTtcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdGxpc3Rlbihjb250ZXh0OiBhbnksIGV2ZW50OiBzdHJpbmcpOiBFdmVudDxhbnk+IHtcblx0XHRjb25zdCB1cmlUcmFuc2Zvcm1lciA9IHRoaXMuZ2V0VXJpVHJhbnNmb3JtZXIoY29udGV4dCk7XG5cdFx0c3dpdGNoIChldmVudCkge1xuXHRcdFx0Y2FzZSAnb25JbnN0YWxsRXh0ZW5zaW9uJzoge1xuXHRcdFx0XHRyZXR1cm4gRXZlbnQubWFwPEluc3RhbGxFeHRlbnNpb25FdmVudCwgSW5zdGFsbEV4dGVuc2lvbkV2ZW50Pih0aGlzLm9uSW5zdGFsbEV4dGVuc2lvbiwgZSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdC4uLmUsXG5cdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IGUucHJvZmlsZUxvY2F0aW9uID8gdHJhbnNmb3JtT3V0Z29pbmdVUkkoZS5wcm9maWxlTG9jYXRpb24sIHVyaVRyYW5zZm9ybWVyKSA6IGUucHJvZmlsZUxvY2F0aW9uXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdvbkRpZEluc3RhbGxFeHRlbnNpb25zJzoge1xuXHRcdFx0XHRyZXR1cm4gRXZlbnQubWFwPHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXSwgcmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPih0aGlzLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMsIHJlc3VsdHMgPT5cblx0XHRcdFx0XHRyZXN1bHRzLm1hcChpID0+ICh7XG5cdFx0XHRcdFx0XHQuLi5pLFxuXHRcdFx0XHRcdFx0bG9jYWw6IGkubG9jYWwgPyB0cmFuc2Zvcm1PdXRnb2luZ0V4dGVuc2lvbihpLmxvY2FsLCB1cmlUcmFuc2Zvcm1lcikgOiBpLmxvY2FsLFxuXHRcdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiBpLnByb2ZpbGVMb2NhdGlvbiA/IHRyYW5zZm9ybU91dGdvaW5nVVJJKGkucHJvZmlsZUxvY2F0aW9uLCB1cmlUcmFuc2Zvcm1lcikgOiBpLnByb2ZpbGVMb2NhdGlvblxuXHRcdFx0XHRcdH0pKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdvblVuaW5zdGFsbEV4dGVuc2lvbic6IHtcblx0XHRcdFx0cmV0dXJuIEV2ZW50Lm1hcDxVbmluc3RhbGxFeHRlbnNpb25FdmVudCwgVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+KHRoaXMub25Vbmluc3RhbGxFeHRlbnNpb24sIGUgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHQuLi5lLFxuXHRcdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiBlLnByb2ZpbGVMb2NhdGlvbiA/IHRyYW5zZm9ybU91dGdvaW5nVVJJKGUucHJvZmlsZUxvY2F0aW9uLCB1cmlUcmFuc2Zvcm1lcikgOiBlLnByb2ZpbGVMb2NhdGlvblxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnb25EaWRVbmluc3RhbGxFeHRlbnNpb24nOiB7XG5cdFx0XHRcdHJldHVybiBFdmVudC5tYXA8RGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQsIERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50Pih0aGlzLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLCBlID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Li4uZSxcblx0XHRcdFx0XHRcdHByb2ZpbGVMb2NhdGlvbjogZS5wcm9maWxlTG9jYXRpb24gPyB0cmFuc2Zvcm1PdXRnb2luZ1VSSShlLnByb2ZpbGVMb2NhdGlvbiwgdXJpVHJhbnNmb3JtZXIpIDogZS5wcm9maWxlTG9jYXRpb25cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ29uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEnOiB7XG5cdFx0XHRcdHJldHVybiBFdmVudC5tYXA8RGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEsIERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhPih0aGlzLm9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEsIGUgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsb2NhbDogdHJhbnNmb3JtT3V0Z29pbmdFeHRlbnNpb24oZS5sb2NhbCwgdXJpVHJhbnNmb3JtZXIpLFxuXHRcdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiB0cmFuc2Zvcm1PdXRnb2luZ1VSSShlLnByb2ZpbGVMb2NhdGlvbiwgdXJpVHJhbnNmb3JtZXIpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxpc3RlbicpO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0YXN5bmMgY2FsbChjb250ZXh0OiBhbnksIGNvbW1hbmQ6IHN0cmluZywgYXJncz86IGFueSk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgdXJpVHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lciB8IG51bGwgPSB0aGlzLmdldFVyaVRyYW5zZm9ybWVyKGNvbnRleHQpO1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSAnemlwJzoge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSB0cmFuc2Zvcm1JbmNvbWluZ0V4dGVuc2lvbihhcmdzWzBdLCB1cmlUcmFuc2Zvcm1lcik7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IGF3YWl0IHRoaXMuc2VydmljZS56aXAoZXh0ZW5zaW9uKTtcblx0XHRcdFx0cmV0dXJuIHRyYW5zZm9ybU91dGdvaW5nVVJJKHVyaSwgdXJpVHJhbnNmb3JtZXIpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaW5zdGFsbCc6IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VydmljZS5pbnN0YWxsKHRyYW5zZm9ybUluY29taW5nVVJJKGFyZ3NbMF0sIHVyaVRyYW5zZm9ybWVyKSwgdHJhbnNmb3JtSW5jb21pbmdPcHRpb25zKGFyZ3NbMV0sIHVyaVRyYW5zZm9ybWVyKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdpbnN0YWxsRnJvbUxvY2F0aW9uJzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmluc3RhbGxGcm9tTG9jYXRpb24odHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1swXSwgdXJpVHJhbnNmb3JtZXIpLCB0cmFuc2Zvcm1JbmNvbWluZ1VSSShhcmdzWzFdLCB1cmlUcmFuc2Zvcm1lcikpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaW5zdGFsbEV4dGVuc2lvbnNGcm9tUHJvZmlsZSc6IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VydmljZS5pbnN0YWxsRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKGFyZ3NbMF0sIHRyYW5zZm9ybUluY29taW5nVVJJKGFyZ3NbMV0sIHVyaVRyYW5zZm9ybWVyKSwgdHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1syXSwgdXJpVHJhbnNmb3JtZXIpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2dldE1hbmlmZXN0Jzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmdldE1hbmlmZXN0KHRyYW5zZm9ybUluY29taW5nVVJJKGFyZ3NbMF0sIHVyaVRyYW5zZm9ybWVyKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdnZXRUYXJnZXRQbGF0Zm9ybSc6IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VydmljZS5nZXRUYXJnZXRQbGF0Zm9ybSgpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaW5zdGFsbEZyb21HYWxsZXJ5Jzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShhcmdzWzBdLCB0cmFuc2Zvcm1JbmNvbWluZ09wdGlvbnMoYXJnc1sxXSwgdXJpVHJhbnNmb3JtZXIpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2luc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyc6IHtcblx0XHRcdFx0Y29uc3QgYXJnOiBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdID0gYXJnc1swXTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VydmljZS5pbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoYXJnLm1hcCgoeyBleHRlbnNpb24sIG9wdGlvbnMgfSkgPT4gKHsgZXh0ZW5zaW9uLCBvcHRpb25zOiB0cmFuc2Zvcm1JbmNvbWluZ09wdGlvbnMob3B0aW9ucywgdXJpVHJhbnNmb3JtZXIpID8/IHt9IH0pKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICd1bmluc3RhbGwnOiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlcnZpY2UudW5pbnN0YWxsKHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGFyZ3NbMF0sIHVyaVRyYW5zZm9ybWVyKSwgdHJhbnNmb3JtSW5jb21pbmdPcHRpb25zKGFyZ3NbMV0sIHVyaVRyYW5zZm9ybWVyKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICd1bmluc3RhbGxFeHRlbnNpb25zJzoge1xuXHRcdFx0XHRjb25zdCBhcmc6IFVuaW5zdGFsbEV4dGVuc2lvbkluZm9bXSA9IGFyZ3NbMF07XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlcnZpY2UudW5pbnN0YWxsRXh0ZW5zaW9ucyhhcmcubWFwKCh7IGV4dGVuc2lvbiwgb3B0aW9ucyB9KSA9PiAoeyBleHRlbnNpb246IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGV4dGVuc2lvbiwgdXJpVHJhbnNmb3JtZXIpLCBvcHRpb25zOiB0cmFuc2Zvcm1JbmNvbWluZ09wdGlvbnMob3B0aW9ucywgdXJpVHJhbnNmb3JtZXIpIH0pKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdnZXRJbnN0YWxsZWQnOiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLnNlcnZpY2UuZ2V0SW5zdGFsbGVkKGFyZ3NbMF0sIHRyYW5zZm9ybUluY29taW5nVVJJKGFyZ3NbMV0sIHVyaVRyYW5zZm9ybWVyKSwgYXJnc1syXSwgYXJnc1szXSk7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb25zLm1hcChlID0+IHRyYW5zZm9ybU91dGdvaW5nRXh0ZW5zaW9uKGUsIHVyaVRyYW5zZm9ybWVyKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICd0b2dnbGVBcHBsaWNhdGlvblNjb3BlJzoge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLnNlcnZpY2UudG9nZ2xlQXBwbGljYXRpb25TY29wZSh0cmFuc2Zvcm1JbmNvbWluZ0V4dGVuc2lvbihhcmdzWzBdLCB1cmlUcmFuc2Zvcm1lciksIHRyYW5zZm9ybUluY29taW5nVVJJKGFyZ3NbMV0sIHVyaVRyYW5zZm9ybWVyKSk7XG5cdFx0XHRcdHJldHVybiB0cmFuc2Zvcm1PdXRnb2luZ0V4dGVuc2lvbihleHRlbnNpb24sIHVyaVRyYW5zZm9ybWVyKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2NvcHlFeHRlbnNpb25zJzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmNvcHlFeHRlbnNpb25zKHRyYW5zZm9ybUluY29taW5nVVJJKGFyZ3NbMF0sIHVyaVRyYW5zZm9ybWVyKSwgdHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1sxXSwgdXJpVHJhbnNmb3JtZXIpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3VwZGF0ZU1ldGFkYXRhJzoge1xuXHRcdFx0XHRjb25zdCBlID0gYXdhaXQgdGhpcy5zZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGFyZ3NbMF0sIHVyaVRyYW5zZm9ybWVyKSwgYXJnc1sxXSwgdHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1syXSwgdXJpVHJhbnNmb3JtZXIpKTtcblx0XHRcdFx0cmV0dXJuIHRyYW5zZm9ybU91dGdvaW5nRXh0ZW5zaW9uKGUsIHVyaVRyYW5zZm9ybWVyKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Jlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyc6IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VydmljZS5yZXNldFBpbm5lZFN0YXRlRm9yQWxsVXNlckV4dGVuc2lvbnMoYXJnc1swXSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdnZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0Jzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2Rvd25sb2FkJzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmRvd25sb2FkKGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnY2xlYW5VcCc6IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VydmljZS5jbGVhblVwKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNhbGwnKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEV4dGVuc2lvbkV2ZW50UmVzdWx0IHtcblx0cmVhZG9ubHkgcHJvZmlsZUxvY2F0aW9uOiBVUkk7XG5cdHJlYWRvbmx5IGxvY2FsPzogSUxvY2FsRXh0ZW5zaW9uO1xuXHRyZWFkb25seSBhcHBsaWNhdGlvblNjb3BlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25NYW5hZ2VtZW50Q2hhbm5lbENsaWVudCBleHRlbmRzIENvbW1vbnRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkluc3RhbGxFeHRlbnNpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+KCkpO1xuXHRnZXQgb25JbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gdGhpcy5fb25JbnN0YWxsRXh0ZW5zaW9uLmV2ZW50OyB9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZEluc3RhbGxFeHRlbnNpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPigpKTtcblx0Z2V0IG9uRGlkSW5zdGFsbEV4dGVuc2lvbnMoKSB7IHJldHVybiB0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmV2ZW50OyB9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vblVuaW5zdGFsbEV4dGVuc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50PigpKTtcblx0Z2V0IG9uVW5pbnN0YWxsRXh0ZW5zaW9uKCkgeyByZXR1cm4gdGhpcy5fb25Vbmluc3RhbGxFeHRlbnNpb24uZXZlbnQ7IH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+KCkpO1xuXHRnZXQgb25EaWRVbmluc3RhbGxFeHRlbnNpb24oKSB7IHJldHVybiB0aGlzLl9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbi5ldmVudDsgfVxuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhPigpKTtcblx0Z2V0IG9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEoKSB7IHJldHVybiB0aGlzLl9vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjaGFubmVsOiBJQ2hhbm5lbCxcblx0XHRwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdGFsbG93ZWRFeHRlbnNpb25zU2VydmljZTogSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIocHJvZHVjdFNlcnZpY2UsIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGFubmVsLmxpc3RlbjxJbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+KCdvbkluc3RhbGxFeHRlbnNpb24nKShlID0+IHRoaXMub25JbnN0YWxsRXh0ZW5zaW9uRXZlbnQoeyAuLi5lLCBzb3VyY2U6IHRoaXMuaXNVcmlDb21wb25lbnRzKGUuc291cmNlKSA/IFVSSS5yZXZpdmUoZS5zb3VyY2UpIDogZS5zb3VyY2UsIHByb2ZpbGVMb2NhdGlvbjogVVJJLnJldml2ZShlLnByb2ZpbGVMb2NhdGlvbikgfSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYW5uZWwubGlzdGVuPHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4oJ29uRGlkSW5zdGFsbEV4dGVuc2lvbnMnKShyZXN1bHRzID0+IHRoaXMub25EaWRJbnN0YWxsRXh0ZW5zaW9uc0V2ZW50KHJlc3VsdHMubWFwKGUgPT4gKHsgLi4uZSwgbG9jYWw6IGUubG9jYWwgPyB0cmFuc2Zvcm1JbmNvbWluZ0V4dGVuc2lvbihlLmxvY2FsLCBudWxsKSA6IGUubG9jYWwsIHNvdXJjZTogdGhpcy5pc1VyaUNvbXBvbmVudHMoZS5zb3VyY2UpID8gVVJJLnJldml2ZShlLnNvdXJjZSkgOiBlLnNvdXJjZSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkucmV2aXZlKGUucHJvZmlsZUxvY2F0aW9uKSB9KSkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGFubmVsLmxpc3RlbjxVbmluc3RhbGxFeHRlbnNpb25FdmVudD4oJ29uVW5pbnN0YWxsRXh0ZW5zaW9uJykoZSA9PiB0aGlzLm9uVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQoeyAuLi5lLCBwcm9maWxlTG9jYXRpb246IFVSSS5yZXZpdmUoZS5wcm9maWxlTG9jYXRpb24pIH0pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGFubmVsLmxpc3RlbjxEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudD4oJ29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uJykoZSA9PiB0aGlzLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQoeyAuLi5lLCBwcm9maWxlTG9jYXRpb246IFVSSS5yZXZpdmUoZS5wcm9maWxlTG9jYXRpb24pIH0pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGFubmVsLmxpc3RlbjxEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YT4oJ29uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEnKShlID0+IHRoaXMub25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YUV2ZW50KHsgcHJvZmlsZUxvY2F0aW9uOiBVUkkucmV2aXZlKGUucHJvZmlsZUxvY2F0aW9uKSwgbG9jYWw6IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGUubG9jYWwsIG51bGwpIH0pKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25JbnN0YWxsRXh0ZW5zaW9uRXZlbnQoZXZlbnQ6IEluc3RhbGxFeHRlbnNpb25FdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX29uSW5zdGFsbEV4dGVuc2lvbi5maXJlKGV2ZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkRpZEluc3RhbGxFeHRlbnNpb25zRXZlbnQocmVzdWx0czogcmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRJbnN0YWxsRXh0ZW5zaW9ucy5maXJlKHJlc3VsdHMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQoZXZlbnQ6IFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fb25Vbmluc3RhbGxFeHRlbnNpb24uZmlyZShldmVudCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25EaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudChldmVudDogRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbi5maXJlKGV2ZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhRXZlbnQoZXZlbnQ6IERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YS5maXJlKGV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgaXNVcmlDb21wb25lbnRzKG9iajogdW5rbm93bik6IG9iaiBpcyBVcmlDb21wb25lbnRzIHtcblx0XHRpZiAoIW9iaikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCB0aGluZyA9IG9iaiBhcyBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkO1xuXHRcdHJldHVybiB0eXBlb2YgdGhpbmc/LnBhdGggPT09ICdzdHJpbmcnICYmXG5cdFx0XHR0eXBlb2YgdGhpbmc/LnNjaGVtZSA9PT0gJ3N0cmluZyc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3RhcmdldFBsYXRmb3JtUHJvbWlzZTogUHJvbWlzZTxUYXJnZXRQbGF0Zm9ybT4gfCB1bmRlZmluZWQ7XG5cdGdldFRhcmdldFBsYXRmb3JtKCk6IFByb21pc2U8VGFyZ2V0UGxhdGZvcm0+IHtcblx0XHRpZiAoIXRoaXMuX3RhcmdldFBsYXRmb3JtUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fdGFyZ2V0UGxhdGZvcm1Qcm9taXNlID0gdGhpcy5jaGFubmVsLmNhbGw8VGFyZ2V0UGxhdGZvcm0+KCdnZXRUYXJnZXRQbGF0Zm9ybScpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGFyZ2V0UGxhdGZvcm1Qcm9taXNlO1xuXHR9XG5cblx0emlwKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTxVUkk+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY2hhbm5lbC5jYWxsPFVyaUNvbXBvbmVudHM+KCd6aXAnLCBbZXh0ZW5zaW9uXSkudGhlbihyZXN1bHQgPT4gVVJJLnJldml2ZShyZXN1bHQpKSk7XG5cdH1cblxuXHRpbnN0YWxsKHZzaXg6IFVSSSwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY2hhbm5lbC5jYWxsPElMb2NhbEV4dGVuc2lvbj4oJ2luc3RhbGwnLCBbdnNpeCwgb3B0aW9uc10pKS50aGVuKGxvY2FsID0+IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGxvY2FsLCBudWxsKSk7XG5cdH1cblxuXHRpbnN0YWxsRnJvbUxvY2F0aW9uKGxvY2F0aW9uOiBVUkksIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY2hhbm5lbC5jYWxsPElMb2NhbEV4dGVuc2lvbj4oJ2luc3RhbGxGcm9tTG9jYXRpb24nLCBbbG9jYXRpb24sIHByb2ZpbGVMb2NhdGlvbl0pKS50aGVuKGxvY2FsID0+IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGxvY2FsLCBudWxsKSk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsRXh0ZW5zaW9uc0Zyb21Qcm9maWxlKGV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10sIGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNoYW5uZWwuY2FsbDxJTG9jYWxFeHRlbnNpb25bXT4oJ2luc3RhbGxFeHRlbnNpb25zRnJvbVByb2ZpbGUnLCBbZXh0ZW5zaW9ucywgZnJvbVByb2ZpbGVMb2NhdGlvbiwgdG9Qcm9maWxlTG9jYXRpb25dKTtcblx0XHRyZXR1cm4gcmVzdWx0Lm1hcChsb2NhbCA9PiB0cmFuc2Zvcm1JbmNvbWluZ0V4dGVuc2lvbihsb2NhbCwgbnVsbCkpO1xuXHR9XG5cblx0Z2V0TWFuaWZlc3QodnNpeDogVVJJKTogUHJvbWlzZTxJRXh0ZW5zaW9uTWFuaWZlc3Q+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY2hhbm5lbC5jYWxsPElFeHRlbnNpb25NYW5pZmVzdD4oJ2dldE1hbmlmZXN0JywgW3ZzaXhdKSk7XG5cdH1cblxuXHRpbnN0YWxsRnJvbUdhbGxlcnkoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgaW5zdGFsbE9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmNoYW5uZWwuY2FsbDxJTG9jYWxFeHRlbnNpb24+KCdpbnN0YWxsRnJvbUdhbGxlcnknLCBbZXh0ZW5zaW9uLCBpbnN0YWxsT3B0aW9uc10pKS50aGVuKGxvY2FsID0+IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGxvY2FsLCBudWxsKSk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsR2FsbGVyeUV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8SW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuY2hhbm5lbC5jYWxsPEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4oJ2luc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucycsIFtleHRlbnNpb25zXSk7XG5cdFx0cmV0dXJuIHJlc3VsdHMubWFwKGUgPT4gKHsgLi4uZSwgbG9jYWw6IGUubG9jYWwgPyB0cmFuc2Zvcm1JbmNvbWluZ0V4dGVuc2lvbihlLmxvY2FsLCBudWxsKSA6IGUubG9jYWwsIHNvdXJjZTogdGhpcy5pc1VyaUNvbXBvbmVudHMoZS5zb3VyY2UpID8gVVJJLnJldml2ZShlLnNvdXJjZSkgOiBlLnNvdXJjZSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkucmV2aXZlKGUucHJvZmlsZUxvY2F0aW9uKSB9KSk7XG5cdH1cblxuXHR1bmluc3RhbGwoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIG9wdGlvbnM/OiBVbmluc3RhbGxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgdW5pbnN0YWxsIGEgd29ya3NwYWNlIGV4dGVuc2lvbicpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY2hhbm5lbC5jYWxsPHZvaWQ+KCd1bmluc3RhbGwnLCBbZXh0ZW5zaW9uLCBvcHRpb25zXSkpO1xuXHR9XG5cblx0dW5pbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBVbmluc3RhbGxFeHRlbnNpb25JbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZXh0ZW5zaW9ucy5zb21lKGUgPT4gZS5leHRlbnNpb24uaXNXb3Jrc3BhY2VTY29wZWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1bmluc3RhbGwgYSB3b3Jrc3BhY2UgZXh0ZW5zaW9uJyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5jaGFubmVsLmNhbGw8dm9pZD4oJ3VuaW5zdGFsbEV4dGVuc2lvbnMnLCBbZXh0ZW5zaW9uc10pKTtcblxuXHR9XG5cblx0Z2V0SW5zdGFsbGVkKHR5cGU6IEV4dGVuc2lvblR5cGUgfCBudWxsID0gbnVsbCwgZXh0ZW5zaW9uc1Byb2ZpbGVSZXNvdXJjZT86IFVSSSwgcHJvZHVjdFZlcnNpb24/OiBJUHJvZHVjdFZlcnNpb24pOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbltdPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmNoYW5uZWwuY2FsbDxJTG9jYWxFeHRlbnNpb25bXT4oJ2dldEluc3RhbGxlZCcsIFt0eXBlLCBleHRlbnNpb25zUHJvZmlsZVJlc291cmNlLCBwcm9kdWN0VmVyc2lvbiwgbGFuZ3VhZ2VdKSlcblx0XHRcdC50aGVuKGV4dGVuc2lvbnMgPT4gZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGV4dGVuc2lvbiwgbnVsbCkpKTtcblx0fVxuXG5cdHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxFeHRlbnNpb24sIG1ldGFkYXRhOiBQYXJ0aWFsPE1ldGFkYXRhPiwgZXh0ZW5zaW9uc1Byb2ZpbGVSZXNvdXJjZT86IFVSSSk6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmNoYW5uZWwuY2FsbDxJTG9jYWxFeHRlbnNpb24+KCd1cGRhdGVNZXRhZGF0YScsIFtsb2NhbCwgbWV0YWRhdGEsIGV4dGVuc2lvbnNQcm9maWxlUmVzb3VyY2VdKSlcblx0XHRcdC50aGVuKGV4dGVuc2lvbiA9PiB0cmFuc2Zvcm1JbmNvbWluZ0V4dGVuc2lvbihleHRlbnNpb24sIG51bGwpKTtcblx0fVxuXG5cdHJlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyhwaW5uZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVsLmNhbGw8dm9pZD4oJ3Jlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucycsIFtwaW5uZWRdKTtcblx0fVxuXG5cdHRvZ2dsZUFwcGxpY2F0aW9uU2NvcGUobG9jYWw6IElMb2NhbEV4dGVuc2lvbiwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVsLmNhbGw8SUxvY2FsRXh0ZW5zaW9uPigndG9nZ2xlQXBwbGljYXRpb25TY29wZScsIFtsb2NhbCwgZnJvbVByb2ZpbGVMb2NhdGlvbl0pXG5cdFx0XHQudGhlbihleHRlbnNpb24gPT4gdHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24oZXh0ZW5zaW9uLCBudWxsKSk7XG5cdH1cblxuXHRjb3B5RXh0ZW5zaW9ucyhmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkksIHRvUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVsLmNhbGw8dm9pZD4oJ2NvcHlFeHRlbnNpb25zJywgW2Zyb21Qcm9maWxlTG9jYXRpb24sIHRvUHJvZmlsZUxvY2F0aW9uXSk7XG5cdH1cblxuXHRnZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0KCk6IFByb21pc2U8SUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY2hhbm5lbC5jYWxsPElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0PignZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCcpKTtcblx0fVxuXG5cdGFzeW5jIGRvd25sb2FkKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbiwgZG9ub3RWZXJpZnlTaWduYXR1cmU6IGJvb2xlYW4pOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2hhbm5lbC5jYWxsPFVyaUNvbXBvbmVudHM+KCdkb3dubG9hZCcsIFtleHRlbnNpb24sIG9wZXJhdGlvbiwgZG9ub3RWZXJpZnlTaWduYXR1cmVdKTtcblx0XHRyZXR1cm4gVVJJLnJldml2ZShyZXN1bHQpO1xuXHR9XG5cblx0YXN5bmMgY2xlYW5VcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jaGFubmVsLmNhbGwoJ2NsZWFuVXAnKTtcblx0fVxuXG5cdHJlZ2lzdGVyUGFydGljaXBhbnQoKSB7IHRocm93IG5ldyBFcnJvcignTm90IFN1cHBvcnRlZCcpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25UaXBzQ2hhbm5lbCBpbXBsZW1lbnRzIElTZXJ2ZXJDaGFubmVsIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHNlcnZpY2U6IElFeHRlbnNpb25UaXBzU2VydmljZSkge1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0bGlzdGVuKGNvbnRleHQ6IGFueSwgZXZlbnQ6IHN0cmluZyk6IEV2ZW50PGFueT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsaXN0ZW4nKTtcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdGNhbGwoY29udGV4dDogYW55LCBjb21tYW5kOiBzdHJpbmcsIGFyZ3M/OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuXHRcdHN3aXRjaCAoY29tbWFuZCkge1xuXHRcdFx0Y2FzZSAnZ2V0Q29uZmlnQmFzZWRUaXBzJzogcmV0dXJuIHRoaXMuc2VydmljZS5nZXRDb25maWdCYXNlZFRpcHMoVVJJLnJldml2ZShhcmdzWzBdKSk7XG5cdFx0XHRjYXNlICdnZXRJbXBvcnRhbnRFeGVjdXRhYmxlQmFzZWRUaXBzJzogcmV0dXJuIHRoaXMuc2VydmljZS5nZXRJbXBvcnRhbnRFeGVjdXRhYmxlQmFzZWRUaXBzKCk7XG5cdFx0XHRjYXNlICdnZXRPdGhlckV4ZWN1dGFibGVCYXNlZFRpcHMnOiByZXR1cm4gdGhpcy5zZXJ2aWNlLmdldE90aGVyRXhlY3V0YWJsZUJhc2VkVGlwcygpO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjYWxsJyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyx1QkFBd0Msc0NBQXNDO0FBVXZGLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsZ0JBQWdCO0FBS3pCLFNBQVMscUJBQXFCLEtBQWdDLGFBQXNEO0FBQ25ILFNBQU8sTUFBTSxJQUFJLE9BQU8sY0FBYyxZQUFZLGtCQUFrQixHQUFHLElBQUksR0FBRyxJQUFJO0FBQ25GO0FBRUEsU0FBUyxxQkFBcUIsS0FBVSxhQUEwQztBQUNqRixTQUFPLGNBQWMsWUFBWSxxQkFBcUIsR0FBRyxJQUFJO0FBQzlEO0FBRUEsU0FBUywyQkFBMkIsV0FBNEIsYUFBc0Q7QUFDckgsZ0JBQWMsY0FBYyxjQUFjO0FBQzFDLFFBQU0sV0FBVyxVQUFVO0FBQzNCLFFBQU0sY0FBYywrQkFBK0IsRUFBRSxHQUFHLFdBQVcsR0FBRyxFQUFFLFVBQVUsT0FBVSxFQUFFLEdBQUcsV0FBVztBQUM1RyxTQUFPLEVBQUUsR0FBRyxhQUFhLEdBQUcsRUFBRSxTQUFTLEVBQUU7QUFDMUM7QUFFQSxTQUFTLHlCQUF3RSxTQUF3QixhQUFvRDtBQUM1SixTQUFPLFNBQVMsa0JBQWtCLCtCQUErQixTQUFTLGVBQWUscUJBQXFCLElBQUk7QUFDbkg7QUFFQSxTQUFTLDJCQUEyQixXQUE0QixhQUFzRDtBQUNySCxTQUFPLGNBQWMsZUFBZSxXQUFXLFdBQVMsaUJBQWlCLE1BQU0sWUFBWSxxQkFBcUIsS0FBSyxJQUFJLE1BQVMsSUFBSTtBQUN2STtBQUVPLE1BQU0sMkJBQWlIO0FBQUEsRUFRN0gsWUFBb0IsU0FBOEMsbUJBQXlFO0FBQXZIO0FBQThDO0FBQ2pFLFNBQUsscUJBQXFCLE1BQU0sT0FBTyxRQUFRLG9CQUFvQixzQkFBc0IsSUFBSTtBQUM3RixTQUFLLHlCQUF5QixNQUFNLE9BQU8sUUFBUSx3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
