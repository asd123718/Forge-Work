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
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { isNumber } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { SpeechTimeoutDefault } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { ISpeechService, AccessibilityVoiceSettingId, SpeechToTextStatus } from "../../../speech/common/speechService.js";
import { ChatSpeechToTextState, IChatSpeechToTextService } from "../../../chat/browser/speechToText/chatSpeechToTextService.js";
import { getDictationPreparingLabel } from "../../../chat/browser/speechToText/dictationDownloadRing.js";
import { alert } from "../../../../../base/browser/ui/aria/aria.js";
import { addDisposableListener, EventType, getActiveWindow } from "../../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
import { TerminalCommandId } from "../../../terminal/common/terminal.js";
import { TerminalContextKeys } from "../../../terminal/common/terminalContextKey.js";
import { TerminalInitialHintContribution } from "../../inlineHint/browser/terminal.initialHint.contribution.js";
const symbolMap = [
  ["dollar sign", "$"],
  ["double quote", '"'],
  ["open paren", "("],
  ["close paren", ")"],
  ["open parenthesis", "("],
  ["close parenthesis", ")"],
  ["open bracket", "["],
  ["close bracket", "]"],
  ["open brace", "{"],
  ["close brace", "}"],
  ["open angle bracket", "<"],
  ["close angle bracket", ">"],
  ["greater than", ">"],
  ["less than", "<"],
  ["ampersand", "&"],
  ["dollar", "$"],
  ["percent", "%"],
  ["asterisk", "*"],
  ["star", "*"],
  ["plus", "+"],
  ["equals", "="],
  ["exclamation", "!"],
  ["forward slash", "/"],
  ["slash", "/"],
  ["backslash", "\\"],
  ["pipe", "|"],
  ["tilde", "~"],
  ["caret", "^"],
  ["at sign", "@"],
  ["hashtag", "#"],
  ["pound", "#"],
  ["hash", "#"],
  ["colon", ":"],
  ["semicolon", ";"],
  ["underscore", "_"],
  ["hyphen", "-"],
  ["dash", "-"],
  ["dot", "."],
  ["period", "."],
  ["quote", "'"]
];
function postProcessTerminalDictation(text) {
  let input = text.replaceAll(/[.,?;!]/g, "");
  for (const [spoken, symbol] of symbolMap) {
    input = input.replace(new RegExp("\\b" + spoken + "\\b", "gi"), symbol);
  }
  input = input.replace(/^(\s*)([A-Z])/, (_, leading, letter) => leading + letter.toLowerCase());
  return input;
}
let TerminalVoiceSession = class extends Disposable {
  constructor(_speechService, _chatSpeechToTextService, _terminalService, _configurationService, contextKeyService, _hoverService, _keybindingService) {
    super();
    this._speechService = _speechService;
    this._chatSpeechToTextService = _chatSpeechToTextService;
    this._terminalService = _terminalService;
    this._configurationService = _configurationService;
    this._hoverService = _hoverService;
    this._keybindingService = _keybindingService;
    this._input = "";
    /** True while the current session is driven by the built-in on-device engine. */
    this._usingBuiltin = false;
    /** True while awaiting the built-in engine's final transcript during accept. */
    this._builtinFinalizing = false;
    this._sessionTerminalDisposed = false;
    this._disposables = this._register(new DisposableStore());
    this._decorationDisposables = this._register(new DisposableStore());
    this._terminalDictationInProgress = TerminalContextKeys.terminalDictationInProgress.bindTo(contextKeyService);
  }
  static getInstance(instantiationService) {
    if (!TerminalVoiceSession._instance) {
      TerminalVoiceSession._instance = instantiationService.createInstance(TerminalVoiceSession);
    }
    return TerminalVoiceSession._instance;
  }
  async start() {
    this.stop();
    const activeInstance = this._terminalService.activeInstance;
    this._sessionTerminalInstanceId = activeInstance?.instanceId;
    this._sessionTerminalDisposed = false;
    this._disposables.add(this._terminalService.onDidChangeActiveInstance((instance) => {
      if (instance?.instanceId !== this._sessionTerminalInstanceId) {
        this.stop();
      }
    }));
    this._disposables.add(this._terminalService.onDidDisposeInstance((instance) => {
      if (instance.instanceId === this._sessionTerminalInstanceId) {
        this._sessionTerminalDisposed = true;
        this.stop();
      }
    }));
    if (activeInstance) {
      TerminalInitialHintContribution.get(activeInstance)?.dispose();
    }
    let voiceTimeout = this._configurationService.getValue(AccessibilityVoiceSettingId.SpeechTimeout);
    if (!isNumber(voiceTimeout) || voiceTimeout < 0) {
      voiceTimeout = SpeechTimeoutDefault;
    }
    this._acceptTranscriptionScheduler = this._disposables.add(new RunOnceScheduler(() => {
      if (this._usingBuiltin) {
        this.stop(true);
        return;
      }
      this._sendText();
      this.stop();
    }, voiceTimeout));
    this._cancellationTokenSource = new CancellationTokenSource();
    this._register(toDisposable(() => this._cancellationTokenSource?.dispose(true)));
    if (this._chatSpeechToTextService.isConfigured) {
      return this._startBuiltin(voiceTimeout);
    }
    const session = await this._speechService.createSpeechToTextSession(this._cancellationTokenSource?.token, "terminal");
    this._disposables.add(session.onDidChange((e) => {
      if (this._cancellationTokenSource?.token.isCancellationRequested) {
        return;
      }
      switch (e.status) {
        case SpeechToTextStatus.Started:
          this._terminalDictationInProgress.set(true);
          if (!this._decoration) {
            this._createDecoration();
          }
          break;
        case SpeechToTextStatus.Recognizing: {
          this._updateInput(e);
          this._renderGhostText(e);
          this._updateDecoration();
          if (voiceTimeout > 0) {
            this._acceptTranscriptionScheduler.cancel();
          }
          break;
        }
        case SpeechToTextStatus.Recognized:
          this._updateInput(e);
          this._sendText();
          this._ghostText?.dispose();
          this._ghostText = void 0;
          this._ghostTextMarker?.dispose();
          this._ghostTextMarker = void 0;
          this._updateDecoration();
          this._input = "";
          break;
        case SpeechToTextStatus.Stopped:
          this.stop();
          break;
      }
    }));
  }
  /**
   * Drive terminal dictation from the built-in on-device engine. Unlike the
   * extension provider (which emits discrete `Recognizing`/`Recognized` events
   * per utterance), the built-in engine streams a single growing cumulative
   * transcript. We render it live as ghost text and keep it staged in
   * `_input`, then send it once the silence timeout elapses or the user stops.
   */
  async _startBuiltin(voiceTimeout) {
    const service = this._chatSpeechToTextService;
    if (service.isBusy) {
      await service.cancel();
    }
    if (service.state !== ChatSpeechToTextState.Idle) {
      this.stop();
      return;
    }
    this._usingBuiltin = true;
    this._terminalDictationInProgress.set(true);
    if (!this._decoration) {
      this._createDecoration();
    }
    const renderPreparing = () => {
      if (this._cancellationTokenSource?.token.isCancellationRequested || this._builtinFinalizing) {
        return;
      }
      if (service.isPreparingModel) {
        this._renderPreparingText(getDictationPreparingLabel(service));
      }
    };
    renderPreparing();
    this._disposables.add(service.onDidChangePreparingModel(() => renderPreparing()));
    this._disposables.add(service.onDidChangeModelDownloadProgress(() => renderPreparing()));
    this._disposables.add(service.onDidUpdateTranscript((update) => {
      if (this._cancellationTokenSource?.token.isCancellationRequested || this._builtinFinalizing) {
        return;
      }
      const event = { status: SpeechToTextStatus.Recognizing, text: update.text };
      this._updateInput(event);
      this._renderGhostText(event);
      this._updateDecoration();
      if (voiceTimeout > 0) {
        this._acceptTranscriptionScheduler.cancel();
        this._acceptTranscriptionScheduler.schedule();
      }
    }));
    this._disposables.add(service.onDidChangeState((state) => {
      if (state === ChatSpeechToTextState.Idle && !this._builtinFinalizing && !this._cancellationTokenSource?.token.isCancellationRequested) {
        this.stop();
      }
    }));
    try {
      await service.start(getActiveWindow(), "terminal");
    } catch {
      this.stop();
    }
  }
  /**
   * Accept the built-in dictation: fetch the engine's final transcript (the
   * last utterance is only returned by `stopAndTranscribe`, not the interim
   * stream), stage it, then tear down and send it. Used by the silence timeout
   * and the Stop Dictation action; abort/error teardown uses `cancel()` instead.
   */
  async _finalizeBuiltinThenStop() {
    let finalText;
    try {
      finalText = await this._chatSpeechToTextService.stopAndTranscribe();
    } catch {
    }
    if (!this._usingBuiltin || this._cancellationTokenSource?.token.isCancellationRequested) {
      return;
    }
    if (finalText !== void 0) {
      this._updateInput({ status: SpeechToTextStatus.Recognized, text: finalText });
    }
    this.stop(true);
  }
  stop(send) {
    if (this._usingBuiltin && send && !this._builtinFinalizing) {
      this._builtinFinalizing = true;
      this._acceptTranscriptionScheduler?.cancel();
      this._finalizeBuiltinThenStop();
      return;
    }
    if (this._builtinFinalizing && !send && !this._sessionTerminalDisposed && this._terminalService.activeInstance?.instanceId === this._sessionTerminalInstanceId) {
      return;
    }
    this._setInactive();
    if (send) {
      this._acceptTranscriptionScheduler.cancel();
      this._sendText();
    }
    this._ghostText = void 0;
    this._decoration?.dispose();
    this._decoration = void 0;
    this._marker?.dispose();
    this._marker = void 0;
    this._ghostTextMarker = void 0;
    this._cancellationTokenSource?.cancel();
    if (this._usingBuiltin) {
      void this._chatSpeechToTextService.cancel();
    }
    this._disposables.clear();
    this._input = "";
    this._terminalDictationInProgress.reset();
    this._usingBuiltin = false;
    this._builtinFinalizing = false;
    this._sessionTerminalInstanceId = void 0;
    this._sessionTerminalDisposed = false;
  }
  _sendText() {
    this._terminalService.activeInstance?.sendText(this._input, false);
    alert(localize("terminalVoiceTextInserted", "{0} inserted", this._input));
  }
  _updateInput(e) {
    if (e.text) {
      this._input = " " + postProcessTerminalDictation(e.text);
    }
  }
  _createDecoration() {
    const activeInstance = this._terminalService.activeInstance;
    const xterm = activeInstance?.xterm?.raw;
    if (!xterm) {
      return;
    }
    const onFirstLine = xterm.buffer.active.cursorY === 0;
    const inputLength = this._input.length;
    const xPosition = xterm.buffer.active.cursorX + inputLength;
    this._marker = activeInstance.registerMarker(onFirstLine ? 0 : -1);
    if (!this._marker) {
      return;
    }
    this._decoration = xterm.registerDecoration({
      marker: this._marker,
      layer: "top",
      x: xPosition
    });
    if (!this._decoration) {
      this._marker.dispose();
      this._marker = void 0;
      return;
    }
    this._decoration.onRender((e) => {
      e.classList.add(...ThemeIcon.asClassNameArray(Codicon.micFilled), "terminal-voice", "recording");
      e.style.transform = onFirstLine ? "translate(10px, -2px)" : "translate(-6px, -5px)";
      this._registerMicInteractions(e);
    });
  }
  /**
   * Make the recording mic icon a discoverable Stop affordance: clicking it
   * stops (and accepts) the dictation, mirroring the animated mic button in the
   * editor and chat input, and a hover surfaces the Escape keybinding so the
   * stop gesture is not hidden.
   */
  _registerMicInteractions(element) {
    if (element.dataset.terminalVoiceInteractive) {
      return;
    }
    element.dataset.terminalVoiceInteractive = "true";
    element.style.cursor = "pointer";
    this._decorationDisposables.add(addDisposableListener(element, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this._builtinFinalizing) {
        this.stop(true);
      }
    }));
    const keybindingLabel = this._keybindingService.lookupKeybinding(TerminalCommandId.StopVoice)?.getLabel();
    const title = keybindingLabel ? localize("terminalVoice.stopDictationHover", "Stop Dictation ({0})", keybindingLabel) : localize("terminalVoice.stopDictationHoverNoKeybinding", "Stop Dictation");
    this._decorationDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element, title));
  }
  _updateDecoration() {
    this._decorationDisposables.clear();
    this._decoration?.dispose();
    this._marker?.dispose();
    this._decoration = void 0;
    this._marker = void 0;
    this._createDecoration();
  }
  _setInactive() {
    this._decoration?.element?.classList.remove("recording");
  }
  _renderGhostText(e) {
    this._renderGhostTextContent(e.text, "terminal-voice-progress-text");
  }
  /**
   * Render a non-transcript hint (e.g. "Preparing…/Downloading… X%") in the
   * ghost-text slot while the on-device model is still preparing on first use.
   * Styled distinctly from the live transcript so it does not read as speech.
   */
  _renderPreparingText(label) {
    this._renderGhostTextContent(label, "terminal-voice-preparing-text");
  }
  _renderGhostTextContent(text, className) {
    this._ghostText?.dispose();
    if (!text) {
      return;
    }
    const activeInstance = this._terminalService.activeInstance;
    const xterm = activeInstance?.xterm?.raw;
    if (!xterm) {
      return;
    }
    this._ghostTextMarker = activeInstance.registerMarker();
    if (!this._ghostTextMarker) {
      return;
    }
    this._disposables.add(this._ghostTextMarker);
    const onFirstLine = xterm.buffer.active.cursorY === 0;
    this._ghostText = xterm.registerDecoration({
      marker: this._ghostTextMarker,
      layer: "top",
      x: onFirstLine ? xterm.buffer.active.cursorX + 4 : xterm.buffer.active.cursorX + 1
    });
    if (this._ghostText) {
      this._disposables.add(this._ghostText);
    }
    this._ghostText?.onRender((e) => {
      e.classList.add(className);
      e.textContent = text;
      e.style.width = (xterm.cols - xterm.buffer.active.cursorX) / xterm.cols * 100 + "%";
    });
  }
};
TerminalVoiceSession._instance = void 0;
TerminalVoiceSession = __decorateClass([
  __decorateParam(0, ISpeechService),
  __decorateParam(1, IChatSpeechToTextService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IKeybindingService)
], TerminalVoiceSession);
export {
  TerminalVoiceSession,
  postProcessTerminalDictation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcdm9pY2VcXGJyb3dzZXJcXHRlcm1pbmFsVm9pY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTcGVlY2hUaW1lb3V0RGVmYXVsdCB9IGZyb20gJy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3BlZWNoU2VydmljZSwgQWNjZXNzaWJpbGl0eVZvaWNlU2V0dGluZ0lkLCBJU3BlZWNoVG9UZXh0RXZlbnQsIFNwZWVjaFRvVGV4dFN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NwZWVjaC9jb21tb24vc3BlZWNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U3BlZWNoVG9UZXh0U3RhdGUsIElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9zcGVlY2hUb1RleHQvY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RGljdGF0aW9uUHJlcGFyaW5nTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2RpY3RhdGlvbkRvd25sb2FkUmluZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYXJrZXIsIElEZWNvcmF0aW9uIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29tbWFuZElkIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsSW5pdGlhbEhpbnRDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9pbmxpbmVIaW50L2Jyb3dzZXIvdGVybWluYWwuaW5pdGlhbEhpbnQuY29udHJpYnV0aW9uLmpzJztcblxuXG4vKipcbiAqIFNwb2tlbi13b3JkIHRvIHN5bWJvbCBzdWJzdGl0dXRpb25zIGFwcGxpZWQgdG8gdGVybWluYWwgZGljdGF0aW9uLiBPcmRlcmVkIHNvXG4gKiB0aGF0IG11bHRpLXdvcmQgcGhyYXNlcyAoZS5nLiBcImRvbGxhciBzaWduXCIpIGFyZSBtYXRjaGVkIGJlZm9yZSB0aGVpciBzaW5nbGVcbiAqIHdvcmQgZm9ybXMgKGUuZy4gXCJkb2xsYXJcIikuIFRlcm1pbmFsIGRpY3RhdGlvbiBpcyBtb3N0bHkgdXNlZCB0byBjb21wb3NlIHNoZWxsXG4gKiBjb21tYW5kcywgc28gcHVuY3R1YXRpb24gbmFtZXMgbWFwIHRvIHRoZSBsaXRlcmFsIGNoYXJhY3RlcnMgYSBDTEkgZXhwZWN0cy5cbiAqL1xuY29uc3Qgc3ltYm9sTWFwOiBbc3Bva2VuOiBzdHJpbmcsIHN5bWJvbDogc3RyaW5nXVtdID0gW1xuXHRbJ2RvbGxhciBzaWduJywgJyQnXSxcblx0Wydkb3VibGUgcXVvdGUnLCAnXCInXSxcblx0WydvcGVuIHBhcmVuJywgJygnXSxcblx0WydjbG9zZSBwYXJlbicsICcpJ10sXG5cdFsnb3BlbiBwYXJlbnRoZXNpcycsICcoJ10sXG5cdFsnY2xvc2UgcGFyZW50aGVzaXMnLCAnKSddLFxuXHRbJ29wZW4gYnJhY2tldCcsICdbJ10sXG5cdFsnY2xvc2UgYnJhY2tldCcsICddJ10sXG5cdFsnb3BlbiBicmFjZScsICd7J10sXG5cdFsnY2xvc2UgYnJhY2UnLCAnfSddLFxuXHRbJ29wZW4gYW5nbGUgYnJhY2tldCcsICc8J10sXG5cdFsnY2xvc2UgYW5nbGUgYnJhY2tldCcsICc+J10sXG5cdFsnZ3JlYXRlciB0aGFuJywgJz4nXSxcblx0WydsZXNzIHRoYW4nLCAnPCddLFxuXHRbJ2FtcGVyc2FuZCcsICcmJ10sXG5cdFsnZG9sbGFyJywgJyQnXSxcblx0WydwZXJjZW50JywgJyUnXSxcblx0Wydhc3RlcmlzaycsICcqJ10sXG5cdFsnc3RhcicsICcqJ10sXG5cdFsncGx1cycsICcrJ10sXG5cdFsnZXF1YWxzJywgJz0nXSxcblx0WydleGNsYW1hdGlvbicsICchJ10sXG5cdFsnZm9yd2FyZCBzbGFzaCcsICcvJ10sXG5cdFsnc2xhc2gnLCAnLyddLFxuXHRbJ2JhY2tzbGFzaCcsICdcXFxcJ10sXG5cdFsncGlwZScsICd8J10sXG5cdFsndGlsZGUnLCAnfiddLFxuXHRbJ2NhcmV0JywgJ14nXSxcblx0WydhdCBzaWduJywgJ0AnXSxcblx0WydoYXNodGFnJywgJyMnXSxcblx0Wydwb3VuZCcsICcjJ10sXG5cdFsnaGFzaCcsICcjJ10sXG5cdFsnY29sb24nLCAnOiddLFxuXHRbJ3NlbWljb2xvbicsICc7J10sXG5cdFsndW5kZXJzY29yZScsICdfJ10sXG5cdFsnaHlwaGVuJywgJy0nXSxcblx0WydkYXNoJywgJy0nXSxcblx0Wydkb3QnLCAnLiddLFxuXHRbJ3BlcmlvZCcsICcuJ10sXG5cdFsncXVvdGUnLCAnXFwnJ10sXG5dO1xuXG4vKiogQXBwbGllcyB0ZXJtaW5hbC1zcGVjaWZpYyBub3JtYWxpemF0aW9uIHRvIGRpY3RhdGVkIHRleHQuICovXG5leHBvcnQgZnVuY3Rpb24gcG9zdFByb2Nlc3NUZXJtaW5hbERpY3RhdGlvbih0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgaW5wdXQgPSB0ZXh0LnJlcGxhY2VBbGwoL1suLD87IV0vZywgJycpO1xuXHRmb3IgKGNvbnN0IFtzcG9rZW4sIHN5bWJvbF0gb2Ygc3ltYm9sTWFwKSB7XG5cdFx0aW5wdXQgPSBpbnB1dC5yZXBsYWNlKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNwb2tlbiArICdcXFxcYicsICdnaScpLCBzeW1ib2wpO1xuXHR9XG5cdC8vIFNwZWVjaCB0cmFuc2NyaXB0aW9uIGNhcGl0YWxpemVzIHRoZSBmaXJzdCB3b3JkIG9mIGFuIHV0dGVyYW5jZSwgd2hpY2ggaXNcblx0Ly8gdW5leHBlY3RlZCBmb3Igc2hlbGwgY29tbWFuZHMgKGUuZy4gYEVjaG9gIGluc3RlYWQgb2YgYGVjaG9gKS5cblx0aW5wdXQgPSBpbnB1dC5yZXBsYWNlKC9eKFxccyopKFtBLVpdKS8sIChfLCBsZWFkaW5nOiBzdHJpbmcsIGxldHRlcjogc3RyaW5nKSA9PiBsZWFkaW5nICsgbGV0dGVyLnRvTG93ZXJDYXNlKCkpO1xuXHRyZXR1cm4gaW5wdXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFZvaWNlU2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9pbnB1dDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX2dob3N0VGV4dDogSURlY29yYXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RlY29yYXRpb246IElEZWNvcmF0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tYXJrZXI6IElNYXJrZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2dob3N0VGV4dE1hcmtlcjogSU1hcmtlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGF0aWMgX2luc3RhbmNlOiBUZXJtaW5hbFZvaWNlU2Vzc2lvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWNjZXB0VHJhbnNjcmlwdGlvblNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxEaWN0YXRpb25JblByb2dyZXNzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0LyoqIFRydWUgd2hpbGUgdGhlIGN1cnJlbnQgc2Vzc2lvbiBpcyBkcml2ZW4gYnkgdGhlIGJ1aWx0LWluIG9uLWRldmljZSBlbmdpbmUuICovXG5cdHByaXZhdGUgX3VzaW5nQnVpbHRpbiA9IGZhbHNlO1xuXHQvKiogVHJ1ZSB3aGlsZSBhd2FpdGluZyB0aGUgYnVpbHQtaW4gZW5naW5lJ3MgZmluYWwgdHJhbnNjcmlwdCBkdXJpbmcgYWNjZXB0LiAqL1xuXHRwcml2YXRlIF9idWlsdGluRmluYWxpemluZyA9IGZhbHNlO1xuXHRwcml2YXRlIF9zZXNzaW9uVGVybWluYWxJbnN0YW5jZUlkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Nlc3Npb25UZXJtaW5hbERpc3Bvc2VkID0gZmFsc2U7XG5cdHN0YXRpYyBnZXRJbnN0YW5jZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogVGVybWluYWxWb2ljZVNlc3Npb24ge1xuXHRcdGlmICghVGVybWluYWxWb2ljZVNlc3Npb24uX2luc3RhbmNlKSB7XG5cdFx0XHRUZXJtaW5hbFZvaWNlU2Vzc2lvbi5faW5zdGFuY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFZvaWNlU2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFRlcm1pbmFsVm9pY2VTZXNzaW9uLl9pbnN0YW5jZTtcblx0fVxuXHRwcml2YXRlIF9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25EaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNwZWVjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3BlZWNoU2VydmljZTogSVNwZWVjaFNlcnZpY2UsXG5cdFx0QElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U3BlZWNoVG9UZXh0U2VydmljZTogSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy5fdGVybWluYWxEaWN0YXRpb25JblByb2dyZXNzID0gVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbERpY3RhdGlvbkluUHJvZ3Jlc3MuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc3RvcCgpO1xuXHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbEluc3RhbmNlSWQgPSBhY3RpdmVJbnN0YW5jZT8uaW5zdGFuY2VJZDtcblx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSA9PiB7XG5cdFx0XHRpZiAoaW5zdGFuY2U/Lmluc3RhbmNlSWQgIT09IHRoaXMuX3Nlc3Npb25UZXJtaW5hbEluc3RhbmNlSWQpIHtcblx0XHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWREaXNwb3NlSW5zdGFuY2UoaW5zdGFuY2UgPT4ge1xuXHRcdFx0aWYgKGluc3RhbmNlLmluc3RhbmNlSWQgPT09IHRoaXMuX3Nlc3Npb25UZXJtaW5hbEluc3RhbmNlSWQpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFsRGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aWYgKGFjdGl2ZUluc3RhbmNlKSB7XG5cdFx0XHRUZXJtaW5hbEluaXRpYWxIaW50Q29udHJpYnV0aW9uLmdldChhY3RpdmVJbnN0YW5jZSk/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0bGV0IHZvaWNlVGltZW91dCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oQWNjZXNzaWJpbGl0eVZvaWNlU2V0dGluZ0lkLlNwZWVjaFRpbWVvdXQpO1xuXHRcdGlmICghaXNOdW1iZXIodm9pY2VUaW1lb3V0KSB8fCB2b2ljZVRpbWVvdXQgPCAwKSB7XG5cdFx0XHR2b2ljZVRpbWVvdXQgPSBTcGVlY2hUaW1lb3V0RGVmYXVsdDtcblx0XHR9XG5cdFx0dGhpcy5fYWNjZXB0VHJhbnNjcmlwdGlvblNjaGVkdWxlciA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHQvLyBUaGUgYnVpbHQtaW4gZW5naW5lIHJldHVybnMgaXRzIGZpbmFsIHV0dGVyYW5jZSBvbmx5IGZyb21cblx0XHRcdC8vIHN0b3BBbmRUcmFuc2NyaWJlKCksIHNvIGFjY2VwdCB0aHJvdWdoIHN0b3AodHJ1ZSkgcmF0aGVyIHRoYW5cblx0XHRcdC8vIHNlbmRpbmcgdGhlIGludGVyaW0gdGV4dCBhbmQgZGlzY2FyZGluZyB0aGUgcmVjb3JkaW5nLlxuXHRcdFx0aWYgKHRoaXMuX3VzaW5nQnVpbHRpbikge1xuXHRcdFx0XHR0aGlzLnN0b3AodHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NlbmRUZXh0KCk7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHR9LCB2b2ljZVRpbWVvdXQpKTtcblx0XHR0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZT8uZGlzcG9zZSh0cnVlKSkpO1xuXG5cdFx0Ly8gUHJlZmVyIHRoZSBidWlsdC1pbiBvbi1kZXZpY2UgZW5naW5lIChwcml2YXRlLCBpbi1ib3gpIHdoZW4gY29uZmlndXJlZCxcblx0XHQvLyBmYWxsaW5nIGJhY2sgdG8gdGhlIHNwZWVjaCBleHRlbnNpb24ncyBwcm92aWRlciBvdGhlcndpc2UuXG5cdFx0aWYgKHRoaXMuX2NoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLmlzQ29uZmlndXJlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3N0YXJ0QnVpbHRpbih2b2ljZVRpbWVvdXQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9zcGVlY2hTZXJ2aWNlLmNyZWF0ZVNwZWVjaFRvVGV4dFNlc3Npb24odGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LnRva2VuLCAndGVybWluYWwnKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChzZXNzaW9uLm9uRGlkQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHN3aXRjaCAoZS5zdGF0dXMpIHtcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuU3RhcnRlZDpcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbERpY3RhdGlvbkluUHJvZ3Jlc3Muc2V0KHRydWUpO1xuXHRcdFx0XHRcdGlmICghdGhpcy5fZGVjb3JhdGlvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5fY3JlYXRlRGVjb3JhdGlvbigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXppbmc6IHtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVJbnB1dChlKTtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJHaG9zdFRleHQoZSk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbigpO1xuXHRcdFx0XHRcdGlmICh2b2ljZVRpbWVvdXQgPiAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hY2NlcHRUcmFuc2NyaXB0aW9uU2NoZWR1bGVyIS5jYW5jZWwoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuUmVjb2duaXplZDpcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVJbnB1dChlKTtcblx0XHRcdFx0XHQvLyBTZW5kIHRleHQgaW1tZWRpYXRlbHkgbGlrZSBlZGl0b3IgZGljdGF0aW9uXG5cdFx0XHRcdFx0dGhpcy5fc2VuZFRleHQoKTtcblx0XHRcdFx0XHQvLyBDbGVhciBnaG9zdCB0ZXh0IGFuZCBpbnB1dCBmb3IgbmV4dCByZWNvZ25pdGlvblxuXHRcdFx0XHRcdHRoaXMuX2dob3N0VGV4dD8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2dob3N0VGV4dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9naG9zdFRleHRNYXJrZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9naG9zdFRleHRNYXJrZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIGRlY29yYXRpb24gcG9zaXRpb24gZm9yIG5leHQgcmVjb2duaXRpb25cblx0XHRcdFx0XHR0aGlzLl91cGRhdGVEZWNvcmF0aW9uKCk7XG5cdFx0XHRcdFx0dGhpcy5faW5wdXQgPSAnJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuU3RvcHBlZDpcblx0XHRcdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogRHJpdmUgdGVybWluYWwgZGljdGF0aW9uIGZyb20gdGhlIGJ1aWx0LWluIG9uLWRldmljZSBlbmdpbmUuIFVubGlrZSB0aGVcblx0ICogZXh0ZW5zaW9uIHByb3ZpZGVyICh3aGljaCBlbWl0cyBkaXNjcmV0ZSBgUmVjb2duaXppbmdgL2BSZWNvZ25pemVkYCBldmVudHNcblx0ICogcGVyIHV0dGVyYW5jZSksIHRoZSBidWlsdC1pbiBlbmdpbmUgc3RyZWFtcyBhIHNpbmdsZSBncm93aW5nIGN1bXVsYXRpdmVcblx0ICogdHJhbnNjcmlwdC4gV2UgcmVuZGVyIGl0IGxpdmUgYXMgZ2hvc3QgdGV4dCBhbmQga2VlcCBpdCBzdGFnZWQgaW5cblx0ICogYF9pbnB1dGAsIHRoZW4gc2VuZCBpdCBvbmNlIHRoZSBzaWxlbmNlIHRpbWVvdXQgZWxhcHNlcyBvciB0aGUgdXNlciBzdG9wcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3N0YXJ0QnVpbHRpbih2b2ljZVRpbWVvdXQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSB0aGlzLl9jaGF0U3BlZWNoVG9UZXh0U2VydmljZTtcblxuXHRcdC8vIE9ubHkgb25lIGRpY3RhdGlvbiBjYW4gcnVuIGF0IGEgdGltZSAodGhlIG9uLWRldmljZSBlbmdpbmUgaXMgYSBzaGFyZWRcblx0XHQvLyBzaW5nbGV0b24pLiBJZiBpdCBpcyBhbHJlYWR5IHJlY29yZGluZyBlbHNld2hlcmUgKGNoYXQgaW5wdXQgb3IgYW5cblx0XHQvLyBlZGl0b3IpLCBjYW5jZWwgdGhhdCBzZXNzaW9uIHNvIHRoZSB0ZXJtaW5hbCBjYW4gdGFrZSBvdmVyIFx1MjAxNCB0aGUgb3RoZXJcblx0XHQvLyBzdXJmYWNlIGNsZWFycyBpdHMgb3duIHN0YXRlIGFuZCBVSSB3aGVuIGl0IG9ic2VydmVzIHRoZSBlbmdpbmUgZ28gSWRsZS5cblx0XHQvLyBUaGlzIHJ1bnMgYmVmb3JlIHdlIGF0dGFjaCBvdXIgb3duIGxpc3RlbmVycyBiZWxvdywgc28gaXQgY2Fubm90IHRlYXJcblx0XHQvLyBkb3duIHRoaXMgbmV3IHRlcm1pbmFsIHNlc3Npb24uXG5cdFx0aWYgKHNlcnZpY2UuaXNCdXN5KSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNhbmNlbCgpO1xuXHRcdH1cblx0XHQvLyBJZiB0aGUgZW5naW5lIHNvbWVob3cgc3RheWVkIGJ1c3ksIGJhaWwgcmF0aGVyIHRoYW4gc3Vic2NyaWJpbmcgdG8gaXQuXG5cdFx0aWYgKHNlcnZpY2Uuc3RhdGUgIT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5JZGxlKSB7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl91c2luZ0J1aWx0aW4gPSB0cnVlO1xuXHRcdHRoaXMuX3Rlcm1pbmFsRGljdGF0aW9uSW5Qcm9ncmVzcy5zZXQodHJ1ZSk7XG5cdFx0aWYgKCF0aGlzLl9kZWNvcmF0aW9uKSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVEZWNvcmF0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gT24gZmlyc3QgdXNlIHRoZSBtb2RlbCBkb3dubG9hZHMvbG9hZHMgYmVmb3JlIGFueSB0cmFuc2NyaXB0IGFycml2ZXMuXG5cdFx0Ly8gVW5saWtlIHRoZSBjaGF0IGlucHV0ICh3aGljaCBoYXMgYSB0b29sYmFyIGRvd25sb2FkIHJpbmcpLCB0aGUgdGVybWluYWxcblx0XHQvLyBoYXMgbm8gcHJvZ3Jlc3MgYWZmb3JkYW5jZSwgc28gc3VyZmFjZSBhIFwiUHJlcGFyaW5nXHUyMDI2L0Rvd25sb2FkaW5nXHUyMDI2IFglXCJcblx0XHQvLyBoaW50IGluIHRoZSBnaG9zdC10ZXh0IHNsb3QgdW50aWwgdGhlIG1vZGVsIGlzIHJlYWR5IGFuZCByZWFsXG5cdFx0Ly8gdHJhbnNjcmlwdHMgc3RhcnQgc3RyZWFtaW5nLlxuXHRcdGNvbnN0IHJlbmRlclByZXBhcmluZyA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jYW5jZWxsYXRpb25Ub2tlblNvdXJjZT8udG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgdGhpcy5fYnVpbHRpbkZpbmFsaXppbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlcnZpY2UuaXNQcmVwYXJpbmdNb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJQcmVwYXJpbmdUZXh0KGdldERpY3RhdGlvblByZXBhcmluZ0xhYmVsKHNlcnZpY2UpKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHJlbmRlclByZXBhcmluZygpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlUHJlcGFyaW5nTW9kZWwoKCkgPT4gcmVuZGVyUHJlcGFyaW5nKCkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZU1vZGVsRG93bmxvYWRQcm9ncmVzcygoKSA9PiByZW5kZXJQcmVwYXJpbmcoKSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRVcGRhdGVUcmFuc2NyaXB0KHVwZGF0ZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHRoaXMuX2J1aWx0aW5GaW5hbGl6aW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFJldXNlIHRoZSBwcm92aWRlci1wYXRoIHJlbmRlcmluZyBieSBzaGFwaW5nIHRoZSBjdW11bGF0aXZlXG5cdFx0XHQvLyB0cmFuc2NyaXB0IGFzIGEgcmVjb2duaXppbmcgZXZlbnQuIFRoZSBzdGFnZWQgdGV4dCBpcyBvbmx5IHNlbnRcblx0XHRcdC8vIG9uY2UgYWNjZXB0ZWQgKHNpbGVuY2UgdGltZW91dCBvciBTdG9wIERpY3RhdGlvbiksIHdoaWNoIGZldGNoZXNcblx0XHRcdC8vIHRoZSBlbmdpbmUncyBmaW5hbCB0cmFuc2NyaXB0LiBUaGUgZmlyc3QgcmVhbCB0cmFuc2NyaXB0IHJlcGxhY2VzXG5cdFx0XHQvLyBhbnkgbGluZ2VyaW5nIFwiUHJlcGFyaW5nXHUyMDI2XCIgaGludC5cblx0XHRcdGNvbnN0IGV2ZW50OiBJU3BlZWNoVG9UZXh0RXZlbnQgPSB7IHN0YXR1czogU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6aW5nLCB0ZXh0OiB1cGRhdGUudGV4dCB9O1xuXHRcdFx0dGhpcy5fdXBkYXRlSW5wdXQoZXZlbnQpO1xuXHRcdFx0dGhpcy5fcmVuZGVyR2hvc3RUZXh0KGV2ZW50KTtcblx0XHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb24oKTtcblx0XHRcdGlmICh2b2ljZVRpbWVvdXQgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2FjY2VwdFRyYW5zY3JpcHRpb25TY2hlZHVsZXIhLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLl9hY2NlcHRUcmFuc2NyaXB0aW9uU2NoZWR1bGVyIS5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIElmIHRoZSBlbmdpbmUgZW5kcyB0aGUgc2Vzc2lvbiBvbiBpdHMgb3duIChlLmcuIHRoZSBtb2RlbCBmYWlsZWQgdG9cblx0XHQvLyBsb2FkKSwgYWJvcnQgdGhlIHRlcm1pbmFsLXNpZGUgcmVuZGVyaW5nLiBHdWFyZGVkIHNvIG5laXRoZXIgdGhlXG5cdFx0Ly8gYWNjZXB0LXRyaWdnZXJlZCBub3IgdGhlIGFib3J0LXRyaWdnZXJlZCBJZGxlIHRyYW5zaXRpb24gcmUtZW50ZXJzLlxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUoc3RhdGUgPT4ge1xuXHRcdFx0aWYgKHN0YXRlID09PSBDaGF0U3BlZWNoVG9UZXh0U3RhdGUuSWRsZSAmJiAhdGhpcy5fYnVpbHRpbkZpbmFsaXppbmcgJiYgIXRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlPy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2VydmljZS5zdGFydChnZXRBY3RpdmVXaW5kb3coKSwgJ3Rlcm1pbmFsJyk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBNaWNyb3Bob25lIGFjcXVpc2l0aW9uL2Nvbm5lY3Rpb24gZmFpbHVyZSBpcyBzdXJmYWNlZCBieSB0aGUgc2VydmljZS5cblx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBY2NlcHQgdGhlIGJ1aWx0LWluIGRpY3RhdGlvbjogZmV0Y2ggdGhlIGVuZ2luZSdzIGZpbmFsIHRyYW5zY3JpcHQgKHRoZVxuXHQgKiBsYXN0IHV0dGVyYW5jZSBpcyBvbmx5IHJldHVybmVkIGJ5IGBzdG9wQW5kVHJhbnNjcmliZWAsIG5vdCB0aGUgaW50ZXJpbVxuXHQgKiBzdHJlYW0pLCBzdGFnZSBpdCwgdGhlbiB0ZWFyIGRvd24gYW5kIHNlbmQgaXQuIFVzZWQgYnkgdGhlIHNpbGVuY2UgdGltZW91dFxuXHQgKiBhbmQgdGhlIFN0b3AgRGljdGF0aW9uIGFjdGlvbjsgYWJvcnQvZXJyb3IgdGVhcmRvd24gdXNlcyBgY2FuY2VsKClgIGluc3RlYWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9maW5hbGl6ZUJ1aWx0aW5UaGVuU3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZmluYWxUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGZpbmFsVGV4dCA9IGF3YWl0IHRoaXMuX2NoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLnN0b3BBbmRUcmFuc2NyaWJlKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBGYWxsIGJhY2sgdG8gdGhlIGxhc3QgaW50ZXJpbSB0ZXh0IGFscmVhZHkgc3RhZ2VkIGluIGBfaW5wdXRgLlxuXHRcdH1cblx0XHQvLyBBIGNvbmN1cnJlbnQgYWJvcnQgKGUuZy4gdGhlIHRlcm1pbmFsIHdhcyBkaXNwb3NlZCkgYWxyZWFkeSB0b3JlIGRvd24uXG5cdFx0aWYgKCF0aGlzLl91c2luZ0J1aWx0aW4gfHwgdGhpcy5fY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U/LnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChmaW5hbFRleHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlSW5wdXQoeyBzdGF0dXM6IFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemVkLCB0ZXh0OiBmaW5hbFRleHQgfSk7XG5cdFx0fVxuXHRcdC8vIF9idWlsdGluRmluYWxpemluZyBpcyBzZXQsIHNvIHRoaXMgcmVhY2hlcyB0aGUgc3luY2hyb25vdXMgdGVhcmRvd24gYW5kXG5cdFx0Ly8gc2VuZHMgdGhlIHN0YWdlZCAoZmluYWwpIHRleHQuXG5cdFx0dGhpcy5zdG9wKHRydWUpO1xuXHR9XG5cblx0c3RvcChzZW5kPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIEJ1aWx0LWluIGFjY2VwdCBwYXRoOiBmZXRjaCB0aGUgZmluYWwgdHJhbnNjcmlwdCBiZWZvcmUgdGVhcmluZyBkb3duLlxuXHRcdGlmICh0aGlzLl91c2luZ0J1aWx0aW4gJiYgc2VuZCAmJiAhdGhpcy5fYnVpbHRpbkZpbmFsaXppbmcpIHtcblx0XHRcdHRoaXMuX2J1aWx0aW5GaW5hbGl6aW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2FjY2VwdFRyYW5zY3JpcHRpb25TY2hlZHVsZXI/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fZmluYWxpemVCdWlsdGluVGhlblN0b3AoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2J1aWx0aW5GaW5hbGl6aW5nICYmICFzZW5kXG5cdFx0XHQmJiAhdGhpcy5fc2Vzc2lvblRlcm1pbmFsRGlzcG9zZWRcblx0XHRcdCYmIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZT8uaW5zdGFuY2VJZCA9PT0gdGhpcy5fc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXRJbmFjdGl2ZSgpO1xuXHRcdGlmIChzZW5kKSB7XG5cdFx0XHR0aGlzLl9hY2NlcHRUcmFuc2NyaXB0aW9uU2NoZWR1bGVyIS5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX3NlbmRUZXh0KCk7XG5cdFx0fVxuXHRcdHRoaXMuX2dob3N0VGV4dCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kZWNvcmF0aW9uPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9tYXJrZXI/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9tYXJrZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZ2hvc3RUZXh0TWFya2VyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NhbmNlbGxhdGlvblRva2VuU291cmNlPy5jYW5jZWwoKTtcblx0XHQvLyBBYm9ydCB0aGUgb24tZGV2aWNlIGVuZ2luZSBvbiB0ZWFyZG93bi4gT24gdGhlIGFjY2VwdCBwYXRoIHRoZSBlbmdpbmVcblx0XHQvLyBoYXMgYWxyZWFkeSBmaW5pc2hlZCB2aWEgc3RvcEFuZFRyYW5zY3JpYmUoKSwgc28gdGhpcyBpcyBhIG5vLW9wIHRoZXJlLlxuXHRcdGlmICh0aGlzLl91c2luZ0J1aWx0aW4pIHtcblx0XHRcdHZvaWQgdGhpcy5fY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UuY2FuY2VsKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5faW5wdXQgPSAnJztcblx0XHR0aGlzLl90ZXJtaW5hbERpY3RhdGlvbkluUHJvZ3Jlc3MucmVzZXQoKTtcblx0XHR0aGlzLl91c2luZ0J1aWx0aW4gPSBmYWxzZTtcblx0XHR0aGlzLl9idWlsdGluRmluYWxpemluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbEluc3RhbmNlSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFsRGlzcG9zZWQgPSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmRUZXh0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZT8uc2VuZFRleHQodGhpcy5faW5wdXQsIGZhbHNlKTtcblx0XHRhbGVydChsb2NhbGl6ZSgndGVybWluYWxWb2ljZVRleHRJbnNlcnRlZCcsICd7MH0gaW5zZXJ0ZWQnLCB0aGlzLl9pbnB1dCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSW5wdXQoZTogSVNwZWVjaFRvVGV4dEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUudGV4dCkge1xuXHRcdFx0dGhpcy5faW5wdXQgPSAnICcgKyBwb3N0UHJvY2Vzc1Rlcm1pbmFsRGljdGF0aW9uKGUudGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRGVjb3JhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRjb25zdCB4dGVybSA9IGFjdGl2ZUluc3RhbmNlPy54dGVybT8ucmF3O1xuXHRcdGlmICgheHRlcm0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgb25GaXJzdExpbmUgPSB4dGVybS5idWZmZXIuYWN0aXZlLmN1cnNvclkgPT09IDA7XG5cblx0XHQvLyBDYWxjdWxhdGUgeCBwb3NpdGlvbiBiYXNlZCBvbiBjdXJyZW50IGN1cnNvciBwb3NpdGlvbiBhbmQgaW5wdXQgbGVuZ3RoXG5cdFx0Y29uc3QgaW5wdXRMZW5ndGggPSB0aGlzLl9pbnB1dC5sZW5ndGg7XG5cdFx0Y29uc3QgeFBvc2l0aW9uID0geHRlcm0uYnVmZmVyLmFjdGl2ZS5jdXJzb3JYICsgaW5wdXRMZW5ndGg7XG5cblx0XHR0aGlzLl9tYXJrZXIgPSBhY3RpdmVJbnN0YW5jZS5yZWdpc3Rlck1hcmtlcihvbkZpcnN0TGluZSA/IDAgOiAtMSk7XG5cdFx0aWYgKCF0aGlzLl9tYXJrZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGVjb3JhdGlvbiA9IHh0ZXJtLnJlZ2lzdGVyRGVjb3JhdGlvbih7XG5cdFx0XHRtYXJrZXI6IHRoaXMuX21hcmtlcixcblx0XHRcdGxheWVyOiAndG9wJyxcblx0XHRcdHg6IHhQb3NpdGlvbixcblx0XHR9KTtcblx0XHRpZiAoIXRoaXMuX2RlY29yYXRpb24pIHtcblx0XHRcdHRoaXMuX21hcmtlci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tYXJrZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2RlY29yYXRpb24ub25SZW5kZXIoKGU6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0XHRlLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5taWNGaWxsZWQpLCAndGVybWluYWwtdm9pY2UnLCAncmVjb3JkaW5nJyk7XG5cdFx0XHRlLnN0eWxlLnRyYW5zZm9ybSA9IG9uRmlyc3RMaW5lID8gJ3RyYW5zbGF0ZSgxMHB4LCAtMnB4KScgOiAndHJhbnNsYXRlKC02cHgsIC01cHgpJztcblx0XHRcdHRoaXMuX3JlZ2lzdGVyTWljSW50ZXJhY3Rpb25zKGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1ha2UgdGhlIHJlY29yZGluZyBtaWMgaWNvbiBhIGRpc2NvdmVyYWJsZSBTdG9wIGFmZm9yZGFuY2U6IGNsaWNraW5nIGl0XG5cdCAqIHN0b3BzIChhbmQgYWNjZXB0cykgdGhlIGRpY3RhdGlvbiwgbWlycm9yaW5nIHRoZSBhbmltYXRlZCBtaWMgYnV0dG9uIGluIHRoZVxuXHQgKiBlZGl0b3IgYW5kIGNoYXQgaW5wdXQsIGFuZCBhIGhvdmVyIHN1cmZhY2VzIHRoZSBFc2NhcGUga2V5YmluZGluZyBzbyB0aGVcblx0ICogc3RvcCBnZXN0dXJlIGlzIG5vdCBoaWRkZW4uXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3Rlck1pY0ludGVyYWN0aW9ucyhlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIFRoZSBkZWNvcmF0aW9uJ3Mgb25SZW5kZXIgY2FuIGZpcmUgbXVsdGlwbGUgdGltZXMgZm9yIHRoZSBzYW1lIGVsZW1lbnRcblx0XHQvLyAoZS5nLiBvbiBzY3JvbGwvcmVzaXplKTsgb25seSB3aXJlIHVwIHRoZSBsaXN0ZW5lcnMgb25jZS5cblx0XHRpZiAoZWxlbWVudC5kYXRhc2V0LnRlcm1pbmFsVm9pY2VJbnRlcmFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlbGVtZW50LmRhdGFzZXQudGVybWluYWxWb2ljZUludGVyYWN0aXZlID0gJ3RydWUnO1xuXHRcdGVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdHRoaXMuX2RlY29yYXRpb25EaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0aWYgKCF0aGlzLl9idWlsdGluRmluYWxpemluZykge1xuXHRcdFx0XHR0aGlzLnN0b3AodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoVGVybWluYWxDb21tYW5kSWQuU3RvcFZvaWNlKT8uZ2V0TGFiZWwoKTtcblx0XHRjb25zdCB0aXRsZSA9IGtleWJpbmRpbmdMYWJlbFxuXHRcdFx0PyBsb2NhbGl6ZSgndGVybWluYWxWb2ljZS5zdG9wRGljdGF0aW9uSG92ZXInLCBcIlN0b3AgRGljdGF0aW9uICh7MH0pXCIsIGtleWJpbmRpbmdMYWJlbClcblx0XHRcdDogbG9jYWxpemUoJ3Rlcm1pbmFsVm9pY2Uuc3RvcERpY3RhdGlvbkhvdmVyTm9LZXliaW5kaW5nJywgXCJTdG9wIERpY3RhdGlvblwiKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZWxlbWVudCwgdGl0bGUpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURlY29yYXRpb24oKTogdm9pZCB7XG5cdFx0Ly8gRGlzcG9zZSB0aGUgb2xkIGRlY29yYXRpb24gYW5kIGl0cyBpbnRlcmFjdGlvbiBsaXN0ZW5lcnMgYmVmb3JlIHJlY3JlYXRpbmdcblx0XHR0aGlzLl9kZWNvcmF0aW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbWFya2VyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9tYXJrZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY3JlYXRlRGVjb3JhdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SW5hY3RpdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbj8uZWxlbWVudD8uY2xhc3NMaXN0LnJlbW92ZSgncmVjb3JkaW5nJyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJHaG9zdFRleHQoZTogSVNwZWVjaFRvVGV4dEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyR2hvc3RUZXh0Q29udGVudChlLnRleHQsICd0ZXJtaW5hbC12b2ljZS1wcm9ncmVzcy10ZXh0Jyk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIGEgbm9uLXRyYW5zY3JpcHQgaGludCAoZS5nLiBcIlByZXBhcmluZ1x1MjAyNi9Eb3dubG9hZGluZ1x1MjAyNiBYJVwiKSBpbiB0aGVcblx0ICogZ2hvc3QtdGV4dCBzbG90IHdoaWxlIHRoZSBvbi1kZXZpY2UgbW9kZWwgaXMgc3RpbGwgcHJlcGFyaW5nIG9uIGZpcnN0IHVzZS5cblx0ICogU3R5bGVkIGRpc3RpbmN0bHkgZnJvbSB0aGUgbGl2ZSB0cmFuc2NyaXB0IHNvIGl0IGRvZXMgbm90IHJlYWQgYXMgc3BlZWNoLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVuZGVyUHJlcGFyaW5nVGV4dChsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyR2hvc3RUZXh0Q29udGVudChsYWJlbCwgJ3Rlcm1pbmFsLXZvaWNlLXByZXBhcmluZy10ZXh0Jyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJHaG9zdFRleHRDb250ZW50KHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9naG9zdFRleHQ/LmRpc3Bvc2UoKTtcblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0Y29uc3QgeHRlcm0gPSBhY3RpdmVJbnN0YW5jZT8ueHRlcm0/LnJhdztcblx0XHRpZiAoIXh0ZXJtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2dob3N0VGV4dE1hcmtlciA9IGFjdGl2ZUluc3RhbmNlLnJlZ2lzdGVyTWFya2VyKCk7XG5cdFx0aWYgKCF0aGlzLl9naG9zdFRleHRNYXJrZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2dob3N0VGV4dE1hcmtlcik7XG5cdFx0Y29uc3Qgb25GaXJzdExpbmUgPSB4dGVybS5idWZmZXIuYWN0aXZlLmN1cnNvclkgPT09IDA7XG5cdFx0dGhpcy5fZ2hvc3RUZXh0ID0geHRlcm0ucmVnaXN0ZXJEZWNvcmF0aW9uKHtcblx0XHRcdG1hcmtlcjogdGhpcy5fZ2hvc3RUZXh0TWFya2VyLFxuXHRcdFx0bGF5ZXI6ICd0b3AnLFxuXHRcdFx0eDogb25GaXJzdExpbmUgPyB4dGVybS5idWZmZXIuYWN0aXZlLmN1cnNvclggKyA0IDogeHRlcm0uYnVmZmVyLmFjdGl2ZS5jdXJzb3JYICsgMSxcblx0XHR9KTtcblx0XHRpZiAodGhpcy5fZ2hvc3RUZXh0KSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fZ2hvc3RUZXh0KTtcblx0XHR9XG5cdFx0dGhpcy5fZ2hvc3RUZXh0Py5vblJlbmRlcigoZTogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRcdGUuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuXHRcdFx0ZS50ZXh0Q29udGVudCA9IHRleHQ7XG5cdFx0XHRlLnN0eWxlLndpZHRoID0gKHh0ZXJtLmNvbHMgLSB4dGVybS5idWZmZXIuYWN0aXZlLmN1cnNvclgpIC8geHRlcm0uY29scyAqIDEwMCArICclJztcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBRWhELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCLDZCQUFpRCwwQkFBMEI7QUFDcEcsU0FBUyx1QkFB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
