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
import { $, getWindow, n } from "../../../../../../../base/browser/dom.js";
import { Color } from "../../../../../../../base/common/color.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived, derivedObservableWithCache, observableFromEvent } from "../../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { IUserInteractionService } from "../../../../../../../platform/userInteraction/browser/userInteractionService.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { EmbeddedCodeEditorWidget } from "../../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { Position } from "../../../../../../common/core/position.js";
import { Range } from "../../../../../../common/core/range.js";
import { StickyScrollController } from "../../../../../stickyScroll/browser/stickyScrollController.js";
import { InlineCompletionContextKeys } from "../../../controller/inlineCompletionContextKeys.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { getEditorBackgroundColor, getEditorBlendedColor, getModifiedBorderColor, getOriginalBorderColor, INLINE_EDITS_BORDER_RADIUS, modifiedBackgroundColor, originalBackgroundColor } from "../theme.js";
import { PathBuilder, getContentRenderWidth, getOffsetForPos, mapOutFalsy, maxContentWidthInRange, observeEditorBoundingClientRect } from "../utils/utils.js";
import { InlineCompletionEditorType } from "../../../model/provideInlineCompletions.js";
const HORIZONTAL_PADDING = 0;
const VERTICAL_PADDING = 0;
const ENABLE_OVERFLOW = false;
const BORDER_WIDTH = 1;
const WIDGET_SEPARATOR_WIDTH = 1;
const WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH = 3;
const BORDER_RADIUS = INLINE_EDITS_BORDER_RADIUS;
const ORIGINAL_END_PADDING = 20;
const MODIFIED_END_PADDING = 12;
let InlineEditsSideBySideView = class extends Disposable {
  constructor(_editor, _edit, _previewTextModel, _uiState, _tabAction, _instantiationService, _themeService, _userInteractionService) {
    super();
    this._editor = _editor;
    this._edit = _edit;
    this._previewTextModel = _previewTextModel;
    this._uiState = _uiState;
    this._tabAction = _tabAction;
    this._instantiationService = _instantiationService;
    this._themeService = _themeService;
    this._userInteractionService = _userInteractionService;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._editorObs = observableCodeEditor(this._editor);
    this._display = derived(this, (reader) => !!this._uiState.read(reader) ? "block" : "none");
    this.previewRef = n.ref();
    const separatorWidthObs = this._uiState.map((s) => s?.editorType === InlineCompletionEditorType.DiffEditor ? WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH : WIDGET_SEPARATOR_WIDTH);
    this._editorContainer = n.div({
      class: ["editorContainer"],
      style: { position: "absolute", overflow: "hidden", cursor: "pointer" },
      onmousedown: (e) => {
        e.preventDefault();
      },
      onclick: (e) => {
        this._onDidClick.fire(InlineEditClickEvent.create(e));
      }
    }, [
      n.div({ class: "preview", style: { pointerEvents: "none" }, ref: this.previewRef })
    ]).keepUpdated(this._store);
    this.isHovered = this._userInteractionService.createHoverTracker(this._editorContainer.element, this._store);
    this.previewEditor = this._register(this._instantiationService.createInstance(
      EmbeddedCodeEditorWidget,
      this.previewRef.element,
      {
        glyphMargin: false,
        lineNumbers: "off",
        minimap: { enabled: false },
        guides: {
          indentation: false,
          bracketPairs: false,
          bracketPairsHorizontal: false,
          highlightActiveIndentation: false
        },
        editContext: false,
        // is a bit faster
        rulers: [],
        padding: { top: 0, bottom: 0 },
        folding: false,
        selectOnLineNumbers: false,
        selectionHighlight: false,
        columnSelection: false,
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        revealHorizontalRightPadding: 0,
        bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false },
        scrollBeyondLastLine: false,
        scrollbar: {
          vertical: "hidden",
          horizontal: "hidden",
          handleMouseWheel: false
        },
        readOnly: true,
        wordWrap: "off",
        wordWrapOverride1: "off",
        wordWrapOverride2: "off"
      },
      {
        contextKeyValues: {
          [InlineCompletionContextKeys.inInlineEditsPreviewEditor.key]: true
        },
        contributions: []
      },
      this._editor
    ));
    this._previewEditorObs = observableCodeEditor(this.previewEditor);
    this._activeViewZones = [];
    this._updatePreviewEditor = derived(this, (reader) => {
      this._editorContainer.readEffect(reader);
      this._previewEditorObs.model.read(reader);
      this._display.read(reader);
      if (this._nonOverflowView) {
        this._nonOverflowView.element.style.display = this._display.read(reader);
      }
      const uiState = this._uiState.read(reader);
      const edit = this._edit.read(reader);
      if (!uiState || !edit) {
        return;
      }
      const range = edit.originalLineRange;
      const hiddenAreas = [];
      if (range.startLineNumber > 1) {
        hiddenAreas.push(new Range(1, 1, range.startLineNumber - 1, 1));
      }
      if (range.startLineNumber + uiState.newTextLineCount < this._previewTextModel.getLineCount() + 1) {
        hiddenAreas.push(new Range(range.startLineNumber + uiState.newTextLineCount, 1, this._previewTextModel.getLineCount() + 1, 1));
      }
      this.previewEditor.setHiddenAreas(hiddenAreas, void 0, true);
      const previousViewZones = [...this._activeViewZones];
      this._activeViewZones = [];
      const reducedLinesCount = range.endLineNumberExclusive - range.startLineNumber - uiState.newTextLineCount;
      this.previewEditor.changeViewZones((changeAccessor) => {
        previousViewZones.forEach((id) => changeAccessor.removeZone(id));
        if (reducedLinesCount > 0) {
          this._activeViewZones.push(changeAccessor.addZone({
            afterLineNumber: range.startLineNumber + uiState.newTextLineCount - 1,
            heightInLines: reducedLinesCount,
            showInHiddenAreas: true,
            domNode: $("div.diagonal-fill.inline-edits-view-zone")
          }));
        }
      });
    });
    this._previewEditorWidth = derived(this, (reader) => {
      const edit = this._edit.read(reader);
      if (!edit) {
        return 0;
      }
      this._updatePreviewEditor.read(reader);
      return maxContentWidthInRange(this._previewEditorObs, edit.modifiedLineRange, reader);
    });
    this._cursorPosIfTouchesEdit = derived(this, (reader) => {
      const cursorPos = this._editorObs.cursorPosition.read(reader);
      const edit = this._edit.read(reader);
      if (!edit || !cursorPos) {
        return void 0;
      }
      return edit.modifiedLineRange.contains(cursorPos.lineNumber) ? cursorPos : void 0;
    });
    this._originalStartPosition = derived(this, (reader) => {
      const inlineEdit = this._edit.read(reader);
      return inlineEdit ? new Position(inlineEdit.originalLineRange.startLineNumber, 1) : null;
    });
    this._originalEndPosition = derived(this, (reader) => {
      const inlineEdit = this._edit.read(reader);
      return inlineEdit ? new Position(inlineEdit.originalLineRange.endLineNumberExclusive, 1) : null;
    });
    this._originalVerticalStartPosition = this._editorObs.observePosition(this._originalStartPosition, this._store).map((p) => p?.y);
    this._originalVerticalEndPosition = this._editorObs.observePosition(this._originalEndPosition, this._store).map((p) => p?.y);
    this._originalDisplayRange = this._edit.map((e) => e?.displayRange);
    this._editorMaxContentWidthInRange = derived(this, (reader) => {
      const originalDisplayRange = this._originalDisplayRange.read(reader);
      if (!originalDisplayRange) {
        return constObservable(0);
      }
      this._editorObs.versionId.read(reader);
      return derivedObservableWithCache(this, (reader2, lastValue) => {
        const maxWidth = maxContentWidthInRange(this._editorObs, originalDisplayRange, reader2);
        return Math.max(maxWidth, lastValue ?? 0);
      });
    }).map((v, r) => v.read(r));
    const editorDomContentRect = observeEditorBoundingClientRect(this._editor, this._store);
    this._previewEditorLayoutInfo = derived(this, (reader) => {
      const inlineEdit = this._edit.read(reader);
      if (!inlineEdit) {
        return null;
      }
      const state = this._uiState.read(reader);
      if (!state) {
        return null;
      }
      const range = inlineEdit.originalLineRange;
      const horizontalScrollOffset = this._editorObs.scrollLeft.read(reader);
      const editorContentMaxWidthInRange = this._editorMaxContentWidthInRange.read(reader);
      const editorLayout = this._editorObs.layoutInfo.read(reader);
      const previewContentWidth = this._previewEditorWidth.read(reader);
      const editorContentAreaWidth = editorLayout.contentWidth - editorLayout.verticalScrollbarWidth;
      const editorBoundingClientRect = editorDomContentRect.read(reader);
      const clientContentAreaRight = editorLayout.contentLeft + editorLayout.contentWidth + editorBoundingClientRect.left;
      const remainingWidthRightOfContent = getWindow(this._editor.getContainerDomNode()).innerWidth - clientContentAreaRight;
      const remainingWidthRightOfEditor = getWindow(this._editor.getContainerDomNode()).innerWidth - editorBoundingClientRect.right;
      const desiredMinimumWidth = Math.min(editorLayout.contentWidth * 0.3, previewContentWidth, 100);
      const IN_EDITOR_DISPLACEMENT = 0;
      const maximumAvailableWidth = IN_EDITOR_DISPLACEMENT + remainingWidthRightOfContent;
      const cursorPos = this._cursorPosIfTouchesEdit.read(reader);
      const maxPreviewEditorLeft = Math.max(
        // We're starting from the content area right and moving it left by IN_EDITOR_DISPLACEMENT and also by an amount to ensure some minimum desired width
        editorContentAreaWidth + horizontalScrollOffset - IN_EDITOR_DISPLACEMENT - Math.max(0, desiredMinimumWidth - maximumAvailableWidth),
        // But we don't want that the moving left ends up covering the cursor, so this will push it to the right again
        Math.min(
          cursorPos ? getOffsetForPos(this._editorObs, cursorPos, reader) + 50 : 0,
          editorContentAreaWidth + horizontalScrollOffset
        )
      );
      const previewEditorLeftInTextArea = Math.min(editorContentMaxWidthInRange + ORIGINAL_END_PADDING, maxPreviewEditorLeft);
      const maxContentWidth = editorContentMaxWidthInRange + ORIGINAL_END_PADDING + previewContentWidth + 70;
      const dist = maxPreviewEditorLeft - previewEditorLeftInTextArea;
      let desiredPreviewEditorScrollLeft;
      let codeRight;
      if (previewEditorLeftInTextArea > horizontalScrollOffset) {
        desiredPreviewEditorScrollLeft = 0;
        codeRight = editorLayout.contentLeft + previewEditorLeftInTextArea - horizontalScrollOffset;
      } else {
        desiredPreviewEditorScrollLeft = horizontalScrollOffset - previewEditorLeftInTextArea;
        codeRight = editorLayout.contentLeft;
      }
      const selectionTop = this._originalVerticalStartPosition.read(reader) ?? this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
      const selectionBottom = this._originalVerticalEndPosition.read(reader) ?? this._editor.getBottomForLineNumber(range.endLineNumberExclusive - 1) - this._editorObs.scrollTop.read(reader);
      const codeLeft = editorLayout.contentLeft - horizontalScrollOffset;
      let codeRect = Rect.fromLeftTopRightBottom(codeLeft, selectionTop, codeRight, selectionBottom);
      const isInsertion = codeRect.height === 0;
      if (!isInsertion) {
        codeRect = codeRect.withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING);
      }
      const previewLineHeights = this._previewEditorObs.observeLineHeightsForLineRange(inlineEdit.modifiedLineRange).read(reader);
      const editHeight = previewLineHeights.reduce((acc, h) => acc + h, 0);
      const codeHeight = selectionBottom - selectionTop;
      const previewEditorHeight = Math.max(codeHeight, editHeight);
      const clipped = dist === 0;
      const codeEditDist = 0;
      const previewEditorWidth = Math.min(previewContentWidth + MODIFIED_END_PADDING, remainingWidthRightOfEditor + editorLayout.width - editorLayout.contentLeft - codeEditDist);
      let editRect = Rect.fromLeftTopWidthHeight(codeRect.right + codeEditDist, selectionTop, previewEditorWidth, previewEditorHeight);
      if (!isInsertion) {
        editRect = editRect.withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING).translateX(HORIZONTAL_PADDING + BORDER_WIDTH);
      } else {
        editRect = editRect.withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING).translateY(VERTICAL_PADDING);
      }
      return {
        codeRect,
        editRect,
        codeScrollLeft: horizontalScrollOffset,
        contentLeft: editorLayout.contentLeft,
        isInsertion,
        maxContentWidth,
        shouldShowShadow: clipped,
        desiredPreviewEditorScrollLeft,
        previewEditorWidth
      };
    });
    this._stickyScrollController = StickyScrollController.get(this._editorObs.editor);
    this._stickyScrollHeight = this._stickyScrollController ? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController.stickyScrollWidgetHeight) : constObservable(0);
    this._shouldOverflow = derived(this, (reader) => {
      if (!ENABLE_OVERFLOW) {
        return false;
      }
      const range = this._edit.read(reader)?.originalLineRange;
      if (!range) {
        return false;
      }
      const stickyScrollHeight = this._stickyScrollHeight.read(reader);
      const top = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
      if (top <= stickyScrollHeight) {
        return false;
      }
      const bottom = this._editor.getTopForLineNumber(range.endLineNumberExclusive) - this._editorObs.scrollTop.read(reader);
      if (bottom >= this._editorObs.layoutInfo.read(reader).height) {
        return false;
      }
      return true;
    });
    this._originalBackgroundColor = observableFromEvent(this, this._themeService.onDidColorThemeChange, () => {
      return this._themeService.getColorTheme().getColor(originalBackgroundColor) ?? Color.transparent;
    });
    this._editorBackgroundColor = this._uiState.map((s) => {
      return getEditorBackgroundColor(s?.editorType ?? InlineCompletionEditorType.TextEditor);
    });
    this._backgroundSvg = n.svg({
      transform: "translate(-0.5 -0.5)",
      style: { overflow: "visible", pointerEvents: "none", position: "absolute" }
    }, [
      n.svgElem("path", {
        class: "rightOfModifiedBackgroundCoverUp",
        d: derived(this, (reader) => {
          const layoutInfo = this._previewEditorLayoutInfo.read(reader);
          if (!layoutInfo) {
            return void 0;
          }
          const originalBackgroundColor2 = this._originalBackgroundColor.read(reader);
          if (originalBackgroundColor2.isTransparent()) {
            return void 0;
          }
          return new PathBuilder().moveTo(layoutInfo.codeRect.getRightTop()).lineTo(layoutInfo.codeRect.getRightTop().deltaX(1e3)).lineTo(layoutInfo.codeRect.getRightBottom().deltaX(1e3)).lineTo(layoutInfo.codeRect.getRightBottom()).build();
        }),
        style: {
          fill: this._editorBackgroundColor
        }
      })
    ]).keepUpdated(this._store);
    this._originalOverlay = n.div({
      style: { pointerEvents: "none", display: this._previewEditorLayoutInfo.map((layoutInfo) => layoutInfo?.isInsertion ? "none" : "block") }
    }, derived(this, (reader) => {
      const layoutInfoObs = mapOutFalsy(this._previewEditorLayoutInfo).read(reader);
      if (!layoutInfoObs) {
        return void 0;
      }
      const editorBackground = this._editorBackgroundColor.read(reader);
      const separatorWidth = separatorWidthObs.read(reader);
      const borderStyling = getOriginalBorderColor(this._tabAction).map((bc) => `${BORDER_WIDTH}px solid ${asCssVariable(bc)}`);
      const borderStylingSeparator = `${BORDER_WIDTH + separatorWidth}px solid ${editorBackground}`;
      const hasBorderLeft = layoutInfoObs.read(reader).codeScrollLeft !== 0;
      const isModifiedLower = layoutInfoObs.map((layoutInfo) => layoutInfo.codeRect.bottom < layoutInfo.editRect.bottom);
      const transitionRectSize = BORDER_RADIUS * 2 + BORDER_WIDTH * 2;
      const overlayHider = layoutInfoObs.map((layoutInfo) => Rect.fromLeftTopRightBottom(
        layoutInfo.contentLeft - BORDER_RADIUS - BORDER_WIDTH,
        layoutInfo.codeRect.top,
        layoutInfo.contentLeft,
        layoutInfo.codeRect.bottom + transitionRectSize
      )).read(reader);
      const intersectionLine = new OffsetRange(overlayHider.left, Number.MAX_SAFE_INTEGER);
      const overlayRect = layoutInfoObs.map((layoutInfo) => layoutInfo.codeRect.intersectHorizontal(intersectionLine));
      const separatorRect = overlayRect.map((overlayRect2) => overlayRect2.withMargin(separatorWidth, 0, separatorWidth, separatorWidth).intersectHorizontal(intersectionLine));
      const transitionRect = overlayRect.map((overlayRect2) => Rect.fromLeftTopWidthHeight(overlayRect2.right - transitionRectSize + BORDER_WIDTH, overlayRect2.bottom - BORDER_WIDTH, transitionRectSize, transitionRectSize).intersectHorizontal(intersectionLine));
      return [
        n.div({
          class: "originalSeparatorSideBySide",
          style: {
            ...separatorRect.read(reader).toStyles(),
            boxSizing: "border-box",
            borderRadius: `${BORDER_RADIUS}px 0 0 ${BORDER_RADIUS}px`,
            borderTop: borderStylingSeparator,
            borderBottom: borderStylingSeparator,
            borderLeft: hasBorderLeft ? "none" : borderStylingSeparator
          }
        }),
        n.div({
          class: "originalOverlaySideBySide",
          style: {
            ...overlayRect.read(reader).toStyles(),
            boxSizing: "border-box",
            borderRadius: `${BORDER_RADIUS}px 0 0 ${BORDER_RADIUS}px`,
            borderTop: borderStyling,
            borderBottom: borderStyling,
            borderLeft: hasBorderLeft ? "none" : borderStyling,
            backgroundColor: asCssVariable(originalBackgroundColor)
          }
        }),
        n.div({
          class: "originalCornerCutoutSideBySide",
          style: {
            pointerEvents: "none",
            display: isModifiedLower.map((isLower) => isLower ? "block" : "none"),
            ...transitionRect.read(reader).toStyles()
          }
        }, [
          n.div({
            class: "originalCornerCutoutBackground",
            style: {
              position: "absolute",
              top: "0px",
              left: "0px",
              width: "100%",
              height: "100%",
              backgroundColor: getEditorBlendedColor(originalBackgroundColor, this._themeService).map((c) => c.toString())
            }
          }),
          n.div({
            class: "originalCornerCutoutBorder",
            style: {
              position: "absolute",
              top: "0px",
              left: "0px",
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              borderTop: borderStyling,
              borderRight: borderStyling,
              borderRadius: `0 100% 0 0`,
              backgroundColor: editorBackground
            }
          })
        ]),
        n.div({
          class: "originalOverlaySideBySideHider",
          style: {
            ...overlayHider.toStyles(),
            backgroundColor: editorBackground
          }
        })
      ];
    })).keepUpdated(this._store);
    this._modifiedOverlay = n.div({
      style: { pointerEvents: "none" }
    }, derived(this, (reader) => {
      const layoutInfoObs = mapOutFalsy(this._previewEditorLayoutInfo).read(reader);
      if (!layoutInfoObs) {
        return void 0;
      }
      const isModifiedLower = layoutInfoObs.map((layoutInfo) => layoutInfo.codeRect.bottom < layoutInfo.editRect.bottom);
      const editorBackground = this._editorBackgroundColor.read(reader);
      const separatorWidth = separatorWidthObs.read(reader);
      const borderRadius = isModifiedLower.map((isLower) => `0 ${BORDER_RADIUS}px ${BORDER_RADIUS}px ${isLower ? BORDER_RADIUS : 0}px`);
      const borderStyling = getEditorBlendedColor(getModifiedBorderColor(this._tabAction), this._themeService).map((c) => `1px solid ${c.toString()}`);
      const borderStylingSeparator = `${BORDER_WIDTH + separatorWidth}px solid ${editorBackground}`;
      const overlayRect = layoutInfoObs.map((layoutInfo) => layoutInfo.editRect.withMargin(0, BORDER_WIDTH));
      const separatorRect = overlayRect.map((overlayRect2) => overlayRect2.withMargin(separatorWidth, separatorWidth, separatorWidth, 0));
      const insertionRect = derived(this, (reader2) => {
        const overlay = overlayRect.read(reader2);
        const layoutinfo = layoutInfoObs.read(reader2);
        if (!layoutinfo.isInsertion || layoutinfo.contentLeft >= overlay.left) {
          return Rect.fromLeftTopWidthHeight(overlay.left, overlay.top, 0, 0);
        }
        return new Rect(layoutinfo.contentLeft, overlay.top, overlay.left, overlay.top + BORDER_WIDTH * 2);
      });
      return [
        n.div({
          class: "modifiedInsertionSideBySide",
          style: {
            ...insertionRect.read(reader).toStyles(),
            backgroundColor: getModifiedBorderColor(this._tabAction).map((c) => asCssVariable(c))
          }
        }),
        n.div({
          class: "modifiedSeparatorSideBySide",
          style: {
            ...separatorRect.read(reader).toStyles(),
            borderRadius,
            borderTop: borderStylingSeparator,
            borderBottom: borderStylingSeparator,
            borderRight: borderStylingSeparator,
            boxSizing: "border-box"
          }
        }),
        n.div({
          class: "modifiedOverlaySideBySide",
          style: {
            ...overlayRect.read(reader).toStyles(),
            borderRadius,
            border: borderStyling,
            boxSizing: "border-box",
            backgroundColor: asCssVariable(modifiedBackgroundColor)
          }
        })
      ];
    })).keepUpdated(this._store);
    this._nonOverflowView = n.div({
      class: "inline-edits-view",
      style: {
        position: "absolute",
        overflow: "visible",
        top: "0px",
        left: "0px",
        display: this._display
      }
    }, [
      this._backgroundSvg,
      derived(this, (reader) => this._shouldOverflow.read(reader) ? [] : [this._editorContainer, this._originalOverlay, this._modifiedOverlay])
    ]).keepUpdated(this._store);
    this._register(this._editorObs.createOverlayWidget({
      domNode: this._nonOverflowView.element,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: derived(this, (reader) => {
        const x = this._previewEditorLayoutInfo.read(reader)?.maxContentWidth;
        if (x === void 0) {
          return 0;
        }
        return x;
      })
    }));
    this.previewEditor.setModel(this._previewTextModel);
    this._register(autorun((reader) => {
      const layoutInfo = this._previewEditorLayoutInfo.read(reader);
      if (!layoutInfo) {
        return;
      }
      const editorRect = layoutInfo.editRect.withMargin(-VERTICAL_PADDING, -HORIZONTAL_PADDING);
      this.previewEditor.layout({
        height: editorRect.height,
        width: layoutInfo.previewEditorWidth + 15
        /* Make sure editor does not scroll horizontally */
      });
      this._editorContainer.element.style.top = `${editorRect.top}px`;
      this._editorContainer.element.style.left = `${editorRect.left}px`;
      this._editorContainer.element.style.width = `${layoutInfo.previewEditorWidth + HORIZONTAL_PADDING}px`;
    }));
    this._register(autorun((reader) => {
      const layoutInfo = this._previewEditorLayoutInfo.read(reader);
      if (!layoutInfo) {
        return;
      }
      this._previewEditorObs.editor.setScrollLeft(layoutInfo.desiredPreviewEditorScrollLeft);
    }));
    this._updatePreviewEditor.recomputeInitiallyAndOnChange(this._store);
  }
  // This is an approximation and should be improved by using the real parameters used bellow
  static fitsInsideViewport(editor, textModel, edit, reader) {
    const editorObs = observableCodeEditor(editor);
    const editorWidth = editorObs.layoutInfoWidth.read(reader);
    const editorContentLeft = editorObs.layoutInfoContentLeft.read(reader);
    const editorVerticalScrollbar = editor.getLayoutInfo().verticalScrollbarWidth;
    const minimapWidth = editorObs.layoutInfoMinimap.read(reader).minimapLeft !== 0 ? editorObs.layoutInfoMinimap.read(reader).minimapWidth : 0;
    const maxOriginalContent = maxContentWidthInRange(
      editorObs,
      edit.displayRange,
      void 0
      /* do not reconsider on each layout info change */
    );
    const maxModifiedContent = edit.lineEdit.newLines.reduce((max, line) => Math.max(max, getContentRenderWidth(line, editor, textModel)), 0);
    const originalPadding = ORIGINAL_END_PADDING;
    const modifiedPadding = MODIFIED_END_PADDING + 2 * BORDER_WIDTH;
    return maxOriginalContent + maxModifiedContent + originalPadding + modifiedPadding < editorWidth - editorContentLeft - editorVerticalScrollbar - minimapWidth;
  }
};
InlineEditsSideBySideView = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IUserInteractionService)
], InlineEditsSideBySideView);
export {
  InlineEditsSideBySideView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcaW5saW5lRWRpdHNTaWRlQnlTaWRlVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyAkLCBnZXRXaW5kb3csIG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIElSZWFkZXIsIGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckludGVyYWN0aW9uL2Jyb3dzZXIvdXNlckludGVyYWN0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3JlY3QuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgU3RpY2t5U2Nyb2xsQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3N0aWNreVNjcm9sbC9icm93c2VyL3N0aWNreVNjcm9sbENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUlubGluZUVkaXRzVmlldywgSW5saW5lRWRpdENsaWNrRXZlbnQsIElubGluZUVkaXRUYWJBY3Rpb24gfSBmcm9tICcuLi9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdFdpdGhDaGFuZ2VzIH0gZnJvbSAnLi4vaW5saW5lRWRpdFdpdGhDaGFuZ2VzLmpzJztcbmltcG9ydCB7IGdldEVkaXRvckJhY2tncm91bmRDb2xvciwgZ2V0RWRpdG9yQmxlbmRlZENvbG9yLCBnZXRNb2RpZmllZEJvcmRlckNvbG9yLCBnZXRPcmlnaW5hbEJvcmRlckNvbG9yLCBJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVUywgbW9kaWZpZWRCYWNrZ3JvdW5kQ29sb3IsIG9yaWdpbmFsQmFja2dyb3VuZENvbG9yIH0gZnJvbSAnLi4vdGhlbWUuanMnO1xuaW1wb3J0IHsgUGF0aEJ1aWxkZXIsIGdldENvbnRlbnRSZW5kZXJXaWR0aCwgZ2V0T2Zmc2V0Rm9yUG9zLCBtYXBPdXRGYWxzeSwgbWF4Q29udGVudFdpZHRoSW5SYW5nZSwgb2JzZXJ2ZUVkaXRvckJvdW5kaW5nQ2xpZW50UmVjdCB9IGZyb20gJy4uL3V0aWxzL3V0aWxzLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlIH0gZnJvbSAnLi4vLi4vLi4vbW9kZWwvcHJvdmlkZUlubGluZUNvbXBsZXRpb25zLmpzJztcblxuY29uc3QgSE9SSVpPTlRBTF9QQURESU5HID0gMDtcbmNvbnN0IFZFUlRJQ0FMX1BBRERJTkcgPSAwO1xuY29uc3QgRU5BQkxFX09WRVJGTE9XID0gZmFsc2U7XG5cbmNvbnN0IEJPUkRFUl9XSURUSCA9IDE7XG5jb25zdCBXSURHRVRfU0VQQVJBVE9SX1dJRFRIID0gMTtcbmNvbnN0IFdJREdFVF9TRVBBUkFUT1JfRElGRl9FRElUT1JfV0lEVEggPSAzO1xuY29uc3QgQk9SREVSX1JBRElVUyA9IElOTElORV9FRElUU19CT1JERVJfUkFESVVTO1xuY29uc3QgT1JJR0lOQUxfRU5EX1BBRERJTkcgPSAyMDtcbmNvbnN0IE1PRElGSUVEX0VORF9QQURESU5HID0gMTI7XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVFZGl0c1NpZGVCeVNpZGVWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElJbmxpbmVFZGl0c1ZpZXcge1xuXG5cdC8vIFRoaXMgaXMgYW4gYXBwcm94aW1hdGlvbiBhbmQgc2hvdWxkIGJlIGltcHJvdmVkIGJ5IHVzaW5nIHRoZSByZWFsIHBhcmFtZXRlcnMgdXNlZCBiZWxsb3dcblx0c3RhdGljIGZpdHNJbnNpZGVWaWV3cG9ydChlZGl0b3I6IElDb2RlRWRpdG9yLCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIGVkaXQ6IElubGluZUVkaXRXaXRoQ2hhbmdlcywgcmVhZGVyOiBJUmVhZGVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IoZWRpdG9yKTtcblx0XHRjb25zdCBlZGl0b3JXaWR0aCA9IGVkaXRvck9icy5sYXlvdXRJbmZvV2lkdGgucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRlbnRMZWZ0ID0gZWRpdG9yT2JzLmxheW91dEluZm9Db250ZW50TGVmdC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZWRpdG9yVmVydGljYWxTY3JvbGxiYXIgPSBlZGl0b3IuZ2V0TGF5b3V0SW5mbygpLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg7XG5cdFx0Y29uc3QgbWluaW1hcFdpZHRoID0gZWRpdG9yT2JzLmxheW91dEluZm9NaW5pbWFwLnJlYWQocmVhZGVyKS5taW5pbWFwTGVmdCAhPT0gMCA/IGVkaXRvck9icy5sYXlvdXRJbmZvTWluaW1hcC5yZWFkKHJlYWRlcikubWluaW1hcFdpZHRoIDogMDtcblxuXHRcdGNvbnN0IG1heE9yaWdpbmFsQ29udGVudCA9IG1heENvbnRlbnRXaWR0aEluUmFuZ2UoZWRpdG9yT2JzLCBlZGl0LmRpc3BsYXlSYW5nZSwgdW5kZWZpbmVkLyogZG8gbm90IHJlY29uc2lkZXIgb24gZWFjaCBsYXlvdXQgaW5mbyBjaGFuZ2UgKi8pO1xuXHRcdGNvbnN0IG1heE1vZGlmaWVkQ29udGVudCA9IGVkaXQubGluZUVkaXQubmV3TGluZXMucmVkdWNlKChtYXgsIGxpbmUpID0+IE1hdGgubWF4KG1heCwgZ2V0Q29udGVudFJlbmRlcldpZHRoKGxpbmUsIGVkaXRvciwgdGV4dE1vZGVsKSksIDApO1xuXHRcdGNvbnN0IG9yaWdpbmFsUGFkZGluZyA9IE9SSUdJTkFMX0VORF9QQURESU5HOyAvLyBwYWRkaW5nIGFmdGVyIGxhc3QgbGluZSBvZiBvcmlnaW5hbCBlZGl0b3Jcblx0XHRjb25zdCBtb2RpZmllZFBhZGRpbmcgPSBNT0RJRklFRF9FTkRfUEFERElORyArIDIgKiBCT1JERVJfV0lEVEg7IC8vIHBhZGRpbmcgYWZ0ZXIgbGFzdCBsaW5lIG9mIG1vZGlmaWVkIGVkaXRvclxuXG5cdFx0cmV0dXJuIG1heE9yaWdpbmFsQ29udGVudCArIG1heE1vZGlmaWVkQ29udGVudCArIG9yaWdpbmFsUGFkZGluZyArIG1vZGlmaWVkUGFkZGluZyA8IGVkaXRvcldpZHRoIC0gZWRpdG9yQ29udGVudExlZnQgLSBlZGl0b3JWZXJ0aWNhbFNjcm9sbGJhciAtIG1pbmltYXBXaWR0aDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvck9icztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5saW5lRWRpdENsaWNrRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrID0gdGhpcy5fb25EaWRDbGljay5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXQ6IElPYnNlcnZhYmxlPElubGluZUVkaXRXaXRoQ2hhbmdlcyB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlld1RleHRNb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91aVN0YXRlOiBJT2JzZXJ2YWJsZTx7XG5cdFx0XHRuZXdUZXh0TGluZUNvdW50OiBudW1iZXI7XG5cdFx0XHRlZGl0b3JUeXBlOiBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZTtcblx0XHR9IHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YWJBY3Rpb246IElPYnNlcnZhYmxlPElubGluZUVkaXRUYWJBY3Rpb24+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VzZXJJbnRlcmFjdGlvblNlcnZpY2U6IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2VkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX2VkaXRvcik7XG5cdFx0dGhpcy5fZGlzcGxheSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+ICEhdGhpcy5fdWlTdGF0ZS5yZWFkKHJlYWRlcikgPyAnYmxvY2snIDogJ25vbmUnKTtcblx0XHR0aGlzLnByZXZpZXdSZWYgPSBuLnJlZjxIVE1MRGl2RWxlbWVudD4oKTtcblx0XHRjb25zdCBzZXBhcmF0b3JXaWR0aE9icyA9IHRoaXMuX3VpU3RhdGUubWFwKHMgPT4gcz8uZWRpdG9yVHlwZSA9PT0gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuRGlmZkVkaXRvciA/IFdJREdFVF9TRVBBUkFUT1JfRElGRl9FRElUT1JfV0lEVEggOiBXSURHRVRfU0VQQVJBVE9SX1dJRFRIKTtcblx0XHR0aGlzLl9lZGl0b3JDb250YWluZXIgPSBuLmRpdih7XG5cdFx0XHRjbGFzczogWydlZGl0b3JDb250YWluZXInXSxcblx0XHRcdHN0eWxlOiB7IHBvc2l0aW9uOiAnYWJzb2x1dGUnLCBvdmVyZmxvdzogJ2hpZGRlbicsIGN1cnNvcjogJ3BvaW50ZXInIH0sXG5cdFx0XHRvbm1vdXNlZG93bjogZSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTsgLy8gVGhpcyBwcmV2ZW50cyB0aGF0IHRoZSBlZGl0b3IgbG9zZXMgZm9jdXNcblx0XHRcdH0sXG5cdFx0XHRvbmNsaWNrOiAoZSkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUoSW5saW5lRWRpdENsaWNrRXZlbnQuY3JlYXRlKGUpKTtcblx0XHRcdH1cblx0XHR9LCBbXG5cdFx0XHRuLmRpdih7IGNsYXNzOiAncHJldmlldycsIHN0eWxlOiB7IHBvaW50ZXJFdmVudHM6ICdub25lJyB9LCByZWY6IHRoaXMucHJldmlld1JlZiB9KSxcblx0XHRdKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5pc0hvdmVyZWQgPSB0aGlzLl91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLmNyZWF0ZUhvdmVyVHJhY2tlcih0aGlzLl9lZGl0b3JDb250YWluZXIuZWxlbWVudCwgdGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMucHJldmlld0VkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0RW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdFx0dGhpcy5wcmV2aWV3UmVmLmVsZW1lbnQsXG5cdFx0XHR7XG5cdFx0XHRcdGdseXBoTWFyZ2luOiBmYWxzZSxcblx0XHRcdFx0bGluZU51bWJlcnM6ICdvZmYnLFxuXHRcdFx0XHRtaW5pbWFwOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdGd1aWRlczoge1xuXHRcdFx0XHRcdGluZGVudGF0aW9uOiBmYWxzZSxcblx0XHRcdFx0XHRicmFja2V0UGFpcnM6IGZhbHNlLFxuXHRcdFx0XHRcdGJyYWNrZXRQYWlyc0hvcml6b250YWw6IGZhbHNlLFxuXHRcdFx0XHRcdGhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZWRpdENvbnRleHQ6IGZhbHNlLCAvLyBpcyBhIGJpdCBmYXN0ZXJcblx0XHRcdFx0cnVsZXJzOiBbXSxcblx0XHRcdFx0cGFkZGluZzogeyB0b3A6IDAsIGJvdHRvbTogMCB9LFxuXHRcdFx0XHRmb2xkaW5nOiBmYWxzZSxcblx0XHRcdFx0c2VsZWN0T25MaW5lTnVtYmVyczogZmFsc2UsXG5cdFx0XHRcdHNlbGVjdGlvbkhpZ2hsaWdodDogZmFsc2UsXG5cdFx0XHRcdGNvbHVtblNlbGVjdGlvbjogZmFsc2UsXG5cdFx0XHRcdG92ZXJ2aWV3UnVsZXJCb3JkZXI6IGZhbHNlLFxuXHRcdFx0XHRvdmVydmlld1J1bGVyTGFuZXM6IDAsXG5cdFx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiAwLFxuXHRcdFx0XHRsaW5lTnVtYmVyc01pbkNoYXJzOiAwLFxuXHRcdFx0XHRyZXZlYWxIb3Jpem9udGFsUmlnaHRQYWRkaW5nOiAwLFxuXHRcdFx0XHRicmFja2V0UGFpckNvbG9yaXphdGlvbjogeyBlbmFibGVkOiB0cnVlLCBpbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlOiBmYWxzZSB9LFxuXHRcdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRcdHNjcm9sbGJhcjoge1xuXHRcdFx0XHRcdHZlcnRpY2FsOiAnaGlkZGVuJyxcblx0XHRcdFx0XHRob3Jpem9udGFsOiAnaGlkZGVuJyxcblx0XHRcdFx0XHRoYW5kbGVNb3VzZVdoZWVsOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVhZE9ubHk6IHRydWUsXG5cdFx0XHRcdHdvcmRXcmFwOiAnb2ZmJyxcblx0XHRcdFx0d29yZFdyYXBPdmVycmlkZTE6ICdvZmYnLFxuXHRcdFx0XHR3b3JkV3JhcE92ZXJyaWRlMjogJ29mZicsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRjb250ZXh0S2V5VmFsdWVzOiB7XG5cdFx0XHRcdFx0W0lubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5pbklubGluZUVkaXRzUHJldmlld0VkaXRvci5rZXldOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb250cmlidXRpb25zOiBbXSxcblx0XHRcdH0sXG5cdFx0XHR0aGlzLl9lZGl0b3Jcblx0XHQpKTtcblx0XHR0aGlzLl9wcmV2aWV3RWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5wcmV2aWV3RWRpdG9yKTtcblx0XHR0aGlzLl9hY3RpdmVWaWV3Wm9uZXMgPSBbXTtcblx0XHR0aGlzLl91cGRhdGVQcmV2aWV3RWRpdG9yID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fZWRpdG9yQ29udGFpbmVyLnJlYWRFZmZlY3QocmVhZGVyKTtcblx0XHRcdHRoaXMuX3ByZXZpZXdFZGl0b3JPYnMubW9kZWwucmVhZChyZWFkZXIpOyAvLyB1cGRhdGUgd2hlbiB0aGUgbW9kZWwgaXMgc2V0XG5cblx0XHRcdC8vIFNldHRpbmcgdGhpcyBoZXJlIGV4cGxpY2l0bHkgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHByZXZpZXcgZWRpdG9yIGlzXG5cdFx0XHQvLyB2aXNpYmxlIHdoZW4gbmVlZGVkLCB3ZSdyZSBhbHNvIGNoZWNraW5nIHRoYXQgdGhlc2UgZmllbGRzIGFyZSBkZWZpbmVkXG5cdFx0XHQvLyBiZWNhdXNlIG9mIHRoZSBhdXRvIHJ1biBpbml0aWFsXG5cdFx0XHQvLyBCZWZvcmUgcmVtb3ZpbmcgdGhlc2UsIHZlcmlmeSB3aXRoIGEgbm9uLW1vbm9zcGFjZSBmb250IGZhbWlseVxuXHRcdFx0dGhpcy5fZGlzcGxheS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodGhpcy5fbm9uT3ZlcmZsb3dWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX25vbk92ZXJmbG93Vmlldy5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSB0aGlzLl9kaXNwbGF5LnJlYWQocmVhZGVyKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdWlTdGF0ZSA9IHRoaXMuX3VpU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IHRoaXMuX2VkaXQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCF1aVN0YXRlIHx8ICFlZGl0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmFuZ2UgPSBlZGl0Lm9yaWdpbmFsTGluZVJhbmdlO1xuXG5cdFx0XHRjb25zdCBoaWRkZW5BcmVhczogUmFuZ2VbXSA9IFtdO1xuXHRcdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciA+IDEpIHtcblx0XHRcdFx0aGlkZGVuQXJlYXMucHVzaChuZXcgUmFuZ2UoMSwgMSwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSwgMSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciArIHVpU3RhdGUubmV3VGV4dExpbmVDb3VudCA8IHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwuZ2V0TGluZUNvdW50KCkgKyAxKSB7XG5cdFx0XHRcdGhpZGRlbkFyZWFzLnB1c2gobmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciArIHVpU3RhdGUubmV3VGV4dExpbmVDb3VudCwgMSwgdGhpcy5fcHJldmlld1RleHRNb2RlbC5nZXRMaW5lQ291bnQoKSArIDEsIDEpKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5wcmV2aWV3RWRpdG9yLnNldEhpZGRlbkFyZWFzKGhpZGRlbkFyZWFzLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHQvLyBUT0RPOiBpcyB0aGlzIHRoZSBwcm9wZXIgd2F5IHRvIGhhbmRsZSB2aWV3em9uZXM/XG5cdFx0XHRjb25zdCBwcmV2aW91c1ZpZXdab25lcyA9IFsuLi50aGlzLl9hY3RpdmVWaWV3Wm9uZXNdO1xuXHRcdFx0dGhpcy5fYWN0aXZlVmlld1pvbmVzID0gW107XG5cblx0XHRcdGNvbnN0IHJlZHVjZWRMaW5lc0NvdW50ID0gKHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSByYW5nZS5zdGFydExpbmVOdW1iZXIpIC0gdWlTdGF0ZS5uZXdUZXh0TGluZUNvdW50O1xuXHRcdFx0dGhpcy5wcmV2aWV3RWRpdG9yLmNoYW5nZVZpZXdab25lcygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0cHJldmlvdXNWaWV3Wm9uZXMuZm9yRWFjaChpZCA9PiBjaGFuZ2VBY2Nlc3Nvci5yZW1vdmVab25lKGlkKSk7XG5cblx0XHRcdFx0aWYgKHJlZHVjZWRMaW5lc0NvdW50ID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVZpZXdab25lcy5wdXNoKGNoYW5nZUFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIgKyB1aVN0YXRlLm5ld1RleHRMaW5lQ291bnQgLSAxLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5MaW5lczogcmVkdWNlZExpbmVzQ291bnQsXG5cdFx0XHRcdFx0XHRzaG93SW5IaWRkZW5BcmVhczogdHJ1ZSxcblx0XHRcdFx0XHRcdGRvbU5vZGU6ICQoJ2Rpdi5kaWFnb25hbC1maWxsLmlubGluZS1lZGl0cy12aWV3LXpvbmUnKSxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3ByZXZpZXdFZGl0b3JXaWR0aCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVkaXQgPSB0aGlzLl9lZGl0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZWRpdCkgeyByZXR1cm4gMDsgfVxuXHRcdFx0dGhpcy5fdXBkYXRlUHJldmlld0VkaXRvci5yZWFkKHJlYWRlcik7XG5cblx0XHRcdHJldHVybiBtYXhDb250ZW50V2lkdGhJblJhbmdlKHRoaXMuX3ByZXZpZXdFZGl0b3JPYnMsIGVkaXQubW9kaWZpZWRMaW5lUmFuZ2UsIHJlYWRlcik7XG5cdFx0fSk7XG5cdFx0dGhpcy5fY3Vyc29yUG9zSWZUb3VjaGVzRWRpdCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGN1cnNvclBvcyA9IHRoaXMuX2VkaXRvck9icy5jdXJzb3JQb3NpdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBlZGl0ID0gdGhpcy5fZWRpdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWVkaXQgfHwgIWN1cnNvclBvcykgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRyZXR1cm4gZWRpdC5tb2RpZmllZExpbmVSYW5nZS5jb250YWlucyhjdXJzb3JQb3MubGluZU51bWJlcikgPyBjdXJzb3JQb3MgOiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0dGhpcy5fb3JpZ2luYWxTdGFydFBvc2l0aW9uID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCBpbmxpbmVFZGl0ID0gdGhpcy5fZWRpdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gaW5saW5lRWRpdCA/IG5ldyBQb3NpdGlvbihpbmxpbmVFZGl0Lm9yaWdpbmFsTGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSkgOiBudWxsO1xuXHRcdH0pO1xuXHRcdHRoaXMuX29yaWdpbmFsRW5kUG9zaXRpb24gPSBkZXJpdmVkKHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IGlubGluZUVkaXQgPSB0aGlzLl9lZGl0LnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBpbmxpbmVFZGl0ID8gbmV3IFBvc2l0aW9uKGlubGluZUVkaXQub3JpZ2luYWxMaW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSwgMSkgOiBudWxsO1xuXHRcdH0pO1xuXHRcdHRoaXMuX29yaWdpbmFsVmVydGljYWxTdGFydFBvc2l0aW9uID0gdGhpcy5fZWRpdG9yT2JzLm9ic2VydmVQb3NpdGlvbih0aGlzLl9vcmlnaW5hbFN0YXJ0UG9zaXRpb24sIHRoaXMuX3N0b3JlKS5tYXAocCA9PiBwPy55KTtcblx0XHR0aGlzLl9vcmlnaW5hbFZlcnRpY2FsRW5kUG9zaXRpb24gPSB0aGlzLl9lZGl0b3JPYnMub2JzZXJ2ZVBvc2l0aW9uKHRoaXMuX29yaWdpbmFsRW5kUG9zaXRpb24sIHRoaXMuX3N0b3JlKS5tYXAocCA9PiBwPy55KTtcblx0XHR0aGlzLl9vcmlnaW5hbERpc3BsYXlSYW5nZSA9IHRoaXMuX2VkaXQubWFwKGUgPT4gZT8uZGlzcGxheVJhbmdlKTtcblx0XHR0aGlzLl9lZGl0b3JNYXhDb250ZW50V2lkdGhJblJhbmdlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxEaXNwbGF5UmFuZ2UgPSB0aGlzLl9vcmlnaW5hbERpc3BsYXlSYW5nZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW9yaWdpbmFsRGlzcGxheVJhbmdlKSB7XG5cdFx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUoMCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lZGl0b3JPYnMudmVyc2lvbklkLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gVGFrZSB0aGUgbWF4IHZhbHVlIHRoYXQgd2Ugb2JzZXJ2ZWQuXG5cdFx0XHQvLyBSZXNldCB3aGVuIGVpdGhlciB0aGUgZWRpdCBjaGFuZ2VzIG9yIHRoZSBlZGl0b3IgdGV4dCB2ZXJzaW9uLlxuXHRcdFx0cmV0dXJuIGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPG51bWJlcj4odGhpcywgKHJlYWRlciwgbGFzdFZhbHVlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1heFdpZHRoID0gbWF4Q29udGVudFdpZHRoSW5SYW5nZSh0aGlzLl9lZGl0b3JPYnMsIG9yaWdpbmFsRGlzcGxheVJhbmdlLCByZWFkZXIpO1xuXHRcdFx0XHRyZXR1cm4gTWF0aC5tYXgobWF4V2lkdGgsIGxhc3RWYWx1ZSA/PyAwKTtcblx0XHRcdH0pO1xuXHRcdH0pLm1hcCgodiwgcikgPT4gdi5yZWFkKHIpKTtcblxuXHRcdGNvbnN0IGVkaXRvckRvbUNvbnRlbnRSZWN0ID0gb2JzZXJ2ZUVkaXRvckJvdW5kaW5nQ2xpZW50UmVjdCh0aGlzLl9lZGl0b3IsIHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCBpbmxpbmVFZGl0ID0gdGhpcy5fZWRpdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWlubGluZUVkaXQpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3VpU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmFuZ2UgPSBpbmxpbmVFZGl0Lm9yaWdpbmFsTGluZVJhbmdlO1xuXG5cdFx0XHRjb25zdCBob3Jpem9udGFsU2Nyb2xsT2Zmc2V0ID0gdGhpcy5fZWRpdG9yT2JzLnNjcm9sbExlZnQucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBlZGl0b3JDb250ZW50TWF4V2lkdGhJblJhbmdlID0gdGhpcy5fZWRpdG9yTWF4Q29udGVudFdpZHRoSW5SYW5nZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBlZGl0b3JMYXlvdXQgPSB0aGlzLl9lZGl0b3JPYnMubGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBwcmV2aWV3Q29udGVudFdpZHRoID0gdGhpcy5fcHJldmlld0VkaXRvcldpZHRoLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVkaXRvckNvbnRlbnRBcmVhV2lkdGggPSBlZGl0b3JMYXlvdXQuY29udGVudFdpZHRoIC0gZWRpdG9yTGF5b3V0LnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg7XG5cdFx0XHRjb25zdCBlZGl0b3JCb3VuZGluZ0NsaWVudFJlY3QgPSBlZGl0b3JEb21Db250ZW50UmVjdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBjbGllbnRDb250ZW50QXJlYVJpZ2h0ID0gZWRpdG9yTGF5b3V0LmNvbnRlbnRMZWZ0ICsgZWRpdG9yTGF5b3V0LmNvbnRlbnRXaWR0aCArIGVkaXRvckJvdW5kaW5nQ2xpZW50UmVjdC5sZWZ0O1xuXHRcdFx0Y29uc3QgcmVtYWluaW5nV2lkdGhSaWdodE9mQ29udGVudCA9IGdldFdpbmRvdyh0aGlzLl9lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpKS5pbm5lcldpZHRoIC0gY2xpZW50Q29udGVudEFyZWFSaWdodDtcblx0XHRcdGNvbnN0IHJlbWFpbmluZ1dpZHRoUmlnaHRPZkVkaXRvciA9IGdldFdpbmRvdyh0aGlzLl9lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpKS5pbm5lcldpZHRoIC0gZWRpdG9yQm91bmRpbmdDbGllbnRSZWN0LnJpZ2h0O1xuXHRcdFx0Y29uc3QgZGVzaXJlZE1pbmltdW1XaWR0aCA9IE1hdGgubWluKGVkaXRvckxheW91dC5jb250ZW50V2lkdGggKiAwLjMsIHByZXZpZXdDb250ZW50V2lkdGgsIDEwMCk7XG5cdFx0XHRjb25zdCBJTl9FRElUT1JfRElTUExBQ0VNRU5UID0gMDtcblx0XHRcdGNvbnN0IG1heGltdW1BdmFpbGFibGVXaWR0aCA9IElOX0VESVRPUl9ESVNQTEFDRU1FTlQgKyByZW1haW5pbmdXaWR0aFJpZ2h0T2ZDb250ZW50O1xuXG5cdFx0XHRjb25zdCBjdXJzb3JQb3MgPSB0aGlzLl9jdXJzb3JQb3NJZlRvdWNoZXNFZGl0LnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgbWF4UHJldmlld0VkaXRvckxlZnQgPSBNYXRoLm1heChcblx0XHRcdFx0Ly8gV2UncmUgc3RhcnRpbmcgZnJvbSB0aGUgY29udGVudCBhcmVhIHJpZ2h0IGFuZCBtb3ZpbmcgaXQgbGVmdCBieSBJTl9FRElUT1JfRElTUExBQ0VNRU5UIGFuZCBhbHNvIGJ5IGFuIGFtb3VudCB0byBlbnN1cmUgc29tZSBtaW5pbXVtIGRlc2lyZWQgd2lkdGhcblx0XHRcdFx0ZWRpdG9yQ29udGVudEFyZWFXaWR0aCArIGhvcml6b250YWxTY3JvbGxPZmZzZXQgLSBJTl9FRElUT1JfRElTUExBQ0VNRU5UIC0gTWF0aC5tYXgoMCwgZGVzaXJlZE1pbmltdW1XaWR0aCAtIG1heGltdW1BdmFpbGFibGVXaWR0aCksXG5cdFx0XHRcdC8vIEJ1dCB3ZSBkb24ndCB3YW50IHRoYXQgdGhlIG1vdmluZyBsZWZ0IGVuZHMgdXAgY292ZXJpbmcgdGhlIGN1cnNvciwgc28gdGhpcyB3aWxsIHB1c2ggaXQgdG8gdGhlIHJpZ2h0IGFnYWluXG5cdFx0XHRcdE1hdGgubWluKFxuXHRcdFx0XHRcdGN1cnNvclBvcyA/IGdldE9mZnNldEZvclBvcyh0aGlzLl9lZGl0b3JPYnMsIGN1cnNvclBvcywgcmVhZGVyKSArIDUwIDogMCxcblx0XHRcdFx0XHRlZGl0b3JDb250ZW50QXJlYVdpZHRoICsgaG9yaXpvbnRhbFNjcm9sbE9mZnNldFxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgcHJldmlld0VkaXRvckxlZnRJblRleHRBcmVhID0gTWF0aC5taW4oZWRpdG9yQ29udGVudE1heFdpZHRoSW5SYW5nZSArIE9SSUdJTkFMX0VORF9QQURESU5HLCBtYXhQcmV2aWV3RWRpdG9yTGVmdCk7XG5cblx0XHRcdGNvbnN0IG1heENvbnRlbnRXaWR0aCA9IGVkaXRvckNvbnRlbnRNYXhXaWR0aEluUmFuZ2UgKyBPUklHSU5BTF9FTkRfUEFERElORyArIHByZXZpZXdDb250ZW50V2lkdGggKyA3MDtcblxuXHRcdFx0Y29uc3QgZGlzdCA9IG1heFByZXZpZXdFZGl0b3JMZWZ0IC0gcHJldmlld0VkaXRvckxlZnRJblRleHRBcmVhO1xuXG5cdFx0XHRsZXQgZGVzaXJlZFByZXZpZXdFZGl0b3JTY3JvbGxMZWZ0O1xuXHRcdFx0bGV0IGNvZGVSaWdodDtcblx0XHRcdGlmIChwcmV2aWV3RWRpdG9yTGVmdEluVGV4dEFyZWEgPiBob3Jpem9udGFsU2Nyb2xsT2Zmc2V0KSB7XG5cdFx0XHRcdGRlc2lyZWRQcmV2aWV3RWRpdG9yU2Nyb2xsTGVmdCA9IDA7XG5cdFx0XHRcdGNvZGVSaWdodCA9IGVkaXRvckxheW91dC5jb250ZW50TGVmdCArIHByZXZpZXdFZGl0b3JMZWZ0SW5UZXh0QXJlYSAtIGhvcml6b250YWxTY3JvbGxPZmZzZXQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZXNpcmVkUHJldmlld0VkaXRvclNjcm9sbExlZnQgPSBob3Jpem9udGFsU2Nyb2xsT2Zmc2V0IC0gcHJldmlld0VkaXRvckxlZnRJblRleHRBcmVhO1xuXHRcdFx0XHRjb2RlUmlnaHQgPSBlZGl0b3JMYXlvdXQuY29udGVudExlZnQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvblRvcCA9IHRoaXMuX29yaWdpbmFsVmVydGljYWxTdGFydFBvc2l0aW9uLnJlYWQocmVhZGVyKSA/PyB0aGlzLl9lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihyYW5nZS5zdGFydExpbmVOdW1iZXIpIC0gdGhpcy5fZWRpdG9yT2JzLnNjcm9sbFRvcC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25Cb3R0b20gPSB0aGlzLl9vcmlnaW5hbFZlcnRpY2FsRW5kUG9zaXRpb24ucmVhZChyZWFkZXIpID8/IHRoaXMuX2VkaXRvci5nZXRCb3R0b21Gb3JMaW5lTnVtYmVyKHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxKSAtIHRoaXMuX2VkaXRvck9icy5zY3JvbGxUb3AucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBUT0RPOiBjb25zdCB7IHByZWZpeExlZnRPZmZzZXQgfSA9IGdldFByZWZpeFRyaW0oaW5saW5lRWRpdC5lZGl0LmVkaXRzLm1hcChlID0+IGUucmFuZ2UpLCBpbmxpbmVFZGl0Lm9yaWdpbmFsTGluZVJhbmdlLCBbXSwgdGhpcy5fZWRpdG9yKTtcblx0XHRcdGNvbnN0IGNvZGVMZWZ0ID0gZWRpdG9yTGF5b3V0LmNvbnRlbnRMZWZ0IC0gaG9yaXpvbnRhbFNjcm9sbE9mZnNldDtcblxuXHRcdFx0bGV0IGNvZGVSZWN0ID0gUmVjdC5mcm9tTGVmdFRvcFJpZ2h0Qm90dG9tKGNvZGVMZWZ0LCBzZWxlY3Rpb25Ub3AsIGNvZGVSaWdodCwgc2VsZWN0aW9uQm90dG9tKTtcblx0XHRcdGNvbnN0IGlzSW5zZXJ0aW9uID0gY29kZVJlY3QuaGVpZ2h0ID09PSAwO1xuXHRcdFx0aWYgKCFpc0luc2VydGlvbikge1xuXHRcdFx0XHRjb2RlUmVjdCA9IGNvZGVSZWN0LndpdGhNYXJnaW4oVkVSVElDQUxfUEFERElORywgSE9SSVpPTlRBTF9QQURESU5HKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJldmlld0xpbmVIZWlnaHRzID0gdGhpcy5fcHJldmlld0VkaXRvck9icy5vYnNlcnZlTGluZUhlaWdodHNGb3JMaW5lUmFuZ2UoaW5saW5lRWRpdC5tb2RpZmllZExpbmVSYW5nZSkucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWRpdEhlaWdodCA9IHByZXZpZXdMaW5lSGVpZ2h0cy5yZWR1Y2UoKGFjYywgaCkgPT4gYWNjICsgaCwgMCk7XG5cdFx0XHRjb25zdCBjb2RlSGVpZ2h0ID0gc2VsZWN0aW9uQm90dG9tIC0gc2VsZWN0aW9uVG9wO1xuXHRcdFx0Y29uc3QgcHJldmlld0VkaXRvckhlaWdodCA9IE1hdGgubWF4KGNvZGVIZWlnaHQsIGVkaXRIZWlnaHQpO1xuXG5cdFx0XHRjb25zdCBjbGlwcGVkID0gZGlzdCA9PT0gMDtcblx0XHRcdGNvbnN0IGNvZGVFZGl0RGlzdCA9IDA7XG5cdFx0XHRjb25zdCBwcmV2aWV3RWRpdG9yV2lkdGggPSBNYXRoLm1pbihwcmV2aWV3Q29udGVudFdpZHRoICsgTU9ESUZJRURfRU5EX1BBRERJTkcsIHJlbWFpbmluZ1dpZHRoUmlnaHRPZkVkaXRvciArIGVkaXRvckxheW91dC53aWR0aCAtIGVkaXRvckxheW91dC5jb250ZW50TGVmdCAtIGNvZGVFZGl0RGlzdCk7XG5cblx0XHRcdGxldCBlZGl0UmVjdCA9IFJlY3QuZnJvbUxlZnRUb3BXaWR0aEhlaWdodChjb2RlUmVjdC5yaWdodCArIGNvZGVFZGl0RGlzdCwgc2VsZWN0aW9uVG9wLCBwcmV2aWV3RWRpdG9yV2lkdGgsIHByZXZpZXdFZGl0b3JIZWlnaHQpO1xuXHRcdFx0aWYgKCFpc0luc2VydGlvbikge1xuXHRcdFx0XHRlZGl0UmVjdCA9IGVkaXRSZWN0LndpdGhNYXJnaW4oVkVSVElDQUxfUEFERElORywgSE9SSVpPTlRBTF9QQURESU5HKS50cmFuc2xhdGVYKEhPUklaT05UQUxfUEFERElORyArIEJPUkRFUl9XSURUSCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBBbGlnbiB0b3Agb2YgZWRpdCB3aXRoIGluc2VydGlvbiBsaW5lXG5cdFx0XHRcdGVkaXRSZWN0ID0gZWRpdFJlY3Qud2l0aE1hcmdpbihWRVJUSUNBTF9QQURESU5HLCBIT1JJWk9OVEFMX1BBRERJTkcpLnRyYW5zbGF0ZVkoVkVSVElDQUxfUEFERElORyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGRlYnVnVmlldyhkZWJ1Z0xvZ1JlY3RzKHsgY29kZVJlY3QsIGVkaXRSZWN0IH0sIHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCkhKSwgcmVhZGVyKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29kZVJlY3QsXG5cdFx0XHRcdGVkaXRSZWN0LFxuXHRcdFx0XHRjb2RlU2Nyb2xsTGVmdDogaG9yaXpvbnRhbFNjcm9sbE9mZnNldCxcblx0XHRcdFx0Y29udGVudExlZnQ6IGVkaXRvckxheW91dC5jb250ZW50TGVmdCxcblxuXHRcdFx0XHRpc0luc2VydGlvbixcblx0XHRcdFx0bWF4Q29udGVudFdpZHRoLFxuXHRcdFx0XHRzaG91bGRTaG93U2hhZG93OiBjbGlwcGVkLFxuXHRcdFx0XHRkZXNpcmVkUHJldmlld0VkaXRvclNjcm9sbExlZnQsXG5cdFx0XHRcdHByZXZpZXdFZGl0b3JXaWR0aCxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsQ29udHJvbGxlciA9IFN0aWNreVNjcm9sbENvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvck9icy5lZGl0b3IpO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbEhlaWdodCA9IHRoaXMuX3N0aWNreVNjcm9sbENvbnRyb2xsZXIgPyBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMuX3N0aWNreVNjcm9sbENvbnRyb2xsZXIub25EaWRDaGFuZ2VTdGlja3lTY3JvbGxIZWlnaHQsICgpID0+IHRoaXMuX3N0aWNreVNjcm9sbENvbnRyb2xsZXIhLnN0aWNreVNjcm9sbFdpZGdldEhlaWdodCkgOiBjb25zdE9ic2VydmFibGUoMCk7XG5cdFx0dGhpcy5fc2hvdWxkT3ZlcmZsb3cgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRpZiAoIUVOQUJMRV9PVkVSRkxPVykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuX2VkaXQucmVhZChyZWFkZXIpPy5vcmlnaW5hbExpbmVSYW5nZTtcblx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsSGVpZ2h0ID0gdGhpcy5fc3RpY2t5U2Nyb2xsSGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHRvcCA9IHRoaXMuX2VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHJhbmdlLnN0YXJ0TGluZU51bWJlcikgLSB0aGlzLl9lZGl0b3JPYnMuc2Nyb2xsVG9wLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh0b3AgPD0gc3RpY2t5U2Nyb2xsSGVpZ2h0KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJvdHRvbSA9IHRoaXMuX2VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUpIC0gdGhpcy5fZWRpdG9yT2JzLnNjcm9sbFRvcC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoYm90dG9tID49IHRoaXMuX2VkaXRvck9icy5sYXlvdXRJbmZvLnJlYWQocmVhZGVyKS5oZWlnaHQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0dGhpcy5fb3JpZ2luYWxCYWNrZ3JvdW5kQ29sb3IgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UsICgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKG9yaWdpbmFsQmFja2dyb3VuZENvbG9yKSA/PyBDb2xvci50cmFuc3BhcmVudDtcblx0XHR9KTtcblx0XHR0aGlzLl9lZGl0b3JCYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLl91aVN0YXRlLm1hcChzID0+IHtcblx0XHRcdHJldHVybiBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3Iocz8uZWRpdG9yVHlwZSA/PyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5UZXh0RWRpdG9yKTtcblx0XHR9KTtcblx0XHR0aGlzLl9iYWNrZ3JvdW5kU3ZnID0gbi5zdmcoe1xuXHRcdFx0dHJhbnNmb3JtOiAndHJhbnNsYXRlKC0wLjUgLTAuNSknLFxuXHRcdFx0c3R5bGU6IHsgb3ZlcmZsb3c6ICd2aXNpYmxlJywgcG9pbnRlckV2ZW50czogJ25vbmUnLCBwb3NpdGlvbjogJ2Fic29sdXRlJyB9LFxuXHRcdH0sIFtcblx0XHRcdG4uc3ZnRWxlbSgncGF0aCcsIHtcblx0XHRcdFx0Y2xhc3M6ICdyaWdodE9mTW9kaWZpZWRCYWNrZ3JvdW5kQ292ZXJVcCcsXG5cdFx0XHRcdGQ6IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fcHJldmlld0VkaXRvckxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGlmICghbGF5b3V0SW5mbykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxCYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLl9vcmlnaW5hbEJhY2tncm91bmRDb2xvci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsQmFja2dyb3VuZENvbG9yLmlzVHJhbnNwYXJlbnQoKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gbmV3IFBhdGhCdWlsZGVyKClcblx0XHRcdFx0XHRcdC5tb3ZlVG8obGF5b3V0SW5mby5jb2RlUmVjdC5nZXRSaWdodFRvcCgpKVxuXHRcdFx0XHRcdFx0LmxpbmVUbyhsYXlvdXRJbmZvLmNvZGVSZWN0LmdldFJpZ2h0VG9wKCkuZGVsdGFYKDEwMDApKVxuXHRcdFx0XHRcdFx0LmxpbmVUbyhsYXlvdXRJbmZvLmNvZGVSZWN0LmdldFJpZ2h0Qm90dG9tKCkuZGVsdGFYKDEwMDApKVxuXHRcdFx0XHRcdFx0LmxpbmVUbyhsYXlvdXRJbmZvLmNvZGVSZWN0LmdldFJpZ2h0Qm90dG9tKCkpXG5cdFx0XHRcdFx0XHQuYnVpbGQoKTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0ZmlsbDogdGhpcy5fZWRpdG9yQmFja2dyb3VuZENvbG9yLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRdKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fb3JpZ2luYWxPdmVybGF5ID0gbi5kaXYoe1xuXHRcdFx0c3R5bGU6IHsgcG9pbnRlckV2ZW50czogJ25vbmUnLCBkaXNwbGF5OiB0aGlzLl9wcmV2aWV3RWRpdG9yTGF5b3V0SW5mby5tYXAobGF5b3V0SW5mbyA9PiBsYXlvdXRJbmZvPy5pc0luc2VydGlvbiA/ICdub25lJyA6ICdibG9jaycpIH0sXG5cdFx0fSwgZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mb09icyA9IG1hcE91dEZhbHN5KHRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWxheW91dEluZm9PYnMpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0XHRjb25zdCBlZGl0b3JCYWNrZ3JvdW5kID0gdGhpcy5fZWRpdG9yQmFja2dyb3VuZENvbG9yLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3Qgc2VwYXJhdG9yV2lkdGggPSBzZXBhcmF0b3JXaWR0aE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBib3JkZXJTdHlsaW5nID0gZ2V0T3JpZ2luYWxCb3JkZXJDb2xvcih0aGlzLl90YWJBY3Rpb24pLm1hcChiYyA9PiBgJHtCT1JERVJfV0lEVEh9cHggc29saWQgJHthc0Nzc1ZhcmlhYmxlKGJjKX1gKTtcblx0XHRcdGNvbnN0IGJvcmRlclN0eWxpbmdTZXBhcmF0b3IgPSBgJHtCT1JERVJfV0lEVEggKyBzZXBhcmF0b3JXaWR0aH1weCBzb2xpZCAke2VkaXRvckJhY2tncm91bmR9YDtcblxuXHRcdFx0Y29uc3QgaGFzQm9yZGVyTGVmdCA9IGxheW91dEluZm9PYnMucmVhZChyZWFkZXIpLmNvZGVTY3JvbGxMZWZ0ICE9PSAwO1xuXHRcdFx0Y29uc3QgaXNNb2RpZmllZExvd2VyID0gbGF5b3V0SW5mb09icy5tYXAobGF5b3V0SW5mbyA9PiBsYXlvdXRJbmZvLmNvZGVSZWN0LmJvdHRvbSA8IGxheW91dEluZm8uZWRpdFJlY3QuYm90dG9tKTtcblx0XHRcdGNvbnN0IHRyYW5zaXRpb25SZWN0U2l6ZSA9IEJPUkRFUl9SQURJVVMgKiAyICsgQk9SREVSX1dJRFRIICogMjtcblxuXHRcdFx0Ly8gQ3JlYXRlIGFuIG92ZXJsYXkgd2hpY2ggaGlkZXMgdGhlIGxlZnQgaGFuZCBzaWRlIG9mIHRoZSBvcmlnaW5hbCBvdmVybGF5IHdoZW4gaXQgb3ZlcmZsb3dzIHRvIHRoZSBsZWZ0XG5cdFx0XHQvLyBzdWNoIHRoYXQgdGhlcmUgaXMgYSBzbW9vdGggdHJhbnNpdGlvbiBhdCB0aGUgZWRnZSBvZiBjb250ZW50IGxlZnRcblx0XHRcdGNvbnN0IG92ZXJsYXlIaWRlciA9IGxheW91dEluZm9PYnMubWFwKGxheW91dEluZm8gPT4gUmVjdC5mcm9tTGVmdFRvcFJpZ2h0Qm90dG9tKFxuXHRcdFx0XHRsYXlvdXRJbmZvLmNvbnRlbnRMZWZ0IC0gQk9SREVSX1JBRElVUyAtIEJPUkRFUl9XSURUSCxcblx0XHRcdFx0bGF5b3V0SW5mby5jb2RlUmVjdC50b3AsXG5cdFx0XHRcdGxheW91dEluZm8uY29udGVudExlZnQsXG5cdFx0XHRcdGxheW91dEluZm8uY29kZVJlY3QuYm90dG9tICsgdHJhbnNpdGlvblJlY3RTaXplXG5cdFx0XHQpKS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IGludGVyc2VjdGlvbkxpbmUgPSBuZXcgT2Zmc2V0UmFuZ2Uob3ZlcmxheUhpZGVyLmxlZnQsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKTtcblx0XHRcdGNvbnN0IG92ZXJsYXlSZWN0ID0gbGF5b3V0SW5mb09icy5tYXAobGF5b3V0SW5mbyA9PiBsYXlvdXRJbmZvLmNvZGVSZWN0LmludGVyc2VjdEhvcml6b250YWwoaW50ZXJzZWN0aW9uTGluZSkpO1xuXHRcdFx0Y29uc3Qgc2VwYXJhdG9yUmVjdCA9IG92ZXJsYXlSZWN0Lm1hcChvdmVybGF5UmVjdCA9PiBvdmVybGF5UmVjdC53aXRoTWFyZ2luKHNlcGFyYXRvcldpZHRoLCAwLCBzZXBhcmF0b3JXaWR0aCwgc2VwYXJhdG9yV2lkdGgpLmludGVyc2VjdEhvcml6b250YWwoaW50ZXJzZWN0aW9uTGluZSkpO1xuXG5cdFx0XHRjb25zdCB0cmFuc2l0aW9uUmVjdCA9IG92ZXJsYXlSZWN0Lm1hcChvdmVybGF5UmVjdCA9PiBSZWN0LmZyb21MZWZ0VG9wV2lkdGhIZWlnaHQob3ZlcmxheVJlY3QucmlnaHQgLSB0cmFuc2l0aW9uUmVjdFNpemUgKyBCT1JERVJfV0lEVEgsIG92ZXJsYXlSZWN0LmJvdHRvbSAtIEJPUkRFUl9XSURUSCwgdHJhbnNpdGlvblJlY3RTaXplLCB0cmFuc2l0aW9uUmVjdFNpemUpLmludGVyc2VjdEhvcml6b250YWwoaW50ZXJzZWN0aW9uTGluZSkpO1xuXG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0Y2xhc3M6ICdvcmlnaW5hbFNlcGFyYXRvclNpZGVCeVNpZGUnLFxuXHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHQuLi5zZXBhcmF0b3JSZWN0LnJlYWQocmVhZGVyKS50b1N0eWxlcygpLFxuXHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0JPUkRFUl9SQURJVVN9cHggMCAwICR7Qk9SREVSX1JBRElVU31weGAsXG5cdFx0XHRcdFx0XHRib3JkZXJUb3A6IGJvcmRlclN0eWxpbmdTZXBhcmF0b3IsXG5cdFx0XHRcdFx0XHRib3JkZXJCb3R0b206IGJvcmRlclN0eWxpbmdTZXBhcmF0b3IsXG5cdFx0XHRcdFx0XHRib3JkZXJMZWZ0OiBoYXNCb3JkZXJMZWZ0ID8gJ25vbmUnIDogYm9yZGVyU3R5bGluZ1NlcGFyYXRvcixcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXG5cdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRjbGFzczogJ29yaWdpbmFsT3ZlcmxheVNpZGVCeVNpZGUnLFxuXHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHQuLi5vdmVybGF5UmVjdC5yZWFkKHJlYWRlcikudG9TdHlsZXMoKSxcblx0XHRcdFx0XHRcdGJveFNpemluZzogJ2JvcmRlci1ib3gnLFxuXHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtCT1JERVJfUkFESVVTfXB4IDAgMCAke0JPUkRFUl9SQURJVVN9cHhgLFxuXHRcdFx0XHRcdFx0Ym9yZGVyVG9wOiBib3JkZXJTdHlsaW5nLFxuXHRcdFx0XHRcdFx0Ym9yZGVyQm90dG9tOiBib3JkZXJTdHlsaW5nLFxuXHRcdFx0XHRcdFx0Ym9yZGVyTGVmdDogaGFzQm9yZGVyTGVmdCA/ICdub25lJyA6IGJvcmRlclN0eWxpbmcsXG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IGFzQ3NzVmFyaWFibGUob3JpZ2luYWxCYWNrZ3JvdW5kQ29sb3IpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksXG5cblx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdGNsYXNzOiAnb3JpZ2luYWxDb3JuZXJDdXRvdXRTaWRlQnlTaWRlJyxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0XHRcdFx0ZGlzcGxheTogaXNNb2RpZmllZExvd2VyLm1hcChpc0xvd2VyID0+IGlzTG93ZXIgPyAnYmxvY2snIDogJ25vbmUnKSxcblx0XHRcdFx0XHRcdC4uLnRyYW5zaXRpb25SZWN0LnJlYWQocmVhZGVyKS50b1N0eWxlcygpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgW1xuXHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdGNsYXNzOiAnb3JpZ2luYWxDb3JuZXJDdXRvdXRCYWNrZ3JvdW5kJyxcblx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLCB0b3A6ICcwcHgnLCBsZWZ0OiAnMHB4Jywgd2lkdGg6ICcxMDAlJywgaGVpZ2h0OiAnMTAwJScsXG5cdFx0XHRcdFx0XHRcdGJhY2tncm91bmRDb2xvcjogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKG9yaWdpbmFsQmFja2dyb3VuZENvbG9yLCB0aGlzLl90aGVtZVNlcnZpY2UpLm1hcChjID0+IGMudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0Y2xhc3M6ICdvcmlnaW5hbENvcm5lckN1dG91dEJvcmRlcicsXG5cdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJywgdG9wOiAnMHB4JywgbGVmdDogJzBweCcsIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLFxuXHRcdFx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHRcdFx0Ym9yZGVyVG9wOiBib3JkZXJTdHlsaW5nLFxuXHRcdFx0XHRcdFx0XHRib3JkZXJSaWdodDogYm9yZGVyU3R5bGluZyxcblx0XHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgMCAxMDAlIDAgMGAsXG5cdFx0XHRcdFx0XHRcdGJhY2tncm91bmRDb2xvcjogZWRpdG9yQmFja2dyb3VuZFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdF0pLFxuXHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0Y2xhc3M6ICdvcmlnaW5hbE92ZXJsYXlTaWRlQnlTaWRlSGlkZXInLFxuXHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHQuLi5vdmVybGF5SGlkZXIudG9TdHlsZXMoKSxcblx0XHRcdFx0XHRcdGJhY2tncm91bmRDb2xvcjogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXHRcdFx0XTtcblx0XHR9KSkua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuX21vZGlmaWVkT3ZlcmxheSA9IG4uZGl2KHtcblx0XHRcdHN0eWxlOiB7IHBvaW50ZXJFdmVudHM6ICdub25lJywgfVxuXHRcdH0sIGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGxheW91dEluZm9PYnMgPSBtYXBPdXRGYWxzeSh0aGlzLl9wcmV2aWV3RWRpdG9yTGF5b3V0SW5mbykucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFsYXlvdXRJbmZvT2JzKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0Y29uc3QgaXNNb2RpZmllZExvd2VyID0gbGF5b3V0SW5mb09icy5tYXAobGF5b3V0SW5mbyA9PiBsYXlvdXRJbmZvLmNvZGVSZWN0LmJvdHRvbSA8IGxheW91dEluZm8uZWRpdFJlY3QuYm90dG9tKTtcblx0XHRcdGNvbnN0IGVkaXRvckJhY2tncm91bmQgPSB0aGlzLl9lZGl0b3JCYWNrZ3JvdW5kQ29sb3IucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBzZXBhcmF0b3JXaWR0aCA9IHNlcGFyYXRvcldpZHRoT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGJvcmRlclJhZGl1cyA9IGlzTW9kaWZpZWRMb3dlci5tYXAoaXNMb3dlciA9PiBgMCAke0JPUkRFUl9SQURJVVN9cHggJHtCT1JERVJfUkFESVVTfXB4ICR7aXNMb3dlciA/IEJPUkRFUl9SQURJVVMgOiAwfXB4YCk7XG5cdFx0XHRjb25zdCBib3JkZXJTdHlsaW5nID0gZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGdldE1vZGlmaWVkQm9yZGVyQ29sb3IodGhpcy5fdGFiQWN0aW9uKSwgdGhpcy5fdGhlbWVTZXJ2aWNlKS5tYXAoYyA9PiBgMXB4IHNvbGlkICR7Yy50b1N0cmluZygpfWApO1xuXHRcdFx0Y29uc3QgYm9yZGVyU3R5bGluZ1NlcGFyYXRvciA9IGAke0JPUkRFUl9XSURUSCArIHNlcGFyYXRvcldpZHRofXB4IHNvbGlkICR7ZWRpdG9yQmFja2dyb3VuZH1gO1xuXG5cdFx0XHRjb25zdCBvdmVybGF5UmVjdCA9IGxheW91dEluZm9PYnMubWFwKGxheW91dEluZm8gPT4gbGF5b3V0SW5mby5lZGl0UmVjdC53aXRoTWFyZ2luKDAsIEJPUkRFUl9XSURUSCkpO1xuXHRcdFx0Y29uc3Qgc2VwYXJhdG9yUmVjdCA9IG92ZXJsYXlSZWN0Lm1hcChvdmVybGF5UmVjdCA9PiBvdmVybGF5UmVjdC53aXRoTWFyZ2luKHNlcGFyYXRvcldpZHRoLCBzZXBhcmF0b3JXaWR0aCwgc2VwYXJhdG9yV2lkdGgsIDApKTtcblxuXHRcdFx0Y29uc3QgaW5zZXJ0aW9uUmVjdCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgb3ZlcmxheSA9IG92ZXJsYXlSZWN0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgbGF5b3V0aW5mbyA9IGxheW91dEluZm9PYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWxheW91dGluZm8uaXNJbnNlcnRpb24gfHwgbGF5b3V0aW5mby5jb250ZW50TGVmdCA+PSBvdmVybGF5LmxlZnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gUmVjdC5mcm9tTGVmdFRvcFdpZHRoSGVpZ2h0KG92ZXJsYXkubGVmdCwgb3ZlcmxheS50b3AsIDAsIDApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgUmVjdChsYXlvdXRpbmZvLmNvbnRlbnRMZWZ0LCBvdmVybGF5LnRvcCwgb3ZlcmxheS5sZWZ0LCBvdmVybGF5LnRvcCArIEJPUkRFUl9XSURUSCAqIDIpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRjbGFzczogJ21vZGlmaWVkSW5zZXJ0aW9uU2lkZUJ5U2lkZScsXG5cdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdC4uLmluc2VydGlvblJlY3QucmVhZChyZWFkZXIpLnRvU3R5bGVzKCksXG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IGdldE1vZGlmaWVkQm9yZGVyQ29sb3IodGhpcy5fdGFiQWN0aW9uKS5tYXAoYyA9PiBhc0Nzc1ZhcmlhYmxlKGMpKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0Y2xhc3M6ICdtb2RpZmllZFNlcGFyYXRvclNpZGVCeVNpZGUnLFxuXHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHQuLi5zZXBhcmF0b3JSZWN0LnJlYWQocmVhZGVyKS50b1N0eWxlcygpLFxuXHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzLFxuXHRcdFx0XHRcdFx0Ym9yZGVyVG9wOiBib3JkZXJTdHlsaW5nU2VwYXJhdG9yLFxuXHRcdFx0XHRcdFx0Ym9yZGVyQm90dG9tOiBib3JkZXJTdHlsaW5nU2VwYXJhdG9yLFxuXHRcdFx0XHRcdFx0Ym9yZGVyUmlnaHQ6IGJvcmRlclN0eWxpbmdTZXBhcmF0b3IsXG5cdFx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0Y2xhc3M6ICdtb2RpZmllZE92ZXJsYXlTaWRlQnlTaWRlJyxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0Li4ub3ZlcmxheVJlY3QucmVhZChyZWFkZXIpLnRvU3R5bGVzKCksXG5cdFx0XHRcdFx0XHRib3JkZXJSYWRpdXMsXG5cdFx0XHRcdFx0XHRib3JkZXI6IGJvcmRlclN0eWxpbmcsXG5cdFx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHRcdGJhY2tncm91bmRDb2xvcjogYXNDc3NWYXJpYWJsZShtb2RpZmllZEJhY2tncm91bmRDb2xvciksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0XTtcblx0XHR9KSkua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuX25vbk92ZXJmbG93VmlldyA9IG4uZGl2KHtcblx0XHRcdGNsYXNzOiAnaW5saW5lLWVkaXRzLXZpZXcnLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdG92ZXJmbG93OiAndmlzaWJsZScsXG5cdFx0XHRcdHRvcDogJzBweCcsXG5cdFx0XHRcdGxlZnQ6ICcwcHgnLFxuXHRcdFx0XHRkaXNwbGF5OiB0aGlzLl9kaXNwbGF5LFxuXHRcdFx0fSxcblx0XHR9LCBbXG5cdFx0XHR0aGlzLl9iYWNrZ3JvdW5kU3ZnLFxuXHRcdFx0ZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fc2hvdWxkT3ZlcmZsb3cucmVhZChyZWFkZXIpID8gW10gOiBbdGhpcy5fZWRpdG9yQ29udGFpbmVyLCB0aGlzLl9vcmlnaW5hbE92ZXJsYXksIHRoaXMuX21vZGlmaWVkT3ZlcmxheV0pLFxuXHRcdF0pLmtlZXBVcGRhdGVkKHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvck9icy5jcmVhdGVPdmVybGF5V2lkZ2V0KHtcblx0XHRcdGRvbU5vZGU6IHRoaXMuX25vbk92ZXJmbG93Vmlldy5lbGVtZW50LFxuXHRcdFx0cG9zaXRpb246IGNvbnN0T2JzZXJ2YWJsZShudWxsKSxcblx0XHRcdGFsbG93RWRpdG9yT3ZlcmZsb3c6IGZhbHNlLFxuXHRcdFx0bWluQ29udGVudFdpZHRoSW5QeDogZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCB4ID0gdGhpcy5fcHJldmlld0VkaXRvckxheW91dEluZm8ucmVhZChyZWFkZXIpPy5tYXhDb250ZW50V2lkdGg7XG5cdFx0XHRcdGlmICh4ID09PSB1bmRlZmluZWQpIHsgcmV0dXJuIDA7IH1cblx0XHRcdFx0cmV0dXJuIHg7XG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLnByZXZpZXdFZGl0b3Iuc2V0TW9kZWwodGhpcy5fcHJldmlld1RleHRNb2RlbCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fcHJldmlld0VkaXRvckxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFsYXlvdXRJbmZvKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVkaXRvclJlY3QgPSBsYXlvdXRJbmZvLmVkaXRSZWN0LndpdGhNYXJnaW4oLVZFUlRJQ0FMX1BBRERJTkcsIC1IT1JJWk9OVEFMX1BBRERJTkcpO1xuXG5cdFx0XHR0aGlzLnByZXZpZXdFZGl0b3IubGF5b3V0KHsgaGVpZ2h0OiBlZGl0b3JSZWN0LmhlaWdodCwgd2lkdGg6IGxheW91dEluZm8ucHJldmlld0VkaXRvcldpZHRoICsgMTUgLyogTWFrZSBzdXJlIGVkaXRvciBkb2VzIG5vdCBzY3JvbGwgaG9yaXpvbnRhbGx5ICovIH0pO1xuXHRcdFx0dGhpcy5fZWRpdG9yQ29udGFpbmVyLmVsZW1lbnQuc3R5bGUudG9wID0gYCR7ZWRpdG9yUmVjdC50b3B9cHhgO1xuXHRcdFx0dGhpcy5fZWRpdG9yQ29udGFpbmVyLmVsZW1lbnQuc3R5bGUubGVmdCA9IGAke2VkaXRvclJlY3QubGVmdH1weGA7XG5cdFx0XHR0aGlzLl9lZGl0b3JDb250YWluZXIuZWxlbWVudC5zdHlsZS53aWR0aCA9IGAke2xheW91dEluZm8ucHJldmlld0VkaXRvcldpZHRoICsgSE9SSVpPTlRBTF9QQURESU5HfXB4YDsgLy8gU2V0IHdpZHRoIHRvIGNsaXAgdmlldyB6b25lXG5cdFx0XHQvL3RoaXMuX2VkaXRvckNvbnRhaW5lci5lbGVtZW50LnN0eWxlLmJvcmRlclJhZGl1cyA9IGAwICR7Qk9SREVSX1JBRElVU31weCAke0JPUkRFUl9SQURJVVN9cHggMGA7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbGF5b3V0SW5mbykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3ByZXZpZXdFZGl0b3JPYnMuZWRpdG9yLnNldFNjcm9sbExlZnQobGF5b3V0SW5mby5kZXNpcmVkUHJldmlld0VkaXRvclNjcm9sbExlZnQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVByZXZpZXdFZGl0b3IucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcGxheTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZpZXdSZWY7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yQ29udGFpbmVyO1xuXG5cdHB1YmxpYyByZWFkb25seSBpc0hvdmVyZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IHByZXZpZXdFZGl0b3I7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlld0VkaXRvck9icztcblxuXHRwcml2YXRlIF9hY3RpdmVWaWV3Wm9uZXM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVQcmV2aWV3RWRpdG9yO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZpZXdFZGl0b3JXaWR0aDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJzb3JQb3NJZlRvdWNoZXNFZGl0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsU3RhcnRQb3NpdGlvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbEVuZFBvc2l0aW9uO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsVmVydGljYWxTdGFydFBvc2l0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFZlcnRpY2FsRW5kUG9zaXRpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxEaXNwbGF5UmFuZ2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvck1heENvbnRlbnRXaWR0aEluUmFuZ2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlld0VkaXRvckxheW91dEluZm87XG5cblx0cHJpdmF0ZSBfc3RpY2t5U2Nyb2xsQ29udHJvbGxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RpY2t5U2Nyb2xsSGVpZ2h0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3VsZE92ZXJmbG93O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsQmFja2dyb3VuZENvbG9yO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckJhY2tncm91bmRDb2xvcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9iYWNrZ3JvdW5kU3ZnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsT3ZlcmxheTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZE92ZXJsYXk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbm9uT3ZlcmZsb3dWaWV3O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxTQUFTLEdBQUcsV0FBVyxTQUFTO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBK0IsU0FBUyxpQkFBaUIsU0FBUyw0QkFBNEIsMkJBQTJCO0FBQ3pILFNBQVMsNkJBQTZC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
