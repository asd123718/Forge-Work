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
import "../../../../../base/browser/ui/segmentedIconToggle/segmentedIconToggle.css";
import "./media/voiceInputMode.css";
import { getActiveWindow, getWindow } from "../../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, observableFromEvent } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsDevelopmentContext } from "../../../../../platform/contextkey/common/contextkeys.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { resolveVoiceGlowColors } from "../voiceClient/voiceGlow.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IVoiceSessionController } from "../voiceClient/voiceSessionController.js";
import { IMicCaptureService } from "../voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../voiceClient/ttsPlaybackService.js";
import { ChatSpeechToTextState, IChatSpeechToTextService, isDictationActiveOnSurface } from "../speechToText/chatSpeechToTextService.js";
import { setupDictationMicGlow } from "../speechToText/dictationMicGlow.js";
import { DictationDownloadRing, getDictationDownloadHoverContent, getDictationPreparingLabel } from "../speechToText/dictationDownloadRing.js";
import { getDictationHoverContent, getVoiceModeHoverContent } from "../speechToText/micButtonHovers.js";
import { addMicButtonContextMenuListener, getDictationContextMenuActions, getVoiceModeContextMenuActions } from "../speechToText/micButtonMenuActions.js";
import { IVoiceInputModeService } from "./voiceInputMode.js";
import { SegmentedVoiceInputModePillActive } from "./voiceInputModeContextKeys.js";
import { AGENTS_VOICE_ENABLED } from "../../../agentsVoice/common/agentsVoice.js";
const DICTATION_TOGGLE_COMMAND_ID = "workbench.action.chat.toggleSpeechToText";
const VOICE_START_COMMAND_ID = "agentsVoice.startVoiceInChat";
async function retargetVoiceToCurrentSession(commandService, controller, window) {
  const currentSession = await commandService.executeCommand("_chat.voice.getCurrentSession");
  if (!currentSession) {
    return false;
  }
  try {
    const resource = URI.parse(currentSession);
    if (resource.scheme === "sessions-voice") {
      controller.takeDraftInputOwnership(window);
    } else {
      controller.takeSessionInputOwnership(resource, window);
    }
    return true;
  } catch {
    return false;
  }
}
const WAVEFORM_BAR_COUNT = 5;
const WAVEFORM_BAR_MIN_HEIGHT = 2;
const WAVEFORM_BAR_MAX_HEIGHT = 10;
const _ChatVoiceInputModeAction = class _ChatVoiceInputModeAction extends Action2 {
  constructor() {
    super({
      id: _ChatVoiceInputModeAction.ID,
      title: localize2("voiceInputMode", "Voice Input Mode"),
      icon: Codicon.mic,
      precondition: SegmentedVoiceInputModePillActive,
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillActive,
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.currentlyEditing.negate()
        ),
        group: "navigation",
        order: -11
      }
    });
  }
  run(_accessor) {
  }
};
_ChatVoiceInputModeAction.ID = "workbench.action.chat.voiceInputMode";
let ChatVoiceInputModeAction = _ChatVoiceInputModeAction;
const _ChatVoiceInputModeToggleListenAction = class _ChatVoiceInputModeToggleListenAction extends Action2 {
  constructor() {
    super({
      id: _ChatVoiceInputModeToggleListenAction.ID,
      title: localize2("voiceInputMode.holdToTalk", "Voice Mode: Hold to Talk"),
      // A hold-only action cannot be invoked safely from the Command Palette: a
      // mouse click produces no key-up (leaving the turn pending) and a keyboard
      // invocation creates an immediate empty turn. Keep it keybinding-only.
      f1: false,
      precondition: AGENTS_VOICE_ENABLED,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
        when: ContextKeyExpr.and(
          AGENTS_VOICE_ENABLED,
          ChatContextKeys.inChatInput
        )
      }
    });
    this._holdActive = false;
  }
  async run(accessor) {
    if (this._holdActive) {
      return;
    }
    const controller = accessor.get(IVoiceSessionController);
    const keybindingService = accessor.get(IKeybindingService);
    const speechToText = accessor.get(IChatSpeechToTextService);
    if (speechToText.state !== ChatSpeechToTextState.Idle) {
      speechToText.cancel();
    }
    const holdMode = keybindingService.enableKeybindingHoldMode(_ChatVoiceInputModeToggleListenAction.ID);
    const win = getActiveWindow();
    let keyReleased = false;
    const releaseListener = dom.addDisposableListener(win, dom.EventType.KEY_UP, () => {
      keyReleased = true;
    });
    this._holdActive = true;
    try {
      if (!controller.retainOmniInputOwnershipForBargeIn(win)) {
        await retargetVoiceToCurrentSession(accessor.get(ICommandService), controller, win);
      }
      if (!controller.isConnected.get() && !controller.isConnecting.get()) {
        await controller.connect(win);
      }
      if (keyReleased) {
        return;
      }
      if (controller.isConnected.get()) {
        controller.pttDown("explicit", true);
        if (holdMode) {
          await holdMode;
        } else if (!keyReleased) {
          await new Promise((resolve) => {
            const l = dom.addDisposableListener(win, dom.EventType.KEY_UP, () => {
              l.dispose();
              resolve();
            });
          });
        }
        controller.pttUp("explicit", true);
      }
    } finally {
      releaseListener.dispose();
      this._holdActive = false;
    }
  }
};
_ChatVoiceInputModeToggleListenAction.ID = "workbench.action.chat.voiceInputMode.holdToTalk";
let ChatVoiceInputModeToggleListenAction = _ChatVoiceInputModeToggleListenAction;
const SIMULATE_STATES = [
  { id: "off", label: "Off (Disconnected)", state: "off" },
  { id: "connecting", label: "Connecting", state: "connecting" },
  { id: "idle", label: "Connected (Idle)", state: "idle" },
  { id: "listening", label: "Listening", state: "listening" },
  { id: "speaking", label: "Speaking", state: "speaking" },
  { id: "dictating", label: "Dictating", state: "dictating" }
];
function registerVoiceInputModeSimulateActions() {
  const VERSIONS = [
    { version: "handsFree", label: "v4 \u2014 Hands-Free (Auto-Listen)" },
    { version: "keyboardHold", label: "v1 \u2014 Keyboard Hold-to-Talk (Walkie-Talkie)" },
    { version: "buttonHold", label: "v2 \u2014 Button Hold-to-Talk" },
    { version: "clickToggle", label: "v3 \u2014 Button Click-to-Toggle Listening" }
  ];
  for (const { version, label } of VERSIONS) {
    registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.chat.voiceInputMode.simulate.walkthrough.${version}`,
          title: { value: `Voice Input Mode: Prototype Walkthrough \u2014 ${label}`, original: `Voice Input Mode: Prototype Walkthrough \u2014 ${label}` },
          category: { value: "Developer", original: "Developer" },
          precondition: IsDevelopmentContext,
          f1: true
        });
      }
      run(accessor) {
        accessor.get(IVoiceInputModeService).startVoiceStateWalkthrough(version);
      }
    });
  }
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.voiceInputMode.simulate.step",
        title: { value: "Voice Input Mode: Prototype Step (Next State)", original: "Voice Input Mode: Prototype Step (Next State)" },
        category: { value: "Developer", original: "Developer" },
        precondition: IsDevelopmentContext,
        f1: true
      });
    }
    run(accessor) {
      accessor.get(IVoiceInputModeService).stepVoiceStateWalkthrough();
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.voiceInputMode.simulate.clear",
        title: { value: "Voice Input Mode: Simulate \u2014 Clear", original: "Voice Input Mode: Simulate \u2014 Clear" },
        category: { value: "Developer", original: "Developer" },
        precondition: IsDevelopmentContext,
        f1: true
      });
    }
    run(accessor) {
      accessor.get(IVoiceInputModeService).clearSimulation();
    }
  });
  for (const { id, label, state } of SIMULATE_STATES) {
    registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.chat.voiceInputMode.simulate.${id}`,
          // Dev-only utility — not localized.
          title: { value: `Voice Input Mode: Simulate \u2014 ${label}`, original: `Voice Input Mode: Simulate \u2014 ${label}` },
          category: { value: "Developer", original: "Developer" },
          precondition: IsDevelopmentContext,
          f1: true
        });
      }
      run(accessor) {
        accessor.get(IVoiceInputModeService).setSimulatedVoiceState(state);
      }
    });
  }
}
let VoiceInputModeActionViewItem = class extends BaseActionViewItem {
  constructor(action, _options, voiceInputModeService, voiceSessionController, commandService, configurationService, keybindingService, contextMenuService, hoverService, micCaptureService, ttsPlaybackService, chatSpeechToTextService, accessibilityService, themeService) {
    super(void 0, action);
    this._options = _options;
    this.voiceInputModeService = voiceInputModeService;
    this.voiceSessionController = voiceSessionController;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.chatSpeechToTextService = chatSpeechToTextService;
    this.accessibilityService = accessibilityService;
    this.themeService = themeService;
    this._voiceBarEls = [];
    this._voiceHovering = false;
    this._voiceLive = false;
    this._listenHoldListening = false;
    this._listenHoldGesture = false;
    this._listenSuppressClick = false;
    this._listenPointerUp = this._register(new MutableDisposable());
    // Progress ring shown over the dictation glyph during an actual on-disk
    // model download (cache miss), mirroring the standalone toolbar button.
    this._dictationRing = this._register(new MutableDisposable());
  }
  _getLabelWithKeybinding(label, commandId) {
    return this.keybindingService.appendKeybinding(label, commandId);
  }
  _updateAriaLabels() {
    this._dictationCell?.setAttribute("aria-label", this._dictationCell.classList.contains("preparing") ? localize("voiceInputMode.dictationPreparing", "Preparing Speech to Text Model\u2026") : this._getLabelWithKeybinding(localize("voiceInputMode.dictation", "Dictation"), DICTATION_TOGGLE_COMMAND_ID));
    this._voiceCell?.setAttribute("aria-label", this._voiceCell.classList.contains("connecting") ? localize("voiceInputMode.connecting", "Connecting to Voice Mode\u2026") : this._voiceCell.classList.contains("on") ? localize("voiceInputMode.disconnect", "Turn Off Voice Mode") : this._getLabelWithKeybinding(localize("voiceInputMode.voice", "Voice Mode"), VOICE_START_COMMAND_ID));
    this._listenCell?.setAttribute("aria-label", this._listenCell.classList.contains("active") ? this._getLabelWithKeybinding(localize("voiceInputMode.stopListening", "Stop Listening"), ChatVoiceInputModeToggleListenAction.ID) : this._getLabelWithKeybinding(localize("voiceInputMode.startListening", "Start Listening"), ChatVoiceInputModeToggleListenAction.ID));
  }
  /** Set the per-state pill/waveform colors from the theme-derived voice accent. */
  _updateVoiceStateColors(container) {
    const colors = resolveVoiceGlowColors(this.themeService.getColorTheme());
    container.style.setProperty("--voice-color-listening", colors.listening.toString());
    container.style.setProperty("--voice-color-speaking", colors.speaking.toString());
  }
  render(container) {
    super.render(container);
    container.classList.add("monaco-segmented-icon-toggle-container", "chat-voice-input-mode-item");
    this._updateVoiceStateColors(container);
    this._register(this.themeService.onDidColorThemeChange(() => this._updateVoiceStateColors(container)));
    const pill = dom.append(container, dom.$(".monaco-segmented-icon-toggle.chat-voice-input-mode"));
    this._reel = dom.append(pill, dom.$(".monaco-segmented-icon-toggle-reel.chat-voice-input-mode-reel"));
    this._dictationCell = dom.append(this._reel, dom.$("button.monaco-segmented-icon-toggle-cell.chat-voice-input-mode-cell.dictation"));
    this._dictationCell.setAttribute("type", "button");
    this._dictationCell.setAttribute("role", "button");
    this._dictationIcon = dom.append(this._dictationCell, dom.$("span.chat-voice-input-mode-icon"));
    this._register(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      this._dictationCell,
      () => this.chatSpeechToTextService.isPreparingModel ? getDictationDownloadHoverContent(this.chatSpeechToTextService) : getDictationHoverContent(this._getLabelWithKeybinding(localize("voiceInputMode.dictation", "Dictation"), DICTATION_TOGGLE_COMMAND_ID), this.configurationService)
    ));
    this._register(dom.addDisposableListener(this._dictationCell, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._onClickDictation();
    }));
    this._registerActivationKeys(this._dictationCell, () => this._onClickDictation());
    this._register(addMicButtonContextMenuListener(
      this._dictationCell,
      () => getDictationContextMenuActions(this.commandService, this.configurationService, this.keybindingService, DICTATION_TOGGLE_COMMAND_ID),
      this.contextMenuService
    ));
    this._register(setupDictationMicGlow(this._dictationCell, this.chatSpeechToTextService, this.accessibilityService, this._options?.isActive, this.themeService));
    this._voiceCell = dom.append(this._reel, dom.$("button.monaco-segmented-icon-toggle-cell.chat-voice-input-mode-cell.voice"));
    this._voiceCell.setAttribute("type", "button");
    this._voiceCell.setAttribute("role", "button");
    this._voiceBars = dom.append(this._voiceCell, dom.$("span.chat-voice-input-mode-bars"));
    dom.append(this._voiceCell, dom.$(`span.chat-voice-input-mode-icon.chat-voice-input-mode-spinner${ThemeIcon.asCSSSelector(Codicon.loadingCompact)}`));
    for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
      this._voiceBarEls.push(dom.append(this._voiceBars, dom.$("span.chat-voice-input-mode-bar")));
    }
    this._register(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      this._voiceCell,
      () => {
        const ownsVoice = this._options?.isVoiceActive?.get() ?? this._options?.isActive?.get() ?? true;
        const connectedish = ownsVoice && (this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get()) || this.voiceInputModeService.simulatedVoiceState.get() === "idle" || this.voiceInputModeService.simulatedVoiceState.get() === "listening" || this.voiceInputModeService.simulatedVoiceState.get() === "speaking";
        return getVoiceModeHoverContent(connectedish ? localize("voiceInputMode.disconnect", "Turn Off Voice Mode") : this._getLabelWithKeybinding(localize("voiceInputMode.voice", "Voice Mode"), VOICE_START_COMMAND_ID));
      }
    ));
    this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      void this._onClickVoicePowerToggle();
    }));
    this._registerActivationKeys(this._voiceCell, () => this._onClickVoicePowerToggle());
    this._register(addMicButtonContextMenuListener(
      this._voiceCell,
      () => getVoiceModeContextMenuActions(this.commandService, this.configurationService, this.keybindingService, VOICE_START_COMMAND_ID),
      this.contextMenuService
    ));
    this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.MOUSE_ENTER, () => {
      this._voiceHovering = true;
      this._stopBarAnimation();
    }));
    this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.MOUSE_LEAVE, () => {
      this._voiceHovering = false;
      this._syncBarAnimation();
    }));
    this._listenCell = dom.append(this._reel, dom.$("button.monaco-segmented-icon-toggle-cell.chat-voice-input-mode-cell.listen"));
    this._listenCell.setAttribute("type", "button");
    this._listenCell.setAttribute("role", "button");
    this._listenIcon = dom.append(this._listenCell, dom.$("span.chat-voice-input-mode-icon"));
    this._updateAriaLabels();
    this._register(this.keybindingService.onDidUpdateKeybindings(() => this._updateAriaLabels()));
    this._register(addMicButtonContextMenuListener(
      this._listenCell,
      () => getVoiceModeContextMenuActions(this.commandService, this.configurationService, this.keybindingService, VOICE_START_COMMAND_ID),
      this.contextMenuService
    ));
    this._register(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      this._listenCell,
      () => this.voiceSessionController.voiceState.get() === "listening" ? this._getLabelWithKeybinding(localize("voiceInputMode.stopListening", "Stop Listening"), ChatVoiceInputModeToggleListenAction.ID) : this._getLabelWithKeybinding(localize("voiceInputMode.startOrHoldListening", "Tap to start, or hold to talk"), ChatVoiceInputModeToggleListenAction.ID)
    ));
    this._register(dom.addDisposableGenericMouseDownListener(this._listenCell, (e) => {
      if (e.button !== 0) {
        return;
      }
      this._onListenPointerDown();
    }));
    this._register(dom.addDisposableListener(this._listenCell, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      if (this._listenSuppressClick) {
        this._listenSuppressClick = false;
        return;
      }
      this._onClickListen();
    }));
    this._registerActivationKeys(this._listenCell, () => this._onClickListen());
    const dictationActive = observableFromEvent(
      this,
      this.chatSpeechToTextService.onDidChangeState,
      () => isDictationActiveOnSurface(this.chatSpeechToTextService, "chat") && this.chatSpeechToTextService.state !== ChatSpeechToTextState.Idle
    );
    const dictationPreparing = observableFromEvent(
      this,
      this.chatSpeechToTextService.onDidChangePreparingModel,
      () => this.chatSpeechToTextService.currentSurface === "chat" && this.chatSpeechToTextService.isPreparingModel
    );
    const dictationDownloading = observableFromEvent(
      this,
      this.chatSpeechToTextService.onDidChangeDownloadingModel,
      () => this.chatSpeechToTextService.isDownloadingModel
    );
    this._register(autorun((reader) => {
      const dictationAvailable = this.voiceInputModeService.dictationAvailable.read(reader);
      const voiceAvailable = this.voiceInputModeService.voiceAvailable.read(reader);
      const simHandsFree = this.voiceInputModeService.simulatedHandsFree.read(reader);
      const handsFree = simHandsFree ?? this.voiceInputModeService.handsFree.read(reader);
      const sim = this.voiceInputModeService.simulatedVoiceState.read(reader);
      const isActive = sim !== void 0 || (this._options?.isActive?.read(reader) ?? true);
      const isVoiceActive = sim !== void 0 || (this._options?.isVoiceActive?.read(reader) ?? isActive);
      let isDictating;
      let connected;
      let connecting;
      let listening;
      let speaking;
      if (sim !== void 0) {
        isDictating = sim === "dictating";
        connecting = sim === "connecting";
        connected = sim === "idle" || sim === "listening" || sim === "speaking";
        listening = sim === "listening";
        speaking = sim === "speaking";
      } else {
        isDictating = isActive && dictationActive.read(reader);
        connected = isVoiceActive && this.voiceSessionController.isConnected.read(reader);
        connecting = isVoiceActive && (this.voiceSessionController.isConnecting.read(reader) || this.voiceSessionController.isReconnecting.read(reader));
        const voiceState = this.voiceSessionController.voiceState.read(reader);
        listening = connected && voiceState === "listening";
        speaking = connected && voiceState === "speaking";
      }
      const voiceLive = listening || speaking;
      const voiceOn = connected || connecting;
      this._voiceLive = voiceLive;
      const dictationBusy = sim === void 0 && isActive && dictationPreparing.read(reader);
      const showListen = connected && !handsFree;
      const dictationPresent = dictationAvailable && !voiceOn;
      const voicePresent = voiceAvailable && !isDictating && !dictationBusy;
      const listenPresent = showListen;
      const presentCount = (dictationPresent ? 1 : 0) + (voicePresent ? 1 : 0) + (listenPresent ? 1 : 0);
      container.classList.toggle("connected", voiceOn);
      container.classList.toggle("single", presentCount === 1);
      this._dictationCell.classList.toggle("collapsed", !dictationPresent);
      this._dictationCell.classList.toggle("active", isDictating || dictationBusy);
      this._dictationCell.classList.toggle("preparing", dictationBusy);
      this._dictationCell.setAttribute("aria-pressed", String(isDictating));
      this._dictationCell.setAttribute("aria-label", dictationBusy ? localize("voiceInputMode.dictationPreparingCancelable", "Cancel Dictation. {0}", getDictationPreparingLabel(this.chatSpeechToTextService)) : localize("voiceInputMode.dictation", "Dictation"));
      const dictationIcon = dictationBusy ? dictationDownloading.read(reader) ? Codicon.micDownloadCompact : Codicon.loadingCompact : isDictating ? Codicon.micFilled : Codicon.mic;
      this._dictationIcon.className = `chat-voice-input-mode-icon ${ThemeIcon.asClassName(dictationIcon)}`;
      if (dictationBusy && dictationDownloading.read(reader)) {
        if (!this._dictationRing.value) {
          this._dictationRing.value = new DictationDownloadRing(this._dictationCell, this.chatSpeechToTextService);
        }
      } else {
        this._dictationRing.clear();
      }
      this._voiceCell.classList.toggle("collapsed", !voicePresent);
      this._voiceCell.classList.toggle("on", voiceOn);
      this._voiceCell.classList.toggle("connecting", connecting && !connected);
      this._voiceCell.classList.toggle("idle-on", voiceOn && !voiceLive);
      this._voiceCell.classList.toggle("listening", listening);
      this._voiceCell.classList.toggle("speaking", speaking);
      this._voiceCell.setAttribute("aria-pressed", String(voiceOn));
      this._voiceCell.classList.toggle("sim-hover", this.voiceInputModeService.simulatedHover.read(reader));
      this._listenCell.classList.toggle("collapsed", !listenPresent);
      this._listenCell.classList.toggle("active", listening);
      this._listenCell.classList.toggle("muted", !listening);
      this._listenCell.setAttribute("aria-pressed", String(listening));
      this._listenIcon.className = `chat-voice-input-mode-icon ${ThemeIcon.asClassName(listening ? Codicon.personVoiceFilledCompact : Codicon.personVoiceCompact)}`;
      this._updateAriaLabels();
      this._syncBarAnimation();
    }));
    this._register({ dispose: () => this._stopBarAnimation() });
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
      this._stopBarAnimation();
      this._syncBarAnimation();
    }));
  }
  /** Start or stop the audio-reactive bar loop based on live + hover state. */
  _syncBarAnimation() {
    if (this._voiceLive && !this._voiceHovering) {
      this._startBarAnimation();
    } else {
      this._stopBarAnimation();
    }
  }
  /**
   * Animate the waveform bars from live audio. Uses the mic analyser while listening
   * and the TTS analyser while the assistant speaks. When no analyser is available
   * (e.g. reduced motion or pre-capture), the CSS keyframe fallback drives the bars.
   */
  _startBarAnimation() {
    if (this._barAnimationFrame !== void 0) {
      return;
    }
    if (this.accessibilityService.isMotionReduced()) {
      for (const bar of this._voiceBarEls) {
        bar.style.animation = "none";
        bar.style.height = `${WAVEFORM_BAR_MIN_HEIGHT}px`;
      }
      return;
    }
    const win = getWindow(this._voiceCell);
    const tick = () => {
      this._barAnimationFrame = win.requestAnimationFrame(tick);
      const analyser = this.voiceSessionController.voiceState.get() === "speaking" ? this.ttsPlaybackService.analyserNode : this.micCaptureService.analyserNode;
      if (!analyser) {
        for (const bar of this._voiceBarEls) {
          bar.style.removeProperty("height");
          bar.style.removeProperty("animation");
        }
        return;
      }
      if (!this._barData || this._barData.length !== analyser.frequencyBinCount) {
        this._barData = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(this._barData);
      const bins = this._barData.length;
      const step = Math.max(1, Math.floor(bins / this._voiceBarEls.length));
      for (let i = 0; i < this._voiceBarEls.length; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += this._barData[Math.min(bins - 1, i * step + j)];
        }
        const intensity = Math.min(1, sum / step / 180);
        const heightPx = WAVEFORM_BAR_MIN_HEIGHT + intensity * (WAVEFORM_BAR_MAX_HEIGHT - WAVEFORM_BAR_MIN_HEIGHT);
        this._voiceBarEls[i].style.animation = "none";
        this._voiceBarEls[i].style.height = `${heightPx}px`;
      }
    };
    this._barAnimationFrame = win.requestAnimationFrame(tick);
  }
  _stopBarAnimation() {
    if (this._barAnimationFrame !== void 0 && this._voiceCell) {
      getWindow(this._voiceCell).cancelAnimationFrame(this._barAnimationFrame);
    }
    this._barAnimationFrame = void 0;
    for (const bar of this._voiceBarEls) {
      bar.style.removeProperty("height");
      bar.style.removeProperty("animation");
    }
  }
  /**
   * Toggle built-in on-device dictation. By default this runs the shared
   * {@link DICTATION_TOGGLE_COMMAND_ID} command (which targets the last focused
   * chat widget); a host that isn't an `IChatWidget` (e.g. the agents-window
   * composer) can inject its own toggle via {@link IVoiceInputModePillOptions}.
   */
  _toggleDictation() {
    if (this._options?.toggleDictation) {
      this._options.toggleDictation();
    } else {
      this.commandService.executeCommand(DICTATION_TOGGLE_COMMAND_ID);
    }
  }
  /**
   * Activate a segmented cell from the keyboard. The cells live inside a toolbar's
   * `ActionBar`, whose key handler runs the (no-op) placeholder action on Enter/Space
   * and calls `preventDefault`/`stopPropagation`, which would otherwise swallow the
   * native button activation. Handle Enter/Space here and stop the event before it
   * bubbles to the ActionBar so the focused cell's own gesture runs.
   */
  _registerActivationKeys(cell, handler) {
    this._register(dom.addStandardDisposableListener(cell, dom.EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }));
    this._register(dom.addStandardDisposableListener(cell, dom.EventType.KEY_UP, (e) => {
      if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
        e.preventDefault();
        e.stopPropagation();
        handler();
      }
    }));
  }
  _onClickDictation() {
    this.voiceInputModeService.setSelectedMode("dictation");
    if (this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get()) {
      this.voiceSessionController.disconnect();
    }
    this._toggleDictation();
  }
  /** The voice button connects or disconnects; hands-free mode starts listening after connect. */
  async _onClickVoicePowerToggle() {
    this.voiceInputModeService.setSelectedMode("voice");
    if (this.chatSpeechToTextService.state !== ChatSpeechToTextState.Idle) {
      this._toggleDictation();
    }
    const controller = this.voiceSessionController;
    const targetWindow = getWindow(this._voiceCell);
    if (controller.isConnected.get() || controller.isConnecting.get()) {
      if (this._options?.isVoiceActive?.get() === false) {
        if (this._options.activateVoiceMode) {
          await this._options.activateVoiceMode();
        } else {
          await retargetVoiceToCurrentSession(this.commandService, controller, targetWindow);
        }
        return;
      }
      controller.disconnect();
    } else {
      if (this._options?.activateVoiceMode) {
        await this._options.activateVoiceMode();
      } else {
        await retargetVoiceToCurrentSession(this.commandService, controller, targetWindow);
      }
      controller.connect(targetWindow).catch(() => {
      });
    }
  }
  /** Tap the listen cell to toggle listening on and off. */
  _onClickListen() {
    const controller = this.voiceSessionController;
    if (!controller.isConnected.get()) {
      return;
    }
    if (controller.voiceState.get() === "listening") {
      controller.stopListening();
    } else {
      controller.pttDown();
      controller.pttUp();
    }
  }
  _onListenPointerDown() {
    const controller = this.voiceSessionController;
    if (!controller.isConnected.get() || controller.voiceState.get() === "listening") {
      return;
    }
    this._listenHoldGesture = true;
    this._listenHoldListening = false;
    this._listenSuppressClick = false;
    const win = getWindow(this._listenCell);
    this._listenHoldTimer = win.setTimeout(() => {
      this._listenHoldTimer = void 0;
      if (controller.isConnected.get()) {
        this._listenHoldListening = true;
        controller.pttDown("explicit", true);
      }
    }, VoiceInputModeActionViewItem.HOLD_THRESHOLD_MS);
    this._listenPointerUp.value = dom.addDisposableGenericMouseUpListener(win, (e) => this._endListenPointerHold(e));
  }
  _endListenPointerHold(e) {
    if (!this._listenHoldGesture) {
      return;
    }
    this._listenHoldGesture = false;
    this._listenPointerUp.clear();
    if (this._listenHoldTimer !== void 0) {
      getWindow(this._listenCell).clearTimeout(this._listenHoldTimer);
      this._listenHoldTimer = void 0;
      this._listenSuppressClick = false;
    } else if (this._listenHoldListening) {
      this._listenHoldListening = false;
      const releasedOnCell = !!e?.target && this._listenCell.contains(e.target);
      this._listenSuppressClick = releasedOnCell;
      this.voiceSessionController.pttUp("explicit", true);
    }
  }
  dispose() {
    if (this._listenHoldGesture || this._listenHoldTimer !== void 0) {
      this._endListenPointerHold();
    }
    super.dispose();
  }
};
/** Threshold (ms) separating a quick tap (toggle) from a press-and-hold (talk). */
VoiceInputModeActionViewItem.HOLD_THRESHOLD_MS = 180;
VoiceInputModeActionViewItem = __decorateClass([
  __decorateParam(2, IVoiceInputModeService),
  __decorateParam(3, IVoiceSessionController),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IMicCaptureService),
  __decorateParam(10, ITtsPlaybackService),
  __decorateParam(11, IChatSpeechToTextService),
  __decorateParam(12, IAccessibilityService),
  __decorateParam(13, IThemeService)
], VoiceInputModeActionViewItem);
function isVoiceInputModeAvailable(voiceInputModeService) {
  const dictation = voiceInputModeService.dictationAvailable.get();
  const voice = voiceInputModeService.voiceAvailable.get();
  if (dictation && voice) {
    return "both";
  }
  if (dictation) {
    return "dictation";
  }
  if (voice) {
    return "voice";
  }
  return void 0;
}
export {
  ChatVoiceInputModeAction,
  ChatVoiceInputModeToggleListenAction,
  VoiceInputModeActionViewItem,
  isVoiceInputModeAvailable,
  registerVoiceInputModeSimulateActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHZvaWNlSW5wdXRNb2RlXFx2b2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VnbWVudGVkSWNvblRvZ2dsZS9zZWdtZW50ZWRJY29uVG9nZ2xlLmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvdm9pY2VJbnB1dE1vZGUuY3NzJztcbmltcG9ydCB7IGdldEFjdGl2ZVdpbmRvdywgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElzRGV2ZWxvcG1lbnRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyByZXNvbHZlVm9pY2VHbG93Q29sb3JzIH0gZnJvbSAnLi4vdm9pY2VDbGllbnQvdm9pY2VHbG93LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB9IGZyb20gJy4uL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSU1pY0NhcHR1cmVTZXJ2aWNlIH0gZnJvbSAnLi4vdm9pY2VDbGllbnQvbWljQ2FwdHVyZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVR0c1BsYXliYWNrU2VydmljZSB9IGZyb20gJy4uL3ZvaWNlQ2xpZW50L3R0c1BsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U3BlZWNoVG9UZXh0U3RhdGUsIElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSwgaXNEaWN0YXRpb25BY3RpdmVPblN1cmZhY2UgfSBmcm9tICcuLi9zcGVlY2hUb1RleHQvY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2V0dXBEaWN0YXRpb25NaWNHbG93IH0gZnJvbSAnLi4vc3BlZWNoVG9UZXh0L2RpY3RhdGlvbk1pY0dsb3cuanMnO1xuaW1wb3J0IHsgRGljdGF0aW9uRG93bmxvYWRSaW5nLCBnZXREaWN0YXRpb25Eb3dubG9hZEhvdmVyQ29udGVudCwgZ2V0RGljdGF0aW9uUHJlcGFyaW5nTGFiZWwgfSBmcm9tICcuLi9zcGVlY2hUb1RleHQvZGljdGF0aW9uRG93bmxvYWRSaW5nLmpzJztcbmltcG9ydCB7IGdldERpY3RhdGlvbkhvdmVyQ29udGVudCwgZ2V0Vm9pY2VNb2RlSG92ZXJDb250ZW50IH0gZnJvbSAnLi4vc3BlZWNoVG9UZXh0L21pY0J1dHRvbkhvdmVycy5qcyc7XG5pbXBvcnQgeyBhZGRNaWNCdXR0b25Db250ZXh0TWVudUxpc3RlbmVyLCBnZXREaWN0YXRpb25Db250ZXh0TWVudUFjdGlvbnMsIGdldFZvaWNlTW9kZUNvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uL3NwZWVjaFRvVGV4dC9taWNCdXR0b25NZW51QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlLCBTaW11bGF0ZWRWb2ljZVN0YXRlLCBWb2ljZUlucHV0TW9kZSwgVm9pY2VXYWxrdGhyb3VnaFZlcnNpb24gfSBmcm9tICcuL3ZvaWNlSW5wdXRNb2RlLmpzJztcbmltcG9ydCB7IFNlZ21lbnRlZFZvaWNlSW5wdXRNb2RlUGlsbEFjdGl2ZSB9IGZyb20gJy4vdm9pY2VJbnB1dE1vZGVDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBBR0VOVFNfVk9JQ0VfRU5BQkxFRCB9IGZyb20gJy4uLy4uLy4uL2FnZW50c1ZvaWNlL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5cbi8qKiBCdWlsdC1pbiBvbi1kZXZpY2UgZGljdGF0aW9uIHRvZ2dsZSAoc3RhcnQvc3RvcCkuICovXG5jb25zdCBESUNUQVRJT05fVE9HR0xFX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRvZ2dsZVNwZWVjaFRvVGV4dCc7XG5cbi8qKlxuICogU3RhYmxlIGNvbW1hbmQgdGhlIFZvaWNlIE1vZGUgXCJDb25maWd1cmUgS2V5YmluZGluZ1wiIGNvbnRleHQtbWVudSBlbnRyeSB0YXJnZXRzLlxuICogVGhlIHJlbmRlcmVkIHZvaWNlIGFmZm9yZGFuY2Ugc3dhcHMgYmV0d2VlbiBzdGF0ZXMsIGJ1dCB0aGUga2V5YmluZGluZyBsaXZlcyBvblxuICogdGhlIHN0YXJ0IGNvbW1hbmQsIHNvIHRhcmdldCBpdCBpbiBldmVyeSBzdGF0ZS5cbiAqL1xuY29uc3QgVk9JQ0VfU1RBUlRfQ09NTUFORF9JRCA9ICdhZ2VudHNWb2ljZS5zdGFydFZvaWNlSW5DaGF0JztcblxuYXN5bmMgZnVuY3Rpb24gcmV0YXJnZXRWb2ljZVRvQ3VycmVudFNlc3Npb24oY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSwgY29udHJvbGxlcjogSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsIHdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0Y29uc3QgY3VycmVudFNlc3Npb24gPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxzdHJpbmcgfCB1bmRlZmluZWQ+KCdfY2hhdC52b2ljZS5nZXRDdXJyZW50U2Vzc2lvbicpO1xuXHRpZiAoIWN1cnJlbnRTZXNzaW9uKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHRyeSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoY3VycmVudFNlc3Npb24pO1xuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09ICdzZXNzaW9ucy12b2ljZScpIHtcblx0XHRcdGNvbnRyb2xsZXIudGFrZURyYWZ0SW5wdXRPd25lcnNoaXAod2luZG93KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udHJvbGxlci50YWtlU2Vzc2lvbklucHV0T3duZXJzaGlwKHJlc291cmNlLCB3aW5kb3cpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbi8qKiBOdW1iZXIgb2YgYW5pbWF0ZWQgd2F2ZWZvcm0gYmFycyBzaG93biBpbiB0aGUgdm9pY2Ugc2VnbWVudC4gKi9cbmNvbnN0IFdBVkVGT1JNX0JBUl9DT1VOVCA9IDU7XG5cbi8qKlxuICogSGVpZ2h0IGJvdW5kcyAocHgpIG9mIGFuIGF1ZGlvLXJlYWN0aXZlIHdhdmVmb3JtIGJhci4gVGhlc2UgbWlycm9yIHRoZVxuICogYGNoYXQtdm9pY2UtaW5wdXQtbW9kZS1lcWAga2V5ZnJhbWVzIGluIGB2b2ljZUlucHV0TW9kZS5jc3NgLCB3aGljaCBkcml2ZSB0aGUgYmFyc1xuICogd2hlbmV2ZXIgbm8gYW5hbHlzZXIgaXMgYXZhaWxhYmxlLCBzbyB0aGUgdHdvIG11c3QgYmUga2VwdCBpbiBzeW5jOyBib3RoIGFyZSBzaXplZFxuICogYWdhaW5zdCB0aGUgMTJweCB3YXZlZm9ybSBib3guXG4gKi9cbmNvbnN0IFdBVkVGT1JNX0JBUl9NSU5fSEVJR0hUID0gMjtcbmNvbnN0IFdBVkVGT1JNX0JBUl9NQVhfSEVJR0hUID0gMTA7XG5cbi8qKlxuICogTWVudSBwbGFjZWhvbGRlciBhY3Rpb24gZm9yIHRoZSBzZWdtZW50ZWQgdm9pY2UgaW5wdXQgbW9kZSB0b2dnbGUuIFRoZSBhY3R1YWwgVUkgaXNcbiAqIHJlbmRlcmVkIGJ5IHtAbGluayBWb2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtfTsgcnVubmluZyB0aGUgYWN0aW9uIGlzIGEgbm8tb3AuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0Vm9pY2VJbnB1dE1vZGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnZvaWNlSW5wdXRNb2RlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2hhdFZvaWNlSW5wdXRNb2RlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndm9pY2VJbnB1dE1vZGUnLCBcIlZvaWNlIElucHV0IE1vZGVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLm1pYyxcblx0XHRcdHByZWNvbmRpdGlvbjogU2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsQWN0aXZlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0U2VnbWVudGVkVm9pY2VJbnB1dE1vZGVQaWxsQWN0aXZlLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmN1cnJlbnRseUVkaXRpbmcubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAtMTEsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdC8vIE5vLW9wIFx1MjAxNCBpbnRlcmFjdGlvbiBoYW5kbGVkIGJ5IFZvaWNlSW5wdXRNb2RlQWN0aW9uVmlld0l0ZW0uXG5cdH1cbn1cblxuLyoqXG4gKiBIb2xkLXRvLXRhbGsgKHdhbGtpZS10YWxraWUpIGtleWJpbmRpbmcgZm9yIHRoZSBzZWdtZW50ZWQgdm9pY2UgdG9nZ2xlLiBXaGlsZSB0aGUga2V5XG4gKiBpcyBoZWxkIHRoZSBtaWNyb3Bob25lIGxpc3RlbnM7IHJlbGVhc2luZyBpdCBlbmRzIHRoZSB0dXJuIGFuZCBzZW5kcy4gSG9sZGluZyBhbHNvXG4gKiBpbnRlcnJ1cHRzIHRoZSBhc3Npc3RhbnQgdG8gYmFyZ2UgaW4uIFdvcmtzIHRoZSBzYW1lIGluIGhhbmRzLWZyZWUgYW5kIG1hbnVhbCBtb2RlcyBhbmRcbiAqIG5ldmVyIGRpc2Nvbm5lY3RzLiBBdXRvLWNvbm5lY3RzIG9uIHRoZSBmaXJzdCBob2xkIHNvIGEgc2luZ2xlIHNob3J0Y3V0IHN0YXJ0cyB0YWxraW5nLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFZvaWNlSW5wdXRNb2RlVG9nZ2xlTGlzdGVuQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC52b2ljZUlucHV0TW9kZS5ob2xkVG9UYWxrJztcblxuXHRwcml2YXRlIF9ob2xkQWN0aXZlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENoYXRWb2ljZUlucHV0TW9kZVRvZ2dsZUxpc3RlbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3ZvaWNlSW5wdXRNb2RlLmhvbGRUb1RhbGsnLCBcIlZvaWNlIE1vZGU6IEhvbGQgdG8gVGFsa1wiKSxcblx0XHRcdC8vIEEgaG9sZC1vbmx5IGFjdGlvbiBjYW5ub3QgYmUgaW52b2tlZCBzYWZlbHkgZnJvbSB0aGUgQ29tbWFuZCBQYWxldHRlOiBhXG5cdFx0XHQvLyBtb3VzZSBjbGljayBwcm9kdWNlcyBubyBrZXktdXAgKGxlYXZpbmcgdGhlIHR1cm4gcGVuZGluZykgYW5kIGEga2V5Ym9hcmRcblx0XHRcdC8vIGludm9jYXRpb24gY3JlYXRlcyBhbiBpbW1lZGlhdGUgZW1wdHkgdHVybi4gS2VlcCBpdCBrZXliaW5kaW5nLW9ubHkuXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IEFHRU5UU19WT0lDRV9FTkFCTEVELFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0QUdFTlRTX1ZPSUNFX0VOQUJMRUQsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0LFxuXHRcdFx0XHQpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIElnbm9yZSBrZXktcmVwZWF0IHJlLWVudHJ5IHdoaWxlIGEgaG9sZCBpcyBhbHJlYWR5IGluIHByb2dyZXNzLlxuXHRcdGlmICh0aGlzLl9ob2xkQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBhY2Nlc3Nvci5nZXQoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cblx0XHQvLyBFbmZvcmNlIG11dHVhbCBleGNsdXNpb246IGlmIGJ1aWx0LWluIGRpY3RhdGlvbiBpcyByZWNvcmRpbmcsIGNhbmNlbCBpdFxuXHRcdC8vIGJlZm9yZSBzdGFydGluZyB2b2ljZSBjYXB0dXJlIHNvIHRoZSB0d28gbmV2ZXIgcmVjb3JkIHNpbXVsdGFuZW91c2x5LlxuXHRcdGNvbnN0IHNwZWVjaFRvVGV4dCA9IGFjY2Vzc29yLmdldChJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UpO1xuXHRcdGlmIChzcGVlY2hUb1RleHQuc3RhdGUgIT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5JZGxlKSB7XG5cdFx0XHRzcGVlY2hUb1RleHQuY2FuY2VsKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUga2V5LWhvbGQgRklSU1QgKHN5bmNocm9ub3VzbHkpIFx1MjAxNCBpdCBtdXN0IGJlIHJlcXVlc3RlZCBiZWZvcmUgYW55IGF3YWl0LlxuXHRcdGNvbnN0IGhvbGRNb2RlID0ga2V5YmluZGluZ1NlcnZpY2UuZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKENoYXRWb2ljZUlucHV0TW9kZVRvZ2dsZUxpc3RlbkFjdGlvbi5JRCk7XG5cblx0XHRjb25zdCB3aW4gPSBnZXRBY3RpdmVXaW5kb3coKTtcblx0XHRsZXQga2V5UmVsZWFzZWQgPSBmYWxzZTtcblx0XHRjb25zdCByZWxlYXNlTGlzdGVuZXIgPSBkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgZG9tLkV2ZW50VHlwZS5LRVlfVVAsICgpID0+IHtcblx0XHRcdGtleVJlbGVhc2VkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2hvbGRBY3RpdmUgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIWNvbnRyb2xsZXIucmV0YWluT21uaUlucHV0T3duZXJzaGlwRm9yQmFyZ2VJbih3aW4pKSB7XG5cdFx0XHRcdGF3YWl0IHJldGFyZ2V0Vm9pY2VUb0N1cnJlbnRTZXNzaW9uKGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLCBjb250cm9sbGVyLCB3aW4pO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQXV0by1jb25uZWN0IG9uIHRoZSBmaXJzdCBob2xkIHNvIHVzZXJzIGNhbiBzdGFydCB0YWxraW5nIHdpdGggb25lIHNob3J0Y3V0LlxuXHRcdFx0aWYgKCFjb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpICYmICFjb250cm9sbGVyLmlzQ29ubmVjdGluZy5nZXQoKSkge1xuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyLmNvbm5lY3Qod2luKTtcblx0XHRcdH1cblx0XHRcdGlmIChrZXlSZWxlYXNlZCkge1xuXHRcdFx0XHQvLyBUaGUgc2hvcnRjdXQgd2FzIHJlbGVhc2VkIHdoaWxlIHRoZSBjb25uZWN0aW9uIHdhcyBzdGlsbCBiZWluZ1xuXHRcdFx0XHQvLyBlc3RhYmxpc2hlZCwgc28gdGhlIGhvbGQgYWxyZWFkeSBlbmRlZC4gU3RhcnRpbmcgcHVzaC10by10YWxrIG5vd1xuXHRcdFx0XHQvLyB3b3VsZCBpbW1lZGlhdGVseSBmb3JjZSBhbiBlbXB0eSB0dXJuLCBzbyBiYWlsIG91dCBpbnN0ZWFkLlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29udHJvbGxlci5pc0Nvbm5lY3RlZC5nZXQoKSkge1xuXHRcdFx0XHRjb250cm9sbGVyLnB0dERvd24oJ2V4cGxpY2l0JywgdHJ1ZSk7ICAvLyBmb3JjZSBjbGVhbiBuZXcgdHVyblxuXHRcdFx0XHRpZiAoaG9sZE1vZGUpIHtcblx0XHRcdFx0XHRhd2FpdCBob2xkTW9kZTsgICAgICAgIC8vIHdhaXQgZm9yIGtleSByZWxlYXNlXG5cdFx0XHRcdH0gZWxzZSBpZiAoIWtleVJlbGVhc2VkKSB7XG5cdFx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBsID0gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW4sIGRvbS5FdmVudFR5cGUuS0VZX1VQLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250cm9sbGVyLnB0dFVwKCdleHBsaWNpdCcsIHRydWUpOyAgICAvLyBmb3JjZSBmaW5pc2ggdHVybiBhbmQgc2VuZFxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWxlYXNlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5faG9sZEFjdGl2ZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIERldi9wcmV2aWV3IGNvbW1hbmRzIHRvIGZvcmNlIHRoZSB2b2ljZS1jZWxsIHZpc3VhbCBzdGF0ZXMgd2l0aG91dCBhIGxpdmUgYmFja2VuZFxuICogY29ubmVjdGlvbi4gUmVnaXN0ZXJlZCB2aWEge0BsaW5rIHJlZ2lzdGVyVm9pY2VJbnB1dE1vZGVTaW11bGF0ZUFjdGlvbnN9LlxuICovXG5jb25zdCBTSU1VTEFURV9TVEFURVM6IHsgcmVhZG9ubHkgaWQ6IHN0cmluZzsgcmVhZG9ubHkgbGFiZWw6IHN0cmluZzsgcmVhZG9ubHkgc3RhdGU6IFNpbXVsYXRlZFZvaWNlU3RhdGUgfCB1bmRlZmluZWQgfVtdID0gW1xuXHR7IGlkOiAnb2ZmJywgbGFiZWw6ICdPZmYgKERpc2Nvbm5lY3RlZCknLCBzdGF0ZTogJ29mZicgfSxcblx0eyBpZDogJ2Nvbm5lY3RpbmcnLCBsYWJlbDogJ0Nvbm5lY3RpbmcnLCBzdGF0ZTogJ2Nvbm5lY3RpbmcnIH0sXG5cdHsgaWQ6ICdpZGxlJywgbGFiZWw6ICdDb25uZWN0ZWQgKElkbGUpJywgc3RhdGU6ICdpZGxlJyB9LFxuXHR7IGlkOiAnbGlzdGVuaW5nJywgbGFiZWw6ICdMaXN0ZW5pbmcnLCBzdGF0ZTogJ2xpc3RlbmluZycgfSxcblx0eyBpZDogJ3NwZWFraW5nJywgbGFiZWw6ICdTcGVha2luZycsIHN0YXRlOiAnc3BlYWtpbmcnIH0sXG5cdHsgaWQ6ICdkaWN0YXRpbmcnLCBsYWJlbDogJ0RpY3RhdGluZycsIHN0YXRlOiAnZGljdGF0aW5nJyB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVm9pY2VJbnB1dE1vZGVTaW11bGF0ZUFjdGlvbnMoKTogdm9pZCB7XG5cdC8vIFByb3RvdHlwZSB3YWxrdGhyb3VnaHMgXHUyMDE0IG9uZSBwZXIgcHVzaC10by10YWxrIGRlc2lnbi4gRWFjaCBhdXRvLXBsYXlzIChsb29waW5nKVxuXHQvLyB0aHJvdWdoIHRoZSBmdWxsIGxpZmVjeWNsZSB3aXRoIGFjY3VyYXRlIGJhcnMsIGNvbG9ycywgaG92ZXIgcHJldmlld3MgYW5kIHRoZSByZWFsXG5cdC8vIGlucHV0LWJveCBnbG93LCBzbyB0aGUgZm91ciBpbnRlcmFjdGlvbiBtb2RlbHMgY2FuIGJlIGNvbXBhcmVkIHNpZGUgYnkgc2lkZS5cblx0Y29uc3QgVkVSU0lPTlM6IHsgcmVhZG9ubHkgdmVyc2lvbjogVm9pY2VXYWxrdGhyb3VnaFZlcnNpb247IHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgfVtdID0gW1xuXHRcdHsgdmVyc2lvbjogJ2hhbmRzRnJlZScsIGxhYmVsOiAndjQgXFx1MjAxNCBIYW5kcy1GcmVlIChBdXRvLUxpc3RlbiknIH0sXG5cdFx0eyB2ZXJzaW9uOiAna2V5Ym9hcmRIb2xkJywgbGFiZWw6ICd2MSBcXHUyMDE0IEtleWJvYXJkIEhvbGQtdG8tVGFsayAoV2Fsa2llLVRhbGtpZSknIH0sXG5cdFx0eyB2ZXJzaW9uOiAnYnV0dG9uSG9sZCcsIGxhYmVsOiAndjIgXFx1MjAxNCBCdXR0b24gSG9sZC10by1UYWxrJyB9LFxuXHRcdHsgdmVyc2lvbjogJ2NsaWNrVG9nZ2xlJywgbGFiZWw6ICd2MyBcXHUyMDE0IEJ1dHRvbiBDbGljay10by1Ub2dnbGUgTGlzdGVuaW5nJyB9LFxuXHRdO1xuXHRmb3IgKGNvbnN0IHsgdmVyc2lvbiwgbGFiZWwgfSBvZiBWRVJTSU9OUykge1xuXHRcdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb24uY2hhdC52b2ljZUlucHV0TW9kZS5zaW11bGF0ZS53YWxrdGhyb3VnaC4ke3ZlcnNpb259YCxcblx0XHRcdFx0XHR0aXRsZTogeyB2YWx1ZTogYFZvaWNlIElucHV0IE1vZGU6IFByb3RvdHlwZSBXYWxrdGhyb3VnaCBcXHUyMDE0ICR7bGFiZWx9YCwgb3JpZ2luYWw6IGBWb2ljZSBJbnB1dCBNb2RlOiBQcm90b3R5cGUgV2Fsa3Rocm91Z2ggXFx1MjAxNCAke2xhYmVsfWAgfSxcblx0XHRcdFx0XHRjYXRlZ29yeTogeyB2YWx1ZTogJ0RldmVsb3BlcicsIG9yaWdpbmFsOiAnRGV2ZWxvcGVyJyB9LFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogSXNEZXZlbG9wbWVudENvbnRleHQsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlKS5zdGFydFZvaWNlU3RhdGVXYWxrdGhyb3VnaCh2ZXJzaW9uKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8vIE1hbnVhbCBzdGVwIFx1MjAxNCBhZHZhbmNlIHRvIHRoZSBuZXh0IHN0YXRlIG9uIGVhY2ggaW52b2NhdGlvbiAoYmluZCBhIGtleSB0byBjbGljayB0aHJvdWdoKS5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnZvaWNlSW5wdXRNb2RlLnNpbXVsYXRlLnN0ZXAnLFxuXHRcdFx0XHR0aXRsZTogeyB2YWx1ZTogJ1ZvaWNlIElucHV0IE1vZGU6IFByb3RvdHlwZSBTdGVwIChOZXh0IFN0YXRlKScsIG9yaWdpbmFsOiAnVm9pY2UgSW5wdXQgTW9kZTogUHJvdG90eXBlIFN0ZXAgKE5leHQgU3RhdGUpJyB9LFxuXHRcdFx0XHRjYXRlZ29yeTogeyB2YWx1ZTogJ0RldmVsb3BlcicsIG9yaWdpbmFsOiAnRGV2ZWxvcGVyJyB9LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IElzRGV2ZWxvcG1lbnRDb250ZXh0LFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGFjY2Vzc29yLmdldChJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlKS5zdGVwVm9pY2VTdGF0ZVdhbGt0aHJvdWdoKCk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBDbGVhciBcdTIwMTQgc3RvcCBhbnkgd2Fsa3Rocm91Z2ggYW5kIHJldHVybiB0byB0aGUgcmVhbCBzdGF0ZS5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnZvaWNlSW5wdXRNb2RlLnNpbXVsYXRlLmNsZWFyJyxcblx0XHRcdFx0dGl0bGU6IHsgdmFsdWU6ICdWb2ljZSBJbnB1dCBNb2RlOiBTaW11bGF0ZSBcXHUyMDE0IENsZWFyJywgb3JpZ2luYWw6ICdWb2ljZSBJbnB1dCBNb2RlOiBTaW11bGF0ZSBcXHUyMDE0IENsZWFyJyB9LFxuXHRcdFx0XHRjYXRlZ29yeTogeyB2YWx1ZTogJ0RldmVsb3BlcicsIG9yaWdpbmFsOiAnRGV2ZWxvcGVyJyB9LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IElzRGV2ZWxvcG1lbnRDb250ZXh0LFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGFjY2Vzc29yLmdldChJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlKS5jbGVhclNpbXVsYXRpb24oKTtcblx0XHR9XG5cdH0pO1xuXG5cdGZvciAoY29uc3QgeyBpZCwgbGFiZWwsIHN0YXRlIH0gb2YgU0lNVUxBVEVfU1RBVEVTKSB7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5jaGF0LnZvaWNlSW5wdXRNb2RlLnNpbXVsYXRlLiR7aWR9YCxcblx0XHRcdFx0XHQvLyBEZXYtb25seSB1dGlsaXR5IFx1MjAxNCBub3QgbG9jYWxpemVkLlxuXHRcdFx0XHRcdHRpdGxlOiB7IHZhbHVlOiBgVm9pY2UgSW5wdXQgTW9kZTogU2ltdWxhdGUgXFx1MjAxNCAke2xhYmVsfWAsIG9yaWdpbmFsOiBgVm9pY2UgSW5wdXQgTW9kZTogU2ltdWxhdGUgXFx1MjAxNCAke2xhYmVsfWAgfSxcblx0XHRcdFx0XHRjYXRlZ29yeTogeyB2YWx1ZTogJ0RldmVsb3BlcicsIG9yaWdpbmFsOiAnRGV2ZWxvcGVyJyB9LFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogSXNEZXZlbG9wbWVudENvbnRleHQsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlKS5zZXRTaW11bGF0ZWRWb2ljZVN0YXRlKHN0YXRlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIE9wdGlvbmFsIGhvc3QgaG9va3MgZm9yIHJldXNpbmcge0BsaW5rIFZvaWNlSW5wdXRNb2RlQWN0aW9uVmlld0l0ZW19IG91dHNpZGUgdGhlXG4gKiBtYWluIGNoYXQgaW5wdXQgKGUuZy4gdGhlIGFnZW50cy13aW5kb3cgbmV3LXNlc3Npb24gY29tcG9zZXIpLCB3aGVyZSBkaWN0YXRpb24gYW5kXG4gKiB2b2ljZSBtdXN0IHRhcmdldCB0aGF0IHN1cmZhY2UgcmF0aGVyIHRoYW4gdGhlIGxhc3QgZm9jdXNlZCBjaGF0IHdpZGdldC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVm9pY2VJbnB1dE1vZGVQaWxsT3B0aW9ucyB7XG5cdC8qKiBUb2dnbGUgZGljdGF0aW9uIGZvciB0aGUgaG9zdCBzdXJmYWNlIChkZWZhdWx0cyB0byB0aGUgc2hhcmVkIHRvZ2dsZSBjb21tYW5kKS4gKi9cblx0cmVhZG9ubHkgdG9nZ2xlRGljdGF0aW9uPzogKCkgPT4gdm9pZDtcblx0LyoqIFdoZXRoZXIgdGhpcyBpcyB0aGUgZm9jdXNlZCBvciBsYXN0LWZvY3VzZWQgY2hhdCBpbnB1dCB0aGF0IG93bnMgbGl2ZSBzdGF0ZS4gKi9cblx0cmVhZG9ubHkgaXNBY3RpdmU/OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIFdoZXRoZXIgdGhlIHNoYXJlZCBWb2ljZSBNb2RlIHRyYW5zcG9ydCBiZWxvbmdzIHRvIHRoaXMgaW5wdXQuICovXG5cdHJlYWRvbmx5IGlzVm9pY2VBY3RpdmU/OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIENsYWltIFZvaWNlIE1vZGUgZm9yIHRoaXMgaG9zdCBpbnN0ZWFkIG9mIHRhcmdldGluZyB0aGUgbGFzdCBmb2N1c2VkIGNoYXQgc2Vzc2lvbi4gKi9cblx0cmVhZG9ubHkgYWN0aXZhdGVWb2ljZU1vZGU/OiAoKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcbn1cblxuLyoqXG4gKiBBIHNpbmdsZSBzZWdtZW50ZWQgY29udHJvbCBpbiB0aGUgY2hhdCBpbnB1dCB0aGF0IGhvc3RzIGJvdGggdm9pY2UgaW5wdXQgbW9kZXM6XG4gKiBhIERpY3RhdGlvbiBzZWdtZW50IChzcGVlY2gtdG8tdGV4dCBpbnRvIHRoZSBpbnB1dCkgYW5kIGEgVm9pY2UgTW9kZSBzZWdtZW50IChsaXZlXG4gKiBjb252ZXJzYXRpb25hbCBhZ2VudCkuIE9ubHkgb25lIG1vZGUgY2FuIGJlIGFjdGl2ZSBhdCBhIHRpbWUgXHUyMDE0IGFjdGl2YXRpbmcgb25lIHN0b3BzXG4gKiB0aGUgb3RoZXIuIEJvdGggc2VnbWVudHMgc3RheSB2aXNpYmxlICh3aGVuIGF2YWlsYWJsZSkgc28gdXNlcnMgZGlzY292ZXIgYm90aCBtb2Rlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFZvaWNlSW5wdXRNb2RlQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgX3JlZWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kaWN0YXRpb25DZWxsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdm9pY2VDZWxsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGlzdGVuQ2VsbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RpY3RhdGlvbkljb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9saXN0ZW5JY29uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdm9pY2VCYXJzOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdm9pY2VCYXJFbHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0cHJpdmF0ZSBfYmFyQW5pbWF0aW9uRnJhbWU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdm9pY2VIb3ZlcmluZyA9IGZhbHNlO1xuXHRwcml2YXRlIF92b2ljZUxpdmUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYmFyRGF0YTogVWludDhBcnJheSB8IHVuZGVmaW5lZDtcblxuXHQvLyBIb2xkLXRvLXRhbGsgZ2VzdHVyZSBzdGF0ZSBmb3IgdGhlIGxpc3RlbiBjZWxsOiBwcmVzcy1hbmQtaG9sZCByZWNvcmRzLCByZWxlYXNlIHNlbmRzLlxuXHRwcml2YXRlIF9saXN0ZW5Ib2xkVGltZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGlzdGVuSG9sZExpc3RlbmluZyA9IGZhbHNlO1xuXHRwcml2YXRlIF9saXN0ZW5Ib2xkR2VzdHVyZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9saXN0ZW5TdXBwcmVzc0NsaWNrID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3RlblBvaW50ZXJVcCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0Ly8gUHJvZ3Jlc3MgcmluZyBzaG93biBvdmVyIHRoZSBkaWN0YXRpb24gZ2x5cGggZHVyaW5nIGFuIGFjdHVhbCBvbi1kaXNrXG5cdC8vIG1vZGVsIGRvd25sb2FkIChjYWNoZSBtaXNzKSwgbWlycm9yaW5nIHRoZSBzdGFuZGFsb25lIHRvb2xiYXIgYnV0dG9uLlxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWN0YXRpb25SaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpY3RhdGlvbkRvd25sb2FkUmluZz4oKSk7XG5cblx0cHJpdmF0ZSBfZ2V0TGFiZWxXaXRoS2V5YmluZGluZyhsYWJlbDogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhsYWJlbCwgY29tbWFuZElkKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFyaWFMYWJlbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGljdGF0aW9uQ2VsbD8uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5fZGljdGF0aW9uQ2VsbC5jbGFzc0xpc3QuY29udGFpbnMoJ3ByZXBhcmluZycpXG5cdFx0XHQ/IGxvY2FsaXplKCd2b2ljZUlucHV0TW9kZS5kaWN0YXRpb25QcmVwYXJpbmcnLCBcIlByZXBhcmluZyBTcGVlY2ggdG8gVGV4dCBNb2RlbFx1MjAyNlwiKVxuXHRcdFx0OiB0aGlzLl9nZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxvY2FsaXplKCd2b2ljZUlucHV0TW9kZS5kaWN0YXRpb24nLCBcIkRpY3RhdGlvblwiKSwgRElDVEFUSU9OX1RPR0dMRV9DT01NQU5EX0lEKSk7XG5cdFx0dGhpcy5fdm9pY2VDZWxsPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLl92b2ljZUNlbGwuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb25uZWN0aW5nJylcblx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLmNvbm5lY3RpbmcnLCBcIkNvbm5lY3RpbmcgdG8gVm9pY2UgTW9kZVx1MjAyNlwiKVxuXHRcdFx0OiB0aGlzLl92b2ljZUNlbGwuY2xhc3NMaXN0LmNvbnRhaW5zKCdvbicpXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLmRpc2Nvbm5lY3QnLCBcIlR1cm4gT2ZmIFZvaWNlIE1vZGVcIilcblx0XHRcdFx0OiB0aGlzLl9nZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxvY2FsaXplKCd2b2ljZUlucHV0TW9kZS52b2ljZScsIFwiVm9pY2UgTW9kZVwiKSwgVk9JQ0VfU1RBUlRfQ09NTUFORF9JRCkpO1xuXHRcdHRoaXMuX2xpc3RlbkNlbGw/LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuX2xpc3RlbkNlbGwuY2xhc3NMaXN0LmNvbnRhaW5zKCdhY3RpdmUnKVxuXHRcdFx0PyB0aGlzLl9nZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxvY2FsaXplKCd2b2ljZUlucHV0TW9kZS5zdG9wTGlzdGVuaW5nJywgXCJTdG9wIExpc3RlbmluZ1wiKSwgQ2hhdFZvaWNlSW5wdXRNb2RlVG9nZ2xlTGlzdGVuQWN0aW9uLklEKVxuXHRcdFx0OiB0aGlzLl9nZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxvY2FsaXplKCd2b2ljZUlucHV0TW9kZS5zdGFydExpc3RlbmluZycsIFwiU3RhcnQgTGlzdGVuaW5nXCIpLCBDaGF0Vm9pY2VJbnB1dE1vZGVUb2dnbGVMaXN0ZW5BY3Rpb24uSUQpKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJVm9pY2VJbnB1dE1vZGVQaWxsT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASVZvaWNlSW5wdXRNb2RlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZvaWNlSW5wdXRNb2RlU2VydmljZTogSVZvaWNlSW5wdXRNb2RlU2VydmljZSxcblx0XHRASVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgcHJpdmF0ZSByZWFkb25seSB2b2ljZVNlc3Npb25Db250cm9sbGVyOiBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcixcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU1pY0NhcHR1cmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWljQ2FwdHVyZVNlcnZpY2U6IElNaWNDYXB0dXJlU2VydmljZSxcblx0XHRASVR0c1BsYXliYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR0c1BsYXliYWNrU2VydmljZTogSVR0c1BsYXliYWNrU2VydmljZSxcblx0XHRASUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2U6IElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24pO1xuXHR9XG5cblx0LyoqIFNldCB0aGUgcGVyLXN0YXRlIHBpbGwvd2F2ZWZvcm0gY29sb3JzIGZyb20gdGhlIHRoZW1lLWRlcml2ZWQgdm9pY2UgYWNjZW50LiAqL1xuXHRwcml2YXRlIF91cGRhdGVWb2ljZVN0YXRlQ29sb3JzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjb2xvcnMgPSByZXNvbHZlVm9pY2VHbG93Q29sb3JzKHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXZvaWNlLWNvbG9yLWxpc3RlbmluZycsIGNvbG9ycy5saXN0ZW5pbmcudG9TdHJpbmcoKSk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXZvaWNlLWNvbG9yLXNwZWFraW5nJywgY29sb3JzLnNwZWFraW5nLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLXNlZ21lbnRlZC1pY29uLXRvZ2dsZS1jb250YWluZXInLCAnY2hhdC12b2ljZS1pbnB1dC1tb2RlLWl0ZW0nKTtcblxuXHRcdC8vIERyaXZlIHRoZSBwaWxsICsgd2F2ZWZvcm0gY29sb3JzIGZyb20gdGhlIHNhbWUgdGhlbWUtZGVyaXZlZCBhY2NlbnQgYXMgdGhlXG5cdFx0Ly8gaW5wdXQtYm94IGdsb3csIHNvIGFsbCB0aHJlZSBhbHdheXMgbWF0Y2ggYW5kIGFkYXB0IHRvIHRoZSBhY3RpdmUgdGhlbWUuXG5cdFx0dGhpcy5fdXBkYXRlVm9pY2VTdGF0ZUNvbG9ycyhjb250YWluZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB0aGlzLl91cGRhdGVWb2ljZVN0YXRlQ29sb3JzKGNvbnRhaW5lcikpKTtcblxuXHRcdC8vIEEgbWFza2VkIDItc2xvdCB2aWV3cG9ydCAoXCJzbG90IG1hY2hpbmUgcmVlbFwiKS4gVGhlIHJlZWwgaG9sZHMgdGhyZWUgY2VsbHM6XG5cdFx0Ly8gICBbIGRpY3RhdGlvbiBdWyB2b2ljZSBdWyBsaXN0ZW4gXVxuXHRcdC8vIERpc2Nvbm5lY3RlZCBcdTIxOTIgdGhlIHJlZWwgc2hvd3Mgc2xvdHMgMC4uMSAoZGljdGF0aW9uICsgdm9pY2UtY29ubmVjdCkuXG5cdFx0Ly8gQ29ubmVjdGVkICAgIFx1MjE5MiB0aGUgcmVlbCBzbGlkZXMgbGVmdCBvbmUgc2xvdCB0byBzaG93IHNsb3RzIDEuLjIsIHNvIHRoZSB2b2ljZVxuXHRcdC8vICAgICAgICAgICAgICAgIGNlbGwgdGFrZXMgdGhlIGRpY3RhdGlvbiBjZWxsJ3MgcGxhY2UgKG5vdyBhbmltYXRlZCArIGRpc2Nvbm5lY3QpXG5cdFx0Ly8gICAgICAgICAgICAgICAgYW5kIHRoZSBsaXN0ZW4gdG9nZ2xlIHNsaWRlcyBpbiBmcm9tIHRoZSByaWdodC5cblx0XHRjb25zdCBwaWxsID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcubW9uYWNvLXNlZ21lbnRlZC1pY29uLXRvZ2dsZS5jaGF0LXZvaWNlLWlucHV0LW1vZGUnKSk7XG5cdFx0dGhpcy5fcmVlbCA9IGRvbS5hcHBlbmQocGlsbCwgZG9tLiQoJy5tb25hY28tc2VnbWVudGVkLWljb24tdG9nZ2xlLXJlZWwuY2hhdC12b2ljZS1pbnB1dC1tb2RlLXJlZWwnKSk7XG5cblx0XHQvLyAtLS0gRGljdGF0aW9uIGNlbGwgLS0tXG5cdFx0dGhpcy5fZGljdGF0aW9uQ2VsbCA9IGRvbS5hcHBlbmQodGhpcy5fcmVlbCwgZG9tLiQoJ2J1dHRvbi5tb25hY28tc2VnbWVudGVkLWljb24tdG9nZ2xlLWNlbGwuY2hhdC12b2ljZS1pbnB1dC1tb2RlLWNlbGwuZGljdGF0aW9uJykpO1xuXHRcdHRoaXMuX2RpY3RhdGlvbkNlbGwuc2V0QXR0cmlidXRlKCd0eXBlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX2RpY3RhdGlvbkNlbGwuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX2RpY3RhdGlvbkljb24gPSBkb20uYXBwZW5kKHRoaXMuX2RpY3RhdGlvbkNlbGwsIGRvbS4kKCdzcGFuLmNoYXQtdm9pY2UtaW5wdXQtbW9kZS1pY29uJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMuX2RpY3RhdGlvbkNlbGwsXG5cdFx0XHQoKSA9PiB0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLmlzUHJlcGFyaW5nTW9kZWxcblx0XHRcdFx0PyBnZXREaWN0YXRpb25Eb3dubG9hZEhvdmVyQ29udGVudCh0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlKVxuXHRcdFx0XHQ6IGdldERpY3RhdGlvbkhvdmVyQ29udGVudCh0aGlzLl9nZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxvY2FsaXplKCd2b2ljZUlucHV0TW9kZS5kaWN0YXRpb24nLCBcIkRpY3RhdGlvblwiKSwgRElDVEFUSU9OX1RPR0dMRV9DT01NQU5EX0lEKSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RpY3RhdGlvbkNlbGwsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9vbkNsaWNrRGljdGF0aW9uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyQWN0aXZhdGlvbktleXModGhpcy5fZGljdGF0aW9uQ2VsbCwgKCkgPT4gdGhpcy5fb25DbGlja0RpY3RhdGlvbigpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGRNaWNCdXR0b25Db250ZXh0TWVudUxpc3RlbmVyKFxuXHRcdFx0dGhpcy5fZGljdGF0aW9uQ2VsbCxcblx0XHRcdCgpID0+IGdldERpY3RhdGlvbkNvbnRleHRNZW51QWN0aW9ucyh0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCBESUNUQVRJT05fVE9HR0xFX0NPTU1BTkRfSUQpLFxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2V0dXBEaWN0YXRpb25NaWNHbG93KHRoaXMuX2RpY3RhdGlvbkNlbGwsIHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsIHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UsIHRoaXMuX29wdGlvbnM/LmlzQWN0aXZlLCB0aGlzLnRoZW1lU2VydmljZSkpO1xuXG5cdFx0Ly8gLS0tIFZvaWNlIGNlbGw6IGEgc2luZ2xlIHdhdmVmb3JtIHRoYXQgdHJhbnNmb3JtcyBhY3Jvc3Mgc3RhdGVzIChubyBnbHlwaCkuIC0tLVxuXHRcdHRoaXMuX3ZvaWNlQ2VsbCA9IGRvbS5hcHBlbmQodGhpcy5fcmVlbCwgZG9tLiQoJ2J1dHRvbi5tb25hY28tc2VnbWVudGVkLWljb24tdG9nZ2xlLWNlbGwuY2hhdC12b2ljZS1pbnB1dC1tb2RlLWNlbGwudm9pY2UnKSk7XG5cdFx0dGhpcy5fdm9pY2VDZWxsLnNldEF0dHJpYnV0ZSgndHlwZScsICdidXR0b24nKTtcblx0XHR0aGlzLl92b2ljZUNlbGwuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX3ZvaWNlQmFycyA9IGRvbS5hcHBlbmQodGhpcy5fdm9pY2VDZWxsLCBkb20uJCgnc3Bhbi5jaGF0LXZvaWNlLWlucHV0LW1vZGUtYmFycycpKTtcblx0XHQvLyBDb25uZWN0L3JlY29ubmVjdCBzcGlubmVyLiBTd2FwcGVkIGluIGZvciB0aGUgYmFycyB3aGlsZSBhIHNvY2tldCBpcyBiZWluZ1xuXHRcdC8vIGVzdGFibGlzaGVkLCBzbyBhIHJldHJ5IGxvb3AgcmVhZHMgYXMgXCJ3b3JraW5nIG9uIGl0XCIgcmF0aGVyIHRoYW4gYXMgYSBsaXZlXG5cdFx0Ly8gc2Vzc2lvbi4gQ1NTIGhpZGVzIHdoaWNoZXZlciBvZiB0aGUgdHdvIHRoZSBgY29ubmVjdGluZ2AgY2xhc3MgZGVzZWxlY3RzLlxuXHRcdGRvbS5hcHBlbmQodGhpcy5fdm9pY2VDZWxsLCBkb20uJChgc3Bhbi5jaGF0LXZvaWNlLWlucHV0LW1vZGUtaWNvbi5jaGF0LXZvaWNlLWlucHV0LW1vZGUtc3Bpbm5lciR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5sb2FkaW5nQ29tcGFjdCl9YCkpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgV0FWRUZPUk1fQkFSX0NPVU5UOyBpKyspIHtcblx0XHRcdHRoaXMuX3ZvaWNlQmFyRWxzLnB1c2goZG9tLmFwcGVuZCh0aGlzLl92b2ljZUJhcnMsIGRvbS4kKCdzcGFuLmNoYXQtdm9pY2UtaW5wdXQtbW9kZS1iYXInKSkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCB0aGlzLl92b2ljZUNlbGwsXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG93bnNWb2ljZSA9IHRoaXMuX29wdGlvbnM/LmlzVm9pY2VBY3RpdmU/LmdldCgpID8/IHRoaXMuX29wdGlvbnM/LmlzQWN0aXZlPy5nZXQoKSA/PyB0cnVlO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0ZWRpc2ggPSAob3duc1ZvaWNlICYmICh0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkgfHwgdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGluZy5nZXQoKSkpIHx8IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZvaWNlU3RhdGUuZ2V0KCkgPT09ICdpZGxlJyB8fCB0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5zaW11bGF0ZWRWb2ljZVN0YXRlLmdldCgpID09PSAnbGlzdGVuaW5nJyB8fCB0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5zaW11bGF0ZWRWb2ljZVN0YXRlLmdldCgpID09PSAnc3BlYWtpbmcnO1xuXHRcdFx0XHRyZXR1cm4gZ2V0Vm9pY2VNb2RlSG92ZXJDb250ZW50KGNvbm5lY3RlZGlzaFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLmRpc2Nvbm5lY3QnLCBcIlR1cm4gT2ZmIFZvaWNlIE1vZGVcIilcblx0XHRcdFx0XHQ6IHRoaXMuX2dldExhYmVsV2l0aEtleWJpbmRpbmcobG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLnZvaWNlJywgXCJWb2ljZSBNb2RlXCIpLCBWT0lDRV9TVEFSVF9DT01NQU5EX0lEKSk7XG5cdFx0XHR9KSk7XG5cdFx0Ly8gVGhlIHZvaWNlIGJ1dHRvbiBpcyBhIHBsYWluIHBvd2VyIHRvZ2dsZSAoY29ubmVjdCAvIGRpc2Nvbm5lY3QpLiBMaXN0ZW5pbmcgaXNcblx0XHQvLyBkcml2ZW4gYnkgdGhlIHNlcGFyYXRlIGxpc3RlbiBjZWxsIGluIG1hbnVhbCBtb2RlIGFuZCBieSB0aGUgYXV0by1saXN0ZW4gbG9vcFxuXHRcdC8vIGluIGhhbmRzLWZyZWUgbW9kZS5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3ZvaWNlQ2VsbCwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdHZvaWQgdGhpcy5fb25DbGlja1ZvaWNlUG93ZXJUb2dnbGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJBY3RpdmF0aW9uS2V5cyh0aGlzLl92b2ljZUNlbGwsICgpID0+IHRoaXMuX29uQ2xpY2tWb2ljZVBvd2VyVG9nZ2xlKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZE1pY0J1dHRvbkNvbnRleHRNZW51TGlzdGVuZXIoXG5cdFx0XHR0aGlzLl92b2ljZUNlbGwsXG5cdFx0XHQoKSA9PiBnZXRWb2ljZU1vZGVDb250ZXh0TWVudUFjdGlvbnModGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgVk9JQ0VfU1RBUlRfQ09NTUFORF9JRCksXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZSxcblx0XHQpKTtcblx0XHQvLyBQYXVzZSB0aGUgYXVkaW8tcmVhY3RpdmUgYmFycyB3aGlsZSBob3ZlcmluZyBzbyB0aGUgQ1NTIFwic2lsZW50XCIgcHJldmlldyBzaG93cy5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3ZvaWNlQ2VsbCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fdm9pY2VIb3ZlcmluZyA9IHRydWU7XG5cdFx0XHR0aGlzLl9zdG9wQmFyQW5pbWF0aW9uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdm9pY2VDZWxsLCBkb20uRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl92b2ljZUhvdmVyaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9zeW5jQmFyQW5pbWF0aW9uKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gLS0tIExpc3RlbiBjZWxsOiBtaWMvc3RvcCBpY29uIHRoYXQgdG9nZ2xlcyBsaXN0ZW5pbmcgaW4gbWFudWFsIHZvaWNlIG1vZGUuIC0tLVxuXHRcdHRoaXMuX2xpc3RlbkNlbGwgPSBkb20uYXBwZW5kKHRoaXMuX3JlZWwsIGRvbS4kKCdidXR0b24ubW9uYWNvLXNlZ21lbnRlZC1pY29uLXRvZ2dsZS1jZWxsLmNoYXQtdm9pY2UtaW5wdXQtbW9kZS1jZWxsLmxpc3RlbicpKTtcblx0XHR0aGlzLl9saXN0ZW5DZWxsLnNldEF0dHJpYnV0ZSgndHlwZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9saXN0ZW5DZWxsLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9saXN0ZW5JY29uID0gZG9tLmFwcGVuZCh0aGlzLl9saXN0ZW5DZWxsLCBkb20uJCgnc3Bhbi5jaGF0LXZvaWNlLWlucHV0LW1vZGUtaWNvbicpKTtcblx0XHR0aGlzLl91cGRhdGVBcmlhTGFiZWxzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKCgpID0+IHRoaXMuX3VwZGF0ZUFyaWFMYWJlbHMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZE1pY0J1dHRvbkNvbnRleHRNZW51TGlzdGVuZXIoXG5cdFx0XHR0aGlzLl9saXN0ZW5DZWxsLFxuXHRcdFx0KCkgPT4gZ2V0Vm9pY2VNb2RlQ29udGV4dE1lbnVBY3Rpb25zKHRoaXMuY29tbWFuZFNlcnZpY2UsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIFZPSUNFX1NUQVJUX0NPTU1BTkRfSUQpLFxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgdGhpcy5fbGlzdGVuQ2VsbCxcblx0XHRcdCgpID0+IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci52b2ljZVN0YXRlLmdldCgpID09PSAnbGlzdGVuaW5nJ1xuXHRcdFx0XHQ/IHRoaXMuX2dldExhYmVsV2l0aEtleWJpbmRpbmcobG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLnN0b3BMaXN0ZW5pbmcnLCBcIlN0b3AgTGlzdGVuaW5nXCIpLCBDaGF0Vm9pY2VJbnB1dE1vZGVUb2dnbGVMaXN0ZW5BY3Rpb24uSUQpXG5cdFx0XHRcdDogdGhpcy5fZ2V0TGFiZWxXaXRoS2V5YmluZGluZyhsb2NhbGl6ZSgndm9pY2VJbnB1dE1vZGUuc3RhcnRPckhvbGRMaXN0ZW5pbmcnLCBcIlRhcCB0byBzdGFydCwgb3IgaG9sZCB0byB0YWxrXCIpLCBDaGF0Vm9pY2VJbnB1dE1vZGVUb2dnbGVMaXN0ZW5BY3Rpb24uSUQpKSk7XG5cdFx0Ly8gVGhlIGxpc3RlbiBjZWxsIHN1cHBvcnRzIHR3byBnZXN0dXJlczogYSB0YXAgdG9nZ2xlcyBsaXN0ZW5pbmcgb24vb2ZmLCBhbmQgYVxuXHRcdC8vIHByZXNzLWFuZC1ob2xkIHJlY29yZHMgd2hpbGUgaGVsZCBhbmQgc2VuZHMgb24gcmVsZWFzZSAoaG9sZC10by10YWxrKS4gVXNlIHRoZVxuXHRcdC8vIGdlbmVyaWMgcG9pbnRlci1hd2FyZSBsaXN0ZW5lciBzbyBwcmVzcy1hbmQtaG9sZCBhbHNvIHN0YXJ0cyBvbiBpT1MuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIodGhpcy5fbGlzdGVuQ2VsbCwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkxpc3RlblBvaW50ZXJEb3duKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fbGlzdGVuQ2VsbCwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdGlmICh0aGlzLl9saXN0ZW5TdXBwcmVzc0NsaWNrKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3RlblN1cHByZXNzQ2xpY2sgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuOyAvLyB0cmFpbGluZyBjbGljayBhZnRlciBhIGhvbGQgXHUyMDE0IHRoZSByZWxlYXNlIGFscmVhZHkgaGFuZGxlZCBpdFxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25DbGlja0xpc3RlbigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlckFjdGl2YXRpb25LZXlzKHRoaXMuX2xpc3RlbkNlbGwsICgpID0+IHRoaXMuX29uQ2xpY2tMaXN0ZW4oKSk7XG5cblx0XHQvLyBEaWN0YXRpb24gYWN0aXZpdHk6IHNjb3BlZCB0byBjaGF0IHNvIGVkaXRvciBhbmQgdGVybWluYWwgZGljdGF0aW9uIGRvIG5vdFxuXHRcdC8vIGFuaW1hdGUgdGhpcyBjb250cm9sLlxuXHRcdGNvbnN0IGRpY3RhdGlvbkFjdGl2ZSA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VTdGF0ZSxcblx0XHRcdCgpID0+IGlzRGljdGF0aW9uQWN0aXZlT25TdXJmYWNlKHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsICdjaGF0JykgJiYgdGhpcy5jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5zdGF0ZSAhPT0gQ2hhdFNwZWVjaFRvVGV4dFN0YXRlLklkbGUpO1xuXG5cdFx0Ly8gTW9kZWwgcHJlcGFyYXRpb246IG9uIGZpcnN0IHVzZSB0aGUgb24tZGV2aWNlIG1vZGVsIGRvd25sb2Fkcy9sb2Fkcy4gU3dhcCB0aGVcblx0XHQvLyBtaWMgZm9yIGEgZG93bmxvYWQgYWZmb3JkYW5jZSB3aGlsZSBwcmVwYXJpbmcsIG1pcnJvcmluZyB0aGUgc3RhbmRhbG9uZSBidXR0b24uXG5cdFx0Y29uc3QgZGljdGF0aW9uUHJlcGFyaW5nID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5vbkRpZENoYW5nZVByZXBhcmluZ01vZGVsLFxuXHRcdFx0KCkgPT4gdGhpcy5jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5jdXJyZW50U3VyZmFjZSA9PT0gJ2NoYXQnICYmIHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UuaXNQcmVwYXJpbmdNb2RlbCk7XG5cdFx0Ly8gU3ViLXN0YXRlIG9mIHByZXBhcmluZzogYHRydWVgIG9ubHkgZHVyaW5nIGEgY29uZmlybWVkIG9uLWRpc2sgZG93bmxvYWRcblx0XHQvLyAoY2FjaGUgbWlzcyksIGBmYWxzZWAgd2hpbGUgbG9hZGluZyBhbiBhbHJlYWR5LWNhY2hlZCBtb2RlbC4gRHJpdmVzIHRoZVxuXHRcdC8vIGRvd25sb2FkLXZzLXNwaW5uZXIgZ2x5cGggYmVsb3cuXG5cdFx0Y29uc3QgZGljdGF0aW9uRG93bmxvYWRpbmcgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHR0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlRG93bmxvYWRpbmdNb2RlbCxcblx0XHRcdCgpID0+IHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UuaXNEb3dubG9hZGluZ01vZGVsKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGRpY3RhdGlvbkF2YWlsYWJsZSA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLmRpY3RhdGlvbkF2YWlsYWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2b2ljZUF2YWlsYWJsZSA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnZvaWNlQXZhaWxhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNpbUhhbmRzRnJlZSA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZEhhbmRzRnJlZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYW5kc0ZyZWUgPSBzaW1IYW5kc0ZyZWUgPz8gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2UuaGFuZHNGcmVlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNpbSA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZvaWNlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBzaW0gIT09IHVuZGVmaW5lZCB8fCAodGhpcy5fb3B0aW9ucz8uaXNBY3RpdmU/LnJlYWQocmVhZGVyKSA/PyB0cnVlKTtcblx0XHRcdGNvbnN0IGlzVm9pY2VBY3RpdmUgPSBzaW0gIT09IHVuZGVmaW5lZCB8fCAodGhpcy5fb3B0aW9ucz8uaXNWb2ljZUFjdGl2ZT8ucmVhZChyZWFkZXIpID8/IGlzQWN0aXZlKTtcblxuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgZWZmZWN0aXZlIHN0YXRlIFx1MjAxNCBhIHNpbXVsYXRpb24gb3ZlcnJpZGUgd2lucyBvdmVyIGxpdmUgc3RhdGUuXG5cdFx0XHRsZXQgaXNEaWN0YXRpbmc6IGJvb2xlYW47XG5cdFx0XHRsZXQgY29ubmVjdGVkOiBib29sZWFuO1xuXHRcdFx0bGV0IGNvbm5lY3Rpbmc6IGJvb2xlYW47XG5cdFx0XHRsZXQgbGlzdGVuaW5nOiBib29sZWFuO1xuXHRcdFx0bGV0IHNwZWFraW5nOiBib29sZWFuO1xuXHRcdFx0aWYgKHNpbSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlzRGljdGF0aW5nID0gc2ltID09PSAnZGljdGF0aW5nJztcblx0XHRcdFx0Y29ubmVjdGluZyA9IHNpbSA9PT0gJ2Nvbm5lY3RpbmcnO1xuXHRcdFx0XHRjb25uZWN0ZWQgPSBzaW0gPT09ICdpZGxlJyB8fCBzaW0gPT09ICdsaXN0ZW5pbmcnIHx8IHNpbSA9PT0gJ3NwZWFraW5nJztcblx0XHRcdFx0bGlzdGVuaW5nID0gc2ltID09PSAnbGlzdGVuaW5nJztcblx0XHRcdFx0c3BlYWtpbmcgPSBzaW0gPT09ICdzcGVha2luZyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpc0RpY3RhdGluZyA9IGlzQWN0aXZlICYmIGRpY3RhdGlvbkFjdGl2ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbm5lY3RlZCA9IGlzVm9pY2VBY3RpdmUgJiYgdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Ly8gQSByZWNvbm5lY3QgaXMgYSBjb25uZWN0IGluIHByb2dyZXNzIGFzIGZhciBhcyB0aGlzIHBpbGwgaXMgY29uY2VybmVkOlxuXHRcdFx0XHQvLyB3aXRob3V0IGl0IHRoZSBwaWxsIHJlbmRlcnMgaXRzIGlkbGUgc3RhdGUgd2hpbGUgdGhlIHNvY2tldCBpcyByZXRyeWluZy5cblx0XHRcdFx0Y29ubmVjdGluZyA9IGlzVm9pY2VBY3RpdmUgJiYgKHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcucmVhZChyZWFkZXIpXG5cdFx0XHRcdFx0fHwgdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzUmVjb25uZWN0aW5nLnJlYWQocmVhZGVyKSk7XG5cdFx0XHRcdGNvbnN0IHZvaWNlU3RhdGUgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudm9pY2VTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxpc3RlbmluZyA9IGNvbm5lY3RlZCAmJiB2b2ljZVN0YXRlID09PSAnbGlzdGVuaW5nJztcblx0XHRcdFx0c3BlYWtpbmcgPSBjb25uZWN0ZWQgJiYgdm9pY2VTdGF0ZSA9PT0gJ3NwZWFraW5nJztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZvaWNlTGl2ZSA9IGxpc3RlbmluZyB8fCBzcGVha2luZztcblx0XHRcdGNvbnN0IHZvaWNlT24gPSBjb25uZWN0ZWQgfHwgY29ubmVjdGluZztcblx0XHRcdHRoaXMuX3ZvaWNlTGl2ZSA9IHZvaWNlTGl2ZTtcblx0XHRcdC8vIEZpcnN0LXVzZSBtb2RlbCBkb3dubG9hZC9sb2FkIChyZWFsIHN0YXRlIG9ubHk7IHNpbXVsYXRpb25zIG5ldmVyIHByZXBhcmUpLlxuXHRcdFx0Y29uc3QgZGljdGF0aW9uQnVzeSA9IHNpbSA9PT0gdW5kZWZpbmVkICYmIGlzQWN0aXZlICYmIGRpY3RhdGlvblByZXBhcmluZy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIFRoZSBkZWRpY2F0ZWQgbGlzdGVuIChzdGFydC9zdG9wIHNwZWFraW5nKSB0b2dnbGUgc2hvd3MgaW4gbWFudWFsXG5cdFx0XHQvLyAobm9uLWhhbmRzLWZyZWUpIGNvbm5lY3RlZCB2b2ljZSBtb2RlLiBJbiBoYW5kcy1mcmVlIG1vZGUgdGhlIGF1dG8tbGlzdGVuXG5cdFx0XHQvLyBsb29wIGRyaXZlcyBsaXN0ZW5pbmcsIHNvIHRoZXJlIGlzIG5vIGxpc3RlbiBjZWxsLiBJdCBrZXlzIG9mZiBgY29ubmVjdGVkYFxuXHRcdFx0Ly8gcmF0aGVyIHRoYW4gYHZvaWNlT25gIHNvIGEgY29ubmVjdC9yZWNvbm5lY3QgcmVuZGVycyBhcyBhIHNpbmdsZS1jZWxsXG5cdFx0XHQvLyBzcGlubmVyIGluc3RlYWQgb2YgYSBzcGlubmVyIGJlc2lkZSBhbiBpbmVydCBsaXN0ZW4gYnV0dG9uLlxuXHRcdFx0Y29uc3Qgc2hvd0xpc3RlbiA9IGNvbm5lY3RlZCAmJiAhaGFuZHNGcmVlO1xuXG5cdFx0XHQvLyBQcmVzZW5jZSBvZiBlYWNoIGNlbGwuIFRoZSBob3VzaW5nIGlzIGEgY29uc3RhbnQgc2l6ZTsgdGhlIGFic2VudCBjZWxsXG5cdFx0XHQvLyBjb2xsYXBzZXMgaXRzIHdpZHRoIHRvIDAgKG1hc2sgcmVjZW50ZXJzKSBzbyBpY29ucyBzbGlkZSBpbnRvIHBsYWNlLlxuXHRcdFx0Ly8gICAtIGRpY3RhdGlvbjogc2hvd24gd2hlbiBOT1QgaW4gdm9pY2UgbW9kZSAoaG9tZSBtZW51IC8gZGljdGF0aW5nKVxuXHRcdFx0Ly8gICAtIHZvaWNlOiAgICAgc2hvd24gdW5sZXNzIGRpY3RhdGlvbiBpcyBhY3RpdmVseSByZWNvcmRpbmdcblx0XHRcdC8vICAgLSBsaXN0ZW46ICAgIHNob3duIG9ubHkgaW4gbWFudWFsLWNvbm5lY3RlZCB2b2ljZSBtb2RlXG5cdFx0XHRjb25zdCBkaWN0YXRpb25QcmVzZW50ID0gZGljdGF0aW9uQXZhaWxhYmxlICYmICF2b2ljZU9uO1xuXHRcdFx0Y29uc3Qgdm9pY2VQcmVzZW50ID0gdm9pY2VBdmFpbGFibGUgJiYgIWlzRGljdGF0aW5nICYmICFkaWN0YXRpb25CdXN5O1xuXHRcdFx0Y29uc3QgbGlzdGVuUHJlc2VudCA9IHNob3dMaXN0ZW47XG5cblx0XHRcdC8vIEV4YWN0bHkgb25lIGljb24gXHUyMTkyIHNpbmdsZS1pY29uIHZpZXcgKHRoZSBsb25lIGJ1dHRvbiBmaWxscyB0aGUgd2hvbGUgcGlsbCkuXG5cdFx0XHRjb25zdCBwcmVzZW50Q291bnQgPSAoZGljdGF0aW9uUHJlc2VudCA/IDEgOiAwKSArICh2b2ljZVByZXNlbnQgPyAxIDogMCkgKyAobGlzdGVuUHJlc2VudCA/IDEgOiAwKTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjb25uZWN0ZWQnLCB2b2ljZU9uKTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaW5nbGUnLCBwcmVzZW50Q291bnQgPT09IDEpO1xuXG5cdFx0XHQvLyBEaWN0YXRpb24gY2VsbCBcdTIwMTQgZG93bmxvYWQgYWZmb3JkYW5jZSB3aGlsZSB0aGUgbW9kZWwgcHJlcGFyZXMsIGVsc2UgZmlsbHNcblx0XHRcdC8vIHRoZSBtaWMgd2hpbGUgZGljdGF0aW5nLlxuXHRcdFx0dGhpcy5fZGljdGF0aW9uQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgIWRpY3RhdGlvblByZXNlbnQpO1xuXHRcdFx0dGhpcy5fZGljdGF0aW9uQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNEaWN0YXRpbmcgfHwgZGljdGF0aW9uQnVzeSk7XG5cdFx0XHR0aGlzLl9kaWN0YXRpb25DZWxsIS5jbGFzc0xpc3QudG9nZ2xlKCdwcmVwYXJpbmcnLCBkaWN0YXRpb25CdXN5KTtcblx0XHRcdHRoaXMuX2RpY3RhdGlvbkNlbGwhLnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgU3RyaW5nKGlzRGljdGF0aW5nKSk7XG5cdFx0XHR0aGlzLl9kaWN0YXRpb25DZWxsIS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBkaWN0YXRpb25CdXN5XG5cdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLmRpY3RhdGlvblByZXBhcmluZ0NhbmNlbGFibGUnLCBcIkNhbmNlbCBEaWN0YXRpb24uIHswfVwiLCBnZXREaWN0YXRpb25QcmVwYXJpbmdMYWJlbCh0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlKSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgndm9pY2VJbnB1dE1vZGUuZGljdGF0aW9uJywgXCJEaWN0YXRpb25cIikpO1xuXHRcdFx0Ly8gR2x5cGhzIHJlbmRlciBhdCB0aGUgY29tcGFjdCAxMnB4IHNpemUsIHNvIHVzZSB0aGUgYCpDb21wYWN0YCB2YXJpYW50c1xuXHRcdFx0Ly8gd2hlcmV2ZXIgb25lIGV4aXN0cyAoYG1pY2AgLyBgbWljRmlsbGVkYCBoYXZlIG5vbmUgYW5kIHN0YXkgYXMtaXMpLlxuXHRcdFx0Ly8gV2hpbGUgcHJlcGFyaW5nLCBzaG93IHRoZSBkb3dubG9hZCBnbHlwaCBvbmx5IGR1cmluZyBhbiBhY3R1YWwgb24tZGlza1xuXHRcdFx0Ly8gZG93bmxvYWQgKGNhY2hlIG1pc3MpOyBvdGhlcndpc2UgKGxvYWRpbmcgYSBjYWNoZWQgbW9kZWwpIHNob3cgYVxuXHRcdFx0Ly8gc3Bpbm5lciwgd2hpY2ggdGhlIGAucHJlcGFyaW5nYCBDU1MgYW5pbWF0ZXMuXG5cdFx0XHRjb25zdCBkaWN0YXRpb25JY29uID0gZGljdGF0aW9uQnVzeVxuXHRcdFx0XHQ/IGRpY3RhdGlvbkRvd25sb2FkaW5nLnJlYWQocmVhZGVyKSA/IENvZGljb24ubWljRG93bmxvYWRDb21wYWN0IDogQ29kaWNvbi5sb2FkaW5nQ29tcGFjdFxuXHRcdFx0XHQ6IGlzRGljdGF0aW5nID8gQ29kaWNvbi5taWNGaWxsZWQgOiBDb2RpY29uLm1pYztcblx0XHRcdHRoaXMuX2RpY3RhdGlvbkljb24hLmNsYXNzTmFtZSA9IGBjaGF0LXZvaWNlLWlucHV0LW1vZGUtaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShkaWN0YXRpb25JY29uKX1gO1xuXG5cdFx0XHQvLyBXcmFwIHRoZSBkb3dubG9hZCBnbHlwaCBpbiBhIGRldGVybWluYXRlIHByb2dyZXNzIHJpbmcgZHVyaW5nIGFuXG5cdFx0XHQvLyBhY3R1YWwgb24tZGlzayBkb3dubG9hZCwgbWF0Y2hpbmcgdGhlIHN0YW5kYWxvbmUgdG9vbGJhciBidXR0b24uXG5cdFx0XHQvLyBUaGUgcmluZyBpcyB0b3JuIGRvd24gYXMgc29vbiBhcyB0aGUgZG93bmxvYWQgY29tcGxldGVzIChsb2FkaW5nIGFcblx0XHRcdC8vIGNhY2hlZCBtb2RlbCwgb3Igbm90IHByZXBhcmluZyBhdCBhbGwpLlxuXHRcdFx0aWYgKGRpY3RhdGlvbkJ1c3kgJiYgZGljdGF0aW9uRG93bmxvYWRpbmcucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fZGljdGF0aW9uUmluZy52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2RpY3RhdGlvblJpbmcudmFsdWUgPSBuZXcgRGljdGF0aW9uRG93bmxvYWRSaW5nKHRoaXMuX2RpY3RhdGlvbkNlbGwhLCB0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGljdGF0aW9uUmluZy5jbGVhcigpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBWb2ljZSBjZWxsIFx1MjAxNCBEZXZpY2UgRVEgYmFycyB0aGF0IHRyYW5zZm9ybTpcblx0XHRcdC8vICAgZGlzY29ubmVjdGVkIFx1MjE5MiB0aGluIGdyZXkgYmFycyAoY2xpY2sgdG8gY29ubmVjdClcblx0XHRcdC8vICAgY29ubmVjdGVkL2lkbGUgXHUyMTkyIGRhcmtlciBiYXJzLCBjYWxtIHVuZHVsYXRpbmcgd2F2ZVxuXHRcdFx0Ly8gICBsaXN0ZW5pbmcgXHUyMTkyIEJMVUUgYmFycywgYXVkaW8tcmVhY3RpdmUgdG8gdGhlIHVzZXIncyB2b2ljZVxuXHRcdFx0Ly8gICBzcGVha2luZyBcdTIxOTIgUFVSUExFIGJhcnMsIGF1ZGlvLXJlYWN0aXZlIHRvIHRoZSBhc3Npc3RhbnRcblx0XHRcdC8vICAgaG92ZXItd2hpbGUtY29ubmVjdGVkIFx1MjE5MiBzaG9ydCBldmVuIFwic2lsZW50XCIgYmFycyAocHJldmlld3MgZGlzY29ubmVjdDsgQ1NTKVxuXHRcdFx0dGhpcy5fdm9pY2VDZWxsIS5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQnLCAhdm9pY2VQcmVzZW50KTtcblx0XHRcdHRoaXMuX3ZvaWNlQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgnb24nLCB2b2ljZU9uKTtcblx0XHRcdHRoaXMuX3ZvaWNlQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgnY29ubmVjdGluZycsIGNvbm5lY3RpbmcgJiYgIWNvbm5lY3RlZCk7XG5cdFx0XHR0aGlzLl92b2ljZUNlbGwhLmNsYXNzTGlzdC50b2dnbGUoJ2lkbGUtb24nLCB2b2ljZU9uICYmICF2b2ljZUxpdmUpO1xuXHRcdFx0dGhpcy5fdm9pY2VDZWxsIS5jbGFzc0xpc3QudG9nZ2xlKCdsaXN0ZW5pbmcnLCBsaXN0ZW5pbmcpO1xuXHRcdFx0dGhpcy5fdm9pY2VDZWxsIS5jbGFzc0xpc3QudG9nZ2xlKCdzcGVha2luZycsIHNwZWFraW5nKTtcblx0XHRcdHRoaXMuX3ZvaWNlQ2VsbCEuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBTdHJpbmcodm9pY2VPbikpO1xuXHRcdFx0Ly8gU2ltdWxhdGVkIGhvdmVyICh3YWxrdGhyb3VnaCBvbmx5KSBtaXJyb3JzIHRoZSByZWFsIDpob3ZlciBkaXNjb25uZWN0IHByZXZpZXcuXG5cdFx0XHR0aGlzLl92b2ljZUNlbGwhLmNsYXNzTGlzdC50b2dnbGUoJ3NpbS1ob3ZlcicsIHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZEhvdmVyLnJlYWQocmVhZGVyKSk7XG5cblx0XHRcdC8vIExpc3RlbiAvIHN0b3Atc3BlYWtpbmcgdG9nZ2xlOiBtaWMgdG8gc3RhcnQsIHN0b3AgdG8gZW5kLlxuXHRcdFx0dGhpcy5fbGlzdGVuQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgIWxpc3RlblByZXNlbnQpO1xuXHRcdFx0dGhpcy5fbGlzdGVuQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgbGlzdGVuaW5nKTtcblx0XHRcdHRoaXMuX2xpc3RlbkNlbGwhLmNsYXNzTGlzdC50b2dnbGUoJ211dGVkJywgIWxpc3RlbmluZyk7XG5cdFx0XHR0aGlzLl9saXN0ZW5DZWxsIS5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyhsaXN0ZW5pbmcpKTtcblx0XHRcdHRoaXMuX2xpc3Rlbkljb24hLmNsYXNzTmFtZSA9IGBjaGF0LXZvaWNlLWlucHV0LW1vZGUtaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShsaXN0ZW5pbmcgPyBDb2RpY29uLnBlcnNvblZvaWNlRmlsbGVkQ29tcGFjdCA6IENvZGljb24ucGVyc29uVm9pY2VDb21wYWN0KX1gO1xuXHRcdFx0dGhpcy5fdXBkYXRlQXJpYUxhYmVscygpO1xuXG5cdFx0XHQvLyBBdWRpby1yZWFjdGl2ZSBiYXJzIG9ubHkgd2hpbGUgbGl2ZSAoYW5kIG5vdCBob3ZlcmluZyB0aGUgZGlzY29ubmVjdCBwcmV2aWV3KS5cblx0XHRcdHRoaXMuX3N5bmNCYXJBbmltYXRpb24oKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2U6ICgpID0+IHRoaXMuX3N0b3BCYXJBbmltYXRpb24oKSB9KTtcblx0XHQvLyBSZS1zeW5jIGlmIHRoZSByZWR1Y2VkLW1vdGlvbiBwcmVmZXJlbmNlIGNoYW5nZXMgd2hpbGUgdGhlIHZvaWNlIGNlbGwgaXMgbGl2ZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVkdWNlZE1vdGlvbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdG9wQmFyQW5pbWF0aW9uKCk7XG5cdFx0XHR0aGlzLl9zeW5jQmFyQW5pbWF0aW9uKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIFN0YXJ0IG9yIHN0b3AgdGhlIGF1ZGlvLXJlYWN0aXZlIGJhciBsb29wIGJhc2VkIG9uIGxpdmUgKyBob3ZlciBzdGF0ZS4gKi9cblx0cHJpdmF0ZSBfc3luY0JhckFuaW1hdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdm9pY2VMaXZlICYmICF0aGlzLl92b2ljZUhvdmVyaW5nKSB7XG5cdFx0XHR0aGlzLl9zdGFydEJhckFuaW1hdGlvbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdG9wQmFyQW5pbWF0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFuaW1hdGUgdGhlIHdhdmVmb3JtIGJhcnMgZnJvbSBsaXZlIGF1ZGlvLiBVc2VzIHRoZSBtaWMgYW5hbHlzZXIgd2hpbGUgbGlzdGVuaW5nXG5cdCAqIGFuZCB0aGUgVFRTIGFuYWx5c2VyIHdoaWxlIHRoZSBhc3Npc3RhbnQgc3BlYWtzLiBXaGVuIG5vIGFuYWx5c2VyIGlzIGF2YWlsYWJsZVxuXHQgKiAoZS5nLiByZWR1Y2VkIG1vdGlvbiBvciBwcmUtY2FwdHVyZSksIHRoZSBDU1Mga2V5ZnJhbWUgZmFsbGJhY2sgZHJpdmVzIHRoZSBiYXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRCYXJBbmltYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUmVzcGVjdCByZWR1Y2VkLW1vdGlvbjogc2tpcCBib3RoIHRoZSByQUYgYXVkaW8tcmVhY3RpdmUgbG9vcCBhbmQgdGhlIENTU1xuXHRcdC8vIGtleWZyYW1lIGZhbGxiYWNrLCByZW5kZXJpbmcgdGhlIGJhcnMgYXQgYSBmbGF0IHN0YXRpYyBoZWlnaHQgaW5zdGVhZC5cblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBiYXIgb2YgdGhpcy5fdm9pY2VCYXJFbHMpIHtcblx0XHRcdFx0YmFyLnN0eWxlLmFuaW1hdGlvbiA9ICdub25lJztcblx0XHRcdFx0YmFyLnN0eWxlLmhlaWdodCA9IGAke1dBVkVGT1JNX0JBUl9NSU5fSEVJR0hUfXB4YDtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgd2luID0gZ2V0V2luZG93KHRoaXMuX3ZvaWNlQ2VsbCk7XG5cdFx0Y29uc3QgdGljayA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lID0gd2luLnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTtcblx0XHRcdC8vIFJlYWQgdGhlIGxpdmUgc3RhdGUgZWFjaCBmcmFtZSBzbyBsaXN0ZW5pbmc8LT5zcGVha2luZyBwaWNrcyB0aGUgcmlnaHQgYW5hbHlzZXIuXG5cdFx0XHRjb25zdCBhbmFseXNlciA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci52b2ljZVN0YXRlLmdldCgpID09PSAnc3BlYWtpbmcnXG5cdFx0XHRcdD8gdGhpcy50dHNQbGF5YmFja1NlcnZpY2UuYW5hbHlzZXJOb2RlXG5cdFx0XHRcdDogdGhpcy5taWNDYXB0dXJlU2VydmljZS5hbmFseXNlck5vZGU7XG5cdFx0XHRpZiAoIWFuYWx5c2VyKSB7XG5cdFx0XHRcdC8vIExldCB0aGUgQ1NTIGtleWZyYW1lIGFuaW1hdGlvbiB0YWtlIG92ZXIuXG5cdFx0XHRcdGZvciAoY29uc3QgYmFyIG9mIHRoaXMuX3ZvaWNlQmFyRWxzKSB7XG5cdFx0XHRcdFx0YmFyLnN0eWxlLnJlbW92ZVByb3BlcnR5KCdoZWlnaHQnKTtcblx0XHRcdFx0XHRiYXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJ2FuaW1hdGlvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fYmFyRGF0YSB8fCB0aGlzLl9iYXJEYXRhLmxlbmd0aCAhPT0gYW5hbHlzZXIuZnJlcXVlbmN5QmluQ291bnQpIHtcblx0XHRcdFx0dGhpcy5fYmFyRGF0YSA9IG5ldyBVaW50OEFycmF5KGFuYWx5c2VyLmZyZXF1ZW5jeUJpbkNvdW50KTtcblx0XHRcdH1cblx0XHRcdGFuYWx5c2VyLmdldEJ5dGVGcmVxdWVuY3lEYXRhKHRoaXMuX2JhckRhdGEgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj4pO1xuXHRcdFx0Y29uc3QgYmlucyA9IHRoaXMuX2JhckRhdGEubGVuZ3RoO1xuXHRcdFx0Y29uc3Qgc3RlcCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IoYmlucyAvIHRoaXMuX3ZvaWNlQmFyRWxzLmxlbmd0aCkpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl92b2ljZUJhckVscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRsZXQgc3VtID0gMDtcblx0XHRcdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBzdGVwOyBqKyspIHtcblx0XHRcdFx0XHRzdW0gKz0gdGhpcy5fYmFyRGF0YVtNYXRoLm1pbihiaW5zIC0gMSwgaSAqIHN0ZXAgKyBqKV07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaW50ZW5zaXR5ID0gTWF0aC5taW4oMSwgKHN1bSAvIHN0ZXApIC8gMTgwKTtcblx0XHRcdFx0Y29uc3QgaGVpZ2h0UHggPSBXQVZFRk9STV9CQVJfTUlOX0hFSUdIVCArIGludGVuc2l0eSAqIChXQVZFRk9STV9CQVJfTUFYX0hFSUdIVCAtIFdBVkVGT1JNX0JBUl9NSU5fSEVJR0hUKTtcblx0XHRcdFx0Ly8gRGlzYWJsZSB0aGUgQ1NTIGtleWZyYW1lIGZhbGxiYWNrIHdoaWxlIHdlIGRyaXZlIGhlaWdodHMgZnJvbSBsaXZlIGF1ZGlvLlxuXHRcdFx0XHR0aGlzLl92b2ljZUJhckVsc1tpXS5zdHlsZS5hbmltYXRpb24gPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX3ZvaWNlQmFyRWxzW2ldLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodFB4fXB4YDtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lID0gd2luLnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3BCYXJBbmltYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fdm9pY2VDZWxsKSB7XG5cdFx0XHRnZXRXaW5kb3codGhpcy5fdm9pY2VDZWxsKS5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLl9iYXJBbmltYXRpb25GcmFtZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lID0gdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgYmFyIG9mIHRoaXMuX3ZvaWNlQmFyRWxzKSB7XG5cdFx0XHRiYXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJ2hlaWdodCcpO1xuXHRcdFx0YmFyLnN0eWxlLnJlbW92ZVByb3BlcnR5KCdhbmltYXRpb24nKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVG9nZ2xlIGJ1aWx0LWluIG9uLWRldmljZSBkaWN0YXRpb24uIEJ5IGRlZmF1bHQgdGhpcyBydW5zIHRoZSBzaGFyZWRcblx0ICoge0BsaW5rIERJQ1RBVElPTl9UT0dHTEVfQ09NTUFORF9JRH0gY29tbWFuZCAod2hpY2ggdGFyZ2V0cyB0aGUgbGFzdCBmb2N1c2VkXG5cdCAqIGNoYXQgd2lkZ2V0KTsgYSBob3N0IHRoYXQgaXNuJ3QgYW4gYElDaGF0V2lkZ2V0YCAoZS5nLiB0aGUgYWdlbnRzLXdpbmRvd1xuXHQgKiBjb21wb3NlcikgY2FuIGluamVjdCBpdHMgb3duIHRvZ2dsZSB2aWEge0BsaW5rIElWb2ljZUlucHV0TW9kZVBpbGxPcHRpb25zfS5cblx0ICovXG5cdHByaXZhdGUgX3RvZ2dsZURpY3RhdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fb3B0aW9ucz8udG9nZ2xlRGljdGF0aW9uKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLnRvZ2dsZURpY3RhdGlvbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKERJQ1RBVElPTl9UT0dHTEVfQ09NTUFORF9JRCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFjdGl2YXRlIGEgc2VnbWVudGVkIGNlbGwgZnJvbSB0aGUga2V5Ym9hcmQuIFRoZSBjZWxscyBsaXZlIGluc2lkZSBhIHRvb2xiYXInc1xuXHQgKiBgQWN0aW9uQmFyYCwgd2hvc2Uga2V5IGhhbmRsZXIgcnVucyB0aGUgKG5vLW9wKSBwbGFjZWhvbGRlciBhY3Rpb24gb24gRW50ZXIvU3BhY2Vcblx0ICogYW5kIGNhbGxzIGBwcmV2ZW50RGVmYXVsdGAvYHN0b3BQcm9wYWdhdGlvbmAsIHdoaWNoIHdvdWxkIG90aGVyd2lzZSBzd2FsbG93IHRoZVxuXHQgKiBuYXRpdmUgYnV0dG9uIGFjdGl2YXRpb24uIEhhbmRsZSBFbnRlci9TcGFjZSBoZXJlIGFuZCBzdG9wIHRoZSBldmVudCBiZWZvcmUgaXRcblx0ICogYnViYmxlcyB0byB0aGUgQWN0aW9uQmFyIHNvIHRoZSBmb2N1c2VkIGNlbGwncyBvd24gZ2VzdHVyZSBydW5zLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBY3RpdmF0aW9uS2V5cyhjZWxsOiBIVE1MRWxlbWVudCwgaGFuZGxlcjogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihjZWxsLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBlLmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihjZWxsLCBkb20uRXZlbnRUeXBlLktFWV9VUCwgZSA9PiB7XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZS5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRoYW5kbGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25DbGlja0RpY3RhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5zZXRTZWxlY3RlZE1vZGUoJ2RpY3RhdGlvbicpO1xuXG5cdFx0Ly8gTXV0dWFsIGV4Y2x1c2lvbjogc3RvcCBsaXZlIFZvaWNlIE1vZGUgYmVmb3JlIHN0YXJ0aW5nIGRpY3RhdGlvbi5cblx0XHRpZiAodGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpIHx8IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcuZ2V0KCkpIHtcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5kaXNjb25uZWN0KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdG9nZ2xlRGljdGF0aW9uKCk7XG5cdH1cblxuXHQvKiogVGhlIHZvaWNlIGJ1dHRvbiBjb25uZWN0cyBvciBkaXNjb25uZWN0czsgaGFuZHMtZnJlZSBtb2RlIHN0YXJ0cyBsaXN0ZW5pbmcgYWZ0ZXIgY29ubmVjdC4gKi9cblx0cHJpdmF0ZSBhc3luYyBfb25DbGlja1ZvaWNlUG93ZXJUb2dnbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2Uuc2V0U2VsZWN0ZWRNb2RlKCd2b2ljZScpO1xuXG5cdFx0Ly8gTXV0dWFsIGV4Y2x1c2lvbjogc3RvcCBkaWN0YXRpb24gYmVmb3JlIGVudGVyaW5nIFZvaWNlIE1vZGUuXG5cdFx0aWYgKHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2Uuc3RhdGUgIT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5JZGxlKSB7XG5cdFx0XHR0aGlzLl90b2dnbGVEaWN0YXRpb24oKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyO1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvdyh0aGlzLl92b2ljZUNlbGwpO1xuXHRcdGlmIChjb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpIHx8IGNvbnRyb2xsZXIuaXNDb25uZWN0aW5nLmdldCgpKSB7XG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucz8uaXNWb2ljZUFjdGl2ZT8uZ2V0KCkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9vcHRpb25zLmFjdGl2YXRlVm9pY2VNb2RlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fb3B0aW9ucy5hY3RpdmF0ZVZvaWNlTW9kZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHJldGFyZ2V0Vm9pY2VUb0N1cnJlbnRTZXNzaW9uKHRoaXMuY29tbWFuZFNlcnZpY2UsIGNvbnRyb2xsZXIsIHRhcmdldFdpbmRvdyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29udHJvbGxlci5kaXNjb25uZWN0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9vcHRpb25zPy5hY3RpdmF0ZVZvaWNlTW9kZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9vcHRpb25zLmFjdGl2YXRlVm9pY2VNb2RlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCByZXRhcmdldFZvaWNlVG9DdXJyZW50U2Vzc2lvbih0aGlzLmNvbW1hbmRTZXJ2aWNlLCBjb250cm9sbGVyLCB0YXJnZXRXaW5kb3cpO1xuXHRcdFx0fVxuXHRcdFx0Y29udHJvbGxlci5jb25uZWN0KHRhcmdldFdpbmRvdykuY2F0Y2goKCkgPT4geyAvKiBjb25uZWN0IGZhaWx1cmVzIGFyZSBzdXJmYWNlZC9sb2dnZWQgYnkgdGhlIGNvbnRyb2xsZXIgKi8gfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFRhcCB0aGUgbGlzdGVuIGNlbGwgdG8gdG9nZ2xlIGxpc3RlbmluZyBvbiBhbmQgb2ZmLiAqL1xuXHRwcml2YXRlIF9vbkNsaWNrTGlzdGVuKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI7XG5cdFx0aWYgKCFjb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChjb250cm9sbGVyLnZvaWNlU3RhdGUuZ2V0KCkgPT09ICdsaXN0ZW5pbmcnKSB7XG5cdFx0XHRjb250cm9sbGVyLnN0b3BMaXN0ZW5pbmcoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udHJvbGxlci5wdHREb3duKCk7XG5cdFx0XHRjb250cm9sbGVyLnB0dFVwKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFRocmVzaG9sZCAobXMpIHNlcGFyYXRpbmcgYSBxdWljayB0YXAgKHRvZ2dsZSkgZnJvbSBhIHByZXNzLWFuZC1ob2xkICh0YWxrKS4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSE9MRF9USFJFU0hPTERfTVMgPSAxODA7XG5cblx0cHJpdmF0ZSBfb25MaXN0ZW5Qb2ludGVyRG93bigpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyO1xuXHRcdC8vIEhvbGQtdG8tdGFsayBvbmx5IGFwcGxpZXMgdG8gYSBjb25uZWN0ZWQsIG5vbi1saXN0ZW5pbmcgc2Vzc2lvbjsgb3RoZXJ3aXNlIGxldFxuXHRcdC8vIHRoZSB0cmFpbGluZyBjbGljayBkcml2ZSB0aGUgcGxhaW4gdG9nZ2xlLlxuXHRcdGlmICghY29udHJvbGxlci5pc0Nvbm5lY3RlZC5nZXQoKSB8fCBjb250cm9sbGVyLnZvaWNlU3RhdGUuZ2V0KCkgPT09ICdsaXN0ZW5pbmcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xpc3RlbkhvbGRHZXN0dXJlID0gdHJ1ZTtcblx0XHR0aGlzLl9saXN0ZW5Ib2xkTGlzdGVuaW5nID0gZmFsc2U7XG5cdFx0Ly8gRnJlc2ggZ2VzdHVyZTogY2xlYXIgYW55IHN1cHByZXNzaW9uIGxlZnQgb3ZlciBmcm9tIGEgcHJpb3IgaG9sZCB3aG9zZSByZWxlYXNlXG5cdFx0Ly8gbGFuZGVkIG9mZi1idXR0b24gKGFuZCB0aGVyZWZvcmUgcHJvZHVjZWQgbm8gdHJhaWxpbmcgY2xpY2sgdG8gY29uc3VtZSBpdCkuXG5cdFx0dGhpcy5fbGlzdGVuU3VwcHJlc3NDbGljayA9IGZhbHNlO1xuXHRcdGNvbnN0IHdpbiA9IGdldFdpbmRvdyh0aGlzLl9saXN0ZW5DZWxsKTtcblx0XHQvLyBTdGFydCBsaXN0ZW5pbmcgb25seSBhZnRlciB0aGUgaG9sZCB0aHJlc2hvbGQsIHNvIGEgcXVpY2sgdGFwICh0b2dnbGUpIGRvZXMgbm90XG5cdFx0Ly8gYnJpZWZseSBmbGFzaCB0aGUgbGlzdGVuaW5nIHN0YXRlLlxuXHRcdHRoaXMuX2xpc3RlbkhvbGRUaW1lciA9IHdpbi5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2xpc3RlbkhvbGRUaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3RlbkhvbGRMaXN0ZW5pbmcgPSB0cnVlO1xuXHRcdFx0XHRjb250cm9sbGVyLnB0dERvd24oJ2V4cGxpY2l0JywgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSwgVm9pY2VJbnB1dE1vZGVBY3Rpb25WaWV3SXRlbS5IT0xEX1RIUkVTSE9MRF9NUyk7XG5cdFx0Ly8gRW5kIHRoZSBnZXN0dXJlIG9uIHJlbGVhc2UgYW55d2hlcmUgKGluIGNhc2UgdGhlIHBvaW50ZXIgbGVhdmVzIHRoZSBidXR0b24pLlxuXHRcdC8vIEdlbmVyaWMgcG9pbnRlci1hd2FyZSBsaXN0ZW5lciBzbyBhbiBpT1MgcG9pbnRlciBob2xkIGFsc28gZmluaXNoZXMgYW5kIHNlbmRzLlxuXHRcdHRoaXMuX2xpc3RlblBvaW50ZXJVcC52YWx1ZSA9IGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlVXBMaXN0ZW5lcih3aW4sIChlOiBNb3VzZUV2ZW50KSA9PiB0aGlzLl9lbmRMaXN0ZW5Qb2ludGVySG9sZChlKSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmRMaXN0ZW5Qb2ludGVySG9sZChlPzogTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbGlzdGVuSG9sZEdlc3R1cmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGlzdGVuSG9sZEdlc3R1cmUgPSBmYWxzZTtcblx0XHR0aGlzLl9saXN0ZW5Qb2ludGVyVXAuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5fbGlzdGVuSG9sZFRpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFJlbGVhc2VkIGJlZm9yZSB0aGUgdGhyZXNob2xkIFx1MjE5MiBhIHRhcDsgbGV0IHRoZSB0cmFpbGluZyBjbGljayB0b2dnbGUgbGlzdGVuaW5nLlxuXHRcdFx0Z2V0V2luZG93KHRoaXMuX2xpc3RlbkNlbGwpLmNsZWFyVGltZW91dCh0aGlzLl9saXN0ZW5Ib2xkVGltZXIpO1xuXHRcdFx0dGhpcy5fbGlzdGVuSG9sZFRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fbGlzdGVuU3VwcHJlc3NDbGljayA9IGZhbHNlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fbGlzdGVuSG9sZExpc3RlbmluZykge1xuXHRcdFx0Ly8gSGVsZCBwYXN0IHRoZSB0aHJlc2hvbGQgXHUyMTkyIGVuZCB0aGUgdHVybiBhbmQgc2VuZC4gQSB0cmFpbGluZyBgY2xpY2tgIG9ubHkgZmlyZXNcblx0XHRcdC8vIHdoZW4gdGhlIHJlbGVhc2UgbGFuZHMgb24gdGhlIGJ1dHRvbiwgc28gb25seSBhcm0gc3VwcHJlc3Npb24gaW4gdGhhdCBjYXNlIFx1MjAxNFxuXHRcdFx0Ly8gb3RoZXJ3aXNlIGEgc3RhbGUgZmxhZyB3b3VsZCBzd2FsbG93IHRoZSBuZXh0IChlLmcuIGtleWJvYXJkKSBhY3RpdmF0aW9uLlxuXHRcdFx0dGhpcy5fbGlzdGVuSG9sZExpc3RlbmluZyA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVsZWFzZWRPbkNlbGwgPSAhIWU/LnRhcmdldCAmJiB0aGlzLl9saXN0ZW5DZWxsIS5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKTtcblx0XHRcdHRoaXMuX2xpc3RlblN1cHByZXNzQ2xpY2sgPSByZWxlYXNlZE9uQ2VsbDtcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5wdHRVcCgnZXhwbGljaXQnLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIElmIGRpc3Bvc2VkIG1pZC1ob2xkICh3aWRnZXQgY2xvc2VkL3JlcmVuZGVyZWQpLCBmaW5hbGl6ZSB0aGUgZ2VzdHVyZSBzbyB0aGVcblx0XHQvLyBjb250cm9sbGVyIGRvZXMgbm90IGtlZXAgcmVjb3JkaW5nIHVudGlsIGl0cyBtYXgtZHVyYXRpb24gdGltZW91dC5cblx0XHRpZiAodGhpcy5fbGlzdGVuSG9sZEdlc3R1cmUgfHwgdGhpcy5fbGlzdGVuSG9sZFRpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2VuZExpc3RlblBvaW50ZXJIb2xkKCk7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNWb2ljZUlucHV0TW9kZUF2YWlsYWJsZSh2b2ljZUlucHV0TW9kZVNlcnZpY2U6IElWb2ljZUlucHV0TW9kZVNlcnZpY2UpOiBWb2ljZUlucHV0TW9kZSB8ICdib3RoJyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGRpY3RhdGlvbiA9IHZvaWNlSW5wdXRNb2RlU2VydmljZS5kaWN0YXRpb25BdmFpbGFibGUuZ2V0KCk7XG5cdGNvbnN0IHZvaWNlID0gdm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnZvaWNlQXZhaWxhYmxlLmdldCgpO1xuXHRpZiAoZGljdGF0aW9uICYmIHZvaWNlKSB7XG5cdFx0cmV0dXJuICdib3RoJztcblx0fVxuXHRpZiAoZGljdGF0aW9uKSB7XG5cdFx0cmV0dXJuICdkaWN0YXRpb24nO1xuXHR9XG5cdGlmICh2b2ljZSkge1xuXHRcdHJldHVybiAndm9pY2UnO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixPQUFPO0FBQ1AsT0FBTztBQUNQLFNBQVMsaUJBQWlCLGlCQUFpQjtBQUMzQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFzQiwyQkFBMkI7QUFDMUQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCLDBCQUEwQixrQ0FBa0M7QUFDNUYsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUIsa0NBQWtDLGtDQUFrQztBQUNwRyxTQUFTLDBCQUEwQixnQ0FBZ0M7QUFDbkUsU0FBUyxpQ0FBaUMsZ0NBQWdDLHNDQUFzQztBQUNoSCxTQUFTLDhCQUE0RjtBQUNyRyxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLDRCQUE0QjtBQUdyQyxNQUFNLDhCQUE4QjtBQU9wQyxNQUFNLHlCQUF5QjtBQUUvQixlQUFlLDhCQUE4QixnQkFBaUMsWUFBcUMsUUFBc0Q7QUFDeEssUUFBTSxpQkFBaUIsTUFBTSxlQUFlLGVBQW1DLCtCQUErQjtBQUM5RyxNQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSTtBQUNILFVBQU0sV0FBVyxJQUFJLE1BQU0sY0FBYztBQUN6QyxRQUFJLFNBQVMsV0FBVyxrQkFBa0I7QUFDekMsaUJBQVcsd0JBQXdCLE1BQU07QUFBQSxJQUMxQyxPQUFPO0FBQ04saUJBQVcsMEJBQTBCLFVBQVUsTUFBTTtBQUFBLElBQ3REO0FBQ0EsV0FBTztBQUFBLEVBQ1IsUUFBUTtBQUNQLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFHQSxNQUFNLHFCQUFxQjtBQVEzQixNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLDBCQUEwQjtBQU16QixNQUFNLDRCQUFOLE1BQU0sa0NBQWlDLFFBQVE7QUFBQSxFQUlyRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSwwQkFBeUI7QUFBQSxNQUM3QixPQUFPLFVBQVUsa0JBQWtCLGtCQUFrQjtBQUFBLE1BQ3JELE1BQU0sUUFBUTtBQUFBLE1BQ2QsY0FBYztBQUFBLE1BQ2QsTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxNQUFNLGVBQWU7QUFBQSxVQUNwQjtBQUFBLFVBQ0EsZ0JBQWdCLFNBQVMsVUFBVSxrQkFBa0IsSUFBSTtBQUFBLFVBQ3pELGdCQUFnQixpQkFBaUIsT0FBTztBQUFBLFFBQ3pDO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksV0FBbUM7QUFBQSxFQUV2QztBQUNEO0FBMUJhLDBCQUVJLEtBQUs7QUFGZixJQUFNLDJCQUFOO0FBa0NBLE1BQU0sd0NBQU4sTUFBTSw4Q0FBNkMsUUFBUTtBQUFBLEVBTWpFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJLHNDQUFxQztBQUFBLE1BQ3pDLE9BQU8sVUFBVSw2QkFBNkIsMEJBQTBCO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFJeEUsSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLE1BQ2QsWUFBWTtBQUFBLFFBQ1gsUUFBUSxpQkFBaUI7QUFBQSxRQUN6QixTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLFFBQ2pELE1BQU0sZUFBZTtBQUFBLFVBQ3BCO0FBQUEsVUFDQSxnQkFBZ0I7QUFBQSxRQUNqQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFuQkYsU0FBUSxjQUFjO0FBQUEsRUFvQnRCO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFFcEQsUUFBSSxLQUFLLGFBQWE7QUFDckI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxhQUFhLFNBQVMsSUFBSSx1QkFBdUI7QUFDdkQsVUFBTSxvQkFBb0IsU0FBUyxJQUFJLGtCQUFrQjtBQUl6RCxVQUFNLGVBQWUsU0FBUyxJQUFJLHdCQUF3QjtBQUMxRCxRQUFJLGFBQWEsVUFBVSxzQkFBc0IsTUFBTTtBQUN0RCxtQkFBYSxPQUFPO0FBQUEsSUFDckI7QUFHQSxVQUFNLFdBQVcsa0JBQWtCLHlCQUF5QixzQ0FBcUMsRUFBRTtBQUVuRyxVQUFNLE1BQU0sZ0JBQWdCO0FBQzVCLFFBQUksY0FBYztBQUNsQixVQUFNLGtCQUFrQixJQUFJLHNCQUFzQixLQUFLLElBQUksVUFBVSxRQUFRLE1BQU07QUFDbEYsb0JBQWM7QUFBQSxJQUNmLENBQUM7QUFFRCxTQUFLLGNBQWM7QUFDbkIsUUFBSTtBQUNILFVBQUksQ0FBQyxXQUFXLG1DQUFtQyxHQUFHLEdBQUc7QUFDeEQsY0FBTSw4QkFBOEIsU0FBUyxJQUFJLGVBQWUsR0FBRyxZQUFZLEdBQUc7QUFBQSxNQUNuRjtBQUVBLFVBQUksQ0FBQyxXQUFXLFlBQVksSUFBSSxLQUFLLENBQUMsV0FBVyxhQUFhLElBQUksR0FBRztBQUNwRSxjQUFNLFdBQVcsUUFBUSxHQUFHO0FBQUEsTUFDN0I7QUFDQSxVQUFJLGFBQWE7QUFJaEI7QUFBQSxNQUNEO0FBQ0EsVUFBSSxXQUFXLFlBQVksSUFBSSxHQUFHO0FBQ2pDLG1CQUFXLFFBQVEsWUFBWSxJQUFJO0FBQ25DLFlBQUksVUFBVTtBQUNiLGdCQUFNO0FBQUEsUUFDUCxXQUFXLENBQUMsYUFBYTtBQUN4QixnQkFBTSxJQUFJLFFBQWMsYUFBVztBQUNsQyxrQkFBTSxJQUFJLElBQUksc0JBQXNCLEtBQUssSUFBSSxVQUFVLFFBQVEsTUFBTTtBQUNwRSxnQkFBRSxRQUFRO0FBQ1Ysc0JBQVE7QUFBQSxZQUNULENBQUM7QUFBQSxVQUNGLENBQUM7QUFBQSxRQUNGO0FBQ0EsbUJBQVcsTUFBTSxZQUFZLElBQUk7QUFBQSxNQUNsQztBQUFBLElBQ0QsVUFBRTtBQUNELHNCQUFnQixRQUFRO0FBQ3hCLFdBQUssY0FBYztBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUNEO0FBcEZhLHNDQUVJLEtBQUs7QUFGZixJQUFNLHVDQUFOO0FBMEZQLE1BQU0sa0JBQXNIO0FBQUEsRUFDM0gsRUFBRSxJQUFJLE9BQU8sT0FBTyxzQkFBc0IsT0FBTyxNQUFNO0FBQUEsRUFDdkQsRUFBRSxJQUFJLGNBQWMsT0FBTyxjQUFjLE9BQU8sYUFBYTtBQUFBLEVBQzdELEVBQUUsSUFBSSxRQUFRLE9BQU8sb0JBQW9CLE9BQU8sT0FBTztBQUFBLEVBQ3ZELEVBQUUsSUFBSSxhQUFhLE9BQU8sYUFBYSxPQUFPLFlBQVk7QUFBQSxFQUMxRCxFQUFFLElBQUksWUFBWSxPQUFPLFlBQVksT0FBTyxXQUFXO0FBQUEsRUFDdkQsRUFBRSxJQUFJLGFBQWEsT0FBTyxhQUFhLE9BQU8sWUFBWTtBQUMzRDtBQUVPLFNBQVMsd0NBQThDO0FBSTdELFFBQU0sV0FBb0Y7QUFBQSxJQUN6RixFQUFFLFNBQVMsYUFBYSxPQUFPLHFDQUFxQztBQUFBLElBQ3BFLEVBQUUsU0FBUyxnQkFBZ0IsT0FBTyxrREFBa0Q7QUFBQSxJQUNwRixFQUFFLFNBQVMsY0FBYyxPQUFPLGdDQUFnQztBQUFBLElBQ2hFLEVBQUUsU0FBUyxlQUFlLE9BQU8sNkNBQTZDO0FBQUEsRUFDL0U7QUFDQSxhQUFXLEVBQUUsU0FBUyxNQUFNLEtBQUssVUFBVTtBQUMxQyxvQkFBZ0IsY0FBYyxRQUFRO0FBQUEsTUFDckMsY0FBYztBQUNiLGNBQU07QUFBQSxVQUNMLElBQUksNkRBQTZELE9BQU87QUFBQSxVQUN4RSxPQUFPLEVBQUUsT0FBTyxrREFBa0QsS0FBSyxJQUFJLFVBQVUsa0RBQWtELEtBQUssR0FBRztBQUFBLFVBQy9JLFVBQVUsRUFBRSxPQUFPLGFBQWEsVUFBVSxZQUFZO0FBQUEsVUFDdEQsY0FBYztBQUFBLFVBQ2QsSUFBSTtBQUFBLFFBQ0wsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLElBQUksVUFBa0M7QUFDckMsaUJBQVMsSUFBSSxzQkFBc0IsRUFBRSwyQkFBMkIsT0FBTztBQUFBLE1BQ3hFO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUdBLGtCQUFnQixjQUFjLFFBQVE7QUFBQSxJQUNyQyxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxFQUFFLE9BQU8saURBQWlELFVBQVUsZ0RBQWdEO0FBQUEsUUFDM0gsVUFBVSxFQUFFLE9BQU8sYUFBYSxVQUFVLFlBQVk7QUFBQSxRQUN0RCxjQUFjO0FBQUEsUUFDZCxJQUFJO0FBQUEsTUFDTCxDQUFDO0FBQUEsSUFDRjtBQUFBLElBQ0EsSUFBSSxVQUFrQztBQUNyQyxlQUFTLElBQUksc0JBQXNCLEVBQUUsMEJBQTBCO0FBQUEsSUFDaEU7QUFBQSxFQUNELENBQUM7QUFHRCxrQkFBZ0IsY0FBYyxRQUFRO0FBQUEsSUFDckMsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sRUFBRSxPQUFPLDJDQUEyQyxVQUFVLDBDQUEwQztBQUFBLFFBQy9HLFVBQVUsRUFBRSxPQUFPLGFBQWEsVUFBVSxZQUFZO0FBQUEsUUFDdEQsY0FBYztBQUFBLFFBQ2QsSUFBSTtBQUFBLE1BQ0wsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUNBLElBQUksVUFBa0M7QUFDckMsZUFBUyxJQUFJLHNCQUFzQixFQUFFLGdCQUFnQjtBQUFBLElBQ3REO0FBQUEsRUFDRCxDQUFDO0FBRUQsYUFBVyxFQUFFLElBQUksT0FBTyxNQUFNLEtBQUssaUJBQWlCO0FBQ25ELG9CQUFnQixjQUFjLFFBQVE7QUFBQSxNQUNyQyxjQUFjO0FBQ2IsY0FBTTtBQUFBLFVBQ0wsSUFBSSxpREFBaUQsRUFBRTtBQUFBO0FBQUEsVUFFdkQsT0FBTyxFQUFFLE9BQU8scUNBQXFDLEtBQUssSUFBSSxVQUFVLHFDQUFxQyxLQUFLLEdBQUc7QUFBQSxVQUNySCxVQUFVLEVBQUUsT0FBTyxhQUFhLFVBQVUsWUFBWTtBQUFBLFVBQ3RELGNBQWM7QUFBQSxVQUNkLElBQUk7QUFBQSxRQUNMLENBQUM7QUFBQSxNQUNGO0FBQUEsTUFDQSxJQUFJLFVBQWtDO0FBQ3JDLGlCQUFTLElBQUksc0JBQXNCLEVBQUUsdUJBQXVCLEtBQUs7QUFBQSxNQUNsRTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXdCTyxJQUFNLCtCQUFOLGNBQTJDLG1CQUFtQjtBQUFBLEVBMkNwRSxZQUNDLFFBQ2lCLFVBQ3dCLHVCQUNDLHdCQUNSLGdCQUNNLHNCQUNILG1CQUNDLG9CQUNOLGNBQ0ssbUJBQ0Msb0JBQ0sseUJBQ0gsc0JBQ1IsY0FDL0I7QUFDRCxVQUFNLFFBQVcsTUFBTTtBQWROO0FBQ3dCO0FBQ0M7QUFDUjtBQUNNO0FBQ0g7QUFDQztBQUNOO0FBQ0s7QUFDQztBQUNLO0FBQ0g7QUFDUjtBQWhEakMsU0FBUSxlQUE4QixDQUFDO0FBRXZDLFNBQVEsaUJBQWlCO0FBQ3pCLFNBQVEsYUFBYTtBQUtyQixTQUFRLHVCQUF1QjtBQUMvQixTQUFRLHFCQUFxQjtBQUM3QixTQUFRLHVCQUF1QjtBQUMvQixTQUFpQixtQkFBbUIsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFHMUU7QUFBQTtBQUFBLFNBQWlCLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxrQkFBeUMsQ0FBQztBQUFBLEVBcUMvRjtBQUFBLEVBbkNRLHdCQUF3QixPQUFlLFdBQTJCO0FBQ3pFLFdBQU8sS0FBSyxrQkFBa0IsaUJBQWlCLE9BQU8sU0FBUztBQUFBLEVBQ2hFO0FBQUEsRUFFUSxvQkFBMEI7QUFDakMsU0FBSyxnQkFBZ0IsYUFBYSxjQUFjLEtBQUssZUFBZSxVQUFVLFNBQVMsV0FBVyxJQUMvRixTQUFTLHFDQUFxQyxzQ0FBaUMsSUFDL0UsS0FBSyx3QkFBd0IsU0FBUyw0QkFBNEIsV0FBVyxHQUFHLDJCQUEyQixDQUFDO0FBQy9HLFNBQUssWUFBWSxhQUFhLGNBQWMsS0FBSyxXQUFXLFVBQVUsU0FBUyxZQUFZLElBQ3hGLFNBQVMsNkJBQTZCLGdDQUEyQixJQUNqRSxLQUFLLFdBQVcsVUFBVSxTQUFTLElBQUksSUFDdEMsU0FBUyw2QkFBNkIscUJBQXFCLElBQzNELEtBQUssd0JBQXdCLFNBQVMsd0JBQXdCLFlBQVksR0FBRyxzQkFBc0IsQ0FBQztBQUN4RyxTQUFLLGFBQWEsYUFBYSxjQUFjLEtBQUssWUFBWSxVQUFVLFNBQVMsUUFBUSxJQUN0RixLQUFLLHdCQUF3QixTQUFTLGdDQUFnQyxnQkFBZ0IsR0FBRyxxQ0FBcUMsRUFBRSxJQUNoSSxLQUFLLHdCQUF3QixTQUFTLGlDQUFpQyxpQkFBaUIsR0FBRyxxQ0FBcUMsRUFBRSxDQUFDO0FBQUEsRUFDdkk7QUFBQTtBQUFBLEVBc0JRLHdCQUF3QixXQUE4QjtBQUM3RCxVQUFNLFNBQVMsdUJBQXVCLEtBQUssYUFBYSxjQUFjLENBQUM7QUFDdkUsY0FBVSxNQUFNLFlBQVksMkJBQTJCLE9BQU8sVUFBVSxTQUFTLENBQUM7QUFDbEYsY0FBVSxNQUFNLFlBQVksMEJBQTBCLE9BQU8sU0FBUyxTQUFTLENBQUM7QUFBQSxFQUNqRjtBQUFBLEVBRVMsT0FBTyxXQUE4QjtBQUM3QyxVQUFNLE9BQU8sU0FBUztBQUN0QixjQUFVLFVBQVUsSUFBSSwwQ0FBMEMsNEJBQTRCO0FBSTlGLFNBQUssd0JBQXdCLFNBQVM7QUFDdEMsU0FBSyxVQUFVLEtBQUssYUFBYSxzQkFBc0IsTUFBTSxLQUFLLHdCQUF3QixTQUFTLENBQUMsQ0FBQztBQVFyRyxVQUFNLE9BQU8sSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLHFEQUFxRCxDQUFDO0FBQy9GLFNBQUssUUFBUSxJQUFJLE9BQU8sTUFBTSxJQUFJLEVBQUUsK0RBQStELENBQUM7QUFHcEcsU0FBSyxpQkFBaUIsSUFBSSxPQUFPLEtBQUssT0FBTyxJQUFJLEVBQUUsK0VBQStFLENBQUM7QUFDbkksU0FBSyxlQUFlLGFBQWEsUUFBUSxRQUFRO0FBQ2pELFNBQUssZUFBZSxhQUFhLFFBQVEsUUFBUTtBQUNqRCxTQUFLLGlCQUFpQixJQUFJLE9BQU8sS0FBSyxnQkFBZ0IsSUFBSSxFQUFFLGlDQUFpQyxDQUFDO0FBQzlGLFNBQUssVUFBVSxLQUFLLGFBQWE7QUFBQSxNQUFrQix3QkFBd0IsU0FBUztBQUFBLE1BQUcsS0FBSztBQUFBLE1BQzNGLE1BQU0sS0FBSyx3QkFBd0IsbUJBQ2hDLGlDQUFpQyxLQUFLLHVCQUF1QixJQUM3RCx5QkFBeUIsS0FBSyx3QkFBd0IsU0FBUyw0QkFBNEIsV0FBVyxHQUFHLDJCQUEyQixHQUFHLEtBQUssb0JBQW9CO0FBQUEsSUFBQyxDQUFDO0FBQ3RLLFNBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLGdCQUFnQixJQUFJLFVBQVUsT0FBTyxPQUFLO0FBQ3ZGLFVBQUksWUFBWSxLQUFLLEdBQUcsSUFBSTtBQUM1QixXQUFLLGtCQUFrQjtBQUFBLElBQ3hCLENBQUMsQ0FBQztBQUNGLFNBQUssd0JBQXdCLEtBQUssZ0JBQWdCLE1BQU0sS0FBSyxrQkFBa0IsQ0FBQztBQUNoRixTQUFLLFVBQVU7QUFBQSxNQUNkLEtBQUs7QUFBQSxNQUNMLE1BQU0sK0JBQStCLEtBQUssZ0JBQWdCLEtBQUssc0JBQXNCLEtBQUssbUJBQW1CLDJCQUEyQjtBQUFBLE1BQ3hJLEtBQUs7QUFBQSxJQUNOLENBQUM7QUFDRCxTQUFLLFVBQVUsc0JBQXNCLEtBQUssZ0JBQWdCLEtBQUsseUJBQXlCLEtBQUssc0JBQXNCLEtBQUssVUFBVSxVQUFVLEtBQUssWUFBWSxDQUFDO0FBRzlKLFNBQUssYUFBYSxJQUFJLE9BQU8sS0FBSyxPQUFPLElBQUksRUFBRSwyRUFBMkUsQ0FBQztBQUMzSCxTQUFLLFdBQVcsYUFBYSxRQUFRLFFBQVE7QUFDN0MsU0FBSyxXQUFXLGFBQWEsUUFBUSxRQUFRO0FBQzdDLFNBQUssYUFBYSxJQUFJLE9BQU8sS0FBSyxZQUFZLElBQUksRUFBRSxpQ0FBaUMsQ0FBQztBQUl0RixRQUFJLE9BQU8sS0FBSyxZQUFZLElBQUksRUFBRSxnRUFBZ0UsVUFBVSxjQUFjLFFBQVEsY0FBYyxDQUFDLEVBQUUsQ0FBQztBQUNwSixhQUFTLElBQUksR0FBRyxJQUFJLG9CQUFvQixLQUFLO0FBQzVDLFdBQUssYUFBYSxLQUFLLElBQUksT0FBTyxLQUFLLFlBQVksSUFBSSxFQUFFLGdDQUFnQyxDQUFDLENBQUM7QUFBQSxJQUM1RjtBQUNBLFNBQUssVUFBVSxLQUFLLGFBQWE7QUFBQSxNQUFrQix3QkFBd0IsU0FBUztBQUFBLE1BQUcsS0FBSztBQUFBLE1BQzNGLE1BQU07QUFDTCxjQUFNLFlBQVksS0FBSyxVQUFVLGVBQWUsSUFBSSxLQUFLLEtBQUssVUFBVSxVQUFVLElBQUksS0FBSztBQUMzRixjQUFNLGVBQWdCLGNBQWMsS0FBSyx1QkFBdUIsWUFBWSxJQUFJLEtBQUssS0FBSyx1QkFBdUIsYUFBYSxJQUFJLE1BQU8sS0FBSyxzQkFBc0Isb0JBQW9CLElBQUksTUFBTSxVQUFVLEtBQUssc0JBQXNCLG9CQUFvQixJQUFJLE1BQU0sZUFBZSxLQUFLLHNCQUFzQixvQkFBb0IsSUFBSSxNQUFNO0FBQzdVLGVBQU8seUJBQXlCLGVBQzdCLFNBQVMsNkJBQTZCLHFCQUFxQixJQUMzRCxLQUFLLHdCQUF3QixTQUFTLHdCQUF3QixZQUFZLEdBQUcsc0JBQXNCLENBQUM7QUFBQSxNQUN4RztBQUFBLElBQUMsQ0FBQztBQUlILFNBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLFlBQVksSUFBSSxVQUFVLE9BQU8sT0FBSztBQUNuRixVQUFJLFlBQVksS0FBSyxHQUFHLElBQUk7QUFDNUIsV0FBSyxLQUFLLHlCQUF5QjtBQUFBLElBQ3BDLENBQUMsQ0FBQztBQUNGLFNBQUssd0JBQXdCLEtBQUssWUFBWSxNQUFNLEtBQUsseUJBQXlCLENBQUM7QUFDbkYsU0FBSyxVQUFVO0FBQUEsTUFDZCxLQUFLO0FBQUEsTUFDTCxNQUFNLCtCQUErQixLQUFLLGdCQUFnQixLQUFLLHNCQUFzQixLQUFLLG1CQUFtQixzQkFBc0I7QUFBQSxNQUNuSSxLQUFLO0FBQUEsSUFDTixDQUFDO0FBRUQsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssWUFBWSxJQUFJLFVBQVUsYUFBYSxNQUFNO0FBQzFGLFdBQUssaUJBQWlCO0FBQ3RCLFdBQUssa0JBQWtCO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssWUFBWSxJQUFJLFVBQVUsYUFBYSxNQUFNO0FBQzFGLFdBQUssaUJBQWlCO0FBQ3RCLFdBQUssa0JBQWtCO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBR0YsU0FBSyxjQUFjLElBQUksT0FBTyxLQUFLLE9BQU8sSUFBSSxFQUFFLDRFQUE0RSxDQUFDO0FBQzdILFNBQUssWUFBWSxhQUFhLFFBQVEsUUFBUTtBQUM5QyxTQUFLLFlBQVksYUFBYSxRQUFRLFFBQVE7QUFDOUMsU0FBSyxjQUFjLElBQUksT0FBTyxLQUFLLGFBQWEsSUFBSSxFQUFFLGlDQUFpQyxDQUFDO0FBQ3hGLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssVUFBVSxLQUFLLGtCQUFrQix1QkFBdUIsTUFBTSxLQUFLLGtCQUFrQixDQUFDLENBQUM7QUFDNUYsU0FBSyxVQUFVO0FBQUEsTUFDZCxLQUFLO0FBQUEsTUFDTCxNQUFNLCtCQUErQixLQUFLLGdCQUFnQixLQUFLLHNCQUFzQixLQUFLLG1CQUFtQixzQkFBc0I7QUFBQSxNQUNuSSxLQUFLO0FBQUEsSUFDTixDQUFDO0FBQ0QsU0FBSyxVQUFVLEtBQUssYUFBYTtBQUFBLE1BQWtCLHdCQUF3QixTQUFTO0FBQUEsTUFBRyxLQUFLO0FBQUEsTUFDM0YsTUFBTSxLQUFLLHVCQUF1QixXQUFXLElBQUksTUFBTSxjQUNwRCxLQUFLLHdCQUF3QixTQUFTLGdDQUFnQyxnQkFBZ0IsR0FBRyxxQ0FBcUMsRUFBRSxJQUNoSSxLQUFLLHdCQUF3QixTQUFTLHVDQUF1QywrQkFBK0IsR0FBRyxxQ0FBcUMsRUFBRTtBQUFBLElBQUMsQ0FBQztBQUk1SixTQUFLLFVBQVUsSUFBSSxzQ0FBc0MsS0FBSyxhQUFhLENBQUMsTUFBa0I7QUFDN0YsVUFBSSxFQUFFLFdBQVcsR0FBRztBQUNuQjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLHFCQUFxQjtBQUFBLElBQzNCLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLGFBQWEsSUFBSSxVQUFVLE9BQU8sT0FBSztBQUNwRixVQUFJLFlBQVksS0FBSyxHQUFHLElBQUk7QUFDNUIsVUFBSSxLQUFLLHNCQUFzQjtBQUM5QixhQUFLLHVCQUF1QjtBQUM1QjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGVBQWU7QUFBQSxJQUNyQixDQUFDLENBQUM7QUFDRixTQUFLLHdCQUF3QixLQUFLLGFBQWEsTUFBTSxLQUFLLGVBQWUsQ0FBQztBQUkxRSxVQUFNLGtCQUFrQjtBQUFBLE1BQW9CO0FBQUEsTUFDM0MsS0FBSyx3QkFBd0I7QUFBQSxNQUM3QixNQUFNLDJCQUEyQixLQUFLLHlCQUF5QixNQUFNLEtBQUssS0FBSyx3QkFBd0IsVUFBVSxzQkFBc0I7QUFBQSxJQUFJO0FBSTVJLFVBQU0scUJBQXFCO0FBQUEsTUFBb0I7QUFBQSxNQUM5QyxLQUFLLHdCQUF3QjtBQUFBLE1BQzdCLE1BQU0sS0FBSyx3QkFBd0IsbUJBQW1CLFVBQVUsS0FBSyx3QkFBd0I7QUFBQSxJQUFnQjtBQUk5RyxVQUFNLHVCQUF1QjtBQUFBLE1BQW9CO0FBQUEsTUFDaEQsS0FBSyx3QkFBd0I7QUFBQSxNQUM3QixNQUFNLEtBQUssd0JBQXdCO0FBQUEsSUFBa0I7QUFFdEQsU0FBSyxVQUFVLFFBQVEsWUFBVTtBQUNoQyxZQUFNLHFCQUFxQixLQUFLLHNCQUFzQixtQkFBbUIsS0FBSyxNQUFNO0FBQ3BGLFlBQU0saUJBQWlCLEtBQUssc0JBQXNCLGVBQWUsS0FBSyxNQUFNO0FBQzVFLFlBQU0sZUFBZSxLQUFLLHNCQUFzQixtQkFBbUIsS0FBSyxNQUFNO0FBQzlFLFlBQU0sWUFBWSxnQkFBZ0IsS0FBSyxzQkFBc0IsVUFBVSxLQUFLLE1BQU07QUFDbEYsWUFBTSxNQUFNLEtBQUssc0JBQXNCLG9CQUFvQixLQUFLLE1BQU07QUFDdEUsWUFBTSxXQUFXLFFBQVEsV0FBYyxLQUFLLFVBQVUsVUFBVSxLQUFLLE1BQU0sS0FBSztBQUNoRixZQUFNLGdCQUFnQixRQUFRLFdBQWMsS0FBSyxVQUFVLGVBQWUsS0FBSyxNQUFNLEtBQUs7QUFHMUYsVUFBSTtBQUNKLFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSTtBQUNKLFVBQUk7QUFDSixVQUFJLFFBQVEsUUFBVztBQUN0QixzQkFBYyxRQUFRO0FBQ3RCLHFCQUFhLFFBQVE7QUFDckIsb0JBQVksUUFBUSxVQUFVLFFBQVEsZUFBZSxRQUFRO0FBQzdELG9CQUFZLFFBQVE7QUFDcEIsbUJBQVcsUUFBUTtBQUFBLE1BQ3BCLE9BQU87QUFDTixzQkFBYyxZQUFZLGdCQUFnQixLQUFLLE1BQU07QUFDckQsb0JBQVksaUJBQWlCLEtBQUssdUJBQXVCLFlBQVksS0FBSyxNQUFNO0FBR2hGLHFCQUFhLGtCQUFrQixLQUFLLHVCQUF1QixhQUFhLEtBQUssTUFBTSxLQUMvRSxLQUFLLHVCQUF1QixlQUFlLEtBQUssTUFBTTtBQUMxRCxjQUFNLGFBQWEsS0FBSyx1QkFBdUIsV0FBVyxLQUFLLE1BQU07QUFDckUsb0JBQVksYUFBYSxlQUFlO0FBQ3hDLG1CQUFXLGFBQWEsZUFBZTtBQUFBLE1BQ3hDO0FBQ0EsWUFBTSxZQUFZLGFBQWE7QUFDL0IsWUFBTSxVQUFVLGFBQWE7QUFDN0IsV0FBSyxhQUFhO0FBRWxCLFlBQU0sZ0JBQWdCLFFBQVEsVUFBYSxZQUFZLG1CQUFtQixLQUFLLE1BQU07QUFPckYsWUFBTSxhQUFhLGFBQWEsQ0FBQztBQU9qQyxZQUFNLG1CQUFtQixzQkFBc0IsQ0FBQztBQUNoRCxZQUFNLGVBQWUsa0JBQWtCLENBQUMsZUFBZSxDQUFDO0FBQ3hELFlBQU0sZ0JBQWdCO0FBR3RCLFlBQU0sZ0JBQWdCLG1CQUFtQixJQUFJLE1BQU0sZUFBZSxJQUFJLE1BQU0sZ0JBQWdCLElBQUk7QUFDaEcsZ0JBQVUsVUFBVSxPQUFPLGFBQWEsT0FBTztBQUMvQyxnQkFBVSxVQUFVLE9BQU8sVUFBVSxpQkFBaUIsQ0FBQztBQUl2RCxXQUFLLGVBQWdCLFVBQVUsT0FBTyxhQUFhLENBQUMsZ0JBQWdCO0FBQ3BFLFdBQUssZUFBZ0IsVUFBVSxPQUFPLFVBQVUsZUFBZSxhQUFhO0FBQzVFLFdBQUssZUFBZ0IsVUFBVSxPQUFPLGFBQWEsYUFBYTtBQUNoRSxXQUFLLGVBQWdCLGFBQWEsZ0JBQWdCLE9BQU8sV0FBVyxDQUFDO0FBQ3JFLFdBQUssZUFBZ0IsYUFBYSxjQUFjLGdCQUM3QyxTQUFTLCtDQUErQyx5QkFBeUIsMkJBQTJCLEtBQUssdUJBQXVCLENBQUMsSUFDekksU0FBUyw0QkFBNEIsV0FBVyxDQUFDO0FBTXBELFlBQU0sZ0JBQWdCLGdCQUNuQixxQkFBcUIsS0FBSyxNQUFNLElBQUksUUFBUSxxQkFBcUIsUUFBUSxpQkFDekUsY0FBYyxRQUFRLFlBQVksUUFBUTtBQUM3QyxXQUFLLGVBQWdCLFlBQVksOEJBQThCLFVBQVUsWUFBWSxhQUFhLENBQUM7QUFNbkcsVUFBSSxpQkFBaUIscUJBQXFCLEtBQUssTUFBTSxHQUFHO0FBQ3ZELFlBQUksQ0FBQyxLQUFLLGVBQWUsT0FBTztBQUMvQixlQUFLLGVBQWUsUUFBUSxJQUFJLHNCQUFzQixLQUFLLGdCQUFpQixLQUFLLHVCQUF1QjtBQUFBLFFBQ3pHO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSyxlQUFlLE1BQU07QUFBQSxNQUMzQjtBQVFBLFdBQUssV0FBWSxVQUFVLE9BQU8sYUFBYSxDQUFDLFlBQVk7QUFDNUQsV0FBSyxXQUFZLFVBQVUsT0FBTyxNQUFNLE9BQU87QUFDL0MsV0FBSyxXQUFZLFVBQVUsT0FBTyxjQUFjLGNBQWMsQ0FBQyxTQUFTO0FBQ3hFLFdBQUssV0FBWSxVQUFVLE9BQU8sV0FBVyxXQUFXLENBQUMsU0FBUztBQUNsRSxXQUFLLFdBQVksVUFBVSxPQUFPLGFBQWEsU0FBUztBQUN4RCxXQUFLLFdBQVksVUFBVSxPQUFPLFlBQVksUUFBUTtBQUN0RCxXQUFLLFdBQVksYUFBYSxnQkFBZ0IsT0FBTyxPQUFPLENBQUM7QUFFN0QsV0FBSyxXQUFZLFVBQVUsT0FBTyxhQUFhLEtBQUssc0JBQXNCLGVBQWUsS0FBSyxNQUFNLENBQUM7QUFHckcsV0FBSyxZQUFhLFVBQVUsT0FBTyxhQUFhLENBQUMsYUFBYTtBQUM5RCxXQUFLLFlBQWEsVUFBVSxPQUFPLFVBQVUsU0FBUztBQUN0RCxXQUFLLFlBQWEsVUFBVSxPQUFPLFNBQVMsQ0FBQyxTQUFTO0FBQ3RELFdBQUssWUFBYSxhQUFhLGdCQUFnQixPQUFPLFNBQVMsQ0FBQztBQUNoRSxXQUFLLFlBQWEsWUFBWSw4QkFBOEIsVUFBVSxZQUFZLFlBQVksUUFBUSwyQkFBMkIsUUFBUSxrQkFBa0IsQ0FBQztBQUM1SixXQUFLLGtCQUFrQjtBQUd2QixXQUFLLGtCQUFrQjtBQUFBLElBQ3hCLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxFQUFFLFNBQVMsTUFBTSxLQUFLLGtCQUFrQixFQUFFLENBQUM7QUFFMUQsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHlCQUF5QixNQUFNO0FBQ3ZFLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssa0JBQWtCO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBO0FBQUEsRUFHUSxvQkFBMEI7QUFDakMsUUFBSSxLQUFLLGNBQWMsQ0FBQyxLQUFLLGdCQUFnQjtBQUM1QyxXQUFLLG1CQUFtQjtBQUFBLElBQ3pCLE9BQU87QUFDTixXQUFLLGtCQUFrQjtBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLHFCQUEyQjtBQUNsQyxRQUFJLEtBQUssdUJBQXVCLFFBQVc7QUFDMUM7QUFBQSxJQUNEO0FBR0EsUUFBSSxLQUFLLHFCQUFxQixnQkFBZ0IsR0FBRztBQUNoRCxpQkFBVyxPQUFPLEtBQUssY0FBYztBQUNwQyxZQUFJLE1BQU0sWUFBWTtBQUN0QixZQUFJLE1BQU0sU0FBUyxHQUFHLHVCQUF1QjtBQUFBLE1BQzlDO0FBQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxNQUFNLFVBQVUsS0FBSyxVQUFVO0FBQ3JDLFVBQU0sT0FBTyxNQUFNO0FBQ2xCLFdBQUsscUJBQXFCLElBQUksc0JBQXNCLElBQUk7QUFFeEQsWUFBTSxXQUFXLEtBQUssdUJBQXVCLFdBQVcsSUFBSSxNQUFNLGFBQy9ELEtBQUssbUJBQW1CLGVBQ3hCLEtBQUssa0JBQWtCO0FBQzFCLFVBQUksQ0FBQyxVQUFVO0FBRWQsbUJBQVcsT0FBTyxLQUFLLGNBQWM7QUFDcEMsY0FBSSxNQUFNLGVBQWUsUUFBUTtBQUNqQyxjQUFJLE1BQU0sZUFBZSxXQUFXO0FBQUEsUUFDckM7QUFDQTtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsS0FBSyxZQUFZLEtBQUssU0FBUyxXQUFXLFNBQVMsbUJBQW1CO0FBQzFFLGFBQUssV0FBVyxJQUFJLFdBQVcsU0FBUyxpQkFBaUI7QUFBQSxNQUMxRDtBQUNBLGVBQVMscUJBQXFCLEtBQUssUUFBbUM7QUFDdEUsWUFBTSxPQUFPLEtBQUssU0FBUztBQUMzQixZQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLE9BQU8sS0FBSyxhQUFhLE1BQU0sQ0FBQztBQUNwRSxlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssYUFBYSxRQUFRLEtBQUs7QUFDbEQsWUFBSSxNQUFNO0FBQ1YsaUJBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxLQUFLO0FBQzlCLGlCQUFPLEtBQUssU0FBUyxLQUFLLElBQUksT0FBTyxHQUFHLElBQUksT0FBTyxDQUFDLENBQUM7QUFBQSxRQUN0RDtBQUNBLGNBQU0sWUFBWSxLQUFLLElBQUksR0FBSSxNQUFNLE9BQVEsR0FBRztBQUNoRCxjQUFNLFdBQVcsMEJBQTBCLGFBQWEsMEJBQTBCO0FBRWxGLGFBQUssYUFBYSxDQUFDLEVBQUUsTUFBTSxZQUFZO0FBQ3ZDLGFBQUssYUFBYSxDQUFDLEVBQUUsTUFBTSxTQUFTLEdBQUcsUUFBUTtBQUFBLE1BQ2hEO0FBQUEsSUFDRDtBQUNBLFNBQUsscUJBQXFCLElBQUksc0JBQXNCLElBQUk7QUFBQSxFQUN6RDtBQUFBLEVBRVEsb0JBQTBCO0FBQ2pDLFFBQUksS0FBSyx1QkFBdUIsVUFBYSxLQUFLLFlBQVk7QUFDN0QsZ0JBQVUsS0FBSyxVQUFVLEVBQUUscUJBQXFCLEtBQUssa0JBQWtCO0FBQUEsSUFDeEU7QUFDQSxTQUFLLHFCQUFxQjtBQUMxQixlQUFXLE9BQU8sS0FBSyxjQUFjO0FBQ3BDLFVBQUksTUFBTSxlQUFlLFFBQVE7QUFDakMsVUFBSSxNQUFNLGVBQWUsV0FBVztBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUVEsbUJBQXlCO0FBQ2hDLFFBQUksS0FBSyxVQUFVLGlCQUFpQjtBQUNuQyxXQUFLLFNBQVMsZ0JBQWdCO0FBQUEsSUFDL0IsT0FBTztBQUNOLFdBQUssZUFBZSxlQUFlLDJCQUEyQjtBQUFBLElBQy9EO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTUSx3QkFBd0IsTUFBbUIsU0FBMkI7QUFDN0UsU0FBSyxVQUFVLElBQUksOEJBQThCLE1BQU0sSUFBSSxVQUFVLFVBQVUsT0FBSztBQUNuRixVQUFJLEVBQUUsT0FBTyxRQUFRLEtBQUssS0FBSyxFQUFFLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFDdkQsVUFBRSxlQUFlO0FBQ2pCLFVBQUUsZ0JBQWdCO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxJQUFJLDhCQUE4QixNQUFNLElBQUksVUFBVSxRQUFRLE9BQUs7QUFDakYsVUFBSSxFQUFFLE9BQU8sUUFBUSxLQUFLLEtBQUssRUFBRSxPQUFPLFFBQVEsS0FBSyxHQUFHO0FBQ3ZELFVBQUUsZUFBZTtBQUNqQixVQUFFLGdCQUFnQjtBQUNsQixnQkFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLG9CQUEwQjtBQUNqQyxTQUFLLHNCQUFzQixnQkFBZ0IsV0FBVztBQUd0RCxRQUFJLEtBQUssdUJBQXVCLFlBQVksSUFBSSxLQUFLLEtBQUssdUJBQXVCLGFBQWEsSUFBSSxHQUFHO0FBQ3BHLFdBQUssdUJBQXVCLFdBQVc7QUFBQSxJQUN4QztBQUVBLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFBQTtBQUFBLEVBR0EsTUFBYywyQkFBMEM7QUFDdkQsU0FBSyxzQkFBc0IsZ0JBQWdCLE9BQU87QUFHbEQsUUFBSSxLQUFLLHdCQUF3QixVQUFVLHNCQUFzQixNQUFNO0FBQ3RFLFdBQUssaUJBQWlCO0FBQUEsSUFDdkI7QUFFQSxVQUFNLGFBQWEsS0FBSztBQUN4QixVQUFNLGVBQWUsVUFBVSxLQUFLLFVBQVU7QUFDOUMsUUFBSSxXQUFXLFlBQVksSUFBSSxLQUFLLFdBQVcsYUFBYSxJQUFJLEdBQUc7QUFDbEUsVUFBSSxLQUFLLFVBQVUsZUFBZSxJQUFJLE1BQU0sT0FBTztBQUNsRCxZQUFJLEtBQUssU0FBUyxtQkFBbUI7QUFDcEMsZ0JBQU0sS0FBSyxTQUFTLGtCQUFrQjtBQUFBLFFBQ3ZDLE9BQU87QUFDTixnQkFBTSw4QkFBOEIsS0FBSyxnQkFBZ0IsWUFBWSxZQUFZO0FBQUEsUUFDbEY7QUFDQTtBQUFBLE1BQ0Q7QUFDQSxpQkFBVyxXQUFXO0FBQUEsSUFDdkIsT0FBTztBQUNOLFVBQUksS0FBSyxVQUFVLG1CQUFtQjtBQUNyQyxjQUFNLEtBQUssU0FBUyxrQkFBa0I7QUFBQSxNQUN2QyxPQUFPO0FBQ04sY0FBTSw4QkFBOEIsS0FBSyxnQkFBZ0IsWUFBWSxZQUFZO0FBQUEsTUFDbEY7QUFDQSxpQkFBVyxRQUFRLFlBQVksRUFBRSxNQUFNLE1BQU07QUFBQSxNQUErRCxDQUFDO0FBQUEsSUFDOUc7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdRLGlCQUF1QjtBQUM5QixVQUFNLGFBQWEsS0FBSztBQUN4QixRQUFJLENBQUMsV0FBVyxZQUFZLElBQUksR0FBRztBQUNsQztBQUFBLElBQ0Q7QUFDQSxRQUFJLFdBQVcsV0FBVyxJQUFJLE1BQU0sYUFBYTtBQUNoRCxpQkFBVyxjQUFjO0FBQUEsSUFDMUIsT0FBTztBQUNOLGlCQUFXLFFBQVE7QUFDbkIsaUJBQVcsTUFBTTtBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBLEVBS1EsdUJBQTZCO0FBQ3BDLFVBQU0sYUFBYSxLQUFLO0FBR3hCLFFBQUksQ0FBQyxXQUFXLFlBQVksSUFBSSxLQUFLLFdBQVcsV0FBVyxJQUFJLE1BQU0sYUFBYTtBQUNqRjtBQUFBLElBQ0Q7QUFDQSxTQUFLLHFCQUFxQjtBQUMxQixTQUFLLHVCQUF1QjtBQUc1QixTQUFLLHVCQUF1QjtBQUM1QixVQUFNLE1BQU0sVUFBVSxLQUFLLFdBQVc7QUFHdEMsU0FBSyxtQkFBbUIsSUFBSSxXQUFXLE1BQU07QUFDNUMsV0FBSyxtQkFBbUI7QUFDeEIsVUFBSSxXQUFXLFlBQVksSUFBSSxHQUFHO0FBQ2pDLGFBQUssdUJBQXVCO0FBQzVCLG1CQUFXLFFBQVEsWUFBWSxJQUFJO0FBQUEsTUFDcEM7QUFBQSxJQUNELEdBQUcsNkJBQTZCLGlCQUFpQjtBQUdqRCxTQUFLLGlCQUFpQixRQUFRLElBQUksb0NBQW9DLEtBQUssQ0FBQyxNQUFrQixLQUFLLHNCQUFzQixDQUFDLENBQUM7QUFBQSxFQUM1SDtBQUFBLEVBRVEsc0JBQXNCLEdBQXNCO0FBQ25ELFFBQUksQ0FBQyxLQUFLLG9CQUFvQjtBQUM3QjtBQUFBLElBQ0Q7QUFDQSxTQUFLLHFCQUFxQjtBQUMxQixTQUFLLGlCQUFpQixNQUFNO0FBQzVCLFFBQUksS0FBSyxxQkFBcUIsUUFBVztBQUV4QyxnQkFBVSxLQUFLLFdBQVcsRUFBRSxhQUFhLEtBQUssZ0JBQWdCO0FBQzlELFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssdUJBQXVCO0FBQUEsSUFDN0IsV0FBVyxLQUFLLHNCQUFzQjtBQUlyQyxXQUFLLHVCQUF1QjtBQUM1QixZQUFNLGlCQUFpQixDQUFDLENBQUMsR0FBRyxVQUFVLEtBQUssWUFBYSxTQUFTLEVBQUUsTUFBYztBQUNqRixXQUFLLHVCQUF1QjtBQUM1QixXQUFLLHVCQUF1QixNQUFNLFlBQVksSUFBSTtBQUFBLElBQ25EO0FBQUEsRUFDRDtBQUFBLEVBRVMsVUFBZ0I7QUFHeEIsUUFBSSxLQUFLLHNCQUFzQixLQUFLLHFCQUFxQixRQUFXO0FBQ25FLFdBQUssc0JBQXNCO0FBQUEsSUFDNUI7QUFDQSxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUFBQTtBQTdpQmEsNkJBa2ZZLG9CQUFvQjtBQWxmaEMsK0JBQU47QUFBQSxFQThDSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F6RFU7QUEraUJOLFNBQVMsMEJBQTBCLHVCQUFvRjtBQUM3SCxRQUFNLFlBQVksc0JBQXNCLG1CQUFtQixJQUFJO0FBQy9ELFFBQU0sUUFBUSxzQkFBc0IsZUFBZSxJQUFJO0FBQ3ZELE1BQUksYUFBYSxPQUFPO0FBQ3ZCLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxXQUFXO0FBQ2QsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLE9BQU87QUFDVixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFtdCn0K
