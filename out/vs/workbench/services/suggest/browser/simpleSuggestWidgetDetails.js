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
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import * as nls from "../../../../nls.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
function canExpandCompletionItem(item) {
  return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}
const SuggestDetailsClassName = "suggest-details";
var SimpleSuggestDetailsPlacement = /* @__PURE__ */ ((SimpleSuggestDetailsPlacement2) => {
  SimpleSuggestDetailsPlacement2[SimpleSuggestDetailsPlacement2["East"] = 0] = "East";
  SimpleSuggestDetailsPlacement2[SimpleSuggestDetailsPlacement2["West"] = 1] = "West";
  SimpleSuggestDetailsPlacement2[SimpleSuggestDetailsPlacement2["South"] = 2] = "South";
  SimpleSuggestDetailsPlacement2[SimpleSuggestDetailsPlacement2["North"] = 3] = "North";
  return SimpleSuggestDetailsPlacement2;
})(SimpleSuggestDetailsPlacement || {});
let SimpleSuggestDetailsWidget = class {
  constructor(_getFontInfo, onDidFontInfoChange, _getAdvancedExplainModeDetails, instaService, markdownRendererService) {
    this._getFontInfo = _getFontInfo;
    this._getAdvancedExplainModeDetails = _getAdvancedExplainModeDetails;
    this.markdownRendererService = markdownRendererService;
    this._onDidClose = new Emitter();
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeContents = new Emitter();
    this.onDidChangeContents = this._onDidChangeContents.event;
    this._disposables = new DisposableStore();
    this._renderDisposeable = this._disposables.add(new DisposableStore());
    this._borderWidth = 1;
    this._size = new dom.Dimension(330, 0);
    this.domNode = dom.$(".suggest-details");
    this.domNode.classList.add("no-docs");
    this._body = dom.$(".body");
    this._scrollbar = new DomScrollableElement(this._body, {
      alwaysConsumeMouseWheel: true
    });
    dom.append(this.domNode, this._scrollbar.getDomNode());
    this._disposables.add(this._scrollbar);
    this._header = dom.append(this._body, dom.$(".header"));
    this._close = dom.append(this._header, dom.$("span" + ThemeIcon.asCSSSelector(Codicon.close)));
    this._close.title = nls.localize("details.close", "Close");
    this._close.role = "button";
    this._close.tabIndex = -1;
    this._type = dom.append(this._header, dom.$("p.type"));
    this._docs = dom.append(this._body, dom.$("p.docs"));
    this._configureFont();
    this._disposables.add(onDidFontInfoChange(() => this._configureFont()));
  }
  _configureFont() {
    const fontInfo = this._getFontInfo();
    const fontFamily = fontInfo.fontFamily;
    const fontSize = fontInfo.fontSize;
    const lineHeight = fontInfo.lineHeight;
    const fontWeight = fontInfo.fontWeight;
    const fontSizePx = `${fontSize}px`;
    const lineHeightPx = `${lineHeight}px`;
    this.domNode.style.fontSize = fontSizePx;
    this.domNode.style.lineHeight = `${lineHeight / fontSize}`;
    this.domNode.style.fontWeight = fontWeight;
    this._type.style.fontFamily = fontFamily;
    this._close.style.height = lineHeightPx;
    this._close.style.width = lineHeightPx;
  }
  dispose() {
    this._disposables.dispose();
    this._onDidClose.dispose();
    this._onDidChangeContents.dispose();
  }
  getLayoutInfo() {
    const lineHeight = this._getFontInfo().lineHeight;
    const borderWidth = this._borderWidth;
    const borderHeight = borderWidth * 2;
    return {
      lineHeight,
      borderWidth,
      borderHeight,
      verticalPadding: 22,
      horizontalPadding: 14
    };
  }
  renderLoading() {
    this._type.textContent = nls.localize("loading", "Loading...");
    this._docs.textContent = "";
    this.domNode.classList.remove("no-docs", "no-type");
    this.layout(this.size.width, this.getLayoutInfo().lineHeight * 2);
    this._onDidChangeContents.fire(this);
  }
  renderItem(item, explainMode) {
    this._renderDisposeable.clear();
    let { detail, documentation } = item.completion;
    let md = "";
    if (explainMode) {
      md += `score: ${item.score[0]}
`;
      md += `prefix: ${item.word ?? "(no prefix)"}
`;
      const vs = item.completion.replacementRange;
      md += `valueSelection: ${vs ? `[${vs[0]}, ${vs[1]}]` : "undefined"}
`;
      md += `index: ${item.idx}
`;
      if (this._getAdvancedExplainModeDetails) {
        const advancedDetails = this._getAdvancedExplainModeDetails();
        if (advancedDetails) {
          md += `${advancedDetails}
`;
        }
      }
      detail = `Provider: ${item.completion.provider}`;
      documentation = new MarkdownString().appendCodeblock("empty", md);
    }
    const hasDetail = typeof detail === "string" ? detail.trim().length > 0 : !!detail;
    const hasDocs = typeof documentation === "string" ? documentation.trim().length > 0 : !!(documentation && documentation.value?.trim().length > 0);
    const updateSize = () => {
      this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
      this._onDidChangeContents.fire(this);
    };
    if (!explainMode && (!canExpandCompletionItem(item) || !hasDetail && !hasDocs)) {
      this.clearContents();
      return;
    }
    this.domNode.classList.remove("no-docs", "no-type");
    if (hasDetail && detail) {
      const cappedDetail = detail.length > 1e5 ? `${detail.substr(0, 1e5)}\u2026` : detail;
      this._type.textContent = cappedDetail;
      this._type.title = cappedDetail;
      dom.show(this._type);
      this._type.classList.toggle("auto-wrap", !/\r?\n^\s+/gmi.test(cappedDetail));
    } else {
      dom.clearNode(this._type);
      this._type.title = "";
      dom.hide(this._type);
      this.domNode.classList.add("no-type");
    }
    dom.clearNode(this._docs);
    if (hasDocs && typeof documentation === "string") {
      this._docs.classList.remove("markdown-docs");
      this._docs.textContent = documentation;
    } else if (hasDocs && documentation && typeof documentation !== "string") {
      this._docs.classList.add("markdown-docs");
      dom.clearNode(this._docs);
      const renderedContents = this.markdownRendererService.render(documentation, {
        asyncRenderCallback: () => {
          updateSize();
        }
      });
      this._docs.appendChild(renderedContents.element);
      this._renderDisposeable.add(renderedContents);
    } else {
      this._docs.classList.remove("markdown-docs");
    }
    this.domNode.classList.toggle("detail-and-doc", hasDetail && hasDocs);
    this.domNode.style.userSelect = "text";
    this.domNode.tabIndex = -1;
    this._close.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    this._close.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._onDidClose.fire();
    };
    this._body.scrollTop = 0;
    updateSize();
  }
  clearContents() {
    this.domNode.classList.add("no-docs");
    this._type.textContent = "";
    this._docs.textContent = "";
  }
  get isEmpty() {
    return this.domNode.classList.contains("no-docs");
  }
  get size() {
    return this._size;
  }
  layout(width, height) {
    const newSize = new dom.Dimension(width, height);
    if (!dom.Dimension.equals(newSize, this._size)) {
      this._size = newSize;
      dom.size(this.domNode, width, height);
    }
    this._scrollbar.scanDomNode();
  }
  scrollDown(much = 8) {
    this._body.scrollTop += much;
  }
  scrollUp(much = 8) {
    this._body.scrollTop -= much;
  }
  scrollTop() {
    this._body.scrollTop = 0;
  }
  scrollBottom() {
    this._body.scrollTop = this._body.scrollHeight;
  }
  pageDown() {
    this.scrollDown(80);
  }
  pageUp() {
    this.scrollUp(80);
  }
  set borderWidth(width) {
    this._borderWidth = width;
  }
  get borderWidth() {
    return this._borderWidth;
  }
  focus() {
    this.domNode.focus();
  }
};
SimpleSuggestDetailsWidget = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IMarkdownRendererService)
], SimpleSuggestDetailsWidget);
class SimpleSuggestDetailsOverlay {
  constructor(widget, _container, preventPlacements) {
    this.widget = widget;
    this._container = _container;
    this._disposables = new DisposableStore();
    this._added = false;
    this._resizable = this._disposables.add(new ResizableHTMLElement());
    this._resizable.domNode.classList.add("suggest-details-container");
    this._resizable.domNode.appendChild(widget.domNode);
    this._resizable.enableSashes(false, true, true, false);
    this._preventPlacements = preventPlacements && preventPlacements.length ? new Set(preventPlacements) : void 0;
    let topLeftNow;
    let sizeNow;
    let deltaTop = 0;
    let deltaLeft = 0;
    this._disposables.add(this._resizable.onDidWillResize(() => {
      topLeftNow = this._topLeft;
      sizeNow = this._resizable.size;
    }));
    this._disposables.add(this._resizable.onDidResize((e) => {
      if (topLeftNow && sizeNow) {
        this.widget.layout(e.dimension.width, e.dimension.height);
        let updateTopLeft = false;
        if (e.west) {
          deltaLeft = sizeNow.width - e.dimension.width;
          updateTopLeft = true;
        }
        if (e.north) {
          deltaTop = sizeNow.height - e.dimension.height;
          updateTopLeft = true;
        }
        if (updateTopLeft) {
          this._applyTopLeft({
            top: topLeftNow.top + deltaTop,
            left: topLeftNow.left + deltaLeft
          });
        }
      }
      if (e.done) {
        topLeftNow = void 0;
        sizeNow = void 0;
        deltaTop = 0;
        deltaLeft = 0;
        this._userSize = e.dimension;
      }
    }));
    this._disposables.add(this.widget.onDidChangeContents(() => {
      if (this._anchorBox) {
        this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size);
      }
    }));
  }
  dispose() {
    this.widget.dispose();
    this._disposables.dispose();
    this.hide();
  }
  getId() {
    return "suggest.details";
  }
  getDomNode() {
    return this._resizable.domNode;
  }
  show() {
    if (!this._added) {
      this._container.appendChild(this._resizable.domNode);
      this._added = true;
    }
  }
  hide(sessionEnded = false) {
    this._resizable.clearSashHoverState();
    if (this._added) {
      this._container.removeChild(this._resizable.domNode);
      this._added = false;
      this._anchorBox = void 0;
    }
    if (sessionEnded) {
      this._userSize = void 0;
      this.widget.clearContents();
    }
  }
  placeAtAnchor(anchor) {
    const anchorBox = anchor.getBoundingClientRect();
    this._anchorBox = anchorBox;
    this.widget.layout(this._resizable.size.width, this._resizable.size.height);
    this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size);
  }
  _placeAtAnchor(anchorBox, size) {
    const bodyBox = dom.getClientArea(this.getDomNode().ownerDocument.body);
    const info = this.widget.getLayoutInfo();
    const defaultMinSize = new dom.Dimension(220, 2 * info.lineHeight);
    const defaultTop = anchorBox.top;
    const eastPlacement = (function() {
      const width = bodyBox.width - (anchorBox.left + anchorBox.width + info.borderWidth + info.horizontalPadding);
      const left2 = -info.borderWidth + anchorBox.left + anchorBox.width;
      const maxSizeTop = new dom.Dimension(width, bodyBox.height - anchorBox.top - info.borderHeight - info.verticalPadding);
      const maxSizeBottom = maxSizeTop.with(void 0, anchorBox.top + anchorBox.height - info.borderHeight - info.verticalPadding);
      return { top: defaultTop, left: left2, fit: width - size.width, maxSizeTop, maxSizeBottom, minSize: defaultMinSize.with(Math.min(width, defaultMinSize.width)) };
    })();
    const westPlacement = (function() {
      const width = anchorBox.left - info.borderWidth - info.horizontalPadding;
      const left2 = Math.max(info.horizontalPadding, anchorBox.left - size.width - info.borderWidth);
      const maxSizeTop = new dom.Dimension(width, bodyBox.height - anchorBox.top - info.borderHeight - info.verticalPadding);
      const maxSizeBottom = maxSizeTop.with(void 0, anchorBox.top + anchorBox.height - info.borderHeight - info.verticalPadding);
      return { top: defaultTop, left: left2, fit: width - size.width, maxSizeTop, maxSizeBottom, minSize: defaultMinSize.with(Math.min(width, defaultMinSize.width)) };
    })();
    const southPlacement = (function() {
      const left2 = anchorBox.left;
      const top2 = -info.borderWidth + anchorBox.top + anchorBox.height;
      const maxSizeBottom = new dom.Dimension(anchorBox.width - info.borderHeight, bodyBox.height - anchorBox.top - anchorBox.height - info.verticalPadding);
      return { top: top2, left: left2, fit: maxSizeBottom.height - size.height, maxSizeBottom, maxSizeTop: maxSizeBottom, minSize: defaultMinSize.with(maxSizeBottom.width) };
    })();
    const northPlacement = (function() {
      const width = Math.max(anchorBox.width - info.borderHeight, 0);
      const left2 = anchorBox.left;
      const maxHeightAbove = Math.max(anchorBox.top - info.verticalPadding, 0);
      const heightForTop = Math.min(size.height, maxHeightAbove);
      const top2 = anchorBox.top - info.borderWidth - heightForTop;
      const maxSize2 = new dom.Dimension(width, Math.max(maxHeightAbove, 0));
      return { top: top2, left: left2, fit: maxSize2.height - size.height, maxSizeTop: maxSize2, maxSizeBottom: maxSize2, minSize: defaultMinSize.with(maxSize2.width) };
    })();
    const placementEntries = [
      [0 /* East */, eastPlacement],
      [2 /* South */, southPlacement],
      [3 /* North */, northPlacement],
      [1 /* West */, westPlacement]
    ];
    const orientations = (this._preventPlacements ? placementEntries.filter(([direction]) => !this._preventPlacements.has(direction)) : placementEntries).map(([, entry]) => entry);
    const candidates = orientations.length ? orientations : placementEntries.map(([, entry]) => entry);
    const placement = candidates.find((p) => p.fit >= 0) ?? candidates.reduce((best, current) => !best || current.fit > best.fit ? current : best, void 0) ?? eastPlacement;
    const bottom = anchorBox.top + anchorBox.height - info.borderHeight;
    let alignAtTop;
    let height = size.height;
    const maxHeight = Math.max(placement.maxSizeTop.height, placement.maxSizeBottom.height);
    if (height > maxHeight) {
      height = maxHeight;
    }
    let maxSize;
    if (height <= placement.maxSizeTop.height) {
      alignAtTop = true;
      maxSize = placement.maxSizeTop;
    } else {
      alignAtTop = false;
      maxSize = placement.maxSizeBottom;
    }
    let { top, left } = placement;
    if (!alignAtTop && height > anchorBox.height) {
      top = bottom - height;
    }
    const editorDomNode = this._container;
    if (editorDomNode) {
      const editorBoundingBox = editorDomNode.getBoundingClientRect();
      top -= editorBoundingBox.top;
      left -= editorBoundingBox.left;
    }
    this._applyTopLeft({ left, top });
    this._resizable.enableSashes(!alignAtTop, placement === eastPlacement, alignAtTop, placement !== eastPlacement);
    this._resizable.minSize = placement.minSize;
    this._resizable.maxSize = maxSize;
    this._resizable.layout(height, Math.min(maxSize.width, size.width));
    this.widget.layout(this._resizable.size.width, this._resizable.size.height);
  }
  _applyTopLeft(topLeft) {
    this._topLeft = topLeft;
    this._resizable.domNode.style.top = `${topLeft.top}px`;
    this._resizable.domNode.style.left = `${topLeft.left}px`;
    this._resizable.domNode.style.position = "absolute";
  }
}
export {
  SimpleSuggestDetailsOverlay,
  SimpleSuggestDetailsPlacement,
  SimpleSuggestDetailsWidget,
  SuggestDetailsClassName,
  canExpandCompletionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzdWdnZXN0XFxicm93c2VyXFxzaW1wbGVTdWdnZXN0V2lkZ2V0RGV0YWlscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc2l6YWJsZUhUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Jlc2l6YWJsZS9yZXNpemFibGUuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBTaW1wbGVDb21wbGV0aW9uSXRlbSB9IGZyb20gJy4vc2ltcGxlQ29tcGxldGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU2ltcGxlU3VnZ2VzdFdpZGdldEZvbnRJbmZvIH0gZnJvbSAnLi9zaW1wbGVTdWdnZXN0V2lkZ2V0UmVuZGVyZXIuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gY2FuRXhwYW5kQ29tcGxldGlvbkl0ZW0oaXRlbTogU2ltcGxlQ29tcGxldGlvbkl0ZW0gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuICEhaXRlbSAmJiBCb29sZWFuKGl0ZW0uY29tcGxldGlvbi5kb2N1bWVudGF0aW9uIHx8IGl0ZW0uY29tcGxldGlvbi5kZXRhaWwgJiYgaXRlbS5jb21wbGV0aW9uLmRldGFpbCAhPT0gaXRlbS5jb21wbGV0aW9uLmxhYmVsKTtcbn1cblxuZXhwb3J0IGNvbnN0IFN1Z2dlc3REZXRhaWxzQ2xhc3NOYW1lID0gJ3N1Z2dlc3QtZGV0YWlscyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNpbXBsZVN1Z2dlc3REZXRhaWxzUGxhY2VtZW50IHtcblx0RWFzdCA9IDAsXG5cdFdlc3QgPSAxLFxuXHRTb3V0aCA9IDIsXG5cdE5vcnRoID0gM1xufVxuXG5leHBvcnQgY2xhc3MgU2ltcGxlU3VnZ2VzdERldGFpbHNXaWRnZXQge1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxEaXZFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50cyA9IG5ldyBFbWl0dGVyPHRoaXM+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudHM6IEV2ZW50PHRoaXM+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jbG9zZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njcm9sbGJhcjogRG9tU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2JvZHk6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oZWFkZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90eXBlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9jczogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckRpc3Bvc2VhYmxlID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2JvcmRlcldpZHRoOiBudW1iZXIgPSAxO1xuXHRwcml2YXRlIF9zaXplID0gbmV3IGRvbS5EaW1lbnNpb24oMzMwLCAwKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRGb250SW5mbzogKCkgPT4gSVNpbXBsZVN1Z2dlc3RXaWRnZXRGb250SW5mbyxcblx0XHRvbkRpZEZvbnRJbmZvQ2hhbmdlOiBFdmVudDx2b2lkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRBZHZhbmNlZEV4cGxhaW5Nb2RlRGV0YWlsczogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvbS4kKCcuc3VnZ2VzdC1kZXRhaWxzJyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ25vLWRvY3MnKTtcblxuXHRcdHRoaXMuX2JvZHkgPSBkb20uJCgnLmJvZHknKTtcblxuXHRcdHRoaXMuX3Njcm9sbGJhciA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLl9ib2R5LCB7XG5cdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogdHJ1ZSxcblx0XHR9KTtcblx0XHRkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgdGhpcy5fc2Nyb2xsYmFyLmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3Njcm9sbGJhcik7XG5cblx0XHR0aGlzLl9oZWFkZXIgPSBkb20uYXBwZW5kKHRoaXMuX2JvZHksIGRvbS4kKCcuaGVhZGVyJykpO1xuXHRcdHRoaXMuX2Nsb3NlID0gZG9tLmFwcGVuZCh0aGlzLl9oZWFkZXIsIGRvbS4kKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKENvZGljb24uY2xvc2UpKSk7XG5cdFx0dGhpcy5fY2xvc2UudGl0bGUgPSBubHMubG9jYWxpemUoJ2RldGFpbHMuY2xvc2UnLCBcIkNsb3NlXCIpO1xuXHRcdHRoaXMuX2Nsb3NlLnJvbGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLl9jbG9zZS50YWJJbmRleCA9IC0xO1xuXHRcdHRoaXMuX3R5cGUgPSBkb20uYXBwZW5kKHRoaXMuX2hlYWRlciwgZG9tLiQoJ3AudHlwZScpKTtcblxuXHRcdHRoaXMuX2RvY3MgPSBkb20uYXBwZW5kKHRoaXMuX2JvZHksIGRvbS4kKCdwLmRvY3MnKSk7XG5cblx0XHR0aGlzLl9jb25maWd1cmVGb250KCk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQob25EaWRGb250SW5mb0NoYW5nZSgoKSA9PiB0aGlzLl9jb25maWd1cmVGb250KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbmZpZ3VyZUZvbnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLl9nZXRGb250SW5mbygpO1xuXHRcdGNvbnN0IGZvbnRGYW1pbHkgPSBmb250SW5mby5mb250RmFtaWx5O1xuXG5cdFx0Y29uc3QgZm9udFNpemUgPSBmb250SW5mby5mb250U2l6ZTtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gZm9udEluZm8ubGluZUhlaWdodDtcblx0XHRjb25zdCBmb250V2VpZ2h0ID0gZm9udEluZm8uZm9udFdlaWdodDtcblx0XHRjb25zdCBmb250U2l6ZVB4ID0gYCR7Zm9udFNpemV9cHhgO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHRQeCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmZvbnRTaXplID0gZm9udFNpemVQeDtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUubGluZUhlaWdodCA9IGAke2xpbmVIZWlnaHQgLyBmb250U2l6ZX1gO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5mb250V2VpZ2h0ID0gZm9udFdlaWdodDtcblx0XHQvLyB0aGlzLmRvbU5vZGUuc3R5bGUuZm9udEZlYXR1cmVTZXR0aW5ncyA9IGZvbnRJbmZvLmZvbnRGZWF0dXJlU2V0dGluZ3M7XG5cdFx0dGhpcy5fdHlwZS5zdHlsZS5mb250RmFtaWx5ID0gZm9udEZhbWlseTtcblx0XHR0aGlzLl9jbG9zZS5zdHlsZS5oZWlnaHQgPSBsaW5lSGVpZ2h0UHg7XG5cdFx0dGhpcy5fY2xvc2Uuc3R5bGUud2lkdGggPSBsaW5lSGVpZ2h0UHg7XG5cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2xvc2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudHMuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0TGF5b3V0SW5mbygpIHtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fZ2V0Rm9udEluZm8oKS5saW5lSGVpZ2h0O1xuXHRcdGNvbnN0IGJvcmRlcldpZHRoID0gdGhpcy5fYm9yZGVyV2lkdGg7XG5cdFx0Y29uc3QgYm9yZGVySGVpZ2h0ID0gYm9yZGVyV2lkdGggKiAyO1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaW5lSGVpZ2h0LFxuXHRcdFx0Ym9yZGVyV2lkdGgsXG5cdFx0XHRib3JkZXJIZWlnaHQsXG5cdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDIyLFxuXHRcdFx0aG9yaXpvbnRhbFBhZGRpbmc6IDE0XG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckxvYWRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fdHlwZS50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnbG9hZGluZycsIFwiTG9hZGluZy4uLlwiKTtcblx0XHR0aGlzLl9kb2NzLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ25vLWRvY3MnLCAnbm8tdHlwZScpO1xuXHRcdHRoaXMubGF5b3V0KHRoaXMuc2l6ZS53aWR0aCwgdGhpcy5nZXRMYXlvdXRJbmZvKCkubGluZUhlaWdodCAqIDIpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudHMuZmlyZSh0aGlzKTtcblx0fVxuXG5cdHJlbmRlckl0ZW0oaXRlbTogU2ltcGxlQ29tcGxldGlvbkl0ZW0sIGV4cGxhaW5Nb2RlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zZWFibGUuY2xlYXIoKTtcblxuXHRcdGxldCB7IGRldGFpbCwgZG9jdW1lbnRhdGlvbiB9ID0gaXRlbS5jb21wbGV0aW9uO1xuXG5cdFx0bGV0IG1kID0gJyc7XG5cblx0XHRpZiAoZXhwbGFpbk1vZGUpIHtcblx0XHRcdG1kICs9IGBzY29yZTogJHtpdGVtLnNjb3JlWzBdfVxcbmA7XG5cdFx0XHRtZCArPSBgcHJlZml4OiAke2l0ZW0ud29yZCA/PyAnKG5vIHByZWZpeCknfVxcbmA7XG5cdFx0XHRjb25zdCB2cyA9IGl0ZW0uY29tcGxldGlvbi5yZXBsYWNlbWVudFJhbmdlO1xuXHRcdFx0bWQgKz0gYHZhbHVlU2VsZWN0aW9uOiAke3ZzID8gYFske3ZzWzBdfSwgJHt2c1sxXX1dYCA6ICd1bmRlZmluZWQnfVxcbmA7XG5cdFx0XHRtZCArPSBgaW5kZXg6ICR7aXRlbS5pZHh9XFxuYDtcblx0XHRcdGlmICh0aGlzLl9nZXRBZHZhbmNlZEV4cGxhaW5Nb2RlRGV0YWlscykge1xuXHRcdFx0XHRjb25zdCBhZHZhbmNlZERldGFpbHMgPSB0aGlzLl9nZXRBZHZhbmNlZEV4cGxhaW5Nb2RlRGV0YWlscygpO1xuXHRcdFx0XHRpZiAoYWR2YW5jZWREZXRhaWxzKSB7XG5cdFx0XHRcdFx0bWQgKz0gYCR7YWR2YW5jZWREZXRhaWxzfVxcbmA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGRldGFpbCA9IGBQcm92aWRlcjogJHtpdGVtLmNvbXBsZXRpb24ucHJvdmlkZXJ9YDtcblx0XHRcdGRvY3VtZW50YXRpb24gPSBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRDb2RlYmxvY2soJ2VtcHR5JywgbWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0RldGFpbCA9IHR5cGVvZiBkZXRhaWwgPT09ICdzdHJpbmcnID8gZGV0YWlsLnRyaW0oKS5sZW5ndGggPiAwIDogISFkZXRhaWw7XG5cdFx0Y29uc3QgaGFzRG9jcyA9IHR5cGVvZiBkb2N1bWVudGF0aW9uID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBkb2N1bWVudGF0aW9uLnRyaW0oKS5sZW5ndGggPiAwXG5cdFx0XHQ6ICEhKGRvY3VtZW50YXRpb24gJiYgZG9jdW1lbnRhdGlvbi52YWx1ZT8udHJpbSgpLmxlbmd0aCA+IDApO1xuXG5cdFx0Y29uc3QgdXBkYXRlU2l6ZSA9ICgpID0+IHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX3NpemUud2lkdGgsIHRoaXMuX3R5cGUuY2xpZW50SGVpZ2h0ICsgdGhpcy5fZG9jcy5jbGllbnRIZWlnaHQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50cy5maXJlKHRoaXMpO1xuXHRcdH07XG5cblx0XHRpZiAoIWV4cGxhaW5Nb2RlICYmICghY2FuRXhwYW5kQ29tcGxldGlvbkl0ZW0oaXRlbSkgfHwgKCFoYXNEZXRhaWwgJiYgIWhhc0RvY3MpKSkge1xuXHRcdFx0dGhpcy5jbGVhckNvbnRlbnRzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ25vLWRvY3MnLCAnbm8tdHlwZScpO1xuXG5cdFx0Ly8gLS0tIGRldGFpbHNcblxuXHRcdGlmIChoYXNEZXRhaWwgJiYgZGV0YWlsKSB7XG5cdFx0XHRjb25zdCBjYXBwZWREZXRhaWwgPSBkZXRhaWwubGVuZ3RoID4gMTAwMDAwID8gYCR7ZGV0YWlsLnN1YnN0cigwLCAxMDAwMDApfVx1MjAyNmAgOiBkZXRhaWw7XG5cdFx0XHR0aGlzLl90eXBlLnRleHRDb250ZW50ID0gY2FwcGVkRGV0YWlsO1xuXHRcdFx0dGhpcy5fdHlwZS50aXRsZSA9IGNhcHBlZERldGFpbDtcblx0XHRcdGRvbS5zaG93KHRoaXMuX3R5cGUpO1xuXHRcdFx0dGhpcy5fdHlwZS5jbGFzc0xpc3QudG9nZ2xlKCdhdXRvLXdyYXAnLCAhL1xccj9cXG5eXFxzKy9nbWkudGVzdChjYXBwZWREZXRhaWwpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl90eXBlKTtcblx0XHRcdHRoaXMuX3R5cGUudGl0bGUgPSAnJztcblx0XHRcdGRvbS5oaWRlKHRoaXMuX3R5cGUpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ25vLXR5cGUnKTtcblx0XHR9XG5cblx0XHQvLyAvLyAtLS0gZG9jdW1lbnRhdGlvblxuXG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9kb2NzKTtcblx0XHRpZiAoaGFzRG9jcyAmJiB0eXBlb2YgZG9jdW1lbnRhdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuX2RvY3MuY2xhc3NMaXN0LnJlbW92ZSgnbWFya2Rvd24tZG9jcycpO1xuXHRcdFx0dGhpcy5fZG9jcy50ZXh0Q29udGVudCA9IGRvY3VtZW50YXRpb247XG5cblx0XHR9IGVsc2UgaWYgKGhhc0RvY3MgJiYgZG9jdW1lbnRhdGlvbiAmJiB0eXBlb2YgZG9jdW1lbnRhdGlvbiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuX2RvY3MuY2xhc3NMaXN0LmFkZCgnbWFya2Rvd24tZG9jcycpO1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9kb2NzKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkQ29udGVudHMgPSB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihkb2N1bWVudGF0aW9uLCB7XG5cdFx0XHRcdGFzeW5jUmVuZGVyQ2FsbGJhY2s6ICgpID0+IHtcblx0XHRcdFx0XHR1cGRhdGVTaXplKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZG9jcy5hcHBlbmRDaGlsZChyZW5kZXJlZENvbnRlbnRzLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zZWFibGUuYWRkKHJlbmRlcmVkQ29udGVudHMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kb2NzLmNsYXNzTGlzdC5yZW1vdmUoJ21hcmtkb3duLWRvY3MnKTtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZGV0YWlsLWFuZC1kb2MnLCBoYXNEZXRhaWwgJiYgaGFzRG9jcyk7XG5cblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUudXNlclNlbGVjdCA9ICd0ZXh0Jztcblx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblxuXHRcdHRoaXMuX2Nsb3NlLm9ubW91c2Vkb3duID0gZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH07XG5cdFx0dGhpcy5fY2xvc2Uub25jbGljayA9IGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9ib2R5LnNjcm9sbFRvcCA9IDA7XG5cblx0XHR1cGRhdGVTaXplKCk7XG5cdH1cblxuXHRjbGVhckNvbnRlbnRzKCkge1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCduby1kb2NzJyk7XG5cdFx0dGhpcy5fdHlwZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMuX2RvY3MudGV4dENvbnRlbnQgPSAnJztcblx0fVxuXG5cdGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCduby1kb2NzJyk7XG5cdH1cblxuXHRnZXQgc2l6ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2l6ZTtcblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1NpemUgPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0XHRpZiAoIWRvbS5EaW1lbnNpb24uZXF1YWxzKG5ld1NpemUsIHRoaXMuX3NpemUpKSB7XG5cdFx0XHR0aGlzLl9zaXplID0gbmV3U2l6ZTtcblx0XHRcdGRvbS5zaXplKHRoaXMuZG9tTm9kZSwgd2lkdGgsIGhlaWdodCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Njcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0c2Nyb2xsRG93bihtdWNoID0gOCk6IHZvaWQge1xuXHRcdHRoaXMuX2JvZHkuc2Nyb2xsVG9wICs9IG11Y2g7XG5cdH1cblxuXHRzY3JvbGxVcChtdWNoID0gOCk6IHZvaWQge1xuXHRcdHRoaXMuX2JvZHkuc2Nyb2xsVG9wIC09IG11Y2g7XG5cdH1cblxuXHRzY3JvbGxUb3AoKTogdm9pZCB7XG5cdFx0dGhpcy5fYm9keS5zY3JvbGxUb3AgPSAwO1xuXHR9XG5cblx0c2Nyb2xsQm90dG9tKCk6IHZvaWQge1xuXHRcdHRoaXMuX2JvZHkuc2Nyb2xsVG9wID0gdGhpcy5fYm9keS5zY3JvbGxIZWlnaHQ7XG5cdH1cblxuXHRwYWdlRG93bigpOiB2b2lkIHtcblx0XHR0aGlzLnNjcm9sbERvd24oODApO1xuXHR9XG5cblx0cGFnZVVwKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Nyb2xsVXAoODApO1xuXHR9XG5cblx0c2V0IGJvcmRlcldpZHRoKHdpZHRoOiBudW1iZXIpIHtcblx0XHR0aGlzLl9ib3JkZXJXaWR0aCA9IHdpZHRoO1xuXHR9XG5cblx0Z2V0IGJvcmRlcldpZHRoKCkge1xuXHRcdHJldHVybiB0aGlzLl9ib3JkZXJXaWR0aDtcblx0fVxuXG5cdGZvY3VzKCkge1xuXHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaW1wbGVTdWdnZXN0RGV0YWlsc092ZXJsYXkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNpemFibGU6IFJlc2l6YWJsZUhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgX2FkZGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2FuY2hvckJveD86IGRvbS5JRG9tTm9kZVBhZ2VQb3NpdGlvbjtcblx0Ly8gcHJpdmF0ZSBfcHJlZmVyQWxpZ25BdFRvcDogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgX3VzZXJTaXplPzogZG9tLkRpbWVuc2lvbjtcblx0cHJpdmF0ZSBfdG9wTGVmdD86IFRvcExlZnRQb3NpdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmVudFBsYWNlbWVudHM/OiBSZWFkb25seVNldDxTaW1wbGVTdWdnZXN0RGV0YWlsc1BsYWNlbWVudD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgd2lkZ2V0OiBTaW1wbGVTdWdnZXN0RGV0YWlsc1dpZGdldCxcblx0XHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByZXZlbnRQbGFjZW1lbnRzPzogcmVhZG9ubHkgU2ltcGxlU3VnZ2VzdERldGFpbHNQbGFjZW1lbnRbXVxuXHQpIHtcblxuXHRcdHRoaXMuX3Jlc2l6YWJsZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgUmVzaXphYmxlSFRNTEVsZW1lbnQoKSk7XG5cdFx0dGhpcy5fcmVzaXphYmxlLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnc3VnZ2VzdC1kZXRhaWxzLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5kb21Ob2RlLmFwcGVuZENoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0XHR0aGlzLl9yZXNpemFibGUuZW5hYmxlU2FzaGVzKGZhbHNlLCB0cnVlLCB0cnVlLCBmYWxzZSk7XG5cdFx0dGhpcy5fcHJldmVudFBsYWNlbWVudHMgPSBwcmV2ZW50UGxhY2VtZW50cyAmJiBwcmV2ZW50UGxhY2VtZW50cy5sZW5ndGggPyBuZXcgU2V0KHByZXZlbnRQbGFjZW1lbnRzKSA6IHVuZGVmaW5lZDtcblxuXHRcdGxldCB0b3BMZWZ0Tm93OiBUb3BMZWZ0UG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNpemVOb3c6IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlbHRhVG9wOiBudW1iZXIgPSAwO1xuXHRcdGxldCBkZWx0YUxlZnQ6IG51bWJlciA9IDA7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3Jlc2l6YWJsZS5vbkRpZFdpbGxSZXNpemUoKCkgPT4ge1xuXHRcdFx0dG9wTGVmdE5vdyA9IHRoaXMuX3RvcExlZnQ7XG5cdFx0XHRzaXplTm93ID0gdGhpcy5fcmVzaXphYmxlLnNpemU7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3Jlc2l6YWJsZS5vbkRpZFJlc2l6ZShlID0+IHtcblx0XHRcdGlmICh0b3BMZWZ0Tm93ICYmIHNpemVOb3cpIHtcblx0XHRcdFx0dGhpcy53aWRnZXQubGF5b3V0KGUuZGltZW5zaW9uLndpZHRoLCBlLmRpbWVuc2lvbi5oZWlnaHQpO1xuXG5cdFx0XHRcdGxldCB1cGRhdGVUb3BMZWZ0ID0gZmFsc2U7XG5cdFx0XHRcdGlmIChlLndlc3QpIHtcblx0XHRcdFx0XHRkZWx0YUxlZnQgPSBzaXplTm93LndpZHRoIC0gZS5kaW1lbnNpb24ud2lkdGg7XG5cdFx0XHRcdFx0dXBkYXRlVG9wTGVmdCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUubm9ydGgpIHtcblx0XHRcdFx0XHRkZWx0YVRvcCA9IHNpemVOb3cuaGVpZ2h0IC0gZS5kaW1lbnNpb24uaGVpZ2h0O1xuXHRcdFx0XHRcdHVwZGF0ZVRvcExlZnQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1cGRhdGVUb3BMZWZ0KSB7XG5cdFx0XHRcdFx0dGhpcy5fYXBwbHlUb3BMZWZ0KHtcblx0XHRcdFx0XHRcdHRvcDogdG9wTGVmdE5vdy50b3AgKyBkZWx0YVRvcCxcblx0XHRcdFx0XHRcdGxlZnQ6IHRvcExlZnROb3cubGVmdCArIGRlbHRhTGVmdCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGUuZG9uZSkge1xuXHRcdFx0XHR0b3BMZWZ0Tm93ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRzaXplTm93ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRkZWx0YVRvcCA9IDA7XG5cdFx0XHRcdGRlbHRhTGVmdCA9IDA7XG5cdFx0XHRcdHRoaXMuX3VzZXJTaXplID0gZS5kaW1lbnNpb247XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlQ29udGVudHMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2FuY2hvckJveCkge1xuXHRcdFx0XHR0aGlzLl9wbGFjZUF0QW5jaG9yKHRoaXMuX2FuY2hvckJveCwgdGhpcy5fdXNlclNpemUgPz8gdGhpcy53aWRnZXQuc2l6ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuaGlkZSgpO1xuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ3N1Z2dlc3QuZGV0YWlscyc7XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzaXphYmxlLmRvbU5vZGU7XG5cdH1cblxuXHRzaG93KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWRkZWQpIHtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9yZXNpemFibGUuZG9tTm9kZSk7XG5cdFx0XHR0aGlzLl9hZGRlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0aGlkZShzZXNzaW9uRW5kZWQ6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5jbGVhclNhc2hIb3ZlclN0YXRlKCk7XG5cblx0XHRpZiAodGhpcy5fYWRkZWQpIHtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5yZW1vdmVDaGlsZCh0aGlzLl9yZXNpemFibGUuZG9tTm9kZSk7XG5cdFx0XHR0aGlzLl9hZGRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fYW5jaG9yQm94ID0gdW5kZWZpbmVkO1xuXHRcdFx0Ly8gdGhpcy5fdG9wTGVmdCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb25FbmRlZCkge1xuXHRcdFx0dGhpcy5fdXNlclNpemUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLndpZGdldC5jbGVhckNvbnRlbnRzKCk7XG5cdFx0fVxuXHR9XG5cblx0cGxhY2VBdEFuY2hvcihhbmNob3I6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgYW5jaG9yQm94ID0gYW5jaG9yLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHRoaXMuX2FuY2hvckJveCA9IGFuY2hvckJveDtcblx0XHR0aGlzLndpZGdldC5sYXlvdXQodGhpcy5fcmVzaXphYmxlLnNpemUud2lkdGgsIHRoaXMuX3Jlc2l6YWJsZS5zaXplLmhlaWdodCk7XG5cdFx0dGhpcy5fcGxhY2VBdEFuY2hvcih0aGlzLl9hbmNob3JCb3gsIHRoaXMuX3VzZXJTaXplID8/IHRoaXMud2lkZ2V0LnNpemUpO1xuXHR9XG5cblx0X3BsYWNlQXRBbmNob3IoYW5jaG9yQm94OiBkb20uSURvbU5vZGVQYWdlUG9zaXRpb24sIHNpemU6IGRvbS5EaW1lbnNpb24pIHtcblx0XHRjb25zdCBib2R5Qm94ID0gZG9tLmdldENsaWVudEFyZWEodGhpcy5nZXREb21Ob2RlKCkub3duZXJEb2N1bWVudC5ib2R5KTtcblxuXHRcdGNvbnN0IGluZm8gPSB0aGlzLndpZGdldC5nZXRMYXlvdXRJbmZvKCk7XG5cblx0XHRjb25zdCBkZWZhdWx0TWluU2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKDIyMCwgMiAqIGluZm8ubGluZUhlaWdodCk7XG5cdFx0Y29uc3QgZGVmYXVsdFRvcCA9IGFuY2hvckJveC50b3A7XG5cblx0XHR0eXBlIFBsYWNlbWVudCA9IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlcjsgZml0OiBudW1iZXI7IG1heFNpemVUb3A6IGRvbS5EaW1lbnNpb247IG1heFNpemVCb3R0b206IGRvbS5EaW1lbnNpb247IG1pblNpemU6IGRvbS5EaW1lbnNpb24gfTtcblxuXHRcdC8vIEVBU1Rcblx0XHRjb25zdCBlYXN0UGxhY2VtZW50OiBQbGFjZW1lbnQgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBib2R5Qm94LndpZHRoIC0gKGFuY2hvckJveC5sZWZ0ICsgYW5jaG9yQm94LndpZHRoICsgaW5mby5ib3JkZXJXaWR0aCArIGluZm8uaG9yaXpvbnRhbFBhZGRpbmcpO1xuXHRcdFx0Y29uc3QgbGVmdCA9IC1pbmZvLmJvcmRlcldpZHRoICsgYW5jaG9yQm94LmxlZnQgKyBhbmNob3JCb3gud2lkdGg7XG5cdFx0XHRjb25zdCBtYXhTaXplVG9wID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGJvZHlCb3guaGVpZ2h0IC0gYW5jaG9yQm94LnRvcCAtIGluZm8uYm9yZGVySGVpZ2h0IC0gaW5mby52ZXJ0aWNhbFBhZGRpbmcpO1xuXHRcdFx0Y29uc3QgbWF4U2l6ZUJvdHRvbSA9IG1heFNpemVUb3Aud2l0aCh1bmRlZmluZWQsIGFuY2hvckJveC50b3AgKyBhbmNob3JCb3guaGVpZ2h0IC0gaW5mby5ib3JkZXJIZWlnaHQgLSBpbmZvLnZlcnRpY2FsUGFkZGluZyk7XG5cdFx0XHRyZXR1cm4geyB0b3A6IGRlZmF1bHRUb3AsIGxlZnQsIGZpdDogd2lkdGggLSBzaXplLndpZHRoLCBtYXhTaXplVG9wLCBtYXhTaXplQm90dG9tLCBtaW5TaXplOiBkZWZhdWx0TWluU2l6ZS53aXRoKE1hdGgubWluKHdpZHRoLCBkZWZhdWx0TWluU2l6ZS53aWR0aCkpIH07XG5cdFx0fSkoKTtcblxuXHRcdC8vIFdFU1Rcblx0XHRjb25zdCB3ZXN0UGxhY2VtZW50OiBQbGFjZW1lbnQgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBhbmNob3JCb3gubGVmdCAtIGluZm8uYm9yZGVyV2lkdGggLSBpbmZvLmhvcml6b250YWxQYWRkaW5nO1xuXHRcdFx0Y29uc3QgbGVmdCA9IE1hdGgubWF4KGluZm8uaG9yaXpvbnRhbFBhZGRpbmcsIGFuY2hvckJveC5sZWZ0IC0gc2l6ZS53aWR0aCAtIGluZm8uYm9yZGVyV2lkdGgpO1xuXHRcdFx0Y29uc3QgbWF4U2l6ZVRvcCA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCBib2R5Qm94LmhlaWdodCAtIGFuY2hvckJveC50b3AgLSBpbmZvLmJvcmRlckhlaWdodCAtIGluZm8udmVydGljYWxQYWRkaW5nKTtcblx0XHRcdGNvbnN0IG1heFNpemVCb3R0b20gPSBtYXhTaXplVG9wLndpdGgodW5kZWZpbmVkLCBhbmNob3JCb3gudG9wICsgYW5jaG9yQm94LmhlaWdodCAtIGluZm8uYm9yZGVySGVpZ2h0IC0gaW5mby52ZXJ0aWNhbFBhZGRpbmcpO1xuXHRcdFx0cmV0dXJuIHsgdG9wOiBkZWZhdWx0VG9wLCBsZWZ0LCBmaXQ6IHdpZHRoIC0gc2l6ZS53aWR0aCwgbWF4U2l6ZVRvcCwgbWF4U2l6ZUJvdHRvbSwgbWluU2l6ZTogZGVmYXVsdE1pblNpemUud2l0aChNYXRoLm1pbih3aWR0aCwgZGVmYXVsdE1pblNpemUud2lkdGgpKSB9O1xuXHRcdH0pKCk7XG5cblx0XHQvLyBTT1VUSFxuXHRcdGNvbnN0IHNvdXRoUGxhY2VtZW50OiBQbGFjZW1lbnQgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgbGVmdCA9IGFuY2hvckJveC5sZWZ0O1xuXHRcdFx0Y29uc3QgdG9wID0gLWluZm8uYm9yZGVyV2lkdGggKyBhbmNob3JCb3gudG9wICsgYW5jaG9yQm94LmhlaWdodDtcblx0XHRcdGNvbnN0IG1heFNpemVCb3R0b20gPSBuZXcgZG9tLkRpbWVuc2lvbihhbmNob3JCb3gud2lkdGggLSBpbmZvLmJvcmRlckhlaWdodCwgYm9keUJveC5oZWlnaHQgLSBhbmNob3JCb3gudG9wIC0gYW5jaG9yQm94LmhlaWdodCAtIGluZm8udmVydGljYWxQYWRkaW5nKTtcblx0XHRcdHJldHVybiB7IHRvcCwgbGVmdCwgZml0OiBtYXhTaXplQm90dG9tLmhlaWdodCAtIHNpemUuaGVpZ2h0LCBtYXhTaXplQm90dG9tLCBtYXhTaXplVG9wOiBtYXhTaXplQm90dG9tLCBtaW5TaXplOiBkZWZhdWx0TWluU2l6ZS53aXRoKG1heFNpemVCb3R0b20ud2lkdGgpIH07XG5cdFx0fSkoKTtcblxuXHRcdC8vIE5PUlRIXG5cdFx0Y29uc3Qgbm9ydGhQbGFjZW1lbnQ6IFBsYWNlbWVudCA9IChmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IE1hdGgubWF4KGFuY2hvckJveC53aWR0aCAtIGluZm8uYm9yZGVySGVpZ2h0LCAwKTtcblx0XHRcdGNvbnN0IGxlZnQgPSBhbmNob3JCb3gubGVmdDtcblx0XHRcdGNvbnN0IG1heEhlaWdodEFib3ZlID0gTWF0aC5tYXgoYW5jaG9yQm94LnRvcCAtIGluZm8udmVydGljYWxQYWRkaW5nLCAwKTtcblx0XHRcdGNvbnN0IGhlaWdodEZvclRvcCA9IE1hdGgubWluKHNpemUuaGVpZ2h0LCBtYXhIZWlnaHRBYm92ZSk7XG5cdFx0XHRjb25zdCB0b3AgPSBhbmNob3JCb3gudG9wIC0gaW5mby5ib3JkZXJXaWR0aCAtIGhlaWdodEZvclRvcDtcblx0XHRcdGNvbnN0IG1heFNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgTWF0aC5tYXgobWF4SGVpZ2h0QWJvdmUsIDApKTtcblx0XHRcdHJldHVybiB7IHRvcCwgbGVmdCwgZml0OiBtYXhTaXplLmhlaWdodCAtIHNpemUuaGVpZ2h0LCBtYXhTaXplVG9wOiBtYXhTaXplLCBtYXhTaXplQm90dG9tOiBtYXhTaXplLCBtaW5TaXplOiBkZWZhdWx0TWluU2l6ZS53aXRoKG1heFNpemUud2lkdGgpIH07XG5cdFx0fSkoKTtcblxuXHRcdC8vIHRha2UgZmlyc3QgcGxhY2VtZW50IHRoYXQgZml0cyBvciB0aGUgZmlyc3Qgd2l0aCBcImxlYXN0IGJhZFwiIGZpdFxuXHRcdGNvbnN0IHBsYWNlbWVudEVudHJpZXM6IFtTaW1wbGVTdWdnZXN0RGV0YWlsc1BsYWNlbWVudCwgUGxhY2VtZW50XVtdID0gW1xuXHRcdFx0W1NpbXBsZVN1Z2dlc3REZXRhaWxzUGxhY2VtZW50LkVhc3QsIGVhc3RQbGFjZW1lbnRdLFxuXHRcdFx0W1NpbXBsZVN1Z2dlc3REZXRhaWxzUGxhY2VtZW50LlNvdXRoLCBzb3V0aFBsYWNlbWVudF0sXG5cdFx0XHRbU2ltcGxlU3VnZ2VzdERldGFpbHNQbGFjZW1lbnQuTm9ydGgsIG5vcnRoUGxhY2VtZW50XSxcblx0XHRcdFtTaW1wbGVTdWdnZXN0RGV0YWlsc1BsYWNlbWVudC5XZXN0LCB3ZXN0UGxhY2VtZW50XVxuXHRcdF07XG5cdFx0Y29uc3Qgb3JpZW50YXRpb25zID0gKHRoaXMuX3ByZXZlbnRQbGFjZW1lbnRzXG5cdFx0XHQ/IHBsYWNlbWVudEVudHJpZXMuZmlsdGVyKChbZGlyZWN0aW9uXSkgPT4gIXRoaXMuX3ByZXZlbnRQbGFjZW1lbnRzIS5oYXMoZGlyZWN0aW9uKSlcblx0XHRcdDogcGxhY2VtZW50RW50cmllcykubWFwKChbLCBlbnRyeV0pID0+IGVudHJ5KTtcblx0XHRjb25zdCBjYW5kaWRhdGVzID0gb3JpZW50YXRpb25zLmxlbmd0aCA/IG9yaWVudGF0aW9ucyA6IHBsYWNlbWVudEVudHJpZXMubWFwKChbLCBlbnRyeV0pID0+IGVudHJ5KTtcblx0XHRjb25zdCBwbGFjZW1lbnQgPSBjYW5kaWRhdGVzLmZpbmQocCA9PiBwLmZpdCA+PSAwKVxuXHRcdFx0Pz8gY2FuZGlkYXRlcy5yZWR1Y2U8UGxhY2VtZW50IHwgdW5kZWZpbmVkPigoYmVzdCwgY3VycmVudCkgPT4gIWJlc3QgfHwgY3VycmVudC5maXQgPiBiZXN0LmZpdCA/IGN1cnJlbnQgOiBiZXN0LCB1bmRlZmluZWQpXG5cdFx0XHQ/PyBlYXN0UGxhY2VtZW50O1xuXG5cdFx0Ly8gdG9wL2JvdHRvbSBwbGFjZW1lbnRcblx0XHRjb25zdCBib3R0b20gPSBhbmNob3JCb3gudG9wICsgYW5jaG9yQm94LmhlaWdodCAtIGluZm8uYm9yZGVySGVpZ2h0O1xuXHRcdGxldCBhbGlnbkF0VG9wOiBib29sZWFuO1xuXHRcdGxldCBoZWlnaHQgPSBzaXplLmhlaWdodDtcblx0XHRjb25zdCBtYXhIZWlnaHQgPSBNYXRoLm1heChwbGFjZW1lbnQubWF4U2l6ZVRvcC5oZWlnaHQsIHBsYWNlbWVudC5tYXhTaXplQm90dG9tLmhlaWdodCk7XG5cdFx0aWYgKGhlaWdodCA+IG1heEhlaWdodCkge1xuXHRcdFx0aGVpZ2h0ID0gbWF4SGVpZ2h0O1xuXHRcdH1cblx0XHRsZXQgbWF4U2l6ZTogZG9tLkRpbWVuc2lvbjtcblx0XHQvLyBpZiAocHJlZmVyQWxpZ25BdFRvcCkge1xuXHRcdGlmIChoZWlnaHQgPD0gcGxhY2VtZW50Lm1heFNpemVUb3AuaGVpZ2h0KSB7XG5cdFx0XHRhbGlnbkF0VG9wID0gdHJ1ZTtcblx0XHRcdG1heFNpemUgPSBwbGFjZW1lbnQubWF4U2l6ZVRvcDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWxpZ25BdFRvcCA9IGZhbHNlO1xuXHRcdFx0bWF4U2l6ZSA9IHBsYWNlbWVudC5tYXhTaXplQm90dG9tO1xuXHRcdH1cblx0XHQvLyB9IGVsc2Uge1xuXHRcdC8vIFx0aWYgKGhlaWdodCA8PSBwbGFjZW1lbnQubWF4U2l6ZUJvdHRvbS5oZWlnaHQpIHtcblx0XHQvLyBcdFx0YWxpZ25BdFRvcCA9IGZhbHNlO1xuXHRcdC8vIFx0XHRtYXhTaXplID0gcGxhY2VtZW50Lm1heFNpemVCb3R0b207XG5cdFx0Ly8gXHR9IGVsc2Uge1xuXHRcdC8vIFx0XHRhbGlnbkF0VG9wID0gdHJ1ZTtcblx0XHQvLyBcdFx0bWF4U2l6ZSA9IHBsYWNlbWVudC5tYXhTaXplVG9wO1xuXHRcdC8vIFx0fVxuXHRcdC8vIH1cblxuXHRcdGxldCB7IHRvcCwgbGVmdCB9ID0gcGxhY2VtZW50O1xuXHRcdGlmICghYWxpZ25BdFRvcCAmJiBoZWlnaHQgPiBhbmNob3JCb3guaGVpZ2h0KSB7XG5cdFx0XHR0b3AgPSBib3R0b20gLSBoZWlnaHQ7XG5cdFx0fVxuXHRcdGNvbnN0IGVkaXRvckRvbU5vZGUgPSB0aGlzLl9jb250YWluZXI7XG5cdFx0aWYgKGVkaXRvckRvbU5vZGUpIHtcblx0XHRcdC8vIGdldCBib3VuZGluZyByZWN0YW5nbGUgb2YgdGhlIHN1Z2dlc3Qgd2lkZ2V0IHJlbGF0aXZlIHRvIHRoZSBlZGl0b3Jcblx0XHRcdGNvbnN0IGVkaXRvckJvdW5kaW5nQm94ID0gZWRpdG9yRG9tTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdHRvcCAtPSBlZGl0b3JCb3VuZGluZ0JveC50b3A7XG5cdFx0XHRsZWZ0IC09IGVkaXRvckJvdW5kaW5nQm94LmxlZnQ7XG5cdFx0fVxuXHRcdHRoaXMuX2FwcGx5VG9wTGVmdCh7IGxlZnQsIHRvcCB9KTtcblxuXHRcdHRoaXMuX3Jlc2l6YWJsZS5lbmFibGVTYXNoZXMoIWFsaWduQXRUb3AsIHBsYWNlbWVudCA9PT0gZWFzdFBsYWNlbWVudCwgYWxpZ25BdFRvcCwgcGxhY2VtZW50ICE9PSBlYXN0UGxhY2VtZW50KTtcblxuXHRcdHRoaXMuX3Jlc2l6YWJsZS5taW5TaXplID0gcGxhY2VtZW50Lm1pblNpemU7XG5cdFx0dGhpcy5fcmVzaXphYmxlLm1heFNpemUgPSBtYXhTaXplO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5sYXlvdXQoaGVpZ2h0LCBNYXRoLm1pbihtYXhTaXplLndpZHRoLCBzaXplLndpZHRoKSk7XG5cdFx0dGhpcy53aWRnZXQubGF5b3V0KHRoaXMuX3Jlc2l6YWJsZS5zaXplLndpZHRoLCB0aGlzLl9yZXNpemFibGUuc2l6ZS5oZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlUb3BMZWZ0KHRvcExlZnQ6IHsgbGVmdDogbnVtYmVyOyB0b3A6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0dGhpcy5fdG9wTGVmdCA9IHRvcExlZnQ7XG5cdFx0Ly8gdGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0dGhpcy5fcmVzaXphYmxlLmRvbU5vZGUuc3R5bGUudG9wID0gYCR7dG9wTGVmdC50b3B9cHhgO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5kb21Ob2RlLnN0eWxlLmxlZnQgPSBgJHt0b3BMZWZ0LmxlZnR9cHhgO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5kb21Ob2RlLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0fVxufVxuXG5pbnRlcmZhY2UgVG9wTGVmdFBvc2l0aW9uIHtcblx0dG9wOiBudW1iZXI7XG5cdGxlZnQ6IG51bWJlcjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNEJBQTRCO0FBQ3JDLFlBQVksU0FBUztBQUVyQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUcvQixTQUFTLHdCQUF3QixNQUFpRDtBQUN4RixTQUFPLENBQUMsQ0FBQyxRQUFRLFFBQVEsS0FBSyxXQUFXLGlCQUFpQixLQUFLLFdBQVcsVUFBVSxLQUFLLFdBQVcsV0FBVyxLQUFLLFdBQVcsS0FBSztBQUNySTtBQUVPLE1BQU0sMEJBQTBCO0FBRWhDLElBQVcsZ0NBQVgsa0JBQVdBLG1DQUFYO0FBQ04sRUFBQUEsOERBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsOERBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsOERB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
