import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import { Color } from "../../../../base/common/color.js";
import { ViewPart } from "../../view/viewPart.js";
import { Position } from "../../../common/core/position.js";
import { TokenizationRegistry } from "../../../common/languages.js";
import { editorCursorForeground, editorOverviewRulerBorder, editorOverviewRulerBackground, editorMultiCursorSecondaryForeground, editorMultiCursorPrimaryForeground } from "../../../common/core/editorColorRegistry.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { OverviewRulerDecorationsGroup } from "../../../common/viewModel.js";
import { equals } from "../../../../base/common/arrays.js";
class Settings {
  constructor(config, theme) {
    const options = config.options;
    this.lineHeight = options.get(EditorOption.lineHeight);
    this.pixelRatio = options.get(EditorOption.pixelRatio);
    this.overviewRulerLanes = options.get(EditorOption.overviewRulerLanes);
    this.renderBorder = options.get(EditorOption.overviewRulerBorder);
    const borderColor = theme.getColor(editorOverviewRulerBorder);
    this.borderColor = borderColor ? borderColor.toString() : null;
    this.hideCursor = options.get(EditorOption.hideCursorInOverviewRuler);
    const cursorColorSingle = theme.getColor(editorCursorForeground);
    this.cursorColorSingle = cursorColorSingle ? cursorColorSingle.transparent(0.7).toString() : null;
    const cursorColorPrimary = theme.getColor(editorMultiCursorPrimaryForeground);
    this.cursorColorPrimary = cursorColorPrimary ? cursorColorPrimary.transparent(0.7).toString() : null;
    const cursorColorSecondary = theme.getColor(editorMultiCursorSecondaryForeground);
    this.cursorColorSecondary = cursorColorSecondary ? cursorColorSecondary.transparent(0.7).toString() : null;
    this.themeType = theme.type;
    const minimapOpts = options.get(EditorOption.minimap);
    const minimapEnabled = minimapOpts.enabled;
    const minimapSide = minimapOpts.side;
    const themeColor = theme.getColor(editorOverviewRulerBackground);
    const defaultBackground = TokenizationRegistry.getDefaultBackground();
    if (themeColor) {
      this.backgroundColor = themeColor;
    } else if (minimapEnabled && minimapSide === "right") {
      this.backgroundColor = defaultBackground;
    } else {
      this.backgroundColor = null;
    }
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const position = layoutInfo.overviewRuler;
    this.top = position.top;
    this.right = position.right;
    this.domWidth = position.width;
    this.domHeight = position.height;
    if (this.overviewRulerLanes === 0) {
      this.canvasWidth = 0;
      this.canvasHeight = 0;
    } else {
      this.canvasWidth = this.domWidth * this.pixelRatio | 0;
      this.canvasHeight = this.domHeight * this.pixelRatio | 0;
    }
    const [x, w] = this._initLanes(1, this.canvasWidth, this.overviewRulerLanes);
    this.x = x;
    this.w = w;
  }
  _initLanes(canvasLeftOffset, canvasWidth, laneCount) {
    const remainingWidth = canvasWidth - canvasLeftOffset;
    if (laneCount >= 3) {
      const leftWidth = Math.floor(remainingWidth / 3);
      const rightWidth = Math.floor(remainingWidth / 3);
      const centerWidth = remainingWidth - leftWidth - rightWidth;
      const leftOffset = canvasLeftOffset;
      const centerOffset = leftOffset + leftWidth;
      const rightOffset = leftOffset + leftWidth + centerWidth;
      return [
        [
          0,
          leftOffset,
          // Left
          centerOffset,
          // Center
          leftOffset,
          // Left | Center
          rightOffset,
          // Right
          leftOffset,
          // Left | Right
          centerOffset,
          // Center | Right
          leftOffset
          // Left | Center | Right
        ],
        [
          0,
          leftWidth,
          // Left
          centerWidth,
          // Center
          leftWidth + centerWidth,
          // Left | Center
          rightWidth,
          // Right
          leftWidth + centerWidth + rightWidth,
          // Left | Right
          centerWidth + rightWidth,
          // Center | Right
          leftWidth + centerWidth + rightWidth
          // Left | Center | Right
        ]
      ];
    } else if (laneCount === 2) {
      const leftWidth = Math.floor(remainingWidth / 2);
      const rightWidth = remainingWidth - leftWidth;
      const leftOffset = canvasLeftOffset;
      const rightOffset = leftOffset + leftWidth;
      return [
        [
          0,
          leftOffset,
          // Left
          leftOffset,
          // Center
          leftOffset,
          // Left | Center
          rightOffset,
          // Right
          leftOffset,
          // Left | Right
          leftOffset,
          // Center | Right
          leftOffset
          // Left | Center | Right
        ],
        [
          0,
          leftWidth,
          // Left
          leftWidth,
          // Center
          leftWidth,
          // Left | Center
          rightWidth,
          // Right
          leftWidth + rightWidth,
          // Left | Right
          leftWidth + rightWidth,
          // Center | Right
          leftWidth + rightWidth
          // Left | Center | Right
        ]
      ];
    } else {
      const offset = canvasLeftOffset;
      const width = remainingWidth;
      return [
        [
          0,
          offset,
          // Left
          offset,
          // Center
          offset,
          // Left | Center
          offset,
          // Right
          offset,
          // Left | Right
          offset,
          // Center | Right
          offset
          // Left | Center | Right
        ],
        [
          0,
          width,
          // Left
          width,
          // Center
          width,
          // Left | Center
          width,
          // Right
          width,
          // Left | Right
          width,
          // Center | Right
          width
          // Left | Center | Right
        ]
      ];
    }
  }
  equals(other) {
    return this.lineHeight === other.lineHeight && this.pixelRatio === other.pixelRatio && this.overviewRulerLanes === other.overviewRulerLanes && this.renderBorder === other.renderBorder && this.borderColor === other.borderColor && this.hideCursor === other.hideCursor && this.cursorColorSingle === other.cursorColorSingle && this.cursorColorPrimary === other.cursorColorPrimary && this.cursorColorSecondary === other.cursorColorSecondary && this.themeType === other.themeType && Color.equals(this.backgroundColor, other.backgroundColor) && this.top === other.top && this.right === other.right && this.domWidth === other.domWidth && this.domHeight === other.domHeight && this.canvasWidth === other.canvasWidth && this.canvasHeight === other.canvasHeight;
  }
}
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MIN_DECORATION_HEIGHT"] = 6] = "MIN_DECORATION_HEIGHT";
  return Constants2;
})(Constants || {});
var OverviewRulerLane = /* @__PURE__ */ ((OverviewRulerLane2) => {
  OverviewRulerLane2[OverviewRulerLane2["Left"] = 1] = "Left";
  OverviewRulerLane2[OverviewRulerLane2["Center"] = 2] = "Center";
  OverviewRulerLane2[OverviewRulerLane2["Right"] = 4] = "Right";
  OverviewRulerLane2[OverviewRulerLane2["Full"] = 7] = "Full";
  return OverviewRulerLane2;
})(OverviewRulerLane || {});
var ShouldRenderValue = /* @__PURE__ */ ((ShouldRenderValue2) => {
  ShouldRenderValue2[ShouldRenderValue2["NotNeeded"] = 0] = "NotNeeded";
  ShouldRenderValue2[ShouldRenderValue2["Maybe"] = 1] = "Maybe";
  ShouldRenderValue2[ShouldRenderValue2["Needed"] = 2] = "Needed";
  return ShouldRenderValue2;
})(ShouldRenderValue || {});
class DecorationsOverviewRuler extends ViewPart {
  constructor(context) {
    super(context);
    this._actualShouldRender = 0 /* NotNeeded */;
    this._renderedDecorations = [];
    this._renderedCursorPositions = [];
    this._domNode = createFastDomNode(document.createElement("canvas"));
    this._domNode.setClassName("decorationsOverviewRuler");
    this._domNode.setPosition("absolute");
    this._domNode.setLayerHinting(true);
    this._domNode.setContain("strict");
    this._domNode.setAttribute("aria-hidden", "true");
    this._updateSettings(false);
    this._tokensColorTrackerListener = TokenizationRegistry.onDidChange((e) => {
      if (e.changedColorMap) {
        this._updateSettings(true);
      }
    });
    this._cursorPositions = [{ position: new Position(1, 1), color: this._settings.cursorColorSingle }];
  }
  dispose() {
    super.dispose();
    this._tokensColorTrackerListener.dispose();
  }
  _updateSettings(renderNow) {
    const newSettings = new Settings(this._context.configuration, this._context.theme);
    if (this._settings && this._settings.equals(newSettings)) {
      return false;
    }
    this._settings = newSettings;
    this._domNode.setTop(this._settings.top);
    this._domNode.setRight(this._settings.right);
    this._domNode.setWidth(this._settings.domWidth);
    this._domNode.setHeight(this._settings.domHeight);
    this._domNode.domNode.width = this._settings.canvasWidth;
    this._domNode.domNode.height = this._settings.canvasHeight;
    if (renderNow) {
      this._render();
    }
    return true;
  }
  // ---- begin view event handlers
  _markRenderingIsNeeded() {
    this._actualShouldRender = 2 /* Needed */;
    return true;
  }
  _markRenderingIsMaybeNeeded() {
    this._actualShouldRender = 1 /* Maybe */;
    return true;
  }
  onConfigurationChanged(e) {
    return this._updateSettings(false) ? this._markRenderingIsNeeded() : false;
  }
  onCursorStateChanged(e) {
    this._cursorPositions = [];
    for (let i = 0, len = e.selections.length; i < len; i++) {
      let color = this._settings.cursorColorSingle;
      if (len > 1) {
        color = i === 0 ? this._settings.cursorColorPrimary : this._settings.cursorColorSecondary;
      }
      this._cursorPositions.push({ position: e.selections[i].getPosition(), color });
    }
    this._cursorPositions.sort((a, b) => Position.compare(a.position, b.position));
    return this._markRenderingIsMaybeNeeded();
  }
  onDecorationsChanged(e) {
    if (e.affectsOverviewRuler) {
      return this._markRenderingIsMaybeNeeded();
    }
    return false;
  }
  onFlushed(e) {
    return this._markRenderingIsNeeded();
  }
  onScrollChanged(e) {
    return e.scrollHeightChanged ? this._markRenderingIsNeeded() : false;
  }
  onZonesChanged(e) {
    return this._markRenderingIsNeeded();
  }
  onThemeChanged(e) {
    return this._updateSettings(false) ? this._markRenderingIsNeeded() : false;
  }
  // ---- end view event handlers
  getDomNode() {
    return this._domNode.domNode;
  }
  prepareRender(ctx) {
  }
  render(editorCtx) {
    this._render();
    this._actualShouldRender = 0 /* NotNeeded */;
  }
  _render() {
    const backgroundColor = this._settings.backgroundColor;
    if (this._settings.overviewRulerLanes === 0) {
      this._domNode.setBackgroundColor(backgroundColor ? Color.Format.CSS.formatHexA(backgroundColor) : "");
      this._domNode.setDisplay("none");
      return;
    }
    const decorations = this._context.viewModel.getAllOverviewRulerDecorations(this._context.theme);
    decorations.sort(OverviewRulerDecorationsGroup.compareByRenderingProps);
    if (this._actualShouldRender === 1 /* Maybe */ && !OverviewRulerDecorationsGroup.equalsArr(this._renderedDecorations, decorations)) {
      this._actualShouldRender = 2 /* Needed */;
    }
    if (this._actualShouldRender === 1 /* Maybe */ && !equals(this._renderedCursorPositions, this._cursorPositions, (a, b) => a.position.lineNumber === b.position.lineNumber && a.color === b.color)) {
      this._actualShouldRender = 2 /* Needed */;
    }
    if (this._actualShouldRender === 1 /* Maybe */) {
      return;
    }
    this._renderedDecorations = decorations;
    this._renderedCursorPositions = this._cursorPositions;
    this._domNode.setDisplay("block");
    const canvasWidth = this._settings.canvasWidth;
    const canvasHeight = this._settings.canvasHeight;
    const lineHeight = this._settings.lineHeight;
    const viewLayout = this._context.viewLayout;
    const outerHeight = this._context.viewLayout.getScrollHeight();
    const heightRatio = canvasHeight / outerHeight;
    const minDecorationHeight = 6 /* MIN_DECORATION_HEIGHT */ * this._settings.pixelRatio | 0;
    const halfMinDecorationHeight = minDecorationHeight / 2 | 0;
    const canvasCtx = this._domNode.domNode.getContext("2d");
    if (backgroundColor) {
      if (backgroundColor.isOpaque()) {
        canvasCtx.fillStyle = Color.Format.CSS.formatHexA(backgroundColor);
        canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      } else {
        canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        canvasCtx.fillStyle = Color.Format.CSS.formatHexA(backgroundColor);
        canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
    } else {
      canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
    const x = this._settings.x;
    const w = this._settings.w;
    for (const decorationGroup of decorations) {
      const color = decorationGroup.color;
      const decorationGroupData = decorationGroup.data;
      canvasCtx.fillStyle = color;
      let prevLane = 0;
      let prevY1 = 0;
      let prevY2 = 0;
      for (let i = 0, len = decorationGroupData.length / 3; i < len; i++) {
        const lane = decorationGroupData[3 * i];
        const startLineNumber = decorationGroupData[3 * i + 1];
        const endLineNumber = decorationGroupData[3 * i + 2];
        let y1 = viewLayout.getVerticalOffsetForLineNumber(startLineNumber) * heightRatio | 0;
        let y2 = (viewLayout.getVerticalOffsetForLineNumber(endLineNumber) + lineHeight) * heightRatio | 0;
        const height = y2 - y1;
        if (height < minDecorationHeight) {
          let yCenter = (y1 + y2) / 2 | 0;
          if (yCenter < halfMinDecorationHeight) {
            yCenter = halfMinDecorationHeight;
          } else if (yCenter + halfMinDecorationHeight > canvasHeight) {
            yCenter = canvasHeight - halfMinDecorationHeight;
          }
          y1 = yCenter - halfMinDecorationHeight;
          y2 = yCenter + halfMinDecorationHeight;
        }
        if (y1 > prevY2 + 1 || lane !== prevLane) {
          if (i !== 0) {
            canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
          }
          prevLane = lane;
          prevY1 = y1;
          prevY2 = y2;
        } else {
          if (y2 > prevY2) {
            prevY2 = y2;
          }
        }
      }
      canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
    }
    if (!this._settings.hideCursor) {
      const cursorHeight = 2 * this._settings.pixelRatio | 0;
      const halfCursorHeight = cursorHeight / 2 | 0;
      const cursorX = this._settings.x[7 /* Full */];
      const cursorW = this._settings.w[7 /* Full */];
      let prevY1 = -100;
      let prevY2 = -100;
      let prevColor = null;
      for (let i = 0, len = this._cursorPositions.length; i < len; i++) {
        const color = this._cursorPositions[i].color;
        if (!color) {
          continue;
        }
        const cursor = this._cursorPositions[i].position;
        let yCenter = viewLayout.getVerticalOffsetForLineNumber(cursor.lineNumber) * heightRatio | 0;
        if (yCenter < halfCursorHeight) {
          yCenter = halfCursorHeight;
        } else if (yCenter + halfCursorHeight > canvasHeight) {
          yCenter = canvasHeight - halfCursorHeight;
        }
        const y1 = yCenter - halfCursorHeight;
        const y2 = y1 + cursorHeight;
        if (y1 > prevY2 + 1 || color !== prevColor) {
          if (i !== 0 && prevColor) {
            canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
          }
          prevY1 = y1;
          prevY2 = y2;
        } else {
          if (y2 > prevY2) {
            prevY2 = y2;
          }
        }
        prevColor = color;
        canvasCtx.fillStyle = color;
      }
      if (prevColor) {
        canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
      }
    }
    if (this._settings.renderBorder && this._settings.borderColor && this._settings.overviewRulerLanes > 0) {
      canvasCtx.beginPath();
      canvasCtx.lineWidth = 1;
      canvasCtx.strokeStyle = this._settings.borderColor;
      canvasCtx.moveTo(0, 0);
      canvasCtx.lineTo(0, canvasHeight);
      canvasCtx.moveTo(1, 0);
      canvasCtx.lineTo(canvasWidth, 0);
      canvasCtx.stroke();
    }
  }
}
export {
  DecorationsOverviewRuler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXdQYXJ0c1xcb3ZlcnZpZXdSdWxlclxcZGVjb3JhdGlvbnNPdmVydmlld1J1bGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRmFzdERvbU5vZGUsIGNyZWF0ZUZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVmlld1BhcnQgfSBmcm9tICcuLi8uLi92aWV3L3ZpZXdQYXJ0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGVkaXRvckN1cnNvckZvcmVncm91bmQsIGVkaXRvck92ZXJ2aWV3UnVsZXJCb3JkZXIsIGVkaXRvck92ZXJ2aWV3UnVsZXJCYWNrZ3JvdW5kLCBlZGl0b3JNdWx0aUN1cnNvclNlY29uZGFyeUZvcmVncm91bmQsIGVkaXRvck11bHRpQ3Vyc29yUHJpbWFyeUZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlbmRlcmluZ0NvbnRleHQsIFJlc3RyaWN0ZWRSZW5kZXJpbmdDb250ZXh0IH0gZnJvbSAnLi4vLi4vdmlldy9yZW5kZXJpbmdDb250ZXh0LmpzJztcbmltcG9ydCB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JUaGVtZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JUaGVtZS5qcyc7XG5pbXBvcnQgKiBhcyB2aWV3RXZlbnRzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBPdmVydmlld1J1bGVyRGVjb3JhdGlvbnNHcm91cCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcblxuY2xhc3MgU2V0dGluZ3Mge1xuXG5cdHB1YmxpYyByZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBwaXhlbFJhdGlvOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBvdmVydmlld1J1bGVyTGFuZXM6IG51bWJlcjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgcmVuZGVyQm9yZGVyOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgYm9yZGVyQ29sb3I6IHN0cmluZyB8IG51bGw7XG5cblx0cHVibGljIHJlYWRvbmx5IGhpZGVDdXJzb3I6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBjdXJzb3JDb2xvclNpbmdsZTogc3RyaW5nIHwgbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IGN1cnNvckNvbG9yUHJpbWFyeTogc3RyaW5nIHwgbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IGN1cnNvckNvbG9yU2Vjb25kYXJ5OiBzdHJpbmcgfCBudWxsO1xuXG5cdHB1YmxpYyByZWFkb25seSB0aGVtZVR5cGU6ICdsaWdodCcgfCAnZGFyaycgfCAnaGNMaWdodCcgfCAnaGNEYXJrJztcblx0cHVibGljIHJlYWRvbmx5IGJhY2tncm91bmRDb2xvcjogQ29sb3IgfCBudWxsO1xuXG5cdHB1YmxpYyByZWFkb25seSB0b3A6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IHJpZ2h0OiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBkb21XaWR0aDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tSGVpZ2h0OiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBjYW52YXNXaWR0aDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgY2FudmFzSGVpZ2h0OiBudW1iZXI7XG5cblx0cHVibGljIHJlYWRvbmx5IHg6IG51bWJlcltdO1xuXHRwdWJsaWMgcmVhZG9ubHkgdzogbnVtYmVyW107XG5cblx0Y29uc3RydWN0b3IoY29uZmlnOiBJRWRpdG9yQ29uZmlndXJhdGlvbiwgdGhlbWU6IEVkaXRvclRoZW1lKSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGNvbmZpZy5vcHRpb25zO1xuXHRcdHRoaXMubGluZUhlaWdodCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHR0aGlzLnBpeGVsUmF0aW8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucGl4ZWxSYXRpbyk7XG5cdFx0dGhpcy5vdmVydmlld1J1bGVyTGFuZXMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ub3ZlcnZpZXdSdWxlckxhbmVzKTtcblxuXHRcdHRoaXMucmVuZGVyQm9yZGVyID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLm92ZXJ2aWV3UnVsZXJCb3JkZXIpO1xuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yT3ZlcnZpZXdSdWxlckJvcmRlcik7XG5cdFx0dGhpcy5ib3JkZXJDb2xvciA9IGJvcmRlckNvbG9yID8gYm9yZGVyQ29sb3IudG9TdHJpbmcoKSA6IG51bGw7XG5cblx0XHR0aGlzLmhpZGVDdXJzb3IgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uaGlkZUN1cnNvckluT3ZlcnZpZXdSdWxlcik7XG5cdFx0Y29uc3QgY3Vyc29yQ29sb3JTaW5nbGUgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JDdXJzb3JGb3JlZ3JvdW5kKTtcblx0XHR0aGlzLmN1cnNvckNvbG9yU2luZ2xlID0gY3Vyc29yQ29sb3JTaW5nbGUgPyBjdXJzb3JDb2xvclNpbmdsZS50cmFuc3BhcmVudCgwLjcpLnRvU3RyaW5nKCkgOiBudWxsO1xuXHRcdGNvbnN0IGN1cnNvckNvbG9yUHJpbWFyeSA9IHRoZW1lLmdldENvbG9yKGVkaXRvck11bHRpQ3Vyc29yUHJpbWFyeUZvcmVncm91bmQpO1xuXHRcdHRoaXMuY3Vyc29yQ29sb3JQcmltYXJ5ID0gY3Vyc29yQ29sb3JQcmltYXJ5ID8gY3Vyc29yQ29sb3JQcmltYXJ5LnRyYW5zcGFyZW50KDAuNykudG9TdHJpbmcoKSA6IG51bGw7XG5cdFx0Y29uc3QgY3Vyc29yQ29sb3JTZWNvbmRhcnkgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JNdWx0aUN1cnNvclNlY29uZGFyeUZvcmVncm91bmQpO1xuXHRcdHRoaXMuY3Vyc29yQ29sb3JTZWNvbmRhcnkgPSBjdXJzb3JDb2xvclNlY29uZGFyeSA/IGN1cnNvckNvbG9yU2Vjb25kYXJ5LnRyYW5zcGFyZW50KDAuNykudG9TdHJpbmcoKSA6IG51bGw7XG5cblx0XHR0aGlzLnRoZW1lVHlwZSA9IHRoZW1lLnR5cGU7XG5cblx0XHRjb25zdCBtaW5pbWFwT3B0cyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5taW5pbWFwKTtcblx0XHRjb25zdCBtaW5pbWFwRW5hYmxlZCA9IG1pbmltYXBPcHRzLmVuYWJsZWQ7XG5cdFx0Y29uc3QgbWluaW1hcFNpZGUgPSBtaW5pbWFwT3B0cy5zaWRlO1xuXHRcdGNvbnN0IHRoZW1lQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JPdmVydmlld1J1bGVyQmFja2dyb3VuZCk7XG5cdFx0Y29uc3QgZGVmYXVsdEJhY2tncm91bmQgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXREZWZhdWx0QmFja2dyb3VuZCgpO1xuXG5cdFx0aWYgKHRoZW1lQ29sb3IpIHtcblx0XHRcdHRoaXMuYmFja2dyb3VuZENvbG9yID0gdGhlbWVDb2xvcjtcblx0XHR9IGVsc2UgaWYgKG1pbmltYXBFbmFibGVkICYmIG1pbmltYXBTaWRlID09PSAncmlnaHQnKSB7XG5cdFx0XHR0aGlzLmJhY2tncm91bmRDb2xvciA9IGRlZmF1bHRCYWNrZ3JvdW5kO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmJhY2tncm91bmRDb2xvciA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRjb25zdCBwb3NpdGlvbiA9IGxheW91dEluZm8ub3ZlcnZpZXdSdWxlcjtcblx0XHR0aGlzLnRvcCA9IHBvc2l0aW9uLnRvcDtcblx0XHR0aGlzLnJpZ2h0ID0gcG9zaXRpb24ucmlnaHQ7XG5cdFx0dGhpcy5kb21XaWR0aCA9IHBvc2l0aW9uLndpZHRoO1xuXHRcdHRoaXMuZG9tSGVpZ2h0ID0gcG9zaXRpb24uaGVpZ2h0O1xuXHRcdGlmICh0aGlzLm92ZXJ2aWV3UnVsZXJMYW5lcyA9PT0gMCkge1xuXHRcdFx0Ly8gb3ZlcnZpZXcgcnVsZXIgaXMgb2ZmXG5cdFx0XHR0aGlzLmNhbnZhc1dpZHRoID0gMDtcblx0XHRcdHRoaXMuY2FudmFzSGVpZ2h0ID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jYW52YXNXaWR0aCA9ICh0aGlzLmRvbVdpZHRoICogdGhpcy5waXhlbFJhdGlvKSB8IDA7XG5cdFx0XHR0aGlzLmNhbnZhc0hlaWdodCA9ICh0aGlzLmRvbUhlaWdodCAqIHRoaXMucGl4ZWxSYXRpbykgfCAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IFt4LCB3XSA9IHRoaXMuX2luaXRMYW5lcygxLCB0aGlzLmNhbnZhc1dpZHRoLCB0aGlzLm92ZXJ2aWV3UnVsZXJMYW5lcyk7XG5cdFx0dGhpcy54ID0geDtcblx0XHR0aGlzLncgPSB3O1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdExhbmVzKGNhbnZhc0xlZnRPZmZzZXQ6IG51bWJlciwgY2FudmFzV2lkdGg6IG51bWJlciwgbGFuZUNvdW50OiBudW1iZXIpOiBbbnVtYmVyW10sIG51bWJlcltdXSB7XG5cdFx0Y29uc3QgcmVtYWluaW5nV2lkdGggPSBjYW52YXNXaWR0aCAtIGNhbnZhc0xlZnRPZmZzZXQ7XG5cblx0XHRpZiAobGFuZUNvdW50ID49IDMpIHtcblx0XHRcdGNvbnN0IGxlZnRXaWR0aCA9IE1hdGguZmxvb3IocmVtYWluaW5nV2lkdGggLyAzKTtcblx0XHRcdGNvbnN0IHJpZ2h0V2lkdGggPSBNYXRoLmZsb29yKHJlbWFpbmluZ1dpZHRoIC8gMyk7XG5cdFx0XHRjb25zdCBjZW50ZXJXaWR0aCA9IHJlbWFpbmluZ1dpZHRoIC0gbGVmdFdpZHRoIC0gcmlnaHRXaWR0aDtcblx0XHRcdGNvbnN0IGxlZnRPZmZzZXQgPSBjYW52YXNMZWZ0T2Zmc2V0O1xuXHRcdFx0Y29uc3QgY2VudGVyT2Zmc2V0ID0gbGVmdE9mZnNldCArIGxlZnRXaWR0aDtcblx0XHRcdGNvbnN0IHJpZ2h0T2Zmc2V0ID0gbGVmdE9mZnNldCArIGxlZnRXaWR0aCArIGNlbnRlcldpZHRoO1xuXG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRbXG5cdFx0XHRcdFx0MCxcblx0XHRcdFx0XHRsZWZ0T2Zmc2V0LCAvLyBMZWZ0XG5cdFx0XHRcdFx0Y2VudGVyT2Zmc2V0LCAvLyBDZW50ZXJcblx0XHRcdFx0XHRsZWZ0T2Zmc2V0LCAvLyBMZWZ0IHwgQ2VudGVyXG5cdFx0XHRcdFx0cmlnaHRPZmZzZXQsIC8vIFJpZ2h0XG5cdFx0XHRcdFx0bGVmdE9mZnNldCwgLy8gTGVmdCB8IFJpZ2h0XG5cdFx0XHRcdFx0Y2VudGVyT2Zmc2V0LCAvLyBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRcdGxlZnRPZmZzZXQsIC8vIExlZnQgfCBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRdLCBbXG5cdFx0XHRcdFx0MCxcblx0XHRcdFx0XHRsZWZ0V2lkdGgsIC8vIExlZnRcblx0XHRcdFx0XHRjZW50ZXJXaWR0aCwgLy8gQ2VudGVyXG5cdFx0XHRcdFx0bGVmdFdpZHRoICsgY2VudGVyV2lkdGgsIC8vIExlZnQgfCBDZW50ZXJcblx0XHRcdFx0XHRyaWdodFdpZHRoLCAvLyBSaWdodFxuXHRcdFx0XHRcdGxlZnRXaWR0aCArIGNlbnRlcldpZHRoICsgcmlnaHRXaWR0aCwgLy8gTGVmdCB8IFJpZ2h0XG5cdFx0XHRcdFx0Y2VudGVyV2lkdGggKyByaWdodFdpZHRoLCAvLyBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRcdGxlZnRXaWR0aCArIGNlbnRlcldpZHRoICsgcmlnaHRXaWR0aCwgLy8gTGVmdCB8IENlbnRlciB8IFJpZ2h0XG5cdFx0XHRcdF1cblx0XHRcdF07XG5cdFx0fSBlbHNlIGlmIChsYW5lQ291bnQgPT09IDIpIHtcblx0XHRcdGNvbnN0IGxlZnRXaWR0aCA9IE1hdGguZmxvb3IocmVtYWluaW5nV2lkdGggLyAyKTtcblx0XHRcdGNvbnN0IHJpZ2h0V2lkdGggPSByZW1haW5pbmdXaWR0aCAtIGxlZnRXaWR0aDtcblx0XHRcdGNvbnN0IGxlZnRPZmZzZXQgPSBjYW52YXNMZWZ0T2Zmc2V0O1xuXHRcdFx0Y29uc3QgcmlnaHRPZmZzZXQgPSBsZWZ0T2Zmc2V0ICsgbGVmdFdpZHRoO1xuXG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRbXG5cdFx0XHRcdFx0MCxcblx0XHRcdFx0XHRsZWZ0T2Zmc2V0LCAvLyBMZWZ0XG5cdFx0XHRcdFx0bGVmdE9mZnNldCwgLy8gQ2VudGVyXG5cdFx0XHRcdFx0bGVmdE9mZnNldCwgLy8gTGVmdCB8IENlbnRlclxuXHRcdFx0XHRcdHJpZ2h0T2Zmc2V0LCAvLyBSaWdodFxuXHRcdFx0XHRcdGxlZnRPZmZzZXQsIC8vIExlZnQgfCBSaWdodFxuXHRcdFx0XHRcdGxlZnRPZmZzZXQsIC8vIENlbnRlciB8IFJpZ2h0XG5cdFx0XHRcdFx0bGVmdE9mZnNldCwgLy8gTGVmdCB8IENlbnRlciB8IFJpZ2h0XG5cdFx0XHRcdF0sIFtcblx0XHRcdFx0XHQwLFxuXHRcdFx0XHRcdGxlZnRXaWR0aCwgLy8gTGVmdFxuXHRcdFx0XHRcdGxlZnRXaWR0aCwgLy8gQ2VudGVyXG5cdFx0XHRcdFx0bGVmdFdpZHRoLCAvLyBMZWZ0IHwgQ2VudGVyXG5cdFx0XHRcdFx0cmlnaHRXaWR0aCwgLy8gUmlnaHRcblx0XHRcdFx0XHRsZWZ0V2lkdGggKyByaWdodFdpZHRoLCAvLyBMZWZ0IHwgUmlnaHRcblx0XHRcdFx0XHRsZWZ0V2lkdGggKyByaWdodFdpZHRoLCAvLyBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRcdGxlZnRXaWR0aCArIHJpZ2h0V2lkdGgsIC8vIExlZnQgfCBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRdXG5cdFx0XHRdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSBjYW52YXNMZWZ0T2Zmc2V0O1xuXHRcdFx0Y29uc3Qgd2lkdGggPSByZW1haW5pbmdXaWR0aDtcblxuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdDAsXG5cdFx0XHRcdFx0b2Zmc2V0LCAvLyBMZWZ0XG5cdFx0XHRcdFx0b2Zmc2V0LCAvLyBDZW50ZXJcblx0XHRcdFx0XHRvZmZzZXQsIC8vIExlZnQgfCBDZW50ZXJcblx0XHRcdFx0XHRvZmZzZXQsIC8vIFJpZ2h0XG5cdFx0XHRcdFx0b2Zmc2V0LCAvLyBMZWZ0IHwgUmlnaHRcblx0XHRcdFx0XHRvZmZzZXQsIC8vIENlbnRlciB8IFJpZ2h0XG5cdFx0XHRcdFx0b2Zmc2V0LCAvLyBMZWZ0IHwgQ2VudGVyIHwgUmlnaHRcblx0XHRcdFx0XSwgW1xuXHRcdFx0XHRcdDAsXG5cdFx0XHRcdFx0d2lkdGgsIC8vIExlZnRcblx0XHRcdFx0XHR3aWR0aCwgLy8gQ2VudGVyXG5cdFx0XHRcdFx0d2lkdGgsIC8vIExlZnQgfCBDZW50ZXJcblx0XHRcdFx0XHR3aWR0aCwgLy8gUmlnaHRcblx0XHRcdFx0XHR3aWR0aCwgLy8gTGVmdCB8IFJpZ2h0XG5cdFx0XHRcdFx0d2lkdGgsIC8vIENlbnRlciB8IFJpZ2h0XG5cdFx0XHRcdFx0d2lkdGgsIC8vIExlZnQgfCBDZW50ZXIgfCBSaWdodFxuXHRcdFx0XHRdXG5cdFx0XHRdO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IFNldHRpbmdzKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHRoaXMubGluZUhlaWdodCA9PT0gb3RoZXIubGluZUhlaWdodFxuXHRcdFx0JiYgdGhpcy5waXhlbFJhdGlvID09PSBvdGhlci5waXhlbFJhdGlvXG5cdFx0XHQmJiB0aGlzLm92ZXJ2aWV3UnVsZXJMYW5lcyA9PT0gb3RoZXIub3ZlcnZpZXdSdWxlckxhbmVzXG5cdFx0XHQmJiB0aGlzLnJlbmRlckJvcmRlciA9PT0gb3RoZXIucmVuZGVyQm9yZGVyXG5cdFx0XHQmJiB0aGlzLmJvcmRlckNvbG9yID09PSBvdGhlci5ib3JkZXJDb2xvclxuXHRcdFx0JiYgdGhpcy5oaWRlQ3Vyc29yID09PSBvdGhlci5oaWRlQ3Vyc29yXG5cdFx0XHQmJiB0aGlzLmN1cnNvckNvbG9yU2luZ2xlID09PSBvdGhlci5jdXJzb3JDb2xvclNpbmdsZVxuXHRcdFx0JiYgdGhpcy5jdXJzb3JDb2xvclByaW1hcnkgPT09IG90aGVyLmN1cnNvckNvbG9yUHJpbWFyeVxuXHRcdFx0JiYgdGhpcy5jdXJzb3JDb2xvclNlY29uZGFyeSA9PT0gb3RoZXIuY3Vyc29yQ29sb3JTZWNvbmRhcnlcblx0XHRcdCYmIHRoaXMudGhlbWVUeXBlID09PSBvdGhlci50aGVtZVR5cGVcblx0XHRcdCYmIENvbG9yLmVxdWFscyh0aGlzLmJhY2tncm91bmRDb2xvciwgb3RoZXIuYmFja2dyb3VuZENvbG9yKVxuXHRcdFx0JiYgdGhpcy50b3AgPT09IG90aGVyLnRvcFxuXHRcdFx0JiYgdGhpcy5yaWdodCA9PT0gb3RoZXIucmlnaHRcblx0XHRcdCYmIHRoaXMuZG9tV2lkdGggPT09IG90aGVyLmRvbVdpZHRoXG5cdFx0XHQmJiB0aGlzLmRvbUhlaWdodCA9PT0gb3RoZXIuZG9tSGVpZ2h0XG5cdFx0XHQmJiB0aGlzLmNhbnZhc1dpZHRoID09PSBvdGhlci5jYW52YXNXaWR0aFxuXHRcdFx0JiYgdGhpcy5jYW52YXNIZWlnaHQgPT09IG90aGVyLmNhbnZhc0hlaWdodFxuXHRcdCk7XG5cdH1cbn1cblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHRNSU5fREVDT1JBVElPTl9IRUlHSFQgPSA2XG59XG5cbmNvbnN0IGVudW0gT3ZlcnZpZXdSdWxlckxhbmUge1xuXHRMZWZ0ID0gMSxcblx0Q2VudGVyID0gMixcblx0UmlnaHQgPSA0LFxuXHRGdWxsID0gN1xufVxuXG50eXBlIEN1cnNvciA9IHtcblx0cG9zaXRpb246IFBvc2l0aW9uO1xuXHRjb2xvcjogc3RyaW5nIHwgbnVsbDtcbn07XG5cbmNvbnN0IGVudW0gU2hvdWxkUmVuZGVyVmFsdWUge1xuXHROb3ROZWVkZWQgPSAwLFxuXHRNYXliZSA9IDEsXG5cdE5lZWRlZCA9IDJcbn1cblxuZXhwb3J0IGNsYXNzIERlY29yYXRpb25zT3ZlcnZpZXdSdWxlciBleHRlbmRzIFZpZXdQYXJ0IHtcblxuXHRwcml2YXRlIF9hY3R1YWxTaG91bGRSZW5kZXI6IFNob3VsZFJlbmRlclZhbHVlID0gU2hvdWxkUmVuZGVyVmFsdWUuTm90TmVlZGVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2Vuc0NvbG9yVHJhY2tlckxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTENhbnZhc0VsZW1lbnQ+O1xuXHRwcml2YXRlIF9zZXR0aW5ncyE6IFNldHRpbmdzO1xuXHRwcml2YXRlIF9jdXJzb3JQb3NpdGlvbnM6IEN1cnNvcltdO1xuXG5cdHByaXZhdGUgX3JlbmRlcmVkRGVjb3JhdGlvbnM6IE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uc0dyb3VwW10gPSBbXTtcblx0cHJpdmF0ZSBfcmVuZGVyZWRDdXJzb3JQb3NpdGlvbnM6IEN1cnNvcltdID0gW107XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogVmlld0NvbnRleHQpIHtcblx0XHRzdXBlcihjb250ZXh0KTtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRDbGFzc05hbWUoJ2RlY29yYXRpb25zT3ZlcnZpZXdSdWxlcicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0UG9zaXRpb24oJ2Fic29sdXRlJyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRMYXllckhpbnRpbmcodHJ1ZSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRDb250YWluKCdzdHJpY3QnKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0dGhpcy5fdXBkYXRlU2V0dGluZ3MoZmFsc2UpO1xuXG5cdFx0dGhpcy5fdG9rZW5zQ29sb3JUcmFja2VyTGlzdGVuZXIgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5vbkRpZENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUuY2hhbmdlZENvbG9yTWFwKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVNldHRpbmdzKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fY3Vyc29yUG9zaXRpb25zID0gW3sgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxKSwgY29sb3I6IHRoaXMuX3NldHRpbmdzLmN1cnNvckNvbG9yU2luZ2xlIH1dO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Rva2Vuc0NvbG9yVHJhY2tlckxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVNldHRpbmdzKHJlbmRlck5vdzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5ld1NldHRpbmdzID0gbmV3IFNldHRpbmdzKHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbiwgdGhpcy5fY29udGV4dC50aGVtZSk7XG5cdFx0aWYgKHRoaXMuX3NldHRpbmdzICYmIHRoaXMuX3NldHRpbmdzLmVxdWFscyhuZXdTZXR0aW5ncykpIHtcblx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXR0aW5ncyA9IG5ld1NldHRpbmdzO1xuXG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRUb3AodGhpcy5fc2V0dGluZ3MudG9wKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldFJpZ2h0KHRoaXMuX3NldHRpbmdzLnJpZ2h0KTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldFdpZHRoKHRoaXMuX3NldHRpbmdzLmRvbVdpZHRoKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEhlaWdodCh0aGlzLl9zZXR0aW5ncy5kb21IZWlnaHQpO1xuXHRcdHRoaXMuX2RvbU5vZGUuZG9tTm9kZS53aWR0aCA9IHRoaXMuX3NldHRpbmdzLmNhbnZhc1dpZHRoO1xuXHRcdHRoaXMuX2RvbU5vZGUuZG9tTm9kZS5oZWlnaHQgPSB0aGlzLl9zZXR0aW5ncy5jYW52YXNIZWlnaHQ7XG5cblx0XHRpZiAocmVuZGVyTm93KSB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIC0tLS0gYmVnaW4gdmlldyBldmVudCBoYW5kbGVyc1xuXG5cdHByaXZhdGUgX21hcmtSZW5kZXJpbmdJc05lZWRlZCgpOiB0cnVlIHtcblx0XHR0aGlzLl9hY3R1YWxTaG91bGRSZW5kZXIgPSBTaG91bGRSZW5kZXJWYWx1ZS5OZWVkZWQ7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9tYXJrUmVuZGVyaW5nSXNNYXliZU5lZWRlZCgpOiB0cnVlIHtcblx0XHR0aGlzLl9hY3R1YWxTaG91bGRSZW5kZXIgPSBTaG91bGRSZW5kZXJWYWx1ZS5NYXliZTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdXBkYXRlU2V0dGluZ3MoZmFsc2UpID8gdGhpcy5fbWFya1JlbmRlcmluZ0lzTmVlZGVkKCkgOiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25DdXJzb3JTdGF0ZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9jdXJzb3JQb3NpdGlvbnMgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZS5zZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRsZXQgY29sb3IgPSB0aGlzLl9zZXR0aW5ncy5jdXJzb3JDb2xvclNpbmdsZTtcblx0XHRcdGlmIChsZW4gPiAxKSB7XG5cdFx0XHRcdGNvbG9yID0gaSA9PT0gMCA/IHRoaXMuX3NldHRpbmdzLmN1cnNvckNvbG9yUHJpbWFyeSA6IHRoaXMuX3NldHRpbmdzLmN1cnNvckNvbG9yU2Vjb25kYXJ5O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY3Vyc29yUG9zaXRpb25zLnB1c2goeyBwb3NpdGlvbjogZS5zZWxlY3Rpb25zW2ldLmdldFBvc2l0aW9uKCksIGNvbG9yIH0pO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJzb3JQb3NpdGlvbnMuc29ydCgoYSwgYikgPT4gUG9zaXRpb24uY29tcGFyZShhLnBvc2l0aW9uLCBiLnBvc2l0aW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX21hcmtSZW5kZXJpbmdJc01heWJlTmVlZGVkKCk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGUuYWZmZWN0c092ZXJ2aWV3UnVsZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLl9tYXJrUmVuZGVyaW5nSXNNYXliZU5lZWRlZCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRmx1c2hlZChlOiB2aWV3RXZlbnRzLlZpZXdGbHVzaGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbWFya1JlbmRlcmluZ0lzTmVlZGVkKCk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uU2Nyb2xsQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZS5zY3JvbGxIZWlnaHRDaGFuZ2VkID8gdGhpcy5fbWFya1JlbmRlcmluZ0lzTmVlZGVkKCkgOiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25ab25lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Wm9uZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbWFya1JlbmRlcmluZ0lzTmVlZGVkKCk7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uVGhlbWVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1RoZW1lQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VwZGF0ZVNldHRpbmdzKGZhbHNlKSA/IHRoaXMuX21hcmtSZW5kZXJpbmdJc05lZWRlZCgpIDogZmFsc2U7XG5cdH1cblxuXHQvLyAtLS0tIGVuZCB2aWV3IGV2ZW50IGhhbmRsZXJzXG5cblx0cHVibGljIGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlLmRvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgcHJlcGFyZVJlbmRlcihjdHg6IFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblx0XHQvLyBOb3RoaW5nIHRvIHJlYWRcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoZWRpdG9yQ3R4OiBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcigpO1xuXHRcdHRoaXMuX2FjdHVhbFNob3VsZFJlbmRlciA9IFNob3VsZFJlbmRlclZhbHVlLk5vdE5lZWRlZDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZ3JvdW5kQ29sb3IgPSB0aGlzLl9zZXR0aW5ncy5iYWNrZ3JvdW5kQ29sb3I7XG5cdFx0aWYgKHRoaXMuX3NldHRpbmdzLm92ZXJ2aWV3UnVsZXJMYW5lcyA9PT0gMCkge1xuXHRcdFx0Ly8gb3ZlcnZpZXcgcnVsZXIgaXMgb2ZmXG5cdFx0XHR0aGlzLl9kb21Ob2RlLnNldEJhY2tncm91bmRDb2xvcihiYWNrZ3JvdW5kQ29sb3IgPyBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoYmFja2dyb3VuZENvbG9yKSA6ICcnKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuc2V0RGlzcGxheSgnbm9uZScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0QWxsT3ZlcnZpZXdSdWxlckRlY29yYXRpb25zKHRoaXMuX2NvbnRleHQudGhlbWUpO1xuXHRcdGRlY29yYXRpb25zLnNvcnQoT3ZlcnZpZXdSdWxlckRlY29yYXRpb25zR3JvdXAuY29tcGFyZUJ5UmVuZGVyaW5nUHJvcHMpO1xuXG5cdFx0aWYgKHRoaXMuX2FjdHVhbFNob3VsZFJlbmRlciA9PT0gU2hvdWxkUmVuZGVyVmFsdWUuTWF5YmUgJiYgIU92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9uc0dyb3VwLmVxdWFsc0Fycih0aGlzLl9yZW5kZXJlZERlY29yYXRpb25zLCBkZWNvcmF0aW9ucykpIHtcblx0XHRcdHRoaXMuX2FjdHVhbFNob3VsZFJlbmRlciA9IFNob3VsZFJlbmRlclZhbHVlLk5lZWRlZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FjdHVhbFNob3VsZFJlbmRlciA9PT0gU2hvdWxkUmVuZGVyVmFsdWUuTWF5YmUgJiYgIWVxdWFscyh0aGlzLl9yZW5kZXJlZEN1cnNvclBvc2l0aW9ucywgdGhpcy5fY3Vyc29yUG9zaXRpb25zLCAoYSwgYikgPT4gYS5wb3NpdGlvbi5saW5lTnVtYmVyID09PSBiLnBvc2l0aW9uLmxpbmVOdW1iZXIgJiYgYS5jb2xvciA9PT0gYi5jb2xvcikpIHtcblx0XHRcdHRoaXMuX2FjdHVhbFNob3VsZFJlbmRlciA9IFNob3VsZFJlbmRlclZhbHVlLk5lZWRlZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FjdHVhbFNob3VsZFJlbmRlciA9PT0gU2hvdWxkUmVuZGVyVmFsdWUuTWF5YmUpIHtcblx0XHRcdC8vIGJvdGggZGVjb3JhdGlvbnMgYW5kIGN1cnNvciBwb3NpdGlvbnMgYXJlIHVuY2hhbmdlZCwgbm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJlZERlY29yYXRpb25zID0gZGVjb3JhdGlvbnM7XG5cdFx0dGhpcy5fcmVuZGVyZWRDdXJzb3JQb3NpdGlvbnMgPSB0aGlzLl9jdXJzb3JQb3NpdGlvbnM7XG5cblx0XHR0aGlzLl9kb21Ob2RlLnNldERpc3BsYXkoJ2Jsb2NrJyk7XG5cdFx0Y29uc3QgY2FudmFzV2lkdGggPSB0aGlzLl9zZXR0aW5ncy5jYW52YXNXaWR0aDtcblx0XHRjb25zdCBjYW52YXNIZWlnaHQgPSB0aGlzLl9zZXR0aW5ncy5jYW52YXNIZWlnaHQ7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX3NldHRpbmdzLmxpbmVIZWlnaHQ7XG5cdFx0Y29uc3Qgdmlld0xheW91dCA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dDtcblx0XHRjb25zdCBvdXRlckhlaWdodCA9IHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRTY3JvbGxIZWlnaHQoKTtcblx0XHRjb25zdCBoZWlnaHRSYXRpbyA9IGNhbnZhc0hlaWdodCAvIG91dGVySGVpZ2h0O1xuXG5cdFx0Y29uc3QgbWluRGVjb3JhdGlvbkhlaWdodCA9IChDb25zdGFudHMuTUlOX0RFQ09SQVRJT05fSEVJR0hUICogdGhpcy5fc2V0dGluZ3MucGl4ZWxSYXRpbykgfCAwO1xuXHRcdGNvbnN0IGhhbGZNaW5EZWNvcmF0aW9uSGVpZ2h0ID0gKG1pbkRlY29yYXRpb25IZWlnaHQgLyAyKSB8IDA7XG5cblx0XHRjb25zdCBjYW52YXNDdHggPSB0aGlzLl9kb21Ob2RlLmRvbU5vZGUuZ2V0Q29udGV4dCgnMmQnKSE7XG5cdFx0aWYgKGJhY2tncm91bmRDb2xvcikge1xuXHRcdFx0aWYgKGJhY2tncm91bmRDb2xvci5pc09wYXF1ZSgpKSB7XG5cdFx0XHRcdC8vIFdlIGhhdmUgYSBiYWNrZ3JvdW5kIGNvbG9yIHdoaWNoIGlzIG9wYXF1ZSwgd2UgY2FuIGp1c3QgcGFpbnQgdGhlIGVudGlyZSBzdXJmYWNlIHdpdGggaXRcblx0XHRcdFx0Y2FudmFzQ3R4LmZpbGxTdHlsZSA9IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4QShiYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdFx0XHRjYW52YXNDdHguZmlsbFJlY3QoMCwgMCwgY2FudmFzV2lkdGgsIGNhbnZhc0hlaWdodCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBXZSBoYXZlIGEgYmFja2dyb3VuZCBjb2xvciB3aGljaCBpcyB0cmFuc3BhcmVudCwgd2UgbmVlZCB0byBmaXJzdCBjbGVhciB0aGUgc3VyZmFjZSBhbmRcblx0XHRcdFx0Ly8gdGhlbiBmaWxsIGl0XG5cdFx0XHRcdGNhbnZhc0N0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzV2lkdGgsIGNhbnZhc0hlaWdodCk7XG5cdFx0XHRcdGNhbnZhc0N0eC5maWxsU3R5bGUgPSBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoYmFja2dyb3VuZENvbG9yKTtcblx0XHRcdFx0Y2FudmFzQ3R4LmZpbGxSZWN0KDAsIDAsIGNhbnZhc1dpZHRoLCBjYW52YXNIZWlnaHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBXZSBkb24ndCBoYXZlIGEgYmFja2dyb3VuZCBjb2xvclxuXHRcdFx0Y2FudmFzQ3R4LmNsZWFyUmVjdCgwLCAwLCBjYW52YXNXaWR0aCwgY2FudmFzSGVpZ2h0KTtcblx0XHR9XG5cblx0XHRjb25zdCB4ID0gdGhpcy5fc2V0dGluZ3MueDtcblx0XHRjb25zdCB3ID0gdGhpcy5fc2V0dGluZ3MudztcblxuXG5cblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb25Hcm91cCBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0Y29uc3QgY29sb3IgPSBkZWNvcmF0aW9uR3JvdXAuY29sb3I7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uR3JvdXBEYXRhID0gZGVjb3JhdGlvbkdyb3VwLmRhdGE7XG5cblx0XHRcdGNhbnZhc0N0eC5maWxsU3R5bGUgPSBjb2xvcjtcblxuXHRcdFx0bGV0IHByZXZMYW5lID0gMDtcblx0XHRcdGxldCBwcmV2WTEgPSAwO1xuXHRcdFx0bGV0IHByZXZZMiA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZGVjb3JhdGlvbkdyb3VwRGF0YS5sZW5ndGggLyAzOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGFuZSA9IGRlY29yYXRpb25Hcm91cERhdGFbMyAqIGldO1xuXHRcdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBkZWNvcmF0aW9uR3JvdXBEYXRhWzMgKiBpICsgMV07XG5cdFx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBkZWNvcmF0aW9uR3JvdXBEYXRhWzMgKiBpICsgMl07XG5cblx0XHRcdFx0bGV0IHkxID0gKHZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKHN0YXJ0TGluZU51bWJlcikgKiBoZWlnaHRSYXRpbykgfCAwO1xuXHRcdFx0XHRsZXQgeTIgPSAoKHZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKGVuZExpbmVOdW1iZXIpICsgbGluZUhlaWdodCkgKiBoZWlnaHRSYXRpbykgfCAwO1xuXHRcdFx0XHRjb25zdCBoZWlnaHQgPSB5MiAtIHkxO1xuXHRcdFx0XHRpZiAoaGVpZ2h0IDwgbWluRGVjb3JhdGlvbkhlaWdodCkge1xuXHRcdFx0XHRcdGxldCB5Q2VudGVyID0gKCh5MSArIHkyKSAvIDIpIHwgMDtcblx0XHRcdFx0XHRpZiAoeUNlbnRlciA8IGhhbGZNaW5EZWNvcmF0aW9uSGVpZ2h0KSB7XG5cdFx0XHRcdFx0XHR5Q2VudGVyID0gaGFsZk1pbkRlY29yYXRpb25IZWlnaHQ7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh5Q2VudGVyICsgaGFsZk1pbkRlY29yYXRpb25IZWlnaHQgPiBjYW52YXNIZWlnaHQpIHtcblx0XHRcdFx0XHRcdHlDZW50ZXIgPSBjYW52YXNIZWlnaHQgLSBoYWxmTWluRGVjb3JhdGlvbkhlaWdodDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0eTEgPSB5Q2VudGVyIC0gaGFsZk1pbkRlY29yYXRpb25IZWlnaHQ7XG5cdFx0XHRcdFx0eTIgPSB5Q2VudGVyICsgaGFsZk1pbkRlY29yYXRpb25IZWlnaHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoeTEgPiBwcmV2WTIgKyAxIHx8IGxhbmUgIT09IHByZXZMYW5lKSB7XG5cdFx0XHRcdFx0Ly8gZmx1c2ggcHJldlxuXHRcdFx0XHRcdGlmIChpICE9PSAwKSB7XG5cdFx0XHRcdFx0XHRjYW52YXNDdHguZmlsbFJlY3QoeFtwcmV2TGFuZV0sIHByZXZZMSwgd1twcmV2TGFuZV0sIHByZXZZMiAtIHByZXZZMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHByZXZMYW5lID0gbGFuZTtcblx0XHRcdFx0XHRwcmV2WTEgPSB5MTtcblx0XHRcdFx0XHRwcmV2WTIgPSB5Mjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBtZXJnZSBpbnRvIHByZXZcblx0XHRcdFx0XHRpZiAoeTIgPiBwcmV2WTIpIHtcblx0XHRcdFx0XHRcdHByZXZZMiA9IHkyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2FudmFzQ3R4LmZpbGxSZWN0KHhbcHJldkxhbmVdLCBwcmV2WTEsIHdbcHJldkxhbmVdLCBwcmV2WTIgLSBwcmV2WTEpO1xuXHRcdH1cblxuXHRcdC8vIERyYXcgY3Vyc29yc1xuXHRcdGlmICghdGhpcy5fc2V0dGluZ3MuaGlkZUN1cnNvcikge1xuXHRcdFx0Y29uc3QgY3Vyc29ySGVpZ2h0ID0gKDIgKiB0aGlzLl9zZXR0aW5ncy5waXhlbFJhdGlvKSB8IDA7XG5cdFx0XHRjb25zdCBoYWxmQ3Vyc29ySGVpZ2h0ID0gKGN1cnNvckhlaWdodCAvIDIpIHwgMDtcblx0XHRcdGNvbnN0IGN1cnNvclggPSB0aGlzLl9zZXR0aW5ncy54W092ZXJ2aWV3UnVsZXJMYW5lLkZ1bGxdO1xuXHRcdFx0Y29uc3QgY3Vyc29yVyA9IHRoaXMuX3NldHRpbmdzLndbT3ZlcnZpZXdSdWxlckxhbmUuRnVsbF07XG5cblx0XHRcdGxldCBwcmV2WTEgPSAtMTAwO1xuXHRcdFx0bGV0IHByZXZZMiA9IC0xMDA7XG5cdFx0XHRsZXQgcHJldkNvbG9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl9jdXJzb3JQb3NpdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY29sb3IgPSB0aGlzLl9jdXJzb3JQb3NpdGlvbnNbaV0uY29sb3I7XG5cdFx0XHRcdGlmICghY29sb3IpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjdXJzb3IgPSB0aGlzLl9jdXJzb3JQb3NpdGlvbnNbaV0ucG9zaXRpb247XG5cblx0XHRcdFx0bGV0IHlDZW50ZXIgPSAodmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIoY3Vyc29yLmxpbmVOdW1iZXIpICogaGVpZ2h0UmF0aW8pIHwgMDtcblx0XHRcdFx0aWYgKHlDZW50ZXIgPCBoYWxmQ3Vyc29ySGVpZ2h0KSB7XG5cdFx0XHRcdFx0eUNlbnRlciA9IGhhbGZDdXJzb3JIZWlnaHQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoeUNlbnRlciArIGhhbGZDdXJzb3JIZWlnaHQgPiBjYW52YXNIZWlnaHQpIHtcblx0XHRcdFx0XHR5Q2VudGVyID0gY2FudmFzSGVpZ2h0IC0gaGFsZkN1cnNvckhlaWdodDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB5MSA9IHlDZW50ZXIgLSBoYWxmQ3Vyc29ySGVpZ2h0O1xuXHRcdFx0XHRjb25zdCB5MiA9IHkxICsgY3Vyc29ySGVpZ2h0O1xuXG5cdFx0XHRcdGlmICh5MSA+IHByZXZZMiArIDEgfHwgY29sb3IgIT09IHByZXZDb2xvcikge1xuXHRcdFx0XHRcdC8vIGZsdXNoIHByZXZcblx0XHRcdFx0XHRpZiAoaSAhPT0gMCAmJiBwcmV2Q29sb3IpIHtcblx0XHRcdFx0XHRcdGNhbnZhc0N0eC5maWxsUmVjdChjdXJzb3JYLCBwcmV2WTEsIGN1cnNvclcsIHByZXZZMiAtIHByZXZZMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHByZXZZMSA9IHkxO1xuXHRcdFx0XHRcdHByZXZZMiA9IHkyO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIG1lcmdlIGludG8gcHJldlxuXHRcdFx0XHRcdGlmICh5MiA+IHByZXZZMikge1xuXHRcdFx0XHRcdFx0cHJldlkyID0geTI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHByZXZDb2xvciA9IGNvbG9yO1xuXHRcdFx0XHRjYW52YXNDdHguZmlsbFN0eWxlID0gY29sb3I7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJldkNvbG9yKSB7XG5cdFx0XHRcdGNhbnZhc0N0eC5maWxsUmVjdChjdXJzb3JYLCBwcmV2WTEsIGN1cnNvclcsIHByZXZZMiAtIHByZXZZMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3NldHRpbmdzLnJlbmRlckJvcmRlciAmJiB0aGlzLl9zZXR0aW5ncy5ib3JkZXJDb2xvciAmJiB0aGlzLl9zZXR0aW5ncy5vdmVydmlld1J1bGVyTGFuZXMgPiAwKSB7XG5cdFx0XHRjYW52YXNDdHguYmVnaW5QYXRoKCk7XG5cdFx0XHRjYW52YXNDdHgubGluZVdpZHRoID0gMTtcblx0XHRcdGNhbnZhc0N0eC5zdHJva2VTdHlsZSA9IHRoaXMuX3NldHRpbmdzLmJvcmRlckNvbG9yO1xuXHRcdFx0Y2FudmFzQ3R4Lm1vdmVUbygwLCAwKTtcblx0XHRcdGNhbnZhc0N0eC5saW5lVG8oMCwgY2FudmFzSGVpZ2h0KTtcblx0XHRcdGNhbnZhc0N0eC5tb3ZlVG8oMSwgMCk7XG5cdFx0XHRjYW52YXNDdHgubGluZVRvKGNhbnZhc1dpZHRoLCAwKTtcblx0XHRcdGNhbnZhc0N0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QWdCLElBQUksS0FBSyxVQUFVLGFBQWM7QUFDdkQsWUFBTSxtQkFBb0IsZUFBZSxJQUFLO0FBQzlDLFlBQU0sVUFBVSxLQUFLLFVBQVUsRUFBRSxZQUFzQjtBQUN2RCxZQUFNLFVBQVUsS0FBSyxVQUFVLEVBQUUsWUFBc0I7QUFFdkQsVUFBSSxTQUFTO0FBQ2IsVUFBSSxTQUFTO0FBQ2IsVUFBSSxZQUEyQjtBQUMvQixlQUFTLElBQUksR0FBRyxNQUFNLEtBQUssaUJBQWlCLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDakUsY0FBTSxRQUFRLEtBQUssaUJBQWlCLENBQUMsRUFBRTtBQUN2QyxZQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsUUFDRDtBQUNBLGNBQU0sU0FBUyxLQUFLLGlCQUFpQixDQUFDLEVBQUU7QUFFeEMsWUFBSSxVQUFXLFdBQVcsK0JBQStCLE9BQU8sVUFBVSxJQUFJLGNBQWU7QUFDN0YsWUFBSSxVQUFVLGtCQUFrQjtBQUMvQixvQkFBVTtBQUFBLFFBQ1gsV0FBVyxVQUFVLG1CQUFtQixjQUFjO0FBQ3JELG9CQUFVLGVBQWU7QUFBQSxRQUMxQjtBQUNBLGNBQU0sS0FBSyxVQUFVO0FBQ3JCLGNBQU0sS0FBSyxLQUFLO0FBRWhCLFlBQUksS0FBSyxTQUFTLEtBQUssVUFBVSxXQUFXO0FBRTNDLGNBQUksTUFBTSxLQUFLLFdBQVc7QUFDekIsc0JBQVUsU0FBUyxTQUFTLFFBQVEsU0FBUyxTQUFTLE1BQU07QUFBQSxVQUM3RDtBQUNBLG1CQUFTO0FBQ1QsbUJBQVM7QUFBQSxRQUNWLE9BQU87QUFFTixjQUFJLEtBQUssUUFBUTtBQUNoQixxQkFBUztBQUFBLFVBQ1Y7QUFBQSxRQUNEO0FBQ0Esb0JBQVk7QUFDWixrQkFBVSxZQUFZO0FBQUEsTUFDdkI7QUFDQSxVQUFJLFdBQVc7QUFDZCxrQkFBVSxTQUFTLFNBQVMsUUFBUSxTQUFTLFNBQVMsTUFBTTtBQUFBLE1BQzdEO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxVQUFVLGdCQUFnQixLQUFLLFVBQVUsZUFBZSxLQUFLLFVBQVUscUJBQXFCLEdBQUc7QUFDdkcsZ0JBQVUsVUFBVTtBQUNwQixnQkFBVSxZQUFZO0FBQ3RCLGdCQUFVLGNBQWMsS0FBSyxVQUFVO0FBQ3ZDLGdCQUFVLE9BQU8sR0FBRyxDQUFDO0FBQ3JCLGdCQUFVLE9BQU8sR0FBRyxZQUFZO0FBQ2hDLGdCQUFVLE9BQU8sR0FBRyxDQUFDO0FBQ3JCLGdCQUFVLE9BQU8sYUFBYSxDQUFDO0FBQy9CLGdCQUFVLE9BQU87QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsiQ29uc3RhbnRzIiwgIk92ZXJ2aWV3UnVsZXJMYW5lIiwgIlNob3VsZFJlbmRlclZhbHVlIl0KfQo=
