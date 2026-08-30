import { DeferredPromise } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { webContents as electronWebContents } from "electron";
import { localize } from "../../../nls.js";
import { StorageScope, StorageTarget } from "../../storage/common/storage.js";
import {
  BrowserPermissionStore,
  PermissionCategory,
  electronPermissionToCategories,
  isAlwaysAllowedPermission,
  toOriginKey
} from "../common/browserPermissions.js";
import { BrowserViewStorageScope } from "../common/browserView.js";
const PROMPT_TIMEOUT_MS = 3e4;
class BrowserSessionPermissions extends Disposable {
  constructor(session) {
    super();
    this._permissionStore = this._register(new BrowserPermissionStore());
    /** Fires on any change to the store (set, clear, hydrate). */
    this.onDidChange = this._permissionStore.onDidChange;
    this._persistable = false;
    /** While set, store changes are coalesced into a single deferred flush. */
    this._batching = false;
    this._batchDirty = false;
    this._onDidRequestPermission = this._register(new Emitter());
    this.onDidRequestPermission = this._onDidRequestPermission.event;
    this._onDidRequestDevice = this._register(new Emitter());
    this.onDidRequestDevice = this._onDidRequestDevice.event;
    this._pending = /* @__PURE__ */ new Set();
    this._pendingDevices = /* @__PURE__ */ new Map();
    this.storageKeys = session.storageScope === BrowserViewStorageScope.Ephemeral ? {} : { permissions: `browser.permissions.${session.id}` };
    this._register(this._permissionStore.onDidChange(() => {
      this._resolvePending();
      if (this._batching) {
        this._batchDirty = true;
        return;
      }
      if (this._persistable) {
        this._flushNow();
      }
    }));
    this._register(toDisposable(() => {
      for (const pending of this._pending) {
        pending.deferred.complete();
      }
      this._pending.clear();
      for (const device of [...this._pendingDevices.values()]) {
        device.settle(null);
      }
    }));
  }
  /**
   * Install the permission request / check / device handlers on the session.
   * Backed entirely by {@link BrowserPermissionStore}; unrecorded categories
   * are brokered to the owning browser view via {@link onDidRequestPermission}.
   */
  configure(electronSession) {
    electronSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      this._resolveRequest(webContents, permission, details).then(callback, () => callback(false));
    });
    electronSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
      if (isAlwaysAllowedPermission(permission)) {
        return true;
      }
      const origin = toOriginKey(details.requestingUrl || requestingOrigin);
      const categories = electronPermissionToCategories(permission, mediaKindsFromDetails(details));
      if (categories.length === 0) {
        return false;
      }
      return categories.every((category) => this._permissionStore.isAllowed(origin, category));
    });
    electronSession.on("select-usb-device", (event, details, callback) => {
      event.preventDefault();
      const target = this._frameTarget(details.frame);
      if (!target || !this._deviceAllowed(target.origin)) {
        callback();
        return;
      }
      this._beginDeviceRequest({
        webContents: target.webContents,
        origin: target.origin,
        deviceType: "usb",
        devices: details.deviceList.map(usbCandidate),
        invoke: (deviceId) => deviceId === null ? callback() : callback(deviceId)
      });
    });
    electronSession.on("usb-device-added", (_event, device, webContents) => {
      this._addDevice(webContents, "usb", usbCandidate(device));
    });
    electronSession.on("usb-device-removed", (_event, device, webContents) => {
      this._removeDevice(webContents, "usb", device.deviceId);
    });
    electronSession.on("select-serial-port", (event, portList, webContents, callback) => {
      event.preventDefault();
      const origin = toOriginKey(webContents.getURL());
      if (!this._deviceAllowed(origin)) {
        callback("");
        return;
      }
      this._beginDeviceRequest({
        webContents,
        origin,
        deviceType: "serial",
        devices: portList.map(serialCandidate),
        invoke: (deviceId) => callback(deviceId ?? "")
      });
    });
    electronSession.on("serial-port-added", (_event, port, webContents) => {
      this._addDevice(webContents, "serial", serialCandidate(port));
    });
    electronSession.on("serial-port-removed", (_event, port, webContents) => {
      this._removeDevice(webContents, "serial", port.portId);
    });
    electronSession.on("select-hid-device", (event, details, callback) => {
      event.preventDefault();
      const target = this._frameTarget(details.frame);
      if (!target || !this._deviceAllowed(target.origin)) {
        callback(null);
        return;
      }
      this._beginDeviceRequest({
        webContents: target.webContents,
        origin: target.origin,
        deviceType: "hid",
        devices: details.deviceList.map(hidCandidate),
        invoke: (deviceId) => callback(deviceId ?? null)
      });
    });
    electronSession.on("hid-device-added", (_event, details) => {
      const target = this._frameTarget(details.frame);
      if (target) {
        this._addDevice(target.webContents, "hid", hidCandidate(details.device));
      }
    });
    electronSession.on("hid-device-removed", (_event, details) => {
      const target = this._frameTarget(details.frame);
      if (target) {
        this._removeDevice(target.webContents, "hid", details.device.deviceId);
      }
    });
  }
  connectStorage(storage) {
    if (this._storage || !this.storageKeys.permissions) {
      return;
    }
    this._storage = storage;
    this._load();
    this._persistable = true;
  }
  serialize() {
    return this._permissionStore.serialize();
  }
  set(origin, grants) {
    const key = toOriginKey(origin);
    for (const grant of grants) {
      if (grant.state === null) {
        this._resolvePendingForCategory(key, grant.category);
      }
    }
    this._batching = true;
    this._batchDirty = false;
    try {
      this._permissionStore.setMany(origin, grants);
    } finally {
      this._batching = false;
    }
    if (this._batchDirty && this._persistable) {
      this._flushNow();
    }
  }
  _resolvePendingForCategory(origin, category) {
    if (!origin || this._pending.size === 0) {
      return;
    }
    for (const pending of [...this._pending]) {
      if (pending.origin === origin && pending.category === category) {
        pending.deferred.complete();
      }
    }
  }
  clear() {
    this._permissionStore.clear();
  }
  // -- Device choosers -------------------------------------------------
  beginBluetoothRequest(webContents, devices, callback) {
    const origin = toOriginKey(webContents.getURL());
    if (!this._deviceAllowed(origin)) {
      callback("");
      return;
    }
    const candidates = devices.map(bluetoothCandidate);
    const existing = this._findActiveDevice(webContents, "bluetooth");
    if (existing) {
      existing.devices = candidates;
      existing.invoke = (deviceId) => callback(deviceId ?? "");
      this._emitDeviceRequest(existing);
      return;
    }
    this._beginDeviceRequest({
      webContents,
      origin,
      deviceType: "bluetooth",
      devices: candidates,
      invoke: (deviceId) => callback(deviceId ?? "")
    });
  }
  resolveDevice(requestId, deviceId) {
    this._pendingDevices.get(requestId)?.settle(deviceId);
  }
  /** Begin a device chooser: register it, emit it, and cancel if unclaimed. */
  _beginDeviceRequest(params) {
    const requestId = generateUuid();
    const settle = (deviceId) => {
      if (pending.settled) {
        return;
      }
      pending.settled = true;
      params.webContents.off("destroyed", cancel);
      this._pendingDevices.delete(requestId);
      pending.invoke(deviceId);
    };
    const cancel = () => settle(null);
    const pending = {
      requestId,
      webContents: params.webContents,
      origin: params.origin,
      deviceType: params.deviceType,
      devices: params.devices,
      settled: false,
      invoke: params.invoke,
      settle
    };
    params.webContents.on("destroyed", cancel);
    this._pendingDevices.set(requestId, pending);
    if (!this._emitDeviceRequest(pending)) {
      cancel();
    }
  }
  _emitDeviceRequest(pending) {
    let claimed = false;
    this._onDidRequestDevice.fire({
      webContents: pending.webContents,
      origin: pending.origin,
      requestId: pending.requestId,
      deviceType: pending.deviceType,
      devices: pending.devices,
      claim: () => {
        claimed = true;
      }
    });
    return claimed;
  }
  _addDevice(webContents, deviceType, candidate) {
    const pending = this._findActiveDevice(webContents, deviceType);
    if (!pending || pending.devices.some((device) => device.deviceId === candidate.deviceId)) {
      return;
    }
    pending.devices = [...pending.devices, candidate];
    this._emitDeviceRequest(pending);
  }
  _removeDevice(webContents, deviceType, deviceId) {
    const pending = this._findActiveDevice(webContents, deviceType);
    if (!pending) {
      return;
    }
    const next = pending.devices.filter((device) => device.deviceId !== deviceId);
    if (next.length === pending.devices.length) {
      return;
    }
    pending.devices = next;
    this._emitDeviceRequest(pending);
  }
  _findActiveDevice(webContents, deviceType) {
    for (const pending of this._pendingDevices.values()) {
      if (!pending.settled && pending.webContents === webContents && pending.deviceType === deviceType) {
        return pending;
      }
    }
    return void 0;
  }
  /** Resolve the owning web contents and origin for a requesting frame. */
  _frameTarget(frame) {
    if (!frame) {
      return void 0;
    }
    const webContents = electronWebContents.fromFrame(frame);
    if (!webContents) {
      return void 0;
    }
    return { webContents, origin: toOriginKey(frame.url || webContents.getURL()) };
  }
  _deviceAllowed(origin) {
    return !!origin && this._permissionStore.isAllowed(origin, PermissionCategory.Devices);
  }
  async _resolveRequest(webContents, permission, details) {
    if (isAlwaysAllowedPermission(permission)) {
      return true;
    }
    const origin = toOriginKey(details?.requestingUrl ?? webContents?.getURL());
    const categories = electronPermissionToCategories(permission, mediaKindsFromDetails(details));
    if (categories.length === 0 || !origin) {
      return false;
    }
    if (categories.every((category) => this._permissionStore.isAllowed(origin, category))) {
      return true;
    }
    if (categories.some((category) => this._permissionStore.getDecision(origin, category) === "deny")) {
      return false;
    }
    for (const category of categories) {
      if (!this._permissionStore.getDecision(origin, category)) {
        await this._prompt(webContents, origin, category);
      }
    }
    return categories.every((category) => this._permissionStore.isAllowed(origin, category));
  }
  _prompt(webContents, origin, category) {
    if (!webContents) {
      return Promise.resolve();
    }
    let claimed = false;
    this._onDidRequestPermission.fire({
      webContents,
      request: { origin, category },
      claim: () => {
        claimed = true;
      }
    });
    if (!claimed) {
      return Promise.resolve();
    }
    const pending = { origin, category, deferred: new DeferredPromise() };
    this._pending.add(pending);
    const timer = setTimeout(() => pending.deferred.complete(), PROMPT_TIMEOUT_MS);
    return pending.deferred.p.finally(() => {
      clearTimeout(timer);
      this._pending.delete(pending);
    });
  }
  /** Resolve any pending request whose (origin, category) now has a decision. */
  _resolvePending() {
    if (this._pending.size === 0) {
      return;
    }
    for (const pending of [...this._pending]) {
      if (this._permissionStore.getDecision(pending.origin, pending.category)) {
        pending.deferred.complete();
      }
    }
  }
  _load() {
    const storage = this._storage;
    const key = this.storageKeys.permissions;
    if (!storage || !key) {
      return;
    }
    const snapshot = parseSnapshot(storage.get(key, StorageScope.APPLICATION));
    this._persistable = false;
    try {
      this._permissionStore.hydrate(snapshot);
    } finally {
      this._persistable = true;
    }
  }
  _flushNow() {
    const storage = this._storage;
    const key = this.storageKeys.permissions;
    if (!storage || !key) {
      return;
    }
    const snapshot = this._permissionStore.serialize();
    if (Object.keys(snapshot.origins).length === 0) {
      storage.remove(key, StorageScope.APPLICATION);
    } else {
      storage.store(key, JSON.stringify(snapshot), StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
  }
}
function parseSnapshot(raw) {
  if (!raw) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return void 0;
    }
    return parsed;
  } catch {
    return void 0;
  }
}
function mediaKindsFromDetails(details) {
  if (!details) {
    return void 0;
  }
  const kinds = /* @__PURE__ */ new Set();
  if ("mediaTypes" in details && details.mediaTypes) {
    for (const kind of details.mediaTypes) {
      kinds.add(kind);
    }
  }
  if ("mediaType" in details && (details.mediaType === "video" || details.mediaType === "audio")) {
    kinds.add(details.mediaType);
  }
  return kinds.size ? [...kinds] : void 0;
}
function vendorProductHex(vendorId, productId) {
  const hex = (value) => (value ?? 0).toString(16).padStart(4, "0");
  return `${hex(vendorId)}:${hex(productId)}`;
}
function usbCandidate(device) {
  const ids = vendorProductHex(device.vendorId, device.productId);
  return {
    deviceId: device.deviceId,
    label: device.productName || device.manufacturerName || localize("browser.device.usb", "USB Device {0}", ids),
    detail: device.serialNumber ? `${ids} \xB7 ${device.serialNumber}` : ids
  };
}
function serialCandidate(port) {
  const ids = port.vendorId && port.productId ? `${port.vendorId}:${port.productId}` : void 0;
  return {
    deviceId: port.portId,
    label: `${port.portName} (${port.displayName})`,
    detail: ids
  };
}
function hidCandidate(device) {
  const ids = vendorProductHex(device.vendorId, device.productId);
  return {
    deviceId: device.deviceId,
    label: device.name || localize("browser.device.hid", "HID Device {0}", ids),
    detail: device.serialNumber ? `${ids} \xB7 ${device.serialNumber}` : ids
  };
}
function bluetoothCandidate(device) {
  return {
    deviceId: device.deviceId,
    label: device.deviceName || device.deviceId,
    detail: device.deviceId
  };
}
export {
  BrowserSessionPermissions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXGVsZWN0cm9uLW1haW5cXGJyb3dzZXJTZXNzaW9uUGVybWlzc2lvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IHdlYkNvbnRlbnRzIGFzIGVsZWN0cm9uV2ViQ29udGVudHMgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQXBwbGljYXRpb25TdG9yYWdlTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2VsZWN0cm9uLW1haW4vc3RvcmFnZU1haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHtcblx0QnJvd3NlckRldmljZVR5cGUsXG5cdEJyb3dzZXJQZXJtaXNzaW9uU3RvcmUsXG5cdElCcm93c2VyRGV2aWNlQ2FuZGlkYXRlLFxuXHRJUGVybWlzc2lvbkNhdGVnb3J5U3RhdGUsXG5cdElTZXJpYWxpemVkQnJvd3NlclBlcm1pc3Npb25zU25hcHNob3QsXG5cdFBlcm1pc3Npb25DYXRlZ29yeSxcblx0ZWxlY3Ryb25QZXJtaXNzaW9uVG9DYXRlZ29yaWVzLFxuXHRpc0Fsd2F5c0FsbG93ZWRQZXJtaXNzaW9uLFxuXHR0b09yaWdpbktleSxcbn0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJQZXJtaXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyVmlld1N0b3JhZ2VTY29wZSwgSUJyb3dzZXJWaWV3UGVybWlzc2lvblJlcXVlc3RFdmVudCwgSUJyb3dzZXJWaWV3U3RvcmFnZUtleXMgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHR5cGUgeyBCcm93c2VyU2Vzc2lvbiB9IGZyb20gJy4vYnJvd3NlclNlc3Npb24uanMnO1xuXG4vKiogVGltZSB0aGUgbWFpbiBwcm9jZXNzIHdhaXRzIGZvciBhIHByb21wdCBhbnN3ZXIgYmVmb3JlIGEgbm9uLXBlcnNpc3RlZCBkZW55LiAqL1xuY29uc3QgUFJPTVBUX1RJTUVPVVRfTVMgPSAzMF8wMDA7XG5cbi8qKlxuICogRmlyZWQgd2hlbiBhIHBlcm1pc3Npb24gcmVxdWVzdCBmb3IgYW4gdW5kZWNpZGVkIGNhdGVnb3J5IG5lZWRzIFVJLiBUaGUgdmlld1xuICogdGhhdCBvd25zIHtAbGluayB3ZWJDb250ZW50c30gc2hvdWxkIHtAbGluayBjbGFpbX0gaXQgYW5kIHN1cmZhY2UgYSBwcm9tcHQ7XG4gKiBpZiBubyBsaXN0ZW5lciBjbGFpbXMgaXQsIHRoZSByZXF1ZXN0IGlzIGxlZnQgdW5kZWNpZGVkIChlZmZlY3RpdmUgZGVueSkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJTZXNzaW9uUGVybWlzc2lvblJlcXVlc3Qge1xuXHQvKiogVGhlIHRvcC1sZXZlbCB3ZWIgY29udGVudHMgdGhlIHJlcXVlc3Qgb3JpZ2luYXRlcyBmcm9tLiAqL1xuXHRyZWFkb25seSB3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHM7XG5cdC8qKiBUaGUgb3JpZ2luICsgY2F0ZWdvcnkgYmVpbmcgcmVxdWVzdGVkLiAqL1xuXHRyZWFkb25seSByZXF1ZXN0OiBJQnJvd3NlclZpZXdQZXJtaXNzaW9uUmVxdWVzdEV2ZW50O1xuXHQvKiogQ2FsbGVkIGJ5IHRoZSBvd25pbmcgdmlldyB0byB0YWtlIHJlc3BvbnNpYmlsaXR5IGZvciBwcm9tcHRpbmcuICovXG5cdGNsYWltKCk6IHZvaWQ7XG59XG5cbi8qKlxuICogRmlyZWQgd2hlbiBhIGhhcmR3YXJlLWRldmljZSBjaG9vc2VyICh7QGxpbmsgUGVybWlzc2lvbkNhdGVnb3J5LkRldmljZXN9KSBuZWVkc1xuICogVUksIGFuZCByZS1maXJlZCBhcyB0aGUgYXZhaWxhYmxlIGRldmljZSBsaXN0IGNoYW5nZXMuIFRoZSBvd25pbmcgdmlld1xuICoge0BsaW5rIGNsYWltfXMgaXQgYW5kIHN1cmZhY2VzIGEgcGlja2VyOyB0aGUgdXNlcidzIHBpY2sgaXMgcmVwb3J0ZWQgYmFjayB2aWFcbiAqIHtAbGluayBJQnJvd3NlclNlc3Npb25QZXJtaXNzaW9ucy5yZXNvbHZlRGV2aWNlfS4gSWYgdGhlIG9yaWdpbmF0aW5nXG4gKiB3ZWJDb250ZW50cyBpcyBkZXN0cm95ZWQgb3IgdGhlIHNlc3Npb24gaXMgZGlzcG9zZWQsIHRoZSBwYWdlIHByb21pc2UgaXNcbiAqIHNldHRsZWQgYW5kIHRoZSBwZW5kaW5nIHJlcXVlc3QgaXMgcmVtb3ZlZDsgYSBsYXRlXG4gKiB7QGxpbmsgSUJyb3dzZXJTZXNzaW9uUGVybWlzc2lvbnMucmVzb2x2ZURldmljZX0gY2FsbCBpcyB0aGVuIGEgbm8tb3AuIEFueVxuICogb3BlbiBwaWNrZXIgb24gdGhlIHdvcmtiZW5jaCBzaWRlIGlzIGxlZnQgb3BlbiB1bnRpbCB0aGUgdXNlciBkaXNtaXNzZXMgaXQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJTZXNzaW9uRGV2aWNlUmVxdWVzdCB7XG5cdC8qKiBUaGUgdG9wLWxldmVsIHdlYiBjb250ZW50cyB0aGUgcmVxdWVzdCBvcmlnaW5hdGVzIGZyb20uICovXG5cdHJlYWRvbmx5IHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50cztcblx0LyoqIFRoZSBvcmlnaW4gcmVxdWVzdGluZyBhIGRldmljZS4gKi9cblx0cmVhZG9ubHkgb3JpZ2luOiBzdHJpbmc7XG5cdC8qKiBTdGFibGUgaWQgY29ycmVsYXRpbmcgdGhlIGluaXRpYWwgcmVxdWVzdCB3aXRoIGl0cyB1cGRhdGVzLiAqL1xuXHRyZWFkb25seSByZXF1ZXN0SWQ6IHN0cmluZztcblx0LyoqIFdoaWNoIG5hdGl2ZSBjaG9vc2VyIGZsb3cgdGhpcyBpcy4gKi9cblx0cmVhZG9ubHkgZGV2aWNlVHlwZTogQnJvd3NlckRldmljZVR5cGU7XG5cdC8qKiBUaGUgZGV2aWNlcyBjdXJyZW50bHkgYXZhaWxhYmxlIHRvIGNob29zZSBmcm9tLiAqL1xuXHRyZWFkb25seSBkZXZpY2VzOiBJQnJvd3NlckRldmljZUNhbmRpZGF0ZVtdO1xuXHQvKiogQ2FsbGVkIGJ5IHRoZSBvd25pbmcgdmlldyB0byB0YWtlIHJlc3BvbnNpYmlsaXR5IGZvciB0aGUgY2hvb3NlciBVSS4gKi9cblx0Y2xhaW0oKTogdm9pZDtcbn1cblxuLyoqIEludGVybmFsIHJlY29yZCBvZiBhbiBpbi1mbGlnaHQgZGV2aWNlIGNob29zZXIgYXdhaXRpbmcgdGhlIHVzZXIncyBwaWNrLiAqL1xuaW50ZXJmYWNlIElQZW5kaW5nRGV2aWNlUmVxdWVzdCB7XG5cdHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nO1xuXHRyZWFkb25seSB3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHM7XG5cdHJlYWRvbmx5IG9yaWdpbjogc3RyaW5nO1xuXHRyZWFkb25seSBkZXZpY2VUeXBlOiBCcm93c2VyRGV2aWNlVHlwZTtcblx0ZGV2aWNlczogSUJyb3dzZXJEZXZpY2VDYW5kaWRhdGVbXTtcblx0c2V0dGxlZDogYm9vbGVhbjtcblx0LyoqIFR5cGUtc3BlY2lmaWMgYWRhcHRlciB0aGF0IGNhbGxzIHRoZSBuYXRpdmUgRWxlY3Ryb24gY2FsbGJhY2suICovXG5cdGludm9rZTogKGRldmljZUlkOiBzdHJpbmcgfCBudWxsKSA9PiB2b2lkO1xuXHQvKiogUmVzb2x2ZSB0aGUgY2hvb3NlciB3aXRoIGEgZGV2aWNlIGlkLCBvciBgbnVsbGAgdG8gY2FuY2VsLiAqL1xuXHRzZXR0bGUoZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpOiB2b2lkO1xufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJTZXNzaW9uUGVybWlzc2lvbnMge1xuXHRyZWFkb25seSBzdG9yYWdlS2V5czogSUJyb3dzZXJWaWV3U3RvcmFnZUtleXM7XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGFuIHVuZGVjaWRlZCBwZXJtaXNzaW9uIG5lZWRzIFVJLiBFYWNoIGJyb3dzZXIgdmlldyBsaXN0ZW5zIGFuZFxuXHQgKiBjbGFpbXMgdGhlIHJlcXVlc3RzIHRhcmdldGluZyBpdHMgb3duIHdlYiBjb250ZW50cy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdFBlcm1pc3Npb246IEV2ZW50PElCcm93c2VyU2Vzc2lvblBlcm1pc3Npb25SZXF1ZXN0Pjtcblx0LyoqIEZpcmVzIHdoZW4gYSBoYXJkd2FyZS1kZXZpY2UgY2hvb3NlciBuZWVkcyBVSSwgYW5kIGFnYWluIGFzIGl0cyBkZXZpY2UgbGlzdCBjaGFuZ2VzLiAqL1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3REZXZpY2U6IEV2ZW50PElCcm93c2VyU2Vzc2lvbkRldmljZVJlcXVlc3Q+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG5cdC8qKiBDdXJyZW50IHNuYXBzaG90IG9mIGFsbCByZWNvcmRlZCBkZWNpc2lvbnMsIG1pcnJvcmVkIHRvIHRoZSB3b3JrYmVuY2guICovXG5cdHNlcmlhbGl6ZSgpOiBJU2VyaWFsaXplZEJyb3dzZXJQZXJtaXNzaW9uc1NuYXBzaG90O1xuXHQvKiogUmVjb3JkIHBlcm1pc3Npb24gZGVjaXNpb25zIGZvciBhbiBvcmlnaW4gYW5kIHBlcnNpc3QgaW1tZWRpYXRlbHkuICovXG5cdHNldChvcmlnaW46IHN0cmluZywgZ3JhbnRzOiByZWFkb25seSBJUGVybWlzc2lvbkNhdGVnb3J5U3RhdGVbXSk6IHZvaWQ7XG5cdC8qKiBDbGVhciBhbGwgcmVjb3JkZWQgcGVybWlzc2lvbiBzdGF0ZSBmb3IgdGhpcyBzZXNzaW9uLiAqL1xuXHRjbGVhcigpOiB2b2lkO1xuXHQvKiogRnVubmVsIGEgcGVyLXdlYkNvbnRlbnRzIEJsdWV0b290aCBjaG9vc2VyIGludG8gdGhlIHVuaWZpZWQgZGV2aWNlIGZsb3cuICovXG5cdGJlZ2luQmx1ZXRvb3RoUmVxdWVzdCh3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHMsIGRldmljZXM6IEVsZWN0cm9uLkJsdWV0b290aERldmljZVtdLCBjYWxsYmFjazogKGRldmljZUlkOiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkO1xuXHQvKiogQW5zd2VyIGEgZGV2aWNlIGNob29zZXIgd2l0aCB0aGUgY2hvc2VuIGlkLCBvciBgbnVsbGAgdG8gY2FuY2VsLiAqL1xuXHRyZXNvbHZlRGV2aWNlKHJlcXVlc3RJZDogc3RyaW5nLCBkZXZpY2VJZDogc3RyaW5nIHwgbnVsbCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJUGVuZGluZ1JlcXVlc3Qge1xuXHRyZWFkb25seSBvcmlnaW46IHN0cmluZztcblx0cmVhZG9ubHkgY2F0ZWdvcnk6IFBlcm1pc3Npb25DYXRlZ29yeTtcblx0cmVhZG9ubHkgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTx2b2lkPjtcbn1cblxuLyoqXG4gKiBQZXIte0BsaW5rIEJyb3dzZXJTZXNzaW9ufSBwZXJtaXNzaW9uIHN0YXRlLiBPd25zIHRoZSBhdXRob3JpdGF0aXZlXG4gKiB7QGxpbmsgQnJvd3NlclBlcm1pc3Npb25TdG9yZX0sIGluc3RhbGxzIHRoZSBFbGVjdHJvbiBwZXJtaXNzaW9uIGhhbmRsZXJzIHRoYXRcbiAqIGNvbnN1bHQgaXQsIGFuZCBicm9rZXJzIHByb21wdHMgZm9yIGNhdGVnb3JpZXMgdGhhdCBoYXZlIG5vIHJlY29yZGVkIGRlY2lzaW9uLlxuICpcbiAqIEV2ZXJ5IGNoYW5nZSB0byB0aGUgc3RvcmUgaXMgZmx1c2hlZCB0byBhcHBsaWNhdGlvbiBzdG9yYWdlIGltbWVkaWF0ZWx5IHNvXG4gKiBkZWNpc2lvbnMgc3Vydml2ZSBhIGNyYXNoIHJpZ2h0IGFmdGVyIHRoZXkgYXJlIG1hZGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBCcm93c2VyU2Vzc2lvblBlcm1pc3Npb25zIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElCcm93c2VyU2Vzc2lvblBlcm1pc3Npb25zIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wZXJtaXNzaW9uU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnJvd3NlclBlcm1pc3Npb25TdG9yZSgpKTtcblxuXHQvKiogRmlyZXMgb24gYW55IGNoYW5nZSB0byB0aGUgc3RvcmUgKHNldCwgY2xlYXIsIGh5ZHJhdGUpLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9wZXJtaXNzaW9uU3RvcmUub25EaWRDaGFuZ2U7XG5cblx0cHJpdmF0ZSBfc3RvcmFnZTogSUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wZXJzaXN0YWJsZSA9IGZhbHNlO1xuXG5cdC8qKiBXaGlsZSBzZXQsIHN0b3JlIGNoYW5nZXMgYXJlIGNvYWxlc2NlZCBpbnRvIGEgc2luZ2xlIGRlZmVycmVkIGZsdXNoLiAqL1xuXHRwcml2YXRlIF9iYXRjaGluZyA9IGZhbHNlO1xuXHRwcml2YXRlIF9iYXRjaERpcnR5ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0UGVybWlzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElCcm93c2VyU2Vzc2lvblBlcm1pc3Npb25SZXF1ZXN0PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0UGVybWlzc2lvbiA9IHRoaXMuX29uRGlkUmVxdWVzdFBlcm1pc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0RGV2aWNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJTZXNzaW9uRGV2aWNlUmVxdWVzdD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdERldmljZSA9IHRoaXMuX29uRGlkUmVxdWVzdERldmljZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nID0gbmV3IFNldDxJUGVuZGluZ1JlcXVlc3Q+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdEZXZpY2VzID0gbmV3IE1hcDxzdHJpbmcsIElQZW5kaW5nRGV2aWNlUmVxdWVzdD4oKTtcblxuXHRyZWFkb25seSBzdG9yYWdlS2V5czogSUJyb3dzZXJWaWV3U3RvcmFnZUtleXM7XG5cblx0Y29uc3RydWN0b3Ioc2Vzc2lvbjogQnJvd3NlclNlc3Npb24pIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zdG9yYWdlS2V5cyA9IHNlc3Npb24uc3RvcmFnZVNjb3BlID09PSBCcm93c2VyVmlld1N0b3JhZ2VTY29wZS5FcGhlbWVyYWxcblx0XHRcdD8ge31cblx0XHRcdDogeyBwZXJtaXNzaW9uczogYGJyb3dzZXIucGVybWlzc2lvbnMuJHtzZXNzaW9uLmlkfWAgfTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Blcm1pc3Npb25TdG9yZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNvbHZlUGVuZGluZygpO1xuXHRcdFx0Ly8gRHVyaW5nIGEgYmF0Y2hlZCBgc2V0KClgIGRlZmVyIHRoZSB3cml0ZSBzbyBzZXZlcmFsIGNhdGVnb3J5XG5cdFx0XHQvLyBjaGFuZ2VzIGNvbGxhcHNlIGludG8gYSBzaW5nbGUgc3RvcmFnZSBmbHVzaC5cblx0XHRcdGlmICh0aGlzLl9iYXRjaGluZykge1xuXHRcdFx0XHR0aGlzLl9iYXRjaERpcnR5ID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3BlcnNpc3RhYmxlKSB7XG5cdFx0XHRcdHRoaXMuX2ZsdXNoTm93KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiB0aGlzLl9wZW5kaW5nKSB7XG5cdFx0XHRcdHBlbmRpbmcuZGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3BlbmRpbmcuY2xlYXIoKTtcblx0XHRcdC8vIENhbmNlbCBhbnkgaW4tZmxpZ2h0IGRldmljZSBjaG9vc2VycyBzbyBwYWdlcyBhcmVuJ3QgbGVmdCBoYW5naW5nLlxuXHRcdFx0Zm9yIChjb25zdCBkZXZpY2Ugb2YgWy4uLnRoaXMuX3BlbmRpbmdEZXZpY2VzLnZhbHVlcygpXSkge1xuXHRcdFx0XHRkZXZpY2Uuc2V0dGxlKG51bGwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnN0YWxsIHRoZSBwZXJtaXNzaW9uIHJlcXVlc3QgLyBjaGVjayAvIGRldmljZSBoYW5kbGVycyBvbiB0aGUgc2Vzc2lvbi5cblx0ICogQmFja2VkIGVudGlyZWx5IGJ5IHtAbGluayBCcm93c2VyUGVybWlzc2lvblN0b3JlfTsgdW5yZWNvcmRlZCBjYXRlZ29yaWVzXG5cdCAqIGFyZSBicm9rZXJlZCB0byB0aGUgb3duaW5nIGJyb3dzZXIgdmlldyB2aWEge0BsaW5rIG9uRGlkUmVxdWVzdFBlcm1pc3Npb259LlxuXHQgKi9cblx0Y29uZmlndXJlKGVsZWN0cm9uU2Vzc2lvbjogRWxlY3Ryb24uU2Vzc2lvbik6IHZvaWQge1xuXHRcdGVsZWN0cm9uU2Vzc2lvbi5zZXRQZXJtaXNzaW9uUmVxdWVzdEhhbmRsZXIoKHdlYkNvbnRlbnRzLCBwZXJtaXNzaW9uLCBjYWxsYmFjaywgZGV0YWlscykgPT4ge1xuXHRcdFx0dGhpcy5fcmVzb2x2ZVJlcXVlc3Qod2ViQ29udGVudHMsIHBlcm1pc3Npb24sIGRldGFpbHMpLnRoZW4oY2FsbGJhY2ssICgpID0+IGNhbGxiYWNrKGZhbHNlKSk7XG5cdFx0fSk7XG5cdFx0ZWxlY3Ryb25TZXNzaW9uLnNldFBlcm1pc3Npb25DaGVja0hhbmRsZXIoKF93ZWJDb250ZW50cywgcGVybWlzc2lvbiwgcmVxdWVzdGluZ09yaWdpbiwgZGV0YWlscykgPT4ge1xuXHRcdFx0aWYgKGlzQWx3YXlzQWxsb3dlZFBlcm1pc3Npb24ocGVybWlzc2lvbikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBQcmVmZXIgdGhlIGZ1bGwgcmVxdWVzdGluZyBVUkwgc28gZmlsZTogZG9jdW1lbnRzIGtleSBvZmYgdGhlaXJcblx0XHRcdC8vIHBhdGg7IGByZXF1ZXN0aW5nVXJsYCBpcyBhYnNlbnQgZm9yIGNyb3NzLW9yaWdpbiBzdWJmcmFtZXMsIGluXG5cdFx0XHQvLyB3aGljaCBjYXNlIEVsZWN0cm9uIG9ubHkgZ2l2ZXMgdXMgdGhlIGJhcmUgb3JpZ2luLlxuXHRcdFx0Y29uc3Qgb3JpZ2luID0gdG9PcmlnaW5LZXkoZGV0YWlscy5yZXF1ZXN0aW5nVXJsIHx8IHJlcXVlc3RpbmdPcmlnaW4pO1xuXHRcdFx0Y29uc3QgY2F0ZWdvcmllcyA9IGVsZWN0cm9uUGVybWlzc2lvblRvQ2F0ZWdvcmllcyhwZXJtaXNzaW9uLCBtZWRpYUtpbmRzRnJvbURldGFpbHMoZGV0YWlscykpO1xuXHRcdFx0aWYgKGNhdGVnb3JpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdC8vIFN5bmNocm9ub3VzIGdhdGUgdXNlZCBieSBCbGluayBwcmUtY2hlY2tzIGFuZCBgcGVybWlzc2lvbnMucXVlcnlgLlxuXHRcdFx0Ly8gQ2F0ZWdvcmllcyB3aXRoIG5vIHJlY29yZGVkIGRlY2lzaW9uIGZhbGwgYmFjayB0byB0aGVpclxuXHRcdFx0Ly8gYGRlZmF1bHRTdGF0ZWAgKGUuZy4gTG9jYXRpb24gLyBDYW1lcmEgYXJlIGRlbnktYnktZGVmYXVsdCB1bnRpbFxuXHRcdFx0Ly8gZ3JhbnRlZCwgd2hpbGUgb3RoZXJzIG1heSBhbGxvdyBieSBkZWZhdWx0KS5cblx0XHRcdHJldHVybiBjYXRlZ29yaWVzLmV2ZXJ5KGNhdGVnb3J5ID0+IHRoaXMuX3Blcm1pc3Npb25TdG9yZS5pc0FsbG93ZWQob3JpZ2luLCBjYXRlZ29yeSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gSGFyZHdhcmUtZGV2aWNlIGNob29zZXJzLiBVU0IgLyBTZXJpYWwgLyBISUQgYXJlIGdhdGVkIGJ5IHRoZSBoYW5kbGVyc1xuXHRcdC8vIGFib3ZlIChhIGBEZXZpY2VzYCBkZW55IG1ha2VzIHRoZSBjaGVjayBmYWlsLCBzbyBDaHJvbWl1bSBuZXZlciBmaXJlc1xuXHRcdC8vIHRoZXNlKS4gV2Ugc3RpbGwgcmUtY2hlY2sgaGVyZSwgZHJpdmUgc2VsZWN0aW9uIHRocm91Z2ggdGhlIHVuaWZpZWRcblx0XHQvLyBkZXZpY2UtcmVxdWVzdCBmbG93LCBhbmQgbGlzdGVuIGZvciBob3QtcGx1ZyBhZGQvcmVtb3ZlIGV2ZW50cyBzbyBhblxuXHRcdC8vIG9wZW4gcGlja2VyIHN0YXlzIGluIHN5bmMuIEJsdWV0b290aCBpcyBnYXRlZCBhbmQgZnVubmVsZWQgc2VwYXJhdGVseVxuXHRcdC8vIGZyb20gdGhlIG93bmluZyB2aWV3IChpdCBpcyBhIHBlci13ZWJDb250ZW50cyBldmVudCkuXG5cdFx0ZWxlY3Ryb25TZXNzaW9uLm9uKCdzZWxlY3QtdXNiLWRldmljZScsIChldmVudCwgZGV0YWlscywgY2FsbGJhY2spID0+IHtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9mcmFtZVRhcmdldChkZXRhaWxzLmZyYW1lKTtcblx0XHRcdGlmICghdGFyZ2V0IHx8ICF0aGlzLl9kZXZpY2VBbGxvd2VkKHRhcmdldC5vcmlnaW4pKSB7XG5cdFx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2JlZ2luRGV2aWNlUmVxdWVzdCh7XG5cdFx0XHRcdHdlYkNvbnRlbnRzOiB0YXJnZXQud2ViQ29udGVudHMsXG5cdFx0XHRcdG9yaWdpbjogdGFyZ2V0Lm9yaWdpbixcblx0XHRcdFx0ZGV2aWNlVHlwZTogJ3VzYicsXG5cdFx0XHRcdGRldmljZXM6IGRldGFpbHMuZGV2aWNlTGlzdC5tYXAodXNiQ2FuZGlkYXRlKSxcblx0XHRcdFx0aW52b2tlOiBkZXZpY2VJZCA9PiBkZXZpY2VJZCA9PT0gbnVsbCA/IGNhbGxiYWNrKCkgOiBjYWxsYmFjayhkZXZpY2VJZCksXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRlbGVjdHJvblNlc3Npb24ub24oJ3VzYi1kZXZpY2UtYWRkZWQnLCAoX2V2ZW50LCBkZXZpY2UsIHdlYkNvbnRlbnRzKSA9PiB7XG5cdFx0XHR0aGlzLl9hZGREZXZpY2Uod2ViQ29udGVudHMsICd1c2InLCB1c2JDYW5kaWRhdGUoZGV2aWNlKSk7XG5cdFx0fSk7XG5cdFx0ZWxlY3Ryb25TZXNzaW9uLm9uKCd1c2ItZGV2aWNlLXJlbW92ZWQnLCAoX2V2ZW50LCBkZXZpY2UsIHdlYkNvbnRlbnRzKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW1vdmVEZXZpY2Uod2ViQ29udGVudHMsICd1c2InLCBkZXZpY2UuZGV2aWNlSWQpO1xuXHRcdH0pO1xuXG5cdFx0ZWxlY3Ryb25TZXNzaW9uLm9uKCdzZWxlY3Qtc2VyaWFsLXBvcnQnLCAoZXZlbnQsIHBvcnRMaXN0LCB3ZWJDb250ZW50cywgY2FsbGJhY2spID0+IHtcblx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRjb25zdCBvcmlnaW4gPSB0b09yaWdpbktleSh3ZWJDb250ZW50cy5nZXRVUkwoKSk7XG5cdFx0XHRpZiAoIXRoaXMuX2RldmljZUFsbG93ZWQob3JpZ2luKSkge1xuXHRcdFx0XHRjYWxsYmFjaygnJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2JlZ2luRGV2aWNlUmVxdWVzdCh7XG5cdFx0XHRcdHdlYkNvbnRlbnRzLFxuXHRcdFx0XHRvcmlnaW4sXG5cdFx0XHRcdGRldmljZVR5cGU6ICdzZXJpYWwnLFxuXHRcdFx0XHRkZXZpY2VzOiBwb3J0TGlzdC5tYXAoc2VyaWFsQ2FuZGlkYXRlKSxcblx0XHRcdFx0aW52b2tlOiBkZXZpY2VJZCA9PiBjYWxsYmFjayhkZXZpY2VJZCA/PyAnJyksXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRlbGVjdHJvblNlc3Npb24ub24oJ3NlcmlhbC1wb3J0LWFkZGVkJywgKF9ldmVudCwgcG9ydCwgd2ViQ29udGVudHMpID0+IHtcblx0XHRcdHRoaXMuX2FkZERldmljZSh3ZWJDb250ZW50cywgJ3NlcmlhbCcsIHNlcmlhbENhbmRpZGF0ZShwb3J0KSk7XG5cdFx0fSk7XG5cdFx0ZWxlY3Ryb25TZXNzaW9uLm9uKCdzZXJpYWwtcG9ydC1yZW1vdmVkJywgKF9ldmVudCwgcG9ydCwgd2ViQ29udGVudHMpID0+IHtcblx0XHRcdHRoaXMuX3JlbW92ZURldmljZSh3ZWJDb250ZW50cywgJ3NlcmlhbCcsIHBvcnQucG9ydElkKTtcblx0XHR9KTtcblxuXHRcdGVsZWN0cm9uU2Vzc2lvbi5vbignc2VsZWN0LWhpZC1kZXZpY2UnLCAoZXZlbnQsIGRldGFpbHMsIGNhbGxiYWNrKSA9PiB7XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZnJhbWVUYXJnZXQoZGV0YWlscy5mcmFtZSk7XG5cdFx0XHRpZiAoIXRhcmdldCB8fCAhdGhpcy5fZGV2aWNlQWxsb3dlZCh0YXJnZXQub3JpZ2luKSkge1xuXHRcdFx0XHRjYWxsYmFjayhudWxsKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYmVnaW5EZXZpY2VSZXF1ZXN0KHtcblx0XHRcdFx0d2ViQ29udGVudHM6IHRhcmdldC53ZWJDb250ZW50cyxcblx0XHRcdFx0b3JpZ2luOiB0YXJnZXQub3JpZ2luLFxuXHRcdFx0XHRkZXZpY2VUeXBlOiAnaGlkJyxcblx0XHRcdFx0ZGV2aWNlczogZGV0YWlscy5kZXZpY2VMaXN0Lm1hcChoaWRDYW5kaWRhdGUpLFxuXHRcdFx0XHRpbnZva2U6IGRldmljZUlkID0+IGNhbGxiYWNrKGRldmljZUlkID8/IG51bGwpLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0ZWxlY3Ryb25TZXNzaW9uLm9uKCdoaWQtZGV2aWNlLWFkZGVkJywgKF9ldmVudCwgZGV0YWlscykgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZnJhbWVUYXJnZXQoZGV0YWlscy5mcmFtZSk7XG5cdFx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRcdHRoaXMuX2FkZERldmljZSh0YXJnZXQud2ViQ29udGVudHMsICdoaWQnLCBoaWRDYW5kaWRhdGUoZGV0YWlscy5kZXZpY2UpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRlbGVjdHJvblNlc3Npb24ub24oJ2hpZC1kZXZpY2UtcmVtb3ZlZCcsIChfZXZlbnQsIGRldGFpbHMpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2ZyYW1lVGFyZ2V0KGRldGFpbHMuZnJhbWUpO1xuXHRcdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVEZXZpY2UodGFyZ2V0LndlYkNvbnRlbnRzLCAnaGlkJywgZGV0YWlscy5kZXZpY2UuZGV2aWNlSWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Y29ubmVjdFN0b3JhZ2Uoc3RvcmFnZTogSUFwcGxpY2F0aW9uU3RvcmFnZU1haW5TZXJ2aWNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0b3JhZ2UgfHwgIXRoaXMuc3RvcmFnZUtleXMucGVybWlzc2lvbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RvcmFnZSA9IHN0b3JhZ2U7XG5cdFx0dGhpcy5fbG9hZCgpO1xuXHRcdHRoaXMuX3BlcnNpc3RhYmxlID0gdHJ1ZTtcblx0fVxuXG5cdHNlcmlhbGl6ZSgpOiBJU2VyaWFsaXplZEJyb3dzZXJQZXJtaXNzaW9uc1NuYXBzaG90IHtcblx0XHRyZXR1cm4gdGhpcy5fcGVybWlzc2lvblN0b3JlLnNlcmlhbGl6ZSgpO1xuXHR9XG5cblx0c2V0KG9yaWdpbjogc3RyaW5nLCBncmFudHM6IHJlYWRvbmx5IElQZXJtaXNzaW9uQ2F0ZWdvcnlTdGF0ZVtdKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdG9PcmlnaW5LZXkob3JpZ2luKTtcblx0XHRmb3IgKGNvbnN0IGdyYW50IG9mIGdyYW50cykge1xuXHRcdFx0aWYgKGdyYW50LnN0YXRlID09PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVQZW5kaW5nRm9yQ2F0ZWdvcnkoa2V5LCBncmFudC5jYXRlZ29yeSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29hbGVzY2UgdGhlIHBlci1jYXRlZ29yeSBvbkRpZENoYW5nZSBmbHVzaGVzIGludG8gYSBzaW5nbGUgd3JpdGUgZm9yXG5cdFx0Ly8gdGhlIHdob2xlIGJhdGNoIHNvIHBlcnNpc3RpbmcgZnJvbSB0aGUgbWFuYWdlbWVudCBVSSBpc24ndCBOIHdyaXRlcy5cblx0XHR0aGlzLl9iYXRjaGluZyA9IHRydWU7XG5cdFx0dGhpcy5fYmF0Y2hEaXJ0eSA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9wZXJtaXNzaW9uU3RvcmUuc2V0TWFueShvcmlnaW4sIGdyYW50cyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2JhdGNoaW5nID0gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9iYXRjaERpcnR5ICYmIHRoaXMuX3BlcnNpc3RhYmxlKSB7XG5cdFx0XHR0aGlzLl9mbHVzaE5vdygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVQZW5kaW5nRm9yQ2F0ZWdvcnkob3JpZ2luOiBzdHJpbmcsIGNhdGVnb3J5OiBQZXJtaXNzaW9uQ2F0ZWdvcnkpOiB2b2lkIHtcblx0XHRpZiAoIW9yaWdpbiB8fCB0aGlzLl9wZW5kaW5nLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIFsuLi50aGlzLl9wZW5kaW5nXSkge1xuXHRcdFx0aWYgKHBlbmRpbmcub3JpZ2luID09PSBvcmlnaW4gJiYgcGVuZGluZy5jYXRlZ29yeSA9PT0gY2F0ZWdvcnkpIHtcblx0XHRcdFx0cGVuZGluZy5kZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Blcm1pc3Npb25TdG9yZS5jbGVhcigpO1xuXHR9XG5cblx0Ly8gLS0gRGV2aWNlIGNob29zZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRiZWdpbkJsdWV0b290aFJlcXVlc3Qod2ViQ29udGVudHM6IEVsZWN0cm9uLldlYkNvbnRlbnRzLCBkZXZpY2VzOiBFbGVjdHJvbi5CbHVldG9vdGhEZXZpY2VbXSwgY2FsbGJhY2s6IChkZXZpY2VJZDogc3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3JpZ2luID0gdG9PcmlnaW5LZXkod2ViQ29udGVudHMuZ2V0VVJMKCkpO1xuXHRcdGlmICghdGhpcy5fZGV2aWNlQWxsb3dlZChvcmlnaW4pKSB7XG5cdFx0XHRjYWxsYmFjaygnJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBkZXZpY2VzLm1hcChibHVldG9vdGhDYW5kaWRhdGUpO1xuXHRcdC8vIEVsZWN0cm9uIHJlLWZpcmVzIGBzZWxlY3QtYmx1ZXRvb3RoLWRldmljZWAgZm9yIHRoZSBzYW1lIGNob29zZXIgYXNcblx0XHQvLyBkZXZpY2VzIGFyZSBkaXNjb3ZlcmVkLCBlYWNoIHRpbWUgd2l0aCBhIGZyZXNoIGNhbGxiYWNrLiBGb2xkIHRob3NlXG5cdFx0Ly8gaW50byB0aGUgZXhpc3RpbmcgcmVxdWVzdDogcmVmcmVzaCBpdHMgbGlzdCBhbmQgc3VwZXJzZWRlIHRoZSBjYWxsYmFjay5cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2ZpbmRBY3RpdmVEZXZpY2Uod2ViQ29udGVudHMsICdibHVldG9vdGgnKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGV4aXN0aW5nLmRldmljZXMgPSBjYW5kaWRhdGVzO1xuXHRcdFx0ZXhpc3RpbmcuaW52b2tlID0gZGV2aWNlSWQgPT4gY2FsbGJhY2soZGV2aWNlSWQgPz8gJycpO1xuXHRcdFx0dGhpcy5fZW1pdERldmljZVJlcXVlc3QoZXhpc3RpbmcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9iZWdpbkRldmljZVJlcXVlc3Qoe1xuXHRcdFx0d2ViQ29udGVudHMsXG5cdFx0XHRvcmlnaW4sXG5cdFx0XHRkZXZpY2VUeXBlOiAnYmx1ZXRvb3RoJyxcblx0XHRcdGRldmljZXM6IGNhbmRpZGF0ZXMsXG5cdFx0XHRpbnZva2U6IGRldmljZUlkID0+IGNhbGxiYWNrKGRldmljZUlkID8/ICcnKSxcblx0XHR9KTtcblx0fVxuXG5cdHJlc29sdmVEZXZpY2UocmVxdWVzdElkOiBzdHJpbmcsIGRldmljZUlkOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0RldmljZXMuZ2V0KHJlcXVlc3RJZCk/LnNldHRsZShkZXZpY2VJZCk7XG5cdH1cblxuXHQvKiogQmVnaW4gYSBkZXZpY2UgY2hvb3NlcjogcmVnaXN0ZXIgaXQsIGVtaXQgaXQsIGFuZCBjYW5jZWwgaWYgdW5jbGFpbWVkLiAqL1xuXHRwcml2YXRlIF9iZWdpbkRldmljZVJlcXVlc3QocGFyYW1zOiB7XG5cdFx0cmVhZG9ubHkgd2ViQ29udGVudHM6IEVsZWN0cm9uLldlYkNvbnRlbnRzO1xuXHRcdHJlYWRvbmx5IG9yaWdpbjogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGRldmljZVR5cGU6IEJyb3dzZXJEZXZpY2VUeXBlO1xuXHRcdHJlYWRvbmx5IGRldmljZXM6IElCcm93c2VyRGV2aWNlQ2FuZGlkYXRlW107XG5cdFx0cmVhZG9ubHkgaW52b2tlOiAoZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpID0+IHZvaWQ7XG5cdH0pOiB2b2lkIHtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBzZXR0bGUgPSAoZGV2aWNlSWQ6IHN0cmluZyB8IG51bGwpID0+IHtcblx0XHRcdGlmIChwZW5kaW5nLnNldHRsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cGVuZGluZy5zZXR0bGVkID0gdHJ1ZTtcblx0XHRcdHBhcmFtcy53ZWJDb250ZW50cy5vZmYoJ2Rlc3Ryb3llZCcsIGNhbmNlbCk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nRGV2aWNlcy5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdHBlbmRpbmcuaW52b2tlKGRldmljZUlkKTtcblx0XHR9O1xuXHRcdGNvbnN0IGNhbmNlbCA9ICgpID0+IHNldHRsZShudWxsKTtcblx0XHRjb25zdCBwZW5kaW5nOiBJUGVuZGluZ0RldmljZVJlcXVlc3QgPSB7XG5cdFx0XHRyZXF1ZXN0SWQsXG5cdFx0XHR3ZWJDb250ZW50czogcGFyYW1zLndlYkNvbnRlbnRzLFxuXHRcdFx0b3JpZ2luOiBwYXJhbXMub3JpZ2luLFxuXHRcdFx0ZGV2aWNlVHlwZTogcGFyYW1zLmRldmljZVR5cGUsXG5cdFx0XHRkZXZpY2VzOiBwYXJhbXMuZGV2aWNlcyxcblx0XHRcdHNldHRsZWQ6IGZhbHNlLFxuXHRcdFx0aW52b2tlOiBwYXJhbXMuaW52b2tlLFxuXHRcdFx0c2V0dGxlLFxuXHRcdH07XG5cdFx0cGFyYW1zLndlYkNvbnRlbnRzLm9uKCdkZXN0cm95ZWQnLCBjYW5jZWwpO1xuXHRcdHRoaXMuX3BlbmRpbmdEZXZpY2VzLnNldChyZXF1ZXN0SWQsIHBlbmRpbmcpO1xuXHRcdGlmICghdGhpcy5fZW1pdERldmljZVJlcXVlc3QocGVuZGluZykpIHtcblx0XHRcdC8vIE5vIHZpZXcgY2xhaW1lZCBpdCAoZS5nLiBiYWNrZ3JvdW5kIG9yIGRlc3Ryb3llZCB2aWV3KTogY2FuY2VsIHNvXG5cdFx0XHQvLyB0aGUgcGFnZSdzIHJlcXVlc3REZXZpY2UoKSBwcm9taXNlIHJlamVjdHMgcmF0aGVyIHRoYW4gaGFuZ3MuXG5cdFx0XHRjYW5jZWwoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbWl0RGV2aWNlUmVxdWVzdChwZW5kaW5nOiBJUGVuZGluZ0RldmljZVJlcXVlc3QpOiBib29sZWFuIHtcblx0XHRsZXQgY2xhaW1lZCA9IGZhbHNlO1xuXHRcdHRoaXMuX29uRGlkUmVxdWVzdERldmljZS5maXJlKHtcblx0XHRcdHdlYkNvbnRlbnRzOiBwZW5kaW5nLndlYkNvbnRlbnRzLFxuXHRcdFx0b3JpZ2luOiBwZW5kaW5nLm9yaWdpbixcblx0XHRcdHJlcXVlc3RJZDogcGVuZGluZy5yZXF1ZXN0SWQsXG5cdFx0XHRkZXZpY2VUeXBlOiBwZW5kaW5nLmRldmljZVR5cGUsXG5cdFx0XHRkZXZpY2VzOiBwZW5kaW5nLmRldmljZXMsXG5cdFx0XHRjbGFpbTogKCkgPT4geyBjbGFpbWVkID0gdHJ1ZTsgfSxcblx0XHR9KTtcblx0XHRyZXR1cm4gY2xhaW1lZDtcblx0fVxuXG5cdHByaXZhdGUgX2FkZERldmljZSh3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHMsIGRldmljZVR5cGU6IEJyb3dzZXJEZXZpY2VUeXBlLCBjYW5kaWRhdGU6IElCcm93c2VyRGV2aWNlQ2FuZGlkYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX2ZpbmRBY3RpdmVEZXZpY2Uod2ViQ29udGVudHMsIGRldmljZVR5cGUpO1xuXHRcdGlmICghcGVuZGluZyB8fCBwZW5kaW5nLmRldmljZXMuc29tZShkZXZpY2UgPT4gZGV2aWNlLmRldmljZUlkID09PSBjYW5kaWRhdGUuZGV2aWNlSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHBlbmRpbmcuZGV2aWNlcyA9IFsuLi5wZW5kaW5nLmRldmljZXMsIGNhbmRpZGF0ZV07XG5cdFx0dGhpcy5fZW1pdERldmljZVJlcXVlc3QocGVuZGluZyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVEZXZpY2Uod2ViQ29udGVudHM6IEVsZWN0cm9uLldlYkNvbnRlbnRzLCBkZXZpY2VUeXBlOiBCcm93c2VyRGV2aWNlVHlwZSwgZGV2aWNlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9maW5kQWN0aXZlRGV2aWNlKHdlYkNvbnRlbnRzLCBkZXZpY2VUeXBlKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dCA9IHBlbmRpbmcuZGV2aWNlcy5maWx0ZXIoZGV2aWNlID0+IGRldmljZS5kZXZpY2VJZCAhPT0gZGV2aWNlSWQpO1xuXHRcdGlmIChuZXh0Lmxlbmd0aCA9PT0gcGVuZGluZy5kZXZpY2VzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRwZW5kaW5nLmRldmljZXMgPSBuZXh0O1xuXHRcdHRoaXMuX2VtaXREZXZpY2VSZXF1ZXN0KHBlbmRpbmcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEFjdGl2ZURldmljZSh3ZWJDb250ZW50czogRWxlY3Ryb24uV2ViQ29udGVudHMsIGRldmljZVR5cGU6IEJyb3dzZXJEZXZpY2VUeXBlKTogSVBlbmRpbmdEZXZpY2VSZXF1ZXN0IHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2YgdGhpcy5fcGVuZGluZ0RldmljZXMudmFsdWVzKCkpIHtcblx0XHRcdGlmICghcGVuZGluZy5zZXR0bGVkICYmIHBlbmRpbmcud2ViQ29udGVudHMgPT09IHdlYkNvbnRlbnRzICYmIHBlbmRpbmcuZGV2aWNlVHlwZSA9PT0gZGV2aWNlVHlwZSkge1xuXHRcdFx0XHRyZXR1cm4gcGVuZGluZztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBSZXNvbHZlIHRoZSBvd25pbmcgd2ViIGNvbnRlbnRzIGFuZCBvcmlnaW4gZm9yIGEgcmVxdWVzdGluZyBmcmFtZS4gKi9cblx0cHJpdmF0ZSBfZnJhbWVUYXJnZXQoZnJhbWU6IEVsZWN0cm9uLldlYkZyYW1lTWFpbiB8IG51bGwpOiB7IHdlYkNvbnRlbnRzOiBFbGVjdHJvbi5XZWJDb250ZW50czsgb3JpZ2luOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFmcmFtZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgd2ViQ29udGVudHMgPSBlbGVjdHJvbldlYkNvbnRlbnRzLmZyb21GcmFtZShmcmFtZSk7XG5cdFx0aWYgKCF3ZWJDb250ZW50cykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgd2ViQ29udGVudHMsIG9yaWdpbjogdG9PcmlnaW5LZXkoZnJhbWUudXJsIHx8IHdlYkNvbnRlbnRzLmdldFVSTCgpKSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZGV2aWNlQWxsb3dlZChvcmlnaW46IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW9yaWdpbiAmJiB0aGlzLl9wZXJtaXNzaW9uU3RvcmUuaXNBbGxvd2VkKG9yaWdpbiwgUGVybWlzc2lvbkNhdGVnb3J5LkRldmljZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVJlcXVlc3Qod2ViQ29udGVudHM6IEVsZWN0cm9uLldlYkNvbnRlbnRzIHwgbnVsbCwgcGVybWlzc2lvbjogc3RyaW5nLCBkZXRhaWxzOiBQZXJtaXNzaW9uUmVxdWVzdERldGFpbHMgfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoaXNBbHdheXNBbGxvd2VkUGVybWlzc2lvbihwZXJtaXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IG9yaWdpbiA9IHRvT3JpZ2luS2V5KGRldGFpbHM/LnJlcXVlc3RpbmdVcmwgPz8gd2ViQ29udGVudHM/LmdldFVSTCgpKTtcblx0XHRjb25zdCBjYXRlZ29yaWVzID0gZWxlY3Ryb25QZXJtaXNzaW9uVG9DYXRlZ29yaWVzKHBlcm1pc3Npb24sIG1lZGlhS2luZHNGcm9tRGV0YWlscyhkZXRhaWxzKSk7XG5cdFx0aWYgKGNhdGVnb3JpZXMubGVuZ3RoID09PSAwIHx8ICFvcmlnaW4pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBGYXN0IHBhdGhzIHRoYXQgbmVlZCBubyBwcm9tcHQuIEEgY2F0ZWdvcnkgd2hvc2UgZWZmZWN0aXZlIGRlY2lzaW9uIGlzXG5cdFx0Ly8gYWxyZWFkeSAnYWxsb3cnIC0tIGVpdGhlciBhbiBleHBsaWNpdCB1c2VyIGdyYW50IG9yIGFuIGFsbG93LWJ5LWRlZmF1bHRcblx0XHQvLyBjYXRlZ29yeSAtLSBpcyBncmFudGVkIHNpbGVudGx5LiBUaGlzIGtlZXBzIHRoZSBhc3luYyByZXF1ZXN0IGhhbmRsZXJcblx0XHQvLyBjb25zaXN0ZW50IHdpdGggdGhlIHN5bmNocm9ub3VzIGNoZWNrIGhhbmRsZXIgKGJvdGggdXNlIGBpc0FsbG93ZWRgKS5cblx0XHQvLyBBbiBleHBsaWNpdCAnZGVueScgc2hvcnQtY2lyY3VpdHMgd2l0aG91dCBwcm9tcHRpbmcuXG5cdFx0aWYgKGNhdGVnb3JpZXMuZXZlcnkoY2F0ZWdvcnkgPT4gdGhpcy5fcGVybWlzc2lvblN0b3JlLmlzQWxsb3dlZChvcmlnaW4sIGNhdGVnb3J5KSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoY2F0ZWdvcmllcy5zb21lKGNhdGVnb3J5ID0+IHRoaXMuX3Blcm1pc3Npb25TdG9yZS5nZXREZWNpc2lvbihvcmlnaW4sIGNhdGVnb3J5KSA9PT0gJ2RlbnknKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEF0IGxlYXN0IG9uZSBjYXRlZ29yeSBpcyB1bmRlY2lkZWQ6IHByb21wdCBmb3IgZWFjaCB1bmRlY2lkZWQgb25lLiBEb1xuXHRcdC8vIHRoaXMgc2VxdWVudGlhbGx5IHNvIHdlIG5ldmVyIHN1cmZhY2UgdHdvIG1vZGFsIHByb21wdHMgYXQgb25jZSAoZS5nLlxuXHRcdC8vIGEgc2luZ2xlIGBtZWRpYWAgcmVxdWVzdCBtYXBzIHRvIGJvdGggQ2FtZXJhIGFuZCBNaWNyb3Bob25lKS5cblx0XHRmb3IgKGNvbnN0IGNhdGVnb3J5IG9mIGNhdGVnb3JpZXMpIHtcblx0XHRcdGlmICghdGhpcy5fcGVybWlzc2lvblN0b3JlLmdldERlY2lzaW9uKG9yaWdpbiwgY2F0ZWdvcnkpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Byb21wdCh3ZWJDb250ZW50cywgb3JpZ2luLCBjYXRlZ29yeSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhdGVnb3JpZXMuZXZlcnkoY2F0ZWdvcnkgPT4gdGhpcy5fcGVybWlzc2lvblN0b3JlLmlzQWxsb3dlZChvcmlnaW4sIGNhdGVnb3J5KSk7XG5cdH1cblxuXHRwcml2YXRlIF9wcm9tcHQod2ViQ29udGVudHM6IEVsZWN0cm9uLldlYkNvbnRlbnRzIHwgbnVsbCwgb3JpZ2luOiBzdHJpbmcsIGNhdGVnb3J5OiBQZXJtaXNzaW9uQ2F0ZWdvcnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXdlYkNvbnRlbnRzKSB7XG5cdFx0XHQvLyBObyB2aWV3IHRvIGFzayAtLSBsZWF2ZSB1bmRlY2lkZWQgKGVmZmVjdGl2ZSBkZW55IGJ5IGRlZmF1bHQgc3RhdGUpLlxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHQvLyBGaXJlIHN5bmNocm9ub3VzbHk6IHRoZSBvd25pbmcgdmlldyBjbGFpbXMgdGhlIHJlcXVlc3QgYmVmb3JlIGZpcmUoKVxuXHRcdC8vIHJldHVybnMsIHNvIHdlIGtub3cgd2hldGhlciBhbnkgVUkgd2lsbCBzdXJmYWNlIGEgcHJvbXB0LlxuXHRcdGxldCBjbGFpbWVkID0gZmFsc2U7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0UGVybWlzc2lvbi5maXJlKHtcblx0XHRcdHdlYkNvbnRlbnRzLFxuXHRcdFx0cmVxdWVzdDogeyBvcmlnaW4sIGNhdGVnb3J5IH0sXG5cdFx0XHRjbGFpbTogKCkgPT4geyBjbGFpbWVkID0gdHJ1ZTsgfSxcblx0XHR9KTtcblx0XHRpZiAoIWNsYWltZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwZW5kaW5nOiBJUGVuZGluZ1JlcXVlc3QgPSB7IG9yaWdpbiwgY2F0ZWdvcnksIGRlZmVycmVkOiBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCkgfTtcblx0XHR0aGlzLl9wZW5kaW5nLmFkZChwZW5kaW5nKTtcblxuXHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiBwZW5kaW5nLmRlZmVycmVkLmNvbXBsZXRlKCksIFBST01QVF9USU1FT1VUX01TKTtcblx0XHRyZXR1cm4gcGVuZGluZy5kZWZlcnJlZC5wLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdHRoaXMuX3BlbmRpbmcuZGVsZXRlKHBlbmRpbmcpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFJlc29sdmUgYW55IHBlbmRpbmcgcmVxdWVzdCB3aG9zZSAob3JpZ2luLCBjYXRlZ29yeSkgbm93IGhhcyBhIGRlY2lzaW9uLiAqL1xuXHRwcml2YXRlIF9yZXNvbHZlUGVuZGluZygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiBbLi4udGhpcy5fcGVuZGluZ10pIHtcblx0XHRcdGlmICh0aGlzLl9wZXJtaXNzaW9uU3RvcmUuZ2V0RGVjaXNpb24ocGVuZGluZy5vcmlnaW4sIHBlbmRpbmcuY2F0ZWdvcnkpKSB7XG5cdFx0XHRcdHBlbmRpbmcuZGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkKCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0aGlzLl9zdG9yYWdlO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuc3RvcmFnZUtleXMucGVybWlzc2lvbnM7XG5cdFx0aWYgKCFzdG9yYWdlIHx8ICFrZXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBwYXJzZVNuYXBzaG90PElTZXJpYWxpemVkQnJvd3NlclBlcm1pc3Npb25zU25hcHNob3Q+KHN0b3JhZ2UuZ2V0KGtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSk7XG5cdFx0Ly8gSHlkcmF0aW9uIGZpcmVzIG9uRGlkQ2hhbmdlOyBzdXBwcmVzcyBmbHVzaGVzIHNvIHdlIGRvbid0IHJld3JpdGUgd2hhdCB3ZSBqdXN0IHJlYWQuXG5cdFx0dGhpcy5fcGVyc2lzdGFibGUgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fcGVybWlzc2lvblN0b3JlLmh5ZHJhdGUoc25hcHNob3QpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wZXJzaXN0YWJsZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmx1c2hOb3coKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRoaXMuX3N0b3JhZ2U7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5zdG9yYWdlS2V5cy5wZXJtaXNzaW9ucztcblx0XHRpZiAoIXN0b3JhZ2UgfHwgIWtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzbmFwc2hvdCA9IHRoaXMuX3Blcm1pc3Npb25TdG9yZS5zZXJpYWxpemUoKTtcblx0XHRpZiAoT2JqZWN0LmtleXMoc25hcHNob3Qub3JpZ2lucykubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRzdG9yYWdlLnJlbW92ZShrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0b3JhZ2Uuc3RvcmUoa2V5LCBKU09OLnN0cmluZ2lmeShzbmFwc2hvdCksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gcGFyc2VTbmFwc2hvdDxUPihyYXc6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFQgfCB1bmRlZmluZWQge1xuXHRpZiAoIXJhdykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgVDtcblx0XHRpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcnNlZDtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFRoZSBFbGVjdHJvbiBkZXRhaWxzIHVuaW9uIHBhc3NlZCB0byBgc2V0UGVybWlzc2lvblJlcXVlc3RIYW5kbGVyYC4gQWxsXG4gKiB2YXJpYW50cyBleHRlbmQgYFBlcm1pc3Npb25SZXF1ZXN0YCAoc28gc2hhcmUgYHJlcXVlc3RpbmdVcmxgKTsgb25seVxuICogYE1lZGlhQWNjZXNzUGVybWlzc2lvblJlcXVlc3RgIGFkZHMgYG1lZGlhVHlwZXNgLlxuICovXG50eXBlIFBlcm1pc3Npb25SZXF1ZXN0RGV0YWlscyA9XG5cdHwgRWxlY3Ryb24uUGVybWlzc2lvblJlcXVlc3Rcblx0fCBFbGVjdHJvbi5GaWxlc3lzdGVtUGVybWlzc2lvblJlcXVlc3Rcblx0fCBFbGVjdHJvbi5NZWRpYUFjY2Vzc1Blcm1pc3Npb25SZXF1ZXN0XG5cdHwgRWxlY3Ryb24uT3BlbkV4dGVybmFsUGVybWlzc2lvblJlcXVlc3Q7XG5cbi8qKlxuICogTm9ybWFsaXplIHRoZSBtZWRpYSBoaW50IGZyb20gZWl0aGVyIHBlcm1pc3Npb24gaGFuZGxlcidzIEVsZWN0cm9uIGRldGFpbHNcbiAqIGludG8gYSBgKCd2aWRlbycgfCAnYXVkaW8nKVtdYC4gVGhlIHJlcXVlc3QgaGFuZGxlciBzdXBwbGllcyBgbWVkaWFUeXBlc2BcbiAqIChhbiBhcnJheSk7IHRoZSBjaGVjayBoYW5kbGVyIHN1cHBsaWVzIGEgc2luZ2xlIGBtZWRpYVR5cGVgLiBSZXR1cm5zXG4gKiBgdW5kZWZpbmVkYCB3aGVuIHRoZXJlIGlzIG5vIHVzYWJsZSBoaW50LCBzbyB0aGUgbWFwcGVyIGNhbiBhc3N1bWUgYm90aC5cbiAqL1xuZnVuY3Rpb24gbWVkaWFLaW5kc0Zyb21EZXRhaWxzKGRldGFpbHM6IFBlcm1pc3Npb25SZXF1ZXN0RGV0YWlscyB8IEVsZWN0cm9uLlBlcm1pc3Npb25DaGVja0hhbmRsZXJIYW5kbGVyRGV0YWlscyB8IHVuZGVmaW5lZCk6ICgndmlkZW8nIHwgJ2F1ZGlvJylbXSB8IHVuZGVmaW5lZCB7XG5cdGlmICghZGV0YWlscykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qga2luZHMgPSBuZXcgU2V0PCd2aWRlbycgfCAnYXVkaW8nPigpO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1pbi1vcGVyYXRvclxuXHRpZiAoJ21lZGlhVHlwZXMnIGluIGRldGFpbHMgJiYgZGV0YWlscy5tZWRpYVR5cGVzKSB7XG5cdFx0Zm9yIChjb25zdCBraW5kIG9mIGRldGFpbHMubWVkaWFUeXBlcykge1xuXHRcdFx0a2luZHMuYWRkKGtpbmQpO1xuXHRcdH1cblx0fVxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1pbi1vcGVyYXRvclxuXHRpZiAoJ21lZGlhVHlwZScgaW4gZGV0YWlscyAmJiAoZGV0YWlscy5tZWRpYVR5cGUgPT09ICd2aWRlbycgfHwgZGV0YWlscy5tZWRpYVR5cGUgPT09ICdhdWRpbycpKSB7XG5cdFx0a2luZHMuYWRkKGRldGFpbHMubWVkaWFUeXBlKTtcblx0fVxuXHRyZXR1cm4ga2luZHMuc2l6ZSA/IFsuLi5raW5kc10gOiB1bmRlZmluZWQ7XG59XG5cbi8qKiBGb3JtYXQgYSBVU0IvSElEIHZlbmRvcjpwcm9kdWN0IHBhaXIgYXMgYSBgdnZ2djpwcHBwYCBoZXggc3RyaW5nLiAqL1xuZnVuY3Rpb24gdmVuZG9yUHJvZHVjdEhleCh2ZW5kb3JJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBwcm9kdWN0SWQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGNvbnN0IGhleCA9ICh2YWx1ZTogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiAodmFsdWUgPz8gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDQsICcwJyk7XG5cdHJldHVybiBgJHtoZXgodmVuZG9ySWQpfToke2hleChwcm9kdWN0SWQpfWA7XG59XG5cbmZ1bmN0aW9uIHVzYkNhbmRpZGF0ZShkZXZpY2U6IEVsZWN0cm9uLlVTQkRldmljZSk6IElCcm93c2VyRGV2aWNlQ2FuZGlkYXRlIHtcblx0Y29uc3QgaWRzID0gdmVuZG9yUHJvZHVjdEhleChkZXZpY2UudmVuZG9ySWQsIGRldmljZS5wcm9kdWN0SWQpO1xuXHRyZXR1cm4ge1xuXHRcdGRldmljZUlkOiBkZXZpY2UuZGV2aWNlSWQsXG5cdFx0bGFiZWw6IGRldmljZS5wcm9kdWN0TmFtZSB8fCBkZXZpY2UubWFudWZhY3R1cmVyTmFtZSB8fCBsb2NhbGl6ZSgnYnJvd3Nlci5kZXZpY2UudXNiJywgXCJVU0IgRGV2aWNlIHswfVwiLCBpZHMpLFxuXHRcdGRldGFpbDogZGV2aWNlLnNlcmlhbE51bWJlciA/IGAke2lkc30gXHUwMEI3ICR7ZGV2aWNlLnNlcmlhbE51bWJlcn1gIDogaWRzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzZXJpYWxDYW5kaWRhdGUocG9ydDogRWxlY3Ryb24uU2VyaWFsUG9ydCk6IElCcm93c2VyRGV2aWNlQ2FuZGlkYXRlIHtcblx0Y29uc3QgaWRzID0gcG9ydC52ZW5kb3JJZCAmJiBwb3J0LnByb2R1Y3RJZCA/IGAke3BvcnQudmVuZG9ySWR9OiR7cG9ydC5wcm9kdWN0SWR9YCA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIHtcblx0XHRkZXZpY2VJZDogcG9ydC5wb3J0SWQsXG5cdFx0bGFiZWw6IGAke3BvcnQucG9ydE5hbWV9ICgke3BvcnQuZGlzcGxheU5hbWV9KWAsXG5cdFx0ZGV0YWlsOiBpZHMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGhpZENhbmRpZGF0ZShkZXZpY2U6IEVsZWN0cm9uLkhJRERldmljZSk6IElCcm93c2VyRGV2aWNlQ2FuZGlkYXRlIHtcblx0Y29uc3QgaWRzID0gdmVuZG9yUHJvZHVjdEhleChkZXZpY2UudmVuZG9ySWQsIGRldmljZS5wcm9kdWN0SWQpO1xuXHRyZXR1cm4ge1xuXHRcdGRldmljZUlkOiBkZXZpY2UuZGV2aWNlSWQsXG5cdFx0bGFiZWw6IGRldmljZS5uYW1lIHx8IGxvY2FsaXplKCdicm93c2VyLmRldmljZS5oaWQnLCBcIkhJRCBEZXZpY2UgezB9XCIsIGlkcyksXG5cdFx0ZGV0YWlsOiBkZXZpY2Uuc2VyaWFsTnVtYmVyID8gYCR7aWRzfSBcdTAwQjcgJHtkZXZpY2Uuc2VyaWFsTnVtYmVyfWAgOiBpZHMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGJsdWV0b290aENhbmRpZGF0ZShkZXZpY2U6IEVsZWN0cm9uLkJsdWV0b290aERldmljZSk6IElCcm93c2VyRGV2aWNlQ2FuZGlkYXRlIHtcblx0cmV0dXJuIHtcblx0XHRkZXZpY2VJZDogZGV2aWNlLmRldmljZUlkLFxuXHRcdGxhYmVsOiBkZXZpY2UuZGV2aWNlTmFtZSB8fCBkZXZpY2UuZGV2aWNlSWQsXG5cdFx0ZGV0YWlsOiBkZXZpY2UuZGV2aWNlSWQsXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlLDJCQUEyQjtBQUNuRCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGNBQWMscUJBQXFCO0FBQzVDO0FBQUEsRUFFQztBQUFBLEVBSUE7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBQ1AsU0FBUywrQkFBNEY7QUFJckcsTUFBTSxvQkFBb0I7QUE0Rm5CLE1BQU0sa0NBQWtDLFdBQWlEO0FBQUEsRUF5Qi9GLFlBQVksU0FBeUI7QUFDcEMsVUFBTTtBQXhCUCxTQUFpQixtQkFBbUIsS0FBSyxVQUFVLElBQUksdUJBQXVCLENBQUM7QUFHL0U7QUFBQSxTQUFTLGNBQTJCLEtBQUssaUJBQWlCO0FBRzFELFNBQVEsZUFBZTtBQUd2QjtBQUFBLFNBQVEsWUFBWTtBQUNwQixTQUFRLGNBQWM7QUFFdEIsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLFFBQTBDLENBQUM7QUFDekcsU0FBUyx5QkFBeUIsS0FBSyx3QkFBd0I7QUFFL0QsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXNDLENBQUM7QUFDakcsU0FBUyxxQkFBcUIsS0FBSyxvQkFBb0I7QUFFdkQsU0FBaUIsV0FB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
