import * as dom from "../../../../base/browser/dom.js";
import { createTrustedTypesPolicy } from "../../../../base/browser/trustedTypes.js";
import { equals } from "../../../../base/common/arrays.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import "./stickyScroll.css";
import { OverlayWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { getColumnOfNodeOffset } from "../../../browser/viewParts/viewLines/viewLine.js";
import { EmbeddedCodeEditorWidget } from "../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption, RenderLineNumbersType } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { StringBuilder } from "../../../common/core/stringBuilder.js";
import { LineDecoration } from "../../../common/viewLayout/lineDecorations.js";
import { RenderLineInput, renderViewLine } from "../../../common/viewLayout/viewLineRenderer.js";
import { foldingCollapsedIcon, foldingExpandedIcon } from "../../folding/browser/foldingDecorations.js";
import { Emitter } from "../../../../base/common/event.js";
class StickyScrollWidgetState {
  constructor(startLineNumbers, endLineNumbers, lastLineRelativePosition, showEndForLine = null) {
    this.startLineNumbers = startLineNumbers;
    this.endLineNumbers = endLineNumbers;
    this.lastLineRelativePosition = lastLineRelativePosition;
    this.showEndForLine = showEndForLine;
  }
  equals(other) {
    return !!other && this.lastLineRelativePosition === other.lastLineRelativePosition && this.showEndForLine === other.showEndForLine && equals(this.startLineNumbers, other.startLineNumbers) && equals(this.endLineNumbers, other.endLineNumbers);
  }
  static get Empty() {
    return new StickyScrollWidgetState([], [], 0);
  }
}
const _ttPolicy = createTrustedTypesPolicy("stickyScrollViewLayer", { createHTML: (value) => value });
const STICKY_INDEX_ATTR = "data-sticky-line-index";
const STICKY_IS_LINE_ATTR = "data-sticky-is-line";
const STICKY_IS_LINE_NUMBER_ATTR = "data-sticky-is-line-number";
const STICKY_IS_FOLDING_ICON_ATTR = "data-sticky-is-folding-icon";
class StickyScrollWidget extends Disposable {
  constructor(editor) {
    super();
    this._foldingIconStore = this._register(new DisposableStore());
    this._rootDomNode = document.createElement("div");
    this._lineNumbersDomNode = document.createElement("div");
    this._linesDomNodeScrollable = document.createElement("div");
    this._linesDomNode = document.createElement("div");
    this._renderedStickyLines = [];
    this._lineNumbers = [];
    this._lastLineRelativePosition = 0;
    this._minContentWidthInPx = 0;
    this._isOnGlyphMargin = false;
    this._height = -1;
    this._onDidChangeStickyScrollHeight = this._register(new Emitter());
    this.onDidChangeStickyScrollHeight = this._onDidChangeStickyScrollHeight.event;
    this._editor = editor;
    this._lineNumbersDomNode.className = "sticky-widget-line-numbers";
    this._lineNumbersDomNode.setAttribute("role", "none");
    this._linesDomNode.className = "sticky-widget-lines";
    this._linesDomNode.setAttribute("role", "list");
    this._linesDomNodeScrollable.className = "sticky-widget-lines-scrollable";
    this._linesDomNodeScrollable.appendChild(this._linesDomNode);
    this._rootDomNode.className = "sticky-widget";
    this._rootDomNode.classList.toggle("peek", editor instanceof EmbeddedCodeEditorWidget);
    this._rootDomNode.appendChild(this._lineNumbersDomNode);
    this._rootDomNode.appendChild(this._linesDomNodeScrollable);
    this._setHeight(0);
    const updateScrollLeftPosition = () => {
      this._linesDomNode.style.left = this._editor.getOption(EditorOption.stickyScroll).scrollWithEditor ? `-${this._editor.getScrollLeft()}px` : "0px";
    };
    this._register(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.stickyScroll)) {
        updateScrollLeftPosition();
      }
    }));
    this._register(this._editor.onDidScrollChange((e) => {
      if (e.scrollLeftChanged) {
        updateScrollLeftPosition();
      }
      if (e.scrollWidthChanged) {
        this._updateWidgetWidth();
      }
    }));
    this._register(this._editor.onDidChangeModel(() => {
      updateScrollLeftPosition();
      this._updateWidgetWidth();
    }));
    updateScrollLeftPosition();
    this._register(this._editor.onDidLayoutChange((e) => {
      this._updateWidgetWidth();
    }));
    this._updateWidgetWidth();
  }
  get height() {
    return this._height;
  }
  get lineNumbers() {
    return this._lineNumbers;
  }
  get lineNumberCount() {
    return this._lineNumbers.length;
  }
  getRenderedStickyLine(lineNumber) {
    return this._renderedStickyLines.find((stickyLine) => stickyLine.lineNumber === lineNumber);
  }
  getCurrentLines() {
    return this._lineNumbers;
  }
  setState(state, foldingModel, rebuildFromIndexCandidate) {
    const currentStateAndPreviousStateUndefined = !this._state && !state;
    const currentStateDefinedAndEqualsPreviousState = this._state && this._state.equals(state);
    if (rebuildFromIndexCandidate === void 0 && (currentStateAndPreviousStateUndefined || currentStateDefinedAndEqualsPreviousState)) {
      return;
    }
    const data = this._findRenderingData(state);
    const previousLineNumbers = this._lineNumbers;
    this._lineNumbers = data.lineNumbers;
    this._lastLineRelativePosition = data.lastLineRelativePosition;
    const rebuildFromIndex = this._findIndexToRebuildFrom(previousLineNumbers, this._lineNumbers, rebuildFromIndexCandidate);
    this._renderRootNode(this._lineNumbers, this._lastLineRelativePosition, foldingModel, rebuildFromIndex);
    this._state = state;
  }
  _findRenderingData(state) {
    if (!state) {
      return { lineNumbers: [], lastLineRelativePosition: 0 };
    }
    const candidateLineNumbers = [...state.startLineNumbers];
    if (state.showEndForLine !== null) {
      candidateLineNumbers[state.showEndForLine] = state.endLineNumbers[state.showEndForLine];
    }
    let totalHeight = 0;
    for (let i = 0; i < candidateLineNumbers.length; i++) {
      const position = new Position(candidateLineNumbers[i], 1);
      const viewModel = this._editor._getViewModel();
      if (viewModel && position.lineNumber <= viewModel.getLineCount()) {
        totalHeight += this._editor.getLineHeightForPosition(new Position(candidateLineNumbers[i], 1));
      }
    }
    if (totalHeight === 0) {
      return { lineNumbers: [], lastLineRelativePosition: 0 };
    }
    return { lineNumbers: candidateLineNumbers, lastLineRelativePosition: state.lastLineRelativePosition };
  }
  _findIndexToRebuildFrom(previousLineNumbers, newLineNumbers, rebuildFromIndexCandidate) {
    if (newLineNumbers.length === 0) {
      return 0;
    }
    if (rebuildFromIndexCandidate !== void 0) {
      return rebuildFromIndexCandidate;
    }
    const validIndex = newLineNumbers.findIndex((startLineNumber) => !previousLineNumbers.includes(startLineNumber));
    return validIndex === -1 ? 0 : validIndex;
  }
  _updateWidgetWidth() {
    const layoutInfo = this._editor.getLayoutInfo();
    const lineNumbersWidth = layoutInfo.contentLeft;
    this._lineNumbersDomNode.style.width = `${lineNumbersWidth}px`;
    this._linesDomNodeScrollable.style.setProperty("--vscode-editorStickyScroll-scrollableWidth", `${this._editor.getScrollWidth() - layoutInfo.verticalScrollbarWidth}px`);
    this._rootDomNode.style.width = `${layoutInfo.width - layoutInfo.verticalScrollbarWidth}px`;
  }
  _useFoldingOpacityTransition(requireTransitions) {
    this._lineNumbersDomNode.style.setProperty("--vscode-editorStickyScroll-foldingOpacityTransition", `opacity ${requireTransitions ? 0.5 : 0}s`);
  }
  _setFoldingIconsVisibility(allVisible) {
    for (const line of this._renderedStickyLines) {
      const foldingIcon = line.foldingIcon;
      if (!foldingIcon) {
        continue;
      }
      foldingIcon.setVisible(allVisible ? true : foldingIcon.isCollapsed);
    }
  }
  async _renderRootNode(lineNumbers, lastLineRelativePosition, foldingModel, rebuildFromIndex) {
    const viewModel = this._editor._getViewModel();
    if (!viewModel) {
      this._clearWidget();
      return;
    }
    if (lineNumbers.length === 0) {
      this._clearWidget();
      return;
    }
    const renderedStickyLines = [];
    const lastLineNumber = lineNumbers[lineNumbers.length - 1];
    let top = 0;
    for (let i = 0; i < this._renderedStickyLines.length; i++) {
      if (i < rebuildFromIndex) {
        const renderedLine = this._renderedStickyLines[i];
        renderedStickyLines.push(this._updatePosition(renderedLine, top, renderedLine.lineNumber === lastLineNumber));
        top += renderedLine.height;
      } else {
        const renderedLine = this._renderedStickyLines[i];
        renderedLine.lineNumberDomNode.remove();
        renderedLine.lineDomNode.remove();
      }
    }
    const layoutInfo = this._editor.getLayoutInfo();
    for (let i = rebuildFromIndex; i < lineNumbers.length; i++) {
      const lineNumber = lineNumbers[i];
      if (lineNumber > viewModel.getLineCount()) {
        continue;
      }
      const stickyLine = this._renderChildNode(viewModel, i, lineNumber, top, lastLineNumber === lineNumber, foldingModel, layoutInfo);
      top += stickyLine.height;
      this._linesDomNode.appendChild(stickyLine.lineDomNode);
      this._lineNumbersDomNode.appendChild(stickyLine.lineNumberDomNode);
      renderedStickyLines.push(stickyLine);
    }
    if (foldingModel) {
      this._setFoldingHoverListeners();
      this._useFoldingOpacityTransition(!this._isOnGlyphMargin);
    }
    this._minContentWidthInPx = Math.max(...this._renderedStickyLines.map((l) => l.scrollWidth)) + layoutInfo.verticalScrollbarWidth;
    this._renderedStickyLines = renderedStickyLines;
    this._setHeight(top + lastLineRelativePosition);
    this._editor.layoutOverlayWidget(this);
  }
  _clearWidget() {
    for (let i = 0; i < this._renderedStickyLines.length; i++) {
      const stickyLine = this._renderedStickyLines[i];
      stickyLine.lineNumberDomNode.remove();
      stickyLine.lineDomNode.remove();
    }
    this._setHeight(0);
  }
  _setHeight(height) {
    if (this._height === height) {
      return;
    }
    this._height = height;
    if (this._height === 0) {
      this._rootDomNode.style.display = "none";
    } else {
      this._rootDomNode.style.display = "block";
      this._lineNumbersDomNode.style.height = `${this._height}px`;
      this._linesDomNodeScrollable.style.height = `${this._height}px`;
      this._rootDomNode.style.height = `${this._height}px`;
    }
    this._onDidChangeStickyScrollHeight.fire({ height: this._height });
  }
  _setFoldingHoverListeners() {
    this._foldingIconStore.clear();
    const showFoldingControls = this._editor.getOption(EditorOption.showFoldingControls);
    if (showFoldingControls !== "mouseover") {
      return;
    }
    this._foldingIconStore.clear();
    this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_ENTER, () => {
      this._isOnGlyphMargin = true;
      this._setFoldingIconsVisibility(true);
    }));
    this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_LEAVE, () => {
      this._isOnGlyphMargin = false;
      this._useFoldingOpacityTransition(true);
      this._setFoldingIconsVisibility(false);
    }));
  }
  _renderChildNode(viewModel, index, line, top, isLastLine, foldingModel, layoutInfo) {
    const renderedLine = new RenderedStickyLine(
      this._editor,
      viewModel,
      layoutInfo,
      foldingModel,
      this._isOnGlyphMargin,
      index,
      line
    );
    return this._updatePosition(renderedLine, top, isLastLine);
  }
  _updatePosition(stickyLine, top, isLastLine) {
    const lineHTMLNode = stickyLine.lineDomNode;
    const lineNumberHTMLNode = stickyLine.lineNumberDomNode;
    if (isLastLine) {
      const zIndex = "0";
      lineHTMLNode.style.zIndex = zIndex;
      lineNumberHTMLNode.style.zIndex = zIndex;
      const updatedTop = `${top + this._lastLineRelativePosition + (stickyLine.foldingIcon?.isCollapsed ? 1 : 0)}px`;
      lineHTMLNode.style.top = updatedTop;
      lineNumberHTMLNode.style.top = updatedTop;
    } else {
      const zIndex = "1";
      lineHTMLNode.style.zIndex = zIndex;
      lineNumberHTMLNode.style.zIndex = zIndex;
      lineHTMLNode.style.top = `${top}px`;
      lineNumberHTMLNode.style.top = `${top}px`;
    }
    return stickyLine;
  }
  getId() {
    return "editor.contrib.stickyScrollWidget";
  }
  getDomNode() {
    return this._rootDomNode;
  }
  getPosition() {
    return {
      preference: OverlayWidgetPositionPreference.TOP_CENTER,
      stackOrdinal: 10
    };
  }
  getMinContentWidthInPx() {
    return this._minContentWidthInPx;
  }
  focusLineWithIndex(index) {
    if (0 <= index && index < this._renderedStickyLines.length) {
      this._renderedStickyLines[index].lineDomNode.focus();
    }
  }
  /**
   * Given a leaf dom node, tries to find the editor position.
   */
  getEditorPositionFromNode(spanDomNode) {
    if (!spanDomNode || spanDomNode.children.length > 0) {
      return null;
    }
    const renderedStickyLine = this._getRenderedStickyLineFromChildDomNode(spanDomNode);
    if (!renderedStickyLine) {
      return null;
    }
    const column = getColumnOfNodeOffset(renderedStickyLine.characterMapping, spanDomNode, 0);
    return new Position(renderedStickyLine.lineNumber, column);
  }
  getLineNumberFromChildDomNode(domNode) {
    return this._getRenderedStickyLineFromChildDomNode(domNode)?.lineNumber ?? null;
  }
  _getRenderedStickyLineFromChildDomNode(domNode) {
    const index = this.getLineIndexFromChildDomNode(domNode);
    if (index === null || index < 0 || index >= this._renderedStickyLines.length) {
      return null;
    }
    return this._renderedStickyLines[index];
  }
  /**
   * Given a child dom node, tries to find the line number attribute that was stored in the node.
   * @returns the attribute value or null if none is found.
   */
  getLineIndexFromChildDomNode(domNode) {
    const lineIndex = this._getAttributeValue(domNode, STICKY_INDEX_ATTR);
    return lineIndex ? parseInt(lineIndex, 10) : null;
  }
  /**
   * Given a child dom node, tries to find if it is (contained in) a sticky line.
   * @returns a boolean.
   */
  isInStickyLine(domNode) {
    const isInLine = this._getAttributeValue(domNode, STICKY_IS_LINE_ATTR);
    return isInLine !== void 0;
  }
  /**
   * Given a child dom node, tries to find if this dom node is (contained in) a sticky folding icon.
   * @returns a boolean.
   */
  isInFoldingIconDomNode(domNode) {
    const isInFoldingIcon = this._getAttributeValue(domNode, STICKY_IS_FOLDING_ICON_ATTR);
    return isInFoldingIcon !== void 0;
  }
  /**
   * Given the dom node, finds if it or its parent sequence contains the given attribute.
   * @returns the attribute value or undefined.
   */
  _getAttributeValue(domNode, attribute) {
    while (domNode && domNode !== this._rootDomNode) {
      const line = domNode.getAttribute(attribute);
      if (line !== null) {
        return line;
      }
      domNode = domNode.parentElement;
    }
    return;
  }
}
class RenderedStickyLine {
  constructor(editor, viewModel, layoutInfo, foldingModel, isOnGlyphMargin, index, lineNumber) {
    this.index = index;
    this.lineNumber = lineNumber;
    const viewLineNumber = viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(lineNumber, 1)).lineNumber;
    const lineRenderingData = viewModel.getViewLineRenderingData(viewLineNumber);
    const lineNumberOption = editor.getOption(EditorOption.lineNumbers);
    const verticalScrollbarSize = editor.getOption(EditorOption.scrollbar).verticalScrollbarSize;
    let actualInlineDecorations;
    try {
      actualInlineDecorations = LineDecoration.filter(lineRenderingData.inlineDecorations, viewLineNumber, lineRenderingData.minColumn, lineRenderingData.maxColumn);
    } catch (err) {
      actualInlineDecorations = [];
    }
    const lineHeight = editor.getLineHeightForPosition(new Position(lineNumber, 1));
    const textDirection = viewModel.getTextDirection(lineNumber);
    const renderLineInput = new RenderLineInput(
      true,
      true,
      lineRenderingData.content,
      lineRenderingData.continuesWithWrappedLine,
      lineRenderingData.isBasicASCII,
      lineRenderingData.containsRTL,
      0,
      lineRenderingData.tokens,
      actualInlineDecorations,
      lineRenderingData.tabSize,
      lineRenderingData.startVisibleColumn,
      1,
      1,
      1,
      500,
      "none",
      true,
      true,
      null,
      textDirection,
      verticalScrollbarSize
    );
    const sb = new StringBuilder(2e3);
    const renderOutput = renderViewLine(renderLineInput, sb);
    this.characterMapping = renderOutput.characterMapping;
    let newLine;
    if (_ttPolicy) {
      newLine = _ttPolicy.createHTML(sb.build());
    } else {
      newLine = sb.build();
    }
    const lineHTMLNode = document.createElement("span");
    lineHTMLNode.setAttribute(STICKY_INDEX_ATTR, String(index));
    lineHTMLNode.setAttribute(STICKY_IS_LINE_ATTR, "");
    lineHTMLNode.setAttribute("role", "listitem");
    lineHTMLNode.tabIndex = 0;
    lineHTMLNode.className = "sticky-line-content";
    lineHTMLNode.classList.add(`stickyLine${lineNumber}`);
    lineHTMLNode.style.lineHeight = `${lineHeight}px`;
    lineHTMLNode.innerHTML = newLine;
    const lineNumberHTMLNode = document.createElement("span");
    lineNumberHTMLNode.setAttribute(STICKY_INDEX_ATTR, String(index));
    lineNumberHTMLNode.setAttribute(STICKY_IS_LINE_NUMBER_ATTR, "");
    lineNumberHTMLNode.className = "sticky-line-number";
    lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
    const lineNumbersWidth = layoutInfo.contentLeft;
    lineNumberHTMLNode.style.width = `${lineNumbersWidth}px`;
    const innerLineNumberHTML = document.createElement("span");
    if (lineNumberOption.renderType === RenderLineNumbersType.On || lineNumberOption.renderType === RenderLineNumbersType.Interval && lineNumber % 10 === 0) {
      innerLineNumberHTML.innerText = lineNumber.toString();
    } else if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
      innerLineNumberHTML.innerText = Math.abs(lineNumber - editor.getPosition().lineNumber).toString();
    }
    innerLineNumberHTML.className = "sticky-line-number-inner";
    innerLineNumberHTML.style.width = `${layoutInfo.lineNumbersWidth}px`;
    innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft}px`;
    lineNumberHTMLNode.appendChild(innerLineNumberHTML);
    this.foldingIcon = this._renderFoldingIconForLine(editor, foldingModel, lineNumber, lineHeight, isOnGlyphMargin);
    if (this.foldingIcon) {
      lineNumberHTMLNode.appendChild(this.foldingIcon.domNode);
      this.foldingIcon.domNode.style.left = `${layoutInfo.lineNumbersWidth + layoutInfo.lineNumbersLeft}px`;
      this.foldingIcon.domNode.style.lineHeight = `${lineHeight}px`;
    }
    editor.applyFontInfo(lineHTMLNode);
    editor.applyFontInfo(lineNumberHTMLNode);
    lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
    lineHTMLNode.style.lineHeight = `${lineHeight}px`;
    lineNumberHTMLNode.style.height = `${lineHeight}px`;
    lineHTMLNode.style.height = `${lineHeight}px`;
    this.scrollWidth = lineHTMLNode.scrollWidth;
    this.lineDomNode = lineHTMLNode;
    this.lineNumberDomNode = lineNumberHTMLNode;
    this.height = lineHeight;
  }
  _renderFoldingIconForLine(editor, foldingModel, line, lineHeight, isOnGlyphMargin) {
    const showFoldingControls = editor.getOption(EditorOption.showFoldingControls);
    if (!foldingModel || showFoldingControls === "never") {
      return;
    }
    const foldingRegions = foldingModel.regions;
    const indexOfFoldingRegion = foldingRegions.findRange(line);
    const startLineNumber = foldingRegions.getStartLineNumber(indexOfFoldingRegion);
    const isFoldingScope = line === startLineNumber;
    if (!isFoldingScope) {
      return;
    }
    const isCollapsed = foldingRegions.isCollapsed(indexOfFoldingRegion);
    const foldingIcon = new StickyFoldingIcon(isCollapsed, startLineNumber, foldingRegions.getEndLineNumber(indexOfFoldingRegion), lineHeight);
    foldingIcon.setVisible(isOnGlyphMargin ? true : isCollapsed || showFoldingControls === "always");
    foldingIcon.domNode.setAttribute(STICKY_IS_FOLDING_ICON_ATTR, "");
    return foldingIcon;
  }
}
class StickyFoldingIcon {
  constructor(isCollapsed, foldingStartLine, foldingEndLine, dimension) {
    this.isCollapsed = isCollapsed;
    this.foldingStartLine = foldingStartLine;
    this.foldingEndLine = foldingEndLine;
    this.dimension = dimension;
    this.domNode = document.createElement("div");
    this.domNode.style.width = `26px`;
    this.domNode.style.height = `${dimension}px`;
    this.domNode.style.lineHeight = `${dimension}px`;
    this.domNode.className = ThemeIcon.asClassName(isCollapsed ? foldingCollapsedIcon : foldingExpandedIcon);
  }
  setVisible(visible) {
    this.domNode.style.cursor = visible ? "pointer" : "default";
    this.domNode.style.opacity = visible ? "1" : "0";
  }
}
export {
  StickyScrollWidget,
  StickyScrollWidgetState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN0aWNreVNjcm9sbFxcYnJvd3Nlclxcc3RpY2t5U2Nyb2xsV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlVHJ1c3RlZFR5cGVzUG9saWN5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RydXN0ZWRUeXBlcy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgJy4vc3RpY2t5U2Nyb2xsLmNzcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSU92ZXJsYXlXaWRnZXQsIElPdmVybGF5V2lkZ2V0UG9zaXRpb24sIE92ZXJsYXlXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgZ2V0Q29sdW1uT2ZOb2RlT2Zmc2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3UGFydHMvdmlld0xpbmVzL3ZpZXdMaW5lLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvckxheW91dEluZm8sIEVkaXRvck9wdGlvbiwgUmVuZGVyTGluZU51bWJlcnNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgU3RyaW5nQnVpbGRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3N0cmluZ0J1aWxkZXIuanMnO1xuaW1wb3J0IHsgTGluZURlY29yYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC9saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhcmFjdGVyTWFwcGluZywgUmVuZGVyTGluZUlucHV0LCByZW5kZXJWaWV3TGluZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZm9sZGluZ0NvbGxhcHNlZEljb24sIGZvbGRpbmdFeHBhbmRlZEljb24gfSBmcm9tICcuLi8uLi9mb2xkaW5nL2Jyb3dzZXIvZm9sZGluZ0RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEZvbGRpbmdNb2RlbCB9IGZyb20gJy4uLy4uL2ZvbGRpbmcvYnJvd3Nlci9mb2xkaW5nTW9kZWwuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcblxuZXhwb3J0IGNsYXNzIFN0aWNreVNjcm9sbFdpZGdldFN0YXRlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc3RhcnRMaW5lTnVtYmVyczogbnVtYmVyW10sXG5cdFx0cmVhZG9ubHkgZW5kTGluZU51bWJlcnM6IG51bWJlcltdLFxuXHRcdHJlYWRvbmx5IGxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbjogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IHNob3dFbmRGb3JMaW5lOiBudW1iZXIgfCBudWxsID0gbnVsbFxuXHQpIHsgfVxuXG5cdGVxdWFscyhvdGhlcjogU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFvdGhlclxuXHRcdFx0JiYgdGhpcy5sYXN0TGluZVJlbGF0aXZlUG9zaXRpb24gPT09IG90aGVyLmxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvblxuXHRcdFx0JiYgdGhpcy5zaG93RW5kRm9yTGluZSA9PT0gb3RoZXIuc2hvd0VuZEZvckxpbmVcblx0XHRcdCYmIGVxdWFscyh0aGlzLnN0YXJ0TGluZU51bWJlcnMsIG90aGVyLnN0YXJ0TGluZU51bWJlcnMpXG5cdFx0XHQmJiBlcXVhbHModGhpcy5lbmRMaW5lTnVtYmVycywgb3RoZXIuZW5kTGluZU51bWJlcnMpO1xuXHR9XG5cblx0c3RhdGljIGdldCBFbXB0eSgpIHtcblx0XHRyZXR1cm4gbmV3IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlKFtdLCBbXSwgMCk7XG5cdH1cbn1cblxuY29uc3QgX3R0UG9saWN5ID0gY3JlYXRlVHJ1c3RlZFR5cGVzUG9saWN5KCdzdGlja3lTY3JvbGxWaWV3TGF5ZXInLCB7IGNyZWF0ZUhUTUw6IHZhbHVlID0+IHZhbHVlIH0pO1xuY29uc3QgU1RJQ0tZX0lOREVYX0FUVFIgPSAnZGF0YS1zdGlja3ktbGluZS1pbmRleCc7XG5jb25zdCBTVElDS1lfSVNfTElORV9BVFRSID0gJ2RhdGEtc3RpY2t5LWlzLWxpbmUnO1xuY29uc3QgU1RJQ0tZX0lTX0xJTkVfTlVNQkVSX0FUVFIgPSAnZGF0YS1zdGlja3ktaXMtbGluZS1udW1iZXInO1xuY29uc3QgU1RJQ0tZX0lTX0ZPTERJTkdfSUNPTl9BVFRSID0gJ2RhdGEtc3RpY2t5LWlzLWZvbGRpbmctaWNvbic7XG5cbmV4cG9ydCBjbGFzcyBTdGlja3lTY3JvbGxXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZvbGRpbmdJY29uU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yb290RG9tTm9kZTogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGluZU51bWJlcnNEb21Ob2RlOiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5lc0RvbU5vZGVTY3JvbGxhYmxlOiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5lc0RvbU5vZGU6IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcjtcblxuXHRwcml2YXRlIF9zdGF0ZTogU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlbmRlcmVkU3RpY2t5TGluZXM6IFJlbmRlcmVkU3RpY2t5TGluZVtdID0gW107XG5cdHByaXZhdGUgX2xpbmVOdW1iZXJzOiBudW1iZXJbXSA9IFtdO1xuXHRwcml2YXRlIF9sYXN0TGluZVJlbGF0aXZlUG9zaXRpb246IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX21pbkNvbnRlbnRXaWR0aEluUHg6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2lzT25HbHlwaE1hcmdpbjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9oZWlnaHQ6IG51bWJlciA9IC0xO1xuXG5cdHB1YmxpYyBnZXQgaGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9oZWlnaHQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN0aWNreVNjcm9sbEhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaGVpZ2h0OiBudW1iZXIgfT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVN0aWNreVNjcm9sbEhlaWdodCA9IHRoaXMuX29uRGlkQ2hhbmdlU3RpY2t5U2Nyb2xsSGVpZ2h0LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3Jcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblx0XHR0aGlzLl9saW5lTnVtYmVyc0RvbU5vZGUuY2xhc3NOYW1lID0gJ3N0aWNreS13aWRnZXQtbGluZS1udW1iZXJzJztcblx0XHR0aGlzLl9saW5lTnVtYmVyc0RvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ25vbmUnKTtcblxuXHRcdHRoaXMuX2xpbmVzRG9tTm9kZS5jbGFzc05hbWUgPSAnc3RpY2t5LXdpZGdldC1saW5lcyc7XG5cdFx0dGhpcy5fbGluZXNEb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0Jyk7XG5cblx0XHR0aGlzLl9saW5lc0RvbU5vZGVTY3JvbGxhYmxlLmNsYXNzTmFtZSA9ICdzdGlja3ktd2lkZ2V0LWxpbmVzLXNjcm9sbGFibGUnO1xuXHRcdHRoaXMuX2xpbmVzRG9tTm9kZVNjcm9sbGFibGUuYXBwZW5kQ2hpbGQodGhpcy5fbGluZXNEb21Ob2RlKTtcblxuXHRcdHRoaXMuX3Jvb3REb21Ob2RlLmNsYXNzTmFtZSA9ICdzdGlja3ktd2lkZ2V0Jztcblx0XHR0aGlzLl9yb290RG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdwZWVrJywgZWRpdG9yIGluc3RhbmNlb2YgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0KTtcblx0XHR0aGlzLl9yb290RG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9saW5lTnVtYmVyc0RvbU5vZGUpO1xuXHRcdHRoaXMuX3Jvb3REb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2xpbmVzRG9tTm9kZVNjcm9sbGFibGUpO1xuXHRcdHRoaXMuX3NldEhlaWdodCgwKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVNjcm9sbExlZnRQb3NpdGlvbiA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2xpbmVzRG9tTm9kZS5zdHlsZS5sZWZ0ID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsKS5zY3JvbGxXaXRoRWRpdG9yID8gYC0ke3RoaXMuX2VkaXRvci5nZXRTY3JvbGxMZWZ0KCl9cHhgIDogJzBweCc7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5zdGlja3lTY3JvbGwpKSB7XG5cdFx0XHRcdHVwZGF0ZVNjcm9sbExlZnRQb3NpdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbExlZnRDaGFuZ2VkKSB7XG5cdFx0XHRcdHVwZGF0ZVNjcm9sbExlZnRQb3NpdGlvbigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuc2Nyb2xsV2lkdGhDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVdpZGdldFdpZHRoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdHVwZGF0ZVNjcm9sbExlZnRQb3NpdGlvbigpO1xuXHRcdFx0dGhpcy5fdXBkYXRlV2lkZ2V0V2lkdGgoKTtcblx0XHR9KSk7XG5cdFx0dXBkYXRlU2Nyb2xsTGVmdFBvc2l0aW9uKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRMYXlvdXRDaGFuZ2UoKGUpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVdpZGdldFdpZHRoKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3VwZGF0ZVdpZGdldFdpZHRoKCk7XG5cdH1cblxuXHRnZXQgbGluZU51bWJlcnMoKTogbnVtYmVyW10ge1xuXHRcdHJldHVybiB0aGlzLl9saW5lTnVtYmVycztcblx0fVxuXG5cdGdldCBsaW5lTnVtYmVyQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZU51bWJlcnMubGVuZ3RoO1xuXHR9XG5cblx0Z2V0UmVuZGVyZWRTdGlja3lMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IFJlbmRlcmVkU3RpY2t5TGluZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXMuZmluZChzdGlja3lMaW5lID0+IHN0aWNreUxpbmUubGluZU51bWJlciA9PT0gbGluZU51bWJlcik7XG5cdH1cblxuXHRnZXRDdXJyZW50TGluZXMoKTogcmVhZG9ubHkgbnVtYmVyW10ge1xuXHRcdHJldHVybiB0aGlzLl9saW5lTnVtYmVycztcblx0fVxuXG5cdHNldFN0YXRlKHN0YXRlOiBTdGlja3lTY3JvbGxXaWRnZXRTdGF0ZSB8IHVuZGVmaW5lZCwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwgfCB1bmRlZmluZWQsIHJlYnVpbGRGcm9tSW5kZXhDYW5kaWRhdGU/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50U3RhdGVBbmRQcmV2aW91c1N0YXRlVW5kZWZpbmVkID0gIXRoaXMuX3N0YXRlICYmICFzdGF0ZTtcblx0XHRjb25zdCBjdXJyZW50U3RhdGVEZWZpbmVkQW5kRXF1YWxzUHJldmlvdXNTdGF0ZSA9IHRoaXMuX3N0YXRlICYmIHRoaXMuX3N0YXRlLmVxdWFscyhzdGF0ZSk7XG5cdFx0aWYgKHJlYnVpbGRGcm9tSW5kZXhDYW5kaWRhdGUgPT09IHVuZGVmaW5lZCAmJiAoY3VycmVudFN0YXRlQW5kUHJldmlvdXNTdGF0ZVVuZGVmaW5lZCB8fCBjdXJyZW50U3RhdGVEZWZpbmVkQW5kRXF1YWxzUHJldmlvdXNTdGF0ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2ZpbmRSZW5kZXJpbmdEYXRhKHN0YXRlKTtcblx0XHRjb25zdCBwcmV2aW91c0xpbmVOdW1iZXJzID0gdGhpcy5fbGluZU51bWJlcnM7XG5cdFx0dGhpcy5fbGluZU51bWJlcnMgPSBkYXRhLmxpbmVOdW1iZXJzO1xuXHRcdHRoaXMuX2xhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbiA9IGRhdGEubGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uO1xuXHRcdGNvbnN0IHJlYnVpbGRGcm9tSW5kZXggPSB0aGlzLl9maW5kSW5kZXhUb1JlYnVpbGRGcm9tKHByZXZpb3VzTGluZU51bWJlcnMsIHRoaXMuX2xpbmVOdW1iZXJzLCByZWJ1aWxkRnJvbUluZGV4Q2FuZGlkYXRlKTtcblx0XHR0aGlzLl9yZW5kZXJSb290Tm9kZSh0aGlzLl9saW5lTnVtYmVycywgdGhpcy5fbGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uLCBmb2xkaW5nTW9kZWwsIHJlYnVpbGRGcm9tSW5kZXgpO1xuXHRcdHRoaXMuX3N0YXRlID0gc3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kUmVuZGVyaW5nRGF0YShzdGF0ZTogU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGUgfCB1bmRlZmluZWQpOiB7IGxpbmVOdW1iZXJzOiBudW1iZXJbXTsgbGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uOiBudW1iZXIgfSB7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHsgbGluZU51bWJlcnM6IFtdLCBsYXN0TGluZVJlbGF0aXZlUG9zaXRpb246IDAgfTtcblx0XHR9XG5cdFx0Y29uc3QgY2FuZGlkYXRlTGluZU51bWJlcnMgPSBbLi4uc3RhdGUuc3RhcnRMaW5lTnVtYmVyc107XG5cdFx0aWYgKHN0YXRlLnNob3dFbmRGb3JMaW5lICE9PSBudWxsKSB7XG5cdFx0XHRjYW5kaWRhdGVMaW5lTnVtYmVyc1tzdGF0ZS5zaG93RW5kRm9yTGluZV0gPSBzdGF0ZS5lbmRMaW5lTnVtYmVyc1tzdGF0ZS5zaG93RW5kRm9yTGluZV07XG5cdFx0fVxuXHRcdGxldCB0b3RhbEhlaWdodCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjYW5kaWRhdGVMaW5lTnVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24oY2FuZGlkYXRlTGluZU51bWJlcnNbaV0sIDEpO1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRcdGlmICh2aWV3TW9kZWwgJiYgcG9zaXRpb24ubGluZU51bWJlciA8PSB2aWV3TW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0dG90YWxIZWlnaHQgKz0gdGhpcy5fZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihuZXcgUG9zaXRpb24oY2FuZGlkYXRlTGluZU51bWJlcnNbaV0sIDEpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRvdGFsSGVpZ2h0ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyBsaW5lTnVtYmVyczogW10sIGxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbjogMCB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBsaW5lTnVtYmVyczogY2FuZGlkYXRlTGluZU51bWJlcnMsIGxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbjogc3RhdGUubGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uIH07XG5cdH1cblxuXHRwcml2YXRlIF9maW5kSW5kZXhUb1JlYnVpbGRGcm9tKHByZXZpb3VzTGluZU51bWJlcnM6IG51bWJlcltdLCBuZXdMaW5lTnVtYmVyczogbnVtYmVyW10sIHJlYnVpbGRGcm9tSW5kZXhDYW5kaWRhdGU/OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChuZXdMaW5lTnVtYmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRpZiAocmVidWlsZEZyb21JbmRleENhbmRpZGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gcmVidWlsZEZyb21JbmRleENhbmRpZGF0ZTtcblx0XHR9XG5cdFx0Y29uc3QgdmFsaWRJbmRleCA9IG5ld0xpbmVOdW1iZXJzLmZpbmRJbmRleChzdGFydExpbmVOdW1iZXIgPT4gIXByZXZpb3VzTGluZU51bWJlcnMuaW5jbHVkZXMoc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0cmV0dXJuIHZhbGlkSW5kZXggPT09IC0xID8gMCA6IHZhbGlkSW5kZXg7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVXaWRnZXRXaWR0aCgpOiB2b2lkIHtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRjb25zdCBsaW5lTnVtYmVyc1dpZHRoID0gbGF5b3V0SW5mby5jb250ZW50TGVmdDtcblx0XHR0aGlzLl9saW5lTnVtYmVyc0RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHtsaW5lTnVtYmVyc1dpZHRofXB4YDtcblx0XHR0aGlzLl9saW5lc0RvbU5vZGVTY3JvbGxhYmxlLnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1lZGl0b3JTdGlja3lTY3JvbGwtc2Nyb2xsYWJsZVdpZHRoJywgYCR7dGhpcy5fZWRpdG9yLmdldFNjcm9sbFdpZHRoKCkgLSBsYXlvdXRJbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGh9cHhgKTtcblx0XHR0aGlzLl9yb290RG9tTm9kZS5zdHlsZS53aWR0aCA9IGAke2xheW91dEluZm8ud2lkdGggLSBsYXlvdXRJbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGh9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlRm9sZGluZ09wYWNpdHlUcmFuc2l0aW9uKHJlcXVpcmVUcmFuc2l0aW9uczogYm9vbGVhbikge1xuXHRcdHRoaXMuX2xpbmVOdW1iZXJzRG9tTm9kZS5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtZWRpdG9yU3RpY2t5U2Nyb2xsLWZvbGRpbmdPcGFjaXR5VHJhbnNpdGlvbicsIGBvcGFjaXR5ICR7cmVxdWlyZVRyYW5zaXRpb25zID8gMC41IDogMH1zYCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRGb2xkaW5nSWNvbnNWaXNpYmlsaXR5KGFsbFZpc2libGU6IGJvb2xlYW4pIHtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgdGhpcy5fcmVuZGVyZWRTdGlja3lMaW5lcykge1xuXHRcdFx0Y29uc3QgZm9sZGluZ0ljb24gPSBsaW5lLmZvbGRpbmdJY29uO1xuXHRcdFx0aWYgKCFmb2xkaW5nSWNvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvbGRpbmdJY29uLnNldFZpc2libGUoYWxsVmlzaWJsZSA/IHRydWUgOiBmb2xkaW5nSWNvbi5pc0NvbGxhcHNlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVuZGVyUm9vdE5vZGUobGluZU51bWJlcnM6IG51bWJlcltdLCBsYXN0TGluZVJlbGF0aXZlUG9zaXRpb246IG51bWJlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwgfCB1bmRlZmluZWQsIHJlYnVpbGRGcm9tSW5kZXg6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX2VkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdHRoaXMuX2NsZWFyV2lkZ2V0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChsaW5lTnVtYmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2NsZWFyV2lkZ2V0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlbmRlcmVkU3RpY2t5TGluZXM6IFJlbmRlcmVkU3RpY2t5TGluZVtdID0gW107XG5cdFx0Y29uc3QgbGFzdExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyc1tsaW5lTnVtYmVycy5sZW5ndGggLSAxXTtcblx0XHRsZXQgdG9wOiBudW1iZXIgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fcmVuZGVyZWRTdGlja3lMaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGkgPCByZWJ1aWxkRnJvbUluZGV4KSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkTGluZSA9IHRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXNbaV07XG5cdFx0XHRcdHJlbmRlcmVkU3RpY2t5TGluZXMucHVzaCh0aGlzLl91cGRhdGVQb3NpdGlvbihyZW5kZXJlZExpbmUsIHRvcCwgcmVuZGVyZWRMaW5lLmxpbmVOdW1iZXIgPT09IGxhc3RMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdHRvcCArPSByZW5kZXJlZExpbmUuaGVpZ2h0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZWRMaW5lID0gdGhpcy5fcmVuZGVyZWRTdGlja3lMaW5lc1tpXTtcblx0XHRcdFx0cmVuZGVyZWRMaW5lLmxpbmVOdW1iZXJEb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0XHRyZW5kZXJlZExpbmUubGluZURvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdGZvciAobGV0IGkgPSByZWJ1aWxkRnJvbUluZGV4OyBpIDwgbGluZU51bWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyc1tpXTtcblx0XHRcdGlmIChsaW5lTnVtYmVyID4gdmlld01vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RpY2t5TGluZSA9IHRoaXMuX3JlbmRlckNoaWxkTm9kZSh2aWV3TW9kZWwsIGksIGxpbmVOdW1iZXIsIHRvcCwgbGFzdExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIsIGZvbGRpbmdNb2RlbCwgbGF5b3V0SW5mbyk7XG5cdFx0XHR0b3AgKz0gc3RpY2t5TGluZS5oZWlnaHQ7XG5cdFx0XHR0aGlzLl9saW5lc0RvbU5vZGUuYXBwZW5kQ2hpbGQoc3RpY2t5TGluZS5saW5lRG9tTm9kZSk7XG5cdFx0XHR0aGlzLl9saW5lTnVtYmVyc0RvbU5vZGUuYXBwZW5kQ2hpbGQoc3RpY2t5TGluZS5saW5lTnVtYmVyRG9tTm9kZSk7XG5cdFx0XHRyZW5kZXJlZFN0aWNreUxpbmVzLnB1c2goc3RpY2t5TGluZSk7XG5cdFx0fVxuXHRcdGlmIChmb2xkaW5nTW9kZWwpIHtcblx0XHRcdHRoaXMuX3NldEZvbGRpbmdIb3Zlckxpc3RlbmVycygpO1xuXHRcdFx0dGhpcy5fdXNlRm9sZGluZ09wYWNpdHlUcmFuc2l0aW9uKCF0aGlzLl9pc09uR2x5cGhNYXJnaW4pO1xuXHRcdH1cblx0XHR0aGlzLl9taW5Db250ZW50V2lkdGhJblB4ID0gTWF0aC5tYXgoLi4udGhpcy5fcmVuZGVyZWRTdGlja3lMaW5lcy5tYXAobCA9PiBsLnNjcm9sbFdpZHRoKSkgKyBsYXlvdXRJbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg7XG5cdFx0dGhpcy5fcmVuZGVyZWRTdGlja3lMaW5lcyA9IHJlbmRlcmVkU3RpY2t5TGluZXM7XG5cdFx0dGhpcy5fc2V0SGVpZ2h0KHRvcCArIGxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbik7XG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhcldpZGdldCgpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHN0aWNreUxpbmUgPSB0aGlzLl9yZW5kZXJlZFN0aWNreUxpbmVzW2ldO1xuXHRcdFx0c3RpY2t5TGluZS5saW5lTnVtYmVyRG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdHN0aWNreUxpbmUubGluZURvbU5vZGUucmVtb3ZlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3NldEhlaWdodCgwKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEhlaWdodChoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9oZWlnaHQgPT09IGhlaWdodCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9oZWlnaHQgPSBoZWlnaHQ7XG5cblx0XHRpZiAodGhpcy5faGVpZ2h0ID09PSAwKSB7XG5cdFx0XHR0aGlzLl9yb290RG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yb290RG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdHRoaXMuX2xpbmVOdW1iZXJzRG9tTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLl9oZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5fbGluZXNEb21Ob2RlU2Nyb2xsYWJsZS5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLl9oZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5fcm9vdERvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7dGhpcy5faGVpZ2h0fXB4YDtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0aWNreVNjcm9sbEhlaWdodC5maXJlKHsgaGVpZ2h0OiB0aGlzLl9oZWlnaHQgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRGb2xkaW5nSG92ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZm9sZGluZ0ljb25TdG9yZS5jbGVhcigpO1xuXHRcdGNvbnN0IHNob3dGb2xkaW5nQ29udHJvbHM6ICdtb3VzZW92ZXInIHwgJ2Fsd2F5cycgfCAnbmV2ZXInID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc2hvd0ZvbGRpbmdDb250cm9scyk7XG5cdFx0aWYgKHNob3dGb2xkaW5nQ29udHJvbHMgIT09ICdtb3VzZW92ZXInKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2ZvbGRpbmdJY29uU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLl9mb2xkaW5nSWNvblN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2xpbmVOdW1iZXJzRG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNPbkdseXBoTWFyZ2luID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3NldEZvbGRpbmdJY29uc1Zpc2liaWxpdHkodHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2ZvbGRpbmdJY29uU3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fbGluZU51bWJlcnNEb21Ob2RlLCBkb20uRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc09uR2x5cGhNYXJnaW4gPSBmYWxzZTtcblx0XHRcdHRoaXMuX3VzZUZvbGRpbmdPcGFjaXR5VHJhbnNpdGlvbih0cnVlKTtcblx0XHRcdHRoaXMuX3NldEZvbGRpbmdJY29uc1Zpc2liaWxpdHkoZmFsc2UpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckNoaWxkTm9kZSh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIGxpbmU6IG51bWJlciwgdG9wOiBudW1iZXIsIGlzTGFzdExpbmU6IGJvb2xlYW4sIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsIHwgdW5kZWZpbmVkLCBsYXlvdXRJbmZvOiBFZGl0b3JMYXlvdXRJbmZvKTogUmVuZGVyZWRTdGlja3lMaW5lIHtcblxuXHRcdGNvbnN0IHJlbmRlcmVkTGluZSA9IG5ldyBSZW5kZXJlZFN0aWNreUxpbmUoXG5cdFx0XHR0aGlzLl9lZGl0b3IsXG5cdFx0XHR2aWV3TW9kZWwsXG5cdFx0XHRsYXlvdXRJbmZvLFxuXHRcdFx0Zm9sZGluZ01vZGVsLFxuXHRcdFx0dGhpcy5faXNPbkdseXBoTWFyZ2luLFxuXHRcdFx0aW5kZXgsXG5cdFx0XHRsaW5lXG5cdFx0KTtcblx0XHRyZXR1cm4gdGhpcy5fdXBkYXRlUG9zaXRpb24ocmVuZGVyZWRMaW5lLCB0b3AsIGlzTGFzdExpbmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUG9zaXRpb24oc3RpY2t5TGluZTogUmVuZGVyZWRTdGlja3lMaW5lLCB0b3A6IG51bWJlciwgaXNMYXN0TGluZTogYm9vbGVhbik6IFJlbmRlcmVkU3RpY2t5TGluZSB7XG5cdFx0Y29uc3QgbGluZUhUTUxOb2RlID0gc3RpY2t5TGluZS5saW5lRG9tTm9kZTtcblx0XHRjb25zdCBsaW5lTnVtYmVySFRNTE5vZGUgPSBzdGlja3lMaW5lLmxpbmVOdW1iZXJEb21Ob2RlO1xuXHRcdGlmIChpc0xhc3RMaW5lKSB7XG5cdFx0XHRjb25zdCB6SW5kZXggPSAnMCc7XG5cdFx0XHRsaW5lSFRNTE5vZGUuc3R5bGUuekluZGV4ID0gekluZGV4O1xuXHRcdFx0bGluZU51bWJlckhUTUxOb2RlLnN0eWxlLnpJbmRleCA9IHpJbmRleDtcblx0XHRcdGNvbnN0IHVwZGF0ZWRUb3AgPSBgJHt0b3AgKyB0aGlzLl9sYXN0TGluZVJlbGF0aXZlUG9zaXRpb24gKyAoc3RpY2t5TGluZS5mb2xkaW5nSWNvbj8uaXNDb2xsYXBzZWQgPyAxIDogMCl9cHhgO1xuXHRcdFx0bGluZUhUTUxOb2RlLnN0eWxlLnRvcCA9IHVwZGF0ZWRUb3A7XG5cdFx0XHRsaW5lTnVtYmVySFRNTE5vZGUuc3R5bGUudG9wID0gdXBkYXRlZFRvcDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgekluZGV4ID0gJzEnO1xuXHRcdFx0bGluZUhUTUxOb2RlLnN0eWxlLnpJbmRleCA9IHpJbmRleDtcblx0XHRcdGxpbmVOdW1iZXJIVE1MTm9kZS5zdHlsZS56SW5kZXggPSB6SW5kZXg7XG5cdFx0XHRsaW5lSFRNTE5vZGUuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHRcdGxpbmVOdW1iZXJIVE1MTm9kZS5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RpY2t5TGluZTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdlZGl0b3IuY29udHJpYi5zdGlja3lTY3JvbGxXaWRnZXQnO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jvb3REb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcmVmZXJlbmNlOiBPdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLlRPUF9DRU5URVIsXG5cdFx0XHRzdGFja09yZGluYWw6IDEwLFxuXHRcdH07XG5cdH1cblxuXHRnZXRNaW5Db250ZW50V2lkdGhJblB4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX21pbkNvbnRlbnRXaWR0aEluUHg7XG5cdH1cblxuXHRmb2N1c0xpbmVXaXRoSW5kZXgoaW5kZXg6IG51bWJlcikge1xuXHRcdGlmICgwIDw9IGluZGV4ICYmIGluZGV4IDwgdGhpcy5fcmVuZGVyZWRTdGlja3lMaW5lcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXNbaW5kZXhdLmxpbmVEb21Ob2RlLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGEgbGVhZiBkb20gbm9kZSwgdHJpZXMgdG8gZmluZCB0aGUgZWRpdG9yIHBvc2l0aW9uLlxuXHQgKi9cblx0Z2V0RWRpdG9yUG9zaXRpb25Gcm9tTm9kZShzcGFuRG9tTm9kZTogSFRNTEVsZW1lbnQgfCBudWxsKTogUG9zaXRpb24gfCBudWxsIHtcblx0XHRpZiAoIXNwYW5Eb21Ob2RlIHx8IHNwYW5Eb21Ob2RlLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIFRoaXMgaXMgbm90IGEgbGVhZiBub2RlXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgcmVuZGVyZWRTdGlja3lMaW5lID0gdGhpcy5fZ2V0UmVuZGVyZWRTdGlja3lMaW5lRnJvbUNoaWxkRG9tTm9kZShzcGFuRG9tTm9kZSk7XG5cdFx0aWYgKCFyZW5kZXJlZFN0aWNreUxpbmUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBjb2x1bW4gPSBnZXRDb2x1bW5PZk5vZGVPZmZzZXQocmVuZGVyZWRTdGlja3lMaW5lLmNoYXJhY3Rlck1hcHBpbmcsIHNwYW5Eb21Ob2RlLCAwKTtcblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKHJlbmRlcmVkU3RpY2t5TGluZS5saW5lTnVtYmVyLCBjb2x1bW4pO1xuXHR9XG5cblx0Z2V0TGluZU51bWJlckZyb21DaGlsZERvbU5vZGUoZG9tTm9kZTogSFRNTEVsZW1lbnQgfCBudWxsKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldFJlbmRlcmVkU3RpY2t5TGluZUZyb21DaGlsZERvbU5vZGUoZG9tTm9kZSk/LmxpbmVOdW1iZXIgPz8gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlbmRlcmVkU3RpY2t5TGluZUZyb21DaGlsZERvbU5vZGUoZG9tTm9kZTogSFRNTEVsZW1lbnQgfCBudWxsKTogUmVuZGVyZWRTdGlja3lMaW5lIHwgbnVsbCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldExpbmVJbmRleEZyb21DaGlsZERvbU5vZGUoZG9tTm9kZSk7XG5cdFx0aWYgKGluZGV4ID09PSBudWxsIHx8IGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLl9yZW5kZXJlZFN0aWNreUxpbmVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZFN0aWNreUxpbmVzW2luZGV4XTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIGNoaWxkIGRvbSBub2RlLCB0cmllcyB0byBmaW5kIHRoZSBsaW5lIG51bWJlciBhdHRyaWJ1dGUgdGhhdCB3YXMgc3RvcmVkIGluIHRoZSBub2RlLlxuXHQgKiBAcmV0dXJucyB0aGUgYXR0cmlidXRlIHZhbHVlIG9yIG51bGwgaWYgbm9uZSBpcyBmb3VuZC5cblx0ICovXG5cdGdldExpbmVJbmRleEZyb21DaGlsZERvbU5vZGUoZG9tTm9kZTogSFRNTEVsZW1lbnQgfCBudWxsKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0Y29uc3QgbGluZUluZGV4ID0gdGhpcy5fZ2V0QXR0cmlidXRlVmFsdWUoZG9tTm9kZSwgU1RJQ0tZX0lOREVYX0FUVFIpO1xuXHRcdHJldHVybiBsaW5lSW5kZXggPyBwYXJzZUludChsaW5lSW5kZXgsIDEwKSA6IG51bGw7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYSBjaGlsZCBkb20gbm9kZSwgdHJpZXMgdG8gZmluZCBpZiBpdCBpcyAoY29udGFpbmVkIGluKSBhIHN0aWNreSBsaW5lLlxuXHQgKiBAcmV0dXJucyBhIGJvb2xlYW4uXG5cdCAqL1xuXHRpc0luU3RpY2t5TGluZShkb21Ob2RlOiBIVE1MRWxlbWVudCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRjb25zdCBpc0luTGluZSA9IHRoaXMuX2dldEF0dHJpYnV0ZVZhbHVlKGRvbU5vZGUsIFNUSUNLWV9JU19MSU5FX0FUVFIpO1xuXHRcdHJldHVybiBpc0luTGluZSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGEgY2hpbGQgZG9tIG5vZGUsIHRyaWVzIHRvIGZpbmQgaWYgdGhpcyBkb20gbm9kZSBpcyAoY29udGFpbmVkIGluKSBhIHN0aWNreSBmb2xkaW5nIGljb24uXG5cdCAqIEByZXR1cm5zIGEgYm9vbGVhbi5cblx0ICovXG5cdGlzSW5Gb2xkaW5nSWNvbkRvbU5vZGUoZG9tTm9kZTogSFRNTEVsZW1lbnQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaXNJbkZvbGRpbmdJY29uID0gdGhpcy5fZ2V0QXR0cmlidXRlVmFsdWUoZG9tTm9kZSwgU1RJQ0tZX0lTX0ZPTERJTkdfSUNPTl9BVFRSKTtcblx0XHRyZXR1cm4gaXNJbkZvbGRpbmdJY29uICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gdGhlIGRvbSBub2RlLCBmaW5kcyBpZiBpdCBvciBpdHMgcGFyZW50IHNlcXVlbmNlIGNvbnRhaW5zIHRoZSBnaXZlbiBhdHRyaWJ1dGUuXG5cdCAqIEByZXR1cm5zIHRoZSBhdHRyaWJ1dGUgdmFsdWUgb3IgdW5kZWZpbmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0QXR0cmlidXRlVmFsdWUoZG9tTm9kZTogSFRNTEVsZW1lbnQgfCBudWxsLCBhdHRyaWJ1dGU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0d2hpbGUgKGRvbU5vZGUgJiYgZG9tTm9kZSAhPT0gdGhpcy5fcm9vdERvbU5vZGUpIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBkb21Ob2RlLmdldEF0dHJpYnV0ZShhdHRyaWJ1dGUpO1xuXHRcdFx0aWYgKGxpbmUgIT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuIGxpbmU7XG5cdFx0XHR9XG5cdFx0XHRkb21Ob2RlID0gZG9tTm9kZS5wYXJlbnRFbGVtZW50O1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cbn1cblxuY2xhc3MgUmVuZGVyZWRTdGlja3lMaW5lIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbGluZURvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgbGluZU51bWJlckRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHB1YmxpYyByZWFkb25seSBmb2xkaW5nSWNvbjogU3RpY2t5Rm9sZGluZ0ljb24gfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBjaGFyYWN0ZXJNYXBwaW5nOiBDaGFyYWN0ZXJNYXBwaW5nO1xuXG5cdHB1YmxpYyByZWFkb25seSBzY3JvbGxXaWR0aDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHR2aWV3TW9kZWw6IElWaWV3TW9kZWwsXG5cdFx0bGF5b3V0SW5mbzogRWRpdG9yTGF5b3V0SW5mbyxcblx0XHRmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCB8IHVuZGVmaW5lZCxcblx0XHRpc09uR2x5cGhNYXJnaW46IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGluZGV4OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVOdW1iZXI6IG51bWJlcixcblx0KSB7XG5cdFx0Y29uc3Qgdmlld0xpbmVOdW1iZXIgPSB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihuZXcgUG9zaXRpb24obGluZU51bWJlciwgMSkpLmxpbmVOdW1iZXI7XG5cdFx0Y29uc3QgbGluZVJlbmRlcmluZ0RhdGEgPSB2aWV3TW9kZWwuZ2V0Vmlld0xpbmVSZW5kZXJpbmdEYXRhKHZpZXdMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBsaW5lTnVtYmVyT3B0aW9uID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZU51bWJlcnMpO1xuXHRcdGNvbnN0IHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNjcm9sbGJhcikudmVydGljYWxTY3JvbGxiYXJTaXplO1xuXG5cdFx0bGV0IGFjdHVhbElubGluZURlY29yYXRpb25zOiBMaW5lRGVjb3JhdGlvbltdO1xuXHRcdHRyeSB7XG5cdFx0XHRhY3R1YWxJbmxpbmVEZWNvcmF0aW9ucyA9IExpbmVEZWNvcmF0aW9uLmZpbHRlcihsaW5lUmVuZGVyaW5nRGF0YS5pbmxpbmVEZWNvcmF0aW9ucywgdmlld0xpbmVOdW1iZXIsIGxpbmVSZW5kZXJpbmdEYXRhLm1pbkNvbHVtbiwgbGluZVJlbmRlcmluZ0RhdGEubWF4Q29sdW1uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFjdHVhbElubGluZURlY29yYXRpb25zID0gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IGVkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24obmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpKTtcblx0XHRjb25zdCB0ZXh0RGlyZWN0aW9uID0gdmlld01vZGVsLmdldFRleHREaXJlY3Rpb24obGluZU51bWJlcik7XG5cdFx0Y29uc3QgcmVuZGVyTGluZUlucHV0OiBSZW5kZXJMaW5lSW5wdXQgPSBuZXcgUmVuZGVyTGluZUlucHV0KHRydWUsIHRydWUsIGxpbmVSZW5kZXJpbmdEYXRhLmNvbnRlbnQsXG5cdFx0XHRsaW5lUmVuZGVyaW5nRGF0YS5jb250aW51ZXNXaXRoV3JhcHBlZExpbmUsXG5cdFx0XHRsaW5lUmVuZGVyaW5nRGF0YS5pc0Jhc2ljQVNDSUksIGxpbmVSZW5kZXJpbmdEYXRhLmNvbnRhaW5zUlRMLCAwLFxuXHRcdFx0bGluZVJlbmRlcmluZ0RhdGEudG9rZW5zLCBhY3R1YWxJbmxpbmVEZWNvcmF0aW9ucyxcblx0XHRcdGxpbmVSZW5kZXJpbmdEYXRhLnRhYlNpemUsIGxpbmVSZW5kZXJpbmdEYXRhLnN0YXJ0VmlzaWJsZUNvbHVtbixcblx0XHRcdDEsIDEsIDEsIDUwMCwgJ25vbmUnLCB0cnVlLCB0cnVlLCBudWxsLFxuXHRcdFx0dGV4dERpcmVjdGlvbiwgdmVydGljYWxTY3JvbGxiYXJTaXplXG5cdFx0KTtcblxuXHRcdGNvbnN0IHNiID0gbmV3IFN0cmluZ0J1aWxkZXIoMjAwMCk7XG5cdFx0Y29uc3QgcmVuZGVyT3V0cHV0ID0gcmVuZGVyVmlld0xpbmUocmVuZGVyTGluZUlucHV0LCBzYik7XG5cdFx0dGhpcy5jaGFyYWN0ZXJNYXBwaW5nID0gcmVuZGVyT3V0cHV0LmNoYXJhY3Rlck1hcHBpbmc7XG5cblx0XHRsZXQgbmV3TGluZTtcblx0XHRpZiAoX3R0UG9saWN5KSB7XG5cdFx0XHRuZXdMaW5lID0gX3R0UG9saWN5LmNyZWF0ZUhUTUwoc2IuYnVpbGQoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld0xpbmUgPSBzYi5idWlsZCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVIVE1MTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRsaW5lSFRNTE5vZGUuc2V0QXR0cmlidXRlKFNUSUNLWV9JTkRFWF9BVFRSLCBTdHJpbmcoaW5kZXgpKTtcblx0XHRsaW5lSFRNTE5vZGUuc2V0QXR0cmlidXRlKFNUSUNLWV9JU19MSU5FX0FUVFIsICcnKTtcblx0XHRsaW5lSFRNTE5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2xpc3RpdGVtJyk7XG5cdFx0bGluZUhUTUxOb2RlLnRhYkluZGV4ID0gMDtcblx0XHRsaW5lSFRNTE5vZGUuY2xhc3NOYW1lID0gJ3N0aWNreS1saW5lLWNvbnRlbnQnO1xuXHRcdGxpbmVIVE1MTm9kZS5jbGFzc0xpc3QuYWRkKGBzdGlja3lMaW5lJHtsaW5lTnVtYmVyfWApO1xuXHRcdGxpbmVIVE1MTm9kZS5zdHlsZS5saW5lSGVpZ2h0ID0gYCR7bGluZUhlaWdodH1weGA7XG5cdFx0bGluZUhUTUxOb2RlLmlubmVySFRNTCA9IG5ld0xpbmUgYXMgc3RyaW5nO1xuXG5cdFx0Y29uc3QgbGluZU51bWJlckhUTUxOb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGxpbmVOdW1iZXJIVE1MTm9kZS5zZXRBdHRyaWJ1dGUoU1RJQ0tZX0lOREVYX0FUVFIsIFN0cmluZyhpbmRleCkpO1xuXHRcdGxpbmVOdW1iZXJIVE1MTm9kZS5zZXRBdHRyaWJ1dGUoU1RJQ0tZX0lTX0xJTkVfTlVNQkVSX0FUVFIsICcnKTtcblx0XHRsaW5lTnVtYmVySFRNTE5vZGUuY2xhc3NOYW1lID0gJ3N0aWNreS1saW5lLW51bWJlcic7XG5cdFx0bGluZU51bWJlckhUTUxOb2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtsaW5lSGVpZ2h0fXB4YDtcblx0XHRjb25zdCBsaW5lTnVtYmVyc1dpZHRoID0gbGF5b3V0SW5mby5jb250ZW50TGVmdDtcblx0XHRsaW5lTnVtYmVySFRNTE5vZGUuc3R5bGUud2lkdGggPSBgJHtsaW5lTnVtYmVyc1dpZHRofXB4YDtcblxuXHRcdGNvbnN0IGlubmVyTGluZU51bWJlckhUTUwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0aWYgKGxpbmVOdW1iZXJPcHRpb24ucmVuZGVyVHlwZSA9PT0gUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uIHx8IGxpbmVOdW1iZXJPcHRpb24ucmVuZGVyVHlwZSA9PT0gUmVuZGVyTGluZU51bWJlcnNUeXBlLkludGVydmFsICYmIGxpbmVOdW1iZXIgJSAxMCA9PT0gMCkge1xuXHRcdFx0aW5uZXJMaW5lTnVtYmVySFRNTC5pbm5lclRleHQgPSBsaW5lTnVtYmVyLnRvU3RyaW5nKCk7XG5cdFx0fSBlbHNlIGlmIChsaW5lTnVtYmVyT3B0aW9uLnJlbmRlclR5cGUgPT09IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5SZWxhdGl2ZSkge1xuXHRcdFx0aW5uZXJMaW5lTnVtYmVySFRNTC5pbm5lclRleHQgPSBNYXRoLmFicyhsaW5lTnVtYmVyIC0gZWRpdG9yLmdldFBvc2l0aW9uKCkhLmxpbmVOdW1iZXIpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdGlubmVyTGluZU51bWJlckhUTUwuY2xhc3NOYW1lID0gJ3N0aWNreS1saW5lLW51bWJlci1pbm5lcic7XG5cdFx0aW5uZXJMaW5lTnVtYmVySFRNTC5zdHlsZS53aWR0aCA9IGAke2xheW91dEluZm8ubGluZU51bWJlcnNXaWR0aH1weGA7XG5cdFx0aW5uZXJMaW5lTnVtYmVySFRNTC5zdHlsZS5wYWRkaW5nTGVmdCA9IGAke2xheW91dEluZm8ubGluZU51bWJlcnNMZWZ0fXB4YDtcblxuXHRcdGxpbmVOdW1iZXJIVE1MTm9kZS5hcHBlbmRDaGlsZChpbm5lckxpbmVOdW1iZXJIVE1MKTtcblx0XHR0aGlzLmZvbGRpbmdJY29uID0gdGhpcy5fcmVuZGVyRm9sZGluZ0ljb25Gb3JMaW5lKGVkaXRvciwgZm9sZGluZ01vZGVsLCBsaW5lTnVtYmVyLCBsaW5lSGVpZ2h0LCBpc09uR2x5cGhNYXJnaW4pO1xuXHRcdGlmICh0aGlzLmZvbGRpbmdJY29uKSB7XG5cdFx0XHRsaW5lTnVtYmVySFRNTE5vZGUuYXBwZW5kQ2hpbGQodGhpcy5mb2xkaW5nSWNvbi5kb21Ob2RlKTtcblx0XHRcdHRoaXMuZm9sZGluZ0ljb24uZG9tTm9kZS5zdHlsZS5sZWZ0ID0gYCR7bGF5b3V0SW5mby5saW5lTnVtYmVyc1dpZHRoICsgbGF5b3V0SW5mby5saW5lTnVtYmVyc0xlZnR9cHhgO1xuXHRcdFx0dGhpcy5mb2xkaW5nSWNvbi5kb21Ob2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtsaW5lSGVpZ2h0fXB4YDtcblx0XHR9XG5cblx0XHRlZGl0b3IuYXBwbHlGb250SW5mbyhsaW5lSFRNTE5vZGUpO1xuXHRcdGVkaXRvci5hcHBseUZvbnRJbmZvKGxpbmVOdW1iZXJIVE1MTm9kZSk7XG5cblx0XHRsaW5lTnVtYmVySFRNTE5vZGUuc3R5bGUubGluZUhlaWdodCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXHRcdGxpbmVIVE1MTm9kZS5zdHlsZS5saW5lSGVpZ2h0ID0gYCR7bGluZUhlaWdodH1weGA7XG5cdFx0bGluZU51bWJlckhUTUxOb2RlLnN0eWxlLmhlaWdodCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXHRcdGxpbmVIVE1MTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtsaW5lSGVpZ2h0fXB4YDtcblxuXHRcdHRoaXMuc2Nyb2xsV2lkdGggPSBsaW5lSFRNTE5vZGUuc2Nyb2xsV2lkdGg7XG5cdFx0dGhpcy5saW5lRG9tTm9kZSA9IGxpbmVIVE1MTm9kZTtcblx0XHR0aGlzLmxpbmVOdW1iZXJEb21Ob2RlID0gbGluZU51bWJlckhUTUxOb2RlO1xuXHRcdHRoaXMuaGVpZ2h0ID0gbGluZUhlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckZvbGRpbmdJY29uRm9yTGluZShlZGl0b3I6IElDb2RlRWRpdG9yLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCB8IHVuZGVmaW5lZCwgbGluZTogbnVtYmVyLCBsaW5lSGVpZ2h0OiBudW1iZXIsIGlzT25HbHlwaE1hcmdpbjogYm9vbGVhbik6IFN0aWNreUZvbGRpbmdJY29uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzaG93Rm9sZGluZ0NvbnRyb2xzOiAnbW91c2VvdmVyJyB8ICdhbHdheXMnIHwgJ25ldmVyJyA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNob3dGb2xkaW5nQ29udHJvbHMpO1xuXHRcdGlmICghZm9sZGluZ01vZGVsIHx8IHNob3dGb2xkaW5nQ29udHJvbHMgPT09ICduZXZlcicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZm9sZGluZ1JlZ2lvbnMgPSBmb2xkaW5nTW9kZWwucmVnaW9ucztcblx0XHRjb25zdCBpbmRleE9mRm9sZGluZ1JlZ2lvbiA9IGZvbGRpbmdSZWdpb25zLmZpbmRSYW5nZShsaW5lKTtcblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBmb2xkaW5nUmVnaW9ucy5nZXRTdGFydExpbmVOdW1iZXIoaW5kZXhPZkZvbGRpbmdSZWdpb24pO1xuXHRcdGNvbnN0IGlzRm9sZGluZ1Njb3BlID0gbGluZSA9PT0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGlmICghaXNGb2xkaW5nU2NvcGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaXNDb2xsYXBzZWQgPSBmb2xkaW5nUmVnaW9ucy5pc0NvbGxhcHNlZChpbmRleE9mRm9sZGluZ1JlZ2lvbik7XG5cdFx0Y29uc3QgZm9sZGluZ0ljb24gPSBuZXcgU3RpY2t5Rm9sZGluZ0ljb24oaXNDb2xsYXBzZWQsIHN0YXJ0TGluZU51bWJlciwgZm9sZGluZ1JlZ2lvbnMuZ2V0RW5kTGluZU51bWJlcihpbmRleE9mRm9sZGluZ1JlZ2lvbiksIGxpbmVIZWlnaHQpO1xuXHRcdGZvbGRpbmdJY29uLnNldFZpc2libGUoaXNPbkdseXBoTWFyZ2luID8gdHJ1ZSA6IChpc0NvbGxhcHNlZCB8fCBzaG93Rm9sZGluZ0NvbnRyb2xzID09PSAnYWx3YXlzJykpO1xuXHRcdGZvbGRpbmdJY29uLmRvbU5vZGUuc2V0QXR0cmlidXRlKFNUSUNLWV9JU19GT0xESU5HX0lDT05fQVRUUiwgJycpO1xuXHRcdHJldHVybiBmb2xkaW5nSWNvbjtcblx0fVxufVxuXG5jbGFzcyBTdGlja3lGb2xkaW5nSWNvbiB7XG5cblx0cHVibGljIGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBpc0NvbGxhcHNlZDogYm9vbGVhbixcblx0XHRwdWJsaWMgZm9sZGluZ1N0YXJ0TGluZTogbnVtYmVyLFxuXHRcdHB1YmxpYyBmb2xkaW5nRW5kTGluZTogbnVtYmVyLFxuXHRcdHB1YmxpYyBkaW1lbnNpb246IG51bWJlclxuXHQpIHtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUud2lkdGggPSBgMjZweGA7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmhlaWdodCA9IGAke2RpbWVuc2lvbn1weGA7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtkaW1lbnNpb259cHhgO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoaXNDb2xsYXBzZWQgPyBmb2xkaW5nQ29sbGFwc2VkSWNvbiA6IGZvbGRpbmdFeHBhbmRlZEljb24pO1xuXHR9XG5cblx0cHVibGljIHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbikge1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5jdXJzb3IgPSB2aXNpYmxlID8gJ3BvaW50ZXInIDogJ2RlZmF1bHQnO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5vcGFjaXR5ID0gdmlzaWJsZSA/ICcxJyA6ICcwJztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsaUJBQWlCO0FBQzFCLE9BQU87QUFDUCxTQUE4RCx1Q0FBdUM7QUFDckcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBMkIsY0FBYyw2QkFBNkI7QUFDdEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBMkIsaUJBQWlCLHNCQUFzQjtBQUNsRSxTQUFTLHNCQUFzQiwyQkFBMkI7QUFFMUQsU0FBUyxlQUFlO0FBR2pCLE1BQU0sd0JBQXdCO0FBQUEsRUFDcEMsWUFDVSxrQkFDQSxnQkFDQSwwQkFDQSxpQkFBZ0MsTUFDeEM7QUFKUTtBQUNBO0FBQ0E7QUFDQTtBQUFBLEVBQ047QUFBQSxFQUVKLE9BQU8sT0FBcUQ7QUFDM0QsV0FBTyxDQUFDLENBQUMsU0FDTCxLQUFLLDZCQUE2QixNQUFNLDRCQUN4QyxLQUFLLG1CQUFtQixNQUFNLGtCQUM5QixPQUFPLEtBQUssa0JBQWtCLE1BQU0sZ0JBQWdCLEtBQ3BELE9BQU8sS0FBSyxnQkFBZ0IsTUFBTSxjQUFjO0FBQUEsRUFDckQ7QUFBQSxFQUVBLFdBQVcsUUFBUTtBQUNsQixXQUFPLElBQUksd0JBQXdCLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUFBLEVBQzdDO0FBQ0Q7QUFFQSxNQUFNLFlBQVkseUJBQXlCLHlCQUF5QixFQUFFLFlBQVksV0FBUyxNQUFNLENBQUM7QUFDbEcsTUFBTSxvQkFBb0I7QUFDMUIsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSw2QkFBNkI7QUFDbkMsTUFBTSw4QkFBOEI7QUFFN0IsTUFBTSwyQkFBMkIsV0FBcUM7QUFBQSxFQXVCNUUsWUFDQyxRQUNDO0FBQ0QsVUFBTTtBQXhCUCxTQUFpQixvQkFBb0IsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDekUsU0FBaUIsZUFBNEIsU0FBUyxjQUFjLEtBQUs7QUFDekUsU0FBaUIsc0JBQW1DLFNBQVMsY0FBYyxLQUFLO0FBQ2hGLFNBQWlCLDBCQUF1QyxTQUFTLGNBQWMsS0FBSztBQUNwRixTQUFpQixnQkFBNkIsU0FBUyxjQUFjLEtBQUs7QUFLMUUsU0FBUSx1QkFBNkMsQ0FBQztBQUN0RCxTQUFRLGVBQXlCLENBQUM7QUFDbEMsU0FBUSw0QkFBb0M7QUFDNUMsU0FBUSx1QkFBK0I7QUFDdkMsU0FBUSxtQkFBNEI7QUFDcEMsU0FBUSxVQUFrQjtBQUkxQixTQUFpQixpQ0FBaUMsS0FBSyxVQUFVLElBQUksUUFBNEIsQ0FBQztBQUNsRyxTQUFnQixnQ0FBZ0MsS0FBSywrQkFBK0I7QUFPbkYsU0FBSyxVQUFVO0FBQ2YsU0FBSyxvQkFBb0IsWUFBWTtBQUNyQyxTQUFLLG9CQUFvQixhQUFhLFFBQVEsTUFBTTtBQUVwRCxTQUFLLGNBQWMsWUFBWTtBQUMvQixTQUFLLGNBQWMsYUFBYSxRQUFRLE1BQU07QUFFOUMsU0FBSyx3QkFBd0IsWUFBWTtBQUN6QyxTQUFLLHdCQUF3QixZQUFZLEtBQUssYUFBYTtBQUUzRCxTQUFLLGFBQWEsWUFBWTtBQUM5QixTQUFLLGFBQWEsVUFBVSxPQUFPLFFBQVEsa0JBQWtCLHdCQUF3QjtBQUNyRixTQUFLLGFBQWEsWUFBWSxLQUFLLG1CQUFtQjtBQUN0RCxTQUFLLGFBQWEsWUFBWSxLQUFLLHVCQUF1QjtBQUMxRCxTQUFLLFdBQVcsQ0FBQztBQUVqQixVQUFNLDJCQUEyQixNQUFNO0FBQ3RDLFdBQUssY0FBYyxNQUFNLE9BQU8sS0FBSyxRQUFRLFVBQVUsYUFBYSxZQUFZLEVBQUUsbUJBQW1CLElBQUksS0FBSyxRQUFRLGNBQWMsQ0FBQyxPQUFPO0FBQUEsSUFDN0k7QUFDQSxTQUFLLFVBQVUsS0FBSyxRQUFRLHlCQUF5QixDQUFDLE1BQU07QUFDM0QsVUFBSSxFQUFFLFdBQVcsYUFBYSxZQUFZLEdBQUc7QUFDNUMsaUNBQXlCO0FBQUEsTUFDMUI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLFFBQVEsa0JBQWtCLENBQUMsTUFBTTtBQUNwRCxVQUFJLEVBQUUsbUJBQW1CO0FBQ3hCLGlDQUF5QjtBQUFBLE1BQzFCO0FBQ0EsVUFBSSxFQUFFLG9CQUFvQjtBQUN6QixhQUFLLG1CQUFtQjtBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxRQUFRLGlCQUFpQixNQUFNO0FBQ2xELCtCQUF5QjtBQUN6QixXQUFLLG1CQUFtQjtBQUFBLElBQ3pCLENBQUMsQ0FBQztBQUNGLDZCQUF5QjtBQUV6QixTQUFLLFVBQVUsS0FBSyxRQUFRLGtCQUFrQixDQUFDLE1BQU07QUFDcEQsV0FBSyxtQkFBbUI7QUFBQSxJQUN6QixDQUFDLENBQUM7QUFDRixTQUFLLG1CQUFtQjtBQUFBLEVBQ3pCO0FBQUEsRUFwREEsSUFBVyxTQUFpQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVM7QUFBQSxFQXNEbkQsSUFBSSxjQUF3QjtBQUMzQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLGtCQUEwQjtBQUM3QixXQUFPLEtBQUssYUFBYTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxzQkFBc0IsWUFBb0Q7QUFDekUsV0FBTyxLQUFLLHFCQUFxQixLQUFLLGdCQUFjLFdBQVcsZUFBZSxVQUFVO0FBQUEsRUFDekY7QUFBQSxFQUVBLGtCQUFxQztBQUNwQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxTQUFTLE9BQTRDLGNBQXdDLDJCQUEwQztBQUN0SSxVQUFNLHdDQUF3QyxDQUFDLEtBQUssVUFBVSxDQUFDO0FBQy9ELFVBQU0sNENBQTRDLEtBQUssVUFBVSxLQUFLLE9BQU8sT0FBTyxLQUFLO0FBQ3pGLFFBQUksOEJBQThCLFdBQWMseUNBQXlDLDRDQUE0QztBQUNwSTtBQUFBLElBQ0Q7QUFDQSxVQUFNLE9BQU8sS0FBSyxtQkFBbUIsS0FBSztBQUMxQyxVQUFNLHNCQUFzQixLQUFLO0FBQ2pDLFNBQUssZUFBZSxLQUFLO0FBQ3pCLFNBQUssNEJBQTRCLEtBQUs7QUFDdEMsVUFBTSxtQkFBbUIsS0FBSyx3QkFBd0IscUJBQXFCLEtBQUssY0FBYyx5QkFBeUI7QUFDdkgsU0FBSyxnQkFBZ0IsS0FBSyxjQUFjLEtBQUssMkJBQTJCLGNBQWMsZ0JBQWdCO0FBQ3RHLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVRLG1CQUFtQixPQUF5RztBQUNuSSxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU8sRUFBRSxhQUFhLENBQUMsR0FBRywwQkFBMEIsRUFBRTtBQUFBLElBQ3ZEO0FBQ0EsVUFBTSx1QkFBdUIsQ0FBQyxHQUFHLE1BQU0sZ0JBQWdCO0FBQ3ZELFFBQUksTUFBTSxtQkFBbUIsTUFBTTtBQUNsQywyQkFBcUIsTUFBTSxjQUFjLElBQUksTUFBTSxlQUFlLE1BQU0sY0FBYztBQUFBLElBQ3ZGO0FBQ0EsUUFBSSxjQUFjO0FBQ2xCLGFBQVMsSUFBSSxHQUFHLElBQUkscUJBQXFCLFFBQVEsS0FBSztBQUNyRCxZQUFNLFdBQVcsSUFBSSxTQUFTLHFCQUFxQixDQUFDLEdBQUcsQ0FBQztBQUN4RCxZQUFNLFlBQVksS0FBSyxRQUFRLGNBQWM7QUFDN0MsVUFBSSxhQUFhLFNBQVMsY0FBYyxVQUFVLGFBQWEsR0FBRztBQUNqRSx1QkFBZSxLQUFLLFFBQVEseUJBQXlCLElBQUksU0FBUyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzlGO0FBQUEsSUFDRDtBQUNBLFFBQUksZ0JBQWdCLEdBQUc7QUFDdEIsYUFBTyxFQUFFLGFBQWEsQ0FBQyxHQUFHLDBCQUEwQixFQUFFO0FBQUEsSUFDdkQ7QUFDQSxXQUFPLEVBQUUsYUFBYSxzQkFBc0IsMEJBQTBCLE1BQU0seUJBQXlCO0FBQUEsRUFDdEc7QUFBQSxFQUVRLHdCQUF3QixxQkFBK0IsZ0JBQTBCLDJCQUE0QztBQUNwSSxRQUFJLGVBQWUsV0FBVyxHQUFHO0FBQ2hDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSw4QkFBOEIsUUFBVztBQUM1QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sYUFBYSxlQUFlLFVBQVUscUJBQW1CLENBQUMsb0JBQW9CLFNBQVMsZUFBZSxDQUFDO0FBQzdHLFdBQU8sZUFBZSxLQUFLLElBQUk7QUFBQSxFQUNoQztBQUFBLEVBRVEscUJBQTJCO0FBQ2xDLFVBQU0sYUFBYSxLQUFLLFFBQVEsY0FBYztBQUM5QyxVQUFNLG1CQUFtQixXQUFXO0FBQ3BDLFNBQUssb0JBQW9CLE1BQU0sUUFBUSxHQUFHLGdCQUFnQjtBQUMxRCxTQUFLLHdCQUF3QixNQUFNLFlBQVksK0NBQStDLEdBQUcsS0FBSyxRQUFRLGVBQWUsSUFBSSxXQUFXLHNCQUFzQixJQUFJO0FBQ3RLLFNBQUssYUFBYSxNQUFNLFFBQVEsR0FBRyxXQUFXLFFBQVEsV0FBVyxzQkFBc0I7QUFBQSxFQUN4RjtBQUFBLEVBRVEsNkJBQTZCLG9CQUE2QjtBQUNqRSxTQUFLLG9CQUFvQixNQUFNLFlBQVksd0RBQXdELFdBQVcscUJBQXFCLE1BQU0sQ0FBQyxHQUFHO0FBQUEsRUFDOUk7QUFBQSxFQUVRLDJCQUEyQixZQUFxQjtBQUN2RCxlQUFXLFFBQVEsS0FBSyxzQkFBc0I7QUFDN0MsWUFBTSxjQUFjLEtBQUs7QUFDekIsVUFBSSxDQUFDLGFBQWE7QUFDakI7QUFBQSxNQUNEO0FBQ0Esa0JBQVksV0FBVyxhQUFhLE9BQU8sWUFBWSxXQUFXO0FBQUEsSUFDbkU7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGdCQUFnQixhQUF1QiwwQkFBa0MsY0FBd0Msa0JBQXlDO0FBQ3ZLLFVBQU0sWUFBWSxLQUFLLFFBQVEsY0FBYztBQUM3QyxRQUFJLENBQUMsV0FBVztBQUNmLFdBQUssYUFBYTtBQUNsQjtBQUFBLElBQ0Q7QUFDQSxRQUFJLFlBQVksV0FBVyxHQUFHO0FBQzdCLFdBQUssYUFBYTtBQUNsQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLHNCQUE0QyxDQUFDO0FBQ25ELFVBQU0saUJBQWlCLFlBQVksWUFBWSxTQUFTLENBQUM7QUFDekQsUUFBSSxNQUFjO0FBQ2xCLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxxQkFBcUIsUUFBUSxLQUFLO0FBQzFELFVBQUksSUFBSSxrQkFBa0I7QUFDekIsY0FBTSxlQUFlLEtBQUsscUJBQXFCLENBQUM7QUFDaEQsNEJBQW9CLEtBQUssS0FBSyxnQkFBZ0IsY0FBYyxLQUFLLGFBQWEsZUFBZSxjQUFjLENBQUM7QUFDNUcsZUFBTyxhQUFhO0FBQUEsTUFDckIsT0FBTztBQUNOLGNBQU0sZUFBZSxLQUFLLHFCQUFxQixDQUFDO0FBQ2hELHFCQUFhLGtCQUFrQixPQUFPO0FBQ3RDLHFCQUFhLFlBQVksT0FBTztBQUFBLE1BQ2pDO0FBQUEsSUFDRDtBQUNBLFVBQU0sYUFBYSxLQUFLLFFBQVEsY0FBYztBQUM5QyxhQUFTLElBQUksa0JBQWtCLElBQUksWUFBWSxRQUFRLEtBQUs7QUFDM0QsWUFBTSxhQUFhLFlBQVksQ0FBQztBQUNoQyxVQUFJLGFBQWEsVUFBVSxhQUFhLEdBQUc7QUFDMUM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxhQUFhLEtBQUssaUJBQWlCLFdBQVcsR0FBRyxZQUFZLEtBQUssbUJBQW1CLFlBQVksY0FBYyxVQUFVO0FBQy9ILGFBQU8sV0FBVztBQUNsQixXQUFLLGNBQWMsWUFBWSxXQUFXLFdBQVc7QUFDckQsV0FBSyxvQkFBb0IsWUFBWSxXQUFXLGlCQUFpQjtBQUNqRSwwQkFBb0IsS0FBSyxVQUFVO0FBQUEsSUFDcEM7QUFDQSxRQUFJLGNBQWM7QUFDakIsV0FBSywwQkFBMEI7QUFDL0IsV0FBSyw2QkFBNkIsQ0FBQyxLQUFLLGdCQUFnQjtBQUFBLElBQ3pEO0FBQ0EsU0FBSyx1QkFBdUIsS0FBSyxJQUFJLEdBQUcsS0FBSyxxQkFBcUIsSUFBSSxPQUFLLEVBQUUsV0FBVyxDQUFDLElBQUksV0FBVztBQUN4RyxTQUFLLHVCQUF1QjtBQUM1QixTQUFLLFdBQVcsTUFBTSx3QkFBd0I7QUFDOUMsU0FBSyxRQUFRLG9CQUFvQixJQUFJO0FBQUEsRUFDdEM7QUFBQSxFQUVRLGVBQXFCO0FBQzVCLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxxQkFBcUIsUUFBUSxLQUFLO0FBQzFELFlBQU0sYUFBYSxLQUFLLHFCQUFxQixDQUFDO0FBQzlDLGlCQUFXLGtCQUFrQixPQUFPO0FBQ3BDLGlCQUFXLFlBQVksT0FBTztBQUFBLElBQy9CO0FBQ0EsU0FBSyxXQUFXLENBQUM7QUFBQSxFQUNsQjtBQUFBLEVBRVEsV0FBVyxRQUFzQjtBQUN4QyxRQUFJLEtBQUssWUFBWSxRQUFRO0FBQzVCO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVTtBQUVmLFFBQUksS0FBSyxZQUFZLEdBQUc7QUFDdkIsV0FBSyxhQUFhLE1BQU0sVUFBVTtBQUFBLElBQ25DLE9BQU87QUFDTixXQUFLLGFBQWEsTUFBTSxVQUFVO0FBQ2xDLFdBQUssb0JBQW9CLE1BQU0sU0FBUyxHQUFHLEtBQUssT0FBTztBQUN2RCxXQUFLLHdCQUF3QixNQUFNLFNBQVMsR0FBRyxLQUFLLE9BQU87QUFDM0QsV0FBSyxhQUFhLE1BQU0sU0FBUyxHQUFHLEtBQUssT0FBTztBQUFBLElBQ2pEO0FBRUEsU0FBSywrQkFBK0IsS0FBSyxFQUFFLFFBQVEsS0FBSyxRQUFRLENBQUM7QUFBQSxFQUNsRTtBQUFBLEVBRVEsNEJBQWtDO0FBQ3pDLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsVUFBTSxzQkFBd0QsS0FBSyxRQUFRLFVBQVUsYUFBYSxtQkFBbUI7QUFDckgsUUFBSSx3QkFBd0IsYUFBYTtBQUN4QztBQUFBLElBQ0Q7QUFDQSxTQUFLLGtCQUFrQixNQUFNO0FBQzdCLFNBQUssa0JBQWtCLElBQUksSUFBSSxzQkFBc0IsS0FBSyxxQkFBcUIsSUFBSSxVQUFVLGFBQWEsTUFBTTtBQUMvRyxXQUFLLG1CQUFtQjtBQUN4QixXQUFLLDJCQUEyQixJQUFJO0FBQUEsSUFDckMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxrQkFBa0IsSUFBSSxJQUFJLHNCQUFzQixLQUFLLHFCQUFxQixJQUFJLFVBQVUsYUFBYSxNQUFNO0FBQy9HLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssNkJBQTZCLElBQUk7QUFDdEMsV0FBSywyQkFBMkIsS0FBSztBQUFBLElBQ3RDLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLGlCQUFpQixXQUF1QixPQUFlLE1BQWMsS0FBYSxZQUFxQixjQUF3QyxZQUFrRDtBQUV4TSxVQUFNLGVBQWUsSUFBSTtBQUFBLE1BQ3hCLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxXQUFPLEtBQUssZ0JBQWdCLGNBQWMsS0FBSyxVQUFVO0FBQUEsRUFDMUQ7QUFBQSxFQUVRLGdCQUFnQixZQUFnQyxLQUFhLFlBQXlDO0FBQzdHLFVBQU0sZUFBZSxXQUFXO0FBQ2hDLFVBQU0scUJBQXFCLFdBQVc7QUFDdEMsUUFBSSxZQUFZO0FBQ2YsWUFBTSxTQUFTO0FBQ2YsbUJBQWEsTUFBTSxTQUFTO0FBQzVCLHlCQUFtQixNQUFNLFNBQVM7QUFDbEMsWUFBTSxhQUFhLEdBQUcsTUFBTSxLQUFLLDZCQUE2QixXQUFXLGFBQWEsY0FBYyxJQUFJLEVBQUU7QUFDMUcsbUJBQWEsTUFBTSxNQUFNO0FBQ3pCLHlCQUFtQixNQUFNLE1BQU07QUFBQSxJQUNoQyxPQUFPO0FBQ04sWUFBTSxTQUFTO0FBQ2YsbUJBQWEsTUFBTSxTQUFTO0FBQzVCLHlCQUFtQixNQUFNLFNBQVM7QUFDbEMsbUJBQWEsTUFBTSxNQUFNLEdBQUcsR0FBRztBQUMvQix5QkFBbUIsTUFBTSxNQUFNLEdBQUcsR0FBRztBQUFBLElBQ3RDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFFBQWdCO0FBQ2YsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGFBQTBCO0FBQ3pCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLGNBQTZDO0FBQzVDLFdBQU87QUFBQSxNQUNOLFlBQVksZ0NBQWdDO0FBQUEsTUFDNUMsY0FBYztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFFQSx5QkFBaUM7QUFDaEMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsbUJBQW1CLE9BQWU7QUFDakMsUUFBSSxLQUFLLFNBQVMsUUFBUSxLQUFLLHFCQUFxQixRQUFRO0FBQzNELFdBQUsscUJBQXFCLEtBQUssRUFBRSxZQUFZLE1BQU07QUFBQSxJQUNwRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLDBCQUEwQixhQUFrRDtBQUMzRSxRQUFJLENBQUMsZUFBZSxZQUFZLFNBQVMsU0FBUyxHQUFHO0FBRXBELGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxxQkFBcUIsS0FBSyx1Q0FBdUMsV0FBVztBQUNsRixRQUFJLENBQUMsb0JBQW9CO0FBQ3hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxTQUFTLHNCQUFzQixtQkFBbUIsa0JBQWtCLGFBQWEsQ0FBQztBQUN4RixXQUFPLElBQUksU0FBUyxtQkFBbUIsWUFBWSxNQUFNO0FBQUEsRUFDMUQ7QUFBQSxFQUVBLDhCQUE4QixTQUE0QztBQUN6RSxXQUFPLEtBQUssdUNBQXVDLE9BQU8sR0FBRyxjQUFjO0FBQUEsRUFDNUU7QUFBQSxFQUVRLHVDQUF1QyxTQUF3RDtBQUN0RyxVQUFNLFFBQVEsS0FBSyw2QkFBNkIsT0FBTztBQUN2RCxRQUFJLFVBQVUsUUFBUSxRQUFRLEtBQUssU0FBUyxLQUFLLHFCQUFxQixRQUFRO0FBQzdFLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLHFCQUFxQixLQUFLO0FBQUEsRUFDdkM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsNkJBQTZCLFNBQTRDO0FBQ3hFLFVBQU0sWUFBWSxLQUFLLG1CQUFtQixTQUFTLGlCQUFpQjtBQUNwRSxXQUFPLFlBQVksU0FBUyxXQUFXLEVBQUUsSUFBSTtBQUFBLEVBQzlDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLGVBQWUsU0FBc0M7QUFDcEQsVUFBTSxXQUFXLEtBQUssbUJBQW1CLFNBQVMsbUJBQW1CO0FBQ3JFLFdBQU8sYUFBYTtBQUFBLEVBQ3JCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLHVCQUF1QixTQUFzQztBQUM1RCxVQUFNLGtCQUFrQixLQUFLLG1CQUFtQixTQUFTLDJCQUEyQjtBQUNwRixXQUFPLG9CQUFvQjtBQUFBLEVBQzVCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLG1CQUFtQixTQUE2QixXQUF1QztBQUM5RixXQUFPLFdBQVcsWUFBWSxLQUFLLGNBQWM7QUFDaEQsWUFBTSxPQUFPLFFBQVEsYUFBYSxTQUFTO0FBQzNDLFVBQUksU0FBUyxNQUFNO0FBQ2xCLGVBQU87QUFBQSxNQUNSO0FBQ0EsZ0JBQVUsUUFBUTtBQUFBLElBQ25CO0FBQ0E7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLG1CQUFtQjtBQUFBLEVBV3hCLFlBQ0MsUUFDQSxXQUNBLFlBQ0EsY0FDQSxpQkFDZ0IsT0FDQSxZQUNmO0FBRmU7QUFDQTtBQUVoQixVQUFNLGlCQUFpQixVQUFVLHFCQUFxQixtQ0FBbUMsSUFBSSxTQUFTLFlBQVksQ0FBQyxDQUFDLEVBQUU7QUFDdEgsVUFBTSxvQkFBb0IsVUFBVSx5QkFBeUIsY0FBYztBQUMzRSxVQUFNLG1CQUFtQixPQUFPLFVBQVUsYUFBYSxXQUFXO0FBQ2xFLFVBQU0sd0JBQXdCLE9BQU8sVUFBVSxhQUFhLFNBQVMsRUFBRTtBQUV2RSxRQUFJO0FBQ0osUUFBSTtBQUNILGdDQUEwQixlQUFlLE9BQU8sa0JBQWtCLG1CQUFtQixnQkFBZ0Isa0JBQWtCLFdBQVcsa0JBQWtCLFNBQVM7QUFBQSxJQUM5SixTQUFTLEtBQUs7QUFDYixnQ0FBMEIsQ0FBQztBQUFBLElBQzVCO0FBRUEsVUFBTSxhQUFhLE9BQU8seUJBQXlCLElBQUksU0FBUyxZQUFZLENBQUMsQ0FBQztBQUM5RSxVQUFNLGdCQUFnQixVQUFVLGlCQUFpQixVQUFVO0FBQzNELFVBQU0sa0JBQW1DLElBQUk7QUFBQSxNQUFnQjtBQUFBLE1BQU07QUFBQSxNQUFNLGtCQUFrQjtBQUFBLE1BQzFGLGtCQUFrQjtBQUFBLE1BQ2xCLGtCQUFrQjtBQUFBLE1BQWMsa0JBQWtCO0FBQUEsTUFBYTtBQUFBLE1BQy9ELGtCQUFrQjtBQUFBLE1BQVE7QUFBQSxNQUMxQixrQkFBa0I7QUFBQSxNQUFTLGtCQUFrQjtBQUFBLE1BQzdDO0FBQUEsTUFBRztBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBSztBQUFBLE1BQVE7QUFBQSxNQUFNO0FBQUEsTUFBTTtBQUFBLE1BQ2xDO0FBQUEsTUFBZTtBQUFBLElBQ2hCO0FBRUEsVUFBTSxLQUFLLElBQUksY0FBYyxHQUFJO0FBQ2pDLFVBQU0sZUFBZSxlQUFlLGlCQUFpQixFQUFFO0FBQ3ZELFNBQUssbUJBQW1CLGFBQWE7QUFFckMsUUFBSTtBQUNKLFFBQUksV0FBVztBQUNkLGdCQUFVLFVBQVUsV0FBVyxHQUFHLE1BQU0sQ0FBQztBQUFBLElBQzFDLE9BQU87QUFDTixnQkFBVSxHQUFHLE1BQU07QUFBQSxJQUNwQjtBQUVBLFVBQU0sZUFBZSxTQUFTLGNBQWMsTUFBTTtBQUNsRCxpQkFBYSxhQUFhLG1CQUFtQixPQUFPLEtBQUssQ0FBQztBQUMxRCxpQkFBYSxhQUFhLHFCQUFxQixFQUFFO0FBQ2pELGlCQUFhLGFBQWEsUUFBUSxVQUFVO0FBQzVDLGlCQUFhLFdBQVc7QUFDeEIsaUJBQWEsWUFBWTtBQUN6QixpQkFBYSxVQUFVLElBQUksYUFBYSxVQUFVLEVBQUU7QUFDcEQsaUJBQWEsTUFBTSxhQUFhLEdBQUcsVUFBVTtBQUM3QyxpQkFBYSxZQUFZO0FBRXpCLFVBQU0scUJBQXFCLFNBQVMsY0FBYyxNQUFNO0FBQ3hELHVCQUFtQixhQUFhLG1CQUFtQixPQUFPLEtBQUssQ0FBQztBQUNoRSx1QkFBbUIsYUFBYSw0QkFBNEIsRUFBRTtBQUM5RCx1QkFBbUIsWUFBWTtBQUMvQix1QkFBbUIsTUFBTSxhQUFhLEdBQUcsVUFBVTtBQUNuRCxVQUFNLG1CQUFtQixXQUFXO0FBQ3BDLHVCQUFtQixNQUFNLFFBQVEsR0FBRyxnQkFBZ0I7QUFFcEQsVUFBTSxzQkFBc0IsU0FBUyxjQUFjLE1BQU07QUFDekQsUUFBSSxpQkFBaUIsZUFBZSxzQkFBc0IsTUFBTSxpQkFBaUIsZUFBZSxzQkFBc0IsWUFBWSxhQUFhLE9BQU8sR0FBRztBQUN4SiwwQkFBb0IsWUFBWSxXQUFXLFNBQVM7QUFBQSxJQUNyRCxXQUFXLGlCQUFpQixlQUFlLHNCQUFzQixVQUFVO0FBQzFFLDBCQUFvQixZQUFZLEtBQUssSUFBSSxhQUFhLE9BQU8sWUFBWSxFQUFHLFVBQVUsRUFBRSxTQUFTO0FBQUEsSUFDbEc7QUFDQSx3QkFBb0IsWUFBWTtBQUNoQyx3QkFBb0IsTUFBTSxRQUFRLEdBQUcsV0FBVyxnQkFBZ0I7QUFDaEUsd0JBQW9CLE1BQU0sY0FBYyxHQUFHLFdBQVcsZUFBZTtBQUVyRSx1QkFBbUIsWUFBWSxtQkFBbUI7QUFDbEQsU0FBSyxjQUFjLEtBQUssMEJBQTBCLFFBQVEsY0FBYyxZQUFZLFlBQVksZUFBZTtBQUMvRyxRQUFJLEtBQUssYUFBYTtBQUNyQix5QkFBbUIsWUFBWSxLQUFLLFlBQVksT0FBTztBQUN2RCxXQUFLLFlBQVksUUFBUSxNQUFNLE9BQU8sR0FBRyxXQUFXLG1CQUFtQixXQUFXLGVBQWU7QUFDakcsV0FBSyxZQUFZLFFBQVEsTUFBTSxhQUFhLEdBQUcsVUFBVTtBQUFBLElBQzFEO0FBRUEsV0FBTyxjQUFjLFlBQVk7QUFDakMsV0FBTyxjQUFjLGtCQUFrQjtBQUV2Qyx1QkFBbUIsTUFBTSxhQUFhLEdBQUcsVUFBVTtBQUNuRCxpQkFBYSxNQUFNLGFBQWEsR0FBRyxVQUFVO0FBQzdDLHVCQUFtQixNQUFNLFNBQVMsR0FBRyxVQUFVO0FBQy9DLGlCQUFhLE1BQU0sU0FBUyxHQUFHLFVBQVU7QUFFekMsU0FBSyxjQUFjLGFBQWE7QUFDaEMsU0FBSyxjQUFjO0FBQ25CLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVRLDBCQUEwQixRQUFxQixjQUF3QyxNQUFjLFlBQW9CLGlCQUF5RDtBQUN6TCxVQUFNLHNCQUF3RCxPQUFPLFVBQVUsYUFBYSxtQkFBbUI7QUFDL0csUUFBSSxDQUFDLGdCQUFnQix3QkFBd0IsU0FBUztBQUNyRDtBQUFBLElBQ0Q7QUFDQSxVQUFNLGlCQUFpQixhQUFhO0FBQ3BDLFVBQU0sdUJBQXVCLGVBQWUsVUFBVSxJQUFJO0FBQzFELFVBQU0sa0JBQWtCLGVBQWUsbUJBQW1CLG9CQUFvQjtBQUM5RSxVQUFNLGlCQUFpQixTQUFTO0FBQ2hDLFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxjQUFjLGVBQWUsWUFBWSxvQkFBb0I7QUFDbkUsVUFBTSxjQUFjLElBQUksa0JBQWtCLGFBQWEsaUJBQWlCLGVBQWUsaUJBQWlCLG9CQUFvQixHQUFHLFVBQVU7QUFDekksZ0JBQVksV0FBVyxrQkFBa0IsT0FBUSxlQUFlLHdCQUF3QixRQUFTO0FBQ2pHLGdCQUFZLFFBQVEsYUFBYSw2QkFBNkIsRUFBRTtBQUNoRSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsTUFBTSxrQkFBa0I7QUFBQSxFQUl2QixZQUNRLGFBQ0Esa0JBQ0EsZ0JBQ0EsV0FDTjtBQUpNO0FBQ0E7QUFDQTtBQUNBO0FBRVAsU0FBSyxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzNDLFNBQUssUUFBUSxNQUFNLFFBQVE7QUFDM0IsU0FBSyxRQUFRLE1BQU0sU0FBUyxHQUFHLFNBQVM7QUFDeEMsU0FBSyxRQUFRLE1BQU0sYUFBYSxHQUFHLFNBQVM7QUFDNUMsU0FBSyxRQUFRLFlBQVksVUFBVSxZQUFZLGNBQWMsdUJBQXVCLG1CQUFtQjtBQUFBLEVBQ3hHO0FBQUEsRUFFTyxXQUFXLFNBQWtCO0FBQ25DLFNBQUssUUFBUSxNQUFNLFNBQVMsVUFBVSxZQUFZO0FBQ2xELFNBQUssUUFBUSxNQUFNLFVBQVUsVUFBVSxNQUFNO0FBQUEsRUFDOUM7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
