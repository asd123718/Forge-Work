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
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import * as nls from "../../../../nls.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
function canExpandCompletionItem(item) {
  return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}
let SuggestDetailsWidget = class {
  constructor(_editor, _themeService, _markdownRendererService) {
    this._editor = _editor;
    this._themeService = _themeService;
    this._markdownRendererService = _markdownRendererService;
    this._onDidClose = new Emitter();
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeContents = new Emitter();
    this.onDidChangeContents = this._onDidChangeContents.event;
    this._disposables = new DisposableStore();
    this._renderDisposeable = new DisposableStore();
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
    this._close.ariaLabel = nls.localize("details.close", "Close");
    this._close.role = "button";
    this._close.tabIndex = -1;
    this._type = dom.append(this._header, dom.$("p.type"));
    this._docs = dom.append(this._body, dom.$("p.docs"));
    this._configureFont();
    this._disposables.add(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this._configureFont();
      }
    }));
  }
  dispose() {
    this._disposables.dispose();
    this._renderDisposeable.dispose();
    this._onDidClose.dispose();
    this._onDidChangeContents.dispose();
  }
  _configureFont() {
    const options = this._editor.getOptions();
    const fontInfo = options.get(EditorOption.fontInfo);
    const fontFamily = fontInfo.getMassagedFontFamily();
    const fontSize = options.get(EditorOption.suggestFontSize) || fontInfo.fontSize;
    const lineHeight = options.get(EditorOption.suggestLineHeight) || fontInfo.lineHeight;
    const fontWeight = fontInfo.fontWeight;
    const fontSizePx = `${fontSize}px`;
    const lineHeightPx = `${lineHeight}px`;
    this.domNode.style.fontSize = fontSizePx;
    this.domNode.style.lineHeight = `${lineHeight / fontSize}`;
    this.domNode.style.fontWeight = fontWeight;
    this.domNode.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
    this._type.style.fontFamily = fontFamily;
    this._close.style.height = lineHeightPx;
    this._close.style.width = lineHeightPx;
  }
  getLayoutInfo() {
    const lineHeight = this._editor.getOption(EditorOption.suggestLineHeight) || this._editor.getOption(EditorOption.fontInfo).lineHeight;
    const borderWidth = isHighContrast(this._themeService.getColorTheme().type) ? 2 : 1;
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
    if (explainMode) {
      let md = "";
      md += `score: ${item.score[0]}
`;
      md += `prefix: ${item.word ?? "(no prefix)"}
`;
      md += `word: ${item.completion.filterText ? item.completion.filterText + " (filterText)" : item.textLabel}
`;
      md += `distance: ${item.distance} (localityBonus-setting)
`;
      md += `index: ${item.idx}, based on ${item.completion.sortText && `sortText: "${item.completion.sortText}"` || "label"}
`;
      md += `commit_chars: ${item.completion.commitCharacters?.join("")}
`;
      documentation = new MarkdownString().appendCodeblock("empty", md);
      detail = `Provider: ${item.provider._debugDisplayName}`;
    }
    if (!explainMode && !canExpandCompletionItem(item)) {
      this.clearContents();
      return;
    }
    this.domNode.classList.remove("no-docs", "no-type");
    if (detail) {
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
    if (typeof documentation === "string") {
      this._docs.classList.remove("markdown-docs");
      this._docs.textContent = documentation;
    } else if (documentation) {
      this._docs.classList.add("markdown-docs");
      dom.clearNode(this._docs);
      const renderedContents = this._markdownRendererService.render(documentation, {
        context: this._editor,
        asyncRenderCallback: () => {
          this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
          this._onDidChangeContents.fire(this);
        }
      });
      this._docs.appendChild(renderedContents.element);
      this._renderDisposeable.add(renderedContents);
    }
    this.domNode.classList.toggle("detail-and-doc", !!detail && !!documentation);
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
    this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
    this._onDidChangeContents.fire(this);
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
  focus() {
    this.domNode.focus();
  }
};
SuggestDetailsWidget = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IMarkdownRendererService)
], SuggestDetailsWidget);
class SuggestDetailsOverlay {
  constructor(widget, _editor) {
    this.widget = widget;
    this._editor = _editor;
    this.allowEditorOverflow = true;
    this._disposables = new DisposableStore();
    this._added = false;
    this._preferAlignAtTop = true;
    this._resizable = new ResizableHTMLElement();
    this._resizable.domNode.classList.add("suggest-details-container");
    this._resizable.domNode.appendChild(widget.domNode);
    this._resizable.enableSashes(false, true, true, false);
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
        this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size, this._preferAlignAtTop);
      }
    }));
  }
  dispose() {
    this._resizable.dispose();
    this._disposables.dispose();
    this.hide();
  }
  getId() {
    return "suggest.details";
  }
  getDomNode() {
    return this._resizable.domNode;
  }
  getPosition() {
    return this._topLeft ? { preference: this._topLeft } : null;
  }
  show() {
    if (!this._added) {
      this._editor.addOverlayWidget(this);
      this._added = true;
    }
  }
  hide(sessionEnded = false) {
    this._resizable.clearSashHoverState();
    if (this._added) {
      this._editor.removeOverlayWidget(this);
      this._added = false;
      this._anchorBox = void 0;
      this._topLeft = void 0;
    }
    if (sessionEnded) {
      this._userSize = void 0;
      this.widget.clearContents();
    }
  }
  placeAtAnchor(anchor, preferAlignAtTop) {
    const anchorBox = anchor.getBoundingClientRect();
    this._anchorBox = anchorBox;
    this._preferAlignAtTop = preferAlignAtTop;
    this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size, preferAlignAtTop);
  }
  _placeAtAnchor(anchorBox, size, preferAlignAtTop) {
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
      const left2 = anchorBox.left;
      const maxSizeTop = new dom.Dimension(anchorBox.width - info.borderHeight, anchorBox.top - info.verticalPadding);
      const top2 = Math.max(info.verticalPadding, anchorBox.top - size.height);
      return { top: top2, left: left2, fit: maxSizeTop.height - size.height, maxSizeTop, maxSizeBottom: maxSizeTop, minSize: defaultMinSize.with(maxSizeTop.width) };
    })();
    const verticalPlacement = preferAlignAtTop ? southPlacement : northPlacement;
    const placements = [eastPlacement, westPlacement, verticalPlacement];
    const placement = placements.find((p) => p.fit >= 0) ?? placements.sort((a, b) => b.fit - a.fit)[0];
    const bottom = anchorBox.top + anchorBox.height - info.borderHeight;
    let alignAtTop;
    let height = size.height;
    const maxHeight = Math.max(placement.maxSizeTop.height, placement.maxSizeBottom.height);
    if (height > maxHeight) {
      height = maxHeight;
    }
    let maxSize;
    if (preferAlignAtTop) {
      if (height <= placement.maxSizeTop.height) {
        alignAtTop = true;
        maxSize = placement.maxSizeTop;
      } else {
        alignAtTop = false;
        maxSize = placement.maxSizeBottom;
      }
    } else {
      if (height <= placement.maxSizeBottom.height) {
        alignAtTop = false;
        maxSize = placement.maxSizeBottom;
      } else {
        alignAtTop = true;
        maxSize = placement.maxSizeTop;
      }
    }
    let { top, left } = placement;
    if (placement === northPlacement) {
      top = anchorBox.top - height + info.borderWidth;
    } else if (!alignAtTop && height > anchorBox.height) {
      top = bottom - height;
    }
    const editorDomNode = this._editor.getDomNode();
    if (editorDomNode) {
      const editorBoundingBox = editorDomNode.getBoundingClientRect();
      top -= editorBoundingBox.top;
      left -= editorBoundingBox.left;
    }
    this._applyTopLeft({ left, top });
    if (placement === northPlacement) {
      this._resizable.enableSashes(true, false, false, true);
    } else {
      this._resizable.enableSashes(!alignAtTop, placement === eastPlacement, alignAtTop, placement !== eastPlacement);
    }
    this._resizable.minSize = placement.minSize;
    this._resizable.maxSize = maxSize;
    this._resizable.layout(height, Math.min(maxSize.width, size.width));
    this.widget.layout(this._resizable.size.width, this._resizable.size.height);
  }
  _applyTopLeft(topLeft) {
    this._topLeft = topLeft;
    this._editor.layoutOverlayWidget(this);
  }
}
export {
  SuggestDetailsOverlay,
  SuggestDetailsWidget,
  canExpandCompletionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXGJyb3dzZXJcXHN1Z2dlc3RXaWRnZXREZXRhaWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgUmVzaXphYmxlSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcmVzaXphYmxlL3Jlc2l6YWJsZS5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgaXNIaWdoQ29udHJhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElPdmVybGF5V2lkZ2V0LCBJT3ZlcmxheVdpZGdldFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW0gfSBmcm9tICcuL3N1Z2dlc3QuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gY2FuRXhwYW5kQ29tcGxldGlvbkl0ZW0oaXRlbTogQ29tcGxldGlvbkl0ZW0gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuICEhaXRlbSAmJiBCb29sZWFuKGl0ZW0uY29tcGxldGlvbi5kb2N1bWVudGF0aW9uIHx8IGl0ZW0uY29tcGxldGlvbi5kZXRhaWwgJiYgaXRlbS5jb21wbGV0aW9uLmRldGFpbCAhPT0gaXRlbS5jb21wbGV0aW9uLmxhYmVsKTtcbn1cblxuZXhwb3J0IGNsYXNzIFN1Z2dlc3REZXRhaWxzV2lkZ2V0IHtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRGl2RWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudHMgPSBuZXcgRW1pdHRlcjx0aGlzPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRzOiBFdmVudDx0aGlzPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2xvc2U6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY3JvbGxiYXI6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ib2R5OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaGVhZGVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdHlwZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvY3M6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJEaXNwb3NlYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBfc2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKDMzMCwgMCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLnN1Z2dlc3QtZGV0YWlscycpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCduby1kb2NzJyk7XG5cblxuXHRcdHRoaXMuX2JvZHkgPSBkb20uJCgnLmJvZHknKTtcblxuXHRcdHRoaXMuX3Njcm9sbGJhciA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLl9ib2R5LCB7XG5cdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogdHJ1ZSxcblx0XHR9KTtcblx0XHRkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgdGhpcy5fc2Nyb2xsYmFyLmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3Njcm9sbGJhcik7XG5cblx0XHR0aGlzLl9oZWFkZXIgPSBkb20uYXBwZW5kKHRoaXMuX2JvZHksIGRvbS4kKCcuaGVhZGVyJykpO1xuXHRcdHRoaXMuX2Nsb3NlID0gZG9tLmFwcGVuZCh0aGlzLl9oZWFkZXIsIGRvbS4kKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKENvZGljb24uY2xvc2UpKSk7XG5cdFx0dGhpcy5fY2xvc2UudGl0bGUgPSBubHMubG9jYWxpemUoJ2RldGFpbHMuY2xvc2UnLCBcIkNsb3NlXCIpO1xuXHRcdHRoaXMuX2Nsb3NlLmFyaWFMYWJlbCA9IG5scy5sb2NhbGl6ZSgnZGV0YWlscy5jbG9zZScsIFwiQ2xvc2VcIik7XG5cdFx0dGhpcy5fY2xvc2Uucm9sZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuX2Nsb3NlLnRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy5fdHlwZSA9IGRvbS5hcHBlbmQodGhpcy5faGVhZGVyLCBkb20uJCgncC50eXBlJykpO1xuXG5cdFx0dGhpcy5fZG9jcyA9IGRvbS5hcHBlbmQodGhpcy5fYm9keSwgZG9tLiQoJ3AuZG9jcycpKTtcblxuXHRcdHRoaXMuX2NvbmZpZ3VyZUZvbnQoKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEluZm8pKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyZUZvbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NlYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDbG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50cy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maWd1cmVGb250KCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9ucygpO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCBmb250RmFtaWx5ID0gZm9udEluZm8uZ2V0TWFzc2FnZWRGb250RmFtaWx5KCk7XG5cdFx0Y29uc3QgZm9udFNpemUgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc3VnZ2VzdEZvbnRTaXplKSB8fCBmb250SW5mby5mb250U2l6ZTtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnN1Z2dlc3RMaW5lSGVpZ2h0KSB8fCBmb250SW5mby5saW5lSGVpZ2h0O1xuXHRcdGNvbnN0IGZvbnRXZWlnaHQgPSBmb250SW5mby5mb250V2VpZ2h0O1xuXHRcdGNvbnN0IGZvbnRTaXplUHggPSBgJHtmb250U2l6ZX1weGA7XG5cdFx0Y29uc3QgbGluZUhlaWdodFB4ID0gYCR7bGluZUhlaWdodH1weGA7XG5cblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZm9udFNpemUgPSBmb250U2l6ZVB4O1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5saW5lSGVpZ2h0ID0gYCR7bGluZUhlaWdodCAvIGZvbnRTaXplfWA7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmZvbnRXZWlnaHQgPSBmb250V2VpZ2h0O1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5mb250RmVhdHVyZVNldHRpbmdzID0gZm9udEluZm8uZm9udEZlYXR1cmVTZXR0aW5ncztcblx0XHR0aGlzLl90eXBlLnN0eWxlLmZvbnRGYW1pbHkgPSBmb250RmFtaWx5O1xuXHRcdHRoaXMuX2Nsb3NlLnN0eWxlLmhlaWdodCA9IGxpbmVIZWlnaHRQeDtcblx0XHR0aGlzLl9jbG9zZS5zdHlsZS53aWR0aCA9IGxpbmVIZWlnaHRQeDtcblx0fVxuXG5cdGdldExheW91dEluZm8oKSB7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3RMaW5lSGVpZ2h0KSB8fCB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbykubGluZUhlaWdodDtcblx0XHRjb25zdCBib3JkZXJXaWR0aCA9IGlzSGlnaENvbnRyYXN0KHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkgPyAyIDogMTtcblx0XHRjb25zdCBib3JkZXJIZWlnaHQgPSBib3JkZXJXaWR0aCAqIDI7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxpbmVIZWlnaHQsXG5cdFx0XHRib3JkZXJXaWR0aCxcblx0XHRcdGJvcmRlckhlaWdodCxcblx0XHRcdHZlcnRpY2FsUGFkZGluZzogMjIsXG5cdFx0XHRob3Jpem9udGFsUGFkZGluZzogMTRcblx0XHR9O1xuXHR9XG5cblxuXHRyZW5kZXJMb2FkaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX3R5cGUudGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ2xvYWRpbmcnLCBcIkxvYWRpbmcuLi5cIik7XG5cdFx0dGhpcy5fZG9jcy50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCduby1kb2NzJywgJ25vLXR5cGUnKTtcblx0XHR0aGlzLmxheW91dCh0aGlzLnNpemUud2lkdGgsIHRoaXMuZ2V0TGF5b3V0SW5mbygpLmxpbmVIZWlnaHQgKiAyKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRzLmZpcmUodGhpcyk7XG5cdH1cblxuXHRyZW5kZXJJdGVtKGl0ZW06IENvbXBsZXRpb25JdGVtLCBleHBsYWluTW9kZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2VhYmxlLmNsZWFyKCk7XG5cblx0XHRsZXQgeyBkZXRhaWwsIGRvY3VtZW50YXRpb24gfSA9IGl0ZW0uY29tcGxldGlvbjtcblxuXHRcdGlmIChleHBsYWluTW9kZSkge1xuXHRcdFx0bGV0IG1kID0gJyc7XG5cdFx0XHRtZCArPSBgc2NvcmU6ICR7aXRlbS5zY29yZVswXX1cXG5gO1xuXHRcdFx0bWQgKz0gYHByZWZpeDogJHtpdGVtLndvcmQgPz8gJyhubyBwcmVmaXgpJ31cXG5gO1xuXHRcdFx0bWQgKz0gYHdvcmQ6ICR7aXRlbS5jb21wbGV0aW9uLmZpbHRlclRleHQgPyBpdGVtLmNvbXBsZXRpb24uZmlsdGVyVGV4dCArICcgKGZpbHRlclRleHQpJyA6IGl0ZW0udGV4dExhYmVsfVxcbmA7XG5cdFx0XHRtZCArPSBgZGlzdGFuY2U6ICR7aXRlbS5kaXN0YW5jZX0gKGxvY2FsaXR5Qm9udXMtc2V0dGluZylcXG5gO1xuXHRcdFx0bWQgKz0gYGluZGV4OiAke2l0ZW0uaWR4fSwgYmFzZWQgb24gJHtpdGVtLmNvbXBsZXRpb24uc29ydFRleHQgJiYgYHNvcnRUZXh0OiBcIiR7aXRlbS5jb21wbGV0aW9uLnNvcnRUZXh0fVwiYCB8fCAnbGFiZWwnfVxcbmA7XG5cdFx0XHRtZCArPSBgY29tbWl0X2NoYXJzOiAke2l0ZW0uY29tcGxldGlvbi5jb21taXRDaGFyYWN0ZXJzPy5qb2luKCcnKX1cXG5gO1xuXHRcdFx0ZG9jdW1lbnRhdGlvbiA9IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jaygnZW1wdHknLCBtZCk7XG5cdFx0XHRkZXRhaWwgPSBgUHJvdmlkZXI6ICR7aXRlbS5wcm92aWRlci5fZGVidWdEaXNwbGF5TmFtZX1gO1xuXHRcdH1cblxuXHRcdGlmICghZXhwbGFpbk1vZGUgJiYgIWNhbkV4cGFuZENvbXBsZXRpb25JdGVtKGl0ZW0pKSB7XG5cdFx0XHR0aGlzLmNsZWFyQ29udGVudHMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnbm8tZG9jcycsICduby10eXBlJyk7XG5cblx0XHQvLyAtLS0gZGV0YWlsc1xuXG5cdFx0aWYgKGRldGFpbCkge1xuXHRcdFx0Y29uc3QgY2FwcGVkRGV0YWlsID0gZGV0YWlsLmxlbmd0aCA+IDEwMDAwMCA/IGAke2RldGFpbC5zdWJzdHIoMCwgMTAwMDAwKX1cdTIwMjZgIDogZGV0YWlsO1xuXHRcdFx0dGhpcy5fdHlwZS50ZXh0Q29udGVudCA9IGNhcHBlZERldGFpbDtcblx0XHRcdHRoaXMuX3R5cGUudGl0bGUgPSBjYXBwZWREZXRhaWw7XG5cdFx0XHRkb20uc2hvdyh0aGlzLl90eXBlKTtcblx0XHRcdHRoaXMuX3R5cGUuY2xhc3NMaXN0LnRvZ2dsZSgnYXV0by13cmFwJywgIS9cXHI/XFxuXlxccysvZ21pLnRlc3QoY2FwcGVkRGV0YWlsKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdHlwZSk7XG5cdFx0XHR0aGlzLl90eXBlLnRpdGxlID0gJyc7XG5cdFx0XHRkb20uaGlkZSh0aGlzLl90eXBlKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCduby10eXBlJyk7XG5cdFx0fVxuXG5cdFx0Ly8gLS0tIGRvY3VtZW50YXRpb25cblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX2RvY3MpO1xuXHRcdGlmICh0eXBlb2YgZG9jdW1lbnRhdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuX2RvY3MuY2xhc3NMaXN0LnJlbW92ZSgnbWFya2Rvd24tZG9jcycpO1xuXHRcdFx0dGhpcy5fZG9jcy50ZXh0Q29udGVudCA9IGRvY3VtZW50YXRpb247XG5cblx0XHR9IGVsc2UgaWYgKGRvY3VtZW50YXRpb24pIHtcblx0XHRcdHRoaXMuX2RvY3MuY2xhc3NMaXN0LmFkZCgnbWFya2Rvd24tZG9jcycpO1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9kb2NzKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkQ29udGVudHMgPSB0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoZG9jdW1lbnRhdGlvbiwge1xuXHRcdFx0XHRjb250ZXh0OiB0aGlzLl9lZGl0b3IsXG5cdFx0XHRcdGFzeW5jUmVuZGVyQ2FsbGJhY2s6ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLl9zaXplLndpZHRoLCB0aGlzLl90eXBlLmNsaWVudEhlaWdodCArIHRoaXMuX2RvY3MuY2xpZW50SGVpZ2h0KTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRzLmZpcmUodGhpcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZG9jcy5hcHBlbmRDaGlsZChyZW5kZXJlZENvbnRlbnRzLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zZWFibGUuYWRkKHJlbmRlcmVkQ29udGVudHMpO1xuXHRcdH1cblxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdkZXRhaWwtYW5kLWRvYycsICEhZGV0YWlsICYmICEhZG9jdW1lbnRhdGlvbik7XG5cblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUudXNlclNlbGVjdCA9ICd0ZXh0Jztcblx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblxuXHRcdHRoaXMuX2Nsb3NlLm9ubW91c2Vkb3duID0gZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH07XG5cdFx0dGhpcy5fY2xvc2Uub25jbGljayA9IGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9ib2R5LnNjcm9sbFRvcCA9IDA7XG5cblx0XHR0aGlzLmxheW91dCh0aGlzLl9zaXplLndpZHRoLCB0aGlzLl90eXBlLmNsaWVudEhlaWdodCArIHRoaXMuX2RvY3MuY2xpZW50SGVpZ2h0KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRzLmZpcmUodGhpcyk7XG5cdH1cblxuXHRjbGVhckNvbnRlbnRzKCkge1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCduby1kb2NzJyk7XG5cdFx0dGhpcy5fdHlwZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMuX2RvY3MudGV4dENvbnRlbnQgPSAnJztcblx0fVxuXG5cdGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCduby1kb2NzJyk7XG5cdH1cblxuXHRnZXQgc2l6ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2l6ZTtcblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1NpemUgPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0XHRpZiAoIWRvbS5EaW1lbnNpb24uZXF1YWxzKG5ld1NpemUsIHRoaXMuX3NpemUpKSB7XG5cdFx0XHR0aGlzLl9zaXplID0gbmV3U2l6ZTtcblx0XHRcdGRvbS5zaXplKHRoaXMuZG9tTm9kZSwgd2lkdGgsIGhlaWdodCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Njcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0c2Nyb2xsRG93bihtdWNoID0gOCk6IHZvaWQge1xuXHRcdHRoaXMuX2JvZHkuc2Nyb2xsVG9wICs9IG11Y2g7XG5cdH1cblxuXHRzY3JvbGxVcChtdWNoID0gOCk6IHZvaWQge1xuXHRcdHRoaXMuX2JvZHkuc2Nyb2xsVG9wIC09IG11Y2g7XG5cdH1cblxuXHRzY3JvbGxUb3AoKTogdm9pZCB7XG5cdFx0dGhpcy5fYm9keS5zY3JvbGxUb3AgPSAwO1xuXHR9XG5cblx0c2Nyb2xsQm90dG9tKCk6IHZvaWQge1xuXHRcdHRoaXMuX2JvZHkuc2Nyb2xsVG9wID0gdGhpcy5fYm9keS5zY3JvbGxIZWlnaHQ7XG5cdH1cblxuXHRwYWdlRG93bigpOiB2b2lkIHtcblx0XHR0aGlzLnNjcm9sbERvd24oODApO1xuXHR9XG5cblx0cGFnZVVwKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Nyb2xsVXAoODApO1xuXHR9XG5cblx0Zm9jdXMoKSB7XG5cdFx0dGhpcy5kb21Ob2RlLmZvY3VzKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIFRvcExlZnRQb3NpdGlvbiB7XG5cdHRvcDogbnVtYmVyO1xuXHRsZWZ0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBTdWdnZXN0RGV0YWlsc092ZXJsYXkgaW1wbGVtZW50cyBJT3ZlcmxheVdpZGdldCB7XG5cblx0cmVhZG9ubHkgYWxsb3dFZGl0b3JPdmVyZmxvdyA9IHRydWU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc2l6YWJsZTogUmVzaXphYmxlSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBfYWRkZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfYW5jaG9yQm94PzogZG9tLklEb21Ob2RlUGFnZVBvc2l0aW9uO1xuXHRwcml2YXRlIF9wcmVmZXJBbGlnbkF0VG9wOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSBfdXNlclNpemU/OiBkb20uRGltZW5zaW9uO1xuXHRwcml2YXRlIF90b3BMZWZ0PzogVG9wTGVmdFBvc2l0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHdpZGdldDogU3VnZ2VzdERldGFpbHNXaWRnZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0KSB7XG5cblx0XHR0aGlzLl9yZXNpemFibGUgPSBuZXcgUmVzaXphYmxlSFRNTEVsZW1lbnQoKTtcblx0XHR0aGlzLl9yZXNpemFibGUuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdzdWdnZXN0LWRldGFpbHMtY29udGFpbmVyJyk7XG5cdFx0dGhpcy5fcmVzaXphYmxlLmRvbU5vZGUuYXBwZW5kQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5lbmFibGVTYXNoZXMoZmFsc2UsIHRydWUsIHRydWUsIGZhbHNlKTtcblxuXHRcdGxldCB0b3BMZWZ0Tm93OiBUb3BMZWZ0UG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNpemVOb3c6IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlbHRhVG9wOiBudW1iZXIgPSAwO1xuXHRcdGxldCBkZWx0YUxlZnQ6IG51bWJlciA9IDA7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3Jlc2l6YWJsZS5vbkRpZFdpbGxSZXNpemUoKCkgPT4ge1xuXHRcdFx0dG9wTGVmdE5vdyA9IHRoaXMuX3RvcExlZnQ7XG5cdFx0XHRzaXplTm93ID0gdGhpcy5fcmVzaXphYmxlLnNpemU7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3Jlc2l6YWJsZS5vbkRpZFJlc2l6ZShlID0+IHtcblx0XHRcdGlmICh0b3BMZWZ0Tm93ICYmIHNpemVOb3cpIHtcblx0XHRcdFx0dGhpcy53aWRnZXQubGF5b3V0KGUuZGltZW5zaW9uLndpZHRoLCBlLmRpbWVuc2lvbi5oZWlnaHQpO1xuXG5cdFx0XHRcdGxldCB1cGRhdGVUb3BMZWZ0ID0gZmFsc2U7XG5cdFx0XHRcdGlmIChlLndlc3QpIHtcblx0XHRcdFx0XHRkZWx0YUxlZnQgPSBzaXplTm93LndpZHRoIC0gZS5kaW1lbnNpb24ud2lkdGg7XG5cdFx0XHRcdFx0dXBkYXRlVG9wTGVmdCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUubm9ydGgpIHtcblx0XHRcdFx0XHRkZWx0YVRvcCA9IHNpemVOb3cuaGVpZ2h0IC0gZS5kaW1lbnNpb24uaGVpZ2h0O1xuXHRcdFx0XHRcdHVwZGF0ZVRvcExlZnQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1cGRhdGVUb3BMZWZ0KSB7XG5cdFx0XHRcdFx0dGhpcy5fYXBwbHlUb3BMZWZ0KHtcblx0XHRcdFx0XHRcdHRvcDogdG9wTGVmdE5vdy50b3AgKyBkZWx0YVRvcCxcblx0XHRcdFx0XHRcdGxlZnQ6IHRvcExlZnROb3cubGVmdCArIGRlbHRhTGVmdCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGUuZG9uZSkge1xuXHRcdFx0XHR0b3BMZWZ0Tm93ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRzaXplTm93ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRkZWx0YVRvcCA9IDA7XG5cdFx0XHRcdGRlbHRhTGVmdCA9IDA7XG5cdFx0XHRcdHRoaXMuX3VzZXJTaXplID0gZS5kaW1lbnNpb247XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlQ29udGVudHMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2FuY2hvckJveCkge1xuXHRcdFx0XHR0aGlzLl9wbGFjZUF0QW5jaG9yKHRoaXMuX2FuY2hvckJveCwgdGhpcy5fdXNlclNpemUgPz8gdGhpcy53aWRnZXQuc2l6ZSwgdGhpcy5fcHJlZmVyQWxpZ25BdFRvcCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXNpemFibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmhpZGUoKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdzdWdnZXN0LmRldGFpbHMnO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc2l6YWJsZS5kb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl90b3BMZWZ0ID8geyBwcmVmZXJlbmNlOiB0aGlzLl90b3BMZWZ0IH0gOiBudWxsO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2FkZGVkKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuYWRkT3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHRcdHRoaXMuX2FkZGVkID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRoaWRlKHNlc3Npb25FbmRlZDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzaXphYmxlLmNsZWFyU2FzaEhvdmVyU3RhdGUoKTtcblxuXHRcdGlmICh0aGlzLl9hZGRlZCkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0XHR0aGlzLl9hZGRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fYW5jaG9yQm94ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fdG9wTGVmdCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb25FbmRlZCkge1xuXHRcdFx0dGhpcy5fdXNlclNpemUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLndpZGdldC5jbGVhckNvbnRlbnRzKCk7XG5cdFx0fVxuXHR9XG5cblx0cGxhY2VBdEFuY2hvcihhbmNob3I6IEhUTUxFbGVtZW50LCBwcmVmZXJBbGlnbkF0VG9wOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgYW5jaG9yQm94ID0gYW5jaG9yLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdHRoaXMuX2FuY2hvckJveCA9IGFuY2hvckJveDtcblx0XHR0aGlzLl9wcmVmZXJBbGlnbkF0VG9wID0gcHJlZmVyQWxpZ25BdFRvcDtcblx0XHR0aGlzLl9wbGFjZUF0QW5jaG9yKHRoaXMuX2FuY2hvckJveCwgdGhpcy5fdXNlclNpemUgPz8gdGhpcy53aWRnZXQuc2l6ZSwgcHJlZmVyQWxpZ25BdFRvcCk7XG5cdH1cblxuXHRfcGxhY2VBdEFuY2hvcihhbmNob3JCb3g6IGRvbS5JRG9tTm9kZVBhZ2VQb3NpdGlvbiwgc2l6ZTogZG9tLkRpbWVuc2lvbiwgcHJlZmVyQWxpZ25BdFRvcDogYm9vbGVhbikge1xuXHRcdGNvbnN0IGJvZHlCb3ggPSBkb20uZ2V0Q2xpZW50QXJlYSh0aGlzLmdldERvbU5vZGUoKS5vd25lckRvY3VtZW50LmJvZHkpO1xuXG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMud2lkZ2V0LmdldExheW91dEluZm8oKTtcblxuXHRcdGNvbnN0IGRlZmF1bHRNaW5TaXplID0gbmV3IGRvbS5EaW1lbnNpb24oMjIwLCAyICogaW5mby5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCBkZWZhdWx0VG9wID0gYW5jaG9yQm94LnRvcDtcblxuXHRcdHR5cGUgUGxhY2VtZW50ID0geyB0b3A6IG51bWJlcjsgbGVmdDogbnVtYmVyOyBmaXQ6IG51bWJlcjsgbWF4U2l6ZVRvcDogZG9tLkRpbWVuc2lvbjsgbWF4U2l6ZUJvdHRvbTogZG9tLkRpbWVuc2lvbjsgbWluU2l6ZTogZG9tLkRpbWVuc2lvbiB9O1xuXG5cdFx0Ly8gRUFTVFxuXHRcdGNvbnN0IGVhc3RQbGFjZW1lbnQ6IFBsYWNlbWVudCA9IChmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IGJvZHlCb3gud2lkdGggLSAoYW5jaG9yQm94LmxlZnQgKyBhbmNob3JCb3gud2lkdGggKyBpbmZvLmJvcmRlcldpZHRoICsgaW5mby5ob3Jpem9udGFsUGFkZGluZyk7XG5cdFx0XHRjb25zdCBsZWZ0ID0gLWluZm8uYm9yZGVyV2lkdGggKyBhbmNob3JCb3gubGVmdCArIGFuY2hvckJveC53aWR0aDtcblx0XHRcdGNvbnN0IG1heFNpemVUb3AgPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgYm9keUJveC5oZWlnaHQgLSBhbmNob3JCb3gudG9wIC0gaW5mby5ib3JkZXJIZWlnaHQgLSBpbmZvLnZlcnRpY2FsUGFkZGluZyk7XG5cdFx0XHRjb25zdCBtYXhTaXplQm90dG9tID0gbWF4U2l6ZVRvcC53aXRoKHVuZGVmaW5lZCwgYW5jaG9yQm94LnRvcCArIGFuY2hvckJveC5oZWlnaHQgLSBpbmZvLmJvcmRlckhlaWdodCAtIGluZm8udmVydGljYWxQYWRkaW5nKTtcblx0XHRcdHJldHVybiB7IHRvcDogZGVmYXVsdFRvcCwgbGVmdCwgZml0OiB3aWR0aCAtIHNpemUud2lkdGgsIG1heFNpemVUb3AsIG1heFNpemVCb3R0b20sIG1pblNpemU6IGRlZmF1bHRNaW5TaXplLndpdGgoTWF0aC5taW4od2lkdGgsIGRlZmF1bHRNaW5TaXplLndpZHRoKSkgfTtcblx0XHR9KSgpO1xuXG5cdFx0Ly8gV0VTVFxuXHRcdGNvbnN0IHdlc3RQbGFjZW1lbnQ6IFBsYWNlbWVudCA9IChmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IGFuY2hvckJveC5sZWZ0IC0gaW5mby5ib3JkZXJXaWR0aCAtIGluZm8uaG9yaXpvbnRhbFBhZGRpbmc7XG5cdFx0XHRjb25zdCBsZWZ0ID0gTWF0aC5tYXgoaW5mby5ob3Jpem9udGFsUGFkZGluZywgYW5jaG9yQm94LmxlZnQgLSBzaXplLndpZHRoIC0gaW5mby5ib3JkZXJXaWR0aCk7XG5cdFx0XHRjb25zdCBtYXhTaXplVG9wID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGJvZHlCb3guaGVpZ2h0IC0gYW5jaG9yQm94LnRvcCAtIGluZm8uYm9yZGVySGVpZ2h0IC0gaW5mby52ZXJ0aWNhbFBhZGRpbmcpO1xuXHRcdFx0Y29uc3QgbWF4U2l6ZUJvdHRvbSA9IG1heFNpemVUb3Aud2l0aCh1bmRlZmluZWQsIGFuY2hvckJveC50b3AgKyBhbmNob3JCb3guaGVpZ2h0IC0gaW5mby5ib3JkZXJIZWlnaHQgLSBpbmZvLnZlcnRpY2FsUGFkZGluZyk7XG5cdFx0XHRyZXR1cm4geyB0b3A6IGRlZmF1bHRUb3AsIGxlZnQsIGZpdDogd2lkdGggLSBzaXplLndpZHRoLCBtYXhTaXplVG9wLCBtYXhTaXplQm90dG9tLCBtaW5TaXplOiBkZWZhdWx0TWluU2l6ZS53aXRoKE1hdGgubWluKHdpZHRoLCBkZWZhdWx0TWluU2l6ZS53aWR0aCkpIH07XG5cdFx0fSkoKTtcblxuXHRcdC8vIFNPVVRIXG5cdFx0Y29uc3Qgc291dGhQbGFjZW1lbnQ6IFBsYWNlbWVudCA9IChmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBsZWZ0ID0gYW5jaG9yQm94LmxlZnQ7XG5cdFx0XHRjb25zdCB0b3AgPSAtaW5mby5ib3JkZXJXaWR0aCArIGFuY2hvckJveC50b3AgKyBhbmNob3JCb3guaGVpZ2h0O1xuXHRcdFx0Y29uc3QgbWF4U2l6ZUJvdHRvbSA9IG5ldyBkb20uRGltZW5zaW9uKGFuY2hvckJveC53aWR0aCAtIGluZm8uYm9yZGVySGVpZ2h0LCBib2R5Qm94LmhlaWdodCAtIGFuY2hvckJveC50b3AgLSBhbmNob3JCb3guaGVpZ2h0IC0gaW5mby52ZXJ0aWNhbFBhZGRpbmcpO1xuXHRcdFx0cmV0dXJuIHsgdG9wLCBsZWZ0LCBmaXQ6IG1heFNpemVCb3R0b20uaGVpZ2h0IC0gc2l6ZS5oZWlnaHQsIG1heFNpemVCb3R0b20sIG1heFNpemVUb3A6IG1heFNpemVCb3R0b20sIG1pblNpemU6IGRlZmF1bHRNaW5TaXplLndpdGgobWF4U2l6ZUJvdHRvbS53aWR0aCkgfTtcblx0XHR9KSgpO1xuXG5cdFx0Ly8gTk9SVEhcblx0XHRjb25zdCBub3J0aFBsYWNlbWVudDogUGxhY2VtZW50ID0gKGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGxlZnQgPSBhbmNob3JCb3gubGVmdDtcblx0XHRcdGNvbnN0IG1heFNpemVUb3AgPSBuZXcgZG9tLkRpbWVuc2lvbihhbmNob3JCb3gud2lkdGggLSBpbmZvLmJvcmRlckhlaWdodCwgYW5jaG9yQm94LnRvcCAtIGluZm8udmVydGljYWxQYWRkaW5nKTtcblx0XHRcdGNvbnN0IHRvcCA9IE1hdGgubWF4KGluZm8udmVydGljYWxQYWRkaW5nLCBhbmNob3JCb3gudG9wIC0gc2l6ZS5oZWlnaHQpO1xuXHRcdFx0cmV0dXJuIHsgdG9wLCBsZWZ0LCBmaXQ6IG1heFNpemVUb3AuaGVpZ2h0IC0gc2l6ZS5oZWlnaHQsIG1heFNpemVUb3AsIG1heFNpemVCb3R0b206IG1heFNpemVUb3AsIG1pblNpemU6IGRlZmF1bHRNaW5TaXplLndpdGgobWF4U2l6ZVRvcC53aWR0aCkgfTtcblx0XHR9KSgpO1xuXG5cdFx0Ly8gdGFrZSBmaXJzdCBwbGFjZW1lbnQgdGhhdCBmaXRzIG9yIHRoZSBmaXJzdCB3aXRoIFwibGVhc3QgYmFkXCIgZml0XG5cdFx0Ly8gd2hlbiB0aGUgc3VnZ2VzdCB3aWRnZXQgaXMgcmVuZGVyaW5nIGFib3ZlIHRoZSBjdXJzb3IgKHByZWZlckFsaWduQXRUb3A9ZmFsc2UpLCBwcmVmZXIgTk9SVEggb3ZlciBTT1VUSFxuXHRcdGNvbnN0IHZlcnRpY2FsUGxhY2VtZW50ID0gcHJlZmVyQWxpZ25BdFRvcCA/IHNvdXRoUGxhY2VtZW50IDogbm9ydGhQbGFjZW1lbnQ7XG5cdFx0Y29uc3QgcGxhY2VtZW50cyA9IFtlYXN0UGxhY2VtZW50LCB3ZXN0UGxhY2VtZW50LCB2ZXJ0aWNhbFBsYWNlbWVudF07XG5cdFx0Y29uc3QgcGxhY2VtZW50ID0gcGxhY2VtZW50cy5maW5kKHAgPT4gcC5maXQgPj0gMCkgPz8gcGxhY2VtZW50cy5zb3J0KChhLCBiKSA9PiBiLmZpdCAtIGEuZml0KVswXTtcblx0XHQvLyB0b3AvYm90dG9tIHBsYWNlbWVudFxuXHRcdGNvbnN0IGJvdHRvbSA9IGFuY2hvckJveC50b3AgKyBhbmNob3JCb3guaGVpZ2h0IC0gaW5mby5ib3JkZXJIZWlnaHQ7XG5cdFx0bGV0IGFsaWduQXRUb3A6IGJvb2xlYW47XG5cdFx0bGV0IGhlaWdodCA9IHNpemUuaGVpZ2h0O1xuXHRcdGNvbnN0IG1heEhlaWdodCA9IE1hdGgubWF4KHBsYWNlbWVudC5tYXhTaXplVG9wLmhlaWdodCwgcGxhY2VtZW50Lm1heFNpemVCb3R0b20uaGVpZ2h0KTtcblx0XHRpZiAoaGVpZ2h0ID4gbWF4SGVpZ2h0KSB7XG5cdFx0XHRoZWlnaHQgPSBtYXhIZWlnaHQ7XG5cdFx0fVxuXHRcdGxldCBtYXhTaXplOiBkb20uRGltZW5zaW9uO1xuXHRcdGlmIChwcmVmZXJBbGlnbkF0VG9wKSB7XG5cdFx0XHRpZiAoaGVpZ2h0IDw9IHBsYWNlbWVudC5tYXhTaXplVG9wLmhlaWdodCkge1xuXHRcdFx0XHRhbGlnbkF0VG9wID0gdHJ1ZTtcblx0XHRcdFx0bWF4U2l6ZSA9IHBsYWNlbWVudC5tYXhTaXplVG9wO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YWxpZ25BdFRvcCA9IGZhbHNlO1xuXHRcdFx0XHRtYXhTaXplID0gcGxhY2VtZW50Lm1heFNpemVCb3R0b207XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChoZWlnaHQgPD0gcGxhY2VtZW50Lm1heFNpemVCb3R0b20uaGVpZ2h0KSB7XG5cdFx0XHRcdGFsaWduQXRUb3AgPSBmYWxzZTtcblx0XHRcdFx0bWF4U2l6ZSA9IHBsYWNlbWVudC5tYXhTaXplQm90dG9tO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YWxpZ25BdFRvcCA9IHRydWU7XG5cdFx0XHRcdG1heFNpemUgPSBwbGFjZW1lbnQubWF4U2l6ZVRvcDtcblx0XHRcdH1cblx0XHR9XG5cdFx0bGV0IHsgdG9wLCBsZWZ0IH0gPSBwbGFjZW1lbnQ7XG5cdFx0aWYgKHBsYWNlbWVudCA9PT0gbm9ydGhQbGFjZW1lbnQpIHtcblx0XHRcdC8vIEZvciBOT1JUSCBwbGFjZW1lbnQsIHBvc2l0aW9uIHRoZSBkZXRhaWxzIGFib3ZlIHRoZSBhbmNob3Jcblx0XHRcdHRvcCA9IGFuY2hvckJveC50b3AgLSBoZWlnaHQgKyBpbmZvLmJvcmRlcldpZHRoO1xuXHRcdH0gZWxzZSBpZiAoIWFsaWduQXRUb3AgJiYgaGVpZ2h0ID4gYW5jaG9yQm94LmhlaWdodCkge1xuXHRcdFx0dG9wID0gYm90dG9tIC0gaGVpZ2h0O1xuXHRcdH1cblx0XHRjb25zdCBlZGl0b3JEb21Ob2RlID0gdGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKTtcblx0XHRpZiAoZWRpdG9yRG9tTm9kZSkge1xuXHRcdFx0Ly8gZ2V0IGJvdW5kaW5nIHJlY3RhbmdsZSBvZiB0aGUgc3VnZ2VzdCB3aWRnZXQgcmVsYXRpdmUgdG8gdGhlIGVkaXRvclxuXHRcdFx0Y29uc3QgZWRpdG9yQm91bmRpbmdCb3ggPSBlZGl0b3JEb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0dG9wIC09IGVkaXRvckJvdW5kaW5nQm94LnRvcDtcblx0XHRcdGxlZnQgLT0gZWRpdG9yQm91bmRpbmdCb3gubGVmdDtcblx0XHR9XG5cdFx0dGhpcy5fYXBwbHlUb3BMZWZ0KHsgbGVmdCwgdG9wIH0pO1xuXG5cdFx0Ly8gZW5hYmxlU2FzaGVzKG5vcnRoLCBlYXN0LCBzb3V0aCwgd2VzdClcblx0XHQvLyBGb3IgTk9SVEggcGxhY2VtZW50OiBlbmFibGUgbm9ydGggc2FzaCAocmVzaXplIHVwd2FyZCBmcm9tIHRvcCksIGRpc2FibGUgc291dGggKGNhbid0IHJlc2l6ZSBpbnRvIHRoZSBhbmNob3IpXG5cdFx0Ly8gQWxzbyBlbmFibGUgd2VzdCBzYXNoIGZvciBob3Jpem9udGFsIHJlc2l6aW5nLCBjb25zaXN0ZW50IHdpdGggU09VVEggcGxhY2VtZW50XG5cdFx0Ly8gRm9yIFNPVVRIIHBsYWNlbWVudCBhbmQgRUFTVC9XRVNUIHBsYWNlbWVudHM6IHVzZSBleGlzdGluZyBsb2dpYyBiYXNlZCBvbiBhbGlnbkF0VG9wXG5cdFx0aWYgKHBsYWNlbWVudCA9PT0gbm9ydGhQbGFjZW1lbnQpIHtcblx0XHRcdHRoaXMuX3Jlc2l6YWJsZS5lbmFibGVTYXNoZXModHJ1ZSwgZmFsc2UsIGZhbHNlLCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVzaXphYmxlLmVuYWJsZVNhc2hlcyghYWxpZ25BdFRvcCwgcGxhY2VtZW50ID09PSBlYXN0UGxhY2VtZW50LCBhbGlnbkF0VG9wLCBwbGFjZW1lbnQgIT09IGVhc3RQbGFjZW1lbnQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jlc2l6YWJsZS5taW5TaXplID0gcGxhY2VtZW50Lm1pblNpemU7XG5cdFx0dGhpcy5fcmVzaXphYmxlLm1heFNpemUgPSBtYXhTaXplO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5sYXlvdXQoaGVpZ2h0LCBNYXRoLm1pbihtYXhTaXplLndpZHRoLCBzaXplLndpZHRoKSk7XG5cdFx0dGhpcy53aWRnZXQubGF5b3V0KHRoaXMuX3Jlc2l6YWJsZS5zaXplLndpZHRoLCB0aGlzLl9yZXNpemFibGUuc2l6ZS5oZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlUb3BMZWZ0KHRvcExlZnQ6IFRvcExlZnRQb3NpdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX3RvcExlZnQgPSB0b3BMZWZ0O1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQjtBQUMxQixZQUFZLFNBQVM7QUFDckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0I7QUFHdEIsU0FBUyx3QkFBd0IsTUFBMkM7QUFDbEYsU0FBTyxDQUFDLENBQUMsUUFBUSxRQUFRLEtBQUssV0FBVyxpQkFBaUIsS0FBSyxXQUFXLFVBQVUsS0FBSyxXQUFXLFdBQVcsS0FBSyxXQUFXLEtBQUs7QUFDckk7QUFFTyxJQUFNLHVCQUFOLE1BQTJCO0FBQUEsRUFxQmpDLFlBQ2tCLFNBQ2UsZUFDVywwQkFDMUM7QUFIZ0I7QUFDZTtBQUNXO0FBcEI1QyxTQUFpQixjQUFjLElBQUksUUFBYztBQUNqRCxTQUFTLGFBQTBCLEtBQUssWUFBWTtBQUVwRCxTQUFpQix1QkFBdUIsSUFBSSxRQUFjO0FBQzFELFNBQVMsc0JBQW1DLEtBQUsscUJBQXFCO0FBUXRFLFNBQWlCLGVBQWUsSUFBSSxnQkFBZ0I7QUFFcEQsU0FBaUIscUJBQXFCLElBQUksZ0JBQWdCO0FBQzFELFNBQVEsUUFBUSxJQUFJLElBQUksVUFBVSxLQUFLLENBQUM7QUFPdkMsU0FBSyxVQUFVLElBQUksRUFBRSxrQkFBa0I7QUFDdkMsU0FBSyxRQUFRLFVBQVUsSUFBSSxTQUFTO0FBR3BDLFNBQUssUUFBUSxJQUFJLEVBQUUsT0FBTztBQUUxQixTQUFLLGFBQWEsSUFBSSxxQkFBcUIsS0FBSyxPQUFPO0FBQUEsTUFDdEQseUJBQXlCO0FBQUEsSUFDMUIsQ0FBQztBQUNELFFBQUksT0FBTyxLQUFLLFNBQVMsS0FBSyxXQUFXLFdBQVcsQ0FBQztBQUNyRCxTQUFLLGFBQWEsSUFBSSxLQUFLLFVBQVU7QUFFckMsU0FBSyxVQUFVLElBQUksT0FBTyxLQUFLLE9BQU8sSUFBSSxFQUFFLFNBQVMsQ0FBQztBQUN0RCxTQUFLLFNBQVMsSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLEVBQUUsU0FBUyxVQUFVLGNBQWMsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUM3RixTQUFLLE9BQU8sUUFBUSxJQUFJLFNBQVMsaUJBQWlCLE9BQU87QUFDekQsU0FBSyxPQUFPLFlBQVksSUFBSSxTQUFTLGlCQUFpQixPQUFPO0FBQzdELFNBQUssT0FBTyxPQUFPO0FBQ25CLFNBQUssT0FBTyxXQUFXO0FBQ3ZCLFNBQUssUUFBUSxJQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksRUFBRSxRQUFRLENBQUM7QUFFckQsU0FBSyxRQUFRLElBQUksT0FBTyxLQUFLLE9BQU8sSUFBSSxFQUFFLFFBQVEsQ0FBQztBQUVuRCxTQUFLLGVBQWU7QUFFcEIsU0FBSyxhQUFhLElBQUksS0FBSyxRQUFRLHlCQUF5QixPQUFLO0FBQ2hFLFVBQUksRUFBRSxXQUFXLGFBQWEsUUFBUSxHQUFHO0FBQ3hDLGFBQUssZUFBZTtBQUFBLE1BQ3JCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssYUFBYSxRQUFRO0FBQzFCLFNBQUssbUJBQW1CLFFBQVE7QUFDaEMsU0FBSyxZQUFZLFFBQVE7QUFDekIsU0FBSyxxQkFBcUIsUUFBUTtBQUFBLEVBQ25DO0FBQUEsRUFFUSxpQkFBdUI7QUFDOUIsVUFBTSxVQUFVLEtBQUssUUFBUSxXQUFXO0FBQ3hDLFVBQU0sV0FBVyxRQUFRLElBQUksYUFBYSxRQUFRO0FBQ2xELFVBQU0sYUFBYSxTQUFTLHNCQUFzQjtBQUNsRCxVQUFNLFdBQVcsUUFBUSxJQUFJLGFBQWEsZUFBZSxLQUFLLFNBQVM7QUFDdkUsVUFBTSxhQUFhLFFBQVEsSUFBSSxhQUFhLGlCQUFpQixLQUFLLFNBQVM7QUFDM0UsVUFBTSxhQUFhLFNBQVM7QUFDNUIsVUFBTSxhQUFhLEdBQUcsUUFBUTtBQUM5QixVQUFNLGVBQWUsR0FBRyxVQUFVO0FBRWxDLFNBQUssUUFBUSxNQUFNLFdBQVc7QUFDOUIsU0FBSyxRQUFRLE1BQU0sYUFBYSxHQUFHLGFBQWEsUUFBUTtBQUN4RCxTQUFLLFFBQVEsTUFBTSxhQUFhO0FBQ2hDLFNBQUssUUFBUSxNQUFNLHNCQUFzQixTQUFTO0FBQ2xELFNBQUssTUFBTSxNQUFNLGFBQWE7QUFDOUIsU0FBSyxPQUFPLE1BQU0sU0FBUztBQUMzQixTQUFLLE9BQU8sTUFBTSxRQUFRO0FBQUEsRUFDM0I7QUFBQSxFQUVBLGdCQUFnQjtBQUNmLFVBQU0sYUFBYSxLQUFLLFFBQVEsVUFBVSxhQUFhLGlCQUFpQixLQUFLLEtBQUssUUFBUSxVQUFVLGFBQWEsUUFBUSxFQUFFO0FBQzNILFVBQU0sY0FBYyxlQUFlLEtBQUssY0FBYyxjQUFjLEVBQUUsSUFBSSxJQUFJLElBQUk7QUFDbEYsVUFBTSxlQUFlLGNBQWM7QUFDbkMsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsaUJBQWlCO0FBQUEsTUFDakIsbUJBQW1CO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFHQSxnQkFBc0I7QUFDckIsU0FBSyxNQUFNLGNBQWMsSUFBSSxTQUFTLFdBQVcsWUFBWTtBQUM3RCxTQUFLLE1BQU0sY0FBYztBQUN6QixTQUFLLFFBQVEsVUFBVSxPQUFPLFdBQVcsU0FBUztBQUNsRCxTQUFLLE9BQU8sS0FBSyxLQUFLLE9BQU8sS0FBSyxjQUFjLEVBQUUsYUFBYSxDQUFDO0FBQ2hFLFNBQUsscUJBQXFCLEtBQUssSUFBSTtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxXQUFXLE1BQXNCLGFBQTRCO0FBQzVELFNBQUssbUJBQW1CLE1BQU07QUFFOUIsUUFBSSxFQUFFLFFBQVEsY0FBYyxJQUFJLEtBQUs7QUFFckMsUUFBSSxhQUFhO0FBQ2hCLFVBQUksS0FBSztBQUNULFlBQU0sVUFBVSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQUE7QUFDN0IsWUFBTSxXQUFXLEtBQUssUUFBUSxhQUFhO0FBQUE7QUFDM0MsWUFBTSxTQUFTLEtBQUssV0FBVyxhQUFhLEtBQUssV0FBVyxhQUFhLGtCQUFrQixLQUFLLFNBQVM7QUFBQTtBQUN6RyxZQUFNLGFBQWEsS0FBSyxRQUFRO0FBQUE7QUFDaEMsWUFBTSxVQUFVLEtBQUssR0FBRyxjQUFjLEtBQUssV0FBVyxZQUFZLGNBQWMsS0FBSyxXQUFXLFFBQVEsT0FBTyxPQUFPO0FBQUE7QUFDdEgsWUFBTSxpQkFBaUIsS0FBSyxXQUFXLGtCQUFrQixLQUFLLEVBQUUsQ0FBQztBQUFBO0FBQ2pFLHNCQUFnQixJQUFJLGVBQWUsRUFBRSxnQkFBZ0IsU0FBUyxFQUFFO0FBQ2hFLGVBQVMsYUFBYSxLQUFLLFNBQVMsaUJBQWlCO0FBQUEsSUFDdEQ7QUFFQSxRQUFJLENBQUMsZUFBZSxDQUFDLHdCQUF3QixJQUFJLEdBQUc7QUFDbkQsV0FBSyxjQUFjO0FBQ25CO0FBQUEsSUFDRDtBQUVBLFNBQUssUUFBUSxVQUFVLE9BQU8sV0FBVyxTQUFTO0FBSWxELFFBQUksUUFBUTtBQUNYLFlBQU0sZUFBZSxPQUFPLFNBQVMsTUFBUyxHQUFHLE9BQU8sT0FBTyxHQUFHLEdBQU0sQ0FBQyxXQUFNO0FBQy9FLFdBQUssTUFBTSxjQUFjO0FBQ3pCLFdBQUssTUFBTSxRQUFRO0FBQ25CLFVBQUksS0FBSyxLQUFLLEtBQUs7QUFDbkIsV0FBSyxNQUFNLFVBQVUsT0FBTyxhQUFhLENBQUMsZUFBZSxLQUFLLFlBQVksQ0FBQztBQUFBLElBQzVFLE9BQU87QUFDTixVQUFJLFVBQVUsS0FBSyxLQUFLO0FBQ3hCLFdBQUssTUFBTSxRQUFRO0FBQ25CLFVBQUksS0FBSyxLQUFLLEtBQUs7QUFDbkIsV0FBSyxRQUFRLFVBQVUsSUFBSSxTQUFTO0FBQUEsSUFDckM7QUFHQSxRQUFJLFVBQVUsS0FBSyxLQUFLO0FBQ3hCLFFBQUksT0FBTyxrQkFBa0IsVUFBVTtBQUN0QyxXQUFLLE1BQU0sVUFBVSxPQUFPLGVBQWU7QUFDM0MsV0FBSyxNQUFNLGNBQWM7QUFBQSxJQUUxQixXQUFXLGVBQWU7QUFDekIsV0FBSyxNQUFNLFVBQVUsSUFBSSxlQUFlO0FBQ3hDLFVBQUksVUFBVSxLQUFLLEtBQUs7QUFDeEIsWUFBTSxtQkFBbUIsS0FBSyx5QkFBeUIsT0FBTyxlQUFlO0FBQUEsUUFDNUUsU0FBUyxLQUFLO0FBQUEsUUFDZCxxQkFBcUIsTUFBTTtBQUMxQixlQUFLLE9BQU8sS0FBSyxNQUFNLE9BQU8sS0FBSyxNQUFNLGVBQWUsS0FBSyxNQUFNLFlBQVk7QUFDL0UsZUFBSyxxQkFBcUIsS0FBSyxJQUFJO0FBQUEsUUFDcEM7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLE1BQU0sWUFBWSxpQkFBaUIsT0FBTztBQUMvQyxXQUFLLG1CQUFtQixJQUFJLGdCQUFnQjtBQUFBLElBQzdDO0FBRUEsU0FBSyxRQUFRLFVBQVUsT0FBTyxrQkFBa0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLGFBQWE7QUFFM0UsU0FBSyxRQUFRLE1BQU0sYUFBYTtBQUNoQyxTQUFLLFFBQVEsV0FBVztBQUV4QixTQUFLLE9BQU8sY0FBYyxPQUFLO0FBQzlCLFFBQUUsZUFBZTtBQUNqQixRQUFFLGdCQUFnQjtBQUFBLElBQ25CO0FBQ0EsU0FBSyxPQUFPLFVBQVUsT0FBSztBQUMxQixRQUFFLGVBQWU7QUFDakIsUUFBRSxnQkFBZ0I7QUFDbEIsV0FBSyxZQUFZLEtBQUs7QUFBQSxJQUN2QjtBQUVBLFNBQUssTUFBTSxZQUFZO0FBRXZCLFNBQUssT0FBTyxLQUFLLE1BQU0sT0FBTyxLQUFLLE1BQU0sZUFBZSxLQUFLLE1BQU0sWUFBWTtBQUMvRSxTQUFLLHFCQUFxQixLQUFLLElBQUk7QUFBQSxFQUNwQztBQUFBLEVBRUEsZ0JBQWdCO0FBQ2YsU0FBSyxRQUFRLFVBQVUsSUFBSSxTQUFTO0FBQ3BDLFNBQUssTUFBTSxjQUFjO0FBQ3pCLFNBQUssTUFBTSxjQUFjO0FBQUEsRUFDMUI7QUFBQSxFQUVBLElBQUksVUFBbUI7QUFDdEIsV0FBTyxLQUFLLFFBQVEsVUFBVSxTQUFTLFNBQVM7QUFBQSxFQUNqRDtBQUFBLEVBRUEsSUFBSSxPQUFPO0FBQ1YsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsT0FBTyxPQUFlLFFBQXNCO0FBQzNDLFVBQU0sVUFBVSxJQUFJLElBQUksVUFBVSxPQUFPLE1BQU07QUFDL0MsUUFBSSxDQUFDLElBQUksVUFBVSxPQUFPLFNBQVMsS0FBSyxLQUFLLEdBQUc7QUFDL0MsV0FBSyxRQUFRO0FBQ2IsVUFBSSxLQUFLLEtBQUssU0FBUyxPQUFPLE1BQU07QUFBQSxJQUNyQztBQUNBLFNBQUssV0FBVyxZQUFZO0FBQUEsRUFDN0I7QUFBQSxFQUVBLFdBQVcsT0FBTyxHQUFTO0FBQzFCLFNBQUssTUFBTSxhQUFhO0FBQUEsRUFDekI7QUFBQSxFQUVBLFNBQVMsT0FBTyxHQUFTO0FBQ3hCLFNBQUssTUFBTSxhQUFhO0FBQUEsRUFDekI7QUFBQSxFQUVBLFlBQWtCO0FBQ2pCLFNBQUssTUFBTSxZQUFZO0FBQUEsRUFDeEI7QUFBQSxFQUVBLGVBQXFCO0FBQ3BCLFNBQUssTUFBTSxZQUFZLEtBQUssTUFBTTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxXQUFpQjtBQUNoQixTQUFLLFdBQVcsRUFBRTtBQUFBLEVBQ25CO0FBQUEsRUFFQSxTQUFlO0FBQ2QsU0FBSyxTQUFTLEVBQUU7QUFBQSxFQUNqQjtBQUFBLEVBRUEsUUFBUTtBQUNQLFNBQUssUUFBUSxNQUFNO0FBQUEsRUFDcEI7QUFDRDtBQTNPYSx1QkFBTjtBQUFBLEVBdUJKO0FBQUEsRUFDQTtBQUFBLEdBeEJVO0FBa1BOLE1BQU0sc0JBQWdEO0FBQUEsRUFhNUQsWUFDVSxRQUNRLFNBQ2hCO0FBRlE7QUFDUTtBQWJsQixTQUFTLHNCQUFzQjtBQUUvQixTQUFpQixlQUFlLElBQUksZ0JBQWdCO0FBR3BELFNBQVEsU0FBa0I7QUFFMUIsU0FBUSxvQkFBNkI7QUFTcEMsU0FBSyxhQUFhLElBQUkscUJBQXFCO0FBQzNDLFNBQUssV0FBVyxRQUFRLFVBQVUsSUFBSSwyQkFBMkI7QUFDakUsU0FBSyxXQUFXLFFBQVEsWUFBWSxPQUFPLE9BQU87QUFDbEQsU0FBSyxXQUFXLGFBQWEsT0FBTyxNQUFNLE1BQU0sS0FBSztBQUVyRCxRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUksV0FBbUI7QUFDdkIsUUFBSSxZQUFvQjtBQUN4QixTQUFLLGFBQWEsSUFBSSxLQUFLLFdBQVcsZ0JBQWdCLE1BQU07QUFDM0QsbUJBQWEsS0FBSztBQUNsQixnQkFBVSxLQUFLLFdBQVc7QUFBQSxJQUMzQixDQUFDLENBQUM7QUFFRixTQUFLLGFBQWEsSUFBSSxLQUFLLFdBQVcsWUFBWSxPQUFLO0FBQ3RELFVBQUksY0FBYyxTQUFTO0FBQzFCLGFBQUssT0FBTyxPQUFPLEVBQUUsVUFBVSxPQUFPLEVBQUUsVUFBVSxNQUFNO0FBRXhELFlBQUksZ0JBQWdCO0FBQ3BCLFlBQUksRUFBRSxNQUFNO0FBQ1gsc0JBQVksUUFBUSxRQUFRLEVBQUUsVUFBVTtBQUN4QywwQkFBZ0I7QUFBQSxRQUNqQjtBQUNBLFlBQUksRUFBRSxPQUFPO0FBQ1oscUJBQVcsUUFBUSxTQUFTLEVBQUUsVUFBVTtBQUN4QywwQkFBZ0I7QUFBQSxRQUNqQjtBQUNBLFlBQUksZUFBZTtBQUNsQixlQUFLLGNBQWM7QUFBQSxZQUNsQixLQUFLLFdBQVcsTUFBTTtBQUFBLFlBQ3RCLE1BQU0sV0FBVyxPQUFPO0FBQUEsVUFDekIsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQ0EsVUFBSSxFQUFFLE1BQU07QUFDWCxxQkFBYTtBQUNiLGtCQUFVO0FBQ1YsbUJBQVc7QUFDWCxvQkFBWTtBQUNaLGFBQUssWUFBWSxFQUFFO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssYUFBYSxJQUFJLEtBQUssT0FBTyxvQkFBb0IsTUFBTTtBQUMzRCxVQUFJLEtBQUssWUFBWTtBQUNwQixhQUFLLGVBQWUsS0FBSyxZQUFZLEtBQUssYUFBYSxLQUFLLE9BQU8sTUFBTSxLQUFLLGlCQUFpQjtBQUFBLE1BQ2hHO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssV0FBVyxRQUFRO0FBQ3hCLFNBQUssYUFBYSxRQUFRO0FBQzFCLFNBQUssS0FBSztBQUFBLEVBQ1g7QUFBQSxFQUVBLFFBQWdCO0FBQ2YsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGFBQTBCO0FBQ3pCLFdBQU8sS0FBSyxXQUFXO0FBQUEsRUFDeEI7QUFBQSxFQUVBLGNBQTZDO0FBQzVDLFdBQU8sS0FBSyxXQUFXLEVBQUUsWUFBWSxLQUFLLFNBQVMsSUFBSTtBQUFBLEVBQ3hEO0FBQUEsRUFFQSxPQUFhO0FBQ1osUUFBSSxDQUFDLEtBQUssUUFBUTtBQUNqQixXQUFLLFFBQVEsaUJBQWlCLElBQUk7QUFDbEMsV0FBSyxTQUFTO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLEtBQUssZUFBd0IsT0FBYTtBQUN6QyxTQUFLLFdBQVcsb0JBQW9CO0FBRXBDLFFBQUksS0FBSyxRQUFRO0FBQ2hCLFdBQUssUUFBUSxvQkFBb0IsSUFBSTtBQUNyQyxXQUFLLFNBQVM7QUFDZCxXQUFLLGFBQWE7QUFDbEIsV0FBSyxXQUFXO0FBQUEsSUFDakI7QUFDQSxRQUFJLGNBQWM7QUFDakIsV0FBSyxZQUFZO0FBQ2pCLFdBQUssT0FBTyxjQUFjO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQUEsRUFFQSxjQUFjLFFBQXFCLGtCQUEyQjtBQUM3RCxVQUFNLFlBQVksT0FBTyxzQkFBc0I7QUFDL0MsU0FBSyxhQUFhO0FBQ2xCLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssZUFBZSxLQUFLLFlBQVksS0FBSyxhQUFhLEtBQUssT0FBTyxNQUFNLGdCQUFnQjtBQUFBLEVBQzFGO0FBQUEsRUFFQSxlQUFlLFdBQXFDLE1BQXFCLGtCQUEyQjtBQUNuRyxVQUFNLFVBQVUsSUFBSSxjQUFjLEtBQUssV0FBVyxFQUFFLGNBQWMsSUFBSTtBQUV0RSxVQUFNLE9BQU8sS0FBSyxPQUFPLGNBQWM7QUFFdkMsVUFBTSxpQkFBaUIsSUFBSSxJQUFJLFVBQVUsS0FBSyxJQUFJLEtBQUssVUFBVTtBQUNqRSxVQUFNLGFBQWEsVUFBVTtBQUs3QixVQUFNLGlCQUE0QixXQUFZO0FBQzdDLFlBQU0sUUFBUSxRQUFRLFNBQVMsVUFBVSxPQUFPLFVBQVUsUUFBUSxLQUFLLGNBQWMsS0FBSztBQUMxRixZQUFNQSxRQUFPLENBQUMsS0FBSyxjQUFjLFVBQVUsT0FBTyxVQUFVO0FBQzVELFlBQU0sYUFBYSxJQUFJLElBQUksVUFBVSxPQUFPLFFBQVEsU0FBUyxVQUFVLE1BQU0sS0FBSyxlQUFlLEtBQUssZUFBZTtBQUNySCxZQUFNLGdCQUFnQixXQUFXLEtBQUssUUFBVyxVQUFVLE1BQU0sVUFBVSxTQUFTLEtBQUssZUFBZSxLQUFLLGVBQWU7QUFDNUgsYUFBTyxFQUFFLEtBQUssWUFBWSxNQUFBQSxPQUFNLEtBQUssUUFBUSxLQUFLLE9BQU8sWUFBWSxlQUFlLFNBQVMsZUFBZSxLQUFLLEtBQUssSUFBSSxPQUFPLGVBQWUsS0FBSyxDQUFDLEVBQUU7QUFBQSxJQUN6SixHQUFHO0FBR0gsVUFBTSxpQkFBNEIsV0FBWTtBQUM3QyxZQUFNLFFBQVEsVUFBVSxPQUFPLEtBQUssY0FBYyxLQUFLO0FBQ3ZELFlBQU1BLFFBQU8sS0FBSyxJQUFJLEtBQUssbUJBQW1CLFVBQVUsT0FBTyxLQUFLLFFBQVEsS0FBSyxXQUFXO0FBQzVGLFlBQU0sYUFBYSxJQUFJLElBQUksVUFBVSxPQUFPLFFBQVEsU0FBUyxVQUFVLE1BQU0sS0FBSyxlQUFlLEtBQUssZUFBZTtBQUNySCxZQUFNLGdCQUFnQixXQUFXLEtBQUssUUFBVyxVQUFVLE1BQU0sVUFBVSxTQUFTLEtBQUssZUFBZSxLQUFLLGVBQWU7QUFDNUgsYUFBTyxFQUFFLEtBQUssWUFBWSxNQUFBQSxPQUFNLEtBQUssUUFBUSxLQUFLLE9BQU8sWUFBWSxlQUFlLFNBQVMsZUFBZSxLQUFLLEtBQUssSUFBSSxPQUFPLGVBQWUsS0FBSyxDQUFDLEVBQUU7QUFBQSxJQUN6SixHQUFHO0FBR0gsVUFBTSxrQkFBNkIsV0FBWTtBQUM5QyxZQUFNQSxRQUFPLFVBQVU7QUFDdkIsWUFBTUMsT0FBTSxDQUFDLEtBQUssY0FBYyxVQUFVLE1BQU0sVUFBVTtBQUMxRCxZQUFNLGdCQUFnQixJQUFJLElBQUksVUFBVSxVQUFVLFFBQVEsS0FBSyxjQUFjLFFBQVEsU0FBUyxVQUFVLE1BQU0sVUFBVSxTQUFTLEtBQUssZUFBZTtBQUNySixhQUFPLEVBQUUsS0FBQUEsTUFBSyxNQUFBRCxPQUFNLEtBQUssY0FBYyxTQUFTLEtBQUssUUFBUSxlQUFlLFlBQVksZUFBZSxTQUFTLGVBQWUsS0FBSyxjQUFjLEtBQUssRUFBRTtBQUFBLElBQzFKLEdBQUc7QUFHSCxVQUFNLGtCQUE2QixXQUFZO0FBQzlDLFlBQU1BLFFBQU8sVUFBVTtBQUN2QixZQUFNLGFBQWEsSUFBSSxJQUFJLFVBQVUsVUFBVSxRQUFRLEtBQUssY0FBYyxVQUFVLE1BQU0sS0FBSyxlQUFlO0FBQzlHLFlBQU1DLE9BQU0sS0FBSyxJQUFJLEtBQUssaUJBQWlCLFVBQVUsTUFBTSxLQUFLLE1BQU07QUFDdEUsYUFBTyxFQUFFLEtBQUFBLE1BQUssTUFBQUQsT0FBTSxLQUFLLFdBQVcsU0FBUyxLQUFLLFFBQVEsWUFBWSxlQUFlLFlBQVksU0FBUyxlQUFlLEtBQUssV0FBVyxLQUFLLEVBQUU7QUFBQSxJQUNqSixHQUFHO0FBSUgsVUFBTSxvQkFBb0IsbUJBQW1CLGlCQUFpQjtBQUM5RCxVQUFNLGFBQWEsQ0FBQyxlQUFlLGVBQWUsaUJBQWlCO0FBQ25FLFVBQU0sWUFBWSxXQUFXLEtBQUssT0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLLFdBQVcsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsQ0FBQztBQUVoRyxVQUFNLFNBQVMsVUFBVSxNQUFNLFVBQVUsU0FBUyxLQUFLO0FBQ3ZELFFBQUk7QUFDSixRQUFJLFNBQVMsS0FBSztBQUNsQixVQUFNLFlBQVksS0FBSyxJQUFJLFVBQVUsV0FBVyxRQUFRLFVBQVUsY0FBYyxNQUFNO0FBQ3RGLFFBQUksU0FBUyxXQUFXO0FBQ3ZCLGVBQVM7QUFBQSxJQUNWO0FBQ0EsUUFBSTtBQUNKLFFBQUksa0JBQWtCO0FBQ3JCLFVBQUksVUFBVSxVQUFVLFdBQVcsUUFBUTtBQUMxQyxxQkFBYTtBQUNiLGtCQUFVLFVBQVU7QUFBQSxNQUNyQixPQUFPO0FBQ04scUJBQWE7QUFDYixrQkFBVSxVQUFVO0FBQUEsTUFDckI7QUFBQSxJQUNELE9BQU87QUFDTixVQUFJLFVBQVUsVUFBVSxjQUFjLFFBQVE7QUFDN0MscUJBQWE7QUFDYixrQkFBVSxVQUFVO0FBQUEsTUFDckIsT0FBTztBQUNOLHFCQUFhO0FBQ2Isa0JBQVUsVUFBVTtBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUNBLFFBQUksRUFBRSxLQUFLLEtBQUssSUFBSTtBQUNwQixRQUFJLGNBQWMsZ0JBQWdCO0FBRWpDLFlBQU0sVUFBVSxNQUFNLFNBQVMsS0FBSztBQUFBLElBQ3JDLFdBQVcsQ0FBQyxjQUFjLFNBQVMsVUFBVSxRQUFRO0FBQ3BELFlBQU0sU0FBUztBQUFBLElBQ2hCO0FBQ0EsVUFBTSxnQkFBZ0IsS0FBSyxRQUFRLFdBQVc7QUFDOUMsUUFBSSxlQUFlO0FBRWxCLFlBQU0sb0JBQW9CLGNBQWMsc0JBQXNCO0FBQzlELGFBQU8sa0JBQWtCO0FBQ3pCLGNBQVEsa0JBQWtCO0FBQUEsSUFDM0I7QUFDQSxTQUFLLGNBQWMsRUFBRSxNQUFNLElBQUksQ0FBQztBQU1oQyxRQUFJLGNBQWMsZ0JBQWdCO0FBQ2pDLFdBQUssV0FBVyxhQUFhLE1BQU0sT0FBTyxPQUFPLElBQUk7QUFBQSxJQUN0RCxPQUFPO0FBQ04sV0FBSyxXQUFXLGFBQWEsQ0FBQyxZQUFZLGNBQWMsZUFBZSxZQUFZLGNBQWMsYUFBYTtBQUFBLElBQy9HO0FBRUEsU0FBSyxXQUFXLFVBQVUsVUFBVTtBQUNwQyxTQUFLLFdBQVcsVUFBVTtBQUMxQixTQUFLLFdBQVcsT0FBTyxRQUFRLEtBQUssSUFBSSxRQUFRLE9BQU8sS0FBSyxLQUFLLENBQUM7QUFDbEUsU0FBSyxPQUFPLE9BQU8sS0FBSyxXQUFXLEtBQUssT0FBTyxLQUFLLFdBQVcsS0FBSyxNQUFNO0FBQUEsRUFDM0U7QUFBQSxFQUVRLGNBQWMsU0FBZ0M7QUFDckQsU0FBSyxXQUFXO0FBQ2hCLFNBQUssUUFBUSxvQkFBb0IsSUFBSTtBQUFBLEVBQ3RDO0FBQ0Q7IiwKICAibmFtZXMiOiBbImxlZnQiLCAidG9wIl0KfQo=
