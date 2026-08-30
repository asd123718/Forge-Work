import * as dom from "../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import { Orientation, Sash, SashState } from "../../../../base/browser/ui/sash/sash.js";
import { Color, RGBA } from "../../../../base/common/color.js";
import { IdGenerator } from "../../../../base/common/idGenerator.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import * as objects from "../../../../base/common/objects.js";
import "./zoneWidget.css";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
const defaultColor = new Color(new RGBA(0, 122, 204));
const defaultOptions = {
  showArrow: true,
  showFrame: true,
  className: "",
  frameColor: defaultColor,
  arrowColor: defaultColor,
  keepEditorSelection: false
};
const WIDGET_ID = "vs.editor.contrib.zoneWidget";
class ViewZoneDelegate {
  constructor(domNode, afterLineNumber, afterColumn, heightInLines, onDomNodeTop, onComputedHeight, showInHiddenAreas, ordinal) {
    this.id = "";
    this.domNode = domNode;
    this.afterLineNumber = afterLineNumber;
    this.afterColumn = afterColumn;
    this.heightInLines = heightInLines;
    this.showInHiddenAreas = showInHiddenAreas;
    this.ordinal = ordinal;
    this._onDomNodeTop = onDomNodeTop;
    this._onComputedHeight = onComputedHeight;
  }
  onDomNodeTop(top) {
    this._onDomNodeTop(top);
  }
  onComputedHeight(height) {
    this._onComputedHeight(height);
  }
}
class OverlayWidgetDelegate {
  constructor(id, domNode) {
    this._id = id;
    this._domNode = domNode;
  }
  getId() {
    return this._id;
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return null;
  }
}
const _Arrow = class _Arrow {
  constructor(_editor) {
    this._editor = _editor;
    this._ruleName = _Arrow._IdGenerator.nextId();
    this._color = null;
    this._height = -1;
    this._decorations = this._editor.createDecorationsCollection();
  }
  dispose() {
    this.hide();
    domStylesheetsJs.removeCSSRulesContainingSelector(this._ruleName);
  }
  set color(value) {
    if (this._color !== value) {
      this._color = value;
      this._updateStyle();
    }
  }
  set height(value) {
    if (this._height !== value) {
      this._height = value;
      this._updateStyle();
    }
  }
  _updateStyle() {
    domStylesheetsJs.removeCSSRulesContainingSelector(this._ruleName);
    domStylesheetsJs.createCSSRule(
      `.monaco-editor ${this._ruleName}`,
      `border-style: solid; border-color: transparent; border-bottom-color: ${this._color}; border-width: ${this._height}px; bottom: -${this._height}px !important; margin-left: -${this._height}px; `
    );
  }
  show(where) {
    if (where.column === 1) {
      where = { lineNumber: where.lineNumber, column: 2 };
    }
    this._decorations.set([{
      range: Range.fromPositions(where),
      options: {
        description: "zone-widget-arrow",
        className: this._ruleName,
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }]);
  }
  hide() {
    this._decorations.clear();
  }
};
_Arrow._IdGenerator = new IdGenerator(".arrow-decoration-");
let Arrow = _Arrow;
class ZoneWidget {
  constructor(editor, options = {}) {
    this._arrow = null;
    this._overlayWidget = null;
    this._resizeSash = null;
    this._isSashResizeHeight = false;
    this._viewZone = null;
    this._disposables = new DisposableStore();
    this.container = null;
    this._isShowing = false;
    this.editor = editor;
    this._positionMarkerId = this.editor.createDecorationsCollection();
    this.options = objects.deepClone(options);
    objects.mixin(this.options, defaultOptions, false);
    this.domNode = document.createElement("div");
    if (!this.options.isAccessible) {
      this.domNode.setAttribute("aria-hidden", "true");
      this.domNode.setAttribute("role", "presentation");
    }
    this._disposables.add(this.editor.onDidLayoutChange((info) => {
      const width = this._getWidth(info);
      this.domNode.style.width = width + "px";
      this.domNode.style.left = this._getLeft(info) + "px";
      this._onWidth(width);
    }));
  }
  dispose() {
    if (this._overlayWidget) {
      this.editor.removeOverlayWidget(this._overlayWidget);
      this._overlayWidget = null;
    }
    if (this._viewZone) {
      this.editor.changeViewZones((accessor) => {
        if (this._viewZone) {
          accessor.removeZone(this._viewZone.id);
        }
        this._viewZone = null;
      });
    }
    this._positionMarkerId.clear();
    this._disposables.dispose();
  }
  create() {
    this.domNode.classList.add("zone-widget");
    if (this.options.className) {
      this.domNode.classList.add(this.options.className);
    }
    this.container = document.createElement("div");
    this.container.classList.add("zone-widget-container");
    this.domNode.appendChild(this.container);
    if (this.options.showArrow) {
      this._arrow = new Arrow(this.editor);
      this._disposables.add(this._arrow);
    }
    this._fillContainer(this.container);
    this._initSash();
    this._applyStyles();
  }
  style(styles) {
    if (styles.frameColor) {
      this.options.frameColor = styles.frameColor;
    }
    if (styles.arrowColor) {
      this.options.arrowColor = styles.arrowColor;
    }
    this._applyStyles();
  }
  _applyStyles() {
    if (this.container && this.options.frameColor) {
      const frameColor = this.options.frameColor.toString();
      this.container.style.borderTopColor = frameColor;
      this.container.style.borderBottomColor = frameColor;
    }
    if (this._arrow && this.options.arrowColor) {
      const arrowColor = this.options.arrowColor.toString();
      this._arrow.color = arrowColor;
    }
  }
  _getWidth(info) {
    return info.width - info.minimap.minimapWidth - info.verticalScrollbarWidth;
  }
  _getLeft(info) {
    if (info.minimap.minimapWidth > 0 && info.minimap.minimapLeft === 0) {
      return info.minimap.minimapWidth;
    }
    return 0;
  }
  _onViewZoneTop(top) {
    this.domNode.style.top = top + "px";
  }
  _onViewZoneHeight(height) {
    this.domNode.style.height = `${height}px`;
    if (this.container) {
      const containerHeight = height - this._decoratingElementsHeight();
      this.container.style.height = `${containerHeight}px`;
      const layoutInfo = this.editor.getLayoutInfo();
      this._doLayout(containerHeight, this._getWidth(layoutInfo));
    }
    this._resizeSash?.layout();
  }
  get position() {
    const range = this._positionMarkerId.getRange(0);
    if (!range) {
      return void 0;
    }
    return range.getStartPosition();
  }
  hasFocus() {
    return this.domNode.contains(dom.getActiveElement());
  }
  show(rangeOrPos, heightInLines) {
    const range = Range.isIRange(rangeOrPos) ? Range.lift(rangeOrPos) : Range.fromPositions(rangeOrPos);
    this._isShowing = true;
    this._showImpl(range, heightInLines);
    this._isShowing = false;
    this._positionMarkerId.set([{ range, options: ModelDecorationOptions.EMPTY }]);
  }
  updatePositionAndHeight(rangeOrPos, heightInLines) {
    if (this._viewZone) {
      rangeOrPos = Range.isIRange(rangeOrPos) ? Range.getStartPosition(rangeOrPos) : rangeOrPos;
      this._viewZone.afterLineNumber = rangeOrPos.lineNumber;
      this._viewZone.afterColumn = rangeOrPos.column;
      this._viewZone.heightInLines = heightInLines ?? this._viewZone.heightInLines;
      this.editor.changeViewZones((accessor) => {
        accessor.layoutZone(this._viewZone.id);
      });
      this._positionMarkerId.set([{
        range: Range.isIRange(rangeOrPos) ? rangeOrPos : Range.fromPositions(rangeOrPos),
        options: ModelDecorationOptions.EMPTY
      }]);
      this._updateSashEnablement();
    }
  }
  hide() {
    if (this._viewZone) {
      this.editor.changeViewZones((accessor) => {
        if (this._viewZone) {
          accessor.removeZone(this._viewZone.id);
        }
      });
      this._viewZone = null;
    }
    if (this._overlayWidget) {
      this.editor.removeOverlayWidget(this._overlayWidget);
      this._overlayWidget = null;
    }
    this._arrow?.hide();
    this._positionMarkerId.clear();
    this._isSashResizeHeight = false;
  }
  _decoratingElementsHeight() {
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    let result = 0;
    if (this.options.showArrow) {
      const arrowHeight = Math.round(lineHeight / 3);
      result += 2 * arrowHeight;
    }
    if (this.options.showFrame) {
      const frameThickness = this.options.frameWidth ?? Math.round(lineHeight / 9);
      result += 2 * frameThickness;
    }
    return result;
  }
  /** Gets the maximum widget height in lines. */
  _getMaximumHeightInLines() {
    return Math.max(12, this.editor.getLayoutInfo().height / this.editor.getOption(EditorOption.lineHeight) * 0.8);
  }
  _showImpl(where, heightInLines) {
    const position = where.getStartPosition();
    const layoutInfo = this.editor.getLayoutInfo();
    const width = this._getWidth(layoutInfo);
    this.domNode.style.width = `${width}px`;
    this.domNode.style.left = this._getLeft(layoutInfo) + "px";
    const viewZoneDomNode = document.createElement("div");
    viewZoneDomNode.style.overflow = "hidden";
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const maxHeightInLines = this._getMaximumHeightInLines();
    if (maxHeightInLines !== void 0) {
      heightInLines = Math.min(heightInLines, maxHeightInLines);
    }
    let arrowHeight = 0;
    let frameThickness = 0;
    if (this._arrow && this.options.showArrow) {
      arrowHeight = Math.round(lineHeight / 3);
      this._arrow.height = arrowHeight;
      this._arrow.show(position);
    }
    if (this.options.showFrame) {
      frameThickness = Math.round(lineHeight / 9);
    }
    this.editor.changeViewZones((accessor) => {
      if (this._viewZone) {
        accessor.removeZone(this._viewZone.id);
      }
      if (this._overlayWidget) {
        this.editor.removeOverlayWidget(this._overlayWidget);
        this._overlayWidget = null;
      }
      this.domNode.style.top = "-1000px";
      this._viewZone = new ViewZoneDelegate(
        viewZoneDomNode,
        position.lineNumber,
        position.column,
        heightInLines,
        (top) => this._onViewZoneTop(top),
        (height) => this._onViewZoneHeight(height),
        this.options.showInHiddenAreas,
        this.options.ordinal
      );
      this._viewZone.id = accessor.addZone(this._viewZone);
      this._overlayWidget = new OverlayWidgetDelegate(WIDGET_ID + this._viewZone.id, this.domNode);
      this.editor.addOverlayWidget(this._overlayWidget);
    });
    this._updateSashEnablement();
    if (this.container && this.options.showFrame) {
      const width2 = this.options.frameWidth ? this.options.frameWidth : frameThickness;
      this.container.style.borderTopWidth = width2 + "px";
      this.container.style.borderBottomWidth = width2 + "px";
    }
    const containerHeight = heightInLines * lineHeight - this._decoratingElementsHeight();
    if (this.container) {
      this.container.style.top = arrowHeight + "px";
      this.container.style.height = containerHeight + "px";
      this.container.style.overflow = "hidden";
    }
    this._doLayout(containerHeight, width);
    if (!this.options.keepEditorSelection) {
      this.editor.setSelection(where);
    }
    const model = this.editor.getModel();
    if (model) {
      const range = model.validateRange(new Range(where.startLineNumber, 1, where.endLineNumber + 1, 1));
      this.revealRange(range, range.startLineNumber === model.getLineCount());
    }
  }
  revealRange(range, isLastLine) {
    if (isLastLine) {
      this.editor.revealLineNearTop(range.endLineNumber, ScrollType.Smooth);
    } else {
      this.editor.revealRange(range, ScrollType.Smooth);
    }
  }
  setCssClass(className, classToReplace) {
    if (!this.container) {
      return;
    }
    if (classToReplace) {
      this.container.classList.remove(classToReplace);
    }
    this.container.classList.add(className);
  }
  _onWidth(widthInPixel) {
  }
  _doLayout(heightInPixel, widthInPixel) {
  }
  _relayout(_newHeightInLines, useMax) {
    const maxHeightInLines = this._getMaximumHeightInLines();
    const newHeightInLines = useMax && maxHeightInLines !== void 0 ? Math.min(maxHeightInLines, _newHeightInLines) : _newHeightInLines;
    if (this._viewZone && this._viewZone.heightInLines !== newHeightInLines) {
      this.editor.changeViewZones((accessor) => {
        if (this._viewZone) {
          this._viewZone.heightInLines = newHeightInLines;
          accessor.layoutZone(this._viewZone.id);
        }
      });
      this._updateSashEnablement();
    }
  }
  // --- sash
  _initSash() {
    if (this._resizeSash) {
      return;
    }
    this._resizeSash = this._disposables.add(new Sash(this.domNode, this, { orientation: Orientation.HORIZONTAL }));
    if (!this.options.isResizeable) {
      this._resizeSash.state = SashState.Disabled;
    }
    let data;
    this._disposables.add(this._resizeSash.onDidStart((e) => {
      if (this._viewZone) {
        data = {
          startY: e.startY,
          heightInLines: this._viewZone.heightInLines,
          ...this._getResizeBounds()
        };
      }
    }));
    this._disposables.add(this._resizeSash.onDidEnd(() => {
      data = void 0;
    }));
    this._disposables.add(this._resizeSash.onDidChange((evt) => {
      if (data) {
        const lineDelta = (evt.currentY - data.startY) / this.editor.getOption(EditorOption.lineHeight);
        const roundedLineDelta = lineDelta < 0 ? Math.ceil(lineDelta) : Math.floor(lineDelta);
        const newHeightInLines = data.heightInLines + roundedLineDelta;
        if (newHeightInLines > data.minLines && newHeightInLines < data.maxLines) {
          this._isSashResizeHeight = true;
          this._relayout(newHeightInLines);
        }
      }
    }));
  }
  _updateSashEnablement() {
    if (this._resizeSash) {
      const { minLines, maxLines } = this._getResizeBounds();
      this._resizeSash.state = minLines === maxLines ? SashState.Disabled : SashState.Enabled;
    }
  }
  get _usesResizeHeight() {
    return this._isSashResizeHeight;
  }
  _getResizeBounds() {
    return { minLines: 5, maxLines: 35 };
  }
  getHorizontalSashLeft() {
    return 0;
  }
  getHorizontalSashTop() {
    return (this.domNode.style.height === null ? 0 : parseInt(this.domNode.style.height)) - this._decoratingElementsHeight() / 2;
  }
  getHorizontalSashWidth() {
    const layoutInfo = this.editor.getLayoutInfo();
    return layoutInfo.width - layoutInfo.minimap.minimapWidth;
  }
}
export {
  OverlayWidgetDelegate,
  ZoneWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHpvbmVXaWRnZXRcXGJyb3dzZXJcXHpvbmVXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb21TdHlsZXNoZWV0c0pzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBJSG9yaXpvbnRhbFNhc2hMYXlvdXRQcm92aWRlciwgSVNhc2hFdmVudCwgT3JpZW50YXRpb24sIFNhc2gsIFNhc2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgQ29sb3IsIFJHQkEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBJZEdlbmVyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2lkR2VuZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0ICcuL3pvbmVXaWRnZXQuY3NzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJT3ZlcmxheVdpZGdldCwgSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiwgSVZpZXdab25lLCBJVmlld1pvbmVDaGFuZ2VBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JMYXlvdXRJbmZvLCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uLCBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJT3B0aW9ucyB7XG5cdHNob3dGcmFtZT86IGJvb2xlYW47XG5cdHNob3dBcnJvdz86IGJvb2xlYW47XG5cdGZyYW1lV2lkdGg/OiBudW1iZXI7XG5cdGNsYXNzTmFtZT86IHN0cmluZztcblx0aXNBY2Nlc3NpYmxlPzogYm9vbGVhbjtcblx0aXNSZXNpemVhYmxlPzogYm9vbGVhbjtcblx0ZnJhbWVDb2xvcj86IENvbG9yIHwgc3RyaW5nO1xuXHRhcnJvd0NvbG9yPzogQ29sb3I7XG5cdGtlZXBFZGl0b3JTZWxlY3Rpb24/OiBib29sZWFuO1xuXHRvcmRpbmFsPzogbnVtYmVyO1xuXHRzaG93SW5IaWRkZW5BcmVhcz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0eWxlcyB7XG5cdGZyYW1lQ29sb3I/OiBDb2xvciB8IHN0cmluZyB8IG51bGw7XG5cdGFycm93Q29sb3I/OiBDb2xvciB8IG51bGw7XG59XG5cbmNvbnN0IGRlZmF1bHRDb2xvciA9IG5ldyBDb2xvcihuZXcgUkdCQSgwLCAxMjIsIDIwNCkpO1xuXG5jb25zdCBkZWZhdWx0T3B0aW9uczogSU9wdGlvbnMgPSB7XG5cdHNob3dBcnJvdzogdHJ1ZSxcblx0c2hvd0ZyYW1lOiB0cnVlLFxuXHRjbGFzc05hbWU6ICcnLFxuXHRmcmFtZUNvbG9yOiBkZWZhdWx0Q29sb3IsXG5cdGFycm93Q29sb3I6IGRlZmF1bHRDb2xvcixcblx0a2VlcEVkaXRvclNlbGVjdGlvbjogZmFsc2Vcbn07XG5cbmNvbnN0IFdJREdFVF9JRCA9ICd2cy5lZGl0b3IuY29udHJpYi56b25lV2lkZ2V0JztcblxuY2xhc3MgVmlld1pvbmVEZWxlZ2F0ZSBpbXBsZW1lbnRzIElWaWV3Wm9uZSB7XG5cblx0ZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdGlkOiBzdHJpbmcgPSAnJzsgLy8gQSB2YWxpZCB6b25lIGlkIHNob3VsZCBiZSBncmVhdGVyIHRoYW4gMFxuXHRhZnRlckxpbmVOdW1iZXI6IG51bWJlcjtcblx0YWZ0ZXJDb2x1bW46IG51bWJlcjtcblx0aGVpZ2h0SW5MaW5lczogbnVtYmVyO1xuXHRyZWFkb25seSBzaG93SW5IaWRkZW5BcmVhczogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb3JkaW5hbDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRG9tTm9kZVRvcDogKHRvcDogbnVtYmVyKSA9PiB2b2lkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbXB1dGVkSGVpZ2h0OiAoaGVpZ2h0OiBudW1iZXIpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoZG9tTm9kZTogSFRNTEVsZW1lbnQsIGFmdGVyTGluZU51bWJlcjogbnVtYmVyLCBhZnRlckNvbHVtbjogbnVtYmVyLCBoZWlnaHRJbkxpbmVzOiBudW1iZXIsXG5cdFx0b25Eb21Ob2RlVG9wOiAodG9wOiBudW1iZXIpID0+IHZvaWQsXG5cdFx0b25Db21wdXRlZEhlaWdodDogKGhlaWdodDogbnVtYmVyKSA9PiB2b2lkLFxuXHRcdHNob3dJbkhpZGRlbkFyZWFzOiBib29sZWFuIHwgdW5kZWZpbmVkLFxuXHRcdG9yZGluYWw6IG51bWJlciB8IHVuZGVmaW5lZFxuXHQpIHtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb21Ob2RlO1xuXHRcdHRoaXMuYWZ0ZXJMaW5lTnVtYmVyID0gYWZ0ZXJMaW5lTnVtYmVyO1xuXHRcdHRoaXMuYWZ0ZXJDb2x1bW4gPSBhZnRlckNvbHVtbjtcblx0XHR0aGlzLmhlaWdodEluTGluZXMgPSBoZWlnaHRJbkxpbmVzO1xuXHRcdHRoaXMuc2hvd0luSGlkZGVuQXJlYXMgPSBzaG93SW5IaWRkZW5BcmVhcztcblx0XHR0aGlzLm9yZGluYWwgPSBvcmRpbmFsO1xuXHRcdHRoaXMuX29uRG9tTm9kZVRvcCA9IG9uRG9tTm9kZVRvcDtcblx0XHR0aGlzLl9vbkNvbXB1dGVkSGVpZ2h0ID0gb25Db21wdXRlZEhlaWdodDtcblx0fVxuXG5cdG9uRG9tTm9kZVRvcCh0b3A6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX29uRG9tTm9kZVRvcCh0b3ApO1xuXHR9XG5cblx0b25Db21wdXRlZEhlaWdodChoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX29uQ29tcHV0ZWRIZWlnaHQoaGVpZ2h0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3ZlcmxheVdpZGdldERlbGVnYXRlIGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGRvbU5vZGU6IEhUTUxFbGVtZW50KSB7XG5cdFx0dGhpcy5faWQgPSBpZDtcblx0XHR0aGlzLl9kb21Ob2RlID0gZG9tTm9kZTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJT3ZlcmxheVdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuY2xhc3MgQXJyb3cge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9JZEdlbmVyYXRvciA9IG5ldyBJZEdlbmVyYXRvcignLmFycm93LWRlY29yYXRpb24tJyk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcnVsZU5hbWUgPSBBcnJvdy5fSWRHZW5lcmF0b3IubmV4dElkKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIF9jb2xvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2hlaWdodDogbnVtYmVyID0gLTE7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvclxuXHQpIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5oaWRlKCk7XG5cdFx0ZG9tU3R5bGVzaGVldHNKcy5yZW1vdmVDU1NSdWxlc0NvbnRhaW5pbmdTZWxlY3Rvcih0aGlzLl9ydWxlTmFtZSk7XG5cdH1cblxuXHRzZXQgY29sb3IodmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl9jb2xvciAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuX2NvbG9yID0gdmFsdWU7XG5cdFx0XHR0aGlzLl91cGRhdGVTdHlsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHNldCBoZWlnaHQodmFsdWU6IG51bWJlcikge1xuXHRcdGlmICh0aGlzLl9oZWlnaHQgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLl9oZWlnaHQgPSB2YWx1ZTtcblx0XHRcdHRoaXMuX3VwZGF0ZVN0eWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU3R5bGUoKTogdm9pZCB7XG5cdFx0ZG9tU3R5bGVzaGVldHNKcy5yZW1vdmVDU1NSdWxlc0NvbnRhaW5pbmdTZWxlY3Rvcih0aGlzLl9ydWxlTmFtZSk7XG5cdFx0ZG9tU3R5bGVzaGVldHNKcy5jcmVhdGVDU1NSdWxlKFxuXHRcdFx0YC5tb25hY28tZWRpdG9yICR7dGhpcy5fcnVsZU5hbWV9YCxcblx0XHRcdGBib3JkZXItc3R5bGU6IHNvbGlkOyBib3JkZXItY29sb3I6IHRyYW5zcGFyZW50OyBib3JkZXItYm90dG9tLWNvbG9yOiAke3RoaXMuX2NvbG9yfTsgYm9yZGVyLXdpZHRoOiAke3RoaXMuX2hlaWdodH1weDsgYm90dG9tOiAtJHt0aGlzLl9oZWlnaHR9cHggIWltcG9ydGFudDsgbWFyZ2luLWxlZnQ6IC0ke3RoaXMuX2hlaWdodH1weDsgYFxuXHRcdCk7XG5cdH1cblxuXHRzaG93KHdoZXJlOiBJUG9zaXRpb24pOiB2b2lkIHtcblxuXHRcdGlmICh3aGVyZS5jb2x1bW4gPT09IDEpIHtcblx0XHRcdC8vIHRoZSBhcnJvdyBpc24ndCBwcmV0dHkgYXQgY29sdW1uIDEgYW5kIHdlIG5lZWQgdG8gcHVzaCBpdCBvdXQgYSBsaXR0bGVcblx0XHRcdHdoZXJlID0geyBsaW5lTnVtYmVyOiB3aGVyZS5saW5lTnVtYmVyLCBjb2x1bW46IDIgfTtcblx0XHR9XG5cblx0XHR0aGlzLl9kZWNvcmF0aW9ucy5zZXQoW3tcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHdoZXJlKSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd6b25lLXdpZGdldC1hcnJvdycsXG5cdFx0XHRcdGNsYXNzTmFtZTogdGhpcy5fcnVsZU5hbWUsXG5cdFx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzXG5cdFx0XHR9XG5cdFx0fV0pO1xuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBab25lV2lkZ2V0IGltcGxlbWVudHMgSUhvcml6b250YWxTYXNoTGF5b3V0UHJvdmlkZXIge1xuXG5cdHByaXZhdGUgX2Fycm93OiBBcnJvdyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9vdmVybGF5V2lkZ2V0OiBPdmVybGF5V2lkZ2V0RGVsZWdhdGUgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfcmVzaXplU2FzaDogU2FzaCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9pc1Nhc2hSZXNpemVIZWlnaHQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcG9zaXRpb25NYXJrZXJJZDogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjtcblxuXHRwcm90ZWN0ZWQgX3ZpZXdab25lOiBWaWV3Wm9uZURlbGVnYXRlIHwgbnVsbCA9IG51bGw7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0ZWRpdG9yOiBJQ29kZUVkaXRvcjtcblx0b3B0aW9uczogSU9wdGlvbnM7XG5cblxuXHRjb25zdHJ1Y3RvcihlZGl0b3I6IElDb2RlRWRpdG9yLCBvcHRpb25zOiBJT3B0aW9ucyA9IHt9KSB7XG5cdFx0dGhpcy5lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5fcG9zaXRpb25NYXJrZXJJZCA9IHRoaXMuZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9iamVjdHMuZGVlcENsb25lKG9wdGlvbnMpO1xuXHRcdG9iamVjdHMubWl4aW4odGhpcy5vcHRpb25zLCBkZWZhdWx0T3B0aW9ucywgZmFsc2UpO1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGlmICghdGhpcy5vcHRpb25zLmlzQWNjZXNzaWJsZSkge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdwcmVzZW50YXRpb24nKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3Iub25EaWRMYXlvdXRDaGFuZ2UoKGluZm86IEVkaXRvckxheW91dEluZm8pID0+IHtcblx0XHRcdGNvbnN0IHdpZHRoID0gdGhpcy5fZ2V0V2lkdGgoaW5mbyk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUud2lkdGggPSB3aWR0aCArICdweCc7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUubGVmdCA9IHRoaXMuX2dldExlZnQoaW5mbykgKyAncHgnO1xuXHRcdFx0dGhpcy5fb25XaWR0aCh3aWR0aCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fb3ZlcmxheVdpZGdldCkge1xuXHRcdFx0dGhpcy5lZGl0b3IucmVtb3ZlT3ZlcmxheVdpZGdldCh0aGlzLl9vdmVybGF5V2lkZ2V0KTtcblx0XHRcdHRoaXMuX292ZXJsYXlXaWRnZXQgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl92aWV3Wm9uZSkge1xuXHRcdFx0dGhpcy5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3ZpZXdab25lKSB7XG5cdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZSh0aGlzLl92aWV3Wm9uZS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdmlld1pvbmUgPSBudWxsO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcG9zaXRpb25NYXJrZXJJZC5jbGVhcigpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0Y3JlYXRlKCk6IHZvaWQge1xuXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3pvbmUtd2lkZ2V0Jyk7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5jbGFzc05hbWUpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKHRoaXMub3B0aW9ucy5jbGFzc05hbWUpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnem9uZS13aWRnZXQtY29udGFpbmVyJyk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuY29udGFpbmVyKTtcblx0XHRpZiAodGhpcy5vcHRpb25zLnNob3dBcnJvdykge1xuXHRcdFx0dGhpcy5fYXJyb3cgPSBuZXcgQXJyb3codGhpcy5lZGl0b3IpO1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2Fycm93KTtcblx0XHR9XG5cdFx0dGhpcy5fZmlsbENvbnRhaW5lcih0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5faW5pdFNhc2goKTtcblx0XHR0aGlzLl9hcHBseVN0eWxlcygpO1xuXHR9XG5cblx0c3R5bGUoc3R5bGVzOiBJU3R5bGVzKTogdm9pZCB7XG5cdFx0aWYgKHN0eWxlcy5mcmFtZUNvbG9yKSB7XG5cdFx0XHR0aGlzLm9wdGlvbnMuZnJhbWVDb2xvciA9IHN0eWxlcy5mcmFtZUNvbG9yO1xuXHRcdH1cblx0XHRpZiAoc3R5bGVzLmFycm93Q29sb3IpIHtcblx0XHRcdHRoaXMub3B0aW9ucy5hcnJvd0NvbG9yID0gc3R5bGVzLmFycm93Q29sb3I7XG5cdFx0fVxuXHRcdHRoaXMuX2FwcGx5U3R5bGVzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2FwcGx5U3R5bGVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRhaW5lciAmJiB0aGlzLm9wdGlvbnMuZnJhbWVDb2xvcikge1xuXHRcdFx0Y29uc3QgZnJhbWVDb2xvciA9IHRoaXMub3B0aW9ucy5mcmFtZUNvbG9yLnRvU3RyaW5nKCk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5ib3JkZXJUb3BDb2xvciA9IGZyYW1lQ29sb3I7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5ib3JkZXJCb3R0b21Db2xvciA9IGZyYW1lQ29sb3I7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hcnJvdyAmJiB0aGlzLm9wdGlvbnMuYXJyb3dDb2xvcikge1xuXHRcdFx0Y29uc3QgYXJyb3dDb2xvciA9IHRoaXMub3B0aW9ucy5hcnJvd0NvbG9yLnRvU3RyaW5nKCk7XG5cdFx0XHR0aGlzLl9hcnJvdy5jb2xvciA9IGFycm93Q29sb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRXaWR0aChpbmZvOiBFZGl0b3JMYXlvdXRJbmZvKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gaW5mby53aWR0aCAtIGluZm8ubWluaW1hcC5taW5pbWFwV2lkdGggLSBpbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMZWZ0KGluZm86IEVkaXRvckxheW91dEluZm8pOiBudW1iZXIge1xuXHRcdC8vIElmIG1pbmltYXAgaXMgdG8gdGhlIGxlZnQsIHdlIG1vdmUgYmV5b25kIGl0XG5cdFx0aWYgKGluZm8ubWluaW1hcC5taW5pbWFwV2lkdGggPiAwICYmIGluZm8ubWluaW1hcC5taW5pbWFwTGVmdCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGluZm8ubWluaW1hcC5taW5pbWFwV2lkdGg7XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25WaWV3Wm9uZVRvcCh0b3A6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS50b3AgPSB0b3AgKyAncHgnO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25WaWV3Wm9uZUhlaWdodChoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXG5cdFx0aWYgKHRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBjb250YWluZXJIZWlnaHQgPSBoZWlnaHQgLSB0aGlzLl9kZWNvcmF0aW5nRWxlbWVudHNIZWlnaHQoKTtcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2NvbnRhaW5lckhlaWdodH1weGA7XG5cdFx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdFx0dGhpcy5fZG9MYXlvdXQoY29udGFpbmVySGVpZ2h0LCB0aGlzLl9nZXRXaWR0aChsYXlvdXRJbmZvKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVzaXplU2FzaD8ubGF5b3V0KCk7XG5cdH1cblxuXHRnZXQgcG9zaXRpb24oKTogUG9zaXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fcG9zaXRpb25NYXJrZXJJZC5nZXRSYW5nZSgwKTtcblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHR9XG5cblx0aGFzRm9jdXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZS5jb250YWlucyhkb20uZ2V0QWN0aXZlRWxlbWVudCgpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfaXNTaG93aW5nOiBib29sZWFuID0gZmFsc2U7XG5cblx0c2hvdyhyYW5nZU9yUG9zOiBJUmFuZ2UgfCBJUG9zaXRpb24sIGhlaWdodEluTGluZXM6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UuaXNJUmFuZ2UocmFuZ2VPclBvcykgPyBSYW5nZS5saWZ0KHJhbmdlT3JQb3MpIDogUmFuZ2UuZnJvbVBvc2l0aW9ucyhyYW5nZU9yUG9zKTtcblx0XHR0aGlzLl9pc1Nob3dpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX3Nob3dJbXBsKHJhbmdlLCBoZWlnaHRJbkxpbmVzKTtcblx0XHR0aGlzLl9pc1Nob3dpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9wb3NpdGlvbk1hcmtlcklkLnNldChbeyByYW5nZSwgb3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5FTVBUWSB9XSk7XG5cdH1cblxuXHR1cGRhdGVQb3NpdGlvbkFuZEhlaWdodChyYW5nZU9yUG9zOiBJUmFuZ2UgfCBJUG9zaXRpb24sIGhlaWdodEluTGluZXM/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlld1pvbmUpIHtcblx0XHRcdHJhbmdlT3JQb3MgPSBSYW5nZS5pc0lSYW5nZShyYW5nZU9yUG9zKSA/IFJhbmdlLmdldFN0YXJ0UG9zaXRpb24ocmFuZ2VPclBvcykgOiByYW5nZU9yUG9zO1xuXHRcdFx0dGhpcy5fdmlld1pvbmUuYWZ0ZXJMaW5lTnVtYmVyID0gcmFuZ2VPclBvcy5saW5lTnVtYmVyO1xuXHRcdFx0dGhpcy5fdmlld1pvbmUuYWZ0ZXJDb2x1bW4gPSByYW5nZU9yUG9zLmNvbHVtbjtcblx0XHRcdHRoaXMuX3ZpZXdab25lLmhlaWdodEluTGluZXMgPSBoZWlnaHRJbkxpbmVzID8/IHRoaXMuX3ZpZXdab25lLmhlaWdodEluTGluZXM7XG5cblx0XHRcdHRoaXMuZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUodGhpcy5fdmlld1pvbmUhLmlkKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcG9zaXRpb25NYXJrZXJJZC5zZXQoW3tcblx0XHRcdFx0cmFuZ2U6IFJhbmdlLmlzSVJhbmdlKHJhbmdlT3JQb3MpID8gcmFuZ2VPclBvcyA6IFJhbmdlLmZyb21Qb3NpdGlvbnMocmFuZ2VPclBvcyksXG5cdFx0XHRcdG9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuRU1QVFlcblx0XHRcdH1dKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVNhc2hFbmFibGVtZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlld1pvbmUpIHtcblx0XHRcdHRoaXMuZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl92aWV3Wm9uZSkge1xuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUodGhpcy5fdmlld1pvbmUuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3ZpZXdab25lID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX292ZXJsYXlXaWRnZXQpIHtcblx0XHRcdHRoaXMuZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQodGhpcy5fb3ZlcmxheVdpZGdldCk7XG5cdFx0XHR0aGlzLl9vdmVybGF5V2lkZ2V0ID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fYXJyb3c/LmhpZGUoKTtcblx0XHR0aGlzLl9wb3NpdGlvbk1hcmtlcklkLmNsZWFyKCk7XG5cdFx0dGhpcy5faXNTYXNoUmVzaXplSGVpZ2h0ID0gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2RlY29yYXRpbmdFbGVtZW50c0hlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdGxldCByZXN1bHQgPSAwO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zaG93QXJyb3cpIHtcblx0XHRcdGNvbnN0IGFycm93SGVpZ2h0ID0gTWF0aC5yb3VuZChsaW5lSGVpZ2h0IC8gMyk7XG5cdFx0XHRyZXN1bHQgKz0gMiAqIGFycm93SGVpZ2h0O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuc2hvd0ZyYW1lKSB7XG5cdFx0XHRjb25zdCBmcmFtZVRoaWNrbmVzcyA9IHRoaXMub3B0aW9ucy5mcmFtZVdpZHRoID8/IE1hdGgucm91bmQobGluZUhlaWdodCAvIDkpO1xuXHRcdFx0cmVzdWx0ICs9IDIgKiBmcmFtZVRoaWNrbmVzcztcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqIEdldHMgdGhlIG1heGltdW0gd2lkZ2V0IGhlaWdodCBpbiBsaW5lcy4gKi9cblx0cHJvdGVjdGVkIF9nZXRNYXhpbXVtSGVpZ2h0SW5MaW5lcygpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBNYXRoLm1heCgxMiwgKHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHQgLyB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpKSAqIDAuOCk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93SW1wbCh3aGVyZTogUmFuZ2UsIGhlaWdodEluTGluZXM6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gd2hlcmUuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3Qgd2lkdGggPSB0aGlzLl9nZXRXaWR0aChsYXlvdXRJbmZvKTtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmxlZnQgPSB0aGlzLl9nZXRMZWZ0KGxheW91dEluZm8pICsgJ3B4JztcblxuXHRcdC8vIFJlbmRlciB0aGUgd2lkZ2V0IGFzIHpvbmUgKHJlbmRlcmluZykgYW5kIHdpZGdldCAobGlmZWN5Y2xlKVxuXHRcdGNvbnN0IHZpZXdab25lRG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHZpZXdab25lRG9tTm9kZS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXG5cdFx0Ly8gYWRqdXN0IGhlaWdodEluTGluZXMgdG8gdmlld3BvcnRcblx0XHRjb25zdCBtYXhIZWlnaHRJbkxpbmVzID0gdGhpcy5fZ2V0TWF4aW11bUhlaWdodEluTGluZXMoKTtcblx0XHRpZiAobWF4SGVpZ2h0SW5MaW5lcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRoZWlnaHRJbkxpbmVzID0gTWF0aC5taW4oaGVpZ2h0SW5MaW5lcywgbWF4SGVpZ2h0SW5MaW5lcyk7XG5cdFx0fVxuXG5cdFx0bGV0IGFycm93SGVpZ2h0ID0gMDtcblx0XHRsZXQgZnJhbWVUaGlja25lc3MgPSAwO1xuXG5cdFx0Ly8gUmVuZGVyIHRoZSBhcnJvdyBvbmUgMS8zIG9mIGFuIGVkaXRvciBsaW5lIGhlaWdodFxuXHRcdGlmICh0aGlzLl9hcnJvdyAmJiB0aGlzLm9wdGlvbnMuc2hvd0Fycm93KSB7XG5cdFx0XHRhcnJvd0hlaWdodCA9IE1hdGgucm91bmQobGluZUhlaWdodCAvIDMpO1xuXHRcdFx0dGhpcy5fYXJyb3cuaGVpZ2h0ID0gYXJyb3dIZWlnaHQ7XG5cdFx0XHR0aGlzLl9hcnJvdy5zaG93KHBvc2l0aW9uKTtcblx0XHR9XG5cblx0XHQvLyBSZW5kZXIgdGhlIGZyYW1lIGFzIDEvOSBvZiBhbiBlZGl0b3IgbGluZSBoZWlnaHRcblx0XHRpZiAodGhpcy5vcHRpb25zLnNob3dGcmFtZSkge1xuXHRcdFx0ZnJhbWVUaGlja25lc3MgPSBNYXRoLnJvdW5kKGxpbmVIZWlnaHQgLyA5KTtcblx0XHR9XG5cblx0XHQvLyBpbnNlcnQgem9uZSB3aWRnZXRcblx0XHR0aGlzLmVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoKGFjY2Vzc29yOiBJVmlld1pvbmVDaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3ZpZXdab25lKSB7XG5cdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUodGhpcy5fdmlld1pvbmUuaWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX292ZXJsYXlXaWRnZXQpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3IucmVtb3ZlT3ZlcmxheVdpZGdldCh0aGlzLl9vdmVybGF5V2lkZ2V0KTtcblx0XHRcdFx0dGhpcy5fb3ZlcmxheVdpZGdldCA9IG51bGw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUudG9wID0gJy0xMDAwcHgnO1xuXHRcdFx0dGhpcy5fdmlld1pvbmUgPSBuZXcgVmlld1pvbmVEZWxlZ2F0ZShcblx0XHRcdFx0dmlld1pvbmVEb21Ob2RlLFxuXHRcdFx0XHRwb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRwb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRcdGhlaWdodEluTGluZXMsXG5cdFx0XHRcdCh0b3A6IG51bWJlcikgPT4gdGhpcy5fb25WaWV3Wm9uZVRvcCh0b3ApLFxuXHRcdFx0XHQoaGVpZ2h0OiBudW1iZXIpID0+IHRoaXMuX29uVmlld1pvbmVIZWlnaHQoaGVpZ2h0KSxcblx0XHRcdFx0dGhpcy5vcHRpb25zLnNob3dJbkhpZGRlbkFyZWFzLFxuXHRcdFx0XHR0aGlzLm9wdGlvbnMub3JkaW5hbFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX3ZpZXdab25lLmlkID0gYWNjZXNzb3IuYWRkWm9uZSh0aGlzLl92aWV3Wm9uZSk7XG5cdFx0XHR0aGlzLl9vdmVybGF5V2lkZ2V0ID0gbmV3IE92ZXJsYXlXaWRnZXREZWxlZ2F0ZShXSURHRVRfSUQgKyB0aGlzLl92aWV3Wm9uZS5pZCwgdGhpcy5kb21Ob2RlKTtcblx0XHRcdHRoaXMuZWRpdG9yLmFkZE92ZXJsYXlXaWRnZXQodGhpcy5fb3ZlcmxheVdpZGdldCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fdXBkYXRlU2FzaEVuYWJsZW1lbnQoKTtcblxuXHRcdGlmICh0aGlzLmNvbnRhaW5lciAmJiB0aGlzLm9wdGlvbnMuc2hvd0ZyYW1lKSB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IHRoaXMub3B0aW9ucy5mcmFtZVdpZHRoID8gdGhpcy5vcHRpb25zLmZyYW1lV2lkdGggOiBmcmFtZVRoaWNrbmVzcztcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmJvcmRlclRvcFdpZHRoID0gd2lkdGggKyAncHgnO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuYm9yZGVyQm90dG9tV2lkdGggPSB3aWR0aCArICdweCc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGFpbmVySGVpZ2h0ID0gaGVpZ2h0SW5MaW5lcyAqIGxpbmVIZWlnaHQgLSB0aGlzLl9kZWNvcmF0aW5nRWxlbWVudHNIZWlnaHQoKTtcblxuXHRcdGlmICh0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUudG9wID0gYXJyb3dIZWlnaHQgKyAncHgnO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gY29udGFpbmVySGVpZ2h0ICsgJ3B4Jztcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZG9MYXlvdXQoY29udGFpbmVySGVpZ2h0LCB3aWR0aCk7XG5cblx0XHRpZiAoIXRoaXMub3B0aW9ucy5rZWVwRWRpdG9yU2VsZWN0aW9uKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5zZXRTZWxlY3Rpb24od2hlcmUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gbW9kZWwudmFsaWRhdGVSYW5nZShuZXcgUmFuZ2Uod2hlcmUuc3RhcnRMaW5lTnVtYmVyLCAxLCB3aGVyZS5lbmRMaW5lTnVtYmVyICsgMSwgMSkpO1xuXHRcdFx0dGhpcy5yZXZlYWxSYW5nZShyYW5nZSwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJldmVhbFJhbmdlKHJhbmdlOiBSYW5nZSwgaXNMYXN0TGluZTogYm9vbGVhbikge1xuXHRcdGlmIChpc0xhc3RMaW5lKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5yZXZlYWxMaW5lTmVhclRvcChyYW5nZS5lbmRMaW5lTnVtYmVyLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWRpdG9yLnJldmVhbFJhbmdlKHJhbmdlLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHNldENzc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBjbGFzc1RvUmVwbGFjZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoY2xhc3NUb1JlcGxhY2UpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoY2xhc3NUb1JlcGxhY2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcblxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9maWxsQ29udGFpbmVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkO1xuXG5cdHByb3RlY3RlZCBfb25XaWR0aCh3aWR0aEluUGl4ZWw6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIGltcGxlbWVudCBpbiBzdWJjbGFzc1xuXHR9XG5cblx0cHJvdGVjdGVkIF9kb0xheW91dChoZWlnaHRJblBpeGVsOiBudW1iZXIsIHdpZHRoSW5QaXhlbDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gaW1wbGVtZW50IGluIHN1YmNsYXNzXG5cdH1cblxuXHRwcm90ZWN0ZWQgX3JlbGF5b3V0KF9uZXdIZWlnaHRJbkxpbmVzOiBudW1iZXIsIHVzZU1heD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBtYXhIZWlnaHRJbkxpbmVzID0gdGhpcy5fZ2V0TWF4aW11bUhlaWdodEluTGluZXMoKTtcblx0XHRjb25zdCBuZXdIZWlnaHRJbkxpbmVzID0gKHVzZU1heCAmJiAobWF4SGVpZ2h0SW5MaW5lcyAhPT0gdW5kZWZpbmVkKSkgPyBNYXRoLm1pbihtYXhIZWlnaHRJbkxpbmVzLCBfbmV3SGVpZ2h0SW5MaW5lcykgOiBfbmV3SGVpZ2h0SW5MaW5lcztcblx0XHRpZiAodGhpcy5fdmlld1pvbmUgJiYgdGhpcy5fdmlld1pvbmUuaGVpZ2h0SW5MaW5lcyAhPT0gbmV3SGVpZ2h0SW5MaW5lcykge1xuXHRcdFx0dGhpcy5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3ZpZXdab25lKSB7XG5cdFx0XHRcdFx0dGhpcy5fdmlld1pvbmUuaGVpZ2h0SW5MaW5lcyA9IG5ld0hlaWdodEluTGluZXM7XG5cdFx0XHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZSh0aGlzLl92aWV3Wm9uZS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fdXBkYXRlU2FzaEVuYWJsZW1lbnQoKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gc2FzaFxuXG5cdHByaXZhdGUgX2luaXRTYXNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9yZXNpemVTYXNoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc2l6ZVNhc2ggPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IFNhc2godGhpcy5kb21Ob2RlLCB0aGlzLCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIH0pKTtcblxuXHRcdGlmICghdGhpcy5vcHRpb25zLmlzUmVzaXplYWJsZSkge1xuXHRcdFx0dGhpcy5fcmVzaXplU2FzaC5zdGF0ZSA9IFNhc2hTdGF0ZS5EaXNhYmxlZDtcblx0XHR9XG5cblx0XHRsZXQgZGF0YTogeyBzdGFydFk6IG51bWJlcjsgaGVpZ2h0SW5MaW5lczogbnVtYmVyOyBtaW5MaW5lczogbnVtYmVyOyBtYXhMaW5lczogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3Jlc2l6ZVNhc2gub25EaWRTdGFydCgoZTogSVNhc2hFdmVudCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3ZpZXdab25lKSB7XG5cdFx0XHRcdGRhdGEgPSB7XG5cdFx0XHRcdFx0c3RhcnRZOiBlLnN0YXJ0WSxcblx0XHRcdFx0XHRoZWlnaHRJbkxpbmVzOiB0aGlzLl92aWV3Wm9uZS5oZWlnaHRJbkxpbmVzLFxuXHRcdFx0XHRcdC4uLiB0aGlzLl9nZXRSZXNpemVCb3VuZHMoKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZXNpemVTYXNoLm9uRGlkRW5kKCgpID0+IHtcblx0XHRcdGRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3Jlc2l6ZVNhc2gub25EaWRDaGFuZ2UoKGV2dDogSVNhc2hFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0Y29uc3QgbGluZURlbHRhID0gKGV2dC5jdXJyZW50WSAtIGRhdGEuc3RhcnRZKSAvIHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0XHRcdGNvbnN0IHJvdW5kZWRMaW5lRGVsdGEgPSBsaW5lRGVsdGEgPCAwID8gTWF0aC5jZWlsKGxpbmVEZWx0YSkgOiBNYXRoLmZsb29yKGxpbmVEZWx0YSk7XG5cdFx0XHRcdGNvbnN0IG5ld0hlaWdodEluTGluZXMgPSBkYXRhLmhlaWdodEluTGluZXMgKyByb3VuZGVkTGluZURlbHRhO1xuXG5cdFx0XHRcdGlmIChuZXdIZWlnaHRJbkxpbmVzID4gZGF0YS5taW5MaW5lcyAmJiBuZXdIZWlnaHRJbkxpbmVzIDwgZGF0YS5tYXhMaW5lcykge1xuXHRcdFx0XHRcdHRoaXMuX2lzU2FzaFJlc2l6ZUhlaWdodCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fcmVsYXlvdXQobmV3SGVpZ2h0SW5MaW5lcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTYXNoRW5hYmxlbWVudCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVzaXplU2FzaCkge1xuXHRcdFx0Y29uc3QgeyBtaW5MaW5lcywgbWF4TGluZXMgfSA9IHRoaXMuX2dldFJlc2l6ZUJvdW5kcygpO1xuXHRcdFx0dGhpcy5fcmVzaXplU2FzaC5zdGF0ZSA9IG1pbkxpbmVzID09PSBtYXhMaW5lcyA/IFNhc2hTdGF0ZS5EaXNhYmxlZCA6IFNhc2hTdGF0ZS5FbmFibGVkO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgX3VzZXNSZXNpemVIZWlnaHQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzU2FzaFJlc2l6ZUhlaWdodDtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0UmVzaXplQm91bmRzKCk6IHsgcmVhZG9ubHkgbWluTGluZXM6IG51bWJlcjsgcmVhZG9ubHkgbWF4TGluZXM6IG51bWJlciB9IHtcblx0XHRyZXR1cm4geyBtaW5MaW5lczogNSwgbWF4TGluZXM6IDM1IH07XG5cdH1cblxuXHRnZXRIb3Jpem9udGFsU2FzaExlZnQoKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRnZXRIb3Jpem9udGFsU2FzaFRvcCgpIHtcblx0XHRyZXR1cm4gKHRoaXMuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPT09IG51bGwgPyAwIDogcGFyc2VJbnQodGhpcy5kb21Ob2RlLnN0eWxlLmhlaWdodCkpIC0gKHRoaXMuX2RlY29yYXRpbmdFbGVtZW50c0hlaWdodCgpIC8gMik7XG5cdH1cblxuXHRnZXRIb3Jpem9udGFsU2FzaFdpZHRoKCkge1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0cmV0dXJuIGxheW91dEluZm8ud2lkdGggLSBsYXlvdXRJbmZvLm1pbmltYXAubWluaW1hcFdpZHRoO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxzQkFBc0I7QUFDbEMsU0FBb0QsYUFBYSxNQUFNLGlCQUFpQjtBQUN4RixTQUFTLE9BQU8sWUFBWTtBQUM1QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxZQUFZLGFBQWE7QUFDekIsT0FBTztBQUVQLFNBQTJCLG9CQUFvQjtBQUUvQyxTQUFpQixhQUFhO0FBQzlCLFNBQXVDLGtCQUFrQjtBQUN6RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDhCQUE4QjtBQXFCdkMsTUFBTSxlQUFlLElBQUksTUFBTSxJQUFJLEtBQUssR0FBRyxLQUFLLEdBQUcsQ0FBQztBQUVwRCxNQUFNLGlCQUEyQjtBQUFBLEVBQ2hDLFdBQVc7QUFBQSxFQUNYLFdBQVc7QUFBQSxFQUNYLFdBQVc7QUFBQSxFQUNYLFlBQVk7QUFBQSxFQUNaLFlBQVk7QUFBQSxFQUNaLHFCQUFxQjtBQUN0QjtBQUVBLE1B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
