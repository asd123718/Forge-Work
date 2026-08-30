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
import * as dom from "../../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../../base/browser/formattedTextRenderer.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { SelectBox } from "../../../../../base/browser/ui/selectBox/selectBox.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { defaultSelectBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { AgentsVoiceStorageKeys } from "../../../agentsVoice/common/agentsVoice.js";
import { CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID } from "../actions/configureVoiceInstructionsAction.js";
import { ChatInputOnboarding } from "../widget/input/chatInputOnboarding.js";
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from "../widget/input/chatInputNoticeWidget.js";
import "./media/dictationOnboarding.css";
const DICTATION_INTRO_SHOWN_KEY = "chat.dictation.introShown";
const SHOW_DICTATION_ONBOARDING_COMMAND = "workbench.action.chat.showSpeechToTextIntroduction";
const RESET_DICTATION_ONBOARDING_COMMAND = "workbench.action.chat.resetSpeechToTextIntroduction";
const OPEN_SETTINGS_COMMAND = "workbench.action.openSettings";
const DICTATION_SETTINGS_QUERY = "dictation";
const SYSTEM_DEFAULT_DEVICE_ID = "";
const BAR_WIDTH = 1;
const BAR_GAP = 2;
const IDLE_GAIN = 0.55;
const SPEAKING_GAIN = 0.45;
const LEVEL_EASING = 0.12;
const RESTING_OPACITY = 0.35;
const SPEAKING_OPACITY = 0.5;
const UNAVAILABLE_OPACITY = 0.2;
const REDUCED_MOTION_PAINT_INTERVAL_MS = 100;
function readMicrophoneLevel(analyser, waveform) {
  if (!analyser || !waveform) {
    return 0;
  }
  analyser.getByteTimeDomainData(waveform);
  let sum = 0;
  for (const sample of waveform) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / waveform.length) * 4);
}
const WAVES = [
  { frequency: 1, amplitude: 0.42, speed: 0.42, phase: 0 },
  { frequency: 1.7, amplitude: 0.26, speed: -0.31, phase: 1.1 },
  { frequency: 2.6, amplitude: 0.19, speed: 0.24, phase: 2.4 },
  { frequency: 4.1, amplitude: 0.13, speed: -0.18, phase: 0.7 }
];
function bandFraction(position, time) {
  let amplitude = 0;
  let total = 0;
  for (const wave of WAVES) {
    const phase = position * wave.frequency * Math.PI * 2 + time * wave.speed + wave.phase;
    amplitude += (0.5 + 0.5 * Math.sin(phase)) * wave.amplitude;
    total += wave.amplitude;
  }
  if (total === 0) {
    return 0;
  }
  const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, position)));
  return amplitude / total * (0.35 + 0.65 * taper);
}
var MicrophonePreviewError = /* @__PURE__ */ ((MicrophonePreviewError2) => {
  MicrophonePreviewError2["Denied"] = "denied";
  MicrophonePreviewError2["NoDevice"] = "noDevice";
  MicrophonePreviewError2["Unavailable"] = "unavailable";
  return MicrophonePreviewError2;
})(MicrophonePreviewError || {});
let MicrophonePreview = class extends Disposable {
  constructor(element, mediaDevices, logService) {
    super();
    this.element = element;
    this.mediaDevices = mediaDevices;
    this.logService = logService;
    this.session = this._register(new MutableDisposable());
    this._onDidChangeError = this._register(new Emitter());
    /** Fires with the reason no level is available, or `undefined` once one is. */
    this.onDidChangeError = this._onDidChangeError.event;
  }
  get error() {
    return this._error;
  }
  /**
   * Current loudness, `0..1`, or `0` when nothing is being heard. Read every
   * frame, so it stays allocation-free.
   */
  getLevel() {
    return readMicrophoneLevel(this.analyser, this.waveform);
  }
  /**
   * Listen to `deviceId` (empty means the system default). Replaces any stream
   * already running, so switching devices never leaves two microphones open.
   */
  async listen(deviceId) {
    if (this._store.isDisposed) {
      return;
    }
    this.releaseMicrophone();
    const targetWindow = dom.getWindow(this.element);
    if (!this.mediaDevices?.getUserMedia) {
      this.setError("unavailable" /* Unavailable */);
      return;
    }
    const constraints = { channelCount: 1, echoCancellation: true, noiseSuppression: true };
    if (deviceId) {
      constraints.deviceId = { exact: deviceId };
    }
    let stream;
    try {
      stream = await this.mediaDevices.getUserMedia({ audio: constraints });
    } catch (error) {
      this.setError(toPreviewError(error));
      this.logService.trace(`[chat-stt] microphone preview unavailable: ${error}`);
      return;
    }
    const store = new DisposableStore();
    store.add(toDisposable(() => stream.getTracks().forEach((track) => track.stop())));
    let analyser;
    try {
      const context = new targetWindow.AudioContext();
      store.add(toDisposable(() => void context.close().catch(() => {
      })));
      if (context.state === "suspended") {
        await context.resume();
      }
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
    } catch (error) {
      store.dispose();
      this.setError("unavailable" /* Unavailable */);
      this.logService.trace(`[chat-stt] microphone preview analyser unavailable: ${error}`);
      return;
    }
    if (this._store.isDisposed) {
      store.dispose();
      return;
    }
    this.session.value = store;
    this.analyser = analyser;
    this.waveform = new Uint8Array(analyser.fftSize);
    this.setError(void 0);
  }
  /**
   * Hand the microphone back. Called before dictation acquires its own stream:
   * two captures of one device is what makes the audio service drop the
   * capture, so the preview always lets go first.
   */
  releaseMicrophone() {
    this.analyser = void 0;
    this.waveform = void 0;
    this.session.clear();
  }
  setError(error) {
    if (this._error === error) {
      return;
    }
    this._error = error;
    this._onDidChangeError.fire(error);
  }
};
MicrophonePreview = __decorateClass([
  __decorateParam(2, ILogService)
], MicrophonePreview);
function toPreviewError(error) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "denied" /* Denied */;
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "noDevice" /* NoDevice */;
    }
  }
  return "unavailable" /* Unavailable */;
}
let MicrophoneWaveform = class extends Disposable {
  constructor(container, source, observerCtor, accessibilityService) {
    super();
    this.container = container;
    this.source = source;
    this.accessibilityService = accessibilityService;
    this.bars = [];
    this.animationFrame = this._register(new MutableDisposable());
    this.running = false;
    this.lastPaint = 0;
    this.level = 0;
    container.setAttribute("aria-hidden", "true");
    const observer = new (observerCtor ?? dom.getWindow(container).ResizeObserver)(() => this.layout());
    observer.observe(container);
    this._register(toDisposable(() => observer.disconnect()));
    this.layout();
    this._register(toDisposable(() => this.stop()));
  }
  /** Rebuild the row for the current width, if the count actually changed. */
  layout() {
    const width = this.container.clientWidth;
    if (!width) {
      return;
    }
    const count = Math.max(1, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
    if (count === this.bars.length) {
      return;
    }
    dom.clearNode(this.container);
    this.bars = [];
    for (let i = 0; i < count; i++) {
      this.bars.push(dom.append(this.container, dom.$("span.dictation-onboarding-bar")));
    }
  }
  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    const targetWindow = dom.getWindow(this.container);
    const tick = () => {
      if (!this.running) {
        return;
      }
      this.update(targetWindow.performance.now());
      this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, tick);
    };
    this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, tick);
  }
  stop() {
    this.running = false;
    this.animationFrame.clear();
  }
  update(timestamp) {
    const interval = this.accessibilityService.isMotionReduced() ? REDUCED_MOTION_PAINT_INTERVAL_MS : 0;
    if (timestamp - this.lastPaint < interval) {
      return;
    }
    this.lastPaint = timestamp;
    this.level += (this.source.getLevel() - this.level) * LEVEL_EASING;
    const gain = IDLE_GAIN + this.level * SPEAKING_GAIN;
    const time = timestamp * 1e-3;
    this.container.style.opacity = (this.source.isAvailable() ? RESTING_OPACITY + this.level * SPEAKING_OPACITY : UNAVAILABLE_OPACITY).toFixed(3);
    const count = this.bars.length;
    for (let i = 0; i < count; i++) {
      const position = count > 1 ? i / (count - 1) : 0;
      const amount = Math.max(0.08, Math.min(1, bandFraction(position, time) * gain));
      this.bars[i].style.transform = `scaleY(${amount.toFixed(3)})`;
    }
  }
};
MicrophoneWaveform = __decorateClass([
  __decorateParam(3, IAccessibilityService)
], MicrophoneWaveform);
function buildMicrophoneOptions(devices) {
  const seen = /* @__PURE__ */ new Set();
  const microphones = [];
  for (const device of devices) {
    if (device.kind !== "audioinput" || device.deviceId === "default" || device.deviceId === "communications") {
      continue;
    }
    if (seen.has(device.deviceId)) {
      continue;
    }
    seen.add(device.deviceId);
    microphones.push(device);
  }
  if (microphones.length === 0) {
    return [{
      deviceId: SYSTEM_DEFAULT_DEVICE_ID,
      label: localize("dictation.onboarding.systemDefault", "System default")
    }];
  }
  const defaultDevice = devices.find((device) => device.kind === "audioinput" && device.deviceId === "default");
  const defaultLabel = defaultDevice?.label.replace(/^(?:default|system default)\s*-\s*/i, "").trim();
  const defaultMicrophone = defaultDevice ? microphones.find(
    (device) => defaultDevice.groupId && device.groupId === defaultDevice.groupId || defaultLabel && device.label === defaultLabel
  ) ?? microphones[0] : void 0;
  const options = [];
  if (defaultDevice) {
    const label = defaultMicrophone?.label || defaultLabel;
    options.push({
      deviceId: SYSTEM_DEFAULT_DEVICE_ID,
      label: label ? localize("dictation.onboarding.defaultDevice", "{0} (System default)", label) : localize("dictation.onboarding.systemDefault", "System default")
    });
  }
  for (const device of microphones) {
    if (device === defaultMicrophone) {
      continue;
    }
    options.push({
      deviceId: device.deviceId,
      // Labels are empty until microphone permission has been granted at
      // least once; a truncated id is still better than a blank row.
      label: device.label || localize("dictation.onboarding.unknownDevice", "Unknown device ({0})", device.deviceId.slice(0, 8))
    });
  }
  return options;
}
function indexOfMicrophone(options, deviceId) {
  const index = options.findIndex((option) => option.deviceId === deviceId);
  return index === -1 ? 0 : index;
}
let DictationOnboardingBanner = class extends ChatInputNoticeWidget {
  constructor(bannerOptions, mediaDevices, commandService, contextViewService, instantiationService, logService, storageService, telemetryService) {
    super({
      container: bannerOptions.container,
      variant: ChatInputNoticeVariant.Onboarding,
      className: "dictation-onboarding-banner",
      ariaLabel: localize("dictation.onboarding.region", "Dictation introduction"),
      ariaDescription: bannerOptions.previewMicrophone ? localize("dictation.onboarding.regionDescription.preview", "Say anything to check your microphone.") : localize("dictation.onboarding.regionDescription", "Speak and it becomes text."),
      onEscape: () => this.dismiss("escape")
    });
    this.bannerOptions = bannerOptions;
    this.mediaDevices = mediaDevices;
    this.commandService = commandService;
    this.contextViewService = contextViewService;
    this.logService = logService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this.picker = this._register(new MutableDisposable());
    this.options = [];
    const header = dom.append(this.domNode, dom.$(".dictation-onboarding-header"));
    const title = dom.append(header, dom.$(".chat-input-notice-title.dictation-onboarding-title"));
    title.textContent = localize("dictation.onboarding.title", "Dictation");
    this.renderDescription(header);
    this.renderClose();
    const device = dom.append(this.domNode, dom.$(".dictation-onboarding-device"));
    this.pickerContainer = dom.append(device, dom.$(".chat-input-notice-picker.dictation-onboarding-picker"));
    this.options = [{
      deviceId: SYSTEM_DEFAULT_DEVICE_ID,
      label: localize("dictation.onboarding.systemDefault", "System default")
    }];
    this.renderPicker();
    if (this.mediaDevices) {
      this._register(dom.addDisposableListener(this.mediaDevices, "devicechange", () => void this.refreshMicrophones()));
    }
    const waveformContainer = dom.append(device, dom.$(".dictation-onboarding-waveform"));
    if (this.bannerOptions.previewMicrophone) {
      const preview = this.preview = this._register(instantiationService.createInstance(MicrophonePreview, this.domNode, this.mediaDevices));
      this.waveform = this._register(instantiationService.createInstance(MicrophoneWaveform, waveformContainer, {
        getLevel: () => preview.getLevel(),
        isAvailable: () => preview.error === void 0
      }, void 0));
      this._register(preview.onDidChangeError(() => this.updateHint()));
      this.hint = dom.append(this.domNode, dom.$(".dictation-onboarding-hint"));
      this.hint.setAttribute("aria-live", "polite");
      this.updateHint();
      void this.startPreview();
    } else {
      this.waveform = this._register(instantiationService.createInstance(MicrophoneWaveform, waveformContainer, {
        getLevel: () => readMicrophoneLevel(this.dictationAnalyser, this.dictationWaveform),
        isAvailable: () => this.dictationAnalyser !== void 0
      }, void 0));
      void this.refreshMicrophones();
    }
    this.waveform.start();
    this.logAction("shown");
  }
  /**
   * Stops the waveform and releases the microphone while the card is put away
   * for a notification, so an invisible introduction never holds the microphone
   * open or keeps painting.
   */
  setVisible(visible) {
    super.setVisible(visible);
    if (visible) {
      this.waveform.start();
      if (this.preview) {
        void this.startPreview();
      }
    } else {
      this.waveform.stop();
      this.preview?.releaseMicrophone();
    }
  }
  /**
   * What dictation is, and that none of it is fixed. The card is shown once, so
   * the two things a user might want to change afterwards - whether dictation
   * runs at all, and how it writes what they say - have to be reachable from
   * here rather than left to a command nobody knows to look for.
   *
   * `[[...]]` marks the clauses that become links, so translators can keep the
   * sentence natural instead of having fixed phrases concatenated on.
   */
  renderDescription(container) {
    const description = dom.append(container, dom.$(".chat-input-notice-description.dictation-onboarding-description"));
    const text = localize({
      key: "dictation.onboarding.description",
      comment: ["Preserve the double square brackets: they mark the text that becomes a link. Keep both links, in this order - the first opens settings, the second opens the customization file."]
    }, "Speak and it becomes text. Adjust [[settings]] or [[how it's written]] any time.");
    dom.append(description, renderFormattedText(text, {
      actionHandler: {
        // The handler is given the link's index, so the two are told apart
        // by position - hence the ordering note to translators above.
        callback: (index) => {
          const [commandId, ...args] = index === "0" ? [OPEN_SETTINGS_COMMAND, { query: DICTATION_SETTINGS_QUERY }] : [CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID];
          this.logAction(index === "0" ? "openSettings" : "openInstructions");
          this.commandService.executeCommand(commandId, ...args).catch((error) => this.logService.error(`[chat-stt] failed to open dictation customization: ${error}`));
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
   * Bring the card to life. The device list and the microphone are started
   * together rather than in sequence: `getUserMedia` can take a second or more
   * to return, and waiting for it would leave the picker empty for that whole
   * time. Enumeration is repeated once the microphone is live, because device
   * labels stay blank until permission has been granted at least once.
   */
  async startPreview() {
    if (!this.preview) {
      return;
    }
    const listening = this.preview.listen(this.currentDeviceId());
    await Promise.all([listening, this.refreshMicrophones()]);
    await this.refreshMicrophones();
  }
  currentDeviceId() {
    return this.storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION, SYSTEM_DEFAULT_DEVICE_ID);
  }
  async refreshMicrophones(analyserNode, switchMicrophone) {
    if (this._store.isDisposed) {
      return;
    }
    this.switchMicrophone = switchMicrophone ?? this.switchMicrophone;
    if (!this.preview && analyserNode) {
      this.dictationAnalyser = analyserNode;
      this.dictationWaveform = new Uint8Array(analyserNode.fftSize);
    }
    if (!this.preview && !this.dictationAnalyser) {
      return;
    }
    if (!this.mediaDevices?.enumerateDevices) {
      return;
    }
    let devices;
    try {
      devices = await this.mediaDevices.enumerateDevices();
    } catch (error) {
      this.logService.trace(`[chat-stt] could not enumerate microphones: ${error}`);
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    const options = buildMicrophoneOptions(devices);
    if (options.length > 1 && !devices.some((device) => device.kind === "audioinput" && device.label)) {
      return;
    }
    this.options = options;
    this.renderPicker();
  }
  /** A picker with one entry is not a choice, so only show this row for multiple microphones. */
  renderPicker() {
    if (!this.pickerContainer) {
      return;
    }
    this.picker.clear();
    dom.clearNode(this.pickerContainer);
    this.pickerContainer.hidden = this.options.length <= 1;
    if (this.pickerContainer.hidden) {
      return;
    }
    dom.append(this.pickerContainer, dom.$(`span.codicon.codicon-${Codicon.mic.id}.dictation-onboarding-picker-icon`)).setAttribute("aria-hidden", "true");
    const selected = indexOfMicrophone(this.options, this.currentDeviceId());
    const store = new DisposableStore();
    const selectBox = store.add(new SelectBox(
      this.options.map((option) => ({ text: option.label })),
      selected,
      this.contextViewService,
      { ...defaultSelectBoxStyles, selectBackground: void 0, selectBorder: void 0, selectForeground: void 0 },
      { ariaLabel: localize("dictation.onboarding.microphone", "Microphone"), useCustomDrawn: true }
    ));
    selectBox.render(this.pickerContainer);
    store.add(selectBox.onDidSelect((event) => this.selectMicrophone(event.index)));
    this.picker.value = store;
  }
  selectMicrophone(index) {
    const option = this.options[index];
    if (!option) {
      return;
    }
    this.logAction("selectMicrophone");
    if (option.deviceId) {
      this.storageService.store(AgentsVoiceStorageKeys.MicrophoneDevice, option.deviceId, StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
    }
    status(localize("dictation.onboarding.microphoneSelected", "{0} selected.", option.label));
    if (this.preview) {
      void this.preview.listen(option.deviceId).then(() => this.updateHint());
    } else if (this.switchMicrophone) {
      void this.switchMicrophone(option.deviceId).then((analyser) => this.refreshMicrophones(analyser)).catch((error) => this.logService.error(`[chat-stt] failed to switch dictation microphone: ${error}`));
    }
  }
  /**
   * The hint only speaks when the microphone cannot be read. At rest the
   * moving waveform is the instruction - a line of text telling you to talk is
   * one the card can do without.
   */
  updateHint() {
    if (!this.preview || !this.hint) {
      return;
    }
    const error = this.preview.error;
    this.domNode.classList.toggle("has-error", error !== void 0);
    this.hint.textContent = error === void 0 ? "" : hintForError(error);
  }
  renderClose() {
    this.addDismissAction({
      className: "dictation-onboarding-close",
      ariaLabel: localize("dictation.onboarding.close", "Close the introduction"),
      onActivate: () => this.dismiss("close")
    });
  }
  dismiss(action) {
    this.logAction(action);
    this.waveform.stop();
    this.preview?.releaseMicrophone();
    this.bannerOptions.onDismiss();
  }
  logAction(action) {
    this.telemetryService.publicLog2(
      "dictationOnboarding.action",
      { action, source: this.bannerOptions.source }
    );
  }
};
DictationOnboardingBanner = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, ITelemetryService)
], DictationOnboardingBanner);
function hintForError(error) {
  switch (error) {
    case "denied" /* Denied */:
      return localize("dictation.onboarding.denied", "No microphone access. Check your system privacy settings.");
    case "noDevice" /* NoDevice */:
      return localize("dictation.onboarding.noDevice", "No microphone found.");
    default:
      return localize("dictation.onboarding.unavailable", "Can't read the microphone level.");
  }
}
const IDictationOnboardingService = createDecorator("dictationOnboardingService");
let DictationOnboardingService = class extends Disposable {
  constructor(instantiationService, storageService) {
    super();
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.onboarding = this._register(this.instantiationService.createInstance(ChatInputOnboarding, {
      storageKey: DICTATION_INTRO_SHOWN_KEY
    }));
  }
  get isVisible() {
    return this.onboarding.isVisible;
  }
  registerHost(options) {
    return this.onboarding.registerHost(options);
  }
  showIfNeeded() {
    return this.onboarding.showIfNeeded((context) => this.createBanner(context.container, context.dismiss, "automatic", false));
  }
  show() {
    return this.onboarding.show((context) => this.createBanner(context.container, context.dismiss, "manual", true));
  }
  refreshMicrophones(analyserNode, switchMicrophone) {
    if (this.onboarding.isVisible) {
      void this.currentBanner?.refreshMicrophones(analyserNode, switchMicrophone);
    }
  }
  reset() {
    this.storageService.remove(DICTATION_INTRO_SHOWN_KEY, StorageScope.APPLICATION);
  }
  createBanner(container, dismiss, source, previewMicrophone) {
    const banner = this.instantiationService.createInstance(DictationOnboardingBanner, {
      container,
      onDismiss: dismiss,
      previewMicrophone,
      source
    }, dom.getWindow(container).navigator.mediaDevices);
    this.currentBanner = banner;
    return banner;
  }
};
DictationOnboardingService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService)
], DictationOnboardingService);
registerSingleton(IDictationOnboardingService, DictationOnboardingService, InstantiationType.Delayed);
export {
  DictationOnboardingBanner,
  DictationOnboardingService,
  IDictationOnboardingService,
  RESET_DICTATION_ONBOARDING_COMMAND,
  SHOW_DICTATION_ONBOARDING_COMMAND,
  buildMicrophoneOptions,
  indexOfMicrophone
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHNwZWVjaFRvVGV4dFxcZGljdGF0aW9uT25ib2FyZGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckZvcm1hdHRlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgU2VsZWN0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRzVm9pY2VTdG9yYWdlS2V5cyB9IGZyb20gJy4uLy4uLy4uL2FnZW50c1ZvaWNlL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5pbXBvcnQgeyBDT05GSUdVUkVfRElDVEFUSU9OX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQgfSBmcm9tICcuLi9hY3Rpb25zL2NvbmZpZ3VyZVZvaWNlSW5zdHJ1Y3Rpb25zQWN0aW9uLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE9uYm9hcmRpbmcsIElDaGF0SW5wdXRPbmJvYXJkaW5nQmFubmVyLCBJQ2hhdElucHV0T25ib2FyZGluZ0hvc3RPcHRpb25zIH0gZnJvbSAnLi4vd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWNlVmFyaWFudCwgQ2hhdElucHV0Tm90aWNlV2lkZ2V0IH0gZnJvbSAnLi4vd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGljZVdpZGdldC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvZGljdGF0aW9uT25ib2FyZGluZy5jc3MnO1xuXG4vKipcbiAqIE1hcmtzIHRoZSBpbnRyb2R1Y3Rpb24gYXMgc2Vlbi4gRGljdGF0aW9uLXNjb3BlZCBhbmQgZGVsaWJlcmF0ZWx5IHNlcGFyYXRlXG4gKiBmcm9tIHRoZSBWb2ljZSBNb2RlIGludHJvZHVjdGlvbiwgc28gbmVpdGhlciBmZWF0dXJlJ3MgY2FyZCBzdXBwcmVzc2VzIHRoZVxuICogb3RoZXIncy5cbiAqL1xuY29uc3QgRElDVEFUSU9OX0lOVFJPX1NIT1dOX0tFWSA9ICdjaGF0LmRpY3RhdGlvbi5pbnRyb1Nob3duJztcblxuZXhwb3J0IGNvbnN0IFNIT1dfRElDVEFUSU9OX09OQk9BUkRJTkdfQ09NTUFORCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc2hvd1NwZWVjaFRvVGV4dEludHJvZHVjdGlvbic7XG5leHBvcnQgY29uc3QgUkVTRVRfRElDVEFUSU9OX09OQk9BUkRJTkdfQ09NTUFORCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzZXRTcGVlY2hUb1RleHRJbnRyb2R1Y3Rpb24nO1xuXG4vKiogT3BlbnMgdGhlIHNldHRpbmdzIGVkaXRvciwgZmlsdGVyZWQgYnkgdGhlIHF1ZXJ5IGJlbG93LiAqL1xuY29uc3QgT1BFTl9TRVRUSU5HU19DT01NQU5EID0gJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJztcblxuLyoqIE5hcnJvd3Mgc2V0dGluZ3MgdG8gZGljdGF0aW9uJ3Mgb3duOiBlbmFibGVkLCBtb2RlbCwgc2hvd1RyYW5zY3JpcHQuICovXG5jb25zdCBESUNUQVRJT05fU0VUVElOR1NfUVVFUlkgPSAnZGljdGF0aW9uJztcblxuLyoqIFRoZSBgZGV2aWNlSWRgIHZhbHVlIHRoYXQgbWVhbnMgXCJ3aGF0ZXZlciB0aGUgc3lzdGVtIGlzIHVzaW5nXCIuICovXG5jb25zdCBTWVNURU1fREVGQVVMVF9ERVZJQ0VfSUQgPSAnJztcblxudHlwZSBEaWN0YXRpb25NZWRpYURldmljZXMgPSBQaWNrPE1lZGlhRGV2aWNlcywgJ2FkZEV2ZW50TGlzdGVuZXInIHwgJ3JlbW92ZUV2ZW50TGlzdGVuZXInIHwgJ2Rpc3BhdGNoRXZlbnQnIHwgJ2VudW1lcmF0ZURldmljZXMnIHwgJ2dldFVzZXJNZWRpYSc+O1xudHlwZSBTd2l0Y2hNaWNyb3Bob25lID0gKGRldmljZUlkOiBzdHJpbmcpID0+IFByb21pc2U8QW5hbHlzZXJOb2RlIHwgdW5kZWZpbmVkPjtcblxudHlwZSBEaWN0YXRpb25PbmJvYXJkaW5nQWN0aW9uID0gJ3Nob3duJyB8ICdzZWxlY3RNaWNyb3Bob25lJyB8ICdvcGVuU2V0dGluZ3MnIHwgJ29wZW5JbnN0cnVjdGlvbnMnIHwgJ2Nsb3NlJyB8ICdlc2NhcGUnO1xuXG50eXBlIERpY3RhdGlvbk9uYm9hcmRpbmdBY3Rpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0YWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhY3Rpb24gdGFrZW4gaW4gdGhlIERpY3RhdGlvbiBvbmJvYXJkaW5nIGNhcmQuJyB9O1xuXHRzb3VyY2U6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgY2FyZCBhcHBlYXJlZCBhdXRvbWF0aWNhbGx5IG9uIGZpcnN0IHVzZSBvciB3YXMgb3BlbmVkIG1hbnVhbGx5LicgfTtcblx0b3duZXI6ICdtZWdhbnJvZ2dlJztcblx0Y29tbWVudDogJ1RyYWNrcyBlbmdhZ2VtZW50IHdpdGggdGhlIERpY3RhdGlvbiBvbmJvYXJkaW5nIGNhcmQuJztcbn07XG5cbnR5cGUgRGljdGF0aW9uT25ib2FyZGluZ0FjdGlvbkV2ZW50ID0ge1xuXHRhY3Rpb246IERpY3RhdGlvbk9uYm9hcmRpbmdBY3Rpb247XG5cdHNvdXJjZTogJ2F1dG9tYXRpYycgfCAnbWFudWFsJztcbn07XG5cbi8vIC0tLSBMZXZlbCBtZXRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBCYXIgbWV0cmljcy4gVm9pY2UgTW9kZSdzIHdhdmVmb3JtIC0gYm90aCB0aGUgdG9vbGJhciBwaWxsIGFuZCBpdHMgb3duXG4gKiBpbnRyb2R1Y3Rpb24gY2FyZCAtIGlzIGEgcm93IG9mIGhhaXJsaW5lIHN0cm9rZXMgd2l0aCBhIGhhaXJsaW5lIG9mIGFpclxuICogYmVzaWRlIGVhY2gsIHNvIHRoaXMgdXNlcyB0aGUgc2FtZSBpbnN0cnVtZW50IGF0IGEgbGFyZ2VyIHNpemUuXG4gKi9cbmNvbnN0IEJBUl9XSURUSCA9IDE7XG5jb25zdCBCQVJfR0FQID0gMjtcblxuLyoqIEFtcGxpdHVkZSB3aXRoIG5vdGhpbmcgYmVpbmcgc2FpZDogcHJlc2VudCwgYnV0IGNsZWFybHkgYXQgcmVzdC4gKi9cbmNvbnN0IElETEVfR0FJTiA9IDAuNTU7XG5cbi8qKiBFeHRyYSBhbXBsaXR1ZGUgYXQgcGVhayBsb3VkbmVzcy4gKi9cbmNvbnN0IFNQRUFLSU5HX0dBSU4gPSAwLjQ1O1xuXG4vKiogSG93IHF1aWNrbHkgdGhlIHJvdyBjaGFzZXMgdGhlIG1pY3JvcGhvbmUuIExvdyBhbmQgc2xvdyByZWFkcyBhcyBzbW9vdGg7IGFcbiAqIHJvdyB0aGF0IHRyYWNrcyBldmVyeSBmcmFtZSBleGFjdGx5IHJlYWRzIGFzIGZsaWNrZXIgcmF0aGVyIHRoYW4gYXMgbGV2ZWwuICovXG5jb25zdCBMRVZFTF9FQVNJTkcgPSAwLjEyO1xuXG4vKiogT3BhY2l0eSBvZiB0aGUgcm93IHdoZW4gbm90aGluZyBpcyBiZWluZyBzYWlkLiAqL1xuY29uc3QgUkVTVElOR19PUEFDSVRZID0gMC4zNTtcblxuLyoqIEV4dHJhIG9wYWNpdHkgYXQgcGVhayBsb3VkbmVzcywgc28gdGhlIHJvdyBicmlnaHRlbnMgYXMgdGhlIHVzZXIgc3BlYWtzLiAqL1xuY29uc3QgU1BFQUtJTkdfT1BBQ0lUWSA9IDAuNTtcblxuLyoqXG4gKiBPcGFjaXR5IHdoZW4gdGhlIG1pY3JvcGhvbmUgY2Fubm90IGJlIHJlYWQgYXQgYWxsLiBEaW1tZXIgdGhhbiByZXN0LCBiZWNhdXNlXG4gKiBhIHJvdyBhdCByZXN0aW5nIHN0cmVuZ3RoIGltcGxpZXMgYSB3b3JraW5nIGRldmljZSB0aGF0IHNpbXBseSBpcyBub3QgaGVhcmluZ1xuICogYW55dGhpbmcgLSB3aGljaCBpcyB0aGUgb3Bwb3NpdGUgb2Ygd2hhdCBpcyB0cnVlLlxuICovXG5jb25zdCBVTkFWQUlMQUJMRV9PUEFDSVRZID0gMC4yO1xuXG4vKipcbiAqIFNob3J0ZXN0IGdhcCBiZXR3ZWVuIHJlcGFpbnRzIHdoZW4gcmVkdWNlZCBtb3Rpb24gaXMgb24uIFRoZSBtZXRlciBpc1xuICogZmVlZGJhY2ssIG5vdCBkZWNvcmF0aW9uIC0gc3dpdGNoaW5nIGl0IG9mZiB3b3VsZCByZW1vdmUgdGhlIG9ubHkgYW5zd2VyIHRoZVxuICogY2FyZCBoYXMgdG8gXCJpcyBteSBtaWNyb3Bob25lIHdvcmtpbmdcIiAtIHNvIGl0IGlzIHNsb3dlZCB0byBhIHJlYWRhYmxlIHN0ZXBcbiAqIHJhdGhlciB0aGFuIHN0b3BwZWQuXG4gKi9cbmNvbnN0IFJFRFVDRURfTU9USU9OX1BBSU5UX0lOVEVSVkFMX01TID0gMTAwO1xuXG4vKipcbiAqIE9uZSBzaW5lIGNvbXBvbmVudCBvZiB0aGUgd2F2ZWZvcm0ncyB0ZXh0dXJlLiBUaGUgdHJhY2UgaXMgYSBoYW5kZnVsIG9mIHRoZXNlXG4gKiBzdW1tZWQgdG9nZXRoZXIsIHdoaWNoIGlzIHdoYXQgZ2l2ZXMgaXQgYSByZWNvZ25pc2FibGUgcmlwcGxlIHJhdGhlciB0aGFuIGFcbiAqIHNpbmdsZSBwdWxzaW5nIGN1cnZlLlxuICovXG5pbnRlcmZhY2UgSVdhdmUge1xuXHRyZWFkb25seSBmcmVxdWVuY3k6IG51bWJlcjtcblx0cmVhZG9ubHkgYW1wbGl0dWRlOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNwZWVkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBoYXNlOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHJlYWRNaWNyb3Bob25lTGV2ZWwoYW5hbHlzZXI6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZCwgd2F2ZWZvcm06IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+IHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0aWYgKCFhbmFseXNlciB8fCAhd2F2ZWZvcm0pIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXHRhbmFseXNlci5nZXRCeXRlVGltZURvbWFpbkRhdGEod2F2ZWZvcm0pO1xuXHRsZXQgc3VtID0gMDtcblx0Zm9yIChjb25zdCBzYW1wbGUgb2Ygd2F2ZWZvcm0pIHtcblx0XHRjb25zdCBjZW50ZXJlZCA9IChzYW1wbGUgLSAxMjgpIC8gMTI4O1xuXHRcdHN1bSArPSBjZW50ZXJlZCAqIGNlbnRlcmVkO1xuXHR9XG5cdHJldHVybiBNYXRoLm1pbigxLCBNYXRoLnNxcnQoc3VtIC8gd2F2ZWZvcm0ubGVuZ3RoKSAqIDQpO1xufVxuXG4vKipcbiAqIFRoZSB3YXZlZm9ybSdzIHRleHR1cmUuIE1pcnJvcnMgdGhlIHNpZ25hdHVyZXMgVm9pY2UgTW9kZSdzIGludHJvZHVjdGlvbiB1c2VzLFxuICogc28gdGhlIHR3byBjYXJkcyByZWFkIGFzIHRoZSBzYW1lIGluc3RydW1lbnQgcmF0aGVyIHRoYW4gYXMgdHdvIGZlYXR1cmVzIHRoYXRcbiAqIGhhcHBlbiB0byBib3RoIGRyYXcgYmFycy5cbiAqL1xuY29uc3QgV0FWRVM6IHJlYWRvbmx5IElXYXZlW10gPSBbXG5cdHsgZnJlcXVlbmN5OiAxLjAsIGFtcGxpdHVkZTogMC40Miwgc3BlZWQ6IDAuNDIsIHBoYXNlOiAwLjAgfSxcblx0eyBmcmVxdWVuY3k6IDEuNywgYW1wbGl0dWRlOiAwLjI2LCBzcGVlZDogLTAuMzEsIHBoYXNlOiAxLjEgfSxcblx0eyBmcmVxdWVuY3k6IDIuNiwgYW1wbGl0dWRlOiAwLjE5LCBzcGVlZDogMC4yNCwgcGhhc2U6IDIuNCB9LFxuXHR7IGZyZXF1ZW5jeTogNC4xLCBhbXBsaXR1ZGU6IDAuMTMsIHNwZWVkOiAtMC4xOCwgcGhhc2U6IDAuNyB9LFxuXTtcblxuLyoqXG4gKiBIYWxmLWhlaWdodCBvZiB0aGUgcm93IGF0IGBwb3NpdGlvbmAgKDAuLjEgYWNyb3NzIHRoZSBzdHJpcCksIGFzIGEgZnJhY3Rpb24gb2ZcbiAqIHRoZSBhdmFpbGFibGUgaGFsZi1oZWlnaHQuXG4gKlxuICogRWFjaCBjb21wb25lbnQgY29udHJpYnV0ZXMgYW4gYWxyZWFkeS1wb3NpdGl2ZSwgY3VzcC1mcmVlIGN1cnZlLiBTdW1taW5nIHJhd1xuICogc2luZXMgYW5kIHRha2luZyB0aGVpciBtYWduaXR1ZGUgd291bGQgcHV0IGEgc2hhcnAgY29ybmVyIGF0IGV2ZXJ5IHplcm9cbiAqIGNyb3NzaW5nIC0gdGhhdCBpcyB3aGF0IG1ha2VzIGEgd2F2ZWZvcm0gbG9vayBsaWtlIGl0IGlzIHNuYXBwaW5nIHVwIGFuZCBkb3duXG4gKiByYXRoZXIgdGhhbiBmbG93aW5nLlxuICovXG5mdW5jdGlvbiBiYW5kRnJhY3Rpb24ocG9zaXRpb246IG51bWJlciwgdGltZTogbnVtYmVyKTogbnVtYmVyIHtcblx0bGV0IGFtcGxpdHVkZSA9IDA7XG5cdGxldCB0b3RhbCA9IDA7XG5cdGZvciAoY29uc3Qgd2F2ZSBvZiBXQVZFUykge1xuXHRcdGNvbnN0IHBoYXNlID0gcG9zaXRpb24gKiB3YXZlLmZyZXF1ZW5jeSAqIE1hdGguUEkgKiAyICsgdGltZSAqIHdhdmUuc3BlZWQgKyB3YXZlLnBoYXNlO1xuXHRcdGFtcGxpdHVkZSArPSAoMC41ICsgMC41ICogTWF0aC5zaW4ocGhhc2UpKSAqIHdhdmUuYW1wbGl0dWRlO1xuXHRcdHRvdGFsICs9IHdhdmUuYW1wbGl0dWRlO1xuXHR9XG5cdGlmICh0b3RhbCA9PT0gMCkge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cdC8vIENlbnRyZS1wZWFrIHNpbGhvdWV0dGUsIG1hdGNoaW5nIHRoZSB0b29sYmFyIHdhdmVmb3JtOiB0YWxsZXN0IGluIHRoZVxuXHQvLyBtaWRkbGUsIHRhcGVyaW5nIHRvIHRoZSBlbmRzLCBzbyB0aGUgcm93IHJlYWRzIGFzIG9uZSBpbnN0cnVtZW50IHJhdGhlclxuXHQvLyB0aGFuIGEgc3RyaXAgY3V0IG9mZiBhdCBib3RoIGVkZ2VzLlxuXHRjb25zdCB0YXBlciA9IE1hdGguc2luKE1hdGguUEkgKiBNYXRoLm1pbigxLCBNYXRoLm1heCgwLCBwb3NpdGlvbikpKTtcblx0cmV0dXJuIChhbXBsaXR1ZGUgLyB0b3RhbCkgKiAoMC4zNSArIDAuNjUgKiB0YXBlcik7XG59XG5cbi8qKiBXaHkgdGhlIG1pY3JvcGhvbmUgcHJldmlldyBpcyBub3Qgc2hvd2luZyBhIGxldmVsLiAqL1xuY29uc3QgZW51bSBNaWNyb3Bob25lUHJldmlld0Vycm9yIHtcblx0LyoqIFRoZSB1c2VyIChvciB0aGUgT1MpIHJlZnVzZWQgYWNjZXNzIHRvIHRoZSBtaWNyb3Bob25lLiAqL1xuXHREZW5pZWQgPSAnZGVuaWVkJyxcblx0LyoqIFRoZXJlIGlzIG5vIG1pY3JvcGhvbmUgdG8gbGlzdGVuIHRvLiAqL1xuXHROb0RldmljZSA9ICdub0RldmljZScsXG5cdC8qKiBBbnl0aGluZyBlbHNlLCBpbmNsdWRpbmcgYSBicm93c2VyIHdpdGhvdXQgYGdldFVzZXJNZWRpYWAuICovXG5cdFVuYXZhaWxhYmxlID0gJ3VuYXZhaWxhYmxlJyxcbn1cblxuLyoqXG4gKiBMaXN0ZW5zIHRvIGEgbWljcm9waG9uZSBwdXJlbHkgc28gaXRzIGxvdWRuZXNzIGNhbiBiZSBzaG93bi4gT3ducyB0aGUgbWVkaWFcbiAqIHN0cmVhbSwgdGhlIGF1ZGlvIGdyYXBoIGFuZCBub3RoaW5nIGVsc2U7IHJlbGVhc2luZyBpdCBmcmVlcyB0aGUgbWljcm9waG9uZS5cbiAqXG4gKiBUaGlzIGlzIGRlbGliZXJhdGVseSBpbmRlcGVuZGVudCBvZiB0aGUgZGljdGF0aW9uIHBpcGVsaW5lIHNvIHRoZSBjYXJkIGNhblxuICogcmVtYWluIGluZm9ybWF0aW9uYWwgd2hpbGUgcmVjb3JkaW5nIHN0YXJ0cyBpbW1lZGlhdGVseS5cbiAqL1xuY2xhc3MgTWljcm9waG9uZVByZXZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRwcml2YXRlIGFuYWx5c2VyOiBBbmFseXNlck5vZGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd2F2ZWZvcm06IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNaWNyb3Bob25lUHJldmlld0Vycm9yIHwgdW5kZWZpbmVkPigpKTtcblx0LyoqIEZpcmVzIHdpdGggdGhlIHJlYXNvbiBubyBsZXZlbCBpcyBhdmFpbGFibGUsIG9yIGB1bmRlZmluZWRgIG9uY2Ugb25lIGlzLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVycm9yID0gdGhpcy5fb25EaWRDaGFuZ2VFcnJvci5ldmVudDtcblxuXHRwcml2YXRlIF9lcnJvcjogTWljcm9waG9uZVByZXZpZXdFcnJvciB8IHVuZGVmaW5lZDtcblx0Z2V0IGVycm9yKCk6IE1pY3JvcGhvbmVQcmV2aWV3RXJyb3IgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZXJyb3I7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWVkaWFEZXZpY2VzOiBEaWN0YXRpb25NZWRpYURldmljZXMgfCB1bmRlZmluZWQsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ3VycmVudCBsb3VkbmVzcywgYDAuLjFgLCBvciBgMGAgd2hlbiBub3RoaW5nIGlzIGJlaW5nIGhlYXJkLiBSZWFkIGV2ZXJ5XG5cdCAqIGZyYW1lLCBzbyBpdCBzdGF5cyBhbGxvY2F0aW9uLWZyZWUuXG5cdCAqL1xuXHRnZXRMZXZlbCgpOiBudW1iZXIge1xuXHRcdC8vIFJNUywgc2NhbGVkIHNvIG9yZGluYXJ5IHNwZWVjaCBmaWxscyBtb3N0IG9mIHRoZSByb3cgcmF0aGVyIHRoYW4gYVxuXHRcdC8vIHNsaXZlciBvZiBpdC5cblx0XHRyZXR1cm4gcmVhZE1pY3JvcGhvbmVMZXZlbCh0aGlzLmFuYWx5c2VyLCB0aGlzLndhdmVmb3JtKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaXN0ZW4gdG8gYGRldmljZUlkYCAoZW1wdHkgbWVhbnMgdGhlIHN5c3RlbSBkZWZhdWx0KS4gUmVwbGFjZXMgYW55IHN0cmVhbVxuXHQgKiBhbHJlYWR5IHJ1bm5pbmcsIHNvIHN3aXRjaGluZyBkZXZpY2VzIG5ldmVyIGxlYXZlcyB0d28gbWljcm9waG9uZXMgb3Blbi5cblx0ICovXG5cdGFzeW5jIGxpc3RlbihkZXZpY2VJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlbGVhc2VNaWNyb3Bob25lKCk7XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuZWxlbWVudCk7XG5cdFx0aWYgKCF0aGlzLm1lZGlhRGV2aWNlcz8uZ2V0VXNlck1lZGlhKSB7XG5cdFx0XHR0aGlzLnNldEVycm9yKE1pY3JvcGhvbmVQcmV2aWV3RXJyb3IuVW5hdmFpbGFibGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnN0cmFpbnRzOiBNZWRpYVRyYWNrQ29uc3RyYWludHMgPSB7IGNoYW5uZWxDb3VudDogMSwgZWNob0NhbmNlbGxhdGlvbjogdHJ1ZSwgbm9pc2VTdXBwcmVzc2lvbjogdHJ1ZSB9O1xuXHRcdGlmIChkZXZpY2VJZCkge1xuXHRcdFx0Y29uc3RyYWludHMuZGV2aWNlSWQgPSB7IGV4YWN0OiBkZXZpY2VJZCB9O1xuXHRcdH1cblxuXHRcdGxldCBzdHJlYW06IE1lZGlhU3RyZWFtO1xuXHRcdHRyeSB7XG5cdFx0XHRzdHJlYW0gPSBhd2FpdCB0aGlzLm1lZGlhRGV2aWNlcy5nZXRVc2VyTWVkaWEoeyBhdWRpbzogY29uc3RyYWludHMgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuc2V0RXJyb3IodG9QcmV2aWV3RXJyb3IoZXJyb3IpKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW2NoYXQtc3R0XSBtaWNyb3Bob25lIHByZXZpZXcgdW5hdmFpbGFibGU6ICR7ZXJyb3J9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzdHJlYW0uZ2V0VHJhY2tzKCkuZm9yRWFjaCh0cmFjayA9PiB0cmFjay5zdG9wKCkpKSk7XG5cblx0XHRsZXQgYW5hbHlzZXI6IEFuYWx5c2VyTm9kZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IG5ldyB0YXJnZXRXaW5kb3cuQXVkaW9Db250ZXh0KCk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHZvaWQgY29udGV4dC5jbG9zZSgpLmNhdGNoKCgpID0+IHsgLyogYWxyZWFkeSBjbG9zaW5nICovIH0pKSk7XG5cdFx0XHQvLyBDaHJvbWl1bSBzdGFydHMgYW4gYEF1ZGlvQ29udGV4dGAgc3VzcGVuZGVkIHdoZW4gdGhlIHBhZ2UgaGFzIG5vXG5cdFx0XHQvLyBzdGlja3kgdXNlciBhY3RpdmF0aW9uLCBhbmQgYSBzdXNwZW5kZWQgZ3JhcGggcmVwb3J0cyBzaWxlbmNlIC0gYVxuXHRcdFx0Ly8gZGVhZCBtZXRlciB0aGF0IGxvb2tzIGV4YWN0bHkgbGlrZSBhIGRlYWQgbWljcm9waG9uZS5cblx0XHRcdGlmIChjb250ZXh0LnN0YXRlID09PSAnc3VzcGVuZGVkJykge1xuXHRcdFx0XHRhd2FpdCBjb250ZXh0LnJlc3VtZSgpO1xuXHRcdFx0fVxuXHRcdFx0YW5hbHlzZXIgPSBjb250ZXh0LmNyZWF0ZUFuYWx5c2VyKCk7XG5cdFx0XHQvLyBUaW1lLWRvbWFpbiBvbmx5OiB0aGUgcm93J3Mgc2hhcGUgY29tZXMgZnJvbSB0aGUgdHJhdmVsbGluZyB3YXZlLFxuXHRcdFx0Ly8gYW5kIGFsbCB0aGUgYW5hbHlzZXIgaGFzIHRvIHN1cHBseSBpcyBob3cgbG91ZCB0aGUgcm9vbSBpcy5cblx0XHRcdGFuYWx5c2VyLmZmdFNpemUgPSAyNTY7XG5cdFx0XHRjb250ZXh0LmNyZWF0ZU1lZGlhU3RyZWFtU291cmNlKHN0cmVhbSkuY29ubmVjdChhbmFseXNlcik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuc2V0RXJyb3IoTWljcm9waG9uZVByZXZpZXdFcnJvci5VbmF2YWlsYWJsZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtjaGF0LXN0dF0gbWljcm9waG9uZSBwcmV2aWV3IGFuYWx5c2VyIHVuYXZhaWxhYmxlOiAke2Vycm9yfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBjYXJkIGNhbiBiZSBkaXNtaXNzZWQgd2hpbGUgYGdldFVzZXJNZWRpYWAgaXMgc3RpbGwgcmVzb2x2aW5nOyB0aGVcblx0XHQvLyBzZXNzaW9uIGlzIGFscmVhZHkgY2xlYXJlZCBpbiB0aGF0IGNhc2UsIHNvIGFzc2lnbmluZyBoZXJlIHdvdWxkIGxlYWsgYVxuXHRcdC8vIGxpdmUgbWljcm9waG9uZS5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2Vzc2lvbi52YWx1ZSA9IHN0b3JlO1xuXHRcdHRoaXMuYW5hbHlzZXIgPSBhbmFseXNlcjtcblx0XHR0aGlzLndhdmVmb3JtID0gbmV3IFVpbnQ4QXJyYXkoYW5hbHlzZXIuZmZ0U2l6ZSk7XG5cdFx0dGhpcy5zZXRFcnJvcih1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmQgdGhlIG1pY3JvcGhvbmUgYmFjay4gQ2FsbGVkIGJlZm9yZSBkaWN0YXRpb24gYWNxdWlyZXMgaXRzIG93biBzdHJlYW06XG5cdCAqIHR3byBjYXB0dXJlcyBvZiBvbmUgZGV2aWNlIGlzIHdoYXQgbWFrZXMgdGhlIGF1ZGlvIHNlcnZpY2UgZHJvcCB0aGVcblx0ICogY2FwdHVyZSwgc28gdGhlIHByZXZpZXcgYWx3YXlzIGxldHMgZ28gZmlyc3QuXG5cdCAqL1xuXHRyZWxlYXNlTWljcm9waG9uZSgpOiB2b2lkIHtcblx0XHR0aGlzLmFuYWx5c2VyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMud2F2ZWZvcm0gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5zZXNzaW9uLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIHNldEVycm9yKGVycm9yOiBNaWNyb3Bob25lUHJldmlld0Vycm9yIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Vycm9yID09PSBlcnJvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9lcnJvciA9IGVycm9yO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRXJyb3IuZmlyZShlcnJvcik7XG5cdH1cbn1cblxuLyoqIE1hcCBhIGBnZXRVc2VyTWVkaWFgIHJlamVjdGlvbiBvbnRvIHRoZSByZWFzb24gc2hvd24gaW4gdGhlIGNhcmQuICovXG5mdW5jdGlvbiB0b1ByZXZpZXdFcnJvcihlcnJvcjogdW5rbm93bik6IE1pY3JvcGhvbmVQcmV2aWV3RXJyb3Ige1xuXHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBET01FeGNlcHRpb24pIHtcblx0XHRpZiAoZXJyb3IubmFtZSA9PT0gJ05vdEFsbG93ZWRFcnJvcicgfHwgZXJyb3IubmFtZSA9PT0gJ1NlY3VyaXR5RXJyb3InKSB7XG5cdFx0XHRyZXR1cm4gTWljcm9waG9uZVByZXZpZXdFcnJvci5EZW5pZWQ7XG5cdFx0fVxuXHRcdGlmIChlcnJvci5uYW1lID09PSAnTm90Rm91bmRFcnJvcicgfHwgZXJyb3IubmFtZSA9PT0gJ092ZXJjb25zdHJhaW5lZEVycm9yJykge1xuXHRcdFx0cmV0dXJuIE1pY3JvcGhvbmVQcmV2aWV3RXJyb3IuTm9EZXZpY2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBNaWNyb3Bob25lUHJldmlld0Vycm9yLlVuYXZhaWxhYmxlO1xufVxuXG4vKiogV2hhdCB0aGUgd2F2ZWZvcm0gbmVlZHMgZWFjaCBmcmFtZSwgc3VwcGxpZWQgYnkgdGhlIHByZXZpZXcuICovXG5pbnRlcmZhY2UgSVdhdmVmb3JtU291cmNlIHtcblx0LyoqIExvdWRuZXNzIG9mIHRoZSByb29tLCBgMGAgd2hlbiBub3RoaW5nIGlzIGJlaW5nIGhlYXJkLiAqL1xuXHRnZXRMZXZlbCgpOiBudW1iZXI7XG5cdC8qKiBgZmFsc2VgIHdoZW4gdGhlIG1pY3JvcGhvbmUgY2Fubm90IGJlIHJlYWQgYXQgYWxsLiAqL1xuXHRpc0F2YWlsYWJsZSgpOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFRoZSBsaXZlIHdhdmVmb3JtOiBhIHJvdyBvZiBoYWlybGluZSBzdHJva2VzIHdob3NlIHNoYXBlIGZsb3dzIGFuZCB3aG9zZVxuICogaGVpZ2h0IGZvbGxvd3MgdGhlIG1pY3JvcGhvbmUuIFRoZSBjYXJkJ3Mgd2hvbGUgam9iIGlzIHRvIGFuc3dlciBcImlzIHRoaXNcbiAqIGRldmljZSBoZWFyaW5nIG1lXCIsIGFuZCBhIHRyYWNlIHRoYXQgc3dlbGxzIHdoZW4geW91IHNwZWFrIGFuc3dlcnMgaXQgYmVmb3JlXG4gKiBhbnkgd29yZHMgYXJlIHJlYWQuXG4gKlxuICogRGVsaWJlcmF0ZWx5IG5vdCBhIHNwZWN0cnVtIGFuYWx5c2VyLiBQZXItYmFuZCBiYXJzIG1ha2UgbmVpZ2hib3VycyBqdW1wXG4gKiBpbmRlcGVuZGVudGx5LCB3aGljaCByZWFkcyBhcyBhIGNoYXJ0OyB0aGUgc2hhcGUgaGVyZSBpcyBvbmUgY29udGludW91c1xuICogdHJhdmVsbGluZyB3YXZlIC0gdGhlIHNhbWUgaW5zdHJ1bWVudCBWb2ljZSBNb2RlIHVzZXMgLSBzbyB0aGUgcm93IG1vdmVzIGxpa2VcbiAqIGEgdm9pY2UuXG4gKi9cbmNsYXNzIE1pY3JvcGhvbmVXYXZlZm9ybSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgYmFyczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFuaW1hdGlvbkZyYW1lID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRwcml2YXRlIHJ1bm5pbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBsYXN0UGFpbnQgPSAwO1xuXHRwcml2YXRlIGxldmVsID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzb3VyY2U6IElXYXZlZm9ybVNvdXJjZSxcblx0XHRvYnNlcnZlckN0b3I6IHR5cGVvZiBSZXNpemVPYnNlcnZlciB8IHVuZGVmaW5lZCxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdC8vIFRoZSBiYXIgY291bnQgZm9sbG93cyB0aGUgbWVhc3VyZWQgd2lkdGggcmF0aGVyIHRoYW4gYmVpbmcgZml4ZWQ6IGF0IGFcblx0XHQvLyBmaXhlZCBjb3VudCB0aGUgZ2FwcyBzdHJldGNoIG9yIGNyb3dkIGFzIHRoZSBwYW5lbCByZXNpemVzLCBhbmQgdGhlXG5cdFx0Ly8gMXB4LzJweCByaHl0aG0gdGhlIGluc3RydW1lbnQgaXMgYnVpbHQgb24gaXMgdGhlIGZpcnN0IHRoaW5nIGxvc3QuXG5cdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgKG9ic2VydmVyQ3RvciA/PyBkb20uZ2V0V2luZG93KGNvbnRhaW5lcikuUmVzaXplT2JzZXJ2ZXIpKCgpID0+IHRoaXMubGF5b3V0KCkpO1xuXHRcdG9ic2VydmVyLm9ic2VydmUoY29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gb2JzZXJ2ZXIuZGlzY29ubmVjdCgpKSk7XG5cblx0XHR0aGlzLmxheW91dCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnN0b3AoKSkpO1xuXHR9XG5cblx0LyoqIFJlYnVpbGQgdGhlIHJvdyBmb3IgdGhlIGN1cnJlbnQgd2lkdGgsIGlmIHRoZSBjb3VudCBhY3R1YWxseSBjaGFuZ2VkLiAqL1xuXHRwcml2YXRlIGxheW91dCgpOiB2b2lkIHtcblx0XHRjb25zdCB3aWR0aCA9IHRoaXMuY29udGFpbmVyLmNsaWVudFdpZHRoO1xuXHRcdGlmICghd2lkdGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY291bnQgPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKCh3aWR0aCArIEJBUl9HQVApIC8gKEJBUl9XSURUSCArIEJBUl9HQVApKSk7XG5cdFx0aWYgKGNvdW50ID09PSB0aGlzLmJhcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMuYmFycyA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0dGhpcy5iYXJzLnB1c2goZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgZG9tLiQoJ3NwYW4uZGljdGF0aW9uLW9uYm9hcmRpbmctYmFyJykpKTtcblx0XHR9XG5cdH1cblxuXHRzdGFydCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ydW5uaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucnVubmluZyA9IHRydWU7XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGljayA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5ydW5uaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlKHRhcmdldFdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKSk7XG5cdFx0XHR0aGlzLmFuaW1hdGlvbkZyYW1lLnZhbHVlID0gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCB0aWNrKTtcblx0XHR9O1xuXHRcdHRoaXMuYW5pbWF0aW9uRnJhbWUudmFsdWUgPSBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csIHRpY2spO1xuXHR9XG5cblx0c3RvcCgpOiB2b2lkIHtcblx0XHR0aGlzLnJ1bm5pbmcgPSBmYWxzZTtcblx0XHR0aGlzLmFuaW1hdGlvbkZyYW1lLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZSh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGludGVydmFsID0gdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSA/IFJFRFVDRURfTU9USU9OX1BBSU5UX0lOVEVSVkFMX01TIDogMDtcblx0XHRpZiAodGltZXN0YW1wIC0gdGhpcy5sYXN0UGFpbnQgPCBpbnRlcnZhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmxhc3RQYWludCA9IHRpbWVzdGFtcDtcblxuXHRcdC8vIEVhc2UgdG93YXJkcyB0aGUgbWljcm9waG9uZSByYXRoZXIgdGhhbiB0cmFja2luZyBpdCBleGFjdGx5OiB0aGUgbGV2ZWxcblx0XHQvLyBpcyB3aGF0IHRoZSByb3cgKm1lYW5zKiwgYW5kIGEgdmFsdWUgdGhhdCBqdW1wcyBldmVyeSBmcmFtZSByZWFkcyBhc1xuXHRcdC8vIGZsaWNrZXIgaW5zdGVhZCBvZiBhcyBsb3VkbmVzcy5cblx0XHR0aGlzLmxldmVsICs9ICh0aGlzLnNvdXJjZS5nZXRMZXZlbCgpIC0gdGhpcy5sZXZlbCkgKiBMRVZFTF9FQVNJTkc7XG5cdFx0Y29uc3QgZ2FpbiA9IElETEVfR0FJTiArIHRoaXMubGV2ZWwgKiBTUEVBS0lOR19HQUlOO1xuXHRcdGNvbnN0IHRpbWUgPSB0aW1lc3RhbXAgKiAwLjAwMTtcblxuXHRcdC8vIEJyaWdodG5lc3MgcmlkZXMgdGhlIHNhbWUgbGV2ZWwgYXMgdGhlIGhlaWdodCwgc28gdGhlIHJvdyBpcyBxdWlldCBhdFxuXHRcdC8vIHJlc3QgYW5kIGxpZnRzIGFzIHRoZSB1c2VyIHNwZWFrcyAtIGFuZCBkcm9wcyBiZWxvdyByZXN0IGVudGlyZWx5IHdoZW5cblx0XHQvLyB0aGVyZSBpcyBubyBtaWNyb3Bob25lIHRvIGhlYXIuIFNldCBvbiB0aGUgY29udGFpbmVyOiBvbmUgc3R5bGUgd3JpdGVcblx0XHQvLyBwZXIgZnJhbWUgcmF0aGVyIHRoYW4gb25lIHBlciBzdHJva2UuXG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUub3BhY2l0eSA9ICh0aGlzLnNvdXJjZS5pc0F2YWlsYWJsZSgpXG5cdFx0XHQ/IFJFU1RJTkdfT1BBQ0lUWSArIHRoaXMubGV2ZWwgKiBTUEVBS0lOR19PUEFDSVRZXG5cdFx0XHQ6IFVOQVZBSUxBQkxFX09QQUNJVFkpLnRvRml4ZWQoMyk7XG5cblx0XHRjb25zdCBjb3VudCA9IHRoaXMuYmFycy5sZW5ndGg7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IGNvdW50ID4gMSA/IGkgLyAoY291bnQgLSAxKSA6IDA7XG5cdFx0XHQvLyBTY2FsZWQgcmF0aGVyIHRoYW4gcmVzaXplZDogdHJhbnNmb3JtIHN0YXlzIG9mZiB0aGUgbGF5b3V0IHBhdGgsIHNvXG5cdFx0XHQvLyBhIHJvdyBvZiBoYWlybGluZXMgYXQgNjBmcHMgbmV2ZXIgcmVmbG93cyB0aGUgY2hhdCBpbnB1dC4gVGhlIGZsb29yXG5cdFx0XHQvLyBsZWF2ZXMgYSB0aGluIGxpbmUgcmF0aGVyIHRoYW4gbm90aGluZywgc28gYSBzaWxlbnQgbWljcm9waG9uZVxuXHRcdFx0Ly8gc3RpbGwgcmVhZHMgYXMgcHJlc2VudC5cblx0XHRcdGNvbnN0IGFtb3VudCA9IE1hdGgubWF4KDAuMDgsIE1hdGgubWluKDEsIGJhbmRGcmFjdGlvbihwb3NpdGlvbiwgdGltZSkgKiBnYWluKSk7XG5cdFx0XHR0aGlzLmJhcnNbaV0uc3R5bGUudHJhbnNmb3JtID0gYHNjYWxlWSgke2Ftb3VudC50b0ZpeGVkKDMpfSlgO1xuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0gTWljcm9waG9uZSBvcHRpb25zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKiBPbmUgZW50cnkgaW4gdGhlIGNhcmQncyBtaWNyb3Bob25lIHBpY2tlci4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU1pY3JvcGhvbmVPcHRpb24ge1xuXHRyZWFkb25seSBkZXZpY2VJZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRoZSBwaWNrYWJsZSBtaWNyb3Bob25lcywgd2l0aCB0aGUgcGh5c2ljYWwgc3lzdGVtLWRlZmF1bHQgZGV2aWNlIGlkZW50aWZpZWRcbiAqIGluIGl0cyBsYWJlbCBpbnN0ZWFkIG9mIHJlcHJlc2VudGVkIGJ5IGEgc2VwYXJhdGUgc3ludGhldGljIHJvdy5cbiAqXG4gKiBEcm9wcyB0aGUgdmlydHVhbCBgZGVmYXVsdGAvYGNvbW11bmljYXRpb25zYCBlbnRyaWVzICh3aGljaCBkdXBsaWNhdGUgYSByZWFsXG4gKiBkZXZpY2UgdW5kZXIgYSBzeW50aGV0aWMgaWQpIGFuZCBkZS1kdXBsaWNhdGVzIGJ5IGBkZXZpY2VJZGAsIHNvIG9uZSBwaHlzaWNhbFxuICogbWljcm9waG9uZSBhcHBlYXJzIGV4YWN0bHkgb25jZSAtIHRoZSBzYW1lIG5vcm1hbGl6YXRpb24gdGhlIFwiU2VsZWN0XG4gKiBNaWNyb3Bob25lXCIgcXVpY2sgcGljayBkb2VzLCBrZXB0IGluIG9uZSBwbGFjZSBzbyB0aGUgdHdvIG5ldmVyIGRpc2FncmVlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRNaWNyb3Bob25lT3B0aW9ucyhkZXZpY2VzOiByZWFkb25seSBNZWRpYURldmljZUluZm9bXSk6IElNaWNyb3Bob25lT3B0aW9uW10ge1xuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IG1pY3JvcGhvbmVzOiBNZWRpYURldmljZUluZm9bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGRldmljZSBvZiBkZXZpY2VzKSB7XG5cdFx0aWYgKGRldmljZS5raW5kICE9PSAnYXVkaW9pbnB1dCcgfHwgZGV2aWNlLmRldmljZUlkID09PSAnZGVmYXVsdCcgfHwgZGV2aWNlLmRldmljZUlkID09PSAnY29tbXVuaWNhdGlvbnMnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKHNlZW4uaGFzKGRldmljZS5kZXZpY2VJZCkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRzZWVuLmFkZChkZXZpY2UuZGV2aWNlSWQpO1xuXHRcdG1pY3JvcGhvbmVzLnB1c2goZGV2aWNlKTtcblx0fVxuXG5cdGlmIChtaWNyb3Bob25lcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW3tcblx0XHRcdGRldmljZUlkOiBTWVNURU1fREVGQVVMVF9ERVZJQ0VfSUQsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLnN5c3RlbURlZmF1bHQnLCBcIlN5c3RlbSBkZWZhdWx0XCIpLFxuXHRcdH1dO1xuXHR9XG5cblx0Y29uc3QgZGVmYXVsdERldmljZSA9IGRldmljZXMuZmluZChkZXZpY2UgPT4gZGV2aWNlLmtpbmQgPT09ICdhdWRpb2lucHV0JyAmJiBkZXZpY2UuZGV2aWNlSWQgPT09ICdkZWZhdWx0Jyk7XG5cdGNvbnN0IGRlZmF1bHRMYWJlbCA9IGRlZmF1bHREZXZpY2U/LmxhYmVsLnJlcGxhY2UoL14oPzpkZWZhdWx0fHN5c3RlbSBkZWZhdWx0KVxccyotXFxzKi9pLCAnJykudHJpbSgpO1xuXHRjb25zdCBkZWZhdWx0TWljcm9waG9uZSA9IGRlZmF1bHREZXZpY2Vcblx0XHQ/IG1pY3JvcGhvbmVzLmZpbmQoZGV2aWNlID0+XG5cdFx0XHQoZGVmYXVsdERldmljZS5ncm91cElkICYmIGRldmljZS5ncm91cElkID09PSBkZWZhdWx0RGV2aWNlLmdyb3VwSWQpXG5cdFx0XHR8fCAoZGVmYXVsdExhYmVsICYmIGRldmljZS5sYWJlbCA9PT0gZGVmYXVsdExhYmVsKVxuXHRcdCkgPz8gbWljcm9waG9uZXNbMF1cblx0XHQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdCBvcHRpb25zOiBJTWljcm9waG9uZU9wdGlvbltdID0gW107XG5cdGlmIChkZWZhdWx0RGV2aWNlKSB7XG5cdFx0Y29uc3QgbGFiZWwgPSBkZWZhdWx0TWljcm9waG9uZT8ubGFiZWwgfHwgZGVmYXVsdExhYmVsO1xuXHRcdG9wdGlvbnMucHVzaCh7XG5cdFx0XHRkZXZpY2VJZDogU1lTVEVNX0RFRkFVTFRfREVWSUNFX0lELFxuXHRcdFx0bGFiZWw6IGxhYmVsXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLmRlZmF1bHREZXZpY2UnLCBcInswfSAoU3lzdGVtIGRlZmF1bHQpXCIsIGxhYmVsKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy5zeXN0ZW1EZWZhdWx0JywgXCJTeXN0ZW0gZGVmYXVsdFwiKSxcblx0XHR9KTtcblx0fVxuXG5cdGZvciAoY29uc3QgZGV2aWNlIG9mIG1pY3JvcGhvbmVzKSB7XG5cdFx0aWYgKGRldmljZSA9PT0gZGVmYXVsdE1pY3JvcGhvbmUpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRvcHRpb25zLnB1c2goe1xuXHRcdFx0ZGV2aWNlSWQ6IGRldmljZS5kZXZpY2VJZCxcblx0XHRcdC8vIExhYmVscyBhcmUgZW1wdHkgdW50aWwgbWljcm9waG9uZSBwZXJtaXNzaW9uIGhhcyBiZWVuIGdyYW50ZWQgYXRcblx0XHRcdC8vIGxlYXN0IG9uY2U7IGEgdHJ1bmNhdGVkIGlkIGlzIHN0aWxsIGJldHRlciB0aGFuIGEgYmxhbmsgcm93LlxuXHRcdFx0bGFiZWw6IGRldmljZS5sYWJlbCB8fCBsb2NhbGl6ZSgnZGljdGF0aW9uLm9uYm9hcmRpbmcudW5rbm93bkRldmljZScsIFwiVW5rbm93biBkZXZpY2UgKHswfSlcIiwgZGV2aWNlLmRldmljZUlkLnNsaWNlKDAsIDgpKSxcblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gb3B0aW9ucztcbn1cblxuLyoqXG4gKiBJbmRleCBvZiB0aGUgbWljcm9waG9uZSBjdXJyZW50bHkgaW4gdXNlLiBGYWxscyBiYWNrIHRvIHRoZSBzeXN0ZW0gZGVmYXVsdFxuICogd2hlbiB0aGUgcmVtZW1iZXJlZCBkZXZpY2UgaGFzIGJlZW4gdW5wbHVnZ2VkLCB3aGljaCBpcyBleGFjdGx5IHdoYXQgZGljdGF0aW9uXG4gKiBpdHNlbGYgZG9lcyB3aGVuIGl0IGFjcXVpcmVzIHRoZSBzdHJlYW0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbmRleE9mTWljcm9waG9uZShvcHRpb25zOiByZWFkb25seSBJTWljcm9waG9uZU9wdGlvbltdLCBkZXZpY2VJZDogc3RyaW5nKTogbnVtYmVyIHtcblx0Y29uc3QgaW5kZXggPSBvcHRpb25zLmZpbmRJbmRleChvcHRpb24gPT4gb3B0aW9uLmRldmljZUlkID09PSBkZXZpY2VJZCk7XG5cdHJldHVybiBpbmRleCA9PT0gLTEgPyAwIDogaW5kZXg7XG59XG5cbi8vIC0tLSBCYW5uZXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGludGVyZmFjZSBJRGljdGF0aW9uT25ib2FyZGluZ0Jhbm5lck9wdGlvbnMge1xuXHQvKiogVGhlIGVsZW1lbnQgdGhlIGNhcmQgYXR0YWNoZXMgaXRzZWxmIHRvLiAqL1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBvbkRpc21pc3M6ICgpID0+IHZvaWQ7XG5cdC8qKiBXaGV0aGVyIHRoaXMgbWFudWFsbHkgb3BlbmVkIGNhcmQgc2hvdWxkIGFsc28gYWNxdWlyZSBhIG1pY3JvcGhvbmUgcHJldmlldy4gKi9cblx0cmVhZG9ubHkgcHJldmlld01pY3JvcGhvbmU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNvdXJjZTogJ2F1dG9tYXRpYycgfCAnbWFudWFsJztcbn1cblxuLyoqXG4gKiBUaGUgZmlyc3QtcnVuIGRpY3RhdGlvbiBjYXJkIGV4cGxhaW5zIHRoZSBmZWF0dXJlIGFuZCBvZmZlcnMgbWljcm9waG9uZVxuICogc2VsZWN0aW9uIHdoaWxlIHJlY29yZGluZyBzdGFydHMuIFdoZW4gcmVvcGVuZWQgbWFudWFsbHksIGl0IGFsc28gcHJldmlld3NcbiAqIHRoZSBzZWxlY3RlZCBtaWNyb3Bob25lLlxuICpcbiAqIFRoZSBjYXJkIHJ1bnMgYWxvbmdzaWRlIHRoZSBmaXJzdCBkaWN0YXRpb24sIHNvIGl0IGV4cGxhaW5zIHRoZSBmZWF0dXJlXG4gKiB3aXRob3V0IGRlbGF5aW5nIHRoZSBhY3Rpb24gdGhlIHVzZXIgaW52b2tlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIERpY3RhdGlvbk9uYm9hcmRpbmdCYW5uZXIgZXh0ZW5kcyBDaGF0SW5wdXROb3RpY2VXaWRnZXQgaW1wbGVtZW50cyBJQ2hhdElucHV0T25ib2FyZGluZ0Jhbm5lciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcmV2aWV3OiBNaWNyb3Bob25lUHJldmlldyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB3YXZlZm9ybTogTWljcm9waG9uZVdhdmVmb3JtO1xuXHRwcml2YXRlIHJlYWRvbmx5IGhpbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBpY2tlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZGljdGF0aW9uQW5hbHlzZXI6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkaWN0YXRpb25XYXZlZm9ybTogVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3dpdGNoTWljcm9waG9uZTogU3dpdGNoTWljcm9waG9uZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBpY2tlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIG9wdGlvbnM6IElNaWNyb3Bob25lT3B0aW9uW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGJhbm5lck9wdGlvbnM6IElEaWN0YXRpb25PbmJvYXJkaW5nQmFubmVyT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1lZGlhRGV2aWNlczogRGljdGF0aW9uTWVkaWFEZXZpY2VzIHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Y29udGFpbmVyOiBiYW5uZXJPcHRpb25zLmNvbnRhaW5lcixcblx0XHRcdHZhcmlhbnQ6IENoYXRJbnB1dE5vdGljZVZhcmlhbnQuT25ib2FyZGluZyxcblx0XHRcdGNsYXNzTmFtZTogJ2RpY3RhdGlvbi1vbmJvYXJkaW5nLWJhbm5lcicsXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy5yZWdpb24nLCBcIkRpY3RhdGlvbiBpbnRyb2R1Y3Rpb25cIiksXG5cdFx0XHRhcmlhRGVzY3JpcHRpb246IGJhbm5lck9wdGlvbnMucHJldmlld01pY3JvcGhvbmVcblx0XHRcdFx0PyBsb2NhbGl6ZSgnZGljdGF0aW9uLm9uYm9hcmRpbmcucmVnaW9uRGVzY3JpcHRpb24ucHJldmlldycsIFwiU2F5IGFueXRoaW5nIHRvIGNoZWNrIHlvdXIgbWljcm9waG9uZS5cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnZGljdGF0aW9uLm9uYm9hcmRpbmcucmVnaW9uRGVzY3JpcHRpb24nLCBcIlNwZWFrIGFuZCBpdCBiZWNvbWVzIHRleHQuXCIpLFxuXHRcdFx0b25Fc2NhcGU6ICgpID0+IHRoaXMuZGlzbWlzcygnZXNjYXBlJyksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBoZWFkZXIgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5kaWN0YXRpb24tb25ib2FyZGluZy1oZWFkZXInKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJy5jaGF0LWlucHV0LW5vdGljZS10aXRsZS5kaWN0YXRpb24tb25ib2FyZGluZy10aXRsZScpKTtcblx0XHR0aXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy50aXRsZScsIFwiRGljdGF0aW9uXCIpO1xuXHRcdHRoaXMucmVuZGVyRGVzY3JpcHRpb24oaGVhZGVyKTtcblxuXHRcdHRoaXMucmVuZGVyQ2xvc2UoKTtcblxuXHRcdGNvbnN0IGRldmljZSA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmRpY3RhdGlvbi1vbmJvYXJkaW5nLWRldmljZScpKTtcblx0XHR0aGlzLnBpY2tlckNvbnRhaW5lciA9IGRvbS5hcHBlbmQoZGV2aWNlLCBkb20uJCgnLmNoYXQtaW5wdXQtbm90aWNlLXBpY2tlci5kaWN0YXRpb24tb25ib2FyZGluZy1waWNrZXInKSk7XG5cdFx0dGhpcy5vcHRpb25zID0gW3tcblx0XHRcdGRldmljZUlkOiBTWVNURU1fREVGQVVMVF9ERVZJQ0VfSUQsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLnN5c3RlbURlZmF1bHQnLCBcIlN5c3RlbSBkZWZhdWx0XCIpLFxuXHRcdH1dO1xuXHRcdHRoaXMucmVuZGVyUGlja2VyKCk7XG5cblx0XHRpZiAodGhpcy5tZWRpYURldmljZXMpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5tZWRpYURldmljZXMsICdkZXZpY2VjaGFuZ2UnLCAoKSA9PiB2b2lkIHRoaXMucmVmcmVzaE1pY3JvcGhvbmVzKCkpKTtcblx0XHR9XG5cblx0XHRjb25zdCB3YXZlZm9ybUNvbnRhaW5lciA9IGRvbS5hcHBlbmQoZGV2aWNlLCBkb20uJCgnLmRpY3RhdGlvbi1vbmJvYXJkaW5nLXdhdmVmb3JtJykpO1xuXHRcdGlmICh0aGlzLmJhbm5lck9wdGlvbnMucHJldmlld01pY3JvcGhvbmUpIHtcblx0XHRcdC8vIEF1dG9tYXRpYyBvbmJvYXJkaW5nIHJ1bnMgYmVzaWRlIGFuIGFscmVhZHkgYWN0aXZlIGRpY3RhdGlvblxuXHRcdFx0Ly8gc3RyZWFtLCBzbyBvbmx5IHRoZSBtYW51YWxseSBvcGVuZWQgaW50cm9kdWN0aW9uIG93bnMgdGhpc1xuXHRcdFx0Ly8gaW5kZXBlbmRlbnQgcHJldmlldy5cblx0XHRcdGNvbnN0IHByZXZpZXcgPSB0aGlzLnByZXZpZXcgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNaWNyb3Bob25lUHJldmlldywgdGhpcy5kb21Ob2RlLCB0aGlzLm1lZGlhRGV2aWNlcykpO1xuXHRcdFx0dGhpcy53YXZlZm9ybSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1pY3JvcGhvbmVXYXZlZm9ybSwgd2F2ZWZvcm1Db250YWluZXIsIHtcblx0XHRcdFx0Z2V0TGV2ZWw6ICgpID0+IHByZXZpZXcuZ2V0TGV2ZWwoKSxcblx0XHRcdFx0aXNBdmFpbGFibGU6ICgpID0+IHByZXZpZXcuZXJyb3IgPT09IHVuZGVmaW5lZCxcblx0XHRcdH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocHJldmlldy5vbkRpZENoYW5nZUVycm9yKCgpID0+IHRoaXMudXBkYXRlSGludCgpKSk7XG5cblx0XHRcdHRoaXMuaGludCA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmRpY3RhdGlvbi1vbmJvYXJkaW5nLWhpbnQnKSk7XG5cdFx0XHR0aGlzLmhpbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG5cdFx0XHR0aGlzLnVwZGF0ZUhpbnQoKTtcblxuXHRcdFx0dm9pZCB0aGlzLnN0YXJ0UHJldmlldygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLndhdmVmb3JtID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWljcm9waG9uZVdhdmVmb3JtLCB3YXZlZm9ybUNvbnRhaW5lciwge1xuXHRcdFx0XHRnZXRMZXZlbDogKCkgPT4gcmVhZE1pY3JvcGhvbmVMZXZlbCh0aGlzLmRpY3RhdGlvbkFuYWx5c2VyLCB0aGlzLmRpY3RhdGlvbldhdmVmb3JtKSxcblx0XHRcdFx0aXNBdmFpbGFibGU6ICgpID0+IHRoaXMuZGljdGF0aW9uQW5hbHlzZXIgIT09IHVuZGVmaW5lZCxcblx0XHRcdH0sIHVuZGVmaW5lZCkpO1xuXHRcdFx0dm9pZCB0aGlzLnJlZnJlc2hNaWNyb3Bob25lcygpO1xuXHRcdH1cblx0XHR0aGlzLndhdmVmb3JtLnN0YXJ0KCk7XG5cdFx0dGhpcy5sb2dBY3Rpb24oJ3Nob3duJyk7XG5cdH1cblxuXHQvKipcblx0ICogU3RvcHMgdGhlIHdhdmVmb3JtIGFuZCByZWxlYXNlcyB0aGUgbWljcm9waG9uZSB3aGlsZSB0aGUgY2FyZCBpcyBwdXQgYXdheVxuXHQgKiBmb3IgYSBub3RpZmljYXRpb24sIHNvIGFuIGludmlzaWJsZSBpbnRyb2R1Y3Rpb24gbmV2ZXIgaG9sZHMgdGhlIG1pY3JvcGhvbmVcblx0ICogb3BlbiBvciBrZWVwcyBwYWludGluZy5cblx0ICovXG5cdG92ZXJyaWRlIHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHN1cGVyLnNldFZpc2libGUodmlzaWJsZSk7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdHRoaXMud2F2ZWZvcm0uc3RhcnQoKTtcblx0XHRcdGlmICh0aGlzLnByZXZpZXcpIHtcblx0XHRcdFx0dm9pZCB0aGlzLnN0YXJ0UHJldmlldygpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLndhdmVmb3JtLnN0b3AoKTtcblx0XHRcdHRoaXMucHJldmlldz8ucmVsZWFzZU1pY3JvcGhvbmUoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hhdCBkaWN0YXRpb24gaXMsIGFuZCB0aGF0IG5vbmUgb2YgaXQgaXMgZml4ZWQuIFRoZSBjYXJkIGlzIHNob3duIG9uY2UsIHNvXG5cdCAqIHRoZSB0d28gdGhpbmdzIGEgdXNlciBtaWdodCB3YW50IHRvIGNoYW5nZSBhZnRlcndhcmRzIC0gd2hldGhlciBkaWN0YXRpb25cblx0ICogcnVucyBhdCBhbGwsIGFuZCBob3cgaXQgd3JpdGVzIHdoYXQgdGhleSBzYXkgLSBoYXZlIHRvIGJlIHJlYWNoYWJsZSBmcm9tXG5cdCAqIGhlcmUgcmF0aGVyIHRoYW4gbGVmdCB0byBhIGNvbW1hbmQgbm9ib2R5IGtub3dzIHRvIGxvb2sgZm9yLlxuXHQgKlxuXHQgKiBgW1suLi5dXWAgbWFya3MgdGhlIGNsYXVzZXMgdGhhdCBiZWNvbWUgbGlua3MsIHNvIHRyYW5zbGF0b3JzIGNhbiBrZWVwIHRoZVxuXHQgKiBzZW50ZW5jZSBuYXR1cmFsIGluc3RlYWQgb2YgaGF2aW5nIGZpeGVkIHBocmFzZXMgY29uY2F0ZW5hdGVkIG9uLlxuXHQgKi9cblx0cHJpdmF0ZSByZW5kZXJEZXNjcmlwdGlvbihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jaGF0LWlucHV0LW5vdGljZS1kZXNjcmlwdGlvbi5kaWN0YXRpb24tb25ib2FyZGluZy1kZXNjcmlwdGlvbicpKTtcblx0XHRjb25zdCB0ZXh0ID0gbG9jYWxpemUoe1xuXHRcdFx0a2V5OiAnZGljdGF0aW9uLm9uYm9hcmRpbmcuZGVzY3JpcHRpb24nLFxuXHRcdFx0Y29tbWVudDogWydQcmVzZXJ2ZSB0aGUgZG91YmxlIHNxdWFyZSBicmFja2V0czogdGhleSBtYXJrIHRoZSB0ZXh0IHRoYXQgYmVjb21lcyBhIGxpbmsuIEtlZXAgYm90aCBsaW5rcywgaW4gdGhpcyBvcmRlciAtIHRoZSBmaXJzdCBvcGVucyBzZXR0aW5ncywgdGhlIHNlY29uZCBvcGVucyB0aGUgY3VzdG9taXphdGlvbiBmaWxlLiddLFxuXHRcdH0sIFwiU3BlYWsgYW5kIGl0IGJlY29tZXMgdGV4dC4gQWRqdXN0IFtbc2V0dGluZ3NdXSBvciBbW2hvdyBpdCdzIHdyaXR0ZW5dXSBhbnkgdGltZS5cIik7XG5cblx0XHRkb20uYXBwZW5kKGRlc2NyaXB0aW9uLCByZW5kZXJGb3JtYXR0ZWRUZXh0KHRleHQsIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IHtcblx0XHRcdFx0Ly8gVGhlIGhhbmRsZXIgaXMgZ2l2ZW4gdGhlIGxpbmsncyBpbmRleCwgc28gdGhlIHR3byBhcmUgdG9sZCBhcGFydFxuXHRcdFx0XHQvLyBieSBwb3NpdGlvbiAtIGhlbmNlIHRoZSBvcmRlcmluZyBub3RlIHRvIHRyYW5zbGF0b3JzIGFib3ZlLlxuXHRcdFx0XHRjYWxsYmFjazogaW5kZXggPT4ge1xuXHRcdFx0XHRcdGNvbnN0IFtjb21tYW5kSWQsIC4uLmFyZ3NdID0gaW5kZXggPT09ICcwJ1xuXHRcdFx0XHRcdFx0PyBbT1BFTl9TRVRUSU5HU19DT01NQU5ELCB7IHF1ZXJ5OiBESUNUQVRJT05fU0VUVElOR1NfUVVFUlkgfV1cblx0XHRcdFx0XHRcdDogW0NPTkZJR1VSRV9ESUNUQVRJT05fSU5TVFJVQ1RJT05TX0FDVElPTl9JRF07XG5cdFx0XHRcdFx0dGhpcy5sb2dBY3Rpb24oaW5kZXggPT09ICcwJyA/ICdvcGVuU2V0dGluZ3MnIDogJ29wZW5JbnN0cnVjdGlvbnMnKTtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCBhcyBzdHJpbmcsIC4uLmFyZ3MpXG5cdFx0XHRcdFx0XHQuY2F0Y2goZXJyb3IgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbY2hhdC1zdHRdIGZhaWxlZCB0byBvcGVuIGRpY3RhdGlvbiBjdXN0b21pemF0aW9uOiAke2Vycm9yfWApKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzcG9zYWJsZXM6IHRoaXMuX3N0b3JlLFxuXHRcdFx0fSxcblx0XHR9LCBkb20uJCgnc3BhbicpKSk7XG5cblx0XHQvLyBgcmVuZGVyRm9ybWF0dGVkVGV4dGAgZ2l2ZXMgZWFjaCBhbmNob3IgYSBjbGljayBsaXN0ZW5lciBhbmQgbm90aGluZ1xuXHRcdC8vIGVsc2UsIHNvIG1ha2UgdGhlbSByZWFsIGNvbnRyb2xzOiByZWFjaGFibGUgYnkgVGFiIGFuZCBvcGVyYWJsZSBieVxuXHRcdC8vIEVudGVyIG9yIFNwYWNlIGxpa2UgYW55IG90aGVyIGJ1dHRvbi4gVGhlIHJlbmRlcmVyIG93bnMgdGhpcyBET00sIHNvIGFcblx0XHQvLyBzZWxlY3RvciBpcyB0aGUgb25seSBoYW5kbGUgb24gaXQuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Zm9yIChjb25zdCBsaW5rIG9mIGRlc2NyaXB0aW9uLnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKSkge1xuXHRcdFx0bGluay50YWJJbmRleCA9IDA7XG5cdFx0XHRsaW5rLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobGluaywgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZXZlbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChldmVudCk7XG5cdFx0XHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRsaW5rLmNsaWNrKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQnJpbmcgdGhlIGNhcmQgdG8gbGlmZS4gVGhlIGRldmljZSBsaXN0IGFuZCB0aGUgbWljcm9waG9uZSBhcmUgc3RhcnRlZFxuXHQgKiB0b2dldGhlciByYXRoZXIgdGhhbiBpbiBzZXF1ZW5jZTogYGdldFVzZXJNZWRpYWAgY2FuIHRha2UgYSBzZWNvbmQgb3IgbW9yZVxuXHQgKiB0byByZXR1cm4sIGFuZCB3YWl0aW5nIGZvciBpdCB3b3VsZCBsZWF2ZSB0aGUgcGlja2VyIGVtcHR5IGZvciB0aGF0IHdob2xlXG5cdCAqIHRpbWUuIEVudW1lcmF0aW9uIGlzIHJlcGVhdGVkIG9uY2UgdGhlIG1pY3JvcGhvbmUgaXMgbGl2ZSwgYmVjYXVzZSBkZXZpY2Vcblx0ICogbGFiZWxzIHN0YXkgYmxhbmsgdW50aWwgcGVybWlzc2lvbiBoYXMgYmVlbiBncmFudGVkIGF0IGxlYXN0IG9uY2UuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHN0YXJ0UHJldmlldygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMucHJldmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaXN0ZW5pbmcgPSB0aGlzLnByZXZpZXcubGlzdGVuKHRoaXMuY3VycmVudERldmljZUlkKCkpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtsaXN0ZW5pbmcsIHRoaXMucmVmcmVzaE1pY3JvcGhvbmVzKCldKTtcblx0XHRhd2FpdCB0aGlzLnJlZnJlc2hNaWNyb3Bob25lcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjdXJyZW50RGV2aWNlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5NaWNyb3Bob25lRGV2aWNlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFNZU1RFTV9ERUZBVUxUX0RFVklDRV9JRCk7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoTWljcm9waG9uZXMoYW5hbHlzZXJOb2RlPzogQW5hbHlzZXJOb2RlLCBzd2l0Y2hNaWNyb3Bob25lPzogU3dpdGNoTWljcm9waG9uZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc3dpdGNoTWljcm9waG9uZSA9IHN3aXRjaE1pY3JvcGhvbmUgPz8gdGhpcy5zd2l0Y2hNaWNyb3Bob25lO1xuXHRcdGlmICghdGhpcy5wcmV2aWV3ICYmIGFuYWx5c2VyTm9kZSkge1xuXHRcdFx0dGhpcy5kaWN0YXRpb25BbmFseXNlciA9IGFuYWx5c2VyTm9kZTtcblx0XHRcdHRoaXMuZGljdGF0aW9uV2F2ZWZvcm0gPSBuZXcgVWludDhBcnJheShhbmFseXNlck5vZGUuZmZ0U2l6ZSk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5wcmV2aWV3ICYmICF0aGlzLmRpY3RhdGlvbkFuYWx5c2VyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tZWRpYURldmljZXM/LmVudW1lcmF0ZURldmljZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZGV2aWNlczogTWVkaWFEZXZpY2VJbmZvW107XG5cdFx0dHJ5IHtcblx0XHRcdGRldmljZXMgPSBhd2FpdCB0aGlzLm1lZGlhRGV2aWNlcy5lbnVtZXJhdGVEZXZpY2VzKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW2NoYXQtc3R0XSBjb3VsZCBub3QgZW51bWVyYXRlIG1pY3JvcGhvbmVzOiAke2Vycm9yfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGJ1aWxkTWljcm9waG9uZU9wdGlvbnMoZGV2aWNlcyk7XG5cdFx0Ly8gV2FpdCBmb3IgYSByZWFsIG1pY3JvcGhvbmUgbGFiZWwgYmVmb3JlIHJlbmRlcmluZyBhIG11bHRpLW1pY3JvcGhvbmUgcGlja2VyLlxuXHRcdGlmIChvcHRpb25zLmxlbmd0aCA+IDEgJiYgIWRldmljZXMuc29tZShkZXZpY2UgPT4gZGV2aWNlLmtpbmQgPT09ICdhdWRpb2lucHV0JyAmJiBkZXZpY2UubGFiZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLnJlbmRlclBpY2tlcigpO1xuXHR9XG5cblx0LyoqIEEgcGlja2VyIHdpdGggb25lIGVudHJ5IGlzIG5vdCBhIGNob2ljZSwgc28gb25seSBzaG93IHRoaXMgcm93IGZvciBtdWx0aXBsZSBtaWNyb3Bob25lcy4gKi9cblx0cHJpdmF0ZSByZW5kZXJQaWNrZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnBpY2tlckNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnBpY2tlci5jbGVhcigpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5waWNrZXJDb250YWluZXIpO1xuXG5cdFx0dGhpcy5waWNrZXJDb250YWluZXIuaGlkZGVuID0gdGhpcy5vcHRpb25zLmxlbmd0aCA8PSAxO1xuXHRcdGlmICh0aGlzLnBpY2tlckNvbnRhaW5lci5oaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRkb20uYXBwZW5kKHRoaXMucGlja2VyQ29udGFpbmVyLCBkb20uJChgc3Bhbi5jb2RpY29uLmNvZGljb24tJHtDb2RpY29uLm1pYy5pZH0uZGljdGF0aW9uLW9uYm9hcmRpbmctcGlja2VyLWljb25gKSlcblx0XHRcdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkID0gaW5kZXhPZk1pY3JvcGhvbmUodGhpcy5vcHRpb25zLCB0aGlzLmN1cnJlbnREZXZpY2VJZCgpKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdC8vIEN1c3RvbS1kcmF3biByYXRoZXIgdGhhbiB0aGUgcGxhdGZvcm0gY29udHJvbCwgYW5kIHdpdGggdGhlIGZhY2UgY29sb3JzXG5cdFx0Ly8gYmxhbmtlZCBzbyB0aGUgcm93IGluaGVyaXRzIHRoZSBjYXJkIGluc3RlYWQgb2YgY2FycnlpbmcgdGhlIHBsYXRmb3JtJ3Ncblx0XHQvLyBzZWxlY3QgY2hyb21lIC0gdGhhdCBmaWxsIGlzIGV4YWN0bHkgd2hhdCB0aGlzIHJvdyBzaG91bGQgbm90IGhhdmUgYXRcblx0XHQvLyByZXN0LiBUaGUgZHJvcGRvd24ga2VlcHMgaXRzIG93biBjb2xvcnMsIHNvIG9ubHkgdGhlIGZhY2UgY2hhbmdlcy5cblx0XHRjb25zdCBzZWxlY3RCb3ggPSBzdG9yZS5hZGQobmV3IFNlbGVjdEJveChcblx0XHRcdHRoaXMub3B0aW9ucy5tYXAob3B0aW9uID0+ICh7IHRleHQ6IG9wdGlvbi5sYWJlbCB9KSksXG5cdFx0XHRzZWxlY3RlZCxcblx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdFx0eyAuLi5kZWZhdWx0U2VsZWN0Qm94U3R5bGVzLCBzZWxlY3RCYWNrZ3JvdW5kOiB1bmRlZmluZWQsIHNlbGVjdEJvcmRlcjogdW5kZWZpbmVkLCBzZWxlY3RGb3JlZ3JvdW5kOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgYXJpYUxhYmVsOiBsb2NhbGl6ZSgnZGljdGF0aW9uLm9uYm9hcmRpbmcubWljcm9waG9uZScsIFwiTWljcm9waG9uZVwiKSwgdXNlQ3VzdG9tRHJhd246IHRydWUgfSxcblx0XHQpKTtcblx0XHRzZWxlY3RCb3gucmVuZGVyKHRoaXMucGlja2VyQ29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQoc2VsZWN0Qm94Lm9uRGlkU2VsZWN0KGV2ZW50ID0+IHRoaXMuc2VsZWN0TWljcm9waG9uZShldmVudC5pbmRleCkpKTtcblx0XHR0aGlzLnBpY2tlci52YWx1ZSA9IHN0b3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZWxlY3RNaWNyb3Bob25lKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb24gPSB0aGlzLm9wdGlvbnNbaW5kZXhdO1xuXHRcdGlmICghb3B0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubG9nQWN0aW9uKCdzZWxlY3RNaWNyb3Bob25lJyk7XG5cblx0XHQvLyBTaGFyZWQgd2l0aCBWb2ljZSBNb2RlIGFuZCB3aXRoIHRoZSBcIlNlbGVjdCBNaWNyb3Bob25lXCIgcXVpY2sgcGljaywgc29cblx0XHQvLyB0aGUgY2hvaWNlIG1hZGUgaGVyZSBpcyB0aGUgb25lIGRpY3RhdGlvbiBhY3R1YWxseSByZWNvcmRzIGZyb20uXG5cdFx0aWYgKG9wdGlvbi5kZXZpY2VJZCkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLk1pY3JvcGhvbmVEZXZpY2UsIG9wdGlvbi5kZXZpY2VJZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLk1pY3JvcGhvbmVEZXZpY2UsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fVxuXG5cdFx0c3RhdHVzKGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy5taWNyb3Bob25lU2VsZWN0ZWQnLCBcInswfSBzZWxlY3RlZC5cIiwgb3B0aW9uLmxhYmVsKSk7XG5cdFx0aWYgKHRoaXMucHJldmlldykge1xuXHRcdFx0dm9pZCB0aGlzLnByZXZpZXcubGlzdGVuKG9wdGlvbi5kZXZpY2VJZCkudGhlbigoKSA9PiB0aGlzLnVwZGF0ZUhpbnQoKSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnN3aXRjaE1pY3JvcGhvbmUpIHtcblx0XHRcdHZvaWQgdGhpcy5zd2l0Y2hNaWNyb3Bob25lKG9wdGlvbi5kZXZpY2VJZClcblx0XHRcdFx0LnRoZW4oYW5hbHlzZXIgPT4gdGhpcy5yZWZyZXNoTWljcm9waG9uZXMoYW5hbHlzZXIpKVxuXHRcdFx0XHQuY2F0Y2goZXJyb3IgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbY2hhdC1zdHRdIGZhaWxlZCB0byBzd2l0Y2ggZGljdGF0aW9uIG1pY3JvcGhvbmU6ICR7ZXJyb3J9YCkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgaGludCBvbmx5IHNwZWFrcyB3aGVuIHRoZSBtaWNyb3Bob25lIGNhbm5vdCBiZSByZWFkLiBBdCByZXN0IHRoZVxuXHQgKiBtb3Zpbmcgd2F2ZWZvcm0gaXMgdGhlIGluc3RydWN0aW9uIC0gYSBsaW5lIG9mIHRleHQgdGVsbGluZyB5b3UgdG8gdGFsayBpc1xuXHQgKiBvbmUgdGhlIGNhcmQgY2FuIGRvIHdpdGhvdXQuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZUhpbnQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnByZXZpZXcgfHwgIXRoaXMuaGludCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlcnJvciA9IHRoaXMucHJldmlldy5lcnJvcjtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWVycm9yJywgZXJyb3IgIT09IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5oaW50LnRleHRDb250ZW50ID0gZXJyb3IgPT09IHVuZGVmaW5lZCA/ICcnIDogaGludEZvckVycm9yKGVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ2xvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5hZGREaXNtaXNzQWN0aW9uKHtcblx0XHRcdGNsYXNzTmFtZTogJ2RpY3RhdGlvbi1vbmJvYXJkaW5nLWNsb3NlJyxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLmNsb3NlJywgXCJDbG9zZSB0aGUgaW50cm9kdWN0aW9uXCIpLFxuXHRcdFx0b25BY3RpdmF0ZTogKCkgPT4gdGhpcy5kaXNtaXNzKCdjbG9zZScpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNtaXNzKGFjdGlvbjogJ2Nsb3NlJyB8ICdlc2NhcGUnKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dBY3Rpb24oYWN0aW9uKTtcblx0XHR0aGlzLndhdmVmb3JtLnN0b3AoKTtcblx0XHR0aGlzLnByZXZpZXc/LnJlbGVhc2VNaWNyb3Bob25lKCk7XG5cdFx0dGhpcy5iYW5uZXJPcHRpb25zLm9uRGlzbWlzcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2dBY3Rpb24oYWN0aW9uOiBEaWN0YXRpb25PbmJvYXJkaW5nQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RGljdGF0aW9uT25ib2FyZGluZ0FjdGlvbkV2ZW50LCBEaWN0YXRpb25PbmJvYXJkaW5nQWN0aW9uQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0J2RpY3RhdGlvbk9uYm9hcmRpbmcuYWN0aW9uJyxcblx0XHRcdHsgYWN0aW9uLCBzb3VyY2U6IHRoaXMuYmFubmVyT3B0aW9ucy5zb3VyY2UgfVxuXHRcdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaGludEZvckVycm9yKGVycm9yOiBNaWNyb3Bob25lUHJldmlld0Vycm9yKTogc3RyaW5nIHtcblx0c3dpdGNoIChlcnJvcikge1xuXHRcdGNhc2UgTWljcm9waG9uZVByZXZpZXdFcnJvci5EZW5pZWQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLmRlbmllZCcsIFwiTm8gbWljcm9waG9uZSBhY2Nlc3MuIENoZWNrIHlvdXIgc3lzdGVtIHByaXZhY3kgc2V0dGluZ3MuXCIpO1xuXHRcdGNhc2UgTWljcm9waG9uZVByZXZpZXdFcnJvci5Ob0RldmljZTpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZGljdGF0aW9uLm9uYm9hcmRpbmcubm9EZXZpY2UnLCBcIk5vIG1pY3JvcGhvbmUgZm91bmQuXCIpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLnVuYXZhaWxhYmxlJywgXCJDYW4ndCByZWFkIHRoZSBtaWNyb3Bob25lIGxldmVsLlwiKTtcblx0fVxufVxuXG4vLyAtLS0gU2VydmljZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlPignZGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzVmlzaWJsZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBjb250YWluZXIgdGhhdCBjYW4gaG9zdCB0aGUgY2FyZCAoYSBjaGF0IGlucHV0KS4gVGhlIG1vc3Rcblx0ICogcmVjZW50bHkgZm9jdXNlZCBob3N0IHdpbnMgd2hlbiB0aGUgY2FyZCBpcyBzaG93bi5cblx0ICovXG5cdHJlZ2lzdGVySG9zdChvcHRpb25zOiBJQ2hhdElucHV0T25ib2FyZGluZ0hvc3RPcHRpb25zKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIFNob3cgdGhlIGNhcmQgYWxvbmdzaWRlIHRoZSB1c2VyJ3MgZmlyc3QgZGljdGF0aW9uLiBEaWN0YXRpb24gc3RhcnRzXG5cdCAqIGluZGVwZW5kZW50bHkgYW5kIGlzIG5ldmVyIGdhdGVkIG9uIHRoZSBjYXJkLlxuXHQgKi9cblx0c2hvd0lmTmVlZGVkKCk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNob3cgdGhlIGNhcmQgYWdhaW4gcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0IGhhcyBiZWVuIHNlZW4sIGZvciB0aGUgXCJTaG93XG5cdCAqIEludHJvZHVjdGlvblwiIGNvbW1hbmQuIFJldHVybnMgYGZhbHNlYCB3aGVuIHRoZXJlIGlzIG5vIHZpc2libGUgY2hhdCBpbnB1dFxuXHQgKiB0byBkb2NrIGl0IHRvLCBzbyB0aGUgY2FsbGVyIGNhbiBleHBsYWluIHdoeSBub3RoaW5nIGhhcHBlbmVkLlxuXHQgKi9cblx0c2hvdygpOiBib29sZWFuO1xuXG5cdC8qKiBSZWZyZXNoIHRoZSB2aXNpYmxlIGNhcmQgYWZ0ZXIgZGljdGF0aW9uIGFjcXVpcmVzIG1pY3JvcGhvbmUgcGVybWlzc2lvbi4gKi9cblx0cmVmcmVzaE1pY3JvcGhvbmVzKGFuYWx5c2VyTm9kZT86IEFuYWx5c2VyTm9kZSwgc3dpdGNoTWljcm9waG9uZT86IFN3aXRjaE1pY3JvcGhvbmUpOiB2b2lkO1xuXG5cdC8qKiBSZXNldCBmaXJzdC1ydW4gc3RhdGUgc28gdGhlIGludHJvZHVjdGlvbiBpcyBzaG93biBuZXh0IHRpbWUuICovXG5cdHJlc2V0KCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb25ib2FyZGluZzogQ2hhdElucHV0T25ib2FyZGluZztcblx0cHJpdmF0ZSBjdXJyZW50QmFubmVyOiBEaWN0YXRpb25PbmJvYXJkaW5nQmFubmVyIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMub25ib2FyZGluZy5pc1Zpc2libGU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMub25ib2FyZGluZyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0T25ib2FyZGluZywge1xuXHRcdFx0c3RvcmFnZUtleTogRElDVEFUSU9OX0lOVFJPX1NIT1dOX0tFWSxcblx0XHR9KSk7XG5cdH1cblxuXHRyZWdpc3Rlckhvc3Qob3B0aW9uczogSUNoYXRJbnB1dE9uYm9hcmRpbmdIb3N0T3B0aW9ucyk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5vbmJvYXJkaW5nLnJlZ2lzdGVySG9zdChvcHRpb25zKTtcblx0fVxuXG5cdHNob3dJZk5lZWRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5vbmJvYXJkaW5nLnNob3dJZk5lZWRlZChjb250ZXh0ID0+IHRoaXMuY3JlYXRlQmFubmVyKGNvbnRleHQuY29udGFpbmVyLCBjb250ZXh0LmRpc21pc3MsICdhdXRvbWF0aWMnLCBmYWxzZSkpO1xuXHR9XG5cblx0c2hvdygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5vbmJvYXJkaW5nLnNob3coY29udGV4dCA9PiB0aGlzLmNyZWF0ZUJhbm5lcihjb250ZXh0LmNvbnRhaW5lciwgY29udGV4dC5kaXNtaXNzLCAnbWFudWFsJywgdHJ1ZSkpO1xuXHR9XG5cblx0cmVmcmVzaE1pY3JvcGhvbmVzKGFuYWx5c2VyTm9kZT86IEFuYWx5c2VyTm9kZSwgc3dpdGNoTWljcm9waG9uZT86IFN3aXRjaE1pY3JvcGhvbmUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vbmJvYXJkaW5nLmlzVmlzaWJsZSkge1xuXHRcdFx0dm9pZCB0aGlzLmN1cnJlbnRCYW5uZXI/LnJlZnJlc2hNaWNyb3Bob25lcyhhbmFseXNlck5vZGUsIHN3aXRjaE1pY3JvcGhvbmUpO1xuXHRcdH1cblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKERJQ1RBVElPTl9JTlRST19TSE9XTl9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUJhbm5lcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBkaXNtaXNzOiAoKSA9PiB2b2lkLCBzb3VyY2U6ICdhdXRvbWF0aWMnIHwgJ21hbnVhbCcsIHByZXZpZXdNaWNyb3Bob25lOiBib29sZWFuKTogRGljdGF0aW9uT25ib2FyZGluZ0Jhbm5lciB7XG5cdFx0Y29uc3QgYmFubmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWN0YXRpb25PbmJvYXJkaW5nQmFubmVyLCB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRvbkRpc21pc3M6IGRpc21pc3MsXG5cdFx0XHRwcmV2aWV3TWljcm9waG9uZSxcblx0XHRcdHNvdXJjZSxcblx0XHR9LCBkb20uZ2V0V2luZG93KGNvbnRhaW5lcikubmF2aWdhdG9yLm1lZGlhRGV2aWNlcyk7XG5cdFx0dGhpcy5jdXJyZW50QmFubmVyID0gYmFubmVyO1xuXHRcdHJldHVybiBiYW5uZXI7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlLCBEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzFGLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMs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
