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
import * as dom from "../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../base/browser/formattedTextRenderer.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { FileAccess } from "../../../../base/common/network.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID } from "../../chat/browser/actions/configureVoiceInstructionsAction.js";
import { ChatInputOnboarding } from "../../chat/browser/widget/input/chatInputOnboarding.js";
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from "../../chat/browser/widget/input/chatInputNoticeWidget.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable, asCssVariableWithDefault, selectBackground, selectListBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { AgentsVoiceStorageKeys } from "../common/agentsVoice.js";
import { buildMicrophoneOptions, indexOfMicrophone } from "../../chat/browser/speechToText/dictationOnboarding.js";
import "./media/voiceModeOnboarding.css";
const VOICE_SETTING = "agents.voice.voice";
const VOICE_LANGUAGE_SETTING = "agents.voice.language";
const VOICE_SETTINGS_COMMAND = "agentsVoice.openSettings";
const VOICES = [
  {
    id: "birch_neutral",
    sampleId: "maya_neutral",
    label: localize("voiceMode.onboarding.voice.birch", "Birch (Default)"),
    // Flowing mid-range: even spread, gentle drift.
    signature: [
      { frequency: 1, amplitude: 0.42, speed: 0.42, phase: 0 },
      { frequency: 1.7, amplitude: 0.26, speed: -0.31, phase: 1.1 },
      { frequency: 2.6, amplitude: 0.19, speed: 0.24, phase: 2.4 },
      { frequency: 4.1, amplitude: 0.13, speed: -0.18, phase: 0.7 }
    ]
  },
  {
    id: "harper_neutral",
    sampleId: "victoria_neutral",
    label: localize("voiceMode.onboarding.voice.harper", "Harper"),
    // Bright and quick: higher frequencies, tighter ripple.
    signature: [
      { frequency: 1.4, amplitude: 0.38, speed: 0.52, phase: 0 },
      { frequency: 2.3, amplitude: 0.27, speed: -0.38, phase: 1.1 },
      { frequency: 3.6, amplitude: 0.21, speed: 0.3, phase: 2.4 },
      { frequency: 5.2, amplitude: 0.14, speed: -0.22, phase: 0.7 }
    ]
  },
  {
    id: "oak_neutral",
    sampleId: "kevin_neutral",
    label: localize("voiceMode.onboarding.voice.oak", "Oak"),
    // Low and broad: long swells with little high-frequency detail.
    signature: [
      { frequency: 0.7, amplitude: 0.48, speed: 0.3, phase: 0.4 },
      { frequency: 1.2, amplitude: 0.28, speed: -0.22, phase: 1.7 },
      { frequency: 2, amplitude: 0.16, speed: 0.18, phase: 0.9 },
      { frequency: 3.1, amplitude: 0.09, speed: -0.14, phase: 2.2 }
    ]
  },
  {
    id: "junho_neutral",
    sampleId: "daniel_neutral",
    label: localize("voiceMode.onboarding.voice.junho", "Junho"),
    // Steady and measured: slow drift, calm regular crests.
    signature: [
      { frequency: 0.9, amplitude: 0.44, speed: 0.24, phase: 1.3 },
      { frequency: 1.5, amplitude: 0.3, speed: -0.18, phase: 0.2 },
      { frequency: 2.4, amplitude: 0.14, speed: 0.15, phase: 2 },
      { frequency: 3.4, amplitude: 0.1, speed: -0.12, phase: 1.5 }
    ]
  }
];
const LOCALIZED_VOICES = {
  de: { id: "de_marc_neutral", label: localize("voiceMode.onboarding.voice.marc", "Marc") },
  es: { id: "es-ES_maria_neutral", label: localize("voiceMode.onboarding.voice.maria", "Maria") },
  fr: { id: "fr_david_neutral", label: localize("voiceMode.onboarding.voice.david", "David") },
  it: { id: "it_eva_neutral", label: localize("voiceMode.onboarding.voice.eva", "Eva") },
  ja: { id: "ja_aruha_neutral", label: localize("voiceMode.onboarding.voice.aruha", "Aruha") },
  ko: { id: "ko_jiyon_neutral", label: localize("voiceMode.onboarding.voice.jiyon", "Jiyon") },
  pt: { id: "pt-BR_gil_neutral", label: localize("voiceMode.onboarding.voice.gil", "Gil") },
  zh: { id: "zh_wuzhi_neutral", label: localize("voiceMode.onboarding.voice.wuzhi", "Wuzhi") }
};
function localizedVoiceForLanguage(language) {
  try {
    const canonical = Intl.getCanonicalLocales(language.trim())[0];
    const base = canonical?.split("-")[0].toLowerCase();
    return base ? LOCALIZED_VOICES[base] : void 0;
  } catch {
    return void 0;
  }
}
const RESTING_SIGNATURE = VOICES[0].signature.map((_, index) => {
  const components = VOICES.map((voice) => voice.signature[index]);
  const mean = (pick) => components.reduce((sum, wave) => sum + pick(wave), 0) / components.length;
  return {
    frequency: mean((wave) => wave.frequency),
    amplitude: mean((wave) => wave.amplitude),
    speed: mean((wave) => wave.speed),
    phase: mean((wave) => wave.phase)
  };
});
const IDLE_CYCLE_SECONDS = 2.6;
const WAVE_TEMPO = 2 * Math.PI / IDLE_CYCLE_SECONDS / Math.abs(RESTING_SIGNATURE[0].speed);
const IDLE_GAIN = 0.5;
const SPEAKING_GAIN = 0.45;
const IDLE_MOTION = 0.2;
const SPEAKING_MOTION = 0.8;
const LEVEL_EASING = 0.08;
const SIGNATURE_EASING = 0.06;
const REFERENCE_FRAME_SECONDS = 1 / 60;
const BAR_WIDTH = 1;
const BAR_GAP = 2;
const BAR_MIN = 1;
function cloneSignature(signature) {
  return signature.map((wave) => ({ ...wave, oscillation: 0 }));
}
function easingFactor(perFrameEasing, dt) {
  return 1 - Math.pow(1 - perFrameEasing, dt / REFERENCE_FRAME_SECONDS);
}
function easeSignature(current, target, factor) {
  for (let i = 0; i < current.length && i < target.length; i++) {
    current[i].frequency += (target[i].frequency - current[i].frequency) * factor;
    current[i].amplitude += (target[i].amplitude - current[i].amplitude) * factor;
    current[i].speed += (target[i].speed - current[i].speed) * factor;
    current[i].phase += (target[i].phase - current[i].phase) * factor;
  }
}
function advanceOscillation(waves, dt) {
  const tau = 2 * Math.PI;
  for (const wave of waves) {
    wave.oscillation = (wave.oscillation + wave.speed * WAVE_TEMPO * dt) % tau;
  }
}
function drawBars(context, width, height, waves, gain) {
  const pitch = BAR_WIDTH + BAR_GAP;
  const count = Math.max(1, Math.floor(width / pitch));
  const inset = (width - (count * pitch - BAR_GAP)) / 2;
  const centerY = height / 2;
  const maxHalf = height / 2;
  for (let index = 0; index < count; index++) {
    const position = count > 1 ? index / (count - 1) : 0;
    const amount = bandFraction(position, waves) * gain;
    const half = Math.max(BAR_MIN / 2, Math.min(maxHalf, amount * maxHalf));
    context.beginPath();
    context.roundRect(inset + index * pitch, centerY - half, BAR_WIDTH, half * 2, BAR_WIDTH / 2);
    context.fill();
  }
}
function bandFraction(position, waves) {
  let amplitude = 0;
  let total = 0;
  for (const wave of waves) {
    const phase = position * wave.frequency * Math.PI * 2 + wave.oscillation + wave.phase;
    amplitude += (0.5 + 0.5 * Math.sin(phase)) * wave.amplitude;
    total += wave.amplitude;
  }
  if (total === 0) {
    return 0;
  }
  const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, position)));
  return amplitude / total * (0.35 + 0.65 * taper);
}
let VoiceModeOnboardingAnimator = class extends Disposable {
  constructor(canvas, container, source, themeService, accessibilityService) {
    super();
    this.canvas = canvas;
    this.container = container;
    this.source = source;
    this.themeService = themeService;
    this.accessibilityService = accessibilityService;
    this.animationFrame = this._register(new MutableDisposable());
    this.width = 0;
    this.height = 0;
    this.running = false;
    this.suspended = false;
    this.level = 0;
    /**
     * The stroke colour, taken from the canvas's own computed `color` so CSS
     * owns the tier and theme overrides work for free - the same `currentColor`
     * arrangement the toolbar waveform uses. Cached rather than read per frame:
     * `getComputedStyle` inside the animation loop forces a style recalculation
     * on every tick.
     */
    this.stroke = "";
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create the Voice Mode onboarding canvas context");
    }
    this.context = context;
    this.waves = cloneSignature(this.source.getSignature());
    const targetWindow = dom.getWindow(container);
    const observer = new targetWindow.ResizeObserver(() => this.resize());
    observer.observe(container);
    this._register(toDisposable(() => observer.disconnect()));
    this._register(this.themeService.onDidColorThemeChange(() => {
      this.readStroke();
      this.draw(targetWindow.performance.now());
    }));
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => this.updateMotion()));
    this._register(toDisposable(() => this.stop()));
    this.readStroke();
    this.resize();
    this.updateMotion();
  }
  readStroke() {
    this.stroke = dom.getWindow(this.canvas).getComputedStyle(this.canvas).color;
  }
  updateMotion() {
    if (this.suspended || this.accessibilityService.isMotionReduced()) {
      this.stop();
      this.draw(dom.getWindow(this.container).performance.now());
    } else {
      this.start();
    }
  }
  /**
   * Pause while the card is put away for higher-precedence content, so an
   * invisible introduction is not still painting every frame.
   */
  setSuspended(suspended) {
    if (this.suspended === suspended) {
      return;
    }
    this.suspended = suspended;
    this.updateMotion();
  }
  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    const targetWindow = dom.getWindow(this.container);
    const tick = (time) => {
      if (!this.running) {
        return;
      }
      this.draw(time);
      this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => tick(targetWindow.performance.now()));
    };
    this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => tick(targetWindow.performance.now()));
  }
  stop() {
    this.running = false;
    this.animationFrame.clear();
  }
  resize() {
    const targetWindow = dom.getWindow(this.container);
    const devicePixelRatio = targetWindow.devicePixelRatio || 1;
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    if (!this.width || !this.height) {
      return;
    }
    this.canvas.width = this.width * devicePixelRatio;
    this.canvas.height = this.height * devicePixelRatio;
    this.context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.draw(targetWindow.performance.now());
  }
  draw(timestamp) {
    if (!this.width || !this.height) {
      return;
    }
    const dt = this.lastTimestamp === void 0 ? 0 : Math.max(0, (timestamp - this.lastTimestamp) * 1e-3);
    this.lastTimestamp = timestamp;
    this.level += (this.source.getLevel() - this.level) * easingFactor(LEVEL_EASING, dt);
    easeSignature(this.waves, this.source.getSignature(), easingFactor(SIGNATURE_EASING, dt));
    advanceOscillation(this.waves, dt * (IDLE_MOTION + this.level * SPEAKING_MOTION));
    const gain = IDLE_GAIN + this.level * SPEAKING_GAIN;
    this.context.clearRect(0, 0, this.width, this.height);
    this.context.fillStyle = this.stroke;
    drawBars(this.context, this.width, this.height, this.waves, gain);
  }
};
VoiceModeOnboardingAnimator = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IAccessibilityService)
], VoiceModeOnboardingAnimator);
let VoiceSamplePlayer = class extends Disposable {
  constructor(element, audioFactory, logService) {
    super();
    this.element = element;
    this.audioFactory = audioFactory;
    this.logService = logService;
    this.playback = this._register(new MutableDisposable());
    this._onDidChangePlayingVoice = this._register(new Emitter());
    /** Fires with the voice currently being heard, or `undefined` once it stops. */
    this.onDidChangePlayingVoice = this._onDidChangePlayingVoice.event;
    this._register(toDisposable(() => this.stop()));
  }
  get playingVoice() {
    return this._playingVoice;
  }
  /**
   * Current loudness of the sample being played, `0` when silent. The waveform
   * reads this so it moves to the voice the user is actually hearing.
   */
  getLevel() {
    if (!this.analyser || !this.levels || !this._playingVoice) {
      return 0;
    }
    this.analyser.getByteTimeDomainData(this.levels);
    let sum = 0;
    for (const sample of this.levels) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    return Math.min(1, Math.sqrt(sum / this.levels.length) * 3.2);
  }
  play(sampleId, playingVoice = sampleId) {
    this.stop();
    try {
      const audio = this.ensureAudio();
      audio.src = FileAccess.asBrowserUri(`vs/workbench/contrib/agentsVoice/browser/media/${sampleId}.mp3`).toString(true);
      const store = new DisposableStore();
      store.add(dom.addDisposableListener(audio, "ended", () => this.stop()));
      store.add(dom.addDisposableListener(audio, "error", () => this.stop()));
      store.add(toDisposable(() => audio.pause()));
      this.playback.value = store;
      this.setPlayingVoice(playingVoice);
      audio.play().catch((error) => {
        this.logService.trace(`[voice] Voice Mode onboarding preview failed: ${error}`);
        this.stop();
      });
    } catch (error) {
      this.logService.trace(`[voice] Voice Mode onboarding preview unavailable: ${error}`);
      this.stop();
    }
  }
  /**
   * Build the audio element and, best-effort, the analyser graph feeding the
   * waveform. Analysis is a nicety: if the Web Audio graph cannot be created
   * the sample still plays, the waveform just keeps its idle motion.
   */
  ensureAudio() {
    if (this.audio) {
      return this.audio;
    }
    const targetWindow = dom.getWindow(this.element);
    const audio = this.audioFactory?.() ?? new targetWindow.Audio();
    this.audio = audio;
    this._register(toDisposable(() => {
      audio.pause();
      audio.src = "";
    }));
    try {
      const context = new targetWindow.AudioContext();
      this._register(toDisposable(() => void context.close().catch(() => {
      })));
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaElementSource(audio).connect(analyser);
      analyser.connect(context.destination);
      this.analyser = analyser;
      this.levels = new Uint8Array(analyser.fftSize);
    } catch (error) {
      this.logService.trace(`[voice] Voice Mode onboarding analyser unavailable: ${error}`);
    }
    return audio;
  }
  stop() {
    this.playback.clear();
    this.setPlayingVoice(void 0);
  }
  setPlayingVoice(voiceId) {
    if (this._playingVoice === voiceId) {
      return;
    }
    this._playingVoice = voiceId;
    this._onDidChangePlayingVoice.fire(voiceId);
  }
};
VoiceSamplePlayer = __decorateClass([
  __decorateParam(2, ILogService)
], VoiceSamplePlayer);
let VoiceModeOnboardingBanner = class extends ChatInputNoticeWidget {
  constructor(options, commandService, configurationService, contextViewService, instantiationService, logService, storageService, telemetryService) {
    super({
      container: options.container,
      variant: ChatInputNoticeVariant.Onboarding,
      className: "voice-mode-onboarding-banner",
      ariaLabel: localize("voiceMode.onboarding.region", "Voice Mode introduction"),
      ariaDescription: localize("voiceMode.onboarding.regionDescription", "Choose how your agent speaks to you. Adjust settings anytime."),
      onEscape: () => {
        this.logAction("escape");
        this.options.onDismiss();
      }
    });
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.contextViewService = contextViewService;
    this.logService = logService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this.microphonePicker = this._register(new MutableDisposable());
    this.microphoneOptions = [];
    this.voiceElements = /* @__PURE__ */ new Map();
    /** Listeners for the current set of voice chips, cleared when they re-render. */
    this.voicesDisposables = this._register(new DisposableStore());
    this.options = options;
    this.localizedVoice = localizedVoiceForLanguage(this.resolveSpokenLanguage());
    this.player = this._register(instantiationService.createInstance(VoiceSamplePlayer, this.domNode, options.audioFactory));
    this._register(this.player.onDidChangePlayingVoice((voiceId) => this.updatePlaying(voiceId)));
    const copy = dom.append(this.domNode, dom.$(".voice-mode-onboarding-copy"));
    const title = dom.append(copy, dom.$(".chat-input-notice-title.voice-mode-onboarding-title"));
    title.textContent = localize("voiceMode.onboarding.title", "Welcome to Voice Mode");
    this.renderDescription(copy);
    this.renderSharedWaveform(instantiationService);
    this.renderMicrophonePicker();
    const actions = dom.append(this.domNode, dom.$(".voice-mode-onboarding-actions"));
    this.voicesContainer = actions;
    this.renderVoices();
    this.renderClose();
    this.logAction("shown");
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(VOICE_LANGUAGE_SETTING)) {
        this.updateForLanguage();
      }
    }));
  }
  /**
   * The signature the shared trace should be showing: the selected voice's, or
   * {@link RESTING_SIGNATURE} before anything has been chosen.
   */
  currentSignature() {
    return this.selectedVoice?.signature ?? RESTING_SIGNATURE;
  }
  /** The single full-width trace the whole card shares. */
  renderSharedWaveform(instantiationService) {
    const wave = dom.append(this.domNode, dom.$(".voice-mode-onboarding-wave"));
    const canvas = dom.append(wave, dom.$("canvas.voice-mode-onboarding-canvas"));
    canvas.setAttribute("aria-hidden", "true");
    this.animator = this._register(instantiationService.createInstance(VoiceModeOnboardingAnimator, canvas, wave, {
      getLevel: () => this.player.getLevel(),
      getSignature: () => this.currentSignature()
    }));
  }
  renderMicrophonePicker() {
    this.microphonePickerContainer = dom.append(this.domNode, dom.$(".chat-input-notice-picker.voice-mode-onboarding-microphone-picker"));
    this.microphoneOptions = [{
      deviceId: "",
      label: localize("voiceMode.onboarding.systemDefault", "System default")
    }];
    this.updateMicrophonePicker();
    const mediaDevices = dom.getWindow(this.domNode).navigator.mediaDevices;
    if (mediaDevices) {
      this._register(dom.addDisposableListener(mediaDevices, "devicechange", () => void this.refreshMicrophones()));
      void this.refreshMicrophones();
    }
  }
  async refreshMicrophones() {
    const mediaDevices = dom.getWindow(this.domNode).navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) {
      return;
    }
    let devices;
    try {
      devices = await mediaDevices.enumerateDevices();
    } catch (error) {
      this.logService.trace(`[voice] could not enumerate microphones: ${error}`);
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    const options = buildMicrophoneOptions(devices);
    if (options.length > 1 && !devices.some((device) => device.kind === "audioinput" && device.label)) {
      return;
    }
    this.microphoneOptions = options;
    this.updateMicrophonePicker();
  }
  updateMicrophonePicker() {
    if (!this.microphonePickerContainer) {
      return;
    }
    this.microphonePicker.clear();
    dom.clearNode(this.microphonePickerContainer);
    this.microphonePickerContainer.hidden = this.microphoneOptions.length <= 1;
    if (this.microphonePickerContainer.hidden) {
      return;
    }
    dom.append(this.microphonePickerContainer, dom.$(`span.codicon.codicon-${Codicon.mic.id}.voice-mode-onboarding-microphone-icon`)).setAttribute("aria-hidden", "true");
    const selected = indexOfMicrophone(this.microphoneOptions, this.currentMicrophoneId());
    const store = new DisposableStore();
    const selectBox = store.add(new SelectBox(
      this.microphoneOptions.map((option) => ({ text: option.label })),
      selected,
      this.contextViewService,
      {
        ...defaultSelectBoxStyles,
        selectBackground: void 0,
        selectBorder: void 0,
        selectForeground: void 0,
        selectListBackground: asCssVariableWithDefault(selectListBackground, asCssVariable(selectBackground))
      },
      { ariaLabel: localize("voiceMode.onboarding.microphone", "Microphone"), useCustomDrawn: true }
    ));
    selectBox.render(this.microphonePickerContainer);
    store.add(selectBox.onDidSelect((event) => this.selectMicrophone(event.index)));
    this.microphonePicker.value = store;
  }
  currentMicrophoneId() {
    return this.storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION, "");
  }
  selectMicrophone(index) {
    const option = this.microphoneOptions[index];
    if (!option) {
      return;
    }
    this.logAction("selectMicrophone");
    if (option.deviceId) {
      this.storageService.store(AgentsVoiceStorageKeys.MicrophoneDevice, option.deviceId, StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
    }
    status(localize("voiceMode.onboarding.microphoneSelected", "{0} selected.", option.label));
  }
  /**
   * The voices as real buttons - border, hover lift, pressed feedback -
   * because bare text gave no sign it could be clicked at all. In a language
   * Voice Mode speaks natively there is only one voice, so the card previews
   * that voice instead of offering the English chooser.
   *
   * Re-entrant: clears any previously rendered chips so the card can rebuild
   * them when the spoken language changes.
   */
  renderVoices() {
    const container = this.voicesContainer;
    if (!container) {
      return;
    }
    this.voicesDisposables.clear();
    this.voiceElements.clear();
    dom.clearNode(container);
    const labelText = localize("voiceMode.onboarding.voices", "Agent Voice:");
    const label = dom.append(container, dom.$(".voice-mode-onboarding-voices-label"));
    label.textContent = labelText;
    if (this.localizedVoice) {
      this.renderLocalizedVoice(container, labelText, this.localizedVoice);
      return;
    }
    const group = dom.append(container, dom.$(".voice-mode-onboarding-voices"));
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", labelText);
    for (const voice of VOICES) {
      const option = dom.append(group, dom.$(".voice-mode-onboarding-voice"));
      option.setAttribute("role", "radio");
      const restingAria = localize("voiceMode.onboarding.voice.ariaLabel", "{0}. Hear this voice and use it for every conversation.", voice.label);
      option.setAttribute("aria-label", restingAria);
      this.appendVoiceIcon(option);
      const label2 = dom.append(option, dom.$("span.voice-mode-onboarding-voice-label"));
      label2.textContent = voice.label;
      this.voiceElements.set(voice.id, { element: option, label: voice.label, restingAria });
      this.voicesDisposables.add(dom.addDisposableListener(option, dom.EventType.CLICK, () => this.selectVoice(voice)));
      this.voicesDisposables.add(dom.addDisposableListener(option, dom.EventType.KEY_DOWN, (event) => this.handleOptionKey(event, voice)));
    }
    this.updateSelection();
  }
  /**
   * The spoken language changed, so swap the chips: the four English voices
   * for a native language's single voice, or back again. Nothing is carried
   * over - a voice chosen for the old language means nothing for the new one.
   */
  updateForLanguage() {
    const localizedVoice = localizedVoiceForLanguage(this.resolveSpokenLanguage());
    if (localizedVoice?.id === this.localizedVoice?.id) {
      return;
    }
    const hadVoiceFocus = this.voicesContainer ? dom.isAncestorOfActiveElement(this.voicesContainer) : false;
    this.player.stop();
    this.localizedVoice = localizedVoice;
    this.selectedVoice = void 0;
    this.renderVoices();
    if (hadVoiceFocus) {
      this.voiceElements.values().next().value?.element.focus();
    }
  }
  /**
   * The single native voice for the spoken language, as a preview button:
   * there is nothing to choose, so it only ever plays and stops.
   */
  renderLocalizedVoice(container, ariaLabel, voice) {
    const group = dom.append(container, dom.$(".voice-mode-onboarding-voices"));
    group.setAttribute("aria-label", ariaLabel);
    const option = dom.append(group, dom.$(".voice-mode-onboarding-voice"));
    option.setAttribute("role", "button");
    option.tabIndex = 0;
    const restingAria = localize("voiceMode.onboarding.voice.previewAriaLabel", "{0}. Hear how your agent will sound.", voice.label);
    option.setAttribute("aria-label", restingAria);
    this.appendVoiceIcon(option);
    const label = dom.append(option, dom.$("span.voice-mode-onboarding-voice-label"));
    label.textContent = voice.label;
    this.voiceElements.set(voice.id, { element: option, label: voice.label, restingAria });
    this.voicesDisposables.add(dom.addDisposableListener(option, dom.EventType.CLICK, () => this.previewLocalizedVoice(voice)));
    this.voicesDisposables.add(dom.addDisposableListener(option, dom.EventType.KEY_DOWN, (event) => {
      const keyboardEvent = new StandardKeyboardEvent(event);
      if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
        keyboardEvent.preventDefault();
        this.previewLocalizedVoice(voice);
      }
    }));
  }
  /**
   * The icon is the affordance: it says "this will speak" before the click,
   * animating bars while it speaks, then a check once a voice is chosen.
   */
  appendVoiceIcon(option) {
    const icon = dom.append(option, dom.$("span.voice-mode-onboarding-voice-icon"));
    dom.append(icon, dom.$(`span.codicon.codicon-${Codicon.play.id}.voice-mode-onboarding-voice-idle`)).setAttribute("aria-hidden", "true");
    dom.append(icon, dom.$(`span.codicon.codicon-${Codicon.checkCompact.id}.voice-mode-onboarding-voice-chosen`)).setAttribute("aria-hidden", "true");
    const bars = dom.append(icon, dom.$("span.voice-mode-onboarding-voice-bars"));
    bars.setAttribute("aria-hidden", "true");
    for (let bar = 0; bar < 3; bar++) {
      dom.append(bars, dom.$("span.voice-mode-onboarding-voice-bar"));
    }
  }
  // --- Shared behaviour ---
  handleOptionKey(event, voice) {
    const keyboardEvent = new StandardKeyboardEvent(event);
    if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
      keyboardEvent.preventDefault();
      this.selectVoice(voice);
      return;
    }
    const forward = keyboardEvent.equals(KeyCode.RightArrow) || keyboardEvent.equals(KeyCode.DownArrow);
    const backward = keyboardEvent.equals(KeyCode.LeftArrow) || keyboardEvent.equals(KeyCode.UpArrow);
    if (forward || backward) {
      keyboardEvent.preventDefault();
      const index = VOICES.indexOf(voice);
      const next = VOICES[(index + (forward ? 1 : VOICES.length - 1)) % VOICES.length];
      this.selectVoice(next);
      this.voiceElements.get(next.id)?.element.focus();
    }
  }
  /**
   * One short paragraph: what Voice Mode does, and where to change its
   * settings or instructions.
   *
   * `[[...]]` marks each clause that becomes a link, so translators can place
   * it naturally in the sentence instead of receiving a fixed phrase
   * concatenated onto the end.
   */
  renderDescription(container) {
    const description = dom.append(container, dom.$(".chat-input-notice-description.voice-mode-onboarding-description"));
    const text = localize({
      key: "voiceMode.onboarding.description",
      comment: [
        "Preserve the double square brackets: they mark the text that becomes a link. Keep both links, in this order - the first opens Voice Mode settings, the second opens the voice.md customization file."
      ]
    }, "Choose how your agent speaks to you. Adjust [[settings]] or [[how it's written]] anytime.");
    dom.append(description, renderFormattedText(text, {
      actionHandler: {
        callback: (index) => {
          const commandId = index === "0" ? VOICE_SETTINGS_COMMAND : CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID;
          this.logAction(index === "0" ? "openSettings" : "openInstructions");
          this.commandService.executeCommand(commandId).catch((error) => this.logService.error(`[voice] Failed to run ${commandId}: ${error}`));
        },
        disposables: this._store
      }
    }, dom.$("span")));
    for (const link of description.querySelectorAll("a")) {
      link.tabIndex = 0;
      link.setAttribute("role", "button");
      this._register(dom.addDisposableListener(link, dom.EventType.KEY_DOWN, (event) => {
        const keyboardEvent = new StandardKeyboardEvent(event);
        if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
          keyboardEvent.preventDefault();
          link.click();
        }
      }));
    }
  }
  /**
   * Dismissal is always available and never gated: a disabled close would trap
   * someone in the card. Choosing a voice already commits it, so this is only
   * ever "I am done here" - and closing is what hands the session back.
   */
  renderClose() {
    this.addDismissAction({
      className: "voice-mode-onboarding-close",
      ariaLabel: localize("voiceMode.onboarding.close", "Close the introduction"),
      onActivate: () => this.finish()
    });
  }
  /**
   * Stops the sample and the waveform while the card is put away for a
   * notification, so an invisible introduction is not still playing audio or
   * painting every frame.
   */
  setVisible(visible) {
    super.setVisible(visible);
    this.animator?.setSuspended(!visible);
    if (!visible) {
      this.player.stop();
    }
  }
  selectVoice(voice) {
    if (this.player.playingVoice === voice.id) {
      this.player.stop();
      status(localize("voiceMode.onboarding.voice.previewStopped", "{0} preview stopped.", voice.label));
      return;
    }
    this.logAction("selectVoice");
    this.selectedVoice = voice;
    this.updateSelection();
    this.player.play(voice.sampleId, voice.id);
    status(localize("voiceMode.onboarding.voice.selected", "{0} selected.", voice.label));
    this.configurationService.updateValue(VOICE_SETTING, voice.id, ConfigurationTarget.USER).catch((error) => this.logService.error(`[voice] Failed to persist the Voice Mode voice: ${error}`));
  }
  /**
   * The localized voice is not a choice - it is the only voice for the
   * language - so previewing it just plays and stops, and never persists.
   */
  previewLocalizedVoice(voice) {
    if (this.player.playingVoice === voice.id) {
      this.player.stop();
      status(localize("voiceMode.onboarding.voice.localizedStopped", "{0} preview stopped.", voice.label));
      return;
    }
    this.logAction("previewVoice");
    this.player.play(voice.id);
    status(localize("voiceMode.onboarding.voice.localizedPlaying", "Playing {0} preview.", voice.label));
  }
  /**
   * The spoken language, mirroring the resolution the voice client uses: an
   * explicit test override, then the configured language (unless `auto`), then
   * the window's language.
   */
  resolveSpokenLanguage() {
    if (this.options.voiceLanguage) {
      return this.options.voiceLanguage;
    }
    const configuredLanguage = this.configurationService.getValue(VOICE_LANGUAGE_SETTING)?.trim();
    if (configuredLanguage && configuredLanguage.toLowerCase() !== "auto") {
      return configuredLanguage;
    }
    return dom.getWindow(this.domNode).navigator.language;
  }
  updateSelection() {
    for (const [id, entry] of this.voiceElements) {
      const selected = id === this.selectedVoice?.id;
      entry.element.classList.toggle("selected", selected);
      entry.element.setAttribute("aria-checked", String(selected));
    }
    this.updateTabStop();
  }
  /**
   * Keeps a single tab stop on the group: the chosen voice, or the first one
   * when nothing has been chosen yet.
   */
  updateTabStop() {
    let first = true;
    for (const [id, entry] of this.voiceElements) {
      const isTabStop = this.selectedVoice === void 0 ? first : id === this.selectedVoice.id;
      entry.element.tabIndex = isTabStop ? 0 : -1;
      first = false;
    }
  }
  updatePlaying(playingVoice) {
    for (const [id, entry] of this.voiceElements) {
      const playing = id === playingVoice;
      entry.element.classList.toggle("playing", playing);
      entry.element.setAttribute("aria-label", playing ? localize("voiceMode.onboarding.voice.stopPreview", "Stop {0} preview.", entry.label) : entry.restingAria);
    }
    this.domNode.classList.toggle("playing", playingVoice !== void 0);
  }
  finish() {
    this.player.stop();
    this.logAction("close");
    this.options.onDismiss();
  }
  logAction(action) {
    this.telemetryService.publicLog2(
      "voiceModeOnboarding.action",
      { action, source: this.options.source }
    );
  }
};
VoiceModeOnboardingBanner = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, ITelemetryService)
], VoiceModeOnboardingBanner);
const IVoiceModeOnboardingService = createDecorator("voiceModeOnboardingService");
let VoiceModeOnboardingService = class extends Disposable {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.onboarding = this._register(this.instantiationService.createInstance(ChatInputOnboarding, {
      storageKey: AgentsVoiceStorageKeys.IntroBannerShown
    }));
  }
  get isVisible() {
    return this.onboarding.isVisible;
  }
  registerHost(options) {
    return this.onboarding.registerHost(options);
  }
  showIfNeeded() {
    this.onboarding.showIfNeeded((context) => this.createBanner(context, "automatic"));
  }
  show() {
    return this.onboarding.show((context) => this.createBanner(context, "manual"));
  }
  createBanner(context, source) {
    return this.instantiationService.createInstance(VoiceModeOnboardingBanner, {
      container: context.container,
      onDismiss: () => context.dismiss(dom.isAncestorOfActiveElement(context.container)),
      source
    });
  }
};
VoiceModeOnboardingService = __decorateClass([
  __decorateParam(0, IInstantiationService)
], VoiceModeOnboardingService);
registerSingleton(IVoiceModeOnboardingService, VoiceModeOnboardingService, InstantiationType.Delayed);
export {
  IVoiceModeOnboardingService,
  VoiceModeOnboardingBanner,
  VoiceModeOnboardingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFnZW50c1ZvaWNlXFxicm93c2VyXFx2b2ljZU1vZGVPbmJvYXJkaW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyRm9ybWF0dGVkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb3JtYXR0ZWRUZXh0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBTZWxlY3RCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VsZWN0Qm94L3NlbGVjdEJveC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDT05GSUdVUkVfVk9JQ0VfSU5TVFJVQ1RJT05TX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NvbmZpZ3VyZVZvaWNlSW5zdHJ1Y3Rpb25zQWN0aW9uLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE9uYm9hcmRpbmcsIElDaGF0SW5wdXRPbmJvYXJkaW5nQmFubmVyLCBJQ2hhdElucHV0T25ib2FyZGluZ0NvbnRleHQsIElDaGF0SW5wdXRPbmJvYXJkaW5nSG9zdE9wdGlvbnMgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWNlVmFyaWFudCwgQ2hhdElucHV0Tm90aWNlV2lkZ2V0IH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpY2VXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBhc0Nzc1ZhcmlhYmxlV2l0aERlZmF1bHQsIHNlbGVjdEJhY2tncm91bmQsIHNlbGVjdExpc3RCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRzVm9pY2VTdG9yYWdlS2V5cyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5pbXBvcnQgeyBidWlsZE1pY3JvcGhvbmVPcHRpb25zLCBJTWljcm9waG9uZU9wdGlvbiwgaW5kZXhPZk1pY3JvcGhvbmUgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2RpY3RhdGlvbk9uYm9hcmRpbmcuanMnO1xuaW1wb3J0ICcuL21lZGlhL3ZvaWNlTW9kZU9uYm9hcmRpbmcuY3NzJztcblxuLyoqIFNldHRpbmcgdGhlIGJhbm5lciB3cml0ZXMgd2hlbiBhIHZvaWNlIGNoaXAgaXMgcGlja2VkLiAqL1xuY29uc3QgVk9JQ0VfU0VUVElORyA9ICdhZ2VudHMudm9pY2Uudm9pY2UnO1xuXG4vKiogU2V0dGluZyB0aGF0IGNvbnRyb2xzIHRoZSBsYW5ndWFnZSBWb2ljZSBNb2RlIHNwZWFrcy4gKi9cbmNvbnN0IFZPSUNFX0xBTkdVQUdFX1NFVFRJTkcgPSAnYWdlbnRzLnZvaWNlLmxhbmd1YWdlJztcblxuLyoqIFdoZXJlIHRoZSBmaXJzdCBsaW5rIHNlbmRzIGFueW9uZSB3aG8gd2FudHMgdG8gY2hhbmdlIHRoZWlyIG1pbmQgbGF0ZXIuICovXG5jb25zdCBWT0lDRV9TRVRUSU5HU19DT01NQU5EID0gJ2FnZW50c1ZvaWNlLm9wZW5TZXR0aW5ncyc7XG5cbnR5cGUgVm9pY2VNb2RlT25ib2FyZGluZ0FjdGlvbiA9ICdzaG93bicgfCAnc2VsZWN0Vm9pY2UnIHwgJ3ByZXZpZXdWb2ljZScgfCAnc2VsZWN0TWljcm9waG9uZScgfCAnb3BlblNldHRpbmdzJyB8ICdvcGVuSW5zdHJ1Y3Rpb25zJyB8ICdjbG9zZScgfCAnZXNjYXBlJztcblxudHlwZSBWb2ljZU1vZGVPbmJvYXJkaW5nQWN0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdGFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYWN0aW9uIHRha2VuIGluIHRoZSBWb2ljZSBNb2RlIG9uYm9hcmRpbmcgY2FyZC4nIH07XG5cdHNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBjYXJkIGFwcGVhcmVkIGF1dG9tYXRpY2FsbHkgb24gZmlyc3QgdXNlIG9yIHdhcyBvcGVuZWQgbWFudWFsbHkuJyB9O1xuXHRvd25lcjogJ21lZ2Fucm9nZ2UnO1xuXHRjb21tZW50OiAnVHJhY2tzIGVuZ2FnZW1lbnQgd2l0aCB0aGUgVm9pY2UgTW9kZSBvbmJvYXJkaW5nIGNhcmQuJztcbn07XG5cbnR5cGUgVm9pY2VNb2RlT25ib2FyZGluZ0FjdGlvbkV2ZW50ID0ge1xuXHRhY3Rpb246IFZvaWNlTW9kZU9uYm9hcmRpbmdBY3Rpb247XG5cdHNvdXJjZTogJ2F1dG9tYXRpYycgfCAnbWFudWFsJztcbn07XG5cbi8qKlxuICogVGhlIHZvaWNlcyBWb2ljZSBNb2RlIGFjdHVhbGx5IHNwZWFrcyB3aXRoIChtaXJyb3JzIHRoZSBgYWdlbnRzLnZvaWNlLnZvaWNlYFxuICogZW51bSkuIEVhY2ggb25lIHNoaXBzIGEgc2hvcnQgcHJlLXJlY29yZGVkIHNhbXBsZSByZW5kZXJlZCB3aXRoIHRoYXQgZXhhY3RcbiAqIG1vZGVsIHZvaWNlLCBzbyB0aGUgcHJldmlldyBhIHVzZXIgaGVhcnMgaW4gdGhlIGJhbm5lciBpcyB3aGF0IHRoZXkgZ2V0IGluIGFcbiAqIHJlYWwgY29udmVyc2F0aW9uLlxuICovXG5pbnRlcmZhY2UgSVZvaWNlTW9kZVZvaWNlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2FtcGxlSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0LyoqIFRoaXMgdm9pY2UncyB3YXZlZm9ybSB0ZXh0dXJlLiBTZWUge0BsaW5rIElXYXZlfS4gKi9cblx0cmVhZG9ubHkgc2lnbmF0dXJlOiByZWFkb25seSBJV2F2ZVtdO1xufVxuXG4vKipcbiAqIE9uZSBzaW5lIGNvbXBvbmVudCBvZiBhIHdhdmVmb3JtIHRleHR1cmUuIEEgdm9pY2UncyBzaWduYXR1cmUgaXMgYSBoYW5kZnVsIG9mXG4gKiB0aGVzZSBzdW1tZWQgdG9nZXRoZXIsIHdoaWNoIGlzIHdoYXQgZ2l2ZXMgZWFjaCB2b2ljZSBhIHJlY29nbmlzYWJseVxuICogZGlmZmVyZW50IHRyYWNlIHJhdGhlciB0aGFuIGZvdXIgY29waWVzIG9mIHRoZSBzYW1lIHJpcHBsZS5cbiAqL1xuaW50ZXJmYWNlIElXYXZlIHtcblx0cmVhZG9ubHkgZnJlcXVlbmN5OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFtcGxpdHVkZTogbnVtYmVyO1xuXHRyZWFkb25seSBzcGVlZDogbnVtYmVyO1xuXHRyZWFkb25seSBwaGFzZTogbnVtYmVyO1xufVxuXG5jb25zdCBWT0lDRVM6IHJlYWRvbmx5IElWb2ljZU1vZGVWb2ljZVtdID0gW1xuXHR7XG5cdFx0aWQ6ICdiaXJjaF9uZXV0cmFsJyxcblx0XHRzYW1wbGVJZDogJ21heWFfbmV1dHJhbCcsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS5iaXJjaCcsIFwiQmlyY2ggKERlZmF1bHQpXCIpLFxuXHRcdC8vIEZsb3dpbmcgbWlkLXJhbmdlOiBldmVuIHNwcmVhZCwgZ2VudGxlIGRyaWZ0LlxuXHRcdHNpZ25hdHVyZTogW1xuXHRcdFx0eyBmcmVxdWVuY3k6IDEuMCwgYW1wbGl0dWRlOiAwLjQyLCBzcGVlZDogMC40MiwgcGhhc2U6IDAuMCB9LFxuXHRcdFx0eyBmcmVxdWVuY3k6IDEuNywgYW1wbGl0dWRlOiAwLjI2LCBzcGVlZDogLTAuMzEsIHBoYXNlOiAxLjEgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiAyLjYsIGFtcGxpdHVkZTogMC4xOSwgc3BlZWQ6IDAuMjQsIHBoYXNlOiAyLjQgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiA0LjEsIGFtcGxpdHVkZTogMC4xMywgc3BlZWQ6IC0wLjE4LCBwaGFzZTogMC43IH0sXG5cdFx0XSxcblx0fSxcblx0e1xuXHRcdGlkOiAnaGFycGVyX25ldXRyYWwnLFxuXHRcdHNhbXBsZUlkOiAndmljdG9yaWFfbmV1dHJhbCcsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS5oYXJwZXInLCBcIkhhcnBlclwiKSxcblx0XHQvLyBCcmlnaHQgYW5kIHF1aWNrOiBoaWdoZXIgZnJlcXVlbmNpZXMsIHRpZ2h0ZXIgcmlwcGxlLlxuXHRcdHNpZ25hdHVyZTogW1xuXHRcdFx0eyBmcmVxdWVuY3k6IDEuNCwgYW1wbGl0dWRlOiAwLjM4LCBzcGVlZDogMC41MiwgcGhhc2U6IDAuMCB9LFxuXHRcdFx0eyBmcmVxdWVuY3k6IDIuMywgYW1wbGl0dWRlOiAwLjI3LCBzcGVlZDogLTAuMzgsIHBoYXNlOiAxLjEgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiAzLjYsIGFtcGxpdHVkZTogMC4yMSwgc3BlZWQ6IDAuMzAsIHBoYXNlOiAyLjQgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiA1LjIsIGFtcGxpdHVkZTogMC4xNCwgc3BlZWQ6IC0wLjIyLCBwaGFzZTogMC43IH0sXG5cdFx0XSxcblx0fSxcblx0e1xuXHRcdGlkOiAnb2FrX25ldXRyYWwnLFxuXHRcdHNhbXBsZUlkOiAna2V2aW5fbmV1dHJhbCcsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS5vYWsnLCBcIk9ha1wiKSxcblx0XHQvLyBMb3cgYW5kIGJyb2FkOiBsb25nIHN3ZWxscyB3aXRoIGxpdHRsZSBoaWdoLWZyZXF1ZW5jeSBkZXRhaWwuXG5cdFx0c2lnbmF0dXJlOiBbXG5cdFx0XHR7IGZyZXF1ZW5jeTogMC43LCBhbXBsaXR1ZGU6IDAuNDgsIHNwZWVkOiAwLjMwLCBwaGFzZTogMC40IH0sXG5cdFx0XHR7IGZyZXF1ZW5jeTogMS4yLCBhbXBsaXR1ZGU6IDAuMjgsIHNwZWVkOiAtMC4yMiwgcGhhc2U6IDEuNyB9LFxuXHRcdFx0eyBmcmVxdWVuY3k6IDIuMCwgYW1wbGl0dWRlOiAwLjE2LCBzcGVlZDogMC4xOCwgcGhhc2U6IDAuOSB9LFxuXHRcdFx0eyBmcmVxdWVuY3k6IDMuMSwgYW1wbGl0dWRlOiAwLjA5LCBzcGVlZDogLTAuMTQsIHBoYXNlOiAyLjIgfSxcblx0XHRdLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICdqdW5ob19uZXV0cmFsJyxcblx0XHRzYW1wbGVJZDogJ2RhbmllbF9uZXV0cmFsJyxcblx0XHRsYWJlbDogbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLmp1bmhvJywgXCJKdW5ob1wiKSxcblx0XHQvLyBTdGVhZHkgYW5kIG1lYXN1cmVkOiBzbG93IGRyaWZ0LCBjYWxtIHJlZ3VsYXIgY3Jlc3RzLlxuXHRcdHNpZ25hdHVyZTogW1xuXHRcdFx0eyBmcmVxdWVuY3k6IDAuOSwgYW1wbGl0dWRlOiAwLjQ0LCBzcGVlZDogMC4yNCwgcGhhc2U6IDEuMyB9LFxuXHRcdFx0eyBmcmVxdWVuY3k6IDEuNSwgYW1wbGl0dWRlOiAwLjMwLCBzcGVlZDogLTAuMTgsIHBoYXNlOiAwLjIgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiAyLjQsIGFtcGxpdHVkZTogMC4xNCwgc3BlZWQ6IDAuMTUsIHBoYXNlOiAyLjAgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiAzLjQsIGFtcGxpdHVkZTogMC4xMCwgc3BlZWQ6IC0wLjEyLCBwaGFzZTogMS41IH0sXG5cdFx0XSxcblx0fSxcbl07XG5cbi8qKlxuICogQSBsYW5ndWFnZSBWb2ljZSBNb2RlIHNwZWFrcyBuYXRpdmVseSwgYW5kIHRoZSBzaW5nbGUgdm9pY2UgaXRzIGJhY2tlbmQgdXNlc1xuICogZm9yIHRoYXQgbGFuZ3VhZ2UuIENob29zaW5nIGJldHdlZW4gdm9pY2VzIGlzIGFuIEVuZ2xpc2gtb25seSBhZmZvcmRhbmNlLCBzb1xuICogZm9yIHRoZXNlIGxhbmd1YWdlcyB0aGUgY2FyZCBwcmV2aWV3cyB0aGlzIG9uZSB2b2ljZSByYXRoZXIgdGhhbiB0aGUgZm91clxuICogRW5nbGlzaCBvcHRpb25zLlxuICovXG5pbnRlcmZhY2UgSUxvY2FsaXplZFZvaWNlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcbn1cblxuY29uc3QgTE9DQUxJWkVEX1ZPSUNFUzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgSUxvY2FsaXplZFZvaWNlPj4gPSB7XG5cdGRlOiB7IGlkOiAnZGVfbWFyY19uZXV0cmFsJywgbGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS5tYXJjJywgXCJNYXJjXCIpIH0sXG5cdGVzOiB7IGlkOiAnZXMtRVNfbWFyaWFfbmV1dHJhbCcsIGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UubWFyaWEnLCBcIk1hcmlhXCIpIH0sXG5cdGZyOiB7IGlkOiAnZnJfZGF2aWRfbmV1dHJhbCcsIGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UuZGF2aWQnLCBcIkRhdmlkXCIpIH0sXG5cdGl0OiB7IGlkOiAnaXRfZXZhX25ldXRyYWwnLCBsYWJlbDogbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLmV2YScsIFwiRXZhXCIpIH0sXG5cdGphOiB7IGlkOiAnamFfYXJ1aGFfbmV1dHJhbCcsIGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UuYXJ1aGEnLCBcIkFydWhhXCIpIH0sXG5cdGtvOiB7IGlkOiAna29faml5b25fbmV1dHJhbCcsIGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2Uuaml5b24nLCBcIkppeW9uXCIpIH0sXG5cdHB0OiB7IGlkOiAncHQtQlJfZ2lsX25ldXRyYWwnLCBsYWJlbDogbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLmdpbCcsIFwiR2lsXCIpIH0sXG5cdHpoOiB7IGlkOiAnemhfd3V6aGlfbmV1dHJhbCcsIGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2Uud3V6aGknLCBcIld1emhpXCIpIH0sXG59O1xuXG4vKipcbiAqIFRoZSBuYXRpdmUgdm9pY2UgZm9yIGEgc3Bva2VuIGxhbmd1YWdlLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSBsYW5ndWFnZSBoYXNcbiAqIG5vIG5hdGl2ZSB2b2ljZSBhbmQgdGhlIGNhcmQgc2hvdWxkIGZhbGwgYmFjayB0byB0aGUgRW5nbGlzaCB2b2ljZSBjaG9vc2VyLlxuICovXG5mdW5jdGlvbiBsb2NhbGl6ZWRWb2ljZUZvckxhbmd1YWdlKGxhbmd1YWdlOiBzdHJpbmcpOiBJTG9jYWxpemVkVm9pY2UgfCB1bmRlZmluZWQge1xuXHR0cnkge1xuXHRcdGNvbnN0IGNhbm9uaWNhbCA9IEludGwuZ2V0Q2Fub25pY2FsTG9jYWxlcyhsYW5ndWFnZS50cmltKCkpWzBdO1xuXHRcdGNvbnN0IGJhc2UgPSBjYW5vbmljYWw/LnNwbGl0KCctJylbMF0udG9Mb3dlckNhc2UoKTtcblx0XHRyZXR1cm4gYmFzZSA/IExPQ0FMSVpFRF9WT0lDRVNbYmFzZV0gOiB1bmRlZmluZWQ7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgdHJhY2UgYmVmb3JlIGFueW9uZSBoYXMgY2hvc2VuOiB0aGUgZm91ciBzaWduYXR1cmVzIGF2ZXJhZ2VkIGNvbXBvbmVudCBieVxuICogY29tcG9uZW50LCBzbyBpdCBiZWxvbmdzIHRvIG5vIHZvaWNlIGluIHBhcnRpY3VsYXIgcmF0aGVyIHRoYW4gcXVpZXRseSBiZWluZ1xuICogdGhlIGZpcnN0IG9uZSBpbiB0aGUgbGlzdC4gVGhlIGRlY2xhcmVkIHBoYXNlcyBhbGwgc2l0IHdpdGhpbiBhIGNvdXBsZSBvZlxuICogcmFkaWFucyBvZiBlYWNoIG90aGVyLCBzbyBhIHBsYWluIG1lYW4gbGFuZHMgYmV0d2VlbiB0aGVtIHJhdGhlciB0aGFuIG9uIHRoZVxuICogZmFyIHNpZGUgb2YgdGhlIGNpcmNsZS5cbiAqL1xuY29uc3QgUkVTVElOR19TSUdOQVRVUkU6IHJlYWRvbmx5IElXYXZlW10gPSBWT0lDRVNbMF0uc2lnbmF0dXJlLm1hcCgoXywgaW5kZXgpID0+IHtcblx0Y29uc3QgY29tcG9uZW50cyA9IFZPSUNFUy5tYXAodm9pY2UgPT4gdm9pY2Uuc2lnbmF0dXJlW2luZGV4XSk7XG5cdGNvbnN0IG1lYW4gPSAocGljazogKHdhdmU6IElXYXZlKSA9PiBudW1iZXIpID0+XG5cdFx0Y29tcG9uZW50cy5yZWR1Y2UoKHN1bSwgd2F2ZSkgPT4gc3VtICsgcGljayh3YXZlKSwgMCkgLyBjb21wb25lbnRzLmxlbmd0aDtcblx0cmV0dXJuIHtcblx0XHRmcmVxdWVuY3k6IG1lYW4od2F2ZSA9PiB3YXZlLmZyZXF1ZW5jeSksXG5cdFx0YW1wbGl0dWRlOiBtZWFuKHdhdmUgPT4gd2F2ZS5hbXBsaXR1ZGUpLFxuXHRcdHNwZWVkOiBtZWFuKHdhdmUgPT4gd2F2ZS5zcGVlZCksXG5cdFx0cGhhc2U6IG1lYW4od2F2ZSA9PiB3YXZlLnBoYXNlKSxcblx0fTtcbn0pO1xuXG4vKipcbiAqIEhvdyBsb25nIHRoZSBkb21pbmFudCBjb21wb25lbnQgdGFrZXMgdG8gY29tcGxldGUgb25lIGN5Y2xlLCBtYXRjaGluZyB0aGVcbiAqIGBjaGF0LXZvaWNlLWlucHV0LW1vZGUtd2F2ZWAga2V5ZnJhbWUgdGhlIHRvb2xiYXIgd2F2ZWZvcm0gaWRsZXMgb24uIFNhbWVcbiAqIGluc3RydW1lbnQsIHNhbWUgdGVtcG8uXG4gKi9cbmNvbnN0IElETEVfQ1lDTEVfU0VDT05EUyA9IDIuNjtcblxuLyoqXG4gKiBTY2FsZXMgZXZlcnkgZGVjbGFyZWQgYHNwZWVkYCBzbyB0aGUgcmVzdGluZyB0cmFjZSBjeWNsZXMgYXRcbiAqIHtAbGluayBJRExFX0NZQ0xFX1NFQ09ORFN9LiBUaGUgc2lnbmF0dXJlcyBhcmUgd3JpdHRlbiBhcyBhICpyZWxhdGl2ZSogc2V0IC1cbiAqIGNvbXBvbmVudCAxIGRyaWZ0cyBhZ2FpbnN0IGNvbXBvbmVudCAwLCBhbmQgc28gb24gLSB3aGljaCBtYWtlcyB0aGVtXG4gKiByZWFkYWJsZSwgYnV0IHRha2VuIGxpdGVyYWxseSB0aGUgZG9taW5hbnQgY29tcG9uZW50IHR1cm5zIG9uY2UgZXZlcnkgfjE3XG4gKiBzZWNvbmRzLiBUaGF0IGlzIHJvdWdobHkgMXB4IG9mIG1vdmVtZW50IHBlciBiYXIgcGVyIHNlY29uZDogdGVjaG5pY2FsbHlcbiAqIGFuaW1hdGluZywgdmlzaWJseSBmcm96ZW4uIERlcml2ZWQgcmF0aGVyIHRoYW4gaGFyZGNvZGVkIHNvIGVkaXRpbmcgYVxuICogc2lnbmF0dXJlIGNhbm5vdCBzaWxlbnRseSBwdXQgdGhlIHRyYWNlIGJhY2sgdG8gc2xlZXAuXG4gKi9cbmNvbnN0IFdBVkVfVEVNUE8gPSAoMiAqIE1hdGguUEkpIC8gSURMRV9DWUNMRV9TRUNPTkRTIC8gTWF0aC5hYnMoUkVTVElOR19TSUdOQVRVUkVbMF0uc3BlZWQpO1xuXG4vLyAtLS0gV2F2ZWZvcm0gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqIEFtcGxpdHVkZSB3aXRoIG5vdGhpbmcgcGxheWluZzogcHJlc2VudCwgYnV0IGNsZWFybHkgYXQgcmVzdC4gKi9cbmNvbnN0IElETEVfR0FJTiA9IDAuNTtcbi8qKlxuICogRXh0cmEgYW1wbGl0dWRlIGF0IHBlYWsgbG91ZG5lc3MuIE1hdGNoZWQgdG8gdGhlIGRpY3RhdGlvbiBjYXJkJ3Mgd2F2ZWZvcm0gc29cbiAqIHRoZSB0cmFjZSBjbGVhcmx5IHN3ZWxscyB3aXRoIHRoZSB2b2ljZSBiZWluZyBwcmV2aWV3ZWQgcmF0aGVyIHRoYW4gb25seVxuICogbnVkZ2luZyAtIHRoZSBjYXJkJ3Mgam9iIGlzIHRvIGxldCB5b3UgaGVhciAoYW5kIHNlZSkgZWFjaCB2b2ljZSwgYW5kIGEgdHJhY2VcbiAqIHRoYXQgYW5zd2VycyB0aGUgc2FtcGxlIHJlYWRzIGFzIHJlc3BvbmRpbmcgdG8gaXQuXG4gKi9cbmNvbnN0IFNQRUFLSU5HX0dBSU4gPSAwLjQ1O1xuLyoqXG4gKiBIb3cgbXVjaCBvZiB0aGUgdHJhdmVsbGluZyBtb3Rpb24gaXMgYWx3YXlzIHByZXNlbnQsIHZlcnN1cyBkcml2ZW4gYnkgdGhlXG4gKiBzYW1wbGUuIEF0IHJlc3QgdGhlIHRyYWNlIGRyaWZ0cyBzbG93bHkgLSBhbGl2ZSwgbm90IGZyb3plbiAtIGFuZCBpdCBmbG93cyBpblxuICogZWFybmVzdCBvbmx5IHdoaWxlIGEgdm9pY2UgcGxheXMsIHNvIHRoZSBtb3ZlbWVudCBpdHNlbGYgcmVhZHMgYXMgYSByZXNwb25zZSB0b1xuICogdGhlIHZvaWNlIHlvdSBqdXN0IHBpY2tlZCByYXRoZXIgdGhhbiBpZGxlIGRlY29yYXRpb24uXG4gKi9cbmNvbnN0IElETEVfTU9USU9OID0gMC4yO1xuLyoqIEFkZGl0aW9uYWwgdHJhdmVsbGluZyBzcGVlZCBhdCBwZWFrIGxvdWRuZXNzLCBvbiB0b3Agb2Yge0BsaW5rIElETEVfTU9USU9OfS4gKi9cbmNvbnN0IFNQRUFLSU5HX01PVElPTiA9IDAuODtcbi8qKlxuICogSG93IHF1aWNrbHkgdGhlIGJhbmQgY2hhc2VzIHRoZSBhdWRpbywgcGVyIHtAbGluayBSRUZFUkVOQ0VfRlJBTUVfU0VDT05EU30uXG4gKiBMb3cgYW5kIHNsb3cgcmVhZHMgYXMgc21vb3RoLlxuICovXG5jb25zdCBMRVZFTF9FQVNJTkcgPSAwLjA4O1xuLyoqXG4gKiBIb3cgcXVpY2tseSB0aGUgdHJhY2UgbW9ycGhzIGZyb20gb25lIHZvaWNlJ3Mgc2lnbmF0dXJlIHRvIGFub3RoZXIsIHBlclxuICoge0BsaW5rIFJFRkVSRU5DRV9GUkFNRV9TRUNPTkRTfS5cbiAqL1xuY29uc3QgU0lHTkFUVVJFX0VBU0lORyA9IDAuMDY7XG4vKipcbiAqIFRoZSBmcmFtZSBkdXJhdGlvbiB0aGUgZWFzZWQgY29uc3RhbnRzIGFib3ZlIGFyZSB0dW5lZCBhZ2FpbnN0ICg2MGZwcykuIEVhc2luZ1xuICogYW5kIHRoZSBwaGFzZSBhZHZhbmNlIGFyZSBzY2FsZWQgYnkgdGhlIHJlYWwgZWxhcHNlZCB0aW1lIGVhY2ggZnJhbWUgc28gdGhlXG4gKiBtb3Rpb24gcnVucyBhdCB0aGUgc2FtZSByZWFsLXRpbWUgcGFjZSB3aGV0aGVyIGZyYW1lcyBhcnJpdmUgb24gdGltZSBvciBzdHV0dGVyXG4gKiAtIHdoaWNoIHRoZXkgZG8gd2hpbGUgYSBzYW1wbGUgcGxheXMgYW5kIHRoZSBwZXItZnJhbWUgYW5hbHlzZXIgcmVhZCBjb21wZXRlc1xuICogZm9yIHRoZSBtYWluIHRocmVhZC4gU2NhbGluZyBieSByZWFsIHRpbWUgKHJhdGhlciB0aGFuIGEgZml4ZWQgcGVyLWZyYW1lIHN0ZXApXG4gKiBpcyB3aGF0IGtlZXBzIHRoZSB0cmFjZSBtb3ZpbmcgYXQgZnVsbCBzcGVlZCB1bmRlciB0aGF0IGxvYWQgaW5zdGVhZCBvZiBzdGFsbGluZy5cbiAqL1xuY29uc3QgUkVGRVJFTkNFX0ZSQU1FX1NFQ09ORFMgPSAxIC8gNjA7XG4vKipcbiAqIEJhciBtZXRyaWNzLCB0YWtlbiBmcm9tIFZvaWNlIE1vZGUncyBvd24gd2F2ZWZvcm0gaW4gYHZvaWNlSW5wdXRNb2RlLmNzc2AsXG4gKiB3aGljaCBzdGF0ZXMgdGhlIHJ1bGUgZGlyZWN0bHk6ICpiYXJzIGFyZSBzdHJva2VzLCBub3Qgc2hhcGVzKiAtIHRoZXkgY2FycnlcbiAqIHRoZSBzYW1lIHZpc3VhbCB3ZWlnaHQgYXMgdGhlIGNvZGljb24gZ2x5cGhzIGJlc2lkZSB0aGVtIHNvIHRoZSB3YXZlZm9ybVxuICogbmV2ZXIgcmVhZHMgYXMgYm9sZGVyIHRoYW4gdGhlIG1pYy4gU2FtZSAxcHggc3Ryb2tlIGFuZCAycHggZ2FwIGhlcmUsIGp1c3RcbiAqIG1hbnkgbW9yZSBvZiB0aGVtLlxuICovXG5jb25zdCBCQVJfV0lEVEggPSAxO1xuY29uc3QgQkFSX0dBUCA9IDI7XG4vKiogU2hvcnRlc3QgYSBiYXIgZXZlciBnZXRzOiBhIGRvdCwgc28gYSByZXN0aW5nIGJhciBrZWVwcyBpdHMgcm91bmQgY2FwLiAqL1xuY29uc3QgQkFSX01JTiA9IDE7XG5cbi8qKiBBIHNpZ25hdHVyZSBjb21wb25lbnQgd2l0aCBhbiBpbmNyZW1lbnRhbGx5IGFjY3VtdWxhdGVkIGFuaW1hdGlvbiBwaGFzZS4gKi9cbnR5cGUgTXV0YWJsZVdhdmUgPSB7IGZyZXF1ZW5jeTogbnVtYmVyOyBhbXBsaXR1ZGU6IG51bWJlcjsgc3BlZWQ6IG51bWJlcjsgcGhhc2U6IG51bWJlcjsgb3NjaWxsYXRpb246IG51bWJlciB9O1xuXG5mdW5jdGlvbiBjbG9uZVNpZ25hdHVyZShzaWduYXR1cmU6IHJlYWRvbmx5IElXYXZlW10pOiBNdXRhYmxlV2F2ZVtdIHtcblx0cmV0dXJuIHNpZ25hdHVyZS5tYXAod2F2ZSA9PiAoeyAuLi53YXZlLCBvc2NpbGxhdGlvbjogMCB9KSk7XG59XG5cbi8qKlxuICogQ29udmVydCBhIHBlci17QGxpbmsgUkVGRVJFTkNFX0ZSQU1FX1NFQ09ORFN9IGVhc2luZyBjb25zdGFudCBpbnRvIHRoZSBmcmFjdGlvblxuICogdG8gZWFzZSBieSBhY3Jvc3MgYGR0YCBzZWNvbmRzLCBzbyB0aGUgbW9ycGggc2V0dGxlcyBhdCB0aGUgc2FtZSByZWFsLXRpbWUgcmF0ZVxuICogcmVnYXJkbGVzcyBvZiBmcmFtZSByYXRlLiBSZWR1Y2VzIHRvIHRoZSByYXcgY29uc3RhbnQgd2hlbiBgZHRgIGlzIGV4YWN0bHkgb25lXG4gKiByZWZlcmVuY2UgZnJhbWUuXG4gKi9cbmZ1bmN0aW9uIGVhc2luZ0ZhY3RvcihwZXJGcmFtZUVhc2luZzogbnVtYmVyLCBkdDogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIDEgLSBNYXRoLnBvdygxIC0gcGVyRnJhbWVFYXNpbmcsIGR0IC8gUkVGRVJFTkNFX0ZSQU1FX1NFQ09ORFMpO1xufVxuXG4vKipcbiAqIEVhc2UgYSBzaWduYXR1cmUgdG93YXJkcyBhIHRhcmdldCBpbiBwbGFjZS4gTW9ycGhpbmcgdGhlIG51bWJlcnMgcmF0aGVyIHRoYW5cbiAqIHN3YXBwaW5nIHRoZW0gaXMgd2hhdCBtYWtlcyBhIHZvaWNlIGNoYW5nZSByZWFkIGFzIHRoZSB0cmFjZSAqYmVjb21pbmcqIHRoZVxuICogbmV3IHZvaWNlIGluc3RlYWQgb2YgY3V0dGluZyB0byBpdC5cbiAqXG4gKiBgcGhhc2VgIGVhc2VzIHdpdGggdGhlIHJlc3Q6IGl0IGlzIGEgc3RhdGljIG9mZnNldCBwZXIgY29tcG9uZW50ICh0aGUgbW90aW9uXG4gKiBjb21lcyBmcm9tIHRoZSBhY2N1bXVsYXRlZCBgb3NjaWxsYXRpb25gKSwgc28gbGVhdmluZyBpdCBiZWhpbmQgd291bGQgc3RyYW5kXG4gKiBldmVyeSB2b2ljZSBvbiB3aGljaGV2ZXIgcGhhc2VzIHRoZSB0cmFjZSBoYXBwZW5lZCB0byBzdGFydCB3aXRoLiBFdmVyeSBkZWNsYXJlZFxuICogcGhhc2Ugc2l0cyB3aXRoaW4gYSByYWRpYW4gb3IgdHdvIG9mIGl0cyBuZWlnaGJvdXJzLCB3ZWxsIGluc2lkZSBoYWxmIGEgdHVybiwgc29cbiAqIGVhc2luZyBzdHJhaWdodCB0byB0aGUgdGFyZ2V0IGlzIGFsc28gdGhlIHNob3J0ZXN0IHdheSByb3VuZCB0aGUgY2lyY2xlLlxuICpcbiAqIGBvc2NpbGxhdGlvbmAgaXMgZGVsaWJlcmF0ZWx5IGxlZnQgdW50b3VjaGVkOiBpdCBpcyB3aGVyZSB0aGUgY29tcG9uZW50IGlzIGluIGl0c1xuICogY3ljbGUsIG5vdCBwYXJ0IG9mIHRoZSB0YXJnZXQgdGV4dHVyZSwgc28gaXQga2VlcHMgZmxvd2luZyBhY3Jvc3MgdGhlIG1vcnBoLlxuICovXG5mdW5jdGlvbiBlYXNlU2lnbmF0dXJlKGN1cnJlbnQ6IE11dGFibGVXYXZlW10sIHRhcmdldDogcmVhZG9ubHkgSVdhdmVbXSwgZmFjdG9yOiBudW1iZXIpOiB2b2lkIHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjdXJyZW50Lmxlbmd0aCAmJiBpIDwgdGFyZ2V0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0Y3VycmVudFtpXS5mcmVxdWVuY3kgKz0gKHRhcmdldFtpXS5mcmVxdWVuY3kgLSBjdXJyZW50W2ldLmZyZXF1ZW5jeSkgKiBmYWN0b3I7XG5cdFx0Y3VycmVudFtpXS5hbXBsaXR1ZGUgKz0gKHRhcmdldFtpXS5hbXBsaXR1ZGUgLSBjdXJyZW50W2ldLmFtcGxpdHVkZSkgKiBmYWN0b3I7XG5cdFx0Y3VycmVudFtpXS5zcGVlZCArPSAodGFyZ2V0W2ldLnNwZWVkIC0gY3VycmVudFtpXS5zcGVlZCkgKiBmYWN0b3I7XG5cdFx0Y3VycmVudFtpXS5waGFzZSArPSAodGFyZ2V0W2ldLnBoYXNlIC0gY3VycmVudFtpXS5waGFzZSkgKiBmYWN0b3I7XG5cdH1cbn1cblxuLyoqXG4gKiBBZHZhbmNlIGVhY2ggY29tcG9uZW50J3MgYWNjdW11bGF0ZWQgYW5pbWF0aW9uIHBoYXNlIGJ5IHRoZSBjdXJyZW50IHNwZWVkIG92ZXJcbiAqIGBkdGAgc2Vjb25kcywgd3JhcHBpbmcgdG8ga2VlcCBpdCBib3VuZGVkIG92ZXIgbG9uZyBzZXNzaW9ucy4gQmVjYXVzZSB0aGlzIG9ubHlcbiAqIGV2ZXIgYWRkcyB0byBgb3NjaWxsYXRpb25gLCBjaGFuZ2luZyBgc3BlZWRgIG1pZC1tb3JwaCBiZW5kcyB0aGUgbW90aW9uIHNtb290aGx5XG4gKiBpbnN0ZWFkIG9mIHRlbGVwb3J0aW5nIGl0LlxuICovXG5mdW5jdGlvbiBhZHZhbmNlT3NjaWxsYXRpb24od2F2ZXM6IHJlYWRvbmx5IE11dGFibGVXYXZlW10sIGR0OiBudW1iZXIpOiB2b2lkIHtcblx0Y29uc3QgdGF1ID0gMiAqIE1hdGguUEk7XG5cdGZvciAoY29uc3Qgd2F2ZSBvZiB3YXZlcykge1xuXHRcdHdhdmUub3NjaWxsYXRpb24gPSAod2F2ZS5vc2NpbGxhdGlvbiArIHdhdmUuc3BlZWQgKiBXQVZFX1RFTVBPICogZHQpICUgdGF1O1xuXHR9XG59XG5cbi8qKlxuICogRHJhdyB0aGUgcm93IG9mIGJhcnMuIEhlaWdodHMgYXJlIHN5bW1ldHJpYyBhYm91dCB0aGUgY2VudHJlIGxpbmUgYW5kIGZvbGxvd1xuICogdGhlIHNhbWUgY2VudHJlLXBlYWsgc2lsaG91ZXR0ZSBhcyB0aGUgdG9vbGJhciB3YXZlZm9ybSwgc28gdGhlIHR3byByZWFkIGFzXG4gKiB0aGUgc2FtZSBpbnN0cnVtZW50IGF0IGRpZmZlcmVudCBzaXplcy5cbiAqL1xuZnVuY3Rpb24gZHJhd0JhcnMoXG5cdGNvbnRleHQ6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcblx0d2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsXG5cdHdhdmVzOiByZWFkb25seSBNdXRhYmxlV2F2ZVtdLCBnYWluOiBudW1iZXIsXG4pOiB2b2lkIHtcblx0Y29uc3QgcGl0Y2ggPSBCQVJfV0lEVEggKyBCQVJfR0FQO1xuXHRjb25zdCBjb3VudCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3Iod2lkdGggLyBwaXRjaCkpO1xuXHQvLyBDZW50cmUgdGhlIHJvdzogd2hhdGV2ZXIgZG9lcyBub3QgZGl2aWRlIGV2ZW5seSBiZWNvbWVzIGV2ZW4gbWFyZ2luc1xuXHQvLyByYXRoZXIgdGhhbiBhIHJhZ2dlZCByaWdodCBlZGdlLlxuXHRjb25zdCBpbnNldCA9ICh3aWR0aCAtIChjb3VudCAqIHBpdGNoIC0gQkFSX0dBUCkpIC8gMjtcblx0Y29uc3QgY2VudGVyWSA9IGhlaWdodCAvIDI7XG5cdGNvbnN0IG1heEhhbGYgPSBoZWlnaHQgLyAyO1xuXG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBjb3VudDsgaW5kZXgrKykge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gY291bnQgPiAxID8gaW5kZXggLyAoY291bnQgLSAxKSA6IDA7XG5cdFx0Y29uc3QgYW1vdW50ID0gYmFuZEZyYWN0aW9uKHBvc2l0aW9uLCB3YXZlcykgKiBnYWluO1xuXHRcdGNvbnN0IGhhbGYgPSBNYXRoLm1heChCQVJfTUlOIC8gMiwgTWF0aC5taW4obWF4SGFsZiwgYW1vdW50ICogbWF4SGFsZikpO1xuXHRcdGNvbnRleHQuYmVnaW5QYXRoKCk7XG5cdFx0Y29udGV4dC5yb3VuZFJlY3QoaW5zZXQgKyBpbmRleCAqIHBpdGNoLCBjZW50ZXJZIC0gaGFsZiwgQkFSX1dJRFRILCBoYWxmICogMiwgQkFSX1dJRFRIIC8gMik7XG5cdFx0Y29udGV4dC5maWxsKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBIYWxmLWhlaWdodCBvZiB0aGUgYmFuZCBhdCBgcG9zaXRpb25gICgwLi4xIGFjcm9zcyB0aGUgc3RyaXApLCBhcyBhIGZyYWN0aW9uXG4gKiBvZiB0aGUgYXZhaWxhYmxlIGhhbGYtaGVpZ2h0LlxuICpcbiAqIEVhY2ggY29tcG9uZW50IGNvbnRyaWJ1dGVzIGFuIGFscmVhZHktcG9zaXRpdmUsIGN1c3AtZnJlZSBjdXJ2ZS4gU3VtbWluZyByYXdcbiAqIHNpbmVzIGFuZCB0YWtpbmcgdGhlaXIgbWFnbml0dWRlIHdvdWxkIHB1dCBhIHNoYXJwIGNvcm5lciBhdCBldmVyeSB6ZXJvXG4gKiBjcm9zc2luZyAtIHRoYXQgaXMgd2hhdCBtYWtlcyBhbiBBU0NJSSB3YXZlZm9ybSBsb29rIGxpa2UgaXQgaXMgc25hcHBpbmcgdXBcbiAqIGFuZCBkb3duIHJhdGhlciB0aGFuIGZsb3dpbmcuXG4gKi9cbmZ1bmN0aW9uIGJhbmRGcmFjdGlvbihwb3NpdGlvbjogbnVtYmVyLCB3YXZlczogcmVhZG9ubHkgTXV0YWJsZVdhdmVbXSk6IG51bWJlciB7XG5cdGxldCBhbXBsaXR1ZGUgPSAwO1xuXHRsZXQgdG90YWwgPSAwO1xuXHRmb3IgKGNvbnN0IHdhdmUgb2Ygd2F2ZXMpIHtcblx0XHRjb25zdCBwaGFzZSA9IHBvc2l0aW9uICogd2F2ZS5mcmVxdWVuY3kgKiBNYXRoLlBJICogMiArIHdhdmUub3NjaWxsYXRpb24gKyB3YXZlLnBoYXNlO1xuXHRcdGFtcGxpdHVkZSArPSAoMC41ICsgMC41ICogTWF0aC5zaW4ocGhhc2UpKSAqIHdhdmUuYW1wbGl0dWRlO1xuXHRcdHRvdGFsICs9IHdhdmUuYW1wbGl0dWRlO1xuXHR9XG5cdGlmICh0b3RhbCA9PT0gMCkge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cdC8vIENlbnRyZS1wZWFrIHNpbGhvdWV0dGUsIG1hdGNoaW5nIHRoZSB0b29sYmFyIHdhdmVmb3JtOiB0YWxsZXN0IGluIHRoZVxuXHQvLyBtaWRkbGUsIHRhcGVyaW5nIHRvIHRoZSBlbmRzLCBzbyB0aGUgcm93IHJlYWRzIGFzIG9uZSBpbnN0cnVtZW50IHJhdGhlclxuXHQvLyB0aGFuIGEgc3RyaXAgY3V0IG9mZiBhdCBib3RoIGVkZ2VzLlxuXHRjb25zdCB0YXBlciA9IE1hdGguc2luKE1hdGguUEkgKiBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCBwb3NpdGlvbikpKTtcblx0cmV0dXJuIChhbXBsaXR1ZGUgLyB0b3RhbCkgKiAoMC4zNSArIDAuNjUgKiB0YXBlcik7XG59XG5cbi8qKiBXaGF0IHRoZSBhbmltYXRvciBuZWVkcyB0byBrbm93IGVhY2ggZnJhbWUsIHN1cHBsaWVkIGJ5IHRoZSBiYW5uZXIuICovXG5pbnRlcmZhY2UgSVdhdmVmb3JtU291cmNlIHtcblx0LyoqIExvdWRuZXNzIG9mIHRoZSB2b2ljZSBiZWluZyBwcmV2aWV3ZWQsIGAwYCB3aGVuIHNpbGVudC4gKi9cblx0Z2V0TGV2ZWwoKTogbnVtYmVyO1xuXHQvKiogVGhlIHNpZ25hdHVyZSB0aGUgdHJhY2Ugc2hvdWxkIGJlIGVhc2luZyB0b3dhcmRzLiAqL1xuXHRnZXRTaWduYXR1cmUoKTogcmVhZG9ubHkgSVdhdmVbXTtcbn1cblxuLyoqXG4gKiBEcmF3cyB0aGUgYW5pbWF0ZWQgd2F2ZWZvcm0uIE93bnMgYSBzaW5nbGUgY2FudmFzLCBhIGBSZXNpemVPYnNlcnZlcmAgYW5kIGFuXG4gKiBhbmltYXRpb24tZnJhbWUgbG9vcDsgZGlzcG9zaW5nIHN0b3BzIGJvdGguIEhvbm9ycyByZWR1Y2VkIG1vdGlvbiBieSBwYWludGluZ1xuICogYSBzaW5nbGUgc3RhdGljIGZyYW1lIGluc3RlYWQgb2YgYW5pbWF0aW5nLlxuICovXG5jbGFzcyBWb2ljZU1vZGVPbmJvYXJkaW5nQW5pbWF0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQ6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcblx0cHJpdmF0ZSByZWFkb25seSBhbmltYXRpb25GcmFtZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgd2lkdGggPSAwO1xuXHRwcml2YXRlIGhlaWdodCA9IDA7XG5cdHByaXZhdGUgcnVubmluZyA9IGZhbHNlO1xuXHRwcml2YXRlIHN1c3BlbmRlZCA9IGZhbHNlO1xuXHRwcml2YXRlIGxldmVsID0gMDtcblx0LyoqIFRpbWVzdGFtcCBvZiB0aGUgcHJldmlvdXMgZnJhbWUsIGZvciB0aGUgZWxhcHNlZC10aW1lIGVhY2ggZHJhdyBlYXNlcyBvdmVyLiAqL1xuXHRwcml2YXRlIGxhc3RUaW1lc3RhbXA6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB3YXZlczogTXV0YWJsZVdhdmVbXTtcblx0LyoqXG5cdCAqIFRoZSBzdHJva2UgY29sb3VyLCB0YWtlbiBmcm9tIHRoZSBjYW52YXMncyBvd24gY29tcHV0ZWQgYGNvbG9yYCBzbyBDU1Ncblx0ICogb3ducyB0aGUgdGllciBhbmQgdGhlbWUgb3ZlcnJpZGVzIHdvcmsgZm9yIGZyZWUgLSB0aGUgc2FtZSBgY3VycmVudENvbG9yYFxuXHQgKiBhcnJhbmdlbWVudCB0aGUgdG9vbGJhciB3YXZlZm9ybSB1c2VzLiBDYWNoZWQgcmF0aGVyIHRoYW4gcmVhZCBwZXIgZnJhbWU6XG5cdCAqIGBnZXRDb21wdXRlZFN0eWxlYCBpbnNpZGUgdGhlIGFuaW1hdGlvbiBsb29wIGZvcmNlcyBhIHN0eWxlIHJlY2FsY3VsYXRpb25cblx0ICogb24gZXZlcnkgdGljay5cblx0ICovXG5cdHByaXZhdGUgc3Ryb2tlID0gJyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNvdXJjZTogSVdhdmVmb3JtU291cmNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gY3JlYXRlIHRoZSBWb2ljZSBNb2RlIG9uYm9hcmRpbmcgY2FudmFzIGNvbnRleHQnKTtcblx0XHR9XG5cdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLndhdmVzID0gY2xvbmVTaWduYXR1cmUodGhpcy5zb3VyY2UuZ2V0U2lnbmF0dXJlKCkpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyhjb250YWluZXIpO1xuXHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IHRhcmdldFdpbmRvdy5SZXNpemVPYnNlcnZlcigoKSA9PiB0aGlzLnJlc2l6ZSgpKTtcblx0XHRvYnNlcnZlci5vYnNlcnZlKGNvbnRhaW5lcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IG9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMucmVhZFN0cm9rZSgpO1xuXHRcdFx0dGhpcy5kcmF3KHRhcmdldFdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VSZWR1Y2VkTW90aW9uKCgpID0+IHRoaXMudXBkYXRlTW90aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5zdG9wKCkpKTtcblxuXHRcdHRoaXMucmVhZFN0cm9rZSgpO1xuXHRcdHRoaXMucmVzaXplKCk7XG5cdFx0dGhpcy51cGRhdGVNb3Rpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZFN0cm9rZSgpOiB2b2lkIHtcblx0XHR0aGlzLnN0cm9rZSA9IGRvbS5nZXRXaW5kb3codGhpcy5jYW52YXMpLmdldENvbXB1dGVkU3R5bGUodGhpcy5jYW52YXMpLmNvbG9yO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNb3Rpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3VzcGVuZGVkIHx8IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkpIHtcblx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdFx0dGhpcy5kcmF3KGRvbS5nZXRXaW5kb3codGhpcy5jb250YWluZXIpLnBlcmZvcm1hbmNlLm5vdygpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdGFydCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQYXVzZSB3aGlsZSB0aGUgY2FyZCBpcyBwdXQgYXdheSBmb3IgaGlnaGVyLXByZWNlZGVuY2UgY29udGVudCwgc28gYW5cblx0ICogaW52aXNpYmxlIGludHJvZHVjdGlvbiBpcyBub3Qgc3RpbGwgcGFpbnRpbmcgZXZlcnkgZnJhbWUuXG5cdCAqL1xuXHRzZXRTdXNwZW5kZWQoc3VzcGVuZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3VzcGVuZGVkID09PSBzdXNwZW5kZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zdXNwZW5kZWQgPSBzdXNwZW5kZWQ7XG5cdFx0dGhpcy51cGRhdGVNb3Rpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhcnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucnVubmluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJ1bm5pbmcgPSB0cnVlO1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5jb250YWluZXIpO1xuXHRcdGNvbnN0IHRpY2sgPSAodGltZTogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMucnVubmluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRyYXcodGltZSk7XG5cdFx0XHR0aGlzLmFuaW1hdGlvbkZyYW1lLnZhbHVlID0gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCAoKSA9PiB0aWNrKHRhcmdldFdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKSkpO1xuXHRcdH07XG5cdFx0dGhpcy5hbmltYXRpb25GcmFtZS52YWx1ZSA9IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgKCkgPT4gdGljayh0YXJnZXRXaW5kb3cucGVyZm9ybWFuY2Uubm93KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcCgpOiB2b2lkIHtcblx0XHR0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcblx0XHR0aGlzLmFuaW1hdGlvbkZyYW1lLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc2l6ZSgpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKTtcblx0XHRjb25zdCBkZXZpY2VQaXhlbFJhdGlvID0gdGFyZ2V0V2luZG93LmRldmljZVBpeGVsUmF0aW8gfHwgMTtcblx0XHR0aGlzLndpZHRoID0gdGhpcy5jb250YWluZXIub2Zmc2V0V2lkdGg7XG5cdFx0dGhpcy5oZWlnaHQgPSB0aGlzLmNvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdFx0aWYgKCF0aGlzLndpZHRoIHx8ICF0aGlzLmhlaWdodCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMud2lkdGggKiBkZXZpY2VQaXhlbFJhdGlvO1xuXHRcdHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuaGVpZ2h0ICogZGV2aWNlUGl4ZWxSYXRpbztcblx0XHR0aGlzLmNvbnRleHQuc2V0VHJhbnNmb3JtKGRldmljZVBpeGVsUmF0aW8sIDAsIDAsIGRldmljZVBpeGVsUmF0aW8sIDAsIDApO1xuXHRcdHRoaXMuZHJhdyh0YXJnZXRXaW5kb3cucGVyZm9ybWFuY2Uubm93KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkcmF3KHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndpZHRoIHx8ICF0aGlzLmhlaWdodCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlYWwgdGltZSBlbGFwc2VkIHNpbmNlIHRoZSBwcmV2aW91cyBmcmFtZS4gQm90aCB0aGUgZWFzaW5nIGFuZCB0aGUgcGhhc2Vcblx0XHQvLyBhZHZhbmNlIHNjYWxlIGJ5IHRoaXMsIHNvIHRoZSB0cmFjZSBrZWVwcyBpdHMgcmVhbC10aW1lIHNwZWVkIHdoZXRoZXJcblx0XHQvLyBmcmFtZXMgYXJyaXZlIGF0IDYwZnBzIG9yIGRyb3Agd2hpbGUgYSBzYW1wbGUgcGxheXMgLSByYXRoZXIgdGhhbiBzbG93aW5nXG5cdFx0Ly8gZG93biB1bmRlciB0aGUgZXh0cmEgbG9hZC4gQSBiaWcgZ2FwIChhIGhpdGNoLCBvciBhIGJhY2tncm91bmRlZCB0YWIgdGhhdFxuXHRcdC8vIHBhdXNlZCB0aGUgbG9vcCkgc2ltcGx5IGFkdmFuY2VzIHRoZSB0cmFjZSB0byB3aGVyZSBpdCBzaG91bGQgYmU6IHRoZVxuXHRcdC8vIHBoYXNlIGlzIHBlcmlvZGljIGFuZCB0aGUgZWFzaW5nIGZhY3RvciBzdGF5cyBib3VuZGVkLCBzbyB0aGVyZSBpcyBub1xuXHRcdC8vIGx1cmNoIHRvIGd1YXJkIGFnYWluc3QuXG5cdFx0Y29uc3QgZHQgPSB0aGlzLmxhc3RUaW1lc3RhbXAgPT09IHVuZGVmaW5lZFxuXHRcdFx0PyAwXG5cdFx0XHQ6IE1hdGgubWF4KDAsICh0aW1lc3RhbXAgLSB0aGlzLmxhc3RUaW1lc3RhbXApICogMC4wMDEpO1xuXHRcdHRoaXMubGFzdFRpbWVzdGFtcCA9IHRpbWVzdGFtcDtcblxuXHRcdC8vIElkbGUsIHRoZSB3YXZlZm9ybSBkcmlmdHMgZ2VudGx5OyB3aGlsZSBhIHZvaWNlIHBsYXlzIGl0IGZsb3dzIGFuZCBzd2VsbHNcblx0XHQvLyB3aXRoIHRoYXQgdm9pY2UuIEJvdGggdGhlIGxldmVsIGFuZCB0aGUgc2hhcGUgYXJlIGVhc2VkIHNvIHRoZSByaWJib25cblx0XHQvLyBnbGlkZXMgcmF0aGVyIHRoYW4gc25hcHBpbmcgYmV0d2VlbiBmcmFtZXMuXG5cdFx0dGhpcy5sZXZlbCArPSAodGhpcy5zb3VyY2UuZ2V0TGV2ZWwoKSAtIHRoaXMubGV2ZWwpICogZWFzaW5nRmFjdG9yKExFVkVMX0VBU0lORywgZHQpO1xuXHRcdGVhc2VTaWduYXR1cmUodGhpcy53YXZlcywgdGhpcy5zb3VyY2UuZ2V0U2lnbmF0dXJlKCksIGVhc2luZ0ZhY3RvcihTSUdOQVRVUkVfRUFTSU5HLCBkdCkpO1xuXHRcdC8vIERyaXZlIHRoZSB0cmF2ZWxsaW5nIG1vdGlvbiBmcm9tIHRoZSBzYW1wbGU6IG5lYXJseSBzdGlsbCBhdCByZXN0LCBmbG93aW5nXG5cdFx0Ly8gd2hpbGUgYSB2b2ljZSBwbGF5cywgc28gdGhlIG1vdmVtZW50IHJlYWRzIGFzIGEgcmVzcG9uc2UgdG8gdGhlIHByZXZpZXdlZFxuXHRcdC8vIHZvaWNlIHJhdGhlciB0aGFuIGNvbnN0YW50IGlkbGUgbW90aW9uLlxuXHRcdGFkdmFuY2VPc2NpbGxhdGlvbih0aGlzLndhdmVzLCBkdCAqIChJRExFX01PVElPTiArIHRoaXMubGV2ZWwgKiBTUEVBS0lOR19NT1RJT04pKTtcblx0XHRjb25zdCBnYWluID0gSURMRV9HQUlOICsgdGhpcy5sZXZlbCAqIFNQRUFLSU5HX0dBSU47XG5cblx0XHR0aGlzLmNvbnRleHQuY2xlYXJSZWN0KDAsIDAsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcblx0XHR0aGlzLmNvbnRleHQuZmlsbFN0eWxlID0gdGhpcy5zdHJva2U7XG5cblx0XHRkcmF3QmFycyh0aGlzLmNvbnRleHQsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0LCB0aGlzLndhdmVzLCBnYWluKTtcblx0fVxuXG59XG5cbi8vIC0tLSBCYW5uZXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFBsYXlzIHRoZSBwcmUtcmVjb3JkZWQgdm9pY2Ugc2FtcGxlcyB0aGF0IHNoaXAgbmV4dCB0byB0aGlzIGZpbGUuIE9uZSBlbGVtZW50XG4gKiBpcyByZXVzZWQgZm9yIGV2ZXJ5IHByZXZpZXcgc28gcGlja2luZyBhIHNlY29uZCB2b2ljZSBjdXRzIHRoZSBmaXJzdCBvbmUgb2ZmLlxuICovXG5jbGFzcyBWb2ljZVNhbXBsZVBsYXllciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGxheWJhY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHQvKiogUmV1c2VkIGFjcm9zcyBwcmV2aWV3czogYSBtZWRpYSBlbGVtZW50IHNvdXJjZSBjYW4gb25seSBiZSBjcmVhdGVkIG9uY2Vcblx0ICogcGVyIGVsZW1lbnQsIHNvIHRoZSBlbGVtZW50LCBjb250ZXh0IGFuZCBhbmFseXNlciBhcmUgYWxsIGxvbmctbGl2ZWQuICovXG5cdHByaXZhdGUgYXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYW5hbHlzZXI6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsZXZlbHM6IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUGxheWluZ1ZvaWNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nIHwgdW5kZWZpbmVkPigpKTtcblx0LyoqIEZpcmVzIHdpdGggdGhlIHZvaWNlIGN1cnJlbnRseSBiZWluZyBoZWFyZCwgb3IgYHVuZGVmaW5lZGAgb25jZSBpdCBzdG9wcy4gKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQbGF5aW5nVm9pY2UgPSB0aGlzLl9vbkRpZENoYW5nZVBsYXlpbmdWb2ljZS5ldmVudDtcblxuXHRwcml2YXRlIF9wbGF5aW5nVm9pY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0IHBsYXlpbmdWb2ljZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcGxheWluZ1ZvaWNlOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGF1ZGlvRmFjdG9yeTogKCgpID0+IEhUTUxBdWRpb0VsZW1lbnQpIHwgdW5kZWZpbmVkLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnN0b3AoKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEN1cnJlbnQgbG91ZG5lc3Mgb2YgdGhlIHNhbXBsZSBiZWluZyBwbGF5ZWQsIGAwYCB3aGVuIHNpbGVudC4gVGhlIHdhdmVmb3JtXG5cdCAqIHJlYWRzIHRoaXMgc28gaXQgbW92ZXMgdG8gdGhlIHZvaWNlIHRoZSB1c2VyIGlzIGFjdHVhbGx5IGhlYXJpbmcuXG5cdCAqL1xuXHRnZXRMZXZlbCgpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5hbmFseXNlciB8fCAhdGhpcy5sZXZlbHMgfHwgIXRoaXMuX3BsYXlpbmdWb2ljZSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdHRoaXMuYW5hbHlzZXIuZ2V0Qnl0ZVRpbWVEb21haW5EYXRhKHRoaXMubGV2ZWxzKTtcblx0XHRsZXQgc3VtID0gMDtcblx0XHRmb3IgKGNvbnN0IHNhbXBsZSBvZiB0aGlzLmxldmVscykge1xuXHRcdFx0Y29uc3QgY2VudGVyZWQgPSAoc2FtcGxlIC0gMTI4KSAvIDEyODtcblx0XHRcdHN1bSArPSBjZW50ZXJlZCAqIGNlbnRlcmVkO1xuXHRcdH1cblx0XHQvLyBSTVMsIHNjYWxlZCBzbyBvcmRpbmFyeSBzcGVlY2ggbGFuZHMgbmVhciAxIHJhdGhlciB0aGFuIGEgZnJhY3Rpb24uXG5cdFx0cmV0dXJuIE1hdGgubWluKDEsIE1hdGguc3FydChzdW0gLyB0aGlzLmxldmVscy5sZW5ndGgpICogMy4yKTtcblx0fVxuXG5cdHBsYXkoc2FtcGxlSWQ6IHN0cmluZywgcGxheWluZ1ZvaWNlID0gc2FtcGxlSWQpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3AoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXVkaW8gPSB0aGlzLmVuc3VyZUF1ZGlvKCk7XG5cdFx0XHRhdWRpby5zcmMgPSBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShgdnMvd29ya2JlbmNoL2NvbnRyaWIvYWdlbnRzVm9pY2UvYnJvd3Nlci9tZWRpYS8ke3NhbXBsZUlkfS5tcDNgKS50b1N0cmluZyh0cnVlKTtcblxuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRzdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhdWRpbywgJ2VuZGVkJywgKCkgPT4gdGhpcy5zdG9wKCkpKTtcblx0XHRcdHN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGF1ZGlvLCAnZXJyb3InLCAoKSA9PiB0aGlzLnN0b3AoKSkpO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhdWRpby5wYXVzZSgpKSk7XG5cdFx0XHR0aGlzLnBsYXliYWNrLnZhbHVlID0gc3RvcmU7XG5cblx0XHRcdHRoaXMuc2V0UGxheWluZ1ZvaWNlKHBsYXlpbmdWb2ljZSk7XG5cdFx0XHRhdWRpby5wbGF5KCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gVm9pY2UgTW9kZSBvbmJvYXJkaW5nIHByZXZpZXcgZmFpbGVkOiAke2Vycm9yfWApO1xuXHRcdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gVm9pY2UgTW9kZSBvbmJvYXJkaW5nIHByZXZpZXcgdW5hdmFpbGFibGU6ICR7ZXJyb3J9YCk7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIGF1ZGlvIGVsZW1lbnQgYW5kLCBiZXN0LWVmZm9ydCwgdGhlIGFuYWx5c2VyIGdyYXBoIGZlZWRpbmcgdGhlXG5cdCAqIHdhdmVmb3JtLiBBbmFseXNpcyBpcyBhIG5pY2V0eTogaWYgdGhlIFdlYiBBdWRpbyBncmFwaCBjYW5ub3QgYmUgY3JlYXRlZFxuXHQgKiB0aGUgc2FtcGxlIHN0aWxsIHBsYXlzLCB0aGUgd2F2ZWZvcm0ganVzdCBrZWVwcyBpdHMgaWRsZSBtb3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIGVuc3VyZUF1ZGlvKCk6IEhUTUxBdWRpb0VsZW1lbnQge1xuXHRcdGlmICh0aGlzLmF1ZGlvKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hdWRpbztcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuZWxlbWVudCk7XG5cdFx0Y29uc3QgYXVkaW8gPSB0aGlzLmF1ZGlvRmFjdG9yeT8uKCkgPz8gbmV3IHRhcmdldFdpbmRvdy5BdWRpbygpO1xuXHRcdHRoaXMuYXVkaW8gPSBhdWRpbztcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0YXVkaW8ucGF1c2UoKTtcblx0XHRcdGF1ZGlvLnNyYyA9ICcnO1xuXHRcdH0pKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gbmV3IHRhcmdldFdpbmRvdy5BdWRpb0NvbnRleHQoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB2b2lkIGNvbnRleHQuY2xvc2UoKS5jYXRjaCgoKSA9PiB7IC8qIGFscmVhZHkgY2xvc2luZyAqLyB9KSkpO1xuXHRcdFx0Y29uc3QgYW5hbHlzZXIgPSBjb250ZXh0LmNyZWF0ZUFuYWx5c2VyKCk7XG5cdFx0XHRhbmFseXNlci5mZnRTaXplID0gMjU2O1xuXHRcdFx0Y29udGV4dC5jcmVhdGVNZWRpYUVsZW1lbnRTb3VyY2UoYXVkaW8pLmNvbm5lY3QoYW5hbHlzZXIpO1xuXHRcdFx0YW5hbHlzZXIuY29ubmVjdChjb250ZXh0LmRlc3RpbmF0aW9uKTtcblx0XHRcdHRoaXMuYW5hbHlzZXIgPSBhbmFseXNlcjtcblx0XHRcdHRoaXMubGV2ZWxzID0gbmV3IFVpbnQ4QXJyYXkoYW5hbHlzZXIuZmZ0U2l6ZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBWb2ljZSBNb2RlIG9uYm9hcmRpbmcgYW5hbHlzZXIgdW5hdmFpbGFibGU6ICR7ZXJyb3J9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF1ZGlvO1xuXHR9XG5cblx0c3RvcCgpOiB2b2lkIHtcblx0XHR0aGlzLnBsYXliYWNrLmNsZWFyKCk7XG5cdFx0dGhpcy5zZXRQbGF5aW5nVm9pY2UodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0UGxheWluZ1ZvaWNlKHZvaWNlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wbGF5aW5nVm9pY2UgPT09IHZvaWNlSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGxheWluZ1ZvaWNlID0gdm9pY2VJZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVBsYXlpbmdWb2ljZS5maXJlKHZvaWNlSWQpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlTW9kZU9uYm9hcmRpbmdCYW5uZXJPcHRpb25zIHtcblx0LyoqIFRoZSBlbGVtZW50IHRoZSBiYW5uZXIgYXR0YWNoZXMgaXRzZWxmIHRvLiAqL1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBvbkRpc21pc3M6ICgpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IHNvdXJjZTogJ2F1dG9tYXRpYycgfCAnbWFudWFsJztcblx0LyoqIEFsbG93cyB0ZXN0cyB0byBwcm92aWRlIGEgZGV0ZXJtaW5pc3RpYyBtZWRpYSBlbGVtZW50LiAqL1xuXHRyZWFkb25seSBhdWRpb0ZhY3Rvcnk/OiAoKSA9PiBIVE1MQXVkaW9FbGVtZW50O1xuXHQvKiogQWxsb3dzIHRlc3RzIHRvIHByb3ZpZGUgYSBkZXRlcm1pbmlzdGljIHNwb2tlbiBsYW5ndWFnZS4gKi9cblx0cmVhZG9ubHkgdm9pY2VMYW5ndWFnZT86IHN0cmluZztcbn1cblxuLyoqIEEgcmVuZGVyZWQgdm9pY2Ugb3B0aW9uLCB3aXRoIHRoZSBzdHJpbmdzIGl0cyBwbGF5IHN0YXRlIHN3YXBzIGJldHdlZW4uICovXG5pbnRlcmZhY2UgSVZvaWNlRWxlbWVudCB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSByZXN0aW5nQXJpYTogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRoZSBmaXJzdC1ydW4gVm9pY2UgTW9kZSBjYXJkOiB3aGF0IFZvaWNlIE1vZGUgaXMsIHRoYXQgaXQgY29zdHMgbm90aGluZywgdGhlXG4gKiB2b2ljZXMgaXQgY2FuIHNwZWFrIHdpdGgsIGFuZCB0aGUgbWljIGFzIHRoZSBhbHRlcm5hdGl2ZSBmb3IgYW55b25lIHdobyB3b3VsZFxuICogcmF0aGVyIG5vdCBiZSBzcG9rZW4gdG8gYXQgYWxsLlxuICpcbiAqIENsaWNraW5nIGEgdm9pY2UgYm90aCBwbGF5cyBpdCBhbmQgYWRvcHRzIGl0LCBzbyB0aGVyZSBpcyBub3RoaW5nIHRvIGNvbmZpcm1cbiAqIGFmdGVyd2FyZHMuIFRoZSBsZWFkaW5nIGljb24gY2FycmllcyB0aGF0IHN0b3J5OiBwbGF5IGJlZm9yZSB0aGUgY2xpY2ssXG4gKiBhbmltYXRpbmcgYmFycyB3aGlsZSBpdCBzcGVha3MsIHRoZW4gYSBjaGVjayBvbmNlIGl0IGlzIHlvdXJzLlxuICovXG5leHBvcnQgY2xhc3MgVm9pY2VNb2RlT25ib2FyZGluZ0Jhbm5lciBleHRlbmRzIENoYXRJbnB1dE5vdGljZVdpZGdldCBpbXBsZW1lbnRzIElDaGF0SW5wdXRPbmJvYXJkaW5nQmFubmVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBsYXllcjogVm9pY2VTYW1wbGVQbGF5ZXI7XG5cdHByaXZhdGUgYW5pbWF0b3I6IFZvaWNlTW9kZU9uYm9hcmRpbmdBbmltYXRvciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJVm9pY2VNb2RlT25ib2FyZGluZ0Jhbm5lck9wdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWljcm9waG9uZVBpY2tlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIG1pY3JvcGhvbmVPcHRpb25zOiBJTWljcm9waG9uZU9wdGlvbltdID0gW107XG5cdHByaXZhdGUgbWljcm9waG9uZVBpY2tlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2b2ljZUVsZW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIElWb2ljZUVsZW1lbnQ+KCk7XG5cblx0LyoqIFdoZXJlIHRoZSB2b2ljZSBjaGlwcyBsaXZlLCBzbyB0aGV5IGNhbiBiZSByZS1yZW5kZXJlZCBvbiBhIGxhbmd1YWdlIGNoYW5nZS4gKi9cblx0cHJpdmF0ZSB2b2ljZXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBMaXN0ZW5lcnMgZm9yIHRoZSBjdXJyZW50IHNldCBvZiB2b2ljZSBjaGlwcywgY2xlYXJlZCB3aGVuIHRoZXkgcmUtcmVuZGVyLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IHZvaWNlc0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHQvKiogVGhlIG5hdGl2ZSB2b2ljZSBmb3IgdGhlIHNwb2tlbiBsYW5ndWFnZSwgd2hlbiBvbmUgZXhpc3RzLiAqL1xuXHRwcml2YXRlIGxvY2FsaXplZFZvaWNlOiBJTG9jYWxpemVkVm9pY2UgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFRoZSB2b2ljZSBiZWluZyBhdWRpdGlvbmVkLCBhbmQgdGhlIG9uZSB0aGF0IHdpbGwgYmUgY29tbWl0dGVkLiAqL1xuXHRwcml2YXRlIHNlbGVjdGVkVm9pY2U6IElWb2ljZU1vZGVWb2ljZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVm9pY2VNb2RlT25ib2FyZGluZ0Jhbm5lck9wdGlvbnMsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRjb250YWluZXI6IG9wdGlvbnMuY29udGFpbmVyLFxuXHRcdFx0dmFyaWFudDogQ2hhdElucHV0Tm90aWNlVmFyaWFudC5PbmJvYXJkaW5nLFxuXHRcdFx0Y2xhc3NOYW1lOiAndm9pY2UtbW9kZS1vbmJvYXJkaW5nLWJhbm5lcicsXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy5yZWdpb24nLCBcIlZvaWNlIE1vZGUgaW50cm9kdWN0aW9uXCIpLFxuXHRcdFx0YXJpYURlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcucmVnaW9uRGVzY3JpcHRpb24nLCBcIkNob29zZSBob3cgeW91ciBhZ2VudCBzcGVha3MgdG8geW91LiBBZGp1c3Qgc2V0dGluZ3MgYW55dGltZS5cIiksXG5cdFx0XHRvbkVzY2FwZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ0FjdGlvbignZXNjYXBlJyk7XG5cdFx0XHRcdHRoaXMub3B0aW9ucy5vbkRpc21pc3MoKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMubG9jYWxpemVkVm9pY2UgPSBsb2NhbGl6ZWRWb2ljZUZvckxhbmd1YWdlKHRoaXMucmVzb2x2ZVNwb2tlbkxhbmd1YWdlKCkpO1xuXHRcdHRoaXMucGxheWVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVm9pY2VTYW1wbGVQbGF5ZXIsIHRoaXMuZG9tTm9kZSwgb3B0aW9ucy5hdWRpb0ZhY3RvcnkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBsYXllci5vbkRpZENoYW5nZVBsYXlpbmdWb2ljZSh2b2ljZUlkID0+IHRoaXMudXBkYXRlUGxheWluZyh2b2ljZUlkKSkpO1xuXG5cdFx0Y29uc3QgY29weSA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jb3B5JykpO1xuXHRcdGNvbnN0IHRpdGxlID0gZG9tLmFwcGVuZChjb3B5LCBkb20uJCgnLmNoYXQtaW5wdXQtbm90aWNlLXRpdGxlLnZvaWNlLW1vZGUtb25ib2FyZGluZy10aXRsZScpKTtcblx0XHR0aXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy50aXRsZScsIFwiV2VsY29tZSB0byBWb2ljZSBNb2RlXCIpO1xuXHRcdHRoaXMucmVuZGVyRGVzY3JpcHRpb24oY29weSk7XG5cblx0XHR0aGlzLnJlbmRlclNoYXJlZFdhdmVmb3JtKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLnJlbmRlck1pY3JvcGhvbmVQaWNrZXIoKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctYWN0aW9ucycpKTtcblx0XHR0aGlzLnZvaWNlc0NvbnRhaW5lciA9IGFjdGlvbnM7XG5cdFx0dGhpcy5yZW5kZXJWb2ljZXMoKTtcblx0XHR0aGlzLnJlbmRlckNsb3NlKCk7XG5cdFx0dGhpcy5sb2dBY3Rpb24oJ3Nob3duJyk7XG5cblx0XHQvLyBcIkNoYW5naW5nIHRoaXMgd2hpbGUgdm9pY2UgbW9kZSBpcyBjb25uZWN0ZWQgdGFrZXMgZWZmZWN0IGltbWVkaWF0ZWx5XCJcblx0XHQvLyBhcHBsaWVzIHRvIHRoZSBjYXJkIHRvbzogc3dhcCB0aGUgY2hpcHMgZm9yIHRoZSBuZXcgbGFuZ3VhZ2UncyB2b2ljZVxuXHRcdC8vIHJhdGhlciB0aGFuIGxlYXZpbmcgc3RhbGUgb25lcyBiZWhpbmQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKFZPSUNFX0xBTkdVQUdFX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRm9yTGFuZ3VhZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHNpZ25hdHVyZSB0aGUgc2hhcmVkIHRyYWNlIHNob3VsZCBiZSBzaG93aW5nOiB0aGUgc2VsZWN0ZWQgdm9pY2Uncywgb3Jcblx0ICoge0BsaW5rIFJFU1RJTkdfU0lHTkFUVVJFfSBiZWZvcmUgYW55dGhpbmcgaGFzIGJlZW4gY2hvc2VuLlxuXHQgKi9cblx0cHJpdmF0ZSBjdXJyZW50U2lnbmF0dXJlKCk6IHJlYWRvbmx5IElXYXZlW10ge1xuXHRcdHJldHVybiB0aGlzLnNlbGVjdGVkVm9pY2U/LnNpZ25hdHVyZSA/PyBSRVNUSU5HX1NJR05BVFVSRTtcblx0fVxuXG5cdC8qKiBUaGUgc2luZ2xlIGZ1bGwtd2lkdGggdHJhY2UgdGhlIHdob2xlIGNhcmQgc2hhcmVzLiAqL1xuXHRwcml2YXRlIHJlbmRlclNoYXJlZFdhdmVmb3JtKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiB2b2lkIHtcblx0XHRjb25zdCB3YXZlID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXdhdmUnKSk7XG5cdFx0Y29uc3QgY2FudmFzID0gZG9tLmFwcGVuZCh3YXZlLCBkb20uJCgnY2FudmFzLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jYW52YXMnKSkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XG5cdFx0Y2FudmFzLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuYW5pbWF0b3IgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZU1vZGVPbmJvYXJkaW5nQW5pbWF0b3IsIGNhbnZhcywgd2F2ZSwge1xuXHRcdFx0Z2V0TGV2ZWw6ICgpID0+IHRoaXMucGxheWVyLmdldExldmVsKCksXG5cdFx0XHRnZXRTaWduYXR1cmU6ICgpID0+IHRoaXMuY3VycmVudFNpZ25hdHVyZSgpLFxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWljcm9waG9uZVBpY2tlcigpOiB2b2lkIHtcblx0XHR0aGlzLm1pY3JvcGhvbmVQaWNrZXJDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5jaGF0LWlucHV0LW5vdGljZS1waWNrZXIudm9pY2UtbW9kZS1vbmJvYXJkaW5nLW1pY3JvcGhvbmUtcGlja2VyJykpO1xuXHRcdHRoaXMubWljcm9waG9uZU9wdGlvbnMgPSBbe1xuXHRcdFx0ZGV2aWNlSWQ6ICcnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy5zeXN0ZW1EZWZhdWx0JywgXCJTeXN0ZW0gZGVmYXVsdFwiKSxcblx0XHR9XTtcblx0XHR0aGlzLnVwZGF0ZU1pY3JvcGhvbmVQaWNrZXIoKTtcblxuXHRcdGNvbnN0IG1lZGlhRGV2aWNlcyA9IGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKS5uYXZpZ2F0b3IubWVkaWFEZXZpY2VzO1xuXHRcdGlmIChtZWRpYURldmljZXMpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobWVkaWFEZXZpY2VzLCAnZGV2aWNlY2hhbmdlJywgKCkgPT4gdm9pZCB0aGlzLnJlZnJlc2hNaWNyb3Bob25lcygpKSk7XG5cdFx0XHR2b2lkIHRoaXMucmVmcmVzaE1pY3JvcGhvbmVzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoTWljcm9waG9uZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWVkaWFEZXZpY2VzID0gZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLm5hdmlnYXRvci5tZWRpYURldmljZXM7XG5cdFx0aWYgKCFtZWRpYURldmljZXM/LmVudW1lcmF0ZURldmljZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZGV2aWNlczogTWVkaWFEZXZpY2VJbmZvW107XG5cdFx0dHJ5IHtcblx0XHRcdGRldmljZXMgPSBhd2FpdCBtZWRpYURldmljZXMuZW51bWVyYXRlRGV2aWNlcygpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gY291bGQgbm90IGVudW1lcmF0ZSBtaWNyb3Bob25lczogJHtlcnJvcn1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zID0gYnVpbGRNaWNyb3Bob25lT3B0aW9ucyhkZXZpY2VzKTtcblx0XHQvLyBXYWl0IGZvciBhIHJlYWwgbWljcm9waG9uZSBsYWJlbCBiZWZvcmUgcmVuZGVyaW5nIGEgbXVsdGktbWljcm9waG9uZSBwaWNrZXIuXG5cdFx0aWYgKG9wdGlvbnMubGVuZ3RoID4gMSAmJiAhZGV2aWNlcy5zb21lKGRldmljZSA9PiBkZXZpY2Uua2luZCA9PT0gJ2F1ZGlvaW5wdXQnICYmIGRldmljZS5sYWJlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5taWNyb3Bob25lT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy51cGRhdGVNaWNyb3Bob25lUGlja2VyKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1pY3JvcGhvbmVQaWNrZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1pY3JvcGhvbmVQaWNrZXJDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5taWNyb3Bob25lUGlja2VyLmNsZWFyKCk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLm1pY3JvcGhvbmVQaWNrZXJDb250YWluZXIpO1xuXG5cdFx0dGhpcy5taWNyb3Bob25lUGlja2VyQ29udGFpbmVyLmhpZGRlbiA9IHRoaXMubWljcm9waG9uZU9wdGlvbnMubGVuZ3RoIDw9IDE7XG5cdFx0aWYgKHRoaXMubWljcm9waG9uZVBpY2tlckNvbnRhaW5lci5oaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRkb20uYXBwZW5kKHRoaXMubWljcm9waG9uZVBpY2tlckNvbnRhaW5lciwgZG9tLiQoYHNwYW4uY29kaWNvbi5jb2RpY29uLSR7Q29kaWNvbi5taWMuaWR9LnZvaWNlLW1vZGUtb25ib2FyZGluZy1taWNyb3Bob25lLWljb25gKSlcblx0XHRcdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkID0gaW5kZXhPZk1pY3JvcGhvbmUodGhpcy5taWNyb3Bob25lT3B0aW9ucywgdGhpcy5jdXJyZW50TWljcm9waG9uZUlkKCkpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc2VsZWN0Qm94ID0gc3RvcmUuYWRkKG5ldyBTZWxlY3RCb3goXG5cdFx0XHR0aGlzLm1pY3JvcGhvbmVPcHRpb25zLm1hcChvcHRpb24gPT4gKHsgdGV4dDogb3B0aW9uLmxhYmVsIH0pKSxcblx0XHRcdHNlbGVjdGVkLFxuXHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHR7XG5cdFx0XHRcdC4uLmRlZmF1bHRTZWxlY3RCb3hTdHlsZXMsXG5cdFx0XHRcdHNlbGVjdEJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2VsZWN0Qm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlbGVjdEZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2VsZWN0TGlzdEJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGVXaXRoRGVmYXVsdChzZWxlY3RMaXN0QmFja2dyb3VuZCwgYXNDc3NWYXJpYWJsZShzZWxlY3RCYWNrZ3JvdW5kKSksXG5cdFx0XHR9LFxuXHRcdFx0eyBhcmlhTGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy5taWNyb3Bob25lJywgXCJNaWNyb3Bob25lXCIpLCB1c2VDdXN0b21EcmF3bjogdHJ1ZSB9LFxuXHRcdCkpO1xuXHRcdHNlbGVjdEJveC5yZW5kZXIodGhpcy5taWNyb3Bob25lUGlja2VyQ29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQoc2VsZWN0Qm94Lm9uRGlkU2VsZWN0KGV2ZW50ID0+IHRoaXMuc2VsZWN0TWljcm9waG9uZShldmVudC5pbmRleCkpKTtcblx0XHR0aGlzLm1pY3JvcGhvbmVQaWNrZXIudmFsdWUgPSBzdG9yZTtcblx0fVxuXG5cdHByaXZhdGUgY3VycmVudE1pY3JvcGhvbmVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLk1pY3JvcGhvbmVEZXZpY2UsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZWxlY3RNaWNyb3Bob25lKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb24gPSB0aGlzLm1pY3JvcGhvbmVPcHRpb25zW2luZGV4XTtcblx0XHRpZiAoIW9wdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmxvZ0FjdGlvbignc2VsZWN0TWljcm9waG9uZScpO1xuXHRcdGlmIChvcHRpb24uZGV2aWNlSWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5NaWNyb3Bob25lRGV2aWNlLCBvcHRpb24uZGV2aWNlSWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5NaWNyb3Bob25lRGV2aWNlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblx0XHRzdGF0dXMobG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLm1pY3JvcGhvbmVTZWxlY3RlZCcsIFwiezB9IHNlbGVjdGVkLlwiLCBvcHRpb24ubGFiZWwpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgdm9pY2VzIGFzIHJlYWwgYnV0dG9ucyAtIGJvcmRlciwgaG92ZXIgbGlmdCwgcHJlc3NlZCBmZWVkYmFjayAtXG5cdCAqIGJlY2F1c2UgYmFyZSB0ZXh0IGdhdmUgbm8gc2lnbiBpdCBjb3VsZCBiZSBjbGlja2VkIGF0IGFsbC4gSW4gYSBsYW5ndWFnZVxuXHQgKiBWb2ljZSBNb2RlIHNwZWFrcyBuYXRpdmVseSB0aGVyZSBpcyBvbmx5IG9uZSB2b2ljZSwgc28gdGhlIGNhcmQgcHJldmlld3Ncblx0ICogdGhhdCB2b2ljZSBpbnN0ZWFkIG9mIG9mZmVyaW5nIHRoZSBFbmdsaXNoIGNob29zZXIuXG5cdCAqXG5cdCAqIFJlLWVudHJhbnQ6IGNsZWFycyBhbnkgcHJldmlvdXNseSByZW5kZXJlZCBjaGlwcyBzbyB0aGUgY2FyZCBjYW4gcmVidWlsZFxuXHQgKiB0aGVtIHdoZW4gdGhlIHNwb2tlbiBsYW5ndWFnZSBjaGFuZ2VzLlxuXHQgKi9cblx0cHJpdmF0ZSByZW5kZXJWb2ljZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy52b2ljZXNDb250YWluZXI7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnZvaWNlc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy52b2ljZUVsZW1lbnRzLmNsZWFyKCk7XG5cdFx0ZG9tLmNsZWFyTm9kZShjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgbGFiZWxUZXh0ID0gbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlcycsIFwiQWdlbnQgVm9pY2U6XCIpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlcy1sYWJlbCcpKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxhYmVsVGV4dDtcblxuXHRcdGlmICh0aGlzLmxvY2FsaXplZFZvaWNlKSB7XG5cdFx0XHR0aGlzLnJlbmRlckxvY2FsaXplZFZvaWNlKGNvbnRhaW5lciwgbGFiZWxUZXh0LCB0aGlzLmxvY2FsaXplZFZvaWNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZXMnKSk7XG5cdFx0Z3JvdXAuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JhZGlvZ3JvdXAnKTtcblx0XHRncm91cC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbFRleHQpO1xuXG5cdFx0Zm9yIChjb25zdCB2b2ljZSBvZiBWT0lDRVMpIHtcblx0XHRcdGNvbnN0IG9wdGlvbiA9IGRvbS5hcHBlbmQoZ3JvdXAsIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlJykpO1xuXHRcdFx0b3B0aW9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdyYWRpbycpO1xuXHRcdFx0Y29uc3QgcmVzdGluZ0FyaWEgPSBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UuYXJpYUxhYmVsJywgXCJ7MH0uIEhlYXIgdGhpcyB2b2ljZSBhbmQgdXNlIGl0IGZvciBldmVyeSBjb252ZXJzYXRpb24uXCIsIHZvaWNlLmxhYmVsKTtcblx0XHRcdG9wdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCByZXN0aW5nQXJpYSk7XG5cblx0XHRcdHRoaXMuYXBwZW5kVm9pY2VJY29uKG9wdGlvbik7XG5cblx0XHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChvcHRpb24sIGRvbS4kKCdzcGFuLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZS1sYWJlbCcpKTtcblx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gdm9pY2UubGFiZWw7XG5cdFx0XHR0aGlzLnZvaWNlRWxlbWVudHMuc2V0KHZvaWNlLmlkLCB7IGVsZW1lbnQ6IG9wdGlvbiwgbGFiZWw6IHZvaWNlLmxhYmVsLCByZXN0aW5nQXJpYSB9KTtcblxuXHRcdFx0dGhpcy52b2ljZXNEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihvcHRpb24sIGRvbS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuc2VsZWN0Vm9pY2Uodm9pY2UpKSk7XG5cdFx0XHR0aGlzLnZvaWNlc0Rpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG9wdGlvbiwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZXZlbnQgPT4gdGhpcy5oYW5kbGVPcHRpb25LZXkoZXZlbnQsIHZvaWNlKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uKCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHNwb2tlbiBsYW5ndWFnZSBjaGFuZ2VkLCBzbyBzd2FwIHRoZSBjaGlwczogdGhlIGZvdXIgRW5nbGlzaCB2b2ljZXNcblx0ICogZm9yIGEgbmF0aXZlIGxhbmd1YWdlJ3Mgc2luZ2xlIHZvaWNlLCBvciBiYWNrIGFnYWluLiBOb3RoaW5nIGlzIGNhcnJpZWRcblx0ICogb3ZlciAtIGEgdm9pY2UgY2hvc2VuIGZvciB0aGUgb2xkIGxhbmd1YWdlIG1lYW5zIG5vdGhpbmcgZm9yIHRoZSBuZXcgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVGb3JMYW5ndWFnZSgpOiB2b2lkIHtcblx0XHRjb25zdCBsb2NhbGl6ZWRWb2ljZSA9IGxvY2FsaXplZFZvaWNlRm9yTGFuZ3VhZ2UodGhpcy5yZXNvbHZlU3Bva2VuTGFuZ3VhZ2UoKSk7XG5cdFx0aWYgKGxvY2FsaXplZFZvaWNlPy5pZCA9PT0gdGhpcy5sb2NhbGl6ZWRWb2ljZT8uaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoYWRWb2ljZUZvY3VzID0gdGhpcy52b2ljZXNDb250YWluZXIgPyBkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0aGlzLnZvaWNlc0NvbnRhaW5lcikgOiBmYWxzZTtcblx0XHR0aGlzLnBsYXllci5zdG9wKCk7XG5cdFx0dGhpcy5sb2NhbGl6ZWRWb2ljZSA9IGxvY2FsaXplZFZvaWNlO1xuXHRcdHRoaXMuc2VsZWN0ZWRWb2ljZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnJlbmRlclZvaWNlcygpO1xuXHRcdGlmIChoYWRWb2ljZUZvY3VzKSB7XG5cdFx0XHR0aGlzLnZvaWNlRWxlbWVudHMudmFsdWVzKCkubmV4dCgpLnZhbHVlPy5lbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBzaW5nbGUgbmF0aXZlIHZvaWNlIGZvciB0aGUgc3Bva2VuIGxhbmd1YWdlLCBhcyBhIHByZXZpZXcgYnV0dG9uOlxuXHQgKiB0aGVyZSBpcyBub3RoaW5nIHRvIGNob29zZSwgc28gaXQgb25seSBldmVyIHBsYXlzIGFuZCBzdG9wcy5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyTG9jYWxpemVkVm9pY2UoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgYXJpYUxhYmVsOiBzdHJpbmcsIHZvaWNlOiBJTG9jYWxpemVkVm9pY2UpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZXMnKSk7XG5cdFx0Z3JvdXAuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblxuXHRcdGNvbnN0IG9wdGlvbiA9IGRvbS5hcHBlbmQoZ3JvdXAsIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlJykpO1xuXHRcdG9wdGlvbi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0b3B0aW9uLnRhYkluZGV4ID0gMDtcblx0XHRjb25zdCByZXN0aW5nQXJpYSA9IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS5wcmV2aWV3QXJpYUxhYmVsJywgXCJ7MH0uIEhlYXIgaG93IHlvdXIgYWdlbnQgd2lsbCBzb3VuZC5cIiwgdm9pY2UubGFiZWwpO1xuXHRcdG9wdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCByZXN0aW5nQXJpYSk7XG5cblx0XHR0aGlzLmFwcGVuZFZvaWNlSWNvbihvcHRpb24pO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKG9wdGlvbiwgZG9tLiQoJ3NwYW4udm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlLWxhYmVsJykpO1xuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gdm9pY2UubGFiZWw7XG5cdFx0dGhpcy52b2ljZUVsZW1lbnRzLnNldCh2b2ljZS5pZCwgeyBlbGVtZW50OiBvcHRpb24sIGxhYmVsOiB2b2ljZS5sYWJlbCwgcmVzdGluZ0FyaWEgfSk7XG5cblx0XHR0aGlzLnZvaWNlc0Rpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG9wdGlvbiwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5wcmV2aWV3TG9jYWxpemVkVm9pY2Uodm9pY2UpKSk7XG5cdFx0dGhpcy52b2ljZXNEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihvcHRpb24sIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGV2ZW50KTtcblx0XHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMucHJldmlld0xvY2FsaXplZFZvaWNlKHZvaWNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGljb24gaXMgdGhlIGFmZm9yZGFuY2U6IGl0IHNheXMgXCJ0aGlzIHdpbGwgc3BlYWtcIiBiZWZvcmUgdGhlIGNsaWNrLFxuXHQgKiBhbmltYXRpbmcgYmFycyB3aGlsZSBpdCBzcGVha3MsIHRoZW4gYSBjaGVjayBvbmNlIGEgdm9pY2UgaXMgY2hvc2VuLlxuXHQgKi9cblx0cHJpdmF0ZSBhcHBlbmRWb2ljZUljb24ob3B0aW9uOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGljb24gPSBkb20uYXBwZW5kKG9wdGlvbiwgZG9tLiQoJ3NwYW4udm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlLWljb24nKSk7XG5cdFx0ZG9tLmFwcGVuZChpY29uLCBkb20uJChgc3Bhbi5jb2RpY29uLmNvZGljb24tJHtDb2RpY29uLnBsYXkuaWR9LnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZS1pZGxlYCkpLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGRvbS5hcHBlbmQoaWNvbiwgZG9tLiQoYHNwYW4uY29kaWNvbi5jb2RpY29uLSR7Q29kaWNvbi5jaGVja0NvbXBhY3QuaWR9LnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZS1jaG9zZW5gKSkuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Y29uc3QgYmFycyA9IGRvbS5hcHBlbmQoaWNvbiwgZG9tLiQoJ3NwYW4udm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlLWJhcnMnKSk7XG5cdFx0YmFycy5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRmb3IgKGxldCBiYXIgPSAwOyBiYXIgPCAzOyBiYXIrKykge1xuXHRcdFx0ZG9tLmFwcGVuZChiYXJzLCBkb20uJCgnc3Bhbi52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UtYmFyJykpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBTaGFyZWQgYmVoYXZpb3VyIC0tLVxuXG5cdHByaXZhdGUgaGFuZGxlT3B0aW9uS2V5KGV2ZW50OiBLZXlib2FyZEV2ZW50LCB2b2ljZTogSVZvaWNlTW9kZVZvaWNlKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZXZlbnQpO1xuXHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5zZWxlY3RWb2ljZSh2b2ljZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQSByYWRpb2dyb3VwIGlzIGEgc2luZ2xlIHRhYiBzdG9wOiB0aGUgYXJyb3cga2V5cyBtb3ZlIGJldHdlZW4gdGhlXG5cdFx0Ly8gb3B0aW9ucyAoc2VsZWN0aW5nIGFzIHRoZXkgZ28sIGFzIGEgcmFkaW8gZ3JvdXAgc2hvdWxkKSByYXRoZXIgdGhhbiBUYWJcblx0XHQvLyB3YWxraW5nIHRocm91Z2ggZXZlcnkgb25lIG9mIHRoZW0uXG5cdFx0Y29uc3QgZm9yd2FyZCA9IGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuUmlnaHRBcnJvdykgfHwga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpO1xuXHRcdGNvbnN0IGJhY2t3YXJkID0ga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpIHx8IGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuVXBBcnJvdyk7XG5cdFx0aWYgKGZvcndhcmQgfHwgYmFja3dhcmQpIHtcblx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGNvbnN0IGluZGV4ID0gVk9JQ0VTLmluZGV4T2Yodm9pY2UpO1xuXHRcdFx0Y29uc3QgbmV4dCA9IFZPSUNFU1soaW5kZXggKyAoZm9yd2FyZCA/IDEgOiBWT0lDRVMubGVuZ3RoIC0gMSkpICUgVk9JQ0VTLmxlbmd0aF07XG5cdFx0XHR0aGlzLnNlbGVjdFZvaWNlKG5leHQpO1xuXHRcdFx0dGhpcy52b2ljZUVsZW1lbnRzLmdldChuZXh0LmlkKT8uZWxlbWVudC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBPbmUgc2hvcnQgcGFyYWdyYXBoOiB3aGF0IFZvaWNlIE1vZGUgZG9lcywgYW5kIHdoZXJlIHRvIGNoYW5nZSBpdHNcblx0ICogc2V0dGluZ3Mgb3IgaW5zdHJ1Y3Rpb25zLlxuXHQgKlxuXHQgKiBgW1suLi5dXWAgbWFya3MgZWFjaCBjbGF1c2UgdGhhdCBiZWNvbWVzIGEgbGluaywgc28gdHJhbnNsYXRvcnMgY2FuIHBsYWNlXG5cdCAqIGl0IG5hdHVyYWxseSBpbiB0aGUgc2VudGVuY2UgaW5zdGVhZCBvZiByZWNlaXZpbmcgYSBmaXhlZCBwaHJhc2Vcblx0ICogY29uY2F0ZW5hdGVkIG9udG8gdGhlIGVuZC5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyRGVzY3JpcHRpb24oY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuY2hhdC1pbnB1dC1ub3RpY2UtZGVzY3JpcHRpb24udm9pY2UtbW9kZS1vbmJvYXJkaW5nLWRlc2NyaXB0aW9uJykpO1xuXHRcdGNvbnN0IHRleHQgPSBsb2NhbGl6ZSh7XG5cdFx0XHRrZXk6ICd2b2ljZU1vZGUub25ib2FyZGluZy5kZXNjcmlwdGlvbicsXG5cdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdCdQcmVzZXJ2ZSB0aGUgZG91YmxlIHNxdWFyZSBicmFja2V0czogdGhleSBtYXJrIHRoZSB0ZXh0IHRoYXQgYmVjb21lcyBhIGxpbmsuIEtlZXAgYm90aCBsaW5rcywgaW4gdGhpcyBvcmRlciAtIHRoZSBmaXJzdCBvcGVucyBWb2ljZSBNb2RlIHNldHRpbmdzLCB0aGUgc2Vjb25kIG9wZW5zIHRoZSB2b2ljZS5tZCBjdXN0b21pemF0aW9uIGZpbGUuJyxcblx0XHRcdF0sXG5cdFx0fSwgXCJDaG9vc2UgaG93IHlvdXIgYWdlbnQgc3BlYWtzIHRvIHlvdS4gQWRqdXN0IFtbc2V0dGluZ3NdXSBvciBbW2hvdyBpdCdzIHdyaXR0ZW5dXSBhbnl0aW1lLlwiKTtcblxuXHRcdGRvbS5hcHBlbmQoZGVzY3JpcHRpb24sIHJlbmRlckZvcm1hdHRlZFRleHQodGV4dCwge1xuXHRcdFx0YWN0aW9uSGFuZGxlcjoge1xuXHRcdFx0XHRjYWxsYmFjazogaW5kZXggPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IGluZGV4ID09PSAnMCcgPyBWT0lDRV9TRVRUSU5HU19DT01NQU5EIDogQ09ORklHVVJFX1ZPSUNFX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQ7XG5cdFx0XHRcdFx0dGhpcy5sb2dBY3Rpb24oaW5kZXggPT09ICcwJyA/ICdvcGVuU2V0dGluZ3MnIDogJ29wZW5JbnN0cnVjdGlvbnMnKTtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZClcblx0XHRcdFx0XHRcdC5jYXRjaChlcnJvciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFt2b2ljZV0gRmFpbGVkIHRvIHJ1biAke2NvbW1hbmRJZH06ICR7ZXJyb3J9YCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUsXG5cdFx0XHR9LFxuXHRcdH0sIGRvbS4kKCdzcGFuJykpKTtcblxuXHRcdC8vIGByZW5kZXJGb3JtYXR0ZWRUZXh0YCBnaXZlcyBlYWNoIGFuY2hvciBhIGNsaWNrIGxpc3RlbmVyIGFuZCBub3RoaW5nXG5cdFx0Ly8gZWxzZSwgc28gbWFrZSB0aGVtIHJlYWwgY29udHJvbHM6IHJlYWNoYWJsZSBieSBUYWIgYW5kIG9wZXJhYmxlIGJ5XG5cdFx0Ly8gRW50ZXIgb3IgU3BhY2UgbGlrZSBhbnkgb3RoZXIgYnV0dG9uLiBUaGUgcmVuZGVyZXIgb3ducyB0aGlzIERPTSwgc28gYVxuXHRcdC8vIHNlbGVjdG9yIGlzIHRoZSBvbmx5IGhhbmRsZSBvbiBpdCAtIHNhbWUgYXMgdGhlIGVtcHR5LWVkaXRvciBoaW50LlxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGZvciAoY29uc3QgbGluayBvZiBkZXNjcmlwdGlvbi5xdWVyeVNlbGVjdG9yQWxsKCdhJykpIHtcblx0XHRcdGxpbmsudGFiSW5kZXggPSAwO1xuXHRcdFx0bGluay5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGV2ZW50ID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZXZlbnQpO1xuXHRcdFx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0bGluay5jbGljaygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERpc21pc3NhbCBpcyBhbHdheXMgYXZhaWxhYmxlIGFuZCBuZXZlciBnYXRlZDogYSBkaXNhYmxlZCBjbG9zZSB3b3VsZCB0cmFwXG5cdCAqIHNvbWVvbmUgaW4gdGhlIGNhcmQuIENob29zaW5nIGEgdm9pY2UgYWxyZWFkeSBjb21taXRzIGl0LCBzbyB0aGlzIGlzIG9ubHlcblx0ICogZXZlciBcIkkgYW0gZG9uZSBoZXJlXCIgLSBhbmQgY2xvc2luZyBpcyB3aGF0IGhhbmRzIHRoZSBzZXNzaW9uIGJhY2suXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlckNsb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuYWRkRGlzbWlzc0FjdGlvbih7XG5cdFx0XHRjbGFzc05hbWU6ICd2b2ljZS1tb2RlLW9uYm9hcmRpbmctY2xvc2UnLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcuY2xvc2UnLCBcIkNsb3NlIHRoZSBpbnRyb2R1Y3Rpb25cIiksXG5cdFx0XHRvbkFjdGl2YXRlOiAoKSA9PiB0aGlzLmZpbmlzaCgpLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3BzIHRoZSBzYW1wbGUgYW5kIHRoZSB3YXZlZm9ybSB3aGlsZSB0aGUgY2FyZCBpcyBwdXQgYXdheSBmb3IgYVxuXHQgKiBub3RpZmljYXRpb24sIHNvIGFuIGludmlzaWJsZSBpbnRyb2R1Y3Rpb24gaXMgbm90IHN0aWxsIHBsYXlpbmcgYXVkaW8gb3Jcblx0ICogcGFpbnRpbmcgZXZlcnkgZnJhbWUuXG5cdCAqL1xuXHRvdmVycmlkZSBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzdXBlci5zZXRWaXNpYmxlKHZpc2libGUpO1xuXHRcdHRoaXMuYW5pbWF0b3I/LnNldFN1c3BlbmRlZCghdmlzaWJsZSk7XG5cdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLnBsYXllci5zdG9wKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZWxlY3RWb2ljZSh2b2ljZTogSVZvaWNlTW9kZVZvaWNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGxheWVyLnBsYXlpbmdWb2ljZSA9PT0gdm9pY2UuaWQpIHtcblx0XHRcdHRoaXMucGxheWVyLnN0b3AoKTtcblx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UucHJldmlld1N0b3BwZWQnLCBcInswfSBwcmV2aWV3IHN0b3BwZWQuXCIsIHZvaWNlLmxhYmVsKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubG9nQWN0aW9uKCdzZWxlY3RWb2ljZScpO1xuXHRcdHRoaXMuc2VsZWN0ZWRWb2ljZSA9IHZvaWNlO1xuXHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uKCk7XG5cdFx0dGhpcy5wbGF5ZXIucGxheSh2b2ljZS5zYW1wbGVJZCwgdm9pY2UuaWQpO1xuXHRcdHN0YXR1cyhsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2Uuc2VsZWN0ZWQnLCBcInswfSBzZWxlY3RlZC5cIiwgdm9pY2UubGFiZWwpKTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFZPSUNFX1NFVFRJTkcsIHZvaWNlLmlkLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpXG5cdFx0XHQuY2F0Y2goZXJyb3IgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbdm9pY2VdIEZhaWxlZCB0byBwZXJzaXN0IHRoZSBWb2ljZSBNb2RlIHZvaWNlOiAke2Vycm9yfWApKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbG9jYWxpemVkIHZvaWNlIGlzIG5vdCBhIGNob2ljZSAtIGl0IGlzIHRoZSBvbmx5IHZvaWNlIGZvciB0aGVcblx0ICogbGFuZ3VhZ2UgLSBzbyBwcmV2aWV3aW5nIGl0IGp1c3QgcGxheXMgYW5kIHN0b3BzLCBhbmQgbmV2ZXIgcGVyc2lzdHMuXG5cdCAqL1xuXHRwcml2YXRlIHByZXZpZXdMb2NhbGl6ZWRWb2ljZSh2b2ljZTogSUxvY2FsaXplZFZvaWNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGxheWVyLnBsYXlpbmdWb2ljZSA9PT0gdm9pY2UuaWQpIHtcblx0XHRcdHRoaXMucGxheWVyLnN0b3AoKTtcblx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UubG9jYWxpemVkU3RvcHBlZCcsIFwiezB9IHByZXZpZXcgc3RvcHBlZC5cIiwgdm9pY2UubGFiZWwpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5sb2dBY3Rpb24oJ3ByZXZpZXdWb2ljZScpO1xuXHRcdHRoaXMucGxheWVyLnBsYXkodm9pY2UuaWQpO1xuXHRcdHN0YXR1cyhsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UubG9jYWxpemVkUGxheWluZycsIFwiUGxheWluZyB7MH0gcHJldmlldy5cIiwgdm9pY2UubGFiZWwpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc3Bva2VuIGxhbmd1YWdlLCBtaXJyb3JpbmcgdGhlIHJlc29sdXRpb24gdGhlIHZvaWNlIGNsaWVudCB1c2VzOiBhblxuXHQgKiBleHBsaWNpdCB0ZXN0IG92ZXJyaWRlLCB0aGVuIHRoZSBjb25maWd1cmVkIGxhbmd1YWdlICh1bmxlc3MgYGF1dG9gKSwgdGhlblxuXHQgKiB0aGUgd2luZG93J3MgbGFuZ3VhZ2UuXG5cdCAqL1xuXHRwcml2YXRlIHJlc29sdmVTcG9rZW5MYW5ndWFnZSgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMudm9pY2VMYW5ndWFnZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3B0aW9ucy52b2ljZUxhbmd1YWdlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRMYW5ndWFnZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihWT0lDRV9MQU5HVUFHRV9TRVRUSU5HKT8udHJpbSgpO1xuXHRcdGlmIChjb25maWd1cmVkTGFuZ3VhZ2UgJiYgY29uZmlndXJlZExhbmd1YWdlLnRvTG93ZXJDYXNlKCkgIT09ICdhdXRvJykge1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyZWRMYW5ndWFnZTtcblx0XHR9XG5cdFx0cmV0dXJuIGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKS5uYXZpZ2F0b3IubGFuZ3VhZ2U7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNlbGVjdGlvbigpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtpZCwgZW50cnldIG9mIHRoaXMudm9pY2VFbGVtZW50cykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBpZCA9PT0gdGhpcy5zZWxlY3RlZFZvaWNlPy5pZDtcblx0XHRcdGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBzZWxlY3RlZCk7XG5cdFx0XHRlbnRyeS5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgU3RyaW5nKHNlbGVjdGVkKSk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlVGFiU3RvcCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEtlZXBzIGEgc2luZ2xlIHRhYiBzdG9wIG9uIHRoZSBncm91cDogdGhlIGNob3NlbiB2b2ljZSwgb3IgdGhlIGZpcnN0IG9uZVxuXHQgKiB3aGVuIG5vdGhpbmcgaGFzIGJlZW4gY2hvc2VuIHlldC5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlVGFiU3RvcCgpOiB2b2lkIHtcblx0XHRsZXQgZmlyc3QgPSB0cnVlO1xuXHRcdGZvciAoY29uc3QgW2lkLCBlbnRyeV0gb2YgdGhpcy52b2ljZUVsZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBpc1RhYlN0b3AgPSB0aGlzLnNlbGVjdGVkVm9pY2UgPT09IHVuZGVmaW5lZCA/IGZpcnN0IDogaWQgPT09IHRoaXMuc2VsZWN0ZWRWb2ljZS5pZDtcblx0XHRcdGVudHJ5LmVsZW1lbnQudGFiSW5kZXggPSBpc1RhYlN0b3AgPyAwIDogLTE7XG5cdFx0XHRmaXJzdCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUGxheWluZyhwbGF5aW5nVm9pY2U6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2lkLCBlbnRyeV0gb2YgdGhpcy52b2ljZUVsZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBwbGF5aW5nID0gaWQgPT09IHBsYXlpbmdWb2ljZTtcblx0XHRcdGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgncGxheWluZycsIHBsYXlpbmcpO1xuXHRcdFx0ZW50cnkuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBwbGF5aW5nXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLnN0b3BQcmV2aWV3JywgXCJTdG9wIHswfSBwcmV2aWV3LlwiLCBlbnRyeS5sYWJlbClcblx0XHRcdFx0OiBlbnRyeS5yZXN0aW5nQXJpYSk7XG5cdFx0fVxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdwbGF5aW5nJywgcGxheWluZ1ZvaWNlICE9PSB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5pc2goKTogdm9pZCB7XG5cdFx0dGhpcy5wbGF5ZXIuc3RvcCgpO1xuXHRcdHRoaXMubG9nQWN0aW9uKCdjbG9zZScpO1xuXHRcdHRoaXMub3B0aW9ucy5vbkRpc21pc3MoKTtcblx0fVxuXG5cdHByaXZhdGUgbG9nQWN0aW9uKGFjdGlvbjogVm9pY2VNb2RlT25ib2FyZGluZ0FjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZvaWNlTW9kZU9uYm9hcmRpbmdBY3Rpb25FdmVudCwgVm9pY2VNb2RlT25ib2FyZGluZ0FjdGlvbkNsYXNzaWZpY2F0aW9uPihcblx0XHRcdCd2b2ljZU1vZGVPbmJvYXJkaW5nLmFjdGlvbicsXG5cdFx0XHR7IGFjdGlvbiwgc291cmNlOiB0aGlzLm9wdGlvbnMuc291cmNlIH1cblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlPigndm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzVmlzaWJsZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBjb250YWluZXIgdGhhdCBjYW4gaG9zdCB0aGUgYmFubmVyIChhIGNoYXQgaW5wdXQpLiBUaGUgbW9zdFxuXHQgKiByZWNlbnRseSBmb2N1c2VkIGhvc3Qgd2lucyB3aGVuIHRoZSBiYW5uZXIgaXMgc2hvd24uXG5cdCAqL1xuXHRyZWdpc3Rlckhvc3Qob3B0aW9uczogSUNoYXRJbnB1dE9uYm9hcmRpbmdIb3N0T3B0aW9ucyk6IElEaXNwb3NhYmxlO1xuXG5cdC8qKlxuXHQgKiBTaG93IHRoZSBpbnRyb2R1Y3Rpb24gaWYgdGhlIHVzZXIgaGFzIG5ldmVyIHNlZW4gaXQuIE1hcmtzIGl0IGFzIHNlZW4gb25cblx0ICogdGhlIGZpcnN0IHN1Y2Nlc3NmdWwgc2hvdywgc28gaXQgbmV2ZXIgYXBwZWFycyBhZ2Fpbi5cblx0ICovXG5cdHNob3dJZk5lZWRlZCgpOiB2b2lkO1xuXG5cdC8qKiBTaG93IHRoZSBpbnRyb2R1Y3Rpb24gYWdhaW4gcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0IGhhcyBiZWVuIHNlZW4uICovXG5cdHNob3coKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvbmJvYXJkaW5nOiBDaGF0SW5wdXRPbmJvYXJkaW5nO1xuXG5cdGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMub25ib2FyZGluZy5pc1Zpc2libGU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMub25ib2FyZGluZyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0T25ib2FyZGluZywge1xuXHRcdFx0c3RvcmFnZUtleTogQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5JbnRyb0Jhbm5lclNob3duLFxuXHRcdH0pKTtcblx0fVxuXG5cdHJlZ2lzdGVySG9zdChvcHRpb25zOiBJQ2hhdElucHV0T25ib2FyZGluZ0hvc3RPcHRpb25zKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLm9uYm9hcmRpbmcucmVnaXN0ZXJIb3N0KG9wdGlvbnMpO1xuXHR9XG5cblx0c2hvd0lmTmVlZGVkKCk6IHZvaWQge1xuXHRcdHRoaXMub25ib2FyZGluZy5zaG93SWZOZWVkZWQoY29udGV4dCA9PiB0aGlzLmNyZWF0ZUJhbm5lcihjb250ZXh0LCAnYXV0b21hdGljJykpO1xuXHR9XG5cblx0c2hvdygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5vbmJvYXJkaW5nLnNob3coY29udGV4dCA9PiB0aGlzLmNyZWF0ZUJhbm5lcihjb250ZXh0LCAnbWFudWFsJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVCYW5uZXIoY29udGV4dDogSUNoYXRJbnB1dE9uYm9hcmRpbmdDb250ZXh0LCBzb3VyY2U6ICdhdXRvbWF0aWMnIHwgJ21hbnVhbCcpOiBWb2ljZU1vZGVPbmJvYXJkaW5nQmFubmVyIHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZU1vZGVPbmJvYXJkaW5nQmFubmVyLCB7XG5cdFx0XHRjb250YWluZXI6IGNvbnRleHQuY29udGFpbmVyLFxuXHRcdFx0b25EaXNtaXNzOiAoKSA9PiBjb250ZXh0LmRpc21pc3MoZG9tLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQoY29udGV4dC5jb250YWluZXIpKSxcblx0XHRcdHNvdXJjZSxcblx0XHR9KTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UsIFZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsY0FBYztBQUN2QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVB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SUFDckI7QUFDQSxTQUFLLFFBQVEsVUFBVSxPQUFPLFdBQVcsaUJBQWlCLE1BQVM7QUFBQSxFQUNwRTtBQUFBLEVBRVEsU0FBZTtBQUN0QixTQUFLLE9BQU8sS0FBSztBQUNqQixTQUFLLFVBQVUsT0FBTztBQUN0QixTQUFLLFFBQVEsVUFBVTtBQUFBLEVBQ3hCO0FBQUEsRUFFUSxVQUFVLFFBQXlDO0FBQzFELFNBQUssaUJBQWlCO0FBQUEsTUFDckI7QUFBQSxNQUNBLEVBQUUsUUFBUSxRQUFRLEtBQUssUUFBUSxPQUFPO0FBQUEsSUFDdkM7QUFBQSxFQUNEO0FBQ0Q7QUE5ZWEsNEJBQU47QUFBQSxFQXlCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBL0JVO0FBZ2ZOLE1BQU0sOEJBQThCLGdCQUE2Qyw0QkFBNEI7QUFzQjdHLElBQU0sNkJBQU4sY0FBeUMsV0FBa0Q7QUFBQSxFQVVqRyxZQUN5QyxzQkFDdkM7QUFDRCxVQUFNO0FBRmtDO0FBSXhDLFNBQUssYUFBYSxLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSxxQkFBcUI7QUFBQSxNQUM5RixZQUFZLHVCQUF1QjtBQUFBLElBQ3BDLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQVpBLElBQUksWUFBcUI7QUFDeEIsV0FBTyxLQUFLLFdBQVc7QUFBQSxFQUN4QjtBQUFBLEVBWUEsYUFBYSxTQUF1RDtBQUNuRSxXQUFPLEtBQUssV0FBVyxhQUFhLE9BQU87QUFBQSxFQUM1QztBQUFBLEVBRUEsZUFBcUI7QUFDcEIsU0FBSyxXQUFXLGFBQWEsYUFBVyxLQUFLLGFBQWEsU0FBUyxXQUFXLENBQUM7QUFBQSxFQUNoRjtBQUFBLEVBRUEsT0FBZ0I7QUFDZixXQUFPLEtBQUssV0FBVyxLQUFLLGFBQVcsS0FBSyxhQUFhLFNBQVMsUUFBUSxDQUFDO0FBQUEsRUFDNUU7QUFBQSxFQUVRLGFBQWEsU0FBc0MsUUFBMkQ7QUFDckgsV0FBTyxLQUFLLHFCQUFxQixlQUFlLDJCQUEyQjtBQUFBLE1BQzFFLFdBQVcsUUFBUTtBQUFBLE1BQ25CLFdBQVcsTUFBTSxRQUFRLFFBQVEsSUFBSSwwQkFBMEIsUUFBUSxTQUFTLENBQUM7QUFBQSxNQUNqRjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXZDYSw2QkFBTjtBQUFBLEVBV0o7QUFBQSxHQVhVO0FBeUNiLGtCQUFrQiw2QkFBNkIsNEJBQTRCLGtCQUFrQixPQUFPOyIsCiAgIm5hbWVzIjogWyJsYWJlbCJdCn0K
