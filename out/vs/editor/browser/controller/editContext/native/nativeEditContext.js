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
import "./nativeEditContext.css";
import { isFirefox } from "../../../../../base/browser/browser.js";
import { addDisposableListener, getActiveElement, getWindow, getWindowId } from "../../../../../base/browser/dom.js";
import { FastDomNode } from "../../../../../base/browser/fastDomNode.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { EndOfLinePreference } from "../../../../common/model.js";
import { CopyOptions, createClipboardCopyEvent, createClipboardPasteEvent } from "../clipboardUtils.js";
import { AbstractEditContext } from "../editContext.js";
import { editContextAddDisposableListener, FocusTracker } from "./nativeEditContextUtils.js";
import { ScreenReaderSupport } from "./screenReaderSupport.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { Position } from "../../../../common/core/position.js";
import { PositionOffsetTransformer } from "../../../../common/core/text/positionToOffset.js";
import { EditContext } from "./editContextFactory.js";
import { NativeEditContextRegistry } from "./nativeEditContextRegistry.js";
import { isHighSurrogate, isLowSurrogate } from "../../../../../base/common/strings.js";
import { IME } from "../../../../../base/common/ime.js";
import { OffsetRange } from "../../../../common/core/ranges/offsetRange.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { inputLatency } from "../../../../../base/browser/performance.js";
var CompositionClassName = /* @__PURE__ */ ((CompositionClassName2) => {
  CompositionClassName2["NONE"] = "edit-context-composition-none";
  CompositionClassName2["SECONDARY"] = "edit-context-composition-secondary";
  CompositionClassName2["PRIMARY"] = "edit-context-composition-primary";
  return CompositionClassName2;
})(CompositionClassName || {});
let NativeEditContext = class extends AbstractEditContext {
  constructor(ownerID, context, overflowGuardContainer, _viewController, _visibleRangeProvider, instantiationService, logService) {
    super(context);
    this._viewController = _viewController;
    this._visibleRangeProvider = _visibleRangeProvider;
    this.logService = logService;
    this._previousEditContextSelection = new OffsetRange(0, 0);
    this._previousEditContextText = "";
    this._editContextPrimarySelection = new Selection(1, 1, 1, 1);
    this._parentBounds = null;
    this._decorations = [];
    this._primarySelection = new Selection(1, 1, 1, 1);
    this._targetWindowId = -1;
    this._scrollTop = 0;
    this._scrollLeft = 0;
    this._linesVisibleRanges = null;
    this.domNode = new FastDomNode(document.createElement("div"));
    this.domNode.setClassName(`native-edit-context`);
    this._imeTextArea = new FastDomNode(document.createElement("textarea"));
    this._imeTextArea.setClassName(`ime-text-area`);
    this._imeTextArea.setAttribute("readonly", "true");
    this._imeTextArea.setAttribute("tabindex", "-1");
    this._imeTextArea.setAttribute("aria-hidden", "true");
    this.domNode.setAttribute("autocorrect", "off");
    this.domNode.setAttribute("autocapitalize", "off");
    this.domNode.setAttribute("autocomplete", "off");
    this.domNode.setAttribute("spellcheck", "false");
    this._updateDomAttributes();
    overflowGuardContainer.appendChild(this.domNode);
    overflowGuardContainer.appendChild(this._imeTextArea);
    this._parent = overflowGuardContainer.domNode;
    this._focusTracker = this._register(new FocusTracker(logService, this.domNode.domNode, (newFocusValue) => {
      logService.trace("NativeEditContext#handleFocusChange : ", newFocusValue);
      this._screenReaderSupport.handleFocusChange(newFocusValue);
      this._context.viewModel.setHasFocus(newFocusValue);
    }));
    const window = getWindow(this.domNode.domNode);
    this._editContext = EditContext.create(window);
    this.setEditContextOnDomNode();
    this._screenReaderSupport = this._register(instantiationService.createInstance(ScreenReaderSupport, this.domNode, context, this._viewController));
    this._register(addDisposableListener(this.domNode.domNode, "copy", (e) => {
      this.logService.trace("NativeEditContext#copy");
      CopyOptions.electronBugWorkaroundCopyEventHasFired = true;
      const copyEvent = createClipboardCopyEvent(
        e,
        /* isCut */
        false,
        this._context,
        this.logService,
        isFirefox
      );
      this._onWillCopy.fire(copyEvent);
      if (copyEvent.isHandled) {
        return;
      }
      copyEvent.ensureClipboardGetsEditorData();
    }));
    this._register(addDisposableListener(this.domNode.domNode, "cut", (e) => {
      this.logService.trace("NativeEditContext#cut");
      const cutEvent = createClipboardCopyEvent(
        e,
        /* isCut */
        true,
        this._context,
        this.logService,
        isFirefox
      );
      this._onWillCut.fire(cutEvent);
      if (cutEvent.isHandled) {
        return;
      }
      this._screenReaderSupport.onWillCut();
      cutEvent.ensureClipboardGetsEditorData();
      this.logService.trace("NativeEditContext#cut (before viewController.cut)");
      this._viewController.cut();
    }));
    this._register(addDisposableListener(this.domNode.domNode, "selectionchange", () => {
      inputLatency.onSelectionChange();
    }));
    this._register(addDisposableListener(this.domNode.domNode, "keyup", (e) => this._onKeyUp(e)));
    this._register(addDisposableListener(this.domNode.domNode, "keydown", async (e) => this._onKeyDown(e)));
    this._register(addDisposableListener(this._imeTextArea.domNode, "keyup", (e) => this._onKeyUp(e)));
    this._register(addDisposableListener(this._imeTextArea.domNode, "keydown", async (e) => this._onKeyDown(e)));
    this._register(addDisposableListener(this.domNode.domNode, "beforeinput", async (e) => {
      inputLatency.onBeforeInput();
      if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") {
        this._onType(this._viewController, { text: "\n", replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 });
      }
    }));
    this._register(addDisposableListener(this.domNode.domNode, "paste", (e) => {
      this.logService.trace("NativeEditContext#paste");
      const pasteEvent = createClipboardPasteEvent(e);
      this._onWillPaste.fire(pasteEvent);
      if (pasteEvent.isHandled) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (!e.clipboardData) {
        return;
      }
      this.logService.trace("NativeEditContext#paste with id : ", pasteEvent.metadata?.id, " with text.length: ", pasteEvent.text.length);
      if (!pasteEvent.text) {
        return;
      }
      let pasteOnNewLine = false;
      let multicursorText = null;
      let mode = null;
      if (pasteEvent.metadata) {
        const options = this._context.configuration.options;
        const emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
        pasteOnNewLine = emptySelectionClipboard && !!pasteEvent.metadata.isFromEmptySelection;
        multicursorText = typeof pasteEvent.metadata.multicursorText !== "undefined" ? pasteEvent.metadata.multicursorText : null;
        mode = pasteEvent.metadata.mode;
      }
      this.logService.trace("NativeEditContext#paste (before viewController.paste)");
      this._viewController.paste(pasteEvent.text, pasteOnNewLine, multicursorText, mode);
    }));
    this._register(editContextAddDisposableListener(this._editContext, "textformatupdate", (e) => this._handleTextFormatUpdate(e)));
    this._register(editContextAddDisposableListener(this._editContext, "characterboundsupdate", (e) => this._updateCharacterBounds(e)));
    let highSurrogateCharacter;
    this._register(editContextAddDisposableListener(this._editContext, "textupdate", (e) => {
      inputLatency.onInput();
      const text = e.text;
      if (text.length === 1) {
        const charCode = text.charCodeAt(0);
        if (isHighSurrogate(charCode)) {
          highSurrogateCharacter = text;
          return;
        }
        if (isLowSurrogate(charCode) && highSurrogateCharacter) {
          const textUpdateEvent = {
            text: highSurrogateCharacter + text,
            selectionEnd: e.selectionEnd,
            selectionStart: e.selectionStart,
            updateRangeStart: e.updateRangeStart - 1,
            updateRangeEnd: e.updateRangeEnd - 1
          };
          highSurrogateCharacter = void 0;
          this._emitTypeEvent(this._viewController, textUpdateEvent);
          return;
        }
      }
      this._emitTypeEvent(this._viewController, e);
    }));
    this._register(editContextAddDisposableListener(this._editContext, "compositionstart", (e) => {
      this._updateEditContext();
      this._viewController.compositionStart();
      this._context.viewModel.onCompositionStart();
    }));
    this._register(editContextAddDisposableListener(this._editContext, "compositionend", (e) => {
      this._updateEditContext();
      this._viewController.compositionEnd();
      this._context.viewModel.onCompositionEnd();
    }));
    let reenableTracking = false;
    this._register(IME.onDidChange(() => {
      if (IME.enabled && reenableTracking) {
        this._focusTracker.resume();
        this.domNode.focus();
        reenableTracking = false;
      }
      if (!IME.enabled && this.isFocused()) {
        this._focusTracker.pause();
        this._imeTextArea.focus();
        reenableTracking = true;
      }
    }));
    this._register(NativeEditContextRegistry.register(ownerID, this));
    this._register(context.viewModel.model.onDidChangeContent((e) => {
      let doChange = false;
      for (const change of e.changes) {
        if (change.range.startLineNumber <= this._editContextPrimarySelection.endLineNumber && change.range.endLineNumber >= this._editContextPrimarySelection.startLineNumber) {
          doChange = true;
          break;
        }
      }
      if (doChange) {
        this._updateEditContext();
      }
    }));
  }
  // --- Public methods ---
  dispose() {
    this.domNode.domNode.editContext = void 0;
    this.domNode.domNode.blur();
    this.domNode.domNode.remove();
    this._imeTextArea.domNode.remove();
    super.dispose();
  }
  setAriaOptions(options) {
    this._screenReaderSupport.setAriaOptions(options);
  }
  /* Last rendered data needed for correct hit-testing and determining the mouse position.
   * Without this, the selection will blink as incorrect mouse position is calculated */
  getLastRenderData() {
    return this._primarySelection.getPosition();
  }
  onBeforeRender(viewportData) {
    this._parentBounds = this._parent.getBoundingClientRect();
  }
  prepareRender(ctx) {
    this._screenReaderSupport.prepareRender(ctx);
    this._updateSelectionAndControlBoundsData(ctx);
  }
  render(ctx) {
    this._screenReaderSupport.render(ctx);
    this._updateSelectionAndControlBounds();
  }
  onCursorStateChanged(e) {
    this._primarySelection = e.modelSelections[0] ?? new Selection(1, 1, 1, 1);
    this._screenReaderSupport.onCursorStateChanged(e);
    this._updateEditContext();
    return true;
  }
  onConfigurationChanged(e) {
    this._screenReaderSupport.onConfigurationChanged(e);
    this._updateDomAttributes();
    return true;
  }
  onDecorationsChanged(e) {
    return true;
  }
  onFlushed(e) {
    return true;
  }
  onLinesChanged(e) {
    return true;
  }
  onLinesDeleted(e) {
    return true;
  }
  onLinesInserted(e) {
    return true;
  }
  onScrollChanged(e) {
    this._scrollLeft = e.scrollLeft;
    this._scrollTop = e.scrollTop;
    return true;
  }
  onZonesChanged(e) {
    return true;
  }
  handleWillPaste() {
    this.logService.trace("NativeEditContext#handleWillPaste");
    this._prepareScreenReaderForPaste();
  }
  _prepareScreenReaderForPaste() {
    this._screenReaderSupport.onWillPaste();
  }
  handleWillCopy() {
    this.logService.trace("NativeEditContext#handleWillCopy");
    this.logService.trace("NativeEditContext#isFocused : ", this.domNode.domNode === getActiveElement());
  }
  writeScreenReaderContent() {
    this._screenReaderSupport.writeScreenReaderContent();
  }
  isFocused() {
    return this._focusTracker.isFocused;
  }
  focus() {
    this._focusTracker.focus();
    this.refreshFocusState();
  }
  refreshFocusState() {
    this._focusTracker.refreshFocusState();
  }
  // TODO: added as a workaround fix for https://github.com/microsoft/vscode/issues/229825
  // When this issue will be fixed the following should be removed.
  setEditContextOnDomNode() {
    const targetWindow = getWindow(this.domNode.domNode);
    const targetWindowId = getWindowId(targetWindow);
    if (this._targetWindowId !== targetWindowId) {
      this.domNode.domNode.editContext = this._editContext;
      this._targetWindowId = targetWindowId;
    }
  }
  // --- Private methods ---
  _onKeyUp(e) {
    inputLatency.onKeyUp();
    this._viewController.emitKeyUp(new StandardKeyboardEvent(e));
  }
  _onKeyDown(e) {
    inputLatency.onKeyDown();
    const standardKeyboardEvent = new StandardKeyboardEvent(e);
    if (standardKeyboardEvent.keyCode === KeyCode.KEY_IN_COMPOSITION) {
      standardKeyboardEvent.stopPropagation();
    }
    this._viewController.emitKeyDown(standardKeyboardEvent);
  }
  _updateDomAttributes() {
    const options = this._context.configuration.options;
    this.domNode.domNode.setAttribute("tabindex", String(options.get(EditorOption.tabIndex)));
  }
  _updateEditContext() {
    const editContextState = this._getNewEditContextState();
    if (!editContextState) {
      return;
    }
    const newText = editContextState.text ?? " ";
    if (newText !== this._previousEditContextText) {
      this._editContext.updateText(0, this._previousEditContextText.length, newText);
      this._previousEditContextText = newText;
    }
    if (editContextState.selectionStartOffset !== this._previousEditContextSelection.start || editContextState.selectionEndOffset !== this._previousEditContextSelection.endExclusive) {
      this._editContext.updateSelection(editContextState.selectionStartOffset, editContextState.selectionEndOffset);
    }
    this._editContextPrimarySelection = editContextState.editContextPrimarySelection;
    this._previousEditContextSelection = new OffsetRange(editContextState.selectionStartOffset, editContextState.selectionEndOffset);
  }
  _emitTypeEvent(viewController, e) {
    if (!this._editContext) {
      return;
    }
    const selectionEndOffset = this._previousEditContextSelection.endExclusive;
    const selectionStartOffset = this._previousEditContextSelection.start;
    this._previousEditContextSelection = new OffsetRange(e.selectionStart, e.selectionEnd);
    let replaceNextCharCnt = 0;
    let replacePrevCharCnt = 0;
    if (e.updateRangeEnd > selectionEndOffset) {
      replaceNextCharCnt = e.updateRangeEnd - selectionEndOffset;
    }
    if (e.updateRangeStart < selectionStartOffset) {
      replacePrevCharCnt = selectionStartOffset - e.updateRangeStart;
    }
    let text = "";
    if (selectionStartOffset < e.updateRangeStart) {
      text += this._editContext.text.substring(selectionStartOffset, e.updateRangeStart);
    }
    text += e.text;
    if (selectionEndOffset > e.updateRangeEnd) {
      text += this._editContext.text.substring(e.updateRangeEnd, selectionEndOffset);
    }
    let positionDelta = 0;
    if (e.selectionStart === e.selectionEnd && selectionStartOffset === selectionEndOffset) {
      positionDelta = e.selectionStart - (e.updateRangeStart + e.text.length);
    }
    const typeInput = {
      text,
      replacePrevCharCnt,
      replaceNextCharCnt,
      positionDelta
    };
    this._onType(viewController, typeInput);
  }
  _onType(viewController, typeInput) {
    if (typeInput.replacePrevCharCnt || typeInput.replaceNextCharCnt || typeInput.positionDelta) {
      viewController.compositionType(typeInput.text, typeInput.replacePrevCharCnt, typeInput.replaceNextCharCnt, typeInput.positionDelta);
    } else {
      viewController.type(typeInput.text);
    }
  }
  _getNewEditContextState() {
    const editContextPrimarySelection = this._primarySelection;
    const model = this._context.viewModel.model;
    if (!model.isValidRange(editContextPrimarySelection)) {
      return;
    }
    const primarySelectionStartLine = editContextPrimarySelection.startLineNumber;
    const primarySelectionEndLine = editContextPrimarySelection.endLineNumber;
    const endColumnOfEndLineNumber = model.getLineMaxColumn(primarySelectionEndLine);
    const rangeOfText = new Range(primarySelectionStartLine, 1, primarySelectionEndLine, endColumnOfEndLineNumber);
    const text = model.getValueInRange(rangeOfText, EndOfLinePreference.TextDefined);
    const selectionStartOffset = editContextPrimarySelection.startColumn - 1;
    const selectionEndOffset = text.length + editContextPrimarySelection.endColumn - endColumnOfEndLineNumber;
    return {
      text,
      selectionStartOffset,
      selectionEndOffset,
      editContextPrimarySelection
    };
  }
  _editContextStartPosition() {
    return new Position(this._editContextPrimarySelection.startLineNumber, 1);
  }
  _handleTextFormatUpdate(e) {
    if (!this._editContext) {
      return;
    }
    const formats = e.getTextFormats();
    const editContextStartPosition = this._editContextStartPosition();
    const decorations = [];
    formats.forEach((f) => {
      const textModel = this._context.viewModel.model;
      const offsetOfEditContextText = textModel.getOffsetAt(editContextStartPosition);
      const startPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeStart);
      const endPositionOfDecoration = textModel.getPositionAt(offsetOfEditContextText + f.rangeEnd);
      const decorationRange = Range.fromPositions(startPositionOfDecoration, endPositionOfDecoration);
      const thickness = f.underlineThickness.toLowerCase();
      let decorationClassName = "edit-context-composition-none" /* NONE */;
      switch (thickness) {
        case "thin":
          decorationClassName = "edit-context-composition-secondary" /* SECONDARY */;
          break;
        case "thick":
          decorationClassName = "edit-context-composition-primary" /* PRIMARY */;
          break;
      }
      decorations.push({
        range: decorationRange,
        options: {
          description: "textFormatDecoration",
          inlineClassName: decorationClassName
        }
      });
    });
    this._decorations = this._context.viewModel.model.deltaDecorations(this._decorations, decorations);
  }
  _updateSelectionAndControlBoundsData(ctx) {
    const viewSelection = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(this._primarySelection);
    if (this._primarySelection.isEmpty()) {
      const linesVisibleRanges = ctx.visibleRangeForPosition(viewSelection.getStartPosition());
      this._linesVisibleRanges = linesVisibleRanges;
    } else {
      this._linesVisibleRanges = null;
    }
  }
  _updateSelectionAndControlBounds() {
    const options = this._context.configuration.options;
    const contentLeft = options.get(EditorOption.layoutInfo).contentLeft;
    const viewSelection = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(this._primarySelection);
    const verticalOffsetStart = this._context.viewLayout.getVerticalOffsetForLineNumber(viewSelection.startLineNumber);
    const verticalOffsetEnd = this._context.viewLayout.getVerticalOffsetAfterLineNumber(viewSelection.endLineNumber);
    const parentBounds = this._parentBounds;
    const top = parentBounds.top + verticalOffsetStart - this._scrollTop;
    const height = verticalOffsetEnd - verticalOffsetStart;
    let left = parentBounds.left + contentLeft - this._scrollLeft;
    let width;
    if (this._primarySelection.isEmpty()) {
      if (this._linesVisibleRanges) {
        left += this._linesVisibleRanges.left;
      }
      width = 0;
    } else {
      width = parentBounds.width - contentLeft;
    }
    const selectionBounds = new DOMRect(left, top, width, height);
    this._editContext.updateSelectionBounds(selectionBounds);
    this._editContext.updateControlBounds(selectionBounds);
  }
  _updateCharacterBounds(e) {
    const options = this._context.configuration.options;
    const typicalHalfWidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
    const contentLeft = options.get(EditorOption.layoutInfo).contentLeft;
    const parentBounds = this._parentBounds;
    const characterBounds = [];
    const offsetTransformer = new PositionOffsetTransformer(this._editContext.text);
    for (let offset = e.rangeStart; offset < e.rangeEnd; offset++) {
      const editContextStartPosition = offsetTransformer.getPosition(offset);
      const textStartLineOffsetWithinEditor = this._editContextPrimarySelection.startLineNumber - 1;
      const characterStartPosition = new Position(textStartLineOffsetWithinEditor + editContextStartPosition.lineNumber, editContextStartPosition.column);
      const characterEndPosition = characterStartPosition.delta(0, 1);
      const characterModelRange = Range.fromPositions(characterStartPosition, characterEndPosition);
      const characterViewRange = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(characterModelRange);
      const characterLinesVisibleRanges = this._visibleRangeProvider.linesVisibleRangesForRange(characterViewRange, true) ?? [];
      const lineNumber = characterViewRange.startLineNumber;
      const characterVerticalOffset = this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber);
      const top = parentBounds.top + characterVerticalOffset - this._scrollTop;
      let left = 0;
      let width = typicalHalfWidthCharacterWidth;
      if (characterLinesVisibleRanges.length > 0) {
        for (const visibleRange of characterLinesVisibleRanges[0].ranges) {
          left = visibleRange.left;
          width = visibleRange.width;
          break;
        }
      }
      const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(lineNumber);
      characterBounds.push(new DOMRect(parentBounds.left + contentLeft + left - this._scrollLeft, top, width, lineHeight));
    }
    this._editContext.updateCharacterBounds(e.rangeStart, characterBounds);
  }
};
NativeEditContext = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILogService)
], NativeEditContext);
export {
  NativeEditContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGNvbnRyb2xsZXJcXGVkaXRDb250ZXh0XFxuYXRpdmVcXG5hdGl2ZUVkaXRDb250ZXh0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL25hdGl2ZUVkaXRDb250ZXh0LmNzcyc7XG5pbXBvcnQgeyBpc0ZpcmVmb3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGdldEFjdGl2ZUVsZW1lbnQsIGdldFdpbmRvdywgZ2V0V2luZG93SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVQcmVmZXJlbmNlLCBJTW9kZWxEZWx0YURlY29yYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQsIFZpZXdDdXJzb3JTdGF0ZUNoYW5nZWRFdmVudCwgVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50LCBWaWV3Rmx1c2hlZEV2ZW50LCBWaWV3TGluZXNDaGFuZ2VkRXZlbnQsIFZpZXdMaW5lc0RlbGV0ZWRFdmVudCwgVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCwgVmlld1Njcm9sbENoYW5nZWRFdmVudCwgVmlld1pvbmVzQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCB7IFJlc3RyaWN0ZWRSZW5kZXJpbmdDb250ZXh0LCBSZW5kZXJpbmdDb250ZXh0LCBIb3Jpem9udGFsUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi92aWV3L3JlbmRlcmluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi92aWV3L3ZpZXdDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENvcHlPcHRpb25zLCBjcmVhdGVDbGlwYm9hcmRDb3B5RXZlbnQsIGNyZWF0ZUNsaXBib2FyZFBhc3RlRXZlbnQgfSBmcm9tICcuLi9jbGlwYm9hcmRVdGlscy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEVkaXRDb250ZXh0IH0gZnJvbSAnLi4vZWRpdENvbnRleHQuanMnO1xuaW1wb3J0IHsgZWRpdENvbnRleHRBZGREaXNwb3NhYmxlTGlzdGVuZXIsIEZvY3VzVHJhY2tlciwgSVR5cGVEYXRhIH0gZnJvbSAnLi9uYXRpdmVFZGl0Q29udGV4dFV0aWxzLmpzJztcbmltcG9ydCB7IFNjcmVlblJlYWRlclN1cHBvcnQgfSBmcm9tICcuL3NjcmVlblJlYWRlclN1cHBvcnQuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJVmlzaWJsZVJhbmdlUHJvdmlkZXIgfSBmcm9tICcuLi90ZXh0QXJlYS90ZXh0QXJlYUVkaXRDb250ZXh0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS90ZXh0L3Bvc2l0aW9uVG9PZmZzZXQuanMnO1xuaW1wb3J0IHsgRWRpdENvbnRleHQgfSBmcm9tICcuL2VkaXRDb250ZXh0RmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBOYXRpdmVFZGl0Q29udGV4dFJlZ2lzdHJ5IH0gZnJvbSAnLi9uYXRpdmVFZGl0Q29udGV4dFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElFZGl0b3JBcmlhT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgaXNIaWdoU3Vycm9nYXRlLCBpc0xvd1N1cnJvZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaW1lLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgaW5wdXRMYXRlbmN5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IFZpZXdwb3J0RGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lc1ZpZXdwb3J0RGF0YS5qcyc7XG5cbi8vIENvcnJlc3BvbmRzIHRvIGNsYXNzZXMgaW4gbmF0aXZlRWRpdENvbnRleHQuY3NzXG5lbnVtIENvbXBvc2l0aW9uQ2xhc3NOYW1lIHtcblx0Tk9ORSA9ICdlZGl0LWNvbnRleHQtY29tcG9zaXRpb24tbm9uZScsXG5cdFNFQ09OREFSWSA9ICdlZGl0LWNvbnRleHQtY29tcG9zaXRpb24tc2Vjb25kYXJ5Jyxcblx0UFJJTUFSWSA9ICdlZGl0LWNvbnRleHQtY29tcG9zaXRpb24tcHJpbWFyeScsXG59XG5cbmludGVyZmFjZSBJVGV4dFVwZGF0ZUV2ZW50IHtcblx0dGV4dDogc3RyaW5nO1xuXHRzZWxlY3Rpb25TdGFydDogbnVtYmVyO1xuXHRzZWxlY3Rpb25FbmQ6IG51bWJlcjtcblx0dXBkYXRlUmFuZ2VTdGFydDogbnVtYmVyO1xuXHR1cGRhdGVSYW5nZUVuZDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgTmF0aXZlRWRpdENvbnRleHQgZXh0ZW5kcyBBYnN0cmFjdEVkaXRDb250ZXh0IHtcblxuXHQvLyBUZXh0IGFyZWEgdXNlZCB0byBoYW5kbGUgcGFzdGUgZXZlbnRzXG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRGl2RWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ltZVRleHRBcmVhOiBGYXN0RG9tTm9kZTxIVE1MVGV4dEFyZWFFbGVtZW50Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdENvbnRleHQ6IEVkaXRDb250ZXh0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY3JlZW5SZWFkZXJTdXBwb3J0OiBTY3JlZW5SZWFkZXJTdXBwb3J0O1xuXHRwcml2YXRlIF9wcmV2aW91c0VkaXRDb250ZXh0U2VsZWN0aW9uOiBPZmZzZXRSYW5nZSA9IG5ldyBPZmZzZXRSYW5nZSgwLCAwKTtcblx0cHJpdmF0ZSBfcHJldmlvdXNFZGl0Q29udGV4dFRleHQ6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIF9lZGl0Q29udGV4dFByaW1hcnlTZWxlY3Rpb246IFNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSk7XG5cblx0Ly8gT3ZlcmZsb3cgZ3VhcmQgY29udGFpbmVyXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3BhcmVudEJvdW5kczogRE9NUmVjdCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9kZWNvcmF0aW9uczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfcHJpbWFyeVNlbGVjdGlvbjogU2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKTtcblxuXG5cdHByaXZhdGUgX3RhcmdldFdpbmRvd0lkOiBudW1iZXIgPSAtMTtcblx0cHJpdmF0ZSBfc2Nyb2xsVG9wOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9zY3JvbGxMZWZ0OiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZvY3VzVHJhY2tlcjogRm9jdXNUcmFja2VyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG93bmVySUQ6IHN0cmluZyxcblx0XHRjb250ZXh0OiBWaWV3Q29udGV4dCxcblx0XHRvdmVyZmxvd0d1YXJkQ29udGFpbmVyOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld0NvbnRyb2xsZXI6IFZpZXdDb250cm9sbGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2libGVSYW5nZVByb3ZpZGVyOiBJVmlzaWJsZVJhbmdlUHJvdmlkZXIsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRleHQpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gbmV3IEZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0Q2xhc3NOYW1lKGBuYXRpdmUtZWRpdC1jb250ZXh0YCk7XG5cdFx0dGhpcy5faW1lVGV4dEFyZWEgPSBuZXcgRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGV4dGFyZWEnKSk7XG5cdFx0dGhpcy5faW1lVGV4dEFyZWEuc2V0Q2xhc3NOYW1lKGBpbWUtdGV4dC1hcmVhYCk7XG5cdFx0dGhpcy5faW1lVGV4dEFyZWEuc2V0QXR0cmlidXRlKCdyZWFkb25seScsICd0cnVlJyk7XG5cdFx0dGhpcy5faW1lVGV4dEFyZWEuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICctMScpO1xuXHRcdHRoaXMuX2ltZVRleHRBcmVhLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2F1dG9jb3JyZWN0JywgJ29mZicpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2F1dG9jYXBpdGFsaXplJywgJ29mZicpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2F1dG9jb21wbGV0ZScsICdvZmYnKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdzcGVsbGNoZWNrJywgJ2ZhbHNlJyk7XG5cblx0XHR0aGlzLl91cGRhdGVEb21BdHRyaWJ1dGVzKCk7XG5cblx0XHRvdmVyZmxvd0d1YXJkQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZG9tTm9kZSk7XG5cdFx0b3ZlcmZsb3dHdWFyZENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9pbWVUZXh0QXJlYSk7XG5cdFx0dGhpcy5fcGFyZW50ID0gb3ZlcmZsb3dHdWFyZENvbnRhaW5lci5kb21Ob2RlO1xuXG5cdFx0dGhpcy5fZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEZvY3VzVHJhY2tlcihsb2dTZXJ2aWNlLCB0aGlzLmRvbU5vZGUuZG9tTm9kZSwgKG5ld0ZvY3VzVmFsdWU6IGJvb2xlYW4pID0+IHtcblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoJ05hdGl2ZUVkaXRDb250ZXh0I2hhbmRsZUZvY3VzQ2hhbmdlIDogJywgbmV3Rm9jdXNWYWx1ZSk7XG5cdFx0XHR0aGlzLl9zY3JlZW5SZWFkZXJTdXBwb3J0LmhhbmRsZUZvY3VzQ2hhbmdlKG5ld0ZvY3VzVmFsdWUpO1xuXHRcdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwuc2V0SGFzRm9jdXMobmV3Rm9jdXNWYWx1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgd2luZG93ID0gZ2V0V2luZG93KHRoaXMuZG9tTm9kZS5kb21Ob2RlKTtcblx0XHR0aGlzLl9lZGl0Q29udGV4dCA9IEVkaXRDb250ZXh0LmNyZWF0ZSh3aW5kb3cpO1xuXHRcdHRoaXMuc2V0RWRpdENvbnRleHRPbkRvbU5vZGUoKTtcblxuXHRcdHRoaXMuX3NjcmVlblJlYWRlclN1cHBvcnQgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTY3JlZW5SZWFkZXJTdXBwb3J0LCB0aGlzLmRvbU5vZGUsIGNvbnRleHQsIHRoaXMuX3ZpZXdDb250cm9sbGVyKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLmRvbU5vZGUsICdjb3B5JywgKGUpID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnTmF0aXZlRWRpdENvbnRleHQjY29weScpO1xuXG5cdFx0XHQvLyAhISEhIVxuXHRcdFx0Ly8gVGhpcyBpcyBhIHdvcmthcm91bmQgZm9yIHdoYXQgd2UgdGhpbmsgaXMgYW4gRWxlY3Ryb24gYnVnIHdoZXJlXG5cdFx0XHQvLyBleGVjQ29tbWFuZCgnY29weScpIGRvZXMgbm90IGFsd2F5cyB3b3JrIChpdCBkb2VzIG5vdCBmaXJlIGEgY2xpcGJvYXJkIGV2ZW50KVxuXHRcdFx0Ly8gISEhISFcblx0XHRcdC8vIFdlIHNpZ25hbCB0aGF0IHdlIGhhdmUgZXhlY3V0ZWQgYSBjb3B5IGNvbW1hbmRcblx0XHRcdENvcHlPcHRpb25zLmVsZWN0cm9uQnVnV29ya2Fyb3VuZENvcHlFdmVudEhhc0ZpcmVkID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3QgY29weUV2ZW50ID0gY3JlYXRlQ2xpcGJvYXJkQ29weUV2ZW50KGUsIC8qIGlzQ3V0ICovIGZhbHNlLCB0aGlzLl9jb250ZXh0LCB0aGlzLmxvZ1NlcnZpY2UsIGlzRmlyZWZveCk7XG5cdFx0XHR0aGlzLl9vbldpbGxDb3B5LmZpcmUoY29weUV2ZW50KTtcblx0XHRcdGlmIChjb3B5RXZlbnQuaXNIYW5kbGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvcHlFdmVudC5lbnN1cmVDbGlwYm9hcmRHZXRzRWRpdG9yRGF0YSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLmRvbU5vZGUsICdjdXQnLCAoZSkgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdOYXRpdmVFZGl0Q29udGV4dCNjdXQnKTtcblx0XHRcdGNvbnN0IGN1dEV2ZW50ID0gY3JlYXRlQ2xpcGJvYXJkQ29weUV2ZW50KGUsIC8qIGlzQ3V0ICovIHRydWUsIHRoaXMuX2NvbnRleHQsIHRoaXMubG9nU2VydmljZSwgaXNGaXJlZm94KTtcblx0XHRcdHRoaXMuX29uV2lsbEN1dC5maXJlKGN1dEV2ZW50KTtcblx0XHRcdGlmIChjdXRFdmVudC5pc0hhbmRsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUHJldGVuZCBoZXJlIHdlIHRvdWNoZWQgdGhlIHRleHQgYXJlYSwgYXMgdGhlIGBjdXRgIGV2ZW50IHdpbGwgbW9zdCBsaWtlbHlcblx0XHRcdC8vIHJlc3VsdCBpbiBhIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50IHdoaWNoIHdlIHdhbnQgdG8gaWdub3JlXG5cdFx0XHR0aGlzLl9zY3JlZW5SZWFkZXJTdXBwb3J0Lm9uV2lsbEN1dCgpO1xuXHRcdFx0Y3V0RXZlbnQuZW5zdXJlQ2xpcGJvYXJkR2V0c0VkaXRvckRhdGEoKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnTmF0aXZlRWRpdENvbnRleHQjY3V0IChiZWZvcmUgdmlld0NvbnRyb2xsZXIuY3V0KScpO1xuXHRcdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuY3V0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUuZG9tTm9kZSwgJ3NlbGVjdGlvbmNoYW5nZScsICgpID0+IHtcblx0XHRcdGlucHV0TGF0ZW5jeS5vblNlbGVjdGlvbkNoYW5nZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUuZG9tTm9kZSwgJ2tleXVwJywgKGUpID0+IHRoaXMuX29uS2V5VXAoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLmRvbU5vZGUsICdrZXlkb3duJywgYXN5bmMgKGUpID0+IHRoaXMuX29uS2V5RG93bihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9pbWVUZXh0QXJlYS5kb21Ob2RlLCAna2V5dXAnLCAoZSkgPT4gdGhpcy5fb25LZXlVcChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9pbWVUZXh0QXJlYS5kb21Ob2RlLCAna2V5ZG93bicsIGFzeW5jIChlKSA9PiB0aGlzLl9vbktleURvd24oZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLmRvbU5vZGUsICdiZWZvcmVpbnB1dCcsIGFzeW5jIChlKSA9PiB7XG5cdFx0XHRpbnB1dExhdGVuY3kub25CZWZvcmVJbnB1dCgpO1xuXHRcdFx0aWYgKGUuaW5wdXRUeXBlID09PSAnaW5zZXJ0UGFyYWdyYXBoJyB8fCBlLmlucHV0VHlwZSA9PT0gJ2luc2VydExpbmVCcmVhaycpIHtcblx0XHRcdFx0dGhpcy5fb25UeXBlKHRoaXMuX3ZpZXdDb250cm9sbGVyLCB7IHRleHQ6ICdcXG4nLCByZXBsYWNlUHJldkNoYXJDbnQ6IDAsIHJlcGxhY2VOZXh0Q2hhckNudDogMCwgcG9zaXRpb25EZWx0YTogMCB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZS5kb21Ob2RlLCAncGFzdGUnLCAoZSkgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdOYXRpdmVFZGl0Q29udGV4dCNwYXN0ZScpO1xuXHRcdFx0Y29uc3QgcGFzdGVFdmVudCA9IGNyZWF0ZUNsaXBib2FyZFBhc3RlRXZlbnQoZSk7XG5cdFx0XHR0aGlzLl9vbldpbGxQYXN0ZS5maXJlKHBhc3RlRXZlbnQpO1xuXHRcdFx0aWYgKHBhc3RlRXZlbnQuaXNIYW5kbGVkKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0aWYgKCFlLmNsaXBib2FyZERhdGEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdOYXRpdmVFZGl0Q29udGV4dCNwYXN0ZSB3aXRoIGlkIDogJywgcGFzdGVFdmVudC5tZXRhZGF0YT8uaWQsICcgd2l0aCB0ZXh0Lmxlbmd0aDogJywgcGFzdGVFdmVudC50ZXh0Lmxlbmd0aCk7XG5cdFx0XHRpZiAoIXBhc3RlRXZlbnQudGV4dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgcGFzdGVPbk5ld0xpbmUgPSBmYWxzZTtcblx0XHRcdGxldCBtdWx0aWN1cnNvclRleHQ6IHN0cmluZ1tdIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRsZXQgbW9kZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRpZiAocGFzdGVFdmVudC5tZXRhZGF0YSkge1xuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0XHRcdGNvbnN0IGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkKTtcblx0XHRcdFx0cGFzdGVPbk5ld0xpbmUgPSBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCAmJiAhIXBhc3RlRXZlbnQubWV0YWRhdGEuaXNGcm9tRW1wdHlTZWxlY3Rpb247XG5cdFx0XHRcdG11bHRpY3Vyc29yVGV4dCA9IHR5cGVvZiBwYXN0ZUV2ZW50Lm1ldGFkYXRhLm11bHRpY3Vyc29yVGV4dCAhPT0gJ3VuZGVmaW5lZCcgPyBwYXN0ZUV2ZW50Lm1ldGFkYXRhLm11bHRpY3Vyc29yVGV4dCA6IG51bGw7XG5cdFx0XHRcdG1vZGUgPSBwYXN0ZUV2ZW50Lm1ldGFkYXRhLm1vZGU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ05hdGl2ZUVkaXRDb250ZXh0I3Bhc3RlIChiZWZvcmUgdmlld0NvbnRyb2xsZXIucGFzdGUpJyk7XG5cdFx0XHR0aGlzLl92aWV3Q29udHJvbGxlci5wYXN0ZShwYXN0ZUV2ZW50LnRleHQsIHBhc3RlT25OZXdMaW5lLCBtdWx0aWN1cnNvclRleHQsIG1vZGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEVkaXQgY29udGV4dCBldmVudHNcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0Q29udGV4dEFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lZGl0Q29udGV4dCwgJ3RleHRmb3JtYXR1cGRhdGUnLCAoZSkgPT4gdGhpcy5faGFuZGxlVGV4dEZvcm1hdFVwZGF0ZShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRDb250ZXh0QWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VkaXRDb250ZXh0LCAnY2hhcmFjdGVyYm91bmRzdXBkYXRlJywgKGUpID0+IHRoaXMuX3VwZGF0ZUNoYXJhY3RlckJvdW5kcyhlKSkpO1xuXHRcdGxldCBoaWdoU3Vycm9nYXRlQ2hhcmFjdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdENvbnRleHRBZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWRpdENvbnRleHQsICd0ZXh0dXBkYXRlJywgKGUpID0+IHtcblx0XHRcdGlucHV0TGF0ZW5jeS5vbklucHV0KCk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gZS50ZXh0O1xuXHRcdFx0aWYgKHRleHQubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXJDb2RlID0gdGV4dC5jaGFyQ29kZUF0KDApO1xuXHRcdFx0XHRpZiAoaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlKSkge1xuXHRcdFx0XHRcdGhpZ2hTdXJyb2dhdGVDaGFyYWN0ZXIgPSB0ZXh0O1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXNMb3dTdXJyb2dhdGUoY2hhckNvZGUpICYmIGhpZ2hTdXJyb2dhdGVDaGFyYWN0ZXIpIHtcblx0XHRcdFx0XHRjb25zdCB0ZXh0VXBkYXRlRXZlbnQ6IElUZXh0VXBkYXRlRXZlbnQgPSB7XG5cdFx0XHRcdFx0XHR0ZXh0OiBoaWdoU3Vycm9nYXRlQ2hhcmFjdGVyICsgdGV4dCxcblx0XHRcdFx0XHRcdHNlbGVjdGlvbkVuZDogZS5zZWxlY3Rpb25FbmQsXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25TdGFydDogZS5zZWxlY3Rpb25TdGFydCxcblx0XHRcdFx0XHRcdHVwZGF0ZVJhbmdlU3RhcnQ6IGUudXBkYXRlUmFuZ2VTdGFydCAtIDEsXG5cdFx0XHRcdFx0XHR1cGRhdGVSYW5nZUVuZDogZS51cGRhdGVSYW5nZUVuZCAtIDFcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGhpZ2hTdXJyb2dhdGVDaGFyYWN0ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fZW1pdFR5cGVFdmVudCh0aGlzLl92aWV3Q29udHJvbGxlciwgdGV4dFVwZGF0ZUV2ZW50KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2VtaXRUeXBlRXZlbnQodGhpcy5fdmlld0NvbnRyb2xsZXIsIGUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0Q29udGV4dEFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lZGl0Q29udGV4dCwgJ2NvbXBvc2l0aW9uc3RhcnQnLCAoZSkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlRWRpdENvbnRleHQoKTtcblx0XHRcdC8vIFV0bGltYXRlbHkgZmlyZXMgb25EaWRDb21wb3NpdGlvblN0YXJ0KCkgb24gdGhlIGVkaXRvciB0byBub3RpZnkgZm9yIGV4YW1wbGUgc3VnZ2VzdCBtb2RlbCBvZiBjb21wb3NpdGlvbiBzdGF0ZVxuXHRcdFx0Ly8gVXBkYXRlcyB0aGUgY29tcG9zaXRpb24gc3RhdGUgb2YgdGhlIGN1cnNvciBjb250cm9sbGVyIHdoaWNoIGRldGVybWluZXMgYmVoYXZpb3Igb2YgdHlwaW5nIHdpdGggaW50ZXJjZXB0b3JzXG5cdFx0XHR0aGlzLl92aWV3Q29udHJvbGxlci5jb21wb3NpdGlvblN0YXJ0KCk7XG5cdFx0XHQvLyBFbWl0cyBWaWV3Q29tcG9zaXRpb25TdGFydEV2ZW50IHdoaWNoIGNhbiBiZSBkZXBlbmRlZCBvbiBieSBWaWV3RXZlbnRIYW5kbGVyc1xuXHRcdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwub25Db21wb3NpdGlvblN0YXJ0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRDb250ZXh0QWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VkaXRDb250ZXh0LCAnY29tcG9zaXRpb25lbmQnLCAoZSkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlRWRpdENvbnRleHQoKTtcblx0XHRcdC8vIFV0bGltYXRlbHkgZmlyZXMgY29tcG9zaXRpb25FbmQoKSBvbiB0aGUgZWRpdG9yIHRvIG5vdGlmeSBmb3IgZXhhbXBsZSBzdWdnZXN0IG1vZGVsIG9mIGNvbXBvc2l0aW9uIHN0YXRlXG5cdFx0XHQvLyBVcGRhdGVzIHRoZSBjb21wb3NpdGlvbiBzdGF0ZSBvZiB0aGUgY3Vyc29yIGNvbnRyb2xsZXIgd2hpY2ggZGV0ZXJtaW5lcyBiZWhhdmlvciBvZiB0eXBpbmcgd2l0aCBpbnRlcmNlcHRvcnNcblx0XHRcdHRoaXMuX3ZpZXdDb250cm9sbGVyLmNvbXBvc2l0aW9uRW5kKCk7XG5cdFx0XHQvLyBFbWl0cyBWaWV3Q29tcG9zaXRpb25FbmRFdmVudCB3aGljaCBjYW4gYmUgZGVwZW5kZWQgb24gYnkgVmlld0V2ZW50SGFuZGxlcnNcblx0XHRcdHRoaXMuX2NvbnRleHQudmlld01vZGVsLm9uQ29tcG9zaXRpb25FbmQoKTtcblx0XHR9KSk7XG5cdFx0bGV0IHJlZW5hYmxlVHJhY2tpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHR0aGlzLl9yZWdpc3RlcihJTUUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKElNRS5lbmFibGVkICYmIHJlZW5hYmxlVHJhY2tpbmcpIHtcblx0XHRcdFx0dGhpcy5fZm9jdXNUcmFja2VyLnJlc3VtZSgpO1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUuZm9jdXMoKTtcblx0XHRcdFx0cmVlbmFibGVUcmFja2luZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFJTUUuZW5hYmxlZCAmJiB0aGlzLmlzRm9jdXNlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX2ZvY3VzVHJhY2tlci5wYXVzZSgpO1xuXHRcdFx0XHR0aGlzLl9pbWVUZXh0QXJlYS5mb2N1cygpO1xuXHRcdFx0XHRyZWVuYWJsZVRyYWNraW5nID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTmF0aXZlRWRpdENvbnRleHRSZWdpc3RyeS5yZWdpc3Rlcihvd25lcklELCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGV4dC52aWV3TW9kZWwubW9kZWwub25EaWRDaGFuZ2VDb250ZW50KChlKSA9PiB7XG5cdFx0XHRsZXQgZG9DaGFuZ2UgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGUuY2hhbmdlcykge1xuXHRcdFx0XHRpZiAoY2hhbmdlLnJhbmdlLnN0YXJ0TGluZU51bWJlciA8PSB0aGlzLl9lZGl0Q29udGV4dFByaW1hcnlTZWxlY3Rpb24uZW5kTGluZU51bWJlclxuXHRcdFx0XHRcdCYmIGNoYW5nZS5yYW5nZS5lbmRMaW5lTnVtYmVyID49IHRoaXMuX2VkaXRDb250ZXh0UHJpbWFyeVNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRkb0NoYW5nZSA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChkb0NoYW5nZSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVFZGl0Q29udGV4dCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBQdWJsaWMgbWV0aG9kcyAtLS1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBGb3JjZSBibHVlIHRoZSBkb20gbm9kZSBzbyBjYW4gd3JpdGUgaW4gcGFuZSB3aXRoIG5vIG5hdGl2ZSBlZGl0IGNvbnRleHQgYWZ0ZXIgZGlzcG9zYWxcblx0XHR0aGlzLmRvbU5vZGUuZG9tTm9kZS5lZGl0Q29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmRvbU5vZGUuZG9tTm9kZS5ibHVyKCk7XG5cdFx0dGhpcy5kb21Ob2RlLmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0dGhpcy5faW1lVGV4dEFyZWEuZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0QXJpYU9wdGlvbnMob3B0aW9uczogSUVkaXRvckFyaWFPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fc2NyZWVuUmVhZGVyU3VwcG9ydC5zZXRBcmlhT3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdC8qIExhc3QgcmVuZGVyZWQgZGF0YSBuZWVkZWQgZm9yIGNvcnJlY3QgaGl0LXRlc3RpbmcgYW5kIGRldGVybWluaW5nIHRoZSBtb3VzZSBwb3NpdGlvbi5cblx0ICogV2l0aG91dCB0aGlzLCB0aGUgc2VsZWN0aW9uIHdpbGwgYmxpbmsgYXMgaW5jb3JyZWN0IG1vdXNlIHBvc2l0aW9uIGlzIGNhbGN1bGF0ZWQgKi9cblx0cHVibGljIGdldExhc3RSZW5kZXJEYXRhKCk6IFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByaW1hcnlTZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkJlZm9yZVJlbmRlcih2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IHZvaWQge1xuXHRcdC8vIFdlIG5lZWQgdG8gcmVhZCB0aGUgcG9zaXRpb24gb2YgdGhlIGNvbnRhaW5lciBkb20gbm9kZVxuXHRcdC8vIEl0IGlzIGJlc3QgdG8gZG8gdGhpcyBiZWZvcmUgd2UgYmVnaW4gdG91Y2hpbmcgdGhlIERPTSBhdCBhbGxcblx0XHQvLyBCZWNhdXNlIHRoZSBzeW5jIGxheW91dCB3aWxsIGJlIGZhc3QgaWYgd2UgZG8gaXQgaGVyZVxuXHRcdHRoaXMuX3BhcmVudEJvdW5kcyA9IHRoaXMuX3BhcmVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBwcmVwYXJlUmVuZGVyKGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdHRoaXMuX3NjcmVlblJlYWRlclN1cHBvcnQucHJlcGFyZVJlbmRlcihjdHgpO1xuXHRcdHRoaXMuX3VwZGF0ZVNlbGVjdGlvbkFuZENvbnRyb2xCb3VuZHNEYXRhKGN0eCk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKGN0eDogUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JlZW5SZWFkZXJTdXBwb3J0LnJlbmRlcihjdHgpO1xuXHRcdHRoaXMuX3VwZGF0ZVNlbGVjdGlvbkFuZENvbnRyb2xCb3VuZHMoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkN1cnNvclN0YXRlQ2hhbmdlZChlOiBWaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9wcmltYXJ5U2VsZWN0aW9uID0gZS5tb2RlbFNlbGVjdGlvbnNbMF0gPz8gbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKTtcblx0XHR0aGlzLl9zY3JlZW5SZWFkZXJTdXBwb3J0Lm9uQ3Vyc29yU3RhdGVDaGFuZ2VkKGUpO1xuXHRcdHRoaXMuX3VwZGF0ZUVkaXRDb250ZXh0KCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiBWaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX3NjcmVlblJlYWRlclN1cHBvcnQub25Db25maWd1cmF0aW9uQ2hhbmdlZChlKTtcblx0XHR0aGlzLl91cGRhdGVEb21BdHRyaWJ1dGVzKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25EZWNvcmF0aW9uc0NoYW5nZWQoZTogVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gdHJ1ZSBmb3IgaW5saW5lIGRlY29yYXRpb25zIHRoYXQgY2FuIGVuZCB1cCByZWxheW91dGluZyB0ZXh0XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgb25GbHVzaGVkKGU6IFZpZXdGbHVzaGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzQ2hhbmdlZChlOiBWaWV3TGluZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzRGVsZXRlZChlOiBWaWV3TGluZXNEZWxldGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzSW5zZXJ0ZWQoZTogVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIG9uU2Nyb2xsQ2hhbmdlZChlOiBWaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fc2Nyb2xsTGVmdCA9IGUuc2Nyb2xsTGVmdDtcblx0XHR0aGlzLl9zY3JvbGxUb3AgPSBlLnNjcm9sbFRvcDtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvblpvbmVzQ2hhbmdlZChlOiBWaWV3Wm9uZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVXaWxsUGFzdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdOYXRpdmVFZGl0Q29udGV4dCNoYW5kbGVXaWxsUGFzdGUnKTtcblx0XHR0aGlzLl9wcmVwYXJlU2NyZWVuUmVhZGVyRm9yUGFzdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3ByZXBhcmVTY3JlZW5SZWFkZXJGb3JQYXN0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JlZW5SZWFkZXJTdXBwb3J0Lm9uV2lsbFBhc3RlKCk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlV2lsbENvcHkoKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdOYXRpdmVFZGl0Q29udGV4dCNoYW5kbGVXaWxsQ29weScpO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnTmF0aXZlRWRpdENvbnRleHQjaXNGb2N1c2VkIDogJywgdGhpcy5kb21Ob2RlLmRvbU5vZGUgPT09IGdldEFjdGl2ZUVsZW1lbnQoKSk7XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVTY3JlZW5SZWFkZXJDb250ZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX3NjcmVlblJlYWRlclN1cHBvcnQud3JpdGVTY3JlZW5SZWFkZXJDb250ZW50KCk7XG5cdH1cblxuXHRwdWJsaWMgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9mb2N1c1RyYWNrZXIuaXNGb2N1c2VkO1xuXHR9XG5cblx0cHVibGljIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvY3VzVHJhY2tlci5mb2N1cygpO1xuXG5cdFx0Ly8gSWYgdGhlIGVkaXRvciBpcyBvZmYgRE9NLCBmb2N1cyBjYW5ub3QgYmUgcmVhbGx5IHNldCwgc28gbGV0J3MgZG91YmxlIGNoZWNrIHRoYXQgd2UgaGF2ZSBtYW5hZ2VkIHRvIHNldCB0aGUgZm9jdXNcblx0XHR0aGlzLnJlZnJlc2hGb2N1c1N0YXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgcmVmcmVzaEZvY3VzU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZm9jdXNUcmFja2VyLnJlZnJlc2hGb2N1c1N0YXRlKCk7XG5cdH1cblxuXHQvLyBUT0RPOiBhZGRlZCBhcyBhIHdvcmthcm91bmQgZml4IGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjI5ODI1XG5cdC8vIFdoZW4gdGhpcyBpc3N1ZSB3aWxsIGJlIGZpeGVkIHRoZSBmb2xsb3dpbmcgc2hvdWxkIGJlIHJlbW92ZWQuXG5cdHB1YmxpYyBzZXRFZGl0Q29udGV4dE9uRG9tTm9kZSgpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3codGhpcy5kb21Ob2RlLmRvbU5vZGUpO1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvd0lkID0gZ2V0V2luZG93SWQodGFyZ2V0V2luZG93KTtcblx0XHRpZiAodGhpcy5fdGFyZ2V0V2luZG93SWQgIT09IHRhcmdldFdpbmRvd0lkKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuZG9tTm9kZS5lZGl0Q29udGV4dCA9IHRoaXMuX2VkaXRDb250ZXh0O1xuXHRcdFx0dGhpcy5fdGFyZ2V0V2luZG93SWQgPSB0YXJnZXRXaW5kb3dJZDtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gUHJpdmF0ZSBtZXRob2RzIC0tLVxuXG5cdHByaXZhdGUgX29uS2V5VXAoZTogS2V5Ym9hcmRFdmVudCkge1xuXHRcdGlucHV0TGF0ZW5jeS5vbktleVVwKCk7XG5cdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuZW1pdEtleVVwKG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25LZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpIHtcblx0XHRpbnB1dExhdGVuY3kub25LZXlEb3duKCk7XG5cdFx0Y29uc3Qgc3RhbmRhcmRLZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHQvLyBXaGVuIHRoZSBJTUUgaXMgdmlzaWJsZSwgdGhlIGtleXMsIGxpa2UgYXJyb3ctbGVmdCBhbmQgYXJyb3ctcmlnaHQsIHNob3VsZCBiZSB1c2VkIHRvIG5hdmlnYXRlIGluIHRoZSBJTUUsIGFuZCBzaG91bGQgbm90IGJlIHByb3BhZ2F0ZWQgZnVydGhlclxuXHRcdGlmIChzdGFuZGFyZEtleWJvYXJkRXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5LRVlfSU5fQ09NUE9TSVRJT04pIHtcblx0XHRcdHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9XG5cdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuZW1pdEtleURvd24oc3RhbmRhcmRLZXlib2FyZEV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURvbUF0dHJpYnV0ZXMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdHRoaXMuZG9tTm9kZS5kb21Ob2RlLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCBTdHJpbmcob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnRhYkluZGV4KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRWRpdENvbnRleHQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdENvbnRleHRTdGF0ZSA9IHRoaXMuX2dldE5ld0VkaXRDb250ZXh0U3RhdGUoKTtcblx0XHRpZiAoIWVkaXRDb250ZXh0U3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV3VGV4dCA9IGVkaXRDb250ZXh0U3RhdGUudGV4dCA/PyAnICc7XG5cdFx0aWYgKG5ld1RleHQgIT09IHRoaXMuX3ByZXZpb3VzRWRpdENvbnRleHRUZXh0KSB7XG5cdFx0XHR0aGlzLl9lZGl0Q29udGV4dC51cGRhdGVUZXh0KDAsIHRoaXMuX3ByZXZpb3VzRWRpdENvbnRleHRUZXh0Lmxlbmd0aCwgbmV3VGV4dCk7XG5cdFx0XHR0aGlzLl9wcmV2aW91c0VkaXRDb250ZXh0VGV4dCA9IG5ld1RleHQ7XG5cdFx0fVxuXHRcdGlmIChlZGl0Q29udGV4dFN0YXRlLnNlbGVjdGlvblN0YXJ0T2Zmc2V0ICE9PSB0aGlzLl9wcmV2aW91c0VkaXRDb250ZXh0U2VsZWN0aW9uLnN0YXJ0IHx8XG5cdFx0XHRlZGl0Q29udGV4dFN0YXRlLnNlbGVjdGlvbkVuZE9mZnNldCAhPT0gdGhpcy5fcHJldmlvdXNFZGl0Q29udGV4dFNlbGVjdGlvbi5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdHRoaXMuX2VkaXRDb250ZXh0LnVwZGF0ZVNlbGVjdGlvbihlZGl0Q29udGV4dFN0YXRlLnNlbGVjdGlvblN0YXJ0T2Zmc2V0LCBlZGl0Q29udGV4dFN0YXRlLnNlbGVjdGlvbkVuZE9mZnNldCk7XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRDb250ZXh0UHJpbWFyeVNlbGVjdGlvbiA9IGVkaXRDb250ZXh0U3RhdGUuZWRpdENvbnRleHRQcmltYXJ5U2VsZWN0aW9uO1xuXHRcdHRoaXMuX3ByZXZpb3VzRWRpdENvbnRleHRTZWxlY3Rpb24gPSBuZXcgT2Zmc2V0UmFuZ2UoZWRpdENvbnRleHRTdGF0ZS5zZWxlY3Rpb25TdGFydE9mZnNldCwgZWRpdENvbnRleHRTdGF0ZS5zZWxlY3Rpb25FbmRPZmZzZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW1pdFR5cGVFdmVudCh2aWV3Q29udHJvbGxlcjogVmlld0NvbnRyb2xsZXIsIGU6IElUZXh0VXBkYXRlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRDb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdGlvbkVuZE9mZnNldCA9IHRoaXMuX3ByZXZpb3VzRWRpdENvbnRleHRTZWxlY3Rpb24uZW5kRXhjbHVzaXZlO1xuXHRcdGNvbnN0IHNlbGVjdGlvblN0YXJ0T2Zmc2V0ID0gdGhpcy5fcHJldmlvdXNFZGl0Q29udGV4dFNlbGVjdGlvbi5zdGFydDtcblx0XHR0aGlzLl9wcmV2aW91c0VkaXRDb250ZXh0U2VsZWN0aW9uID0gbmV3IE9mZnNldFJhbmdlKGUuc2VsZWN0aW9uU3RhcnQsIGUuc2VsZWN0aW9uRW5kKTtcblxuXHRcdGxldCByZXBsYWNlTmV4dENoYXJDbnQgPSAwO1xuXHRcdGxldCByZXBsYWNlUHJldkNoYXJDbnQgPSAwO1xuXHRcdGlmIChlLnVwZGF0ZVJhbmdlRW5kID4gc2VsZWN0aW9uRW5kT2Zmc2V0KSB7XG5cdFx0XHRyZXBsYWNlTmV4dENoYXJDbnQgPSBlLnVwZGF0ZVJhbmdlRW5kIC0gc2VsZWN0aW9uRW5kT2Zmc2V0O1xuXHRcdH1cblx0XHRpZiAoZS51cGRhdGVSYW5nZVN0YXJ0IDwgc2VsZWN0aW9uU3RhcnRPZmZzZXQpIHtcblx0XHRcdHJlcGxhY2VQcmV2Q2hhckNudCA9IHNlbGVjdGlvblN0YXJ0T2Zmc2V0IC0gZS51cGRhdGVSYW5nZVN0YXJ0O1xuXHRcdH1cblx0XHRsZXQgdGV4dCA9ICcnO1xuXHRcdGlmIChzZWxlY3Rpb25TdGFydE9mZnNldCA8IGUudXBkYXRlUmFuZ2VTdGFydCkge1xuXHRcdFx0dGV4dCArPSB0aGlzLl9lZGl0Q29udGV4dC50ZXh0LnN1YnN0cmluZyhzZWxlY3Rpb25TdGFydE9mZnNldCwgZS51cGRhdGVSYW5nZVN0YXJ0KTtcblx0XHR9XG5cdFx0dGV4dCArPSBlLnRleHQ7XG5cdFx0aWYgKHNlbGVjdGlvbkVuZE9mZnNldCA+IGUudXBkYXRlUmFuZ2VFbmQpIHtcblx0XHRcdHRleHQgKz0gdGhpcy5fZWRpdENvbnRleHQudGV4dC5zdWJzdHJpbmcoZS51cGRhdGVSYW5nZUVuZCwgc2VsZWN0aW9uRW5kT2Zmc2V0KTtcblx0XHR9XG5cdFx0bGV0IHBvc2l0aW9uRGVsdGEgPSAwO1xuXHRcdGlmIChlLnNlbGVjdGlvblN0YXJ0ID09PSBlLnNlbGVjdGlvbkVuZCAmJiBzZWxlY3Rpb25TdGFydE9mZnNldCA9PT0gc2VsZWN0aW9uRW5kT2Zmc2V0KSB7XG5cdFx0XHRwb3NpdGlvbkRlbHRhID0gZS5zZWxlY3Rpb25TdGFydCAtIChlLnVwZGF0ZVJhbmdlU3RhcnQgKyBlLnRleHQubGVuZ3RoKTtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZUlucHV0OiBJVHlwZURhdGEgPSB7XG5cdFx0XHR0ZXh0LFxuXHRcdFx0cmVwbGFjZVByZXZDaGFyQ250LFxuXHRcdFx0cmVwbGFjZU5leHRDaGFyQ250LFxuXHRcdFx0cG9zaXRpb25EZWx0YVxuXHRcdH07XG5cdFx0dGhpcy5fb25UeXBlKHZpZXdDb250cm9sbGVyLCB0eXBlSW5wdXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25UeXBlKHZpZXdDb250cm9sbGVyOiBWaWV3Q29udHJvbGxlciwgdHlwZUlucHV0OiBJVHlwZURhdGEpOiB2b2lkIHtcblx0XHRpZiAodHlwZUlucHV0LnJlcGxhY2VQcmV2Q2hhckNudCB8fCB0eXBlSW5wdXQucmVwbGFjZU5leHRDaGFyQ250IHx8IHR5cGVJbnB1dC5wb3NpdGlvbkRlbHRhKSB7XG5cdFx0XHR2aWV3Q29udHJvbGxlci5jb21wb3NpdGlvblR5cGUodHlwZUlucHV0LnRleHQsIHR5cGVJbnB1dC5yZXBsYWNlUHJldkNoYXJDbnQsIHR5cGVJbnB1dC5yZXBsYWNlTmV4dENoYXJDbnQsIHR5cGVJbnB1dC5wb3NpdGlvbkRlbHRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmlld0NvbnRyb2xsZXIudHlwZSh0eXBlSW5wdXQudGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TmV3RWRpdENvbnRleHRTdGF0ZSgpOiB7IHRleHQ6IHN0cmluZzsgc2VsZWN0aW9uU3RhcnRPZmZzZXQ6IG51bWJlcjsgc2VsZWN0aW9uRW5kT2Zmc2V0OiBudW1iZXI7IGVkaXRDb250ZXh0UHJpbWFyeVNlbGVjdGlvbjogU2VsZWN0aW9uIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVkaXRDb250ZXh0UHJpbWFyeVNlbGVjdGlvbiA9IHRoaXMuX3ByaW1hcnlTZWxlY3Rpb247XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5tb2RlbDtcblx0XHRpZiAoIW1vZGVsLmlzVmFsaWRSYW5nZShlZGl0Q29udGV4dFByaW1hcnlTZWxlY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByaW1hcnlTZWxlY3Rpb25TdGFydExpbmUgPSBlZGl0Q29udGV4dFByaW1hcnlTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHByaW1hcnlTZWxlY3Rpb25FbmRMaW5lID0gZWRpdENvbnRleHRQcmltYXJ5U2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgZW5kQ29sdW1uT2ZFbmRMaW5lTnVtYmVyID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihwcmltYXJ5U2VsZWN0aW9uRW5kTGluZSk7XG5cdFx0Y29uc3QgcmFuZ2VPZlRleHQgPSBuZXcgUmFuZ2UocHJpbWFyeVNlbGVjdGlvblN0YXJ0TGluZSwgMSwgcHJpbWFyeVNlbGVjdGlvbkVuZExpbmUsIGVuZENvbHVtbk9mRW5kTGluZU51bWJlcik7XG5cdFx0Y29uc3QgdGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShyYW5nZU9mVGV4dCwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uU3RhcnRPZmZzZXQgPSBlZGl0Q29udGV4dFByaW1hcnlTZWxlY3Rpb24uc3RhcnRDb2x1bW4gLSAxO1xuXHRcdGNvbnN0IHNlbGVjdGlvbkVuZE9mZnNldCA9IHRleHQubGVuZ3RoICsgZWRpdENvbnRleHRQcmltYXJ5U2VsZWN0aW9uLmVuZENvbHVtbiAtIGVuZENvbHVtbk9mRW5kTGluZU51bWJlcjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGV4dCxcblx0XHRcdHNlbGVjdGlvblN0YXJ0T2Zmc2V0LFxuXHRcdFx0c2VsZWN0aW9uRW5kT2Zmc2V0LFxuXHRcdFx0ZWRpdENvbnRleHRQcmltYXJ5U2VsZWN0aW9uXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2VkaXRDb250ZXh0U3RhcnRQb3NpdGlvbigpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbih0aGlzLl9lZGl0Q29udGV4dFByaW1hcnlTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVRleHRGb3JtYXRVcGRhdGUoZTogVGV4dEZvcm1hdFVwZGF0ZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0Q29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmb3JtYXRzID0gZS5nZXRUZXh0Rm9ybWF0cygpO1xuXHRcdGNvbnN0IGVkaXRDb250ZXh0U3RhcnRQb3NpdGlvbiA9IHRoaXMuX2VkaXRDb250ZXh0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGZvcm1hdHMuZm9yRWFjaChmID0+IHtcblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLm1vZGVsO1xuXHRcdFx0Y29uc3Qgb2Zmc2V0T2ZFZGl0Q29udGV4dFRleHQgPSB0ZXh0TW9kZWwuZ2V0T2Zmc2V0QXQoZWRpdENvbnRleHRTdGFydFBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IHN0YXJ0UG9zaXRpb25PZkRlY29yYXRpb24gPSB0ZXh0TW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXRPZkVkaXRDb250ZXh0VGV4dCArIGYucmFuZ2VTdGFydCk7XG5cdFx0XHRjb25zdCBlbmRQb3NpdGlvbk9mRGVjb3JhdGlvbiA9IHRleHRNb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldE9mRWRpdENvbnRleHRUZXh0ICsgZi5yYW5nZUVuZCk7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uUmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKHN0YXJ0UG9zaXRpb25PZkRlY29yYXRpb24sIGVuZFBvc2l0aW9uT2ZEZWNvcmF0aW9uKTtcblx0XHRcdGNvbnN0IHRoaWNrbmVzcyA9IGYudW5kZXJsaW5lVGhpY2tuZXNzLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRsZXQgZGVjb3JhdGlvbkNsYXNzTmFtZTogc3RyaW5nID0gQ29tcG9zaXRpb25DbGFzc05hbWUuTk9ORTtcblx0XHRcdHN3aXRjaCAodGhpY2tuZXNzKSB7XG5cdFx0XHRcdGNhc2UgJ3RoaW4nOlxuXHRcdFx0XHRcdGRlY29yYXRpb25DbGFzc05hbWUgPSBDb21wb3NpdGlvbkNsYXNzTmFtZS5TRUNPTkRBUlk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3RoaWNrJzpcblx0XHRcdFx0XHRkZWNvcmF0aW9uQ2xhc3NOYW1lID0gQ29tcG9zaXRpb25DbGFzc05hbWUuUFJJTUFSWTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRyYW5nZTogZGVjb3JhdGlvblJhbmdlLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXh0Rm9ybWF0RGVjb3JhdGlvbicsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiBkZWNvcmF0aW9uQ2xhc3NOYW1lLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLm1vZGVsLmRlbHRhRGVjb3JhdGlvbnModGhpcy5fZGVjb3JhdGlvbnMsIGRlY29yYXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX2xpbmVzVmlzaWJsZVJhbmdlczogSG9yaXpvbnRhbFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3VwZGF0ZVNlbGVjdGlvbkFuZENvbnRyb2xCb3VuZHNEYXRhKGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdTZWxlY3Rpb24gPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxSYW5nZVRvVmlld1JhbmdlKHRoaXMuX3ByaW1hcnlTZWxlY3Rpb24pO1xuXHRcdGlmICh0aGlzLl9wcmltYXJ5U2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0Y29uc3QgbGluZXNWaXNpYmxlUmFuZ2VzID0gY3R4LnZpc2libGVSYW5nZUZvclBvc2l0aW9uKHZpZXdTZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdHRoaXMuX2xpbmVzVmlzaWJsZVJhbmdlcyA9IGxpbmVzVmlzaWJsZVJhbmdlcztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGluZXNWaXNpYmxlUmFuZ2VzID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTZWxlY3Rpb25BbmRDb250cm9sQm91bmRzKCkge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBjb250ZW50TGVmdCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKS5jb250ZW50TGVmdDtcblxuXHRcdGNvbnN0IHZpZXdTZWxlY3Rpb24gPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxSYW5nZVRvVmlld1JhbmdlKHRoaXMuX3ByaW1hcnlTZWxlY3Rpb24pO1xuXHRcdGNvbnN0IHZlcnRpY2FsT2Zmc2V0U3RhcnQgPSB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKHZpZXdTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCB2ZXJ0aWNhbE9mZnNldEVuZCA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEFmdGVyTGluZU51bWJlcih2aWV3U2VsZWN0aW9uLmVuZExpbmVOdW1iZXIpO1xuXG5cdFx0Ly8gISEhIE1ha2Ugc3VyZSB0aGlzIGRvZXNuJ3QgZm9yY2UgYW4gZXh0cmEgbGF5b3V0XG5cdFx0Ly8gISEhIGJ5IHVzaW5nIHRoZSBjYWNoZWQgcGFyZW50IGJvdW5kcyByZWFkIGluIG9uQmVmb3JlUmVuZGVyXG5cdFx0Y29uc3QgcGFyZW50Qm91bmRzID0gdGhpcy5fcGFyZW50Qm91bmRzITtcblx0XHRjb25zdCB0b3AgPSBwYXJlbnRCb3VuZHMudG9wICsgdmVydGljYWxPZmZzZXRTdGFydCAtIHRoaXMuX3Njcm9sbFRvcDtcblx0XHRjb25zdCBoZWlnaHQgPSB2ZXJ0aWNhbE9mZnNldEVuZCAtIHZlcnRpY2FsT2Zmc2V0U3RhcnQ7XG5cdFx0bGV0IGxlZnQgPSBwYXJlbnRCb3VuZHMubGVmdCArIGNvbnRlbnRMZWZ0IC0gdGhpcy5fc2Nyb2xsTGVmdDtcblx0XHRsZXQgd2lkdGg6IG51bWJlcjtcblxuXHRcdGlmICh0aGlzLl9wcmltYXJ5U2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0aWYgKHRoaXMuX2xpbmVzVmlzaWJsZVJhbmdlcykge1xuXHRcdFx0XHRsZWZ0ICs9IHRoaXMuX2xpbmVzVmlzaWJsZVJhbmdlcy5sZWZ0O1xuXHRcdFx0fVxuXHRcdFx0d2lkdGggPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR3aWR0aCA9IHBhcmVudEJvdW5kcy53aWR0aCAtIGNvbnRlbnRMZWZ0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbkJvdW5kcyA9IG5ldyBET01SZWN0KGxlZnQsIHRvcCwgd2lkdGgsIGhlaWdodCk7XG5cdFx0dGhpcy5fZWRpdENvbnRleHQudXBkYXRlU2VsZWN0aW9uQm91bmRzKHNlbGVjdGlvbkJvdW5kcyk7XG5cdFx0dGhpcy5fZWRpdENvbnRleHQudXBkYXRlQ29udHJvbEJvdW5kcyhzZWxlY3Rpb25Cb3VuZHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ2hhcmFjdGVyQm91bmRzKGU6IENoYXJhY3RlckJvdW5kc1VwZGF0ZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdGNvbnN0IHR5cGljYWxIYWxmV2lkdGhDaGFyYWN0ZXJXaWR0aCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbykudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdGNvbnN0IGNvbnRlbnRMZWZ0ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pLmNvbnRlbnRMZWZ0O1xuXHRcdGNvbnN0IHBhcmVudEJvdW5kcyA9IHRoaXMuX3BhcmVudEJvdW5kcyE7XG5cblx0XHRjb25zdCBjaGFyYWN0ZXJCb3VuZHM6IERPTVJlY3RbXSA9IFtdO1xuXHRcdGNvbnN0IG9mZnNldFRyYW5zZm9ybWVyID0gbmV3IFBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXIodGhpcy5fZWRpdENvbnRleHQudGV4dCk7XG5cdFx0Zm9yIChsZXQgb2Zmc2V0ID0gZS5yYW5nZVN0YXJ0OyBvZmZzZXQgPCBlLnJhbmdlRW5kOyBvZmZzZXQrKykge1xuXHRcdFx0Y29uc3QgZWRpdENvbnRleHRTdGFydFBvc2l0aW9uID0gb2Zmc2V0VHJhbnNmb3JtZXIuZ2V0UG9zaXRpb24ob2Zmc2V0KTtcblx0XHRcdGNvbnN0IHRleHRTdGFydExpbmVPZmZzZXRXaXRoaW5FZGl0b3IgPSB0aGlzLl9lZGl0Q29udGV4dFByaW1hcnlTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyIC0gMTtcblx0XHRcdGNvbnN0IGNoYXJhY3RlclN0YXJ0UG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGV4dFN0YXJ0TGluZU9mZnNldFdpdGhpbkVkaXRvciArIGVkaXRDb250ZXh0U3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLCBlZGl0Q29udGV4dFN0YXJ0UG9zaXRpb24uY29sdW1uKTtcblx0XHRcdGNvbnN0IGNoYXJhY3RlckVuZFBvc2l0aW9uID0gY2hhcmFjdGVyU3RhcnRQb3NpdGlvbi5kZWx0YSgwLCAxKTtcblx0XHRcdGNvbnN0IGNoYXJhY3Rlck1vZGVsUmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGNoYXJhY3RlclN0YXJ0UG9zaXRpb24sIGNoYXJhY3RlckVuZFBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IGNoYXJhY3RlclZpZXdSYW5nZSA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFJhbmdlVG9WaWV3UmFuZ2UoY2hhcmFjdGVyTW9kZWxSYW5nZSk7XG5cdFx0XHRjb25zdCBjaGFyYWN0ZXJMaW5lc1Zpc2libGVSYW5nZXMgPSB0aGlzLl92aXNpYmxlUmFuZ2VQcm92aWRlci5saW5lc1Zpc2libGVSYW5nZXNGb3JSYW5nZShjaGFyYWN0ZXJWaWV3UmFuZ2UsIHRydWUpID8/IFtdO1xuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGNoYXJhY3RlclZpZXdSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBjaGFyYWN0ZXJWZXJ0aWNhbE9mZnNldCA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCB0b3AgPSBwYXJlbnRCb3VuZHMudG9wICsgY2hhcmFjdGVyVmVydGljYWxPZmZzZXQgLSB0aGlzLl9zY3JvbGxUb3A7XG5cblx0XHRcdGxldCBsZWZ0ID0gMDtcblx0XHRcdGxldCB3aWR0aCA9IHR5cGljYWxIYWxmV2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHRcdGlmIChjaGFyYWN0ZXJMaW5lc1Zpc2libGVSYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHZpc2libGVSYW5nZSBvZiBjaGFyYWN0ZXJMaW5lc1Zpc2libGVSYW5nZXNbMF0ucmFuZ2VzKSB7XG5cdFx0XHRcdFx0bGVmdCA9IHZpc2libGVSYW5nZS5sZWZ0O1xuXHRcdFx0XHRcdHdpZHRoID0gdmlzaWJsZVJhbmdlLndpZHRoO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldExpbmVIZWlnaHRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y2hhcmFjdGVyQm91bmRzLnB1c2gobmV3IERPTVJlY3QocGFyZW50Qm91bmRzLmxlZnQgKyBjb250ZW50TGVmdCArIGxlZnQgLSB0aGlzLl9zY3JvbGxMZWZ0LCB0b3AsIHdpZHRoLCBsaW5lSGVpZ2h0KSk7XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRDb250ZXh0LnVwZGF0ZUNoYXJhY3RlckJvdW5kcyhlLnJhbmdlU3RhcnQsIGNoYXJhY3RlckJvdW5kcyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCLGtCQUFrQixXQUFXLG1CQUFtQjtBQUNoRixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBa0Q7QUFLM0QsU0FBUyxhQUFhLDBCQUEwQixpQ0FBaUM7QUFDakYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQ0FBa0Msb0JBQStCO0FBQzFFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlDQUFpQztBQUUxQyxTQUFTLGlCQUFpQixzQkFBc0I7QUFDaEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMs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
