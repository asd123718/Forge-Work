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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
const ITtsPlaybackService = createDecorator("ttsPlaybackService");
const PLAYBACK_SAMPLE_RATE = 24e3;
const MAX_PLAYBACK_SAMPLES = PLAYBACK_SAMPLE_RATE * 180;
let TtsPlaybackService = class extends Disposable {
  constructor(logService) {
    super();
    this.logService = logService;
    this._playbackTurn = null;
    this._playbackGen = 0;
    this._isPlaying = false;
    this._lastPlayedSamples = null;
    this._onPlaybackStarted = this._register(new Emitter());
    this.onPlaybackStarted = this._onPlaybackStarted.event;
    this._onPlaybackStopped = this._register(new Emitter());
    this.onPlaybackStopped = this._onPlaybackStopped.event;
  }
  get isPlaying() {
    return this._isPlaying;
  }
  get analyserNode() {
    return this._analyserNode;
  }
  getLastPlayedSamples() {
    return this._lastPlayedSamples;
  }
  ensureContext(window) {
    this._window = window;
    if (!this._playbackCtx) {
      this._playbackCtx = new window.AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
    }
    if (this._playbackCtx.state === "suspended") {
      this._playbackCtx.resume().catch(() => {
      });
    }
    return this._playbackCtx;
  }
  playAudioChunk(audio, isFinal, window) {
    this._window = window;
    if (!audio && isFinal) {
      const turn2 = this._ensurePlayTurn(window);
      turn2.writeChain = turn2.writeChain.then(() => this._schedulePlayStop());
      return;
    }
    if (!audio) {
      return;
    }
    const turn = this._ensurePlayTurn(window);
    const gen = this._playbackGen;
    const binary = window.atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const arrayBuf = bytes.buffer;
    turn.writeChain = turn.writeChain.then(async () => {
      if (gen !== this._playbackGen) {
        return;
      }
      try {
        const ctx = this.ensureContext(this._window);
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (gen !== this._playbackGen) {
          return;
        }
        this._writeToPlayBuffer(decoded);
        if (!this._playbackTurn?.started) {
          this._startPlayback();
        }
      } catch (err) {
        this.logService.error("[voice] TTS decode error", err);
      }
    });
    if (isFinal) {
      turn.writeChain = turn.writeChain.then(() => this._schedulePlayStop());
    }
  }
  stopPlayback() {
    this._playbackGen++;
    if (this._playbackTurn) {
      this._captureSamples(this._playbackTurn);
    }
    try {
      this._playbackTurn?.sourceNode?.stop();
    } catch {
    }
    this._playbackTurn = null;
    this._analyserNode = void 0;
    if (this._isPlaying) {
      this._isPlaying = false;
      this._onPlaybackStopped.fire();
    }
  }
  /** Close the AudioContext entirely (for full teardown). */
  closeContext() {
    this.stopPlayback();
    if (this._playbackCtx) {
      this._playbackCtx.close();
      this._playbackCtx = void 0;
    }
  }
  _ensurePlayTurn(window) {
    const ctx = this.ensureContext(window);
    if (this._playbackTurn) {
      return this._playbackTurn;
    }
    const turn = {
      buffer: ctx.createBuffer(1, MAX_PLAYBACK_SAMPLES, PLAYBACK_SAMPLE_RATE),
      sourceNode: null,
      writeOffset: 0,
      startCtxTime: 0,
      started: false,
      writeChain: Promise.resolve()
    };
    this._playbackTurn = turn;
    return turn;
  }
  _writeToPlayBuffer(decoded) {
    if (!this._playbackTurn) {
      return;
    }
    const src = decoded.getChannelData(0);
    const dst = this._playbackTurn.buffer.getChannelData(0);
    const toWrite = Math.min(src.length, MAX_PLAYBACK_SAMPLES - this._playbackTurn.writeOffset);
    for (let i = 0; i < toWrite; i++) {
      dst[this._playbackTurn.writeOffset + i] = src[i];
    }
    this._playbackTurn.writeOffset += toWrite;
  }
  _startPlayback() {
    const ctx = this._playbackCtx;
    const turn = this._playbackTurn;
    if (!ctx || !turn || turn.started) {
      return;
    }
    turn.started = true;
    const node = ctx.createBufferSource();
    node.buffer = turn.buffer;
    turn.sourceNode = node;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    node.connect(analyser);
    analyser.connect(ctx.destination);
    this._analyserNode = analyser;
    turn.startCtxTime = ctx.currentTime;
    node.start(0);
    if (!this._isPlaying) {
      this._isPlaying = true;
      this._onPlaybackStarted.fire();
    }
  }
  _schedulePlayStop() {
    const ctx = this._playbackCtx;
    const turn = this._playbackTurn;
    if (!ctx || !turn) {
      return;
    }
    if (!turn.started) {
      this._startPlayback();
    }
    const node = turn.sourceNode;
    if (!node) {
      return;
    }
    const stopAt = turn.startCtxTime + turn.writeOffset / PLAYBACK_SAMPLE_RATE;
    const endedTurn = turn;
    node.stop(Math.max(stopAt, ctx.currentTime));
    node.onended = () => {
      if (this._playbackTurn !== endedTurn) {
        return;
      }
      this._captureSamples(endedTurn);
      this._playbackTurn = null;
      this._analyserNode = void 0;
      if (this._isPlaying) {
        this._isPlaying = false;
        this._onPlaybackStopped.fire();
      }
    };
  }
  _captureSamples(turn) {
    if (turn.writeOffset > 0) {
      this._lastPlayedSamples = turn.buffer.getChannelData(0).slice(0, turn.writeOffset);
    }
  }
  dispose() {
    this.closeContext();
    super.dispose();
  }
};
TtsPlaybackService = __decorateClass([
  __decorateParam(0, ILogService)
], TtsPlaybackService);
registerSingleton(ITtsPlaybackService, TtsPlaybackService, InstantiationType.Delayed);
export {
  ITtsPlaybackService,
  TtsPlaybackService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFx0dHNQbGF5YmFja1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgY29uc3QgSVR0c1BsYXliYWNrU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJVHRzUGxheWJhY2tTZXJ2aWNlPigndHRzUGxheWJhY2tTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVR0c1BsYXliYWNrU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKiogQXBwZW5kIGEgYmFzZTY0LWVuY29kZWQgYXVkaW8gY2h1bmsgZm9yIHN0cmVhbWluZyBwbGF5YmFjay4gKi9cblx0cGxheUF1ZGlvQ2h1bmsoYXVkaW86IHN0cmluZywgaXNGaW5hbDogYm9vbGVhbiwgd2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IHZvaWQ7XG5cblx0LyoqIFN0b3AgYW55IGN1cnJlbnQgcGxheWJhY2sgaW1tZWRpYXRlbHkuICovXG5cdHN0b3BQbGF5YmFjaygpOiB2b2lkO1xuXG5cdHJlYWRvbmx5IGlzUGxheWluZzogYm9vbGVhbjtcblxuXHRyZWFkb25seSBvblBsYXliYWNrU3RhcnRlZDogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uUGxheWJhY2tTdG9wcGVkOiBFdmVudDx2b2lkPjtcblxuXHQvKiogUmV0dXJucyB0aGUgUENNIHNhbXBsZXMgZnJvbSB0aGUgbGFzdCBjb21wbGV0ZWQgcGxheWJhY2sgdHVybiwgb3IgbnVsbC4gKi9cblx0Z2V0TGFzdFBsYXllZFNhbXBsZXMoKTogRmxvYXQzMkFycmF5IHwgbnVsbDtcblxuXHQvKiogVGhlIHBsYXliYWNrIEFuYWx5c2VyTm9kZSBmb3IgdmlzdWFsaXNhdGlvbiwgYXZhaWxhYmxlIGR1cmluZyBwbGF5YmFjay4gKi9cblx0cmVhZG9ubHkgYW5hbHlzZXJOb2RlOiBBbmFseXNlck5vZGUgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEVuc3VyZSB0aGUgcGxheWJhY2sgQXVkaW9Db250ZXh0IGV4aXN0cyBhbmQgaXMgcmVzdW1lZC5cblx0ICogUmV0dXJucyB0aGUgQXVkaW9Db250ZXh0IGZvciBjYWxsZXJzIHRoYXQgbmVlZCBpdCAoZS5nLiBwcmUtd2FybWluZykuXG5cdCAqL1xuXHRlbnN1cmVDb250ZXh0KHdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiBBdWRpb0NvbnRleHQ7XG5cblx0LyoqIENsb3NlIHRoZSBBdWRpb0NvbnRleHQgZW50aXJlbHkgKGZvciBmdWxsIHRlYXJkb3duKS4gKi9cblx0Y2xvc2VDb250ZXh0KCk6IHZvaWQ7XG59XG5cbmNvbnN0IFBMQVlCQUNLX1NBTVBMRV9SQVRFID0gMjQwMDA7XG5jb25zdCBNQVhfUExBWUJBQ0tfU0FNUExFUyA9IFBMQVlCQUNLX1NBTVBMRV9SQVRFICogMTgwOyAvLyAzIG1pbiBjZWlsaW5nXG5cbnR5cGUgUGxheWJhY2tUdXJuID0ge1xuXHRidWZmZXI6IEF1ZGlvQnVmZmVyO1xuXHRzb3VyY2VOb2RlOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGUgfCBudWxsO1xuXHR3cml0ZU9mZnNldDogbnVtYmVyO1xuXHRzdGFydEN0eFRpbWU6IG51bWJlcjtcblx0c3RhcnRlZDogYm9vbGVhbjtcblx0d3JpdGVDaGFpbjogUHJvbWlzZTx2b2lkPjtcbn07XG5cbmV4cG9ydCBjbGFzcyBUdHNQbGF5YmFja1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVR0c1BsYXliYWNrU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3dpbmRvdzogKFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGxheWJhY2tDdHg6IEF1ZGlvQ29udGV4dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGxheWJhY2tUdXJuOiBQbGF5YmFja1R1cm4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfcGxheWJhY2tHZW4gPSAwO1xuXHRwcml2YXRlIF9hbmFseXNlck5vZGU6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNQbGF5aW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2xhc3RQbGF5ZWRTYW1wbGVzOiBGbG9hdDMyQXJyYXkgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblBsYXliYWNrU3RhcnRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblBsYXliYWNrU3RhcnRlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vblBsYXliYWNrU3RhcnRlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblBsYXliYWNrU3RvcHBlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblBsYXliYWNrU3RvcHBlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vblBsYXliYWNrU3RvcHBlZC5ldmVudDtcblxuXHRnZXQgaXNQbGF5aW5nKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNQbGF5aW5nOyB9XG5cdGdldCBhbmFseXNlck5vZGUoKTogQW5hbHlzZXJOb2RlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2FuYWx5c2VyTm9kZTsgfVxuXG5cdGdldExhc3RQbGF5ZWRTYW1wbGVzKCk6IEZsb2F0MzJBcnJheSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0UGxheWVkU2FtcGxlcztcblx0fVxuXG5cdGVuc3VyZUNvbnRleHQod2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IEF1ZGlvQ29udGV4dCB7XG5cdFx0dGhpcy5fd2luZG93ID0gd2luZG93O1xuXHRcdGlmICghdGhpcy5fcGxheWJhY2tDdHgpIHtcblx0XHRcdHRoaXMuX3BsYXliYWNrQ3R4ID0gbmV3IHdpbmRvdy5BdWRpb0NvbnRleHQoeyBzYW1wbGVSYXRlOiBQTEFZQkFDS19TQU1QTEVfUkFURSB9KTtcblx0XHR9XG5cdFx0Ly8gQXVkaW9Db250ZXh0IG1heSBiZSBzdXNwZW5kZWQgaWYgbm8gdXNlciBnZXN0dXJlIG9jY3VycmVkIG9uIHRoaXMgd2luZG93IHlldC5cblx0XHQvLyBSZXN1bWUgaXQgdG8gZW5zdXJlIHBsYXliYWNrIHdvcmtzIHJlZ2FyZGxlc3Mgb2Ygd2hpY2ggd2luZG93IGluaXRpYXRlZCB0aGUgYWN0aW9uLlxuXHRcdGlmICh0aGlzLl9wbGF5YmFja0N0eC5zdGF0ZSA9PT0gJ3N1c3BlbmRlZCcpIHtcblx0XHRcdHRoaXMuX3BsYXliYWNrQ3R4LnJlc3VtZSgpLmNhdGNoKCgpID0+IHsgLyogaWdub3JlIC0gYmVzdCBlZmZvcnQgKi8gfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wbGF5YmFja0N0eDtcblx0fVxuXG5cdHBsYXlBdWRpb0NodW5rKGF1ZGlvOiBzdHJpbmcsIGlzRmluYWw6IGJvb2xlYW4sIHdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiB2b2lkIHtcblx0XHR0aGlzLl93aW5kb3cgPSB3aW5kb3c7XG5cdFx0aWYgKCFhdWRpbyAmJiBpc0ZpbmFsKSB7XG5cdFx0XHRjb25zdCB0dXJuID0gdGhpcy5fZW5zdXJlUGxheVR1cm4od2luZG93KTtcblx0XHRcdHR1cm4ud3JpdGVDaGFpbiA9IHR1cm4ud3JpdGVDaGFpbi50aGVuKCgpID0+IHRoaXMuX3NjaGVkdWxlUGxheVN0b3AoKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghYXVkaW8pIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCB0dXJuID0gdGhpcy5fZW5zdXJlUGxheVR1cm4od2luZG93KTtcblx0XHRjb25zdCBnZW4gPSB0aGlzLl9wbGF5YmFja0dlbjtcblx0XHRjb25zdCBiaW5hcnkgPSB3aW5kb3cuYXRvYihhdWRpbyk7XG5cdFx0Y29uc3QgYnl0ZXMgPSBuZXcgVWludDhBcnJheShiaW5hcnkubGVuZ3RoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGJpbmFyeS5sZW5ndGg7IGkrKykgeyBieXRlc1tpXSA9IGJpbmFyeS5jaGFyQ29kZUF0KGkpOyB9XG5cdFx0Y29uc3QgYXJyYXlCdWYgPSBieXRlcy5idWZmZXI7XG5cdFx0dHVybi53cml0ZUNoYWluID0gdHVybi53cml0ZUNoYWluLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKGdlbiAhPT0gdGhpcy5fcGxheWJhY2tHZW4pIHsgcmV0dXJuOyB9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjdHggPSB0aGlzLmVuc3VyZUNvbnRleHQodGhpcy5fd2luZG93ISk7XG5cdFx0XHRcdGNvbnN0IGRlY29kZWQgPSBhd2FpdCBjdHguZGVjb2RlQXVkaW9EYXRhKGFycmF5QnVmKTtcblx0XHRcdFx0aWYgKGdlbiAhPT0gdGhpcy5fcGxheWJhY2tHZW4pIHsgcmV0dXJuOyB9XG5cdFx0XHRcdHRoaXMuX3dyaXRlVG9QbGF5QnVmZmVyKGRlY29kZWQpO1xuXHRcdFx0XHRpZiAoIXRoaXMuX3BsYXliYWNrVHVybj8uc3RhcnRlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0UGxheWJhY2soKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7IHRoaXMubG9nU2VydmljZS5lcnJvcignW3ZvaWNlXSBUVFMgZGVjb2RlIGVycm9yJywgZXJyKTsgfVxuXHRcdH0pO1xuXHRcdGlmIChpc0ZpbmFsKSB7XG5cdFx0XHR0dXJuLndyaXRlQ2hhaW4gPSB0dXJuLndyaXRlQ2hhaW4udGhlbigoKSA9PiB0aGlzLl9zY2hlZHVsZVBsYXlTdG9wKCkpO1xuXHRcdH1cblx0fVxuXG5cdHN0b3BQbGF5YmFjaygpOiB2b2lkIHtcblx0XHR0aGlzLl9wbGF5YmFja0dlbisrO1xuXHRcdGlmICh0aGlzLl9wbGF5YmFja1R1cm4pIHtcblx0XHRcdHRoaXMuX2NhcHR1cmVTYW1wbGVzKHRoaXMuX3BsYXliYWNrVHVybik7XG5cdFx0fVxuXHRcdHRyeSB7IHRoaXMuX3BsYXliYWNrVHVybj8uc291cmNlTm9kZT8uc3RvcCgpOyB9IGNhdGNoIHsgLyogYWxyZWFkeSBzdG9wcGVkICovIH1cblx0XHR0aGlzLl9wbGF5YmFja1R1cm4gPSBudWxsO1xuXHRcdHRoaXMuX2FuYWx5c2VyTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5faXNQbGF5aW5nKSB7XG5cdFx0XHR0aGlzLl9pc1BsYXlpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uUGxheWJhY2tTdG9wcGVkLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogQ2xvc2UgdGhlIEF1ZGlvQ29udGV4dCBlbnRpcmVseSAoZm9yIGZ1bGwgdGVhcmRvd24pLiAqL1xuXHRjbG9zZUNvbnRleHQoKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9wUGxheWJhY2soKTtcblx0XHRpZiAodGhpcy5fcGxheWJhY2tDdHgpIHtcblx0XHRcdHRoaXMuX3BsYXliYWNrQ3R4LmNsb3NlKCk7XG5cdFx0XHR0aGlzLl9wbGF5YmFja0N0eCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVQbGF5VHVybih3aW5kb3c6IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzKTogUGxheWJhY2tUdXJuIHtcblx0XHRjb25zdCBjdHggPSB0aGlzLmVuc3VyZUNvbnRleHQod2luZG93KTtcblx0XHRpZiAodGhpcy5fcGxheWJhY2tUdXJuKSB7IHJldHVybiB0aGlzLl9wbGF5YmFja1R1cm47IH1cblx0XHRjb25zdCB0dXJuOiBQbGF5YmFja1R1cm4gPSB7XG5cdFx0XHRidWZmZXI6IGN0eC5jcmVhdGVCdWZmZXIoMSwgTUFYX1BMQVlCQUNLX1NBTVBMRVMsIFBMQVlCQUNLX1NBTVBMRV9SQVRFKSxcblx0XHRcdHNvdXJjZU5vZGU6IG51bGwsXG5cdFx0XHR3cml0ZU9mZnNldDogMCxcblx0XHRcdHN0YXJ0Q3R4VGltZTogMCxcblx0XHRcdHN0YXJ0ZWQ6IGZhbHNlLFxuXHRcdFx0d3JpdGVDaGFpbjogUHJvbWlzZS5yZXNvbHZlKCksXG5cdFx0fTtcblx0XHR0aGlzLl9wbGF5YmFja1R1cm4gPSB0dXJuO1xuXHRcdHJldHVybiB0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBfd3JpdGVUb1BsYXlCdWZmZXIoZGVjb2RlZDogQXVkaW9CdWZmZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3BsYXliYWNrVHVybikgeyByZXR1cm47IH1cblx0XHRjb25zdCBzcmMgPSBkZWNvZGVkLmdldENoYW5uZWxEYXRhKDApO1xuXHRcdGNvbnN0IGRzdCA9IHRoaXMuX3BsYXliYWNrVHVybi5idWZmZXIuZ2V0Q2hhbm5lbERhdGEoMCk7XG5cdFx0Y29uc3QgdG9Xcml0ZSA9IE1hdGgubWluKHNyYy5sZW5ndGgsIE1BWF9QTEFZQkFDS19TQU1QTEVTIC0gdGhpcy5fcGxheWJhY2tUdXJuLndyaXRlT2Zmc2V0KTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRvV3JpdGU7IGkrKykge1xuXHRcdFx0ZHN0W3RoaXMuX3BsYXliYWNrVHVybi53cml0ZU9mZnNldCArIGldID0gc3JjW2ldO1xuXHRcdH1cblx0XHR0aGlzLl9wbGF5YmFja1R1cm4ud3JpdGVPZmZzZXQgKz0gdG9Xcml0ZTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0UGxheWJhY2soKTogdm9pZCB7XG5cdFx0Y29uc3QgY3R4ID0gdGhpcy5fcGxheWJhY2tDdHg7XG5cdFx0Y29uc3QgdHVybiA9IHRoaXMuX3BsYXliYWNrVHVybjtcblx0XHRpZiAoIWN0eCB8fCAhdHVybiB8fCB0dXJuLnN0YXJ0ZWQpIHsgcmV0dXJuOyB9XG5cdFx0dHVybi5zdGFydGVkID0gdHJ1ZTtcblx0XHRjb25zdCBub2RlID0gY3R4LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xuXHRcdG5vZGUuYnVmZmVyID0gdHVybi5idWZmZXI7XG5cdFx0dHVybi5zb3VyY2VOb2RlID0gbm9kZTtcblxuXHRcdGNvbnN0IGFuYWx5c2VyID0gY3R4LmNyZWF0ZUFuYWx5c2VyKCk7XG5cdFx0YW5hbHlzZXIuZmZ0U2l6ZSA9IDI1Njtcblx0XHRub2RlLmNvbm5lY3QoYW5hbHlzZXIpO1xuXHRcdGFuYWx5c2VyLmNvbm5lY3QoY3R4LmRlc3RpbmF0aW9uKTtcblx0XHR0aGlzLl9hbmFseXNlck5vZGUgPSBhbmFseXNlcjtcblxuXHRcdHR1cm4uc3RhcnRDdHhUaW1lID0gY3R4LmN1cnJlbnRUaW1lO1xuXHRcdG5vZGUuc3RhcnQoMCk7XG5cblx0XHRpZiAoIXRoaXMuX2lzUGxheWluZykge1xuXHRcdFx0dGhpcy5faXNQbGF5aW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uUGxheWJhY2tTdGFydGVkLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZVBsYXlTdG9wKCk6IHZvaWQge1xuXHRcdGNvbnN0IGN0eCA9IHRoaXMuX3BsYXliYWNrQ3R4O1xuXHRcdGNvbnN0IHR1cm4gPSB0aGlzLl9wbGF5YmFja1R1cm47XG5cdFx0aWYgKCFjdHggfHwgIXR1cm4pIHsgcmV0dXJuOyB9XG5cdFx0aWYgKCF0dXJuLnN0YXJ0ZWQpIHsgdGhpcy5fc3RhcnRQbGF5YmFjaygpOyB9XG5cdFx0Y29uc3Qgbm9kZSA9IHR1cm4uc291cmNlTm9kZTtcblx0XHRpZiAoIW5vZGUpIHsgcmV0dXJuOyB9XG5cdFx0Y29uc3Qgc3RvcEF0ID0gdHVybi5zdGFydEN0eFRpbWUgKyB0dXJuLndyaXRlT2Zmc2V0IC8gUExBWUJBQ0tfU0FNUExFX1JBVEU7XG5cdFx0Y29uc3QgZW5kZWRUdXJuID0gdHVybjtcblx0XHRub2RlLnN0b3AoTWF0aC5tYXgoc3RvcEF0LCBjdHguY3VycmVudFRpbWUpKTtcblx0XHRub2RlLm9uZW5kZWQgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcGxheWJhY2tUdXJuICE9PSBlbmRlZFR1cm4pIHsgcmV0dXJuOyB9XG5cdFx0XHR0aGlzLl9jYXB0dXJlU2FtcGxlcyhlbmRlZFR1cm4pO1xuXHRcdFx0dGhpcy5fcGxheWJhY2tUdXJuID0gbnVsbDtcblx0XHRcdHRoaXMuX2FuYWx5c2VyTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl9pc1BsYXlpbmcpIHtcblx0XHRcdFx0dGhpcy5faXNQbGF5aW5nID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX29uUGxheWJhY2tTdG9wcGVkLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FwdHVyZVNhbXBsZXModHVybjogUGxheWJhY2tUdXJuKTogdm9pZCB7XG5cdFx0aWYgKHR1cm4ud3JpdGVPZmZzZXQgPiAwKSB7XG5cdFx0XHR0aGlzLl9sYXN0UGxheWVkU2FtcGxlcyA9IHR1cm4uYnVmZmVyLmdldENoYW5uZWxEYXRhKDApLnNsaWNlKDAsIHR1cm4ud3JpdGVPZmZzZXQpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jbG9zZUNvbnRleHQoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVR0c1BsYXliYWNrU2VydmljZSwgVHRzUGxheWJhY2tTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxtQkFBbUI7QUFFckIsTUFBTSxzQkFBc0IsZ0JBQXFDLG9CQUFvQjtBQWdDNUYsTUFBTSx1QkFBdUI7QUFDN0IsTUFBTSx1QkFBdUIsdUJBQXVCO0FBVzdDLElBQU0scUJBQU4sY0FBaUMsV0FBMEM7QUFBQSxFQUdqRixZQUEwQyxZQUF5QjtBQUNsRSxVQUFNO0FBRG1DO0FBTTFDLFNBQVEsZ0JB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
