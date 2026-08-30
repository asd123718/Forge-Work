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
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { addDisposableListener } from "../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../base/common/event.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { localize } from "../../../../../nls.js";
import { AgentsVoiceStorageKeys } from "../../../../contrib/agentsVoice/common/agentsVoice.js";
import { createPcmCaptureNode } from "../pcmCaptureWorklet.js";
import { mainWindow } from "../../../../../base/browser/window.js";
const IMicCaptureService = createDecorator("micCaptureService");
function getMediaCaptureWindow(targetWindow) {
  return targetWindow === mainWindow ? targetWindow : mainWindow;
}
const MIC_CAPTURE_CHUNK_SIZE = 512;
function isMicrophonePermissionDeniedError(error) {
  return (error instanceof DOMException || error instanceof Error) && error.name === "NotAllowedError";
}
let MicCaptureService = class extends Disposable {
  constructor(storageService, notificationService, logService) {
    super();
    this.storageService = storageService;
    this.notificationService = notificationService;
    this.logService = logService;
    this._micStream = null;
    this._isCapturing = false;
    this._captureGeneration = 0;
    this._pttGeneration = 0;
    this._pttHeld = false;
    this._pttStreaming = false;
    this._isMuted = false;
    this._suppressUntilTs = 0;
    this._pttAcquiring = false;
    this._pttReleasedDuringAcquire = false;
    // --- Hardware mute detection. ---
    // A hardware microphone kill switch (e.g. on Framework laptops) leaves
    // `getUserMedia` succeeding with a track whose `muted` flag is set, so no
    // acquisition error surfaces. Track the mute state to warn the user.
    this._micTrackListeners = this._register(new DisposableStore());
    this._micMutedNotified = false;
    this._pttDrainTargetSamples = 0;
    this._pttDrainSamplesSent = 0;
    this._diagTurnId = "";
    this._diagPttDownTs = 0;
    this._diagPttUpTs = 0;
    this._diagChunksSent = 0;
    this._diagSamplesSent = 0;
    this._diagDrainFired = false;
    this._diagDrainChunks = 0;
    this._diagDrainSamples = 0;
    this._diagDrainSkippedByMute = 0;
    this._diagDrainSkippedBySuppression = 0;
    this._diagPostReleaseCallbacks = 0;
    this._diagPostReleaseSamples = 0;
    this._diagPostReleaseSkippedByMute = 0;
    this._diagPostReleaseSkippedBySuppression = 0;
    this._diagReleasedDuringAcquire = false;
    this._diagPttUpWithoutCapture = false;
    this._onPttStart = this._register(new Emitter());
    this.onPttStart = this._onPttStart.event;
    this._onPttAudioChunk = this._register(new Emitter());
    this.onPttAudioChunk = this._onPttAudioChunk.event;
    this._onPttEnd = this._register(new Emitter());
    this.onPttEnd = this._onPttEnd.event;
    this._onPttDiagnostic = this._register(new Emitter());
    this.onPttDiagnostic = this._onPttDiagnostic.event;
  }
  get isCapturing() {
    return this._isCapturing;
  }
  get analyserNode() {
    return this._analyserNode;
  }
  get isMuted() {
    return this._isMuted;
  }
  set isMuted(value) {
    this._isMuted = value;
  }
  suppressUntil(timestamp) {
    this._suppressUntilTs = timestamp;
  }
  getMediaCaptureWindow(targetWindow) {
    return getMediaCaptureWindow(targetWindow);
  }
  prepare(window) {
    this._window = this.getMediaCaptureWindow(window);
  }
  async pttDown(turnId, passive = false) {
    if (this._pttHeld) {
      return;
    }
    const pttGeneration = ++this._pttGeneration;
    this._finishDrain();
    this._flushPendingDiagnostic();
    this._resetDiagnosticCounters(turnId);
    this._pttHeld = true;
    this._pttStreaming = true;
    this._pttReleasedDuringAcquire = false;
    this._isMuted = false;
    if (this._isCapturing) {
      this._onPttStart.fire(passive);
      return;
    }
    if (!this._window) {
      return;
    }
    if (this._pttAcquiring) {
      return;
    }
    this._pttAcquiring = true;
    try {
      await this.startCapture(this._window);
    } catch (err) {
      if (pttGeneration !== this._pttGeneration) {
        return;
      }
      this._pttHeld = false;
      this._pttStreaming = false;
      this._pttReleasedDuringAcquire = false;
      throw err;
    } finally {
      if (pttGeneration === this._pttGeneration) {
        this._pttAcquiring = false;
      }
    }
    if (pttGeneration !== this._pttGeneration || !this._isCapturing || !this._pttHeld) {
      this._pttReleasedDuringAcquire = false;
      return;
    }
    this._onPttStart.fire(passive);
    if (this._pttReleasedDuringAcquire) {
      this._pttReleasedDuringAcquire = false;
      this._pttStreaming = false;
      this._diagReleasedDuringAcquire = true;
      this._onPttEnd.fire();
      this.stopCapture();
      this._scheduleDiagnosticFire();
    }
  }
  pttUp() {
    if (!this._pttHeld) {
      return;
    }
    if (this._pttAcquiring) {
      this._pttReleasedDuringAcquire = true;
      this._diagReleasedDuringAcquire = true;
      this._diagPttUpTs = Date.now();
      this._scheduleDiagnosticFire();
      return;
    }
    if (!this._isCapturing) {
      this._pttHeld = false;
      this._pttStreaming = false;
      this._diagPttUpWithoutCapture = true;
      this._diagPttUpTs = Date.now();
      this._scheduleDiagnosticFire();
      return;
    }
    this._pttHeld = false;
    this._diagPttUpTs = Date.now();
    const sampleRate = this._micCtx?.sampleRate ?? 16e3;
    this._pttDrainTargetSamples = Math.ceil(
      sampleRate * MicCaptureService._PTT_DRAIN_WINDOW_MS / 1e3
    );
    this._pttDrainSamplesSent = 0;
    this._pttDrainFallbackTimer = setTimeout(() => {
      this._pttDrainFallbackTimer = void 0;
      this._finishDrain();
    }, MicCaptureService._PTT_DRAIN_WINDOW_MS + 250);
    this._scheduleDiagnosticFire();
  }
  abortPtt() {
    if (!this._pttHeld && !this._pttStreaming) {
      return;
    }
    if (this._pttDrainFallbackTimer) {
      clearTimeout(this._pttDrainFallbackTimer);
      this._pttDrainFallbackTimer = void 0;
    }
    this._pttDrainTargetSamples = 0;
    this._pttDrainSamplesSent = 0;
    this._pttGeneration++;
    this._pttAcquiring = false;
    this._pttHeld = false;
    this._pttStreaming = false;
    this._pttReleasedDuringAcquire = false;
    this._diagPttUpTs = Date.now();
    this._scheduleDiagnosticFire();
  }
  async startCapture(window) {
    const captureWindow = this.getMediaCaptureWindow(window);
    this._window = captureWindow;
    if (this._isCapturing) {
      return;
    }
    if (this._capturePromise) {
      return this._capturePromise;
    }
    const capturePromise = this._startCapture(captureWindow);
    this._capturePromise = capturePromise;
    try {
      await capturePromise;
    } finally {
      if (this._capturePromise === capturePromise) {
        this._capturePromise = void 0;
      }
    }
  }
  async _startCapture(window) {
    const captureGeneration = this._captureGeneration;
    const deviceId = this.storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
    const audioConstraints = {
      channelCount: 1,
      sampleRate: 16e3,
      echoCancellation: true,
      noiseSuppression: true
    };
    if (deviceId) {
      audioConstraints.deviceId = { exact: deviceId };
    }
    let micStream;
    try {
      micStream = await window.navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
    } catch (err) {
      const isDeviceError = deviceId && err instanceof DOMException && (err.name === "OverconstrainedError" || err.name === "NotFoundError");
      if (isDeviceError) {
        this.logService.warn(`[mic] Preferred device ${deviceId.slice(0, 8)}\u2026 unavailable, falling back to default`);
        delete audioConstraints.deviceId;
        try {
          micStream = await window.navigator.mediaDevices.getUserMedia({
            audio: audioConstraints
          });
        } catch (retryErr) {
          this._notifyMicPermissionDenied(retryErr);
          throw retryErr;
        }
      } else {
        this._notifyMicPermissionDenied(err);
        throw err;
      }
    }
    if (captureGeneration !== this._captureGeneration) {
      micStream.getTracks().forEach((track) => track.stop());
      return;
    }
    this._micStream = micStream;
    const cleanupFailedCapture = () => {
      if (this._micStream === micStream) {
        this._stopCaptureResources();
      } else {
        micStream.getTracks().forEach((track) => track.stop());
      }
    };
    let ctx;
    let source;
    try {
      this._micTrackListeners.clear();
      this._micMutedNotified = false;
      const audioTrack = micStream.getAudioTracks()[0];
      if (audioTrack) {
        if (audioTrack.muted) {
          this._notifyMicrophoneMuted();
        }
        this._micTrackListeners.add(addDisposableListener(audioTrack, "mute", () => this._notifyMicrophoneMuted()));
        this._micTrackListeners.add(addDisposableListener(audioTrack, "unmute", () => {
          this._micMutedNotified = false;
        }));
      }
      if (!this._micCtx) {
        this._micCtx = new window.AudioContext({ sampleRate: 16e3 });
      }
      ctx = this._micCtx;
      source = ctx.createMediaStreamSource(micStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this._analyserNode = analyser;
    } catch (err) {
      cleanupFailedCapture();
      throw err;
    }
    const captureNodePromise = createPcmCaptureNode(window, ctx, MIC_CAPTURE_CHUNK_SIZE, (samples) => {
      const nowTs = Date.now();
      const ptUpTs = this._diagPttUpTs;
      const isDrainCallback = this._pttStreaming && !this._pttHeld;
      const inDiagWindow = ptUpTs > 0 && !this._pttHeld && nowTs <= ptUpTs + MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS;
      const isPostReleaseCallback = !this._pttStreaming && inDiagWindow;
      if (this._isMuted) {
        if (isDrainCallback) {
          this._diagDrainSkippedByMute++;
        }
        if (isPostReleaseCallback) {
          this._diagPostReleaseSkippedByMute++;
        }
        return;
      }
      if (nowTs < this._suppressUntilTs) {
        if (isDrainCallback) {
          this._diagDrainSkippedBySuppression++;
        }
        if (isPostReleaseCallback) {
          this._diagPostReleaseSkippedBySuppression++;
        }
        return;
      }
      if (!this._pttStreaming) {
        if (isPostReleaseCallback) {
          this._diagPostReleaseCallbacks++;
          this._diagPostReleaseSamples += samples.length;
        }
        return;
      }
      const b64 = encodeRawPcm16Base64(samples, this._window);
      this._diagChunksSent++;
      this._diagSamplesSent += samples.length;
      if (isDrainCallback) {
        this._diagDrainFired = true;
        this._diagDrainChunks++;
        this._diagDrainSamples += samples.length;
        this._pttDrainSamplesSent += samples.length;
      }
      this._onPttAudioChunk.fire(b64);
      if (isDrainCallback && this._pttDrainSamplesSent >= this._pttDrainTargetSamples) {
        this._finishDrain();
      }
    });
    let node;
    try {
      node = (await captureNodePromise).node;
    } catch (err) {
      cleanupFailedCapture();
      throw err;
    }
    if (this._micCtx !== ctx) {
      try {
        node.disconnect();
      } catch {
      }
      return;
    }
    try {
      this._workletNode = node;
      source.connect(node);
      node.connect(ctx.destination);
      this._isCapturing = true;
    } catch (err) {
      cleanupFailedCapture();
      throw err;
    }
  }
  _notifyMicPermissionDenied(err) {
    if (isMicrophonePermissionDeniedError(err)) {
      this.notificationService.notify({
        severity: Severity.Error,
        message: localize("mic.permissionDenied", "Microphone access was denied. Grant microphone permission in your system settings to use Voice Mode.")
      });
    }
  }
  _notifyMicrophoneMuted() {
    if (this._micMutedNotified) {
      return;
    }
    this._micMutedNotified = true;
    this.logService.warn("[mic] Microphone track is muted \u2014 likely a hardware mute switch is enabled");
    this.notificationService.notify({
      severity: Severity.Warning,
      message: localize("mic.hardwareMuted", "Your microphone appears to be muted or disabled, possibly by a hardware switch. Voice Mode won't hear you until it's re-enabled.")
    });
  }
  _stopCaptureResources() {
    this._captureGeneration++;
    this._capturePromise = void 0;
    if (this._workletNode) {
      this._workletNode.port.onmessage = null;
      try {
        this._workletNode.disconnect();
      } catch {
      }
      this._workletNode = void 0;
    }
    this._analyserNode = void 0;
    this._micCtx?.close();
    this._micCtx = void 0;
    if (this._micStream) {
      this._micStream.getTracks().forEach((t) => t.stop());
      this._micStream = null;
    }
    this._micTrackListeners.clear();
    this._micMutedNotified = false;
    this._isCapturing = false;
  }
  stopCapture() {
    this._stopCaptureResources();
    this._pttGeneration++;
    this._pttAcquiring = false;
    if (this._pttDrainFallbackTimer) {
      clearTimeout(this._pttDrainFallbackTimer);
      this._pttDrainFallbackTimer = void 0;
    }
    this._pttDrainTargetSamples = 0;
    this._pttDrainSamplesSent = 0;
    this._pttHeld = false;
    this._pttStreaming = false;
    this._pttReleasedDuringAcquire = false;
  }
  dispose() {
    if (this._diagFireTimer) {
      clearTimeout(this._diagFireTimer);
      this._diagFireTimer = void 0;
    }
    if (this._pttDrainFallbackTimer) {
      clearTimeout(this._pttDrainFallbackTimer);
      this._pttDrainFallbackTimer = void 0;
    }
    this.stopCapture();
    super.dispose();
  }
  /**
   * End the post-release drain phase: stop accepting more audio for
   * this turn and fire `_onPttEnd`. Idempotent. Safe to call when no
   * drain is in progress.
   */
  _finishDrain() {
    if (this._pttDrainFallbackTimer) {
      clearTimeout(this._pttDrainFallbackTimer);
      this._pttDrainFallbackTimer = void 0;
    }
    this._pttDrainTargetSamples = 0;
    this._pttDrainSamplesSent = 0;
    if (this._pttStreaming && !this._pttHeld) {
      this._pttStreaming = false;
      this._onPttEnd.fire();
    }
  }
  _resetDiagnosticCounters(turnId) {
    this._diagTurnId = turnId;
    this._diagPttDownTs = Date.now();
    this._diagPttUpTs = 0;
    this._diagChunksSent = 0;
    this._diagSamplesSent = 0;
    this._diagDrainFired = false;
    this._diagDrainChunks = 0;
    this._diagDrainSamples = 0;
    this._diagDrainSkippedByMute = 0;
    this._diagDrainSkippedBySuppression = 0;
    this._diagPostReleaseCallbacks = 0;
    this._diagPostReleaseSamples = 0;
    this._diagPostReleaseSkippedByMute = 0;
    this._diagPostReleaseSkippedBySuppression = 0;
    this._diagReleasedDuringAcquire = false;
    this._diagPttUpWithoutCapture = false;
  }
  _scheduleDiagnosticFire() {
    if (this._diagFireTimer) {
      clearTimeout(this._diagFireTimer);
      this._diagFireTimer = void 0;
    }
    this._diagFireTimer = setTimeout(() => {
      this._diagFireTimer = void 0;
      this._emitDiagnostic();
    }, MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS);
  }
  _flushPendingDiagnostic() {
    if (this._diagFireTimer) {
      clearTimeout(this._diagFireTimer);
      this._diagFireTimer = void 0;
      this._emitDiagnostic();
    }
  }
  _emitDiagnostic() {
    if (!this._diagTurnId && this._diagPttDownTs === 0) {
      return;
    }
    const msHeld = this._diagPttUpTs > 0 ? this._diagPttUpTs - this._diagPttDownTs : 0;
    this._onPttDiagnostic.fire({
      turnId: this._diagTurnId,
      msHeld,
      chunksSent: this._diagChunksSent,
      samplesSent: this._diagSamplesSent,
      drainFired: this._diagDrainFired,
      drainChunks: this._diagDrainChunks,
      drainSamples: this._diagDrainSamples,
      drainWindowMs: MicCaptureService._PTT_DRAIN_WINDOW_MS,
      drainSkippedByMute: this._diagDrainSkippedByMute,
      drainSkippedBySuppression: this._diagDrainSkippedBySuppression,
      postReleaseCallbacks: this._diagPostReleaseCallbacks,
      postReleaseSamples: this._diagPostReleaseSamples,
      postReleaseSkippedByMute: this._diagPostReleaseSkippedByMute,
      postReleaseSkippedBySuppression: this._diagPostReleaseSkippedBySuppression,
      postReleaseWindowMs: MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS,
      releasedDuringAcquire: this._diagReleasedDuringAcquire,
      pttUpWithoutCapture: this._diagPttUpWithoutCapture
    });
  }
};
// --- Drain state (post-release continued streaming). ---
// Drain length is enforced primarily by counting samples shipped
// since `pttUp` (immune to main-thread jitter that would skew a
// pure wall-clock timer). The fallback timer guards against the
// `onaudioprocess` callback being throttled or stopping entirely.
MicCaptureService._PTT_DRAIN_WINDOW_MS = 500;
// --- Per-press diagnostic counters (reset on pttDown). ---
// Diagnostic window MUST be > drain window so any audio still
// produced after drain end is observable as `postReleaseCallbacks`.
MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS = 1e3;
MicCaptureService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, ILogService)
], MicCaptureService);
function encodeRawPcm16Base64(samples, win) {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  const bytes = new Uint8Array(buf);
  let binaryStr = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryStr += String.fromCharCode(bytes[i]);
  }
  return win.btoa(binaryStr);
}
registerSingleton(IMicCaptureService, MicCaptureService, InstantiationType.Delayed);
export {
  IMicCaptureService,
  MIC_CAPTURE_CHUNK_SIZE,
  MicCaptureService,
  getMediaCaptureWindow,
  isMicrophonePermissionDeniedError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFxtaWNDYXB0dXJlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFnZW50c1ZvaWNlU3RvcmFnZUtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2FnZW50c1ZvaWNlL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQY21DYXB0dXJlTm9kZSB9IGZyb20gJy4uL3BjbUNhcHR1cmVXb3JrbGV0LmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcblxuZXhwb3J0IGNvbnN0IElNaWNDYXB0dXJlU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJTWljQ2FwdHVyZVNlcnZpY2U+KCdtaWNDYXB0dXJlU2VydmljZScpO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TWVkaWFDYXB0dXJlV2luZG93KHRhcmdldFdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyB7XG5cdHJldHVybiB0YXJnZXRXaW5kb3cgPT09IG1haW5XaW5kb3cgPyB0YXJnZXRXaW5kb3cgOiBtYWluV2luZG93O1xufVxuXG4vKiogTnVtYmVyIG9mIHNhbXBsZXMgYnVmZmVyZWQgcGVyIDMyIG1zIHZvaWNlIGNhcHR1cmUgY2h1bmsgYXQgMTYga0h6LCBtYXRjaGluZyBvbmUgU2lsZXJvIFZBRCBmcmFtZS4gKi9cbmV4cG9ydCBjb25zdCBNSUNfQ0FQVFVSRV9DSFVOS19TSVpFID0gNTEyO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNNaWNyb3Bob25lUGVybWlzc2lvbkRlbmllZEVycm9yKGVycm9yOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdHJldHVybiAoZXJyb3IgaW5zdGFuY2VvZiBET01FeGNlcHRpb24gfHwgZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikgJiYgZXJyb3IubmFtZSA9PT0gJ05vdEFsbG93ZWRFcnJvcic7XG59XG5cbi8qKlxuICogUGVyLVBUVC1wcmVzcyBkaWFnbm9zdGljIGVtaXR0ZWQgYWZ0ZXIgYHB0dFVwYCBvbmNlIHRoZSBkaWFnbm9zdGljXG4gKiB3aW5kb3cgY2xvc2VzLiBMb2dnZWQgKyBzZW50IHRvIGJhY2tlbmQgc28gd2UgY2FuIGNvcnJlbGF0ZSBmcm9udGVuZFxuICogYXVkaW8gYm9va2tlZXBpbmcgd2l0aCBiYWNrZW5kIEFTUiByZXN1bHRzIHZpYSBgdHVybklkYC5cbiAqXG4gKiBEcmFpbiBtb2RlbDogYWZ0ZXIgYHB0dFVwYCB0aGUgc2VydmljZSBrZWVwcyBzdHJlYW1pbmcgYXVkaW8gY2h1bmtzXG4gKiBmb3IgYSBmaXhlZCBcImRyYWluIHdpbmRvd1wiICh+NTAwbXMgYnkgZGVmYXVsdCkuIFRoZSBkcmFpbiBlbmRzIGFzXG4gKiBzb29uIGFzIGl0IGhhcyBzaGlwcGVkIGVub3VnaCBzYW1wbGVzIHRvIGNvdmVyIHRoZSB3aW5kb3cgKG9yIGFcbiAqIGZhbGxiYWNrIHRpbWVyIHRyaXBzIGlmIGBvbmF1ZGlvcHJvY2Vzc2Agc3RvcHMgZmlyaW5nKS4gT25seSBBRlRFUlxuICogdGhlIGRyYWluIGhhcyBjbG9zZWQgZG9lcyBgX29uUHR0RW5kYCBmaXJlLiBUaGUgZGlhZ25vc3RpYyB3aW5kb3cgaXNcbiAqIGludGVudGlvbmFsbHkgTE9OR0VSIHRoYW4gdGhlIGRyYWluIHdpbmRvdyBzbyBhbnkgYXVkaW8gc3RpbGxcbiAqIHByb2R1Y2VkIGFmdGVyIGRyYWluIGVuZCAod2l0aGluIHRoZSBkaWFnbm9zdGljIHdpbmRvdykgaXMgY291bnRlZFxuICogYXMgYHBvc3RSZWxlYXNlQ2FsbGJhY2tzYCAtLSBhIGRpcmVjdCBzaWduYWwgdGhhdCB0aGUgZHJhaW4gd2luZG93XG4gKiBpcyB0b28gc2hvcnQgZm9yIHRoaXMgZGV2aWNlL2xvYWQgYW5kIHRoZSBmaXggbmVlZHMgdG8gZXh0ZW5kIGl0LlxuICpcbiAqIEZpZWxkIGludGVycHJldGF0aW9uOlxuICogIC0gYGRyYWluQ2h1bmtzYCAvIGBkcmFpblNhbXBsZXNgID0+IGF1ZGlvIGNhcHR1cmVkIGR1cmluZyB0aGUgZHJhaW5cbiAqICAgIHdpbmRvdyBhbmQgc2hpcHBlZCB0byB0aGUgYmFja2VuZC4gTm9uLXplcm8gaW4gbm9ybWFsIG9wZXJhdGlvbi5cbiAqICAtIGBwb3N0UmVsZWFzZUNhbGxiYWNrcyA+IDBgID0+IHRoZSBXZWJBdWRpbyBwaXBlbGluZSBwcm9kdWNlZCBtb3JlXG4gKiAgICBhdWRpbyBBRlRFUiB0aGUgZHJhaW4gd2luZG93IGNsb3NlZCBidXQgYmVmb3JlIHRoZSBkaWFnbm9zdGljXG4gKiAgICB3aW5kb3cuIFRoaXMgYXVkaW8gd2FzIERST1BQRUQ7IGlmIGl0IGhhcHBlbnMgb2Z0ZW4gdGhlIGRyYWluXG4gKiAgICB3aW5kb3cgbmVlZHMgdG8gZ3Jvdy5cbiAqICAtIGBkcmFpblNraXBwZWRCeSpgID4gMCA9PiB0aGUgZHJhaW4gd2FzIG11dGVkIG9yIEFFQy1zdXBwcmVzc2VkLlxuICogICAgVGFpbCBhdWRpbyBmb3IgdGhhdCBwcmVzcyB3YXMgbG9zdDsgaW52ZXN0aWdhdGUgdGhlIG11dGUgLyBBRUNcbiAqICAgIHN1cHByZXNzaW9uIHBhdGggcmF0aGVyIHRoYW4gdGhlIGRyYWluIHdpbmRvdy5cbiAqICAtIGBwdHRVcFdpdGhvdXRDYXB0dXJlYCA9PiBwdHRVcCBhcnJpdmVkIHdoaWxlIG1pYyB3YXMgbm90IGNhcHR1cmluZy5cbiAqICAtIGByZWxlYXNlZER1cmluZ0FjcXVpcmVgID0+IHVzZXIgcmVsZWFzZWQgd2hpbGUgbWljIHdhcyBzdGlsbCBiZWluZ1xuICogICAgYWNxdWlyZWQ7IG5vIGF1ZGlvIHdhcyBldmVyIHJlY29yZGVkIGZvciB0aGlzIHByZXNzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElQdHREaWFnbm9zdGljIHtcblx0cmVhZG9ubHkgdHVybklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1zSGVsZDogbnVtYmVyO1xuXHRyZWFkb25seSBjaHVua3NTZW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHNhbXBsZXNTZW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGRyYWluRmlyZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRyYWluQ2h1bmtzOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRyYWluU2FtcGxlczogbnVtYmVyO1xuXHRyZWFkb25seSBkcmFpbldpbmRvd01zOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRyYWluU2tpcHBlZEJ5TXV0ZTogbnVtYmVyO1xuXHRyZWFkb25seSBkcmFpblNraXBwZWRCeVN1cHByZXNzaW9uOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBvc3RSZWxlYXNlQ2FsbGJhY2tzOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBvc3RSZWxlYXNlU2FtcGxlczogbnVtYmVyO1xuXHRyZWFkb25seSBwb3N0UmVsZWFzZVNraXBwZWRCeU11dGU6IG51bWJlcjtcblx0cmVhZG9ubHkgcG9zdFJlbGVhc2VTa2lwcGVkQnlTdXBwcmVzc2lvbjogbnVtYmVyO1xuXHRyZWFkb25seSBwb3N0UmVsZWFzZVdpbmRvd01zOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlbGVhc2VkRHVyaW5nQWNxdWlyZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgcHR0VXBXaXRob3V0Q2FwdHVyZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWljQ2FwdHVyZVNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFN0b3JlIGEgd2luZG93IHJlZmVyZW5jZSBmb3IgbGF0ZXIgbGF6eSBtaWMgYWNxdWlzaXRpb24gd2l0aG91dCBhY3R1YWxseVxuXHQgKiBhY3F1aXJpbmcgdGhlIG1pY3JvcGhvbmUuIFRoZSBtaWMgaXMgYWNxdWlyZWQgb24gYHB0dERvd24oKWAgYW5kIHJlbGVhc2VkXG5cdCAqIG9uIGBwdHRVcCgpYC5cblx0ICovXG5cdHByZXBhcmUod2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IHZvaWQ7XG5cblx0LyoqIFN0YXJ0IGNhcHR1cmluZyBhdWRpbyBmcm9tIHRoZSBtaWNyb3Bob25lLiAqL1xuXHRzdGFydENhcHR1cmUod2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqIFN0b3AgY2FwdHVyaW5nIGFuZCByZWxlYXNlIG1pYyByZXNvdXJjZXMuICovXG5cdHN0b3BDYXB0dXJlKCk6IHZvaWQ7XG5cblx0cmVhZG9ubHkgaXNDYXB0dXJpbmc6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEZpcmVkIHdoZW4gYSBQVFQgc2VnbWVudCBiZWdpbnMgKG1pYyByZWFkeSkuIFRoZSBib29sZWFuIHBheWxvYWQgaXMgdGhlXG5cdCAqIGBwYXNzaXZlYCBmbGFnIGNhcHR1cmVkIGF0IHRoZSBjb3JyZXNwb25kaW5nIGBwdHREb3duYCBjYWxsIChzZWUgdGhlcmUpLlxuXHQgKi9cblx0cmVhZG9ubHkgb25QdHRTdGFydDogRXZlbnQ8Ym9vbGVhbj47XG5cblx0LyoqIEZpcmVkIGR1cmluZyBQVFQgaG9sZCB3aXRoIGJhc2U2NC1lbmNvZGVkIHJhdyBQQ00xNiBjaHVua3MuICovXG5cdHJlYWRvbmx5IG9uUHR0QXVkaW9DaHVuazogRXZlbnQ8c3RyaW5nPjtcblxuXHQvKiogRmlyZWQgd2hlbiBhIFBUVCBzZWdtZW50IGVuZHMuIEFsbCBjaHVua3MgaGF2ZSBiZWVuIHNlbnQgYmVmb3JlIHRoaXMgZmlyZXMuICovXG5cdHJlYWRvbmx5IG9uUHR0RW5kOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogRmlyZWQgYWZ0ZXIgdGhlIGRpYWdub3N0aWMgd2luZG93IGNsb3NlcyAofjFzIGFmdGVyIGBwdHRVcGApIHdpdGhcblx0ICogcGVyLXByZXNzIHRlbGVtZXRyeS4gQWx3YXlzIGZpcmVzIEFGVEVSIGBvblB0dEVuZGAgZm9yIG5vcm1hbFxuXHQgKiBwcmVzc2VzLiBVc2VkIGZvciB0YWlsLWxvc3MgZGlhZ25vc2lzOyBzYWZlIHRvIGlnbm9yZSBmb3Igbm9ybWFsXG5cdCAqIG9wZXJhdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IG9uUHR0RGlhZ25vc3RpYzogRXZlbnQ8SVB0dERpYWdub3N0aWM+O1xuXG5cdC8qKiBUaGUgQW5hbHlzZXJOb2RlIGZvciB2aXN1YWxpc2F0aW9uLCBhdmFpbGFibGUgd2hpbGUgY2FwdHVyaW5nLiAqL1xuXHRyZWFkb25seSBhbmFseXNlck5vZGU6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZDtcblxuXHQvLyAtLS0gUFRUIC0tLVxuXHQvKipcblx0ICogQmVnaW4gYSBQVFQgc2VnbWVudC4gTGF6aWx5IGFjcXVpcmVzIHRoZSBtaWNyb3Bob25lIGlmIG5vdCBhbHJlYWR5XG5cdCAqIGNhcHR1cmluZy4gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBvbmNlIHRoZSBtaWMgaXMgcmVhZHkgdG9cblx0ICogcmVjb3JkIChvciByZWplY3RzIGlmIGFjcXVpc2l0aW9uIGZhaWxzKS5cblx0ICpcblx0ICogYHR1cm5JZGAgaXMgYW4gb3BhcXVlIHBlci1wcmVzcyBpZGVudGlmaWVyIHByb3BhZ2F0ZWQgaW50byB0aGVcblx0ICogZXZlbnR1YWwgYG9uUHR0RGlhZ25vc3RpY2AgcGF5bG9hZCBmb3IgY29ycmVsYXRpb24gd2l0aCBiYWNrZW5kIGxvZ3MuXG5cdCAqIFBhc3MgZW1wdHkgc3RyaW5nIHdoZW4gbm8gY29ycmVsYXRpb24gaXMgbmVlZGVkLlxuXHQgKlxuXHQgKiBgcGFzc2l2ZWAgbWFya3MgdGhpcyBwcmVzcyBhcyBhIGhhbmRzLWZyZWUgYmFyZ2UtaW4gbGlzdGVuIChtaWMgb3BlbmVkXG5cdCAqIGR1cmluZyBhc3Npc3RhbnQgcGxheWJhY2ssIG5vdCBhIHJlYWwgdXNlciBwcmVzcykuIEl0IGlzIGNhcHR1cmVkXG5cdCAqIGltbXV0YWJseSBhdCBjYWxsIHRpbWUgYW5kIGNhcnJpZWQgb24gdGhlIGBvblB0dFN0YXJ0YCBlbWlzc2lvbi4gVGhpc1xuXHQgKiBzdGF5cyBjb3JyZWN0IGV2ZW4gaWYgdGhlIGNhbGxlcidzIG93biBzdGF0ZSBjaGFuZ2VzIGR1cmluZyB0aGUgYXN5bmNcblx0ICogbWljIGFjcXVpcmUuXG5cdCAqL1xuXHRwdHREb3duKHR1cm5JZDogc3RyaW5nLCBwYXNzaXZlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIEVuZCBhIFBUVCBzZWdtZW50LiBTZW5kcyBhbnkgcmVtYWluaW5nIGF1ZGlvIGNodW5rcywgdGhlbiBmaXJlcyBwdHRFbmQuXG5cdCAqL1xuXHRwdHRVcCgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBBYm9ydCB0aGUgY3VycmVudCBQVFQgc2VnbWVudCBXSVRIT1VUIGZpcmluZyBgYG9uUHR0RW5kYGAgYW5kIFdJVEhPVVRcblx0ICogdGVhcmluZyBkb3duIHRoZSB3YXJtIG1pYy4gVXNlZCB3aGVuIHRoZSBiYWNrZW5kIGVuZHMgdGhlIHR1cm4gaXRzZWxmXG5cdCAqIChzZXJ2ZXIgVkFEIHNpbGVuY2UgLyBzdG9wIHBocmFzZSk6IHN0cmVhbWluZyBzdG9wcyBpbW1lZGlhdGVseSBmb3IgdGhpc1xuXHQgKiBwcmVzcyBzbyBubyBmdXJ0aGVyIGF1ZGlvIGlzIHNoaXBwZWQsIGJ1dCBubyBjbGllbnQgYGBwdHRfZW5kYGAgaXNcblx0ICogZW1pdHRlZCBmb3IgdGhlIHR1cm4uIFNhZmUgdG8gY2FsbCB3aGVuIG5vIHByZXNzIGlzIGFjdGl2ZS5cblx0ICovXG5cdGFib3J0UHR0KCk6IHZvaWQ7XG5cblx0Ly8gLS0tIE11dGUgLyBBRUMgc3VwcHJlc3Npb24gLS0tXG5cdGlzTXV0ZWQ6IGJvb2xlYW47XG5cblx0LyoqIFN1cHByZXNzIG1pYyBvdXRwdXQgdW50aWwgdGhlIGdpdmVuIHRpbWVzdGFtcCAoQUVDIGdhdGluZykuICovXG5cdHN1cHByZXNzVW50aWwodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgTWljQ2FwdHVyZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1pY0NhcHR1cmVTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIF93aW5kb3c6IChXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcykgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21pY1N0cmVhbTogTWVkaWFTdHJlYW0gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfbWljQ3R4OiBBdWRpb0NvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dvcmtsZXROb2RlOiBBdWRpb1dvcmtsZXROb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hbmFseXNlck5vZGU6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNDYXB0dXJpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY2FwdHVyZUdlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIF9jYXB0dXJlUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHR0R2VuZXJhdGlvbiA9IDA7XG5cdHByaXZhdGUgX3B0dEhlbGQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcHR0U3RyZWFtaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzTXV0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfc3VwcHJlc3NVbnRpbFRzID0gMDtcblx0cHJpdmF0ZSBfcHR0QWNxdWlyaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX3B0dFJlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXG5cdC8vIC0tLSBIYXJkd2FyZSBtdXRlIGRldGVjdGlvbi4gLS0tXG5cdC8vIEEgaGFyZHdhcmUgbWljcm9waG9uZSBraWxsIHN3aXRjaCAoZS5nLiBvbiBGcmFtZXdvcmsgbGFwdG9wcykgbGVhdmVzXG5cdC8vIGBnZXRVc2VyTWVkaWFgIHN1Y2NlZWRpbmcgd2l0aCBhIHRyYWNrIHdob3NlIGBtdXRlZGAgZmxhZyBpcyBzZXQsIHNvIG5vXG5cdC8vIGFjcXVpc2l0aW9uIGVycm9yIHN1cmZhY2VzLiBUcmFjayB0aGUgbXV0ZSBzdGF0ZSB0byB3YXJuIHRoZSB1c2VyLlxuXHRwcml2YXRlIHJlYWRvbmx5IF9taWNUcmFja0xpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX21pY011dGVkTm90aWZpZWQgPSBmYWxzZTtcblxuXHQvLyAtLS0gRHJhaW4gc3RhdGUgKHBvc3QtcmVsZWFzZSBjb250aW51ZWQgc3RyZWFtaW5nKS4gLS0tXG5cdC8vIERyYWluIGxlbmd0aCBpcyBlbmZvcmNlZCBwcmltYXJpbHkgYnkgY291bnRpbmcgc2FtcGxlcyBzaGlwcGVkXG5cdC8vIHNpbmNlIGBwdHRVcGAgKGltbXVuZSB0byBtYWluLXRocmVhZCBqaXR0ZXIgdGhhdCB3b3VsZCBza2V3IGFcblx0Ly8gcHVyZSB3YWxsLWNsb2NrIHRpbWVyKS4gVGhlIGZhbGxiYWNrIHRpbWVyIGd1YXJkcyBhZ2FpbnN0IHRoZVxuXHQvLyBgb25hdWRpb3Byb2Nlc3NgIGNhbGxiYWNrIGJlaW5nIHRocm90dGxlZCBvciBzdG9wcGluZyBlbnRpcmVseS5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX1BUVF9EUkFJTl9XSU5ET1dfTVMgPSA1MDA7XG5cdHByaXZhdGUgX3B0dERyYWluVGFyZ2V0U2FtcGxlcyA9IDA7XG5cdHByaXZhdGUgX3B0dERyYWluU2FtcGxlc1NlbnQgPSAwO1xuXHRwcml2YXRlIF9wdHREcmFpbkZhbGxiYWNrVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8vIC0tLSBQZXItcHJlc3MgZGlhZ25vc3RpYyBjb3VudGVycyAocmVzZXQgb24gcHR0RG93bikuIC0tLVxuXHQvLyBEaWFnbm9zdGljIHdpbmRvdyBNVVNUIGJlID4gZHJhaW4gd2luZG93IHNvIGFueSBhdWRpbyBzdGlsbFxuXHQvLyBwcm9kdWNlZCBhZnRlciBkcmFpbiBlbmQgaXMgb2JzZXJ2YWJsZSBhcyBgcG9zdFJlbGVhc2VDYWxsYmFja3NgLlxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRElBR19QT1NUX1JFTEVBU0VfV0lORE9XX01TID0gMTAwMDtcblx0cHJpdmF0ZSBfZGlhZ1R1cm5JZCA9ICcnO1xuXHRwcml2YXRlIF9kaWFnUHR0RG93blRzID0gMDtcblx0cHJpdmF0ZSBfZGlhZ1B0dFVwVHMgPSAwO1xuXHRwcml2YXRlIF9kaWFnQ2h1bmtzU2VudCA9IDA7XG5cdHByaXZhdGUgX2RpYWdTYW1wbGVzU2VudCA9IDA7XG5cdHByaXZhdGUgX2RpYWdEcmFpbkZpcmVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2RpYWdEcmFpbkNodW5rcyA9IDA7XG5cdHByaXZhdGUgX2RpYWdEcmFpblNhbXBsZXMgPSAwO1xuXHRwcml2YXRlIF9kaWFnRHJhaW5Ta2lwcGVkQnlNdXRlID0gMDtcblx0cHJpdmF0ZSBfZGlhZ0RyYWluU2tpcHBlZEJ5U3VwcHJlc3Npb24gPSAwO1xuXHRwcml2YXRlIF9kaWFnUG9zdFJlbGVhc2VDYWxsYmFja3MgPSAwO1xuXHRwcml2YXRlIF9kaWFnUG9zdFJlbGVhc2VTYW1wbGVzID0gMDtcblx0cHJpdmF0ZSBfZGlhZ1Bvc3RSZWxlYXNlU2tpcHBlZEJ5TXV0ZSA9IDA7XG5cdHByaXZhdGUgX2RpYWdQb3N0UmVsZWFzZVNraXBwZWRCeVN1cHByZXNzaW9uID0gMDtcblx0cHJpdmF0ZSBfZGlhZ1JlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaWFnUHR0VXBXaXRob3V0Q2FwdHVyZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaWFnRmlyZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblB0dFN0YXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uUHR0U3RhcnQ6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25QdHRTdGFydC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblB0dEF1ZGlvQ2h1bmsgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvblB0dEF1ZGlvQ2h1bms6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vblB0dEF1ZGlvQ2h1bmsuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHRFbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25QdHRFbmQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25QdHRFbmQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHREaWFnbm9zdGljID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVB0dERpYWdub3N0aWM+KCkpO1xuXHRyZWFkb25seSBvblB0dERpYWdub3N0aWM6IEV2ZW50PElQdHREaWFnbm9zdGljPiA9IHRoaXMuX29uUHR0RGlhZ25vc3RpYy5ldmVudDtcblxuXHRnZXQgaXNDYXB0dXJpbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc0NhcHR1cmluZzsgfVxuXHRnZXQgYW5hbHlzZXJOb2RlKCk6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9hbmFseXNlck5vZGU7IH1cblxuXHRnZXQgaXNNdXRlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzTXV0ZWQ7IH1cblx0c2V0IGlzTXV0ZWQodmFsdWU6IGJvb2xlYW4pIHsgdGhpcy5faXNNdXRlZCA9IHZhbHVlOyB9XG5cblx0c3VwcHJlc3NVbnRpbCh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3N1cHByZXNzVW50aWxUcyA9IHRpbWVzdGFtcDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRNZWRpYUNhcHR1cmVXaW5kb3codGFyZ2V0V2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzIHtcblx0XHRyZXR1cm4gZ2V0TWVkaWFDYXB0dXJlV2luZG93KHRhcmdldFdpbmRvdyk7XG5cdH1cblxuXHRwcmVwYXJlKHdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiB2b2lkIHtcblx0XHR0aGlzLl93aW5kb3cgPSB0aGlzLmdldE1lZGlhQ2FwdHVyZVdpbmRvdyh3aW5kb3cpO1xuXHR9XG5cblx0YXN5bmMgcHR0RG93bih0dXJuSWQ6IHN0cmluZywgcGFzc2l2ZTogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3B0dEhlbGQpIHsgcmV0dXJuOyB9XG5cdFx0Y29uc3QgcHR0R2VuZXJhdGlvbiA9ICsrdGhpcy5fcHR0R2VuZXJhdGlvbjtcblx0XHQvLyBJZiBhIHByZXZpb3VzIHByZXNzIGlzIHN0aWxsIGluIGl0cyBkcmFpbiB3aW5kb3csIGZpbmlzaCBpdFxuXHRcdC8vIG5vdzogY2FuY2VsIHRoZSBmYWxsYmFjayB0aW1lciwgbWFyayBzdHJlYW1pbmcgY2xvc2VkLCBmaXJlXG5cdFx0Ly8gYF9vblB0dEVuZGAuIE90aGVyd2lzZSB0aGUgYmFja2VuZCB3b3VsZCBrZWVwIHRoZSBwcmlvciB0dXJuXG5cdFx0Ly8gb3BlbiBhbmQgb3VyIG5ldyB0dXJuIHdvdWxkIHJhY2UgYWdhaW5zdCBpdC5cblx0XHQvL1xuXHRcdC8vIFRoaXMgaXMgYWxzbyBhIHJlcXVpcmVkIG9yZGVyaW5nIGd1YXJhbnRlZTogZmx1c2hpbmcgdGhlXG5cdFx0Ly8gZHJhaW4gKGFuZCBpdHMgYF9vblB0dEVuZGApIGJlZm9yZSB0aGlzIHR1cm4ncyBgX29uUHR0U3RhcnRgXG5cdFx0Ly8gZmlyZXMgYmVsb3cga2VlcHMgdGhlIHdpcmUgb3JkZXIgYHB0dF9lbmRgKHByZXYpIHRoZW5cblx0XHQvLyBgcHR0X3N0YXJ0YChuZXh0KS4gYHB0dF9lbmRgIGNhcnJpZXMgbm8gdHVybl9pZCwgc28gdGhlIGJhY2tlbmRcblx0XHQvLyByZWxpZXMgb24gdGhhdCBvcmRlciB0byBlbmQgdGhlIGNvcnJlY3QgdHVybiBhbmQgbmV2ZXIgdGhlXG5cdFx0Ly8gZnJlc2hseSBvcGVuZWQgb25lLiBLZWVwIGBfZmluaXNoRHJhaW4oKWAgYWhlYWQgb2YgZXZlcnlcblx0XHQvLyBgX29uUHR0U3RhcnQuZmlyZSgpYCBwYXRoIGlmIHRoaXMgbWV0aG9kIGlzIHJlZmFjdG9yZWQuXG5cdFx0dGhpcy5fZmluaXNoRHJhaW4oKTtcblx0XHQvLyBJZiBhIHByZXZpb3VzIHByZXNzJ3MgZGlhZ25vc3RpYyBoYXNuJ3QgZmlyZWQgeWV0IChiYWNrLXRvLWJhY2tcblx0XHQvLyBwcmVzc2VzIGluc2lkZSB0aGUgZGlhZ25vc3RpYyB3aW5kb3cpLCBlbWl0IGl0IG5vdyBzbyBpdFxuXHRcdC8vIGlzbid0IG92ZXJ3cml0dGVuIGJ5IHRoaXMgcHJlc3MncyByZXNldC5cblx0XHR0aGlzLl9mbHVzaFBlbmRpbmdEaWFnbm9zdGljKCk7XG5cdFx0dGhpcy5fcmVzZXREaWFnbm9zdGljQ291bnRlcnModHVybklkKTtcblx0XHR0aGlzLl9wdHRIZWxkID0gdHJ1ZTtcblx0XHR0aGlzLl9wdHRTdHJlYW1pbmcgPSB0cnVlO1xuXHRcdHRoaXMuX3B0dFJlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2lzTXV0ZWQgPSBmYWxzZTtcblxuXHRcdGlmICh0aGlzLl9pc0NhcHR1cmluZykge1xuXHRcdFx0dGhpcy5fb25QdHRTdGFydC5maXJlKHBhc3NpdmUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3dpbmRvdykgeyByZXR1cm47IH1cblx0XHRpZiAodGhpcy5fcHR0QWNxdWlyaW5nKSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5fcHR0QWNxdWlyaW5nID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5zdGFydENhcHR1cmUodGhpcy5fd2luZG93KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChwdHRHZW5lcmF0aW9uICE9PSB0aGlzLl9wdHRHZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3B0dEhlbGQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3B0dFN0cmVhbWluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fcHR0UmVsZWFzZWREdXJpbmdBY3F1aXJlID0gZmFsc2U7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChwdHRHZW5lcmF0aW9uID09PSB0aGlzLl9wdHRHZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3B0dEFjcXVpcmluZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocHR0R2VuZXJhdGlvbiAhPT0gdGhpcy5fcHR0R2VuZXJhdGlvbiB8fCAhdGhpcy5faXNDYXB0dXJpbmcgfHwgIXRoaXMuX3B0dEhlbGQpIHtcblx0XHRcdHRoaXMuX3B0dFJlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vblB0dFN0YXJ0LmZpcmUocGFzc2l2ZSk7XG5cblx0XHRpZiAodGhpcy5fcHR0UmVsZWFzZWREdXJpbmdBY3F1aXJlKSB7XG5cdFx0XHR0aGlzLl9wdHRSZWxlYXNlZER1cmluZ0FjcXVpcmUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3B0dFN0cmVhbWluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fZGlhZ1JlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IHRydWU7XG5cdFx0XHR0aGlzLl9vblB0dEVuZC5maXJlKCk7XG5cdFx0XHR0aGlzLnN0b3BDYXB0dXJlKCk7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZURpYWdub3N0aWNGaXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHR0VXAoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9wdHRIZWxkKSB7IHJldHVybjsgfVxuXG5cdFx0aWYgKHRoaXMuX3B0dEFjcXVpcmluZykge1xuXHRcdFx0dGhpcy5fcHR0UmVsZWFzZWREdXJpbmdBY3F1aXJlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2RpYWdSZWxlYXNlZER1cmluZ0FjcXVpcmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZGlhZ1B0dFVwVHMgPSBEYXRlLm5vdygpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVEaWFnbm9zdGljRmlyZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faXNDYXB0dXJpbmcpIHtcblx0XHRcdHRoaXMuX3B0dEhlbGQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3B0dFN0cmVhbWluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fZGlhZ1B0dFVwV2l0aG91dENhcHR1cmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZGlhZ1B0dFVwVHMgPSBEYXRlLm5vdygpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVEaWFnbm9zdGljRmlyZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3B0dEhlbGQgPSBmYWxzZTtcblx0XHR0aGlzLl9kaWFnUHR0VXBUcyA9IERhdGUubm93KCk7XG5cdFx0Ly8gU3RhcnQgZHJhaW46IGtlZXAgYF9wdHRTdHJlYW1pbmdgIHRydWUgc28gc3Vic2VxdWVudFxuXHRcdC8vIGBvbmF1ZGlvcHJvY2Vzc2AgY2FsbGJhY2tzIGNvbnRpbnVlIHRvIHNoaXAgYXVkaW8uIEVuZCB0aGVcblx0XHQvLyBkcmFpbiBvbmNlIHdlJ3ZlIHNoaXBwZWQgYSBmdWxsIHdpbmRvdyBvZiBzYW1wbGVzLCBPUiBhZnRlclxuXHRcdC8vIHRoZSBmYWxsYmFjayB0aW1lciB0cmlwcyBpZiBgb25hdWRpb3Byb2Nlc3NgIHN0b3BzIGZpcmluZy5cblx0XHRjb25zdCBzYW1wbGVSYXRlID0gdGhpcy5fbWljQ3R4Py5zYW1wbGVSYXRlID8/IDE2MDAwO1xuXHRcdHRoaXMuX3B0dERyYWluVGFyZ2V0U2FtcGxlcyA9IE1hdGguY2VpbChcblx0XHRcdHNhbXBsZVJhdGUgKiBNaWNDYXB0dXJlU2VydmljZS5fUFRUX0RSQUlOX1dJTkRPV19NUyAvIDEwMDBcblx0XHQpO1xuXHRcdHRoaXMuX3B0dERyYWluU2FtcGxlc1NlbnQgPSAwO1xuXHRcdHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fZmluaXNoRHJhaW4oKTtcblx0XHR9LCBNaWNDYXB0dXJlU2VydmljZS5fUFRUX0RSQUlOX1dJTkRPV19NUyArIDI1MCk7XG5cdFx0dGhpcy5fc2NoZWR1bGVEaWFnbm9zdGljRmlyZSgpO1xuXHR9XG5cblx0YWJvcnRQdHQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9wdHRIZWxkICYmICF0aGlzLl9wdHRTdHJlYW1pbmcpIHsgcmV0dXJuOyB9XG5cdFx0Ly8gQ2FuY2VsIGFueSBpbi1mbGlnaHQgZHJhaW4gYW5kIHN0b3Agc3RyZWFtaW5nIGltbWVkaWF0ZWx5LiBVbmxpa2Vcblx0XHQvLyBgcHR0VXAoKWAgdGhpcyBydW5zIE5PIHBvc3QtcmVsZWFzZSBkcmFpbiBhbmQgZmlyZXMgTk8gYF9vblB0dEVuZGA6XG5cdFx0Ly8gdGhlIGJhY2tlbmQgYWxyZWFkeSBlbmRlZCB0aGUgdHVybiwgc28gd2UgbXVzdCBub3Qgc2hpcCBtb3JlIGF1ZGlvXG5cdFx0Ly8gZm9yIGl0IG5vciBlbWl0IG91ciBvd24gcHR0X2VuZC4gVGhlIG1pYy9BdWRpb0NvbnRleHQgc3RheXMgd2FybSBmb3Jcblx0XHQvLyB0aGUgbmV4dCBwcmVzcy5cblx0XHRpZiAodGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyKTtcblx0XHRcdHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fcHR0RHJhaW5UYXJnZXRTYW1wbGVzID0gMDtcblx0XHR0aGlzLl9wdHREcmFpblNhbXBsZXNTZW50ID0gMDtcblx0XHR0aGlzLl9wdHRHZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5fcHR0QWNxdWlyaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fcHR0SGVsZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3B0dFN0cmVhbWluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3B0dFJlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXHRcdC8vIFN0aWxsIGVtaXQgdGhlIHBlci1wcmVzcyBkaWFnbm9zdGljIChrZXllZCBieSB0dXJuSWQpLCBtYXRjaGluZyBwdHRVcC5cblx0XHR0aGlzLl9kaWFnUHR0VXBUcyA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fc2NoZWR1bGVEaWFnbm9zdGljRmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgc3RhcnRDYXB0dXJlKHdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjYXB0dXJlV2luZG93ID0gdGhpcy5nZXRNZWRpYUNhcHR1cmVXaW5kb3cod2luZG93KTtcblx0XHR0aGlzLl93aW5kb3cgPSBjYXB0dXJlV2luZG93O1xuXHRcdGlmICh0aGlzLl9pc0NhcHR1cmluZykgeyByZXR1cm47IH1cblx0XHRpZiAodGhpcy5fY2FwdHVyZVByb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYXB0dXJlUHJvbWlzZTtcblx0XHR9XG5cdFx0Y29uc3QgY2FwdHVyZVByb21pc2UgPSB0aGlzLl9zdGFydENhcHR1cmUoY2FwdHVyZVdpbmRvdyk7XG5cdFx0dGhpcy5fY2FwdHVyZVByb21pc2UgPSBjYXB0dXJlUHJvbWlzZTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY2FwdHVyZVByb21pc2U7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0aGlzLl9jYXB0dXJlUHJvbWlzZSA9PT0gY2FwdHVyZVByb21pc2UpIHtcblx0XHRcdFx0dGhpcy5fY2FwdHVyZVByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnRDYXB0dXJlKHdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjYXB0dXJlR2VuZXJhdGlvbiA9IHRoaXMuX2NhcHR1cmVHZW5lcmF0aW9uO1xuXHRcdGNvbnN0IGRldmljZUlkID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5NaWNyb3Bob25lRGV2aWNlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGNvbnN0IGF1ZGlvQ29uc3RyYWludHM6IE1lZGlhVHJhY2tDb25zdHJhaW50cyA9IHtcblx0XHRcdGNoYW5uZWxDb3VudDogMSxcblx0XHRcdHNhbXBsZVJhdGU6IDE2MDAwLFxuXHRcdFx0ZWNob0NhbmNlbGxhdGlvbjogdHJ1ZSxcblx0XHRcdG5vaXNlU3VwcHJlc3Npb246IHRydWUsXG5cdFx0fTtcblx0XHRpZiAoZGV2aWNlSWQpIHtcblx0XHRcdGF1ZGlvQ29uc3RyYWludHMuZGV2aWNlSWQgPSB7IGV4YWN0OiBkZXZpY2VJZCB9O1xuXHRcdH1cblxuXHRcdGxldCBtaWNTdHJlYW06IE1lZGlhU3RyZWFtO1xuXHRcdHRyeSB7XG5cdFx0XHRtaWNTdHJlYW0gPSBhd2FpdCB3aW5kb3cubmF2aWdhdG9yLm1lZGlhRGV2aWNlcy5nZXRVc2VyTWVkaWEoe1xuXHRcdFx0XHRhdWRpbzogYXVkaW9Db25zdHJhaW50cyxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gSWYgdGhlIHN0b3JlZCBkZXZpY2UgaXMgdW5hdmFpbGFibGUgKHVucGx1Z2dlZC9zdGFsZSBJRCksIGZhbGwgYmFja1xuXHRcdFx0Ly8gdG8gc3lzdGVtIGRlZmF1bHQuIE9ubHkgcmV0cnkgb24gZGV2aWNlLXNwZWNpZmljIGVycm9ycy5cblx0XHRcdGNvbnN0IGlzRGV2aWNlRXJyb3IgPSBkZXZpY2VJZCAmJiBlcnIgaW5zdGFuY2VvZiBET01FeGNlcHRpb24gJiZcblx0XHRcdFx0KGVyci5uYW1lID09PSAnT3ZlcmNvbnN0cmFpbmVkRXJyb3InIHx8IGVyci5uYW1lID09PSAnTm90Rm91bmRFcnJvcicpO1xuXHRcdFx0aWYgKGlzRGV2aWNlRXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFttaWNdIFByZWZlcnJlZCBkZXZpY2UgJHtkZXZpY2VJZC5zbGljZSgwLCA4KX1cdTIwMjYgdW5hdmFpbGFibGUsIGZhbGxpbmcgYmFjayB0byBkZWZhdWx0YCk7XG5cdFx0XHRcdGRlbGV0ZSBhdWRpb0NvbnN0cmFpbnRzLmRldmljZUlkO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdG1pY1N0cmVhbSA9IGF3YWl0IHdpbmRvdy5uYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldFVzZXJNZWRpYSh7XG5cdFx0XHRcdFx0XHRhdWRpbzogYXVkaW9Db25zdHJhaW50cyxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBjYXRjaCAocmV0cnlFcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9ub3RpZnlNaWNQZXJtaXNzaW9uRGVuaWVkKHJldHJ5RXJyKTtcblx0XHRcdFx0XHR0aHJvdyByZXRyeUVycjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbm90aWZ5TWljUGVybWlzc2lvbkRlbmllZChlcnIpO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjYXB0dXJlR2VuZXJhdGlvbiAhPT0gdGhpcy5fY2FwdHVyZUdlbmVyYXRpb24pIHtcblx0XHRcdG1pY1N0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKHRyYWNrID0+IHRyYWNrLnN0b3AoKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21pY1N0cmVhbSA9IG1pY1N0cmVhbTtcblxuXHRcdGNvbnN0IGNsZWFudXBGYWlsZWRDYXB0dXJlID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX21pY1N0cmVhbSA9PT0gbWljU3RyZWFtKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3BDYXB0dXJlUmVzb3VyY2VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtaWNTdHJlYW0uZ2V0VHJhY2tzKCkuZm9yRWFjaCh0cmFjayA9PiB0cmFjay5zdG9wKCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgY3R4OiBBdWRpb0NvbnRleHQ7XG5cdFx0bGV0IHNvdXJjZTogTWVkaWFTdHJlYW1BdWRpb1NvdXJjZU5vZGU7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIERldGVjdCBhIGhhcmR3YXJlLW11dGVkIG1pY3JvcGhvbmUgKGUuZy4gYSBwaHlzaWNhbCBraWxsIHN3aXRjaCkuXG5cdFx0XHQvLyBgZ2V0VXNlck1lZGlhYCBzdWNjZWVkcyBpbiB0aGlzIGNhc2UgYnV0IHRoZSB0cmFjayBwcm9kdWNlcyBzaWxlbmNlLFxuXHRcdFx0Ly8gc28gd2l0aG91dCB0aGlzIGNoZWNrIFBUVCB3b3VsZCBhcHBlYXIgdG8gd29yayB3aGlsZSBjYXB0dXJpbmcgbm90aGluZy5cblx0XHRcdHRoaXMuX21pY1RyYWNrTGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9taWNNdXRlZE5vdGlmaWVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBhdWRpb1RyYWNrID0gbWljU3RyZWFtLmdldEF1ZGlvVHJhY2tzKClbMF07XG5cdFx0XHRpZiAoYXVkaW9UcmFjaykge1xuXHRcdFx0XHRpZiAoYXVkaW9UcmFjay5tdXRlZCkge1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmeU1pY3JvcGhvbmVNdXRlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX21pY1RyYWNrTGlzdGVuZXJzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYXVkaW9UcmFjaywgJ211dGUnLCAoKSA9PiB0aGlzLl9ub3RpZnlNaWNyb3Bob25lTXV0ZWQoKSkpO1xuXHRcdFx0XHR0aGlzLl9taWNUcmFja0xpc3RlbmVycy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGF1ZGlvVHJhY2ssICd1bm11dGUnLCAoKSA9PiB7IHRoaXMuX21pY011dGVkTm90aWZpZWQgPSBmYWxzZTsgfSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX21pY0N0eCkge1xuXHRcdFx0XHR0aGlzLl9taWNDdHggPSBuZXcgd2luZG93LkF1ZGlvQ29udGV4dCh7IHNhbXBsZVJhdGU6IDE2MDAwIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y3R4ID0gdGhpcy5fbWljQ3R4O1xuXHRcdFx0c291cmNlID0gY3R4LmNyZWF0ZU1lZGlhU3RyZWFtU291cmNlKG1pY1N0cmVhbSk7XG5cblx0XHRcdGNvbnN0IGFuYWx5c2VyID0gY3R4LmNyZWF0ZUFuYWx5c2VyKCk7XG5cdFx0XHRhbmFseXNlci5mZnRTaXplID0gMjU2O1xuXHRcdFx0c291cmNlLmNvbm5lY3QoYW5hbHlzZXIpO1xuXHRcdFx0dGhpcy5fYW5hbHlzZXJOb2RlID0gYW5hbHlzZXI7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjbGVhbnVwRmFpbGVkQ2FwdHVyZSgpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhcHR1cmVOb2RlUHJvbWlzZSA9IGNyZWF0ZVBjbUNhcHR1cmVOb2RlKHdpbmRvdywgY3R4LCBNSUNfQ0FQVFVSRV9DSFVOS19TSVpFLCBzYW1wbGVzID0+IHtcblx0XHRcdGNvbnN0IG5vd1RzID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHB0VXBUcyA9IHRoaXMuX2RpYWdQdHRVcFRzO1xuXHRcdFx0Ly8gQSBjYWxsYmFjayBpcyBhIFwiZHJhaW5cIiBjYWxsYmFjayB3aGlsZSB3ZSdyZSBzdGlsbCBpbiB0aGVcblx0XHRcdC8vIGRyYWluIHdpbmRvdyBhZnRlciByZWxlYXNlOiBfcHR0U3RyZWFtaW5nIGlzIHRydWUgKGRyYWluXG5cdFx0XHQvLyBoYXNuJ3QgZmluaXNoZWQpIEFORCBfcHR0SGVsZCBpcyBmYWxzZSAodXNlciByZWxlYXNlZCkuXG5cdFx0XHRjb25zdCBpc0RyYWluQ2FsbGJhY2sgPSB0aGlzLl9wdHRTdHJlYW1pbmcgJiYgIXRoaXMuX3B0dEhlbGQ7XG5cdFx0XHQvLyBBIGNhbGxiYWNrIGlzIFwicG9zdC1yZWxlYXNlXCIgb25jZSBkcmFpbiBoYXMgZmluaXNoZWRcblx0XHRcdC8vIChfcHR0U3RyZWFtaW5nIGZsaXBwZWQgdG8gZmFsc2UgaW4gX2ZpbmlzaERyYWluKSBidXQgd2UncmVcblx0XHRcdC8vIHN0aWxsIGluc2lkZSB0aGUgd2lkZXIgZGlhZ25vc3RpYyB3aW5kb3cuIEF1ZGlvIGluIHRoaXNcblx0XHRcdC8vIHdpbmRvdyBpcyBjdXJyZW50bHkgRFJPUFBFRDsgdGhlIGNvdW50IGlzIG91ciBzaWduYWwgdGhhdFxuXHRcdFx0Ly8gdGhlIGRyYWluIHdpbmRvdyBpcyB0b28gc2hvcnQuXG5cdFx0XHRjb25zdCBpbkRpYWdXaW5kb3cgPVxuXHRcdFx0XHRwdFVwVHMgPiAwICYmXG5cdFx0XHRcdCF0aGlzLl9wdHRIZWxkICYmXG5cdFx0XHRcdG5vd1RzIDw9IHB0VXBUcyArIE1pY0NhcHR1cmVTZXJ2aWNlLl9ESUFHX1BPU1RfUkVMRUFTRV9XSU5ET1dfTVM7XG5cdFx0XHRjb25zdCBpc1Bvc3RSZWxlYXNlQ2FsbGJhY2sgPSAhdGhpcy5fcHR0U3RyZWFtaW5nICYmIGluRGlhZ1dpbmRvdztcblxuXHRcdFx0aWYgKHRoaXMuX2lzTXV0ZWQpIHtcblx0XHRcdFx0aWYgKGlzRHJhaW5DYWxsYmFjaykgeyB0aGlzLl9kaWFnRHJhaW5Ta2lwcGVkQnlNdXRlKys7IH1cblx0XHRcdFx0aWYgKGlzUG9zdFJlbGVhc2VDYWxsYmFjaykgeyB0aGlzLl9kaWFnUG9zdFJlbGVhc2VTa2lwcGVkQnlNdXRlKys7IH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobm93VHMgPCB0aGlzLl9zdXBwcmVzc1VudGlsVHMpIHtcblx0XHRcdFx0aWYgKGlzRHJhaW5DYWxsYmFjaykgeyB0aGlzLl9kaWFnRHJhaW5Ta2lwcGVkQnlTdXBwcmVzc2lvbisrOyB9XG5cdFx0XHRcdGlmIChpc1Bvc3RSZWxlYXNlQ2FsbGJhY2spIHsgdGhpcy5fZGlhZ1Bvc3RSZWxlYXNlU2tpcHBlZEJ5U3VwcHJlc3Npb24rKzsgfVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fcHR0U3RyZWFtaW5nKSB7XG5cdFx0XHRcdGlmIChpc1Bvc3RSZWxlYXNlQ2FsbGJhY2spIHtcblx0XHRcdFx0XHR0aGlzLl9kaWFnUG9zdFJlbGVhc2VDYWxsYmFja3MrKztcblx0XHRcdFx0XHR0aGlzLl9kaWFnUG9zdFJlbGVhc2VTYW1wbGVzICs9IHNhbXBsZXMubGVuZ3RoO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYjY0ID0gZW5jb2RlUmF3UGNtMTZCYXNlNjQoc2FtcGxlcywgdGhpcy5fd2luZG93ISk7XG5cdFx0XHR0aGlzLl9kaWFnQ2h1bmtzU2VudCsrO1xuXHRcdFx0dGhpcy5fZGlhZ1NhbXBsZXNTZW50ICs9IHNhbXBsZXMubGVuZ3RoO1xuXHRcdFx0aWYgKGlzRHJhaW5DYWxsYmFjaykge1xuXHRcdFx0XHR0aGlzLl9kaWFnRHJhaW5GaXJlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2RpYWdEcmFpbkNodW5rcysrO1xuXHRcdFx0XHR0aGlzLl9kaWFnRHJhaW5TYW1wbGVzICs9IHNhbXBsZXMubGVuZ3RoO1xuXHRcdFx0XHR0aGlzLl9wdHREcmFpblNhbXBsZXNTZW50ICs9IHNhbXBsZXMubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25QdHRBdWRpb0NodW5rLmZpcmUoYjY0KTtcblxuXHRcdFx0Ly8gRW5kIHRoZSBkcmFpbiBhcyBzb29uIGFzIHdlJ3ZlIHNoaXBwZWQgYSBmdWxsIHdpbmRvdyBvZlxuXHRcdFx0Ly8gYXVkaW8uIERvaW5nIHRoaXMgQUZURVIgZmlyaW5nIHRoZSBjaHVuayBndWFyYW50ZWVzIHRoZVxuXHRcdFx0Ly8gZmluYWwgZHJhaW4gY2h1bmsgcmVhY2hlcyB0aGUgYmFja2VuZCBiZWZvcmUgYF9vblB0dEVuZGAuXG5cdFx0XHRpZiAoaXNEcmFpbkNhbGxiYWNrICYmIHRoaXMuX3B0dERyYWluU2FtcGxlc1NlbnQgPj0gdGhpcy5fcHR0RHJhaW5UYXJnZXRTYW1wbGVzKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaERyYWluKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgbm9kZTogQXVkaW9Xb3JrbGV0Tm9kZTtcblx0XHR0cnkge1xuXHRcdFx0bm9kZSA9IChhd2FpdCBjYXB0dXJlTm9kZVByb21pc2UpLm5vZGU7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjbGVhbnVwRmFpbGVkQ2FwdHVyZSgpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdC8vIHN0b3BDYXB0dXJlKCkgbWF5IGhhdmUgcnVuIHdoaWxlIHRoZSB3b3JrbGV0IG1vZHVsZSB3YXMgbG9hZGluZy5cblx0XHRpZiAodGhpcy5fbWljQ3R4ICE9PSBjdHgpIHtcblx0XHRcdHRyeSB7IG5vZGUuZGlzY29ubmVjdCgpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fd29ya2xldE5vZGUgPSBub2RlO1xuXHRcdFx0c291cmNlLmNvbm5lY3Qobm9kZSk7XG5cdFx0XHRub2RlLmNvbm5lY3QoY3R4LmRlc3RpbmF0aW9uKTtcblx0XHRcdHRoaXMuX2lzQ2FwdHVyaW5nID0gdHJ1ZTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNsZWFudXBGYWlsZWRDYXB0dXJlKCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbm90aWZ5TWljUGVybWlzc2lvbkRlbmllZChlcnI6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAoaXNNaWNyb3Bob25lUGVybWlzc2lvbkRlbmllZEVycm9yKGVycikpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtaWMucGVybWlzc2lvbkRlbmllZCcsIFwiTWljcm9waG9uZSBhY2Nlc3Mgd2FzIGRlbmllZC4gR3JhbnQgbWljcm9waG9uZSBwZXJtaXNzaW9uIGluIHlvdXIgc3lzdGVtIHNldHRpbmdzIHRvIHVzZSBWb2ljZSBNb2RlLlwiKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX25vdGlmeU1pY3JvcGhvbmVNdXRlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbWljTXV0ZWROb3RpZmllZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9taWNNdXRlZE5vdGlmaWVkID0gdHJ1ZTtcblx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW21pY10gTWljcm9waG9uZSB0cmFjayBpcyBtdXRlZCBcdTIwMTQgbGlrZWx5IGEgaGFyZHdhcmUgbXV0ZSBzd2l0Y2ggaXMgZW5hYmxlZCcpO1xuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbWljLmhhcmR3YXJlTXV0ZWQnLCBcIllvdXIgbWljcm9waG9uZSBhcHBlYXJzIHRvIGJlIG11dGVkIG9yIGRpc2FibGVkLCBwb3NzaWJseSBieSBhIGhhcmR3YXJlIHN3aXRjaC4gVm9pY2UgTW9kZSB3b24ndCBoZWFyIHlvdSB1bnRpbCBpdCdzIHJlLWVuYWJsZWQuXCIpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcENhcHR1cmVSZXNvdXJjZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FwdHVyZUdlbmVyYXRpb24rKztcblx0XHR0aGlzLl9jYXB0dXJlUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fd29ya2xldE5vZGUpIHtcblx0XHRcdHRoaXMuX3dvcmtsZXROb2RlLnBvcnQub25tZXNzYWdlID0gbnVsbDtcblx0XHRcdHRyeSB7IHRoaXMuX3dvcmtsZXROb2RlLmRpc2Nvbm5lY3QoKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR0aGlzLl93b3JrbGV0Tm9kZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fYW5hbHlzZXJOb2RlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX21pY0N0eD8uY2xvc2UoKTtcblx0XHR0aGlzLl9taWNDdHggPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX21pY1N0cmVhbSkge1xuXHRcdFx0dGhpcy5fbWljU3RyZWFtLmdldFRyYWNrcygpLmZvckVhY2godCA9PiB0LnN0b3AoKSk7XG5cdFx0XHR0aGlzLl9taWNTdHJlYW0gPSBudWxsO1xuXHRcdH1cblx0XHR0aGlzLl9taWNUcmFja0xpc3RlbmVycy5jbGVhcigpO1xuXHRcdHRoaXMuX21pY011dGVkTm90aWZpZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9pc0NhcHR1cmluZyA9IGZhbHNlO1xuXHR9XG5cblx0c3RvcENhcHR1cmUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcENhcHR1cmVSZXNvdXJjZXMoKTtcblx0XHR0aGlzLl9wdHRHZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5fcHR0QWNxdWlyaW5nID0gZmFsc2U7XG5cdFx0Ly8gQ2FuY2VsIGFueSBpbi1mbGlnaHQgZHJhaW47IGRvIE5PVCBmaXJlIGBfb25QdHRFbmRgIGhlcmVcblx0XHQvLyBiZWNhdXNlIGNhbGxlcnMgKHJlY29ubmVjdCAvIGRpc2Nvbm5lY3QgLyBkaXNwb3NlKSBoYXZlXG5cdFx0Ly8gYWxyZWFkeSB0b3JuIGRvd24gb3IgYXJlIGFib3V0IHRvIHRlYXIgZG93biB0aGUgYmFja2VuZFxuXHRcdC8vIGNvbm5lY3Rpb24uXG5cdFx0aWYgKHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lcik7XG5cdFx0XHR0aGlzLl9wdHREcmFpbkZhbGxiYWNrVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3B0dERyYWluVGFyZ2V0U2FtcGxlcyA9IDA7XG5cdFx0dGhpcy5fcHR0RHJhaW5TYW1wbGVzU2VudCA9IDA7XG5cdFx0dGhpcy5fcHR0SGVsZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3B0dFN0cmVhbWluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3B0dFJlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlhZ0ZpcmVUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2RpYWdGaXJlVGltZXIpO1xuXHRcdFx0dGhpcy5fZGlhZ0ZpcmVUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lcik7XG5cdFx0XHR0aGlzLl9wdHREcmFpbkZhbGxiYWNrVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuc3RvcENhcHR1cmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogRW5kIHRoZSBwb3N0LXJlbGVhc2UgZHJhaW4gcGhhc2U6IHN0b3AgYWNjZXB0aW5nIG1vcmUgYXVkaW8gZm9yXG5cdCAqIHRoaXMgdHVybiBhbmQgZmlyZSBgX29uUHR0RW5kYC4gSWRlbXBvdGVudC4gU2FmZSB0byBjYWxsIHdoZW4gbm9cblx0ICogZHJhaW4gaXMgaW4gcHJvZ3Jlc3MuXG5cdCAqL1xuXHRwcml2YXRlIF9maW5pc2hEcmFpbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyKTtcblx0XHRcdHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fcHR0RHJhaW5UYXJnZXRTYW1wbGVzID0gMDtcblx0XHR0aGlzLl9wdHREcmFpblNhbXBsZXNTZW50ID0gMDtcblx0XHRpZiAodGhpcy5fcHR0U3RyZWFtaW5nICYmICF0aGlzLl9wdHRIZWxkKSB7XG5cdFx0XHR0aGlzLl9wdHRTdHJlYW1pbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uUHR0RW5kLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldERpYWdub3N0aWNDb3VudGVycyh0dXJuSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2RpYWdUdXJuSWQgPSB0dXJuSWQ7XG5cdFx0dGhpcy5fZGlhZ1B0dERvd25UcyA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fZGlhZ1B0dFVwVHMgPSAwO1xuXHRcdHRoaXMuX2RpYWdDaHVua3NTZW50ID0gMDtcblx0XHR0aGlzLl9kaWFnU2FtcGxlc1NlbnQgPSAwO1xuXHRcdHRoaXMuX2RpYWdEcmFpbkZpcmVkID0gZmFsc2U7XG5cdFx0dGhpcy5fZGlhZ0RyYWluQ2h1bmtzID0gMDtcblx0XHR0aGlzLl9kaWFnRHJhaW5TYW1wbGVzID0gMDtcblx0XHR0aGlzLl9kaWFnRHJhaW5Ta2lwcGVkQnlNdXRlID0gMDtcblx0XHR0aGlzLl9kaWFnRHJhaW5Ta2lwcGVkQnlTdXBwcmVzc2lvbiA9IDA7XG5cdFx0dGhpcy5fZGlhZ1Bvc3RSZWxlYXNlQ2FsbGJhY2tzID0gMDtcblx0XHR0aGlzLl9kaWFnUG9zdFJlbGVhc2VTYW1wbGVzID0gMDtcblx0XHR0aGlzLl9kaWFnUG9zdFJlbGVhc2VTa2lwcGVkQnlNdXRlID0gMDtcblx0XHR0aGlzLl9kaWFnUG9zdFJlbGVhc2VTa2lwcGVkQnlTdXBwcmVzc2lvbiA9IDA7XG5cdFx0dGhpcy5fZGlhZ1JlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2RpYWdQdHRVcFdpdGhvdXRDYXB0dXJlID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZURpYWdub3N0aWNGaXJlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaWFnRmlyZVRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fZGlhZ0ZpcmVUaW1lcik7XG5cdFx0XHR0aGlzLl9kaWFnRmlyZVRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9kaWFnRmlyZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kaWFnRmlyZVRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fZW1pdERpYWdub3N0aWMoKTtcblx0XHR9LCBNaWNDYXB0dXJlU2VydmljZS5fRElBR19QT1NUX1JFTEVBU0VfV0lORE9XX01TKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZsdXNoUGVuZGluZ0RpYWdub3N0aWMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RpYWdGaXJlVGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9kaWFnRmlyZVRpbWVyKTtcblx0XHRcdHRoaXMuX2RpYWdGaXJlVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9lbWl0RGlhZ25vc3RpYygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2VtaXREaWFnbm9zdGljKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZGlhZ1R1cm5JZCAmJiB0aGlzLl9kaWFnUHR0RG93blRzID09PSAwKSB7IHJldHVybjsgfVxuXHRcdGNvbnN0IG1zSGVsZCA9IHRoaXMuX2RpYWdQdHRVcFRzID4gMCA/IHRoaXMuX2RpYWdQdHRVcFRzIC0gdGhpcy5fZGlhZ1B0dERvd25UcyA6IDA7XG5cdFx0dGhpcy5fb25QdHREaWFnbm9zdGljLmZpcmUoe1xuXHRcdFx0dHVybklkOiB0aGlzLl9kaWFnVHVybklkLFxuXHRcdFx0bXNIZWxkLFxuXHRcdFx0Y2h1bmtzU2VudDogdGhpcy5fZGlhZ0NodW5rc1NlbnQsXG5cdFx0XHRzYW1wbGVzU2VudDogdGhpcy5fZGlhZ1NhbXBsZXNTZW50LFxuXHRcdFx0ZHJhaW5GaXJlZDogdGhpcy5fZGlhZ0RyYWluRmlyZWQsXG5cdFx0XHRkcmFpbkNodW5rczogdGhpcy5fZGlhZ0RyYWluQ2h1bmtzLFxuXHRcdFx0ZHJhaW5TYW1wbGVzOiB0aGlzLl9kaWFnRHJhaW5TYW1wbGVzLFxuXHRcdFx0ZHJhaW5XaW5kb3dNczogTWljQ2FwdHVyZVNlcnZpY2UuX1BUVF9EUkFJTl9XSU5ET1dfTVMsXG5cdFx0XHRkcmFpblNraXBwZWRCeU11dGU6IHRoaXMuX2RpYWdEcmFpblNraXBwZWRCeU11dGUsXG5cdFx0XHRkcmFpblNraXBwZWRCeVN1cHByZXNzaW9uOiB0aGlzLl9kaWFnRHJhaW5Ta2lwcGVkQnlTdXBwcmVzc2lvbixcblx0XHRcdHBvc3RSZWxlYXNlQ2FsbGJhY2tzOiB0aGlzLl9kaWFnUG9zdFJlbGVhc2VDYWxsYmFja3MsXG5cdFx0XHRwb3N0UmVsZWFzZVNhbXBsZXM6IHRoaXMuX2RpYWdQb3N0UmVsZWFzZVNhbXBsZXMsXG5cdFx0XHRwb3N0UmVsZWFzZVNraXBwZWRCeU11dGU6IHRoaXMuX2RpYWdQb3N0UmVsZWFzZVNraXBwZWRCeU11dGUsXG5cdFx0XHRwb3N0UmVsZWFzZVNraXBwZWRCeVN1cHByZXNzaW9uOiB0aGlzLl9kaWFnUG9zdFJlbGVhc2VTa2lwcGVkQnlTdXBwcmVzc2lvbixcblx0XHRcdHBvc3RSZWxlYXNlV2luZG93TXM6IE1pY0NhcHR1cmVTZXJ2aWNlLl9ESUFHX1BPU1RfUkVMRUFTRV9XSU5ET1dfTVMsXG5cdFx0XHRyZWxlYXNlZER1cmluZ0FjcXVpcmU6IHRoaXMuX2RpYWdSZWxlYXNlZER1cmluZ0FjcXVpcmUsXG5cdFx0XHRwdHRVcFdpdGhvdXRDYXB0dXJlOiB0aGlzLl9kaWFnUHR0VXBXaXRob3V0Q2FwdHVyZSxcblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIEVuY29kZSBQQ00gRmxvYXQzMiBzYW1wbGVzIGludG8gYmFzZTY0LWVuY29kZWQgcmF3IFBDTTE2IChubyBXQVYgaGVhZGVyKS5cbiAqL1xuZnVuY3Rpb24gZW5jb2RlUmF3UGNtMTZCYXNlNjQoc2FtcGxlczogRmxvYXQzMkFycmF5LCB3aW46IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzKTogc3RyaW5nIHtcblx0Y29uc3QgYnVmID0gbmV3IEFycmF5QnVmZmVyKHNhbXBsZXMubGVuZ3RoICogMik7XG5cdGNvbnN0IHZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzYW1wbGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgcyA9IE1hdGgubWF4KC0xLCBNYXRoLm1pbigxLCBzYW1wbGVzW2ldKSk7XG5cdFx0dmlldy5zZXRJbnQxNihpICogMiwgcyA8IDAgPyBzICogMHg4MDAwIDogcyAqIDB4N0ZGRiwgdHJ1ZSk7XG5cdH1cblx0Y29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShidWYpO1xuXHRsZXQgYmluYXJ5U3RyID0gJyc7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRiaW5hcnlTdHIgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSk7XG5cdH1cblx0cmV0dXJuIHdpbi5idG9hKGJpbmFyeVN0cik7XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElNaWNDYXB0dXJlU2VydmljZSwgTWljQ2FwdHVyZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQkFBa0I7QUFFcEIsTUFBTSxxQkFBcUIsZ0JBQW9DLG1CQUFtQjtBQUVsRixTQUFTLHNCQUFzQixjQUFzRTtBQUMzRyxTQUFPLGlCQUFpQixhQUFhLGVBQWU7QUFDckQ7QUFHTyxNQUFNLHlCQUF5QjtBQUUvQixTQUFTLGtDQUFrQyxPQUF5QjtBQUMxRSxVQUFRLGlCQUFpQixnQkFBZ0IsaUJBQWlCLFVBQVUsTUFBTSxTQUFTO0FBQ3BGO0FBbUlP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
