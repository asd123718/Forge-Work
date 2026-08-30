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
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { RecordingState } from "../browser/recordingService.js";
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const SIZE_LIMIT_THRESHOLD = 0.9;
let NativeRecordingService = class extends Disposable {
  constructor(logService, nativeHostService) {
    super();
    this.logService = logService;
    this.nativeHostService = nativeHostService;
    // MediaRecorder + getDisplayMedia may be absent if the renderer is run with reduced
    // APIs (e.g. some test/runtime configurations); derive support from feature detection
    // so startRecording can early-reject rather than blowing up with ReferenceError.
    this.isSupported = typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
    this._state = RecordingState.Idle;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this.chunks = [];
    this.bytesRecorded = 0;
    this.stoppedBySize = false;
    this.startTime = 0;
    this._register(toDisposable(() => this.cleanup()));
  }
  getScreenCapturePermissionStatus() {
    return this.nativeHostService.getMediaAccessStatus("screen");
  }
  openScreenCapturePermissionSettings() {
    if (isMacintosh) {
      void this.nativeHostService.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    }
  }
  get state() {
    return this._state;
  }
  setState(state) {
    if (this._state !== state) {
      this._state = state;
      this._onDidChangeState.fire(state);
    }
  }
  getSupportedFormats() {
    const formats = [];
    if (typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("video/mp4")) {
        formats.push({ mimeType: "video/mp4", label: "MP4", extension: "mp4" });
      }
      if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
        formats.push({ mimeType: "video/webm;codecs=vp9", label: "WebM", extension: "webm" });
      } else if (MediaRecorder.isTypeSupported("video/webm")) {
        formats.push({ mimeType: "video/webm", label: "WebM", extension: "webm" });
      }
    }
    return formats;
  }
  async startRecording(preferredMimeType) {
    if (!this.isSupported) {
      throw new Error("Recording is not supported in this environment (MediaRecorder / getDisplayMedia unavailable).");
    }
    if (this._state === RecordingState.Recording) {
      throw new Error("Recording already in progress.");
    }
    this.cleanup();
    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
    } catch (err) {
      this.logService.error("[RecordingService] Failed to get display media:", err);
      throw new Error("Failed to start recording. The user may have cancelled the source picker.");
    }
    let mimeType;
    if (preferredMimeType && MediaRecorder.isTypeSupported(preferredMimeType)) {
      mimeType = preferredMimeType;
    } else if (MediaRecorder.isTypeSupported("video/mp4")) {
      mimeType = "video/mp4";
    } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      mimeType = "video/webm;codecs=vp9";
    } else {
      mimeType = "video/webm";
    }
    this.chunks = [];
    this.bytesRecorded = 0;
    this.stoppedBySize = false;
    this.startTime = Date.now();
    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType,
        videoBitsPerSecond: 25e5
        // 2.5 Mbps — good quality, reasonable file size
      });
    } catch (err) {
      this.logService.error("[RecordingService] Failed to create MediaRecorder:", err);
      this.stopTracks();
      throw new Error("Failed to create media recorder.");
    }
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        if (this.stoppedBySize) {
          return;
        }
        this.chunks.push(e.data);
        this.bytesRecorded += e.data.size;
        if (this.bytesRecorded >= MAX_FILE_SIZE_BYTES * SIZE_LIMIT_THRESHOLD && this._state === RecordingState.Recording) {
          this.logService.info("[RecordingService] Max file size reached, stopping recording.");
          this.stoppedBySize = true;
          this.mediaRecorder?.stop();
        }
      }
    };
    this.mediaRecorder.onstop = () => {
      if (this._state === RecordingState.Recording) {
        this.stopTracks();
        this.setState(RecordingState.Stopped);
      }
    };
    for (const track of this.mediaStream.getTracks()) {
      track.onended = () => {
        if (this._state === RecordingState.Recording && this.mediaRecorder?.state === "recording") {
          this.mediaRecorder.stop();
        }
      };
    }
    this.mediaRecorder.start(1e3);
    this.setState(RecordingState.Recording);
  }
  async stopRecording() {
    if (this._state !== RecordingState.Recording && this._state !== RecordingState.Stopped) {
      return void 0;
    }
    if (this._state === RecordingState.Recording && this.mediaRecorder?.state === "recording") {
      const recorder = this.mediaRecorder;
      await new Promise((resolve) => {
        recorder.onstop = () => {
          resolve();
        };
        recorder.requestData();
        recorder.stop();
      });
    }
    this.stopTracks();
    if (this.chunks.length === 0) {
      this.setState(RecordingState.Idle);
      return void 0;
    }
    const mimeType = this.mediaRecorder?.mimeType ?? "video/webm";
    const blob = new Blob(this.chunks, { type: mimeType });
    const durationMs = Date.now() - this.startTime;
    const data = {
      blob,
      mimeType,
      durationMs,
      sizeBytes: blob.size,
      stoppedBySize: this.stoppedBySize
    };
    this.chunks = [];
    this.mediaRecorder = void 0;
    this.setState(RecordingState.Idle);
    return data;
  }
  discardRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      if (this._state === RecordingState.Recording && this.mediaRecorder.state === "recording") {
        this.mediaRecorder.stop();
      }
    }
    this.cleanup();
    this.setState(RecordingState.Idle);
  }
  stopTracks() {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = void 0;
    }
  }
  cleanup() {
    this.stopTracks();
    this.chunks = [];
    this.bytesRecorded = 0;
    this.stoppedBySize = false;
    this.mediaRecorder = void 0;
  }
};
NativeRecordingService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, INativeHostService)
], NativeRecordingService);
export {
  NativeRecordingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlzc3VlXFxlbGVjdHJvbi1icm93c2VyXFxuYXRpdmVSZWNvcmRpbmdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElSZWNvcmRpbmdEYXRhLCBJUmVjb3JkaW5nU2VydmljZSwgUmVjb3JkaW5nU3RhdGUgfSBmcm9tICcuLi9icm93c2VyL3JlY29yZGluZ1NlcnZpY2UuanMnO1xuXG5jb25zdCBNQVhfRklMRV9TSVpFX0JZVEVTID0gMTAwICogMTAyNCAqIDEwMjQ7IC8vIDEwMCBNQiBcdTIwMTQgR2l0SHViIHVwbG9hZCBsaW1pdFxuY29uc3QgU0laRV9MSU1JVF9USFJFU0hPTEQgPSAwLjk7IC8vIFN0b3AgYXQgOTAlIHRvIGFjY291bnQgZm9yIGNodW5rIG92ZXJzaG9vdFxuXG5leHBvcnQgY2xhc3MgTmF0aXZlUmVjb3JkaW5nU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUmVjb3JkaW5nU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0Ly8gTWVkaWFSZWNvcmRlciArIGdldERpc3BsYXlNZWRpYSBtYXkgYmUgYWJzZW50IGlmIHRoZSByZW5kZXJlciBpcyBydW4gd2l0aCByZWR1Y2VkXG5cdC8vIEFQSXMgKGUuZy4gc29tZSB0ZXN0L3J1bnRpbWUgY29uZmlndXJhdGlvbnMpOyBkZXJpdmUgc3VwcG9ydCBmcm9tIGZlYXR1cmUgZGV0ZWN0aW9uXG5cdC8vIHNvIHN0YXJ0UmVjb3JkaW5nIGNhbiBlYXJseS1yZWplY3QgcmF0aGVyIHRoYW4gYmxvd2luZyB1cCB3aXRoIFJlZmVyZW5jZUVycm9yLlxuXHRyZWFkb25seSBpc1N1cHBvcnRlZCA9IHR5cGVvZiBNZWRpYVJlY29yZGVyICE9PSAndW5kZWZpbmVkJ1xuXHRcdCYmIHR5cGVvZiBuYXZpZ2F0b3IgIT09ICd1bmRlZmluZWQnXG5cdFx0JiYgISFuYXZpZ2F0b3IubWVkaWFEZXZpY2VzPy5nZXREaXNwbGF5TWVkaWE7XG5cblx0cHJpdmF0ZSBfc3RhdGUgPSBSZWNvcmRpbmdTdGF0ZS5JZGxlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmVjb3JkaW5nU3RhdGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVN0YXRlOiBFdmVudDxSZWNvcmRpbmdTdGF0ZT4gPSB0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgbWVkaWFSZWNvcmRlcjogTWVkaWFSZWNvcmRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtZWRpYVN0cmVhbTogTWVkaWFTdHJlYW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY2h1bmtzOiBCbG9iW10gPSBbXTtcblx0cHJpdmF0ZSBieXRlc1JlY29yZGVkID0gMDtcblx0cHJpdmF0ZSBzdG9wcGVkQnlTaXplID0gZmFsc2U7XG5cdHByaXZhdGUgc3RhcnRUaW1lID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFudXAoKSkpO1xuXHR9XG5cblx0Z2V0U2NyZWVuQ2FwdHVyZVBlcm1pc3Npb25TdGF0dXMoKTogUHJvbWlzZTwnbm90LWRldGVybWluZWQnIHwgJ2dyYW50ZWQnIHwgJ2RlbmllZCcgfCAncmVzdHJpY3RlZCcgfCAndW5rbm93bic+IHtcblx0XHRyZXR1cm4gdGhpcy5uYXRpdmVIb3N0U2VydmljZS5nZXRNZWRpYUFjY2Vzc1N0YXR1cygnc2NyZWVuJyk7XG5cdH1cblxuXHRvcGVuU2NyZWVuQ2FwdHVyZVBlcm1pc3Npb25TZXR0aW5ncygpOiB2b2lkIHtcblx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdC8vIERlZXAtbGluayB0byB0aGUgU2NyZWVuIFJlY29yZGluZyBwYW5lIGluIG1hY09TIFByaXZhY3kgJiBTZWN1cml0eS5cblx0XHRcdHZvaWQgdGhpcy5uYXRpdmVIb3N0U2VydmljZS5vcGVuRXh0ZXJuYWwoJ3gtYXBwbGUuc3lzdGVtcHJlZmVyZW5jZXM6Y29tLmFwcGxlLnByZWZlcmVuY2Uuc2VjdXJpdHk/UHJpdmFjeV9TY3JlZW5DYXB0dXJlJyk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHN0YXRlKCk6IFJlY29yZGluZ1N0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIHNldFN0YXRlKHN0YXRlOiBSZWNvcmRpbmdTdGF0ZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gc3RhdGUpIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gc3RhdGU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdGdldFN1cHBvcnRlZEZvcm1hdHMoKTogeyBtaW1lVHlwZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBleHRlbnNpb246IHN0cmluZyB9W10ge1xuXHRcdGNvbnN0IGZvcm1hdHM6IHsgbWltZVR5cGU6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZXh0ZW5zaW9uOiBzdHJpbmcgfVtdID0gW107XG5cdFx0aWYgKHR5cGVvZiBNZWRpYVJlY29yZGVyICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0aWYgKE1lZGlhUmVjb3JkZXIuaXNUeXBlU3VwcG9ydGVkKCd2aWRlby9tcDQnKSkge1xuXHRcdFx0XHRmb3JtYXRzLnB1c2goeyBtaW1lVHlwZTogJ3ZpZGVvL21wNCcsIGxhYmVsOiAnTVA0JywgZXh0ZW5zaW9uOiAnbXA0JyB9KTtcblx0XHRcdH1cblx0XHRcdGlmIChNZWRpYVJlY29yZGVyLmlzVHlwZVN1cHBvcnRlZCgndmlkZW8vd2VibTtjb2RlY3M9dnA5JykpIHtcblx0XHRcdFx0Zm9ybWF0cy5wdXNoKHsgbWltZVR5cGU6ICd2aWRlby93ZWJtO2NvZGVjcz12cDknLCBsYWJlbDogJ1dlYk0nLCBleHRlbnNpb246ICd3ZWJtJyB9KTtcblx0XHRcdH0gZWxzZSBpZiAoTWVkaWFSZWNvcmRlci5pc1R5cGVTdXBwb3J0ZWQoJ3ZpZGVvL3dlYm0nKSkge1xuXHRcdFx0XHRmb3JtYXRzLnB1c2goeyBtaW1lVHlwZTogJ3ZpZGVvL3dlYm0nLCBsYWJlbDogJ1dlYk0nLCBleHRlbnNpb246ICd3ZWJtJyB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZvcm1hdHM7XG5cdH1cblxuXHRhc3luYyBzdGFydFJlY29yZGluZyhwcmVmZXJyZWRNaW1lVHlwZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pc1N1cHBvcnRlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZWNvcmRpbmcgaXMgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGVudmlyb25tZW50IChNZWRpYVJlY29yZGVyIC8gZ2V0RGlzcGxheU1lZGlhIHVuYXZhaWxhYmxlKS4nKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVjb3JkaW5nIGFscmVhZHkgaW4gcHJvZ3Jlc3MuJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jbGVhbnVwKCk7XG5cblx0XHQvLyBVc2UgZ2V0RGlzcGxheU1lZGlhIFx1MjAxNCBvbiBFbGVjdHJvbiBkZXNrdG9wIHRoZSBtYWluIHByb2Nlc3MgaGFuZGxlclxuXHRcdC8vIGF1dG8tc2VsZWN0cyB0aGUgc2NyZWVuIGNvbnRhaW5pbmcgdGhlIFZTIENvZGUgd2luZG93IHZpYVxuXHRcdC8vIGRlc2t0b3BDYXB0dXJlci5nZXRTb3VyY2VzKCkgKGNhY2hlZCBmb3Igc3Vic2VxdWVudCByZWNvcmRpbmdzKS5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5tZWRpYVN0cmVhbSA9IGF3YWl0IG5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0RGlzcGxheU1lZGlhKHtcblx0XHRcdFx0dmlkZW86IHRydWUsXG5cdFx0XHRcdGF1ZGlvOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbUmVjb3JkaW5nU2VydmljZV0gRmFpbGVkIHRvIGdldCBkaXNwbGF5IG1lZGlhOicsIGVycik7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBzdGFydCByZWNvcmRpbmcuIFRoZSB1c2VyIG1heSBoYXZlIGNhbmNlbGxlZCB0aGUgc291cmNlIHBpY2tlci4nKTtcblx0XHR9XG5cblx0XHQvLyBTZWxlY3QgbWltZSB0eXBlOiBwcmVmZXIgY2FsbGVyJ3MgY2hvaWNlLCBmYWxsIGJhY2sgdG8gYmVzdCBhdmFpbGFibGVcblx0XHRsZXQgbWltZVR5cGU6IHN0cmluZztcblx0XHRpZiAocHJlZmVycmVkTWltZVR5cGUgJiYgTWVkaWFSZWNvcmRlci5pc1R5cGVTdXBwb3J0ZWQocHJlZmVycmVkTWltZVR5cGUpKSB7XG5cdFx0XHRtaW1lVHlwZSA9IHByZWZlcnJlZE1pbWVUeXBlO1xuXHRcdH0gZWxzZSBpZiAoTWVkaWFSZWNvcmRlci5pc1R5cGVTdXBwb3J0ZWQoJ3ZpZGVvL21wNCcpKSB7XG5cdFx0XHRtaW1lVHlwZSA9ICd2aWRlby9tcDQnO1xuXHRcdH0gZWxzZSBpZiAoTWVkaWFSZWNvcmRlci5pc1R5cGVTdXBwb3J0ZWQoJ3ZpZGVvL3dlYm07Y29kZWNzPXZwOScpKSB7XG5cdFx0XHRtaW1lVHlwZSA9ICd2aWRlby93ZWJtO2NvZGVjcz12cDknO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtaW1lVHlwZSA9ICd2aWRlby93ZWJtJztcblx0XHR9XG5cblx0XHR0aGlzLmNodW5rcyA9IFtdO1xuXHRcdHRoaXMuYnl0ZXNSZWNvcmRlZCA9IDA7XG5cdFx0dGhpcy5zdG9wcGVkQnlTaXplID0gZmFsc2U7XG5cdFx0dGhpcy5zdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMubWVkaWFSZWNvcmRlciA9IG5ldyBNZWRpYVJlY29yZGVyKHRoaXMubWVkaWFTdHJlYW0sIHtcblx0XHRcdFx0bWltZVR5cGUsXG5cdFx0XHRcdHZpZGVvQml0c1BlclNlY29uZDogMl81MDBfMDAwLCAvLyAyLjUgTWJwcyBcdTIwMTQgZ29vZCBxdWFsaXR5LCByZWFzb25hYmxlIGZpbGUgc2l6ZVxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tSZWNvcmRpbmdTZXJ2aWNlXSBGYWlsZWQgdG8gY3JlYXRlIE1lZGlhUmVjb3JkZXI6JywgZXJyKTtcblx0XHRcdHRoaXMuc3RvcFRyYWNrcygpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gY3JlYXRlIG1lZGlhIHJlY29yZGVyLicpO1xuXHRcdH1cblxuXHRcdHRoaXMubWVkaWFSZWNvcmRlci5vbmRhdGFhdmFpbGFibGUgPSBlID0+IHtcblx0XHRcdGlmIChlLmRhdGEgJiYgZS5kYXRhLnNpemUgPiAwKSB7XG5cdFx0XHRcdGlmICh0aGlzLnN0b3BwZWRCeVNpemUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWx3YXlzIGFjY2VwdCB0aGUgY3VycmVudCBjaHVuaywgdGhlbiBjaGVjayBpZiB3ZSd2ZSBoaXQgdGhlIGxpbWl0LlxuXHRcdFx0XHQvLyBUaGlzIG1lYW5zIHRoZSBmaWxlIG1heSBvdmVyc2hvb3QgYnkgdXAgdG8gb25lIDEwMDBtcyBjaHVuayxcblx0XHRcdFx0Ly8gd2hpY2ggaXMgc21hbGwgZW5vdWdoIGZvciB0aGUgMTAwIE1CIEdpdEh1YiBsaW1pdC5cblx0XHRcdFx0dGhpcy5jaHVua3MucHVzaChlLmRhdGEpO1xuXHRcdFx0XHR0aGlzLmJ5dGVzUmVjb3JkZWQgKz0gZS5kYXRhLnNpemU7XG5cdFx0XHRcdGlmICh0aGlzLmJ5dGVzUmVjb3JkZWQgPj0gTUFYX0ZJTEVfU0laRV9CWVRFUyAqIFNJWkVfTElNSVRfVEhSRVNIT0xEICYmIHRoaXMuX3N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW1JlY29yZGluZ1NlcnZpY2VdIE1heCBmaWxlIHNpemUgcmVhY2hlZCwgc3RvcHBpbmcgcmVjb3JkaW5nLicpO1xuXHRcdFx0XHRcdHRoaXMuc3RvcHBlZEJ5U2l6ZSA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5tZWRpYVJlY29yZGVyPy5zdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gSWYgdGhlIHVzZXIgc3RvcHMgc2hhcmluZyB2aWEgdGhlIGJyb3dzZXIvT1MgVUksIHRyZWF0IGl0IGFzIHN0b3Bcblx0XHR0aGlzLm1lZGlhUmVjb3JkZXIub25zdG9wID0gKCkgPT4ge1xuXHRcdFx0Ly8gT25seSBtb3ZlIHRvIFN0b3BwZWQgaWYgd2Ugd2VyZSBSZWNvcmRpbmcgKGF2b2lkIGRvdWJsZSB0cmFuc2l0aW9uKVxuXHRcdFx0aWYgKHRoaXMuX3N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcpIHtcblx0XHRcdFx0dGhpcy5zdG9wVHJhY2tzKCk7XG5cdFx0XHRcdHRoaXMuc2V0U3RhdGUoUmVjb3JkaW5nU3RhdGUuU3RvcHBlZCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIEFsc28gaGFuZGxlIHRoZSBzdHJlYW0gZW5kaW5nIGV4dGVybmFsbHkgKHVzZXIgY2xpY2tlZCBcIlN0b3Agc2hhcmluZ1wiKVxuXHRcdGZvciAoY29uc3QgdHJhY2sgb2YgdGhpcy5tZWRpYVN0cmVhbS5nZXRUcmFja3MoKSkge1xuXHRcdFx0dHJhY2sub25lbmRlZCA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcgJiYgdGhpcy5tZWRpYVJlY29yZGVyPy5zdGF0ZSA9PT0gJ3JlY29yZGluZycpIHtcblx0XHRcdFx0XHR0aGlzLm1lZGlhUmVjb3JkZXIuc3RvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMubWVkaWFSZWNvcmRlci5zdGFydCgxMDAwKTsgLy8gMS1zZWNvbmQgdGltZXNsaWNlIGZvciBzaXplIHRyYWNraW5nXG5cdFx0dGhpcy5zZXRTdGF0ZShSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcpO1xuXHR9XG5cblx0YXN5bmMgc3RvcFJlY29yZGluZygpOiBQcm9taXNlPElSZWNvcmRpbmdEYXRhIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlICE9PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcgJiYgdGhpcy5fc3RhdGUgIT09IFJlY29yZGluZ1N0YXRlLlN0b3BwZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgc3RpbGwgcmVjb3JkaW5nLCBzdG9wIHRoZSByZWNvcmRlciBhbmQgd2FpdCBmb3IgaXQgdG8gZmluaXNoXG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcgJiYgdGhpcy5tZWRpYVJlY29yZGVyPy5zdGF0ZSA9PT0gJ3JlY29yZGluZycpIHtcblx0XHRcdGNvbnN0IHJlY29yZGVyID0gdGhpcy5tZWRpYVJlY29yZGVyO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdC8vIFJlcGxhY2Ugb25zdG9wIGVudGlyZWx5IHNvIHRoZSBvcmlnaW5hbCBcImV4dGVybmFsIHN0b3BcIiBoYW5kbGVyIGRvZXNuJ3Rcblx0XHRcdFx0Ly8gZW1pdCBzZXRTdGF0ZShTdG9wcGVkKSBoZXJlLiBUaGF0IGV2ZW50IHdvdWxkIHJlLWVudGVyIHRoZSBhdXRvLXN0b3Bcblx0XHRcdFx0Ly8gbGlzdGVuZXIgKElzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lKSBhbmQgcmVjdXJzaXZlbHkgY2FsbCBzdG9wUmVjb3JkaW5nLlxuXHRcdFx0XHQvLyBFeHBsaWNpdCBzdG9wcyBvd24gdGhlIHN0YXRlIHRyYW5zaXRpb25zIHRoZW1zZWx2ZXMgYW5kIGVuZCB3aXRoXG5cdFx0XHRcdC8vIHNldFN0YXRlKElkbGUpIGJlbG93LCB3aGljaCBzdGlsbCBzYXRpc2ZpZXMgdGhlIElSZWNvcmRpbmdTZXJ2aWNlXG5cdFx0XHRcdC8vIGNvbnRyYWN0IGJ5IGVtaXR0aW5nIHRoZSB0ZXJtaW5hbCBJZGxlIHRyYW5zaXRpb24uXG5cdFx0XHRcdHJlY29yZGVyLm9uc3RvcCA9ICgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdC8vIEZsdXNoIGFueSBidWZmZXJlZCBkYXRhIGJlZm9yZSBzdG9wcGluZ1xuXHRcdFx0XHRyZWNvcmRlci5yZXF1ZXN0RGF0YSgpO1xuXHRcdFx0XHRyZWNvcmRlci5zdG9wKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnN0b3BUcmFja3MoKTtcblxuXHRcdGlmICh0aGlzLmNodW5rcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuc2V0U3RhdGUoUmVjb3JkaW5nU3RhdGUuSWRsZSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1pbWVUeXBlID0gdGhpcy5tZWRpYVJlY29yZGVyPy5taW1lVHlwZSA/PyAndmlkZW8vd2VibSc7XG5cdFx0Y29uc3QgYmxvYiA9IG5ldyBCbG9iKHRoaXMuY2h1bmtzLCB7IHR5cGU6IG1pbWVUeXBlIH0pO1xuXHRcdGNvbnN0IGR1cmF0aW9uTXMgPSBEYXRlLm5vdygpIC0gdGhpcy5zdGFydFRpbWU7XG5cblx0XHRjb25zdCBkYXRhOiBJUmVjb3JkaW5nRGF0YSA9IHtcblx0XHRcdGJsb2IsXG5cdFx0XHRtaW1lVHlwZSxcblx0XHRcdGR1cmF0aW9uTXMsXG5cdFx0XHRzaXplQnl0ZXM6IGJsb2Iuc2l6ZSxcblx0XHRcdHN0b3BwZWRCeVNpemU6IHRoaXMuc3RvcHBlZEJ5U2l6ZSxcblx0XHR9O1xuXG5cdFx0dGhpcy5jaHVua3MgPSBbXTtcblx0XHR0aGlzLm1lZGlhUmVjb3JkZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5zZXRTdGF0ZShSZWNvcmRpbmdTdGF0ZS5JZGxlKTtcblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0ZGlzY2FyZFJlY29yZGluZygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tZWRpYVJlY29yZGVyKSB7XG5cdFx0XHQvLyBDbGVhciBoYW5kbGVycyBCRUZPUkUgc3RvcCgpIHNvIGFueSBmaW5hbCBvbmRhdGFhdmFpbGFibGUgZmlyZWQgYWZ0ZXIgc3RvcCgpXG5cdFx0XHQvLyBkb2VzIG5vdCBhcHBlbmQgYSBjaHVuayB0aGF0IHdlJ2QgdGhlbiBoYXZlIHRvIEdDIGV4cGxpY2l0bHkuXG5cdFx0XHR0aGlzLm1lZGlhUmVjb3JkZXIub25kYXRhYXZhaWxhYmxlID0gbnVsbDtcblx0XHRcdHRoaXMubWVkaWFSZWNvcmRlci5vbnN0b3AgPSBudWxsO1xuXHRcdFx0aWYgKHRoaXMuX3N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcgJiYgdGhpcy5tZWRpYVJlY29yZGVyLnN0YXRlID09PSAncmVjb3JkaW5nJykge1xuXHRcdFx0XHR0aGlzLm1lZGlhUmVjb3JkZXIuc3RvcCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmNsZWFudXAoKTtcblx0XHR0aGlzLnNldFN0YXRlKFJlY29yZGluZ1N0YXRlLklkbGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9wVHJhY2tzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1lZGlhU3RyZWFtKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRyYWNrIG9mIHRoaXMubWVkaWFTdHJlYW0uZ2V0VHJhY2tzKCkpIHtcblx0XHRcdFx0dHJhY2suc3RvcCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5tZWRpYVN0cmVhbSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFudXAoKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9wVHJhY2tzKCk7XG5cdFx0dGhpcy5jaHVua3MgPSBbXTtcblx0XHR0aGlzLmJ5dGVzUmVjb3JkZWQgPSAwO1xuXHRcdHRoaXMuc3RvcHBlZEJ5U2l6ZSA9IGZhbHNlO1xuXHRcdHRoaXMubWVkaWFSZWNvcmRlciA9IHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBNEMsc0JBQXNCO0FBRWxFLE1BQU0sc0JBQXNCLE1BQU0sT0FBTztBQUN6QyxNQUFNLHVCQUF1QjtBQUV0QixJQUFNLHlCQUFOLGNBQXFDLFdBQXdDO0FBQUEsRUFvQm5GLFlBQytCLFlBQ08sbUJBQ3BDO0FBQ0QsVUFBTTtBQUh3QjtBQUNPO0FBakJ0QztBQUFBO0FBQUE7QUFBQSxTQUFTLGNBQWMsT0FBTyxrQkFBa0IsZUFDNUMsT0FBTyxjQUFjLGVBQ3JCLENBQUMsQ0FBQyxVQUFVLGNBQWM7QUFFOUIsU0FBUSxTQUFTLGVBQWU7QUFDaEMsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQXdCLENBQUM7QUFDakYsU0FBUyxtQkFBMEMsS0FBSyxrQkFBa0I7QUFJMUUsU0FBUSxTQUFpQixDQUFDO0FBQzFCLFNBQVEsZ0JBQWdCO0FBQ3hCLFNBQVEsZ0JBQWdCO0FBQ3hCLFNBQVEsWUFBWTtBQVFuQixTQUFLLFVBQVUsYUFBYSxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUM7QUFBQSxFQUNsRDtBQUFBLEVBRUEsbUNBQWdIO0FBQy9HLFdBQU8sS0FBSyxrQkFBa0IscUJBQXFCLFFBQVE7QUFBQSxFQUM1RDtBQUFBLEVBRUEsc0NBQTRDO0FBQzNDLFFBQUksYUFBYTtBQUVoQixXQUFLLEtBQUssa0JBQWtCLGFBQWEsK0VBQStFO0FBQUEsSUFDekg7QUFBQSxFQUNEO0FBQUEsRUFF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
