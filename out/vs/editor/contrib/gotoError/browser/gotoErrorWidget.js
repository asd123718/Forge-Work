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
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { ScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { Color } from "../../../../base/common/color.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { basename } from "../../../../base/common/resources.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { splitLines } from "../../../../base/common/strings.js";
import "./media/gotoErrorWidget.css";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { peekViewTitleForeground, peekViewTitleInfoForeground, PeekViewWidget } from "../../peekView/browser/peekView.js";
import * as nls from "../../../../nls.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { contrastBorder, editorBackground, editorErrorBorder, editorErrorForeground, editorInfoBorder, editorInfoForeground, editorWarningBorder, editorWarningForeground, oneOf, registerColor, transparent } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
class MessageWidget {
  constructor(parent, editor, onRelatedInformation, _openerService, _labelService) {
    this._openerService = _openerService;
    this._labelService = _labelService;
    this._lines = 0;
    this._longestLineLength = 0;
    this._relatedDiagnostics = /* @__PURE__ */ new WeakMap();
    this._disposables = new DisposableStore();
    this._editor = editor;
    const domNode = document.createElement("div");
    domNode.className = "descriptioncontainer";
    this._messageBlock = document.createElement("div");
    this._messageBlock.classList.add("message");
    this._messageBlock.setAttribute("aria-live", "assertive");
    this._messageBlock.setAttribute("role", "alert");
    domNode.appendChild(this._messageBlock);
    this._relatedBlock = document.createElement("div");
    domNode.appendChild(this._relatedBlock);
    this._disposables.add(dom.addStandardDisposableListener(this._relatedBlock, "click", (event) => {
      event.preventDefault();
      const related = this._relatedDiagnostics.get(event.target);
      if (related) {
        onRelatedInformation(related);
      }
    }));
    this._scrollable = new ScrollableElement(domNode, {
      horizontal: ScrollbarVisibility.Auto,
      vertical: ScrollbarVisibility.Auto,
      useShadows: false,
      horizontalScrollbarSize: 6,
      verticalScrollbarSize: 6
    });
    parent.appendChild(this._scrollable.getDomNode());
    this._disposables.add(this._scrollable.onScroll((e) => {
      domNode.style.left = `-${e.scrollLeft}px`;
      domNode.style.top = `-${e.scrollTop}px`;
    }));
    this._disposables.add(this._scrollable);
  }
  dispose() {
    dispose(this._disposables);
  }
  update(marker) {
    const { source, message, relatedInformation, code } = marker;
    let sourceAndCodeLength = (source?.length || 0) + "()".length;
    if (code) {
      if (typeof code === "string") {
        sourceAndCodeLength += code.length;
      } else {
        sourceAndCodeLength += code.value.length;
      }
    }
    const lines = splitLines(message);
    this._lines = lines.length;
    this._longestLineLength = 0;
    for (const line of lines) {
      this._longestLineLength = Math.max(line.length + sourceAndCodeLength, this._longestLineLength);
    }
    dom.clearNode(this._messageBlock);
    this._messageBlock.setAttribute("aria-label", this.getAriaLabel(marker));
    aria.status(this.getAriaLabel(marker));
    this._editor.applyFontInfo(this._messageBlock);
    let lastLineElement = this._messageBlock;
    for (const line of lines) {
      lastLineElement = document.createElement("div");
      lastLineElement.innerText = line;
      if (line === "") {
        lastLineElement.style.height = this._messageBlock.style.lineHeight;
      }
      this._messageBlock.appendChild(lastLineElement);
    }
    if (source || code) {
      const detailsElement = document.createElement("span");
      detailsElement.classList.add("details");
      lastLineElement.appendChild(detailsElement);
      if (source) {
        const sourceElement = document.createElement("span");
        sourceElement.innerText = source;
        sourceElement.classList.add("source");
        detailsElement.appendChild(sourceElement);
      }
      if (code) {
        if (typeof code === "string") {
          const codeElement = document.createElement("span");
          codeElement.innerText = `(${code})`;
          codeElement.classList.add("code");
          detailsElement.appendChild(codeElement);
        } else {
          this._codeLink = dom.$("a.code-link");
          this._codeLink.setAttribute("href", `${code.target.toString()}`);
          this._codeLink.onclick = (e) => {
            this._openerService.open(code.target);
            e.preventDefault();
            e.stopPropagation();
          };
          const codeElement = dom.append(this._codeLink, dom.$("span"));
          codeElement.innerText = code.value;
          detailsElement.appendChild(this._codeLink);
        }
      }
    }
    dom.clearNode(this._relatedBlock);
    this._editor.applyFontInfo(this._relatedBlock);
    if (isNonEmptyArray(relatedInformation)) {
      const relatedInformationNode = this._relatedBlock.appendChild(document.createElement("div"));
      relatedInformationNode.style.paddingTop = `${Math.floor(this._editor.getOption(EditorOption.lineHeight) * 0.66)}px`;
      this._lines += 1;
      for (const related of relatedInformation) {
        const container = document.createElement("div");
        const relatedResource = document.createElement("a");
        relatedResource.classList.add("filename");
        relatedResource.innerText = `${this._labelService.getUriBasenameLabel(related.resource)}(${related.startLineNumber}, ${related.startColumn}): `;
        relatedResource.title = this._labelService.getUriLabel(related.resource);
        this._relatedDiagnostics.set(relatedResource, related);
        const relatedMessage = document.createElement("span");
        relatedMessage.innerText = related.message;
        container.appendChild(relatedResource);
        container.appendChild(relatedMessage);
        this._lines += 1;
        relatedInformationNode.appendChild(container);
      }
    }
    const fontInfo = this._editor.getOption(EditorOption.fontInfo);
    const scrollWidth = Math.ceil(fontInfo.typicalFullwidthCharacterWidth * this._longestLineLength * 0.75);
    const scrollHeight = fontInfo.lineHeight * this._lines;
    this._scrollable.setScrollDimensions({ scrollWidth, scrollHeight });
  }
  layout(height, width) {
    this._scrollable.getDomNode().style.height = `${height}px`;
    this._scrollable.getDomNode().style.width = `${width}px`;
    this._scrollable.setScrollDimensions({ width, height });
  }
  getHeightInLines() {
    return Math.min(17, this._lines);
  }
  getAriaLabel(marker) {
    let severityLabel = "";
    switch (marker.severity) {
      case MarkerSeverity.Error:
        severityLabel = nls.localize("Error", "Error");
        break;
      case MarkerSeverity.Warning:
        severityLabel = nls.localize("Warning", "Warning");
        break;
      case MarkerSeverity.Info:
        severityLabel = nls.localize("Info", "Info");
        break;
      case MarkerSeverity.Hint:
        severityLabel = nls.localize("Hint", "Hint");
        break;
    }
    let ariaLabel = nls.localize("marker aria", "{0}: {1} at {2}. ", severityLabel, marker.message, marker.startLineNumber + ":" + marker.startColumn);
    const model = this._editor.getModel();
    if (model && marker.startLineNumber <= model.getLineCount() && marker.startLineNumber >= 1) {
      const lineContent = model.getLineContent(marker.startLineNumber);
      ariaLabel = `${lineContent}, ${ariaLabel}`;
    }
    return ariaLabel;
  }
}
let MarkerNavigationWidget = class extends PeekViewWidget {
  constructor(editor, _themeService, _openerService, _menuService, instantiationService, _contextKeyService, _labelService) {
    super(editor, { showArrow: true, showFrame: true, isAccessible: true, frameWidth: 1 }, instantiationService);
    this._themeService = _themeService;
    this._openerService = _openerService;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._labelService = _labelService;
    this._callOnDispose = new DisposableStore();
    this._onDidSelectRelatedInformation = new Emitter();
    this.onDidSelectRelatedInformation = this._onDidSelectRelatedInformation.event;
    this._severity = MarkerSeverity.Warning;
    this._backgroundColor = Color.white;
    this._applyTheme(_themeService.getColorTheme());
    this._callOnDispose.add(_themeService.onDidColorThemeChange(this._applyTheme.bind(this)));
    this.create();
  }
  _applyTheme(theme) {
    this._backgroundColor = theme.getColor(editorMarkerNavigationBackground);
    let colorId = editorMarkerNavigationError;
    let headerBackground = editorMarkerNavigationErrorHeader;
    if (this._severity === MarkerSeverity.Warning) {
      colorId = editorMarkerNavigationWarning;
      headerBackground = editorMarkerNavigationWarningHeader;
    } else if (this._severity === MarkerSeverity.Info) {
      colorId = editorMarkerNavigationInfo;
      headerBackground = editorMarkerNavigationInfoHeader;
    }
    const frameColor = theme.getColor(colorId);
    const headerBg = theme.getColor(headerBackground);
    this.style({
      arrowColor: frameColor,
      frameColor,
      headerBackgroundColor: headerBg,
      primaryHeadingColor: theme.getColor(peekViewTitleForeground),
      secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
    });
  }
  _applyStyles() {
    if (this._parentContainer) {
      this._parentContainer.style.backgroundColor = this._backgroundColor ? this._backgroundColor.toString() : "";
    }
    super._applyStyles();
  }
  dispose() {
    this._callOnDispose.dispose();
    this._onDidSelectRelatedInformation.dispose();
    super.dispose();
  }
  focus() {
    this._parentContainer.focus();
  }
  _fillHead(container) {
    super._fillHead(container);
    this._disposables.add(this._actionbarWidget.actionRunner.onWillRun((e) => this.editor.focus()));
    const menu = this._menuService.getMenuActions(MarkerNavigationWidget.TitleMenu, this._contextKeyService);
    const actions = getFlatActionBarActions(menu);
    this._actionbarWidget.push(actions, { label: false, icon: true, index: 0 });
  }
  _fillTitleIcon(container) {
    this._icon = dom.append(container, dom.$(""));
  }
  _fillBody(container) {
    this._parentContainer = container;
    container.classList.add("marker-widget");
    this._parentContainer.tabIndex = 0;
    this._parentContainer.setAttribute("role", "tooltip");
    this._container = document.createElement("div");
    container.appendChild(this._container);
    this._message = new MessageWidget(this._container, this.editor, (related) => this._onDidSelectRelatedInformation.fire(related), this._openerService, this._labelService);
    this._disposables.add(this._message);
  }
  show() {
    throw new Error("call showAtMarker");
  }
  showAtMarker(marker, markerIdx, markerCount) {
    this._container.classList.remove("stale");
    this._message.update(marker);
    this._severity = marker.severity;
    this._applyTheme(this._themeService.getColorTheme());
    const range = Range.lift(marker);
    const editorPosition = this.editor.getPosition();
    const position = editorPosition && range.containsPosition(editorPosition) ? editorPosition : range.getStartPosition();
    super.show(position, this.computeRequiredHeight());
    const model = this.editor.getModel();
    if (model) {
      const detail = markerCount > 1 ? nls.localize("problems", "{0} of {1} problems", markerIdx, markerCount) : nls.localize("change", "{0} of {1} problem", markerIdx, markerCount);
      this.setTitle(basename(model.uri), detail);
    }
    this._icon.className = `codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(this._severity))}`;
    this.editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);
    this.editor.focus();
  }
  updateMarker(marker) {
    this._container.classList.remove("stale");
    this._message.update(marker);
  }
  showStale() {
    this._container.classList.add("stale");
    this._relayout();
  }
  _doLayoutBody(heightInPixel, widthInPixel) {
    super._doLayoutBody(heightInPixel, widthInPixel);
    this._heightInPixel = heightInPixel;
    this._message.layout(heightInPixel, widthInPixel);
    this._container.style.height = `${heightInPixel}px`;
  }
  _onWidth(widthInPixel) {
    this._message.layout(this._heightInPixel, widthInPixel);
  }
  _relayout() {
    super._relayout(this.computeRequiredHeight());
  }
  computeRequiredHeight() {
    return 3 + this._message.getHeightInLines();
  }
};
MarkerNavigationWidget.TitleMenu = new MenuId("gotoErrorTitleMenu");
MarkerNavigationWidget = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ILabelService)
], MarkerNavigationWidget);
const errorDefault = oneOf(editorErrorForeground, editorErrorBorder);
const warningDefault = oneOf(editorWarningForeground, editorWarningBorder);
const infoDefault = oneOf(editorInfoForeground, editorInfoBorder);
const editorMarkerNavigationError = registerColor("editorMarkerNavigationError.background", { dark: errorDefault, light: errorDefault, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize("editorMarkerNavigationError", "Editor marker navigation widget error color."));
const editorMarkerNavigationErrorHeader = registerColor("editorMarkerNavigationError.headerBackground", { dark: transparent(editorMarkerNavigationError, 0.1), light: transparent(editorMarkerNavigationError, 0.1), hcDark: null, hcLight: null }, nls.localize("editorMarkerNavigationErrorHeaderBackground", "Editor marker navigation widget error heading background."));
const editorMarkerNavigationWarning = registerColor("editorMarkerNavigationWarning.background", { dark: warningDefault, light: warningDefault, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize("editorMarkerNavigationWarning", "Editor marker navigation widget warning color."));
const editorMarkerNavigationWarningHeader = registerColor("editorMarkerNavigationWarning.headerBackground", { dark: transparent(editorMarkerNavigationWarning, 0.1), light: transparent(editorMarkerNavigationWarning, 0.1), hcDark: "#0C141F", hcLight: transparent(editorMarkerNavigationWarning, 0.2) }, nls.localize("editorMarkerNavigationWarningBackground", "Editor marker navigation widget warning heading background."));
const editorMarkerNavigationInfo = registerColor("editorMarkerNavigationInfo.background", { dark: infoDefault, light: infoDefault, hcDark: contrastBorder, hcLight: contrastBorder }, nls.localize("editorMarkerNavigationInfo", "Editor marker navigation widget info color."));
const editorMarkerNavigationInfoHeader = registerColor("editorMarkerNavigationInfo.headerBackground", { dark: transparent(editorMarkerNavigationInfo, 0.1), light: transparent(editorMarkerNavigationInfo, 0.1), hcDark: null, hcLight: null }, nls.localize("editorMarkerNavigationInfoHeaderBackground", "Editor marker navigation widget info heading background."));
const editorMarkerNavigationBackground = registerColor("editorMarkerNavigation.background", editorBackground, nls.localize("editorMarkerNavigationBackground", "Editor marker navigation widget background."));
export {
  MarkerNavigationWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGdvdG9FcnJvclxcYnJvd3NlclxcZ290b0Vycm9yV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgYXJpYSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBpc05vbkVtcHR5QXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvZ290b0Vycm9yV2lkZ2V0LmNzcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBwZWVrVmlld1RpdGxlRm9yZWdyb3VuZCwgcGVla1ZpZXdUaXRsZUluZm9Gb3JlZ3JvdW5kLCBQZWVrVmlld1dpZGdldCB9IGZyb20gJy4uLy4uL3BlZWtWaWV3L2Jyb3dzZXIvcGVla1ZpZXcuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSU1hcmtlciwgSVJlbGF0ZWRJbmZvcm1hdGlvbiwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHlJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NldmVyaXR5SWNvbi9zZXZlcml0eUljb24uanMnO1xuaW1wb3J0IHsgY29udHJhc3RCb3JkZXIsIGVkaXRvckJhY2tncm91bmQsIGVkaXRvckVycm9yQm9yZGVyLCBlZGl0b3JFcnJvckZvcmVncm91bmQsIGVkaXRvckluZm9Cb3JkZXIsIGVkaXRvckluZm9Gb3JlZ3JvdW5kLCBlZGl0b3JXYXJuaW5nQm9yZGVyLCBlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCwgb25lT2YsIHJlZ2lzdGVyQ29sb3IsIHRyYW5zcGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcblxuY2xhc3MgTWVzc2FnZVdpZGdldCB7XG5cblx0cHJpdmF0ZSBfbGluZXM6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2xvbmdlc3RMaW5lTGVuZ3RoOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VCbG9jazogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbGF0ZWRCbG9jazogSFRNTERpdkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njcm9sbGFibGU6IFNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWxhdGVkRGlhZ25vc3RpY3MgPSBuZXcgV2Vha01hcDxIVE1MRWxlbWVudCwgSVJlbGF0ZWRJbmZvcm1hdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIF9jb2RlTGluaz86IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRvblJlbGF0ZWRJbmZvcm1hdGlvbjogKHJlbGF0ZWQ6IElSZWxhdGVkSW5mb3JtYXRpb24pID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblxuXHRcdGNvbnN0IGRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkb21Ob2RlLmNsYXNzTmFtZSA9ICdkZXNjcmlwdGlvbmNvbnRhaW5lcic7XG5cblx0XHR0aGlzLl9tZXNzYWdlQmxvY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9tZXNzYWdlQmxvY2suY2xhc3NMaXN0LmFkZCgnbWVzc2FnZScpO1xuXHRcdHRoaXMuX21lc3NhZ2VCbG9jay5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdhc3NlcnRpdmUnKTtcblx0XHR0aGlzLl9tZXNzYWdlQmxvY2suc2V0QXR0cmlidXRlKCdyb2xlJywgJ2FsZXJ0Jyk7XG5cdFx0ZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9tZXNzYWdlQmxvY2spO1xuXG5cdFx0dGhpcy5fcmVsYXRlZEJsb2NrID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9yZWxhdGVkQmxvY2spO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fcmVsYXRlZEJsb2NrLCAnY2xpY2snLCBldmVudCA9PiB7XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0Y29uc3QgcmVsYXRlZCA9IHRoaXMuX3JlbGF0ZWREaWFnbm9zdGljcy5nZXQoZXZlbnQudGFyZ2V0KTtcblx0XHRcdGlmIChyZWxhdGVkKSB7XG5cdFx0XHRcdG9uUmVsYXRlZEluZm9ybWF0aW9uKHJlbGF0ZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3Njcm9sbGFibGUgPSBuZXcgU2Nyb2xsYWJsZUVsZW1lbnQoZG9tTm9kZSwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byxcblx0XHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhclNpemU6IDYsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IDZcblx0XHR9KTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQodGhpcy5fc2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9zY3JvbGxhYmxlLm9uU2Nyb2xsKGUgPT4ge1xuXHRcdFx0ZG9tTm9kZS5zdHlsZS5sZWZ0ID0gYC0ke2Uuc2Nyb2xsTGVmdH1weGA7XG5cdFx0XHRkb21Ob2RlLnN0eWxlLnRvcCA9IGAtJHtlLnNjcm9sbFRvcH1weGA7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9zY3JvbGxhYmxlKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLl9kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHR1cGRhdGUobWFya2VyOiBJTWFya2VyKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBzb3VyY2UsIG1lc3NhZ2UsIHJlbGF0ZWRJbmZvcm1hdGlvbiwgY29kZSB9ID0gbWFya2VyO1xuXHRcdGxldCBzb3VyY2VBbmRDb2RlTGVuZ3RoID0gKHNvdXJjZT8ubGVuZ3RoIHx8IDApICsgJygpJy5sZW5ndGg7XG5cdFx0aWYgKGNvZGUpIHtcblx0XHRcdGlmICh0eXBlb2YgY29kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0c291cmNlQW5kQ29kZUxlbmd0aCArPSBjb2RlLmxlbmd0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNvdXJjZUFuZENvZGVMZW5ndGggKz0gY29kZS52YWx1ZS5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZXMgPSBzcGxpdExpbmVzKG1lc3NhZ2UpO1xuXHRcdHRoaXMuX2xpbmVzID0gbGluZXMubGVuZ3RoO1xuXHRcdHRoaXMuX2xvbmdlc3RMaW5lTGVuZ3RoID0gMDtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdHRoaXMuX2xvbmdlc3RMaW5lTGVuZ3RoID0gTWF0aC5tYXgobGluZS5sZW5ndGggKyBzb3VyY2VBbmRDb2RlTGVuZ3RoLCB0aGlzLl9sb25nZXN0TGluZUxlbmd0aCk7XG5cdFx0fVxuXG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9tZXNzYWdlQmxvY2spO1xuXHRcdHRoaXMuX21lc3NhZ2VCbG9jay5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLmdldEFyaWFMYWJlbChtYXJrZXIpKTtcblx0XHRhcmlhLnN0YXR1cyh0aGlzLmdldEFyaWFMYWJlbChtYXJrZXIpKTtcblx0XHR0aGlzLl9lZGl0b3IuYXBwbHlGb250SW5mbyh0aGlzLl9tZXNzYWdlQmxvY2spO1xuXHRcdGxldCBsYXN0TGluZUVsZW1lbnQgPSB0aGlzLl9tZXNzYWdlQmxvY2s7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRsYXN0TGluZUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdGxhc3RMaW5lRWxlbWVudC5pbm5lclRleHQgPSBsaW5lO1xuXHRcdFx0aWYgKGxpbmUgPT09ICcnKSB7XG5cdFx0XHRcdGxhc3RMaW5lRWxlbWVudC5zdHlsZS5oZWlnaHQgPSB0aGlzLl9tZXNzYWdlQmxvY2suc3R5bGUubGluZUhlaWdodDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX21lc3NhZ2VCbG9jay5hcHBlbmRDaGlsZChsYXN0TGluZUVsZW1lbnQpO1xuXHRcdH1cblx0XHRpZiAoc291cmNlIHx8IGNvZGUpIHtcblx0XHRcdGNvbnN0IGRldGFpbHNFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdFx0ZGV0YWlsc0VsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGV0YWlscycpO1xuXHRcdFx0bGFzdExpbmVFbGVtZW50LmFwcGVuZENoaWxkKGRldGFpbHNFbGVtZW50KTtcblx0XHRcdGlmIChzb3VyY2UpIHtcblx0XHRcdFx0Y29uc3Qgc291cmNlRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdFx0c291cmNlRWxlbWVudC5pbm5lclRleHQgPSBzb3VyY2U7XG5cdFx0XHRcdHNvdXJjZUVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc291cmNlJyk7XG5cdFx0XHRcdGRldGFpbHNFbGVtZW50LmFwcGVuZENoaWxkKHNvdXJjZUVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvZGUpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBjb2RlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnN0IGNvZGVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdFx0XHRcdGNvZGVFbGVtZW50LmlubmVyVGV4dCA9IGAoJHtjb2RlfSlgO1xuXHRcdFx0XHRcdGNvZGVFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NvZGUnKTtcblx0XHRcdFx0XHRkZXRhaWxzRWxlbWVudC5hcHBlbmRDaGlsZChjb2RlRWxlbWVudCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fY29kZUxpbmsgPSBkb20uJCgnYS5jb2RlLWxpbmsnKTtcblx0XHRcdFx0XHR0aGlzLl9jb2RlTGluay5zZXRBdHRyaWJ1dGUoJ2hyZWYnLCBgJHtjb2RlLnRhcmdldC50b1N0cmluZygpfWApO1xuXG5cdFx0XHRcdFx0dGhpcy5fY29kZUxpbmsub25jbGljayA9IChlKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oY29kZS50YXJnZXQpO1xuXHRcdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Y29uc3QgY29kZUVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuX2NvZGVMaW5rLCBkb20uJCgnc3BhbicpKTtcblx0XHRcdFx0XHRjb2RlRWxlbWVudC5pbm5lclRleHQgPSBjb2RlLnZhbHVlO1xuXHRcdFx0XHRcdGRldGFpbHNFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX2NvZGVMaW5rKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fcmVsYXRlZEJsb2NrKTtcblx0XHR0aGlzLl9lZGl0b3IuYXBwbHlGb250SW5mbyh0aGlzLl9yZWxhdGVkQmxvY2spO1xuXHRcdGlmIChpc05vbkVtcHR5QXJyYXkocmVsYXRlZEluZm9ybWF0aW9uKSkge1xuXHRcdFx0Y29uc3QgcmVsYXRlZEluZm9ybWF0aW9uTm9kZSA9IHRoaXMuX3JlbGF0ZWRCbG9jay5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0XHRyZWxhdGVkSW5mb3JtYXRpb25Ob2RlLnN0eWxlLnBhZGRpbmdUb3AgPSBgJHtNYXRoLmZsb29yKHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpICogMC42Nil9cHhgO1xuXHRcdFx0dGhpcy5fbGluZXMgKz0gMTtcblxuXHRcdFx0Zm9yIChjb25zdCByZWxhdGVkIG9mIHJlbGF0ZWRJbmZvcm1hdGlvbikge1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0XHRcdGNvbnN0IHJlbGF0ZWRSZXNvdXJjZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0XHRcdFx0cmVsYXRlZFJlc291cmNlLmNsYXNzTGlzdC5hZGQoJ2ZpbGVuYW1lJyk7XG5cdFx0XHRcdHJlbGF0ZWRSZXNvdXJjZS5pbm5lclRleHQgPSBgJHt0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbChyZWxhdGVkLnJlc291cmNlKX0oJHtyZWxhdGVkLnN0YXJ0TGluZU51bWJlcn0sICR7cmVsYXRlZC5zdGFydENvbHVtbn0pOiBgO1xuXHRcdFx0XHRyZWxhdGVkUmVzb3VyY2UudGl0bGUgPSB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVsYXRlZC5yZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX3JlbGF0ZWREaWFnbm9zdGljcy5zZXQocmVsYXRlZFJlc291cmNlLCByZWxhdGVkKTtcblxuXHRcdFx0XHRjb25zdCByZWxhdGVkTWVzc2FnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdFx0cmVsYXRlZE1lc3NhZ2UuaW5uZXJUZXh0ID0gcmVsYXRlZC5tZXNzYWdlO1xuXG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChyZWxhdGVkUmVzb3VyY2UpO1xuXHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQocmVsYXRlZE1lc3NhZ2UpO1xuXG5cdFx0XHRcdHRoaXMuX2xpbmVzICs9IDE7XG5cdFx0XHRcdHJlbGF0ZWRJbmZvcm1hdGlvbk5vZGUuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmb250SW5mbyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCBzY3JvbGxXaWR0aCA9IE1hdGguY2VpbChmb250SW5mby50eXBpY2FsRnVsbHdpZHRoQ2hhcmFjdGVyV2lkdGggKiB0aGlzLl9sb25nZXN0TGluZUxlbmd0aCAqIDAuNzUpO1xuXHRcdGNvbnN0IHNjcm9sbEhlaWdodCA9IGZvbnRJbmZvLmxpbmVIZWlnaHQgKiB0aGlzLl9saW5lcztcblx0XHR0aGlzLl9zY3JvbGxhYmxlLnNldFNjcm9sbERpbWVuc2lvbnMoeyBzY3JvbGxXaWR0aCwgc2Nyb2xsSGVpZ2h0IH0pO1xuXHR9XG5cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHR0aGlzLl9zY3JvbGxhYmxlLmdldERvbU5vZGUoKS5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHR0aGlzLl9zY3JvbGxhYmxlLnNldFNjcm9sbERpbWVuc2lvbnMoeyB3aWR0aCwgaGVpZ2h0IH0pO1xuXHR9XG5cblx0Z2V0SGVpZ2h0SW5MaW5lcygpOiBudW1iZXIge1xuXHRcdHJldHVybiBNYXRoLm1pbigxNywgdGhpcy5fbGluZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBcmlhTGFiZWwobWFya2VyOiBJTWFya2VyKTogc3RyaW5nIHtcblx0XHRsZXQgc2V2ZXJpdHlMYWJlbCA9ICcnO1xuXHRcdHN3aXRjaCAobWFya2VyLnNldmVyaXR5KSB7XG5cdFx0XHRjYXNlIE1hcmtlclNldmVyaXR5LkVycm9yOlxuXHRcdFx0XHRzZXZlcml0eUxhYmVsID0gbmxzLmxvY2FsaXplKCdFcnJvcicsIFwiRXJyb3JcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNYXJrZXJTZXZlcml0eS5XYXJuaW5nOlxuXHRcdFx0XHRzZXZlcml0eUxhYmVsID0gbmxzLmxvY2FsaXplKCdXYXJuaW5nJywgXCJXYXJuaW5nXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTWFya2VyU2V2ZXJpdHkuSW5mbzpcblx0XHRcdFx0c2V2ZXJpdHlMYWJlbCA9IG5scy5sb2NhbGl6ZSgnSW5mbycsIFwiSW5mb1wiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1hcmtlclNldmVyaXR5LkhpbnQ6XG5cdFx0XHRcdHNldmVyaXR5TGFiZWwgPSBubHMubG9jYWxpemUoJ0hpbnQnLCBcIkhpbnRcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGxldCBhcmlhTGFiZWwgPSBubHMubG9jYWxpemUoJ21hcmtlciBhcmlhJywgXCJ7MH06IHsxfSBhdCB7Mn0uIFwiLCBzZXZlcml0eUxhYmVsLCBtYXJrZXIubWVzc2FnZSwgbWFya2VyLnN0YXJ0TGluZU51bWJlciArICc6JyArIG1hcmtlci5zdGFydENvbHVtbik7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwgJiYgKG1hcmtlci5zdGFydExpbmVOdW1iZXIgPD0gbW9kZWwuZ2V0TGluZUNvdW50KCkpICYmIChtYXJrZXIuc3RhcnRMaW5lTnVtYmVyID49IDEpKSB7XG5cdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KG1hcmtlci5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0YXJpYUxhYmVsID0gYCR7bGluZUNvbnRlbnR9LCAke2FyaWFMYWJlbH1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYXJpYUxhYmVsO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJOYXZpZ2F0aW9uV2lkZ2V0IGV4dGVuZHMgUGVla1ZpZXdXaWRnZXQge1xuXG5cdHN0YXRpYyByZWFkb25seSBUaXRsZU1lbnUgPSBuZXcgTWVudUlkKCdnb3RvRXJyb3JUaXRsZU1lbnUnKTtcblxuXHRwcml2YXRlIF9wYXJlbnRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2ljb24hOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfbWVzc2FnZSE6IE1lc3NhZ2VXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbGxPbkRpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgX3NldmVyaXR5OiBNYXJrZXJTZXZlcml0eTtcblx0cHJpdmF0ZSBfYmFja2dyb3VuZENvbG9yPzogQ29sb3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VsZWN0UmVsYXRlZEluZm9ybWF0aW9uID0gbmV3IEVtaXR0ZXI8SVJlbGF0ZWRJbmZvcm1hdGlvbj4oKTtcblx0cHJpdmF0ZSBfaGVpZ2h0SW5QaXhlbCE6IG51bWJlcjtcblxuXHRyZWFkb25seSBvbkRpZFNlbGVjdFJlbGF0ZWRJbmZvcm1hdGlvbjogRXZlbnQ8SVJlbGF0ZWRJbmZvcm1hdGlvbj4gPSB0aGlzLl9vbkRpZFNlbGVjdFJlbGF0ZWRJbmZvcm1hdGlvbi5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvciwgeyBzaG93QXJyb3c6IHRydWUsIHNob3dGcmFtZTogdHJ1ZSwgaXNBY2Nlc3NpYmxlOiB0cnVlLCBmcmFtZVdpZHRoOiAxIH0sIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLl9zZXZlcml0eSA9IE1hcmtlclNldmVyaXR5Lldhcm5pbmc7XG5cdFx0dGhpcy5fYmFja2dyb3VuZENvbG9yID0gQ29sb3Iud2hpdGU7XG5cblx0XHR0aGlzLl9hcHBseVRoZW1lKF90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpKTtcblx0XHR0aGlzLl9jYWxsT25EaXNwb3NlLmFkZChfdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSh0aGlzLl9hcHBseVRoZW1lLmJpbmQodGhpcykpKTtcblxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVRoZW1lKHRoZW1lOiBJQ29sb3JUaGVtZSkge1xuXHRcdHRoaXMuX2JhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvck1hcmtlck5hdmlnYXRpb25CYWNrZ3JvdW5kKTtcblx0XHRsZXQgY29sb3JJZCA9IGVkaXRvck1hcmtlck5hdmlnYXRpb25FcnJvcjtcblx0XHRsZXQgaGVhZGVyQmFja2dyb3VuZCA9IGVkaXRvck1hcmtlck5hdmlnYXRpb25FcnJvckhlYWRlcjtcblxuXHRcdGlmICh0aGlzLl9zZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuV2FybmluZykge1xuXHRcdFx0Y29sb3JJZCA9IGVkaXRvck1hcmtlck5hdmlnYXRpb25XYXJuaW5nO1xuXHRcdFx0aGVhZGVyQmFja2dyb3VuZCA9IGVkaXRvck1hcmtlck5hdmlnYXRpb25XYXJuaW5nSGVhZGVyO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fc2V2ZXJpdHkgPT09IE1hcmtlclNldmVyaXR5LkluZm8pIHtcblx0XHRcdGNvbG9ySWQgPSBlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uSW5mbztcblx0XHRcdGhlYWRlckJhY2tncm91bmQgPSBlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uSW5mb0hlYWRlcjtcblx0XHR9XG5cblx0XHRjb25zdCBmcmFtZUNvbG9yID0gdGhlbWUuZ2V0Q29sb3IoY29sb3JJZCk7XG5cdFx0Y29uc3QgaGVhZGVyQmcgPSB0aGVtZS5nZXRDb2xvcihoZWFkZXJCYWNrZ3JvdW5kKTtcblxuXHRcdHRoaXMuc3R5bGUoe1xuXHRcdFx0YXJyb3dDb2xvcjogZnJhbWVDb2xvcixcblx0XHRcdGZyYW1lQ29sb3I6IGZyYW1lQ29sb3IsXG5cdFx0XHRoZWFkZXJCYWNrZ3JvdW5kQ29sb3I6IGhlYWRlckJnLFxuXHRcdFx0cHJpbWFyeUhlYWRpbmdDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXdUaXRsZUZvcmVncm91bmQpLFxuXHRcdFx0c2Vjb25kYXJ5SGVhZGluZ0NvbG9yOiB0aGVtZS5nZXRDb2xvcihwZWVrVmlld1RpdGxlSW5mb0ZvcmVncm91bmQpXG5cdFx0fSk7IC8vIHN0eWxlKCkgd2lsbCB0cmlnZ2VyIF9hcHBseVN0eWxlc1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseVN0eWxlcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGFyZW50Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLl9wYXJlbnRDb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gdGhpcy5fYmFja2dyb3VuZENvbG9yID8gdGhpcy5fYmFja2dyb3VuZENvbG9yLnRvU3RyaW5nKCkgOiAnJztcblx0XHR9XG5cdFx0c3VwZXIuX2FwcGx5U3R5bGVzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbGxPbkRpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkU2VsZWN0UmVsYXRlZEluZm9ybWF0aW9uLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXJlbnRDb250YWluZXIuZm9jdXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZmlsbEhlYWQoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLl9maWxsSGVhZChjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2FjdGlvbmJhcldpZGdldCEuYWN0aW9uUnVubmVyLm9uV2lsbFJ1bihlID0+IHRoaXMuZWRpdG9yLmZvY3VzKCkpKTtcblxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNYXJrZXJOYXZpZ2F0aW9uV2lkZ2V0LlRpdGxlTWVudSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyhtZW51KTtcblx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQhLnB1c2goYWN0aW9ucywgeyBsYWJlbDogZmFsc2UsIGljb246IHRydWUsIGluZGV4OiAwIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9maWxsVGl0bGVJY29uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9pY29uID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcnKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2ZpbGxCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXJlbnRDb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21hcmtlci13aWRnZXQnKTtcblx0XHR0aGlzLl9wYXJlbnRDb250YWluZXIudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX3BhcmVudENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAndG9vbHRpcCcpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2NvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9tZXNzYWdlID0gbmV3IE1lc3NhZ2VXaWRnZXQodGhpcy5fY29udGFpbmVyLCB0aGlzLmVkaXRvciwgcmVsYXRlZCA9PiB0aGlzLl9vbkRpZFNlbGVjdFJlbGF0ZWRJbmZvcm1hdGlvbi5maXJlKHJlbGF0ZWQpLCB0aGlzLl9vcGVuZXJTZXJ2aWNlLCB0aGlzLl9sYWJlbFNlcnZpY2UpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9tZXNzYWdlKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3coKTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdjYWxsIHNob3dBdE1hcmtlcicpO1xuXHR9XG5cblx0c2hvd0F0TWFya2VyKG1hcmtlcjogSU1hcmtlciwgbWFya2VySWR4OiBudW1iZXIsIG1hcmtlckNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyB1cGRhdGU6XG5cdFx0Ly8gKiB0aXRsZVxuXHRcdC8vICogbWVzc2FnZVxuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzdGFsZScpO1xuXHRcdHRoaXMuX21lc3NhZ2UudXBkYXRlKG1hcmtlcik7XG5cblx0XHQvLyB1cGRhdGUgZnJhbWUgY29sb3IgKG9ubHkgYXBwbGllZCBvbiAnc2hvdycpXG5cdFx0dGhpcy5fc2V2ZXJpdHkgPSBtYXJrZXIuc2V2ZXJpdHk7XG5cdFx0dGhpcy5fYXBwbHlUaGVtZSh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpKTtcblxuXHRcdC8vIHNob3dcblx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmxpZnQobWFya2VyKTtcblx0XHRjb25zdCBlZGl0b3JQb3NpdGlvbiA9IHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3JQb3NpdGlvbiAmJiByYW5nZS5jb250YWluc1Bvc2l0aW9uKGVkaXRvclBvc2l0aW9uKSA/IGVkaXRvclBvc2l0aW9uIDogcmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdHN1cGVyLnNob3cocG9zaXRpb24sIHRoaXMuY29tcHV0ZVJlcXVpcmVkSGVpZ2h0KCkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0Y29uc3QgZGV0YWlsID0gbWFya2VyQ291bnQgPiAxXG5cdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdwcm9ibGVtcycsIFwiezB9IG9mIHsxfSBwcm9ibGVtc1wiLCBtYXJrZXJJZHgsIG1hcmtlckNvdW50KVxuXHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnY2hhbmdlJywgXCJ7MH0gb2YgezF9IHByb2JsZW1cIiwgbWFya2VySWR4LCBtYXJrZXJDb3VudCk7XG5cdFx0XHR0aGlzLnNldFRpdGxlKGJhc2VuYW1lKG1vZGVsLnVyaSksIGRldGFpbCk7XG5cdFx0fVxuXHRcdHRoaXMuX2ljb24uY2xhc3NOYW1lID0gYGNvZGljb24gJHtTZXZlcml0eUljb24uY2xhc3NOYW1lKE1hcmtlclNldmVyaXR5LnRvU2V2ZXJpdHkodGhpcy5fc2V2ZXJpdHkpKX1gO1xuXG5cdFx0dGhpcy5lZGl0b3IucmV2ZWFsUG9zaXRpb25JbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHBvc2l0aW9uLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0fVxuXG5cdHVwZGF0ZU1hcmtlcihtYXJrZXI6IElNYXJrZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnc3RhbGUnKTtcblx0XHR0aGlzLl9tZXNzYWdlLnVwZGF0ZShtYXJrZXIpO1xuXHR9XG5cblx0c2hvd1N0YWxlKCkge1xuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzdGFsZScpO1xuXHRcdHRoaXMuX3JlbGF5b3V0KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2RvTGF5b3V0Qm9keShoZWlnaHRJblBpeGVsOiBudW1iZXIsIHdpZHRoSW5QaXhlbDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIuX2RvTGF5b3V0Qm9keShoZWlnaHRJblBpeGVsLCB3aWR0aEluUGl4ZWwpO1xuXHRcdHRoaXMuX2hlaWdodEluUGl4ZWwgPSBoZWlnaHRJblBpeGVsO1xuXHRcdHRoaXMuX21lc3NhZ2UubGF5b3V0KGhlaWdodEluUGl4ZWwsIHdpZHRoSW5QaXhlbCk7XG5cdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodEluUGl4ZWx9cHhgO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbldpZHRoKHdpZHRoSW5QaXhlbDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fbWVzc2FnZS5sYXlvdXQodGhpcy5faGVpZ2h0SW5QaXhlbCwgd2lkdGhJblBpeGVsKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVsYXlvdXQoKTogdm9pZCB7XG5cdFx0c3VwZXIuX3JlbGF5b3V0KHRoaXMuY29tcHV0ZVJlcXVpcmVkSGVpZ2h0KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlUmVxdWlyZWRIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIDMgKyB0aGlzLl9tZXNzYWdlLmdldEhlaWdodEluTGluZXMoKTtcblx0fVxufVxuXG4vLyB0aGVtaW5nXG5cbmNvbnN0IGVycm9yRGVmYXVsdCA9IG9uZU9mKGVkaXRvckVycm9yRm9yZWdyb3VuZCwgZWRpdG9yRXJyb3JCb3JkZXIpO1xuY29uc3Qgd2FybmluZ0RlZmF1bHQgPSBvbmVPZihlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCwgZWRpdG9yV2FybmluZ0JvcmRlcik7XG5jb25zdCBpbmZvRGVmYXVsdCA9IG9uZU9mKGVkaXRvckluZm9Gb3JlZ3JvdW5kLCBlZGl0b3JJbmZvQm9yZGVyKTtcblxuY29uc3QgZWRpdG9yTWFya2VyTmF2aWdhdGlvbkVycm9yID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yTWFya2VyTmF2aWdhdGlvbkVycm9yLmJhY2tncm91bmQnLCB7IGRhcms6IGVycm9yRGVmYXVsdCwgbGlnaHQ6IGVycm9yRGVmYXVsdCwgaGNEYXJrOiBjb250cmFzdEJvcmRlciwgaGNMaWdodDogY29udHJhc3RCb3JkZXIgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uRXJyb3InLCAnRWRpdG9yIG1hcmtlciBuYXZpZ2F0aW9uIHdpZGdldCBlcnJvciBjb2xvci4nKSk7XG5jb25zdCBlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uRXJyb3JIZWFkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uRXJyb3IuaGVhZGVyQmFja2dyb3VuZCcsIHsgZGFyazogdHJhbnNwYXJlbnQoZWRpdG9yTWFya2VyTmF2aWdhdGlvbkVycm9yLCAuMSksIGxpZ2h0OiB0cmFuc3BhcmVudChlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uRXJyb3IsIC4xKSwgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sIG5scy5sb2NhbGl6ZSgnZWRpdG9yTWFya2VyTmF2aWdhdGlvbkVycm9ySGVhZGVyQmFja2dyb3VuZCcsICdFZGl0b3IgbWFya2VyIG5hdmlnYXRpb24gd2lkZ2V0IGVycm9yIGhlYWRpbmcgYmFja2dyb3VuZC4nKSk7XG5cbmNvbnN0IGVkaXRvck1hcmtlck5hdmlnYXRpb25XYXJuaW5nID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yTWFya2VyTmF2aWdhdGlvbldhcm5pbmcuYmFja2dyb3VuZCcsIHsgZGFyazogd2FybmluZ0RlZmF1bHQsIGxpZ2h0OiB3YXJuaW5nRGVmYXVsdCwgaGNEYXJrOiBjb250cmFzdEJvcmRlciwgaGNMaWdodDogY29udHJhc3RCb3JkZXIgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uV2FybmluZycsICdFZGl0b3IgbWFya2VyIG5hdmlnYXRpb24gd2lkZ2V0IHdhcm5pbmcgY29sb3IuJykpO1xuY29uc3QgZWRpdG9yTWFya2VyTmF2aWdhdGlvbldhcm5pbmdIZWFkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uV2FybmluZy5oZWFkZXJCYWNrZ3JvdW5kJywgeyBkYXJrOiB0cmFuc3BhcmVudChlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uV2FybmluZywgLjEpLCBsaWdodDogdHJhbnNwYXJlbnQoZWRpdG9yTWFya2VyTmF2aWdhdGlvbldhcm5pbmcsIC4xKSwgaGNEYXJrOiAnIzBDMTQxRicsIGhjTGlnaHQ6IHRyYW5zcGFyZW50KGVkaXRvck1hcmtlck5hdmlnYXRpb25XYXJuaW5nLCAuMikgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uV2FybmluZ0JhY2tncm91bmQnLCAnRWRpdG9yIG1hcmtlciBuYXZpZ2F0aW9uIHdpZGdldCB3YXJuaW5nIGhlYWRpbmcgYmFja2dyb3VuZC4nKSk7XG5cbmNvbnN0IGVkaXRvck1hcmtlck5hdmlnYXRpb25JbmZvID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yTWFya2VyTmF2aWdhdGlvbkluZm8uYmFja2dyb3VuZCcsIHsgZGFyazogaW5mb0RlZmF1bHQsIGxpZ2h0OiBpbmZvRGVmYXVsdCwgaGNEYXJrOiBjb250cmFzdEJvcmRlciwgaGNMaWdodDogY29udHJhc3RCb3JkZXIgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uSW5mbycsICdFZGl0b3IgbWFya2VyIG5hdmlnYXRpb24gd2lkZ2V0IGluZm8gY29sb3IuJykpO1xuY29uc3QgZWRpdG9yTWFya2VyTmF2aWdhdGlvbkluZm9IZWFkZXIgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uSW5mby5oZWFkZXJCYWNrZ3JvdW5kJywgeyBkYXJrOiB0cmFuc3BhcmVudChlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uSW5mbywgLjEpLCBsaWdodDogdHJhbnNwYXJlbnQoZWRpdG9yTWFya2VyTmF2aWdhdGlvbkluZm8sIC4xKSwgaGNEYXJrOiBudWxsLCBoY0xpZ2h0OiBudWxsIH0sIG5scy5sb2NhbGl6ZSgnZWRpdG9yTWFya2VyTmF2aWdhdGlvbkluZm9IZWFkZXJCYWNrZ3JvdW5kJywgJ0VkaXRvciBtYXJrZXIgbmF2aWdhdGlvbiB3aWRnZXQgaW5mbyBoZWFkaW5nIGJhY2tncm91bmQuJykpO1xuXG5jb25zdCBlZGl0b3JNYXJrZXJOYXZpZ2F0aW9uQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvck1hcmtlck5hdmlnYXRpb24uYmFja2dyb3VuZCcsIGVkaXRvckJhY2tncm91bmQsIG5scy5sb2NhbGl6ZSgnZWRpdG9yTWFya2VyTmF2aWdhdGlvbkJhY2tncm91bmQnLCAnRWRp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
