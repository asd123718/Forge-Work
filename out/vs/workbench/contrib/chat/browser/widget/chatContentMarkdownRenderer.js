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
import { $, reset } from "../../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import product from "../../../../../platform/product/common/product.js";
import { Schemas } from "../../../../../base/common/network.js";
import { AGENT_HOST_SCHEME } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { AGENT_HOST_SESSION_LINK_SCHEME } from "../../../../../platform/agentHost/common/openSessionLink.js";
const _remoteImageDisallowed = () => false;
const nonPlainTextMarkdownSyntax = /[\\`*_[\]<>|&$]/;
const gfmAutolink = /\b(?:https?:\/\/|www\.)/i;
const gfmStrikethrough = /~~/;
const blockMarkdownSyntax = /(^|\n)\s{0,3}(?:#{1,6}\s|>\s?|[-+]\s|\d+[.)]\s|---+\s*$)/;
const literalSingleTildeExtension = {
  extensions: [{
    name: "literalSingleTilde",
    level: "inline",
    tokenizer: (source) => {
      if (source[0] === "~" && source[1] !== "~") {
        return { type: "text", raw: "~", text: "~" };
      }
      return void 0;
    }
  }]
};
function renderPlainTextMarkdown(markdown, outElement) {
  const value = markdown.value;
  if (!value || value.includes("\n") || nonPlainTextMarkdownSyntax.test(value) || gfmAutolink.test(value) || gfmStrikethrough.test(value) || blockMarkdownSyntax.test(value)) {
    return void 0;
  }
  const element = outElement ?? $("div");
  element.classList.add("rendered-markdown");
  reset(element, $("p", void 0, value.length > 1e5 ? `${value.substr(0, 1e5)}\u2026` : value));
  return {
    element,
    dispose: () => {
    }
  };
}
const allowedChatMarkdownHtmlTags = Object.freeze([
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "ins",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
  "a",
  "img",
  // TODO@roblourens when we sanitize attributes in markdown source, we can ban these elements at that step. microsoft/vscode-copilot#5091
  // Not in the official list, but used for codicons and other vscode markdown extensions
  "span",
  "div",
  "input"
  // Allowed for rendering checkboxes. Other types of inputs are removed and the inputs are always disabled
]);
function getChatMarkdownRenderOptions(options) {
  return {
    ...options,
    markedExtensions: options?.markedExtensions?.includes(literalSingleTildeExtension) ? options.markedExtensions : [...options?.markedExtensions ?? [], literalSingleTildeExtension],
    sanitizerConfig: {
      replaceWithPlaintext: true,
      allowedTags: {
        override: allowedChatMarkdownHtmlTags
      },
      ...options?.sanitizerConfig,
      allowedLinkSchemes: { augment: [product.urlProtocol, "copilot-skill", Schemas.vscodeBrowser, AGENT_HOST_SCHEME, AGENT_HOST_SESSION_LINK_SCHEME] },
      remoteImageIsAllowed: _remoteImageDisallowed
    }
  };
}
let ChatContentMarkdownRenderer = class {
  constructor(languageService, openerService, configurationService, hoverService, markdownRendererService) {
    this.hoverService = hoverService;
    this.markdownRendererService = markdownRendererService;
  }
  render(markdown, options, outElement) {
    const plainTextResult = renderPlainTextMarkdown(markdown, outElement);
    if (plainTextResult) {
      return plainTextResult;
    }
    options = getChatMarkdownRenderOptions(options);
    const mdWithBody = markdown && markdown.supportHtml ? {
      ...markdown,
      // dompurify uses DOMParser, which strips leading comments. Wrapping it all in 'body' prevents this.
      // The \n\n prevents marked.js from parsing the body contents as just text in an 'html' token, instead of actual markdown.
      value: `<body>

${markdown.value}

</body>`
    } : markdown;
    const result = this.markdownRendererService.render(mdWithBody, options, outElement);
    result.element.normalize();
    for (const child of result.element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        child.replaceWith($("p", void 0, child.textContent));
      }
    }
    return this.attachCustomHover(result);
  }
  attachCustomHover(result) {
    const store = new DisposableStore();
    result.element.querySelectorAll("a").forEach((element) => {
      if (element.title) {
        const title = element.title;
        element.title = "";
        store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), element, title));
      }
    });
    return {
      element: result.element,
      dispose: () => {
        result.dispose();
        store.dispose();
      }
    };
  }
};
ChatContentMarkdownRenderer = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IMarkdownRendererService)
], ChatContentMarkdownRenderer);
export {
  ChatContentMarkdownRenderer,
  allowedChatMarkdownHtmlTags,
  getChatMarkdownRenderOptions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElSZW5kZXJlZE1hcmtkb3duLCBNYXJrZG93blJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgdHlwZSBNYXJrZWRFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyLCBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfU0NIRU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9TRVNTSU9OX0xJTktfU0NIRU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9vcGVuU2Vzc2lvbkxpbmsuanMnO1xuXG5jb25zdCBfcmVtb3RlSW1hZ2VEaXNhbGxvd2VkID0gKCkgPT4gZmFsc2U7XG5cbmNvbnN0IG5vblBsYWluVGV4dE1hcmtkb3duU3ludGF4ID0gL1tcXFxcYCpfW1xcXTw+fCYkXS87XG5jb25zdCBnZm1BdXRvbGluayA9IC9cXGIoPzpodHRwcz86XFwvXFwvfHd3d1xcLikvaTtcbmNvbnN0IGdmbVN0cmlrZXRocm91Z2ggPSAvfn4vO1xuY29uc3QgYmxvY2tNYXJrZG93blN5bnRheCA9IC8oXnxcXG4pXFxzezAsM30oPzojezEsNn1cXHN8Plxccz98Wy0rXVxcc3xcXGQrWy4pXVxcc3wtLS0rXFxzKiQpLztcblxuY29uc3QgbGl0ZXJhbFNpbmdsZVRpbGRlRXh0ZW5zaW9uOiBNYXJrZWRFeHRlbnNpb24gPSB7XG5cdGV4dGVuc2lvbnM6IFt7XG5cdFx0bmFtZTogJ2xpdGVyYWxTaW5nbGVUaWxkZScsXG5cdFx0bGV2ZWw6ICdpbmxpbmUnLFxuXHRcdHRva2VuaXplcjogc291cmNlID0+IHtcblx0XHRcdGlmIChzb3VyY2VbMF0gPT09ICd+JyAmJiBzb3VyY2VbMV0gIT09ICd+Jykge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAndGV4dCcsIHJhdzogJ34nLCB0ZXh0OiAnficgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSxcblx0fV1cbn07XG5cbmZ1bmN0aW9uIHJlbmRlclBsYWluVGV4dE1hcmtkb3duKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIG91dEVsZW1lbnQ/OiBIVE1MRWxlbWVudCk6IElSZW5kZXJlZE1hcmtkb3duIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFsdWUgPSBtYXJrZG93bi52YWx1ZTtcblx0aWYgKCF2YWx1ZSB8fCB2YWx1ZS5pbmNsdWRlcygnXFxuJykgfHwgbm9uUGxhaW5UZXh0TWFya2Rvd25TeW50YXgudGVzdCh2YWx1ZSkgfHwgZ2ZtQXV0b2xpbmsudGVzdCh2YWx1ZSkgfHwgZ2ZtU3RyaWtldGhyb3VnaC50ZXN0KHZhbHVlKSB8fCBibG9ja01hcmtkb3duU3ludGF4LnRlc3QodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGVsZW1lbnQgPSBvdXRFbGVtZW50ID8/ICQoJ2RpdicpO1xuXHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3JlbmRlcmVkLW1hcmtkb3duJyk7XG5cdHJlc2V0KGVsZW1lbnQsICQoJ3AnLCB1bmRlZmluZWQsIHZhbHVlLmxlbmd0aCA+IDEwMF8wMDAgPyBgJHt2YWx1ZS5zdWJzdHIoMCwgMTAwXzAwMCl9XHUyMDI2YCA6IHZhbHVlKSk7XG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudCxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0fTtcbn1cblxuZXhwb3J0IGNvbnN0IGFsbG93ZWRDaGF0TWFya2Rvd25IdG1sVGFncyA9IE9iamVjdC5mcmVlemUoW1xuXHQnYicsXG5cdCdibG9ja3F1b3RlJyxcblx0J2JyJyxcblx0J2NvZGUnLFxuXHQnZGVsJyxcblx0J2VtJyxcblx0J2gxJyxcblx0J2gyJyxcblx0J2gzJyxcblx0J2g0Jyxcblx0J2g1Jyxcblx0J2g2Jyxcblx0J2hyJyxcblx0J2knLFxuXHQnaW5zJyxcblx0J2xpJyxcblx0J29sJyxcblx0J3AnLFxuXHQncHJlJyxcblx0J3MnLFxuXHQnc3Ryb25nJyxcblx0J3N1YicsXG5cdCdzdXAnLFxuXHQndGFibGUnLFxuXHQndGJvZHknLFxuXHQndGQnLFxuXHQndGgnLFxuXHQndGhlYWQnLFxuXHQndHInLFxuXHQndWwnLFxuXHQnYScsXG5cdCdpbWcnLFxuXG5cdC8vIFRPRE9Acm9ibG91cmVucyB3aGVuIHdlIHNhbml0aXplIGF0dHJpYnV0ZXMgaW4gbWFya2Rvd24gc291cmNlLCB3ZSBjYW4gYmFuIHRoZXNlIGVsZW1lbnRzIGF0IHRoYXQgc3RlcC4gbWljcm9zb2Z0L3ZzY29kZS1jb3BpbG90IzUwOTFcblx0Ly8gTm90IGluIHRoZSBvZmZpY2lhbCBsaXN0LCBidXQgdXNlZCBmb3IgY29kaWNvbnMgYW5kIG90aGVyIHZzY29kZSBtYXJrZG93biBleHRlbnNpb25zXG5cdCdzcGFuJyxcblx0J2RpdicsXG5cblx0J2lucHV0JywgLy8gQWxsb3dlZCBmb3IgcmVuZGVyaW5nIGNoZWNrYm94ZXMuIE90aGVyIHR5cGVzIG9mIGlucHV0cyBhcmUgcmVtb3ZlZCBhbmQgdGhlIGlucHV0cyBhcmUgYWx3YXlzIGRpc2FibGVkXG5dKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRNYXJrZG93blJlbmRlck9wdGlvbnMob3B0aW9ucz86IE1hcmtkb3duUmVuZGVyT3B0aW9ucyk6IE1hcmtkb3duUmVuZGVyT3B0aW9ucyB7XG5cdHJldHVybiB7XG5cdFx0Li4ub3B0aW9ucyxcblx0XHRtYXJrZWRFeHRlbnNpb25zOiBvcHRpb25zPy5tYXJrZWRFeHRlbnNpb25zPy5pbmNsdWRlcyhsaXRlcmFsU2luZ2xlVGlsZGVFeHRlbnNpb24pXG5cdFx0XHQ/IG9wdGlvbnMubWFya2VkRXh0ZW5zaW9uc1xuXHRcdFx0OiBbLi4uKG9wdGlvbnM/Lm1hcmtlZEV4dGVuc2lvbnMgPz8gW10pLCBsaXRlcmFsU2luZ2xlVGlsZGVFeHRlbnNpb25dLFxuXHRcdHNhbml0aXplckNvbmZpZzoge1xuXHRcdFx0cmVwbGFjZVdpdGhQbGFpbnRleHQ6IHRydWUsXG5cdFx0XHRhbGxvd2VkVGFnczoge1xuXHRcdFx0XHRvdmVycmlkZTogYWxsb3dlZENoYXRNYXJrZG93bkh0bWxUYWdzLFxuXHRcdFx0fSxcblx0XHRcdC4uLm9wdGlvbnM/LnNhbml0aXplckNvbmZpZyxcblx0XHRcdGFsbG93ZWRMaW5rU2NoZW1lczogeyBhdWdtZW50OiBbcHJvZHVjdC51cmxQcm90b2NvbCwgJ2NvcGlsb3Qtc2tpbGwnLCBTY2hlbWFzLnZzY29kZUJyb3dzZXIsIEFHRU5UX0hPU1RfU0NIRU1FLCBBR0VOVF9IT1NUX1NFU1NJT05fTElOS19TQ0hFTUVdIH0sXG5cdFx0XHRyZW1vdGVJbWFnZUlzQWxsb3dlZDogX3JlbW90ZUltYWdlRGlzYWxsb3dlZCxcblx0XHR9XG5cdH07XG59XG5cbi8qKlxuICogVGhpcyB3cmFwcyB0aGUgTWFya2Rvd25SZW5kZXJlciBhbmQgYXBwbGllcyBzYW5pdGl6ZXIgb3B0aW9ucyBuZWVkZWQgZm9yIGNoYXQgY29udGVudC5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlciBpbXBsZW1lbnRzIElNYXJrZG93blJlbmRlcmVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIG9wdGlvbnM/OiBNYXJrZG93blJlbmRlck9wdGlvbnMsIG91dEVsZW1lbnQ/OiBIVE1MRWxlbWVudCk6IElSZW5kZXJlZE1hcmtkb3duIHtcblx0XHRjb25zdCBwbGFpblRleHRSZXN1bHQgPSByZW5kZXJQbGFpblRleHRNYXJrZG93bihtYXJrZG93biwgb3V0RWxlbWVudCk7XG5cdFx0aWYgKHBsYWluVGV4dFJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHBsYWluVGV4dFJlc3VsdDtcblx0XHR9XG5cblx0XHRvcHRpb25zID0gZ2V0Q2hhdE1hcmtkb3duUmVuZGVyT3B0aW9ucyhvcHRpb25zKTtcblxuXHRcdGNvbnN0IG1kV2l0aEJvZHk6IElNYXJrZG93blN0cmluZyA9IChtYXJrZG93biAmJiBtYXJrZG93bi5zdXBwb3J0SHRtbCkgP1xuXHRcdFx0e1xuXHRcdFx0XHQuLi5tYXJrZG93bixcblxuXHRcdFx0XHQvLyBkb21wdXJpZnkgdXNlcyBET01QYXJzZXIsIHdoaWNoIHN0cmlwcyBsZWFkaW5nIGNvbW1lbnRzLiBXcmFwcGluZyBpdCBhbGwgaW4gJ2JvZHknIHByZXZlbnRzIHRoaXMuXG5cdFx0XHRcdC8vIFRoZSBcXG5cXG4gcHJldmVudHMgbWFya2VkLmpzIGZyb20gcGFyc2luZyB0aGUgYm9keSBjb250ZW50cyBhcyBqdXN0IHRleHQgaW4gYW4gJ2h0bWwnIHRva2VuLCBpbnN0ZWFkIG9mIGFjdHVhbCBtYXJrZG93bi5cblx0XHRcdFx0dmFsdWU6IGA8Ym9keT5cXG5cXG4ke21hcmtkb3duLnZhbHVlfVxcblxcbjwvYm9keT5gLFxuXHRcdFx0fVxuXHRcdFx0OiBtYXJrZG93bjtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtZFdpdGhCb2R5LCBvcHRpb25zLCBvdXRFbGVtZW50KTtcblxuXHRcdC8vIEluIHNvbWUgY2FzZXMsIHRoZSByZW5kZXJlciBjYW4gcmV0dXJuIHRvcCBsZXZlbCB0ZXh0IG5vZGVzICBidXQgb3VyIENTUyBleHBlY3RzXG5cdFx0Ly8gYWxsIHRleHQgdG8gYmUgaW4gYSA8cD4gZm9yIG1hcmdpbiB0byBiZSBhcHBsaWVkIHByb3Blcmx5LlxuXHRcdC8vIFNvIGp1c3Qgbm9ybWFsaXplIGl0LlxuXHRcdHJlc3VsdC5lbGVtZW50Lm5vcm1hbGl6ZSgpO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgcmVzdWx0LmVsZW1lbnQuY2hpbGROb2Rlcykge1xuXHRcdFx0aWYgKGNoaWxkLm5vZGVUeXBlID09PSBOb2RlLlRFWFRfTk9ERSAmJiBjaGlsZC50ZXh0Q29udGVudD8udHJpbSgpKSB7XG5cdFx0XHRcdGNoaWxkLnJlcGxhY2VXaXRoKCQoJ3AnLCB1bmRlZmluZWQsIGNoaWxkLnRleHRDb250ZW50KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmF0dGFjaEN1c3RvbUhvdmVyKHJlc3VsdCk7XG5cdH1cblxuXHRwcml2YXRlIGF0dGFjaEN1c3RvbUhvdmVyKHJlc3VsdDogSVJlbmRlcmVkTWFya2Rvd24pOiBJUmVuZGVyZWRNYXJrZG93biB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0cmVzdWx0LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCgnYScpLmZvckVhY2goKGVsZW1lbnQpID0+IHtcblx0XHRcdGlmIChlbGVtZW50LnRpdGxlKSB7XG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gZWxlbWVudC50aXRsZTtcblx0XHRcdFx0ZWxlbWVudC50aXRsZSA9ICcnO1xuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgZWxlbWVudCwgdGl0bGUpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50OiByZXN1bHQuZWxlbWVudCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0cmVzdWx0LmRpc3Bvc2UoKTtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFHLGFBQWE7QUFFekIsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBNEIsZ0NBQWdDO0FB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
