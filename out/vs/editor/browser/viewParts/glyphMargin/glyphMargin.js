import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import { ArrayQueue } from "../../../../base/common/arrays.js";
import "./glyphMargin.css";
import { DynamicViewOverlay } from "../../view/dynamicViewOverlay.js";
import { ViewPart } from "../../view/viewPart.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { GlyphMarginLane } from "../../../common/model.js";
class DecorationToRender {
  constructor(startLineNumber, endLineNumber, className, tooltip, zIndex) {
    this.startLineNumber = startLineNumber;
    this.endLineNumber = endLineNumber;
    this.className = className;
    this.tooltip = tooltip;
    this._decorationToRenderBrand = void 0;
    this.zIndex = zIndex ?? 0;
  }
}
class LineDecorationToRender {
  constructor(className, zIndex, tooltip) {
    this.className = className;
    this.zIndex = zIndex;
    this.tooltip = tooltip;
  }
}
class VisibleLineDecorationsToRender {
  constructor() {
    this.decorations = [];
  }
  add(decoration) {
    this.decorations.push(decoration);
  }
  getDecorations() {
    return this.decorations;
  }
}
class DedupOverlay extends DynamicViewOverlay {
  /**
   * Returns an array with an element for each visible line number.
   */
  _render(visibleStartLineNumber, visibleEndLineNumber, decorations) {
    const output = [];
    for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
      const lineIndex = lineNumber - visibleStartLineNumber;
      output[lineIndex] = new VisibleLineDecorationsToRender();
    }
    if (decorations.length === 0) {
      return output;
    }
    decorations.sort((a, b) => {
      if (a.className === b.className) {
        if (a.startLineNumber === b.startLineNumber) {
          return a.endLineNumber - b.endLineNumber;
        }
        return a.startLineNumber - b.startLineNumber;
      }
      return a.className < b.className ? -1 : 1;
    });
    let prevClassName = null;
    let prevEndLineIndex = 0;
    for (const d of decorations) {
      const className = d.className;
      const zIndex = d.zIndex;
      let startLineIndex = Math.max(d.startLineNumber, visibleStartLineNumber) - visibleStartLineNumber;
      const endLineIndex = Math.min(d.endLineNumber, visibleEndLineNumber) - visibleStartLineNumber;
      if (prevClassName === className) {
        startLineIndex = Math.max(prevEndLineIndex + 1, startLineIndex);
        prevEndLineIndex = Math.max(prevEndLineIndex, endLineIndex);
      } else {
        prevClassName = className;
        prevEndLineIndex = endLineIndex;
      }
      for (let lineIndex = startLineIndex; lineIndex <= prevEndLineIndex; lineIndex++) {
        output[lineIndex].add(new LineDecorationToRender(className, zIndex, d.tooltip));
      }
    }
    return output;
  }
}
class GlyphMarginWidgets extends ViewPart {
  constructor(context) {
    super(context);
    this._widgets = {};
    this._context = context;
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    this.domNode = createFastDomNode(document.createElement("div"));
    this.domNode.setClassName("glyph-margin-widgets");
    this.domNode.setPosition("absolute");
    this.domNode.setTop(0);
    this._lineHeight = options.get(EditorOption.lineHeight);
    this._glyphMargin = options.get(EditorOption.glyphMargin);
    this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
    this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
    this._glyphMarginDecorationLaneCount = layoutInfo.glyphMarginDecorationLaneCount;
    this._managedDomNodes = [];
    this._decorationGlyphsToRender = [];
  }
  dispose() {
    this._managedDomNodes = [];
    this._decorationGlyphsToRender = [];
    this._widgets = {};
    super.dispose();
  }
  getWidgets() {
    return Object.values(this._widgets);
  }
  // --- begin event handlers
  onConfigurationChanged(e) {
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    this._lineHeight = options.get(EditorOption.lineHeight);
    this._glyphMargin = options.get(EditorOption.glyphMargin);
    this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
    this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
    this._glyphMarginDecorationLaneCount = layoutInfo.glyphMarginDecorationLaneCount;
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
    return e.scrollTopChanged;
  }
  onZonesChanged(e) {
    return true;
  }
  // --- end event handlers
  // --- begin widget management
  addWidget(widget) {
    const domNode = createFastDomNode(widget.getDomNode());
    this._widgets[widget.getId()] = {
      widget,
      preference: widget.getPosition(),
      domNode,
      renderInfo: null
    };
    domNode.setPosition("absolute");
    domNode.setDisplay("none");
    domNode.setAttribute("widgetId", widget.getId());
    this.domNode.appendChild(domNode);
    this.setShouldRender();
  }
  setWidgetPosition(widget, preference) {
    const myWidget = this._widgets[widget.getId()];
    if (myWidget.preference.lane === preference.lane && myWidget.preference.zIndex === preference.zIndex && Range.equalsRange(myWidget.preference.range, preference.range)) {
      return false;
    }
    myWidget.preference = preference;
    this.setShouldRender();
    return true;
  }
  removeWidget(widget) {
    const widgetId = widget.getId();
    if (this._widgets[widgetId]) {
      const widgetData = this._widgets[widgetId];
      const domNode = widgetData.domNode.domNode;
      delete this._widgets[widgetId];
      domNode.remove();
      this.setShouldRender();
    }
  }
  // --- end widget management
  _collectDecorationBasedGlyphRenderRequest(ctx, requests) {
    const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
    const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
    const decorations = ctx.getDecorationsInViewport();
    for (const d of decorations) {
      const glyphMarginClassName = d.options.glyphMarginClassName;
      if (!glyphMarginClassName) {
        continue;
      }
      const startLineNumber = Math.max(d.range.startLineNumber, visibleStartLineNumber);
      const endLineNumber = Math.min(d.range.endLineNumber, visibleEndLineNumber);
      const lane = d.options.glyphMargin?.position ?? GlyphMarginLane.Center;
      const zIndex = d.options.zIndex ?? 0;
      for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
        const modelPosition = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber, 0));
        const laneIndex = this._context.viewModel.glyphLanes.getLanesAtLine(modelPosition.lineNumber).indexOf(lane);
        requests.push(new DecorationBasedGlyphRenderRequest(lineNumber, laneIndex, zIndex, glyphMarginClassName));
      }
    }
  }
  _collectWidgetBasedGlyphRenderRequest(ctx, requests) {
    const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
    const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
    for (const widget of Object.values(this._widgets)) {
      const range = widget.preference.range;
      const { startLineNumber, endLineNumber } = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(Range.lift(range));
      if (!startLineNumber || !endLineNumber || endLineNumber < visibleStartLineNumber || startLineNumber > visibleEndLineNumber) {
        continue;
      }
      const widgetLineNumber = Math.max(startLineNumber, visibleStartLineNumber);
      const modelPosition = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(widgetLineNumber, 0));
      const laneIndex = this._context.viewModel.glyphLanes.getLanesAtLine(modelPosition.lineNumber).indexOf(widget.preference.lane);
      requests.push(new WidgetBasedGlyphRenderRequest(widgetLineNumber, laneIndex, widget.preference.zIndex, widget));
    }
  }
  _collectSortedGlyphRenderRequests(ctx) {
    const requests = [];
    this._collectDecorationBasedGlyphRenderRequest(ctx, requests);
    this._collectWidgetBasedGlyphRenderRequest(ctx, requests);
    requests.sort((a, b) => {
      if (a.lineNumber === b.lineNumber) {
        if (a.laneIndex === b.laneIndex) {
          if (a.zIndex === b.zIndex) {
            if (b.type === a.type) {
              if (a.type === 0 /* Decoration */ && b.type === 0 /* Decoration */) {
                return a.className < b.className ? -1 : 1;
              }
              return 0;
            }
            return b.type - a.type;
          }
          return b.zIndex - a.zIndex;
        }
        return a.laneIndex - b.laneIndex;
      }
      return a.lineNumber - b.lineNumber;
    });
    return requests;
  }
  /**
   * Will store render information in each widget's renderInfo and in `_decorationGlyphsToRender`.
   */
  prepareRender(ctx) {
    if (!this._glyphMargin) {
      this._decorationGlyphsToRender = [];
      return;
    }
    for (const widget of Object.values(this._widgets)) {
      widget.renderInfo = null;
    }
    const requests = new ArrayQueue(this._collectSortedGlyphRenderRequests(ctx));
    const decorationGlyphsToRender = [];
    while (requests.length > 0) {
      const first = requests.peek();
      if (!first) {
        break;
      }
      const requestsAtLocation = requests.takeWhile((el) => el.lineNumber === first.lineNumber && el.laneIndex === first.laneIndex);
      if (!requestsAtLocation || requestsAtLocation.length === 0) {
        break;
      }
      const winner = requestsAtLocation[0];
      if (winner.type === 0 /* Decoration */) {
        const classNames = [];
        for (const request of requestsAtLocation) {
          if (request.zIndex !== winner.zIndex || request.type !== winner.type) {
            break;
          }
          if (classNames.length === 0 || classNames[classNames.length - 1] !== request.className) {
            classNames.push(request.className);
          }
        }
        decorationGlyphsToRender.push(winner.accept(classNames.join(" ")));
      } else {
        winner.widget.renderInfo = {
          lineNumber: winner.lineNumber,
          laneIndex: winner.laneIndex
        };
      }
    }
    this._decorationGlyphsToRender = decorationGlyphsToRender;
  }
  render(ctx) {
    if (!this._glyphMargin) {
      for (const widget of Object.values(this._widgets)) {
        widget.domNode.setDisplay("none");
      }
      while (this._managedDomNodes.length > 0) {
        const domNode = this._managedDomNodes.pop();
        domNode?.domNode.remove();
      }
      return;
    }
    const width = Math.round(this._glyphMarginWidth / this._glyphMarginDecorationLaneCount);
    for (const widget of Object.values(this._widgets)) {
      if (!widget.renderInfo) {
        widget.domNode.setDisplay("none");
      } else {
        const top = ctx.viewportData.relativeVerticalOffset[widget.renderInfo.lineNumber - ctx.viewportData.startLineNumber];
        const left = this._glyphMarginLeft + widget.renderInfo.laneIndex * this._lineHeight;
        widget.domNode.setDisplay("block");
        widget.domNode.setTop(top);
        widget.domNode.setLeft(left);
        widget.domNode.setWidth(width);
        widget.domNode.setHeight(this._lineHeight);
      }
    }
    for (let i = 0; i < this._decorationGlyphsToRender.length; i++) {
      const dec = this._decorationGlyphsToRender[i];
      const decLineNumber = dec.lineNumber;
      const top = ctx.viewportData.relativeVerticalOffset[decLineNumber - ctx.viewportData.startLineNumber];
      const left = this._glyphMarginLeft + dec.laneIndex * this._lineHeight;
      let domNode;
      if (i < this._managedDomNodes.length) {
        domNode = this._managedDomNodes[i];
      } else {
        domNode = createFastDomNode(document.createElement("div"));
        this._managedDomNodes.push(domNode);
        this.domNode.appendChild(domNode);
      }
      const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(decLineNumber);
      domNode.setClassName(`cgmr codicon ` + dec.combinedClassName);
      domNode.setPosition(`absolute`);
      domNode.setTop(top);
      domNode.setLeft(left);
      domNode.setWidth(width);
      domNode.setHeight(lineHeight);
    }
    while (this._managedDomNodes.length > this._decorationGlyphsToRender.length) {
      const domNode = this._managedDomNodes.pop();
      domNode?.domNode.remove();
    }
  }
}
var GlyphRenderRequestType = /* @__PURE__ */ ((GlyphRenderRequestType2) => {
  GlyphRenderRequestType2[GlyphRenderRequestType2["Decoration"] = 0] = "Decoration";
  GlyphRenderRequestType2[GlyphRenderRequestType2["Widget"] = 1] = "Widget";
  return GlyphRenderRequestType2;
})(GlyphRenderRequestType || {});
class DecorationBasedGlyphRenderRequest {
  constructor(lineNumber, laneIndex, zIndex, className) {
    this.lineNumber = lineNumber;
    this.laneIndex = laneIndex;
    this.zIndex = zIndex;
    this.className = className;
    this.type = 0 /* Decoration */;
  }
  accept(combinedClassName) {
    return new DecorationBasedGlyph(this.lineNumber, this.laneIndex, combinedClassName);
  }
}
class WidgetBasedGlyphRenderRequest {
  constructor(lineNumber, laneIndex, zIndex, widget) {
    this.lineNumber = lineNumber;
    this.laneIndex = laneIndex;
    this.zIndex = zIndex;
    this.widget = widget;
    this.type = 1 /* Widget */;
  }
}
class DecorationBasedGlyph {
  constructor(lineNumber, laneIndex, combinedClassName) {
    this.lineNumber = lineNumber;
    this.laneIndex = laneIndex;
    this.combinedClassName = combinedClassName;
  }
}
export {
  DecorationToRender,
  DedupOverlay,
  GlyphMarginWidgets,
  LineDecorationToRender,
  VisibleLineDecorationsToRender
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXdQYXJ0c1xcZ2x5cGhNYXJnaW5cXGdseXBoTWFyZ2luLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRmFzdERvbU5vZGUsIGNyZWF0ZUZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IEFycmF5UXVldWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0ICcuL2dseXBoTWFyZ2luLmNzcyc7XG5pbXBvcnQgeyBJR2x5cGhNYXJnaW5XaWRnZXQsIElHbHlwaE1hcmdpbldpZGdldFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBEeW5hbWljVmlld092ZXJsYXkgfSBmcm9tICcuLi8uLi92aWV3L2R5bmFtaWNWaWV3T3ZlcmxheS5qcyc7XG5pbXBvcnQgeyBSZW5kZXJpbmdDb250ZXh0LCBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCB9IGZyb20gJy4uLy4uL3ZpZXcvcmVuZGVyaW5nQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBWaWV3UGFydCB9IGZyb20gJy4uLy4uL3ZpZXcvdmlld1BhcnQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBHbHlwaE1hcmdpbkxhbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0ICogYXMgdmlld0V2ZW50cyBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBkZWNvcmF0aW9uIHRoYXQgc2hvdWxkIGJlIHNob3duIGFsb25nIHRoZSBsaW5lcyBmcm9tIGBzdGFydExpbmVOdW1iZXJgIHRvIGBlbmRMaW5lTnVtYmVyYC5cbiAqIFRoaXMgY2FuIGVuZCB1cCBwcm9kdWNpbmcgbXVsdGlwbGUgYExpbmVEZWNvcmF0aW9uVG9SZW5kZXJgLlxuICovXG5leHBvcnQgY2xhc3MgRGVjb3JhdGlvblRvUmVuZGVyIHtcblx0cHVibGljIHJlYWRvbmx5IF9kZWNvcmF0aW9uVG9SZW5kZXJCcmFuZDogdm9pZCA9IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgekluZGV4OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBlbmRMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNsYXNzTmFtZTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSB0b29sdGlwOiBzdHJpbmcgfCBudWxsLFxuXHRcdHpJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0XHR0aGlzLnpJbmRleCA9IHpJbmRleCA/PyAwO1xuXHR9XG59XG5cbi8qKlxuICogQSBkZWNvcmF0aW9uIHRoYXQgc2hvdWxkIGJlIHNob3duIGFsb25nIGEgbGluZS5cbiAqL1xuZXhwb3J0IGNsYXNzIExpbmVEZWNvcmF0aW9uVG9SZW5kZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgY2xhc3NOYW1lOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHpJbmRleDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSB0b29sdGlwOiBzdHJpbmcgfCBudWxsLFxuXHQpIHsgfVxufVxuXG4vKipcbiAqIERlY29yYXRpb25zIHRvIHJlbmRlciBvbiBhIHZpc2libGUgbGluZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFZpc2libGVMaW5lRGVjb3JhdGlvbnNUb1JlbmRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uczogTGluZURlY29yYXRpb25Ub1JlbmRlcltdID0gW107XG5cblx0cHVibGljIGFkZChkZWNvcmF0aW9uOiBMaW5lRGVjb3JhdGlvblRvUmVuZGVyKSB7XG5cdFx0dGhpcy5kZWNvcmF0aW9ucy5wdXNoKGRlY29yYXRpb24pO1xuXHR9XG5cblx0cHVibGljIGdldERlY29yYXRpb25zKCk6IExpbmVEZWNvcmF0aW9uVG9SZW5kZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZGVjb3JhdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIERlZHVwT3ZlcmxheSBleHRlbmRzIER5bmFtaWNWaWV3T3ZlcmxheSB7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYW4gYXJyYXkgd2l0aCBhbiBlbGVtZW50IGZvciBlYWNoIHZpc2libGUgbGluZSBudW1iZXIuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX3JlbmRlcih2aXNpYmxlU3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHZpc2libGVFbmRMaW5lTnVtYmVyOiBudW1iZXIsIGRlY29yYXRpb25zOiBEZWNvcmF0aW9uVG9SZW5kZXJbXSk6IFZpc2libGVMaW5lRGVjb3JhdGlvbnNUb1JlbmRlcltdIHtcblxuXHRcdGNvbnN0IG91dHB1dDogVmlzaWJsZUxpbmVEZWNvcmF0aW9uc1RvUmVuZGVyW10gPSBbXTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gdmlzaWJsZVN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSB2aXNpYmxlRW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gdmlzaWJsZVN0YXJ0TGluZU51bWJlcjtcblx0XHRcdG91dHB1dFtsaW5lSW5kZXhdID0gbmV3IFZpc2libGVMaW5lRGVjb3JhdGlvbnNUb1JlbmRlcigpO1xuXHRcdH1cblxuXHRcdGlmIChkZWNvcmF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fVxuXG5cdFx0Ly8gU29ydCBkZWNvcmF0aW9ucyBieSBjbGFzc05hbWUsIHRoZW4gYnkgc3RhcnRMaW5lTnVtYmVyIGFuZCB0aGVuIGJ5IGVuZExpbmVOdW1iZXJcblx0XHRkZWNvcmF0aW9ucy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5jbGFzc05hbWUgPT09IGIuY2xhc3NOYW1lKSB7XG5cdFx0XHRcdGlmIChhLnN0YXJ0TGluZU51bWJlciA9PT0gYi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gYS5lbmRMaW5lTnVtYmVyIC0gYi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhLnN0YXJ0TGluZU51bWJlciAtIGIuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIChhLmNsYXNzTmFtZSA8IGIuY2xhc3NOYW1lID8gLTEgOiAxKTtcblx0XHR9KTtcblxuXHRcdGxldCBwcmV2Q2xhc3NOYW1lOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgcHJldkVuZExpbmVJbmRleCA9IDA7XG5cdFx0Zm9yIChjb25zdCBkIG9mIGRlY29yYXRpb25zKSB7XG5cdFx0XHRjb25zdCBjbGFzc05hbWUgPSBkLmNsYXNzTmFtZTtcblx0XHRcdGNvbnN0IHpJbmRleCA9IGQuekluZGV4O1xuXHRcdFx0bGV0IHN0YXJ0TGluZUluZGV4ID0gTWF0aC5tYXgoZC5zdGFydExpbmVOdW1iZXIsIHZpc2libGVTdGFydExpbmVOdW1iZXIpIC0gdmlzaWJsZVN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGVuZExpbmVJbmRleCA9IE1hdGgubWluKGQuZW5kTGluZU51bWJlciwgdmlzaWJsZUVuZExpbmVOdW1iZXIpIC0gdmlzaWJsZVN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0aWYgKHByZXZDbGFzc05hbWUgPT09IGNsYXNzTmFtZSkge1xuXHRcdFx0XHQvLyBIZXJlIHdlIGF2b2lkIHJlbmRlcmluZyB0aGUgc2FtZSBjbGFzc05hbWUgbXVsdGlwbGUgdGltZXMgb24gdGhlIHNhbWUgbGluZVxuXHRcdFx0XHRzdGFydExpbmVJbmRleCA9IE1hdGgubWF4KHByZXZFbmRMaW5lSW5kZXggKyAxLCBzdGFydExpbmVJbmRleCk7XG5cdFx0XHRcdHByZXZFbmRMaW5lSW5kZXggPSBNYXRoLm1heChwcmV2RW5kTGluZUluZGV4LCBlbmRMaW5lSW5kZXgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cHJldkNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcblx0XHRcdFx0cHJldkVuZExpbmVJbmRleCA9IGVuZExpbmVJbmRleDtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgbGluZUluZGV4ID0gc3RhcnRMaW5lSW5kZXg7IGxpbmVJbmRleCA8PSBwcmV2RW5kTGluZUluZGV4OyBsaW5lSW5kZXgrKykge1xuXHRcdFx0XHRvdXRwdXRbbGluZUluZGV4XS5hZGQobmV3IExpbmVEZWNvcmF0aW9uVG9SZW5kZXIoY2xhc3NOYW1lLCB6SW5kZXgsIGQudG9vbHRpcCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEdseXBoTWFyZ2luV2lkZ2V0cyBleHRlbmRzIFZpZXdQYXJ0IHtcblxuXHRwdWJsaWMgZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+O1xuXG5cdHByaXZhdGUgX2xpbmVIZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfZ2x5cGhNYXJnaW46IGJvb2xlYW47XG5cdHByaXZhdGUgX2dseXBoTWFyZ2luTGVmdDogbnVtYmVyO1xuXHRwcml2YXRlIF9nbHlwaE1hcmdpbldpZHRoOiBudW1iZXI7XG5cdHByaXZhdGUgX2dseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogbnVtYmVyO1xuXG5cdHByaXZhdGUgX21hbmFnZWREb21Ob2RlczogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+W107XG5cdHByaXZhdGUgX2RlY29yYXRpb25HbHlwaHNUb1JlbmRlcjogRGVjb3JhdGlvbkJhc2VkR2x5cGhbXTtcblxuXHRwcml2YXRlIF93aWRnZXRzOiB7IFtrZXk6IHN0cmluZ106IElXaWRnZXREYXRhIH0gPSB7fTtcblxuXHRjb25zdHJ1Y3Rvcihjb250ZXh0OiBWaWV3Q29udGV4dCkge1xuXHRcdHN1cGVyKGNvbnRleHQpO1xuXHRcdHRoaXMuX2NvbnRleHQgPSBjb250ZXh0O1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbyk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldENsYXNzTmFtZSgnZ2x5cGgtbWFyZ2luLXdpZGdldHMnKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0UG9zaXRpb24oJ2Fic29sdXRlJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldFRvcCgwKTtcblxuXHRcdHRoaXMuX2xpbmVIZWlnaHQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0dGhpcy5fZ2x5cGhNYXJnaW4gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZ2x5cGhNYXJnaW4pO1xuXHRcdHRoaXMuX2dseXBoTWFyZ2luTGVmdCA9IGxheW91dEluZm8uZ2x5cGhNYXJnaW5MZWZ0O1xuXHRcdHRoaXMuX2dseXBoTWFyZ2luV2lkdGggPSBsYXlvdXRJbmZvLmdseXBoTWFyZ2luV2lkdGg7XG5cdFx0dGhpcy5fZ2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50ID0gbGF5b3V0SW5mby5nbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ7XG5cdFx0dGhpcy5fbWFuYWdlZERvbU5vZGVzID0gW107XG5cdFx0dGhpcy5fZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyID0gW107XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9tYW5hZ2VkRG9tTm9kZXMgPSBbXTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uR2x5cGhzVG9SZW5kZXIgPSBbXTtcblx0XHR0aGlzLl93aWRnZXRzID0ge307XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIGdldFdpZGdldHMoKTogSVdpZGdldERhdGFbXSB7XG5cdFx0cmV0dXJuIE9iamVjdC52YWx1ZXModGhpcy5fd2lkZ2V0cyk7XG5cdH1cblxuXHQvLyAtLS0gYmVnaW4gZXZlbnQgaGFuZGxlcnNcblx0cHVibGljIG92ZXJyaWRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXG5cdFx0dGhpcy5fbGluZUhlaWdodCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHR0aGlzLl9nbHlwaE1hcmdpbiA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5nbHlwaE1hcmdpbik7XG5cdFx0dGhpcy5fZ2x5cGhNYXJnaW5MZWZ0ID0gbGF5b3V0SW5mby5nbHlwaE1hcmdpbkxlZnQ7XG5cdFx0dGhpcy5fZ2x5cGhNYXJnaW5XaWR0aCA9IGxheW91dEluZm8uZ2x5cGhNYXJnaW5XaWR0aDtcblx0XHR0aGlzLl9nbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQgPSBsYXlvdXRJbmZvLmdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25EZWNvcmF0aW9uc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25GbHVzaGVkKGU6IHZpZXdFdmVudHMuVmlld0ZsdXNoZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzRGVsZXRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzSW5zZXJ0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uU2Nyb2xsQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZS5zY3JvbGxUb3BDaGFuZ2VkO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblpvbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdab25lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gLS0tIGVuZCBldmVudCBoYW5kbGVyc1xuXG5cdC8vIC0tLSBiZWdpbiB3aWRnZXQgbWFuYWdlbWVudFxuXG5cdHB1YmxpYyBhZGRXaWRnZXQod2lkZ2V0OiBJR2x5cGhNYXJnaW5XaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCBkb21Ob2RlID0gY3JlYXRlRmFzdERvbU5vZGUod2lkZ2V0LmdldERvbU5vZGUoKSk7XG5cblx0XHR0aGlzLl93aWRnZXRzW3dpZGdldC5nZXRJZCgpXSA9IHtcblx0XHRcdHdpZGdldDogd2lkZ2V0LFxuXHRcdFx0cHJlZmVyZW5jZTogd2lkZ2V0LmdldFBvc2l0aW9uKCksXG5cdFx0XHRkb21Ob2RlOiBkb21Ob2RlLFxuXHRcdFx0cmVuZGVySW5mbzogbnVsbFxuXHRcdH07XG5cblx0XHRkb21Ob2RlLnNldFBvc2l0aW9uKCdhYnNvbHV0ZScpO1xuXHRcdGRvbU5vZGUuc2V0RGlzcGxheSgnbm9uZScpO1xuXHRcdGRvbU5vZGUuc2V0QXR0cmlidXRlKCd3aWRnZXRJZCcsIHdpZGdldC5nZXRJZCgpKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoZG9tTm9kZSk7XG5cblx0XHR0aGlzLnNldFNob3VsZFJlbmRlcigpO1xuXHR9XG5cblx0cHVibGljIHNldFdpZGdldFBvc2l0aW9uKHdpZGdldDogSUdseXBoTWFyZ2luV2lkZ2V0LCBwcmVmZXJlbmNlOiBJR2x5cGhNYXJnaW5XaWRnZXRQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG15V2lkZ2V0ID0gdGhpcy5fd2lkZ2V0c1t3aWRnZXQuZ2V0SWQoKV07XG5cdFx0aWYgKG15V2lkZ2V0LnByZWZlcmVuY2UubGFuZSA9PT0gcHJlZmVyZW5jZS5sYW5lXG5cdFx0XHQmJiBteVdpZGdldC5wcmVmZXJlbmNlLnpJbmRleCA9PT0gcHJlZmVyZW5jZS56SW5kZXhcblx0XHRcdCYmIFJhbmdlLmVxdWFsc1JhbmdlKG15V2lkZ2V0LnByZWZlcmVuY2UucmFuZ2UsIHByZWZlcmVuY2UucmFuZ2UpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bXlXaWRnZXQucHJlZmVyZW5jZSA9IHByZWZlcmVuY2U7XG5cdFx0dGhpcy5zZXRTaG91bGRSZW5kZXIoKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZVdpZGdldCh3aWRnZXQ6IElHbHlwaE1hcmdpbldpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldElkID0gd2lkZ2V0LmdldElkKCk7XG5cdFx0aWYgKHRoaXMuX3dpZGdldHNbd2lkZ2V0SWRdKSB7XG5cdFx0XHRjb25zdCB3aWRnZXREYXRhID0gdGhpcy5fd2lkZ2V0c1t3aWRnZXRJZF07XG5cdFx0XHRjb25zdCBkb21Ob2RlID0gd2lkZ2V0RGF0YS5kb21Ob2RlLmRvbU5vZGU7XG5cdFx0XHRkZWxldGUgdGhpcy5fd2lkZ2V0c1t3aWRnZXRJZF07XG5cblx0XHRcdGRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnNldFNob3VsZFJlbmRlcigpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBlbmQgd2lkZ2V0IG1hbmFnZW1lbnRcblxuXHRwcml2YXRlIF9jb2xsZWN0RGVjb3JhdGlvbkJhc2VkR2x5cGhSZW5kZXJSZXF1ZXN0KGN0eDogUmVuZGVyaW5nQ29udGV4dCwgcmVxdWVzdHM6IEdseXBoUmVuZGVyUmVxdWVzdFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgdmlzaWJsZVN0YXJ0TGluZU51bWJlciA9IGN0eC52aXNpYmxlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHZpc2libGVFbmRMaW5lTnVtYmVyID0gY3R4LnZpc2libGVSYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gY3R4LmdldERlY29yYXRpb25zSW5WaWV3cG9ydCgpO1xuXG5cdFx0Zm9yIChjb25zdCBkIG9mIGRlY29yYXRpb25zKSB7XG5cdFx0XHRjb25zdCBnbHlwaE1hcmdpbkNsYXNzTmFtZSA9IGQub3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZTtcblx0XHRcdGlmICghZ2x5cGhNYXJnaW5DbGFzc05hbWUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IE1hdGgubWF4KGQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB2aXNpYmxlU3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBNYXRoLm1pbihkLnJhbmdlLmVuZExpbmVOdW1iZXIsIHZpc2libGVFbmRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxhbmUgPSBkLm9wdGlvbnMuZ2x5cGhNYXJnaW4/LnBvc2l0aW9uID8/IEdseXBoTWFyZ2luTGFuZS5DZW50ZXI7XG5cdFx0XHRjb25zdCB6SW5kZXggPSBkLm9wdGlvbnMuekluZGV4ID8/IDA7XG5cblx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsUG9zaXRpb24gPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCAwKSk7XG5cdFx0XHRcdGNvbnN0IGxhbmVJbmRleCA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdseXBoTGFuZXMuZ2V0TGFuZXNBdExpbmUobW9kZWxQb3NpdGlvbi5saW5lTnVtYmVyKS5pbmRleE9mKGxhbmUpO1xuXHRcdFx0XHRyZXF1ZXN0cy5wdXNoKG5ldyBEZWNvcmF0aW9uQmFzZWRHbHlwaFJlbmRlclJlcXVlc3QobGluZU51bWJlciwgbGFuZUluZGV4LCB6SW5kZXgsIGdseXBoTWFyZ2luQ2xhc3NOYW1lKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGVjdFdpZGdldEJhc2VkR2x5cGhSZW5kZXJSZXF1ZXN0KGN0eDogUmVuZGVyaW5nQ29udGV4dCwgcmVxdWVzdHM6IEdseXBoUmVuZGVyUmVxdWVzdFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgdmlzaWJsZVN0YXJ0TGluZU51bWJlciA9IGN0eC52aXNpYmxlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHZpc2libGVFbmRMaW5lTnVtYmVyID0gY3R4LnZpc2libGVSYW5nZS5lbmRMaW5lTnVtYmVyO1xuXG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgT2JqZWN0LnZhbHVlcyh0aGlzLl93aWRnZXRzKSkge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSB3aWRnZXQucHJlZmVyZW5jZS5yYW5nZTtcblx0XHRcdGNvbnN0IHsgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyIH0gPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxSYW5nZVRvVmlld1JhbmdlKFJhbmdlLmxpZnQocmFuZ2UpKTtcblx0XHRcdGlmICghc3RhcnRMaW5lTnVtYmVyIHx8ICFlbmRMaW5lTnVtYmVyIHx8IGVuZExpbmVOdW1iZXIgPCB2aXNpYmxlU3RhcnRMaW5lTnVtYmVyIHx8IHN0YXJ0TGluZU51bWJlciA+IHZpc2libGVFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIFRoZSB3aWRnZXQgaXMgbm90IGluIHRoZSB2aWV3cG9ydFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhlIHdpZGdldCBpcyBpbiB0aGUgdmlld3BvcnQsIGZpbmQgYSBnb29kIGxpbmUgZm9yIGl0XG5cdFx0XHRjb25zdCB3aWRnZXRMaW5lTnVtYmVyID0gTWF0aC5tYXgoc3RhcnRMaW5lTnVtYmVyLCB2aXNpYmxlU3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IG1vZGVsUG9zaXRpb24gPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKG5ldyBQb3NpdGlvbih3aWRnZXRMaW5lTnVtYmVyLCAwKSk7XG5cdFx0XHRjb25zdCBsYW5lSW5kZXggPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nbHlwaExhbmVzLmdldExhbmVzQXRMaW5lKG1vZGVsUG9zaXRpb24ubGluZU51bWJlcikuaW5kZXhPZih3aWRnZXQucHJlZmVyZW5jZS5sYW5lKTtcblx0XHRcdHJlcXVlc3RzLnB1c2gobmV3IFdpZGdldEJhc2VkR2x5cGhSZW5kZXJSZXF1ZXN0KHdpZGdldExpbmVOdW1iZXIsIGxhbmVJbmRleCwgd2lkZ2V0LnByZWZlcmVuY2UuekluZGV4LCB3aWRnZXQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb2xsZWN0U29ydGVkR2x5cGhSZW5kZXJSZXF1ZXN0cyhjdHg6IFJlbmRlcmluZ0NvbnRleHQpOiBHbHlwaFJlbmRlclJlcXVlc3RbXSB7XG5cblx0XHRjb25zdCByZXF1ZXN0czogR2x5cGhSZW5kZXJSZXF1ZXN0W10gPSBbXTtcblxuXHRcdHRoaXMuX2NvbGxlY3REZWNvcmF0aW9uQmFzZWRHbHlwaFJlbmRlclJlcXVlc3QoY3R4LCByZXF1ZXN0cyk7XG5cdFx0dGhpcy5fY29sbGVjdFdpZGdldEJhc2VkR2x5cGhSZW5kZXJSZXF1ZXN0KGN0eCwgcmVxdWVzdHMpO1xuXG5cdFx0Ly8gc29ydCByZXF1ZXN0cyBieSBsaW5lTnVtYmVyIEFTQywgbGFuZSAgQVNDLCB6SW5kZXggREVTQywgdHlwZSBERVNDICh3aWRnZXRzIGZpcnN0KSwgY2xhc3NOYW1lIEFTQ1xuXHRcdC8vIGRvbid0IGNoYW5nZSB0aGlzIHNvcnQgdW5sZXNzIHlvdSB1bmRlcnN0YW5kIGBwcmVwYXJlUmVuZGVyYCBiZWxvdy5cblx0XHRyZXF1ZXN0cy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5saW5lTnVtYmVyID09PSBiLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0aWYgKGEubGFuZUluZGV4ID09PSBiLmxhbmVJbmRleCkge1xuXHRcdFx0XHRcdGlmIChhLnpJbmRleCA9PT0gYi56SW5kZXgpIHtcblx0XHRcdFx0XHRcdGlmIChiLnR5cGUgPT09IGEudHlwZSkge1xuXHRcdFx0XHRcdFx0XHRpZiAoYS50eXBlID09PSBHbHlwaFJlbmRlclJlcXVlc3RUeXBlLkRlY29yYXRpb24gJiYgYi50eXBlID09PSBHbHlwaFJlbmRlclJlcXVlc3RUeXBlLkRlY29yYXRpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gKGEuY2xhc3NOYW1lIDwgYi5jbGFzc05hbWUgPyAtMSA6IDEpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGIudHlwZSAtIGEudHlwZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGIuekluZGV4IC0gYS56SW5kZXg7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGEubGFuZUluZGV4IC0gYi5sYW5lSW5kZXg7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYS5saW5lTnVtYmVyIC0gYi5saW5lTnVtYmVyO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJlcXVlc3RzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdpbGwgc3RvcmUgcmVuZGVyIGluZm9ybWF0aW9uIGluIGVhY2ggd2lkZ2V0J3MgcmVuZGVySW5mbyBhbmQgaW4gYF9kZWNvcmF0aW9uR2x5cGhzVG9SZW5kZXJgLlxuXHQgKi9cblx0cHVibGljIHByZXBhcmVSZW5kZXIoY3R4OiBSZW5kZXJpbmdDb250ZXh0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9nbHlwaE1hcmdpbikge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyID0gW107XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgT2JqZWN0LnZhbHVlcyh0aGlzLl93aWRnZXRzKSkge1xuXHRcdFx0d2lkZ2V0LnJlbmRlckluZm8gPSBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3RzID0gbmV3IEFycmF5UXVldWU8R2x5cGhSZW5kZXJSZXF1ZXN0Pih0aGlzLl9jb2xsZWN0U29ydGVkR2x5cGhSZW5kZXJSZXF1ZXN0cyhjdHgpKTtcblx0XHRjb25zdCBkZWNvcmF0aW9uR2x5cGhzVG9SZW5kZXI6IERlY29yYXRpb25CYXNlZEdseXBoW10gPSBbXTtcblx0XHR3aGlsZSAocmVxdWVzdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZmlyc3QgPSByZXF1ZXN0cy5wZWVrKCk7XG5cdFx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHRcdC8vIG5vdCBwb3NzaWJsZVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVxdWVzdHMgYXJlIHNvcnRlZCBieSBsaW5lTnVtYmVyIGFuZCBsYW5lLCBzbyB3ZSByZWFkIGFsbCByZXF1ZXN0cyBmb3IgdGhpcyBwYXJ0aWN1bGFyIGxvY2F0aW9uXG5cdFx0XHRjb25zdCByZXF1ZXN0c0F0TG9jYXRpb24gPSByZXF1ZXN0cy50YWtlV2hpbGUoKGVsKSA9PiBlbC5saW5lTnVtYmVyID09PSBmaXJzdC5saW5lTnVtYmVyICYmIGVsLmxhbmVJbmRleCA9PT0gZmlyc3QubGFuZUluZGV4KTtcblx0XHRcdGlmICghcmVxdWVzdHNBdExvY2F0aW9uIHx8IHJlcXVlc3RzQXRMb2NhdGlvbi5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Ly8gbm90IHBvc3NpYmxlXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3aW5uZXIgPSByZXF1ZXN0c0F0TG9jYXRpb25bMF07XG5cdFx0XHRpZiAod2lubmVyLnR5cGUgPT09IEdseXBoUmVuZGVyUmVxdWVzdFR5cGUuRGVjb3JhdGlvbikge1xuXHRcdFx0XHQvLyBjb21iaW5lIGFsbCBkZWNvcmF0aW9ucyB3aXRoIHRoZSBzYW1lIHotaW5kZXhcblxuXHRcdFx0XHRjb25zdCBjbGFzc05hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHQvLyByZXF1ZXN0cyBhcmUgc29ydGVkIGJ5IHpJbmRleCwgdHlwZSwgYW5kIGNsYXNzTmFtZSBzbyB3ZSBjYW4gZGVkdXAgY2xhc3NOYW1lIGJ5IGxvb2tpbmcgYXQgdGhlIHByZXZpb3VzIG9uZVxuXHRcdFx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgcmVxdWVzdHNBdExvY2F0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKHJlcXVlc3QuekluZGV4ICE9PSB3aW5uZXIuekluZGV4IHx8IHJlcXVlc3QudHlwZSAhPT0gd2lubmVyLnR5cGUpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY2xhc3NOYW1lcy5sZW5ndGggPT09IDAgfHwgY2xhc3NOYW1lc1tjbGFzc05hbWVzLmxlbmd0aCAtIDFdICE9PSByZXF1ZXN0LmNsYXNzTmFtZSkge1xuXHRcdFx0XHRcdFx0Y2xhc3NOYW1lcy5wdXNoKHJlcXVlc3QuY2xhc3NOYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkZWNvcmF0aW9uR2x5cGhzVG9SZW5kZXIucHVzaCh3aW5uZXIuYWNjZXB0KGNsYXNzTmFtZXMuam9pbignICcpKSk7IC8vIFRPRE9Aam95Y2VlcmhsIEltcGxlbWVudCBvdmVyZmxvdyBmb3IgcmVtYWluaW5nIGRlY29yYXRpb25zXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB3aWRnZXRzIGNhbm5vdCBiZSBjb21iaW5lZFxuXHRcdFx0XHR3aW5uZXIud2lkZ2V0LnJlbmRlckluZm8gPSB7XG5cdFx0XHRcdFx0bGluZU51bWJlcjogd2lubmVyLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0bGFuZUluZGV4OiB3aW5uZXIubGFuZUluZGV4LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9kZWNvcmF0aW9uR2x5cGhzVG9SZW5kZXIgPSBkZWNvcmF0aW9uR2x5cGhzVG9SZW5kZXI7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKGN0eDogUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2dseXBoTWFyZ2luKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiBPYmplY3QudmFsdWVzKHRoaXMuX3dpZGdldHMpKSB7XG5cdFx0XHRcdHdpZGdldC5kb21Ob2RlLnNldERpc3BsYXkoJ25vbmUnKTtcblx0XHRcdH1cblx0XHRcdHdoaWxlICh0aGlzLl9tYW5hZ2VkRG9tTm9kZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBkb21Ob2RlID0gdGhpcy5fbWFuYWdlZERvbU5vZGVzLnBvcCgpO1xuXHRcdFx0XHRkb21Ob2RlPy5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZHRoID0gKE1hdGgucm91bmQodGhpcy5fZ2x5cGhNYXJnaW5XaWR0aCAvIHRoaXMuX2dseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudCkpO1xuXG5cdFx0Ly8gUmVuZGVyIHdpZGdldHNcblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiBPYmplY3QudmFsdWVzKHRoaXMuX3dpZGdldHMpKSB7XG5cdFx0XHRpZiAoIXdpZGdldC5yZW5kZXJJbmZvKSB7XG5cdFx0XHRcdC8vIHRoaXMgd2lkZ2V0IGlzIG5vdCB2aXNpYmxlXG5cdFx0XHRcdHdpZGdldC5kb21Ob2RlLnNldERpc3BsYXkoJ25vbmUnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHRvcCA9IGN0eC52aWV3cG9ydERhdGEucmVsYXRpdmVWZXJ0aWNhbE9mZnNldFt3aWRnZXQucmVuZGVySW5mby5saW5lTnVtYmVyIC0gY3R4LnZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXJdO1xuXHRcdFx0XHRjb25zdCBsZWZ0ID0gdGhpcy5fZ2x5cGhNYXJnaW5MZWZ0ICsgd2lkZ2V0LnJlbmRlckluZm8ubGFuZUluZGV4ICogdGhpcy5fbGluZUhlaWdodDtcblxuXHRcdFx0XHR3aWRnZXQuZG9tTm9kZS5zZXREaXNwbGF5KCdibG9jaycpO1xuXHRcdFx0XHR3aWRnZXQuZG9tTm9kZS5zZXRUb3AodG9wKTtcblx0XHRcdFx0d2lkZ2V0LmRvbU5vZGUuc2V0TGVmdChsZWZ0KTtcblx0XHRcdFx0d2lkZ2V0LmRvbU5vZGUuc2V0V2lkdGgod2lkdGgpO1xuXHRcdFx0XHR3aWRnZXQuZG9tTm9kZS5zZXRIZWlnaHQodGhpcy5fbGluZUhlaWdodCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIGRlY29yYXRpb25zLCByZXVzaW5nIHByZXZpb3VzIGRvbSBub2RlcyBhcyBwb3NzaWJsZVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkZWMgPSB0aGlzLl9kZWNvcmF0aW9uR2x5cGhzVG9SZW5kZXJbaV07XG5cdFx0XHRjb25zdCBkZWNMaW5lTnVtYmVyID0gZGVjLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCB0b3AgPSBjdHgudmlld3BvcnREYXRhLnJlbGF0aXZlVmVydGljYWxPZmZzZXRbZGVjTGluZU51bWJlciAtIGN0eC52aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyXTtcblx0XHRcdGNvbnN0IGxlZnQgPSB0aGlzLl9nbHlwaE1hcmdpbkxlZnQgKyBkZWMubGFuZUluZGV4ICogdGhpcy5fbGluZUhlaWdodDtcblxuXHRcdFx0bGV0IGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pjtcblx0XHRcdGlmIChpIDwgdGhpcy5fbWFuYWdlZERvbU5vZGVzLmxlbmd0aCkge1xuXHRcdFx0XHRkb21Ob2RlID0gdGhpcy5fbWFuYWdlZERvbU5vZGVzW2ldO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRcdFx0dGhpcy5fbWFuYWdlZERvbU5vZGVzLnB1c2goZG9tTm9kZSk7XG5cdFx0XHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZChkb21Ob2RlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0TGluZUhlaWdodEZvckxpbmVOdW1iZXIoZGVjTGluZU51bWJlcik7XG5cblx0XHRcdGRvbU5vZGUuc2V0Q2xhc3NOYW1lKGBjZ21yIGNvZGljb24gYCArIGRlYy5jb21iaW5lZENsYXNzTmFtZSk7XG5cdFx0XHRkb21Ob2RlLnNldFBvc2l0aW9uKGBhYnNvbHV0ZWApO1xuXHRcdFx0ZG9tTm9kZS5zZXRUb3AodG9wKTtcblx0XHRcdGRvbU5vZGUuc2V0TGVmdChsZWZ0KTtcblx0XHRcdGRvbU5vZGUuc2V0V2lkdGgod2lkdGgpO1xuXHRcdFx0ZG9tTm9kZS5zZXRIZWlnaHQobGluZUhlaWdodCk7XG5cdFx0fVxuXG5cdFx0Ly8gcmVtb3ZlIGV4dHJhIGRvbSBub2Rlc1xuXHRcdHdoaWxlICh0aGlzLl9tYW5hZ2VkRG9tTm9kZXMubGVuZ3RoID4gdGhpcy5fZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZG9tTm9kZSA9IHRoaXMuX21hbmFnZWREb21Ob2Rlcy5wb3AoKTtcblx0XHRcdGRvbU5vZGU/LmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdpZGdldERhdGEge1xuXHR3aWRnZXQ6IElHbHlwaE1hcmdpbldpZGdldDtcblx0cHJlZmVyZW5jZTogSUdseXBoTWFyZ2luV2lkZ2V0UG9zaXRpb247XG5cdGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pjtcblx0LyoqXG5cdCAqIGl0IHdpbGwgY29udGFpbiB0aGUgbG9jYXRpb24gd2hlcmUgdG8gcmVuZGVyIHRoZSB3aWRnZXRcblx0ICogb3IgbnVsbCBpZiB0aGUgd2lkZ2V0IGlzIG5vdCB2aXNpYmxlXG5cdCAqL1xuXHRyZW5kZXJJbmZvOiBJUmVuZGVySW5mbyB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbmRlckluZm8ge1xuXHRsaW5lTnVtYmVyOiBudW1iZXI7XG5cdGxhbmVJbmRleDogbnVtYmVyO1xufVxuXG5jb25zdCBlbnVtIEdseXBoUmVuZGVyUmVxdWVzdFR5cGUge1xuXHREZWNvcmF0aW9uID0gMCxcblx0V2lkZ2V0ID0gMVxufVxuXG4vKipcbiAqIEEgcmVxdWVzdCB0byByZW5kZXIgYSBkZWNvcmF0aW9uIGluIHRoZSBnbHlwaCBtYXJnaW4gYXQgYSBjZXJ0YWluIGxvY2F0aW9uLlxuICovXG5jbGFzcyBEZWNvcmF0aW9uQmFzZWRHbHlwaFJlbmRlclJlcXVlc3Qge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IEdseXBoUmVuZGVyUmVxdWVzdFR5cGUuRGVjb3JhdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBsYW5lSW5kZXg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgekluZGV4OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNsYXNzTmFtZTogc3RyaW5nLFxuXHQpIHsgfVxuXG5cdGFjY2VwdChjb21iaW5lZENsYXNzTmFtZTogc3RyaW5nKTogRGVjb3JhdGlvbkJhc2VkR2x5cGgge1xuXHRcdHJldHVybiBuZXcgRGVjb3JhdGlvbkJhc2VkR2x5cGgodGhpcy5saW5lTnVtYmVyLCB0aGlzLmxhbmVJbmRleCwgY29tYmluZWRDbGFzc05hbWUpO1xuXHR9XG59XG5cbi8qKlxuICogQSByZXF1ZXN0IHRvIHJlbmRlciBhIHdpZGdldCBpbiB0aGUgZ2x5cGggbWFyZ2luIGF0IGEgY2VydGFpbiBsb2NhdGlvbi5cbiAqL1xuY2xhc3MgV2lkZ2V0QmFzZWRHbHlwaFJlbmRlclJlcXVlc3Qge1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwZSA9IEdseXBoUmVuZGVyUmVxdWVzdFR5cGUuV2lkZ2V0O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBsaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxhbmVJbmRleDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSB6SW5kZXg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgd2lkZ2V0OiBJV2lkZ2V0RGF0YSxcblx0KSB7IH1cbn1cblxudHlwZSBHbHlwaFJlbmRlclJlcXVlc3QgPSBEZWNvcmF0aW9uQmFzZWRHbHlwaFJlbmRlclJlcXVlc3QgfCBXaWRnZXRCYXNlZEdseXBoUmVuZGVyUmVxdWVzdDtcblxuY2xhc3MgRGVjb3JhdGlvbkJhc2VkR2x5cGgge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBsYW5lSW5kZXg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29tYmluZWRDbGFz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
