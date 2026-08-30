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
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { EditorOption, RenderLineNumbersType } from "../../../common/config/editorOptions.js";
import { StickyScrollWidget, StickyScrollWidgetState } from "./stickyScrollWidget.js";
import { StickyLineCandidateProvider } from "./stickyScrollProvider.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ClickLinkGesture } from "../../gotoSymbol/browser/link/clickLinkGesture.js";
import { Range } from "../../../common/core/range.js";
import { getDefinitionsAtPosition } from "../../gotoSymbol/browser/goToSymbol.js";
import { goToDefinitionWithLocation } from "../../inlayHints/browser/inlayHintsLocations.js";
import { Position } from "../../../common/core/position.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import * as dom from "../../../../base/browser/dom.js";
import { StickyRange } from "./stickyScrollElement.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { FoldingController } from "../../folding/browser/folding.js";
import { toggleCollapseState } from "../../folding/browser/foldingModel.js";
import { Emitter } from "../../../../base/common/event.js";
import { mainWindow } from "../../../../base/browser/window.js";
let StickyScrollController = class extends Disposable {
  constructor(_editor, _contextMenuService, _languageFeaturesService, _instaService, _languageConfigurationService, _languageFeatureDebounceService, _contextKeyService) {
    super();
    this._editor = _editor;
    this._contextMenuService = _contextMenuService;
    this._languageFeaturesService = _languageFeaturesService;
    this._instaService = _instaService;
    this._contextKeyService = _contextKeyService;
    this._sessionStore = new DisposableStore();
    this._maxStickyLines = Number.MAX_SAFE_INTEGER;
    this._candidateDefinitionsLength = -1;
    this._focusedStickyElementIndex = -1;
    this._enabled = false;
    this._focused = false;
    this._positionRevealed = false;
    this._onMouseDown = false;
    this._endLineNumbers = [];
    this._mouseTarget = null;
    this._onDidChangeStickyScrollHeight = this._register(new Emitter());
    this.onDidChangeStickyScrollHeight = this._onDidChangeStickyScrollHeight.event;
    this._stickyScrollWidget = new StickyScrollWidget(this._editor);
    this._stickyLineCandidateProvider = new StickyLineCandidateProvider(this._editor, _languageFeaturesService, _languageConfigurationService);
    this._register(this._stickyScrollWidget);
    this._register(this._stickyLineCandidateProvider);
    this._widgetState = StickyScrollWidgetState.Empty;
    const stickyScrollDomNode = this._stickyScrollWidget.getDomNode();
    this._register(this._editor.onDidChangeLineHeight((e) => {
      e.changes.forEach((change) => {
        const lineNumber = change.lineNumber;
        if (this._widgetState.startLineNumbers.includes(lineNumber)) {
          this._renderStickyScroll(lineNumber);
        }
      });
    }));
    this._register(this._editor.onDidChangeFont((e) => {
      e.changes.forEach((change) => {
        const lineNumber = change.lineNumber;
        if (this._widgetState.startLineNumbers.includes(lineNumber)) {
          this._renderStickyScroll(lineNumber);
        }
      });
    }));
    this._register(this._editor.onDidChangeConfiguration((e) => {
      this._readConfigurationChange(e);
    }));
    this._register(dom.addDisposableListener(stickyScrollDomNode, dom.EventType.CONTEXT_MENU, async (event) => {
      this._onContextMenu(dom.getWindow(stickyScrollDomNode), event);
    }));
    this._stickyScrollFocusedContextKey = EditorContextKeys.stickyScrollFocused.bindTo(this._contextKeyService);
    this._stickyScrollVisibleContextKey = EditorContextKeys.stickyScrollVisible.bindTo(this._contextKeyService);
    const focusTracker = this._register(dom.trackFocus(stickyScrollDomNode));
    this._register(focusTracker.onDidBlur((_) => {
      if (this._positionRevealed === false && stickyScrollDomNode.clientHeight === 0) {
        this._focusedStickyElementIndex = -1;
        this.focus();
      } else {
        this._disposeFocusStickyScrollStore();
      }
    }));
    this._register(focusTracker.onDidFocus((_) => {
      this.focus();
    }));
    this._registerMouseListeners();
    this._register(dom.addDisposableListener(stickyScrollDomNode, dom.EventType.MOUSE_DOWN, (e) => {
      this._onMouseDown = true;
    }));
    this._register(this._stickyScrollWidget.onDidChangeStickyScrollHeight((e) => {
      this._onDidChangeStickyScrollHeight.fire(e);
    }));
    this._onDidResize();
    this._readConfiguration();
  }
  get stickyScrollCandidateProvider() {
    return this._stickyLineCandidateProvider;
  }
  get stickyScrollWidgetState() {
    return this._widgetState;
  }
  get stickyScrollWidgetHeight() {
    return this._stickyScrollWidget.height;
  }
  static get(editor) {
    return editor.getContribution(StickyScrollController.ID);
  }
  _disposeFocusStickyScrollStore() {
    this._stickyScrollFocusedContextKey.set(false);
    this._focusDisposableStore?.dispose();
    this._focused = false;
    this._positionRevealed = false;
    this._onMouseDown = false;
  }
  isFocused() {
    return this._focused;
  }
  focus() {
    if (this._onMouseDown) {
      this._onMouseDown = false;
      this._editor.focus();
      return;
    }
    const focusState = this._stickyScrollFocusedContextKey.get();
    if (focusState === true) {
      return;
    }
    this._focused = true;
    this._focusDisposableStore = new DisposableStore();
    this._stickyScrollFocusedContextKey.set(true);
    this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumbers.length - 1;
    this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
  }
  focusNext() {
    if (this._focusedStickyElementIndex < this._stickyScrollWidget.lineNumberCount - 1) {
      this._focusNav(true);
    }
  }
  focusPrevious() {
    if (this._focusedStickyElementIndex > 0) {
      this._focusNav(false);
    }
  }
  selectEditor() {
    this._editor.focus();
  }
  // True is next, false is previous
  _focusNav(direction) {
    this._focusedStickyElementIndex = direction ? this._focusedStickyElementIndex + 1 : this._focusedStickyElementIndex - 1;
    this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
  }
  goToFocused() {
    const lineNumbers = this._stickyScrollWidget.lineNumbers;
    this._disposeFocusStickyScrollStore();
    this._revealPosition({ lineNumber: lineNumbers[this._focusedStickyElementIndex], column: 1 });
  }
  _revealPosition(position) {
    this._reveaInEditor(position, () => this._editor.revealPosition(position));
  }
  _revealLineInCenterIfOutsideViewport(position) {
    this._reveaInEditor(position, () => this._editor.revealLineInCenterIfOutsideViewport(position.lineNumber, ScrollType.Smooth));
  }
  _reveaInEditor(position, revealFunction) {
    if (this._focused) {
      this._disposeFocusStickyScrollStore();
    }
    this._positionRevealed = true;
    revealFunction();
    this._editor.setSelection(Range.fromPositions(position));
    this._editor.focus();
  }
  _registerMouseListeners() {
    const sessionStore = this._register(new DisposableStore());
    const gesture = this._register(new ClickLinkGesture(this._editor, {
      extractLineNumberFromMouseEvent: (e) => {
        const position = this._stickyScrollWidget.getEditorPositionFromNode(e.target.element);
        return position ? position.lineNumber : 0;
      }
    }));
    const getMouseEventTarget = (mouseEvent) => {
      if (!this._editor.hasModel()) {
        return null;
      }
      if (mouseEvent.target.type !== MouseTargetType.OVERLAY_WIDGET || mouseEvent.target.detail !== this._stickyScrollWidget.getId()) {
        return null;
      }
      const mouseTargetElement = mouseEvent.target.element;
      if (!mouseTargetElement || mouseTargetElement.innerText !== mouseTargetElement.innerHTML) {
        return null;
      }
      const position = this._stickyScrollWidget.getEditorPositionFromNode(mouseTargetElement);
      if (!position) {
        return null;
      }
      return {
        range: new Range(position.lineNumber, position.column, position.lineNumber, position.column + mouseTargetElement.innerText.length),
        textElement: mouseTargetElement
      };
    };
    const stickyScrollWidgetDomNode = this._stickyScrollWidget.getDomNode();
    this._register(dom.addStandardDisposableListener(stickyScrollWidgetDomNode, dom.EventType.CLICK, (mouseEvent) => {
      if (mouseEvent.ctrlKey || mouseEvent.altKey || mouseEvent.metaKey) {
        return;
      }
      if (!mouseEvent.leftButton) {
        return;
      }
      if (mouseEvent.shiftKey) {
        const lineIndex = this._stickyScrollWidget.getLineIndexFromChildDomNode(mouseEvent.target);
        if (lineIndex === null) {
          return;
        }
        const position2 = new Position(this._endLineNumbers[lineIndex], 1);
        this._revealLineInCenterIfOutsideViewport(position2);
        return;
      }
      const isInFoldingIconDomNode = this._stickyScrollWidget.isInFoldingIconDomNode(mouseEvent.target);
      if (isInFoldingIconDomNode) {
        const lineNumber = this._stickyScrollWidget.getLineNumberFromChildDomNode(mouseEvent.target);
        this._toggleFoldingRegionForLine(lineNumber);
        return;
      }
      const isInStickyLine = this._stickyScrollWidget.isInStickyLine(mouseEvent.target);
      if (!isInStickyLine) {
        return;
      }
      let position = this._stickyScrollWidget.getEditorPositionFromNode(mouseEvent.target);
      if (!position) {
        const lineNumber = this._stickyScrollWidget.getLineNumberFromChildDomNode(mouseEvent.target);
        if (lineNumber === null) {
          return;
        }
        position = new Position(lineNumber, 1);
      }
      this._revealPosition(position);
    }));
    this._register(dom.addDisposableListener(mainWindow, dom.EventType.MOUSE_MOVE, (mouseEvent) => {
      this._mouseTarget = mouseEvent.target;
      this._onMouseMoveOrKeyDown(mouseEvent);
    }));
    this._register(dom.addDisposableListener(mainWindow, dom.EventType.KEY_DOWN, (mouseEvent) => {
      this._onMouseMoveOrKeyDown(mouseEvent);
    }));
    this._register(dom.addDisposableListener(mainWindow, dom.EventType.KEY_UP, () => {
      if (this._showEndForLine !== void 0) {
        this._showEndForLine = void 0;
        this._renderStickyScroll();
      }
    }));
    this._register(gesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, _keyboardEvent]) => {
      const mouseTarget = getMouseEventTarget(mouseEvent);
      if (!mouseTarget || !mouseEvent.hasTriggerModifier || !this._editor.hasModel()) {
        sessionStore.clear();
        return;
      }
      const { range, textElement } = mouseTarget;
      if (!range.equalsRange(this._stickyRangeProjectedOnEditor)) {
        this._stickyRangeProjectedOnEditor = range;
        sessionStore.clear();
      } else if (textElement.style.textDecoration === "underline") {
        return;
      }
      const cancellationToken = new CancellationTokenSource();
      sessionStore.add(toDisposable(() => cancellationToken.dispose(true)));
      let currentHTMLChild;
      getDefinitionsAtPosition(this._languageFeaturesService.definitionProvider, this._editor.getModel(), new Position(range.startLineNumber, range.startColumn + 1), false, cancellationToken.token).then(((candidateDefinitions) => {
        if (cancellationToken.token.isCancellationRequested) {
          return;
        }
        if (candidateDefinitions.length !== 0) {
          this._candidateDefinitionsLength = candidateDefinitions.length;
          const childHTML = textElement;
          if (currentHTMLChild !== childHTML) {
            sessionStore.clear();
            currentHTMLChild = childHTML;
            currentHTMLChild.style.textDecoration = "underline";
            sessionStore.add(toDisposable(() => {
              currentHTMLChild.style.textDecoration = "none";
            }));
          } else if (!currentHTMLChild) {
            currentHTMLChild = childHTML;
            currentHTMLChild.style.textDecoration = "underline";
            sessionStore.add(toDisposable(() => {
              currentHTMLChild.style.textDecoration = "none";
            }));
          }
        } else {
          sessionStore.clear();
        }
      }));
    }));
    this._register(gesture.onCancel(() => {
      sessionStore.clear();
    }));
    this._register(gesture.onExecute(async (e) => {
      if (e.target.type !== MouseTargetType.OVERLAY_WIDGET || e.target.detail !== this._stickyScrollWidget.getId()) {
        return;
      }
      const position = this._stickyScrollWidget.getEditorPositionFromNode(e.target.element);
      if (!position) {
        return;
      }
      if (!this._editor.hasModel() || !this._stickyRangeProjectedOnEditor) {
        return;
      }
      if (this._candidateDefinitionsLength > 1) {
        if (this._focused) {
          this._disposeFocusStickyScrollStore();
        }
        this._revealPosition({ lineNumber: position.lineNumber, column: 1 });
      }
      this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor, { uri: this._editor.getModel().uri, range: this._stickyRangeProjectedOnEditor });
    }));
  }
  _onContextMenu(targetWindow, e) {
    const event = new StandardMouseEvent(targetWindow, e);
    this._contextMenuService.showContextMenu({
      menuId: MenuId.StickyScrollContext,
      getAnchor: () => event,
      menuActionOptions: { renderShortTitle: true }
    });
  }
  _onMouseMoveOrKeyDown(mouseEvent) {
    if (!mouseEvent.shiftKey) {
      return;
    }
    if (!this._mouseTarget || !dom.isHTMLElement(this._mouseTarget)) {
      return;
    }
    const currentEndForLineIndex = this._stickyScrollWidget.getLineIndexFromChildDomNode(this._mouseTarget);
    if (currentEndForLineIndex === null || this._showEndForLine === currentEndForLineIndex) {
      return;
    }
    this._showEndForLine = currentEndForLineIndex;
    this._renderStickyScroll();
  }
  _toggleFoldingRegionForLine(line) {
    if (!this._foldingModel || line === null) {
      return;
    }
    const stickyLine = this._stickyScrollWidget.getRenderedStickyLine(line);
    const foldingIcon = stickyLine?.foldingIcon;
    if (!foldingIcon) {
      return;
    }
    toggleCollapseState(this._foldingModel, 1, [line]);
    foldingIcon.isCollapsed = !foldingIcon.isCollapsed;
    const scrollTop = (foldingIcon.isCollapsed ? this._editor.getTopForLineNumber(foldingIcon.foldingEndLine) : this._editor.getTopForLineNumber(foldingIcon.foldingStartLine)) - this._editor.getOption(EditorOption.lineHeight) * stickyLine.index + 1;
    this._editor.setScrollTop(scrollTop);
    this._renderStickyScroll(line);
  }
  _readConfiguration() {
    const options = this._editor.getOption(EditorOption.stickyScroll);
    if (options.enabled === false) {
      this._editor.removeOverlayWidget(this._stickyScrollWidget);
      this._resetState();
      this._sessionStore.clear();
      this._enabled = false;
      return;
    } else if (options.enabled && !this._enabled) {
      this._editor.addOverlayWidget(this._stickyScrollWidget);
      this._sessionStore.add(this._editor.onDidScrollChange((e) => {
        if (e.scrollTopChanged) {
          this._showEndForLine = void 0;
          this._renderStickyScroll();
        }
      }));
      this._sessionStore.add(this._editor.onDidLayoutChange(() => this._onDidResize()));
      this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this._onTokensChange(e)));
      this._sessionStore.add(this._stickyLineCandidateProvider.onDidChangeStickyScroll(() => {
        this._showEndForLine = void 0;
        this._renderStickyScroll();
      }));
      this._enabled = true;
    }
    const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);
    if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
      if (!this._cursorPositionListener) {
        this._cursorPositionListener = this._editor.onDidChangeCursorPosition((e) => {
          if (this._positionLineNumber === e.position.lineNumber) {
            return;
          }
          this._positionLineNumber = e.position.lineNumber;
          this._showEndForLine = void 0;
          this._renderStickyScroll(0);
        });
        this._sessionStore.add(this._cursorPositionListener);
      }
    } else if (this._cursorPositionListener) {
      this._sessionStore.delete(this._cursorPositionListener);
      this._cursorPositionListener.dispose();
      this._cursorPositionListener = void 0;
    }
  }
  _readConfigurationChange(event) {
    if (event.hasChanged(EditorOption.stickyScroll) || event.hasChanged(EditorOption.minimap) || event.hasChanged(EditorOption.lineHeight) || event.hasChanged(EditorOption.showFoldingControls) || event.hasChanged(EditorOption.lineNumbers)) {
      this._readConfiguration();
    }
    if (event.hasChanged(EditorOption.lineNumbers) || event.hasChanged(EditorOption.folding) || event.hasChanged(EditorOption.showFoldingControls)) {
      this._renderStickyScroll(0);
    }
  }
  _needsUpdate(event) {
    const stickyLineNumbers = this._stickyScrollWidget.getCurrentLines();
    for (const stickyLineNumber of stickyLineNumbers) {
      for (const range of event.ranges) {
        if (stickyLineNumber >= range.fromLineNumber && stickyLineNumber <= range.toLineNumber) {
          return true;
        }
      }
    }
    return false;
  }
  _onTokensChange(event) {
    if (this._needsUpdate(event)) {
      this._renderStickyScroll(0);
    }
  }
  _onDidResize() {
    const layoutInfo = this._editor.getLayoutInfo();
    const theoreticalLines = layoutInfo.height / this._editor.getOption(EditorOption.lineHeight);
    this._maxStickyLines = Math.round(theoreticalLines * 0.25);
    this._renderStickyScroll(0);
  }
  async _renderStickyScroll(rebuildFromLine) {
    const model = this._editor.getModel();
    if (!model || model.isTooLargeForTokenization()) {
      this._resetState();
      return;
    }
    const nextRebuildFromLine = this._updateAndGetMinRebuildFromLine(rebuildFromLine);
    const stickyWidgetVersion = this._stickyLineCandidateProvider.getVersionId();
    const shouldUpdateState = stickyWidgetVersion === void 0 || stickyWidgetVersion === model.getVersionId();
    if (shouldUpdateState) {
      if (!this._focused) {
        await this._updateState(nextRebuildFromLine);
      } else {
        if (this._focusedStickyElementIndex === -1) {
          await this._updateState(nextRebuildFromLine);
          this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumberCount - 1;
          if (this._focusedStickyElementIndex !== -1) {
            this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
          }
        } else {
          const focusedStickyElementLineNumber = this._stickyScrollWidget.lineNumbers[this._focusedStickyElementIndex];
          await this._updateState(nextRebuildFromLine);
          if (this._stickyScrollWidget.lineNumberCount === 0) {
            this._focusedStickyElementIndex = -1;
          } else {
            const previousFocusedLineNumberExists = this._stickyScrollWidget.lineNumbers.includes(focusedStickyElementLineNumber);
            if (!previousFocusedLineNumberExists) {
              this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumberCount - 1;
            }
            this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
          }
        }
      }
    }
  }
  _updateAndGetMinRebuildFromLine(rebuildFromLine) {
    if (rebuildFromLine !== void 0) {
      const minRebuildFromLineOrInfinity = this._minRebuildFromLine !== void 0 ? this._minRebuildFromLine : Infinity;
      this._minRebuildFromLine = Math.min(rebuildFromLine, minRebuildFromLineOrInfinity);
    }
    return this._minRebuildFromLine;
  }
  async _updateState(rebuildFromLine) {
    this._minRebuildFromLine = void 0;
    this._foldingModel = await FoldingController.get(this._editor)?.getFoldingModel() ?? void 0;
    this._widgetState = this.findScrollWidgetState();
    const stickyWidgetHasLines = this._widgetState.startLineNumbers.length > 0;
    this._stickyScrollVisibleContextKey.set(stickyWidgetHasLines);
    this._stickyScrollWidget.setState(this._widgetState, this._foldingModel, rebuildFromLine);
  }
  async _resetState() {
    this._minRebuildFromLine = void 0;
    this._foldingModel = void 0;
    this._widgetState = StickyScrollWidgetState.Empty;
    this._stickyScrollVisibleContextKey.set(false);
    this._stickyScrollWidget.setState(void 0, void 0);
  }
  findScrollWidgetState() {
    const maxNumberStickyLines = Math.min(this._maxStickyLines, this._editor.getOption(EditorOption.stickyScroll).maxLineCount);
    const scrollTop = this._editor.getScrollTop();
    let lastLineRelativePosition = 0;
    const startLineNumbers = [];
    const endLineNumbers = [];
    const arrayVisibleRanges = this._editor.getVisibleRanges();
    if (arrayVisibleRanges.length !== 0) {
      const fullVisibleRange = new StickyRange(arrayVisibleRanges[0].startLineNumber, arrayVisibleRanges[arrayVisibleRanges.length - 1].endLineNumber);
      const candidateRanges = this._stickyLineCandidateProvider.getCandidateStickyLinesIntersecting(fullVisibleRange);
      for (const range of candidateRanges) {
        const start = range.startLineNumber;
        const end = range.endLineNumber;
        const topOfElement = range.top;
        const bottomOfElement = topOfElement + range.height;
        const topOfBeginningLine = this._editor.getTopForLineNumber(start) - scrollTop;
        const bottomOfEndLine = this._editor.getBottomForLineNumber(end) - scrollTop;
        if (topOfElement > topOfBeginningLine && topOfElement <= bottomOfEndLine) {
          startLineNumbers.push(start);
          endLineNumbers.push(end + 1);
          if (bottomOfElement > bottomOfEndLine) {
            lastLineRelativePosition = bottomOfEndLine - bottomOfElement;
          }
        }
        if (startLineNumbers.length === maxNumberStickyLines) {
          break;
        }
      }
    }
    this._endLineNumbers = endLineNumbers;
    return new StickyScrollWidgetState(startLineNumbers, endLineNumbers, lastLineRelativePosition, this._showEndForLine);
  }
  dispose() {
    super.dispose();
    this._sessionStore.dispose();
  }
};
StickyScrollController.ID = "store.contrib.stickyScrollController";
StickyScrollController = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILanguageConfigurationService),
  __decorateParam(5, ILanguageFeatureDebounceService),
  __decorateParam(6, IContextKeyService)
], StickyScrollController);
export {
  StickyScrollController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN0aWNreVNjcm9sbFxcYnJvd3Nlclxcc3RpY2t5U2Nyb2xsQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgUmVuZGVyTGluZU51bWJlcnNUeXBlLCBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFN0aWNreVNjcm9sbFdpZGdldCwgU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGUgfSBmcm9tICcuL3N0aWNreVNjcm9sbFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJU3RpY2t5TGluZUNhbmRpZGF0ZVByb3ZpZGVyLCBTdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXIgfSBmcm9tICcuL3N0aWNreVNjcm9sbFByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENsaWNrTGlua0dlc3R1cmUsIENsaWNrTGlua01vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi9nb3RvU3ltYm9sL2Jyb3dzZXIvbGluay9jbGlja0xpbmtHZXN0dXJlLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBnZXREZWZpbml0aW9uc0F0UG9zaXRpb24gfSBmcm9tICcuLi8uLi9nb3RvU3ltYm9sL2Jyb3dzZXIvZ29Ub1N5bWJvbC5qcyc7XG5pbXBvcnQgeyBnb1RvRGVmaW5pdGlvbldpdGhMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2lubGF5SGludHMvYnJvd3Nlci9pbmxheUhpbnRzTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGlja3lSYW5nZSB9IGZyb20gJy4vc3RpY2t5U2Nyb2xsRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBJTW91c2VFdmVudCwgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgRm9sZGluZ0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9mb2xkaW5nL2Jyb3dzZXIvZm9sZGluZy5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nTW9kZWwsIHRvZ2dsZUNvbGxhcHNlU3RhdGUgfSBmcm9tICcuLi8uLi9mb2xkaW5nL2Jyb3dzZXIvZm9sZGluZ01vZGVsLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTdGlja3lTY3JvbGxDb250cm9sbGVyIHtcblx0Z2V0IHN0aWNreVNjcm9sbENhbmRpZGF0ZVByb3ZpZGVyKCk6IElTdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXI7XG5cdGdldCBzdGlja3lTY3JvbGxXaWRnZXRTdGF0ZSgpOiBTdGlja3lTY3JvbGxXaWRnZXRTdGF0ZTtcblx0cmVhZG9ubHkgc3RpY2t5U2Nyb2xsV2lkZ2V0SGVpZ2h0OiBudW1iZXI7XG5cdGlzRm9jdXNlZCgpOiBib29sZWFuO1xuXHRmb2N1cygpOiB2b2lkO1xuXHRmb2N1c05leHQoKTogdm9pZDtcblx0Zm9jdXNQcmV2aW91cygpOiB2b2lkO1xuXHRnb1RvRm9jdXNlZCgpOiB2b2lkO1xuXHRmaW5kU2Nyb2xsV2lkZ2V0U3RhdGUoKTogU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGU7XG5cdGRpc3Bvc2UoKTogdm9pZDtcblx0c2VsZWN0RWRpdG9yKCk6IHZvaWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RpY2t5U2Nyb2xsSGVpZ2h0OiBFdmVudDx7IGhlaWdodDogbnVtYmVyIH0+O1xufVxuXG5leHBvcnQgY2xhc3MgU3RpY2t5U2Nyb2xsQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uLCBJU3RpY2t5U2Nyb2xsQ29udHJvbGxlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3N0b3JlLmNvbnRyaWIuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RpY2t5U2Nyb2xsV2lkZ2V0OiBTdGlja3lTY3JvbGxXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlcjogSVN0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSBfd2lkZ2V0U3RhdGU6IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlO1xuXHRwcml2YXRlIF9mb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbWF4U3RpY2t5TGluZXM6IG51bWJlciA9IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXG5cdHByaXZhdGUgX3N0aWNreVJhbmdlUHJvamVjdGVkT25FZGl0b3I6IElSYW5nZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2FuZGlkYXRlRGVmaW5pdGlvbnNMZW5ndGg6IG51bWJlciA9IC0xO1xuXG5cdHByaXZhdGUgX3N0aWNreVNjcm9sbEZvY3VzZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfc3RpY2t5U2Nyb2xsVmlzaWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgX2ZvY3VzRGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXg6IG51bWJlciA9IC0xO1xuXHRwcml2YXRlIF9lbmFibGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2ZvY3VzZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcG9zaXRpb25SZXZlYWxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9vbk1vdXNlRG93biA9IGZhbHNlO1xuXHRwcml2YXRlIF9lbmRMaW5lTnVtYmVyczogbnVtYmVyW10gPSBbXTtcblx0cHJpdmF0ZSBfc2hvd0VuZEZvckxpbmU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbWluUmVidWlsZEZyb21MaW5lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21vdXNlVGFyZ2V0OiBFdmVudFRhcmdldCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9jdXJzb3JQb3NpdGlvbkxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcG9zaXRpb25MaW5lTnVtYmVyOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGlja3lTY3JvbGxIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGhlaWdodDogbnVtYmVyIH0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VTdGlja3lTY3JvbGxIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZVN0aWNreVNjcm9sbEhlaWdodC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIF9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0ID0gbmV3IFN0aWNreVNjcm9sbFdpZGdldCh0aGlzLl9lZGl0b3IpO1xuXHRcdHRoaXMuX3N0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlciA9IG5ldyBTdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXIodGhpcy5fZWRpdG9yLCBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlcik7XG5cblx0XHR0aGlzLl93aWRnZXRTdGF0ZSA9IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlLkVtcHR5O1xuXHRcdGNvbnN0IHN0aWNreVNjcm9sbERvbU5vZGUgPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuZ2V0RG9tTm9kZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUxpbmVIZWlnaHQoKGUpID0+IHtcblx0XHRcdGUuY2hhbmdlcy5mb3JFYWNoKChjaGFuZ2UpID0+IHtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGNoYW5nZS5saW5lTnVtYmVyO1xuXHRcdFx0XHRpZiAodGhpcy5fd2lkZ2V0U3RhdGUuc3RhcnRMaW5lTnVtYmVycy5pbmNsdWRlcyhsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlbmRlclN0aWNreVNjcm9sbChsaW5lTnVtYmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUZvbnQoKGUpID0+IHtcblx0XHRcdGUuY2hhbmdlcy5mb3JFYWNoKChjaGFuZ2UpID0+IHtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGNoYW5nZS5saW5lTnVtYmVyO1xuXHRcdFx0XHRpZiAodGhpcy5fd2lkZ2V0U3RhdGUuc3RhcnRMaW5lTnVtYmVycy5pbmNsdWRlcyhsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlbmRlclN0aWNreVNjcm9sbChsaW5lTnVtYmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHR0aGlzLl9yZWFkQ29uZmlndXJhdGlvbkNoYW5nZShlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzdGlja3lTY3JvbGxEb21Ob2RlLCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgYXN5bmMgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLl9vbkNvbnRleHRNZW51KGRvbS5nZXRXaW5kb3coc3RpY2t5U2Nyb2xsRG9tTm9kZSksIGV2ZW50KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsRm9jdXNlZENvbnRleHRLZXkgPSBFZGl0b3JDb250ZXh0S2V5cy5zdGlja3lTY3JvbGxGb2N1c2VkLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsVmlzaWJsZUNvbnRleHRLZXkgPSBFZGl0b3JDb250ZXh0S2V5cy5zdGlja3lTY3JvbGxWaXNpYmxlLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoZG9tLnRyYWNrRm9jdXMoc3RpY2t5U2Nyb2xsRG9tTm9kZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoXyA9PiB7XG5cdFx0XHQvLyBTdXBwb3NlIHRoYXQgdGhlIGJsdXJyaW5nIGlzIGNhdXNlZCBieSBzY3JvbGxpbmcsIHRoZW4ga2VlcCB0aGUgZm9jdXMgb24gdGhlIHN0aWNreSBzY3JvbGxcblx0XHRcdC8vIFRoaXMgaXMgZGV0ZXJtaW5lZCBieSB0aGUgZmFjdCB0aGF0IHRoZSBoZWlnaHQgb2YgdGhlIHdpZGdldCBoYXMgYmVjb21lIHplcm8gYW5kIHRoZXJlIGhhcyBiZWVuIG5vIHBvc2l0aW9uIHJldmVhbGluZ1xuXHRcdFx0aWYgKHRoaXMuX3Bvc2l0aW9uUmV2ZWFsZWQgPT09IGZhbHNlICYmIHN0aWNreVNjcm9sbERvbU5vZGUuY2xpZW50SGVpZ2h0ID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggPSAtMTtcblx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXG5cdFx0XHR9XG5cdFx0XHQvLyBJbiBhbGwgb3RoZXIgY2FzZWVzLCBkaXNwb3NlIHRoZSBmb2N1cyBvbiB0aGUgc3RpY2t5IHNjcm9sbFxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VGb2N1c1N0aWNreVNjcm9sbFN0b3JlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKF8gPT4ge1xuXHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlck1vdXNlTGlzdGVuZXJzKCk7XG5cdFx0Ly8gU3VwcG9zZSB0aGF0IG1vdXNlIGRvd24gb24gdGhlIHN0aWNreSBzY3JvbGwsIHRoZW4gZG8gbm90IGZvY3VzIG9uIHRoZSBzdGlja3kgc2Nyb2xsIGJlY2F1c2UgdGhpcyB3aWxsIGJlIGZvbGxvd2VkIGJ5IHRoZSByZXZlYWxpbmcgb2YgYSBwb3NpdGlvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc3RpY2t5U2Nyb2xsRG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5NT1VTRV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0dGhpcy5fb25Nb3VzZURvd24gPSB0cnVlO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQub25EaWRDaGFuZ2VTdGlja3lTY3JvbGxIZWlnaHQoKGUpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RpY2t5U2Nyb2xsSGVpZ2h0LmZpcmUoZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX29uRGlkUmVzaXplKCk7XG5cdFx0dGhpcy5fcmVhZENvbmZpZ3VyYXRpb24oKTtcblx0fVxuXG5cdGdldCBzdGlja3lTY3JvbGxDYW5kaWRhdGVQcm92aWRlcigpOiBJU3RpY2t5TGluZUNhbmRpZGF0ZVByb3ZpZGVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RpY2t5TGluZUNhbmRpZGF0ZVByb3ZpZGVyO1xuXHR9XG5cblx0Z2V0IHN0aWNreVNjcm9sbFdpZGdldFN0YXRlKCk6IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0U3RhdGU7XG5cdH1cblxuXHRnZXQgc3RpY2t5U2Nyb2xsV2lkZ2V0SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5oZWlnaHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogSVN0aWNreVNjcm9sbENvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxTdGlja3lTY3JvbGxDb250cm9sbGVyPihTdGlja3lTY3JvbGxDb250cm9sbGVyLklEKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VGb2N1c1N0aWNreVNjcm9sbFN0b3JlKCkge1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbEZvY3VzZWRDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0dGhpcy5fZm9jdXNEaXNwb3NhYmxlU3RvcmU/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9mb2N1c2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fcG9zaXRpb25SZXZlYWxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX29uTW91c2VEb3duID0gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9mb2N1c2VkO1xuXHR9XG5cblx0cHVibGljIGZvY3VzKCk6IHZvaWQge1xuXHRcdC8vIElmIHRoZSBtb3VzZSBpcyBkb3duLCBkbyBub3QgZm9jdXMgb24gdGhlIHN0aWNreSBzY3JvbGxcblx0XHRpZiAodGhpcy5fb25Nb3VzZURvd24pIHtcblx0XHRcdHRoaXMuX29uTW91c2VEb3duID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZm9jdXNTdGF0ZSA9IHRoaXMuX3N0aWNreVNjcm9sbEZvY3VzZWRDb250ZXh0S2V5LmdldCgpO1xuXHRcdGlmIChmb2N1c1N0YXRlID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2ZvY3VzZWQgPSB0cnVlO1xuXHRcdHRoaXMuX2ZvY3VzRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbEZvY3VzZWRDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHR0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4ID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmxpbmVOdW1iZXJzLmxlbmd0aCAtIDE7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmZvY3VzTGluZVdpdGhJbmRleCh0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1c05leHQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggPCB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQubGluZU51bWJlckNvdW50IC0gMSkge1xuXHRcdFx0dGhpcy5fZm9jdXNOYXYodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGZvY3VzUHJldmlvdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggPiAwKSB7XG5cdFx0XHR0aGlzLl9mb2N1c05hdihmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNlbGVjdEVkaXRvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0fVxuXG5cdC8vIFRydWUgaXMgbmV4dCwgZmFsc2UgaXMgcHJldmlvdXNcblx0cHJpdmF0ZSBfZm9jdXNOYXYoZGlyZWN0aW9uOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCA9IGRpcmVjdGlvbiA/IHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggKyAxIDogdGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCAtIDE7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmZvY3VzTGluZVdpdGhJbmRleCh0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnb1RvRm9jdXNlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBsaW5lTnVtYmVycyA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5saW5lTnVtYmVycztcblx0XHR0aGlzLl9kaXNwb3NlRm9jdXNTdGlja3lTY3JvbGxTdG9yZSgpO1xuXHRcdHRoaXMuX3JldmVhbFBvc2l0aW9uKHsgbGluZU51bWJlcjogbGluZU51bWJlcnNbdGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleF0sIGNvbHVtbjogMSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbFBvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYUluRWRpdG9yKHBvc2l0aW9uLCAoKSA9PiB0aGlzLl9lZGl0b3IucmV2ZWFsUG9zaXRpb24ocG9zaXRpb24pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHBvc2l0aW9uOiBJUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYUluRWRpdG9yKHBvc2l0aW9uLCAoKSA9PiB0aGlzLl9lZGl0b3IucmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocG9zaXRpb24ubGluZU51bWJlciwgU2Nyb2xsVHlwZS5TbW9vdGgpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhSW5FZGl0b3IocG9zaXRpb246IElQb3NpdGlvbiwgcmV2ZWFsRnVuY3Rpb246ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZm9jdXNlZCkge1xuXHRcdFx0dGhpcy5fZGlzcG9zZUZvY3VzU3RpY2t5U2Nyb2xsU3RvcmUoKTtcblx0XHR9XG5cdFx0dGhpcy5fcG9zaXRpb25SZXZlYWxlZCA9IHRydWU7XG5cdFx0cmV2ZWFsRnVuY3Rpb24oKTtcblx0XHR0aGlzLl9lZGl0b3Iuc2V0U2VsZWN0aW9uKFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24pKTtcblx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTW91c2VMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHRjb25zdCBzZXNzaW9uU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGdlc3R1cmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2xpY2tMaW5rR2VzdHVyZSh0aGlzLl9lZGl0b3IsIHtcblx0XHRcdGV4dHJhY3RMaW5lTnVtYmVyRnJvbU1vdXNlRXZlbnQ6IChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldEVkaXRvclBvc2l0aW9uRnJvbU5vZGUoZS50YXJnZXQuZWxlbWVudCk7XG5cdFx0XHRcdHJldHVybiBwb3NpdGlvbiA/IHBvc2l0aW9uLmxpbmVOdW1iZXIgOiAwO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGdldE1vdXNlRXZlbnRUYXJnZXQgPSAobW91c2VFdmVudDogQ2xpY2tMaW5rTW91c2VFdmVudCk6IHsgcmFuZ2U6IFJhbmdlOyB0ZXh0RWxlbWVudDogSFRNTEVsZW1lbnQgfSB8IG51bGwgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmIChtb3VzZUV2ZW50LnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuT1ZFUkxBWV9XSURHRVQgfHwgbW91c2VFdmVudC50YXJnZXQuZGV0YWlsICE9PSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuZ2V0SWQoKSkge1xuXHRcdFx0XHQvLyBub3QgaG92ZXJpbmcgb3ZlciBvdXIgd2lkZ2V0XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW91c2VUYXJnZXRFbGVtZW50ID0gbW91c2VFdmVudC50YXJnZXQuZWxlbWVudDtcblx0XHRcdGlmICghbW91c2VUYXJnZXRFbGVtZW50IHx8IG1vdXNlVGFyZ2V0RWxlbWVudC5pbm5lclRleHQgIT09IG1vdXNlVGFyZ2V0RWxlbWVudC5pbm5lckhUTUwpIHtcblx0XHRcdFx0Ly8gbm90IG9uIGEgc3BhbiBlbGVtZW50IHJlbmRlcmluZyB0ZXh0XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuZ2V0RWRpdG9yUG9zaXRpb25Gcm9tTm9kZShtb3VzZVRhcmdldEVsZW1lbnQpO1xuXHRcdFx0aWYgKCFwb3NpdGlvbikge1xuXHRcdFx0XHQvLyBub3QgaG92ZXJpbmcgYSBzdGlja3kgc2Nyb2xsIGxpbmVcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uICsgbW91c2VUYXJnZXRFbGVtZW50LmlubmVyVGV4dC5sZW5ndGgpLFxuXHRcdFx0XHR0ZXh0RWxlbWVudDogbW91c2VUYXJnZXRFbGVtZW50XG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRjb25zdCBzdGlja3lTY3JvbGxXaWRnZXREb21Ob2RlID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldERvbU5vZGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoc3RpY2t5U2Nyb2xsV2lkZ2V0RG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5DTElDSywgKG1vdXNlRXZlbnQ6IElNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAobW91c2VFdmVudC5jdHJsS2V5IHx8IG1vdXNlRXZlbnQuYWx0S2V5IHx8IG1vdXNlRXZlbnQubWV0YUtleSkge1xuXHRcdFx0XHQvLyBtb2RpZmllciBwcmVzc2VkXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghbW91c2VFdmVudC5sZWZ0QnV0dG9uKSB7XG5cdFx0XHRcdC8vIG5vdCBsZWZ0IGNsaWNrXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChtb3VzZUV2ZW50LnNoaWZ0S2V5KSB7XG5cdFx0XHRcdC8vIHNoaWZ0IGNsaWNrXG5cdFx0XHRcdGNvbnN0IGxpbmVJbmRleCA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5nZXRMaW5lSW5kZXhGcm9tQ2hpbGREb21Ob2RlKG1vdXNlRXZlbnQudGFyZ2V0KTtcblx0XHRcdFx0aWYgKGxpbmVJbmRleCA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IG5ldyBQb3NpdGlvbih0aGlzLl9lbmRMaW5lTnVtYmVyc1tsaW5lSW5kZXhdLCAxKTtcblx0XHRcdFx0dGhpcy5fcmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocG9zaXRpb24pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpc0luRm9sZGluZ0ljb25Eb21Ob2RlID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmlzSW5Gb2xkaW5nSWNvbkRvbU5vZGUobW91c2VFdmVudC50YXJnZXQpO1xuXHRcdFx0aWYgKGlzSW5Gb2xkaW5nSWNvbkRvbU5vZGUpIHtcblx0XHRcdFx0Ly8gY2xpY2tlZCBvbiBmb2xkaW5nIGljb25cblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5nZXRMaW5lTnVtYmVyRnJvbUNoaWxkRG9tTm9kZShtb3VzZUV2ZW50LnRhcmdldCk7XG5cdFx0XHRcdHRoaXMuX3RvZ2dsZUZvbGRpbmdSZWdpb25Gb3JMaW5lKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpc0luU3RpY2t5TGluZSA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5pc0luU3RpY2t5TGluZShtb3VzZUV2ZW50LnRhcmdldCk7XG5cdFx0XHRpZiAoIWlzSW5TdGlja3lMaW5lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIG5vcm1hbCBjbGlja1xuXHRcdFx0bGV0IHBvc2l0aW9uID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldEVkaXRvclBvc2l0aW9uRnJvbU5vZGUobW91c2VFdmVudC50YXJnZXQpO1xuXHRcdFx0aWYgKCFwb3NpdGlvbikge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldExpbmVOdW1iZXJGcm9tQ2hpbGREb21Ob2RlKG1vdXNlRXZlbnQudGFyZ2V0KTtcblx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IG51bGwpIHtcblx0XHRcdFx0XHQvLyBub3QgaG92ZXJpbmcgYSBzdGlja3kgc2Nyb2xsIGxpbmVcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cG9zaXRpb24gPSBuZXcgUG9zaXRpb24obGluZU51bWJlciwgMSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZXZlYWxQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobWFpbldpbmRvdywgZG9tLkV2ZW50VHlwZS5NT1VTRV9NT1ZFLCBtb3VzZUV2ZW50ID0+IHtcblx0XHRcdHRoaXMuX21vdXNlVGFyZ2V0ID0gbW91c2VFdmVudC50YXJnZXQ7XG5cdFx0XHR0aGlzLl9vbk1vdXNlTW92ZU9yS2V5RG93bihtb3VzZUV2ZW50KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihtYWluV2luZG93LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBtb3VzZUV2ZW50ID0+IHtcblx0XHRcdHRoaXMuX29uTW91c2VNb3ZlT3JLZXlEb3duKG1vdXNlRXZlbnQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1haW5XaW5kb3csIGRvbS5FdmVudFR5cGUuS0VZX1VQLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc2hvd0VuZEZvckxpbmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9zaG93RW5kRm9yTGluZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fcmVuZGVyU3RpY2t5U2Nyb2xsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZ2VzdHVyZS5vbk1vdXNlTW92ZU9yUmVsZXZhbnRLZXlEb3duKChbbW91c2VFdmVudCwgX2tleWJvYXJkRXZlbnRdKSA9PiB7XG5cdFx0XHRjb25zdCBtb3VzZVRhcmdldCA9IGdldE1vdXNlRXZlbnRUYXJnZXQobW91c2VFdmVudCk7XG5cdFx0XHRpZiAoIW1vdXNlVGFyZ2V0IHx8ICFtb3VzZUV2ZW50Lmhhc1RyaWdnZXJNb2RpZmllciB8fCAhdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0c2Vzc2lvblN0b3JlLmNsZWFyKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgcmFuZ2UsIHRleHRFbGVtZW50IH0gPSBtb3VzZVRhcmdldDtcblxuXHRcdFx0aWYgKCFyYW5nZS5lcXVhbHNSYW5nZSh0aGlzLl9zdGlja3lSYW5nZVByb2plY3RlZE9uRWRpdG9yKSkge1xuXHRcdFx0XHR0aGlzLl9zdGlja3lSYW5nZVByb2plY3RlZE9uRWRpdG9yID0gcmFuZ2U7XG5cdFx0XHRcdHNlc3Npb25TdG9yZS5jbGVhcigpO1xuXHRcdFx0fSBlbHNlIGlmICh0ZXh0RWxlbWVudC5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9PT0gJ3VuZGVybGluZScpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjYW5jZWxsYXRpb25Ub2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0c2Vzc2lvblN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY2FuY2VsbGF0aW9uVG9rZW4uZGlzcG9zZSh0cnVlKSkpO1xuXG5cdFx0XHRsZXQgY3VycmVudEhUTUxDaGlsZDogSFRNTEVsZW1lbnQ7XG5cblx0XHRcdGdldERlZmluaXRpb25zQXRQb3NpdGlvbih0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWZpbml0aW9uUHJvdmlkZXIsIHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLCBuZXcgUG9zaXRpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiArIDEpLCBmYWxzZSwgY2FuY2VsbGF0aW9uVG9rZW4udG9rZW4pLnRoZW4oKGNhbmRpZGF0ZURlZmluaXRpb25zID0+IHtcblx0XHRcdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjYW5kaWRhdGVEZWZpbml0aW9ucy5sZW5ndGggIT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9jYW5kaWRhdGVEZWZpbml0aW9uc0xlbmd0aCA9IGNhbmRpZGF0ZURlZmluaXRpb25zLmxlbmd0aDtcblx0XHRcdFx0XHRjb25zdCBjaGlsZEhUTUw6IEhUTUxFbGVtZW50ID0gdGV4dEVsZW1lbnQ7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRIVE1MQ2hpbGQgIT09IGNoaWxkSFRNTCkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvblN0b3JlLmNsZWFyKCk7XG5cdFx0XHRcdFx0XHRjdXJyZW50SFRNTENoaWxkID0gY2hpbGRIVE1MO1xuXHRcdFx0XHRcdFx0Y3VycmVudEhUTUxDaGlsZC5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICd1bmRlcmxpbmUnO1xuXHRcdFx0XHRcdFx0c2Vzc2lvblN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjdXJyZW50SFRNTENoaWxkLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJ25vbmUnO1xuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIWN1cnJlbnRIVE1MQ2hpbGQpIHtcblx0XHRcdFx0XHRcdGN1cnJlbnRIVE1MQ2hpbGQgPSBjaGlsZEhUTUw7XG5cdFx0XHRcdFx0XHRjdXJyZW50SFRNTENoaWxkLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJ3VuZGVybGluZSc7XG5cdFx0XHRcdFx0XHRzZXNzaW9uU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGN1cnJlbnRIVE1MQ2hpbGQuc3R5bGUudGV4dERlY29yYXRpb24gPSAnbm9uZSc7XG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlc3Npb25TdG9yZS5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGdlc3R1cmUub25DYW5jZWwoKCkgPT4ge1xuXHRcdFx0c2Vzc2lvblN0b3JlLmNsZWFyKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGdlc3R1cmUub25FeGVjdXRlKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5PVkVSTEFZX1dJREdFVCB8fCBlLnRhcmdldC5kZXRhaWwgIT09IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5nZXRJZCgpKSB7XG5cdFx0XHRcdC8vIG5vdCBob3ZlcmluZyBvdmVyIG91ciB3aWRnZXRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuZ2V0RWRpdG9yUG9zaXRpb25Gcm9tTm9kZShlLnRhcmdldC5lbGVtZW50KTtcblx0XHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdFx0Ly8gbm90IGhvdmVyaW5nIGEgc3RpY2t5IHNjcm9sbCBsaW5lXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgIXRoaXMuX3N0aWNreVJhbmdlUHJvamVjdGVkT25FZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2NhbmRpZGF0ZURlZmluaXRpb25zTGVuZ3RoID4gMSkge1xuXHRcdFx0XHRpZiAodGhpcy5fZm9jdXNlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3Bvc2VGb2N1c1N0aWNreVNjcm9sbFN0b3JlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmV2ZWFsUG9zaXRpb24oeyBsaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLCBjb2x1bW46IDEgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ29Ub0RlZmluaXRpb25XaXRoTG9jYXRpb24sIGUsIHRoaXMuX2VkaXRvciwgeyB1cmk6IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLnVyaSwgcmFuZ2U6IHRoaXMuX3N0aWNreVJhbmdlUHJvamVjdGVkT25FZGl0b3IgfSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Db250ZXh0TWVudSh0YXJnZXRXaW5kb3c6IFdpbmRvdywgZTogTW91c2VFdmVudCkge1xuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudCh0YXJnZXRXaW5kb3csIGUpO1xuXG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5TdGlja3lTY3JvbGxDb250ZXh0LFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX29uTW91c2VNb3ZlT3JLZXlEb3duKG1vdXNlRXZlbnQ6IEtleWJvYXJkRXZlbnQgfCBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFtb3VzZUV2ZW50LnNoaWZ0S2V5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fbW91c2VUYXJnZXQgfHwgIWRvbS5pc0hUTUxFbGVtZW50KHRoaXMuX21vdXNlVGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50RW5kRm9yTGluZUluZGV4ID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldExpbmVJbmRleEZyb21DaGlsZERvbU5vZGUodGhpcy5fbW91c2VUYXJnZXQpO1xuXHRcdGlmIChjdXJyZW50RW5kRm9yTGluZUluZGV4ID09PSBudWxsIHx8IHRoaXMuX3Nob3dFbmRGb3JMaW5lID09PSBjdXJyZW50RW5kRm9yTGluZUluZGV4KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nob3dFbmRGb3JMaW5lID0gY3VycmVudEVuZEZvckxpbmVJbmRleDtcblx0XHR0aGlzLl9yZW5kZXJTdGlja3lTY3JvbGwoKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvZ2dsZUZvbGRpbmdSZWdpb25Gb3JMaW5lKGxpbmU6IG51bWJlciB8IG51bGwpIHtcblx0XHRpZiAoIXRoaXMuX2ZvbGRpbmdNb2RlbCB8fCBsaW5lID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0aWNreUxpbmUgPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuZ2V0UmVuZGVyZWRTdGlja3lMaW5lKGxpbmUpO1xuXHRcdGNvbnN0IGZvbGRpbmdJY29uID0gc3RpY2t5TGluZT8uZm9sZGluZ0ljb247XG5cdFx0aWYgKCFmb2xkaW5nSWNvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0b2dnbGVDb2xsYXBzZVN0YXRlKHRoaXMuX2ZvbGRpbmdNb2RlbCwgMSwgW2xpbmVdKTtcblx0XHRmb2xkaW5nSWNvbi5pc0NvbGxhcHNlZCA9ICFmb2xkaW5nSWNvbi5pc0NvbGxhcHNlZDtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSAoZm9sZGluZ0ljb24uaXNDb2xsYXBzZWQgP1xuXHRcdFx0dGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIoZm9sZGluZ0ljb24uZm9sZGluZ0VuZExpbmUpXG5cdFx0XHQ6IHRoaXMuX2VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKGZvbGRpbmdJY29uLmZvbGRpbmdTdGFydExpbmUpKVxuXHRcdFx0LSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSAqIHN0aWNreUxpbmUuaW5kZXggKyAxO1xuXHRcdHRoaXMuX2VkaXRvci5zZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wKTtcblx0XHR0aGlzLl9yZW5kZXJTdGlja3lTY3JvbGwobGluZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkQ29uZmlndXJhdGlvbigpIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsKTtcblx0XHRpZiAob3B0aW9ucy5lbmFibGVkID09PSBmYWxzZSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQodGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0KTtcblx0XHRcdHRoaXMuX3Jlc2V0U3RhdGUoKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdG9yZS5jbGVhcigpO1xuXHRcdFx0dGhpcy5fZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSBpZiAob3B0aW9ucy5lbmFibGVkICYmICF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHQvLyBXaGVuIHN0aWNreSBzY3JvbGwgd2FzIGp1c3QgZW5hYmxlZCwgYWRkIHRoZSBsaXN0ZW5lcnMgb24gdGhlIHN0aWNreSBzY3JvbGxcblx0XHRcdHRoaXMuX2VkaXRvci5hZGRPdmVybGF5V2lkZ2V0KHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbkRpZFNjcm9sbENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5zY3JvbGxUb3BDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd0VuZEZvckxpbmUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fcmVuZGVyU3RpY2t5U2Nyb2xsKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlKCgpID0+IHRoaXMuX29uRGlkUmVzaXplKCkpKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxUb2tlbnMoKGUpID0+IHRoaXMuX29uVG9rZW5zQ2hhbmdlKGUpKSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RvcmUuYWRkKHRoaXMuX3N0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlci5vbkRpZENoYW5nZVN0aWNreVNjcm9sbCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Nob3dFbmRGb3JMaW5lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJTdGlja3lTY3JvbGwoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2VuYWJsZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVOdW1iZXJPcHRpb24gPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lTnVtYmVycyk7XG5cdFx0aWYgKGxpbmVOdW1iZXJPcHRpb24ucmVuZGVyVHlwZSA9PT0gUmVuZGVyTGluZU51bWJlcnNUeXBlLlJlbGF0aXZlKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2N1cnNvclBvc2l0aW9uTGlzdGVuZXIpIHtcblx0XHRcdFx0dGhpcy5fY3Vyc29yUG9zaXRpb25MaXN0ZW5lciA9IHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3Bvc2l0aW9uTGluZU51bWJlciA9PT0gZS5wb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3Bvc2l0aW9uTGluZU51bWJlciA9IGUucG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdFx0XHR0aGlzLl9zaG93RW5kRm9yTGluZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJTdGlja3lTY3JvbGwoMCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uU3RvcmUuYWRkKHRoaXMuX2N1cnNvclBvc2l0aW9uTGlzdGVuZXIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5fY3Vyc29yUG9zaXRpb25MaXN0ZW5lcikge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN0b3JlLmRlbGV0ZSh0aGlzLl9jdXJzb3JQb3NpdGlvbkxpc3RlbmVyKTtcblx0XHRcdHRoaXMuX2N1cnNvclBvc2l0aW9uTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fY3Vyc29yUG9zaXRpb25MaXN0ZW5lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkQ29uZmlndXJhdGlvbkNoYW5nZShldmVudDogQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCkge1xuXHRcdGlmIChcblx0XHRcdGV2ZW50Lmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbClcblx0XHRcdHx8IGV2ZW50Lmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLm1pbmltYXApXG5cdFx0XHR8fCBldmVudC5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KVxuXHRcdFx0fHwgZXZlbnQuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uc2hvd0ZvbGRpbmdDb250cm9scylcblx0XHRcdHx8IGV2ZW50Lmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzKVxuXHRcdCkge1xuXHRcdFx0dGhpcy5fcmVhZENvbmZpZ3VyYXRpb24oKTtcblx0XHR9XG5cblx0XHRpZiAoZXZlbnQuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGluZU51bWJlcnMpIHx8IGV2ZW50Lmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbGRpbmcpIHx8IGV2ZW50Lmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnNob3dGb2xkaW5nQ29udHJvbHMpKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJTdGlja3lTY3JvbGwoMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbmVlZHNVcGRhdGUoZXZlbnQ6IElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCkge1xuXHRcdGNvbnN0IHN0aWNreUxpbmVOdW1iZXJzID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldEN1cnJlbnRMaW5lcygpO1xuXHRcdGZvciAoY29uc3Qgc3RpY2t5TGluZU51bWJlciBvZiBzdGlja3lMaW5lTnVtYmVycykge1xuXHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiBldmVudC5yYW5nZXMpIHtcblx0XHRcdFx0aWYgKHN0aWNreUxpbmVOdW1iZXIgPj0gcmFuZ2UuZnJvbUxpbmVOdW1iZXIgJiYgc3RpY2t5TGluZU51bWJlciA8PSByYW5nZS50b0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9vblRva2Vuc0NoYW5nZShldmVudDogSU1vZGVsVG9rZW5zQ2hhbmdlZEV2ZW50KSB7XG5cdFx0aWYgKHRoaXMuX25lZWRzVXBkYXRlKGV2ZW50KSkge1xuXHRcdFx0Ly8gUmVidWlsZGluZyB0aGUgd2hvbGUgd2lkZ2V0IGZyb20gbGluZSAwXG5cdFx0XHR0aGlzLl9yZW5kZXJTdGlja3lTY3JvbGwoMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRSZXNpemUoKSB7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX2VkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Ly8gTWFrZSBzdXJlIHN0aWNreSBzY3JvbGwgZG9lc24ndCB0YWtlIHVwIG1vcmUgdGhhbiAyNSUgb2YgdGhlIGVkaXRvclxuXHRcdGNvbnN0IHRoZW9yZXRpY2FsTGluZXMgPSBsYXlvdXRJbmZvLmhlaWdodCAvIHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdHRoaXMuX21heFN0aWNreUxpbmVzID0gTWF0aC5yb3VuZCh0aGVvcmV0aWNhbExpbmVzICogLjI1KTtcblx0XHR0aGlzLl9yZW5kZXJTdGlja3lTY3JvbGwoMCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZW5kZXJTdGlja3lTY3JvbGwocmVidWlsZEZyb21MaW5lPzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsIHx8IG1vZGVsLmlzVG9vTGFyZ2VGb3JUb2tlbml6YXRpb24oKSkge1xuXHRcdFx0dGhpcy5fcmVzZXRTdGF0ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0UmVidWlsZEZyb21MaW5lID0gdGhpcy5fdXBkYXRlQW5kR2V0TWluUmVidWlsZEZyb21MaW5lKHJlYnVpbGRGcm9tTGluZSk7XG5cdFx0Y29uc3Qgc3RpY2t5V2lkZ2V0VmVyc2lvbiA9IHRoaXMuX3N0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlci5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCBzaG91bGRVcGRhdGVTdGF0ZSA9IHN0aWNreVdpZGdldFZlcnNpb24gPT09IHVuZGVmaW5lZCB8fCBzdGlja3lXaWRnZXRWZXJzaW9uID09PSBtb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHRpZiAoc2hvdWxkVXBkYXRlU3RhdGUpIHtcblx0XHRcdGlmICghdGhpcy5fZm9jdXNlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVTdGF0ZShuZXh0UmVidWlsZEZyb21MaW5lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFN1cHBvc2UgdGhhdCBwcmV2aW91c2x5IHRoZSBzdGlja3kgc2Nyb2xsIHdpZGdldCBoYWQgaGVpZ2h0IDAsIHRoZW4gaWYgdGhlcmUgYXJlIHZpc2libGUgbGluZXMsIHNldCB0aGUgbGFzdCBsaW5lIGFzIGZvY3VzZWRcblx0XHRcdFx0aWYgKHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdXBkYXRlU3RhdGUobmV4dFJlYnVpbGRGcm9tTGluZSk7XG5cdFx0XHRcdFx0dGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5saW5lTnVtYmVyQ291bnQgLSAxO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmZvY3VzTGluZVdpdGhJbmRleCh0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9jdXNlZFN0aWNreUVsZW1lbnRMaW5lTnVtYmVyID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmxpbmVOdW1iZXJzW3RoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXhdO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVN0YXRlKG5leHRSZWJ1aWxkRnJvbUxpbmUpO1xuXHRcdFx0XHRcdC8vIFN1cHBvc2UgdGhhdCBhZnRlciBzZXR0aW5nIHRoZSBzdGF0ZSwgdGhlcmUgYXJlIG5vIHN0aWNreSBsaW5lcywgc2V0IHRoZSBmb2N1c2VkIGluZGV4IHRvIC0xXG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5saW5lTnVtYmVyQ291bnQgPT09IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggPSAtMTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJldmlvdXNGb2N1c2VkTGluZU51bWJlckV4aXN0cyA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5saW5lTnVtYmVycy5pbmNsdWRlcyhmb2N1c2VkU3RpY2t5RWxlbWVudExpbmVOdW1iZXIpO1xuXG5cdFx0XHRcdFx0XHQvLyBJZiB0aGUgbGluZSBudW1iZXIgaXMgc3RpbGwgdGhlcmUsIGRvIG5vdCBjaGFuZ2UgYW55dGhpbmdcblx0XHRcdFx0XHRcdC8vIElmIHRoZSBsaW5lIG51bWJlciBpcyBub3QgdGhlcmUsIHNldCB0aGUgbmV3IGZvY3VzZWQgbGluZSB0byBiZSB0aGUgbGFzdCBsaW5lXG5cdFx0XHRcdFx0XHRpZiAoIXByZXZpb3VzRm9jdXNlZExpbmVOdW1iZXJFeGlzdHMpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5saW5lTnVtYmVyQ291bnQgLSAxO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmZvY3VzTGluZVdpdGhJbmRleCh0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVBbmRHZXRNaW5SZWJ1aWxkRnJvbUxpbmUocmVidWlsZEZyb21MaW5lOiBudW1iZXIgfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmIChyZWJ1aWxkRnJvbUxpbmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgbWluUmVidWlsZEZyb21MaW5lT3JJbmZpbml0eSA9IHRoaXMuX21pblJlYnVpbGRGcm9tTGluZSAhPT0gdW5kZWZpbmVkID8gdGhpcy5fbWluUmVidWlsZEZyb21MaW5lIDogSW5maW5pdHk7XG5cdFx0XHR0aGlzLl9taW5SZWJ1aWxkRnJvbUxpbmUgPSBNYXRoLm1pbihyZWJ1aWxkRnJvbUxpbmUsIG1pblJlYnVpbGRGcm9tTGluZU9ySW5maW5pdHkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWluUmVidWlsZEZyb21MaW5lO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlU3RhdGUocmVidWlsZEZyb21MaW5lPzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbWluUmVidWlsZEZyb21MaW5lID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2ZvbGRpbmdNb2RlbCA9IGF3YWl0IEZvbGRpbmdDb250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3IpPy5nZXRGb2xkaW5nTW9kZWwoKSA/PyB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fd2lkZ2V0U3RhdGUgPSB0aGlzLmZpbmRTY3JvbGxXaWRnZXRTdGF0ZSgpO1xuXHRcdGNvbnN0IHN0aWNreVdpZGdldEhhc0xpbmVzID0gdGhpcy5fd2lkZ2V0U3RhdGUuc3RhcnRMaW5lTnVtYmVycy5sZW5ndGggPiAwO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbFZpc2libGVDb250ZXh0S2V5LnNldChzdGlja3lXaWRnZXRIYXNMaW5lcyk7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LnNldFN0YXRlKHRoaXMuX3dpZGdldFN0YXRlLCB0aGlzLl9mb2xkaW5nTW9kZWwsIHJlYnVpbGRGcm9tTGluZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNldFN0YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX21pblJlYnVpbGRGcm9tTGluZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9mb2xkaW5nTW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fd2lkZ2V0U3RhdGUgPSBTdGlja3lTY3JvbGxXaWRnZXRTdGF0ZS5FbXB0eTtcblx0XHR0aGlzLl9zdGlja3lTY3JvbGxWaXNpYmxlQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5zZXRTdGF0ZSh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRmaW5kU2Nyb2xsV2lkZ2V0U3RhdGUoKTogU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGUge1xuXHRcdGNvbnN0IG1heE51bWJlclN0aWNreUxpbmVzID0gTWF0aC5taW4odGhpcy5fbWF4U3RpY2t5TGluZXMsIHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCkubWF4TGluZUNvdW50KTtcblx0XHRjb25zdCBzY3JvbGxUb3A6IG51bWJlciA9IHRoaXMuX2VkaXRvci5nZXRTY3JvbGxUb3AoKTtcblx0XHRsZXQgbGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uOiBudW1iZXIgPSAwO1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlcnM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlcnM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgYXJyYXlWaXNpYmxlUmFuZ2VzID0gdGhpcy5fZWRpdG9yLmdldFZpc2libGVSYW5nZXMoKTtcblx0XHRpZiAoYXJyYXlWaXNpYmxlUmFuZ2VzLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0Y29uc3QgZnVsbFZpc2libGVSYW5nZSA9IG5ldyBTdGlja3lSYW5nZShhcnJheVZpc2libGVSYW5nZXNbMF0uc3RhcnRMaW5lTnVtYmVyLCBhcnJheVZpc2libGVSYW5nZXNbYXJyYXlWaXNpYmxlUmFuZ2VzLmxlbmd0aCAtIDFdLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlUmFuZ2VzID0gdGhpcy5fc3RpY2t5TGluZUNhbmRpZGF0ZVByb3ZpZGVyLmdldENhbmRpZGF0ZVN0aWNreUxpbmVzSW50ZXJzZWN0aW5nKGZ1bGxWaXNpYmxlUmFuZ2UpO1xuXHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiBjYW5kaWRhdGVSYW5nZXMpIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnQgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdGNvbnN0IGVuZCA9IHJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdGNvbnN0IHRvcE9mRWxlbWVudCA9IHJhbmdlLnRvcDtcblx0XHRcdFx0Y29uc3QgYm90dG9tT2ZFbGVtZW50ID0gdG9wT2ZFbGVtZW50ICsgcmFuZ2UuaGVpZ2h0O1xuXHRcdFx0XHRjb25zdCB0b3BPZkJlZ2lubmluZ0xpbmUgPSB0aGlzLl9lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihzdGFydCkgLSBzY3JvbGxUb3A7XG5cdFx0XHRcdGNvbnN0IGJvdHRvbU9mRW5kTGluZSA9IHRoaXMuX2VkaXRvci5nZXRCb3R0b21Gb3JMaW5lTnVtYmVyKGVuZCkgLSBzY3JvbGxUb3A7XG5cdFx0XHRcdGlmICh0b3BPZkVsZW1lbnQgPiB0b3BPZkJlZ2lubmluZ0xpbmUgJiYgdG9wT2ZFbGVtZW50IDw9IGJvdHRvbU9mRW5kTGluZSkge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcnMucHVzaChzdGFydCk7XG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcnMucHVzaChlbmQgKyAxKTtcblx0XHRcdFx0XHRpZiAoYm90dG9tT2ZFbGVtZW50ID4gYm90dG9tT2ZFbmRMaW5lKSB7XG5cdFx0XHRcdFx0XHRsYXN0TGluZVJlbGF0aXZlUG9zaXRpb24gPSBib3R0b21PZkVuZExpbmUgLSBib3R0b21PZkVsZW1lbnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdGFydExpbmVOdW1iZXJzLmxlbmd0aCA9PT0gbWF4TnVtYmVyU3RpY2t5TGluZXMpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9lbmRMaW5lTnVtYmVycyA9IGVuZExpbmVOdW1iZXJzO1xuXHRcdHJldHVybiBuZXcgU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGUoc3RhcnRMaW5lTnVtYmVycywgZW5kTGluZU51bWJlcnMsIGxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbiwgdGhpcy5fc2hvd0VuZEZvckxpbmUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0b3JlLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFzQixZQUFZLGlCQUFpQixvQkFBb0I7QUFDdkUsU0FBc0IsdUJBQXVCO0FBQzdDLFNBQThCLGtCQUFrQjtBQUNoRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGNBQWMsNkJBQXdEO0FBQy9FLFNBQVMsb0JBQW9CLCtCQUErQjtBQUM1RCxTQUF1QyxtQ0FBbUM7QUFFMUUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdCQUE2QztBQUN0RCxTQUFpQixhQUFhO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQW9CLGdCQUFnQjtBQUNwQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVDQUF1QztBQUNoRCxZQUFZLFNBQVM7QUFDckIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQXVCLDJCQUEyQjtBQUNsRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBaUJwQixJQUFNLHlCQUFOLGNBQXFDLFdBQW1FO0FBQUEsRUFrQzlHLFlBQ2tCLFNBQ3FCLHFCQUNLLDBCQUNILGVBQ1QsK0JBQ0UsaUNBQ0ksb0JBQ3BDO0FBQ0QsVUFBTTtBQVJXO0FBQ3FCO0FBQ0s7QUFDSDtBQUdIO0FBbkN0QyxTQUFpQixnQkFBaUMsSUFBSSxnQkFBZ0I7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
