import { importAMDNodeModule, resolveAmdNodeModulePath } from "../../../../amdX.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { katexContainerLatexAttributeName, MarkedKatexExtension } from "../common/markedKatexExtension.js";
const _MarkedKatexSupport = class _MarkedKatexSupport {
  static getSanitizerOptions(baseConfig) {
    return {
      allowedTags: {
        override: [
          ...baseConfig.allowedTags,
          ...trustedMathMlTags
        ]
      },
      allowedAttributes: {
        override: [
          ...baseConfig.allowedAttributes,
          // Math
          "stretchy",
          "encoding",
          "accent",
          katexContainerLatexAttributeName,
          // SVG
          "d",
          "viewBox",
          "preserveAspectRatio",
          // Allow all classes since we don't have a list of allowed katex classes
          "class",
          // Sanitize allowed styles for katex
          {
            attributeName: "style",
            shouldKeep: (_el, data) => this.sanitizeKatexStyles(data.attrValue)
          }
        ]
      }
    };
  }
  static sanitizeStyles(styleString, allowedProperties) {
    const style = this.tempSanitizerRule.value;
    style.cssText = styleString;
    const sanitizedProps = [];
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (allowedProperties.includes(prop)) {
        const value = style.getPropertyValue(prop);
        if (/^(([\d\.\-]+\w*\s?)+|\w+)$/.test(value)) {
          sanitizedProps.push(`${prop}: ${value}`);
        }
      }
    }
    return sanitizedProps.join("; ");
  }
  static sanitizeKatexStyles(styleString) {
    const allowedProperties = [
      "display",
      "position",
      "font-family",
      "font-style",
      "font-weight",
      "font-size",
      "height",
      "min-height",
      "max-height",
      "width",
      "min-width",
      "max-width",
      "margin",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "padding",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "top",
      "left",
      "right",
      "bottom",
      "vertical-align",
      "transform",
      "border",
      "border-top-width",
      "border-right-width",
      "border-bottom-width",
      "border-left-width",
      "color",
      "white-space",
      "text-align",
      "line-height",
      "float",
      "clear"
    ];
    return this.sanitizeStyles(styleString, allowedProperties);
  }
  static getExtension(window, options = {}) {
    if (!this._katex) {
      return void 0;
    }
    this.ensureKatexStyles(window);
    return MarkedKatexExtension.extension(this._katex, options);
  }
  static async loadExtension(window, options = {}) {
    const katex = await this._katexPromise.value;
    this.ensureKatexStyles(window);
    return MarkedKatexExtension.extension(katex, options);
  }
  static ensureKatexStyles(window) {
    const doc = window.document;
    if (!doc.querySelector("link.katex")) {
      const katexStyle = document.createElement("link");
      katexStyle.classList.add("katex");
      katexStyle.rel = "stylesheet";
      katexStyle.href = resolveAmdNodeModulePath("katex", "dist/katex.min.css");
      doc.head.appendChild(katexStyle);
    }
  }
};
_MarkedKatexSupport.tempSanitizerRule = new Lazy(() => {
  const styleSheet = new CSSStyleSheet();
  styleSheet.insertRule(`.temp{}`);
  const rule = styleSheet.cssRules[0];
  if (!(rule instanceof CSSStyleRule)) {
    throw new Error("Invalid CSS rule");
  }
  return rule.style;
});
_MarkedKatexSupport._katexPromise = new Lazy(async () => {
  _MarkedKatexSupport._katex = await importAMDNodeModule("katex", "dist/katex.min.js");
  return _MarkedKatexSupport._katex;
});
let MarkedKatexSupport = _MarkedKatexSupport;
const trustedMathMlTags = Object.freeze([
  "semantics",
  "annotation",
  "math",
  "menclose",
  "merror",
  "mfenced",
  "mfrac",
  "mglyph",
  "mi",
  "mlabeledtr",
  "mmultiscripts",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mphantom",
  "mroot",
  "mrow",
  "ms",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msup",
  "msubsup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "munder",
  "munderover",
  "mprescripts",
  // svg tags
  "svg",
  "altglyph",
  "altglyphdef",
  "altglyphitem",
  "circle",
  "clippath",
  "defs",
  "desc",
  "ellipse",
  "filter",
  "font",
  "g",
  "glyph",
  "glyphref",
  "hkern",
  "line",
  "lineargradient",
  "marker",
  "mask",
  "metadata",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialgradient",
  "rect",
  "stop",
  "style",
  "switch",
  "symbol",
  "text",
  "textpath",
  "title",
  "tref",
  "tspan",
  "view",
  "vkern"
]);
export {
  MarkedKatexSupport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtkb3duXFxicm93c2VyXFxtYXJrZWRLYXRleFN1cHBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlLCByZXNvbHZlQW1kTm9kZU1vZHVsZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCAqIGFzIGRvbVNhbml0aXplIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TYW5pdGl6ZS5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blNhbml0aXplckNvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB0eXBlICogYXMgbWFya2VkIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcmtlZC9tYXJrZWQuanMnO1xuaW1wb3J0IHsga2F0ZXhDb250YWluZXJMYXRleEF0dHJpYnV0ZU5hbWUsIE1hcmtlZEthdGV4RXh0ZW5zaW9uIH0gZnJvbSAnLi4vY29tbW9uL21hcmtlZEthdGV4RXh0ZW5zaW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIE1hcmtlZEthdGV4U3VwcG9ydCB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRTYW5pdGl6ZXJPcHRpb25zKGJhc2VDb25maWc6IHtcblx0XHRyZWFkb25seSBhbGxvd2VkVGFnczogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0cmVhZG9ubHkgYWxsb3dlZEF0dHJpYnV0ZXM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nIHwgZG9tU2FuaXRpemUuU2FuaXRpemVBdHRyaWJ1dGVSdWxlPjtcblx0fSk6IE1hcmtkb3duU2FuaXRpemVyQ29uZmlnIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YWxsb3dlZFRhZ3M6IHtcblx0XHRcdFx0b3ZlcnJpZGU6IFtcblx0XHRcdFx0XHQuLi5iYXNlQ29uZmlnLmFsbG93ZWRUYWdzLFxuXHRcdFx0XHRcdC4uLnRydXN0ZWRNYXRoTWxUYWdzLFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0YWxsb3dlZEF0dHJpYnV0ZXM6IHtcblx0XHRcdFx0b3ZlcnJpZGU6IFtcblx0XHRcdFx0XHQuLi5iYXNlQ29uZmlnLmFsbG93ZWRBdHRyaWJ1dGVzLFxuXG5cdFx0XHRcdFx0Ly8gTWF0aFxuXHRcdFx0XHRcdCdzdHJldGNoeScsXG5cdFx0XHRcdFx0J2VuY29kaW5nJyxcblx0XHRcdFx0XHQnYWNjZW50Jyxcblx0XHRcdFx0XHRrYXRleENvbnRhaW5lckxhdGV4QXR0cmlidXRlTmFtZSxcblxuXHRcdFx0XHRcdC8vIFNWR1xuXHRcdFx0XHRcdCdkJyxcblx0XHRcdFx0XHQndmlld0JveCcsXG5cdFx0XHRcdFx0J3ByZXNlcnZlQXNwZWN0UmF0aW8nLFxuXG5cdFx0XHRcdFx0Ly8gQWxsb3cgYWxsIGNsYXNzZXMgc2luY2Ugd2UgZG9uJ3QgaGF2ZSBhIGxpc3Qgb2YgYWxsb3dlZCBrYXRleCBjbGFzc2VzXG5cdFx0XHRcdFx0J2NsYXNzJyxcblxuXHRcdFx0XHRcdC8vIFNhbml0aXplIGFsbG93ZWQgc3R5bGVzIGZvciBrYXRleFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGF0dHJpYnV0ZU5hbWU6ICdzdHlsZScsXG5cdFx0XHRcdFx0XHRzaG91bGRLZWVwOiAoX2VsLCBkYXRhKSA9PiB0aGlzLnNhbml0aXplS2F0ZXhTdHlsZXMoZGF0YS5hdHRyVmFsdWUpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHRlbXBTYW5pdGl6ZXJSdWxlID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdC8vIENyZWF0ZSBhIENTU1N0eWxlRGVjbGFyYXRpb24gb2JqZWN0IHZpYSBhIHN0eWxlIHNoZWV0IHJ1bGVcblx0XHRjb25zdCBzdHlsZVNoZWV0ID0gbmV3IENTU1N0eWxlU2hlZXQoKTtcblx0XHRzdHlsZVNoZWV0Lmluc2VydFJ1bGUoYC50ZW1we31gKTtcblx0XHRjb25zdCBydWxlID0gc3R5bGVTaGVldC5jc3NSdWxlc1swXTtcblx0XHRpZiAoIShydWxlIGluc3RhbmNlb2YgQ1NTU3R5bGVSdWxlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIENTUyBydWxlJyk7XG5cdFx0fVxuXHRcdHJldHVybiBydWxlLnN0eWxlO1xuXHR9KTtcblxuXHRwcml2YXRlIHN0YXRpYyBzYW5pdGl6ZVN0eWxlcyhzdHlsZVN0cmluZzogc3RyaW5nLCBhbGxvd2VkUHJvcGVydGllczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0eWxlID0gdGhpcy50ZW1wU2FuaXRpemVyUnVsZS52YWx1ZTtcblx0XHRzdHlsZS5jc3NUZXh0ID0gc3R5bGVTdHJpbmc7XG5cblx0XHRjb25zdCBzYW5pdGl6ZWRQcm9wcyA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdHlsZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcHJvcCA9IHN0eWxlW2ldO1xuXHRcdFx0aWYgKGFsbG93ZWRQcm9wZXJ0aWVzLmluY2x1ZGVzKHByb3ApKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShwcm9wKTtcblx0XHRcdFx0Ly8gQWxsb3cgdGhyb3VnaCBsaXN0cyBvZiBudW1iZXJzIHdpdGggdW5pdHMgb3IgYmFyZSB3b3JkcyBsaWtlICdibG9jaydcblx0XHRcdFx0Ly8gTWFpbiBnb2FsIGlzIHRvIGJsb2NrIHRoaW5ncyBsaWtlICd1cmwoKScuXG5cdFx0XHRcdGlmICgvXigoW1xcZFxcLlxcLV0rXFx3Klxccz8pK3xcXHcrKSQvLnRlc3QodmFsdWUpKSB7XG5cdFx0XHRcdFx0c2FuaXRpemVkUHJvcHMucHVzaChgJHtwcm9wfTogJHt2YWx1ZX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzYW5pdGl6ZWRQcm9wcy5qb2luKCc7ICcpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgc2FuaXRpemVLYXRleFN0eWxlcyhzdHlsZVN0cmluZzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBhbGxvd2VkUHJvcGVydGllcyA9IFtcblx0XHRcdCdkaXNwbGF5Jyxcblx0XHRcdCdwb3NpdGlvbicsXG5cdFx0XHQnZm9udC1mYW1pbHknLFxuXHRcdFx0J2ZvbnQtc3R5bGUnLFxuXHRcdFx0J2ZvbnQtd2VpZ2h0Jyxcblx0XHRcdCdmb250LXNpemUnLFxuXHRcdFx0J2hlaWdodCcsXG5cdFx0XHQnbWluLWhlaWdodCcsXG5cdFx0XHQnbWF4LWhlaWdodCcsXG5cdFx0XHQnd2lkdGgnLFxuXHRcdFx0J21pbi13aWR0aCcsXG5cdFx0XHQnbWF4LXdpZHRoJyxcblx0XHRcdCdtYXJnaW4nLFxuXHRcdFx0J21hcmdpbi10b3AnLFxuXHRcdFx0J21hcmdpbi1yaWdodCcsXG5cdFx0XHQnbWFyZ2luLWJvdHRvbScsXG5cdFx0XHQnbWFyZ2luLWxlZnQnLFxuXHRcdFx0J3BhZGRpbmcnLFxuXHRcdFx0J3BhZGRpbmctdG9wJyxcblx0XHRcdCdwYWRkaW5nLXJpZ2h0Jyxcblx0XHRcdCdwYWRkaW5nLWJvdHRvbScsXG5cdFx0XHQncGFkZGluZy1sZWZ0Jyxcblx0XHRcdCd0b3AnLFxuXHRcdFx0J2xlZnQnLFxuXHRcdFx0J3JpZ2h0Jyxcblx0XHRcdCdib3R0b20nLFxuXHRcdFx0J3ZlcnRpY2FsLWFsaWduJyxcblx0XHRcdCd0cmFuc2Zvcm0nLFxuXHRcdFx0J2JvcmRlcicsXG5cdFx0XHQnYm9yZGVyLXRvcC13aWR0aCcsXG5cdFx0XHQnYm9yZGVyLXJpZ2h0LXdpZHRoJyxcblx0XHRcdCdib3JkZXItYm90dG9tLXdpZHRoJyxcblx0XHRcdCdib3JkZXItbGVmdC13aWR0aCcsXG5cdFx0XHQnY29sb3InLFxuXHRcdFx0J3doaXRlLXNwYWNlJyxcblx0XHRcdCd0ZXh0LWFsaWduJyxcblx0XHRcdCdsaW5lLWhlaWdodCcsXG5cdFx0XHQnZmxvYXQnLFxuXHRcdFx0J2NsZWFyJyxcblx0XHRdO1xuXHRcdHJldHVybiB0aGlzLnNhbml0aXplU3R5bGVzKHN0eWxlU3RyaW5nLCBhbGxvd2VkUHJvcGVydGllcyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfa2F0ZXg/OiB0eXBlb2YgaW1wb3J0KCdrYXRleCcpLmRlZmF1bHQ7XG5cdHByaXZhdGUgc3RhdGljIF9rYXRleFByb21pc2UgPSBuZXcgTGF6eShhc3luYyAoKSA9PiB7XG5cdFx0dGhpcy5fa2F0ZXggPSBhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ2thdGV4JykuZGVmYXVsdD4oJ2thdGV4JywgJ2Rpc3Qva2F0ZXgubWluLmpzJyk7XG5cdFx0cmV0dXJuIHRoaXMuX2thdGV4O1xuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIGdldEV4dGVuc2lvbih3aW5kb3c6IENvZGVXaW5kb3csIG9wdGlvbnM6IE1hcmtlZEthdGV4RXh0ZW5zaW9uLk1hcmtlZEthdGV4T3B0aW9ucyA9IHt9KTogbWFya2VkLk1hcmtlZEV4dGVuc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9rYXRleCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLmVuc3VyZUthdGV4U3R5bGVzKHdpbmRvdyk7XG5cdFx0cmV0dXJuIE1hcmtlZEthdGV4RXh0ZW5zaW9uLmV4dGVuc2lvbih0aGlzLl9rYXRleCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGFzeW5jIGxvYWRFeHRlbnNpb24od2luZG93OiBDb2RlV2luZG93LCBvcHRpb25zOiBNYXJrZWRLYXRleEV4dGVuc2lvbi5NYXJrZWRLYXRleE9wdGlvbnMgPSB7fSk6IFByb21pc2U8bWFya2VkLk1hcmtlZEV4dGVuc2lvbj4ge1xuXHRcdGNvbnN0IGthdGV4ID0gYXdhaXQgdGhpcy5fa2F0ZXhQcm9taXNlLnZhbHVlO1xuXHRcdHRoaXMuZW5zdXJlS2F0ZXhTdHlsZXMod2luZG93KTtcblx0XHRyZXR1cm4gTWFya2VkS2F0ZXhFeHRlbnNpb24uZXh0ZW5zaW9uKGthdGV4LCBvcHRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZW5zdXJlS2F0ZXhTdHlsZXMod2luZG93OiBDb2RlV2luZG93KSB7XG5cdFx0Y29uc3QgZG9jID0gd2luZG93LmRvY3VtZW50O1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGlmICghZG9jLnF1ZXJ5U2VsZWN0b3IoJ2xpbmsua2F0ZXgnKSkge1xuXHRcdFx0Y29uc3Qga2F0ZXhTdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpbmsnKTtcblx0XHRcdGthdGV4U3R5bGUuY2xhc3NMaXN0LmFkZCgna2F0ZXgnKTtcblx0XHRcdGthdGV4U3R5bGUucmVsID0gJ3N0eWxlc2hlZXQnO1xuXHRcdFx0a2F0ZXhTdHlsZS5ocmVmID0gcmVzb2x2ZUFtZE5vZGVNb2R1bGVQYXRoKCdrYXRleCcsICdkaXN0L2thdGV4Lm1pbi5jc3MnKTtcblx0XHRcdGRvYy5oZWFkLmFwcGVuZENoaWxkKGthdGV4U3R5bGUpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCB0cnVzdGVkTWF0aE1sVGFncyA9IE9iamVjdC5mcmVlemUoW1xuXHQnc2VtYW50aWNzJyxcblx0J2Fubm90YXRpb24nLFxuXHQnbWF0aCcsXG5cdCdtZW5jbG9zZScsXG5cdCdtZXJyb3InLFxuXHQnbWZlbmNlZCcsXG5cdCdtZnJhYycsXG5cdCdtZ2x5cGgnLFxuXHQnbWknLFxuXHQnbWxhYmVsZWR0cicsXG5cdCdtbXVsdGlzY3JpcHRzJyxcblx0J21uJyxcblx0J21vJyxcblx0J21vdmVyJyxcblx0J21wYWRkZWQnLFxuXHQnbXBoYW50b20nLFxuXHQnbXJvb3QnLFxuXHQnbXJvdycsXG5cdCdtcycsXG5cdCdtc3BhY2UnLFxuXHQnbXNxcnQnLFxuXHQnbXN0eWxlJyxcblx0J21zdWInLFxuXHQnbXN1cCcsXG5cdCdtc3Vic3VwJyxcblx0J210YWJsZScsXG5cdCdtdGQnLFxuXHQnbXRleHQnLFxuXHQnbXRyJyxcblx0J211bmRlcicsXG5cdCdtdW5kZXJvdmVyJyxcblx0J21wcmVzY3JpcHRzJyxcblxuXHQvLyBzdmcgdGFnc1xuXHQnc3ZnJyxcblx0J2FsdGdseXBoJyxcblx0J2FsdGdseXBoZGVmJyxcblx0J2FsdGdseXBoaXRlbScsXG5cdCdjaXJjbGUnLFxuXHQnY2xpcHBhdGgnLFxuXHQnZGVmcycsXG5cdCdkZXNjJyxcblx0J2VsbGlwc2UnLFxuXHQnZmlsdGVyJyxcblx0J2ZvbnQnLFxuXHQnZycsXG5cdCdnbHlwaCcsXG5cdCdnbHlwaHJlZicsXG5cdCdoa2VybicsXG5cdCdsaW5lJyxcblx0J2xpbmVhcmdyYWRpZW50Jyxcblx0J21hcmtlcicsXG5cdCdtYXNrJyxcblx0J21ldGFkYXRhJyxcblx0J21wYXRoJyxcblx0J3BhdGgnLFxuXHQncGF0dGVybicsXG5cdCdwb2x5Z29uJyxcblx0J3BvbHlsaW5lJyxcblx0J3JhZGlhbGdyYWRpZW50Jyxcblx0J3JlY3QnLFxuXHQnc3RvcCcsXG5cdCdzdHlsZScsXG5cdCdzd2l0Y2gnLFxuXHQnc3ltYm9sJyxcblx0J3RleHQnLFxuXHQndGV4dHBhdGgnLFxuXHQndGl0bGUnLFxuXHQndHJlZicsXG5cdCd0c3BhbicsXG5cdCd2aWV3Jyxcblx0J3ZrZXJuJyxcbl0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHFCQUFxQixnQ0FBZ0M7QUFJOUQsU0FBUyxZQUFZO0FBRXJCLFNBQVMsa0NBQWtDLDRCQUE0QjtBQUVoRSxNQUFNLHNCQUFOLE1BQU0sb0JBQW1CO0FBQUEsRUFFL0IsT0FBYyxvQkFBb0IsWUFHTjtBQUMzQixXQUFPO0FBQUEsTUFDTixhQUFhO0FBQUEsUUFDWixVQUFVO0FBQUEsVUFDVCxHQUFHLFdBQVc7QUFBQSxVQUNkLEdBQUc7QUFBQSxRQUNKO0FBQUEsTUFDRDtBQUFBLE1BQ0EsbUJBQW1CO0FBQUEsUUFDbEIsVUFBVTtBQUFBLFVBQ1QsR0FBRyxXQUFXO0FBQUE7QUFBQSxVQUdkO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUE7QUFBQSxVQUdBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQTtBQUFBLFVBR0E7QUFBQTtBQUFBLFVBR0E7QUFBQSxZQUNDLGVBQWU7QUFBQSxZQUNmLFlBQVksQ0FBQyxLQUFLLFNBQVMsS0FBSyxvQkFBb0IsS0FBSyxTQUFTO0FBQUEsVUFDbkU7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFhQSxPQUFlLGVBQWUsYUFBcUIsbUJBQThDO0FBQ2hHLFVBQU0sUUFBUSxLQUFLLGtCQUFrQjtBQUNyQyxVQUFNLFVBQVU7QUFFaEIsVUFBTSxpQkFBaUIsQ0FBQztBQUV4QixhQUFTLElBQUksR0FBRyxJQUFJLE1B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QTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQTtBQUFBLEVBR0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
