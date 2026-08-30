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
import { OperatingSystem } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
const ITunnelService = createDecorator("tunnelService");
const ISharedTunnelsService = createDecorator("sharedTunnelsService");
function isRemoteTunnel(something) {
  const asTunnel = something;
  return !!(asTunnel.tunnelRemotePort && asTunnel.tunnelRemoteHost && asTunnel.localAddress && asTunnel.privacy && asTunnel.dispose);
}
var TunnelProtocol = /* @__PURE__ */ ((TunnelProtocol2) => {
  TunnelProtocol2["Http"] = "http";
  TunnelProtocol2["Https"] = "https";
  return TunnelProtocol2;
})(TunnelProtocol || {});
var TunnelPrivacyId = /* @__PURE__ */ ((TunnelPrivacyId2) => {
  TunnelPrivacyId2["ConstantPrivate"] = "constantPrivate";
  TunnelPrivacyId2["Private"] = "private";
  TunnelPrivacyId2["Public"] = "public";
  return TunnelPrivacyId2;
})(TunnelPrivacyId || {});
function isTunnelProvider(addressOrTunnelProvider) {
  return !!addressOrTunnelProvider.forwardPort;
}
var ProvidedOnAutoForward = /* @__PURE__ */ ((ProvidedOnAutoForward2) => {
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["Notify"] = 1] = "Notify";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["OpenBrowser"] = 2] = "OpenBrowser";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["OpenPreview"] = 3] = "OpenPreview";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["Silent"] = 4] = "Silent";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["Ignore"] = 5] = "Ignore";
  ProvidedOnAutoForward2[ProvidedOnAutoForward2["OpenBrowserOnce"] = 6] = "OpenBrowserOnce";
  return ProvidedOnAutoForward2;
})(ProvidedOnAutoForward || {});
function extractLocalHostUriMetaDataForPortMapping(uri) {
  if (uri.scheme !== "http" && uri.scheme !== "https") {
    return void 0;
  }
  const localhostMatch = /^(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)$/.exec(uri.authority);
  if (!localhostMatch) {
    return void 0;
  }
  return {
    address: localhostMatch[1],
    port: +localhostMatch[2]
  };
}
function extractQueryLocalHostUriMetaDataForPortMapping(uri) {
  if (uri.scheme !== "http" && uri.scheme !== "https" || !uri.query) {
    return void 0;
  }
  const keyvalues = uri.query.split("&");
  for (const keyvalue of keyvalues) {
    const value = keyvalue.split("=")[1];
    if (/^https?:/.exec(value)) {
      const result = extractLocalHostUriMetaDataForPortMapping(URI.parse(value));
      if (result) {
        return result;
      }
    }
  }
  return void 0;
}
const LOCALHOST_ADDRESSES = ["localhost", "127.0.0.1", "0:0:0:0:0:0:0:1", "::1"];
function isLocalhost(host) {
  return LOCALHOST_ADDRESSES.indexOf(host) >= 0;
}
const ALL_INTERFACES_ADDRESSES = ["0.0.0.0", "0:0:0:0:0:0:0:0", "::"];
function isAllInterfaces(host) {
  return ALL_INTERFACES_ADDRESSES.indexOf(host) >= 0;
}
function isPortPrivileged(port, host, os, osRelease) {
  if (os === OperatingSystem.Windows) {
    return false;
  }
  if (os === OperatingSystem.Macintosh) {
    if (isAllInterfaces(host)) {
      const osVersion = /(\d+)\.(\d+)\.(\d+)/g.exec(osRelease);
      if (osVersion?.length === 4) {
        const major = parseInt(osVersion[1]);
        if (major >= 18) {
          return false;
        }
      }
    }
  }
  return port < 1024;
}
class DisposableTunnel {
  constructor(remoteAddress, localAddress, _dispose) {
    this.remoteAddress = remoteAddress;
    this.localAddress = localAddress;
    this._dispose = _dispose;
    this._onDispose = new Emitter();
    this.onDidDispose = this._onDispose.event;
  }
  dispose() {
    this._onDispose.fire();
    this._onDispose.dispose();
    return this._dispose();
  }
}
let AbstractTunnelService = class extends Disposable {
  constructor(logService, configurationService) {
    super();
    this.logService = logService;
    this.configurationService = configurationService;
    this._onTunnelOpened = this._register(new Emitter());
    this.onTunnelOpened = this._onTunnelOpened.event;
    this._onTunnelClosed = this._register(new Emitter());
    this.onTunnelClosed = this._onTunnelClosed.event;
    this._onAddedTunnelProvider = this._register(new Emitter());
    this.onAddedTunnelProvider = this._onAddedTunnelProvider.event;
    this._tunnels = /* @__PURE__ */ new Map();
    this._canElevate = false;
    this._canChangeProtocol = true;
    this._privacyOptions = [];
    this._factoryInProgress = /* @__PURE__ */ new Set();
  }
  get hasTunnelProvider() {
    return !!this._tunnelProvider;
  }
  get defaultTunnelHost() {
    const settingValue = this.configurationService.getValue("remote.localPortHost");
    return !settingValue || settingValue === "localhost" ? "127.0.0.1" : "0.0.0.0";
  }
  setTunnelProvider(provider) {
    this._tunnelProvider = provider;
    if (!provider) {
      this._canElevate = false;
      this._privacyOptions = [];
      this._onAddedTunnelProvider.fire();
      return {
        dispose: () => {
        }
      };
    }
    this._onAddedTunnelProvider.fire();
    return {
      dispose: () => {
        this._tunnelProvider = void 0;
        this._canElevate = false;
        this._privacyOptions = [];
      }
    };
  }
  setTunnelFeatures(features) {
    this._canElevate = features.elevation;
    this._privacyOptions = features.privacyOptions;
    this._canChangeProtocol = features.protocol;
  }
  get canChangeProtocol() {
    return this._canChangeProtocol;
  }
  get canElevate() {
    return this._canElevate;
  }
  get canChangePrivacy() {
    return this._privacyOptions.length > 0;
  }
  get privacyOptions() {
    return this._privacyOptions;
  }
  get tunnels() {
    return this.getTunnels();
  }
  async getTunnels() {
    const tunnels = [];
    const tunnelArray = Array.from(this._tunnels.values());
    for (const portMap of tunnelArray) {
      const portArray = Array.from(portMap.values());
      for (const x of portArray) {
        const tunnelValue = await x.value;
        if (tunnelValue && typeof tunnelValue !== "string") {
          tunnels.push(tunnelValue);
        }
      }
    }
    return tunnels;
  }
  async dispose() {
    super.dispose();
    for (const portMap of this._tunnels.values()) {
      for (const { value } of portMap.values()) {
        await value.then((tunnel) => typeof tunnel !== "string" ? tunnel?.dispose() : void 0);
      }
      portMap.clear();
    }
    this._tunnels.clear();
  }
  setEnvironmentTunnel(remoteHost, remotePort, localAddress, privacy, protocol) {
    this.addTunnelToMap(remoteHost, remotePort, Promise.resolve({
      tunnelRemoteHost: remoteHost,
      tunnelRemotePort: remotePort,
      localAddress,
      privacy,
      protocol,
      dispose: () => Promise.resolve()
    }));
  }
  async getExistingTunnel(remoteHost, remotePort) {
    if (isAllInterfaces(remoteHost) || isLocalhost(remoteHost)) {
      remoteHost = LOCALHOST_ADDRESSES[0];
    }
    const existing = this.getTunnelFromMap(remoteHost, remotePort);
    if (existing) {
      ++existing.refcount;
      return existing.value;
    }
    return void 0;
  }
  openTunnel(addressProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded = false, privacy, protocol) {
    this.logService.trace(`ForwardedPorts: (TunnelService) openTunnel request for ${remoteHost}:${remotePort} on local port ${localPort}.`);
    const addressOrTunnelProvider = this._tunnelProvider ?? addressProvider;
    if (!addressOrTunnelProvider) {
      return void 0;
    }
    if (!remoteHost) {
      remoteHost = "localhost";
    }
    if (!localHost) {
      localHost = this.defaultTunnelHost;
    }
    if (this._tunnelProvider && this._factoryInProgress.has(remotePort)) {
      this.logService.debug(`ForwardedPorts: (TunnelService) Another call to create a tunnel with the same address has occurred before the last one completed. This call will be ignored.`);
      return;
    }
    const resolvedTunnel = this.retainOrCreateTunnel(addressOrTunnelProvider, remoteHost, remotePort, localHost, localPort, elevateIfNeeded, privacy, protocol);
    if (!resolvedTunnel) {
      this.logService.trace(`ForwardedPorts: (TunnelService) Tunnel was not created.`);
      return resolvedTunnel;
    }
    return resolvedTunnel.then((tunnel) => {
      if (!tunnel) {
        this.logService.trace("ForwardedPorts: (TunnelService) New tunnel is undefined.");
        this.removeEmptyOrErrorTunnelFromMap(remoteHost, remotePort);
        return void 0;
      } else if (typeof tunnel === "string") {
        this.logService.trace("ForwardedPorts: (TunnelService) The tunnel provider returned an error when creating the tunnel.");
        this.removeEmptyOrErrorTunnelFromMap(remoteHost, remotePort);
        return tunnel;
      }
      this.logService.trace("ForwardedPorts: (TunnelService) New tunnel established.");
      const newTunnel = this.makeTunnel(tunnel);
      if (tunnel.tunnelRemoteHost !== remoteHost || tunnel.tunnelRemotePort !== remotePort) {
        this.logService.warn("ForwardedPorts: (TunnelService) Created tunnel does not match requirements of requested tunnel. Host or port mismatch.");
      }
      if (privacy && tunnel.privacy !== privacy) {
        this.logService.warn("ForwardedPorts: (TunnelService) Created tunnel does not match requirements of requested tunnel. Privacy mismatch.");
      }
      this._onTunnelOpened.fire(newTunnel);
      return newTunnel;
    });
  }
  makeTunnel(tunnel) {
    return {
      tunnelRemotePort: tunnel.tunnelRemotePort,
      tunnelRemoteHost: tunnel.tunnelRemoteHost,
      tunnelLocalPort: tunnel.tunnelLocalPort,
      localAddress: tunnel.localAddress,
      privacy: tunnel.privacy,
      protocol: tunnel.protocol,
      dispose: async () => {
        this.logService.trace(`ForwardedPorts: (TunnelService) dispose request for ${tunnel.tunnelRemoteHost}:${tunnel.tunnelRemotePort} `);
        const existingHost = this._tunnels.get(tunnel.tunnelRemoteHost);
        if (existingHost) {
          const existing = existingHost.get(tunnel.tunnelRemotePort);
          if (existing) {
            existing.refcount--;
            await this.tryDisposeTunnel(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort, existing);
          }
        }
      }
    };
  }
  async tryDisposeTunnel(remoteHost, remotePort, tunnel) {
    if (tunnel.refcount <= 0) {
      this.logService.trace(`ForwardedPorts: (TunnelService) Tunnel is being disposed ${remoteHost}:${remotePort}.`);
      const disposePromise = tunnel.value.then(async (tunnel2) => {
        if (tunnel2 && typeof tunnel2 !== "string") {
          await tunnel2.dispose(true);
          this._onTunnelClosed.fire({ host: tunnel2.tunnelRemoteHost, port: tunnel2.tunnelRemotePort });
        }
      });
      if (this._tunnels.has(remoteHost)) {
        this._tunnels.get(remoteHost).delete(remotePort);
      }
      return disposePromise;
    }
  }
  async closeTunnel(remoteHost, remotePort) {
    this.logService.trace(`ForwardedPorts: (TunnelService) close request for ${remoteHost}:${remotePort} `);
    const portMap = this._tunnels.get(remoteHost);
    if (portMap && portMap.has(remotePort)) {
      const value = portMap.get(remotePort);
      value.refcount = 0;
      await this.tryDisposeTunnel(remoteHost, remotePort, value);
    }
  }
  addTunnelToMap(remoteHost, remotePort, tunnel) {
    if (!this._tunnels.has(remoteHost)) {
      this._tunnels.set(remoteHost, /* @__PURE__ */ new Map());
    }
    this._tunnels.get(remoteHost).set(remotePort, { refcount: 1, value: tunnel });
  }
  async removeEmptyOrErrorTunnelFromMap(remoteHost, remotePort) {
    const hostMap = this._tunnels.get(remoteHost);
    if (hostMap) {
      const tunnel = hostMap.get(remotePort);
      const tunnelResult = tunnel ? await tunnel.value : void 0;
      if (!tunnelResult || typeof tunnelResult === "string") {
        hostMap.delete(remotePort);
      }
      if (hostMap.size === 0) {
        this._tunnels.delete(remoteHost);
      }
    }
  }
  getTunnelFromMap(remoteHost, remotePort) {
    const hosts = [remoteHost];
    if (isLocalhost(remoteHost)) {
      hosts.push(...LOCALHOST_ADDRESSES);
      hosts.push(...ALL_INTERFACES_ADDRESSES);
    } else if (isAllInterfaces(remoteHost)) {
      hosts.push(...ALL_INTERFACES_ADDRESSES);
    }
    const existingPortMaps = hosts.map((host) => this._tunnels.get(host));
    for (const map of existingPortMaps) {
      const existingTunnel = map?.get(remotePort);
      if (existingTunnel) {
        return existingTunnel;
      }
    }
    return void 0;
  }
  canTunnel(uri) {
    return !!extractLocalHostUriMetaDataForPortMapping(uri);
  }
  createWithProvider(tunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol) {
    this.logService.trace(`ForwardedPorts: (TunnelService) Creating tunnel with provider ${remoteHost}:${remotePort} on local port ${localPort}.`);
    const key = remotePort;
    this._factoryInProgress.add(key);
    const preferredLocalPort = localPort === void 0 ? remotePort : localPort;
    const creationInfo = { elevationRequired: elevateIfNeeded ? this.isPortPrivileged(preferredLocalPort) : false };
    const tunnelOptions = { remoteAddress: { host: remoteHost, port: remotePort }, localAddressPort: localPort, privacy, public: privacy ? privacy !== "private" /* Private */ : void 0, protocol };
    const tunnel = tunnelProvider.forwardPort(tunnelOptions, creationInfo);
    if (tunnel) {
      this.addTunnelToMap(remoteHost, remotePort, tunnel);
      tunnel.finally(() => {
        this.logService.trace("ForwardedPorts: (TunnelService) Tunnel created by provider.");
        this._factoryInProgress.delete(key);
      });
    } else {
      this._factoryInProgress.delete(key);
    }
    return tunnel;
  }
};
AbstractTunnelService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IConfigurationService)
], AbstractTunnelService);
export {
  ALL_INTERFACES_ADDRESSES,
  AbstractTunnelService,
  DisposableTunnel,
  ISharedTunnelsService,
  ITunnelService,
  LOCALHOST_ADDRESSES,
  ProvidedOnAutoForward,
  TunnelPrivacyId,
  TunnelProtocol,
  extractLocalHostUriMetaDataForPortMapping,
  extractQueryLocalHostUriMetaDataForPortMapping,
  isAllInterfaces,
  isLocalhost,
  isPortPrivileged,
  isRemoteTunnel,
  isTunnelProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVubmVsXFxjb21tb25cXHR1bm5lbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBZGRyZXNzUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50Q29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUdW5uZWxQcml2YWN5IH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBdXRob3JpdHlSZXNvbHZlci5qcyc7XG5cbmV4cG9ydCBjb25zdCBJVHVubmVsU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJVHVubmVsU2VydmljZT4oJ3R1bm5lbFNlcnZpY2UnKTtcbmV4cG9ydCBjb25zdCBJU2hhcmVkVHVubmVsc1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVNoYXJlZFR1bm5lbHNTZXJ2aWNlPignc2hhcmVkVHVubmVsc1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBSZW1vdGVUdW5uZWwge1xuXHRyZWFkb25seSB0dW5uZWxSZW1vdGVQb3J0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHR1bm5lbFJlbW90ZUhvc3Q6IHN0cmluZztcblx0cmVhZG9ubHkgdHVubmVsTG9jYWxQb3J0PzogbnVtYmVyO1xuXHRyZWFkb25seSBsb2NhbEFkZHJlc3M6IHN0cmluZztcblx0cmVhZG9ubHkgcHJpdmFjeTogc3RyaW5nO1xuXHRyZWFkb25seSBwcm90b2NvbD86IHN0cmluZztcblx0ZGlzcG9zZShzaWxlbnQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVtb3RlVHVubmVsKHNvbWV0aGluZzogdW5rbm93bik6IHNvbWV0aGluZyBpcyBSZW1vdGVUdW5uZWwge1xuXHRjb25zdCBhc1R1bm5lbDogUGFydGlhbDxSZW1vdGVUdW5uZWw+ID0gc29tZXRoaW5nIGFzIFBhcnRpYWw8UmVtb3RlVHVubmVsPjtcblx0cmV0dXJuICEhKGFzVHVubmVsLnR1bm5lbFJlbW90ZVBvcnQgJiYgYXNUdW5uZWwudHVubmVsUmVtb3RlSG9zdCAmJiBhc1R1bm5lbC5sb2NhbEFkZHJlc3MgJiYgYXNUdW5uZWwucHJpdmFjeSAmJiBhc1R1bm5lbC5kaXNwb3NlKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUdW5uZWxPcHRpb25zIHtcblx0cmVtb3RlQWRkcmVzczogeyBwb3J0OiBudW1iZXI7IGhvc3Q6IHN0cmluZyB9O1xuXHRsb2NhbEFkZHJlc3NQb3J0PzogbnVtYmVyO1xuXHRsYWJlbD86IHN0cmluZztcblx0cHVibGljPzogYm9vbGVhbjtcblx0cHJpdmFjeT86IHN0cmluZztcblx0cHJvdG9jb2w/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBlbnVtIFR1bm5lbFByb3RvY29sIHtcblx0SHR0cCA9ICdodHRwJyxcblx0SHR0cHMgPSAnaHR0cHMnXG59XG5cbmV4cG9ydCBlbnVtIFR1bm5lbFByaXZhY3lJZCB7XG5cdENvbnN0YW50UHJpdmF0ZSA9ICdjb25zdGFudFByaXZhdGUnLCAvLyBwcml2YXRlLCBhbmQgY2hhbmdpbmcgaXMgdW5zdXBwb3J0ZWRcblx0UHJpdmF0ZSA9ICdwcml2YXRlJyxcblx0UHVibGljID0gJ3B1YmxpYydcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUdW5uZWxDcmVhdGlvbk9wdGlvbnMge1xuXHRlbGV2YXRpb25SZXF1aXJlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHVubmVsUHJvdmlkZXJGZWF0dXJlcyB7XG5cdGVsZXZhdGlvbjogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkXG5cdCAqL1xuXHRwdWJsaWM/OiBib29sZWFuO1xuXHRwcml2YWN5T3B0aW9uczogVHVubmVsUHJpdmFjeVtdO1xuXHRwcm90b2NvbDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVHVubmVsUHJvdmlkZXIge1xuXHRmb3J3YXJkUG9ydCh0dW5uZWxPcHRpb25zOiBUdW5uZWxPcHRpb25zLCB0dW5uZWxDcmVhdGlvbk9wdGlvbnM6IFR1bm5lbENyZWF0aW9uT3B0aW9ucyk6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzVHVubmVsUHJvdmlkZXIoYWRkcmVzc09yVHVubmVsUHJvdmlkZXI6IElBZGRyZXNzUHJvdmlkZXIgfCBJVHVubmVsUHJvdmlkZXIpOiBhZGRyZXNzT3JUdW5uZWxQcm92aWRlciBpcyBJVHVubmVsUHJvdmlkZXIge1xuXHRyZXR1cm4gISEoYWRkcmVzc09yVHVubmVsUHJvdmlkZXIgYXMgSVR1bm5lbFByb3ZpZGVyKS5mb3J3YXJkUG9ydDtcbn1cblxuZXhwb3J0IGVudW0gUHJvdmlkZWRPbkF1dG9Gb3J3YXJkIHtcblx0Tm90aWZ5ID0gMSxcblx0T3BlbkJyb3dzZXIgPSAyLFxuXHRPcGVuUHJldmlldyA9IDMsXG5cdFNpbGVudCA9IDQsXG5cdElnbm9yZSA9IDUsXG5cdE9wZW5Ccm93c2VyT25jZSA9IDZcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm92aWRlZFBvcnRBdHRyaWJ1dGVzIHtcblx0cG9ydDogbnVtYmVyO1xuXHRhdXRvRm9yd2FyZEFjdGlvbjogUHJvdmlkZWRPbkF1dG9Gb3J3YXJkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBvcnRBdHRyaWJ1dGVzUHJvdmlkZXIge1xuXHRwcm92aWRlUG9ydEF0dHJpYnV0ZXMocG9ydHM6IG51bWJlcltdLCBwaWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgY29tbWFuZExpbmU6IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxQcm92aWRlZFBvcnRBdHRyaWJ1dGVzW10+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUdW5uZWwge1xuXHRyZW1vdGVBZGRyZXNzOiB7IHBvcnQ6IG51bWJlcjsgaG9zdDogc3RyaW5nIH07XG5cblx0LyoqXG5cdCAqIFRoZSBjb21wbGV0ZSBsb2NhbCBhZGRyZXNzKGV4LiBsb2NhbGhvc3Q6MTIzNClcblx0ICovXG5cdGxvY2FsQWRkcmVzczogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBVc2UgcHJpdmFjeSBpbnN0ZWFkXG5cdCAqL1xuXHRwdWJsaWM/OiBib29sZWFuO1xuXG5cdHByaXZhY3k/OiBzdHJpbmc7XG5cblx0cHJvdG9jb2w/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEltcGxlbWVudGVycyBvZiBUdW5uZWwgc2hvdWxkIGZpcmUgb25EaWREaXNwb3NlIHdoZW4gZGlzcG9zZSBpcyBjYWxsZWQuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+O1xuXG5cdGRpc3Bvc2UoKTogUHJvbWlzZTx2b2lkPiB8IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNoYXJlZFR1bm5lbHNTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdG9wZW5UdW5uZWwoYXV0aG9yaXR5OiBzdHJpbmcsIGFkZHJlc3NQcm92aWRlcjogSUFkZHJlc3NQcm92aWRlciB8IHVuZGVmaW5lZCwgcmVtb3RlSG9zdDogc3RyaW5nIHwgdW5kZWZpbmVkLCByZW1vdGVQb3J0OiBudW1iZXIsIGxvY2FsSG9zdDogc3RyaW5nLCBsb2NhbFBvcnQ/OiBudW1iZXIsIGVsZXZhdGVJZk5lZWRlZD86IGJvb2xlYW4sIHByaXZhY3k/OiBzdHJpbmcsIHByb3RvY29sPzogc3RyaW5nKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUdW5uZWxTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHR1bm5lbHM6IFByb21pc2U8cmVhZG9ubHkgUmVtb3RlVHVubmVsW10+O1xuXHRyZWFkb25seSBjYW5DaGFuZ2VQcml2YWN5OiBib29sZWFuO1xuXHRyZWFkb25seSBwcml2YWN5T3B0aW9uczogVHVubmVsUHJpdmFjeVtdO1xuXHRyZWFkb25seSBvblR1bm5lbE9wZW5lZDogRXZlbnQ8UmVtb3RlVHVubmVsPjtcblx0cmVhZG9ubHkgb25UdW5uZWxDbG9zZWQ6IEV2ZW50PHsgaG9zdDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfT47XG5cdHJlYWRvbmx5IGNhbkVsZXZhdGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNhbkNoYW5nZVByb3RvY29sOiBib29sZWFuO1xuXHRyZWFkb25seSBoYXNUdW5uZWxQcm92aWRlcjogYm9vbGVhbjtcblx0cmVhZG9ubHkgb25BZGRlZFR1bm5lbFByb3ZpZGVyOiBFdmVudDx2b2lkPjtcblxuXHRjYW5UdW5uZWwodXJpOiBVUkkpOiBib29sZWFuO1xuXHRvcGVuVHVubmVsKGFkZHJlc3NQcm92aWRlcjogSUFkZHJlc3NQcm92aWRlciB8IHVuZGVmaW5lZCwgcmVtb3RlSG9zdDogc3RyaW5nIHwgdW5kZWZpbmVkLCByZW1vdGVQb3J0OiBudW1iZXIsIGxvY2FsSG9zdD86IHN0cmluZywgbG9jYWxQb3J0PzogbnVtYmVyLCBlbGV2YXRlSWZOZWVkZWQ/OiBib29sZWFuLCBwcml2YWN5Pzogc3RyaW5nLCBwcm90b2NvbD86IHN0cmluZyk6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblx0Z2V0RXhpc3RpbmdUdW5uZWwocmVtb3RlSG9zdDogc3RyaW5nLCByZW1vdGVQb3J0OiBudW1iZXIpOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHNldEVudmlyb25tZW50VHVubmVsKHJlbW90ZUhvc3Q6IHN0cmluZywgcmVtb3RlUG9ydDogbnVtYmVyLCBsb2NhbEFkZHJlc3M6IHN0cmluZywgcHJpdmFjeTogc3RyaW5nLCBwcm90b2NvbDogc3RyaW5nKTogdm9pZDtcblx0Y2xvc2VUdW5uZWwocmVtb3RlSG9zdDogc3RyaW5nLCByZW1vdGVQb3J0OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXRUdW5uZWxQcm92aWRlcihwcm92aWRlcjogSVR1bm5lbFByb3ZpZGVyIHwgdW5kZWZpbmVkKTogSURpc3Bvc2FibGU7XG5cdHNldFR1bm5lbEZlYXR1cmVzKGZlYXR1cmVzOiBUdW5uZWxQcm92aWRlckZlYXR1cmVzKTogdm9pZDtcblx0aXNQb3J0UHJpdmlsZWdlZChwb3J0OiBudW1iZXIpOiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdExvY2FsSG9zdFVyaU1ldGFEYXRhRm9yUG9ydE1hcHBpbmcodXJpOiBVUkkpOiB7IGFkZHJlc3M6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRpZiAodXJpLnNjaGVtZSAhPT0gJ2h0dHAnICYmIHVyaS5zY2hlbWUgIT09ICdodHRwcycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGxvY2FsaG9zdE1hdGNoID0gL14obG9jYWxob3N0fDEyN1xcLjBcXC4wXFwuMXwwXFwuMFxcLjBcXC4wKTooXFxkKykkLy5leGVjKHVyaS5hdXRob3JpdHkpO1xuXHRpZiAoIWxvY2FsaG9zdE1hdGNoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdGFkZHJlc3M6IGxvY2FsaG9zdE1hdGNoWzFdLFxuXHRcdHBvcnQ6ICtsb2NhbGhvc3RNYXRjaFsyXSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RRdWVyeUxvY2FsSG9zdFVyaU1ldGFEYXRhRm9yUG9ydE1hcHBpbmcodXJpOiBVUkkpOiB7IGFkZHJlc3M6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRpZiAodXJpLnNjaGVtZSAhPT0gJ2h0dHAnICYmIHVyaS5zY2hlbWUgIT09ICdodHRwcycgfHwgIXVyaS5xdWVyeSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qga2V5dmFsdWVzID0gdXJpLnF1ZXJ5LnNwbGl0KCcmJyk7XG5cdGZvciAoY29uc3Qga2V5dmFsdWUgb2Yga2V5dmFsdWVzKSB7XG5cdFx0Y29uc3QgdmFsdWUgPSBrZXl2YWx1ZS5zcGxpdCgnPScpWzFdO1xuXHRcdGlmICgvXmh0dHBzPzovLmV4ZWModmFsdWUpKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0TG9jYWxIb3N0VXJpTWV0YURhdGFGb3JQb3J0TWFwcGluZyhVUkkucGFyc2UodmFsdWUpKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNvbnN0IExPQ0FMSE9TVF9BRERSRVNTRVMgPSBbJ2xvY2FsaG9zdCcsICcxMjcuMC4wLjEnLCAnMDowOjA6MDowOjA6MDoxJywgJzo6MSddO1xuZXhwb3J0IGZ1bmN0aW9uIGlzTG9jYWxob3N0KGhvc3Q6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gTE9DQUxIT1NUX0FERFJFU1NFUy5pbmRleE9mKGhvc3QpID49IDA7XG59XG5cbmV4cG9ydCBjb25zdCBBTExfSU5URVJGQUNFU19BRERSRVNTRVMgPSBbJzAuMC4wLjAnLCAnMDowOjA6MDowOjA6MDowJywgJzo6J107XG5leHBvcnQgZnVuY3Rpb24gaXNBbGxJbnRlcmZhY2VzKGhvc3Q6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gQUxMX0lOVEVSRkFDRVNfQUREUkVTU0VTLmluZGV4T2YoaG9zdCkgPj0gMDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUG9ydFByaXZpbGVnZWQocG9ydDogbnVtYmVyLCBob3N0OiBzdHJpbmcsIG9zOiBPcGVyYXRpbmdTeXN0ZW0sIG9zUmVsZWFzZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSB7XG5cdFx0aWYgKGlzQWxsSW50ZXJmYWNlcyhob3N0KSkge1xuXHRcdFx0Y29uc3Qgb3NWZXJzaW9uID0gKC8oXFxkKylcXC4oXFxkKylcXC4oXFxkKykvZykuZXhlYyhvc1JlbGVhc2UpO1xuXHRcdFx0aWYgKG9zVmVyc2lvbj8ubGVuZ3RoID09PSA0KSB7XG5cdFx0XHRcdGNvbnN0IG1ham9yID0gcGFyc2VJbnQob3NWZXJzaW9uWzFdKTtcblx0XHRcdFx0aWYgKG1ham9yID49IDE4IC8qIHNpbmNlIG1hY09TIE1vamF2ZSwgZGFyd2luIHZlcnNpb24gMTguMC4wICovKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBwb3J0IDwgMTAyNDtcbn1cblxuZXhwb3J0IGNsYXNzIERpc3Bvc2FibGVUdW5uZWwge1xuXHRwcml2YXRlIF9vbkRpc3Bvc2U6IEVtaXR0ZXI8dm9pZD4gPSBuZXcgRW1pdHRlcigpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaXNwb3NlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZW1vdGVBZGRyZXNzOiB7IHBvcnQ6IG51bWJlcjsgaG9zdDogc3RyaW5nIH0sXG5cdFx0cHVibGljIHJlYWRvbmx5IGxvY2FsQWRkcmVzczogeyBwb3J0OiBudW1iZXI7IGhvc3Q6IHN0cmluZyB9IHwgc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2U6ICgpID0+IFByb21pc2U8dm9pZD4pIHsgfVxuXG5cdGRpc3Bvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fb25EaXNwb3NlLmZpcmUoKTtcblx0XHR0aGlzLl9vbkRpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdHJldHVybiB0aGlzLl9kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0VHVubmVsU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHVubmVsU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uVHVubmVsT3BlbmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmVtb3RlVHVubmVsPigpKTtcblx0cHVibGljIG9uVHVubmVsT3BlbmVkOiBFdmVudDxSZW1vdGVUdW5uZWw+ID0gdGhpcy5fb25UdW5uZWxPcGVuZWQuZXZlbnQ7XG5cdHByaXZhdGUgX29uVHVubmVsQ2xvc2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9PigpKTtcblx0cHVibGljIG9uVHVubmVsQ2xvc2VkOiBFdmVudDx7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0+ID0gdGhpcy5fb25UdW5uZWxDbG9zZWQuZXZlbnQ7XG5cdHByaXZhdGUgX29uQWRkZWRUdW5uZWxQcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgb25BZGRlZFR1bm5lbFByb3ZpZGVyOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uQWRkZWRUdW5uZWxQcm92aWRlci5ldmVudDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF90dW5uZWxzID0gbmV3IE1hcDwvKmhvc3QqLyBzdHJpbmcsIE1hcDwvKiBwb3J0ICovIG51bWJlciwgeyByZWZjb3VudDogbnVtYmVyOyByZWFkb25seSB2YWx1ZTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IH0+PigpO1xuXHRwcm90ZWN0ZWQgX3R1bm5lbFByb3ZpZGVyOiBJVHVubmVsUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBfY2FuRWxldmF0ZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9jYW5DaGFuZ2VQcm90b2NvbDogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgX3ByaXZhY3lPcHRpb25zOiBUdW5uZWxQcml2YWN5W10gPSBbXTtcblx0cHJpdmF0ZSBfZmFjdG9yeUluUHJvZ3Jlc3M6IFNldDxudW1iZXIvKnBvcnQqLz4gPSBuZXcgU2V0KCk7XG5cblx0cHVibGljIGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHsgc3VwZXIoKTsgfVxuXG5cdGdldCBoYXNUdW5uZWxQcm92aWRlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl90dW5uZWxQcm92aWRlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgZGVmYXVsdFR1bm5lbEhvc3QoKTogc3RyaW5nIHtcblx0XHRjb25zdCBzZXR0aW5nVmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdyZW1vdGUubG9jYWxQb3J0SG9zdCcpO1xuXHRcdHJldHVybiAoIXNldHRpbmdWYWx1ZSB8fCBzZXR0aW5nVmFsdWUgPT09ICdsb2NhbGhvc3QnKSA/ICcxMjcuMC4wLjEnIDogJzAuMC4wLjAnO1xuXHR9XG5cblx0c2V0VHVubmVsUHJvdmlkZXIocHJvdmlkZXI6IElUdW5uZWxQcm92aWRlciB8IHVuZGVmaW5lZCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl90dW5uZWxQcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdC8vIGNsZWFyIGZlYXR1cmVzXG5cdFx0XHR0aGlzLl9jYW5FbGV2YXRlID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9wcml2YWN5T3B0aW9ucyA9IFtdO1xuXHRcdFx0dGhpcy5fb25BZGRlZFR1bm5lbFByb3ZpZGVyLmZpcmUoKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkFkZGVkVHVubmVsUHJvdmlkZXIuZmlyZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3R1bm5lbFByb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9jYW5FbGV2YXRlID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX3ByaXZhY3lPcHRpb25zID0gW107XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHNldFR1bm5lbEZlYXR1cmVzKGZlYXR1cmVzOiBUdW5uZWxQcm92aWRlckZlYXR1cmVzKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuRWxldmF0ZSA9IGZlYXR1cmVzLmVsZXZhdGlvbjtcblx0XHR0aGlzLl9wcml2YWN5T3B0aW9ucyA9IGZlYXR1cmVzLnByaXZhY3lPcHRpb25zO1xuXHRcdHRoaXMuX2NhbkNoYW5nZVByb3RvY29sID0gZmVhdHVyZXMucHJvdG9jb2w7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNhbkNoYW5nZVByb3RvY29sKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jYW5DaGFuZ2VQcm90b2NvbDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY2FuRWxldmF0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FuRWxldmF0ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY2FuQ2hhbmdlUHJpdmFjeSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJpdmFjeU9wdGlvbnMubGVuZ3RoID4gMDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgcHJpdmFjeU9wdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByaXZhY3lPcHRpb25zO1xuXHR9XG5cblx0cHVibGljIGdldCB0dW5uZWxzKCk6IFByb21pc2U8cmVhZG9ubHkgUmVtb3RlVHVubmVsW10+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRUdW5uZWxzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFR1bm5lbHMoKTogUHJvbWlzZTxyZWFkb25seSBSZW1vdGVUdW5uZWxbXT4ge1xuXHRcdGNvbnN0IHR1bm5lbHM6IFJlbW90ZVR1bm5lbFtdID0gW107XG5cdFx0Y29uc3QgdHVubmVsQXJyYXkgPSBBcnJheS5mcm9tKHRoaXMuX3R1bm5lbHMudmFsdWVzKCkpO1xuXHRcdGZvciAoY29uc3QgcG9ydE1hcCBvZiB0dW5uZWxBcnJheSkge1xuXHRcdFx0Y29uc3QgcG9ydEFycmF5ID0gQXJyYXkuZnJvbShwb3J0TWFwLnZhbHVlcygpKTtcblx0XHRcdGZvciAoY29uc3QgeCBvZiBwb3J0QXJyYXkpIHtcblx0XHRcdFx0Y29uc3QgdHVubmVsVmFsdWUgPSBhd2FpdCB4LnZhbHVlO1xuXHRcdFx0XHRpZiAodHVubmVsVmFsdWUgJiYgKHR5cGVvZiB0dW5uZWxWYWx1ZSAhPT0gJ3N0cmluZycpKSB7XG5cdFx0XHRcdFx0dHVubmVscy5wdXNoKHR1bm5lbFZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHVubmVscztcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRpc3Bvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGZvciAoY29uc3QgcG9ydE1hcCBvZiB0aGlzLl90dW5uZWxzLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgdmFsdWUgfSBvZiBwb3J0TWFwLnZhbHVlcygpKSB7XG5cdFx0XHRcdGF3YWl0IHZhbHVlLnRoZW4odHVubmVsID0+IHR5cGVvZiB0dW5uZWwgIT09ICdzdHJpbmcnID8gdHVubmVsPy5kaXNwb3NlKCkgOiB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0cG9ydE1hcC5jbGVhcigpO1xuXHRcdH1cblx0XHR0aGlzLl90dW5uZWxzLmNsZWFyKCk7XG5cdH1cblxuXHRzZXRFbnZpcm9ubWVudFR1bm5lbChyZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlciwgbG9jYWxBZGRyZXNzOiBzdHJpbmcsIHByaXZhY3k6IHN0cmluZywgcHJvdG9jb2w6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuYWRkVHVubmVsVG9NYXAocmVtb3RlSG9zdCwgcmVtb3RlUG9ydCwgUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdHR1bm5lbFJlbW90ZUhvc3Q6IHJlbW90ZUhvc3QsXG5cdFx0XHR0dW5uZWxSZW1vdGVQb3J0OiByZW1vdGVQb3J0LFxuXHRcdFx0bG9jYWxBZGRyZXNzLFxuXHRcdFx0cHJpdmFjeSxcblx0XHRcdHByb3RvY29sLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKClcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRFeGlzdGluZ1R1bm5lbChyZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlcik6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGlzQWxsSW50ZXJmYWNlcyhyZW1vdGVIb3N0KSB8fCBpc0xvY2FsaG9zdChyZW1vdGVIb3N0KSkge1xuXHRcdFx0cmVtb3RlSG9zdCA9IExPQ0FMSE9TVF9BRERSRVNTRVNbMF07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldFR1bm5lbEZyb21NYXAocmVtb3RlSG9zdCwgcmVtb3RlUG9ydCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHQrK2V4aXN0aW5nLnJlZmNvdW50O1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLnZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3BlblR1bm5lbChhZGRyZXNzUHJvdmlkZXI6IElBZGRyZXNzUHJvdmlkZXIgfCB1bmRlZmluZWQsIHJlbW90ZUhvc3Q6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVtb3RlUG9ydDogbnVtYmVyLCBsb2NhbEhvc3Q/OiBzdHJpbmcsIGxvY2FsUG9ydD86IG51bWJlciwgZWxldmF0ZUlmTmVlZGVkOiBib29sZWFuID0gZmFsc2UsIHByaXZhY3k/OiBzdHJpbmcsIHByb3RvY29sPzogc3RyaW5nKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgb3BlblR1bm5lbCByZXF1ZXN0IGZvciAke3JlbW90ZUhvc3R9OiR7cmVtb3RlUG9ydH0gb24gbG9jYWwgcG9ydCAke2xvY2FsUG9ydH0uYCk7XG5cdFx0Y29uc3QgYWRkcmVzc09yVHVubmVsUHJvdmlkZXIgPSB0aGlzLl90dW5uZWxQcm92aWRlciA/PyBhZGRyZXNzUHJvdmlkZXI7XG5cdFx0aWYgKCFhZGRyZXNzT3JUdW5uZWxQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXJlbW90ZUhvc3QpIHtcblx0XHRcdHJlbW90ZUhvc3QgPSAnbG9jYWxob3N0Jztcblx0XHR9XG5cdFx0aWYgKCFsb2NhbEhvc3QpIHtcblx0XHRcdGxvY2FsSG9zdCA9IHRoaXMuZGVmYXVsdFR1bm5lbEhvc3Q7XG5cdFx0fVxuXG5cdFx0Ly8gUHJldmVudCB0dW5uZWwgZmFjdG9yaWVzIGZyb20gY2FsbGluZyBvcGVuVHVubmVsIGZyb20gd2l0aGluIHRoZSBmYWN0b3J5XG5cdFx0aWYgKHRoaXMuX3R1bm5lbFByb3ZpZGVyICYmIHRoaXMuX2ZhY3RvcnlJblByb2dyZXNzLmhhcyhyZW1vdGVQb3J0KSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBGb3J3YXJkZWRQb3J0czogKFR1bm5lbFNlcnZpY2UpIEFub3RoZXIgY2FsbCB0byBjcmVhdGUgYSB0dW5uZWwgd2l0aCB0aGUgc2FtZSBhZGRyZXNzIGhhcyBvY2N1cnJlZCBiZWZvcmUgdGhlIGxhc3Qgb25lIGNvbXBsZXRlZC4gVGhpcyBjYWxsIHdpbGwgYmUgaWdub3JlZC5gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZFR1bm5lbCA9IHRoaXMucmV0YWluT3JDcmVhdGVUdW5uZWwoYWRkcmVzc09yVHVubmVsUHJvdmlkZXIsIHJlbW90ZUhvc3QsIHJlbW90ZVBvcnQsIGxvY2FsSG9zdCwgbG9jYWxQb3J0LCBlbGV2YXRlSWZOZWVkZWQsIHByaXZhY3ksIHByb3RvY29sKTtcblx0XHRpZiAoIXJlc29sdmVkVHVubmVsKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgVHVubmVsIHdhcyBub3QgY3JlYXRlZC5gKTtcblx0XHRcdHJldHVybiByZXNvbHZlZFR1bm5lbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzb2x2ZWRUdW5uZWwudGhlbih0dW5uZWwgPT4ge1xuXHRcdFx0aWYgKCF0dW5uZWwpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdGb3J3YXJkZWRQb3J0czogKFR1bm5lbFNlcnZpY2UpIE5ldyB0dW5uZWwgaXMgdW5kZWZpbmVkLicpO1xuXHRcdFx0XHR0aGlzLnJlbW92ZUVtcHR5T3JFcnJvclR1bm5lbEZyb21NYXAocmVtb3RlSG9zdCwgcmVtb3RlUG9ydCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB0dW5uZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRm9yd2FyZGVkUG9ydHM6IChUdW5uZWxTZXJ2aWNlKSBUaGUgdHVubmVsIHByb3ZpZGVyIHJldHVybmVkIGFuIGVycm9yIHdoZW4gY3JlYXRpbmcgdGhlIHR1bm5lbC4nKTtcblx0XHRcdFx0dGhpcy5yZW1vdmVFbXB0eU9yRXJyb3JUdW5uZWxGcm9tTWFwKHJlbW90ZUhvc3QsIHJlbW90ZVBvcnQpO1xuXHRcdFx0XHRyZXR1cm4gdHVubmVsO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdGb3J3YXJkZWRQb3J0czogKFR1bm5lbFNlcnZpY2UpIE5ldyB0dW5uZWwgZXN0YWJsaXNoZWQuJyk7XG5cdFx0XHRjb25zdCBuZXdUdW5uZWwgPSB0aGlzLm1ha2VUdW5uZWwodHVubmVsKTtcblx0XHRcdGlmICh0dW5uZWwudHVubmVsUmVtb3RlSG9zdCAhPT0gcmVtb3RlSG9zdCB8fCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCAhPT0gcmVtb3RlUG9ydCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignRm9yd2FyZGVkUG9ydHM6IChUdW5uZWxTZXJ2aWNlKSBDcmVhdGVkIHR1bm5lbCBkb2VzIG5vdCBtYXRjaCByZXF1aXJlbWVudHMgb2YgcmVxdWVzdGVkIHR1bm5lbC4gSG9zdCBvciBwb3J0IG1pc21hdGNoLicpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByaXZhY3kgJiYgdHVubmVsLnByaXZhY3kgIT09IHByaXZhY3kpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0ZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgQ3JlYXRlZCB0dW5uZWwgZG9lcyBub3QgbWF0Y2ggcmVxdWlyZW1lbnRzIG9mIHJlcXVlc3RlZCB0dW5uZWwuIFByaXZhY3kgbWlzbWF0Y2guJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vblR1bm5lbE9wZW5lZC5maXJlKG5ld1R1bm5lbCk7XG5cdFx0XHRyZXR1cm4gbmV3VHVubmVsO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBtYWtlVHVubmVsKHR1bm5lbDogUmVtb3RlVHVubmVsKTogUmVtb3RlVHVubmVsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHVubmVsUmVtb3RlUG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQsXG5cdFx0XHR0dW5uZWxSZW1vdGVIb3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCxcblx0XHRcdHR1bm5lbExvY2FsUG9ydDogdHVubmVsLnR1bm5lbExvY2FsUG9ydCxcblx0XHRcdGxvY2FsQWRkcmVzczogdHVubmVsLmxvY2FsQWRkcmVzcyxcblx0XHRcdHByaXZhY3k6IHR1bm5lbC5wcml2YWN5LFxuXHRcdFx0cHJvdG9jb2w6IHR1bm5lbC5wcm90b2NvbCxcblx0XHRcdGRpc3Bvc2U6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKFR1bm5lbFNlcnZpY2UpIGRpc3Bvc2UgcmVxdWVzdCBmb3IgJHt0dW5uZWwudHVubmVsUmVtb3RlSG9zdH06JHt0dW5uZWwudHVubmVsUmVtb3RlUG9ydH0gYCk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nSG9zdCA9IHRoaXMuX3R1bm5lbHMuZ2V0KHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0KTtcblx0XHRcdFx0aWYgKGV4aXN0aW5nSG9zdCkge1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nID0gZXhpc3RpbmdIb3N0LmdldCh0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0XHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0XHRleGlzdGluZy5yZWZjb3VudC0tO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy50cnlEaXNwb3NlVHVubmVsKHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCwgZXhpc3RpbmcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyeURpc3Bvc2VUdW5uZWwocmVtb3RlSG9zdDogc3RyaW5nLCByZW1vdGVQb3J0OiBudW1iZXIsIHR1bm5lbDogeyByZWZjb3VudDogbnVtYmVyOyByZWFkb25seSB2YWx1ZTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHVubmVsLnJlZmNvdW50IDw9IDApIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChUdW5uZWxTZXJ2aWNlKSBUdW5uZWwgaXMgYmVpbmcgZGlzcG9zZWQgJHtyZW1vdGVIb3N0fToke3JlbW90ZVBvcnR9LmApO1xuXHRcdFx0Y29uc3QgZGlzcG9zZVByb21pc2U6IFByb21pc2U8dm9pZD4gPSB0dW5uZWwudmFsdWUudGhlbihhc3luYyAodHVubmVsKSA9PiB7XG5cdFx0XHRcdGlmICh0dW5uZWwgJiYgKHR5cGVvZiB0dW5uZWwgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHRcdGF3YWl0IHR1bm5lbC5kaXNwb3NlKHRydWUpO1xuXHRcdFx0XHRcdHRoaXMuX29uVHVubmVsQ2xvc2VkLmZpcmUoeyBob3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgcG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0aWYgKHRoaXMuX3R1bm5lbHMuaGFzKHJlbW90ZUhvc3QpKSB7XG5cdFx0XHRcdHRoaXMuX3R1bm5lbHMuZ2V0KHJlbW90ZUhvc3QpIS5kZWxldGUocmVtb3RlUG9ydCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGlzcG9zZVByb21pc2U7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2xvc2VUdW5uZWwocmVtb3RlSG9zdDogc3RyaW5nLCByZW1vdGVQb3J0OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoVHVubmVsU2VydmljZSkgY2xvc2UgcmVxdWVzdCBmb3IgJHtyZW1vdGVIb3N0fToke3JlbW90ZVBvcnR9IGApO1xuXHRcdGNvbnN0IHBvcnRNYXAgPSB0aGlzLl90dW5uZWxzLmdldChyZW1vdGVIb3N0KTtcblx0XHRpZiAocG9ydE1hcCAmJiBwb3J0TWFwLmhhcyhyZW1vdGVQb3J0KSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBwb3J0TWFwLmdldChyZW1vdGVQb3J0KSE7XG5cdFx0XHR2YWx1ZS5yZWZjb3VudCA9IDA7XG5cdFx0XHRhd2FpdCB0aGlzLnRyeURpc3Bvc2VUdW5uZWwocmVtb3RlSG9zdCwgcmVtb3RlUG9ydCwgdmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhZGRUdW5uZWxUb01hcChyZW1vdGVIb3N0OiBzdHJpbmcsIHJlbW90ZVBvcnQ6IG51bWJlciwgdHVubmVsOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHVuZGVmaW5lZD4pIHtcblx0XHRpZiAoIXRoaXMuX3R1bm5lbHMuaGFzKHJlbW90ZUhvc3QpKSB7XG5cdFx0XHR0aGlzLl90dW5uZWxzLnNldChyZW1vdGVIb3N0LCBuZXcgTWFwKCkpO1xuXHRcdH1cblx0XHR0aGlzLl90dW5uZWxzLmdldChyZW1vdGVIb3N0KSEuc2V0KHJlbW90ZVBvcnQsIHsgcmVmY291bnQ6IDEsIHZhbHVlOiB0dW5uZWwgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbW92ZUVtcHR5T3JFcnJvclR1bm5lbEZyb21NYXAocmVtb3RlSG9zdDogc3RyaW5nLCByZW1vdGVQb3J0OiBudW1iZXIpIHtcblx0XHRjb25zdCBob3N0TWFwID0gdGhpcy5fdHVubmVscy5nZXQocmVtb3RlSG9zdCk7XG5cdFx0aWYgKGhvc3RNYXApIHtcblx0XHRcdGNvbnN0IHR1bm5lbCA9IGhvc3RNYXAuZ2V0KHJlbW90ZVBvcnQpO1xuXHRcdFx0Y29uc3QgdHVubmVsUmVzdWx0ID0gdHVubmVsID8gYXdhaXQgdHVubmVsLnZhbHVlIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCF0dW5uZWxSZXN1bHQgfHwgKHR5cGVvZiB0dW5uZWxSZXN1bHQgPT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHRob3N0TWFwLmRlbGV0ZShyZW1vdGVQb3J0KTtcblx0XHRcdH1cblx0XHRcdGlmIChob3N0TWFwLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fdHVubmVscy5kZWxldGUocmVtb3RlSG9zdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldFR1bm5lbEZyb21NYXAocmVtb3RlSG9zdDogc3RyaW5nLCByZW1vdGVQb3J0OiBudW1iZXIpOiB7IHJlZmNvdW50OiBudW1iZXI7IHJlYWRvbmx5IHZhbHVlOiBQcm9taXNlPFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHVuZGVmaW5lZD4gfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaG9zdHMgPSBbcmVtb3RlSG9zdF07XG5cdFx0Ly8gT3JkZXIgbWF0dGVycy4gV2Ugd2FudCB0aGUgb3JpZ2luYWwgaG9zdCB0byBiZSBmaXJzdC5cblx0XHRpZiAoaXNMb2NhbGhvc3QocmVtb3RlSG9zdCkpIHtcblx0XHRcdGhvc3RzLnB1c2goLi4uTE9DQUxIT1NUX0FERFJFU1NFUyk7XG5cdFx0XHQvLyBGb3IgbG9jYWxob3N0LCB3ZSBhZGQgdGhlIGFsbCBpbnRlcmZhY2VzIGhvc3RzIGJlY2F1c2UgaWYgdGhlIHR1bm5lbCBpcyBhbHJlYWR5IGF2YWlsYWJsZSBhdCBhbGwgaW50ZXJmYWNlcyxcblx0XHRcdC8vIHRoZW4gb2YgY291cnNlIGl0IGlzIGF2YWlsYWJsZSBhdCBsb2NhbGhvc3QuXG5cdFx0XHRob3N0cy5wdXNoKC4uLkFMTF9JTlRFUkZBQ0VTX0FERFJFU1NFUyk7XG5cdFx0fSBlbHNlIGlmIChpc0FsbEludGVyZmFjZXMocmVtb3RlSG9zdCkpIHtcblx0XHRcdGhvc3RzLnB1c2goLi4uQUxMX0lOVEVSRkFDRVNfQUREUkVTU0VTKTtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZ1BvcnRNYXBzID0gaG9zdHMubWFwKGhvc3QgPT4gdGhpcy5fdHVubmVscy5nZXQoaG9zdCkpO1xuXHRcdGZvciAoY29uc3QgbWFwIG9mIGV4aXN0aW5nUG9ydE1hcHMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nVHVubmVsID0gbWFwPy5nZXQocmVtb3RlUG9ydCk7XG5cdFx0XHRpZiAoZXhpc3RpbmdUdW5uZWwpIHtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nVHVubmVsO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y2FuVHVubmVsKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhZXh0cmFjdExvY2FsSG9zdFVyaU1ldGFEYXRhRm9yUG9ydE1hcHBpbmcodXJpKTtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBpc1BvcnRQcml2aWxlZ2VkKHBvcnQ6IG51bWJlcik6IGJvb2xlYW47XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHJldGFpbk9yQ3JlYXRlVHVubmVsKGFkZHJlc3NQcm92aWRlcjogSUFkZHJlc3NQcm92aWRlciB8IElUdW5uZWxQcm92aWRlciwgcmVtb3RlSG9zdDogc3RyaW5nLCByZW1vdGVQb3J0OiBudW1iZXIsIGxvY2FsSG9zdDogc3RyaW5nLCBsb2NhbFBvcnQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZWxldmF0ZUlmTmVlZGVkOiBib29sZWFuLCBwcml2YWN5Pzogc3RyaW5nLCBwcm90b2NvbD86IHN0cmluZyk6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgY3JlYXRlV2l0aFByb3ZpZGVyKHR1bm5lbFByb3ZpZGVyOiBJVHVubmVsUHJvdmlkZXIsIHJlbW90ZUhvc3Q6IHN0cmluZywgcmVtb3RlUG9ydDogbnVtYmVyLCBsb2NhbFBvcnQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZWxldmF0ZUlmTmVlZGVkOiBib29sZWFuLCBwcml2YWN5Pzogc3RyaW5nLCBwcm90b2NvbD86IHN0cmluZyk6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKFR1bm5lbFNlcnZpY2UpIENyZWF0aW5nIHR1bm5lbCB3aXRoIHByb3ZpZGVyICR7cmVtb3RlSG9zdH06JHtyZW1vdGVQb3J0fSBvbiBsb2NhbCBwb3J0ICR7bG9jYWxQb3J0fS5gKTtcblx0XHRjb25zdCBrZXkgPSByZW1vdGVQb3J0O1xuXHRcdHRoaXMuX2ZhY3RvcnlJblByb2dyZXNzLmFkZChrZXkpO1xuXHRcdGNvbnN0IHByZWZlcnJlZExvY2FsUG9ydCA9IGxvY2FsUG9ydCA9PT0gdW5kZWZpbmVkID8gcmVtb3RlUG9ydCA6IGxvY2FsUG9ydDtcblx0XHRjb25zdCBjcmVhdGlvbkluZm8gPSB7IGVsZXZhdGlvblJlcXVpcmVkOiBlbGV2YXRlSWZOZWVkZWQgPyB0aGlzLmlzUG9ydFByaXZpbGVnZWQocHJlZmVycmVkTG9jYWxQb3J0KSA6IGZhbHNlIH07XG5cdFx0Y29uc3QgdHVubmVsT3B0aW9uczogVHVubmVsT3B0aW9ucyA9IHsgcmVtb3RlQWRkcmVzczogeyBob3N0OiByZW1vdGVIb3N0LCBwb3J0OiByZW1vdGVQb3J0IH0sIGxvY2FsQWRkcmVzc1BvcnQ6IGxvY2FsUG9ydCwgcHJpdmFjeSwgcHVibGljOiBwcml2YWN5ID8gKHByaXZhY3kgIT09IFR1bm5lbFByaXZhY3lJZC5Qcml2YXRlKSA6IHVuZGVmaW5lZCwgcHJvdG9jb2wgfTtcblx0XHRjb25zdCB0dW5uZWwgPSB0dW5uZWxQcm92aWRlci5mb3J3YXJkUG9ydCh0dW5uZWxPcHRpb25zLCBjcmVhdGlvbkluZm8pO1xuXHRcdGlmICh0dW5uZWwpIHtcblx0XHRcdHRoaXMuYWRkVHVubmVsVG9NYXAocmVtb3RlSG9zdCwgcmVtb3RlUG9ydCwgdHVubmVsKTtcblx0XHRcdHR1bm5lbC5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdGb3J3YXJkZWRQb3J0czogKFR1bm5lbFNlcnZpY2UpIFR1bm5lbCBjcmVhdGVkIGJ5IHByb3ZpZGVyLicpO1xuXHRcdFx0XHR0aGlzLl9mYWN0b3J5SW5Qcm9ncmVzcy5kZWxldGUoa2V5KTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9mYWN0b3J5SW5Qcm9ncmVzcy5kZWxldGUoa2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHR1bm5lbDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQXNCO0FBQy9CLFNBQXNCLGtCQUFrQjtBQUN4QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFJckIsTUFBTSxpQkFBaUIsZ0JBQWdDLGVBQWU7QUFDdEUsTUFBTSx3QkFBd0IsZ0JBQXVDLHNCQUFzQjtBQVkzRixTQUFTLGVBQWUsV0FBK0M7QUFDN0UsUUFBTSxXQUFrQztBQUN4QyxTQUFPLENBQUMsRUFBRSxTQUFTLG9CQUFvQixTQUFTLG9CQUFvQixTQUFTLGdCQUFnQixTQUFTLFdBQVcsU0FBUztBQUMzSDtBQVdPLElBQUssaUJBQUwsa0JBQUtBLG9CQUFMO0FBQ04sRUFBQUEsZ0JBQUEsVUFBTztBQUNQLEVBQUFBLGdCQUFBLFdBQVE7QUFGRyxTQUFBQTtBQUFBLEdBQUE7QUFLTCxJQUFLLGtCQUFMLGtCQUFLQyxxQkFBTDtBQUNOLEVBQUFBLGlCQUFBLHFCQUFrQjtBQUNsQixFQUFBQSxpQkFBQSxhQUFVO0FBQ1YsRUFBQUEsaUJBQUEsWUFBUztBQUhFLFNBQUFBO0FBQUEsR0FBQTtBQXdCTCxTQUFTLGlCQUFpQix5QkFBeUc7QUFDekksU0FBTyxDQUFDLENBQUUsd0JBQTRDO0FBQ3ZEO0FBRU8sSUFBSyx3QkFBTCxrQkFBS0MsMkJBQUw7QUFDTixFQUFBQSw4Q0FBQSxZQUFTLEtBQVQ7QUFDQSxFQUFBQSw4Q0FBQSxpQkFBYyxLQUFkO0FBQ0EsRUFBQUEsOENBQUEsaUJBQWMsS0FBZDtBQUNBLEVBQUFBLDhDQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLDhDQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLDhDQUFBLHFCQUFrQixLQUFsQjtBQU5XLFNBQUFBO0FBQUEsR0FBQTtBQXdFTCxTQUFTLDBDQUEwQyxLQUF5RDtBQUNsSCxNQUFJLElBQUksV0FBVyxVQUFVLElBQUksV0FBVyxTQUFTO0FBQ3BELFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxpQkFBaUIsOENBQThDLEtBQUssSUFBSSxTQUFTO0FBQ3ZGLE1BQUksQ0FBQyxnQkFBZ0I7QUFDcEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQUEsSUFDTixTQUFTLGVBQWUsQ0FBQztBQUFBLElBQ3pCLE1BQU0sQ0FBQyxlQUFlLENBQUM7QUFBQSxFQUN4QjtBQUNEO0FBRU8sU0FBUywrQ0FBK0MsS0FBeUQ7QUFDdkgsTUFBSSxJQUFJLFdBQVcsVUFBVSxJQUFJLFdBQVcsV0FBVyxDQUFDLElBQUksT0FBTztBQUNsRSxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sWUFBWSxJQUFJLE1BQU0sTUFBTSxHQUFHO0FBQ3JDLGFBQVcsWUFBWSxXQUFXO0FBQ2pDLFVBQU0sUUFBUSxTQUFTLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFDbkMsUUFBSSxXQUFXLEtBQUssS0FBSyxHQUFHO0FBQzNCLFlBQU0sU0FBUywwQ0FBMEMsSUFBSSxNQUFNLEtBQUssQ0FBQztBQUN6RSxVQUFJLFFBQVE7QUFDWCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRU8sTUFBTSxzQkFBc0IsQ0FBQyxhQUFhLGFBQWEsbUJBQW1CLEtBQUs7QUFDL0UsU0FBUyxZQUFZLE1BQXVCO0FBQ2xELFNBQU8sb0JBQW9CLFFBQVEsSUFBSSxLQUFLO0FBQzdDO0FBRU8sTUFBTSwyQkFBMkIsQ0FBQyxXQUFXLG1CQUFtQixJQUFJO0FBQ3BFLFNBQVMsZ0JBQWdCLE1BQXVCO0FBQ3RELFNBQU8seUJBQXlCLFFBQVEsSUFBSSxLQUFLO0FBQ2xEO0FBRU8sU0FBUyxpQkFBaUIsTUFBYyxNQUFjLElBQXFCLFdBQTRCO0FBQzdHLE1BQUksT0FBTyxnQkFBZ0IsU0FBUztBQUNuQyxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksT0FBTyxnQkFBZ0IsV0FBVztBQUNyQyxRQUFJLGdCQUFnQixJQUFJLEdBQUc7QUFDMUIsWUFBTSxZQUFhLHVCQUF3QixLQUFLLFNBQVM7QUFDekQsVUFBSSxXQUFXLFdBQVcsR0FBRztBQUM1QixjQUFNLFFBQVEsU0FBUyxVQUFVLENBQUMsQ0FBQztBQUNuQyxZQUFJLFNBQVMsSUFBb0Q7QUFDaEUsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTyxPQUFPO0FBQ2Y7QUFFTyxNQUFNLGlCQUFpQjtBQUFBLEVBSTdCLFlBQ2lCLGVBQ0EsY0FDQyxVQUErQjtBQUZoQztBQUNBO0FBQ0M7QUFObEIsU0FBUSxhQUE0QixJQUFJLFFBQVE7QUFDaEQsU0FBUyxlQUE0QixLQUFLLFdBQVc7QUFBQSxFQUtGO0FBQUEsRUFFbkQsVUFBeUI7QUFDeEIsU0FBSyxXQUFXLEtBQUs7QUFDckIsU0FBSyxXQUFXLFFBQVE7QUFDeEIsV0FBTyxLQUFLLFNBQVM7QUFBQSxFQUN0QjtBQUNEO0FBRU8sSUFBZSx3QkFBZixjQUE2QyxXQUFxQztBQUFBLEVBZ0JqRixZQUMwQixZQUNVLHNCQUN6QztBQUFFLFVBQU07QUFGdUI7QUFDVTtBQWYzQyxTQUFRLGtCQUFrQixLQUFLLFVBQVUsSUFBSSxRQUFzQixDQUFDO0FBQ3BFLFNBQU8saUJBQXNDLEtBQUssZ0JBQWdCO0FBQ2xFLFNBQVEsa0JBQWtCLEtBQUssVUFBVSxJQUFJLFFBQXdDLENBQUM7QUFDdEYsU0FBTyxpQkFBd0QsS0FBSyxnQkFBZ0I7QUFDcEYsU0FBUSx5QkFBeUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ25FLFNBQU8sd0JBQXFDLEtBQUssdUJBQXVCO0FBQ3hFLFNBQW1CLFdBQVcsb0JBQUksSUFBK0g7QUFFakssU0FBVSxjQUF1QjtBQUNqQyxTQUFRLHFCQUE4QjtBQUN0QyxTQUFRLGtCQUFtQyxDQUFDO0FBQzVDLFNBQVEscUJBQTBDLG9CQUFJLElBQUk7QUFBQSxFQUs3QztBQUFBLEVBRWIsSUFBSSxvQkFBNkI7QUFDaEMsV0FBTyxDQUFDLENBQUMsS0FBSztBQUFBLEVBQ2Y7QUFBQSxFQUVBLElBQWMsb0JBQTRCO0FBQ3pDLFVBQU0sZUFBZSxLQUFLLHFCQUFxQixTQUFTLHNCQUFzQjtBQUM5RSxXQUFRLENBQUMsZ0JBQWdCLGlCQUFpQixjQUFlLGNBQWM7QUFBQSxFQUN4RTtBQUFBLEVBRUEsa0JBQWtCLFVBQW9EO0FBQ3JFLFNBQUssa0JBQWtCO0FBQ3ZCLFFBQUksQ0FBQyxVQUFVO0FBRWQsV0FBSyxjQUFjO0FBQ25CLFdBQUssa0JBQWtCLENBQUM7QUFDeEIsV0FBSyx1QkFBdUIsS0FBSztBQUNqQyxhQUFPO0FBQUEsUUFDTixTQUFTLE1BQU07QUFBQSxRQUFFO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBRUEsU0FBSyx1QkFBdUIsS0FBSztBQUNqQyxXQUFPO0FBQUEsTUFDTixTQUFTLE1BQU07QUFDZCxhQUFLLGtCQUFrQjtBQUN2QixhQUFLLGNBQWM7QUFDbkIsYUFBSyxrQkFBa0IsQ0FBQztBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGtCQUFrQixVQUF3QztBQUN6RCxTQUFLLGNBQWMsU0FBUztBQUM1QixTQUFLLGtCQUFrQixTQUFTO0FBQ2hDLFNBQUsscUJBQXFCLFNBQVM7QUFBQSxFQUNwQztBQUFBLEVBRUEsSUFBVyxvQkFBNkI7QUFDdkMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyxhQUFzQjtBQUNoQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFXLG1CQUFtQjtBQUM3QixXQUFPLEtBQUssZ0JBQWdCLFNBQVM7QUFBQSxFQUN0QztBQUFBLEVBRUEsSUFBVyxpQkFBaUI7QUFDM0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyxVQUE0QztBQUN0RCxXQUFPLEtBQUssV0FBVztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxNQUFjLGFBQStDO0FBQzVELFVBQU0sVUFBMEIsQ0FBQztBQUNqQyxVQUFNLGNBQWMsTUFBTSxLQUFLLEtBQUssU0FBUyxPQUFPLENBQUM7QUFDckQsZUFBVyxXQUFXLGFBQWE7QUFDbEMsWUFBTSxZQUFZLE1BQU0sS0FBSyxRQUFRLE9BQU8sQ0FBQztBQUM3QyxpQkFBVyxLQUFLLFdBQVc7QUFDMUIsY0FBTSxjQUFjLE1BQU0sRUFBRTtBQUM1QixZQUFJLGVBQWdCLE9BQU8sZ0JBQWdCLFVBQVc7QUFDckQsa0JBQVEsS0FBSyxXQUFXO0FBQUEsUUFDekI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFlLFVBQXlCO0FBQ3ZDLFVBQU0sUUFBUTtBQUNkLGVBQVcsV0FBVyxLQUFLLFNBQVMsT0FBTyxHQUFHO0FBQzdDLGlCQUFXLEVBQUUsTUFBTSxLQUFLLFFBQVEsT0FBTyxHQUFHO0FBQ3pDLGNBQU0sTUFBTSxLQUFLLFlBQVUsT0FBTyxXQUFXLFdBQVcsUUFBUSxRQUFRLElBQUksTUFBUztBQUFBLE1BQ3RGO0FBQ0EsY0FBUSxNQUFNO0FBQUEsSUFDZjtBQUNBLFNBQUssU0FBUyxNQUFNO0FBQUEsRUFDckI7QUFBQSxFQUVBLHFCQUFxQixZQUFvQixZQUFvQixjQUFzQixTQUFpQixVQUF3QjtBQUMzSCxTQUFLLGVBQWUsWUFBWSxZQUFZLFFBQVEsUUFBUTtBQUFBLE1BQzNELGtCQUFrQjtBQUFBLE1BQ2xCLGtCQUFrQjtBQUFBLE1BQ2xCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLFNBQVMsTUFBTSxRQUFRLFFBQVE7QUFBQSxJQUNoQyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixZQUFvQixZQUFnRTtBQUMzRyxRQUFJLGdCQUFnQixVQUFVLEtBQUssWUFBWSxVQUFVLEdBQUc7QUFDM0QsbUJBQWEsb0JBQW9CLENBQUM7QUFBQSxJQUNuQztBQUVBLFVBQU0sV0FBVyxLQUFLLGlCQUFpQixZQUFZLFVBQVU7QUFDN0QsUUFBSSxVQUFVO0FBQ2IsUUFBRSxTQUFTO0FBQ1gsYUFBTyxTQUFTO0FBQUEsSUFDakI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsV0FBVyxpQkFBK0MsWUFBZ0MsWUFBb0IsV0FBb0IsV0FBb0Isa0JBQTJCLE9BQU8sU0FBa0IsVUFBMkU7QUFDcFIsU0FBSyxXQUFXLE1BQU0sMERBQTBELFVBQVUsSUFBSSxVQUFVLGtCQUFrQixTQUFTLEdBQUc7QUFDdEksVUFBTSwwQkFBMEIsS0FBSyxtQkFBbUI7QUFDeEQsUUFBSSxDQUFDLHlCQUF5QjtBQUM3QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksQ0FBQyxZQUFZO0FBQ2hCLG1CQUFhO0FBQUEsSUFDZDtBQUNBLFFBQUksQ0FBQyxXQUFXO0FBQ2Ysa0JBQVksS0FBSztBQUFBLElBQ2xCO0FBR0EsUUFBSSxLQUFLLG1CQUFtQixLQUFLLG1CQUFtQixJQUFJLFVBQVUsR0FBRztBQUNwRSxXQUFLLFdBQVcsTUFBTSw4SkFBOEo7QUFDcEw7QUFBQSxJQUNEO0FBRUEsVUFBTSxpQkFBaUIsS0FBSyxxQkFBcUIseUJBQXlCLFlBQVksWUFBWSxXQUFXLFdBQVcsaUJBQWlCLFNBQVMsUUFBUTtBQUMxSixRQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLFdBQUssV0FBVyxNQUFNLHlEQUF5RDtBQUMvRSxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sZUFBZSxLQUFLLFlBQVU7QUFDcEMsVUFBSSxDQUFDLFFBQVE7QUFDWixhQUFLLFdBQVcsTUFBTSwwREFBMEQ7QUFDaEYsYUFBSyxnQ0FBZ0MsWUFBWSxVQUFVO0FBQzNELGVBQU87QUFBQSxNQUNSLFdBQVcsT0FBTyxXQUFXLFVBQVU7QUFDdEMsYUFBSyxXQUFXLE1BQU0saUdBQWlHO0FBQ3ZILGFBQUssZ0NBQWdDLFlBQVksVUFBVTtBQUMzRCxlQUFPO0FBQUEsTUFDUjtBQUNBLFdBQUssV0FBVyxNQUFNLHlEQUF5RDtBQUMvRSxZQUFNLFlBQVksS0FBSyxXQUFXLE1BQU07QUFDeEMsVUFBSSxPQUFPLHFCQUFxQixjQUFjLE9BQU8scUJBQXFCLFlBQVk7QUFDckYsYUFBSyxXQUFXLEtBQUssd0hBQXdIO0FBQUEsTUFDOUk7QUFDQSxVQUFJLFdBQVcsT0FBTyxZQUFZLFNBQVM7QUFDMUMsYUFBSyxXQUFXLEtBQUssbUhBQW1IO0FBQUEsTUFDekk7QUFDQSxXQUFLLGdCQUFnQixLQUFLLFNBQVM7QUFDbkMsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLFdBQVcsUUFBb0M7QUFDdEQsV0FBTztBQUFBLE1BQ04sa0JBQWtCLE9BQU87QUFBQSxNQUN6QixrQkFBa0IsT0FBTztBQUFBLE1BQ3pCLGlCQUFpQixPQUFPO0FBQUEsTUFDeEIsY0FBYyxPQUFPO0FBQUEsTUFDckIsU0FBUyxPQUFPO0FBQUEsTUFDaEIsVUFBVSxPQUFPO0FBQUEsTUFDakIsU0FBUyxZQUFZO0FBQ3BCLGFBQUssV0FBVyxNQUFNLHVEQUF1RCxPQUFPLGdCQUFnQixJQUFJLE9BQU8sZ0JBQWdCLEdBQUc7QUFDbEksY0FBTSxlQUFlLEtBQUssU0FBUyxJQUFJLE9BQU8sZ0JBQWdCO0FBQzlELFlBQUksY0FBYztBQUNqQixnQkFBTSxXQUFXLGFBQWEsSUFBSSxPQUFPLGdCQUFnQjtBQUN6RCxjQUFJLFVBQVU7QUFDYixxQkFBUztBQUNULGtCQUFNLEtBQUssaUJBQWlCLE9BQU8sa0JBQWtCLE9BQU8sa0JBQWtCLFFBQVE7QUFBQSxVQUN2RjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLFlBQW9CLFlBQW9CLFFBQXlHO0FBQy9LLFFBQUksT0FBTyxZQUFZLEdBQUc7QUFDekIsV0FBSyxXQUFXLE1BQU0sNERBQTRELFVBQVUsSUFBSSxVQUFVLEdBQUc7QUFDN0csWUFBTSxpQkFBZ0MsT0FBTyxNQUFNLEtBQUssT0FBT0MsWUFBVztBQUN6RSxZQUFJQSxXQUFXLE9BQU9BLFlBQVcsVUFBVztBQUMzQyxnQkFBTUEsUUFBTyxRQUFRLElBQUk7QUFDekIsZUFBSyxnQkFBZ0IsS0FBSyxFQUFFLE1BQU1BLFFBQU8sa0JBQWtCLE1BQU1BLFFBQU8saUJBQWlCLENBQUM7QUFBQSxRQUMzRjtBQUFBLE1BQ0QsQ0FBQztBQUNELFVBQUksS0FBSyxTQUFTLElBQUksVUFBVSxHQUFHO0FBQ2xDLGFBQUssU0FBUyxJQUFJLFVBQVUsRUFBRyxPQUFPLFVBQVU7QUFBQSxNQUNqRDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxZQUFZLFlBQW9CLFlBQW1DO0FBQ3hFLFNBQUssV0FBVyxNQUFNLHFEQUFxRCxVQUFVLElBQUksVUFBVSxHQUFHO0FBQ3RHLFVBQU0sVUFBVSxLQUFLLFNBQVMsSUFBSSxVQUFVO0FBQzVDLFFBQUksV0FBVyxRQUFRLElBQUksVUFBVSxHQUFHO0FBQ3ZDLFlBQU0sUUFBUSxRQUFRLElBQUksVUFBVTtBQUNwQyxZQUFNLFdBQVc7QUFDakIsWUFBTSxLQUFLLGlCQUFpQixZQUFZLFlBQVksS0FBSztBQUFBLElBQzFEO0FBQUEsRUFDRDtBQUFBLEVBRVUsZUFBZSxZQUFvQixZQUFvQixRQUFvRDtBQUNwSCxRQUFJLENBQUMsS0FBSyxTQUFTLElBQUksVUFBVSxHQUFHO0FBQ25DLFdBQUssU0FBUyxJQUFJLFlBQVksb0JBQUksSUFBSSxDQUFDO0FBQUEsSUFDeEM7QUFDQSxTQUFLLFNBQVMsSUFBSSxVQUFVLEVBQUcsSUFBSSxZQUFZLEVBQUUsVUFBVSxHQUFHLE9BQU8sT0FBTyxDQUFDO0FBQUEsRUFDOUU7QUFBQSxFQUVBLE1BQWMsZ0NBQWdDLFlBQW9CLFlBQW9CO0FBQ3JGLFVBQU0sVUFBVSxLQUFLLFNBQVMsSUFBSSxVQUFVO0FBQzVDLFFBQUksU0FBUztBQUNaLFlBQU0sU0FBUyxRQUFRLElBQUksVUFBVTtBQUNyQyxZQUFNLGVBQWUsU0FBUyxNQUFNLE9BQU8sUUFBUTtBQUNuRCxVQUFJLENBQUMsZ0JBQWlCLE9BQU8saUJBQWlCLFVBQVc7QUFDeEQsZ0JBQVEsT0FBTyxVQUFVO0FBQUEsTUFDMUI7QUFDQSxVQUFJLFFBQVEsU0FBUyxHQUFHO0FBQ3ZCLGFBQUssU0FBUyxPQUFPLFVBQVU7QUFBQSxNQUNoQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFVSxpQkFBaUIsWUFBb0IsWUFBa0g7QUFDaEssVUFBTSxRQUFRLENBQUMsVUFBVTtBQUV6QixRQUFJLFlBQVksVUFBVSxHQUFHO0FBQzVCLFlBQU0sS0FBSyxHQUFHLG1CQUFtQjtBQUdqQyxZQUFNLEtBQUssR0FBRyx3QkFBd0I7QUFBQSxJQUN2QyxXQUFXLGdCQUFnQixVQUFVLEdBQUc7QUFDdkMsWUFBTSxLQUFLLEdBQUcsd0JBQXdCO0FBQUEsSUFDdkM7QUFFQSxVQUFNLG1CQUFtQixNQUFNLElBQUksVUFBUSxLQUFLLFNBQVMsSUFBSSxJQUFJLENBQUM7QUFDbEUsZUFBVyxPQUFPLGtCQUFrQjtBQUNuQyxZQUFNLGlCQUFpQixLQUFLLElBQUksVUFBVTtBQUMxQyxVQUFJLGdCQUFnQjtBQUNuQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsVUFBVSxLQUFtQjtBQUM1QixXQUFPLENBQUMsQ0FBQywwQ0FBMEMsR0FBRztBQUFBLEVBQ3ZEO0FBQUEsRUFNVSxtQkFBbUIsZ0JBQWlDLFlBQW9CLFlBQW9CLFdBQStCLGlCQUEwQixTQUFrQixVQUEyRTtBQUMzUCxTQUFLLFdBQVcsTUFBTSxpRUFBaUUsVUFBVSxJQUFJLFVBQVUsa0JBQWtCLFNBQVMsR0FBRztBQUM3SSxVQUFNLE1BQU07QUFDWixTQUFLLG1CQUFtQixJQUFJLEdBQUc7QUFDL0IsVUFBTSxxQkFBcUIsY0FBYyxTQUFZLGFBQWE7QUFDbEUsVUFBTSxlQUFlLEVBQUUsbUJBQW1CLGtCQUFrQixLQUFLLGlCQUFpQixrQkFBa0IsSUFBSSxNQUFNO0FBQzlHLFVBQU0sZ0JBQStCLEVBQUUsZUFBZSxFQUFFLE1BQU0sWUFBWSxNQUFNLFdBQVcsR0FBRyxrQkFBa0IsV0FBVyxTQUFTLFFBQVEsVUFBVyxZQUFZLDBCQUEyQixRQUFXLFNBQVM7QUFDbE4sVUFBTSxTQUFTLGVBQWUsWUFBWSxlQUFlLFlBQVk7QUFDckUsUUFBSSxRQUFRO0FBQ1gsV0FBSyxlQUFlLFlBQVksWUFBWSxNQUFNO0FBQ2xELGFBQU8sUUFBUSxNQUFNO0FBQ3BCLGFBQUssV0FBVyxNQUFNLDZEQUE2RDtBQUNuRixhQUFLLG1CQUFtQixPQUFPLEdBQUc7QUFBQSxNQUNuQyxDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sV0FBSyxtQkFBbUIsT0FBTyxHQUFHO0FBQUEsSUFDbkM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBdlNzQix3QkFBZjtBQUFBLEVBaUJKO0FBQUEsRUFDQTtBQUFBLEdBbEJtQjsiLAogICJuYW1lcyI6IFsiVHVubmVsUHJvdG9jb2wiLCAiVHVubmVsUHJpdmFjeUlkIiwgIlByb3ZpZGVkT25BdXRvRm9yd2FyZCIsICJ0dW5uZWwiXQp9Cg==
