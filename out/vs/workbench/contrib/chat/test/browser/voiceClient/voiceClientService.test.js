import assert from "assert";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import product from "../../../../../../platform/product/common/product.js";
import { resolveAutomaticVoiceLanguage, VoiceClientService } from "../../../browser/voiceClient/voiceClientService.js";
import { normalizeAgentsVoiceId } from "../../../common/voiceClient/voiceClientService.js";
class TestWebSocket {
  constructor() {
    this.readyState = WebSocket.OPEN;
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    TestWebSocket.instance = this;
  }
  close() {
    this.readyState = WebSocket.CLOSED;
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
}
function createTestWindow(language = "en-US") {
  return new Proxy(mainWindow, {
    get(target, property, receiver) {
      if (property === "WebSocket") {
        return TestWebSocket;
      }
      if (property === "setInterval" || property === "clearInterval") {
        return target[property].bind(target);
      }
      if (property === "navigator") {
        return new Proxy(target.navigator, {
          get(navigatorTarget, navigatorProperty, navigatorReceiver) {
            if (navigatorProperty === "language") {
              return language;
            }
            return Reflect.get(navigatorTarget, navigatorProperty, navigatorReceiver);
          }
        });
      }
      return Reflect.get(target, property, receiver);
    }
  });
}
suite("VoiceClientService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const productService = {
    _serviceBrand: void 0,
    ...product,
    voiceWsUrl: "ws://voice.test/realtime/voice"
  };
  setup(() => {
    TestWebSocket.instance = void 0;
  });
  function createService(configuration = {}) {
    const configurationService = new TestConfigurationService(configuration);
    const service = store.add(new VoiceClientService(
      configurationService,
      new NullLogService(),
      productService
    ));
    return { service, configurationService };
  }
  function socket() {
    if (!TestWebSocket.instance) {
      throw new Error("Voice WebSocket was not created");
    }
    return TestWebSocket.instance;
  }
  function fireConfigurationChange(configurationService, key) {
    configurationService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([key]),
      change: { keys: [key], overrides: [] },
      affectsConfiguration: (candidate) => candidate === key
    });
  }
  test("emits barge-in events from the backend", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onBargeIn((event) => events.push(event)));
    await service.connect(createTestWindow());
    const webSocket = socket();
    if (!webSocket.onmessage) {
      throw new Error("Voice WebSocket was not created");
    }
    webSocket.onmessage(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "barge_in",
        turn_id: "interrupting-turn",
        interrupted_turn_id: "cancelled-turn"
      })
    }));
    assert.deepStrictEqual(events, [{
      turnId: "interrupting-turn",
      interruptedTurnId: "cancelled-turn"
    }]);
  });
  test("preserves the turn ID on speech-started events", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onSpeechStarted((event) => events.push(event)));
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "speech_started",
        turn_id: "passive-turn"
      })
    }));
    assert.deepStrictEqual(events, [{ turnId: "passive-turn" }]);
  });
  test("preserves checkpoint interruption metadata from the backend", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onNarrationInterrupted((event) => events.push(event)));
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "narration_interrupted",
        narration_id: "checkpoint-narration",
        coding_session_id: "chat-session:/one",
        retryable: false,
        reason: "superseded_by_response"
      })
    }));
    assert.deepStrictEqual(events, [{
      narrationId: "checkpoint-narration",
      codingSessionId: "chat-session:/one",
      retryable: false,
      reason: "superseded_by_response"
    }]);
  });
  test("preserves the backend turn ID when audio has a narration ID", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onAudioResponse((event) => events.push(event)));
    await service.connect(createTestWindow());
    const webSocket = socket();
    if (!webSocket.onmessage) {
      throw new Error("Voice WebSocket was not created");
    }
    webSocket.onmessage(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "audio_response",
        audio: "audio",
        is_first_chunk: true,
        is_final: false,
        turn_id: "backend-turn",
        narration_id: "client-narration",
        request_id: "request-1",
        checkpoint_id: "planning",
        sequence: 1,
        narration_kind: "checkpoint",
        playback_id: "playback-1"
      })
    }));
    assert.deepStrictEqual(events, [{
      audio: "audio",
      isFirstChunk: true,
      isFinal: false,
      codingSessionId: void 0,
      transcript: void 0,
      turnId: "backend-turn",
      responseId: "client-narration",
      requestId: "request-1",
      checkpointId: "planning",
      sequence: 1,
      narrationKind: "checkpoint",
      playbackId: "playback-1"
    }]);
  });
  test("validates and translates scoped transcription metadata", async () => {
    const productService2 = {
      _serviceBrand: void 0,
      ...product,
      voiceWsUrl: "ws://voice.test/realtime/voice"
    };
    const service = store.add(new VoiceClientService(
      new TestConfigurationService(),
      new NullLogService(),
      productService2
    ));
    const events = [];
    store.add(service.onTranscription((event) => events.push(event)));
    await service.connect(createTestWindow());
    const socket2 = TestWebSocket.instance;
    if (!socket2?.onmessage) {
      throw new Error("Voice WebSocket was not created");
    }
    socket2.onmessage(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "transcription",
        text: "create a file",
        status: "partial",
        committed: "create ",
        turn_id: "turn-1",
        revision: 3
      })
    }));
    assert.deepStrictEqual(events, [{
      text: "create a file",
      status: "partial",
      committed: "create ",
      turnId: "turn-1",
      revision: 3
    }]);
  });
  test("rejects invalid transcription status and revision", async () => {
    const productService2 = {
      _serviceBrand: void 0,
      ...product,
      voiceWsUrl: "ws://voice.test/realtime/voice"
    };
    const service = store.add(new VoiceClientService(
      new TestConfigurationService(),
      new NullLogService(),
      productService2
    ));
    const events = [];
    store.add(service.onTranscription((event) => events.push(event)));
    await service.connect(createTestWindow());
    const socket2 = TestWebSocket.instance;
    if (!socket2?.onmessage) {
      throw new Error("Voice WebSocket was not created");
    }
    for (const message of [
      { type: "transcription", text: "invalid status", status: "pending" },
      { type: "transcription", text: "unscoped revision", status: "partial", revision: 1 },
      { type: "transcription", text: "invalid revision", status: "partial", turn_id: "turn-1", revision: 1.5 },
      { type: "transcription", text: "negative revision", status: "partial", turn_id: "turn-1", revision: -1 },
      { type: "transcription", text: "legacy final" }
    ]) {
      socket2.onmessage(new mainWindow.MessageEvent("message", { data: JSON.stringify(message) }));
    }
    assert.deepStrictEqual(events, [{
      text: "legacy final",
      status: "final",
      committed: "",
      turnId: void 0,
      revision: void 0
    }]);
  });
  test("sends microphone audio using the PTT protocol", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendPttStart("turn-1");
    service.sendPttAudioChunk("cGNt");
    service.sendPttEnd();
    assert.deepStrictEqual(socket().sent, [
      { type: "ptt_start", turn_id: "turn-1" },
      { type: "ptt_audio_chunk", audio: "cGNt" },
      { type: "ptt_end" }
    ]);
  });
  test("sends first-class checkpoint narration metadata", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const narrationId = service.requestNarration("chat-session:/one", "checkpoint", "Updating the code.", void 0, {
      requestId: "request-1",
      checkpointId: "editing",
      sequence: 2
    });
    service.sendNarrationPlaybackComplete("chat-session:/one", narrationId, "playback-1");
    assert.deepStrictEqual(socket().sent.slice(1), [
      {
        type: "request_narration",
        coding_session_id: "chat-session:/one",
        kind: "checkpoint",
        text: "Updating the code.",
        narration_id: narrationId,
        request_id: "request-1",
        checkpoint_id: "editing",
        sequence: 2
      },
      {
        type: "narration_playback_complete",
        coding_session_id: "chat-session:/one",
        narration_id: narrationId,
        playback_id: "playback-1"
      }
    ]);
  });
  test("sends typed confirmation narration metadata", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const narrationId = service.requestNarration(
      "chat-session:/one",
      "confirmation",
      "questionnaire: 1 question",
      void 0,
      void 0,
      "questionnaire"
    );
    assert.deepStrictEqual(socket().sent[1], {
      type: "request_narration",
      coding_session_id: "chat-session:/one",
      kind: "confirmation",
      text: "questionnaire: 1 question",
      narration_id: narrationId,
      confirmation_type: "questionnaire"
    });
  });
  test("persists and clears typed confirmation session state", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onopen?.();
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    service.sendSessionContext({
      sessions: [{
        id: "chat-session:/one",
        is_active: true,
        agent_state: "waiting_for_confirmation",
        agent_state_detail: "questionnaire: 1 question",
        confirmation_type: "questionnaire"
      }],
      display_locale: "en-US"
    });
    service.flushSessionContext();
    service.sendSessionContext({
      sessions: [{
        id: "chat-session:/one",
        is_active: true,
        agent_state: "idle"
      }],
      display_locale: "en-US"
    });
    service.flushSessionContext();
    assert.deepStrictEqual(socket().sent.slice(1), [
      {
        type: "session_context",
        mode: "delta",
        upserts: [{
          id: "chat-session:/one",
          is_active: true,
          agent_state: "waiting_for_confirmation",
          agent_state_detail: "questionnaire: 1 question",
          confirmation_type: "questionnaire"
        }],
        removes: []
      },
      {
        type: "session_context",
        mode: "delta",
        upserts: [{
          id: "chat-session:/one",
          agent_state: "idle",
          agent_state_detail: null,
          confirmation_type: null
        }],
        removes: []
      }
    ]);
  });
  test("invalidated context preserves pending deletion tombstones", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onopen?.();
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const sessionId = "chat-session:/one";
    service.sendSessionContext({
      sessions: [{
        id: sessionId,
        is_active: true,
        agent_state: "waiting_for_confirmation",
        agent_state_detail: "Which region?",
        confirmation_type: "questionnaire",
        pending: {
          type: "questions",
          pending_id: "request-1#p1",
          request_id: "request-1",
          questions: []
        }
      }],
      display_locale: "en-US"
    });
    service.flushSessionContext();
    service.invalidateSessionCache(sessionId);
    service.sendSessionContext({
      sessions: [{
        id: sessionId,
        is_active: true,
        agent_state: "waiting_for_confirmation",
        agent_state_detail: "Which region?",
        confirmation_type: "questionnaire"
      }],
      display_locale: "en-US"
    });
    service.flushSessionContext();
    assert.deepStrictEqual(socket().sent.at(-1), {
      type: "session_context",
      mode: "delta",
      upserts: [{
        id: sessionId,
        is_active: true,
        agent_state: "waiting_for_confirmation",
        agent_state_detail: "Which region?",
        confirmation_type: "questionnaire",
        pending: null
      }],
      removes: []
    });
  });
  test("normalizes legacy suppressed narration acknowledgements", async () => {
    const { service } = createService();
    const events = [];
    store.add(service.onNarrationAck((event) => events.push(event)));
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({
        type: "narration_ack",
        narration_id: "narration-1",
        coding_session_id: "chat-session:/one",
        disposition: "suppressed",
        reason: "stale"
      })
    }));
    assert.deepStrictEqual(events, [{
      narrationId: "narration-1",
      codingSessionId: "chat-session:/one",
      disposition: "suppressed",
      reason: "stale"
    }]);
  });
  test("flags a passive ptt_start for hands-free barge-in listens", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendPttStart("turn-passive", true);
    service.sendPttStart("turn-real", false);
    service.sendPttStart("turn-default");
    assert.deepStrictEqual(socket().sent, [
      { type: "ptt_start", turn_id: "turn-passive", passive: true },
      { type: "ptt_start", turn_id: "turn-real" },
      { type: "ptt_start", turn_id: "turn-default" }
    ]);
  });
  test("serializes the pending id on a question narration", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const questionId = service.requestNarration("cs1", "question", "Which region?", void 0, void 0, void 0, { pendingId: "p1" });
    const replyId = service.requestNarration("cs1", "response", "Done.");
    assert.deepStrictEqual(socket().sent.filter((message) => message.type === "request_narration"), [
      { type: "request_narration", coding_session_id: "cs1", kind: "question", text: "Which region?", narration_id: questionId, pending_id: "p1" },
      { type: "request_narration", coding_session_id: "cs1", kind: "response", text: "Done.", narration_id: replyId }
    ]);
  });
  test("prepares for narration audio before sending the request", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const sentBeforeNarration = socket().sent.length;
    let sentWhenPrepared = -1;
    const narrationId = service.requestNarration("cs1", "response", "Done.", void 0, void 0, void 0, void 0, () => {
      sentWhenPrepared = socket().sent.length;
      return true;
    });
    assert.deepStrictEqual({
      sentBeforeNarration,
      sentWhenPrepared,
      sentAfterNarration: socket().sent.length,
      narrationId: typeof narrationId
    }, {
      sentBeforeNarration: 1,
      sentWhenPrepared: 1,
      sentAfterNarration: 2,
      narrationId: "string"
    });
  });
  test("links a tool result to its resolved coding session", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendToolResult("call-1", "ok", "copilotcli:/session-1");
    assert.deepStrictEqual(socket().sent.at(-1), {
      type: "tool_result",
      call_id: "call-1",
      result: "ok",
      coding_session_id: "copilotcli:/session-1"
    });
  });
  test("drops a narration requested before the session starts", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    const narrationId = service.requestNarration("cs1", "question", "Which region?", void 0, void 0, void 0, { pendingId: "p1" });
    assert.strictEqual(narrationId, void 0);
    assert.deepStrictEqual(socket().sent.filter((message) => message.type === "request_narration"), []);
  });
  test("normalizes a legacy voice identifier in start_session", async () => {
    const { service } = createService({
      "agents.voice.language": "fr-fr",
      "agents.voice.voice": "kevin_neutral"
    });
    await service.connect(createTestWindow("de-DE"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent.map((message) => ({
      type: message.type,
      session_context: message.session_context,
      voice: message.voice,
      auto_narrate: message.auto_narrate
    })), [{
      type: "start_session",
      session_context: { sessions: [], display_locale: "fr-FR" },
      voice: "oak_neutral",
      auto_narrate: false
    }]);
  });
  test("normalizes every canonical and legacy voice identifier, and falls back for invalid values", () => {
    assert.deepStrictEqual(
      [
        "harper_neutral",
        "birch_neutral",
        "junho_neutral",
        "oak_neutral",
        "victoria_neutral",
        "maya_neutral",
        "daniel_neutral",
        "kevin_neutral",
        void 0,
        "  ",
        42,
        "unknown_voice"
      ].map(normalizeAgentsVoiceId),
      [
        "harper_neutral",
        "birch_neutral",
        "junho_neutral",
        "oak_neutral",
        "harper_neutral",
        "birch_neutral",
        "junho_neutral",
        "oak_neutral",
        "birch_neutral",
        "birch_neutral",
        "birch_neutral",
        "birch_neutral"
      ]
    );
  });
  test("uses Birch for missing and legacy Maya values in start_session", async () => {
    const voices = [];
    for (const configuration of [void 0, { "agents.voice.voice": "maya_neutral" }]) {
      const { service } = createService(configuration);
      await service.connect(createTestWindow());
      service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
      voices.push(socket().sent[0].voice);
      service.disconnect();
    }
    assert.deepStrictEqual(voices, ["birch_neutral", "birch_neutral"]);
  });
  test("sends voice instructions when starting a session", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine", void 0, void 0, 'Pronounce "Contoso DB" as written.');
    assert.deepStrictEqual(socket().sent.map((message) => ({
      type: message.type,
      voice_instructions: message.voice_instructions
    })), [{
      type: "start_session",
      voice_instructions: 'Pronounce "Contoso DB" as written.'
    }]);
  });
  test("uses the display language for auto", async () => {
    const first = createService({ "agents.voice.language": "auto" });
    await first.service.connect(createTestWindow("pt-BR"));
    first.service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const withBrowserLocale = socket().sent[0].session_context;
    const second = createService({ "agents.voice.language": "auto" });
    await second.service.connect(createTestWindow(""));
    second.service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    const withoutBrowserLocale = socket().sent[0].session_context;
    assert.deepStrictEqual({ withBrowserLocale, withoutBrowserLocale }, {
      withBrowserLocale: { sessions: [], display_locale: "en" },
      withoutBrowserLocale: { sessions: [], display_locale: "en" }
    });
  });
  test("resolves automatic language from display language before browser locale", () => {
    assert.deepStrictEqual({
      displayLanguage: resolveAutomaticVoiceLanguage("en-US", "de"),
      englishDisplayLanguage: resolveAutomaticVoiceLanguage("de-DE", "en"),
      browserLocale: resolveAutomaticVoiceLanguage("pt-BR", void 0),
      unsupportedDisplayLanguage: resolveAutomaticVoiceLanguage("pt-BR", "he-IL"),
      missing: resolveAutomaticVoiceLanguage(void 0, void 0)
    }, {
      displayLanguage: "de",
      englishDisplayLanguage: "en",
      browserLocale: "pt-BR",
      unsupportedDisplayLanguage: "pt-BR",
      missing: "en-US"
    });
  });
  test("falls back for an unsupported configured BCP-47 locale", async () => {
    const { service } = createService({ "agents.voice.language": "uk-UA" });
    await service.connect(createTestWindow("fr-FR"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent[0].session_context, {
      sessions: [],
      display_locale: "en-US"
    });
  });
  test("falls back for a configured ASR-only language", async () => {
    const { service } = createService({ "agents.voice.language": "ar" });
    await service.connect(createTestWindow("ar-SA"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent[0].session_context, {
      sessions: [],
      display_locale: "en-US"
    });
  });
  test("prefers the display language over an ASR-only browser locale", async () => {
    const { service } = createService({ "agents.voice.language": "auto" });
    await service.connect(createTestWindow("ar-SA"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent[0].session_context, {
      sessions: [],
      display_locale: "en"
    });
  });
  test("prefers the display language over an unsupported browser locale", async () => {
    const { service } = createService({ "agents.voice.language": "auto" });
    await service.connect(createTestWindow("he-IL"));
    service.sendStartSession({ sessions: [], display_locale: "" }, "machine");
    assert.deepStrictEqual(socket().sent[0].session_context, {
      sessions: [],
      display_locale: "en"
    });
  });
  test("sends one live language update without changing voice", async () => {
    const { service, configurationService } = createService({
      "agents.voice.language": "auto",
      "agents.voice.voice": "victoria_neutral"
    });
    await service.connect(createTestWindow("en-GB"));
    service.sendStartSession({ sessions: [], display_locale: "en-GB" }, "machine");
    await configurationService.setUserConfiguration("agents.voice.language", "fr-FR");
    fireConfigurationChange(configurationService, "agents.voice.language");
    assert.deepStrictEqual(socket().sent.map((message) => message.type === "start_session" ? {
      type: message.type,
      session_context: message.session_context,
      voice: message.voice
    } : message), [
      {
        type: "start_session",
        session_context: { sessions: [], display_locale: "en" },
        voice: "harper_neutral"
      },
      { type: "set_language", language: "fr-FR" }
    ]);
  });
  test("defers a language update until the session starts", async () => {
    const { service, configurationService } = createService({ "agents.voice.language": "auto" });
    await service.connect(createTestWindow("en-US"));
    await configurationService.setUserConfiguration("agents.voice.language", "fr");
    fireConfigurationChange(configurationService, "agents.voice.language");
    service.sendStartSession({ sessions: [], display_locale: "en-US" }, "machine");
    assert.deepStrictEqual(socket().sent.map((message) => ({
      type: message.type,
      session_context: message.session_context
    })), [{
      type: "start_session",
      session_context: { sessions: [], display_locale: "fr" }
    }]);
  });
  test("does not update while disconnected and retains language on resume", async () => {
    const { service, configurationService } = createService({
      "agents.voice.language": "auto",
      "agents.voice.voice": "daniel_neutral"
    });
    await service.connect(createTestWindow("en-US"));
    const firstSocket = socket();
    firstSocket.onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-1" })
    }));
    firstSocket.readyState = WebSocket.CLOSED;
    await configurationService.setUserConfiguration("agents.voice.language", "de-DE");
    fireConfigurationChange(configurationService, "agents.voice.language");
    await service.connect(createTestWindow("en-US"));
    service.sendResumeSession({ sessions: [], display_locale: "en-US" }, "machine", "Keep replies concise.");
    assert.deepStrictEqual({
      disconnectedMessages: firstSocket.sent,
      resumeMessages: socket().sent.map((message) => ({
        type: message.type,
        session_id: message.session_id,
        session_context: message.session_context,
        voice: message.voice,
        voice_instructions: message.voice_instructions,
        auto_narrate: message.auto_narrate
      }))
    }, {
      disconnectedMessages: [],
      resumeMessages: [{
        type: "resume_session",
        session_id: "session-1",
        session_context: { sessions: [], display_locale: "de-DE" },
        voice: "junho_neutral",
        voice_instructions: "Keep replies concise.",
        auto_narrate: false
      }]
    });
  });
  test("adopts the server session id and clears isResuming on session_init, even after a failed resume", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-1" })
    }));
    assert.strictEqual(service.currentSessionId, "session-1");
    assert.strictEqual(service.isResuming, false);
    socket().onopen?.();
    assert.strictEqual(service.isResuming, true);
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-2" })
    }));
    assert.strictEqual(service.currentSessionId, "session-2");
    assert.strictEqual(service.isResuming, false);
  });
  test("adopts the server session id and clears isResuming on session_resumed", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-1" })
    }));
    socket().onopen?.();
    assert.strictEqual(service.isResuming, true);
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_resumed", session_id: "session-1" })
    }));
    assert.strictEqual(service.currentSessionId, "session-1");
    assert.strictEqual(service.isResuming, false);
  });
  test("resets isResuming on cleanup (terminal disconnect)", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-1" })
    }));
    socket().onopen?.();
    assert.strictEqual(service.isResuming, true);
    socket().onclose?.(new mainWindow.CloseEvent("close", { code: 1e3, wasClean: true }));
    assert.strictEqual(service.isResuming, false);
    assert.strictEqual(service.currentSessionId, void 0);
  });
  test("reports when an abnormal close has scheduled a reconnect", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    socket().onopen?.();
    socket().onclose?.(new mainWindow.CloseEvent("close", { code: 4e3 }));
    assert.strictEqual(service.willReconnect, true);
    service.disconnect();
    assert.strictEqual(service.willReconnect, false);
  });
  test("treats a registry fatal code as terminal and does not reconnect", async () => {
    const { service } = createService();
    const fatal = [];
    store.add(service.onFatalDisconnect((event) => fatal.push(event)));
    await service.connect(createTestWindow());
    const webSocket = socket();
    webSocket.onopen?.();
    webSocket.onclose?.(new mainWindow.CloseEvent("close", {
      code: 4003,
      reason: "Voice Mode needs a verified @microsoft.com email"
    }));
    assert.strictEqual(fatal.length, 1);
    assert.strictEqual(fatal[0].code, 4003);
    assert.strictEqual(fatal[0].kind, "fatal");
    assert.strictEqual(fatal[0].reason, "Voice Mode needs a verified @microsoft.com email");
  });
  test("reports a clean close as terminal so the UI cannot strand on Reconnecting", async () => {
    const { service } = createService();
    const fatal = [];
    store.add(service.onFatalDisconnect((event) => fatal.push(event)));
    await service.connect(createTestWindow());
    const webSocket = socket();
    webSocket.onopen?.();
    webSocket.onclose?.(new mainWindow.CloseEvent("close", { code: 1001, reason: "Session idle timeout" }));
    assert.strictEqual(fatal.length, 1);
    assert.strictEqual(fatal[0].kind, "expected");
  });
  test("keeps reconnecting for a transient registry code but says why", async () => {
    const { service } = createService();
    const fatal = [];
    const issues = [];
    store.add(service.onFatalDisconnect((event) => fatal.push(event)));
    store.add(service.onConnectionIssue((event) => issues.push(event)));
    await service.connect(createTestWindow());
    const webSocket = socket();
    webSocket.onopen?.();
    webSocket.onclose?.(new mainWindow.CloseEvent("close", { code: 4503, reason: "Cannot reach GitHub" }));
    assert.strictEqual(fatal.length, 0, "a transient code must not be terminal");
    assert.deepStrictEqual(issues, [{ code: 4503, reason: "Cannot reach GitHub" }]);
  });
  test("a rejected connection does not refill the reconnect budget", async () => {
    const { service } = createService();
    const reconnect = Reflect.get(service, "_connectWebSocket");
    await service.connect(createTestWindow());
    socket().onopen?.();
    socket().onclose?.(new mainWindow.CloseEvent("close", { code: 4503, reason: "GitHub" }));
    assert.strictEqual(Reflect.get(service, "_reconnectAttempts"), 1);
    reconnect.call(service);
    socket().onopen?.();
    assert.strictEqual(Reflect.get(service, "_reconnectAttempts"), 1, "onopen must not reset the budget");
    socket().onclose?.(new mainWindow.CloseEvent("close", { code: 4503, reason: "GitHub" }));
    assert.strictEqual(Reflect.get(service, "_reconnectAttempts"), 2);
  });
  test("a recoverable close reports its reason after the disconnect is visible", async () => {
    const { service } = createService();
    const order = [];
    store.add(service.onDidChangeConnectionState((connected) => order.push(`connected:${connected}`)));
    store.add(service.onConnectionIssue((e) => order.push(`issue:${e.reason}`)));
    await service.connect(createTestWindow());
    socket().onopen?.();
    socket().onclose?.(new mainWindow.CloseEvent("close", { code: 4503, reason: "Cannot reach GitHub" }));
    assert.deepStrictEqual(order, ["connected:true", "connected:false", "issue:Cannot reach GitHub"]);
  });
  test("a confirmed session resets the reconnect budget", async () => {
    const { service } = createService();
    await service.connect(createTestWindow());
    const webSocket = socket();
    webSocket.onopen?.();
    webSocket.onclose?.(new mainWindow.CloseEvent("close", { code: 4503, reason: "GitHub" }));
    assert.strictEqual(Reflect.get(service, "_reconnectAttempts"), 1);
    Reflect.get(service, "_connectWebSocket").call(service);
    socket().onopen?.();
    socket().onmessage?.(new mainWindow.MessageEvent("message", {
      data: JSON.stringify({ type: "session_init", session_id: "session-1" })
    }));
    assert.strictEqual(Reflect.get(service, "_reconnectAttempts"), 0);
  });
  test("reports a missing backend URL instead of failing silently", async () => {
    const productWithoutUrl = { _serviceBrand: void 0, ...product, voiceWsUrl: "" };
    const configurationService = new TestConfigurationService({});
    const service = store.add(new VoiceClientService(configurationService, new NullLogService(), productWithoutUrl));
    const fatal = [];
    store.add(service.onFatalDisconnect((event) => fatal.push(event)));
    await service.connect(createTestWindow());
    assert.strictEqual(fatal.length, 1);
    assert.strictEqual(fatal[0].clientSide, true);
  });
  test("gives up after the reconnect budget rather than retrying for minutes", async () => {
    const { service } = createService();
    const fatal = [];
    store.add(service.onFatalDisconnect((event) => fatal.push(event)));
    await service.connect(createTestWindow());
    const reconnect = Reflect.get(service, "_connectWebSocket");
    const started = Date.now() - 61e3;
    Reflect.set(service, "_reconnectStartedAt", started);
    socket().onopen?.();
    socket().onclose?.(new mainWindow.CloseEvent("close", { code: 4503, reason: "GitHub" }));
    assert.strictEqual(fatal.length, 1, "an exhausted budget must report itself");
    assert.strictEqual(fatal[0].kind, "fatal");
    assert.strictEqual(service.willReconnect, false, "no retry may remain scheduled");
    void reconnect;
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHZvaWNlQ2xpZW50XFx2b2ljZUNsaWVudFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlc29sdmVBdXRvbWF0aWNWb2ljZUxhbmd1YWdlLCBWb2ljZUNsaWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VBdWRpb1Jlc3BvbnNlLCBJVm9pY2VCYXJnZUluLCBJVm9pY2VDb25uZWN0aW9uSXNzdWUsIElWb2ljZUZhdGFsRGlzY29ubmVjdCwgSVZvaWNlTmFycmF0aW9uQWNrLCBJVm9pY2VOYXJyYXRpb25TaWduYWwsIElWb2ljZVNwZWVjaFN0YXJ0ZWQsIElWb2ljZVRyYW5zY3JpcHRpb24sIG5vcm1hbGl6ZUFnZW50c1ZvaWNlSWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VDbGllbnRTZXJ2aWNlLmpzJztcblxuY2xhc3MgVGVzdFdlYlNvY2tldCB7XG5cdHN0YXRpYyBpbnN0YW5jZTogVGVzdFdlYlNvY2tldCB8IHVuZGVmaW5lZDtcblxuXHRyZWFkeVN0YXRlOiBudW1iZXIgPSBXZWJTb2NrZXQuT1BFTjtcblx0cmVhZG9ubHkgc2VudDogUmVjb3JkPHN0cmluZywgdW5rbm93bj5bXSA9IFtdO1xuXHRvbm9wZW46ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xuXHRvbm1lc3NhZ2U6ICgoZXZlbnQ6IE1lc3NhZ2VFdmVudCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcblx0b25lcnJvcjogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cdG9uY2xvc2U6ICgoZXZlbnQ6IENsb3NlRXZlbnQpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0VGVzdFdlYlNvY2tldC5pbnN0YW5jZSA9IHRoaXM7XG5cdH1cblxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlYWR5U3RhdGUgPSBXZWJTb2NrZXQuQ0xPU0VEO1xuXHR9XG5cblx0c2VuZChkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnNlbnQucHVzaChKU09OLnBhcnNlKGRhdGEpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVUZXN0V2luZG93KGxhbmd1YWdlID0gJ2VuLVVTJyk6IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzIHtcblx0cmV0dXJuIG5ldyBQcm94eShtYWluV2luZG93LCB7XG5cdFx0Z2V0KHRhcmdldCwgcHJvcGVydHksIHJlY2VpdmVyKSB7XG5cdFx0XHRpZiAocHJvcGVydHkgPT09ICdXZWJTb2NrZXQnKSB7XG5cdFx0XHRcdHJldHVybiBUZXN0V2ViU29ja2V0O1xuXHRcdFx0fVxuXHRcdFx0Ly8gTmF0aXZlIHRpbWVyIG1ldGhvZHMgYXJlIGJyYW5kZWQgdG8gdGhlaXIgb3duaW5nIGB3aW5kb3dgIGFuZCB0aHJvd1xuXHRcdFx0Ly8gXCJJbGxlZ2FsIGludm9jYXRpb25cIiB3aGVuIGNhbGxlZCB3aXRoIGEgUHJveHkgYXMgYHRoaXNgOyBiaW5kIHRvIHRoZSByZWFsIHRhcmdldC5cblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gJ3NldEludGVydmFsJyB8fCBwcm9wZXJ0eSA9PT0gJ2NsZWFySW50ZXJ2YWwnKSB7XG5cdFx0XHRcdHJldHVybiB0YXJnZXRbcHJvcGVydHldLmJpbmQodGFyZ2V0KTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gJ25hdmlnYXRvcicpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm94eSh0YXJnZXQubmF2aWdhdG9yLCB7XG5cdFx0XHRcdFx0Z2V0KG5hdmlnYXRvclRhcmdldCwgbmF2aWdhdG9yUHJvcGVydHksIG5hdmlnYXRvclJlY2VpdmVyKSB7XG5cdFx0XHRcdFx0XHRpZiAobmF2aWdhdG9yUHJvcGVydHkgPT09ICdsYW5ndWFnZScpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxhbmd1YWdlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIFJlZmxlY3QuZ2V0KG5hdmlnYXRvclRhcmdldCwgbmF2aWdhdG9yUHJvcGVydHksIG5hdmlnYXRvclJlY2VpdmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFJlZmxlY3QuZ2V0KHRhcmdldCwgcHJvcGVydHksIHJlY2VpdmVyKTtcblx0XHR9XG5cdH0pO1xufVxuXG5zdWl0ZSgnVm9pY2VDbGllbnRTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRjb25zdCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlID0ge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHQuLi5wcm9kdWN0LFxuXHRcdHZvaWNlV3NVcmw6ICd3czovL3ZvaWNlLnRlc3QvcmVhbHRpbWUvdm9pY2UnLFxuXHR9O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRUZXN0V2ViU29ja2V0Lmluc3RhbmNlID0gdW5kZWZpbmVkO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKGNvbmZpZ3VyYXRpb246IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pOiB7IHNlcnZpY2U6IFZvaWNlQ2xpZW50U2VydmljZTsgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoY29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgVm9pY2VDbGllbnRTZXJ2aWNlKFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdHJldHVybiB7IHNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH07XG5cdH1cblxuXHRmdW5jdGlvbiBzb2NrZXQoKTogVGVzdFdlYlNvY2tldCB7XG5cdFx0aWYgKCFUZXN0V2ViU29ja2V0Lmluc3RhbmNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1ZvaWNlIFdlYlNvY2tldCB3YXMgbm90IGNyZWF0ZWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIFRlc3RXZWJTb2NrZXQuaW5zdGFuY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChba2V5XSksXG5cdFx0XHRjaGFuZ2U6IHsga2V5czogW2tleV0sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiBjYW5kaWRhdGUgPT4gY2FuZGlkYXRlID09PSBrZXksXG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdlbWl0cyBiYXJnZS1pbiBldmVudHMgZnJvbSB0aGUgYmFja2VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBldmVudHM6IElWb2ljZUJhcmdlSW5bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uQmFyZ2VJbihldmVudCA9PiBldmVudHMucHVzaChldmVudCkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdGNvbnN0IHdlYlNvY2tldCA9IHNvY2tldCgpO1xuXHRcdGlmICghd2ViU29ja2V0Lm9ubWVzc2FnZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdWb2ljZSBXZWJTb2NrZXQgd2FzIG5vdCBjcmVhdGVkJyk7XG5cdFx0fVxuXHRcdHdlYlNvY2tldC5vbm1lc3NhZ2UobmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywge1xuXHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0eXBlOiAnYmFyZ2VfaW4nLFxuXHRcdFx0XHR0dXJuX2lkOiAnaW50ZXJydXB0aW5nLXR1cm4nLFxuXHRcdFx0XHRpbnRlcnJ1cHRlZF90dXJuX2lkOiAnY2FuY2VsbGVkLXR1cm4nLFxuXHRcdFx0fSksXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHR0dXJuSWQ6ICdpbnRlcnJ1cHRpbmctdHVybicsXG5cdFx0XHRpbnRlcnJ1cHRlZFR1cm5JZDogJ2NhbmNlbGxlZC10dXJuJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyB0aGUgdHVybiBJRCBvbiBzcGVlY2gtc3RhcnRlZCBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZXZlbnRzOiBJVm9pY2VTcGVlY2hTdGFydGVkW10gPSBbXTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5vblNwZWVjaFN0YXJ0ZWQoZXZlbnQgPT4gZXZlbnRzLnB1c2goZXZlbnQpKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzb2NrZXQoKS5vbm1lc3NhZ2U/LihuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHR5cGU6ICdzcGVlY2hfc3RhcnRlZCcsXG5cdFx0XHRcdHR1cm5faWQ6ICdwYXNzaXZlLXR1cm4nLFxuXHRcdFx0fSksXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7IHR1cm5JZDogJ3Bhc3NpdmUtdHVybicgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgY2hlY2twb2ludCBpbnRlcnJ1cHRpb24gbWV0YWRhdGEgZnJvbSB0aGUgYmFja2VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBldmVudHM6IElWb2ljZU5hcnJhdGlvblNpZ25hbFtdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25OYXJyYXRpb25JbnRlcnJ1cHRlZChldmVudCA9PiBldmVudHMucHVzaChldmVudCkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdHNvY2tldCgpLm9ubWVzc2FnZT8uKG5ldyBtYWluV2luZG93Lk1lc3NhZ2VFdmVudCgnbWVzc2FnZScsIHtcblx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0dHlwZTogJ25hcnJhdGlvbl9pbnRlcnJ1cHRlZCcsXG5cdFx0XHRcdG5hcnJhdGlvbl9pZDogJ2NoZWNrcG9pbnQtbmFycmF0aW9uJyxcblx0XHRcdFx0Y29kaW5nX3Nlc3Npb25faWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdHJldHJ5YWJsZTogZmFsc2UsXG5cdFx0XHRcdHJlYXNvbjogJ3N1cGVyc2VkZWRfYnlfcmVzcG9uc2UnLFxuXHRcdFx0fSksXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHRuYXJyYXRpb25JZDogJ2NoZWNrcG9pbnQtbmFycmF0aW9uJyxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogJ2NoYXQtc2Vzc2lvbjovb25lJyxcblx0XHRcdHJldHJ5YWJsZTogZmFsc2UsXG5cdFx0XHRyZWFzb246ICdzdXBlcnNlZGVkX2J5X3Jlc3BvbnNlJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyB0aGUgYmFja2VuZCB0dXJuIElEIHdoZW4gYXVkaW8gaGFzIGEgbmFycmF0aW9uIElEJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGV2ZW50czogSVZvaWNlQXVkaW9SZXNwb25zZVtdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25BdWRpb1Jlc3BvbnNlKGV2ZW50ID0+IGV2ZW50cy5wdXNoKGV2ZW50KSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0Y29uc3Qgd2ViU29ja2V0ID0gc29ja2V0KCk7XG5cdFx0aWYgKCF3ZWJTb2NrZXQub25tZXNzYWdlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1ZvaWNlIFdlYlNvY2tldCB3YXMgbm90IGNyZWF0ZWQnKTtcblx0XHR9XG5cdFx0d2ViU29ja2V0Lm9ubWVzc2FnZShuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHR5cGU6ICdhdWRpb19yZXNwb25zZScsXG5cdFx0XHRcdGF1ZGlvOiAnYXVkaW8nLFxuXHRcdFx0XHRpc19maXJzdF9jaHVuazogdHJ1ZSxcblx0XHRcdFx0aXNfZmluYWw6IGZhbHNlLFxuXHRcdFx0XHR0dXJuX2lkOiAnYmFja2VuZC10dXJuJyxcblx0XHRcdFx0bmFycmF0aW9uX2lkOiAnY2xpZW50LW5hcnJhdGlvbicsXG5cdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0XHRjaGVja3BvaW50X2lkOiAncGxhbm5pbmcnLFxuXHRcdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdFx0bmFycmF0aW9uX2tpbmQ6ICdjaGVja3BvaW50Jyxcblx0XHRcdFx0cGxheWJhY2tfaWQ6ICdwbGF5YmFjay0xJyxcblx0XHRcdH0pLFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbe1xuXHRcdFx0YXVkaW86ICdhdWRpbycsXG5cdFx0XHRpc0ZpcnN0Q2h1bms6IHRydWUsXG5cdFx0XHRpc0ZpbmFsOiBmYWxzZSxcblx0XHRcdGNvZGluZ1Nlc3Npb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0dHJhbnNjcmlwdDogdW5kZWZpbmVkLFxuXHRcdFx0dHVybklkOiAnYmFja2VuZC10dXJuJyxcblx0XHRcdHJlc3BvbnNlSWQ6ICdjbGllbnQtbmFycmF0aW9uJyxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0XHRjaGVja3BvaW50SWQ6ICdwbGFubmluZycsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdG5hcnJhdGlvbktpbmQ6ICdjaGVja3BvaW50Jyxcblx0XHRcdHBsYXliYWNrSWQ6ICdwbGF5YmFjay0xJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZhbGlkYXRlcyBhbmQgdHJhbnNsYXRlcyBzY29wZWQgdHJhbnNjcmlwdGlvbiBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0Li4ucHJvZHVjdCxcblx0XHRcdHZvaWNlV3NVcmw6ICd3czovL3ZvaWNlLnRlc3QvcmVhbHRpbWUvdm9pY2UnLFxuXHRcdH07XG5cdFx0Y29uc3Qgc2VydmljZSA9IHN0b3JlLmFkZChuZXcgVm9pY2VDbGllbnRTZXJ2aWNlKFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRwcm9kdWN0U2VydmljZSxcblx0XHQpKTtcblx0XHRjb25zdCBldmVudHM6IElWb2ljZVRyYW5zY3JpcHRpb25bXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uVHJhbnNjcmlwdGlvbihldmVudCA9PiBldmVudHMucHVzaChldmVudCkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdGNvbnN0IHNvY2tldCA9IFRlc3RXZWJTb2NrZXQuaW5zdGFuY2U7XG5cdFx0aWYgKCFzb2NrZXQ/Lm9ubWVzc2FnZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdWb2ljZSBXZWJTb2NrZXQgd2FzIG5vdCBjcmVhdGVkJyk7XG5cdFx0fVxuXHRcdHNvY2tldC5vbm1lc3NhZ2UobmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywge1xuXHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0eXBlOiAndHJhbnNjcmlwdGlvbicsXG5cdFx0XHRcdHRleHQ6ICdjcmVhdGUgYSBmaWxlJyxcblx0XHRcdFx0c3RhdHVzOiAncGFydGlhbCcsXG5cdFx0XHRcdGNvbW1pdHRlZDogJ2NyZWF0ZSAnLFxuXHRcdFx0XHR0dXJuX2lkOiAndHVybi0xJyxcblx0XHRcdFx0cmV2aXNpb246IDMsXG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW3tcblx0XHRcdHRleHQ6ICdjcmVhdGUgYSBmaWxlJyxcblx0XHRcdHN0YXR1czogJ3BhcnRpYWwnLFxuXHRcdFx0Y29tbWl0dGVkOiAnY3JlYXRlICcsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0cmV2aXNpb246IDMsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGludmFsaWQgdHJhbnNjcmlwdGlvbiBzdGF0dXMgYW5kIHJldmlzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHQuLi5wcm9kdWN0LFxuXHRcdFx0dm9pY2VXc1VybDogJ3dzOi8vdm9pY2UudGVzdC9yZWFsdGltZS92b2ljZScsXG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBWb2ljZUNsaWVudFNlcnZpY2UoXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHByb2R1Y3RTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdGNvbnN0IGV2ZW50czogSVZvaWNlVHJhbnNjcmlwdGlvbltdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25UcmFuc2NyaXB0aW9uKGV2ZW50ID0+IGV2ZW50cy5wdXNoKGV2ZW50KSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0Y29uc3Qgc29ja2V0ID0gVGVzdFdlYlNvY2tldC5pbnN0YW5jZTtcblx0XHRpZiAoIXNvY2tldD8ub25tZXNzYWdlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1ZvaWNlIFdlYlNvY2tldCB3YXMgbm90IGNyZWF0ZWQnKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIFtcblx0XHRcdHsgdHlwZTogJ3RyYW5zY3JpcHRpb24nLCB0ZXh0OiAnaW52YWxpZCBzdGF0dXMnLCBzdGF0dXM6ICdwZW5kaW5nJyB9LFxuXHRcdFx0eyB0eXBlOiAndHJhbnNjcmlwdGlvbicsIHRleHQ6ICd1bnNjb3BlZCByZXZpc2lvbicsIHN0YXR1czogJ3BhcnRpYWwnLCByZXZpc2lvbjogMSB9LFxuXHRcdFx0eyB0eXBlOiAndHJhbnNjcmlwdGlvbicsIHRleHQ6ICdpbnZhbGlkIHJldmlzaW9uJywgc3RhdHVzOiAncGFydGlhbCcsIHR1cm5faWQ6ICd0dXJuLTEnLCByZXZpc2lvbjogMS41IH0sXG5cdFx0XHR7IHR5cGU6ICd0cmFuc2NyaXB0aW9uJywgdGV4dDogJ25lZ2F0aXZlIHJldmlzaW9uJywgc3RhdHVzOiAncGFydGlhbCcsIHR1cm5faWQ6ICd0dXJuLTEnLCByZXZpc2lvbjogLTEgfSxcblx0XHRcdHsgdHlwZTogJ3RyYW5zY3JpcHRpb24nLCB0ZXh0OiAnbGVnYWN5IGZpbmFsJyB9LFxuXHRcdF0pIHtcblx0XHRcdHNvY2tldC5vbm1lc3NhZ2UobmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywgeyBkYXRhOiBKU09OLnN0cmluZ2lmeShtZXNzYWdlKSB9KSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFt7XG5cdFx0XHR0ZXh0OiAnbGVnYWN5IGZpbmFsJyxcblx0XHRcdHN0YXR1czogJ2ZpbmFsJyxcblx0XHRcdGNvbW1pdHRlZDogJycsXG5cdFx0XHR0dXJuSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHJldmlzaW9uOiB1bmRlZmluZWQsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kcyBtaWNyb3Bob25lIGF1ZGlvIHVzaW5nIHRoZSBQVFQgcHJvdG9jb2wnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzZXJ2aWNlLnNlbmRQdHRTdGFydCgndHVybi0xJyk7XG5cdFx0c2VydmljZS5zZW5kUHR0QXVkaW9DaHVuaygnY0dOdCcpO1xuXHRcdHNlcnZpY2Uuc2VuZFB0dEVuZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50LCBbXG5cdFx0XHR7IHR5cGU6ICdwdHRfc3RhcnQnLCB0dXJuX2lkOiAndHVybi0xJyB9LFxuXHRcdFx0eyB0eXBlOiAncHR0X2F1ZGlvX2NodW5rJywgYXVkaW86ICdjR050JyB9LFxuXHRcdFx0eyB0eXBlOiAncHR0X2VuZCcgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZHMgZmlyc3QtY2xhc3MgY2hlY2twb2ludCBuYXJyYXRpb24gbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJycgfSwgJ21hY2hpbmUnKTtcblxuXHRcdGNvbnN0IG5hcnJhdGlvbklkID0gc2VydmljZS5yZXF1ZXN0TmFycmF0aW9uKCdjaGF0LXNlc3Npb246L29uZScsICdjaGVja3BvaW50JywgJ1VwZGF0aW5nIHRoZSBjb2RlLicsIHVuZGVmaW5lZCwge1xuXHRcdFx0cmVxdWVzdElkOiAncmVxdWVzdC0xJyxcblx0XHRcdGNoZWNrcG9pbnRJZDogJ2VkaXRpbmcnLFxuXHRcdFx0c2VxdWVuY2U6IDIsXG5cdFx0fSk7XG5cdFx0c2VydmljZS5zZW5kTmFycmF0aW9uUGxheWJhY2tDb21wbGV0ZSgnY2hhdC1zZXNzaW9uOi9vbmUnLCBuYXJyYXRpb25JZCEsICdwbGF5YmFjay0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvY2tldCgpLnNlbnQuc2xpY2UoMSksIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3JlcXVlc3RfbmFycmF0aW9uJyxcblx0XHRcdFx0Y29kaW5nX3Nlc3Npb25faWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdGtpbmQ6ICdjaGVja3BvaW50Jyxcblx0XHRcdFx0dGV4dDogJ1VwZGF0aW5nIHRoZSBjb2RlLicsXG5cdFx0XHRcdG5hcnJhdGlvbl9pZDogbmFycmF0aW9uSWQsXG5cdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXF1ZXN0LTEnLFxuXHRcdFx0XHRjaGVja3BvaW50X2lkOiAnZWRpdGluZycsXG5cdFx0XHRcdHNlcXVlbmNlOiAyLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ25hcnJhdGlvbl9wbGF5YmFja19jb21wbGV0ZScsXG5cdFx0XHRcdGNvZGluZ19zZXNzaW9uX2lkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0XHRuYXJyYXRpb25faWQ6IG5hcnJhdGlvbklkLFxuXHRcdFx0XHRwbGF5YmFja19pZDogJ3BsYXliYWNrLTEnLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZHMgdHlwZWQgY29uZmlybWF0aW9uIG5hcnJhdGlvbiBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzZXJ2aWNlLnNlbmRTdGFydFNlc3Npb24oeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnJyB9LCAnbWFjaGluZScpO1xuXG5cdFx0Y29uc3QgbmFycmF0aW9uSWQgPSBzZXJ2aWNlLnJlcXVlc3ROYXJyYXRpb24oXG5cdFx0XHQnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0J2NvbmZpcm1hdGlvbicsXG5cdFx0XHQncXVlc3Rpb25uYWlyZTogMSBxdWVzdGlvbicsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQncXVlc3Rpb25uYWlyZScsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudFsxXSwge1xuXHRcdFx0dHlwZTogJ3JlcXVlc3RfbmFycmF0aW9uJyxcblx0XHRcdGNvZGluZ19zZXNzaW9uX2lkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0a2luZDogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHR0ZXh0OiAncXVlc3Rpb25uYWlyZTogMSBxdWVzdGlvbicsXG5cdFx0XHRuYXJyYXRpb25faWQ6IG5hcnJhdGlvbklkLFxuXHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdHMgYW5kIGNsZWFycyB0eXBlZCBjb25maXJtYXRpb24gc2Vzc2lvbiBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzb2NrZXQoKS5vbm9wZW4/LigpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cblx0XHRzZXJ2aWNlLnNlbmRTZXNzaW9uQ29udGV4dCh7XG5cdFx0XHRzZXNzaW9uczogW3tcblx0XHRcdFx0aWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdGlzX2FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0YWdlbnRfc3RhdGU6ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nLFxuXHRcdFx0XHRhZ2VudF9zdGF0ZV9kZXRhaWw6ICdxdWVzdGlvbm5haXJlOiAxIHF1ZXN0aW9uJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdH1dLFxuXHRcdFx0ZGlzcGxheV9sb2NhbGU6ICdlbi1VUycsXG5cdFx0fSk7XG5cdFx0c2VydmljZS5mbHVzaFNlc3Npb25Db250ZXh0KCk7XG5cdFx0c2VydmljZS5zZW5kU2Vzc2lvbkNvbnRleHQoe1xuXHRcdFx0c2Vzc2lvbnM6IFt7XG5cdFx0XHRcdGlkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0XHRpc19hY3RpdmU6IHRydWUsXG5cdFx0XHRcdGFnZW50X3N0YXRlOiAnaWRsZScsXG5cdFx0XHR9XSxcblx0XHRcdGRpc3BsYXlfbG9jYWxlOiAnZW4tVVMnLFxuXHRcdH0pO1xuXHRcdHNlcnZpY2UuZmx1c2hTZXNzaW9uQ29udGV4dCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50LnNsaWNlKDEpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzZXNzaW9uX2NvbnRleHQnLFxuXHRcdFx0XHRtb2RlOiAnZGVsdGEnLFxuXHRcdFx0XHR1cHNlcnRzOiBbe1xuXHRcdFx0XHRcdGlkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0XHRcdGlzX2FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0XHRhZ2VudF9zdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdFx0YWdlbnRfc3RhdGVfZGV0YWlsOiAncXVlc3Rpb25uYWlyZTogMSBxdWVzdGlvbicsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHJlbW92ZXM6IFtdLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3Nlc3Npb25fY29udGV4dCcsXG5cdFx0XHRcdG1vZGU6ICdkZWx0YScsXG5cdFx0XHRcdHVwc2VydHM6IFt7XG5cdFx0XHRcdFx0aWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdFx0YWdlbnRfc3RhdGU6ICdpZGxlJyxcblx0XHRcdFx0XHRhZ2VudF9zdGF0ZV9kZXRhaWw6IG51bGwsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6IG51bGwsXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRyZW1vdmVzOiBbXSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludmFsaWRhdGVkIGNvbnRleHQgcHJlc2VydmVzIHBlbmRpbmcgZGVsZXRpb24gdG9tYnN0b25lcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzb2NrZXQoKS5vbm9wZW4/LigpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gJ2NoYXQtc2Vzc2lvbjovb25lJztcblxuXHRcdHNlcnZpY2Uuc2VuZFNlc3Npb25Db250ZXh0KHtcblx0XHRcdHNlc3Npb25zOiBbe1xuXHRcdFx0XHRpZDogc2Vzc2lvbklkLFxuXHRcdFx0XHRpc19hY3RpdmU6IHRydWUsXG5cdFx0XHRcdGFnZW50X3N0YXRlOiAnd2FpdGluZ19mb3JfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0YWdlbnRfc3RhdGVfZGV0YWlsOiAnV2hpY2ggcmVnaW9uPycsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbl90eXBlOiAncXVlc3Rpb25uYWlyZScsXG5cdFx0XHRcdHBlbmRpbmc6IHtcblx0XHRcdFx0XHR0eXBlOiAncXVlc3Rpb25zJyxcblx0XHRcdFx0XHRwZW5kaW5nX2lkOiAncmVxdWVzdC0xI3AxJyxcblx0XHRcdFx0XHRyZXF1ZXN0X2lkOiAncmVxdWVzdC0xJyxcblx0XHRcdFx0XHRxdWVzdGlvbnM6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0XHRkaXNwbGF5X2xvY2FsZTogJ2VuLVVTJyxcblx0XHR9KTtcblx0XHRzZXJ2aWNlLmZsdXNoU2Vzc2lvbkNvbnRleHQoKTtcblx0XHRzZXJ2aWNlLmludmFsaWRhdGVTZXNzaW9uQ2FjaGUoc2Vzc2lvbklkKTtcblx0XHRzZXJ2aWNlLnNlbmRTZXNzaW9uQ29udGV4dCh7XG5cdFx0XHRzZXNzaW9uczogW3tcblx0XHRcdFx0aWQ6IHNlc3Npb25JZCxcblx0XHRcdFx0aXNfYWN0aXZlOiB0cnVlLFxuXHRcdFx0XHRhZ2VudF9zdGF0ZTogJ3dhaXRpbmdfZm9yX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGFnZW50X3N0YXRlX2RldGFpbDogJ1doaWNoIHJlZ2lvbj8nLFxuXHRcdFx0XHRjb25maXJtYXRpb25fdHlwZTogJ3F1ZXN0aW9ubmFpcmUnLFxuXHRcdFx0fV0sXG5cdFx0XHRkaXNwbGF5X2xvY2FsZTogJ2VuLVVTJyxcblx0XHR9KTtcblx0XHRzZXJ2aWNlLmZsdXNoU2Vzc2lvbkNvbnRleHQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudC5hdCgtMSksIHtcblx0XHRcdHR5cGU6ICdzZXNzaW9uX2NvbnRleHQnLFxuXHRcdFx0bW9kZTogJ2RlbHRhJyxcblx0XHRcdHVwc2VydHM6IFt7XG5cdFx0XHRcdGlkOiBzZXNzaW9uSWQsXG5cdFx0XHRcdGlzX2FjdGl2ZTogdHJ1ZSxcblx0XHRcdFx0YWdlbnRfc3RhdGU6ICd3YWl0aW5nX2Zvcl9jb25maXJtYXRpb24nLFxuXHRcdFx0XHRhZ2VudF9zdGF0ZV9kZXRhaWw6ICdXaGljaCByZWdpb24/Jyxcblx0XHRcdFx0Y29uZmlybWF0aW9uX3R5cGU6ICdxdWVzdGlvbm5haXJlJyxcblx0XHRcdFx0cGVuZGluZzogbnVsbCxcblx0XHRcdH1dLFxuXHRcdFx0cmVtb3ZlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZXMgbGVnYWN5IHN1cHByZXNzZWQgbmFycmF0aW9uIGFja25vd2xlZGdlbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZXZlbnRzOiBJVm9pY2VOYXJyYXRpb25BY2tbXSA9IFtdO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uTmFycmF0aW9uQWNrKGV2ZW50ID0+IGV2ZW50cy5wdXNoKGV2ZW50KSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXG5cdFx0c29ja2V0KCkub25tZXNzYWdlPy4obmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywge1xuXHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0eXBlOiAnbmFycmF0aW9uX2FjaycsXG5cdFx0XHRcdG5hcnJhdGlvbl9pZDogJ25hcnJhdGlvbi0xJyxcblx0XHRcdFx0Y29kaW5nX3Nlc3Npb25faWQ6ICdjaGF0LXNlc3Npb246L29uZScsXG5cdFx0XHRcdGRpc3Bvc2l0aW9uOiAnc3VwcHJlc3NlZCcsXG5cdFx0XHRcdHJlYXNvbjogJ3N0YWxlJyxcblx0XHRcdH0pLFxuXHRcdH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW3tcblx0XHRcdG5hcnJhdGlvbklkOiAnbmFycmF0aW9uLTEnLFxuXHRcdFx0Y29kaW5nU2Vzc2lvbklkOiAnY2hhdC1zZXNzaW9uOi9vbmUnLFxuXHRcdFx0ZGlzcG9zaXRpb246ICdzdXBwcmVzc2VkJyxcblx0XHRcdHJlYXNvbjogJ3N0YWxlJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZsYWdzIGEgcGFzc2l2ZSBwdHRfc3RhcnQgZm9yIGhhbmRzLWZyZWUgYmFyZ2UtaW4gbGlzdGVucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdHNlcnZpY2Uuc2VuZFB0dFN0YXJ0KCd0dXJuLXBhc3NpdmUnLCB0cnVlKTtcblx0XHRzZXJ2aWNlLnNlbmRQdHRTdGFydCgndHVybi1yZWFsJywgZmFsc2UpO1xuXHRcdHNlcnZpY2Uuc2VuZFB0dFN0YXJ0KCd0dXJuLWRlZmF1bHQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudCwgW1xuXHRcdFx0eyB0eXBlOiAncHR0X3N0YXJ0JywgdHVybl9pZDogJ3R1cm4tcGFzc2l2ZScsIHBhc3NpdmU6IHRydWUgfSxcblx0XHRcdHsgdHlwZTogJ3B0dF9zdGFydCcsIHR1cm5faWQ6ICd0dXJuLXJlYWwnIH0sXG5cdFx0XHR7IHR5cGU6ICdwdHRfc3RhcnQnLCB0dXJuX2lkOiAndHVybi1kZWZhdWx0JyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemVzIHRoZSBwZW5kaW5nIGlkIG9uIGEgcXVlc3Rpb24gbmFycmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJycgfSwgJ21hY2hpbmUnKTtcblx0XHRjb25zdCBxdWVzdGlvbklkID0gc2VydmljZS5yZXF1ZXN0TmFycmF0aW9uKCdjczEnLCAncXVlc3Rpb24nLCAnV2hpY2ggcmVnaW9uPycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgcGVuZGluZ0lkOiAncDEnIH0pO1xuXHRcdGNvbnN0IHJlcGx5SWQgPSBzZXJ2aWNlLnJlcXVlc3ROYXJyYXRpb24oJ2NzMScsICdyZXNwb25zZScsICdEb25lLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50LmZpbHRlcihtZXNzYWdlID0+IG1lc3NhZ2UudHlwZSA9PT0gJ3JlcXVlc3RfbmFycmF0aW9uJyksIFtcblx0XHRcdHsgdHlwZTogJ3JlcXVlc3RfbmFycmF0aW9uJywgY29kaW5nX3Nlc3Npb25faWQ6ICdjczEnLCBraW5kOiAncXVlc3Rpb24nLCB0ZXh0OiAnV2hpY2ggcmVnaW9uPycsIG5hcnJhdGlvbl9pZDogcXVlc3Rpb25JZCwgcGVuZGluZ19pZDogJ3AxJyB9LFxuXHRcdFx0eyB0eXBlOiAncmVxdWVzdF9uYXJyYXRpb24nLCBjb2Rpbmdfc2Vzc2lvbl9pZDogJ2NzMScsIGtpbmQ6ICdyZXNwb25zZScsIHRleHQ6ICdEb25lLicsIG5hcnJhdGlvbl9pZDogcmVwbHlJZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwYXJlcyBmb3IgbmFycmF0aW9uIGF1ZGlvIGJlZm9yZSBzZW5kaW5nIHRoZSByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cdFx0Y29uc3Qgc2VudEJlZm9yZU5hcnJhdGlvbiA9IHNvY2tldCgpLnNlbnQubGVuZ3RoO1xuXHRcdGxldCBzZW50V2hlblByZXBhcmVkID0gLTE7XG5cblx0XHRjb25zdCBuYXJyYXRpb25JZCA9IHNlcnZpY2UucmVxdWVzdE5hcnJhdGlvbignY3MxJywgJ3Jlc3BvbnNlJywgJ0RvbmUuJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAoKSA9PiB7XG5cdFx0XHRzZW50V2hlblByZXBhcmVkID0gc29ja2V0KCkuc2VudC5sZW5ndGg7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2VudEJlZm9yZU5hcnJhdGlvbixcblx0XHRcdHNlbnRXaGVuUHJlcGFyZWQsXG5cdFx0XHRzZW50QWZ0ZXJOYXJyYXRpb246IHNvY2tldCgpLnNlbnQubGVuZ3RoLFxuXHRcdFx0bmFycmF0aW9uSWQ6IHR5cGVvZiBuYXJyYXRpb25JZCxcblx0XHR9LCB7XG5cdFx0XHRzZW50QmVmb3JlTmFycmF0aW9uOiAxLFxuXHRcdFx0c2VudFdoZW5QcmVwYXJlZDogMSxcblx0XHRcdHNlbnRBZnRlck5hcnJhdGlvbjogMixcblx0XHRcdG5hcnJhdGlvbklkOiAnc3RyaW5nJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGlua3MgYSB0b29sIHJlc3VsdCB0byBpdHMgcmVzb2x2ZWQgY29kaW5nIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cblx0XHRzZXJ2aWNlLnNlbmRUb29sUmVzdWx0KCdjYWxsLTEnLCAnb2snLCAnY29waWxvdGNsaTovc2Vzc2lvbi0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvY2tldCgpLnNlbnQuYXQoLTEpLCB7XG5cdFx0XHR0eXBlOiAndG9vbF9yZXN1bHQnLFxuXHRcdFx0Y2FsbF9pZDogJ2NhbGwtMScsXG5cdFx0XHRyZXN1bHQ6ICdvaycsXG5cdFx0XHRjb2Rpbmdfc2Vzc2lvbl9pZDogJ2NvcGlsb3RjbGk6L3Nlc3Npb24tMScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Ryb3BzIGEgbmFycmF0aW9uIHJlcXVlc3RlZCBiZWZvcmUgdGhlIHNlc3Npb24gc3RhcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0Y29uc3QgbmFycmF0aW9uSWQgPSBzZXJ2aWNlLnJlcXVlc3ROYXJyYXRpb24oJ2NzMScsICdxdWVzdGlvbicsICdXaGljaCByZWdpb24/JywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBwZW5kaW5nSWQ6ICdwMScgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmFycmF0aW9uSWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50LmZpbHRlcihtZXNzYWdlID0+IG1lc3NhZ2UudHlwZSA9PT0gJ3JlcXVlc3RfbmFycmF0aW9uJyksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplcyBhIGxlZ2FjeSB2b2ljZSBpZGVudGlmaWVyIGluIHN0YXJ0X3Nlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHtcblx0XHRcdCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnZnItZnInLFxuXHRcdFx0J2FnZW50cy52b2ljZS52b2ljZSc6ICdrZXZpbl9uZXV0cmFsJyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCdkZS1ERScpKTtcblx0XHRzZXJ2aWNlLnNlbmRTdGFydFNlc3Npb24oeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnJyB9LCAnbWFjaGluZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50Lm1hcChtZXNzYWdlID0+ICh7XG5cdFx0XHR0eXBlOiBtZXNzYWdlLnR5cGUsXG5cdFx0XHRzZXNzaW9uX2NvbnRleHQ6IG1lc3NhZ2Uuc2Vzc2lvbl9jb250ZXh0LFxuXHRcdFx0dm9pY2U6IG1lc3NhZ2Uudm9pY2UsXG5cdFx0XHRhdXRvX25hcnJhdGU6IG1lc3NhZ2UuYXV0b19uYXJyYXRlLFxuXHRcdH0pKSwgW3tcblx0XHRcdHR5cGU6ICdzdGFydF9zZXNzaW9uJyxcblx0XHRcdHNlc3Npb25fY29udGV4dDogeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnZnItRlInIH0sXG5cdFx0XHR2b2ljZTogJ29ha19uZXV0cmFsJyxcblx0XHRcdGF1dG9fbmFycmF0ZTogZmFsc2UsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdub3JtYWxpemVzIGV2ZXJ5IGNhbm9uaWNhbCBhbmQgbGVnYWN5IHZvaWNlIGlkZW50aWZpZXIsIGFuZCBmYWxscyBiYWNrIGZvciBpbnZhbGlkIHZhbHVlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHQnaGFycGVyX25ldXRyYWwnLCAnYmlyY2hfbmV1dHJhbCcsICdqdW5ob19uZXV0cmFsJywgJ29ha19uZXV0cmFsJyxcblx0XHRcdFx0J3ZpY3RvcmlhX25ldXRyYWwnLCAnbWF5YV9uZXV0cmFsJywgJ2RhbmllbF9uZXV0cmFsJywgJ2tldmluX25ldXRyYWwnLFxuXHRcdFx0XHR1bmRlZmluZWQsICcgICcsIDQyLCAndW5rbm93bl92b2ljZScsXG5cdFx0XHRdLm1hcChub3JtYWxpemVBZ2VudHNWb2ljZUlkKSxcblx0XHRcdFtcblx0XHRcdFx0J2hhcnBlcl9uZXV0cmFsJywgJ2JpcmNoX25ldXRyYWwnLCAnanVuaG9fbmV1dHJhbCcsICdvYWtfbmV1dHJhbCcsXG5cdFx0XHRcdCdoYXJwZXJfbmV1dHJhbCcsICdiaXJjaF9uZXV0cmFsJywgJ2p1bmhvX25ldXRyYWwnLCAnb2FrX25ldXRyYWwnLFxuXHRcdFx0XHQnYmlyY2hfbmV1dHJhbCcsICdiaXJjaF9uZXV0cmFsJywgJ2JpcmNoX25ldXRyYWwnLCAnYmlyY2hfbmV1dHJhbCcsXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBCaXJjaCBmb3IgbWlzc2luZyBhbmQgbGVnYWN5IE1heWEgdmFsdWVzIGluIHN0YXJ0X3Nlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgdm9pY2VzID0gW107XG5cdFx0Zm9yIChjb25zdCBjb25maWd1cmF0aW9uIG9mIFt1bmRlZmluZWQsIHsgJ2FnZW50cy52b2ljZS52b2ljZSc6ICdtYXlhX25ldXRyYWwnIH1dKSB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoY29uZmlndXJhdGlvbik7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cdFx0XHR2b2ljZXMucHVzaChzb2NrZXQoKS5zZW50WzBdLnZvaWNlKTtcblx0XHRcdHNlcnZpY2UuZGlzY29ubmVjdCgpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodm9pY2VzLCBbJ2JpcmNoX25ldXRyYWwnLCAnYmlyY2hfbmV1dHJhbCddKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZHMgdm9pY2UgaW5zdHJ1Y3Rpb25zIHdoZW4gc3RhcnRpbmcgYSBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJycgfSwgJ21hY2hpbmUnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ1Byb25vdW5jZSBcIkNvbnRvc28gREJcIiBhcyB3cml0dGVuLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50Lm1hcChtZXNzYWdlID0+ICh7XG5cdFx0XHR0eXBlOiBtZXNzYWdlLnR5cGUsXG5cdFx0XHR2b2ljZV9pbnN0cnVjdGlvbnM6IG1lc3NhZ2Uudm9pY2VfaW5zdHJ1Y3Rpb25zLFxuXHRcdH0pKSwgW3tcblx0XHRcdHR5cGU6ICdzdGFydF9zZXNzaW9uJyxcblx0XHRcdHZvaWNlX2luc3RydWN0aW9uczogJ1Byb25vdW5jZSBcIkNvbnRvc28gREJcIiBhcyB3cml0dGVuLicsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBkaXNwbGF5IGxhbmd1YWdlIGZvciBhdXRvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0ID0gY3JlYXRlU2VydmljZSh7ICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnOiAnYXV0bycgfSk7XG5cdFx0YXdhaXQgZmlyc3Quc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coJ3B0LUJSJykpO1xuXHRcdGZpcnN0LnNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cdFx0Y29uc3Qgd2l0aEJyb3dzZXJMb2NhbGUgPSBzb2NrZXQoKS5zZW50WzBdLnNlc3Npb25fY29udGV4dDtcblxuXHRcdGNvbnN0IHNlY29uZCA9IGNyZWF0ZVNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJzogJ2F1dG8nIH0pO1xuXHRcdGF3YWl0IHNlY29uZC5zZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygnJykpO1xuXHRcdHNlY29uZC5zZXJ2aWNlLnNlbmRTdGFydFNlc3Npb24oeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnJyB9LCAnbWFjaGluZScpO1xuXHRcdGNvbnN0IHdpdGhvdXRCcm93c2VyTG9jYWxlID0gc29ja2V0KCkuc2VudFswXS5zZXNzaW9uX2NvbnRleHQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgd2l0aEJyb3dzZXJMb2NhbGUsIHdpdGhvdXRCcm93c2VyTG9jYWxlIH0sIHtcblx0XHRcdHdpdGhCcm93c2VyTG9jYWxlOiB7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICdlbicgfSxcblx0XHRcdHdpdGhvdXRCcm93c2VyTG9jYWxlOiB7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICdlbicgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgYXV0b21hdGljIGxhbmd1YWdlIGZyb20gZGlzcGxheSBsYW5ndWFnZSBiZWZvcmUgYnJvd3NlciBsb2NhbGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNwbGF5TGFuZ3VhZ2U6IHJlc29sdmVBdXRvbWF0aWNWb2ljZUxhbmd1YWdlKCdlbi1VUycsICdkZScpLFxuXHRcdFx0ZW5nbGlzaERpc3BsYXlMYW5ndWFnZTogcmVzb2x2ZUF1dG9tYXRpY1ZvaWNlTGFuZ3VhZ2UoJ2RlLURFJywgJ2VuJyksXG5cdFx0XHRicm93c2VyTG9jYWxlOiByZXNvbHZlQXV0b21hdGljVm9pY2VMYW5ndWFnZSgncHQtQlInLCB1bmRlZmluZWQpLFxuXHRcdFx0dW5zdXBwb3J0ZWREaXNwbGF5TGFuZ3VhZ2U6IHJlc29sdmVBdXRvbWF0aWNWb2ljZUxhbmd1YWdlKCdwdC1CUicsICdoZS1JTCcpLFxuXHRcdFx0bWlzc2luZzogcmVzb2x2ZUF1dG9tYXRpY1ZvaWNlTGFuZ3VhZ2UodW5kZWZpbmVkLCB1bmRlZmluZWQpLFxuXHRcdH0sIHtcblx0XHRcdGRpc3BsYXlMYW5ndWFnZTogJ2RlJyxcblx0XHRcdGVuZ2xpc2hEaXNwbGF5TGFuZ3VhZ2U6ICdlbicsXG5cdFx0XHRicm93c2VyTG9jYWxlOiAncHQtQlInLFxuXHRcdFx0dW5zdXBwb3J0ZWREaXNwbGF5TGFuZ3VhZ2U6ICdwdC1CUicsXG5cdFx0XHRtaXNzaW5nOiAnZW4tVVMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIGZvciBhbiB1bnN1cHBvcnRlZCBjb25maWd1cmVkIEJDUC00NyBsb2NhbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5sYW5ndWFnZSc6ICd1ay1VQScgfSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygnZnItRlInKSk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJycgfSwgJ21hY2hpbmUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudFswXS5zZXNzaW9uX2NvbnRleHQsIHtcblx0XHRcdHNlc3Npb25zOiBbXSxcblx0XHRcdGRpc3BsYXlfbG9jYWxlOiAnZW4tVVMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIGZvciBhIGNvbmZpZ3VyZWQgQVNSLW9ubHkgbGFuZ3VhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5sYW5ndWFnZSc6ICdhcicgfSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygnYXItU0EnKSk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJycgfSwgJ21hY2hpbmUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ja2V0KCkuc2VudFswXS5zZXNzaW9uX2NvbnRleHQsIHtcblx0XHRcdHNlc3Npb25zOiBbXSxcblx0XHRcdGRpc3BsYXlfbG9jYWxlOiAnZW4tVVMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVmZXJzIHRoZSBkaXNwbGF5IGxhbmd1YWdlIG92ZXIgYW4gQVNSLW9ubHkgYnJvd3NlciBsb2NhbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5sYW5ndWFnZSc6ICdhdXRvJyB9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCdhci1TQScpKTtcblx0XHRzZXJ2aWNlLnNlbmRTdGFydFNlc3Npb24oeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnJyB9LCAnbWFjaGluZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzb2NrZXQoKS5zZW50WzBdLnNlc3Npb25fY29udGV4dCwge1xuXHRcdFx0c2Vzc2lvbnM6IFtdLFxuXHRcdFx0ZGlzcGxheV9sb2NhbGU6ICdlbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWZlcnMgdGhlIGRpc3BsYXkgbGFuZ3VhZ2Ugb3ZlciBhbiB1bnN1cHBvcnRlZCBicm93c2VyIGxvY2FsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoeyAnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJzogJ2F1dG8nIH0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coJ2hlLUlMJykpO1xuXHRcdHNlcnZpY2Uuc2VuZFN0YXJ0U2Vzc2lvbih7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICcnIH0sICdtYWNoaW5lJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvY2tldCgpLnNlbnRbMF0uc2Vzc2lvbl9jb250ZXh0LCB7XG5cdFx0XHRzZXNzaW9uczogW10sXG5cdFx0XHRkaXNwbGF5X2xvY2FsZTogJ2VuJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZHMgb25lIGxpdmUgbGFuZ3VhZ2UgdXBkYXRlIHdpdGhvdXQgY2hhbmdpbmcgdm9pY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHQnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJzogJ2F1dG8nLFxuXHRcdFx0J2FnZW50cy52b2ljZS52b2ljZSc6ICd2aWN0b3JpYV9uZXV0cmFsJyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygnZW4tR0InKSk7XG5cdFx0c2VydmljZS5zZW5kU3RhcnRTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJ2VuLUdCJyB9LCAnbWFjaGluZScpO1xuXG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2FnZW50cy52b2ljZS5sYW5ndWFnZScsICdmci1GUicpO1xuXHRcdGZpcmVDb25maWd1cmF0aW9uQ2hhbmdlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvY2tldCgpLnNlbnQubWFwKG1lc3NhZ2UgPT4gbWVzc2FnZS50eXBlID09PSAnc3RhcnRfc2Vzc2lvbicgPyB7XG5cdFx0XHR0eXBlOiBtZXNzYWdlLnR5cGUsXG5cdFx0XHRzZXNzaW9uX2NvbnRleHQ6IG1lc3NhZ2Uuc2Vzc2lvbl9jb250ZXh0LFxuXHRcdFx0dm9pY2U6IG1lc3NhZ2Uudm9pY2UsXG5cdFx0fSA6IG1lc3NhZ2UpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzdGFydF9zZXNzaW9uJyxcblx0XHRcdFx0c2Vzc2lvbl9jb250ZXh0OiB7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICdlbicgfSxcblx0XHRcdFx0dm9pY2U6ICdoYXJwZXJfbmV1dHJhbCcsXG5cdFx0XHR9LFxuXHRcdFx0eyB0eXBlOiAnc2V0X2xhbmd1YWdlJywgbGFuZ3VhZ2U6ICdmci1GUicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGVmZXJzIGEgbGFuZ3VhZ2UgdXBkYXRlIHVudGlsIHRoZSBzZXNzaW9uIHN0YXJ0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHsgJ2FnZW50cy52b2ljZS5sYW5ndWFnZSc6ICdhdXRvJyB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygnZW4tVVMnKSk7XG5cblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLmxhbmd1YWdlJywgJ2ZyJyk7XG5cdFx0ZmlyZUNvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvblNlcnZpY2UsICdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnKTtcblx0XHRzZXJ2aWNlLnNlbmRTdGFydFNlc3Npb24oeyBzZXNzaW9uczogW10sIGRpc3BsYXlfbG9jYWxlOiAnZW4tVVMnIH0sICdtYWNoaW5lJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNvY2tldCgpLnNlbnQubWFwKG1lc3NhZ2UgPT4gKHtcblx0XHRcdHR5cGU6IG1lc3NhZ2UudHlwZSxcblx0XHRcdHNlc3Npb25fY29udGV4dDogbWVzc2FnZS5zZXNzaW9uX2NvbnRleHQsXG5cdFx0fSkpLCBbe1xuXHRcdFx0dHlwZTogJ3N0YXJ0X3Nlc3Npb24nLFxuXHRcdFx0c2Vzc2lvbl9jb250ZXh0OiB7IHNlc3Npb25zOiBbXSwgZGlzcGxheV9sb2NhbGU6ICdmcicgfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHVwZGF0ZSB3aGlsZSBkaXNjb25uZWN0ZWQgYW5kIHJldGFpbnMgbGFuZ3VhZ2Ugb24gcmVzdW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe1xuXHRcdFx0J2FnZW50cy52b2ljZS5sYW5ndWFnZSc6ICdhdXRvJyxcblx0XHRcdCdhZ2VudHMudm9pY2Uudm9pY2UnOiAnZGFuaWVsX25ldXRyYWwnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCdlbi1VUycpKTtcblx0XHRjb25zdCBmaXJzdFNvY2tldCA9IHNvY2tldCgpO1xuXHRcdGZpcnN0U29ja2V0Lm9ubWVzc2FnZT8uKG5ldyBtYWluV2luZG93Lk1lc3NhZ2VFdmVudCgnbWVzc2FnZScsIHtcblx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHsgdHlwZTogJ3Nlc3Npb25faW5pdCcsIHNlc3Npb25faWQ6ICdzZXNzaW9uLTEnIH0pLFxuXHRcdH0pKTtcblx0XHRmaXJzdFNvY2tldC5yZWFkeVN0YXRlID0gV2ViU29ja2V0LkNMT1NFRDtcblxuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdhZ2VudHMudm9pY2UubGFuZ3VhZ2UnLCAnZGUtREUnKTtcblx0XHRmaXJlQ29uZmlndXJhdGlvbkNoYW5nZShjb25maWd1cmF0aW9uU2VydmljZSwgJ2FnZW50cy52b2ljZS5sYW5ndWFnZScpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCdlbi1VUycpKTtcblx0XHRzZXJ2aWNlLnNlbmRSZXN1bWVTZXNzaW9uKHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJ2VuLVVTJyB9LCAnbWFjaGluZScsICdLZWVwIHJlcGxpZXMgY29uY2lzZS4nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzY29ubmVjdGVkTWVzc2FnZXM6IGZpcnN0U29ja2V0LnNlbnQsXG5cdFx0XHRyZXN1bWVNZXNzYWdlczogc29ja2V0KCkuc2VudC5tYXAobWVzc2FnZSA9PiAoe1xuXHRcdFx0XHR0eXBlOiBtZXNzYWdlLnR5cGUsXG5cdFx0XHRcdHNlc3Npb25faWQ6IG1lc3NhZ2Uuc2Vzc2lvbl9pZCxcblx0XHRcdFx0c2Vzc2lvbl9jb250ZXh0OiBtZXNzYWdlLnNlc3Npb25fY29udGV4dCxcblx0XHRcdFx0dm9pY2U6IG1lc3NhZ2Uudm9pY2UsXG5cdFx0XHRcdHZvaWNlX2luc3RydWN0aW9uczogbWVzc2FnZS52b2ljZV9pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdGF1dG9fbmFycmF0ZTogbWVzc2FnZS5hdXRvX25hcnJhdGUsXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0ZGlzY29ubmVjdGVkTWVzc2FnZXM6IFtdLFxuXHRcdFx0cmVzdW1lTWVzc2FnZXM6IFt7XG5cdFx0XHRcdHR5cGU6ICdyZXN1bWVfc2Vzc2lvbicsXG5cdFx0XHRcdHNlc3Npb25faWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0XHRzZXNzaW9uX2NvbnRleHQ6IHsgc2Vzc2lvbnM6IFtdLCBkaXNwbGF5X2xvY2FsZTogJ2RlLURFJyB9LFxuXHRcdFx0XHR2b2ljZTogJ2p1bmhvX25ldXRyYWwnLFxuXHRcdFx0XHR2b2ljZV9pbnN0cnVjdGlvbnM6ICdLZWVwIHJlcGxpZXMgY29uY2lzZS4nLFxuXHRcdFx0XHRhdXRvX25hcnJhdGU6IGZhbHNlLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fkb3B0cyB0aGUgc2VydmVyIHNlc3Npb24gaWQgYW5kIGNsZWFycyBpc1Jlc3VtaW5nIG9uIHNlc3Npb25faW5pdCwgZXZlbiBhZnRlciBhIGZhaWxlZCByZXN1bWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0c29ja2V0KCkub25tZXNzYWdlPy4obmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywge1xuXHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAnc2Vzc2lvbl9pbml0Jywgc2Vzc2lvbl9pZDogJ3Nlc3Npb24tMScgfSksXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmN1cnJlbnRTZXNzaW9uSWQsICdzZXNzaW9uLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Jlc3VtaW5nLCBmYWxzZSk7XG5cblx0XHQvLyBTaW11bGF0ZSBhIHJlY29ubmVjdCBhdHRlbXB0OiB0aGUgc29ja2V0IG9wZW5zIChtYXJraW5nIHVzIGFzXG5cdFx0Ly8gcmVzdW1pbmcgdGhlIHByaW9yIHNlc3Npb24gaWQpIGJ1dCB0aGUgc2VydmVyIGNhbid0IHJlc3VtZSBhbmRcblx0XHQvLyBzdGFydHMgYSBicmFuZCBuZXcgc2Vzc2lvbiBpbnN0ZWFkLlxuXHRcdHNvY2tldCgpLm9ub3Blbj8uKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNSZXN1bWluZywgdHJ1ZSk7XG5cblx0XHRzb2NrZXQoKS5vbm1lc3NhZ2U/LihuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzZXNzaW9uX2luaXQnLCBzZXNzaW9uX2lkOiAnc2Vzc2lvbi0yJyB9KSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jdXJyZW50U2Vzc2lvbklkLCAnc2Vzc2lvbi0yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNSZXN1bWluZywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZG9wdHMgdGhlIHNlcnZlciBzZXNzaW9uIGlkIGFuZCBjbGVhcnMgaXNSZXN1bWluZyBvbiBzZXNzaW9uX3Jlc3VtZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0c29ja2V0KCkub25tZXNzYWdlPy4obmV3IG1haW5XaW5kb3cuTWVzc2FnZUV2ZW50KCdtZXNzYWdlJywge1xuXHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkoeyB0eXBlOiAnc2Vzc2lvbl9pbml0Jywgc2Vzc2lvbl9pZDogJ3Nlc3Npb24tMScgfSksXG5cdFx0fSkpO1xuXHRcdHNvY2tldCgpLm9ub3Blbj8uKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNSZXN1bWluZywgdHJ1ZSk7XG5cblx0XHRzb2NrZXQoKS5vbm1lc3NhZ2U/LihuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzZXNzaW9uX3Jlc3VtZWQnLCBzZXNzaW9uX2lkOiAnc2Vzc2lvbi0xJyB9KSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jdXJyZW50U2Vzc2lvbklkLCAnc2Vzc2lvbi0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNSZXN1bWluZywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNldHMgaXNSZXN1bWluZyBvbiBjbGVhbnVwICh0ZXJtaW5hbCBkaXNjb25uZWN0KScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblx0XHRzb2NrZXQoKS5vbm1lc3NhZ2U/LihuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzZXNzaW9uX2luaXQnLCBzZXNzaW9uX2lkOiAnc2Vzc2lvbi0xJyB9KSxcblx0XHR9KSk7XG5cdFx0c29ja2V0KCkub25vcGVuPy4oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pc1Jlc3VtaW5nLCB0cnVlKTtcblxuXHRcdHNvY2tldCgpLm9uY2xvc2U/LihuZXcgbWFpbldpbmRvdy5DbG9zZUV2ZW50KCdjbG9zZScsIHsgY29kZTogMTAwMCwgd2FzQ2xlYW46IHRydWUgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaXNSZXN1bWluZywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmN1cnJlbnRTZXNzaW9uSWQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgd2hlbiBhbiBhYm5vcm1hbCBjbG9zZSBoYXMgc2NoZWR1bGVkIGEgcmVjb25uZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdHNvY2tldCgpLm9ub3Blbj8uKCk7XG5cblx0XHRzb2NrZXQoKS5vbmNsb3NlPy4obmV3IG1haW5XaW5kb3cuQ2xvc2VFdmVudCgnY2xvc2UnLCB7IGNvZGU6IDQwMDAgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uud2lsbFJlY29ubmVjdCwgdHJ1ZSk7XG5cdFx0c2VydmljZS5kaXNjb25uZWN0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2Uud2lsbFJlY29ubmVjdCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmVhdHMgYSByZWdpc3RyeSBmYXRhbCBjb2RlIGFzIHRlcm1pbmFsIGFuZCBkb2VzIG5vdCByZWNvbm5lY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmF0YWw6IElWb2ljZUZhdGFsRGlzY29ubmVjdFtdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25GYXRhbERpc2Nvbm5lY3QoZXZlbnQgPT4gZmF0YWwucHVzaChldmVudCkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdGNvbnN0IHdlYlNvY2tldCA9IHNvY2tldCgpO1xuXHRcdHdlYlNvY2tldC5vbm9wZW4/LigpO1xuXHRcdHdlYlNvY2tldC5vbmNsb3NlPy4obmV3IG1haW5XaW5kb3cuQ2xvc2VFdmVudCgnY2xvc2UnLCB7XG5cdFx0XHRjb2RlOiA0MDAzLFxuXHRcdFx0cmVhc29uOiAnVm9pY2UgTW9kZSBuZWVkcyBhIHZlcmlmaWVkIEBtaWNyb3NvZnQuY29tIGVtYWlsJyxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmF0YWwubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmF0YWxbMF0uY29kZSwgNDAwMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhdGFsWzBdLmtpbmQsICdmYXRhbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXRhbFswXS5yZWFzb24sICdWb2ljZSBNb2RlIG5lZWRzIGEgdmVyaWZpZWQgQG1pY3Jvc29mdC5jb20gZW1haWwnKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBhIGNsZWFuIGNsb3NlIGFzIHRlcm1pbmFsIHNvIHRoZSBVSSBjYW5ub3Qgc3RyYW5kIG9uIFJlY29ubmVjdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBmYXRhbDogSVZvaWNlRmF0YWxEaXNjb25uZWN0W10gPSBbXTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5vbkZhdGFsRGlzY29ubmVjdChldmVudCA9PiBmYXRhbC5wdXNoKGV2ZW50KSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0Y29uc3Qgd2ViU29ja2V0ID0gc29ja2V0KCk7XG5cdFx0d2ViU29ja2V0Lm9ub3Blbj8uKCk7XG5cdFx0d2ViU29ja2V0Lm9uY2xvc2U/LihuZXcgbWFpbldpbmRvdy5DbG9zZUV2ZW50KCdjbG9zZScsIHsgY29kZTogMTAwMSwgcmVhc29uOiAnU2Vzc2lvbiBpZGxlIHRpbWVvdXQnIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXRhbC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXRhbFswXS5raW5kLCAnZXhwZWN0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgcmVjb25uZWN0aW5nIGZvciBhIHRyYW5zaWVudCByZWdpc3RyeSBjb2RlIGJ1dCBzYXlzIHdoeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBmYXRhbDogSVZvaWNlRmF0YWxEaXNjb25uZWN0W10gPSBbXTtcblx0XHRjb25zdCBpc3N1ZXM6IElWb2ljZUNvbm5lY3Rpb25Jc3N1ZVtdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25GYXRhbERpc2Nvbm5lY3QoZXZlbnQgPT4gZmF0YWwucHVzaChldmVudCkpKTtcblx0XHRzdG9yZS5hZGQoc2VydmljZS5vbkNvbm5lY3Rpb25Jc3N1ZShldmVudCA9PiBpc3N1ZXMucHVzaChldmVudCkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdGNvbnN0IHdlYlNvY2tldCA9IHNvY2tldCgpO1xuXHRcdHdlYlNvY2tldC5vbm9wZW4/LigpO1xuXHRcdHdlYlNvY2tldC5vbmNsb3NlPy4obmV3IG1haW5XaW5kb3cuQ2xvc2VFdmVudCgnY2xvc2UnLCB7IGNvZGU6IDQ1MDMsIHJlYXNvbjogJ0Nhbm5vdCByZWFjaCBHaXRIdWInIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXRhbC5sZW5ndGgsIDAsICdhIHRyYW5zaWVudCBjb2RlIG11c3Qgbm90IGJlIHRlcm1pbmFsJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpc3N1ZXMsIFt7IGNvZGU6IDQ1MDMsIHJlYXNvbjogJ0Nhbm5vdCByZWFjaCBHaXRIdWInIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnYSByZWplY3RlZCBjb25uZWN0aW9uIGRvZXMgbm90IHJlZmlsbCB0aGUgcmVjb25uZWN0IGJ1ZGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCByZWNvbm5lY3QgPSBSZWZsZWN0LmdldChzZXJ2aWNlLCAnX2Nvbm5lY3RXZWJTb2NrZXQnKSBhcyAoKSA9PiB2b2lkO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXG5cdFx0c29ja2V0KCkub25vcGVuPy4oKTtcblx0XHRzb2NrZXQoKS5vbmNsb3NlPy4obmV3IG1haW5XaW5kb3cuQ2xvc2VFdmVudCgnY2xvc2UnLCB7IGNvZGU6IDQ1MDMsIHJlYXNvbjogJ0dpdEh1YicgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChSZWZsZWN0LmdldChzZXJ2aWNlLCAnX3JlY29ubmVjdEF0dGVtcHRzJyksIDEpO1xuXG5cdFx0cmVjb25uZWN0LmNhbGwoc2VydmljZSk7XG5cdFx0c29ja2V0KCkub25vcGVuPy4oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoUmVmbGVjdC5nZXQoc2VydmljZSwgJ19yZWNvbm5lY3RBdHRlbXB0cycpLCAxLCAnb25vcGVuIG11c3Qgbm90IHJlc2V0IHRoZSBidWRnZXQnKTtcblxuXHRcdHNvY2tldCgpLm9uY2xvc2U/LihuZXcgbWFpbldpbmRvdy5DbG9zZUV2ZW50KCdjbG9zZScsIHsgY29kZTogNDUwMywgcmVhc29uOiAnR2l0SHViJyB9KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFJlZmxlY3QuZ2V0KHNlcnZpY2UsICdfcmVjb25uZWN0QXR0ZW1wdHMnKSwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgcmVjb3ZlcmFibGUgY2xvc2UgcmVwb3J0cyBpdHMgcmVhc29uIGFmdGVyIHRoZSBkaXNjb25uZWN0IGlzIHZpc2libGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb3JkZXI6IHN0cmluZ1tdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUoY29ubmVjdGVkID0+IG9yZGVyLnB1c2goYGNvbm5lY3RlZDoke2Nvbm5lY3RlZH1gKSkpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLm9uQ29ubmVjdGlvbklzc3VlKGUgPT4gb3JkZXIucHVzaChgaXNzdWU6JHtlLnJlYXNvbn1gKSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jb25uZWN0KGNyZWF0ZVRlc3RXaW5kb3coKSk7XG5cdFx0c29ja2V0KCkub25vcGVuPy4oKTtcblx0XHRzb2NrZXQoKS5vbmNsb3NlPy4obmV3IG1haW5XaW5kb3cuQ2xvc2VFdmVudCgnY2xvc2UnLCB7IGNvZGU6IDQ1MDMsIHJlYXNvbjogJ0Nhbm5vdCByZWFjaCBHaXRIdWInIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3JkZXIsIFsnY29ubmVjdGVkOnRydWUnLCAnY29ubmVjdGVkOmZhbHNlJywgJ2lzc3VlOkNhbm5vdCByZWFjaCBHaXRIdWInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgY29uZmlybWVkIHNlc3Npb24gcmVzZXRzIHRoZSByZWNvbm5lY3QgYnVkZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXHRcdGNvbnN0IHdlYlNvY2tldCA9IHNvY2tldCgpO1xuXHRcdHdlYlNvY2tldC5vbm9wZW4/LigpO1xuXHRcdHdlYlNvY2tldC5vbmNsb3NlPy4obmV3IG1haW5XaW5kb3cuQ2xvc2VFdmVudCgnY2xvc2UnLCB7IGNvZGU6IDQ1MDMsIHJlYXNvbjogJ0dpdEh1YicgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChSZWZsZWN0LmdldChzZXJ2aWNlLCAnX3JlY29ubmVjdEF0dGVtcHRzJyksIDEpO1xuXG5cdFx0KFJlZmxlY3QuZ2V0KHNlcnZpY2UsICdfY29ubmVjdFdlYlNvY2tldCcpIGFzICgpID0+IHZvaWQpLmNhbGwoc2VydmljZSk7XG5cdFx0c29ja2V0KCkub25vcGVuPy4oKTtcblx0XHRzb2NrZXQoKS5vbm1lc3NhZ2U/LihuZXcgbWFpbldpbmRvdy5NZXNzYWdlRXZlbnQoJ21lc3NhZ2UnLCB7XG5cdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeSh7IHR5cGU6ICdzZXNzaW9uX2luaXQnLCBzZXNzaW9uX2lkOiAnc2Vzc2lvbi0xJyB9KSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoUmVmbGVjdC5nZXQoc2VydmljZSwgJ19yZWNvbm5lY3RBdHRlbXB0cycpLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBhIG1pc3NpbmcgYmFja2VuZCBVUkwgaW5zdGVhZCBvZiBmYWlsaW5nIHNpbGVudGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb2R1Y3RXaXRob3V0VXJsOiBJUHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgLi4ucHJvZHVjdCwgdm9pY2VXc1VybDogJycgfTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe30pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFZvaWNlQ2xpZW50U2VydmljZShjb25maWd1cmF0aW9uU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHByb2R1Y3RXaXRob3V0VXJsKSk7XG5cdFx0Y29uc3QgZmF0YWw6IElWb2ljZUZhdGFsRGlzY29ubmVjdFtdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25GYXRhbERpc2Nvbm5lY3QoZXZlbnQgPT4gZmF0YWwucHVzaChldmVudCkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY29ubmVjdChjcmVhdGVUZXN0V2luZG93KCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhdGFsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhdGFsWzBdLmNsaWVudFNpZGUsIHRydWUpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ2dpdmVzIHVwIGFmdGVyIHRoZSByZWNvbm5lY3QgYnVkZ2V0IHJhdGhlciB0aGFuIHJldHJ5aW5nIGZvciBtaW51dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSBidWRnZXQgaXMgZGVsaWJlcmF0ZWx5IHNob3J0OiBhIHVzZXIgd2F0Y2hpbmcgYSByZWNvbm5lY3Qgd291bGQgcmF0aGVyXG5cdFx0Ly8gYmUgdG9sZCBpdCBmYWlsZWQgdGhhbiB3YWl0LiBQaW4gaXQgc28gaXQgY2Fubm90IHNpbGVudGx5IGdyb3cgYWdhaW4uXG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmF0YWw6IElWb2ljZUZhdGFsRGlzY29ubmVjdFtdID0gW107XG5cdFx0c3RvcmUuYWRkKHNlcnZpY2Uub25GYXRhbERpc2Nvbm5lY3QoZXZlbnQgPT4gZmF0YWwucHVzaChldmVudCkpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNvbm5lY3QoY3JlYXRlVGVzdFdpbmRvdygpKTtcblxuXHRcdGNvbnN0IHJlY29ubmVjdCA9IFJlZmxlY3QuZ2V0KHNlcnZpY2UsICdfY29ubmVjdFdlYlNvY2tldCcpIGFzICgpID0+IHZvaWQ7XG5cdFx0Y29uc3Qgc3RhcnRlZCA9IERhdGUubm93KCkgLSA2MV8wMDA7XG5cdFx0UmVmbGVjdC5zZXQoc2VydmljZSwgJ19yZWNvbm5lY3RTdGFydGVkQXQnLCBzdGFydGVkKTtcblxuXHRcdHNvY2tldCgpLm9ub3Blbj8uKCk7XG5cdFx0c29ja2V0KCkub25jbG9zZT8uKG5ldyBtYWluV2luZG93LkNsb3NlRXZlbnQoJ2Nsb3NlJywgeyBjb2RlOiA0NTAzLCByZWFzb246ICdHaXRIdWInIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXRhbC5sZW5ndGgsIDEsICdhbiBleGhhdXN0ZWQgYnVkZ2V0IG11c3QgcmVwb3J0IGl0c2VsZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYXRhbFswXS5raW5kLCAnZmF0YWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS53aWxsUmVjb25uZWN0LCBmYWxzZSwgJ25vIHJldHJ5IG1heSByZW1haW4gc2NoZWR1bGVkJyk7XG5cdFx0dm9pZCByZWNvbm5lY3Q7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUMvQixPQUFPLGFBQWE7QUFFcEIsU0FBUywrQkFBK0IsMEJBQTBCO0FBQ2xFLFNBQWdMLDhCQUE4QjtBQUU5TSxNQUFNLGNBQWM7QUFBQSxFQVVuQixjQUFjO0FBUGQsc0JBQXFCLFVBQVU7QUFDL0IsU0FBUyxPQUFrQyxDQUFDO0FBQzVDLGtCQUE4QjtBQUM5QixxQkFBb0Q7QUFDcEQsbUJBQStCO0FBQy9CLG1CQUFnRDtBQUcvQyxrQkFBYyxXQUFXO0FBQUEsRUFDMUI7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLGFBQWEsVUFBVTtBQUFBLEVBQzdCO0FBQUEsRUFFQSxLQUFLLE1BQW9CO0FBQ3hCLFNBQUssS0FBSyxLQUFLLEtBQUssTUFBTSxJQUFJLENBQTRCO0FBQUEsRUFDM0Q7QUFDRDtBQUVBLFNBQVMsaUJBQWlCLFdBQVcsU0FBcUM7QUFDekUsU0FBTyxJQUFJLE1BQU0sWUFBWTtBQUFBLElBQzVCLElBQUksUUFBUSxVQUFVLFVBQVU7QUFDL0IsVUFBSSxhQUFhLGFBQWE7QUFDN0IsZUFBTztBQUFBLE1BQ1I7QUFHQSxVQUFJLGFBQWEsaUJBQWlCLGFBQWEsaUJBQWlCO0FBQy9ELGVBQU8sT0FBTyxRQUFRLEVBQUUsS0FBSyxNQUFNO0FBQUEsTUFDcEM7QUFDQSxVQUFJLGFBQWEsYUFB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
