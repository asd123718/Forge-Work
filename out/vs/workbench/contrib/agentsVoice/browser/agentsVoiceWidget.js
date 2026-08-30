import * as dom from "../../../../base/browser/dom.js";
import { observableValue, derived, autorun } from "../../../../base/common/observable.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { getWindow } from "../../../../base/browser/dom.js";
import { AGENTS_VOICE_WINDOW_DEFAULT_WIDTH, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT } from "../common/agentsVoice.js";
import { createHeader } from "./components/headerComponent.js";
import { createStatusRows } from "./components/statusRowsComponent.js";
import { createTranscript } from "./components/transcriptComponent.js";
import { createSessionList } from "./components/sessionListComponent.js";
import { createFeedbackDialog } from "./components/feedbackDialog.js";
import { createOnboarding } from "./components/onboardingComponent.js";
import { createVoiceBar } from "./components/voiceBarComponent.js";
import { FONT_SIZE, addKeyboardActivation, isSecondaryPointerGesture } from "./components/tokens.js";
import { computeVoiceMicGlowBoxShadow, voiceGlowStateColor } from "../../chat/browser/voiceClient/voiceGlow.js";
import { createVoiceGlowController } from "../../chat/browser/voiceClient/voiceGlowController.js";
const DEFAULT_OPTIONS = {
  width: AGENTS_VOICE_WINDOW_DEFAULT_WIDTH,
  draggable: true,
  showClose: true,
  showExpandChevron: true,
  showStatusText: false,
  showStatusCounters: true,
  showCopilotIcon: false,
  centerConnectButton: false,
  title: "",
  subtitle: "",
  focusable: false,
  showOnboarding: false,
  reshowOnboardingOnDisconnect: false,
  defaultExpanded: false,
  inputBoxLayout: false
};
class AgentsVoiceWidget extends Disposable {
  constructor(container, callbacks, options = {}) {
    super();
    this.container = container;
    this.callbacks = callbacks;
    // --- Reactive state ---
    this._isConnected = observableValue(this, false);
    this._isConnecting = observableValue(this, false);
    this._isReconnecting = observableValue(this, false);
    this._voiceState = observableValue(this, "idle");
    this._expanded = observableValue(this, false);
    this._workingCount = observableValue(this, 0);
    this._needsInputCount = observableValue(this, 0);
    this._doneCount = observableValue(this, 0);
    this._pendingToolConfirmations = observableValue(this, []);
    this._speakingSession = observableValue(this, void 0);
    this._speakingSessionLabel = observableValue(this, void 0);
    this._sessions = observableValue(this, []);
    this._sessionGroups = observableValue(this, void 0);
    this._selectedTargetSession = observableValue(this, void 0);
    this._transcriptTurns = observableValue(this, []);
    this._pttKeyLabel = observableValue(this, void 0);
    this._statusText = observableValue(this, "");
    this._popoutAvailable = observableValue(this, true);
    this._voiceControlsSuppressed = observableValue(this, false);
    this._feedbackDialogState = observableValue(this, null);
    this._showOnboarding = observableValue(this, false);
    this._onboardingPendingConnect = observableValue(this, false);
    // --- Derived state ---
    this._shouldShowExpanded = derived(this, (reader) => this._expanded.read(reader));
    // --- DOM components ---
    this._headerComponent = createHeader();
    this._onboardingComponent = createOnboarding();
    this._feedbackDialogComponent = createFeedbackDialog();
    this._voiceBarComponent = createVoiceBar();
    this._transcriptComponent = this._register(createTranscript());
    this._inputBoxTranscriptComponent = this._register(createTranscript());
    this._statusRowsComponent = createStatusRows();
    this._sessionListComponent = createSessionList();
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._showOnboarding.set(this._options.showOnboarding, void 0);
    this._expanded.set(this._options.defaultExpanded, void 0);
    const opts = this._options;
    const widthStyle = opts.width === "auto" ? "width:100%;position:relative;" : `position:absolute;top:0;left:0;width:${opts.width}px;${opts.inputBoxLayout ? "" : `min-height:${AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT}px;`}`;
    this._rootDiv = dom.$("div");
    this._rootDiv.style.cssText = `${widthStyle}display:flex;flex-direction:column;user-select:none;font-family:inherit;font-size:${FONT_SIZE.base};color:var(--vscode-foreground);box-sizing:border-box;margin:0;${opts.inputBoxLayout && opts.draggable ? "-webkit-app-region:drag;" : ""}`;
    this._glowDiv = dom.$("div");
    this._glowDiv.style.cssText = "position:absolute;top:0;left:0;right:0;height:50px;pointer-events:none;z-index:0;";
    this._titleRow = dom.$("div");
    this._titleRow.style.cssText = "display:flex;align-items:baseline;gap:6px;padding:8px 14px 0;overflow:hidden;white-space:nowrap;position:relative;z-index:1;";
    if (opts.title) {
      const titleSpan = dom.$("span");
      titleSpan.style.cssText = `font-size:${FONT_SIZE.micro};font-weight:700;color:var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0;user-select:none;`;
      titleSpan.textContent = opts.title;
      this._titleRow.append(titleSpan);
      if (opts.subtitle) {
        const subtitleSpan = dom.$("span");
        subtitleSpan.style.cssText = `font-size:${FONT_SIZE.micro};font-weight:400;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;`;
        subtitleSpan.textContent = opts.subtitle;
        this._titleRow.append(subtitleSpan);
      }
    }
    this._contentDiv = dom.$("div");
    this._contentDiv.style.cssText = "display:flex;flex-direction:column;flex:1;padding:8px 14px 2px;position:relative;z-index:1;";
    this._statusTextDiv = dom.$("div");
    this._statusTextDiv.style.cssText = `text-align:center;font-size:${FONT_SIZE.body};font-weight:500;color:var(--vscode-foreground);padding:2px 0;`;
    this._sessionListWrapper = dom.$("div");
    this._sessionListWrapper.style.cssText = "display:flex;flex-direction:column;-webkit-app-region:no-drag;overflow:hidden;";
    this._sessionListWrapper.append(this._sessionListComponent.element);
    this._expandSpacer = dom.$("div");
    this._expandSpacer.style.cssText = "flex:1;";
    this._chevronWrapper = dom.$("div");
    this._chevronWrapper.role = "button";
    this._chevronWrapper.tabIndex = 0;
    this._chevronWrapper.style.cssText = "display:flex;justify-content:center;cursor:pointer;-webkit-app-region:no-drag;";
    this._chevronIcon = dom.$("span.codicon");
    this._chevronIcon.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);`;
    this._register(dom.addDisposableListener(this._chevronIcon, "mouseenter", () => {
      this._chevronIcon.style.color = "var(--vscode-foreground)";
    }));
    this._register(dom.addDisposableListener(this._chevronIcon, "mouseleave", () => {
      this._chevronIcon.style.color = "var(--vscode-descriptionForeground)";
    }));
    this._chevronWrapper.append(this._chevronIcon);
    this._register(dom.addDisposableListener(this._chevronWrapper, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.callbacks.showSessionsPicker) {
        this.callbacks.showSessionsPicker();
      } else {
        this._expanded.set(!this._expanded.get(), void 0);
      }
    }));
    this._register(dom.addDisposableListener(this._chevronWrapper, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._chevronWrapper.click();
      }
    }));
    if (opts.inputBoxLayout) {
      const styleEl = dom.$("style");
      styleEl.textContent = `
				@property --voice-processing-angle { syntax: '<angle>'; inherits: false; initial-value: 135deg; }
				@keyframes voice-processing-spin { from { --voice-processing-angle: 135deg; } to { --voice-processing-angle: 495deg; } }
				@keyframes agents-voice-input-icon-pulse {
					0%, 100% { box-shadow: 0 0 4px rgba(var(--agents-voice-input-icon-rgb, 88,166,255), 0.45); }
					50% { box-shadow: 0 0 10px rgba(var(--agents-voice-input-icon-rgb, 88,166,255), 0.75); }
				}
				.monaco-workbench.monaco-enable-motion .agents-voice-mode-button.agents-voice-mode-active {
					animation: agents-voice-input-icon-pulse 1.4s ease-in-out infinite;
				}
				.processing { overflow: visible !important; }
				.processing::before {
					content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
					background: conic-gradient(from var(--voice-processing-angle),
						transparent 0deg, rgba(88,166,255,0.9) 20deg, rgba(88,166,255,1) 30deg,
						rgba(88,166,255,0.6) 50deg, transparent 90deg, transparent 360deg);
					-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					-webkit-mask-composite: xor; mask-composite: exclude;
					animation: voice-processing-spin 3s linear infinite;
					pointer-events: none; z-index: 2;
				}
				.processing::after {
					content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 2px;
					background: conic-gradient(from var(--voice-processing-angle),
						transparent 0deg, rgba(88,166,255,0.5) 25deg, rgba(88,166,255,0.3) 50deg, transparent 90deg, transparent 360deg);
					-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					-webkit-mask-composite: xor; mask-composite: exclude;
					filter: blur(1.5px); animation: voice-processing-spin 3s linear infinite;
					pointer-events: none; z-index: 1;
				}
			`;
      getWindow(this.container).document.head.append(styleEl);
      this._inputBoxContainer = dom.$("div");
      this._inputBoxContainer.style.cssText = "box-sizing:border-box;background-color:var(--vscode-input-background);border:1px solid var(--vscode-input-border, transparent);border-radius:var(--vscode-cornerRadius-large, 8px);padding:10px 12px;width:100%;position:relative;min-height:32px;display:flex;align-items:center;-webkit-app-region:no-drag;";
      this._inputBoxPlaceholder = dom.$("span");
      this._inputBoxPlaceholder.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));user-select:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;`;
      this._inputBoxTranscriptComponent.element.style.width = "100%";
      this._inputBoxTranscriptComponent.element.style.display = "none";
      this._inputBoxContainer.append(this._inputBoxPlaceholder, this._inputBoxTranscriptComponent.element);
      this._glowController = this._register(createVoiceGlowController(
        this._inputBoxContainer,
        () => this.callbacks.getGlowTheme(),
        () => this.callbacks.getGlowColors()
      ));
      this._register(this.callbacks.onDidChangeGlowTheme(() => this._glowController?.refreshTheme()));
      this._inputBoxToolbar = dom.$("div");
      this._inputBoxToolbar.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 4px 2px;-webkit-app-region:no-drag;";
      const toolbarBtn = (className, ariaLabel, title) => {
        const el = dom.$(`span.codicon.${className}`);
        el.role = "button";
        el.tabIndex = 0;
        el.ariaLabel = ariaLabel;
        el.title = title;
        el.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;`;
        this._register(dom.addDisposableListener(el, "mouseenter", () => {
          el.style.color = "var(--vscode-foreground)";
        }));
        this._register(dom.addDisposableListener(el, "mouseleave", () => {
          el.style.color = "var(--vscode-descriptionForeground)";
        }));
        addKeyboardActivation(el);
        return el;
      };
      this._inputBoxMicBtn = dom.$("span.codicon.codicon-voice-mode.agents-voice-mode-button");
      this._inputBoxMicBtn.role = "button";
      this._inputBoxMicBtn.tabIndex = 0;
      this._inputBoxMicBtn.ariaLabel = localize("agentsVoice.pushToTalkSpace", "Push to talk (Space)");
      this._inputBoxMicBtn.title = localize("agentsVoice.pushToTalkSpace", "Push to talk (Space)");
      this._inputBoxMicBtn.style.cssText = `font-size:${FONT_SIZE.iconMd};cursor:pointer;-webkit-app-region:no-drag;border-radius:4px;padding:2px;`;
      this._register(dom.addDisposableListener(this._inputBoxMicBtn, "contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.showVoiceContextMenu(e);
      }));
      this._inputBoxConnIndicator = toolbarBtn(
        "codicon-debug-connected",
        localize("agentsVoice.disconnect", "Disconnect"),
        localize("agentsVoice.disconnect", "Disconnect")
      );
      this._inputBoxFeedbackBtn = toolbarBtn(
        "codicon-feedback",
        localize("agentsVoice.sendFeedback", "Send feedback"),
        localize("agentsVoice.sendFeedback", "Send feedback")
      );
      this._inputBoxSessionsBtn = toolbarBtn(
        "codicon-list-tree",
        localize("agentsVoice.sessions", "Sessions"),
        localize("agentsVoice.sessions", "Sessions")
      );
      this._register(dom.addDisposableListener(this._inputBoxSessionsBtn, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._expanded.set(!this._expanded.get(), void 0);
      }));
      this._inputBoxCloseBtn = toolbarBtn(
        "codicon-chrome-minimize",
        localize("agentsVoice.minimize", "Minimize"),
        localize("agentsVoice.minimize", "Minimize")
      );
      const toolbarSpacer = dom.$("span");
      toolbarSpacer.style.flex = "1";
      this._inputBoxToolbar.append(
        this._inputBoxMicBtn,
        this._inputBoxConnIndicator,
        toolbarSpacer,
        this._inputBoxFeedbackBtn,
        this._inputBoxSessionsBtn,
        this._inputBoxCloseBtn
      );
    }
    if (opts.inputBoxLayout) {
      this._contentDiv.append(
        this._onboardingComponent.element,
        this._feedbackDialogComponent.element,
        this._inputBoxToolbar,
        this._transcriptComponent.element,
        this._sessionListWrapper,
        this._statusRowsComponent.element,
        this._inputBoxContainer
      );
    } else {
      this._contentDiv.append(
        this._onboardingComponent.element,
        this._headerComponent.element,
        this._voiceBarComponent.element,
        this._feedbackDialogComponent.element,
        this._statusTextDiv,
        this._transcriptComponent.element,
        this._statusRowsComponent.element,
        this._sessionListWrapper,
        this._expandSpacer,
        this._chevronWrapper
      );
    }
    this._rootDiv.append(this._glowDiv, this._titleRow, this._contentDiv);
    this.container.append(this._rootDiv);
    if (this._options.focusable) {
      this.container.tabIndex = 0;
      const win = getWindow(this.container);
      let pttKeyCode;
      let heldKeyCode;
      let releasedBeforeListening = false;
      const onDocKeydown = (e) => {
        heldKeyCode = e.code;
        releasedBeforeListening = false;
      };
      const onDocKeyup = (e) => {
        if (e.code === heldKeyCode) {
          heldKeyCode = void 0;
          if (pttKeyCode === void 0) {
            releasedBeforeListening = true;
          }
        }
      };
      win.document.addEventListener("keydown", onDocKeydown, true);
      win.document.addEventListener("keyup", onDocKeyup, true);
      this._register(toDisposable(() => {
        win.document.removeEventListener("keydown", onDocKeydown, true);
        win.document.removeEventListener("keyup", onDocKeyup, true);
      }));
      this._register(dom.addDisposableListener(this.container, "keydown", (e) => {
        if (!_isTextInput(e.target) && pttKeyCode && e.code === pttKeyCode) {
          e.preventDefault();
        }
      }));
      this._register(dom.addDisposableListener(this.container, "keyup", (e) => {
        if (!_isTextInput(e.target) && pttKeyCode && e.code === pttKeyCode) {
          e.preventDefault();
          pttKeyCode = void 0;
          this.callbacks.pttUp();
        }
      }));
      let wasListening = false;
      this._register(autorun((reader) => {
        const listening = this._voiceState.read(reader) === "listening";
        if (listening && !wasListening && pttKeyCode === void 0) {
          if (heldKeyCode !== void 0) {
            pttKeyCode = heldKeyCode;
          } else if (releasedBeforeListening) {
            releasedBeforeListening = false;
            this.callbacks.pttUp();
          }
        }
        if (!listening) {
          releasedBeforeListening = false;
        }
        wasListening = listening;
      }));
      const onDocPointerUp = () => this.callbacks.pttUp();
      win.document.addEventListener("pointerup", onDocPointerUp);
      this._register(toDisposable(() => win.document.removeEventListener("pointerup", onDocPointerUp)));
    }
    const pttChannel = new BroadcastChannel("vscode-ptt");
    pttChannel.onmessage = (e) => {
      if (e.data === "down") {
        this.callbacks.pttDown();
      }
      if (e.data === "up") {
        this.callbacks.pttUp();
      }
    };
    this._register(toDisposable(() => pttChannel.close()));
    const renderDisposable = autorun((reader) => {
      this._updateDOM(reader);
      getWindow(this.container).requestAnimationFrame(() => {
        this.callbacks.onResize();
      });
    });
    this._register(renderDisposable);
    this._register(toDisposable(() => dom.clearNode(this.container)));
    let sawConnecting = false;
    let failureCheckPending = false;
    let disposed = false;
    const onboardingConnectDisposable = autorun((reader) => {
      if (!this._onboardingPendingConnect.read(reader)) {
        sawConnecting = false;
        return;
      }
      if (this._isConnected.read(reader)) {
        this._onboardingPendingConnect.set(false, void 0);
        sawConnecting = false;
        this._showOnboarding.set(false, void 0);
        this.callbacks.onOnboardingCompleted?.();
        return;
      }
      if (this._isConnecting.read(reader)) {
        sawConnecting = true;
        return;
      }
      if (sawConnecting && !failureCheckPending) {
        failureCheckPending = true;
        queueMicrotask(() => {
          failureCheckPending = false;
          if (disposed) {
            return;
          }
          if (this._onboardingPendingConnect.read(void 0) && !this._isConnected.read(void 0) && !this._isConnecting.read(void 0)) {
            this._onboardingPendingConnect.set(false, void 0);
            sawConnecting = false;
          }
        });
      }
    });
    this._register(toDisposable(() => {
      disposed = true;
    }));
    this._register(onboardingConnectDisposable);
    if (this._options.reshowOnboardingOnDisconnect) {
      const reshowDisposable = autorun((reader) => {
        const connected = this._isConnected.read(reader);
        const connecting = this._isConnecting.read(reader);
        const reconnecting = this._isReconnecting.read(reader);
        const pendingConnect = this._onboardingPendingConnect.read(reader);
        if (!connected && !connecting && !reconnecting && !pendingConnect) {
          if (!this._showOnboarding.read(reader)) {
            this._showOnboarding.set(true, void 0);
          }
        }
      });
      this._register(reshowDisposable);
    }
    this._register(autorun((reader) => {
      const onboarding = this._showOnboarding.read(reader);
      const voiceState = this._voiceState.read(reader);
      if (onboarding || voiceState === "listening" || voiceState === "speaking") {
        this._startWaveformAnimation();
      } else {
        this._stopWaveformAnimation();
      }
    }));
    this._register(toDisposable(() => this._stopWaveformAnimation()));
  }
  _updateDOM(reader) {
    if (this._options.inputBoxLayout) {
      this._updateDOMInputBoxLayout(reader);
    } else {
      this._updateDOMClassicLayout(reader);
    }
  }
  _updateDOMInputBoxLayout(reader) {
    const voiceState = this._voiceState.read(reader);
    const voiceControlsSuppressed = this._voiceControlsSuppressed.read(reader);
    const isConnected = this._isConnected.read(reader);
    const isConnecting = this._isConnecting.read(reader);
    const isReconnecting = this._isReconnecting.read(reader);
    const onboarding = this._showOnboarding.read(reader) && !isReconnecting;
    const showConnected = isConnected || isReconnecting;
    const opts = this._options;
    const showExpanded = this._shouldShowExpanded.read(reader) && opts.showExpandChevron;
    const baseWidth = typeof opts.width === "number" ? opts.width : AGENTS_VOICE_WINDOW_DEFAULT_WIDTH;
    this._rootDiv.style.width = `${baseWidth}px`;
    this._titleRow.style.display = onboarding || !opts.title ? "none" : "flex";
    if (onboarding) {
      this._onboardingComponent.element.style.display = "";
      this._feedbackDialogComponent.element.style.display = "none";
      this._inputBoxContainer.style.display = "none";
      this._transcriptComponent.element.style.display = "none";
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "none";
      this._inputBoxToolbar.style.display = "none";
      this._onboardingComponent.update({
        pttKeyLabel: this._pttKeyLabel.read(reader),
        isConnecting: this._onboardingPendingConnect.read(reader) || isConnecting || isReconnecting,
        onGetStarted: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._dismissOnboarding(true);
        },
        onOpenPttKeySettings: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPttKeySettings();
        },
        onOpenPopout: this.callbacks.openPopout ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPopout?.();
        } : void 0
      });
      return;
    }
    this._onboardingComponent.element.style.display = "none";
    const feedbackState = this._feedbackDialogState.read(reader);
    if (feedbackState) {
      this._feedbackDialogComponent.element.style.display = "";
      this._feedbackDialogComponent.update({
        onSubmit: (text) => this._submitFeedback(text),
        onCancel: () => {
          this._feedbackDialogState.set(null, void 0);
        }
      }, feedbackState);
      this._inputBoxContainer.style.display = "none";
      this._transcriptComponent.element.style.display = "none";
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "none";
      this._inputBoxToolbar.style.display = "none";
      return;
    }
    this._feedbackDialogComponent.element.style.display = "none";
    this._inputBoxContainer.style.display = voiceControlsSuppressed ? "none" : "flex";
    const transcriptTurns = this._transcriptTurns.read(reader);
    const hasTranscript = transcriptTurns.some((t) => t.text.length > 0 || t.speaker === "user" && t.isPartial);
    const shouldShowInputGlow = !voiceControlsSuppressed && showConnected && (voiceState === "listening" || voiceState === "speaking");
    if (!shouldShowInputGlow) {
      this._glowController?.clear();
    }
    this._inputBoxContainer.classList.toggle("processing", !voiceControlsSuppressed && voiceState === "processing");
    if (hasTranscript) {
      if (showExpanded) {
        this._transcriptComponent.element.style.display = "";
        this._transcriptComponent.element.style.padding = "8px 12px";
        this._transcriptComponent.element.style.borderBottom = "1px solid var(--vscode-widget-border, var(--vscode-input-border, transparent))";
        this._transcriptComponent.update({ turns: transcriptTurns, chatStyle: true });
        this._inputBoxPlaceholder.style.display = "none";
        this._inputBoxTranscriptComponent.element.style.display = "none";
      } else {
        this._inputBoxPlaceholder.style.display = "none";
        this._transcriptComponent.element.style.display = "none";
        this._transcriptComponent.element.style.padding = "";
        this._transcriptComponent.element.style.borderBottom = "";
        this._inputBoxTranscriptComponent.element.style.display = "";
        this._inputBoxTranscriptComponent.update({ turns: transcriptTurns, chatStyle: true, scrollToTop: true });
      }
    } else {
      this._inputBoxPlaceholder.style.display = "";
      this._inputBoxTranscriptComponent.element.style.display = "none";
      this._transcriptComponent.element.style.display = "none";
      const keyLabel2 = this._pttKeyLabel.read(reader);
      if (isReconnecting) {
        this._inputBoxPlaceholder.textContent = this._statusText.read(reader) || localize("agentsVoice.reconnecting", "Reconnecting...");
      } else if (isConnecting) {
        this._inputBoxPlaceholder.textContent = localize("agentsVoice.connecting", "Connecting...");
      } else if (isConnected && voiceState === "listening") {
        this._inputBoxPlaceholder.textContent = localize("agentsVoice.listening", "Listening");
      } else if (isConnected && voiceState === "speaking") {
        this._inputBoxPlaceholder.textContent = keyLabel2 ? localize("agentsVoice.pressToBargeIn", "Speak or use {0}", keyLabel2) : localize("agentsVoice.speakToBargeIn", "Speak to barge in");
      } else if (isConnected) {
        this._inputBoxPlaceholder.textContent = keyLabel2 ? localize("agentsVoice.holdToTalkOrBargeIn", "Hold {0} to talk or barge in", keyLabel2) : localize("agentsVoice.holdMicToTalkOrBargeIn", "Hold the mic to talk or barge in");
      } else if (keyLabel2) {
        this._inputBoxPlaceholder.textContent = localize("agentsVoice.holdToTalk", "Hold {0} to talk", keyLabel2);
      } else {
        this._inputBoxPlaceholder.textContent = localize("agentsVoice.clickMicToTalk", "Click voice mode to talk");
      }
    }
    if (isReconnecting || isConnecting) {
      this._inputBoxPlaceholder.style.display = "";
      this._inputBoxPlaceholder.textContent = isReconnecting ? this._statusText.read(reader) || localize("agentsVoice.reconnecting", "Reconnecting...") : localize("agentsVoice.connecting", "Connecting...");
    }
    if (!showExpanded) {
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "none";
    } else {
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "";
      this._sessionListWrapper.style.maxHeight = "200px";
      this._sessionListWrapper.style.overflowY = "auto";
      this._sessionListWrapper.style.scrollbarWidth = "none";
      this._sessionListComponent.update({
        sessions: this._sessions.read(reader),
        groups: this._sessionGroups.read(reader),
        selectedTarget: this._selectedTargetSession.read(reader),
        onOpenSession: (r) => this.callbacks.openSession(r),
        onStopSession: (r) => this.callbacks.stopSession(r),
        onCancelSession: (r) => this.callbacks.cancelSession(r),
        onSelectTarget: (r) => {
          this._selectedTargetSession.set(r, void 0);
          this.callbacks.selectTargetSession(r);
        },
        onNewSession: () => this.callbacks.newSessionAsTarget()
      });
    }
    this._inputBoxToolbar.style.display = "flex";
    this._inputBoxMicBtn.style.display = voiceControlsSuppressed ? "none" : "";
    const keyLabel = this._pttKeyLabel.read(reader);
    const micTooltip = keyLabel ? localize("agentsVoice.pushToTalkKey", "Push to talk ({0})", keyLabel) : localize("agentsVoice.pushToTalk", "Push to talk");
    this._inputBoxMicBtn.title = micTooltip;
    this._inputBoxMicBtn.ariaLabel = micTooltip;
    const micColor = voiceState === "error" ? "var(--vscode-editorError-foreground)" : voiceState === "listening" ? "var(--vscode-editorInfo-foreground)" : voiceState === "speaking" ? "var(--vscode-agentsVoice-speakingForeground)" : "var(--vscode-descriptionForeground)";
    this._inputBoxMicBtn.style.color = micColor;
    const micIsActive = voiceState === "listening" || voiceState === "speaking";
    this._inputBoxMicBtn.classList.toggle("agents-voice-mode-active", micIsActive);
    this._inputBoxMicBtn.style.setProperty("--agents-voice-input-icon-rgb", voiceState === "speaking" ? "163,113,247" : "88,166,255");
    this._inputBoxMicBtn.style.borderRadius = "50%";
    if (!micIsActive) {
      this._inputBoxMicBtn.style.boxShadow = "none";
    }
    this._inputBoxMicBtn.onmousedown = (e) => {
      if (isSecondaryPointerGesture(e)) {
        return;
      }
      e.preventDefault();
      this.callbacks.pttDown();
    };
    this._inputBoxMicBtn.onmouseup = (e) => {
      if (isSecondaryPointerGesture(e)) {
        return;
      }
      this.callbacks.pttUp();
    };
    this._inputBoxConnIndicator.style.display = !voiceControlsSuppressed && showConnected ? "" : "none";
    this._inputBoxConnIndicator.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.disconnect();
    };
    this._inputBoxFeedbackBtn.style.display = voiceControlsSuppressed ? "none" : "";
    this._inputBoxFeedbackBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._toggleFeedbackDialog();
    };
    this._inputBoxSessionsBtn.style.display = "";
    this._inputBoxSessionsBtn.className = `codicon codicon-${showExpanded ? "chevron-up" : "list-tree"}`;
    this._inputBoxSessionsBtn.title = showExpanded ? localize("agentsVoice.collapseSessions", "Collapse sessions") : localize("agentsVoice.sessions", "Sessions");
    this._inputBoxCloseBtn.style.display = opts.showClose ? "" : "none";
    this._inputBoxCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.closeWindow();
    };
  }
  _updateDOMClassicLayout(reader) {
    const onboarding = this._showOnboarding.read(reader);
    const voiceState = this._voiceState.read(reader);
    const opts = this._options;
    const showExpanded = this._shouldShowExpanded.read(reader) && opts.showExpandChevron;
    this._titleRow.style.display = onboarding || !opts.title ? "none" : "flex";
    if (onboarding && !this._isReconnecting.read(reader)) {
      this._onboardingComponent.element.style.display = "";
      this._headerComponent.element.style.display = "none";
      this._voiceBarComponent.element.style.display = "none";
      this._feedbackDialogComponent.element.style.display = "none";
      this._statusTextDiv.style.display = "none";
      this._transcriptComponent.element.style.display = "none";
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "none";
      this._expandSpacer.style.display = "none";
      this._chevronWrapper.style.display = "none";
      this._onboardingComponent.update({
        pttKeyLabel: this._pttKeyLabel.read(reader),
        isConnecting: this._onboardingPendingConnect.read(reader) || this._isConnecting.read(reader),
        onGetStarted: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._dismissOnboarding(true);
        },
        onOpenPttKeySettings: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPttKeySettings();
        },
        onOpenPopout: this.callbacks.openPopout ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPopout?.();
        } : void 0
      });
    } else {
      this._onboardingComponent.element.style.display = "none";
      this._headerComponent.element.style.display = "";
      const feedbackState = this._feedbackDialogState.read(reader);
      this._headerComponent.update({
        copilotIconSrc: this.callbacks.copilotIconSrc,
        showCopilotIcon: opts.showCopilotIcon,
        isConnected: this._isConnected.read(reader),
        isConnecting: this._isConnecting.read(reader),
        isReconnecting: this._isReconnecting.read(reader),
        voiceState,
        draggable: opts.draggable,
        showClose: opts.showClose,
        showPopout: !!this.callbacks.openPopout && this._popoutAvailable.read(reader),
        hideDisconnect: this.callbacks.hideDisconnect,
        centerConnectButton: opts.centerConnectButton,
        onMicDown: (e) => {
          e.preventDefault();
          this.callbacks.pttDown();
        },
        onMicUp: () => {
          this.callbacks.pttUp();
        },
        onConnectClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this._isConnecting.get()) {
            return;
          }
          if (this._isConnected.get()) {
            this.callbacks.disconnect();
          } else {
            this.callbacks.connect();
          }
        },
        onDisconnectClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.disconnect();
        },
        onCloseClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.closeWindow();
        },
        onToggleClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._expanded.set(!this._expanded.get(), void 0);
        },
        onMicContextMenu: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.showVoiceContextMenu(e);
        },
        onPopoutClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPopout?.();
        },
        onFeedbackClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._toggleFeedbackDialog();
        },
        pttKeyLabel: this._pttKeyLabel.read(reader),
        expanded: showExpanded
      });
      if (feedbackState) {
        this._voiceBarComponent.element.style.display = "none";
        this._feedbackDialogComponent.element.style.display = "";
        this._feedbackDialogComponent.update({
          onSubmit: (text) => this._submitFeedback(text),
          onCancel: () => {
            this._feedbackDialogState.set(null, void 0);
          }
        }, feedbackState);
        this._statusTextDiv.style.display = "none";
        this._transcriptComponent.element.style.display = "none";
        this._statusRowsComponent.element.style.display = "none";
        this._sessionListWrapper.style.display = "none";
        this._expandSpacer.style.display = "none";
        this._chevronWrapper.style.display = "none";
      } else {
        this._feedbackDialogComponent.element.style.display = "none";
        this._voiceBarComponent.update({
          voiceState,
          speakingSessionLabel: this._speakingSessionLabel.read(reader),
          speakingSession: this._speakingSession.read(reader),
          onStopSpeech: () => this.callbacks.stopPlayback()
        });
        const statusText = this._statusText.read(reader);
        const isError = voiceState === "error";
        if ((opts.showStatusText || isError) && statusText) {
          this._statusTextDiv.style.display = "";
          this._statusTextDiv.textContent = statusText;
          this._statusTextDiv.style.color = isError ? "var(--vscode-editorError-foreground)" : "var(--vscode-foreground)";
        } else {
          this._statusTextDiv.style.display = "none";
        }
        this._transcriptComponent.update({ turns: this._transcriptTurns.read(reader) });
        if (!showExpanded) {
          this._statusRowsComponent.element.style.display = "";
          this._statusRowsComponent.update({
            workingCount: this._workingCount.read(reader),
            needsInputCount: this._needsInputCount.read(reader),
            doneCount: this._doneCount.read(reader),
            showCounters: opts.showStatusCounters,
            speakingSessionLabel: this._speakingSessionLabel.read(reader),
            speakingSessionResource: this._speakingSession.read(reader),
            pendingToolConfirmations: this._pendingToolConfirmations.read(reader),
            onOpenSession: (r) => this.callbacks.openSession(r)
          });
          this._sessionListWrapper.style.display = "none";
        } else {
          this._statusRowsComponent.element.style.display = "none";
          this._sessionListWrapper.style.display = "";
          this._sessionListComponent.update({
            sessions: this._sessions.read(reader),
            groups: this._sessionGroups.read(reader),
            selectedTarget: this._selectedTargetSession.read(reader),
            onOpenSession: (r) => this.callbacks.openSession(r),
            onStopSession: (r) => this.callbacks.stopSession(r),
            onCancelSession: (r) => this.callbacks.cancelSession(r),
            onSelectTarget: (r) => {
              this._selectedTargetSession.set(r, void 0);
              this.callbacks.selectTargetSession(r);
            },
            onNewSession: () => this.callbacks.newSessionAsTarget()
          });
        }
        this._expandSpacer.style.display = "";
        this._chevronWrapper.style.display = opts.showExpandChevron ? "flex" : "none";
        this._chevronWrapper.title = showExpanded ? "Collapse sessions" : "Expand sessions";
        this._chevronIcon.className = `codicon codicon-${showExpanded ? "chevron-up" : "chevron-down"}`;
      }
    }
  }
  // --- Public state setters (called by the service) ---
  setConnected(connected) {
    this._isConnected.set(connected, void 0);
  }
  setConnecting(connecting) {
    this._isConnecting.set(connecting, void 0);
  }
  setReconnecting(reconnecting) {
    this._isReconnecting.set(reconnecting, void 0);
  }
  setVoiceState(state) {
    this._voiceState.set(state, void 0);
  }
  setStatusCounts(working, needsInput, done) {
    this._workingCount.set(working, void 0);
    this._needsInputCount.set(needsInput, void 0);
    this._doneCount.set(done, void 0);
  }
  setPendingToolConfirmations(confirmations) {
    this._pendingToolConfirmations.set(confirmations, void 0);
  }
  setSpeakingSession(session, label) {
    this._speakingSession.set(session, void 0);
    this._speakingSessionLabel.set(label, void 0);
  }
  setSessions(sessions) {
    this._sessions.set(sessions, void 0);
  }
  setSelectedTargetSession(resource) {
    this._selectedTargetSession.set(resource, void 0);
  }
  setSessionGroups(groups) {
    this._sessionGroups.set(groups, void 0);
  }
  setPttKeyLabel(label) {
    this._pttKeyLabel.set(label, void 0);
  }
  setTranscriptTurns(turns) {
    this._transcriptTurns.set(turns, void 0);
  }
  setStatusText(text) {
    this._statusText.set(text, void 0);
  }
  setVoiceControlsSuppressed(suppressed) {
    this._voiceControlsSuppressed.set(suppressed, void 0);
  }
  setPopoutAvailable(available) {
    this._popoutAvailable.set(available, void 0);
  }
  // --- Feedback dialog ---
  _toggleFeedbackDialog() {
    if (this._feedbackDialogState.get()) {
      this._feedbackDialogState.set(null, void 0);
    } else {
      this._showOnboarding.set(false, void 0);
      this._feedbackDialogState.set({ isSubmitting: false, submitted: false }, void 0);
    }
  }
  // --- Onboarding ---
  _dismissOnboarding(connect = false) {
    if (connect) {
      if (this._isConnected.get()) {
        this._showOnboarding.set(false, void 0);
        this.callbacks.onOnboardingCompleted?.();
        return;
      }
      if (!this._isConnecting.get() && !this._onboardingPendingConnect.get()) {
        this._onboardingPendingConnect.set(true, void 0);
        this.callbacks.connect();
      }
    } else {
      this._showOnboarding.set(false, void 0);
      this.callbacks.onOnboardingCompleted?.();
    }
  }
  /**
   * Externally trigger onboarding dismissal (e.g. when the user connects
   * from the floating mini-view, the main panel should drop the onboarding).
   * Also clears any in-flight pending-connect state so a later success
   * doesn't re-trigger the completion callback.
   */
  dismissOnboarding() {
    this._onboardingPendingConnect.set(false, void 0);
    if (this._showOnboarding.get()) {
      this._showOnboarding.set(false, void 0);
    }
  }
  _submitFeedback(text) {
    this._feedbackDialogState.set({ isSubmitting: true, submitted: false }, void 0);
    this.callbacks.submitFeedback(text).then((result) => {
      if (result.ok) {
        this._feedbackDialogState.set({ isSubmitting: false, submitted: true }, void 0);
        setTimeout(() => {
          this._feedbackDialogState.set(null, void 0);
        }, 3e3);
      } else {
        this._feedbackDialogState.set({ isSubmitting: false, submitted: false, error: result.error ?? localize("agentsVoice.feedbackError", "Failed to submit") }, void 0);
      }
    });
  }
  _startWaveformAnimation() {
    if (this._animationFrameId !== void 0) {
      return;
    }
    const animate = () => {
      this._animationFrameId = getWindow(this.container).requestAnimationFrame(animate);
      const onboarding = this._showOnboarding.get();
      const voiceState = this._voiceState.get();
      if (!(onboarding || voiceState === "listening" || voiceState === "speaking")) {
        return;
      }
      const analyser = this.callbacks.getAnalyserNode();
      let intensity;
      if (onboarding) {
        intensity = 0.6;
      } else if (!analyser) {
        intensity = 0.3;
      } else {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        intensity = Math.min(1, sum / dataArray.length / 80);
      }
      if (this._glowController && (voiceState === "listening" || voiceState === "speaking")) {
        this._glowController.render(voiceState, intensity, this.callbacks.isMotionReduced());
      }
      const colors = this.callbacks.getGlowColors();
      if (this._inputBoxMicBtn) {
        const iconGlowActive = voiceState === "listening" || voiceState === "speaking";
        this._inputBoxMicBtn.style.boxShadow = iconGlowActive ? computeVoiceMicGlowBoxShadow(voiceState, intensity, colors) : "none";
      }
      this._glowDiv.style.display = "";
      const baseOpacity = 0.15 + intensity * 0.4;
      const { r, g, b } = voiceGlowStateColor(onboarding ? "speaking" : voiceState, colors).rgba;
      const rgb = `${r},${g},${b}`;
      this._glowDiv.style.background = `radial-gradient(ellipse 40% 70% at 50% 0%, rgba(${rgb},${baseOpacity}) 0%, transparent 100%), radial-gradient(ellipse 70% 100% at 50% 0%, rgba(${rgb},${baseOpacity * 0.4}) 0%, transparent 100%)`;
    };
    this._animationFrameId = getWindow(this.container).requestAnimationFrame(animate);
  }
  _stopWaveformAnimation() {
    if (this._animationFrameId !== void 0) {
      getWindow(this.container).cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = void 0;
    }
    this._glowDiv.style.display = "none";
    this._glowController?.clear();
    if (this._inputBoxMicBtn) {
      this._inputBoxMicBtn.style.boxShadow = "none";
    }
  }
}
function _isTextInput(target) {
  if (!target || typeof target.tagName !== "string") {
    return false;
  }
  const el = target;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") {
    return true;
  }
  return el.isContentEditable === true;
}
export {
  AgentsVoiceWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFnZW50c1ZvaWNlXFxicm93c2VyXFxhZ2VudHNWb2ljZVdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSwgZGVyaXZlZCwgYXV0b3J1biwgdHlwZSBJU2V0dGFibGVPYnNlcnZhYmxlLCB0eXBlIElSZWFkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFHRU5UU19WT0lDRV9XSU5ET1dfREVGQVVMVF9XSURUSCwgQUdFTlRTX1ZPSUNFX1dJTkRPV19ERUZBVUxUX0hFSUdIVCB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVIZWFkZXIgfSBmcm9tICcuL2NvbXBvbmVudHMvaGVhZGVyQ29tcG9uZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0YXR1c1Jvd3MgfSBmcm9tICcuL2NvbXBvbmVudHMvc3RhdHVzUm93c0NvbXBvbmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUcmFuc2NyaXB0IH0gZnJvbSAnLi9jb21wb25lbnRzL3RyYW5zY3JpcHRDb21wb25lbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2Vzc2lvbkxpc3QsIHR5cGUgU2Vzc2lvblJvd0RhdGEsIHR5cGUgU2Vzc2lvbkdyb3VwRGF0YSB9IGZyb20gJy4vY29tcG9uZW50cy9zZXNzaW9uTGlzdENvbXBvbmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVGZWVkYmFja0RpYWxvZywgdHlwZSBGZWVkYmFja0RpYWxvZ1N0YXRlIH0gZnJvbSAnLi9jb21wb25lbnRzL2ZlZWRiYWNrRGlhbG9nLmpzJztcbmltcG9ydCB7IGNyZWF0ZU9uYm9hcmRpbmcgfSBmcm9tICcuL2NvbXBvbmVudHMvb25ib2FyZGluZ0NvbXBvbmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVWb2ljZUJhciB9IGZyb20gJy4vY29tcG9uZW50cy92b2ljZUJhckNvbXBvbmVudC5qcyc7XG5pbXBvcnQgeyBGT05UX1NJWkUsIGFkZEtleWJvYXJkQWN0aXZhdGlvbiwgaXNTZWNvbmRhcnlQb2ludGVyR2VzdHVyZSB9IGZyb20gJy4vY29tcG9uZW50cy90b2tlbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBWb2ljZVN0YXRlLCBJUGVuZGluZ1Rvb2xDb25maXJtYXRpb24sIElUcmFuc2NyaXB0VHVybiB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IGNvbXB1dGVWb2ljZU1pY0dsb3dCb3hTaGFkb3csIElWb2ljZUdsb3dDb2xvcnMsIHZvaWNlR2xvd1N0YXRlQ29sb3IgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VHbG93LmpzJztcbmltcG9ydCB7IGNyZWF0ZVZvaWNlR2xvd0NvbnRyb2xsZXIsIEdsb3dUaGVtZUtpbmQsIElWb2ljZUdsb3dDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlR2xvd0NvbnRyb2xsZXIuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZvaWNlV2lkZ2V0Q2FsbGJhY2tzIHtcblx0cmVhZG9ubHkgY29waWxvdEljb25TcmM6IHN0cmluZztcblx0cmVhZG9ubHkgaGlkZURpc2Nvbm5lY3Q6IGJvb2xlYW47XG5cdGNvbm5lY3QoKTogdm9pZDtcblx0ZGlzY29ubmVjdCgpOiB2b2lkO1xuXHRwdHREb3duKCk6IHZvaWQ7XG5cdHB0dFVwKCk6IHZvaWQ7XG5cdGNsb3NlV2luZG93KCk6IHZvaWQ7XG5cdHN0b3BQbGF5YmFjaygpOiB2b2lkO1xuXHRvcGVuU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogdm9pZDtcblx0c3RvcFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IHZvaWQ7XG5cdGNhbmNlbFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IHZvaWQ7XG5cdC8qKiBTZWxlY3QgYSBzZXNzaW9uIGFzIHRoZSB0cmFuc2NyaXB0aW9uIHRhcmdldC4gKi9cblx0c2VsZWN0VGFyZ2V0U2Vzc2lvbihyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogdm9pZDtcblx0LyoqIENyZWF0ZSBhIG5ldyBzZXNzaW9uIGFuZCBzZXQgaXQgYXMgdHJhbnNjcmlwdGlvbiB0YXJnZXQuICovXG5cdG5ld1Nlc3Npb25Bc1RhcmdldCgpOiB2b2lkO1xuXHRnZXRBbmFseXNlck5vZGUoKTogQW5hbHlzZXJOb2RlIHwgbnVsbDtcblx0b25SZXNpemUoKTogdm9pZDtcblx0b3BlblB0dEtleVNldHRpbmdzKCk6IHZvaWQ7XG5cdC8qKlxuXHQgKiBTaG93IHRoZSBWb2ljZSBNb2RlIGNvbnRleHQgbWVudSAoQ29uZmlndXJlLCBTZWxlY3QgTWljcm9waG9uZSwgRGlzYWJsZVxuXHQgKiBWb2ljZSBNb2RlKSBhbmNob3JlZCBhdCB0aGUgdHJpZ2dlcmluZyBldmVudC4gV2lyZWQgdG8gYSByaWdodC1jbGljayAvXG5cdCAqIGNvbnRleHQtbWVudSBnZXN0dXJlIG9uIHRoZSB2b2ljZSBtb2RlIG1pYyBpY29uLlxuXHQgKi9cblx0c2hvd1ZvaWNlQ29udGV4dE1lbnUoZTogTW91c2VFdmVudCk6IHZvaWQ7XG5cdC8qKiBPcHRpb25hbCBcdTIwMTQgd2hlbiBwcm92aWRlZCwgaGVhZGVyIHJlbmRlcnMgYSBcInBvcG91dFwiIGJ1dHRvbi4gKi9cblx0b3BlblBvcG91dD8oKTogdm9pZDtcblx0LyoqIFN1Ym1pdCB1c2VyIGZlZWRiYWNrLiBSZXR1cm5zIHN1Y2Nlc3MvZmFpbHVyZS4gKi9cblx0c3VibWl0RmVlZGJhY2soZmVlZGJhY2tUZXh0OiBzdHJpbmcpOiBQcm9taXNlPHsgb2s6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0+O1xuXHQvKiogQ2FsbGVkIHdoZW4gdGhlIHVzZXIgZGlzbWlzc2VzIHRoZSBvbmJvYXJkaW5nIGNhcmQuICovXG5cdG9uT25ib2FyZGluZ0NvbXBsZXRlZD8oKTogdm9pZDtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIFx1MjAxNCB3aGVuIHByb3ZpZGVkLCB0aGUgZXhwYW5kIGNoZXZyb24gb3BlbnMgdGhpcyBwaWNrZXIgaW5zdGVhZCBvZlxuXHQgKiB0aGUgaW5saW5lIHNlc3Npb24gbGlzdC4gVXNlZCBieSB0aGUgZmxvYXRpbmcgd2luZG93IHRvIHNob3cgdGhlIGFnZW50XG5cdCAqIHNlc3Npb25zIHF1aWNrcGljayB3aXRoIGEgXCJzZXQgYXMgdm9pY2UgdGFyZ2V0XCIgYWN0aW9uLlxuXHQgKi9cblx0c2hvd1Nlc3Npb25zUGlja2VyPygpOiB2b2lkO1xuXHQvKiogQWN0aXZlIHRoZW1lIGtpbmQsIGZvciB0aGUgYW1iaWVudCB2b2ljZSBnbG93LiAqL1xuXHRnZXRHbG93VGhlbWUoKTogR2xvd1RoZW1lS2luZDtcblx0LyoqIFRoZW1lLWRlcml2ZWQgcGVyLXN0YXRlIGFjY2VudHMgZm9yIHRoZSBhbWJpZW50IHZvaWNlIGdsb3cuICovXG5cdGdldEdsb3dDb2xvcnMoKTogSVZvaWNlR2xvd0NvbG9ycztcblx0LyoqIFdoZXRoZXIgdGhlIHVzZXIgaGFzIGFza2VkIGZvciByZWR1Y2VkIG1vdGlvbi4gKi9cblx0aXNNb3Rpb25SZWR1Y2VkKCk6IGJvb2xlYW47XG5cdC8qKiBGaXJlcyB3aGVuIHRoZSBjb2xvciB0aGVtZSBjaGFuZ2VzLCBzbyB0aGUgZ2xvdyBjYW4gcmUtZGVyaXZlIGl0cyBhY2NlbnRzLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdsb3dUaGVtZTogRXZlbnQ8dm9pZD47XG59XG5cbi8qKlxuICogSG9zdC1jb25maWd1cmF0aW9uIGZvciB0aGUgd2lkZ2V0LiBEZWZhdWx0cyBtYXRjaCB0aGUgZmxvYXRpbmcgYXV4LXdpbmRvd1xuICogKHRoZSBvcmlnaW5hbCBjb25zdW1lcik7IHRoZSBjaGF0Vmlld1BhbmUgdm9pY2UgYmFyIG92ZXJyaWRlcyBldmVyeXRoaW5nLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFZvaWNlV2lkZ2V0T3B0aW9ucyB7XG5cdC8qKiBGaXhlZCBwaXhlbCB3aWR0aCAobGVnYWN5IGF1eC13aW5kb3cgYmVoYXZpb3IpIG9yIGAnYXV0bydgIHRvIGZsb3cuICovXG5cdHJlYWRvbmx5IHdpZHRoPzogbnVtYmVyIHwgJ2F1dG8nO1xuXHQvKiogV2hldGhlciB0aGUgaGVhZGVyIGlzIGEgZHJhZyBoYW5kbGUgKGF1eCB3aW5kb3cgb25seSkuICovXG5cdHJlYWRvbmx5IGRyYWdnYWJsZT86IGJvb2xlYW47XG5cdC8qKiBTaG93IHRoZSBjbG9zZSBYIGluIHRoZSBoZWFkZXIuICovXG5cdHJlYWRvbmx5IHNob3dDbG9zZT86IGJvb2xlYW47XG5cdC8qKiBTaG93IHRoZSBleHBhbmQvY29sbGFwc2UgY2hldnJvbiArIHNlc3Npb24gbGlzdC4gKi9cblx0cmVhZG9ubHkgc2hvd0V4cGFuZENoZXZyb24/OiBib29sZWFuO1xuXHQvKiogU2hvdyB0aGUgY2VudGVyZWQgXCJUYXAgdG8gc3RhcnQgLyBMaXN0ZW5pbmcgLyBTcGVha2luZ1wiIHN0YXR1cyBsYWJlbC4gKi9cblx0cmVhZG9ubHkgc2hvd1N0YXR1c1RleHQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyB0aGUgd29ya2luZy9uZWVkcy1pbnB1dC9kb25lIGNvdW50ZXIgcm93cyBhbmQgdGhlIFwiTm8gYWN0aXZlIHNlc3Npb25zXCJcblx0ICogcGxhY2Vob2xkZXIuIFRoZSBzcGVha2luZy1zZXNzaW9uIHBpbGwgYW5kIHRvb2wgY29uZmlybWF0aW9ucyByZW1haW5cblx0ICogdmlzaWJsZSByZWdhcmRsZXNzLCBzaW5jZSB0aGV5IGFyZSBpbXBvcnRhbnQgaW50ZXJhY3RpdmUgY29udGV4dC5cblx0ICovXG5cdHJlYWRvbmx5IHNob3dTdGF0dXNDb3VudGVycz86IGJvb2xlYW47XG5cdC8qKiBTaG93IHRoZSBjb3BpbG90IGljb24gYXQgdGhlIHN0YXJ0IG9mIHRoZSBoZWFkZXIuICovXG5cdHJlYWRvbmx5IHNob3dDb3BpbG90SWNvbj86IGJvb2xlYW47XG5cdC8qKiBDZW50ZXIgdGhlIENvbm5lY3QgYnV0dG9uIGhvcml6b250YWxseSBpbnN0ZWFkIG9mIHB1c2hpbmcgaXQgdG8gdGhlIHJpZ2h0LiAqL1xuXHRyZWFkb25seSBjZW50ZXJDb25uZWN0QnV0dG9uPzogYm9vbGVhbjtcblx0LyoqIE9wdGlvbmFsIHRpdGxlIHJlbmRlcmVkIGFib3ZlIHRoZSBoZWFkZXIgcm93IChlLmcuIFwiVk9JQ0UgQ0hBVFwiKS4gKi9cblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG5cdC8qKiBPcHRpb25hbCBzdWJ0aXRsZSByZW5kZXJlZCBuZXh0IHRvIHRoZSB0aXRsZS4gKi9cblx0cmVhZG9ubHkgc3VidGl0bGU/OiBzdHJpbmc7XG5cdC8qKiBTZXQgdGFiSW5kZXg9MCBvbiB0aGUgd2lkZ2V0IHJvb3QgYW5kIHdpcmUgU3BhY2Uta2V5IFBUVC4gKi9cblx0cmVhZG9ubHkgZm9jdXNhYmxlPzogYm9vbGVhbjtcblx0LyoqIFdoZXRoZXIgdG8gc2hvdyB0aGUgb25ib2FyZGluZyBjYXJkIChmaXJzdC10aW1lIGV4cGVyaWVuY2UpLiAqL1xuXHRyZWFkb25seSBzaG93T25ib2FyZGluZz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGVuIHRydWUsIHRoZSBvbmJvYXJkaW5nIGNhcmQgcmUtYXBwZWFycyBldmVyeSB0aW1lIHRoZSB3aWRnZXQgZW50ZXJzXG5cdCAqIGEgZnVsbHktZGlzY29ubmVjdGVkIHN0YXRlIChpLmUuIG5vdCBjb25uZWN0ZWQsIG5vdCBjb25uZWN0aW5nLCBhbmQgbm90XG5cdCAqIGF1dG8tcmVjb25uZWN0aW5nKS4gV2hlbiBmYWxzZSAoZGVmYXVsdCksIG9uYm9hcmRpbmcgZm9sbG93cyB0aGUgbGVnYWN5XG5cdCAqIGZpcnN0LXRpbWUtb25seSBiZWhhdmlvciBnYXRlZCBieSBgYHNob3dPbmJvYXJkaW5nYGAgKyBtYW51YWwgZGlzbWlzcy5cblx0ICovXG5cdHJlYWRvbmx5IHJlc2hvd09uYm9hcmRpbmdPbkRpc2Nvbm5lY3Q/OiBib29sZWFuO1xuXHQvKipcblx0ICogSW5pdGlhbCBleHBhbmRlZCBzdGF0ZSBvZiB0aGUgd2lkZ2V0IFx1MjAxNCB3aGVuIHRydWUgdGhlIHNlc3Npb24gbGlzdCBhbmRcblx0ICogZXhwYW5kZWQgc2Vzc2lvbiBkZXRhaWxzIGFyZSBzaG93biBieSBkZWZhdWx0LiBEZWZhdWx0cyB0byBmYWxzZVxuXHQgKiAoY29sbGFwc2VkKSB0byBtYXRjaCB0aGUgbGVnYWN5IGZsb2F0aW5nIGF1eC13aW5kb3cgYmVoYXZpb3IuXG5cdCAqL1xuXHRyZWFkb25seSBkZWZhdWx0RXhwYW5kZWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogV2hlbiB0cnVlLCByZW5kZXJzIHRoZSB3aWRnZXQgaW4gYSBjaGF0LWlucHV0LWJveCBzdHlsZSBsYXlvdXQ6XG5cdCAqIGEgcm91bmRlZCBib3JkZXJlZCBjb250YWluZXIgZm9yIHRyYW5zY3JpcHQvcGxhY2Vob2xkZXIgdGV4dCB3aXRoIGFcblx0ICogdG9vbGJhciByb3cgYmVsb3cgZm9yIGFjdGlvbiBpY29ucy4gTWF0Y2hlcyB0aGUgY2hhdCBwYW5lbCBpbnB1dCBib3hcblx0ICogYXBwZWFyYW5jZS5cblx0ICovXG5cdHJlYWRvbmx5IGlucHV0Qm94TGF5b3V0PzogYm9vbGVhbjtcbn1cblxuY29uc3QgREVGQVVMVF9PUFRJT05TOiBSZXF1aXJlZDxWb2ljZVdpZGdldE9wdGlvbnM+ID0ge1xuXHR3aWR0aDogQUdFTlRTX1ZPSUNFX1dJTkRPV19ERUZBVUxUX1dJRFRILFxuXHRkcmFnZ2FibGU6IHRydWUsXG5cdHNob3dDbG9zZTogdHJ1ZSxcblx0c2hvd0V4cGFuZENoZXZyb246IHRydWUsXG5cdHNob3dTdGF0dXNUZXh0OiBmYWxzZSxcblx0c2hvd1N0YXR1c0NvdW50ZXJzOiB0cnVlLFxuXHRzaG93Q29waWxvdEljb246IGZhbHNlLFxuXHRjZW50ZXJDb25uZWN0QnV0dG9uOiBmYWxzZSxcblx0dGl0bGU6ICcnLFxuXHRzdWJ0aXRsZTogJycsXG5cdGZvY3VzYWJsZTogZmFsc2UsXG5cdHNob3dPbmJvYXJkaW5nOiBmYWxzZSxcblx0cmVzaG93T25ib2FyZGluZ09uRGlzY29ubmVjdDogZmFsc2UsXG5cdGRlZmF1bHRFeHBhbmRlZDogZmFsc2UsXG5cdGlucHV0Qm94TGF5b3V0OiBmYWxzZSxcbn07XG5cbmV4cG9ydCBjbGFzcyBBZ2VudHNWb2ljZVdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdC8vIC0tLSBSZWFjdGl2ZSBzdGF0ZSAtLS1cblx0cHJpdmF0ZSByZWFkb25seSBfaXNDb25uZWN0ZWQ6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0Nvbm5lY3Rpbmc6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1JlY29ubmVjdGluZzogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZvaWNlU3RhdGU6IElTZXR0YWJsZU9ic2VydmFibGU8Vm9pY2VTdGF0ZT4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgJ2lkbGUnKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZXhwYW5kZWQ6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nQ291bnQ6IElTZXR0YWJsZU9ic2VydmFibGU8bnVtYmVyPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAwKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbmVlZHNJbnB1dENvdW50OiBJU2V0dGFibGVPYnNlcnZhYmxlPG51bWJlcj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgMCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbmVDb3VudDogSVNldHRhYmxlT2JzZXJ2YWJsZTxudW1iZXI+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIDApO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nVG9vbENvbmZpcm1hdGlvbnM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSVBlbmRpbmdUb29sQ29uZmlybWF0aW9uW10+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIFtdKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3BlYWtpbmdTZXNzaW9uOiBJU2V0dGFibGVPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3BlYWtpbmdTZXNzaW9uTGFiZWw6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBTZXNzaW9uUm93RGF0YVtdPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Hcm91cHM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgU2Vzc2lvbkdyb3VwRGF0YVtdIHwgdW5kZWZpbmVkPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3RlZFRhcmdldFNlc3Npb246IElTZXR0YWJsZU9ic2VydmFibGU8VVJJIHwgdW5kZWZpbmVkPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc2NyaXB0VHVybnM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSVRyYW5zY3JpcHRUdXJuW10+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIFtdKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHR0S2V5TGFiZWw6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXNUZXh0OiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZz4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgJycpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wb3BvdXRBdmFpbGFibGU6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdHJ1ZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZvaWNlQ29udHJvbHNTdXBwcmVzc2VkOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmVlZGJhY2tEaWFsb2dTdGF0ZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxGZWVkYmFja0RpYWxvZ1N0YXRlIHwgbnVsbD4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgbnVsbCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dPbmJvYXJkaW5nOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25ib2FyZGluZ1BlbmRpbmdDb25uZWN0OiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblxuXHQvLyAtLS0gRGVyaXZlZCBzdGF0ZSAtLS1cblx0cHJpdmF0ZSByZWFkb25seSBfc2hvdWxkU2hvd0V4cGFuZGVkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fZXhwYW5kZWQucmVhZChyZWFkZXIpKTtcblxuXHQvLyAtLS0gRE9NIGNvbXBvbmVudHMgLS0tXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hlYWRlckNvbXBvbmVudCA9IGNyZWF0ZUhlYWRlcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbmJvYXJkaW5nQ29tcG9uZW50ID0gY3JlYXRlT25ib2FyZGluZygpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudCA9IGNyZWF0ZUZlZWRiYWNrRGlhbG9nKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZvaWNlQmFyQ29tcG9uZW50ID0gY3JlYXRlVm9pY2VCYXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNjcmlwdENvbXBvbmVudCA9IHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZVRyYW5zY3JpcHQoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0Qm94VHJhbnNjcmlwdENvbXBvbmVudCA9IHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZVRyYW5zY3JpcHQoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1c1Jvd3NDb21wb25lbnQgPSBjcmVhdGVTdGF0dXNSb3dzKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25MaXN0Q29tcG9uZW50ID0gY3JlYXRlU2Vzc2lvbkxpc3QoKTtcblxuXHQvLyAtLS0gU3RhYmxlIERPTSBlbGVtZW50cyAtLS1cblx0cHJpdmF0ZSByZWFkb25seSBfcm9vdERpdjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dsb3dEaXY6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZVJvdzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRlbnREaXY6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXNUZXh0RGl2OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkxpc3RXcmFwcGVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZXhwYW5kU3BhY2VyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hldnJvbldyYXBwZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGV2cm9uSWNvbjogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gLS0tIElucHV0IGJveCBsYXlvdXQgZWxlbWVudHMgKGNyZWF0ZWQgb25seSB3aGVuIGlucHV0Qm94TGF5b3V0PXRydWUpIC0tLVxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnB1dEJveENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0Qm94UGxhY2Vob2xkZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnB1dEJveFRvb2xiYXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnB1dEJveE1pY0J0bjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0Qm94Q29ubkluZGljYXRvcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdC8qKiBBbWJpZW50IHZvaWNlIGdsb3cgb24gdGhlIGlucHV0IGJveCAoaW5wdXQtYm94IGxheW91dCBvbmx5KS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZ2xvd0NvbnRyb2xsZXI6IElWb2ljZUdsb3dDb250cm9sbGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnB1dEJveEZlZWRiYWNrQnRuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRCb3hTZXNzaW9uc0J0bjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0Qm94Q2xvc2VCdG46IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IFJlcXVpcmVkPFZvaWNlV2lkZ2V0T3B0aW9ucz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2FsbGJhY2tzOiBWb2ljZVdpZGdldENhbGxiYWNrcyxcblx0XHRvcHRpb25zOiBWb2ljZVdpZGdldE9wdGlvbnMgPSB7fSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX29wdGlvbnMgPSB7IC4uLkRFRkFVTFRfT1BUSU9OUywgLi4ub3B0aW9ucyB9O1xuXHRcdHRoaXMuX3Nob3dPbmJvYXJkaW5nLnNldCh0aGlzLl9vcHRpb25zLnNob3dPbmJvYXJkaW5nLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2V4cGFuZGVkLnNldCh0aGlzLl9vcHRpb25zLmRlZmF1bHRFeHBhbmRlZCwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEJ1aWxkIHN0YWJsZSBET00gc3RydWN0dXJlXG5cdFx0Y29uc3Qgb3B0cyA9IHRoaXMuX29wdGlvbnM7XG5cdFx0Y29uc3Qgd2lkdGhTdHlsZSA9IG9wdHMud2lkdGggPT09ICdhdXRvJ1xuXHRcdFx0PyAnd2lkdGg6MTAwJTtwb3NpdGlvbjpyZWxhdGl2ZTsnXG5cdFx0XHQ6IGBwb3NpdGlvbjphYnNvbHV0ZTt0b3A6MDtsZWZ0OjA7d2lkdGg6JHtvcHRzLndpZHRofXB4OyR7b3B0cy5pbnB1dEJveExheW91dCA/ICcnIDogYG1pbi1oZWlnaHQ6JHtBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfSEVJR0hUfXB4O2B9YDtcblxuXHRcdHRoaXMuX3Jvb3REaXYgPSBkb20uJCgnZGl2Jyk7XG5cdFx0dGhpcy5fcm9vdERpdi5zdHlsZS5jc3NUZXh0ID0gYCR7d2lkdGhTdHlsZX1kaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO3VzZXItc2VsZWN0Om5vbmU7Zm9udC1mYW1pbHk6aW5oZXJpdDtmb250LXNpemU6JHtGT05UX1NJWkUuYmFzZX07Y29sb3I6dmFyKC0tdnNjb2RlLWZvcmVncm91bmQpO2JveC1zaXppbmc6Ym9yZGVyLWJveDttYXJnaW46MDske29wdHMuaW5wdXRCb3hMYXlvdXQgJiYgb3B0cy5kcmFnZ2FibGUgPyAnLXdlYmtpdC1hcHAtcmVnaW9uOmRyYWc7JyA6ICcnfWA7XG5cblx0XHR0aGlzLl9nbG93RGl2ID0gZG9tLiQoJ2RpdicpO1xuXHRcdHRoaXMuX2dsb3dEaXYuc3R5bGUuY3NzVGV4dCA9ICdwb3NpdGlvbjphYnNvbHV0ZTt0b3A6MDtsZWZ0OjA7cmlnaHQ6MDtoZWlnaHQ6NTBweDtwb2ludGVyLWV2ZW50czpub25lO3otaW5kZXg6MDsnO1xuXG5cdFx0dGhpcy5fdGl0bGVSb3cgPSBkb20uJCgnZGl2Jyk7XG5cdFx0dGhpcy5fdGl0bGVSb3cuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6YmFzZWxpbmU7Z2FwOjZweDtwYWRkaW5nOjhweCAxNHB4IDA7b3ZlcmZsb3c6aGlkZGVuO3doaXRlLXNwYWNlOm5vd3JhcDtwb3NpdGlvbjpyZWxhdGl2ZTt6LWluZGV4OjE7Jztcblx0XHRpZiAob3B0cy50aXRsZSkge1xuXHRcdFx0Y29uc3QgdGl0bGVTcGFuID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRcdHRpdGxlU3Bhbi5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToke0ZPTlRfU0laRS5taWNyb307Zm9udC13ZWlnaHQ6NzAwO2NvbG9yOnZhcigtLXZzY29kZS1zaWRlQmFyU2VjdGlvbkhlYWRlci1mb3JlZ3JvdW5kLCB2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCkpO3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzowLjVweDtmbGV4LXNocmluazowO3VzZXItc2VsZWN0Om5vbmU7YDtcblx0XHRcdHRpdGxlU3Bhbi50ZXh0Q29udGVudCA9IG9wdHMudGl0bGU7XG5cdFx0XHR0aGlzLl90aXRsZVJvdy5hcHBlbmQodGl0bGVTcGFuKTtcblx0XHRcdGlmIChvcHRzLnN1YnRpdGxlKSB7XG5cdFx0XHRcdGNvbnN0IHN1YnRpdGxlU3BhbiA9IGRvbS4kKCdzcGFuJyk7XG5cdFx0XHRcdHN1YnRpdGxlU3Bhbi5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToke0ZPTlRfU0laRS5taWNyb307Zm9udC13ZWlnaHQ6NDAwO2NvbG9yOnZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO2A7XG5cdFx0XHRcdHN1YnRpdGxlU3Bhbi50ZXh0Q29udGVudCA9IG9wdHMuc3VidGl0bGU7XG5cdFx0XHRcdHRoaXMuX3RpdGxlUm93LmFwcGVuZChzdWJ0aXRsZVNwYW4pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRlbnREaXYgPSBkb20uJCgnZGl2Jyk7XG5cdFx0dGhpcy5fY29udGVudERpdi5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47ZmxleDoxO3BhZGRpbmc6OHB4IDE0cHggMnB4O3Bvc2l0aW9uOnJlbGF0aXZlO3otaW5kZXg6MTsnO1xuXG5cdFx0dGhpcy5fc3RhdHVzVGV4dERpdiA9IGRvbS4kKCdkaXYnKTtcblx0XHR0aGlzLl9zdGF0dXNUZXh0RGl2LnN0eWxlLmNzc1RleHQgPSBgdGV4dC1hbGlnbjpjZW50ZXI7Zm9udC1zaXplOiR7Rk9OVF9TSVpFLmJvZHl9O2ZvbnQtd2VpZ2h0OjUwMDtjb2xvcjp2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCk7cGFkZGluZzoycHggMDtgO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyID0gZG9tLiQoJ2RpdicpO1xuXHRcdHRoaXMuX3Nlc3Npb25MaXN0V3JhcHBlci5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47LXdlYmtpdC1hcHAtcmVnaW9uOm5vLWRyYWc7b3ZlcmZsb3c6aGlkZGVuOyc7XG5cdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLmFwcGVuZCh0aGlzLl9zZXNzaW9uTGlzdENvbXBvbmVudC5lbGVtZW50KTtcblxuXHRcdHRoaXMuX2V4cGFuZFNwYWNlciA9IGRvbS4kKCdkaXYnKTtcblx0XHR0aGlzLl9leHBhbmRTcGFjZXIuc3R5bGUuY3NzVGV4dCA9ICdmbGV4OjE7JztcblxuXHRcdHRoaXMuX2NoZXZyb25XcmFwcGVyID0gZG9tLiQoJ2RpdicpO1xuXHRcdHRoaXMuX2NoZXZyb25XcmFwcGVyLnJvbGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLl9jaGV2cm9uV3JhcHBlci50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5fY2hldnJvbldyYXBwZXIuc3R5bGUuY3NzVGV4dCA9ICdkaXNwbGF5OmZsZXg7anVzdGlmeS1jb250ZW50OmNlbnRlcjtjdXJzb3I6cG9pbnRlcjstd2Via2l0LWFwcC1yZWdpb246bm8tZHJhZzsnO1xuXHRcdHRoaXMuX2NoZXZyb25JY29uID0gZG9tLiQoJ3NwYW4uY29kaWNvbicpO1xuXHRcdHRoaXMuX2NoZXZyb25JY29uLnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLmljb25TbX07Y29sb3I6dmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCk7YDtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2NoZXZyb25JY29uLCAnbW91c2VlbnRlcicsICgpID0+IHsgdGhpcy5fY2hldnJvbkljb24uc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJzsgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY2hldnJvbkljb24sICdtb3VzZWxlYXZlJywgKCkgPT4geyB0aGlzLl9jaGV2cm9uSWNvbi5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSc7IH0pKTtcblx0XHR0aGlzLl9jaGV2cm9uV3JhcHBlci5hcHBlbmQodGhpcy5fY2hldnJvbkljb24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY2hldnJvbldyYXBwZXIsICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRpZiAodGhpcy5jYWxsYmFja3Muc2hvd1Nlc3Npb25zUGlja2VyKSB7XG5cdFx0XHRcdHRoaXMuY2FsbGJhY2tzLnNob3dTZXNzaW9uc1BpY2tlcigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZXhwYW5kZWQuc2V0KCF0aGlzLl9leHBhbmRlZC5nZXQoKSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jaGV2cm9uV3JhcHBlciwgJ2tleWRvd24nLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0aGlzLl9jaGV2cm9uV3JhcHBlci5jbGljaygpOyB9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gLS0tIElucHV0IGJveCBsYXlvdXQgZWxlbWVudHMgLS0tXG5cdFx0aWYgKG9wdHMuaW5wdXRCb3hMYXlvdXQpIHtcblx0XHRcdC8vIEluamVjdCBwcm9jZXNzaW5nIGFuaW1hdGlvbiBDU1MgaW50byB0aGUgZG9jdW1lbnQgaGVhZFxuXHRcdFx0Ly8gKEBwcm9wZXJ0eSBtdXN0IGJlIGF0IGRvY3VtZW50IGxldmVsIHRvIHdvcmspXG5cdFx0XHRjb25zdCBzdHlsZUVsID0gZG9tLiQoJ3N0eWxlJyk7XG5cdFx0XHRzdHlsZUVsLnRleHRDb250ZW50ID0gYFxuXHRcdFx0XHRAcHJvcGVydHkgLS12b2ljZS1wcm9jZXNzaW5nLWFuZ2xlIHsgc3ludGF4OiAnPGFuZ2xlPic7IGluaGVyaXRzOiBmYWxzZTsgaW5pdGlhbC12YWx1ZTogMTM1ZGVnOyB9XG5cdFx0XHRcdEBrZXlmcmFtZXMgdm9pY2UtcHJvY2Vzc2luZy1zcGluIHsgZnJvbSB7IC0tdm9pY2UtcHJvY2Vzc2luZy1hbmdsZTogMTM1ZGVnOyB9IHRvIHsgLS12b2ljZS1wcm9jZXNzaW5nLWFuZ2xlOiA0OTVkZWc7IH0gfVxuXHRcdFx0XHRAa2V5ZnJhbWVzIGFnZW50cy12b2ljZS1pbnB1dC1pY29uLXB1bHNlIHtcblx0XHRcdFx0XHQwJSwgMTAwJSB7IGJveC1zaGFkb3c6IDAgMCA0cHggcmdiYSh2YXIoLS1hZ2VudHMtdm9pY2UtaW5wdXQtaWNvbi1yZ2IsIDg4LDE2NiwyNTUpLCAwLjQ1KTsgfVxuXHRcdFx0XHRcdDUwJSB7IGJveC1zaGFkb3c6IDAgMCAxMHB4IHJnYmEodmFyKC0tYWdlbnRzLXZvaWNlLWlucHV0LWljb24tcmdiLCA4OCwxNjYsMjU1KSwgMC43NSk7IH1cblx0XHRcdFx0fVxuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaC5tb25hY28tZW5hYmxlLW1vdGlvbiAuYWdlbnRzLXZvaWNlLW1vZGUtYnV0dG9uLmFnZW50cy12b2ljZS1tb2RlLWFjdGl2ZSB7XG5cdFx0XHRcdFx0YW5pbWF0aW9uOiBhZ2VudHMtdm9pY2UtaW5wdXQtaWNvbi1wdWxzZSAxLjRzIGVhc2UtaW4tb3V0IGluZmluaXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC5wcm9jZXNzaW5nIHsgb3ZlcmZsb3c6IHZpc2libGUgIWltcG9ydGFudDsgfVxuXHRcdFx0XHQucHJvY2Vzc2luZzo6YmVmb3JlIHtcblx0XHRcdFx0XHRjb250ZW50OiAnJzsgcG9zaXRpb246IGFic29sdXRlOyBpbnNldDogLTFweDsgYm9yZGVyLXJhZGl1czogaW5oZXJpdDsgcGFkZGluZzogMXB4O1xuXHRcdFx0XHRcdGJhY2tncm91bmQ6IGNvbmljLWdyYWRpZW50KGZyb20gdmFyKC0tdm9pY2UtcHJvY2Vzc2luZy1hbmdsZSksXG5cdFx0XHRcdFx0XHR0cmFuc3BhcmVudCAwZGVnLCByZ2JhKDg4LDE2NiwyNTUsMC45KSAyMGRlZywgcmdiYSg4OCwxNjYsMjU1LDEpIDMwZGVnLFxuXHRcdFx0XHRcdFx0cmdiYSg4OCwxNjYsMjU1LDAuNikgNTBkZWcsIHRyYW5zcGFyZW50IDkwZGVnLCB0cmFuc3BhcmVudCAzNjBkZWcpO1xuXHRcdFx0XHRcdC13ZWJraXQtbWFzazogbGluZWFyLWdyYWRpZW50KCMwMDAgMCAwKSBjb250ZW50LWJveCwgbGluZWFyLWdyYWRpZW50KCMwMDAgMCAwKTtcblx0XHRcdFx0XHRtYXNrOiBsaW5lYXItZ3JhZGllbnQoIzAwMCAwIDApIGNvbnRlbnQtYm94LCBsaW5lYXItZ3JhZGllbnQoIzAwMCAwIDApO1xuXHRcdFx0XHRcdC13ZWJraXQtbWFzay1jb21wb3NpdGU6IHhvcjsgbWFzay1jb21wb3NpdGU6IGV4Y2x1ZGU7XG5cdFx0XHRcdFx0YW5pbWF0aW9uOiB2b2ljZS1wcm9jZXNzaW5nLXNwaW4gM3MgbGluZWFyIGluZmluaXRlO1xuXHRcdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBub25lOyB6LWluZGV4OiAyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC5wcm9jZXNzaW5nOjphZnRlciB7XG5cdFx0XHRcdFx0Y29udGVudDogJyc7IHBvc2l0aW9uOiBhYnNvbHV0ZTsgaW5zZXQ6IC0xcHg7IGJvcmRlci1yYWRpdXM6IGluaGVyaXQ7IHBhZGRpbmc6IDJweDtcblx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBjb25pYy1ncmFkaWVudChmcm9tIHZhcigtLXZvaWNlLXByb2Nlc3NpbmctYW5nbGUpLFxuXHRcdFx0XHRcdFx0dHJhbnNwYXJlbnQgMGRlZywgcmdiYSg4OCwxNjYsMjU1LDAuNSkgMjVkZWcsIHJnYmEoODgsMTY2LDI1NSwwLjMpIDUwZGVnLCB0cmFuc3BhcmVudCA5MGRlZywgdHJhbnNwYXJlbnQgMzYwZGVnKTtcblx0XHRcdFx0XHQtd2Via2l0LW1hc2s6IGxpbmVhci1ncmFkaWVudCgjMDAwIDAgMCkgY29udGVudC1ib3gsIGxpbmVhci1ncmFkaWVudCgjMDAwIDAgMCk7XG5cdFx0XHRcdFx0bWFzazogbGluZWFyLWdyYWRpZW50KCMwMDAgMCAwKSBjb250ZW50LWJveCwgbGluZWFyLWdyYWRpZW50KCMwMDAgMCAwKTtcblx0XHRcdFx0XHQtd2Via2l0LW1hc2stY29tcG9zaXRlOiB4b3I7IG1hc2stY29tcG9zaXRlOiBleGNsdWRlO1xuXHRcdFx0XHRcdGZpbHRlcjogYmx1cigxLjVweCk7IGFuaW1hdGlvbjogdm9pY2UtcHJvY2Vzc2luZy1zcGluIDNzIGxpbmVhciBpbmZpbml0ZTtcblx0XHRcdFx0XHRwb2ludGVyLWV2ZW50czogbm9uZTsgei1pbmRleDogMTtcblx0XHRcdFx0fVxuXHRcdFx0YDtcblx0XHRcdGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikuZG9jdW1lbnQuaGVhZC5hcHBlbmQoc3R5bGVFbCk7XG5cblx0XHRcdC8vIFJvdW5kZWQgYm9yZGVyZWQgY29udGFpbmVyIGZvciB0cmFuc2NyaXB0L3BsYWNlaG9sZGVyIChtYXRjaGVzIGNoYXQtaW5wdXQtY29udGFpbmVyKVxuXHRcdFx0dGhpcy5faW5wdXRCb3hDb250YWluZXIgPSBkb20uJCgnZGl2Jyk7XG5cdFx0XHR0aGlzLl9pbnB1dEJveENvbnRhaW5lci5zdHlsZS5jc3NUZXh0ID0gJ2JveC1zaXppbmc6Ym9yZGVyLWJveDtiYWNrZ3JvdW5kLWNvbG9yOnZhcigtLXZzY29kZS1pbnB1dC1iYWNrZ3JvdW5kKTtib3JkZXI6MXB4IHNvbGlkIHZhcigtLXZzY29kZS1pbnB1dC1ib3JkZXIsIHRyYW5zcGFyZW50KTtib3JkZXItcmFkaXVzOnZhcigtLXZzY29kZS1jb3JuZXJSYWRpdXMtbGFyZ2UsIDhweCk7cGFkZGluZzoxMHB4IDEycHg7d2lkdGg6MTAwJTtwb3NpdGlvbjpyZWxhdGl2ZTttaW4taGVpZ2h0OjMycHg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjstd2Via2l0LWFwcC1yZWdpb246bm8tZHJhZzsnO1xuXG5cdFx0XHR0aGlzLl9pbnB1dEJveFBsYWNlaG9sZGVyID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRcdHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIuc3R5bGUuY3NzVGV4dCA9IGBmb250LXNpemU6JHtGT05UX1NJWkUuYm9keX07Y29sb3I6dmFyKC0tdnNjb2RlLWlucHV0LXBsYWNlaG9sZGVyRm9yZWdyb3VuZCwgdmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCkpO3VzZXItc2VsZWN0Om5vbmU7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO2ZsZXg6MTtgO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hUcmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0XHR0aGlzLl9pbnB1dEJveFRyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hDb250YWluZXIuYXBwZW5kKHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIsIHRoaXMuX2lucHV0Qm94VHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50KTtcblxuXHRcdFx0dGhpcy5fZ2xvd0NvbnRyb2xsZXIgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVWb2ljZUdsb3dDb250cm9sbGVyKFxuXHRcdFx0XHR0aGlzLl9pbnB1dEJveENvbnRhaW5lcixcblx0XHRcdFx0KCkgPT4gdGhpcy5jYWxsYmFja3MuZ2V0R2xvd1RoZW1lKCksXG5cdFx0XHRcdCgpID0+IHRoaXMuY2FsbGJhY2tzLmdldEdsb3dDb2xvcnMoKSxcblx0XHRcdCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jYWxsYmFja3Mub25EaWRDaGFuZ2VHbG93VGhlbWUoKCkgPT4gdGhpcy5fZ2xvd0NvbnRyb2xsZXI/LnJlZnJlc2hUaGVtZSgpKSk7XG5cblx0XHRcdC8vIFRvb2xiYXIgcm93IGJlbG93IHRoZSBpbnB1dCBib3hcblx0XHRcdHRoaXMuX2lucHV0Qm94VG9vbGJhciA9IGRvbS4kKCdkaXYnKTtcblx0XHRcdHRoaXMuX2lucHV0Qm94VG9vbGJhci5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjhweDtwYWRkaW5nOjZweCA0cHggMnB4Oy13ZWJraXQtYXBwLXJlZ2lvbjpuby1kcmFnOyc7XG5cblx0XHRcdGNvbnN0IHRvb2xiYXJCdG4gPSAoY2xhc3NOYW1lOiBzdHJpbmcsIGFyaWFMYWJlbDogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogSFRNTEVsZW1lbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBlbCA9IGRvbS4kKGBzcGFuLmNvZGljb24uJHtjbGFzc05hbWV9YCk7XG5cdFx0XHRcdGVsLnJvbGUgPSAnYnV0dG9uJztcblx0XHRcdFx0ZWwudGFiSW5kZXggPSAwO1xuXHRcdFx0XHRlbC5hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cdFx0XHRcdGVsLnRpdGxlID0gdGl0bGU7XG5cdFx0XHRcdGVsLnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLmljb25TbX07Y29sb3I6dmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCk7Y3Vyc29yOnBvaW50ZXI7LXdlYmtpdC1hcHAtcmVnaW9uOm5vLWRyYWc7cGFkZGluZzoycHg7YDtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbCwgJ21vdXNlZW50ZXInLCAoKSA9PiB7IGVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSc7IH0pKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbCwgJ21vdXNlbGVhdmUnLCAoKSA9PiB7IGVsLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJzsgfSkpO1xuXHRcdFx0XHRhZGRLZXlib2FyZEFjdGl2YXRpb24oZWwpO1xuXHRcdFx0XHRyZXR1cm4gZWw7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBNaWMgYnV0dG9uXG5cdFx0XHR0aGlzLl9pbnB1dEJveE1pY0J0biA9IGRvbS4kKCdzcGFuLmNvZGljb24uY29kaWNvbi12b2ljZS1tb2RlLmFnZW50cy12b2ljZS1tb2RlLWJ1dHRvbicpO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4ucm9sZSA9ICdidXR0b24nO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4udGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4uYXJpYUxhYmVsID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLnB1c2hUb1RhbGtTcGFjZScsIFwiUHVzaCB0byB0YWxrIChTcGFjZSlcIik7XG5cdFx0XHR0aGlzLl9pbnB1dEJveE1pY0J0bi50aXRsZSA9IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5wdXNoVG9UYWxrU3BhY2UnLCBcIlB1c2ggdG8gdGFsayAoU3BhY2UpXCIpO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4uc3R5bGUuY3NzVGV4dCA9IGBmb250LXNpemU6JHtGT05UX1NJWkUuaWNvbk1kfTtjdXJzb3I6cG9pbnRlcjstd2Via2l0LWFwcC1yZWdpb246bm8tZHJhZztib3JkZXItcmFkaXVzOjRweDtwYWRkaW5nOjJweDtgO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9pbnB1dEJveE1pY0J0biwgJ2NvbnRleHRtZW51JywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5zaG93Vm9pY2VDb250ZXh0TWVudShlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gQ29ubmVjdGlvbiBpbmRpY2F0b3Jcblx0XHRcdHRoaXMuX2lucHV0Qm94Q29ubkluZGljYXRvciA9IHRvb2xiYXJCdG4oJ2NvZGljb24tZGVidWctY29ubmVjdGVkJyxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50c1ZvaWNlLmRpc2Nvbm5lY3QnLCBcIkRpc2Nvbm5lY3RcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdhZ2VudHNWb2ljZS5kaXNjb25uZWN0JywgXCJEaXNjb25uZWN0XCIpKTtcblxuXHRcdFx0Ly8gRmVlZGJhY2sgYnV0dG9uXG5cdFx0XHR0aGlzLl9pbnB1dEJveEZlZWRiYWNrQnRuID0gdG9vbGJhckJ0bignY29kaWNvbi1mZWVkYmFjaycsXG5cdFx0XHRcdGxvY2FsaXplKCdhZ2VudHNWb2ljZS5zZW5kRmVlZGJhY2snLCBcIlNlbmQgZmVlZGJhY2tcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdhZ2VudHNWb2ljZS5zZW5kRmVlZGJhY2snLCBcIlNlbmQgZmVlZGJhY2tcIikpO1xuXG5cdFx0XHQvLyBTZXNzaW9ucyBkcm9wZG93biBidXR0b25cblx0XHRcdHRoaXMuX2lucHV0Qm94U2Vzc2lvbnNCdG4gPSB0b29sYmFyQnRuKCdjb2RpY29uLWxpc3QtdHJlZScsXG5cdFx0XHRcdGxvY2FsaXplKCdhZ2VudHNWb2ljZS5zZXNzaW9ucycsIFwiU2Vzc2lvbnNcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdhZ2VudHNWb2ljZS5zZXNzaW9ucycsIFwiU2Vzc2lvbnNcIikpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9pbnB1dEJveFNlc3Npb25zQnRuLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2V4cGFuZGVkLnNldCghdGhpcy5fZXhwYW5kZWQuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIENsb3NlIGJ1dHRvblxuXHRcdFx0dGhpcy5faW5wdXRCb3hDbG9zZUJ0biA9IHRvb2xiYXJCdG4oJ2NvZGljb24tY2hyb21lLW1pbmltaXplJyxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50c1ZvaWNlLm1pbmltaXplJywgXCJNaW5pbWl6ZVwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50c1ZvaWNlLm1pbmltaXplJywgXCJNaW5pbWl6ZVwiKSk7XG5cblx0XHRcdGNvbnN0IHRvb2xiYXJTcGFjZXIgPSBkb20uJCgnc3BhbicpO1xuXHRcdFx0dG9vbGJhclNwYWNlci5zdHlsZS5mbGV4ID0gJzEnO1xuXG5cdFx0XHR0aGlzLl9pbnB1dEJveFRvb2xiYXIuYXBwZW5kKFxuXHRcdFx0XHR0aGlzLl9pbnB1dEJveE1pY0J0bixcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hDb25uSW5kaWNhdG9yLFxuXHRcdFx0XHR0b29sYmFyU3BhY2VyLFxuXHRcdFx0XHR0aGlzLl9pbnB1dEJveEZlZWRiYWNrQnRuLFxuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFNlc3Npb25zQnRuLFxuXHRcdFx0XHR0aGlzLl9pbnB1dEJveENsb3NlQnRuXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIEFzc2VtYmxlOiBhbGwgY2hpbGRyZW4gYXJlIGluIHRoZSBET007IHZpc2liaWxpdHkgaXMgdG9nZ2xlZCB2aWEgZGlzcGxheVxuXHRcdGlmIChvcHRzLmlucHV0Qm94TGF5b3V0KSB7XG5cdFx0XHR0aGlzLl9jb250ZW50RGl2LmFwcGVuZChcblx0XHRcdFx0dGhpcy5fb25ib2FyZGluZ0NvbXBvbmVudC5lbGVtZW50LFxuXHRcdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudC5lbGVtZW50LFxuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFRvb2xiYXIhLFxuXHRcdFx0XHR0aGlzLl90cmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQsXG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0V3JhcHBlcixcblx0XHRcdFx0dGhpcy5fc3RhdHVzUm93c0NvbXBvbmVudC5lbGVtZW50LFxuXHRcdFx0XHR0aGlzLl9pbnB1dEJveENvbnRhaW5lciEsXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb250ZW50RGl2LmFwcGVuZChcblx0XHRcdFx0dGhpcy5fb25ib2FyZGluZ0NvbXBvbmVudC5lbGVtZW50LFxuXHRcdFx0XHR0aGlzLl9oZWFkZXJDb21wb25lbnQuZWxlbWVudCxcblx0XHRcdFx0dGhpcy5fdm9pY2VCYXJDb21wb25lbnQuZWxlbWVudCxcblx0XHRcdFx0dGhpcy5fZmVlZGJhY2tEaWFsb2dDb21wb25lbnQuZWxlbWVudCxcblx0XHRcdFx0dGhpcy5fc3RhdHVzVGV4dERpdixcblx0XHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LFxuXHRcdFx0XHR0aGlzLl9zdGF0dXNSb3dzQ29tcG9uZW50LmVsZW1lbnQsXG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0V3JhcHBlcixcblx0XHRcdFx0dGhpcy5fZXhwYW5kU3BhY2VyLFxuXHRcdFx0XHR0aGlzLl9jaGV2cm9uV3JhcHBlclxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yb290RGl2LmFwcGVuZCh0aGlzLl9nbG93RGl2LCB0aGlzLl90aXRsZVJvdywgdGhpcy5fY29udGVudERpdik7XG5cdFx0dGhpcy5jb250YWluZXIuYXBwZW5kKHRoaXMuX3Jvb3REaXYpO1xuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnMuZm9jdXNhYmxlKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cdFx0XHRjb25zdCB3aW4gPSBnZXRXaW5kb3codGhpcy5jb250YWluZXIpO1xuXHRcdFx0Ly8gVHJhY2sgd2hpY2gga2V5IHRyaWdnZXJlZCBQVFQgc28ga2V5dXAgcmVsZWFzZXMgY29ycmVjdGx5XG5cdFx0XHQvLyBldmVuIHdoZW4gdGhlIHVzZXIgcmViaW5kcyBwdXNoVG9UYWxrIHRvIGEgZGlmZmVyZW50IGtleS5cblx0XHRcdC8vIFdlIGNhcHR1cmUgdGhlIGxhc3Qga2V5ZG93biBjb2RlIGF0IHRoZSBkb2N1bWVudCBsZXZlbCAoY2FwdHVyZVxuXHRcdFx0Ly8gcGhhc2UpIGFuZCBzbmFwc2hvdCBpdCBvbmNlIHJlY29yZGluZyBiZWdpbnMgKHNlZSB0aGUgYXV0b3J1blxuXHRcdFx0Ly8gb24gdGhlIGBsaXN0ZW5pbmdgIHN0YXRlIGJlbG93KS5cblx0XHRcdGxldCBwdHRLZXlDb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgaGVsZEtleUNvZGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdC8vIFRydWUgd2hlbiBhIGtleSB3YXMgcHJlc3NlZCBhbmQgcmVsZWFzZWQgYWdhaW4gQkVGT1JFIHJlY29yZGluZ1xuXHRcdFx0Ly8gYWN0dWFsbHkgYmVnYW4gKGUuZy4gdGhlIHVzZXIgdGFwcGVkIHRoZSBQVFQga2V5IGR1cmluZyB0aGUgYXN5bmNcblx0XHRcdC8vIGNvbm5lY3QoKSB0aGF0IHByZWNlZGVzIHRoZSBmaXJzdCBwdHREb3duKCkpLiBXaXRob3V0IHRoaXMgdGhlXG5cdFx0XHQvLyByZWxlYXNlIGlzIGxvc3QgLSBsaXN0ZW5pbmcgc3RhcnRzIHdpdGggbm8ga2V5IHRvIHdhdGNoIGZvciBhbmRcblx0XHRcdC8vIG5ldmVyIHN0b3BzLiBSZXNldCB3aGVuZXZlciB3ZSByZXR1cm4gdG8gYSBub24tbGlzdGVuaW5nIHN0YXRlLlxuXHRcdFx0bGV0IHJlbGVhc2VkQmVmb3JlTGlzdGVuaW5nID0gZmFsc2U7XG5cdFx0XHRjb25zdCBvbkRvY0tleWRvd24gPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4geyBoZWxkS2V5Q29kZSA9IGUuY29kZTsgcmVsZWFzZWRCZWZvcmVMaXN0ZW5pbmcgPSBmYWxzZTsgfTtcblx0XHRcdC8vIENsZWFyIHRoZSB0cmFja2VkIGtleSBvbmNlIGl0IGlzIHJlbGVhc2VkIHNvIGEgc3RhbGUgY29kZSBpc1xuXHRcdFx0Ly8gbmV2ZXIgbWlzdGFrZW4gZm9yIGEgaGVsZCBQVFQga2V5IChlLmcuIG1vdXNlLWluaXRpYXRlZCBQVFQpLiBJZlxuXHRcdFx0Ly8gcmVjb3JkaW5nIGhhc24ndCBiZWd1biB5ZXQsIHJlbWVtYmVyIHRoYXQgdGhlIGtleSB3YXMgcmVsZWFzZWQgc29cblx0XHRcdC8vIHRoZSBsaXN0ZW5pbmcgdHJhbnNpdGlvbiBiZWxvdyBjYW4gc3RvcCBpbW1lZGlhdGVseS5cblx0XHRcdGNvbnN0IG9uRG9jS2V5dXAgPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZS5jb2RlID09PSBoZWxkS2V5Q29kZSkge1xuXHRcdFx0XHRcdGhlbGRLZXlDb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChwdHRLZXlDb2RlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJlbGVhc2VkQmVmb3JlTGlzdGVuaW5nID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR3aW4uZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG9uRG9jS2V5ZG93biwgdHJ1ZSk7XG5cdFx0XHR3aW4uZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBvbkRvY0tleXVwLCB0cnVlKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdHdpbi5kb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25Eb2NLZXlkb3duLCB0cnVlKTtcblx0XHRcdFx0d2luLmRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXVwJywgb25Eb2NLZXl1cCwgdHJ1ZSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsICdrZXlkb3duJywgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKCFfaXNUZXh0SW5wdXQoZS50YXJnZXQpICYmIHB0dEtleUNvZGUgJiYgZS5jb2RlID09PSBwdHRLZXlDb2RlKSB7XG5cdFx0XHRcdFx0Ly8gUHJldmVudCByZXBlYXQga2V5ZG93bnMgZnJvbSBhY3RpdmF0aW5nIGZvY3VzZWQgY2hpbGRcblx0XHRcdFx0XHQvLyBidXR0b25zIChyb2xlPVwiYnV0dG9uXCIgZWxlbWVudHMgZmlyZSBjbGljayBvbiBTcGFjZSkuXG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCAna2V5dXAnLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIV9pc1RleHRJbnB1dChlLnRhcmdldCkgJiYgcHR0S2V5Q29kZSAmJiBlLmNvZGUgPT09IHB0dEtleUNvZGUpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0cHR0S2V5Q29kZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5wdHRVcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFNuYXBzaG90IHdoaWNoIGtleSBzdGFydGVkIFBUVCB3aGVuIHJlY29yZGluZyBhY3R1YWxseSBiZWdpbnMuXG5cdFx0XHQvLyBUaGUga2V5Ym9hcmQgUHVzaC10by1UYWxrIGNvbW1hbmQgY2FsbHMgdGhlIGNvbnRyb2xsZXInc1xuXHRcdFx0Ly8gYHB0dERvd24oKWAgZGlyZWN0bHkgKGJ5cGFzc2luZyBgY2FsbGJhY2tzLnB0dERvd25gKSwgc28gaG9vayB0aGVcblx0XHRcdC8vIHJlc3VsdGluZyBgbGlzdGVuaW5nYCBzdGF0ZSB0cmFuc2l0aW9uIHRvIGNhcHR1cmUgdGhlIGtleSByYXRoZXJcblx0XHRcdC8vIHRoYW4gdGhlIGNhbGxiYWNrLiBPbmx5IHNuYXBzaG90IHdoZW4gYSBrZXkgaXMgcGh5c2ljYWxseSBoZWxkXG5cdFx0XHQvLyAoa2V5Ym9hcmQgUFRUKTsgbW91c2UvcG9pbnRlciBQVFQgbGVhdmVzIGBoZWxkS2V5Q29kZWAgdW5kZWZpbmVkXG5cdFx0XHQvLyBhbmQgcmVsZWFzZXMgdmlhIGBwb2ludGVydXBgLlxuXHRcdFx0bGV0IHdhc0xpc3RlbmluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBsaXN0ZW5pbmcgPSB0aGlzLl92b2ljZVN0YXRlLnJlYWQocmVhZGVyKSA9PT0gJ2xpc3RlbmluZyc7XG5cdFx0XHRcdGlmIChsaXN0ZW5pbmcgJiYgIXdhc0xpc3RlbmluZyAmJiBwdHRLZXlDb2RlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRpZiAoaGVsZEtleUNvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0cHR0S2V5Q29kZSA9IGhlbGRLZXlDb2RlO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocmVsZWFzZWRCZWZvcmVMaXN0ZW5pbmcpIHtcblx0XHRcdFx0XHRcdC8vIFRoZSBQVFQga2V5IHdhcyBhbHJlYWR5IHJlbGVhc2VkIHdoaWxlIHdlIHdlcmUgc3RpbGxcblx0XHRcdFx0XHRcdC8vIGNvbm5lY3RpbmcgLSBzdG9wIHJlY29yZGluZyByaWdodCBhd2F5IGluc3RlYWQgb2Zcblx0XHRcdFx0XHRcdC8vIGdldHRpbmcgc3R1Y2sgbGlzdGVuaW5nIHdpdGggbm8ga2V5IHRvIHJlbGVhc2UuXG5cdFx0XHRcdFx0XHRyZWxlYXNlZEJlZm9yZUxpc3RlbmluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0dGhpcy5jYWxsYmFja3MucHR0VXAoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFsaXN0ZW5pbmcpIHtcblx0XHRcdFx0XHRyZWxlYXNlZEJlZm9yZUxpc3RlbmluZyA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdhc0xpc3RlbmluZyA9IGxpc3RlbmluZztcblx0XHRcdH0pKTtcblx0XHRcdC8vIENhdGNoIHBvaW50ZXJ1cCBvdXRzaWRlIHRoZSBjb250YWluZXIgdG9vIChtaXJyb3JzIHRoZSBjaGF0IHZpZXcgcGFuZSBiZWhhdmlvcilcblx0XHRcdGNvbnN0IG9uRG9jUG9pbnRlclVwID0gKCkgPT4gdGhpcy5jYWxsYmFja3MucHR0VXAoKTtcblx0XHRcdHdpbi5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVydXAnLCBvbkRvY1BvaW50ZXJVcCk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gd2luLmRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJ1cCcsIG9uRG9jUG9pbnRlclVwKSkpO1xuXHRcdH1cblxuXHRcdC8vIFNldCB1cCBQVFQgdmlhIEJyb2FkY2FzdENoYW5uZWxcblx0XHRjb25zdCBwdHRDaGFubmVsID0gbmV3IEJyb2FkY2FzdENoYW5uZWwoJ3ZzY29kZS1wdHQnKTtcblx0XHRwdHRDaGFubmVsLm9ubWVzc2FnZSA9IChlKSA9PiB7XG5cdFx0XHRpZiAoZS5kYXRhID09PSAnZG93bicpIHsgdGhpcy5jYWxsYmFja3MucHR0RG93bigpOyB9XG5cdFx0XHRpZiAoZS5kYXRhID09PSAndXAnKSB7IHRoaXMuY2FsbGJhY2tzLnB0dFVwKCk7IH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBwdHRDaGFubmVsLmNsb3NlKCkpKTtcblxuXHRcdC8vIEF1dG8tcmVuZGVyIG9uIG9ic2VydmFibGUgY2hhbmdlcyAoYnV0IE5PVCBnbG93IFx1MjAxNCB0aGF0J3MgaW4gUkFGKVxuXHRcdGNvbnN0IHJlbmRlckRpc3Bvc2FibGUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVET00ocmVhZGVyKTtcblx0XHRcdGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdFx0dGhpcy5jYWxsYmFja3Mub25SZXNpemUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlbmRlckRpc3Bvc2FibGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBkb20uY2xlYXJOb2RlKHRoaXMuY29udGFpbmVyKSkpO1xuXG5cdFx0Ly8gSGFuZGxlIHRoZSBvbmJvYXJkaW5nIFwiR2V0IFN0YXJ0ZWQgXHUyMTkyIGNvbm5lY3RcIiBmbG93OiBkaXNtaXNzIG9uY2Vcblx0XHQvLyBjb25uZWN0aW9uIHN1Y2NlZWRzLCByZXNldCBvbmx5IG9uIGFjdHVhbCBmYWlsdXJlLlxuXHRcdC8vIE5vdGU6IHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgc2V0cyBpc0Nvbm5lY3Rpbmc9ZmFsc2UgdGhlbiBpc0Nvbm5lY3RlZD10cnVlXG5cdFx0Ly8gc2VxdWVudGlhbGx5IChub3QgYXRvbWljYWxseSksIHNvIHdlIGRlZmVyIHRoZSBmYWlsdXJlIGNoZWNrIG9uZVxuXHRcdC8vIG1pY3JvdGFzayB0byBnaXZlIGlzQ29ubmVjdGVkPXRydWUgYSBjaGFuY2UgdG8gZm9sbG93LlxuXHRcdGxldCBzYXdDb25uZWN0aW5nID0gZmFsc2U7XG5cdFx0bGV0IGZhaWx1cmVDaGVja1BlbmRpbmcgPSBmYWxzZTtcblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRjb25zdCBvbmJvYXJkaW5nQ29ubmVjdERpc3Bvc2FibGUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX29uYm9hcmRpbmdQZW5kaW5nQ29ubmVjdC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0c2F3Q29ubmVjdGluZyA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5faXNDb25uZWN0ZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX29uYm9hcmRpbmdQZW5kaW5nQ29ubmVjdC5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHNhd0Nvbm5lY3RpbmcgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fc2hvd09uYm9hcmRpbmcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5vbk9uYm9hcmRpbmdDb21wbGV0ZWQ/LigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5faXNDb25uZWN0aW5nLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRzYXdDb25uZWN0aW5nID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNhd0Nvbm5lY3RpbmcgJiYgIWZhaWx1cmVDaGVja1BlbmRpbmcpIHtcblx0XHRcdFx0ZmFpbHVyZUNoZWNrUGVuZGluZyA9IHRydWU7XG5cdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0XHRmYWlsdXJlQ2hlY2tQZW5kaW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7IHJldHVybjsgfVxuXHRcdFx0XHRcdGlmICh0aGlzLl9vbmJvYXJkaW5nUGVuZGluZ0Nvbm5lY3QucmVhZCh1bmRlZmluZWQpICYmICF0aGlzLl9pc0Nvbm5lY3RlZC5yZWFkKHVuZGVmaW5lZCkgJiYgIXRoaXMuX2lzQ29ubmVjdGluZy5yZWFkKHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uYm9hcmRpbmdQZW5kaW5nQ29ubmVjdC5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRzYXdDb25uZWN0aW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZCA9IHRydWU7IH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbmJvYXJkaW5nQ29ubmVjdERpc3Bvc2FibGUpO1xuXG5cdFx0Ly8gQWx3YXlzLW9uLXdoZW4tZGlzY29ubmVjdGVkIG9uYm9hcmRpbmc6IHdoZW4gdGhlIGhvc3Qgb3B0cyBpbiB2aWFcblx0XHQvLyBgYHJlc2hvd09uYm9hcmRpbmdPbkRpc2Nvbm5lY3RgYCwgdGhlIG9uYm9hcmRpbmcgY2FyZCByZS1hcHBlYXJzIGFueVxuXHRcdC8vIHRpbWUgdGhlIHdpZGdldCBlbnRlcnMgYSBmdWxseS1kaXNjb25uZWN0ZWQgc3RhdGUuIFdlIHRyZWF0XG5cdFx0Ly8gY29ubmVjdGluZyBhbmQgYXV0by1yZWNvbm5lY3RpbmcgYXMgdHJhbnNpZW50IChubyByZXNob3cpIHNvIHRoZSBVSVxuXHRcdC8vIGRvZXNuJ3QgZmxpY2tlciBtaWQtcmV0cnkuIFRoZSB1c2VyIGNhbiBzdGlsbCBkaXNtaXNzIHRoZSBjYXJkIHZpYVxuXHRcdC8vIHRoZSBHZXQgU3RhcnRlZCBidXR0b247IHRoYXQgZGlzbWlzc2FsIGlzIGhvbm9yZWQgdW50aWwgdGhlIG5leHRcblx0XHQvLyBkaXNjb25uZWN0IHRyYW5zaXRpb24uXG5cdFx0aWYgKHRoaXMuX29wdGlvbnMucmVzaG93T25ib2FyZGluZ09uRGlzY29ubmVjdCkge1xuXHRcdFx0Y29uc3QgcmVzaG93RGlzcG9zYWJsZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY29ubmVjdGVkID0gdGhpcy5faXNDb25uZWN0ZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBjb25uZWN0aW5nID0gdGhpcy5faXNDb25uZWN0aW5nLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgcmVjb25uZWN0aW5nID0gdGhpcy5faXNSZWNvbm5lY3RpbmcucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nQ29ubmVjdCA9IHRoaXMuX29uYm9hcmRpbmdQZW5kaW5nQ29ubmVjdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghY29ubmVjdGVkICYmICFjb25uZWN0aW5nICYmICFyZWNvbm5lY3RpbmcgJiYgIXBlbmRpbmdDb25uZWN0KSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9zaG93T25ib2FyZGluZy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3dPbmJvYXJkaW5nLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZXNob3dEaXNwb3NhYmxlKTtcblx0XHR9XG5cblx0XHQvLyBSdW4gdGhlIDYwSHogd2F2ZWZvcm0vZ2xvdyBsb29wIG9ubHkgd2hpbGUgdGhlcmUgaXMgc29tZXRoaW5nIHRvXG5cdFx0Ly8gYW5pbWF0ZSAob25ib2FyZGluZywgbGlzdGVuaW5nLCBvciBzcGVha2luZykuIElkbGUvZGlzY29ubmVjdGVkIHJlbmRlclxuXHRcdC8vIG5vIGdsb3csIHNvIGtlZXBpbmcgYSBmcmFtZSBsb29wIGFsaXZlIHRoZW4gd291bGQgYnVybiBDUFUgZm9yIG5vdGhpbmcuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgb25ib2FyZGluZyA9IHRoaXMuX3Nob3dPbmJvYXJkaW5nLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZvaWNlU3RhdGUgPSB0aGlzLl92b2ljZVN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChvbmJvYXJkaW5nIHx8IHZvaWNlU3RhdGUgPT09ICdsaXN0ZW5pbmcnIHx8IHZvaWNlU3RhdGUgPT09ICdzcGVha2luZycpIHtcblx0XHRcdFx0dGhpcy5fc3RhcnRXYXZlZm9ybUFuaW1hdGlvbigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc3RvcFdhdmVmb3JtQW5pbWF0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9zdG9wV2F2ZWZvcm1BbmltYXRpb24oKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRE9NKHJlYWRlcjogSVJlYWRlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLmlucHV0Qm94TGF5b3V0KSB7XG5cdFx0XHR0aGlzLl91cGRhdGVET01JbnB1dEJveExheW91dChyZWFkZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl91cGRhdGVET01DbGFzc2ljTGF5b3V0KHJlYWRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRE9NSW5wdXRCb3hMYXlvdXQocmVhZGVyOiBJUmVhZGVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgdm9pY2VTdGF0ZSA9IHRoaXMuX3ZvaWNlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHZvaWNlQ29udHJvbHNTdXBwcmVzc2VkID0gdGhpcy5fdm9pY2VDb250cm9sc1N1cHByZXNzZWQucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGlzQ29ubmVjdGVkID0gdGhpcy5faXNDb25uZWN0ZWQucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGlzQ29ubmVjdGluZyA9IHRoaXMuX2lzQ29ubmVjdGluZy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgaXNSZWNvbm5lY3RpbmcgPSB0aGlzLl9pc1JlY29ubmVjdGluZy5yZWFkKHJlYWRlcik7XG5cdFx0Ly8gVGhlIG9uYm9hcmRpbmcgYnJhbmNoIHJldHVybnMgZWFybHksIHNvIHNob3dpbmcgaXQgZHVyaW5nIGEgcmVjb25uZWN0XG5cdFx0Ly8gaGlkZXMgZXZlcnkgcHJvZ3Jlc3MgYWZmb3JkYW5jZSBiZWxvdyBhbmQgbGVhdmVzIGEgc3RhdGljIFwiR2V0IFN0YXJ0ZWRcIlxuXHRcdC8vIGJ1dHRvbiB3aGlsZSB0aGUgc29ja2V0IGlzIGFjdGl2ZWx5IHJldHJ5aW5nLlxuXHRcdGNvbnN0IG9uYm9hcmRpbmcgPSB0aGlzLl9zaG93T25ib2FyZGluZy5yZWFkKHJlYWRlcikgJiYgIWlzUmVjb25uZWN0aW5nO1xuXHRcdGNvbnN0IHNob3dDb25uZWN0ZWQgPSBpc0Nvbm5lY3RlZCB8fCBpc1JlY29ubmVjdGluZztcblx0XHRjb25zdCBvcHRzID0gdGhpcy5fb3B0aW9ucztcblx0XHRjb25zdCBzaG93RXhwYW5kZWQgPSB0aGlzLl9zaG91bGRTaG93RXhwYW5kZWQucmVhZChyZWFkZXIpICYmIG9wdHMuc2hvd0V4cGFuZENoZXZyb247XG5cblx0XHQvLyBBZGp1c3Qgcm9vdCB3aWR0aCB3aGVuIHNlc3Npb25zIGFyZSBleHBhbmRlZFxuXHRcdGNvbnN0IGJhc2VXaWR0aCA9IHR5cGVvZiBvcHRzLndpZHRoID09PSAnbnVtYmVyJyA/IG9wdHMud2lkdGggOiBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfV0lEVEg7XG5cdFx0dGhpcy5fcm9vdERpdi5zdHlsZS53aWR0aCA9IGAke2Jhc2VXaWR0aH1weGA7XG5cblx0XHQvLyBUaXRsZSByb3c6IGhpZGRlbiBkdXJpbmcgb25ib2FyZGluZ1xuXHRcdHRoaXMuX3RpdGxlUm93LnN0eWxlLmRpc3BsYXkgPSAob25ib2FyZGluZyB8fCAhb3B0cy50aXRsZSkgPyAnbm9uZScgOiAnZmxleCc7XG5cblx0XHRpZiAob25ib2FyZGluZykge1xuXHRcdFx0dGhpcy5fb25ib2FyZGluZ0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2lucHV0Qm94Q29udGFpbmVyIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9zdGF0dXNSb3dzQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0V3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hUb29sYmFyIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0XHR0aGlzLl9vbmJvYXJkaW5nQ29tcG9uZW50LnVwZGF0ZSh7XG5cdFx0XHRcdHB0dEtleUxhYmVsOiB0aGlzLl9wdHRLZXlMYWJlbC5yZWFkKHJlYWRlciksXG5cdFx0XHRcdGlzQ29ubmVjdGluZzogdGhpcy5fb25ib2FyZGluZ1BlbmRpbmdDb25uZWN0LnJlYWQocmVhZGVyKSB8fCBpc0Nvbm5lY3RpbmcgfHwgaXNSZWNvbm5lY3RpbmcsXG5cdFx0XHRcdG9uR2V0U3RhcnRlZDogKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLl9kaXNtaXNzT25ib2FyZGluZyh0cnVlKTsgfSxcblx0XHRcdFx0b25PcGVuUHR0S2V5U2V0dGluZ3M6IChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3Mub3BlblB0dEtleVNldHRpbmdzKCk7IH0sXG5cdFx0XHRcdG9uT3BlblBvcG91dDogdGhpcy5jYWxsYmFja3Mub3BlblBvcG91dCA/IChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3Mub3BlblBvcG91dD8uKCk7IH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vbmJvYXJkaW5nQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdGNvbnN0IGZlZWRiYWNrU3RhdGUgPSB0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoZmVlZGJhY2tTdGF0ZSkge1xuXHRcdFx0dGhpcy5fZmVlZGJhY2tEaWFsb2dDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudC51cGRhdGUoe1xuXHRcdFx0XHRvblN1Ym1pdDogKHRleHQpID0+IHRoaXMuX3N1Ym1pdEZlZWRiYWNrKHRleHQpLFxuXHRcdFx0XHRvbkNhbmNlbDogKCkgPT4geyB0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnNldChudWxsLCB1bmRlZmluZWQpOyB9LFxuXHRcdFx0fSwgZmVlZGJhY2tTdGF0ZSk7XG5cdFx0XHR0aGlzLl9pbnB1dEJveENvbnRhaW5lciEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fc3RhdHVzUm93c0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2lucHV0Qm94VG9vbGJhciEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHQvLyBJbnB1dCBib3ggY29udGFpbmVyIFx1MjAxNCBzaG93IHRyYW5zY3JpcHQgaW5zaWRlIG9yIHBsYWNlaG9sZGVyXG5cdFx0dGhpcy5faW5wdXRCb3hDb250YWluZXIhLnN0eWxlLmRpc3BsYXkgPSB2b2ljZUNvbnRyb2xzU3VwcHJlc3NlZCA/ICdub25lJyA6ICdmbGV4Jztcblx0XHRjb25zdCB0cmFuc2NyaXB0VHVybnMgPSB0aGlzLl90cmFuc2NyaXB0VHVybnMucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGhhc1RyYW5zY3JpcHQgPSB0cmFuc2NyaXB0VHVybnMuc29tZSh0ID0+IHQudGV4dC5sZW5ndGggPiAwIHx8ICh0LnNwZWFrZXIgPT09ICd1c2VyJyAmJiB0LmlzUGFydGlhbCkpO1xuXG5cdFx0Ly8gVGhlIGFtYmllbnQgZ2xvdyBpcyBvd25lZCBieSB0aGUgZ2xvdyBjb250cm9sbGVyOyBjbGVhciBpdCB3aGVuZXZlciB0aGVcblx0XHQvLyBpbnB1dCBib3ggc2hvdWxkbid0IGJlIGxpdCBzbyBubyBzdGFsZSBmcmFtZSBpcyBsZWZ0IGJlaGluZC5cblx0XHRjb25zdCBzaG91bGRTaG93SW5wdXRHbG93ID0gIXZvaWNlQ29udHJvbHNTdXBwcmVzc2VkICYmIHNob3dDb25uZWN0ZWQgJiYgKHZvaWNlU3RhdGUgPT09ICdsaXN0ZW5pbmcnIHx8IHZvaWNlU3RhdGUgPT09ICdzcGVha2luZycpO1xuXHRcdGlmICghc2hvdWxkU2hvd0lucHV0R2xvdykge1xuXHRcdFx0dGhpcy5fZ2xvd0NvbnRyb2xsZXI/LmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVG9nZ2xlIHByb2Nlc3NpbmcgY29tZXQgYW5pbWF0aW9uIHdoZW4gYWdlbnQgaXMgdGhpbmtpbmdcblx0XHR0aGlzLl9pbnB1dEJveENvbnRhaW5lciEuY2xhc3NMaXN0LnRvZ2dsZSgncHJvY2Vzc2luZycsICF2b2ljZUNvbnRyb2xzU3VwcHJlc3NlZCAmJiB2b2ljZVN0YXRlID09PSAncHJvY2Vzc2luZycpO1xuXG5cdFx0aWYgKGhhc1RyYW5zY3JpcHQpIHtcblx0XHRcdGlmIChzaG93RXhwYW5kZWQpIHtcblx0XHRcdFx0Ly8gV2hlbiBleHBhbmRlZCwgc2hvdyBmdWxsIHRyYW5zY3JpcHQgY29tcG9uZW50IHdpdGggY2hhdC1saWtlIHN0eWxpbmdcblx0XHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLnBhZGRpbmcgPSAnOHB4IDEycHgnO1xuXHRcdFx0XHR0aGlzLl90cmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQuc3R5bGUuYm9yZGVyQm90dG9tID0gJzFweCBzb2xpZCB2YXIoLS12c2NvZGUtd2lkZ2V0LWJvcmRlciwgdmFyKC0tdnNjb2RlLWlucHV0LWJvcmRlciwgdHJhbnNwYXJlbnQpKSc7XG5cdFx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQudXBkYXRlKHsgdHVybnM6IHRyYW5zY3JpcHRUdXJucywgY2hhdFN0eWxlOiB0cnVlIH0pO1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFBsYWNlaG9sZGVyIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFRyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hQbGFjZWhvbGRlciEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5wYWRkaW5nID0gJyc7XG5cdFx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b20gPSAnJztcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hUcmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFRyYW5zY3JpcHRDb21wb25lbnQudXBkYXRlKHsgdHVybnM6IHRyYW5zY3JpcHRUdXJucywgY2hhdFN0eWxlOiB0cnVlLCBzY3JvbGxUb1RvcDogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU2hvdyBwbGFjZWhvbGRlclxuXHRcdFx0dGhpcy5faW5wdXRCb3hQbGFjZWhvbGRlciEuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hUcmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0Y29uc3Qga2V5TGFiZWwgPSB0aGlzLl9wdHRLZXlMYWJlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoaXNSZWNvbm5lY3RpbmcpIHtcblx0XHRcdFx0Ly8gUHJlZmVyIHRoZSBzdGF0dXMgdGV4dDogaXQgY2FycmllcyB0aGUgY2xvc2UgcmVhc29uIGZvciBhIHJldHJ5YWJsZVxuXHRcdFx0XHQvLyBmYWlsdXJlLCB3aGljaCBpcyB0aGUgd2hvbGUgcG9pbnQgb2Ygc2hvd2luZyBhbnl0aGluZyBoZXJlLlxuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFBsYWNlaG9sZGVyIS50ZXh0Q29udGVudCA9IHRoaXMuX3N0YXR1c1RleHQucmVhZChyZWFkZXIpXG5cdFx0XHRcdFx0fHwgbG9jYWxpemUoJ2FnZW50c1ZvaWNlLnJlY29ubmVjdGluZycsIFwiUmVjb25uZWN0aW5nLi4uXCIpO1xuXHRcdFx0fSBlbHNlIGlmIChpc0Nvbm5lY3RpbmcpIHtcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hQbGFjZWhvbGRlciEudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuY29ubmVjdGluZycsIFwiQ29ubmVjdGluZy4uLlwiKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNDb25uZWN0ZWQgJiYgdm9pY2VTdGF0ZSA9PT0gJ2xpc3RlbmluZycpIHtcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hQbGFjZWhvbGRlciEudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UubGlzdGVuaW5nJywgXCJMaXN0ZW5pbmdcIik7XG5cdFx0XHR9IGVsc2UgaWYgKGlzQ29ubmVjdGVkICYmIHZvaWNlU3RhdGUgPT09ICdzcGVha2luZycpIHtcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hQbGFjZWhvbGRlciEudGV4dENvbnRlbnQgPSBrZXlMYWJlbFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLnByZXNzVG9CYXJnZUluJywgXCJTcGVhayBvciB1c2UgezB9XCIsIGtleUxhYmVsKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50c1ZvaWNlLnNwZWFrVG9CYXJnZUluJywgXCJTcGVhayB0byBiYXJnZSBpblwiKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNDb25uZWN0ZWQpIHtcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hQbGFjZWhvbGRlciEudGV4dENvbnRlbnQgPSBrZXlMYWJlbFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmhvbGRUb1RhbGtPckJhcmdlSW4nLCBcIkhvbGQgezB9IHRvIHRhbGsgb3IgYmFyZ2UgaW5cIiwga2V5TGFiZWwpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuaG9sZE1pY1RvVGFsa09yQmFyZ2VJbicsIFwiSG9sZCB0aGUgbWljIHRvIHRhbGsgb3IgYmFyZ2UgaW5cIik7XG5cdFx0XHR9IGVsc2UgaWYgKGtleUxhYmVsKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIhLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmhvbGRUb1RhbGsnLCBcIkhvbGQgezB9IHRvIHRhbGtcIiwga2V5TGFiZWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hQbGFjZWhvbGRlciEudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuY2xpY2tNaWNUb1RhbGsnLCBcIkNsaWNrIHZvaWNlIG1vZGUgdG8gdGFsa1wiKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBIHRyYW5zY3JpcHQgb3RoZXJ3aXNlIGhpZGVzIHRoZSBwbGFjZWhvbGRlciwgc28gYSBtaWQtc2Vzc2lvbiBkcm9wIHNob3dzXG5cdFx0Ly8gbm8gcHJvZ3Jlc3MgYXQgYWxsLiBLZWVwIHRoZSBsaW5lIHZpc2libGUgd2hpbGUgYSBjb25uZWN0IGlzIGluIGZsaWdodC5cblx0XHRpZiAoaXNSZWNvbm5lY3RpbmcgfHwgaXNDb25uZWN0aW5nKSB7XG5cdFx0XHR0aGlzLl9pbnB1dEJveFBsYWNlaG9sZGVyIS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLl9pbnB1dEJveFBsYWNlaG9sZGVyIS50ZXh0Q29udGVudCA9IGlzUmVjb25uZWN0aW5nXG5cdFx0XHRcdD8gKHRoaXMuX3N0YXR1c1RleHQucmVhZChyZWFkZXIpIHx8IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5yZWNvbm5lY3RpbmcnLCBcIlJlY29ubmVjdGluZy4uLlwiKSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuY29ubmVjdGluZycsIFwiQ29ubmVjdGluZy4uLlwiKTtcblx0XHR9XG5cblx0XHQvLyBTdGF0dXMgcm93cyBcdTIwMTQgaGlkZSBpbiBpbnB1dEJveExheW91dCAobm8gXCJObyBhY3RpdmUgc2Vzc2lvbnNcIiB0ZXh0IG5lZWRlZClcblx0XHRpZiAoIXNob3dFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5fc3RhdHVzUm93c0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RhdHVzUm93c0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0Ly8gQ29uc3RyYWluIHNlc3Npb24gbGlzdCBoZWlnaHQgc28gdG9vbGJhciBhbmQgdHJhbnNjcmlwdCBhbHdheXMgcmVtYWluIHZpc2libGVcblx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0V3JhcHBlci5zdHlsZS5tYXhIZWlnaHQgPSAnMjAwcHgnO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLnN0eWxlLm92ZXJmbG93WSA9ICdhdXRvJztcblx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0V3JhcHBlci5zdHlsZS5zY3JvbGxiYXJXaWR0aCA9ICdub25lJztcblx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0Q29tcG9uZW50LnVwZGF0ZSh7XG5cdFx0XHRcdHNlc3Npb25zOiB0aGlzLl9zZXNzaW9ucy5yZWFkKHJlYWRlciksXG5cdFx0XHRcdGdyb3VwczogdGhpcy5fc2Vzc2lvbkdyb3Vwcy5yZWFkKHJlYWRlciksXG5cdFx0XHRcdHNlbGVjdGVkVGFyZ2V0OiB0aGlzLl9zZWxlY3RlZFRhcmdldFNlc3Npb24ucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRvbk9wZW5TZXNzaW9uOiAocikgPT4gdGhpcy5jYWxsYmFja3Mub3BlblNlc3Npb24ociksXG5cdFx0XHRcdG9uU3RvcFNlc3Npb246IChyKSA9PiB0aGlzLmNhbGxiYWNrcy5zdG9wU2Vzc2lvbihyKSxcblx0XHRcdFx0b25DYW5jZWxTZXNzaW9uOiAocikgPT4gdGhpcy5jYWxsYmFja3MuY2FuY2VsU2Vzc2lvbihyKSxcblx0XHRcdFx0b25TZWxlY3RUYXJnZXQ6IChyKSA9PiB7IHRoaXMuX3NlbGVjdGVkVGFyZ2V0U2Vzc2lvbi5zZXQociwgdW5kZWZpbmVkKTsgdGhpcy5jYWxsYmFja3Muc2VsZWN0VGFyZ2V0U2Vzc2lvbihyKTsgfSxcblx0XHRcdFx0b25OZXdTZXNzaW9uOiAoKSA9PiB0aGlzLmNhbGxiYWNrcy5uZXdTZXNzaW9uQXNUYXJnZXQoKSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFRvb2xiYXIgXHUyMDE0IGFsd2F5cyB2aXNpYmxlXG5cdFx0dGhpcy5faW5wdXRCb3hUb29sYmFyIS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXG5cdFx0Ly8gTWljIGJ1dHRvbiBcdTIwMTQgYWx3YXlzIHZpc2libGUgKHByaW1hcnkgYWN0aW9uKVxuXHRcdHRoaXMuX2lucHV0Qm94TWljQnRuIS5zdHlsZS5kaXNwbGF5ID0gdm9pY2VDb250cm9sc1N1cHByZXNzZWQgPyAnbm9uZScgOiAnJztcblx0XHRjb25zdCBrZXlMYWJlbCA9IHRoaXMuX3B0dEtleUxhYmVsLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBtaWNUb29sdGlwID0ga2V5TGFiZWxcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLnB1c2hUb1RhbGtLZXknLCBcIlB1c2ggdG8gdGFsayAoezB9KVwiLCBrZXlMYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ2FnZW50c1ZvaWNlLnB1c2hUb1RhbGsnLCBcIlB1c2ggdG8gdGFsa1wiKTtcblx0XHR0aGlzLl9pbnB1dEJveE1pY0J0biEudGl0bGUgPSBtaWNUb29sdGlwO1xuXHRcdHRoaXMuX2lucHV0Qm94TWljQnRuIS5hcmlhTGFiZWwgPSBtaWNUb29sdGlwO1xuXHRcdGNvbnN0IG1pY0NvbG9yID0gdm9pY2VTdGF0ZSA9PT0gJ2Vycm9yJyA/ICd2YXIoLS12c2NvZGUtZWRpdG9yRXJyb3ItZm9yZWdyb3VuZCknXG5cdFx0XHQ6IHZvaWNlU3RhdGUgPT09ICdsaXN0ZW5pbmcnID8gJ3ZhcigtLXZzY29kZS1lZGl0b3JJbmZvLWZvcmVncm91bmQpJ1xuXHRcdFx0XHQ6IHZvaWNlU3RhdGUgPT09ICdzcGVha2luZycgPyAndmFyKC0tdnNjb2RlLWFnZW50c1ZvaWNlLXNwZWFraW5nRm9yZWdyb3VuZCknXG5cdFx0XHRcdFx0OiAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknO1xuXHRcdHRoaXMuX2lucHV0Qm94TWljQnRuIS5zdHlsZS5jb2xvciA9IG1pY0NvbG9yO1xuXHRcdGNvbnN0IG1pY0lzQWN0aXZlID0gdm9pY2VTdGF0ZSA9PT0gJ2xpc3RlbmluZycgfHwgdm9pY2VTdGF0ZSA9PT0gJ3NwZWFraW5nJztcblx0XHR0aGlzLl9pbnB1dEJveE1pY0J0biEuY2xhc3NMaXN0LnRvZ2dsZSgnYWdlbnRzLXZvaWNlLW1vZGUtYWN0aXZlJywgbWljSXNBY3RpdmUpO1xuXHRcdHRoaXMuX2lucHV0Qm94TWljQnRuIS5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1hZ2VudHMtdm9pY2UtaW5wdXQtaWNvbi1yZ2InLCB2b2ljZVN0YXRlID09PSAnc3BlYWtpbmcnID8gJzE2MywxMTMsMjQ3JyA6ICc4OCwxNjYsMjU1Jyk7XG5cdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4hLnN0eWxlLmJvcmRlclJhZGl1cyA9ICc1MCUnO1xuXHRcdGlmICghbWljSXNBY3RpdmUpIHtcblx0XHRcdHRoaXMuX2lucHV0Qm94TWljQnRuIS5zdHlsZS5ib3hTaGFkb3cgPSAnbm9uZSc7XG5cdFx0fVxuXHRcdHRoaXMuX2lucHV0Qm94TWljQnRuIS5vbm1vdXNlZG93biA9IChlOiBNb3VzZUV2ZW50KSA9PiB7IGlmIChpc1NlY29uZGFyeVBvaW50ZXJHZXN0dXJlKGUpKSB7IHJldHVybjsgfSBlLnByZXZlbnREZWZhdWx0KCk7IHRoaXMuY2FsbGJhY2tzLnB0dERvd24oKTsgfTtcblx0XHR0aGlzLl9pbnB1dEJveE1pY0J0biEub25tb3VzZXVwID0gKGU6IE1vdXNlRXZlbnQpID0+IHsgaWYgKGlzU2Vjb25kYXJ5UG9pbnRlckdlc3R1cmUoZSkpIHsgcmV0dXJuOyB9IHRoaXMuY2FsbGJhY2tzLnB0dFVwKCk7IH07XG5cblx0XHQvLyBDb25uZWN0aW9uIGluZGljYXRvciBcdTIwMTQgdmlzaWJsZSB3aGVuIGNvbm5lY3RlZFxuXHRcdHRoaXMuX2lucHV0Qm94Q29ubkluZGljYXRvciEuc3R5bGUuZGlzcGxheSA9ICF2b2ljZUNvbnRyb2xzU3VwcHJlc3NlZCAmJiBzaG93Q29ubmVjdGVkID8gJycgOiAnbm9uZSc7XG5cdFx0dGhpcy5faW5wdXRCb3hDb25uSW5kaWNhdG9yIS5vbmNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLmNhbGxiYWNrcy5kaXNjb25uZWN0KCk7IH07XG5cblx0XHQvLyBGZWVkYmFjayBidXR0b24gXHUyMDE0IGFsd2F5cyB2aXNpYmxlXG5cdFx0dGhpcy5faW5wdXRCb3hGZWVkYmFja0J0biEuc3R5bGUuZGlzcGxheSA9IHZvaWNlQ29udHJvbHNTdXBwcmVzc2VkID8gJ25vbmUnIDogJyc7XG5cdFx0dGhpcy5faW5wdXRCb3hGZWVkYmFja0J0biEub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5fdG9nZ2xlRmVlZGJhY2tEaWFsb2coKTsgfTtcblxuXHRcdC8vIFNlc3Npb25zIGJ1dHRvbiBcdTIwMTQgYWx3YXlzIHZpc2libGUsIGljb24gdG9nZ2xlcyB3aXRoIGV4cGFuZGVkIHN0YXRlXG5cdFx0dGhpcy5faW5wdXRCb3hTZXNzaW9uc0J0biEuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRoaXMuX2lucHV0Qm94U2Vzc2lvbnNCdG4hLmNsYXNzTmFtZSA9IGBjb2RpY29uIGNvZGljb24tJHtzaG93RXhwYW5kZWQgPyAnY2hldnJvbi11cCcgOiAnbGlzdC10cmVlJ31gO1xuXHRcdHRoaXMuX2lucHV0Qm94U2Vzc2lvbnNCdG4hLnRpdGxlID0gc2hvd0V4cGFuZGVkXG5cdFx0XHQ/IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5jb2xsYXBzZVNlc3Npb25zJywgXCJDb2xsYXBzZSBzZXNzaW9uc1wiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2Uuc2Vzc2lvbnMnLCBcIlNlc3Npb25zXCIpO1xuXG5cdFx0Ly8gQ2xvc2UgYnV0dG9uXG5cdFx0dGhpcy5faW5wdXRCb3hDbG9zZUJ0biEuc3R5bGUuZGlzcGxheSA9IG9wdHMuc2hvd0Nsb3NlID8gJycgOiAnbm9uZSc7XG5cdFx0dGhpcy5faW5wdXRCb3hDbG9zZUJ0biEub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3MuY2xvc2VXaW5kb3coKTsgfTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURPTUNsYXNzaWNMYXlvdXQocmVhZGVyOiBJUmVhZGVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgb25ib2FyZGluZyA9IHRoaXMuX3Nob3dPbmJvYXJkaW5nLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCB2b2ljZVN0YXRlID0gdGhpcy5fdm9pY2VTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgb3B0cyA9IHRoaXMuX29wdGlvbnM7XG5cdFx0Y29uc3Qgc2hvd0V4cGFuZGVkID0gdGhpcy5fc2hvdWxkU2hvd0V4cGFuZGVkLnJlYWQocmVhZGVyKSAmJiBvcHRzLnNob3dFeHBhbmRDaGV2cm9uO1xuXG5cdFx0Ly8gVGl0bGUgcm93OiBoaWRkZW4gZHVyaW5nIG9uYm9hcmRpbmdcblx0XHR0aGlzLl90aXRsZVJvdy5zdHlsZS5kaXNwbGF5ID0gKG9uYm9hcmRpbmcgfHwgIW9wdHMudGl0bGUpID8gJ25vbmUnIDogJ2ZsZXgnO1xuXG5cdFx0Ly8gT25ib2FyZGluZyB2cyBtYWluIFVJXG5cdFx0aWYgKG9uYm9hcmRpbmcgJiYgIXRoaXMuX2lzUmVjb25uZWN0aW5nLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0dGhpcy5fb25ib2FyZGluZ0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMuX2hlYWRlckNvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl92b2ljZUJhckNvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9zdGF0dXNUZXh0RGl2LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl90cmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3N0YXR1c1Jvd3NDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9leHBhbmRTcGFjZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2NoZXZyb25XcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRcdHRoaXMuX29uYm9hcmRpbmdDb21wb25lbnQudXBkYXRlKHtcblx0XHRcdFx0cHR0S2V5TGFiZWw6IHRoaXMuX3B0dEtleUxhYmVsLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0aXNDb25uZWN0aW5nOiB0aGlzLl9vbmJvYXJkaW5nUGVuZGluZ0Nvbm5lY3QucmVhZChyZWFkZXIpIHx8IHRoaXMuX2lzQ29ubmVjdGluZy5yZWFkKHJlYWRlciksXG5cdFx0XHRcdG9uR2V0U3RhcnRlZDogKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLl9kaXNtaXNzT25ib2FyZGluZyh0cnVlKTsgfSxcblx0XHRcdFx0b25PcGVuUHR0S2V5U2V0dGluZ3M6IChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3Mub3BlblB0dEtleVNldHRpbmdzKCk7IH0sXG5cdFx0XHRcdG9uT3BlblBvcG91dDogdGhpcy5jYWxsYmFja3Mub3BlblBvcG91dCA/IChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3Mub3BlblBvcG91dD8uKCk7IH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb25ib2FyZGluZ0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9oZWFkZXJDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cblx0XHRcdGNvbnN0IGZlZWRiYWNrU3RhdGUgPSB0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0dGhpcy5faGVhZGVyQ29tcG9uZW50LnVwZGF0ZSh7XG5cdFx0XHRcdGNvcGlsb3RJY29uU3JjOiB0aGlzLmNhbGxiYWNrcy5jb3BpbG90SWNvblNyYyxcblx0XHRcdFx0c2hvd0NvcGlsb3RJY29uOiBvcHRzLnNob3dDb3BpbG90SWNvbixcblx0XHRcdFx0aXNDb25uZWN0ZWQ6IHRoaXMuX2lzQ29ubmVjdGVkLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0aXNDb25uZWN0aW5nOiB0aGlzLl9pc0Nvbm5lY3RpbmcucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRpc1JlY29ubmVjdGluZzogdGhpcy5faXNSZWNvbm5lY3RpbmcucmVhZChyZWFkZXIpLFxuXHRcdFx0XHR2b2ljZVN0YXRlLFxuXHRcdFx0XHRkcmFnZ2FibGU6IG9wdHMuZHJhZ2dhYmxlLFxuXHRcdFx0XHRzaG93Q2xvc2U6IG9wdHMuc2hvd0Nsb3NlLFxuXHRcdFx0XHRzaG93UG9wb3V0OiAhIXRoaXMuY2FsbGJhY2tzLm9wZW5Qb3BvdXQgJiYgdGhpcy5fcG9wb3V0QXZhaWxhYmxlLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0aGlkZURpc2Nvbm5lY3Q6IHRoaXMuY2FsbGJhY2tzLmhpZGVEaXNjb25uZWN0LFxuXHRcdFx0XHRjZW50ZXJDb25uZWN0QnV0dG9uOiBvcHRzLmNlbnRlckNvbm5lY3RCdXR0b24sXG5cdFx0XHRcdG9uTWljRG93bjogKGU6IE1vdXNlRXZlbnQpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB0aGlzLmNhbGxiYWNrcy5wdHREb3duKCk7IH0sXG5cdFx0XHRcdG9uTWljVXA6ICgpID0+IHsgdGhpcy5jYWxsYmFja3MucHR0VXAoKTsgfSxcblx0XHRcdFx0b25Db25uZWN0Q2xpY2s6IChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzQ29ubmVjdGluZy5nZXQoKSkgeyByZXR1cm47IH1cblx0XHRcdFx0XHRpZiAodGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuY2FsbGJhY2tzLmRpc2Nvbm5lY3QoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5jYWxsYmFja3MuY29ubmVjdCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b25EaXNjb25uZWN0Q2xpY2s6IChlOiBNb3VzZUV2ZW50KSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3MuZGlzY29ubmVjdCgpOyB9LFxuXHRcdFx0XHRvbkNsb3NlQ2xpY2s6IChlOiBNb3VzZUV2ZW50KSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3MuY2xvc2VXaW5kb3coKTsgfSxcblx0XHRcdFx0b25Ub2dnbGVDbGljazogKGU6IE1vdXNlRXZlbnQpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLl9leHBhbmRlZC5zZXQoIXRoaXMuX2V4cGFuZGVkLmdldCgpLCB1bmRlZmluZWQpOyB9LFxuXHRcdFx0XHRvbk1pY0NvbnRleHRNZW51OiAoZTogTW91c2VFdmVudCkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7IHRoaXMuY2FsbGJhY2tzLnNob3dWb2ljZUNvbnRleHRNZW51KGUpOyB9LFxuXHRcdFx0XHRvblBvcG91dENsaWNrOiAoZTogTW91c2VFdmVudCkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7IHRoaXMuY2FsbGJhY2tzLm9wZW5Qb3BvdXQ/LigpOyB9LFxuXHRcdFx0XHRvbkZlZWRiYWNrQ2xpY2s6IChlOiBNb3VzZUV2ZW50KSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5fdG9nZ2xlRmVlZGJhY2tEaWFsb2coKTsgfSxcblx0XHRcdFx0cHR0S2V5TGFiZWw6IHRoaXMuX3B0dEtleUxhYmVsLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0ZXhwYW5kZWQ6IHNob3dFeHBhbmRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoZmVlZGJhY2tTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl92b2ljZUJhckNvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudC51cGRhdGUoe1xuXHRcdFx0XHRcdG9uU3VibWl0OiAodGV4dCkgPT4gdGhpcy5fc3VibWl0RmVlZGJhY2sodGV4dCksXG5cdFx0XHRcdFx0b25DYW5jZWw6ICgpID0+IHsgdGhpcy5fZmVlZGJhY2tEaWFsb2dTdGF0ZS5zZXQobnVsbCwgdW5kZWZpbmVkKTsgfSxcblx0XHRcdFx0fSwgZmVlZGJhY2tTdGF0ZSk7XG5cdFx0XHRcdC8vIEhpZGUgZXZlcnl0aGluZyBiZWxvdyB3aGVuIGZlZWRiYWNrIGRpYWxvZyBpcyBvcGVuXG5cdFx0XHRcdHRoaXMuX3N0YXR1c1RleHREaXYuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX3N0YXR1c1Jvd3NDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5fZXhwYW5kU3BhY2VyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX2NoZXZyb25XcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRcdFx0Ly8gVm9pY2UgYmFyIChsaXN0ZW5pbmcvc3BlYWtpbmcgaW5kaWNhdG9yIHdpdGggc3RvcCBidXR0b24pXG5cdFx0XHRcdHRoaXMuX3ZvaWNlQmFyQ29tcG9uZW50LnVwZGF0ZSh7XG5cdFx0XHRcdFx0dm9pY2VTdGF0ZSxcblx0XHRcdFx0XHRzcGVha2luZ1Nlc3Npb25MYWJlbDogdGhpcy5fc3BlYWtpbmdTZXNzaW9uTGFiZWwucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdHNwZWFraW5nU2Vzc2lvbjogdGhpcy5fc3BlYWtpbmdTZXNzaW9uLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRvblN0b3BTcGVlY2g6ICgpID0+IHRoaXMuY2FsbGJhY2tzLnN0b3BQbGF5YmFjaygpLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBTdGF0dXMgdGV4dCBcdTIwMTQgYWx3YXlzIHNob3cgd2hlbiBpbiBlcnJvciBzdGF0ZSAoZS5nLiBtaWMgZGVuaWVkKVxuXHRcdFx0XHRjb25zdCBzdGF0dXNUZXh0ID0gdGhpcy5fc3RhdHVzVGV4dC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGlzRXJyb3IgPSB2b2ljZVN0YXRlID09PSAnZXJyb3InO1xuXHRcdFx0XHRpZiAoKG9wdHMuc2hvd1N0YXR1c1RleHQgfHwgaXNFcnJvcikgJiYgc3RhdHVzVGV4dCkge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1c1RleHREaXYuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1c1RleHREaXYudGV4dENvbnRlbnQgPSBzdGF0dXNUZXh0O1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1c1RleHREaXYuc3R5bGUuY29sb3IgPSBpc0Vycm9yID8gJ3ZhcigtLXZzY29kZS1lZGl0b3JFcnJvci1mb3JlZ3JvdW5kKScgOiAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXNUZXh0RGl2LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUcmFuc2NyaXB0XG5cdFx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQudXBkYXRlKHsgdHVybnM6IHRoaXMuX3RyYW5zY3JpcHRUdXJucy5yZWFkKHJlYWRlcikgfSk7XG5cblx0XHRcdFx0Ly8gU3RhdHVzIHJvd3MgKGNvbGxhcHNlZCkgb3Igc2Vzc2lvbiBsaXN0IChleHBhbmRlZClcblx0XHRcdFx0aWYgKCFzaG93RXhwYW5kZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXNSb3dzQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1c1Jvd3NDb21wb25lbnQudXBkYXRlKHtcblx0XHRcdFx0XHRcdHdvcmtpbmdDb3VudDogdGhpcy5fd29ya2luZ0NvdW50LnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdG5lZWRzSW5wdXRDb3VudDogdGhpcy5fbmVlZHNJbnB1dENvdW50LnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdGRvbmVDb3VudDogdGhpcy5fZG9uZUNvdW50LnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdHNob3dDb3VudGVyczogb3B0cy5zaG93U3RhdHVzQ291bnRlcnMsXG5cdFx0XHRcdFx0XHRzcGVha2luZ1Nlc3Npb25MYWJlbDogdGhpcy5fc3BlYWtpbmdTZXNzaW9uTGFiZWwucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdFx0c3BlYWtpbmdTZXNzaW9uUmVzb3VyY2U6IHRoaXMuX3NwZWFraW5nU2Vzc2lvbi5yZWFkKHJlYWRlciksXG5cdFx0XHRcdFx0XHRwZW5kaW5nVG9vbENvbmZpcm1hdGlvbnM6IHRoaXMuX3BlbmRpbmdUb29sQ29uZmlybWF0aW9ucy5yZWFkKHJlYWRlciksXG5cdFx0XHRcdFx0XHRvbk9wZW5TZXNzaW9uOiAocikgPT4gdGhpcy5jYWxsYmFja3Mub3BlblNlc3Npb24ociksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdHVzUm93c0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uTGlzdENvbXBvbmVudC51cGRhdGUoe1xuXHRcdFx0XHRcdFx0c2Vzc2lvbnM6IHRoaXMuX3Nlc3Npb25zLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdGdyb3VwczogdGhpcy5fc2Vzc2lvbkdyb3Vwcy5yZWFkKHJlYWRlciksXG5cdFx0XHRcdFx0XHRzZWxlY3RlZFRhcmdldDogdGhpcy5fc2VsZWN0ZWRUYXJnZXRTZXNzaW9uLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdG9uT3BlblNlc3Npb246IChyKSA9PiB0aGlzLmNhbGxiYWNrcy5vcGVuU2Vzc2lvbihyKSxcblx0XHRcdFx0XHRcdG9uU3RvcFNlc3Npb246IChyKSA9PiB0aGlzLmNhbGxiYWNrcy5zdG9wU2Vzc2lvbihyKSxcblx0XHRcdFx0XHRcdG9uQ2FuY2VsU2Vzc2lvbjogKHIpID0+IHRoaXMuY2FsbGJhY2tzLmNhbmNlbFNlc3Npb24ociksXG5cdFx0XHRcdFx0XHRvblNlbGVjdFRhcmdldDogKHIpID0+IHsgdGhpcy5fc2VsZWN0ZWRUYXJnZXRTZXNzaW9uLnNldChyLCB1bmRlZmluZWQpOyB0aGlzLmNhbGxiYWNrcy5zZWxlY3RUYXJnZXRTZXNzaW9uKHIpOyB9LFxuXHRcdFx0XHRcdFx0b25OZXdTZXNzaW9uOiAoKSA9PiB0aGlzLmNhbGxiYWNrcy5uZXdTZXNzaW9uQXNUYXJnZXQoKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2V4cGFuZFNwYWNlci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdHRoaXMuX2NoZXZyb25XcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSBvcHRzLnNob3dFeHBhbmRDaGV2cm9uID8gJ2ZsZXgnIDogJ25vbmUnO1xuXHRcdFx0XHR0aGlzLl9jaGV2cm9uV3JhcHBlci50aXRsZSA9IHNob3dFeHBhbmRlZCA/ICdDb2xsYXBzZSBzZXNzaW9ucycgOiAnRXhwYW5kIHNlc3Npb25zJztcblx0XHRcdFx0dGhpcy5fY2hldnJvbkljb24uY2xhc3NOYW1lID0gYGNvZGljb24gY29kaWNvbi0ke3Nob3dFeHBhbmRlZCA/ICdjaGV2cm9uLXVwJyA6ICdjaGV2cm9uLWRvd24nfWA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIFB1YmxpYyBzdGF0ZSBzZXR0ZXJzIChjYWxsZWQgYnkgdGhlIHNlcnZpY2UpIC0tLVxuXG5cdHNldENvbm5lY3RlZChjb25uZWN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Nvbm5lY3RlZC5zZXQoY29ubmVjdGVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0Q29ubmVjdGluZyhjb25uZWN0aW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faXNDb25uZWN0aW5nLnNldChjb25uZWN0aW5nLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0UmVjb25uZWN0aW5nKHJlY29ubmVjdGluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2lzUmVjb25uZWN0aW5nLnNldChyZWNvbm5lY3RpbmcsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRWb2ljZVN0YXRlKHN0YXRlOiBWb2ljZVN0YXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fdm9pY2VTdGF0ZS5zZXQoc3RhdGUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRTdGF0dXNDb3VudHMod29ya2luZzogbnVtYmVyLCBuZWVkc0lucHV0OiBudW1iZXIsIGRvbmU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3dvcmtpbmdDb3VudC5zZXQod29ya2luZywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9uZWVkc0lucHV0Q291bnQuc2V0KG5lZWRzSW5wdXQsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fZG9uZUNvdW50LnNldChkb25lLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0UGVuZGluZ1Rvb2xDb25maXJtYXRpb25zKGNvbmZpcm1hdGlvbnM6IHJlYWRvbmx5IElQZW5kaW5nVG9vbENvbmZpcm1hdGlvbltdKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ1Rvb2xDb25maXJtYXRpb25zLnNldChjb25maXJtYXRpb25zLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0U3BlYWtpbmdTZXNzaW9uKHNlc3Npb246IFVSSSB8IHVuZGVmaW5lZCwgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NwZWFraW5nU2Vzc2lvbi5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9zcGVha2luZ1Nlc3Npb25MYWJlbC5zZXQobGFiZWwsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRTZXNzaW9ucyhzZXNzaW9uczogcmVhZG9ubHkgU2Vzc2lvblJvd0RhdGFbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25zLnNldChzZXNzaW9ucywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFNlbGVjdGVkVGFyZ2V0U2Vzc2lvbihyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0ZWRUYXJnZXRTZXNzaW9uLnNldChyZXNvdXJjZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFNlc3Npb25Hcm91cHMoZ3JvdXBzOiByZWFkb25seSBTZXNzaW9uR3JvdXBEYXRhW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXNzaW9uR3JvdXBzLnNldChncm91cHMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRQdHRLZXlMYWJlbChsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcHR0S2V5TGFiZWwuc2V0KGxhYmVsLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0VHJhbnNjcmlwdFR1cm5zKHR1cm5zOiByZWFkb25seSBJVHJhbnNjcmlwdFR1cm5bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3RyYW5zY3JpcHRUdXJucy5zZXQodHVybnMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRTdGF0dXNUZXh0KHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXR1c1RleHQuc2V0KHRleHQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRWb2ljZUNvbnRyb2xzU3VwcHJlc3NlZChzdXBwcmVzc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fdm9pY2VDb250cm9sc1N1cHByZXNzZWQuc2V0KHN1cHByZXNzZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRQb3BvdXRBdmFpbGFibGUoYXZhaWxhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcG9wb3V0QXZhaWxhYmxlLnNldChhdmFpbGFibGUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvLyAtLS0gRmVlZGJhY2sgZGlhbG9nIC0tLVxuXG5cdHByaXZhdGUgX3RvZ2dsZUZlZWRiYWNrRGlhbG9nKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnNldChudWxsLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zaG93T25ib2FyZGluZy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnNldCh7IGlzU3VibWl0dGluZzogZmFsc2UsIHN1Ym1pdHRlZDogZmFsc2UgfSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gT25ib2FyZGluZyAtLS1cblxuXHRwcml2YXRlIF9kaXNtaXNzT25ib2FyZGluZyhjb25uZWN0OiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoY29ubmVjdCkge1xuXHRcdFx0Ly8gRG9uJ3QgZGlzbWlzcyB5ZXQgXHUyMDE0IGtpY2sgb2ZmIGNvbm5lY3Rpb24sIHdhaXQgZm9yIGl0IHRvIHN1Y2NlZWRcblx0XHRcdC8vIHZpYSB0aGUgZWZmZWN0IHRoYXQgd2F0Y2hlcyBpc0Nvbm5lY3RlZC9pc0Nvbm5lY3RpbmcuXG5cdFx0XHRpZiAodGhpcy5faXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0Ly8gQWxyZWFkeSBjb25uZWN0ZWQgc29tZWhvdyBcdTIwMTQganVzdCBkaXNtaXNzLlxuXHRcdFx0XHR0aGlzLl9zaG93T25ib2FyZGluZy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuY2FsbGJhY2tzLm9uT25ib2FyZGluZ0NvbXBsZXRlZD8uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5faXNDb25uZWN0aW5nLmdldCgpICYmICF0aGlzLl9vbmJvYXJkaW5nUGVuZGluZ0Nvbm5lY3QuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fb25ib2FyZGluZ1BlbmRpbmdDb25uZWN0LnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5jb25uZWN0KCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Nob3dPbmJvYXJkaW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuY2FsbGJhY2tzLm9uT25ib2FyZGluZ0NvbXBsZXRlZD8uKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEV4dGVybmFsbHkgdHJpZ2dlciBvbmJvYXJkaW5nIGRpc21pc3NhbCAoZS5nLiB3aGVuIHRoZSB1c2VyIGNvbm5lY3RzXG5cdCAqIGZyb20gdGhlIGZsb2F0aW5nIG1pbmktdmlldywgdGhlIG1haW4gcGFuZWwgc2hvdWxkIGRyb3AgdGhlIG9uYm9hcmRpbmcpLlxuXHQgKiBBbHNvIGNsZWFycyBhbnkgaW4tZmxpZ2h0IHBlbmRpbmctY29ubmVjdCBzdGF0ZSBzbyBhIGxhdGVyIHN1Y2Nlc3Ncblx0ICogZG9lc24ndCByZS10cmlnZ2VyIHRoZSBjb21wbGV0aW9uIGNhbGxiYWNrLlxuXHQgKi9cblx0ZGlzbWlzc09uYm9hcmRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25ib2FyZGluZ1BlbmRpbmdDb25uZWN0LnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRpZiAodGhpcy5fc2hvd09uYm9hcmRpbmcuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX3Nob3dPbmJvYXJkaW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdWJtaXRGZWVkYmFjayh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnNldCh7IGlzU3VibWl0dGluZzogdHJ1ZSwgc3VibWl0dGVkOiBmYWxzZSB9LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuY2FsbGJhY2tzLnN1Ym1pdEZlZWRiYWNrKHRleHQpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmIChyZXN1bHQub2spIHtcblx0XHRcdFx0dGhpcy5fZmVlZGJhY2tEaWFsb2dTdGF0ZS5zZXQoeyBpc1N1Ym1pdHRpbmc6IGZhbHNlLCBzdWJtaXR0ZWQ6IHRydWUgfSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7IHRoaXMuX2ZlZWRiYWNrRGlhbG9nU3RhdGUuc2V0KG51bGwsIHVuZGVmaW5lZCk7IH0sIDMwMDApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZmVlZGJhY2tEaWFsb2dTdGF0ZS5zZXQoeyBpc1N1Ym1pdHRpbmc6IGZhbHNlLCBzdWJtaXR0ZWQ6IGZhbHNlLCBlcnJvcjogcmVzdWx0LmVycm9yID8/IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5mZWVkYmFja0Vycm9yJywgXCJGYWlsZWQgdG8gc3VibWl0XCIpIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0gR2xvdyBhbmltYXRpb24gKGRlY291cGxlZCBmcm9tIGF1dG9ydW4gXHUyMDE0IGRpcmVjdCBET00gdXBkYXRlcykgLS0tXG5cblx0cHJpdmF0ZSBfYW5pbWF0aW9uRnJhbWVJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3N0YXJ0V2F2ZWZvcm1BbmltYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FuaW1hdGlvbkZyYW1lSWQgIT09IHVuZGVmaW5lZCkgeyByZXR1cm47IH1cblx0XHRjb25zdCBhbmltYXRlID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fYW5pbWF0aW9uRnJhbWVJZCA9IGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xuXHRcdFx0Y29uc3Qgb25ib2FyZGluZyA9IHRoaXMuX3Nob3dPbmJvYXJkaW5nLmdldCgpO1xuXHRcdFx0Y29uc3Qgdm9pY2VTdGF0ZSA9IHRoaXMuX3ZvaWNlU3RhdGUuZ2V0KCk7XG5cdFx0XHQvLyBUaGUgcmVhY3RpdmUgYXV0b3J1biBzdGFydHMvc3RvcHMgdGhpcyBsb29wOyBndWFyZCBhZ2FpbnN0IGEgZnJhbWVcblx0XHRcdC8vIHRoYXQgcmFjZXMgYSB0cmFuc2l0aW9uIHRvIGEgbm9uLWdsb3dpbmcgc3RhdGUgKHN0eWxlcyBhcmUgY2xlYXJlZFxuXHRcdFx0Ly8gYnkgX3N0b3BXYXZlZm9ybUFuaW1hdGlvbigpKS5cblx0XHRcdGlmICghKG9uYm9hcmRpbmcgfHwgdm9pY2VTdGF0ZSA9PT0gJ2xpc3RlbmluZycgfHwgdm9pY2VTdGF0ZSA9PT0gJ3NwZWFraW5nJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhbmFseXNlciA9IHRoaXMuY2FsbGJhY2tzLmdldEFuYWx5c2VyTm9kZSgpO1xuXHRcdFx0bGV0IGludGVuc2l0eTogbnVtYmVyO1xuXHRcdFx0aWYgKG9uYm9hcmRpbmcpIHtcblx0XHRcdFx0aW50ZW5zaXR5ID0gMC42O1xuXHRcdFx0fSBlbHNlIGlmICghYW5hbHlzZXIpIHtcblx0XHRcdFx0aW50ZW5zaXR5ID0gMC4zO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZGF0YUFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYW5hbHlzZXIuZnJlcXVlbmN5QmluQ291bnQpO1xuXHRcdFx0XHRhbmFseXNlci5nZXRCeXRlRnJlcXVlbmN5RGF0YShkYXRhQXJyYXkpO1xuXHRcdFx0XHRsZXQgc3VtID0gMDtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhQXJyYXkubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRzdW0gKz0gZGF0YUFycmF5W2ldO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGludGVuc2l0eSA9IE1hdGgubWluKDEsIChzdW0gLyBkYXRhQXJyYXkubGVuZ3RoKSAvIDgwKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQW5pbWF0ZSBpbnB1dCBib3ggY29udGFpbmVyIGJvcmRlci9zaGFkb3cgKGlucHV0Qm94TGF5b3V0KVxuXHRcdFx0aWYgKHRoaXMuX2dsb3dDb250cm9sbGVyICYmICh2b2ljZVN0YXRlID09PSAnbGlzdGVuaW5nJyB8fCB2b2ljZVN0YXRlID09PSAnc3BlYWtpbmcnKSkge1xuXHRcdFx0XHR0aGlzLl9nbG93Q29udHJvbGxlci5yZW5kZXIodm9pY2VTdGF0ZSwgaW50ZW5zaXR5LCB0aGlzLmNhbGxiYWNrcy5pc01vdGlvblJlZHVjZWQoKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbG9ycyA9IHRoaXMuY2FsbGJhY2tzLmdldEdsb3dDb2xvcnMoKTtcblx0XHRcdGlmICh0aGlzLl9pbnB1dEJveE1pY0J0bikge1xuXHRcdFx0XHRjb25zdCBpY29uR2xvd0FjdGl2ZSA9IHZvaWNlU3RhdGUgPT09ICdsaXN0ZW5pbmcnIHx8IHZvaWNlU3RhdGUgPT09ICdzcGVha2luZyc7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94TWljQnRuLnN0eWxlLmJveFNoYWRvdyA9IGljb25HbG93QWN0aXZlXG5cdFx0XHRcdFx0PyBjb21wdXRlVm9pY2VNaWNHbG93Qm94U2hhZG93KHZvaWNlU3RhdGUsIGludGVuc2l0eSwgY29sb3JzKVxuXHRcdFx0XHRcdDogJ25vbmUnO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbGFzc2ljIGxheW91dCBnbG93IGRpdlxuXHRcdFx0dGhpcy5fZ2xvd0Rpdi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRjb25zdCBiYXNlT3BhY2l0eSA9IDAuMTUgKyBpbnRlbnNpdHkgKiAwLjQ7XG5cdFx0XHRjb25zdCB7IHIsIGcsIGIgfSA9IHZvaWNlR2xvd1N0YXRlQ29sb3Iob25ib2FyZGluZyA/ICdzcGVha2luZycgOiB2b2ljZVN0YXRlLCBjb2xvcnMpLnJnYmE7XG5cdFx0XHRjb25zdCByZ2IgPSBgJHtyfSwke2d9LCR7Yn1gO1xuXHRcdFx0dGhpcy5fZ2xvd0Rpdi5zdHlsZS5iYWNrZ3JvdW5kID0gYHJhZGlhbC1ncmFkaWVudChlbGxpcHNlIDQwJSA3MCUgYXQgNTAlIDAlLCByZ2JhKCR7cmdifSwke2Jhc2VPcGFjaXR5fSkgMCUsIHRyYW5zcGFyZW50IDEwMCUpLCByYWRpYWwtZ3JhZGllbnQoZWxsaXBzZSA3MCUgMTAwJSBhdCA1MCUgMCUsIHJnYmEoJHtyZ2J9LCR7YmFzZU9wYWNpdHkgKiAwLjR9KSAwJSwgdHJhbnNwYXJlbnQgMTAwJSlgO1xuXHRcdH07XG5cdFx0dGhpcy5fYW5pbWF0aW9uRnJhbWVJZCA9IGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcFdhdmVmb3JtQW5pbWF0aW9uKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hbmltYXRpb25GcmFtZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikuY2FuY2VsQW5pbWF0aW9uRnJhbWUodGhpcy5fYW5pbWF0aW9uRnJhbWVJZCk7XG5cdFx0XHR0aGlzLl9hbmltYXRpb25GcmFtZUlkID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBDbGVhciBhbnkgZ2xvdyBsZWZ0IGJ5IHRoZSBsYXN0IHJlbmRlcmVkIGZyYW1lIHNvIGlkbGUvZGlzY29ubmVjdGVkXG5cdFx0Ly8gc2hvd3Mgbm8gcmVzaWR1YWwgZ2xvdyBub3cgdGhhdCB0aGUgbG9vcCBubyBsb25nZXIgcnVucyB3aGlsZSBpZGxlLlxuXHRcdHRoaXMuX2dsb3dEaXYuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLl9nbG93Q29udHJvbGxlcj8uY2xlYXIoKTtcblx0XHRpZiAodGhpcy5faW5wdXRCb3hNaWNCdG4pIHtcblx0XHRcdHRoaXMuX2lucHV0Qm94TWljQnRuLnN0eWxlLmJveFNoYWRvdyA9ICdub25lJztcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gX2lzVGV4dElucHV0KHRhcmdldDogRXZlbnRUYXJnZXQgfCBudWxsKTogYm9vbGVhbiB7XG5cdGlmICghdGFyZ2V0IHx8IHR5cGVvZiAodGFyZ2V0IGFzIEVsZW1lbnQpLnRhZ05hbWUgIT09ICdzdHJpbmcnKSB7IHJldHVybiBmYWxzZTsgfVxuXHRjb25zdCBlbCA9IHRhcmdldCBhcyBFbGVtZW50O1xuXHRjb25zdCB0YWcgPSBlbC50YWdOYW1lO1xuXHRpZiAodGFnID09PSAnVEVYVEFSRUEnIHx8IHRhZyA9PT0gJ0lOUFVUJykgeyByZXR1cm4gdHJ1ZTsgfVxuXHQvLyBIVE1MRWxlbWVudC5pc0NvbnRlbnRFZGl0YWJsZSBpcyByZWFsbS1zcGVjaWZpYzsgY2hlY2sgZGVmZW5zaXZlbHkuXG5cdHJldHVybiAoZWwgYXMgSFRNTEVsZW1lbnQgJiB7IGlzQ29udGVudEVkaXRhYmxlPzogYm9vbGVhbiB9KS5pc0NvbnRlbnRFZGl0YWJsZSA9PT0gdHJ1ZTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGlCQUFpQixTQUFTLGVBQXVEO0FBQzFGLFNBQVMsWUFBWSxvQkFB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
