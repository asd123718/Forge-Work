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
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import "./parameterHints.css";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../common/config/fontInfo.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { Context } from "./provideSignatureHelp.js";
import * as nls from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { listHighlightForeground, registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
const $ = dom.$;
const parameterHintsNextIcon = registerIcon("parameter-hints-next", Codicon.chevronDown, nls.localize("parameterHintsNextIcon", "Icon for show next parameter hint."));
const parameterHintsPreviousIcon = registerIcon("parameter-hints-previous", Codicon.chevronUp, nls.localize("parameterHintsPreviousIcon", "Icon for show previous parameter hint."));
let ParameterHintsWidget = class extends Disposable {
  constructor(editor, model, contextKeyService, markdownRendererService) {
    super();
    this.editor = editor;
    this.model = model;
    this.markdownRendererService = markdownRendererService;
    this.renderDisposeables = this._register(new DisposableStore());
    this.visible = false;
    this.announcedLabel = null;
    // Editor.IContentWidget.allowEditorOverflow
    this.allowEditorOverflow = true;
    this.keyVisible = Context.Visible.bindTo(contextKeyService);
    this.keyMultipleSignatures = Context.MultipleSignatures.bindTo(contextKeyService);
  }
  createParameterHintDOMNodes() {
    const element = $(".editor-widget.parameter-hints-widget");
    const wrapper = dom.append(element, $(".phwrapper"));
    wrapper.tabIndex = -1;
    const controls = dom.append(wrapper, $(".controls"));
    const previous = dom.append(controls, $(".button" + ThemeIcon.asCSSSelector(parameterHintsPreviousIcon)));
    const overloads = dom.append(controls, $(".overloads"));
    const next = dom.append(controls, $(".button" + ThemeIcon.asCSSSelector(parameterHintsNextIcon)));
    this._register(dom.addDisposableListener(previous, "click", (e) => {
      dom.EventHelper.stop(e);
      this.previous();
    }));
    this._register(dom.addDisposableListener(next, "click", (e) => {
      dom.EventHelper.stop(e);
      this.next();
    }));
    const body = $(".body");
    const scrollbar = new DomScrollableElement(body, {
      alwaysConsumeMouseWheel: true
    });
    this._register(scrollbar);
    wrapper.appendChild(scrollbar.getDomNode());
    const signature = dom.append(body, $(".signature"));
    const docs = dom.append(body, $(".docs"));
    element.style.userSelect = "text";
    this.domNodes = {
      element,
      signature,
      overloads,
      docs,
      scrollbar
    };
    this.editor.addContentWidget(this);
    this.hide();
    this._register(this.editor.onDidChangeCursorSelection((e) => {
      if (this.visible) {
        this.editor.layoutContentWidget(this);
      }
    }));
    const updateFont = () => {
      if (!this.domNodes) {
        return;
      }
      const fontInfo = this.editor.getOption(EditorOption.fontInfo);
      const element2 = this.domNodes.element;
      element2.style.fontSize = `${fontInfo.fontSize}px`;
      element2.style.lineHeight = `${fontInfo.lineHeight / fontInfo.fontSize}`;
      element2.style.setProperty("--vscode-parameterHintsWidget-editorFontFamily", fontInfo.fontFamily);
      element2.style.setProperty("--vscode-parameterHintsWidget-editorFontFamilyDefault", EDITOR_FONT_DEFAULTS.fontFamily);
    };
    updateFont();
    this._register(Event.chain(
      this.editor.onDidChangeConfiguration.bind(this.editor),
      ($2) => $2.filter((e) => e.hasChanged(EditorOption.fontInfo))
    )(updateFont));
    this._register(this.editor.onDidLayoutChange((e) => this.updateMaxHeight()));
    this.updateMaxHeight();
  }
  show() {
    if (this.visible) {
      return;
    }
    if (!this.domNodes) {
      this.createParameterHintDOMNodes();
    }
    this.keyVisible.set(true);
    this.visible = true;
    setTimeout(() => {
      this.domNodes?.element.classList.add("visible");
    }, 100);
    this.editor.layoutContentWidget(this);
  }
  hide() {
    this.renderDisposeables.clear();
    if (!this.visible) {
      return;
    }
    this.keyVisible.reset();
    this.visible = false;
    this.announcedLabel = null;
    this.domNodes?.element.classList.remove("visible");
    this.editor.layoutContentWidget(this);
  }
  getPosition() {
    if (this.visible) {
      return {
        position: this.editor.getPosition(),
        preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
      };
    }
    return null;
  }
  render(hints) {
    this.renderDisposeables.clear();
    if (!this.domNodes) {
      return;
    }
    const multiple = hints.signatures.length > 1;
    this.domNodes.element.classList.toggle("multiple", multiple);
    this.keyMultipleSignatures.set(multiple);
    this.domNodes.signature.innerText = "";
    this.domNodes.docs.innerText = "";
    const signature = hints.signatures[hints.activeSignature];
    if (!signature) {
      return;
    }
    const code = dom.append(this.domNodes.signature, $(".code"));
    const hasParameters = signature.parameters.length > 0;
    const activeParameterIndex = signature.activeParameter ?? hints.activeParameter;
    if (!hasParameters) {
      const label = dom.append(code, $("span"));
      label.textContent = signature.label;
    } else {
      this.renderParameters(code, signature, activeParameterIndex);
    }
    const activeParameter = signature.parameters[activeParameterIndex];
    if (activeParameter?.documentation) {
      const documentation = $("span.documentation");
      if (typeof activeParameter.documentation === "string") {
        documentation.textContent = activeParameter.documentation;
      } else {
        const renderedContents = this.renderMarkdownDocs(activeParameter.documentation);
        documentation.appendChild(renderedContents.element);
      }
      dom.append(this.domNodes.docs, $("p", {}, documentation));
    }
    if (signature.documentation === void 0) {
    } else if (typeof signature.documentation === "string") {
      dom.append(this.domNodes.docs, $("p", {}, signature.documentation));
    } else {
      const renderedContents = this.renderMarkdownDocs(signature.documentation);
      dom.append(this.domNodes.docs, renderedContents.element);
    }
    const hasDocs = this.hasDocs(signature, activeParameter);
    this.domNodes.signature.classList.toggle("has-docs", hasDocs);
    this.domNodes.docs.classList.toggle("empty", !hasDocs);
    this.domNodes.overloads.textContent = String(hints.activeSignature + 1).padStart(hints.signatures.length.toString().length, "0") + "/" + hints.signatures.length;
    if (activeParameter) {
      let labelToAnnounce = "";
      const param = signature.parameters[activeParameterIndex];
      if (Array.isArray(param.label)) {
        labelToAnnounce = signature.label.substring(param.label[0], param.label[1]);
      } else {
        labelToAnnounce = param.label;
      }
      if (param.documentation) {
        labelToAnnounce += typeof param.documentation === "string" ? `, ${param.documentation}` : `, ${param.documentation.value}`;
      }
      if (signature.documentation) {
        labelToAnnounce += typeof signature.documentation === "string" ? `, ${signature.documentation}` : `, ${signature.documentation.value}`;
      }
      if (this.announcedLabel !== labelToAnnounce) {
        aria.alert(nls.localize("hint", "{0}, hint", labelToAnnounce));
        this.announcedLabel = labelToAnnounce;
      }
    }
    this.editor.layoutContentWidget(this);
    this.domNodes.scrollbar.scanDomNode();
  }
  renderMarkdownDocs(markdown) {
    const renderedContents = this.renderDisposeables.add(this.markdownRendererService.render(markdown, {
      context: this.editor,
      asyncRenderCallback: () => {
        this.domNodes?.scrollbar.scanDomNode();
      }
    }));
    renderedContents.element.classList.add("markdown-docs");
    return renderedContents;
  }
  hasDocs(signature, activeParameter) {
    if (activeParameter && typeof activeParameter.documentation === "string" && assertReturnsDefined(activeParameter.documentation).length > 0) {
      return true;
    }
    if (activeParameter && typeof activeParameter.documentation === "object" && assertReturnsDefined(activeParameter.documentation).value.length > 0) {
      return true;
    }
    if (signature.documentation && typeof signature.documentation === "string" && assertReturnsDefined(signature.documentation).length > 0) {
      return true;
    }
    if (signature.documentation && typeof signature.documentation === "object" && assertReturnsDefined(signature.documentation.value).length > 0) {
      return true;
    }
    return false;
  }
  renderParameters(parent, signature, activeParameterIndex) {
    const [start, end] = this.getParameterLabelOffsets(signature, activeParameterIndex);
    const beforeSpan = document.createElement("span");
    beforeSpan.textContent = signature.label.substring(0, start);
    const paramSpan = document.createElement("span");
    paramSpan.textContent = signature.label.substring(start, end);
    paramSpan.className = "parameter active";
    const afterSpan = document.createElement("span");
    afterSpan.textContent = signature.label.substring(end);
    dom.append(parent, beforeSpan, paramSpan, afterSpan);
  }
  getParameterLabelOffsets(signature, paramIdx) {
    const param = signature.parameters[paramIdx];
    if (!param) {
      return [0, 0];
    } else if (Array.isArray(param.label)) {
      return param.label;
    } else if (!param.label.length) {
      return [0, 0];
    } else {
      const regex = new RegExp(`(\\W|^)${escapeRegExpCharacters(param.label)}(?=\\W|$)`, "g");
      regex.test(signature.label);
      const idx = regex.lastIndex - param.label.length;
      return idx >= 0 ? [idx, regex.lastIndex] : [0, 0];
    }
  }
  next() {
    this.editor.focus();
    this.model.next();
  }
  previous() {
    this.editor.focus();
    this.model.previous();
  }
  getDomNode() {
    if (!this.domNodes) {
      this.createParameterHintDOMNodes();
    }
    return this.domNodes.element;
  }
  getId() {
    return ParameterHintsWidget.ID;
  }
  updateMaxHeight() {
    if (!this.domNodes) {
      return;
    }
    const height = Math.max(this.editor.getLayoutInfo().height / 4, 250);
    const maxHeight = `${height}px`;
    this.domNodes.element.style.maxHeight = maxHeight;
    const wrapper = this.domNodes.element.getElementsByClassName("phwrapper");
    if (wrapper.length) {
      wrapper[0].style.maxHeight = maxHeight;
    }
  }
};
ParameterHintsWidget.ID = "editor.widget.parameterHintsWidget";
ParameterHintsWidget = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IMarkdownRendererService)
], ParameterHintsWidget);
registerColor("editorHoverWidget.highlightForeground", listHighlightForeground, nls.localize("editorHoverWidgetHighlightForeground", "Foreground color of the active item in the parameter hint."));
export {
  ParameterHintsWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHBhcmFtZXRlckhpbnRzXFxicm93c2VyXFxwYXJhbWV0ZXJIaW50c1dpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICcuL3BhcmFtZXRlckhpbnRzLmNzcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVESVRPUl9GT05UX0RFRkFVTFRTIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBQYXJhbWV0ZXJIaW50c01vZGVsIH0gZnJvbSAnLi9wYXJhbWV0ZXJIaW50c01vZGVsLmpzJztcbmltcG9ydCB7IENvbnRleHQgfSBmcm9tICcuL3Byb3ZpZGVTaWduYXR1cmVIZWxwLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgbGlzdEhpZ2hsaWdodEZvcmVncm91bmQsIHJlZ2lzdGVyQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuY29uc3QgcGFyYW1ldGVySGludHNOZXh0SWNvbiA9IHJlZ2lzdGVySWNvbigncGFyYW1ldGVyLWhpbnRzLW5leHQnLCBDb2RpY29uLmNoZXZyb25Eb3duLCBubHMubG9jYWxpemUoJ3BhcmFtZXRlckhpbnRzTmV4dEljb24nLCAnSWNvbiBmb3Igc2hvdyBuZXh0IHBhcmFtZXRlciBoaW50LicpKTtcbmNvbnN0IHBhcmFtZXRlckhpbnRzUHJldmlvdXNJY29uID0gcmVnaXN0ZXJJY29uKCdwYXJhbWV0ZXItaGludHMtcHJldmlvdXMnLCBDb2RpY29uLmNoZXZyb25VcCwgbmxzLmxvY2FsaXplKCdwYXJhbWV0ZXJIaW50c1ByZXZpb3VzSWNvbicsICdJY29uIGZvciBzaG93IHByZXZpb3VzIHBhcmFtZXRlciBoaW50LicpKTtcblxuZXhwb3J0IGNsYXNzIFBhcmFtZXRlckhpbnRzV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3Iud2lkZ2V0LnBhcmFtZXRlckhpbnRzV2lkZ2V0JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlckRpc3Bvc2VhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkga2V5VmlzaWJsZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkga2V5TXVsdGlwbGVTaWduYXR1cmVzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIGRvbU5vZGVzPzoge1xuXHRcdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRcdHJlYWRvbmx5IHNpZ25hdHVyZTogSFRNTEVsZW1lbnQ7XG5cdFx0cmVhZG9ubHkgZG9jczogSFRNTEVsZW1lbnQ7XG5cdFx0cmVhZG9ubHkgb3ZlcmxvYWRzOiBIVE1MRWxlbWVudDtcblx0XHRyZWFkb25seSBzY3JvbGxiYXI6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHR9O1xuXG5cdHByaXZhdGUgdmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGFubm91bmNlZExhYmVsOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHQvLyBFZGl0b3IuSUNvbnRlbnRXaWRnZXQuYWxsb3dFZGl0b3JPdmVyZmxvd1xuXHRhbGxvd0VkaXRvck92ZXJmbG93ID0gdHJ1ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogUGFyYW1ldGVySGludHNNb2RlbCxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmtleVZpc2libGUgPSBDb250ZXh0LlZpc2libGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmtleU11bHRpcGxlU2lnbmF0dXJlcyA9IENvbnRleHQuTXVsdGlwbGVTaWduYXR1cmVzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVBhcmFtZXRlckhpbnRET01Ob2RlcygpIHtcblx0XHRjb25zdCBlbGVtZW50ID0gJCgnLmVkaXRvci13aWRnZXQucGFyYW1ldGVyLWhpbnRzLXdpZGdldCcpO1xuXHRcdGNvbnN0IHdyYXBwZXIgPSBkb20uYXBwZW5kKGVsZW1lbnQsICQoJy5waHdyYXBwZXInKSk7XG5cdFx0d3JhcHBlci50YWJJbmRleCA9IC0xO1xuXG5cdFx0Y29uc3QgY29udHJvbHMgPSBkb20uYXBwZW5kKHdyYXBwZXIsICQoJy5jb250cm9scycpKTtcblx0XHRjb25zdCBwcmV2aW91cyA9IGRvbS5hcHBlbmQoY29udHJvbHMsICQoJy5idXR0b24nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IocGFyYW1ldGVySGludHNQcmV2aW91c0ljb24pKSk7XG5cdFx0Y29uc3Qgb3ZlcmxvYWRzID0gZG9tLmFwcGVuZChjb250cm9scywgJCgnLm92ZXJsb2FkcycpKTtcblx0XHRjb25zdCBuZXh0ID0gZG9tLmFwcGVuZChjb250cm9scywgJCgnLmJ1dHRvbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihwYXJhbWV0ZXJIaW50c05leHRJY29uKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihwcmV2aW91cywgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdHRoaXMucHJldmlvdXMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG5leHQsICdjbGljaycsIGUgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHR0aGlzLm5leHQoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBib2R5ID0gJCgnLmJvZHknKTtcblx0XHRjb25zdCBzY3JvbGxiYXIgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoYm9keSwge1xuXHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IHRydWUsXG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Nyb2xsYmFyKTtcblx0XHR3cmFwcGVyLmFwcGVuZENoaWxkKHNjcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXG5cdFx0Y29uc3Qgc2lnbmF0dXJlID0gZG9tLmFwcGVuZChib2R5LCAkKCcuc2lnbmF0dXJlJykpO1xuXHRcdGNvbnN0IGRvY3MgPSBkb20uYXBwZW5kKGJvZHksICQoJy5kb2NzJykpO1xuXG5cdFx0ZWxlbWVudC5zdHlsZS51c2VyU2VsZWN0ID0gJ3RleHQnO1xuXG5cdFx0dGhpcy5kb21Ob2RlcyA9IHtcblx0XHRcdGVsZW1lbnQsXG5cdFx0XHRzaWduYXR1cmUsXG5cdFx0XHRvdmVybG9hZHMsXG5cdFx0XHRkb2NzLFxuXHRcdFx0c2Nyb2xsYmFyLFxuXHRcdH07XG5cblx0XHR0aGlzLmVkaXRvci5hZGRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdHRoaXMuaGlkZSgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oZSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlRm9udCA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5kb21Ob2Rlcykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5kb21Ob2Rlcy5lbGVtZW50O1xuXHRcdFx0ZWxlbWVudC5zdHlsZS5mb250U2l6ZSA9IGAke2ZvbnRJbmZvLmZvbnRTaXplfXB4YDtcblx0XHRcdGVsZW1lbnQuc3R5bGUubGluZUhlaWdodCA9IGAke2ZvbnRJbmZvLmxpbmVIZWlnaHQgLyBmb250SW5mby5mb250U2l6ZX1gO1xuXHRcdFx0ZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtcGFyYW1ldGVySGludHNXaWRnZXQtZWRpdG9yRm9udEZhbWlseScsIGZvbnRJbmZvLmZvbnRGYW1pbHkpO1xuXHRcdFx0ZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtcGFyYW1ldGVySGludHNXaWRnZXQtZWRpdG9yRm9udEZhbWlseURlZmF1bHQnLCBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250RmFtaWx5KTtcblx0XHR9O1xuXG5cdFx0dXBkYXRlRm9udCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4oXG5cdFx0XHR0aGlzLmVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uYmluZCh0aGlzLmVkaXRvciksXG5cdFx0XHQkID0+ICQuZmlsdGVyKGUgPT4gZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250SW5mbykpXG5cdFx0KSh1cGRhdGVGb250KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZExheW91dENoYW5nZShlID0+IHRoaXMudXBkYXRlTWF4SGVpZ2h0KCkpKTtcblx0XHR0aGlzLnVwZGF0ZU1heEhlaWdodCgpO1xuXHR9XG5cblx0cHVibGljIHNob3coKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5kb21Ob2Rlcykge1xuXHRcdFx0dGhpcy5jcmVhdGVQYXJhbWV0ZXJIaW50RE9NTm9kZXMoKTtcblx0XHR9XG5cblx0XHR0aGlzLmtleVZpc2libGUuc2V0KHRydWUpO1xuXHRcdHRoaXMudmlzaWJsZSA9IHRydWU7XG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLmRvbU5vZGVzPy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHR9LCAxMDApO1xuXHRcdHRoaXMuZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgaGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2VhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKCF0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmtleVZpc2libGUucmVzZXQoKTtcblx0XHR0aGlzLnZpc2libGUgPSBmYWxzZTtcblx0XHR0aGlzLmFubm91bmNlZExhYmVsID0gbnVsbDtcblx0XHR0aGlzLmRvbU5vZGVzPy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBvc2l0aW9uOiB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpLFxuXHRcdFx0XHRwcmVmZXJlbmNlOiBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRSwgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPV11cblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIHJlbmRlcihoaW50czogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHApOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2VhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKCF0aGlzLmRvbU5vZGVzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbXVsdGlwbGUgPSBoaW50cy5zaWduYXR1cmVzLmxlbmd0aCA+IDE7XG5cdFx0dGhpcy5kb21Ob2Rlcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ211bHRpcGxlJywgbXVsdGlwbGUpO1xuXHRcdHRoaXMua2V5TXVsdGlwbGVTaWduYXR1cmVzLnNldChtdWx0aXBsZSk7XG5cblx0XHR0aGlzLmRvbU5vZGVzLnNpZ25hdHVyZS5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLmRvbU5vZGVzLmRvY3MuaW5uZXJUZXh0ID0gJyc7XG5cblx0XHRjb25zdCBzaWduYXR1cmUgPSBoaW50cy5zaWduYXR1cmVzW2hpbnRzLmFjdGl2ZVNpZ25hdHVyZV07XG5cdFx0aWYgKCFzaWduYXR1cmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGVzLnNpZ25hdHVyZSwgJCgnLmNvZGUnKSk7XG5cdFx0Y29uc3QgaGFzUGFyYW1ldGVycyA9IHNpZ25hdHVyZS5wYXJhbWV0ZXJzLmxlbmd0aCA+IDA7XG5cdFx0Y29uc3QgYWN0aXZlUGFyYW1ldGVySW5kZXggPSBzaWduYXR1cmUuYWN0aXZlUGFyYW1ldGVyID8/IGhpbnRzLmFjdGl2ZVBhcmFtZXRlcjtcblxuXHRcdGlmICghaGFzUGFyYW1ldGVycykge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKGNvZGUsICQoJ3NwYW4nKSk7XG5cdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IHNpZ25hdHVyZS5sYWJlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJQYXJhbWV0ZXJzKGNvZGUsIHNpZ25hdHVyZSwgYWN0aXZlUGFyYW1ldGVySW5kZXgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZVBhcmFtZXRlcjogbGFuZ3VhZ2VzLlBhcmFtZXRlckluZm9ybWF0aW9uIHwgdW5kZWZpbmVkID0gc2lnbmF0dXJlLnBhcmFtZXRlcnNbYWN0aXZlUGFyYW1ldGVySW5kZXhdO1xuXHRcdGlmIChhY3RpdmVQYXJhbWV0ZXI/LmRvY3VtZW50YXRpb24pIHtcblx0XHRcdGNvbnN0IGRvY3VtZW50YXRpb24gPSAkKCdzcGFuLmRvY3VtZW50YXRpb24nKTtcblx0XHRcdGlmICh0eXBlb2YgYWN0aXZlUGFyYW1ldGVyLmRvY3VtZW50YXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGRvY3VtZW50YXRpb24udGV4dENvbnRlbnQgPSBhY3RpdmVQYXJhbWV0ZXIuZG9jdW1lbnRhdGlvbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkQ29udGVudHMgPSB0aGlzLnJlbmRlck1hcmtkb3duRG9jcyhhY3RpdmVQYXJhbWV0ZXIuZG9jdW1lbnRhdGlvbik7XG5cdFx0XHRcdGRvY3VtZW50YXRpb24uYXBwZW5kQ2hpbGQocmVuZGVyZWRDb250ZW50cy5lbGVtZW50KTtcblx0XHRcdH1cblx0XHRcdGRvbS5hcHBlbmQodGhpcy5kb21Ob2Rlcy5kb2NzLCAkKCdwJywge30sIGRvY3VtZW50YXRpb24pKTtcblx0XHR9XG5cblx0XHRpZiAoc2lnbmF0dXJlLmRvY3VtZW50YXRpb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0LyoqIG5vIG9wICovXG5cdFx0fSBlbHNlIGlmICh0eXBlb2Ygc2lnbmF0dXJlLmRvY3VtZW50YXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRkb20uYXBwZW5kKHRoaXMuZG9tTm9kZXMuZG9jcywgJCgncCcsIHt9LCBzaWduYXR1cmUuZG9jdW1lbnRhdGlvbikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZW5kZXJlZENvbnRlbnRzID0gdGhpcy5yZW5kZXJNYXJrZG93bkRvY3Moc2lnbmF0dXJlLmRvY3VtZW50YXRpb24pO1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGVzLmRvY3MsIHJlbmRlcmVkQ29udGVudHMuZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzRG9jcyA9IHRoaXMuaGFzRG9jcyhzaWduYXR1cmUsIGFjdGl2ZVBhcmFtZXRlcik7XG5cblx0XHR0aGlzLmRvbU5vZGVzLnNpZ25hdHVyZS5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtZG9jcycsIGhhc0RvY3MpO1xuXHRcdHRoaXMuZG9tTm9kZXMuZG9jcy5jbGFzc0xpc3QudG9nZ2xlKCdlbXB0eScsICFoYXNEb2NzKTtcblxuXHRcdHRoaXMuZG9tTm9kZXMub3ZlcmxvYWRzLnRleHRDb250ZW50ID1cblx0XHRcdFN0cmluZyhoaW50cy5hY3RpdmVTaWduYXR1cmUgKyAxKS5wYWRTdGFydChoaW50cy5zaWduYXR1cmVzLmxlbmd0aC50b1N0cmluZygpLmxlbmd0aCwgJzAnKSArICcvJyArIGhpbnRzLnNpZ25hdHVyZXMubGVuZ3RoO1xuXG5cdFx0aWYgKGFjdGl2ZVBhcmFtZXRlcikge1xuXHRcdFx0bGV0IGxhYmVsVG9Bbm5vdW5jZSA9ICcnO1xuXHRcdFx0Y29uc3QgcGFyYW0gPSBzaWduYXR1cmUucGFyYW1ldGVyc1thY3RpdmVQYXJhbWV0ZXJJbmRleF07XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJhbS5sYWJlbCkpIHtcblx0XHRcdFx0bGFiZWxUb0Fubm91bmNlID0gc2lnbmF0dXJlLmxhYmVsLnN1YnN0cmluZyhwYXJhbS5sYWJlbFswXSwgcGFyYW0ubGFiZWxbMV0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFiZWxUb0Fubm91bmNlID0gcGFyYW0ubGFiZWw7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGFyYW0uZG9jdW1lbnRhdGlvbikge1xuXHRcdFx0XHRsYWJlbFRvQW5ub3VuY2UgKz0gdHlwZW9mIHBhcmFtLmRvY3VtZW50YXRpb24gPT09ICdzdHJpbmcnID8gYCwgJHtwYXJhbS5kb2N1bWVudGF0aW9ufWAgOiBgLCAke3BhcmFtLmRvY3VtZW50YXRpb24udmFsdWV9YDtcblx0XHRcdH1cblx0XHRcdGlmIChzaWduYXR1cmUuZG9jdW1lbnRhdGlvbikge1xuXHRcdFx0XHRsYWJlbFRvQW5ub3VuY2UgKz0gdHlwZW9mIHNpZ25hdHVyZS5kb2N1bWVudGF0aW9uID09PSAnc3RyaW5nJyA/IGAsICR7c2lnbmF0dXJlLmRvY3VtZW50YXRpb259YCA6IGAsICR7c2lnbmF0dXJlLmRvY3VtZW50YXRpb24udmFsdWV9YDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2VsZWN0IG1ldGhvZCBnZXRzIGNhbGxlZCBvbiBldmVyeSB1c2VyIHR5cGUgd2hpbGUgcGFyYW1ldGVyIGhpbnRzIGFyZSB2aXNpYmxlLlxuXHRcdFx0Ly8gV2UgZG8gbm90IHdhbnQgdG8gc3BhbSB0aGUgdXNlciB3aXRoIHNhbWUgYW5ub3VuY2VtZW50cywgc28gd2Ugb25seSBhbm5vdW5jZSBpZiB0aGUgY3VycmVudCBwYXJhbWV0ZXIgY2hhbmdlZC5cblxuXHRcdFx0aWYgKHRoaXMuYW5ub3VuY2VkTGFiZWwgIT09IGxhYmVsVG9Bbm5vdW5jZSkge1xuXHRcdFx0XHRhcmlhLmFsZXJ0KG5scy5sb2NhbGl6ZSgnaGludCcsIFwiezB9LCBoaW50XCIsIGxhYmVsVG9Bbm5vdW5jZSkpO1xuXHRcdFx0XHR0aGlzLmFubm91bmNlZExhYmVsID0gbGFiZWxUb0Fubm91bmNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0dGhpcy5kb21Ob2Rlcy5zY3JvbGxiYXIuc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWFya2Rvd25Eb2NzKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcpOiBJUmVuZGVyZWRNYXJrZG93biB7XG5cdFx0Y29uc3QgcmVuZGVyZWRDb250ZW50cyA9IHRoaXMucmVuZGVyRGlzcG9zZWFibGVzLmFkZCh0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtYXJrZG93biwge1xuXHRcdFx0Y29udGV4dDogdGhpcy5lZGl0b3IsXG5cdFx0XHRhc3luY1JlbmRlckNhbGxiYWNrOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZG9tTm9kZXM/LnNjcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZW5kZXJlZENvbnRlbnRzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbWFya2Rvd24tZG9jcycpO1xuXHRcdHJldHVybiByZW5kZXJlZENvbnRlbnRzO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNEb2NzKHNpZ25hdHVyZTogbGFuZ3VhZ2VzLlNpZ25hdHVyZUluZm9ybWF0aW9uLCBhY3RpdmVQYXJhbWV0ZXI6IGxhbmd1YWdlcy5QYXJhbWV0ZXJJbmZvcm1hdGlvbiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChhY3RpdmVQYXJhbWV0ZXIgJiYgdHlwZW9mIGFjdGl2ZVBhcmFtZXRlci5kb2N1bWVudGF0aW9uID09PSAnc3RyaW5nJyAmJiBhc3NlcnRSZXR1cm5zRGVmaW5lZChhY3RpdmVQYXJhbWV0ZXIuZG9jdW1lbnRhdGlvbikubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChhY3RpdmVQYXJhbWV0ZXIgJiYgdHlwZW9mIGFjdGl2ZVBhcmFtZXRlci5kb2N1bWVudGF0aW9uID09PSAnb2JqZWN0JyAmJiBhc3NlcnRSZXR1cm5zRGVmaW5lZChhY3RpdmVQYXJhbWV0ZXIuZG9jdW1lbnRhdGlvbikudmFsdWUubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzaWduYXR1cmUuZG9jdW1lbnRhdGlvbiAmJiB0eXBlb2Ygc2lnbmF0dXJlLmRvY3VtZW50YXRpb24gPT09ICdzdHJpbmcnICYmIGFzc2VydFJldHVybnNEZWZpbmVkKHNpZ25hdHVyZS5kb2N1bWVudGF0aW9uKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHNpZ25hdHVyZS5kb2N1bWVudGF0aW9uICYmIHR5cGVvZiBzaWduYXR1cmUuZG9jdW1lbnRhdGlvbiA9PT0gJ29iamVjdCcgJiYgYXNzZXJ0UmV0dXJuc0RlZmluZWQoc2lnbmF0dXJlLmRvY3VtZW50YXRpb24udmFsdWUpLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclBhcmFtZXRlcnMocGFyZW50OiBIVE1MRWxlbWVudCwgc2lnbmF0dXJlOiBsYW5ndWFnZXMuU2lnbmF0dXJlSW5mb3JtYXRpb24sIGFjdGl2ZVBhcmFtZXRlckluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBbc3RhcnQsIGVuZF0gPSB0aGlzLmdldFBhcmFtZXRlckxhYmVsT2Zmc2V0cyhzaWduYXR1cmUsIGFjdGl2ZVBhcmFtZXRlckluZGV4KTtcblxuXHRcdGNvbnN0IGJlZm9yZVNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0YmVmb3JlU3Bhbi50ZXh0Q29udGVudCA9IHNpZ25hdHVyZS5sYWJlbC5zdWJzdHJpbmcoMCwgc3RhcnQpO1xuXG5cdFx0Y29uc3QgcGFyYW1TcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdHBhcmFtU3Bhbi50ZXh0Q29udGVudCA9IHNpZ25hdHVyZS5sYWJlbC5zdWJzdHJpbmcoc3RhcnQsIGVuZCk7XG5cdFx0cGFyYW1TcGFuLmNsYXNzTmFtZSA9ICdwYXJhbWV0ZXIgYWN0aXZlJztcblxuXHRcdGNvbnN0IGFmdGVyU3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRhZnRlclNwYW4udGV4dENvbnRlbnQgPSBzaWduYXR1cmUubGFiZWwuc3Vic3RyaW5nKGVuZCk7XG5cblx0XHRkb20uYXBwZW5kKHBhcmVudCwgYmVmb3JlU3BhbiwgcGFyYW1TcGFuLCBhZnRlclNwYW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQYXJhbWV0ZXJMYWJlbE9mZnNldHMoc2lnbmF0dXJlOiBsYW5ndWFnZXMuU2lnbmF0dXJlSW5mb3JtYXRpb24sIHBhcmFtSWR4OiBudW1iZXIpOiBbbnVtYmVyLCBudW1iZXJdIHtcblx0XHRjb25zdCBwYXJhbSA9IHNpZ25hdHVyZS5wYXJhbWV0ZXJzW3BhcmFtSWR4XTtcblx0XHRpZiAoIXBhcmFtKSB7XG5cdFx0XHRyZXR1cm4gWzAsIDBdO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwYXJhbS5sYWJlbCkpIHtcblx0XHRcdHJldHVybiBwYXJhbS5sYWJlbDtcblx0XHR9IGVsc2UgaWYgKCFwYXJhbS5sYWJlbC5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbMCwgMF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChgKFxcXFxXfF4pJHtlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHBhcmFtLmxhYmVsKX0oPz1cXFxcV3wkKWAsICdnJyk7XG5cdFx0XHRyZWdleC50ZXN0KHNpZ25hdHVyZS5sYWJlbCk7XG5cdFx0XHRjb25zdCBpZHggPSByZWdleC5sYXN0SW5kZXggLSBwYXJhbS5sYWJlbC5sZW5ndGg7XG5cdFx0XHRyZXR1cm4gaWR4ID49IDBcblx0XHRcdFx0PyBbaWR4LCByZWdleC5sYXN0SW5kZXhdXG5cdFx0XHRcdDogWzAsIDBdO1xuXHRcdH1cblx0fVxuXG5cdG5leHQoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHR0aGlzLm1vZGVsLm5leHQoKTtcblx0fVxuXG5cdHByZXZpb3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0dGhpcy5tb2RlbC5wcmV2aW91cygpO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0aWYgKCF0aGlzLmRvbU5vZGVzKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZVBhcmFtZXRlckhpbnRET01Ob2RlcygpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlcyEuZWxlbWVudDtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFBhcmFtZXRlckhpbnRzV2lkZ2V0LklEO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNYXhIZWlnaHQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmRvbU5vZGVzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGhlaWdodCA9IE1hdGgubWF4KHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHQgLyA0LCAyNTApO1xuXHRcdGNvbnN0IG1heEhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0dGhpcy5kb21Ob2Rlcy5lbGVtZW50LnN0eWxlLm1heEhlaWdodCA9IG1heEhlaWdodDtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy5kb21Ob2Rlcy5lbGVtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ3Bod3JhcHBlcicpIGFzIEhUTUxDb2xsZWN0aW9uT2Y8SFRNTEVsZW1lbnQ+O1xuXHRcdGlmICh3cmFwcGVyLmxlbmd0aCkge1xuXHRcdFx0d3JhcHBlclswXS5zdHlsZS5tYXhIZWlnaHQgPSBtYXhIZWlnaHQ7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyQ29sb3IoJ2VkaXRvckhvdmVyV2lkZ2V0LmhpZ2hsaWdodEZvcmVncm91bmQnLCBsaXN0SGlnaGxpZ2h0Rm9yZWdyb3VuZCwgbmxzLmxvY2FsaXplKCdlZGl0b3JIb3ZlcldpZGdldEhpZ2hsaWdodEZvcmVncm91bmQnLCAnRm9yZWdyb3VuZCBjb2xvciBvZiB0aGUgYWN0aXZlIGl0ZW0gaW4gdGhlIHBhcmFtZXRl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
