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
import * as dom from "../../../../base/browser/dom.js";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { HoverStartSource } from "./hoverOperation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResizableContentWidget } from "./resizableContentWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { getHoverAccessibleViewHint, HoverWidget } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { PositionAffinity } from "../../../common/model.js";
import { Emitter } from "../../../../base/common/event.js";
const HORIZONTAL_SCROLLING_BY = 30;
let ContentHoverWidget = class extends ResizableContentWidget {
  constructor(editor, contextKeyService, _configurationService, _accessibilityService, _keybindingService) {
    const minimumHeight = editor.getOption(EditorOption.lineHeight) + 8;
    const minimumWidth = 150;
    const minimumSize = new dom.Dimension(minimumWidth, minimumHeight);
    super(editor, minimumSize);
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._keybindingService = _keybindingService;
    this._hover = this._register(new HoverWidget(true));
    this._onDidResize = this._register(new Emitter());
    this.onDidResize = this._onDidResize.event;
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onContentsChanged = this._register(new Emitter());
    this.onContentsChanged = this._onContentsChanged.event;
    this._minimumSize = minimumSize;
    this._hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(contextKeyService);
    this._hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(contextKeyService);
    dom.append(this._resizableNode.domNode, this._hover.containerDomNode);
    this._resizableNode.domNode.style.zIndex = "50";
    this._resizableNode.domNode.className = "monaco-resizable-hover";
    this._register(this._editor.onDidLayoutChange(() => {
      if (this.isVisible) {
        this._updateMaxDimensions();
      }
    }));
    this._register(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this._updateFont();
      }
    }));
    const focusTracker = this._register(dom.trackFocus(this._resizableNode.domNode));
    this._register(focusTracker.onDidFocus(() => {
      this._hoverFocusedKey.set(true);
    }));
    this._register(focusTracker.onDidBlur(() => {
      this._hoverFocusedKey.set(false);
    }));
    this._register(this._hover.scrollbar.onScroll((e) => {
      this._onDidScroll.fire(e);
    }));
    this._setRenderedHover(void 0);
    this._editor.addContentWidget(this);
  }
  get isVisibleFromKeyboard() {
    return this._renderedHover?.source === HoverStartSource.Keyboard;
  }
  get isVisible() {
    return this._hoverVisibleKey.get() ?? false;
  }
  get isFocused() {
    return this._hoverFocusedKey.get() ?? false;
  }
  dispose() {
    super.dispose();
    this._renderedHover?.dispose();
    this._editor.removeContentWidget(this);
  }
  getId() {
    return ContentHoverWidget.ID;
  }
  static _applyDimensions(container, width, height) {
    const transformedWidth = typeof width === "number" ? `${width}px` : width;
    const transformedHeight = typeof height === "number" ? `${height}px` : height;
    container.style.width = transformedWidth;
    container.style.height = transformedHeight;
  }
  _setContentsDomNodeDimensions(width, height) {
    const contentsDomNode = this._hover.contentsDomNode;
    return ContentHoverWidget._applyDimensions(contentsDomNode, width, height);
  }
  _setContainerDomNodeDimensions(width, height) {
    const containerDomNode = this._hover.containerDomNode;
    return ContentHoverWidget._applyDimensions(containerDomNode, width, height);
  }
  _setScrollableElementDimensions(width, height) {
    const scrollbarDomElement = this._hover.scrollbar.getDomNode();
    return ContentHoverWidget._applyDimensions(scrollbarDomElement, width, height);
  }
  _setHoverWidgetDimensions(width, height) {
    this._setContainerDomNodeDimensions(width, height);
    this._setScrollableElementDimensions(width, height);
    this._setContentsDomNodeDimensions(width, height);
    this._layoutContentWidget();
  }
  static _applyMaxDimensions(container, width, height) {
    const transformedWidth = typeof width === "number" ? `${width}px` : width;
    const transformedHeight = typeof height === "number" ? `${height}px` : height;
    container.style.maxWidth = transformedWidth;
    container.style.maxHeight = transformedHeight;
  }
  _setHoverWidgetMaxDimensions(width, height) {
    ContentHoverWidget._applyMaxDimensions(this._hover.contentsDomNode, width, height);
    ContentHoverWidget._applyMaxDimensions(this._hover.scrollbar.getDomNode(), width, height);
    ContentHoverWidget._applyMaxDimensions(this._hover.containerDomNode, width, height);
    this._hover.containerDomNode.style.setProperty("--vscode-hover-maxWidth", typeof width === "number" ? `${width}px` : width);
    this._layoutContentWidget();
  }
  _setAdjustedHoverWidgetDimensions(size) {
    this._setHoverWidgetMaxDimensions("none", "none");
    this._setHoverWidgetDimensions(size.width, size.height);
  }
  _updateResizableNodeMaxDimensions() {
    const maxRenderingWidth = this._findMaximumRenderingWidth() ?? Infinity;
    const maxRenderingHeight = this._findMaximumRenderingHeight() ?? Infinity;
    this._resizableNode.maxSize = new dom.Dimension(maxRenderingWidth, maxRenderingHeight);
    this._setHoverWidgetMaxDimensions(maxRenderingWidth, maxRenderingHeight);
  }
  _resize(size) {
    ContentHoverWidget._lastDimensions = new dom.Dimension(size.width, size.height);
    this._setAdjustedHoverWidgetDimensions(size);
    this._resizableNode.layout(size.height, size.width);
    this._updateResizableNodeMaxDimensions();
    this._hover.scrollbar.scanDomNode();
    this._editor.layoutContentWidget(this);
    this._onDidResize.fire();
  }
  _findAvailableSpaceVertically() {
    const position = this._renderedHover?.showAtPosition;
    if (!position) {
      return;
    }
    return this._positionPreference === ContentWidgetPositionPreference.ABOVE ? this._availableVerticalSpaceAbove(position) : this._availableVerticalSpaceBelow(position);
  }
  _findMaximumRenderingHeight() {
    const availableSpace = this._findAvailableSpaceVertically();
    if (!availableSpace) {
      return;
    }
    const children = this._hover.contentsDomNode.children;
    let maximumHeight = children.length - 1;
    Array.from(this._hover.contentsDomNode.children).forEach((hoverPart) => {
      maximumHeight += hoverPart.clientHeight;
    });
    return Math.min(availableSpace, maximumHeight);
  }
  _isHoverTextOverflowing() {
    this._hover.containerDomNode.style.setProperty("--vscode-hover-whiteSpace", "nowrap");
    this._hover.containerDomNode.style.setProperty("--vscode-hover-sourceWhiteSpace", "nowrap");
    const overflowing = Array.from(this._hover.contentsDomNode.children).some((hoverElement) => {
      return hoverElement.scrollWidth > hoverElement.clientWidth;
    });
    this._hover.containerDomNode.style.removeProperty("--vscode-hover-whiteSpace");
    this._hover.containerDomNode.style.removeProperty("--vscode-hover-sourceWhiteSpace");
    return overflowing;
  }
  _findMaximumRenderingWidth() {
    if (!this._editor || !this._editor.hasModel()) {
      return;
    }
    const overflowing = this._isHoverTextOverflowing();
    const initialWidth = typeof this._contentWidth === "undefined" ? 0 : this._contentWidth;
    if (overflowing || this._hover.containerDomNode.clientWidth < initialWidth) {
      const bodyBoxWidth = dom.getClientArea(this._hover.containerDomNode.ownerDocument.body).width;
      const horizontalPadding = 14;
      return bodyBoxWidth - horizontalPadding;
    } else {
      return this._hover.containerDomNode.clientWidth;
    }
  }
  isMouseGettingCloser(posx, posy) {
    if (!this._renderedHover) {
      return false;
    }
    if (this._renderedHover.initialMousePosX === void 0 || this._renderedHover.initialMousePosY === void 0) {
      this._renderedHover.initialMousePosX = posx;
      this._renderedHover.initialMousePosY = posy;
      return false;
    }
    const widgetRect = dom.getDomNodePagePosition(this.getDomNode());
    if (this._renderedHover.closestMouseDistance === void 0) {
      this._renderedHover.closestMouseDistance = computeDistanceFromPointToRectangle(
        this._renderedHover.initialMousePosX,
        this._renderedHover.initialMousePosY,
        widgetRect.left,
        widgetRect.top,
        widgetRect.width,
        widgetRect.height
      );
    }
    const distance = computeDistanceFromPointToRectangle(
      posx,
      posy,
      widgetRect.left,
      widgetRect.top,
      widgetRect.width,
      widgetRect.height
    );
    if (distance > this._renderedHover.closestMouseDistance + 4) {
      return false;
    }
    this._renderedHover.closestMouseDistance = Math.min(this._renderedHover.closestMouseDistance, distance);
    return true;
  }
  _setRenderedHover(renderedHover) {
    this._renderedHover?.dispose();
    this._renderedHover = renderedHover;
    this._hoverVisibleKey.set(!!renderedHover);
    this._hover.containerDomNode.classList.toggle("hidden", !renderedHover);
  }
  _updateFont() {
    const { fontSize, lineHeight } = this._editor.getOption(EditorOption.fontInfo);
    const contentsDomNode = this._hover.contentsDomNode;
    contentsDomNode.style.fontSize = `${fontSize}px`;
    contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
    const codeClasses = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName("code"));
    codeClasses.forEach((node) => this._editor.applyFontInfo(node));
  }
  _updateContent(node) {
    const contentsDomNode = this._hover.contentsDomNode;
    contentsDomNode.style.paddingBottom = "";
    contentsDomNode.textContent = "";
    contentsDomNode.appendChild(node);
  }
  _layoutContentWidget() {
    this._editor.layoutContentWidget(this);
    this._hover.onContentsChanged();
  }
  _updateMaxDimensions() {
    const height = Math.max(this._editor.getLayoutInfo().height / 4, 250, ContentHoverWidget._lastDimensions.height);
    const width = Math.max(this._editor.getLayoutInfo().width * 0.66, 750, ContentHoverWidget._lastDimensions.width);
    this._resizableNode.maxSize = new dom.Dimension(width, height);
    this._setHoverWidgetMaxDimensions(width, height);
  }
  _render(renderedHover) {
    this._setRenderedHover(renderedHover);
    this._updateFont();
    this._updateContent(renderedHover.domNode);
    this.handleContentsChanged();
    this._editor.render();
  }
  getPosition() {
    if (!this._renderedHover) {
      return null;
    }
    return {
      position: this._renderedHover.showAtPosition,
      secondaryPosition: this._renderedHover.showAtSecondaryPosition,
      positionAffinity: this._renderedHover.shouldAppearBeforeContent ? PositionAffinity.LeftOfInjectedText : void 0,
      preference: [this._positionPreference ?? ContentWidgetPositionPreference.ABOVE]
    };
  }
  show(renderedHover) {
    if (!this._editor || !this._editor.hasModel()) {
      return;
    }
    this._render(renderedHover);
    const widgetHeight = dom.getTotalHeight(this._hover.containerDomNode);
    const widgetPosition = renderedHover.showAtPosition;
    this._positionPreference = this._findPositionPreference(widgetHeight, widgetPosition) ?? ContentWidgetPositionPreference.ABOVE;
    this.handleContentsChanged();
    if (renderedHover.shouldFocus) {
      this._hover.containerDomNode.focus();
    }
    this._onDidResize.fire();
    const hoverFocused = this._hover.containerDomNode.ownerDocument.activeElement === this._hover.containerDomNode;
    const accessibleViewHint = hoverFocused && getHoverAccessibleViewHint(
      this._configurationService.getValue("accessibility.verbosity.hover") === true && this._accessibilityService.isScreenReaderOptimized(),
      this._keybindingService.lookupKeybinding("editor.action.accessibleView")?.getAriaLabel() ?? ""
    );
    if (accessibleViewHint) {
      this._hover.contentsDomNode.ariaLabel = this._hover.contentsDomNode.textContent + ", " + accessibleViewHint;
    }
  }
  hide() {
    if (!this._renderedHover) {
      return;
    }
    const hoverStoleFocus = this._renderedHover.shouldFocus || this._hoverFocusedKey.get();
    this._setRenderedHover(void 0);
    this._resizableNode.maxSize = new dom.Dimension(Infinity, Infinity);
    this._resizableNode.clearSashHoverState();
    this._hoverFocusedKey.set(false);
    this._editor.layoutContentWidget(this);
    if (hoverStoleFocus) {
      this._editor.focus();
    }
  }
  _removeConstraintsRenderNormally() {
    const layoutInfo = this._editor.getLayoutInfo();
    this._resizableNode.layout(layoutInfo.height, layoutInfo.width);
    this._setHoverWidgetDimensions("auto", "auto");
    this._updateMaxDimensions();
  }
  setMinimumDimensions(dimensions) {
    this._minimumSize = new dom.Dimension(
      Math.max(this._minimumSize.width, dimensions.width),
      Math.max(this._minimumSize.height, dimensions.height)
    );
    this._updateMinimumWidth();
  }
  _updateMinimumWidth() {
    const width = typeof this._contentWidth === "undefined" ? this._minimumSize.width : Math.min(this._contentWidth, this._minimumSize.width);
    this._resizableNode.minSize = new dom.Dimension(width, this._minimumSize.height);
  }
  handleContentsChanged() {
    this._removeConstraintsRenderNormally();
    const contentsDomNode = this._hover.contentsDomNode;
    let height = dom.getTotalHeight(contentsDomNode);
    let width = dom.getTotalWidth(contentsDomNode) + 2;
    this._resizableNode.layout(height, width);
    this._setHoverWidgetDimensions(width, height);
    height = dom.getTotalHeight(contentsDomNode);
    width = dom.getTotalWidth(contentsDomNode);
    this._contentWidth = width;
    this._updateMinimumWidth();
    this._resizableNode.layout(height, width);
    if (this._renderedHover?.showAtPosition) {
      const widgetHeight = dom.getTotalHeight(this._hover.containerDomNode);
      this._positionPreference = this._findPositionPreference(widgetHeight, this._renderedHover.showAtPosition);
    }
    this._layoutContentWidget();
    this._onContentsChanged.fire();
  }
  focus() {
    this._hover.containerDomNode.focus();
  }
  scrollUp() {
    const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
    const fontInfo = this._editor.getOption(EditorOption.fontInfo);
    this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop - fontInfo.lineHeight });
  }
  scrollDown() {
    const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
    const fontInfo = this._editor.getOption(EditorOption.fontInfo);
    this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop + fontInfo.lineHeight });
  }
  scrollLeft() {
    const scrollLeft = this._hover.scrollbar.getScrollPosition().scrollLeft;
    this._hover.scrollbar.setScrollPosition({ scrollLeft: scrollLeft - HORIZONTAL_SCROLLING_BY });
  }
  scrollRight() {
    const scrollLeft = this._hover.scrollbar.getScrollPosition().scrollLeft;
    this._hover.scrollbar.setScrollPosition({ scrollLeft: scrollLeft + HORIZONTAL_SCROLLING_BY });
  }
  pageUp() {
    const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
    const scrollHeight = this._hover.scrollbar.getScrollDimensions().height;
    this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop - scrollHeight });
  }
  pageDown() {
    const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
    const scrollHeight = this._hover.scrollbar.getScrollDimensions().height;
    this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop + scrollHeight });
  }
  goToTop() {
    this._hover.scrollbar.setScrollPosition({ scrollTop: 0 });
  }
  goToBottom() {
    this._hover.scrollbar.setScrollPosition({ scrollTop: this._hover.scrollbar.getScrollDimensions().scrollHeight });
  }
};
ContentHoverWidget.ID = "editor.contrib.resizableContentHoverWidget";
ContentHoverWidget._lastDimensions = new dom.Dimension(0, 0);
ContentHoverWidget = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IAccessibilityService),
  __decorateParam(4, IKeybindingService)
], ContentHoverWidget);
function computeDistanceFromPointToRectangle(pointX, pointY, left, top, width, height) {
  const x = left + width / 2;
  const y = top + height / 2;
  const dx = Math.max(Math.abs(pointX - x) - width / 2, 0);
  const dy = Math.max(Math.abs(pointY - y) - height / 2, 0);
  return Math.sqrt(dx * dx + dy * dy);
}
export {
  ContentHoverWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGhvdmVyXFxicm93c2VyXFxjb250ZW50SG92ZXJXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSG92ZXJTdGFydFNvdXJjZSB9IGZyb20gJy4vaG92ZXJPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZXNpemFibGVDb250ZW50V2lkZ2V0IH0gZnJvbSAnLi9yZXNpemFibGVDb250ZW50V2lkZ2V0LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBnZXRIb3ZlckFjY2Vzc2libGVWaWV3SGludCwgSG92ZXJXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb25BZmZpbml0eSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUmVuZGVyZWRDb250ZW50SG92ZXIgfSBmcm9tICcuL2NvbnRlbnRIb3ZlclJlbmRlcmVkLmpzJztcbmltcG9ydCB7IFNjcm9sbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5cbmNvbnN0IEhPUklaT05UQUxfU0NST0xMSU5HX0JZID0gMzA7XG5cbmV4cG9ydCBjbGFzcyBDb250ZW50SG92ZXJXaWRnZXQgZXh0ZW5kcyBSZXNpemFibGVDb250ZW50V2lkZ2V0IHtcblxuXHRwdWJsaWMgc3RhdGljIElEID0gJ2VkaXRvci5jb250cmliLnJlc2l6YWJsZUNvbnRlbnRIb3ZlcldpZGdldCc7XG5cdHByaXZhdGUgc3RhdGljIF9sYXN0RGltZW5zaW9uczogZG9tLkRpbWVuc2lvbiA9IG5ldyBkb20uRGltZW5zaW9uKDAsIDApO1xuXG5cdHByaXZhdGUgX3JlbmRlcmVkSG92ZXI6IFJlbmRlcmVkQ29udGVudEhvdmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wb3NpdGlvblByZWZlcmVuY2U6IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21pbmltdW1TaXplOiBkb20uRGltZW5zaW9uO1xuXHRwcml2YXRlIF9jb250ZW50V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlcjogSG92ZXJXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgSG92ZXJXaWRnZXQodHJ1ZSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclZpc2libGVLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlckZvY3VzZWRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVzaXplID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFJlc2l6ZSA9IHRoaXMuX29uRGlkUmVzaXplLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2Nyb2xsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2Nyb2xsRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRTY3JvbGwgPSB0aGlzLl9vbkRpZFNjcm9sbC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbnRlbnRzQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Db250ZW50c0NoYW5nZWQgPSB0aGlzLl9vbkNvbnRlbnRzQ2hhbmdlZC5ldmVudDtcblxuXHRwdWJsaWMgZ2V0IGlzVmlzaWJsZUZyb21LZXlib2FyZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX3JlbmRlcmVkSG92ZXI/LnNvdXJjZSA9PT0gSG92ZXJTdGFydFNvdXJjZS5LZXlib2FyZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faG92ZXJWaXNpYmxlS2V5LmdldCgpID8/IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGdldCBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvdmVyRm9jdXNlZEtleS5nZXQoKSA/PyBmYWxzZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IG1pbmltdW1IZWlnaHQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSArIDg7XG5cdFx0Y29uc3QgbWluaW11bVdpZHRoID0gMTUwO1xuXHRcdGNvbnN0IG1pbmltdW1TaXplID0gbmV3IGRvbS5EaW1lbnNpb24obWluaW11bVdpZHRoLCBtaW5pbXVtSGVpZ2h0KTtcblx0XHRzdXBlcihlZGl0b3IsIG1pbmltdW1TaXplKTtcblxuXHRcdHRoaXMuX21pbmltdW1TaXplID0gbWluaW11bVNpemU7XG5cdFx0dGhpcy5faG92ZXJWaXNpYmxlS2V5ID0gRWRpdG9yQ29udGV4dEtleXMuaG92ZXJWaXNpYmxlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faG92ZXJGb2N1c2VkS2V5ID0gRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRkb20uYXBwZW5kKHRoaXMuX3Jlc2l6YWJsZU5vZGUuZG9tTm9kZSwgdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZSk7XG5cdFx0dGhpcy5fcmVzaXphYmxlTm9kZS5kb21Ob2RlLnN0eWxlLnpJbmRleCA9ICc1MCc7XG5cdFx0dGhpcy5fcmVzaXphYmxlTm9kZS5kb21Ob2RlLmNsYXNzTmFtZSA9ICdtb25hY28tcmVzaXphYmxlLWhvdmVyJztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZExheW91dENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlTWF4RGltZW5zaW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlOiBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250SW5mbykpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRm9udCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcihkb20udHJhY2tGb2N1cyh0aGlzLl9yZXNpemFibGVOb2RlLmRvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9ob3ZlckZvY3VzZWRLZXkuc2V0KHRydWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdHRoaXMuX2hvdmVyRm9jdXNlZEtleS5zZXQoZmFsc2UpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ob3Zlci5zY3JvbGxiYXIub25TY3JvbGwoKGUpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkU2Nyb2xsLmZpcmUoZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3NldFJlbmRlcmVkSG92ZXIodW5kZWZpbmVkKTtcblx0XHR0aGlzLl9lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZW5kZXJlZEhvdmVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZWRpdG9yLnJlbW92ZUNvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQ29udGVudEhvdmVyV2lkZ2V0LklEO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FwcGx5RGltZW5zaW9ucyhjb250YWluZXI6IEhUTUxFbGVtZW50LCB3aWR0aDogbnVtYmVyIHwgc3RyaW5nLCBoZWlnaHQ6IG51bWJlciB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRyYW5zZm9ybWVkV2lkdGggPSB0eXBlb2Ygd2lkdGggPT09ICdudW1iZXInID8gYCR7d2lkdGh9cHhgIDogd2lkdGg7XG5cdFx0Y29uc3QgdHJhbnNmb3JtZWRIZWlnaHQgPSB0eXBlb2YgaGVpZ2h0ID09PSAnbnVtYmVyJyA/IGAke2hlaWdodH1weGAgOiBoZWlnaHQ7XG5cdFx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gdHJhbnNmb3JtZWRXaWR0aDtcblx0XHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gdHJhbnNmb3JtZWRIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb250ZW50c0RvbU5vZGVEaW1lbnNpb25zKHdpZHRoOiBudW1iZXIgfCBzdHJpbmcsIGhlaWdodDogbnVtYmVyIHwgc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGVudHNEb21Ob2RlID0gdGhpcy5faG92ZXIuY29udGVudHNEb21Ob2RlO1xuXHRcdHJldHVybiBDb250ZW50SG92ZXJXaWRnZXQuX2FwcGx5RGltZW5zaW9ucyhjb250ZW50c0RvbU5vZGUsIHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q29udGFpbmVyRG9tTm9kZURpbWVuc2lvbnMod2lkdGg6IG51bWJlciB8IHN0cmluZywgaGVpZ2h0OiBudW1iZXIgfCBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXJEb21Ob2RlID0gdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZTtcblx0XHRyZXR1cm4gQ29udGVudEhvdmVyV2lkZ2V0Ll9hcHBseURpbWVuc2lvbnMoY29udGFpbmVyRG9tTm9kZSwgd2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTY3JvbGxhYmxlRWxlbWVudERpbWVuc2lvbnMod2lkdGg6IG51bWJlciB8IHN0cmluZywgaGVpZ2h0OiBudW1iZXIgfCBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzY3JvbGxiYXJEb21FbGVtZW50ID0gdGhpcy5faG92ZXIuc2Nyb2xsYmFyLmdldERvbU5vZGUoKTtcblx0XHRyZXR1cm4gQ29udGVudEhvdmVyV2lkZ2V0Ll9hcHBseURpbWVuc2lvbnMoc2Nyb2xsYmFyRG9tRWxlbWVudCwgd2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRIb3ZlcldpZGdldERpbWVuc2lvbnMod2lkdGg6IG51bWJlciB8IHN0cmluZywgaGVpZ2h0OiBudW1iZXIgfCBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRDb250YWluZXJEb21Ob2RlRGltZW5zaW9ucyh3aWR0aCwgaGVpZ2h0KTtcblx0XHR0aGlzLl9zZXRTY3JvbGxhYmxlRWxlbWVudERpbWVuc2lvbnMod2lkdGgsIGhlaWdodCk7XG5cdFx0dGhpcy5fc2V0Q29udGVudHNEb21Ob2RlRGltZW5zaW9ucyh3aWR0aCwgaGVpZ2h0KTtcblx0XHR0aGlzLl9sYXlvdXRDb250ZW50V2lkZ2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfYXBwbHlNYXhEaW1lbnNpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHdpZHRoOiBudW1iZXIgfCBzdHJpbmcsIGhlaWdodDogbnVtYmVyIHwgc3RyaW5nKSB7XG5cdFx0Y29uc3QgdHJhbnNmb3JtZWRXaWR0aCA9IHR5cGVvZiB3aWR0aCA9PT0gJ251bWJlcicgPyBgJHt3aWR0aH1weGAgOiB3aWR0aDtcblx0XHRjb25zdCB0cmFuc2Zvcm1lZEhlaWdodCA9IHR5cGVvZiBoZWlnaHQgPT09ICdudW1iZXInID8gYCR7aGVpZ2h0fXB4YCA6IGhlaWdodDtcblx0XHRjb250YWluZXIuc3R5bGUubWF4V2lkdGggPSB0cmFuc2Zvcm1lZFdpZHRoO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5tYXhIZWlnaHQgPSB0cmFuc2Zvcm1lZEhlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgX3NldEhvdmVyV2lkZ2V0TWF4RGltZW5zaW9ucyh3aWR0aDogbnVtYmVyIHwgc3RyaW5nLCBoZWlnaHQ6IG51bWJlciB8IHN0cmluZyk6IHZvaWQge1xuXHRcdENvbnRlbnRIb3ZlcldpZGdldC5fYXBwbHlNYXhEaW1lbnNpb25zKHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZSwgd2lkdGgsIGhlaWdodCk7XG5cdFx0Q29udGVudEhvdmVyV2lkZ2V0Ll9hcHBseU1heERpbWVuc2lvbnModGhpcy5faG92ZXIuc2Nyb2xsYmFyLmdldERvbU5vZGUoKSwgd2lkdGgsIGhlaWdodCk7XG5cdFx0Q29udGVudEhvdmVyV2lkZ2V0Ll9hcHBseU1heERpbWVuc2lvbnModGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZSwgd2lkdGgsIGhlaWdodCk7XG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtaG92ZXItbWF4V2lkdGgnLCB0eXBlb2Ygd2lkdGggPT09ICdudW1iZXInID8gYCR7d2lkdGh9cHhgIDogd2lkdGgpO1xuXHRcdHRoaXMuX2xheW91dENvbnRlbnRXaWRnZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEFkanVzdGVkSG92ZXJXaWRnZXREaW1lbnNpb25zKHNpemU6IGRvbS5EaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRIb3ZlcldpZGdldE1heERpbWVuc2lvbnMoJ25vbmUnLCAnbm9uZScpO1xuXHRcdHRoaXMuX3NldEhvdmVyV2lkZ2V0RGltZW5zaW9ucyhzaXplLndpZHRoLCBzaXplLmhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVSZXNpemFibGVOb2RlTWF4RGltZW5zaW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBtYXhSZW5kZXJpbmdXaWR0aCA9IHRoaXMuX2ZpbmRNYXhpbXVtUmVuZGVyaW5nV2lkdGgoKSA/PyBJbmZpbml0eTtcblx0XHRjb25zdCBtYXhSZW5kZXJpbmdIZWlnaHQgPSB0aGlzLl9maW5kTWF4aW11bVJlbmRlcmluZ0hlaWdodCgpID8/IEluZmluaXR5O1xuXHRcdHRoaXMuX3Jlc2l6YWJsZU5vZGUubWF4U2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKG1heFJlbmRlcmluZ1dpZHRoLCBtYXhSZW5kZXJpbmdIZWlnaHQpO1xuXHRcdHRoaXMuX3NldEhvdmVyV2lkZ2V0TWF4RGltZW5zaW9ucyhtYXhSZW5kZXJpbmdXaWR0aCwgbWF4UmVuZGVyaW5nSGVpZ2h0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVzaXplKHNpemU6IGRvbS5EaW1lbnNpb24pOiB2b2lkIHtcblx0XHRDb250ZW50SG92ZXJXaWRnZXQuX2xhc3REaW1lbnNpb25zID0gbmV3IGRvbS5EaW1lbnNpb24oc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQpO1xuXHRcdHRoaXMuX3NldEFkanVzdGVkSG92ZXJXaWRnZXREaW1lbnNpb25zKHNpemUpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZU5vZGUubGF5b3V0KHNpemUuaGVpZ2h0LCBzaXplLndpZHRoKTtcblx0XHR0aGlzLl91cGRhdGVSZXNpemFibGVOb2RlTWF4RGltZW5zaW9ucygpO1xuXHRcdHRoaXMuX2hvdmVyLnNjcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdHRoaXMuX29uRGlkUmVzaXplLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRBdmFpbGFibGVTcGFjZVZlcnRpY2FsbHkoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX3JlbmRlcmVkSG92ZXI/LnNob3dBdFBvc2l0aW9uO1xuXHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Bvc2l0aW9uUHJlZmVyZW5jZSA9PT0gQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRSA/XG5cdFx0XHR0aGlzLl9hdmFpbGFibGVWZXJ0aWNhbFNwYWNlQWJvdmUocG9zaXRpb24pXG5cdFx0XHQ6IHRoaXMuX2F2YWlsYWJsZVZlcnRpY2FsU3BhY2VCZWxvdyhwb3NpdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTWF4aW11bVJlbmRlcmluZ0hlaWdodCgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF2YWlsYWJsZVNwYWNlID0gdGhpcy5fZmluZEF2YWlsYWJsZVNwYWNlVmVydGljYWxseSgpO1xuXHRcdGlmICghYXZhaWxhYmxlU3BhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSB0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuY2hpbGRyZW47XG5cdFx0bGV0IG1heGltdW1IZWlnaHQgPSBjaGlsZHJlbi5sZW5ndGggLSAxO1xuXHRcdEFycmF5LmZyb20odGhpcy5faG92ZXIuY29udGVudHNEb21Ob2RlLmNoaWxkcmVuKS5mb3JFYWNoKChob3ZlclBhcnQpID0+IHtcblx0XHRcdG1heGltdW1IZWlnaHQgKz0gaG92ZXJQYXJ0LmNsaWVudEhlaWdodDtcblx0XHR9KTtcblx0XHRyZXR1cm4gTWF0aC5taW4oYXZhaWxhYmxlU3BhY2UsIG1heGltdW1IZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNIb3ZlclRleHRPdmVyZmxvd2luZygpOiBib29sZWFuIHtcblx0XHQvLyBUbyBmaW5kIG91dCBpZiB0aGUgdGV4dCBpcyBvdmVyZmxvd2luZywgd2Ugd2lsbCBkaXNhYmxlIHdyYXBwaW5nLCBjaGVjayB0aGUgd2lkdGhzLCBhbmQgdGhlbiByZS1lbmFibGUgd3JhcHBpbmdcblx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1ob3Zlci13aGl0ZVNwYWNlJywgJ25vd3JhcCcpO1xuXHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWhvdmVyLXNvdXJjZVdoaXRlU3BhY2UnLCAnbm93cmFwJyk7XG5cblx0XHRjb25zdCBvdmVyZmxvd2luZyA9IEFycmF5LmZyb20odGhpcy5faG92ZXIuY29udGVudHNEb21Ob2RlLmNoaWxkcmVuKS5zb21lKChob3ZlckVsZW1lbnQpID0+IHtcblx0XHRcdHJldHVybiBob3ZlckVsZW1lbnQuc2Nyb2xsV2lkdGggPiBob3ZlckVsZW1lbnQuY2xpZW50V2lkdGg7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLnN0eWxlLnJlbW92ZVByb3BlcnR5KCctLXZzY29kZS1ob3Zlci13aGl0ZVNwYWNlJyk7XG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS12c2NvZGUtaG92ZXItc291cmNlV2hpdGVTcGFjZScpO1xuXG5cdFx0cmV0dXJuIG92ZXJmbG93aW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZE1heGltdW1SZW5kZXJpbmdXaWR0aCgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yIHx8ICF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG92ZXJmbG93aW5nID0gdGhpcy5faXNIb3ZlclRleHRPdmVyZmxvd2luZygpO1xuXHRcdGNvbnN0IGluaXRpYWxXaWR0aCA9IChcblx0XHRcdHR5cGVvZiB0aGlzLl9jb250ZW50V2lkdGggPT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdD8gMFxuXHRcdFx0XHQ6IHRoaXMuX2NvbnRlbnRXaWR0aFxuXHRcdCk7XG5cblx0XHRpZiAob3ZlcmZsb3dpbmcgfHwgdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRXaWR0aCA8IGluaXRpYWxXaWR0aCkge1xuXHRcdFx0Y29uc3QgYm9keUJveFdpZHRoID0gZG9tLmdldENsaWVudEFyZWEodGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5vd25lckRvY3VtZW50LmJvZHkpLndpZHRoO1xuXHRcdFx0Y29uc3QgaG9yaXpvbnRhbFBhZGRpbmcgPSAxNDtcblx0XHRcdHJldHVybiBib2R5Qm94V2lkdGggLSBob3Jpem9udGFsUGFkZGluZztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGg7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGlzTW91c2VHZXR0aW5nQ2xvc2VyKHBvc3g6IG51bWJlciwgcG9zeTogbnVtYmVyKTogYm9vbGVhbiB7XG5cblx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkSG92ZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3JlbmRlcmVkSG92ZXIuaW5pdGlhbE1vdXNlUG9zWCA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuX3JlbmRlcmVkSG92ZXIuaW5pdGlhbE1vdXNlUG9zWSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZEhvdmVyLmluaXRpYWxNb3VzZVBvc1ggPSBwb3N4O1xuXHRcdFx0dGhpcy5fcmVuZGVyZWRIb3Zlci5pbml0aWFsTW91c2VQb3NZID0gcG9zeTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXRSZWN0ID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5nZXREb21Ob2RlKCkpO1xuXHRcdGlmICh0aGlzLl9yZW5kZXJlZEhvdmVyLmNsb3Nlc3RNb3VzZURpc3RhbmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3JlbmRlcmVkSG92ZXIuY2xvc2VzdE1vdXNlRGlzdGFuY2UgPSBjb21wdXRlRGlzdGFuY2VGcm9tUG9pbnRUb1JlY3RhbmdsZShcblx0XHRcdFx0dGhpcy5fcmVuZGVyZWRIb3Zlci5pbml0aWFsTW91c2VQb3NYLFxuXHRcdFx0XHR0aGlzLl9yZW5kZXJlZEhvdmVyLmluaXRpYWxNb3VzZVBvc1ksXG5cdFx0XHRcdHdpZGdldFJlY3QubGVmdCxcblx0XHRcdFx0d2lkZ2V0UmVjdC50b3AsXG5cdFx0XHRcdHdpZGdldFJlY3Qud2lkdGgsXG5cdFx0XHRcdHdpZGdldFJlY3QuaGVpZ2h0XG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3RhbmNlID0gY29tcHV0ZURpc3RhbmNlRnJvbVBvaW50VG9SZWN0YW5nbGUoXG5cdFx0XHRwb3N4LFxuXHRcdFx0cG9zeSxcblx0XHRcdHdpZGdldFJlY3QubGVmdCxcblx0XHRcdHdpZGdldFJlY3QudG9wLFxuXHRcdFx0d2lkZ2V0UmVjdC53aWR0aCxcblx0XHRcdHdpZGdldFJlY3QuaGVpZ2h0XG5cdFx0KTtcblx0XHRpZiAoZGlzdGFuY2UgPiB0aGlzLl9yZW5kZXJlZEhvdmVyLmNsb3Nlc3RNb3VzZURpc3RhbmNlICsgNCAvKiB0b2xlcmFuY2Ugb2YgNCBwaXhlbHMgKi8pIHtcblx0XHRcdC8vIFRoZSBtb3VzZSBpcyBnZXR0aW5nIGZhcnRoZXIgYXdheVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmRlcmVkSG92ZXIuY2xvc2VzdE1vdXNlRGlzdGFuY2UgPSBNYXRoLm1pbih0aGlzLl9yZW5kZXJlZEhvdmVyLmNsb3Nlc3RNb3VzZURpc3RhbmNlLCBkaXN0YW5jZSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRSZW5kZXJlZEhvdmVyKHJlbmRlcmVkSG92ZXI6IFJlbmRlcmVkQ29udGVudEhvdmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyZWRIb3Zlcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3JlbmRlcmVkSG92ZXIgPSByZW5kZXJlZEhvdmVyO1xuXHRcdHRoaXMuX2hvdmVyVmlzaWJsZUtleS5zZXQoISFyZW5kZXJlZEhvdmVyKTtcblx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFyZW5kZXJlZEhvdmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZvbnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBmb250U2l6ZSwgbGluZUhlaWdodCB9ID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IGNvbnRlbnRzRG9tTm9kZSA9IHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZTtcblx0XHRjb250ZW50c0RvbU5vZGUuc3R5bGUuZm9udFNpemUgPSBgJHtmb250U2l6ZX1weGA7XG5cdFx0Y29udGVudHNEb21Ob2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtsaW5lSGVpZ2h0IC8gZm9udFNpemV9YDtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBjb2RlQ2xhc3NlczogSFRNTEVsZW1lbnRbXSA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZS5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdjb2RlJykpO1xuXHRcdGNvZGVDbGFzc2VzLmZvckVhY2gobm9kZSA9PiB0aGlzLl9lZGl0b3IuYXBwbHlGb250SW5mbyhub2RlKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb250ZW50KG5vZGU6IERvY3VtZW50RnJhZ21lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZW50c0RvbU5vZGUgPSB0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGU7XG5cdFx0Y29udGVudHNEb21Ob2RlLnN0eWxlLnBhZGRpbmdCb3R0b20gPSAnJztcblx0XHRjb250ZW50c0RvbU5vZGUudGV4dENvbnRlbnQgPSAnJztcblx0XHRjb250ZW50c0RvbU5vZGUuYXBwZW5kQ2hpbGQobm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRDb250ZW50V2lkZ2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdHRoaXMuX2hvdmVyLm9uQ29udGVudHNDaGFuZ2VkKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVNYXhEaW1lbnNpb25zKCkge1xuXHRcdGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KHRoaXMuX2VkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0IC8gNCwgMjUwLCBDb250ZW50SG92ZXJXaWRnZXQuX2xhc3REaW1lbnNpb25zLmhlaWdodCk7XG5cdFx0Y29uc3Qgd2lkdGggPSBNYXRoLm1heCh0aGlzLl9lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLndpZHRoICogMC42NiwgNzUwLCBDb250ZW50SG92ZXJXaWRnZXQuX2xhc3REaW1lbnNpb25zLndpZHRoKTtcblx0XHR0aGlzLl9yZXNpemFibGVOb2RlLm1heFNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0XHR0aGlzLl9zZXRIb3ZlcldpZGdldE1heERpbWVuc2lvbnMod2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXIocmVuZGVyZWRIb3ZlcjogUmVuZGVyZWRDb250ZW50SG92ZXIpIHtcblx0XHR0aGlzLl9zZXRSZW5kZXJlZEhvdmVyKHJlbmRlcmVkSG92ZXIpO1xuXHRcdHRoaXMuX3VwZGF0ZUZvbnQoKTtcblx0XHR0aGlzLl91cGRhdGVDb250ZW50KHJlbmRlcmVkSG92ZXIuZG9tTm9kZSk7XG5cdFx0dGhpcy5oYW5kbGVDb250ZW50c0NoYW5nZWQoKTtcblx0XHQvLyBTaW1wbHkgZm9yY2UgYSBzeW5jaHJvbm91cyByZW5kZXIgb24gdGhlIGVkaXRvclxuXHRcdC8vIHN1Y2ggdGhhdCB0aGUgd2lkZ2V0IGRvZXMgbm90IHJlYWxseSByZW5kZXIgd2l0aCBsZWZ0ID0gJzBweCdcblx0XHR0aGlzLl9lZGl0b3IucmVuZGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9yZW5kZXJlZEhvdmVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBvc2l0aW9uOiB0aGlzLl9yZW5kZXJlZEhvdmVyLnNob3dBdFBvc2l0aW9uLFxuXHRcdFx0c2Vjb25kYXJ5UG9zaXRpb246IHRoaXMuX3JlbmRlcmVkSG92ZXIuc2hvd0F0U2Vjb25kYXJ5UG9zaXRpb24sXG5cdFx0XHRwb3NpdGlvbkFmZmluaXR5OiB0aGlzLl9yZW5kZXJlZEhvdmVyLnNob3VsZEFwcGVhckJlZm9yZUNvbnRlbnQgPyBQb3NpdGlvbkFmZmluaXR5LkxlZnRPZkluamVjdGVkVGV4dCA6IHVuZGVmaW5lZCxcblx0XHRcdHByZWZlcmVuY2U6IFt0aGlzLl9wb3NpdGlvblByZWZlcmVuY2UgPz8gQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRV1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHNob3cocmVuZGVyZWRIb3ZlcjogUmVuZGVyZWRDb250ZW50SG92ZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvciB8fCAhdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyKHJlbmRlcmVkSG92ZXIpO1xuXHRcdGNvbnN0IHdpZGdldEhlaWdodCA9IGRvbS5nZXRUb3RhbEhlaWdodCh0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlKTtcblx0XHRjb25zdCB3aWRnZXRQb3NpdGlvbiA9IHJlbmRlcmVkSG92ZXIuc2hvd0F0UG9zaXRpb247XG5cdFx0dGhpcy5fcG9zaXRpb25QcmVmZXJlbmNlID0gdGhpcy5fZmluZFBvc2l0aW9uUHJlZmVyZW5jZSh3aWRnZXRIZWlnaHQsIHdpZGdldFBvc2l0aW9uKSA/PyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFCT1ZFO1xuXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDAzMzlcblx0XHQvLyBUT0RPOiBEb2luZyBhIHNlY29uZCBsYXlvdXQgb2YgdGhlIGhvdmVyIGFmdGVyIGZvcmNlIHJlbmRlcmluZyB0aGUgZWRpdG9yXG5cdFx0dGhpcy5oYW5kbGVDb250ZW50c0NoYW5nZWQoKTtcblx0XHRpZiAocmVuZGVyZWRIb3Zlci5zaG91bGRGb2N1cykge1xuXHRcdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5mb2N1cygpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZFJlc2l6ZS5maXJlKCk7XG5cdFx0Ly8gVGhlIGFyaWEgbGFiZWwgb3ZlcnJpZGVzIHRoZSBsYWJlbCwgc28gaWYgd2UgYWRkIHRvIGl0LCBhZGQgdGhlIGNvbnRlbnRzIG9mIHRoZSBob3ZlclxuXHRcdGNvbnN0IGhvdmVyRm9jdXNlZCA9IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSB0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlO1xuXHRcdGNvbnN0IGFjY2Vzc2libGVWaWV3SGludCA9IGhvdmVyRm9jdXNlZCAmJiBnZXRIb3ZlckFjY2Vzc2libGVWaWV3SGludChcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5ob3ZlcicpID09PSB0cnVlICYmIHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCksXG5cdFx0XHR0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCdlZGl0b3IuYWN0aW9uLmFjY2Vzc2libGVWaWV3Jyk/LmdldEFyaWFMYWJlbCgpID8/ICcnXG5cdFx0KTtcblxuXHRcdGlmIChhY2Nlc3NpYmxlVmlld0hpbnQpIHtcblx0XHRcdHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZS5hcmlhTGFiZWwgPSB0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUudGV4dENvbnRlbnQgKyAnLCAnICsgYWNjZXNzaWJsZVZpZXdIaW50O1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoaWRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcmVuZGVyZWRIb3Zlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBob3ZlclN0b2xlRm9jdXMgPSB0aGlzLl9yZW5kZXJlZEhvdmVyLnNob3VsZEZvY3VzIHx8IHRoaXMuX2hvdmVyRm9jdXNlZEtleS5nZXQoKTtcblx0XHR0aGlzLl9zZXRSZW5kZXJlZEhvdmVyKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fcmVzaXphYmxlTm9kZS5tYXhTaXplID0gbmV3IGRvbS5EaW1lbnNpb24oSW5maW5pdHksIEluZmluaXR5KTtcblx0XHR0aGlzLl9yZXNpemFibGVOb2RlLmNsZWFyU2FzaEhvdmVyU3RhdGUoKTtcblx0XHR0aGlzLl9ob3ZlckZvY3VzZWRLZXkuc2V0KGZhbHNlKTtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0XHRpZiAoaG92ZXJTdG9sZUZvY3VzKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVDb25zdHJhaW50c1JlbmRlck5vcm1hbGx5KCk6IHZvaWQge1xuXHRcdC8vIEFkZGVkIGJlY2F1c2Ugb3RoZXJ3aXNlIHRoZSBpbml0aWFsIHNpemUgb2YgdGhlIGhvdmVyIGNvbnRlbnQgaXMgc21hbGxlciB0aGFuIHNob3VsZCBiZVxuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZU5vZGUubGF5b3V0KGxheW91dEluZm8uaGVpZ2h0LCBsYXlvdXRJbmZvLndpZHRoKTtcblx0XHR0aGlzLl9zZXRIb3ZlcldpZGdldERpbWVuc2lvbnMoJ2F1dG8nLCAnYXV0bycpO1xuXHRcdHRoaXMuX3VwZGF0ZU1heERpbWVuc2lvbnMoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRNaW5pbXVtRGltZW5zaW9ucyhkaW1lbnNpb25zOiBkb20uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0Ly8gV2UgY29tYmluZSB0aGUgbmV3IG1pbmltdW0gZGltZW5zaW9ucyB3aXRoIHRoZSBwcmV2aW91cyBvbmVzXG5cdFx0dGhpcy5fbWluaW11bVNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbihcblx0XHRcdE1hdGgubWF4KHRoaXMuX21pbmltdW1TaXplLndpZHRoLCBkaW1lbnNpb25zLndpZHRoKSxcblx0XHRcdE1hdGgubWF4KHRoaXMuX21pbmltdW1TaXplLmhlaWdodCwgZGltZW5zaW9ucy5oZWlnaHQpXG5cdFx0KTtcblx0XHR0aGlzLl91cGRhdGVNaW5pbXVtV2lkdGgoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU1pbmltdW1XaWR0aCgpOiB2b2lkIHtcblx0XHRjb25zdCB3aWR0aCA9IChcblx0XHRcdHR5cGVvZiB0aGlzLl9jb250ZW50V2lkdGggPT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdD8gdGhpcy5fbWluaW11bVNpemUud2lkdGhcblx0XHRcdFx0OiBNYXRoLm1pbih0aGlzLl9jb250ZW50V2lkdGgsIHRoaXMuX21pbmltdW1TaXplLndpZHRoKVxuXHRcdCk7XG5cdFx0Ly8gV2Ugd2FudCB0byBhdm9pZCB0aGF0IHRoZSBob3ZlciBpcyBhcnRpZmljaWFsbHkgbGFyZ2UsIHNvIHdlIHVzZSB0aGUgY29udGVudCB3aWR0aCBhcyBtaW5pbXVtIHdpZHRoXG5cdFx0dGhpcy5fcmVzaXphYmxlTm9kZS5taW5TaXplID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIHRoaXMuX21pbmltdW1TaXplLmhlaWdodCk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlQ29udGVudHNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbW92ZUNvbnN0cmFpbnRzUmVuZGVyTm9ybWFsbHkoKTtcblx0XHRjb25zdCBjb250ZW50c0RvbU5vZGUgPSB0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGU7XG5cblx0XHRsZXQgaGVpZ2h0ID0gZG9tLmdldFRvdGFsSGVpZ2h0KGNvbnRlbnRzRG9tTm9kZSk7XG5cdFx0bGV0IHdpZHRoID0gZG9tLmdldFRvdGFsV2lkdGgoY29udGVudHNEb21Ob2RlKSArIDI7XG5cdFx0dGhpcy5fcmVzaXphYmxlTm9kZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cblx0XHR0aGlzLl9zZXRIb3ZlcldpZGdldERpbWVuc2lvbnMod2lkdGgsIGhlaWdodCk7XG5cblx0XHRoZWlnaHQgPSBkb20uZ2V0VG90YWxIZWlnaHQoY29udGVudHNEb21Ob2RlKTtcblx0XHR3aWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKGNvbnRlbnRzRG9tTm9kZSk7XG5cdFx0dGhpcy5fY29udGVudFdpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5fdXBkYXRlTWluaW11bVdpZHRoKCk7XG5cdFx0dGhpcy5fcmVzaXphYmxlTm9kZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cblx0XHRpZiAodGhpcy5fcmVuZGVyZWRIb3Zlcj8uc2hvd0F0UG9zaXRpb24pIHtcblx0XHRcdGNvbnN0IHdpZGdldEhlaWdodCA9IGRvbS5nZXRUb3RhbEhlaWdodCh0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlKTtcblx0XHRcdHRoaXMuX3Bvc2l0aW9uUHJlZmVyZW5jZSA9IHRoaXMuX2ZpbmRQb3NpdGlvblByZWZlcmVuY2Uod2lkZ2V0SGVpZ2h0LCB0aGlzLl9yZW5kZXJlZEhvdmVyLnNob3dBdFBvc2l0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fbGF5b3V0Q29udGVudFdpZGdldCgpO1xuXHRcdHRoaXMuX29uQ29udGVudHNDaGFuZ2VkLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgc2Nyb2xsVXAoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5faG92ZXIuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsVG9wO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdHRoaXMuX2hvdmVyLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogc2Nyb2xsVG9wIC0gZm9udEluZm8ubGluZUhlaWdodCB9KTtcblx0fVxuXG5cdHB1YmxpYyBzY3JvbGxEb3duKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuX2hvdmVyLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpLnNjcm9sbFRvcDtcblx0XHRjb25zdCBmb250SW5mbyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHR0aGlzLl9ob3Zlci5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHNjcm9sbFRvcCArIGZvbnRJbmZvLmxpbmVIZWlnaHQgfSk7XG5cdH1cblxuXHRwdWJsaWMgc2Nyb2xsTGVmdCgpOiB2b2lkIHtcblx0XHRjb25zdCBzY3JvbGxMZWZ0ID0gdGhpcy5faG92ZXIuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsTGVmdDtcblx0XHR0aGlzLl9ob3Zlci5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxMZWZ0OiBzY3JvbGxMZWZ0IC0gSE9SSVpPTlRBTF9TQ1JPTExJTkdfQlkgfSk7XG5cdH1cblxuXHRwdWJsaWMgc2Nyb2xsUmlnaHQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsTGVmdCA9IHRoaXMuX2hvdmVyLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpLnNjcm9sbExlZnQ7XG5cdFx0dGhpcy5faG92ZXIuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsTGVmdDogc2Nyb2xsTGVmdCArIEhPUklaT05UQUxfU0NST0xMSU5HX0JZIH0pO1xuXHR9XG5cblx0cHVibGljIHBhZ2VVcCgpOiB2b2lkIHtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLl9ob3Zlci5zY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKS5zY3JvbGxUb3A7XG5cdFx0Y29uc3Qgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5faG92ZXIuc2Nyb2xsYmFyLmdldFNjcm9sbERpbWVuc2lvbnMoKS5oZWlnaHQ7XG5cdFx0dGhpcy5faG92ZXIuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiBzY3JvbGxUb3AgLSBzY3JvbGxIZWlnaHQgfSk7XG5cdH1cblxuXHRwdWJsaWMgcGFnZURvd24oKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5faG92ZXIuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsVG9wO1xuXHRcdGNvbnN0IHNjcm9sbEhlaWdodCA9IHRoaXMuX2hvdmVyLnNjcm9sbGJhci5nZXRTY3JvbGxEaW1lbnNpb25zKCkuaGVpZ2h0O1xuXHRcdHRoaXMuX2hvdmVyLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogc2Nyb2xsVG9wICsgc2Nyb2xsSGVpZ2h0IH0pO1xuXHR9XG5cblx0cHVibGljIGdvVG9Ub3AoKTogdm9pZCB7XG5cdFx0dGhpcy5faG92ZXIuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiAwIH0pO1xuXHR9XG5cblx0cHVibGljIGdvVG9Cb3R0b20oKTogdm9pZCB7XG5cdFx0dGhpcy5faG92ZXIuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiB0aGlzLl9ob3Zlci5zY3JvbGxiYXIuZ2V0U2Nyb2xsRGltZW5zaW9ucygpLnNjcm9sbEhlaWdodCB9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBjb21wdXRlRGlzdGFuY2VGcm9tUG9pbnRUb1JlY3RhbmdsZShwb2ludFg6IG51bWJlciwgcG9pbnRZOiBudW1iZXIsIGxlZnQ6IG51bWJlciwgdG9wOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3QgeCA9IChsZWZ0ICsgd2lkdGggLyAyKTsgLy8geCBjZW50ZXIgb2YgcmVjdGFuZ2xlXG5cdGNvbnN0IHkgPSAodG9wICsgaGVpZ2h0IC8gMik7IC8vIHkgY2VudGVyIG9mIHJlY3RhbmdsZVxuXHRjb25zdCBkeCA9IE1hdGgubWF4KE1hdGguYWJzKHBvaW50WCAtIHgpIC0gd2lkdGggLyAyLCAwKTtcblx0Y29uc3QgZHkgPSBNYXRoLm1heChNYXRoLmFicyhwb2ludFkgLSB5KSAtIGhlaWdodCAvIDIsIDApO1xuXHRyZXR1cm4gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsdUNBQTRFO0FBQ3JGLFNBQW9DLG9CQUFvQjtBQUN4RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEIsbUJBQW1CO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUl4QixNQUFNLDBCQUEwQjtBQUV6QixJQUFNLHFCQUFOLGNBQWlDLHVCQUF1QjtBQUFBLEVBbUM5RCxZQUNDLFFBQ29CLG1CQUNvQix1QkFDQSx1QkFDSCxvQkFDcEM7QUFDRCxVQUFNLGdCQUFnQixPQUFPLFVBQVUsYUFBYSxVQUFVLElBQUk7QUFDbEUsVUFBTSxlQUFlO0FBQ3JCLFVBQU0sY0FBYyxJQUFJLElBQUksVUFBVSxjQUFjLGFBQWE7QUFDakUsVUFBTSxRQUFRLFdBQVc7QUFQZTtBQUNBO0FBQ0g7QUE5QnRDLFNBQWlCLFNBQXNCLEtBQUssVUFBVSxJQUFJLFlBQVksSUFBSSxDQUFDO0FBSTNFLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2xFLFNBQWdCLGNBQWMsS0FBSyxhQUFh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
