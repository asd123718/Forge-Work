import { MouseTargetType } from "../editorBrowser.js";
import { PageCoordinates } from "../editorDom.js";
import { PartFingerprint, PartFingerprints } from "../view/viewPart.js";
import { ViewLine } from "../viewParts/viewLines/viewLine.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { Position } from "../../common/core/position.js";
import { Range as EditorRange } from "../../common/core/range.js";
import { CursorColumns } from "../../common/core/cursorColumns.js";
import * as dom from "../../../base/browser/dom.js";
import { AtomicTabMoveOperations, Direction } from "../../common/cursor/cursorAtomicMoveOperations.js";
import { PositionAffinity, TextDirection } from "../../common/model.js";
import { Lazy } from "../../../base/common/lazy.js";
var HitTestResultType = /* @__PURE__ */ ((HitTestResultType2) => {
  HitTestResultType2[HitTestResultType2["Unknown"] = 0] = "Unknown";
  HitTestResultType2[HitTestResultType2["Content"] = 1] = "Content";
  return HitTestResultType2;
})(HitTestResultType || {});
class UnknownHitTestResult {
  constructor(hitTarget = null) {
    this.hitTarget = hitTarget;
    this.type = 0 /* Unknown */;
  }
}
class ContentHitTestResult {
  constructor(position, spanNode, injectedText) {
    this.position = position;
    this.spanNode = spanNode;
    this.injectedText = injectedText;
    this.type = 1 /* Content */;
  }
  get hitTarget() {
    return this.spanNode;
  }
}
var HitTestResult;
((HitTestResult2) => {
  function createFromDOMInfo(ctx, spanNode, offset) {
    const position = ctx.getPositionFromDOMInfo(spanNode, offset);
    if (position) {
      return new ContentHitTestResult(position, spanNode, null);
    }
    return new UnknownHitTestResult(spanNode);
  }
  HitTestResult2.createFromDOMInfo = createFromDOMInfo;
})(HitTestResult || (HitTestResult = {}));
class PointerHandlerLastRenderData {
  constructor(lastViewCursorsRenderData, lastTextareaPosition) {
    this.lastViewCursorsRenderData = lastViewCursorsRenderData;
    this.lastTextareaPosition = lastTextareaPosition;
  }
}
class MouseTarget {
  static _deduceRage(position, range = null) {
    if (!range && position) {
      return new EditorRange(position.lineNumber, position.column, position.lineNumber, position.column);
    }
    return range ?? null;
  }
  static createUnknown(element, mouseColumn, position) {
    return { type: MouseTargetType.UNKNOWN, element, mouseColumn, position, range: this._deduceRage(position) };
  }
  static createTextarea(element, mouseColumn) {
    return { type: MouseTargetType.TEXTAREA, element, mouseColumn, position: null, range: null };
  }
  static createMargin(type, element, mouseColumn, position, range, detail) {
    return { type, element, mouseColumn, position, range, detail };
  }
  static createViewZone(type, element, mouseColumn, position, detail) {
    return { type, element, mouseColumn, position, range: this._deduceRage(position), detail };
  }
  static createContentText(element, mouseColumn, position, range, detail) {
    return { type: MouseTargetType.CONTENT_TEXT, element, mouseColumn, position, range: this._deduceRage(position, range), detail };
  }
  static createContentEmpty(element, mouseColumn, position, detail) {
    return { type: MouseTargetType.CONTENT_EMPTY, element, mouseColumn, position, range: this._deduceRage(position), detail };
  }
  static createContentWidget(element, mouseColumn, detail) {
    return { type: MouseTargetType.CONTENT_WIDGET, element, mouseColumn, position: null, range: null, detail };
  }
  static createScrollbar(element, mouseColumn, position) {
    return { type: MouseTargetType.SCROLLBAR, element, mouseColumn, position, range: this._deduceRage(position) };
  }
  static createOverlayWidget(element, mouseColumn, detail) {
    return { type: MouseTargetType.OVERLAY_WIDGET, element, mouseColumn, position: null, range: null, detail };
  }
  static createOutsideEditor(mouseColumn, position, outsidePosition, outsideDistance) {
    return { type: MouseTargetType.OUTSIDE_EDITOR, element: null, mouseColumn, position, range: this._deduceRage(position), outsidePosition, outsideDistance };
  }
  static _typeToString(type) {
    if (type === MouseTargetType.TEXTAREA) {
      return "TEXTAREA";
    }
    if (type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
      return "GUTTER_GLYPH_MARGIN";
    }
    if (type === MouseTargetType.GUTTER_LINE_NUMBERS) {
      return "GUTTER_LINE_NUMBERS";
    }
    if (type === MouseTargetType.GUTTER_LINE_DECORATIONS) {
      return "GUTTER_LINE_DECORATIONS";
    }
    if (type === MouseTargetType.GUTTER_VIEW_ZONE) {
      return "GUTTER_VIEW_ZONE";
    }
    if (type === MouseTargetType.CONTENT_TEXT) {
      return "CONTENT_TEXT";
    }
    if (type === MouseTargetType.CONTENT_EMPTY) {
      return "CONTENT_EMPTY";
    }
    if (type === MouseTargetType.CONTENT_VIEW_ZONE) {
      return "CONTENT_VIEW_ZONE";
    }
    if (type === MouseTargetType.CONTENT_WIDGET) {
      return "CONTENT_WIDGET";
    }
    if (type === MouseTargetType.OVERVIEW_RULER) {
      return "OVERVIEW_RULER";
    }
    if (type === MouseTargetType.SCROLLBAR) {
      return "SCROLLBAR";
    }
    if (type === MouseTargetType.OVERLAY_WIDGET) {
      return "OVERLAY_WIDGET";
    }
    return "UNKNOWN";
  }
  static toString(target) {
    return this._typeToString(target.type) + ": " + target.position + " - " + target.range + " - " + JSON.stringify(target.detail);
  }
}
class ElementPath {
  static isTextArea(path) {
    return path.length === 2 && path[0] === PartFingerprint.OverflowGuard && path[1] === PartFingerprint.TextArea;
  }
  static isChildOfViewLines(path) {
    return path.length >= 4 && path[0] === PartFingerprint.OverflowGuard && path[3] === PartFingerprint.ViewLines;
  }
  static isStrictChildOfViewLines(path) {
    return path.length > 4 && path[0] === PartFingerprint.OverflowGuard && path[3] === PartFingerprint.ViewLines;
  }
  static isChildOfScrollableElement(path) {
    return path.length >= 2 && path[0] === PartFingerprint.OverflowGuard && path[1] === PartFingerprint.ScrollableElement;
  }
  static isChildOfMinimap(path) {
    return path.length >= 2 && path[0] === PartFingerprint.OverflowGuard && path[1] === PartFingerprint.Minimap;
  }
  static isChildOfContentWidgets(path) {
    return path.length >= 4 && path[0] === PartFingerprint.OverflowGuard && path[3] === PartFingerprint.ContentWidgets;
  }
  static isChildOfOverflowGuard(path) {
    return path.length >= 1 && path[0] === PartFingerprint.OverflowGuard;
  }
  static isChildOfOverflowingContentWidgets(path) {
    return path.length >= 1 && path[0] === PartFingerprint.OverflowingContentWidgets;
  }
  static isChildOfOverlayWidgets(path) {
    return path.length >= 2 && path[0] === PartFingerprint.OverflowGuard && path[1] === PartFingerprint.OverlayWidgets;
  }
  static isChildOfOverflowingOverlayWidgets(path) {
    return path.length >= 1 && path[0] === PartFingerprint.OverflowingOverlayWidgets;
  }
}
class HitTestContext {
  constructor(context, viewHelper, lastRenderData) {
    this.viewModel = context.viewModel;
    const options = context.configuration.options;
    this.layoutInfo = options.get(EditorOption.layoutInfo);
    this.viewDomNode = viewHelper.viewDomNode;
    this.viewLinesGpu = viewHelper.viewLinesGpu;
    this.lineHeight = options.get(EditorOption.lineHeight);
    this.stickyTabStops = options.get(EditorOption.stickyTabStops);
    this.typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
    this.lastRenderData = lastRenderData;
    this._context = context;
    this._viewHelper = viewHelper;
  }
  getZoneAtCoord(mouseVerticalOffset) {
    return HitTestContext.getZoneAtCoord(this._context, mouseVerticalOffset);
  }
  static getZoneAtCoord(context, mouseVerticalOffset) {
    const viewZoneWhitespace = context.viewLayout.getWhitespaceAtVerticalOffset(mouseVerticalOffset);
    if (viewZoneWhitespace) {
      const viewZoneMiddle = viewZoneWhitespace.verticalOffset + viewZoneWhitespace.height / 2;
      const lineCount = context.viewModel.getLineCount();
      let positionBefore = null;
      let position;
      let positionAfter = null;
      if (viewZoneWhitespace.afterLineNumber !== lineCount) {
        positionAfter = new Position(viewZoneWhitespace.afterLineNumber + 1, 1);
      }
      if (viewZoneWhitespace.afterLineNumber > 0) {
        positionBefore = new Position(viewZoneWhitespace.afterLineNumber, context.viewModel.getLineMaxColumn(viewZoneWhitespace.afterLineNumber));
      }
      if (positionAfter === null) {
        position = positionBefore;
      } else if (positionBefore === null) {
        position = positionAfter;
      } else if (mouseVerticalOffset < viewZoneMiddle) {
        position = positionBefore;
      } else {
        position = positionAfter;
      }
      return {
        viewZoneId: viewZoneWhitespace.id,
        afterLineNumber: viewZoneWhitespace.afterLineNumber,
        positionBefore,
        positionAfter,
        position
      };
    }
    return null;
  }
  getFullLineRangeAtCoord(mouseVerticalOffset) {
    if (this._context.viewLayout.isAfterLines(mouseVerticalOffset)) {
      const lineNumber2 = this._context.viewModel.getLineCount();
      const maxLineColumn2 = this._context.viewModel.getLineMaxColumn(lineNumber2);
      return {
        range: new EditorRange(lineNumber2, maxLineColumn2, lineNumber2, maxLineColumn2),
        isAfterLines: true
      };
    }
    const lineNumber = this._context.viewLayout.getLineNumberAtVerticalOffset(mouseVerticalOffset);
    const maxLineColumn = this._context.viewModel.getLineMaxColumn(lineNumber);
    return {
      range: new EditorRange(lineNumber, 1, lineNumber, maxLineColumn),
      isAfterLines: false
    };
  }
  getLineNumberAtVerticalOffset(mouseVerticalOffset) {
    return this._context.viewLayout.getLineNumberAtVerticalOffset(mouseVerticalOffset);
  }
  isAfterLines(mouseVerticalOffset) {
    return this._context.viewLayout.isAfterLines(mouseVerticalOffset);
  }
  isInTopPadding(mouseVerticalOffset) {
    return this._context.viewLayout.isInTopPadding(mouseVerticalOffset);
  }
  isInBottomPadding(mouseVerticalOffset) {
    return this._context.viewLayout.isInBottomPadding(mouseVerticalOffset);
  }
  getVerticalOffsetForLineNumber(lineNumber) {
    return this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber);
  }
  findAttribute(element, attr) {
    return HitTestContext._findAttribute(element, attr, this._viewHelper.viewDomNode);
  }
  static _findAttribute(element, attr, stopAt) {
    while (element && element !== element.ownerDocument.body) {
      if (element.hasAttribute && element.hasAttribute(attr)) {
        return element.getAttribute(attr);
      }
      if (element === stopAt) {
        return null;
      }
      element = element.parentNode;
    }
    return null;
  }
  getLineWidth(lineNumber) {
    return this._viewHelper.getLineWidth(lineNumber);
  }
  isRtl(lineNumber) {
    return this.viewModel.getTextDirection(lineNumber) === TextDirection.RTL;
  }
  visibleRangeForPosition(lineNumber, column) {
    return this._viewHelper.visibleRangeForPosition(lineNumber, column);
  }
  getPositionFromDOMInfo(spanNode, offset) {
    return this._viewHelper.getPositionFromDOMInfo(spanNode, offset);
  }
  getCurrentScrollTop() {
    return this._context.viewLayout.getCurrentScrollTop();
  }
  getCurrentScrollLeft() {
    return this._context.viewLayout.getCurrentScrollLeft();
  }
}
class BareHitTestRequest {
  constructor(ctx, editorPos, pos, relativePos) {
    this.editorPos = editorPos;
    this.pos = pos;
    this.relativePos = relativePos;
    this.mouseVerticalOffset = Math.max(0, ctx.getCurrentScrollTop() + this.relativePos.y);
    this.mouseContentHorizontalOffset = ctx.getCurrentScrollLeft() + this.relativePos.x - ctx.layoutInfo.contentLeft;
    this.isInMarginArea = this.relativePos.x < ctx.layoutInfo.contentLeft && this.relativePos.x >= ctx.layoutInfo.glyphMarginLeft;
    this.isInContentArea = !this.isInMarginArea;
    this.mouseColumn = Math.max(0, MouseTargetFactory._getMouseColumn(this.mouseContentHorizontalOffset, ctx.typicalHalfwidthCharacterWidth));
  }
}
class HitTestRequest extends BareHitTestRequest {
  constructor(ctx, editorPos, pos, relativePos, eventTarget) {
    super(ctx, editorPos, pos, relativePos);
    this.hitTestResult = new Lazy(() => MouseTargetFactory.doHitTest(this._ctx, this));
    this._targetPathCacheElement = null;
    this._targetPathCacheValue = new Uint8Array(0);
    this._ctx = ctx;
    this._eventTarget = eventTarget;
    const hasEventTarget = Boolean(this._eventTarget);
    this._useHitTestTarget = !hasEventTarget;
  }
  get target() {
    if (this._useHitTestTarget) {
      return this.hitTestResult.value.hitTarget;
    }
    return this._eventTarget;
  }
  get targetPath() {
    if (this._targetPathCacheElement !== this.target) {
      this._targetPathCacheElement = this.target;
      this._targetPathCacheValue = PartFingerprints.collect(this.target, this._ctx.viewDomNode);
    }
    return this._targetPathCacheValue;
  }
  toString() {
    return `pos(${this.pos.x},${this.pos.y}), editorPos(${this.editorPos.x},${this.editorPos.y}), relativePos(${this.relativePos.x},${this.relativePos.y}), mouseVerticalOffset: ${this.mouseVerticalOffset}, mouseContentHorizontalOffset: ${this.mouseContentHorizontalOffset}
	target: ${this.target ? this.target.outerHTML : null}`;
  }
  get wouldBenefitFromHitTestTargetSwitch() {
    return !this._useHitTestTarget && this.hitTestResult.value.hitTarget !== null && this.target !== this.hitTestResult.value.hitTarget;
  }
  switchToHitTestTarget() {
    this._useHitTestTarget = true;
  }
  _getMouseColumn(position = null) {
    if (position && position.column < this._ctx.viewModel.getLineMaxColumn(position.lineNumber)) {
      return CursorColumns.visibleColumnFromColumn(this._ctx.viewModel.getLineContent(position.lineNumber), position.column, this._ctx.viewModel.model.getOptions().tabSize) + 1;
    }
    return this.mouseColumn;
  }
  fulfillUnknown(position = null) {
    return MouseTarget.createUnknown(this.target, this._getMouseColumn(position), position);
  }
  fulfillTextarea() {
    return MouseTarget.createTextarea(this.target, this._getMouseColumn());
  }
  fulfillMargin(type, position, range, detail) {
    return MouseTarget.createMargin(type, this.target, this._getMouseColumn(position), position, range, detail);
  }
  fulfillViewZone(type, position, detail) {
    return MouseTarget.createViewZone(type, this.target, this._getMouseColumn(), position, detail);
  }
  fulfillContentText(position, range, detail) {
    return MouseTarget.createContentText(this.target, this._getMouseColumn(position), position, range, detail);
  }
  fulfillContentEmpty(position, detail) {
    return MouseTarget.createContentEmpty(this.target, this._getMouseColumn(position), position, detail);
  }
  fulfillContentWidget(detail) {
    return MouseTarget.createContentWidget(this.target, this._getMouseColumn(), detail);
  }
  fulfillScrollbar(position) {
    return MouseTarget.createScrollbar(this.target, this._getMouseColumn(position), position);
  }
  fulfillOverlayWidget(detail) {
    return MouseTarget.createOverlayWidget(this.target, this._getMouseColumn(), detail);
  }
}
const EMPTY_CONTENT_AFTER_LINES = { isAfterLines: true };
function createEmptyContentDataInLines(horizontalDistanceToText) {
  return {
    isAfterLines: false,
    horizontalDistanceToText
  };
}
class MouseTargetFactory {
  constructor(context, viewHelper) {
    this._context = context;
    this._viewHelper = viewHelper;
  }
  mouseTargetIsWidget(e) {
    const t = e.target;
    const path = PartFingerprints.collect(t, this._viewHelper.viewDomNode);
    if (ElementPath.isChildOfContentWidgets(path) || ElementPath.isChildOfOverflowingContentWidgets(path)) {
      return true;
    }
    if (ElementPath.isChildOfOverlayWidgets(path) || ElementPath.isChildOfOverflowingOverlayWidgets(path)) {
      return true;
    }
    return false;
  }
  createMouseTarget(lastRenderData, editorPos, pos, relativePos, target) {
    const ctx = new HitTestContext(this._context, this._viewHelper, lastRenderData);
    const request = new HitTestRequest(ctx, editorPos, pos, relativePos, target);
    try {
      const r = MouseTargetFactory._createMouseTarget(ctx, request);
      if (r.type === MouseTargetType.CONTENT_TEXT) {
        if (ctx.stickyTabStops && r.position !== null) {
          const position = MouseTargetFactory._snapToSoftTabBoundary(r.position, ctx.viewModel);
          const range = EditorRange.fromPositions(position, position).plusRange(r.range);
          return request.fulfillContentText(position, range, r.detail);
        }
      }
      return r;
    } catch (err) {
      return request.fulfillUnknown();
    }
  }
  static _createMouseTarget(ctx, request) {
    if (request.target === null) {
      return request.fulfillUnknown();
    }
    const resolvedRequest = request;
    let result = null;
    if (!ElementPath.isChildOfOverflowGuard(request.targetPath) && !ElementPath.isChildOfOverflowingContentWidgets(request.targetPath) && !ElementPath.isChildOfOverflowingOverlayWidgets(request.targetPath)) {
      result = result || request.fulfillUnknown();
    }
    result = result || MouseTargetFactory._hitTestContentWidget(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestOverlayWidget(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestMinimap(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestScrollbarSlider(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestViewZone(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestMargin(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestViewCursor(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestTextArea(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestViewLines(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestScrollbar(ctx, resolvedRequest);
    return result || request.fulfillUnknown();
  }
  static _hitTestContentWidget(ctx, request) {
    if (ElementPath.isChildOfContentWidgets(request.targetPath) || ElementPath.isChildOfOverflowingContentWidgets(request.targetPath)) {
      const widgetId = ctx.findAttribute(request.target, "widgetId");
      if (widgetId) {
        return request.fulfillContentWidget(widgetId);
      } else {
        return request.fulfillUnknown();
      }
    }
    return null;
  }
  static _hitTestOverlayWidget(ctx, request) {
    if (ElementPath.isChildOfOverlayWidgets(request.targetPath) || ElementPath.isChildOfOverflowingOverlayWidgets(request.targetPath)) {
      const widgetId = ctx.findAttribute(request.target, "widgetId");
      if (widgetId) {
        return request.fulfillOverlayWidget(widgetId);
      } else {
        return request.fulfillUnknown();
      }
    }
    return null;
  }
  static _hitTestViewCursor(ctx, request) {
    if (request.target) {
      const lastViewCursorsRenderData = ctx.lastRenderData.lastViewCursorsRenderData;
      for (const d of lastViewCursorsRenderData) {
        if (request.target === d.domNode) {
          return request.fulfillContentText(d.position, null, { mightBeForeignElement: false, injectedText: null });
        }
      }
    }
    if (request.isInContentArea) {
      const lastViewCursorsRenderData = ctx.lastRenderData.lastViewCursorsRenderData;
      const mouseContentHorizontalOffset = request.mouseContentHorizontalOffset;
      const mouseVerticalOffset = request.mouseVerticalOffset;
      for (const d of lastViewCursorsRenderData) {
        if (mouseContentHorizontalOffset < d.contentLeft) {
          continue;
        }
        if (mouseContentHorizontalOffset > d.contentLeft + d.width) {
          continue;
        }
        const cursorVerticalOffset = ctx.getVerticalOffsetForLineNumber(d.position.lineNumber);
        if (cursorVerticalOffset <= mouseVerticalOffset && mouseVerticalOffset <= cursorVerticalOffset + d.height) {
          return request.fulfillContentText(d.position, null, { mightBeForeignElement: false, injectedText: null });
        }
      }
    }
    return null;
  }
  static _hitTestViewZone(ctx, request) {
    const viewZoneData = ctx.getZoneAtCoord(request.mouseVerticalOffset);
    if (viewZoneData) {
      const mouseTargetType = request.isInContentArea ? MouseTargetType.CONTENT_VIEW_ZONE : MouseTargetType.GUTTER_VIEW_ZONE;
      return request.fulfillViewZone(mouseTargetType, viewZoneData.position, viewZoneData);
    }
    return null;
  }
  static _hitTestTextArea(ctx, request) {
    if (ElementPath.isTextArea(request.targetPath)) {
      if (ctx.lastRenderData.lastTextareaPosition) {
        return request.fulfillContentText(ctx.lastRenderData.lastTextareaPosition, null, { mightBeForeignElement: false, injectedText: null });
      }
      return request.fulfillTextarea();
    }
    return null;
  }
  static _hitTestMargin(ctx, request) {
    if (request.isInMarginArea) {
      const res = ctx.getFullLineRangeAtCoord(request.mouseVerticalOffset);
      const pos = res.range.getStartPosition();
      let offset = Math.abs(request.relativePos.x);
      const detail = {
        isAfterLines: res.isAfterLines,
        glyphMarginLeft: ctx.layoutInfo.glyphMarginLeft,
        glyphMarginWidth: ctx.layoutInfo.glyphMarginWidth,
        lineNumbersWidth: ctx.layoutInfo.lineNumbersWidth,
        offsetX: offset
      };
      offset -= ctx.layoutInfo.glyphMarginLeft;
      if (offset <= ctx.layoutInfo.glyphMarginWidth) {
        const modelCoordinate = ctx.viewModel.coordinatesConverter.convertViewPositionToModelPosition(res.range.getStartPosition());
        const lanes = ctx.viewModel.glyphLanes.getLanesAtLine(modelCoordinate.lineNumber);
        detail.glyphMarginLane = lanes[Math.floor(offset / ctx.lineHeight)];
        return request.fulfillMargin(MouseTargetType.GUTTER_GLYPH_MARGIN, pos, res.range, detail);
      }
      offset -= ctx.layoutInfo.glyphMarginWidth;
      if (offset <= ctx.layoutInfo.lineNumbersWidth) {
        return request.fulfillMargin(MouseTargetType.GUTTER_LINE_NUMBERS, pos, res.range, detail);
      }
      offset -= ctx.layoutInfo.lineNumbersWidth;
      return request.fulfillMargin(MouseTargetType.GUTTER_LINE_DECORATIONS, pos, res.range, detail);
    }
    return null;
  }
  static _hitTestViewLines(ctx, request) {
    if (!ElementPath.isChildOfViewLines(request.targetPath)) {
      return null;
    }
    if (ctx.isInTopPadding(request.mouseVerticalOffset)) {
      return request.fulfillContentEmpty(new Position(1, 1), EMPTY_CONTENT_AFTER_LINES);
    }
    if (ctx.isAfterLines(request.mouseVerticalOffset) || ctx.isInBottomPadding(request.mouseVerticalOffset)) {
      const lineCount = ctx.viewModel.getLineCount();
      const maxLineColumn = ctx.viewModel.getLineMaxColumn(lineCount);
      return request.fulfillContentEmpty(new Position(lineCount, maxLineColumn), EMPTY_CONTENT_AFTER_LINES);
    }
    if (ElementPath.isStrictChildOfViewLines(request.targetPath)) {
      const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
      const lineLength = ctx.viewModel.getLineLength(lineNumber);
      const lineWidth = ctx.getLineWidth(lineNumber);
      if (lineLength === 0) {
        const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
        return request.fulfillContentEmpty(new Position(lineNumber, 1), detail);
      }
      const isRtl = ctx.isRtl(lineNumber);
      if (isRtl) {
        if (request.mouseContentHorizontalOffset + lineWidth <= ctx.layoutInfo.contentWidth - ctx.layoutInfo.verticalScrollbarWidth) {
          const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
          const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
          return request.fulfillContentEmpty(pos, detail);
        }
      } else if (request.mouseContentHorizontalOffset >= lineWidth) {
        const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
        const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
        return request.fulfillContentEmpty(pos, detail);
      }
    } else {
      if (ctx.viewLinesGpu) {
        const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
        if (ctx.viewModel.getLineLength(lineNumber) === 0) {
          const lineWidth2 = ctx.getLineWidth(lineNumber);
          const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth2);
          return request.fulfillContentEmpty(new Position(lineNumber, 1), detail);
        }
        const lineWidth = ctx.getLineWidth(lineNumber);
        const isRtl = ctx.isRtl(lineNumber);
        if (isRtl) {
          if (request.mouseContentHorizontalOffset + lineWidth <= ctx.layoutInfo.contentWidth - ctx.layoutInfo.verticalScrollbarWidth) {
            const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
            const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
            return request.fulfillContentEmpty(pos, detail);
          }
        } else if (request.mouseContentHorizontalOffset >= lineWidth) {
          const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
          const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
          return request.fulfillContentEmpty(pos, detail);
        }
        const position = ctx.viewLinesGpu.getPositionAtCoordinate(lineNumber, request.mouseContentHorizontalOffset);
        if (position) {
          const detail = {
            injectedText: null,
            mightBeForeignElement: false
          };
          return request.fulfillContentText(position, EditorRange.fromPositions(position, position), detail);
        }
      }
    }
    const hitTestResult = request.hitTestResult.value;
    if (hitTestResult.type === 1 /* Content */) {
      return MouseTargetFactory.createMouseTargetFromHitTestPosition(ctx, request, hitTestResult.spanNode, hitTestResult.position, hitTestResult.injectedText);
    }
    if (request.wouldBenefitFromHitTestTargetSwitch) {
      request.switchToHitTestTarget();
      return this._createMouseTarget(ctx, request);
    }
    return request.fulfillUnknown();
  }
  static _hitTestMinimap(ctx, request) {
    if (ElementPath.isChildOfMinimap(request.targetPath)) {
      const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
      const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
      return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
    }
    return null;
  }
  static _hitTestScrollbarSlider(ctx, request) {
    if (ElementPath.isChildOfScrollableElement(request.targetPath)) {
      if (request.target && request.target.nodeType === 1) {
        const className = request.target.className;
        if (className && /\b(slider|scrollbar)\b/.test(className)) {
          const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
          const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
          return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
        }
      }
    }
    return null;
  }
  static _hitTestScrollbar(ctx, request) {
    if (ElementPath.isChildOfScrollableElement(request.targetPath)) {
      const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
      const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
      return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
    }
    return null;
  }
  getMouseColumn(relativePos) {
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const mouseContentHorizontalOffset = this._context.viewLayout.getCurrentScrollLeft() + relativePos.x - layoutInfo.contentLeft;
    return MouseTargetFactory._getMouseColumn(mouseContentHorizontalOffset, options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth);
  }
  static _getMouseColumn(mouseContentHorizontalOffset, typicalHalfwidthCharacterWidth) {
    if (mouseContentHorizontalOffset < 0) {
      return 1;
    }
    const chars = Math.round(mouseContentHorizontalOffset / typicalHalfwidthCharacterWidth);
    return chars + 1;
  }
  static createMouseTargetFromHitTestPosition(ctx, request, spanNode, pos, injectedText) {
    const lineNumber = pos.lineNumber;
    const column = pos.column;
    const lineWidth = ctx.getLineWidth(lineNumber);
    if (request.mouseContentHorizontalOffset > lineWidth) {
      const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
      return request.fulfillContentEmpty(pos, detail);
    }
    const visibleRange = ctx.visibleRangeForPosition(lineNumber, column);
    if (!visibleRange) {
      return request.fulfillUnknown(pos);
    }
    const columnHorizontalOffset = visibleRange.left;
    if (Math.abs(request.mouseContentHorizontalOffset - columnHorizontalOffset) < 1) {
      return request.fulfillContentText(pos, null, { mightBeForeignElement: !!injectedText, injectedText });
    }
    const points = [];
    points.push({ offset: visibleRange.left, column });
    if (column > 1) {
      const visibleRange2 = ctx.visibleRangeForPosition(lineNumber, column - 1);
      if (visibleRange2) {
        points.push({ offset: visibleRange2.left, column: column - 1 });
      }
    }
    const lineMaxColumn = ctx.viewModel.getLineMaxColumn(lineNumber);
    if (column < lineMaxColumn) {
      const visibleRange2 = ctx.visibleRangeForPosition(lineNumber, column + 1);
      if (visibleRange2) {
        points.push({ offset: visibleRange2.left, column: column + 1 });
      }
    }
    points.sort((a, b) => a.offset - b.offset);
    const mouseCoordinates = request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode));
    const spanNodeClientRect = spanNode.getBoundingClientRect();
    const mouseIsOverSpanNode = spanNodeClientRect.left <= mouseCoordinates.clientX && mouseCoordinates.clientX <= spanNodeClientRect.right;
    let rng = null;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      if (prev.offset <= request.mouseContentHorizontalOffset && request.mouseContentHorizontalOffset <= curr.offset) {
        rng = new EditorRange(lineNumber, prev.column, lineNumber, curr.column);
        const prevDelta = Math.abs(prev.offset - request.mouseContentHorizontalOffset);
        const nextDelta = Math.abs(curr.offset - request.mouseContentHorizontalOffset);
        pos = prevDelta < nextDelta ? new Position(lineNumber, prev.column) : new Position(lineNumber, curr.column);
        break;
      }
    }
    return request.fulfillContentText(pos, rng, { mightBeForeignElement: !mouseIsOverSpanNode || !!injectedText, injectedText });
  }
  /**
   * Most probably WebKit browsers and Edge
   */
  static _doHitTestWithCaretRangeFromPoint(ctx, request) {
    const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
    const lineStartVerticalOffset = ctx.getVerticalOffsetForLineNumber(lineNumber);
    const lineEndVerticalOffset = lineStartVerticalOffset + ctx.lineHeight;
    const isBelowLastLine = lineNumber === ctx.viewModel.getLineCount() && request.mouseVerticalOffset > lineEndVerticalOffset;
    if (!isBelowLastLine) {
      const lineCenteredVerticalOffset = Math.floor((lineStartVerticalOffset + lineEndVerticalOffset) / 2);
      let adjustedPageY = request.pos.y + (lineCenteredVerticalOffset - request.mouseVerticalOffset);
      if (adjustedPageY <= request.editorPos.y) {
        adjustedPageY = request.editorPos.y + 1;
      }
      if (adjustedPageY >= request.editorPos.y + request.editorPos.height) {
        adjustedPageY = request.editorPos.y + request.editorPos.height - 1;
      }
      const adjustedPage = new PageCoordinates(request.pos.x, adjustedPageY);
      const r = this._actualDoHitTestWithCaretRangeFromPoint(ctx, adjustedPage.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
      if (r.type === 1 /* Content */) {
        return r;
      }
    }
    return this._actualDoHitTestWithCaretRangeFromPoint(ctx, request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
  }
  static _actualDoHitTestWithCaretRangeFromPoint(ctx, coords) {
    const shadowRoot = dom.getShadowRoot(ctx.viewDomNode);
    let range;
    if (shadowRoot) {
      if (typeof shadowRoot.caretRangeFromPoint === "undefined") {
        range = shadowCaretRangeFromPoint(shadowRoot, coords.clientX, coords.clientY);
      } else {
        range = shadowRoot.caretRangeFromPoint(coords.clientX, coords.clientY);
      }
    } else {
      range = ctx.viewDomNode.ownerDocument.caretRangeFromPoint(coords.clientX, coords.clientY);
    }
    if (!range || !range.startContainer) {
      return new UnknownHitTestResult();
    }
    const startContainer = range.startContainer;
    if (startContainer.nodeType === startContainer.TEXT_NODE) {
      const parent1 = startContainer.parentNode;
      const parent2 = parent1 ? parent1.parentNode : null;
      const parent3 = parent2 ? parent2.parentNode : null;
      const parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? parent3.className : null;
      if (parent3ClassName === ViewLine.CLASS_NAME) {
        return HitTestResult.createFromDOMInfo(ctx, parent1, range.startOffset);
      } else {
        return new UnknownHitTestResult(startContainer.parentNode);
      }
    } else if (startContainer.nodeType === startContainer.ELEMENT_NODE) {
      const parent1 = startContainer.parentNode;
      const parent2 = parent1 ? parent1.parentNode : null;
      const parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? parent2.className : null;
      if (parent2ClassName === ViewLine.CLASS_NAME) {
        return HitTestResult.createFromDOMInfo(ctx, startContainer, startContainer.textContent.length);
      } else {
        return new UnknownHitTestResult(startContainer);
      }
    }
    return new UnknownHitTestResult();
  }
  /**
   * Most probably Gecko
   */
  static _doHitTestWithCaretPositionFromPoint(ctx, coords) {
    const hitResult = ctx.viewDomNode.ownerDocument.caretPositionFromPoint(coords.clientX, coords.clientY);
    if (hitResult.offsetNode.nodeType === hitResult.offsetNode.TEXT_NODE) {
      const parent1 = hitResult.offsetNode.parentNode;
      const parent2 = parent1 ? parent1.parentNode : null;
      const parent3 = parent2 ? parent2.parentNode : null;
      const parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? parent3.className : null;
      if (parent3ClassName === ViewLine.CLASS_NAME) {
        return HitTestResult.createFromDOMInfo(ctx, hitResult.offsetNode.parentNode, hitResult.offset);
      } else {
        return new UnknownHitTestResult(hitResult.offsetNode.parentNode);
      }
    }
    if (hitResult.offsetNode.nodeType === hitResult.offsetNode.ELEMENT_NODE) {
      const parent1 = hitResult.offsetNode.parentNode;
      const parent1ClassName = parent1 && parent1.nodeType === parent1.ELEMENT_NODE ? parent1.className : null;
      const parent2 = parent1 ? parent1.parentNode : null;
      const parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? parent2.className : null;
      if (parent1ClassName === ViewLine.CLASS_NAME) {
        const tokenSpan = hitResult.offsetNode.childNodes[Math.min(hitResult.offset, hitResult.offsetNode.childNodes.length - 1)];
        if (tokenSpan) {
          return HitTestResult.createFromDOMInfo(ctx, tokenSpan, 0);
        }
      } else if (parent2ClassName === ViewLine.CLASS_NAME) {
        return HitTestResult.createFromDOMInfo(ctx, hitResult.offsetNode, 0);
      }
    }
    return new UnknownHitTestResult(hitResult.offsetNode);
  }
  static _snapToSoftTabBoundary(position, viewModel) {
    const lineContent = viewModel.getLineContent(position.lineNumber);
    const { tabSize } = viewModel.model.getOptions();
    const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, position.column - 1, tabSize, Direction.Nearest);
    if (newPosition !== -1) {
      return new Position(position.lineNumber, newPosition + 1);
    }
    return position;
  }
  static doHitTest(ctx, request) {
    let result = new UnknownHitTestResult();
    if (typeof ctx.viewDomNode.ownerDocument.caretRangeFromPoint === "function") {
      result = this._doHitTestWithCaretRangeFromPoint(ctx, request);
    } else if (ctx.viewDomNode.ownerDocument.caretPositionFromPoint) {
      result = this._doHitTestWithCaretPositionFromPoint(ctx, request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
    }
    if (result.type === 1 /* Content */) {
      const injectedText = ctx.viewModel.getInjectedTextAt(result.position);
      const normalizedPosition = ctx.viewModel.normalizePosition(result.position, PositionAffinity.None);
      if (injectedText || !normalizedPosition.equals(result.position)) {
        result = new ContentHitTestResult(normalizedPosition, result.spanNode, injectedText);
      }
    }
    return result;
  }
}
function shadowCaretRangeFromPoint(shadowRoot, x, y) {
  const range = document.createRange();
  let el = shadowRoot.elementFromPoint(x, y);
  if (el?.hasChildNodes()) {
    while (el && el.firstChild && el.firstChild.nodeType !== el.firstChild.TEXT_NODE && el.lastChild && el.lastChild.firstChild) {
      el = el.lastChild;
    }
    const rect = el.getBoundingClientRect();
    const elWindow = dom.getWindow(el);
    const computedStyle = elWindow.getComputedStyle(el, null);
    const fontStyle = computedStyle.getPropertyValue("font-style");
    const fontVariant = computedStyle.getPropertyValue("font-variant");
    const fontWeight = computedStyle.getPropertyValue("font-weight");
    const fontSize = computedStyle.getPropertyValue("font-size");
    const lineHeight = computedStyle.getPropertyValue("line-height");
    const fontFamily = computedStyle.getPropertyValue("font-family");
    const font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}/${lineHeight} ${fontFamily}`;
    const text = el.innerText;
    let pixelCursor = rect.left;
    let offset = 0;
    let step;
    if (x > rect.left + rect.width) {
      offset = text.length;
    } else {
      const charWidthReader = CharWidthReader.getInstance();
      for (let i = 0; i < text.length + 1; i++) {
        step = charWidthReader.getCharWidth(text.charAt(i), font) / 2;
        pixelCursor += step;
        if (x < pixelCursor) {
          offset = i;
          break;
        }
        pixelCursor += step;
      }
    }
    range.setStart(el.firstChild, offset);
    range.setEnd(el.firstChild, offset);
  }
  return range;
}
const _CharWidthReader = class _CharWidthReader {
  static getInstance() {
    if (!_CharWidthReader._INSTANCE) {
      _CharWidthReader._INSTANCE = new _CharWidthReader();
    }
    return _CharWidthReader._INSTANCE;
  }
  constructor() {
    this._cache = {};
    this._canvas = document.createElement("canvas");
  }
  getCharWidth(char, font) {
    const cacheKey = char + font;
    if (this._cache[cacheKey]) {
      return this._cache[cacheKey];
    }
    const context = this._canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(char);
    const width = metrics.width;
    this._cache[cacheKey] = width;
    return width;
  }
};
_CharWidthReader._INSTANCE = null;
let CharWidthReader = _CharWidthReader;
export {
  HitTestContext,
  MouseTarget,
  MouseTargetFactory,
  PointerHandlerLastRenderData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGNvbnRyb2xsZXJcXG1vdXNlVGFyZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVBvaW50ZXJIYW5kbGVySGVscGVyIH0gZnJvbSAnLi9tb3VzZUhhbmRsZXIuanMnO1xuaW1wb3J0IHsgSU1vdXNlVGFyZ2V0Q29udGVudEVtcHR5RGF0YSwgSU1vdXNlVGFyZ2V0TWFyZ2luRGF0YSwgSU1vdXNlVGFyZ2V0LCBJTW91c2VUYXJnZXRDb250ZW50RW1wdHksIElNb3VzZVRhcmdldENvbnRlbnRUZXh0LCBJTW91c2VUYXJnZXRDb250ZW50V2lkZ2V0LCBJTW91c2VUYXJnZXRNYXJnaW4sIElNb3VzZVRhcmdldE91dHNpZGVFZGl0b3IsIElNb3VzZVRhcmdldE92ZXJsYXlXaWRnZXQsIElNb3VzZVRhcmdldFNjcm9sbGJhciwgSU1vdXNlVGFyZ2V0VGV4dGFyZWEsIElNb3VzZVRhcmdldFVua25vd24sIElNb3VzZVRhcmdldFZpZXdab25lLCBJTW91c2VUYXJnZXRDb250ZW50VGV4dERhdGEsIElNb3VzZVRhcmdldFZpZXdab25lRGF0YSwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDbGllbnRDb29yZGluYXRlcywgRWRpdG9yTW91c2VFdmVudCwgRWRpdG9yUGFnZVBvc2l0aW9uLCBQYWdlQ29vcmRpbmF0ZXMsIENvb3JkaW5hdGVzUmVsYXRpdmVUb0VkaXRvciB9IGZyb20gJy4uL2VkaXRvckRvbS5qcyc7XG5pbXBvcnQgeyBQYXJ0RmluZ2VycHJpbnQsIFBhcnRGaW5nZXJwcmludHMgfSBmcm9tICcuLi92aWV3L3ZpZXdQYXJ0LmpzJztcbmltcG9ydCB7IFZpZXdMaW5lIH0gZnJvbSAnLi4vdmlld1BhcnRzL3ZpZXdMaW5lcy92aWV3TGluZS5qcyc7XG5pbXBvcnQgeyBJVmlld0N1cnNvclJlbmRlckRhdGEgfSBmcm9tICcuLi92aWV3UGFydHMvdmlld0N1cnNvcnMvdmlld0N1cnNvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JMYXlvdXRJbmZvLCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSBhcyBFZGl0b3JSYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEhvcml6b250YWxQb3NpdGlvbiB9IGZyb20gJy4uL3ZpZXcvcmVuZGVyaW5nQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuaW1wb3J0IHsgSVZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29sdW1ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL2N1cnNvckNvbHVtbnMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQXRvbWljVGFiTW92ZU9wZXJhdGlvbnMsIERpcmVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXJzb3IvY3Vyc29yQXRvbWljTW92ZU9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb25BZmZpbml0eSwgVGV4dERpcmVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmplY3RlZFRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWxMaW5lUHJvamVjdGlvbkRhdGEuanMnO1xuaW1wb3J0IHsgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0xpbmVzR3B1IH0gZnJvbSAnLi4vdmlld1BhcnRzL3ZpZXdMaW5lc0dwdS92aWV3TGluZXNHcHUuanMnO1xuXG5jb25zdCBlbnVtIEhpdFRlc3RSZXN1bHRUeXBlIHtcblx0VW5rbm93bixcblx0Q29udGVudCxcbn1cblxuY2xhc3MgVW5rbm93bkhpdFRlc3RSZXN1bHQge1xuXHRyZWFkb25seSB0eXBlID0gSGl0VGVzdFJlc3VsdFR5cGUuVW5rbm93bjtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaGl0VGFyZ2V0OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsXG5cdCkgeyB9XG59XG5cbmNsYXNzIENvbnRlbnRIaXRUZXN0UmVzdWx0IHtcblx0cmVhZG9ubHkgdHlwZSA9IEhpdFRlc3RSZXN1bHRUeXBlLkNvbnRlbnQ7XG5cblx0Z2V0IGhpdFRhcmdldCgpOiBIVE1MRWxlbWVudCB7IHJldHVybiB0aGlzLnNwYW5Ob2RlOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcG9zaXRpb246IFBvc2l0aW9uLFxuXHRcdHJlYWRvbmx5IHNwYW5Ob2RlOiBIVE1MRWxlbWVudCxcblx0XHRyZWFkb25seSBpbmplY3RlZFRleHQ6IEluamVjdGVkVGV4dCB8IG51bGwsXG5cdCkgeyB9XG59XG5cbnR5cGUgSGl0VGVzdFJlc3VsdCA9IFVua25vd25IaXRUZXN0UmVzdWx0IHwgQ29udGVudEhpdFRlc3RSZXN1bHQ7XG5cbm5hbWVzcGFjZSBIaXRUZXN0UmVzdWx0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUZyb21ET01JbmZvKGN0eDogSGl0VGVzdENvbnRleHQsIHNwYW5Ob2RlOiBIVE1MRWxlbWVudCwgb2Zmc2V0OiBudW1iZXIpOiBIaXRUZXN0UmVzdWx0IHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IGN0eC5nZXRQb3NpdGlvbkZyb21ET01JbmZvKHNwYW5Ob2RlLCBvZmZzZXQpO1xuXHRcdGlmIChwb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuIG5ldyBDb250ZW50SGl0VGVzdFJlc3VsdChwb3NpdGlvbiwgc3Bhbk5vZGUsIG51bGwpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFVua25vd25IaXRUZXN0UmVzdWx0KHNwYW5Ob2RlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUG9pbnRlckhhbmRsZXJMYXN0UmVuZGVyRGF0YSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBsYXN0Vmlld0N1cnNvcnNSZW5kZXJEYXRhOiBJVmlld0N1cnNvclJlbmRlckRhdGFbXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFzdFRleHRhcmVhUG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgTW91c2VUYXJnZXQge1xuXG5cdHByaXZhdGUgc3RhdGljIF9kZWR1Y2VSYWdlKHBvc2l0aW9uOiBQb3NpdGlvbik6IEVkaXRvclJhbmdlO1xuXHRwcml2YXRlIHN0YXRpYyBfZGVkdWNlUmFnZShwb3NpdGlvbjogUG9zaXRpb24sIHJhbmdlOiBFZGl0b3JSYW5nZSB8IG51bGwpOiBFZGl0b3JSYW5nZTtcblx0cHJpdmF0ZSBzdGF0aWMgX2RlZHVjZVJhZ2UocG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbCk6IEVkaXRvclJhbmdlIHwgbnVsbDtcblx0cHJpdmF0ZSBzdGF0aWMgX2RlZHVjZVJhZ2UocG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbCwgcmFuZ2U6IEVkaXRvclJhbmdlIHwgbnVsbCA9IG51bGwpOiBFZGl0b3JSYW5nZSB8IG51bGwge1xuXHRcdGlmICghcmFuZ2UgJiYgcG9zaXRpb24pIHtcblx0XHRcdHJldHVybiBuZXcgRWRpdG9yUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmFuZ2UgPz8gbnVsbDtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZVVua25vd24oZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsLCBtb3VzZUNvbHVtbjogbnVtYmVyLCBwb3NpdGlvbjogUG9zaXRpb24gfCBudWxsKTogSU1vdXNlVGFyZ2V0VW5rbm93biB7XG5cdFx0cmV0dXJuIHsgdHlwZTogTW91c2VUYXJnZXRUeXBlLlVOS05PV04sIGVsZW1lbnQsIG1vdXNlQ29sdW1uLCBwb3NpdGlvbiwgcmFuZ2U6IHRoaXMuX2RlZHVjZVJhZ2UocG9zaXRpb24pIH07XG5cdH1cblx0cHVibGljIHN0YXRpYyBjcmVhdGVUZXh0YXJlYShlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwsIG1vdXNlQ29sdW1uOiBudW1iZXIpOiBJTW91c2VUYXJnZXRUZXh0YXJlYSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogTW91c2VUYXJnZXRUeXBlLlRFWFRBUkVBLCBlbGVtZW50LCBtb3VzZUNvbHVtbiwgcG9zaXRpb246IG51bGwsIHJhbmdlOiBudWxsIH07XG5cdH1cblx0cHVibGljIHN0YXRpYyBjcmVhdGVNYXJnaW4odHlwZTogTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9HTFlQSF9NQVJHSU4gfCBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfTlVNQkVSUyB8IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUywgZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsLCBtb3VzZUNvbHVtbjogbnVtYmVyLCBwb3NpdGlvbjogUG9zaXRpb24sIHJhbmdlOiBFZGl0b3JSYW5nZSwgZGV0YWlsOiBJTW91c2VUYXJnZXRNYXJnaW5EYXRhKTogSU1vdXNlVGFyZ2V0TWFyZ2luIHtcblx0XHRyZXR1cm4geyB0eXBlLCBlbGVtZW50LCBtb3VzZUNvbHVtbiwgcG9zaXRpb24sIHJhbmdlLCBkZXRhaWwgfTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZVZpZXdab25lKHR5cGU6IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfVklFV19aT05FIHwgTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVklFV19aT05FLCBlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwsIG1vdXNlQ29sdW1uOiBudW1iZXIsIHBvc2l0aW9uOiBQb3NpdGlvbiwgZGV0YWlsOiBJTW91c2VUYXJnZXRWaWV3Wm9uZURhdGEpOiBJTW91c2VUYXJnZXRWaWV3Wm9uZSB7XG5cdFx0cmV0dXJuIHsgdHlwZSwgZWxlbWVudCwgbW91c2VDb2x1bW4sIHBvc2l0aW9uLCByYW5nZTogdGhpcy5fZGVkdWNlUmFnZShwb3NpdGlvbiksIGRldGFpbCB9O1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlQ29udGVudFRleHQoZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsLCBtb3VzZUNvbHVtbjogbnVtYmVyLCBwb3NpdGlvbjogUG9zaXRpb24sIHJhbmdlOiBFZGl0b3JSYW5nZSB8IG51bGwsIGRldGFpbDogSU1vdXNlVGFyZ2V0Q29udGVudFRleHREYXRhKTogSU1vdXNlVGFyZ2V0Q29udGVudFRleHQge1xuXHRcdHJldHVybiB7IHR5cGU6IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1RFWFQsIGVsZW1lbnQsIG1vdXNlQ29sdW1uLCBwb3NpdGlvbiwgcmFuZ2U6IHRoaXMuX2RlZHVjZVJhZ2UocG9zaXRpb24sIHJhbmdlKSwgZGV0YWlsIH07XG5cdH1cblx0cHVibGljIHN0YXRpYyBjcmVhdGVDb250ZW50RW1wdHkoZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsLCBtb3VzZUNvbHVtbjogbnVtYmVyLCBwb3NpdGlvbjogUG9zaXRpb24sIGRldGFpbDogSU1vdXNlVGFyZ2V0Q29udGVudEVtcHR5RGF0YSk6IElNb3VzZVRhcmdldENvbnRlbnRFbXB0eSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfRU1QVFksIGVsZW1lbnQsIG1vdXNlQ29sdW1uLCBwb3NpdGlvbiwgcmFuZ2U6IHRoaXMuX2RlZHVjZVJhZ2UocG9zaXRpb24pLCBkZXRhaWwgfTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZUNvbnRlbnRXaWRnZXQoZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsLCBtb3VzZUNvbHVtbjogbnVtYmVyLCBkZXRhaWw6IHN0cmluZyk6IElNb3VzZVRhcmdldENvbnRlbnRXaWRnZXQge1xuXHRcdHJldHVybiB7IHR5cGU6IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1dJREdFVCwgZWxlbWVudCwgbW91c2VDb2x1bW4sIHBvc2l0aW9uOiBudWxsLCByYW5nZTogbnVsbCwgZGV0YWlsIH07XG5cdH1cblx0cHVibGljIHN0YXRpYyBjcmVhdGVTY3JvbGxiYXIoZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsLCBtb3VzZUNvbHVtbjogbnVtYmVyLCBwb3NpdGlvbjogUG9zaXRpb24pOiBJTW91c2VUYXJnZXRTY3JvbGxiYXIge1xuXHRcdHJldHVybiB7IHR5cGU6IE1vdXNlVGFyZ2V0VHlwZS5TQ1JPTExCQVIsIGVsZW1lbnQsIG1vdXNlQ29sdW1uLCBwb3NpdGlvbiwgcmFuZ2U6IHRoaXMuX2RlZHVjZVJhZ2UocG9zaXRpb24pIH07XG5cdH1cblx0cHVibGljIHN0YXRpYyBjcmVhdGVPdmVybGF5V2lkZ2V0KGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCwgbW91c2VDb2x1bW46IG51bWJlciwgZGV0YWlsOiBzdHJpbmcpOiBJTW91c2VUYXJnZXRPdmVybGF5V2lkZ2V0IHtcblx0XHRyZXR1cm4geyB0eXBlOiBNb3VzZVRhcmdldFR5cGUuT1ZFUkxBWV9XSURHRVQsIGVsZW1lbnQsIG1vdXNlQ29sdW1uLCBwb3NpdGlvbjogbnVsbCwgcmFuZ2U6IG51bGwsIGRldGFpbCB9O1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlT3V0c2lkZUVkaXRvcihtb3VzZUNvbHVtbjogbnVtYmVyLCBwb3NpdGlvbjogUG9zaXRpb24sIG91dHNpZGVQb3NpdGlvbjogJ2Fib3ZlJyB8ICdiZWxvdycgfCAnbGVmdCcgfCAncmlnaHQnLCBvdXRzaWRlRGlzdGFuY2U6IG51bWJlcik6IElNb3VzZVRhcmdldE91dHNpZGVFZGl0b3Ige1xuXHRcdHJldHVybiB7IHR5cGU6IE1vdXNlVGFyZ2V0VHlwZS5PVVRTSURFX0VESVRPUiwgZWxlbWVudDogbnVsbCwgbW91c2VDb2x1bW4sIHBvc2l0aW9uLCByYW5nZTogdGhpcy5fZGVkdWNlUmFnZShwb3NpdGlvbiksIG91dHNpZGVQb3NpdGlvbiwgb3V0c2lkZURpc3RhbmNlIH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfdHlwZVRvU3RyaW5nKHR5cGU6IE1vdXNlVGFyZ2V0VHlwZSk6IHN0cmluZyB7XG5cdFx0aWYgKHR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5URVhUQVJFQSkge1xuXHRcdFx0cmV0dXJuICdURVhUQVJFQSc7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0dMWVBIX01BUkdJTikge1xuXHRcdFx0cmV0dXJuICdHVVRURVJfR0xZUEhfTUFSR0lOJztcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9OVU1CRVJTKSB7XG5cdFx0XHRyZXR1cm4gJ0dVVFRFUl9MSU5FX05VTUJFUlMnO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX0RFQ09SQVRJT05TKSB7XG5cdFx0XHRyZXR1cm4gJ0dVVFRFUl9MSU5FX0RFQ09SQVRJT05TJztcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfVklFV19aT05FKSB7XG5cdFx0XHRyZXR1cm4gJ0dVVFRFUl9WSUVXX1pPTkUnO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCkge1xuXHRcdFx0cmV0dXJuICdDT05URU5UX1RFWFQnO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfRU1QVFkpIHtcblx0XHRcdHJldHVybiAnQ09OVEVOVF9FTVBUWSc7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9WSUVXX1pPTkUpIHtcblx0XHRcdHJldHVybiAnQ09OVEVOVF9WSUVXX1pPTkUnO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfV0lER0VUKSB7XG5cdFx0XHRyZXR1cm4gJ0NPTlRFTlRfV0lER0VUJztcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5PVkVSVklFV19SVUxFUikge1xuXHRcdFx0cmV0dXJuICdPVkVSVklFV19SVUxFUic7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSBNb3VzZVRhcmdldFR5cGUuU0NST0xMQkFSKSB7XG5cdFx0XHRyZXR1cm4gJ1NDUk9MTEJBUic7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSBNb3VzZVRhcmdldFR5cGUuT1ZFUkxBWV9XSURHRVQpIHtcblx0XHRcdHJldHVybiAnT1ZFUkxBWV9XSURHRVQnO1xuXHRcdH1cblx0XHRyZXR1cm4gJ1VOS05PV04nO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyB0b1N0cmluZyh0YXJnZXQ6IElNb3VzZVRhcmdldCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3R5cGVUb1N0cmluZyh0YXJnZXQudHlwZSkgKyAnOiAnICsgdGFyZ2V0LnBvc2l0aW9uICsgJyAtICcgKyB0YXJnZXQucmFuZ2UgKyAnIC0gJyArIEpTT04uc3RyaW5naWZ5KCh0YXJnZXQgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuZGV0YWlsKTtcblx0fVxufVxuXG5jbGFzcyBFbGVtZW50UGF0aCB7XG5cblx0cHVibGljIHN0YXRpYyBpc1RleHRBcmVhKHBhdGg6IFVpbnQ4QXJyYXkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0cGF0aC5sZW5ndGggPT09IDJcblx0XHRcdCYmIHBhdGhbMF0gPT09IFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd0d1YXJkXG5cdFx0XHQmJiBwYXRoWzFdID09PSBQYXJ0RmluZ2VycHJpbnQuVGV4dEFyZWFcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpc0NoaWxkT2ZWaWV3TGluZXMocGF0aDogVWludDhBcnJheSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHRwYXRoLmxlbmd0aCA+PSA0XG5cdFx0XHQmJiBwYXRoWzBdID09PSBQYXJ0RmluZ2VycHJpbnQuT3ZlcmZsb3dHdWFyZFxuXHRcdFx0JiYgcGF0aFszXSA9PT0gUGFydEZpbmdlcnByaW50LlZpZXdMaW5lc1xuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGlzU3RyaWN0Q2hpbGRPZlZpZXdMaW5lcyhwYXRoOiBVaW50OEFycmF5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHBhdGgubGVuZ3RoID4gNFxuXHRcdFx0JiYgcGF0aFswXSA9PT0gUGFydEZpbmdlcnByaW50Lk92ZXJmbG93R3VhcmRcblx0XHRcdCYmIHBhdGhbM10gPT09IFBhcnRGaW5nZXJwcmludC5WaWV3TGluZXNcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpc0NoaWxkT2ZTY3JvbGxhYmxlRWxlbWVudChwYXRoOiBVaW50OEFycmF5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHBhdGgubGVuZ3RoID49IDJcblx0XHRcdCYmIHBhdGhbMF0gPT09IFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd0d1YXJkXG5cdFx0XHQmJiBwYXRoWzFdID09PSBQYXJ0RmluZ2VycHJpbnQuU2Nyb2xsYWJsZUVsZW1lbnRcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpc0NoaWxkT2ZNaW5pbWFwKHBhdGg6IFVpbnQ4QXJyYXkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0cGF0aC5sZW5ndGggPj0gMlxuXHRcdFx0JiYgcGF0aFswXSA9PT0gUGFydEZpbmdlcnByaW50Lk92ZXJmbG93R3VhcmRcblx0XHRcdCYmIHBhdGhbMV0gPT09IFBhcnRGaW5nZXJwcmludC5NaW5pbWFwXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaXNDaGlsZE9mQ29udGVudFdpZGdldHMocGF0aDogVWludDhBcnJheSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHRwYXRoLmxlbmd0aCA+PSA0XG5cdFx0XHQmJiBwYXRoWzBdID09PSBQYXJ0RmluZ2VycHJpbnQuT3ZlcmZsb3dHdWFyZFxuXHRcdFx0JiYgcGF0aFszXSA9PT0gUGFydEZpbmdlcnByaW50LkNvbnRlbnRXaWRnZXRzXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaXNDaGlsZE9mT3ZlcmZsb3dHdWFyZChwYXRoOiBVaW50OEFycmF5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHBhdGgubGVuZ3RoID49IDFcblx0XHRcdCYmIHBhdGhbMF0gPT09IFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd0d1YXJkXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaXNDaGlsZE9mT3ZlcmZsb3dpbmdDb250ZW50V2lkZ2V0cyhwYXRoOiBVaW50OEFycmF5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHBhdGgubGVuZ3RoID49IDFcblx0XHRcdCYmIHBhdGhbMF0gPT09IFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaXNDaGlsZE9mT3ZlcmxheVdpZGdldHMocGF0aDogVWludDhBcnJheSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHRwYXRoLmxlbmd0aCA+PSAyXG5cdFx0XHQmJiBwYXRoWzBdID09PSBQYXJ0RmluZ2VycHJpbnQuT3ZlcmZsb3dHdWFyZFxuXHRcdFx0JiYgcGF0aFsxXSA9PT0gUGFydEZpbmdlcnByaW50Lk92ZXJsYXlXaWRnZXRzXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaXNDaGlsZE9mT3ZlcmZsb3dpbmdPdmVybGF5V2lkZ2V0cyhwYXRoOiBVaW50OEFycmF5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHBhdGgubGVuZ3RoID49IDFcblx0XHRcdCYmIHBhdGhbMF0gPT09IFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd2luZ092ZXJsYXlXaWRnZXRzXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSGl0VGVzdENvbnRleHQge1xuXG5cdHB1YmxpYyByZWFkb25seSB2aWV3TW9kZWw6IElWaWV3TW9kZWw7XG5cdHB1YmxpYyByZWFkb25seSBsYXlvdXRJbmZvOiBFZGl0b3JMYXlvdXRJbmZvO1xuXHRwdWJsaWMgcmVhZG9ubHkgdmlld0RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgdmlld0xpbmVzR3B1OiBWaWV3TGluZXNHcHUgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBzdGlja3lUYWJTdG9wczogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGFzdFJlbmRlckRhdGE6IFBvaW50ZXJIYW5kbGVyTGFzdFJlbmRlckRhdGE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dDogVmlld0NvbnRleHQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdIZWxwZXI6IElQb2ludGVySGFuZGxlckhlbHBlcjtcblxuXHRjb25zdHJ1Y3Rvcihjb250ZXh0OiBWaWV3Q29udGV4dCwgdmlld0hlbHBlcjogSVBvaW50ZXJIYW5kbGVySGVscGVyLCBsYXN0UmVuZGVyRGF0YTogUG9pbnRlckhhbmRsZXJMYXN0UmVuZGVyRGF0YSkge1xuXHRcdHRoaXMudmlld01vZGVsID0gY29udGV4dC52aWV3TW9kZWw7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGNvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdHRoaXMubGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHR0aGlzLnZpZXdEb21Ob2RlID0gdmlld0hlbHBlci52aWV3RG9tTm9kZTtcblx0XHR0aGlzLnZpZXdMaW5lc0dwdSA9IHZpZXdIZWxwZXIudmlld0xpbmVzR3B1O1xuXHRcdHRoaXMubGluZUhlaWdodCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHR0aGlzLnN0aWNreVRhYlN0b3BzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnN0aWNreVRhYlN0b3BzKTtcblx0XHR0aGlzLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbykudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdHRoaXMubGFzdFJlbmRlckRhdGEgPSBsYXN0UmVuZGVyRGF0YTtcblx0XHR0aGlzLl9jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLl92aWV3SGVscGVyID0gdmlld0hlbHBlcjtcblx0fVxuXG5cdHB1YmxpYyBnZXRab25lQXRDb29yZChtb3VzZVZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiBJTW91c2VUYXJnZXRWaWV3Wm9uZURhdGEgfCBudWxsIHtcblx0XHRyZXR1cm4gSGl0VGVzdENvbnRleHQuZ2V0Wm9uZUF0Q29vcmQodGhpcy5fY29udGV4dCwgbW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldFpvbmVBdENvb3JkKGNvbnRleHQ6IFZpZXdDb250ZXh0LCBtb3VzZVZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiBJTW91c2VUYXJnZXRWaWV3Wm9uZURhdGEgfCBudWxsIHtcblx0XHQvLyBUaGUgdGFyZ2V0IGlzIGVpdGhlciBhIHZpZXcgem9uZSBvciB0aGUgZW1wdHkgc3BhY2UgYWZ0ZXIgdGhlIGxhc3Qgdmlldy1saW5lXG5cdFx0Y29uc3Qgdmlld1pvbmVXaGl0ZXNwYWNlID0gY29udGV4dC52aWV3TGF5b3V0LmdldFdoaXRlc3BhY2VBdFZlcnRpY2FsT2Zmc2V0KG1vdXNlVmVydGljYWxPZmZzZXQpO1xuXG5cdFx0aWYgKHZpZXdab25lV2hpdGVzcGFjZSkge1xuXHRcdFx0Y29uc3Qgdmlld1pvbmVNaWRkbGUgPSB2aWV3Wm9uZVdoaXRlc3BhY2UudmVydGljYWxPZmZzZXQgKyB2aWV3Wm9uZVdoaXRlc3BhY2UuaGVpZ2h0IC8gMjtcblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IGNvbnRleHQudmlld01vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0bGV0IHBvc2l0aW9uQmVmb3JlOiBQb3NpdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IHBvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGw7XG5cdFx0XHRsZXQgcG9zaXRpb25BZnRlcjogUG9zaXRpb24gfCBudWxsID0gbnVsbDtcblxuXHRcdFx0aWYgKHZpZXdab25lV2hpdGVzcGFjZS5hZnRlckxpbmVOdW1iZXIgIT09IGxpbmVDb3VudCkge1xuXHRcdFx0XHQvLyBUaGVyZSBhcmUgbW9yZSBsaW5lcyBhZnRlciB0aGlzIHZpZXcgem9uZVxuXHRcdFx0XHRwb3NpdGlvbkFmdGVyID0gbmV3IFBvc2l0aW9uKHZpZXdab25lV2hpdGVzcGFjZS5hZnRlckxpbmVOdW1iZXIgKyAxLCAxKTtcblx0XHRcdH1cblx0XHRcdGlmICh2aWV3Wm9uZVdoaXRlc3BhY2UuYWZ0ZXJMaW5lTnVtYmVyID4gMCkge1xuXHRcdFx0XHQvLyBUaGVyZSBhcmUgbW9yZSBsaW5lcyBhYm92ZSB0aGlzIHZpZXcgem9uZVxuXHRcdFx0XHRwb3NpdGlvbkJlZm9yZSA9IG5ldyBQb3NpdGlvbih2aWV3Wm9uZVdoaXRlc3BhY2UuYWZ0ZXJMaW5lTnVtYmVyLCBjb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHZpZXdab25lV2hpdGVzcGFjZS5hZnRlckxpbmVOdW1iZXIpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBvc2l0aW9uQWZ0ZXIgPT09IG51bGwpIHtcblx0XHRcdFx0cG9zaXRpb24gPSBwb3NpdGlvbkJlZm9yZTtcblx0XHRcdH0gZWxzZSBpZiAocG9zaXRpb25CZWZvcmUgPT09IG51bGwpIHtcblx0XHRcdFx0cG9zaXRpb24gPSBwb3NpdGlvbkFmdGVyO1xuXHRcdFx0fSBlbHNlIGlmIChtb3VzZVZlcnRpY2FsT2Zmc2V0IDwgdmlld1pvbmVNaWRkbGUpIHtcblx0XHRcdFx0cG9zaXRpb24gPSBwb3NpdGlvbkJlZm9yZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBvc2l0aW9uID0gcG9zaXRpb25BZnRlcjtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dmlld1pvbmVJZDogdmlld1pvbmVXaGl0ZXNwYWNlLmlkLFxuXHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IHZpZXdab25lV2hpdGVzcGFjZS5hZnRlckxpbmVOdW1iZXIsXG5cdFx0XHRcdHBvc2l0aW9uQmVmb3JlOiBwb3NpdGlvbkJlZm9yZSxcblx0XHRcdFx0cG9zaXRpb25BZnRlcjogcG9zaXRpb25BZnRlcixcblx0XHRcdFx0cG9zaXRpb246IHBvc2l0aW9uIVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RnVsbExpbmVSYW5nZUF0Q29vcmQobW91c2VWZXJ0aWNhbE9mZnNldDogbnVtYmVyKTogeyByYW5nZTogRWRpdG9yUmFuZ2U7IGlzQWZ0ZXJMaW5lczogYm9vbGVhbiB9IHtcblx0XHRpZiAodGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmlzQWZ0ZXJMaW5lcyhtb3VzZVZlcnRpY2FsT2Zmc2V0KSkge1xuXHRcdFx0Ly8gQmVsb3cgdGhlIGxhc3QgbGluZVxuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0Y29uc3QgbWF4TGluZUNvbHVtbiA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogbmV3IEVkaXRvclJhbmdlKGxpbmVOdW1iZXIsIG1heExpbmVDb2x1bW4sIGxpbmVOdW1iZXIsIG1heExpbmVDb2x1bW4pLFxuXHRcdFx0XHRpc0FmdGVyTGluZXM6IHRydWVcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRMaW5lTnVtYmVyQXRWZXJ0aWNhbE9mZnNldChtb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0XHRjb25zdCBtYXhMaW5lQ29sdW1uID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IG5ldyBFZGl0b3JSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCBtYXhMaW5lQ29sdW1uKSxcblx0XHRcdGlzQWZ0ZXJMaW5lczogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KG1vdXNlVmVydGljYWxPZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRMaW5lTnVtYmVyQXRWZXJ0aWNhbE9mZnNldChtb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBpc0FmdGVyTGluZXMobW91c2VWZXJ0aWNhbE9mZnNldDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQudmlld0xheW91dC5pc0FmdGVyTGluZXMobW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cdH1cblxuXHRwdWJsaWMgaXNJblRvcFBhZGRpbmcobW91c2VWZXJ0aWNhbE9mZnNldDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQudmlld0xheW91dC5pc0luVG9wUGFkZGluZyhtb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBpc0luQm90dG9tUGFkZGluZyhtb3VzZVZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmlzSW5Cb3R0b21QYWRkaW5nKG1vdXNlVmVydGljYWxPZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGZpbmRBdHRyaWJ1dGUoZWxlbWVudDogRWxlbWVudCwgYXR0cjogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIEhpdFRlc3RDb250ZXh0Ll9maW5kQXR0cmlidXRlKGVsZW1lbnQsIGF0dHIsIHRoaXMuX3ZpZXdIZWxwZXIudmlld0RvbU5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2ZpbmRBdHRyaWJ1dGUoZWxlbWVudDogRWxlbWVudCwgYXR0cjogc3RyaW5nLCBzdG9wQXQ6IEVsZW1lbnQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHR3aGlsZSAoZWxlbWVudCAmJiBlbGVtZW50ICE9PSBlbGVtZW50Lm93bmVyRG9jdW1lbnQuYm9keSkge1xuXHRcdFx0aWYgKGVsZW1lbnQuaGFzQXR0cmlidXRlICYmIGVsZW1lbnQuaGFzQXR0cmlidXRlKGF0dHIpKSB7XG5cdFx0XHRcdHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZShhdHRyKTtcblx0XHRcdH1cblx0XHRcdGlmIChlbGVtZW50ID09PSBzdG9wQXQpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRlbGVtZW50ID0gPEVsZW1lbnQ+ZWxlbWVudC5wYXJlbnROb2RlO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lV2lkdGgobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld0hlbHBlci5nZXRMaW5lV2lkdGgobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgaXNSdGwobGluZU51bWJlcjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsLmdldFRleHREaXJlY3Rpb24obGluZU51bWJlcikgPT09IFRleHREaXJlY3Rpb24uUlRMO1xuXG5cdH1cblxuXHRwdWJsaWMgdmlzaWJsZVJhbmdlRm9yUG9zaXRpb24obGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IEhvcml6b250YWxQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl92aWV3SGVscGVyLnZpc2libGVSYW5nZUZvclBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UG9zaXRpb25Gcm9tRE9NSW5mbyhzcGFuTm9kZTogSFRNTEVsZW1lbnQsIG9mZnNldDogbnVtYmVyKTogUG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld0hlbHBlci5nZXRQb3NpdGlvbkZyb21ET01JbmZvKHNwYW5Ob2RlLCBvZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGdldEN1cnJlbnRTY3JvbGxUb3AoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxUb3AoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDdXJyZW50U2Nyb2xsTGVmdCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbExlZnQoKTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXJlSGl0VGVzdFJlcXVlc3Qge1xuXG5cdHB1YmxpYyByZWFkb25seSBlZGl0b3JQb3M6IEVkaXRvclBhZ2VQb3NpdGlvbjtcblx0cHVibGljIHJlYWRvbmx5IHBvczogUGFnZUNvb3JkaW5hdGVzO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVsYXRpdmVQb3M6IENvb3JkaW5hdGVzUmVsYXRpdmVUb0VkaXRvcjtcblx0cHVibGljIHJlYWRvbmx5IG1vdXNlVmVydGljYWxPZmZzZXQ6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGlzSW5NYXJnaW5BcmVhOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNJbkNvbnRlbnRBcmVhOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgbW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldDogbnVtYmVyO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBtb3VzZUNvbHVtbjogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGN0eDogSGl0VGVzdENvbnRleHQsIGVkaXRvclBvczogRWRpdG9yUGFnZVBvc2l0aW9uLCBwb3M6IFBhZ2VDb29yZGluYXRlcywgcmVsYXRpdmVQb3M6IENvb3JkaW5hdGVzUmVsYXRpdmVUb0VkaXRvcikge1xuXHRcdHRoaXMuZWRpdG9yUG9zID0gZWRpdG9yUG9zO1xuXHRcdHRoaXMucG9zID0gcG9zO1xuXHRcdHRoaXMucmVsYXRpdmVQb3MgPSByZWxhdGl2ZVBvcztcblxuXHRcdHRoaXMubW91c2VWZXJ0aWNhbE9mZnNldCA9IE1hdGgubWF4KDAsIGN0eC5nZXRDdXJyZW50U2Nyb2xsVG9wKCkgKyB0aGlzLnJlbGF0aXZlUG9zLnkpO1xuXHRcdHRoaXMubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCA9IGN0eC5nZXRDdXJyZW50U2Nyb2xsTGVmdCgpICsgdGhpcy5yZWxhdGl2ZVBvcy54IC0gY3R4LmxheW91dEluZm8uY29udGVudExlZnQ7XG5cdFx0dGhpcy5pc0luTWFyZ2luQXJlYSA9ICh0aGlzLnJlbGF0aXZlUG9zLnggPCBjdHgubGF5b3V0SW5mby5jb250ZW50TGVmdCAmJiB0aGlzLnJlbGF0aXZlUG9zLnggPj0gY3R4LmxheW91dEluZm8uZ2x5cGhNYXJnaW5MZWZ0KTtcblx0XHR0aGlzLmlzSW5Db250ZW50QXJlYSA9ICF0aGlzLmlzSW5NYXJnaW5BcmVhO1xuXHRcdHRoaXMubW91c2VDb2x1bW4gPSBNYXRoLm1heCgwLCBNb3VzZVRhcmdldEZhY3RvcnkuX2dldE1vdXNlQ29sdW1uKHRoaXMubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCwgY3R4LnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCkpO1xuXHR9XG59XG5cbmNsYXNzIEhpdFRlc3RSZXF1ZXN0IGV4dGVuZHMgQmFyZUhpdFRlc3RSZXF1ZXN0IHtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4OiBIaXRUZXN0Q29udGV4dDtcblx0cHJpdmF0ZSByZWFkb25seSBfZXZlbnRUYXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IGhpdFRlc3RSZXN1bHQgPSBuZXcgTGF6eSgoKSA9PiBNb3VzZVRhcmdldEZhY3RvcnkuZG9IaXRUZXN0KHRoaXMuX2N0eCwgdGhpcykpO1xuXHRwcml2YXRlIF91c2VIaXRUZXN0VGFyZ2V0OiBib29sZWFuO1xuXHRwcml2YXRlIF90YXJnZXRQYXRoQ2FjaGVFbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF90YXJnZXRQYXRoQ2FjaGVWYWx1ZTogVWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KDApO1xuXG5cdHB1YmxpYyBnZXQgdGFyZ2V0KCk6IEhUTUxFbGVtZW50IHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3VzZUhpdFRlc3RUYXJnZXQpIHtcblx0XHRcdHJldHVybiB0aGlzLmhpdFRlc3RSZXN1bHQudmFsdWUuaGl0VGFyZ2V0O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZXZlbnRUYXJnZXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRhcmdldFBhdGgoKTogVWludDhBcnJheSB7XG5cdFx0aWYgKHRoaXMuX3RhcmdldFBhdGhDYWNoZUVsZW1lbnQgIT09IHRoaXMudGFyZ2V0KSB7XG5cdFx0XHR0aGlzLl90YXJnZXRQYXRoQ2FjaGVFbGVtZW50ID0gdGhpcy50YXJnZXQ7XG5cdFx0XHR0aGlzLl90YXJnZXRQYXRoQ2FjaGVWYWx1ZSA9IFBhcnRGaW5nZXJwcmludHMuY29sbGVjdCh0aGlzLnRhcmdldCwgdGhpcy5fY3R4LnZpZXdEb21Ob2RlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3RhcmdldFBhdGhDYWNoZVZhbHVlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoY3R4OiBIaXRUZXN0Q29udGV4dCwgZWRpdG9yUG9zOiBFZGl0b3JQYWdlUG9zaXRpb24sIHBvczogUGFnZUNvb3JkaW5hdGVzLCByZWxhdGl2ZVBvczogQ29vcmRpbmF0ZXNSZWxhdGl2ZVRvRWRpdG9yLCBldmVudFRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsKSB7XG5cdFx0c3VwZXIoY3R4LCBlZGl0b3JQb3MsIHBvcywgcmVsYXRpdmVQb3MpO1xuXHRcdHRoaXMuX2N0eCA9IGN0eDtcblx0XHR0aGlzLl9ldmVudFRhcmdldCA9IGV2ZW50VGFyZ2V0O1xuXG5cdFx0Ly8gSWYgbm8gZXZlbnQgdGFyZ2V0IGlzIHBhc3NlZCBpbiwgd2Ugd2lsbCB1c2UgdGhlIGhpdCB0ZXN0IHRhcmdldFxuXHRcdGNvbnN0IGhhc0V2ZW50VGFyZ2V0ID0gQm9vbGVhbih0aGlzLl9ldmVudFRhcmdldCk7XG5cdFx0dGhpcy5fdXNlSGl0VGVzdFRhcmdldCA9ICFoYXNFdmVudFRhcmdldDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgcG9zKCR7dGhpcy5wb3MueH0sJHt0aGlzLnBvcy55fSksIGVkaXRvclBvcygke3RoaXMuZWRpdG9yUG9zLnh9LCR7dGhpcy5lZGl0b3JQb3MueX0pLCByZWxhdGl2ZVBvcygke3RoaXMucmVsYXRpdmVQb3MueH0sJHt0aGlzLnJlbGF0aXZlUG9zLnl9KSwgbW91c2VWZXJ0aWNhbE9mZnNldDogJHt0aGlzLm1vdXNlVmVydGljYWxPZmZzZXR9LCBtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0OiAke3RoaXMubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldH1cXG5cXHR0YXJnZXQ6ICR7dGhpcy50YXJnZXQgPyB0aGlzLnRhcmdldC5vdXRlckhUTUwgOiBudWxsfWA7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHdvdWxkQmVuZWZpdEZyb21IaXRUZXN0VGFyZ2V0U3dpdGNoKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHQhdGhpcy5fdXNlSGl0VGVzdFRhcmdldFxuXHRcdFx0JiYgdGhpcy5oaXRUZXN0UmVzdWx0LnZhbHVlLmhpdFRhcmdldCAhPT0gbnVsbFxuXHRcdFx0JiYgdGhpcy50YXJnZXQgIT09IHRoaXMuaGl0VGVzdFJlc3VsdC52YWx1ZS5oaXRUYXJnZXRcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN3aXRjaFRvSGl0VGVzdFRhcmdldCgpOiB2b2lkIHtcblx0XHR0aGlzLl91c2VIaXRUZXN0VGFyZ2V0ID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1vdXNlQ29sdW1uKHBvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGwgPSBudWxsKTogbnVtYmVyIHtcblx0XHRpZiAocG9zaXRpb24gJiYgcG9zaXRpb24uY29sdW1uIDwgdGhpcy5fY3R4LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpKSB7XG5cdFx0XHQvLyBNb3N0IGxpa2VseSwgdGhlIGxpbmUgY29udGFpbnMgZm9yZWlnbiBkZWNvcmF0aW9ucy4uLlxuXHRcdFx0cmV0dXJuIEN1cnNvckNvbHVtbnMudmlzaWJsZUNvbHVtbkZyb21Db2x1bW4odGhpcy5fY3R4LnZpZXdNb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSwgcG9zaXRpb24uY29sdW1uLCB0aGlzLl9jdHgudmlld01vZGVsLm1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplKSArIDE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1vdXNlQ29sdW1uO1xuXHR9XG5cblx0cHVibGljIGZ1bGZpbGxVbmtub3duKHBvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGwgPSBudWxsKTogSU1vdXNlVGFyZ2V0VW5rbm93biB7XG5cdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZVVua25vd24odGhpcy50YXJnZXQsIHRoaXMuX2dldE1vdXNlQ29sdW1uKHBvc2l0aW9uKSwgcG9zaXRpb24pO1xuXHR9XG5cdHB1YmxpYyBmdWxmaWxsVGV4dGFyZWEoKTogSU1vdXNlVGFyZ2V0VGV4dGFyZWEge1xuXHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVUZXh0YXJlYSh0aGlzLnRhcmdldCwgdGhpcy5fZ2V0TW91c2VDb2x1bW4oKSk7XG5cdH1cblx0cHVibGljIGZ1bGZpbGxNYXJnaW4odHlwZTogTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9HTFlQSF9NQVJHSU4gfCBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfTlVNQkVSUyB8IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUywgcG9zaXRpb246IFBvc2l0aW9uLCByYW5nZTogRWRpdG9yUmFuZ2UsIGRldGFpbDogSU1vdXNlVGFyZ2V0TWFyZ2luRGF0YSk6IElNb3VzZVRhcmdldE1hcmdpbiB7XG5cdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZU1hcmdpbih0eXBlLCB0aGlzLnRhcmdldCwgdGhpcy5fZ2V0TW91c2VDb2x1bW4ocG9zaXRpb24pLCBwb3NpdGlvbiwgcmFuZ2UsIGRldGFpbCk7XG5cdH1cblx0cHVibGljIGZ1bGZpbGxWaWV3Wm9uZSh0eXBlOiBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX1ZJRVdfWk9ORSB8IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1ZJRVdfWk9ORSwgcG9zaXRpb246IFBvc2l0aW9uLCBkZXRhaWw6IElNb3VzZVRhcmdldFZpZXdab25lRGF0YSk6IElNb3VzZVRhcmdldFZpZXdab25lIHtcblx0XHQvLyBBbHdheXMgcmV0dXJuIHRoZSB1c3VhbCBtb3VzZSBjb2x1bW4gZm9yIGEgdmlldyB6b25lLlxuXHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVWaWV3Wm9uZSh0eXBlLCB0aGlzLnRhcmdldCwgdGhpcy5fZ2V0TW91c2VDb2x1bW4oKSwgcG9zaXRpb24sIGRldGFpbCk7XG5cdH1cblx0cHVibGljIGZ1bGZpbGxDb250ZW50VGV4dChwb3NpdGlvbjogUG9zaXRpb24sIHJhbmdlOiBFZGl0b3JSYW5nZSB8IG51bGwsIGRldGFpbDogSU1vdXNlVGFyZ2V0Q29udGVudFRleHREYXRhKTogSU1vdXNlVGFyZ2V0Q29udGVudFRleHQge1xuXHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVDb250ZW50VGV4dCh0aGlzLnRhcmdldCwgdGhpcy5fZ2V0TW91c2VDb2x1bW4ocG9zaXRpb24pLCBwb3NpdGlvbiwgcmFuZ2UsIGRldGFpbCk7XG5cdH1cblx0cHVibGljIGZ1bGZpbGxDb250ZW50RW1wdHkocG9zaXRpb246IFBvc2l0aW9uLCBkZXRhaWw6IElNb3VzZVRhcmdldENvbnRlbnRFbXB0eURhdGEpOiBJTW91c2VUYXJnZXRDb250ZW50RW1wdHkge1xuXHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVDb250ZW50RW1wdHkodGhpcy50YXJnZXQsIHRoaXMuX2dldE1vdXNlQ29sdW1uKHBvc2l0aW9uKSwgcG9zaXRpb24sIGRldGFpbCk7XG5cdH1cblx0cHVibGljIGZ1bGZpbGxDb250ZW50V2lkZ2V0KGRldGFpbDogc3RyaW5nKTogSU1vdXNlVGFyZ2V0Q29udGVudFdpZGdldCB7XG5cdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZUNvbnRlbnRXaWRnZXQodGhpcy50YXJnZXQsIHRoaXMuX2dldE1vdXNlQ29sdW1uKCksIGRldGFpbCk7XG5cdH1cblx0cHVibGljIGZ1bGZpbGxTY3JvbGxiYXIocG9zaXRpb246IFBvc2l0aW9uKTogSU1vdXNlVGFyZ2V0U2Nyb2xsYmFyIHtcblx0XHRyZXR1cm4gTW91c2VUYXJnZXQuY3JlYXRlU2Nyb2xsYmFyKHRoaXMudGFyZ2V0LCB0aGlzLl9nZXRNb3VzZUNvbHVtbihwb3NpdGlvbiksIHBvc2l0aW9uKTtcblx0fVxuXHRwdWJsaWMgZnVsZmlsbE92ZXJsYXlXaWRnZXQoZGV0YWlsOiBzdHJpbmcpOiBJTW91c2VUYXJnZXRPdmVybGF5V2lkZ2V0IHtcblx0XHRyZXR1cm4gTW91c2VUYXJnZXQuY3JlYXRlT3ZlcmxheVdpZGdldCh0aGlzLnRhcmdldCwgdGhpcy5fZ2V0TW91c2VDb2x1bW4oKSwgZGV0YWlsKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgUmVzb2x2ZWRIaXRUZXN0UmVxdWVzdCBleHRlbmRzIEhpdFRlc3RSZXF1ZXN0IHtcblx0cmVhZG9ubHkgdGFyZ2V0OiBIVE1MRWxlbWVudDtcbn1cblxuY29uc3QgRU1QVFlfQ09OVEVOVF9BRlRFUl9MSU5FUzogSU1vdXNlVGFyZ2V0Q29udGVudEVtcHR5RGF0YSA9IHsgaXNBZnRlckxpbmVzOiB0cnVlIH07XG5cbmZ1bmN0aW9uIGNyZWF0ZUVtcHR5Q29udGVudERhdGFJbkxpbmVzKGhvcml6b250YWxEaXN0YW5jZVRvVGV4dDogbnVtYmVyKTogSU1vdXNlVGFyZ2V0Q29udGVudEVtcHR5RGF0YSB7XG5cdHJldHVybiB7XG5cdFx0aXNBZnRlckxpbmVzOiBmYWxzZSxcblx0XHRob3Jpem9udGFsRGlzdGFuY2VUb1RleHQ6IGhvcml6b250YWxEaXN0YW5jZVRvVGV4dFxuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgTW91c2VUYXJnZXRGYWN0b3J5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0OiBWaWV3Q29udGV4dDtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld0hlbHBlcjogSVBvaW50ZXJIYW5kbGVySGVscGVyO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IFZpZXdDb250ZXh0LCB2aWV3SGVscGVyOiBJUG9pbnRlckhhbmRsZXJIZWxwZXIpIHtcblx0XHR0aGlzLl9jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLl92aWV3SGVscGVyID0gdmlld0hlbHBlcjtcblx0fVxuXG5cdHB1YmxpYyBtb3VzZVRhcmdldElzV2lkZ2V0KGU6IEVkaXRvck1vdXNlRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCB0ID0gPEVsZW1lbnQ+ZS50YXJnZXQ7XG5cdFx0Y29uc3QgcGF0aCA9IFBhcnRGaW5nZXJwcmludHMuY29sbGVjdCh0LCB0aGlzLl92aWV3SGVscGVyLnZpZXdEb21Ob2RlKTtcblxuXHRcdC8vIElzIGl0IGEgY29udGVudCB3aWRnZXQ/XG5cdFx0aWYgKEVsZW1lbnRQYXRoLmlzQ2hpbGRPZkNvbnRlbnRXaWRnZXRzKHBhdGgpIHx8IEVsZW1lbnRQYXRoLmlzQ2hpbGRPZk92ZXJmbG93aW5nQ29udGVudFdpZGdldHMocGF0aCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIElzIGl0IGFuIG92ZXJsYXkgd2lkZ2V0P1xuXHRcdGlmIChFbGVtZW50UGF0aC5pc0NoaWxkT2ZPdmVybGF5V2lkZ2V0cyhwYXRoKSB8fCBFbGVtZW50UGF0aC5pc0NoaWxkT2ZPdmVyZmxvd2luZ092ZXJsYXlXaWRnZXRzKHBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlTW91c2VUYXJnZXQobGFzdFJlbmRlckRhdGE6IFBvaW50ZXJIYW5kbGVyTGFzdFJlbmRlckRhdGEsIGVkaXRvclBvczogRWRpdG9yUGFnZVBvc2l0aW9uLCBwb3M6IFBhZ2VDb29yZGluYXRlcywgcmVsYXRpdmVQb3M6IENvb3JkaW5hdGVzUmVsYXRpdmVUb0VkaXRvciwgdGFyZ2V0OiBIVE1MRWxlbWVudCB8IG51bGwpOiBJTW91c2VUYXJnZXQge1xuXHRcdGNvbnN0IGN0eCA9IG5ldyBIaXRUZXN0Q29udGV4dCh0aGlzLl9jb250ZXh0LCB0aGlzLl92aWV3SGVscGVyLCBsYXN0UmVuZGVyRGF0YSk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG5ldyBIaXRUZXN0UmVxdWVzdChjdHgsIGVkaXRvclBvcywgcG9zLCByZWxhdGl2ZVBvcywgdGFyZ2V0KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgciA9IE1vdXNlVGFyZ2V0RmFjdG9yeS5fY3JlYXRlTW91c2VUYXJnZXQoY3R4LCByZXF1ZXN0KTtcblxuXHRcdFx0aWYgKHIudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCkge1xuXHRcdFx0XHQvLyBTbmFwIHRvIHRoZSBuZWFyZXN0IHNvZnQgdGFiIGJvdW5kYXJ5IGlmIGF0b21pYyBzb2Z0IHRhYnMgYXJlIGVuYWJsZWQuXG5cdFx0XHRcdGlmIChjdHguc3RpY2t5VGFiU3RvcHMgJiYgci5wb3NpdGlvbiAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gTW91c2VUYXJnZXRGYWN0b3J5Ll9zbmFwVG9Tb2Z0VGFiQm91bmRhcnkoci5wb3NpdGlvbiwgY3R4LnZpZXdNb2RlbCk7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBFZGl0b3JSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uLCBwb3NpdGlvbikucGx1c1JhbmdlKHIucmFuZ2UpO1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50VGV4dChwb3NpdGlvbiwgcmFuZ2UsIHIuZGV0YWlsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBjb25zb2xlLmxvZyhNb3VzZVRhcmdldC50b1N0cmluZyhyKSk7XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKGVycik7XG5cdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsVW5rbm93bigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jcmVhdGVNb3VzZVRhcmdldChjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBIaXRUZXN0UmVxdWVzdCk6IElNb3VzZVRhcmdldCB7XG5cblx0XHQvLyBjb25zb2xlLmxvZyhgJHtkb21IaXRUZXN0RXhlY3V0ZWQgPyAnPT4nIDogJyd9Q0FNRSBJTiBSRVFVRVNUOiAke3JlcXVlc3R9YCk7XG5cblx0XHRpZiAocmVxdWVzdC50YXJnZXQgPT09IG51bGwpIHtcblx0XHRcdC8vIE5vIHRhcmdldFxuXHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbFVua25vd24oKTtcblx0XHR9XG5cblx0XHQvLyB3ZSBrbm93IGZvciBhIGZhY3QgdGhhdCByZXF1ZXN0LnRhcmdldCBpcyBub3QgbnVsbFxuXHRcdGNvbnN0IHJlc29sdmVkUmVxdWVzdCA9IDxSZXNvbHZlZEhpdFRlc3RSZXF1ZXN0PnJlcXVlc3Q7XG5cblx0XHRsZXQgcmVzdWx0OiBJTW91c2VUYXJnZXQgfCBudWxsID0gbnVsbDtcblxuXHRcdGlmICghRWxlbWVudFBhdGguaXNDaGlsZE9mT3ZlcmZsb3dHdWFyZChyZXF1ZXN0LnRhcmdldFBhdGgpICYmICFFbGVtZW50UGF0aC5pc0NoaWxkT2ZPdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzKHJlcXVlc3QudGFyZ2V0UGF0aCkgJiYgIUVsZW1lbnRQYXRoLmlzQ2hpbGRPZk92ZXJmbG93aW5nT3ZlcmxheVdpZGdldHMocmVxdWVzdC50YXJnZXRQYXRoKSkge1xuXHRcdFx0Ly8gV2Ugb25seSByZW5kZXIgZG9tIG5vZGVzIGluc2lkZSB0aGUgb3ZlcmZsb3cgZ3VhcmQgb3IgaW4gdGhlIG92ZXJmbG93aW5nIGNvbnRlbnQgd2lkZ2V0c1xuXHRcdFx0cmVzdWx0ID0gcmVzdWx0IHx8IHJlcXVlc3QuZnVsZmlsbFVua25vd24oKTtcblx0XHR9XG5cblx0XHRyZXN1bHQgPSByZXN1bHQgfHwgTW91c2VUYXJnZXRGYWN0b3J5Ll9oaXRUZXN0Q29udGVudFdpZGdldChjdHgsIHJlc29sdmVkUmVxdWVzdCk7XG5cdFx0cmVzdWx0ID0gcmVzdWx0IHx8IE1vdXNlVGFyZ2V0RmFjdG9yeS5faGl0VGVzdE92ZXJsYXlXaWRnZXQoY3R4LCByZXNvbHZlZFJlcXVlc3QpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBNb3VzZVRhcmdldEZhY3RvcnkuX2hpdFRlc3RNaW5pbWFwKGN0eCwgcmVzb2x2ZWRSZXF1ZXN0KTtcblx0XHRyZXN1bHQgPSByZXN1bHQgfHwgTW91c2VUYXJnZXRGYWN0b3J5Ll9oaXRUZXN0U2Nyb2xsYmFyU2xpZGVyKGN0eCwgcmVzb2x2ZWRSZXF1ZXN0KTtcblx0XHRyZXN1bHQgPSByZXN1bHQgfHwgTW91c2VUYXJnZXRGYWN0b3J5Ll9oaXRUZXN0Vmlld1pvbmUoY3R4LCByZXNvbHZlZFJlcXVlc3QpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBNb3VzZVRhcmdldEZhY3RvcnkuX2hpdFRlc3RNYXJnaW4oY3R4LCByZXNvbHZlZFJlcXVlc3QpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBNb3VzZVRhcmdldEZhY3RvcnkuX2hpdFRlc3RWaWV3Q3Vyc29yKGN0eCwgcmVzb2x2ZWRSZXF1ZXN0KTtcblx0XHRyZXN1bHQgPSByZXN1bHQgfHwgTW91c2VUYXJnZXRGYWN0b3J5Ll9oaXRUZXN0VGV4dEFyZWEoY3R4LCByZXNvbHZlZFJlcXVlc3QpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBNb3VzZVRhcmdldEZhY3RvcnkuX2hpdFRlc3RWaWV3TGluZXMoY3R4LCByZXNvbHZlZFJlcXVlc3QpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBNb3VzZVRhcmdldEZhY3RvcnkuX2hpdFRlc3RTY3JvbGxiYXIoY3R4LCByZXNvbHZlZFJlcXVlc3QpO1xuXG5cdFx0cmV0dXJuIChyZXN1bHQgfHwgcmVxdWVzdC5mdWxmaWxsVW5rbm93bigpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9oaXRUZXN0Q29udGVudFdpZGdldChjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBSZXNvbHZlZEhpdFRlc3RSZXF1ZXN0KTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0Ly8gSXMgaXQgYSBjb250ZW50IHdpZGdldD9cblx0XHRpZiAoRWxlbWVudFBhdGguaXNDaGlsZE9mQ29udGVudFdpZGdldHMocmVxdWVzdC50YXJnZXRQYXRoKSB8fCBFbGVtZW50UGF0aC5pc0NoaWxkT2ZPdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzKHJlcXVlc3QudGFyZ2V0UGF0aCkpIHtcblx0XHRcdGNvbnN0IHdpZGdldElkID0gY3R4LmZpbmRBdHRyaWJ1dGUocmVxdWVzdC50YXJnZXQsICd3aWRnZXRJZCcpO1xuXHRcdFx0aWYgKHdpZGdldElkKSB7XG5cdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50V2lkZ2V0KHdpZGdldElkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxVbmtub3duKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hpdFRlc3RPdmVybGF5V2lkZ2V0KGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IFJlc29sdmVkSGl0VGVzdFJlcXVlc3QpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHQvLyBJcyBpdCBhbiBvdmVybGF5IHdpZGdldD9cblx0XHRpZiAoRWxlbWVudFBhdGguaXNDaGlsZE9mT3ZlcmxheVdpZGdldHMocmVxdWVzdC50YXJnZXRQYXRoKSB8fCBFbGVtZW50UGF0aC5pc0NoaWxkT2ZPdmVyZmxvd2luZ092ZXJsYXlXaWRnZXRzKHJlcXVlc3QudGFyZ2V0UGF0aCkpIHtcblx0XHRcdGNvbnN0IHdpZGdldElkID0gY3R4LmZpbmRBdHRyaWJ1dGUocmVxdWVzdC50YXJnZXQsICd3aWRnZXRJZCcpO1xuXHRcdFx0aWYgKHdpZGdldElkKSB7XG5cdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxPdmVybGF5V2lkZ2V0KHdpZGdldElkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxVbmtub3duKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hpdFRlc3RWaWV3Q3Vyc29yKGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IFJlc29sdmVkSGl0VGVzdFJlcXVlc3QpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblxuXHRcdGlmIChyZXF1ZXN0LnRhcmdldCkge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgd2UndmUgaGl0IGEgcGFpbnRlZCBjdXJzb3Jcblx0XHRcdGNvbnN0IGxhc3RWaWV3Q3Vyc29yc1JlbmRlckRhdGEgPSBjdHgubGFzdFJlbmRlckRhdGEubGFzdFZpZXdDdXJzb3JzUmVuZGVyRGF0YTtcblxuXHRcdFx0Zm9yIChjb25zdCBkIG9mIGxhc3RWaWV3Q3Vyc29yc1JlbmRlckRhdGEpIHtcblxuXHRcdFx0XHRpZiAocmVxdWVzdC50YXJnZXQgPT09IGQuZG9tTm9kZSkge1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50VGV4dChkLnBvc2l0aW9uLCBudWxsLCB7IG1pZ2h0QmVGb3JlaWduRWxlbWVudDogZmFsc2UsIGluamVjdGVkVGV4dDogbnVsbCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXF1ZXN0LmlzSW5Db250ZW50QXJlYSkge1xuXHRcdFx0Ly8gRWRnZSBoYXMgYSBidWcgd2hlbiBoaXQtdGVzdGluZyB0aGUgZXhhY3QgcG9zaXRpb24gb2YgYSBjdXJzb3IsXG5cdFx0XHQvLyBpbnN0ZWFkIG9mIHJldHVybmluZyB0aGUgY29ycmVjdCBkb20gbm9kZSwgaXQgcmV0dXJucyB0aGVcblx0XHRcdC8vIGZpcnN0IG9yIGxhc3QgcmVuZGVyZWQgdmlldyBsaW5lIGRvbSBub2RlLCB0aGVyZWZvcmUgaGVscCBpdCBvdXRcblx0XHRcdC8vIGFuZCBmaXJzdCBjaGVjayBpZiB3ZSBhcmUgb24gdG9wIG9mIGEgY3Vyc29yXG5cblx0XHRcdGNvbnN0IGxhc3RWaWV3Q3Vyc29yc1JlbmRlckRhdGEgPSBjdHgubGFzdFJlbmRlckRhdGEubGFzdFZpZXdDdXJzb3JzUmVuZGVyRGF0YTtcblx0XHRcdGNvbnN0IG1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgPSByZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQ7XG5cdFx0XHRjb25zdCBtb3VzZVZlcnRpY2FsT2Zmc2V0ID0gcmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0O1xuXG5cdFx0XHRmb3IgKGNvbnN0IGQgb2YgbGFzdFZpZXdDdXJzb3JzUmVuZGVyRGF0YSkge1xuXG5cdFx0XHRcdGlmIChtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0IDwgZC5jb250ZW50TGVmdCkge1xuXHRcdFx0XHRcdC8vIG1vdXNlIHBvc2l0aW9uIGlzIHRvIHRoZSBsZWZ0IG9mIHRoZSBjdXJzb3Jcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCA+IGQuY29udGVudExlZnQgKyBkLndpZHRoKSB7XG5cdFx0XHRcdFx0Ly8gbW91c2UgcG9zaXRpb24gaXMgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJzb3Jcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGN1cnNvclZlcnRpY2FsT2Zmc2V0ID0gY3R4LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihkLnBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHRjdXJzb3JWZXJ0aWNhbE9mZnNldCA8PSBtb3VzZVZlcnRpY2FsT2Zmc2V0XG5cdFx0XHRcdFx0JiYgbW91c2VWZXJ0aWNhbE9mZnNldCA8PSBjdXJzb3JWZXJ0aWNhbE9mZnNldCArIGQuaGVpZ2h0XG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50VGV4dChkLnBvc2l0aW9uLCBudWxsLCB7IG1pZ2h0QmVGb3JlaWduRWxlbWVudDogZmFsc2UsIGluamVjdGVkVGV4dDogbnVsbCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hpdFRlc3RWaWV3Wm9uZShjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBSZXNvbHZlZEhpdFRlc3RSZXF1ZXN0KTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0Y29uc3Qgdmlld1pvbmVEYXRhID0gY3R4LmdldFpvbmVBdENvb3JkKHJlcXVlc3QubW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cdFx0aWYgKHZpZXdab25lRGF0YSkge1xuXHRcdFx0Y29uc3QgbW91c2VUYXJnZXRUeXBlID0gKHJlcXVlc3QuaXNJbkNvbnRlbnRBcmVhID8gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVklFV19aT05FIDogTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9WSUVXX1pPTkUpO1xuXHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbFZpZXdab25lKG1vdXNlVGFyZ2V0VHlwZSwgdmlld1pvbmVEYXRhLnBvc2l0aW9uLCB2aWV3Wm9uZURhdGEpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hpdFRlc3RUZXh0QXJlYShjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBSZXNvbHZlZEhpdFRlc3RSZXF1ZXN0KTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0Ly8gSXMgaXQgdGhlIHRleHRhcmVhP1xuXHRcdGlmIChFbGVtZW50UGF0aC5pc1RleHRBcmVhKHJlcXVlc3QudGFyZ2V0UGF0aCkpIHtcblx0XHRcdGlmIChjdHgubGFzdFJlbmRlckRhdGEubGFzdFRleHRhcmVhUG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRUZXh0KGN0eC5sYXN0UmVuZGVyRGF0YS5sYXN0VGV4dGFyZWFQb3NpdGlvbiwgbnVsbCwgeyBtaWdodEJlRm9yZWlnbkVsZW1lbnQ6IGZhbHNlLCBpbmplY3RlZFRleHQ6IG51bGwgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsVGV4dGFyZWEoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaGl0VGVzdE1hcmdpbihjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBSZXNvbHZlZEhpdFRlc3RSZXF1ZXN0KTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0aWYgKHJlcXVlc3QuaXNJbk1hcmdpbkFyZWEpIHtcblx0XHRcdGNvbnN0IHJlcyA9IGN0eC5nZXRGdWxsTGluZVJhbmdlQXRDb29yZChyZXF1ZXN0Lm1vdXNlVmVydGljYWxPZmZzZXQpO1xuXHRcdFx0Y29uc3QgcG9zID0gcmVzLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdGxldCBvZmZzZXQgPSBNYXRoLmFicyhyZXF1ZXN0LnJlbGF0aXZlUG9zLngpO1xuXHRcdFx0Y29uc3QgZGV0YWlsOiBNdXRhYmxlPElNb3VzZVRhcmdldE1hcmdpbkRhdGE+ID0ge1xuXHRcdFx0XHRpc0FmdGVyTGluZXM6IHJlcy5pc0FmdGVyTGluZXMsXG5cdFx0XHRcdGdseXBoTWFyZ2luTGVmdDogY3R4LmxheW91dEluZm8uZ2x5cGhNYXJnaW5MZWZ0LFxuXHRcdFx0XHRnbHlwaE1hcmdpbldpZHRoOiBjdHgubGF5b3V0SW5mby5nbHlwaE1hcmdpbldpZHRoLFxuXHRcdFx0XHRsaW5lTnVtYmVyc1dpZHRoOiBjdHgubGF5b3V0SW5mby5saW5lTnVtYmVyc1dpZHRoLFxuXHRcdFx0XHRvZmZzZXRYOiBvZmZzZXRcblx0XHRcdH07XG5cblx0XHRcdG9mZnNldCAtPSBjdHgubGF5b3V0SW5mby5nbHlwaE1hcmdpbkxlZnQ7XG5cblx0XHRcdGlmIChvZmZzZXQgPD0gY3R4LmxheW91dEluZm8uZ2x5cGhNYXJnaW5XaWR0aCkge1xuXHRcdFx0XHQvLyBPbiB0aGUgZ2x5cGggbWFyZ2luXG5cdFx0XHRcdGNvbnN0IG1vZGVsQ29vcmRpbmF0ZSA9IGN0eC52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihyZXMucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdFx0Y29uc3QgbGFuZXMgPSBjdHgudmlld01vZGVsLmdseXBoTGFuZXMuZ2V0TGFuZXNBdExpbmUobW9kZWxDb29yZGluYXRlLmxpbmVOdW1iZXIpO1xuXHRcdFx0XHRkZXRhaWwuZ2x5cGhNYXJnaW5MYW5lID0gbGFuZXNbTWF0aC5mbG9vcihvZmZzZXQgLyBjdHgubGluZUhlaWdodCldO1xuXHRcdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsTWFyZ2luKE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfR0xZUEhfTUFSR0lOLCBwb3MsIHJlcy5yYW5nZSwgZGV0YWlsKTtcblx0XHRcdH1cblx0XHRcdG9mZnNldCAtPSBjdHgubGF5b3V0SW5mby5nbHlwaE1hcmdpbldpZHRoO1xuXG5cdFx0XHRpZiAob2Zmc2V0IDw9IGN0eC5sYXlvdXRJbmZvLmxpbmVOdW1iZXJzV2lkdGgpIHtcblx0XHRcdFx0Ly8gT24gdGhlIGxpbmUgbnVtYmVyc1xuXHRcdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsTWFyZ2luKE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9OVU1CRVJTLCBwb3MsIHJlcy5yYW5nZSwgZGV0YWlsKTtcblx0XHRcdH1cblx0XHRcdG9mZnNldCAtPSBjdHgubGF5b3V0SW5mby5saW5lTnVtYmVyc1dpZHRoO1xuXG5cdFx0XHQvLyBPbiB0aGUgbGluZSBkZWNvcmF0aW9uc1xuXHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbE1hcmdpbihNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfREVDT1JBVElPTlMsIHBvcywgcmVzLnJhbmdlLCBkZXRhaWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9oaXRUZXN0Vmlld0xpbmVzKGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IFJlc29sdmVkSGl0VGVzdFJlcXVlc3QpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHRpZiAoIUVsZW1lbnRQYXRoLmlzQ2hpbGRPZlZpZXdMaW5lcyhyZXF1ZXN0LnRhcmdldFBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoY3R4LmlzSW5Ub3BQYWRkaW5nKHJlcXVlc3QubW91c2VWZXJ0aWNhbE9mZnNldCkpIHtcblx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50RW1wdHkobmV3IFBvc2l0aW9uKDEsIDEpLCBFTVBUWV9DT05URU5UX0FGVEVSX0xJTkVTKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBpdCBpcyBiZWxvdyBhbnkgbGluZXMgYW5kIGFueSB2aWV3IHpvbmVzXG5cdFx0aWYgKGN0eC5pc0FmdGVyTGluZXMocmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0KSB8fCBjdHguaXNJbkJvdHRvbVBhZGRpbmcocmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0KSkge1xuXHRcdFx0Ly8gVGhpcyBtb3N0IGxpa2VseSBpbmRpY2F0ZXMgaXQgaGFwcGVuZWQgYWZ0ZXIgdGhlIGxhc3Qgdmlldy1saW5lXG5cdFx0XHRjb25zdCBsaW5lQ291bnQgPSBjdHgudmlld01vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0Y29uc3QgbWF4TGluZUNvbHVtbiA9IGN0eC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpO1xuXHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRFbXB0eShuZXcgUG9zaXRpb24obGluZUNvdW50LCBtYXhMaW5lQ29sdW1uKSwgRU1QVFlfQ09OVEVOVF9BRlRFUl9MSU5FUyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgd2UgYXJlIGhpdHRpbmcgYSB2aWV3LWxpbmUgKGNhbiBoYXBwZW4gaW4gdGhlIGNhc2Ugb2YgaW5saW5lIGRlY29yYXRpb25zIG9uIGVtcHR5IGxpbmVzKVxuXHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDY5NDJcblx0XHRpZiAoRWxlbWVudFBhdGguaXNTdHJpY3RDaGlsZE9mVmlld0xpbmVzKHJlcXVlc3QudGFyZ2V0UGF0aCkpIHtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBjdHguZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQocmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSBjdHgudmlld01vZGVsLmdldExpbmVMZW5ndGgobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBsaW5lV2lkdGggPSBjdHguZ2V0TGluZVdpZHRoKGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGxpbmVMZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29uc3QgZGV0YWlsID0gY3JlYXRlRW1wdHlDb250ZW50RGF0YUluTGluZXMocmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0IC0gbGluZVdpZHRoKTtcblx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRFbXB0eShuZXcgUG9zaXRpb24obGluZU51bWJlciwgMSksIGRldGFpbCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlzUnRsID0gY3R4LmlzUnRsKGxpbmVOdW1iZXIpO1xuXHRcdFx0aWYgKGlzUnRsKSB7XG5cdFx0XHRcdGlmIChyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgKyBsaW5lV2lkdGggPD0gY3R4LmxheW91dEluZm8uY29udGVudFdpZHRoIC0gY3R4LmxheW91dEluZm8udmVydGljYWxTY3JvbGxiYXJXaWR0aCkge1xuXHRcdFx0XHRcdGNvbnN0IGRldGFpbCA9IGNyZWF0ZUVtcHR5Q29udGVudERhdGFJbkxpbmVzKHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCAtIGxpbmVXaWR0aCk7XG5cdFx0XHRcdFx0Y29uc3QgcG9zID0gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGN0eC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRFbXB0eShwb3MsIGRldGFpbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0ID49IGxpbmVXaWR0aCkge1xuXHRcdFx0XHRjb25zdCBkZXRhaWwgPSBjcmVhdGVFbXB0eUNvbnRlbnREYXRhSW5MaW5lcyhyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgLSBsaW5lV2lkdGgpO1xuXHRcdFx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY3R4LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKTtcblx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRFbXB0eShwb3MsIGRldGFpbCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChjdHgudmlld0xpbmVzR3B1KSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBjdHguZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQocmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0XHRcdFx0aWYgKGN0eC52aWV3TW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKSA9PT0gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVXaWR0aCA9IGN0eC5nZXRMaW5lV2lkdGgobGluZU51bWJlcik7XG5cdFx0XHRcdFx0Y29uc3QgZGV0YWlsID0gY3JlYXRlRW1wdHlDb250ZW50RGF0YUluTGluZXMocmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0IC0gbGluZVdpZHRoKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsQ29udGVudEVtcHR5KG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCAxKSwgZGV0YWlsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxpbmVXaWR0aCA9IGN0eC5nZXRMaW5lV2lkdGgobGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IGlzUnRsID0gY3R4LmlzUnRsKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRpZiAoaXNSdGwpIHtcblx0XHRcdFx0XHRpZiAocmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0ICsgbGluZVdpZHRoIDw9IGN0eC5sYXlvdXRJbmZvLmNvbnRlbnRXaWR0aCAtIGN0eC5sYXlvdXRJbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRldGFpbCA9IGNyZWF0ZUVtcHR5Q29udGVudERhdGFJbkxpbmVzKHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCAtIGxpbmVXaWR0aCk7XG5cdFx0XHRcdFx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY3R4LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKTtcblx0XHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50RW1wdHkocG9zLCBkZXRhaWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgPj0gbGluZVdpZHRoKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGV0YWlsID0gY3JlYXRlRW1wdHlDb250ZW50RGF0YUluTGluZXMocmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0IC0gbGluZVdpZHRoKTtcblx0XHRcdFx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY3R4LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsQ29udGVudEVtcHR5KHBvcywgZGV0YWlsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gY3R4LnZpZXdMaW5lc0dwdS5nZXRQb3NpdGlvbkF0Q29vcmRpbmF0ZShsaW5lTnVtYmVyLCByZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQpO1xuXHRcdFx0XHRpZiAocG9zaXRpb24pIHtcblx0XHRcdFx0XHRjb25zdCBkZXRhaWw6IElNb3VzZVRhcmdldENvbnRlbnRUZXh0RGF0YSA9IHtcblx0XHRcdFx0XHRcdGluamVjdGVkVGV4dDogbnVsbCxcblx0XHRcdFx0XHRcdG1pZ2h0QmVGb3JlaWduRWxlbWVudDogZmFsc2Vcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50VGV4dChwb3NpdGlvbiwgRWRpdG9yUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbiwgcG9zaXRpb24pLCBkZXRhaWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRG8gdGhlIGhpdCB0ZXN0IChpZiBub3QgYWxyZWFkeSBkb25lKVxuXHRcdGNvbnN0IGhpdFRlc3RSZXN1bHQgPSByZXF1ZXN0LmhpdFRlc3RSZXN1bHQudmFsdWU7XG5cblx0XHRpZiAoaGl0VGVzdFJlc3VsdC50eXBlID09PSBIaXRUZXN0UmVzdWx0VHlwZS5Db250ZW50KSB7XG5cdFx0XHRyZXR1cm4gTW91c2VUYXJnZXRGYWN0b3J5LmNyZWF0ZU1vdXNlVGFyZ2V0RnJvbUhpdFRlc3RQb3NpdGlvbihjdHgsIHJlcXVlc3QsIGhpdFRlc3RSZXN1bHQuc3Bhbk5vZGUsIGhpdFRlc3RSZXN1bHQucG9zaXRpb24sIGhpdFRlc3RSZXN1bHQuaW5qZWN0ZWRUZXh0KTtcblx0XHR9XG5cblx0XHQvLyBXZSBkaWRuJ3QgaGl0IGNvbnRlbnQuLi5cblx0XHRpZiAocmVxdWVzdC53b3VsZEJlbmVmaXRGcm9tSGl0VGVzdFRhcmdldFN3aXRjaCkge1xuXHRcdFx0Ly8gV2UgYWN0dWFsbHkgaGl0IHNvbWV0aGluZyBkaWZmZXJlbnQuLi4gR2l2ZSBpdCBvbmUgbGFzdCBjaGFuZ2UgYnkgdHJ5aW5nIGFnYWluIHdpdGggdGhpcyBuZXcgdGFyZ2V0XG5cdFx0XHRyZXF1ZXN0LnN3aXRjaFRvSGl0VGVzdFRhcmdldCgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZU1vdXNlVGFyZ2V0KGN0eCwgcmVxdWVzdCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgaGF2ZSB0cmllZCBldmVyeXRoaW5nLi4uXG5cdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbFVua25vd24oKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9oaXRUZXN0TWluaW1hcChjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBSZXNvbHZlZEhpdFRlc3RSZXF1ZXN0KTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0aWYgKEVsZW1lbnRQYXRoLmlzQ2hpbGRPZk1pbmltYXAocmVxdWVzdC50YXJnZXRQYXRoKSkge1xuXHRcdFx0Y29uc3QgcG9zc2libGVMaW5lTnVtYmVyID0gY3R4LmdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KHJlcXVlc3QubW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cdFx0XHRjb25zdCBtYXhDb2x1bW4gPSBjdHgudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zc2libGVMaW5lTnVtYmVyKTtcblx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxTY3JvbGxiYXIobmV3IFBvc2l0aW9uKHBvc3NpYmxlTGluZU51bWJlciwgbWF4Q29sdW1uKSk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hpdFRlc3RTY3JvbGxiYXJTbGlkZXIoY3R4OiBIaXRUZXN0Q29udGV4dCwgcmVxdWVzdDogUmVzb2x2ZWRIaXRUZXN0UmVxdWVzdCk6IElNb3VzZVRhcmdldCB8IG51bGwge1xuXHRcdGlmIChFbGVtZW50UGF0aC5pc0NoaWxkT2ZTY3JvbGxhYmxlRWxlbWVudChyZXF1ZXN0LnRhcmdldFBhdGgpKSB7XG5cdFx0XHRpZiAocmVxdWVzdC50YXJnZXQgJiYgcmVxdWVzdC50YXJnZXQubm9kZVR5cGUgPT09IDEpIHtcblx0XHRcdFx0Y29uc3QgY2xhc3NOYW1lID0gcmVxdWVzdC50YXJnZXQuY2xhc3NOYW1lO1xuXHRcdFx0XHRpZiAoY2xhc3NOYW1lICYmIC9cXGIoc2xpZGVyfHNjcm9sbGJhcilcXGIvLnRlc3QoY2xhc3NOYW1lKSkge1xuXHRcdFx0XHRcdGNvbnN0IHBvc3NpYmxlTGluZU51bWJlciA9IGN0eC5nZXRMaW5lTnVtYmVyQXRWZXJ0aWNhbE9mZnNldChyZXF1ZXN0Lm1vdXNlVmVydGljYWxPZmZzZXQpO1xuXHRcdFx0XHRcdGNvbnN0IG1heENvbHVtbiA9IGN0eC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NzaWJsZUxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxTY3JvbGxiYXIobmV3IFBvc2l0aW9uKHBvc3NpYmxlTGluZU51bWJlciwgbWF4Q29sdW1uKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaGl0VGVzdFNjcm9sbGJhcihjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBSZXNvbHZlZEhpdFRlc3RSZXF1ZXN0KTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0Ly8gSXMgaXQgdGhlIG92ZXJ2aWV3IHJ1bGVyP1xuXHRcdC8vIElzIGl0IGEgY2hpbGQgb2YgdGhlIHNjcm9sbGFibGUgZWxlbWVudD9cblx0XHRpZiAoRWxlbWVudFBhdGguaXNDaGlsZE9mU2Nyb2xsYWJsZUVsZW1lbnQocmVxdWVzdC50YXJnZXRQYXRoKSkge1xuXHRcdFx0Y29uc3QgcG9zc2libGVMaW5lTnVtYmVyID0gY3R4LmdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KHJlcXVlc3QubW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cdFx0XHRjb25zdCBtYXhDb2x1bW4gPSBjdHgudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zc2libGVMaW5lTnVtYmVyKTtcblx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxTY3JvbGxiYXIobmV3IFBvc2l0aW9uKHBvc3NpYmxlTGluZU51bWJlciwgbWF4Q29sdW1uKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TW91c2VDb2x1bW4ocmVsYXRpdmVQb3M6IENvb3JkaW5hdGVzUmVsYXRpdmVUb0VkaXRvcik6IG51bWJlciB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cdFx0Y29uc3QgbW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsTGVmdCgpICsgcmVsYXRpdmVQb3MueCAtIGxheW91dEluZm8uY29udGVudExlZnQ7XG5cdFx0cmV0dXJuIE1vdXNlVGFyZ2V0RmFjdG9yeS5fZ2V0TW91c2VDb2x1bW4obW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCwgb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGgpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBfZ2V0TW91c2VDb2x1bW4obW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldDogbnVtYmVyLCB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKG1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgPCAwKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdFx0Y29uc3QgY2hhcnMgPSBNYXRoLnJvdW5kKG1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgLyB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGgpO1xuXHRcdHJldHVybiAoY2hhcnMgKyAxKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGNyZWF0ZU1vdXNlVGFyZ2V0RnJvbUhpdFRlc3RQb3NpdGlvbihjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBIaXRUZXN0UmVxdWVzdCwgc3Bhbk5vZGU6IEhUTUxFbGVtZW50LCBwb3M6IFBvc2l0aW9uLCBpbmplY3RlZFRleHQ6IEluamVjdGVkVGV4dCB8IG51bGwpOiBJTW91c2VUYXJnZXQge1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBwb3MubGluZU51bWJlcjtcblx0XHRjb25zdCBjb2x1bW4gPSBwb3MuY29sdW1uO1xuXG5cdFx0Y29uc3QgbGluZVdpZHRoID0gY3R4LmdldExpbmVXaWR0aChsaW5lTnVtYmVyKTtcblxuXHRcdGlmIChyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgPiBsaW5lV2lkdGgpIHtcblx0XHRcdGNvbnN0IGRldGFpbCA9IGNyZWF0ZUVtcHR5Q29udGVudERhdGFJbkxpbmVzKHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCAtIGxpbmVXaWR0aCk7XG5cdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsQ29udGVudEVtcHR5KHBvcywgZGV0YWlsKTtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlUmFuZ2UgPSBjdHgudmlzaWJsZVJhbmdlRm9yUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblxuXHRcdGlmICghdmlzaWJsZVJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsVW5rbm93bihwb3MpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbHVtbkhvcml6b250YWxPZmZzZXQgPSB2aXNpYmxlUmFuZ2UubGVmdDtcblxuXHRcdGlmIChNYXRoLmFicyhyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgLSBjb2x1bW5Ib3Jpem9udGFsT2Zmc2V0KSA8IDEpIHtcblx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50VGV4dChwb3MsIG51bGwsIHsgbWlnaHRCZUZvcmVpZ25FbGVtZW50OiAhIWluamVjdGVkVGV4dCwgaW5qZWN0ZWRUZXh0IH0pO1xuXHRcdH1cblxuXHRcdC8vIExldCdzIGRlZmluZSBhLCBiLCBjIGFuZCBjaGVjayBpZiB0aGUgb2Zmc2V0IGlzIGluIGJldHdlZW4gdGhlbS4uLlxuXHRcdGludGVyZmFjZSBPZmZzZXRDb2x1bW4geyBvZmZzZXQ6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfVxuXG5cdFx0Y29uc3QgcG9pbnRzOiBPZmZzZXRDb2x1bW5bXSA9IFtdO1xuXHRcdHBvaW50cy5wdXNoKHsgb2Zmc2V0OiB2aXNpYmxlUmFuZ2UubGVmdCwgY29sdW1uOiBjb2x1bW4gfSk7XG5cdFx0aWYgKGNvbHVtbiA+IDEpIHtcblx0XHRcdGNvbnN0IHZpc2libGVSYW5nZSA9IGN0eC52aXNpYmxlUmFuZ2VGb3JQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4gLSAxKTtcblx0XHRcdGlmICh2aXNpYmxlUmFuZ2UpIHtcblx0XHRcdFx0cG9pbnRzLnB1c2goeyBvZmZzZXQ6IHZpc2libGVSYW5nZS5sZWZ0LCBjb2x1bW46IGNvbHVtbiAtIDEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVNYXhDb2x1bW4gPSBjdHgudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0aWYgKGNvbHVtbiA8IGxpbmVNYXhDb2x1bW4pIHtcblx0XHRcdGNvbnN0IHZpc2libGVSYW5nZSA9IGN0eC52aXNpYmxlUmFuZ2VGb3JQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4gKyAxKTtcblx0XHRcdGlmICh2aXNpYmxlUmFuZ2UpIHtcblx0XHRcdFx0cG9pbnRzLnB1c2goeyBvZmZzZXQ6IHZpc2libGVSYW5nZS5sZWZ0LCBjb2x1bW46IGNvbHVtbiArIDEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cG9pbnRzLnNvcnQoKGEsIGIpID0+IGEub2Zmc2V0IC0gYi5vZmZzZXQpO1xuXG5cdFx0Y29uc3QgbW91c2VDb29yZGluYXRlcyA9IHJlcXVlc3QucG9zLnRvQ2xpZW50Q29vcmRpbmF0ZXMoZG9tLmdldFdpbmRvdyhjdHgudmlld0RvbU5vZGUpKTtcblx0XHRjb25zdCBzcGFuTm9kZUNsaWVudFJlY3QgPSBzcGFuTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBtb3VzZUlzT3ZlclNwYW5Ob2RlID0gKHNwYW5Ob2RlQ2xpZW50UmVjdC5sZWZ0IDw9IG1vdXNlQ29vcmRpbmF0ZXMuY2xpZW50WCAmJiBtb3VzZUNvb3JkaW5hdGVzLmNsaWVudFggPD0gc3Bhbk5vZGVDbGllbnRSZWN0LnJpZ2h0KTtcblxuXHRcdGxldCBybmc6IEVkaXRvclJhbmdlIHwgbnVsbCA9IG51bGw7XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHBvaW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcHJldiA9IHBvaW50c1tpIC0gMV07XG5cdFx0XHRjb25zdCBjdXJyID0gcG9pbnRzW2ldO1xuXHRcdFx0aWYgKHByZXYub2Zmc2V0IDw9IHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCAmJiByZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgPD0gY3Vyci5vZmZzZXQpIHtcblx0XHRcdFx0cm5nID0gbmV3IEVkaXRvclJhbmdlKGxpbmVOdW1iZXIsIHByZXYuY29sdW1uLCBsaW5lTnVtYmVyLCBjdXJyLmNvbHVtbik7XG5cblx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNTI4MTlcblx0XHRcdFx0Ly8gRHVlIHRvIHRoZSB1c2Ugb2YgendqLCB0aGUgYnJvd3NlcidzIGhpdCB0ZXN0IHJlc3VsdCBpcyBza2V3ZWQgdG93YXJkcyB0aGUgbGVmdFxuXHRcdFx0XHQvLyBIZXJlIHdlIHRyeSB0byBjb3JyZWN0IHRoYXQgaWYgdGhlIG1vdXNlIGhvcml6b250YWwgb2Zmc2V0IGlzIGNsb3NlciB0byB0aGUgcmlnaHQgdGhhbiB0aGUgbGVmdFxuXG5cdFx0XHRcdGNvbnN0IHByZXZEZWx0YSA9IE1hdGguYWJzKHByZXYub2Zmc2V0IC0gcmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0KTtcblx0XHRcdFx0Y29uc3QgbmV4dERlbHRhID0gTWF0aC5hYnMoY3Vyci5vZmZzZXQgLSByZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQpO1xuXG5cdFx0XHRcdHBvcyA9IChcblx0XHRcdFx0XHRwcmV2RGVsdGEgPCBuZXh0RGVsdGFcblx0XHRcdFx0XHRcdD8gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIHByZXYuY29sdW1uKVxuXHRcdFx0XHRcdFx0OiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY3Vyci5jb2x1bW4pXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRUZXh0KHBvcywgcm5nLCB7IG1pZ2h0QmVGb3JlaWduRWxlbWVudDogIW1vdXNlSXNPdmVyU3Bhbk5vZGUgfHwgISFpbmplY3RlZFRleHQsIGluamVjdGVkVGV4dCB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3N0IHByb2JhYmx5IFdlYktpdCBicm93c2VycyBhbmQgRWRnZVxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2RvSGl0VGVzdFdpdGhDYXJldFJhbmdlRnJvbVBvaW50KGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IEJhcmVIaXRUZXN0UmVxdWVzdCk6IEhpdFRlc3RSZXN1bHQge1xuXG5cdFx0Ly8gSW4gQ2hyb21lLCBlc3BlY2lhbGx5IG9uIExpbnV4IGl0IGlzIHBvc3NpYmxlIHRvIGNsaWNrIGJldHdlZW4gbGluZXMsXG5cdFx0Ly8gc28gdHJ5IHRvIGFkanVzdCB0aGUgYGhpdHlgIGJlbG93IHNvIHRoYXQgaXQgbGFuZHMgaW4gdGhlIGNlbnRlciBvZiBhIGxpbmVcblx0XHRjb25zdCBsaW5lTnVtYmVyID0gY3R4LmdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KHJlcXVlc3QubW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cdFx0Y29uc3QgbGluZVN0YXJ0VmVydGljYWxPZmZzZXQgPSBjdHguZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGxpbmVFbmRWZXJ0aWNhbE9mZnNldCA9IGxpbmVTdGFydFZlcnRpY2FsT2Zmc2V0ICsgY3R4LmxpbmVIZWlnaHQ7XG5cblx0XHRjb25zdCBpc0JlbG93TGFzdExpbmUgPSAoXG5cdFx0XHRsaW5lTnVtYmVyID09PSBjdHgudmlld01vZGVsLmdldExpbmVDb3VudCgpXG5cdFx0XHQmJiByZXF1ZXN0Lm1vdXNlVmVydGljYWxPZmZzZXQgPiBsaW5lRW5kVmVydGljYWxPZmZzZXRcblx0XHQpO1xuXG5cdFx0aWYgKCFpc0JlbG93TGFzdExpbmUpIHtcblx0XHRcdGNvbnN0IGxpbmVDZW50ZXJlZFZlcnRpY2FsT2Zmc2V0ID0gTWF0aC5mbG9vcigobGluZVN0YXJ0VmVydGljYWxPZmZzZXQgKyBsaW5lRW5kVmVydGljYWxPZmZzZXQpIC8gMik7XG5cdFx0XHRsZXQgYWRqdXN0ZWRQYWdlWSA9IHJlcXVlc3QucG9zLnkgKyAobGluZUNlbnRlcmVkVmVydGljYWxPZmZzZXQgLSByZXF1ZXN0Lm1vdXNlVmVydGljYWxPZmZzZXQpO1xuXG5cdFx0XHRpZiAoYWRqdXN0ZWRQYWdlWSA8PSByZXF1ZXN0LmVkaXRvclBvcy55KSB7XG5cdFx0XHRcdGFkanVzdGVkUGFnZVkgPSByZXF1ZXN0LmVkaXRvclBvcy55ICsgMTtcblx0XHRcdH1cblx0XHRcdGlmIChhZGp1c3RlZFBhZ2VZID49IHJlcXVlc3QuZWRpdG9yUG9zLnkgKyByZXF1ZXN0LmVkaXRvclBvcy5oZWlnaHQpIHtcblx0XHRcdFx0YWRqdXN0ZWRQYWdlWSA9IHJlcXVlc3QuZWRpdG9yUG9zLnkgKyByZXF1ZXN0LmVkaXRvclBvcy5oZWlnaHQgLSAxO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhZGp1c3RlZFBhZ2UgPSBuZXcgUGFnZUNvb3JkaW5hdGVzKHJlcXVlc3QucG9zLngsIGFkanVzdGVkUGFnZVkpO1xuXG5cdFx0XHRjb25zdCByID0gdGhpcy5fYWN0dWFsRG9IaXRUZXN0V2l0aENhcmV0UmFuZ2VGcm9tUG9pbnQoY3R4LCBhZGp1c3RlZFBhZ2UudG9DbGllbnRDb29yZGluYXRlcyhkb20uZ2V0V2luZG93KGN0eC52aWV3RG9tTm9kZSkpKTtcblx0XHRcdGlmIChyLnR5cGUgPT09IEhpdFRlc3RSZXN1bHRUeXBlLkNvbnRlbnQpIHtcblx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWxzbyB0cnkgdG8gaGl0IHRlc3Qgd2l0aG91dCB0aGUgYWRqdXN0bWVudCAoZm9yIHRoZSBlZGdlIGNhc2VzIHRoYXQgd2UgYXJlIG5lYXIgdGhlIHRvcCBvciBib3R0b20pXG5cdFx0cmV0dXJuIHRoaXMuX2FjdHVhbERvSGl0VGVzdFdpdGhDYXJldFJhbmdlRnJvbVBvaW50KGN0eCwgcmVxdWVzdC5wb3MudG9DbGllbnRDb29yZGluYXRlcyhkb20uZ2V0V2luZG93KGN0eC52aWV3RG9tTm9kZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9hY3R1YWxEb0hpdFRlc3RXaXRoQ2FyZXRSYW5nZUZyb21Qb2ludChjdHg6IEhpdFRlc3RDb250ZXh0LCBjb29yZHM6IENsaWVudENvb3JkaW5hdGVzKTogSGl0VGVzdFJlc3VsdCB7XG5cdFx0Y29uc3Qgc2hhZG93Um9vdCA9IGRvbS5nZXRTaGFkb3dSb290KGN0eC52aWV3RG9tTm9kZSk7XG5cdFx0bGV0IHJhbmdlOiBSYW5nZTtcblx0XHRpZiAoc2hhZG93Um9vdCkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRpZiAodHlwZW9mICg8YW55PnNoYWRvd1Jvb3QpLmNhcmV0UmFuZ2VGcm9tUG9pbnQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdHJhbmdlID0gc2hhZG93Q2FyZXRSYW5nZUZyb21Qb2ludChzaGFkb3dSb290LCBjb29yZHMuY2xpZW50WCwgY29vcmRzLmNsaWVudFkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdHJhbmdlID0gKDxhbnk+c2hhZG93Um9vdCkuY2FyZXRSYW5nZUZyb21Qb2ludChjb29yZHMuY2xpZW50WCwgY29vcmRzLmNsaWVudFkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdHJhbmdlID0gKDxhbnk+Y3R4LnZpZXdEb21Ob2RlLm93bmVyRG9jdW1lbnQpLmNhcmV0UmFuZ2VGcm9tUG9pbnQoY29vcmRzLmNsaWVudFgsIGNvb3Jkcy5jbGllbnRZKTtcblx0XHR9XG5cblx0XHRpZiAoIXJhbmdlIHx8ICFyYW5nZS5zdGFydENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIG5ldyBVbmtub3duSGl0VGVzdFJlc3VsdCgpO1xuXHRcdH1cblxuXHRcdC8vIENocm9tZSBhbHdheXMgaGl0cyBhIFRFWFRfTk9ERSwgd2hpbGUgRWRnZSBzb21ldGltZXMgaGl0cyBhIHRva2VuIHNwYW5cblx0XHRjb25zdCBzdGFydENvbnRhaW5lciA9IHJhbmdlLnN0YXJ0Q29udGFpbmVyO1xuXG5cdFx0aWYgKHN0YXJ0Q29udGFpbmVyLm5vZGVUeXBlID09PSBzdGFydENvbnRhaW5lci5URVhUX05PREUpIHtcblx0XHRcdC8vIHN0YXJ0Q29udGFpbmVyIGlzIGV4cGVjdGVkIHRvIGJlIHRoZSB0b2tlbiB0ZXh0XG5cdFx0XHRjb25zdCBwYXJlbnQxID0gc3RhcnRDb250YWluZXIucGFyZW50Tm9kZTsgLy8gZXhwZWN0ZWQgdG8gYmUgdGhlIHRva2VuIHNwYW5cblx0XHRcdGNvbnN0IHBhcmVudDIgPSBwYXJlbnQxID8gcGFyZW50MS5wYXJlbnROb2RlIDogbnVsbDsgLy8gZXhwZWN0ZWQgdG8gYmUgdGhlIHZpZXcgbGluZSBjb250YWluZXIgc3BhblxuXHRcdFx0Y29uc3QgcGFyZW50MyA9IHBhcmVudDIgPyBwYXJlbnQyLnBhcmVudE5vZGUgOiBudWxsOyAvLyBleHBlY3RlZCB0byBiZSB0aGUgdmlldyBsaW5lIGRpdlxuXHRcdFx0Y29uc3QgcGFyZW50M0NsYXNzTmFtZSA9IHBhcmVudDMgJiYgcGFyZW50My5ub2RlVHlwZSA9PT0gcGFyZW50My5FTEVNRU5UX05PREUgPyAoPEhUTUxFbGVtZW50PnBhcmVudDMpLmNsYXNzTmFtZSA6IG51bGw7XG5cblx0XHRcdGlmIChwYXJlbnQzQ2xhc3NOYW1lID09PSBWaWV3TGluZS5DTEFTU19OQU1FKSB7XG5cdFx0XHRcdHJldHVybiBIaXRUZXN0UmVzdWx0LmNyZWF0ZUZyb21ET01JbmZvKGN0eCwgPEhUTUxFbGVtZW50PnBhcmVudDEsIHJhbmdlLnN0YXJ0T2Zmc2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXcgVW5rbm93bkhpdFRlc3RSZXN1bHQoPEhUTUxFbGVtZW50PnN0YXJ0Q29udGFpbmVyLnBhcmVudE5vZGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoc3RhcnRDb250YWluZXIubm9kZVR5cGUgPT09IHN0YXJ0Q29udGFpbmVyLkVMRU1FTlRfTk9ERSkge1xuXHRcdFx0Ly8gc3RhcnRDb250YWluZXIgaXMgZXhwZWN0ZWQgdG8gYmUgdGhlIHRva2VuIHNwYW5cblx0XHRcdGNvbnN0IHBhcmVudDEgPSBzdGFydENvbnRhaW5lci5wYXJlbnROb2RlOyAvLyBleHBlY3RlZCB0byBiZSB0aGUgdmlldyBsaW5lIGNvbnRhaW5lciBzcGFuXG5cdFx0XHRjb25zdCBwYXJlbnQyID0gcGFyZW50MSA/IHBhcmVudDEucGFyZW50Tm9kZSA6IG51bGw7IC8vIGV4cGVjdGVkIHRvIGJlIHRoZSB2aWV3IGxpbmUgZGl2XG5cdFx0XHRjb25zdCBwYXJlbnQyQ2xhc3NOYW1lID0gcGFyZW50MiAmJiBwYXJlbnQyLm5vZGVUeXBlID09PSBwYXJlbnQyLkVMRU1FTlRfTk9ERSA/ICg8SFRNTEVsZW1lbnQ+cGFyZW50MikuY2xhc3NOYW1lIDogbnVsbDtcblxuXHRcdFx0aWYgKHBhcmVudDJDbGFzc05hbWUgPT09IFZpZXdMaW5lLkNMQVNTX05BTUUpIHtcblx0XHRcdFx0cmV0dXJuIEhpdFRlc3RSZXN1bHQuY3JlYXRlRnJvbURPTUluZm8oY3R4LCA8SFRNTEVsZW1lbnQ+c3RhcnRDb250YWluZXIsICg8SFRNTEVsZW1lbnQ+c3RhcnRDb250YWluZXIpLnRleHRDb250ZW50Lmxlbmd0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFVua25vd25IaXRUZXN0UmVzdWx0KDxIVE1MRWxlbWVudD5zdGFydENvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBVbmtub3duSGl0VGVzdFJlc3VsdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vc3QgcHJvYmFibHkgR2Vja29cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIF9kb0hpdFRlc3RXaXRoQ2FyZXRQb3NpdGlvbkZyb21Qb2ludChjdHg6IEhpdFRlc3RDb250ZXh0LCBjb29yZHM6IENsaWVudENvb3JkaW5hdGVzKTogSGl0VGVzdFJlc3VsdCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0Y29uc3QgaGl0UmVzdWx0OiB7IG9mZnNldE5vZGU6IE5vZGU7IG9mZnNldDogbnVtYmVyIH0gPSAoPGFueT5jdHgudmlld0RvbU5vZGUub3duZXJEb2N1bWVudCkuY2FyZXRQb3NpdGlvbkZyb21Qb2ludChjb29yZHMuY2xpZW50WCwgY29vcmRzLmNsaWVudFkpO1xuXG5cdFx0aWYgKGhpdFJlc3VsdC5vZmZzZXROb2RlLm5vZGVUeXBlID09PSBoaXRSZXN1bHQub2Zmc2V0Tm9kZS5URVhUX05PREUpIHtcblx0XHRcdC8vIG9mZnNldE5vZGUgaXMgZXhwZWN0ZWQgdG8gYmUgdGhlIHRva2VuIHRleHRcblx0XHRcdGNvbnN0IHBhcmVudDEgPSBoaXRSZXN1bHQub2Zmc2V0Tm9kZS5wYXJlbnROb2RlOyAvLyBleHBlY3RlZCB0byBiZSB0aGUgdG9rZW4gc3BhblxuXHRcdFx0Y29uc3QgcGFyZW50MiA9IHBhcmVudDEgPyBwYXJlbnQxLnBhcmVudE5vZGUgOiBudWxsOyAvLyBleHBlY3RlZCB0byBiZSB0aGUgdmlldyBsaW5lIGNvbnRhaW5lciBzcGFuXG5cdFx0XHRjb25zdCBwYXJlbnQzID0gcGFyZW50MiA/IHBhcmVudDIucGFyZW50Tm9kZSA6IG51bGw7IC8vIGV4cGVjdGVkIHRvIGJlIHRoZSB2aWV3IGxpbmUgZGl2XG5cdFx0XHRjb25zdCBwYXJlbnQzQ2xhc3NOYW1lID0gcGFyZW50MyAmJiBwYXJlbnQzLm5vZGVUeXBlID09PSBwYXJlbnQzLkVMRU1FTlRfTk9ERSA/ICg8SFRNTEVsZW1lbnQ+cGFyZW50MykuY2xhc3NOYW1lIDogbnVsbDtcblxuXHRcdFx0aWYgKHBhcmVudDNDbGFzc05hbWUgPT09IFZpZXdMaW5lLkNMQVNTX05BTUUpIHtcblx0XHRcdFx0cmV0dXJuIEhpdFRlc3RSZXN1bHQuY3JlYXRlRnJvbURPTUluZm8oY3R4LCA8SFRNTEVsZW1lbnQ+aGl0UmVzdWx0Lm9mZnNldE5vZGUucGFyZW50Tm9kZSwgaGl0UmVzdWx0Lm9mZnNldCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFVua25vd25IaXRUZXN0UmVzdWx0KDxIVE1MRWxlbWVudD5oaXRSZXN1bHQub2Zmc2V0Tm9kZS5wYXJlbnROb2RlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGb3IgaW5saW5lIGRlY29yYXRpb25zLCBHZWNrbyBzb21ldGltZXMgcmV0dXJucyB0aGUgYDxzcGFuPmAgb2YgdGhlIGxpbmUgYW5kIHRoZSBvZmZzZXQgaXMgdGhlIGA8c3Bhbj5gIHdpdGggdGhlIGlubGluZSBkZWNvcmF0aW9uXG5cdFx0Ly8gU29tZSBvdGhlciB0aW1lcywgaXQgcmV0dXJucyB0aGUgYDxzcGFuPmAgd2l0aCB0aGUgaW5saW5lIGRlY29yYXRpb25cblx0XHRpZiAoaGl0UmVzdWx0Lm9mZnNldE5vZGUubm9kZVR5cGUgPT09IGhpdFJlc3VsdC5vZmZzZXROb2RlLkVMRU1FTlRfTk9ERSkge1xuXHRcdFx0Y29uc3QgcGFyZW50MSA9IGhpdFJlc3VsdC5vZmZzZXROb2RlLnBhcmVudE5vZGU7XG5cdFx0XHRjb25zdCBwYXJlbnQxQ2xhc3NOYW1lID0gcGFyZW50MSAmJiBwYXJlbnQxLm5vZGVUeXBlID09PSBwYXJlbnQxLkVMRU1FTlRfTk9ERSA/ICg8SFRNTEVsZW1lbnQ+cGFyZW50MSkuY2xhc3NOYW1lIDogbnVsbDtcblx0XHRcdGNvbnN0IHBhcmVudDIgPSBwYXJlbnQxID8gcGFyZW50MS5wYXJlbnROb2RlIDogbnVsbDtcblx0XHRcdGNvbnN0IHBhcmVudDJDbGFzc05hbWUgPSBwYXJlbnQyICYmIHBhcmVudDIubm9kZVR5cGUgPT09IHBhcmVudDIuRUxFTUVOVF9OT0RFID8gKDxIVE1MRWxlbWVudD5wYXJlbnQyKS5jbGFzc05hbWUgOiBudWxsO1xuXG5cdFx0XHRpZiAocGFyZW50MUNsYXNzTmFtZSA9PT0gVmlld0xpbmUuQ0xBU1NfTkFNRSkge1xuXHRcdFx0XHQvLyBpdCByZXR1cm5lZCB0aGUgYDxzcGFuPmAgb2YgdGhlIGxpbmUgYW5kIHRoZSBvZmZzZXQgaXMgdGhlIGA8c3Bhbj5gIHdpdGggdGhlIGlubGluZSBkZWNvcmF0aW9uXG5cdFx0XHRcdGNvbnN0IHRva2VuU3BhbiA9IGhpdFJlc3VsdC5vZmZzZXROb2RlLmNoaWxkTm9kZXNbTWF0aC5taW4oaGl0UmVzdWx0Lm9mZnNldCwgaGl0UmVzdWx0Lm9mZnNldE5vZGUuY2hpbGROb2Rlcy5sZW5ndGggLSAxKV07XG5cdFx0XHRcdGlmICh0b2tlblNwYW4pIHtcblx0XHRcdFx0XHRyZXR1cm4gSGl0VGVzdFJlc3VsdC5jcmVhdGVGcm9tRE9NSW5mbyhjdHgsIDxIVE1MRWxlbWVudD50b2tlblNwYW4sIDApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHBhcmVudDJDbGFzc05hbWUgPT09IFZpZXdMaW5lLkNMQVNTX05BTUUpIHtcblx0XHRcdFx0Ly8gaXQgcmV0dXJuZWQgdGhlIGA8c3Bhbj5gIHdpdGggdGhlIGlubGluZSBkZWNvcmF0aW9uXG5cdFx0XHRcdHJldHVybiBIaXRUZXN0UmVzdWx0LmNyZWF0ZUZyb21ET01JbmZvKGN0eCwgPEhUTUxFbGVtZW50PmhpdFJlc3VsdC5vZmZzZXROb2RlLCAwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFVua25vd25IaXRUZXN0UmVzdWx0KDxIVE1MRWxlbWVudD5oaXRSZXN1bHQub2Zmc2V0Tm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc25hcFRvU29mdFRhYkJvdW5kYXJ5KHBvc2l0aW9uOiBQb3NpdGlvbiwgdmlld01vZGVsOiBJVmlld01vZGVsKTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gdmlld01vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHsgdGFiU2l6ZSB9ID0gdmlld01vZGVsLm1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRjb25zdCBuZXdQb3NpdGlvbiA9IEF0b21pY1RhYk1vdmVPcGVyYXRpb25zLmF0b21pY1Bvc2l0aW9uKGxpbmVDb250ZW50LCBwb3NpdGlvbi5jb2x1bW4gLSAxLCB0YWJTaXplLCBEaXJlY3Rpb24uTmVhcmVzdCk7XG5cdFx0aWYgKG5ld1Bvc2l0aW9uICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBuZXdQb3NpdGlvbiArIDEpO1xuXHRcdH1cblx0XHRyZXR1cm4gcG9zaXRpb247XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRvSGl0VGVzdChjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBCYXJlSGl0VGVzdFJlcXVlc3QpOiBIaXRUZXN0UmVzdWx0IHtcblxuXHRcdGxldCByZXN1bHQ6IEhpdFRlc3RSZXN1bHQgPSBuZXcgVW5rbm93bkhpdFRlc3RSZXN1bHQoKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRpZiAodHlwZW9mICg8YW55PmN0eC52aWV3RG9tTm9kZS5vd25lckRvY3VtZW50KS5jYXJldFJhbmdlRnJvbVBvaW50ID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRyZXN1bHQgPSB0aGlzLl9kb0hpdFRlc3RXaXRoQ2FyZXRSYW5nZUZyb21Qb2ludChjdHgsIHJlcXVlc3QpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0fSBlbHNlIGlmICgoPGFueT5jdHgudmlld0RvbU5vZGUub3duZXJEb2N1bWVudCkuY2FyZXRQb3NpdGlvbkZyb21Qb2ludCkge1xuXHRcdFx0cmVzdWx0ID0gdGhpcy5fZG9IaXRUZXN0V2l0aENhcmV0UG9zaXRpb25Gcm9tUG9pbnQoY3R4LCByZXF1ZXN0LnBvcy50b0NsaWVudENvb3JkaW5hdGVzKGRvbS5nZXRXaW5kb3coY3R4LnZpZXdEb21Ob2RlKSkpO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0LnR5cGUgPT09IEhpdFRlc3RSZXN1bHRUeXBlLkNvbnRlbnQpIHtcblx0XHRcdGNvbnN0IGluamVjdGVkVGV4dCA9IGN0eC52aWV3TW9kZWwuZ2V0SW5qZWN0ZWRUZXh0QXQocmVzdWx0LnBvc2l0aW9uKTtcblxuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZFBvc2l0aW9uID0gY3R4LnZpZXdNb2RlbC5ub3JtYWxpemVQb3NpdGlvbihyZXN1bHQucG9zaXRpb24sIFBvc2l0aW9uQWZmaW5pdHkuTm9uZSk7XG5cdFx0XHRpZiAoaW5qZWN0ZWRUZXh0IHx8ICFub3JtYWxpemVkUG9zaXRpb24uZXF1YWxzKHJlc3VsdC5wb3NpdGlvbikpIHtcblx0XHRcdFx0cmVzdWx0ID0gbmV3IENvbnRlbnRIaXRUZXN0UmVzdWx0KG5vcm1hbGl6ZWRQb3NpdGlvbiwgcmVzdWx0LnNwYW5Ob2RlLCBpbmplY3RlZFRleHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNoYWRvd0NhcmV0UmFuZ2VGcm9tUG9pbnQoc2hhZG93Um9vdDogU2hhZG93Um9vdCwgeDogbnVtYmVyLCB5OiBudW1iZXIpOiBSYW5nZSB7XG5cdGNvbnN0IHJhbmdlID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcblxuXHQvLyBHZXQgdGhlIGVsZW1lbnQgdW5kZXIgdGhlIHBvaW50XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRsZXQgZWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9ICg8YW55PnNoYWRvd1Jvb3QpLmVsZW1lbnRGcm9tUG9pbnQoeCwgeSk7XG5cdC8vIFdoZW4gZWwgaXMgbm90IG51bGwsIGl0IG1heSBiZSBkaXYubW9uYWNvLW1vdXNlLWN1cnNvci10ZXh0IEVsZW1lbnQsIHdoaWNoIGhhcyBub3QgY2hpbGROb2Rlcywgd2UgZG9uJ3QgbmVlZCB0byBoYW5kbGUgaXQuXG5cdGlmIChlbD8uaGFzQ2hpbGROb2RlcygpKSB7XG5cdFx0Ly8gR2V0IHRoZSBsYXN0IGNoaWxkIG9mIHRoZSBlbGVtZW50IHVudGlsIGl0cyBmaXJzdENoaWxkIGlzIGEgdGV4dCBub2RlXG5cdFx0Ly8gVGhpcyBhc3N1bWVzIHRoYXQgdGhlIHBvaW50ZXIgaXMgb24gdGhlIHJpZ2h0IG9mIHRoZSBsaW5lLCBvdXQgb2YgdGhlIHRva2Vuc1xuXHRcdC8vIGFuZCB0aGF0IHdlIHdhbnQgdG8gZ2V0IHRoZSBvZmZzZXQgb2YgdGhlIGxhc3QgdG9rZW4gb2YgdGhlIGxpbmVcblx0XHR3aGlsZSAoZWwgJiYgZWwuZmlyc3RDaGlsZCAmJiBlbC5maXJzdENoaWxkLm5vZGVUeXBlICE9PSBlbC5maXJzdENoaWxkLlRFWFRfTk9ERSAmJiBlbC5sYXN0Q2hpbGQgJiYgZWwubGFzdENoaWxkLmZpcnN0Q2hpbGQpIHtcblx0XHRcdGVsID0gPEhUTUxFbGVtZW50PmVsLmxhc3RDaGlsZDtcblx0XHR9XG5cblx0XHQvLyBHcmFiIGl0cyByZWN0XG5cdFx0Y29uc3QgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG5cdFx0Ly8gQW5kIGl0cyBmb250ICh0aGUgY29tcHV0ZWQgc2hvcnRoYW5kIGZvbnQgcHJvcGVydHkgbWlnaHQgYmUgZW1wdHksIHNlZSAjMzIxNylcblx0XHRjb25zdCBlbFdpbmRvdyA9IGRvbS5nZXRXaW5kb3coZWwpO1xuXHRcdGNvbnN0IGNvbXB1dGVkU3R5bGUgPSBlbFdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGVsLCBudWxsKTtcblx0XHRjb25zdCBmb250U3R5bGUgPSBjb21wdXRlZFN0eWxlLmdldFByb3BlcnR5VmFsdWUoJ2ZvbnQtc3R5bGUnKTtcblx0XHRjb25zdCBmb250VmFyaWFudCA9IGNvbXB1dGVkU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnZm9udC12YXJpYW50Jyk7XG5cdFx0Y29uc3QgZm9udFdlaWdodCA9IGNvbXB1dGVkU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnZm9udC13ZWlnaHQnKTtcblx0XHRjb25zdCBmb250U2l6ZSA9IGNvbXB1dGVkU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnZm9udC1zaXplJyk7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IGNvbXB1dGVkU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnbGluZS1oZWlnaHQnKTtcblx0XHRjb25zdCBmb250RmFtaWx5ID0gY29tcHV0ZWRTdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCdmb250LWZhbWlseScpO1xuXHRcdGNvbnN0IGZvbnQgPSBgJHtmb250U3R5bGV9ICR7Zm9udFZhcmlhbnR9ICR7Zm9udFdlaWdodH0gJHtmb250U2l6ZX0vJHtsaW5lSGVpZ2h0fSAke2ZvbnRGYW1pbHl9YDtcblxuXHRcdC8vIEFuZCBhbHNvIGl0cyB0eHQgY29udGVudFxuXHRcdGNvbnN0IHRleHQgPSBlbC5pbm5lclRleHQ7XG5cblx0XHQvLyBQb3NpdGlvbiB0aGUgcGl4ZWwgY3Vyc29yIGF0IHRoZSBsZWZ0IG9mIHRoZSBlbGVtZW50XG5cdFx0bGV0IHBpeGVsQ3Vyc29yID0gcmVjdC5sZWZ0O1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGxldCBzdGVwOiBudW1iZXI7XG5cblx0XHQvLyBJZiB0aGUgcG9pbnQgaXMgb24gdGhlIHJpZ2h0IG9mIHRoZSBib3ggcHV0IHRoZSBjdXJzb3IgYWZ0ZXIgdGhlIGxhc3QgY2hhcmFjdGVyXG5cdFx0aWYgKHggPiByZWN0LmxlZnQgKyByZWN0LndpZHRoKSB7XG5cdFx0XHRvZmZzZXQgPSB0ZXh0Lmxlbmd0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY2hhcldpZHRoUmVhZGVyID0gQ2hhcldpZHRoUmVhZGVyLmdldEluc3RhbmNlKCk7XG5cdFx0XHQvLyBHb2VzIHRocm91Z2ggYWxsIHRoZSBjaGFyYWN0ZXJzIG9mIHRoZSBpbm5lclRleHQsIGFuZCBjaGVja3MgaWYgdGhlIHggb2YgdGhlIHBvaW50XG5cdFx0XHQvLyBiZWxvbmdzIHRvIHRoZSBjaGFyYWN0ZXIuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoICsgMTsgaSsrKSB7XG5cdFx0XHRcdC8vIFRoZSBzdGVwIGlzIGhhbGYgdGhlIHdpZHRoIG9mIHRoZSBjaGFyYWN0ZXJcblx0XHRcdFx0c3RlcCA9IGNoYXJXaWR0aFJlYWRlci5nZXRDaGFyV2lkdGgodGV4dC5jaGFyQXQoaSksIGZvbnQpIC8gMjtcblx0XHRcdFx0Ly8gTW92ZSB0byB0aGUgY2VudGVyIG9mIHRoZSBjaGFyYWN0ZXJcblx0XHRcdFx0cGl4ZWxDdXJzb3IgKz0gc3RlcDtcblx0XHRcdFx0Ly8gSWYgdGhlIHggb2YgdGhlIHBvaW50IGlzIHNtYWxsZXIgdGhhdCB0aGUgcG9zaXRpb24gb2YgdGhlIGN1cnNvciwgdGhlIHBvaW50IGlzIG92ZXIgdGhhdCBjaGFyYWN0ZXJcblx0XHRcdFx0aWYgKHggPCBwaXhlbEN1cnNvcikge1xuXHRcdFx0XHRcdG9mZnNldCA9IGk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gTW92ZSBiZXR3ZWVuIHRoZSBjdXJyZW50IGNoYXJhY3RlciBhbmQgdGhlIG5leHRcblx0XHRcdFx0cGl4ZWxDdXJzb3IgKz0gc3RlcDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDcmVhdGVzIGEgcmFuZ2Ugd2l0aCB0aGUgdGV4dCBub2RlIG9mIHRoZSBlbGVtZW50IGFuZCBzZXQgdGhlIG9mZnNldCBmb3VuZFxuXHRcdHJhbmdlLnNldFN0YXJ0KGVsLmZpcnN0Q2hpbGQhLCBvZmZzZXQpO1xuXHRcdHJhbmdlLnNldEVuZChlbC5maXJzdENoaWxkISwgb2Zmc2V0KTtcblx0fVxuXG5cdHJldHVybiByYW5nZTtcbn1cblxuY2xhc3MgQ2hhcldpZHRoUmVhZGVyIHtcblx0cHJpdmF0ZSBzdGF0aWMgX0lOU1RBTkNFOiBDaGFyV2lkdGhSZWFkZXIgfCBudWxsID0gbnVsbDtcblxuXHRwdWJsaWMgc3RhdGljIGdldEluc3RhbmNlKCk6IENoYXJXaWR0aFJlYWRlciB7XG5cdFx0aWYgKCFDaGFyV2lkdGhSZWFkZXIuX0lOU1RBTkNFKSB7XG5cdFx0XHRDaGFyV2lkdGhSZWFkZXIuX0lOU1RBTkNFID0gbmV3IENoYXJXaWR0aFJlYWRlcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gQ2hhcldpZHRoUmVhZGVyLl9JTlNUQU5DRTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlOiB7IFtjYWNoZUtleTogc3RyaW5nXTogbnVtYmVyIH07XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9jYWNoZSA9IHt9O1xuXHRcdHRoaXMuX2NhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXHR9XG5cblx0cHVibGljIGdldENoYXJXaWR0aChjaGFyOiBzdHJpbmcsIGZvbnQ6IHN0cmluZyk6IG51bWJlciB7XG5cdFx0Y29uc3QgY2FjaGVLZXkgPSBjaGFyICsgZm9udDtcblx0XHRpZiAodGhpcy5fY2FjaGVbY2FjaGVLZXldKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FjaGVbY2FjaGVLZXldO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XG5cdFx0Y29udGV4dC5mb250ID0gZm9udDtcblx0XHRjb25zdCBtZXRyaWNzID0gY29udGV4dC5tZWFzdXJlVGV4dChjaGFyKTtcblx0XHRjb25zdCB3aWR0aCA9IG1ldHJpY3Mud2lkdGg7XG5cdFx0dGhpcy5fY2FjaGVbY2FjaGVLZXldID0gd2lkdGg7XG5cdFx0cmV0dXJuIHdpZHRoO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFvWCx1QkFBdUI7QUFDM1ksU0FBa0UsdUJBQW9EO0FBQ3RILFNBQVMsaUJBQWlCLHdCQUF3QjtBQUNsRCxTQUFTLGdCQUFnQjtBQUV6QixTQUEyQixvQkFBb0I7QUFDL0MsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLG1CQUFtQjtBQUlyQyxTQUFTLHFCQUFxQjtBQUM5QixZQUFZLFNBQVM7QUFDckIsU0FBUyx5QkFBeUIsaUJBQWlCO0FBQ25ELFNBQVMsa0JBQWtCLHFCQUFxQjtBQUdoRCxTQUFTLFlBQVk7QUFHckIsSUFBVyxvQkFBWCxrQkFBV0EsdUJBQVg7QUFDQyxFQUFBQSxzQ0FBQTtBQUNBLEVBQUFBLHNDQUFBO0FBRlUsU0FBQUE7QUFBQSxHQUFBO0FBS1gsTUFBTSxxQkFB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
