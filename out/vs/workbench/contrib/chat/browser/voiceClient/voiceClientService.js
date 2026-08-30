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
import { generateUuid } from "../../../../../base/common/uuid.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { Language } from "../../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import {
  IVoiceClientService,
  isVoiceCheckpointId,
  normalizeAgentsVoiceId
} from "../../common/voiceClient/voiceClientService.js";
import { isTerminalCloseCode, voiceCloseCodeInfo } from "../../common/voiceClient/voiceCloseCodes.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
const PING_INTERVAL_MS = 25e3;
const PONG_TIMEOUT_MS = 1e4;
const FAST_RETRY_COUNT = 3;
const FAST_RETRY_DELAY_MS = 2e3;
const SLOW_RETRY_DELAY_MS = 1e4;
const MAX_RECONNECT_DURATION_MS = 6e4;
const TTS_SUPPORTED_LANGUAGE_BASES = /* @__PURE__ */ new Set([
  "en",
  "de",
  "es",
  "fr",
  "it",
  "pt",
  "ja",
  "ko",
  "zh"
]);
const ASR_SUPPORTED_LANGUAGE_BASES = /* @__PURE__ */ new Set([
  "ar",
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "hi",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "nb",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sv",
  "th",
  "tr",
  "vi",
  "zh"
]);
const DEFAULT_LANGUAGE = "en-US";
function asOptionalString(value) {
  return typeof value === "string" ? value : void 0;
}
function asOptionalNonEmptyString(value) {
  const result = asOptionalString(value);
  return result && result.length > 0 ? result : void 0;
}
function canonicalizeSupportedLanguage(value, supportedBases) {
  const candidate = value?.trim();
  if (!candidate || typeof Intl.getCanonicalLocales !== "function") {
    return void 0;
  }
  try {
    const canonical = Intl.getCanonicalLocales(candidate)[0];
    return supportedBases.has(canonical.split("-")[0]) ? canonical : void 0;
  } catch {
    return void 0;
  }
}
function resolveAutomaticVoiceLanguage(browserLanguage, displayLanguage) {
  return canonicalizeSupportedLanguage(displayLanguage, ASR_SUPPORTED_LANGUAGE_BASES) ?? canonicalizeSupportedLanguage(browserLanguage, ASR_SUPPORTED_LANGUAGE_BASES) ?? DEFAULT_LANGUAGE;
}
function asTranscriptionStatus(value) {
  return value === "partial" || value === "final" ? value : void 0;
}
function asTranscriptionRevision(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : void 0;
}
let VoiceClientService = class extends Disposable {
  constructor(_configurationService, _logService, _productService) {
    super();
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._productService = _productService;
    this._reconnectAttempts = 0;
    this._isConnected = false;
    this._isResuming = false;
    // Set once start_session/resume_session (which carries session_context) has
    // been sent on the current connection; reset per connection. Gates
    // `_sendSetLanguage` and `requestNarration` so the backend has the session
    // before those follow-up messages are sent.
    this._sessionStartedOnSocket = false;
    this._lastSentById = /* @__PURE__ */ new Map();
    // session id → last-sent field values
    this._invalidatedSessionIds = /* @__PURE__ */ new Set();
    // --- Events ---
    this._onTranscription = this._register(new Emitter());
    this.onTranscription = this._onTranscription.event;
    this._onAudioResponse = this._register(new Emitter());
    this.onAudioResponse = this._onAudioResponse.event;
    this._onBargeIn = this._register(new Emitter());
    this.onBargeIn = this._onBargeIn.event;
    this._onNarrationAck = this._register(new Emitter());
    this.onNarrationAck = this._onNarrationAck.event;
    this._onNarrationUnblocked = this._register(new Emitter());
    this.onNarrationUnblocked = this._onNarrationUnblocked.event;
    this._onNarrationInterrupted = this._register(new Emitter());
    this.onNarrationInterrupted = this._onNarrationInterrupted.event;
    this._onToolCall = this._register(new Emitter());
    this.onToolCall = this._onToolCall.event;
    this._onSpeechStarted = this._register(new Emitter());
    this.onSpeechStarted = this._onSpeechStarted.event;
    this._onSessionInit = this._register(new Emitter());
    this.onSessionInit = this._onSessionInit.event;
    this._onError = this._register(new Emitter());
    this.onError = this._onError.event;
    this._onDidChangeConnectionState = this._register(new Emitter());
    this.onDidChangeConnectionState = this._onDidChangeConnectionState.event;
    this._onFatalDisconnect = this._register(new Emitter());
    this.onFatalDisconnect = this._onFatalDisconnect.event;
    this._onConnectionIssue = this._register(new Emitter());
    this.onConnectionIssue = this._onConnectionIssue.event;
    this._onTurnAutoEnded = this._register(new Emitter());
    this.onTurnAutoEnded = this._onTurnAutoEnded.event;
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agents.voice.turn.silenceMs") || e.affectsConfiguration("agents.voice.turn.stopPhrases") || e.affectsConfiguration("agents.voice.handsFree")) {
        this._sendSetTurnConfig();
      }
      if (e.affectsConfiguration("agents.voice.voice")) {
        this._sendSetVoice();
      }
      if (e.affectsConfiguration("agents.voice.language")) {
        this._sendSetLanguage();
      }
    }));
  }
  get isConnected() {
    return this._isConnected;
  }
  get isResuming() {
    return this._isResuming;
  }
  get willReconnect() {
    return this._reconnectTimer !== void 0;
  }
  get currentSessionId() {
    return this._lastSessionId;
  }
  _getVoice() {
    return normalizeAgentsVoiceId(this._configurationService.getValue("agents.voice.voice"));
  }
  _sendSetVoice() {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "set_voice", voice: this._getVoice() }));
    }
  }
  _getLanguage() {
    const configured = this._configurationService.getValue("agents.voice.language");
    if (typeof configured === "string" && configured.trim().toLowerCase() !== "auto") {
      const language = canonicalizeSupportedLanguage(configured, TTS_SUPPORTED_LANGUAGE_BASES);
      if (language) {
        return language;
      }
      this._logService.warn(`[voice] Unsupported agents.voice.language value '${configured}', falling back to ${DEFAULT_LANGUAGE}`);
      return DEFAULT_LANGUAGE;
    }
    return resolveAutomaticVoiceLanguage(this._window?.navigator.language, Language.value());
  }
  _sendSetLanguage() {
    if (this._ws?.readyState === WebSocket.OPEN && this._sessionStartedOnSocket) {
      this._ws.send(JSON.stringify({ type: "set_language", language: this._getLanguage() }));
    }
  }
  /**
   * Whether a configuration setting has an explicit user/workspace/application
   * value, as opposed to falling back to its registered default.
   */
  _isExplicitlyConfigured(key) {
    const inspected = this._configurationService.inspect(key);
    return inspected.userValue !== void 0 || inspected.userLocalValue !== void 0 || inspected.userRemoteValue !== void 0 || inspected.workspaceValue !== void 0 || inspected.workspaceFolderValue !== void 0 || inspected.applicationValue !== void 0;
  }
  /**
   * Assemble the ``turn_config`` wire object from the ``agents.voice.turn.*``
   * settings, normalizing each into the shape the backend expects. The
   * ``auto_end_mode`` is derived from the other two settings: trailing-silence
   * ending is enabled unless ``silenceMs`` is ``-1`` (or otherwise non-positive),
   * and stop-phrase ending is enabled when at least one phrase is configured.
   *
   * When hands-free mode (``agents.voice.handsFree``) is disabled, the turn is
   * not sent automatically by default: trailing-silence and stop-phrase ending
   * are each suppressed unless the corresponding setting has been explicitly
   * configured, so a user who opts out of the hands-free loop keeps manual
   * control over when a turn is sent.
   */
  _getTurnConfig() {
    const cfg = this._configurationService;
    const handsFree = cfg.getValue("agents.voice.handsFree") === true;
    const silenceRaw = cfg.getValue("agents.voice.turn.silenceMs");
    let silenceEnabled = typeof silenceRaw === "number" && silenceRaw > 0;
    if (!handsFree && !this._isExplicitlyConfigured("agents.voice.turn.silenceMs")) {
      silenceEnabled = false;
    }
    const silence_ms = silenceEnabled ? Math.round(silenceRaw) : 800;
    const phrasesRaw = cfg.getValue("agents.voice.turn.stopPhrases");
    const stop_phrases = Array.isArray(phrasesRaw) ? phrasesRaw.map((p) => String(p).trim()).filter((p) => p.length > 0) : [];
    let phrasesEnabled = stop_phrases.length > 0;
    if (!handsFree && !this._isExplicitlyConfigured("agents.voice.turn.stopPhrases")) {
      phrasesEnabled = false;
    }
    const auto_end_mode = silenceEnabled && phrasesEnabled ? "both" : silenceEnabled ? "vad" : phrasesEnabled ? "phrase" : "off";
    return { auto_end_mode, silence_ms, stop_phrases: phrasesEnabled ? stop_phrases : [], vad_gate_asr: true };
  }
  _sendSetTurnConfig() {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "set_turn_config", turn_config: this._getTurnConfig() }));
    }
  }
  _getWsUrl() {
    const configured = this._configurationService.getValue("agents.voice.backendUrl");
    const url = typeof configured === "string" ? configured.trim() : "";
    return url || this._productService.voiceWsUrl || "";
  }
  async connect(window, authToken) {
    this._window = window;
    this._authToken = authToken;
    this._resetReconnectBudget();
    this._connectWebSocket();
  }
  _connectWebSocket() {
    const win = this._window;
    if (!win) {
      return;
    }
    const baseUrl = this._getWsUrl();
    if (!baseUrl) {
      this._logService.error("[voice] No voice WebSocket URL configured (set voiceWsUrl in product.json or agents.voice.backendUrl in settings)");
      this._onFatalDisconnect.fire({ code: 0, reason: "", kind: "fatal", clientSide: true });
      this._cleanup();
      return;
    }
    const url = this._authToken ? `${baseUrl}?token=${encodeURIComponent(this._authToken)}` : baseUrl;
    const ws = new win.WebSocket(url);
    this._ws = ws;
    this._sessionStartedOnSocket = false;
    ws.onopen = () => {
      this._isResuming = !!this._lastSessionId;
      this._sessionStartedOnSocket = false;
      this._setConnected(true);
      this._startPing();
      if (this._lastSessionId) {
      }
    };
    ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "pong":
          this._clearPongTimeout();
          break;
        case "session_init":
          this._resetReconnectBudget();
          this._lastSessionId = msg.session_id;
          this._isResuming = false;
          this._onSessionInit.fire({ sessionId: msg.session_id ?? "" });
          break;
        case "session_resumed":
          this._resetReconnectBudget();
          this._lastSessionId = msg.session_id;
          this._isResuming = false;
          this._onSessionInit.fire({ sessionId: msg.session_id ?? "" });
          break;
        case "speech_started":
          this._onSpeechStarted.fire({ turnId: asOptionalString(msg.turn_id) });
          break;
        case "barge_in":
          this._onBargeIn.fire({
            turnId: asOptionalString(msg.turn_id) ?? "",
            interruptedTurnId: msg.interrupted_turn_id ?? ""
          });
          break;
        case "narration_ack": {
          const disposition = msg.disposition === "busy" || msg.disposition === "invalid" || msg.disposition === "suppressed" ? msg.disposition : "accepted";
          this._onNarrationAck.fire({
            narrationId: msg.narration_id ?? "",
            codingSessionId: msg.coding_session_id ?? "",
            disposition,
            reason: msg.reason
          });
          break;
        }
        case "narration_unblocked":
          this._onNarrationUnblocked.fire({
            narrationId: msg.narration_id ?? "",
            codingSessionId: msg.coding_session_id ?? ""
          });
          break;
        case "narration_interrupted":
          this._onNarrationInterrupted.fire({
            narrationId: msg.narration_id ?? "",
            codingSessionId: msg.coding_session_id ?? "",
            ...typeof msg.retryable === "boolean" ? { retryable: msg.retryable } : {},
            ...msg.reason ? { reason: msg.reason } : {}
          });
          break;
        case "transcription": {
          const status = msg.status === void 0 ? "final" : asTranscriptionStatus(msg.status);
          const turnId = msg.turn_id === void 0 ? void 0 : asOptionalNonEmptyString(msg.turn_id);
          const revision = msg.revision === void 0 ? void 0 : asTranscriptionRevision(msg.revision);
          if (!status || msg.turn_id !== void 0 && !turnId || msg.revision !== void 0 && (!turnId || revision === void 0)) {
            break;
          }
          this._onTranscription.fire({
            text: asOptionalString(msg.text) ?? "",
            status,
            committed: asOptionalString(msg.committed) ?? "",
            turnId,
            revision
          });
          break;
        }
        case "audio_response": {
          const requestId = asOptionalString(msg.request_id);
          const checkpointId = isVoiceCheckpointId(msg.checkpoint_id) ? msg.checkpoint_id : void 0;
          const sequence = typeof msg.sequence === "number" && Number.isSafeInteger(msg.sequence) && msg.sequence > 0 ? msg.sequence : void 0;
          const narrationKind = msg.narration_kind === "response" || msg.narration_kind === "confirmation" || msg.narration_kind === "checkpoint" ? msg.narration_kind : void 0;
          const playbackId = asOptionalString(msg.playback_id);
          if (narrationKind === "checkpoint") {
            this._logService.info(`[voice] checkpoint audio request=${requestId ?? "none"} stage=${checkpointId ?? "none"} sequence=${sequence ?? "none"} first=${msg.is_first_chunk === void 0 ? true : Boolean(msg.is_first_chunk)} final=${Boolean(msg.is_final)}`);
          }
          this._onAudioResponse.fire({
            audio: msg.audio ?? "",
            isFirstChunk: msg.is_first_chunk === void 0 ? true : Boolean(msg.is_first_chunk),
            isFinal: msg.is_final ?? false,
            codingSessionId: msg.coding_session_id,
            transcript: msg.transcript,
            turnId: asOptionalString(msg.turn_id),
            responseId: msg.narration_id ?? asOptionalString(msg.turn_id),
            ...requestId ? { requestId } : {},
            ...checkpointId ? { checkpointId } : {},
            ...sequence !== void 0 ? { sequence } : {},
            ...narrationKind ? { narrationKind } : {},
            ...playbackId ? { playbackId } : {}
          });
          break;
        }
        case "tool_call":
          this._onToolCall.fire({
            callId: msg.call_id ?? "",
            name: msg.name ?? "",
            args: msg.args ?? {}
          });
          break;
        case "turn_auto_ended": {
          const reason = msg.reason === "stop_phrase" ? "stop_phrase" : "vad_silence";
          this._onTurnAutoEnded.fire({ reason, turnId: asOptionalString(msg.turn_id) ?? "" });
          break;
        }
        case "error":
          this._onError.fire(msg.detail ?? "Unknown error");
          break;
      }
    };
    ws.onerror = () => {
      this._onError.fire("WebSocket error");
    };
    ws.onclose = (evt) => {
      this._logService.trace(`[voice] ws.onclose code=${evt.code} reason=${evt.reason ?? ""} wasClean=${evt.wasClean}`);
      if (this._ws === ws) {
        if (isTerminalCloseCode(evt.code)) {
          const kind = voiceCloseCodeInfo(evt.code)?.kind ?? "fatal";
          this._logService.warn(`[voice] terminal close ${evt.code} (${kind}): ${evt.reason}, not reconnecting`);
          this._onFatalDisconnect.fire({ code: evt.code, reason: evt.reason ?? "", kind });
          this._cleanup();
          return;
        }
        if (!this._reconnectStartedAt) {
          this._reconnectStartedAt = Date.now();
        }
        const elapsed = Date.now() - this._reconnectStartedAt;
        if (elapsed >= MAX_RECONNECT_DURATION_MS) {
          this._logService.warn(`[voice] reconnect budget of ${MAX_RECONNECT_DURATION_MS}ms exhausted, giving up`);
          this._onFatalDisconnect.fire({ code: evt.code, reason: evt.reason ?? "", kind: "fatal" });
          this._cleanup();
          return;
        }
        this._reconnectAttempts++;
        this._stopPing();
        this._ws = void 0;
        const delay = this._reconnectAttempts <= FAST_RETRY_COUNT ? FAST_RETRY_DELAY_MS : SLOW_RETRY_DELAY_MS;
        this._logService.warn(`[voice] ws closed abnormally (code=${evt.code} reason=${evt.reason || "none"} wasClean=${evt.wasClean}); reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);
        this._reconnectTimer = setTimeout(() => {
          this._reconnectTimer = void 0;
          this._connectWebSocket();
        }, delay);
        this._setConnected(false);
        this._onConnectionIssue.fire({ code: evt.code, reason: evt.reason ?? "" });
      }
    };
  }
  disconnect() {
    this._logService.trace("[voice] disconnect() called");
    if (this._ws && this._ws.readyState < WebSocket.CLOSING) {
      this._ws.close();
    }
    this._cleanup();
  }
  _cleanup() {
    this._resetReconnectBudget();
    this._stopPing();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = void 0;
    }
    if (this._contextSendTimer) {
      clearTimeout(this._contextSendTimer);
      this._contextSendTimer = void 0;
    }
    this._pendingContext = void 0;
    this._ws = void 0;
    this._sessionStartedOnSocket = false;
    this._window = void 0;
    this._lastSessionId = void 0;
    this._isResuming = false;
    this._lastSentById.clear();
    this._invalidatedSessionIds.clear();
    this._setConnected(false);
  }
  _resetReconnectBudget() {
    this._reconnectAttempts = 0;
    this._reconnectStartedAt = void 0;
  }
  _startPing() {
    this._stopPing();
    const win = this._window ?? mainWindow;
    this._pingTimer = win.setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify({ type: "ping" }));
        this._pongTimer = setTimeout(() => {
          this._logService.warn("[voice] pong timeout \u2014 server unreachable, reconnecting");
          this._ws?.close(4e3, "pong timeout");
        }, PONG_TIMEOUT_MS);
      }
    }, PING_INTERVAL_MS);
  }
  _stopPing() {
    if (this._pingTimer) {
      (this._window ?? mainWindow).clearInterval(this._pingTimer);
      this._pingTimer = void 0;
    }
    this._clearPongTimeout();
  }
  _clearPongTimeout() {
    if (this._pongTimer) {
      clearTimeout(this._pongTimer);
      this._pongTimer = void 0;
    }
  }
  _setConnected(connected) {
    if (this._isConnected !== connected) {
      this._isConnected = connected;
      this._onDidChangeConnectionState.fire(connected);
    }
  }
  sendPttStart(turnId, passive = false) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "ptt_start", turn_id: turnId, ...passive ? { passive: true } : {} }));
    }
  }
  sendPttAudioChunk(audio) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "ptt_audio_chunk", audio }));
    }
  }
  sendPttEnd() {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "ptt_end" }));
    }
  }
  sendPttDiagnostic(turnId, metrics) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: "ptt_diagnostic", turn_id: turnId, metrics }));
    }
  }
  sendSessionContext(context) {
    if (!this._isConnected) {
      return;
    }
    this._pendingContext = context;
    if (this._contextSendTimer) {
      clearTimeout(this._contextSendTimer);
    }
    this._contextSendTimer = setTimeout(() => {
      this._contextSendTimer = void 0;
      const pending = this._pendingContext;
      this._pendingContext = void 0;
      if (pending && this._ws?.readyState === WebSocket.OPEN) {
        this._sendDelta(pending);
      }
    }, 500);
  }
  flushSessionContext() {
    if (!this._contextSendTimer) {
      return;
    }
    clearTimeout(this._contextSendTimer);
    this._contextSendTimer = void 0;
    const pending = this._pendingContext;
    this._pendingContext = void 0;
    if (pending && this._ws?.readyState === WebSocket.OPEN) {
      this._sendDelta(pending);
    }
  }
  invalidateSessionCache(sessionId) {
    this._invalidatedSessionIds.add(sessionId);
  }
  _sendDelta(context) {
    const currentIds = new Set(context.sessions.map((s) => s.id));
    const removes = [...this._lastSentById.keys()].filter((id) => !currentIds.has(id));
    const upserts = [];
    for (const session of context.sessions) {
      const current = session;
      const prev = this._lastSentById.get(session.id);
      if (!prev) {
        upserts.push(current);
      } else {
        const patch = { id: session.id };
        let hasChanges = false;
        if (this._invalidatedSessionIds.has(session.id)) {
          for (const key of Object.keys(current)) {
            if (key !== "id") {
              patch[key] = current[key] ?? null;
              hasChanges = true;
            }
          }
          for (const key of Object.keys(prev)) {
            if (key !== "id" && (!Object.prototype.hasOwnProperty.call(current, key) || current[key] === void 0)) {
              patch[key] = null;
              hasChanges = true;
            }
          }
        } else {
          for (const key of Object.keys(current)) {
            if (key === "id") {
              continue;
            }
            if (stableStringify(current[key]) !== stableStringify(prev[key])) {
              patch[key] = current[key];
              hasChanges = true;
            }
          }
          for (const key of Object.keys(prev)) {
            if (key === "id") {
              continue;
            }
            if (!Object.prototype.hasOwnProperty.call(current, key) || current[key] === void 0) {
              patch[key] = null;
              hasChanges = true;
            }
          }
        }
        if (!Object.prototype.hasOwnProperty.call(patch, "agent_state")) {
          if (Object.prototype.hasOwnProperty.call(patch, "agent_state_detail")) {
            delete patch.agent_state_detail;
          }
          if (Object.prototype.hasOwnProperty.call(patch, "last_response_summary")) {
            delete patch.last_response_summary;
          }
          hasChanges = Object.keys(patch).some((k) => k !== "id");
        }
        if (hasChanges) {
          upserts.push(patch);
        }
      }
    }
    if (upserts.length === 0 && removes.length === 0) {
      return;
    }
    for (const session of context.sessions) {
      const obj = {};
      for (const [k, v] of Object.entries(session)) {
        if (v !== void 0) {
          obj[k] = v;
        }
      }
      this._lastSentById.set(session.id, obj);
      this._invalidatedSessionIds.delete(session.id);
    }
    for (const id of removes) {
      this._lastSentById.delete(id);
      this._invalidatedSessionIds.delete(id);
    }
    this._ws.send(JSON.stringify({
      type: "session_context",
      mode: "delta",
      upserts,
      removes
    }));
    this._logService.trace(`[voice] _sendDelta upserts=[${upserts.map((u) => `${String(u.id).slice(-8)}:${u.agent_state ?? "(no-state)"}${Object.prototype.hasOwnProperty.call(u, "agent_state_detail") ? "+detail" : ""}${Object.prototype.hasOwnProperty.call(u, "last_response_summary") && u.last_response_summary ? "+summary" : ""}`).join(", ")}] removes=${removes.length}`);
  }
  _seedTracking(context) {
    this._lastSentById.clear();
    this._invalidatedSessionIds.clear();
    for (const session of context.sessions) {
      const obj = {};
      for (const [k, v] of Object.entries(session)) {
        if (v !== void 0) {
          obj[k] = v;
        }
      }
      this._lastSentById.set(session.id, obj);
    }
  }
  sendToolResult(callId, result, codingSessionId) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({
        type: "tool_result",
        call_id: callId,
        result,
        ...codingSessionId ? { coding_session_id: codingSessionId } : {}
      }));
    }
  }
  sendNarrationPlaybackComplete(codingSessionId, narrationId, playbackId) {
    if (this._ws?.readyState === WebSocket.OPEN && this._sessionStartedOnSocket) {
      this._ws.send(JSON.stringify({
        type: "narration_playback_complete",
        coding_session_id: codingSessionId,
        narration_id: narrationId,
        playback_id: playbackId
      }));
    }
  }
  requestNarration(codingSessionId, kind, text, narrationId, checkpoint, confirmationType, pending, prepareToReceiveAudio) {
    if (this._ws?.readyState === WebSocket.OPEN && this._sessionStartedOnSocket) {
      prepareToReceiveAudio?.();
      const id = narrationId ?? generateUuid();
      this._ws.send(JSON.stringify({
        type: "request_narration",
        coding_session_id: codingSessionId,
        kind,
        text,
        narration_id: id,
        ...checkpoint ? {
          request_id: checkpoint.requestId,
          checkpoint_id: checkpoint.checkpointId,
          sequence: checkpoint.sequence
        } : {},
        ...kind === "confirmation" && confirmationType ? { confirmation_type: confirmationType } : {},
        ...pending ? { pending_id: pending.pendingId } : {}
      }));
      this._logService.trace(`[voice] request_narration kind=${kind} id=${codingSessionId.slice(-32)} narration_id=${id.slice(0, 8)}${narrationId ? " (retry)" : ""}`);
      if (checkpoint) {
        this._logService.info(`[voice] checkpoint sent request=${checkpoint.requestId} stage=${checkpoint.checkpointId} sequence=${checkpoint.sequence}`);
      }
      return id;
    }
    return void 0;
  }
  sendSessionStateChange(sessionId, newState, _label, detail, lastResponseSummary) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      const payload = { type: "session_state_change", session_id: sessionId, new_state: newState };
      if (detail) {
        payload.detail = detail;
      }
      if (lastResponseSummary) {
        payload.last_response_summary = lastResponseSummary;
      }
      this._ws.send(JSON.stringify(payload));
    }
  }
  stopSpeaking() {
  }
  /**
   * Send the start_session message with the given context.
   * Called by the consumer after connect() resolves and AudioContext is ready.
   *
   * ``priorTimeline`` carries an ordered slice of cross-session entries
   * (voice turns, voice tool calls, coding-session events, and a synthesized
   * coding-agent-reply summary per active session) from the previous voice
   * session. The BE consumes it once on the first command turn so the model
   * can answer recall questions across reconnects without backend
   * persistence. See ``IVoicePriorTimelineEntry``.
   */
  sendStartSession(context, machineId, priorTimeline, turnConfigOverride, voiceInstructions) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      const sessionContext = { ...context, display_locale: this._getLanguage() };
      this._seedTracking(sessionContext);
      const payload = { type: "start_session", session_context: sessionContext, machine_id: machineId, turn_config: turnConfigOverride ?? this._getTurnConfig(), voice: this._getVoice(), auto_narrate: false };
      if (priorTimeline && priorTimeline.length > 0) {
        payload.prior_timeline = priorTimeline;
      }
      if (voiceInstructions) {
        payload.voice_instructions = voiceInstructions;
      }
      this._ws.send(JSON.stringify(payload));
      this._sessionStartedOnSocket = true;
    }
  }
  sendResumeSession(context, machineId, voiceInstructions) {
    if (this._ws?.readyState === WebSocket.OPEN && this._lastSessionId) {
      const sessionContext = { ...context, display_locale: this._getLanguage() };
      this._seedTracking(sessionContext);
      const payload = { type: "resume_session", session_id: this._lastSessionId, session_context: sessionContext, machine_id: machineId, turn_config: this._getTurnConfig(), voice: this._getVoice(), auto_narrate: false };
      if (voiceInstructions) {
        payload.voice_instructions = voiceInstructions;
      }
      this._ws.send(JSON.stringify(payload));
      this._sessionStartedOnSocket = true;
    }
  }
  async submitFeedback(payload) {
    const httpUrl = this._getWsUrl().replace("wss://", "https://").replace("ws://", "http://").replace(/\/realtime\/voice$/, "/feedback");
    const headers = { "Content-Type": "application/json" };
    if (this._authToken) {
      headers["Authorization"] = `Bearer ${this._authToken}`;
    }
    try {
      const response = await fetch(httpUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          feedback_text: payload.feedbackText,
          machine_id: payload.machineId,
          user_id: payload.userId,
          session_id: payload.sessionId,
          submission_id: payload.submissionId,
          transcript_history: payload.transcriptHistory.map((t) => ({
            role: t.role,
            text: t.text,
            timestamp: t.timestamp
          })),
          client_session_state: payload.clientSessionState,
          client_environment: payload.clientEnvironment,
          timestamp: payload.timestamp
        })
      });
      if (!response.ok) {
        const text = await response.text();
        return { ok: false, error: `HTTP ${response.status}: ${text}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
  dispose() {
    this.disconnect();
    super.dispose();
  }
};
VoiceClientService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IProductService)
], VoiceClientService);
function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}
registerSingleton(IVoiceClientService, VoiceClientService, InstantiationType.Delayed);
export {
  VoiceClientService,
  resolveAutomaticVoiceLanguage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFx2b2ljZUNsaWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHRJVm9pY2VDbGllbnRTZXJ2aWNlLFxuXHRJVm9pY2VQcmlvclRpbWVsaW5lRW50cnksXG5cdElWb2ljZVNlc3Npb25Db250ZXh0LFxuXHRJVm9pY2VUcmFuc2NyaXB0aW9uLFxuXHRJVm9pY2VBdWRpb1Jlc3BvbnNlLFxuXHRJVm9pY2VUb29sQ2FsbCxcblx0SVZvaWNlU3BlZWNoU3RhcnRlZCxcblx0SVZvaWNlU2Vzc2lvbkluaXQsXG5cdElWb2ljZUZlZWRiYWNrUGF5bG9hZCxcblx0SVZvaWNlVHVybkNvbmZpZyxcblx0SVZvaWNlVHVybkF1dG9FbmRlZCxcblx0SVZvaWNlVHVybkF1dG9FbmRSZWFzb24sXG5cdElWb2ljZUNvbm5lY3Rpb25Jc3N1ZSxcblx0SVZvaWNlRmF0YWxEaXNjb25uZWN0LFxuXHRJVm9pY2VCYXJnZUluLFxuXHRJVm9pY2VOYXJyYXRpb25BY2ssXG5cdElWb2ljZU5hcnJhdGlvblNpZ25hbCxcblx0SVZvaWNlRGlzcGF0Y2hSZXN1bHQsXG5cdElWb2ljZUNoZWNrcG9pbnROYXJyYXRpb25NZXRhZGF0YSxcblx0Vm9pY2VDb25maXJtYXRpb25UeXBlLFxuXHRWb2ljZU5hcnJhdGlvbktpbmQsXG5cdGlzVm9pY2VDaGVja3BvaW50SWQsXG5cdG5vcm1hbGl6ZUFnZW50c1ZvaWNlSWQsXG59IGZyb20gJy4uLy4uL2NvbW1vbi92b2ljZUNsaWVudC92b2ljZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNUZXJtaW5hbENsb3NlQ29kZSwgdm9pY2VDbG9zZUNvZGVJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlQ2xvc2VDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuY29uc3QgUElOR19JTlRFUlZBTF9NUyA9IDI1XzAwMDtcbmNvbnN0IFBPTkdfVElNRU9VVF9NUyA9IDEwXzAwMDtcbmNvbnN0IEZBU1RfUkVUUllfQ09VTlQgPSAzO1xuY29uc3QgRkFTVF9SRVRSWV9ERUxBWV9NUyA9IDJfMDAwO1xuY29uc3QgU0xPV19SRVRSWV9ERUxBWV9NUyA9IDEwXzAwMDtcbi8vIEtlcHQgc2hvcnQgb24gcHVycG9zZTogYSB1c2VyIHN0YXJpbmcgYXQgYSByZWNvbm5lY3RpbmcgVUkgd291bGQgcmF0aGVyIGJlIHRvbGRcbi8vIGl0IGZhaWxlZCB0aGFuIHdhaXQuIEdpdmVzIDMgZmFzdCBhdHRlbXB0cyBwbHVzIH41IHNsb3cgb25lcyBiZWZvcmUgZ2l2aW5nIHVwLlxuY29uc3QgTUFYX1JFQ09OTkVDVF9EVVJBVElPTl9NUyA9IDYwXzAwMDtcbmNvbnN0IFRUU19TVVBQT1JURURfTEFOR1VBR0VfQkFTRVMgPSBuZXcgU2V0KFtcblx0J2VuJywgJ2RlJywgJ2VzJywgJ2ZyJywgJ2l0JywgJ3B0JywgJ2phJywgJ2tvJywgJ3poJyxcbl0pO1xuY29uc3QgQVNSX1NVUFBPUlRFRF9MQU5HVUFHRV9CQVNFUyA9IG5ldyBTZXQoW1xuXHQnYXInLCAnY3MnLCAnZGEnLCAnZGUnLCAnZW4nLCAnZXMnLCAnZmknLCAnZnInLCAnaGknLCAnaHUnLCAnaWQnLCAnaXQnLFxuXHQnamEnLCAna28nLCAnbmInLCAnbmwnLCAncGwnLCAncHQnLCAncm8nLCAncnUnLCAnc3YnLCAndGgnLCAndHInLCAndmknLCAnemgnLFxuXSk7XG5jb25zdCBERUZBVUxUX0xBTkdVQUdFID0gJ2VuLVVTJztcblxuZnVuY3Rpb24gYXNPcHRpb25hbFN0cmluZyh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGFzT3B0aW9uYWxOb25FbXB0eVN0cmluZyh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHJlc3VsdCA9IGFzT3B0aW9uYWxTdHJpbmcodmFsdWUpO1xuXHRyZXR1cm4gcmVzdWx0ICYmIHJlc3VsdC5sZW5ndGggPiAwID8gcmVzdWx0IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjYW5vbmljYWxpemVTdXBwb3J0ZWRMYW5ndWFnZSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBzdXBwb3J0ZWRCYXNlczogUmVhZG9ubHlTZXQ8c3RyaW5nPik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlPy50cmltKCk7XG5cdGlmICghY2FuZGlkYXRlIHx8IHR5cGVvZiBJbnRsLmdldENhbm9uaWNhbExvY2FsZXMgIT09ICdmdW5jdGlvbicpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0dHJ5IHtcblx0XHRjb25zdCBjYW5vbmljYWwgPSBJbnRsLmdldENhbm9uaWNhbExvY2FsZXMoY2FuZGlkYXRlKVswXTtcblx0XHRyZXR1cm4gc3VwcG9ydGVkQmFzZXMuaGFzKGNhbm9uaWNhbC5zcGxpdCgnLScpWzBdKSA/IGNhbm9uaWNhbCA6IHVuZGVmaW5lZDtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUF1dG9tYXRpY1ZvaWNlTGFuZ3VhZ2UoYnJvd3Nlckxhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGRpc3BsYXlMYW5ndWFnZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0cmV0dXJuIGNhbm9uaWNhbGl6ZVN1cHBvcnRlZExhbmd1YWdlKGRpc3BsYXlMYW5ndWFnZSwgQVNSX1NVUFBPUlRFRF9MQU5HVUFHRV9CQVNFUylcblx0XHQ/PyBjYW5vbmljYWxpemVTdXBwb3J0ZWRMYW5ndWFnZShicm93c2VyTGFuZ3VhZ2UsIEFTUl9TVVBQT1JURURfTEFOR1VBR0VfQkFTRVMpXG5cdFx0Pz8gREVGQVVMVF9MQU5HVUFHRTtcbn1cblxuZnVuY3Rpb24gYXNUcmFuc2NyaXB0aW9uU3RhdHVzKHZhbHVlOiB1bmtub3duKTogSVZvaWNlVHJhbnNjcmlwdGlvblsnc3RhdHVzJ10gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gdmFsdWUgPT09ICdwYXJ0aWFsJyB8fCB2YWx1ZSA9PT0gJ2ZpbmFsJyA/IHZhbHVlIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBhc1RyYW5zY3JpcHRpb25SZXZpc2lvbih2YWx1ZTogdW5rbm93bik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc0ludGVnZXIodmFsdWUpICYmIHZhbHVlID49IDAgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIFZvaWNlQ2xpZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVm9pY2VDbGllbnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfd3M6IFdlYlNvY2tldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVjb25uZWN0QXR0ZW1wdHMgPSAwO1xuXHRwcml2YXRlIF9yZWNvbm5lY3RTdGFydGVkQXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVjb25uZWN0VGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0Nvbm5lY3RlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc1Jlc3VtaW5nID0gZmFsc2U7XG5cdC8vIFNldCBvbmNlIHN0YXJ0X3Nlc3Npb24vcmVzdW1lX3Nlc3Npb24gKHdoaWNoIGNhcnJpZXMgc2Vzc2lvbl9jb250ZXh0KSBoYXNcblx0Ly8gYmVlbiBzZW50IG9uIHRoZSBjdXJyZW50IGNvbm5lY3Rpb247IHJlc2V0IHBlciBjb25uZWN0aW9uLiBHYXRlc1xuXHQvLyBgX3NlbmRTZXRMYW5ndWFnZWAgYW5kIGByZXF1ZXN0TmFycmF0aW9uYCBzbyB0aGUgYmFja2VuZCBoYXMgdGhlIHNlc3Npb25cblx0Ly8gYmVmb3JlIHRob3NlIGZvbGxvdy11cCBtZXNzYWdlcyBhcmUgc2VudC5cblx0cHJpdmF0ZSBfc2Vzc2lvblN0YXJ0ZWRPblNvY2tldCA9IGZhbHNlO1xuXHRwcml2YXRlIF93aW5kb3c6IChXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcykgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvLyAtLS0gS2VlcC1hbGl2ZSBwaW5nL3BvbmcgLS0tXG5cdHByaXZhdGUgX3BpbmdUaW1lcjogUmV0dXJuVHlwZTxXaW5kb3dbJ3NldEludGVydmFsJ10+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wb25nVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8vIC0tLSBEZWJvdW5jZWQgY29udGV4dCBzZW5kaW5nIHdpdGggcGVyLXNlc3Npb24gZGVsdGEgdHJhY2tpbmcgLS0tXG5cdHByaXZhdGUgX2NvbnRleHRTZW5kVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHQvLyBMYXRlc3QgY29udGV4dCBoYW5kZWQgdG8gYGBzZW5kU2Vzc2lvbkNvbnRleHRgYCB3aGlsZSBhIGRlYm91bmNlIGlzIGluXG5cdC8vIGZsaWdodC4gSGVsZCBzbyBgYGZsdXNoU2Vzc2lvbkNvbnRleHRgYCBjYW4gc2hpcCBpdCBzeW5jaHJvbm91c2x5IGlmIGFcblx0Ly8gc3RhdGUtY2hhbmdlIGV2ZW50IG5lZWRzIHRvIGZpcmUgYmVmb3JlIHRoZSB0aW1lciBleHBpcmVzLlxuXHRwcml2YXRlIF9wZW5kaW5nQ29udGV4dDogSVZvaWNlU2Vzc2lvbkNvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RTZW50QnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4oKTsgLy8gc2Vzc2lvbiBpZCBcdTIxOTIgbGFzdC1zZW50IGZpZWxkIHZhbHVlc1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnZhbGlkYXRlZFNlc3Npb25JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvLyAtLS0gRXZlbnRzIC0tLVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblRyYW5zY3JpcHRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VUcmFuc2NyaXB0aW9uPigpKTtcblx0cmVhZG9ubHkgb25UcmFuc2NyaXB0aW9uOiBFdmVudDxJVm9pY2VUcmFuc2NyaXB0aW9uPiA9IHRoaXMuX29uVHJhbnNjcmlwdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkF1ZGlvUmVzcG9uc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VBdWRpb1Jlc3BvbnNlPigpKTtcblx0cmVhZG9ubHkgb25BdWRpb1Jlc3BvbnNlOiBFdmVudDxJVm9pY2VBdWRpb1Jlc3BvbnNlPiA9IHRoaXMuX29uQXVkaW9SZXNwb25zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJhcmdlSW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VCYXJnZUluPigpKTtcblx0cmVhZG9ubHkgb25CYXJnZUluOiBFdmVudDxJVm9pY2VCYXJnZUluPiA9IHRoaXMuX29uQmFyZ2VJbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk5hcnJhdGlvbkFjayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWb2ljZU5hcnJhdGlvbkFjaz4oKSk7XG5cdHJlYWRvbmx5IG9uTmFycmF0aW9uQWNrOiBFdmVudDxJVm9pY2VOYXJyYXRpb25BY2s+ID0gdGhpcy5fb25OYXJyYXRpb25BY2suZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25OYXJyYXRpb25VbmJsb2NrZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VOYXJyYXRpb25TaWduYWw+KCkpO1xuXHRyZWFkb25seSBvbk5hcnJhdGlvblVuYmxvY2tlZDogRXZlbnQ8SVZvaWNlTmFycmF0aW9uU2lnbmFsPiA9IHRoaXMuX29uTmFycmF0aW9uVW5ibG9ja2VkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTmFycmF0aW9uSW50ZXJydXB0ZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VOYXJyYXRpb25TaWduYWw+KCkpO1xuXHRyZWFkb25seSBvbk5hcnJhdGlvbkludGVycnVwdGVkOiBFdmVudDxJVm9pY2VOYXJyYXRpb25TaWduYWw+ID0gdGhpcy5fb25OYXJyYXRpb25JbnRlcnJ1cHRlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblRvb2xDYWxsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVZvaWNlVG9vbENhbGw+KCkpO1xuXHRyZWFkb25seSBvblRvb2xDYWxsOiBFdmVudDxJVm9pY2VUb29sQ2FsbD4gPSB0aGlzLl9vblRvb2xDYWxsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU3BlZWNoU3RhcnRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWb2ljZVNwZWVjaFN0YXJ0ZWQ+KCkpO1xuXHRyZWFkb25seSBvblNwZWVjaFN0YXJ0ZWQ6IEV2ZW50PElWb2ljZVNwZWVjaFN0YXJ0ZWQ+ID0gdGhpcy5fb25TcGVlY2hTdGFydGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU2Vzc2lvbkluaXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVm9pY2VTZXNzaW9uSW5pdD4oKSk7XG5cdHJlYWRvbmx5IG9uU2Vzc2lvbkluaXQ6IEV2ZW50PElWb2ljZVNlc3Npb25Jbml0PiA9IHRoaXMuX29uU2Vzc2lvbkluaXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25FcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRXJyb3I6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkVycm9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlOiBFdmVudDxib29sZWFuPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRmF0YWxEaXNjb25uZWN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVZvaWNlRmF0YWxEaXNjb25uZWN0PigpKTtcblx0cmVhZG9ubHkgb25GYXRhbERpc2Nvbm5lY3Q6IEV2ZW50PElWb2ljZUZhdGFsRGlzY29ubmVjdD4gPSB0aGlzLl9vbkZhdGFsRGlzY29ubmVjdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbm5lY3Rpb25Jc3N1ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWb2ljZUNvbm5lY3Rpb25Jc3N1ZT4oKSk7XG5cdHJlYWRvbmx5IG9uQ29ubmVjdGlvbklzc3VlOiBFdmVudDxJVm9pY2VDb25uZWN0aW9uSXNzdWU+ID0gdGhpcy5fb25Db25uZWN0aW9uSXNzdWUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25UdXJuQXV0b0VuZGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVZvaWNlVHVybkF1dG9FbmRlZD4oKSk7XG5cdHJlYWRvbmx5IG9uVHVybkF1dG9FbmRlZDogRXZlbnQ8SVZvaWNlVHVybkF1dG9FbmRlZD4gPSB0aGlzLl9vblR1cm5BdXRvRW5kZWQuZXZlbnQ7XG5cblx0Z2V0IGlzQ29ubmVjdGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0Nvbm5lY3RlZDtcblx0fVxuXG5cdGdldCBpc1Jlc3VtaW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Jlc3VtaW5nO1xuXHR9XG5cblx0Z2V0IHdpbGxSZWNvbm5lY3QoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlY29ubmVjdFRpbWVyICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgY3VycmVudFNlc3Npb25JZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0U2Vzc2lvbklkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXV0aFRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBQdXNoIHR1cm4tZW5kcG9pbnRpbmcgc2V0dGluZ3MgdG8gdGhlIGJhY2tlbmQgbGl2ZS4gVGFrZXMgZWZmZWN0IG9uXG5cdFx0Ly8gdGhlIG5leHQgcHVzaC10by10YWxrIHByZXNzICh0aGUgYmFja2VuZCBuZXZlciBtdXRhdGVzIGFuIGluLWZsaWdodFxuXHRcdC8vIHByZXNzKS4gV2hlbiBkaXNjb25uZWN0ZWQgdGhpcyBuby1vcHM7IHRoZSBsYXRlc3QgY29uZmlnIHJpZGVzIGFsb25nXG5cdFx0Ly8gb24gdGhlIG5leHQgYGBzdGFydF9zZXNzaW9uYGAgLyBgYHJlc3VtZV9zZXNzaW9uYGAgaW5zdGVhZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2FnZW50cy52b2ljZS50dXJuLnNpbGVuY2VNcycpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2FnZW50cy52b2ljZS50dXJuLnN0b3BQaHJhc2VzJykgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLmhhbmRzRnJlZScpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5fc2VuZFNldFR1cm5Db25maWcoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdhZ2VudHMudm9pY2Uudm9pY2UnKSkge1xuXHRcdFx0XHR0aGlzLl9zZW5kU2V0Vm9pY2UoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnKSkge1xuXHRcdFx0XHR0aGlzLl9zZW5kU2V0TGFuZ3VhZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRWb2ljZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBub3JtYWxpemVBZ2VudHNWb2ljZUlkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2FnZW50cy52b2ljZS52b2ljZScpKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRTZXRWb2ljZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3NldF92b2ljZScsIHZvaWNlOiB0aGlzLl9nZXRWb2ljZSgpIH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMYW5ndWFnZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnKTtcblx0XHRpZiAodHlwZW9mIGNvbmZpZ3VyZWQgPT09ICdzdHJpbmcnICYmIGNvbmZpZ3VyZWQudHJpbSgpLnRvTG93ZXJDYXNlKCkgIT09ICdhdXRvJykge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBjYW5vbmljYWxpemVTdXBwb3J0ZWRMYW5ndWFnZShjb25maWd1cmVkLCBUVFNfU1VQUE9SVEVEX0xBTkdVQUdFX0JBU0VTKTtcblx0XHRcdGlmIChsYW5ndWFnZSkge1xuXHRcdFx0XHRyZXR1cm4gbGFuZ3VhZ2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFt2b2ljZV0gVW5zdXBwb3J0ZWQgYWdlbnRzLnZvaWNlLmxhbmd1YWdlIHZhbHVlICcke2NvbmZpZ3VyZWR9JywgZmFsbGluZyBiYWNrIHRvICR7REVGQVVMVF9MQU5HVUFHRX1gKTtcblx0XHRcdHJldHVybiBERUZBVUxUX0xBTkdVQUdFO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNvbHZlQXV0b21hdGljVm9pY2VMYW5ndWFnZSh0aGlzLl93aW5kb3c/Lm5hdmlnYXRvci5sYW5ndWFnZSwgTGFuZ3VhZ2UudmFsdWUoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kU2V0TGFuZ3VhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTiAmJiB0aGlzLl9zZXNzaW9uU3RhcnRlZE9uU29ja2V0KSB7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3NldF9sYW5ndWFnZScsIGxhbmd1YWdlOiB0aGlzLl9nZXRMYW5ndWFnZSgpIH0pKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhIGNvbmZpZ3VyYXRpb24gc2V0dGluZyBoYXMgYW4gZXhwbGljaXQgdXNlci93b3Jrc3BhY2UvYXBwbGljYXRpb25cblx0ICogdmFsdWUsIGFzIG9wcG9zZWQgdG8gZmFsbGluZyBiYWNrIHRvIGl0cyByZWdpc3RlcmVkIGRlZmF1bHQuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0V4cGxpY2l0bHlDb25maWd1cmVkKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChrZXkpO1xuXHRcdHJldHVybiBpbnNwZWN0ZWQudXNlclZhbHVlICE9PSB1bmRlZmluZWRcblx0XHRcdHx8IGluc3BlY3RlZC51c2VyTG9jYWxWYWx1ZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBpbnNwZWN0ZWQudXNlclJlbW90ZVZhbHVlICE9PSB1bmRlZmluZWRcblx0XHRcdHx8IGluc3BlY3RlZC53b3Jrc3BhY2VWYWx1ZSAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBpbnNwZWN0ZWQud29ya3NwYWNlRm9sZGVyVmFsdWUgIT09IHVuZGVmaW5lZFxuXHRcdFx0fHwgaW5zcGVjdGVkLmFwcGxpY2F0aW9uVmFsdWUgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBc3NlbWJsZSB0aGUgYGB0dXJuX2NvbmZpZ2BgIHdpcmUgb2JqZWN0IGZyb20gdGhlIGBgYWdlbnRzLnZvaWNlLnR1cm4uKmBgXG5cdCAqIHNldHRpbmdzLCBub3JtYWxpemluZyBlYWNoIGludG8gdGhlIHNoYXBlIHRoZSBiYWNrZW5kIGV4cGVjdHMuIFRoZVxuXHQgKiBgYGF1dG9fZW5kX21vZGVgYCBpcyBkZXJpdmVkIGZyb20gdGhlIG90aGVyIHR3byBzZXR0aW5nczogdHJhaWxpbmctc2lsZW5jZVxuXHQgKiBlbmRpbmcgaXMgZW5hYmxlZCB1bmxlc3MgYGBzaWxlbmNlTXNgYCBpcyBgYC0xYGAgKG9yIG90aGVyd2lzZSBub24tcG9zaXRpdmUpLFxuXHQgKiBhbmQgc3RvcC1waHJhc2UgZW5kaW5nIGlzIGVuYWJsZWQgd2hlbiBhdCBsZWFzdCBvbmUgcGhyYXNlIGlzIGNvbmZpZ3VyZWQuXG5cdCAqXG5cdCAqIFdoZW4gaGFuZHMtZnJlZSBtb2RlIChgYGFnZW50cy52b2ljZS5oYW5kc0ZyZWVgYCkgaXMgZGlzYWJsZWQsIHRoZSB0dXJuIGlzXG5cdCAqIG5vdCBzZW50IGF1dG9tYXRpY2FsbHkgYnkgZGVmYXVsdDogdHJhaWxpbmctc2lsZW5jZSBhbmQgc3RvcC1waHJhc2UgZW5kaW5nXG5cdCAqIGFyZSBlYWNoIHN1cHByZXNzZWQgdW5sZXNzIHRoZSBjb3JyZXNwb25kaW5nIHNldHRpbmcgaGFzIGJlZW4gZXhwbGljaXRseVxuXHQgKiBjb25maWd1cmVkLCBzbyBhIHVzZXIgd2hvIG9wdHMgb3V0IG9mIHRoZSBoYW5kcy1mcmVlIGxvb3Aga2VlcHMgbWFudWFsXG5cdCAqIGNvbnRyb2wgb3ZlciB3aGVuIGEgdHVybiBpcyBzZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0VHVybkNvbmZpZygpOiBJVm9pY2VUdXJuQ29uZmlnIHtcblx0XHRjb25zdCBjZmcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRjb25zdCBoYW5kc0ZyZWUgPSBjZmcuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnKSA9PT0gdHJ1ZTtcblxuXHRcdGNvbnN0IHNpbGVuY2VSYXcgPSBjZmcuZ2V0VmFsdWU8bnVtYmVyPignYWdlbnRzLnZvaWNlLnR1cm4uc2lsZW5jZU1zJyk7XG5cdFx0bGV0IHNpbGVuY2VFbmFibGVkID0gdHlwZW9mIHNpbGVuY2VSYXcgPT09ICdudW1iZXInICYmIHNpbGVuY2VSYXcgPiAwO1xuXHRcdGlmICghaGFuZHNGcmVlICYmICF0aGlzLl9pc0V4cGxpY2l0bHlDb25maWd1cmVkKCdhZ2VudHMudm9pY2UudHVybi5zaWxlbmNlTXMnKSkge1xuXHRcdFx0c2lsZW5jZUVuYWJsZWQgPSBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgc2lsZW5jZV9tcyA9IHNpbGVuY2VFbmFibGVkID8gTWF0aC5yb3VuZChzaWxlbmNlUmF3KSA6IDgwMDtcblxuXHRcdGNvbnN0IHBocmFzZXNSYXcgPSBjZmcuZ2V0VmFsdWU8c3RyaW5nW10+KCdhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcycpO1xuXHRcdGNvbnN0IHN0b3BfcGhyYXNlcyA9IEFycmF5LmlzQXJyYXkocGhyYXNlc1Jhdylcblx0XHRcdD8gcGhyYXNlc1Jhdy5tYXAocCA9PiBTdHJpbmcocCkudHJpbSgpKS5maWx0ZXIocCA9PiBwLmxlbmd0aCA+IDApXG5cdFx0XHQ6IFtdO1xuXHRcdGxldCBwaHJhc2VzRW5hYmxlZCA9IHN0b3BfcGhyYXNlcy5sZW5ndGggPiAwO1xuXHRcdGlmICghaGFuZHNGcmVlICYmICF0aGlzLl9pc0V4cGxpY2l0bHlDb25maWd1cmVkKCdhZ2VudHMudm9pY2UudHVybi5zdG9wUGhyYXNlcycpKSB7XG5cdFx0XHRwaHJhc2VzRW5hYmxlZCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dG9fZW5kX21vZGU6IElWb2ljZVR1cm5Db25maWdbJ2F1dG9fZW5kX21vZGUnXSA9XG5cdFx0XHRzaWxlbmNlRW5hYmxlZCAmJiBwaHJhc2VzRW5hYmxlZCA/ICdib3RoJ1xuXHRcdFx0XHQ6IHNpbGVuY2VFbmFibGVkID8gJ3ZhZCdcblx0XHRcdFx0XHQ6IHBocmFzZXNFbmFibGVkID8gJ3BocmFzZSdcblx0XHRcdFx0XHRcdDogJ29mZic7XG5cblx0XHRyZXR1cm4geyBhdXRvX2VuZF9tb2RlLCBzaWxlbmNlX21zLCBzdG9wX3BocmFzZXM6IHBocmFzZXNFbmFibGVkID8gc3RvcF9waHJhc2VzIDogW10sIHZhZF9nYXRlX2FzcjogdHJ1ZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZFNldFR1cm5Db25maWcoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzZXRfdHVybl9jb25maWcnLCB0dXJuX2NvbmZpZzogdGhpcy5fZ2V0VHVybkNvbmZpZygpIH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRXc1VybCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdhZ2VudHMudm9pY2UuYmFja2VuZFVybCcpO1xuXHRcdGNvbnN0IHVybCA9IHR5cGVvZiBjb25maWd1cmVkID09PSAnc3RyaW5nJyA/IGNvbmZpZ3VyZWQudHJpbSgpIDogJyc7XG5cdFx0cmV0dXJuIHVybCB8fCB0aGlzLl9wcm9kdWN0U2VydmljZS52b2ljZVdzVXJsIHx8ICcnO1xuXHR9XG5cblx0YXN5bmMgY29ubmVjdCh3aW5kb3c6IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzLCBhdXRoVG9rZW4/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl93aW5kb3cgPSB3aW5kb3c7XG5cdFx0dGhpcy5fYXV0aFRva2VuID0gYXV0aFRva2VuO1xuXHRcdHRoaXMuX3Jlc2V0UmVjb25uZWN0QnVkZ2V0KCk7XG5cdFx0dGhpcy5fY29ubmVjdFdlYlNvY2tldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29ubmVjdFdlYlNvY2tldCgpOiB2b2lkIHtcblx0XHRjb25zdCB3aW4gPSB0aGlzLl93aW5kb3c7XG5cdFx0aWYgKCF3aW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBiYXNlVXJsID0gdGhpcy5fZ2V0V3NVcmwoKTtcblx0XHRpZiAoIWJhc2VVcmwpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1t2b2ljZV0gTm8gdm9pY2UgV2ViU29ja2V0IFVSTCBjb25maWd1cmVkIChzZXQgdm9pY2VXc1VybCBpbiBwcm9kdWN0Lmpzb24gb3IgYWdlbnRzLnZvaWNlLmJhY2tlbmRVcmwgaW4gc2V0dGluZ3MpJyk7XG5cdFx0XHR0aGlzLl9vbkZhdGFsRGlzY29ubmVjdC5maXJlKHsgY29kZTogMCwgcmVhc29uOiAnJywga2luZDogJ2ZhdGFsJywgY2xpZW50U2lkZTogdHJ1ZSB9KTtcblx0XHRcdHRoaXMuX2NsZWFudXAoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdXJsID0gdGhpcy5fYXV0aFRva2VuXG5cdFx0XHQ/IGAke2Jhc2VVcmx9P3Rva2VuPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMuX2F1dGhUb2tlbil9YFxuXHRcdFx0OiBiYXNlVXJsO1xuXHRcdGNvbnN0IHdzID0gbmV3IHdpbi5XZWJTb2NrZXQodXJsKTtcblx0XHR0aGlzLl93cyA9IHdzO1xuXHRcdHRoaXMuX3Nlc3Npb25TdGFydGVkT25Tb2NrZXQgPSBmYWxzZTtcblxuXHRcdHdzLm9ub3BlbiA9ICgpID0+IHtcblx0XHRcdC8vIERvZXMgbm90IHJlc2V0IHRoZSByZXRyeSBidWRnZXQ6IHJlZnVzZWQgY29ubmVjdGlvbnMgYWxzbyBmaXJlIG9ub3Blbixcblx0XHRcdC8vIHNvIHJlc2V0dGluZyBoZXJlIHdvdWxkIHJlZmlsbCB0aGUgYnVkZ2V0IG9uIGV2ZXJ5IGZhaWxpbmcgY3ljbGUuIFRoZVxuXHRcdFx0Ly8gcmVzZXQgaGFwcGVucyBvbiBzZXNzaW9uX2luaXQvc2Vzc2lvbl9yZXN1bWVkIGluc3RlYWQuXG5cdFx0XHR0aGlzLl9pc1Jlc3VtaW5nID0gISF0aGlzLl9sYXN0U2Vzc2lvbklkO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN0YXJ0ZWRPblNvY2tldCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fc2V0Q29ubmVjdGVkKHRydWUpO1xuXHRcdFx0dGhpcy5fc3RhcnRQaW5nKCk7XG5cblx0XHRcdGlmICh0aGlzLl9sYXN0U2Vzc2lvbklkKSB7XG5cdFx0XHRcdC8vIFJlY29ubmVjdGluZyBcdTIwMTQgcmVzdW1lX3Nlc3Npb24gd2l0aCBjb250ZXh0IGlzIHNlbnQgYnkgc2VuZFJlc3VtZVNlc3Npb24oKVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR3cy5vbm1lc3NhZ2UgPSAoZXZ0OiBNZXNzYWdlRXZlbnQpID0+IHtcblx0XHRcdGxldCBtc2c6IHtcblx0XHRcdFx0dHlwZTogc3RyaW5nO1xuXHRcdFx0XHRzZXNzaW9uX2lkPzogc3RyaW5nO1xuXHRcdFx0XHR0ZXh0PzogdW5rbm93bjtcblx0XHRcdFx0YXVkaW8/OiBzdHJpbmc7XG5cdFx0XHRcdGlzX2ZpcnN0X2NodW5rPzogYm9vbGVhbjtcblx0XHRcdFx0aXNfZmluYWw/OiBib29sZWFuO1xuXHRcdFx0XHRjb2Rpbmdfc2Vzc2lvbl9pZD86IHN0cmluZztcblx0XHRcdFx0dHJhbnNjcmlwdD86IHN0cmluZztcblx0XHRcdFx0ZGV0YWlsPzogc3RyaW5nO1xuXHRcdFx0XHRuYW1lPzogc3RyaW5nO1xuXHRcdFx0XHRjYWxsX2lkPzogc3RyaW5nO1xuXHRcdFx0XHRhcmdzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblx0XHRcdFx0c3RhdHVzPzogdW5rbm93bjtcblx0XHRcdFx0Y29tbWl0dGVkPzogdW5rbm93bjtcblx0XHRcdFx0cmVhc29uPzogc3RyaW5nO1xuXHRcdFx0XHR0dXJuX2lkPzogdW5rbm93bjtcblx0XHRcdFx0cmV2aXNpb24/OiB1bmtub3duO1xuXHRcdFx0XHRuYXJyYXRpb25faWQ/OiBzdHJpbmc7XG5cdFx0XHRcdHJlcXVlc3RfaWQ/OiBzdHJpbmc7XG5cdFx0XHRcdGNoZWNrcG9pbnRfaWQ/OiBzdHJpbmc7XG5cdFx0XHRcdHNlcXVlbmNlPzogbnVtYmVyO1xuXHRcdFx0XHRuYXJyYXRpb25fa2luZD86IHN0cmluZztcblx0XHRcdFx0cGxheWJhY2tfaWQ/OiBzdHJpbmc7XG5cdFx0XHRcdGludGVycnVwdGVkX3R1cm5faWQ/OiBzdHJpbmc7XG5cdFx0XHRcdGRpc3Bvc2l0aW9uPzogc3RyaW5nO1xuXHRcdFx0XHRyZXRyeWFibGU/OiBib29sZWFuO1xuXHRcdFx0fTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdG1zZyA9IEpTT04ucGFyc2UoZXZ0LmRhdGEgYXMgc3RyaW5nKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHN3aXRjaCAobXNnLnR5cGUpIHtcblx0XHRcdFx0Y2FzZSAncG9uZyc6XG5cdFx0XHRcdFx0dGhpcy5fY2xlYXJQb25nVGltZW91dCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdzZXNzaW9uX2luaXQnOlxuXHRcdFx0XHRcdHRoaXMuX3Jlc2V0UmVjb25uZWN0QnVkZ2V0KCk7XG5cdFx0XHRcdFx0Ly8gQWRvcHQgdGhlIHNlcnZlcidzIHNlc3Npb24gaWQgZXZlbiB3aGVuIGEgcmVzdW1lIGZhaWxlZCBhbmQgaXRcblx0XHRcdFx0XHQvLyBzdGFydGVkIGEgZnJlc2ggc2Vzc2lvbjsga2VlcGluZyB0aGUgb2xkIGlkIHN0YWxsZWQgcmVjb25uZWN0IChgX2lzUmVzdW1pbmdgKS5cblx0XHRcdFx0XHR0aGlzLl9sYXN0U2Vzc2lvbklkID0gbXNnLnNlc3Npb25faWQ7XG5cdFx0XHRcdFx0dGhpcy5faXNSZXN1bWluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuX29uU2Vzc2lvbkluaXQuZmlyZSh7IHNlc3Npb25JZDogbXNnLnNlc3Npb25faWQgPz8gJycgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3Nlc3Npb25fcmVzdW1lZCc6XG5cdFx0XHRcdFx0dGhpcy5fcmVzZXRSZWNvbm5lY3RCdWRnZXQoKTtcblx0XHRcdFx0XHR0aGlzLl9sYXN0U2Vzc2lvbklkID0gbXNnLnNlc3Npb25faWQ7XG5cdFx0XHRcdFx0dGhpcy5faXNSZXN1bWluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuX29uU2Vzc2lvbkluaXQuZmlyZSh7IHNlc3Npb25JZDogbXNnLnNlc3Npb25faWQgPz8gJycgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3NwZWVjaF9zdGFydGVkJzpcblx0XHRcdFx0XHR0aGlzLl9vblNwZWVjaFN0YXJ0ZWQuZmlyZSh7IHR1cm5JZDogYXNPcHRpb25hbFN0cmluZyhtc2cudHVybl9pZCkgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2JhcmdlX2luJzpcblx0XHRcdFx0XHR0aGlzLl9vbkJhcmdlSW4uZmlyZSh7XG5cdFx0XHRcdFx0XHR0dXJuSWQ6IGFzT3B0aW9uYWxTdHJpbmcobXNnLnR1cm5faWQpID8/ICcnLFxuXHRcdFx0XHRcdFx0aW50ZXJydXB0ZWRUdXJuSWQ6IG1zZy5pbnRlcnJ1cHRlZF90dXJuX2lkID8/ICcnLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICduYXJyYXRpb25fYWNrJzoge1xuXHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2l0aW9uID0gbXNnLmRpc3Bvc2l0aW9uID09PSAnYnVzeSdcblx0XHRcdFx0XHRcdHx8IG1zZy5kaXNwb3NpdGlvbiA9PT0gJ2ludmFsaWQnXG5cdFx0XHRcdFx0XHR8fCBtc2cuZGlzcG9zaXRpb24gPT09ICdzdXBwcmVzc2VkJ1xuXHRcdFx0XHRcdFx0PyBtc2cuZGlzcG9zaXRpb25cblx0XHRcdFx0XHRcdDogJ2FjY2VwdGVkJztcblx0XHRcdFx0XHR0aGlzLl9vbk5hcnJhdGlvbkFjay5maXJlKHtcblx0XHRcdFx0XHRcdG5hcnJhdGlvbklkOiBtc2cubmFycmF0aW9uX2lkID8/ICcnLFxuXHRcdFx0XHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBtc2cuY29kaW5nX3Nlc3Npb25faWQgPz8gJycsXG5cdFx0XHRcdFx0XHRkaXNwb3NpdGlvbixcblx0XHRcdFx0XHRcdHJlYXNvbjogbXNnLnJlYXNvbixcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICduYXJyYXRpb25fdW5ibG9ja2VkJzpcblx0XHRcdFx0XHR0aGlzLl9vbk5hcnJhdGlvblVuYmxvY2tlZC5maXJlKHtcblx0XHRcdFx0XHRcdG5hcnJhdGlvbklkOiBtc2cubmFycmF0aW9uX2lkID8/ICcnLFxuXHRcdFx0XHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBtc2cuY29kaW5nX3Nlc3Npb25faWQgPz8gJycsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ25hcnJhdGlvbl9pbnRlcnJ1cHRlZCc6XG5cdFx0XHRcdFx0dGhpcy5fb25OYXJyYXRpb25JbnRlcnJ1cHRlZC5maXJlKHtcblx0XHRcdFx0XHRcdG5hcnJhdGlvbklkOiBtc2cubmFycmF0aW9uX2lkID8/ICcnLFxuXHRcdFx0XHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBtc2cuY29kaW5nX3Nlc3Npb25faWQgPz8gJycsXG5cdFx0XHRcdFx0XHQuLi4odHlwZW9mIG1zZy5yZXRyeWFibGUgPT09ICdib29sZWFuJyA/IHsgcmV0cnlhYmxlOiBtc2cucmV0cnlhYmxlIH0gOiB7fSksXG5cdFx0XHRcdFx0XHQuLi4obXNnLnJlYXNvbiA/IHsgcmVhc29uOiBtc2cucmVhc29uIH0gOiB7fSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3RyYW5zY3JpcHRpb24nOiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzID0gbXNnLnN0YXR1cyA9PT0gdW5kZWZpbmVkID8gJ2ZpbmFsJyA6IGFzVHJhbnNjcmlwdGlvblN0YXR1cyhtc2cuc3RhdHVzKTtcblx0XHRcdFx0XHRjb25zdCB0dXJuSWQgPSBtc2cudHVybl9pZCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogYXNPcHRpb25hbE5vbkVtcHR5U3RyaW5nKG1zZy50dXJuX2lkKTtcblx0XHRcdFx0XHRjb25zdCByZXZpc2lvbiA9IG1zZy5yZXZpc2lvbiA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogYXNUcmFuc2NyaXB0aW9uUmV2aXNpb24obXNnLnJldmlzaW9uKTtcblx0XHRcdFx0XHRpZiAoIXN0YXR1cyB8fCAobXNnLnR1cm5faWQgIT09IHVuZGVmaW5lZCAmJiAhdHVybklkKSB8fCAobXNnLnJldmlzaW9uICE9PSB1bmRlZmluZWQgJiYgKCF0dXJuSWQgfHwgcmV2aXNpb24gPT09IHVuZGVmaW5lZCkpKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fb25UcmFuc2NyaXB0aW9uLmZpcmUoe1xuXHRcdFx0XHRcdFx0dGV4dDogYXNPcHRpb25hbFN0cmluZyhtc2cudGV4dCkgPz8gJycsXG5cdFx0XHRcdFx0XHRzdGF0dXMsXG5cdFx0XHRcdFx0XHRjb21taXR0ZWQ6IGFzT3B0aW9uYWxTdHJpbmcobXNnLmNvbW1pdHRlZCkgPz8gJycsXG5cdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHRyZXZpc2lvbixcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdhdWRpb19yZXNwb25zZSc6IHtcblx0XHRcdFx0XHQvLyBPbGQgcHJlLXN0cmVhbWluZyBzZXJ2ZXIgKHByZSBQUiAjNDQwNzYpIGRvZXNuJ3Qgc2VuZFxuXHRcdFx0XHRcdC8vIGBpc19maXJzdF9jaHVua2AgYXQgYWxsLiBUcmVhdCBtaXNzaW5nIGZpZWxkIGFzIFRSVUUgc29cblx0XHRcdFx0XHQvLyBzdXBwcmVzc2lvbi1jbGVhcmluZyBpbiBfZW5xdWV1ZUF1ZGlvIHN0aWxsIHdvcmtzOyBuZXdcblx0XHRcdFx0XHQvLyBzdHJlYW1pbmcgc2VydmVyIGFsd2F5cyBlbWl0cyB0cnVlL2ZhbHNlIGV4cGxpY2l0bHkuXG5cdFx0XHRcdFx0Y29uc3QgcmVxdWVzdElkID0gYXNPcHRpb25hbFN0cmluZyhtc2cucmVxdWVzdF9pZCk7XG5cdFx0XHRcdFx0Y29uc3QgY2hlY2twb2ludElkID0gaXNWb2ljZUNoZWNrcG9pbnRJZChtc2cuY2hlY2twb2ludF9pZCkgPyBtc2cuY2hlY2twb2ludF9pZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBzZXF1ZW5jZSA9IHR5cGVvZiBtc2cuc2VxdWVuY2UgPT09ICdudW1iZXInICYmIE51bWJlci5pc1NhZmVJbnRlZ2VyKG1zZy5zZXF1ZW5jZSkgJiYgbXNnLnNlcXVlbmNlID4gMCA/IG1zZy5zZXF1ZW5jZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBuYXJyYXRpb25LaW5kID0gbXNnLm5hcnJhdGlvbl9raW5kID09PSAncmVzcG9uc2UnIHx8IG1zZy5uYXJyYXRpb25fa2luZCA9PT0gJ2NvbmZpcm1hdGlvbicgfHwgbXNnLm5hcnJhdGlvbl9raW5kID09PSAnY2hlY2twb2ludCcgPyBtc2cubmFycmF0aW9uX2tpbmQgYXMgVm9pY2VOYXJyYXRpb25LaW5kIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IHBsYXliYWNrSWQgPSBhc09wdGlvbmFsU3RyaW5nKG1zZy5wbGF5YmFja19pZCk7XG5cdFx0XHRcdFx0aWYgKG5hcnJhdGlvbktpbmQgPT09ICdjaGVja3BvaW50Jykge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbdm9pY2VdIGNoZWNrcG9pbnQgYXVkaW8gcmVxdWVzdD0ke3JlcXVlc3RJZCA/PyAnbm9uZSd9IHN0YWdlPSR7Y2hlY2twb2ludElkID8/ICdub25lJ30gc2VxdWVuY2U9JHtzZXF1ZW5jZSA/PyAnbm9uZSd9IGZpcnN0PSR7bXNnLmlzX2ZpcnN0X2NodW5rID09PSB1bmRlZmluZWQgPyB0cnVlIDogQm9vbGVhbihtc2cuaXNfZmlyc3RfY2h1bmspfSBmaW5hbD0ke0Jvb2xlYW4obXNnLmlzX2ZpbmFsKX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fb25BdWRpb1Jlc3BvbnNlLmZpcmUoe1xuXHRcdFx0XHRcdFx0YXVkaW86IG1zZy5hdWRpbyA/PyAnJyxcblx0XHRcdFx0XHRcdGlzRmlyc3RDaHVuazogbXNnLmlzX2ZpcnN0X2NodW5rID09PSB1bmRlZmluZWQgPyB0cnVlIDogQm9vbGVhbihtc2cuaXNfZmlyc3RfY2h1bmspLFxuXHRcdFx0XHRcdFx0aXNGaW5hbDogbXNnLmlzX2ZpbmFsID8/IGZhbHNlLFxuXHRcdFx0XHRcdFx0Y29kaW5nU2Vzc2lvbklkOiBtc2cuY29kaW5nX3Nlc3Npb25faWQsXG5cdFx0XHRcdFx0XHR0cmFuc2NyaXB0OiBtc2cudHJhbnNjcmlwdCxcblx0XHRcdFx0XHRcdHR1cm5JZDogYXNPcHRpb25hbFN0cmluZyhtc2cudHVybl9pZCksXG5cdFx0XHRcdFx0XHRyZXNwb25zZUlkOiBtc2cubmFycmF0aW9uX2lkID8/IGFzT3B0aW9uYWxTdHJpbmcobXNnLnR1cm5faWQpLFxuXHRcdFx0XHRcdFx0Li4uKHJlcXVlc3RJZCA/IHsgcmVxdWVzdElkIH0gOiB7fSksXG5cdFx0XHRcdFx0XHQuLi4oY2hlY2twb2ludElkID8geyBjaGVja3BvaW50SWQgfSA6IHt9KSxcblx0XHRcdFx0XHRcdC4uLihzZXF1ZW5jZSAhPT0gdW5kZWZpbmVkID8geyBzZXF1ZW5jZSB9IDoge30pLFxuXHRcdFx0XHRcdFx0Li4uKG5hcnJhdGlvbktpbmQgPyB7IG5hcnJhdGlvbktpbmQgfSA6IHt9KSxcblx0XHRcdFx0XHRcdC4uLihwbGF5YmFja0lkID8geyBwbGF5YmFja0lkIH0gOiB7fSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAndG9vbF9jYWxsJzpcblx0XHRcdFx0XHR0aGlzLl9vblRvb2xDYWxsLmZpcmUoe1xuXHRcdFx0XHRcdFx0Y2FsbElkOiBtc2cuY2FsbF9pZCA/PyAnJyxcblx0XHRcdFx0XHRcdG5hbWU6IG1zZy5uYW1lID8/ICcnLFxuXHRcdFx0XHRcdFx0YXJnczogbXNnLmFyZ3MgPz8ge30sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3R1cm5fYXV0b19lbmRlZCc6IHtcblx0XHRcdFx0XHQvLyBCYWNrZW5kIGVuZGVkIHRoZSBoZWxkIHR1cm4gaXRzZWxmIChzZXJ2ZXIgVkFEIHNpbGVuY2Ugb3IgYVxuXHRcdFx0XHRcdC8vIG1hdGNoZWQgc3RvcCBwaHJhc2UpLiBOb3JtYWxpemUgdGhlIHJlYXNvbiBhbmQgbGV0IHRoZVxuXHRcdFx0XHRcdC8vIGNvbnN1bWVyIHN0b3AgY2FwdHVyZSBmb3IgdGhhdCB0dXJuOyBpdCBtdXN0IG5vdCBzZW5kIGl0c1xuXHRcdFx0XHRcdC8vIG93biBwdHRfZW5kLlxuXHRcdFx0XHRcdGNvbnN0IHJlYXNvbjogSVZvaWNlVHVybkF1dG9FbmRSZWFzb24gPSBtc2cucmVhc29uID09PSAnc3RvcF9waHJhc2UnID8gJ3N0b3BfcGhyYXNlJyA6ICd2YWRfc2lsZW5jZSc7XG5cdFx0XHRcdFx0dGhpcy5fb25UdXJuQXV0b0VuZGVkLmZpcmUoeyByZWFzb24sIHR1cm5JZDogYXNPcHRpb25hbFN0cmluZyhtc2cudHVybl9pZCkgPz8gJycgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShtc2cuZGV0YWlsID8/ICdVbmtub3duIGVycm9yJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHdzLm9uZXJyb3IgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkVycm9yLmZpcmUoJ1dlYlNvY2tldCBlcnJvcicpO1xuXHRcdH07XG5cblx0XHR3cy5vbmNsb3NlID0gKGV2dDogQ2xvc2VFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSB3cy5vbmNsb3NlIGNvZGU9JHtldnQuY29kZX0gcmVhc29uPSR7ZXZ0LnJlYXNvbiA/PyAnJ30gd2FzQ2xlYW49JHtldnQud2FzQ2xlYW59YCk7XG5cdFx0XHRpZiAodGhpcy5fd3MgPT09IHdzKSB7XG5cdFx0XHRcdC8vIEV2ZXJ5IHRlcm1pbmFsIG91dGNvbWUgbXVzdCByZXBvcnQgaXRzZWxmLCBzbyBjb25zdW1lcnMgY2FuIGxlYXZlXG5cdFx0XHRcdC8vIHRoZSByZWNvbm5lY3Rpbmcgc3RhdGUuXG5cdFx0XHRcdGlmIChpc1Rlcm1pbmFsQ2xvc2VDb2RlKGV2dC5jb2RlKSkge1xuXHRcdFx0XHRcdGNvbnN0IGtpbmQgPSB2b2ljZUNsb3NlQ29kZUluZm8oZXZ0LmNvZGUpPy5raW5kID8/ICdmYXRhbCc7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbdm9pY2VdIHRlcm1pbmFsIGNsb3NlICR7ZXZ0LmNvZGV9ICgke2tpbmR9KTogJHtldnQucmVhc29ufSwgbm90IHJlY29ubmVjdGluZ2ApO1xuXHRcdFx0XHRcdHRoaXMuX29uRmF0YWxEaXNjb25uZWN0LmZpcmUoeyBjb2RlOiBldnQuY29kZSwgcmVhc29uOiBldnQucmVhc29uID8/ICcnLCBraW5kIH0pO1xuXHRcdFx0XHRcdHRoaXMuX2NsZWFudXAoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXRoaXMuX3JlY29ubmVjdFN0YXJ0ZWRBdCkge1xuXHRcdFx0XHRcdHRoaXMuX3JlY29ubmVjdFN0YXJ0ZWRBdCA9IERhdGUubm93KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBlbGFwc2VkID0gRGF0ZS5ub3coKSAtIHRoaXMuX3JlY29ubmVjdFN0YXJ0ZWRBdDtcblx0XHRcdFx0aWYgKGVsYXBzZWQgPj0gTUFYX1JFQ09OTkVDVF9EVVJBVElPTl9NUykge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW3ZvaWNlXSByZWNvbm5lY3QgYnVkZ2V0IG9mICR7TUFYX1JFQ09OTkVDVF9EVVJBVElPTl9NU31tcyBleGhhdXN0ZWQsIGdpdmluZyB1cGApO1xuXHRcdFx0XHRcdHRoaXMuX29uRmF0YWxEaXNjb25uZWN0LmZpcmUoeyBjb2RlOiBldnQuY29kZSwgcmVhc29uOiBldnQucmVhc29uID8/ICcnLCBraW5kOiAnZmF0YWwnIH0pO1xuXHRcdFx0XHRcdHRoaXMuX2NsZWFudXAoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9yZWNvbm5lY3RBdHRlbXB0cysrO1xuXHRcdFx0XHR0aGlzLl9zdG9wUGluZygpO1xuXHRcdFx0XHR0aGlzLl93cyA9IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRjb25zdCBkZWxheSA9IHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzIDw9IEZBU1RfUkVUUllfQ09VTlRcblx0XHRcdFx0XHQ/IEZBU1RfUkVUUllfREVMQVlfTVNcblx0XHRcdFx0XHQ6IFNMT1dfUkVUUllfREVMQVlfTVM7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW3ZvaWNlXSB3cyBjbG9zZWQgYWJub3JtYWxseSAoY29kZT0ke2V2dC5jb2RlfSByZWFzb249JHtldnQucmVhc29uIHx8ICdub25lJ30gd2FzQ2xlYW49JHtldnQud2FzQ2xlYW59KTsgcmVjb25uZWN0aW5nIGluICR7ZGVsYXl9bXMgKGF0dGVtcHQgJHt0aGlzLl9yZWNvbm5lY3RBdHRlbXB0c30pYCk7XG5cdFx0XHRcdHRoaXMuX3JlY29ubmVjdFRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcmVjb25uZWN0VGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fY29ubmVjdFdlYlNvY2tldCgpO1xuXHRcdFx0XHR9LCBkZWxheSk7XG5cdFx0XHRcdHRoaXMuX3NldENvbm5lY3RlZChmYWxzZSk7XG5cdFx0XHRcdC8vIE11c3QgZm9sbG93IF9zZXRDb25uZWN0ZWQ6IGNvbnN1bWVycyBlbnRlciB0aGUgcmVjb25uZWN0aW5nIHN0YXRlIG9uXG5cdFx0XHRcdC8vIHRoYXQgZXZlbnQgYW5kIG9ubHkgdGhlbiByZW5kZXIgdGhpcyByZWFzb24uXG5cdFx0XHRcdHRoaXMuX29uQ29ubmVjdGlvbklzc3VlLmZpcmUoeyBjb2RlOiBldnQuY29kZSwgcmVhc29uOiBldnQucmVhc29uID8/ICcnIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRkaXNjb25uZWN0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1t2b2ljZV0gZGlzY29ubmVjdCgpIGNhbGxlZCcpO1xuXHRcdGlmICh0aGlzLl93cyAmJiB0aGlzLl93cy5yZWFkeVN0YXRlIDwgV2ViU29ja2V0LkNMT1NJTkcpIHtcblx0XHRcdHRoaXMuX3dzLmNsb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NsZWFudXAoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFudXAoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzZXRSZWNvbm5lY3RCdWRnZXQoKTtcblx0XHR0aGlzLl9zdG9wUGluZygpO1xuXHRcdGlmICh0aGlzLl9yZWNvbm5lY3RUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3JlY29ubmVjdFRpbWVyKTtcblx0XHRcdHRoaXMuX3JlY29ubmVjdFRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29udGV4dFNlbmRUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2NvbnRleHRTZW5kVGltZXIpO1xuXHRcdFx0dGhpcy5fY29udGV4dFNlbmRUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0NvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fd3MgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXJ0ZWRPblNvY2tldCA9IGZhbHNlO1xuXHRcdHRoaXMuX3dpbmRvdyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sYXN0U2Vzc2lvbklkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2lzUmVzdW1pbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9sYXN0U2VudEJ5SWQuY2xlYXIoKTtcblx0XHR0aGlzLl9pbnZhbGlkYXRlZFNlc3Npb25JZHMuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXRDb25uZWN0ZWQoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzZXRSZWNvbm5lY3RCdWRnZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMgPSAwO1xuXHRcdHRoaXMuX3JlY29ubmVjdFN0YXJ0ZWRBdCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0UGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9wUGluZygpO1xuXHRcdGNvbnN0IHdpbiA9IHRoaXMuX3dpbmRvdyA/PyBtYWluV2luZG93O1xuXHRcdHRoaXMuX3BpbmdUaW1lciA9IHdpbi5zZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHRcdHRoaXMuX3dzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAncGluZycgfSkpO1xuXHRcdFx0XHR0aGlzLl9wb25nVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1t2b2ljZV0gcG9uZyB0aW1lb3V0IFx1MjAxNCBzZXJ2ZXIgdW5yZWFjaGFibGUsIHJlY29ubmVjdGluZycpO1xuXHRcdFx0XHRcdHRoaXMuX3dzPy5jbG9zZSg0MDAwLCAncG9uZyB0aW1lb3V0Jyk7XG5cdFx0XHRcdH0sIFBPTkdfVElNRU9VVF9NUyk7XG5cdFx0XHR9XG5cdFx0fSwgUElOR19JTlRFUlZBTF9NUyk7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wUGluZygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGluZ1RpbWVyKSB7XG5cdFx0XHQodGhpcy5fd2luZG93ID8/IG1haW5XaW5kb3cpLmNsZWFySW50ZXJ2YWwodGhpcy5fcGluZ1RpbWVyKTtcblx0XHRcdHRoaXMuX3BpbmdUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fY2xlYXJQb25nVGltZW91dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJQb25nVGltZW91dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcG9uZ1RpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fcG9uZ1RpbWVyKTtcblx0XHRcdHRoaXMuX3BvbmdUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb25uZWN0ZWQoY29ubmVjdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzQ29ubmVjdGVkICE9PSBjb25uZWN0ZWQpIHtcblx0XHRcdHRoaXMuX2lzQ29ubmVjdGVkID0gY29ubmVjdGVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUuZmlyZShjb25uZWN0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHNlbmRQdHRTdGFydCh0dXJuSWQ6IHN0cmluZywgcGFzc2l2ZTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdwdHRfc3RhcnQnLCB0dXJuX2lkOiB0dXJuSWQsIC4uLihwYXNzaXZlID8geyBwYXNzaXZlOiB0cnVlIH0gOiB7fSkgfSkpO1xuXHRcdH1cblx0fVxuXG5cdHNlbmRQdHRBdWRpb0NodW5rKGF1ZGlvOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3B0dF9hdWRpb19jaHVuaycsIGF1ZGlvIH0pKTtcblx0XHR9XG5cdH1cblxuXHRzZW5kUHR0RW5kKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93cz8ucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcblx0XHRcdHRoaXMuX3dzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAncHR0X2VuZCcgfSkpO1xuXHRcdH1cblx0fVxuXG5cdHNlbmRQdHREaWFnbm9zdGljKHR1cm5JZDogc3RyaW5nLCBtZXRyaWNzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93cz8ucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcblx0XHRcdHRoaXMuX3dzLnNlbmQoSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAncHR0X2RpYWdub3N0aWMnLCB0dXJuX2lkOiB0dXJuSWQsIG1ldHJpY3MgfSkpO1xuXHRcdH1cblx0fVxuXG5cdHNlbmRTZXNzaW9uQ29udGV4dChjb250ZXh0OiBJVm9pY2VTZXNzaW9uQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNDb25uZWN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0NvbnRleHQgPSBjb250ZXh0O1xuXHRcdGlmICh0aGlzLl9jb250ZXh0U2VuZFRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fY29udGV4dFNlbmRUaW1lcik7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRleHRTZW5kVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2NvbnRleHRTZW5kVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0NvbnRleHQ7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChwZW5kaW5nICYmIHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTikge1xuXHRcdFx0XHR0aGlzLl9zZW5kRGVsdGEocGVuZGluZyk7XG5cdFx0XHR9XG5cdFx0fSwgNTAwKTtcblx0fVxuXG5cdGZsdXNoU2Vzc2lvbkNvbnRleHQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250ZXh0U2VuZFRpbWVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNsZWFyVGltZW91dCh0aGlzLl9jb250ZXh0U2VuZFRpbWVyKTtcblx0XHR0aGlzLl9jb250ZXh0U2VuZFRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nQ29udGV4dDtcblx0XHR0aGlzLl9wZW5kaW5nQ29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHRpZiAocGVuZGluZyAmJiB0aGlzLl93cz8ucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcblx0XHRcdHRoaXMuX3NlbmREZWx0YShwZW5kaW5nKTtcblx0XHR9XG5cdH1cblxuXHRpbnZhbGlkYXRlU2Vzc2lvbkNhY2hlKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5faW52YWxpZGF0ZWRTZXNzaW9uSWRzLmFkZChzZXNzaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZERlbHRhKGNvbnRleHQ6IElWb2ljZVNlc3Npb25Db250ZXh0KTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudElkcyA9IG5ldyBTZXQoY29udGV4dC5zZXNzaW9ucy5tYXAocyA9PiBzLmlkKSk7XG5cdFx0Y29uc3QgcmVtb3ZlcyA9IFsuLi50aGlzLl9sYXN0U2VudEJ5SWQua2V5cygpXS5maWx0ZXIoaWQgPT4gIWN1cnJlbnRJZHMuaGFzKGlkKSk7XG5cblx0XHQvLyBDb21wdXRlIHBlci1zZXNzaW9uIGZpZWxkLWxldmVsIHBhdGNoZXMgKEpTT04gTWVyZ2UgUGF0Y2ggc3R5bGUpXG5cdFx0Y29uc3QgdXBzZXJ0czogUmVjb3JkPHN0cmluZywgdW5rbm93bj5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBjb250ZXh0LnNlc3Npb25zKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gc2Vzc2lvbiBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0Y29uc3QgcHJldiA9IHRoaXMuX2xhc3RTZW50QnlJZC5nZXQoc2Vzc2lvbi5pZCk7XG5cdFx0XHRpZiAoIXByZXYpIHtcblx0XHRcdFx0Ly8gTmV3IHNlc3Npb24gXHUyMDE0IHNlbmQgYWxsIGZpZWxkc1xuXHRcdFx0XHR1cHNlcnRzLnB1c2goY3VycmVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwYXRjaDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IGlkOiBzZXNzaW9uLmlkIH07XG5cdFx0XHRcdGxldCBoYXNDaGFuZ2VzID0gZmFsc2U7XG5cdFx0XHRcdGlmICh0aGlzLl9pbnZhbGlkYXRlZFNlc3Npb25JZHMuaGFzKHNlc3Npb24uaWQpKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoY3VycmVudCkpIHtcblx0XHRcdFx0XHRcdGlmIChrZXkgIT09ICdpZCcpIHtcblx0XHRcdFx0XHRcdFx0cGF0Y2hba2V5XSA9IGN1cnJlbnRba2V5XSA/PyBudWxsO1xuXHRcdFx0XHRcdFx0XHRoYXNDaGFuZ2VzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocHJldikpIHtcblx0XHRcdFx0XHRcdGlmIChrZXkgIT09ICdpZCcgJiYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoY3VycmVudCwga2V5KSB8fCBjdXJyZW50W2tleV0gPT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0XHRcdFx0cGF0Y2hba2V5XSA9IG51bGw7XG5cdFx0XHRcdFx0XHRcdGhhc0NoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBGaWVsZHMgdGhhdCBjaGFuZ2VkIG9yIHdlcmUgYWRkZWRcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhjdXJyZW50KSkge1xuXHRcdFx0XHRcdFx0aWYgKGtleSA9PT0gJ2lkJykgeyBjb250aW51ZTsgfVxuXHRcdFx0XHRcdFx0aWYgKHN0YWJsZVN0cmluZ2lmeShjdXJyZW50W2tleV0pICE9PSBzdGFibGVTdHJpbmdpZnkocHJldltrZXldKSkge1xuXHRcdFx0XHRcdFx0XHRwYXRjaFtrZXldID0gY3VycmVudFtrZXldO1xuXHRcdFx0XHRcdFx0XHRoYXNDaGFuZ2VzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gRmllbGRzIHRoYXQgd2VyZSByZW1vdmVkIChwcmVzZW50IGluIHByZXYsIGFic2VudCBpbiBjdXJyZW50KSBcdTIxOTIgbnVsbCBwZXIgUkZDIDczOTZcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhwcmV2KSkge1xuXHRcdFx0XHRcdFx0aWYgKGtleSA9PT0gJ2lkJykgeyBjb250aW51ZTsgfVxuXHRcdFx0XHRcdFx0aWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoY3VycmVudCwga2V5KSB8fCBjdXJyZW50W2tleV0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRwYXRjaFtrZXldID0gbnVsbDtcblx0XHRcdFx0XHRcdFx0aGFzQ2hhbmdlcyA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGBgYWdlbnRfc3RhdGVfZGV0YWlsYGAgKHRoZSBjb25maXJtYXRpb24gcHJvbXB0IHRleHQpIGFuZFxuXHRcdFx0XHQvLyBgYGxhc3RfcmVzcG9uc2Vfc3VtbWFyeWBgICh0aGUgYWdlbnQncyBmaW5hbCByZXBseSkgc3RyZWFtIGluXG5cdFx0XHRcdC8vIG9ic2VydmFibGVzIHRoYXQgbWF5IHdvYmJsZSBtdWx0aXBsZSB0aW1lcyB3aXRoaW4gYSBzaW5nbGVcblx0XHRcdFx0Ly8gc3RhYmxlIGBgYWdlbnRfc3RhdGVgYC4gV2l0aG91dCB0aGlzIGd1YXJkLCBlYWNoIHdvYmJsZSBzaGlwc1xuXHRcdFx0XHQvLyBhIGRlbHRhIGFuZCB0aGUgQkUgcmUtbmFycmF0ZXMgdGhlIHNhbWUgYXBwcm92YWwvaWRsZSBldmVudC5cblx0XHRcdFx0Ly8gVGhleSBhcmUgYWxyZWFkeSBkZWxpdmVyZWQgaW5saW5lIG9uIGBgc2Vzc2lvbl9zdGF0ZV9jaGFuZ2VgYFxuXHRcdFx0XHQvLyBmb3IgcmVhbCB0cmFuc2l0aW9ucywgc28gd2Ugb25seSBsZXQgdGhlbSByaWRlIGluIGEgY29udGV4dFxuXHRcdFx0XHQvLyBkZWx0YSB3aGVuIGBgYWdlbnRfc3RhdGVgYCBpdHNlbGYgaXMgaW4gdGhlIHNhbWUgcGF0Y2hcblx0XHRcdFx0Ly8gKGkuZS4gb24gYW4gYWN0dWFsIHN0YXRlIHRyYW5zaXRpb24pLlxuXHRcdFx0XHRpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXRjaCwgJ2FnZW50X3N0YXRlJykpIHtcblx0XHRcdFx0XHRpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhdGNoLCAnYWdlbnRfc3RhdGVfZGV0YWlsJykpIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSBwYXRjaC5hZ2VudF9zdGF0ZV9kZXRhaWw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGF0Y2gsICdsYXN0X3Jlc3BvbnNlX3N1bW1hcnknKSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHBhdGNoLmxhc3RfcmVzcG9uc2Vfc3VtbWFyeTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gUmVjb21wdXRlIHdoZXRoZXIgYW55dGhpbmcgb3RoZXIgdGhhbiBpZCByZW1haW5zXG5cdFx0XHRcdFx0aGFzQ2hhbmdlcyA9IE9iamVjdC5rZXlzKHBhdGNoKS5zb21lKGsgPT4gayAhPT0gJ2lkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGhhc0NoYW5nZXMpIHtcblx0XHRcdFx0XHR1cHNlcnRzLnB1c2gocGF0Y2gpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHVwc2VydHMubGVuZ3RoID09PSAwICYmIHJlbW92ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRyYWNraW5nIHN0YXRlXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGNvbnRleHQuc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IG9iajogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHNlc3Npb24gYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikpIHtcblx0XHRcdFx0aWYgKHYgIT09IHVuZGVmaW5lZCkgeyBvYmpba10gPSB2OyB9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0U2VudEJ5SWQuc2V0KHNlc3Npb24uaWQsIG9iaik7XG5cdFx0XHR0aGlzLl9pbnZhbGlkYXRlZFNlc3Npb25JZHMuZGVsZXRlKHNlc3Npb24uaWQpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGlkIG9mIHJlbW92ZXMpIHtcblx0XHRcdHRoaXMuX2xhc3RTZW50QnlJZC5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5faW52YWxpZGF0ZWRTZXNzaW9uSWRzLmRlbGV0ZShpZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fd3MhLnNlbmQoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0dHlwZTogJ3Nlc3Npb25fY29udGV4dCcsXG5cdFx0XHRtb2RlOiAnZGVsdGEnLFxuXHRcdFx0dXBzZXJ0cyxcblx0XHRcdHJlbW92ZXMsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gX3NlbmREZWx0YSB1cHNlcnRzPVske3Vwc2VydHMubWFwKHUgPT4gYCR7U3RyaW5nKHUuaWQpLnNsaWNlKC04KX06JHt1LmFnZW50X3N0YXRlID8/ICcobm8tc3RhdGUpJ30ke09iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh1LCAnYWdlbnRfc3RhdGVfZGV0YWlsJykgPyAnK2RldGFpbCcgOiAnJ30ke09iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh1LCAnbGFzdF9yZXNwb25zZV9zdW1tYXJ5JykgJiYgdS5sYXN0X3Jlc3BvbnNlX3N1bW1hcnkgPyAnK3N1bW1hcnknIDogJyd9YCkuam9pbignLCAnKX1dIHJlbW92ZXM9JHtyZW1vdmVzLmxlbmd0aH1gKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlZWRUcmFja2luZyhjb250ZXh0OiBJVm9pY2VTZXNzaW9uQ29udGV4dCk6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RTZW50QnlJZC5jbGVhcigpO1xuXHRcdHRoaXMuX2ludmFsaWRhdGVkU2Vzc2lvbklkcy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBjb250ZXh0LnNlc3Npb25zKSB7XG5cdFx0XHRjb25zdCBvYmo6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhzZXNzaW9uIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pKSB7XG5cdFx0XHRcdGlmICh2ICE9PSB1bmRlZmluZWQpIHsgb2JqW2tdID0gdjsgfVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGFzdFNlbnRCeUlkLnNldChzZXNzaW9uLmlkLCBvYmopO1xuXHRcdH1cblx0fVxuXG5cdHNlbmRUb29sUmVzdWx0KGNhbGxJZDogc3RyaW5nLCByZXN1bHQ6IHN0cmluZyB8IElWb2ljZURpc3BhdGNoUmVzdWx0LCBjb2RpbmdTZXNzaW9uSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0dHlwZTogJ3Rvb2xfcmVzdWx0Jyxcblx0XHRcdFx0Y2FsbF9pZDogY2FsbElkLFxuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdC4uLihjb2RpbmdTZXNzaW9uSWQgPyB7IGNvZGluZ19zZXNzaW9uX2lkOiBjb2RpbmdTZXNzaW9uSWQgfSA6IHt9KSxcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRzZW5kTmFycmF0aW9uUGxheWJhY2tDb21wbGV0ZShjb2RpbmdTZXNzaW9uSWQ6IHN0cmluZywgbmFycmF0aW9uSWQ6IHN0cmluZywgcGxheWJhY2tJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTiAmJiB0aGlzLl9zZXNzaW9uU3RhcnRlZE9uU29ja2V0KSB7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0dHlwZTogJ25hcnJhdGlvbl9wbGF5YmFja19jb21wbGV0ZScsXG5cdFx0XHRcdGNvZGluZ19zZXNzaW9uX2lkOiBjb2RpbmdTZXNzaW9uSWQsXG5cdFx0XHRcdG5hcnJhdGlvbl9pZDogbmFycmF0aW9uSWQsXG5cdFx0XHRcdHBsYXliYWNrX2lkOiBwbGF5YmFja0lkLFxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHJlcXVlc3ROYXJyYXRpb24oY29kaW5nU2Vzc2lvbklkOiBzdHJpbmcsIGtpbmQ6IFZvaWNlTmFycmF0aW9uS2luZCwgdGV4dDogc3RyaW5nLCBuYXJyYXRpb25JZD86IHN0cmluZywgY2hlY2twb2ludD86IElWb2ljZUNoZWNrcG9pbnROYXJyYXRpb25NZXRhZGF0YSwgY29uZmlybWF0aW9uVHlwZT86IFZvaWNlQ29uZmlybWF0aW9uVHlwZSwgcGVuZGluZz86IHsgcGVuZGluZ0lkOiBzdHJpbmcgfSwgcHJlcGFyZVRvUmVjZWl2ZUF1ZGlvPzogKCkgPT4gdm9pZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gR2F0ZSBvbiBzZXNzaW9uX2NvbnRleHQgaGF2aW5nIGJlZW4gc2VudDogdGhlIFdTIHByZXNlcnZlcyBzZW5kIG9yZGVyLFxuXHRcdC8vIHNvIHRoZSBiYWNrZW5kIHByb2Nlc3NlcyBzdGFydF9zZXNzaW9uL3Jlc3VtZV9zZXNzaW9uIGJlZm9yZSBhbnlcblx0XHQvLyByZXF1ZXN0X25hcnJhdGlvbi4gUHJlLXNlc3Npb24gdGhpcyByZXR1cm5zIHVuZGVmaW5lZCwgc28gX25hcnJhdGUgcXVldWVzXG5cdFx0Ly8gYSByZXRyeSB0aGF0IG9uU2Vzc2lvbkluaXQgcmVwbGF5cyBvbmNlIHRoZSBzZXNzaW9uIGV4aXN0cy5cblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOICYmIHRoaXMuX3Nlc3Npb25TdGFydGVkT25Tb2NrZXQpIHtcblx0XHRcdHByZXBhcmVUb1JlY2VpdmVBdWRpbz8uKCk7XG5cdFx0XHQvLyBSZXVzZSBhIGNhbGxlci1zdXBwbGllZCBpZCAoYSBgYnVzeWAgcmV0cnkpIHNvIHRoZSBiYWNrZW5kIGRlZHVwczsgZWxzZSBtaW50IG9uZS5cblx0XHRcdGNvbnN0IGlkID0gbmFycmF0aW9uSWQgPz8gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0dHlwZTogJ3JlcXVlc3RfbmFycmF0aW9uJyxcblx0XHRcdFx0Y29kaW5nX3Nlc3Npb25faWQ6IGNvZGluZ1Nlc3Npb25JZCxcblx0XHRcdFx0a2luZCxcblx0XHRcdFx0dGV4dCxcblx0XHRcdFx0bmFycmF0aW9uX2lkOiBpZCxcblx0XHRcdFx0Li4uKGNoZWNrcG9pbnQgPyB7XG5cdFx0XHRcdFx0cmVxdWVzdF9pZDogY2hlY2twb2ludC5yZXF1ZXN0SWQsXG5cdFx0XHRcdFx0Y2hlY2twb2ludF9pZDogY2hlY2twb2ludC5jaGVja3BvaW50SWQsXG5cdFx0XHRcdFx0c2VxdWVuY2U6IGNoZWNrcG9pbnQuc2VxdWVuY2UsXG5cdFx0XHRcdH0gOiB7fSksXG5cdFx0XHRcdC4uLihraW5kID09PSAnY29uZmlybWF0aW9uJyAmJiBjb25maXJtYXRpb25UeXBlID8geyBjb25maXJtYXRpb25fdHlwZTogY29uZmlybWF0aW9uVHlwZSB9IDoge30pLFxuXHRcdFx0XHQuLi4ocGVuZGluZyA/IHsgcGVuZGluZ19pZDogcGVuZGluZy5wZW5kaW5nSWQgfSA6IHt9KSxcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gcmVxdWVzdF9uYXJyYXRpb24ga2luZD0ke2tpbmR9IGlkPSR7Y29kaW5nU2Vzc2lvbklkLnNsaWNlKC0zMil9IG5hcnJhdGlvbl9pZD0ke2lkLnNsaWNlKDAsIDgpfSR7bmFycmF0aW9uSWQgPyAnIChyZXRyeSknIDogJyd9YCk7XG5cdFx0XHRpZiAoY2hlY2twb2ludCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFt2b2ljZV0gY2hlY2twb2ludCBzZW50IHJlcXVlc3Q9JHtjaGVja3BvaW50LnJlcXVlc3RJZH0gc3RhZ2U9JHtjaGVja3BvaW50LmNoZWNrcG9pbnRJZH0gc2VxdWVuY2U9JHtjaGVja3BvaW50LnNlcXVlbmNlfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGlkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c2VuZFNlc3Npb25TdGF0ZUNoYW5nZShzZXNzaW9uSWQ6IHN0cmluZywgbmV3U3RhdGU6IHN0cmluZywgX2xhYmVsOiBzdHJpbmcsIGRldGFpbD86IHN0cmluZywgbGFzdFJlc3BvbnNlU3VtbWFyeT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93cz8ucmVhZHlTdGF0ZSA9PT0gV2ViU29ja2V0Lk9QRU4pIHtcblx0XHRcdGNvbnN0IHBheWxvYWQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0geyB0eXBlOiAnc2Vzc2lvbl9zdGF0ZV9jaGFuZ2UnLCBzZXNzaW9uX2lkOiBzZXNzaW9uSWQsIG5ld19zdGF0ZTogbmV3U3RhdGUgfTtcblx0XHRcdGlmIChkZXRhaWwpIHsgcGF5bG9hZC5kZXRhaWwgPSBkZXRhaWw7IH1cblx0XHRcdGlmIChsYXN0UmVzcG9uc2VTdW1tYXJ5KSB7IHBheWxvYWQubGFzdF9yZXNwb25zZV9zdW1tYXJ5ID0gbGFzdFJlc3BvbnNlU3VtbWFyeTsgfVxuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeShwYXlsb2FkKSk7XG5cdFx0fVxuXHR9XG5cblx0c3RvcFNwZWFraW5nKCk6IHZvaWQge1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgdGhlIHN0YXJ0X3Nlc3Npb24gbWVzc2FnZSB3aXRoIHRoZSBnaXZlbiBjb250ZXh0LlxuXHQgKiBDYWxsZWQgYnkgdGhlIGNvbnN1bWVyIGFmdGVyIGNvbm5lY3QoKSByZXNvbHZlcyBhbmQgQXVkaW9Db250ZXh0IGlzIHJlYWR5LlxuXHQgKlxuXHQgKiBgYHByaW9yVGltZWxpbmVgYCBjYXJyaWVzIGFuIG9yZGVyZWQgc2xpY2Ugb2YgY3Jvc3Mtc2Vzc2lvbiBlbnRyaWVzXG5cdCAqICh2b2ljZSB0dXJucywgdm9pY2UgdG9vbCBjYWxscywgY29kaW5nLXNlc3Npb24gZXZlbnRzLCBhbmQgYSBzeW50aGVzaXplZFxuXHQgKiBjb2RpbmctYWdlbnQtcmVwbHkgc3VtbWFyeSBwZXIgYWN0aXZlIHNlc3Npb24pIGZyb20gdGhlIHByZXZpb3VzIHZvaWNlXG5cdCAqIHNlc3Npb24uIFRoZSBCRSBjb25zdW1lcyBpdCBvbmNlIG9uIHRoZSBmaXJzdCBjb21tYW5kIHR1cm4gc28gdGhlIG1vZGVsXG5cdCAqIGNhbiBhbnN3ZXIgcmVjYWxsIHF1ZXN0aW9ucyBhY3Jvc3MgcmVjb25uZWN0cyB3aXRob3V0IGJhY2tlbmRcblx0ICogcGVyc2lzdGVuY2UuIFNlZSBgYElWb2ljZVByaW9yVGltZWxpbmVFbnRyeWBgLlxuXHQgKi9cblx0c2VuZFN0YXJ0U2Vzc2lvbihjb250ZXh0OiBJVm9pY2VTZXNzaW9uQ29udGV4dCwgbWFjaGluZUlkOiBzdHJpbmcsIHByaW9yVGltZWxpbmU/OiByZWFkb25seSBJVm9pY2VQcmlvclRpbWVsaW5lRW50cnlbXSwgdHVybkNvbmZpZ092ZXJyaWRlPzogSVZvaWNlVHVybkNvbmZpZywgdm9pY2VJbnN0cnVjdGlvbnM/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd3M/LnJlYWR5U3RhdGUgPT09IFdlYlNvY2tldC5PUEVOKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ29udGV4dCA9IHsgLi4uY29udGV4dCwgZGlzcGxheV9sb2NhbGU6IHRoaXMuX2dldExhbmd1YWdlKCkgfTtcblx0XHRcdHRoaXMuX3NlZWRUcmFja2luZyhzZXNzaW9uQ29udGV4dCk7XG5cdFx0XHQvLyBUaGlzIGNsaWVudCBkcml2ZXMgbmFycmF0aW9uIGl0c2VsZiB2aWEgYHJlcXVlc3ROYXJyYXRpb25gLCBzbyBvcHQgb3V0XG5cdFx0XHQvLyBvZiB0aGUgYmFja2VuZCdzIGRlZmF1bHQgY29udGV4dC1kZWx0YSBhdXRvLW5hcnJhdGlvbiB0byBhdm9pZCBkb3VibGUgbmFycmF0aW9uLlxuXHRcdFx0Y29uc3QgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IHR5cGU6ICdzdGFydF9zZXNzaW9uJywgc2Vzc2lvbl9jb250ZXh0OiBzZXNzaW9uQ29udGV4dCwgbWFjaGluZV9pZDogbWFjaGluZUlkLCB0dXJuX2NvbmZpZzogdHVybkNvbmZpZ092ZXJyaWRlID8/IHRoaXMuX2dldFR1cm5Db25maWcoKSwgdm9pY2U6IHRoaXMuX2dldFZvaWNlKCksIGF1dG9fbmFycmF0ZTogZmFsc2UgfTtcblx0XHRcdGlmIChwcmlvclRpbWVsaW5lICYmIHByaW9yVGltZWxpbmUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRwYXlsb2FkLnByaW9yX3RpbWVsaW5lID0gcHJpb3JUaW1lbGluZTtcblx0XHRcdH1cblx0XHRcdGlmICh2b2ljZUluc3RydWN0aW9ucykge1xuXHRcdFx0XHRwYXlsb2FkLnZvaWNlX2luc3RydWN0aW9ucyA9IHZvaWNlSW5zdHJ1Y3Rpb25zO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fd3Muc2VuZChKU09OLnN0cmluZ2lmeShwYXlsb2FkKSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RhcnRlZE9uU29ja2V0ID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRzZW5kUmVzdW1lU2Vzc2lvbihjb250ZXh0OiBJVm9pY2VTZXNzaW9uQ29udGV4dCwgbWFjaGluZUlkOiBzdHJpbmcsIHZvaWNlSW5zdHJ1Y3Rpb25zPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dzPy5yZWFkeVN0YXRlID09PSBXZWJTb2NrZXQuT1BFTiAmJiB0aGlzLl9sYXN0U2Vzc2lvbklkKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uQ29udGV4dCA9IHsgLi4uY29udGV4dCwgZGlzcGxheV9sb2NhbGU6IHRoaXMuX2dldExhbmd1YWdlKCkgfTtcblx0XHRcdHRoaXMuX3NlZWRUcmFja2luZyhzZXNzaW9uQ29udGV4dCk7XG5cdFx0XHQvLyBgYXV0b19uYXJyYXRlOiBmYWxzZWAgZm9yIHRoZSBzYW1lIHJlYXNvbiBhcyBzdGFydF9zZXNzaW9uOiB0aGlzIGNsaWVudFxuXHRcdFx0Ly8gZHJpdmVzIG5hcnJhdGlvbiwgc28gdGhlIGJhY2tlbmQgbXVzdCBub3QgYWxzbyBhdXRvLW5hcnJhdGUuXG5cdFx0XHRjb25zdCBwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgdHlwZTogJ3Jlc3VtZV9zZXNzaW9uJywgc2Vzc2lvbl9pZDogdGhpcy5fbGFzdFNlc3Npb25JZCwgc2Vzc2lvbl9jb250ZXh0OiBzZXNzaW9uQ29udGV4dCwgbWFjaGluZV9pZDogbWFjaGluZUlkLCB0dXJuX2NvbmZpZzogdGhpcy5fZ2V0VHVybkNvbmZpZygpLCB2b2ljZTogdGhpcy5fZ2V0Vm9pY2UoKSwgYXV0b19uYXJyYXRlOiBmYWxzZSB9O1xuXHRcdFx0aWYgKHZvaWNlSW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRcdHBheWxvYWQudm9pY2VfaW5zdHJ1Y3Rpb25zID0gdm9pY2VJbnN0cnVjdGlvbnM7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93cy5zZW5kKEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdGFydGVkT25Tb2NrZXQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN1Ym1pdEZlZWRiYWNrKHBheWxvYWQ6IElWb2ljZUZlZWRiYWNrUGF5bG9hZCk6IFByb21pc2U8eyBvazogYm9vbGVhbjsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IGh0dHBVcmwgPSB0aGlzLl9nZXRXc1VybCgpXG5cdFx0XHQucmVwbGFjZSgnd3NzOi8vJywgJ2h0dHBzOi8vJylcblx0XHRcdC5yZXBsYWNlKCd3czovLycsICdodHRwOi8vJylcblx0XHRcdC5yZXBsYWNlKC9cXC9yZWFsdGltZVxcL3ZvaWNlJC8sICcvZmVlZGJhY2snKTtcblx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH07XG5cdFx0aWYgKHRoaXMuX2F1dGhUb2tlbikge1xuXHRcdFx0aGVhZGVyc1snQXV0aG9yaXphdGlvbiddID0gYEJlYXJlciAke3RoaXMuX2F1dGhUb2tlbn1gO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChodHRwVXJsLCB7XG5cdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0ZmVlZGJhY2tfdGV4dDogcGF5bG9hZC5mZWVkYmFja1RleHQsXG5cdFx0XHRcdFx0bWFjaGluZV9pZDogcGF5bG9hZC5tYWNoaW5lSWQsXG5cdFx0XHRcdFx0dXNlcl9pZDogcGF5bG9hZC51c2VySWQsXG5cdFx0XHRcdFx0c2Vzc2lvbl9pZDogcGF5bG9hZC5zZXNzaW9uSWQsXG5cdFx0XHRcdFx0c3VibWlzc2lvbl9pZDogcGF5bG9hZC5zdWJtaXNzaW9uSWQsXG5cdFx0XHRcdFx0dHJhbnNjcmlwdF9oaXN0b3J5OiBwYXlsb2FkLnRyYW5zY3JpcHRIaXN0b3J5Lm1hcCh0ID0+ICh7XG5cdFx0XHRcdFx0XHRyb2xlOiB0LnJvbGUsXG5cdFx0XHRcdFx0XHR0ZXh0OiB0LnRleHQsXG5cdFx0XHRcdFx0XHR0aW1lc3RhbXA6IHQudGltZXN0YW1wLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHRjbGllbnRfc2Vzc2lvbl9zdGF0ZTogcGF5bG9hZC5jbGllbnRTZXNzaW9uU3RhdGUsXG5cdFx0XHRcdFx0Y2xpZW50X2Vudmlyb25tZW50OiBwYXlsb2FkLmNsaWVudEVudmlyb25tZW50LFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogcGF5bG9hZC50aW1lc3RhbXAsXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cdFx0XHRcdHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHt0ZXh0fWAgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IG9rOiB0cnVlIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyKSB9O1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNjb25uZWN0KCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHN0YWJsZVN0cmluZ2lmeSh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XG5cdGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcblx0fVxuXHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gJ1snICsgdmFsdWUubWFwKHN0YWJsZVN0cmluZ2lmeSkuam9pbignLCcpICsgJ10nO1xuXHR9XG5cdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuc29ydCgpO1xuXHRyZXR1cm4gJ3snICsga2V5cy5tYXAoayA9PiBKU09OLnN0cmluZ2lmeShrKSArICc6JyArIHN0YWJsZVN0cmluZ2lmeSgodmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tdKSkuam9pbignLCcpICsgJ30nO1xufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJVm9pY2VDbGllbnRTZXJ2aWNlLCBWb2ljZUNsaWVudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDO0FBQUEsRUFDQztBQUFBLEVBcUJBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxTQUFTLHFCQUFxQiwwQkFBMEI7QUFDeEQsU0FBUyxtQkFBbUIseUJBQXlCO0FBRXJELE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sa0JBQWtCO0FBQ3hCLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0sc0JBQXNCO0FBRzVCLE1BQU0sNEJBQTRCO0FBQ2xDLE1BQU0sK0JBQStCLG9CQUFJLElBQUk7QUFBQSxFQUM1QztBQUFBLEVB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
