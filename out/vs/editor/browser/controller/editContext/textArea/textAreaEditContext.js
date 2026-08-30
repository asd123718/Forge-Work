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
import "./textAreaEditContext.css";
import * as nls from "../../../../../nls.js";
import * as browser from "../../../../../base/browser/browser.js";
import { $ } from "../../../../../base/browser/dom.js";
import { createFastDomNode } from "../../../../../base/browser/fastDomNode.js";
import * as platform from "../../../../../base/common/platform.js";
import * as strings from "../../../../../base/common/strings.js";
import { applyFontInfo } from "../../../config/domFontInfo.js";
import { PartFingerprint, PartFingerprints } from "../../../view/viewPart.js";
import { LineNumbersOverlay } from "../../../viewParts/lineNumbers/lineNumbers.js";
import { Margin } from "../../../viewParts/margin/margin.js";
import { RenderLineNumbersType, EditorOption, EditorOptions } from "../../../../common/config/editorOptions.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { ScrollType } from "../../../../common/editorCommon.js";
import { EndOfLinePreference } from "../../../../common/model.js";
import * as viewEvents from "../../../../common/viewEvents.js";
import { AccessibilitySupport } from "../../../../../platform/accessibility/common/accessibility.js";
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from "../../../../../base/browser/ui/mouseCursor/mouseCursor.js";
import { TokenizationRegistry } from "../../../../common/languages.js";
import { ColorId } from "../../../../common/encodedTokenAttributes.js";
import { Color } from "../../../../../base/common/color.js";
import { IME } from "../../../../../base/common/ime.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { AbstractEditContext } from "../editContext.js";
import { TextAreaInput, TextAreaWrapper } from "./textAreaEditContextInput.js";
import { ariaLabelForScreenReaderContent, newlinecount, SimplePagedScreenReaderStrategy } from "../screenReaderUtils.js";
import { _debugComposition, TextAreaState } from "./textAreaEditContextState.js";
import { getMapForWordSeparators, WordCharacterClass } from "../../../../common/core/wordCharacterClassifier.js";
import { TextAreaEditContextRegistry } from "./textAreaEditContextRegistry.js";
class VisibleTextAreaData {
  constructor(_context, modelLineNumber, distanceToModelLineStart, widthOfHiddenLineTextBefore, distanceToModelLineEnd) {
    this._context = _context;
    this.modelLineNumber = modelLineNumber;
    this.distanceToModelLineStart = distanceToModelLineStart;
    this.widthOfHiddenLineTextBefore = widthOfHiddenLineTextBefore;
    this.distanceToModelLineEnd = distanceToModelLineEnd;
    this._visibleTextAreaBrand = void 0;
    this.startPosition = null;
    this.endPosition = null;
    this.visibleTextareaStart = null;
    this.visibleTextareaEnd = null;
    /**
     * When doing composition, the currently composed text might be split up into
     * multiple tokens, then merged again into a single token, etc. Here we attempt
     * to keep the presentation of the <textarea> stable by using the previous used
     * style if multiple tokens come into play. This avoids flickering.
     */
    this._previousPresentation = null;
  }
  prepareRender(visibleRangeProvider) {
    const startModelPosition = new Position(this.modelLineNumber, this.distanceToModelLineStart + 1);
    const endModelPosition = new Position(this.modelLineNumber, this._context.viewModel.model.getLineMaxColumn(this.modelLineNumber) - this.distanceToModelLineEnd);
    this.startPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(startModelPosition);
    this.endPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(endModelPosition);
    if (this.startPosition.lineNumber === this.endPosition.lineNumber) {
      this.visibleTextareaStart = visibleRangeProvider.visibleRangeForPosition(this.startPosition);
      this.visibleTextareaEnd = visibleRangeProvider.visibleRangeForPosition(this.endPosition);
    } else {
      this.visibleTextareaStart = null;
      this.visibleTextareaEnd = null;
    }
  }
  definePresentation(tokenPresentation) {
    if (!this._previousPresentation) {
      if (tokenPresentation) {
        this._previousPresentation = tokenPresentation;
      } else {
        this._previousPresentation = {
          foreground: ColorId.DefaultForeground,
          italic: false,
          bold: false,
          underline: false,
          strikethrough: false
        };
      }
    }
    return this._previousPresentation;
  }
}
const canUseZeroSizeTextarea = browser.isFirefox;
let TextAreaEditContext = class extends AbstractEditContext {
  constructor(ownerID, context, overflowGuardContainer, viewController, visibleRangeProvider, _keybindingService, _instantiationService) {
    super(context);
    this._keybindingService = _keybindingService;
    this._instantiationService = _instantiationService;
    this._primaryCursorPosition = new Position(1, 1);
    this._primaryCursorVisibleRange = null;
    this._viewController = viewController;
    this._visibleRangeProvider = visibleRangeProvider;
    this._scrollLeft = 0;
    this._scrollTop = 0;
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    this._setAccessibilityOptions(options);
    this._contentLeft = layoutInfo.contentLeft;
    this._contentWidth = layoutInfo.contentWidth;
    this._contentHeight = layoutInfo.height;
    this._fontInfo = options.get(EditorOption.fontInfo);
    this._emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
    this._visibleTextArea = null;
    this._selections = [new Selection(1, 1, 1, 1)];
    this._modelSelections = [new Selection(1, 1, 1, 1)];
    this._lastRenderPosition = null;
    this.textArea = createFastDomNode(document.createElement("textarea"));
    PartFingerprints.write(this.textArea, PartFingerprint.TextArea);
    this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
    this.textArea.setAttribute("wrap", this._textAreaWrapping && !this._visibleTextArea ? "on" : "off");
    const { tabSize } = this._context.viewModel.model.getOptions();
    this.textArea.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
    this.textArea.setAttribute("autocorrect", "off");
    this.textArea.setAttribute("autocapitalize", "off");
    this.textArea.setAttribute("autocomplete", "off");
    this.textArea.setAttribute("spellcheck", "false");
    this.textArea.setAttribute("aria-label", ariaLabelForScreenReaderContent(options, this._keybindingService));
    this.textArea.setAttribute("aria-required", options.get(EditorOption.ariaRequired) ? "true" : "false");
    this.textArea.setAttribute("tabindex", String(options.get(EditorOption.tabIndex)));
    this.textArea.setAttribute("role", "textbox");
    this.textArea.setAttribute("aria-roledescription", nls.localize("editor", "editor"));
    this.textArea.setAttribute("aria-multiline", "true");
    this.textArea.setAttribute("aria-autocomplete", options.get(EditorOption.readOnly) ? "none" : "both");
    this._ensureReadOnlyAttribute();
    this.textAreaCover = createFastDomNode(document.createElement("div"));
    this.textAreaCover.setPosition("absolute");
    overflowGuardContainer.appendChild(this.textArea);
    overflowGuardContainer.appendChild(this.textAreaCover);
    const simplePagedScreenReaderStrategy = new SimplePagedScreenReaderStrategy();
    const textAreaInputHost = {
      context: this._context,
      getScreenReaderContent: () => {
        if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
          const selection = this._selections[0];
          if (platform.isMacintosh && selection.isEmpty()) {
            const position = selection.getStartPosition();
            let textBefore = this._getWordBeforePosition(position);
            if (textBefore.length === 0) {
              textBefore = this._getCharacterBeforePosition(position);
            }
            if (textBefore.length > 0) {
              return new TextAreaState(textBefore, textBefore.length, textBefore.length, Range.fromPositions(position), 0);
            }
          }
          const LIMIT_CHARS = 500;
          if (platform.isMacintosh && !selection.isEmpty() && this._context.viewModel.getValueLengthInRange(selection, EndOfLinePreference.TextDefined) < LIMIT_CHARS) {
            const text = this._context.viewModel.getValueInRange(selection, EndOfLinePreference.TextDefined);
            return new TextAreaState(text, 0, text.length, selection, 0);
          }
          if (browser.isSafari && !selection.isEmpty()) {
            const placeholderText = "vscode-placeholder";
            return new TextAreaState(placeholderText, 0, placeholderText.length, null, void 0);
          }
          return TextAreaState.EMPTY;
        }
        if (browser.isAndroid) {
          const selection = this._selections[0];
          if (selection.isEmpty()) {
            const position = selection.getStartPosition();
            const [wordAtPosition, positionOffsetInWord] = this._getAndroidWordAtPosition(position);
            if (wordAtPosition.length > 0) {
              return new TextAreaState(wordAtPosition, positionOffsetInWord, positionOffsetInWord, Range.fromPositions(position), 0);
            }
          }
          return TextAreaState.EMPTY;
        }
        const screenReaderContentState = simplePagedScreenReaderStrategy.fromEditorSelection(this._context.viewModel, this._selections[0], this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
        return TextAreaState.fromScreenReaderContentState(screenReaderContentState);
      },
      deduceModelPosition: (viewAnchorPosition, deltaOffset, lineFeedCnt) => {
        return this._context.viewModel.deduceModelPositionRelativeToViewPosition(viewAnchorPosition, deltaOffset, lineFeedCnt);
      }
    };
    const textAreaWrapper = this._register(new TextAreaWrapper(this.textArea.domNode));
    this._textAreaInput = this._register(this._instantiationService.createInstance(TextAreaInput, textAreaInputHost, textAreaWrapper, platform.OS, {
      isAndroid: browser.isAndroid,
      isChrome: browser.isChrome,
      isFirefox: browser.isFirefox,
      isSafari: browser.isSafari
    }));
    this._register(this._textAreaInput.onWillCopy((e) => this._onWillCopy.fire(e)));
    this._register(this._textAreaInput.onWillCut((e) => this._onWillCut.fire(e)));
    this._register(this._textAreaInput.onWillPaste((e) => this._onWillPaste.fire(e)));
    this._register(this._textAreaInput.onKeyDown((e) => {
      this._viewController.emitKeyDown(e);
    }));
    this._register(this._textAreaInput.onKeyUp((e) => {
      this._viewController.emitKeyUp(e);
    }));
    this._register(this._textAreaInput.onPaste((e) => {
      let pasteOnNewLine = false;
      let multicursorText = null;
      let mode = null;
      if (e.metadata) {
        pasteOnNewLine = this._emptySelectionClipboard && !!e.metadata.isFromEmptySelection;
        multicursorText = typeof e.metadata.multicursorText !== "undefined" ? e.metadata.multicursorText : null;
        mode = e.metadata.mode;
      }
      this._viewController.paste(e.text, pasteOnNewLine, multicursorText, mode);
    }));
    this._register(this._textAreaInput.onCut(() => {
      this._viewController.cut();
    }));
    this._register(this._textAreaInput.onType((e) => {
      if (e.replacePrevCharCnt || e.replaceNextCharCnt || e.positionDelta) {
        if (_debugComposition) {
          console.log(` => compositionType: <<${e.text}>>, ${e.replacePrevCharCnt}, ${e.replaceNextCharCnt}, ${e.positionDelta}`);
        }
        this._viewController.compositionType(e.text, e.replacePrevCharCnt, e.replaceNextCharCnt, e.positionDelta);
      } else {
        if (_debugComposition) {
          console.log(` => type: <<${e.text}>>`);
        }
        this._viewController.type(e.text);
      }
    }));
    this._register(this._textAreaInput.onSelectionChangeRequest((modelSelection) => {
      this._viewController.setSelection(modelSelection);
    }));
    this._register(this._textAreaInput.onCompositionStart((e) => {
      const ta = this.textArea.domNode;
      const modelSelection = this._modelSelections[0];
      const { distanceToModelLineStart, widthOfHiddenTextBefore } = (() => {
        const textBeforeSelection = ta.value.substring(0, Math.min(ta.selectionStart, ta.selectionEnd));
        const lineFeedOffset1 = textBeforeSelection.lastIndexOf("\n");
        const lineTextBeforeSelection = textBeforeSelection.substring(lineFeedOffset1 + 1);
        const tabOffset1 = lineTextBeforeSelection.lastIndexOf("	");
        const desiredVisibleBeforeCharCount = lineTextBeforeSelection.length - tabOffset1 - 1;
        const startModelPosition = modelSelection.getStartPosition();
        const visibleBeforeCharCount = Math.min(startModelPosition.column - 1, desiredVisibleBeforeCharCount);
        const distanceToModelLineStart2 = startModelPosition.column - 1 - visibleBeforeCharCount;
        const hiddenLineTextBefore = lineTextBeforeSelection.substring(0, lineTextBeforeSelection.length - visibleBeforeCharCount);
        const { tabSize: tabSize2 } = this._context.viewModel.model.getOptions();
        const widthOfHiddenTextBefore2 = measureText(this.textArea.domNode.ownerDocument, hiddenLineTextBefore, this._fontInfo, tabSize2);
        return { distanceToModelLineStart: distanceToModelLineStart2, widthOfHiddenTextBefore: widthOfHiddenTextBefore2 };
      })();
      const { distanceToModelLineEnd } = (() => {
        const textAfterSelection = ta.value.substring(Math.max(ta.selectionStart, ta.selectionEnd));
        const lineFeedOffset2 = textAfterSelection.indexOf("\n");
        const lineTextAfterSelection = lineFeedOffset2 === -1 ? textAfterSelection : textAfterSelection.substring(0, lineFeedOffset2);
        const tabOffset2 = lineTextAfterSelection.indexOf("	");
        const desiredVisibleAfterCharCount = tabOffset2 === -1 ? lineTextAfterSelection.length : lineTextAfterSelection.length - tabOffset2 - 1;
        const endModelPosition = modelSelection.getEndPosition();
        const visibleAfterCharCount = Math.min(this._context.viewModel.model.getLineMaxColumn(endModelPosition.lineNumber) - endModelPosition.column, desiredVisibleAfterCharCount);
        const distanceToModelLineEnd2 = this._context.viewModel.model.getLineMaxColumn(endModelPosition.lineNumber) - endModelPosition.column - visibleAfterCharCount;
        return { distanceToModelLineEnd: distanceToModelLineEnd2 };
      })();
      this._context.viewModel.revealRange(
        "keyboard",
        true,
        Range.fromPositions(this._selections[0].getStartPosition()),
        viewEvents.VerticalRevealType.Simple,
        ScrollType.Immediate
      );
      this._visibleTextArea = new VisibleTextAreaData(
        this._context,
        modelSelection.startLineNumber,
        distanceToModelLineStart,
        widthOfHiddenTextBefore,
        distanceToModelLineEnd
      );
      this.textArea.setAttribute("wrap", this._textAreaWrapping && !this._visibleTextArea ? "on" : "off");
      this._visibleTextArea.prepareRender(this._visibleRangeProvider);
      this._render();
      this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME} ime-input`);
      this._viewController.compositionStart();
      this._context.viewModel.onCompositionStart();
    }));
    this._register(this._textAreaInput.onCompositionUpdate((e) => {
      if (!this._visibleTextArea) {
        return;
      }
      this._visibleTextArea.prepareRender(this._visibleRangeProvider);
      this._render();
    }));
    this._register(this._textAreaInput.onCompositionEnd(() => {
      this._visibleTextArea = null;
      this.textArea.setAttribute("wrap", this._textAreaWrapping && !this._visibleTextArea ? "on" : "off");
      this._render();
      this.textArea.setClassName(`inputarea ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);
      this._viewController.compositionEnd();
      this._context.viewModel.onCompositionEnd();
    }));
    this._register(this._textAreaInput.onFocus(() => {
      this._context.viewModel.setHasFocus(true);
    }));
    this._register(this._textAreaInput.onBlur(() => {
      this._context.viewModel.setHasFocus(false);
    }));
    this._register(IME.onDidChange(() => {
      this._ensureReadOnlyAttribute();
    }));
    this._register(TextAreaEditContextRegistry.register(ownerID, this));
  }
  get domNode() {
    return this.textArea;
  }
  writeScreenReaderContent(reason) {
    this._textAreaInput.writeNativeTextAreaContent(reason);
  }
  getTextAreaDomNode() {
    return this.textArea.domNode;
  }
  dispose() {
    super.dispose();
    this.textArea.domNode.remove();
    this.textAreaCover.domNode.remove();
  }
  _getAndroidWordAtPosition(position) {
    if (position.lineNumber > this._context.viewModel.getLineCount()) {
      return ["", 0];
    }
    const ANDROID_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:",.<>/?';
    const lineContent = this._context.viewModel.getLineContent(position.lineNumber);
    const wordSeparators = getMapForWordSeparators(ANDROID_WORD_SEPARATORS, []);
    let goingLeft = true;
    let startColumn = position.column;
    let goingRight = true;
    let endColumn = position.column;
    let distance = 0;
    while (distance < 50 && (goingLeft || goingRight)) {
      if (goingLeft && startColumn <= 1) {
        goingLeft = false;
      }
      if (goingLeft) {
        const charCode = lineContent.charCodeAt(startColumn - 2);
        const charClass = wordSeparators.get(charCode);
        if (charClass !== WordCharacterClass.Regular) {
          goingLeft = false;
        } else {
          startColumn--;
        }
      }
      if (goingRight && endColumn > lineContent.length) {
        goingRight = false;
      }
      if (goingRight) {
        const charCode = lineContent.charCodeAt(endColumn - 1);
        const charClass = wordSeparators.get(charCode);
        if (charClass !== WordCharacterClass.Regular) {
          goingRight = false;
        } else {
          endColumn++;
        }
      }
      distance++;
    }
    return [lineContent.substring(startColumn - 1, endColumn - 1), position.column - startColumn];
  }
  _getWordBeforePosition(position) {
    if (position.lineNumber > this._context.viewModel.getLineCount()) {
      return "";
    }
    const lineContent = this._context.viewModel.getLineContent(position.lineNumber);
    const wordSeparators = getMapForWordSeparators(this._context.configuration.options.get(EditorOption.wordSeparators), []);
    let column = position.column;
    let distance = 0;
    while (column > 1) {
      const charCode = lineContent.charCodeAt(column - 2);
      const charClass = wordSeparators.get(charCode);
      if (charClass !== WordCharacterClass.Regular || distance > 50) {
        return lineContent.substring(column - 1, position.column - 1);
      }
      distance++;
      column--;
    }
    return lineContent.substring(0, position.column - 1);
  }
  _getCharacterBeforePosition(position) {
    if (position.column > 1) {
      if (position.lineNumber > this._context.viewModel.getLineCount()) {
        return "";
      }
      const lineContent = this._context.viewModel.getLineContent(position.lineNumber);
      const charBefore = lineContent.charAt(position.column - 2);
      if (!strings.isHighSurrogate(charBefore.charCodeAt(0))) {
        return charBefore;
      }
    }
    return "";
  }
  _setAccessibilityOptions(options) {
    this._accessibilitySupport = options.get(EditorOption.accessibilitySupport);
    const accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
    if (this._accessibilitySupport === AccessibilitySupport.Enabled && accessibilityPageSize === EditorOptions.accessibilityPageSize.defaultValue) {
      this._accessibilityPageSize = 500;
    } else {
      this._accessibilityPageSize = accessibilityPageSize;
    }
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const wrappingColumn = layoutInfo.wrappingColumn;
    if (wrappingColumn !== -1 && this._accessibilitySupport !== AccessibilitySupport.Disabled) {
      const fontInfo = options.get(EditorOption.fontInfo);
      this._textAreaWrapping = true;
      this._textAreaWidth = Math.round(wrappingColumn * fontInfo.typicalHalfwidthCharacterWidth);
    } else {
      this._textAreaWrapping = false;
      this._textAreaWidth = canUseZeroSizeTextarea ? 0 : 1;
    }
  }
  // --- begin event handlers
  onConfigurationChanged(e) {
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    this._setAccessibilityOptions(options);
    this._contentLeft = layoutInfo.contentLeft;
    this._contentWidth = layoutInfo.contentWidth;
    this._contentHeight = layoutInfo.height;
    this._fontInfo = options.get(EditorOption.fontInfo);
    this._emptySelectionClipboard = options.get(EditorOption.emptySelectionClipboard);
    this.textArea.setAttribute("wrap", this._textAreaWrapping && !this._visibleTextArea ? "on" : "off");
    const { tabSize } = this._context.viewModel.model.getOptions();
    this.textArea.domNode.style.tabSize = `${tabSize * this._fontInfo.spaceWidth}px`;
    this.textArea.setAttribute("aria-label", ariaLabelForScreenReaderContent(options, this._keybindingService));
    this.textArea.setAttribute("aria-required", options.get(EditorOption.ariaRequired) ? "true" : "false");
    this.textArea.setAttribute("tabindex", String(options.get(EditorOption.tabIndex)));
    if (e.hasChanged(EditorOption.domReadOnly) || e.hasChanged(EditorOption.readOnly)) {
      this._ensureReadOnlyAttribute();
    }
    if (e.hasChanged(EditorOption.accessibilitySupport)) {
      this._textAreaInput.writeNativeTextAreaContent("strategy changed");
    }
    return true;
  }
  onCursorStateChanged(e) {
    this._selections = e.selections.slice(0);
    this._modelSelections = e.modelSelections.slice(0);
    this._textAreaInput.writeNativeTextAreaContent("selection changed");
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
  // --- end event handlers
  // --- begin view API
  isFocused() {
    return this._textAreaInput.isFocused();
  }
  focus() {
    this._textAreaInput.focusTextArea();
  }
  refreshFocusState() {
    this._textAreaInput.refreshFocusState();
  }
  getLastRenderData() {
    return this._lastRenderPosition;
  }
  setAriaOptions(options) {
    if (options.activeDescendant) {
      this.textArea.setAttribute("aria-haspopup", "true");
      this.textArea.setAttribute("aria-autocomplete", "list");
      this.textArea.setAttribute("aria-activedescendant", options.activeDescendant);
    } else {
      this.textArea.setAttribute("aria-haspopup", "false");
      this.textArea.setAttribute("aria-autocomplete", "both");
      this.textArea.removeAttribute("aria-activedescendant");
    }
    if (options.role) {
      this.textArea.setAttribute("role", options.role);
    }
  }
  // --- end view API
  _ensureReadOnlyAttribute() {
    const options = this._context.configuration.options;
    const useReadOnly = !IME.enabled || options.get(EditorOption.domReadOnly) && options.get(EditorOption.readOnly);
    if (useReadOnly) {
      this.textArea.setAttribute("readonly", "true");
    } else {
      this.textArea.removeAttribute("readonly");
    }
  }
  prepareRender(ctx) {
    this._primaryCursorPosition = new Position(this._selections[0].positionLineNumber, this._selections[0].positionColumn);
    this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primaryCursorPosition);
    this._visibleTextArea?.prepareRender(ctx);
  }
  render(ctx) {
    this._textAreaInput.writeNativeTextAreaContent("render");
    this._render();
  }
  _render() {
    if (this._visibleTextArea) {
      const visibleStart = this._visibleTextArea.visibleTextareaStart;
      const visibleEnd = this._visibleTextArea.visibleTextareaEnd;
      const startPosition = this._visibleTextArea.startPosition;
      const endPosition = this._visibleTextArea.endPosition;
      if (startPosition && endPosition && visibleStart && visibleEnd && visibleEnd.left >= this._scrollLeft && visibleStart.left <= this._scrollLeft + this._contentWidth) {
        const top2 = this._context.viewLayout.getVerticalOffsetForLineNumber(this._primaryCursorPosition.lineNumber) - this._scrollTop;
        const lineCount = newlinecount(this.textArea.domNode.value.substr(0, this.textArea.domNode.selectionStart));
        let scrollLeft = this._visibleTextArea.widthOfHiddenLineTextBefore;
        let left2 = this._contentLeft + visibleStart.left - this._scrollLeft;
        let width = visibleEnd.left - visibleStart.left + 1;
        if (left2 < this._contentLeft) {
          const delta = this._contentLeft - left2;
          left2 += delta;
          scrollLeft += delta;
          width -= delta;
        }
        if (width > this._contentWidth) {
          width = this._contentWidth;
        }
        const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(startPosition.lineNumber);
        const fontSize = this._context.viewModel.getFontSizeAtPosition(this._primaryCursorPosition);
        const viewLineData = this._context.viewModel.getViewLineData(startPosition.lineNumber);
        const startTokenIndex = viewLineData.tokens.findTokenIndexAtOffset(startPosition.column - 1);
        const endTokenIndex = viewLineData.tokens.findTokenIndexAtOffset(endPosition.column - 1);
        const textareaSpansSingleToken = startTokenIndex === endTokenIndex;
        const presentation = this._visibleTextArea.definePresentation(
          textareaSpansSingleToken ? viewLineData.tokens.getPresentation(startTokenIndex) : null
        );
        this.textArea.domNode.scrollTop = lineCount * lineHeight;
        this.textArea.domNode.scrollLeft = scrollLeft;
        this._doRender({
          lastRenderPosition: null,
          top: top2,
          left: left2,
          width,
          height: lineHeight,
          useCover: false,
          color: (TokenizationRegistry.getColorMap() || [])[presentation.foreground],
          italic: presentation.italic,
          bold: presentation.bold,
          underline: presentation.underline,
          strikethrough: presentation.strikethrough,
          fontSize
        });
      }
      return;
    }
    if (!this._primaryCursorVisibleRange) {
      this._renderAtTopLeft();
      return;
    }
    const left = this._contentLeft + this._primaryCursorVisibleRange.left - this._scrollLeft;
    if (left < this._contentLeft || left > this._contentLeft + this._contentWidth) {
      this._renderAtTopLeft();
      return;
    }
    const top = this._context.viewLayout.getVerticalOffsetForLineNumber(this._selections[0].positionLineNumber) - this._scrollTop;
    if (top < 0 || top > this._contentHeight) {
      this._renderAtTopLeft();
      return;
    }
    if (platform.isMacintosh || this._accessibilitySupport === AccessibilitySupport.Enabled) {
      const lineNumber = this._primaryCursorPosition.lineNumber;
      const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(lineNumber);
      this._doRender({
        lastRenderPosition: this._primaryCursorPosition,
        top,
        left: this._textAreaWrapping ? this._contentLeft : left,
        width: this._textAreaWidth,
        height: lineHeight,
        useCover: false
      });
      this.textArea.domNode.scrollLeft = this._primaryCursorVisibleRange.left;
      const lineCount = this._textAreaInput.textAreaState.newlineCountBeforeSelection ?? newlinecount(this.textArea.domNode.value.substring(0, this.textArea.domNode.selectionStart));
      this.textArea.domNode.scrollTop = lineCount * lineHeight;
      return;
    }
    this._doRender({
      lastRenderPosition: this._primaryCursorPosition,
      top,
      left: this._textAreaWrapping ? this._contentLeft : left,
      width: this._textAreaWidth,
      height: canUseZeroSizeTextarea ? 0 : 1,
      useCover: false
    });
  }
  _renderAtTopLeft() {
    this._doRender({
      lastRenderPosition: null,
      top: 0,
      left: 0,
      width: this._textAreaWidth,
      height: canUseZeroSizeTextarea ? 0 : 1,
      useCover: true
    });
  }
  _doRender(renderData) {
    this._lastRenderPosition = renderData.lastRenderPosition;
    const ta = this.textArea;
    const tac = this.textAreaCover;
    applyFontInfo(ta, this._fontInfo);
    ta.setTop(renderData.top);
    ta.setLeft(renderData.left);
    ta.setWidth(renderData.width);
    ta.setHeight(renderData.height);
    ta.setLineHeight(renderData.height);
    ta.setFontSize(renderData.fontSize ?? this._fontInfo.fontSize);
    ta.setColor(renderData.color ? Color.Format.CSS.formatHex(renderData.color) : "");
    ta.setFontStyle(renderData.italic ? "italic" : "");
    if (renderData.bold) {
      ta.setFontWeight("bold");
    }
    ta.setTextDecoration(`${renderData.underline ? " underline" : ""}${renderData.strikethrough ? " line-through" : ""}`);
    tac.setTop(renderData.useCover ? renderData.top : 0);
    tac.setLeft(renderData.useCover ? renderData.left : 0);
    tac.setWidth(renderData.useCover ? renderData.width : 0);
    tac.setHeight(renderData.useCover ? renderData.height : 0);
    const options = this._context.configuration.options;
    if (options.get(EditorOption.glyphMargin)) {
      tac.setClassName("monaco-editor-background textAreaCover " + Margin.OUTER_CLASS_NAME);
    } else {
      if (options.get(EditorOption.lineNumbers).renderType !== RenderLineNumbersType.Off) {
        tac.setClassName("monaco-editor-background textAreaCover " + LineNumbersOverlay.CLASS_NAME);
      } else {
        tac.setClassName("monaco-editor-background textAreaCover");
      }
    }
  }
};
TextAreaEditContext = __decorateClass([
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IInstantiationService)
], TextAreaEditContext);
function measureText(targetDocument, text, fontInfo, tabSize) {
  if (text.length === 0) {
    return 0;
  }
  const container = $("div");
  container.style.position = "absolute";
  container.style.top = "-50000px";
  container.style.width = "50000px";
  const regularDomNode = $("span");
  applyFontInfo(regularDomNode, fontInfo);
  regularDomNode.style.whiteSpace = "pre";
  regularDomNode.style.tabSize = `${tabSize * fontInfo.spaceWidth}px`;
  regularDomNode.append(text);
  container.appendChild(regularDomNode);
  targetDocument.body.appendChild(container);
  const res = regularDomNode.offsetWidth;
  container.remove();
  return res;
}
export {
  TextAreaEditContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGNvbnRyb2xsZXJcXGVkaXRDb250ZXh0XFx0ZXh0QXJlYVxcdGV4dEFyZWFFZGl0Q29udGV4dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi90ZXh0QXJlYUVkaXRDb250ZXh0LmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGJyb3dzZXIgZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRmFzdERvbU5vZGUsIGNyZWF0ZUZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGFwcGx5Rm9udEluZm8gfSBmcm9tICcuLi8uLi8uLi9jb25maWcvZG9tRm9udEluZm8uanMnO1xuaW1wb3J0IHsgVmlld0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi92aWV3L3ZpZXdDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFBhcnRGaW5nZXJwcmludCwgUGFydEZpbmdlcnByaW50cyB9IGZyb20gJy4uLy4uLy4uL3ZpZXcvdmlld1BhcnQuanMnO1xuaW1wb3J0IHsgTGluZU51bWJlcnNPdmVybGF5IH0gZnJvbSAnLi4vLi4vLi4vdmlld1BhcnRzL2xpbmVOdW1iZXJzL2xpbmVOdW1iZXJzLmpzJztcbmltcG9ydCB7IE1hcmdpbiB9IGZyb20gJy4uLy4uLy4uL3ZpZXdQYXJ0cy9tYXJnaW4vbWFyZ2luLmpzJztcbmltcG9ydCB7IFJlbmRlckxpbmVOdW1iZXJzVHlwZSwgRWRpdG9yT3B0aW9uLCBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCBFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgUmVuZGVyaW5nQ29udGV4dCwgUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQsIEhvcml6b250YWxQb3NpdGlvbiwgTGluZVZpc2libGVSYW5nZXMgfSBmcm9tICcuLi8uLi8uLi92aWV3L3JlbmRlcmluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCAqIGFzIHZpZXdFdmVudHMgZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVN1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElFZGl0b3JBcmlhT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgTU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbW91c2VDdXJzb3IvbW91c2VDdXJzb3IuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IENvbG9ySWQsIElUb2tlblByZXNlbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgSU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaW1lLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEVkaXRDb250ZXh0IH0gZnJvbSAnLi4vZWRpdENvbnRleHQuanMnO1xuaW1wb3J0IHsgSUNvbXBvc2l0aW9uRGF0YSwgSVBhc3RlRGF0YSwgSVRleHRBcmVhSW5wdXRIb3N0LCBUZXh0QXJlYUlucHV0LCBUZXh0QXJlYVdyYXBwZXIgfSBmcm9tICcuL3RleHRBcmVhRWRpdENvbnRleHRJbnB1dC5qcyc7XG5pbXBvcnQgeyBhcmlhTGFiZWxGb3JTY3JlZW5SZWFkZXJDb250ZW50LCBuZXdsaW5lY291bnQsIFNpbXBsZVBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3kgfSBmcm9tICcuLi9zY3JlZW5SZWFkZXJVdGlscy5qcyc7XG5pbXBvcnQgeyBfZGVidWdDb21wb3NpdGlvbiwgSVR5cGVEYXRhLCBUZXh0QXJlYVN0YXRlIH0gZnJvbSAnLi90ZXh0QXJlYUVkaXRDb250ZXh0U3RhdGUuanMnO1xuaW1wb3J0IHsgZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMsIFdvcmRDaGFyYWN0ZXJDbGFzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3dvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLmpzJztcbmltcG9ydCB7IFRleHRBcmVhRWRpdENvbnRleHRSZWdpc3RyeSB9IGZyb20gJy4vdGV4dEFyZWFFZGl0Q29udGV4dFJlZ2lzdHJ5LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJVmlzaWJsZVJhbmdlUHJvdmlkZXIge1xuXHR2aXNpYmxlUmFuZ2VGb3JQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBIb3Jpem9udGFsUG9zaXRpb24gfCBudWxsO1xuXHRsaW5lc1Zpc2libGVSYW5nZXNGb3JSYW5nZShyYW5nZTogUmFuZ2UsIGluY2x1ZGVOZXdMaW5lczogYm9vbGVhbik6IExpbmVWaXNpYmxlUmFuZ2VzW10gfCBudWxsO1xufVxuXG5jbGFzcyBWaXNpYmxlVGV4dEFyZWFEYXRhIHtcblx0X3Zpc2libGVUZXh0QXJlYUJyYW5kOiB2b2lkID0gdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBzdGFydFBvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGwgPSBudWxsO1xuXHRwdWJsaWMgZW5kUG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cblx0cHVibGljIHZpc2libGVUZXh0YXJlYVN0YXJ0OiBIb3Jpem9udGFsUG9zaXRpb24gfCBudWxsID0gbnVsbDtcblx0cHVibGljIHZpc2libGVUZXh0YXJlYUVuZDogSG9yaXpvbnRhbFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cblx0LyoqXG5cdCAqIFdoZW4gZG9pbmcgY29tcG9zaXRpb24sIHRoZSBjdXJyZW50bHkgY29tcG9zZWQgdGV4dCBtaWdodCBiZSBzcGxpdCB1cCBpbnRvXG5cdCAqIG11bHRpcGxlIHRva2VucywgdGhlbiBtZXJnZWQgYWdhaW4gaW50byBhIHNpbmdsZSB0b2tlbiwgZXRjLiBIZXJlIHdlIGF0dGVtcHRcblx0ICogdG8ga2VlcCB0aGUgcHJlc2VudGF0aW9uIG9mIHRoZSA8dGV4dGFyZWE+IHN0YWJsZSBieSB1c2luZyB0aGUgcHJldmlvdXMgdXNlZFxuXHQgKiBzdHlsZSBpZiBtdWx0aXBsZSB0b2tlbnMgY29tZSBpbnRvIHBsYXkuIFRoaXMgYXZvaWRzIGZsaWNrZXJpbmcuXG5cdCAqL1xuXHRwcml2YXRlIF9wcmV2aW91c1ByZXNlbnRhdGlvbjogSVRva2VuUHJlc2VudGF0aW9uIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dDogVmlld0NvbnRleHQsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vZGVsTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBkaXN0YW5jZVRvTW9kZWxMaW5lU3RhcnQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgd2lkdGhPZkhpZGRlbkxpbmVUZXh0QmVmb3JlOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRpc3RhbmNlVG9Nb2RlbExpbmVFbmQ6IG51bWJlcixcblx0KSB7XG5cdH1cblxuXHRwcmVwYXJlUmVuZGVyKHZpc2libGVSYW5nZVByb3ZpZGVyOiBJVmlzaWJsZVJhbmdlUHJvdmlkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBzdGFydE1vZGVsUG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy5tb2RlbExpbmVOdW1iZXIsIHRoaXMuZGlzdGFuY2VUb01vZGVsTGluZVN0YXJ0ICsgMSk7XG5cdFx0Y29uc3QgZW5kTW9kZWxQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLm1vZGVsTGluZU51bWJlciwgdGhpcy5fY29udGV4dC52aWV3TW9kZWwubW9kZWwuZ2V0TGluZU1heENvbHVtbih0aGlzLm1vZGVsTGluZU51bWJlcikgLSB0aGlzLmRpc3RhbmNlVG9Nb2RlbExpbmVFbmQpO1xuXG5cdFx0dGhpcy5zdGFydFBvc2l0aW9uID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihzdGFydE1vZGVsUG9zaXRpb24pO1xuXHRcdHRoaXMuZW5kUG9zaXRpb24gPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKGVuZE1vZGVsUG9zaXRpb24pO1xuXG5cdFx0aWYgKHRoaXMuc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyID09PSB0aGlzLmVuZFBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdHRoaXMudmlzaWJsZVRleHRhcmVhU3RhcnQgPSB2aXNpYmxlUmFuZ2VQcm92aWRlci52aXNpYmxlUmFuZ2VGb3JQb3NpdGlvbih0aGlzLnN0YXJ0UG9zaXRpb24pO1xuXHRcdFx0dGhpcy52aXNpYmxlVGV4dGFyZWFFbmQgPSB2aXNpYmxlUmFuZ2VQcm92aWRlci52aXNpYmxlUmFuZ2VGb3JQb3NpdGlvbih0aGlzLmVuZFBvc2l0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVE9ETzogd2hhdCBpZiB0aGUgdmlldyBwb3NpdGlvbnMgYXJlIG5vdCBvbiB0aGUgc2FtZSBsaW5lP1xuXHRcdFx0dGhpcy52aXNpYmxlVGV4dGFyZWFTdGFydCA9IG51bGw7XG5cdFx0XHR0aGlzLnZpc2libGVUZXh0YXJlYUVuZCA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0ZGVmaW5lUHJlc2VudGF0aW9uKHRva2VuUHJlc2VudGF0aW9uOiBJVG9rZW5QcmVzZW50YXRpb24gfCBudWxsKTogSVRva2VuUHJlc2VudGF0aW9uIHtcblx0XHRpZiAoIXRoaXMuX3ByZXZpb3VzUHJlc2VudGF0aW9uKSB7XG5cdFx0XHQvLyBUbyBhdm9pZCBmbGlja2VyaW5nLCBvbmNlIHNldCwgYWx3YXlzIHJldXNlIGEgcHJlc2VudGF0aW9uIHRocm91Z2hvdXQgdGhlIGVudGlyZSBJTUUgc2Vzc2lvblxuXHRcdFx0aWYgKHRva2VuUHJlc2VudGF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3ByZXZpb3VzUHJlc2VudGF0aW9uID0gdG9rZW5QcmVzZW50YXRpb247XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9wcmV2aW91c1ByZXNlbnRhdGlvbiA9IHtcblx0XHRcdFx0XHRmb3JlZ3JvdW5kOiBDb2xvcklkLkRlZmF1bHRGb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGl0YWxpYzogZmFsc2UsXG5cdFx0XHRcdFx0Ym9sZDogZmFsc2UsXG5cdFx0XHRcdFx0dW5kZXJsaW5lOiBmYWxzZSxcblx0XHRcdFx0XHRzdHJpa2V0aHJvdWdoOiBmYWxzZSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZpb3VzUHJlc2VudGF0aW9uO1xuXHR9XG59XG5cbmNvbnN0IGNhblVzZVplcm9TaXplVGV4dGFyZWEgPSAoYnJvd3Nlci5pc0ZpcmVmb3gpO1xuXG5leHBvcnQgY2xhc3MgVGV4dEFyZWFFZGl0Q29udGV4dCBleHRlbmRzIEFic3RyYWN0RWRpdENvbnRleHQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdDb250cm9sbGVyOiBWaWV3Q29udHJvbGxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJsZVJhbmdlUHJvdmlkZXI6IElWaXNpYmxlUmFuZ2VQcm92aWRlcjtcblx0cHJpdmF0ZSBfc2Nyb2xsTGVmdDogbnVtYmVyO1xuXHRwcml2YXRlIF9zY3JvbGxUb3A6IG51bWJlcjtcblxuXHRwcml2YXRlIF9hY2Nlc3NpYmlsaXR5U3VwcG9ydCE6IEFjY2Vzc2liaWxpdHlTdXBwb3J0O1xuXHRwcml2YXRlIF9hY2Nlc3NpYmlsaXR5UGFnZVNpemUhOiBudW1iZXI7XG5cdHByaXZhdGUgX3RleHRBcmVhV3JhcHBpbmchOiBib29sZWFuO1xuXHRwcml2YXRlIF90ZXh0QXJlYVdpZHRoITogbnVtYmVyO1xuXHRwcml2YXRlIF9jb250ZW50TGVmdDogbnVtYmVyO1xuXHRwcml2YXRlIF9jb250ZW50V2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfY29udGVudEhlaWdodDogbnVtYmVyO1xuXHRwcml2YXRlIF9mb250SW5mbzogRm9udEluZm87XG5cdHByaXZhdGUgX2VtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBEZWZpbmVkIG9ubHkgd2hlbiB0aGUgdGV4dCBhcmVhIGlzIHZpc2libGUgKGNvbXBvc2l0aW9uIGNhc2UpLlxuXHQgKi9cblx0cHJpdmF0ZSBfdmlzaWJsZVRleHRBcmVhOiBWaXNpYmxlVGV4dEFyZWFEYXRhIHwgbnVsbDtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uczogU2VsZWN0aW9uW107XG5cdHByaXZhdGUgX21vZGVsU2VsZWN0aW9uczogU2VsZWN0aW9uW107XG5cblx0LyoqXG5cdCAqIFRoZSBwb3NpdGlvbiBhdCB3aGljaCB0aGUgdGV4dGFyZWEgd2FzIHJlbmRlcmVkLlxuXHQgKiBUaGlzIGlzIHVzZWZ1bCBmb3IgaGl0LXRlc3RpbmcgYW5kIGRldGVybWluaW5nIHRoZSBtb3VzZSBwb3NpdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2xhc3RSZW5kZXJQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsO1xuXG5cdHB1YmxpYyByZWFkb25seSB0ZXh0QXJlYTogRmFzdERvbU5vZGU8SFRNTFRleHRBcmVhRWxlbWVudD47XG5cdHB1YmxpYyByZWFkb25seSB0ZXh0QXJlYUNvdmVyOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RleHRBcmVhSW5wdXQ6IFRleHRBcmVhSW5wdXQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3duZXJJRDogc3RyaW5nLFxuXHRcdGNvbnRleHQ6IFZpZXdDb250ZXh0LFxuXHRcdG92ZXJmbG93R3VhcmRDb250YWluZXI6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pixcblx0XHR2aWV3Q29udHJvbGxlcjogVmlld0NvbnRyb2xsZXIsXG5cdFx0dmlzaWJsZVJhbmdlUHJvdmlkZXI6IElWaXNpYmxlUmFuZ2VQcm92aWRlcixcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRleHQpO1xuXG5cdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIgPSB2aWV3Q29udHJvbGxlcjtcblx0XHR0aGlzLl92aXNpYmxlUmFuZ2VQcm92aWRlciA9IHZpc2libGVSYW5nZVByb3ZpZGVyO1xuXHRcdHRoaXMuX3Njcm9sbExlZnQgPSAwO1xuXHRcdHRoaXMuX3Njcm9sbFRvcCA9IDA7XG5cblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblxuXHRcdHRoaXMuX3NldEFjY2Vzc2liaWxpdHlPcHRpb25zKG9wdGlvbnMpO1xuXHRcdHRoaXMuX2NvbnRlbnRMZWZ0ID0gbGF5b3V0SW5mby5jb250ZW50TGVmdDtcblx0XHR0aGlzLl9jb250ZW50V2lkdGggPSBsYXlvdXRJbmZvLmNvbnRlbnRXaWR0aDtcblx0XHR0aGlzLl9jb250ZW50SGVpZ2h0ID0gbGF5b3V0SW5mby5oZWlnaHQ7XG5cdFx0dGhpcy5fZm9udEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdHRoaXMuX2VtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkKTtcblxuXHRcdHRoaXMuX3Zpc2libGVUZXh0QXJlYSA9IG51bGw7XG5cdFx0dGhpcy5fc2VsZWN0aW9ucyA9IFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXTtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbnMgPSBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV07XG5cdFx0dGhpcy5fbGFzdFJlbmRlclBvc2l0aW9uID0gbnVsbDtcblxuXHRcdC8vIFRleHQgQXJlYSAoVGhlIGZvY3VzIHdpbGwgYWx3YXlzIGJlIGluIHRoZSB0ZXh0YXJlYSB3aGVuIHRoZSBjdXJzb3IgaXMgYmxpbmtpbmcpXG5cdFx0dGhpcy50ZXh0QXJlYSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RleHRhcmVhJykpO1xuXHRcdFBhcnRGaW5nZXJwcmludHMud3JpdGUodGhpcy50ZXh0QXJlYSwgUGFydEZpbmdlcnByaW50LlRleHRBcmVhKTtcblx0XHR0aGlzLnRleHRBcmVhLnNldENsYXNzTmFtZShgaW5wdXRhcmVhICR7TU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUV9YCk7XG5cdFx0dGhpcy50ZXh0QXJlYS5zZXRBdHRyaWJ1dGUoJ3dyYXAnLCB0aGlzLl90ZXh0QXJlYVdyYXBwaW5nICYmICF0aGlzLl92aXNpYmxlVGV4dEFyZWEgPyAnb24nIDogJ29mZicpO1xuXHRcdGNvbnN0IHsgdGFiU2l6ZSB9ID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwubW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdHRoaXMudGV4dEFyZWEuZG9tTm9kZS5zdHlsZS50YWJTaXplID0gYCR7dGFiU2l6ZSAqIHRoaXMuX2ZvbnRJbmZvLnNwYWNlV2lkdGh9cHhgO1xuXHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCdhdXRvY29ycmVjdCcsICdvZmYnKTtcblx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgnYXV0b2NhcGl0YWxpemUnLCAnb2ZmJyk7XG5cdFx0dGhpcy50ZXh0QXJlYS5zZXRBdHRyaWJ1dGUoJ2F1dG9jb21wbGV0ZScsICdvZmYnKTtcblx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgnc3BlbGxjaGVjaycsICdmYWxzZScpO1xuXHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsRm9yU2NyZWVuUmVhZGVyQ29udGVudChvcHRpb25zLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZSkpO1xuXHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLXJlcXVpcmVkJywgb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFyaWFSZXF1aXJlZCkgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCBTdHJpbmcob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnRhYkluZGV4KSkpO1xuXHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3RleHRib3gnKTtcblx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgnYXJpYS1yb2xlZGVzY3JpcHRpb24nLCBubHMubG9jYWxpemUoJ2VkaXRvcicsIFwiZWRpdG9yXCIpKTtcblx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgnYXJpYS1tdWx0aWxpbmUnLCAndHJ1ZScpO1xuXHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLWF1dG9jb21wbGV0ZScsIG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5yZWFkT25seSkgPyAnbm9uZScgOiAnYm90aCcpO1xuXG5cdFx0dGhpcy5fZW5zdXJlUmVhZE9ubHlBdHRyaWJ1dGUoKTtcblxuXHRcdHRoaXMudGV4dEFyZWFDb3ZlciA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHR0aGlzLnRleHRBcmVhQ292ZXIuc2V0UG9zaXRpb24oJ2Fic29sdXRlJyk7XG5cblx0XHRvdmVyZmxvd0d1YXJkQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMudGV4dEFyZWEpO1xuXHRcdG92ZXJmbG93R3VhcmRDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy50ZXh0QXJlYUNvdmVyKTtcblxuXHRcdGNvbnN0IHNpbXBsZVBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3kgPSBuZXcgU2ltcGxlUGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneSgpO1xuXHRcdGNvbnN0IHRleHRBcmVhSW5wdXRIb3N0OiBJVGV4dEFyZWFJbnB1dEhvc3QgPSB7XG5cdFx0XHRjb250ZXh0OiB0aGlzLl9jb250ZXh0LFxuXHRcdFx0Z2V0U2NyZWVuUmVhZGVyQ29udGVudDogKCk6IFRleHRBcmVhU3RhdGUgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fYWNjZXNzaWJpbGl0eVN1cHBvcnQgPT09IEFjY2Vzc2liaWxpdHlTdXBwb3J0LkRpc2FibGVkKSB7XG5cdFx0XHRcdFx0Ly8gV2Uga25vdyBmb3IgYSBmYWN0IHRoYXQgYSBzY3JlZW4gcmVhZGVyIGlzIG5vdCBhdHRhY2hlZFxuXHRcdFx0XHRcdC8vIE9uIE9TWCwgd2Ugd3JpdGUgdGhlIGNoYXJhY3RlciBiZWZvcmUgdGhlIGN1cnNvciB0byBhbGxvdyBmb3IgXCJsb25nLXByZXNzXCIgY29tcG9zaXRpb25cblx0XHRcdFx0XHQvLyBBbHNvIG9uIE9TWCwgd2Ugd3JpdGUgdGhlIHdvcmQgYmVmb3JlIHRoZSBjdXJzb3IgdG8gYWxsb3cgZm9yIHRoZSBBY2Nlc3NpYmlsaXR5IEtleWJvYXJkIHRvIGdpdmUgZ29vZCBoaW50c1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX3NlbGVjdGlvbnNbMF07XG5cdFx0XHRcdFx0aWYgKHBsYXRmb3JtLmlzTWFjaW50b3NoICYmIHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblxuXHRcdFx0XHRcdFx0bGV0IHRleHRCZWZvcmUgPSB0aGlzLl9nZXRXb3JkQmVmb3JlUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0aWYgKHRleHRCZWZvcmUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHRleHRCZWZvcmUgPSB0aGlzLl9nZXRDaGFyYWN0ZXJCZWZvcmVQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICh0ZXh0QmVmb3JlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBUZXh0QXJlYVN0YXRlKHRleHRCZWZvcmUsIHRleHRCZWZvcmUubGVuZ3RoLCB0ZXh0QmVmb3JlLmxlbmd0aCwgUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbiksIDApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBvbiBtYWNPUywgd3JpdGUgY3VycmVudCBzZWxlY3Rpb24gaW50byB0ZXh0YXJlYSB3aWxsIGFsbG93IHN5c3RlbSB0ZXh0IHNlcnZpY2VzIHBpY2sgc2VsZWN0ZWQgdGV4dCxcblx0XHRcdFx0XHQvLyBidXQgd2Ugc3RpbGwgd2FudCB0byBsaW1pdCB0aGUgYW1vdW50IG9mIHRleHQgZ2l2ZW4gQ2hyb21pdW0gaGFuZGxlcyB2ZXJ5IHBvb3JseSB0ZXh0IGV2ZW4gb2YgYSBmZXdcblx0XHRcdFx0XHQvLyB0aG91c2FuZCBjaGFyc1xuXHRcdFx0XHRcdC8vIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjc3OTkpXG5cdFx0XHRcdFx0Y29uc3QgTElNSVRfQ0hBUlMgPSA1MDA7XG5cdFx0XHRcdFx0aWYgKHBsYXRmb3JtLmlzTWFjaW50b3NoICYmICFzZWxlY3Rpb24uaXNFbXB0eSgpICYmIHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShzZWxlY3Rpb24sIEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpIDwgTElNSVRfQ0hBUlMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRleHQgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uLCBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKTtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgVGV4dEFyZWFTdGF0ZSh0ZXh0LCAwLCB0ZXh0Lmxlbmd0aCwgc2VsZWN0aW9uLCAwKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBvbiBTYWZhcmksIGRvY3VtZW50LmV4ZWNDb21tYW5kKCdjdXQnKSBhbmQgZG9jdW1lbnQuZXhlY0NvbW1hbmQoJ2NvcHknKSB3aWxsIGp1c3Qgbm90IHdvcmtcblx0XHRcdFx0XHQvLyBpZiB0aGUgdGV4dGFyZWEgaGFzIG5vIGNvbnRlbnQgc2VsZWN0ZWQuIFNvIGlmIHRoZXJlIGlzIGFuIGVkaXRvciBzZWxlY3Rpb24sIGVuc3VyZSBzb21ldGhpbmdcblx0XHRcdFx0XHQvLyBpcyBzZWxlY3RlZCBpbiB0aGUgdGV4dGFyZWEuXG5cdFx0XHRcdFx0aWYgKGJyb3dzZXIuaXNTYWZhcmkgJiYgIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBsYWNlaG9sZGVyVGV4dCA9ICd2c2NvZGUtcGxhY2Vob2xkZXInO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBUZXh0QXJlYVN0YXRlKHBsYWNlaG9sZGVyVGV4dCwgMCwgcGxhY2Vob2xkZXJUZXh0Lmxlbmd0aCwgbnVsbCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gVGV4dEFyZWFTdGF0ZS5FTVBUWTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChicm93c2VyLmlzQW5kcm9pZCkge1xuXHRcdFx0XHRcdC8vIHdoZW4gdGFwcGluZyBpbiB0aGUgZWRpdG9yIG9uIGEgd29yZCwgQW5kcm9pZCBlbnRlcnMgY29tcG9zaXRpb24gbW9kZS5cblx0XHRcdFx0XHQvLyBpbiB0aGUgYGNvbXBvc2l0aW9uc3RhcnRgIGV2ZW50IHdlIGNhbm5vdCBjbGVhciB0aGUgdGV4dGFyZWEsIGJlY2F1c2Vcblx0XHRcdFx0XHQvLyBpdCB0aGVuIGZvcmdldHMgdG8gZXZlciBzZW5kIGEgYGNvbXBvc2l0aW9uZW5kYC5cblx0XHRcdFx0XHQvLyB3ZSB0aGVyZWZvcmUgb25seSB3cml0ZSB0aGUgY3VycmVudCB3b3JkIGluIHRoZSB0ZXh0YXJlYVxuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX3NlbGVjdGlvbnNbMF07XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdFx0XHRcdGNvbnN0IFt3b3JkQXRQb3NpdGlvbiwgcG9zaXRpb25PZmZzZXRJbldvcmRdID0gdGhpcy5fZ2V0QW5kcm9pZFdvcmRBdFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdFx0XHRcdGlmICh3b3JkQXRQb3NpdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBuZXcgVGV4dEFyZWFTdGF0ZSh3b3JkQXRQb3NpdGlvbiwgcG9zaXRpb25PZmZzZXRJbldvcmQsIHBvc2l0aW9uT2Zmc2V0SW5Xb3JkLCBSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKSwgMCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBUZXh0QXJlYVN0YXRlLkVNUFRZO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2NyZWVuUmVhZGVyQ29udGVudFN0YXRlID0gc2ltcGxlUGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneS5mcm9tRWRpdG9yU2VsZWN0aW9uKHRoaXMuX2NvbnRleHQudmlld01vZGVsLCB0aGlzLl9zZWxlY3Rpb25zWzBdLCB0aGlzLl9hY2Nlc3NpYmlsaXR5UGFnZVNpemUsIHRoaXMuX2FjY2Vzc2liaWxpdHlTdXBwb3J0ID09PSBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5Vbmtub3duKTtcblx0XHRcdFx0cmV0dXJuIFRleHRBcmVhU3RhdGUuZnJvbVNjcmVlblJlYWRlckNvbnRlbnRTdGF0ZShzY3JlZW5SZWFkZXJDb250ZW50U3RhdGUpO1xuXHRcdFx0fSxcblxuXHRcdFx0ZGVkdWNlTW9kZWxQb3NpdGlvbjogKHZpZXdBbmNob3JQb3NpdGlvbjogUG9zaXRpb24sIGRlbHRhT2Zmc2V0OiBudW1iZXIsIGxpbmVGZWVkQ250OiBudW1iZXIpOiBQb3NpdGlvbiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5kZWR1Y2VNb2RlbFBvc2l0aW9uUmVsYXRpdmVUb1ZpZXdQb3NpdGlvbih2aWV3QW5jaG9yUG9zaXRpb24sIGRlbHRhT2Zmc2V0LCBsaW5lRmVlZENudCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRleHRBcmVhV3JhcHBlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXh0QXJlYVdyYXBwZXIodGhpcy50ZXh0QXJlYS5kb21Ob2RlKSk7XG5cdFx0dGhpcy5fdGV4dEFyZWFJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRBcmVhSW5wdXQsIHRleHRBcmVhSW5wdXRIb3N0LCB0ZXh0QXJlYVdyYXBwZXIsIHBsYXRmb3JtLk9TLCB7XG5cdFx0XHRpc0FuZHJvaWQ6IGJyb3dzZXIuaXNBbmRyb2lkLFxuXHRcdFx0aXNDaHJvbWU6IGJyb3dzZXIuaXNDaHJvbWUsXG5cdFx0XHRpc0ZpcmVmb3g6IGJyb3dzZXIuaXNGaXJlZm94LFxuXHRcdFx0aXNTYWZhcmk6IGJyb3dzZXIuaXNTYWZhcmksXG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVsYXkgY2xpcGJvYXJkIGV2ZW50cyBmcm9tIFRleHRBcmVhSW5wdXRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYUlucHV0Lm9uV2lsbENvcHkoZSA9PiB0aGlzLl9vbldpbGxDb3B5LmZpcmUoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYUlucHV0Lm9uV2lsbEN1dChlID0+IHRoaXMuX29uV2lsbEN1dC5maXJlKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGV4dEFyZWFJbnB1dC5vbldpbGxQYXN0ZShlID0+IHRoaXMuX29uV2lsbFBhc3RlLmZpcmUoZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhSW5wdXQub25LZXlEb3duKChlOiBJS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuZW1pdEtleURvd24oZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGV4dEFyZWFJbnB1dC5vbktleVVwKChlOiBJS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuZW1pdEtleVVwKGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhSW5wdXQub25QYXN0ZSgoZTogSVBhc3RlRGF0YSkgPT4ge1xuXHRcdFx0bGV0IHBhc3RlT25OZXdMaW5lID0gZmFsc2U7XG5cdFx0XHRsZXQgbXVsdGljdXJzb3JUZXh0OiBzdHJpbmdbXSB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IG1vZGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0aWYgKGUubWV0YWRhdGEpIHtcblx0XHRcdFx0cGFzdGVPbk5ld0xpbmUgPSAodGhpcy5fZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQgJiYgISFlLm1ldGFkYXRhLmlzRnJvbUVtcHR5U2VsZWN0aW9uKTtcblx0XHRcdFx0bXVsdGljdXJzb3JUZXh0ID0gKHR5cGVvZiBlLm1ldGFkYXRhLm11bHRpY3Vyc29yVGV4dCAhPT0gJ3VuZGVmaW5lZCcgPyBlLm1ldGFkYXRhLm11bHRpY3Vyc29yVGV4dCA6IG51bGwpO1xuXHRcdFx0XHRtb2RlID0gZS5tZXRhZGF0YS5tb2RlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIucGFzdGUoZS50ZXh0LCBwYXN0ZU9uTmV3TGluZSwgbXVsdGljdXJzb3JUZXh0LCBtb2RlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYUlucHV0Lm9uQ3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3ZpZXdDb250cm9sbGVyLmN1dCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhSW5wdXQub25UeXBlKChlOiBJVHlwZURhdGEpID0+IHtcblx0XHRcdGlmIChlLnJlcGxhY2VQcmV2Q2hhckNudCB8fCBlLnJlcGxhY2VOZXh0Q2hhckNudCB8fCBlLnBvc2l0aW9uRGVsdGEpIHtcblx0XHRcdFx0Ly8gbXVzdCBiZSBoYW5kbGVkIHRocm91Z2ggdGhlIG5ldyBjb21tYW5kXG5cdFx0XHRcdGlmIChfZGVidWdDb21wb3NpdGlvbikge1xuXHRcdFx0XHRcdGNvbnNvbGUubG9nKGAgPT4gY29tcG9zaXRpb25UeXBlOiA8PCR7ZS50ZXh0fT4+LCAke2UucmVwbGFjZVByZXZDaGFyQ250fSwgJHtlLnJlcGxhY2VOZXh0Q2hhckNudH0sICR7ZS5wb3NpdGlvbkRlbHRhfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3ZpZXdDb250cm9sbGVyLmNvbXBvc2l0aW9uVHlwZShlLnRleHQsIGUucmVwbGFjZVByZXZDaGFyQ250LCBlLnJlcGxhY2VOZXh0Q2hhckNudCwgZS5wb3NpdGlvbkRlbHRhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChfZGVidWdDb21wb3NpdGlvbikge1xuXHRcdFx0XHRcdGNvbnNvbGUubG9nKGAgPT4gdHlwZTogPDwke2UudGV4dH0+PmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3ZpZXdDb250cm9sbGVyLnR5cGUoZS50ZXh0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYUlucHV0Lm9uU2VsZWN0aW9uQ2hhbmdlUmVxdWVzdCgobW9kZWxTZWxlY3Rpb246IFNlbGVjdGlvbikgPT4ge1xuXHRcdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuc2V0U2VsZWN0aW9uKG1vZGVsU2VsZWN0aW9uKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYUlucHV0Lm9uQ29tcG9zaXRpb25TdGFydCgoZSkgPT4ge1xuXG5cdFx0XHQvLyBUaGUgdGV4dGFyZWEgbWlnaHQgY29udGFpbiBzb21lIGNvbnRlbnQgd2hlbiBjb21wb3NpdGlvbiBzdGFydHMuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gV2hlbiB3ZSBtYWtlIHRoZSB0ZXh0YXJlYSB2aXNpYmxlLCBpdCBhbHdheXMgaGFzIGEgaGVpZ2h0IG9mIDEgbGluZSxcblx0XHRcdC8vIHNvIHdlIGRvbid0IG5lZWQgdG8gd29ycnkgdG9vIG11Y2ggYWJvdXQgY29udGVudCBvbiBsaW5lcyBhYm92ZSBvciBiZWxvd1xuXHRcdFx0Ly8gdGhlIHNlbGVjdGlvbi5cblx0XHRcdC8vXG5cdFx0XHQvLyBIb3dldmVyLCB0aGUgdGV4dCBvbiB0aGUgY3VycmVudCBsaW5lIG5lZWRzIHRvIGJlIG1hZGUgdmlzaWJsZSBiZWNhdXNlXG5cdFx0XHQvLyBzb21lIElNRSBtZXRob2RzIGFsbG93IHRvIG1vdmUgdG8gb3RoZXIgZ2x5cGhzIG9uIHRoZSBjdXJyZW50IGxpbmVcblx0XHRcdC8vIChieSBwcmVzc2luZyBhcnJvdyBrZXlzKS5cblx0XHRcdC8vXG5cdFx0XHQvLyAoMSkgVGhlIHRleHRhcmVhIG1pZ2h0IGNvbnRhaW4gb25seSBzb21lIHBhcnRzIG9mIHRoZSBjdXJyZW50IGxpbmUsXG5cdFx0XHQvLyBsaWtlIHRoZSB3b3JkIGJlZm9yZSB0aGUgc2VsZWN0aW9uLiBBbHNvLCB0aGUgY29udGVudCBpbnNpZGUgdGhlIHRleHRhcmVhXG5cdFx0XHQvLyBjYW4gZ3JvdyBvciBzaHJpbmsgYXMgY29tcG9zaXRpb24gb2NjdXJzLiBXZSB0aGVyZWZvcmUgYW5jaG9yIHRoZSB0ZXh0YXJlYVxuXHRcdFx0Ly8gaW4gdGVybXMgb2YgZGlzdGFuY2UgdG8gYSBjZXJ0YWluIGxpbmUgc3RhcnQgYW5kIGxpbmUgZW5kLlxuXHRcdFx0Ly9cblx0XHRcdC8vICgyKSBBbHNvLCB3ZSBzaG91bGQgbm90IG1ha2UgXFx0IGNoYXJhY3RlcnMgdmlzaWJsZSwgYmVjYXVzZSB0aGVpciByZW5kZXJpbmdcblx0XHRcdC8vIGluc2lkZSB0aGUgPHRleHRhcmVhPiB3aWxsIG5vdCBhbGlnbiBuaWNlbHkgd2l0aCBvdXIgcmVuZGVyaW5nLiBXZSB0aGVyZWZvcmVcblx0XHRcdC8vIHdpbGwgaGlkZSAoaWYgbmVjZXNzYXJ5KSBzb21lIG9mIHRoZSBsZWFkaW5nIHRleHQgb24gdGhlIGN1cnJlbnQgbGluZS5cblxuXHRcdFx0Y29uc3QgdGEgPSB0aGlzLnRleHRBcmVhLmRvbU5vZGU7XG5cdFx0XHRjb25zdCBtb2RlbFNlbGVjdGlvbiA9IHRoaXMuX21vZGVsU2VsZWN0aW9uc1swXTtcblxuXHRcdFx0Y29uc3QgeyBkaXN0YW5jZVRvTW9kZWxMaW5lU3RhcnQsIHdpZHRoT2ZIaWRkZW5UZXh0QmVmb3JlIH0gPSAoKCkgPT4ge1xuXHRcdFx0XHQvLyBGaW5kIHRoZSB0ZXh0IHRoYXQgaXMgb24gdGhlIGN1cnJlbnQgbGluZSBiZWZvcmUgdGhlIHNlbGVjdGlvblxuXHRcdFx0XHRjb25zdCB0ZXh0QmVmb3JlU2VsZWN0aW9uID0gdGEudmFsdWUuc3Vic3RyaW5nKDAsIE1hdGgubWluKHRhLnNlbGVjdGlvblN0YXJ0LCB0YS5zZWxlY3Rpb25FbmQpKTtcblx0XHRcdFx0Y29uc3QgbGluZUZlZWRPZmZzZXQxID0gdGV4dEJlZm9yZVNlbGVjdGlvbi5sYXN0SW5kZXhPZignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IGxpbmVUZXh0QmVmb3JlU2VsZWN0aW9uID0gdGV4dEJlZm9yZVNlbGVjdGlvbi5zdWJzdHJpbmcobGluZUZlZWRPZmZzZXQxICsgMSk7XG5cblx0XHRcdFx0Ly8gV2Ugbm93IHNlYXJjaCB0byBzZWUgaWYgd2Ugc2hvdWxkIGhpZGUgc29tZSBwYXJ0IG9mIGl0IChpZiBpdCBjb250YWlucyBcXHQpXG5cdFx0XHRcdGNvbnN0IHRhYk9mZnNldDEgPSBsaW5lVGV4dEJlZm9yZVNlbGVjdGlvbi5sYXN0SW5kZXhPZignXFx0Jyk7XG5cdFx0XHRcdGNvbnN0IGRlc2lyZWRWaXNpYmxlQmVmb3JlQ2hhckNvdW50ID0gbGluZVRleHRCZWZvcmVTZWxlY3Rpb24ubGVuZ3RoIC0gdGFiT2Zmc2V0MSAtIDE7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0TW9kZWxQb3NpdGlvbiA9IG1vZGVsU2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdFx0Y29uc3QgdmlzaWJsZUJlZm9yZUNoYXJDb3VudCA9IE1hdGgubWluKHN0YXJ0TW9kZWxQb3NpdGlvbi5jb2x1bW4gLSAxLCBkZXNpcmVkVmlzaWJsZUJlZm9yZUNoYXJDb3VudCk7XG5cdFx0XHRcdGNvbnN0IGRpc3RhbmNlVG9Nb2RlbExpbmVTdGFydCA9IHN0YXJ0TW9kZWxQb3NpdGlvbi5jb2x1bW4gLSAxIC0gdmlzaWJsZUJlZm9yZUNoYXJDb3VudDtcblx0XHRcdFx0Y29uc3QgaGlkZGVuTGluZVRleHRCZWZvcmUgPSBsaW5lVGV4dEJlZm9yZVNlbGVjdGlvbi5zdWJzdHJpbmcoMCwgbGluZVRleHRCZWZvcmVTZWxlY3Rpb24ubGVuZ3RoIC0gdmlzaWJsZUJlZm9yZUNoYXJDb3VudCk7XG5cdFx0XHRcdGNvbnN0IHsgdGFiU2l6ZSB9ID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwubW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdFx0XHRjb25zdCB3aWR0aE9mSGlkZGVuVGV4dEJlZm9yZSA9IG1lYXN1cmVUZXh0KHRoaXMudGV4dEFyZWEuZG9tTm9kZS5vd25lckRvY3VtZW50LCBoaWRkZW5MaW5lVGV4dEJlZm9yZSwgdGhpcy5fZm9udEluZm8sIHRhYlNpemUpO1xuXG5cdFx0XHRcdHJldHVybiB7IGRpc3RhbmNlVG9Nb2RlbExpbmVTdGFydCwgd2lkdGhPZkhpZGRlblRleHRCZWZvcmUgfTtcblx0XHRcdH0pKCk7XG5cblx0XHRcdGNvbnN0IHsgZGlzdGFuY2VUb01vZGVsTGluZUVuZCB9ID0gKCgpID0+IHtcblx0XHRcdFx0Ly8gRmluZCB0aGUgdGV4dCB0aGF0IGlzIG9uIHRoZSBjdXJyZW50IGxpbmUgYWZ0ZXIgdGhlIHNlbGVjdGlvblxuXHRcdFx0XHRjb25zdCB0ZXh0QWZ0ZXJTZWxlY3Rpb24gPSB0YS52YWx1ZS5zdWJzdHJpbmcoTWF0aC5tYXgodGEuc2VsZWN0aW9uU3RhcnQsIHRhLnNlbGVjdGlvbkVuZCkpO1xuXHRcdFx0XHRjb25zdCBsaW5lRmVlZE9mZnNldDIgPSB0ZXh0QWZ0ZXJTZWxlY3Rpb24uaW5kZXhPZignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IGxpbmVUZXh0QWZ0ZXJTZWxlY3Rpb24gPSBsaW5lRmVlZE9mZnNldDIgPT09IC0xID8gdGV4dEFmdGVyU2VsZWN0aW9uIDogdGV4dEFmdGVyU2VsZWN0aW9uLnN1YnN0cmluZygwLCBsaW5lRmVlZE9mZnNldDIpO1xuXG5cdFx0XHRcdGNvbnN0IHRhYk9mZnNldDIgPSBsaW5lVGV4dEFmdGVyU2VsZWN0aW9uLmluZGV4T2YoJ1xcdCcpO1xuXHRcdFx0XHRjb25zdCBkZXNpcmVkVmlzaWJsZUFmdGVyQ2hhckNvdW50ID0gKHRhYk9mZnNldDIgPT09IC0xID8gbGluZVRleHRBZnRlclNlbGVjdGlvbi5sZW5ndGggOiBsaW5lVGV4dEFmdGVyU2VsZWN0aW9uLmxlbmd0aCAtIHRhYk9mZnNldDIgLSAxKTtcblx0XHRcdFx0Y29uc3QgZW5kTW9kZWxQb3NpdGlvbiA9IG1vZGVsU2VsZWN0aW9uLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IHZpc2libGVBZnRlckNoYXJDb3VudCA9IE1hdGgubWluKHRoaXMuX2NvbnRleHQudmlld01vZGVsLm1vZGVsLmdldExpbmVNYXhDb2x1bW4oZW5kTW9kZWxQb3NpdGlvbi5saW5lTnVtYmVyKSAtIGVuZE1vZGVsUG9zaXRpb24uY29sdW1uLCBkZXNpcmVkVmlzaWJsZUFmdGVyQ2hhckNvdW50KTtcblx0XHRcdFx0Y29uc3QgZGlzdGFuY2VUb01vZGVsTGluZUVuZCA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLm1vZGVsLmdldExpbmVNYXhDb2x1bW4oZW5kTW9kZWxQb3NpdGlvbi5saW5lTnVtYmVyKSAtIGVuZE1vZGVsUG9zaXRpb24uY29sdW1uIC0gdmlzaWJsZUFmdGVyQ2hhckNvdW50O1xuXG5cdFx0XHRcdHJldHVybiB7IGRpc3RhbmNlVG9Nb2RlbExpbmVFbmQgfTtcblx0XHRcdH0pKCk7XG5cblx0XHRcdC8vIFNjcm9sbCB0byByZXZlYWwgdGhlIGxvY2F0aW9uIGluIHRoZSBlZGl0b3Igd2hlcmUgY29tcG9zaXRpb24gb2NjdXJzXG5cdFx0XHR0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5yZXZlYWxSYW5nZShcblx0XHRcdFx0J2tleWJvYXJkJyxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0UmFuZ2UuZnJvbVBvc2l0aW9ucyh0aGlzLl9zZWxlY3Rpb25zWzBdLmdldFN0YXJ0UG9zaXRpb24oKSksXG5cdFx0XHRcdHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSxcblx0XHRcdFx0U2Nyb2xsVHlwZS5JbW1lZGlhdGVcblx0XHRcdCk7XG5cblx0XHRcdHRoaXMuX3Zpc2libGVUZXh0QXJlYSA9IG5ldyBWaXNpYmxlVGV4dEFyZWFEYXRhKFxuXHRcdFx0XHR0aGlzLl9jb250ZXh0LFxuXHRcdFx0XHRtb2RlbFNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdGRpc3RhbmNlVG9Nb2RlbExpbmVTdGFydCxcblx0XHRcdFx0d2lkdGhPZkhpZGRlblRleHRCZWZvcmUsXG5cdFx0XHRcdGRpc3RhbmNlVG9Nb2RlbExpbmVFbmQsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBXZSB0dXJuIG9mZiB3cmFwcGluZyBpZiB0aGUgPHRleHRhcmVhPiBiZWNvbWVzIHZpc2libGUgZm9yIGNvbXBvc2l0aW9uXG5cdFx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgnd3JhcCcsIHRoaXMuX3RleHRBcmVhV3JhcHBpbmcgJiYgIXRoaXMuX3Zpc2libGVUZXh0QXJlYSA/ICdvbicgOiAnb2ZmJyk7XG5cblx0XHRcdHRoaXMuX3Zpc2libGVUZXh0QXJlYS5wcmVwYXJlUmVuZGVyKHRoaXMuX3Zpc2libGVSYW5nZVByb3ZpZGVyKTtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXG5cdFx0XHQvLyBTaG93IHRoZSB0ZXh0YXJlYVxuXHRcdFx0dGhpcy50ZXh0QXJlYS5zZXRDbGFzc05hbWUoYGlucHV0YXJlYSAke01PVVNFX0NVUlNPUl9URVhUX0NTU19DTEFTU19OQU1FfSBpbWUtaW5wdXRgKTtcblxuXHRcdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuY29tcG9zaXRpb25TdGFydCgpO1xuXHRcdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwub25Db21wb3NpdGlvblN0YXJ0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGV4dEFyZWFJbnB1dC5vbkNvbXBvc2l0aW9uVXBkYXRlKChlOiBJQ29tcG9zaXRpb25EYXRhKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3Zpc2libGVUZXh0QXJlYSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3Zpc2libGVUZXh0QXJlYS5wcmVwYXJlUmVuZGVyKHRoaXMuX3Zpc2libGVSYW5nZVByb3ZpZGVyKTtcblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhSW5wdXQub25Db21wb3NpdGlvbkVuZCgoKSA9PiB7XG5cblx0XHRcdHRoaXMuX3Zpc2libGVUZXh0QXJlYSA9IG51bGw7XG5cblx0XHRcdC8vIFdlIHR1cm4gb24gd3JhcHBpbmcgYXMgbmVjZXNzYXJ5IGlmIHRoZSA8dGV4dGFyZWE+IGhpZGVzIGFmdGVyIGNvbXBvc2l0aW9uXG5cdFx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgnd3JhcCcsIHRoaXMuX3RleHRBcmVhV3JhcHBpbmcgJiYgIXRoaXMuX3Zpc2libGVUZXh0QXJlYSA/ICdvbicgOiAnb2ZmJyk7XG5cblx0XHRcdHRoaXMuX3JlbmRlcigpO1xuXG5cdFx0XHR0aGlzLnRleHRBcmVhLnNldENsYXNzTmFtZShgaW5wdXRhcmVhICR7TU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUV9YCk7XG5cdFx0XHR0aGlzLl92aWV3Q29udHJvbGxlci5jb21wb3NpdGlvbkVuZCgpO1xuXHRcdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwub25Db21wb3NpdGlvbkVuZCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RleHRBcmVhSW5wdXQub25Gb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5zZXRIYXNGb2N1cyh0cnVlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXh0QXJlYUlucHV0Lm9uQmx1cigoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5zZXRIYXNGb2N1cyhmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoSU1FLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2Vuc3VyZVJlYWRPbmx5QXR0cmlidXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoVGV4dEFyZWFFZGl0Q29udGV4dFJlZ2lzdHJ5LnJlZ2lzdGVyKG93bmVySUQsIHRoaXMpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZG9tTm9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy50ZXh0QXJlYTtcblx0fVxuXG5cdHB1YmxpYyB3cml0ZVNjcmVlblJlYWRlckNvbnRlbnQocmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXh0QXJlYUlucHV0LndyaXRlTmF0aXZlVGV4dEFyZWFDb250ZW50KHJlYXNvbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VGV4dEFyZWFEb21Ob2RlKCk6IEhUTUxUZXh0QXJlYUVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLnRleHRBcmVhLmRvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy50ZXh0QXJlYS5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdHRoaXMudGV4dEFyZWFDb3Zlci5kb21Ob2RlLnJlbW92ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QW5kcm9pZFdvcmRBdFBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IFtzdHJpbmcsIG51bWJlcl0ge1xuXHRcdGlmIChwb3NpdGlvbi5saW5lTnVtYmVyID4gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHJldHVybiBbJycsIDBdO1xuXHRcdH1cblx0XHRjb25zdCBBTkRST0lEX1dPUkRfU0VQQVJBVE9SUyA9ICdgfiFAIyQlXiYqKCktPStbe119XFxcXHw7OlwiLC48Pi8/Jztcblx0XHRjb25zdCBsaW5lQ29udGVudCA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoQU5EUk9JRF9XT1JEX1NFUEFSQVRPUlMsIFtdKTtcblxuXHRcdGxldCBnb2luZ0xlZnQgPSB0cnVlO1xuXHRcdGxldCBzdGFydENvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbjtcblx0XHRsZXQgZ29pbmdSaWdodCA9IHRydWU7XG5cdFx0bGV0IGVuZENvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbjtcblx0XHRsZXQgZGlzdGFuY2UgPSAwO1xuXHRcdHdoaWxlIChkaXN0YW5jZSA8IDUwICYmIChnb2luZ0xlZnQgfHwgZ29pbmdSaWdodCkpIHtcblx0XHRcdGlmIChnb2luZ0xlZnQgJiYgc3RhcnRDb2x1bW4gPD0gMSkge1xuXHRcdFx0XHRnb2luZ0xlZnQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChnb2luZ0xlZnQpIHtcblx0XHRcdFx0Y29uc3QgY2hhckNvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KHN0YXJ0Q29sdW1uIC0gMik7XG5cdFx0XHRcdGNvbnN0IGNoYXJDbGFzcyA9IHdvcmRTZXBhcmF0b3JzLmdldChjaGFyQ29kZSk7XG5cdFx0XHRcdGlmIChjaGFyQ2xhc3MgIT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5SZWd1bGFyKSB7XG5cdFx0XHRcdFx0Z29pbmdMZWZ0ID0gZmFsc2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3RhcnRDb2x1bW4tLTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGdvaW5nUmlnaHQgJiYgZW5kQ29sdW1uID4gbGluZUNvbnRlbnQubGVuZ3RoKSB7XG5cdFx0XHRcdGdvaW5nUmlnaHQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChnb2luZ1JpZ2h0KSB7XG5cdFx0XHRcdGNvbnN0IGNoYXJDb2RlID0gbGluZUNvbnRlbnQuY2hhckNvZGVBdChlbmRDb2x1bW4gLSAxKTtcblx0XHRcdFx0Y29uc3QgY2hhckNsYXNzID0gd29yZFNlcGFyYXRvcnMuZ2V0KGNoYXJDb2RlKTtcblx0XHRcdFx0aWYgKGNoYXJDbGFzcyAhPT0gV29yZENoYXJhY3RlckNsYXNzLlJlZ3VsYXIpIHtcblx0XHRcdFx0XHRnb2luZ1JpZ2h0ID0gZmFsc2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW5kQ29sdW1uKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGRpc3RhbmNlKys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtsaW5lQ29udGVudC5zdWJzdHJpbmcoc3RhcnRDb2x1bW4gLSAxLCBlbmRDb2x1bW4gLSAxKSwgcG9zaXRpb24uY29sdW1uIC0gc3RhcnRDb2x1bW5dO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0V29yZEJlZm9yZVBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IHN0cmluZyB7XG5cdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPiB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lQ29udGVudCA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnModGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycyksIFtdKTtcblxuXHRcdGxldCBjb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cdFx0bGV0IGRpc3RhbmNlID0gMDtcblx0XHR3aGlsZSAoY29sdW1uID4gMSkge1xuXHRcdFx0Y29uc3QgY2hhckNvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGNvbHVtbiAtIDIpO1xuXHRcdFx0Y29uc3QgY2hhckNsYXNzID0gd29yZFNlcGFyYXRvcnMuZ2V0KGNoYXJDb2RlKTtcblx0XHRcdGlmIChjaGFyQ2xhc3MgIT09IFdvcmRDaGFyYWN0ZXJDbGFzcy5SZWd1bGFyIHx8IGRpc3RhbmNlID4gNTApIHtcblx0XHRcdFx0cmV0dXJuIGxpbmVDb250ZW50LnN1YnN0cmluZyhjb2x1bW4gLSAxLCBwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0XHRcdH1cblx0XHRcdGRpc3RhbmNlKys7XG5cdFx0XHRjb2x1bW4tLTtcblx0XHR9XG5cdFx0cmV0dXJuIGxpbmVDb250ZW50LnN1YnN0cmluZygwLCBwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENoYXJhY3RlckJlZm9yZVBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IHN0cmluZyB7XG5cdFx0aWYgKHBvc2l0aW9uLmNvbHVtbiA+IDEpIHtcblx0XHRcdGlmIChwb3NpdGlvbi5saW5lTnVtYmVyID4gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGNoYXJCZWZvcmUgPSBsaW5lQ29udGVudC5jaGFyQXQocG9zaXRpb24uY29sdW1uIC0gMik7XG5cdFx0XHRpZiAoIXN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJCZWZvcmUuY2hhckNvZGVBdCgwKSkpIHtcblx0XHRcdFx0cmV0dXJuIGNoYXJCZWZvcmU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByaXZhdGUgX3NldEFjY2Vzc2liaWxpdHlPcHRpb25zKG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U3VwcG9ydCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5U3VwcG9ydCk7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVBhZ2VTaXplID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFjY2Vzc2liaWxpdHlQYWdlU2l6ZSk7XG5cdFx0aWYgKHRoaXMuX2FjY2Vzc2liaWxpdHlTdXBwb3J0ID09PSBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5FbmFibGVkICYmIGFjY2Vzc2liaWxpdHlQYWdlU2l6ZSA9PT0gRWRpdG9yT3B0aW9ucy5hY2Nlc3NpYmlsaXR5UGFnZVNpemUuZGVmYXVsdFZhbHVlKSB7XG5cdFx0XHQvLyBJZiBhIHNjcmVlbiByZWFkZXIgaXMgYXR0YWNoZWQgYW5kIHRoZSBkZWZhdWx0IHZhbHVlIGlzIG5vdCBzZXQgd2Ugc2hvdWxkIGF1dG9tYXRpY2FsbHkgaW5jcmVhc2UgdGhlIHBhZ2Ugc2l6ZSB0byA1MDAgZm9yIGEgYmV0dGVyIGV4cGVyaWVuY2Vcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlQYWdlU2l6ZSA9IDUwMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVBhZ2VTaXplID0gYWNjZXNzaWJpbGl0eVBhZ2VTaXplO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gd3JhcHBpbmcgaXMgZW5hYmxlZCBhbmQgYSBzY3JlZW4gcmVhZGVyIG1pZ2h0IGJlIGF0dGFjaGVkLFxuXHRcdC8vIHdlIHdpbGwgc2l6ZSB0aGUgdGV4dGFyZWEgdG8gbWF0Y2ggdGhlIHdpZHRoIHVzZWQgZm9yIHdyYXBwaW5nIHBvaW50cyBjb21wdXRhdGlvbiAoc2VlIGBkb21MaW5lQnJlYWtzQ29tcHV0ZXIudHNgKS5cblx0XHQvLyBUaGlzIGlzIGJlY2F1c2Ugc2NyZWVuIHJlYWRlcnMgd2lsbCByZWFkIHRoZSB0ZXh0IGluIHRoZSB0ZXh0YXJlYSBhbmQgd2UnZCBsaWtlIHRoYXQgdGhlXG5cdFx0Ly8gd3JhcHBpbmcgcG9pbnRzIGluIHRoZSB0ZXh0YXJlYSBtYXRjaCB0aGUgd3JhcHBpbmcgcG9pbnRzIGluIHRoZSBlZGl0b3IuXG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRjb25zdCB3cmFwcGluZ0NvbHVtbiA9IGxheW91dEluZm8ud3JhcHBpbmdDb2x1bW47XG5cdFx0aWYgKHdyYXBwaW5nQ29sdW1uICE9PSAtMSAmJiB0aGlzLl9hY2Nlc3NpYmlsaXR5U3VwcG9ydCAhPT0gQWNjZXNzaWJpbGl0eVN1cHBvcnQuRGlzYWJsZWQpIHtcblx0XHRcdGNvbnN0IGZvbnRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRcdHRoaXMuX3RleHRBcmVhV3JhcHBpbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy5fdGV4dEFyZWFXaWR0aCA9IE1hdGgucm91bmQod3JhcHBpbmdDb2x1bW4gKiBmb250SW5mby50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90ZXh0QXJlYVdyYXBwaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl90ZXh0QXJlYVdpZHRoID0gKGNhblVzZVplcm9TaXplVGV4dGFyZWEgPyAwIDogMSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIGJlZ2luIGV2ZW50IGhhbmRsZXJzXG5cblx0cHVibGljIG92ZXJyaWRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXG5cdFx0dGhpcy5fc2V0QWNjZXNzaWJpbGl0eU9wdGlvbnMob3B0aW9ucyk7XG5cdFx0dGhpcy5fY29udGVudExlZnQgPSBsYXlvdXRJbmZvLmNvbnRlbnRMZWZ0O1xuXHRcdHRoaXMuX2NvbnRlbnRXaWR0aCA9IGxheW91dEluZm8uY29udGVudFdpZHRoO1xuXHRcdHRoaXMuX2NvbnRlbnRIZWlnaHQgPSBsYXlvdXRJbmZvLmhlaWdodDtcblx0XHR0aGlzLl9mb250SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0dGhpcy5fZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQpO1xuXHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCd3cmFwJywgdGhpcy5fdGV4dEFyZWFXcmFwcGluZyAmJiAhdGhpcy5fdmlzaWJsZVRleHRBcmVhID8gJ29uJyA6ICdvZmYnKTtcblx0XHRjb25zdCB7IHRhYlNpemUgfSA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLm1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHR0aGlzLnRleHRBcmVhLmRvbU5vZGUuc3R5bGUudGFiU2l6ZSA9IGAke3RhYlNpemUgKiB0aGlzLl9mb250SW5mby5zcGFjZVdpZHRofXB4YDtcblx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbEZvclNjcmVlblJlYWRlckNvbnRlbnQob3B0aW9ucywgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UpKTtcblx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgnYXJpYS1yZXF1aXJlZCcsIG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5hcmlhUmVxdWlyZWQpID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0dGhpcy50ZXh0QXJlYS5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgU3RyaW5nKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi50YWJJbmRleCkpKTtcblxuXHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmRvbVJlYWRPbmx5KSB8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSkge1xuXHRcdFx0dGhpcy5fZW5zdXJlUmVhZE9ubHlBdHRyaWJ1dGUoKTtcblx0XHR9XG5cblx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5U3VwcG9ydCkpIHtcblx0XHRcdHRoaXMuX3RleHRBcmVhSW5wdXQud3JpdGVOYXRpdmVUZXh0QXJlYUNvbnRlbnQoJ3N0cmF0ZWd5IGNoYW5nZWQnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25DdXJzb3JTdGF0ZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9zZWxlY3Rpb25zID0gZS5zZWxlY3Rpb25zLnNsaWNlKDApO1xuXHRcdHRoaXMuX21vZGVsU2VsZWN0aW9ucyA9IGUubW9kZWxTZWxlY3Rpb25zLnNsaWNlKDApO1xuXHRcdC8vIFdlIG11c3QgdXBkYXRlIHRoZSA8dGV4dGFyZWE+IHN5bmNocm9ub3VzbHksIG90aGVyd2lzZSBsb25nIHByZXNzIElNRSBvbiBtYWNvcyBicmVha3MuXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNjU4MjFcblx0XHR0aGlzLl90ZXh0QXJlYUlucHV0LndyaXRlTmF0aXZlVGV4dEFyZWFDb250ZW50KCdzZWxlY3Rpb24gY2hhbmdlZCcpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkRlY29yYXRpb25zQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdC8vIHRydWUgZm9yIGlubGluZSBkZWNvcmF0aW9ucyB0aGF0IGNhbiBlbmQgdXAgcmVsYXlvdXRpbmcgdGV4dFxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkZsdXNoZWQoZTogdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNEZWxldGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNJbnNlcnRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25TY3JvbGxDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1Njcm9sbENoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX3Njcm9sbExlZnQgPSBlLnNjcm9sbExlZnQ7XG5cdFx0dGhpcy5fc2Nyb2xsVG9wID0gZS5zY3JvbGxUb3A7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uWm9uZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1pvbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyAtLS0gZW5kIGV2ZW50IGhhbmRsZXJzXG5cblx0Ly8gLS0tIGJlZ2luIHZpZXcgQVBJXG5cblx0cHVibGljIGlzRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdGV4dEFyZWFJbnB1dC5pc0ZvY3VzZWQoKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXh0QXJlYUlucHV0LmZvY3VzVGV4dEFyZWEoKTtcblx0fVxuXG5cdHB1YmxpYyByZWZyZXNoRm9jdXNTdGF0ZSgpIHtcblx0XHR0aGlzLl90ZXh0QXJlYUlucHV0LnJlZnJlc2hGb2N1c1N0YXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGFzdFJlbmRlckRhdGEoKTogUG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdFJlbmRlclBvc2l0aW9uO1xuXHR9XG5cblx0cHVibGljIHNldEFyaWFPcHRpb25zKG9wdGlvbnM6IElFZGl0b3JBcmlhT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmIChvcHRpb25zLmFjdGl2ZURlc2NlbmRhbnQpIHtcblx0XHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ3RydWUnKTtcblx0XHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLWF1dG9jb21wbGV0ZScsICdsaXN0Jyk7XG5cdFx0XHR0aGlzLnRleHRBcmVhLnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jywgb3B0aW9ucy5hY3RpdmVEZXNjZW5kYW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50ZXh0QXJlYS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAnZmFsc2UnKTtcblx0XHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLWF1dG9jb21wbGV0ZScsICdib3RoJyk7XG5cdFx0XHR0aGlzLnRleHRBcmVhLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50Jyk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnJvbGUpIHtcblx0XHRcdHRoaXMudGV4dEFyZWEuc2V0QXR0cmlidXRlKCdyb2xlJywgb3B0aW9ucy5yb2xlKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gZW5kIHZpZXcgQVBJXG5cblx0cHJpdmF0ZSBfZW5zdXJlUmVhZE9ubHlBdHRyaWJ1dGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdC8vIFdoZW4gc29tZW9uZSByZXF1ZXN0cyB0byBkaXNhYmxlIElNRSwgd2Ugc2V0IHRoZSBcInJlYWRvbmx5XCIgYXR0cmlidXRlIG9uIHRoZSA8dGV4dGFyZWE+LlxuXHRcdC8vIFRoaXMgd2lsbCBwcmV2ZW50IGNvbXBvc2l0aW9uLlxuXHRcdGNvbnN0IHVzZVJlYWRPbmx5ID0gIUlNRS5lbmFibGVkIHx8IChvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZG9tUmVhZE9ubHkpICYmIG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5yZWFkT25seSkpO1xuXHRcdGlmICh1c2VSZWFkT25seSkge1xuXHRcdFx0dGhpcy50ZXh0QXJlYS5zZXRBdHRyaWJ1dGUoJ3JlYWRvbmx5JywgJ3RydWUnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50ZXh0QXJlYS5yZW1vdmVBdHRyaWJ1dGUoJ3JlYWRvbmx5Jyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcHJpbWFyeUN1cnNvclBvc2l0aW9uOiBQb3NpdGlvbiA9IG5ldyBQb3NpdGlvbigxLCAxKTtcblx0cHJpdmF0ZSBfcHJpbWFyeUN1cnNvclZpc2libGVSYW5nZTogSG9yaXpvbnRhbFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cblx0cHVibGljIHByZXBhcmVSZW5kZXIoY3R4OiBSZW5kZXJpbmdDb250ZXh0KTogdm9pZCB7XG5cdFx0dGhpcy5fcHJpbWFyeUN1cnNvclBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHRoaXMuX3NlbGVjdGlvbnNbMF0ucG9zaXRpb25MaW5lTnVtYmVyLCB0aGlzLl9zZWxlY3Rpb25zWzBdLnBvc2l0aW9uQ29sdW1uKTtcblx0XHR0aGlzLl9wcmltYXJ5Q3Vyc29yVmlzaWJsZVJhbmdlID0gY3R4LnZpc2libGVSYW5nZUZvclBvc2l0aW9uKHRoaXMuX3ByaW1hcnlDdXJzb3JQb3NpdGlvbik7XG5cdFx0dGhpcy5fdmlzaWJsZVRleHRBcmVhPy5wcmVwYXJlUmVuZGVyKGN0eCk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKGN0eDogUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXh0QXJlYUlucHV0LndyaXRlTmF0aXZlVGV4dEFyZWFDb250ZW50KCdyZW5kZXInKTtcblx0XHR0aGlzLl9yZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlzaWJsZVRleHRBcmVhKSB7XG5cdFx0XHQvLyBUaGUgdGV4dCBhcmVhIGlzIHZpc2libGUgZm9yIGNvbXBvc2l0aW9uIHJlYXNvbnNcblxuXHRcdFx0Y29uc3QgdmlzaWJsZVN0YXJ0ID0gdGhpcy5fdmlzaWJsZVRleHRBcmVhLnZpc2libGVUZXh0YXJlYVN0YXJ0O1xuXHRcdFx0Y29uc3QgdmlzaWJsZUVuZCA9IHRoaXMuX3Zpc2libGVUZXh0QXJlYS52aXNpYmxlVGV4dGFyZWFFbmQ7XG5cdFx0XHRjb25zdCBzdGFydFBvc2l0aW9uID0gdGhpcy5fdmlzaWJsZVRleHRBcmVhLnN0YXJ0UG9zaXRpb247XG5cdFx0XHRjb25zdCBlbmRQb3NpdGlvbiA9IHRoaXMuX3Zpc2libGVUZXh0QXJlYS5lbmRQb3NpdGlvbjtcblx0XHRcdGlmIChzdGFydFBvc2l0aW9uICYmIGVuZFBvc2l0aW9uICYmIHZpc2libGVTdGFydCAmJiB2aXNpYmxlRW5kICYmIHZpc2libGVFbmQubGVmdCA+PSB0aGlzLl9zY3JvbGxMZWZ0ICYmIHZpc2libGVTdGFydC5sZWZ0IDw9IHRoaXMuX3Njcm9sbExlZnQgKyB0aGlzLl9jb250ZW50V2lkdGgpIHtcblx0XHRcdFx0Y29uc3QgdG9wID0gKHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIodGhpcy5fcHJpbWFyeUN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXIpIC0gdGhpcy5fc2Nyb2xsVG9wKTtcblx0XHRcdFx0Y29uc3QgbGluZUNvdW50ID0gbmV3bGluZWNvdW50KHRoaXMudGV4dEFyZWEuZG9tTm9kZS52YWx1ZS5zdWJzdHIoMCwgdGhpcy50ZXh0QXJlYS5kb21Ob2RlLnNlbGVjdGlvblN0YXJ0KSk7XG5cblx0XHRcdFx0bGV0IHNjcm9sbExlZnQgPSB0aGlzLl92aXNpYmxlVGV4dEFyZWEud2lkdGhPZkhpZGRlbkxpbmVUZXh0QmVmb3JlO1xuXHRcdFx0XHRsZXQgbGVmdCA9ICh0aGlzLl9jb250ZW50TGVmdCArIHZpc2libGVTdGFydC5sZWZ0IC0gdGhpcy5fc2Nyb2xsTGVmdCk7XG5cdFx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQxNzI1I2lzc3VlY29tbWVudC0xMDUwNjcwODQxXG5cdFx0XHRcdC8vIEhlcmUgd2UgYXJlIGFkZGluZyArMSB0byBhdm9pZCBmbGlja2VyaW5nIHRoYXQgbWlnaHQgYmUgY2F1c2VkIGJ5IGhhdmluZyBhIHdpZHRoIHRoYXQgaXMgdG9vIHNtYWxsLlxuXHRcdFx0XHQvLyBUaGlzIGNvdWxkIGJlIGNhdXNlZCBieSByb3VuZGluZyBlcnJvcnMgdGhhdCBtaWdodCBvbmx5IHNob3cgdXAgd2l0aCBjZXJ0YWluIGZvbnQgZmFtaWxpZXMuXG5cdFx0XHRcdC8vIEluIG90aGVyIHdvcmRzLCBhIHBpeGVsIG1pZ2h0IGJlIGxvc3Qgd2hlbiBkb2luZyBzb21ldGhpbmcgbGlrZVxuXHRcdFx0XHQvLyAgICAgIGBNYXRoLnJvdW5kKGVuZCkgLSBNYXRoLnJvdW5kKHN0YXJ0KWBcblx0XHRcdFx0Ly8gdnNcblx0XHRcdFx0Ly8gICAgICBgTWF0aC5yb3VuZChlbmQgLSBzdGFydClgXG5cdFx0XHRcdGxldCB3aWR0aCA9IHZpc2libGVFbmQubGVmdCAtIHZpc2libGVTdGFydC5sZWZ0ICsgMTtcblx0XHRcdFx0aWYgKGxlZnQgPCB0aGlzLl9jb250ZW50TGVmdCkge1xuXHRcdFx0XHRcdC8vIHRoZSB0ZXh0YXJlYSB3b3VsZCBiZSByZW5kZXJlZCBvbiB0b3Agb2YgdGhlIG1hcmdpbixcblx0XHRcdFx0XHQvLyBzbyByZWR1Y2UgaXRzIHdpZHRoLiBXZSB1c2UgdGhlIHNhbWUgdGVjaG5pcXVlIGFzXG5cdFx0XHRcdFx0Ly8gZm9yIGhpZGluZyB0ZXh0IGJlZm9yZVxuXHRcdFx0XHRcdGNvbnN0IGRlbHRhID0gKHRoaXMuX2NvbnRlbnRMZWZ0IC0gbGVmdCk7XG5cdFx0XHRcdFx0bGVmdCArPSBkZWx0YTtcblx0XHRcdFx0XHRzY3JvbGxMZWZ0ICs9IGRlbHRhO1xuXHRcdFx0XHRcdHdpZHRoIC09IGRlbHRhO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh3aWR0aCA+IHRoaXMuX2NvbnRlbnRXaWR0aCkge1xuXHRcdFx0XHRcdC8vIHRoZSB0ZXh0YXJlYSB3b3VsZCBiZSB3aWRlciB0aGFuIHRoZSBjb250ZW50IHdpZHRoLFxuXHRcdFx0XHRcdC8vIHNvIHJlZHVjZSBpdHMgd2lkdGguXG5cdFx0XHRcdFx0d2lkdGggPSB0aGlzLl9jb250ZW50V2lkdGg7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBUcnkgdG8gcmVuZGVyIHRoZSB0ZXh0YXJlYSB3aXRoIHRoZSBjb2xvci9mb250IHN0eWxlIHRvIG1hdGNoIHRoZSB0ZXh0IHVuZGVyIGl0XG5cdFx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0TGluZUhlaWdodEZvckxpbmVOdW1iZXIoc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3QgZm9udFNpemUgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRGb250U2l6ZUF0UG9zaXRpb24odGhpcy5fcHJpbWFyeUN1cnNvclBvc2l0aW9uKTtcblx0XHRcdFx0Y29uc3Qgdmlld0xpbmVEYXRhID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0Vmlld0xpbmVEYXRhKHN0YXJ0UG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0VG9rZW5JbmRleCA9IHZpZXdMaW5lRGF0YS50b2tlbnMuZmluZFRva2VuSW5kZXhBdE9mZnNldChzdGFydFBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdFx0XHRjb25zdCBlbmRUb2tlbkluZGV4ID0gdmlld0xpbmVEYXRhLnRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KGVuZFBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdFx0XHRjb25zdCB0ZXh0YXJlYVNwYW5zU2luZ2xlVG9rZW4gPSAoc3RhcnRUb2tlbkluZGV4ID09PSBlbmRUb2tlbkluZGV4KTtcblx0XHRcdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gdGhpcy5fdmlzaWJsZVRleHRBcmVhLmRlZmluZVByZXNlbnRhdGlvbihcblx0XHRcdFx0XHQodGV4dGFyZWFTcGFuc1NpbmdsZVRva2VuID8gdmlld0xpbmVEYXRhLnRva2Vucy5nZXRQcmVzZW50YXRpb24oc3RhcnRUb2tlbkluZGV4KSA6IG51bGwpXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0dGhpcy50ZXh0QXJlYS5kb21Ob2RlLnNjcm9sbFRvcCA9IGxpbmVDb3VudCAqIGxpbmVIZWlnaHQ7XG5cdFx0XHRcdHRoaXMudGV4dEFyZWEuZG9tTm9kZS5zY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcblxuXHRcdFx0XHR0aGlzLl9kb1JlbmRlcih7XG5cdFx0XHRcdFx0bGFzdFJlbmRlclBvc2l0aW9uOiBudWxsLFxuXHRcdFx0XHRcdHRvcDogdG9wLFxuXHRcdFx0XHRcdGxlZnQ6IGxlZnQsXG5cdFx0XHRcdFx0d2lkdGg6IHdpZHRoLFxuXHRcdFx0XHRcdGhlaWdodDogbGluZUhlaWdodCxcblx0XHRcdFx0XHR1c2VDb3ZlcjogZmFsc2UsXG5cdFx0XHRcdFx0Y29sb3I6IChUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpIHx8IFtdKVtwcmVzZW50YXRpb24uZm9yZWdyb3VuZF0sXG5cdFx0XHRcdFx0aXRhbGljOiBwcmVzZW50YXRpb24uaXRhbGljLFxuXHRcdFx0XHRcdGJvbGQ6IHByZXNlbnRhdGlvbi5ib2xkLFxuXHRcdFx0XHRcdHVuZGVybGluZTogcHJlc2VudGF0aW9uLnVuZGVybGluZSxcblx0XHRcdFx0XHRzdHJpa2V0aHJvdWdoOiBwcmVzZW50YXRpb24uc3RyaWtldGhyb3VnaCxcblx0XHRcdFx0XHRmb250U2l6ZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3ByaW1hcnlDdXJzb3JWaXNpYmxlUmFuZ2UpIHtcblx0XHRcdC8vIFRoZSBwcmltYXJ5IGN1cnNvciBpcyBvdXRzaWRlIHRoZSB2aWV3cG9ydCA9PiBwbGFjZSB0ZXh0YXJlYSB0byB0aGUgdG9wIGxlZnRcblx0XHRcdHRoaXMuX3JlbmRlckF0VG9wTGVmdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxlZnQgPSB0aGlzLl9jb250ZW50TGVmdCArIHRoaXMuX3ByaW1hcnlDdXJzb3JWaXNpYmxlUmFuZ2UubGVmdCAtIHRoaXMuX3Njcm9sbExlZnQ7XG5cdFx0aWYgKGxlZnQgPCB0aGlzLl9jb250ZW50TGVmdCB8fCBsZWZ0ID4gdGhpcy5fY29udGVudExlZnQgKyB0aGlzLl9jb250ZW50V2lkdGgpIHtcblx0XHRcdC8vIGN1cnNvciBpcyBvdXRzaWRlIHRoZSB2aWV3cG9ydFxuXHRcdFx0dGhpcy5fcmVuZGVyQXRUb3BMZWZ0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9wID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcih0aGlzLl9zZWxlY3Rpb25zWzBdLnBvc2l0aW9uTGluZU51bWJlcikgLSB0aGlzLl9zY3JvbGxUb3A7XG5cdFx0aWYgKHRvcCA8IDAgfHwgdG9wID4gdGhpcy5fY29udGVudEhlaWdodCkge1xuXHRcdFx0Ly8gY3Vyc29yIGlzIG91dHNpZGUgdGhlIHZpZXdwb3J0XG5cdFx0XHR0aGlzLl9yZW5kZXJBdFRvcExlZnQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgcHJpbWFyeSBjdXJzb3IgaXMgaW4gdGhlIHZpZXdwb3J0IChhdCBsZWFzdCB2ZXJ0aWNhbGx5KSA9PiBwbGFjZSB0ZXh0YXJlYSBvbiB0aGUgY3Vyc29yXG5cblx0XHRpZiAocGxhdGZvcm0uaXNNYWNpbnRvc2ggfHwgdGhpcy5fYWNjZXNzaWJpbGl0eVN1cHBvcnQgPT09IEFjY2Vzc2liaWxpdHlTdXBwb3J0LkVuYWJsZWQpIHtcblx0XHRcdC8vIEZvciB0aGUgcG9wdXAgZW1vamkgaW5wdXQsIHdlIHdpbGwgbWFrZSB0aGUgdGV4dCBhcmVhIGFzIGhpZ2ggYXMgdGhlIGxpbmUgaGVpZ2h0XG5cdFx0XHQvLyBXZSB3aWxsIGFsc28gbWFrZSB0aGUgZm9udFNpemUgYW5kIGxpbmVIZWlnaHQgdGhlIGNvcnJlY3QgZGltZW5zaW9ucyB0byBoZWxwIHdpdGggdGhlIHBsYWNlbWVudCBvZiB0aGVzZSBwaWNrZXJzXG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5fcHJpbWFyeUN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldExpbmVIZWlnaHRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXHRcdFx0dGhpcy5fZG9SZW5kZXIoe1xuXHRcdFx0XHRsYXN0UmVuZGVyUG9zaXRpb246IHRoaXMuX3ByaW1hcnlDdXJzb3JQb3NpdGlvbixcblx0XHRcdFx0dG9wLFxuXHRcdFx0XHRsZWZ0OiB0aGlzLl90ZXh0QXJlYVdyYXBwaW5nID8gdGhpcy5fY29udGVudExlZnQgOiBsZWZ0LFxuXHRcdFx0XHR3aWR0aDogdGhpcy5fdGV4dEFyZWFXaWR0aCxcblx0XHRcdFx0aGVpZ2h0OiBsaW5lSGVpZ2h0LFxuXHRcdFx0XHR1c2VDb3ZlcjogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdFx0Ly8gSW4gY2FzZSB0aGUgdGV4dGFyZWEgY29udGFpbnMgYSB3b3JkLCB3ZSdyZSBnb2luZyB0byB0cnkgdG8gYWxpZ24gdGhlIHRleHRhcmVhJ3MgY3Vyc29yXG5cdFx0XHQvLyB3aXRoIG91ciBjdXJzb3IgYnkgc2Nyb2xsaW5nIHRoZSB0ZXh0YXJlYSBhcyBtdWNoIGFzIHBvc3NpYmxlXG5cdFx0XHR0aGlzLnRleHRBcmVhLmRvbU5vZGUuc2Nyb2xsTGVmdCA9IHRoaXMuX3ByaW1hcnlDdXJzb3JWaXNpYmxlUmFuZ2UubGVmdDtcblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuX3RleHRBcmVhSW5wdXQudGV4dEFyZWFTdGF0ZS5uZXdsaW5lQ291bnRCZWZvcmVTZWxlY3Rpb24gPz8gbmV3bGluZWNvdW50KHRoaXMudGV4dEFyZWEuZG9tTm9kZS52YWx1ZS5zdWJzdHJpbmcoMCwgdGhpcy50ZXh0QXJlYS5kb21Ob2RlLnNlbGVjdGlvblN0YXJ0KSk7XG5cdFx0XHR0aGlzLnRleHRBcmVhLmRvbU5vZGUuc2Nyb2xsVG9wID0gbGluZUNvdW50ICogbGluZUhlaWdodDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9kb1JlbmRlcih7XG5cdFx0XHRsYXN0UmVuZGVyUG9zaXRpb246IHRoaXMuX3ByaW1hcnlDdXJzb3JQb3NpdGlvbixcblx0XHRcdHRvcDogdG9wLFxuXHRcdFx0bGVmdDogdGhpcy5fdGV4dEFyZWFXcmFwcGluZyA/IHRoaXMuX2NvbnRlbnRMZWZ0IDogbGVmdCxcblx0XHRcdHdpZHRoOiB0aGlzLl90ZXh0QXJlYVdpZHRoLFxuXHRcdFx0aGVpZ2h0OiAoY2FuVXNlWmVyb1NpemVUZXh0YXJlYSA/IDAgOiAxKSxcblx0XHRcdHVzZUNvdmVyOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQXRUb3BMZWZ0KCk6IHZvaWQge1xuXHRcdC8vIChpbiBXZWJLaXQgdGhlIHRleHRhcmVhIGlzIDFweCBieSAxcHggYmVjYXVzZSBpdCBjYW5ub3QgaGFuZGxlIGlucHV0IHRvIGEgMHgwIHRleHRhcmVhKVxuXHRcdC8vIHNwZWNpZmljYWxseSwgd2hlbiBkb2luZyBLb3JlYW4gSU1FLCBzZXR0aW5nIHRoZSB0ZXh0YXJlYSB0byAweDAgYnJlYWtzIElNRSBiYWRseS5cblx0XHR0aGlzLl9kb1JlbmRlcih7XG5cdFx0XHRsYXN0UmVuZGVyUG9zaXRpb246IG51bGwsXG5cdFx0XHR0b3A6IDAsXG5cdFx0XHRsZWZ0OiAwLFxuXHRcdFx0d2lkdGg6IHRoaXMuX3RleHRBcmVhV2lkdGgsXG5cdFx0XHRoZWlnaHQ6IChjYW5Vc2VaZXJvU2l6ZVRleHRhcmVhID8gMCA6IDEpLFxuXHRcdFx0dXNlQ292ZXI6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2RvUmVuZGVyKHJlbmRlckRhdGE6IElSZW5kZXJEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdFJlbmRlclBvc2l0aW9uID0gcmVuZGVyRGF0YS5sYXN0UmVuZGVyUG9zaXRpb247XG5cblx0XHRjb25zdCB0YSA9IHRoaXMudGV4dEFyZWE7XG5cdFx0Y29uc3QgdGFjID0gdGhpcy50ZXh0QXJlYUNvdmVyO1xuXG5cdFx0YXBwbHlGb250SW5mbyh0YSwgdGhpcy5fZm9udEluZm8pO1xuXHRcdHRhLnNldFRvcChyZW5kZXJEYXRhLnRvcCk7XG5cdFx0dGEuc2V0TGVmdChyZW5kZXJEYXRhLmxlZnQpO1xuXHRcdHRhLnNldFdpZHRoKHJlbmRlckRhdGEud2lkdGgpO1xuXHRcdHRhLnNldEhlaWdodChyZW5kZXJEYXRhLmhlaWdodCk7XG5cdFx0dGEuc2V0TGluZUhlaWdodChyZW5kZXJEYXRhLmhlaWdodCk7XG5cblx0XHR0YS5zZXRGb250U2l6ZShyZW5kZXJEYXRhLmZvbnRTaXplID8/IHRoaXMuX2ZvbnRJbmZvLmZvbnRTaXplKTtcblx0XHR0YS5zZXRDb2xvcihyZW5kZXJEYXRhLmNvbG9yID8gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXgocmVuZGVyRGF0YS5jb2xvcikgOiAnJyk7XG5cdFx0dGEuc2V0Rm9udFN0eWxlKHJlbmRlckRhdGEuaXRhbGljID8gJ2l0YWxpYycgOiAnJyk7XG5cdFx0aWYgKHJlbmRlckRhdGEuYm9sZCkge1xuXHRcdFx0Ly8gZm9udFdlaWdodCBpcyBhbHNvIHNldCBieSBgYXBwbHlGb250SW5mb2AsIHNvIG9ubHkgb3ZlcndyaXRlIGl0IGlmIG5lY2Vzc2FyeVxuXHRcdFx0dGEuc2V0Rm9udFdlaWdodCgnYm9sZCcpO1xuXHRcdH1cblx0XHR0YS5zZXRUZXh0RGVjb3JhdGlvbihgJHtyZW5kZXJEYXRhLnVuZGVybGluZSA/ICcgdW5kZXJsaW5lJyA6ICcnfSR7cmVuZGVyRGF0YS5zdHJpa2V0aHJvdWdoID8gJyBsaW5lLXRocm91Z2gnIDogJyd9YCk7XG5cblx0XHR0YWMuc2V0VG9wKHJlbmRlckRhdGEudXNlQ292ZXIgPyByZW5kZXJEYXRhLnRvcCA6IDApO1xuXHRcdHRhYy5zZXRMZWZ0KHJlbmRlckRhdGEudXNlQ292ZXIgPyByZW5kZXJEYXRhLmxlZnQgOiAwKTtcblx0XHR0YWMuc2V0V2lkdGgocmVuZGVyRGF0YS51c2VDb3ZlciA/IHJlbmRlckRhdGEud2lkdGggOiAwKTtcblx0XHR0YWMuc2V0SGVpZ2h0KHJlbmRlckRhdGEudXNlQ292ZXIgPyByZW5kZXJEYXRhLmhlaWdodCA6IDApO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXG5cdFx0aWYgKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5nbHlwaE1hcmdpbikpIHtcblx0XHRcdHRhYy5zZXRDbGFzc05hbWUoJ21vbmFjby1lZGl0b3ItYmFja2dyb3VuZCB0ZXh0QXJlYUNvdmVyICcgKyBNYXJnaW4uT1VURVJfQ0xBU1NfTkFNRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZU51bWJlcnMpLnJlbmRlclR5cGUgIT09IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PZmYpIHtcblx0XHRcdFx0dGFjLnNldENsYXNzTmFtZSgnbW9uYWNvLWVkaXRvci1iYWNrZ3JvdW5kIHRleHRBcmVhQ292ZXIgJyArIExpbmVOdW1iZXJzT3ZlcmxheS5DTEFTU19OQU1FKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRhYy5zZXRDbGFzc05hbWUoJ21vbmFjby1lZGl0b3ItYmFja2dyb3VuZCB0ZXh0QXJlYUNvdmVyJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBJUmVuZGVyRGF0YSB7XG5cdGxhc3RSZW5kZXJQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsO1xuXHR0b3A6IG51bWJlcjtcblx0bGVmdDogbnVtYmVyO1xuXHR3aWR0aDogbnVtYmVyO1xuXHRoZWlnaHQ6IG51bWJlcjtcblx0dXNlQ292ZXI6IGJvb2xlYW47XG5cblx0Zm9udFNpemU/OiBzdHJpbmcgfCBudWxsO1xuXHRjb2xvcj86IENvbG9yIHwgbnVsbDtcblx0aXRhbGljPzogYm9vbGVhbjtcblx0Ym9sZD86IGJvb2xlYW47XG5cdHVuZGVybGluZT86IGJvb2xlYW47XG5cdHN0cmlrZXRocm91Z2g/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBtZWFzdXJlVGV4dCh0YXJnZXREb2N1bWVudDogRG9jdW1lbnQsIHRleHQ6IHN0cmluZywgZm9udEluZm86IEZvbnRJbmZvLCB0YWJTaXplOiBudW1iZXIpOiBudW1iZXIge1xuXHRpZiAodGV4dC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdGNvbnN0IGNvbnRhaW5lciA9ICQ8SFRNTERpdkVsZW1lbnQ+KCdkaXYnKTtcblx0Y29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0Y29udGFpbmVyLnN0eWxlLnRvcCA9ICctNTAwMDBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc1MDAwMHB4JztcblxuXHRjb25zdCByZWd1bGFyRG9tTm9kZSA9ICQ8SFRNTFNwYW5FbGVtZW50Pignc3BhbicpO1xuXHRhcHBseUZvbnRJbmZvKHJlZ3VsYXJEb21Ob2RlLCBmb250SW5mbyk7XG5cdHJlZ3VsYXJEb21Ob2RlLnN0eWxlLndoaXRlU3BhY2UgPSAncHJlJzsgLy8ganVzdCBsaWtlIHRoZSB0ZXh0YXJlYVxuXHRyZWd1bGFyRG9tTm9kZS5zdHlsZS50YWJTaXplID0gYCR7dGFiU2l6ZSAqIGZvbnRJbmZvLnNwYWNlV2lkdGh9cHhgOyAvLyBqdXN0IGxpa2UgdGhlIHRleHRhcmVhXG5cdHJlZ3VsYXJEb21Ob2RlLmFwcGVuZCh0ZXh0KTtcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHJlZ3VsYXJEb21Ob2RlKTtcblxuXHR0YXJnZXREb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cblx0Y29uc3QgcmVzID0gcmVndWxhckRvbU5vZGUub2Zmc2V0V2lkdGg7XG5cblx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXG5cdHJldHVybiByZXM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsU0FBUztBQUNsQixTQUFzQix5QkFBeUI7QUFFL0MsWUFBWSxjQUFjO0FBQzFCLFlBQVksYUFBYTtBQUN6QixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGlCQUFpQix3QkFBd0I7QUFDbEQsU0FBUyww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QVcsV0FBVyxTQUFTLENBQUM7QUFFekQsVUFBTSxVQUFVLEtBQUssU0FBUyxjQUFjO0FBRTVDLFFBQUksUUFBUSxJQUFJLGFBQWEsV0FBVyxHQUFHO0FBQzFDLFVBQUksYUFBYSw0Q0FBNEMsT0FBTyxnQkFBZ0I7QUFBQSxJQUNyRixPQUFPO0FBQ04sVUFBSSxRQUFRLElBQUksYUFBYSxXQUFXLEVBQUUsZUFBZSxzQkFBc0IsS0FBSztBQUNuRixZQUFJLGFBQWEsNENBQTRDLG1CQUFtQixVQUFVO0FBQUEsTUFDM0YsT0FBTztBQUNOLFlBQUksYUFBYSx3Q0FBd0M7QUFBQSxNQUMxRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUEzdkJhLHNCQUFOO0FBQUEsRUF3Q0o7QUFBQSxFQUNBO0FBQUEsR0F6Q1U7QUE2d0JiLFNBQVMsWUFBWSxnQkFBMEIsTUFBYyxVQUFvQixTQUF5QjtBQUN6RyxNQUFJLEtBQUssV0FBVyxHQUFHO0FBQ3RCLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxZQUFZLEVBQWtCLEtBQUs7QUFDekMsWUFBVSxNQUFNLFdBQVc7QUFDM0IsWUFBVSxNQUFNLE1BQU07QUFDdEIsWUFBVSxNQUFNLFFBQVE7QUFFeEIsUUFBTSxpQkFBaUIsRUFBbUIsTUFBTTtBQUNoRCxnQkFBYyxnQkFBZ0IsUUFBUTtBQUN0QyxpQkFBZSxNQUFNLGFBQWE7QUFDbEMsaUJBQWUsTUFBTSxVQUFVLEdBQUcsVUFBVSxTQUFTLFVBQVU7QUFDL0QsaUJBQWUsT0FBTyxJQUFJO0FBQzFCLFlBQVUsWUFBWSxjQUFjO0FBRXBDLGlCQUFlLEtBQUssWUFBWSxTQUFTO0FBRXpDLFFBQU0sTUFBTSxlQUFlO0FBRTNCLFlBQVUsT0FBTztBQUVqQixTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImRpc3RhbmNlVG9Nb2RlbExpbmVTdGFydCIsICJ0YWJTaXplIiwgIndpZHRoT2ZIaWRkZW5UZXh0QmVmb3JlIiwgImRpc3RhbmNlVG9Nb2RlbExpbmVFbmQiLCAidG9wIiwgImxlZnQiXQp9Cg==
