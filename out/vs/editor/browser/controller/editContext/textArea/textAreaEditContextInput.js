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
import * as browser from "../../../../../base/browser/browser.js";
import * as dom from "../../../../../base/browser/dom.js";
import { DomEmitter } from "../../../../../base/browser/event.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { inputLatency } from "../../../../../base/browser/performance.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import * as strings from "../../../../../base/common/strings.js";
import { Selection } from "../../../../common/core/selection.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { CopyOptions, createClipboardCopyEvent, createClipboardPasteEvent, InMemoryClipboardMetadataManager } from "../clipboardUtils.js";
import { _debugComposition, TextAreaState } from "./textAreaEditContextState.js";
var TextAreaSyntethicEvents;
((TextAreaSyntethicEvents2) => {
  TextAreaSyntethicEvents2.Tap = "-monaco-textarea-synthetic-tap";
})(TextAreaSyntethicEvents || (TextAreaSyntethicEvents = {}));
class CompositionContext {
  constructor() {
    this._lastTypeTextLength = 0;
  }
  handleCompositionUpdate(text) {
    text = text || "";
    const typeInput = {
      text,
      replacePrevCharCnt: this._lastTypeTextLength,
      replaceNextCharCnt: 0,
      positionDelta: 0
    };
    this._lastTypeTextLength = text.length;
    return typeInput;
  }
}
let TextAreaInput = class extends Disposable {
  constructor(_host, _textArea, _OS, _browser, _accessibilityService, _logService) {
    super();
    this._host = _host;
    this._textArea = _textArea;
    this._OS = _OS;
    this._browser = _browser;
    this._accessibilityService = _accessibilityService;
    this._logService = _logService;
    this._onFocus = this._register(new Emitter());
    this.onFocus = this._onFocus.event;
    this._onBlur = this._register(new Emitter());
    this.onBlur = this._onBlur.event;
    this._onKeyDown = this._register(new Emitter());
    this.onKeyDown = this._onKeyDown.event;
    this._onKeyUp = this._register(new Emitter());
    this.onKeyUp = this._onKeyUp.event;
    this._onCut = this._register(new Emitter());
    this.onCut = this._onCut.event;
    this._onPaste = this._register(new Emitter());
    this.onPaste = this._onPaste.event;
    this._onWillCopy = this._register(new Emitter());
    this.onWillCopy = this._onWillCopy.event;
    this._onWillCut = this._register(new Emitter());
    this.onWillCut = this._onWillCut.event;
    this._onWillPaste = this._register(new Emitter());
    this.onWillPaste = this._onWillPaste.event;
    this._onType = this._register(new Emitter());
    this.onType = this._onType.event;
    this._onCompositionStart = this._register(new Emitter());
    this.onCompositionStart = this._onCompositionStart.event;
    this._onCompositionUpdate = this._register(new Emitter());
    this.onCompositionUpdate = this._onCompositionUpdate.event;
    this._onCompositionEnd = this._register(new Emitter());
    this.onCompositionEnd = this._onCompositionEnd.event;
    this._onSelectionChangeRequest = this._register(new Emitter());
    this.onSelectionChangeRequest = this._onSelectionChangeRequest.event;
    this._asyncFocusGainWriteScreenReaderContent = this._register(new MutableDisposable());
    this._asyncTriggerCut = this._register(new RunOnceScheduler(() => this._onCut.fire(), 0));
    this._textAreaState = TextAreaState.EMPTY;
    this._selectionChangeListener = null;
    if (this._accessibilityService.isScreenReaderOptimized()) {
      this.writeNativeTextAreaContent("ctor");
    }
    this._register(Event.runAndSubscribe(this._accessibilityService.onDidChangeScreenReaderOptimized, () => {
      if (this._accessibilityService.isScreenReaderOptimized() && !this._asyncFocusGainWriteScreenReaderContent.value) {
        this._asyncFocusGainWriteScreenReaderContent.value = new RunOnceScheduler(() => this.writeNativeTextAreaContent("asyncFocusGain"), 0);
      } else {
        this._asyncFocusGainWriteScreenReaderContent.clear();
      }
    }));
    this._hasFocus = false;
    this._currentComposition = null;
    let lastKeyDown = null;
    this._register(this._textArea.onKeyDown((_e) => {
      const e = new StandardKeyboardEvent(_e);
      if (e.keyCode === KeyCode.KEY_IN_COMPOSITION || this._currentComposition && e.keyCode === KeyCode.Backspace) {
        e.stopPropagation();
      }
      if (e.equals(KeyCode.Escape)) {
        e.preventDefault();
      }
      lastKeyDown = e;
      this._onKeyDown.fire(e);
    }));
    this._register(this._textArea.onKeyUp((_e) => {
      const e = new StandardKeyboardEvent(_e);
      this._onKeyUp.fire(e);
    }));
    this._register(this._textArea.onCompositionStart((e) => {
      if (_debugComposition) {
        console.log(`[compositionstart]`, e);
      }
      const currentComposition = new CompositionContext();
      if (this._currentComposition) {
        this._currentComposition = currentComposition;
        return;
      }
      this._currentComposition = currentComposition;
      if (this._OS === OperatingSystem.Macintosh && lastKeyDown && lastKeyDown.equals(KeyCode.KEY_IN_COMPOSITION) && this._textAreaState.selectionStart === this._textAreaState.selectionEnd && this._textAreaState.selectionStart > 0 && this._textAreaState.value.substr(this._textAreaState.selectionStart - 1, 1) === e.data && (lastKeyDown.code === "ArrowRight" || lastKeyDown.code === "ArrowLeft")) {
        if (_debugComposition) {
          console.log(`[compositionstart] Handling long press case on macOS + arrow key`, e);
        }
        currentComposition.handleCompositionUpdate("x");
        this._onCompositionStart.fire({ data: e.data });
        return;
      }
      if (this._browser.isAndroid) {
        this._onCompositionStart.fire({ data: e.data });
        return;
      }
      this._onCompositionStart.fire({ data: e.data });
    }));
    this._register(this._textArea.onCompositionUpdate((e) => {
      if (_debugComposition) {
        console.log(`[compositionupdate]`, e);
      }
      const currentComposition = this._currentComposition;
      if (!currentComposition) {
        return;
      }
      if (this._browser.isAndroid) {
        const newState = TextAreaState.readFromTextArea(this._textArea, this._textAreaState);
        const typeInput2 = TextAreaState.deduceAndroidCompositionInput(this._textAreaState, newState);
        this._textAreaState = newState;
        this._onType.fire(typeInput2);
        this._onCompositionUpdate.fire(e);
        return;
      }
      const typeInput = currentComposition.handleCompositionUpdate(e.data);
      this._textAreaState = TextAreaState.readFromTextArea(this._textArea, this._textAreaState);
      this._onType.fire(typeInput);
      this._onCompositionUpdate.fire(e);
    }));
    this._register(this._textArea.onCompositionEnd((e) => {
      if (_debugComposition) {
        console.log(`[compositionend]`, e);
      }
      const currentComposition = this._currentComposition;
      if (!currentComposition) {
        return;
      }
      this._currentComposition = null;
      if (this._browser.isAndroid) {
        const newState = TextAreaState.readFromTextArea(this._textArea, this._textAreaState);
        const typeInput2 = TextAreaState.deduceAndroidCompositionInput(this._textAreaState, newState);
        this._textAreaState = newState;
        this._onType.fire(typeInput2);
        this._onCompositionEnd.fire();
        return;
      }
      const typeInput = currentComposition.handleCompositionUpdate(e.data);
      this._textAreaState = TextAreaState.readFromTextArea(this._textArea, this._textAreaState);
      this._onType.fire(typeInput);
      this._onCompositionEnd.fire();
    }));
    this._register(this._textArea.onInput((e) => {
      if (_debugComposition) {
        console.log(`[input]`, e);
      }
      this._textArea.setIgnoreSelectionChangeTime("received input event");
      if (this._currentComposition) {
        return;
      }
      const newState = TextAreaState.readFromTextArea(this._textArea, this._textAreaState);
      const typeInput = TextAreaState.deduceInput(
        this._textAreaState,
        newState,
        /*couldBeEmojiInput*/
        this._OS === OperatingSystem.Macintosh
      );
      if (typeInput.replacePrevCharCnt === 0 && typeInput.text.length === 1) {
        if (strings.isHighSurrogate(typeInput.text.charCodeAt(0)) || typeInput.text.charCodeAt(0) === 127) {
          return;
        }
      }
      this._textAreaState = newState;
      if (typeInput.text !== "" || typeInput.replacePrevCharCnt !== 0 || typeInput.replaceNextCharCnt !== 0 || typeInput.positionDelta !== 0) {
        if (e.inputType === "insertFromPaste") {
          this._onPaste.fire({
            text: typeInput.text,
            metadata: InMemoryClipboardMetadataManager.INSTANCE.get(typeInput.text)
          });
        } else {
          this._onType.fire(typeInput);
        }
      }
    }));
    this._register(this._textArea.onCut((e) => {
      this._logService.trace(`TextAreaInput#onCut`, e);
      const cutEvent = createClipboardCopyEvent(
        e,
        /* isCut */
        true,
        this._host.context,
        this._logService,
        this._browser.isFirefox
      );
      this._onWillCut.fire(cutEvent);
      if (cutEvent.isHandled) {
        return;
      }
      this._textArea.setIgnoreSelectionChangeTime("received cut event");
      cutEvent.ensureClipboardGetsEditorData();
      this._asyncTriggerCut.schedule();
    }));
    this._register(this._textArea.onCopy((e) => {
      this._logService.trace(`TextAreaInput#onCopy`, e);
      CopyOptions.electronBugWorkaroundCopyEventHasFired = true;
      const copyEvent = createClipboardCopyEvent(
        e,
        /* isCut */
        false,
        this._host.context,
        this._logService,
        this._browser.isFirefox
      );
      this._onWillCopy.fire(copyEvent);
      if (copyEvent.isHandled) {
        return;
      }
      copyEvent.ensureClipboardGetsEditorData();
    }));
    this._register(this._textArea.onPaste((e) => {
      this._logService.trace(`TextAreaInput#onPaste`, e);
      const pasteEvent = createClipboardPasteEvent(e);
      this._onWillPaste.fire(pasteEvent);
      if (pasteEvent.isHandled) {
        return;
      }
      this._textArea.setIgnoreSelectionChangeTime("received paste event");
      e.preventDefault();
      this._logService.trace(`TextAreaInput#onPaste with id : `, pasteEvent.metadata?.id, " with text.length: ", pasteEvent.text.length);
      if (!pasteEvent.text) {
        return;
      }
      this._logService.trace(`TextAreaInput#onPaste (before onPaste)`);
      this._onPaste.fire({
        text: pasteEvent.text,
        metadata: pasteEvent.metadata
      });
    }));
    this._register(this._textArea.onFocus(() => {
      const hadFocus = this._hasFocus;
      this._setHasFocus(true);
      if (this._accessibilityService.isScreenReaderOptimized() && this._browser.isSafari && !hadFocus && this._hasFocus) {
        if (!this._asyncFocusGainWriteScreenReaderContent.value) {
          this._asyncFocusGainWriteScreenReaderContent.value = new RunOnceScheduler(() => this.writeNativeTextAreaContent("asyncFocusGain"), 0);
        }
        this._asyncFocusGainWriteScreenReaderContent.value.schedule();
      }
    }));
    this._register(this._textArea.onBlur(() => {
      if (this._currentComposition) {
        this._currentComposition = null;
        this.writeNativeTextAreaContent("blurWithoutCompositionEnd");
        this._onCompositionEnd.fire();
      }
      this._setHasFocus(false);
    }));
    this._register(this._textArea.onSyntheticTap(() => {
      if (this._browser.isAndroid && this._currentComposition) {
        this._currentComposition = null;
        this.writeNativeTextAreaContent("tapWithoutCompositionEnd");
        this._onCompositionEnd.fire();
      }
    }));
  }
  get textAreaState() {
    return this._textAreaState;
  }
  _initializeFromTest() {
    this._hasFocus = true;
    this._textAreaState = TextAreaState.readFromTextArea(this._textArea, null);
  }
  _installSelectionChangeListener() {
    let previousSelectionChangeEventTime = 0;
    return dom.addDisposableListener(this._textArea.ownerDocument, "selectionchange", (e) => {
      inputLatency.onSelectionChange();
      if (!this._hasFocus) {
        return;
      }
      if (this._currentComposition) {
        return;
      }
      if (!this._browser.isChrome) {
        return;
      }
      const now = Date.now();
      const delta1 = now - previousSelectionChangeEventTime;
      previousSelectionChangeEventTime = now;
      if (delta1 < 5) {
        return;
      }
      const delta2 = now - this._textArea.getIgnoreSelectionChangeTime();
      this._textArea.resetSelectionChangeTime();
      if (delta2 < 100) {
        return;
      }
      if (!this._textAreaState.selection) {
        return;
      }
      const newValue = this._textArea.getValue();
      if (this._textAreaState.value !== newValue) {
        return;
      }
      const newSelectionStart = this._textArea.getSelectionStart();
      const newSelectionEnd = this._textArea.getSelectionEnd();
      if (this._textAreaState.selectionStart === newSelectionStart && this._textAreaState.selectionEnd === newSelectionEnd) {
        return;
      }
      const _newSelectionStartPosition = this._textAreaState.deduceEditorPosition(newSelectionStart);
      const newSelectionStartPosition = this._host.deduceModelPosition(_newSelectionStartPosition[0], _newSelectionStartPosition[1], _newSelectionStartPosition[2]);
      const _newSelectionEndPosition = this._textAreaState.deduceEditorPosition(newSelectionEnd);
      const newSelectionEndPosition = this._host.deduceModelPosition(_newSelectionEndPosition[0], _newSelectionEndPosition[1], _newSelectionEndPosition[2]);
      const newSelection = new Selection(
        newSelectionStartPosition.lineNumber,
        newSelectionStartPosition.column,
        newSelectionEndPosition.lineNumber,
        newSelectionEndPosition.column
      );
      this._onSelectionChangeRequest.fire(newSelection);
    });
  }
  dispose() {
    super.dispose();
    if (this._selectionChangeListener) {
      this._selectionChangeListener.dispose();
      this._selectionChangeListener = null;
    }
  }
  focusTextArea() {
    this._setHasFocus(true);
    this.refreshFocusState();
  }
  isFocused() {
    return this._hasFocus;
  }
  refreshFocusState() {
    this._setHasFocus(this._textArea.hasFocus());
  }
  _setHasFocus(newHasFocus) {
    if (this._hasFocus === newHasFocus) {
      return;
    }
    this._hasFocus = newHasFocus;
    if (this._selectionChangeListener) {
      this._selectionChangeListener.dispose();
      this._selectionChangeListener = null;
    }
    if (this._hasFocus) {
      this._selectionChangeListener = this._installSelectionChangeListener();
    }
    if (this._hasFocus) {
      this.writeNativeTextAreaContent("focusgain");
    }
    if (this._hasFocus) {
      this._onFocus.fire();
    } else {
      this._onBlur.fire();
    }
  }
  _setAndWriteTextAreaState(reason, textAreaState) {
    if (!this._hasFocus) {
      textAreaState = textAreaState.collapseSelection();
    }
    if (!textAreaState.isWrittenToTextArea(this._textArea, this._hasFocus)) {
      this._logService.trace(`writeTextAreaState(reason: ${reason})`);
    }
    textAreaState.writeToTextArea(reason, this._textArea, this._hasFocus);
    this._textAreaState = textAreaState;
  }
  writeNativeTextAreaContent(reason) {
    if (!this._accessibilityService.isScreenReaderOptimized() && reason === "render" || this._currentComposition) {
      return;
    }
    this._setAndWriteTextAreaState(reason, this._host.getScreenReaderContent());
  }
};
TextAreaInput = __decorateClass([
  __decorateParam(4, IAccessibilityService),
  __decorateParam(5, ILogService)
], TextAreaInput);
class TextAreaWrapper extends Disposable {
  constructor(_actual) {
    super();
    this._actual = _actual;
    this._onSyntheticTap = this._register(new Emitter());
    this.onSyntheticTap = this._onSyntheticTap.event;
    this._ignoreSelectionChangeTime = 0;
    this.onKeyDown = this._register(new DomEmitter(this._actual, "keydown")).event;
    this.onKeyPress = this._register(new DomEmitter(this._actual, "keypress")).event;
    this.onKeyUp = this._register(new DomEmitter(this._actual, "keyup")).event;
    this.onCompositionStart = this._register(new DomEmitter(this._actual, "compositionstart")).event;
    this.onCompositionUpdate = this._register(new DomEmitter(this._actual, "compositionupdate")).event;
    this.onCompositionEnd = this._register(new DomEmitter(this._actual, "compositionend")).event;
    this.onBeforeInput = this._register(new DomEmitter(this._actual, "beforeinput")).event;
    this.onInput = this._register(new DomEmitter(this._actual, "input")).event;
    this.onCut = this._register(new DomEmitter(this._actual, "cut")).event;
    this.onCopy = this._register(new DomEmitter(this._actual, "copy")).event;
    this.onPaste = this._register(new DomEmitter(this._actual, "paste")).event;
    this.onFocus = this._register(new DomEmitter(this._actual, "focus")).event;
    this.onBlur = this._register(new DomEmitter(this._actual, "blur")).event;
    this._register(this.onKeyDown(() => inputLatency.onKeyDown()));
    this._register(this.onBeforeInput(() => inputLatency.onBeforeInput()));
    this._register(this.onInput(() => inputLatency.onInput()));
    this._register(this.onKeyUp(() => inputLatency.onKeyUp()));
    this._register(dom.addDisposableListener(this._actual, TextAreaSyntethicEvents.Tap, () => this._onSyntheticTap.fire()));
  }
  //  = this._register(new DomEmitter(this._actual, 'blur')).event;
  get ownerDocument() {
    return this._actual.ownerDocument;
  }
  hasFocus() {
    const shadowRoot = dom.getShadowRoot(this._actual);
    if (shadowRoot) {
      return shadowRoot.activeElement === this._actual;
    } else if (this._actual.isConnected) {
      return dom.getActiveElement() === this._actual;
    } else {
      return false;
    }
  }
  setIgnoreSelectionChangeTime(reason) {
    this._ignoreSelectionChangeTime = Date.now();
  }
  getIgnoreSelectionChangeTime() {
    return this._ignoreSelectionChangeTime;
  }
  resetSelectionChangeTime() {
    this._ignoreSelectionChangeTime = 0;
  }
  getValue() {
    return this._actual.value;
  }
  setValue(reason, value) {
    const textArea = this._actual;
    if (textArea.value === value) {
      return;
    }
    this.setIgnoreSelectionChangeTime("setValue");
    textArea.value = value;
  }
  getSelectionStart() {
    return this._actual.selectionDirection === "backward" ? this._actual.selectionEnd : this._actual.selectionStart;
  }
  getSelectionEnd() {
    return this._actual.selectionDirection === "backward" ? this._actual.selectionStart : this._actual.selectionEnd;
  }
  setSelectionRange(reason, selectionStart, selectionEnd) {
    const textArea = this._actual;
    let activeElement = null;
    const shadowRoot = dom.getShadowRoot(textArea);
    if (shadowRoot) {
      activeElement = shadowRoot.activeElement;
    } else {
      activeElement = dom.getActiveElement();
    }
    const activeWindow = dom.getWindow(activeElement);
    const currentIsFocused = activeElement === textArea;
    const currentSelectionStart = textArea.selectionStart;
    const currentSelectionEnd = textArea.selectionEnd;
    if (currentIsFocused && currentSelectionStart === selectionStart && currentSelectionEnd === selectionEnd) {
      if (browser.isFirefox && activeWindow.parent !== activeWindow) {
        textArea.focus();
      }
      return;
    }
    if (currentIsFocused) {
      this.setIgnoreSelectionChangeTime("setSelectionRange");
      textArea.setSelectionRange(selectionStart, selectionEnd);
      if (browser.isFirefox && activeWindow.parent !== activeWindow) {
        textArea.focus();
      }
      return;
    }
    try {
      const scrollState = dom.saveParentsScrollTop(textArea);
      this.setIgnoreSelectionChangeTime("setSelectionRange");
      textArea.focus();
      textArea.setSelectionRange(selectionStart, selectionEnd);
      dom.restoreParentsScrollTop(textArea, scrollState);
    } catch (e) {
    }
  }
}
export {
  TextAreaInput,
  TextAreaSyntethicEvents,
  TextAreaWrapper
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGNvbnRyb2xsZXJcXGVkaXRDb250ZXh0XFx0ZXh0QXJlYVxcdGV4dEFyZWFFZGl0Q29udGV4dElucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYnJvd3NlciBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2V2ZW50LmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50LCBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBpbnB1dExhdGVuY3kgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENsaXBib2FyZFN0b3JlZE1ldGFkYXRhLCBDb3B5T3B0aW9ucywgY3JlYXRlQ2xpcGJvYXJkQ29weUV2ZW50LCBjcmVhdGVDbGlwYm9hcmRQYXN0ZUV2ZW50LCBJQ2xpcGJvYXJkQ29weUV2ZW50LCBJQ2xpcGJvYXJkUGFzdGVFdmVudCwgSW5NZW1vcnlDbGlwYm9hcmRNZXRhZGF0YU1hbmFnZXIgfSBmcm9tICcuLi9jbGlwYm9hcmRVdGlscy5qcyc7XG5pbXBvcnQgeyBfZGVidWdDb21wb3NpdGlvbiwgSVRleHRBcmVhV3JhcHBlciwgSVR5cGVEYXRhLCBUZXh0QXJlYVN0YXRlIH0gZnJvbSAnLi90ZXh0QXJlYUVkaXRDb250ZXh0U3RhdGUuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcblxuZXhwb3J0IG5hbWVzcGFjZSBUZXh0QXJlYVN5bnRldGhpY0V2ZW50cyB7XG5cdGV4cG9ydCBjb25zdCBUYXAgPSAnLW1vbmFjby10ZXh0YXJlYS1zeW50aGV0aWMtdGFwJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcG9zaXRpb25EYXRhIHtcblx0ZGF0YTogc3RyaW5nO1xufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBhc3RlRGF0YSB7XG5cdHRleHQ6IHN0cmluZztcblx0bWV0YWRhdGE6IENsaXBib2FyZFN0b3JlZE1ldGFkYXRhIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGV4dEFyZWFJbnB1dEhvc3Qge1xuXHRyZWFkb25seSBjb250ZXh0OiBWaWV3Q29udGV4dDtcblx0Z2V0U2NyZWVuUmVhZGVyQ29udGVudCgpOiBUZXh0QXJlYVN0YXRlO1xuXHRkZWR1Y2VNb2RlbFBvc2l0aW9uKHZpZXdBbmNob3JQb3NpdGlvbjogUG9zaXRpb24sIGRlbHRhT2Zmc2V0OiBudW1iZXIsIGxpbmVGZWVkQ250OiBudW1iZXIpOiBQb3NpdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcG9zaXRpb25TdGFydEV2ZW50IHtcblx0ZGF0YTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wbGV0ZVRleHRBcmVhV3JhcHBlciBleHRlbmRzIElUZXh0QXJlYVdyYXBwZXIge1xuXHRyZWFkb25seSBvbktleURvd246IEV2ZW50PEtleWJvYXJkRXZlbnQ+O1xuXHRyZWFkb25seSBvbktleVByZXNzOiBFdmVudDxLZXlib2FyZEV2ZW50Pjtcblx0cmVhZG9ubHkgb25LZXlVcDogRXZlbnQ8S2V5Ym9hcmRFdmVudD47XG5cdHJlYWRvbmx5IG9uQ29tcG9zaXRpb25TdGFydDogRXZlbnQ8Q29tcG9zaXRpb25FdmVudD47XG5cdHJlYWRvbmx5IG9uQ29tcG9zaXRpb25VcGRhdGU6IEV2ZW50PENvbXBvc2l0aW9uRXZlbnQ+O1xuXHRyZWFkb25seSBvbkNvbXBvc2l0aW9uRW5kOiBFdmVudDxDb21wb3NpdGlvbkV2ZW50Pjtcblx0cmVhZG9ubHkgb25CZWZvcmVJbnB1dDogRXZlbnQ8SW5wdXRFdmVudD47XG5cdHJlYWRvbmx5IG9uSW5wdXQ6IEV2ZW50PElucHV0RXZlbnQ+O1xuXHRyZWFkb25seSBvbkN1dDogRXZlbnQ8Q2xpcGJvYXJkRXZlbnQ+O1xuXHRyZWFkb25seSBvbkNvcHk6IEV2ZW50PENsaXBib2FyZEV2ZW50Pjtcblx0cmVhZG9ubHkgb25QYXN0ZTogRXZlbnQ8Q2xpcGJvYXJkRXZlbnQ+O1xuXHRyZWFkb25seSBvbkZvY3VzOiBFdmVudDxGb2N1c0V2ZW50Pjtcblx0cmVhZG9ubHkgb25CbHVyOiBFdmVudDxGb2N1c0V2ZW50Pjtcblx0cmVhZG9ubHkgb25TeW50aGV0aWNUYXA6IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IG93bmVyRG9jdW1lbnQ6IERvY3VtZW50O1xuXG5cdHNldElnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUocmVhc29uOiBzdHJpbmcpOiB2b2lkO1xuXHRnZXRJZ25vcmVTZWxlY3Rpb25DaGFuZ2VUaW1lKCk6IG51bWJlcjtcblx0cmVzZXRTZWxlY3Rpb25DaGFuZ2VUaW1lKCk6IHZvaWQ7XG5cblx0aGFzRm9jdXMoKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlciB7XG5cdGlzQW5kcm9pZDogYm9vbGVhbjtcblx0aXNGaXJlZm94OiBib29sZWFuO1xuXHRpc0Nocm9tZTogYm9vbGVhbjtcblx0aXNTYWZhcmk6IGJvb2xlYW47XG59XG5cbmNsYXNzIENvbXBvc2l0aW9uQ29udGV4dCB7XG5cblx0cHJpdmF0ZSBfbGFzdFR5cGVUZXh0TGVuZ3RoOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fbGFzdFR5cGVUZXh0TGVuZ3RoID0gMDtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVDb21wb3NpdGlvblVwZGF0ZSh0ZXh0OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogSVR5cGVEYXRhIHtcblx0XHR0ZXh0ID0gdGV4dCB8fCAnJztcblx0XHRjb25zdCB0eXBlSW5wdXQ6IElUeXBlRGF0YSA9IHtcblx0XHRcdHRleHQ6IHRleHQsXG5cdFx0XHRyZXBsYWNlUHJldkNoYXJDbnQ6IHRoaXMuX2xhc3RUeXBlVGV4dExlbmd0aCxcblx0XHRcdHJlcGxhY2VOZXh0Q2hhckNudDogMCxcblx0XHRcdHBvc2l0aW9uRGVsdGE6IDBcblx0XHR9O1xuXHRcdHRoaXMuX2xhc3RUeXBlVGV4dExlbmd0aCA9IHRleHQubGVuZ3RoO1xuXHRcdHJldHVybiB0eXBlSW5wdXQ7XG5cdH1cbn1cblxuLyoqXG4gKiBXcml0ZXMgc2NyZWVuIHJlYWRlciBjb250ZW50IHRvIHRoZSB0ZXh0YXJlYSBhbmQgaXMgYWJsZSB0byBhbmFseXplIGl0cyBpbnB1dCBldmVudHMgdG8gZ2VuZXJhdGU6XG4gKiAgLSBvbkN1dFxuICogIC0gb25QYXN0ZVxuICogIC0gb25UeXBlXG4gKlxuICogQ29tcG9zaXRpb24gZXZlbnRzIGFyZSBnZW5lcmF0ZWQgZm9yIHByZXNlbnRhdGlvbiBwdXJwb3NlcyAoY29tcG9zaXRpb24gaW5wdXQgaXMgcmVmbGVjdGVkIGluIG9uVHlwZSkuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXh0QXJlYUlucHV0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfb25Gb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Gb2N1czogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uQmx1ciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25CbHVyOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uQmx1ci5ldmVudDtcblxuXHRwcml2YXRlIF9vbktleURvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJS2V5Ym9hcmRFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbktleURvd246IEV2ZW50PElLZXlib2FyZEV2ZW50PiA9IHRoaXMuX29uS2V5RG93bi5ldmVudDtcblxuXHRwcml2YXRlIF9vbktleVVwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUtleWJvYXJkRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25LZXlVcDogRXZlbnQ8SUtleWJvYXJkRXZlbnQ+ID0gdGhpcy5fb25LZXlVcC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkN1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25DdXQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25DdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25QYXN0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQYXN0ZURhdGE+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25QYXN0ZTogRXZlbnQ8SVBhc3RlRGF0YT4gPSB0aGlzLl9vblBhc3RlLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uV2lsbENvcHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2xpcGJvYXJkQ29weUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbENvcHk6IEV2ZW50PElDbGlwYm9hcmRDb3B5RXZlbnQ+ID0gdGhpcy5fb25XaWxsQ29weS5ldmVudDtcblxuXHRwcml2YXRlIF9vbldpbGxDdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2xpcGJvYXJkQ29weUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbEN1dDogRXZlbnQ8SUNsaXBib2FyZENvcHlFdmVudD4gPSB0aGlzLl9vbldpbGxDdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25XaWxsUGFzdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2xpcGJvYXJkUGFzdGVFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxQYXN0ZTogRXZlbnQ8SUNsaXBib2FyZFBhc3RlRXZlbnQ+ID0gdGhpcy5fb25XaWxsUGFzdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25UeXBlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVR5cGVEYXRhPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uVHlwZTogRXZlbnQ8SVR5cGVEYXRhPiA9IHRoaXMuX29uVHlwZS5ldmVudDtcblxuXHRwcml2YXRlIF9vbkNvbXBvc2l0aW9uU3RhcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29tcG9zaXRpb25TdGFydEV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uQ29tcG9zaXRpb25TdGFydDogRXZlbnQ8SUNvbXBvc2l0aW9uU3RhcnRFdmVudD4gPSB0aGlzLl9vbkNvbXBvc2l0aW9uU3RhcnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25Db21wb3NpdGlvblVwZGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb21wb3NpdGlvbkRhdGE+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Db21wb3NpdGlvblVwZGF0ZTogRXZlbnQ8SUNvbXBvc2l0aW9uRGF0YT4gPSB0aGlzLl9vbkNvbXBvc2l0aW9uVXBkYXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uQ29tcG9zaXRpb25FbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uQ29tcG9zaXRpb25FbmQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25Db21wb3NpdGlvbkVuZC5ldmVudDtcblxuXHRwcml2YXRlIF9vblNlbGVjdGlvbkNoYW5nZVJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTZWxlY3Rpb24+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25TZWxlY3Rpb25DaGFuZ2VSZXF1ZXN0OiBFdmVudDxTZWxlY3Rpb24+ID0gdGhpcy5fb25TZWxlY3Rpb25DaGFuZ2VSZXF1ZXN0LmV2ZW50O1xuXG5cdC8vIC0tLVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FzeW5jVHJpZ2dlckN1dDogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hc3luY0ZvY3VzR2FpbldyaXRlU2NyZWVuUmVhZGVyQ29udGVudDogTXV0YWJsZURpc3Bvc2FibGU8UnVuT25jZVNjaGVkdWxlcj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfdGV4dEFyZWFTdGF0ZTogVGV4dEFyZWFTdGF0ZTtcblxuXHRwdWJsaWMgZ2V0IHRleHRBcmVhU3RhdGUoKTogVGV4dEFyZWFTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RleHRBcmVhU3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIF9zZWxlY3Rpb25DaGFuZ2VMaXN0ZW5lcjogSURpc3Bvc2FibGUgfCBudWxsO1xuXG5cdHByaXZhdGUgX2hhc0ZvY3VzOiBib29sZWFuO1xuXHRwcml2YXRlIF9jdXJyZW50Q29tcG9zaXRpb246IENvbXBvc2l0aW9uQ29udGV4dCB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG9zdDogSVRleHRBcmVhSW5wdXRIb3N0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RleHRBcmVhOiBJQ29tcGxldGVUZXh0QXJlYVdyYXBwZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfT1M6IE9wZXJhdGluZ1N5c3RlbSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9icm93c2VyOiBJQnJvd3Nlcixcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fYXN5bmNUcmlnZ2VyQ3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fb25DdXQuZmlyZSgpLCAwKSk7XG5cdFx0dGhpcy5fdGV4dEFyZWFTdGF0ZSA9IFRleHRBcmVhU3RhdGUuRU1QVFk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uQ2hhbmdlTGlzdGVuZXIgPSBudWxsO1xuXHRcdGlmICh0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHR0aGlzLndyaXRlTmF0aXZlVGV4dEFyZWFDb250ZW50KCdjdG9yJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCwgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkgJiYgIXRoaXMuX2FzeW5jRm9jdXNHYWluV3JpdGVTY3JlZW5SZWFkZXJDb250ZW50LnZhbHVlKSB7XG5cdFx0XHRcdC8vIERvbid0IHVzZSB0aGlzLl9yZWdpc3RlcigpIGhlcmUgLSB0aGUgTXV0YWJsZURpc3Bvc2FibGUgYWxyZWFkeSBoYW5kbGVzIGNsZWFudXBcblx0XHRcdFx0dGhpcy5fYXN5bmNGb2N1c0dhaW5Xcml0ZVNjcmVlblJlYWRlckNvbnRlbnQudmFsdWUgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLndyaXRlTmF0aXZlVGV4dEFyZWFDb250ZW50KCdhc3luY0ZvY3VzR2FpbicpLCAwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2FzeW5jRm9jdXNHYWluV3JpdGVTY3JlZW5SZWFkZXJDb250ZW50LmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2hhc0ZvY3VzID0gZmFsc2U7XG5cdFx0dGhpcy5fY3VycmVudENvbXBvc2l0aW9uID0gbnVsbDtcblxuXHRcdGxldCBsYXN0S2V5RG93bjogSUtleWJvYXJkRXZlbnQgfCBudWxsID0gbnVsbDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhLm9uS2V5RG93bigoX2UpID0+IHtcblx0XHRcdGNvbnN0IGUgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KF9lKTtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuS0VZX0lOX0NPTVBPU0lUSU9OXG5cdFx0XHRcdHx8ICh0aGlzLl9jdXJyZW50Q29tcG9zaXRpb24gJiYgZS5rZXlDb2RlID09PSBLZXlDb2RlLkJhY2tzcGFjZSkpIHtcblx0XHRcdFx0Ly8gU3RvcCBwcm9wYWdhdGlvbiBmb3Iga2V5RG93biBldmVudHMgaWYgdGhlIElNRSBpcyBwcm9jZXNzaW5nIGtleSBpbnB1dFxuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdC8vIFByZXZlbnQgZGVmYXVsdCBhbHdheXMgZm9yIGBFc2NgLCBvdGhlcndpc2UgaXQgd2lsbCBnZW5lcmF0ZSBhIGtleXByZXNzXG5cdFx0XHRcdC8vIFNlZSBodHRwczovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2llL21zNTM2OTM5KHY9dnMuODUpLmFzcHhcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRsYXN0S2V5RG93biA9IGU7XG5cdFx0XHR0aGlzLl9vbktleURvd24uZmlyZShlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYS5vbktleVVwKChfZSkgPT4ge1xuXHRcdFx0Y29uc3QgZSA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoX2UpO1xuXHRcdFx0dGhpcy5fb25LZXlVcC5maXJlKGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhLm9uQ29tcG9zaXRpb25TdGFydCgoZSkgPT4ge1xuXHRcdFx0aWYgKF9kZWJ1Z0NvbXBvc2l0aW9uKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBbY29tcG9zaXRpb25zdGFydF1gLCBlKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudENvbXBvc2l0aW9uID0gbmV3IENvbXBvc2l0aW9uQ29udGV4dCgpO1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRDb21wb3NpdGlvbikge1xuXHRcdFx0XHQvLyBzaW1wbHkgcmVzZXQgdGhlIGNvbXBvc2l0aW9uIGNvbnRleHRcblx0XHRcdFx0dGhpcy5fY3VycmVudENvbXBvc2l0aW9uID0gY3VycmVudENvbXBvc2l0aW9uO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jdXJyZW50Q29tcG9zaXRpb24gPSBjdXJyZW50Q29tcG9zaXRpb247XG5cblx0XHRcdGlmIChcblx0XHRcdFx0dGhpcy5fT1MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2hcblx0XHRcdFx0JiYgbGFzdEtleURvd25cblx0XHRcdFx0JiYgbGFzdEtleURvd24uZXF1YWxzKEtleUNvZGUuS0VZX0lOX0NPTVBPU0lUSU9OKVxuXHRcdFx0XHQmJiB0aGlzLl90ZXh0QXJlYVN0YXRlLnNlbGVjdGlvblN0YXJ0ID09PSB0aGlzLl90ZXh0QXJlYVN0YXRlLnNlbGVjdGlvbkVuZFxuXHRcdFx0XHQmJiB0aGlzLl90ZXh0QXJlYVN0YXRlLnNlbGVjdGlvblN0YXJ0ID4gMFxuXHRcdFx0XHQmJiB0aGlzLl90ZXh0QXJlYVN0YXRlLnZhbHVlLnN1YnN0cih0aGlzLl90ZXh0QXJlYVN0YXRlLnNlbGVjdGlvblN0YXJ0IC0gMSwgMSkgPT09IGUuZGF0YVxuXHRcdFx0XHQmJiAobGFzdEtleURvd24uY29kZSA9PT0gJ0Fycm93UmlnaHQnIHx8IGxhc3RLZXlEb3duLmNvZGUgPT09ICdBcnJvd0xlZnQnKVxuXHRcdFx0KSB7XG5cdFx0XHRcdC8vIEhhbmRsaW5nIGxvbmcgcHJlc3MgY2FzZSBvbiBDaHJvbWl1bS9TYWZhcmkgbWFjT1MgKyBhcnJvdyBrZXkgPT4gcHJldGVuZCB0aGUgY2hhcmFjdGVyIHdhcyBzZWxlY3RlZFxuXHRcdFx0XHRpZiAoX2RlYnVnQ29tcG9zaXRpb24pIHtcblx0XHRcdFx0XHRjb25zb2xlLmxvZyhgW2NvbXBvc2l0aW9uc3RhcnRdIEhhbmRsaW5nIGxvbmcgcHJlc3MgY2FzZSBvbiBtYWNPUyArIGFycm93IGtleWAsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFByZXRlbmQgdGhlIHByZXZpb3VzIGNoYXJhY3RlciB3YXMgY29tcG9zZWQgKGluIG9yZGVyIHRvIGdldCBpdCByZW1vdmVkIGJ5IHN1YnNlcXVlbnQgY29tcG9zaXRpb251cGRhdGUgZXZlbnRzKVxuXHRcdFx0XHRjdXJyZW50Q29tcG9zaXRpb24uaGFuZGxlQ29tcG9zaXRpb25VcGRhdGUoJ3gnKTtcblx0XHRcdFx0dGhpcy5fb25Db21wb3NpdGlvblN0YXJ0LmZpcmUoeyBkYXRhOiBlLmRhdGEgfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2Jyb3dzZXIuaXNBbmRyb2lkKSB7XG5cdFx0XHRcdC8vIHdoZW4gdGFwcGluZyBvbiB0aGUgZWRpdG9yLCBBbmRyb2lkIGVudGVycyBjb21wb3NpdGlvbiBtb2RlIHRvIGVkaXQgdGhlIGN1cnJlbnQgd29yZFxuXHRcdFx0XHQvLyBzbyB3ZSBjYW5ub3QgY2xlYXIgdGhlIHRleHRhcmVhIG9uIEFuZHJvaWQgYW5kIHdlIG11c3QgcHJldGVuZCB0aGUgY3VycmVudCB3b3JkIHdhcyBzZWxlY3RlZFxuXHRcdFx0XHR0aGlzLl9vbkNvbXBvc2l0aW9uU3RhcnQuZmlyZSh7IGRhdGE6IGUuZGF0YSB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkNvbXBvc2l0aW9uU3RhcnQuZmlyZSh7IGRhdGE6IGUuZGF0YSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYS5vbkNvbXBvc2l0aW9uVXBkYXRlKChlKSA9PiB7XG5cdFx0XHRpZiAoX2RlYnVnQ29tcG9zaXRpb24pIHtcblx0XHRcdFx0Y29uc29sZS5sb2coYFtjb21wb3NpdGlvbnVwZGF0ZV1gLCBlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnJlbnRDb21wb3NpdGlvbiA9IHRoaXMuX2N1cnJlbnRDb21wb3NpdGlvbjtcblx0XHRcdGlmICghY3VycmVudENvbXBvc2l0aW9uKSB7XG5cdFx0XHRcdC8vIHNob3VsZCBub3QgYmUgcG9zc2libGUgdG8gcmVjZWl2ZSBhICdjb21wb3NpdGlvbnVwZGF0ZScgd2l0aG91dCBhICdjb21wb3NpdGlvbnN0YXJ0J1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fYnJvd3Nlci5pc0FuZHJvaWQpIHtcblx0XHRcdFx0Ly8gT24gQW5kcm9pZCwgdGhlIGRhdGEgc2VudCB3aXRoIHRoZSBjb21wb3NpdGlvbiB1cGRhdGUgZXZlbnQgaXMgdW51c2FibGUuXG5cdFx0XHRcdC8vIEZvciBleGFtcGxlLCBpZiB0aGUgY3Vyc29yIGlzIGluIHRoZSBtaWRkbGUgb2YgYSB3b3JkIGxpa2UgTWljfG9zb2Z0XG5cdFx0XHRcdC8vIGFuZCBNaWNyb3NvZnQgaXMgY2hvc2VuIGZyb20gdGhlIGtleWJvYXJkJ3Mgc3VnZ2VzdGlvbnMsIHRoZSBlLmRhdGEgd2lsbCBjb250YWluIFwiTWljcm9zb2Z0XCIuXG5cdFx0XHRcdC8vIFRoaXMgaXMgbm90IHJlYWxseSB1c2FibGUgYmVjYXVzZSBpdCBkb2Vzbid0IHRlbGwgdXMgd2hlcmUgdGhlIGVkaXQgYmVnYW4gYW5kIHdoZXJlIGl0IGVuZGVkLlxuXHRcdFx0XHRjb25zdCBuZXdTdGF0ZSA9IFRleHRBcmVhU3RhdGUucmVhZEZyb21UZXh0QXJlYSh0aGlzLl90ZXh0QXJlYSwgdGhpcy5fdGV4dEFyZWFTdGF0ZSk7XG5cdFx0XHRcdGNvbnN0IHR5cGVJbnB1dCA9IFRleHRBcmVhU3RhdGUuZGVkdWNlQW5kcm9pZENvbXBvc2l0aW9uSW5wdXQodGhpcy5fdGV4dEFyZWFTdGF0ZSwgbmV3U3RhdGUpO1xuXHRcdFx0XHR0aGlzLl90ZXh0QXJlYVN0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHRcdHRoaXMuX29uVHlwZS5maXJlKHR5cGVJbnB1dCk7XG5cdFx0XHRcdHRoaXMuX29uQ29tcG9zaXRpb25VcGRhdGUuZmlyZShlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdHlwZUlucHV0ID0gY3VycmVudENvbXBvc2l0aW9uLmhhbmRsZUNvbXBvc2l0aW9uVXBkYXRlKGUuZGF0YSk7XG5cdFx0XHR0aGlzLl90ZXh0QXJlYVN0YXRlID0gVGV4dEFyZWFTdGF0ZS5yZWFkRnJvbVRleHRBcmVhKHRoaXMuX3RleHRBcmVhLCB0aGlzLl90ZXh0QXJlYVN0YXRlKTtcblx0XHRcdHRoaXMuX29uVHlwZS5maXJlKHR5cGVJbnB1dCk7XG5cdFx0XHR0aGlzLl9vbkNvbXBvc2l0aW9uVXBkYXRlLmZpcmUoZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGV4dEFyZWEub25Db21wb3NpdGlvbkVuZCgoZSkgPT4ge1xuXHRcdFx0aWYgKF9kZWJ1Z0NvbXBvc2l0aW9uKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGBbY29tcG9zaXRpb25lbmRdYCwgZSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXJyZW50Q29tcG9zaXRpb24gPSB0aGlzLl9jdXJyZW50Q29tcG9zaXRpb247XG5cdFx0XHRpZiAoIWN1cnJlbnRDb21wb3NpdGlvbikge1xuXHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L21vbmFjby1lZGl0b3IvaXNzdWVzLzE2NjNcblx0XHRcdFx0Ly8gT24gaU9TIDEzLjIsIENoaW5lc2Ugc3lzdGVtIElNRSByYW5kb21seSB0cmlnZ2VyIGFuIGFkZGl0aW9uYWwgY29tcG9zaXRpb25lbmQgZXZlbnQgd2l0aCBlbXB0eSBkYXRhXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2N1cnJlbnRDb21wb3NpdGlvbiA9IG51bGw7XG5cblx0XHRcdGlmICh0aGlzLl9icm93c2VyLmlzQW5kcm9pZCkge1xuXHRcdFx0XHQvLyBPbiBBbmRyb2lkLCB0aGUgZGF0YSBzZW50IHdpdGggdGhlIGNvbXBvc2l0aW9uIHVwZGF0ZSBldmVudCBpcyB1bnVzYWJsZS5cblx0XHRcdFx0Ly8gRm9yIGV4YW1wbGUsIGlmIHRoZSBjdXJzb3IgaXMgaW4gdGhlIG1pZGRsZSBvZiBhIHdvcmQgbGlrZSBNaWN8b3NvZnRcblx0XHRcdFx0Ly8gYW5kIE1pY3Jvc29mdCBpcyBjaG9zZW4gZnJvbSB0aGUga2V5Ym9hcmQncyBzdWdnZXN0aW9ucywgdGhlIGUuZGF0YSB3aWxsIGNvbnRhaW4gXCJNaWNyb3NvZnRcIi5cblx0XHRcdFx0Ly8gVGhpcyBpcyBub3QgcmVhbGx5IHVzYWJsZSBiZWNhdXNlIGl0IGRvZXNuJ3QgdGVsbCB1cyB3aGVyZSB0aGUgZWRpdCBiZWdhbiBhbmQgd2hlcmUgaXQgZW5kZWQuXG5cdFx0XHRcdGNvbnN0IG5ld1N0YXRlID0gVGV4dEFyZWFTdGF0ZS5yZWFkRnJvbVRleHRBcmVhKHRoaXMuX3RleHRBcmVhLCB0aGlzLl90ZXh0QXJlYVN0YXRlKTtcblx0XHRcdFx0Y29uc3QgdHlwZUlucHV0ID0gVGV4dEFyZWFTdGF0ZS5kZWR1Y2VBbmRyb2lkQ29tcG9zaXRpb25JbnB1dCh0aGlzLl90ZXh0QXJlYVN0YXRlLCBuZXdTdGF0ZSk7XG5cdFx0XHRcdHRoaXMuX3RleHRBcmVhU3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRcdFx0dGhpcy5fb25UeXBlLmZpcmUodHlwZUlucHV0KTtcblx0XHRcdFx0dGhpcy5fb25Db21wb3NpdGlvbkVuZC5maXJlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHlwZUlucHV0ID0gY3VycmVudENvbXBvc2l0aW9uLmhhbmRsZUNvbXBvc2l0aW9uVXBkYXRlKGUuZGF0YSk7XG5cdFx0XHR0aGlzLl90ZXh0QXJlYVN0YXRlID0gVGV4dEFyZWFTdGF0ZS5yZWFkRnJvbVRleHRBcmVhKHRoaXMuX3RleHRBcmVhLCB0aGlzLl90ZXh0QXJlYVN0YXRlKTtcblx0XHRcdHRoaXMuX29uVHlwZS5maXJlKHR5cGVJbnB1dCk7XG5cdFx0XHR0aGlzLl9vbkNvbXBvc2l0aW9uRW5kLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYS5vbklucHV0KChlKSA9PiB7XG5cdFx0XHRpZiAoX2RlYnVnQ29tcG9zaXRpb24pIHtcblx0XHRcdFx0Y29uc29sZS5sb2coYFtpbnB1dF1gLCBlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJldGVuZCBoZXJlIHdlIHRvdWNoZWQgdGhlIHRleHQgYXJlYSwgYXMgdGhlIGBpbnB1dGAgZXZlbnQgd2lsbCBtb3N0IGxpa2VseVxuXHRcdFx0Ly8gcmVzdWx0IGluIGEgYHNlbGVjdGlvbmNoYW5nZWAgZXZlbnQgd2hpY2ggd2Ugd2FudCB0byBpZ25vcmVcblx0XHRcdHRoaXMuX3RleHRBcmVhLnNldElnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUoJ3JlY2VpdmVkIGlucHV0IGV2ZW50Jyk7XG5cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50Q29tcG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXdTdGF0ZSA9IFRleHRBcmVhU3RhdGUucmVhZEZyb21UZXh0QXJlYSh0aGlzLl90ZXh0QXJlYSwgdGhpcy5fdGV4dEFyZWFTdGF0ZSk7XG5cdFx0XHRjb25zdCB0eXBlSW5wdXQgPSBUZXh0QXJlYVN0YXRlLmRlZHVjZUlucHV0KHRoaXMuX3RleHRBcmVhU3RhdGUsIG5ld1N0YXRlLCAvKmNvdWxkQmVFbW9qaUlucHV0Ki90aGlzLl9PUyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCk7XG5cblx0XHRcdGlmICh0eXBlSW5wdXQucmVwbGFjZVByZXZDaGFyQ250ID09PSAwICYmIHR5cGVJbnB1dC50ZXh0Lmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQvLyBvbmUgY2hhcmFjdGVyIHdhcyB0eXBlZFxuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0c3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUodHlwZUlucHV0LnRleHQuY2hhckNvZGVBdCgwKSlcblx0XHRcdFx0XHR8fCB0eXBlSW5wdXQudGV4dC5jaGFyQ29kZUF0KDApID09PSAweDdmIC8qIERlbGV0ZSAqL1xuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHQvLyBJZ25vcmUgaW52YWxpZCBpbnB1dCBidXQga2VlcCBpdCBhcm91bmQgZm9yIG5leHQgdGltZVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl90ZXh0QXJlYVN0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdHR5cGVJbnB1dC50ZXh0ICE9PSAnJ1xuXHRcdFx0XHR8fCB0eXBlSW5wdXQucmVwbGFjZVByZXZDaGFyQ250ICE9PSAwXG5cdFx0XHRcdHx8IHR5cGVJbnB1dC5yZXBsYWNlTmV4dENoYXJDbnQgIT09IDBcblx0XHRcdFx0fHwgdHlwZUlucHV0LnBvc2l0aW9uRGVsdGEgIT09IDBcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBodHRwczovL3czYy5naXRodWIuaW8vaW5wdXQtZXZlbnRzLyNpbnRlcmZhY2UtSW5wdXRFdmVudC1BdHRyaWJ1dGVzXG5cdFx0XHRcdGlmIChlLmlucHV0VHlwZSA9PT0gJ2luc2VydEZyb21QYXN0ZScpIHtcblx0XHRcdFx0XHR0aGlzLl9vblBhc3RlLmZpcmUoe1xuXHRcdFx0XHRcdFx0dGV4dDogdHlwZUlucHV0LnRleHQsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogSW5NZW1vcnlDbGlwYm9hcmRNZXRhZGF0YU1hbmFnZXIuSU5TVEFOQ0UuZ2V0KHR5cGVJbnB1dC50ZXh0KVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX29uVHlwZS5maXJlKHR5cGVJbnB1dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyAtLS0gQ2xpcGJvYXJkIG9wZXJhdGlvbnNcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhLm9uQ3V0KChlKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBUZXh0QXJlYUlucHV0I29uQ3V0YCwgZSk7XG5cblx0XHRcdC8vIEZpcmUgb25XaWxsQ3V0IGV2ZW50IHRvIGFsbG93IGludGVyY2VwdGlvblxuXHRcdFx0Y29uc3QgY3V0RXZlbnQgPSBjcmVhdGVDbGlwYm9hcmRDb3B5RXZlbnQoZSwgLyogaXNDdXQgKi8gdHJ1ZSwgdGhpcy5faG9zdC5jb250ZXh0LCB0aGlzLl9sb2dTZXJ2aWNlLCB0aGlzLl9icm93c2VyLmlzRmlyZWZveCk7XG5cdFx0XHR0aGlzLl9vbldpbGxDdXQuZmlyZShjdXRFdmVudCk7XG5cdFx0XHRpZiAoY3V0RXZlbnQuaXNIYW5kbGVkKSB7XG5cdFx0XHRcdC8vIEV2ZW50IHdhcyBoYW5kbGVkIGV4dGVybmFsbHksIHNraXAgZGVmYXVsdCBwcm9jZXNzaW5nXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJldGVuZCBoZXJlIHdlIHRvdWNoZWQgdGhlIHRleHQgYXJlYSwgYXMgdGhlIGBjdXRgIGV2ZW50IHdpbGwgbW9zdCBsaWtlbHlcblx0XHRcdC8vIHJlc3VsdCBpbiBhIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50IHdoaWNoIHdlIHdhbnQgdG8gaWdub3JlXG5cdFx0XHR0aGlzLl90ZXh0QXJlYS5zZXRJZ25vcmVTZWxlY3Rpb25DaGFuZ2VUaW1lKCdyZWNlaXZlZCBjdXQgZXZlbnQnKTtcblxuXHRcdFx0Y3V0RXZlbnQuZW5zdXJlQ2xpcGJvYXJkR2V0c0VkaXRvckRhdGEoKTtcblx0XHRcdHRoaXMuX2FzeW5jVHJpZ2dlckN1dC5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhLm9uQ29weSgoZSkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgVGV4dEFyZWFJbnB1dCNvbkNvcHlgLCBlKTtcblxuXHRcdFx0Ly8gISEhISFcblx0XHRcdC8vIFRoaXMgaXMgYSB3b3JrYXJvdW5kIGZvciB3aGF0IHdlIHRoaW5rIGlzIGFuIEVsZWN0cm9uIGJ1ZyB3aGVyZVxuXHRcdFx0Ly8gZXhlY0NvbW1hbmQoJ2NvcHknKSBkb2VzIG5vdCBhbHdheXMgd29yayAoaXQgZG9lcyBub3QgZmlyZSBhIGNsaXBib2FyZCBldmVudClcblx0XHRcdC8vICEhISEhXG5cdFx0XHQvLyBXZSBzaWduYWwgdGhhdCB3ZSBoYXZlIGV4ZWN1dGVkIGEgY29weSBjb21tYW5kXG5cdFx0XHRDb3B5T3B0aW9ucy5lbGVjdHJvbkJ1Z1dvcmthcm91bmRDb3B5RXZlbnRIYXNGaXJlZCA9IHRydWU7XG5cblx0XHRcdC8vIEZpcmUgb25XaWxsQ29weSBldmVudCB0byBhbGxvdyBpbnRlcmNlcHRpb25cblx0XHRcdGNvbnN0IGNvcHlFdmVudCA9IGNyZWF0ZUNsaXBib2FyZENvcHlFdmVudChlLCAvKiBpc0N1dCAqLyBmYWxzZSwgdGhpcy5faG9zdC5jb250ZXh0LCB0aGlzLl9sb2dTZXJ2aWNlLCB0aGlzLl9icm93c2VyLmlzRmlyZWZveCk7XG5cdFx0XHR0aGlzLl9vbldpbGxDb3B5LmZpcmUoY29weUV2ZW50KTtcblx0XHRcdGlmIChjb3B5RXZlbnQuaXNIYW5kbGVkKSB7XG5cdFx0XHRcdC8vIEV2ZW50IHdhcyBoYW5kbGVkIGV4dGVybmFsbHksIHNraXAgZGVmYXVsdCBwcm9jZXNzaW5nXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29weUV2ZW50LmVuc3VyZUNsaXBib2FyZEdldHNFZGl0b3JEYXRhKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGV4dEFyZWEub25QYXN0ZSgoZSkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgVGV4dEFyZWFJbnB1dCNvblBhc3RlYCwgZSk7XG5cblx0XHRcdC8vIEZpcmUgb25XaWxsUGFzdGUgZXZlbnQgdG8gYWxsb3cgaW50ZXJjZXB0aW9uXG5cdFx0XHRjb25zdCBwYXN0ZUV2ZW50ID0gY3JlYXRlQ2xpcGJvYXJkUGFzdGVFdmVudChlKTtcblx0XHRcdHRoaXMuX29uV2lsbFBhc3RlLmZpcmUocGFzdGVFdmVudCk7XG5cdFx0XHRpZiAocGFzdGVFdmVudC5pc0hhbmRsZWQpIHtcblx0XHRcdFx0Ly8gRXZlbnQgd2FzIGhhbmRsZWQgZXh0ZXJuYWxseSwgc2tpcCBkZWZhdWx0IHByb2Nlc3Npbmdcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQcmV0ZW5kIGhlcmUgd2UgdG91Y2hlZCB0aGUgdGV4dCBhcmVhLCBhcyB0aGUgYHBhc3RlYCBldmVudCB3aWxsIG1vc3QgbGlrZWx5XG5cdFx0XHQvLyByZXN1bHQgaW4gYSBgc2VsZWN0aW9uY2hhbmdlYCBldmVudCB3aGljaCB3ZSB3YW50IHRvIGlnbm9yZVxuXHRcdFx0dGhpcy5fdGV4dEFyZWEuc2V0SWdub3JlU2VsZWN0aW9uQ2hhbmdlVGltZSgncmVjZWl2ZWQgcGFzdGUgZXZlbnQnKTtcblxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBUZXh0QXJlYUlucHV0I29uUGFzdGUgd2l0aCBpZCA6IGAsIHBhc3RlRXZlbnQubWV0YWRhdGE/LmlkLCAnIHdpdGggdGV4dC5sZW5ndGg6ICcsIHBhc3RlRXZlbnQudGV4dC5sZW5ndGgpO1xuXHRcdFx0aWYgKCFwYXN0ZUV2ZW50LnRleHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBUZXh0QXJlYUlucHV0I29uUGFzdGUgKGJlZm9yZSBvblBhc3RlKWApO1xuXHRcdFx0dGhpcy5fb25QYXN0ZS5maXJlKHtcblx0XHRcdFx0dGV4dDogcGFzdGVFdmVudC50ZXh0LFxuXHRcdFx0XHRtZXRhZGF0YTogcGFzdGVFdmVudC5tZXRhZGF0YVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGV4dEFyZWEub25Gb2N1cygoKSA9PiB7XG5cdFx0XHRjb25zdCBoYWRGb2N1cyA9IHRoaXMuX2hhc0ZvY3VzO1xuXG5cdFx0XHR0aGlzLl9zZXRIYXNGb2N1cyh0cnVlKTtcblxuXHRcdFx0aWYgKHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkgJiYgdGhpcy5fYnJvd3Nlci5pc1NhZmFyaSAmJiAhaGFkRm9jdXMgJiYgdGhpcy5faGFzRm9jdXMpIHtcblx0XHRcdFx0Ly8gV2hlbiBcInRhYmJpbmcgaW50b1wiIHRoZSB0ZXh0YXJlYSwgaW1tZWRpYXRlbHkgYWZ0ZXIgZGlzcGF0Y2hpbmcgdGhlICdmb2N1cycgZXZlbnQsXG5cdFx0XHRcdC8vIFNhZmFyaSB3aWxsIGFsd2F5cyBtb3ZlIHRoZSBzZWxlY3Rpb24gYXQgb2Zmc2V0IDAgaW4gdGhlIHRleHRhcmVhXG5cdFx0XHRcdGlmICghdGhpcy5fYXN5bmNGb2N1c0dhaW5Xcml0ZVNjcmVlblJlYWRlckNvbnRlbnQudmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLl9hc3luY0ZvY3VzR2FpbldyaXRlU2NyZWVuUmVhZGVyQ29udGVudC52YWx1ZSA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMud3JpdGVOYXRpdmVUZXh0QXJlYUNvbnRlbnQoJ2FzeW5jRm9jdXNHYWluJyksIDApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FzeW5jRm9jdXNHYWluV3JpdGVTY3JlZW5SZWFkZXJDb250ZW50LnZhbHVlLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhLm9uQmx1cigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudENvbXBvc2l0aW9uKSB7XG5cdFx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTEyNjIxXG5cdFx0XHRcdC8vIHdoZXJlIGNvbXBvc2l0aW9uZW5kIGlzIG5vdCB0cmlnZ2VyZWQgd2hlbiB0aGUgZWRpdG9yXG5cdFx0XHRcdC8vIGlzIHRha2VuIG9mZi1kb20gZHVyaW5nIGEgY29tcG9zaXRpb25cblxuXHRcdFx0XHQvLyBDbGVhciB0aGUgZmxhZyB0byBiZSBhYmxlIHRvIHdyaXRlIHRvIHRoZSB0ZXh0YXJlYVxuXHRcdFx0XHR0aGlzLl9jdXJyZW50Q29tcG9zaXRpb24gPSBudWxsO1xuXG5cdFx0XHRcdC8vIENsZWFyIHRoZSB0ZXh0YXJlYSB0byBhdm9pZCBhbiB1bndhbnRlZCBjdXJzb3IgdHlwZVxuXHRcdFx0XHR0aGlzLndyaXRlTmF0aXZlVGV4dEFyZWFDb250ZW50KCdibHVyV2l0aG91dENvbXBvc2l0aW9uRW5kJyk7XG5cblx0XHRcdFx0Ly8gRmlyZSBhcnRpZmljaWFsIGNvbXBvc2l0aW9uIGVuZFxuXHRcdFx0XHR0aGlzLl9vbkNvbXBvc2l0aW9uRW5kLmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NldEhhc0ZvY3VzKGZhbHNlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGV4dEFyZWEub25TeW50aGV0aWNUYXAoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2Jyb3dzZXIuaXNBbmRyb2lkICYmIHRoaXMuX2N1cnJlbnRDb21wb3NpdGlvbikge1xuXHRcdFx0XHQvLyBvbiBBbmRyb2lkLCB0YXBwaW5nIGRvZXMgbm90IGNhbmNlbCB0aGUgY3VycmVudCBjb21wb3NpdGlvbiwgc28gdGhlXG5cdFx0XHRcdC8vIHRleHRhcmVhIGlzIHN0dWNrIHNob3dpbmcgdGhlIG9sZCBjb21wb3NpdGlvblxuXG5cdFx0XHRcdC8vIENsZWFyIHRoZSBmbGFnIHRvIGJlIGFibGUgdG8gd3JpdGUgdG8gdGhlIHRleHRhcmVhXG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRDb21wb3NpdGlvbiA9IG51bGw7XG5cblx0XHRcdFx0Ly8gQ2xlYXIgdGhlIHRleHRhcmVhIHRvIGF2b2lkIGFuIHVud2FudGVkIGN1cnNvciB0eXBlXG5cdFx0XHRcdHRoaXMud3JpdGVOYXRpdmVUZXh0QXJlYUNvbnRlbnQoJ3RhcFdpdGhvdXRDb21wb3NpdGlvbkVuZCcpO1xuXG5cdFx0XHRcdC8vIEZpcmUgYXJ0aWZpY2lhbCBjb21wb3NpdGlvbiBlbmRcblx0XHRcdFx0dGhpcy5fb25Db21wb3NpdGlvbkVuZC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0X2luaXRpYWxpemVGcm9tVGVzdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9oYXNGb2N1cyA9IHRydWU7XG5cdFx0dGhpcy5fdGV4dEFyZWFTdGF0ZSA9IFRleHRBcmVhU3RhdGUucmVhZEZyb21UZXh0QXJlYSh0aGlzLl90ZXh0QXJlYSwgbnVsbCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbnN0YWxsU2VsZWN0aW9uQ2hhbmdlTGlzdGVuZXIoKTogSURpc3Bvc2FibGUge1xuXHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjcyMTYgYW5kIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85ODI1NlxuXHRcdC8vIFdoZW4gdXNpbmcgYSBCcmFpbGxlIGRpc3BsYXksIGl0IGlzIHBvc3NpYmxlIGZvciB1c2VycyB0byByZXBvc2l0aW9uIHRoZVxuXHRcdC8vIHN5c3RlbSBjYXJldC4gVGhpcyBpcyByZWZsZWN0ZWQgaW4gQ2hyb21lIGFzIGEgYHNlbGVjdGlvbmNoYW5nZWAgZXZlbnQuXG5cdFx0Ly9cblx0XHQvLyBUaGUgYHNlbGVjdGlvbmNoYW5nZWAgZXZlbnQgYXBwZWFycyB0byBiZSBlbWl0dGVkIHVuZGVyIG51bWVyb3VzIG90aGVyIGNpcmN1bXN0YW5jZXMsXG5cdFx0Ly8gc28gaXQgaXMgcXVpdGUgYSBjaGFsbGVuZ2UgdG8gZGlzdGluZ3Vpc2ggYSBgc2VsZWN0aW9uY2hhbmdlYCBjb21pbmcgaW4gZnJvbSBhIHVzZXJcblx0XHQvLyB1c2luZyBhIEJyYWlsbGUgZGlzcGxheSBmcm9tIGFsbCB0aGUgb3RoZXIgY2FzZXMuXG5cdFx0Ly9cblx0XHQvLyBUaGUgcHJvYmxlbXMgd2l0aCB0aGUgYHNlbGVjdGlvbmNoYW5nZWAgZXZlbnQgYXJlOlxuXHRcdC8vICAqIHRoZSBldmVudCBpcyBlbWl0dGVkIHdoZW4gdGhlIHRleHRhcmVhIGlzIGZvY3VzZWQgcHJvZ3JhbW1hdGljYWxseSAtLSB0ZXh0YXJlYS5mb2N1cygpXG5cdFx0Ly8gICogdGhlIGV2ZW50IGlzIGVtaXR0ZWQgd2hlbiB0aGUgc2VsZWN0aW9uIGlzIGNoYW5nZWQgaW4gdGhlIHRleHRhcmVhIHByb2dyYW1tYXRpY2FsbHkgLS0gdGV4dGFyZWEuc2V0U2VsZWN0aW9uUmFuZ2UoLi4uKVxuXHRcdC8vICAqIHRoZSBldmVudCBpcyBlbWl0dGVkIHdoZW4gdGhlIHZhbHVlIG9mIHRoZSB0ZXh0YXJlYSBpcyBjaGFuZ2VkIHByb2dyYW1tYXRpY2FsbHkgLS0gdGV4dGFyZWEudmFsdWUgPSAnLi4uJ1xuXHRcdC8vICAqIHRoZSBldmVudCBpcyBlbWl0dGVkIHdoZW4gdGFiYmluZyBpbnRvIHRoZSB0ZXh0YXJlYVxuXHRcdC8vICAqIHRoZSBldmVudCBpcyBlbWl0dGVkIGFzeW5jaHJvbm91c2x5IChzb21ldGltZXMgd2l0aCBhIGRlbGF5IGFzIGhpZ2ggYXMgYSBmZXcgdGVucyBvZiBtcylcblx0XHQvLyAgKiB0aGUgZXZlbnQgc29tZXRpbWVzIGNvbWVzIGluIGJ1cnN0cyBmb3IgYSBzaW5nbGUgbG9naWNhbCB0ZXh0YXJlYSBvcGVyYXRpb25cblxuXHRcdC8vIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50cyBvZnRlbiBjb21lIG11bHRpcGxlIHRpbWVzIGZvciBhIHNpbmdsZSBsb2dpY2FsIGNoYW5nZVxuXHRcdC8vIHNvIHRocm90dGxlIG11bHRpcGxlIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50cyB0aGF0IGJ1cnN0IGluIGEgc2hvcnQgcGVyaW9kIG9mIHRpbWUuXG5cdFx0bGV0IHByZXZpb3VzU2VsZWN0aW9uQ2hhbmdlRXZlbnRUaW1lID0gMDtcblx0XHRyZXR1cm4gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90ZXh0QXJlYS5vd25lckRvY3VtZW50LCAnc2VsZWN0aW9uY2hhbmdlJywgKGUpID0+IHsvL3RvZG9cblx0XHRcdGlucHV0TGF0ZW5jeS5vblNlbGVjdGlvbkNoYW5nZSgpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX2hhc0ZvY3VzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50Q29tcG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9icm93c2VyLmlzQ2hyb21lKSB7XG5cdFx0XHRcdC8vIFN1cHBvcnQgb25seSBmb3IgQ2hyb21lIHVudGlsIHRlc3RpbmcgaGFwcGVucyBvbiBvdGhlciBicm93c2Vyc1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cblx0XHRcdGNvbnN0IGRlbHRhMSA9IG5vdyAtIHByZXZpb3VzU2VsZWN0aW9uQ2hhbmdlRXZlbnRUaW1lO1xuXHRcdFx0cHJldmlvdXNTZWxlY3Rpb25DaGFuZ2VFdmVudFRpbWUgPSBub3c7XG5cdFx0XHRpZiAoZGVsdGExIDwgNSkge1xuXHRcdFx0XHQvLyByZWNlaXZlZCBhbm90aGVyIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50IHdpdGhpbiA1bXMgb2YgdGhlIHByZXZpb3VzIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50XG5cdFx0XHRcdC8vID0+IGlnbm9yZSBpdFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlbHRhMiA9IG5vdyAtIHRoaXMuX3RleHRBcmVhLmdldElnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUoKTtcblx0XHRcdHRoaXMuX3RleHRBcmVhLnJlc2V0U2VsZWN0aW9uQ2hhbmdlVGltZSgpO1xuXHRcdFx0aWYgKGRlbHRhMiA8IDEwMCkge1xuXHRcdFx0XHQvLyByZWNlaXZlZCBhIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50IHdpdGhpbiAxMDBtcyBzaW5jZSB3ZSB0b3VjaGVkIHRoZSB0ZXh0YXJlYVxuXHRcdFx0XHQvLyA9PiBpZ25vcmUgaXQsIHNpbmNlIHdlIGNhdXNlZCBpdFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fdGV4dEFyZWFTdGF0ZS5zZWxlY3Rpb24pIHtcblx0XHRcdFx0Ly8gQ2Fubm90IGNvcnJlbGF0ZSBhIHBvc2l0aW9uIGluIHRoZSB0ZXh0YXJlYSB3aXRoIGEgcG9zaXRpb24gaW4gdGhlIGVkaXRvci4uLlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld1ZhbHVlID0gdGhpcy5fdGV4dEFyZWEuZ2V0VmFsdWUoKTtcblx0XHRcdGlmICh0aGlzLl90ZXh0QXJlYVN0YXRlLnZhbHVlICE9PSBuZXdWYWx1ZSkge1xuXHRcdFx0XHQvLyBDYW5ub3QgY29ycmVsYXRlIGEgcG9zaXRpb24gaW4gdGhlIHRleHRhcmVhIHdpdGggYSBwb3NpdGlvbiBpbiB0aGUgZWRpdG9yLi4uXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9uU3RhcnQgPSB0aGlzLl90ZXh0QXJlYS5nZXRTZWxlY3Rpb25TdGFydCgpO1xuXHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9uRW5kID0gdGhpcy5fdGV4dEFyZWEuZ2V0U2VsZWN0aW9uRW5kKCk7XG5cdFx0XHRpZiAodGhpcy5fdGV4dEFyZWFTdGF0ZS5zZWxlY3Rpb25TdGFydCA9PT0gbmV3U2VsZWN0aW9uU3RhcnQgJiYgdGhpcy5fdGV4dEFyZWFTdGF0ZS5zZWxlY3Rpb25FbmQgPT09IG5ld1NlbGVjdGlvbkVuZCkge1xuXHRcdFx0XHQvLyBOb3RoaW5nIHRvIGRvLi4uXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgX25ld1NlbGVjdGlvblN0YXJ0UG9zaXRpb24gPSB0aGlzLl90ZXh0QXJlYVN0YXRlLmRlZHVjZUVkaXRvclBvc2l0aW9uKG5ld1NlbGVjdGlvblN0YXJ0KTtcblx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvblN0YXJ0UG9zaXRpb24gPSB0aGlzLl9ob3N0LmRlZHVjZU1vZGVsUG9zaXRpb24oX25ld1NlbGVjdGlvblN0YXJ0UG9zaXRpb25bMF0hLCBfbmV3U2VsZWN0aW9uU3RhcnRQb3NpdGlvblsxXSwgX25ld1NlbGVjdGlvblN0YXJ0UG9zaXRpb25bMl0pO1xuXG5cdFx0XHRjb25zdCBfbmV3U2VsZWN0aW9uRW5kUG9zaXRpb24gPSB0aGlzLl90ZXh0QXJlYVN0YXRlLmRlZHVjZUVkaXRvclBvc2l0aW9uKG5ld1NlbGVjdGlvbkVuZCk7XG5cdFx0XHRjb25zdCBuZXdTZWxlY3Rpb25FbmRQb3NpdGlvbiA9IHRoaXMuX2hvc3QuZGVkdWNlTW9kZWxQb3NpdGlvbihfbmV3U2VsZWN0aW9uRW5kUG9zaXRpb25bMF0hLCBfbmV3U2VsZWN0aW9uRW5kUG9zaXRpb25bMV0sIF9uZXdTZWxlY3Rpb25FbmRQb3NpdGlvblsyXSk7XG5cblx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24oXG5cdFx0XHRcdG5ld1NlbGVjdGlvblN0YXJ0UG9zaXRpb24ubGluZU51bWJlciwgbmV3U2VsZWN0aW9uU3RhcnRQb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRcdG5ld1NlbGVjdGlvbkVuZFBvc2l0aW9uLmxpbmVOdW1iZXIsIG5ld1NlbGVjdGlvbkVuZFBvc2l0aW9uLmNvbHVtblxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5fb25TZWxlY3Rpb25DaGFuZ2VSZXF1ZXN0LmZpcmUobmV3U2VsZWN0aW9uKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRpZiAodGhpcy5fc2VsZWN0aW9uQ2hhbmdlTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbkNoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbkNoYW5nZUxpc3RlbmVyID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNUZXh0QXJlYSgpOiB2b2lkIHtcblx0XHQvLyBTZXR0aW5nIHRoaXMuX2hhc0ZvY3VzIGFuZCB3cml0aW5nIHRoZSBzY3JlZW4gcmVhZGVyIGNvbnRlbnRcblx0XHQvLyB3aWxsIHJlc3VsdCBpbiBhIGZvY3VzKCkgYW5kIHNldFNlbGVjdGlvblJhbmdlKCkgaW4gdGhlIHRleHRhcmVhXG5cdFx0dGhpcy5fc2V0SGFzRm9jdXModHJ1ZSk7XG5cblx0XHQvLyBJZiB0aGUgZWRpdG9yIGlzIG9mZiBET00sIGZvY3VzIGNhbm5vdCBiZSByZWFsbHkgc2V0LCBzbyBsZXQncyBkb3VibGUgY2hlY2sgdGhhdCB3ZSBoYXZlIG1hbmFnZWQgdG8gc2V0IHRoZSBmb2N1c1xuXHRcdHRoaXMucmVmcmVzaEZvY3VzU3RhdGUoKTtcblx0fVxuXG5cdHB1YmxpYyBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhc0ZvY3VzO1xuXHR9XG5cblx0cHVibGljIHJlZnJlc2hGb2N1c1N0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldEhhc0ZvY3VzKHRoaXMuX3RleHRBcmVhLmhhc0ZvY3VzKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SGFzRm9jdXMobmV3SGFzRm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGFzRm9jdXMgPT09IG5ld0hhc0ZvY3VzKSB7XG5cdFx0XHQvLyBubyBjaGFuZ2Vcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGFzRm9jdXMgPSBuZXdIYXNGb2N1cztcblxuXHRcdGlmICh0aGlzLl9zZWxlY3Rpb25DaGFuZ2VMaXN0ZW5lcikge1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uQ2hhbmdlTGlzdGVuZXIgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faGFzRm9jdXMpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbkNoYW5nZUxpc3RlbmVyID0gdGhpcy5faW5zdGFsbFNlbGVjdGlvbkNoYW5nZUxpc3RlbmVyKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2hhc0ZvY3VzKSB7XG5cdFx0XHR0aGlzLndyaXRlTmF0aXZlVGV4dEFyZWFDb250ZW50KCdmb2N1c2dhaW4nKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faGFzRm9jdXMpIHtcblx0XHRcdHRoaXMuX29uRm9jdXMuZmlyZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkJsdXIuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldEFuZFdyaXRlVGV4dEFyZWFTdGF0ZShyZWFzb246IHN0cmluZywgdGV4dEFyZWFTdGF0ZTogVGV4dEFyZWFTdGF0ZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faGFzRm9jdXMpIHtcblx0XHRcdHRleHRBcmVhU3RhdGUgPSB0ZXh0QXJlYVN0YXRlLmNvbGxhcHNlU2VsZWN0aW9uKCk7XG5cdFx0fVxuXHRcdGlmICghdGV4dEFyZWFTdGF0ZS5pc1dyaXR0ZW5Ub1RleHRBcmVhKHRoaXMuX3RleHRBcmVhLCB0aGlzLl9oYXNGb2N1cykpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYHdyaXRlVGV4dEFyZWFTdGF0ZShyZWFzb246ICR7cmVhc29ufSlgKTtcblx0XHR9XG5cdFx0dGV4dEFyZWFTdGF0ZS53cml0ZVRvVGV4dEFyZWEocmVhc29uLCB0aGlzLl90ZXh0QXJlYSwgdGhpcy5faGFzRm9jdXMpO1xuXHRcdHRoaXMuX3RleHRBcmVhU3RhdGUgPSB0ZXh0QXJlYVN0YXRlO1xuXHR9XG5cblx0cHVibGljIHdyaXRlTmF0aXZlVGV4dEFyZWFDb250ZW50KHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCghdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSAmJiByZWFzb24gPT09ICdyZW5kZXInKSB8fCB0aGlzLl9jdXJyZW50Q29tcG9zaXRpb24pIHtcblx0XHRcdC8vIERvIG5vdCB3cml0ZSB0byB0aGUgdGV4dCBvbiByZW5kZXIgdW5sZXNzIGEgc2NyZWVuIHJlYWRlciBpcyBiZWluZyB1c2VkICMxOTIyNzhcblx0XHRcdC8vIERvIG5vdCB3cml0ZSB0byB0aGUgdGV4dCBhcmVhIHdoZW4gZG9pbmcgY29tcG9zaXRpb25cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2V0QW5kV3JpdGVUZXh0QXJlYVN0YXRlKHJlYXNvbiwgdGhpcy5faG9zdC5nZXRTY3JlZW5SZWFkZXJDb250ZW50KCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0QXJlYVdyYXBwZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbXBsZXRlVGV4dEFyZWFXcmFwcGVyIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgb25LZXlEb3duOiBFdmVudDxLZXlib2FyZEV2ZW50Pjtcblx0cHVibGljIHJlYWRvbmx5IG9uS2V5UHJlc3M6IEV2ZW50PEtleWJvYXJkRXZlbnQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgb25LZXlVcDogRXZlbnQ8S2V5Ym9hcmRFdmVudD47XG5cdHB1YmxpYyByZWFkb25seSBvbkNvbXBvc2l0aW9uU3RhcnQ6IEV2ZW50PENvbXBvc2l0aW9uRXZlbnQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Db21wb3NpdGlvblVwZGF0ZTogRXZlbnQ8Q29tcG9zaXRpb25FdmVudD47XG5cdHB1YmxpYyByZWFkb25seSBvbkNvbXBvc2l0aW9uRW5kOiBFdmVudDxDb21wb3NpdGlvbkV2ZW50Pjtcblx0cHVibGljIHJlYWRvbmx5IG9uQmVmb3JlSW5wdXQ6IEV2ZW50PElucHV0RXZlbnQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgb25JbnB1dDogRXZlbnQ8SW5wdXRFdmVudD47XG5cdHB1YmxpYyByZWFkb25seSBvbkN1dDogRXZlbnQ8Q2xpcGJvYXJkRXZlbnQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Db3B5OiBFdmVudDxDbGlwYm9hcmRFdmVudD47XG5cdHB1YmxpYyByZWFkb25seSBvblBhc3RlOiBFdmVudDxDbGlwYm9hcmRFdmVudD47XG5cdHB1YmxpYyByZWFkb25seSBvbkZvY3VzOiBFdmVudDxGb2N1c0V2ZW50Pjtcblx0cHVibGljIHJlYWRvbmx5IG9uQmx1cjogRXZlbnQ8Rm9jdXNFdmVudD47IC8vICA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKHRoaXMuX2FjdHVhbCwgJ2JsdXInKSkuZXZlbnQ7XG5cblx0cHVibGljIGdldCBvd25lckRvY3VtZW50KCk6IERvY3VtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLm93bmVyRG9jdW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9vblN5bnRoZXRpY1RhcCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25TeW50aGV0aWNUYXA6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25TeW50aGV0aWNUYXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfaWdub3JlU2VsZWN0aW9uQ2hhbmdlVGltZTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FjdHVhbDogSFRNTFRleHRBcmVhRWxlbWVudFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2lnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUgPSAwO1xuXHRcdHRoaXMub25LZXlEb3duID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIodGhpcy5fYWN0dWFsLCAna2V5ZG93bicpKS5ldmVudDtcblx0XHR0aGlzLm9uS2V5UHJlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLl9hY3R1YWwsICdrZXlwcmVzcycpKS5ldmVudDtcblx0XHR0aGlzLm9uS2V5VXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLl9hY3R1YWwsICdrZXl1cCcpKS5ldmVudDtcblx0XHR0aGlzLm9uQ29tcG9zaXRpb25TdGFydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKHRoaXMuX2FjdHVhbCwgJ2NvbXBvc2l0aW9uc3RhcnQnKSkuZXZlbnQ7XG5cdFx0dGhpcy5vbkNvbXBvc2l0aW9uVXBkYXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIodGhpcy5fYWN0dWFsLCAnY29tcG9zaXRpb251cGRhdGUnKSkuZXZlbnQ7XG5cdFx0dGhpcy5vbkNvbXBvc2l0aW9uRW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIodGhpcy5fYWN0dWFsLCAnY29tcG9zaXRpb25lbmQnKSkuZXZlbnQ7XG5cdFx0dGhpcy5vbkJlZm9yZUlucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIodGhpcy5fYWN0dWFsLCAnYmVmb3JlaW5wdXQnKSkuZXZlbnQ7XG5cdFx0dGhpcy5vbklucHV0ID0gPEV2ZW50PElucHV0RXZlbnQ+PnRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKHRoaXMuX2FjdHVhbCwgJ2lucHV0JykpLmV2ZW50O1xuXHRcdHRoaXMub25DdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLl9hY3R1YWwsICdjdXQnKSkuZXZlbnQ7XG5cdFx0dGhpcy5vbkNvcHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLl9hY3R1YWwsICdjb3B5JykpLmV2ZW50O1xuXHRcdHRoaXMub25QYXN0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKHRoaXMuX2FjdHVhbCwgJ3Bhc3RlJykpLmV2ZW50O1xuXHRcdHRoaXMub25Gb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKHRoaXMuX2FjdHVhbCwgJ2ZvY3VzJykpLmV2ZW50O1xuXHRcdHRoaXMub25CbHVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbUVtaXR0ZXIodGhpcy5fYWN0dWFsLCAnYmx1cicpKS5ldmVudDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25LZXlEb3duKCgpID0+IGlucHV0TGF0ZW5jeS5vbktleURvd24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25CZWZvcmVJbnB1dCgoKSA9PiBpbnB1dExhdGVuY3kub25CZWZvcmVJbnB1dCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbklucHV0KCgpID0+IGlucHV0TGF0ZW5jeS5vbklucHV0KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uS2V5VXAoKCkgPT4gaW5wdXRMYXRlbmN5Lm9uS2V5VXAoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fYWN0dWFsLCBUZXh0QXJlYVN5bnRldGhpY0V2ZW50cy5UYXAsICgpID0+IHRoaXMuX29uU3ludGhldGljVGFwLmZpcmUoKSkpO1xuXHR9XG5cblx0cHVibGljIGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNoYWRvd1Jvb3QgPSBkb20uZ2V0U2hhZG93Um9vdCh0aGlzLl9hY3R1YWwpO1xuXHRcdGlmIChzaGFkb3dSb290KSB7XG5cdFx0XHRyZXR1cm4gc2hhZG93Um9vdC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLl9hY3R1YWw7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9hY3R1YWwuaXNDb25uZWN0ZWQpIHtcblx0XHRcdHJldHVybiBkb20uZ2V0QWN0aXZlRWxlbWVudCgpID09PSB0aGlzLl9hY3R1YWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0SWdub3JlU2VsZWN0aW9uQ2hhbmdlVGltZShyZWFzb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2lnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUgPSBEYXRlLm5vdygpO1xuXHR9XG5cblx0cHVibGljIGdldElnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5faWdub3JlU2VsZWN0aW9uQ2hhbmdlVGltZTtcblx0fVxuXG5cdHB1YmxpYyByZXNldFNlbGVjdGlvbkNoYW5nZVRpbWUoKTogdm9pZCB7XG5cdFx0dGhpcy5faWdub3JlU2VsZWN0aW9uQ2hhbmdlVGltZSA9IDA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWUoKTogc3RyaW5nIHtcblx0XHQvLyBjb25zb2xlLmxvZygnY3VycmVudCB2YWx1ZTogJyArIHRoaXMuX3RleHRBcmVhLnZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLnZhbHVlO1xuXHR9XG5cblx0cHVibGljIHNldFZhbHVlKHJlYXNvbjogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGV4dEFyZWEgPSB0aGlzLl9hY3R1YWw7XG5cdFx0aWYgKHRleHRBcmVhLnZhbHVlID09PSB2YWx1ZSkge1xuXHRcdFx0Ly8gTm8gY2hhbmdlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIGNvbnNvbGUubG9nKCdyZWFzb246ICcgKyByZWFzb24gKyAnLCBjdXJyZW50IHZhbHVlOiAnICsgdGV4dEFyZWEudmFsdWUgKyAnID0+IG5ldyB2YWx1ZTogJyArIHZhbHVlKTtcblx0XHR0aGlzLnNldElnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUoJ3NldFZhbHVlJyk7XG5cdFx0dGV4dEFyZWEudmFsdWUgPSB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWxlY3Rpb25TdGFydCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwuc2VsZWN0aW9uRGlyZWN0aW9uID09PSAnYmFja3dhcmQnID8gdGhpcy5fYWN0dWFsLnNlbGVjdGlvbkVuZCA6IHRoaXMuX2FjdHVhbC5zZWxlY3Rpb25TdGFydDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWxlY3Rpb25FbmQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLnNlbGVjdGlvbkRpcmVjdGlvbiA9PT0gJ2JhY2t3YXJkJyA/IHRoaXMuX2FjdHVhbC5zZWxlY3Rpb25TdGFydCA6IHRoaXMuX2FjdHVhbC5zZWxlY3Rpb25FbmQ7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2VsZWN0aW9uUmFuZ2UocmVhc29uOiBzdHJpbmcsIHNlbGVjdGlvblN0YXJ0OiBudW1iZXIsIHNlbGVjdGlvbkVuZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdGV4dEFyZWEgPSB0aGlzLl9hY3R1YWw7XG5cblx0XHRsZXQgYWN0aXZlRWxlbWVudDogRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IHNoYWRvd1Jvb3QgPSBkb20uZ2V0U2hhZG93Um9vdCh0ZXh0QXJlYSk7XG5cdFx0aWYgKHNoYWRvd1Jvb3QpIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQgPSBzaGFkb3dSb290LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQgPSBkb20uZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVXaW5kb3cgPSBkb20uZ2V0V2luZG93KGFjdGl2ZUVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgY3VycmVudElzRm9jdXNlZCA9IChhY3RpdmVFbGVtZW50ID09PSB0ZXh0QXJlYSk7XG5cdFx0Y29uc3QgY3VycmVudFNlbGVjdGlvblN0YXJ0ID0gdGV4dEFyZWEuc2VsZWN0aW9uU3RhcnQ7XG5cdFx0Y29uc3QgY3VycmVudFNlbGVjdGlvbkVuZCA9IHRleHRBcmVhLnNlbGVjdGlvbkVuZDtcblxuXHRcdGlmIChjdXJyZW50SXNGb2N1c2VkICYmIGN1cnJlbnRTZWxlY3Rpb25TdGFydCA9PT0gc2VsZWN0aW9uU3RhcnQgJiYgY3VycmVudFNlbGVjdGlvbkVuZCA9PT0gc2VsZWN0aW9uRW5kKSB7XG5cdFx0XHQvLyBObyBjaGFuZ2Vcblx0XHRcdC8vIEZpcmVmb3ggaWZyYW1lIGJ1ZyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L21vbmFjby1lZGl0b3IvaXNzdWVzLzY0MyNpc3N1ZWNvbW1lbnQtMzY3ODcxMzc3XG5cdFx0XHRpZiAoYnJvd3Nlci5pc0ZpcmVmb3ggJiYgYWN0aXZlV2luZG93LnBhcmVudCAhPT0gYWN0aXZlV2luZG93KSB7XG5cdFx0XHRcdHRleHRBcmVhLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gY29uc29sZS5sb2coJ3JlYXNvbjogJyArIHJlYXNvbiArICcsIHNldFNlbGVjdGlvblJhbmdlOiAnICsgc2VsZWN0aW9uU3RhcnQgKyAnIC0+ICcgKyBzZWxlY3Rpb25FbmQpO1xuXG5cdFx0aWYgKGN1cnJlbnRJc0ZvY3VzZWQpIHtcblx0XHRcdC8vIE5vIG5lZWQgdG8gZm9jdXMsIG9ubHkgbmVlZCB0byBjaGFuZ2UgdGhlIHNlbGVjdGlvbiByYW5nZVxuXHRcdFx0dGhpcy5zZXRJZ25vcmVTZWxlY3Rpb25DaGFuZ2VUaW1lKCdzZXRTZWxlY3Rpb25SYW5nZScpO1xuXHRcdFx0dGV4dEFyZWEuc2V0U2VsZWN0aW9uUmFuZ2Uoc2VsZWN0aW9uU3RhcnQsIHNlbGVjdGlvbkVuZCk7XG5cdFx0XHRpZiAoYnJvd3Nlci5pc0ZpcmVmb3ggJiYgYWN0aXZlV2luZG93LnBhcmVudCAhPT0gYWN0aXZlV2luZG93KSB7XG5cdFx0XHRcdHRleHRBcmVhLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIGZvY3VzIGlzIG91dHNpZGUgdGhlIHRleHRhcmVhLCBicm93c2VycyB3aWxsIHRyeSByZWFsbHkgaGFyZCB0byByZXZlYWwgdGhlIHRleHRhcmVhLlxuXHRcdC8vIEhlcmUsIHdlIHRyeSB0byB1bmRvIHRoZSBicm93c2VyJ3MgZGVzcGVyYXRlIHJldmVhbC5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Nyb2xsU3RhdGUgPSBkb20uc2F2ZVBhcmVudHNTY3JvbGxUb3AodGV4dEFyZWEpO1xuXHRcdFx0dGhpcy5zZXRJZ25vcmVTZWxlY3Rpb25DaGFuZ2VUaW1lKCdzZXRTZWxlY3Rpb25SYW5nZScpO1xuXHRcdFx0dGV4dEFyZWEuZm9jdXMoKTtcblx0XHRcdHRleHRBcmVhLnNldFNlbGVjdGlvblJhbmdlKHNlbGVjdGlvblN0YXJ0LCBzZWxlY3Rpb25FbmQpO1xuXHRcdFx0ZG9tLnJlc3RvcmVQYXJlbnRzU2Nyb2xsVG9wKHRleHRBcmVhLCBzY3JvbGxTdGF0ZSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gU29tZXRpbWVzIElFIHRocm93cyB3aGVuIHNldHRpbmcgc2VsZWN0aW9uIChlLmcuIHRleHRhcmVhIGlzIG9mZi1ET00pXG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksYUFBYTtBQUN6QixZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBeUIsNkJBQTZCO0FBQ3RELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQXlCLHlCQUF5QjtBQUMzRCxTQUFTLHVCQUF1QjtBQUNoQyxZQUFZLGFBQWE7QUFFekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBa0MsYUFBYSwwQkFBMEIsMkJBQXNFLHdDQUF3QztBQUN2TCxTQUFTLG1CQUFnRCxxQkFBcUI7QUFHdkUsSUFBVTtBQUFBLENBQVYsQ0FBVUEsNkJBQVY7QUFDQyxFQUFNQSx5QkFBQSxNQUFNO0FBQUEsR0FESDtBQXdEakIsTUFBTSxtQkFBbUI7QUFBQSxFQUl4QixjQUFjO0FBQ2IsU0FBSyxzQkFBc0I7QUFBQSxFQUM1QjtBQUFBLEVBRU8sd0JBQXdCLE1BQTRDO0FBQzFFLFdBQU8sUUFBUTtBQUNmLFVBQU0sWUFBdUI7QUFBQSxNQUM1QjtBQUFBLE1BQ0Esb0JBQW9CLEtBQUs7QUFBQSxNQUN6QixvQkFBb0I7QUFBQSxNQUNwQixlQUFlO0FBQUEsSUFDaEI7QUFDQSxTQUFLLHNCQUFzQixLQUFLO0FBQ2hDLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFVTyxJQUFNLGdCQUFOLGNBQTRCLFdBQVc7QUFBQSxFQTZEN0MsWUFDa0IsT0FDQSxXQUNBLEtBQ0EsVUFDdUIsdUJBQ1YsYUFDN0I7QUFDRCxVQUFNO0FBUFc7QUFDQTtBQUNBO0FBQ0E7QUFDdUI7QUFDVjtBQWpFL0IsU0FBUSxXQUFXLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNyRCxTQUFnQixVQUF1QixLQUFLLFNBQVM7QUFFckQsU0FBUSxVQUFVLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNwRCxTQUFnQixTQUFzQixLQUFLLFFBQVE7QUFFbkQsU0FBUSxhQUFhLEtBQUssVUFBVSxJQUFJLFFBQXdCLENBQUM7QUFDakUsU0FBZ0IsWUFBbUMsS0FBSyxXQUFXO0FBRW5FLFNBQVEsV0FBVyxLQUFLLFVBQVUsSUFBSSxRQUF3QixDQUFDO0FBQy9ELFNBQWdCLFVBQWlDLEtBQUssU0FBUztBQUUvRCxTQUFRLFNBQVMsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ25ELFNBQWdCLFFBQXFCLEtBQUssT0FBTztBQUVqRCxTQUFRLFdBQVcsS0FBSyxVQUFVLElBQUksUUFBb0IsQ0FBQztBQUMzRCxTQUFnQixVQUE2QixLQUFLLFNBQVM7QUFFM0QsU0FBUSxjQUFjLEtBQUssVUFBVSxJQUFJLFFBQTZCLENBQUM7QUFDdkUsU0FBZ0IsYUFBeUMsS0FBSyxZQUFZO0FBRTFFLFNBQVEsYUFBYSxLQUFLLFVBQVUsSUFBSSxRQUE2QixDQUFDO0FBQ3RFLFNBQWdCLFlBQXdDLEtBQUssV0FBVztBQUV4RSxTQUFRLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBOEIsQ0FBQztBQUN6RSxTQUFnQixjQUEyQyxLQUFLLGFBQWE7QUFFN0UsU0FBUSxVQUFVLEtBQUssVUFBVSxJQUFJLFFBQW1CLENBQUM7QUFDekQsU0FBZ0IsU0FBMkIsS0FBSyxRQUFRO0FBRXhELFNBQVEsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQWdDLENBQUM7QUFDbEYsU0FBZ0IscUJBQW9ELEtBQUssb0JBQW9CO0FBRTdGLFNBQVEsdUJBQXVCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDN0UsU0FBZ0Isc0JBQStDLEtBQUsscUJBQXFCO0FBRXpGLFNBQVEsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUM5RCxTQUFnQixtQkFBZ0MsS0FBSyxrQkFBa0I7QUFFdkUsU0FBUSw0QkFBNEIsS0FBSyxVQUFVLElBQUksUUFBbUIsQ0FBQztBQUMzRSxTQUFnQiwyQkFBNkMsS0FBSywwQkFBMEI7QUFNNUYsU0FBaUIsMENBQStFLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBc0JySSxTQUFLLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxpQkFBaUIsTUFBTSxLQUFLLE9BQU8sS0FBSyxHQUFHLENBQUMsQ0FBQztBQUN4RixTQUFLLGlCQUFpQixjQUFjO0FBQ3BDLFNBQUssMkJBQTJCO0FBQ2hDLFFBQUksS0FBSyxzQkFBc0Isd0JBQXdCLEdBQUc7QUFDekQsV0FBSywyQkFBMkIsTUFBTTtBQUFBLElBQ3ZDO0FBQ0EsU0FBSyxVQUFVLE1BQU0sZ0JBQWdCLEtBQUssc0JBQXNCLGtDQUFrQyxNQUFNO0FBQ3ZHLFVBQUksS0FBSyxzQkFBc0Isd0JBQXdCLEtBQUssQ0FBQyxLQUFLLHdDQUF3QyxPQUFPO0FBRWhILGFBQUssd0NBQXdDLFFBQVEsSUFBSSxpQkFBaUIsTUFBTSxLQUFLLDJCQUEyQixnQkFBZ0IsR0FBRyxDQUFDO0FBQUEsTUFDckksT0FBTztBQUNOLGFBQUssd0NBQXdDLE1BQU07QUFBQSxNQUNwRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxZQUFZO0FBQ2pCLFNBQUssc0JBQXNCO0FBRTNCLFFBQUksY0FBcUM7QUFFekMsU0FBSyxVQUFVLEtBQUssVUFBVSxVQUFVLENBQUMsT0FBTztBQUMvQyxZQUFNLElBQUksSUFBSSxzQkFBc0IsRUFBRTtBQUN0QyxVQUFJLEVBQUUsWUFBWSxRQUFRLHNCQUNyQixLQUFLLHVCQUF1QixFQUFFLFlBQVksUUFBUSxXQUFZO0FBRWxFLFVBQUUsZ0JBQWdCO0FBQUEsTUFDbkI7QUFFQSxVQUFJLEVBQUUsT0FBTyxRQUFRLE1BQU0sR0FBRztBQUc3QixVQUFFLGVBQWU7QUFBQSxNQUNsQjtBQUVBLG9CQUFjO0FBQ2QsV0FBSyxXQUFXLEtBQUssQ0FBQztBQUFBLElBQ3ZCLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLFVBQVUsUUFBUSxDQUFDLE9BQU87QUFDN0MsWUFBTSxJQUFJLElBQUksc0JBQXNCLEVBQUU7QUFDdEMsV0FBSyxTQUFTLEtBQUssQ0FBQztBQUFBLElBQ3JCLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLFVBQVUsbUJBQW1CLENBQUMsTUFBTTtBQUN2RCxVQUFJLG1CQUFtQjtBQUN0QixnQkFBUSxJQUFJLHNCQUFzQixDQUFDO0FBQUEsTUFDcEM7QUFFQSxZQUFNLHFCQUFxQixJQUFJLG1CQUFtQjtBQUNsRCxVQUFJLEtBQUsscUJBQXFCO0FBRTdCLGFBQUssc0JBQXNCO0FBQzNCO0FBQUEsTUFDRDtBQUNBLFdBQUssc0JBQXNCO0FBRTNCLFVBQ0MsS0FBSyxRQUFRLGdCQUFnQixhQUMxQixlQUNBLFlBQVksT0FBTyxRQUFRLGtCQUFrQixLQUM3QyxLQUFLLGVBQWUsbUJBQW1CLEtBQUssZUFBZSxnQkFDM0QsS0FBSyxlQUFlLGlCQUFpQixLQUNyQyxLQUFLLGVBQWUsTUFBTSxPQUFPLEtBQUssZUFBZSxpQkFBaUIsR0FBRyxDQUFDLE1BQU0sRUFBRSxTQUNqRixZQUFZLFNBQVMsZ0JBQWdCLFlBQVksU0FBUyxjQUM3RDtBQUVELFlBQUksbUJBQW1CO0FBQ3RCLGtCQUFRLElBQUksb0VBQW9FLENBQUM7QUFBQSxRQUNsRjtBQUVBLDJCQUFtQix3QkFBd0IsR0FBRztBQUM5QyxhQUFLLG9CQUFvQixLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQztBQUM5QztBQUFBLE1BQ0Q7QUFFQSxVQUFJLEtBQUssU0FBUyxXQUFXO0FBRzVCLGFBQUssb0JBQW9CLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDO0FBQzlDO0FBQUEsTUFDRDtBQUVBLFdBQUssb0JBQW9CLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDO0FBQUEsSUFDL0MsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssVUFBVSxvQkFBb0IsQ0FBQyxNQUFNO0FBQ3hELFVBQUksbUJBQW1CO0FBQ3RCLGdCQUFRLElBQUksdUJBQXVCLENBQUM7QUFBQSxNQUNyQztBQUNBLFlBQU0scUJBQXFCLEtBQUs7QUFDaEMsVUFBSSxDQUFDLG9CQUFvQjtBQUV4QjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLEtBQUssU0FBUyxXQUFXO0FBSzVCLGNBQU0sV0FBVyxjQUFjLGlCQUFpQixLQUFLLFdBQVcsS0FBSyxjQUFjO0FBQ25GLGNBQU1DLGFBQVksY0FBYyw4QkFBOEIsS0FBSyxnQkFBZ0IsUUFBUTtBQUMzRixhQUFLLGlCQUFpQjtBQUN0QixhQUFLLFFBQVEsS0FBS0EsVUFBUztBQUMzQixhQUFLLHFCQUFxQixLQUFLLENBQUM7QUFDaEM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxZQUFZLG1CQUFtQix3QkFBd0IsRUFBRSxJQUFJO0FBQ25FLFdBQUssaUJBQWlCLGNBQWMsaUJBQWlCLEtBQUssV0FBVyxLQUFLLGNBQWM7QUFDeEYsV0FBSyxRQUFRLEtBQUssU0FBUztBQUMzQixXQUFLLHFCQUFxQixLQUFLLENBQUM7QUFBQSxJQUNqQyxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxVQUFVLGlCQUFpQixDQUFDLE1BQU07QUFDckQsVUFBSSxtQkFBbUI7QUFDdEIsZ0JBQVEsSUFBSSxvQkFBb0IsQ0FBQztBQUFBLE1BQ2xDO0FBQ0EsWUFBTSxxQkFBcUIsS0FBSztBQUNoQyxVQUFJLENBQUMsb0JBQW9CO0FBR3hCO0FBQUEsTUFDRDtBQUNBLFdBQUssc0JBQXNCO0FBRTNCLFVBQUksS0FBSyxTQUFTLFdBQVc7QUFLNUIsY0FBTSxXQUFXLGNBQWMsaUJBQWlCLEtBQUssV0FBVyxLQUFLLGNBQWM7QUFDbkYsY0FBTUEsYUFBWSxjQUFjLDhCQUE4QixLQUFLLGdCQUFnQixRQUFRO0FBQzNGLGFBQUssaUJBQWlCO0FBQ3RCLGFBQUssUUFBUSxLQUFLQSxVQUFTO0FBQzNCLGFBQUssa0JBQWtCLEtBQUs7QUFDNUI7QUFBQSxNQUNEO0FBRUEsWUFBTSxZQUFZLG1CQUFtQix3QkFBd0IsRUFBRSxJQUFJO0FBQ25FLFdBQUssaUJBQWlCLGNBQWMsaUJBQWlCLEtBQUssV0FBVyxLQUFLLGNBQWM7QUFDeEYsV0FBSyxRQUFRLEtBQUssU0FBUztBQUMzQixXQUFLLGtCQUFrQixLQUFLO0FBQUEsSUFDN0IsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssVUFBVSxRQUFRLENBQUMsTUFBTTtBQUM1QyxVQUFJLG1CQUFtQjtBQUN0QixnQkFBUSxJQUFJLFdBQVcsQ0FBQztBQUFBLE1BQ3pCO0FBSUEsV0FBSyxVQUFVLDZCQUE2QixzQkFBc0I7QUFFbEUsVUFBSSxLQUFLLHFCQUFxQjtBQUM3QjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFdBQVcsY0FBYyxpQkFBaUIsS0FBSyxXQUFXLEtBQUssY0FBYztBQUNuRixZQUFNLFlBQVksY0FBYztBQUFBLFFBQVksS0FBSztBQUFBLFFBQWdCO0FBQUE7QUFBQSxRQUErQixLQUFLLFFBQVEsZ0JBQWdCO0FBQUEsTUFBUztBQUV0SSxVQUFJLFVBQVUsdUJBQXVCLEtBQUssVUFBVSxLQUFLLFdBQVcsR0FBRztBQUV0RSxZQUNDLFFBQVEsZ0JBQWdCLFVBQVUsS0FBSyxXQUFXLENBQUMsQ0FBQyxLQUNqRCxVQUFVLEtBQUssV0FBVyxDQUFDLE1BQU0sS0FDbkM7QUFFRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsV0FBSyxpQkFBaUI7QUFDdEIsVUFDQyxVQUFVLFNBQVMsTUFDaEIsVUFBVSx1QkFBdUIsS0FDakMsVUFBVSx1QkFBdUIsS0FDakMsVUFBVSxrQkFBa0IsR0FDOUI7QUFFRCxZQUFJLEVBQUUsY0FBYyxtQkFBbUI7QUFDdEMsZUFBSyxTQUFTLEtBQUs7QUFBQSxZQUNsQixNQUFNLFVBQVU7QUFBQSxZQUNoQixVQUFVLGlDQUFpQyxTQUFTLElBQUksVUFBVSxJQUFJO0FBQUEsVUFDdkUsQ0FBQztBQUFBLFFBQ0YsT0FBTztBQUNOLGVBQUssUUFBUSxLQUFLLFNBQVM7QUFBQSxRQUM1QjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUlGLFNBQUssVUFBVSxLQUFLLFVBQVUsTUFBTSxDQUFDLE1BQU07QUFDMUMsV0FBSyxZQUFZLE1BQU0sdUJBQXVCLENBQUM7QUFHL0MsWUFBTSxXQUFXO0FBQUEsUUFBeUI7QUFBQTtBQUFBLFFBQWU7QUFBQSxRQUFNLEtBQUssTUFBTTtBQUFBLFFBQVMsS0FBSztBQUFBLFFBQWEsS0FBSyxTQUFTO0FBQUEsTUFBUztBQUM1SCxXQUFLLFdBQVcsS0FBSyxRQUFRO0FBQzdCLFVBQUksU0FBUyxXQUFXO0FBRXZCO0FBQUEsTUFDRDtBQUlBLFdBQUssVUFBVSw2QkFBNkIsb0JBQW9CO0FBRWhFLGVBQVMsOEJBQThCO0FBQ3ZDLFdBQUssaUJBQWlCLFNBQVM7QUFBQSxJQUNoQyxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxVQUFVLE9BQU8sQ0FBQyxNQUFNO0FBQzNDLFdBQUssWUFBWSxNQUFNLHdCQUF3QixDQUFDO0FBT2hELGtCQUFZLHlDQUF5QztBQUdyRCxZQUFNLFlBQVk7QUFBQSxRQUF5QjtBQUFBO0FBQUEsUUFBZTtBQUFBLFFBQU8sS0FBSyxNQUFNO0FBQUEsUUFBUyxLQUFLO0FBQUEsUUFBYSxLQUFLLFNBQVM7QUFBQSxNQUFTO0FBQzlILFdBQUssWUFBWSxLQUFLLFNBQVM7QUFDL0IsVUFBSSxVQUFVLFdBQVc7QUFFeEI7QUFBQSxNQUNEO0FBRUEsZ0JBQVUsOEJBQThCO0FBQUEsSUFDekMsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssVUFBVSxRQUFRLENBQUMsTUFBTTtBQUM1QyxXQUFLLFlBQVksTUFBTSx5QkFBeUIsQ0FBQztBQUdqRCxZQUFNLGFBQWEsMEJBQTBCLENBQUM7QUFDOUMsV0FBSyxhQUFhLEtBQUssVUFBVTtBQUNqQyxVQUFJLFdBQVcsV0FBVztBQUV6QjtBQUFBLE1BQ0Q7QUFJQSxXQUFLLFVBQVUsNkJBQTZCLHNCQUFzQjtBQUVsRSxRQUFFLGVBQWU7QUFFakIsV0FBSyxZQUFZLE1BQU0sb0NBQW9DLFdBQVcsVUFBVSxJQUFJLHVCQUF1QixXQUFXLEtBQUssTUFBTTtBQUNqSSxVQUFJLENBQUMsV0FBVyxNQUFNO0FBQ3JCO0FBQUEsTUFDRDtBQUVBLFdBQUssWUFBWSxNQUFNLHdDQUF3QztBQUMvRCxXQUFLLFNBQVMsS0FBSztBQUFBLFFBQ2xCLE1BQU0sV0FBVztBQUFBLFFBQ2pCLFVBQVUsV0FBVztBQUFBLE1BQ3RCLENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLFVBQVUsUUFBUSxNQUFNO0FBQzNDLFlBQU0sV0FBVyxLQUFLO0FBRXRCLFdBQUssYUFBYSxJQUFJO0FBRXRCLFVBQUksS0FBSyxzQkFBc0Isd0JBQXdCLEtBQUssS0FBSyxTQUFTLFlBQVksQ0FBQyxZQUFZLEtBQUssV0FBVztBQUdsSCxZQUFJLENBQUMsS0FBSyx3Q0FBd0MsT0FBTztBQUN4RCxlQUFLLHdDQUF3QyxRQUFRLElBQUksaUJBQWlCLE1BQU0sS0FBSywyQkFBMkIsZ0JBQWdCLEdBQUcsQ0FBQztBQUFBLFFBQ3JJO0FBQ0EsYUFBSyx3Q0FBd0MsTUFBTSxTQUFTO0FBQUEsTUFDN0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLFVBQVUsT0FBTyxNQUFNO0FBQzFDLFVBQUksS0FBSyxxQkFBcUI7QUFNN0IsYUFBSyxzQkFBc0I7QUFHM0IsYUFBSywyQkFBMkIsMkJBQTJCO0FBRzNELGFBQUssa0JBQWtCLEtBQUs7QUFBQSxNQUM3QjtBQUNBLFdBQUssYUFBYSxLQUFLO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssVUFBVSxlQUFlLE1BQU07QUFDbEQsVUFBSSxLQUFLLFNBQVMsYUFBYSxLQUFLLHFCQUFxQjtBQUt4RCxhQUFLLHNCQUFzQjtBQUczQixhQUFLLDJCQUEyQiwwQkFBMEI7QUFHMUQsYUFBSyxrQkFBa0IsS0FBSztBQUFBLE1BQzdCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFuVUEsSUFBVyxnQkFBK0I7QUFDekMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBbVVBLHNCQUE0QjtBQUMzQixTQUFLLFlBQVk7QUFDakIsU0FBSyxpQkFBaUIsY0FBYyxpQkFBaUIsS0FBSyxXQUFXLElBQUk7QUFBQSxFQUMxRTtBQUFBLEVBRVEsa0NBQStDO0FBbUJ0RCxRQUFJLG1DQUFtQztBQUN2QyxXQUFPLElBQUksc0JBQXNCLEtBQUssVUFBVSxlQUFlLG1CQUFtQixDQUFDLE1BQU07QUFDeEYsbUJBQWEsa0JBQWtCO0FBRS9CLFVBQUksQ0FBQyxLQUFLLFdBQVc7QUFDcEI7QUFBQSxNQUNEO0FBQ0EsVUFBSSxLQUFLLHFCQUFxQjtBQUM3QjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsS0FBSyxTQUFTLFVBQVU7QUFFNUI7QUFBQSxNQUNEO0FBRUEsWUFBTSxNQUFNLEtBQUssSUFBSTtBQUVyQixZQUFNLFNBQVMsTUFBTTtBQUNyQix5Q0FBbUM7QUFDbkMsVUFBSSxTQUFTLEdBQUc7QUFHZjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFNBQVMsTUFBTSxLQUFLLFVBQVUsNkJBQTZCO0FBQ2pFLFdBQUssVUFBVSx5QkFBeUI7QUFDeEMsVUFBSSxTQUFTLEtBQUs7QUFHakI7QUFBQSxNQUNEO0FBRUEsVUFBSSxDQUFDLEtBQUssZUFBZSxXQUFXO0FBRW5DO0FBQUEsTUFDRDtBQUVBLFlBQU0sV0FBVyxLQUFLLFVBQVUsU0FBUztBQUN6QyxVQUFJLEtBQUssZUFBZSxVQUFVLFVBQVU7QUFFM0M7QUFBQSxNQUNEO0FBRUEsWUFBTSxvQkFBb0IsS0FBSyxVQUFVLGtCQUFrQjtBQUMzRCxZQUFNLGtCQUFrQixLQUFLLFVBQVUsZ0JBQWdCO0FBQ3ZELFVBQUksS0FBSyxlQUFlLG1CQUFtQixxQkFBcUIsS0FBSyxlQUFlLGlCQUFpQixpQkFBaUI7QUFFckg7QUFBQSxNQUNEO0FBRUEsWUFBTSw2QkFBNkIsS0FBSyxlQUFlLHFCQUFxQixpQkFBaUI7QUFDN0YsWUFBTSw0QkFBNEIsS0FBSyxNQUFNLG9CQUFvQiwyQkFBMkIsQ0FBQyxHQUFJLDJCQUEyQixDQUFDLEdBQUcsMkJBQTJCLENBQUMsQ0FBQztBQUU3SixZQUFNLDJCQUEyQixLQUFLLGVBQWUscUJBQXFCLGVBQWU7QUFDekYsWUFBTSwwQkFBMEIsS0FBSyxNQUFNLG9CQUFvQix5QkFBeUIsQ0FBQyxHQUFJLHlCQUF5QixDQUFDLEdBQUcseUJBQXlCLENBQUMsQ0FBQztBQUVySixZQUFNLGVBQWUsSUFBSTtBQUFBLFFBQ3hCLDBCQUEwQjtBQUFBLFFBQVksMEJBQTBCO0FBQUEsUUFDaEUsd0JBQXdCO0FBQUEsUUFBWSx3QkFBd0I7QUFBQSxNQUM3RDtBQUVBLFdBQUssMEJBQTBCLEtBQUssWUFBWTtBQUFBLElBQ2pELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFZ0IsVUFBZ0I7QUFDL0IsVUFBTSxRQUFRO0FBQ2QsUUFBSSxLQUFLLDBCQUEwQjtBQUNsQyxXQUFLLHlCQUF5QixRQUFRO0FBQ3RDLFdBQUssMkJBQTJCO0FBQUEsSUFDakM7QUFBQSxFQUNEO0FBQUEsRUFFTyxnQkFBc0I7QUFHNUIsU0FBSyxhQUFhLElBQUk7QUFHdEIsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRU8sWUFBcUI7QUFDM0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sb0JBQTBCO0FBQ2hDLFNBQUssYUFBYSxLQUFLLFVBQVUsU0FBUyxDQUFDO0FBQUEsRUFDNUM7QUFBQSxFQUVRLGFBQWEsYUFBNEI7QUFDaEQsUUFBSSxLQUFLLGNBQWMsYUFBYTtBQUVuQztBQUFBLElBQ0Q7QUFDQSxTQUFLLFlBQVk7QUFFakIsUUFBSSxLQUFLLDBCQUEwQjtBQUNsQyxXQUFLLHlCQUF5QixRQUFRO0FBQ3RDLFdBQUssMkJBQTJCO0FBQUEsSUFDakM7QUFDQSxRQUFJLEtBQUssV0FBVztBQUNuQixXQUFLLDJCQUEyQixLQUFLLGdDQUFnQztBQUFBLElBQ3RFO0FBRUEsUUFBSSxLQUFLLFdBQVc7QUFDbkIsV0FBSywyQkFBMkIsV0FBVztBQUFBLElBQzVDO0FBRUEsUUFBSSxLQUFLLFdBQVc7QUFDbkIsV0FBSyxTQUFTLEtBQUs7QUFBQSxJQUNwQixPQUFPO0FBQ04sV0FBSyxRQUFRLEtBQUs7QUFBQSxJQUNuQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDBCQUEwQixRQUFnQixlQUFvQztBQUNyRixRQUFJLENBQUMsS0FBSyxXQUFXO0FBQ3BCLHNCQUFnQixjQUFjLGtCQUFrQjtBQUFBLElBQ2pEO0FBQ0EsUUFBSSxDQUFDLGNBQWMsb0JBQW9CLEtBQUssV0FBVyxLQUFLLFNBQVMsR0FBRztBQUN2RSxXQUFLLFlBQVksTUFBTSw4QkFBOEIsTUFBTSxHQUFHO0FBQUEsSUFDL0Q7QUFDQSxrQkFBYyxnQkFBZ0IsUUFBUSxLQUFLLFdBQVcsS0FBSyxTQUFTO0FBQ3BFLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFBQSxFQUVPLDJCQUEyQixRQUFzQjtBQUN2RCxRQUFLLENBQUMsS0FBSyxzQkFBc0Isd0JBQXdCLEtBQUssV0FBVyxZQUFhLEtBQUsscUJBQXFCO0FBRy9HO0FBQUEsSUFDRDtBQUNBLFNBQUssMEJBQTBCLFFBQVEsS0FBSyxNQUFNLHVCQUF1QixDQUFDO0FBQUEsRUFDM0U7QUFDRDtBQXpoQmEsZ0JBQU47QUFBQSxFQWtFSjtBQUFBLEVBQ0E7QUFBQSxHQW5FVTtBQTJoQk4sTUFBTSx3QkFBd0IsV0FBK0M7QUFBQSxFQXlCbkYsWUFDa0IsU0FDaEI7QUFDRCxVQUFNO0FBRlc7QUFObEIsU0FBUSxrQkFBa0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzVELFNBQWdCLGlCQUE4QixLQUFLLGdCQUFnQjtBQVFsRSxTQUFLLDZCQUE2QjtBQUNsQyxTQUFLLFlBQVksS0FBSyxVQUFVLElBQUksV0FBVyxLQUFLLFNBQVMsU0FBUyxDQUFDLEVBQUU7QUFDekUsU0FBSyxhQUFhLEtBQUssVUFBVSxJQUFJLFdBQVcsS0FBSyxTQUFTLFVBQVUsQ0FBQyxFQUFFO0FBQzNFLFNBQUssVUFBVSxLQUFLLFVBQVUsSUFBSSxXQUFXLEtBQUssU0FBUyxPQUFPLENBQUMsRUFBRTtBQUNyRSxTQUFLLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxXQUFXLEtBQUssU0FBUyxrQkFBa0IsQ0FBQyxFQUFFO0FBQzNGLFNBQUssc0JBQXNCLEtBQUssVUFBVSxJQUFJLFdBQVcsS0FBSyxTQUFTLG1CQUFtQixDQUFDLEVBQUU7QUFDN0YsU0FBSyxtQkFBbUIsS0FBSyxVQUFVLElBQUksV0FBVyxLQUFLLFNBQVMsZ0JBQWdCLENBQUMsRUFBRTtBQUN2RixTQUFLLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxXQUFXLEtBQUssU0FBUyxhQUFhLENBQUMsRUFBRTtBQUNqRixTQUFLLFVBQTZCLEtBQUssVUFBVSxJQUFJLFdBQVcsS0FBSyxTQUFTLE9BQU8sQ0FBQyxFQUFFO0FBQ3hGLFNBQUssUUFBUSxLQUFLLFVBQVUsSUFBSSxXQUFXLEtBQUssU0FBUyxLQUFLLENBQUMsRUFBRTtBQUNqRSxTQUFLLFNBQVMsS0FBSyxVQUFVLElBQUksV0FBVyxLQUFLLFNBQVMsTUFBTSxDQUFDLEVBQUU7QUFDbkUsU0FBSyxVQUFVLEtBQUssVUFBVSxJQUFJLFdBQVcsS0FBSyxTQUFTLE9BQU8sQ0FBQyxFQUFFO0FBQ3JFLFNBQUssVUFBVSxLQUFLLFVBQVUsSUFBSSxXQUFXLEtBQUssU0FBUyxPQUFPLENBQUMsRUFBRTtBQUNyRSxTQUFLLFNBQVMsS0FBSyxVQUFVLElBQUksV0FBVyxLQUFLLFNBQVMsTUFBTSxDQUFDLEVBQUU7QUFFbkUsU0FBSyxVQUFVLEtBQUssVUFBVSxNQUFNLGFBQWEsVUFBVSxDQUFDLENBQUM7QUFDN0QsU0FBSyxVQUFVLEtBQUssY0FBYyxNQUFNLGFBQWEsY0FBYyxDQUFDLENBQUM7QUFDckUsU0FBSyxVQUFVLEtBQUssUUFBUSxNQUFNLGFBQWEsUUFBUSxDQUFDLENBQUM7QUFDekQsU0FBSyxVQUFVLEtBQUssUUFBUSxNQUFNLGFBQWEsUUFBUSxDQUFDLENBQUM7QUFDekQsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssU0FBUyx3QkFBd0IsS0FBSyxNQUFNLEtBQUssZ0JBQWdCLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDdkg7QUFBQTtBQUFBLEVBakNBLElBQVcsZ0JBQTBCO0FBQ3BDLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQWlDTyxXQUFvQjtBQUMxQixVQUFNLGFBQWEsSUFBSSxjQUFjLEtBQUssT0FBTztBQUNqRCxRQUFJLFlBQVk7QUFDZixhQUFPLFdBQVcsa0JBQWtCLEtBQUs7QUFBQSxJQUMxQyxXQUFXLEtBQUssUUFBUSxhQUFhO0FBQ3BDLGFBQU8sSUFBSSxpQkFBaUIsTUFBTSxLQUFLO0FBQUEsSUFDeEMsT0FBTztBQUNOLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRU8sNkJBQTZCLFFBQXNCO0FBQ3pELFNBQUssNkJBQTZCLEtBQUssSUFBSTtBQUFBLEVBQzVDO0FBQUEsRUFFTywrQkFBdUM7QUFDN0MsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sMkJBQWlDO0FBQ3ZDLFNBQUssNkJBQTZCO0FBQUEsRUFDbkM7QUFBQSxFQUVPLFdBQW1CO0FBRXpCLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVPLFNBQVMsUUFBZ0IsT0FBcUI7QUFDcEQsVUFBTSxXQUFXLEtBQUs7QUFDdEIsUUFBSSxTQUFTLFVBQVUsT0FBTztBQUU3QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLDZCQUE2QixVQUFVO0FBQzVDLGFBQVMsUUFBUTtBQUFBLEVBQ2xCO0FBQUEsRUFFTyxvQkFBNEI7QUFDbEMsV0FBTyxLQUFLLFFBQVEsdUJBQXVCLGFBQWEsS0FBSyxRQUFRLGVBQWUsS0FBSyxRQUFRO0FBQUEsRUFDbEc7QUFBQSxFQUVPLGtCQUEwQjtBQUNoQyxXQUFPLEtBQUssUUFBUSx1QkFBdUIsYUFBYSxLQUFLLFFBQVEsaUJBQWlCLEtBQUssUUFBUTtBQUFBLEVBQ3BHO0FBQUEsRUFFTyxrQkFBa0IsUUFBZ0IsZ0JBQXdCLGNBQTRCO0FBQzVGLFVBQU0sV0FBVyxLQUFLO0FBRXRCLFFBQUksZ0JBQWdDO0FBQ3BDLFVBQU0sYUFBYSxJQUFJLGNBQWMsUUFBUTtBQUM3QyxRQUFJLFlBQVk7QUFDZixzQkFBZ0IsV0FBVztBQUFBLElBQzVCLE9BQU87QUFDTixzQkFBZ0IsSUFBSSxpQkFBaUI7QUFBQSxJQUN0QztBQUNBLFVBQU0sZUFBZSxJQUFJLFVBQVUsYUFBYTtBQUVoRCxVQUFNLG1CQUFvQixrQkFBa0I7QUFDNUMsVUFBTSx3QkFBd0IsU0FBUztBQUN2QyxVQUFNLHNCQUFzQixTQUFTO0FBRXJDLFFBQUksb0JBQW9CLDBCQUEwQixrQkFBa0Isd0JBQXdCLGNBQWM7QUFHekcsVUFBSSxRQUFRLGFBQWEsYUFBYSxXQUFXLGNBQWM7QUFDOUQsaUJBQVMsTUFBTTtBQUFBLE1BQ2hCO0FBQ0E7QUFBQSxJQUNEO0FBSUEsUUFBSSxrQkFBa0I7QUFFckIsV0FBSyw2QkFBNkIsbUJBQW1CO0FBQ3JELGVBQVMsa0JBQWtCLGdCQUFnQixZQUFZO0FBQ3ZELFVBQUksUUFBUSxhQUFhLGFBQWEsV0FBVyxjQUFjO0FBQzlELGlCQUFTLE1BQU07QUFBQSxNQUNoQjtBQUNBO0FBQUEsSUFDRDtBQUlBLFFBQUk7QUFDSCxZQUFNLGNBQWMsSUFBSSxxQkFBcUIsUUFBUTtBQUNyRCxXQUFLLDZCQUE2QixtQkFBbUI7QUFDckQsZUFBUyxNQUFNO0FBQ2YsZUFBUyxrQkFBa0IsZ0JBQWdCLFlBQVk7QUFDdkQsVUFBSSx3QkFBd0IsVUFBVSxXQUFXO0FBQUEsSUFDbEQsU0FBUyxHQUFHO0FBQUEsSUFFWjtBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsiVGV4dEFyZWFTeW50ZXRoaWNFdmVudHMiLCAidHlwZUlucHV0Il0KfQo=
