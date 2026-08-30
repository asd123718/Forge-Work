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
import { n } from "../../../../../../../../base/browser/dom.js";
import { Event } from "../../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, debouncedObservable2, derived, derivedDisposable, observableFromEvent } from "../../../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../../../platform/instantiation/common/instantiation.js";
import { observableCodeEditor } from "../../../../../../../browser/observableCodeEditor.js";
import { Rect } from "../../../../../../../common/core/2d/rect.js";
import { Position } from "../../../../../../../common/core/position.js";
import { InlineEditTabAction } from "../../inlineEditsViewInterface.js";
import { getContentSizeOfLines, rectToProps } from "../../utils/utils.js";
import { OffsetRange } from "../../../../../../../common/core/ranges/offsetRange.js";
import { LineRange } from "../../../../../../../common/core/ranges/lineRange.js";
import { HideUnchangedRegionsFeature } from "../../../../../../../browser/widget/diffEditor/features/hideUnchangedRegionsFeature.js";
import { Codicon } from "../../../../../../../../base/common/codicons.js";
import { renderIcon } from "../../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { SymbolKinds } from "../../../../../../../common/languages.js";
import { debugLogHorizontalOffsetRanges, debugLogRects, debugView } from "../debugVisualization.js";
import { distributeFlexBoxLayout } from "../../utils/flexBoxLayout.js";
import { Point } from "../../../../../../../common/core/2d/point.js";
import { IThemeService } from "../../../../../../../../platform/theme/common/themeService.js";
import { IKeybindingService } from "../../../../../../../../platform/keybinding/common/keybinding.js";
import { getEditorBackgroundColor, getEditorBlendedColor, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSuccessfulBackground, observeColor } from "../../theme.js";
import { asCssVariable, descriptionForeground, editorWidgetBackground } from "../../../../../../../../platform/theme/common/colorRegistry.js";
import { editorWidgetBorder } from "../../../../../../../../platform/theme/common/colors/editorColors.js";
import { LongDistancePreviewEditor } from "./longDistancePreviewEditor.js";
import { jumpToNextInlineEditId } from "../../../../controller/commandIds.js";
import { splitIntoContinuousLineRanges, WidgetPlacementContext } from "./longDistnaceWidgetPlacement.js";
import { InlineCompletionEditorType } from "../../../../model/provideInlineCompletions.js";
import { basename } from "../../../../../../../../base/common/resources.js";
import { IModelService } from "../../../../../../../common/services/model.js";
import { ILanguageService } from "../../../../../../../common/languages/language.js";
import { getIconClasses } from "../../../../../../../common/services/getIconClasses.js";
import { FileKind } from "../../../../../../../../platform/files/common/files.js";
const BORDER_RADIUS = 6;
const MAX_WIDGET_WIDTH = { EMPTY_SPACE: 425, OVERLAY: 375 };
const MIN_WIDGET_WIDTH = 250;
const DEFAULT_WIDGET_LAYOUT_CONSTANTS = {
  previewEditorMargin: 2,
  widgetPadding: 2,
  widgetBorder: 1,
  lowerBarHeight: 20,
  minWidgetWidth: MIN_WIDGET_WIDTH
};
let InlineEditsLongDistanceHint = class extends Disposable {
  constructor(_editor, _viewState, _previewTextModel, _tabAction, _instantiationService, _themeService, _keybindingService, _modelService, _languageService) {
    super();
    this._editor = _editor;
    this._viewState = _viewState;
    this._previewTextModel = _previewTextModel;
    this._tabAction = _tabAction;
    this._instantiationService = _instantiationService;
    this._themeService = _themeService;
    this._keybindingService = _keybindingService;
    this._modelService = _modelService;
    this._languageService = _languageService;
    this.onDidClick = Event.None;
    this._viewWithElement = void 0;
    this._hintTextPosition = derived(this, (reader) => {
      const viewState = this._viewState.read(reader);
      return viewState ? new Position(viewState.hint.lineNumber, Number.MAX_SAFE_INTEGER) : null;
    });
    this._lineSizesAroundHintPosition = derived(this, (reader) => {
      const viewState = this._viewState.read(reader);
      const p = this._hintTextPosition.read(reader);
      if (!viewState || !p) {
        return [];
      }
      const model = this._editorObs.model.read(reader);
      if (!model) {
        return [];
      }
      const range = LineRange.ofLength(p.lineNumber, 1).addMargin(5, 5).intersect(LineRange.ofLength(1, model.getLineCount()));
      if (!range) {
        return [];
      }
      const sizes = getContentSizeOfLines(this._editorObs, range, reader);
      const top = this._editorObs.observeTopForLineNumber(range.startLineNumber).read(reader);
      return splitIntoContinuousLineRanges(range, sizes, top, this._editorObs, reader);
    });
    this._isVisibleDelayed = debouncedObservable2(
      derived(this, (reader) => this._viewState.read(reader)?.hint.isVisible),
      (lastValue, newValue) => lastValue === true && newValue === false ? 200 : 0
    );
    this._previewEditorLayoutInfo = derived(this, (reader) => {
      const viewState = this._viewState.read(reader);
      if (!viewState || !this._isVisibleDelayed.read(reader)) {
        return void 0;
      }
      const continousLineRanges = this._lineSizesAroundHintPosition.read(reader);
      if (continousLineRanges.length === 0) {
        return void 0;
      }
      const editorScrollTop = this._editorObs.scrollTop.read(reader);
      const editorScrollLeft = this._editorObs.scrollLeft.read(reader);
      const editorLayout = this._editorObs.layoutInfo.read(reader);
      const previewContentHeight = this._previewEditor.contentHeight.read(reader);
      const previewEditorContentLayout = this._previewEditor.horizontalContentRangeInPreviewEditorToShow.read(reader);
      if (!previewContentHeight || !previewEditorContentLayout) {
        return void 0;
      }
      const editorTrueContentWidth = editorLayout.contentWidth - editorLayout.verticalScrollbarWidth;
      const editorTrueContentRight = editorLayout.contentLeft + editorTrueContentWidth;
      const c = this._editorObs.cursorLineNumber.read(reader);
      if (!c) {
        return void 0;
      }
      const layoutConstants = DEFAULT_WIDGET_LAYOUT_CONSTANTS;
      const extraGutterMarginToAvoidScrollBar = 2;
      const previewEditorHeight = previewContentHeight + extraGutterMarginToAvoidScrollBar;
      let possibleWidgetOutline;
      let lastPlacementContext;
      const endOfLinePadding = (lineNumber) => lineNumber === viewState.hint.lineNumber ? 40 : 20;
      for (const continousLineRange of continousLineRanges) {
        const placementContext = new WidgetPlacementContext(
          continousLineRange,
          editorTrueContentWidth,
          endOfLinePadding
        );
        lastPlacementContext = placementContext;
        const showRects = false;
        if (showRects) {
          const rects2 = stackSizesDown(
            new Point(editorTrueContentRight, continousLineRange.top - editorScrollTop),
            placementContext.availableSpaceSizes,
            "right"
          );
          debugView(debugLogRects({ ...rects2 }, this._editor.getDomNode()), reader);
        }
        possibleWidgetOutline = placementContext.tryFindWidgetOutline(
          viewState.hint.lineNumber,
          previewEditorHeight,
          editorTrueContentRight,
          layoutConstants
        );
        if (possibleWidgetOutline) {
          break;
        }
      }
      let position = "empty-space";
      if (!possibleWidgetOutline) {
        position = "overlay";
        const maxAvailableWidth = Math.min(editorLayout.width - editorLayout.contentLeft, MAX_WIDGET_WIDTH.OVERLAY);
        const fallbackPlacementContext = lastPlacementContext ?? new WidgetPlacementContext(
          continousLineRanges[0],
          editorTrueContentWidth,
          endOfLinePadding
        );
        possibleWidgetOutline = {
          horizontalWidgetRange: OffsetRange.ofStartAndLength(editorTrueContentRight - maxAvailableWidth, maxAvailableWidth),
          verticalWidgetRange: fallbackPlacementContext.getWidgetVerticalOutline(
            viewState.hint.lineNumber + 2,
            previewEditorHeight,
            layoutConstants
          ).delta(10)
        };
      }
      if (!possibleWidgetOutline) {
        return void 0;
      }
      const rectAvailableSpace = Rect.fromRanges(
        possibleWidgetOutline.horizontalWidgetRange,
        possibleWidgetOutline.verticalWidgetRange
      ).translateX(-editorScrollLeft).translateY(-editorScrollTop);
      const showAvailableSpace = false;
      if (showAvailableSpace) {
        debugView(debugLogRects({ rectAvailableSpace }, this._editor.getDomNode()), reader);
      }
      const { previewEditorMargin, widgetPadding, widgetBorder, lowerBarHeight } = layoutConstants;
      const maxWidgetWidthUpperBound = position === "overlay" ? MAX_WIDGET_WIDTH.OVERLAY : MAX_WIDGET_WIDTH.EMPTY_SPACE;
      const contentBasedWidgetWidth = previewEditorContentLayout.maxEditorWidth + previewEditorMargin + widgetPadding;
      const maxWidgetWidth = Math.min(maxWidgetWidthUpperBound, Math.max(contentBasedWidgetWidth, layoutConstants.minWidgetWidth));
      const layout = distributeFlexBoxLayout(rectAvailableSpace.width, {
        spaceBefore: { min: 0, max: 10, priority: 1 },
        content: { min: 50, rules: [{ max: 150, priority: 2 }, { max: maxWidgetWidth, priority: 1 }] },
        spaceAfter: { min: 10 }
      });
      if (!layout) {
        return null;
      }
      const ranges = lengthsToOffsetRanges([layout.spaceBefore, layout.content, layout.spaceAfter], rectAvailableSpace.left);
      const spaceBeforeRect = rectAvailableSpace.withHorizontalRange(ranges[0]);
      const widgetRect = rectAvailableSpace.withHorizontalRange(ranges[1]);
      const spaceAfterRect = rectAvailableSpace.withHorizontalRange(ranges[2]);
      const showRects2 = false;
      if (showRects2) {
        debugView(debugLogRects({ spaceBeforeRect, widgetRect, spaceAfterRect }, this._editor.getDomNode()), reader);
      }
      const previewEditorRect = widgetRect.withMargin(-widgetPadding - widgetBorder - previewEditorMargin).withMargin(0, 0, -lowerBarHeight, 0);
      const showEditorRect = false;
      if (showEditorRect) {
        debugView(debugLogRects({ previewEditorRect }, this._editor.getDomNode()), reader);
      }
      const previewEditorContentWidth = previewEditorRect.width - previewEditorContentLayout.nonContentWidth;
      const maxPrefferedRangeLength = previewEditorContentWidth * 0.8;
      const preferredRangeToReveal = previewEditorContentLayout.preferredRangeToReveal.intersect(OffsetRange.ofStartAndLength(
        previewEditorContentLayout.preferredRangeToReveal.start,
        maxPrefferedRangeLength
      )) ?? previewEditorContentLayout.preferredRangeToReveal;
      const desiredPreviewEditorScrollLeft = scrollToReveal(previewEditorContentLayout.indentationEnd, previewEditorContentWidth, preferredRangeToReveal);
      return {
        codeEditorSize: previewEditorRect.getSize(),
        codeScrollLeft: editorScrollLeft,
        contentLeft: editorLayout.contentLeft,
        widgetRect,
        previewEditorMargin,
        widgetPadding,
        widgetBorder,
        lowerBarHeight,
        desiredPreviewEditorScrollLeft: desiredPreviewEditorScrollLeft.newScrollPosition
      };
    });
    this._view = n.div({
      class: "inline-edits-view",
      style: {
        position: "absolute",
        overflow: "visible",
        top: "0px",
        left: "0px",
        display: derived(this, (reader) => !!this._previewEditorLayoutInfo.read(reader) ? "block" : "none")
      }
    }, [
      derived(this, (_reader) => [this._widgetContent])
    ]);
    this._widgetContent = derived(
      this,
      (reader) => (
        // TODO@hediet: remove when n.div lazily creates previewEditor.element node
        n.div({
          class: ["inline-edits-long-distance-hint-widget", "show-file-icons"],
          style: {
            position: "absolute",
            overflow: "hidden",
            cursor: "pointer",
            background: asCssVariable(editorWidgetBackground),
            padding: this._previewEditorLayoutInfo.map((i) => i?.widgetPadding),
            boxSizing: "border-box",
            borderRadius: BORDER_RADIUS,
            border: derived((reader2) => `${this._previewEditorLayoutInfo.read(reader2)?.widgetBorder}px solid ${this._styles.read(reader2).border}`),
            display: "flex",
            flexDirection: "column",
            opacity: derived((reader2) => this._viewState.read(reader2)?.hint.isVisible ? "1" : "0"),
            transition: "opacity 200ms ease-in-out",
            ...rectToProps((reader2) => this._previewEditorLayoutInfo.read(reader2)?.widgetRect)
          },
          onmousedown: (e) => {
            e.preventDefault();
          },
          onclick: () => {
            this._viewState.read(void 0)?.model.jump();
          }
        }, [
          n.div({
            class: ["editorContainer"],
            style: {
              overflow: "hidden",
              padding: this._previewEditorLayoutInfo.map((i) => i?.previewEditorMargin),
              background: this._styles.map((s) => s.background),
              pointerEvents: "none"
            }
          }, [
            derived(this, (r) => this._previewEditor.element)
            // --
          ]),
          n.div({ class: "bar", style: { color: asCssVariable(descriptionForeground), pointerEvents: "none", margin: "0 4px", height: this._previewEditorLayoutInfo.map((i) => i?.lowerBarHeight), display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
            derived(this, (reader2) => {
              const children = [];
              const viewState = this._viewState.read(reader2);
              if (!viewState) {
                return children;
              }
              const currentModel = this._editorObs.model.read(reader2);
              const targetUri = viewState.target.uri;
              const isCrossFileEdit = !currentModel || !viewState.target.targets(currentModel);
              if (isCrossFileEdit) {
                const fileName = basename(targetUri);
                const iconClasses = getIconClasses(this._modelService, this._languageService, targetUri, FileKind.FILE);
                children.push(n.div({
                  class: "target-file",
                  style: { display: "flex", alignItems: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                }, [
                  n.elem("span", { class: iconClasses, style: { flexShrink: "0", marginRight: "4px" } }),
                  fileName
                ]));
              } else {
                const source = this._originalOutlineSource.read(reader2);
                const originalTargetLineNumber2 = this._originalTargetLineNumber.read(reader2);
                const outlineItems = source?.getAt(originalTargetLineNumber2, reader2).slice(0, 1) ?? [];
                const outlineElements = [];
                if (outlineItems.length > 0) {
                  for (let i = 0; i < outlineItems.length; i++) {
                    const item = outlineItems[i];
                    const icon = SymbolKinds.toIcon(item.kind);
                    outlineElements.push(n.div({
                      class: "breadcrumb-item",
                      style: { display: "flex", alignItems: "center", flex: "1 1 auto", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
                    }, [
                      renderIcon(icon),
                      "\xA0",
                      item.name,
                      ...i === outlineItems.length - 1 ? [] : [renderIcon(Codicon.chevronRight)]
                    ]));
                  }
                }
                children.push(n.div({ class: "outline-elements", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, outlineElements));
              }
              const originalTargetLineNumber = this._originalTargetLineNumber.read(reader2);
              const arrowIcon = isCrossFileEdit ? Codicon.arrowRight : viewState.hint.lineNumber < originalTargetLineNumber ? Codicon.arrowDown : Codicon.arrowUp;
              const keybinding = this._keybindingService.lookupKeybinding(jumpToNextInlineEditId);
              let label = isCrossFileEdit ? "Go to file" : "Go to suggestion";
              if (keybinding && keybinding.getLabel() === "Tab") {
                label = isCrossFileEdit ? "Tab to open" : "Tab to jump";
              }
              children.push(n.div({
                class: "go-to-label",
                style: { position: "relative", display: "flex", alignItems: "center", flex: "0 0 auto", paddingLeft: "6px" }
              }, [
                label,
                "\xA0",
                renderIcon(arrowIcon)
              ]));
              return children;
            })
          ])
        ])
      )
    );
    // Drives breadcrumbs and symbol icon
    this._originalTargetLineNumber = derived(this, (reader) => {
      const viewState = this._viewState.read(reader);
      if (!viewState) {
        return -1;
      }
      if (viewState.edit.action?.kind === "jumpTo") {
        return viewState.edit.action.position.lineNumber;
      }
      return viewState.diff[0]?.original.startLineNumber ?? -1;
    });
    this._originalOutlineSource = derivedDisposable(this, (reader) => {
      const m = this._editorObs.model.read(reader);
      const factory = HideUnchangedRegionsFeature._breadcrumbsSourceFactory.read(reader);
      return !m || !factory ? void 0 : factory(m, this._instantiationService);
    });
    this._styles = derived((reader) => {
      const v = this._tabAction.read(reader);
      const widgetBorderColor = observeColor(editorWidgetBorder, this._themeService).read(reader);
      const isHighContrast = observableFromEvent(this._themeService.onDidColorThemeChange, () => {
        const theme = this._themeService.getColorTheme();
        return theme.type === "hcDark" || theme.type === "hcLight";
      }).read(reader);
      let borderColor;
      if (isHighContrast) {
        borderColor = widgetBorderColor;
      } else {
        let border;
        switch (v) {
          case InlineEditTabAction.Inactive:
            border = inlineEditIndicatorSecondaryBackground;
            break;
          case InlineEditTabAction.Jump:
            border = inlineEditIndicatorPrimaryBackground;
            break;
          case InlineEditTabAction.Accept:
            border = inlineEditIndicatorSuccessfulBackground;
            break;
        }
        borderColor = getEditorBlendedColor(border, this._themeService).read(reader);
      }
      return {
        border: borderColor.toString(),
        background: getEditorBackgroundColor(this._viewState.map((s) => s?.editorType ?? InlineCompletionEditorType.TextEditor).read(reader))
      };
    });
    this._editorObs = observableCodeEditor(this._editor);
    this._previewEditor = this._register(
      this._instantiationService.createInstance(
        LongDistancePreviewEditor,
        this._previewTextModel,
        derived((reader) => {
          const viewState = this._viewState.read(reader);
          if (!viewState) {
            return void 0;
          }
          return {
            diff: viewState.diff,
            model: viewState.model,
            inlineSuggestInfo: viewState.inlineSuggestInfo,
            nextCursorPosition: viewState.nextCursorPosition,
            target: viewState.target
          };
        }),
        this._editor,
        this._tabAction
      )
    );
    this._viewWithElement = this._view.keepUpdated(this._store);
    this._register(this._editorObs.createOverlayWidget({
      domNode: this._viewWithElement.element,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: constObservable(0)
    }));
    this._widgetContent.get().keepUpdated(this._store);
    this._register(autorun((reader) => {
      const layoutInfo = this._previewEditorLayoutInfo.read(reader);
      if (!layoutInfo) {
        return;
      }
      this._previewEditor.layout(layoutInfo.codeEditorSize.toDimension(), layoutInfo.desiredPreviewEditorScrollLeft);
    }));
    this._isVisibleDelayed.recomputeInitiallyAndOnChange(this._store);
  }
  get isHovered() {
    return this._widgetContent.get().didMouseMoveDuringHover;
  }
};
InlineEditsLongDistanceHint = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IModelService),
  __decorateParam(8, ILanguageService)
], InlineEditsLongDistanceHint);
function lengthsToOffsetRanges(lengths, initialOffset = 0) {
  const result = [];
  let offset = initialOffset;
  for (const length of lengths) {
    result.push(new OffsetRange(offset, offset + length));
    offset += length;
  }
  return result;
}
function stackSizesDown(at, sizes, alignment = "left") {
  const rects = [];
  let offset = 0;
  for (const s of sizes) {
    rects.push(
      Rect.fromLeftTopWidthHeight(
        at.x + (alignment === "left" ? 0 : -s.width),
        at.y + offset,
        s.width,
        s.height
      )
    );
    offset += s.height;
  }
  return rects;
}
function drawEditorWidths(e, reader) {
  const layoutInfo = e.getLayoutInfo();
  const contentLeft = new OffsetRange(0, layoutInfo.contentLeft);
  const trueContent = OffsetRange.ofStartAndLength(layoutInfo.contentLeft, layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth);
  const minimap = OffsetRange.ofStartAndLength(trueContent.endExclusive, layoutInfo.minimap.minimapWidth);
  const verticalScrollbar = OffsetRange.ofStartAndLength(minimap.endExclusive, layoutInfo.verticalScrollbarWidth);
  const r = new OffsetRange(0, 200);
  debugView(debugLogHorizontalOffsetRanges({
    contentLeft: Rect.fromRanges(contentLeft, r),
    trueContent: Rect.fromRanges(trueContent, r),
    minimap: Rect.fromRanges(minimap, r),
    verticalScrollbar: Rect.fromRanges(verticalScrollbar, r)
  }, e.getDomNode()), reader);
}
function scrollToReveal(currentScrollPosition, windowWidth, contentRangeToReveal) {
  const visibleRange = new OffsetRange(currentScrollPosition, currentScrollPosition + windowWidth);
  if (visibleRange.containsRange(contentRangeToReveal)) {
    return { newScrollPosition: currentScrollPosition };
  }
  if (contentRangeToReveal.length > windowWidth) {
    return { newScrollPosition: contentRangeToReveal.start };
  }
  if (contentRangeToReveal.endExclusive > visibleRange.endExclusive) {
    return { newScrollPosition: contentRangeToReveal.endExclusive - windowWidth };
  }
  if (contentRangeToReveal.start < visibleRange.start) {
    return { newScrollPosition: contentRangeToReveal.start };
  }
  return { newScrollPosition: currentScrollPosition };
}
export {
  InlineEditsLongDistanceHint,
  drawEditorWidths,
  scrollToReveal
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3c1xcbG9uZ0Rpc3RhbmNlSGludFxcaW5saW5lRWRpdHNMb25nRGlzdGFuY2VIaW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IENoaWxkTm9kZSwgbiwgT2JzZXJ2ZXJOb2RlLCBPYnNlcnZlck5vZGVXaXRoRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJUmVhZGVyLCBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlYm91bmNlZE9ic2VydmFibGUyLCBkZXJpdmVkLCBkZXJpdmVkRGlzcG9zYWJsZSwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgUmVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3JlY3QuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElJbmxpbmVFZGl0c1ZpZXcsIElubGluZUVkaXRUYWJBY3Rpb24gfSBmcm9tICcuLi8uLi9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdFdpdGhDaGFuZ2VzIH0gZnJvbSAnLi4vLi4vaW5saW5lRWRpdFdpdGhDaGFuZ2VzLmpzJztcbmltcG9ydCB7IGdldENvbnRlbnRTaXplT2ZMaW5lcywgcmVjdFRvUHJvcHMgfSBmcm9tICcuLi8uLi91dGlscy91dGlscy5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBIaWRlVW5jaGFuZ2VkUmVnaW9uc0ZlYXR1cmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2ZlYXR1cmVzL2hpZGVVbmNoYW5nZWRSZWdpb25zRmVhdHVyZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBTeW1ib2xLaW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgZGVidWdMb2dIb3Jpem9udGFsT2Zmc2V0UmFuZ2VzLCBkZWJ1Z0xvZ1JlY3RzLCBkZWJ1Z1ZpZXcgfSBmcm9tICcuLi9kZWJ1Z1Zpc3VhbGl6YXRpb24uanMnO1xuaW1wb3J0IHsgZGlzdHJpYnV0ZUZsZXhCb3hMYXlvdXQgfSBmcm9tICcuLi8uLi91dGlscy9mbGV4Qm94TGF5b3V0LmpzJztcbmltcG9ydCB7IFBvaW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvcG9pbnQuanMnO1xuaW1wb3J0IHsgU2l6ZTJEIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvc2l6ZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IGdldEVkaXRvckJhY2tncm91bmRDb2xvciwgZ2V0RWRpdG9yQmxlbmRlZENvbG9yLCBpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJhY2tncm91bmQsIGlubGluZUVkaXRJbmRpY2F0b3JTZWNvbmRhcnlCYWNrZ3JvdW5kLCBpbmxpbmVFZGl0SW5kaWNhdG9yU3VjY2Vzc2Z1bEJhY2tncm91bmQsIG9ic2VydmVDb2xvciB9IGZyb20gJy4uLy4uL3RoZW1lLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUsIGRlc2NyaXB0aW9uRm9yZWdyb3VuZCwgZWRpdG9yV2lkZ2V0QmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGVkaXRvcldpZGdldEJvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvZWRpdG9yQ29sb3JzLmpzJztcbmltcG9ydCB7IElMb25nRGlzdGFuY2VQcmV2aWV3UHJvcHMsIExvbmdEaXN0YW5jZVByZXZpZXdFZGl0b3IgfSBmcm9tICcuL2xvbmdEaXN0YW5jZVByZXZpZXdFZGl0b3IuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhLCBTaW1wbGVJbmxpbmVTdWdnZXN0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21wb25lbnRzL2d1dHRlckluZGljYXRvclZpZXcuanMnO1xuaW1wb3J0IHsganVtcFRvTmV4dElubGluZUVkaXRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyb2xsZXIvY29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBzcGxpdEludG9Db250aW51b3VzTGluZVJhbmdlcywgV2lkZ2V0TGF5b3V0Q29uc3RhbnRzLCBXaWRnZXRPdXRsaW5lLCBXaWRnZXRQbGFjZW1lbnRDb250ZXh0IH0gZnJvbSAnLi9sb25nRGlzdG5hY2VXaWRnZXRQbGFjZW1lbnQuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9tb2RlbC9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3NlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL21vZGVsL3RleHRNb2RlbFZhbHVlUmVmZXJlbmNlLmpzJztcblxuY29uc3QgQk9SREVSX1JBRElVUyA9IDY7XG5jb25zdCBNQVhfV0lER0VUX1dJRFRIID0geyBFTVBUWV9TUEFDRTogNDI1LCBPVkVSTEFZOiAzNzUgfTtcbmNvbnN0IE1JTl9XSURHRVRfV0lEVEggPSAyNTA7XG5cbmNvbnN0IERFRkFVTFRfV0lER0VUX0xBWU9VVF9DT05TVEFOVFM6IFdpZGdldExheW91dENvbnN0YW50cyA9IHtcblx0cHJldmlld0VkaXRvck1hcmdpbjogMixcblx0d2lkZ2V0UGFkZGluZzogMixcblx0d2lkZ2V0Qm9yZGVyOiAxLFxuXHRsb3dlckJhckhlaWdodDogMjAsXG5cdG1pbldpZGdldFdpZHRoOiBNSU5fV0lER0VUX1dJRFRILFxufTtcblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRzTG9uZ0Rpc3RhbmNlSGludCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSW5saW5lRWRpdHNWaWV3IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JPYnM7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2sgPSBFdmVudC5Ob25lO1xuXHRwcml2YXRlIF92aWV3V2l0aEVsZW1lbnQ6IE9ic2VydmVyTm9kZVdpdGhFbGVtZW50PEhUTUxEaXZFbGVtZW50PiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aWV3RWRpdG9yO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld1N0YXRlOiBJT2JzZXJ2YWJsZTxJTG9uZ0Rpc3RhbmNlVmlld1N0YXRlIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aWV3VGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhYkFjdGlvbjogSU9ic2VydmFibGU8SW5saW5lRWRpdFRhYkFjdGlvbj4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3N0eWxlcyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHYgPSB0aGlzLl90YWJBY3Rpb24ucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBDaGVjayB0aGVtZSB0eXBlIGJ5IG9ic2VydmluZyBhIGNvbG9yIC0gdGhpcyBlbnN1cmVzIHdlIHJlYWN0IHRvIHRoZW1lIGNoYW5nZXNcblx0XHRcdGNvbnN0IHdpZGdldEJvcmRlckNvbG9yID0gb2JzZXJ2ZUNvbG9yKGVkaXRvcldpZGdldEJvcmRlciwgdGhpcy5fdGhlbWVTZXJ2aWNlKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc0hpZ2hDb250cmFzdCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5fdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0aGVtZSA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0XHRcdHJldHVybiB0aGVtZS50eXBlID09PSAnaGNEYXJrJyB8fCB0aGVtZS50eXBlID09PSAnaGNMaWdodCc7XG5cdFx0XHR9KS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGxldCBib3JkZXJDb2xvcjtcblx0XHRcdGlmIChpc0hpZ2hDb250cmFzdCkge1xuXHRcdFx0XHQvLyBVc2UgZWRpdG9yV2lkZ2V0Qm9yZGVyIGluIGhpZ2ggY29udHJhc3QgbW9kZSBmb3IgYmV0dGVyIHZpc2liaWxpdHlcblx0XHRcdFx0Ym9yZGVyQ29sb3IgPSB3aWRnZXRCb3JkZXJDb2xvcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBib3JkZXI7XG5cdFx0XHRcdHN3aXRjaCAodikge1xuXHRcdFx0XHRcdGNhc2UgSW5saW5lRWRpdFRhYkFjdGlvbi5JbmFjdGl2ZTogYm9yZGVyID0gaW5saW5lRWRpdEluZGljYXRvclNlY29uZGFyeUJhY2tncm91bmQ7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgSW5saW5lRWRpdFRhYkFjdGlvbi5KdW1wOiBib3JkZXIgPSBpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJhY2tncm91bmQ7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgSW5saW5lRWRpdFRhYkFjdGlvbi5BY2NlcHQ6IGJvcmRlciA9IGlubGluZUVkaXRJbmRpY2F0b3JTdWNjZXNzZnVsQmFja2dyb3VuZDsgYnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ym9yZGVyQ29sb3IgPSBnZXRFZGl0b3JCbGVuZGVkQ29sb3IoYm9yZGVyLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Ym9yZGVyOiBib3JkZXJDb2xvci50b1N0cmluZygpLFxuXHRcdFx0XHRiYWNrZ3JvdW5kOiBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3IodGhpcy5fdmlld1N0YXRlLm1hcChzID0+IHM/LmVkaXRvclR5cGUgPz8gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuVGV4dEVkaXRvcikucmVhZChyZWFkZXIpKSxcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9lZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLl9lZGl0b3IpO1xuXG5cdFx0dGhpcy5fcHJldmlld0VkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdExvbmdEaXN0YW5jZVByZXZpZXdFZGl0b3IsXG5cdFx0XHRcdHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwsXG5cdFx0XHRcdGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCB2aWV3U3RhdGUgPSB0aGlzLl92aWV3U3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGlmICghdmlld1N0YXRlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZGlmZjogdmlld1N0YXRlLmRpZmYsXG5cdFx0XHRcdFx0XHRtb2RlbDogdmlld1N0YXRlLm1vZGVsLFxuXHRcdFx0XHRcdFx0aW5saW5lU3VnZ2VzdEluZm86IHZpZXdTdGF0ZS5pbmxpbmVTdWdnZXN0SW5mbyxcblx0XHRcdFx0XHRcdG5leHRDdXJzb3JQb3NpdGlvbjogdmlld1N0YXRlLm5leHRDdXJzb3JQb3NpdGlvbixcblx0XHRcdFx0XHRcdHRhcmdldDogdmlld1N0YXRlLnRhcmdldCxcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJTG9uZ0Rpc3RhbmNlUHJldmlld1Byb3BzO1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0XHR0aGlzLl90YWJBY3Rpb24sXG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdHRoaXMuX3ZpZXdXaXRoRWxlbWVudCA9IHRoaXMuX3ZpZXcua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvck9icy5jcmVhdGVPdmVybGF5V2lkZ2V0KHtcblx0XHRcdGRvbU5vZGU6IHRoaXMuX3ZpZXdXaXRoRWxlbWVudC5lbGVtZW50LFxuXHRcdFx0cG9zaXRpb246IGNvbnN0T2JzZXJ2YWJsZShudWxsKSxcblx0XHRcdGFsbG93RWRpdG9yT3ZlcmZsb3c6IGZhbHNlLFxuXHRcdFx0bWluQ29udGVudFdpZHRoSW5QeDogY29uc3RPYnNlcnZhYmxlKDApLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dpZGdldENvbnRlbnQuZ2V0KCkua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbGF5b3V0SW5mbykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcmV2aWV3RWRpdG9yLmxheW91dChsYXlvdXRJbmZvLmNvZGVFZGl0b3JTaXplLnRvRGltZW5zaW9uKCksIGxheW91dEluZm8uZGVzaXJlZFByZXZpZXdFZGl0b3JTY3JvbGxMZWZ0KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9pc1Zpc2libGVEZWxheWVkLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0eWxlcztcblxuXHRwdWJsaWMgZ2V0IGlzSG92ZXJlZCgpIHsgcmV0dXJuIHRoaXMuX3dpZGdldENvbnRlbnQuZ2V0KCkuZGlkTW91c2VNb3ZlRHVyaW5nSG92ZXI7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oaW50VGV4dFBvc2l0aW9uID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5fdmlld1N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gdmlld1N0YXRlID8gbmV3IFBvc2l0aW9uKHZpZXdTdGF0ZS5oaW50LmxpbmVOdW1iZXIsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSA6IG51bGw7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVTaXplc0Fyb3VuZEhpbnRQb3NpdGlvbiA9IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMuX3ZpZXdTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgcCA9IHRoaXMuX2hpbnRUZXh0UG9zaXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdGlmICghdmlld1N0YXRlIHx8ICFwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3JPYnMubW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2UgPSBMaW5lUmFuZ2Uub2ZMZW5ndGgocC5saW5lTnVtYmVyLCAxKS5hZGRNYXJnaW4oNSwgNSkuaW50ZXJzZWN0KExpbmVSYW5nZS5vZkxlbmd0aCgxLCBtb2RlbC5nZXRMaW5lQ291bnQoKSkpO1xuXG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpemVzID0gZ2V0Q29udGVudFNpemVPZkxpbmVzKHRoaXMuX2VkaXRvck9icywgcmFuZ2UsIHJlYWRlcik7XG5cdFx0Y29uc3QgdG9wID0gdGhpcy5fZWRpdG9yT2JzLm9ic2VydmVUb3BGb3JMaW5lTnVtYmVyKHJhbmdlLnN0YXJ0TGluZU51bWJlcikucmVhZChyZWFkZXIpO1xuXG5cdFx0cmV0dXJuIHNwbGl0SW50b0NvbnRpbnVvdXNMaW5lUmFuZ2VzKHJhbmdlLCBzaXplcywgdG9wLCB0aGlzLl9lZGl0b3JPYnMsIHJlYWRlcik7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzVmlzaWJsZURlbGF5ZWQgPSBkZWJvdW5jZWRPYnNlcnZhYmxlMihcblx0XHRkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl92aWV3U3RhdGUucmVhZChyZWFkZXIpPy5oaW50LmlzVmlzaWJsZSksXG5cdFx0KGxhc3RWYWx1ZSwgbmV3VmFsdWUpID0+IGxhc3RWYWx1ZSA9PT0gdHJ1ZSAmJiBuZXdWYWx1ZSA9PT0gZmFsc2UgPyAyMDAgOiAwLFxuXHQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5fdmlld1N0YXRlLnJlYWQocmVhZGVyKTtcblxuXHRcdGlmICghdmlld1N0YXRlIHx8ICF0aGlzLl9pc1Zpc2libGVEZWxheWVkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjb250aW5vdXNMaW5lUmFuZ2VzID0gdGhpcy5fbGluZVNpemVzQXJvdW5kSGludFBvc2l0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoY29udGlub3VzTGluZVJhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yU2Nyb2xsVG9wID0gdGhpcy5fZWRpdG9yT2JzLnNjcm9sbFRvcC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZWRpdG9yU2Nyb2xsTGVmdCA9IHRoaXMuX2VkaXRvck9icy5zY3JvbGxMZWZ0LnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBlZGl0b3JMYXlvdXQgPSB0aGlzLl9lZGl0b3JPYnMubGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCBwcmV2aWV3Q29udGVudEhlaWdodCA9IHRoaXMuX3ByZXZpZXdFZGl0b3IuY29udGVudEhlaWdodC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgcHJldmlld0VkaXRvckNvbnRlbnRMYXlvdXQgPSB0aGlzLl9wcmV2aWV3RWRpdG9yLmhvcml6b250YWxDb250ZW50UmFuZ2VJblByZXZpZXdFZGl0b3JUb1Nob3cucmVhZChyZWFkZXIpO1xuXG5cdFx0aWYgKCFwcmV2aWV3Q29udGVudEhlaWdodCB8fCAhcHJldmlld0VkaXRvckNvbnRlbnRMYXlvdXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gY29uc3QgZGVidWdSZWN0cyA9IHN0YWNrU2l6ZXNEb3duKG5ldyBQb2ludChlZGl0b3JMYXlvdXQuY29udGVudExlZnQsIGxpbmVTaXplcy50b3AgLSBzY3JvbGxUb3ApLCBsaW5lU2l6ZXMuc2l6ZXMpO1xuXG5cdFx0Y29uc3QgZWRpdG9yVHJ1ZUNvbnRlbnRXaWR0aCA9IGVkaXRvckxheW91dC5jb250ZW50V2lkdGggLSBlZGl0b3JMYXlvdXQudmVydGljYWxTY3JvbGxiYXJXaWR0aDtcblx0XHRjb25zdCBlZGl0b3JUcnVlQ29udGVudFJpZ2h0ID0gZWRpdG9yTGF5b3V0LmNvbnRlbnRMZWZ0ICsgZWRpdG9yVHJ1ZUNvbnRlbnRXaWR0aDtcblxuXHRcdC8vIGRyYXdFZGl0b3JXaWR0aHModGhpcy5fZWRpdG9yLCByZWFkZXIpO1xuXG5cdFx0Y29uc3QgYyA9IHRoaXMuX2VkaXRvck9icy5jdXJzb3JMaW5lTnVtYmVyLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIWMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGF5b3V0Q29uc3RhbnRzID0gREVGQVVMVF9XSURHRVRfTEFZT1VUX0NPTlNUQU5UUztcblx0XHRjb25zdCBleHRyYUd1dHRlck1hcmdpblRvQXZvaWRTY3JvbGxCYXIgPSAyO1xuXHRcdGNvbnN0IHByZXZpZXdFZGl0b3JIZWlnaHQgPSBwcmV2aWV3Q29udGVudEhlaWdodCArIGV4dHJhR3V0dGVyTWFyZ2luVG9Bdm9pZFNjcm9sbEJhcjtcblxuXHRcdC8vIFRyeSB0byBmaW5kIHdpZGdldCBwbGFjZW1lbnQgaW4gYXZhaWxhYmxlIGVtcHR5IHNwYWNlXG5cdFx0bGV0IHBvc3NpYmxlV2lkZ2V0T3V0bGluZTogV2lkZ2V0T3V0bGluZSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbGFzdFBsYWNlbWVudENvbnRleHQ6IFdpZGdldFBsYWNlbWVudENvbnRleHQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBlbmRPZkxpbmVQYWRkaW5nID0gKGxpbmVOdW1iZXI6IG51bWJlcikgPT4gbGluZU51bWJlciA9PT0gdmlld1N0YXRlLmhpbnQubGluZU51bWJlciA/IDQwIDogMjA7XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRpbm91c0xpbmVSYW5nZSBvZiBjb250aW5vdXNMaW5lUmFuZ2VzKSB7XG5cdFx0XHRjb25zdCBwbGFjZW1lbnRDb250ZXh0ID0gbmV3IFdpZGdldFBsYWNlbWVudENvbnRleHQoXG5cdFx0XHRcdGNvbnRpbm91c0xpbmVSYW5nZSxcblx0XHRcdFx0ZWRpdG9yVHJ1ZUNvbnRlbnRXaWR0aCxcblx0XHRcdFx0ZW5kT2ZMaW5lUGFkZGluZ1xuXHRcdFx0KTtcblx0XHRcdGxhc3RQbGFjZW1lbnRDb250ZXh0ID0gcGxhY2VtZW50Q29udGV4dDtcblxuXHRcdFx0Y29uc3Qgc2hvd1JlY3RzID0gZmFsc2U7XG5cdFx0XHRpZiAoc2hvd1JlY3RzKSB7XG5cdFx0XHRcdGNvbnN0IHJlY3RzMiA9IHN0YWNrU2l6ZXNEb3duKFxuXHRcdFx0XHRcdG5ldyBQb2ludChlZGl0b3JUcnVlQ29udGVudFJpZ2h0LCBjb250aW5vdXNMaW5lUmFuZ2UudG9wIC0gZWRpdG9yU2Nyb2xsVG9wKSxcblx0XHRcdFx0XHRwbGFjZW1lbnRDb250ZXh0LmF2YWlsYWJsZVNwYWNlU2l6ZXMgYXMgU2l6ZTJEW10sXG5cdFx0XHRcdFx0J3JpZ2h0J1xuXHRcdFx0XHQpO1xuXHRcdFx0XHRkZWJ1Z1ZpZXcoZGVidWdMb2dSZWN0cyh7IC4uLnJlY3RzMiB9LCB0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpISksIHJlYWRlcik7XG5cdFx0XHR9XG5cblx0XHRcdHBvc3NpYmxlV2lkZ2V0T3V0bGluZSA9IHBsYWNlbWVudENvbnRleHQudHJ5RmluZFdpZGdldE91dGxpbmUoXG5cdFx0XHRcdHZpZXdTdGF0ZS5oaW50LmxpbmVOdW1iZXIsXG5cdFx0XHRcdHByZXZpZXdFZGl0b3JIZWlnaHQsXG5cdFx0XHRcdGVkaXRvclRydWVDb250ZW50UmlnaHQsXG5cdFx0XHRcdGxheW91dENvbnN0YW50c1xuXHRcdFx0KTtcblxuXHRcdFx0aWYgKHBvc3NpYmxlV2lkZ2V0T3V0bGluZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGYWxsYmFjayB0byBvdmVybGF5IHBvc2l0aW9uIGlmIG5vIGVtcHR5IHNwYWNlIHdhcyBmb3VuZFxuXHRcdGxldCBwb3NpdGlvbjogJ292ZXJsYXknIHwgJ2VtcHR5LXNwYWNlJyA9ICdlbXB0eS1zcGFjZSc7XG5cdFx0aWYgKCFwb3NzaWJsZVdpZGdldE91dGxpbmUpIHtcblx0XHRcdHBvc2l0aW9uID0gJ292ZXJsYXknO1xuXHRcdFx0Y29uc3QgbWF4QXZhaWxhYmxlV2lkdGggPSBNYXRoLm1pbihlZGl0b3JMYXlvdXQud2lkdGggLSBlZGl0b3JMYXlvdXQuY29udGVudExlZnQsIE1BWF9XSURHRVRfV0lEVEguT1ZFUkxBWSk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIGZhbGxiYWNrIHBsYWNlbWVudCBjb250ZXh0IGZvciBjb21wdXRpbmcgb3ZlcmxheSB2ZXJ0aWNhbCBwb3NpdGlvblxuXHRcdFx0Y29uc3QgZmFsbGJhY2tQbGFjZW1lbnRDb250ZXh0ID0gbGFzdFBsYWNlbWVudENvbnRleHQgPz8gbmV3IFdpZGdldFBsYWNlbWVudENvbnRleHQoXG5cdFx0XHRcdGNvbnRpbm91c0xpbmVSYW5nZXNbMF0sXG5cdFx0XHRcdGVkaXRvclRydWVDb250ZW50V2lkdGgsXG5cdFx0XHRcdGVuZE9mTGluZVBhZGRpbmcsXG5cdFx0XHQpO1xuXG5cdFx0XHRwb3NzaWJsZVdpZGdldE91dGxpbmUgPSB7XG5cdFx0XHRcdGhvcml6b250YWxXaWRnZXRSYW5nZTogT2Zmc2V0UmFuZ2Uub2ZTdGFydEFuZExlbmd0aChlZGl0b3JUcnVlQ29udGVudFJpZ2h0IC0gbWF4QXZhaWxhYmxlV2lkdGgsIG1heEF2YWlsYWJsZVdpZHRoKSxcblx0XHRcdFx0dmVydGljYWxXaWRnZXRSYW5nZTogZmFsbGJhY2tQbGFjZW1lbnRDb250ZXh0LmdldFdpZGdldFZlcnRpY2FsT3V0bGluZShcblx0XHRcdFx0XHR2aWV3U3RhdGUuaGludC5saW5lTnVtYmVyICsgMixcblx0XHRcdFx0XHRwcmV2aWV3RWRpdG9ySGVpZ2h0LFxuXHRcdFx0XHRcdGxheW91dENvbnN0YW50c1xuXHRcdFx0XHQpLmRlbHRhKDEwKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKCFwb3NzaWJsZVdpZGdldE91dGxpbmUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVjdEF2YWlsYWJsZVNwYWNlID0gUmVjdC5mcm9tUmFuZ2VzKFxuXHRcdFx0cG9zc2libGVXaWRnZXRPdXRsaW5lLmhvcml6b250YWxXaWRnZXRSYW5nZSxcblx0XHRcdHBvc3NpYmxlV2lkZ2V0T3V0bGluZS52ZXJ0aWNhbFdpZGdldFJhbmdlXG5cdFx0KS50cmFuc2xhdGVYKC1lZGl0b3JTY3JvbGxMZWZ0KS50cmFuc2xhdGVZKC1lZGl0b3JTY3JvbGxUb3ApO1xuXG5cdFx0Y29uc3Qgc2hvd0F2YWlsYWJsZVNwYWNlID0gZmFsc2U7XG5cdFx0aWYgKHNob3dBdmFpbGFibGVTcGFjZSkge1xuXHRcdFx0ZGVidWdWaWV3KGRlYnVnTG9nUmVjdHMoeyByZWN0QXZhaWxhYmxlU3BhY2UgfSwgdGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKSEpLCByZWFkZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcHJldmlld0VkaXRvck1hcmdpbiwgd2lkZ2V0UGFkZGluZywgd2lkZ2V0Qm9yZGVyLCBsb3dlckJhckhlaWdodCB9ID0gbGF5b3V0Q29uc3RhbnRzO1xuXHRcdGNvbnN0IG1heFdpZGdldFdpZHRoVXBwZXJCb3VuZCA9IHBvc2l0aW9uID09PSAnb3ZlcmxheScgPyBNQVhfV0lER0VUX1dJRFRILk9WRVJMQVkgOiBNQVhfV0lER0VUX1dJRFRILkVNUFRZX1NQQUNFO1xuXHRcdC8vIEhvbm9yIHRoZSBzYW1lIGBtaW5XaWRnZXRXaWR0aGAgdGhlIHBsYWNlbWVudCBsb2dpYyBndWFyYW50ZWVzLCBzbyBhIHNob3J0L2VtcHR5IHByZXZpZXcgbGluZVxuXHRcdC8vIChlLmcuIGEganVtcCBvbnRvIGFuIGVtcHR5IGxpbmUpIGNhbid0IGNvbGxhcHNlIHRoZSB3aWRnZXQgYmVsb3cgaXRzIHJlc2VydmVkIHNwYWNlLlxuXHRcdGNvbnN0IGNvbnRlbnRCYXNlZFdpZGdldFdpZHRoID0gcHJldmlld0VkaXRvckNvbnRlbnRMYXlvdXQubWF4RWRpdG9yV2lkdGggKyBwcmV2aWV3RWRpdG9yTWFyZ2luICsgd2lkZ2V0UGFkZGluZztcblx0XHRjb25zdCBtYXhXaWRnZXRXaWR0aCA9IE1hdGgubWluKG1heFdpZGdldFdpZHRoVXBwZXJCb3VuZCwgTWF0aC5tYXgoY29udGVudEJhc2VkV2lkZ2V0V2lkdGgsIGxheW91dENvbnN0YW50cy5taW5XaWRnZXRXaWR0aCkpO1xuXG5cdFx0Y29uc3QgbGF5b3V0ID0gZGlzdHJpYnV0ZUZsZXhCb3hMYXlvdXQocmVjdEF2YWlsYWJsZVNwYWNlLndpZHRoLCB7XG5cdFx0XHRzcGFjZUJlZm9yZTogeyBtaW46IDAsIG1heDogMTAsIHByaW9yaXR5OiAxIH0sXG5cdFx0XHRjb250ZW50OiB7IG1pbjogNTAsIHJ1bGVzOiBbeyBtYXg6IDE1MCwgcHJpb3JpdHk6IDIgfSwgeyBtYXg6IG1heFdpZGdldFdpZHRoLCBwcmlvcml0eTogMSB9XSB9LFxuXHRcdFx0c3BhY2VBZnRlcjogeyBtaW46IDEwIH0sXG5cdFx0fSk7XG5cblx0XHRpZiAoIWxheW91dCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2VzID0gbGVuZ3Roc1RvT2Zmc2V0UmFuZ2VzKFtsYXlvdXQuc3BhY2VCZWZvcmUsIGxheW91dC5jb250ZW50LCBsYXlvdXQuc3BhY2VBZnRlcl0sIHJlY3RBdmFpbGFibGVTcGFjZS5sZWZ0KTtcblx0XHRjb25zdCBzcGFjZUJlZm9yZVJlY3QgPSByZWN0QXZhaWxhYmxlU3BhY2Uud2l0aEhvcml6b250YWxSYW5nZShyYW5nZXNbMF0pO1xuXHRcdGNvbnN0IHdpZGdldFJlY3QgPSByZWN0QXZhaWxhYmxlU3BhY2Uud2l0aEhvcml6b250YWxSYW5nZShyYW5nZXNbMV0pO1xuXHRcdGNvbnN0IHNwYWNlQWZ0ZXJSZWN0ID0gcmVjdEF2YWlsYWJsZVNwYWNlLndpdGhIb3Jpem9udGFsUmFuZ2UocmFuZ2VzWzJdKTtcblxuXHRcdGNvbnN0IHNob3dSZWN0czIgPSBmYWxzZTtcblx0XHRpZiAoc2hvd1JlY3RzMikge1xuXHRcdFx0ZGVidWdWaWV3KGRlYnVnTG9nUmVjdHMoeyBzcGFjZUJlZm9yZVJlY3QsIHdpZGdldFJlY3QsIHNwYWNlQWZ0ZXJSZWN0IH0sIHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCkhKSwgcmVhZGVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aWV3RWRpdG9yUmVjdCA9IHdpZGdldFJlY3Qud2l0aE1hcmdpbigtd2lkZ2V0UGFkZGluZyAtIHdpZGdldEJvcmRlciAtIHByZXZpZXdFZGl0b3JNYXJnaW4pLndpdGhNYXJnaW4oMCwgMCwgLWxvd2VyQmFySGVpZ2h0LCAwKTtcblxuXHRcdGNvbnN0IHNob3dFZGl0b3JSZWN0ID0gZmFsc2U7XG5cdFx0aWYgKHNob3dFZGl0b3JSZWN0KSB7XG5cdFx0XHRkZWJ1Z1ZpZXcoZGVidWdMb2dSZWN0cyh7IHByZXZpZXdFZGl0b3JSZWN0IH0sIHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCkhKSwgcmVhZGVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aWV3RWRpdG9yQ29udGVudFdpZHRoID0gcHJldmlld0VkaXRvclJlY3Qud2lkdGggLSBwcmV2aWV3RWRpdG9yQ29udGVudExheW91dC5ub25Db250ZW50V2lkdGg7XG5cdFx0Y29uc3QgbWF4UHJlZmZlcmVkUmFuZ2VMZW5ndGggPSBwcmV2aWV3RWRpdG9yQ29udGVudFdpZHRoICogMC44O1xuXHRcdGNvbnN0IHByZWZlcnJlZFJhbmdlVG9SZXZlYWwgPSBwcmV2aWV3RWRpdG9yQ29udGVudExheW91dC5wcmVmZXJyZWRSYW5nZVRvUmV2ZWFsLmludGVyc2VjdChPZmZzZXRSYW5nZS5vZlN0YXJ0QW5kTGVuZ3RoKFxuXHRcdFx0cHJldmlld0VkaXRvckNvbnRlbnRMYXlvdXQucHJlZmVycmVkUmFuZ2VUb1JldmVhbC5zdGFydCxcblx0XHRcdG1heFByZWZmZXJlZFJhbmdlTGVuZ3RoXG5cdFx0KSkgPz8gcHJldmlld0VkaXRvckNvbnRlbnRMYXlvdXQucHJlZmVycmVkUmFuZ2VUb1JldmVhbDtcblx0XHRjb25zdCBkZXNpcmVkUHJldmlld0VkaXRvclNjcm9sbExlZnQgPSBzY3JvbGxUb1JldmVhbChwcmV2aWV3RWRpdG9yQ29udGVudExheW91dC5pbmRlbnRhdGlvbkVuZCwgcHJldmlld0VkaXRvckNvbnRlbnRXaWR0aCwgcHJlZmVycmVkUmFuZ2VUb1JldmVhbCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29kZUVkaXRvclNpemU6IHByZXZpZXdFZGl0b3JSZWN0LmdldFNpemUoKSxcblx0XHRcdGNvZGVTY3JvbGxMZWZ0OiBlZGl0b3JTY3JvbGxMZWZ0LFxuXHRcdFx0Y29udGVudExlZnQ6IGVkaXRvckxheW91dC5jb250ZW50TGVmdCxcblxuXHRcdFx0d2lkZ2V0UmVjdCxcblxuXHRcdFx0cHJldmlld0VkaXRvck1hcmdpbixcblx0XHRcdHdpZGdldFBhZGRpbmcsXG5cdFx0XHR3aWRnZXRCb3JkZXIsXG5cblx0XHRcdGxvd2VyQmFySGVpZ2h0LFxuXG5cdFx0XHRkZXNpcmVkUHJldmlld0VkaXRvclNjcm9sbExlZnQ6IGRlc2lyZWRQcmV2aWV3RWRpdG9yU2Nyb2xsTGVmdC5uZXdTY3JvbGxQb3NpdGlvbixcblx0XHR9O1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3ID0gbi5kaXYoe1xuXHRcdGNsYXNzOiAnaW5saW5lLWVkaXRzLXZpZXcnLFxuXHRcdHN0eWxlOiB7XG5cdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdG92ZXJmbG93OiAndmlzaWJsZScsXG5cdFx0XHR0b3A6ICcwcHgnLFxuXHRcdFx0bGVmdDogJzBweCcsXG5cdFx0XHRkaXNwbGF5OiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiAhIXRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvLnJlYWQocmVhZGVyKSA/ICdibG9jaycgOiAnbm9uZScpLFxuXHRcdH0sXG5cdH0sIFtcblx0XHRkZXJpdmVkKHRoaXMsIF9yZWFkZXIgPT4gW3RoaXMuX3dpZGdldENvbnRlbnRdKSxcblx0XSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0Q29udGVudCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IC8vIFRPRE9AaGVkaWV0OiByZW1vdmUgd2hlbiBuLmRpdiBsYXppbHkgY3JlYXRlcyBwcmV2aWV3RWRpdG9yLmVsZW1lbnQgbm9kZVxuXHRcdG4uZGl2KHtcblx0XHRcdGNsYXNzOiBbJ2lubGluZS1lZGl0cy1sb25nLWRpc3RhbmNlLWhpbnQtd2lkZ2V0JywgJ3Nob3ctZmlsZS1pY29ucyddLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdG92ZXJmbG93OiAnaGlkZGVuJyxcblx0XHRcdFx0Y3Vyc29yOiAncG9pbnRlcicsXG5cdFx0XHRcdGJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUoZWRpdG9yV2lkZ2V0QmFja2dyb3VuZCksXG5cdFx0XHRcdHBhZGRpbmc6IHRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvLm1hcChpID0+IGk/LndpZGdldFBhZGRpbmcpLFxuXHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBCT1JERVJfUkFESVVTLFxuXHRcdFx0XHRib3JkZXI6IGRlcml2ZWQocmVhZGVyID0+IGAke3RoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvLnJlYWQocmVhZGVyKT8ud2lkZ2V0Qm9yZGVyfXB4IHNvbGlkICR7dGhpcy5fc3R5bGVzLnJlYWQocmVhZGVyKS5ib3JkZXJ9YCksXG5cdFx0XHRcdGRpc3BsYXk6ICdmbGV4Jyxcblx0XHRcdFx0ZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXG5cdFx0XHRcdG9wYWNpdHk6IGRlcml2ZWQocmVhZGVyID0+IHRoaXMuX3ZpZXdTdGF0ZS5yZWFkKHJlYWRlcik/LmhpbnQuaXNWaXNpYmxlID8gJzEnIDogJzAnKSxcblx0XHRcdFx0dHJhbnNpdGlvbjogJ29wYWNpdHkgMjAwbXMgZWFzZS1pbi1vdXQnLFxuXHRcdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gdGhpcy5fcHJldmlld0VkaXRvckxheW91dEluZm8ucmVhZChyZWFkZXIpPy53aWRnZXRSZWN0KVxuXHRcdFx0fSxcblx0XHRcdG9ubW91c2Vkb3duOiBlID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpOyAvLyBUaGlzIHByZXZlbnRzIHRoYXQgdGhlIGVkaXRvciBsb3NlcyBmb2N1c1xuXHRcdFx0fSxcblx0XHRcdG9uY2xpY2s6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fdmlld1N0YXRlLnJlYWQodW5kZWZpbmVkKT8ubW9kZWwuanVtcCgpO1xuXHRcdFx0fVxuXHRcdH0sIFtcblx0XHRcdG4uZGl2KHtcblx0XHRcdFx0Y2xhc3M6IFsnZWRpdG9yQ29udGFpbmVyJ10sXG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0b3ZlcmZsb3c6ICdoaWRkZW4nLFxuXHRcdFx0XHRcdHBhZGRpbmc6IHRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvLm1hcChpID0+IGk/LnByZXZpZXdFZGl0b3JNYXJnaW4pLFxuXHRcdFx0XHRcdGJhY2tncm91bmQ6IHRoaXMuX3N0eWxlcy5tYXAocyA9PiBzLmJhY2tncm91bmQpLFxuXHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sIFtcblx0XHRcdFx0ZGVyaXZlZCh0aGlzLCByID0+IHRoaXMuX3ByZXZpZXdFZGl0b3IuZWxlbWVudCksIC8vIC0tXG5cdFx0XHRdKSxcblx0XHRcdG4uZGl2KHsgY2xhc3M6ICdiYXInLCBzdHlsZTogeyBjb2xvcjogYXNDc3NWYXJpYWJsZShkZXNjcmlwdGlvbkZvcmVncm91bmQpLCBwb2ludGVyRXZlbnRzOiAnbm9uZScsIG1hcmdpbjogJzAgNHB4JywgaGVpZ2h0OiB0aGlzLl9wcmV2aWV3RWRpdG9yTGF5b3V0SW5mby5tYXAoaSA9PiBpPy5sb3dlckJhckhlaWdodCksIGRpc3BsYXk6ICdmbGV4JywganVzdGlmeUNvbnRlbnQ6ICdzcGFjZS1iZXR3ZWVuJywgYWxpZ25JdGVtczogJ2NlbnRlcicgfSB9LCBbXG5cdFx0XHRcdGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCBjaGlsZHJlbjogKEhUTUxFbGVtZW50IHwgT2JzZXJ2ZXJOb2RlPEhUTUxEaXZFbGVtZW50PilbXSA9IFtdO1xuXHRcdFx0XHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHRoaXMuX3ZpZXdTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0aWYgKCF2aWV3U3RhdGUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjaGlsZHJlbjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIGEgY3Jvc3MtZmlsZSBlZGl0XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudE1vZGVsID0gdGhpcy5fZWRpdG9yT2JzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXRVcmkgPSB2aWV3U3RhdGUudGFyZ2V0LnVyaTtcblx0XHRcdFx0XHRjb25zdCBpc0Nyb3NzRmlsZUVkaXQgPSAhY3VycmVudE1vZGVsIHx8ICF2aWV3U3RhdGUudGFyZ2V0LnRhcmdldHMoY3VycmVudE1vZGVsKTtcblxuXHRcdFx0XHRcdGlmIChpc0Nyb3NzRmlsZUVkaXQpIHtcblx0XHRcdFx0XHRcdC8vIEZvciBjcm9zcy1maWxlIGVkaXRzLCBzaG93IHRhcmdldCBmaWxlbmFtZSBpbnN0ZWFkIG9mIG91dGxpbmVcblx0XHRcdFx0XHRcdGNvbnN0IGZpbGVOYW1lID0gYmFzZW5hbWUodGFyZ2V0VXJpKTtcblx0XHRcdFx0XHRcdGNvbnN0IGljb25DbGFzc2VzID0gZ2V0SWNvbkNsYXNzZXModGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UsIHRhcmdldFVyaSwgRmlsZUtpbmQuRklMRSk7XG5cdFx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0Y2xhc3M6ICd0YXJnZXQtZmlsZScsXG5cdFx0XHRcdFx0XHRcdHN0eWxlOiB7IGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIG92ZXJmbG93OiAnaGlkZGVuJywgdGV4dE92ZXJmbG93OiAnZWxsaXBzaXMnLCB3aGl0ZVNwYWNlOiAnbm93cmFwJyB9LFxuXHRcdFx0XHRcdFx0fSwgW1xuXHRcdFx0XHRcdFx0XHRuLmVsZW0oJ3NwYW4nLCB7IGNsYXNzOiBpY29uQ2xhc3Nlcywgc3R5bGU6IHsgZmxleFNocmluazogJzAnLCBtYXJnaW5SaWdodDogJzRweCcgfSB9KSxcblx0XHRcdFx0XHRcdFx0ZmlsZU5hbWUsXG5cdFx0XHRcdFx0XHRdKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIE91dGxpbmUgRWxlbWVudFxuXHRcdFx0XHRcdFx0Y29uc3Qgc291cmNlID0gdGhpcy5fb3JpZ2luYWxPdXRsaW5lU291cmNlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsVGFyZ2V0TGluZU51bWJlciA9IHRoaXMuX29yaWdpbmFsVGFyZ2V0TGluZU51bWJlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0XHRjb25zdCBvdXRsaW5lSXRlbXMgPSBzb3VyY2U/LmdldEF0KG9yaWdpbmFsVGFyZ2V0TGluZU51bWJlciwgcmVhZGVyKS5zbGljZSgwLCAxKSA/PyBbXTtcblx0XHRcdFx0XHRcdGNvbnN0IG91dGxpbmVFbGVtZW50czogQ2hpbGROb2RlW10gPSBbXTtcblx0XHRcdFx0XHRcdGlmIChvdXRsaW5lSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG91dGxpbmVJdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSBvdXRsaW5lSXRlbXNbaV07XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgaWNvbiA9IFN5bWJvbEtpbmRzLnRvSWNvbihpdGVtLmtpbmQpO1xuXHRcdFx0XHRcdFx0XHRcdG91dGxpbmVFbGVtZW50cy5wdXNoKG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0XHRcdGNsYXNzOiAnYnJlYWRjcnVtYi1pdGVtJyxcblx0XHRcdFx0XHRcdFx0XHRcdHN0eWxlOiB7IGRpc3BsYXk6ICdmbGV4JywgYWxpZ25JdGVtczogJ2NlbnRlcicsIGZsZXg6ICcxIDEgYXV0bycsIHdoaXRlU3BhY2U6ICdub3dyYXAnLCBvdmVyZmxvdzogJ2hpZGRlbicsIHRleHRPdmVyZmxvdzogJ2VsbGlwc2lzJyB9LFxuXHRcdFx0XHRcdFx0XHRcdH0sIFtcblx0XHRcdFx0XHRcdFx0XHRcdHJlbmRlckljb24oaWNvbiksXG5cdFx0XHRcdFx0XHRcdFx0XHQnXFx1MDBhMCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRpdGVtLm5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0XHQuLi4oaSA9PT0gb3V0bGluZUl0ZW1zLmxlbmd0aCAtIDFcblx0XHRcdFx0XHRcdFx0XHRcdFx0PyBbXVxuXHRcdFx0XHRcdFx0XHRcdFx0XHQ6IFtyZW5kZXJJY29uKENvZGljb24uY2hldnJvblJpZ2h0KV1cblx0XHRcdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdFx0XHRdKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNoaWxkcmVuLnB1c2gobi5kaXYoeyBjbGFzczogJ291dGxpbmUtZWxlbWVudHMnLCBzdHlsZTogeyBvdmVyZmxvdzogJ2hpZGRlbicsIHRleHRPdmVyZmxvdzogJ2VsbGlwc2lzJywgd2hpdGVTcGFjZTogJ25vd3JhcCcgfSB9LCBvdXRsaW5lRWxlbWVudHMpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBTaG93IEVkaXQgRGlyZWN0aW9uXG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxUYXJnZXRMaW5lTnVtYmVyID0gdGhpcy5fb3JpZ2luYWxUYXJnZXRMaW5lTnVtYmVyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRjb25zdCBhcnJvd0ljb24gPSBpc0Nyb3NzRmlsZUVkaXQgPyBDb2RpY29uLmFycm93UmlnaHQgOiAodmlld1N0YXRlLmhpbnQubGluZU51bWJlciA8IG9yaWdpbmFsVGFyZ2V0TGluZU51bWJlciA/IENvZGljb24uYXJyb3dEb3duIDogQ29kaWNvbi5hcnJvd1VwKTtcblx0XHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhqdW1wVG9OZXh0SW5saW5lRWRpdElkKTtcblx0XHRcdFx0XHRsZXQgbGFiZWwgPSBpc0Nyb3NzRmlsZUVkaXQgPyAnR28gdG8gZmlsZScgOiAnR28gdG8gc3VnZ2VzdGlvbic7XG5cdFx0XHRcdFx0aWYgKGtleWJpbmRpbmcgJiYga2V5YmluZGluZy5nZXRMYWJlbCgpID09PSAnVGFiJykge1xuXHRcdFx0XHRcdFx0bGFiZWwgPSBpc0Nyb3NzRmlsZUVkaXQgPyAnVGFiIHRvIG9wZW4nIDogJ1RhYiB0byBqdW1wJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hpbGRyZW4ucHVzaChuLmRpdih7XG5cdFx0XHRcdFx0XHRjbGFzczogJ2dvLXRvLWxhYmVsJyxcblx0XHRcdFx0XHRcdHN0eWxlOiB7IHBvc2l0aW9uOiAncmVsYXRpdmUnLCBkaXNwbGF5OiAnZmxleCcsIGFsaWduSXRlbXM6ICdjZW50ZXInLCBmbGV4OiAnMCAwIGF1dG8nLCBwYWRkaW5nTGVmdDogJzZweCcgfSxcblx0XHRcdFx0XHR9LCBbXG5cdFx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRcdCdcXHUwMGEwJyxcblx0XHRcdFx0XHRcdHJlbmRlckljb24oYXJyb3dJY29uKSxcblx0XHRcdFx0XHRdKSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdFx0XHRcdH0pXG5cdFx0XHRdKSxcblx0XHRdKVxuXHQpO1xuXG5cdC8vIERyaXZlcyBicmVhZGNydW1icyBhbmQgc3ltYm9sIGljb25cblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxUYXJnZXRMaW5lTnVtYmVyID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5fdmlld1N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXZpZXdTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdGlmICh2aWV3U3RhdGUuZWRpdC5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRyZXR1cm4gdmlld1N0YXRlLmVkaXQuYWN0aW9uLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpZXdTdGF0ZS5kaWZmWzBdPy5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgPz8gLTE7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsT3V0bGluZVNvdXJjZSA9IGRlcml2ZWREaXNwb3NhYmxlKHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRjb25zdCBtID0gdGhpcy5fZWRpdG9yT2JzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBmYWN0b3J5ID0gSGlkZVVuY2hhbmdlZFJlZ2lvbnNGZWF0dXJlLl9icmVhZGNydW1ic1NvdXJjZUZhY3RvcnkucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiAoIW0gfHwgIWZhY3RvcnkpID8gdW5kZWZpbmVkIDogZmFjdG9yeShtLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMb25nRGlzdGFuY2VIaW50IHtcblx0bGluZU51bWJlcjogbnVtYmVyO1xuXHRpc1Zpc2libGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvbmdEaXN0YW5jZVZpZXdTdGF0ZSB7XG5cdGhpbnQ6IElMb25nRGlzdGFuY2VIaW50O1xuXHRuZXdUZXh0TGluZUNvdW50OiBudW1iZXI7XG5cdGVkaXQ6IElubGluZUVkaXRXaXRoQ2hhbmdlcztcblx0ZGlmZjogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW107XG5cdG5leHRDdXJzb3JQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsO1xuXHRlZGl0b3JUeXBlOiBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZTtcblx0dGFyZ2V0OiBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZTtcblxuXHRtb2RlbDogU2ltcGxlSW5saW5lU3VnZ2VzdE1vZGVsO1xuXHRpbmxpbmVTdWdnZXN0SW5mbzogSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhO1xufVxuXG5mdW5jdGlvbiBsZW5ndGhzVG9PZmZzZXRSYW5nZXMobGVuZ3RoczogbnVtYmVyW10sIGluaXRpYWxPZmZzZXQgPSAwKTogT2Zmc2V0UmFuZ2VbXSB7XG5cdGNvbnN0IHJlc3VsdDogT2Zmc2V0UmFuZ2VbXSA9IFtdO1xuXHRsZXQgb2Zmc2V0ID0gaW5pdGlhbE9mZnNldDtcblx0Zm9yIChjb25zdCBsZW5ndGggb2YgbGVuZ3Rocykge1xuXHRcdHJlc3VsdC5wdXNoKG5ldyBPZmZzZXRSYW5nZShvZmZzZXQsIG9mZnNldCArIGxlbmd0aCkpO1xuXHRcdG9mZnNldCArPSBsZW5ndGg7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gc3RhY2tTaXplc0Rvd24oYXQ6IFBvaW50LCBzaXplczogU2l6ZTJEW10sIGFsaWdubWVudDogJ2xlZnQnIHwgJ3JpZ2h0JyA9ICdsZWZ0Jyk6IFJlY3RbXSB7XG5cdGNvbnN0IHJlY3RzOiBSZWN0W10gPSBbXTtcblx0bGV0IG9mZnNldCA9IDA7XG5cdGZvciAoY29uc3QgcyBvZiBzaXplcykge1xuXHRcdHJlY3RzLnB1c2goXG5cdFx0XHRSZWN0LmZyb21MZWZ0VG9wV2lkdGhIZWlnaHQoXG5cdFx0XHRcdGF0LnggKyAoYWxpZ25tZW50ID09PSAnbGVmdCcgPyAwIDogLXMud2lkdGgpLFxuXHRcdFx0XHRhdC55ICsgb2Zmc2V0LFxuXHRcdFx0XHRzLndpZHRoLFxuXHRcdFx0XHRzLmhlaWdodFxuXHRcdFx0KVxuXHRcdCk7XG5cdFx0b2Zmc2V0ICs9IHMuaGVpZ2h0O1xuXHR9XG5cdHJldHVybiByZWN0cztcbn1cblxuXG5cbmV4cG9ydCBmdW5jdGlvbiBkcmF3RWRpdG9yV2lkdGhzKGU6IElDb2RlRWRpdG9yLCByZWFkZXI6IElSZWFkZXIpIHtcblx0Y29uc3QgbGF5b3V0SW5mbyA9IGUuZ2V0TGF5b3V0SW5mbygpO1xuXHRjb25zdCBjb250ZW50TGVmdCA9IG5ldyBPZmZzZXRSYW5nZSgwLCBsYXlvdXRJbmZvLmNvbnRlbnRMZWZ0KTtcblx0Y29uc3QgdHJ1ZUNvbnRlbnQgPSBPZmZzZXRSYW5nZS5vZlN0YXJ0QW5kTGVuZ3RoKGxheW91dEluZm8uY29udGVudExlZnQsIGxheW91dEluZm8uY29udGVudFdpZHRoIC0gbGF5b3V0SW5mby52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoKTtcblx0Y29uc3QgbWluaW1hcCA9IE9mZnNldFJhbmdlLm9mU3RhcnRBbmRMZW5ndGgodHJ1ZUNvbnRlbnQuZW5kRXhjbHVzaXZlLCBsYXlvdXRJbmZvLm1pbmltYXAubWluaW1hcFdpZHRoKTtcblx0Y29uc3QgdmVydGljYWxTY3JvbGxiYXIgPSBPZmZzZXRSYW5nZS5vZlN0YXJ0QW5kTGVuZ3RoKG1pbmltYXAuZW5kRXhjbHVzaXZlLCBsYXlvdXRJbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgpO1xuXG5cdGNvbnN0IHIgPSBuZXcgT2Zmc2V0UmFuZ2UoMCwgMjAwKTtcblx0ZGVidWdWaWV3KGRlYnVnTG9nSG9yaXpvbnRhbE9mZnNldFJhbmdlcyh7XG5cdFx0Y29udGVudExlZnQ6IFJlY3QuZnJvbVJhbmdlcyhjb250ZW50TGVmdCwgciksXG5cdFx0dHJ1ZUNvbnRlbnQ6IFJlY3QuZnJvbVJhbmdlcyh0cnVlQ29udGVudCwgciksXG5cdFx0bWluaW1hcDogUmVjdC5mcm9tUmFuZ2VzKG1pbmltYXAsIHIpLFxuXHRcdHZlcnRpY2FsU2Nyb2xsYmFyOiBSZWN0LmZyb21SYW5nZXModmVydGljYWxTY3JvbGxiYXIsIHIpLFxuXHR9LCBlLmdldERvbU5vZGUoKSEpLCByZWFkZXIpO1xufVxuXG5cbi8qKlxuICogQ2hhbmdlcyB0aGUgc2Nyb2xsIHBvc2l0aW9uIGFzIGxpdHRsZSBhcyBwb3NzaWJsZSBqdXN0IHRvIHJldmVhbCB0aGUgZ2l2ZW4gcmFuZ2UgaW4gdGhlIHdpbmRvdy5cbiovXG5leHBvcnQgZnVuY3Rpb24gc2Nyb2xsVG9SZXZlYWwoY3VycmVudFNjcm9sbFBvc2l0aW9uOiBudW1iZXIsIHdpbmRvd1dpZHRoOiBudW1iZXIsIGNvbnRlbnRSYW5nZVRvUmV2ZWFsOiBPZmZzZXRSYW5nZSk6IHsgbmV3U2Nyb2xsUG9zaXRpb246IG51bWJlciB9IHtcblx0Y29uc3QgdmlzaWJsZVJhbmdlID0gbmV3IE9mZnNldFJhbmdlKGN1cnJlbnRTY3JvbGxQb3NpdGlvbiwgY3VycmVudFNjcm9sbFBvc2l0aW9uICsgd2luZG93V2lkdGgpO1xuXHRpZiAodmlzaWJsZVJhbmdlLmNvbnRhaW5zUmFuZ2UoY29udGVudFJhbmdlVG9SZXZlYWwpKSB7XG5cdFx0cmV0dXJuIHsgbmV3U2Nyb2xsUG9zaXRpb246IGN1cnJlbnRTY3JvbGxQb3NpdGlvbiB9O1xuXHR9XG5cdGlmIChjb250ZW50UmFuZ2VUb1JldmVhbC5sZW5ndGggPiB3aW5kb3dXaWR0aCkge1xuXHRcdHJldHVybiB7IG5ld1Njcm9sbFBvc2l0aW9uOiBjb250ZW50UmFuZ2VUb1JldmVhbC5zdGFydCB9O1xuXHR9XG5cdGlmIChjb250ZW50UmFuZ2VUb1JldmVhbC5lbmRFeGNsdXNpdmUgPiB2aXNpYmxlUmFuZ2UuZW5kRXhjbHVzaXZlKSB7XG5cdFx0cmV0dXJuIHsgbmV3U2Nyb2xsUG9zaXRpb246IGNvbnRlbnRSYW5nZVRvUmV2ZWFsLmVuZEV4Y2x1c2l2ZSAtIHdpbmRvd1dpZHRoIH07XG5cdH1cblx0aWYgKGNvbnRlbnRSYW5nZVRvUmV2ZWFsLnN0YXJ0IDwgdmlzaWJsZVJhbmdlLnN0YXJ0KSB7XG5cdFx0cmV0dXJuIHsgbmV3U2Nyb2xsUG9zaXRpb246IGNvbnRlbnRSYW5nZVRvUmV2ZWFsLnN0YXJ0IH07XG5cdH1cblx0cmV0dXJuIHsgbmV3U2Nyb2xsUG9zaXRpb246IGN1cnJlbnRTY3JvbGxQb3NpdGlvbiB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxTQUFvQixTQUFnRDtBQUNwRSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBK0IsU0FBUyxpQkFBaUIsc0JBQXNCLFNBQVMsbUJBQW1CLDJCQUEyQjtBQUN0SSxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBMkIsMkJBQTJCO0FBRXRELFNBQVMsdUJBQXVCLG1CQUFtQjtBQUVuRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0MsZUFBZSxpQkFBaUI7QUFDekUsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxhQUFhO0FBRXRCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQTBCLHVCQUF1QixzQ0FBc0Msd0NBQXdDLHlDQUF5QyxvQkFBb0I7QUFD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
