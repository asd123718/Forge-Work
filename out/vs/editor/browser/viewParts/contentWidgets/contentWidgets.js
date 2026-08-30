import * as dom from "../../../../base/browser/dom.js";
import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import { ContentWidgetPositionPreference } from "../../editorBrowser.js";
import { PartFingerprint, PartFingerprints, ViewPart } from "../../view/viewPart.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { PositionAffinity } from "../../../common/model.js";
class ViewContentWidgets extends ViewPart {
  constructor(context, viewDomNode) {
    super(context);
    this._viewDomNode = viewDomNode;
    this._widgets = {};
    this.domNode = createFastDomNode(document.createElement("div"));
    PartFingerprints.write(this.domNode, PartFingerprint.ContentWidgets);
    this.domNode.setClassName("contentWidgets");
    this.domNode.setPosition("absolute");
    this.domNode.setTop(0);
    this.overflowingContentWidgetsDomNode = createFastDomNode(document.createElement("div"));
    PartFingerprints.write(this.overflowingContentWidgetsDomNode, PartFingerprint.OverflowingContentWidgets);
    this.overflowingContentWidgetsDomNode.setClassName("overflowingContentWidgets");
  }
  dispose() {
    super.dispose();
    this._widgets = {};
  }
  // --- begin event handlers
  onConfigurationChanged(e) {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].onConfigurationChanged(e);
    }
    return true;
  }
  onDecorationsChanged(e) {
    return true;
  }
  onFlushed(e) {
    return true;
  }
  onLineMappingChanged(e) {
    this._updateAnchorsViewPositions();
    return true;
  }
  onLinesChanged(e) {
    this._updateAnchorsViewPositions();
    return true;
  }
  onLinesDeleted(e) {
    this._updateAnchorsViewPositions();
    return true;
  }
  onLinesInserted(e) {
    this._updateAnchorsViewPositions();
    return true;
  }
  onScrollChanged(e) {
    return true;
  }
  onZonesChanged(e) {
    return true;
  }
  // ---- end view event handlers
  _updateAnchorsViewPositions() {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].updateAnchorViewPosition();
    }
  }
  addWidget(_widget) {
    const myWidget = new Widget(this._context, this._viewDomNode, _widget);
    this._widgets[myWidget.id] = myWidget;
    if (myWidget.allowEditorOverflow) {
      this.overflowingContentWidgetsDomNode.appendChild(myWidget.domNode);
    } else {
      this.domNode.appendChild(myWidget.domNode);
    }
    this.setShouldRender();
  }
  setWidgetPosition(widget, primaryAnchor, secondaryAnchor, preference, affinity) {
    const myWidget = this._widgets[widget.getId()];
    myWidget.setPosition(primaryAnchor, secondaryAnchor, preference, affinity);
    if (!myWidget.useDisplayNone) {
      this.setShouldRender();
    }
  }
  removeWidget(widget) {
    const widgetId = widget.getId();
    if (this._widgets.hasOwnProperty(widgetId)) {
      const myWidget = this._widgets[widgetId];
      delete this._widgets[widgetId];
      const domNode = myWidget.domNode.domNode;
      domNode.remove();
      domNode.removeAttribute("monaco-visible-content-widget");
      this.setShouldRender();
    }
  }
  shouldSuppressMouseDownOnWidget(widgetId) {
    if (this._widgets.hasOwnProperty(widgetId)) {
      return this._widgets[widgetId].suppressMouseDown;
    }
    return false;
  }
  onBeforeRender(viewportData) {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].onBeforeRender(viewportData);
    }
  }
  prepareRender(ctx) {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].prepareRender(ctx);
    }
  }
  render(ctx) {
    const keys = Object.keys(this._widgets);
    for (const widgetId of keys) {
      this._widgets[widgetId].render(ctx);
    }
  }
}
class Widget {
  constructor(context, viewDomNode, actual) {
    this._primaryAnchor = new PositionPair(null, null);
    this._secondaryAnchor = new PositionPair(null, null);
    this._context = context;
    this._viewDomNode = viewDomNode;
    this._actual = actual;
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const allowOverflow = options.get(EditorOption.allowOverflow);
    this.domNode = createFastDomNode(this._actual.getDomNode());
    this.id = this._actual.getId();
    this.allowEditorOverflow = (this._actual.allowEditorOverflow || false) && allowOverflow;
    this.suppressMouseDown = this._actual.suppressMouseDown || false;
    this.useDisplayNone = this._actual.useDisplayNone || false;
    this._fixedOverflowWidgets = options.get(EditorOption.fixedOverflowWidgets);
    this._contentWidth = layoutInfo.contentWidth;
    this._contentLeft = layoutInfo.contentLeft;
    this._affinity = null;
    this._preference = [];
    this._cachedDomNodeOffsetWidth = -1;
    this._cachedDomNodeOffsetHeight = -1;
    this._maxWidth = this._getMaxWidth();
    this._isVisible = false;
    this._renderData = null;
    this.domNode.setPosition(this._fixedOverflowWidgets && this.allowEditorOverflow ? "fixed" : "absolute");
    this.domNode.setDisplay("none");
    this.domNode.setVisibility("hidden");
    this.domNode.setAttribute("widgetId", this.id);
    this.domNode.setMaxWidth(this._maxWidth);
  }
  onConfigurationChanged(e) {
    const options = this._context.configuration.options;
    if (e.hasChanged(EditorOption.layoutInfo)) {
      const layoutInfo = options.get(EditorOption.layoutInfo);
      this._contentLeft = layoutInfo.contentLeft;
      this._contentWidth = layoutInfo.contentWidth;
      this._maxWidth = this._getMaxWidth();
    }
  }
  updateAnchorViewPosition() {
    this._setPosition(this._affinity, this._primaryAnchor.modelPosition, this._secondaryAnchor.modelPosition);
  }
  _setPosition(affinity, primaryAnchor, secondaryAnchor) {
    this._affinity = affinity;
    this._primaryAnchor = getValidPositionPair(primaryAnchor, this._context.viewModel, this._affinity);
    this._secondaryAnchor = getValidPositionPair(secondaryAnchor, this._context.viewModel, this._affinity);
    function getValidPositionPair(position, viewModel, affinity2) {
      if (!position) {
        return new PositionPair(null, null);
      }
      const validModelPosition = viewModel.model.validatePosition(position);
      if (viewModel.coordinatesConverter.modelPositionIsVisible(validModelPosition)) {
        const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(validModelPosition, affinity2 ?? void 0);
        return new PositionPair(position, viewPosition);
      }
      return new PositionPair(position, null);
    }
  }
  _getMaxWidth() {
    const elDocument = this.domNode.domNode.ownerDocument;
    const elWindow = elDocument.defaultView;
    return this.allowEditorOverflow ? elWindow?.innerWidth || elDocument.documentElement.offsetWidth || elDocument.body.offsetWidth : this._contentWidth;
  }
  setPosition(primaryAnchor, secondaryAnchor, preference, affinity) {
    this._setPosition(affinity, primaryAnchor, secondaryAnchor);
    this._preference = preference;
    if (!this.useDisplayNone && this._primaryAnchor.viewPosition && this._preference && this._preference.length > 0) {
      this.domNode.setDisplay("block");
    } else {
      this.domNode.setDisplay("none");
    }
    this._cachedDomNodeOffsetWidth = -1;
    this._cachedDomNodeOffsetHeight = -1;
  }
  _layoutBoxInViewport(anchor, width, height, ctx) {
    const aboveLineTop = anchor.top;
    const heightAvailableAboveLine = aboveLineTop;
    const underLineTop = anchor.top + anchor.height;
    const heightAvailableUnderLine = ctx.viewportHeight - underLineTop;
    const aboveTop = aboveLineTop - height;
    const fitsAbove = heightAvailableAboveLine >= height;
    const belowTop = underLineTop;
    const fitsBelow = heightAvailableUnderLine >= height;
    let left = anchor.left;
    if (left + width > ctx.scrollLeft + ctx.viewportWidth) {
      left = ctx.scrollLeft + ctx.viewportWidth - width;
    }
    if (left < ctx.scrollLeft) {
      left = ctx.scrollLeft;
    }
    return { fitsAbove, aboveTop, fitsBelow, belowTop, left };
  }
  _layoutHorizontalSegmentInPage(windowSize, domNodePosition, left, width) {
    const LEFT_PADDING = 15;
    const RIGHT_PADDING = 15;
    const MIN_LIMIT = Math.max(LEFT_PADDING, domNodePosition.left - width);
    const MAX_LIMIT = Math.min(domNodePosition.left + domNodePosition.width + width, windowSize.width - RIGHT_PADDING);
    const elDocument = this._viewDomNode.domNode.ownerDocument;
    const elWindow = elDocument.defaultView;
    let absoluteLeft = domNodePosition.left + left - (elWindow?.scrollX ?? 0);
    if (absoluteLeft + width > MAX_LIMIT) {
      const delta = absoluteLeft - (MAX_LIMIT - width);
      absoluteLeft -= delta;
      left -= delta;
    }
    if (absoluteLeft < MIN_LIMIT) {
      const delta = absoluteLeft - MIN_LIMIT;
      absoluteLeft -= delta;
      left -= delta;
    }
    return [left, absoluteLeft];
  }
  _layoutBoxInPage(anchor, width, height, ctx) {
    const aboveTop = anchor.top - height;
    const belowTop = anchor.top + anchor.height;
    const domNodePosition = dom.getDomNodePagePosition(this._viewDomNode.domNode);
    const elDocument = this._viewDomNode.domNode.ownerDocument;
    const elWindow = elDocument.defaultView;
    const absoluteAboveTop = domNodePosition.top + aboveTop - (elWindow?.scrollY ?? 0);
    const absoluteBelowTop = domNodePosition.top + belowTop - (elWindow?.scrollY ?? 0);
    const windowSize = dom.getClientArea(elDocument.body);
    const [left, absoluteAboveLeft] = this._layoutHorizontalSegmentInPage(windowSize, domNodePosition, anchor.left - ctx.scrollLeft + this._contentLeft, width);
    const TOP_PADDING = 22;
    const BOTTOM_PADDING = 22;
    const fitsAbove = absoluteAboveTop >= TOP_PADDING;
    const fitsBelow = absoluteBelowTop + height <= windowSize.height - BOTTOM_PADDING;
    if (this._fixedOverflowWidgets) {
      return {
        fitsAbove,
        aboveTop: Math.max(absoluteAboveTop, TOP_PADDING),
        fitsBelow,
        belowTop: absoluteBelowTop,
        left: absoluteAboveLeft
      };
    }
    return { fitsAbove, aboveTop, fitsBelow, belowTop, left };
  }
  _prepareRenderWidgetAtExactPositionOverflowing(topLeft) {
    return new Coordinate(topLeft.top, topLeft.left + this._contentLeft);
  }
  /**
   * Compute the coordinates above and below the primary and secondary anchors.
   * The content widget *must* touch the primary anchor.
   * The content widget should touch if possible the secondary anchor.
   */
  _getAnchorsCoordinates(ctx) {
    const primary = getCoordinates(this._primaryAnchor.viewPosition, this._affinity);
    const secondaryViewPosition = this._secondaryAnchor.viewPosition?.lineNumber === this._primaryAnchor.viewPosition?.lineNumber ? this._secondaryAnchor.viewPosition : null;
    const secondary = getCoordinates(secondaryViewPosition, this._affinity);
    return { primary, secondary };
    function getCoordinates(position, affinity) {
      if (!position) {
        return null;
      }
      const horizontalPosition = ctx.visibleRangeForPosition(position);
      if (!horizontalPosition) {
        return null;
      }
      const left = position.column === 1 && affinity === PositionAffinity.LeftOfInjectedText ? 0 : horizontalPosition.left;
      const top = ctx.getVerticalOffsetForLineNumber(position.lineNumber) - ctx.scrollTop;
      const lineHeight = ctx.getLineHeightForLineNumber(position.lineNumber);
      return new AnchorCoordinate(top, left, lineHeight);
    }
  }
  _reduceAnchorCoordinates(primary, secondary, width) {
    if (!secondary) {
      return primary;
    }
    const fontInfo = this._context.configuration.options.get(EditorOption.fontInfo);
    let left = secondary.left;
    if (left < primary.left) {
      left = Math.max(left, primary.left - width + fontInfo.typicalFullwidthCharacterWidth);
    } else {
      left = Math.min(left, primary.left + width - fontInfo.typicalFullwidthCharacterWidth);
    }
    return new AnchorCoordinate(primary.top, left, primary.height);
  }
  _prepareRenderWidget(ctx) {
    if (!this._preference || this._preference.length === 0) {
      return null;
    }
    const { primary, secondary } = this._getAnchorsCoordinates(ctx);
    if (!primary) {
      return {
        kind: "offViewport",
        preserveFocus: this.domNode.domNode.contains(this.domNode.domNode.ownerDocument.activeElement)
      };
    }
    if (this._cachedDomNodeOffsetWidth === -1 || this._cachedDomNodeOffsetHeight === -1) {
      let preferredDimensions = null;
      if (typeof this._actual.beforeRender === "function") {
        preferredDimensions = safeInvoke(this._actual.beforeRender, this._actual);
      }
      if (preferredDimensions) {
        this._cachedDomNodeOffsetWidth = preferredDimensions.width;
        this._cachedDomNodeOffsetHeight = preferredDimensions.height;
      } else {
        const domNode = this.domNode.domNode;
        const clientRect = domNode.getBoundingClientRect();
        this._cachedDomNodeOffsetWidth = Math.round(clientRect.width);
        this._cachedDomNodeOffsetHeight = Math.round(clientRect.height);
      }
    }
    const anchor = this._reduceAnchorCoordinates(primary, secondary, this._cachedDomNodeOffsetWidth);
    let placement;
    if (this.allowEditorOverflow) {
      placement = this._layoutBoxInPage(anchor, this._cachedDomNodeOffsetWidth, this._cachedDomNodeOffsetHeight, ctx);
    } else {
      placement = this._layoutBoxInViewport(anchor, this._cachedDomNodeOffsetWidth, this._cachedDomNodeOffsetHeight, ctx);
    }
    for (let pass = 1; pass <= 2; pass++) {
      for (const pref of this._preference) {
        if (pref === ContentWidgetPositionPreference.ABOVE) {
          if (!placement) {
            return null;
          }
          if (pass === 2 || placement.fitsAbove) {
            return {
              kind: "inViewport",
              coordinate: new Coordinate(placement.aboveTop, placement.left),
              position: ContentWidgetPositionPreference.ABOVE
            };
          }
        } else if (pref === ContentWidgetPositionPreference.BELOW) {
          if (!placement) {
            return null;
          }
          if (pass === 2 || placement.fitsBelow) {
            return {
              kind: "inViewport",
              coordinate: new Coordinate(placement.belowTop, placement.left),
              position: ContentWidgetPositionPreference.BELOW
            };
          }
        } else {
          if (this.allowEditorOverflow) {
            return {
              kind: "inViewport",
              coordinate: this._prepareRenderWidgetAtExactPositionOverflowing(new Coordinate(anchor.top, anchor.left)),
              position: ContentWidgetPositionPreference.EXACT
            };
          } else {
            return {
              kind: "inViewport",
              coordinate: new Coordinate(anchor.top, anchor.left),
              position: ContentWidgetPositionPreference.EXACT
            };
          }
        }
      }
    }
    return null;
  }
  /**
   * On this first pass, we ensure that the content widget (if it is in the viewport) has the max width set correctly.
   */
  onBeforeRender(viewportData) {
    if (!this._primaryAnchor.viewPosition || !this._preference) {
      return;
    }
    if (this._primaryAnchor.viewPosition.lineNumber < viewportData.startLineNumber || this._primaryAnchor.viewPosition.lineNumber > viewportData.endLineNumber) {
      return;
    }
    this.domNode.setMaxWidth(this._maxWidth);
  }
  prepareRender(ctx) {
    this._renderData = this._prepareRenderWidget(ctx);
  }
  render(ctx) {
    if (!this._renderData || this._renderData.kind === "offViewport") {
      if (this._isVisible) {
        this.domNode.removeAttribute("monaco-visible-content-widget");
        this._isVisible = false;
        if (this._renderData?.kind === "offViewport" && this._renderData.preserveFocus) {
          this.domNode.setTop(-1e3);
        } else {
          this.domNode.setVisibility("hidden");
        }
      }
      if (typeof this._actual.afterRender === "function") {
        safeInvoke(this._actual.afterRender, this._actual, null, null);
      }
      return;
    }
    if (this.allowEditorOverflow) {
      this.domNode.setTop(this._renderData.coordinate.top);
      this.domNode.setLeft(this._renderData.coordinate.left);
    } else {
      this.domNode.setTop(this._renderData.coordinate.top + ctx.scrollTop - ctx.bigNumbersDelta);
      this.domNode.setLeft(this._renderData.coordinate.left);
    }
    if (!this._isVisible) {
      this.domNode.setVisibility("inherit");
      this.domNode.setAttribute("monaco-visible-content-widget", "true");
      this._isVisible = true;
    }
    if (typeof this._actual.afterRender === "function") {
      safeInvoke(this._actual.afterRender, this._actual, this._renderData.position, this._renderData.coordinate);
    }
  }
}
class PositionPair {
  constructor(modelPosition, viewPosition) {
    this.modelPosition = modelPosition;
    this.viewPosition = viewPosition;
  }
}
class Coordinate {
  constructor(top, left) {
    this.top = top;
    this.left = left;
    this._coordinateBrand = void 0;
  }
}
class AnchorCoordinate {
  constructor(top, left, height) {
    this.top = top;
    this.left = left;
    this.height = height;
    this._anchorCoordinateBrand = void 0;
  }
}
function safeInvoke(fn, thisArg, ...args) {
  try {
    return fn.call(thisArg, ...args);
  } catch {
    return null;
  }
}
export {
  ViewContentWidgets
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXdQYXJ0c1xcY29udGVudFdpZGdldHNcXGNvbnRlbnRXaWRnZXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRmFzdERvbU5vZGUsIGNyZWF0ZUZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFJlbmRlcmVkQ29vcmRpbmF0ZSB9IGZyb20gJy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgUGFydEZpbmdlcnByaW50LCBQYXJ0RmluZ2VycHJpbnRzLCBWaWV3UGFydCB9IGZyb20gJy4uLy4uL3ZpZXcvdmlld1BhcnQuanMnO1xuaW1wb3J0IHsgUmVuZGVyaW5nQ29udGV4dCwgUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQgfSBmcm9tICcuLi8uLi92aWV3L3JlbmRlcmluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCAqIGFzIHZpZXdFdmVudHMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgVmlld3BvcnREYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvdmlld0xpbmVzVmlld3BvcnREYXRhLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvZGltZW5zaW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uQWZmaW5pdHkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcblxuLyoqXG4gKiBUaGlzIHZpZXcgcGFydCBpcyByZXNwb25zaWJsZSBmb3IgcmVuZGVyaW5nIHRoZSBjb250ZW50IHdpZGdldHMsIHdoaWNoIGFyZVxuICogdXNlZCBmb3IgcmVuZGVyaW5nIGVsZW1lbnRzIHRoYXQgYXJlIGFzc29jaWF0ZWQgdG8gYW4gZWRpdG9yIHBvc2l0aW9uLFxuICogc3VjaCBhcyBzdWdnZXN0aW9ucyBvciB0aGUgcGFyYW1ldGVyIGhpbnRzLlxuICovXG5leHBvcnQgY2xhc3MgVmlld0NvbnRlbnRXaWRnZXRzIGV4dGVuZHMgVmlld1BhcnQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdEb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHByaXZhdGUgX3dpZGdldHM6IHsgW2tleTogc3RyaW5nXTogV2lkZ2V0IH07XG5cblx0cHVibGljIGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pjtcblx0cHVibGljIG92ZXJmbG93aW5nQ29udGVudFdpZGdldHNEb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogVmlld0NvbnRleHQsIHZpZXdEb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4pIHtcblx0XHRzdXBlcihjb250ZXh0KTtcblx0XHR0aGlzLl92aWV3RG9tTm9kZSA9IHZpZXdEb21Ob2RlO1xuXHRcdHRoaXMuX3dpZGdldHMgPSB7fTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRQYXJ0RmluZ2VycHJpbnRzLndyaXRlKHRoaXMuZG9tTm9kZSwgUGFydEZpbmdlcnByaW50LkNvbnRlbnRXaWRnZXRzKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0Q2xhc3NOYW1lKCdjb250ZW50V2lkZ2V0cycpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRQb3NpdGlvbignYWJzb2x1dGUnKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0VG9wKDApO1xuXG5cdFx0dGhpcy5vdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzRG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRQYXJ0RmluZ2VycHJpbnRzLndyaXRlKHRoaXMub3ZlcmZsb3dpbmdDb250ZW50V2lkZ2V0c0RvbU5vZGUsIFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzKTtcblx0XHR0aGlzLm92ZXJmbG93aW5nQ29udGVudFdpZGdldHNEb21Ob2RlLnNldENsYXNzTmFtZSgnb3ZlcmZsb3dpbmdDb250ZW50V2lkZ2V0cycpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3dpZGdldHMgPSB7fTtcblx0fVxuXG5cdC8vIC0tLSBiZWdpbiBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5fd2lkZ2V0cyk7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXRJZCBvZiBrZXlzKSB7XG5cdFx0XHR0aGlzLl93aWRnZXRzW3dpZGdldElkXS5vbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25EZWNvcmF0aW9uc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHQvLyB0cnVlIGZvciBpbmxpbmUgZGVjb3JhdGlvbnMgdGhhdCBjYW4gZW5kIHVwIHJlbGF5b3V0aW5nIHRleHRcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25GbHVzaGVkKGU6IHZpZXdFdmVudHMuVmlld0ZsdXNoZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVNYXBwaW5nQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lTWFwcGluZ0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX3VwZGF0ZUFuY2hvcnNWaWV3UG9zaXRpb25zKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uTGluZXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fdXBkYXRlQW5jaG9yc1ZpZXdQb3NpdGlvbnMoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0RlbGV0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl91cGRhdGVBbmNob3JzVmlld1Bvc2l0aW9ucygpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzSW5zZXJ0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fdXBkYXRlQW5jaG9yc1ZpZXdQb3NpdGlvbnMoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25TY3JvbGxDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld1Njcm9sbENoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblpvbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdab25lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gLS0tLSBlbmQgdmlldyBldmVudCBoYW5kbGVyc1xuXG5cdHByaXZhdGUgX3VwZGF0ZUFuY2hvcnNWaWV3UG9zaXRpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl93aWRnZXRzKTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldElkIG9mIGtleXMpIHtcblx0XHRcdHRoaXMuX3dpZGdldHNbd2lkZ2V0SWRdLnVwZGF0ZUFuY2hvclZpZXdQb3NpdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhZGRXaWRnZXQoX3dpZGdldDogSUNvbnRlbnRXaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCBteVdpZGdldCA9IG5ldyBXaWRnZXQodGhpcy5fY29udGV4dCwgdGhpcy5fdmlld0RvbU5vZGUsIF93aWRnZXQpO1xuXHRcdHRoaXMuX3dpZGdldHNbbXlXaWRnZXQuaWRdID0gbXlXaWRnZXQ7XG5cblx0XHRpZiAobXlXaWRnZXQuYWxsb3dFZGl0b3JPdmVyZmxvdykge1xuXHRcdFx0dGhpcy5vdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzRG9tTm9kZS5hcHBlbmRDaGlsZChteVdpZGdldC5kb21Ob2RlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKG15V2lkZ2V0LmRvbU5vZGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0U2hvdWxkUmVuZGVyKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0V2lkZ2V0UG9zaXRpb24od2lkZ2V0OiBJQ29udGVudFdpZGdldCwgcHJpbWFyeUFuY2hvcjogSVBvc2l0aW9uIHwgbnVsbCwgc2Vjb25kYXJ5QW5jaG9yOiBJUG9zaXRpb24gfCBudWxsLCBwcmVmZXJlbmNlOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlW10gfCBudWxsLCBhZmZpbml0eTogUG9zaXRpb25BZmZpbml0eSB8IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCBteVdpZGdldCA9IHRoaXMuX3dpZGdldHNbd2lkZ2V0LmdldElkKCldO1xuXHRcdG15V2lkZ2V0LnNldFBvc2l0aW9uKHByaW1hcnlBbmNob3IsIHNlY29uZGFyeUFuY2hvciwgcHJlZmVyZW5jZSwgYWZmaW5pdHkpO1xuXG5cdFx0aWYgKCFteVdpZGdldC51c2VEaXNwbGF5Tm9uZSkge1xuXHRcdFx0dGhpcy5zZXRTaG91bGRSZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlV2lkZ2V0KHdpZGdldDogSUNvbnRlbnRXaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRJZCA9IHdpZGdldC5nZXRJZCgpO1xuXHRcdGlmICh0aGlzLl93aWRnZXRzLmhhc093blByb3BlcnR5KHdpZGdldElkKSkge1xuXHRcdFx0Y29uc3QgbXlXaWRnZXQgPSB0aGlzLl93aWRnZXRzW3dpZGdldElkXTtcblx0XHRcdGRlbGV0ZSB0aGlzLl93aWRnZXRzW3dpZGdldElkXTtcblxuXHRcdFx0Y29uc3QgZG9tTm9kZSA9IG15V2lkZ2V0LmRvbU5vZGUuZG9tTm9kZTtcblx0XHRcdGRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHRkb21Ob2RlLnJlbW92ZUF0dHJpYnV0ZSgnbW9uYWNvLXZpc2libGUtY29udGVudC13aWRnZXQnKTtcblxuXHRcdFx0dGhpcy5zZXRTaG91bGRSZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2hvdWxkU3VwcHJlc3NNb3VzZURvd25PbldpZGdldCh3aWRnZXRJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldHMuaGFzT3duUHJvcGVydHkod2lkZ2V0SWQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0c1t3aWRnZXRJZF0uc3VwcHJlc3NNb3VzZURvd247XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBvbkJlZm9yZVJlbmRlcih2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl93aWRnZXRzKTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldElkIG9mIGtleXMpIHtcblx0XHRcdHRoaXMuX3dpZGdldHNbd2lkZ2V0SWRdLm9uQmVmb3JlUmVuZGVyKHZpZXdwb3J0RGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHByZXBhcmVSZW5kZXIoY3R4OiBSZW5kZXJpbmdDb250ZXh0KTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHRoaXMuX3dpZGdldHMpO1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0SWQgb2Yga2V5cykge1xuXHRcdFx0dGhpcy5fd2lkZ2V0c1t3aWRnZXRJZF0ucHJlcGFyZVJlbmRlcihjdHgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoY3R4OiBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl93aWRnZXRzKTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldElkIG9mIGtleXMpIHtcblx0XHRcdHRoaXMuX3dpZGdldHNbd2lkZ2V0SWRdLnJlbmRlcihjdHgpO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSUJveExheW91dFJlc3VsdCB7XG5cdGZpdHNBYm92ZTogYm9vbGVhbjtcblx0YWJvdmVUb3A6IG51bWJlcjtcblxuXHRmaXRzQmVsb3c6IGJvb2xlYW47XG5cdGJlbG93VG9wOiBudW1iZXI7XG5cblx0bGVmdDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSU9mZlZpZXdwb3J0UmVuZGVyRGF0YSB7XG5cdGtpbmQ6ICdvZmZWaWV3cG9ydCc7XG5cdHByZXNlcnZlRm9jdXM6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJSW5WaWV3cG9ydFJlbmRlckRhdGEge1xuXHRraW5kOiAnaW5WaWV3cG9ydCc7XG5cdGNvb3JkaW5hdGU6IENvb3JkaW5hdGU7XG5cdHBvc2l0aW9uOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlO1xufVxuXG50eXBlIElSZW5kZXJEYXRhID0gSUluVmlld3BvcnRSZW5kZXJEYXRhIHwgSU9mZlZpZXdwb3J0UmVuZGVyRGF0YTtcblxuY2xhc3MgV2lkZ2V0IHtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dDogVmlld0NvbnRleHQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdEb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdHVhbDogSUNvbnRlbnRXaWRnZXQ7XG5cblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50Pjtcblx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBhbGxvd0VkaXRvck92ZXJmbG93OiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3VwcHJlc3NNb3VzZURvd246IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZml4ZWRPdmVyZmxvd1dpZGdldHM6IGJvb2xlYW47XG5cdHByaXZhdGUgX2NvbnRlbnRXaWR0aDogbnVtYmVyO1xuXHRwcml2YXRlIF9jb250ZW50TGVmdDogbnVtYmVyO1xuXG5cdHByaXZhdGUgX3ByaW1hcnlBbmNob3I6IFBvc2l0aW9uUGFpciA9IG5ldyBQb3NpdGlvblBhaXIobnVsbCwgbnVsbCk7XG5cdHByaXZhdGUgX3NlY29uZGFyeUFuY2hvcjogUG9zaXRpb25QYWlyID0gbmV3IFBvc2l0aW9uUGFpcihudWxsLCBudWxsKTtcblx0cHJpdmF0ZSBfYWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkgfCBudWxsO1xuXHRwcml2YXRlIF9wcmVmZXJlbmNlOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlW10gfCBudWxsO1xuXHRwcml2YXRlIF9jYWNoZWREb21Ob2RlT2Zmc2V0V2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBfY2FjaGVkRG9tTm9kZU9mZnNldEhlaWdodDogbnVtYmVyO1xuXHRwcml2YXRlIF9tYXhXaWR0aDogbnVtYmVyO1xuXHRwcml2YXRlIF9pc1Zpc2libGU6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBfcmVuZGVyRGF0YTogSVJlbmRlckRhdGEgfCBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgdXNlRGlzcGxheU5vbmU6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogVmlld0NvbnRleHQsIHZpZXdEb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4sIGFjdHVhbDogSUNvbnRlbnRXaWRnZXQpIHtcblx0XHR0aGlzLl9jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLl92aWV3RG9tTm9kZSA9IHZpZXdEb21Ob2RlO1xuXHRcdHRoaXMuX2FjdHVhbCA9IGFjdHVhbDtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXHRcdGNvbnN0IGFsbG93T3ZlcmZsb3cgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uYWxsb3dPdmVyZmxvdyk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBjcmVhdGVGYXN0RG9tTm9kZSh0aGlzLl9hY3R1YWwuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLmlkID0gdGhpcy5fYWN0dWFsLmdldElkKCk7XG5cdFx0dGhpcy5hbGxvd0VkaXRvck92ZXJmbG93ID0gKHRoaXMuX2FjdHVhbC5hbGxvd0VkaXRvck92ZXJmbG93IHx8IGZhbHNlKSAmJiBhbGxvd092ZXJmbG93O1xuXHRcdHRoaXMuc3VwcHJlc3NNb3VzZURvd24gPSB0aGlzLl9hY3R1YWwuc3VwcHJlc3NNb3VzZURvd24gfHwgZmFsc2U7XG5cdFx0dGhpcy51c2VEaXNwbGF5Tm9uZSA9IHRoaXMuX2FjdHVhbC51c2VEaXNwbGF5Tm9uZSB8fCBmYWxzZTtcblxuXHRcdHRoaXMuX2ZpeGVkT3ZlcmZsb3dXaWRnZXRzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZpeGVkT3ZlcmZsb3dXaWRnZXRzKTtcblx0XHR0aGlzLl9jb250ZW50V2lkdGggPSBsYXlvdXRJbmZvLmNvbnRlbnRXaWR0aDtcblx0XHR0aGlzLl9jb250ZW50TGVmdCA9IGxheW91dEluZm8uY29udGVudExlZnQ7XG5cblx0XHR0aGlzLl9hZmZpbml0eSA9IG51bGw7XG5cdFx0dGhpcy5fcHJlZmVyZW5jZSA9IFtdO1xuXHRcdHRoaXMuX2NhY2hlZERvbU5vZGVPZmZzZXRXaWR0aCA9IC0xO1xuXHRcdHRoaXMuX2NhY2hlZERvbU5vZGVPZmZzZXRIZWlnaHQgPSAtMTtcblx0XHR0aGlzLl9tYXhXaWR0aCA9IHRoaXMuX2dldE1heFdpZHRoKCk7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5fcmVuZGVyRGF0YSA9IG51bGw7XG5cblx0XHR0aGlzLmRvbU5vZGUuc2V0UG9zaXRpb24oKHRoaXMuX2ZpeGVkT3ZlcmZsb3dXaWRnZXRzICYmIHRoaXMuYWxsb3dFZGl0b3JPdmVyZmxvdykgPyAnZml4ZWQnIDogJ2Fic29sdXRlJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldERpc3BsYXkoJ25vbmUnKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0VmlzaWJpbGl0eSgnaGlkZGVuJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnd2lkZ2V0SWQnLCB0aGlzLmlkKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0TWF4V2lkdGgodGhpcy5fbWF4V2lkdGgpO1xuXHR9XG5cblx0cHVibGljIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKSkge1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRcdHRoaXMuX2NvbnRlbnRMZWZ0ID0gbGF5b3V0SW5mby5jb250ZW50TGVmdDtcblx0XHRcdHRoaXMuX2NvbnRlbnRXaWR0aCA9IGxheW91dEluZm8uY29udGVudFdpZHRoO1xuXHRcdFx0dGhpcy5fbWF4V2lkdGggPSB0aGlzLl9nZXRNYXhXaWR0aCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVBbmNob3JWaWV3UG9zaXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0UG9zaXRpb24odGhpcy5fYWZmaW5pdHksIHRoaXMuX3ByaW1hcnlBbmNob3IubW9kZWxQb3NpdGlvbiwgdGhpcy5fc2Vjb25kYXJ5QW5jaG9yLm1vZGVsUG9zaXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0UG9zaXRpb24oYWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkgfCBudWxsLCBwcmltYXJ5QW5jaG9yOiBJUG9zaXRpb24gfCBudWxsLCBzZWNvbmRhcnlBbmNob3I6IElQb3NpdGlvbiB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9hZmZpbml0eSA9IGFmZmluaXR5O1xuXHRcdHRoaXMuX3ByaW1hcnlBbmNob3IgPSBnZXRWYWxpZFBvc2l0aW9uUGFpcihwcmltYXJ5QW5jaG9yLCB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbCwgdGhpcy5fYWZmaW5pdHkpO1xuXHRcdHRoaXMuX3NlY29uZGFyeUFuY2hvciA9IGdldFZhbGlkUG9zaXRpb25QYWlyKHNlY29uZGFyeUFuY2hvciwgdGhpcy5fY29udGV4dC52aWV3TW9kZWwsIHRoaXMuX2FmZmluaXR5KTtcblxuXHRcdGZ1bmN0aW9uIGdldFZhbGlkUG9zaXRpb25QYWlyKHBvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsLCB2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5IHwgbnVsbCk6IFBvc2l0aW9uUGFpciB7XG5cdFx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUG9zaXRpb25QYWlyKG51bGwsIG51bGwpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRG8gbm90IHRydXN0IHRoYXQgd2lkZ2V0cyBnaXZlIGEgdmFsaWQgcG9zaXRpb25cblx0XHRcdGNvbnN0IHZhbGlkTW9kZWxQb3NpdGlvbiA9IHZpZXdNb2RlbC5tb2RlbC52YWxpZGF0ZVBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdGlmICh2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIubW9kZWxQb3NpdGlvbklzVmlzaWJsZSh2YWxpZE1vZGVsUG9zaXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKHZhbGlkTW9kZWxQb3NpdGlvbiwgYWZmaW5pdHkgPz8gdW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvblBhaXIocG9zaXRpb24sIHZpZXdQb3NpdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uUGFpcihwb3NpdGlvbiwgbnVsbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TWF4V2lkdGgoKTogbnVtYmVyIHtcblx0XHRjb25zdCBlbERvY3VtZW50ID0gdGhpcy5kb21Ob2RlLmRvbU5vZGUub3duZXJEb2N1bWVudDtcblx0XHRjb25zdCBlbFdpbmRvdyA9IGVsRG9jdW1lbnQuZGVmYXVsdFZpZXc7XG5cdFx0cmV0dXJuIChcblx0XHRcdHRoaXMuYWxsb3dFZGl0b3JPdmVyZmxvd1xuXHRcdFx0XHQ/IGVsV2luZG93Py5pbm5lcldpZHRoIHx8IGVsRG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50Lm9mZnNldFdpZHRoIHx8IGVsRG9jdW1lbnQuYm9keS5vZmZzZXRXaWR0aFxuXHRcdFx0XHQ6IHRoaXMuX2NvbnRlbnRXaWR0aFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0UG9zaXRpb24ocHJpbWFyeUFuY2hvcjogSVBvc2l0aW9uIHwgbnVsbCwgc2Vjb25kYXJ5QW5jaG9yOiBJUG9zaXRpb24gfCBudWxsLCBwcmVmZXJlbmNlOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlW10gfCBudWxsLCBhZmZpbml0eTogUG9zaXRpb25BZmZpbml0eSB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRQb3NpdGlvbihhZmZpbml0eSwgcHJpbWFyeUFuY2hvciwgc2Vjb25kYXJ5QW5jaG9yKTtcblx0XHR0aGlzLl9wcmVmZXJlbmNlID0gcHJlZmVyZW5jZTtcblx0XHRpZiAoIXRoaXMudXNlRGlzcGxheU5vbmUgJiYgdGhpcy5fcHJpbWFyeUFuY2hvci52aWV3UG9zaXRpb24gJiYgdGhpcy5fcHJlZmVyZW5jZSAmJiB0aGlzLl9wcmVmZXJlbmNlLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIHRoaXMgY29udGVudCB3aWRnZXQgd291bGQgbGlrZSB0byBiZSB2aXNpYmxlIGlmIHBvc3NpYmxlXG5cdFx0XHQvLyB3ZSBjaGFuZ2UgaXQgZnJvbSBgZGlzcGxheTpub25lYCB0byBgZGlzcGxheTpibG9ja2AgZXZlbiBpZiBpdFxuXHRcdFx0Ly8gbWlnaHQgYmUgb3V0c2lkZSB0aGUgdmlld3BvcnQgc3VjaCB0aGF0IHdlIGNhbiBtZWFzdXJlIGl0cyBzaXplXG5cdFx0XHQvLyBpbiBgcHJlcGFyZVJlbmRlcmBcblx0XHRcdHRoaXMuZG9tTm9kZS5zZXREaXNwbGF5KCdibG9jaycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc2V0RGlzcGxheSgnbm9uZScpO1xuXHRcdH1cblx0XHR0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0V2lkdGggPSAtMTtcblx0XHR0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0SGVpZ2h0ID0gLTE7XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRCb3hJblZpZXdwb3J0KGFuY2hvcjogQW5jaG9yQ29vcmRpbmF0ZSwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IElCb3hMYXlvdXRSZXN1bHQge1xuXHRcdC8vIE91ciB2aXNpYmxlIGJveCBpcyBzcGxpdCBob3Jpem9udGFsbHkgYnkgdGhlIGN1cnJlbnQgbGluZSA9PiAyIGJveGVzXG5cblx0XHQvLyBhKSB0aGUgYm94IGFib3ZlIHRoZSBsaW5lXG5cdFx0Y29uc3QgYWJvdmVMaW5lVG9wID0gYW5jaG9yLnRvcDtcblx0XHRjb25zdCBoZWlnaHRBdmFpbGFibGVBYm92ZUxpbmUgPSBhYm92ZUxpbmVUb3A7XG5cblx0XHQvLyBiKSB0aGUgYm94IHVuZGVyIHRoZSBsaW5lXG5cdFx0Y29uc3QgdW5kZXJMaW5lVG9wID0gYW5jaG9yLnRvcCArIGFuY2hvci5oZWlnaHQ7XG5cdFx0Y29uc3QgaGVpZ2h0QXZhaWxhYmxlVW5kZXJMaW5lID0gY3R4LnZpZXdwb3J0SGVpZ2h0IC0gdW5kZXJMaW5lVG9wO1xuXG5cdFx0Y29uc3QgYWJvdmVUb3AgPSBhYm92ZUxpbmVUb3AgLSBoZWlnaHQ7XG5cdFx0Y29uc3QgZml0c0Fib3ZlID0gKGhlaWdodEF2YWlsYWJsZUFib3ZlTGluZSA+PSBoZWlnaHQpO1xuXHRcdGNvbnN0IGJlbG93VG9wID0gdW5kZXJMaW5lVG9wO1xuXHRcdGNvbnN0IGZpdHNCZWxvdyA9IChoZWlnaHRBdmFpbGFibGVVbmRlckxpbmUgPj0gaGVpZ2h0KTtcblxuXHRcdC8vIEFuZCBpdHMgbGVmdFxuXHRcdGxldCBsZWZ0ID0gYW5jaG9yLmxlZnQ7XG5cdFx0aWYgKGxlZnQgKyB3aWR0aCA+IGN0eC5zY3JvbGxMZWZ0ICsgY3R4LnZpZXdwb3J0V2lkdGgpIHtcblx0XHRcdGxlZnQgPSBjdHguc2Nyb2xsTGVmdCArIGN0eC52aWV3cG9ydFdpZHRoIC0gd2lkdGg7XG5cdFx0fVxuXHRcdGlmIChsZWZ0IDwgY3R4LnNjcm9sbExlZnQpIHtcblx0XHRcdGxlZnQgPSBjdHguc2Nyb2xsTGVmdDtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBmaXRzQWJvdmUsIGFib3ZlVG9wLCBmaXRzQmVsb3csIGJlbG93VG9wLCBsZWZ0IH07XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRIb3Jpem9udGFsU2VnbWVudEluUGFnZSh3aW5kb3dTaXplOiBkb20uRGltZW5zaW9uLCBkb21Ob2RlUG9zaXRpb246IGRvbS5JRG9tTm9kZVBhZ2VQb3NpdGlvbiwgbGVmdDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogW251bWJlciwgbnVtYmVyXSB7XG5cdFx0Ly8gTGVhdmUgc29tZSBjbGVhcmFuY2UgdG8gdGhlIGxlZnQvcmlnaHRcblx0XHRjb25zdCBMRUZUX1BBRERJTkcgPSAxNTtcblx0XHRjb25zdCBSSUdIVF9QQURESU5HID0gMTU7XG5cblx0XHQvLyBJbml0aWFsbHksIHRoZSBsaW1pdHMgYXJlIGRlZmluZWQgYXMgdGhlIGRvbSBub2RlIGxpbWl0c1xuXHRcdGNvbnN0IE1JTl9MSU1JVCA9IE1hdGgubWF4KExFRlRfUEFERElORywgZG9tTm9kZVBvc2l0aW9uLmxlZnQgLSB3aWR0aCk7XG5cdFx0Y29uc3QgTUFYX0xJTUlUID0gTWF0aC5taW4oZG9tTm9kZVBvc2l0aW9uLmxlZnQgKyBkb21Ob2RlUG9zaXRpb24ud2lkdGggKyB3aWR0aCwgd2luZG93U2l6ZS53aWR0aCAtIFJJR0hUX1BBRERJTkcpO1xuXG5cdFx0Y29uc3QgZWxEb2N1bWVudCA9IHRoaXMuX3ZpZXdEb21Ob2RlLmRvbU5vZGUub3duZXJEb2N1bWVudDtcblx0XHRjb25zdCBlbFdpbmRvdyA9IGVsRG9jdW1lbnQuZGVmYXVsdFZpZXc7XG5cdFx0bGV0IGFic29sdXRlTGVmdCA9IGRvbU5vZGVQb3NpdGlvbi5sZWZ0ICsgbGVmdCAtIChlbFdpbmRvdz8uc2Nyb2xsWCA/PyAwKTtcblxuXHRcdGlmIChhYnNvbHV0ZUxlZnQgKyB3aWR0aCA+IE1BWF9MSU1JVCkge1xuXHRcdFx0Y29uc3QgZGVsdGEgPSBhYnNvbHV0ZUxlZnQgLSAoTUFYX0xJTUlUIC0gd2lkdGgpO1xuXHRcdFx0YWJzb2x1dGVMZWZ0IC09IGRlbHRhO1xuXHRcdFx0bGVmdCAtPSBkZWx0YTtcblx0XHR9XG5cblx0XHRpZiAoYWJzb2x1dGVMZWZ0IDwgTUlOX0xJTUlUKSB7XG5cdFx0XHRjb25zdCBkZWx0YSA9IGFic29sdXRlTGVmdCAtIE1JTl9MSU1JVDtcblx0XHRcdGFic29sdXRlTGVmdCAtPSBkZWx0YTtcblx0XHRcdGxlZnQgLT0gZGVsdGE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtsZWZ0LCBhYnNvbHV0ZUxlZnRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Qm94SW5QYWdlKGFuY2hvcjogQW5jaG9yQ29vcmRpbmF0ZSwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IElCb3hMYXlvdXRSZXN1bHQgfCBudWxsIHtcblx0XHRjb25zdCBhYm92ZVRvcCA9IGFuY2hvci50b3AgLSBoZWlnaHQ7XG5cdFx0Y29uc3QgYmVsb3dUb3AgPSBhbmNob3IudG9wICsgYW5jaG9yLmhlaWdodDtcblxuXHRcdGNvbnN0IGRvbU5vZGVQb3NpdGlvbiA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuX3ZpZXdEb21Ob2RlLmRvbU5vZGUpO1xuXHRcdGNvbnN0IGVsRG9jdW1lbnQgPSB0aGlzLl92aWV3RG9tTm9kZS5kb21Ob2RlLm93bmVyRG9jdW1lbnQ7XG5cdFx0Y29uc3QgZWxXaW5kb3cgPSBlbERvY3VtZW50LmRlZmF1bHRWaWV3O1xuXHRcdGNvbnN0IGFic29sdXRlQWJvdmVUb3AgPSBkb21Ob2RlUG9zaXRpb24udG9wICsgYWJvdmVUb3AgLSAoZWxXaW5kb3c/LnNjcm9sbFkgPz8gMCk7XG5cdFx0Y29uc3QgYWJzb2x1dGVCZWxvd1RvcCA9IGRvbU5vZGVQb3NpdGlvbi50b3AgKyBiZWxvd1RvcCAtIChlbFdpbmRvdz8uc2Nyb2xsWSA/PyAwKTtcblxuXHRcdGNvbnN0IHdpbmRvd1NpemUgPSBkb20uZ2V0Q2xpZW50QXJlYShlbERvY3VtZW50LmJvZHkpO1xuXHRcdGNvbnN0IFtsZWZ0LCBhYnNvbHV0ZUFib3ZlTGVmdF0gPSB0aGlzLl9sYXlvdXRIb3Jpem9udGFsU2VnbWVudEluUGFnZSh3aW5kb3dTaXplLCBkb21Ob2RlUG9zaXRpb24sIGFuY2hvci5sZWZ0IC0gY3R4LnNjcm9sbExlZnQgKyB0aGlzLl9jb250ZW50TGVmdCwgd2lkdGgpO1xuXG5cdFx0Ly8gTGVhdmUgc29tZSBjbGVhcmFuY2UgdG8gdGhlIHRvcC9ib3R0b21cblx0XHRjb25zdCBUT1BfUEFERElORyA9IDIyO1xuXHRcdGNvbnN0IEJPVFRPTV9QQURESU5HID0gMjI7XG5cblx0XHRjb25zdCBmaXRzQWJvdmUgPSAoYWJzb2x1dGVBYm92ZVRvcCA+PSBUT1BfUEFERElORyk7XG5cdFx0Y29uc3QgZml0c0JlbG93ID0gKGFic29sdXRlQmVsb3dUb3AgKyBoZWlnaHQgPD0gd2luZG93U2l6ZS5oZWlnaHQgLSBCT1RUT01fUEFERElORyk7XG5cblx0XHRpZiAodGhpcy5fZml4ZWRPdmVyZmxvd1dpZGdldHMpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGZpdHNBYm92ZSxcblx0XHRcdFx0YWJvdmVUb3A6IE1hdGgubWF4KGFic29sdXRlQWJvdmVUb3AsIFRPUF9QQURESU5HKSxcblx0XHRcdFx0Zml0c0JlbG93LFxuXHRcdFx0XHRiZWxvd1RvcDogYWJzb2x1dGVCZWxvd1RvcCxcblx0XHRcdFx0bGVmdDogYWJzb2x1dGVBYm92ZUxlZnRcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZml0c0Fib3ZlLCBhYm92ZVRvcCwgZml0c0JlbG93LCBiZWxvd1RvcCwgbGVmdCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJlcGFyZVJlbmRlcldpZGdldEF0RXhhY3RQb3NpdGlvbk92ZXJmbG93aW5nKHRvcExlZnQ6IENvb3JkaW5hdGUpOiBDb29yZGluYXRlIHtcblx0XHRyZXR1cm4gbmV3IENvb3JkaW5hdGUodG9wTGVmdC50b3AsIHRvcExlZnQubGVmdCArIHRoaXMuX2NvbnRlbnRMZWZ0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlIHRoZSBjb29yZGluYXRlcyBhYm92ZSBhbmQgYmVsb3cgdGhlIHByaW1hcnkgYW5kIHNlY29uZGFyeSBhbmNob3JzLlxuXHQgKiBUaGUgY29udGVudCB3aWRnZXQgKm11c3QqIHRvdWNoIHRoZSBwcmltYXJ5IGFuY2hvci5cblx0ICogVGhlIGNvbnRlbnQgd2lkZ2V0IHNob3VsZCB0b3VjaCBpZiBwb3NzaWJsZSB0aGUgc2Vjb25kYXJ5IGFuY2hvci5cblx0ICovXG5cdHByaXZhdGUgX2dldEFuY2hvcnNDb29yZGluYXRlcyhjdHg6IFJlbmRlcmluZ0NvbnRleHQpOiB7IHByaW1hcnk6IEFuY2hvckNvb3JkaW5hdGUgfCBudWxsOyBzZWNvbmRhcnk6IEFuY2hvckNvb3JkaW5hdGUgfCBudWxsIH0ge1xuXHRcdGNvbnN0IHByaW1hcnkgPSBnZXRDb29yZGluYXRlcyh0aGlzLl9wcmltYXJ5QW5jaG9yLnZpZXdQb3NpdGlvbiwgdGhpcy5fYWZmaW5pdHkpO1xuXHRcdGNvbnN0IHNlY29uZGFyeVZpZXdQb3NpdGlvbiA9ICh0aGlzLl9zZWNvbmRhcnlBbmNob3Iudmlld1Bvc2l0aW9uPy5saW5lTnVtYmVyID09PSB0aGlzLl9wcmltYXJ5QW5jaG9yLnZpZXdQb3NpdGlvbj8ubGluZU51bWJlciA/IHRoaXMuX3NlY29uZGFyeUFuY2hvci52aWV3UG9zaXRpb24gOiBudWxsKTtcblx0XHRjb25zdCBzZWNvbmRhcnkgPSBnZXRDb29yZGluYXRlcyhzZWNvbmRhcnlWaWV3UG9zaXRpb24sIHRoaXMuX2FmZmluaXR5KTtcblx0XHRyZXR1cm4geyBwcmltYXJ5LCBzZWNvbmRhcnkgfTtcblxuXHRcdGZ1bmN0aW9uIGdldENvb3JkaW5hdGVzKHBvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGwsIGFmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5IHwgbnVsbCk6IEFuY2hvckNvb3JkaW5hdGUgfCBudWxsIHtcblx0XHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhvcml6b250YWxQb3NpdGlvbiA9IGN0eC52aXNpYmxlUmFuZ2VGb3JQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRpZiAoIWhvcml6b250YWxQb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTGVmdC1hbGlnbiB3aWRnZXRzIHRoYXQgc2hvdWxkIGFwcGVhciA6YmVmb3JlIGNvbnRlbnRcblx0XHRcdGNvbnN0IGxlZnQgPSAocG9zaXRpb24uY29sdW1uID09PSAxICYmIGFmZmluaXR5ID09PSBQb3NpdGlvbkFmZmluaXR5LkxlZnRPZkluamVjdGVkVGV4dCA/IDAgOiBob3Jpem9udGFsUG9zaXRpb24ubGVmdCk7XG5cdFx0XHRjb25zdCB0b3AgPSBjdHguZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKHBvc2l0aW9uLmxpbmVOdW1iZXIpIC0gY3R4LnNjcm9sbFRvcDtcblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBjdHguZ2V0TGluZUhlaWdodEZvckxpbmVOdW1iZXIocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRyZXR1cm4gbmV3IEFuY2hvckNvb3JkaW5hdGUodG9wLCBsZWZ0LCBsaW5lSGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWR1Y2VBbmNob3JDb29yZGluYXRlcyhwcmltYXJ5OiBBbmNob3JDb29yZGluYXRlLCBzZWNvbmRhcnk6IEFuY2hvckNvb3JkaW5hdGUgfCBudWxsLCB3aWR0aDogbnVtYmVyKTogQW5jaG9yQ29vcmRpbmF0ZSB7XG5cdFx0aWYgKCFzZWNvbmRhcnkpIHtcblx0XHRcdHJldHVybiBwcmltYXJ5O1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cblx0XHRsZXQgbGVmdCA9IHNlY29uZGFyeS5sZWZ0O1xuXHRcdGlmIChsZWZ0IDwgcHJpbWFyeS5sZWZ0KSB7XG5cdFx0XHRsZWZ0ID0gTWF0aC5tYXgobGVmdCwgcHJpbWFyeS5sZWZ0IC0gd2lkdGggKyBmb250SW5mby50eXBpY2FsRnVsbHdpZHRoQ2hhcmFjdGVyV2lkdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZWZ0ID0gTWF0aC5taW4obGVmdCwgcHJpbWFyeS5sZWZ0ICsgd2lkdGggLSBmb250SW5mby50eXBpY2FsRnVsbHdpZHRoQ2hhcmFjdGVyV2lkdGgpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEFuY2hvckNvb3JkaW5hdGUocHJpbWFyeS50b3AsIGxlZnQsIHByaW1hcnkuaGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgX3ByZXBhcmVSZW5kZXJXaWRnZXQoY3R4OiBSZW5kZXJpbmdDb250ZXh0KTogSVJlbmRlckRhdGEgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX3ByZWZlcmVuY2UgfHwgdGhpcy5fcHJlZmVyZW5jZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSB0aGlzLl9nZXRBbmNob3JzQ29vcmRpbmF0ZXMoY3R4KTtcblx0XHRpZiAoIXByaW1hcnkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdvZmZWaWV3cG9ydCcsXG5cdFx0XHRcdHByZXNlcnZlRm9jdXM6IHRoaXMuZG9tTm9kZS5kb21Ob2RlLmNvbnRhaW5zKHRoaXMuZG9tTm9kZS5kb21Ob2RlLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudClcblx0XHRcdH07XG5cdFx0XHQvLyByZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldFdpZHRoID09PSAtMSB8fCB0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0SGVpZ2h0ID09PSAtMSkge1xuXG5cdFx0XHRsZXQgcHJlZmVycmVkRGltZW5zaW9uczogSURpbWVuc2lvbiB8IG51bGwgPSBudWxsO1xuXHRcdFx0aWYgKHR5cGVvZiB0aGlzLl9hY3R1YWwuYmVmb3JlUmVuZGVyID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdHByZWZlcnJlZERpbWVuc2lvbnMgPSBzYWZlSW52b2tlKHRoaXMuX2FjdHVhbC5iZWZvcmVSZW5kZXIsIHRoaXMuX2FjdHVhbCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJlZmVycmVkRGltZW5zaW9ucykge1xuXHRcdFx0XHR0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0V2lkdGggPSBwcmVmZXJyZWREaW1lbnNpb25zLndpZHRoO1xuXHRcdFx0XHR0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0SGVpZ2h0ID0gcHJlZmVycmVkRGltZW5zaW9ucy5oZWlnaHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkb21Ob2RlID0gdGhpcy5kb21Ob2RlLmRvbU5vZGU7XG5cdFx0XHRcdGNvbnN0IGNsaWVudFJlY3QgPSBkb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHR0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0V2lkdGggPSBNYXRoLnJvdW5kKGNsaWVudFJlY3Qud2lkdGgpO1xuXHRcdFx0XHR0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0SGVpZ2h0ID0gTWF0aC5yb3VuZChjbGllbnRSZWN0LmhlaWdodCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYW5jaG9yID0gdGhpcy5fcmVkdWNlQW5jaG9yQ29vcmRpbmF0ZXMocHJpbWFyeSwgc2Vjb25kYXJ5LCB0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0V2lkdGgpO1xuXG5cdFx0bGV0IHBsYWNlbWVudDogSUJveExheW91dFJlc3VsdCB8IG51bGw7XG5cdFx0aWYgKHRoaXMuYWxsb3dFZGl0b3JPdmVyZmxvdykge1xuXHRcdFx0cGxhY2VtZW50ID0gdGhpcy5fbGF5b3V0Qm94SW5QYWdlKGFuY2hvciwgdGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldFdpZHRoLCB0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0SGVpZ2h0LCBjdHgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwbGFjZW1lbnQgPSB0aGlzLl9sYXlvdXRCb3hJblZpZXdwb3J0KGFuY2hvciwgdGhpcy5fY2FjaGVkRG9tTm9kZU9mZnNldFdpZHRoLCB0aGlzLl9jYWNoZWREb21Ob2RlT2Zmc2V0SGVpZ2h0LCBjdHgpO1xuXHRcdH1cblxuXHRcdC8vIERvIHR3byBwYXNzZXMsIGZpcnN0IGZvciBwZXJmZWN0IGZpdCwgc2Vjb25kIHBpY2tzIGZpcnN0IG9wdGlvblxuXHRcdGZvciAobGV0IHBhc3MgPSAxOyBwYXNzIDw9IDI7IHBhc3MrKykge1xuXHRcdFx0Zm9yIChjb25zdCBwcmVmIG9mIHRoaXMuX3ByZWZlcmVuY2UpIHtcblx0XHRcdFx0Ly8gcGxhY2VtZW50XG5cdFx0XHRcdGlmIChwcmVmID09PSBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFCT1ZFKSB7XG5cdFx0XHRcdFx0aWYgKCFwbGFjZW1lbnQpIHtcblx0XHRcdFx0XHRcdC8vIFdpZGdldCBvdXRzaWRlIG9mIHZpZXdwb3J0XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBhc3MgPT09IDIgfHwgcGxhY2VtZW50LmZpdHNBYm92ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2luVmlld3BvcnQnLFxuXHRcdFx0XHRcdFx0XHRjb29yZGluYXRlOiBuZXcgQ29vcmRpbmF0ZShwbGFjZW1lbnQuYWJvdmVUb3AsIHBsYWNlbWVudC5sZWZ0KSxcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkVcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHByZWYgPT09IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1cpIHtcblx0XHRcdFx0XHRpZiAoIXBsYWNlbWVudCkge1xuXHRcdFx0XHRcdFx0Ly8gV2lkZ2V0IG91dHNpZGUgb2Ygdmlld3BvcnRcblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAocGFzcyA9PT0gMiB8fCBwbGFjZW1lbnQuZml0c0JlbG93KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnaW5WaWV3cG9ydCcsXG5cdFx0XHRcdFx0XHRcdGNvb3JkaW5hdGU6IG5ldyBDb29yZGluYXRlKHBsYWNlbWVudC5iZWxvd1RvcCwgcGxhY2VtZW50LmxlZnQpLFxuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPV1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuYWxsb3dFZGl0b3JPdmVyZmxvdykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2luVmlld3BvcnQnLFxuXHRcdFx0XHRcdFx0XHRjb29yZGluYXRlOiB0aGlzLl9wcmVwYXJlUmVuZGVyV2lkZ2V0QXRFeGFjdFBvc2l0aW9uT3ZlcmZsb3dpbmcobmV3IENvb3JkaW5hdGUoYW5jaG9yLnRvcCwgYW5jaG9yLmxlZnQpKSxcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuRVhBQ1Rcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdpblZpZXdwb3J0Jyxcblx0XHRcdFx0XHRcdFx0Y29vcmRpbmF0ZTogbmV3IENvb3JkaW5hdGUoYW5jaG9yLnRvcCwgYW5jaG9yLmxlZnQpLFxuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5FWEFDVFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBPbiB0aGlzIGZpcnN0IHBhc3MsIHdlIGVuc3VyZSB0aGF0IHRoZSBjb250ZW50IHdpZGdldCAoaWYgaXQgaXMgaW4gdGhlIHZpZXdwb3J0KSBoYXMgdGhlIG1heCB3aWR0aCBzZXQgY29ycmVjdGx5LlxuXHQgKi9cblx0cHVibGljIG9uQmVmb3JlUmVuZGVyKHZpZXdwb3J0RGF0YTogVmlld3BvcnREYXRhKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9wcmltYXJ5QW5jaG9yLnZpZXdQb3NpdGlvbiB8fCAhdGhpcy5fcHJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wcmltYXJ5QW5jaG9yLnZpZXdQb3NpdGlvbi5saW5lTnVtYmVyIDwgdmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlciB8fCB0aGlzLl9wcmltYXJ5QW5jaG9yLnZpZXdQb3NpdGlvbi5saW5lTnVtYmVyID4gdmlld3BvcnREYXRhLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIE91dHNpZGUgb2Ygdmlld3BvcnRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuc2V0TWF4V2lkdGgodGhpcy5fbWF4V2lkdGgpO1xuXHR9XG5cblx0cHVibGljIHByZXBhcmVSZW5kZXIoY3R4OiBSZW5kZXJpbmdDb250ZXh0KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyRGF0YSA9IHRoaXMuX3ByZXBhcmVSZW5kZXJXaWRnZXQoY3R4KTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoY3R4OiBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcmVuZGVyRGF0YSB8fCB0aGlzLl9yZW5kZXJEYXRhLmtpbmQgPT09ICdvZmZWaWV3cG9ydCcpIHtcblx0XHRcdC8vIFRoaXMgd2lkZ2V0IHNob3VsZCBiZSBpbnZpc2libGVcblx0XHRcdGlmICh0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5kb21Ob2RlLnJlbW92ZUF0dHJpYnV0ZSgnbW9uYWNvLXZpc2libGUtY29udGVudC13aWRnZXQnKTtcblx0XHRcdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cblx0XHRcdFx0aWYgKHRoaXMuX3JlbmRlckRhdGE/LmtpbmQgPT09ICdvZmZWaWV3cG9ydCcgJiYgdGhpcy5fcmVuZGVyRGF0YS5wcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHRcdFx0Ly8gd2lkZ2V0IHdhbnRzIHRvIGJlIHNob3duLCBidXQgaXQgaXMgb3V0c2lkZSBvZiB0aGUgdmlld3BvcnQgYW5kIGl0XG5cdFx0XHRcdFx0Ly8gaGFzIGZvY3VzIHdoaWNoIHdlIG5lZWQgdG8gcHJlc2VydmVcblx0XHRcdFx0XHR0aGlzLmRvbU5vZGUuc2V0VG9wKC0xMDAwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmRvbU5vZGUuc2V0VmlzaWJpbGl0eSgnaGlkZGVuJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHR5cGVvZiB0aGlzLl9hY3R1YWwuYWZ0ZXJSZW5kZXIgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0c2FmZUludm9rZSh0aGlzLl9hY3R1YWwuYWZ0ZXJSZW5kZXIsIHRoaXMuX2FjdHVhbCwgbnVsbCwgbnVsbCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhpcyB3aWRnZXQgc2hvdWxkIGJlIHZpc2libGVcblx0XHRpZiAodGhpcy5hbGxvd0VkaXRvck92ZXJmbG93KSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc2V0VG9wKHRoaXMuX3JlbmRlckRhdGEuY29vcmRpbmF0ZS50b3ApO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnNldExlZnQodGhpcy5fcmVuZGVyRGF0YS5jb29yZGluYXRlLmxlZnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc2V0VG9wKHRoaXMuX3JlbmRlckRhdGEuY29vcmRpbmF0ZS50b3AgKyBjdHguc2Nyb2xsVG9wIC0gY3R4LmJpZ051bWJlcnNEZWx0YSk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc2V0TGVmdCh0aGlzLl9yZW5kZXJEYXRhLmNvb3JkaW5hdGUubGVmdCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5zZXRWaXNpYmlsaXR5KCdpbmhlcml0Jyk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdtb25hY28tdmlzaWJsZS1jb250ZW50LXdpZGdldCcsICd0cnVlJyk7XG5cdFx0XHR0aGlzLl9pc1Zpc2libGUgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdGhpcy5fYWN0dWFsLmFmdGVyUmVuZGVyID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRzYWZlSW52b2tlKHRoaXMuX2FjdHVhbC5hZnRlclJlbmRlciwgdGhpcy5fYWN0dWFsLCB0aGlzLl9yZW5kZXJEYXRhLnBvc2l0aW9uLCB0aGlzLl9yZW5kZXJEYXRhLmNvb3JkaW5hdGUpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBQb3NpdGlvblBhaXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kZWxQb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmlld1Bvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGxcblx0KSB7IH1cbn1cblxuY2xhc3MgQ29vcmRpbmF0ZSBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0UmVuZGVyZWRDb29yZGluYXRlIHtcblx0X2Nvb3JkaW5hdGVCcmFuZDogdm9pZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdG9wOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxlZnQ6IG51bWJlclxuXHQpIHsgfVxufVxuXG5jbGFzcyBBbmNob3JDb29yZGluYXRlIHtcblx0X2FuY2hvckNvb3JkaW5hdGVCcmFuZDogdm9pZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdG9wOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxlZnQ6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgaGVpZ2h0OiBudW1iZXJcblx0KSB7IH1cbn1cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmZ1bmN0aW9uIHNhZmVJbnZva2U8VCBleHRlbmRzICguLi5hcmdzOiBhbnlbXSkgPT4gYW55PihmbjogVCwgdGhpc0FyZzogVGhpc1BhcmFtZXRlclR5cGU8VD4sIC4uLmFyZ3M6IFBhcmFtZXRlcnM8VD4pOiBSZXR1cm5UeXBlPFQ+IHwgbnVsbCB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGZuLmNhbGwodGhpc0FyZywgLi4uYXJncyk7XG5cdH0gY2F0Y2gge1xuXHRcdC8vIGlnbm9yZVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBc0IseUJBQXlCO0FBQy9DLFNBQVMsdUNBQXlGO0FBQ2xHLFNBQVMsaUJBQWlCLGtCQUFrQixnQkFBZ0I7QUFLNUQsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyx3QkFBd0I7QUFTMUIsTUFBTSwyQkFBMkIsU0FBUztBQUFBLEVBUWhELFlBQVksU0FBc0IsYUFBdUM7QUFDeEUsVUFBTSxPQUFPO0FBQ2IsU0FBSyxlQUFlO0FBQ3BCLFNBQUssV0FBVyxDQUFDO0FBRWpCLFNBQUssVUFBVSxrQkFBa0IsU0FBUyxjQUFjLEtBQUssQ0FBQztBQUM5RCxxQkFBaUIsTUFBTSxLQUFLLFNBQVMsZ0JBQWdCLGNBQWM7QUFDbkUsU0FBSyxRQUFRLGFBQWEsZ0JBQWdCO0FBQzFDLFNBQUssUUFBUSxZQUFZLFVBQVU7QUFDbkMsU0FBSyxRQUFRLE9BQU8sQ0FBQztBQUVyQixTQUFLLG1DQUFtQyxrQkFBa0IsU0FBUyxjQUFjLEtBQUssQ0FBQztBQUN2RixxQkFBaUIsTUFBTSxLQUFLLGtDQUFrQyxnQkFBZ0IseUJBQXlCO0FBQ3ZHLFNBQUssaUNBQWlDLGFBQWEsMkJBQTJCO0FBQUEsRUFDL0U7QUFBQSxFQUVnQixVQUFn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
