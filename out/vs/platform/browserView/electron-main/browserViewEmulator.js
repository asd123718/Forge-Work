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
import { Disposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { ILogService } from "../../log/common/log.js";
let BrowserViewEmulator = class extends Disposable {
  constructor(browser, logService) {
    super();
    this.browser = browser;
    this.logService = logService;
    this._lastLayout = { containerWidth: 1024, containerHeight: 768, scale: 1, hostZoom: 1 };
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._defaultUserAgent = this.browser.webContents.getUserAgent();
    const onNavigate = () => {
      this._lastApplied = void 0;
      void this._reapply();
    };
    this.browser.webContents.on("did-navigate", onNavigate);
    this._register(this.browser.debugger.registerCommandInterceptor((method, params, session) => this._intercept(method, params, session)));
  }
  get device() {
    return this._device;
  }
  get emulatedScaleFactor() {
    if (!this._lastLayout) {
      return 1;
    }
    return this._lastLayout.scale * this._lastLayout.hostZoom;
  }
  async setDevice(device) {
    const prev = this._device;
    this._device = device;
    const nextUA = device?.userAgent;
    if (prev?.userAgent !== nextUA) {
      this.browser.webContents.setUserAgent(nextUA ?? this._defaultUserAgent);
    }
    if (prev && !device && this.isSafeToApplyEmulation()) {
      this.browser.webContents.disableDeviceEmulation();
      void this._applyTouchAndMedia();
    }
    this._lastApplied = void 0;
    if (device && this.isSafeToApplyEmulation()) {
      this._reapply();
    }
    this._onDidChange.fire(device);
  }
  /**
   * Update the cached layout (container size + scale + host zoom) and reapply
   * emulation. The emulated viewport is derived from the current device's
   * width / height; when those are undefined the viewport auto-fits to the
   * container at the given scale. `hostZoom` is the host window's
   * CSS-to-screen zoom factor — bounds in main are multiplied by it, so the
   * emulation scale must be too or the emulated viewport won't fill the
   * WebContentsView when the workbench is zoomed.
   */
  applyScreenEmulation(containerWidth, containerHeight, scale, hostZoom) {
    this._lastLayout = { containerWidth, containerHeight, scale, hostZoom };
    this._reapply();
  }
  _reapply() {
    if (!this._device || !this.isSafeToApplyEmulation()) {
      return;
    }
    const { containerWidth, containerHeight, scale, hostZoom } = this._lastLayout;
    const s = Math.max(0.01, scale);
    const z = Math.max(0.01, hostZoom);
    const w = Math.max(1, Math.round(this._device.width || containerWidth / s));
    const h = Math.max(1, Math.round(this._device.height || containerHeight / s));
    const mobile = !!this._device.mobile;
    const last = this._lastApplied;
    if (last && last.viewportWidth === w && last.viewportHeight === h && Math.abs(last.scale - s) < 1e-4 && Math.abs(last.hostZoom - z) < 1e-4 && last.mobile === mobile) {
      return;
    }
    this._lastApplied = { viewportWidth: w, viewportHeight: h, scale: s, hostZoom: z, mobile };
    const params = {
      screenPosition: mobile ? "mobile" : "desktop",
      screenSize: { width: w, height: h },
      viewSize: { width: w, height: h },
      deviceScaleFactor: this._device.deviceScaleFactor ?? 0,
      viewPosition: { x: 0, y: 0 },
      scale: s * z
    };
    if (mobile && !last) {
      this.browser.webContents.enableDeviceEmulation({
        ...params,
        screenPosition: "desktop"
      });
    }
    this.browser.webContents.enableDeviceEmulation(params);
    if (mobile !== last?.mobile) {
      void this._applyTouchAndMedia();
    }
  }
  isSafeToApplyEmulation() {
    return !this.browser.webContents.isDestroyed() && !!this.browser.webContents.getURL();
  }
  async _applyTouchAndMedia() {
    if (!this.isSafeToApplyEmulation()) {
      return;
    }
    const device = this._device;
    const mobile = !!this._device?.mobile;
    try {
      await this.browser.debugger.sendCommandRaw("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 1 });
      if (this.device !== device) {
        return;
      }
      await this.browser.debugger.sendCommandRaw("Emulation.setEmulatedMedia", { features: this._device ? [{ name: "pointer", value: mobile ? "coarse" : "fine" }] : [] });
      if (this.device !== device) {
        return;
      }
      await this.browser.debugger.sendCommandRaw("Emulation.setEmitTouchEventsForMouse", { enabled: mobile });
    } catch (err) {
      this.logService.error("[BrowserViewEmulator] _applyTouchAndMedia failed", err);
    }
  }
  /**
   * Intercept incoming CDP emulation commands and fold the ones that map onto
   * {@link IBrowserDeviceProfile} into the device. Anything we don't model
   * (geolocation, timezone, CPU throttling, locale, vision deficiency, …)
   * falls through to raw CDP. Only the root session is intercepted — worker
   * and iframe sub-sessions get pass-through behavior.
   */
  _intercept(method, params, session) {
    if (session && session.targetId !== this.browser.debugger.targetId) {
      return void 0;
    }
    switch (method) {
      case "Emulation.setDeviceMetricsOverride": {
        const p = params ?? {};
        const next = {
          ...this._device,
          // CDP uses 0 to disable the corresponding override.
          width: p.width || void 0,
          height: p.height || void 0,
          mobile: p.mobile ?? this._device?.mobile,
          deviceScaleFactor: p.deviceScaleFactor ?? this._device?.deviceScaleFactor
        };
        return this.setDevice(next).then(() => ({}));
      }
      case "Emulation.clearDeviceMetricsOverride": {
        if (!this._device) {
          return Promise.resolve({});
        }
        const { width, height, mobile, deviceScaleFactor, ...rest } = this._device;
        const hasRest = Object.values(rest).some((v) => v !== void 0);
        return this.setDevice(hasRest ? rest : void 0).then(() => ({}));
      }
      case "Emulation.setUserAgentOverride": {
        const p = params ?? {};
        if (p.acceptLanguage !== void 0 || p.platform !== void 0 || p.userAgentMetadata !== void 0) {
          return void 0;
        }
        const ua = p.userAgent || void 0;
        return this.setDevice({ ...this._device, userAgent: ua }).then(() => ({}));
      }
      case "Input.dispatchMouseEvent":
      case "Input.dispatchDragEvent":
      case "Input.synthesizeScrollGesture":
      case "Input.synthesizePinchGesture":
      case "Input.synthesizeTapGesture":
      case "Input.dispatchTouchEvent":
        this._scaleInputCoordinates(params);
        return void 0;
      // let the event pass through with the modified parameters
      default:
        return void 0;
    }
  }
  /**
   * Scale any coordinate-bearing fields on a CDP `Input.*` params object in
   * place so screen-space coordinates map onto the emulated viewport. Handles
   * point coordinates (`x` / `y`), mouse wheel deltas (`deltaX` / `deltaY`),
   * scroll distances (`xDistance` / `yDistance`) and touch points.
   */
  _scaleInputCoordinates(params) {
    const scale = this.emulatedScaleFactor;
    const p = params ?? {};
    if (p.x) {
      p.x *= scale;
    }
    if (p.y) {
      p.y *= scale;
    }
    if (p.deltaX) {
      p.deltaX *= scale;
    }
    if (p.deltaY) {
      p.deltaY *= scale;
    }
    if (p.xDistance) {
      p.xDistance *= scale;
    }
    if (p.yDistance) {
      p.yDistance *= scale;
    }
    if (Array.isArray(p.touchPoints)) {
      p.touchPoints = p.touchPoints.map((t) => ({
        ...t,
        x: t.x * scale,
        y: t.y * scale
      }));
    }
  }
};
BrowserViewEmulator = __decorateClass([
  __decorateParam(1, ILogService)
], BrowserViewEmulator);
export {
  BrowserViewEmulator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYnJvd3NlclZpZXdcXGVsZWN0cm9uLW1haW5cXGJyb3dzZXJWaWV3RW11bGF0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJEZXZpY2VQcm9maWxlIH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBCcm93c2VyVmlldyB9IGZyb20gJy4vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSUNEUENvbm5lY3Rpb24gfSBmcm9tICcuLi9jb21tb24vY2RwL3R5cGVzLmpzJztcblxuLyoqXG4gKiBNYW5hZ2VzIGRldmljZSBlbXVsYXRpb24gZm9yIGEgYnJvd3NlciB2aWV3LiBUaGUgcmVuZGVyZXIgaXMgYXV0aG9yaXRhdGl2ZVxuICogZm9yIHRoZSBvbi1zY3JlZW4gY29udGFpbmVyIHNpemUgYW5kIHNjYWxlOyB0aGlzIGNsYXNzIGRlcml2ZXMgdGhlIGVtdWxhdGVkXG4gKiB2aWV3cG9ydCBmcm9tIHRoZSBjdXJyZW50IGRldmljZSBwcm9maWxlIChmYWxsaW5nIGJhY2sgdG8gY29udGFpbmVyIHNpemUgL1xuICogc2NhbGUgd2hlbiB3aWR0aC9oZWlnaHQgYXJlIHVuc2V0KSBhbmQgZm9yd2FyZHMgdmFsdWVzIHRvXG4gKiBgd2ViQ29udGVudHMuZW5hYmxlRGV2aWNlRW11bGF0aW9uYC4gSXQgYWxzbyBtYW5hZ2VzIHRoZSB0b3VjaCAvIG1lZGlhIC9cbiAqIHVzZXItYWdlbnQgb3ZlcnJpZGVzIHRoYXQgaGF2ZSBubyBuYXRpdmUgRWxlY3Ryb24gZXF1aXZhbGVudC5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJWaWV3RW11bGF0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9kZXZpY2U6IElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdFVzZXJBZ2VudDogc3RyaW5nO1xuXHRwcml2YXRlIF9sYXN0TGF5b3V0ID0geyBjb250YWluZXJXaWR0aDogMTAyNCwgY29udGFpbmVySGVpZ2h0OiA3NjgsIHNjYWxlOiAxLCBob3N0Wm9vbTogMSB9O1xuXHRwcml2YXRlIF9sYXN0QXBwbGllZDogeyB2aWV3cG9ydFdpZHRoOiBudW1iZXI7IHZpZXdwb3J0SGVpZ2h0OiBudW1iZXI7IHNjYWxlOiBudW1iZXI7IGhvc3Rab29tOiBudW1iZXI7IG1vYmlsZTogYm9vbGVhbiB9IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGJyb3dzZXI6IEJyb3dzZXJWaWV3LFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2RlZmF1bHRVc2VyQWdlbnQgPSB0aGlzLmJyb3dzZXIud2ViQ29udGVudHMuZ2V0VXNlckFnZW50KCk7XG5cblx0XHQvLyBDaHJvbWl1bSBtYXkgcmVzZXQgZW11bGF0aW9uIG9uIGNyb3NzLXByb2Nlc3MgbmF2aWdhdGlvbi5cblx0XHRjb25zdCBvbk5hdmlnYXRlID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGFzdEFwcGxpZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR2b2lkIHRoaXMuX3JlYXBwbHkoKTtcblx0XHR9O1xuXHRcdHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5vbignZGlkLW5hdmlnYXRlJywgb25OYXZpZ2F0ZSk7XG5cblx0XHQvLyBJbnRlcmNlcHQgZXh0ZXJuYWwgQ0RQIGVtdWxhdGlvbiBjb21tYW5kcyBhbmQgZm9sZCB0aGVtIGludG8gdGhlIGRldmljZSBwcm9maWxlIHNvIHRoZXJlIGlzIGEgc2luZ2xlIHNvdXJjZSBvZiB0cnV0aC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmJyb3dzZXIuZGVidWdnZXIucmVnaXN0ZXJDb21tYW5kSW50ZXJjZXB0b3IoKG1ldGhvZCwgcGFyYW1zLCBzZXNzaW9uKSA9PiB0aGlzLl9pbnRlcmNlcHQobWV0aG9kLCBwYXJhbXMsIHNlc3Npb24pKSk7XG5cdH1cblxuXHRnZXQgZGV2aWNlKCk6IElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RldmljZTtcblx0fVxuXG5cdGdldCBlbXVsYXRlZFNjYWxlRmFjdG9yKCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9sYXN0TGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RMYXlvdXQuc2NhbGUgKiB0aGlzLl9sYXN0TGF5b3V0Lmhvc3Rab29tO1xuXHR9XG5cblx0YXN5bmMgc2V0RGV2aWNlKGRldmljZTogSUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJldiA9IHRoaXMuX2RldmljZTtcblx0XHR0aGlzLl9kZXZpY2UgPSBkZXZpY2U7XG5cblx0XHRjb25zdCBuZXh0VUEgPSBkZXZpY2U/LnVzZXJBZ2VudDtcblx0XHRpZiAocHJldj8udXNlckFnZW50ICE9PSBuZXh0VUEpIHtcblx0XHRcdHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5zZXRVc2VyQWdlbnQobmV4dFVBID8/IHRoaXMuX2RlZmF1bHRVc2VyQWdlbnQpO1xuXHRcdH1cblxuXHRcdGlmIChwcmV2ICYmICFkZXZpY2UgJiYgdGhpcy5pc1NhZmVUb0FwcGx5RW11bGF0aW9uKCkpIHtcblx0XHRcdHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5kaXNhYmxlRGV2aWNlRW11bGF0aW9uKCk7XG5cdFx0XHR2b2lkIHRoaXMuX2FwcGx5VG91Y2hBbmRNZWRpYSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RBcHBsaWVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChkZXZpY2UgJiYgdGhpcy5pc1NhZmVUb0FwcGx5RW11bGF0aW9uKCkpIHtcblx0XHRcdHRoaXMuX3JlYXBwbHkoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKGRldmljZSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBjYWNoZWQgbGF5b3V0IChjb250YWluZXIgc2l6ZSArIHNjYWxlICsgaG9zdCB6b29tKSBhbmQgcmVhcHBseVxuXHQgKiBlbXVsYXRpb24uIFRoZSBlbXVsYXRlZCB2aWV3cG9ydCBpcyBkZXJpdmVkIGZyb20gdGhlIGN1cnJlbnQgZGV2aWNlJ3Ncblx0ICogd2lkdGggLyBoZWlnaHQ7IHdoZW4gdGhvc2UgYXJlIHVuZGVmaW5lZCB0aGUgdmlld3BvcnQgYXV0by1maXRzIHRvIHRoZVxuXHQgKiBjb250YWluZXIgYXQgdGhlIGdpdmVuIHNjYWxlLiBgaG9zdFpvb21gIGlzIHRoZSBob3N0IHdpbmRvdydzXG5cdCAqIENTUy10by1zY3JlZW4gem9vbSBmYWN0b3IgXHUyMDE0IGJvdW5kcyBpbiBtYWluIGFyZSBtdWx0aXBsaWVkIGJ5IGl0LCBzbyB0aGVcblx0ICogZW11bGF0aW9uIHNjYWxlIG11c3QgYmUgdG9vIG9yIHRoZSBlbXVsYXRlZCB2aWV3cG9ydCB3b24ndCBmaWxsIHRoZVxuXHQgKiBXZWJDb250ZW50c1ZpZXcgd2hlbiB0aGUgd29ya2JlbmNoIGlzIHpvb21lZC5cblx0ICovXG5cdGFwcGx5U2NyZWVuRW11bGF0aW9uKGNvbnRhaW5lcldpZHRoOiBudW1iZXIsIGNvbnRhaW5lckhlaWdodDogbnVtYmVyLCBzY2FsZTogbnVtYmVyLCBob3N0Wm9vbTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdExheW91dCA9IHsgY29udGFpbmVyV2lkdGgsIGNvbnRhaW5lckhlaWdodCwgc2NhbGUsIGhvc3Rab29tIH07XG5cdFx0dGhpcy5fcmVhcHBseSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhcHBseSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2RldmljZSB8fCAhdGhpcy5pc1NhZmVUb0FwcGx5RW11bGF0aW9uKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgeyBjb250YWluZXJXaWR0aCwgY29udGFpbmVySGVpZ2h0LCBzY2FsZSwgaG9zdFpvb20gfSA9IHRoaXMuX2xhc3RMYXlvdXQ7XG5cdFx0Y29uc3QgcyA9IE1hdGgubWF4KDAuMDEsIHNjYWxlKTtcblx0XHRjb25zdCB6ID0gTWF0aC5tYXgoMC4wMSwgaG9zdFpvb20pO1xuXHRcdGNvbnN0IHcgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKHRoaXMuX2RldmljZS53aWR0aCB8fCBjb250YWluZXJXaWR0aCAvIHMpKTtcblx0XHRjb25zdCBoID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZCh0aGlzLl9kZXZpY2UuaGVpZ2h0IHx8IGNvbnRhaW5lckhlaWdodCAvIHMpKTtcblx0XHRjb25zdCBtb2JpbGUgPSAhIXRoaXMuX2RldmljZS5tb2JpbGU7XG5cdFx0Y29uc3QgbGFzdCA9IHRoaXMuX2xhc3RBcHBsaWVkO1xuXHRcdGlmIChsYXN0ICYmIGxhc3Qudmlld3BvcnRXaWR0aCA9PT0gdyAmJiBsYXN0LnZpZXdwb3J0SGVpZ2h0ID09PSBoXG5cdFx0XHQmJiBNYXRoLmFicyhsYXN0LnNjYWxlIC0gcykgPCAwLjAwMDEgJiYgTWF0aC5hYnMobGFzdC5ob3N0Wm9vbSAtIHopIDwgMC4wMDAxXG5cdFx0XHQmJiBsYXN0Lm1vYmlsZSA9PT0gbW9iaWxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RBcHBsaWVkID0geyB2aWV3cG9ydFdpZHRoOiB3LCB2aWV3cG9ydEhlaWdodDogaCwgc2NhbGU6IHMsIGhvc3Rab29tOiB6LCBtb2JpbGUgfTtcblx0XHRjb25zdCBwYXJhbXM6IEVsZWN0cm9uLlBhcmFtZXRlcnMgPSB7XG5cdFx0XHRzY3JlZW5Qb3NpdGlvbjogbW9iaWxlID8gJ21vYmlsZScgOiAnZGVza3RvcCcsXG5cdFx0XHRzY3JlZW5TaXplOiB7IHdpZHRoOiB3LCBoZWlnaHQ6IGggfSxcblx0XHRcdHZpZXdTaXplOiB7IHdpZHRoOiB3LCBoZWlnaHQ6IGggfSxcblx0XHRcdGRldmljZVNjYWxlRmFjdG9yOiB0aGlzLl9kZXZpY2UuZGV2aWNlU2NhbGVGYWN0b3IgPz8gMCxcblx0XHRcdHZpZXdQb3NpdGlvbjogeyB4OiAwLCB5OiAwIH0sXG5cdFx0XHRzY2FsZTogcyAqIHosXG5cdFx0fTtcblxuXHRcdC8vIFRoZXJlJ3MgYSBidWcgd2hlcmUgYHNjcmVlblBvc2l0aW9uOiAnbW9iaWxlJ2AgZG9lc24ndCBhcHBseSBzY2FsaW5nIGNvcnJlY3RseSBvbiB0aGUgZmlyc3QgY2FsbCBvZiBlbmFibGluZyBlbXVsYXRpb24sXG5cdFx0Ly8gc28gd2UgaGF2ZSB0byBmaXJzdCBlbmFibGUgZW11bGF0aW9uIGluIGRlc2t0b3AgbW9kZSBhbmQgdGhlbiBzd2l0Y2ggaXQgdG8gbW9iaWxlIGJlbG93LlxuXHRcdGlmIChtb2JpbGUgJiYgIWxhc3QpIHtcblx0XHRcdHRoaXMuYnJvd3Nlci53ZWJDb250ZW50cy5lbmFibGVEZXZpY2VFbXVsYXRpb24oe1xuXHRcdFx0XHQuLi5wYXJhbXMsXG5cdFx0XHRcdHNjcmVlblBvc2l0aW9uOiAnZGVza3RvcCcsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLmJyb3dzZXIud2ViQ29udGVudHMuZW5hYmxlRGV2aWNlRW11bGF0aW9uKHBhcmFtcyk7XG5cblx0XHRpZiAobW9iaWxlICE9PSBsYXN0Py5tb2JpbGUpIHtcblx0XHRcdHZvaWQgdGhpcy5fYXBwbHlUb3VjaEFuZE1lZGlhKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc1NhZmVUb0FwcGx5RW11bGF0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5icm93c2VyLndlYkNvbnRlbnRzLmlzRGVzdHJveWVkKCkgJiYgISF0aGlzLmJyb3dzZXIud2ViQ29udGVudHMuZ2V0VVJMKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseVRvdWNoQW5kTWVkaWEoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmlzU2FmZVRvQXBwbHlFbXVsYXRpb24oKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZXZpY2UgPSB0aGlzLl9kZXZpY2U7XG5cdFx0Y29uc3QgbW9iaWxlID0gISF0aGlzLl9kZXZpY2U/Lm1vYmlsZTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5icm93c2VyLmRlYnVnZ2VyLnNlbmRDb21tYW5kUmF3KCdFbXVsYXRpb24uc2V0VG91Y2hFbXVsYXRpb25FbmFibGVkJywgeyBlbmFibGVkOiBtb2JpbGUsIG1heFRvdWNoUG9pbnRzOiBtb2JpbGUgPyA1IDogMSB9KTtcblx0XHRcdGlmICh0aGlzLmRldmljZSAhPT0gZGV2aWNlKSB7IHJldHVybjsgfSAvLyBCYWlsIGlmIGRldmljZSBjaGFuZ2VkIHdoaWxlIHdlIHdlcmUgYXdhaXRpbmdcblxuXHRcdFx0YXdhaXQgdGhpcy5icm93c2VyLmRlYnVnZ2VyLnNlbmRDb21tYW5kUmF3KCdFbXVsYXRpb24uc2V0RW11bGF0ZWRNZWRpYScsIHsgZmVhdHVyZXM6IHRoaXMuX2RldmljZSA/IFt7IG5hbWU6ICdwb2ludGVyJywgdmFsdWU6IG1vYmlsZSA/ICdjb2Fyc2UnIDogJ2ZpbmUnIH1dIDogW10gfSk7XG5cdFx0XHRpZiAodGhpcy5kZXZpY2UgIT09IGRldmljZSkgeyByZXR1cm47IH0gLy8gQmFpbCBpZiBkZXZpY2UgY2hhbmdlZCB3aGlsZSB3ZSB3ZXJlIGF3YWl0aW5nXG5cblx0XHRcdGF3YWl0IHRoaXMuYnJvd3Nlci5kZWJ1Z2dlci5zZW5kQ29tbWFuZFJhdygnRW11bGF0aW9uLnNldEVtaXRUb3VjaEV2ZW50c0Zvck1vdXNlJywgeyBlbmFibGVkOiBtb2JpbGUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tCcm93c2VyVmlld0VtdWxhdG9yXSBfYXBwbHlUb3VjaEFuZE1lZGlhIGZhaWxlZCcsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEludGVyY2VwdCBpbmNvbWluZyBDRFAgZW11bGF0aW9uIGNvbW1hbmRzIGFuZCBmb2xkIHRoZSBvbmVzIHRoYXQgbWFwIG9udG9cblx0ICoge0BsaW5rIElCcm93c2VyRGV2aWNlUHJvZmlsZX0gaW50byB0aGUgZGV2aWNlLiBBbnl0aGluZyB3ZSBkb24ndCBtb2RlbFxuXHQgKiAoZ2VvbG9jYXRpb24sIHRpbWV6b25lLCBDUFUgdGhyb3R0bGluZywgbG9jYWxlLCB2aXNpb24gZGVmaWNpZW5jeSwgXHUyMDI2KVxuXHQgKiBmYWxscyB0aHJvdWdoIHRvIHJhdyBDRFAuIE9ubHkgdGhlIHJvb3Qgc2Vzc2lvbiBpcyBpbnRlcmNlcHRlZCBcdTIwMTQgd29ya2VyXG5cdCAqIGFuZCBpZnJhbWUgc3ViLXNlc3Npb25zIGdldCBwYXNzLXRocm91Z2ggYmVoYXZpb3IuXG5cdCAqL1xuXHRwcml2YXRlIF9pbnRlcmNlcHQobWV0aG9kOiBzdHJpbmcsIHBhcmFtczogdW5rbm93biwgc2Vzc2lvbjogSUNEUENvbm5lY3Rpb24gfCB1bmRlZmluZWQpOiBQcm9taXNlPHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc2Vzc2lvbiAmJiBzZXNzaW9uLnRhcmdldElkICE9PSB0aGlzLmJyb3dzZXIuZGVidWdnZXIudGFyZ2V0SWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChtZXRob2QpIHtcblx0XHRcdGNhc2UgJ0VtdWxhdGlvbi5zZXREZXZpY2VNZXRyaWNzT3ZlcnJpZGUnOiB7XG5cdFx0XHRcdGNvbnN0IHAgPSAocGFyYW1zID8/IHt9KSBhcyB7IHdpZHRoPzogbnVtYmVyOyBoZWlnaHQ/OiBudW1iZXI7IG1vYmlsZT86IGJvb2xlYW47IGRldmljZVNjYWxlRmFjdG9yPzogbnVtYmVyIH07XG5cdFx0XHRcdGNvbnN0IG5leHQ6IElCcm93c2VyRGV2aWNlUHJvZmlsZSA9IHtcblx0XHRcdFx0XHQuLi50aGlzLl9kZXZpY2UsXG5cdFx0XHRcdFx0Ly8gQ0RQIHVzZXMgMCB0byBkaXNhYmxlIHRoZSBjb3JyZXNwb25kaW5nIG92ZXJyaWRlLlxuXHRcdFx0XHRcdHdpZHRoOiBwLndpZHRoIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRoZWlnaHQ6IHAuaGVpZ2h0IHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2JpbGU6IHAubW9iaWxlID8/IHRoaXMuX2RldmljZT8ubW9iaWxlLFxuXHRcdFx0XHRcdGRldmljZVNjYWxlRmFjdG9yOiBwLmRldmljZVNjYWxlRmFjdG9yID8/IHRoaXMuX2RldmljZT8uZGV2aWNlU2NhbGVGYWN0b3IsXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldERldmljZShuZXh0KS50aGVuKCgpID0+ICh7fSkpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnRW11bGF0aW9uLmNsZWFyRGV2aWNlTWV0cmljc092ZXJyaWRlJzoge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2RldmljZSkge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHsgd2lkdGgsIGhlaWdodCwgbW9iaWxlLCBkZXZpY2VTY2FsZUZhY3RvciwgLi4ucmVzdCB9ID0gdGhpcy5fZGV2aWNlO1xuXHRcdFx0XHRjb25zdCBoYXNSZXN0ID0gT2JqZWN0LnZhbHVlcyhyZXN0KS5zb21lKHYgPT4gdiAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2V0RGV2aWNlKGhhc1Jlc3QgPyByZXN0IDogdW5kZWZpbmVkKS50aGVuKCgpID0+ICh7fSkpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnRW11bGF0aW9uLnNldFVzZXJBZ2VudE92ZXJyaWRlJzoge1xuXHRcdFx0XHRjb25zdCBwID0gKHBhcmFtcyA/PyB7fSkgYXMgeyB1c2VyQWdlbnQ/OiBzdHJpbmc7IGFjY2VwdExhbmd1YWdlPzogc3RyaW5nOyBwbGF0Zm9ybT86IHN0cmluZzsgdXNlckFnZW50TWV0YWRhdGE/OiB1bmtub3duIH07XG5cdFx0XHRcdC8vIE9ubHkgZm9sZCB0aGUgYmFyZS1zdHJpbmcgY2FzZTsgcmljaGVyIGNsaWVudC1oaW50IHBhcmFtcyB3b3VsZFxuXHRcdFx0XHQvLyBub3Qgcm91bmQtdHJpcCB0aHJvdWdoIG91ciBtb2RlbCwgc28gbGV0IHRoZW0gZ28gcmF3LlxuXHRcdFx0XHRpZiAocC5hY2NlcHRMYW5ndWFnZSAhPT0gdW5kZWZpbmVkIHx8IHAucGxhdGZvcm0gIT09IHVuZGVmaW5lZCB8fCBwLnVzZXJBZ2VudE1ldGFkYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHVhID0gcC51c2VyQWdlbnQgfHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXREZXZpY2UoeyAuLi50aGlzLl9kZXZpY2UsIHVzZXJBZ2VudDogdWEgfSkudGhlbigoKSA9PiAoe30pKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ0lucHV0LmRpc3BhdGNoTW91c2VFdmVudCc6XG5cdFx0XHRjYXNlICdJbnB1dC5kaXNwYXRjaERyYWdFdmVudCc6XG5cdFx0XHRjYXNlICdJbnB1dC5zeW50aGVzaXplU2Nyb2xsR2VzdHVyZSc6XG5cdFx0XHRjYXNlICdJbnB1dC5zeW50aGVzaXplUGluY2hHZXN0dXJlJzpcblx0XHRcdGNhc2UgJ0lucHV0LnN5bnRoZXNpemVUYXBHZXN0dXJlJzpcblx0XHRcdGNhc2UgJ0lucHV0LmRpc3BhdGNoVG91Y2hFdmVudCc6XG5cdFx0XHRcdHRoaXMuX3NjYWxlSW5wdXRDb29yZGluYXRlcyhwYXJhbXMpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBsZXQgdGhlIGV2ZW50IHBhc3MgdGhyb3VnaCB3aXRoIHRoZSBtb2RpZmllZCBwYXJhbWV0ZXJzXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTY2FsZSBhbnkgY29vcmRpbmF0ZS1iZWFyaW5nIGZpZWxkcyBvbiBhIENEUCBgSW5wdXQuKmAgcGFyYW1zIG9iamVjdCBpblxuXHQgKiBwbGFjZSBzbyBzY3JlZW4tc3BhY2UgY29vcmRpbmF0ZXMgbWFwIG9udG8gdGhlIGVtdWxhdGVkIHZpZXdwb3J0LiBIYW5kbGVzXG5cdCAqIHBvaW50IGNvb3JkaW5hdGVzIChgeGAgLyBgeWApLCBtb3VzZSB3aGVlbCBkZWx0YXMgKGBkZWx0YVhgIC8gYGRlbHRhWWApLFxuXHQgKiBzY3JvbGwgZGlzdGFuY2VzIChgeERpc3RhbmNlYCAvIGB5RGlzdGFuY2VgKSBhbmQgdG91Y2ggcG9pbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NhbGVJbnB1dENvb3JkaW5hdGVzKHBhcmFtczogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IHNjYWxlID0gdGhpcy5lbXVsYXRlZFNjYWxlRmFjdG9yO1xuXHRcdGNvbnN0IHAgPSAocGFyYW1zID8/IHt9KSBhcyB7XG5cdFx0XHR4PzogbnVtYmVyO1xuXHRcdFx0eT86IG51bWJlcjtcblx0XHRcdGRlbHRhWD86IG51bWJlcjtcblx0XHRcdGRlbHRhWT86IG51bWJlcjtcblx0XHRcdHhEaXN0YW5jZT86IG51bWJlcjtcblx0XHRcdHlEaXN0YW5jZT86IG51bWJlcjtcblx0XHRcdHRvdWNoUG9pbnRzPzogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9W107XG5cdFx0fTtcblx0XHRpZiAocC54KSB7XG5cdFx0XHRwLnggKj0gc2NhbGU7XG5cdFx0fVxuXHRcdGlmIChwLnkpIHtcblx0XHRcdHAueSAqPSBzY2FsZTtcblx0XHR9XG5cdFx0aWYgKHAuZGVsdGFYKSB7XG5cdFx0XHRwLmRlbHRhWCAqPSBzY2FsZTtcblx0XHR9XG5cdFx0aWYgKHAuZGVsdGFZKSB7XG5cdFx0XHRwLmRlbHRhWSAqPSBzY2FsZTtcblx0XHR9XG5cdFx0aWYgKHAueERpc3RhbmNlKSB7XG5cdFx0XHRwLnhEaXN0YW5jZSAqPSBzY2FsZTtcblx0XHR9XG5cdFx0aWYgKHAueURpc3RhbmNlKSB7XG5cdFx0XHRwLnlEaXN0YW5jZSAqPSBzY2FsZTtcblx0XHR9XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkocC50b3VjaFBvaW50cykpIHtcblx0XHRcdHAudG91Y2hQb2ludHMgPSBwLnRvdWNoUG9pbnRzLm1hcCgodCkgPT4gKHtcblx0XHRcdFx0Li4udCxcblx0XHRcdFx0eDogdC54ICogc2NhbGUsXG5cdFx0XHRcdHk6IHQueSAqIHNjYWxlLFxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQXNCO0FBRS9CLFNBQVMsbUJBQW1CO0FBWXJCLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBVW5ELFlBQ2tCLFNBQ2EsWUFDN0I7QUFDRCxVQUFNO0FBSFc7QUFDYTtBQVIvQixTQUFRLGNBQWMsRUFBRSxnQkFBZ0IsTUFBTSxpQkFBaUIsS0FBSyxPQUFPLEdBQUcsVUFBVSxFQUFFO0FBRzFGLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBMkMsQ0FBQztBQUMvRixTQUFTLGNBQXdELEtBQUssYUFBYTtBQU9sRixTQUFLLG9CQUFvQixLQUFLLFFBQVEsWUFBWSxhQUFhO0FBRy9ELFVBQU0sYUFBYSxNQUFNO0FBQ3hCLFdBQUssZUFBZTtBQUNwQixXQUFLLEtBQUssU0FBUztBQUFBLElBQ3BCO0FBQ0EsU0FBSyxRQUFRLFlBQVksR0FBRyxnQkFBZ0IsVUFBVTtBQUd0RCxTQUFLLFVBQVUsS0FBSyxRQUFRLFNBQVMsMkJBQTJCLENBQUMsUUFBUSxRQUFRLFlBQVksS0FBSyxXQUFXLFFBQVEsUUFBUSxPQUFPLENBQUMsQ0FBQztBQUFBLEVBQ3ZJO0FBQUEsRUFFQSxJQUFJLFNBQTRDO0FBQy9DLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksc0JBQThCO0FBQ2pDLFFBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEIsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUssWUFBWSxRQUFRLEtBQUssWUFBWTtBQUFBLEVBQ2xEO0FBQUEsRUFFQSxNQUFNLFVBQVUsUUFBMEQ7QUFDekUsVUFBTSxPQUFPLEtBQUs7QUFDbEIsU0FBSyxVQUFVO0FBRWYsVUFB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
