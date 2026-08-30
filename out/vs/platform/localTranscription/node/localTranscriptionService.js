import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { dirname, join } from "../../../base/common/path.js";
import { ensureFoundryLocalRuntime } from "./foundryLocalRuntime.js";
import {
  DEFAULT_LOCAL_TRANSCRIPTION_MODEL,
  LocalTranscriptionModelState
} from "../common/localTranscription.js";
import { importFoundryLocalModel } from "./foundryLocalModelImport.js";
const SAMPLE_RATE = 16e3;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const FOUNDRY_APP_NAME = "vscode-dictation";
function runtimeCacheDir(modelCacheDir) {
  return join(dirname(modelCacheDir), "chatDictationRuntime");
}
function classifyModelError(message) {
  const text = message.toLowerCase();
  if (/\b(404|not found|no such file|does not exist|could not locate|repository not found|unknown model)\b/.test(text)) {
    return "notFound";
  }
  if (/\b(network|fetch|econn|enotfound|etimedout|socket|dns|offline|proxy|tls|certificate|getaddrinfo|feed)\b/.test(text)) {
    return "network";
  }
  if (/\b(out of memory|oom|enomem|allocation failed|cannot allocate)\b/.test(text)) {
    return "memory";
  }
  if (/\b(enospc|no space left|disk)\b/.test(text)) {
    return "disk";
  }
  if (/\b(eacces|eperm|permission denied|access is denied)\b/.test(text)) {
    return "permission";
  }
  return "unknown";
}
function transcriptSeparator(current, next) {
  if (!current || !next || /[\s([{]$/.test(current) || /^\s|^[,.;:!?)}\]'"]/.test(next)) {
    return "";
  }
  return " ";
}
function appendTranscriptChunk(current, next) {
  if (!next.trim()) {
    return current;
  }
  if (!current) {
    return next.trimStart();
  }
  return `${current}${next}`;
}
class TranscriptAccumulator {
  constructor() {
    this._segments = /* @__PURE__ */ new Map();
    this._nextOrder = 0;
  }
  /** Record a finalized segment, replacing an earlier revision of the same one. */
  addFinal(text, startTime, endTime) {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }
    const key = startTime !== null || endTime !== null ? `${startTime ?? "na"}:${endTime ?? "na"}` : `untimed:${this._nextOrder}`;
    const existing = this._segments.get(key);
    if (existing) {
      existing.text = normalized;
      return;
    }
    this._segments.set(key, { order: this._nextOrder, startTime, endTime, text: normalized });
    this._nextOrder++;
  }
  /** The cumulative finalized transcript, segments joined in time order. */
  getText() {
    return [...this._segments.values()].sort((a, b) => {
      if (a.startTime !== null && b.startTime !== null) {
        return a.startTime - b.startTime;
      }
      if (a.startTime !== null) {
        return -1;
      }
      if (b.startTime !== null) {
        return 1;
      }
      return a.order - b.order;
    }).reduce((text, seg) => `${text}${transcriptSeparator(text, seg.text)}${seg.text}`, "").trim();
  }
  reset() {
    this._segments.clear();
    this._nextOrder = 0;
  }
}
class LocalTranscriptionService extends Disposable {
  constructor() {
    super();
    this.isSupported = true;
    this._onDidChangeModelStatus = this._register(new Emitter());
    this.onDidChangeModelStatus = this._onDidChangeModelStatus.event;
    this._onDidTranscribe = this._register(new Emitter());
    this.onDidTranscribe = this._onDidTranscribe.event;
    this._status = { state: LocalTranscriptionModelState.Idle };
    this._sessionActive = false;
    /** Cumulative finalized transcript, accumulated per timed segment. */
    this._accumulator = new TranscriptAccumulator();
    /** Latest interim (not-yet-finalized) segment text. */
    this._partialText = "";
    /**
     * PCM chunks captured before the model finished loading and the session
     * opened. Flushed in order once the session starts so no leading audio is
     * dropped while the first-use download/load completes.
     */
    this._pendingChunks = [];
    /**
     * Serializes every `session.append()` through a single FIFO chain. Both the
     * buffered-backlog flush and live `pushAudio()` enqueue here, so audio is
     * always appended to native core in capture order — even across the first-use
     * handoff — and `stop()` can await this to guarantee the final chunk lands
     * before `session.stop()` drains the stream. The stored tail swallows
     * rejections so one failed append doesn't break ordering for the rest; the
     * real (rejectable) promise is returned to callers that need to observe it.
     */
    this._appendChain = Promise.resolve();
    /**
     * Monotonically bumped whenever a session starts or is reset, so a slow
     * session opened for one recording can detect that it is now stale and avoid
     * emitting its transcript into a later session.
     */
    this._generation = 0;
    this._register(toDisposable(() => {
      void this._disposeSession();
      this._modelPrepareCts?.cancel();
      this._modelPrepareCts?.dispose();
      this._modelPrepareCts = void 0;
    }));
  }
  async getModelStatus() {
    return this._status;
  }
  importModel(options) {
    return importFoundryLocalModel(options.sourcePath, options.cacheDir);
  }
  _setStatus(status) {
    this._status = status;
    this._onDidChangeModelStatus.fire(status);
  }
  async start(options) {
    this._applyProxyEnv(options.proxyUrl, options.noProxy, options.proxyStrictSSL, options.proxyAuthorization);
    this._runtimeDownload = options.runtimeUrlTemplate && options.runtimeVersion ? { urlTemplate: options.runtimeUrlTemplate, version: options.runtimeVersion } : void 0;
    await this._disposeSession();
    this._generation++;
    const generation = this._generation;
    this._sessionActive = true;
    this._accumulator.reset();
    this._partialText = "";
    this._pendingChunks = [];
    this._runtimeError = void 0;
    const model = options.model ?? DEFAULT_LOCAL_TRANSCRIPTION_MODEL;
    const language = options.language;
    this._openPromise = this._openSession(options.cacheDir, model, language, generation);
    this._openPromise.catch(() => {
    });
  }
  /**
   * Apply VS Code's proxy settings as environment variables for this process, so
   * every download leg (our fetches and the native model download) honors a proxy
   * configured only in VS Code (not in the OS environment):
   * - `http.proxy`/`http.noProxy` → `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY`.
   * - `http.proxyAuthorization` (a `Basic <base64>` value) → folded into the proxy
   *   URL's userinfo so both our `HttpsProxyAgent` and the native HTTP stack send
   *   `Proxy-Authorization`. Non-`Basic` schemes (e.g. Negotiate/NTLM) cannot be
   *   carried this way and are left to OS-level auth.
   * - `http.proxyStrictSSL === false` → disable TLS certificate verification for
   *   the Node download legs. The native model leg still requires the CA in the OS
   *   trust store.
   *
   * A blank/undefined `proxyUrl` leaves any inherited environment proxy untouched.
   */
  _applyProxyEnv(proxyUrl, noProxy, proxyStrictSSL, proxyAuthorization) {
    if (proxyStrictSSL === false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    if (!proxyUrl) {
      return;
    }
    const effectiveProxyUrl = this._embedProxyCredentials(proxyUrl, proxyAuthorization);
    process.env.HTTPS_PROXY = effectiveProxyUrl;
    process.env.HTTP_PROXY = effectiveProxyUrl;
    if (noProxy) {
      process.env.NO_PROXY = noProxy;
    }
  }
  /**
   * Fold a `Basic <base64>` `http.proxyAuthorization` value into `proxyUrl`'s
   * userinfo so proxy credentials survive the env-var bridge to every leg.
   * Returns `proxyUrl` unchanged when there is nothing to add or the header is
   * not a decodable `Basic` credential or the URL already carries credentials.
   */
  _embedProxyCredentials(proxyUrl, proxyAuthorization) {
    if (!proxyAuthorization) {
      return proxyUrl;
    }
    const basic = /^Basic\s+(?<token>[A-Za-z0-9+/=]+)$/i.exec(proxyAuthorization.trim());
    if (!basic?.groups?.token) {
      return proxyUrl;
    }
    let parsed;
    try {
      parsed = new URL(proxyUrl);
    } catch {
      return proxyUrl;
    }
    if (parsed.username || parsed.password) {
      return proxyUrl;
    }
    const decoded = Buffer.from(basic.groups.token, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return proxyUrl;
    }
    parsed.username = encodeURIComponent(decoded.slice(0, separator));
    parsed.password = encodeURIComponent(decoded.slice(separator + 1));
    return parsed.toString();
  }
  /**
   * Ensure the Foundry Local manager exists, the selected model is downloaded
   * and loaded, and a fresh live transcription session is started. Buffered
   * audio captured while this was in flight is flushed once the session opens.
   */
  async _openSession(cacheDir, modelId, language, generation) {
    try {
      const model = await this._ensureModel(cacheDir, modelId);
      if (generation !== this._generation) {
        return;
      }
      const audioClient = model.createAudioClient();
      if (language) {
        audioClient.settings.language = language;
      }
      const session = audioClient.createLiveTranscriptionSession();
      session.settings.sampleRate = SAMPLE_RATE;
      session.settings.channels = CHANNELS;
      session.settings.bitsPerSample = BITS_PER_SAMPLE;
      if (language) {
        session.settings.language = language;
      }
      await session.start();
      if (generation !== this._generation) {
        await session.dispose();
        return;
      }
      this._session = session;
      this._setStatus({ state: LocalTranscriptionModelState.Ready });
      this._consumePromise = this._consume(session, generation);
      const buffered = this._pendingChunks;
      this._pendingChunks = [];
      for (const chunk of buffered) {
        if (generation !== this._generation) {
          break;
        }
        this._enqueueAppend(session, generation, chunk).catch((err) => {
          if (generation === this._generation) {
            const message = String(err instanceof Error ? err.message : err);
            this._setStatus({ state: LocalTranscriptionModelState.Error, error: message, errorCode: classifyModelError(message) });
          }
        });
      }
    } catch (err) {
      if (generation === this._generation) {
        const message = String(err instanceof Error ? err.message : err);
        this._setStatus({ state: LocalTranscriptionModelState.Error, error: message, errorCode: classifyModelError(message) });
      }
      throw err;
    }
  }
  /**
   * Append `chunk` to `session` after every previously enqueued append has
   * completed, preserving capture order. Returns a promise that rejects if this
   * particular append fails (for callers that must surface it); the internal
   * chain continues regardless so ordering is preserved for later chunks.
   */
  _enqueueAppend(session, generation, chunk) {
    const result = this._appendChain.then(() => {
      if (generation !== this._generation || this._session !== session) {
        return;
      }
      return session.append(chunk);
    });
    this._appendChain = result.catch(() => {
    });
    return result;
  }
  /**
   * Download (if needed) and load the selected model through Foundry Local,
   * reporting download/load progress via the model status. Idempotent: a load
   * already in flight (or the same model already loaded) is reused.
   */
  async _ensureModel(cacheDir, modelId) {
    if (this._model && this._loadedModelId === modelId) {
      return this._model;
    }
    if (this._modelPromise && this._loadedModelId === modelId) {
      return this._modelPromise;
    }
    this._loadedModelId = modelId;
    const cts = new CancellationTokenSource();
    this._modelPrepareCts = cts;
    this._modelPromise = (async () => {
      try {
        this._setStatus({ state: LocalTranscriptionModelState.Loading });
        if (this._runtimeDownload) {
          const nativeDir = await ensureFoundryLocalRuntime(runtimeCacheDir(cacheDir), this._runtimeDownload, cts.token);
          process.env.VSCODE_FOUNDRY_LOCAL_NATIVE_DIR = nativeDir;
        }
        if (!this._sdk) {
          this._sdk = await import("foundry-local-sdk");
        }
        if (!this._manager) {
          this._manager = await this._sdk.FoundryLocalManager.createAsync({
            appName: FOUNDRY_APP_NAME,
            modelCacheDir: cacheDir,
            logLevel: "warn"
          });
        }
        const model = await this._manager.catalog.getModel(modelId);
        let didDownload = false;
        if (!model.isCached) {
          didDownload = true;
          this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: 0 });
          const ac = new AbortController();
          const sub = cts.token.onCancellationRequested(() => ac.abort());
          try {
            await model.download((percent) => {
              this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: Math.min(1, Math.max(0, percent / 100)) });
            }, ac.signal);
          } finally {
            sub.dispose();
          }
        }
        if (cts.token.isCancellationRequested) {
          throw new Error("cancelled");
        }
        this._setStatus({ state: LocalTranscriptionModelState.Loading });
        await model.load();
        this._model = model;
        this._setStatus({ state: LocalTranscriptionModelState.Ready, downloaded: didDownload });
        if (this._modelPrepareCts === cts) {
          this._modelPrepareCts = void 0;
        }
        return model;
      } catch (err) {
        this._model = void 0;
        this._modelPromise = void 0;
        this._loadedModelId = void 0;
        if (this._modelPrepareCts === cts) {
          this._modelPrepareCts = void 0;
        }
        throw err;
      }
    })();
    return this._modelPromise;
  }
  /**
   * Drain the session's result stream, maintaining a cumulative transcript.
   * Foundry emits per-segment results flagged `is_final`; a finalized segment is
   * recorded (and replaced if later refined) in the accumulator, while a
   * non-final result is the interim tail of the segment currently being spoken.
   * Each update fires the full cumulative transcript so the renderer can shimmer
   * the interim tail and solidify finalized text.
   */
  async _consume(session, generation) {
    try {
      for await (const result of session.getStream()) {
        if (generation !== this._generation) {
          break;
        }
        const text = this._resultText(result);
        if (result.is_final) {
          this._accumulator.addFinal(text, result.start_time ?? null, result.end_time ?? null);
          this._partialText = "";
        } else {
          this._partialText = appendTranscriptChunk(this._partialText, text);
        }
        if (this._sessionActive) {
          this._onDidTranscribe.fire({ text: this._cumulativeText(), isFinal: false, finalizedText: this._accumulator.getText() });
        }
      }
    } catch (err) {
      if (generation === this._generation && this._sessionActive) {
        const error = err instanceof Error ? err : new Error(String(err));
        this._runtimeError = error;
        this._setStatus({ state: LocalTranscriptionModelState.Error, error: error.message, errorCode: "runtime" });
      }
    }
  }
  /** Finalized transcript plus the current interim tail, joined naturally. */
  _cumulativeText() {
    const finalized = this._accumulator.getText();
    const partial = this._partialText;
    if (!partial) {
      return finalized;
    }
    if (!finalized) {
      return partial;
    }
    return `${finalized}${transcriptSeparator(finalized, partial)}${partial}`;
  }
  _resultText(result) {
    const part = result.content?.[0];
    return part?.text ?? part?.transcript ?? "";
  }
  async pushAudio(chunk) {
    if (!this._sessionActive) {
      return;
    }
    const bytes = chunk.buffer;
    const pcm = new Uint8Array(bytes.byteLength);
    pcm.set(bytes);
    if (this._session) {
      await this._enqueueAppend(this._session, this._generation, pcm);
    } else {
      this._pendingChunks.push(pcm);
    }
  }
  async stop() {
    const generation = this._generation;
    this._sessionActive = false;
    if (this._openPromise) {
      try {
        await this._openPromise;
      } catch {
      }
    }
    if (generation !== this._generation) {
      return "";
    }
    const session = this._session;
    if (!session) {
      const text2 = this._cumulativeText();
      this._resetSessionState();
      return text2;
    }
    try {
      try {
        await this._appendChain;
      } catch {
      }
      await session.stop();
    } catch {
    }
    if (this._consumePromise) {
      try {
        await this._consumePromise;
      } catch {
      }
    }
    const runtimeError = this._runtimeError;
    if (runtimeError && generation === this._generation) {
      await this._disposeSession();
      this._resetSessionState();
      throw runtimeError;
    }
    const text = this._cumulativeText();
    if (generation === this._generation) {
      this._onDidTranscribe.fire({ text, isFinal: true, finalizedText: text });
    }
    await this._disposeSession();
    this._resetSessionState();
    return text;
  }
  async cancel() {
    this._modelPrepareCts?.cancel();
    this._modelPrepareCts = void 0;
    this._sessionActive = false;
    this._generation++;
    await this._disposeSession();
    this._resetSessionState();
  }
  async _disposeSession() {
    const session = this._session;
    this._session = void 0;
    const consume = this._consumePromise;
    this._consumePromise = void 0;
    if (session) {
      try {
        await session.dispose();
      } catch {
      }
    }
    if (consume) {
      try {
        await consume;
      } catch {
      }
    }
  }
  _resetSessionState() {
    this._sessionActive = false;
    this._accumulator.reset();
    this._partialText = "";
    this._pendingChunks = [];
    this._appendChain = Promise.resolve();
    this._runtimeError = void 0;
  }
}
export {
  LocalTranscriptionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbG9jYWxUcmFuc2NyaXB0aW9uXFxub2RlXFxsb2NhbFRyYW5zY3JpcHRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZW5zdXJlRm91bmRyeUxvY2FsUnVudGltZSB9IGZyb20gJy4vZm91bmRyeUxvY2FsUnVudGltZS5qcyc7XG5pbXBvcnQge1xuXHRJTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0dXMsXG5cdElMb2NhbFRyYW5zY3JpcHRpb25SZXN1bHQsXG5cdElMb2NhbFRyYW5zY3JpcHRpb25TZXJ2aWNlLFxuXHRERUZBVUxUX0xPQ0FMX1RSQU5TQ1JJUFRJT05fTU9ERUwsXG5cdElMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbEltcG9ydFJlc3VsdCxcblx0TG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0ZSxcbn0gZnJvbSAnLi4vY29tbW9uL2xvY2FsVHJhbnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBpbXBvcnRGb3VuZHJ5TG9jYWxNb2RlbCB9IGZyb20gJy4vZm91bmRyeUxvY2FsTW9kZWxJbXBvcnQuanMnO1xuXG4vKiogUENNIGF1ZGlvIGZvcm1hdCB0aGUgcmVuZGVyZXIgY2FwdHVyZXMgYW5kIHN0cmVhbXM6IG1vbm8gMTYga0h6IHNpZ25lZCAxNi1iaXQuICovXG5jb25zdCBTQU1QTEVfUkFURSA9IDE2MDAwO1xuY29uc3QgQ0hBTk5FTFMgPSAxO1xuY29uc3QgQklUU19QRVJfU0FNUExFID0gMTY7XG5cbi8qKiBBcHBsaWNhdGlvbiBuYW1lIHJlcG9ydGVkIHRvIEZvdW5kcnkgTG9jYWwgZm9yIGxvZ3MvdGVsZW1ldHJ5IGFuZCBpdHMgZGF0YSBkaXIuICovXG5jb25zdCBGT1VORFJZX0FQUF9OQU1FID0gJ3ZzY29kZS1kaWN0YXRpb24nO1xuXG4vKipcbiAqIERpcmVjdG9yeSBob2xkaW5nIHRoZSBvbi1kZW1hbmQgRm91bmRyeSBMb2NhbCBuYXRpdmUgcnVudGltZSAoYWRkb24gKyBjb3JlXG4gKiBsaWJyYXJpZXMpLiBEZXJpdmVkIGFzIGEgc2libGluZyBvZiB0aGUgbW9kZWwgY2FjaGUgZGlyIHNvIGJvdGggbGl2ZSB1bmRlciBWU1xuICogQ29kZSdzIGNhY2hlIGhvbWU7IGtlcHQgc2VwYXJhdGUgZnJvbSBtb2RlbCBmaWxlcyBzaW5jZSBpdCBpcyB2ZXJzaW9uZWQgYnkgU0RLXG4gKiB2ZXJzaW9uIGFuZCBwcm92aXNpb25lZCBpbmRlcGVuZGVudGx5LlxuICovXG5mdW5jdGlvbiBydW50aW1lQ2FjaGVEaXIobW9kZWxDYWNoZURpcjogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGpvaW4oZGlybmFtZShtb2RlbENhY2hlRGlyKSwgJ2NoYXREaWN0YXRpb25SdW50aW1lJyk7XG59XG5cbi8qKlxuICogRm91bmRyeSBMb2NhbCBKUyBTREsuIEl0IGlzIGFuIEVTTSBwYWNrYWdlIHRoYXQgbG9hZHMgYSBuYXRpdmUgYWRkb25cbiAqIChgZm91bmRyeV9sb2NhbF9uYXBpLm5vZGVgKSBwbHVzIHRoZSBGb3VuZHJ5IExvY2FsIENvcmUgLyBvbm54cnVudGltZSAvXG4gKiBvbm54cnVudGltZS1nZW5haSBzaGFyZWQgbGlicmFyaWVzLiBJbXBvcnQgaXQgbGF6aWx5IHNvIGZvcmtpbmcgdGhlIHV0aWxpdHlcbiAqIHByb2Nlc3Mgc3RheXMgY2hlYXA7IHRoZSBtb2RlbCBpdHNlbGYgaXMgb25seSBkb3dubG9hZGVkL2xvYWRlZCB3aGVuIGRpY3RhdGlvblxuICogZmlyc3QgcnVucy5cbiAqL1xudHlwZSBGb3VuZHJ5TG9jYWwgPSB0eXBlb2YgaW1wb3J0KCdmb3VuZHJ5LWxvY2FsLXNkaycpO1xudHlwZSBGb3VuZHJ5TG9jYWxNYW5hZ2VyID0gaW1wb3J0KCdmb3VuZHJ5LWxvY2FsLXNkaycpLkZvdW5kcnlMb2NhbE1hbmFnZXI7XG50eXBlIElNb2RlbCA9IGltcG9ydCgnZm91bmRyeS1sb2NhbC1zZGsnKS5JTW9kZWw7XG50eXBlIExpdmVBdWRpb1RyYW5zY3JpcHRpb25TZXNzaW9uID0gaW1wb3J0KCdmb3VuZHJ5LWxvY2FsLXNkaycpLkxpdmVBdWRpb1RyYW5zY3JpcHRpb25TZXNzaW9uO1xudHlwZSBMaXZlQXVkaW9UcmFuc2NyaXB0aW9uUmVzcG9uc2UgPSBpbXBvcnQoJ2ZvdW5kcnktbG9jYWwtc2RrJykuTGl2ZUF1ZGlvVHJhbnNjcmlwdGlvblJlc3BvbnNlO1xuXG4vKipcbiAqIE1hcCBhIHJhdyBtb2RlbCBkb3dubG9hZC9sb2FkIGVycm9yIG1lc3NhZ2UgdG8gYSBmaXhlZCwgbG93LWNhcmRpbmFsaXR5IGNvZGVcbiAqIHNhZmUgdG8gZW1pdCBhcyB0ZWxlbWV0cnkuIFRoZSByYXcgbWVzc2FnZSBjYW4gY29udGFpbiBwYXRocywgVVJMcywgb3Igb3RoZXJcbiAqIGR5bmFtaWMgZGV0YWlsLCBzbyBvbmx5IHRoZSByZXR1cm5lZCBhbGxvd2xpc3RlZCBjb2RlIHNob3VsZCBiZSByZXBvcnRlZC5cbiAqL1xuZnVuY3Rpb24gY2xhc3NpZnlNb2RlbEVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHRleHQgPSBtZXNzYWdlLnRvTG93ZXJDYXNlKCk7XG5cdGlmICgvXFxiKDQwNHxub3QgZm91bmR8bm8gc3VjaCBmaWxlfGRvZXMgbm90IGV4aXN0fGNvdWxkIG5vdCBsb2NhdGV8cmVwb3NpdG9yeSBub3QgZm91bmR8dW5rbm93biBtb2RlbClcXGIvLnRlc3QodGV4dCkpIHtcblx0XHRyZXR1cm4gJ25vdEZvdW5kJztcblx0fVxuXHRpZiAoL1xcYihuZXR3b3JrfGZldGNofGVjb25ufGVub3Rmb3VuZHxldGltZWRvdXR8c29ja2V0fGRuc3xvZmZsaW5lfHByb3h5fHRsc3xjZXJ0aWZpY2F0ZXxnZXRhZGRyaW5mb3xmZWVkKVxcYi8udGVzdCh0ZXh0KSkge1xuXHRcdHJldHVybiAnbmV0d29yayc7XG5cdH1cblx0aWYgKC9cXGIob3V0IG9mIG1lbW9yeXxvb218ZW5vbWVtfGFsbG9jYXRpb24gZmFpbGVkfGNhbm5vdCBhbGxvY2F0ZSlcXGIvLnRlc3QodGV4dCkpIHtcblx0XHRyZXR1cm4gJ21lbW9yeSc7XG5cdH1cblx0aWYgKC9cXGIoZW5vc3BjfG5vIHNwYWNlIGxlZnR8ZGlzaylcXGIvLnRlc3QodGV4dCkpIHtcblx0XHRyZXR1cm4gJ2Rpc2snO1xuXHR9XG5cdGlmICgvXFxiKGVhY2Nlc3xlcGVybXxwZXJtaXNzaW9uIGRlbmllZHxhY2Nlc3MgaXMgZGVuaWVkKVxcYi8udGVzdCh0ZXh0KSkge1xuXHRcdHJldHVybiAncGVybWlzc2lvbic7XG5cdH1cblx0cmV0dXJuICd1bmtub3duJztcbn1cblxuLyoqXG4gKiBDaG9vc2UgdGhlIHNlcGFyYXRvciB0byBwbGFjZSBiZXR3ZWVuIHR3byB0cmFuc2NyaXB0IGZyYWdtZW50cy4gTWlycm9ycyB0aGVcbiAqIEdpdEh1YiBDb3BpbG90IGFwcCdzIGpvaW5pbmcgcnVsZTogbm8gc3BhY2UgaWYgdGhlIGxlZnQgYWxyZWFkeSBlbmRzIGluIGFuXG4gKiBvcGVuZXIvd2hpdGVzcGFjZSBvciB0aGUgcmlnaHQgYmVnaW5zIHdpdGggd2hpdGVzcGFjZSBvciBjbG9zaW5nIHB1bmN0dWF0aW9uLFxuICogb3RoZXJ3aXNlIGEgc2luZ2xlIHNwYWNlLlxuICovXG5mdW5jdGlvbiB0cmFuc2NyaXB0U2VwYXJhdG9yKGN1cnJlbnQ6IHN0cmluZywgbmV4dDogc3RyaW5nKTogJycgfCAnICcge1xuXHRpZiAoIWN1cnJlbnQgfHwgIW5leHQgfHwgL1tcXHMoW3tdJC8udGVzdChjdXJyZW50KSB8fCAvXlxcc3xeWywuOzohPyl9XFxdJ1wiXS8udGVzdChuZXh0KSkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRyZXR1cm4gJyAnO1xufVxuXG4vKipcbiAqIEFwcGVuZCBhIG5vbi1maW5hbCAoaW50ZXJpbSkgdHJhbnNjcmlwdCBjaHVuayB0byB0aGUgY3VycmVudCBwYXJ0aWFsIHRleHQuXG4gKiBGb3VuZHJ5IExvY2FsIGVtaXRzIGludGVyaW0gcmVzdWx0cyBmb3IgdGhlIGluLXByb2dyZXNzIHNlZ21lbnQgYXMgKmRlbHRhcyogXHUyMDE0XG4gKiBlYWNoIGNhcnJpZXMgb25seSB0aGUgbmV3bHkgcmVjb2duaXplZCB0ZXh0ICh3aXRoIGl0cyBvd24gbGVhZGluZy90cmFpbGluZ1xuICogc3BhY2luZyksIE5PVCB0aGUgY3VtdWxhdGl2ZSBwYXJ0aWFsIHNvIGZhciBcdTIwMTQgc28gdGhleSBtdXN0IGJlIGNvbmNhdGVuYXRlZFxuICogdmVyYmF0aW0gcmF0aGVyIHRoYW4gcmVwbGFjZWQuIFJlcGxhY2luZyB3b3VsZCBkcm9wIGVhcmxpZXIgcGFydGlhbCB3b3Jkc1xuICogKGUuZy4gaW50ZXJpbSBcImhlbGxvXCIgdGhlbiBcIiB3b3JsZFwiIG11c3QgeWllbGQgXCJoZWxsbyB3b3JsZFwiLCBub3QgXCJ3b3JsZFwiKS5cbiAqIE1pcnJvcnMgdGhlIEdpdEh1YiBDb3BpbG90IGFwcCdzIGBhcHBlbmRWb2ljZVRyYW5zY3JpcHRDaHVua2AuXG4gKi9cbmZ1bmN0aW9uIGFwcGVuZFRyYW5zY3JpcHRDaHVuayhjdXJyZW50OiBzdHJpbmcsIG5leHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghbmV4dC50cmltKCkpIHtcblx0XHRyZXR1cm4gY3VycmVudDtcblx0fVxuXHRpZiAoIWN1cnJlbnQpIHtcblx0XHRyZXR1cm4gbmV4dC50cmltU3RhcnQoKTtcblx0fVxuXHRyZXR1cm4gYCR7Y3VycmVudH0ke25leHR9YDtcbn1cblxuaW50ZXJmYWNlIElGaW5hbFNlZ21lbnQge1xuXHRyZWFkb25seSBvcmRlcjogbnVtYmVyO1xuXHRyZWFkb25seSBzdGFydFRpbWU6IG51bWJlciB8IG51bGw7XG5cdHJlYWRvbmx5IGVuZFRpbWU6IG51bWJlciB8IG51bGw7XG5cdHRleHQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBBY2N1bXVsYXRlcyB0aGUgY3VtdWxhdGl2ZSB0cmFuc2NyaXB0IGZyb20gRm91bmRyeSBMb2NhbCdzIHBlci1zZWdtZW50XG4gKiBzdHJlYW1pbmcgcmVzdWx0cy4gRm91bmRyeSBlbWl0cyByZXN1bHRzIHdob3NlIHRleHQgaXMgc2NvcGVkIHRvIGEgc2luZ2xlXG4gKiBlbmRwb2ludGVkIHNlZ21lbnQgKE5PVCB0aGUgd2hvbGUgc2Vzc2lvbiksIGFuZCByZS1lbWl0cyB0aGUgc2FtZSBzZWdtZW50XG4gKiBtdWx0aXBsZSB0aW1lcyBhcyBpdCByZWZpbmVzIHRoZSBoeXBvdGhlc2lzIFx1MjAxNCBzbyBmaW5hbGl6ZWQgc2VnbWVudHMgbXVzdCBiZVxuICoga2V5ZWQgKGJ5IHRoZWlyIHN0YXJ0L2VuZCB0aW1lKSBhbmQgcmVwbGFjZWQgb24gcmVmaW5lbWVudCwgdGhlbiB0aGUgZGlzdGluY3RcbiAqIHNlZ21lbnRzIGpvaW5lZCBpbiB0aW1lIG9yZGVyLiBCbGluZGx5IGFwcGVuZGluZyBldmVyeSBgaXNfZmluYWxgIHJlc3VsdCB3b3VsZFxuICogZHVwbGljYXRlIHdvcmRzLiBNaXJyb3JzIHRoZSBHaXRIdWIgQ29waWxvdCBhcHAncyBgVm9pY2VUcmFuc2NyaXB0QWNjdW11bGF0b3JgLlxuICovXG5jbGFzcyBUcmFuc2NyaXB0QWNjdW11bGF0b3Ige1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWdtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBJRmluYWxTZWdtZW50PigpO1xuXHRwcml2YXRlIF9uZXh0T3JkZXIgPSAwO1xuXG5cdC8qKiBSZWNvcmQgYSBmaW5hbGl6ZWQgc2VnbWVudCwgcmVwbGFjaW5nIGFuIGVhcmxpZXIgcmV2aXNpb24gb2YgdGhlIHNhbWUgb25lLiAqL1xuXHRhZGRGaW5hbCh0ZXh0OiBzdHJpbmcsIHN0YXJ0VGltZTogbnVtYmVyIHwgbnVsbCwgZW5kVGltZTogbnVtYmVyIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSB0ZXh0LnRyaW0oKTtcblx0XHRpZiAoIW5vcm1hbGl6ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qga2V5ID0gKHN0YXJ0VGltZSAhPT0gbnVsbCB8fCBlbmRUaW1lICE9PSBudWxsKVxuXHRcdFx0PyBgJHtzdGFydFRpbWUgPz8gJ25hJ306JHtlbmRUaW1lID8/ICduYSd9YFxuXHRcdFx0OiBgdW50aW1lZDoke3RoaXMuX25leHRPcmRlcn1gO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2VnbWVudHMuZ2V0KGtleSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy50ZXh0ID0gbm9ybWFsaXplZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2VnbWVudHMuc2V0KGtleSwgeyBvcmRlcjogdGhpcy5fbmV4dE9yZGVyLCBzdGFydFRpbWUsIGVuZFRpbWUsIHRleHQ6IG5vcm1hbGl6ZWQgfSk7XG5cdFx0dGhpcy5fbmV4dE9yZGVyKys7XG5cdH1cblxuXHQvKiogVGhlIGN1bXVsYXRpdmUgZmluYWxpemVkIHRyYW5zY3JpcHQsIHNlZ21lbnRzIGpvaW5lZCBpbiB0aW1lIG9yZGVyLiAqL1xuXHRnZXRUZXh0KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZWdtZW50cy52YWx1ZXMoKV1cblx0XHRcdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGlmIChhLnN0YXJ0VGltZSAhPT0gbnVsbCAmJiBiLnN0YXJ0VGltZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdHJldHVybiBhLnN0YXJ0VGltZSAtIGIuc3RhcnRUaW1lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhLnN0YXJ0VGltZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYi5zdGFydFRpbWUgIT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYS5vcmRlciAtIGIub3JkZXI7XG5cdFx0XHR9KVxuXHRcdFx0LnJlZHVjZSgodGV4dCwgc2VnKSA9PiBgJHt0ZXh0fSR7dHJhbnNjcmlwdFNlcGFyYXRvcih0ZXh0LCBzZWcudGV4dCl9JHtzZWcudGV4dH1gLCAnJylcblx0XHRcdC50cmltKCk7XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWdtZW50cy5jbGVhcigpO1xuXHRcdHRoaXMuX25leHRPcmRlciA9IDA7XG5cdH1cbn1cblxuLyoqXG4gKiBPbi1kZXZpY2Ugc3BlZWNoLXRvLXRleHQgYmFja2VkIGJ5IEZvdW5kcnkgTG9jYWwncyBzdHJlYW1pbmcgQVNSIGVuZ2luZS4gUnVuc1xuICogaW4gYSB1dGlsaXR5IHByb2Nlc3MuIEEgc2luZ2xlIHRyYW5zY3JpcHRpb24gc2Vzc2lvbiBpcyBhY3RpdmUgYXQgYSB0aW1lXG4gKiAoZGljdGF0aW9uIGlzIGEgc2luZ2xldG9uIGluIHRoZSByZW5kZXJlcik6IHRoZSByZW5kZXJlciBzdHJlYW1zIFBDTTE2IG1vbm9cbiAqIDE2IGtIeiBhdWRpbyB2aWEgYHB1c2hBdWRpb2AsIGFuZCB0aGUgc2VydmljZSBlbWl0cyBpbnRlcmltIHRyYW5zY3JpcHRzIG9uXG4gKiBgb25EaWRUcmFuc2NyaWJlYCBhbmQgYSBmaW5hbCBvbmUgYWZ0ZXIgYHN0b3BgLlxuICovXG5leHBvcnQgY2xhc3MgTG9jYWxUcmFuc2NyaXB0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTG9jYWxUcmFuc2NyaXB0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgaXNTdXBwb3J0ZWQgPSB0cnVlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWxTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0dXM+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1vZGVsU3RhdHVzOiBFdmVudDxJTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0dXM+ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbFN0YXR1cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRyYW5zY3JpYmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTG9jYWxUcmFuc2NyaXB0aW9uUmVzdWx0PigpKTtcblx0cmVhZG9ubHkgb25EaWRUcmFuc2NyaWJlOiBFdmVudDxJTG9jYWxUcmFuc2NyaXB0aW9uUmVzdWx0PiA9IHRoaXMuX29uRGlkVHJhbnNjcmliZS5ldmVudDtcblxuXHRwcml2YXRlIF9zdGF0dXM6IElMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXR1cyA9IHsgc3RhdGU6IExvY2FsVHJhbnNjcmlwdGlvbk1vZGVsU3RhdGUuSWRsZSB9O1xuXG5cdHByaXZhdGUgX3NkazogRm91bmRyeUxvY2FsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tYW5hZ2VyOiBGb3VuZHJ5TG9jYWxNYW5hZ2VyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb2RlbDogSU1vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sb2FkZWRNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBJbi1mbGlnaHQgKG9yIHJlc29sdmVkKSBtb2RlbCBkb3dubG9hZCtsb2FkIGZvciB0aGUgc2VsZWN0ZWQgbW9kZWwuICovXG5cdHByaXZhdGUgX21vZGVsUHJvbWlzZTogUHJvbWlzZTxJTW9kZWw+IHwgdW5kZWZpbmVkO1xuXHQvKiogQ2FuY2VsbGF0aW9uIHNvdXJjZSBmb3IgdGhlIGluLWZsaWdodCBtb2RlbCBkb3dubG9hZC9sb2FkOyBhYm9ydHMgaXQgd2hlbiBjYW5jZWxsZWQuICovXG5cdHByaXZhdGUgX21vZGVsUHJlcGFyZUN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZXJlIHRvIGRvd25sb2FkIHRoZSBuYXRpdmUgcnVudGltZSBmcm9tIChwcm9kdWN0LmRpY3RhdGlvblJ1bnRpbWUpLCBvclxuXHQgKiBgdW5kZWZpbmVkYCBpbiBkZXYgYnVpbGRzIHdoZXJlIHRoZSBTREsncyBvd24gbm9kZV9tb2R1bGVzIHBheWxvYWQgaXMgdXNlZC5cblx0ICovXG5cdHByaXZhdGUgX3J1bnRpbWVEb3dubG9hZDogeyB1cmxUZW1wbGF0ZTogc3RyaW5nOyB2ZXJzaW9uOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblxuXHQvKiogVGhlIGFjdGl2ZSBzdHJlYW1pbmcgc2Vzc2lvbiwgb25jZSBgc3RhcnQoKWAgaGFzIG9wZW5lZCBpdC4gKi9cblx0cHJpdmF0ZSBfc2Vzc2lvbjogTGl2ZUF1ZGlvVHJhbnNjcmlwdGlvblNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdC8qKiBSZXNvbHZlcyB3aGVuIHRoZSBiYWNrZ3JvdW5kIHN0cmVhbSBjb25zdW1lciBmb3IgYF9zZXNzaW9uYCBoYXMgZHJhaW5lZC4gKi9cblx0cHJpdmF0ZSBfY29uc3VtZVByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdC8qKiBJbi1mbGlnaHQgbW9kZWwgZG93bmxvYWQvbG9hZCArIHNlc3Npb24gb3BlbiBmb3IgdGhlIGFjdGl2ZSByZWNvcmRpbmcuICovXG5cdHByaXZhdGUgX29wZW5Qcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZXNzaW9uQWN0aXZlID0gZmFsc2U7XG5cblx0LyoqIEN1bXVsYXRpdmUgZmluYWxpemVkIHRyYW5zY3JpcHQsIGFjY3VtdWxhdGVkIHBlciB0aW1lZCBzZWdtZW50LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY2N1bXVsYXRvciA9IG5ldyBUcmFuc2NyaXB0QWNjdW11bGF0b3IoKTtcblx0LyoqIExhdGVzdCBpbnRlcmltIChub3QteWV0LWZpbmFsaXplZCkgc2VnbWVudCB0ZXh0LiAqL1xuXHRwcml2YXRlIF9wYXJ0aWFsVGV4dCA9ICcnO1xuXHQvKipcblx0ICogU2V0IHdoZW4gdGhlIG5hdGl2ZSBzdHJlYW1pbmcgc2Vzc2lvbiBmYWlscyBtaWQtcmVjb3JkaW5nIChpdHMgcmVzdWx0XG5cdCAqIHN0cmVhbSB0aHJvd3MpLiBgc3RvcCgpYCByZXRocm93cyB0aGlzIHNvIHRoZSByZW5kZXJlciB0cmVhdHMgdGhlIHNlc3Npb25cblx0ICogYXMgZmFpbGVkIGluc3RlYWQgb2YgcmVwb3J0aW5nIHRoZSBwYXJ0aWFsIHRyYW5zY3JpcHQgYXMgYSBzdWNjZXNzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcnVudGltZUVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUENNIGNodW5rcyBjYXB0dXJlZCBiZWZvcmUgdGhlIG1vZGVsIGZpbmlzaGVkIGxvYWRpbmcgYW5kIHRoZSBzZXNzaW9uXG5cdCAqIG9wZW5lZC4gRmx1c2hlZCBpbiBvcmRlciBvbmNlIHRoZSBzZXNzaW9uIHN0YXJ0cyBzbyBubyBsZWFkaW5nIGF1ZGlvIGlzXG5cdCAqIGRyb3BwZWQgd2hpbGUgdGhlIGZpcnN0LXVzZSBkb3dubG9hZC9sb2FkIGNvbXBsZXRlcy5cblx0ICovXG5cdHByaXZhdGUgX3BlbmRpbmdDaHVua3M6IFVpbnQ4QXJyYXlbXSA9IFtdO1xuXG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIGV2ZXJ5IGBzZXNzaW9uLmFwcGVuZCgpYCB0aHJvdWdoIGEgc2luZ2xlIEZJRk8gY2hhaW4uIEJvdGggdGhlXG5cdCAqIGJ1ZmZlcmVkLWJhY2tsb2cgZmx1c2ggYW5kIGxpdmUgYHB1c2hBdWRpbygpYCBlbnF1ZXVlIGhlcmUsIHNvIGF1ZGlvIGlzXG5cdCAqIGFsd2F5cyBhcHBlbmRlZCB0byBuYXRpdmUgY29yZSBpbiBjYXB0dXJlIG9yZGVyIFx1MjAxNCBldmVuIGFjcm9zcyB0aGUgZmlyc3QtdXNlXG5cdCAqIGhhbmRvZmYgXHUyMDE0IGFuZCBgc3RvcCgpYCBjYW4gYXdhaXQgdGhpcyB0byBndWFyYW50ZWUgdGhlIGZpbmFsIGNodW5rIGxhbmRzXG5cdCAqIGJlZm9yZSBgc2Vzc2lvbi5zdG9wKClgIGRyYWlucyB0aGUgc3RyZWFtLiBUaGUgc3RvcmVkIHRhaWwgc3dhbGxvd3Ncblx0ICogcmVqZWN0aW9ucyBzbyBvbmUgZmFpbGVkIGFwcGVuZCBkb2Vzbid0IGJyZWFrIG9yZGVyaW5nIGZvciB0aGUgcmVzdDsgdGhlXG5cdCAqIHJlYWwgKHJlamVjdGFibGUpIHByb21pc2UgaXMgcmV0dXJuZWQgdG8gY2FsbGVycyB0aGF0IG5lZWQgdG8gb2JzZXJ2ZSBpdC5cblx0ICovXG5cdHByaXZhdGUgX2FwcGVuZENoYWluOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0LyoqXG5cdCAqIE1vbm90b25pY2FsbHkgYnVtcGVkIHdoZW5ldmVyIGEgc2Vzc2lvbiBzdGFydHMgb3IgaXMgcmVzZXQsIHNvIGEgc2xvd1xuXHQgKiBzZXNzaW9uIG9wZW5lZCBmb3Igb25lIHJlY29yZGluZyBjYW4gZGV0ZWN0IHRoYXQgaXQgaXMgbm93IHN0YWxlIGFuZCBhdm9pZFxuXHQgKiBlbWl0dGluZyBpdHMgdHJhbnNjcmlwdCBpbnRvIGEgbGF0ZXIgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgX2dlbmVyYXRpb24gPSAwO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Ly8gVGVhciBkb3duIHRoZSBhY3RpdmUgc2Vzc2lvbiAoYW5kIGl0cyBuYXRpdmUgQVNSIHJlc291cmNlcykgd2hlbiB0aGVcblx0XHQvLyBzZXJ2aWNlIFx1MjAxNCBhbmQgaXRzIHV0aWxpdHkgcHJvY2VzcyBcdTIwMTQgZ29lcyBhd2F5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuX2Rpc3Bvc2VTZXNzaW9uKCk7XG5cdFx0XHR0aGlzLl9tb2RlbFByZXBhcmVDdHM/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fbW9kZWxQcmVwYXJlQ3RzPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tb2RlbFByZXBhcmVDdHMgPSB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TW9kZWxTdGF0dXMoKTogUHJvbWlzZTxJTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0dXM+IHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdHVzO1xuXHR9XG5cblx0aW1wb3J0TW9kZWwob3B0aW9uczogeyBzb3VyY2VQYXRoOiBzdHJpbmc7IGNhY2hlRGlyOiBzdHJpbmcgfSk6IFByb21pc2U8SUxvY2FsVHJhbnNjcmlwdGlvbk1vZGVsSW1wb3J0UmVzdWx0PiB7XG5cdFx0cmV0dXJuIGltcG9ydEZvdW5kcnlMb2NhbE1vZGVsKG9wdGlvbnMuc291cmNlUGF0aCwgb3B0aW9ucy5jYWNoZURpcik7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTdGF0dXMoc3RhdHVzOiBJTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0dXMpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0dXMgPSBzdGF0dXM7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbFN0YXR1cy5maXJlKHN0YXR1cyk7XG5cdH1cblxuXHRhc3luYyBzdGFydChvcHRpb25zOiB7IGNhY2hlRGlyOiBzdHJpbmc7IG1vZGVsPzogc3RyaW5nOyBsYW5ndWFnZT86IHN0cmluZzsgcHJveHlVcmw/OiBzdHJpbmc7IG5vUHJveHk/OiBzdHJpbmc7IHByb3h5U3RyaWN0U1NMPzogYm9vbGVhbjsgcHJveHlBdXRob3JpemF0aW9uPzogc3RyaW5nOyBydW50aW1lVXJsVGVtcGxhdGU/OiBzdHJpbmc7IHJ1bnRpbWVWZXJzaW9uPzogc3RyaW5nIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBCcmlkZ2UgVlMgQ29kZSdzIHByb3h5IHNldHRpbmdzIGludG8gdGhpcyBwcm9jZXNzJ3MgZW52aXJvbm1lbnQgYmVmb3JlIGFueVxuXHRcdC8vIGZpcnN0LXVzZSBkb3dubG9hZCwgc28gYm90aCBvdXIgb3duIGZldGNoZXMgYW5kIHRoZSBuYXRpdmUgRm91bmRyeSBMb2NhbFxuXHRcdC8vIG1vZGVsIGRvd25sb2FkIHJvdXRlIHRocm91Z2ggdGhlIGNvbmZpZ3VyZWQgcHJveHkgKHRoZXkgcmVhZCB0aGUgT1MvZW52XG5cdFx0Ly8gcHJveHksIG5vdCBWUyBDb2RlIHNldHRpbmdzIGRpcmVjdGx5KS5cblx0XHR0aGlzLl9hcHBseVByb3h5RW52KG9wdGlvbnMucHJveHlVcmwsIG9wdGlvbnMubm9Qcm94eSwgb3B0aW9ucy5wcm94eVN0cmljdFNTTCwgb3B0aW9ucy5wcm94eUF1dGhvcml6YXRpb24pO1xuXG5cdFx0Ly8gUmVjb3JkIHdoZXJlIHRoZSBuYXRpdmUgcnVudGltZSBpcyBwdWJsaXNoZWQgKGZyb20gcHJvZHVjdC5qc29uKS4gV2hlblxuXHRcdC8vIHVuc2V0IChkZXYgYnVpbGRzKSwgdGhlIFNESydzIG93biBub2RlX21vZHVsZXMgcGF5bG9hZCBpcyB1c2VkIGluc3RlYWQuXG5cdFx0dGhpcy5fcnVudGltZURvd25sb2FkID0gb3B0aW9ucy5ydW50aW1lVXJsVGVtcGxhdGUgJiYgb3B0aW9ucy5ydW50aW1lVmVyc2lvblxuXHRcdFx0PyB7IHVybFRlbXBsYXRlOiBvcHRpb25zLnJ1bnRpbWVVcmxUZW1wbGF0ZSwgdmVyc2lvbjogb3B0aW9ucy5ydW50aW1lVmVyc2lvbiB9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdC8vIFJlc2V0IGFueSBwcmlvciBzZXNzaW9uIGJlZm9yZSBzdGFydGluZyBhIG5ldyBvbmUuXG5cdFx0YXdhaXQgdGhpcy5fZGlzcG9zZVNlc3Npb24oKTtcblx0XHR0aGlzLl9nZW5lcmF0aW9uKys7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9IHRoaXMuX2dlbmVyYXRpb247XG5cdFx0dGhpcy5fc2Vzc2lvbkFjdGl2ZSA9IHRydWU7XG5cdFx0dGhpcy5fYWNjdW11bGF0b3IucmVzZXQoKTtcblx0XHR0aGlzLl9wYXJ0aWFsVGV4dCA9ICcnO1xuXHRcdHRoaXMuX3BlbmRpbmdDaHVua3MgPSBbXTtcblx0XHR0aGlzLl9ydW50aW1lRXJyb3IgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBtb2RlbCA9IG9wdGlvbnMubW9kZWwgPz8gREVGQVVMVF9MT0NBTF9UUkFOU0NSSVBUSU9OX01PREVMO1xuXHRcdGNvbnN0IGxhbmd1YWdlID0gb3B0aW9ucy5sYW5ndWFnZTtcblx0XHQvLyBEbyBub3QgYmxvY2sgY2FwdHVyZSBvbiB0aGUgKHBvc3NpYmx5IGZpcnN0LXVzZSkgbW9kZWwgZG93bmxvYWQvbG9hZCBhbmRcblx0XHQvLyBzZXNzaW9uIG9wZW47IGJ1ZmZlciBhdWRpbyB1bnRpbCB0aGUgc2Vzc2lvbiBpcyByZWFkeSwgdGhlbiBmbHVzaCBpdC5cblx0XHR0aGlzLl9vcGVuUHJvbWlzZSA9IHRoaXMuX29wZW5TZXNzaW9uKG9wdGlvbnMuY2FjaGVEaXIsIG1vZGVsLCBsYW5ndWFnZSwgZ2VuZXJhdGlvbik7XG5cdFx0dGhpcy5fb3BlblByb21pc2UuY2F0Y2goKCkgPT4geyAvKiBzdGF0dXMgYWxyZWFkeSByZXBvcnRlZCAqLyB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBseSBWUyBDb2RlJ3MgcHJveHkgc2V0dGluZ3MgYXMgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciB0aGlzIHByb2Nlc3MsIHNvXG5cdCAqIGV2ZXJ5IGRvd25sb2FkIGxlZyAob3VyIGZldGNoZXMgYW5kIHRoZSBuYXRpdmUgbW9kZWwgZG93bmxvYWQpIGhvbm9ycyBhIHByb3h5XG5cdCAqIGNvbmZpZ3VyZWQgb25seSBpbiBWUyBDb2RlIChub3QgaW4gdGhlIE9TIGVudmlyb25tZW50KTpcblx0ICogLSBgaHR0cC5wcm94eWAvYGh0dHAubm9Qcm94eWAgXHUyMTkyIGBIVFRQU19QUk9YWWAvYEhUVFBfUFJPWFlgL2BOT19QUk9YWWAuXG5cdCAqIC0gYGh0dHAucHJveHlBdXRob3JpemF0aW9uYCAoYSBgQmFzaWMgPGJhc2U2ND5gIHZhbHVlKSBcdTIxOTIgZm9sZGVkIGludG8gdGhlIHByb3h5XG5cdCAqICAgVVJMJ3MgdXNlcmluZm8gc28gYm90aCBvdXIgYEh0dHBzUHJveHlBZ2VudGAgYW5kIHRoZSBuYXRpdmUgSFRUUCBzdGFjayBzZW5kXG5cdCAqICAgYFByb3h5LUF1dGhvcml6YXRpb25gLiBOb24tYEJhc2ljYCBzY2hlbWVzIChlLmcuIE5lZ290aWF0ZS9OVExNKSBjYW5ub3QgYmVcblx0ICogICBjYXJyaWVkIHRoaXMgd2F5IGFuZCBhcmUgbGVmdCB0byBPUy1sZXZlbCBhdXRoLlxuXHQgKiAtIGBodHRwLnByb3h5U3RyaWN0U1NMID09PSBmYWxzZWAgXHUyMTkyIGRpc2FibGUgVExTIGNlcnRpZmljYXRlIHZlcmlmaWNhdGlvbiBmb3Jcblx0ICogICB0aGUgTm9kZSBkb3dubG9hZCBsZWdzLiBUaGUgbmF0aXZlIG1vZGVsIGxlZyBzdGlsbCByZXF1aXJlcyB0aGUgQ0EgaW4gdGhlIE9TXG5cdCAqICAgdHJ1c3Qgc3RvcmUuXG5cdCAqXG5cdCAqIEEgYmxhbmsvdW5kZWZpbmVkIGBwcm94eVVybGAgbGVhdmVzIGFueSBpbmhlcml0ZWQgZW52aXJvbm1lbnQgcHJveHkgdW50b3VjaGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwbHlQcm94eUVudihwcm94eVVybDogc3RyaW5nIHwgdW5kZWZpbmVkLCBub1Byb3h5OiBzdHJpbmcgfCB1bmRlZmluZWQsIHByb3h5U3RyaWN0U1NMOiBib29sZWFuIHwgdW5kZWZpbmVkLCBwcm94eUF1dGhvcml6YXRpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChwcm94eVN0cmljdFNTTCA9PT0gZmFsc2UpIHtcblx0XHRcdC8vIENvdmVycyBib3RoIE5vZGUgbGVncyB1bmlmb3JtbHkgKG91ciBmZXRjaCBhbmQgdGhlIFNESydzIGJhcmVcblx0XHRcdC8vIGBodHRwcy5nZXRgIE51R2V0IGluc3RhbGwpOyBzY29wZWQgdG8gdGhpcyBkZWRpY2F0ZWQgdXRpbGl0eSBwcm9jZXNzLlxuXHRcdFx0cHJvY2Vzcy5lbnYuTk9ERV9UTFNfUkVKRUNUX1VOQVVUSE9SSVpFRCA9ICcwJztcblx0XHR9XG5cdFx0aWYgKCFwcm94eVVybCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlZmZlY3RpdmVQcm94eVVybCA9IHRoaXMuX2VtYmVkUHJveHlDcmVkZW50aWFscyhwcm94eVVybCwgcHJveHlBdXRob3JpemF0aW9uKTtcblx0XHRwcm9jZXNzLmVudi5IVFRQU19QUk9YWSA9IGVmZmVjdGl2ZVByb3h5VXJsO1xuXHRcdHByb2Nlc3MuZW52LkhUVFBfUFJPWFkgPSBlZmZlY3RpdmVQcm94eVVybDtcblx0XHRpZiAobm9Qcm94eSkge1xuXHRcdFx0cHJvY2Vzcy5lbnYuTk9fUFJPWFkgPSBub1Byb3h5O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGb2xkIGEgYEJhc2ljIDxiYXNlNjQ+YCBgaHR0cC5wcm94eUF1dGhvcml6YXRpb25gIHZhbHVlIGludG8gYHByb3h5VXJsYCdzXG5cdCAqIHVzZXJpbmZvIHNvIHByb3h5IGNyZWRlbnRpYWxzIHN1cnZpdmUgdGhlIGVudi12YXIgYnJpZGdlIHRvIGV2ZXJ5IGxlZy5cblx0ICogUmV0dXJucyBgcHJveHlVcmxgIHVuY2hhbmdlZCB3aGVuIHRoZXJlIGlzIG5vdGhpbmcgdG8gYWRkIG9yIHRoZSBoZWFkZXIgaXNcblx0ICogbm90IGEgZGVjb2RhYmxlIGBCYXNpY2AgY3JlZGVudGlhbCBvciB0aGUgVVJMIGFscmVhZHkgY2FycmllcyBjcmVkZW50aWFscy5cblx0ICovXG5cdHByaXZhdGUgX2VtYmVkUHJveHlDcmVkZW50aWFscyhwcm94eVVybDogc3RyaW5nLCBwcm94eUF1dGhvcml6YXRpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKCFwcm94eUF1dGhvcml6YXRpb24pIHtcblx0XHRcdHJldHVybiBwcm94eVVybDtcblx0XHR9XG5cdFx0Y29uc3QgYmFzaWMgPSAvXkJhc2ljXFxzKyg/PHRva2VuPltBLVphLXowLTkrLz1dKykkL2kuZXhlYyhwcm94eUF1dGhvcml6YXRpb24udHJpbSgpKTtcblx0XHRpZiAoIWJhc2ljPy5ncm91cHM/LnRva2VuKSB7XG5cdFx0XHRyZXR1cm4gcHJveHlVcmw7XG5cdFx0fVxuXHRcdGxldCBwYXJzZWQ6IFVSTDtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkID0gbmV3IFVSTChwcm94eVVybCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gcHJveHlVcmw7XG5cdFx0fVxuXHRcdGlmIChwYXJzZWQudXNlcm5hbWUgfHwgcGFyc2VkLnBhc3N3b3JkKSB7XG5cdFx0XHRyZXR1cm4gcHJveHlVcmw7XG5cdFx0fVxuXHRcdGNvbnN0IGRlY29kZWQgPSBCdWZmZXIuZnJvbShiYXNpYy5ncm91cHMudG9rZW4sICdiYXNlNjQnKS50b1N0cmluZygndXRmOCcpO1xuXHRcdGNvbnN0IHNlcGFyYXRvciA9IGRlY29kZWQuaW5kZXhPZignOicpO1xuXHRcdGlmIChzZXBhcmF0b3IgPCAwKSB7XG5cdFx0XHRyZXR1cm4gcHJveHlVcmw7XG5cdFx0fVxuXHRcdHBhcnNlZC51c2VybmFtZSA9IGVuY29kZVVSSUNvbXBvbmVudChkZWNvZGVkLnNsaWNlKDAsIHNlcGFyYXRvcikpO1xuXHRcdHBhcnNlZC5wYXNzd29yZCA9IGVuY29kZVVSSUNvbXBvbmVudChkZWNvZGVkLnNsaWNlKHNlcGFyYXRvciArIDEpKTtcblx0XHRyZXR1cm4gcGFyc2VkLnRvU3RyaW5nKCk7XG5cdH1cblxuXHQvKipcblx0ICogRW5zdXJlIHRoZSBGb3VuZHJ5IExvY2FsIG1hbmFnZXIgZXhpc3RzLCB0aGUgc2VsZWN0ZWQgbW9kZWwgaXMgZG93bmxvYWRlZFxuXHQgKiBhbmQgbG9hZGVkLCBhbmQgYSBmcmVzaCBsaXZlIHRyYW5zY3JpcHRpb24gc2Vzc2lvbiBpcyBzdGFydGVkLiBCdWZmZXJlZFxuXHQgKiBhdWRpbyBjYXB0dXJlZCB3aGlsZSB0aGlzIHdhcyBpbiBmbGlnaHQgaXMgZmx1c2hlZCBvbmNlIHRoZSBzZXNzaW9uIG9wZW5zLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfb3BlblNlc3Npb24oY2FjaGVEaXI6IHN0cmluZywgbW9kZWxJZDogc3RyaW5nLCBsYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLl9lbnN1cmVNb2RlbChjYWNoZURpciwgbW9kZWxJZCk7XG5cdFx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0XHRyZXR1cm47IC8vIHN1cGVyc2VkZWQgYnkgYSBuZXdlciBzZXNzaW9uXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGF1ZGlvQ2xpZW50ID0gbW9kZWwuY3JlYXRlQXVkaW9DbGllbnQoKTtcblx0XHRcdGlmIChsYW5ndWFnZSkge1xuXHRcdFx0XHRhdWRpb0NsaWVudC5zZXR0aW5ncy5sYW5ndWFnZSA9IGxhbmd1YWdlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGF1ZGlvQ2xpZW50LmNyZWF0ZUxpdmVUcmFuc2NyaXB0aW9uU2Vzc2lvbigpO1xuXHRcdFx0c2Vzc2lvbi5zZXR0aW5ncy5zYW1wbGVSYXRlID0gU0FNUExFX1JBVEU7XG5cdFx0XHRzZXNzaW9uLnNldHRpbmdzLmNoYW5uZWxzID0gQ0hBTk5FTFM7XG5cdFx0XHRzZXNzaW9uLnNldHRpbmdzLmJpdHNQZXJTYW1wbGUgPSBCSVRTX1BFUl9TQU1QTEU7XG5cdFx0XHRpZiAobGFuZ3VhZ2UpIHtcblx0XHRcdFx0c2Vzc2lvbi5zZXR0aW5ncy5sYW5ndWFnZSA9IGxhbmd1YWdlO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgc2Vzc2lvbi5zdGFydCgpO1xuXG5cdFx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0XHQvLyBBIG5ld2VyIHNlc3Npb24gcmVwbGFjZWQgdGhpcyBvbmUgd2hpbGUgaXQgd2FzIG9wZW5pbmc7IGRpc2NhcmQuXG5cdFx0XHRcdGF3YWl0IHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3Nlc3Npb24gPSBzZXNzaW9uO1xuXHRcdFx0dGhpcy5fc2V0U3RhdHVzKHsgc3RhdGU6IExvY2FsVHJhbnNjcmlwdGlvbk1vZGVsU3RhdGUuUmVhZHkgfSk7XG5cblx0XHRcdC8vIENvbnN1bWUgc3RyZWFtaW5nIHJlc3VsdHMgaW4gdGhlIGJhY2tncm91bmQsIGFjY3VtdWxhdGluZyBhXG5cdFx0XHQvLyBjdW11bGF0aXZlIHRyYW5zY3JpcHQgYW5kIGVtaXR0aW5nIGludGVyaW1zIGFzIHNlZ21lbnRzIGFycml2ZS5cblx0XHRcdHRoaXMuX2NvbnN1bWVQcm9taXNlID0gdGhpcy5fY29uc3VtZShzZXNzaW9uLCBnZW5lcmF0aW9uKTtcblxuXHRcdFx0Ly8gRmx1c2ggYW55IGF1ZGlvIGNhcHR1cmVkIGJlZm9yZSB0aGUgc2Vzc2lvbiB3YXMgcmVhZHksIGluIG9yZGVyLlxuXHRcdFx0Ly8gRW5xdWV1ZSBzeW5jaHJvbm91c2x5IChubyBgYXdhaXRgIGJlZm9yZSB0aGUgbG9vcCBjb21wbGV0ZXMpIHNvIHRoZVxuXHRcdFx0Ly8gZW50aXJlIGJhY2tsb2cgaXMgcXVldWVkIGFoZWFkIG9mIGFueSBsaXZlIGBwdXNoQXVkaW8oKWAgYXBwZW5kIFx1MjAxNFxuXHRcdFx0Ly8gZXhwb3NpbmcgYF9zZXNzaW9uYCBhYm92ZSBtdXN0IG5vdCBsZXQgYSBmcmVzaGx5IGNhcHR1cmVkIGNodW5rIGp1bXBcblx0XHRcdC8vIGFoZWFkIG9mIHRoZSBidWZmZXJlZCBiYWNrbG9nLlxuXHRcdFx0Y29uc3QgYnVmZmVyZWQgPSB0aGlzLl9wZW5kaW5nQ2h1bmtzO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NodW5rcyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBjaHVuayBvZiBidWZmZXJlZCkge1xuXHRcdFx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2VucXVldWVBcHBlbmQoc2Vzc2lvbiwgZ2VuZXJhdGlvbiwgY2h1bmspLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdFx0aWYgKGdlbmVyYXRpb24gPT09IHRoaXMuX2dlbmVyYXRpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBTdHJpbmcoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IGVycik7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXRTdGF0dXMoeyBzdGF0ZTogTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0ZS5FcnJvciwgZXJyb3I6IG1lc3NhZ2UsIGVycm9yQ29kZTogY2xhc3NpZnlNb2RlbEVycm9yKG1lc3NhZ2UpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoZ2VuZXJhdGlvbiA9PT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gU3RyaW5nKGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBlcnIpO1xuXHRcdFx0XHR0aGlzLl9zZXRTdGF0dXMoeyBzdGF0ZTogTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0ZS5FcnJvciwgZXJyb3I6IG1lc3NhZ2UsIGVycm9yQ29kZTogY2xhc3NpZnlNb2RlbEVycm9yKG1lc3NhZ2UpIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmQgYGNodW5rYCB0byBgc2Vzc2lvbmAgYWZ0ZXIgZXZlcnkgcHJldmlvdXNseSBlbnF1ZXVlZCBhcHBlbmQgaGFzXG5cdCAqIGNvbXBsZXRlZCwgcHJlc2VydmluZyBjYXB0dXJlIG9yZGVyLiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgaWYgdGhpc1xuXHQgKiBwYXJ0aWN1bGFyIGFwcGVuZCBmYWlscyAoZm9yIGNhbGxlcnMgdGhhdCBtdXN0IHN1cmZhY2UgaXQpOyB0aGUgaW50ZXJuYWxcblx0ICogY2hhaW4gY29udGludWVzIHJlZ2FyZGxlc3Mgc28gb3JkZXJpbmcgaXMgcHJlc2VydmVkIGZvciBsYXRlciBjaHVua3MuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnF1ZXVlQXBwZW5kKHNlc3Npb246IExpdmVBdWRpb1RyYW5zY3JpcHRpb25TZXNzaW9uLCBnZW5lcmF0aW9uOiBudW1iZXIsIGNodW5rOiBVaW50OEFycmF5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fYXBwZW5kQ2hhaW4udGhlbigoKSA9PiB7XG5cdFx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5fZ2VuZXJhdGlvbiB8fCB0aGlzLl9zZXNzaW9uICE9PSBzZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gc3VwZXJzZWRlZC9yZXNldDsgZHJvcCBzdGFsZSBhcHBlbmRcblx0XHRcdH1cblx0XHRcdHJldHVybiBzZXNzaW9uLmFwcGVuZChjaHVuayk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fYXBwZW5kQ2hhaW4gPSByZXN1bHQuY2F0Y2goKCkgPT4geyAvKiBrZWVwIHRoZSBjaGFpbiBhbGl2ZSBhZnRlciBhIGZhaWxlZCBhcHBlbmQgKi8gfSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBEb3dubG9hZCAoaWYgbmVlZGVkKSBhbmQgbG9hZCB0aGUgc2VsZWN0ZWQgbW9kZWwgdGhyb3VnaCBGb3VuZHJ5IExvY2FsLFxuXHQgKiByZXBvcnRpbmcgZG93bmxvYWQvbG9hZCBwcm9ncmVzcyB2aWEgdGhlIG1vZGVsIHN0YXR1cy4gSWRlbXBvdGVudDogYSBsb2FkXG5cdCAqIGFscmVhZHkgaW4gZmxpZ2h0IChvciB0aGUgc2FtZSBtb2RlbCBhbHJlYWR5IGxvYWRlZCkgaXMgcmV1c2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlTW9kZWwoY2FjaGVEaXI6IHN0cmluZywgbW9kZWxJZDogc3RyaW5nKTogUHJvbWlzZTxJTW9kZWw+IHtcblx0XHRpZiAodGhpcy5fbW9kZWwgJiYgdGhpcy5fbG9hZGVkTW9kZWxJZCA9PT0gbW9kZWxJZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fbW9kZWxQcm9taXNlICYmIHRoaXMuX2xvYWRlZE1vZGVsSWQgPT09IG1vZGVsSWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9tb2RlbFByb21pc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9hZGVkTW9kZWxJZCA9IG1vZGVsSWQ7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fbW9kZWxQcmVwYXJlQ3RzID0gY3RzO1xuXHRcdHRoaXMuX21vZGVsUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBUaGUgbW9kZWwgY2FjaGUgc3RhdGUgaXMgdW5rbm93biB1bnRpbCB0aGUgY2F0YWxvZyBpcyBxdWVyaWVkLlxuXHRcdFx0XHR0aGlzLl9zZXRTdGF0dXMoeyBzdGF0ZTogTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0ZS5Mb2FkaW5nIH0pO1xuXG5cdFx0XHRcdC8vIEVuc3VyZSB0aGUgRm91bmRyeSBMb2NhbCBuYXRpdmUgcnVudGltZSAoTi1BUEkgYWRkb24gKyBjb3JlXG5cdFx0XHRcdC8vIGxpYnJhcmllcykgaXMgYXZhaWxhYmxlIGJlZm9yZSBsb2FkaW5nIHRoZSBTREsuIFdlIGRvIG5vdCBzaGlwXG5cdFx0XHRcdC8vIGl0IFx1MjAxNCB0aGUgYWRkb24gcmVxdWlyZXMgYSBuZXdlciBnbGliYyB0aGFuIG91ciBtaW5pbXVtIHN1cHBvcnRlZFxuXHRcdFx0XHQvLyBMaW51eCBkaXN0cm9zIFx1MjAxNCBzbyBpbiBwYWNrYWdlZCBidWlsZHMgaXQgaXMgZG93bmxvYWRlZCBvbiBkZW1hbmRcblx0XHRcdFx0Ly8gZnJvbSBWUyBDb2RlJ3MgQ0ROIChwZXIgYHByb2R1Y3QuZGljdGF0aW9uUnVudGltZWApIGludG8gYVxuXHRcdFx0XHQvLyBwZXItdXNlciBjYWNoZSBhbmQgdGhlIFNESyBsb2FkZXIgaXMgcG9pbnRlZCBhdCBpdCB2aWEgZW52IHZhci5cblx0XHRcdFx0Ly8gVGhpcyBpcyBhIG5vLW9wIG9uY2UgY2FjaGVkLiBJbiBkZXYgYnVpbGRzIChubyBwcm9kdWN0IGNvbmZpZylcblx0XHRcdFx0Ly8gdGhlIFNESyByZXNvbHZlcyBpdHMgYWRkb24gKyBjb3JlIGxpYnMgZnJvbSBub2RlX21vZHVsZXMsIHNvIHdlXG5cdFx0XHRcdC8vIHNraXAgcHJvdmlzaW9uaW5nIGFuZCBsZWF2ZSB0aGUgbG9hZGVyIG9uIGl0cyBkZWZhdWx0IHBhdGguXG5cdFx0XHRcdGlmICh0aGlzLl9ydW50aW1lRG93bmxvYWQpIHtcblx0XHRcdFx0XHRjb25zdCBuYXRpdmVEaXIgPSBhd2FpdCBlbnN1cmVGb3VuZHJ5TG9jYWxSdW50aW1lKHJ1bnRpbWVDYWNoZURpcihjYWNoZURpciksIHRoaXMuX3J1bnRpbWVEb3dubG9hZCwgY3RzLnRva2VuKTtcblx0XHRcdFx0XHRwcm9jZXNzLmVudi5WU0NPREVfRk9VTkRSWV9MT0NBTF9OQVRJVkVfRElSID0gbmF0aXZlRGlyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCF0aGlzLl9zZGspIHtcblx0XHRcdFx0XHR0aGlzLl9zZGsgPSBhd2FpdCBpbXBvcnQoJ2ZvdW5kcnktbG9jYWwtc2RrJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF0aGlzLl9tYW5hZ2VyKSB7XG5cdFx0XHRcdFx0Ly8gU3RvcmUgZG93bmxvYWRlZCBtb2RlbCBmaWxlcyB1bmRlciBWUyBDb2RlJ3MgY2FjaGUgZGlyIHNvXG5cdFx0XHRcdFx0Ly8gc3Vic2VxdWVudCBzZXNzaW9ucyBsb2FkIHdpdGhvdXQgcmUtZG93bmxvYWRpbmcgKFwibW9kZWxcblx0XHRcdFx0XHQvLyBtYW5hZ2VtZW50XCIpLiBgY3JlYXRlQXN5bmNgIGF2b2lkcyBibG9ja2luZyB0aGUgZXZlbnQgbG9vcFxuXHRcdFx0XHRcdC8vIGR1cmluZyBuYXRpdmUgaW5pdC5cblx0XHRcdFx0XHR0aGlzLl9tYW5hZ2VyID0gYXdhaXQgdGhpcy5fc2RrLkZvdW5kcnlMb2NhbE1hbmFnZXIuY3JlYXRlQXN5bmMoe1xuXHRcdFx0XHRcdFx0YXBwTmFtZTogRk9VTkRSWV9BUFBfTkFNRSxcblx0XHRcdFx0XHRcdG1vZGVsQ2FjaGVEaXI6IGNhY2hlRGlyLFxuXHRcdFx0XHRcdFx0bG9nTGV2ZWw6ICd3YXJuJyxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5fbWFuYWdlci5jYXRhbG9nLmdldE1vZGVsKG1vZGVsSWQpO1xuXG5cdFx0XHRcdGxldCBkaWREb3dubG9hZCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAoIW1vZGVsLmlzQ2FjaGVkKSB7XG5cdFx0XHRcdFx0ZGlkRG93bmxvYWQgPSB0cnVlO1xuXHRcdFx0XHRcdC8vIE9ubHkgbm93LCBoYXZpbmcgY29uZmlybWVkIGEgY2FjaGUgbWlzcywgc3VyZmFjZSB0aGVcblx0XHRcdFx0XHQvLyBgRG93bmxvYWRpbmdgIHN0YXR1cy4gUmVwb3J0IGl0IHVwIGZyb250IChwcm9ncmVzcyAwKSBzbyB0aGVcblx0XHRcdFx0XHQvLyBkb3dubG9hZCBVSSBhcHBlYXJzIGltbWVkaWF0ZWx5IHJhdGhlciB0aGFuIHdhaXRpbmcgZm9yIHRoZVxuXHRcdFx0XHRcdC8vIFNESydzIGZpcnN0IHByb2dyZXNzIGNhbGxiYWNrLlxuXHRcdFx0XHRcdHRoaXMuX3NldFN0YXR1cyh7IHN0YXRlOiBMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXRlLkRvd25sb2FkaW5nLCBwcm9ncmVzczogMCB9KTtcblx0XHRcdFx0XHQvLyBCcmlkZ2UgVlMgQ29kZSBjYW5jZWxsYXRpb24gdG8gdGhlIEFib3J0U2lnbmFsIHRoZSBTREsgZXhwZWN0cy5cblx0XHRcdFx0XHRjb25zdCBhYyA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdFx0XHRjb25zdCBzdWIgPSBjdHMudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gYWMuYWJvcnQoKSk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IG1vZGVsLmRvd25sb2FkKChwZXJjZW50OiBudW1iZXIpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fc2V0U3RhdHVzKHsgc3RhdGU6IExvY2FsVHJhbnNjcmlwdGlvbk1vZGVsU3RhdGUuRG93bmxvYWRpbmcsIHByb2dyZXNzOiBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCBwZXJjZW50IC8gMTAwKSkgfSk7XG5cdFx0XHRcdFx0XHR9LCBhYy5zaWduYWwpO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIG1vZGVsLmxvYWQoKSBoYXMgbm8gQWJvcnRTaWduYWw7IGNoZWNrIGNhbmNlbGxhdGlvbiBiZWZvcmUgc3RhcnRpbmcgaXQuXG5cdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NhbmNlbGxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3NldFN0YXR1cyh7IHN0YXRlOiBMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXRlLkxvYWRpbmcgfSk7XG5cdFx0XHRcdGF3YWl0IG1vZGVsLmxvYWQoKTtcblxuXHRcdFx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXHRcdFx0XHR0aGlzLl9zZXRTdGF0dXMoeyBzdGF0ZTogTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0ZS5SZWFkeSwgZG93bmxvYWRlZDogZGlkRG93bmxvYWQgfSk7XG5cdFx0XHRcdGlmICh0aGlzLl9tb2RlbFByZXBhcmVDdHMgPT09IGN0cykge1xuXHRcdFx0XHRcdHRoaXMuX21vZGVsUHJlcGFyZUN0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX21vZGVsUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fbG9hZGVkTW9kZWxJZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRoaXMuX21vZGVsUHJlcGFyZUN0cyA9PT0gY3RzKSB7XG5cdFx0XHRcdFx0dGhpcy5fbW9kZWxQcmVwYXJlQ3RzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9KSgpO1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbFByb21pc2U7XG5cdH1cblxuXHQvKipcblx0ICogRHJhaW4gdGhlIHNlc3Npb24ncyByZXN1bHQgc3RyZWFtLCBtYWludGFpbmluZyBhIGN1bXVsYXRpdmUgdHJhbnNjcmlwdC5cblx0ICogRm91bmRyeSBlbWl0cyBwZXItc2VnbWVudCByZXN1bHRzIGZsYWdnZWQgYGlzX2ZpbmFsYDsgYSBmaW5hbGl6ZWQgc2VnbWVudCBpc1xuXHQgKiByZWNvcmRlZCAoYW5kIHJlcGxhY2VkIGlmIGxhdGVyIHJlZmluZWQpIGluIHRoZSBhY2N1bXVsYXRvciwgd2hpbGUgYVxuXHQgKiBub24tZmluYWwgcmVzdWx0IGlzIHRoZSBpbnRlcmltIHRhaWwgb2YgdGhlIHNlZ21lbnQgY3VycmVudGx5IGJlaW5nIHNwb2tlbi5cblx0ICogRWFjaCB1cGRhdGUgZmlyZXMgdGhlIGZ1bGwgY3VtdWxhdGl2ZSB0cmFuc2NyaXB0IHNvIHRoZSByZW5kZXJlciBjYW4gc2hpbW1lclxuXHQgKiB0aGUgaW50ZXJpbSB0YWlsIGFuZCBzb2xpZGlmeSBmaW5hbGl6ZWQgdGV4dC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NvbnN1bWUoc2Vzc2lvbjogTGl2ZUF1ZGlvVHJhbnNjcmlwdGlvblNlc3Npb24sIGdlbmVyYXRpb246IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IHJlc3VsdCBvZiBzZXNzaW9uLmdldFN0cmVhbSgpKSB7XG5cdFx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGV4dCA9IHRoaXMuX3Jlc3VsdFRleHQocmVzdWx0KTtcblx0XHRcdFx0aWYgKHJlc3VsdC5pc19maW5hbCkge1xuXHRcdFx0XHRcdHRoaXMuX2FjY3VtdWxhdG9yLmFkZEZpbmFsKHRleHQsIHJlc3VsdC5zdGFydF90aW1lID8/IG51bGwsIHJlc3VsdC5lbmRfdGltZSA/PyBudWxsKTtcblx0XHRcdFx0XHR0aGlzLl9wYXJ0aWFsVGV4dCA9ICcnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEludGVyaW0gcmVzdWx0cyBhcmUgZGVsdGFzIG9mIHRoZSBpbi1wcm9ncmVzcyBzZWdtZW50OyBhcHBlbmRcblx0XHRcdFx0XHQvLyB0aGVtIChwcmVzZXJ2aW5nIHRoZWlyIG93biBzcGFjaW5nKSByYXRoZXIgdGhhbiByZXBsYWNpbmcsIHNvXG5cdFx0XHRcdFx0Ly8gZWFybGllciBwYXJ0aWFsIHdvcmRzIGFyZSBub3QgbG9zdC5cblx0XHRcdFx0XHR0aGlzLl9wYXJ0aWFsVGV4dCA9IGFwcGVuZFRyYW5zY3JpcHRDaHVuayh0aGlzLl9wYXJ0aWFsVGV4dCwgdGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX3Nlc3Npb25BY3RpdmUpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFRyYW5zY3JpYmUuZmlyZSh7IHRleHQ6IHRoaXMuX2N1bXVsYXRpdmVUZXh0KCksIGlzRmluYWw6IGZhbHNlLCBmaW5hbGl6ZWRUZXh0OiB0aGlzLl9hY2N1bXVsYXRvci5nZXRUZXh0KCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIEEgbmF0aXZlIHN0cmVhbWluZy9wdXNoIGZhaWx1cmUgdGVybWluYXRlcyB0aGUgc3RyZWFtLiBJZiBpdCBoYXBwZW5lZFxuXHRcdFx0Ly8gd2hpbGUgcmVjb3JkaW5nIChub3QgZHVyaW5nIG91ciBvd24gdGVhcmRvd24pLCByZWNvcmQgaXQgYW5kIHN1cmZhY2Vcblx0XHRcdC8vIGFuIGVycm9yIHN0YXR1cyBzbyB0aGUgcmVuZGVyZXIgdGVhcnMgdGhlIHNlc3Npb24gZG93biBhbmQgaW5mb3JtcyB0aGVcblx0XHRcdC8vIHVzZXI7IHN0b3AoKSBhbHNvIHJldGhyb3dzIGl0IHJhdGhlciB0aGFuIHJlcG9ydGluZyBhIGZhbHNlIHN1Y2Nlc3MuXG5cdFx0XHRpZiAoZ2VuZXJhdGlvbiA9PT0gdGhpcy5fZ2VuZXJhdGlvbiAmJiB0aGlzLl9zZXNzaW9uQWN0aXZlKSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiBuZXcgRXJyb3IoU3RyaW5nKGVycikpO1xuXHRcdFx0XHR0aGlzLl9ydW50aW1lRXJyb3IgPSBlcnJvcjtcblx0XHRcdFx0dGhpcy5fc2V0U3RhdHVzKHsgc3RhdGU6IExvY2FsVHJhbnNjcmlwdGlvbk1vZGVsU3RhdGUuRXJyb3IsIGVycm9yOiBlcnJvci5tZXNzYWdlLCBlcnJvckNvZGU6ICdydW50aW1lJyB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogRmluYWxpemVkIHRyYW5zY3JpcHQgcGx1cyB0aGUgY3VycmVudCBpbnRlcmltIHRhaWwsIGpvaW5lZCBuYXR1cmFsbHkuICovXG5cdHByaXZhdGUgX2N1bXVsYXRpdmVUZXh0KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZmluYWxpemVkID0gdGhpcy5fYWNjdW11bGF0b3IuZ2V0VGV4dCgpO1xuXHRcdGNvbnN0IHBhcnRpYWwgPSB0aGlzLl9wYXJ0aWFsVGV4dDtcblx0XHRpZiAoIXBhcnRpYWwpIHtcblx0XHRcdHJldHVybiBmaW5hbGl6ZWQ7XG5cdFx0fVxuXHRcdGlmICghZmluYWxpemVkKSB7XG5cdFx0XHRyZXR1cm4gcGFydGlhbDtcblx0XHR9XG5cdFx0cmV0dXJuIGAke2ZpbmFsaXplZH0ke3RyYW5zY3JpcHRTZXBhcmF0b3IoZmluYWxpemVkLCBwYXJ0aWFsKX0ke3BhcnRpYWx9YDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3VsdFRleHQocmVzdWx0OiBMaXZlQXVkaW9UcmFuc2NyaXB0aW9uUmVzcG9uc2UpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHBhcnQgPSByZXN1bHQuY29udGVudD8uWzBdO1xuXHRcdC8vIFJldHVybiB0aGUgcmF3IHRleHQgKG5vdCB0cmltbWVkKTogaW50ZXJpbSBkZWx0YXMgY2Fycnkgc2lnbmlmaWNhbnRcblx0XHQvLyBsZWFkaW5nL3RyYWlsaW5nIHNwYWNpbmcgdXNlZCB0byBjb25jYXRlbmF0ZSB0aGVtLiBgYWRkRmluYWxgIHRyaW1zXG5cdFx0Ly8gZmluYWxpemVkIHNlZ21lbnRzIGl0c2VsZi5cblx0XHRyZXR1cm4gcGFydD8udGV4dCA/PyBwYXJ0Py50cmFuc2NyaXB0ID8/ICcnO1xuXHR9XG5cblx0YXN5bmMgcHVzaEF1ZGlvKGNodW5rOiBWU0J1ZmZlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvbkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBieXRlcyA9IGNodW5rLmJ1ZmZlcjtcblx0XHQvLyBDb3B5IG91dCBvZiB0aGUgc2hhcmVkIFZTQnVmZmVyIGJhY2tpbmcgc3RvcmU7IGBhcHBlbmRgIHRha2VzIG93bmVyc2hpcFxuXHRcdC8vIG9mIHRoZSBieXRlcyBpdCBxdWV1ZXMgdG8gbmF0aXZlIGNvcmUuXG5cdFx0Y29uc3QgcGNtID0gbmV3IFVpbnQ4QXJyYXkoYnl0ZXMuYnl0ZUxlbmd0aCk7XG5cdFx0cGNtLnNldChieXRlcyk7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb24pIHtcblx0XHRcdC8vIFJvdXRlIHRocm91Z2ggdGhlIHNoYXJlZCBhcHBlbmQgcXVldWUgc28gdGhpcyBsaXZlIGNodW5rIGxhbmRzXG5cdFx0XHQvLyBhZnRlciBhbnkgc3RpbGwtZHJhaW5pbmcgYnVmZmVyZWQgYmFja2xvZyAocHJlc2VydmluZyBvcmRlciBhY3Jvc3Ncblx0XHRcdC8vIHRoZSBmaXJzdC11c2UgaGFuZG9mZikuIExldCBhIHJlamVjdGlvbiBwcm9wYWdhdGU6IHRoZSByZW5kZXJlcidzXG5cdFx0XHQvLyBwdXNoQXVkaW8oKS5jYXRjaCBmYWlscyB0aGUgc2Vzc2lvbiBzbyBkaWN0YXRpb24gZG9lc24ndCBzaWxlbnRseVxuXHRcdFx0Ly8gY29udGludWUgd2hpbGUgZXZlcnkgc3Vic2VxdWVudCBjaHVuayBpcyBkcm9wcGVkLiBMYXRlIGZhaWx1cmVzXG5cdFx0XHQvLyBhZnRlciBzdG9wKCkgYXJlIGlnbm9yZWQgYnkgdGhlIHJlbmRlcmVyLlxuXHRcdFx0YXdhaXQgdGhpcy5fZW5xdWV1ZUFwcGVuZCh0aGlzLl9zZXNzaW9uLCB0aGlzLl9nZW5lcmF0aW9uLCBwY20pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBNb2RlbCBzdGlsbCBsb2FkaW5nIC8gc2Vzc2lvbiBub3Qgb3BlbiB5ZXQ6IGJ1ZmZlciB1bnRpbCBpdCBpcy5cblx0XHRcdHRoaXMuX3BlbmRpbmdDaHVua3MucHVzaChwY20pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN0b3AoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fZ2VuZXJhdGlvbjtcblx0XHR0aGlzLl9zZXNzaW9uQWN0aXZlID0gZmFsc2U7XG5cblx0XHQvLyBBbHdheXMgd2FpdCBmb3IgdGhlIGluLWZsaWdodCBzZXNzaW9uIG9wZW4gdG8gc2V0dGxlLiBgX3Nlc3Npb25gIGlzXG5cdFx0Ly8gYXNzaWduZWQgYmVmb3JlIGBfb3BlblNlc3Npb25gIGZpbmlzaGVzIGZsdXNoaW5nIHRoZSBidWZmZXJlZCBhdWRpbyBpdFxuXHRcdC8vIGNhcHR1cmVkIGR1cmluZyBtb2RlbCBsb2FkLCBzbyBzdG9wcGluZyByaWdodCBhZnRlciB0aGUgc2Vzc2lvbiBvcGVuc1xuXHRcdC8vIG11c3Qgbm90IHJhY2UgdGhhdCBmbHVzaCBcdTIwMTQgb3RoZXJ3aXNlIGBzZXNzaW9uLnN0b3AoKWAgY2FuIHJlamVjdCB0aGVcblx0XHQvLyByZW1haW5pbmcgYXBwZW5kcyBhbmQgcmV0dXJuIGEgdHJ1bmNhdGVkIHRyYW5zY3JpcHQuXG5cdFx0aWYgKHRoaXMuX29wZW5Qcm9taXNlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9vcGVuUHJvbWlzZTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBMb2FkIGZhaWxlZDsgc3RhdHVzIGFscmVhZHkgcmVwb3J0ZWQgYXMgRXJyb3IuXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMuX2dlbmVyYXRpb24pIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbjtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdC8vIE1vZGVsIG5ldmVyIGZpbmlzaGVkIGxvYWRpbmc7IG5vdGhpbmcgdG8gdHJhbnNjcmliZS5cblx0XHRcdGNvbnN0IHRleHQgPSB0aGlzLl9jdW11bGF0aXZlVGV4dCgpO1xuXHRcdFx0dGhpcy5fcmVzZXRTZXNzaW9uU3RhdGUoKTtcblx0XHRcdHJldHVybiB0ZXh0O1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBEcmFpbiBldmVyeSBxdWV1ZWQgYXBwZW5kIChidWZmZXJlZCBiYWNrbG9nICsgbGl2ZSBjaHVua3MpIHNvIHRoZVxuXHRcdFx0Ly8gZmluYWwgY2FwdHVyZWQgYXVkaW8gcmVhY2hlcyBuYXRpdmUgY29yZSBiZWZvcmUgd2Ugc3RvcCBcdTIwMTQgb3RoZXJ3aXNlXG5cdFx0XHQvLyBgc3RvcCgpYCBjYW4gY29tcGxldGUgdGhlIHN0cmVhbSB3aGlsZSB0aGUgdGFpbCBhcHBlbmQgaXMgc3RpbGxcblx0XHRcdC8vIHBlbmRpbmcsIHRydW5jYXRpbmcgdGhlIHRyYW5zY3JpcHQuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9hcHBlbmRDaGFpbjtcblx0XHRcdH0gY2F0Y2ggeyAvKiBpbmRpdmlkdWFsIGFwcGVuZCBmYWlsdXJlcyBhbHJlYWR5IHN1cmZhY2VkICovIH1cblx0XHRcdC8vIGBzdG9wKClgIGRyYWlucyBhbnkgYnVmZmVyZWQgYXVkaW8sIGVtaXRzIGZpbmFsIHJlc3VsdHMgaW50byB0aGVcblx0XHRcdC8vIHN0cmVhbSwgdGhlbiBjb21wbGV0ZXMgaXQgXHUyMDE0IHNvIHRoZSBjb25zdW1lciBsb29wIGVuZHMgYWZ0ZXIgdGhpcy5cblx0XHRcdGF3YWl0IHNlc3Npb24uc3RvcCgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gQmVzdC1lZmZvcnQ6IGZhbGwgdGhyb3VnaCB0byB3aGF0ZXZlciB0cmFuc2NyaXB0IHdlIGFjY3VtdWxhdGVkLlxuXHRcdH1cblx0XHRpZiAodGhpcy5fY29uc3VtZVByb21pc2UpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbnN1bWVQcm9taXNlO1xuXHRcdFx0fSBjYXRjaCB7IC8qIGNvbnN1bWVyIHN3YWxsb3dzIGl0cyBvd24gZXJyb3JzICovIH1cblx0XHR9XG5cblx0XHQvLyBUaGUgbmF0aXZlIHN0cmVhbSBmYWlsZWQgbWlkLXJlY29yZGluZzogZmFpbCB0aGUgc3RvcCByYXRoZXIgdGhhblxuXHRcdC8vIHJlcG9ydGluZyB0aGUgcGFydGlhbCB0cmFuc2NyaXB0IGFzIGEgc3VjY2Vzc2Z1bCBkaWN0YXRpb24gcmVzdWx0LlxuXHRcdGNvbnN0IHJ1bnRpbWVFcnJvciA9IHRoaXMuX3J1bnRpbWVFcnJvcjtcblx0XHRpZiAocnVudGltZUVycm9yICYmIGdlbmVyYXRpb24gPT09IHRoaXMuX2dlbmVyYXRpb24pIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Rpc3Bvc2VTZXNzaW9uKCk7XG5cdFx0XHR0aGlzLl9yZXNldFNlc3Npb25TdGF0ZSgpO1xuXHRcdFx0dGhyb3cgcnVudGltZUVycm9yO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHQgPSB0aGlzLl9jdW11bGF0aXZlVGV4dCgpO1xuXHRcdGlmIChnZW5lcmF0aW9uID09PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHQvLyBPbiBzdG9wIGV2ZXJ5dGhpbmcgaXMgZmluYWxpemVkOiBubyBzaGltbWVyaW5nIHRhaWwgcmVtYWlucy5cblx0XHRcdHRoaXMuX29uRGlkVHJhbnNjcmliZS5maXJlKHsgdGV4dCwgaXNGaW5hbDogdHJ1ZSwgZmluYWxpemVkVGV4dDogdGV4dCB9KTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZGlzcG9zZVNlc3Npb24oKTtcblx0XHR0aGlzLl9yZXNldFNlc3Npb25TdGF0ZSgpO1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0YXN5bmMgY2FuY2VsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX21vZGVsUHJlcGFyZUN0cz8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fbW9kZWxQcmVwYXJlQ3RzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Nlc3Npb25BY3RpdmUgPSBmYWxzZTtcblx0XHR0aGlzLl9nZW5lcmF0aW9uKys7XG5cdFx0YXdhaXQgdGhpcy5fZGlzcG9zZVNlc3Npb24oKTtcblx0XHR0aGlzLl9yZXNldFNlc3Npb25TdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzcG9zZVNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb247XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25zdW1lID0gdGhpcy5fY29uc3VtZVByb21pc2U7XG5cdFx0dGhpcy5fY29uc3VtZVByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IHRlYXJkb3duICovIH1cblx0XHR9XG5cdFx0aWYgKGNvbnN1bWUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNvbnN1bWU7XG5cdFx0XHR9IGNhdGNoIHsgLyogY29uc3VtZXIgc3dhbGxvd3MgaXRzIG93biBlcnJvcnMgKi8gfVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0U2Vzc2lvblN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25BY3RpdmUgPSBmYWxzZTtcblx0XHR0aGlzLl9hY2N1bXVsYXRvci5yZXNldCgpO1xuXHRcdHRoaXMuX3BhcnRpYWxUZXh0ID0gJyc7XG5cdFx0dGhpcy5fcGVuZGluZ0NodW5rcyA9IFtdO1xuXHRcdHRoaXMuX2FwcGVuZENoYWluID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0dGhpcy5fcnVudGltZUVycm9yID0gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyxTQUFTLFlBQVk7QUFDOUIsU0FBUyxpQ0FBaUM7QUFDMUM7QUFBQSxFQUlDO0FBQUEsRUFFQTtBQUFBLE9BQ007QUFDUCxTQUFTLCtCQUErQjtBQUd4QyxNQUFNLGNBQWM7QUFDcEIsTUFBTSxXQUFXO0FBQ2pCLE1BQU0sa0JBQWtCO0FBR3hCLE1BQU0sbUJBQW1CO0FBUXpCLFNBQVMsZ0JBQWdCLGVBQStCO0FBQ3ZELFNBQU8sS0FBSyxRQUFRLGFBQWEsR0FBRyxzQkFBc0I7QUFDM0Q7QUFvQkEsU0FBUyxtQkFBbUIsU0FBeUI7QUFDcEQsUUFBTSxPQUFPLFFBQVEsWUFBWTtBQUNqQyxNQUFJLHNHQUFzRyxLQUFLLElBQUksR0FBRztBQUNySCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksMEdBQTBHLEtBQUssSUFBSSxHQUFHO0FBQ3pILFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxtRUFBbUUsS0FBSyxJQUFJLEdBQUc7QUFDbEYsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLGtDQUFrQyxLQUFLLElBQUksR0FBRztBQUNqRCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksd0RBQXdELEtBQUssSUFBSSxHQUFHO0FBQ3ZFLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUNSO0FBUUEsU0FBUyxvQkFBb0IsU0FBaUIsTUFB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
