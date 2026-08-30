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
import { debounce } from "../../../../base/common/decorators.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { hash } from "../../../../base/common/hash.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITunnelService, TunnelProtocol, TunnelPrivacyId, LOCALHOST_ADDRESSES, isLocalhost, isAllInterfaces, ProvidedOnAutoForward, ALL_INTERFACES_ADDRESSES } from "../../../../platform/tunnel/common/tunnel.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { isNumber, isObject, isString } from "../../../../base/common/types.js";
import { deepClone } from "../../../../base/common/objects.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
const MISMATCH_LOCAL_PORT_COOLDOWN = 10 * 1e3;
const TUNNELS_TO_RESTORE = "remote.tunnels.toRestore";
const TUNNELS_TO_RESTORE_EXPIRATION = "remote.tunnels.toRestoreExpiration";
const RESTORE_EXPIRATION_TIME = 1e3 * 60 * 60 * 24 * 14;
const ACTIVATION_EVENT = "onTunnel";
const forwardedPortsFeaturesEnabled = new RawContextKey("forwardedPortsViewEnabled", false, nls.localize("tunnel.forwardedPortsViewEnabled", "Whether the Ports view is enabled."));
const forwardedPortsViewEnabled = new RawContextKey("forwardedPortsViewOnlyEnabled", false, nls.localize("tunnel.forwardedPortsViewEnabled", "Whether the Ports view is enabled."));
function parseAddress(address) {
  const matches = address.match(/^([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*:)?([0-9]+)$/);
  if (!matches) {
    return void 0;
  }
  return { host: matches[1]?.substring(0, matches[1].length - 1) || "localhost", port: Number(matches[2]) };
}
var TunnelCloseReason = /* @__PURE__ */ ((TunnelCloseReason2) => {
  TunnelCloseReason2["Other"] = "Other";
  TunnelCloseReason2["User"] = "User";
  TunnelCloseReason2["AutoForwardEnd"] = "AutoForwardEnd";
  return TunnelCloseReason2;
})(TunnelCloseReason || {});
var TunnelSource = /* @__PURE__ */ ((TunnelSource2) => {
  TunnelSource2[TunnelSource2["User"] = 0] = "User";
  TunnelSource2[TunnelSource2["Auto"] = 1] = "Auto";
  TunnelSource2[TunnelSource2["Extension"] = 2] = "Extension";
  return TunnelSource2;
})(TunnelSource || {});
const UserTunnelSource = {
  source: 0 /* User */,
  description: nls.localize("tunnel.source.user", "User Forwarded")
};
const AutoTunnelSource = {
  source: 1 /* Auto */,
  description: nls.localize("tunnel.source.auto", "Auto Forwarded")
};
function mapHasAddress(map, host, port) {
  const initialAddress = map.get(makeAddress(host, port));
  if (initialAddress) {
    return initialAddress;
  }
  if (isLocalhost(host)) {
    for (const testHost of LOCALHOST_ADDRESSES) {
      const testAddress = makeAddress(testHost, port);
      if (map.has(testAddress)) {
        return map.get(testAddress);
      }
    }
  } else if (isAllInterfaces(host)) {
    for (const testHost of ALL_INTERFACES_ADDRESSES) {
      const testAddress = makeAddress(testHost, port);
      if (map.has(testAddress)) {
        return map.get(testAddress);
      }
    }
  }
  return void 0;
}
function mapHasAddressLocalhostOrAllInterfaces(map, host, port) {
  const originalAddress = mapHasAddress(map, host, port);
  if (originalAddress) {
    return originalAddress;
  }
  const otherHost = isAllInterfaces(host) ? "localhost" : isLocalhost(host) ? "0.0.0.0" : void 0;
  if (otherHost) {
    return mapHasAddress(map, otherHost, port);
  }
  return void 0;
}
function makeAddress(host, port) {
  return host + ":" + port;
}
var OnPortForward = /* @__PURE__ */ ((OnPortForward2) => {
  OnPortForward2["Notify"] = "notify";
  OnPortForward2["OpenBrowser"] = "openBrowser";
  OnPortForward2["OpenBrowserOnce"] = "openBrowserOnce";
  OnPortForward2["OpenPreview"] = "openPreview";
  OnPortForward2["Silent"] = "silent";
  OnPortForward2["Ignore"] = "ignore";
  return OnPortForward2;
})(OnPortForward || {});
function isCandidatePort(candidate) {
  return candidate && "host" in candidate && typeof candidate.host === "string" && "port" in candidate && typeof candidate.port === "number" && (!("detail" in candidate) || typeof candidate.detail === "string") && (!("pid" in candidate) || typeof candidate.pid === "string");
}
const _PortsAttributes = class _PortsAttributes extends Disposable {
  constructor(configurationService) {
    super();
    this.configurationService = configurationService;
    this.portsAttributes = [];
    this._onDidChangeAttributes = this._register(new Emitter());
    this.onDidChangeAttributes = this._onDidChangeAttributes.event;
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(_PortsAttributes.SETTING) || e.affectsConfiguration(_PortsAttributes.DEFAULTS)) {
        this.updateAttributes();
      }
    }));
    this.updateAttributes();
  }
  updateAttributes() {
    this.portsAttributes = this.readSetting();
    this._onDidChangeAttributes.fire();
  }
  getAttributes(port, host, commandLine) {
    let index = this.findNextIndex(port, host, commandLine, this.portsAttributes, 0);
    const attributes = {
      label: void 0,
      onAutoForward: void 0,
      elevateIfNeeded: void 0,
      requireLocalPort: void 0,
      protocol: void 0
    };
    while (index >= 0) {
      const found = this.portsAttributes[index];
      if (found.key === port) {
        attributes.onAutoForward = found.onAutoForward ?? attributes.onAutoForward;
        attributes.elevateIfNeeded = found.elevateIfNeeded !== void 0 ? found.elevateIfNeeded : attributes.elevateIfNeeded;
        attributes.label = found.label ?? attributes.label;
        attributes.requireLocalPort = found.requireLocalPort;
        attributes.protocol = found.protocol;
      } else {
        attributes.onAutoForward = attributes.onAutoForward ?? found.onAutoForward;
        attributes.elevateIfNeeded = attributes.elevateIfNeeded !== void 0 ? attributes.elevateIfNeeded : found.elevateIfNeeded;
        attributes.label = attributes.label ?? found.label;
        attributes.requireLocalPort = attributes.requireLocalPort !== void 0 ? attributes.requireLocalPort : void 0;
        attributes.protocol = attributes.protocol ?? found.protocol;
      }
      index = this.findNextIndex(port, host, commandLine, this.portsAttributes, index + 1);
    }
    if (attributes.onAutoForward !== void 0 || attributes.elevateIfNeeded !== void 0 || attributes.label !== void 0 || attributes.requireLocalPort !== void 0 || attributes.protocol !== void 0) {
      return attributes;
    }
    return this.getOtherAttributes();
  }
  hasStartEnd(value) {
    return value.start !== void 0 && value.end !== void 0;
  }
  hasHostAndPort(value) {
    return value.host !== void 0 && value.port !== void 0 && isString(value.host) && isNumber(value.port);
  }
  findNextIndex(port, host, commandLine, attributes, fromIndex) {
    if (fromIndex >= attributes.length) {
      return -1;
    }
    const shouldUseHost = !isLocalhost(host) && !isAllInterfaces(host);
    const sliced = attributes.slice(fromIndex);
    const foundIndex = sliced.findIndex((value) => {
      if (isNumber(value.key)) {
        return shouldUseHost ? false : value.key === port;
      } else if (this.hasStartEnd(value.key)) {
        return shouldUseHost ? false : port >= value.key.start && port <= value.key.end;
      } else if (this.hasHostAndPort(value.key)) {
        return port === value.key.port && host === value.key.host;
      } else {
        return commandLine ? value.key.test(commandLine) : false;
      }
    });
    return foundIndex >= 0 ? foundIndex + fromIndex : -1;
  }
  readSetting() {
    const settingValue = this.configurationService.getValue(_PortsAttributes.SETTING);
    if (!settingValue || !isObject(settingValue)) {
      return [];
    }
    const attributes = [];
    for (const attributesKey in settingValue) {
      if (attributesKey === void 0) {
        continue;
      }
      const setting = settingValue[attributesKey];
      let key = void 0;
      if (Number(attributesKey)) {
        key = Number(attributesKey);
      } else if (isString(attributesKey)) {
        if (_PortsAttributes.RANGE.test(attributesKey)) {
          const match = attributesKey.match(_PortsAttributes.RANGE);
          key = { start: Number(match[1]), end: Number(match[2]) };
        } else if (_PortsAttributes.HOST_AND_PORT.test(attributesKey)) {
          const match = attributesKey.match(_PortsAttributes.HOST_AND_PORT);
          key = { host: match[1], port: Number(match[2]) };
        } else {
          let regTest = void 0;
          try {
            regTest = RegExp(attributesKey);
          } catch (e) {
          }
          if (regTest) {
            key = regTest;
          }
        }
      }
      if (!key) {
        continue;
      }
      attributes.push({
        key,
        elevateIfNeeded: setting.elevateIfNeeded,
        onAutoForward: setting.onAutoForward,
        label: setting.label,
        requireLocalPort: setting.requireLocalPort,
        protocol: setting.protocol
      });
    }
    const defaults = this.configurationService.getValue(_PortsAttributes.DEFAULTS);
    if (defaults) {
      this.defaultPortAttributes = {
        elevateIfNeeded: defaults.elevateIfNeeded,
        label: defaults.label,
        onAutoForward: defaults.onAutoForward,
        requireLocalPort: defaults.requireLocalPort,
        protocol: defaults.protocol
      };
    }
    return this.sortAttributes(attributes);
  }
  sortAttributes(attributes) {
    function getVal(item, thisRef) {
      if (isNumber(item.key)) {
        return item.key;
      } else if (thisRef.hasStartEnd(item.key)) {
        return item.key.start;
      } else if (thisRef.hasHostAndPort(item.key)) {
        return item.key.port;
      } else {
        return Number.MAX_VALUE;
      }
    }
    return attributes.sort((a, b) => {
      return getVal(a, this) - getVal(b, this);
    });
  }
  getOtherAttributes() {
    return this.defaultPortAttributes;
  }
  static providedActionToAction(providedAction) {
    switch (providedAction) {
      case ProvidedOnAutoForward.Notify:
        return "notify" /* Notify */;
      case ProvidedOnAutoForward.OpenBrowser:
        return "openBrowser" /* OpenBrowser */;
      case ProvidedOnAutoForward.OpenBrowserOnce:
        return "openBrowserOnce" /* OpenBrowserOnce */;
      case ProvidedOnAutoForward.OpenPreview:
        return "openPreview" /* OpenPreview */;
      case ProvidedOnAutoForward.Silent:
        return "silent" /* Silent */;
      case ProvidedOnAutoForward.Ignore:
        return "ignore" /* Ignore */;
      default:
        return void 0;
    }
  }
  async addAttributes(port, attributes, target) {
    const settingValue = this.configurationService.inspect(_PortsAttributes.SETTING);
    const remoteValue = settingValue.userRemoteValue;
    let newRemoteValue;
    if (!remoteValue || !isObject(remoteValue)) {
      newRemoteValue = {};
    } else {
      newRemoteValue = deepClone(remoteValue);
    }
    if (!newRemoteValue[`${port}`]) {
      newRemoteValue[`${port}`] = {};
    }
    for (const attribute in attributes) {
      newRemoteValue[`${port}`][attribute] = attributes[attribute];
    }
    return this.configurationService.updateValue(_PortsAttributes.SETTING, newRemoteValue, target);
  }
};
_PortsAttributes.SETTING = "remote.portsAttributes";
_PortsAttributes.DEFAULTS = "remote.otherPortsAttributes";
_PortsAttributes.RANGE = /^(\d+)\-(\d+)$/;
_PortsAttributes.HOST_AND_PORT = /^([a-z0-9\-]+):(\d{1,5})$/;
let PortsAttributes = _PortsAttributes;
let TunnelModel = class extends Disposable {
  constructor(tunnelService, storageService, configurationService, environmentService, remoteAuthorityResolverService, workspaceContextService, logService, dialogService, extensionService, contextKeyService) {
    super();
    this.tunnelService = tunnelService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.environmentService = environmentService;
    this.remoteAuthorityResolverService = remoteAuthorityResolverService;
    this.workspaceContextService = workspaceContextService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.extensionService = extensionService;
    this.contextKeyService = contextKeyService;
    this.inProgress = /* @__PURE__ */ new Map();
    this._onForwardPort = this._register(new Emitter());
    this.onForwardPort = this._onForwardPort.event;
    this._onClosePort = this._register(new Emitter());
    this.onClosePort = this._onClosePort.event;
    this._onPortName = this._register(new Emitter());
    this.onPortName = this._onPortName.event;
    this._onCandidatesChanged = this._register(new Emitter());
    // onCandidateChanged returns the removed candidates
    this.onCandidatesChanged = this._onCandidatesChanged.event;
    this._onEnvironmentTunnelsSet = this._register(new Emitter());
    this.onEnvironmentTunnelsSet = this._onEnvironmentTunnelsSet.event;
    this._environmentTunnelsSet = false;
    this.restoreListener = void 0;
    this.restoreComplete = false;
    this.onRestoreComplete = this._register(new Emitter());
    this.unrestoredExtensionTunnels = /* @__PURE__ */ new Map();
    this.sessionCachedProperties = /* @__PURE__ */ new Map();
    this.portAttributesProviders = [];
    this.hasCheckedExtensionsOnTunnelOpened = false;
    this.mismatchCooldown = /* @__PURE__ */ new Date();
    this.configPortsAttributes = new PortsAttributes(configurationService);
    this.tunnelRestoreValue = this.getTunnelRestoreValue();
    this._register(this.configPortsAttributes.onDidChangeAttributes(this.updateAttributes, this));
    this.forwarded = /* @__PURE__ */ new Map();
    this.remoteTunnels = /* @__PURE__ */ new Map();
    this.tunnelService.tunnels.then(async (tunnels) => {
      const attributes = await this.getAttributes(tunnels.map((tunnel) => {
        return { port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost };
      }));
      for (const tunnel of tunnels) {
        if (tunnel.localAddress) {
          const key = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
          const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
          this.forwarded.set(key, {
            remotePort: tunnel.tunnelRemotePort,
            remoteHost: tunnel.tunnelRemoteHost,
            localAddress: tunnel.localAddress,
            protocol: attributes?.get(tunnel.tunnelRemotePort)?.protocol ?? TunnelProtocol.Http,
            localUri: await this.makeLocalUri(tunnel.localAddress, attributes?.get(tunnel.tunnelRemotePort)),
            localPort: tunnel.tunnelLocalPort,
            name: attributes?.get(tunnel.tunnelRemotePort)?.label,
            runningProcess: matchingCandidate?.detail,
            hasRunningProcess: !!matchingCandidate,
            pid: matchingCandidate?.pid,
            privacy: tunnel.privacy,
            source: UserTunnelSource
          });
          this.remoteTunnels.set(key, tunnel);
        }
      }
    });
    this.detected = /* @__PURE__ */ new Map();
    this._register(this.tunnelService.onTunnelOpened(async (tunnel) => {
      const key = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
      if (!mapHasAddressLocalhostOrAllInterfaces(this.forwarded, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort) && !mapHasAddressLocalhostOrAllInterfaces(this.detected, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort) && !mapHasAddressLocalhostOrAllInterfaces(this.inProgress, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort) && tunnel.localAddress) {
        const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
        const attributes = (await this.getAttributes([{ port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost }]))?.get(tunnel.tunnelRemotePort);
        this.forwarded.set(key, {
          remoteHost: tunnel.tunnelRemoteHost,
          remotePort: tunnel.tunnelRemotePort,
          localAddress: tunnel.localAddress,
          protocol: attributes?.protocol ?? TunnelProtocol.Http,
          localUri: await this.makeLocalUri(tunnel.localAddress, attributes),
          localPort: tunnel.tunnelLocalPort,
          name: attributes?.label,
          closeable: true,
          runningProcess: matchingCandidate?.detail,
          hasRunningProcess: !!matchingCandidate,
          pid: matchingCandidate?.pid,
          privacy: tunnel.privacy,
          source: UserTunnelSource
        });
      }
      await this.storeForwarded();
      this.checkExtensionActivationEvents(true);
      this.remoteTunnels.set(key, tunnel);
      this._onForwardPort.fire(this.forwarded.get(key));
    }));
    this._register(this.tunnelService.onTunnelClosed((address) => {
      return this.onTunnelClosed(address, "Other" /* Other */);
    }));
    this.checkExtensionActivationEvents(false);
  }
  extensionHasActivationEvent() {
    if (this.extensionService.extensions.find((extension) => extension.activationEvents?.includes(ACTIVATION_EVENT))) {
      this.contextKeyService.createKey(forwardedPortsViewEnabled.key, true);
      return true;
    }
    return false;
  }
  checkExtensionActivationEvents(tunnelOpened) {
    if (this.hasCheckedExtensionsOnTunnelOpened) {
      return;
    }
    if (tunnelOpened) {
      this.hasCheckedExtensionsOnTunnelOpened = true;
    }
    const hasRemote = this.environmentService.remoteAuthority !== void 0;
    if (hasRemote && !tunnelOpened) {
      return;
    }
    if (this.extensionHasActivationEvent()) {
      return;
    }
    const activationDisposable = this._register(this.extensionService.onDidRegisterExtensions(() => {
      if (this.extensionHasActivationEvent()) {
        activationDisposable.dispose();
      }
    }));
  }
  async onTunnelClosed(address, reason) {
    const key = makeAddress(address.host, address.port);
    if (this.forwarded.delete(key)) {
      await this.storeForwarded();
      this._onClosePort.fire(address);
    }
  }
  makeLocalUri(localAddress, attributes) {
    if (localAddress.startsWith("http")) {
      return URI.parse(localAddress);
    }
    const protocol = attributes?.protocol ?? "http";
    return URI.parse(`${protocol}://${localAddress}`);
  }
  async addStorageKeyPostfix(prefix) {
    const workspace = this.workspaceContextService.getWorkspace();
    const workspaceHash = workspace.configuration ? hash(workspace.configuration.path) : workspace.folders.length > 0 ? hash(workspace.folders[0].uri.path) : void 0;
    if (workspaceHash === void 0) {
      this.logService.debug("Could not get workspace hash for forwarded ports storage key.");
      return void 0;
    }
    return `${prefix}.${this.environmentService.remoteAuthority}.${workspaceHash}`;
  }
  async getTunnelRestoreStorageKey() {
    return this.addStorageKeyPostfix(TUNNELS_TO_RESTORE);
  }
  async getRestoreExpirationStorageKey() {
    return this.addStorageKeyPostfix(TUNNELS_TO_RESTORE_EXPIRATION);
  }
  async getTunnelRestoreValue() {
    const deprecatedValue = this.storageService.get(TUNNELS_TO_RESTORE, StorageScope.WORKSPACE);
    if (deprecatedValue) {
      this.storageService.remove(TUNNELS_TO_RESTORE, StorageScope.WORKSPACE);
      await this.storeForwarded();
      return deprecatedValue;
    }
    const storageKey = await this.getTunnelRestoreStorageKey();
    if (!storageKey) {
      return void 0;
    }
    return this.storageService.get(storageKey, StorageScope.PROFILE);
  }
  async restoreForwarded() {
    this.cleanupExpiredTunnelsForRestore();
    if (this.configurationService.getValue("remote.restoreForwardedPorts")) {
      const tunnelRestoreValue = await this.tunnelRestoreValue;
      if (tunnelRestoreValue && tunnelRestoreValue !== this.knownPortsRestoreValue) {
        const tunnels = JSON.parse(tunnelRestoreValue) ?? [];
        this.logService.trace(`ForwardedPorts: (TunnelModel) restoring ports ${tunnels.map((tunnel) => tunnel.remotePort).join(", ")}`);
        for (const tunnel of tunnels) {
          const alreadyForwarded = mapHasAddressLocalhostOrAllInterfaces(this.detected, tunnel.remoteHost, tunnel.remotePort);
          if (tunnel.source.source !== 2 /* Extension */ && !alreadyForwarded || tunnel.source.source === 2 /* Extension */ && alreadyForwarded) {
            await this.doForward({
              remote: { host: tunnel.remoteHost, port: tunnel.remotePort },
              local: tunnel.localPort,
              name: tunnel.name,
              elevateIfNeeded: true,
              source: tunnel.source
            });
          } else if (tunnel.source.source === 2 /* Extension */ && !alreadyForwarded) {
            this.unrestoredExtensionTunnels.set(makeAddress(tunnel.remoteHost, tunnel.remotePort), tunnel);
          }
        }
      }
    }
    this.restoreComplete = true;
    this.onRestoreComplete.fire();
    if (!this.restoreListener) {
      const key = await this.getTunnelRestoreStorageKey();
      this.restoreListener = this._register(new DisposableStore());
      this.restoreListener.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, void 0, this.restoreListener)(async (e) => {
        if (e.key === key) {
          this.tunnelRestoreValue = Promise.resolve(this.storageService.get(key, StorageScope.PROFILE));
          await this.restoreForwarded();
        }
      }));
    }
  }
  cleanupExpiredTunnelsForRestore() {
    const keys = this.storageService.keys(StorageScope.PROFILE, StorageTarget.USER).filter((key) => key.startsWith(TUNNELS_TO_RESTORE_EXPIRATION));
    for (const key of keys) {
      const expiration = this.storageService.getNumber(key, StorageScope.PROFILE);
      if (expiration && expiration < Date.now()) {
        this.tunnelRestoreValue = Promise.resolve(void 0);
        const storageKey = key.replace(TUNNELS_TO_RESTORE_EXPIRATION, TUNNELS_TO_RESTORE);
        this.storageService.remove(key, StorageScope.PROFILE);
        this.storageService.remove(storageKey, StorageScope.PROFILE);
      }
    }
  }
  async storeForwarded() {
    if (this.configurationService.getValue("remote.restoreForwardedPorts")) {
      const forwarded = Array.from(this.forwarded.values());
      const restorableTunnels = forwarded.map((tunnel) => {
        return {
          remoteHost: tunnel.remoteHost,
          remotePort: tunnel.remotePort,
          localPort: tunnel.localPort,
          name: tunnel.name,
          localAddress: tunnel.localAddress,
          localUri: tunnel.localUri,
          protocol: tunnel.protocol,
          source: tunnel.source
        };
      });
      let valueToStore;
      if (forwarded.length > 0) {
        valueToStore = JSON.stringify(restorableTunnels);
      }
      const key = await this.getTunnelRestoreStorageKey();
      const expirationKey = await this.getRestoreExpirationStorageKey();
      if (!valueToStore && key && expirationKey) {
        this.storageService.remove(key, StorageScope.PROFILE);
        this.storageService.remove(expirationKey, StorageScope.PROFILE);
      } else if (valueToStore !== this.knownPortsRestoreValue && key && expirationKey) {
        this.storageService.store(key, valueToStore, StorageScope.PROFILE, StorageTarget.USER);
        this.storageService.store(expirationKey, Date.now() + RESTORE_EXPIRATION_TIME, StorageScope.PROFILE, StorageTarget.USER);
      }
      this.knownPortsRestoreValue = valueToStore;
    }
  }
  async showPortMismatchModalIfNeeded(tunnel, expectedLocal, attributes) {
    if (!tunnel.tunnelLocalPort || !attributes?.requireLocalPort) {
      return;
    }
    if (tunnel.tunnelLocalPort === expectedLocal) {
      return;
    }
    const newCooldown = /* @__PURE__ */ new Date();
    if (this.mismatchCooldown.getTime() + MISMATCH_LOCAL_PORT_COOLDOWN > newCooldown.getTime()) {
      return;
    }
    this.mismatchCooldown = newCooldown;
    const mismatchString = nls.localize(
      "remote.localPortMismatch.single",
      "Local port {0} could not be used for forwarding to remote port {1}.\n\nThis usually happens when there is already another process using local port {0}.\n\nPort number {2} has been used instead.",
      expectedLocal,
      tunnel.tunnelRemotePort,
      tunnel.tunnelLocalPort
    );
    return this.dialogService.info(mismatchString);
  }
  async forward(tunnelProperties, attributes) {
    if (!this.restoreComplete && this.environmentService.remoteAuthority) {
      await Event.toPromise(this.onRestoreComplete.event);
    }
    return this.doForward(tunnelProperties, attributes);
  }
  async doForward(tunnelProperties, attributes) {
    await this.extensionService.activateByEvent(ACTIVATION_EVENT);
    const existingTunnel = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, tunnelProperties.remote.host, tunnelProperties.remote.port);
    attributes = attributes ?? (attributes !== null ? (await this.getAttributes([tunnelProperties.remote]))?.get(tunnelProperties.remote.port) : void 0);
    const localPort = tunnelProperties.local !== void 0 ? tunnelProperties.local : tunnelProperties.remote.port;
    let noTunnelValue;
    if (!existingTunnel) {
      const authority = this.environmentService.remoteAuthority;
      const addressProvider = authority ? {
        getAddress: async () => {
          return (await this.remoteAuthorityResolverService.resolveAuthority(authority)).authority;
        }
      } : void 0;
      const key = makeAddress(tunnelProperties.remote.host, tunnelProperties.remote.port);
      this.inProgress.set(key, true);
      tunnelProperties = this.mergeCachedAndUnrestoredProperties(key, tunnelProperties);
      const tunnel = await this.tunnelService.openTunnel(addressProvider, tunnelProperties.remote.host, tunnelProperties.remote.port, void 0, localPort, !tunnelProperties.elevateIfNeeded ? attributes?.elevateIfNeeded : tunnelProperties.elevateIfNeeded, tunnelProperties.privacy, attributes?.protocol);
      if (typeof tunnel === "string") {
        noTunnelValue = tunnel;
      } else if (tunnel && tunnel.localAddress) {
        const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), tunnelProperties.remote.host, tunnelProperties.remote.port);
        const protocol = tunnel.protocol ? tunnel.protocol === TunnelProtocol.Https ? TunnelProtocol.Https : TunnelProtocol.Http : attributes?.protocol ?? TunnelProtocol.Http;
        const newForward = {
          remoteHost: tunnel.tunnelRemoteHost,
          remotePort: tunnel.tunnelRemotePort,
          localPort: tunnel.tunnelLocalPort,
          name: attributes?.label ?? tunnelProperties.name,
          closeable: true,
          localAddress: tunnel.localAddress,
          protocol,
          localUri: await this.makeLocalUri(tunnel.localAddress, attributes),
          runningProcess: matchingCandidate?.detail,
          hasRunningProcess: !!matchingCandidate,
          pid: matchingCandidate?.pid,
          source: tunnelProperties.source ?? UserTunnelSource,
          privacy: tunnel.privacy
        };
        this.forwarded.set(key, newForward);
        this.remoteTunnels.set(key, tunnel);
        this.inProgress.delete(key);
        await this.storeForwarded();
        await this.showPortMismatchModalIfNeeded(tunnel, localPort, attributes);
        this._onForwardPort.fire(newForward);
        return tunnel;
      }
      this.inProgress.delete(key);
    } else {
      return this.mergeAttributesIntoExistingTunnel(existingTunnel, tunnelProperties, attributes);
    }
    return noTunnelValue;
  }
  mergeCachedAndUnrestoredProperties(key, tunnelProperties) {
    const map = this.unrestoredExtensionTunnels.has(key) ? this.unrestoredExtensionTunnels : this.sessionCachedProperties.has(key) ? this.sessionCachedProperties : void 0;
    if (map) {
      const updateProps = map.get(key);
      map.delete(key);
      if (updateProps) {
        tunnelProperties.name = updateProps.name ?? tunnelProperties.name;
        tunnelProperties.local = ("local" in updateProps ? updateProps.local : "localPort" in updateProps ? updateProps.localPort : void 0) ?? tunnelProperties.local;
        tunnelProperties.privacy = tunnelProperties.privacy;
      }
    }
    return tunnelProperties;
  }
  async mergeAttributesIntoExistingTunnel(existingTunnel, tunnelProperties, attributes) {
    const newName = attributes?.label ?? tunnelProperties.name;
    let MergedAttributeAction;
    ((MergedAttributeAction2) => {
      MergedAttributeAction2[MergedAttributeAction2["None"] = 0] = "None";
      MergedAttributeAction2[MergedAttributeAction2["Fire"] = 1] = "Fire";
      MergedAttributeAction2[MergedAttributeAction2["Reopen"] = 2] = "Reopen";
    })(MergedAttributeAction || (MergedAttributeAction = {}));
    let mergedAction = 0 /* None */;
    if (newName !== existingTunnel.name) {
      existingTunnel.name = newName;
      mergedAction = 1 /* Fire */;
    }
    if ((attributes?.protocol || existingTunnel.protocol !== TunnelProtocol.Http) && attributes?.protocol !== existingTunnel.protocol) {
      tunnelProperties.source = existingTunnel.source;
      mergedAction = 2 /* Reopen */;
    }
    if (tunnelProperties.privacy && existingTunnel.privacy !== tunnelProperties.privacy) {
      mergedAction = 2 /* Reopen */;
    }
    switch (mergedAction) {
      case 1 /* Fire */: {
        this._onForwardPort.fire();
        break;
      }
      case 2 /* Reopen */: {
        await this.close(existingTunnel.remoteHost, existingTunnel.remotePort, "User" /* User */);
        await this.doForward(tunnelProperties, attributes);
      }
    }
    return mapHasAddressLocalhostOrAllInterfaces(this.remoteTunnels, tunnelProperties.remote.host, tunnelProperties.remote.port);
  }
  async name(host, port, name) {
    const existingForwarded = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, host, port);
    const key = makeAddress(host, port);
    if (existingForwarded) {
      existingForwarded.name = name;
      await this.storeForwarded();
      this._onPortName.fire({ host, port });
      return;
    } else if (this.detected.has(key)) {
      this.detected.get(key).name = name;
      this._onPortName.fire({ host, port });
    }
  }
  async close(host, port, reason) {
    const key = makeAddress(host, port);
    const oldTunnel = this.forwarded.get(key);
    if (reason === "AutoForwardEnd" /* AutoForwardEnd */ && oldTunnel && oldTunnel.source.source === 1 /* Auto */) {
      this.sessionCachedProperties.set(key, {
        local: oldTunnel.localPort,
        name: oldTunnel.name,
        privacy: oldTunnel.privacy
      });
    }
    await this.tunnelService.closeTunnel(host, port);
    return this.onTunnelClosed({ host, port }, reason);
  }
  address(host, port) {
    const key = makeAddress(host, port);
    return (this.forwarded.get(key) || this.detected.get(key))?.localAddress;
  }
  get environmentTunnelsSet() {
    return this._environmentTunnelsSet;
  }
  addEnvironmentTunnels(tunnels) {
    if (tunnels) {
      for (const tunnel of tunnels) {
        const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), tunnel.remoteAddress.host, tunnel.remoteAddress.port);
        const localAddress = typeof tunnel.localAddress === "string" ? tunnel.localAddress : makeAddress(tunnel.localAddress.host, tunnel.localAddress.port);
        this.detected.set(makeAddress(tunnel.remoteAddress.host, tunnel.remoteAddress.port), {
          remoteHost: tunnel.remoteAddress.host,
          remotePort: tunnel.remoteAddress.port,
          localAddress,
          protocol: TunnelProtocol.Http,
          localUri: this.makeLocalUri(localAddress),
          closeable: false,
          runningProcess: matchingCandidate?.detail,
          hasRunningProcess: !!matchingCandidate,
          pid: matchingCandidate?.pid,
          privacy: TunnelPrivacyId.ConstantPrivate,
          source: {
            source: 2 /* Extension */,
            description: nls.localize("tunnel.staticallyForwarded", "Statically Forwarded")
          }
        });
        this.tunnelService.setEnvironmentTunnel(tunnel.remoteAddress.host, tunnel.remoteAddress.port, localAddress, TunnelPrivacyId.ConstantPrivate, TunnelProtocol.Http);
      }
    }
    this._environmentTunnelsSet = true;
    this._onEnvironmentTunnelsSet.fire();
    this._onForwardPort.fire();
  }
  setCandidateFilter(filter) {
    this._candidateFilter = filter;
  }
  async setCandidates(candidates) {
    let processedCandidates = candidates;
    if (this._candidateFilter) {
      processedCandidates = await this._candidateFilter(candidates);
    }
    const removedCandidates = this.updateInResponseToCandidates(processedCandidates);
    this.logService.trace(`ForwardedPorts: (TunnelModel) removed candidates ${Array.from(removedCandidates.values()).map((candidate) => candidate.port).join(", ")}`);
    this._onCandidatesChanged.fire(removedCandidates);
  }
  // Returns removed candidates
  updateInResponseToCandidates(candidates) {
    const removedCandidates = this._candidates ?? /* @__PURE__ */ new Map();
    const candidatesMap = /* @__PURE__ */ new Map();
    this._candidates = candidatesMap;
    candidates.forEach((value) => {
      const addressKey = makeAddress(value.host, value.port);
      candidatesMap.set(addressKey, {
        host: value.host,
        port: value.port,
        detail: value.detail,
        pid: value.pid
      });
      removedCandidates.delete(addressKey);
      const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, value.host, value.port);
      if (forwardedValue) {
        forwardedValue.runningProcess = value.detail;
        forwardedValue.hasRunningProcess = true;
        forwardedValue.pid = value.pid;
      }
    });
    removedCandidates.forEach((_value, key) => {
      const parsedAddress = parseAddress(key);
      if (!parsedAddress) {
        return;
      }
      const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(this.forwarded, parsedAddress.host, parsedAddress.port);
      if (forwardedValue) {
        forwardedValue.runningProcess = void 0;
        forwardedValue.hasRunningProcess = false;
        forwardedValue.pid = void 0;
      }
      const detectedValue = mapHasAddressLocalhostOrAllInterfaces(this.detected, parsedAddress.host, parsedAddress.port);
      if (detectedValue) {
        detectedValue.runningProcess = void 0;
        detectedValue.hasRunningProcess = false;
        detectedValue.pid = void 0;
      }
    });
    return removedCandidates;
  }
  get candidates() {
    return this._candidates ? Array.from(this._candidates.values()) : [];
  }
  get candidatesOrUndefined() {
    return this._candidates ? this.candidates : void 0;
  }
  async updateAttributes() {
    const tunnels = Array.from(this.forwarded.values());
    const allAttributes = await this.getAttributes(tunnels.map((tunnel) => {
      return { port: tunnel.remotePort, host: tunnel.remoteHost };
    }), false);
    if (!allAttributes) {
      return;
    }
    for (const forwarded of tunnels) {
      const attributes = allAttributes.get(forwarded.remotePort);
      if ((attributes?.protocol || forwarded.protocol !== TunnelProtocol.Http) && attributes?.protocol !== forwarded.protocol) {
        await this.doForward({
          remote: { host: forwarded.remoteHost, port: forwarded.remotePort },
          local: forwarded.localPort,
          name: forwarded.name,
          source: forwarded.source
        }, attributes);
      }
      if (!attributes) {
        continue;
      }
      if (attributes.label && attributes.label !== forwarded.name) {
        await this.name(forwarded.remoteHost, forwarded.remotePort, attributes.label);
      }
    }
  }
  async getAttributes(forwardedPorts, checkProviders = true) {
    const matchingCandidates = /* @__PURE__ */ new Map();
    const pidToPortsMapping = /* @__PURE__ */ new Map();
    forwardedPorts.forEach((forwardedPort) => {
      const matchingCandidate = mapHasAddressLocalhostOrAllInterfaces(this._candidates ?? /* @__PURE__ */ new Map(), LOCALHOST_ADDRESSES[0], forwardedPort.port) ?? forwardedPort;
      if (matchingCandidate) {
        matchingCandidates.set(forwardedPort.port, matchingCandidate);
        const pid = isCandidatePort(matchingCandidate) ? matchingCandidate.pid : void 0;
        if (!pidToPortsMapping.has(pid)) {
          pidToPortsMapping.set(pid, []);
        }
        pidToPortsMapping.get(pid)?.push(forwardedPort.port);
      }
    });
    const configAttributes = /* @__PURE__ */ new Map();
    forwardedPorts.forEach((forwardedPort) => {
      const attributes = this.configPortsAttributes.getAttributes(forwardedPort.port, forwardedPort.host, matchingCandidates.get(forwardedPort.port)?.detail);
      if (attributes) {
        configAttributes.set(forwardedPort.port, attributes);
      }
    });
    if (this.portAttributesProviders.length === 0 || !checkProviders) {
      return configAttributes.size > 0 ? configAttributes : void 0;
    }
    const allProviderResults = await Promise.all(this.portAttributesProviders.flatMap((provider) => {
      return Array.from(pidToPortsMapping.entries()).map((entry) => {
        const portGroup = entry[1];
        const matchingCandidate = matchingCandidates.get(portGroup[0]);
        return provider.providePortAttributes(
          portGroup,
          matchingCandidate?.pid,
          matchingCandidate?.detail,
          CancellationToken.None
        );
      });
    }));
    const providedAttributes = /* @__PURE__ */ new Map();
    allProviderResults.forEach((attributes) => attributes.forEach((attribute) => {
      if (attribute) {
        providedAttributes.set(attribute.port, attribute);
      }
    }));
    if (!configAttributes && !providedAttributes) {
      return void 0;
    }
    const mergedAttributes = /* @__PURE__ */ new Map();
    forwardedPorts.forEach((forwardedPorts2) => {
      const config = configAttributes.get(forwardedPorts2.port);
      const provider = providedAttributes.get(forwardedPorts2.port);
      mergedAttributes.set(forwardedPorts2.port, {
        elevateIfNeeded: config?.elevateIfNeeded,
        label: config?.label,
        onAutoForward: config?.onAutoForward ?? PortsAttributes.providedActionToAction(provider?.autoForwardAction),
        requireLocalPort: config?.requireLocalPort,
        protocol: config?.protocol
      });
    });
    return mergedAttributes;
  }
  addAttributesProvider(provider) {
    this.portAttributesProviders.push(provider);
  }
};
__decorateClass([
  debounce(1e3)
], TunnelModel.prototype, "storeForwarded", 1);
TunnelModel = __decorateClass([
  __decorateParam(0, ITunnelService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, IRemoteAuthorityResolverService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, IContextKeyService)
], TunnelModel);
export {
  ACTIVATION_EVENT,
  AutoTunnelSource,
  OnPortForward,
  PortsAttributes,
  TunnelCloseReason,
  TunnelModel,
  TunnelSource,
  UserTunnelSource,
  forwardedPortsFeaturesEnabled,
  forwardedPortsViewEnabled,
  isCandidatePort,
  makeAddress,
  mapHasAddress,
  mapHasAddressLocalhostOrAllInterfaces,
  parseAddress
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxyZW1vdGVcXGNvbW1vblxcdHVubmVsTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWRkcmVzc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZSwgVHVubmVsRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBSZW1vdGVUdW5uZWwsIElUdW5uZWxTZXJ2aWNlLCBUdW5uZWxQcm90b2NvbCwgVHVubmVsUHJpdmFjeUlkLCBMT0NBTEhPU1RfQUREUkVTU0VTLCBQcm92aWRlZFBvcnRBdHRyaWJ1dGVzLCBQb3J0QXR0cmlidXRlc1Byb3ZpZGVyLCBpc0xvY2FsaG9zdCwgaXNBbGxJbnRlcmZhY2VzLCBQcm92aWRlZE9uQXV0b0ZvcndhcmQsIEFMTF9JTlRFUkZBQ0VTX0FERFJFU1NFUyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9jb21tb24vdHVubmVsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc051bWJlciwgaXNPYmplY3QsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcblxuY29uc3QgTUlTTUFUQ0hfTE9DQUxfUE9SVF9DT09MRE9XTiA9IDEwICogMTAwMDsgLy8gMTAgc2Vjb25kc1xuY29uc3QgVFVOTkVMU19UT19SRVNUT1JFID0gJ3JlbW90ZS50dW5uZWxzLnRvUmVzdG9yZSc7XG5jb25zdCBUVU5ORUxTX1RPX1JFU1RPUkVfRVhQSVJBVElPTiA9ICdyZW1vdGUudHVubmVscy50b1Jlc3RvcmVFeHBpcmF0aW9uJztcbmNvbnN0IFJFU1RPUkVfRVhQSVJBVElPTl9USU1FID0gMTAwMCAqIDYwICogNjAgKiAyNCAqIDE0OyAvLyAyIHdlZWtzXG5leHBvcnQgY29uc3QgQUNUSVZBVElPTl9FVkVOVCA9ICdvblR1bm5lbCc7XG5leHBvcnQgY29uc3QgZm9yd2FyZGVkUG9ydHNGZWF0dXJlc0VuYWJsZWQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZm9yd2FyZGVkUG9ydHNWaWV3RW5hYmxlZCcsIGZhbHNlLCBubHMubG9jYWxpemUoJ3R1bm5lbC5mb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkJywgXCJXaGV0aGVyIHRoZSBQb3J0cyB2aWV3IGlzIGVuYWJsZWQuXCIpKTtcbmV4cG9ydCBjb25zdCBmb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2ZvcndhcmRlZFBvcnRzVmlld09ubHlFbmFibGVkJywgZmFsc2UsIG5scy5sb2NhbGl6ZSgndHVubmVsLmZvcndhcmRlZFBvcnRzVmlld0VuYWJsZWQnLCBcIldoZXRoZXIgdGhlIFBvcnRzIHZpZXcgaXMgZW5hYmxlZC5cIikpO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlc3RvcmFibGVUdW5uZWwge1xuXHRyZW1vdGVIb3N0OiBzdHJpbmc7XG5cdHJlbW90ZVBvcnQ6IG51bWJlcjtcblx0bG9jYWxBZGRyZXNzOiBzdHJpbmc7XG5cdGxvY2FsVXJpOiBVUkk7XG5cdHByb3RvY29sOiBUdW5uZWxQcm90b2NvbDtcblx0bG9jYWxQb3J0PzogbnVtYmVyO1xuXHRuYW1lPzogc3RyaW5nO1xuXHRzb3VyY2U6IHtcblx0XHRzb3VyY2U6IFR1bm5lbFNvdXJjZTtcblx0XHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFR1bm5lbCB7XG5cdHJlbW90ZUhvc3Q6IHN0cmluZztcblx0cmVtb3RlUG9ydDogbnVtYmVyO1xuXHRsb2NhbEFkZHJlc3M6IHN0cmluZztcblx0bG9jYWxVcmk6IFVSSTtcblx0cHJvdG9jb2w6IFR1bm5lbFByb3RvY29sO1xuXHRsb2NhbFBvcnQ/OiBudW1iZXI7XG5cdG5hbWU/OiBzdHJpbmc7XG5cdGNsb3NlYWJsZT86IGJvb2xlYW47XG5cdHByaXZhY3k6IFR1bm5lbFByaXZhY3lJZCB8IHN0cmluZztcblx0cnVubmluZ1Byb2Nlc3M6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0aGFzUnVubmluZ1Byb2Nlc3M/OiBib29sZWFuO1xuXHRwaWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0c291cmNlOiB7XG5cdFx0c291cmNlOiBUdW5uZWxTb3VyY2U7XG5cdFx0ZGVzY3JpcHRpb246IHN0cmluZztcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQWRkcmVzcyhhZGRyZXNzOiBzdHJpbmcpOiB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRjb25zdCBtYXRjaGVzID0gYWRkcmVzcy5tYXRjaCgvXihbYS16QS1aMC05Xy1dKyg/OlxcLlthLXpBLVowLTlfLV0rKSo6KT8oWzAtOV0rKSQvKTtcblx0aWYgKCFtYXRjaGVzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4geyBob3N0OiBtYXRjaGVzWzFdPy5zdWJzdHJpbmcoMCwgbWF0Y2hlc1sxXS5sZW5ndGggLSAxKSB8fCAnbG9jYWxob3N0JywgcG9ydDogTnVtYmVyKG1hdGNoZXNbMl0pIH07XG59XG5cbmV4cG9ydCBlbnVtIFR1bm5lbENsb3NlUmVhc29uIHtcblx0T3RoZXIgPSAnT3RoZXInLFxuXHRVc2VyID0gJ1VzZXInLFxuXHRBdXRvRm9yd2FyZEVuZCA9ICdBdXRvRm9yd2FyZEVuZCcsXG59XG5cbmV4cG9ydCBlbnVtIFR1bm5lbFNvdXJjZSB7XG5cdFVzZXIsXG5cdEF1dG8sXG5cdEV4dGVuc2lvblxufVxuXG5leHBvcnQgY29uc3QgVXNlclR1bm5lbFNvdXJjZSA9IHtcblx0c291cmNlOiBUdW5uZWxTb3VyY2UuVXNlcixcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndHVubmVsLnNvdXJjZS51c2VyJywgXCJVc2VyIEZvcndhcmRlZFwiKVxufTtcbmV4cG9ydCBjb25zdCBBdXRvVHVubmVsU291cmNlID0ge1xuXHRzb3VyY2U6IFR1bm5lbFNvdXJjZS5BdXRvLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0dW5uZWwuc291cmNlLmF1dG8nLCBcIkF1dG8gRm9yd2FyZGVkXCIpXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gbWFwSGFzQWRkcmVzczxUPihtYXA6IE1hcDxzdHJpbmcsIFQ+LCBob3N0OiBzdHJpbmcsIHBvcnQ6IG51bWJlcik6IFQgfCB1bmRlZmluZWQge1xuXHRjb25zdCBpbml0aWFsQWRkcmVzcyA9IG1hcC5nZXQobWFrZUFkZHJlc3MoaG9zdCwgcG9ydCkpO1xuXHRpZiAoaW5pdGlhbEFkZHJlc3MpIHtcblx0XHRyZXR1cm4gaW5pdGlhbEFkZHJlc3M7XG5cdH1cblxuXHRpZiAoaXNMb2NhbGhvc3QoaG9zdCkpIHtcblx0XHQvLyBEbyBsb2NhbGhvc3QgY2hlY2tzXG5cdFx0Zm9yIChjb25zdCB0ZXN0SG9zdCBvZiBMT0NBTEhPU1RfQUREUkVTU0VTKSB7XG5cdFx0XHRjb25zdCB0ZXN0QWRkcmVzcyA9IG1ha2VBZGRyZXNzKHRlc3RIb3N0LCBwb3J0KTtcblx0XHRcdGlmIChtYXAuaGFzKHRlc3RBZGRyZXNzKSkge1xuXHRcdFx0XHRyZXR1cm4gbWFwLmdldCh0ZXN0QWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgaWYgKGlzQWxsSW50ZXJmYWNlcyhob3N0KSkge1xuXHRcdC8vIERvIGFsbCBpbnRlcmZhY2VzIGNoZWNrc1xuXHRcdGZvciAoY29uc3QgdGVzdEhvc3Qgb2YgQUxMX0lOVEVSRkFDRVNfQUREUkVTU0VTKSB7XG5cdFx0XHRjb25zdCB0ZXN0QWRkcmVzcyA9IG1ha2VBZGRyZXNzKHRlc3RIb3N0LCBwb3J0KTtcblx0XHRcdGlmIChtYXAuaGFzKHRlc3RBZGRyZXNzKSkge1xuXHRcdFx0XHRyZXR1cm4gbWFwLmdldCh0ZXN0QWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXM8VD4obWFwOiBNYXA8c3RyaW5nLCBUPiwgaG9zdDogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBUIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgb3JpZ2luYWxBZGRyZXNzID0gbWFwSGFzQWRkcmVzcyhtYXAsIGhvc3QsIHBvcnQpO1xuXHRpZiAob3JpZ2luYWxBZGRyZXNzKSB7XG5cdFx0cmV0dXJuIG9yaWdpbmFsQWRkcmVzcztcblx0fVxuXHRjb25zdCBvdGhlckhvc3QgPSBpc0FsbEludGVyZmFjZXMoaG9zdCkgPyAnbG9jYWxob3N0JyA6IChpc0xvY2FsaG9zdChob3N0KSA/ICcwLjAuMC4wJyA6IHVuZGVmaW5lZCk7XG5cdGlmIChvdGhlckhvc3QpIHtcblx0XHRyZXR1cm4gbWFwSGFzQWRkcmVzcyhtYXAsIG90aGVySG9zdCwgcG9ydCk7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gbWFrZUFkZHJlc3MoaG9zdDogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gaG9zdCArICc6JyArIHBvcnQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHVubmVsUHJvcGVydGllcyB7XG5cdHJlbW90ZTogeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9O1xuXHRsb2NhbD86IG51bWJlcjtcblx0bmFtZT86IHN0cmluZztcblx0c291cmNlPzoge1xuXHRcdHNvdXJjZTogVHVubmVsU291cmNlO1xuXHRcdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdH07XG5cdGVsZXZhdGVJZk5lZWRlZD86IGJvb2xlYW47XG5cdHByaXZhY3k/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FuZGlkYXRlUG9ydCB7XG5cdGhvc3Q6IHN0cmluZztcblx0cG9ydDogbnVtYmVyO1xuXHRkZXRhaWw/OiBzdHJpbmc7XG5cdHBpZD86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFBvcnRBdHRyaWJ1dGVzIGV4dGVuZHMgQXR0cmlidXRlcyB7XG5cdGtleTogbnVtYmVyIHwgUG9ydFJhbmdlIHwgUmVnRXhwIHwgSG9zdEFuZFBvcnQ7XG59XG5cbmV4cG9ydCBlbnVtIE9uUG9ydEZvcndhcmQge1xuXHROb3RpZnkgPSAnbm90aWZ5Jyxcblx0T3BlbkJyb3dzZXIgPSAnb3BlbkJyb3dzZXInLFxuXHRPcGVuQnJvd3Nlck9uY2UgPSAnb3BlbkJyb3dzZXJPbmNlJyxcblx0T3BlblByZXZpZXcgPSAnb3BlblByZXZpZXcnLFxuXHRTaWxlbnQgPSAnc2lsZW50Jyxcblx0SWdub3JlID0gJ2lnbm9yZSdcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBdHRyaWJ1dGVzIHtcblx0bGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0b25BdXRvRm9yd2FyZDogT25Qb3J0Rm9yd2FyZCB8IHVuZGVmaW5lZDtcblx0ZWxldmF0ZUlmTmVlZGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRyZXF1aXJlTG9jYWxQb3J0OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcm90b2NvbDogVHVubmVsUHJvdG9jb2wgfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBQb3J0UmFuZ2UgeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlciB9XG5cbmludGVyZmFjZSBIb3N0QW5kUG9ydCB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2FuZGlkYXRlUG9ydChjYW5kaWRhdGU6IGFueSk6IGNhbmRpZGF0ZSBpcyBDYW5kaWRhdGVQb3J0IHtcblx0cmV0dXJuIGNhbmRpZGF0ZSAmJiAnaG9zdCcgaW4gY2FuZGlkYXRlICYmIHR5cGVvZiBjYW5kaWRhdGUuaG9zdCA9PT0gJ3N0cmluZydcblx0XHQmJiAncG9ydCcgaW4gY2FuZGlkYXRlICYmIHR5cGVvZiBjYW5kaWRhdGUucG9ydCA9PT0gJ251bWJlcidcblx0XHQmJiAoISgnZGV0YWlsJyBpbiBjYW5kaWRhdGUpIHx8IHR5cGVvZiBjYW5kaWRhdGUuZGV0YWlsID09PSAnc3RyaW5nJylcblx0XHQmJiAoISgncGlkJyBpbiBjYW5kaWRhdGUpIHx8IHR5cGVvZiBjYW5kaWRhdGUucGlkID09PSAnc3RyaW5nJyk7XG59XG5cbmV4cG9ydCBjbGFzcyBQb3J0c0F0dHJpYnV0ZXMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgU0VUVElORyA9ICdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzJztcblx0cHJpdmF0ZSBzdGF0aWMgREVGQVVMVFMgPSAncmVtb3RlLm90aGVyUG9ydHNBdHRyaWJ1dGVzJztcblx0cHJpdmF0ZSBzdGF0aWMgUkFOR0UgPSAvXihcXGQrKVxcLShcXGQrKSQvO1xuXHRwcml2YXRlIHN0YXRpYyBIT1NUX0FORF9QT1JUID0gL14oW2EtejAtOVxcLV0rKTooXFxkezEsNX0pJC87XG5cdHByaXZhdGUgcG9ydHNBdHRyaWJ1dGVzOiBQb3J0QXR0cmlidXRlc1tdID0gW107XG5cdHByaXZhdGUgZGVmYXVsdFBvcnRBdHRyaWJ1dGVzOiBBdHRyaWJ1dGVzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZUF0dHJpYnV0ZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXR0cmlidXRlcyA9IHRoaXMuX29uRGlkQ2hhbmdlQXR0cmlidXRlcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFBvcnRzQXR0cmlidXRlcy5TRVRUSU5HKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFBvcnRzQXR0cmlidXRlcy5ERUZBVUxUUykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBdHRyaWJ1dGVzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudXBkYXRlQXR0cmlidXRlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBdHRyaWJ1dGVzKCkge1xuXHRcdHRoaXMucG9ydHNBdHRyaWJ1dGVzID0gdGhpcy5yZWFkU2V0dGluZygpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXR0cmlidXRlcy5maXJlKCk7XG5cdH1cblxuXHRnZXRBdHRyaWJ1dGVzKHBvcnQ6IG51bWJlciwgaG9zdDogc3RyaW5nLCBjb21tYW5kTGluZT86IHN0cmluZyk6IEF0dHJpYnV0ZXMgfCB1bmRlZmluZWQge1xuXHRcdGxldCBpbmRleCA9IHRoaXMuZmluZE5leHRJbmRleChwb3J0LCBob3N0LCBjb21tYW5kTGluZSwgdGhpcy5wb3J0c0F0dHJpYnV0ZXMsIDApO1xuXHRcdGNvbnN0IGF0dHJpYnV0ZXM6IEF0dHJpYnV0ZXMgPSB7XG5cdFx0XHRsYWJlbDogdW5kZWZpbmVkLFxuXHRcdFx0b25BdXRvRm9yd2FyZDogdW5kZWZpbmVkLFxuXHRcdFx0ZWxldmF0ZUlmTmVlZGVkOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1aXJlTG9jYWxQb3J0OiB1bmRlZmluZWQsXG5cdFx0XHRwcm90b2NvbDogdW5kZWZpbmVkXG5cdFx0fTtcblx0XHR3aGlsZSAoaW5kZXggPj0gMCkge1xuXHRcdFx0Y29uc3QgZm91bmQgPSB0aGlzLnBvcnRzQXR0cmlidXRlc1tpbmRleF07XG5cdFx0XHRpZiAoZm91bmQua2V5ID09PSBwb3J0KSB7XG5cdFx0XHRcdGF0dHJpYnV0ZXMub25BdXRvRm9yd2FyZCA9IGZvdW5kLm9uQXV0b0ZvcndhcmQgPz8gYXR0cmlidXRlcy5vbkF1dG9Gb3J3YXJkO1xuXHRcdFx0XHRhdHRyaWJ1dGVzLmVsZXZhdGVJZk5lZWRlZCA9IChmb3VuZC5lbGV2YXRlSWZOZWVkZWQgIT09IHVuZGVmaW5lZCkgPyBmb3VuZC5lbGV2YXRlSWZOZWVkZWQgOiBhdHRyaWJ1dGVzLmVsZXZhdGVJZk5lZWRlZDtcblx0XHRcdFx0YXR0cmlidXRlcy5sYWJlbCA9IGZvdW5kLmxhYmVsID8/IGF0dHJpYnV0ZXMubGFiZWw7XG5cdFx0XHRcdGF0dHJpYnV0ZXMucmVxdWlyZUxvY2FsUG9ydCA9IGZvdW5kLnJlcXVpcmVMb2NhbFBvcnQ7XG5cdFx0XHRcdGF0dHJpYnV0ZXMucHJvdG9jb2wgPSBmb3VuZC5wcm90b2NvbDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEl0J3MgYSByYW5nZSBvciByZWdleCwgd2hpY2ggbWVhbnMgdGhhdCBpZiB0aGUgYXR0cmlidXRlIGlzIGFscmVhZHkgc2V0LCB3ZSBrZWVwIGl0XG5cdFx0XHRcdGF0dHJpYnV0ZXMub25BdXRvRm9yd2FyZCA9IGF0dHJpYnV0ZXMub25BdXRvRm9yd2FyZCA/PyBmb3VuZC5vbkF1dG9Gb3J3YXJkO1xuXHRcdFx0XHRhdHRyaWJ1dGVzLmVsZXZhdGVJZk5lZWRlZCA9IChhdHRyaWJ1dGVzLmVsZXZhdGVJZk5lZWRlZCAhPT0gdW5kZWZpbmVkKSA/IGF0dHJpYnV0ZXMuZWxldmF0ZUlmTmVlZGVkIDogZm91bmQuZWxldmF0ZUlmTmVlZGVkO1xuXHRcdFx0XHRhdHRyaWJ1dGVzLmxhYmVsID0gYXR0cmlidXRlcy5sYWJlbCA/PyBmb3VuZC5sYWJlbDtcblx0XHRcdFx0YXR0cmlidXRlcy5yZXF1aXJlTG9jYWxQb3J0ID0gKGF0dHJpYnV0ZXMucmVxdWlyZUxvY2FsUG9ydCAhPT0gdW5kZWZpbmVkKSA/IGF0dHJpYnV0ZXMucmVxdWlyZUxvY2FsUG9ydCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0YXR0cmlidXRlcy5wcm90b2NvbCA9IGF0dHJpYnV0ZXMucHJvdG9jb2wgPz8gZm91bmQucHJvdG9jb2w7XG5cdFx0XHR9XG5cdFx0XHRpbmRleCA9IHRoaXMuZmluZE5leHRJbmRleChwb3J0LCBob3N0LCBjb21tYW5kTGluZSwgdGhpcy5wb3J0c0F0dHJpYnV0ZXMsIGluZGV4ICsgMSk7XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGVzLm9uQXV0b0ZvcndhcmQgIT09IHVuZGVmaW5lZCB8fCBhdHRyaWJ1dGVzLmVsZXZhdGVJZk5lZWRlZCAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBhdHRyaWJ1dGVzLmxhYmVsICE9PSB1bmRlZmluZWQgfHwgYXR0cmlidXRlcy5yZXF1aXJlTG9jYWxQb3J0ICE9PSB1bmRlZmluZWRcblx0XHRcdHx8IGF0dHJpYnV0ZXMucHJvdG9jb2wgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGF0dHJpYnV0ZXM7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgZmluZCBubyBtYXRjaGVzLCB0aGVuIHVzZSB0aGUgb3RoZXIgcG9ydCBhdHRyaWJ1dGVzLlxuXHRcdHJldHVybiB0aGlzLmdldE90aGVyQXR0cmlidXRlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNTdGFydEVuZCh2YWx1ZTogbnVtYmVyIHwgUG9ydFJhbmdlIHwgUmVnRXhwIHwgSG9zdEFuZFBvcnQpOiB2YWx1ZSBpcyBQb3J0UmFuZ2Uge1xuXHRcdHJldHVybiAodmFsdWUgYXMgUGFydGlhbDxQb3J0UmFuZ2U+KS5zdGFydCAhPT0gdW5kZWZpbmVkICYmICh2YWx1ZSBhcyBQYXJ0aWFsPFBvcnRSYW5nZT4pLmVuZCAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNIb3N0QW5kUG9ydCh2YWx1ZTogbnVtYmVyIHwgUG9ydFJhbmdlIHwgUmVnRXhwIHwgSG9zdEFuZFBvcnQpOiB2YWx1ZSBpcyBIb3N0QW5kUG9ydCB7XG5cdFx0cmV0dXJuICgodmFsdWUgYXMgUGFydGlhbDxIb3N0QW5kUG9ydD4pLmhvc3QgIT09IHVuZGVmaW5lZCkgJiYgKCh2YWx1ZSBhcyBQYXJ0aWFsPEhvc3RBbmRQb3J0PikucG9ydCAhPT0gdW5kZWZpbmVkKVxuXHRcdFx0JiYgaXNTdHJpbmcoKHZhbHVlIGFzIFBhcnRpYWw8SG9zdEFuZFBvcnQ+KS5ob3N0KSAmJiBpc051bWJlcigodmFsdWUgYXMgUGFydGlhbDxIb3N0QW5kUG9ydD4pLnBvcnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kTmV4dEluZGV4KHBvcnQ6IG51bWJlciwgaG9zdDogc3RyaW5nLCBjb21tYW5kTGluZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBhdHRyaWJ1dGVzOiBQb3J0QXR0cmlidXRlc1tdLCBmcm9tSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKGZyb21JbmRleCA+PSBhdHRyaWJ1dGVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRjb25zdCBzaG91bGRVc2VIb3N0ID0gIWlzTG9jYWxob3N0KGhvc3QpICYmICFpc0FsbEludGVyZmFjZXMoaG9zdCk7XG5cdFx0Y29uc3Qgc2xpY2VkID0gYXR0cmlidXRlcy5zbGljZShmcm9tSW5kZXgpO1xuXHRcdGNvbnN0IGZvdW5kSW5kZXggPSBzbGljZWQuZmluZEluZGV4KCh2YWx1ZSkgPT4ge1xuXHRcdFx0aWYgKGlzTnVtYmVyKHZhbHVlLmtleSkpIHtcblx0XHRcdFx0cmV0dXJuIHNob3VsZFVzZUhvc3QgPyBmYWxzZSA6IHZhbHVlLmtleSA9PT0gcG9ydDtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5oYXNTdGFydEVuZCh2YWx1ZS5rZXkpKSB7XG5cdFx0XHRcdHJldHVybiBzaG91bGRVc2VIb3N0ID8gZmFsc2UgOiAocG9ydCA+PSB2YWx1ZS5rZXkuc3RhcnQgJiYgcG9ydCA8PSB2YWx1ZS5rZXkuZW5kKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5oYXNIb3N0QW5kUG9ydCh2YWx1ZS5rZXkpKSB7XG5cdFx0XHRcdHJldHVybiAocG9ydCA9PT0gdmFsdWUua2V5LnBvcnQpICYmIChob3N0ID09PSB2YWx1ZS5rZXkuaG9zdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gY29tbWFuZExpbmUgPyB2YWx1ZS5rZXkudGVzdChjb21tYW5kTGluZSkgOiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdH0pO1xuXHRcdHJldHVybiBmb3VuZEluZGV4ID49IDAgPyBmb3VuZEluZGV4ICsgZnJvbUluZGV4IDogLTE7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRTZXR0aW5nKCk6IFBvcnRBdHRyaWJ1dGVzW10ge1xuXHRcdGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUG9ydHNBdHRyaWJ1dGVzLlNFVFRJTkcpO1xuXHRcdGlmICghc2V0dGluZ1ZhbHVlIHx8ICFpc09iamVjdChzZXR0aW5nVmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXR0cmlidXRlczogUG9ydEF0dHJpYnV0ZXNbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYXR0cmlidXRlc0tleSBpbiBzZXR0aW5nVmFsdWUpIHtcblx0XHRcdGlmIChhdHRyaWJ1dGVzS2V5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXR0aW5nID0gKHNldHRpbmdWYWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCBQb3J0QXR0cmlidXRlcz4pW2F0dHJpYnV0ZXNLZXldO1xuXHRcdFx0bGV0IGtleTogbnVtYmVyIHwgUG9ydFJhbmdlIHwgUmVnRXhwIHwgSG9zdEFuZFBvcnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoTnVtYmVyKGF0dHJpYnV0ZXNLZXkpKSB7XG5cdFx0XHRcdGtleSA9IE51bWJlcihhdHRyaWJ1dGVzS2V5KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNTdHJpbmcoYXR0cmlidXRlc0tleSkpIHtcblx0XHRcdFx0aWYgKFBvcnRzQXR0cmlidXRlcy5SQU5HRS50ZXN0KGF0dHJpYnV0ZXNLZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSBhdHRyaWJ1dGVzS2V5Lm1hdGNoKFBvcnRzQXR0cmlidXRlcy5SQU5HRSk7XG5cdFx0XHRcdFx0a2V5ID0geyBzdGFydDogTnVtYmVyKG1hdGNoIVsxXSksIGVuZDogTnVtYmVyKG1hdGNoIVsyXSkgfTtcblx0XHRcdFx0fSBlbHNlIGlmIChQb3J0c0F0dHJpYnV0ZXMuSE9TVF9BTkRfUE9SVC50ZXN0KGF0dHJpYnV0ZXNLZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSBhdHRyaWJ1dGVzS2V5Lm1hdGNoKFBvcnRzQXR0cmlidXRlcy5IT1NUX0FORF9QT1JUKTtcblx0XHRcdFx0XHRrZXkgPSB7IGhvc3Q6IG1hdGNoIVsxXSwgcG9ydDogTnVtYmVyKG1hdGNoIVsyXSkgfTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsZXQgcmVnVGVzdDogUmVnRXhwIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRyZWdUZXN0ID0gUmVnRXhwKGF0dHJpYnV0ZXNLZXkpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdC8vIFRoZSB1c2VyIGVudGVyZWQgYW4gaW52YWxpZCByZWd1bGFyIGV4cHJlc3Npb24uXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChyZWdUZXN0KSB7XG5cdFx0XHRcdFx0XHRrZXkgPSByZWdUZXN0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFrZXkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRhdHRyaWJ1dGVzLnB1c2goe1xuXHRcdFx0XHRrZXk6IGtleSxcblx0XHRcdFx0ZWxldmF0ZUlmTmVlZGVkOiBzZXR0aW5nLmVsZXZhdGVJZk5lZWRlZCxcblx0XHRcdFx0b25BdXRvRm9yd2FyZDogc2V0dGluZy5vbkF1dG9Gb3J3YXJkLFxuXHRcdFx0XHRsYWJlbDogc2V0dGluZy5sYWJlbCxcblx0XHRcdFx0cmVxdWlyZUxvY2FsUG9ydDogc2V0dGluZy5yZXF1aXJlTG9jYWxQb3J0LFxuXHRcdFx0XHRwcm90b2NvbDogc2V0dGluZy5wcm90b2NvbFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFBvcnRzQXR0cmlidXRlcy5ERUZBVUxUUykgYXMgUGFydGlhbDxBdHRyaWJ1dGVzPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZGVmYXVsdHMpIHtcblx0XHRcdHRoaXMuZGVmYXVsdFBvcnRBdHRyaWJ1dGVzID0ge1xuXHRcdFx0XHRlbGV2YXRlSWZOZWVkZWQ6IGRlZmF1bHRzLmVsZXZhdGVJZk5lZWRlZCxcblx0XHRcdFx0bGFiZWw6IGRlZmF1bHRzLmxhYmVsLFxuXHRcdFx0XHRvbkF1dG9Gb3J3YXJkOiBkZWZhdWx0cy5vbkF1dG9Gb3J3YXJkLFxuXHRcdFx0XHRyZXF1aXJlTG9jYWxQb3J0OiBkZWZhdWx0cy5yZXF1aXJlTG9jYWxQb3J0LFxuXHRcdFx0XHRwcm90b2NvbDogZGVmYXVsdHMucHJvdG9jb2xcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc29ydEF0dHJpYnV0ZXMoYXR0cmlidXRlcyk7XG5cdH1cblxuXHRwcml2YXRlIHNvcnRBdHRyaWJ1dGVzKGF0dHJpYnV0ZXM6IFBvcnRBdHRyaWJ1dGVzW10pOiBQb3J0QXR0cmlidXRlc1tdIHtcblx0XHRmdW5jdGlvbiBnZXRWYWwoaXRlbTogUG9ydEF0dHJpYnV0ZXMsIHRoaXNSZWY6IFBvcnRzQXR0cmlidXRlcykge1xuXHRcdFx0aWYgKGlzTnVtYmVyKGl0ZW0ua2V5KSkge1xuXHRcdFx0XHRyZXR1cm4gaXRlbS5rZXk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXNSZWYuaGFzU3RhcnRFbmQoaXRlbS5rZXkpKSB7XG5cdFx0XHRcdHJldHVybiBpdGVtLmtleS5zdGFydDtcblx0XHRcdH0gZWxzZSBpZiAodGhpc1JlZi5oYXNIb3N0QW5kUG9ydChpdGVtLmtleSkpIHtcblx0XHRcdFx0cmV0dXJuIGl0ZW0ua2V5LnBvcnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gTnVtYmVyLk1BWF9WQUxVRTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYXR0cmlidXRlcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRyZXR1cm4gZ2V0VmFsKGEsIHRoaXMpIC0gZ2V0VmFsKGIsIHRoaXMpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPdGhlckF0dHJpYnV0ZXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFBvcnRBdHRyaWJ1dGVzO1xuXHR9XG5cblx0c3RhdGljIHByb3ZpZGVkQWN0aW9uVG9BY3Rpb24ocHJvdmlkZWRBY3Rpb246IFByb3ZpZGVkT25BdXRvRm9yd2FyZCB8IHVuZGVmaW5lZCkge1xuXHRcdHN3aXRjaCAocHJvdmlkZWRBY3Rpb24pIHtcblx0XHRcdGNhc2UgUHJvdmlkZWRPbkF1dG9Gb3J3YXJkLk5vdGlmeTogcmV0dXJuIE9uUG9ydEZvcndhcmQuTm90aWZ5O1xuXHRcdFx0Y2FzZSBQcm92aWRlZE9uQXV0b0ZvcndhcmQuT3BlbkJyb3dzZXI6IHJldHVybiBPblBvcnRGb3J3YXJkLk9wZW5Ccm93c2VyO1xuXHRcdFx0Y2FzZSBQcm92aWRlZE9uQXV0b0ZvcndhcmQuT3BlbkJyb3dzZXJPbmNlOiByZXR1cm4gT25Qb3J0Rm9yd2FyZC5PcGVuQnJvd3Nlck9uY2U7XG5cdFx0XHRjYXNlIFByb3ZpZGVkT25BdXRvRm9yd2FyZC5PcGVuUHJldmlldzogcmV0dXJuIE9uUG9ydEZvcndhcmQuT3BlblByZXZpZXc7XG5cdFx0XHRjYXNlIFByb3ZpZGVkT25BdXRvRm9yd2FyZC5TaWxlbnQ6IHJldHVybiBPblBvcnRGb3J3YXJkLlNpbGVudDtcblx0XHRcdGNhc2UgUHJvdmlkZWRPbkF1dG9Gb3J3YXJkLklnbm9yZTogcmV0dXJuIE9uUG9ydEZvcndhcmQuSWdub3JlO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgYWRkQXR0cmlidXRlcyhwb3J0OiBudW1iZXIsIGF0dHJpYnV0ZXM6IFBhcnRpYWw8QXR0cmlidXRlcz4sIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCkge1xuXHRcdGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChQb3J0c0F0dHJpYnV0ZXMuU0VUVElORyk7XG5cdFx0Y29uc3QgcmVtb3RlVmFsdWU6IGFueSA9IHNldHRpbmdWYWx1ZS51c2VyUmVtb3RlVmFsdWU7XG5cdFx0bGV0IG5ld1JlbW90ZVZhbHVlOiBhbnk7XG5cdFx0aWYgKCFyZW1vdGVWYWx1ZSB8fCAhaXNPYmplY3QocmVtb3RlVmFsdWUpKSB7XG5cdFx0XHRuZXdSZW1vdGVWYWx1ZSA9IHt9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRuZXdSZW1vdGVWYWx1ZSA9IGRlZXBDbG9uZShyZW1vdGVWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFuZXdSZW1vdGVWYWx1ZVtgJHtwb3J0fWBdKSB7XG5cdFx0XHRuZXdSZW1vdGVWYWx1ZVtgJHtwb3J0fWBdID0ge307XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgYXR0cmlidXRlIGluIGF0dHJpYnV0ZXMpIHtcblx0XHRcdG5ld1JlbW90ZVZhbHVlW2Ake3BvcnR9YF1bYXR0cmlidXRlXSA9IChhdHRyaWJ1dGVzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVthdHRyaWJ1dGVdO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFBvcnRzQXR0cmlidXRlcy5TRVRUSU5HLCBuZXdSZW1vdGVWYWx1ZSwgdGFyZ2V0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHVubmVsTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZm9yd2FyZGVkOiBNYXA8c3RyaW5nLCBUdW5uZWw+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGluUHJvZ3Jlc3M6IE1hcDxzdHJpbmcsIHRydWU+ID0gbmV3IE1hcCgpO1xuXHRyZWFkb25seSBkZXRlY3RlZDogTWFwPHN0cmluZywgVHVubmVsPjtcblx0cHJpdmF0ZSByZW1vdGVUdW5uZWxzOiBNYXA8c3RyaW5nLCBSZW1vdGVUdW5uZWw+O1xuXHRwcml2YXRlIF9vbkZvcndhcmRQb3J0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VHVubmVsIHwgdm9pZD4oKSk7XG5cdHB1YmxpYyBvbkZvcndhcmRQb3J0ID0gdGhpcy5fb25Gb3J3YXJkUG9ydC5ldmVudDtcblx0cHJpdmF0ZSBfb25DbG9zZVBvcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0+KCkpO1xuXHRwdWJsaWMgb25DbG9zZVBvcnQgPSB0aGlzLl9vbkNsb3NlUG9ydC5ldmVudDtcblx0cHJpdmF0ZSBfb25Qb3J0TmFtZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaG9zdDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfT4oKSk7XG5cdHB1YmxpYyBvblBvcnROYW1lID0gdGhpcy5fb25Qb3J0TmFtZS5ldmVudDtcblx0cHJpdmF0ZSBfY2FuZGlkYXRlczogTWFwPHN0cmluZywgQ2FuZGlkYXRlUG9ydD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX29uQ2FuZGlkYXRlc0NoYW5nZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNYXA8c3RyaW5nLCB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0+PigpKTtcblx0Ly8gb25DYW5kaWRhdGVDaGFuZ2VkIHJldHVybnMgdGhlIHJlbW92ZWQgY2FuZGlkYXRlc1xuXHRwdWJsaWMgb25DYW5kaWRhdGVzQ2hhbmdlZCA9IHRoaXMuX29uQ2FuZGlkYXRlc0NoYW5nZWQuZXZlbnQ7XG5cdHByaXZhdGUgX2NhbmRpZGF0ZUZpbHRlcjogKChjYW5kaWRhdGVzOiBDYW5kaWRhdGVQb3J0W10pID0+IFByb21pc2U8Q2FuZGlkYXRlUG9ydFtdPikgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdHVubmVsUmVzdG9yZVZhbHVlOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgX29uRW52aXJvbm1lbnRUdW5uZWxzU2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyBvbkVudmlyb25tZW50VHVubmVsc1NldCA9IHRoaXMuX29uRW52aXJvbm1lbnRUdW5uZWxzU2V0LmV2ZW50O1xuXHRwcml2YXRlIF9lbnZpcm9ubWVudFR1bm5lbHNTZXQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHVibGljIHJlYWRvbmx5IGNvbmZpZ1BvcnRzQXR0cmlidXRlczogUG9ydHNBdHRyaWJ1dGVzO1xuXHRwcml2YXRlIHJlc3RvcmVMaXN0ZW5lcjogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGtub3duUG9ydHNSZXN0b3JlVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZXN0b3JlQ29tcGxldGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBvblJlc3RvcmVDb21wbGV0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHVucmVzdG9yZWRFeHRlbnNpb25UdW5uZWxzOiBNYXA8c3RyaW5nLCBSZXN0b3JhYmxlVHVubmVsPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBzZXNzaW9uQ2FjaGVkUHJvcGVydGllczogTWFwPHN0cmluZywgUGFydGlhbDxUdW5uZWxQcm9wZXJ0aWVzPj4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSBwb3J0QXR0cmlidXRlc1Byb3ZpZGVyczogUG9ydEF0dHJpYnV0ZXNQcm92aWRlcltdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUdW5uZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2U6IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmNvbmZpZ1BvcnRzQXR0cmlidXRlcyA9IG5ldyBQb3J0c0F0dHJpYnV0ZXMoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMudHVubmVsUmVzdG9yZVZhbHVlID0gdGhpcy5nZXRUdW5uZWxSZXN0b3JlVmFsdWUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ1BvcnRzQXR0cmlidXRlcy5vbkRpZENoYW5nZUF0dHJpYnV0ZXModGhpcy51cGRhdGVBdHRyaWJ1dGVzLCB0aGlzKSk7XG5cdFx0dGhpcy5mb3J3YXJkZWQgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5yZW1vdGVUdW5uZWxzID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMudHVubmVsU2VydmljZS50dW5uZWxzLnRoZW4oYXN5bmMgKHR1bm5lbHMpID0+IHtcblx0XHRcdGNvbnN0IGF0dHJpYnV0ZXMgPSBhd2FpdCB0aGlzLmdldEF0dHJpYnV0ZXModHVubmVscy5tYXAodHVubmVsID0+IHtcblx0XHRcdFx0cmV0dXJuIHsgcG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQsIGhvc3Q6IHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0IH07XG5cdFx0XHR9KSk7XG5cdFx0XHRmb3IgKGNvbnN0IHR1bm5lbCBvZiB0dW5uZWxzKSB7XG5cdFx0XHRcdGlmICh0dW5uZWwubG9jYWxBZGRyZXNzKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gbWFrZUFkZHJlc3ModHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRcdFx0XHRjb25zdCBtYXRjaGluZ0NhbmRpZGF0ZSA9IG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5fY2FuZGlkYXRlcyA/PyBuZXcgTWFwKCksIHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0XHRcdFx0dGhpcy5mb3J3YXJkZWQuc2V0KGtleSwge1xuXHRcdFx0XHRcdFx0cmVtb3RlUG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQsXG5cdFx0XHRcdFx0XHRyZW1vdGVIb3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCxcblx0XHRcdFx0XHRcdGxvY2FsQWRkcmVzczogdHVubmVsLmxvY2FsQWRkcmVzcyxcblx0XHRcdFx0XHRcdHByb3RvY29sOiBhdHRyaWJ1dGVzPy5nZXQodHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpPy5wcm90b2NvbCA/PyBUdW5uZWxQcm90b2NvbC5IdHRwLFxuXHRcdFx0XHRcdFx0bG9jYWxVcmk6IGF3YWl0IHRoaXMubWFrZUxvY2FsVXJpKHR1bm5lbC5sb2NhbEFkZHJlc3MsIGF0dHJpYnV0ZXM/LmdldCh0dW5uZWwudHVubmVsUmVtb3RlUG9ydCkpLFxuXHRcdFx0XHRcdFx0bG9jYWxQb3J0OiB0dW5uZWwudHVubmVsTG9jYWxQb3J0LFxuXHRcdFx0XHRcdFx0bmFtZTogYXR0cmlidXRlcz8uZ2V0KHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KT8ubGFiZWwsXG5cdFx0XHRcdFx0XHRydW5uaW5nUHJvY2VzczogbWF0Y2hpbmdDYW5kaWRhdGU/LmRldGFpbCxcblx0XHRcdFx0XHRcdGhhc1J1bm5pbmdQcm9jZXNzOiAhIW1hdGNoaW5nQ2FuZGlkYXRlLFxuXHRcdFx0XHRcdFx0cGlkOiBtYXRjaGluZ0NhbmRpZGF0ZT8ucGlkLFxuXHRcdFx0XHRcdFx0cHJpdmFjeTogdHVubmVsLnByaXZhY3ksXG5cdFx0XHRcdFx0XHRzb3VyY2U6IFVzZXJUdW5uZWxTb3VyY2UsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5yZW1vdGVUdW5uZWxzLnNldChrZXksIHR1bm5lbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuZGV0ZWN0ZWQgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50dW5uZWxTZXJ2aWNlLm9uVHVubmVsT3BlbmVkKGFzeW5jICh0dW5uZWwpID0+IHtcblx0XHRcdGNvbnN0IGtleSA9IG1ha2VBZGRyZXNzKHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0XHRpZiAoIW1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5mb3J3YXJkZWQsIHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydClcblx0XHRcdFx0JiYgIW1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5kZXRlY3RlZCwgdHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KVxuXHRcdFx0XHQmJiAhbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlcyh0aGlzLmluUHJvZ3Jlc3MsIHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydClcblx0XHRcdFx0JiYgdHVubmVsLmxvY2FsQWRkcmVzcykge1xuXHRcdFx0XHRjb25zdCBtYXRjaGluZ0NhbmRpZGF0ZSA9IG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5fY2FuZGlkYXRlcyA/PyBuZXcgTWFwKCksIHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0XHRcdGNvbnN0IGF0dHJpYnV0ZXMgPSAoYXdhaXQgdGhpcy5nZXRBdHRyaWJ1dGVzKFt7IHBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0LCBob3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCB9XSkpPy5nZXQodHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpO1xuXHRcdFx0XHR0aGlzLmZvcndhcmRlZC5zZXQoa2V5LCB7XG5cdFx0XHRcdFx0cmVtb3RlSG9zdDogdHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsXG5cdFx0XHRcdFx0cmVtb3RlUG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQsXG5cdFx0XHRcdFx0bG9jYWxBZGRyZXNzOiB0dW5uZWwubG9jYWxBZGRyZXNzLFxuXHRcdFx0XHRcdHByb3RvY29sOiBhdHRyaWJ1dGVzPy5wcm90b2NvbCA/PyBUdW5uZWxQcm90b2NvbC5IdHRwLFxuXHRcdFx0XHRcdGxvY2FsVXJpOiBhd2FpdCB0aGlzLm1ha2VMb2NhbFVyaSh0dW5uZWwubG9jYWxBZGRyZXNzLCBhdHRyaWJ1dGVzKSxcblx0XHRcdFx0XHRsb2NhbFBvcnQ6IHR1bm5lbC50dW5uZWxMb2NhbFBvcnQsXG5cdFx0XHRcdFx0bmFtZTogYXR0cmlidXRlcz8ubGFiZWwsXG5cdFx0XHRcdFx0Y2xvc2VhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdHJ1bm5pbmdQcm9jZXNzOiBtYXRjaGluZ0NhbmRpZGF0ZT8uZGV0YWlsLFxuXHRcdFx0XHRcdGhhc1J1bm5pbmdQcm9jZXNzOiAhIW1hdGNoaW5nQ2FuZGlkYXRlLFxuXHRcdFx0XHRcdHBpZDogbWF0Y2hpbmdDYW5kaWRhdGU/LnBpZCxcblx0XHRcdFx0XHRwcml2YWN5OiB0dW5uZWwucHJpdmFjeSxcblx0XHRcdFx0XHRzb3VyY2U6IFVzZXJUdW5uZWxTb3VyY2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5zdG9yZUZvcndhcmRlZCgpO1xuXHRcdFx0dGhpcy5jaGVja0V4dGVuc2lvbkFjdGl2YXRpb25FdmVudHModHJ1ZSk7XG5cdFx0XHR0aGlzLnJlbW90ZVR1bm5lbHMuc2V0KGtleSwgdHVubmVsKTtcblx0XHRcdHRoaXMuX29uRm9yd2FyZFBvcnQuZmlyZSh0aGlzLmZvcndhcmRlZC5nZXQoa2V5KSEpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnR1bm5lbFNlcnZpY2Uub25UdW5uZWxDbG9zZWQoYWRkcmVzcyA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5vblR1bm5lbENsb3NlZChhZGRyZXNzLCBUdW5uZWxDbG9zZVJlYXNvbi5PdGhlcik7XG5cdFx0fSkpO1xuXHRcdHRoaXMuY2hlY2tFeHRlbnNpb25BY3RpdmF0aW9uRXZlbnRzKGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgZXh0ZW5zaW9uSGFzQWN0aXZhdGlvbkV2ZW50KCkge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5maW5kKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cz8uaW5jbHVkZXMoQUNUSVZBVElPTl9FVkVOVCkpKSB7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShmb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkLmtleSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNDaGVja2VkRXh0ZW5zaW9uc09uVHVubmVsT3BlbmVkID0gZmFsc2U7XG5cdHByaXZhdGUgY2hlY2tFeHRlbnNpb25BY3RpdmF0aW9uRXZlbnRzKHR1bm5lbE9wZW5lZDogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLmhhc0NoZWNrZWRFeHRlbnNpb25zT25UdW5uZWxPcGVuZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHR1bm5lbE9wZW5lZCkge1xuXHRcdFx0dGhpcy5oYXNDaGVja2VkRXh0ZW5zaW9uc09uVHVubmVsT3BlbmVkID0gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgaGFzUmVtb3RlID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ICE9PSB1bmRlZmluZWQ7XG5cdFx0aWYgKGhhc1JlbW90ZSAmJiAhdHVubmVsT3BlbmVkKSB7XG5cdFx0XHQvLyBXZSBkb24ndCBhY3RpdmF0ZSBleHRlbnNpb25zIG9uIHN0YXJ0dXAgaWYgdGhlcmUgaXMgYSByZW1vdGVcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uSGFzQWN0aXZhdGlvbkV2ZW50KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmF0aW9uRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZFJlZ2lzdGVyRXh0ZW5zaW9ucygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb25IYXNBY3RpdmF0aW9uRXZlbnQoKSkge1xuXHRcdFx0XHRhY3RpdmF0aW9uRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblR1bm5lbENsb3NlZChhZGRyZXNzOiB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0sIHJlYXNvbjogVHVubmVsQ2xvc2VSZWFzb24pIHtcblx0XHRjb25zdCBrZXkgPSBtYWtlQWRkcmVzcyhhZGRyZXNzLmhvc3QsIGFkZHJlc3MucG9ydCk7XG5cdFx0aWYgKHRoaXMuZm9yd2FyZGVkLmRlbGV0ZShrZXkpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN0b3JlRm9yd2FyZGVkKCk7XG5cdFx0XHR0aGlzLl9vbkNsb3NlUG9ydC5maXJlKGFkZHJlc3MpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbWFrZUxvY2FsVXJpKGxvY2FsQWRkcmVzczogc3RyaW5nLCBhdHRyaWJ1dGVzPzogQXR0cmlidXRlcykge1xuXHRcdGlmIChsb2NhbEFkZHJlc3Muc3RhcnRzV2l0aCgnaHR0cCcpKSB7XG5cdFx0XHRyZXR1cm4gVVJJLnBhcnNlKGxvY2FsQWRkcmVzcyk7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3RvY29sID0gYXR0cmlidXRlcz8ucHJvdG9jb2wgPz8gJ2h0dHAnO1xuXHRcdHJldHVybiBVUkkucGFyc2UoYCR7cHJvdG9jb2x9Oi8vJHtsb2NhbEFkZHJlc3N9YCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZFN0b3JhZ2VLZXlQb3N0Zml4KHByZWZpeDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUhhc2ggPSB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiA/IGhhc2god29ya3NwYWNlLmNvbmZpZ3VyYXRpb24ucGF0aCkgOiAod29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID4gMCA/IGhhc2god29ya3NwYWNlLmZvbGRlcnNbMF0udXJpLnBhdGgpIDogdW5kZWZpbmVkKTtcblx0XHRpZiAod29ya3NwYWNlSGFzaCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0NvdWxkIG5vdCBnZXQgd29ya3NwYWNlIGhhc2ggZm9yIGZvcndhcmRlZCBwb3J0cyBzdG9yYWdlIGtleS4nKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBgJHtwcmVmaXh9LiR7dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5fS4ke3dvcmtzcGFjZUhhc2h9YDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VHVubmVsUmVzdG9yZVN0b3JhZ2VLZXkoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5hZGRTdG9yYWdlS2V5UG9zdGZpeChUVU5ORUxTX1RPX1JFU1RPUkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZXN0b3JlRXhwaXJhdGlvblN0b3JhZ2VLZXkoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5hZGRTdG9yYWdlS2V5UG9zdGZpeChUVU5ORUxTX1RPX1JFU1RPUkVfRVhQSVJBVElPTik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFR1bm5lbFJlc3RvcmVWYWx1ZSgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRlcHJlY2F0ZWRWYWx1ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFRVTk5FTFNfVE9fUkVTVE9SRSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKGRlcHJlY2F0ZWRWYWx1ZSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoVFVOTkVMU19UT19SRVNUT1JFLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRcdGF3YWl0IHRoaXMuc3RvcmVGb3J3YXJkZWQoKTtcblx0XHRcdHJldHVybiBkZXByZWNhdGVkVmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JhZ2VLZXkgPSBhd2FpdCB0aGlzLmdldFR1bm5lbFJlc3RvcmVTdG9yYWdlS2V5KCk7XG5cdFx0aWYgKCFzdG9yYWdlS2V5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHR9XG5cblx0YXN5bmMgcmVzdG9yZUZvcndhcmRlZCgpIHtcblx0XHR0aGlzLmNsZWFudXBFeHBpcmVkVHVubmVsc0ZvclJlc3RvcmUoKTtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgncmVtb3RlLnJlc3RvcmVGb3J3YXJkZWRQb3J0cycpKSB7XG5cdFx0XHRjb25zdCB0dW5uZWxSZXN0b3JlVmFsdWUgPSBhd2FpdCB0aGlzLnR1bm5lbFJlc3RvcmVWYWx1ZTtcblx0XHRcdGlmICh0dW5uZWxSZXN0b3JlVmFsdWUgJiYgKHR1bm5lbFJlc3RvcmVWYWx1ZSAhPT0gdGhpcy5rbm93blBvcnRzUmVzdG9yZVZhbHVlKSkge1xuXHRcdFx0XHRjb25zdCB0dW5uZWxzID0gPFJlc3RvcmFibGVUdW5uZWxbXSB8IHVuZGVmaW5lZD5KU09OLnBhcnNlKHR1bm5lbFJlc3RvcmVWYWx1ZSkgPz8gW107XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChUdW5uZWxNb2RlbCkgcmVzdG9yaW5nIHBvcnRzICR7dHVubmVscy5tYXAodHVubmVsID0+IHR1bm5lbC5yZW1vdGVQb3J0KS5qb2luKCcsICcpfWApO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHR1bm5lbCBvZiB0dW5uZWxzKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWxyZWFkeUZvcndhcmRlZCA9IG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5kZXRlY3RlZCwgdHVubmVsLnJlbW90ZUhvc3QsIHR1bm5lbC5yZW1vdGVQb3J0KTtcblx0XHRcdFx0XHQvLyBFeHRlbnNpb24gZm9yd2FyZGVkIHBvcnRzIHNob3VsZCBvbmx5IGJlIHVwZGF0ZWQsIG5vdCByZXN0b3JlZC5cblx0XHRcdFx0XHRpZiAoKHR1bm5lbC5zb3VyY2Uuc291cmNlICE9PSBUdW5uZWxTb3VyY2UuRXh0ZW5zaW9uICYmICFhbHJlYWR5Rm9yd2FyZGVkKSB8fCAodHVubmVsLnNvdXJjZS5zb3VyY2UgPT09IFR1bm5lbFNvdXJjZS5FeHRlbnNpb24gJiYgYWxyZWFkeUZvcndhcmRlZCkpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZG9Gb3J3YXJkKHtcblx0XHRcdFx0XHRcdFx0cmVtb3RlOiB7IGhvc3Q6IHR1bm5lbC5yZW1vdGVIb3N0LCBwb3J0OiB0dW5uZWwucmVtb3RlUG9ydCB9LFxuXHRcdFx0XHRcdFx0XHRsb2NhbDogdHVubmVsLmxvY2FsUG9ydCxcblx0XHRcdFx0XHRcdFx0bmFtZTogdHVubmVsLm5hbWUsXG5cdFx0XHRcdFx0XHRcdGVsZXZhdGVJZk5lZWRlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0c291cmNlOiB0dW5uZWwuc291cmNlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHR1bm5lbC5zb3VyY2Uuc291cmNlID09PSBUdW5uZWxTb3VyY2UuRXh0ZW5zaW9uICYmICFhbHJlYWR5Rm9yd2FyZGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVucmVzdG9yZWRFeHRlbnNpb25UdW5uZWxzLnNldChtYWtlQWRkcmVzcyh0dW5uZWwucmVtb3RlSG9zdCwgdHVubmVsLnJlbW90ZVBvcnQpLCB0dW5uZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVzdG9yZUNvbXBsZXRlID0gdHJ1ZTtcblx0XHR0aGlzLm9uUmVzdG9yZUNvbXBsZXRlLmZpcmUoKTtcblxuXHRcdGlmICghdGhpcy5yZXN0b3JlTGlzdGVuZXIpIHtcblx0XHRcdC8vIEl0J3MgcG9zc2libGUgdGhhdCBhdCByZXN0b3JlIHRpbWUgdGhlIHZhbHVlIGhhc24ndCBzeW5jZWQuXG5cdFx0XHRjb25zdCBrZXkgPSBhd2FpdCB0aGlzLmdldFR1bm5lbFJlc3RvcmVTdG9yYWdlS2V5KCk7XG5cdFx0XHR0aGlzLnJlc3RvcmVMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0XHR0aGlzLnJlc3RvcmVMaXN0ZW5lci5hZGQodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB1bmRlZmluZWQsIHRoaXMucmVzdG9yZUxpc3RlbmVyKShhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09IGtleSkge1xuXHRcdFx0XHRcdHRoaXMudHVubmVsUmVzdG9yZVZhbHVlID0gUHJvbWlzZS5yZXNvbHZlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlc3RvcmVGb3J3YXJkZWQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYW51cEV4cGlyZWRUdW5uZWxzRm9yUmVzdG9yZSgpIHtcblx0XHRjb25zdCBrZXlzID0gdGhpcy5zdG9yYWdlU2VydmljZS5rZXlzKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpLmZpbHRlcihrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoVFVOTkVMU19UT19SRVNUT1JFX0VYUElSQVRJT04pKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRjb25zdCBleHBpcmF0aW9uID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoa2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0XHRpZiAoZXhwaXJhdGlvbiAmJiBleHBpcmF0aW9uIDwgRGF0ZS5ub3coKSkge1xuXHRcdFx0XHR0aGlzLnR1bm5lbFJlc3RvcmVWYWx1ZSA9IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBzdG9yYWdlS2V5ID0ga2V5LnJlcGxhY2UoVFVOTkVMU19UT19SRVNUT1JFX0VYUElSQVRJT04sIFRVTk5FTFNfVE9fUkVTVE9SRSk7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKGtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShzdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0QGRlYm91bmNlKDEwMDApXG5cdHByaXZhdGUgYXN5bmMgc3RvcmVGb3J3YXJkZWQoKSB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3JlbW90ZS5yZXN0b3JlRm9yd2FyZGVkUG9ydHMnKSkge1xuXHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gQXJyYXkuZnJvbSh0aGlzLmZvcndhcmRlZC52YWx1ZXMoKSk7XG5cdFx0XHRjb25zdCByZXN0b3JhYmxlVHVubmVsczogUmVzdG9yYWJsZVR1bm5lbFtdID0gZm9yd2FyZGVkLm1hcCh0dW5uZWwgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlbW90ZUhvc3Q6IHR1bm5lbC5yZW1vdGVIb3N0LFxuXHRcdFx0XHRcdHJlbW90ZVBvcnQ6IHR1bm5lbC5yZW1vdGVQb3J0LFxuXHRcdFx0XHRcdGxvY2FsUG9ydDogdHVubmVsLmxvY2FsUG9ydCxcblx0XHRcdFx0XHRuYW1lOiB0dW5uZWwubmFtZSxcblx0XHRcdFx0XHRsb2NhbEFkZHJlc3M6IHR1bm5lbC5sb2NhbEFkZHJlc3MsXG5cdFx0XHRcdFx0bG9jYWxVcmk6IHR1bm5lbC5sb2NhbFVyaSxcblx0XHRcdFx0XHRwcm90b2NvbDogdHVubmVsLnByb3RvY29sLFxuXHRcdFx0XHRcdHNvdXJjZTogdHVubmVsLnNvdXJjZSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdFx0bGV0IHZhbHVlVG9TdG9yZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGZvcndhcmRlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHZhbHVlVG9TdG9yZSA9IEpTT04uc3RyaW5naWZ5KHJlc3RvcmFibGVUdW5uZWxzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qga2V5ID0gYXdhaXQgdGhpcy5nZXRUdW5uZWxSZXN0b3JlU3RvcmFnZUtleSgpO1xuXHRcdFx0Y29uc3QgZXhwaXJhdGlvbktleSA9IGF3YWl0IHRoaXMuZ2V0UmVzdG9yZUV4cGlyYXRpb25TdG9yYWdlS2V5KCk7XG5cdFx0XHRpZiAoIXZhbHVlVG9TdG9yZSAmJiBrZXkgJiYgZXhwaXJhdGlvbktleSkge1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoZXhwaXJhdGlvbktleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdFx0fSBlbHNlIGlmICgodmFsdWVUb1N0b3JlICE9PSB0aGlzLmtub3duUG9ydHNSZXN0b3JlVmFsdWUpICYmIGtleSAmJiBleHBpcmF0aW9uS2V5KSB7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoa2V5LCB2YWx1ZVRvU3RvcmUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGV4cGlyYXRpb25LZXksIERhdGUubm93KCkgKyBSRVNUT1JFX0VYUElSQVRJT05fVElNRSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmtub3duUG9ydHNSZXN0b3JlVmFsdWUgPSB2YWx1ZVRvU3RvcmU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBtaXNtYXRjaENvb2xkb3duID0gbmV3IERhdGUoKTtcblx0cHJpdmF0ZSBhc3luYyBzaG93UG9ydE1pc21hdGNoTW9kYWxJZk5lZWRlZCh0dW5uZWw6IFJlbW90ZVR1bm5lbCwgZXhwZWN0ZWRMb2NhbDogbnVtYmVyLCBhdHRyaWJ1dGVzOiBBdHRyaWJ1dGVzIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCF0dW5uZWwudHVubmVsTG9jYWxQb3J0IHx8ICFhdHRyaWJ1dGVzPy5yZXF1aXJlTG9jYWxQb3J0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0dW5uZWwudHVubmVsTG9jYWxQb3J0ID09PSBleHBlY3RlZExvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3Q29vbGRvd24gPSBuZXcgRGF0ZSgpO1xuXHRcdGlmICgodGhpcy5taXNtYXRjaENvb2xkb3duLmdldFRpbWUoKSArIE1JU01BVENIX0xPQ0FMX1BPUlRfQ09PTERPV04pID4gbmV3Q29vbGRvd24uZ2V0VGltZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubWlzbWF0Y2hDb29sZG93biA9IG5ld0Nvb2xkb3duO1xuXHRcdGNvbnN0IG1pc21hdGNoU3RyaW5nID0gbmxzLmxvY2FsaXplKCdyZW1vdGUubG9jYWxQb3J0TWlzbWF0Y2guc2luZ2xlJywgXCJMb2NhbCBwb3J0IHswfSBjb3VsZCBub3QgYmUgdXNlZCBmb3IgZm9yd2FyZGluZyB0byByZW1vdGUgcG9ydCB7MX0uXFxuXFxuVGhpcyB1c3VhbGx5IGhhcHBlbnMgd2hlbiB0aGVyZSBpcyBhbHJlYWR5IGFub3RoZXIgcHJvY2VzcyB1c2luZyBsb2NhbCBwb3J0IHswfS5cXG5cXG5Qb3J0IG51bWJlciB7Mn0gaGFzIGJlZW4gdXNlZCBpbnN0ZWFkLlwiLFxuXHRcdFx0ZXhwZWN0ZWRMb2NhbCwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQsIHR1bm5lbC50dW5uZWxMb2NhbFBvcnQpO1xuXHRcdHJldHVybiB0aGlzLmRpYWxvZ1NlcnZpY2UuaW5mbyhtaXNtYXRjaFN0cmluZyk7XG5cdH1cblxuXHRhc3luYyBmb3J3YXJkKHR1bm5lbFByb3BlcnRpZXM6IFR1bm5lbFByb3BlcnRpZXMsIGF0dHJpYnV0ZXM/OiBBdHRyaWJ1dGVzIHwgbnVsbCk6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgc3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLnJlc3RvcmVDb21wbGV0ZSAmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0aGlzLm9uUmVzdG9yZUNvbXBsZXRlLmV2ZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZG9Gb3J3YXJkKHR1bm5lbFByb3BlcnRpZXMsIGF0dHJpYnV0ZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0ZvcndhcmQodHVubmVsUHJvcGVydGllczogVHVubmVsUHJvcGVydGllcywgYXR0cmlidXRlcz86IEF0dHJpYnV0ZXMgfCBudWxsKTogUHJvbWlzZTxSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KEFDVElWQVRJT05fRVZFTlQpO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmdUdW5uZWwgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuZm9yd2FyZGVkLCB0dW5uZWxQcm9wZXJ0aWVzLnJlbW90ZS5ob3N0LCB0dW5uZWxQcm9wZXJ0aWVzLnJlbW90ZS5wb3J0KTtcblx0XHRhdHRyaWJ1dGVzID0gYXR0cmlidXRlcyA/P1xuXHRcdFx0KChhdHRyaWJ1dGVzICE9PSBudWxsKVxuXHRcdFx0XHQ/IChhd2FpdCB0aGlzLmdldEF0dHJpYnV0ZXMoW3R1bm5lbFByb3BlcnRpZXMucmVtb3RlXSkpPy5nZXQodHVubmVsUHJvcGVydGllcy5yZW1vdGUucG9ydClcblx0XHRcdFx0OiB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGxvY2FsUG9ydCA9ICh0dW5uZWxQcm9wZXJ0aWVzLmxvY2FsICE9PSB1bmRlZmluZWQpID8gdHVubmVsUHJvcGVydGllcy5sb2NhbCA6IHR1bm5lbFByb3BlcnRpZXMucmVtb3RlLnBvcnQ7XG5cdFx0bGV0IG5vVHVubmVsVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIWV4aXN0aW5nVHVubmVsKSB7XG5cdFx0XHRjb25zdCBhdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRjb25zdCBhZGRyZXNzUHJvdmlkZXI6IElBZGRyZXNzUHJvdmlkZXIgfCB1bmRlZmluZWQgPSBhdXRob3JpdHkgPyB7XG5cdFx0XHRcdGdldEFkZHJlc3M6IGFzeW5jICgpID0+IHsgcmV0dXJuIChhd2FpdCB0aGlzLnJlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5yZXNvbHZlQXV0aG9yaXR5KGF1dGhvcml0eSkpLmF1dGhvcml0eTsgfVxuXHRcdFx0fSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3Qga2V5ID0gbWFrZUFkZHJlc3ModHVubmVsUHJvcGVydGllcy5yZW1vdGUuaG9zdCwgdHVubmVsUHJvcGVydGllcy5yZW1vdGUucG9ydCk7XG5cdFx0XHR0aGlzLmluUHJvZ3Jlc3Muc2V0KGtleSwgdHJ1ZSk7XG5cdFx0XHR0dW5uZWxQcm9wZXJ0aWVzID0gdGhpcy5tZXJnZUNhY2hlZEFuZFVucmVzdG9yZWRQcm9wZXJ0aWVzKGtleSwgdHVubmVsUHJvcGVydGllcyk7XG5cblx0XHRcdGNvbnN0IHR1bm5lbCA9IGF3YWl0IHRoaXMudHVubmVsU2VydmljZS5vcGVuVHVubmVsKGFkZHJlc3NQcm92aWRlciwgdHVubmVsUHJvcGVydGllcy5yZW1vdGUuaG9zdCwgdHVubmVsUHJvcGVydGllcy5yZW1vdGUucG9ydCwgdW5kZWZpbmVkLCBsb2NhbFBvcnQsICghdHVubmVsUHJvcGVydGllcy5lbGV2YXRlSWZOZWVkZWQpID8gYXR0cmlidXRlcz8uZWxldmF0ZUlmTmVlZGVkIDogdHVubmVsUHJvcGVydGllcy5lbGV2YXRlSWZOZWVkZWQsIHR1bm5lbFByb3BlcnRpZXMucHJpdmFjeSwgYXR0cmlidXRlcz8ucHJvdG9jb2wpO1xuXHRcdFx0aWYgKHR5cGVvZiB0dW5uZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdC8vIFRoZXJlIHdhcyBhbiBlcnJvciAgd2hpbGUgY3JlYXRpbmcgdGhlIHR1bm5lbC5cblx0XHRcdFx0bm9UdW5uZWxWYWx1ZSA9IHR1bm5lbDtcblx0XHRcdH0gZWxzZSBpZiAodHVubmVsICYmIHR1bm5lbC5sb2NhbEFkZHJlc3MpIHtcblx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdDYW5kaWRhdGUgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzPENhbmRpZGF0ZVBvcnQ+KHRoaXMuX2NhbmRpZGF0ZXMgPz8gbmV3IE1hcCgpLCB0dW5uZWxQcm9wZXJ0aWVzLnJlbW90ZS5ob3N0LCB0dW5uZWxQcm9wZXJ0aWVzLnJlbW90ZS5wb3J0KTtcblx0XHRcdFx0Y29uc3QgcHJvdG9jb2wgPSAodHVubmVsLnByb3RvY29sID9cblx0XHRcdFx0XHQoKHR1bm5lbC5wcm90b2NvbCA9PT0gVHVubmVsUHJvdG9jb2wuSHR0cHMpID8gVHVubmVsUHJvdG9jb2wuSHR0cHMgOiBUdW5uZWxQcm90b2NvbC5IdHRwKVxuXHRcdFx0XHRcdDogKGF0dHJpYnV0ZXM/LnByb3RvY29sID8/IFR1bm5lbFByb3RvY29sLkh0dHApKTtcblx0XHRcdFx0Y29uc3QgbmV3Rm9yd2FyZDogVHVubmVsID0ge1xuXHRcdFx0XHRcdHJlbW90ZUhvc3Q6IHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LFxuXHRcdFx0XHRcdHJlbW90ZVBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0LFxuXHRcdFx0XHRcdGxvY2FsUG9ydDogdHVubmVsLnR1bm5lbExvY2FsUG9ydCxcblx0XHRcdFx0XHRuYW1lOiBhdHRyaWJ1dGVzPy5sYWJlbCA/PyB0dW5uZWxQcm9wZXJ0aWVzLm5hbWUsXG5cdFx0XHRcdFx0Y2xvc2VhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdGxvY2FsQWRkcmVzczogdHVubmVsLmxvY2FsQWRkcmVzcyxcblx0XHRcdFx0XHRwcm90b2NvbCxcblx0XHRcdFx0XHRsb2NhbFVyaTogYXdhaXQgdGhpcy5tYWtlTG9jYWxVcmkodHVubmVsLmxvY2FsQWRkcmVzcywgYXR0cmlidXRlcyksXG5cdFx0XHRcdFx0cnVubmluZ1Byb2Nlc3M6IG1hdGNoaW5nQ2FuZGlkYXRlPy5kZXRhaWwsXG5cdFx0XHRcdFx0aGFzUnVubmluZ1Byb2Nlc3M6ICEhbWF0Y2hpbmdDYW5kaWRhdGUsXG5cdFx0XHRcdFx0cGlkOiBtYXRjaGluZ0NhbmRpZGF0ZT8ucGlkLFxuXHRcdFx0XHRcdHNvdXJjZTogdHVubmVsUHJvcGVydGllcy5zb3VyY2UgPz8gVXNlclR1bm5lbFNvdXJjZSxcblx0XHRcdFx0XHRwcml2YWN5OiB0dW5uZWwucHJpdmFjeSxcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5mb3J3YXJkZWQuc2V0KGtleSwgbmV3Rm9yd2FyZCk7XG5cdFx0XHRcdHRoaXMucmVtb3RlVHVubmVscy5zZXQoa2V5LCB0dW5uZWwpO1xuXHRcdFx0XHR0aGlzLmluUHJvZ3Jlc3MuZGVsZXRlKGtleSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc3RvcmVGb3J3YXJkZWQoKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5zaG93UG9ydE1pc21hdGNoTW9kYWxJZk5lZWRlZCh0dW5uZWwsIGxvY2FsUG9ydCwgYXR0cmlidXRlcyk7XG5cdFx0XHRcdHRoaXMuX29uRm9yd2FyZFBvcnQuZmlyZShuZXdGb3J3YXJkKTtcblx0XHRcdFx0cmV0dXJuIHR1bm5lbDtcblx0XHRcdH1cblx0XHRcdHRoaXMuaW5Qcm9ncmVzcy5kZWxldGUoa2V5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMubWVyZ2VBdHRyaWJ1dGVzSW50b0V4aXN0aW5nVHVubmVsKGV4aXN0aW5nVHVubmVsLCB0dW5uZWxQcm9wZXJ0aWVzLCBhdHRyaWJ1dGVzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbm9UdW5uZWxWYWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgbWVyZ2VDYWNoZWRBbmRVbnJlc3RvcmVkUHJvcGVydGllcyhrZXk6IHN0cmluZywgdHVubmVsUHJvcGVydGllczogVHVubmVsUHJvcGVydGllcyk6IFR1bm5lbFByb3BlcnRpZXMge1xuXHRcdGNvbnN0IG1hcCA9IHRoaXMudW5yZXN0b3JlZEV4dGVuc2lvblR1bm5lbHMuaGFzKGtleSkgPyB0aGlzLnVucmVzdG9yZWRFeHRlbnNpb25UdW5uZWxzIDogKHRoaXMuc2Vzc2lvbkNhY2hlZFByb3BlcnRpZXMuaGFzKGtleSkgPyB0aGlzLnNlc3Npb25DYWNoZWRQcm9wZXJ0aWVzIDogdW5kZWZpbmVkKTtcblx0XHRpZiAobWFwKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVQcm9wcyA9IG1hcC5nZXQoa2V5KSE7XG5cdFx0XHRtYXAuZGVsZXRlKGtleSk7XG5cdFx0XHRpZiAodXBkYXRlUHJvcHMpIHtcblx0XHRcdFx0dHVubmVsUHJvcGVydGllcy5uYW1lID0gdXBkYXRlUHJvcHMubmFtZSA/PyB0dW5uZWxQcm9wZXJ0aWVzLm5hbWU7XG5cdFx0XHRcdHR1bm5lbFByb3BlcnRpZXMubG9jYWwgPSAoKCdsb2NhbCcgaW4gdXBkYXRlUHJvcHMpID8gdXBkYXRlUHJvcHMubG9jYWwgOiAoKCdsb2NhbFBvcnQnIGluIHVwZGF0ZVByb3BzKSA/IHVwZGF0ZVByb3BzLmxvY2FsUG9ydCA6IHVuZGVmaW5lZCkpID8/IHR1bm5lbFByb3BlcnRpZXMubG9jYWw7XG5cdFx0XHRcdHR1bm5lbFByb3BlcnRpZXMucHJpdmFjeSA9IHR1bm5lbFByb3BlcnRpZXMucHJpdmFjeTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHR1bm5lbFByb3BlcnRpZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1lcmdlQXR0cmlidXRlc0ludG9FeGlzdGluZ1R1bm5lbChleGlzdGluZ1R1bm5lbDogVHVubmVsLCB0dW5uZWxQcm9wZXJ0aWVzOiBUdW5uZWxQcm9wZXJ0aWVzLCBhdHRyaWJ1dGVzOiBBdHRyaWJ1dGVzIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgbmV3TmFtZSA9IGF0dHJpYnV0ZXM/LmxhYmVsID8/IHR1bm5lbFByb3BlcnRpZXMubmFtZTtcblx0XHRlbnVtIE1lcmdlZEF0dHJpYnV0ZUFjdGlvbiB7XG5cdFx0XHROb25lID0gMCxcblx0XHRcdEZpcmUgPSAxLFxuXHRcdFx0UmVvcGVuID0gMlxuXHRcdH1cblx0XHRsZXQgbWVyZ2VkQWN0aW9uID0gTWVyZ2VkQXR0cmlidXRlQWN0aW9uLk5vbmU7XG5cdFx0aWYgKG5ld05hbWUgIT09IGV4aXN0aW5nVHVubmVsLm5hbWUpIHtcblx0XHRcdGV4aXN0aW5nVHVubmVsLm5hbWUgPSBuZXdOYW1lO1xuXHRcdFx0bWVyZ2VkQWN0aW9uID0gTWVyZ2VkQXR0cmlidXRlQWN0aW9uLkZpcmU7XG5cdFx0fVxuXHRcdC8vIFNvdXJjZSBvZiBleGlzdGluZyB0dW5uZWwgd2lucyBzbyB0aGF0IG9yaWdpbmFsIHNvdXJjZSBpcyBtYWludGFpbmVkXG5cdFx0aWYgKChhdHRyaWJ1dGVzPy5wcm90b2NvbCB8fCAoZXhpc3RpbmdUdW5uZWwucHJvdG9jb2wgIT09IFR1bm5lbFByb3RvY29sLkh0dHApKSAmJiAoYXR0cmlidXRlcz8ucHJvdG9jb2wgIT09IGV4aXN0aW5nVHVubmVsLnByb3RvY29sKSkge1xuXHRcdFx0dHVubmVsUHJvcGVydGllcy5zb3VyY2UgPSBleGlzdGluZ1R1bm5lbC5zb3VyY2U7XG5cdFx0XHRtZXJnZWRBY3Rpb24gPSBNZXJnZWRBdHRyaWJ1dGVBY3Rpb24uUmVvcGVuO1xuXHRcdH1cblx0XHQvLyBOZXcgcHJpdmFjeSB2YWx1ZSB3aW5zXG5cdFx0aWYgKHR1bm5lbFByb3BlcnRpZXMucHJpdmFjeSAmJiAoZXhpc3RpbmdUdW5uZWwucHJpdmFjeSAhPT0gdHVubmVsUHJvcGVydGllcy5wcml2YWN5KSkge1xuXHRcdFx0bWVyZ2VkQWN0aW9uID0gTWVyZ2VkQXR0cmlidXRlQWN0aW9uLlJlb3Blbjtcblx0XHR9XG5cdFx0c3dpdGNoIChtZXJnZWRBY3Rpb24pIHtcblx0XHRcdGNhc2UgTWVyZ2VkQXR0cmlidXRlQWN0aW9uLkZpcmU6IHtcblx0XHRcdFx0dGhpcy5fb25Gb3J3YXJkUG9ydC5maXJlKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBNZXJnZWRBdHRyaWJ1dGVBY3Rpb24uUmVvcGVuOiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY2xvc2UoZXhpc3RpbmdUdW5uZWwucmVtb3RlSG9zdCwgZXhpc3RpbmdUdW5uZWwucmVtb3RlUG9ydCwgVHVubmVsQ2xvc2VSZWFzb24uVXNlcik7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9Gb3J3YXJkKHR1bm5lbFByb3BlcnRpZXMsIGF0dHJpYnV0ZXMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMucmVtb3RlVHVubmVscywgdHVubmVsUHJvcGVydGllcy5yZW1vdGUuaG9zdCwgdHVubmVsUHJvcGVydGllcy5yZW1vdGUucG9ydCk7XG5cdH1cblxuXHRhc3luYyBuYW1lKGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyLCBuYW1lOiBzdHJpbmcpIHtcblx0XHRjb25zdCBleGlzdGluZ0ZvcndhcmRlZCA9IG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5mb3J3YXJkZWQsIGhvc3QsIHBvcnQpO1xuXHRcdGNvbnN0IGtleSA9IG1ha2VBZGRyZXNzKGhvc3QsIHBvcnQpO1xuXHRcdGlmIChleGlzdGluZ0ZvcndhcmRlZCkge1xuXHRcdFx0ZXhpc3RpbmdGb3J3YXJkZWQubmFtZSA9IG5hbWU7XG5cdFx0XHRhd2FpdCB0aGlzLnN0b3JlRm9yd2FyZGVkKCk7XG5cdFx0XHR0aGlzLl9vblBvcnROYW1lLmZpcmUoeyBob3N0LCBwb3J0IH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5kZXRlY3RlZC5oYXMoa2V5KSkge1xuXHRcdFx0dGhpcy5kZXRlY3RlZC5nZXQoa2V5KSEubmFtZSA9IG5hbWU7XG5cdFx0XHR0aGlzLl9vblBvcnROYW1lLmZpcmUoeyBob3N0LCBwb3J0IH0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNsb3NlKGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyLCByZWFzb246IFR1bm5lbENsb3NlUmVhc29uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga2V5ID0gbWFrZUFkZHJlc3MoaG9zdCwgcG9ydCk7XG5cdFx0Y29uc3Qgb2xkVHVubmVsID0gdGhpcy5mb3J3YXJkZWQuZ2V0KGtleSkhO1xuXHRcdGlmICgocmVhc29uID09PSBUdW5uZWxDbG9zZVJlYXNvbi5BdXRvRm9yd2FyZEVuZCkgJiYgb2xkVHVubmVsICYmIChvbGRUdW5uZWwuc291cmNlLnNvdXJjZSA9PT0gVHVubmVsU291cmNlLkF1dG8pKSB7XG5cdFx0XHR0aGlzLnNlc3Npb25DYWNoZWRQcm9wZXJ0aWVzLnNldChrZXksIHtcblx0XHRcdFx0bG9jYWw6IG9sZFR1bm5lbC5sb2NhbFBvcnQsXG5cdFx0XHRcdG5hbWU6IG9sZFR1bm5lbC5uYW1lLFxuXHRcdFx0XHRwcml2YWN5OiBvbGRUdW5uZWwucHJpdmFjeSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnR1bm5lbFNlcnZpY2UuY2xvc2VUdW5uZWwoaG9zdCwgcG9ydCk7XG5cdFx0cmV0dXJuIHRoaXMub25UdW5uZWxDbG9zZWQoeyBob3N0LCBwb3J0IH0sIHJlYXNvbik7XG5cdH1cblxuXHRhZGRyZXNzKGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBrZXkgPSBtYWtlQWRkcmVzcyhob3N0LCBwb3J0KTtcblx0XHRyZXR1cm4gKHRoaXMuZm9yd2FyZGVkLmdldChrZXkpIHx8IHRoaXMuZGV0ZWN0ZWQuZ2V0KGtleSkpPy5sb2NhbEFkZHJlc3M7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGVudmlyb25tZW50VHVubmVsc1NldCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZW52aXJvbm1lbnRUdW5uZWxzU2V0O1xuXHR9XG5cblx0YWRkRW52aXJvbm1lbnRUdW5uZWxzKHR1bm5lbHM6IFR1bm5lbERlc2NyaXB0aW9uW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodHVubmVscykge1xuXHRcdFx0Zm9yIChjb25zdCB0dW5uZWwgb2YgdHVubmVscykge1xuXHRcdFx0XHRjb25zdCBtYXRjaGluZ0NhbmRpZGF0ZSA9IG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5fY2FuZGlkYXRlcyA/PyBuZXcgTWFwKCksIHR1bm5lbC5yZW1vdGVBZGRyZXNzLmhvc3QsIHR1bm5lbC5yZW1vdGVBZGRyZXNzLnBvcnQpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEFkZHJlc3MgPSB0eXBlb2YgdHVubmVsLmxvY2FsQWRkcmVzcyA9PT0gJ3N0cmluZycgPyB0dW5uZWwubG9jYWxBZGRyZXNzIDogbWFrZUFkZHJlc3ModHVubmVsLmxvY2FsQWRkcmVzcy5ob3N0LCB0dW5uZWwubG9jYWxBZGRyZXNzLnBvcnQpO1xuXHRcdFx0XHR0aGlzLmRldGVjdGVkLnNldChtYWtlQWRkcmVzcyh0dW5uZWwucmVtb3RlQWRkcmVzcy5ob3N0LCB0dW5uZWwucmVtb3RlQWRkcmVzcy5wb3J0KSwge1xuXHRcdFx0XHRcdHJlbW90ZUhvc3Q6IHR1bm5lbC5yZW1vdGVBZGRyZXNzLmhvc3QsXG5cdFx0XHRcdFx0cmVtb3RlUG9ydDogdHVubmVsLnJlbW90ZUFkZHJlc3MucG9ydCxcblx0XHRcdFx0XHRsb2NhbEFkZHJlc3M6IGxvY2FsQWRkcmVzcyxcblx0XHRcdFx0XHRwcm90b2NvbDogVHVubmVsUHJvdG9jb2wuSHR0cCxcblx0XHRcdFx0XHRsb2NhbFVyaTogdGhpcy5tYWtlTG9jYWxVcmkobG9jYWxBZGRyZXNzKSxcblx0XHRcdFx0XHRjbG9zZWFibGU6IGZhbHNlLFxuXHRcdFx0XHRcdHJ1bm5pbmdQcm9jZXNzOiBtYXRjaGluZ0NhbmRpZGF0ZT8uZGV0YWlsLFxuXHRcdFx0XHRcdGhhc1J1bm5pbmdQcm9jZXNzOiAhIW1hdGNoaW5nQ2FuZGlkYXRlLFxuXHRcdFx0XHRcdHBpZDogbWF0Y2hpbmdDYW5kaWRhdGU/LnBpZCxcblx0XHRcdFx0XHRwcml2YWN5OiBUdW5uZWxQcml2YWN5SWQuQ29uc3RhbnRQcml2YXRlLFxuXHRcdFx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHRcdFx0c291cmNlOiBUdW5uZWxTb3VyY2UuRXh0ZW5zaW9uLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndHVubmVsLnN0YXRpY2FsbHlGb3J3YXJkZWQnLCBcIlN0YXRpY2FsbHkgRm9yd2FyZGVkXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy50dW5uZWxTZXJ2aWNlLnNldEVudmlyb25tZW50VHVubmVsKHR1bm5lbC5yZW1vdGVBZGRyZXNzLmhvc3QsIHR1bm5lbC5yZW1vdGVBZGRyZXNzLnBvcnQsIGxvY2FsQWRkcmVzcywgVHVubmVsUHJpdmFjeUlkLkNvbnN0YW50UHJpdmF0ZSwgVHVubmVsUHJvdG9jb2wuSHR0cCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2Vudmlyb25tZW50VHVubmVsc1NldCA9IHRydWU7XG5cdFx0dGhpcy5fb25FbnZpcm9ubWVudFR1bm5lbHNTZXQuZmlyZSgpO1xuXHRcdHRoaXMuX29uRm9yd2FyZFBvcnQuZmlyZSgpO1xuXHR9XG5cblx0c2V0Q2FuZGlkYXRlRmlsdGVyKGZpbHRlcjogKChjYW5kaWRhdGVzOiBDYW5kaWRhdGVQb3J0W10pID0+IFByb21pc2U8Q2FuZGlkYXRlUG9ydFtdPikgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5kaWRhdGVGaWx0ZXIgPSBmaWx0ZXI7XG5cdH1cblxuXHRhc3luYyBzZXRDYW5kaWRhdGVzKGNhbmRpZGF0ZXM6IENhbmRpZGF0ZVBvcnRbXSkge1xuXHRcdGxldCBwcm9jZXNzZWRDYW5kaWRhdGVzID0gY2FuZGlkYXRlcztcblx0XHRpZiAodGhpcy5fY2FuZGlkYXRlRmlsdGVyKSB7XG5cdFx0XHQvLyBXaGVuIGFuIGV4dGVuc2lvbiBwcm92aWRlcyBhIGZpbHRlciwgd2UgZG8gdGhlIGZpbHRlcmluZyBvbiB0aGUgZXh0ZW5zaW9uIGhvc3QgYmVmb3JlIHRoZSBjYW5kaWRhdGVzIGFyZSBzZXQgaGVyZS5cblx0XHRcdC8vIEhvd2V2ZXIsIHdoZW4gdGhlIGZpbHRlciBkb2Vzbid0IGNvbWUgZnJvbSBhbiBleHRlbnNpb24gd2UgZmlsdGVyIGhlcmUuXG5cdFx0XHRwcm9jZXNzZWRDYW5kaWRhdGVzID0gYXdhaXQgdGhpcy5fY2FuZGlkYXRlRmlsdGVyKGNhbmRpZGF0ZXMpO1xuXHRcdH1cblx0XHRjb25zdCByZW1vdmVkQ2FuZGlkYXRlcyA9IHRoaXMudXBkYXRlSW5SZXNwb25zZVRvQ2FuZGlkYXRlcyhwcm9jZXNzZWRDYW5kaWRhdGVzKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoVHVubmVsTW9kZWwpIHJlbW92ZWQgY2FuZGlkYXRlcyAke0FycmF5LmZyb20ocmVtb3ZlZENhbmRpZGF0ZXMudmFsdWVzKCkpLm1hcChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnBvcnQpLmpvaW4oJywgJyl9YCk7XG5cdFx0dGhpcy5fb25DYW5kaWRhdGVzQ2hhbmdlZC5maXJlKHJlbW92ZWRDYW5kaWRhdGVzKTtcblx0fVxuXG5cdC8vIFJldHVybnMgcmVtb3ZlZCBjYW5kaWRhdGVzXG5cdHByaXZhdGUgdXBkYXRlSW5SZXNwb25zZVRvQ2FuZGlkYXRlcyhjYW5kaWRhdGVzOiBDYW5kaWRhdGVQb3J0W10pOiBNYXA8c3RyaW5nLCB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0+IHtcblx0XHRjb25zdCByZW1vdmVkQ2FuZGlkYXRlcyA9IHRoaXMuX2NhbmRpZGF0ZXMgPz8gbmV3IE1hcCgpO1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXNNYXAgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5fY2FuZGlkYXRlcyA9IGNhbmRpZGF0ZXNNYXA7XG5cdFx0Y2FuZGlkYXRlcy5mb3JFYWNoKHZhbHVlID0+IHtcblx0XHRcdGNvbnN0IGFkZHJlc3NLZXkgPSBtYWtlQWRkcmVzcyh2YWx1ZS5ob3N0LCB2YWx1ZS5wb3J0KTtcblx0XHRcdGNhbmRpZGF0ZXNNYXAuc2V0KGFkZHJlc3NLZXksIHtcblx0XHRcdFx0aG9zdDogdmFsdWUuaG9zdCxcblx0XHRcdFx0cG9ydDogdmFsdWUucG9ydCxcblx0XHRcdFx0ZGV0YWlsOiB2YWx1ZS5kZXRhaWwsXG5cdFx0XHRcdHBpZDogdmFsdWUucGlkXG5cdFx0XHR9KTtcblx0XHRcdHJlbW92ZWRDYW5kaWRhdGVzLmRlbGV0ZShhZGRyZXNzS2V5KTtcblx0XHRcdGNvbnN0IGZvcndhcmRlZFZhbHVlID0gbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlcyh0aGlzLmZvcndhcmRlZCwgdmFsdWUuaG9zdCwgdmFsdWUucG9ydCk7XG5cdFx0XHRpZiAoZm9yd2FyZGVkVmFsdWUpIHtcblx0XHRcdFx0Zm9yd2FyZGVkVmFsdWUucnVubmluZ1Byb2Nlc3MgPSB2YWx1ZS5kZXRhaWw7XG5cdFx0XHRcdGZvcndhcmRlZFZhbHVlLmhhc1J1bm5pbmdQcm9jZXNzID0gdHJ1ZTtcblx0XHRcdFx0Zm9yd2FyZGVkVmFsdWUucGlkID0gdmFsdWUucGlkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJlbW92ZWRDYW5kaWRhdGVzLmZvckVhY2goKF92YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRjb25zdCBwYXJzZWRBZGRyZXNzID0gcGFyc2VBZGRyZXNzKGtleSk7XG5cdFx0XHRpZiAoIXBhcnNlZEFkZHJlc3MpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9yd2FyZGVkVmFsdWUgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuZm9yd2FyZGVkLCBwYXJzZWRBZGRyZXNzLmhvc3QsIHBhcnNlZEFkZHJlc3MucG9ydCk7XG5cdFx0XHRpZiAoZm9yd2FyZGVkVmFsdWUpIHtcblx0XHRcdFx0Zm9yd2FyZGVkVmFsdWUucnVubmluZ1Byb2Nlc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvcndhcmRlZFZhbHVlLmhhc1J1bm5pbmdQcm9jZXNzID0gZmFsc2U7XG5cdFx0XHRcdGZvcndhcmRlZFZhbHVlLnBpZCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRldGVjdGVkVmFsdWUgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMuZGV0ZWN0ZWQsIHBhcnNlZEFkZHJlc3MuaG9zdCwgcGFyc2VkQWRkcmVzcy5wb3J0KTtcblx0XHRcdGlmIChkZXRlY3RlZFZhbHVlKSB7XG5cdFx0XHRcdGRldGVjdGVkVmFsdWUucnVubmluZ1Byb2Nlc3MgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGRldGVjdGVkVmFsdWUuaGFzUnVubmluZ1Byb2Nlc3MgPSBmYWxzZTtcblx0XHRcdFx0ZGV0ZWN0ZWRWYWx1ZS5waWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlbW92ZWRDYW5kaWRhdGVzO1xuXHR9XG5cblx0Z2V0IGNhbmRpZGF0ZXMoKTogQ2FuZGlkYXRlUG9ydFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FuZGlkYXRlcyA/IEFycmF5LmZyb20odGhpcy5fY2FuZGlkYXRlcy52YWx1ZXMoKSkgOiBbXTtcblx0fVxuXG5cdGdldCBjYW5kaWRhdGVzT3JVbmRlZmluZWQoKTogQ2FuZGlkYXRlUG9ydFtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FuZGlkYXRlcyA/IHRoaXMuY2FuZGlkYXRlcyA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQXR0cmlidXRlcygpIHtcblx0XHQvLyBJZiB0aGUgbGFiZWwgY2hhbmdlcyBpbiB0aGUgYXR0cmlidXRlcywgd2Ugc2hvdWxkIHVwZGF0ZSBpdC5cblx0XHRjb25zdCB0dW5uZWxzID0gQXJyYXkuZnJvbSh0aGlzLmZvcndhcmRlZC52YWx1ZXMoKSk7XG5cdFx0Y29uc3QgYWxsQXR0cmlidXRlcyA9IGF3YWl0IHRoaXMuZ2V0QXR0cmlidXRlcyh0dW5uZWxzLm1hcCh0dW5uZWwgPT4ge1xuXHRcdFx0cmV0dXJuIHsgcG9ydDogdHVubmVsLnJlbW90ZVBvcnQsIGhvc3Q6IHR1bm5lbC5yZW1vdGVIb3N0IH07XG5cdFx0fSksIGZhbHNlKTtcblx0XHRpZiAoIWFsbEF0dHJpYnV0ZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBmb3J3YXJkZWQgb2YgdHVubmVscykge1xuXHRcdFx0Y29uc3QgYXR0cmlidXRlcyA9IGFsbEF0dHJpYnV0ZXMuZ2V0KGZvcndhcmRlZC5yZW1vdGVQb3J0KTtcblx0XHRcdGlmICgoYXR0cmlidXRlcz8ucHJvdG9jb2wgfHwgKGZvcndhcmRlZC5wcm90b2NvbCAhPT0gVHVubmVsUHJvdG9jb2wuSHR0cCkpICYmIChhdHRyaWJ1dGVzPy5wcm90b2NvbCAhPT0gZm9yd2FyZGVkLnByb3RvY29sKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvRm9yd2FyZCh7XG5cdFx0XHRcdFx0cmVtb3RlOiB7IGhvc3Q6IGZvcndhcmRlZC5yZW1vdGVIb3N0LCBwb3J0OiBmb3J3YXJkZWQucmVtb3RlUG9ydCB9LFxuXHRcdFx0XHRcdGxvY2FsOiBmb3J3YXJkZWQubG9jYWxQb3J0LFxuXHRcdFx0XHRcdG5hbWU6IGZvcndhcmRlZC5uYW1lLFxuXHRcdFx0XHRcdHNvdXJjZTogZm9yd2FyZGVkLnNvdXJjZVxuXHRcdFx0XHR9LCBhdHRyaWJ1dGVzKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhdHRyaWJ1dGVzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGF0dHJpYnV0ZXMubGFiZWwgJiYgYXR0cmlidXRlcy5sYWJlbCAhPT0gZm9yd2FyZGVkLm5hbWUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5uYW1lKGZvcndhcmRlZC5yZW1vdGVIb3N0LCBmb3J3YXJkZWQucmVtb3RlUG9ydCwgYXR0cmlidXRlcy5sYWJlbCk7XG5cdFx0XHR9XG5cblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRBdHRyaWJ1dGVzKGZvcndhcmRlZFBvcnRzOiB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH1bXSwgY2hlY2tQcm92aWRlcnM6IGJvb2xlYW4gPSB0cnVlKTogUHJvbWlzZTxNYXA8bnVtYmVyLCBBdHRyaWJ1dGVzPiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG1hdGNoaW5nQ2FuZGlkYXRlczogTWFwPG51bWJlciwgQ2FuZGlkYXRlUG9ydD4gPSBuZXcgTWFwKCk7XG5cdFx0Y29uc3QgcGlkVG9Qb3J0c01hcHBpbmc6IE1hcDxudW1iZXIgfCB1bmRlZmluZWQsIG51bWJlcltdPiA9IG5ldyBNYXAoKTtcblx0XHRmb3J3YXJkZWRQb3J0cy5mb3JFYWNoKGZvcndhcmRlZFBvcnQgPT4ge1xuXHRcdFx0Y29uc3QgbWF0Y2hpbmdDYW5kaWRhdGUgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzPENhbmRpZGF0ZVBvcnQ+KHRoaXMuX2NhbmRpZGF0ZXMgPz8gbmV3IE1hcCgpLCBMT0NBTEhPU1RfQUREUkVTU0VTWzBdLCBmb3J3YXJkZWRQb3J0LnBvcnQpID8/IGZvcndhcmRlZFBvcnQ7XG5cdFx0XHRpZiAobWF0Y2hpbmdDYW5kaWRhdGUpIHtcblx0XHRcdFx0bWF0Y2hpbmdDYW5kaWRhdGVzLnNldChmb3J3YXJkZWRQb3J0LnBvcnQsIG1hdGNoaW5nQ2FuZGlkYXRlKTtcblx0XHRcdFx0Y29uc3QgcGlkID0gaXNDYW5kaWRhdGVQb3J0KG1hdGNoaW5nQ2FuZGlkYXRlKSA/IG1hdGNoaW5nQ2FuZGlkYXRlLnBpZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCFwaWRUb1BvcnRzTWFwcGluZy5oYXMocGlkKSkge1xuXHRcdFx0XHRcdHBpZFRvUG9ydHNNYXBwaW5nLnNldChwaWQsIFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwaWRUb1BvcnRzTWFwcGluZy5nZXQocGlkKT8ucHVzaChmb3J3YXJkZWRQb3J0LnBvcnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29uZmlnQXR0cmlidXRlczogTWFwPG51bWJlciwgQXR0cmlidXRlcz4gPSBuZXcgTWFwKCk7XG5cdFx0Zm9yd2FyZGVkUG9ydHMuZm9yRWFjaChmb3J3YXJkZWRQb3J0ID0+IHtcblx0XHRcdGNvbnN0IGF0dHJpYnV0ZXMgPSB0aGlzLmNvbmZpZ1BvcnRzQXR0cmlidXRlcy5nZXRBdHRyaWJ1dGVzKGZvcndhcmRlZFBvcnQucG9ydCwgZm9yd2FyZGVkUG9ydC5ob3N0LCBtYXRjaGluZ0NhbmRpZGF0ZXMuZ2V0KGZvcndhcmRlZFBvcnQucG9ydCk/LmRldGFpbCk7XG5cdFx0XHRpZiAoYXR0cmlidXRlcykge1xuXHRcdFx0XHRjb25maWdBdHRyaWJ1dGVzLnNldChmb3J3YXJkZWRQb3J0LnBvcnQsIGF0dHJpYnV0ZXMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmICgodGhpcy5wb3J0QXR0cmlidXRlc1Byb3ZpZGVycy5sZW5ndGggPT09IDApIHx8ICFjaGVja1Byb3ZpZGVycykge1xuXHRcdFx0cmV0dXJuIChjb25maWdBdHRyaWJ1dGVzLnNpemUgPiAwKSA/IGNvbmZpZ0F0dHJpYnV0ZXMgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gR3JvdXAgY2FsbHMgdG8gcHJvdmlkZSBhdHRyaWJ1dGVzIGJ5IHBpZC5cblx0XHRjb25zdCBhbGxQcm92aWRlclJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbCh0aGlzLnBvcnRBdHRyaWJ1dGVzUHJvdmlkZXJzLmZsYXRNYXAocHJvdmlkZXIgPT4ge1xuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20ocGlkVG9Qb3J0c01hcHBpbmcuZW50cmllcygpKS5tYXAoZW50cnkgPT4ge1xuXHRcdFx0XHRjb25zdCBwb3J0R3JvdXAgPSBlbnRyeVsxXTtcblx0XHRcdFx0Y29uc3QgbWF0Y2hpbmdDYW5kaWRhdGUgPSBtYXRjaGluZ0NhbmRpZGF0ZXMuZ2V0KHBvcnRHcm91cFswXSk7XG5cdFx0XHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlUG9ydEF0dHJpYnV0ZXMocG9ydEdyb3VwLFxuXHRcdFx0XHRcdG1hdGNoaW5nQ2FuZGlkYXRlPy5waWQsIG1hdGNoaW5nQ2FuZGlkYXRlPy5kZXRhaWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVkQXR0cmlidXRlczogTWFwPG51bWJlciwgUHJvdmlkZWRQb3J0QXR0cmlidXRlcz4gPSBuZXcgTWFwKCk7XG5cdFx0YWxsUHJvdmlkZXJSZXN1bHRzLmZvckVhY2goYXR0cmlidXRlcyA9PiBhdHRyaWJ1dGVzLmZvckVhY2goYXR0cmlidXRlID0+IHtcblx0XHRcdGlmIChhdHRyaWJ1dGUpIHtcblx0XHRcdFx0cHJvdmlkZWRBdHRyaWJ1dGVzLnNldChhdHRyaWJ1dGUucG9ydCwgYXR0cmlidXRlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIWNvbmZpZ0F0dHJpYnV0ZXMgJiYgIXByb3ZpZGVkQXR0cmlidXRlcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBNZXJnZS4gVGhlIGNvbmZpZyB3aW5zLlxuXHRcdGNvbnN0IG1lcmdlZEF0dHJpYnV0ZXM6IE1hcDxudW1iZXIsIEF0dHJpYnV0ZXM+ID0gbmV3IE1hcCgpO1xuXHRcdGZvcndhcmRlZFBvcnRzLmZvckVhY2goZm9yd2FyZGVkUG9ydHMgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gY29uZmlnQXR0cmlidXRlcy5nZXQoZm9yd2FyZGVkUG9ydHMucG9ydCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHByb3ZpZGVkQXR0cmlidXRlcy5nZXQoZm9yd2FyZGVkUG9ydHMucG9ydCk7XG5cdFx0XHRtZXJnZWRBdHRyaWJ1dGVzLnNldChmb3J3YXJkZWRQb3J0cy5wb3J0LCB7XG5cdFx0XHRcdGVsZXZhdGVJZk5lZWRlZDogY29uZmlnPy5lbGV2YXRlSWZOZWVkZWQsXG5cdFx0XHRcdGxhYmVsOiBjb25maWc/LmxhYmVsLFxuXHRcdFx0XHRvbkF1dG9Gb3J3YXJkOiBjb25maWc/Lm9uQXV0b0ZvcndhcmQgPz8gUG9ydHNBdHRyaWJ1dGVzLnByb3ZpZGVkQWN0aW9uVG9BY3Rpb24ocHJvdmlkZXI/LmF1dG9Gb3J3YXJkQWN0aW9uKSxcblx0XHRcdFx0cmVxdWlyZUxvY2FsUG9ydDogY29uZmlnPy5yZXF1aXJlTG9jYWxQb3J0LFxuXHRcdFx0XHRwcm90b2NvbDogY29uZmlnPy5wcm90b2NvbFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbWVyZ2VkQXR0cmlidXRlcztcblx0fVxuXG5cdGFkZEF0dHJpYnV0ZXNQcm92aWRlcihwcm92aWRlcjogUG9ydEF0dHJpYnV0ZXNQcm92aWRlcikge1xuXHRcdHRoaXMucG9ydEF0dHJpYnV0ZXNQcm92aWRlcnMucHVzaChwcm92aWRlcik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsV0FBVztBQUNwQixTQUE4Qiw2QkFBNkI7QUFDM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyx1Q0FBMEQ7QUFDbkUsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFD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LElBQUk7QUFDeEUsdUJBQW1CLFFBQVEsZ0JBQWMsV0FBVyxRQUFRLGVBQWE7QUFDeEUsVUFBSSxXQUFXO0FBQ2QsMkJBQW1CLElBQUksVUFBVSxNQUFNLFNBQVM7QUFBQSxNQUNqRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsUUFBSSxDQUFDLG9CQUFvQixDQUFDLG9CQUFvQjtBQUM3QyxhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sbUJBQTRDLG9CQUFJLElBQUk7QUFDMUQsbUJBQWUsUUFBUSxDQUFBQyxvQkFBa0I7QUFDeEMsWUFBTSxTQUFTLGlCQUFpQixJQUFJQSxnQkFBZSxJQUFJO0FBQ3ZELFlBQU0sV0FBVyxtQkFBbUIsSUFBSUEsZ0JBQWUsSUFBSTtBQUMzRCx1QkFBaUIsSUFBSUEsZ0JBQWUsTUFBTTtBQUFBLFFBQ3pDLGlCQUFpQixRQUFRO0FBQUEsUUFDekIsT0FBTyxRQUFRO0FBQUEsUUFDZixlQUFlLFFBQVEsaUJBQWlCLGdCQUFnQix1QkFBdUIsVUFBVSxpQkFBaUI7QUFBQSxRQUMxRyxrQkFBa0IsUUFBUTtBQUFBLFFBQzFCLFVBQVUsUUFBUTtBQUFBLE1BQ25CLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsc0JBQXNCLFVBQWtDO0FBQ3ZELFNBQUssd0JBQXdCLEtBQUssUUFBUTtBQUFBLEVBQzNDO0FBQ0Q7QUE1WWU7QUFBQSxFQURiLFNBQVMsR0FBSTtBQUFBLEdBclBGLFlBc1BFO0FBdFBGLGNBQU47QUFBQSxFQStCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeENVOyIsCiAgIm5hbWVzIjogWyJUdW5uZWxDbG9zZVJlYXNvbiIsICJUdW5uZWxTb3VyY2UiLCAiT25Qb3J0Rm9yd2FyZCIsICJNZXJnZWRBdHRyaWJ1dGVBY3Rpb24iLCAiZm9yd2FyZGVkUG9ydHMiXQp9Cg==
