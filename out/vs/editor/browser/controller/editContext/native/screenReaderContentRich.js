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
import { addDisposableListener, getActiveWindow, isHTMLElement } from "../../../../../base/browser/dom.js";
import { createTrustedTypesPolicy } from "../../../../../base/browser/trustedTypes.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { EditorFontLigatures, EditorOption } from "../../../../common/config/editorOptions.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { StringBuilder } from "../../../../common/core/stringBuilder.js";
import { LineDecoration } from "../../../../common/viewLayout/lineDecorations.js";
import { RenderLineInput, renderViewLine } from "../../../../common/viewLayout/viewLineRenderer.js";
import { Disposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { IME } from "../../../../../base/common/ime.js";
import { getColumnOfNodeOffset } from "../../../viewParts/viewLines/viewLine.js";
const ttPolicy = createTrustedTypesPolicy("richScreenReaderContent", { createHTML: (value) => value });
const LINE_NUMBER_ATTRIBUTE = "data-line-number";
let RichScreenReaderContent = class extends Disposable {
  constructor(_domNode, _context, _viewController, _accessibilityService) {
    super();
    this._domNode = _domNode;
    this._context = _context;
    this._viewController = _viewController;
    this._accessibilityService = _accessibilityService;
    this._selectionChangeListener = this._register(new MutableDisposable());
    this._accessibilityPageSize = 1;
    this._ignoreSelectionChangeTime = 0;
    this._state = RichScreenReaderState.NULL;
    this._strategy = new RichPagedScreenReaderStrategy();
    this._renderedLines = /* @__PURE__ */ new Map();
    this._renderedSelection = new Selection(1, 1, 1, 1);
    this.onConfigurationChanged(this._context.configuration.options);
  }
  updateScreenReaderContent(primarySelection) {
    const focusedElement = getActiveWindow().document.activeElement;
    if (!focusedElement || focusedElement !== this._domNode.domNode) {
      return;
    }
    const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
    if (isScreenReaderOptimized) {
      const state = this._getScreenReaderContentLineIntervals(primarySelection);
      if (!this._state.equals(state)) {
        this._state = state;
        this._renderedLines = this._renderScreenReaderContent(state);
      }
      if (!this._renderedSelection.equalsSelection(primarySelection)) {
        this._renderedSelection = primarySelection;
        this._setSelectionOnScreenReaderContent(this._context, this._renderedLines, primarySelection);
      }
    } else {
      this._state = RichScreenReaderState.NULL;
      this._setIgnoreSelectionChangeTime("setValue");
      this._domNode.domNode.textContent = "";
    }
  }
  updateScrollTop(primarySelection) {
    const intervals = this._state.intervals;
    if (!intervals.length) {
      return;
    }
    const viewLayout = this._context.viewModel.viewLayout;
    const stateStartLineNumber = intervals[0].startLine;
    const verticalOffsetOfStateStartLineNumber = viewLayout.getVerticalOffsetForLineNumber(stateStartLineNumber);
    const verticalOffsetOfPositionLineNumber = viewLayout.getVerticalOffsetForLineNumber(primarySelection.positionLineNumber);
    this._domNode.domNode.scrollTop = verticalOffsetOfPositionLineNumber - verticalOffsetOfStateStartLineNumber;
  }
  onFocusChange(newFocusValue) {
    if (newFocusValue) {
      this._selectionChangeListener.value = this._setSelectionChangeListener();
    } else {
      this._selectionChangeListener.value = void 0;
    }
  }
  onConfigurationChanged(options) {
    this._accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
  }
  onWillCut() {
    this._setIgnoreSelectionChangeTime("onCut");
  }
  onWillPaste() {
    this._setIgnoreSelectionChangeTime("onWillPaste");
  }
  // --- private methods
  _setIgnoreSelectionChangeTime(reason) {
    this._ignoreSelectionChangeTime = Date.now();
  }
  _setSelectionChangeListener() {
    let previousSelectionChangeEventTime = 0;
    return addDisposableListener(this._domNode.domNode.ownerDocument, "selectionchange", () => {
      const activeElement = getActiveWindow().document.activeElement;
      const isFocused = activeElement === this._domNode.domNode;
      if (!isFocused) {
        return;
      }
      const isScreenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
      if (!isScreenReaderOptimized || !IME.enabled) {
        return;
      }
      const now = Date.now();
      const delta1 = now - previousSelectionChangeEventTime;
      previousSelectionChangeEventTime = now;
      if (delta1 < 5) {
        return;
      }
      const delta2 = now - this._ignoreSelectionChangeTime;
      this._ignoreSelectionChangeTime = 0;
      if (delta2 < 100) {
        return;
      }
      const selection = this._getEditorSelectionFromDomRange();
      if (!selection) {
        return;
      }
      this._viewController.setSelection(selection);
    });
  }
  _renderScreenReaderContent(state) {
    const nodes = [];
    const renderedLines = /* @__PURE__ */ new Map();
    for (const interval of state.intervals) {
      for (let lineNumber = interval.startLine; lineNumber <= interval.endLine; lineNumber++) {
        const renderedLine = this._renderLine(lineNumber);
        renderedLines.set(lineNumber, renderedLine);
        nodes.push(renderedLine.domNode);
      }
    }
    this._setIgnoreSelectionChangeTime("setValue");
    this._domNode.domNode.replaceChildren(...nodes);
    return renderedLines;
  }
  _renderLine(viewLineNumber) {
    const viewModel = this._context.viewModel;
    const positionLineData = viewModel.getViewLineRenderingData(viewLineNumber);
    const options = this._context.configuration.options;
    const fontInfo = options.get(EditorOption.fontInfo);
    const stopRenderingLineAfter = options.get(EditorOption.stopRenderingLineAfter);
    const renderControlCharacters = options.get(EditorOption.renderControlCharacters);
    const fontLigatures = options.get(EditorOption.fontLigatures);
    const disableMonospaceOptimizations = options.get(EditorOption.disableMonospaceOptimizations);
    const lineDecorations = LineDecoration.filter(positionLineData.inlineDecorations, viewLineNumber, positionLineData.minColumn, positionLineData.maxColumn);
    const useMonospaceOptimizations = fontInfo.isMonospace && !disableMonospaceOptimizations;
    const useFontLigatures = fontLigatures !== EditorFontLigatures.OFF;
    let renderWhitespace;
    const experimentalWhitespaceRendering = options.get(EditorOption.experimentalWhitespaceRendering);
    if (experimentalWhitespaceRendering === "off") {
      renderWhitespace = options.get(EditorOption.renderWhitespace);
    } else {
      renderWhitespace = "none";
    }
    const renderLineInput = new RenderLineInput(
      useMonospaceOptimizations,
      fontInfo.canUseHalfwidthRightwardsArrow,
      positionLineData.content,
      positionLineData.continuesWithWrappedLine,
      positionLineData.isBasicASCII,
      positionLineData.containsRTL,
      positionLineData.minColumn - 1,
      positionLineData.tokens,
      lineDecorations,
      positionLineData.tabSize,
      positionLineData.startVisibleColumn,
      fontInfo.spaceWidth,
      fontInfo.middotWidth,
      fontInfo.wsmiddotWidth,
      stopRenderingLineAfter,
      renderWhitespace,
      renderControlCharacters,
      useFontLigatures,
      null,
      null,
      0,
      true
    );
    const htmlBuilder = new StringBuilder(1e4);
    const renderOutput = renderViewLine(renderLineInput, htmlBuilder);
    const html = htmlBuilder.build();
    const trustedhtml = ttPolicy?.createHTML(html) ?? html;
    const lineHeight = viewModel.viewLayout.getLineHeightForLineNumber(viewLineNumber) + "px";
    const domNode = document.createElement("div");
    domNode.innerHTML = trustedhtml;
    domNode.style.lineHeight = lineHeight;
    domNode.style.height = lineHeight;
    domNode.setAttribute(LINE_NUMBER_ATTRIBUTE, viewLineNumber.toString());
    return new RichRenderedScreenReaderLine(domNode, renderOutput.characterMapping);
  }
  _setSelectionOnScreenReaderContent(context, renderedLines, viewSelection) {
    const activeDocument = getActiveWindow().document;
    const activeDocumentSelection = activeDocument.getSelection();
    if (!activeDocumentSelection) {
      return;
    }
    const startLineNumber = viewSelection.startLineNumber;
    const endLineNumber = viewSelection.endLineNumber;
    const startRenderedLine = renderedLines.get(startLineNumber);
    const endRenderedLine = renderedLines.get(endLineNumber);
    if (!startRenderedLine || !endRenderedLine) {
      return;
    }
    const viewModel = context.viewModel;
    const model = viewModel.model;
    const coordinatesConverter = viewModel.coordinatesConverter;
    const startRange = new Range(startLineNumber, 1, startLineNumber, viewSelection.selectionStartColumn);
    const modelStartRange = coordinatesConverter.convertViewRangeToModelRange(startRange);
    const characterCountForStart = model.getCharacterCountInRange(modelStartRange);
    const endRange = new Range(endLineNumber, 1, endLineNumber, viewSelection.positionColumn);
    const modelEndRange = coordinatesConverter.convertViewRangeToModelRange(endRange);
    const characterCountForEnd = model.getCharacterCountInRange(modelEndRange);
    const startDomPosition = startRenderedLine.characterMapping.getDomPosition(characterCountForStart);
    const endDomPosition = endRenderedLine.characterMapping.getDomPosition(characterCountForEnd);
    const startDomNode = startRenderedLine.domNode.firstChild;
    const endDomNode = endRenderedLine.domNode.firstChild;
    const startChildren = startDomNode.childNodes;
    const endChildren = endDomNode.childNodes;
    const startNode = startChildren.item(startDomPosition.partIndex);
    const endNode = endChildren.item(endDomPosition.partIndex);
    if (!startNode.firstChild || !endNode.firstChild) {
      return;
    }
    this._setIgnoreSelectionChangeTime("setRange");
    activeDocumentSelection.setBaseAndExtent(
      startNode.firstChild,
      viewSelection.startColumn === 1 ? 0 : startDomPosition.charIndex + 1,
      endNode.firstChild,
      viewSelection.endColumn === 1 ? 0 : endDomPosition.charIndex + 1
    );
  }
  _getScreenReaderContentLineIntervals(primarySelection) {
    return this._strategy.fromEditorSelection(this._context.viewModel, primarySelection, this._accessibilityPageSize);
  }
  _getEditorSelectionFromDomRange() {
    if (!this._renderedLines) {
      return;
    }
    const selection = getActiveWindow().document.getSelection();
    if (!selection) {
      return;
    }
    const rangeCount = selection.rangeCount;
    if (rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    const startContainer = range.startContainer;
    const endContainer = range.endContainer;
    const startSpanElement = startContainer.parentElement;
    const endSpanElement = endContainer.parentElement;
    if (!startSpanElement || !isHTMLElement(startSpanElement) || !endSpanElement || !isHTMLElement(endSpanElement)) {
      return;
    }
    const startLineDomNode = startSpanElement.parentElement?.parentElement;
    const endLineDomNode = endSpanElement.parentElement?.parentElement;
    if (!startLineDomNode || !endLineDomNode) {
      return;
    }
    const startLineNumberAttribute = startLineDomNode.getAttribute(LINE_NUMBER_ATTRIBUTE);
    const endLineNumberAttribute = endLineDomNode.getAttribute(LINE_NUMBER_ATTRIBUTE);
    if (!startLineNumberAttribute || !endLineNumberAttribute) {
      return;
    }
    const startLineNumber = parseInt(startLineNumberAttribute);
    const endLineNumber = parseInt(endLineNumberAttribute);
    const startMapping = this._renderedLines.get(startLineNumber)?.characterMapping;
    const endMapping = this._renderedLines.get(endLineNumber)?.characterMapping;
    if (!startMapping || !endMapping) {
      return;
    }
    const startColumn = getColumnOfNodeOffset(startMapping, startSpanElement, range.startOffset);
    const endColumn = getColumnOfNodeOffset(endMapping, endSpanElement, range.endOffset);
    if (selection.direction === "forward") {
      return new Selection(
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn
      );
    } else {
      return new Selection(
        endLineNumber,
        endColumn,
        startLineNumber,
        startColumn
      );
    }
  }
};
RichScreenReaderContent = __decorateClass([
  __decorateParam(3, IAccessibilityService)
], RichScreenReaderContent);
class RichRenderedScreenReaderLine {
  constructor(domNode, characterMapping) {
    this.domNode = domNode;
    this.characterMapping = characterMapping;
  }
}
class LineInterval {
  constructor(startLine, endLine) {
    this.startLine = startLine;
    this.endLine = endLine;
  }
}
class RichScreenReaderState {
  constructor(model, intervals) {
    this.intervals = intervals;
    let value = "";
    for (const interval of intervals) {
      for (let lineNumber = interval.startLine; lineNumber <= interval.endLine; lineNumber++) {
        value += model.getLineContent(lineNumber) + "\n";
      }
    }
    this.value = value;
  }
  equals(other) {
    return this.value === other.value;
  }
  static get NULL() {
    const nullModel = {
      getLineContent: () => "",
      getLineCount: () => 1,
      getLineMaxColumn: () => 1,
      getValueInRange: () => "",
      getValueLengthInRange: () => 0,
      modifyPosition: (position, offset) => position
    };
    return new RichScreenReaderState(nullModel, []);
  }
}
class RichPagedScreenReaderStrategy {
  constructor() {
  }
  _getPageOfLine(lineNumber, linesPerPage) {
    return Math.floor((lineNumber - 1) / linesPerPage);
  }
  _getRangeForPage(context, page, linesPerPage) {
    const offset = page * linesPerPage;
    const startLineNumber = offset + 1;
    const endLineNumber = Math.min(offset + linesPerPage, context.getLineCount());
    return new LineInterval(startLineNumber, endLineNumber);
  }
  fromEditorSelection(context, viewSelection, linesPerPage) {
    const selectionStartPage = this._getPageOfLine(viewSelection.startLineNumber, linesPerPage);
    const selectionStartPageRange = this._getRangeForPage(context, selectionStartPage, linesPerPage);
    const selectionEndPage = this._getPageOfLine(viewSelection.endLineNumber, linesPerPage);
    const selectionEndPageRange = this._getRangeForPage(context, selectionEndPage, linesPerPage);
    const lineIntervals = [{ startLine: selectionStartPageRange.startLine, endLine: selectionStartPageRange.endLine }];
    if (selectionStartPage + 1 < selectionEndPage) {
      lineIntervals.push({ startLine: selectionEndPageRange.startLine, endLine: selectionEndPageRange.endLine });
    }
    return new RichScreenReaderState(context, lineIntervals);
  }
}
export {
  RichScreenReaderContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGNvbnRyb2xsZXJcXGVkaXRDb250ZXh0XFxuYXRpdmVcXHNjcmVlblJlYWRlckNvbnRlbnRSaWNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBnZXRBY3RpdmVXaW5kb3csIGlzSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRydXN0ZWRUeXBlc1BvbGljeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90cnVzdGVkVHlwZXMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JGb250TGlnYXR1cmVzLCBFZGl0b3JPcHRpb24sIEZpbmRDb21wdXRlZEVkaXRvck9wdGlvblZhbHVlQnlJZCwgSUNvbXB1dGVkRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBTdHJpbmdCdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvc3RyaW5nQnVpbGRlci5qcyc7XG5pbXBvcnQgeyBMaW5lRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L2xpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGFyYWN0ZXJNYXBwaW5nLCBSZW5kZXJMaW5lSW5wdXQsIHJlbmRlclZpZXdMaW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvdmlld0xpbmVSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuaW1wb3J0IHsgSVBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3kgfSBmcm9tICcuLi9zY3JlZW5SZWFkZXJVdGlscy5qcyc7XG5pbXBvcnQgeyBJU2ltcGxlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3NjcmVlblJlYWRlclNpbXBsZU1vZGVsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTUUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pbWUuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi92aWV3L3ZpZXdDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElTY3JlZW5SZWFkZXJDb250ZW50IH0gZnJvbSAnLi9zY3JlZW5SZWFkZXJVdGlscy5qcyc7XG5pbXBvcnQgeyBnZXRDb2x1bW5PZk5vZGVPZmZzZXQgfSBmcm9tICcuLi8uLi8uLi92aWV3UGFydHMvdmlld0xpbmVzL3ZpZXdMaW5lLmpzJztcblxuY29uc3QgdHRQb2xpY3kgPSBjcmVhdGVUcnVzdGVkVHlwZXNQb2xpY3koJ3JpY2hTY3JlZW5SZWFkZXJDb250ZW50JywgeyBjcmVhdGVIVE1MOiB2YWx1ZSA9PiB2YWx1ZSB9KTtcblxuY29uc3QgTElORV9OVU1CRVJfQVRUUklCVVRFID0gJ2RhdGEtbGluZS1udW1iZXInO1xuXG5leHBvcnQgY2xhc3MgUmljaFNjcmVlblJlYWRlckNvbnRlbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNjcmVlblJlYWRlckNvbnRlbnQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbkNoYW5nZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgX2FjY2Vzc2liaWxpdHlQYWdlU2l6ZTogbnVtYmVyID0gMTtcblx0cHJpdmF0ZSBfaWdub3JlU2VsZWN0aW9uQ2hhbmdlVGltZTogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIF9zdGF0ZTogUmljaFNjcmVlblJlYWRlclN0YXRlID0gUmljaFNjcmVlblJlYWRlclN0YXRlLk5VTEw7XG5cdHByaXZhdGUgX3N0cmF0ZWd5OiBSaWNoUGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneSA9IG5ldyBSaWNoUGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneSgpO1xuXG5cdHByaXZhdGUgX3JlbmRlcmVkTGluZXM6IE1hcDxudW1iZXIsIFJpY2hSZW5kZXJlZFNjcmVlblJlYWRlckxpbmU+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIF9yZW5kZXJlZFNlbGVjdGlvbjogU2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dDogVmlld0NvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld0NvbnRyb2xsZXI6IFZpZXdDb250cm9sbGVyLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub25Db25maWd1cmF0aW9uQ2hhbmdlZCh0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlU2NyZWVuUmVhZGVyQ29udGVudChwcmltYXJ5U2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IGdldEFjdGl2ZVdpbmRvdygpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0aWYgKCFmb2N1c2VkRWxlbWVudCB8fCBmb2N1c2VkRWxlbWVudCAhPT0gdGhpcy5fZG9tTm9kZS5kb21Ob2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkID0gdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKTtcblx0XHRpZiAoaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQpIHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fZ2V0U2NyZWVuUmVhZGVyQ29udGVudExpbmVJbnRlcnZhbHMocHJpbWFyeVNlbGVjdGlvbik7XG5cdFx0XHRpZiAoIXRoaXMuX3N0YXRlLmVxdWFscyhzdGF0ZSkpIHtcblx0XHRcdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZTtcblx0XHRcdFx0dGhpcy5fcmVuZGVyZWRMaW5lcyA9IHRoaXMuX3JlbmRlclNjcmVlblJlYWRlckNvbnRlbnQoc3RhdGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9yZW5kZXJlZFNlbGVjdGlvbi5lcXVhbHNTZWxlY3Rpb24ocHJpbWFyeVNlbGVjdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyZWRTZWxlY3Rpb24gPSBwcmltYXJ5U2VsZWN0aW9uO1xuXHRcdFx0XHR0aGlzLl9zZXRTZWxlY3Rpb25PblNjcmVlblJlYWRlckNvbnRlbnQodGhpcy5fY29udGV4dCwgdGhpcy5fcmVuZGVyZWRMaW5lcywgcHJpbWFyeVNlbGVjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gUmljaFNjcmVlblJlYWRlclN0YXRlLk5VTEw7XG5cdFx0XHR0aGlzLl9zZXRJZ25vcmVTZWxlY3Rpb25DaGFuZ2VUaW1lKCdzZXRWYWx1ZScpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5kb21Ob2RlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHVwZGF0ZVNjcm9sbFRvcChwcmltYXJ5U2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBpbnRlcnZhbHMgPSB0aGlzLl9zdGF0ZS5pbnRlcnZhbHM7XG5cdFx0aWYgKCFpbnRlcnZhbHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZpZXdMYXlvdXQgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC52aWV3TGF5b3V0O1xuXHRcdGNvbnN0IHN0YXRlU3RhcnRMaW5lTnVtYmVyID0gaW50ZXJ2YWxzWzBdLnN0YXJ0TGluZTtcblx0XHRjb25zdCB2ZXJ0aWNhbE9mZnNldE9mU3RhdGVTdGFydExpbmVOdW1iZXIgPSB2aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihzdGF0ZVN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3QgdmVydGljYWxPZmZzZXRPZlBvc2l0aW9uTGluZU51bWJlciA9IHZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKHByaW1hcnlTZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyKTtcblx0XHR0aGlzLl9kb21Ob2RlLmRvbU5vZGUuc2Nyb2xsVG9wID0gdmVydGljYWxPZmZzZXRPZlBvc2l0aW9uTGluZU51bWJlciAtIHZlcnRpY2FsT2Zmc2V0T2ZTdGF0ZVN0YXJ0TGluZU51bWJlcjtcblx0fVxuXG5cdHB1YmxpYyBvbkZvY3VzQ2hhbmdlKG5ld0ZvY3VzVmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAobmV3Rm9jdXNWYWx1ZSkge1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uQ2hhbmdlTGlzdGVuZXIudmFsdWUgPSB0aGlzLl9zZXRTZWxlY3Rpb25DaGFuZ2VMaXN0ZW5lcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25DaGFuZ2VMaXN0ZW5lci52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb25Db25maWd1cmF0aW9uQ2hhbmdlZChvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVBhZ2VTaXplID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFjY2Vzc2liaWxpdHlQYWdlU2l6ZSk7XG5cdH1cblxuXHRwdWJsaWMgb25XaWxsQ3V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldElnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUoJ29uQ3V0Jyk7XG5cdH1cblxuXHRwdWJsaWMgb25XaWxsUGFzdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0SWdub3JlU2VsZWN0aW9uQ2hhbmdlVGltZSgnb25XaWxsUGFzdGUnKTtcblx0fVxuXG5cdC8vIC0tLSBwcml2YXRlIG1ldGhvZHNcblxuXHRwcml2YXRlIF9zZXRJZ25vcmVTZWxlY3Rpb25DaGFuZ2VUaW1lKHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5faWdub3JlU2VsZWN0aW9uQ2hhbmdlVGltZSA9IERhdGUubm93KCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTZWxlY3Rpb25DaGFuZ2VMaXN0ZW5lcigpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNzIxNiBhbmQgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk4MjU2XG5cdFx0Ly8gV2hlbiB1c2luZyBhIEJyYWlsbGUgZGlzcGxheSBvciBOVkRBIGZvciBleGFtcGxlLCBpdCBpcyBwb3NzaWJsZSBmb3IgdXNlcnMgdG8gcmVwb3NpdGlvbiB0aGVcblx0XHQvLyBzeXN0ZW0gY2FyZXQuIFRoaXMgaXMgcmVmbGVjdGVkIGluIENocm9tZSBhcyBhIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50IGFuZCBuZWVkcyB0byBiZSByZWZsZWN0ZWQgd2l0aGluIHRoZSBlZGl0b3IuXG5cblx0XHQvLyBgc2VsZWN0aW9uY2hhbmdlYCBldmVudHMgb2Z0ZW4gY29tZSBtdWx0aXBsZSB0aW1lcyBmb3IgYSBzaW5nbGUgbG9naWNhbCBjaGFuZ2Vcblx0XHQvLyBzbyB0aHJvdHRsZSBtdWx0aXBsZSBgc2VsZWN0aW9uY2hhbmdlYCBldmVudHMgdGhhdCBidXJzdCBpbiBhIHNob3J0IHBlcmlvZCBvZiB0aW1lLlxuXHRcdGxldCBwcmV2aW91c1NlbGVjdGlvbkNoYW5nZUV2ZW50VGltZSA9IDA7XG5cdFx0cmV0dXJuIGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLmRvbU5vZGUub3duZXJEb2N1bWVudCwgJ3NlbGVjdGlvbmNoYW5nZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVXaW5kb3coKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdFx0Y29uc3QgaXNGb2N1c2VkID0gYWN0aXZlRWxlbWVudCA9PT0gdGhpcy5fZG9tTm9kZS5kb21Ob2RlO1xuXHRcdFx0aWYgKCFpc0ZvY3VzZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQgPSB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpO1xuXHRcdFx0aWYgKCFpc1NjcmVlblJlYWRlck9wdGltaXplZCB8fCAhSU1FLmVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IGRlbHRhMSA9IG5vdyAtIHByZXZpb3VzU2VsZWN0aW9uQ2hhbmdlRXZlbnRUaW1lO1xuXHRcdFx0cHJldmlvdXNTZWxlY3Rpb25DaGFuZ2VFdmVudFRpbWUgPSBub3c7XG5cdFx0XHRpZiAoZGVsdGExIDwgNSkge1xuXHRcdFx0XHQvLyByZWNlaXZlZCBhbm90aGVyIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50IHdpdGhpbiA1bXMgb2YgdGhlIHByZXZpb3VzIGBzZWxlY3Rpb25jaGFuZ2VgIGV2ZW50XG5cdFx0XHRcdC8vID0+IGlnbm9yZSBpdFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZWx0YTIgPSBub3cgLSB0aGlzLl9pZ25vcmVTZWxlY3Rpb25DaGFuZ2VUaW1lO1xuXHRcdFx0dGhpcy5faWdub3JlU2VsZWN0aW9uQ2hhbmdlVGltZSA9IDA7XG5cdFx0XHRpZiAoZGVsdGEyIDwgMTAwKSB7XG5cdFx0XHRcdC8vIHJlY2VpdmVkIGEgYHNlbGVjdGlvbmNoYW5nZWAgZXZlbnQgd2l0aGluIDEwMG1zIHNpbmNlIHdlIHRvdWNoZWQgdGhlIGhpZGRlbiBkaXZcblx0XHRcdFx0Ly8gPT4gaWdub3JlIGl0LCBzaW5jZSB3ZSBjYXVzZWQgaXRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZ2V0RWRpdG9yU2VsZWN0aW9uRnJvbURvbVJhbmdlKCk7XG5cdFx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl92aWV3Q29udHJvbGxlci5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclNjcmVlblJlYWRlckNvbnRlbnQoc3RhdGU6IFJpY2hTY3JlZW5SZWFkZXJTdGF0ZSk6IE1hcDxudW1iZXIsIFJpY2hSZW5kZXJlZFNjcmVlblJlYWRlckxpbmU+IHtcblx0XHRjb25zdCBub2RlczogSFRNTERpdkVsZW1lbnRbXSA9IFtdO1xuXHRcdGNvbnN0IHJlbmRlcmVkTGluZXMgPSBuZXcgTWFwPG51bWJlciwgUmljaFJlbmRlcmVkU2NyZWVuUmVhZGVyTGluZT4oKTtcblx0XHRmb3IgKGNvbnN0IGludGVydmFsIG9mIHN0YXRlLmludGVydmFscykge1xuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IGludGVydmFsLnN0YXJ0TGluZTsgbGluZU51bWJlciA8PSBpbnRlcnZhbC5lbmRMaW5lOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZWRMaW5lID0gdGhpcy5fcmVuZGVyTGluZShsaW5lTnVtYmVyKTtcblx0XHRcdFx0cmVuZGVyZWRMaW5lcy5zZXQobGluZU51bWJlciwgcmVuZGVyZWRMaW5lKTtcblx0XHRcdFx0bm9kZXMucHVzaChyZW5kZXJlZExpbmUuZG9tTm9kZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3NldElnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUoJ3NldFZhbHVlJyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5kb21Ob2RlLnJlcGxhY2VDaGlsZHJlbiguLi5ub2Rlcyk7XG5cdFx0cmV0dXJuIHJlbmRlcmVkTGluZXM7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJMaW5lKHZpZXdMaW5lTnVtYmVyOiBudW1iZXIpOiBSaWNoUmVuZGVyZWRTY3JlZW5SZWFkZXJMaW5lIHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbDtcblx0XHRjb25zdCBwb3NpdGlvbkxpbmVEYXRhID0gdmlld01vZGVsLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YSh2aWV3TGluZU51bWJlcik7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCBzdG9wUmVuZGVyaW5nTGluZUFmdGVyID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIpO1xuXHRcdGNvbnN0IHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzKTtcblx0XHRjb25zdCBmb250TGlnYXR1cmVzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRMaWdhdHVyZXMpO1xuXHRcdGNvbnN0IGRpc2FibGVNb25vc3BhY2VPcHRpbWl6YXRpb25zID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmRpc2FibGVNb25vc3BhY2VPcHRpbWl6YXRpb25zKTtcblx0XHRjb25zdCBsaW5lRGVjb3JhdGlvbnMgPSBMaW5lRGVjb3JhdGlvbi5maWx0ZXIocG9zaXRpb25MaW5lRGF0YS5pbmxpbmVEZWNvcmF0aW9ucywgdmlld0xpbmVOdW1iZXIsIHBvc2l0aW9uTGluZURhdGEubWluQ29sdW1uLCBwb3NpdGlvbkxpbmVEYXRhLm1heENvbHVtbik7XG5cdFx0Y29uc3QgdXNlTW9ub3NwYWNlT3B0aW1pemF0aW9ucyA9IGZvbnRJbmZvLmlzTW9ub3NwYWNlICYmICFkaXNhYmxlTW9ub3NwYWNlT3B0aW1pemF0aW9ucztcblx0XHRjb25zdCB1c2VGb250TGlnYXR1cmVzID0gZm9udExpZ2F0dXJlcyAhPT0gRWRpdG9yRm9udExpZ2F0dXJlcy5PRkY7XG5cdFx0bGV0IHJlbmRlcldoaXRlc3BhY2U6IEZpbmRDb21wdXRlZEVkaXRvck9wdGlvblZhbHVlQnlJZDxFZGl0b3JPcHRpb24ucmVuZGVyV2hpdGVzcGFjZT47XG5cdFx0Y29uc3QgZXhwZXJpbWVudGFsV2hpdGVzcGFjZVJlbmRlcmluZyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5leHBlcmltZW50YWxXaGl0ZXNwYWNlUmVuZGVyaW5nKTtcblx0XHRpZiAoZXhwZXJpbWVudGFsV2hpdGVzcGFjZVJlbmRlcmluZyA9PT0gJ29mZicpIHtcblx0XHRcdHJlbmRlcldoaXRlc3BhY2UgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmVuZGVyV2hpdGVzcGFjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlbmRlcldoaXRlc3BhY2UgPSAnbm9uZSc7XG5cdFx0fVxuXHRcdGNvbnN0IHJlbmRlckxpbmVJbnB1dCA9IG5ldyBSZW5kZXJMaW5lSW5wdXQoXG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zLFxuXHRcdFx0Zm9udEluZm8uY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93LFxuXHRcdFx0cG9zaXRpb25MaW5lRGF0YS5jb250ZW50LFxuXHRcdFx0cG9zaXRpb25MaW5lRGF0YS5jb250aW51ZXNXaXRoV3JhcHBlZExpbmUsXG5cdFx0XHRwb3NpdGlvbkxpbmVEYXRhLmlzQmFzaWNBU0NJSSxcblx0XHRcdHBvc2l0aW9uTGluZURhdGEuY29udGFpbnNSVEwsXG5cdFx0XHRwb3NpdGlvbkxpbmVEYXRhLm1pbkNvbHVtbiAtIDEsXG5cdFx0XHRwb3NpdGlvbkxpbmVEYXRhLnRva2Vucyxcblx0XHRcdGxpbmVEZWNvcmF0aW9ucyxcblx0XHRcdHBvc2l0aW9uTGluZURhdGEudGFiU2l6ZSxcblx0XHRcdHBvc2l0aW9uTGluZURhdGEuc3RhcnRWaXNpYmxlQ29sdW1uLFxuXHRcdFx0Zm9udEluZm8uc3BhY2VXaWR0aCxcblx0XHRcdGZvbnRJbmZvLm1pZGRvdFdpZHRoLFxuXHRcdFx0Zm9udEluZm8ud3NtaWRkb3RXaWR0aCxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIsXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlLFxuXHRcdFx0cmVuZGVyQ29udHJvbENoYXJhY3RlcnMsXG5cdFx0XHR1c2VGb250TGlnYXR1cmVzLFxuXHRcdFx0bnVsbCxcblx0XHRcdG51bGwsXG5cdFx0XHQwLFxuXHRcdFx0dHJ1ZVxuXHRcdCk7XG5cdFx0Y29uc3QgaHRtbEJ1aWxkZXIgPSBuZXcgU3RyaW5nQnVpbGRlcigxMDAwMCk7XG5cdFx0Y29uc3QgcmVuZGVyT3V0cHV0ID0gcmVuZGVyVmlld0xpbmUocmVuZGVyTGluZUlucHV0LCBodG1sQnVpbGRlcik7XG5cdFx0Y29uc3QgaHRtbCA9IGh0bWxCdWlsZGVyLmJ1aWxkKCk7XG5cdFx0Y29uc3QgdHJ1c3RlZGh0bWwgPSB0dFBvbGljeT8uY3JlYXRlSFRNTChodG1sKSA/PyBodG1sO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB2aWV3TW9kZWwudmlld0xheW91dC5nZXRMaW5lSGVpZ2h0Rm9yTGluZU51bWJlcih2aWV3TGluZU51bWJlcikgKyAncHgnO1xuXHRcdGNvbnN0IGRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb21Ob2RlLmlubmVySFRNTCA9IHRydXN0ZWRodG1sIGFzIHN0cmluZztcblx0XHRkb21Ob2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBsaW5lSGVpZ2h0O1xuXHRcdGRvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gbGluZUhlaWdodDtcblx0XHRkb21Ob2RlLnNldEF0dHJpYnV0ZShMSU5FX05VTUJFUl9BVFRSSUJVVEUsIHZpZXdMaW5lTnVtYmVyLnRvU3RyaW5nKCkpO1xuXHRcdHJldHVybiBuZXcgUmljaFJlbmRlcmVkU2NyZWVuUmVhZGVyTGluZShkb21Ob2RlLCByZW5kZXJPdXRwdXQuY2hhcmFjdGVyTWFwcGluZyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTZWxlY3Rpb25PblNjcmVlblJlYWRlckNvbnRlbnQoY29udGV4dDogVmlld0NvbnRleHQsIHJlbmRlcmVkTGluZXM6IE1hcDxudW1iZXIsIFJpY2hSZW5kZXJlZFNjcmVlblJlYWRlckxpbmU+LCB2aWV3U2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVEb2N1bWVudCA9IGdldEFjdGl2ZVdpbmRvdygpLmRvY3VtZW50O1xuXHRcdGNvbnN0IGFjdGl2ZURvY3VtZW50U2VsZWN0aW9uID0gYWN0aXZlRG9jdW1lbnQuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKCFhY3RpdmVEb2N1bWVudFNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSB2aWV3U2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gdmlld1NlbGVjdGlvbi5lbmRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHN0YXJ0UmVuZGVyZWRMaW5lID0gcmVuZGVyZWRMaW5lcy5nZXQoc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBlbmRSZW5kZXJlZExpbmUgPSByZW5kZXJlZExpbmVzLmdldChlbmRMaW5lTnVtYmVyKTtcblx0XHRpZiAoIXN0YXJ0UmVuZGVyZWRMaW5lIHx8ICFlbmRSZW5kZXJlZExpbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gY29udGV4dC52aWV3TW9kZWw7XG5cdFx0Y29uc3QgbW9kZWwgPSB2aWV3TW9kZWwubW9kZWw7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXI7XG5cdFx0Y29uc3Qgc3RhcnRSYW5nZSA9IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIDEsIHN0YXJ0TGluZU51bWJlciwgdmlld1NlbGVjdGlvbi5zZWxlY3Rpb25TdGFydENvbHVtbik7XG5cdFx0Y29uc3QgbW9kZWxTdGFydFJhbmdlID0gY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdSYW5nZVRvTW9kZWxSYW5nZShzdGFydFJhbmdlKTtcblx0XHRjb25zdCBjaGFyYWN0ZXJDb3VudEZvclN0YXJ0ID0gbW9kZWwuZ2V0Q2hhcmFjdGVyQ291bnRJblJhbmdlKG1vZGVsU3RhcnRSYW5nZSk7XG5cdFx0Y29uc3QgZW5kUmFuZ2UgPSBuZXcgUmFuZ2UoZW5kTGluZU51bWJlciwgMSwgZW5kTGluZU51bWJlciwgdmlld1NlbGVjdGlvbi5wb3NpdGlvbkNvbHVtbik7XG5cdFx0Y29uc3QgbW9kZWxFbmRSYW5nZSA9IGNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRWaWV3UmFuZ2VUb01vZGVsUmFuZ2UoZW5kUmFuZ2UpO1xuXHRcdGNvbnN0IGNoYXJhY3RlckNvdW50Rm9yRW5kID0gbW9kZWwuZ2V0Q2hhcmFjdGVyQ291bnRJblJhbmdlKG1vZGVsRW5kUmFuZ2UpO1xuXHRcdGNvbnN0IHN0YXJ0RG9tUG9zaXRpb24gPSBzdGFydFJlbmRlcmVkTGluZS5jaGFyYWN0ZXJNYXBwaW5nLmdldERvbVBvc2l0aW9uKGNoYXJhY3RlckNvdW50Rm9yU3RhcnQpO1xuXHRcdGNvbnN0IGVuZERvbVBvc2l0aW9uID0gZW5kUmVuZGVyZWRMaW5lLmNoYXJhY3Rlck1hcHBpbmcuZ2V0RG9tUG9zaXRpb24oY2hhcmFjdGVyQ291bnRGb3JFbmQpO1xuXHRcdGNvbnN0IHN0YXJ0RG9tTm9kZSA9IHN0YXJ0UmVuZGVyZWRMaW5lLmRvbU5vZGUuZmlyc3RDaGlsZCE7XG5cdFx0Y29uc3QgZW5kRG9tTm9kZSA9IGVuZFJlbmRlcmVkTGluZS5kb21Ob2RlLmZpcnN0Q2hpbGQhO1xuXHRcdGNvbnN0IHN0YXJ0Q2hpbGRyZW4gPSBzdGFydERvbU5vZGUuY2hpbGROb2Rlcztcblx0XHRjb25zdCBlbmRDaGlsZHJlbiA9IGVuZERvbU5vZGUuY2hpbGROb2Rlcztcblx0XHRjb25zdCBzdGFydE5vZGUgPSBzdGFydENoaWxkcmVuLml0ZW0oc3RhcnREb21Qb3NpdGlvbi5wYXJ0SW5kZXgpO1xuXHRcdGNvbnN0IGVuZE5vZGUgPSBlbmRDaGlsZHJlbi5pdGVtKGVuZERvbVBvc2l0aW9uLnBhcnRJbmRleCk7XG5cdFx0aWYgKCFzdGFydE5vZGUuZmlyc3RDaGlsZCB8fCAhZW5kTm9kZS5maXJzdENoaWxkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3NldElnbm9yZVNlbGVjdGlvbkNoYW5nZVRpbWUoJ3NldFJhbmdlJyk7XG5cdFx0YWN0aXZlRG9jdW1lbnRTZWxlY3Rpb24uc2V0QmFzZUFuZEV4dGVudChcblx0XHRcdHN0YXJ0Tm9kZS5maXJzdENoaWxkLFxuXHRcdFx0dmlld1NlbGVjdGlvbi5zdGFydENvbHVtbiA9PT0gMSA/IDAgOiBzdGFydERvbVBvc2l0aW9uLmNoYXJJbmRleCArIDEsXG5cdFx0XHRlbmROb2RlLmZpcnN0Q2hpbGQsXG5cdFx0XHR2aWV3U2VsZWN0aW9uLmVuZENvbHVtbiA9PT0gMSA/IDAgOiBlbmREb21Qb3NpdGlvbi5jaGFySW5kZXggKyAxXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNjcmVlblJlYWRlckNvbnRlbnRMaW5lSW50ZXJ2YWxzKHByaW1hcnlTZWxlY3Rpb246IFNlbGVjdGlvbik6IFJpY2hTY3JlZW5SZWFkZXJTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0cmF0ZWd5LmZyb21FZGl0b3JTZWxlY3Rpb24odGhpcy5fY29udGV4dC52aWV3TW9kZWwsIHByaW1hcnlTZWxlY3Rpb24sIHRoaXMuX2FjY2Vzc2liaWxpdHlQYWdlU2l6ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFZGl0b3JTZWxlY3Rpb25Gcm9tRG9tUmFuZ2UoKTogU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkTGluZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZ2V0QWN0aXZlV2luZG93KCkuZG9jdW1lbnQuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKCFzZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2VDb3VudCA9IHNlbGVjdGlvbi5yYW5nZUNvdW50O1xuXHRcdGlmIChyYW5nZUNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlID0gc2VsZWN0aW9uLmdldFJhbmdlQXQoMCk7XG5cdFx0Y29uc3Qgc3RhcnRDb250YWluZXIgPSByYW5nZS5zdGFydENvbnRhaW5lcjtcblx0XHRjb25zdCBlbmRDb250YWluZXIgPSByYW5nZS5lbmRDb250YWluZXI7XG5cdFx0Y29uc3Qgc3RhcnRTcGFuRWxlbWVudCA9IHN0YXJ0Q29udGFpbmVyLnBhcmVudEVsZW1lbnQ7XG5cdFx0Y29uc3QgZW5kU3BhbkVsZW1lbnQgPSBlbmRDb250YWluZXIucGFyZW50RWxlbWVudDtcblx0XHRpZiAoIXN0YXJ0U3BhbkVsZW1lbnQgfHwgIWlzSFRNTEVsZW1lbnQoc3RhcnRTcGFuRWxlbWVudCkgfHwgIWVuZFNwYW5FbGVtZW50IHx8ICFpc0hUTUxFbGVtZW50KGVuZFNwYW5FbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydExpbmVEb21Ob2RlID0gc3RhcnRTcGFuRWxlbWVudC5wYXJlbnRFbGVtZW50Py5wYXJlbnRFbGVtZW50O1xuXHRcdGNvbnN0IGVuZExpbmVEb21Ob2RlID0gZW5kU3BhbkVsZW1lbnQucGFyZW50RWxlbWVudD8ucGFyZW50RWxlbWVudDtcblx0XHRpZiAoIXN0YXJ0TGluZURvbU5vZGUgfHwgIWVuZExpbmVEb21Ob2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlckF0dHJpYnV0ZSA9IHN0YXJ0TGluZURvbU5vZGUuZ2V0QXR0cmlidXRlKExJTkVfTlVNQkVSX0FUVFJJQlVURSk7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlckF0dHJpYnV0ZSA9IGVuZExpbmVEb21Ob2RlLmdldEF0dHJpYnV0ZShMSU5FX05VTUJFUl9BVFRSSUJVVEUpO1xuXHRcdGlmICghc3RhcnRMaW5lTnVtYmVyQXR0cmlidXRlIHx8ICFlbmRMaW5lTnVtYmVyQXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHBhcnNlSW50KHN0YXJ0TGluZU51bWJlckF0dHJpYnV0ZSk7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHBhcnNlSW50KGVuZExpbmVOdW1iZXJBdHRyaWJ1dGUpO1xuXHRcdGNvbnN0IHN0YXJ0TWFwcGluZyA9IHRoaXMuX3JlbmRlcmVkTGluZXMuZ2V0KHN0YXJ0TGluZU51bWJlcik/LmNoYXJhY3Rlck1hcHBpbmc7XG5cdFx0Y29uc3QgZW5kTWFwcGluZyA9IHRoaXMuX3JlbmRlcmVkTGluZXMuZ2V0KGVuZExpbmVOdW1iZXIpPy5jaGFyYWN0ZXJNYXBwaW5nO1xuXHRcdGlmICghc3RhcnRNYXBwaW5nIHx8ICFlbmRNYXBwaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gZ2V0Q29sdW1uT2ZOb2RlT2Zmc2V0KHN0YXJ0TWFwcGluZywgc3RhcnRTcGFuRWxlbWVudCwgcmFuZ2Uuc3RhcnRPZmZzZXQpO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IGdldENvbHVtbk9mTm9kZU9mZnNldChlbmRNYXBwaW5nLCBlbmRTcGFuRWxlbWVudCwgcmFuZ2UuZW5kT2Zmc2V0KTtcblx0XHRpZiAoc2VsZWN0aW9uLmRpcmVjdGlvbiA9PT0gJ2ZvcndhcmQnKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRzdGFydENvbHVtbixcblx0XHRcdFx0ZW5kTGluZU51bWJlcixcblx0XHRcdFx0ZW5kQ29sdW1uXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihcblx0XHRcdFx0ZW5kTGluZU51bWJlcixcblx0XHRcdFx0ZW5kQ29sdW1uLFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSaWNoUmVuZGVyZWRTY3JlZW5SZWFkZXJMaW5lIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxEaXZFbGVtZW50LFxuXHRcdHB1YmxpYyByZWFkb25seSBjaGFyYWN0ZXJNYXBwaW5nOiBDaGFyYWN0ZXJNYXBwaW5nXG5cdCkgeyB9XG59XG5cbmNsYXNzIExpbmVJbnRlcnZhbCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzdGFydExpbmU6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZW5kTGluZTogbnVtYmVyXG5cdCkgeyB9XG59XG5cbmNsYXNzIFJpY2hTY3JlZW5SZWFkZXJTdGF0ZSB7XG5cblx0cHVibGljIHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElTaW1wbGVNb2RlbCwgcHVibGljIHJlYWRvbmx5IGludGVydmFsczogTGluZUludGVydmFsW10pIHtcblx0XHRsZXQgdmFsdWUgPSAnJztcblx0XHRmb3IgKGNvbnN0IGludGVydmFsIG9mIGludGVydmFscykge1xuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IGludGVydmFsLnN0YXJ0TGluZTsgbGluZU51bWJlciA8PSBpbnRlcnZhbC5lbmRMaW5lOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0dmFsdWUgKz0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcikgKyAnXFxuJztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBSaWNoU2NyZWVuUmVhZGVyU3RhdGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZSA9PT0gb3RoZXIudmFsdWU7XG5cdH1cblxuXHRzdGF0aWMgZ2V0IE5VTEwoKTogUmljaFNjcmVlblJlYWRlclN0YXRlIHtcblx0XHRjb25zdCBudWxsTW9kZWw6IElTaW1wbGVNb2RlbCA9IHtcblx0XHRcdGdldExpbmVDb250ZW50OiAoKSA9PiAnJyxcblx0XHRcdGdldExpbmVDb3VudDogKCkgPT4gMSxcblx0XHRcdGdldExpbmVNYXhDb2x1bW46ICgpID0+IDEsXG5cdFx0XHRnZXRWYWx1ZUluUmFuZ2U6ICgpID0+ICcnLFxuXHRcdFx0Z2V0VmFsdWVMZW5ndGhJblJhbmdlOiAoKSA9PiAwLFxuXHRcdFx0bW9kaWZ5UG9zaXRpb246IChwb3NpdGlvbiwgb2Zmc2V0KSA9PiBwb3NpdGlvblxuXHRcdH07XG5cdFx0cmV0dXJuIG5ldyBSaWNoU2NyZWVuUmVhZGVyU3RhdGUobnVsbE1vZGVsLCBbXSk7XG5cdH1cbn1cblxuY2xhc3MgUmljaFBhZ2VkU2NyZWVuUmVhZGVyU3RyYXRlZ3kgaW1wbGVtZW50cyBJUGFnZWRTY3JlZW5SZWFkZXJTdHJhdGVneTxSaWNoU2NyZWVuUmVhZGVyU3RhdGU+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHsgfVxuXG5cdHByaXZhdGUgX2dldFBhZ2VPZkxpbmUobGluZU51bWJlcjogbnVtYmVyLCBsaW5lc1BlclBhZ2U6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGguZmxvb3IoKGxpbmVOdW1iZXIgLSAxKSAvIGxpbmVzUGVyUGFnZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSYW5nZUZvclBhZ2UoY29udGV4dDogSVNpbXBsZU1vZGVsLCBwYWdlOiBudW1iZXIsIGxpbmVzUGVyUGFnZTogbnVtYmVyKTogTGluZUludGVydmFsIHtcblx0XHRjb25zdCBvZmZzZXQgPSBwYWdlICogbGluZXNQZXJQYWdlO1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IG9mZnNldCArIDE7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IE1hdGgubWluKG9mZnNldCArIGxpbmVzUGVyUGFnZSwgY29udGV4dC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0cmV0dXJuIG5ldyBMaW5lSW50ZXJ2YWwoc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBmcm9tRWRpdG9yU2VsZWN0aW9uKGNvbnRleHQ6IElTaW1wbGVNb2RlbCwgdmlld1NlbGVjdGlvbjogU2VsZWN0aW9uLCBsaW5lc1BlclBhZ2U6IG51bWJlcik6IFJpY2hTY3JlZW5SZWFkZXJTdGF0ZSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uU3RhcnRQYWdlID0gdGhpcy5fZ2V0UGFnZU9mTGluZSh2aWV3U2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgbGluZXNQZXJQYWdlKTtcblx0XHRjb25zdCBzZWxlY3Rpb25TdGFydFBhZ2VSYW5nZSA9IHRoaXMuX2dldFJhbmdlRm9yUGFnZShjb250ZXh0LCBzZWxlY3Rpb25TdGFydFBhZ2UsIGxpbmVzUGVyUGFnZSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uRW5kUGFnZSA9IHRoaXMuX2dldFBhZ2VPZkxpbmUodmlld1NlbGVjdGlvbi5lbmRMaW5lTnVtYmVyLCBsaW5lc1BlclBhZ2UpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbkVuZFBhZ2VSYW5nZSA9IHRoaXMuX2dldFJhbmdlRm9yUGFnZShjb250ZXh0LCBzZWxlY3Rpb25FbmRQYWdlLCBsaW5lc1BlclBhZ2UpO1xuXHRcdGNvbnN0IGxpbmVJbnRlcnZhbHM6IExpbmVJbnRlcnZhbFtdID0gW3sgc3RhcnRMaW5lOiBzZWxlY3Rpb25TdGFydFBhZ2VSYW5nZS5zdGFydExpbmUsIGVuZExpbmU6IHNlbGVjdGlvblN0YXJ0UGFnZVJhbmdlLmVuZExpbmUgfV07XG5cdFx0aWYgKHNlbGVjdGlvblN0YXJ0UGFnZSArIDEgPCBzZWxlY3Rpb25FbmRQYWdlKSB7XG5cdFx0XHRsaW5lSW50ZXJ2YWxzLnB1c2goeyBzdGFydExpbmU6IHNlbGVjdGlvbkVuZFBhZ2VSYW5nZS5zdGFydExpbmUsIGVuZExpbmU6IHNlbGVjdGlvbkVuZFBhZ2VSYW5nZS5lbmRMaW5lIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFJpY2hTY3JlZW5SZWFkZXJTdGF0ZShjb250ZXh0LCBsaW5lSW50ZXJ2YWxzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QixpQkFBaUIscUJBQXFCO0FBRXRFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCLG9CQUErRTtBQUM3RyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBMkIsaUJBQWlCLHNCQUFzQjtBQUlsRSxTQUFTLFlBQXlCLHlCQUF5QjtBQUMzRCxTQUFTLFdBQVc7QUFHcEIsU0FBUyw2QkFBNkI7QUFFdEMsTUFBTSxXQUFXLHlCQUF5QiwyQkFBMkIsRUFBRSxZQUFZLFdBQVMsTUFBTSxDQUFDO0FBRW5HLE1BQU0sd0JBQXdCO0FBRXZCLElBQU0sMEJBQU4sY0FBc0MsV0FBMkM7QUFBQSxFQWF2RixZQUNrQixVQUNBLFVBQ0EsaUJBQ3VCLHVCQUN2QztBQUNELFVBQU07QUFMVztBQUNBO0FBQ0E7QUFDdUI7QUFmekMsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBRWxGLFNBQVEseUJBQWlDO0FBQ3pDLFNBQVEsNkJBQXFDO0FBRTdDLFNBQVEsU0FBZ0Msc0JBQXNCO0FBQzlELFNBQVEsWUFBMkMsSUFBSSw4QkFBOEI7QUFFckYsU0FB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
